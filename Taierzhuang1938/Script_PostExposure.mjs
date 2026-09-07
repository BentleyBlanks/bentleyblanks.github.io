// 《台儿庄：血战滕县》**物理相机曝光**：直方图自动曝光 + 色调映射曲线库。
//
// 帧图位置：`taa` 之后、`bloom` 之前（泛光阈值要读本帧的增益）。产物是一张
// **1×1 RGBA16F**：R = 曝光增益（合成 pass 的 `uExposureTex`）、G = 当前 EV100、
// B = 目标 EV100、A = 本帧测得的平均 log2 场景亮度。
//
// ## 为什么整条链一次 readback 都没有
// `readRenderTargetPixels`（同步版）是 GPU 同步点，每帧调一次直接掉到 20fps
// （docs 的坑里写着）。所以百分位、EV 换算、时域适应**全部在 GPU 上算**，
// 状态用 1×1 的 ping-pong 靶在帧之间传。JS 侧只写 uniform，一个像素都不读。
// （`ReadState()` 存在，但它只给标定工具和验收断言用，不在渲染路径上。）
//
// ## 四趟（都极小）
//   1. `lum`   全屏 → 160×90 R=log2(luminance)。2×2 盒式抽样。
//   2. `hist`  14400 个**点图元**，顶点着色器 texelFetch 亮度→算桶号→
//              gl_Position 落到 (bucket, row) 那一格，加法混合累计。
//              64×16 而不是 64×1：半浮点只能精确表示到 2048 的整数，
//              14400 个点全落一个桶时会溢出精度；分 16 行后单格最多 900。
//   3. `bins`  列归约成 64×1 的**归一化频度**（除以总像素数）。
//   4. `state` 1×1：百分位平均 → EV100 → 钳位 → 时域适应 → 增益。
//
// 口径、常数与出处全部在 `Data_Tuning_Camera.mjs`。
//
// ## GLSL ES 3.00 保留字
// `sample` / `filter` / `input` / `output` / `patch` / `resource` / `active` /
// `common` / `partition` 一个都不许当标识符。这个文件里用 `texel` / `bucket` /
// `weight` / `binValue`。编译失败 three 只在控制台留一行，那一趟什么都不画 ——
// 所以 `Script_ExposureTest` 每一趟都读回像素验证。

import * as THREE from "three";
import {
  MakeFullscreenMaterial, MakeRenderTarget, GLSL_COMMON, VERT_QUAD, QUAD_CAMERA,
} from "./Script_PostCommon.mjs";
import { AUTO_EXPOSURE, SkyExposureFor } from "./Data_Tuning_Camera.mjs";

// ===========================================================================
// 色调映射曲线库（GLSL + JS 镜像）
//
// GLSL 由 Script_PostComposite 的 SEGMENT exposure 引用；JS 镜像用来数值求解
// 「中灰补偿 EV」，并给验收断言当独立 oracle。两份必须是同一条曲线 ——
// 所以放在同一个文件里，改一处另一处立刻在眼前。
// ===========================================================================

/** ACES（Stephen Hill 拟合）+ AgX（Sobotka，对齐 three r185 的 AgXToneMapping）。 */
export const TONEMAP_GLSL = /* glsl */`
vec3 AcesFitted(vec3 x) {
  // Stephen Hill 的 ACES 拟合（比 Narkowicz 版在高光处更不容易偏色）
  const mat3 IN = mat3(
    0.59719, 0.07600, 0.02840,
    0.35458, 0.90834, 0.13383,
    0.04823, 0.01566, 0.83777);
  const mat3 OUT = mat3(
     1.60475, -0.10208, -0.00327,
    -0.53108,  1.10813, -0.07276,
    -0.07367, -0.00605,  1.07602);
  vec3 v = IN * x;
  vec3 a = v * (v + 0.0245786) - 0.000090537;
  vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
  return clamp(OUT * (a / b), 0.0, 1.0);
}

// AgX（Troy Sobotka；这里逐系数对齐 three r185 的 tonemapping chunk，
// 免得将来换用内置 tonemapping 时观感突变）。曝光已经在前面乘过，
// 所以不再乘 toneMappingExposure。
vec3 AgxContrastApprox(vec3 x) {
  vec3 x2 = x * x;
  vec3 x4 = x2 * x2;
  return 15.5 * x4 * x2 - 40.14 * x4 * x + 31.96 * x4
    - 6.868 * x2 * x + 0.4298 * x2 + 0.1191 * x - 0.00232;
}

vec3 AgxTonemap(vec3 color) {
  const mat3 SRGB_TO_REC2020 = mat3(
    0.6274, 0.0691, 0.0164,
    0.3293, 0.9195, 0.0880,
    0.0433, 0.0113, 0.8956);
  const mat3 REC2020_TO_SRGB = mat3(
     1.6605, -0.1246, -0.0182,
    -0.5876,  1.1329, -0.1006,
    -0.0728, -0.0083,  1.1187);
  const mat3 AGX_INSET = mat3(
    0.856627153315983, 0.137318972929847, 0.11189821299995,
    0.0951212405381588, 0.761241990602591, 0.0767994186031903,
    0.0482516061458583, 0.101439036467562, 0.811302368396859);
  const mat3 AGX_OUTSET = mat3(
     1.1271005818144368, -0.1413297634984383, -0.14132976349843826,
    -0.11060664309660323, 1.157823702216272, -0.11060664309660294,
    -0.016493938717834573, -0.016493938717834257, 1.2519364065950405);
  const float AGX_MIN_EV = -12.47393;
  const float AGX_MAX_EV = 4.026069;
  vec3 c = SRGB_TO_REC2020 * max(color, vec3(0.0));
  c = AGX_INSET * c;
  c = log2(max(c, vec3(1e-10)));
  c = clamp((c - AGX_MIN_EV) / (AGX_MAX_EV - AGX_MIN_EV), 0.0, 1.0);
  c = AgxContrastApprox(c);
  c = AGX_OUTSET * c;
  c = pow(max(c, vec3(0.0)), vec3(2.2));
  c = REC2020_TO_SRGB * c;
  return clamp(c, 0.0, 1.0);
}

/** mode: 0 = ACES（默认，与既有画面逐比特一致），1 = AgX。 */
vec3 ApplyTonemap(vec3 color, float mode) {
  if (mode < 0.5) return AcesFitted(color);
  return AgxTonemap(color);
}
`;

// --- JS 镜像（中灰求解 + 验收 oracle）--------------------------------------

/** 与 GLSL 的 mat3(列0, 列1, 列2) 同序：m = [c0r0,c0r1,c0r2, c1r0,…]。 */
function Mat3Apply(m, v) {
  return [
    m[0] * v[0] + m[3] * v[1] + m[6] * v[2],
    m[1] * v[0] + m[4] * v[1] + m[7] * v[2],
    m[2] * v[0] + m[5] * v[1] + m[8] * v[2],
  ];
}

const ACES_IN = [0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777];
const ACES_OUT = [1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602];

/** ACES Hill 的 JS 镜像（逐系数对着 TONEMAP_GLSL 抄）。 */
export function AcesFittedJs(rgb) {
  const v = Mat3Apply(ACES_IN, rgb);
  const t = v.map((x) => {
    const a = x * (x + 0.0245786) - 0.000090537;
    const b = x * (0.983729 * x + 0.432951) + 0.238081;
    return a / b;
  });
  return Mat3Apply(ACES_OUT, t).map((x) => Math.min(1, Math.max(0, x)));
}

const SRGB_TO_REC2020 = [0.6274, 0.0691, 0.0164, 0.3293, 0.9195, 0.0880, 0.0433, 0.0113, 0.8956];
const REC2020_TO_SRGB = [1.6605, -0.1246, -0.0182, -0.5876, 1.1329, -0.1006, -0.0728, -0.0083, 1.1187];
const AGX_INSET = [0.856627153315983, 0.137318972929847, 0.11189821299995,
  0.0951212405381588, 0.761241990602591, 0.0767994186031903,
  0.0482516061458583, 0.101439036467562, 0.811302368396859];
const AGX_OUTSET = [1.1271005818144368, -0.1413297634984383, -0.14132976349843826,
  -0.11060664309660323, 1.157823702216272, -0.11060664309660294,
  -0.016493938717834573, -0.016493938717834257, 1.2519364065950405];

/** AgX 的 JS 镜像。 */
export function AgxTonemapJs(rgb) {
  let c = Mat3Apply(SRGB_TO_REC2020, rgb.map((x) => Math.max(0, x)));
  c = Mat3Apply(AGX_INSET, c);
  c = c.map((x) => {
    const l = Math.log2(Math.max(x, 1e-10));
    const t = Math.min(1, Math.max(0, (l + 12.47393) / (4.026069 + 12.47393)));
    const t2 = t * t;
    const t4 = t2 * t2;
    return 15.5 * t4 * t2 - 40.14 * t4 * t + 31.96 * t4
      - 6.868 * t2 * t + 0.4298 * t2 + 0.1191 * t - 0.00232;
  });
  c = Mat3Apply(AGX_OUTSET, c);
  c = c.map((x) => Math.pow(Math.max(0, x), 2.2));
  return Mat3Apply(REC2020_TO_SRGB, c).map((x) => Math.min(1, Math.max(0, x)));
}

export const TONEMAP_JS = { aces: AcesFittedJs, agx: AgxTonemapJs };

/** 中灰常数：18% 灰。整条曝光标定绕着它转。 */
export const MID_GREY = 0.18;

/**
 * 「中灰补偿 EV」：把物理曝光公式 `exposure = 1/(1.2 · 2^EV100)`
 * （Frostbite 的 maxLuminance 形式）校正到「中灰进、中灰出」。
 *
 * 物理公式给的是「什么亮度会被映射成白」，而每条 tonemap 曲线把中灰放在
 * 不同的位置上：ACES Hill 直出会把 0.18 压到 0.045（sRGB 60，明显偏暗）。
 * 这里数值求解 tonemap(x) = 0.18 得到需要的曝光，再反解补偿量：
 *     comp = EV100(0.18) + log2(1.2 · x / 0.18)
 * ACES 解出来约 +1.337 EV。
 *
 * **它只影响 absolute 模式**：anchored 模式的增益是 2^(evCal − evNow)，
 * 补偿量在比值里约掉了。
 */
function SolveMidGreyEv(tonemapFn) {
  const Grey = (x) => tonemapFn([x, x, x])[0];
  let lo = 1e-4;
  let hi = 4.0;
  for (let i = 0; i < 60; i += 1) {
    const mid = 0.5 * (lo + hi);
    if (Grey(mid) < MID_GREY) lo = mid; else hi = mid;
  }
  const x = 0.5 * (lo + hi);
  const ev100 = Math.log2(MID_GREY * 100 / AUTO_EXPOSURE.calibrationK);
  return ev100 + Math.log2(1.2 * (x / MID_GREY));
}

/** 每条曲线的中灰补偿 EV（模块加载时求解一次，不写死数字）。 */
export const MID_GREY_EV = {
  aces: SolveMidGreyEv(AcesFittedJs),
  agx: SolveMidGreyEv(AgxTonemapJs),
};

/** `EV100 = log2(L·100/K)` 里的常数项。anchored 模式下它在比值里约掉。 */
export const EV_LOG_OFFSET = Math.log2(100 / AUTO_EXPOSURE.calibrationK);

/**
 * 绝对物理曝光模式下的锚点 EV：让 `options.exposure` 这个手调常数恰好
 * 等于物理公式在 evCal 处给出的曝光。
 */
export function AbsoluteAnchorEv(presetExposure, tonemap = "aces") {
  const e = Math.max(1e-4, presetExposure || 1);
  return (MID_GREY_EV[tonemap] ?? MID_GREY_EV.aces) - Math.log2(1.2 * e);
}

// ===========================================================================
// 着色器
// ===========================================================================

const BINS = AUTO_EXPOSURE.bins;
const ROWS = AUTO_EXPOSURE.rows;
/**
 * 桶格：以 log2(0.18) 为第 `midGreyBin` 号桶的**桶心**往两边等距铺开。
 * 中灰因此完全不吃直方图的量化偏移 —— 「喂一张 0.18 灰，输出必须是中灰」
 * 这条标定链是精确的，不是「差不多」。
 */
export const HISTOGRAM_GRID = {
  binWidth: AUTO_EXPOSURE.binWidth,
  minLog: Math.log2(0.18) - AUTO_EXPOSURE.midGreyBin * AUTO_EXPOSURE.binWidth,
  get maxLog() { return this.minLog + this.binWidth * (BINS - 1); },
};
const MIN_LOG = HISTOGRAM_GRID.minLog;
const BIN_WIDTH = HISTOGRAM_GRID.binWidth;

const FRAG_LUMINANCE = /* glsl */`
uniform sampler2D uSource;
uniform vec2 uSourceTexel;
uniform float uSpread;
varying vec2 vUv;
${GLSL_COMMON}
void main() {
  // 2×2 盒式：单抽样会让统计对一两个高频亮点过敏（走过树影就跳一档）。
  // 抽样点仍然远稀于全屏 —— 直方图是统计量，欠采样不引入系统偏差。
  vec3 acc = vec3(0.0);
  for (int y = 0; y < 2; y++) {
    for (int x = 0; x < 2; x++) {
      vec2 offset = (vec2(float(x), float(y)) - 0.5) * uSourceTexel * uSpread;
      acc += max(texture2D(uSource, vUv + offset).rgb, vec3(0.0));
    }
  }
  float luminance = max(Luma(acc * 0.25), 1e-8);
  gl_FragColor = vec4(log2(luminance), 0.0, 0.0, 1.0);
}
`;

// 直方图：一个降采样像素 = 一个点图元。顶点着色器读亮度、算桶号，
// 把点落到 (bucket, row) 那一格；加法混合把计数累上去。
const VERT_HISTOGRAM = /* glsl */`
uniform sampler2D uLum;
uniform vec2 uLumSize;
uniform float uMinLog;
uniform float uBinWidth;
uniform float uCenterWeight;
varying float vWeight;
void main() {
  // position = (texelX, texelY, rowIndex)，由 CPU 一次性摆好
  ivec2 texel = ivec2(position.xy);
  float logLuminance = texelFetch(uLum, texel, 0).r;
  float bucket = clamp(floor((logLuminance - uMinLog) / uBinWidth + 0.5),
                       0.0, ${(BINS - 1).toFixed(1)});
  // 落到格心：viewport 宽 = bins 时，NDC 换算后正好是像素 (bucket, row) 的中心
  gl_Position = vec4((bucket + 0.5) / ${BINS.toFixed(1)} * 2.0 - 1.0,
                     (position.z + 0.5) / ${ROWS.toFixed(1)} * 2.0 - 1.0, 0.0, 1.0);
  gl_PointSize = 1.0;
  // 中心加权测光：uCenterWeight = 0 时权重精确为 1.0，桶和 = 降采样像素数
  vec2 d = (vec2(texel) + 0.5) / uLumSize - 0.5;
  vWeight = 1.0 - uCenterWeight * clamp(dot(d, d) * 4.0, 0.0, 1.0);
}
`;

const FRAG_HISTOGRAM = /* glsl */`
varying float vWeight;
void main() {
  gl_FragColor = vec4(vWeight, 0.0, 0.0, 1.0);
}
`;

// 列归约：把 rows 行加起来并归一化成频度（除以总像素数）。
// 归一化不是可有可无：半浮点在 14400 那个量级上 ulp 已经是 8，
// 存计数会让「桶和 = 像素数」这条断言自己先破。
const FRAG_HISTOGRAM_ROWS = /* glsl */`
uniform sampler2D uHistogram;
uniform float uInvTotal;
varying vec2 vUv;
void main() {
  int bucket = int(floor(vUv.x * ${BINS.toFixed(1)}));
  float total = 0.0;
  for (int row = 0; row < ${ROWS}; row++) {
    total += texelFetch(uHistogram, ivec2(bucket, row), 0).r;
  }
  gl_FragColor = vec4(total * uInvTotal, 0.0, 0.0, 1.0);
}
`;

// 1×1：百分位平均 → EV100 → 钳位 → 时域适应 → 增益。
const FRAG_EXPOSURE_STATE = /* glsl */`
uniform sampler2D uBins;
uniform sampler2D uPrevious;
uniform float uMinLog;
uniform float uBinWidth;
uniform float uLowPercent;
uniform float uHighPercent;
uniform float uLogOffset;      // log2(100 / K)
uniform float uEvAnchor;       // 锚点 EV100（anchored = 实测标定；absolute = 由 preset.exposure 反推）
uniform float uEvBias;         // 曝光补偿（EV，正 = 更亮）
uniform float uEvUp;           // 允许提亮的上限（EV）
uniform float uEvDown;         // 允许压暗的上限（EV）
uniform float uSpeedUp;
uniform float uSpeedDown;
uniform float uDt;
uniform float uSnap;           // 1 = 直接吸附目标（复位/换关/首帧）
uniform float uNeutral;        // 1 = 只测量不作用（没有标定数据时的兜底）
uniform float uGainMin;
uniform float uGainMax;
varying vec2 vUv;
void main() {
  float total = 0.0;
  for (int i = 0; i < ${BINS}; i++) total += texelFetch(uBins, ivec2(i, 0), 0).r;
  float low = total * uLowPercent;
  float high = total * uHighPercent;
  float running = 0.0;
  float weighted = 0.0;
  float used = 0.0;
  for (int i = 0; i < ${BINS}; i++) {
    float binValue = texelFetch(uBins, ivec2(i, 0), 0).r;
    float lo = running;
    float hi = running + binValue;
    running = hi;
    // 只取落在 [low, high] 百分位区间内的那一部分（UE 的 outlier 剔除）
    float take = max(0.0, min(hi, high) - max(lo, low));
    float logLuminance = uMinLog + float(i) * uBinWidth;
    weighted += logLuminance * take;
    used += take;
  }
  float avgLog = used > 1e-7 ? weighted / used : uMinLog;

  float evScene = avgLog + uLogOffset;
  float evTarget = clamp(evScene - uEvBias, uEvAnchor - uEvUp, uEvAnchor + uEvDown);

  vec4 previous = texture2D(uPrevious, vec2(0.5));
  float ev = evTarget;
  if (uSnap < 0.5) {
    // 暗→亮（EV 升）比亮→暗快：瞳孔收缩远快于暗适应（UE 默认 3.0 / 1.0）
    float speed = evTarget > previous.g ? uSpeedUp : uSpeedDown;
    ev = evTarget + (previous.g - evTarget) * exp(-uDt * speed);
  }
  float gain = clamp(exp2(uEvAnchor - ev), uGainMin, uGainMax);
  if (uNeutral > 0.5) gain = 1.0;
  gl_FragColor = vec4(gain, ev, evTarget, avgLog);
}
`;

// ---------------------------------------------------------------------------
// 调试视图：直方图条 + 当前/目标 EV 的数字叠加
//
// 数字是**在着色器里画的**：一个 3×5 的位图字体，每个字形 15 位塞进一个 int。
// 不用 DOM 叠加，因为这张图要能被 `Script_ShotTest` / playwright 直接截下来
// 当证据 —— DOM 那一层在截图里是另一套坐标，对不上画面。
// ---------------------------------------------------------------------------
const FRAG_EXPOSURE_VIEW = /* glsl */`
uniform sampler2D uLdr;
uniform sampler2D uBins;
uniform sampler2D uState;
uniform float uMinLog;
uniform float uLogRange;
uniform float uLogOffset;
uniform float uTotalPixels;
uniform float uAspect;
varying vec2 vUv;

// 0-9 与 '-'、'.'：3×5 点阵，位序 = row*3 + col（col 0 在左，row 0 在上）
const int GLYPHS[12] = int[12](31599, 29850, 29671, 31207, 18925, 31183,
                               31695, 18727, 31727, 31215, 448, 8192);

float GlyphPixel(vec2 p, int glyph) {
  if (p.x < 0.0 || p.x >= 1.0 || p.y < 0.0 || p.y >= 1.0) return 0.0;
  int col = int(p.x * 3.0);
  int row = int((1.0 - p.y) * 5.0);
  return float((glyph >> (row * 3 + col)) & 1);
}

/** 画一个「±dd.dd」。origin 是左下角，cell 是单个字符的尺寸（uv）。 */
float DrawNumber(vec2 uv, vec2 origin, vec2 cell, float value) {
  float ink = 0.0;
  int r = int(floor(clamp(abs(value), 0.0, 99.99) * 100.0 + 0.5));
  int d1 = r / 1000;
  int d2 = (r / 100) - d1 * 10;
  int d4 = (r / 10) - (r / 100) * 10;
  int d5 = r - (r / 10) * 10;
  for (int i = 0; i < 6; i++) {
    int glyph = -1;
    if (i == 0) glyph = value < 0.0 ? 10 : -1;
    else if (i == 1) glyph = d1;
    else if (i == 2) glyph = d2;
    else if (i == 3) glyph = 11;
    else if (i == 4) glyph = d4;
    else glyph = d5;
    if (glyph < 0) continue;
    vec2 local = (uv - origin - vec2(float(i) * cell.x * 1.25, 0.0)) / cell;
    ink = max(ink, GlyphPixel(local, GLYPHS[glyph]));
  }
  return ink;
}

void main() {
  // 底图压到三成半：既看得见画面，直方图又读得清
  vec3 color = texture2D(uLdr, vUv).rgb * 0.35;
  vec4 state = texture2D(uState, vec2(0.5));

  const vec2 PANEL_MIN = vec2(0.030, 0.050);
  const vec2 PANEL_MAX = vec2(0.560, 0.300);
  if (all(greaterThan(vUv, PANEL_MIN)) && all(lessThan(vUv, PANEL_MAX))) {
    vec2 t = (vUv - PANEL_MIN) / (PANEL_MAX - PANEL_MIN);
    color = mix(color, vec3(0.02, 0.025, 0.035), 0.82);
    int bucket = int(t.x * ${BINS.toFixed(1)});
    float binValue = texelFetch(uBins, ivec2(bucket, 0), 0).r;
    // 对数纵轴：线性纵轴上大片天空会把一根柱顶到天花板，其余全趴在底噪里
    float height = clamp(log2(1.0 + binValue * uTotalPixels)
      / log2(1.0 + uTotalPixels), 0.0, 1.0);
    if (t.y < height) {
      // 柱色 = 该桶代表的亮度本身（左黑右白），横轴一眼就是亮度轴
      float shade = pow(t.x, 0.85);
      color = mix(color, vec3(0.35 + shade * 0.65), 0.92);
    }
    // 当前 EV（青）与目标 EV（橙）的竖线。EV → 桶位要减掉 log2(100/K)。
    float evNow = (state.g - uLogOffset - uMinLog) / uLogRange;
    float evTarget = (state.b - uLogOffset - uMinLog) / uLogRange;
    float lineWidth = 0.5 / (PANEL_MAX.x - PANEL_MIN.x) / ${BINS.toFixed(1)};
    if (abs(t.x - evNow) < lineWidth * 1.5) color = vec3(0.20, 0.95, 0.90);
    if (abs(t.x - evTarget) < lineWidth) color = vec3(1.00, 0.62, 0.10);
  }

  // 数字（屏幕坐标 y 向上，所以列出来是从下往上）：
  //   最下行 = 当前 EV（青，与直方图里那条青线同色）
  //   中间行 = 目标 EV（橙，同橙线）
  //   最上行 = 曝光增益（白）—— 1.00 就是「跟关掉一模一样」
  vec2 cell = vec2(0.011 / max(uAspect / 1.7778, 0.35), 0.026);
  float inkNow = DrawNumber(vUv, vec2(0.034, 0.330), cell, state.g);
  float inkTarget = DrawNumber(vUv, vec2(0.034, 0.366), cell, state.b);
  float inkGain = DrawNumber(vUv, vec2(0.034, 0.402), cell, state.r);
  color = mix(color, vec3(0.20, 0.95, 0.90), inkNow);
  color = mix(color, vec3(1.00, 0.62, 0.10), inkTarget);
  color = mix(color, vec3(1.00, 1.00, 1.00), inkGain);

  gl_FragColor = vec4(color, 1.0);
}
`;

/** 自动曝光关着时绑的 1×1 纯白：`.r` 精确等于 1.0，一个比特都不改。 */
export function MakeWhitePixel() {
  const texture = new THREE.DataTexture(
    new Uint8Array([255, 255, 255, 255]), 1, 1, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.colorSpace = THREE.NoColorSpace;
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

/** 半浮点位模式 → float（读回 RGBA16F 靶时用；与 PostFrameGraphTest 同一份口径）。 */
export function HalfToFloat(bits) {
  const sign = (bits >> 15) & 1 ? -1 : 1;
  const exponent = (bits >> 10) & 0x1f;
  const mantissa = bits & 0x3ff;
  if (exponent === 0) return sign * Math.pow(2, -14) * (mantissa / 1024);
  if (exponent === 31) return mantissa ? NaN : sign * Infinity;
  return sign * Math.pow(2, exponent - 15) * (1 + mantissa / 1024);
}

export class ExposurePass {
  constructor(pipeline) {
    this.name = "exposure";
    this.pipeline = pipeline;
    this.whitePixel = MakeWhitePixel();
    this.active = false;             // 本帧真的跑过（Texture 取值器按它选）
    this.snapFrames = AUTO_EXPOSURE.snapFrames;
    this.skyName = null;
    this.anchorKey = null;           // 关卡 id（逐关锚点优先于时段预设）
    this.anchorOverride = null;      // 测试/工具直接摆一份锚点
    this.anchor = SkyExposureFor(null);
    this.mode = "anchored";          // "anchored" | "absolute"
    this.tonemap = "aces";
    this.userBiasEv = 0;             // 画质面板的曝光补偿，叠在预设的 evBias 上

    const A = AUTO_EXPOSURE;
    const NEAREST = { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter };
    this.lumTarget = MakeRenderTarget(A.lumWidth, A.lumHeight,
      { type: THREE.HalfFloatType, ...NEAREST });
    this.histTarget = MakeRenderTarget(A.bins, A.rows,
      { type: THREE.HalfFloatType, ...NEAREST });
    this.binsTarget = MakeRenderTarget(A.bins, 1,
      { type: THREE.HalfFloatType, ...NEAREST });
    this.stateTargets = [
      MakeRenderTarget(1, 1, { type: THREE.HalfFloatType, ...NEAREST }),
      MakeRenderTarget(1, 1, { type: THREE.HalfFloatType, ...NEAREST }),
    ];
    this.flip = 0;

    this.uniformsLum = {
      uSource: { value: null },
      uSourceTexel: { value: new THREE.Vector2(1, 1) },
      uSpread: { value: A.lumTaps },
    };
    this.matLum = MakeFullscreenMaterial(FRAG_LUMINANCE, this.uniformsLum);

    this.uniformsHistogram = {
      uLum: { value: this.lumTarget.texture },
      uLumSize: { value: new THREE.Vector2(A.lumWidth, A.lumHeight) },
      uMinLog: { value: MIN_LOG },
      uBinWidth: { value: BIN_WIDTH },
      uCenterWeight: { value: A.centerWeight },
    };
    this.matHistogram = new THREE.ShaderMaterial({
      uniforms: this.uniformsHistogram,
      vertexShader: VERT_HISTOGRAM,
      fragmentShader: FRAG_HISTOGRAM,
      depthTest: false,
      depthWrite: false,
      transparent: true,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
      blendSrcAlpha: THREE.OneFactor,
      blendDstAlpha: THREE.OneFactor,
    });
    this.points = this._MakePoints();
    this.pointScene = new THREE.Scene();
    this.pointScene.add(this.points);

    this.uniformsRows = {
      uHistogram: { value: this.histTarget.texture },
      uInvTotal: { value: 1 / (A.lumWidth * A.lumHeight) },
    };
    this.matRows = MakeFullscreenMaterial(FRAG_HISTOGRAM_ROWS, this.uniformsRows);

    this.uniformsState = {
      uBins: { value: this.binsTarget.texture },
      uPrevious: { value: this.stateTargets[1].texture },
      uMinLog: { value: MIN_LOG },
      uBinWidth: { value: BIN_WIDTH },
      uLowPercent: { value: A.lowPercent },
      uHighPercent: { value: A.highPercent },
      uLogOffset: { value: EV_LOG_OFFSET },
      uEvAnchor: { value: 0 },
      uEvBias: { value: 0 },
      uEvUp: { value: 1.5 },
      uEvDown: { value: 1.5 },
      uSpeedUp: { value: A.speedUp },
      uSpeedDown: { value: A.speedDown },
      uDt: { value: 1 / 60 },
      uSnap: { value: 1 },
      uNeutral: { value: 0 },
      uGainMin: { value: A.gainMin },
      uGainMax: { value: A.gainMax },
    };
    this.matState = MakeFullscreenMaterial(FRAG_EXPOSURE_STATE, this.uniformsState);

    this.uniformsView = {
      uLdr: { value: null },
      uBins: { value: this.binsTarget.texture },
      uState: { value: this.stateTargets[0].texture },
      uMinLog: { value: MIN_LOG },
      uLogRange: { value: BIN_WIDTH * (AUTO_EXPOSURE.bins - 1) },
      uLogOffset: { value: EV_LOG_OFFSET },
      uTotalPixels: { value: A.lumWidth * A.lumHeight },
      uAspect: { value: 16 / 9 },
    };
    this.materialView = MakeFullscreenMaterial(FRAG_EXPOSURE_VIEW, this.uniformsView);

    this._clearColor = new THREE.Color();
    void VERT_QUAD;
  }

  /** Debug Rendering 面板的「曝光直方图」视图（见 Script_PostDebug 的 extraViews）。 */
  RegisterDebugViews(debugPass) {
    debugPass.RegisterView("exposure", (pipeline) => ({
      material: this.materialView,
      unavailable: !this.active,
      Prepare: (ctx) => {
        this.uniformsView.uLdr.value = pipeline.targets.ldr.texture;
        this.uniformsView.uState.value = this.stateTargets[this.flip].texture;
        this.uniformsView.uAspect.value = ctx.width / Math.max(1, ctx.height);
      },
    }));
  }

  _MakePoints() {
    const A = AUTO_EXPOSURE;
    const count = A.lumWidth * A.lumHeight;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      positions[i * 3] = i % A.lumWidth;
      positions[i * 3 + 1] = Math.floor(i / A.lumWidth);
      // 行号按序号轮转：同一个桶里的点被摊到 rows 行上，单格不溢出半浮点整数域
      positions[i * 3 + 2] = i % A.rows;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const points = new THREE.Points(geometry, this.matHistogram);
    points.frustumCulled = false;
    points.matrixAutoUpdate = false;
    return points;
  }

  /** 合成 / 泛光实际绑的那张图：没在跑就是纯白（乘出来精确等于 1.0）。 */
  get Texture() {
    return this.active ? this.stateTargets[this.flip].texture : this.whitePixel;
  }

  /** 直方图、亮度图与状态（调试视图 / 断言用）。 */
  get HistogramTexture() { return this.binsTarget.texture; }
  get LuminanceTexture() { return this.lumTarget.texture; }
  get StateTexture() { return this.stateTargets[this.flip].texture; }

  /** 换关 / 镜头硬切 / 改分辨率：下一帧直接吸附目标，不要慢慢适应过去。 */
  RequestReset() { this.snapFrames = AUTO_EXPOSURE.snapFrames; }

  /** 画质面板的曝光补偿（EV，正 = 更亮）。 */
  SetBiasEv(ev) { this.userBiasEv = Number.isFinite(ev) ? ev : 0; }

  /** "anchored"（默认，保住每张时段预设的意图）/ "absolute"（真物理曝光，验收用）。 */
  SetMode(mode) { this.mode = mode === "absolute" ? "absolute" : "anchored"; }

  SetTonemap(name) { this.tonemap = MID_GREY_EV[name] ? name : "aces"; }

  /** 直接摆一份锚点（标定工具与 ExposureTest 用；传 null 恢复按时段预设查表）。 */
  SetAnchorOverride(anchor) {
    this.anchorOverride = anchor ? { ...SkyExposureFor(null), ...anchor } : null;
    // 立刻生效：验收脚本会绕过 Prepare 直接调 Render，不能等下一帧 Prepare 才装上
    if (this.anchorOverride) this.anchor = this.anchorOverride;
    this.RequestReset();
  }

  Enabled(ctx) {
    // 半浮点靶不可用时整条链没有意义（8 位靶存不下 log 亮度，加法混合也会饱和）
    void ctx;
    return this.pipeline.autoExposureEnabled && this.pipeline.hdrCapable;
  }

  Resize() {
    // 测光靶是固定尺寸（统计量不跟分辨率走），只要在改分辨率后重新吸附一次
    this.RequestReset();
  }

  /**
   * 每帧先于 `Enabled` 跑：`active` 必须在 pass 被跳过时也归位，
   * 否则关掉自动曝光的那一帧合成还绑着上一帧的 1×1
   * （表现是「关了画面还在动」，极难定位）。
   */
  Prepare(ctx) {
    this.active = this.Enabled(ctx);
    if (!this.active) {
      // 关着时保持复位待命：一打开就吸附，不从几分钟前的旧状态爬过来
      this.snapFrames = AUTO_EXPOSURE.snapFrames;
      return;
    }
    const skyName = ctx.options.skyPreset || null;
    const anchorKey = ctx.options.exposureAnchor || null;
    if (skyName !== this.skyName || anchorKey !== this.anchorKey) {
      this.skyName = skyName;
      this.anchorKey = anchorKey;
      this.RequestReset();
    }
    this.anchor = this.anchorOverride || SkyExposureFor(skyName, anchorKey);
  }

  Render(ctx) {
    const renderer = ctx.renderer;

    // --- 1) 亮度降采样 ---------------------------------------------------
    this.uniformsLum.uSource.value = ctx.sceneColor.texture;
    this.uniformsLum.uSourceTexel.value.set(1 / ctx.width, 1 / ctx.height);
    ctx.blitter.Blit(this.matLum, this.lumTarget);

    // --- 2) 点图元直方图 -------------------------------------------------
    // 显式清屏而不是靠 autoClear：这一趟的清屏色必须是 0，
    // 而主场景那一趟刚把清屏色设成黑（或线框底灰）。
    const prevAutoClear = renderer.autoClear;
    const prevAlpha = renderer.getClearAlpha();
    renderer.getClearColor(this._clearColor);
    renderer.setRenderTarget(this.histTarget);
    renderer.setClearColor(0x000000, 0);
    renderer.clear(true, false, false);
    renderer.autoClear = false;
    renderer.render(this.pointScene, QUAD_CAMERA);
    renderer.autoClear = prevAutoClear;
    renderer.setClearColor(this._clearColor, prevAlpha);

    // --- 3) 列归约 → 归一化频度 -----------------------------------------
    ctx.blitter.Blit(this.matRows, this.binsTarget);

    // --- 4) 1×1 状态（百分位 → EV → 适应 → 增益）------------------------
    const U = this.uniformsState;
    const hasCalibration = Number.isFinite(this.anchor.logLum);
    if (this.mode === "absolute") {
      U.uEvAnchor.value = AbsoluteAnchorEv(ctx.options.exposure ?? 1, this.tonemap);
      U.uNeutral.value = 0;
    } else if (hasCalibration) {
      U.uEvAnchor.value = this.anchor.logLum + EV_LOG_OFFSET;
      U.uNeutral.value = 0;
    } else {
      // 没有标定数据（未登记的时段预设、探针页）：只测量不作用。
      // 增益恒 1，画面与关掉自动曝光完全一致；EV 读数照常，标定工具就靠它。
      U.uEvAnchor.value = 0;
      U.uNeutral.value = 1;
    }
    U.uEvBias.value = (this.anchor.evBias ?? 0) + this.userBiasEv;
    U.uEvUp.value = this.anchor.evUp ?? 1.5;
    U.uEvDown.value = this.anchor.evDown ?? 1.5;
    U.uDt.value = Math.min(0.25, Math.max(1 / 240, ctx.options.dt ?? 1 / 60));
    U.uSnap.value = this.snapFrames > 0 ? 1 : 0;
    U.uPrevious.value = this.stateTargets[this.flip].texture;
    this.flip ^= 1;
    ctx.blitter.Blit(this.matState, this.stateTargets[this.flip]);
    if (this.snapFrames > 0) this.snapFrames -= 1;
  }

  /**
   * 读回 1×1 状态。**GPU 同步点，绝不许放进渲染路径** ——
   * 只给标定工具（`Script_ExposureTest --calibrate`）与验收断言用。
   * @returns {{gain:number, ev:number, evTarget:number, avgLog:number}}
   */
  ReadState(renderer) {
    const buffer = new Uint16Array(4);
    renderer.readRenderTargetPixels(this.stateTargets[this.flip], 0, 0, 1, 1, buffer);
    return {
      gain: HalfToFloat(buffer[0]),
      ev: HalfToFloat(buffer[1]),
      evTarget: HalfToFloat(buffer[2]),
      avgLog: HalfToFloat(buffer[3]),
    };
  }

  /** 读回 64 桶归一化频度（验收用；同样是同步点，不进渲染路径）。 */
  ReadHistogram(renderer) {
    const buffer = new Uint16Array(AUTO_EXPOSURE.bins * 4);
    renderer.readRenderTargetPixels(this.binsTarget, 0, 0, AUTO_EXPOSURE.bins, 1, buffer);
    const bins = [];
    for (let i = 0; i < AUTO_EXPOSURE.bins; i += 1) bins.push(HalfToFloat(buffer[i * 4]));
    return bins;
  }

  Dispose() {
    this.lumTarget.dispose();
    this.histTarget.dispose();
    this.binsTarget.dispose();
    for (const target of this.stateTargets) target.dispose();
    this.matLum.dispose();
    this.matHistogram.dispose();
    this.matRows.dispose();
    this.matState.dispose();
    this.materialView.dispose();
    this.points.geometry.dispose();
    this.whitePixel.dispose();
  }
}

export default ExposurePass;
