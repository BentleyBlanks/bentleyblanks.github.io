// 《台儿庄：血战滕县》分层地形材质：splat 权重 + 高度混合 + 远近两套平铺 + 宏观变化
// + 双采样去重复 + 距离法线淡出 + 陡坡侧投影。
//
// 口径与验收：docs/Data_TerrainLayers.md。数值：Data_Tuning_Terrain.mjs。
//
// ## 与 3A 实现的对应
//
// | 这里 | 对标 | 有意的近似 |
// |---|---|---|
// | 顶点 splat 权重 + 高度混合 | UE Landscape Layer Blend（Height Blend）/ Unity TerrainLit | 权重存顶点（0.75 m 一格足够），不用 splat 贴图，省一个采样器 |
// | 纹理数组 | Far Cry 5 / HDRP 地形的 Texture2DArray | 两张数组替掉原来的 map / normalMap / roughnessMap，采样器反而少一个 |
// | 远近两套平铺 | UE 的 Distance Blend（「macro/micro UV」） | 远景只采一次，不做去重复 |
// | 宏观变化 | UE Landscape 的 Macro Variation | 三档值噪声代替一张宏观贴图（零采样器） |
// | 去重复 | Quilez「Texture Repetition」第三法：按低频噪声切整数偏移，交界两份交叉淡化 | 交叉淡化走方差保持混合（Heitz & Neyret 2018），不按高度挑 |
// | 陡坡 | Biplanar（Quilez）/ 三平面 UDN 法线（Golus 2017） | 只取俯视 + 主导侧面两路，且只在近处 |
//
// ## 接进补丁注册表的方式（改之前先读）
//
// 这是注册表的**表面补丁**（`IndirectLightingPatches` 的 `surface` 槽，排在 ORM 那一路的
// 位置、所有补丁之前）。材质本身**不挂** map / normalMap / roughnessMap —— 反照率、法线、
// 粗糙度、材质 AO 全由这里写：
//   `<map_fragment>`          一次把全部图层算完，写 diffuseColor 与几个全局量
//   `<roughnessmap_fragment>` roughnessFactor
//   `<normal_fragment_maps>`  normal（视空间）
//   `<aomap_fragment>`        材质自带遮蔽压间接光（与 ORM 补丁同一口径、同一位置）
// 同时声明并写好 `gMaterialAo`，材质着色那一路的微阴影照常读它。
//
// 每个锚点后面留一个 `SurfacePatchEnd(anchor)` 标记：砸坑地表（Script_TerrainDeformationView
// 的 ConfigureCraterSurface）自己做字符串替换，它按标记把代码插在本补丁**之后** ——
// 否则它先把坑里的粗糙度/法线改好，紧接着被这里整值覆盖掉。

import * as THREE from "three";
import { MakePatch, SurfacePatchEnd } from "./Script_MaterialPatches.mjs";
import {
  TERRAIN_SETS, TERRAIN_DISTANCE, TERRAIN_MACRO, TERRAIN_STUBBLE, TERRAIN_BLEND,
  TERRAIN_AO_INTENSITY, TerrainLayerUrls, TerrainQualityOf,
} from "./Data_Tuning_Terrain.mjs";

const SRGB_TO_LINEAR = (() => {
  const table = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const c = i / 255;
    table[i] = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }
  return table;
})();

/**
 * 下一张图并解码。**必须带超时**（理由同 MaterialLibrary._LoadExternalImage：
 * 连接挂住时既不 load 也不 error，开机那一步会永远等下去）。
 * `colorSpaceConversion: "none"`：法线与 Orh 是数据，不许按显示器色彩空间转换。
 */
async function LoadBitmap(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error("HTTP " + response.status + ": " + url);
    const blob = await response.blob();
    return await createImageBitmap(blob, { premultiplyAlpha: "none", colorSpaceConversion: "none" });
  } finally {
    clearTimeout(timer);
  }
}

/** 按指定边长画一遍取 RGBA 字节（尺寸不同就双线性缩放）。 */
function PixelsOf(bitmap, size) {
  const canvas = typeof OffscreenCanvas !== "undefined"
    ? new OffscreenCanvas(size, size)
    : Object.assign(document.createElement("canvas"), { width: size, height: size });
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(bitmap, 0, 0, size, size);
  return context.getImageData(0, 0, size, size).data;
}

function MakeArrayTexture(data, size, layers, srgb, anisotropy) {
  const texture = new THREE.DataArrayTexture(data, size, size, layers);
  texture.format = THREE.RGBAFormat;
  texture.type = THREE.UnsignedByteType;
  texture.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = anisotropy;
  texture.flipY = false;
  texture.unpackAlignment = 1;
  texture.needsUpdate = true;
  // 上传完就把 CPU 那份放掉（两张数组合计 20 MB 上下）。three 只在 needsUpdate 时读 data。
  texture.onUpdate = () => { texture.image.data = null; };
  return texture;
}

/**
 * 下载并打包一套地形图层。
 *
 * 两张纹理数组：
 *   albedo  (SRGB8_ALPHA8)  rgb = 反照率，a = 高度（Orh.b 放大到反照率分辨率）
 *   surface (RGBA8)         r,g = 切线空间法线 xy，b = 粗糙度，a = 材质 AO
 * 顺带算每层的**线性空间**均值（方差保持混合要用）。
 *
 * @returns {Promise<{setName, albedo, surface, albedoMean: Float32Array, surfaceMean: Float32Array, bytes: number}>}
 */
export async function LoadTerrainLayers(setName, { anisotropy = 1, timeoutMs = 45000 } = {}) {
  const set = TERRAIN_SETS[setName];
  if (!set) throw new Error(`Unknown terrain set: ${setName}`);
  const urls = TerrainLayerUrls(setName);
  const layers = urls.length, size = set.textureSize, dataSize = size / 2;
  const bitmaps = await Promise.all(urls.map((u) => Promise.all([
    LoadBitmap(u.base, timeoutMs), LoadBitmap(u.normal, timeoutMs), LoadBitmap(u.orh, timeoutMs),
  ])));
  const bases = bitmaps.map(([base]) => PixelsOf(base, size));
  const normals = bitmaps.map(([, normal]) => PixelsOf(normal, dataSize));
  const orhs = bitmaps.map(([, , orh]) => PixelsOf(orh, dataSize));
  // 高度要跟反照率同分辨率进同一张数组：Orh 再按反照率尺寸画一遍（双线性放大）。
  const heights = bitmaps.map(([, , orh]) => PixelsOf(orh, size));
  for (const set of bitmaps) for (const bitmap of set) bitmap.close?.();
  const albedoData = new Uint8Array(size * size * 4 * layers);
  const surfaceData = new Uint8Array(dataSize * dataSize * 4 * layers);
  const albedoMean = new Float32Array(4 * layers), surfaceMean = new Float32Array(4 * layers);
  for (let layer = 0; layer < layers; layer++) {
    const base = bases[layer], height = heights[layer];
    const offset = size * size * 4 * layer;
    let r = 0, g = 0, b = 0, h = 0;
    for (let i = 0, n = size * size; i < n; i++) {
      const src = i * 4, dst = offset + src;
      albedoData[dst] = base[src]; albedoData[dst + 1] = base[src + 1]; albedoData[dst + 2] = base[src + 2];
      albedoData[dst + 3] = height[src + 2];
      r += SRGB_TO_LINEAR[base[src]]; g += SRGB_TO_LINEAR[base[src + 1]]; b += SRGB_TO_LINEAR[base[src + 2]];
      h += height[src + 2];
    }
    const count = size * size;
    albedoMean.set([r / count, g / count, b / count, h / count / 255], layer * 4);
    const normal = normals[layer], orh = orhs[layer];
    const dataOffset = dataSize * dataSize * 4 * layer;
    let nx = 0, ny = 0, rough = 0, ao = 0;
    for (let i = 0, n = dataSize * dataSize; i < n; i++) {
      const src = i * 4, dst = dataOffset + src;
      surfaceData[dst] = normal[src]; surfaceData[dst + 1] = normal[src + 1];
      surfaceData[dst + 2] = orh[src + 1]; surfaceData[dst + 3] = orh[src];
      nx += normal[src]; ny += normal[src + 1]; rough += orh[src + 1]; ao += orh[src];
    }
    const dataCount = dataSize * dataSize * 255;
    surfaceMean.set([nx / dataCount, ny / dataCount, rough / dataCount, ao / dataCount], layer * 4);
  }
  return {
    setName,
    albedo: MakeArrayTexture(albedoData, size, layers, true, anisotropy),
    surface: MakeArrayTexture(surfaceData, dataSize, layers, false, anisotropy),
    albedoMean,
    surfaceMean,
    size,
    dataSize,
    layers,
  };
}

/** 释放一套已加载的地形纹理。 */
export function DisposeTerrainLayers(pack) {
  pack?.albedo?.dispose();
  pack?.surface?.dispose();
}

/** 地形调试视图的全场 uniform（0 关；取值见 Data_Tuning_Terrain.TERRAIN_DEBUG_VIEWS）。 */
export const TERRAIN_DEBUG_UNIFORM = { value: 0 };

function Vec4Of(values) { return new THREE.Vector4(values[0], values[1], values[2], values[3]); }

function MeansOf(array) {
  const out = [];
  for (let i = 0; i < array.length; i += 4) out.push(new THREE.Vector4(array[i], array[i + 1], array[i + 2], array[i + 3]));
  return out;
}

// ===========================================================================
// GLSL
// ===========================================================================

const GLSL_VERTEX_COMMON = /* glsl */`
attribute vec3 terrainLayers;
varying vec3 vTerrainLayers;
varying vec3 vTerrainWorld;`;

const GLSL_VERTEX_WORLD = /* glsl */`
vTerrainLayers = terrainLayers;
vTerrainWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;`;

function GlslCommon(quality) {
  return /* glsl */`
#define TERRAIN_LAYERS 4
${quality.antiTile ? "#define TERRAIN_ANTI_TILE" : ""}
${quality.biplanar ? "#define TERRAIN_BIPLANAR" : ""}
uniform sampler2DArray uTerrainAlbedo;    // rgb 反照率（sRGB 存储，采样即线性），a 高度
uniform sampler2DArray uTerrainSurface;   // rg 法线 xy，b 粗糙度，a 材质 AO
uniform vec4 uTerrainTileNear;            // 每层 1/近景平铺米数
uniform vec4 uTerrainTileFar;             // 每层 1/远景平铺米数
uniform vec4 uTerrainNormalScale;
uniform vec4 uTerrainHeightOffset;
uniform vec4 uTerrainAlbedoMean[TERRAIN_LAYERS];  // 线性反照率均值 + 高度均值
uniform vec4 uTerrainSurfaceMean[TERRAIN_LAYERS];
uniform vec4 uTerrainDistance;            // x 远景起 y 远景满 z 法线淡出起 w 法线淡出满
uniform vec4 uTerrainFade;                // x 远处法线倍率 y 远处 AO 保留 z 侧投影距离 w AO 强度
uniform vec4 uTerrainMacroScale;          // xyz 三档 1/米，w 色温幅度
uniform vec4 uTerrainMacroAmp;            // xyz 三档亮度幅度，w 湿斑幅度
uniform vec4 uTerrainStubble;             // x 1/主尺度 y 1/碎边尺度 z 阈值起 w 阈值满
uniform vec3 uTerrainBlend;               // x 高度混合厚度 y 1/去重复尺度 z 偏移档数
uniform vec3 uTerrainContrast;            // x 对比度淡出起 y 淡出满 z 远处对比度倍率
uniform float uTerrainAlbedoScale;        // 整套反照率的亮度标定（Data_Tuning_Terrain.albedoScale）
uniform float uTerrainDebug;              // Data_Tuning_Terrain.TERRAIN_DEBUG_VIEWS：0 关
varying vec3 vTerrainLayers;
varying vec3 vTerrainWorld;

// 材质自带遮蔽（未乘强度）。微阴影（Script_MaterialShading）在 <lights_fragment_end> 读它。
float gMaterialAo = 1.0;
float gTerrainRough = 1.0;
vec4 gTerrainWeights = vec4(1.0, 0.0, 0.0, 0.0);
vec3 gTerrainAlbedo = vec3(0.0);
vec3 gTerrainNormalW = vec3(0.0, 1.0, 0.0);

float TerrainHash(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}
float TerrainNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(TerrainHash(i), TerrainHash(i + vec2(1.0, 0.0)), f.x),
             mix(TerrainHash(i + vec2(0.0, 1.0)), TerrainHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
// 方差保持混合：两份不相关的纹理线性平均会把对比度压到 1/√2，交界处成一块块发糊的斑。
vec4 TerrainVpMix(vec4 a, vec4 b, float t, vec4 mean) {
  float s = inversesqrt(max((1.0 - t) * (1.0 - t) + t * t, 0.5));
  return mean + ((a - mean) * (1.0 - t) + (b - mean) * t) * s;
}

// 一层、一种投影的采样。uv 以米给，内部乘 1/平铺。variant = 去重复噪声（全层共用）。
// 层号与均值都当参数传：着色器里**不许**按变量下标取向量分量 / uniform 数组 ——
// ANGLE-D3D11 把那种写法模拟成函数调用（编译日志 "dynamic indexing ... emulated"）。
void TerrainLayerSample(float layer, vec2 meters, vec2 dxM, vec2 dyM, float inv, float variant,
                        vec4 albedoMean, vec4 surfaceMean, out vec4 albedo, out vec4 surface) {
  vec2 uv = meters * inv, dx = dxM * inv, dy = dyM * inv;
  vec3 at = vec3(uv, layer);
#ifdef TERRAIN_ANTI_TILE
  float band = floor(variant), f = fract(variant);
  float t = smoothstep(0.3, 0.7, f);
  float salt = layer * 17.0;
  vec2 offA = sin(vec2(3.0, 7.0) * (band + salt));
  vec2 offB = sin(vec2(3.0, 7.0) * (band + 1.0 + salt));
  if (t < 0.002) {
    albedo = textureGrad(uTerrainAlbedo, at + vec3(offA, 0.0), dx, dy);
    surface = textureGrad(uTerrainSurface, at + vec3(offA, 0.0), dx, dy);
  } else if (t > 0.998) {
    albedo = textureGrad(uTerrainAlbedo, at + vec3(offB, 0.0), dx, dy);
    surface = textureGrad(uTerrainSurface, at + vec3(offB, 0.0), dx, dy);
  } else {
    albedo = TerrainVpMix(textureGrad(uTerrainAlbedo, at + vec3(offA, 0.0), dx, dy),
      textureGrad(uTerrainAlbedo, at + vec3(offB, 0.0), dx, dy), t, albedoMean);
    surface = TerrainVpMix(textureGrad(uTerrainSurface, at + vec3(offA, 0.0), dx, dy),
      textureGrad(uTerrainSurface, at + vec3(offB, 0.0), dx, dy), t, surfaceMean);
  }
#else
  albedo = textureGrad(uTerrainAlbedo, at, dx, dy);
  surface = textureGrad(uTerrainSurface, at, dx, dy);
#endif
}`;
}

const LAYER_COUNT = 4;
const COMPONENTS = ["x", "y", "z", "w"];
/** 按层展开一段 GLSL（常量下标）。 */
const PerLayer = (fn, joiner = "\n") => COMPONENTS.slice(0, LAYER_COUNT).map((c, i) => fn(c, i)).join(joiner);

/**
 * `<map_fragment>`：一次算完。四层的代码由 JS 展开成常量下标（见 TerrainLayerSample 的注释）。
 *
 * 屏幕导数一律在分支外求（非一致控制流里取 dFdx 是未定义行为，见 Script_MaterialShading
 * 的 POM 注释）；分支里只用 textureGrad。
 */
const GLSL_EVALUATE = /* glsl */`
{
  vec3 tw = vTerrainWorld;
  vec3 twDx = dFdx(tw), twDy = dFdy(tw);
  float tDist = length(vViewPosition);
  // 世界空间几何法线（视矩阵的旋转部分是正交的，转置即逆）。
  vec3 tGeomN = normalize(transpose(mat3(viewMatrix)) * normalize(vNormal));

  // --- 1. 权重：顶点给的三路 + 宏观噪声决定的草茬 --------------------------------
  vec3 tl = clamp(vTerrainLayers, 0.0, 1.0);
  float wTrack = tl.r;
  float wSpoil = tl.g * (1.0 - wTrack);
  float wRest = max(0.0, 1.0 - wTrack - wSpoil);
  vec2 txz = tw.xz;
  float stubbleNoise = TerrainNoise(txz * uTerrainStubble.x) * 0.62
    + TerrainNoise(txz * uTerrainStubble.x * 2.63 + 11.3) * 0.23
    + TerrainNoise(txz * uTerrainStubble.y + 5.1) * 0.15;
  float stubble = tl.b * smoothstep(uTerrainStubble.z, uTerrainStubble.w, stubbleNoise);
  vec4 tW = vec4(wRest * (1.0 - stubble), wTrack, wRest * stubble, wSpoil);

  // --- 2. 逐层采样（近景去重复 / 远景单次，按距离方差保持混合）---------------------
  float farT = smoothstep(uTerrainDistance.x, uTerrainDistance.y, tDist);
  float variant = TerrainNoise(txz * uTerrainBlend.y) * uTerrainBlend.z;
  vec4 tH = vec4(0.0);
${PerLayer((c, i) => `  vec4 tAlb${i} = uTerrainAlbedoMean[${i}];
  vec4 tSurf${i} = uTerrainSurfaceMean[${i}];
  if (tW.${c} >= 0.004) {
    if (farT < 0.999) TerrainLayerSample(${i}.0, txz, twDx.xz, twDy.xz, uTerrainTileNear.${c}, variant,
      uTerrainAlbedoMean[${i}], uTerrainSurfaceMean[${i}], tAlb${i}, tSurf${i});
    if (farT > 0.001) {
      float inv = uTerrainTileFar.${c};
      vec3 at = vec3(txz * inv, ${i}.0);
      vec4 farA = textureGrad(uTerrainAlbedo, at, twDx.xz * inv, twDy.xz * inv);
      vec4 farS = textureGrad(uTerrainSurface, at, twDx.xz * inv, twDy.xz * inv);
      tAlb${i} = farT >= 0.999 ? farA : TerrainVpMix(tAlb${i}, farA, farT, uTerrainAlbedoMean[${i}]);
      tSurf${i} = farT >= 0.999 ? farS : TerrainVpMix(tSurf${i}, farS, farT, uTerrainSurfaceMean[${i}]);
    }
    tH.${c} = clamp(tAlb${i}.a, 0.0, 1.0) + uTerrainHeightOffset.${c};
  }`)}

  // --- 3. 高度混合（UE Height Lerp / Unity TerrainLit 同式）------------------------
  vec4 tMask = step(vec4(0.004), tW);
  vec4 tHw = (tH + tW) * tMask;
  float tTop = max(max(tHw.x, tHw.y), max(tHw.z, tHw.w)) - uTerrainBlend.x;
  vec4 tB = max(tHw - tTop, 0.0) * tMask;
  tB /= max(dot(tB, vec4(1.0)), 1e-4);
  gTerrainWeights = tB;

  vec3 tAlbedo = ${PerLayer((c, i) => `tAlb${i}.rgb * tB.${c}`, " + ")};
  vec4 tSurface = ${PerLayer((c, i) => `tSurf${i} * tB.${c}`, " + ")};
  vec2 tNxy = ${PerLayer((c, i) => `(tSurf${i}.rg * 2.0 - 1.0) * (uTerrainNormalScale.${c} * tB.${c})`, "\n    + ")};
  vec3 tPerturb = vec3(tNxy.x, 0.0, tNxy.y);

#ifdef TERRAIN_BIPLANAR
  // --- 4. 陡坡：主导侧面投影（沟壁不再被俯视投影拉成竖条）--------------------------
  vec3 tAbsN = abs(tGeomN);
  float sideT = (1.0 - smoothstep(0.5, 0.78, tAbsN.y))
    * (1.0 - smoothstep(uTerrainFade.z * 0.75, uTerrainFade.z, tDist));
  if (sideT > 0.004) {
    bool alongX = tAbsN.x > tAbsN.z;
    vec2 sm = alongX ? vec2(tw.z, -tw.y) : vec2(tw.x, -tw.y);
    vec2 sdx = alongX ? vec2(twDx.z, -twDx.y) : vec2(twDx.x, -twDx.y);
    vec2 sdy = alongX ? vec2(twDy.z, -twDy.y) : vec2(twDy.x, -twDy.y);
    vec3 sAlbedo = vec3(0.0);
    vec4 sSurface = vec4(0.0);
    vec2 sNxy = vec2(0.0);
    vec4 sa, ss;
${PerLayer((c, i) => `    if (tB.${c} > 0.0) {
      TerrainLayerSample(${i}.0, sm, sdx, sdy, uTerrainTileNear.${c}, variant,
        uTerrainAlbedoMean[${i}], uTerrainSurfaceMean[${i}], sa, ss);
      sAlbedo += sa.rgb * tB.${c};
      sSurface += ss * tB.${c};
      sNxy += (ss.rg * 2.0 - 1.0) * (uTerrainNormalScale.${c} * tB.${c});
    }`)}
    tAlbedo = mix(tAlbedo, sAlbedo, sideT);
    tSurface = mix(tSurface, sSurface, sideT);
    // 侧面的 u = 世界 z（或 x）、v = 世界 -y：扰动 = n.x 沿 u、n.y 沿 v。
    vec3 sidePerturb = alongX ? vec3(0.0, -sNxy.y, sNxy.x) : vec3(sNxy.x, -sNxy.y, 0.0);
    tPerturb = mix(tPerturb, sidePerturb, sideT);
  }
#endif

  // --- 4b. 远处对比度淡出：高频明暗往混合均值收（均值不变）-----------------------------
  vec3 tMeanAlbedo = uTerrainAlbedoMean[0].rgb * tB.x + uTerrainAlbedoMean[1].rgb * tB.y
    + uTerrainAlbedoMean[2].rgb * tB.z + uTerrainAlbedoMean[3].rgb * tB.w;
  float tContrast = mix(1.0, uTerrainContrast.z, smoothstep(uTerrainContrast.x, uTerrainContrast.y, tDist));
  tAlbedo = tMeanAlbedo + (tAlbedo - tMeanAlbedo) * tContrast;

  // --- 5. 宏观变化 ----------------------------------------------------------------
  float m0 = TerrainNoise(txz * uTerrainMacroScale.x + 3.7) - 0.5;
  float m1 = TerrainNoise(txz * uTerrainMacroScale.y + 17.31) - 0.5;
  float m2 = TerrainNoise(txz * uTerrainMacroScale.z + 41.7) - 0.5;
  gTerrainAlbedo = tAlbedo;
  tAlbedo *= 1.0 + 2.0 * (m0 * uTerrainMacroAmp.x + m1 * uTerrainMacroAmp.y + m2 * uTerrainMacroAmp.z);
  tAlbedo *= 1.0 + vec3(0.9, 0.25, -0.8) * m2 * 2.0 * uTerrainMacroScale.w;
  float damp = smoothstep(0.12, 0.42, m1) * uTerrainMacroAmp.w;
  tAlbedo *= 1.0 - damp * 1.4;

  // --- 6. 写出 ----------------------------------------------------------------------
  diffuseColor.rgb *= max(tAlbedo, vec3(0.0)) * uTerrainAlbedoScale;
  // 远处法线淡出：一个像素盖住几十个纹素，法线的方差该表现成粗糙度，而不是一粒粒高光。
  float nFade = mix(1.0, uTerrainFade.x, smoothstep(uTerrainDistance.z, uTerrainDistance.w, tDist));
  tPerturb *= nFade;
  tPerturb -= tGeomN * dot(tGeomN, tPerturb);
  gTerrainNormalW = normalize(tGeomN + tPerturb);
  gTerrainRough = clamp(tSurface.b - damp, 0.3, 1.0);
  float tAo = clamp(tSurface.a, 0.0, 1.0);
  gMaterialAo = mix(tAo, 1.0 - (1.0 - tAo) * uTerrainFade.y, farT);
}`;

// 调试假彩色（Data_Tuning_Terrain.TERRAIN_DEBUG_VIEWS），整帧覆盖输出。
const GLSL_DEBUG = /* glsl */`
if (uTerrainDebug > 0.5) {
  vec3 terrainDebug;
  if (uTerrainDebug < 1.5) {
    // 权重：红 = 车道，绿 = 草茬，蓝 = 翻土，灰 = 底土
    terrainDebug = vec3(gTerrainWeights.y, gTerrainWeights.z, gTerrainWeights.w) + gTerrainWeights.x * 0.35;
  } else if (uTerrainDebug < 2.5) {
    terrainDebug = gTerrainAlbedo;
  } else {
    terrainDebug = gTerrainNormalW * 0.5 + 0.5;
  }
  gl_FragColor = vec4(terrainDebug, 1.0);
}`;

const GLSL_ROUGHNESS = /* glsl */`
roughnessFactor = gTerrainRough * roughness;`;

const GLSL_NORMAL = /* glsl */`
normal = normalize(mat3(viewMatrix) * gTerrainNormalW);`;

// 与 MakeOrmPatch 的 <aomap_fragment> 同一口径（材质 AO 只压间接光，排在 GTAO 之前）。
const GLSL_AO = /* glsl */`
{
  float terrainAo = (gMaterialAo - 1.0) * uTerrainFade.w + 1.0;
  reflectedLight.indirectDiffuse *= terrainAo;
  #if defined( USE_ENVMAP ) && defined( STANDARD )
    float terrainDotNV = saturate(dot(geometryNormal, geometryViewDir));
    reflectedLight.indirectSpecular *= computeSpecularOcclusion(terrainDotNV, terrainAo, material.roughness);
  #endif
  gMaterialAo = terrainAo;
}`;

function Ended(anchor, glsl) { return `${glsl}\n${SurfacePatchEnd(anchor)}`; }

/**
 * 造分层地形的表面补丁。
 * @param {object} pack LoadTerrainLayers() 的返回值
 * @param {{antiTile:boolean, biplanar:boolean}} quality TerrainQualityOf(档位)
 */
export function MakeTerrainPatch(pack, quality) {
  const set = TERRAIN_SETS[pack.setName];
  const layers = set.layers;
  const PerLayer = (fn) => new THREE.Vector4(...layers.map(fn));
  const uniforms = {
    uTerrainAlbedo: { value: pack.albedo },
    uTerrainSurface: { value: pack.surface },
    uTerrainTileNear: { value: PerLayer((l) => 1 / l.tileM) },
    uTerrainTileFar: { value: PerLayer((l) => 1 / l.farTileM) },
    uTerrainNormalScale: { value: PerLayer((l) => l.normalScale) },
    uTerrainHeightOffset: { value: PerLayer((l) => l.heightOffset) },
    uTerrainAlbedoMean: { value: MeansOf(pack.albedoMean) },
    uTerrainSurfaceMean: { value: MeansOf(pack.surfaceMean) },
    uTerrainDistance: {
      value: Vec4Of([TERRAIN_DISTANCE.farStart, TERRAIN_DISTANCE.farEnd,
        TERRAIN_DISTANCE.normalNear, TERRAIN_DISTANCE.normalFarDistance]),
    },
    uTerrainFade: {
      value: Vec4Of([TERRAIN_DISTANCE.normalFar, TERRAIN_DISTANCE.aoFar,
        TERRAIN_DISTANCE.biplanarDistance, TERRAIN_AO_INTENSITY]),
    },
    uTerrainMacroScale: {
      value: Vec4Of([...TERRAIN_MACRO.scalesM.map((m) => 1 / m), TERRAIN_MACRO.warmth]),
    },
    uTerrainMacroAmp: { value: Vec4Of([...TERRAIN_MACRO.brightness, TERRAIN_MACRO.damp]) },
    uTerrainStubble: {
      value: Vec4Of([1 / TERRAIN_STUBBLE.scaleM, 1 / TERRAIN_STUBBLE.breakupScaleM,
        TERRAIN_STUBBLE.threshold[0], TERRAIN_STUBBLE.threshold[1]]),
    },
    uTerrainBlend: {
      value: new THREE.Vector3(TERRAIN_BLEND.heightDepth, 1 / TERRAIN_BLEND.antiTileScaleM, TERRAIN_BLEND.antiTileBands),
    },
    uTerrainContrast: {
      value: new THREE.Vector3(TERRAIN_DISTANCE.contrastFadeStart, TERRAIN_DISTANCE.contrastFadeEnd, TERRAIN_DISTANCE.contrastFar),
    },
    uTerrainAlbedoScale: { value: set.albedoScale ?? 1 },
    // 全场共用一份，调试入口直接改它的 value（不重编译）
    uTerrainDebug: TERRAIN_DEBUG_UNIFORM,
  };
  const patch = MakePatch({
    key: `terrain3${quality.antiTile ? "t" : ""}${quality.biplanar ? "b" : ""}`,
    uniforms: (shaderUniforms) => { Object.assign(shaderUniforms, uniforms); },
    vertex: [
      ["#include <common>", GLSL_VERTEX_COMMON],
      ["#include <project_vertex>", GLSL_VERTEX_WORLD],
    ],
    fragment: [
      ["#include <common>", GlslCommon(quality)],
      ["#include <map_fragment>", Ended("#include <map_fragment>", GLSL_EVALUATE)],
      ["#include <roughnessmap_fragment>", Ended("#include <roughnessmap_fragment>", GLSL_ROUGHNESS)],
      ["#include <normal_fragment_maps>", Ended("#include <normal_fragment_maps>", GLSL_NORMAL)],
      ["#include <aomap_fragment>", Ended("#include <aomap_fragment>", GLSL_AO)],
      ["#include <dithering_fragment>", GLSL_DEBUG],
    ],
  });
  // 着色特性里 hasAoMap 按它算（材质上没有 roughnessMap，ORM 三合一不会发生）。
  patch.providesMaterialAo = true;
  patch.terrainUniforms = uniforms;
  return patch;
}

/**
 * 分层地形材质。**不进 MaterialLibrary 的缓存**：它的纹理属于关卡，关卡 Dispose 时一起还。
 * @param {MaterialLibrary} library 用它的注入口接 AO / GI / 簇光 / 着色升级
 */
export function CreateTerrainMaterial(library, pack, { quality = "high", name = "TerrainLayers" } = {}) {
  const tier = TerrainQualityOf(quality);
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0 });
  material.name = name;
  material.vertexColors = true;
  // 着色升级那一路：不编 POM / 细节法线（地形自己有远近两套平铺与法线淡出），
  // 微阴影读本补丁写的 gMaterialAo，地平线镜面遮蔽照常。
  material.userData.materialShadingSurface = {
    pom: 0, detailNormal: 0, detailTile: 9, microShadow: 1,
    horizonOcclusion: true, skin: false, hasNormalMap: true, hasAoMap: true,
  };
  material.userData.terrainLayers = { set: pack.setName, antiTile: tier.antiTile, biplanar: tier.biplanar };
  // 开发取证：?terrainView=1 权重 / 2 反照率 / 3 法线（Data_Tuning_Terrain.TERRAIN_DEBUG_VIEWS）
  if (typeof location !== "undefined") {
    TERRAIN_DEBUG_UNIFORM.value = parseFloat(new URLSearchParams(location.search).get("terrainView") || "0") || 0;
  }
  library.InjectSurface(material, MakeTerrainPatch(pack, tier));
  return material;
}
