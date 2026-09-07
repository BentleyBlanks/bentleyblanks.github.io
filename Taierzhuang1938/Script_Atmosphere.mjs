// 《台儿庄：血战滕县》物理大气：Hillaire 2020 的四张 LUT。
//
// 参考实现：Sébastien Hillaire,《A Scalable and Production Ready Sky and
// Atmosphere Rendering Technique》(EGSR 2020)，也就是 UE4.26+ 的 SkyAtmosphere；
// 介质参数与 LUT 参数化沿用 Bruneton & Neyret 2008 / Bruneton 2017 的标准值。
// 本文件只做「LUT 的生成与采样」，天穹长什么样、预设怎么调在 Script_Sky.mjs。
//
// ## 四张表（尺寸按画质档缩，见 ATMOSPHERE_TIERS）
//   1) 透过率 LUT     256×64   参数 (r, μ)。**只在预设切换时算一次。**
//   2) 多次散射 LUT   32×32    参数 (cosθ_sun, r)。同上，只在切换时算。
//   3) 天空视图 LUT   192×108  参数 (相对太阳的方位, 天顶角，地平线附近加密)。
//                              相机高度一变就要重算 —— 每帧算，两万像素而已。
//   4) 大气透视 LUT   32×32×32 froxel，打成 1024×32 的 2D 图集（切片沿 x 平铺）。
//                              视锥对齐，每帧重算。
//
// ## 为什么单位是 km
// 大气厚度 100 km、瑞利标高 8 km，而游戏世界是米。全部换算成 km 之后
// 系数表可以直接抄文献（每 km 的散射截面），不必自己乘 1e-3 到处飘。
// 世界坐标进来时统一 `ATMO_BOTTOM + siteAltitudeKm + worldY * 0.001`。
//
// ## 战场霾（haze）这一层
// 1938 年三月的滕县打了半个月，天上是有烟的；而本作各时段预设里那套解析雾
// （fog.density / fog.falloff）本来就是「贴地气溶胶」的美术写法。物理上它就是
// **一层加浓的 Mie**，所以大气透视 LUT 里直接把它当第三种介质积分：
// 消光按 fog.density（扣掉干净空气那一份，两者相加恒等于今天的值），
// 标高按 fog.falloff。这样 LUT 出来的散射色是物理的（真前向散射、真色相），
// 而**能见度与今天逐米相同** —— 用户「先别动雾」那条定论不动。
// 天空视图 LUT 里**不含**这一层（天穹的烟尘带仍是 Script_Sky 的美术层，
// 两处都放就是双份灰）。

import * as THREE from "three";
import { MakeFullscreenMaterial, MakeRenderTarget, QUAD_GEOMETRY, QUAD_CAMERA } from "./Script_PostCommon.mjs";

// ---------------------------------------------------------------------------
// 介质参数（每 km；Bruneton/Hillaire 的地球标准值）
// ---------------------------------------------------------------------------

/**
 * 标准地球大气。倍率由预设的 `atmosphere` 字段乘上去，基准值不动。
 *   rayleighScattering  瑞利散射系数（海平面，1/km）。RGB 比 ≈ λ^-4。
 *   rayleighHeight      瑞利标高 8 km
 *   mieScattering       Mie 散射 3.996e-3，mieExtinction 4.40e-3（吸收 ≈ 4e-4）
 *   mieHeight           Mie 标高 1.2 km
 *   mieG                Henyey-Greenstein 各向异性 0.8
 *   ozoneAbsorption     臭氧吸收峰值（1/km），帐篷形分布 10—40 km、峰在 25 km
 *   groundAlbedo        地面反照 0.3（多次散射 LUT 与天空视图 LUT 的地面项都要它）
 */
export const ATMOSPHERE_EARTH = {
  bottomRadiusKm: 6360.0,
  topRadiusKm: 6460.0,
  rayleighScattering: [5.802e-3, 13.558e-3, 33.100e-3],
  rayleighHeightKm: 8.0,
  mieScattering: 3.996e-3,
  mieExtinction: 4.400e-3,
  mieHeightKm: 1.2,
  mieG: 0.8,
  ozoneAbsorption: [0.650e-3, 1.881e-3, 0.085e-3],
  ozoneCenterKm: 25.0,
  ozoneWidthKm: 15.0,
  groundAlbedo: 0.3,
  /** 滕县城关海拔约 60 m（界河—荆河河谷）。相机高度 = 这个 + 世界 Y。 */
  siteAltitudeKm: 0.06,
};

/**
 * 每档的 LUT 规格。透过率与多次散射只在换预设时算一次，所以低档也给得起
 * 中等分辨率；每帧的开销全在天空视图与大气透视两张上，那两张按档缩。
 */
export const ATMOSPHERE_TIERS = {
  low: { trans: [128, 32], transSteps: 32, multi: [16, 16], multiDirs: 4, multiSteps: 12,
    skyView: [96, 54], skySteps: 14, ap: [16, 16, 16], apSteps: 6 },
  medium: { trans: [256, 64], transSteps: 40, multi: [32, 32], multiDirs: 6, multiSteps: 16,
    skyView: [128, 72], skySteps: 22, ap: [24, 24, 24], apSteps: 8 },
  high: { trans: [256, 64], transSteps: 40, multi: [32, 32], multiDirs: 8, multiSteps: 20,
    skyView: [192, 108], skySteps: 32, ap: [32, 32, 32], apSteps: 10 },
  ultra: { trans: [256, 64], transSteps: 48, multi: [32, 32], multiDirs: 8, multiSteps: 24,
    skyView: [192, 108], skySteps: 40, ap: [32, 32, 32], apSteps: 14 },
};

/** 预设 `atmosphere` 字段的缺省值（每一项都是「乘在标准地球上的倍率」）。 */
export const ATMOSPHERE_PRESET_DEFAULTS = {
  /** Mie 密度倍率 —— 这就是「霾」那根旋钮：抬它地平线发白、天顶不动。 */
  mie: 1.0,
  /** Mie 各向异性。0.76—0.85 之间；越大太阳周围的辉光越紧。 */
  mieG: 0.8,
  /** 瑞利倍率。抬它天更蓝、天顶更暗（散射把长波散掉）。 */
  rayleigh: 1.0,
  /** 臭氧倍率。它只在黄昏可见：让地平线上方那条带偏青而不是纯橙。 */
  ozone: 1.0,
  /** 地面反照。多次散射与地平线以下的亮度靠它。 */
  groundAlbedo: 0.3,
  /** 太阳辐照度（线性 HDR 单位）。标定用它对齐今天的整体亮度。 */
  sunIrradiance: 20.0,
  /** 三通道增益：标定的最后一道，把曝光后的天顶/地平线亮度对回今天。 */
  skyTint: [1, 1, 1],
  /** 夜天光底噪（气辉 + 星光的积分）。白天各档为 0。 */
  skyFloor: [0, 0, 0],
  /** 大气透视的三通道增益与总增益（标定用）。 */
  aerialTint: [1, 1, 1],
  aerialGain: 1.0,
  /** 雾色里「物理散射」占的比例（0 = 完全用今天的美术雾色）。 */
  aerialBlend: 1.0,
  /** 0 = 只供色（消光仍归美术雾）；1 = 物理接管消光。见 Script_PostComposite。 */
  aerialMode: 0,
  /** 大气透视 froxel 覆盖到多远（m）。远景地形铺到 2.9 km，给到 4 km。 */
  aerialFarM: 4000,
  /** 战场霾单散射反照率：烟尘不是纯散射体，0.86 让它比云暗一点。 */
  hazeAlbedo: 0.86,
  /** 战场霾的 Mie 各向异性。烟尘颗粒比气溶胶大，前向更集中。 */
  hazeG: 0.72,
  /** 平行光是否由透过率 LUT 推导（默认关，预设里手调的值优先）。 */
  physicalSun: false,
  /**
   * 天穹上那层美术辉光的强度（乘在预设的 glow 上）。
   * LUT 里已经有真的 Mie 前向散射，所以物理档默认只留三成 —— 全留会在
   * 太阳周围叠出第二个圈，那正是"美术化天空"最像贴纸的地方。
   */
  artGlow: 0.35,
  /** 太阳盘吃多少透过率（1 = 完全物理：低太阳自然变橙变暗）。 */
  sunDiskT: 1,
};

/** 把预设的 `atmosphere` 字段并上缺省值。 */
export function MakeAtmospherePreset(fields) {
  return { ...ATMOSPHERE_PRESET_DEFAULTS, ...(fields || {}) };
}

// ---------------------------------------------------------------------------
// CPU 侧的透过率（纯 JS，零 three 依赖的算式）
//
// 用途有三个，都不适合读回 GPU：
//   · `physicalSun` 推导平行光的颜色与强度（换预设时同步算一次）；
//   · 标定脚本要打「物理推荐值 vs 现值」的对照表；
//   · 测试要在没有 GPU 的地方也能断言「天顶方向透过率 > 地平线方向」。
// 与 GLSL 那份是同一条积分，步数不同（CPU 这边可以给足）。
// ---------------------------------------------------------------------------

function OzoneDensity(heightKm, params) {
  const d = 1.0 - Math.abs(heightKm - params.ozoneCenterKm) / params.ozoneWidthKm;
  return Math.max(0, d);
}

/** 海拔 heightKm 处的消光系数（1/km），三通道。 */
export function ExtinctionAt(params, heightKm) {
  const h = Math.max(0, heightKm);
  const rayleigh = Math.exp(-h / params.rayleighHeightKm);
  const mie = Math.exp(-h / params.mieHeightKm);
  const ozone = OzoneDensity(h, params);
  const out = [0, 0, 0];
  for (let i = 0; i < 3; i += 1) {
    out[i] = params.rayleighScattering[i] * rayleigh
      + params.mieExtinction * mie
      + params.ozoneAbsorption[i] * ozone;
  }
  return out;
}

/**
 * 从半径 r（km，从地心算）沿天顶余弦 mu 出发，到大气顶的透过率。
 * 打到地面返回 0（太阳在地平线以下）。
 */
export function CpuTransmittance(params, rKm, mu, steps = 64) {
  const bottom = params.bottomRadiusKm;
  const top = params.topRadiusKm;
  // 与地面相交？
  const discGround = rKm * rKm * (mu * mu - 1) + bottom * bottom;
  if (mu < 0 && discGround >= 0) return [0, 0, 0];
  const discTop = rKm * rKm * (mu * mu - 1) + top * top;
  const tMax = Math.max(0, -rKm * mu + Math.sqrt(Math.max(discTop, 0)));
  const dt = tMax / steps;
  const tau = [0, 0, 0];
  for (let i = 0; i < steps; i += 1) {
    const t = (i + 0.5) * dt;
    const height = Math.sqrt(Math.max(rKm * rKm + t * t + 2 * rKm * t * mu, 0)) - bottom;
    const e = ExtinctionAt(params, height);
    tau[0] += e[0] * dt; tau[1] += e[1] * dt; tau[2] += e[2] * dt;
  }
  return [Math.exp(-tau[0]), Math.exp(-tau[1]), Math.exp(-tau[2])];
}

/**
 * `physicalSun` 的推导：平行光颜色 = 太阳方向的透过率归一化到最亮通道，
 * 强度 = 今天那一档的强度 × 亮度比。**这样换来的是色相与相对强度，
 * 不是绝对照度** —— 本作是线性 HDR 的美术单位，不声称物理 lux。
 * @returns {{colorHex:number, intensity:number, transmittance:number[], luminance:number}}
 */
export function PhysicalSunLight(params, sunElevationDeg, baseIntensity) {
  const mu = Math.sin(THREE.MathUtils.degToRad(sunElevationDeg));
  const r = params.bottomRadiusKm + params.siteAltitudeKm;
  const t = CpuTransmittance(params, r, mu);
  const luminance = 0.2126 * t[0] + 0.7152 * t[1] + 0.0722 * t[2];
  const peak = Math.max(t[0], t[1], t[2], 1e-6);
  const color = new THREE.Color(t[0] / peak, t[1] / peak, t[2] / peak);
  return {
    colorHex: color.getHex(),
    // 归一化到「正午 55° 时等于 baseIntensity」，让白天档的手调值仍是基准。
    intensity: baseIntensity * (luminance / 0.72),
    transmittance: t,
    luminance,
  };
}

// ---------------------------------------------------------------------------
// GLSL：公共常量与 LUT 参数化
//
// 这一段同时进 LUT 生成材质与采样方（天穹 / GI 射线 / 合成 pass），
// 两边用同一套 uv 映射是**硬要求** —— 各写一遍必然错位，而错位的表现是
// 「地平线上一条缝」或「太阳周围一圈台阶」，极难往 uv 上想。
// ---------------------------------------------------------------------------

export const ATMOSPHERE_CONST_GLSL = /* glsl */`
#ifndef ATMO_CONST_INCLUDED
#define ATMO_CONST_INCLUDED
const float ATMO_PI = 3.14159265359;
const float ATMO_BOTTOM = ${ATMOSPHERE_EARTH.bottomRadiusKm.toFixed(1)};
const float ATMO_TOP = ${ATMOSPHERE_EARTH.topRadiusKm.toFixed(1)};

// Hillaire 的「子纹素」修正：LUT 边缘那半个纹素不属于任何有效参数，
// 不修的话天顶方向会出现一圈能看出来的导数跳变。
float AtmoToSubUv(float u, float resolution) {
  return (u + 0.5 / resolution) * (resolution / (resolution + 1.0));
}
float AtmoFromSubUv(float u, float resolution) {
  return (u - 0.5 / resolution) * (resolution / (resolution - 1.0));
}

/** 射线（r, mu）是否会打到地面。 */
bool AtmoHitsGround(float r, float mu) {
  return mu < 0.0 && (r * r * (mu * mu - 1.0) + ATMO_BOTTOM * ATMO_BOTTOM) >= 0.0;
}

/** 到大气顶（或地面）的距离。 */
float AtmoRayLength(float r, float mu) {
  float discGround = r * r * (mu * mu - 1.0) + ATMO_BOTTOM * ATMO_BOTTOM;
  if (mu < 0.0 && discGround >= 0.0) return max(0.0, -r * mu - sqrt(max(discGround, 0.0)));
  float discTop = r * r * (mu * mu - 1.0) + ATMO_TOP * ATMO_TOP;
  return max(0.0, -r * mu + sqrt(max(discTop, 0.0)));
}

// --- 透过率 LUT 的参数化（Bruneton 2008 的 d/dMin/dMax 映射）---------------
vec2 AtmoTransUv(float r, float mu) {
  float H = sqrt(max(ATMO_TOP * ATMO_TOP - ATMO_BOTTOM * ATMO_BOTTOM, 0.0));
  float rho = sqrt(max(r * r - ATMO_BOTTOM * ATMO_BOTTOM, 0.0));
  float disc = r * r * (mu * mu - 1.0) + ATMO_TOP * ATMO_TOP;
  float d = max(0.0, -r * mu + sqrt(max(disc, 0.0)));
  float dMin = ATMO_TOP - r;
  float dMax = rho + H;
  return vec2(clamp((d - dMin) / max(dMax - dMin, 1e-6), 0.0, 1.0),
              clamp(rho / max(H, 1e-6), 0.0, 1.0));
}

void AtmoTransUvInverse(vec2 uv, out float r, out float mu) {
  float H = sqrt(max(ATMO_TOP * ATMO_TOP - ATMO_BOTTOM * ATMO_BOTTOM, 0.0));
  float rho = H * uv.y;
  r = sqrt(rho * rho + ATMO_BOTTOM * ATMO_BOTTOM);
  float dMin = ATMO_TOP - r;
  float dMax = rho + H;
  float d = dMin + uv.x * (dMax - dMin);
  mu = d <= 0.0 ? 1.0 : clamp((H * H - rho * rho - d * d) / (2.0 * r * d), -1.0, 1.0);
}

// --- 天空视图 LUT 的参数化 -------------------------------------------------
// 竖直方向在地平线两侧各做一次平方加密：地平线是整张天上信息密度最高的一条线，
// 均匀参数化在 108 行的分辨率下会把它糊成一条渐变带。
vec2 AtmoSkyViewUv(float viewZenithCos, float lightViewCos, float viewHeight, vec2 resolution) {
  float vHorizon = sqrt(max(viewHeight * viewHeight - ATMO_BOTTOM * ATMO_BOTTOM, 0.0));
  float cosBeta = clamp(vHorizon / max(viewHeight, 1e-4), -1.0, 1.0);
  float beta = acos(cosBeta);
  float zenithHorizon = ATMO_PI - beta;
  float viewZenith = acos(clamp(viewZenithCos, -1.0, 1.0));
  float v;
  if (viewZenith < zenithHorizon) {
    float coord = viewZenith / max(zenithHorizon, 1e-4);
    v = (1.0 - sqrt(max(1.0 - coord, 0.0))) * 0.5;
  } else {
    float coord = (viewZenith - zenithHorizon) / max(beta, 1e-4);
    v = sqrt(max(coord, 0.0)) * 0.5 + 0.5;
  }
  float u = sqrt(max(lightViewCos * 0.5 + 0.5, 0.0));
  return vec2(AtmoToSubUv(clamp(u, 0.0, 1.0), resolution.x),
              AtmoToSubUv(clamp(v, 0.0, 1.0), resolution.y));
}

void AtmoSkyViewUvInverse(vec2 uv, float viewHeight, vec2 resolution,
                          out float viewZenithCos, out float lightViewCos) {
  vec2 unit = vec2(AtmoFromSubUv(uv.x, resolution.x), AtmoFromSubUv(uv.y, resolution.y));
  float vHorizon = sqrt(max(viewHeight * viewHeight - ATMO_BOTTOM * ATMO_BOTTOM, 0.0));
  float cosBeta = clamp(vHorizon / max(viewHeight, 1e-4), -1.0, 1.0);
  float beta = acos(cosBeta);
  float zenithHorizon = ATMO_PI - beta;
  float viewZenith;
  if (unit.y < 0.5) {
    float coord = 1.0 - 2.0 * unit.y;
    viewZenith = zenithHorizon * (1.0 - coord * coord);
  } else {
    float coord = 2.0 * unit.y - 1.0;
    viewZenith = zenithHorizon + beta * coord * coord;
  }
  viewZenithCos = cos(viewZenith);
  lightViewCos = clamp(unit.x * unit.x * 2.0 - 1.0, -1.0, 1.0);
}

// --- 多次散射 LUT 的参数化（线性即可，它本身很平滑）------------------------
vec2 AtmoMultiUv(float r, float sunCos, vec2 resolution) {
  float u = clamp(sunCos * 0.5 + 0.5, 0.0, 1.0);
  float v = clamp((r - ATMO_BOTTOM) / max(ATMO_TOP - ATMO_BOTTOM, 1e-4), 0.0, 1.0);
  return vec2(AtmoToSubUv(u, resolution.x), AtmoToSubUv(v, resolution.y));
}

// --- 相函数 ---------------------------------------------------------------
float AtmoRayleighPhase(float cosTheta) {
  return 3.0 / (16.0 * ATMO_PI) * (1.0 + cosTheta * cosTheta);
}
float AtmoMiePhase(float cosTheta, float g) {
  // Cornette-Shanks（比原版 HG 在小角度更接近 Mie 的实测曲线）
  float g2 = g * g;
  float k = 3.0 / (8.0 * ATMO_PI) * (1.0 - g2) / (2.0 + g2);
  float d = 1.0 + g2 - 2.0 * g * cosTheta;
  return k * (1.0 + cosTheta * cosTheta) / max(d * sqrt(max(d, 1e-4)), 1e-4);
}
#endif
`;

/**
 * 采样端。天穹、GI 漏空射线、调试视图都包含这一段。
 * 只有三个 uniform 是纹理，其余都是标量 —— 刻意做小，因为它会被编进
 * 探针体的 trace 着色器（那里已经有 24 个数组 uniform）。
 */
export const ATMOSPHERE_SAMPLE_GLSL = ATMOSPHERE_CONST_GLSL + /* glsl */`
#ifndef ATMO_SAMPLE_INCLUDED
#define ATMO_SAMPLE_INCLUDED
uniform sampler2D uAtmoTrans;
uniform sampler2D uAtmoSkyView;
uniform vec2 uAtmoTransSize;
uniform vec2 uAtmoSkyViewSize;
uniform float uAtmoEnabled;       // 0 = 走 Script_Sky 的旧解析天空（?skyLegacy=1）
uniform float uAtmoViewHeight;    // 相机所在半径（km，从地心算）
uniform vec3 uAtmoSkyTint;
uniform vec3 uAtmoSkyFloor;
uniform float uAtmoSunCosRadius;  // cos(太阳角半径)；0.53° 直径 → 0.2679° 半径
uniform float uAtmoLimb;          // 临边昏暗系数（0 = 均匀圆盘）

/** 世界方向 dir（+Y 向上）在相机高度处的天空辐射亮度，不含太阳盘。 */
vec3 AtmoSkyView(vec3 dir, vec3 sunDir) {
  float viewZenithCos = clamp(dir.y, -1.0, 1.0);
  vec2 dirH = vec2(dir.x, dir.z);
  vec2 sunH = vec2(sunDir.x, sunDir.z);
  float lenD = length(dirH);
  float lenS = length(sunH);
  // 正天顶/正天底时方位没有定义：取 +1（朝太阳那一侧），LUT 在那里本来就没有方位差
  float lightViewCos = (lenD < 1e-5 || lenS < 1e-5) ? 1.0 : dot(dirH / lenD, sunH / lenS);
  vec2 uv = AtmoSkyViewUv(viewZenithCos, lightViewCos, uAtmoViewHeight, uAtmoSkyViewSize);
  return max(texture2D(uAtmoSkyView, uv).rgb, vec3(0.0)) * uAtmoSkyTint + uAtmoSkyFloor;
}

/** 相机到太阳方向的透过率（太阳盘要乘它，黄昏才会自然变橙变暗）。 */
vec3 AtmoSunTransmittance(vec3 sunDir) {
  vec2 uv = AtmoTransUv(uAtmoViewHeight, clamp(sunDir.y, -1.0, 1.0));
  return texture2D(uAtmoTrans, uv).rgb;
}

/**
 * 真角直径 0.5357° 的太阳盘 + 临边昏暗。
 * 返回 0—1 的覆盖度（含一个像素级的软边，不然 1 px 的盘会被 FXAA 啃成十字）。
 */
float AtmoSunDisk(float cosTheta) {
  float cosR = uAtmoSunCosRadius;
  if (cosTheta < cosR - 1.0e-5) return 0.0;
  // 归一化的盘内半径 t = sin(theta)/sin(R)，用余弦近似（角度极小，误差 < 1e-6）
  float theta = sqrt(max(2.0 * (1.0 - cosTheta), 0.0));
  float radius = sqrt(max(2.0 * (1.0 - cosR), 0.0));
  float t = clamp(theta / max(radius, 1e-7), 0.0, 1.0);
  // 临边昏暗（Cox 2000 的一阶拟合）：中心到边缘掉到约 0.4，这是太阳盘
  // 在长焦下看着「有体积」而不是一块白饼的原因
  float centerToEdge = sqrt(max(1.0 - t * t, 0.0));
  float limb = 1.0 - uAtmoLimb * (1.0 - centerToEdge);
  // 边缘的 7% 做软化。0.53° 的盘在 55° FOV / 1600 px 上只有 15 px 直径，
  // 硬边会被 FXAA 啃出锯齿；7% 折算约半个像素，正好是一条抗锯齿边而不是渐变斑。
  float edge = 1.0 - smoothstep(0.93, 1.0, t);
  return max(limb, 0.0) * edge;
}
#endif
`;

/**
 * 大气透视（froxel LUT）的采样端。合成 pass 的 ApplyFog 用它。
 *   `vec4 AerialPerspective(vec3 worldPos)` → rgb = 沿视线累积的散射，a = 透过率。
 * froxel 是视锥对齐的，所以要把 worldPos 投回屏幕；接口按跨系统约定保持
 * 「只吃一个世界坐标」，投影矩阵藏在 uniform 里。
 */
export const AERIAL_PERSPECTIVE_GLSL = /* glsl */`
#ifndef ATMO_AERIAL_INCLUDED
#define ATMO_AERIAL_INCLUDED
uniform sampler2D uAtmoAerial;
uniform vec3 uAtmoAerialSize;      // (每片宽, 高, 片数)
uniform float uAtmoAerialFarM;     // froxel 覆盖的最远距离（米）
uniform mat4 uAtmoViewProj;
uniform vec3 uAtmoCamPos;
uniform vec3 uAtmoAerialTint;
uniform float uAtmoAerialGain;
uniform float uAtmoAerialBlend;    // 雾色里物理散射占的比例
uniform float uAtmoAerialMode;     // 0 = 只供色，1 = 物理接管消光
// 体积雾代理负责 0—uVolumetricFar 那一段；它把自己那一段的终点透过率写这里，
// 两者相乘才是完整的一条视线。没人接线时恒为 1（本代理按 1 处理）。
uniform float uVolumetricFarTransmittance;

vec4 AtmoAerialFetch(vec2 screenUv, float slice) {
  float slices = uAtmoAerialSize.z;
  float sliceWidth = uAtmoAerialSize.x;
  float sliceHeight = uAtmoAerialSize.y;
  float atlasWidth = sliceWidth * slices;
  float s = clamp(slice, 0.0, slices - 1.0);
  // 片内做半纹素内缩：线性过滤绝不许跨过切片边界，否则最近的一片会把
  // 下一片的散射渗进来（图集式 3D LUT 的老坑，表现是近景一圈发亮的边）。
  float x = floor(s) * sliceWidth + clamp(screenUv.x, 0.0, 1.0) * (sliceWidth - 1.0) + 0.5;
  float y = clamp(screenUv.y, 0.0, 1.0) * (sliceHeight - 1.0) + 0.5;
  return texture2D(uAtmoAerial, vec2(x / atlasWidth, y / sliceHeight));
}

/** 屏幕 uv + 视线距离（米）→ 散射与透过率。切片按 sqrt 分布，近处才够密。 */
vec4 AerialPerspectiveUv(vec2 screenUv, float distanceMeters) {
  float slices = uAtmoAerialSize.z;
  float t = sqrt(clamp(distanceMeters / max(uAtmoAerialFarM, 1.0), 0.0, 1.0));
  float slice = t * slices - 0.5;
  vec4 texel;
  if (slice <= 0.0) {
    // 第一片之前：从「恒等」（无散射、透过率 1）线性过渡到第 0 片。
    // 不做这一段的话贴脸的地面会突然吃到半片散射。
    texel = mix(vec4(0.0, 0.0, 0.0, 1.0), AtmoAerialFetch(screenUv, 0.0),
                clamp(slice * 2.0 + 1.0, 0.0, 1.0));
  } else {
    float base = floor(slice);
    texel = mix(AtmoAerialFetch(screenUv, base), AtmoAerialFetch(screenUv, base + 1.0),
                fract(slice));
  }
  texel.rgb *= uAtmoAerialTint * uAtmoAerialGain;
  texel.a = clamp(texel.a * uVolumetricFarTransmittance, 0.0, 1.0);
  return texel;
}

/** 跨系统约定的入口：只吃一个世界坐标。 */
vec4 AerialPerspective(vec3 worldPos) {
  vec4 clip = uAtmoViewProj * vec4(worldPos, 1.0);
  vec2 uv = (clip.xy / max(abs(clip.w), 1e-4)) * 0.5 + 0.5;
  return AerialPerspectiveUv(uv, length(worldPos - uAtmoCamPos));
}
#endif
`;

// ---------------------------------------------------------------------------
// GLSL：介质与积分（只进 LUT 生成材质）
// ---------------------------------------------------------------------------

const ATMOSPHERE_MEDIUM_GLSL = /* glsl */`
uniform vec3 uAtmoRayleighS;
uniform float uAtmoRayleighH;
uniform float uAtmoMieS;
uniform float uAtmoMieE;
uniform float uAtmoMieH;
uniform float uAtmoMieG;
uniform vec3 uAtmoOzoneA;
uniform float uAtmoOzoneCenter;
uniform float uAtmoOzoneWidth;
uniform float uAtmoGroundAlbedo;
uniform vec3 uAtmoSunIrradiance;
// 战场霾（只有大气透视 LUT 打开它；天空视图 LUT 恒为 0）
uniform float uAtmoHazeE;      // 地面消光，1/km
uniform float uAtmoHazeH;      // 标高，km
uniform float uAtmoHazeAlbedo;
uniform float uAtmoHazeG;
uniform vec3 uAtmoHazeTint;

struct AtmoMedium {
  vec3 scatterRayleigh;
  float scatterMie;
  float scatterHaze;
  vec3 extinction;
};

AtmoMedium AtmoSampleMedium(float heightKm) {
  float h = max(heightKm, 0.0);
  float dRayleigh = exp(-h / max(uAtmoRayleighH, 0.01));
  float dMie = exp(-h / max(uAtmoMieH, 0.01));
  float dOzone = max(0.0, 1.0 - abs(h - uAtmoOzoneCenter) / max(uAtmoOzoneWidth, 0.01));
  float dHaze = exp(-h / max(uAtmoHazeH, 1.0e-5));
  AtmoMedium m;
  m.scatterRayleigh = uAtmoRayleighS * dRayleigh;
  m.scatterMie = uAtmoMieS * dMie;
  m.scatterHaze = uAtmoHazeE * uAtmoHazeAlbedo * dHaze;
  m.extinction = m.scatterRayleigh + vec3(uAtmoMieE * dMie)
    + uAtmoOzoneA * dOzone + vec3(uAtmoHazeE * dHaze);
  return m;
}
`;

// --- 透过率 LUT ------------------------------------------------------------

const FRAG_TRANSMITTANCE = ATMOSPHERE_CONST_GLSL + ATMOSPHERE_MEDIUM_GLSL + /* glsl */`
uniform vec2 uAtmoTransSize;
uniform float uAtmoSteps;
varying vec2 vUv;
void main() {
  vec2 unit = vec2(AtmoFromSubUv(vUv.x, uAtmoTransSize.x), AtmoFromSubUv(vUv.y, uAtmoTransSize.y));
  float r, mu;
  AtmoTransUvInverse(clamp(unit, 0.0, 1.0), r, mu);
  float tMax = AtmoRayLength(r, mu);
  float steps = max(uAtmoSteps, 4.0);
  float dt = tMax / steps;
  vec3 tau = vec3(0.0);
  for (int i = 0; i < 64; i++) {
    if (float(i) >= steps) break;
    float t = (float(i) + 0.5) * dt;
    float height = sqrt(max(r * r + t * t + 2.0 * r * t * mu, 0.0)) - ATMO_BOTTOM;
    AtmoMedium m = AtmoSampleMedium(height);
    tau += m.extinction * dt;
  }
  gl_FragColor = vec4(exp(-tau), 1.0);
}
`;

// --- 多次散射 LUT ----------------------------------------------------------
//
// Hillaire 的核心近似：把二阶以上的散射当成**各向同性、且在球面上均匀**，
// 于是无穷阶的和收敛成一个等比级数 Ψ = L₂ / (1 − f_ms)。
// 一张 32×32 的表就够，代价是散射各向异性只保留一阶 —— 对天空完全够用，
// 而它带来的是「黄昏地平线不再死黑」「厚霾天有整体的亮」这两件肉眼可见的事。

const FRAG_MULTISCATTER = ATMOSPHERE_CONST_GLSL + ATMOSPHERE_MEDIUM_GLSL + /* glsl */`
uniform sampler2D uAtmoTrans;
uniform vec2 uAtmoTransSize;
uniform vec2 uAtmoMultiSize;
uniform float uAtmoSteps;
uniform float uAtmoDirs;      // 每个方向轴的采样数，总方向数 = dirs * dirs * 2
varying vec2 vUv;

vec3 AtmoTransLut(float r, float mu) {
  vec2 uv = AtmoTransUv(r, mu);
  return texture2D(uAtmoTrans, uv).rgb;
}

void main() {
  vec2 unit = vec2(AtmoFromSubUv(vUv.x, uAtmoMultiSize.x), AtmoFromSubUv(vUv.y, uAtmoMultiSize.y));
  float sunCos = clamp(unit.x * 2.0 - 1.0, -1.0, 1.0);
  float r = ATMO_BOTTOM + clamp(unit.y, 0.0, 1.0) * (ATMO_TOP - ATMO_BOTTOM);
  vec3 sunDir = vec3(0.0, sunCos, sqrt(max(1.0 - sunCos * sunCos, 0.0)));
  vec3 origin = vec3(0.0, r, 0.0);

  float dirs = max(uAtmoDirs, 2.0);
  float steps = max(uAtmoSteps, 4.0);
  float uniformPhase = 1.0 / (4.0 * ATMO_PI);
  vec3 lSecond = vec3(0.0);
  vec3 fMs = vec3(0.0);
  float dirCount = 0.0;

  for (int a = 0; a < 8; a++) {
    if (float(a) >= dirs) break;
    for (int b = 0; b < 8; b++) {
      if (float(b) >= dirs) break;
      // 球面均匀采样：cosθ 均匀、方位均匀
      float cosTheta = 1.0 - 2.0 * (float(a) + 0.5) / dirs;
      float sinTheta = sqrt(max(1.0 - cosTheta * cosTheta, 0.0));
      float phi = 2.0 * ATMO_PI * (float(b) + 0.5) / dirs;
      vec3 dir = vec3(sinTheta * cos(phi), cosTheta, sinTheta * sin(phi));
      dirCount += 1.0;

      float mu = dir.y;
      float tMax = AtmoRayLength(r, mu);
      bool ground = AtmoHitsGround(r, mu);
      float dt = tMax / steps;
      vec3 throughput = vec3(1.0);
      for (int i = 0; i < 24; i++) {
        if (float(i) >= steps) break;
        float t = (float(i) + 0.5) * dt;
        vec3 p = origin + dir * t;
        float height = length(p) - ATMO_BOTTOM;
        AtmoMedium m = AtmoSampleMedium(height);
        vec3 sampleT = exp(-m.extinction * dt);
        float rp = length(p);
        float sunMu = dot(normalize(p), sunDir);
        vec3 sunT = AtmoHitsGround(rp, sunMu) ? vec3(0.0) : AtmoTransLut(rp, sunMu);
        vec3 scattering = m.scatterRayleigh + vec3(m.scatterMie);
        // 一阶（各向同性相函数）——它就是二阶散射的源
        vec3 s = uAtmoSunIrradiance * sunT * scattering * uniformPhase;
        vec3 sInt = (s - s * sampleT) / max(m.extinction, vec3(1e-7));
        lSecond += throughput * sInt;
        // 传输项：这一段空气把入射的均匀辐射散出去多少
        vec3 fInt = (scattering - scattering * sampleT) / max(m.extinction, vec3(1e-7));
        fMs += throughput * fInt;
        throughput *= sampleT;
      }
      if (ground && uAtmoGroundAlbedo > 0.0) {
        vec3 p = origin + dir * tMax;
        float sunMu = dot(normalize(p), sunDir);
        vec3 sunT = AtmoHitsGround(length(p), sunMu) ? vec3(0.0) : AtmoTransLut(length(p), sunMu);
        lSecond += throughput * sunT * uAtmoSunIrradiance
          * max(sunMu, 0.0) * uAtmoGroundAlbedo / ATMO_PI;
      }
    }
  }
  lSecond /= max(dirCount, 1.0);
  fMs /= max(dirCount, 1.0);
  vec3 psi = lSecond / max(1.0 - fMs, vec3(1e-4));
  gl_FragColor = vec4(max(psi, vec3(0.0)), 1.0);
}
`;

// --- 天空视图 LUT ----------------------------------------------------------

const FRAG_SKYVIEW = ATMOSPHERE_CONST_GLSL + ATMOSPHERE_MEDIUM_GLSL + /* glsl */`
uniform sampler2D uAtmoTrans;
uniform sampler2D uAtmoMulti;
uniform vec2 uAtmoTransSize;
uniform vec2 uAtmoMultiSize;
uniform vec2 uAtmoSkyViewSize;
uniform float uAtmoViewHeight;
uniform float uAtmoSunCosZenith;
uniform float uAtmoSteps;
varying vec2 vUv;

vec3 AtmoTransLut(float r, float mu) { return texture2D(uAtmoTrans, AtmoTransUv(r, mu)).rgb; }
vec3 AtmoMultiLut(float r, float mu) {
  return texture2D(uAtmoMulti, AtmoMultiUv(r, mu, uAtmoMultiSize)).rgb;
}

void main() {
  float viewZenithCos, lightViewCos;
  AtmoSkyViewUvInverse(vUv, uAtmoViewHeight, uAtmoSkyViewSize, viewZenithCos, lightViewCos);
  float sinV = sqrt(max(1.0 - viewZenithCos * viewZenithCos, 0.0));
  // 局部标架：Y 向上，太阳放在 +Z 那一侧（LUT 假定绕天顶轴对称）
  vec3 dir = vec3(sinV * sqrt(max(1.0 - lightViewCos * lightViewCos, 0.0)),
                  viewZenithCos, sinV * lightViewCos);
  float sunCos = clamp(uAtmoSunCosZenith, -1.0, 1.0);
  vec3 sunDir = vec3(0.0, sunCos, sqrt(max(1.0 - sunCos * sunCos, 0.0)));
  float r = uAtmoViewHeight;
  vec3 origin = vec3(0.0, r, 0.0);

  float tMax = AtmoRayLength(r, viewZenithCos);
  bool ground = AtmoHitsGround(r, viewZenithCos);
  float steps = max(uAtmoSteps, 4.0);
  float cosTheta = dot(dir, sunDir);
  float phaseR = AtmoRayleighPhase(cosTheta);
  float phaseM = AtmoMiePhase(cosTheta, uAtmoMieG);

  vec3 luminance = vec3(0.0);
  vec3 throughput = vec3(1.0);
  // 步长按 t² 分布：贴地那几百米的密度变化最大，均匀步长会在地平线上出台阶
  for (int i = 0; i < 48; i++) {
    if (float(i) >= steps) break;
    float t0 = pow(float(i) / steps, 2.0) * tMax;
    float t1 = pow((float(i) + 1.0) / steps, 2.0) * tMax;
    float dt = max(t1 - t0, 1e-6);
    float t = (t0 + t1) * 0.5;
    vec3 p = origin + dir * t;
    float rp = length(p);
    float height = rp - ATMO_BOTTOM;
    AtmoMedium m = AtmoSampleMedium(height);
    vec3 sampleT = exp(-m.extinction * dt);
    float sunMu = dot(normalize(p), sunDir);
    vec3 sunT = AtmoHitsGround(rp, sunMu) ? vec3(0.0) : AtmoTransLut(rp, sunMu);
    vec3 psi = AtmoMultiLut(rp, sunMu);
    vec3 scattering = m.scatterRayleigh + vec3(m.scatterMie);
    // 一阶：太阳直射 × 相函数；二阶以上：多次散射 LUT 的 Ψ 已经是
    // 「各向同性的入射辐射亮度」，直接乘散射系数（相函数已含在 Ψ 的推导里）。
    vec3 s = uAtmoSunIrradiance * sunT
      * (m.scatterRayleigh * phaseR + vec3(m.scatterMie * phaseM))
      + scattering * psi;
    vec3 sInt = (s - s * sampleT) / max(m.extinction, vec3(1e-7));
    luminance += throughput * sInt;
    throughput *= sampleT;
  }
  if (ground && uAtmoGroundAlbedo > 0.0) {
    vec3 p = origin + dir * tMax;
    float sunMu = dot(normalize(p), sunDir);
    vec3 sunT = AtmoHitsGround(length(p), sunMu) ? vec3(0.0) : AtmoTransLut(length(p), sunMu);
    luminance += throughput * sunT * uAtmoSunIrradiance * max(sunMu, 0.0)
      * uAtmoGroundAlbedo / ATMO_PI;
  }
  gl_FragColor = vec4(max(luminance, vec3(0.0)), 1.0);
}
`;

// --- 大气透视 LUT ----------------------------------------------------------

const FRAG_AERIAL = ATMOSPHERE_CONST_GLSL + ATMOSPHERE_MEDIUM_GLSL + /* glsl */`
uniform sampler2D uAtmoTrans;
uniform sampler2D uAtmoMulti;
uniform vec2 uAtmoTransSize;
uniform vec2 uAtmoMultiSize;
uniform vec3 uAtmoAerialSize;
uniform float uAtmoAerialFarM;
uniform float uAtmoSteps;
uniform mat4 uAtmoInvView;
uniform vec2 uAtmoProjScale;
uniform vec3 uAtmoSunDirLocal;
uniform float uAtmoSiteKm;
varying vec2 vUv;

vec3 AtmoTransLut(float r, float mu) { return texture2D(uAtmoTrans, AtmoTransUv(r, mu)).rgb; }
vec3 AtmoMultiLut(float r, float mu) {
  return texture2D(uAtmoMulti, AtmoMultiUv(r, mu, uAtmoMultiSize)).rgb;
}

void main() {
  float slices = uAtmoAerialSize.z;
  float sliceWidth = uAtmoAerialSize.x;
  float sliceHeight = uAtmoAerialSize.y;
  // 纹素中心 → 切片下标与片内格点。**与采样端 AtmoAerialFetch 的内缩必须
  // 逐纹素对得上**：差半个纹素的话近景会整片偏一格，表现是「贴脸有雾」。
  float px = vUv.x * sliceWidth * slices;
  float sliceIndex = floor(px / sliceWidth);
  float cellX = floor(px - sliceIndex * sliceWidth);
  float cellY = floor(vUv.y * sliceHeight);
  vec2 screenUv = vec2(cellX / max(sliceWidth - 1.0, 1.0),
                       cellY / max(sliceHeight - 1.0, 1.0));

  // 屏幕 uv → 世界方向（与 Composite 的 ViewPos 反投影同一套口径）
  vec2 ndc = screenUv * 2.0 - 1.0;
  vec3 viewDir = normalize(vec3(ndc.x / max(uAtmoProjScale.x, 1e-4),
                                ndc.y / max(uAtmoProjScale.y, 1e-4), -1.0));
  vec3 dir = normalize(mat3(uAtmoInvView) * viewDir);
  vec3 camWorld = uAtmoInvView[3].xyz;

  // 切片距离：采样端用 t = sqrt(d / far)、slice = t·N − 0.5，
  // 所以第 i 片的距离必须是 ((i+0.5)/N)² · far（两边一个式子，别各写各的）。
  float tSlice = (sliceIndex + 0.5) / slices;
  float far = tSlice * tSlice * uAtmoAerialFarM;
  float steps = max(uAtmoSteps, 2.0);
  float dtM = far / steps;
  float dtKm = dtM * 0.001;

  vec3 sunDir = normalize(uAtmoSunDirLocal);
  float cosTheta = dot(dir, sunDir);
  float phaseR = AtmoRayleighPhase(cosTheta);
  float phaseM = AtmoMiePhase(cosTheta, uAtmoMieG);
  float phaseH = AtmoMiePhase(cosTheta, uAtmoHazeG);

  vec3 luminance = vec3(0.0);
  vec3 throughput = vec3(1.0);
  for (int i = 0; i < 16; i++) {
    if (float(i) >= steps) break;
    float t = (float(i) + 0.5) * dtM;
    vec3 world = camWorld + dir * t;
    float heightKm = uAtmoSiteKm + world.y * 0.001;
    AtmoMedium m = AtmoSampleMedium(heightKm);
    vec3 sampleT = exp(-m.extinction * dtKm);
    float rp = ATMO_BOTTOM + max(heightKm, 0.0);
    float sunMu = clamp(sunDir.y, -1.0, 1.0);
    vec3 sunT = AtmoHitsGround(rp, sunMu) ? vec3(0.0) : AtmoTransLut(rp, sunMu);
    vec3 psi = AtmoMultiLut(rp, sunMu);
    vec3 scattering = m.scatterRayleigh + vec3(m.scatterMie) + vec3(m.scatterHaze) * uAtmoHazeTint;
    vec3 single = m.scatterRayleigh * phaseR + vec3(m.scatterMie * phaseM)
      + vec3(m.scatterHaze * phaseH) * uAtmoHazeTint;
    vec3 s = uAtmoSunIrradiance * sunT * single + scattering * psi;
    vec3 sInt = (s - s * sampleT) / max(m.extinction, vec3(1e-7));
    luminance += throughput * sInt;
    throughput *= sampleT;
  }
  // alpha 存三通道透过率的均值（Hillaire 的口径；逐通道透过率要三张图，
  // 在这个尺度上色差小于半个色阶，不值那份带宽）
  float meanT = dot(throughput, vec3(1.0 / 3.0));
  gl_FragColor = vec4(luminance, clamp(meanT, 0.0, 1.0));
}
`;

// ---------------------------------------------------------------------------
// LUT 的持有者
// ---------------------------------------------------------------------------

function Vector3From(a) { return new THREE.Vector3(a[0], a[1], a[2]); }

/**
 * 建一张 LUT 靶。全部 RGBA16F + Linear + Clamp + NoColorSpace（数据不是颜色）。
 * 半浮点足够：天空辐射亮度的动态范围只有三四个数量级，而且它是要被曝光的。
 */
function MakeLutTarget(width, height) {
  const rt = MakeRenderTarget(width, height, { type: THREE.HalfFloatType });
  rt.texture.name = "AtmosphereLut";
  return rt;
}

/**
 * 四张 LUT 的持有者。SkyDome 拿一份；uniform 对象**共享**给天穹材质、
 * GI 的 trace 材质、合成 pass —— 换预设时三处同时变（这条是 Script_Sky 那套
 * 「借同一批 uniform 对象」的延续，各存一份的下场是天变了 GI 还在积分旧天）。
 */
export class Atmosphere {
  constructor(renderer, { quality = "high" } = {}) {
    this.renderer = renderer;
    this.tier = ATMOSPHERE_TIERS[quality] || ATMOSPHERE_TIERS.high;
    this.qualityName = ATMOSPHERE_TIERS[quality] ? quality : "high";
    this.params = { ...ATMOSPHERE_EARTH };
    this.preset = MakeAtmospherePreset(null);
    this.sunDirection = new THREE.Vector3(0, 1, 0);
    this.viewHeightKm = ATMOSPHERE_EARTH.bottomRadiusKm + ATMOSPHERE_EARTH.siteAltitudeKm;
    this.staticDirty = true;
    this.ready = false;
    // 天空视图 LUT 的脏标记（见 RenderSkyView）
    this._skyViewDone = false;
    this._skyViewHeight = -1;
    this._skyViewSunCos = -2;

    const T = this.tier;
    this.transTarget = MakeLutTarget(T.trans[0], T.trans[1]);
    this.multiTarget = MakeLutTarget(T.multi[0], T.multi[1]);
    this.skyViewTarget = MakeLutTarget(T.skyView[0], T.skyView[1]);
    this.aerialTarget = MakeLutTarget(T.ap[0] * T.ap[2], T.ap[1]);

    // --- 采样端共享 uniform（进 sky.uniforms → 天穹 / GI / 水面都借同一批）---
    this.sampleUniforms = {
      uAtmoTrans: { value: this.transTarget.texture },
      uAtmoSkyView: { value: this.skyViewTarget.texture },
      uAtmoTransSize: { value: new THREE.Vector2(T.trans[0], T.trans[1]) },
      uAtmoSkyViewSize: { value: new THREE.Vector2(T.skyView[0], T.skyView[1]) },
      uAtmoEnabled: { value: 1 },
      uAtmoViewHeight: { value: this.viewHeightKm },
      uAtmoSkyTint: { value: new THREE.Vector3(1, 1, 1) },
      uAtmoSkyFloor: { value: new THREE.Vector3(0, 0, 0) },
      // 太阳真角半径 0.2679°（直径 0.5357°，1938 年三月的日地距离差别可以忽略）
      uAtmoSunCosRadius: { value: Math.cos(THREE.MathUtils.degToRad(0.2679)) },
      uAtmoLimb: { value: 0.6 },
    };

    // --- 大气透视端（合成 pass 绑这一批）---
    this.aerialUniforms = {
      uAtmoAerial: { value: this.aerialTarget.texture },
      uAtmoAerialSize: { value: new THREE.Vector3(T.ap[0], T.ap[1], T.ap[2]) },
      uAtmoAerialFarM: { value: ATMOSPHERE_PRESET_DEFAULTS.aerialFarM },
      uAtmoViewProj: { value: new THREE.Matrix4() },
      uAtmoCamPos: { value: new THREE.Vector3() },
      uAtmoAerialTint: { value: new THREE.Vector3(1, 1, 1) },
      uAtmoAerialGain: { value: 1 },
      uAtmoAerialBlend: { value: 1 },
      uAtmoAerialMode: { value: 0 },
      uVolumetricFarTransmittance: { value: 1 },
    };

    // --- 生成端 uniform（介质参数一份，四个材质共用）---
    this.mediumUniforms = {
      uAtmoRayleighS: { value: Vector3From(ATMOSPHERE_EARTH.rayleighScattering) },
      uAtmoRayleighH: { value: ATMOSPHERE_EARTH.rayleighHeightKm },
      uAtmoMieS: { value: ATMOSPHERE_EARTH.mieScattering },
      uAtmoMieE: { value: ATMOSPHERE_EARTH.mieExtinction },
      uAtmoMieH: { value: ATMOSPHERE_EARTH.mieHeightKm },
      uAtmoMieG: { value: ATMOSPHERE_EARTH.mieG },
      uAtmoOzoneA: { value: Vector3From(ATMOSPHERE_EARTH.ozoneAbsorption) },
      uAtmoOzoneCenter: { value: ATMOSPHERE_EARTH.ozoneCenterKm },
      uAtmoOzoneWidth: { value: ATMOSPHERE_EARTH.ozoneWidthKm },
      uAtmoGroundAlbedo: { value: ATMOSPHERE_EARTH.groundAlbedo },
      uAtmoSunIrradiance: { value: new THREE.Vector3(20, 20, 20) },
      uAtmoHazeE: { value: 0 },
      uAtmoHazeH: { value: 0.018 },
      uAtmoHazeAlbedo: { value: 0.86 },
      uAtmoHazeG: { value: 0.72 },
      uAtmoHazeTint: { value: new THREE.Vector3(1, 1, 1) },
    };

    const S = this.mediumUniforms;
    const trans = { value: this.transTarget.texture };
    const multi = { value: this.multiTarget.texture };
    const transSize = this.sampleUniforms.uAtmoTransSize;
    const multiSize = { value: new THREE.Vector2(T.multi[0], T.multi[1]) };

    this.transUniforms = { ...S, uAtmoTransSize: transSize, uAtmoSteps: { value: T.transSteps } };
    this.multiUniforms = {
      ...S, uAtmoTrans: trans, uAtmoTransSize: transSize, uAtmoMultiSize: multiSize,
      uAtmoSteps: { value: T.multiSteps }, uAtmoDirs: { value: T.multiDirs },
    };
    this.skyViewUniforms = {
      ...S, uAtmoTrans: trans, uAtmoMulti: multi,
      uAtmoTransSize: transSize, uAtmoMultiSize: multiSize,
      uAtmoSkyViewSize: this.sampleUniforms.uAtmoSkyViewSize,
      uAtmoViewHeight: this.sampleUniforms.uAtmoViewHeight,
      uAtmoSunCosZenith: { value: 0.5 }, uAtmoSteps: { value: T.skySteps },
    };
    this.aerialGenUniforms = {
      ...S, uAtmoTrans: trans, uAtmoMulti: multi,
      uAtmoTransSize: transSize, uAtmoMultiSize: multiSize,
      uAtmoAerialSize: this.aerialUniforms.uAtmoAerialSize,
      uAtmoAerialFarM: this.aerialUniforms.uAtmoAerialFarM,
      uAtmoSteps: { value: T.apSteps },
      uAtmoInvView: { value: new THREE.Matrix4() },
      uAtmoProjScale: { value: new THREE.Vector2(1, 1) },
      uAtmoSunDirLocal: { value: new THREE.Vector3(0, 1, 0) },
      uAtmoSiteKm: { value: ATMOSPHERE_EARTH.siteAltitudeKm },
    };

    this.transMaterial = MakeFullscreenMaterial(FRAG_TRANSMITTANCE, this.transUniforms);
    this.multiMaterial = MakeFullscreenMaterial(FRAG_MULTISCATTER, this.multiUniforms);
    this.skyViewMaterial = MakeFullscreenMaterial(FRAG_SKYVIEW, this.skyViewUniforms);
    this.aerialMaterial = MakeFullscreenMaterial(FRAG_AERIAL, this.aerialGenUniforms);

    // 自带一份全屏四边形：SkyDome.Apply() 要在没有 FrameContext 的时候
    // （建关、换时段、PMREM 烘焙之前）同步把三张静态 LUT 算出来。
    this.quadScene = new THREE.Scene();
    this.quadMesh = new THREE.Mesh(QUAD_GEOMETRY, this.transMaterial);
    this.quadMesh.frustumCulled = false;
    this.quadScene.add(this.quadMesh);
  }

  _Blit(material, target) {
    const renderer = this.renderer;
    if (!renderer) return;
    const prevTarget = renderer.getRenderTarget();
    const prevAutoClear = renderer.autoClear;
    this.quadMesh.material = material;
    renderer.autoClear = true;
    renderer.setRenderTarget(target);
    renderer.render(this.quadScene, QUAD_CAMERA);
    renderer.autoClear = prevAutoClear;
    renderer.setRenderTarget(prevTarget);
  }

  /** 套用一档预设的大气参数。会把三张静态 LUT 重算（约 1—3 ms，只在换预设时）。 */
  ApplyPreset(atmoFields, { sunDirection = null, fog = null } = {}) {
    const preset = MakeAtmospherePreset(atmoFields);
    this.preset = preset;
    const base = ATMOSPHERE_EARTH;
    const M = this.mediumUniforms;
    M.uAtmoRayleighS.value.set(
      base.rayleighScattering[0] * preset.rayleigh,
      base.rayleighScattering[1] * preset.rayleigh,
      base.rayleighScattering[2] * preset.rayleigh);
    M.uAtmoMieS.value = base.mieScattering * preset.mie;
    M.uAtmoMieE.value = base.mieExtinction * preset.mie;
    M.uAtmoMieG.value = preset.mieG;
    M.uAtmoOzoneA.value.set(
      base.ozoneAbsorption[0] * preset.ozone,
      base.ozoneAbsorption[1] * preset.ozone,
      base.ozoneAbsorption[2] * preset.ozone);
    M.uAtmoGroundAlbedo.value = preset.groundAlbedo;
    M.uAtmoSunIrradiance.value.setScalar(preset.sunIrradiance);
    M.uAtmoHazeAlbedo.value = preset.hazeAlbedo;
    M.uAtmoHazeG.value = preset.hazeG;

    // 战场霾：消光取美术雾的 density（1/m → 1/km），标高取 falloff（m → km）。
    // 干净空气在地面的 Mie 消光要**扣掉**，两者相加才恒等于今天那条曲线。
    if (fog && fog.density > 0) {
      const cleanMiePerKm = base.mieExtinction * preset.mie;
      const hazePerKm = Math.max(0, fog.density * 1000 - cleanMiePerKm);
      M.uAtmoHazeE.value = hazePerKm;
      M.uAtmoHazeH.value = Math.max(fog.falloff ?? 18, 1) * 0.001;
    } else {
      M.uAtmoHazeE.value = 0;
      M.uAtmoHazeH.value = 0.018;
    }

    // 采样端
    const S = this.sampleUniforms;
    S.uAtmoSkyTint.value.set(preset.skyTint[0], preset.skyTint[1], preset.skyTint[2]);
    S.uAtmoSkyFloor.value.set(preset.skyFloor[0], preset.skyFloor[1], preset.skyFloor[2]);
    const A = this.aerialUniforms;
    A.uAtmoAerialTint.value.set(preset.aerialTint[0], preset.aerialTint[1], preset.aerialTint[2]);
    A.uAtmoAerialGain.value = preset.aerialGain;
    A.uAtmoAerialBlend.value = preset.aerialBlend;
    A.uAtmoAerialMode.value = preset.aerialMode ? 1 : 0;
    A.uAtmoAerialFarM.value = preset.aerialFarM;

    if (sunDirection) this.sunDirection.copy(sunDirection).normalize();
    this.staticDirty = true;
    this._skyViewDone = false;      // 介质参数变了，脏标记那两个自变量看不出来
    this.RenderStatic();
    this.RenderSkyView(true);
    return preset;
  }

  SetSunDirection(direction) {
    this.sunDirection.copy(direction).normalize();
  }

  /** 强制下一帧重算天空视图 LUT（外部改了介质 uniform 时用）。 */
  InvalidateSkyView() { this._skyViewDone = false; }

  /** 相机世界高度（米）→ LUT 的 r。 */
  SetViewAltitude(worldY) {
    const km = ATMOSPHERE_EARTH.bottomRadiusKm
      + Math.max(0, ATMOSPHERE_EARTH.siteAltitudeKm + (worldY || 0) * 0.001);
    this.viewHeightKm = km;
    this.sampleUniforms.uAtmoViewHeight.value = km;
  }

  /** 透过率 + 多次散射：只在换预设时算。 */
  RenderStatic() {
    if (!this.renderer) return;
    this._Blit(this.transMaterial, this.transTarget);
    this._Blit(this.multiMaterial, this.multiTarget);
    this.staticDirty = false;
    this.ready = true;
  }

  /**
   * 天空视图 LUT。
   *
   * **它只有两个自变量**：相机海拔与太阳天顶角。本作的太阳一关之内不动，
   * 相机海拔在城里的变化是米级（大气标高是 8 km）—— 所以每帧无条件重算是
   * 白烧钱：实测这一张占 atmosphere 段的六成。改成脏标记之后，正常游玩里
   * 它每关只算个位数次（进关一次 + 上城墙那几次）。
   * 阈值 2 m / 1e-5（太阳天顶余弦）都远小于 LUT 自身的量化误差。
   */
  RenderSkyView(force = false) {
    if (!this.renderer) return false;
    if (this.staticDirty) this.RenderStatic();
    const sunCos = THREE.MathUtils.clamp(this.sunDirection.y, -1, 1);
    if (!force && this._skyViewDone
      && Math.abs(this.viewHeightKm - this._skyViewHeight) < 0.002
      && Math.abs(sunCos - this._skyViewSunCos) < 1e-5) return false;
    this.skyViewUniforms.uAtmoSunCosZenith.value = sunCos;
    this._Blit(this.skyViewMaterial, this.skyViewTarget);
    this._skyViewDone = true;
    this._skyViewHeight = this.viewHeightKm;
    this._skyViewSunCos = sunCos;
    return true;
  }

  /**
   * 大气透视 froxel：每帧，视锥对齐。
   * @param {THREE.Matrix4} invView camera.matrixWorld
   * @param {THREE.Vector2} projScale (1/tan(fov/2)/aspect, 1/tan(fov/2))
   * @param {THREE.Matrix4} viewProjection 无抖动 viewProj（采样端要用它投影）
   */
  RenderAerial(invView, projScale, viewProjection) {
    if (!this.renderer) return;
    const G = this.aerialGenUniforms;
    G.uAtmoInvView.value.copy(invView);
    G.uAtmoProjScale.value.copy(projScale);
    G.uAtmoSunDirLocal.value.copy(this.sunDirection);
    this._Blit(this.aerialMaterial, this.aerialTarget);
    const A = this.aerialUniforms;
    A.uAtmoViewProj.value.copy(viewProjection);
    A.uAtmoCamPos.value.setFromMatrixPosition(invView);
  }

  Dispose() {
    this.transTarget.dispose();
    this.multiTarget.dispose();
    this.skyViewTarget.dispose();
    this.aerialTarget.dispose();
    this.transMaterial.dispose();
    this.multiMaterial.dispose();
    this.skyViewMaterial.dispose();
    this.aerialMaterial.dispose();
    this.quadScene.remove(this.quadMesh);
  }
}

// ---------------------------------------------------------------------------
// 本页唯一那台大气（登记点）
//
// 一页只有一台 SkyDome，也就只有一台 Atmosphere。帧图里的 AtmospherePass
// 要拿到它，而 PostPipeline 是在 SkyDome 之前构造的（Script_Main 与
// Script_Probe 都是这个顺序），构造期传不进去。沿用 Script_Water 的
// `SetWaterSkyUniforms` 那个先例：一个模块级登记点，SkyDome 建好时登记。
// ---------------------------------------------------------------------------

let activeAtmosphere = null;

export function SetActiveAtmosphere(atmosphere) { activeAtmosphere = atmosphere || null; }
export function GetActiveAtmosphere() { return activeAtmosphere; }

/**
 * 帧图里的 `atmosphere` pass（排在 prepass 之前）。
 *
 * 干两件事，都不出画：
 *   · 天空视图 LUT —— 只在相机海拔或太阳天顶角真的变了才重算
 *     （见 `RenderSkyView` 的脏标记：每帧无条件重算占了这一段六成的钱）。
 *   · 大气透视 froxel LUT —— 视锥对齐，每帧必须重算。剩下的 0.15 ms 基本是它。
 * 透过率与多次散射两张是**静态**的，在 `SkyDome.Apply()` 里同步算完，
 * 这里只在被外部改脏（画质面板调烟霾）时补一次。
 *
 * 为什么排在 prepass 之前：主场景那一趟要画天穹，天穹采的就是天空视图 LUT。
 * 排在 main 之后的话天永远慢一帧 —— 静止时看不出来，换时段那一帧会闪。
 */
export class AtmospherePass {
  constructor(pipeline) {
    this.name = "atmosphere";
    this.pipeline = pipeline;
    this.bound = null;
    this._camPos = new THREE.Vector3();
    this.screenMaterial = null;
    this.screenUniforms = null;
    this._RegisterDebugViews();
  }

  /**
   * Debug Rendering 的大气组。四张 LUT 直接送屏；另外两张是**屏幕空间**的
   * 大气透视（散射与透过率），拿预通道重建世界坐标再问一次 LUT ——
   * 「froxel 对没对上像素」只有这两张看得出来。
   */
  _RegisterDebugViews() {
    const P = this.pipeline;
    if (!P.RegisterDebugView) return;
    const Lut = (pick, mode) => () => {
      const atmosphere = activeAtmosphere;
      const target = atmosphere ? pick(atmosphere) : null;
      return { texture: target?.texture, mode, unavailable: !target || !atmosphere?.ready };
    };
    P.RegisterDebugView("atmoTransmittance", Lut((a) => a.transTarget, 5));
    P.RegisterDebugView("atmoMultiScatter", Lut((a) => a.multiTarget, 4));
    P.RegisterDebugView("atmoSkyView", Lut((a) => a.skyViewTarget, 4));
    P.RegisterDebugView("atmoAerialLut", Lut((a) => a.aerialTarget, 4));
    const Screen = (mode) => () => {
      const atmosphere = activeAtmosphere;
      if (!atmosphere || !atmosphere.ready) return { texture: null, mode: 4, unavailable: true };
      const material = this._ScreenMaterial();
      this.screenUniforms.uAtmoDebugMode.value = mode;
      return {
        material,
        Prepare: (ctx) => {
          const U = this.screenUniforms;
          U.uNormalDepth.value = ctx.normalDepthTexture;
          U.uInvView.value.copy(ctx.invView);
          U.uProjScale.value.copy(ctx.projScale);
          U.uAtmoDebugMode.value = mode;
        },
      };
    };
    P.RegisterDebugView("aerialScatter", Screen(0));
    P.RegisterDebugView("aerialTransmittance", Screen(1));
  }

  /** 屏幕空间大气透视的展示材质。**惰性建**：正片不看调试图就不编这一份。 */
  _ScreenMaterial() {
    if (this.screenMaterial) return this.screenMaterial;
    this.screenUniforms = {
      uNormalDepth: { value: null },
      uInvView: { value: new THREE.Matrix4() },
      uProjScale: { value: new THREE.Vector2(1, 1) },
      uAtmoDebugMode: { value: 0 },
    };
    BindAtmosphereUniforms(this.screenUniforms, activeAtmosphere);
    this.screenMaterial = MakeFullscreenMaterial(FRAG_AERIAL_VIEW, this.screenUniforms);
    return this.screenMaterial;
  }

  Prepare(ctx) {
    const atmosphere = activeAtmosphere;
    const composite = this.pipeline.compositePass;
    if (!composite) return;
    if (this.bound !== atmosphere) {
      // 把大气透视那一批 uniform 挂进合成 pass（共享对象，不是拷值）。
      // 名字不变，所以不触发重编译；换 SkyDome（编辑器重建场景）时重挂一次。
      BindAtmosphereUniforms(composite.uniforms, atmosphere);
      // 调试材质（如果已经建过）跟着重挂，否则它还指着上一台大气的靶。
      if (this.screenUniforms) BindAtmosphereUniforms(this.screenUniforms, atmosphere);
      this.bound = atmosphere;
    }
    // **Prepare 跑在 Enabled 之前，关掉的那一帧也会进来** —— 这里正是关掉时
    // 把合成 pass 的大气透视摘干净的地方。不摘的话：LUT 不再更新，而合成
    // 仍按 blend 混一张冻在上一帧的散射图，表现是「关了开关雾色还跟着走」。
    if (atmosphere) {
      const on = this.Enabled(ctx);
      atmosphere.aerialUniforms.uAtmoAerialBlend.value = on ? (atmosphere.preset.aerialBlend ?? 0) : 0;
      atmosphere.aerialUniforms.uAtmoAerialMode.value = on && atmosphere.preset.aerialMode ? 1 : 0;
    }
  }

  Enabled(ctx) {
    return !!(ctx.preset.atmosphere && activeAtmosphere && activeAtmosphere.renderer
      && activeAtmosphere.sampleUniforms.uAtmoEnabled.value > 0.5);
  }

  Resize() { /* LUT 尺寸只跟画质档走，不跟屏幕走 */ }

  Render(ctx) {
    const atmosphere = activeAtmosphere;
    if (!atmosphere) return;
    this._camPos.setFromMatrixPosition(ctx.invView);
    atmosphere.SetViewAltitude(this._camPos.y);
    if (atmosphere.staticDirty) atmosphere.RenderStatic();
    atmosphere.RenderSkyView();
    atmosphere.RenderAerial(ctx.invView, ctx.projScale, ctx.viewProjection);
  }

  Dispose() {
    this.bound = null;
    if (this.screenMaterial) this.screenMaterial.dispose();
    this.screenMaterial = null;
  }
}

/**
 * 屏幕空间大气透视的展示 pass（Debug Rendering 的「大气透视 散射 / 透过率」）。
 * 拿预通道的线性视深重建世界坐标，再走一遍 `AerialPerspective()` —— 与合成
 * pass 问的是同一个函数、同一批 uniform，所以这张图能证明 froxel 真的对上了像素。
 */
const FRAG_AERIAL_VIEW = AERIAL_PERSPECTIVE_GLSL + /* glsl */`
uniform sampler2D uNormalDepth;
uniform mat4 uInvView;
uniform vec2 uProjScale;
uniform float uAtmoDebugMode;   // 0 = 散射，1 = 透过率
varying vec2 vUv;
vec3 AtmoDebugSrgb(vec3 c) { return pow(max(c, vec3(0.0)), vec3(1.0 / 2.2)); }
void main() {
  vec4 nd = texture2D(uNormalDepth, vUv);
  if (nd.w <= 0.0) {                       // 天空：不吃大气透视，画成深蓝底
    gl_FragColor = vec4(0.05, 0.09, 0.20, 1.0);
    return;
  }
  vec2 ndc = vUv * 2.0 - 1.0;
  vec3 viewPos = vec3(ndc.x / max(uProjScale.x, 1e-4), ndc.y / max(uProjScale.y, 1e-4), -1.0) * nd.w;
  vec3 worldPos = (uInvView * vec4(viewPos, 1.0)).xyz;
  vec4 aerial = AerialPerspective(worldPos);
  vec3 color;
  if (uAtmoDebugMode < 0.5) {
    color = AtmoDebugSrgb(aerial.rgb / (aerial.rgb + vec3(1.0)));   // Reinhard
  } else {
    // 透过率：1 = 全通（白），0 = 全挡。假彩色让 0.9—1.0 那一段也读得出来。
    float t = clamp(aerial.a, 0.0, 1.0);
    color = mix(vec3(1.0, 0.63, 0.04), vec3(0.015, 0.035, 0.18), t);
    color = AtmoDebugSrgb(color);
  }
  gl_FragColor = vec4(color, 1.0);
}
`;

/**
 * 大气关着时绑的 1×1 占位：散射 0、透过率 1 —— 采样出来精确等于恒等，
 * 一个比特都不改画面。整页共用一张（每个 pass 各建一张就是白占纹理槽）。
 */
let neutralAerial = null;
function NeutralAerialTexture() {
  if (neutralAerial) return neutralAerial;
  const texture = new THREE.DataTexture(
    new Uint8Array([0, 0, 0, 255]), 1, 1, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.colorSpace = THREE.NoColorSpace;
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  neutralAerial = texture;
  return texture;
}

/**
 * 把大气透视那一批 uniform 挂到别的 pass 的 uniform 表上（合成 pass 用）。
 * **必须共享同一批对象** —— 拷值的话换预设/换帧时那一边就停在旧数上。
 * atmosphere 为 null 时挂一份中性占位（散射 0、透过率 1 = 恒等），
 * 这样即使大气整个关掉，着色器也不用重编译。
 */
export function BindAtmosphereUniforms(uniforms, atmosphere) {
  if (atmosphere) {
    for (const key of Object.keys(atmosphere.aerialUniforms)) {
      uniforms[key] = atmosphere.aerialUniforms[key];
    }
    return uniforms;
  }
  uniforms.uAtmoAerial = { value: NeutralAerialTexture() };
  uniforms.uAtmoAerialSize = { value: new THREE.Vector3(1, 1, 1) };
  uniforms.uAtmoAerialFarM = { value: 4000 };
  uniforms.uAtmoViewProj = { value: new THREE.Matrix4() };
  uniforms.uAtmoCamPos = { value: new THREE.Vector3() };
  uniforms.uAtmoAerialTint = { value: new THREE.Vector3(1, 1, 1) };
  uniforms.uAtmoAerialGain = { value: 1 };
  uniforms.uAtmoAerialBlend = { value: 0 };
  uniforms.uAtmoAerialMode = { value: 0 };
  uniforms.uVolumetricFarTransmittance = { value: 1 };
  return uniforms;
}
