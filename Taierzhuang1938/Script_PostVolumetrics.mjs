// 《台儿庄：血战滕县》froxel 体积雾 / 体积光。
//
// 方案是 Wronski 2014（AC4 "Volumetric Fog"）→ Hillaire 2015（Frostbite "Physically
// Based Unified Volumetric Rendering"）→ UE Volumetric Fog 这一条主线，一趟不落：
//
//   1) **注入 + 光照**（一次全屏 blit，写整张 froxel 图集）
//      每个 froxel 中心按 IGN + 帧序抖动，算出消光 σ_t 与散射源 σ_s·L：
//        · 高度雾（沿用 SKY_PRESETS[...].fog 的物理化映射）
//        · 3D 噪声的烟尘团（**只做减法**，见下面「三道闸」）
//        · 局部雾体 API（AddFogVolume：烟幕、炮击烟、着火房屋的热烟、河面薄雾）
//        · 太阳 × SunShadowVisibilityCheap × Henyey-Greenstein 相函数  ← 光柱与切断
//        · 环境（解析雾的雾色，各向同性）
//        · 局部点光（LightRig 的火源池，逆平方 + 窗函数 + 同一个相函数）
//      末尾做**时域重投影**：把上一帧图集按 prevViewProjection 反查、三线性取样、
//      按 0.9 混合。这是「不闪、不噪」的唯一来源 —— 单帧 1 抽样必然是噪点。
//
//   2) **积分**（一次全屏 blit，同样是整张图集）
//      每个 (x, y, k) 从第 0 片累加到第 k 片，用 Hillaire 的解析切片积分
//      `S·(1-exp(-σ·dz))/σ` 保能量（σ→0 时退化成 S·dz，不会除零）。
//      **为什么不用逐层 setRenderTarget**：那是 z 次 draw call（high 档 64 次），
//      而本作的瓶颈正是 CPU 提交（~15 ms/帧）。平铺成 2D 图集之后整趟就是一次 blit，
//      代价是每个片元最多循环 VOL_NZ 次 texelFetch —— 同一个 warp 里的片元属于
//      同一片，逐次读的是同一片的相邻纹素，完全合并，实测比 64 次提交便宜得多。
//
//   3) **Apply**（一次全屏 blit，全分辨率）
//      按像素线性视深查积分图集（两片手动 lerp + tile 内夹紧的双线性），
//      far 之外用同一条高度雾解析式续上尾段，天空取最远片，
//      输出 `uFogScatter`（rgb = 绝对散射亮度，a = 透过率）交给 Composite。
//
// ## 与解析雾的关系：**同一套雾，把散射项拆开按位置着色**
// 今天：`out = mix(color, fogCol, fog)`，`fog = clamp((1-exp(-d·ρ))·hFall, 0, max)`。
// 体积：`out = color·T + ∫σ_s·L·T(t)dt`。均匀介质、L = fogCol、albedo = 1 时积分
// 恰好等于 `fogCol·(1-T)`，而 `T = 1-fog` —— **两条式子同一个答案**。
// 所以体积雾不是换了一套雾，是把 fogCol 从「整条视线一个常数」变成「逐 froxel 着色」：
// 晒得到的 froxel 多一份 HG 前向散射（光柱），被墙挡住的没有（光柱被切断）。
// 这个等价关系是本模块的校准锚点，`Script_VolumetricsTest` 直接验它。
//
// ## 用户硬约束（历史定论「先别动雾」）：能见度只能变好，不能变差
// 七十米外能不能看见敌人由雾决定。三道闸（详见 Data_Tuning_Volumetrics 抬头）：
//   1. 噪声**只做减法**（`σ *= 1 - amount·fbm`）；
//   2. `densityScale ≤ 1`，逐预设算出来的；
//   3. `legacyTransmittance`（出厂 true）：apply 那一趟把**透过率**换回今天那条
//      解析式，只把**散射项**换成体积的；局部雾体的额外光学厚度仍照常乘上去。
//      于是「同一像素的雾不透明度 ≤ 今天」是逐像素恒等式，不是靠调参保证的。
//
// ## 坑（踩过的写在这里，别再踩第二遍）
//   · GLSL ES 3.00 保留字不许当标识符：`sample` / `filter` / `input` / `output` /
//     `patch` / `resource` / `active` / `common` / `partition` / `half` / `noise1..4`。
//     编译失败 three 只在控制台留一行，那一趟什么都不画 —— 每个 pass 都读回像素验过。
//   · raymarch 不抖动起点 = 同心环带；抖了但不随帧变 = 静态噪点。两者都要，
//     再靠时域重投影收敛（本模块 xy 与 z 都抖，种子是 `Ign(px + frame·k)`）。
//   · 2D 图集的双线性会跨 tile 渗色：`VolAtlasUv` 必须把 cell uv 夹在 tile 内半纹素。
//   · `uSunShadowMap` 必须是 `highp sampler2DShadow`（`SUN_SHADOW_GLSL` 已经写好了），
//     用 `sampler2D` 绑是未定义行为，多数驱动返回 0 → 全屏黑雾。

import * as THREE from "three";
import { MakeFullscreenMaterial, MakeRenderTarget, GLSL_COMMON } from "./Script_PostCommon.mjs";
import { SUN_SHADOW_GLSL, BindSunShadowUniforms } from "./Script_Light.mjs";
import { CSM_RAW_DEPTH } from "./Script_Csm.mjs";
import { SKY_PRESETS } from "./Script_Sky.mjs";
import {
  VOLUMETRIC_GRIDS, MakeVolumetricParams, MAX_FOG_VOLUMES, MAX_VOLUMETRIC_LIGHTS,
} from "./Data_Tuning_Volumetrics.mjs";

// ---------------------------------------------------------------------------
// 3D 噪声：32³ 的可平铺 FBM。上传一次，之后逐帧只动 uniform 里的漂移偏移。
// 决定论要求（不许 Math.random）：整数哈希驱动，逐轮截图才比得出「这一版更好」。
// ---------------------------------------------------------------------------
const NOISE_SIZE = 32;

function NoiseHash(x, y, z, seed) {
  // 三维整数哈希（Wang hash 变体）。周期 = NOISE_SIZE，保证 3D 纹理可无缝平铺。
  let h = (x & 1023) * 73856093 ^ (y & 1023) * 19349663 ^ (z & 1023) * 83492791 ^ seed * 2654435761;
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function NoiseValue3(x, y, z, cells, seed) {
  // 值噪声 + 三次平滑。cells 必须整除 NOISE_SIZE，否则接缝处会有一条硬边。
  const fx = x * cells / NOISE_SIZE;
  const fy = y * cells / NOISE_SIZE;
  const fz = z * cells / NOISE_SIZE;
  const ix = Math.floor(fx), iy = Math.floor(fy), iz = Math.floor(fz);
  const tx = fx - ix, ty = fy - iy, tz = fz - iz;
  const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty), sz = tz * tz * (3 - 2 * tz);
  const W = (dx, dy, dz) => NoiseHash(
    (ix + dx + cells) % cells, (iy + dy + cells) % cells, (iz + dz + cells) % cells, seed);
  const x00 = W(0, 0, 0) + (W(1, 0, 0) - W(0, 0, 0)) * sx;
  const x10 = W(0, 1, 0) + (W(1, 1, 0) - W(0, 1, 0)) * sx;
  const x01 = W(0, 0, 1) + (W(1, 0, 1) - W(0, 0, 1)) * sx;
  const x11 = W(0, 1, 1) + (W(1, 1, 1) - W(0, 1, 1)) * sx;
  const y0 = x00 + (x10 - x00) * sy;
  const y1 = x01 + (x11 - x01) * sy;
  return y0 + (y1 - y0) * sz;
}

/**
 * 烟尘团噪声。R = 三个八度的 FBM（大团），G = 单个高频八度（边缘的碎絮）。
 * B/A 复制 R，个别驱动对 RGB=RGBA8 的 3D 纹理上传路径挑剔，四通道最稳。
 */
export function MakeVolumetricNoiseTexture() {
  const n = NOISE_SIZE;
  const data = new Uint8Array(n * n * n * 4);
  for (let z = 0; z < n; z += 1) {
    for (let y = 0; y < n; y += 1) {
      for (let x = 0; x < n; x += 1) {
        const fbm = NoiseValue3(x, y, z, 2, 17) * 0.54
          + NoiseValue3(x, y, z, 4, 91) * 0.30
          + NoiseValue3(x, y, z, 8, 233) * 0.16;
        const detail = NoiseValue3(x, y, z, 8, 613) * 0.62 + NoiseValue3(x, y, z, 16, 787) * 0.38;
        const i = ((z * n + y) * n + x) * 4;
        const a = Math.round(Math.max(0, Math.min(1, fbm)) * 255);
        data[i] = a;
        data[i + 1] = Math.round(Math.max(0, Math.min(1, detail)) * 255);
        data[i + 2] = a;
        data[i + 3] = 255;
      }
    }
  }
  const texture = new THREE.Data3DTexture(data, n, n, n);
  texture.format = THREE.RGBAFormat;
  texture.type = THREE.UnsignedByteType;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.wrapR = THREE.RepeatWrapping;
  texture.colorSpace = THREE.NoColorSpace;
  texture.generateMipmaps = false;
  texture.unpackAlignment = 1;
  texture.needsUpdate = true;
  return texture;
}

// ---------------------------------------------------------------------------
// GLSL：公共块
// ---------------------------------------------------------------------------

/** froxel 网格的 `#define` 前缀。内部三趟都把网格烘成常量（热循环要它） */
function GridDefines(grid) {
  const tilesX = grid.tiles[0];
  const tilesY = grid.tiles[1];
  return `
#define VOL_NX ${grid.x.toFixed(1)}
#define VOL_NY ${grid.y.toFixed(1)}
#define VOL_NZF ${grid.z.toFixed(1)}
#define VOL_NZ ${grid.z}
#define VOL_NXI ${grid.x}
#define VOL_NYI ${grid.y}
#define VOL_TX ${tilesX.toFixed(1)}
#define VOL_TY ${tilesY.toFixed(1)}
#define VOL_TXI ${tilesX}
#define VOL_MAX_VOLUMES ${MAX_FOG_VOLUMES}
#define VOL_MAX_LIGHTS ${MAX_VOLUMETRIC_LIGHTS}
`;
}

/**
 * 图集寻址 + 深度分布 + 介质模型。三趟共用，靠上面那组 `#define` 拿网格尺寸。
 *
 * 深度分布是指数的：`depth(t) = near·(far/near)^t`，t∈[0,1]。近处密、远处疏 ——
 * UE Volumetric Fog 与 Frostbite 都是这一条。切片 k 在积分图集里存的是
 * **0 到它远边界** 的积分，所以远边界 `b(k+1) = depth((k+1)/NZ)` 才是它的采样深度。
 */
const GLSL_VOLUME_CORE = /* glsl */`
uniform vec3 uVolumeRange;    // x = near, y = far, z = log(far/near)
uniform vec2 uProjScale;      // (1/tan(fov/2)/aspect, 1/tan(fov/2))
uniform mat4 uInvView;
uniform vec4 uFogHeight;      // x = σ0（= density×densityScale）, y = falloff, z = base, w = maxOpacity
uniform vec3 uFogSky;
uniform vec3 uFogGround;
uniform vec2 uPhase;          // x = HG 的 g, y = 峰值归一化系数

float VolSliceDepth(float t) { return uVolumeRange.x * exp(uVolumeRange.z * t); }

float VolDepthToT(float depth) {
  return log(max(depth, 1e-4) / uVolumeRange.x) / uVolumeRange.z;
}

/** cellUv ∈ [0,1]²（片内），slice ∈ [0, NZ)。夹在 tile 内半纹素：双线性不许跨 tile 渗色。 */
vec2 VolAtlasUv(vec2 cellUv, float slice) {
  float tx = mod(slice, VOL_TX);
  float ty = floor(slice / VOL_TX);
  vec2 halfTexel = vec2(0.5 / VOL_NX, 0.5 / VOL_NY);
  vec2 inner = clamp(cellUv, halfTexel, vec2(1.0) - halfTexel);
  return (vec2(tx, ty) + inner) / vec2(VOL_TX, VOL_TY);
}

/** 三线性：两片各一次夹紧的双线性，再按 z 手动 lerp。 */
vec4 VolSampleAtlas(sampler2D atlas, vec2 cellUv, float sliceF) {
  float k0 = clamp(floor(sliceF), 0.0, VOL_NZF - 1.0);
  float k1 = min(k0 + 1.0, VOL_NZF - 1.0);
  float f = clamp(sliceF - k0, 0.0, 1.0);
  vec4 a = texture2D(atlas, VolAtlasUv(cellUv, k0));
  vec4 b = texture2D(atlas, VolAtlasUv(cellUv, k1));
  return mix(a, b, f);
}

/** 屏幕 uv + 线性视深 → 视空间坐标（与 SSAO / Composite / TAA 同一条公式）。 */
vec3 VolViewPos(vec2 cellUv, float depth) {
  vec2 ndc = cellUv * 2.0 - 1.0;
  return vec3(ndc.x / uProjScale.x, ndc.y / uProjScale.y, -1.0) * depth;
}

/**
 * 基础介质的消光系数（1/m）。**与解析雾的 hFall 逐项同式**（含 base 以下不再变浓的
 * 那个 max 钳位）—— 差一个字，两条路的雾量就对不上，屋脊线上会裂出一条硬边。
 */
float VolBaseSigma(float worldY) {
  return uFogHeight.x * exp(-max(worldY - uFogHeight.z, 0.0) / max(uFogHeight.y, 0.5));
}

/** 归一化的 Henyey-Greenstein：uPhase.y = (1-g)²/(1+g)，所以 cosTheta=1 时恒为 1。 */
float VolPhase(float cosTheta) {
  float g = uPhase.x;
  float g2 = g * g;
  float d = max(1e-4, 1.0 + g2 - 2.0 * g * cosTheta);
  return (1.0 - g2) / (d * sqrt(d)) * uPhase.y;
}

/** 各向同性项的颜色 —— 就是解析雾那条 mix(ground, sky, f(rayDir.y))（校准锚点）。 */
vec3 VolAmbientColor(vec3 rayDir) {
  return mix(uFogGround, uFogSky, clamp(rayDir.y * 2.0 + 0.35, 0.0, 1.0));
}
`;

/**
 * 太阳阴影：走 `Script_Light.SUN_SHADOW_GLSL` 的公共接口，不自己写一遍矩阵与 bias。
 * CSM 代理会在那个接口后面换成级联并追加单抽样的 `SunShadowVisibilityCheap`；
 * 在它落地之前这里补一份同名 fallback（转调五抽样版，法线取 +Y）。
 * 交接约定：CSM 侧提供 Cheap 版时，在 `SUN_SHADOW_GLSL` 里写
 * `#define SUN_SHADOW_HAS_CHEAP 1`，下面这段就会被预处理器整块剔掉。
 */
const GLSL_SUN_SHADOW = /* glsl */`
${SUN_SHADOW_GLSL}
#ifndef SUN_SHADOW_HAS_CHEAP
float SunShadowVisibilityCheap(vec3 worldPos) {
  return SunShadowVisibility(worldPos, vec3(0.0, 1.0, 0.0));
}
#endif
`;

// ---------------------------------------------------------------------------
// 第 1 趟：注入 + 光照 + 时域重投影
// ---------------------------------------------------------------------------
function MakeInjectFragment(grid) {
  return /* glsl */`
${GridDefines(grid)}
${GLSL_COMMON}
${GLSL_VOLUME_CORE}
${GLSL_SUN_SHADOW}

uniform sampler3D uNoiseTex;
uniform vec4 uNoiseParams;      // x = 幅度, y = 主八度频率(1/m), z = 细节频率, w = 淡出距离
uniform vec3 uNoiseOffsetA;
uniform vec3 uNoiseOffsetB;
uniform vec4 uMedium;           // x = albedo, y = ambientScale, z = sunGain, w = pointScale
uniform vec3 uSunDir;           // 世界，指向太阳
uniform vec3 uSunColor;
uniform float uFrame;

uniform vec4 uFogVolumePos[VOL_MAX_VOLUMES];    // xyz = 中心, w = 形状（0 球 / 1 盒）
uniform vec4 uFogVolumeSize[VOL_MAX_VOLUMES];   // xyz = 半径/半尺寸, w = 密度（1/m，0 = 空槽）
uniform vec4 uFogVolumeTint[VOL_MAX_VOLUMES];   // rgb = 反照率色, w = 边缘衰减指数

uniform vec4 uLightPos[VOL_MAX_LIGHTS];         // xyz = 世界位置, w = 半径（0 = 空槽）
uniform vec4 uLightColor[VOL_MAX_LIGHTS];       // rgb = 色×强度, w = 保留

uniform sampler2D uHistory;
uniform mat4 uPrevViewProjection;
uniform float uHistoryWeight;   // 0 = 本帧没有可用历史（开机 / 镜头硬切 / 换靶）

varying vec2 vUv;

/** 只做减法的烟尘团：最浓的 froxel 恰好等于基础密度，绝不会比今天更浓。 */
float VolNoiseGain(vec3 worldPos, float viewDepth) {
  if (uNoiseParams.x <= 0.0) return 1.0;
  float a = texture(uNoiseTex, worldPos * uNoiseParams.y + uNoiseOffsetA).r;
  float b = texture(uNoiseTex, worldPos * uNoiseParams.z + uNoiseOffsetB).g;
  float n = clamp(a * 0.68 + b * 0.32, 0.0, 1.0);
  float fade = 1.0 - smoothstep(uNoiseParams.w * 0.55, uNoiseParams.w, viewDepth);
  return 1.0 - uNoiseParams.x * n * fade;
}

void main() {
  vec2 px = gl_FragCoord.xy;
  float tileX = floor(px.x / VOL_NX);
  float tileY = floor(px.y / VOL_NY);
  float slice = tileY * VOL_TX + tileX;
  // 图集尾巴上多出来的 tile（tilesX×tilesY 可能大于 NZ）写零，别留未初始化内容
  if (slice > VOL_NZF - 0.5) { gl_FragColor = vec4(0.0); return; }
  vec2 cellUv = vec2(px.x - tileX * VOL_NX, px.y - tileY * VOL_NY) / vec2(VOL_NX, VOL_NY);

  // 抖动：起点不抖 = 同心环带；抖了不随帧变 = 静态噪点。两者都要（IGN + 帧序）。
  float jitterZ = Ign(px + uFrame * 7.13);
  vec2 jitterXy = vec2(Ign(px + uFrame * 3.71), Ign(px.yx + uFrame * 11.17)) - 0.5;
  float t = (slice + jitterZ) / VOL_NZF;
  float depth = VolSliceDepth(t);
  vec2 sampleUv = cellUv + jitterXy / vec2(VOL_NX, VOL_NY);

  vec3 viewPos = VolViewPos(sampleUv, depth);
  vec3 worldPos = (uInvView * vec4(viewPos, 1.0)).xyz;
  vec3 camPos = uInvView[3].xyz;
  vec3 toFroxel = worldPos - camPos;
  vec3 rayDir = dot(toFroxel, toFroxel) > 1e-8 ? normalize(toFroxel) : vec3(0.0, 0.0, -1.0);

  // --- 介质 ---------------------------------------------------------------
  float sigmaBase = VolBaseSigma(worldPos.y) * VolNoiseGain(worldPos, depth);
  float sigma = sigmaBase;
  vec3 scatterAlbedo = vec3(uMedium.x) * sigmaBase;   // σ_s，按各介质自己的反照率累加
  for (int i = 0; i < VOL_MAX_VOLUMES; ++i) {
    float density = uFogVolumeSize[i].w;
    if (density <= 0.0) continue;
    vec3 local = worldPos - uFogVolumePos[i].xyz;
    vec3 halfSize = max(uFogVolumeSize[i].xyz, vec3(0.01));
    float shape;
    if (uFogVolumePos[i].w < 0.5) {
      shape = 1.0 - clamp(length(local / halfSize), 0.0, 1.0);
    } else {
      vec3 q = 1.0 - clamp(abs(local) / halfSize, vec3(0.0), vec3(1.0));
      shape = min(min(q.x, q.y), q.z);
    }
    if (shape <= 0.0) continue;
    float w = pow(shape, max(uFogVolumeTint[i].w, 0.05)) * density;
    sigma += w;
    scatterAlbedo += uFogVolumeTint[i].rgb * w;
  }

  // --- 光照 ---------------------------------------------------------------
  // 环境（各向同性）= 解析雾的雾色。这一项是「体积雾 ≡ 解析雾」的校准锚点。
  vec3 lightSum = VolAmbientColor(rayDir) * uMedium.y;
  // 太阳：HG 峰值已归一到 1，乘 uMedium.z（= fog.sunGain × sunScale）之后
  // 「正对太阳、无遮挡」时与今天那条 pow(cos,8)·sunGain 峰值相同。
  // 被墙挡住的 froxel 只剩环境项 —— 光柱被几何切断就是从这一行来的。
  float visibility = SunShadowVisibilityCheap(worldPos);
  lightSum += uSunColor * (visibility * VolPhase(dot(rayDir, uSunDir)) * uMedium.z);
  // 局部点光：与 three 的 punctual 光衰减同式（decay=2 + 四次窗函数），再过同一个相函数。
  for (int i = 0; i < VOL_MAX_LIGHTS; ++i) {
    float range = uLightPos[i].w;
    if (range <= 0.0) continue;
    vec3 toLight = uLightPos[i].xyz - worldPos;
    float dist2 = max(dot(toLight, toLight), 0.04);
    float dist = sqrt(dist2);
    if (dist > range) continue;
    float window = clamp(1.0 - pow(dist / range, 4.0), 0.0, 1.0);
    float atten = window * window / dist2;
    lightSum += uLightColor[i].rgb * (atten * VolPhase(dot(rayDir, toLight / dist)) * uMedium.w);
  }

  vec4 current = vec4(scatterAlbedo * lightSum, sigma);

  // --- 时域重投影 ---------------------------------------------------------
  // 单帧 1 抽样必然是噪点；0.9 的历史权重把几十帧的抖动积起来，才有「不闪」的雾。
  // 出网格的地方硬切会留一条边，所以边界 2 个 froxel 内线性降权。
  if (uHistoryWeight > 0.0) {
    vec4 prevClip = uPrevViewProjection * vec4(worldPos, 1.0);
    if (prevClip.w > uVolumeRange.x) {
      vec2 prevUv = prevClip.xy / prevClip.w * 0.5 + 0.5;
      float prevT = VolDepthToT(prevClip.w);
      if (prevUv.x >= 0.0 && prevUv.x <= 1.0 && prevUv.y >= 0.0 && prevUv.y <= 1.0
          && prevT >= 0.0 && prevT <= 1.0) {
        vec2 edgeXy = min(prevUv, vec2(1.0) - prevUv) * vec2(VOL_NX, VOL_NY);
        float edgeW = clamp(min(edgeXy.x, edgeXy.y) * 0.5, 0.0, 1.0);
        float edgeZ = clamp(min(prevT, 1.0 - prevT) * VOL_NZF * 0.5, 0.0, 1.0);
        vec4 history = VolSampleAtlas(uHistory, prevUv, prevT * VOL_NZF - 0.5);
        // 历史里混进 NaN 会永久驻留并逐帧扩散一圈（TAA 同款事故），当场丢掉
        if (!any(isnan(history))) {
          current = mix(current, history, uHistoryWeight * edgeW * edgeZ);
        }
      }
    }
  }
  gl_FragColor = max(current, vec4(0.0));
}
`;
}

// ---------------------------------------------------------------------------
// 第 2 趟：沿 z 积分（每个片元把自己那一列累加到自己这一片）
// ---------------------------------------------------------------------------
function MakeIntegrateFragment(grid) {
  return /* glsl */`
${GridDefines(grid)}
${GLSL_VOLUME_CORE}

uniform sampler2D uVolume;
varying vec2 vUv;

void main() {
  vec2 px = gl_FragCoord.xy;
  float tileX = floor(px.x / VOL_NX);
  float tileY = floor(px.y / VOL_NY);
  float slice = tileY * VOL_TX + tileX;
  if (slice > VOL_NZF - 0.5) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
  ivec2 cellPx = ivec2(floor(px.x - tileX * VOL_NX), floor(px.y - tileY * VOL_NY));
  int last = int(slice);

  vec3 accum = vec3(0.0);
  float transmittance = 1.0;
  float nearDepth = uVolumeRange.x;
  for (int i = 0; i < VOL_NZ; ++i) {
    if (i > last) break;
    float farDepth = VolSliceDepth(float(i + 1) / VOL_NZF);
    float dz = max(farDepth - nearDepth, 1e-5);
    nearDepth = farDepth;
    int tx = i - (i / VOL_TXI) * VOL_TXI;
    int ty = i / VOL_TXI;
    vec4 cell = texelFetch(uVolume, cellPx + ivec2(tx * VOL_NXI, ty * VOL_NYI), 0);
    float sigma = max(cell.a, 0.0);
    float sliceT = exp(-sigma * dz);
    // Hillaire 2015 的解析切片积分：∫σ_s·L·T dt = (σ_s·L)·(1-exp(-σ_t·dz))/σ_t。
    // σ_t → 0 时退化成 (σ_s·L)·dz（不除零，也不丢掉薄雾那一档的能量）。
    vec3 sliceScatter = cell.rgb * (sigma > 1e-6 ? (1.0 - sliceT) / sigma : dz);
    accum += transmittance * sliceScatter;
    transmittance *= sliceT;
  }
  gl_FragColor = vec4(accum, transmittance);
}
`;
}

// ---------------------------------------------------------------------------
// 第 3 趟：Apply（全分辨率，产出 Composite 的 uFogScatter）
// ---------------------------------------------------------------------------

/**
 * apply 的核心。抽成一段是因为**粒子 / 水面 / 透明件也要按自己的深度上同一份雾**
 * （`VOLUMETRIC_SAMPLE_GLSL` 走同一段代码），两边各抄一遍的下场是烟柱跨过屋脊线
 * 会裂成两截 —— 解析雾时代已经踩过一次（见 Script_Vfx 的 AERIAL 段）。
 */
const GLSL_VOLUME_RESOLVE = /* glsl */`
uniform sampler2D uIntegrated;
uniform vec4 uApply;          // x = legacyTransmittance, y = skyScale, z = albedo, w = ambientScale
uniform float uFogDensityRaw; // 解析雾的原始 density（**不乘** densityScale）

/**
 * 基础介质在 [depth0, depth1] 这一段视深上的光学厚度。
 * 4 个中点：解析雾的 hFall 在 base 处有一个 max() 折点，闭式要分段，
 * 4 个中点又便宜又吃得下这个折点（误差 < 1%，而它只作为 tauExtra 的判据）。
 */
float VolBaseTau(vec3 camPos, vec3 rayDir, float invCos, float depth0, float depth1) {
  float s0 = depth0 * invCos;
  float s1 = depth1 * invCos;
  if (s1 <= s0) return 0.0;
  float stepLen = (s1 - s0) * 0.25;
  float tau = 0.0;
  for (int i = 0; i < 4; ++i) {
    tau += VolBaseSigma(camPos.y + rayDir.y * (s0 + stepLen * (float(i) + 0.5)));
  }
  return tau * stepLen;
}

/**
 * @param uv        屏幕 uv
 * @param viewDepth 线性视深；≤ 0 表示天空（取最远片）
 * @return rgb = 沿视线累积的**绝对散射亮度**，a = 透过率
 */
vec4 VolumetricResolve(vec2 uv, float viewDepth) {
  float farRange = uVolumeRange.y;
  bool isSky = viewDepth <= 0.0;
  float depth = isSky ? farRange : max(viewDepth, 1e-3);
  float froxelDepth = min(depth, farRange);

  vec3 viewPos = VolViewPos(uv, froxelDepth);
  vec3 camPos = uInvView[3].xyz;
  vec3 worldPos = (uInvView * vec4(viewPos, 1.0)).xyz;
  vec3 toFroxel = worldPos - camPos;
  vec3 rayDir = dot(toFroxel, toFroxel) > 1e-8 ? normalize(toFroxel) : vec3(0.0, 0.0, -1.0);
  // froxel 按**视深**切片，而高度雾要按**路程**积分：两者差一个与光轴的夹角余弦。
  float invCos = length(viewPos) / froxelDepth;

  // 积分图集：切片 k 存的是 0 到它远边界 b(k+1) 的积分，所以采样下标要 −1。
  float sliceF = clamp(VolDepthToT(froxelDepth), 0.0, 1.0) * VOL_NZF - 1.0;
  vec4 volume = VolSampleAtlas(uIntegrated, uv, max(sliceF, 0.0));
  // 第 0 片之前（< near）没有积分，在「零积分」与第 0 片之间线性过渡，别硬跳
  if (sliceF < 0.0) volume = mix(vec4(0.0, 0.0, 0.0, 1.0), volume, clamp(sliceF + 1.0, 0.0, 1.0));
  float volumeT = clamp(volume.a, 0.0, 1.0);
  vec3 scatterVolume = max(volume.rgb, vec3(0.0));

  // far 之外的尾段：同一条高度雾解析式续上，只有各向同性项。
  // 不续的话 260 m 外的山与村舍会从雾里整片跳出来（chuchuanDay 的 2.9 km 视距要它）。
  float tauTail = isSky ? 0.0 : VolBaseTau(camPos, rayDir, invCos, froxelDepth, depth);
  float tailT = exp(-tauTail);
  vec3 scatterTail = VolAmbientColor(rayDir) * uApply.w * uApply.z * (1.0 - tailT) * volumeT;
  float physicalT = volumeT * tailT;
  vec3 scatterPhysical = scatterVolume + scatterTail;

  float opacity;
  if (isSky) {
    // 天空取最远片（今天的解析雾对天空直接 return，屋脊线与天之间因此有一条硬边）。
    // skyScale 是这一改的闸门：0 = 完全退回今天的行为。
    opacity = (1.0 - physicalT) * uApply.y;
  } else if (uApply.x > 0.5) {
    // legacyTransmittance：透过率换回今天那条解析式（逐比特同式），
    // 只把**局部雾体多出来的**光学厚度乘上去 —— 烟幕该挡还是挡。
    // 1.03 与 0.003 是死区：froxel 离散化与解析闭式之间的残差不许被当成「额外的烟」。
    float tauBase = VolBaseTau(camPos, rayDir, invCos, uVolumeRange.x, froxelDepth);
    float tauExtra = max(0.0, -log(max(volumeT, 1e-5)) - tauBase * 1.03 - 0.003);
    float hFall = exp(-max((camPos.y + rayDir.y * depth * invCos) - uFogHeight.z, 0.0)
                      / max(uFogHeight.y, 0.5));
    float fogOld = clamp((1.0 - exp(-depth * uFogDensityRaw)) * hFall, 0.0, uFogHeight.w);
    opacity = clamp(1.0 - (1.0 - fogOld) * exp(-tauExtra), 0.0, 1.0);
  } else {
    opacity = clamp(1.0 - physicalT, 0.0, uFogHeight.w);
  }

  // 散射按「实际雾量 / 物理雾量」等比缩放：均匀介质 + albedo 1 + 无遮挡时
  // 这一步让 color·T + scatter 精确退化成今天的 mix(color, fogCol, fog)。
  float scale = clamp(opacity / max(1.0 - physicalT, 1e-4), 0.0, 4.0);
  return vec4(max(scatterPhysical * scale, vec3(0.0)), clamp(1.0 - opacity, 0.0, 1.0));
}
`;

function MakeApplyFragment(grid) {
  return /* glsl */`
${GridDefines(grid)}
${GLSL_COMMON}
${GLSL_VOLUME_CORE}
${GLSL_VOLUME_RESOLVE}

uniform sampler2D uNormalDepth;
varying vec2 vUv;

void main() {
  gl_FragColor = VolumetricResolve(vUv, texture2D(uNormalDepth, vUv).w);
}
`;
}

// ---------------------------------------------------------------------------
// 调试视图（Debug Rendering 面板的四项）
// ---------------------------------------------------------------------------
function MakeDebugFragment(grid) {
  return /* glsl */`
${GridDefines(grid)}
${GLSL_COMMON}
${GLSL_VOLUME_CORE}
${GLSL_VOLUME_RESOLVE}

uniform sampler2D uNormalDepth;
uniform sampler2D uVolume;        // 注入图集（未积分）
uniform mat4 uPrevViewProjection;
uniform float uHistoryWeight;
uniform float uMode;              // 0 密度 / 1 散射 / 2 透过率 / 3 重投影拒绝
varying vec2 vUv;

vec3 Ramp(float x) {
  // 深蓝 → 青 → 黄 → 红。判读用，不追求感知均匀。
  x = clamp(x, 0.0, 1.0);
  return clamp(vec3(x * 2.4 - 0.6, 1.2 - abs(x - 0.5) * 2.4, 1.1 - x * 2.6), 0.0, 1.0);
}

vec3 LinearToSrgbDebug(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(max(c, vec3(1e-5)), vec3(1.0 / 2.4)) - 0.055,
             step(0.0031308, c));
}

void main() {
  float depth = texture2D(uNormalDepth, vUv).w;
  float froxelDepth = depth <= 0.0 ? uVolumeRange.y : min(depth, uVolumeRange.y);
  float sliceF = clamp(VolDepthToT(froxelDepth), 0.0, 1.0) * VOL_NZF - 0.5;
  vec3 rgb;
  if (uMode < 0.5) {
    // 密度切片：这一像素背后那颗 froxel 的 σ_t，按 0.15 /m 满量程上色
    float sigma = VolSampleAtlas(uVolume, vUv, max(sliceF, 0.0)).a;
    rgb = Ramp(sigma / 0.15);
  } else if (uMode < 1.5) {
    vec4 resolved = VolumetricResolve(vUv, depth);
    rgb = LinearToSrgbDebug(resolved.rgb / (1.0 + Luma(resolved.rgb)));
  } else if (uMode < 2.5) {
    rgb = vec3(clamp(VolumetricResolve(vUv, depth).a, 0.0, 1.0));
  } else {
    // 重投影拒绝 mask：绿 = 历史被采纳，红 = 本帧只能用当前抽样（会更噪）
    vec3 viewPos = VolViewPos(vUv, froxelDepth);
    vec3 worldPos = (uInvView * vec4(viewPos, 1.0)).xyz;
    float weight = 0.0;
    if (uHistoryWeight > 0.0) {
      vec4 prevClip = uPrevViewProjection * vec4(worldPos, 1.0);
      if (prevClip.w > uVolumeRange.x) {
        vec2 prevUv = prevClip.xy / prevClip.w * 0.5 + 0.5;
        float prevT = VolDepthToT(prevClip.w);
        if (prevUv.x >= 0.0 && prevUv.x <= 1.0 && prevUv.y >= 0.0 && prevUv.y <= 1.0
            && prevT >= 0.0 && prevT <= 1.0) {
          vec2 edgeXy = min(prevUv, vec2(1.0) - prevUv) * vec2(VOL_NX, VOL_NY);
          float edgeW = clamp(min(edgeXy.x, edgeXy.y) * 0.5, 0.0, 1.0);
          float edgeZ = clamp(min(prevT, 1.0 - prevT) * VOL_NZF * 0.5, 0.0, 1.0);
          weight = uHistoryWeight * edgeW * edgeZ;
        }
      }
    }
    rgb = vec3(1.0 - weight, weight, 0.12);
  }
  gl_FragColor = vec4(rgb, 1.0);
}
`;
}

// ---------------------------------------------------------------------------
// 对外：给粒子 / 水面 / 透明件按自身世界坐标取同一份雾
// ---------------------------------------------------------------------------

/**
 * 第三方着色器要的一整块 GLSL：`vec4 SampleVolumetricFog(vec3 worldPos)`
 * （rgb = 绝对散射亮度，a = 透过率）与 `float VolumetricFarTransmittance(vec2 uv)`。
 *
 * 与内部三趟的区别：网格尺寸走 uniform 而不是 `#define`（第三方材质的编译时机
 * 不归本模块管，烘进常量会让换画质档时静默失配）。代价是几次 uniform 读取，
 * 而调用方是粒子/水面这种像素量很小的东西，可以忽略。
 *
 * 用法：
 * ```js
 * import { VOLUMETRIC_SAMPLE_GLSL, BindVolumetricUniforms } from "./Script_PostVolumetrics.mjs";
 * BindVolumetricUniforms(myUniforms, post.volumetricsPass);   // 建条目 + 每帧同步一次
 * const frag = `...${VOLUMETRIC_SAMPLE_GLSL}...
 *   vec4 fog = SampleVolumetricFog(vWorldPos);
 *   color = color * fog.a + fog.rgb;`;
 * ```
 * `uVolumetricEnabled` 为 0 时 `SampleVolumetricFog` 返回 `(0,0,0,1)`（无雾），
 * 调用方就该退回自己那份解析雾 —— low 档与体积雾关掉时都是这一条。
 */
export const VOLUMETRIC_SAMPLE_GLSL = /* glsl */`
uniform sampler2D uVolumetricIntegrated;
uniform vec3 uVolumetricRange;     // x = near, y = far, z = log(far/near)
uniform vec3 uVolumetricGrid;      // x = NX, y = NY, z = NZ
uniform vec2 uVolumetricTiles;     // x = tilesX, y = tilesY
uniform mat4 uVolumetricViewProjection;
uniform float uVolumetricEnabled;

vec2 VolumetricAtlasUv(vec2 cellUv, float slice) {
  float tx = mod(slice, uVolumetricTiles.x);
  float ty = floor(slice / uVolumetricTiles.x);
  vec2 halfTexel = 0.5 / uVolumetricGrid.xy;
  vec2 inner = clamp(cellUv, halfTexel, vec2(1.0) - halfTexel);
  return (vec2(tx, ty) + inner) / uVolumetricTiles;
}

vec4 VolumetricAtlasSample(vec2 cellUv, float sliceF) {
  float k0 = clamp(floor(sliceF), 0.0, uVolumetricGrid.z - 1.0);
  float k1 = min(k0 + 1.0, uVolumetricGrid.z - 1.0);
  vec4 a = texture2D(uVolumetricIntegrated, VolumetricAtlasUv(cellUv, k0));
  vec4 b = texture2D(uVolumetricIntegrated, VolumetricAtlasUv(cellUv, k1));
  return mix(a, b, clamp(sliceF - k0, 0.0, 1.0));
}

/** rgb = 沿视线累积到 worldPos 的绝对散射亮度，a = 透过率。体积雾关着时返回 (0,0,0,1)。 */
vec4 SampleVolumetricFog(vec3 worldPos) {
  if (uVolumetricEnabled < 0.5) return vec4(0.0, 0.0, 0.0, 1.0);
  vec4 clip = uVolumetricViewProjection * vec4(worldPos, 1.0);
  if (clip.w <= uVolumetricRange.x) return vec4(0.0, 0.0, 0.0, 1.0);
  vec2 uv = clip.xy / clip.w * 0.5 + 0.5;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return vec4(0.0, 0.0, 0.0, 1.0);
  float depth = min(clip.w, uVolumetricRange.y);
  float t = clamp(log(max(depth, 1e-4) / uVolumetricRange.x) / uVolumetricRange.z, 0.0, 1.0);
  float sliceF = t * uVolumetricGrid.z - 1.0;
  vec4 volume = VolumetricAtlasSample(uv, max(sliceF, 0.0));
  if (sliceF < 0.0) volume = mix(vec4(0.0, 0.0, 0.0, 1.0), volume, clamp(sliceF + 1.0, 0.0, 1.0));
  return vec4(max(volume.rgb, vec3(0.0)), clamp(volume.a, 0.0, 1.0));
}

/**
 * 最远切片的透过率。物理大气代理把自己的 aerial perspective **乘上它**即可 ——
 * 体积雾覆盖 0..far，超出部分归大气；这里的透过率没有被硬归零，正是为了留这个接口。
 */
float VolumetricFarTransmittance(vec2 uv) {
  if (uVolumetricEnabled < 0.5) return 1.0;
  return clamp(VolumetricAtlasSample(uv, uVolumetricGrid.z - 1.0).a, 0.0, 1.0);
}
`;

/**
 * 在一份 uniforms 上建齐 `VOLUMETRIC_SAMPLE_GLSL` 要的条目，并登记到 pass。
 * `pass` 传 null 也合法（建条目、置 `uVolumetricEnabled = 0`）。
 * pass 每帧在 apply 之后同步一次（`SyncSampleUniforms`），调用方不用管。
 * @returns {object} 同一份 uniforms（方便链式）
 */
export function BindVolumetricUniforms(uniforms, pass = null) {
  uniforms.uVolumetricIntegrated = uniforms.uVolumetricIntegrated || { value: null };
  uniforms.uVolumetricRange = uniforms.uVolumetricRange || { value: new THREE.Vector3(0.5, 260, 6.25) };
  uniforms.uVolumetricGrid = uniforms.uVolumetricGrid || { value: new THREE.Vector3(1, 1, 1) };
  uniforms.uVolumetricTiles = uniforms.uVolumetricTiles || { value: new THREE.Vector2(1, 1) };
  uniforms.uVolumetricViewProjection = uniforms.uVolumetricViewProjection || { value: new THREE.Matrix4() };
  uniforms.uVolumetricEnabled = uniforms.uVolumetricEnabled || { value: 0 };
  if (pass) {
    pass.RegisterSampleUniforms(uniforms);
    pass.SyncSampleUniforms();
  }
  return uniforms;
}

// ---------------------------------------------------------------------------
// pass 本体
// ---------------------------------------------------------------------------

const SCRATCH_COLOR = new THREE.Color();

/** 反查 `SKY_PRESETS`：调用方只透传 `preset.fog`，靠对象**同一性**认出是哪一档。 */
const FOG_BLOCK_TO_NAME = new Map();
for (const [name, preset] of Object.entries(SKY_PRESETS)) {
  // testSceneDay / weaponRangeDay / p012WhiteboxDay 共用同一个对象，先登记的赢 —— 三档
  // 的体积参数本来就一样（fog.density = 0），认成哪一个都不影响画面。
  if (preset && preset.fog && !FOG_BLOCK_TO_NAME.has(preset.fog)) {
    FOG_BLOCK_TO_NAME.set(preset.fog, name);
  }
}

export class VolumetricsPass {
  constructor(pipeline) {
    // 帧图里是三行（注入 / 积分 / apply），profiler 逐段归账才看得出钱花在哪。
    // 三行共用这一个实例：状态、靶与雾体表都只有一份。
    this.name = "volumetricInject";
    this.pipeline = pipeline;
    this.grid = VOLUMETRIC_GRIDS[pipeline.quality] || null;
    this.gridKey = this.grid ? `${this.grid.x}x${this.grid.y}x${this.grid.z}` : "";

    this.noise = null;
    this.volumeA = null;
    this.volumeB = null;
    this.integrated = null;
    this.fogScatter = null;
    this.flip = false;
    this.hasHistory = false;
    this.ready = false;
    this.lastParams = null;
    this.sunShadowRig = null;
    // 本帧局部光的来源与盏数（"cluster" / "pool" / "state" / "none"）。
    // `_UploadLights` 每帧重写；回归口与编辑器面板读它，不猜。
    this.lightSource = "none";
    this.lightCount = 0;
    this.sampleClients = new Set();
    this.currentVolume = null;
    this.viewProjection = new THREE.Matrix4();
    this.shadowFallback = null;

    // 局部雾体（AddFogVolume）。Map 而不是数组：句柄要能删，且顺序无关。
    this.fogVolumes = new Map();
    this.nextVolumeHandle = 1;
    this.noiseOffsetA = new THREE.Vector3();
    this.noiseOffsetB = new THREE.Vector3();

    const volumeSlots = MAX_FOG_VOLUMES;
    const lightSlots = MAX_VOLUMETRIC_LIGHTS;
    this.uniformsInject = {
      uVolumeRange: { value: new THREE.Vector3(0.5, 260, 6.25) },
      uProjScale: { value: new THREE.Vector2(1, 1) },
      uInvView: { value: new THREE.Matrix4() },
      uFogHeight: { value: new THREE.Vector4(0.013, 18, 0, 0.94) },
      uFogSky: { value: new THREE.Vector3(0.62, 0.64, 0.68) },
      uFogGround: { value: new THREE.Vector3(0.42, 0.38, 0.33) },
      uPhase: { value: new THREE.Vector2(0.45, 0.2097) },
      uNoiseTex: { value: null },
      uNoiseParams: { value: new THREE.Vector4(0.22, 0.018, 0.075, 95) },
      uNoiseOffsetA: { value: new THREE.Vector3() },
      uNoiseOffsetB: { value: new THREE.Vector3() },
      uMedium: { value: new THREE.Vector4(0.92, 1, 0.28, 0.055) },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunColor: { value: new THREE.Vector3(1, 0.92, 0.78) },
      uFrame: { value: 0 },
      uFogVolumePos: { value: new Float32Array(volumeSlots * 4) },
      uFogVolumeSize: { value: new Float32Array(volumeSlots * 4) },
      uFogVolumeTint: { value: new Float32Array(volumeSlots * 4) },
      uLightPos: { value: new Float32Array(lightSlots * 4) },
      uLightColor: { value: new Float32Array(lightSlots * 4) },
      uHistory: { value: null },
      uPrevViewProjection: { value: new THREE.Matrix4() },
      uHistoryWeight: { value: 0 },
    };
    BindSunShadowUniforms(this.uniformsInject, null);

    this.uniformsIntegrate = {
      uVolumeRange: this.uniformsInject.uVolumeRange,
      uProjScale: this.uniformsInject.uProjScale,
      uInvView: this.uniformsInject.uInvView,
      uFogHeight: this.uniformsInject.uFogHeight,
      uFogSky: this.uniformsInject.uFogSky,
      uFogGround: this.uniformsInject.uFogGround,
      uPhase: this.uniformsInject.uPhase,
      uVolume: { value: null },
    };

    this.uniformsApply = {
      uVolumeRange: this.uniformsInject.uVolumeRange,
      uProjScale: this.uniformsInject.uProjScale,
      uInvView: this.uniformsInject.uInvView,
      uFogHeight: this.uniformsInject.uFogHeight,
      uFogSky: this.uniformsInject.uFogSky,
      uFogGround: this.uniformsInject.uFogGround,
      uPhase: this.uniformsInject.uPhase,
      uIntegrated: { value: null },
      uApply: { value: new THREE.Vector4(1, 1, 0.92, 1) },
      uFogDensityRaw: { value: 0.013 },
      uNormalDepth: { value: null },
    };

    this.uniformsDebug = {
      ...this.uniformsApply,
      uVolume: { value: null },
      uPrevViewProjection: this.uniformsInject.uPrevViewProjection,
      uHistoryWeight: this.uniformsInject.uHistoryWeight,
      uMode: { value: 0 },
    };

    this.materialInject = null;
    this.materialIntegrate = null;
    this.materialApply = null;
    this.materialDebug = null;
    if (this.grid) this._BuildMaterials();

    // 帧图里的另外两行。它们只是把 GPU 分段名分开，实现全在本实例上。
    this.integratePass = {
      name: "volumetricIntegrate",
      Enabled: (ctx) => this.Enabled(ctx),
      Resize: () => {},
      Render: (ctx) => this.RenderIntegrate(ctx),
      Dispose: () => {},
    };
    this.applyPass = {
      name: "volumetricApply",
      Enabled: (ctx) => this.Enabled(ctx),
      Resize: () => {},
      Render: (ctx) => this.RenderApply(ctx),
      Dispose: () => {},
    };

    // 合成 pass 的 ApplyFog 也是取样端的一位用户：它要 VolumetricFarTransmittance(uv)
    // 才知道这条视线上有多少雾是 froxel 铺不到的远段（那一段的颜色归物理大气）。
    // CompositePass 比本 pass 先建，它在构造器里已经把条目建好了，这里只补登记。
    if (pipeline?.compositePass?.uniforms) {
      BindVolumetricUniforms(pipeline.compositePass.uniforms, this);
    }
  }

  _BuildMaterials() {
    const grid = this.grid;
    this.materialInject = MakeFullscreenMaterial(MakeInjectFragment(grid), this.uniformsInject);
    this.materialIntegrate = MakeFullscreenMaterial(MakeIntegrateFragment(grid), this.uniformsIntegrate);
    this.materialApply = MakeFullscreenMaterial(MakeApplyFragment(grid), this.uniformsApply);
    this.materialDebug = MakeFullscreenMaterial(MakeDebugFragment(grid), this.uniformsDebug);
  }

  /** 图集尺寸（切片平铺后的 2D 靶）。 */
  get atlasSize() {
    if (!this.grid) return [0, 0];
    return [this.grid.x * this.grid.tiles[0], this.grid.y * this.grid.tiles[1]];
  }

  /** 接一台 LightRig：太阳阴影（光柱切断）与火源池（局部光进雾）都从它取。 */
  SetSunShadowSource(lightRig) {
    if (this.sunShadowRig && this.sunShadowRig !== lightRig) {
      this.sunShadowRig.UnregisterShadowUniforms?.(this.uniformsInject);
    }
    this.sunShadowRig = lightRig || null;
    if (lightRig) BindSunShadowUniforms(this.uniformsInject, lightRig);
    else this.uniformsInject.uSunShadowEnabled.value = 0;
  }

  // --- 局部雾体 API --------------------------------------------------------

  /**
   * 加一块局部雾体（烟幕、炮击烟、着火房屋的热烟、河面薄雾）。
   *
   * 它**是**能见度损失 —— 与基础雾不同，局部雾体的光学厚度会照常乘在透过率上
   * （见 `VolumetricResolve` 的 tauExtra）。烟幕本来就该挡住视线。
   *
   * @param {object} options
   *   shape     "sphere"（默认）| "box"
   *   position  中心（Vector3 / {x,y,z}）
   *   size      球：半径（数字）或三轴半径；盒：半尺寸
   *   density   峰值消光（1/m）。基础雾的 σ0 在 0.01 量级，烟幕给 0.15–0.6
   *   albedo    单次散射反照率颜色（默认接近白的烟）
   *   falloff   边缘衰减指数（越大边越硬；默认 1.6）
   * @returns {number} 句柄
   */
  AddFogVolume({
    shape = "sphere", position = null, size = 4, density = 0.2,
    albedo = 0xdcd8d0, falloff = 1.6,
  } = {}) {
    const handle = this.nextVolumeHandle;
    this.nextVolumeHandle += 1;
    this.fogVolumes.set(handle, {
      handle,
      box: shape === "box",
      position: new THREE.Vector3(position?.x || 0, position?.y || 0, position?.z || 0),
      size: this._MakeSize(size),
      density: Math.max(0, Number(density) || 0),
      albedo: new THREE.Color(albedo),
      falloff: Math.max(0.05, Number(falloff) || 1.6),
      auto: false,
    });
    return handle;
  }

  /** 改一块已有的雾体（会动的烟柱逐帧写它，别拆了重建）。@returns {boolean} 句柄还在不在 */
  UpdateFogVolume(handle, { position = null, size = null, density = null, albedo = null, falloff = null } = {}) {
    const state = this.fogVolumes.get(handle);
    if (!state) return false;
    if (position) state.position.set(position.x, position.y, position.z);
    if (size != null) state.size.copy(this._MakeSize(size));
    if (density != null) state.density = Math.max(0, Number(density) || 0);
    if (albedo != null) state.albedo.set(albedo);
    if (falloff != null) state.falloff = Math.max(0.05, Number(falloff) || state.falloff);
    return true;
  }

  RemoveFogVolume(handle) { this.fogVolumes.delete(handle); }

  ClearFogVolumes() {
    for (const [handle, state] of this.fogVolumes) if (!state.auto) this.fogVolumes.delete(handle);
  }

  _MakeSize(size) {
    if (typeof size === "number") return new THREE.Vector3(size, size, size);
    return new THREE.Vector3(size?.x ?? 4, size?.y ?? 4, size?.z ?? 4);
  }

  // --- 第三方取样接口 ------------------------------------------------------

  RegisterSampleUniforms(uniforms) {
    if (uniforms) this.sampleClients.add(uniforms);
    return uniforms;
  }

  UnregisterSampleUniforms(uniforms) { this.sampleClients.delete(uniforms); }

  /** 每帧 apply 之后调一次：把图集引用与矩阵推给所有登记过的第三方着色器。 */
  SyncSampleUniforms() {
    if (!this.sampleClients.size) return;
    const on = this.ready && !!this.integrated;
    const range = this.uniformsInject.uVolumeRange.value;
    for (const uniforms of this.sampleClients) {
      uniforms.uVolumetricEnabled.value = on ? 1 : 0;
      uniforms.uVolumetricIntegrated.value = on ? this.integrated.texture : null;
      uniforms.uVolumetricRange.value.copy(range);
      if (this.grid) {
        uniforms.uVolumetricGrid.value.set(this.grid.x, this.grid.y, this.grid.z);
        uniforms.uVolumetricTiles.value.set(this.grid.tiles[0], this.grid.tiles[1]);
      }
      uniforms.uVolumetricViewProjection.value.copy(this.viewProjection);
    }
  }

  // --- pass 契约 -----------------------------------------------------------

  /** 本帧到底跑不跑：档位有网格 + 开关开着 + 这一档天光真的有雾。 */
  Enabled(ctx) {
    return !!(this.grid && ctx.preset.volumetrics && this.materialInject
      && (ctx.options.fog?.density ?? 0) > 0);
  }

  Resize(width, height) {
    // froxel 图集与屏幕分辨率无关（它是相机空间的网格），只有 apply 那张全分辨率靶要重建。
    if (this.fogScatter) this.fogScatter.dispose();
    this.fogScatter = null;
    if (!this.grid) return;
    this.fogScatter = MakeRenderTarget(width, height, { type: this.pipeline.hdrType });
    this.pipeline.targets.volumetricFog = this.fogScatter;
    this.hasHistory = false;
    this.ready = false;
  }

  _EnsureVolumes() {
    if (this.volumeA || !this.grid) return;
    const [w, h] = this.atlasSize;
    const options = { type: this.pipeline.hdrType };
    this.volumeA = MakeRenderTarget(w, h, options);
    this.volumeB = MakeRenderTarget(w, h, options);
    this.integrated = MakeRenderTarget(w, h, options);
    this.pipeline.targets.volumetricScatter = this.volumeA;
    this.pipeline.targets.volumetricIntegrated = this.integrated;
    if (!this.noise) {
      this.noise = MakeVolumetricNoiseTexture();
      this.uniformsInject.uNoiseTex.value = this.noise;
    }
    this.hasHistory = false;
  }

  /**
   * 每帧都跑（Enabled 为 false 时也跑）：**Composite 的 uFogSource 归零要在这里做**，
   * 否则关掉体积雾之后合成 pass 还在读一张陈旧的散射图（症状是「关了开关画面还在雾里」）。
   */
  Prepare(ctx) {
    const composite = this.pipeline.compositePass?.uniforms;
    if (!this.Enabled(ctx)) {
      if (composite) composite.uFogSource.value = 0;
      this.hasHistory = false;
      this.ready = false;
      return;
    }
    // 还没真的产出过散射图之前（开机第一帧、刚换靶）先让 Composite 走解析雾：
    // 那张靶里是未初始化内容，接上去会闪一帧脏东西。
    if (composite && !this.ready) composite.uFogSource.value = 0;
    this._EnsureVolumes();
    this._UpdateParams(ctx);
  }

  _UpdateParams(ctx) {
    const options = ctx.options;
    const fog = options.fog || null;
    const name = options.skyPreset || (fog ? FOG_BLOCK_TO_NAME.get(fog) : null) || null;
    const params = MakeVolumetricParams(name, fog);
    // far 不许越过相机远裁面：越过之后最远那几片全落在裁掉的区域，白算。
    params.far = Math.min(params.far, ctx.camera.far * 0.98);
    this.lastParams = params;

    const U = this.uniformsInject;
    const near = Math.max(0.05, params.near);
    const far = Math.max(near * 4, params.far);
    U.uVolumeRange.value.set(near, far, Math.log(far / near));
    U.uProjScale.value.copy(ctx.projScale);
    U.uInvView.value.copy(ctx.invView);
    U.uFogHeight.value.set(
      params.density * params.densityScale, params.falloff, params.base, params.maxOpacity);
    U.uFogSky.value.fromArray(params.skyColor);
    U.uFogGround.value.fromArray(params.groundColor);
    const g = Math.max(-0.95, Math.min(0.95, params.anisotropy));
    // uPhase.y 把 HG 峰值归一到 1：`(1-g)²/(1+g)`。这样 uMedium.z 就是「正对太阳时
    // 与今天那条 pow(cos,8)·sunGain 相同的峰值」，两条路的雾色在向阳侧对得上。
    U.uPhase.value.set(g, ((1 - g) * (1 - g)) / (1 + g));
    U.uNoiseParams.value.set(
      Math.max(0, params.noiseAmount), params.noiseScale, params.noiseDetail, params.noiseFar);
    // 噪声场按秒漂移（不是按帧）：30 / 60 / 120 fps 下烟走得一样快。
    const elapsed = ctx.frame * (1 / 60);
    const windTime = options.elapsed ?? elapsed;
    const wind = params.noiseWind;
    this.noiseOffsetA.set(
      wind[0] * windTime * params.noiseScale,
      wind[1] * windTime * params.noiseScale,
      wind[2] * windTime * params.noiseScale);
    this.noiseOffsetB.set(
      wind[0] * windTime * params.noiseDetail * 1.7,
      wind[1] * windTime * params.noiseDetail * 1.7,
      wind[2] * windTime * params.noiseDetail * 1.7);
    U.uNoiseOffsetA.value.copy(this.noiseOffsetA);
    U.uNoiseOffsetB.value.copy(this.noiseOffsetB);
    U.uMedium.value.set(
      params.albedo, params.ambientScale, params.sunGain * params.sunScale, params.pointScale);
    if (options.sunDirection) U.uSunDir.value.copy(options.sunDirection).normalize();
    if (options.sunColor) U.uSunColor.value.fromArray(options.sunColor);
    U.uFrame.value = ctx.frame;
    U.uPrevViewProjection.value.copy(ctx.prevViewProjection);
    U.uHistoryWeight.value = (this.hasHistory && ctx.hasPrev) ? params.reprojection : 0;

    this._UploadFogVolumes(ctx, params);
    this._UploadLights(ctx, params);

    const A = this.uniformsApply;
    A.uApply.value.set(
      params.legacyTransmittance ? 1 : 0, params.skyScale, params.albedo, params.ambientScale);
    A.uFogDensityRaw.value = params.density;
    // uniformsDebug 是 uniformsApply 的浅拷贝，uApply / uFogDensityRaw 指向同一个对象，
    // 所以调试视图永远跟正式画面读同一份参数（面板不会变成假信息）。
    this.viewProjection.copy(ctx.viewProjection);
  }

  _UploadFogVolumes(ctx, params) {
    const U = this.uniformsInject;
    const pos = U.uFogVolumePos.value;
    const size = U.uFogVolumeSize.value;
    const tint = U.uFogVolumeTint.value;
    pos.fill(0); size.fill(0); tint.fill(0);
    // 火源自动挂的「热烟」：着火的房子周围要有一团亮着的烟，不然火只是一盏点光。
    this._SyncFireSmoke(params);
    if (!this.fogVolumes.size) return;
    const camera = ctx.camera.position;
    const list = [];
    for (const state of this.fogVolumes.values()) {
      if (state.density <= 0) continue;
      const reach = Math.max(state.size.x, state.size.y, state.size.z);
      list.push({ state, score: state.position.distanceToSquared(camera) - reach * reach });
    }
    list.sort((a, b) => a.score - b.score);
    const count = Math.min(list.length, MAX_FOG_VOLUMES);
    for (let i = 0; i < count; i += 1) {
      const state = list[i].state;
      pos[i * 4] = state.position.x;
      pos[i * 4 + 1] = state.position.y;
      pos[i * 4 + 2] = state.position.z;
      pos[i * 4 + 3] = state.box ? 1 : 0;
      size[i * 4] = state.size.x;
      size[i * 4 + 1] = state.size.y;
      size[i * 4 + 2] = state.size.z;
      size[i * 4 + 3] = state.density;
      tint[i * 4] = state.albedo.r;
      tint[i * 4 + 1] = state.albedo.g;
      tint[i * 4 + 2] = state.albedo.b;
      tint[i * 4 + 3] = state.falloff;
    }
  }

  /**
   * LightRig 的持续火源自动挂一份热烟。**只挂持续火源不挂爆炸**：爆炸的烟由
   * VfxSystem 的粒子演；这里要的是着火房屋周围那团常驻的、被自己照亮的空气。
   */
  _SyncFireSmoke(params) {
    const rig = this.sunShadowRig;
    const want = params.fireSmoke > 0 && rig && rig.fireSources ? rig.fireSources : null;
    for (const [handle, state] of this.fogVolumes) {
      if (state.auto && (!want || !want.has(state.source))) this.fogVolumes.delete(handle);
    }
    if (!want) return;
    const existing = new Map();
    for (const state of this.fogVolumes.values()) if (state.auto) existing.set(state.source, state);
    for (const fire of want.values()) {
      const radius = Math.max(2, fire.radius * params.fireSmokeRadius);
      const density = params.fireSmoke * params.density * params.densityScale;
      let state = existing.get(fire.handle);
      if (!state) {
        const handle = this.nextVolumeHandle;
        this.nextVolumeHandle += 1;
        state = {
          handle, box: false, position: new THREE.Vector3(), size: new THREE.Vector3(),
          albedo: new THREE.Color(0xcac2b4), falloff: 2.1, density: 0,
          auto: true, source: fire.handle,
        };
        this.fogVolumes.set(handle, state);
      }
      // 烟团比火光高半个半径：热烟往上走，贴着地心画会像地上铺了一层灰。
      state.position.set(fire.position.x, fire.position.y + radius * 0.35, fire.position.z);
      state.size.set(radius, radius * 1.2, radius);
      state.density = density;
    }
  }

  _UploadLights(ctx, params) {
    const U = this.uniformsInject;
    const pos = U.uLightPos.value;
    const color = U.uLightColor.value;
    pos.fill(0); color.fill(0);
    const rig = this.sunShadowRig;
    // 本帧的局部光取自哪一条路。**取证用，别当装饰**：三条退化路径长得都「有灯」，
    // 只有这个字段能说清簇状多光源到底接上了没有（回归口读它）。
    this.lightSource = "none";
    this.lightCount = 0;
    if (!rig || params.pointScale <= 0) return;
    let slot = 0;
    const Push = (position, hex, intensity, radius) => {
      if (slot >= MAX_VOLUMETRIC_LIGHTS || !(intensity > 0) || !(radius > 0)) return;
      SCRATCH_COLOR.setHex(hex);
      pos[slot * 4] = position.x;
      pos[slot * 4 + 1] = position.y;
      pos[slot * 4 + 2] = position.z;
      pos[slot * 4 + 3] = radius;
      color[slot * 4] = SCRATCH_COLOR.r * intensity;
      color[slot * 4 + 1] = SCRATCH_COLOR.g * intensity;
      color[slot * 4 + 2] = SCRATCH_COLOR.b * intensity;
      slot += 1;
    };
    // 光源来源三选一，按「灯多的优先」：
    //  ① 簇状多光源（`GetClusterLightData`）—— 它按镜头贡献排过序，位置是**世界坐标**、
    //     颜色是已乘强度的线性值，正好是雾要的口径。簇里可能有几十上百盏，
    //     这里只取前 MAX_VOLUMETRIC_LIGHTS 盏（雾是低频量，第九盏的贡献看不出来）。
    //  ② 固定灯池 `fireLights` + 枪口闪光（2026-09 之前的形态，零分配）。
    //  ③ 公共取证接口 `GetEffectLightState().active`（有分配，只当兜底）。
    const cluster = typeof rig.GetClusterLightData === "function" ? rig.GetClusterLightData() : null;
    if (cluster?.enabled && Array.isArray(cluster.lights) && cluster.lights.length) {
      this.lightSource = "cluster";
      for (const light of cluster.lights) {
        if (slot >= MAX_VOLUMETRIC_LIGHTS) break;
        const p = light.position;
        const c = light.color;
        if (!p || !c || !(light.radius > 0)) continue;
        pos[slot * 4] = p[0]; pos[slot * 4 + 1] = p[1]; pos[slot * 4 + 2] = p[2];
        pos[slot * 4 + 3] = light.radius;
        // 簇光的 color 已经是「线性 × 强度」，与 Push() 里那条乘法同口径，直接照抄。
        color[slot * 4] = c[0];
        color[slot * 4 + 1] = c[1];
        color[slot * 4 + 2] = c[2];
        slot += 1;
      }
      this.lightCount = slot;
      return;
    }
    const lights = Array.isArray(rig.fireLights) ? rig.fireLights : null;
    if (lights) {
      this.lightSource = "pool";
      for (const light of lights) Push(light.position, light.color.getHex(), light.intensity, light.distance);
      if (rig.muzzle) Push(rig.muzzle.position, rig.muzzle.color.getHex(), rig.muzzle.intensity, rig.muzzle.distance);
    } else if (typeof rig.GetEffectLightState === "function") {
      this.lightSource = "state";
      const state = rig.GetEffectLightState();
      for (const light of state.active || []) {
        Push({ x: light.position[0], y: light.position[1], z: light.position[2] },
          light.color, light.intensity, light.radius);
      }
    }
    this.lightCount = slot;
  }

  /**
   * `uSunShadowMap` 绑不到有效纹理时的兜底（**这是踩出来的，不是防御性代码**）。
   *
   * 实测 RTX 4070 SUPER / ANGLE-D3D11：`uSunShadowMap.value = null` 时 three 会绑
   * 它内部那张从没上传过的 `emptyShadowTexture`，那一次 draw 直接 **1282
   * INVALID_OPERATION 并被驱动整个丢掉** —— 注入图集变成 clear 值，雾当场消失
   * （画面表现是「突然没有雾了」，而 renderer.info 一切正常）。
   * 可达的路径有两条：开机头几帧阴影图还没烘出来；画质面板把阴影整体关掉。
   *
   * 兜底是一张真的挂在 FBO 上、真的清过一次的 1×1 深度靶：它是完整纹理，
   * 绑到 `sampler2DShadow` 上合法。反正 `uSunShadowEnabled = 0` 时
   * `SunShadowVisibility` 会提前返回 1.0，一次都不会去采它。
   */
  _EnsureShadowFallback(renderer) {
    if (this.shadowFallback) return this.shadowFallback.depthTexture;
    const rt = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: true });
    rt.texture.colorSpace = THREE.NoColorSpace;
    rt.depthTexture = new THREE.DepthTexture(1, 1);
    // 采样器类型必须与 `Script_Csm.SHADOW_MAP_TYPE` 一致：级联走 BasicShadowMap
    // （裸深度、plain sampler2D），这时**不能**留 compareFunction —— 带比较函数的
    // 深度纹理绑到 sampler2D 上是未定义行为（多数驱动整片返回 0，见坑表）。
    if (!CSM_RAW_DEPTH) rt.depthTexture.compareFunction = THREE.LessEqualCompare;
    const previous = renderer.getRenderTarget();
    renderer.setRenderTarget(rt);
    renderer.clear(true, true, false);
    renderer.setRenderTarget(previous);
    this.shadowFallback = rt;
    return rt.depthTexture;
  }

  Render(ctx) {
    this._EnsureVolumes();
    const write = this.flip ? this.volumeB : this.volumeA;
    const read = this.flip ? this.volumeA : this.volumeB;
    this.uniformsInject.uHistory.value = read.texture;
    // 阴影框每帧都在滚（跟玩家 + 吸附纹素），矩阵必须现取 —— 只接一次的话
    // 走两步之后光柱与建筑就错开了。
    this.sunShadowRig?.SyncShadowUniforms?.();
    // 2026-09 级联落地之后 `uSunShadowMap` 是一个**采样器数组**（逐级一张），
    // 所以「绑没绑上」要逐项看 —— 直接 `!value` 判一个数组永远是 false，
    // 兜底就再也不会生效了（那正是这段代码存在的理由）。
    const shadowMaps = this.uniformsInject.uSunShadowMap.value;
    const shadowMapsArray = Array.isArray(shadowMaps);
    if (!(shadowMapsArray ? shadowMaps.some(Boolean) : shadowMaps)) {
      const fallback = this._EnsureShadowFallback(ctx.renderer);
      if (shadowMapsArray) shadowMaps.fill(fallback);
      else this.uniformsInject.uSunShadowMap.value = fallback;
      this.uniformsInject.uSunShadowEnabled.value = 0;
    }
    ctx.blitter.Blit(this.materialInject, write);
    this.currentVolume = write;
    this.pipeline.targets.volumetricScatter = write;
    this.flip = !this.flip;
    this.hasHistory = true;
  }

  RenderIntegrate(ctx) {
    this.uniformsIntegrate.uVolume.value = (this.currentVolume || this.volumeA).texture;
    ctx.blitter.Blit(this.materialIntegrate, this.integrated);
  }

  RenderApply(ctx) {
    const A = this.uniformsApply;
    A.uIntegrated.value = this.integrated.texture;
    A.uNormalDepth.value = ctx.normalDepthTexture;
    ctx.blitter.Blit(this.materialApply, this.fogScatter);
    this.ready = true;
    // Composite 的接线点：只在真的产出了这张图之后才置 1。
    const composite = this.pipeline.compositePass?.uniforms;
    if (composite) {
      composite.uFogScatter.value = this.fogScatter.texture;
      composite.uFogSource.value = 1;
    }
    this.uniformsDebug.uVolume.value = (this.currentVolume || this.volumeA).texture;
    this.SyncSampleUniforms();
  }

  /** Debug Rendering 面板的四项。`mode` 见 MakeDebugFragment 的 uMode。 */
  GetDebugSource(view) {
    const modes = {
      volumetricDensity: 0, volumetricScatter: 1,
      volumetricTransmittance: 2, volumetricReproject: 3,
    };
    const mode = modes[view];
    if (mode === undefined) return null;
    return {
      material: this.materialDebug,
      // 不可用时走 DebugPass 的斜纹路径，那条要 texture + mode 才不会喂 undefined 进 uniform
      texture: this.integrated?.texture || null,
      mode: 4,
      unavailable: !this.ready || !this.materialDebug,
      Prepare: () => { this.uniformsDebug.uMode.value = mode; },
    };
  }

  Dispose() {
    for (const rt of [this.volumeA, this.volumeB, this.integrated, this.fogScatter,
      this.shadowFallback]) {
      if (rt) rt.dispose();
    }
    this.volumeA = null; this.volumeB = null; this.integrated = null; this.fogScatter = null;
    this.shadowFallback = null;
    this.noise?.dispose();
    this.noise = null;
    this.materialInject?.dispose();
    this.materialIntegrate?.dispose();
    this.materialApply?.dispose();
    this.materialDebug?.dispose();
    this.sunShadowRig?.UnregisterShadowUniforms?.(this.uniformsInject);
    this.fogVolumes.clear();
    this.sampleClients.clear();
  }
}
