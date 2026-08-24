// 《滕县 一九三八》半实时全局光照：辐照度探针体（DDGI 式）。
//
// ---------------------------------------------------------------------------
// 为什么要有这一套
// ---------------------------------------------------------------------------
// 在这之前，全场的间接光只有**一张天空 IBL**（Script_Sky 烘的 PMREM）加一盏
// 半球光。它没有位置概念：屋里和街上、墙根和墙头，拿到的环境光一模一样。
// Data_TechRenderPipeline.md 与 SKY_PRESETS 的注释里反复记着同一条实测 ——
// 「把 lightIntensity 从 3.1 抬到 30，街上墙面只从 sRGB 88.5 动到 89.8」——
// 那不是平行光不够强，是**这条街的亮度几乎全部来自一张各向同性的 IBL**。
// 于是每一面墙、每一片瓦、每一块地都是同一个亮度同一个色相，整张图糊成土黄。
// 靠调 envIntensity 只能整体升降，永远换不来「屋里比街上暗」这件事。
//
// 探针体解决的正是这一条：**间接光第一次有了位置**。
//   - 屋里的探针看不见天，屋里就真的暗下来（不是靠 SSAO 抹一层脏）；
//   - 晒着的砖墙把暖色弹到对面阴影墙上、弹到士兵下巴上；
//   - 着火的院子把橙色泼到半条街上（burningStreet / night 两档收益最大）；
//   - 换时段只要天变了，探针自己会重新收敛，**没有任何预烘焙**。
//
// ---------------------------------------------------------------------------
// 方案选型：为什么是「探针 + 代理几何体上跑光追」
// ---------------------------------------------------------------------------
// 参考的是《全境封锁》(Snowdrop) 那一路「半实时探针」：一格一格地摆探针，
// 每帧只更新一小撮，结果存成低阶表示，材质里插值取用；上一次的结果再喂回下一次，
// 多次反弹是白送的。本作在它之上换了两处，都是为了 WebGL2 这块地：
//
//  1) **更新探针不靠渲 cubemap，靠射线**。Snowdrop 是把场景往探针的小立方体上
//     渲六个面。three 里那等于每个探针 6 次 renderer.render()，光 JS 侧的开销
//     （遍历、剔除、状态机）就吃掉几毫秒，一帧更新不了几个探针。
//     这里改成在 shader 里直接对**碰撞盒代理体**做解析光追：BuildSink 为了物理
//     早就攒了一张 AABB 表（几百个盒子），拿来当 GI 的代理几何体是白捡的 ——
//     一帧 5 个 draw call 就能更新十几个探针，且完全不动主场景的图元。
//
//  2) **带可见性的八面体探针（DDGI），不是 SH**。SH 只有辐照度、没有遮挡，
//     街对面的太阳光会直接漏进屋里 —— 巷战场景里这是致命的。
//     每个探针除了 8×8 的八面体辐照度，还存一张 16×16 的「到最近遮挡物的距离
//     一阶矩/二阶矩」，取样时做切比雪夫检验（方差阴影那一套），墙就真的挡光了。
//
// r185 其实自带一条 `USE_LIGHT_PROBES_GRID`（`lightprobes_pars_fragment`，
// SH-L2 存在 sampler3D 里）。没用它的原因有两条，都是硬伤：它是**烘焙资产**喂的
// （materialProperties.lightProbeGrid），而本作要的是随时段/火光实时收敛；
// 而且它只有三线性插值、没有可见性项，漏光挡不住。
//
// ---------------------------------------------------------------------------
// 一帧五个 draw call
// ---------------------------------------------------------------------------
//   [1] Trace  : (rays × batch) 的小靶。每个像素 = 一根射线，对 AABB 汤求交，
//                命中点算「太阳(带阴影射线) + 火光 + 上一帧探针的间接光」，
//                漏空的取天空解析式（不含太阳盘，见 Script_Sky 的 sunDiskGain）。
//   [2] Copy   : 上一帧的辐照度图集整张搬到 ping-pong 的另一面（WebGL 不能
//                边读边写同一张靶，而我们每帧只重算十几个瓦片，其余必须留着）。
//   [3] BlendI : 用实例化四边形，把这一批探针的辐照度瓦片写进图集（含 1 像素边框），
//                与上一帧按迟滞系数混合。
//   [4] Copy   : 距离图集同上。
//   [5] BlendD : 距离矩瓦片同上。
//
// ---------------------------------------------------------------------------
// 坑（踩过的写在这里，别再踩）
// ---------------------------------------------------------------------------
//  - three 的片元里 `geometryNormal` 是**视空间**的，直接拿去查世界空间的探针体
//    会得到一张跟着镜头转的假 GI。要用 <common> 里的
//    transformNormalByInverseViewMatrix 转回世界空间。
//  - 图集瓦片必须留 1 像素边框并且**边框也要算**（按八面体的镜像规则取方向），
//    否则硬件双线性在瓦片边缘会采到隔壁探针，法线一转就闪一条缝。
//  - 探针体是跟着玩家滚动的裁剪图（clipmap）：存储下标用环形取模，
//    只有真正滚进来的那一层才作废重算，否则走一步全场 980 个探针一起重来。
//  - 探针落在墙体里就没有意义。CPU 侧拿同一张 AABB 表做重定位（往外挤），
//    挤不出去的直接标记作废，取样时权重为 0 —— 这一条比任何 shader 技巧都管用。

import * as THREE from "three";
import { SKY_RADIANCE_GLSL } from "./Script_Sky.mjs";

const MAX_BATCH = 16;      // 一帧最多更新多少个探针（uniform 数组长度，改了要一起改 GLSL）
const MAX_BOXES = 768;     // 送进 shader 的代理盒上限
const MAX_FIRES = 6;       // 与 LightRig.fireLights 对齐

/**
 * 画质档。
 *
 * counts 是探针体的格数、spacing 是格距（米），两者相乘就是覆盖范围：
 * high 档 14×5×14 × 4 m = 56 × 20 × 56 m —— 一条街连两侧院子，够巷战用。
 * 再大就得上第二级 cascade，本轮不做（远处仍然吃天空 IBL，会平滑过渡过去）。
 *
 * batch / rays 决定收敛速度与成本：high 档 980 个探针、每帧 12 个，
 * 全场扫一遍 82 帧（1.4 秒）。太阳不动的场景这个延迟看不出来；
 * 真正要紧的是**刚滚进来的探针**，它们插队优先算，几帧就补上。
 */
export const GI_QUALITY = {
  low: null,
  medium: { counts: [10, 4, 10], spacing: 5.0, rays: 32, batch: 8, irrTexels: 8, distTexels: 12 },
  high: { counts: [14, 5, 14], spacing: 4.0, rays: 64, batch: 12, irrTexels: 8, distTexels: 16 },
  ultra: { counts: [16, 6, 16], spacing: 3.5, rays: 96, batch: 16, irrTexels: 8, distTexels: 16 },
};

/** 代理体反照率：碰撞盒只有 tag，靠这张表染色。都是线性空间的值。 */
export const GI_ALBEDO = {
  wall: [0.40, 0.38, 0.35],       // 青砖 / 夯土墙，鲁南民居的主色
  parapet: [0.40, 0.38, 0.35],
  rampart: [0.38, 0.34, 0.29],
  tower: [0.40, 0.38, 0.35],
  ramp: [0.42, 0.39, 0.34],
  bridge: [0.42, 0.39, 0.34],
  barricade: [0.30, 0.26, 0.20],
  prop: [0.28, 0.22, 0.16],       // 木器杂物
  ground: [0.34, 0.28, 0.20],     // 土路：偏暖，人物下巴的暖反光全靠它
};

// ---------------------------------------------------------------------------
// 共用 GLSL
// ---------------------------------------------------------------------------

/** 八面体编解码。取样端（材质）与写入端（Blend pass）必须用同一份。 */
const GI_OCT_GLSL = /* glsl */`
vec2 GiOctEncode(vec3 n) {
  n /= (abs(n.x) + abs(n.y) + abs(n.z));
  vec2 o = n.xy;
  if (n.z < 0.0) {
    o = (1.0 - abs(n.yx)) * vec2(n.x >= 0.0 ? 1.0 : -1.0, n.y >= 0.0 ? 1.0 : -1.0);
  }
  return o;
}
vec3 GiOctDecode(vec2 f) {
  vec3 n = vec3(f.x, f.y, 1.0 - abs(f.x) - abs(f.y));
  float t = max(-n.z, 0.0);
  n.x += n.x >= 0.0 ? -t : t;
  n.y += n.y >= 0.0 ? -t : t;
  return normalize(n);
}
`;

/** 射线方向：球面斐波那契 + 每帧一个随机旋转。Trace 与 Blend 两端必须完全一致。 */
const GI_RAYDIR_GLSL = /* glsl */`
uniform mat3 uGiRayRotation;
uniform float uGiRayCount;
vec3 GiRayDirection(float index) {
  float phi = 6.28318530718 * fract(index * 0.618033988749895);
  float cosTheta = 1.0 - (2.0 * index + 1.0) / uGiRayCount;
  float sinTheta = sqrt(clamp(1.0 - cosTheta * cosTheta, 0.0, 1.0));
  return uGiRayRotation * vec3(cos(phi) * sinTheta, sin(phi) * sinTheta, cosTheta);
}
`;

/**
 * 取样端：注进 MeshStandardMaterial，也给调试小球用。
 *
 * 权重三件套，缺一个就翻车：
 *   三线性  —— 位置插值，基础项；
 *   背面项  —— 探针在这块面的背后就基本不算数，否则墙背面的探针把光带过来；
 *   切比雪夫 —— 探针到这一点之间有没有挡的。这一项才是「屋里不漏光」的真正依靠。
 */
export const GI_SAMPLE_GLSL = GI_OCT_GLSL + /* glsl */`
uniform sampler2D uGiIrradiance;
uniform sampler2D uGiDistance;
uniform sampler2D uGiOffset;
uniform vec3 uGiOrigin;
uniform vec3 uGiCounts;
uniform vec3 uGiBaseCell;
uniform float uGiSpacing;
uniform float uGiIrrTexels;
uniform float uGiDistTexels;
uniform vec2 uGiIrrAtlas;
uniform vec2 uGiDistAtlas;
uniform float uGiIntensity;
uniform float uGiNormalBias;
uniform float uGiSpecularOcclusion;
uniform float uGiEnabled;

vec3 GiStorageCoord(vec3 grid) {
  return mod(grid + uGiBaseCell, uGiCounts);
}
vec2 GiTileIndex(vec3 storage) {
  return vec2(storage.x, storage.z + uGiCounts.z * storage.y);
}
vec2 GiAtlasUv(vec3 storage, vec3 dir, float texels, vec2 atlasSize) {
  vec2 tile = GiTileIndex(storage) * (texels + 2.0);
  vec2 inner = (GiOctEncode(normalize(dir)) * 0.5 + 0.5) * texels;
  return (tile + 1.0 + inner) / atlasSize;
}
vec4 GiProbeMeta(vec3 storage) {
  vec2 t = GiTileIndex(storage) + 0.5;
  return texture2D(uGiOffset, t / vec2(uGiCounts.x, uGiCounts.y * uGiCounts.z));
}

/**
 * 取一点的间接漫反射辐照度。
 * worldNormal / worldView 都要世界空间。confidence 出参：0 = 体外，用天空 IBL 兜底。
 */
vec3 GiSampleIrradiance(vec3 worldPos, vec3 worldNormal, vec3 worldView, out float confidence) {
  confidence = 0.0;
  vec3 biased = worldPos + worldNormal * uGiNormalBias + worldView * (uGiNormalBias * 0.8);
  vec3 gridF = (biased - uGiOrigin) / uGiSpacing;
  vec3 inside = min(gridF, uGiCounts - 1.0 - gridF);
  float edge = clamp(min(min(inside.x, inside.y), inside.z), 0.0, 1.0);
  if (edge <= 0.0) return vec3(0.0);

  vec3 base = floor(gridF);
  vec3 frac = clamp(gridF - base, 0.0, 1.0);
  vec3 sum = vec3(0.0);
  float weightSum = 0.0;

  for (int i = 0; i < 8; i++) {
    vec3 corner = vec3(float(i & 1), float((i >> 1) & 1), float((i >> 2) & 1));
    vec3 grid = clamp(base + corner, vec3(0.0), uGiCounts - 1.0);
    vec3 storage = GiStorageCoord(grid);
    vec4 meta = GiProbeMeta(storage);
    if (meta.w < 0.5) continue;                       // 探针埋在墙里，作废

    vec3 probePos = uGiOrigin + grid * uGiSpacing + meta.xyz;
    vec3 tri = mix(1.0 - frac, frac, corner);
    float w = tri.x * tri.y * tri.z;

    vec3 toProbe = probePos - worldPos;
    float toProbeLen = length(toProbe);
    vec3 dirToProbe = toProbeLen > 1e-4 ? toProbe / toProbeLen : worldNormal;
    // 背面项（DDGI 的 smooth backface）：平方一下，让「勉强在正面」的探针也退下去
    float backface = dot(dirToProbe, worldNormal) * 0.5 + 0.5;
    w *= backface * backface + 0.05;

    // 切比雪夫可见性
    vec3 fromProbe = biased - probePos;
    float dist = length(fromProbe);
    vec2 moments = texture2D(uGiDistance, GiAtlasUv(storage, fromProbe, uGiDistTexels, uGiDistAtlas)).rg;
    float mean = moments.x;
    if (dist > mean) {
      float variance = abs(mean * mean - moments.y);
      float diff = dist - mean;
      float cheb = variance / (variance + diff * diff);
      w *= max(cheb * cheb * cheb, 0.0);
    }

    w = max(w, 1e-5);
    // 极小权重再往下压一档：八个角里混进一个「勉强算数」的会把结果整体带偏
    if (w < 0.2) w *= (w * w) / 0.04;

    sum += texture2D(uGiIrradiance, GiAtlasUv(storage, worldNormal, uGiIrrTexels, uGiIrrAtlas)).rgb * w;
    weightSum += w;
  }

  if (weightSum <= 1e-6) return vec3(0.0);
  confidence = edge;
  // 图集里存的是余弦加权的**平均辐射亮度**；three 的 iblIrradiance 是 π×L 的量纲
  return (sum / weightSum) * 3.14159265359;
}
`;

// ---------------------------------------------------------------------------
// Trace pass
// ---------------------------------------------------------------------------

const GI_TRACE_FRAG = SKY_RADIANCE_GLSL + GI_SAMPLE_GLSL + GI_RAYDIR_GLSL + /* glsl */`
uniform sampler2D uBoxes;
uniform int uBoxCount;
uniform vec3 uBatchPos[${MAX_BATCH}];
uniform vec3 uSunDir;
uniform vec3 uSunIrradiance;
uniform vec3 uFirePos[${MAX_FIRES}];
uniform vec3 uFireColor[${MAX_FIRES}];
uniform float uFireRange[${MAX_FIRES}];
uniform int uFireCount;
uniform float uGroundY;
uniform vec3 uGroundAlbedo;
uniform float uMaxDistance;

// 光线与轴对齐盒求交（slab 法）。从盒子内部出发一律判不中 ——
// 那种探针在 CPU 侧已经被重定位或作废了，这里再让它「从墙里射出去」只会算出鬼影。
bool GiRayBox(vec3 ro, vec3 invDir, vec3 sgn, vec3 bmin, vec3 bmax, float tMax,
              out float tHit, out vec3 nHit) {
  vec3 t0 = (bmin - ro) * invDir;
  vec3 t1 = (bmax - ro) * invDir;
  vec3 tsm = min(t0, t1);
  vec3 tbg = max(t0, t1);
  float tn = max(max(tsm.x, tsm.y), tsm.z);
  float tf = min(min(tbg.x, tbg.y), tbg.z);
  if (tf < tn || tn <= 0.001 || tn >= tMax) return false;
  tHit = tn;
  nHit = -sgn * step(tsm.yzx, tsm.xyz) * step(tsm.zxy, tsm.xyz);
  return true;
}

bool GiOccluded(vec3 ro, vec3 rd, float tMax) {
  vec3 sgn = vec3(rd.x >= 0.0 ? 1.0 : -1.0, rd.y >= 0.0 ? 1.0 : -1.0, rd.z >= 0.0 ? 1.0 : -1.0);
  vec3 invDir = 1.0 / (sgn * max(abs(rd), vec3(1e-6)));
  float t; vec3 n;
  for (int i = 0; i < ${MAX_BOXES}; i++) {
    if (i >= uBoxCount) break;
    vec3 bmin = texelFetch(uBoxes, ivec2(0, i), 0).xyz;
    vec3 bmax = texelFetch(uBoxes, ivec2(1, i), 0).xyz;
    if (GiRayBox(ro, invDir, sgn, bmin, bmax, tMax, t, n)) return true;
  }
  return false;
}

void main() {
  int ray = int(gl_FragCoord.x);
  int slot = int(gl_FragCoord.y);
  vec3 origin = uBatchPos[slot];
  vec3 dir = GiRayDirection(float(ray));

  vec3 sgn = vec3(dir.x >= 0.0 ? 1.0 : -1.0, dir.y >= 0.0 ? 1.0 : -1.0, dir.z >= 0.0 ? 1.0 : -1.0);
  vec3 invDir = 1.0 / (sgn * max(abs(dir), vec3(1e-6)));

  float best = 1.0e6;
  vec3 bestNormal = vec3(0.0, 1.0, 0.0);
  vec3 bestAlbedo = vec3(0.0);
  bool hit = false;

  // 地面：城内是一块台地，这里按平面处理（濠沟/弹坑的误差记在文档里）
  if (dir.y < -1e-4 && origin.y > uGroundY) {
    float t = (uGroundY - origin.y) / dir.y;
    if (t > 0.001 && t < best) {
      best = t; bestNormal = vec3(0.0, 1.0, 0.0); bestAlbedo = uGroundAlbedo; hit = true;
    }
  }

  for (int i = 0; i < ${MAX_BOXES}; i++) {
    if (i >= uBoxCount) break;
    vec3 bmin = texelFetch(uBoxes, ivec2(0, i), 0).xyz;
    vec3 bmax = texelFetch(uBoxes, ivec2(1, i), 0).xyz;
    float t; vec3 n;
    if (GiRayBox(origin, invDir, sgn, bmin, bmax, best, t, n)) {
      best = t; bestNormal = n; bestAlbedo = texelFetch(uBoxes, ivec2(2, i), 0).rgb; hit = true;
    }
  }

  vec3 radiance;
  if (!hit) {
    // 漏空 = 看见天。太阳盘要排除：太阳的直接光在材质里由 DirectionalLight 走，
    // 再让射线撞上盘子就是双份，而且 64 根射线采 0.003 大小的盘必炸方差。
    radiance = SkyRadiance(dir, 0.0);
    best = uMaxDistance;
  } else {
    vec3 hitPos = origin + dir * best + bestNormal * 0.02;
    vec3 irradiance = vec3(0.0);

    float ndl = max(dot(bestNormal, uSunDir), 0.0);
    if (ndl > 0.0) {
      // 阴影射线走同一张 AABB 汤：不依赖主视角那张阴影图的覆盖范围与偏移量
      if (!GiOccluded(hitPos, uSunDir, 90.0)) irradiance += uSunIrradiance * ndl;
    }

    for (int f = 0; f < ${MAX_FIRES}; f++) {
      if (f >= uFireCount) break;
      vec3 toLight = uFirePos[f] - hitPos;
      float d2 = max(dot(toLight, toLight), 0.0001);
      float d = sqrt(d2);
      float nd = max(dot(bestNormal, toLight / d), 0.0);
      if (nd <= 0.0) continue;
      // 与 three 的 getDistanceAttenuation 对齐（decay = 2 + cutoff）
      float atten = 1.0 / max(d2, 0.01);
      float cut = clamp(1.0 - pow(d / max(uFireRange[f], 0.001), 4.0), 0.0, 1.0);
      irradiance += uFireColor[f] * nd * atten * cut * cut;
    }

    // 上一帧的探针体喂回来 = 无限次反弹。体外就退回天空半球的粗估。
    float confidence;
    vec3 bounce = GiSampleIrradiance(hitPos, bestNormal, bestNormal, confidence);
    vec3 skyFallback = SkyRadiance(bestNormal, 0.0) * 3.14159265359;
    irradiance += mix(skyFallback, bounce, confidence);

    radiance = bestAlbedo * irradiance * 0.31830988618;   // ÷π：辐照度 → 出射辐射亮度
    best = min(best, uMaxDistance);
  }

  gl_FragColor = vec4(radiance, best);
}
`;

// ---------------------------------------------------------------------------
// Blend pass（实例化四边形，一次 draw 写完这一批探针的瓦片）
// ---------------------------------------------------------------------------

const GI_TILE_VERT = /* glsl */`
attribute vec3 aTile;          // xy = 瓦片在图集里的列/行，z = 这一批里的槽位
uniform vec2 uAtlasSize;
uniform float uTileSize;       // texels + 2（含边框）
varying vec2 vTexel;
varying float vSlot;
void main() {
  vTexel = position.xy * uTileSize;
  vSlot = aTile.z;
  vec2 pixel = (aTile.xy + position.xy) * uTileSize;
  gl_Position = vec4(pixel / uAtlasSize * 2.0 - 1.0, 0.0, 1.0);
}
`;

/**
 * 瓦片内的第 (x,y) 个像素对应哪个方向。
 *
 * 边框那一圈不是「复制邻居」，而是按八面体的镜像规则**换算出方向再重新积分**：
 * 反正积分本来就要跑，边框自己算一遍比先写内圈再拷一遍边简单，也不会错位。
 */
const GI_TILE_DIR_GLSL = /* glsl */`
vec3 GiTexelDirection(vec2 texel, float texels) {
  vec2 c = floor(texel) - 1.0;                 // 内圈坐标，范围 [-1, texels]
  if (c.x < 0.0) { c.x = 0.0; c.y = texels - 1.0 - c.y; }
  else if (c.x > texels - 1.0) { c.x = texels - 1.0; c.y = texels - 1.0 - c.y; }
  if (c.y < 0.0) { c.y = 0.0; c.x = texels - 1.0 - c.x; }
  else if (c.y > texels - 1.0) { c.y = texels - 1.0; c.x = texels - 1.0 - c.x; }
  vec2 oct = (c + 0.5) / texels * 2.0 - 1.0;
  return GiOctDecode(oct);
}
`;

const GI_BLEND_IRRADIANCE_FRAG = GI_OCT_GLSL + GI_RAYDIR_GLSL + GI_TILE_DIR_GLSL + /* glsl */`
uniform sampler2D uRays;
uniform sampler2D uPrevious;
uniform float uTexels;
uniform float uHysteresis;
uniform vec2 uAtlasSize;
varying vec2 vTexel;
varying float vSlot;
void main() {
  vec3 n = GiTexelDirection(vTexel, uTexels);
  vec3 sum = vec3(0.0);
  float weight = 0.0;
  int slot = int(vSlot);
  int count = int(uGiRayCount);
  for (int r = 0; r < 128; r++) {
    if (r >= count) break;
    vec4 ray = texelFetch(uRays, ivec2(r, slot), 0);
    float w = max(dot(n, GiRayDirection(float(r))), 0.0);
    sum += ray.rgb * w;
    weight += w;
  }
  vec3 result = weight > 1e-6 ? sum / weight : vec3(0.0);
  vec3 previous = texture2D(uPrevious, gl_FragCoord.xy / uAtlasSize).rgb;
  gl_FragColor = vec4(mix(result, previous, uHysteresis), 1.0);
}
`;

const GI_BLEND_DISTANCE_FRAG = GI_OCT_GLSL + GI_RAYDIR_GLSL + GI_TILE_DIR_GLSL + /* glsl */`
uniform sampler2D uRays;
uniform sampler2D uPrevious;
uniform float uTexels;
uniform float uHysteresis;
uniform float uSharpness;
uniform vec2 uAtlasSize;
varying vec2 vTexel;
varying float vSlot;
void main() {
  vec3 n = GiTexelDirection(vTexel, uTexels);
  vec2 sum = vec2(0.0);
  float weight = 0.0;
  int slot = int(vSlot);
  int count = int(uGiRayCount);
  for (int r = 0; r < 128; r++) {
    if (r >= count) break;
    // 距离用**尖锐**的余弦幂：一阶矩要的是「这个方向上最近的那面墙」，
    // 用漫反射那种宽瓣会把远处的天也平均进来，切比雪夫直接失效。
    float w = pow(max(dot(n, GiRayDirection(float(r))), 0.0), uSharpness);
    float d = texelFetch(uRays, ivec2(r, slot), 0).a;
    sum += vec2(d, d * d) * w;
    weight += w;
  }
  vec2 result = weight > 1e-6 ? sum / weight : vec2(0.0);
  vec2 previous = texture2D(uPrevious, gl_FragCoord.xy / uAtlasSize).rg;
  gl_FragColor = vec4(mix(result, previous, uHysteresis), 0.0, 1.0);
}
`;

const GI_COPY_FRAG = /* glsl */`
uniform sampler2D uSource;
varying vec2 vUv;
void main() { gl_FragColor = texture2D(uSource, vUv); }
`;

const GI_COPY_VERT = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

// ---------------------------------------------------------------------------

function MakeTileGeometry(maxInstances) {
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(
    [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0], 3));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  const tiles = new THREE.InstancedBufferAttribute(new Float32Array(maxInstances * 3), 3);
  tiles.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("aTile", tiles);
  geometry.instanceCount = 0;
  return geometry;
}

const QUAD_GEOMETRY = new THREE.PlaneGeometry(2, 2);
const QUAD_CAMERA = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

/** 材质注入用的那一包 uniform。ProbeVolume 与 MaterialLibrary 共用同一批对象。 */
export function MakeGiUniforms() {
  const blank = new THREE.DataTexture(new Float32Array([0, 0, 0, 0]), 1, 1, THREE.RGBAFormat, THREE.FloatType);
  blank.needsUpdate = true;
  return {
    irradiance: { value: blank },
    distance: { value: blank },
    offset: { value: blank },
    origin: { value: new THREE.Vector3() },
    counts: { value: new THREE.Vector3(1, 1, 1) },
    baseCell: { value: new THREE.Vector3() },
    spacing: { value: 4 },
    irrTexels: { value: 8 },
    distTexels: { value: 16 },
    irrAtlas: { value: new THREE.Vector2(1, 1) },
    distAtlas: { value: new THREE.Vector2(1, 1) },
    intensity: { value: 1 },
    normalBias: { value: 0.4 },
    specularOcclusion: { value: 0.7 },
    enabled: { value: 0 },
  };
}

/** 把那一包 uniform 接到某个 shader 的 uniforms 上（材质注入与调试小球都走这里）。 */
export function BindGiUniforms(target, gi) {
  target.uGiIrradiance = gi.irradiance;
  target.uGiDistance = gi.distance;
  target.uGiOffset = gi.offset;
  target.uGiOrigin = gi.origin;
  target.uGiCounts = gi.counts;
  target.uGiBaseCell = gi.baseCell;
  target.uGiSpacing = gi.spacing;
  target.uGiIrrTexels = gi.irrTexels;
  target.uGiDistTexels = gi.distTexels;
  target.uGiIrrAtlas = gi.irrAtlas;
  target.uGiDistAtlas = gi.distAtlas;
  target.uGiIntensity = gi.intensity;
  target.uGiNormalBias = gi.normalBias;
  target.uGiSpecularOcclusion = gi.specularOcclusion;
  target.uGiEnabled = gi.enabled;
  return target;
}

export class ProbeVolume {
  /**
   * @param {THREE.WebGLRenderer} renderer
   * @param {object} options
   *   quality      画质档（GI_QUALITY 的键）
   *   skyUniforms  Script_Sky 那一批 uniform 对象，直接复用（同一片天，不许各抄一份）
   *   uniforms     MakeGiUniforms() 的结果；材质库拿的是同一个对象
   */
  constructor(renderer, { quality = "high", skyUniforms = null, uniforms = null } = {}) {
    const config = GI_QUALITY[quality] ?? GI_QUALITY.high;
    this.renderer = renderer;
    this.config = config;
    this.uniforms = uniforms || MakeGiUniforms();
    this.enabled = true;
    this.placed = false;      // 体积已经落位（Scroll 至少跑过一次）
    this.warmed = 0;          // 建关以来累计更新过多少个探针
    this.blend = 0;           // 0→1 的淡入：图集没收敛之前不许接管画面
    this.frameSeed = 0;

    const [cx, cy, cz] = config.counts;
    this.counts = new THREE.Vector3(cx, cy, cz);
    this.probeCount = cx * cy * cz;
    this.spacing = config.spacing;
    this.rays = config.rays;
    this.batchSize = Math.min(config.batch, MAX_BATCH);

    // --- 图集 ---
    const irrTile = config.irrTexels + 2;
    const distTile = config.distTexels + 2;
    const rows = cy * cz;
    this.irrAtlasSize = new THREE.Vector2(cx * irrTile, rows * irrTile);
    this.distAtlasSize = new THREE.Vector2(cx * distTile, rows * distTile);
    this.irradiance = [this.MakeAtlas(this.irrAtlasSize), this.MakeAtlas(this.irrAtlasSize)];
    this.distanceMoments = [this.MakeAtlas(this.distAtlasSize), this.MakeAtlas(this.distAtlasSize)];
    this.pingPong = 0;

    // --- 射线靶 ---
    this.rayTarget = new THREE.WebGLRenderTarget(this.rays, this.batchSize, {
      type: THREE.HalfFloatType, format: THREE.RGBAFormat,
      minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
      depthBuffer: false, stencilBuffer: false, generateMipmaps: false,
    });
    this.rayTarget.texture.colorSpace = THREE.NoColorSpace;

    // --- 每探针的重定位偏移 + 有效位 ---
    this.offsetData = new Float32Array(this.probeCount * 4);
    this.offsetTexture = new THREE.DataTexture(this.offsetData, cx, rows, THREE.RGBAFormat, THREE.FloatType);
    this.offsetTexture.minFilter = THREE.NearestFilter;
    this.offsetTexture.magFilter = THREE.NearestFilter;
    this.offsetTexture.needsUpdate = true;

    // --- 代理盒 ---
    this.boxData = new Float32Array(MAX_BOXES * 3 * 4);
    this.boxTexture = new THREE.DataTexture(this.boxData, 3, MAX_BOXES, THREE.RGBAFormat, THREE.FloatType);
    this.boxTexture.minFilter = THREE.NearestFilter;
    this.boxTexture.magFilter = THREE.NearestFilter;
    this.boxTexture.needsUpdate = true;
    this.boxCount = 0;

    // --- CPU 侧的探针台账 ---
    this.cellOf = new Int32Array(this.probeCount * 3).fill(0x7fffffff);
    this.age = new Int32Array(this.probeCount);
    this.dirty = [];                 // 刚滚进来的，插队先算
    this.cursor = 0;
    this.originCell = new THREE.Vector3(0, 0, 0);
    this.origin = new THREE.Vector3();
    this.groundY = 0;
    this.world = null;

    this.BuildPasses(skyUniforms);
    this.ClearAtlases();
    this.SyncUniforms();
  }

  /**
   * 图集刚建出来内容是未定义的（WebGL 不保证清零）。不先清一遍的话，
   * 还没轮到的探针会拿着一片随机数当辐照度，画面上就是一堆彩色的斑。
   */
  ClearAtlases() {
    const renderer = this.renderer;
    if (!renderer) return;
    const previousTarget = renderer.getRenderTarget();
    const previousColor = new THREE.Color();
    renderer.getClearColor(previousColor);
    const previousAlpha = renderer.getClearAlpha();
    renderer.setClearColor(0x000000, 1);
    for (const target of [this.irradiance[0], this.irradiance[1],
      this.distanceMoments[0], this.distanceMoments[1], this.rayTarget]) {
      renderer.setRenderTarget(target);
      renderer.clear(true, false, false);
    }
    renderer.setClearColor(previousColor, previousAlpha);
    renderer.setRenderTarget(previousTarget);
  }

  /**
   * 跟着天光预设走。
   * envIntensity 是美术为这一关定的「天有多强」（SKY_PRESETS 里每一档都调过），
   * 探针体接管漫反射间接光之后，这个旋钮必须继续生效，否则各关的明暗关系全乱。
   */
  ApplyPreset(preset, gain = 1) {
    this.uniforms.intensity.value = (preset && preset.envIntensity ? preset.envIntensity : 1) * gain;
  }

  MakeAtlas(size) {
    const target = new THREE.WebGLRenderTarget(size.x, size.y, {
      type: THREE.HalfFloatType, format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
      depthBuffer: false, stencilBuffer: false, generateMipmaps: false,
      wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping,
    });
    target.texture.colorSpace = THREE.NoColorSpace;
    return target;
  }

  BuildPasses(skyUniforms) {
    const rayRotation = { value: new THREE.Matrix3() };
    const rayCount = { value: this.rays };
    this.rayRotation = rayRotation;

    const traceUniforms = BindGiUniforms({
      uBoxes: { value: this.boxTexture },
      uBoxCount: { value: 0 },
      uBatchPos: { value: Array.from({ length: MAX_BATCH }, () => new THREE.Vector3()) },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunIrradiance: { value: new THREE.Vector3() },
      uFirePos: { value: Array.from({ length: MAX_FIRES }, () => new THREE.Vector3()) },
      uFireColor: { value: Array.from({ length: MAX_FIRES }, () => new THREE.Vector3()) },
      uFireRange: { value: new Array(MAX_FIRES).fill(1) },
      uFireCount: { value: 0 },
      uGroundY: { value: 0 },
      uGroundAlbedo: { value: new THREE.Vector3(...GI_ALBEDO.ground) },
      uMaxDistance: { value: this.spacing * 1.5 },
      uGiRayRotation: rayRotation,
      uGiRayCount: rayCount,
    }, this.uniforms);
    // 天空 uniform 直接借用 SkyDome 的那一批对象：换预设时两边同时变
    const sky = skyUniforms || {};
    for (const key of Object.keys(sky)) traceUniforms[key] = sky[key];
    this.traceUniforms = traceUniforms;

    this.traceMaterial = new THREE.ShaderMaterial({
      uniforms: traceUniforms,
      vertexShader: GI_COPY_VERT,
      fragmentShader: GI_TRACE_FRAG,
      depthTest: false, depthWrite: false,
    });
    this.traceScene = MakeQuadScene(this.traceMaterial);

    this.copyMaterial = new THREE.ShaderMaterial({
      uniforms: { uSource: { value: null } },
      vertexShader: GI_COPY_VERT,
      fragmentShader: GI_COPY_FRAG,
      depthTest: false, depthWrite: false,
    });
    this.copyScene = MakeQuadScene(this.copyMaterial);

    this.irrGeometry = MakeTileGeometry(MAX_BATCH);
    this.irrMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uRays: { value: this.rayTarget.texture },
        uPrevious: { value: null },
        uTexels: { value: this.config.irrTexels },
        uTileSize: { value: this.config.irrTexels + 2 },
        uHysteresis: { value: 0.93 },
        uAtlasSize: { value: this.irrAtlasSize },
        uGiRayRotation: rayRotation,
        uGiRayCount: rayCount,
      },
      vertexShader: GI_TILE_VERT,
      fragmentShader: GI_BLEND_IRRADIANCE_FRAG,
      depthTest: false, depthWrite: false,
    });
    this.irrScene = MakeTileScene(this.irrGeometry, this.irrMaterial);

    this.distGeometry = MakeTileGeometry(MAX_BATCH);
    this.distMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uRays: { value: this.rayTarget.texture },
        uPrevious: { value: null },
        uTexels: { value: this.config.distTexels },
        uTileSize: { value: this.config.distTexels + 2 },
        uHysteresis: { value: 0.90 },
        uSharpness: { value: 18 },
        uAtlasSize: { value: this.distAtlasSize },
        uGiRayRotation: rayRotation,
        uGiRayCount: rayCount,
      },
      vertexShader: GI_TILE_VERT,
      fragmentShader: GI_BLEND_DISTANCE_FRAG,
      depthTest: false, depthWrite: false,
    });
    this.distScene = MakeTileScene(this.distGeometry, this.distMaterial);
  }

  SyncUniforms() {
    const u = this.uniforms;
    u.irradiance.value = this.irradiance[this.pingPong].texture;
    u.distance.value = this.distanceMoments[this.pingPong].texture;
    u.offset.value = this.offsetTexture;
    u.origin.value.copy(this.origin);
    u.counts.value.copy(this.counts);
    u.baseCell.value.set(
      ((this.originCell.x % this.counts.x) + this.counts.x) % this.counts.x,
      ((this.originCell.y % this.counts.y) + this.counts.y) % this.counts.y,
      ((this.originCell.z % this.counts.z) + this.counts.z) % this.counts.z);
    u.spacing.value = this.spacing;
    u.irrTexels.value = this.config.irrTexels;
    u.distTexels.value = this.config.distTexels;
    u.irrAtlas.value.copy(this.irrAtlasSize);
    u.distAtlas.value.copy(this.distAtlasSize);
    u.enabled.value = this.enabled ? this.blend : 0;
  }

  /**
   * 换关时把新一关的碰撞盒表接过来。
   * @param {object} world { colliders, GroundHeight, NearbyColliders }
   */
  SetWorld(world) {
    this.world = world;
    this.cellOf.fill(0x7fffffff);
    this.age.fill(0);
    this.dirty.length = 0;
    this.cursor = 0;
    this.placed = false;
    this.warmed = 0;
    this.blend = 0;
    this.SyncUniforms();
  }

  /**
   * 虚拟地面的高度：体积脚印内**最低**的地面，不是体积中心那一点。
   *
   * 平面放低了几乎没有代价 —— 朗伯地面的出射辐射亮度与距离无关，反弹光只是
   * 「从更低处弹上来」；平面放高了却是结构性翻车：地形凹下去超过一层格距时，
   * 整层探针落到平面之下，朝下的射线打不到平面（GI_TRACE_FRAG 要求
   * origin.y > uGroundY），穿过「不存在的地面」直接看到天 —— 凹地里的地面
   * 整片被天光灌成银白，边界正好画在地形跌破平面的等值线上（界河河滩实拍）。
   * 城内台地本来就平，最低点 ≈ 中心点，行为不变。
   */
  SampleGroundY(fallback = 0) {
    const world = this.world;
    if (!world || typeof world.GroundHeight !== "function") return fallback;
    const s = this.spacing;
    let min = Infinity;
    for (let gx = 0; gx <= this.counts.x; gx += 1) {
      for (let gz = 0; gz <= this.counts.z; gz += 1) {
        const h = world.GroundHeight(this.origin.x + gx * s, this.origin.z + gz * s);
        if (h < min) min = h;
      }
    }
    return Number.isFinite(min) ? min : fallback;
  }

  /** 探针在盒子里就往外挤；挤不出去标记作废。返回 [ox, oy, oz, active]。 */
  RelocateProbe(x, y, z, boxes) {
    const pad = 0.2;
    const Inside = (px, py, pz) => {
      for (let i = 0; i < boxes.length; i += 1) {
        const b = boxes[i];
        if (px > b.min[0] - pad && px < b.max[0] + pad
          && py > b.min[1] - pad && py < b.max[1] + pad
          && pz > b.min[2] - pad && pz < b.max[2] + pad) return true;
      }
      return false;
    };
    if (!Inside(x, y, z)) return [0, 0, 0, 1];
    const step = this.spacing * 0.42;
    // 先试六个正方向，再试斜的。挤出去的距离压在半格以内 ——
    // 挤太远的话探针跑进隔壁房间，比留在墙里还糟
    const dirs = [
      [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0], [0, -1, 0],
      [1, 0, 1], [1, 0, -1], [-1, 0, 1], [-1, 0, -1],
      [0, 1, 1], [0, 1, -1], [1, 1, 0], [-1, 1, 0],
    ];
    for (const d of dirs) {
      const len = Math.hypot(d[0], d[1], d[2]);
      const ox = (d[0] / len) * step, oy = (d[1] / len) * step, oz = (d[2] / len) * step;
      if (!Inside(x + ox, y + oy, z + oz)) return [ox, oy, oz, 1];
    }
    return [0, 0, 0, 0];
  }

  /**
   * 从世界里挑出这一体积附近的盒子，写进 shader 用的数据贴图。
   *
   * 不走 TengxianField.NearbyColliders：它内部是 `out.includes(b)` 去重，
   * 半径开到探针体这么大（50 m+）时退化成 O(n²)，每次滚动都会卡一下。
   * 这里是线性扫一遍再按到体心的距离取前 MAX_BOXES 个 —— 超额时保留近处的，
   * 远处那些本来对间接光就没什么贡献。
   */
  RebuildBoxes(center) {
    const world = this.world;
    if (!world) { this.boxCount = 0; return []; }
    const halfX = this.counts.x * this.spacing * 0.5;
    const halfY = this.counts.y * this.spacing * 0.5;
    const halfZ = this.counts.z * this.spacing * 0.5;
    // 多留 24 m：阴影射线要打得着体积外面的墙，不然屋顶挡不住太阳
    const margin = 24;
    let list = world.colliders;
    if ((!list || list.length === 0) && typeof world.NearbyColliders === "function") {
      list = world.NearbyColliders(center.x, center.z, Math.max(halfX, halfZ) + margin);
    }
    if (!list) { this.boxCount = 0; return []; }

    const minX = center.x - halfX - margin, maxX = center.x + halfX + margin;
    const minZ = center.z - halfZ - margin, maxZ = center.z + halfZ + margin;
    const minY = center.y - halfY - margin, maxY = center.y + halfY + margin;
    const picked = [];
    for (let i = 0; i < list.length; i += 1) {
      const b = list[i];
      if (b.max[0] < minX || b.min[0] > maxX) continue;
      if (b.max[2] < minZ || b.min[2] > maxZ) continue;
      if (b.max[1] < minY || b.min[1] > maxY) continue;
      picked.push(b);
    }
    if (picked.length > MAX_BOXES) {
      picked.sort((a, b) => BoxDistance2(a, center) - BoxDistance2(b, center));
      picked.length = MAX_BOXES;
    }

    const data = this.boxData;
    for (let i = 0; i < picked.length; i += 1) {
      const b = picked[i];
      const albedo = GI_ALBEDO[b.tag] || GI_ALBEDO.wall;
      const o = i * 12;
      data[o] = b.min[0]; data[o + 1] = b.min[1]; data[o + 2] = b.min[2]; data[o + 3] = 0;
      data[o + 4] = b.max[0]; data[o + 5] = b.max[1]; data[o + 6] = b.max[2]; data[o + 7] = 0;
      data[o + 8] = albedo[0]; data[o + 9] = albedo[1]; data[o + 10] = albedo[2]; data[o + 11] = 0;
    }
    this.boxCount = picked.length;
    this.boxTexture.needsUpdate = true;
    return picked;
  }

  /** 体积跟着玩家滚动。只有真滚进来的那些格子才作废重算。 */
  Scroll(focus) {
    const s = this.spacing;
    const cellX = Math.floor(focus.x / s) - Math.floor(this.counts.x / 2);
    const cellY = Math.floor((focus.y - s * 1.5) / s);
    const cellZ = Math.floor(focus.z / s) - Math.floor(this.counts.z / 2);
    if (this.placed && cellX === this.originCell.x && cellY === this.originCell.y
      && cellZ === this.originCell.z) return false;

    this.originCell.set(cellX, cellY, cellZ);
    this.origin.set(cellX * s, cellY * s, cellZ * s);
    this.groundY = this.SampleGroundY(this.groundY);
    const boxes = this.RebuildBoxes(new THREE.Vector3(
      this.origin.x + this.counts.x * s * 0.5,
      this.origin.y + this.counts.y * s * 0.5,
      this.origin.z + this.counts.z * s * 0.5));

    const cx = this.counts.x, cy = this.counts.y, cz = this.counts.z;
    const dirty = this.dirty;
    dirty.length = 0;
    for (let gy = 0; gy < cy; gy += 1) {
      for (let gz = 0; gz < cz; gz += 1) {
        for (let gx = 0; gx < cx; gx += 1) {
          const wx = cellX + gx, wy = cellY + gy, wz = cellZ + gz;
          const sx = ((wx % cx) + cx) % cx, sy = ((wy % cy) + cy) % cy, sz = ((wz % cz) + cz) % cz;
          const index = sx + cx * (sz + cz * sy);
          const c = index * 3;
          if (this.cellOf[c] === wx && this.cellOf[c + 1] === wy && this.cellOf[c + 2] === wz) continue;
          this.cellOf[c] = wx; this.cellOf[c + 1] = wy; this.cellOf[c + 2] = wz;
          this.age[index] = 0;
          const meta = this.RelocateProbe(wx * s, wy * s, wz * s, boxes);
          const o = index * 4;
          this.offsetData[o] = meta[0];
          this.offsetData[o + 1] = meta[1];
          this.offsetData[o + 2] = meta[2];
          this.offsetData[o + 3] = meta[3];
          if (meta[3] > 0) dirty.push(index);
        }
      }
    }
    this.offsetTexture.needsUpdate = true;
    this.placed = true;
    return true;
  }

  /** 排这一帧要更新的探针：先补刚滚进来的，再轮转。 */
  PickBatch() {
    const batch = [];
    while (batch.length < this.batchSize && this.dirty.length > 0) {
      batch.push(this.dirty.shift());
    }
    let guard = 0;
    while (batch.length < this.batchSize && guard < this.probeCount) {
      const index = this.cursor;
      this.cursor = (this.cursor + 1) % this.probeCount;
      guard += 1;
      if (this.offsetData[index * 4 + 3] > 0) batch.push(index);
    }
    return batch;
  }

  /**
   * 一帧一次。
   * @param {number} dt 秒
   * @param {THREE.Vector3} focus 玩家/镜头位置
   * @param {object} lights LightRig
   */
  Update(dt, focus, lights) {
    if (!this.enabled || !this.world) return;
    this.Scroll(focus);
    const batch = this.PickBatch();
    if (batch.length === 0) return;

    const renderer = this.renderer;
    const previousTarget = renderer.getRenderTarget();
    const previousAutoClear = renderer.autoClear;
    renderer.autoClear = false;

    // 每帧换一组射线方向：定死的方向集会在墙角结成一圈规律的暗纹
    this.frameSeed += 1;
    const seed = this.frameSeed;
    _euler.set(seed * 1.10715, seed * 0.61548, seed * 2.39996);
    _matrix.makeRotationFromEuler(_euler);
    this.rayRotation.value.setFromMatrix4(_matrix);

    const s = this.spacing;
    const cx = this.counts.x, cy = this.counts.y, cz = this.counts.z;
    const tu = this.traceUniforms;
    for (let i = 0; i < batch.length; i += 1) {
      const index = batch[i];
      const sx = index % cx;
      const sz = Math.floor(index / cx) % cz;
      const sy = Math.floor(index / (cx * cz));
      const gx = (((sx - this.originCell.x) % cx) + cx) % cx;
      const gy = (((sy - this.originCell.y) % cy) + cy) % cy;
      const gz = (((sz - this.originCell.z) % cz) + cz) % cz;
      const o = index * 4;
      tu.uBatchPos.value[i].set(
        this.origin.x + gx * s + this.offsetData[o],
        this.origin.y + gy * s + this.offsetData[o + 1],
        this.origin.z + gz * s + this.offsetData[o + 2]);
    }

    tu.uBoxCount.value = this.boxCount;
    tu.uGroundY.value = this.groundY;
    tu.uMaxDistance.value = s * 1.5;
    if (lights) {
      tu.uSunDir.value.copy(lights.sunDirection).normalize();
      tu.uSunIrradiance.value.set(
        lights.sun.color.r * lights.sun.intensity,
        lights.sun.color.g * lights.sun.intensity,
        lights.sun.color.b * lights.sun.intensity);
      let fires = 0;
      for (let i = 0; i < lights.fireLights.length && fires < MAX_FIRES; i += 1) {
        const light = lights.fireLights[i];
        if (!light.visible || light.intensity <= 0) continue;
        tu.uFirePos.value[fires].copy(light.position);
        tu.uFireColor.value[fires].set(
          light.color.r * light.intensity,
          light.color.g * light.intensity,
          light.color.b * light.intensity);
        tu.uFireRange.value[fires] = light.distance || 20;
        fires += 1;
      }
      tu.uFireCount.value = fires;
    }

    // [1] 追踪
    renderer.setRenderTarget(this.rayTarget);
    renderer.render(this.traceScene, QUAD_CAMERA);

    // [2][3] 辐照度：整张搬过去，再把这一批瓦片写上
    const src = this.pingPong, dst = 1 - this.pingPong;
    this.copyMaterial.uniforms.uSource.value = this.irradiance[src].texture;
    renderer.setRenderTarget(this.irradiance[dst]);
    renderer.render(this.copyScene, QUAD_CAMERA);
    this.FillTiles(this.irrGeometry, batch);
    this.irrMaterial.uniforms.uPrevious.value = this.irradiance[src].texture;
    this.SetHysteresis(this.irrMaterial, batch, 0.93);
    renderer.render(this.irrScene, QUAD_CAMERA);

    // [4][5] 距离矩
    this.copyMaterial.uniforms.uSource.value = this.distanceMoments[src].texture;
    renderer.setRenderTarget(this.distanceMoments[dst]);
    renderer.render(this.copyScene, QUAD_CAMERA);
    this.FillTiles(this.distGeometry, batch);
    this.distMaterial.uniforms.uPrevious.value = this.distanceMoments[src].texture;
    this.SetHysteresis(this.distMaterial, batch, 0.90);
    renderer.render(this.distScene, QUAD_CAMERA);

    this.pingPong = dst;
    for (let i = 0; i < batch.length; i += 1) {
      this.age[batch[i]] = Math.min(this.age[batch[i]] + 1, 255);
    }

    // 整场扫满一遍之前不许接管画面：半收敛的图集比原来的天空 IBL 还难看。
    // 扫满之后用半秒淡进来，免得「啪」地跳一下亮度。
    this.warmed += batch.length;
    if (this.warmed >= this.probeCount) {
      this.blend = Math.min(1, this.blend + Math.max(dt, 1 / 120) * 2.0);
    }

    renderer.setRenderTarget(previousTarget);
    renderer.autoClear = previousAutoClear;
    this.SyncUniforms();
  }

  /**
   * 新探针不能按迟滞混：它上一帧的值是**别的地方**的光，混进来就是一坨拖影。
   * 这一批里只要有新生探针，就整批降迟滞 —— 批次很小（≤16），代价只是多噪一帧。
   */
  SetHysteresis(material, batch, target) {
    let fresh = false;
    for (let i = 0; i < batch.length; i += 1) {
      if (this.age[batch[i]] < 2) { fresh = true; break; }
    }
    material.uniforms.uHysteresis.value = fresh ? 0.0 : target;
  }

  FillTiles(geometry, batch) {
    const attribute = geometry.getAttribute("aTile");
    const cx = this.counts.x, cz = this.counts.z;
    for (let i = 0; i < batch.length; i += 1) {
      const index = batch[i];
      const sx = index % cx;
      const sz = Math.floor(index / cx) % cz;
      const sy = Math.floor(index / (cx * cz));
      attribute.array[i * 3] = sx;
      attribute.array[i * 3 + 1] = sz + cz * sy;
      attribute.array[i * 3 + 2] = i;
    }
    attribute.needsUpdate = true;
    geometry.instanceCount = batch.length;
  }

  Dispose() {
    for (const t of this.irradiance) t.dispose();
    for (const t of this.distanceMoments) t.dispose();
    this.rayTarget.dispose();
    this.offsetTexture.dispose();
    this.boxTexture.dispose();
    this.traceMaterial.dispose();
    this.copyMaterial.dispose();
    this.irrMaterial.dispose();
    this.distMaterial.dispose();
    this.irrGeometry.dispose();
    this.distGeometry.dispose();
  }
}

const _euler = new THREE.Euler();
const _matrix = new THREE.Matrix4();

/** 盒子到某点的平方距离（盒外取到面的距离，盒内取 0）。 */
function BoxDistance2(box, point) {
  const dx = Math.max(box.min[0] - point.x, 0, point.x - box.max[0]);
  const dy = Math.max(box.min[1] - point.y, 0, point.y - box.max[1]);
  const dz = Math.max(box.min[2] - point.z, 0, point.z - box.max[2]);
  return dx * dx + dy * dy + dz * dz;
}

function MakeQuadScene(material) {
  const mesh = new THREE.Mesh(QUAD_GEOMETRY, material);
  mesh.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(mesh);
  return scene;
}

function MakeTileScene(geometry, material) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(mesh);
  return scene;
}

/**
 * 调试用：把每个探针画成一颗小球，球面直接取图集。
 * 「GI 到底有没有在跑」这种问题看一眼就有答案，比读数值快得多。
 * 紫色 = 该探针埋在几何体里、已作废。
 */
export function MakeProbeDebugMesh(volume) {
  const sphere = new THREE.SphereGeometry(0.13, 12, 8);
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute("position", sphere.getAttribute("position"));
  geometry.setAttribute("normal", sphere.getAttribute("normal"));
  geometry.setIndex(sphere.getIndex());
  const ids = new Float32Array(volume.probeCount);
  for (let i = 0; i < volume.probeCount; i += 1) ids[i] = i;
  geometry.setAttribute("aProbe", new THREE.InstancedBufferAttribute(ids, 1));
  geometry.instanceCount = volume.probeCount;

  const material = new THREE.ShaderMaterial({
    uniforms: BindGiUniforms({}, volume.uniforms),
    vertexShader: /* glsl */`
      attribute float aProbe;
      uniform vec3 uGiOrigin;
      uniform vec3 uGiCounts;
      uniform vec3 uGiBaseCell;
      uniform float uGiSpacing;
      uniform sampler2D uGiOffset;
      varying vec3 vNormalW;
      varying vec3 vStorage;
      varying float vActive;
      void main() {
        float cx = uGiCounts.x, cz = uGiCounts.z;
        float sx = mod(aProbe, cx);
        float sz = mod(floor(aProbe / cx), cz);
        float sy = floor(aProbe / (cx * cz));
        vec3 storage = vec3(sx, sy, sz);
        vec3 grid = mod(storage - uGiBaseCell, uGiCounts);
        vec2 t = vec2(sx, sz + cz * sy) + 0.5;
        vec4 meta = texture2D(uGiOffset, t / vec2(cx, uGiCounts.y * cz));
        vec3 center = uGiOrigin + grid * uGiSpacing + meta.xyz;
        vStorage = storage;
        vActive = meta.w;
        vNormalW = normalize(normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(center + position, 1.0);
      }`,
    fragmentShader: GI_SAMPLE_GLSL + /* glsl */`
      varying vec3 vNormalW;
      varying vec3 vStorage;
      varying float vActive;
      void main() {
        if (vActive < 0.5) { gl_FragColor = vec4(0.5, 0.0, 0.5, 1.0); return; }
        vec3 c = texture2D(uGiIrradiance,
          GiAtlasUv(vStorage, vNormalW, uGiIrrTexels, uGiIrrAtlas)).rgb;
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  material.allowOverride = false;
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.name = "GiProbeDebug";
  mesh.userData.skipNormalDepth = true;
  return mesh;
}
