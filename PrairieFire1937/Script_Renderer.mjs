// 《燎原 · 敌后1937》 —— three.js 3D 战场渲染器。
//
// 目标是现代 3A 策略游戏级别的观感，全部资产程序化生成（无任何外部贴图 / 模型）：
//   · 地块：平顶六边形棱柱（顶面多环细分 + 侧壁分层岩理），26×20=520 格合并成
//     单个 BufferGeometry，一次 draw call 画完；全场景稳定在 10 个 draw call 上下。
//   · 光照：方向光 + CSM 级联阴影 + 半球光 + 指数高度雾，太阳方位/高度/色温随
//     eraKey 与季节变化。
//   · 后处理：EffectComposer → RenderPass/SSAARenderPass → 自写 CinemaGrade
//     （阈值 Bloom + 解析式胶片 LUT + 暗角 + 颗粒）→ OutputPass。
//   · 迷雾：三态（未探索 / 已探索未见 / 可见）完全由一张 hexState DataTexture 驱动，
//     换回合只写纹理，绝不重建几何。
//   · 交互：hover 挤出描边、选中脉冲环、五种地毯高亮、地形起伏下精确拾取。
//
// 坐标契约来自 Script_Hex.mjs（平顶六边形，x = 1.5·size·q，z = √3·size·(r + q/2)，y 向上）。
// 模块顶层不执行任何 DOM / WebGL 副作用。

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.mjs";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.mjs";
import { RenderPass } from "three/addons/postprocessing/RenderPass.mjs";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.mjs";
import { OutputPass } from "three/addons/postprocessing/OutputPass.mjs";
import { SSAARenderPass } from "three/addons/postprocessing/SSAARenderPass.mjs";
import { CSM } from "three/addons/csm/CSM.mjs";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.mjs";

import {
  hexSize, hexDirections, HexKey, ParseHexKey, HexToWorld, WorldToHex, HexCornerOffsets,
  Clamp, Clamp01, Lerp, InverseLerp, SmoothStep, FractalNoise2D, ValueNoise2D, HashString, CreateRng,
} from "./Script_Hex.mjs";

import {
  CreateTerrainMaterial, CreateNoiseTexture, CreateSkyDome, CreateWaterMaterial,
  CreateSeasonPalette, CreateBannerTexture, CreateFogOfWarMaterial, CreateOverlayMaterial,
  CreateStateFallbackTexture, DisposeMaterialCache, ResolveTerrainProfile, overlayKindColors,
} from "./Script_Materials.mjs";

import {
  CreateUnitModel, CreateSettlementModel, CreateBlockhouseModel, CreateStrongholdModel,
  CreateDistrictModel, CreateWorkModel, CreateBannerModel, CreateTreeCluster,
  TickModelWind, DisposeModelCache, modelPalette,
} from "./Script_Models.mjs";

// ---------------------------------------------------------------------------
// 0. 常量
// ---------------------------------------------------------------------------

/** 方向索引 i 对应的两个角点下标（与 Script_Hex 的 hexDirections 一一对应）。 */
const hexEdgeCorners = Object.freeze([[0, 1], [5, 0], [4, 5], [3, 4], [2, 3], [1, 2]]);

/** 五种地毯高亮的顺序，编码进 highlightState 纹理的 R 通道。 */
const highlightKinds = Object.freeze(Object.keys(overlayKindColors));

const controlCodes = Object.freeze({ Enemy: 0, Contested: 1 / 3, Guerrilla: 2 / 3, Base: 1 });

const worldConfig = Object.freeze({
  tileRadius: 1.0,         // 连续大地方案：必须取满外接圆。0.985 是侧壁时代为凸显棋盘块留的细缝，
                           // 侧壁删除后那道缝就是露天的漏光勾缝，一个常量废掉整轮无缝重写
  elevationScale: 5.2,     // elevation 0..1 → 世界高度（相邻高差 ≤0.21 → ≈1.06 个 hexSize 的崖面）
  topRings: 3,             // 顶面环数（54 三角/格）
  strataBands: 3,          // 侧壁岩层带数
  wallSkirt: 0.30,         // 侧壁探入邻格顶面之下的深度
  edgeFloorDrop: 1.10,     // 地图边缘侧壁下沉深度
  waterLift: 0.030,
  overlayLift: 0.026,
  borderLift: 0.040,
  roadLift: 0.045,
  fogLowLift: 0.44,
  fogHighLift: 1.00,
  propLift: 0.012,         // 立体物件离地高度
});

/**
 * 地形分层抬升：在 elevation 之外再给每类地形一点固定落差，
 * 让"高山—山脊—丘陵—平原—河谷"的层次一眼可辨（数值保持温和，避免相邻格出现夸张断崖）。
 */
const terrainHeightLift = Object.freeze({
  Mountain: 0.46, Ridge: 0.28, Gorge: -0.22, Hill: 0.10, Forest: 0.05,
  Loess: 0.03, Plain: 0.0, Marsh: -0.08, River: -0.26,
});

/**
 * 单一画质档。
 *
 * 这里原本有 low / medium / high / ultra 四档，也就是四条各自独立的渲染路径
 * （不同的 pass 链、不同的 shader define 组合）。实际只有 high 被持续验证过，
 * 而 ultra 独有的 CSM 会让地形的片元着色器编译失败（`directionalLights[]`
 * 数组越界），three 拿不到程序就整块不画——页面看起来在正常运行，地图却是空的。
 * 这种问题只在没被验证的那条路径上出现，而分档本身就是在制造这种路径。
 *
 * 因此只保留一条渲染路径：所有设备用同一套 shader、同一条 pass 链。
 * 设备差异只通过 pixelRatio 与粒子上限调节——这两项不改变 shader 编译结果，
 * 因而不会引入未验证的分支。
 */
const singleQualityProfile = Object.freeze({
  pixelRatioCap: 1.6, shadows: true, csm: false, cascades: 0, shadowMapSize: 2048,
  composer: true, bloom: true, bloomTaps: 14, ssaa: false, skyClouds: true,
  terrainDetail: 1.0, bumpStrength: 0.90, waterDetail: 1.0, fogClouds: true,
  anisotropy: 8, maxParticles: 1600, csmMaxFar: 70, shadowSpan: 26,
});

const qualityProfiles = Object.freeze({
  low: singleQualityProfile,
  medium: singleQualityProfile,
  high: singleQualityProfile,
  ultra: singleQualityProfile,
});

/**
 * 存活渲染器计数。Script_Materials 的纹理缓存（噪声图、调色板、横幅）是跨实例共享的，
 * 只有最后一个渲染器销毁时才能拆掉，否则并存的第二个渲染器会拿到已释放的纹理。
 */
let liveRendererCount = 0;

/** 移动端 / 低性能设备自动降级。 */
function DetectDefaultQuality() {
  if (typeof window === "undefined") return "high";
  const width = window.innerWidth || 1280;
  const ratio = window.devicePixelRatio || 1;
  const touch = typeof navigator !== "undefined" && (navigator.maxTouchPoints || 0) > 1;
  const cores = (typeof navigator !== "undefined" && navigator.hardwareConcurrency) || 8;
  if (width < 560 || (touch && ratio >= 2.5 && width < 900) || cores <= 2) return "low";
  if (width < 820 || touch || cores <= 4) return "medium";
  return cores >= 12 && ratio <= 2 ? "ultra" : "high";
}

// ---------------------------------------------------------------------------
// 1. 后处理：自写色彩分级 / 阈值 Bloom / 暗角 / 胶片颗粒
// ---------------------------------------------------------------------------

/**
 * 工作在线性 HDR 空间（RenderPass 输出到 HalfFloat RT，three 在渲染到 RT 时
 * 不做 tone mapping，最终由 OutputPass 统一 ACES + sRGB）。
 */
const cinemaGradeShader = {
  name: "PrairieCinemaGrade",
  defines: { BLOOM_TAPS: 14 },
  uniforms: {
    tDiffuse: { value: null },
    uResolution: { value: new THREE.Vector2(1280, 720) },
    uTime: { value: 0 },
    uExposure: { value: 1.0 },
    uContrast: { value: 1.05 },
    uSaturation: { value: 1.0 },
    uLift: { value: new THREE.Vector3(0.012, 0.012, 0.016) },
    uGain: { value: new THREE.Vector3(1.0, 1.0, 1.0) },
    uGammaValue: { value: new THREE.Vector3(1.0, 1.0, 1.02) },
    uShadowTint: { value: new THREE.Color(0x28313c) },
    uHighlightTint: { value: new THREE.Color(0xffe3b4) },
    // 肩部提亮：ACES 的肩部压缩很强，线性 1.0 出来只有约 0.8，
    // 于是整幅画的 p99 卡在 0.69、亮度 0.875 以上的像素恒为 0——画面没有白点，
    // 看上去永远蒙着一层灰。这里只把「已经足够亮」的小面积区域往上推，
    // 中间调完全不动，从而在受光屋顶与水面碎光上建立真正的高光锚。
    // 注意：本 pass 工作在**线性**空间，OutputPass 之后才做 sRGB 编码。
    // 屏幕上看到的 p99≈0.64 对应线性值只有约 0.38，因此阈值必须按线性刻度设，
    // 而不是按屏幕刻度——起点设 0.30 会正好落在曲线最平处，提亮等于没做
    // （实测把增益开到 8.0，p99 依然纹丝不动）。
    // 目标：线性 0.38 推到约 0.69，编码后就是屏幕上的 0.85 白点。
    uShoulderGain: { value: 0.85 },
    uShoulderStart: { value: 0.23 },
    uShoulderSpan: { value: 0.13 },
    uVignette: { value: 0.24 },
    uVignetteStart: { value: 0.58 },
    uGrain: { value: 0.034 },
    uBloomThreshold: { value: 0.8 },
    uBloomSoftness: { value: 0.45 },
    uBloomStrength: { value: 0.42 },
    uBloomRadius: { value: 31.0 },
  },
  vertexShader: `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}`,
  fragmentShader: `
uniform sampler2D tDiffuse;
uniform vec2 uResolution;
uniform float uTime;
uniform float uExposure;
uniform float uContrast;
uniform float uSaturation;
uniform vec3 uLift;
uniform vec3 uGain;
uniform vec3 uGammaValue;
uniform vec3 uShadowTint;
uniform vec3 uHighlightTint;
uniform float uShoulderGain;
uniform float uShoulderStart;
uniform float uShoulderSpan;
uniform float uVignette;
uniform float uVignetteStart;
uniform float uGrain;
uniform float uBloomThreshold;
uniform float uBloomSoftness;
uniform float uBloomStrength;
uniform float uBloomRadius;
varying vec2 vUv;

const vec3 lumaWeights = vec3( 0.2126, 0.7152, 0.0722 );

float Hash21( vec2 p ) {
  vec3 q = fract( vec3( p.xyx ) * vec3( 0.1031, 0.1030, 0.0973 ) );
  q += dot( q, q.yzx + 33.33 );
  return fract( ( q.x + q.y ) * q.z );
}

#ifdef ENABLE_BLOOM
// 黄金角螺旋采样的阈值泛光：单 pass 完成，无需额外 render target。
vec3 GatherBloom( vec2 uv, vec2 texel ) {
  vec3 total = vec3( 0.0 );
  float weightTotal = 0.0;
  for ( int i = 0; i < BLOOM_TAPS; i ++ ) {
    float fi = float( i ) + 0.5;
    float angle = fi * 2.39996323;
    float radius = sqrt( fi / float( BLOOM_TAPS ) );
    vec2 offset = vec2( cos( angle ), sin( angle ) ) * radius * uBloomRadius * texel;
    vec3 sampled = texture2D( tDiffuse, uv + offset ).rgb;
    float luma = dot( sampled, lumaWeights );
    float mask = smoothstep( uBloomThreshold, uBloomThreshold + uBloomSoftness, luma );
    float weight = 1.0 - radius * 0.55;
    total += sampled * mask * weight;
    weightTotal += weight;
  }
  return total / max( weightTotal, 0.0001 );
}
#endif

void main() {
  vec2 texel = 1.0 / max( uResolution, vec2( 1.0 ) );
  vec3 color = texture2D( tDiffuse, vUv ).rgb;

  #ifdef ENABLE_BLOOM
    color += GatherBloom( vUv, texel ) * uBloomStrength;
  #endif

  color *= uExposure;

  // 解析式胶片 LUT：gain → lift → 逐通道 gamma（趾部/肩部略有差异，做出 40 年代
  // 纪实影像的冷阴影 / 暖高光，但不压细节）
  color = color * uGain + uLift;
  color = pow( max( color, vec3( 0.0 ) ), uGammaValue );

  float luma = dot( color, lumaWeights );
  float shadowWeight = 1.0 - smoothstep( 0.0, 0.40, luma );
  float highlightWeight = smoothstep( 0.30, 1.05, luma );
  vec3 shadowTintNormalized = uShadowTint / max( dot( uShadowTint, lumaWeights ), 0.001 );
  vec3 highlightTintNormalized = uHighlightTint / max( dot( uHighlightTint, lumaWeights ), 0.001 );
  color *= mix( vec3( 1.0 ), shadowTintNormalized, shadowWeight * 0.16 );
  color *= mix( vec3( 1.0 ), highlightTintNormalized, highlightWeight * 0.22 );

  color = mix( vec3( luma ), color, uSaturation );
  color = ( color - 0.18 ) * uContrast + 0.18;

  // 肩部：把已经接近上限的区域推到真正的白，让画面有高光锚点。
  // 用平方权重保证只有很小一部分面积被推上去，中间调不被抬灰。
  float shoulderLuma = dot( max( color, vec3( 0.0 ) ), lumaWeights );
  float shoulder = smoothstep( uShoulderStart, uShoulderStart + uShoulderSpan, shoulderLuma );
  color *= 1.0 + uShoulderGain * shoulder * shoulder;

  // 暗角（按画幅比例校正，避免宽屏两侧过黑）
  vec2 centered = ( vUv - 0.5 ) * vec2( max( uResolution.x / max( uResolution.y, 1.0 ), 0.001 ), 1.0 );
  float vignetteAmount = smoothstep( uVignetteStart, 1.05, length( centered ) * 1.35 );
  color *= 1.0 - uVignette * pow( vignetteAmount, 1.4 );

  // 胶片颗粒：峰值落在中间调。深暗部（未探索区占整局 85% 画面）必须让开，
  // 满强度颗粒会把那里仅有的 ±0.1 高程明暗带整个吃掉；高光同样收敛。
  vec2 grainCoord = vUv * min( uResolution, vec2( 1920.0, 1080.0 ) ) * 0.75;
  float grain = Hash21( grainCoord + vec2( fract( uTime * 13.0 ) * 311.0, fract( uTime * 7.0 ) * 197.0 ) ) - 0.5;
  float grainWeight = mix( 0.30, 1.0, smoothstep( 0.16, 0.40, luma ) )
                    * mix( 1.0, 0.30, smoothstep( 0.45, 0.95, luma ) );
  color += grain * uGrain * grainWeight;

  gl_FragColor = vec4( max( color, vec3( 0.0 ) ), 1.0 );
}`,
};

// ---------------------------------------------------------------------------
// 2. 几何工具
// ---------------------------------------------------------------------------

/** 生成单位外接圆的六边形多环细分布局（顶点 + 索引），复用于顶面 / 地毯 / 云雾。 */
function CreateHexRingLayout(rings) {
  const corners = HexCornerOffsets(1);
  const points = [{ x: 0, z: 0, t: 0 }];
  const ringStart = [0];
  for (let ring = 1; ring <= rings; ring += 1) {
    ringStart.push(points.length);
    const scale = ring / rings;
    for (let side = 0; side < 6; side += 1) {
      const from = corners[side];
      const to = corners[(side + 1) % 6];
      for (let step = 0; step < ring; step += 1) {
        const t = step / ring;
        points.push({ x: Lerp(from.x, to.x, t) * scale, z: Lerp(from.z, to.z, t) * scale, t: scale });
      }
    }
  }
  const indices = [];
  for (let ring = 1; ring <= rings; ring += 1) {
    const outerBase = ringStart[ring];
    const innerBase = ringStart[ring - 1];
    const outerCount = ring * 6;
    const innerCount = (ring - 1) * 6;
    let innerCursor = 0;
    let outerCursor = 0;
    for (let side = 0; side < 6; side += 1) {
      for (let step = 0; step < ring; step += 1) {
        const outerCurrent = outerBase + (outerCursor % outerCount);
        const outerNext = outerBase + ((outerCursor + 1) % outerCount);
        const innerCurrent = innerBase + (innerCount > 0 ? innerCursor % innerCount : 0);
        indices.push(innerCurrent, outerNext, outerCurrent);
        if (step < ring - 1) {
          if (innerCount > 0) {
            const innerNext = innerBase + ((innerCursor + 1) % innerCount);
            indices.push(innerCurrent, innerNext, outerNext);
          }
          innerCursor += 1;
        }
        outerCursor += 1;
      }
    }
  }
  return { points, indices, ringStart };
}

/** 把一堆同结构 BufferGeometry 合并成一个，并释放源几何体。 */
function MergeAndDispose(list) {
  if (!list.length) return null;
  const merged = mergeGeometries(list, false);
  for (const geometry of list) geometry.dispose();
  return merged;
}

/** 世界坐标下的一段带状面片（道路 / 铁轨 / 边界线）。 */
function PushRibbon(target, fromX, fromY, fromZ, toX, toY, toZ, halfWidth, color, segments = 2, hexUv = null) {
  const dx = toX - fromX;
  const dz = toZ - fromZ;
  const length = Math.hypot(dx, dz) || 1;
  const px = (-dz / length) * halfWidth;
  const pz = (dx / length) * halfWidth;
  const baseIndex = target.positions.length / 3;
  for (let step = 0; step <= segments; step += 1) {
    const t = step / segments;
    const cx = Lerp(fromX, toX, t);
    const cy = Lerp(fromY, toY, t);
    const cz = Lerp(fromZ, toZ, t);
    target.positions.push(cx - px, cy, cz - pz, cx + px, cy, cz + pz);
    target.normals.push(0, 1, 0, 0, 1, 0);
    target.uvs.push(0, t, 1, t);
    target.colors.push(color.r, color.g, color.b, color.r, color.g, color.b);
    if (hexUv) target.hexUvs.push(hexUv[0], hexUv[1], hexUv[0], hexUv[1]);
  }
  for (let step = 0; step < segments; step += 1) {
    const a = baseIndex + step * 2;
    target.indices.push(a, a + 1, a + 3, a, a + 3, a + 2);
  }
}

/** 从收集器数组生成 BufferGeometry。 */
function FinalizeGeometry(target, extras = {}) {
  if (!target.positions.length) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(target.positions, 3));
  if (target.normals.length) geometry.setAttribute("normal", new THREE.Float32BufferAttribute(target.normals, 3));
  if (target.uvs.length) geometry.setAttribute("uv", new THREE.Float32BufferAttribute(target.uvs, 2));
  if (target.colors.length) geometry.setAttribute("color", new THREE.Float32BufferAttribute(target.colors, 3));
  if (target.hexUvs && target.hexUvs.length) geometry.setAttribute("aHexUv", new THREE.Float32BufferAttribute(target.hexUvs, 2));
  if (target.facets && target.facets.length) geometry.setAttribute("aFacet", new THREE.Float32BufferAttribute(target.facets, 3));
  if (target.puffs && target.puffs.length) geometry.setAttribute("aPuff", new THREE.Float32BufferAttribute(target.puffs, 3));
  geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(target.indices), 1));
  if (extras.computeNormals) geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  geometry.computeBoundingBox();
  return geometry;
}

function CreateCollector() {
  return { positions: [], normals: [], uvs: [], colors: [], hexUvs: [], facets: [], puffs: [], indices: [] };
}

// ---------------------------------------------------------------------------
// 2.5 立体物件的实例化合批池
// ---------------------------------------------------------------------------

/**
 * Script_Models 的每个模型 = 一份「共享缓存几何体 + 共享材质」的 Mesh。
 * 本池按 (几何体, 材质) 归并全部摆放位置，每组只出一个 InstancedMesh，
 * 因此"地图上 300 个物件"仍只有十几个 draw call。
 *
 * 更新流程：Begin() → Push(...)×N → Commit()。容量足够时只重写实例矩阵，
 * 不重建任何几何体，满足"每回合增量更新"的要求。
 */
function CreateInstancePool(parent, name) {
  return { parent, name, groups: new Map(), scratchMatrix: new THREE.Matrix4() };
}

function InstancePoolBegin(pool) {
  for (const group of pool.groups.values()) group.pending.length = 0;
}

/**
 * 登记一次摆放。matrix 会被复制，调用方可以复用同一个 Matrix4。
 * tint 为可选的实例色（与顶点色相乘），用于焦土压暗、阵营着色等。
 */
function InstancePoolPush(pool, geometry, material, matrix, tint, castShadow) {
  if (!geometry || !material) return;
  const key = `${geometry.uuid}|${material.uuid}`;
  let group = pool.groups.get(key);
  if (!group) {
    group = { geometry, material, capacity: 0, mesh: null, pending: [], castShadow: castShadow !== false };
    pool.groups.set(key, group);
  }
  group.pending.push({ matrix: matrix.clone(), tint: tint || null });
}

function InstancePoolCommit(pool, options = {}) {
  const receiveShadow = options.receiveShadow !== false;
  const renderOrder = options.renderOrder ?? 0;
  const white = new THREE.Color(1, 1, 1);
  for (const group of pool.groups.values()) {
    const count = group.pending.length;
    if (count === 0) {
      if (group.mesh) group.mesh.count = 0;
      continue;
    }
    if (!group.mesh || group.capacity < count) {
      if (group.mesh) {
        pool.parent.remove(group.mesh);
        group.mesh.dispose();          // 只释放实例属性缓冲，共享的几何体/材质不动
      }
      group.capacity = Math.max(8, Math.ceil(count * 1.5));
      const mesh = new THREE.InstancedMesh(group.geometry, group.material, group.capacity);
      mesh.name = `${pool.name}_${group.geometry.uuid.slice(0, 8)}`;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(group.capacity * 3).fill(1), 3);
      mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
      // 逐组决定是否投影：树丛与底座数量大且贡献低，不进阴影 pass，
      // 直接省掉「级联数 × 组数」的阴影 draw call。
      mesh.castShadow = group.castShadow && (options.castShadow !== false);
      mesh.receiveShadow = receiveShadow;
      mesh.renderOrder = renderOrder;
      mesh.frustumCulled = false;      // 合批后包围球覆盖全图，逐帧剔除无意义
      group.mesh = mesh;
      pool.parent.add(mesh);
    }
    for (let index = 0; index < count; index += 1) {
      const record = group.pending[index];
      group.mesh.setMatrixAt(index, record.matrix);
      group.mesh.setColorAt(index, record.tint || white);
    }
    group.mesh.count = count;
    group.mesh.instanceMatrix.needsUpdate = true;
    if (group.mesh.instanceColor) group.mesh.instanceColor.needsUpdate = true;
    group.mesh.computeBoundingSphere();
  }
}

function InstancePoolStats(pool) {
  let calls = 0;
  let instances = 0;
  let triangles = 0;
  for (const group of pool.groups.values()) {
    if (!group.mesh || group.mesh.count === 0) continue;
    calls += 1;
    instances += group.mesh.count;
    const index = group.geometry.getIndex();
    const vertexCount = index ? index.count : group.geometry.getAttribute("position").count;
    triangles += (vertexCount / 3) * group.mesh.count;
  }
  return { calls, instances, triangles };
}

function InstancePoolDispose(pool) {
  for (const group of pool.groups.values()) {
    if (!group.mesh) continue;
    pool.parent.remove(group.mesh);
    group.mesh.dispose();
  }
  pool.groups.clear();
}

/**
 * 给道路 / 铁路这类"线性设施"材质注入战争迷雾遮罩：
 * 顶点带 aHexUv，片元采样 hexState，未探索直接 discard，已探索未见的转灰。
 * 这样右半屏没侦察过的区域不会白送一整张公路铁路网给玩家。
 */
function AttachStructureFogFactory(uniforms) {
  return function AttachStructureFog(material) {
    const compile = function StructureFogOnBeforeCompile(shader) {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nattribute vec2 aHexUv;\nvarying vec2 vStructureHexUv;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvStructureHexUv = aHexUv;");
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", "#include <common>\nuniform sampler2D uHexState;\nuniform vec3 uMemoryTint;\nvarying vec2 vStructureHexUv;")
        .replace("#include <color_fragment>", [
          "#include <color_fragment>",
          "{",
          "  vec4 structureState = texture2D( uHexState, vStructureHexUv );",
          "  if ( structureState.r < 0.5 ) discard;",
          "  float structureMemory = 1.0 - smoothstep( 0.15, 0.6, structureState.g );",
          "  float structureLuma = dot( diffuseColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) );",
          "  diffuseColor.rgb = mix( diffuseColor.rgb, mix( vec3( structureLuma ), uMemoryTint * ( 0.3 + structureLuma * 0.55 ), 0.4 ) * 0.82, structureMemory * 0.78 );",
          "}",
        ].join("\n"));
    };
    material.onBeforeCompile = compile;
    material.userData.baseOnBeforeCompile = compile;
    material.userData.uniforms = uniforms;
    material.needsUpdate = true;
  };
}

/** 从 Script_Models 返回的 Group 中取出「几何体 + 材质 + 本地变换」，供合批池使用。 */
function HarvestModelParts(group, target) {
  target.length = 0;
  if (!group) return target;
  group.updateMatrixWorld(true);
  group.traverse((object) => {
    if (!object.isMesh) return;
    if (object.isInstancedMesh) {
      // 树丛等已经是 InstancedMesh：把每个实例的局部矩阵摊平进来
      const local = new THREE.Matrix4();
      for (let index = 0; index < object.count; index += 1) {
        object.getMatrixAt(index, local);
        target.push({
          geometry: object.geometry,
          material: object.material,
          matrix: object.matrixWorld.clone().multiply(local),
        });
      }
      return;
    }
    target.push({ geometry: object.geometry, material: object.material, matrix: object.matrixWorld.clone() });
  });
  return target;
}

// ---------------------------------------------------------------------------
// 3. 主入口
// ---------------------------------------------------------------------------

/**
 * 创建渲染器句柄。
 * options: { quality, terrainDefinitions, seed, background, autoQuality, cameraDistance }
 */
export function CreateRenderer(canvas, options = {}) {
  if (!canvas) throw new Error("CreateRenderer 需要一个 canvas 元素");
  liveRendererCount += 1;

  // ---- 基础设施 ----------------------------------------------------------
  let quality = qualityProfiles[options.quality] ? options.quality : DetectDefaultQuality();
  let profile = qualityProfiles[quality];

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: !profile.composer,
    alpha: false,
    powerPreference: "high-performance",
    stencil: false,
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.30;
  renderer.shadowMap.enabled = profile.shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(0x9fb0bd, 1);
  // 关掉自动归零，改由 Update 在帧首手动 reset，使 renderer.info 统计整帧真实开销
  renderer.info.autoReset = false;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0xb9bfb2, 0.0125);

  const camera = new THREE.PerspectiveCamera(38, 16 / 9, 0.5, 1600);
  camera.position.set(0, 20, 24);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.085;
  controls.screenSpacePanning = false;
  controls.rotateSpeed = 0.55;
  controls.zoomSpeed = 0.85;
  controls.panSpeed = 0.8;
  // 俯仰 25°–75°（以水平面为基准）→ OrbitControls 极角 15°–65°
  controls.minPolarAngle = THREE.MathUtils.degToRad(15);
  controls.maxPolarAngle = THREE.MathUtils.degToRad(65);
  controls.minDistance = 6;
  controls.maxDistance = 54;
  // Civ 式操作：左键拖动平移（左键单击留给选格）、右键旋转、滚轮/双指缩放
  controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
  controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };

  // ---- 材质与共享资源 ----------------------------------------------------
  const noiseTexture = CreateNoiseTexture(128, { seed: 19370707, octaves: 3, anisotropy: profile.anisotropy });
  const terrainMaterial = CreateTerrainMaterial(renderer, {
    noiseTexture,
    detailStrength: profile.terrainDetail,
    bumpStrength: profile.bumpStrength,
  });
  const waterMaterial = CreateWaterMaterial();
  const fogOfWarMaterial = CreateFogOfWarMaterial();
  const overlayMaterial = CreateOverlayMaterial("composite");
  const hoverMaterial = CreateOverlayMaterial("hover");
  const selectMaterial = CreateOverlayMaterial("select");
  const roadMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.98, metalness: 0.0, name: "PrairieRoad" });
  const railMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.35, name: "PrairieRail" });
  // 路网也要吃战争迷雾：未探索格直接 discard，已探索未见的降饱和
  const structureFogUniforms = {
    uHexState: { value: CreateStateFallbackTexture() },
    uMemoryTint: { value: new THREE.Color(0x707a86) },
  };
  const AttachStructureFog = AttachStructureFogFactory(structureFogUniforms);
  AttachStructureFog(roadMaterial);
  AttachStructureFog(railMaterial);
  const borderMaterial = new THREE.MeshBasicMaterial({
    vertexColors: true, transparent: true, opacity: 0.52, depthWrite: false,
    side: THREE.DoubleSide, name: "PrairieBorder",
  });
  borderMaterial.polygonOffset = true;
  borderMaterial.polygonOffsetFactor = -3;
  borderMaterial.polygonOffsetUnits = -3;
  const localMaterials = [roadMaterial, railMaterial, borderMaterial];
  const standardMaterials = [terrainMaterial, roadMaterial, railMaterial];

  // ---- 场景骨架 ----------------------------------------------------------
  const skyDome = CreateSkyDome();
  scene.add(skyDome);

  const terrainGroup = new THREE.Group();
  terrainGroup.name = "PrairieTerrainGroup";
  const overlayGroup = new THREE.Group();
  overlayGroup.name = "PrairieOverlayGroup";
  const propGroup = new THREE.Group();
  propGroup.name = "PrairiePropGroup";
  scene.add(terrainGroup, overlayGroup, propGroup);

  const sunLight = new THREE.DirectionalLight(0xffd9a4, 2.5);
  sunLight.position.set(30, 40, 26);
  sunLight.target.position.set(0, 0, 0);
  sunLight.shadow.camera.near = 1;
  sunLight.shadow.camera.far = 160;
  sunLight.shadow.camera.left = -26;
  sunLight.shadow.camera.right = 26;
  sunLight.shadow.camera.top = 26;
  sunLight.shadow.camera.bottom = -26;
  sunLight.shadow.bias = -0.0006;
  sunLight.shadow.normalBias = 0.02;
  scene.add(sunLight, sunLight.target);

  const hemisphereLight = new THREE.HemisphereLight(0xa9c0d4, 0x6a6152, 0.78);
  scene.add(hemisphereLight);
  const fillLight = new THREE.AmbientLight(0x54606c, 0.22);
  scene.add(fillLight);

  // ---- 运行期状态 --------------------------------------------------------
  let csm = null;
  let composer = null;
  let gradePass = null;
  let ssaaPass = null;
  let renderPass = null;
  let outputPass = null;

  let currentState = null;
  let terrainDefinitions = options.terrainDefinitions || null;
  let palette = CreateSeasonPalette("Opening", 0);
  let elapsedTime = 0;
  let windStrength = 1;
  let disposed = false;

  const hexEntries = [];
  const hexByKey = new Map();
  let stateTextureWidth = 1;
  let stateTextureHeight = 1;
  let hexStateData = null;
  let hexStateTexture = null;
  let highlightData = null;
  let highlightTexture = null;
  const highlightByKind = new Map();

  let terrainMesh = null;
  let waterMesh = null;
  let roadMesh = null;
  let railMesh = null;
  let borderMesh = null;
  let overlayMesh = null;
  const fogCloudMeshes = [];
  let hoverMesh = null;
  let selectMesh = null;

  let structureSignature = "";
  let borderSignature = "";
  let paletteSignature = "";
  let staticPropSignature = "";

  let hoverKey = null;
  let selectedKey = null;

  const mapBounds = { minX: -20, maxX: 20, minZ: -20, maxZ: 20, centerX: 0, centerZ: 0, averageTopY: 0, minTopY: 0, maxTopY: 1 };

  const raycaster = new THREE.Raycaster();
  const pointerVector = new THREE.Vector2();
  const pickPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const pickPoint = new THREE.Vector3();
  const scratchVector = new THREE.Vector3();
  let pickCacheX = -99999;
  let pickCacheY = -99999;
  let pickCacheKey = null;

  let focusFlight = null;

  // 尝试异步载入 Data_Terrain.mjs（该文件由另一 agent 并行编写，可能尚未存在）。
  // 未到位时使用 Script_Materials 的内置回退表；到位后自动刷新顶点色。
  if (!terrainDefinitions) {
    Promise.resolve()
      .then(() => import("./Data_Terrain.mjs"))
      .then((module) => {
        if (disposed || !module || !module.terrainDefinitions) return;
        terrainDefinitions = module.terrainDefinitions;
        if (currentState) RefreshTerrainColors();
      })
      .catch(() => { /* 文件缺失属预期情况，静默沿用内置回退表 */ });
  }

  // -------------------------------------------------------------------------
  // 3.1 地图索引与状态纹理
  // -------------------------------------------------------------------------

  function BuildHexIndex(state) {
    hexEntries.length = 0;
    hexByKey.clear();
    const map = state && state.map ? state.map : null;
    if (!map || !map.hexes) return false;
    const order = Array.isArray(map.order) && map.order.length ? map.order : Object.keys(map.hexes);
    const seed = HashString(String(state.seed ?? map.width ?? 26));

    stateTextureWidth = Math.max(1, Math.ceil(Math.sqrt(order.length)));
    stateTextureHeight = Math.max(1, Math.ceil(order.length / stateTextureWidth));

    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    let sumTopY = 0, minTopY = Infinity, maxTopY = -Infinity;

    for (let index = 0; index < order.length; index += 1) {
      const key = order[index];
      const hex = map.hexes[key];
      if (!hex) continue;
      const axial = ParseHexKey(key);
      const world = HexToWorld(axial.q, axial.r, hexSize);
      const terrainProfile = ResolveTerrainProfile(hex.terrain, terrainDefinitions);
      const elevation = Clamp01(Number(hex.elevation) || 0);
      const topY = elevation * worldConfig.elevationScale + (terrainHeightLift[hex.terrain] ?? 0);
      const column = index % stateTextureWidth;
      const row = Math.floor(index / stateTextureWidth);
      const entry = {
        key, hex, index,
        q: axial.q, r: axial.r,
        x: world.x, z: world.z,
        elevation,
        moisture: Clamp01(Number(hex.moisture) || 0),
        profile: terrainProfile,
        topY,
        centerY: topY,   // 建好几何前先等于高台高度，随后由 SampleTopHeight 精确回填
        crestY: topY,
        stateU: (column + 0.5) / stateTextureWidth,
        stateV: (row + 0.5) / stateTextureHeight,
        phaseByte: Math.floor(ValueNoise2D(axial.q * 1.7, axial.r * 2.3, seed) * 255),
        seed: seed ^ HashString(key),
      };
      hexEntries.push(entry);
      hexByKey.set(key, entry);
      minX = Math.min(minX, world.x); maxX = Math.max(maxX, world.x);
      minZ = Math.min(minZ, world.z); maxZ = Math.max(maxZ, world.z);
      sumTopY += topY;
      minTopY = Math.min(minTopY, topY);
      maxTopY = Math.max(maxTopY, topY);
    }

    if (!hexEntries.length) return false;
    mapBounds.minX = minX - 1.5;
    mapBounds.maxX = maxX + 1.5;
    mapBounds.minZ = minZ - 1.5;
    mapBounds.maxZ = maxZ + 1.5;
    mapBounds.centerX = (minX + maxX) * 0.5;
    mapBounds.centerZ = (minZ + maxZ) * 0.5;
    mapBounds.averageTopY = sumTopY / hexEntries.length;
    mapBounds.minTopY = minTopY;
    mapBounds.maxTopY = maxTopY;
    // 精确回填每格中心的真实地表高度：立体物件、特效与选中环都以它为准，
    // 否则山顶隆起会把模型埋进地里。
    for (const entry of hexEntries) {
      entry.centerY = SampleTopHeight(entry, 0, 0, 0);
      entry.crestY = Math.max(entry.topY, entry.centerY);
      mapBounds.maxTopY = Math.max(mapBounds.maxTopY, entry.crestY);
    }
    return true;
  }

  function CreateStateTextures() {
    DisposeStateTextures();
    const texelCount = stateTextureWidth * stateTextureHeight;
    hexStateData = new Uint8Array(texelCount * 4);
    hexStateTexture = new THREE.DataTexture(hexStateData, stateTextureWidth, stateTextureHeight, THREE.RGBAFormat, THREE.UnsignedByteType);
    hexStateTexture.magFilter = THREE.NearestFilter;
    hexStateTexture.minFilter = THREE.NearestFilter;
    hexStateTexture.generateMipmaps = false;
    hexStateTexture.needsUpdate = true;
    hexStateTexture.name = "PrairieHexState";

    highlightData = new Uint8Array(texelCount * 4);
    highlightTexture = new THREE.DataTexture(highlightData, stateTextureWidth, stateTextureHeight, THREE.RGBAFormat, THREE.UnsignedByteType);
    highlightTexture.magFilter = THREE.NearestFilter;
    highlightTexture.minFilter = THREE.NearestFilter;
    highlightTexture.generateMipmaps = false;
    highlightTexture.needsUpdate = true;
    highlightTexture.name = "PrairieHighlightState";

    terrainMaterial.userData.uniforms.uHexState.value = hexStateTexture;
    waterMaterial.userData.uniforms.uHexState.value = hexStateTexture;
    fogOfWarMaterial.userData.uniforms.uHexState.value = hexStateTexture;
    structureFogUniforms.uHexState.value = hexStateTexture;
    overlayMaterial.userData.uniforms.uHighlightState.value = highlightTexture;
  }

  function DisposeStateTextures() {
    if (hexStateTexture) {
      hexStateTexture.dispose();
      hexStateTexture = null;
      const fallback = CreateStateFallbackTexture();
      terrainMaterial.userData.uniforms.uHexState.value = fallback;
      waterMaterial.userData.uniforms.uHexState.value = fallback;
      fogOfWarMaterial.userData.uniforms.uHexState.value = fallback;
      structureFogUniforms.uHexState.value = fallback;
    }
    if (highlightTexture) {
      highlightTexture.dispose();
      highlightTexture = null;
      overlayMaterial.userData.uniforms.uHighlightState.value = CreateStateFallbackTexture([0, 0, 0, 0]);
    }
    hexStateData = null;
    highlightData = null;
  }

  /** 把当前回合的探索/视野/归属/焦土写进 hexState 纹理。 */
  function WriteHexState() {
    if (!hexStateData) return;
    for (const entry of hexEntries) {
      const hex = entry.hex;
      const offset = entry.index * 4;
      const explored = hex.explored ? 255 : 0;
      const visibility = Clamp01((Number(hex.visibility) || 0) / 2);
      const controlCode = controlCodes[hex.control] ?? 0;
      const scorch = Clamp01((Number(hex.scorch) || 0) / 100);
      hexStateData[offset] = explored;
      hexStateData[offset + 1] = Math.round(visibility * 255);
      hexStateData[offset + 2] = Math.round(controlCode * 255);
      hexStateData[offset + 3] = Math.round(scorch * 255);
    }
    hexStateTexture.needsUpdate = true;
  }

  function RewriteHighlightTexture() {
    if (!highlightData) return;
    highlightData.fill(0);
    for (const [kindName, keySet] of highlightByKind) {
      const code = highlightKinds.indexOf(kindName) + 1;
      if (code <= 0) continue;
      const encoded = Math.round((code / highlightKinds.length) * 255);
      for (const key of keySet) {
        const entry = hexByKey.get(key);
        if (!entry) continue;
        const offset = entry.index * 4;
        highlightData[offset] = encoded;
        highlightData[offset + 1] = 255;
        highlightData[offset + 2] = entry.phaseByte;
        highlightData[offset + 3] = 255;
      }
    }
    highlightTexture.needsUpdate = true;
  }

  // -------------------------------------------------------------------------
  // 3.2 地形几何
  // -------------------------------------------------------------------------

  const topLayout = CreateHexRingLayout(worldConfig.topRings);
  const carpetLayout = CreateHexRingLayout(2);
  const scratchColor = new THREE.Color();
  const colorLowCache = new Map();
  const colorHighCache = new Map();
  const strataLowCache = new Map();
  const strataHighCache = new Map();

  function CachedColor(cache, value) {
    let color = cache.get(value);
    if (!color) { color = new THREE.Color(value); cache.set(value, color); }
    return color;
  }

  // 常驻的噪声参数对象：顶点级采样每帧成千上万次，避免逐次分配临时对象
  const reliefNoiseOptions = { octaves: 3, seed: 4177, persistence: 0.5 };
  const fineNoiseOptions = { octaves: 2, seed: 9311 };
  const blotchNoiseOptions = { octaves: 3, seed: 2711 };

  /**
   * 文明6 方案的连续地表：六角格不再是一块块带侧壁的"饼干"，而是一张
   * 连续起伏的大地——每个角点的高度取共享该角的至多三格的平均值，
   * 边缘区（radialT 0.55→1.0）从本格中心值平滑融向共享角点插值。
   * 相邻两格沿公共边算出的目标值完全一致，因此拼合处严格无缝；
   * 高差大的地方（河谷、山脚）自然形成陡坡，而不是垂直崖缝。
   */
  const cornerBlendCache = new Map();

  function CornerBlend(entry, cornerIndex) {
    const cacheKey = entry.key + "#" + cornerIndex;
    const cached = cornerBlendCache.get(cacheKey);
    if (cached) return cached;
    const dirs = cornerNeighbourDirections[cornerIndex];
    let height = entry.topY;
    let relief = entry.profile.relief;
    let count = 1;
    for (const side of dirs) {
      const direction = hexDirections[side];
      const neighbour = hexByKey.get(HexKey(entry.q + direction.q, entry.r + direction.r));
      if (!neighbour) continue;
      height += neighbour.topY;
      relief += neighbour.profile.relief;
      count += 1;
    }
    const blend = { height: height / count, relief: relief / count };
    cornerBlendCache.set(cacheKey, blend);
    return blend;
  }

  /** 由本格坐标系内的角度求所在扇区的两个角与沿边比例。 */
  function EdgeTargetAt(entry, localX, localZ) {
    let angle = Math.atan2(localZ, localX);
    if (angle < 0) angle += Math.PI * 2;
    const sector = Math.floor(angle / (Math.PI / 3)) % 6;
    const cornerA = sector;
    const cornerB = (sector + 1) % 6;
    const fraction = (angle - sector * (Math.PI / 3)) / (Math.PI / 3);
    const blendA = CornerBlend(entry, cornerA);
    const blendB = CornerBlend(entry, cornerB);
    return {
      height: Lerp(blendA.height, blendB.height, fraction),
      relief: Lerp(blendA.relief, blendB.relief, fraction),
    };
  }

  function RadialTOf(localX, localZ) {
    return Clamp01(Math.hypot(localX, localZ) / worldConfig.tileRadius);
  }

  function SampleTopHeight(entry, localX, localZ, radialT) {
    const worldX = entry.x + localX;
    const worldZ = entry.z + localZ;
    const relief = FractalNoise2D(worldX * 0.62, worldZ * 0.62, reliefNoiseOptions) - 0.5;
    const fine = FractalNoise2D(worldX * 2.4, worldZ * 2.4, fineNoiseOptions) - 0.5;
    const peak = entry.profile.peak * Math.pow(1 - radialT, 1.7);
    const centerHeight =
      entry.topY + (relief * 2 * entry.profile.relief + fine * 0.5 * entry.profile.relief) * (1 - 0.62 * Math.pow(radialT, 2.2)) + peak;
    const edgeWeight = SmoothStep(0.5, 1.0, radialT);
    if (edgeWeight <= 0) return centerHeight;
    const target = EdgeTargetAt(entry, localX, localZ);
    // 边缘细节噪声只依赖世界坐标与混合后的起伏系数，两侧算出的值严格一致
    const sharedDetail = (relief * 2 + fine * 0.5) * target.relief * 0.38;
    return Lerp(centerHeight, target.height + sharedDetail, edgeWeight);
  }

  const neighbourColorScratch = new THREE.Color();
  const neighbourColorSum = new THREE.Color();

  /** 边缘区颜色互融：取共享该点的相邻格在同一世界点的颜色平均值。 */
  function BlendEdgeColor(entry, worldX, worldZ, radialT, out) {
    const edgeWeight = SmoothStep(0.6, 1.0, radialT) * 0.5;
    if (edgeWeight <= 0.001) return out;
    let angle = Math.atan2(worldZ - entry.z, worldX - entry.x);
    if (angle < 0) angle += Math.PI * 2;
    const sector = Math.floor(angle / (Math.PI / 3)) % 6;
    neighbourColorSum.setRGB(0, 0, 0);
    let count = 0;
    for (const side of [sector, (sector + 1) % 6]) {
      const direction = hexDirections[side % 6];
      const neighbour = hexByKey.get(HexKey(entry.q + direction.q, entry.r + direction.r));
      if (!neighbour) continue;
      SampleTopColorRaw(neighbour, worldX - neighbour.x, worldZ - neighbour.z, 1, neighbourColorScratch);
      neighbourColorSum.add(neighbourColorScratch);
      count += 1;
    }
    if (count > 0) {
      neighbourColorSum.multiplyScalar(1 / count);
      out.lerp(neighbourColorSum, edgeWeight);
    }
    return out;
  }

  function SampleTopColor(entry, localX, localZ, radialT, out) {
    SampleTopColorRaw(entry, localX, localZ, radialT, out);
    return BlendEdgeColor(entry, entry.x + localX, entry.z + localZ, radialT, out);
  }

  /** 顶面顶点色：地形色带 × 高程 × 湿度 × 噪声打断。 */
  function SampleTopColorRaw(entry, localX, localZ, radialT, out) {
    const band = entry.profile.elevationBand;
    const bandT = Clamp01(InverseLerp(band[0], band[1], entry.elevation));
    const worldX = entry.x + localX;
    const worldZ = entry.z + localZ;
    const blotch = FractalNoise2D(worldX * 0.9, worldZ * 0.9, blotchNoiseOptions);
    const mix = Clamp01(bandT * 0.72 + (blotch - 0.5) * 0.55 + (1 - radialT) * 0.08);
    const low = CachedColor(colorLowCache, entry.profile.colorLow);
    const high = CachedColor(colorHighCache, entry.profile.colorHigh);
    out.copy(low).lerp(high, mix);
    // 湿度 → 向季节植被色靠拢；河谷压暗
    scratchColor.setHex(palette.grass);
    out.lerp(scratchColor, Clamp01(entry.moisture * entry.profile.wet) * 0.44);
    const shade = 0.86 + 0.30 * blotch - 0.10 * radialT;
    out.multiplyScalar(shade);
    return out;
  }

  function BuildTerrainGeometry() {
    const collector = CreateCollector();
    const corners = HexCornerOffsets(worldConfig.tileRadius);
    const bands = worldConfig.strataBands;
    const rings = worldConfig.topRings;
    const rimHeights = new Array(6);
    const workColor = new THREE.Color();
    const globalFloor = mapBounds.minTopY - worldConfig.edgeFloorDrop;

    for (const entry of hexEntries) {
      // --- 顶面 ---
      const topBase = collector.positions.length / 3;
      for (const point of topLayout.points) {
        const localX = point.x * worldConfig.tileRadius;
        const localZ = point.z * worldConfig.tileRadius;
        const height = SampleTopHeight(entry, localX, localZ, point.t);
        collector.positions.push(entry.x + localX, height, entry.z + localZ);
        // 解析法线：用本格高度场的世界差分。公共边两侧的高度函数值相同、
        // 差分也相同，因此法线跨格连续；若交给 computeVertexNormals，
        // 相邻格顶点各自独立平均，边上必然留一道折痕。
        {
          const epsilon = 0.05;
          const tX = RadialTOf(localX + epsilon, localZ);
          const tZ = RadialTOf(localX, localZ + epsilon);
          const hX = SampleTopHeight(entry, localX + epsilon, localZ, tX);
          const hZ = SampleTopHeight(entry, localX, localZ + epsilon, tZ);
          const nx = -(hX - height) / epsilon;
          const nz = -(hZ - height) / epsilon;
          const inv = 1 / Math.sqrt(nx * nx + 1 + nz * nz);
          collector.normals.push(nx * inv, inv, nz * inv);
        }
        collector.uvs.push(point.x * 0.5 + 0.5, point.z * 0.5 + 0.5);
        SampleTopColor(entry, localX, localZ, point.t, workColor);
        collector.colors.push(workColor.r, workColor.g, workColor.b);
        collector.hexUvs.push(entry.stateU, entry.stateV);
        collector.facets.push(1, entry.elevation, Clamp01(entry.moisture * entry.profile.wet));
      }
      for (let index = 0; index < topLayout.indices.length; index += 1) {
        collector.indices.push(topBase + topLayout.indices[index]);
      }

      // 记录 6 个角点的实际高度，供侧壁精确贴合
      const outerBase = topLayout.ringStart[rings];
      for (let corner = 0; corner < 6; corner += 1) {
        const pointIndex = outerBase + corner * rings;
        rimHeights[corner] = collector.positions[(topBase + pointIndex) * 3 + 1];
      }

      // --- 侧壁 ---
      const strataLow = CachedColor(strataLowCache, entry.profile.strataLow);
      const strataHigh = CachedColor(strataHighCache, entry.profile.strataHigh);
      for (let side = 0; side < 6; side += 1) {
        const [cornerA, cornerB] = hexEdgeCorners[side];
        const direction = hexDirections[side];
        const neighbour = hexByKey.get(HexKey(entry.q + direction.q, entry.r + direction.r));
        // 文明6 方案：相邻格的顶面沿公共边严格共点，内部不再需要任何侧壁——
        // 高差由边缘区的连续坡面表达（大高差自然成陡坡）。只有地图外缘保留裙壁。
        if (neighbour) continue;
        const rimTop = Math.min(rimHeights[cornerA], rimHeights[cornerB]);
        let bottom = globalFloor;
        bottom = Math.min(bottom, rimTop - 0.06);
        const pointA = corners[cornerA];
        const pointB = corners[cornerB];
        // 裙壁外向法线：沿边向量的水平垂线，取指离格心的一侧。
        // 不再依赖 computeVertexNormals（它会覆写顶面的解析法线）。
        let outwardX = pointB.z - pointA.z;
        let outwardZ = -(pointB.x - pointA.x);
        const midX = (pointA.x + pointB.x) / 2;
        const midZ = (pointA.z + pointB.z) / 2;
        if (outwardX * midX + outwardZ * midZ < 0) { outwardX = -outwardX; outwardZ = -outwardZ; }
        const outwardLength = Math.hypot(outwardX, outwardZ) || 1;
        outwardX /= outwardLength; outwardZ /= outwardLength;
        const wallBase = collector.positions.length / 3;
        for (let bandIndex = 0; bandIndex <= bands; bandIndex += 1) {
          const depthT = bandIndex / bands;
          const heightA = Lerp(rimHeights[cornerA], bottom, depthT);
          const heightB = Lerp(rimHeights[cornerB], bottom, depthT);
          workColor.copy(strataHigh).lerp(strataLow, depthT);
          const jitter = 0.9 + 0.2 * ValueNoise2D(entry.q * 3.1 + side, entry.r * 2.7 + bandIndex, entry.seed);
          workColor.multiplyScalar(jitter);
          collector.positions.push(entry.x + pointA.x, heightA, entry.z + pointA.z);
          collector.positions.push(entry.x + pointB.x, heightB, entry.z + pointB.z);
          collector.normals.push(outwardX, 0, outwardZ, outwardX, 0, outwardZ);
          collector.uvs.push(0, depthT, 1, depthT);
          collector.colors.push(workColor.r, workColor.g, workColor.b, workColor.r, workColor.g, workColor.b);
          collector.hexUvs.push(entry.stateU, entry.stateV, entry.stateU, entry.stateV);
          collector.facets.push(0, entry.elevation, depthT, 0, entry.elevation, depthT);
        }
        for (let bandIndex = 0; bandIndex < bands; bandIndex += 1) {
          const topA = wallBase + bandIndex * 2;
          const topB = topA + 1;
          const bottomA = topA + 2;
          const bottomB = topA + 3;
          collector.indices.push(topA, bottomB, bottomA, topA, topB, bottomB);
        }
      }
    }

    return FinalizeGeometry(collector, { computeNormals: false });
  }

  /** Data_Terrain 迟到时，只重写顶点色属性，不动几何结构。 */
  function RefreshTerrainColors() {
    if (!terrainMesh || !terrainMesh.geometry) return;
    for (const entry of hexEntries) entry.profile = ResolveTerrainProfile(entry.hex.terrain, terrainDefinitions);
    const colorAttribute = terrainMesh.geometry.getAttribute("color");
    if (!colorAttribute) return;
    const bands = worldConfig.strataBands;
    const topVertexCount = topLayout.points.length;
    const wallVertexCount = 6 * (bands + 1) * 2;
    const perHex = topVertexCount + wallVertexCount;
    const workColor = new THREE.Color();
    for (let hexIndex = 0; hexIndex < hexEntries.length; hexIndex += 1) {
      const entry = hexEntries[hexIndex];
      const base = hexIndex * perHex;
      for (let pointIndex = 0; pointIndex < topVertexCount; pointIndex += 1) {
        const point = topLayout.points[pointIndex];
        SampleTopColor(entry, point.x * worldConfig.tileRadius, point.z * worldConfig.tileRadius, point.t, workColor);
        colorAttribute.setXYZ(base + pointIndex, workColor.r, workColor.g, workColor.b);
      }
      const strataLow = CachedColor(strataLowCache, entry.profile.strataLow);
      const strataHigh = CachedColor(strataHighCache, entry.profile.strataHigh);
      let cursor = base + topVertexCount;
      for (let side = 0; side < 6; side += 1) {
        for (let bandIndex = 0; bandIndex <= bands; bandIndex += 1) {
          const depthT = bandIndex / bands;
          workColor.copy(strataHigh).lerp(strataLow, depthT);
          const jitter = 0.9 + 0.2 * ValueNoise2D(entry.q * 3.1 + side, entry.r * 2.7 + bandIndex, entry.seed);
          workColor.multiplyScalar(jitter);
          colorAttribute.setXYZ(cursor, workColor.r, workColor.g, workColor.b);
          colorAttribute.setXYZ(cursor + 1, workColor.r, workColor.g, workColor.b);
          cursor += 2;
        }
      }
    }
    colorAttribute.needsUpdate = true;
  }

  // -------------------------------------------------------------------------
  // 3.3 附属层：水面 / 云雾 / 地毯 / 道路 / 铁路 / 边界
  // -------------------------------------------------------------------------

  function BuildWaterGeometry() {
    const pieces = [];
    for (const entry of hexEntries) {
      if (!entry.profile.water) continue;
      const geometry = BuildHexDisc(carpetLayout, worldConfig.tileRadius * 0.99, entry, entry.topY + worldConfig.waterLift, false, 0, 0, false);
      // aShore：到岸的距离场。中心 0，靠近"非水邻格"的一侧趋近 1，泡沫只长在这里。
      const openness = [];
      for (let side = 0; side < 6; side += 1) {
        const direction = hexDirections[side];
        const neighbour = hexByKey.get(HexKey(entry.q + direction.q, entry.r + direction.r));
        openness.push(!neighbour || !neighbour.profile.water ? 1 : 0);
      }
      const count = carpetLayout.points.length;
      const shore = new Float32Array(count);
      for (let index = 0; index < count; index += 1) {
        const point = carpetLayout.points[index];
        if (point.t <= 0.001) { shore[index] = 0; continue; }
        // 顶点方位角 → 最近的边方向，取该方向的岸线权重
        const angle = Math.atan2(point.z, point.x);
        let best = 0;
        for (let side = 0; side < 6; side += 1) {
          if (!openness[side]) continue;
          const direction = hexDirections[side];
          const world = HexToWorld(direction.q, direction.r, hexSize);
          const sideAngle = Math.atan2(world.z, world.x);
          let delta = Math.abs(angle - sideAngle);
          if (delta > Math.PI) delta = Math.PI * 2 - delta;
          best = Math.max(best, Clamp01(1 - delta / (Math.PI / 2)));
        }
        shore[index] = point.t * point.t * best;
      }
      geometry.setAttribute("aShore", new THREE.BufferAttribute(shore, 1));
      pieces.push(geometry);
    }
    return MergeAndDispose(pieces);
  }

  /**
   * 单块六边形圆盘（供水面 / 地毯 / 云雾复用），uv 归一化到 ±1。
   * followSurface 为真时逐顶点贴合地表起伏（地毯高亮必须贴地，否则山顶会穿出）。
   */
  function BuildHexDisc(layout, radius, entry, height, withPuff, puffAmplitude = 0, puffBias = 0, followSurface = false) {
    const geometry = new THREE.BufferGeometry();
    const count = layout.points.length;
    const positions = new Float32Array(count * 3);
    const normals = new Float32Array(count * 3);
    const uvs = new Float32Array(count * 2);
    const hexUvs = new Float32Array(count * 2);
    const puffs = withPuff ? new Float32Array(count * 3) : null;
    for (let index = 0; index < count; index += 1) {
      const point = layout.points[index];
      const localX = point.x * radius;
      const localZ = point.z * radius;
      positions[index * 3] = entry.x + localX;
      positions[index * 3 + 1] = followSurface
        ? SampleTopHeight(entry, localX, localZ, point.t) + height
        : height;
      positions[index * 3 + 2] = entry.z + localZ;
      normals[index * 3 + 1] = 1;
      uvs[index * 2] = point.x * 0.5 + 0.5;
      uvs[index * 2 + 1] = point.z * 0.5 + 0.5;
      hexUvs[index * 2] = entry.stateU;
      hexUvs[index * 2 + 1] = entry.stateV;
      if (puffs) {
        puffs[index * 3] = (entry.phaseByte / 255);
        puffs[index * 3 + 1] = puffAmplitude;
        puffs[index * 3 + 2] = puffBias;
      }
    }
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
    geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
    geometry.setAttribute("aHexUv", new THREE.BufferAttribute(hexUvs, 2));
    if (puffs) geometry.setAttribute("aPuff", new THREE.BufferAttribute(puffs, 3));
    geometry.setIndex(layout.indices.slice());
    return geometry;
  }

  function BuildOverlayGeometry() {
    const pieces = [];
    for (const entry of hexEntries) {
      pieces.push(BuildHexDisc(carpetLayout, worldConfig.tileRadius, entry, worldConfig.overlayLift, false, 0, 0, true));
    }
    return MergeAndDispose(pieces);
  }

  /**
   * 迷雾云按 XZ 象限切成若干块，每块一个 mesh：
   * 整块都已探索时直接 visible=false，连提交都省掉（原来 19760 顶点的单一 mesh
   * 即使全图探明也仍要走完 fragment 再 discard）。
   * 每格只保留一层 disc（原来两层），覆盖面积与 overdraw 直接减半。
   */
  function BuildFogCloudChunks() {
    const chunkColumns = 3;
    const chunkRows = 3;
    const spanX = Math.max(0.001, mapBounds.maxX - mapBounds.minX);
    const spanZ = Math.max(0.001, mapBounds.maxZ - mapBounds.minZ);
    const buckets = new Map();
    for (const entry of hexEntries) {
      const column = Clamp(Math.floor(((entry.x - mapBounds.minX) / spanX) * chunkColumns), 0, chunkColumns - 1);
      const row = Clamp(Math.floor(((entry.z - mapBounds.minZ) / spanZ) * chunkRows), 0, chunkRows - 1);
      const bucketKey = `${column},${row}`;
      let bucket = buckets.get(bucketKey);
      if (!bucket) { bucket = { entries: [], pieces: [] }; buckets.set(bucketKey, bucket); }
      bucket.entries.push(entry);
      const highOffset = 0.16 * (entry.phaseByte / 255);
      bucket.pieces.push(BuildHexDisc(carpetLayout, worldConfig.tileRadius * 0.98, entry,
        entry.crestY + worldConfig.fogLowLift + highOffset, true, 1.0, 0.0));
    }
    const chunks = [];
    for (const bucket of buckets.values()) {
      const geometry = MergeAndDispose(bucket.pieces);
      if (!geometry) continue;
      chunks.push({ geometry, entries: bucket.entries });
    }
    return chunks;
  }

  /** 逐块判断是否还有未探索格，全探明的块整块关掉。 */
  function UpdateFogCloudVisibility() {
    if (!fogCloudMeshes.length) return;
    for (const chunk of fogCloudMeshes) {
      let hasUnknown = false;
      for (const entry of chunk.userData.entries) {
        if (!entry.hex.explored) { hasUnknown = true; break; }
      }
      chunk.visible = hasUnknown && profile.fogClouds;
    }
  }

  function EdgeMidHeight(entry, neighbour) {
    return (entry.topY + neighbour.topY) * 0.5;
  }

  function BuildRoadGeometry() {
    const collector = CreateCollector();
    const dirtColor = new THREE.Color(0x8b7c5c);
    const pavedColor = new THREE.Color(0x585553);
    for (const entry of hexEntries) {
      const level = Number(entry.hex.road) || 0;
      if (level <= 0) continue;
      const color = level >= 2 ? pavedColor : dirtColor;
      const halfWidth = level >= 2 ? 0.16 : 0.11;
      const centerY = entry.centerY + worldConfig.roadLift;
      const hexUv = [entry.stateU, entry.stateV];
      let linked = 0;
      for (let side = 0; side < 6; side += 1) {
        const direction = hexDirections[side];
        const neighbour = hexByKey.get(HexKey(entry.q + direction.q, entry.r + direction.r));
        if (!neighbour || (Number(neighbour.hex.road) || 0) <= 0) continue;
        const midX = (entry.x + neighbour.x) * 0.5;
        const midZ = (entry.z + neighbour.z) * 0.5;
        const midY = EdgeMidHeight(entry, neighbour) + worldConfig.roadLift;
        PushRibbon(collector, entry.x, centerY, entry.z, midX, midY, midZ, halfWidth, color, 3, hexUv);
        linked += 1;
      }
      // 孤立路段也画一小段，避免村口断头
      if (linked === 0) {
        PushRibbon(collector, entry.x - 0.4, centerY, entry.z, entry.x + 0.4, centerY, entry.z, halfWidth, color, 2, hexUv);
      }
    }
    return FinalizeGeometry(collector);
  }

  function BuildRailGeometry() {
    const collector = CreateCollector();
    const bedColor = new THREE.Color(0x4a423a);
    const railColor = new THREE.Color(0x9aa0a4);
    const brokenColor = new THREE.Color(0x6d2f22);
    const sleeperPieces = [];
    const sleeperGeometry = new THREE.BoxGeometry(0.30, 0.045, 0.075);
    const sleeperMatrix = new THREE.Matrix4();
    const sleeperQuaternion = new THREE.Quaternion();
    const sleeperScale = new THREE.Vector3(1, 1, 1);
    const sleeperPosition = new THREE.Vector3();
    const upAxis = new THREE.Vector3(0, 1, 0);

    for (const entry of hexEntries) {
      if (!entry.hex.railway) continue;
      const broken = (Number(entry.hex.railBroken) || 0) > 0;
      const bed = broken ? brokenColor : bedColor;
      const rail = broken ? brokenColor : railColor;
      const centerY = entry.centerY + worldConfig.roadLift + 0.012;
      const hexUv = [entry.stateU, entry.stateV];
      for (let side = 0; side < 6; side += 1) {
        const direction = hexDirections[side];
        const neighbour = hexByKey.get(HexKey(entry.q + direction.q, entry.r + direction.r));
        if (!neighbour || !neighbour.hex.railway) continue;
        const midX = (entry.x + neighbour.x) * 0.5;
        const midZ = (entry.z + neighbour.z) * 0.5;
        const midY = EdgeMidHeight(entry, neighbour) + worldConfig.roadLift + 0.012;
        PushRibbon(collector, entry.x, centerY, entry.z, midX, midY, midZ, 0.17, bed, 3, hexUv);
        // 两条钢轨
        const dx = midX - entry.x;
        const dz = midZ - entry.z;
        const length = Math.hypot(dx, dz) || 1;
        const offsetX = (-dz / length) * 0.075;
        const offsetZ = (dx / length) * 0.075;
        PushRibbon(collector, entry.x + offsetX, centerY + 0.02, entry.z + offsetZ,
          midX + offsetX, midY + 0.02, midZ + offsetZ, 0.018, rail, 2, hexUv);
        PushRibbon(collector, entry.x - offsetX, centerY + 0.02, entry.z - offsetZ,
          midX - offsetX, midY + 0.02, midZ - offsetZ, 0.018, rail, 2, hexUv);
        // 枕木
        const angle = Math.atan2(dx, dz);
        sleeperQuaternion.setFromAxisAngle(upAxis, angle);
        const sleeperCount = broken ? 2 : 4;
        for (let step = 0; step < sleeperCount; step += 1) {
          const t = (step + 0.5) / sleeperCount;
          sleeperPosition.set(Lerp(entry.x, midX, t), Lerp(centerY, midY, t) + 0.006, Lerp(entry.z, midZ, t));
          sleeperMatrix.compose(sleeperPosition, sleeperQuaternion, sleeperScale);
          const piece = sleeperGeometry.clone();
          piece.applyMatrix4(sleeperMatrix);
          const vertexCount = piece.getAttribute("position").count;
          const colorArray = new Float32Array(vertexCount * 3);
          for (let vertex = 0; vertex < vertexCount; vertex += 1) {
            colorArray[vertex * 3] = bed.r * 0.85;
            colorArray[vertex * 3 + 1] = bed.g * 0.85;
            colorArray[vertex * 3 + 2] = bed.b * 0.85;
          }
          piece.setAttribute("color", new THREE.BufferAttribute(colorArray, 3));
          const sleeperHexUv = new Float32Array(vertexCount * 2);
          for (let vertex = 0; vertex < vertexCount; vertex += 1) {
            sleeperHexUv[vertex * 2] = entry.stateU;
            sleeperHexUv[vertex * 2 + 1] = entry.stateV;
          }
          piece.setAttribute("aHexUv", new THREE.BufferAttribute(sleeperHexUv, 2));
          piece.deleteAttribute("uv");
          sleeperPieces.push(piece);
        }
      }
    }
    sleeperGeometry.dispose();

    const ribbonGeometry = FinalizeGeometry(collector);
    if (ribbonGeometry) ribbonGeometry.deleteAttribute("uv");
    const sleeperMerged = MergeAndDispose(sleeperPieces);
    if (ribbonGeometry && sleeperMerged) {
      const merged = mergeGeometries([ribbonGeometry, sleeperMerged], false);
      ribbonGeometry.dispose();
      sleeperMerged.dispose();
      return merged;
    }
    return ribbonGeometry || sleeperMerged;
  }

  /**
   * 政权分界线。只描"阵营发生变化"的那一条边，不给每个六边形都描一圈：
   *   阵营 2 = 根据地 / 游击区，1 = 争夺区，0 = 敌占区。
   * 同一条边只由高阵营一侧绘制一次，线细、低饱和；根据地一侧暖黄，敌占一侧暗红。
   */
  const controlCamps = Object.freeze({ Base: 2, Guerrilla: 2, Contested: 1, Enemy: 0 });
  const borderFriendlyColor = new THREE.Color(0x9c7b38);
  const borderHostileColor = new THREE.Color(0x63281f);

  /** 角点 c 由本格与这两个方向上的邻格共享，用于求共享角高度。 */
  const cornerNeighbourDirections = Object.freeze([[0, 1], [5, 0], [4, 5], [3, 4], [2, 3], [1, 2]]);

  /**
   * 角点高度取共享该角的三格顶面最高值。
   * 相邻两条边在同一个角上算出同一个 Y，边界带才能连成闭合折线而不是悬空断段。
   */
  function SharedCornerHeight(entry, cornerIndex) {
    let height = entry.topY;
    const dirs = cornerNeighbourDirections[cornerIndex];
    for (const dirIndex of dirs) {
      const direction = hexDirections[dirIndex];
      const neighbour = hexByKey.get(HexKey(entry.q + direction.q, entry.r + direction.r));
      if (neighbour && neighbour.topY > height) height = neighbour.topY;
    }
    return height;
  }

  function BuildBorderGeometry() {
    const collector = CreateCollector();
    const corners = HexCornerOffsets(worldConfig.tileRadius);

    for (const entry of hexEntries) {
      const camp = controlCamps[entry.hex.control] ?? 0;
      if (camp === 0) continue;                       // 敌占区不主动画线，等对面来画
      if (!entry.hex.explored) continue;              // 未探索区不泄露政权信息
      for (let side = 0; side < 6; side += 1) {
        const direction = hexDirections[side];
        const neighbour = hexByKey.get(HexKey(entry.q + direction.q, entry.r + direction.r));
        if (!neighbour) continue;                     // 地图边缘不画
        const neighbourCamp = controlCamps[neighbour.hex.control] ?? 0;
        if (neighbourCamp >= camp) continue;          // 只由高阵营一侧画，保证每条边只画一次
        const color = camp === 2 ? borderFriendlyColor : borderHostileColor;
        const [cornerA, cornerB] = hexEdgeCorners[side];
        // 顶点 Y 用共享角高度，相邻边在角上严丝合缝地接上
        const heightA = SharedCornerHeight(entry, cornerA) + worldConfig.borderLift;
        const heightB = SharedCornerHeight(entry, cornerB) + worldConfig.borderLift;
        PushRibbon(collector,
          entry.x + corners[cornerA].x, heightA, entry.z + corners[cornerA].z,
          entry.x + corners[cornerB].x, heightB, entry.z + corners[cornerB].z,
          0.020, color, 1);
      }
    }
    return FinalizeGeometry(collector);
  }

  // -------------------------------------------------------------------------
  // 3.3b 立体物件层：聚落 / 据点 / 植被 / 区域 / 工事 / 部队
  // -------------------------------------------------------------------------

  /** Data_Units 的区域 key → Script_Models 的建造器 key（两边命名不同，这里做适配）。 */
  const districtModelNames = Object.freeze({
    Armory: "Arsenal", ClothingWorkshop: "TextileMill", Infirmary: "Clinic", NightSchool: "NightSchool",
    GrainStore: "GrainDepot", CourierStation: "CourierStation", SupplyDepot: "SupplyDepot",
    TunnelMouth: "TunnelEntrance", RadioRoom: "RadioStation", FiringRange: "Range",
    PeasantAssociation: "FarmersAssociation", MilitiaGround: "MilitiaGround",
  });

  /** Data_Units 的敌方 key → Script_Models 的建造器 key（补齐别名表未覆盖的四种）。 */
  const unitModelNames = Object.freeze({
    KempeitaiAgents: "EnemyGendarme", CavalryScouts: "EnemyCavalry",
    EngineerDetachment: "EnemyEngineer", ArtillerySection: "EnemyArtillery",
  });

  /** 地物 → 树种，用于林地/树丛的植被合批。 */
  const groveKindByTerrain = Object.freeze({ Mountain: "Pine", Ridge: "Pine", Forest: "Pine", Hill: "Jujube" });

  const staticPool = CreateInstancePool(propGroup, "PrairieStaticProps");
  const unitPool = CreateInstancePool(propGroup, "PrairieUnitProps");
  const modelParts = [];
  const placementMatrix = new THREE.Matrix4();
  const placementPosition = new THREE.Vector3();
  const placementQuaternion = new THREE.Quaternion();
  const placementScale = new THREE.Vector3(1, 1, 1);
  const placementAxis = new THREE.Vector3(0, 1, 0);
  const scorchTint = new THREE.Color(0.42, 0.36, 0.32);
  const neutralTint = new THREE.Color(1, 1, 1);
  const factionTints = {
    Player: new THREE.Color(0xd8b06a),   // 我方底盘：赭金（读作臂章/袖标，不再像水塘）
    Enemy: new THREE.Color(0xd2ab5c),    // 敌方：土黄制服
    Hidden: new THREE.Color(0xb9a67e),   // 隐蔽：压灰的土金
  };
  /** 我方部队头顶的小红旗，一眼区分敌我。 */
  const playerFlagColors = { cloth: modelPalette.bannerRed, band: "#e8d3a4", height: 0.30 };

  /** 部队底座 / 隐蔽指示环 / 接地投影盘：渲染层自建的三份小几何体，各占一次 draw call。 */
  let unitPadGeometry = null;
  let hiddenRingGeometry = null;
  let groundShadowGeometry = null;
  let padMaterial = null;
  let groundShadowMaterial = null;
  let baseModelMaterial = null;
  let hiddenModelMaterial = null;

  function EnsurePropResources() {
    if (!unitPadGeometry) {
      // 环形而不是实心盘：实心盘在俯视下读作"一汪水塘"，比真实河面还蓝还饱和，
      // 部队像半陷在里面。改成贴地的窄环，只标出站位不抢画面。
      unitPadGeometry = new THREE.RingGeometry(0.50, 0.63, 6, 1);
      unitPadGeometry.rotateX(-Math.PI / 2);
      unitPadGeometry.rotateY(Math.PI / 6);
      unitPadGeometry.deleteAttribute("uv");
    }
    if (!hiddenRingGeometry) {
      // 低矮的"伏姿"指示：贴地的破口圆环，示意队伍尚未暴露
      hiddenRingGeometry = new THREE.TorusGeometry(0.62, 0.030, 4, 24, Math.PI * 2);
      hiddenRingGeometry.rotateX(Math.PI / 2);
      hiddenRingGeometry.deleteAttribute("uv");
    }
    if (!groundShadowGeometry) {
      // 18 段在放大后能看出多边形边；32 段仍只占一次 draw call
      groundShadowGeometry = new THREE.CircleGeometry(1, 32);
      groundShadowGeometry.rotateX(-Math.PI / 2);
    }
    if (!padMaterial) {
      // 不受光：部队底座是战场标识，不能因为落在山影里就看不见
      padMaterial = new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0.40,
        side: THREE.DoubleSide, depthWrite: false, name: "PrairieUnitPad",
      });
      padMaterial.polygonOffset = true;
      padMaterial.polygonOffsetFactor = -4;
      padMaterial.polygonOffsetUnits = -4;
    }
    if (!groundShadowMaterial) {
      // 接地投影：径向渐隐的软圆盘，把物件"压"在地面上。
      // 它与方向光的真实阴影是叠加关系——一旦浓度过高、半径过大，
      // 每个物件脚下就是一个比物件还大的近黑椭圆，读作"地上的洞"。
      groundShadowMaterial = new THREE.ShaderMaterial({
        uniforms: { uOpacity: { value: 0.20 } },
        vertexShader: [
          "varying vec2 vShadowUv;",
          "void main() {",
          "  vShadowUv = uv * 2.0 - 1.0;",
          "  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );",
          "}",
        ].join("\n"),
        fragmentShader: [
          "uniform float uOpacity;",
          "varying vec2 vShadowUv;",
          "void main() {",
          "  float falloff = 1.0 - smoothstep( 0.10, 1.0, length( vShadowUv ) );",
          "  float alpha = falloff * uOpacity;",
          "  if ( alpha < 0.004 ) discard;",
          "  gl_FragColor = vec4( 0.055, 0.050, 0.044, alpha );",
          "}",
        ].join("\n"),
        transparent: true,
        depthWrite: false,
        name: "PrairieGroundShadow",
      });
      groundShadowMaterial.polygonOffset = true;
      groundShadowMaterial.polygonOffsetFactor = -3;
      groundShadowMaterial.polygonOffsetUnits = -3;
    }
  }

  /** 在物件脚下压一片接地投影盘。半径统一收到调用值的 0.7 倍，避免大过物件本身。 */
  function PushGroundShadow(pool, x, y, z, radius, visible) {
    placementPosition.set(x, y + 0.008, z);
    placementQuaternion.identity();
    const size = visible === false ? 0 : radius * 0.7;
    placementScale.set(size, 1, size);
    InstancePoolPush(pool, groundShadowGeometry, groundShadowMaterial,
      placementMatrix.compose(placementPosition, placementQuaternion, placementScale), null, false);
  }

  /**
   * 分类物件材质。Script_Models 的全部模型共用一份材质、共用一张土色调色板，
   * 俯视时村庄 / 部队 / 据点会糊成同一团深蓝灰。这里在渲染层派生带色偏的变体：
   *   · material.color 与顶点色相乘，把整体推向该类别的识别色；
   *   · 注入"朝上面提亮"，把屋顶 / 斗笠等水平面抬高约 1.5 档，
   *     否则高空俯视只剩墙体侧面的暗色；
   *   · 保留模型库的风摆注入，并登记进阴影材质表。
   */
  const propMaterialCache = new Map();

  /**
   * 各类别的识别色 / 屋顶提亮倍数 / 饱和度 / 轮廓压暗。
   * opacity 一律保持 1：实心模型一旦半透明就会自身互相穿透，
   * 破口环会从身体里钻出来显示在身前，兵种、朝向、姿态全部读不出来。
   * "隐蔽"改由破口环 + 边缘暗角（rim）+ dither 表达。
   * canopy > 0 的类别额外做顶亮底暗的竖向梯度，让锥体树冠不再是纯平黑剪影。
   */
  const propCategoryRecipes = Object.freeze({
    // 识别色是「微调」不是「主导」：顶点色恢复正常亮度后，tint 应当接近中性，
    // roofBoost 只负责让朝上的面比墙体亮一档。此前这些值被抬得很高，
    // 是为了补偿顶点色二次 sRGB→Linear 造成的黑剪影；那个根因已修，补偿必须撤掉，
    // 否则会整体过曝并把材质本身的层次冲掉。
    // tint 接近中性，让模型自带的配色说话；只在需要分辨阵营时轻微偏色。
    // 数值再高就会把屋顶冲成纯黄白，反而丢掉细节。
    settlement: { tint: 0xd6cab6, roofBoost: 1.22, saturation: 1.05 },   // 中立聚落：夯土黄 + 亮瓦顶
    stronghold: { tint: 0xcfcdc4, roofBoost: 1.18, saturation: 0.82 },   // 敌据点：冷灰水泥
    friendly: { tint: 0xc8d0d8, roofBoost: 1.18, saturation: 0.95 },     // 我方：灰蓝布衣
    enemy: { tint: 0xd8c89a, roofBoost: 1.18, saturation: 1.10 },        // 敌方：土黄制服
    hidden: { tint: 0xa8b8c2, roofBoost: 1.10, saturation: 0.78, rim: 0.34 },
    foliage: { tint: 0xa4bc8c, roofBoost: 1.12, saturation: 1.16, canopy: 0.52 },
    works: { tint: 0xbcb094, roofBoost: 1.12, saturation: 1.02 },        // 工事 / 区域
    neutral: { tint: 0xb8b0a2, roofBoost: 1.12, saturation: 1.0 },
  });

  function GetPropMaterial(sourceMaterial, categoryKey) {
    if (!sourceMaterial) return null;
    if (!baseModelMaterial) baseModelMaterial = sourceMaterial;
    const cacheKey = `${sourceMaterial.uuid}|${categoryKey}`;
    const cached = propMaterialCache.get(cacheKey);
    if (cached) return cached;
    const recipe = propCategoryRecipes[categoryKey] || propCategoryRecipes.neutral;
    const material = sourceMaterial.clone();
    material.name = `PrairieProp_${categoryKey}`;
    // 注意：THREE.ColorManagement 默认开启时 setHex 已经做过 sRGB → Linear，
    // 再调一次 convertSRGBToLinear 等于转换两遍，识别色会凭空暗掉约四成，
    // 是"所有立体物件都读作黑剪影"的直接原因之一。
    material.color.setHex(recipe.tint);
    if (recipe.gain) material.color.multiplyScalar(recipe.gain);
    material.transparent = false;
    material.opacity = 1;
    material.depthWrite = true;
    material.dithering = true;
    const canopy = recipe.canopy || 0;
    const rim = recipe.rim || 0;
    const lift = recipe.lift || 0;
    const swayCompile = sourceMaterial.onBeforeCompile;
    material.onBeforeCompile = function PropOnBeforeCompile(shader, rendererReference) {
      if (swayCompile) swayCompile.call(this, shader, rendererReference);
      if (canopy > 0) {
        shader.vertexShader = shader.vertexShader
          .replace("#include <common>", "#include <common>\nvarying float vPropLocalY;")
          .replace("#include <begin_vertex>", "#include <begin_vertex>\nvPropLocalY = position.y;");
        shader.fragmentShader = shader.fragmentShader
          .replace("#include <common>", "#include <common>\nvarying float vPropLocalY;");
      }
      const injected = ["#include <normal_fragment_begin>", "{"];
      injected.push(
        "  vec3 upInView = normalize( ( viewMatrix * vec4( 0.0, 1.0, 0.0, 0.0 ) ).xyz );",
        "  float upFacing = clamp( dot( normalize( normal ), upInView ), 0.0, 1.0 );",
        `  diffuseColor.rgb *= mix( 1.0, ${recipe.roofBoost.toFixed(2)}, pow( upFacing, 1.6 ) );`,
      );
      if (canopy > 0) {
        // 树冠：顶亮底暗的竖向梯度。只靠光照做不出来——锥体侧面几乎收不到主光，
        // 缺了这道梯度，整丛树在缩略尺度下就是一块零明暗的纯平黑剪影。
        // 树模型局部高度 0.16~0.42，×3.2 把树顶归一到 1.0 附近。
        injected.push(
          "  float canopyT = clamp( vPropLocalY * 3.2, 0.0, 1.0 );",
          `  diffuseColor.rgb *= mix( ${(1 - canopy * 0.55).toFixed(2)}, ${(1 + canopy).toFixed(2)}, pow( canopyT, 1.35 ) );`,
        );
      }
      if (rim > 0) {
        // 隐蔽：轮廓压暗代替整体半透明——保住实心剪影，同时读得出"藏起来了"
        injected.push(
          "  float rimFacing = 1.0 - clamp( dot( normalize( normal ), normalize( vViewPosition ) ), 0.0, 1.0 );",
          `  diffuseColor.rgb *= 1.0 - ${rim.toFixed(2)} * pow( rimFacing, 2.2 );`,
        );
      }
      injected.push(
        "  float propLuma = dot( diffuseColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) );",
        `  diffuseColor.rgb = mix( vec3( propLuma ), diffuseColor.rgb, ${recipe.saturation.toFixed(2)} );`,
        "}",
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <normal_fragment_begin>",
        injected.join("\n"),
      );
      if (lift > 0) {
        // 环境底光：给背光面一个不为零的下限，等价于树冠内部的散射。
        // 没有它，主光照不到的锥面只能吃到半球光的零头，缩略尺度下必然塌成剪影。
        shader.fragmentShader = shader.fragmentShader.replace(
          "#include <lights_fragment_end>",
          `#include <lights_fragment_end>
reflectedLight.indirectDiffuse += diffuseColor.rgb * ${lift.toFixed(2)};`,
        );
      }
    };
    material.customProgramCacheKey = () => `prairieProp_${categoryKey}`;
    material.userData.baseOnBeforeCompile = material.onBeforeCompile;
    propMaterialCache.set(cacheKey, material);
    RegisterStandardMaterial(material);
    return material;
  }

  /** 隐蔽部队：半透明 + 冷调，配合破口环与伏低姿态。 */
  function GetHiddenModelMaterial(sourceMaterial) {
    if (hiddenModelMaterial) return hiddenModelMaterial;
    hiddenModelMaterial = GetPropMaterial(sourceMaterial, "hidden");
    return hiddenModelMaterial;
  }

  /** 取模型 Group 的源材质（第一个 Mesh 的材质）。 */
  function SourceMaterialOf(group) {
    if (!group) return null;
    let found = null;
    group.traverse((object) => { if (!found && object.isMesh) found = object.material; });
    return found;
  }

  /** 把一个模型 Group 摆到世界坐标并压入合批池；隐藏时用零缩放（不触碰几何体）。 */
  function PlaceModel(pool, group, x, y, z, rotationY, scale, tint, visible, materialOverride, castShadow) {
    if (!group) return;
    HarvestModelParts(group, modelParts);
    placementPosition.set(x, y, z);
    placementQuaternion.setFromAxisAngle(placementAxis, rotationY || 0);
    const size = visible === false ? 0 : (scale || 1);
    placementScale.set(size, size, size);
    placementMatrix.compose(placementPosition, placementQuaternion, placementScale);
    for (const part of modelParts) {
      const worldMatrix = placementMatrix.clone().multiply(part.matrix);
      const material = materialOverride || part.material;
      if (!baseModelMaterial) baseModelMaterial = part.material;
      // 模型库的共享材质是惰性创建的，首次遇到就登记，让它接上 CSM 级联阴影
      RegisterStandardMaterial(material);
      InstancePoolPush(pool, part.geometry, material, worldMatrix, tint, castShadow);
    }
  }

  /** 同格多支部队的错位摆放：1 支居中，多支沿小圆环排布。 */
  function StackOffset(index, total, radius = 0.34) {
    if (total <= 1) return { x: 0, z: 0 };
    const angle = (index / total) * Math.PI * 2 + 0.5;
    return { x: Math.cos(angle) * radius, z: Math.sin(angle) * radius * 0.86 };
  }

  /** 逐格地表高度：物件要贴在真实起伏上，而不是悬在高台平面。 */
  function SurfaceAt(entry, localX, localZ) {
    const radius = Math.hypot(localX, localZ) / worldConfig.tileRadius;
    return SampleTopHeight(entry, localX, localZ, Clamp01(radius));
  }

  /** 摆一个带分类配色与接地投影的物件。 */
  function PlaceCategorised(pool, model, category, x, y, z, rotationY, scale, tint, visible, options = {}) {
    if (!model) return;
    const material = GetPropMaterial(SourceMaterialOf(model), category);
    PlaceModel(pool, model, x, y, z, rotationY, scale, tint, visible, material, options.castShadow !== false);
    if (options.shadowRadius > 0) PushGroundShadow(pool, x, y, z, options.shadowRadius, visible);
  }

  /** 静态物件层：聚落、据点、植被、根据地区域、工事、旗帜。 */
  function RebuildStaticProps() {
    EnsurePropResources();
    InstancePoolBegin(staticPool);
    if (!currentState) { InstancePoolCommit(staticPool); return; }
    const state = currentState;
    const radius = worldConfig.tileRadius;

    for (const entry of hexEntries) {
      const hex = entry.hex;
      const visible = !!hex.explored;
      const variantSeed = HashString(entry.key);
      const scorch = Clamp01((Number(hex.scorch) || 0) / 100);
      const tint = scorch > 0.02 ? neutralTint.clone().lerp(scorchTint, scorch) : null;
      const surfaceY = SurfaceAt(entry, 0, 0);
      const rotation = (variantSeed % 6) * 1.047;

      // —— 聚落：对标文明VI，县城几乎填满地块 ——
      if (hex.feature === "Village" || hex.feature === "Town" || hex.feature === "CountySeat") {
        const variantCount = hex.feature === "Village" ? 3 : 2;
        const model = CreateSettlementModel(hex.feature, 1, { seed: variantSeed % variantCount });
        // 模型半径约 0.36，缩放后直径 = radius × 系数
        const scale = hex.feature === "CountySeat" ? radius * 2.60
          : hex.feature === "Town" ? radius * 2.30 : radius * 1.95;
        PlaceCategorised(staticPool, model, "settlement",
          entry.x, surfaceY + worldConfig.propLift, entry.z, rotation, scale, tint, visible,
          { shadowRadius: radius * 0.72 });
      } else if (hex.feature === "Shrine" || hex.feature === "Quarry" || hex.feature === "SaltPan") {
        const workKind = hex.feature === "Shrine" ? "Beacon" : "Cache";
        PlaceCategorised(staticPool, CreateWorkModel(workKind), "works",
          entry.x, surfaceY + worldConfig.propLift, entry.z, rotation, radius * 1.45, tint, visible,
          { castShadow: false, shadowRadius: radius * 0.4 });
      } else if (hex.feature === "Ford") {
        PlaceCategorised(staticPool, CreateWorkModel("Ford"), "works",
          entry.x, surfaceY + worldConfig.propLift, entry.z, 0, radius * 1.5, tint, visible,
          { castShadow: false, shadowRadius: 0 });
      } else if (hex.feature === "Terrace") {
        PlaceCategorised(staticPool, CreateWorkModel("Terrace"), "works",
          entry.x, surfaceY + worldConfig.propLift, entry.z, rotation, radius * 1.5, tint, visible,
          { castShadow: false, shadowRadius: 0 });
      } else if (hex.feature === "Pass") {
        PlaceCategorised(staticPool, CreateWorkModel("Barricade"), "works",
          entry.x, surfaceY + worldConfig.propLift, entry.z, rotation, radius * 1.5, tint, visible,
          { shadowRadius: radius * 0.4 });
      }

      // —— 植被：林地与树丛 ——
      const groveKind = hex.feature === "Grove" ? "Poplar" : groveKindByTerrain[hex.terrain];
      if (groveKind && (hex.terrain === "Forest" || hex.feature === "Grove" || (hex.terrain === "Ridge" && (variantSeed & 3) === 0))) {
        const count = hex.terrain === "Forest" ? 7 : hex.feature === "Grove" ? 5 : 3;
        const cluster = CreateTreeCluster(groveKind, count, CreateRng(entry.seed), { spread: 0.5 });
        PlaceCategorised(staticPool, cluster, "foliage",
          entry.x, surfaceY, entry.z, 0, radius * 1.6, tint, visible, { castShadow: false, shadowRadius: 0 });
      }

      // —— 已建成的工事 ——
      const works = Array.isArray(hex.works) ? hex.works : [];
      for (let index = 0; index < works.length; index += 1) {
        const workKey = typeof works[index] === "string" ? works[index] : works[index] && works[index].type;
        if (!workKey) continue;
        const offset = StackOffset(index, Math.max(2, works.length), 0.44);
        PlaceCategorised(staticPool, CreateWorkModel(workKey), "works",
          entry.x + offset.x, SurfaceAt(entry, offset.x, offset.z) + worldConfig.propLift, entry.z + offset.z,
          (variantSeed % 5) * 1.256, radius * 1.25, tint, visible,
          { castShadow: false, shadowRadius: radius * 0.3 });
      }
    }

    // —— 敌军据点：冷灰水泥色，与土黄聚落一眼分开 ——
    for (const stronghold of state.strongholds || []) {
      const entry = hexByKey.get(stronghold.key);
      if (!entry) continue;
      const model = CreateStrongholdModel(stronghold.type, { scale: 1 });
      const scale = stronghold.type === "CountySeat" ? radius * 2.60 : radius * 2.10;
      PlaceCategorised(staticPool, model, "stronghold",
        entry.x, SurfaceAt(entry, 0, 0) + worldConfig.propLift, entry.z,
        (HashString(stronghold.key) % 6) * 1.047, scale, null, !!entry.hex.explored,
        { shadowRadius: radius * 0.62 });
    }

    // —— 根据地：旗帜 + 已建成区域 ——
    for (const base of state.bases || []) {
      const entry = hexByKey.get(base.key);
      if (!entry) continue;
      const visible = !!entry.hex.explored;
      const banner = CreateBannerModel({ cloth: modelPalette.bannerRed, band: "#e0cfa2", height: base.tier >= 3 ? 0.56 : 0.46 });
      PlaceCategorised(staticPool, banner, "friendly",
        entry.x + 0.34, SurfaceAt(entry, 0.34, -0.34) + worldConfig.propLift, entry.z - 0.34,
        0.6, radius * 1.25, null, visible, { castShadow: false, shadowRadius: 0 });
      const districts = Array.isArray(base.districts) ? base.districts : [];
      for (let index = 0; index < districts.length; index += 1) {
        const district = districts[index];
        const districtType = typeof district === "string" ? district : district && district.type;
        if (!districtType) continue;
        const districtEntry = (district && district.key && hexByKey.get(district.key)) || entry;
        const offset = StackOffset(index, Math.max(3, districts.length), 0.48);
        const modelName = districtModelNames[districtType] || districtType;
        PlaceCategorised(staticPool, CreateDistrictModel(modelName), "works",
          districtEntry.x + offset.x, SurfaceAt(districtEntry, offset.x, offset.z) + worldConfig.propLift, districtEntry.z + offset.z,
          (index * 1.4) % 6.283, radius * 1.45, null, !!districtEntry.hex.explored,
          { castShadow: false, shadowRadius: radius * 0.34 });
      }
    }

    InstancePoolCommit(staticPool, { renderOrder: 1 });
  }

  /** 部队层：我方与敌方，含阵营底座、隐蔽表现与同格错位。 */
  function RebuildUnitProps() {
    EnsurePropResources();
    InstancePoolBegin(unitPool);
    if (!currentState) { InstancePoolCommit(unitPool); return; }
    const state = currentState;

    const stacks = new Map();
    const Register = (key, record) => {
      let list = stacks.get(key);
      if (!list) { list = []; stacks.set(key, list); }
      list.push(record);
    };
    for (const unit of state.units || []) {
      if (!unit || !unit.key) continue;
      Register(unit.key, { unit, faction: "Player" });
    }
    for (const enemy of state.enemies || []) {
      if (!enemy || !enemy.key) continue;
      if (enemy.visibleToPlayer === false) continue;   // 未侦察到的敌军不显形
      Register(enemy.key, { unit: enemy, faction: "Enemy" });
    }

    for (const [key, list] of stacks) {
      const entry = hexByKey.get(key);
      if (!entry) continue;
      const visible = !!entry.hex.explored;
      for (let index = 0; index < list.length; index += 1) {
        const record = list[index];
        const unit = record.unit;
        const hidden = record.faction === "Player" && !!unit.hidden;
        const offset = StackOffset(index, list.length);
        const surfaceY = SurfaceAt(entry, offset.x, offset.z);
        const x = entry.x + offset.x;
        const z = entry.z + offset.z;
        const facing = record.faction === "Enemy" ? Math.PI : 0;

        // 阵营底座：一次 draw call 画完全部部队的底盘
        const padTint = hidden ? factionTints.Hidden : factionTints[record.faction];
        placementPosition.set(x, surfaceY + 0.014, z);
        placementQuaternion.setFromAxisAngle(placementAxis, facing);
        const padSize = visible ? (hidden ? 0.86 : 1) : 0;
        placementScale.set(padSize, padSize, padSize);
        InstancePoolPush(unitPool, unitPadGeometry, padMaterial,
          placementMatrix.compose(placementPosition, placementQuaternion, placementScale), padTint, false);

        // 隐蔽指示：贴地的破口环，明确但不喧宾夺主
        if (hidden) {
          placementPosition.set(x, surfaceY + 0.03, z);
          placementScale.set(visible ? 1 : 0, visible ? 1 : 0, visible ? 1 : 0);
          InstancePoolPush(unitPool, hiddenRingGeometry, padMaterial,
            placementMatrix.compose(placementPosition, placementQuaternion, placementScale), factionTints.Hidden, false);
        }

        // 接地投影：把队伍压在地面上，不再像贴纸浮着
        // 部队已有方向光的真实投影，不再叠接地盘——否则脚下共四层标记。

        const modelName = unitModelNames[unit.type] || unit.type;
        const model = CreateUnitModel(modelName, {
          faction: record.faction,
          variant: HashString(String(unit.id || key)) % 3,
        });
        const sourceMaterial = SourceMaterialOf(model);
        const category = hidden ? "hidden" : (record.faction === "Enemy" ? "enemy" : "friendly");
        const materialOverride = hidden
          ? GetHiddenModelMaterial(sourceMaterial)
          : GetPropMaterial(sourceMaterial, category);
        // 1920 屏默认视距下部队原本只占 25~30px，六倍裁切才勉强看出人形，再放大一档
        const unitScale = worldConfig.tileRadius * (hidden ? 2.64 : 3.08);
        // 隐蔽队伍略矮略沉，读作"伏下身"
        PlaceModel(unitPool, model, x, surfaceY + (hidden ? -0.03 : worldConfig.propLift), z,
          facing, unitScale, null, visible, materialOverride);

        // 我方队伍插一面小红旗；隐蔽时不插（还没暴露就不该打旗号）
        if (record.faction === "Player" && !hidden) {
          const flag = CreateBannerModel(playerFlagColors);
          PlaceModel(unitPool, flag, x - 0.30, surfaceY + worldConfig.propLift, z + 0.24, 0.4,
            worldConfig.tileRadius * 0.85, null, visible,
            GetPropMaterial(SourceMaterialOf(flag), "friendly"), false);
        }
      }
    }

    InstancePoolCommit(unitPool, { renderOrder: 2 });
  }

  /** 悬停描边：从地块边沿向下挤出的六边形"外框"。 */
  function BuildHoverOutlineGeometry() {
    const collector = CreateCollector();
    const outer = HexCornerOffsets(1.005);
    const inner = HexCornerOffsets(0.86);
    const depth = 0.34;
    // 顶部环带
    for (let side = 0; side < 6; side += 1) {
      const a = outer[side];
      const b = outer[(side + 1) % 6];
      const ia = inner[side];
      const ib = inner[(side + 1) % 6];
      const base = collector.positions.length / 3;
      const u0 = side / 6;
      const u1 = (side + 1) / 6;
      collector.positions.push(a.x, 0, a.z, b.x, 0, b.z, ib.x, 0, ib.z, ia.x, 0, ia.z);
      collector.normals.push(0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0);
      collector.uvs.push(u0, 0, u1, 0, u1, 0.28, u0, 0.28);
      collector.indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
    }
    // 外侧裙边
    for (let side = 0; side < 6; side += 1) {
      const a = outer[side];
      const b = outer[(side + 1) % 6];
      const base = collector.positions.length / 3;
      const u0 = side / 6;
      const u1 = (side + 1) / 6;
      collector.positions.push(a.x, 0, a.z, b.x, 0, b.z, b.x, -depth, b.z, a.x, -depth, a.z);
      collector.normals.push(0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1);
      collector.uvs.push(u0, 0.28, u1, 0.28, u1, 1, u0, 1);
      collector.indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
    }
    const geometry = FinalizeGeometry(collector);
    if (geometry) geometry.setAttribute("aHexUv", new THREE.Float32BufferAttribute(new Float32Array(geometry.getAttribute("position").count * 2), 2));
    return geometry;
  }

  /**
   * 选中环：内外两圈六边形顶点构成的环带（不是方形 plane），
   * alpha 天然被几何裁到六边形内，不会留下方形残影。
   */
  function BuildSelectRingGeometry() {
    const collector = CreateCollector();
    const outer = HexCornerOffsets(1.06);
    const inner = HexCornerOffsets(0.90);
    const steps = 6;
    for (let side = 0; side < 6; side += 1) {
      const outerFrom = outer[side];
      const outerTo = outer[(side + 1) % 6];
      const innerFrom = inner[side];
      const innerTo = inner[(side + 1) % 6];
      for (let step = 0; step < steps; step += 1) {
        const t0 = step / steps;
        const t1 = (step + 1) / steps;
        const points = [
          { x: Lerp(outerFrom.x, outerTo.x, t0), z: Lerp(outerFrom.z, outerTo.z, t0), edge: 1 },
          { x: Lerp(outerFrom.x, outerTo.x, t1), z: Lerp(outerFrom.z, outerTo.z, t1), edge: 1 },
          { x: Lerp(innerFrom.x, innerTo.x, t1), z: Lerp(innerFrom.z, innerTo.z, t1), edge: 0 },
          { x: Lerp(innerFrom.x, innerTo.x, t0), z: Lerp(innerFrom.z, innerTo.z, t0), edge: 0 },
        ];
        const base = collector.positions.length / 3;
        for (const point of points) {
          collector.positions.push(point.x, 0, point.z);
          collector.normals.push(0, 1, 0);
          // uv.x 记录沿环行进参数，uv.y 记录内外（0 内 1 外）
          collector.uvs.push((side + Lerp(t0, t1, point.edge === 1 ? 0 : 1)) / 6, point.edge);
          collector.hexUvs.push(0, 0);
        }
        collector.indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
      }
    }
    return FinalizeGeometry(collector);
  }

  // -------------------------------------------------------------------------
  // 3.4 光照 / 后处理 / 画质
  // -------------------------------------------------------------------------

  const sunDirection = new THREE.Vector3(0.4, 0.6, 0.7);

  function ComputeSunDirection() {
    const elevation = THREE.MathUtils.degToRad(palette.sun.elevation);
    const azimuth = THREE.MathUtils.degToRad(palette.sun.azimuth);
    sunDirection.set(
      Math.cos(elevation) * Math.sin(azimuth),
      Math.max(Math.sin(elevation), 0.12),
      Math.cos(elevation) * Math.cos(azimuth)
    ).normalize();
    return sunDirection;
  }

  function AttachCsmToMaterial(material) {
    const base = material.userData.baseOnBeforeCompile || null;
    csm.setupMaterial(material);
    const csmCompile = material.onBeforeCompile;
    material.onBeforeCompile = function ChainedOnBeforeCompile(shader, rendererReference) {
      csmCompile.call(this, shader, rendererReference);
      if (base) base.call(this, shader, rendererReference);
    };
    material.needsUpdate = true;
  }

  function DetachCsmFromMaterial(material) {
    if (material.defines) {
      delete material.defines.USE_CSM;
      delete material.defines.CSM_CASCADES;
      delete material.defines.CSM_FADE;
    }
    // 有自定义注入的材质恢复自己的注入函数；没有的直接删掉自有属性，退回原型上的空实现
    if (material.userData.baseOnBeforeCompile) material.onBeforeCompile = material.userData.baseOnBeforeCompile;
    else delete material.onBeforeCompile;
    material.needsUpdate = true;
  }

  /**
   * CSM.dispose() 只解绑 shader，既不把级联方向光移出场景，也不释放阴影贴图。
   * 切画质时若不手动清理，级联灯会逐次累积（2 → 4 → 7 …），阴影显存也会泄漏。
   */
  function DisposeCsm() {
    if (!csm) return;
    const cascadeLights = Array.isArray(csm.lights) ? csm.lights.slice() : [];
    try { csm.remove(); } catch (error) { /* 已被移除时忽略 */ }
    try { csm.dispose(); } catch (error) { /* CSM 内部清理失败不应阻断渲染 */ }
    for (const light of cascadeLights) {
      if (light.shadow && light.shadow.map) { light.shadow.map.dispose(); light.shadow.map = null; }
      if (light.parent) light.parent.remove(light);
      if (light.target && light.target.parent) light.target.parent.remove(light.target);
      light.dispose();
    }
    csm = null;
    for (const material of standardMaterials) DetachCsmFromMaterial(material);
  }

  /**
   * 登记一份需要接入 CSM 的标准材质。Script_Models 的共享材质是惰性创建的，
   * 首次摆放模型后才存在，这里补挂上去，否则立体物件收不到级联阴影。
   */
  function RegisterStandardMaterial(material) {
    if (!material || !material.isMeshStandardMaterial) return;
    if (standardMaterials.includes(material)) return;
    if (!material.userData.baseOnBeforeCompile && material.onBeforeCompile) {
      material.userData.baseOnBeforeCompile = material.onBeforeCompile;
    }
    standardMaterials.push(material);
    if (csm) AttachCsmToMaterial(material);
  }

  function RebuildLighting() {
    DisposeCsm();
    const direction = ComputeSunDirection();
    sunLight.color.setHex(palette.sun.color);
    sunLight.intensity = palette.sun.intensity * 1.70;
    hemisphereLight.color.setHex(palette.ambient.sky);
    hemisphereLight.groundColor.setHex(palette.ambient.ground);
    hemisphereLight.intensity = palette.ambient.intensity * 1.05;
    fillLight.intensity = 0.12 + (1 - Clamp01(palette.sun.intensity / 3)) * 0.06;

    renderer.shadowMap.enabled = profile.shadows;

    // 主阴影：一盏跟随镜头的方向光 + 单张高分辨率阴影图，正交范围只罩住镜头附近的
    // shadowSpan 个世界单位。相比让 CSM 去覆盖整张 520 格地图，每 texel 覆盖的世界
    // 尺寸小一个数量级，地块之间与单位脚下才会出现清晰的投影。
    sunLight.visible = true;
    sunLight.castShadow = profile.shadows;
    if (sunLight.shadow.map && sunLight.shadow.mapSize.width !== profile.shadowMapSize) {
      sunLight.shadow.map.dispose();
      sunLight.shadow.map = null;
    }
    sunLight.shadow.mapSize.set(profile.shadowMapSize, profile.shadowMapSize);
    const span = profile.shadowSpan;
    const shadowCamera = sunLight.shadow.camera;
    shadowCamera.left = -span;
    shadowCamera.right = span;
    shadowCamera.top = span;
    shadowCamera.bottom = -span;
    shadowCamera.near = Math.max(1, span * 1.0);
    shadowCamera.far = span * 4.2 + 30;
    shadowCamera.updateProjectionMatrix();
    sunLight.shadow.bias = -0.00035;
    sunLight.shadow.normalBias = 0.022;
    sunLight.shadow.radius = 1.4;

    // 远景补一层 CSM（仅 ultra）：近处交给上面那盏，远处才让级联接手
    if (profile.csm && profile.shadows) {
      try {
        csm = new CSM({
          camera,
          parent: scene,
          cascades: profile.cascades,
          maxFar: profile.csmMaxFar,
          mode: "practical",
          shadowMapSize: profile.shadowMapSize,
          shadowBias: -0.0006,
          lightDirection: direction.clone().negate(),
          lightIntensity: palette.sun.intensity / (profile.cascades + 1),
          lightMargin: 80,
        });
        csm.fade = true;
        for (const light of csm.lights) light.color.setHex(palette.sun.color);
        // 主光降到补光强度，避免与级联叠加过曝
        sunLight.intensity = palette.sun.intensity / (profile.cascades + 1);
        for (const material of standardMaterials) AttachCsmToMaterial(material);
        return;
      } catch (error) {
        csm = null;
      }
    }

    for (const material of standardMaterials) material.needsUpdate = true;
  }

  function DisposeComposer() {
    if (!composer) return;
    composer.dispose();
    if (gradePass) { gradePass.dispose(); gradePass = null; }
    if (ssaaPass) { ssaaPass.dispose(); ssaaPass = null; }
    if (renderPass) { renderPass.dispose(); renderPass = null; }
    if (outputPass) { outputPass.dispose(); outputPass = null; }
    composer = null;
  }

  function RebuildComposer() {
    DisposeComposer();
    if (!profile.composer) {
      handle.composer = null;
      return;
    }
    composer = new EffectComposer(renderer);
    // 离屏 RT 默认 samples=0，会把画布自带的 antialias 旁路掉——
    // 于是启用了后处理的 high 档反而比不启用的 low 档更锯齿。
    if (composer.renderTarget1) composer.renderTarget1.samples = 4;
    if (composer.renderTarget2) composer.renderTarget2.samples = 4;
    composer.setPixelRatio(renderer.getPixelRatio());

    if (profile.ssaa) {
      ssaaPass = new SSAARenderPass(scene, camera);
      ssaaPass.sampleLevel = 1;
      ssaaPass.unbiased = false;
      composer.addPass(ssaaPass);
    } else {
      renderPass = new RenderPass(scene, camera);
      composer.addPass(renderPass);
    }

    gradePass = new ShaderPass(cinemaGradeShader);
    gradePass.material.defines = Object.assign({}, gradePass.material.defines, { BLOOM_TAPS: profile.bloomTaps });
    if (profile.bloom) gradePass.material.defines.ENABLE_BLOOM = "";
    gradePass.material.needsUpdate = true;
    composer.addPass(gradePass);

    outputPass = new OutputPass();
    composer.addPass(outputPass);

    handle.composer = composer;
    ApplyGradeFromPalette();
    Resize();
  }

  function ApplyGradeFromPalette() {
    if (!gradePass) return;
    const grade = palette.grade;
    const uniforms = gradePass.uniforms;
    uniforms.uSaturation.value = grade.saturation;
    uniforms.uContrast.value = grade.contrast;
    uniforms.uVignette.value = grade.vignette;
    uniforms.uGrain.value = grade.grain;
    uniforms.uBloomThreshold.value = grade.bloomThreshold;
    uniforms.uBloomStrength.value = profile.bloom ? grade.bloomStrength : 0;
    uniforms.uLift.value.set(grade.lift * 0.9, grade.lift, grade.lift * 1.25);
    uniforms.uShadowTint.value.setHex(grade.shadowTint);
    uniforms.uHighlightTint.value.setHex(grade.highlightTint);
    // 逐通道 gamma 构成"解析式 LUT"：蓝通道略提，红通道略压，做出旧胶片的偏色
    uniforms.uGammaValue.value.set(1.0 + (grade.contrast - 1) * 0.35, 1.0, 1.03);
    uniforms.uGain.value.set(1.0, 0.995, 0.985);
  }

  function ApplyPaletteToScene() {
    terrainMaterial.userData.ApplyPalette(palette);
    waterMaterial.userData.ApplyPalette(palette);
    fogOfWarMaterial.userData.ApplyPalette(palette);
    skyDome.userData.ApplyPalette(palette);
    if (!profile.skyClouds) skyDome.userData.uniforms.uCloudOpacity.value = 0;
    scene.fog.color.setHex(palette.fog.color);
    scene.fog.density = palette.fog.density;
    renderer.setClearColor(palette.fog.color, 1);
    const direction = ComputeSunDirection();
    skyDome.userData.uniforms.uSunDirection.value.copy(direction);
    waterMaterial.userData.uniforms.uSunDirection.value.copy(direction);
    sunLight.color.setHex(palette.sun.color);
    sunLight.intensity = palette.sun.intensity * 1.70;
    hemisphereLight.color.setHex(palette.ambient.sky);
    hemisphereLight.groundColor.setHex(palette.ambient.ground);
    hemisphereLight.intensity = palette.ambient.intensity * 1.05;
    fillLight.intensity = 0.12 + (1 - Clamp01(palette.sun.intensity / 3)) * 0.06;
    if (csm) {
      csm.lightDirection.copy(direction).negate().normalize();
      csm.lightIntensity = palette.sun.intensity / Math.max(1, profile.cascades);
      for (const light of csm.lights) {
        light.intensity = csm.lightIntensity;
        light.color.setHex(palette.sun.color);
      }
    }
    ApplyGradeFromPalette();
  }

  function ApplyQualityToMaterials() {
    const terrainUniforms = terrainMaterial.userData.uniforms;
    terrainUniforms.uDetailStrength.value = profile.terrainDetail;
    terrainUniforms.uBumpStrength.value = profile.bumpStrength;
    waterMaterial.userData.uniforms.uDetail.value = profile.waterDetail;
    noiseTexture.anisotropy = profile.anisotropy;
    noiseTexture.needsUpdate = true;
    UpdateFogCloudVisibility();
    skyDome.userData.uniforms.uCloudOpacity.value = profile.skyClouds ? palette.sky.cloudOpacity : 0;
  }

  // -------------------------------------------------------------------------
  // 3.5 世界构建与同步
  // -------------------------------------------------------------------------

  function DisposeMesh(mesh, group) {
    if (!mesh) return;
    if (group) group.remove(mesh);
    if (mesh.geometry) mesh.geometry.dispose();
  }

  function DisposeWorld() {
    DisposeMesh(terrainMesh, terrainGroup); terrainMesh = null;
    DisposeMesh(waterMesh, terrainGroup); waterMesh = null;
    DisposeMesh(roadMesh, propGroup); roadMesh = null;
    DisposeMesh(railMesh, propGroup); railMesh = null;
    DisposeMesh(borderMesh, overlayGroup); borderMesh = null;
    DisposeMesh(overlayMesh, overlayGroup); overlayMesh = null;
    for (const chunk of fogCloudMeshes) DisposeMesh(chunk, overlayGroup);
    fogCloudMeshes.length = 0;
    DisposeMesh(hoverMesh, overlayGroup); hoverMesh = null;
    DisposeMesh(selectMesh, overlayGroup); selectMesh = null;
    InstancePoolDispose(staticPool);
    InstancePoolDispose(unitPool);
    structureSignature = "";
    borderSignature = "";
    staticPropSignature = "";
  }

  function ComputeStructureSignature() {
    let text = "";
    for (const entry of hexEntries) {
      text += `${entry.hex.road || 0}${entry.hex.railway ? 1 : 0}${entry.hex.railBroken ? 1 : 0}|`;
    }
    return text;
  }

  function ComputeBorderSignature() {
    let text = "";
    for (const entry of hexEntries) text += `${entry.hex.control || "-"},`;
    return text;
  }

  /** 静态物件签名：地物、探索、焦土、工事、据点、根据地区域任一变化都要重排。 */
  function ComputeStaticPropSignature() {
    if (!currentState) return "";
    let text = "";
    for (const entry of hexEntries) {
      const hex = entry.hex;
      text += `${hex.feature || "-"}${hex.explored ? 1 : 0}${Math.round((Number(hex.scorch) || 0) / 12)}`;
      const works = Array.isArray(hex.works) ? hex.works : null;
      if (works && works.length) text += `:${works.join("+")}`;
      text += "|";
    }
    for (const stronghold of currentState.strongholds || []) text += `S${stronghold.key}:${stronghold.type};`;
    for (const base of currentState.bases || []) {
      const districts = Array.isArray(base.districts) ? base.districts : [];
      text += `B${base.key}:${base.tier}:${districts.map((d) => (typeof d === "string" ? d : `${d.type}@${d.key || ""}`)).join(",")};`;
    }
    return text;
  }

  function RebuildStructures() {
    DisposeMesh(roadMesh, propGroup); roadMesh = null;
    DisposeMesh(railMesh, propGroup); railMesh = null;
    const roadGeometry = BuildRoadGeometry();
    if (roadGeometry) {
      roadMesh = new THREE.Mesh(roadGeometry, roadMaterial);
      roadMesh.name = "PrairieRoads";
      roadMesh.receiveShadow = true;
      roadMesh.castShadow = false;
      propGroup.add(roadMesh);
    }
    const railGeometry = BuildRailGeometry();
    if (railGeometry) {
      railMesh = new THREE.Mesh(railGeometry, railMaterial);
      railMesh.name = "PrairieRails";
      railMesh.receiveShadow = true;
      railMesh.castShadow = true;
      propGroup.add(railMesh);
    }
  }

  function RebuildBorders() {
    DisposeMesh(borderMesh, overlayGroup); borderMesh = null;
    const geometry = BuildBorderGeometry();
    if (!geometry) return;
    borderMesh = new THREE.Mesh(geometry, borderMaterial);
    borderMesh.name = "PrairieBorders";
    borderMesh.renderOrder = 4;
    overlayGroup.add(borderMesh);
  }

  function BuildWorld(state) {
    if (!state || !state.map) {
      if (typeof console !== "undefined") console.warn("BuildWorld: state.map 缺失，跳过世界构建");
      return;
    }
    currentState = state;
    DisposeWorld();
    if (!BuildHexIndex(state)) return;
    CreateStateTextures();

    palette = CreateSeasonPalette(state.eraKey, state.turn);
    paletteSignature = `${state.eraKey}:${state.turn}`;
    ApplyPaletteToScene();

    const terrainGeometry = BuildTerrainGeometry();
    if (terrainGeometry) {
      terrainMesh = new THREE.Mesh(terrainGeometry, terrainMaterial);
      terrainMesh.name = "PrairieTerrain";
      terrainMesh.castShadow = true;
      terrainMesh.receiveShadow = true;
      terrainGroup.add(terrainMesh);
    }

    const waterGeometry = BuildWaterGeometry();
    if (waterGeometry) {
      waterMesh = new THREE.Mesh(waterGeometry, waterMaterial);
      waterMesh.name = "PrairieWater";
      waterMesh.renderOrder = 2;
      terrainGroup.add(waterMesh);
    }

    const overlayGeometry = BuildOverlayGeometry();
    if (overlayGeometry) {
      overlayMesh = new THREE.Mesh(overlayGeometry, overlayMaterial);
      overlayMesh.name = "PrairieHighlightCarpet";
      overlayMesh.renderOrder = 6;
      overlayMesh.frustumCulled = false;
      overlayGroup.add(overlayMesh);
    }

    for (const chunk of BuildFogCloudChunks()) {
      const mesh = new THREE.Mesh(chunk.geometry, fogOfWarMaterial);
      mesh.name = "PrairieFogClouds";
      mesh.renderOrder = 8;
      mesh.userData.entries = chunk.entries;
      mesh.visible = profile.fogClouds;
      overlayGroup.add(mesh);
      fogCloudMeshes.push(mesh);
    }
    UpdateFogCloudVisibility();

    const hoverGeometry = BuildHoverOutlineGeometry();
    if (hoverGeometry) {
      hoverMesh = new THREE.Mesh(hoverGeometry, hoverMaterial);
      hoverMesh.name = "PrairieHoverOutline";
      hoverMesh.renderOrder = 10;
      hoverMesh.visible = false;
      overlayGroup.add(hoverMesh);
    }

    selectMesh = new THREE.Mesh(BuildSelectRingGeometry(), selectMaterial);
    selectMesh.name = "PrairieSelectRing";
    selectMesh.renderOrder = 11;
    selectMesh.visible = false;
    overlayGroup.add(selectMesh);

    RebuildStructures();
    structureSignature = ComputeStructureSignature();
    RebuildBorders();
    borderSignature = ComputeBorderSignature();
    RebuildStaticProps();
    staticPropSignature = ComputeStaticPropSignature();
    RebuildUnitProps();

    WriteHexState();
    RewriteHighlightTexture();
    RebuildLighting();
    RebuildComposer();
    ApplyQualityToMaterials();
    RegisterStandardMaterial(baseModelMaterial);
    RegisterStandardMaterial(hiddenModelMaterial);
    RegisterStandardMaterial(padMaterial);

    // 初始镜头：战略全局视角——能看清起始根据地周围 7–9 环
    const startKey = state.map.startKey || state.startKey
      || (state.bases && state.bases[0] && state.bases[0].key) || null;
    const startEntry = startKey ? hexByKey.get(startKey) : null;
    const targetX = startEntry ? startEntry.x : mapBounds.centerX;
    const targetZ = startEntry ? startEntry.z : mapBounds.centerZ;
    const targetY = startEntry ? startEntry.centerY : mapBounds.averageTopY;
    controls.target.set(targetX, targetY, targetZ);
    controls.object.updateProjectionMatrix();
    const distance = options.cameraDistance || ComputeFitDistance(options.visibleHexRows || 10);
    // 极角 36°（俯仰 54°）+ 约 18° 方位角：三分之四俯视，天空占比小、棋盘占满画面
    camera.position.set(
      targetX + distance * 0.182,
      targetY + distance * 0.809,
      targetZ + distance * 0.559
    );
    controls.update();
    Resize();
  }

  /**
   * 默认缩放只按 XZ 平面上的"期望可见格数"反算，与 elevationScale 无关，
   * 这样以后调整地形高度不会把镜头顶远。
   */
  function ComputeFitDistance(visibleRows) {
    const rows = Clamp(Number(visibleRows) || 10, 5, 24);
    // 平顶六边形纵向排距 = √3 · hexSize
    const worldSpan = rows * hexSize * Math.sqrt(3);
    const verticalFov = THREE.MathUtils.degToRad(camera.fov);
    // 俯仰 54° 时，屏幕纵向覆盖的地面长度约为视锥高度 / sin(俯仰角)
    const pitchCompensation = 1 / Math.sin(THREE.MathUtils.degToRad(54));
    const distance = (worldSpan * 0.5) / Math.tan(verticalFov * 0.5) / pitchCompensation;
    return Clamp(distance, controls.minDistance + 2, controls.maxDistance - 2);
  }

  function SyncWorld(state) {
    if (!state || !state.map || !hexEntries.length) return;
    currentState = state;
    // 规则层用不可变更新替换 hex 对象，这里重新绑定引用
    let terrainChanged = false;
    for (const entry of hexEntries) {
      const hex = state.map.hexes[entry.key];
      if (!hex) continue;
      if (hex.terrain !== entry.hex.terrain) {
        entry.profile = ResolveTerrainProfile(hex.terrain, terrainDefinitions);
        terrainChanged = true;
      }
      entry.hex = hex;
      entry.moisture = Clamp01(Number(hex.moisture) || 0);
    }
    // 地形被改写（如水淹/开荒）时只重刷顶点色，几何结构保持不变
    if (terrainChanged) RefreshTerrainColors();

    const nextPaletteSignature = `${state.eraKey}:${state.turn}`;
    if (nextPaletteSignature !== paletteSignature) {
      paletteSignature = nextPaletteSignature;
      palette = CreateSeasonPalette(state.eraKey, state.turn);
      ApplyPaletteToScene();
      if (csm) {
        csm.lightDirection.copy(ComputeSunDirection()).negate().normalize();
        csm.updateFrustums();
      }
    }

    WriteHexState();
    UpdateFogCloudVisibility();

    const nextStructureSignature = ComputeStructureSignature();
    if (nextStructureSignature !== structureSignature) {
      structureSignature = nextStructureSignature;
      RebuildStructures();
      if (csm) for (const material of standardMaterials) if (!material.defines || !material.defines.USE_CSM) AttachCsmToMaterial(material);
    }

    const nextBorderSignature = ComputeBorderSignature();
    if (nextBorderSignature !== borderSignature) {
      borderSignature = nextBorderSignature;
      RebuildBorders();
    }

    // 静态物件只在"地物 / 探索 / 焦土 / 工事 / 据点 / 区域"变化时重排；
    // 部队每回合都要跟着走位，但也只是重写实例矩阵，不重建几何体。
    const nextStaticPropSignature = ComputeStaticPropSignature();
    if (nextStaticPropSignature !== staticPropSignature) {
      staticPropSignature = nextStaticPropSignature;
      RebuildStaticProps();
    }
    RebuildUnitProps();
    RegisterStandardMaterial(baseModelMaterial);
    RegisterStandardMaterial(hiddenModelMaterial);
    RegisterStandardMaterial(padMaterial);

    if (hoverKey && !hexByKey.has(hoverKey)) SetHoverHex(null);
    if (selectedKey && !hexByKey.has(selectedKey)) SetSelectedHex(null);
  }

  // -------------------------------------------------------------------------
  // 3.6 交互
  // -------------------------------------------------------------------------

  function SetHoverHex(key) {
    hoverKey = key || null;
    if (!hoverMesh) return;
    const entry = hoverKey ? hexByKey.get(hoverKey) : null;
    if (!entry) { hoverMesh.visible = false; return; }
    hoverMesh.visible = true;
    // 顶面有起伏，描边环需要略高于地块高台，避免被山尖穿插
    hoverMesh.position.set(entry.x, entry.crestY + 0.07, entry.z);
  }

  function SetSelectedHex(key) {
    selectedKey = key || null;
    if (!selectMesh) return;
    const entry = selectedKey ? hexByKey.get(selectedKey) : null;
    if (!entry) { selectMesh.visible = false; return; }
    selectMesh.visible = true;
    selectMesh.position.set(entry.x, entry.crestY + worldConfig.overlayLift + 0.02, entry.z);
  }

  /** keys 为空数组时清空该 kind；keys 为 null/undefined 时清空全部高亮。 */
  function SetHighlight(keys, kind) {
    if (keys === null || keys === undefined) {
      highlightByKind.clear();
      RewriteHighlightTexture();
      return;
    }
    const kindName = highlightKinds.indexOf(kind) >= 0 ? kind : highlightKinds[0];
    const keySet = new Set();
    const list = Array.isArray(keys) ? keys : [keys];
    for (const key of list) {
      if (typeof key === "string") keySet.add(key);
      else if (key && typeof key.key === "string") keySet.add(key.key);
      else if (key && Number.isFinite(key.q) && Number.isFinite(key.r)) keySet.add(HexKey(key.q, key.r));
    }
    if (keySet.size === 0) highlightByKind.delete(kindName);
    else highlightByKind.set(kindName, keySet);
    RewriteHighlightTexture();
  }

  /**
   * 兜底：用水平面迭代反解轴向坐标。先按平均高度求交，再用命中格的实际高台高度
   * 修正平面重来一次，两三步即收敛。不处理遮挡，只在射线越过高度场时使用。
   */
  function PickByIteratedPlane() {
    let planeY = mapBounds.averageTopY;
    let resolvedKey = null;
    for (let iteration = 0; iteration < 4; iteration += 1) {
      pickPlane.set(pickPlane.normal.set(0, 1, 0), -planeY);
      if (!raycaster.ray.intersectPlane(pickPlane, pickPoint)) return resolvedKey;
      const axial = WorldToHex(pickPoint.x, pickPoint.z, hexSize);
      const key = HexKey(axial.q, axial.r);
      const entry = hexByKey.get(key);
      if (!entry) return null;
      if (resolvedKey === key) break;
      resolvedKey = key;
      planeY = entry.topY;
    }
    return resolvedKey;
  }

  /**
   * 主拾取路径：把地块顶面当成高度场，沿射线步进求第一个"射线高度落到该格高台之下"
   * 的位置，再做几次二分细化。
   * 相比对 4.7 万三角的合并网格做 Raycaster 暴力求交（≈3.5 ms），这里是 O(跨越格数)，
   * 约 0.02 ms，并且天然正确处理"前方山峰遮挡后方谷地"与"点在侧壁上"两种情况。
   */
  function PickByHeightField() {
    const origin = raycaster.ray.origin;
    const direction = raycaster.ray.direction;
    if (direction.y > -1e-5) return null;               // 视线水平或朝上，打不到地面
    const ceiling = mapBounds.maxTopY + 0.45;           // 最高峰顶（含隆起余量）
    const floor = mapBounds.minTopY - 1.0;
    let travel = Math.max(0, (ceiling - origin.y) / direction.y);
    const limit = Math.max(travel, (floor - origin.y) / direction.y);
    const step = 0.26;
    let previousTravel = travel;
    let hitEntry = null;

    while (travel <= limit) {
      const x = origin.x + direction.x * travel;
      const y = origin.y + direction.y * travel;
      const z = origin.z + direction.z * travel;
      const axial = WorldToHex(x, z, hexSize);
      const entry = hexByKey.get(HexKey(axial.q, axial.r));
      if (entry && y <= entry.topY) { hitEntry = entry; break; }
      previousTravel = travel;
      travel += step;
    }
    if (!hitEntry) return null;

    // 二分细化到穿透点，再重新取格，消除步长带来的边界误差
    let low = previousTravel;
    let high = travel;
    for (let iteration = 0; iteration < 8; iteration += 1) {
      const middle = (low + high) * 0.5;
      const x = origin.x + direction.x * middle;
      const y = origin.y + direction.y * middle;
      const z = origin.z + direction.z * middle;
      const axial = WorldToHex(x, z, hexSize);
      const entry = hexByKey.get(HexKey(axial.q, axial.r));
      if (entry && y <= entry.topY) high = middle;
      else low = middle;
    }
    const x = origin.x + direction.x * high;
    const z = origin.z + direction.z * high;
    const axial = WorldToHex(x, z, hexSize);
    const key = HexKey(axial.q, axial.r);
    return hexByKey.has(key) ? key : hitEntry.key;
  }

  function PickHex(clientX, clientY) {
    if (!hexEntries.length) return null;
    const roundedX = Math.round(clientX);
    const roundedY = Math.round(clientY);
    if (roundedX === pickCacheX && roundedY === pickCacheY) return pickCacheKey;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    pointerVector.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointerVector.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointerVector, camera);

    let resolvedKey = PickByHeightField();
    if (!resolvedKey) resolvedKey = PickByIteratedPlane();

    pickCacheX = roundedX;
    pickCacheY = roundedY;
    pickCacheKey = resolvedKey;
    return resolvedKey;
  }

  /** 平滑飞向某格；返回 Promise，可 await。 */
  function FocusHex(key, focusOptions = {}) {
    const entry = hexByKey.get(key);
    if (!entry) return Promise.resolve(false);
    const duration = Number.isFinite(focusOptions.duration) ? Math.max(0, focusOptions.duration) : 0.85;
    const currentOffset = scratchVector.copy(camera.position).sub(controls.target);
    const currentDistance = currentOffset.length() || 26;
    const targetDistance = Clamp(
      Number.isFinite(focusOptions.distance) ? focusOptions.distance : currentDistance,
      controls.minDistance, controls.maxDistance
    );
    const toTarget = new THREE.Vector3(entry.x, entry.topY, entry.z);
    const direction = currentOffset.clone().normalize();
    if (!Number.isFinite(direction.x) || direction.lengthSq() < 0.0001) direction.set(0.35, 0.72, 0.60).normalize();
    const toPosition = toTarget.clone().addScaledVector(direction, targetDistance);

    if (duration <= 0 || focusOptions.immediate) {
      controls.target.copy(toTarget);
      camera.position.copy(toPosition);
      controls.update();
      return Promise.resolve(true);
    }
    if (focusFlight && focusFlight.resolve) focusFlight.resolve(false);
    return new Promise((resolve) => {
      focusFlight = {
        fromTarget: controls.target.clone(),
        toTarget,
        fromPosition: camera.position.clone(),
        toPosition,
        elapsed: 0,
        duration,
        resolve,
      };
    });
  }

  function UpdateFocusFlight(deltaSeconds) {
    if (!focusFlight) return;
    focusFlight.elapsed += deltaSeconds;
    const raw = Clamp01(focusFlight.elapsed / focusFlight.duration);
    // easeInOutCubic
    const eased = raw < 0.5 ? 4 * raw * raw * raw : 1 - Math.pow(-2 * raw + 2, 3) / 2;
    controls.target.lerpVectors(focusFlight.fromTarget, focusFlight.toTarget, eased);
    camera.position.lerpVectors(focusFlight.fromPosition, focusFlight.toPosition, eased);
    if (raw >= 1) {
      const resolve = focusFlight.resolve;
      focusFlight = null;
      if (resolve) resolve(true);
    }
  }

  function ClampCameraToBounds() {
    const clampedX = Clamp(controls.target.x, mapBounds.minX, mapBounds.maxX);
    const clampedZ = Clamp(controls.target.z, mapBounds.minZ, mapBounds.maxZ);
    const clampedY = Clamp(controls.target.y, mapBounds.minTopY - 1, mapBounds.maxTopY + 2);
    if (clampedX !== controls.target.x || clampedZ !== controls.target.z || clampedY !== controls.target.y) {
      camera.position.x += clampedX - controls.target.x;
      camera.position.y += clampedY - controls.target.y;
      camera.position.z += clampedZ - controls.target.z;
      controls.target.set(clampedX, clampedY, clampedZ);
    }
  }

  // -------------------------------------------------------------------------
  // 3.7 逐帧
  // -------------------------------------------------------------------------

  function UpdateTimeUniforms() {
    terrainMaterial.userData.uniforms.uTime.value = elapsedTime;
    waterMaterial.userData.uniforms.uTime.value = elapsedTime;
    fogOfWarMaterial.userData.uniforms.uTime.value = elapsedTime;
    overlayMaterial.userData.uniforms.uTime.value = elapsedTime;
    hoverMaterial.userData.uniforms.uTime.value = elapsedTime;
    selectMaterial.userData.uniforms.uTime.value = elapsedTime;
    skyDome.userData.uniforms.uTime.value = elapsedTime;
    if (gradePass) gradePass.uniforms.uTime.value = elapsedTime;
  }

  function Update(deltaSeconds) {
    if (disposed) return;
    const delta = Number.isFinite(deltaSeconds) ? Clamp(deltaSeconds, 0, 0.25) : 1 / 60;
    elapsedTime += delta;

    UpdateFocusFlight(delta);
    controls.update();
    ClampCameraToBounds();

    skyDome.position.copy(camera.position);
    UpdateTimeUniforms();
    // 旗帜与植被的顶点风摆：Script_Effects 也会调，这里保证没挂特效时同样会动。
    // TickModelWind 只是写两个共享 uniform，重复调用完全无害。
    TickModelWind(elapsedTime, windStrength);

    if (csm) {
      csm.update();
    }
    if (sunLight.visible && sunLight.castShadow) {
      // 阴影相机跟着镜头焦点走，让有限的 texel 全部花在玩家正看着的区域
      const direction = ComputeSunDirection();
      const reach = profile.shadowSpan * 1.9 + 18;
      sunLight.position.copy(controls.target).addScaledVector(direction, reach);
      sunLight.target.position.copy(controls.target);
      sunLight.target.updateMatrixWorld();
      sunLight.updateMatrixWorld();
    }

    if (handle.effects && typeof handle.effects.Update === "function") {
      handle.effects.Update(delta, elapsedTime);
    }

    // 拾取缓存每帧失效，避免相机移动后返回过期结果
    pickCacheX = -99999;
    pickCacheY = -99999;

    // info.autoReset 已关：手动在帧首归零，让 renderer.info 统计整帧
    // （阴影 pass + 场景 pass + 后处理）的真实 draw call，而不是最后一次 render。
    renderer.info.reset();
    if (composer) composer.render(delta);
    else renderer.render(scene, camera);
  }

  function Resize() {
    if (disposed) return;
    const width = canvas.clientWidth || (typeof window !== "undefined" ? window.innerWidth : 1280);
    const height = canvas.clientHeight || (typeof window !== "undefined" ? window.innerHeight : 720);
    if (!width || !height) return;
    // 只有一条渲染路径，设备差异全部由像素比吸收——它不改变 shader 编译结果，
    // 因此不会像分档那样制造未经验证的分支。窄屏与低核心数机器再降一档。
    const devicePixelRatio = typeof window !== "undefined" ? (window.devicePixelRatio || 1) : 1;
    const cores = typeof navigator !== "undefined" ? (navigator.hardwareConcurrency || 4) : 4;
    let cap = profile.pixelRatioCap;
    if (width < 820 || cores <= 4) cap = Math.min(cap, 1.0);
    else if (width < 1400) cap = Math.min(cap, 1.3);
    renderer.setPixelRatio(Math.min(devicePixelRatio, cap));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    if (composer) {
      composer.setPixelRatio(renderer.getPixelRatio());
      composer.setSize(width, height);
    }
    if (gradePass) {
      gradePass.uniforms.uResolution.value.set(width * renderer.getPixelRatio(), height * renderer.getPixelRatio());
    }
    if (csm) csm.updateFrustums();
  }

  function SetQuality(level) {
    if (!qualityProfiles[level] || level === quality) return quality;
    quality = level;
    profile = qualityProfiles[quality];
    handle.quality = quality;
    handle.qualityProfile = profile;
    ApplyQualityToMaterials();
    RebuildLighting();
    RebuildComposer();
    Resize();
    return quality;
  }

  function Dispose() {
    if (disposed) return;
    disposed = true;
    if (focusFlight && focusFlight.resolve) { focusFlight.resolve(false); focusFlight = null; }
    DisposeComposer();
    DisposeCsm();
    DisposeWorld();
    DisposeStateTextures();
    controls.dispose();
    scene.remove(terrainGroup, overlayGroup, propGroup, skyDome, sunLight, sunLight.target, hemisphereLight, fillLight);
    if (skyDome.geometry) skyDome.geometry.dispose();
    if (sunLight.shadow && sunLight.shadow.map) { sunLight.shadow.map.dispose(); sunLight.shadow.map = null; }
    // 立体物件层：合批池、渲染层自建的底座几何、半透明隐蔽材质
    if (unitPadGeometry) { unitPadGeometry.dispose(); unitPadGeometry = null; }
    if (hiddenRingGeometry) { hiddenRingGeometry.dispose(); hiddenRingGeometry = null; }
    if (padMaterial) { padMaterial.dispose(); padMaterial = null; }
    if (hiddenModelMaterial) { hiddenModelMaterial.dispose(); hiddenModelMaterial = null; }
    baseModelMaterial = null;
    // 本实例独占的材质逐个释放（Script_Materials 的工厂每次调用都返回新实例）
    for (const material of [terrainMaterial, waterMaterial, fogOfWarMaterial, overlayMaterial,
      hoverMaterial, selectMaterial, skyDome.material, ...localMaterials]) {
      if (material && typeof material.dispose === "function") material.dispose();
    }
    hexEntries.length = 0;
    hexByKey.clear();
    highlightByKind.clear();
    colorLowCache.clear();
    colorHighCache.clear();
    strataLowCache.clear();
    strataHighCache.clear();
    modelParts.length = 0;
    // 共享的程序化缓存（材质纹理 / 模型几何）只在最后一个渲染器销毁时拆除
    liveRendererCount = Math.max(0, liveRendererCount - 1);
    if (liveRendererCount === 0) {
      DisposeMaterialCache();
      DisposeModelCache();
    }
    // 只调 dispose()，不调 forceContextLoss()：后者会让同一张 canvas 无法再次创建渲染器
    renderer.dispose();
    handle.composer = null;
    handle.effects = null;
    currentState = null;
  }

  // -------------------------------------------------------------------------
  // 3.8 句柄
  // -------------------------------------------------------------------------

  const handle = {
    scene,
    camera,
    controls,
    renderer,
    composer: null,
    effects: null,
    quality,
    qualityProfile: profile,
    BuildWorld,
    SyncWorld,
    SetHoverHex,
    SetSelectedHex,
    SetHighlight,
    PickHex,
    FocusHex,
    Update,
    Resize,
    SetQuality,
    Dispose,
    // 附加工具：主流程 / 特效模块常用
    /** 主流程若已同步 import 了 Data_Terrain，可直接注入，无需等待内部的动态 import。 */
    SetTerrainDefinitions(definitions) {
      if (!definitions || typeof definitions !== "object") return false;
      terrainDefinitions = definitions;
      if (terrainMesh) {
        for (const entry of hexEntries) entry.profile = ResolveTerrainProfile(entry.hex.terrain, terrainDefinitions);
        RefreshTerrainColors();
      }
      return true;
    },
    GetPalette() { return palette; },
    /** 返回该格地表中心的世界坐标（已含起伏与山顶隆起），特效与模型摆放都用它。 */
    GetHexWorldPosition(key, lift = 0) {
      const entry = hexByKey.get(key);
      if (!entry) return null;
      return new THREE.Vector3(entry.x, entry.centerY + lift, entry.z);
    },
    GetHexTopHeight(key) {
      const entry = hexByKey.get(key);
      return entry ? entry.centerY : 0;
    },
    GetMapBounds() { return Object.assign({}, mapBounds); },
    /** 天气/特效可调节全局风力，驱动旗帜与植被的顶点动画。 */
    SetWindStrength(value) { windStrength = Clamp(Number(value) || 0, 0, 3); return windStrength; },
    /** 实测统计：整帧 draw call / 三角数，以及立体物件层的合批情况。 */
    GetRenderStats() {
      const staticStats = InstancePoolStats(staticPool);
      const unitStats = InstancePoolStats(unitPool);
      return {
        calls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        geometries: renderer.info.memory.geometries,
        textures: renderer.info.memory.textures,
        programs: renderer.info.programs ? renderer.info.programs.length : 0,
        staticProps: staticStats,
        unitProps: unitStats,
        propCalls: staticStats.calls + unitStats.calls,
        propInstances: staticStats.instances + unitStats.instances,
      };
    },
    CreateBannerTexture,
    ProjectHexToScreen(key, lift = 0.6) {
      const entry = hexByKey.get(key);
      if (!entry) return null;
      scratchVector.set(entry.x, entry.topY + lift, entry.z).project(camera);
      const rect = canvas.getBoundingClientRect();
      return {
        x: rect.left + (scratchVector.x * 0.5 + 0.5) * rect.width,
        y: rect.top + (-scratchVector.y * 0.5 + 0.5) * rect.height,
        visible: scratchVector.z < 1,
      };
    },
  };

  RebuildLighting();
  RebuildComposer();
  ApplyPaletteToScene();
  ApplyQualityToMaterials();
  Resize();

  return handle;
}
