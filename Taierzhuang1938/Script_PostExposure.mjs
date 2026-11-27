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
import { FLARE_EXPOSURE } from "./Data_Tuning_FlareEffects.mjs";

// 色调映射曲线库（GLSL + JS 镜像）的本体在 Script_ToneMapCurves（零依赖），这里再导出：
// GLSL 由 Script_PostComposite 的 SEGMENT exposure 引用；JS 镜像用来数值求解「中灰补偿 EV」。
import { TONEMAP_GLSL, AcesFittedJs, AgxTonemapJs, TONEMAP_JS } from "./Script_ToneMapCurves.mjs";
export { TONEMAP_GLSL, AcesFittedJs, AgxTonemapJs, TONEMAP_JS };

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
uniform float uTransientWeight;
uniform float uTransientStart;
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
  if(uTransientStart > 0.5) previous.g = uEvAnchor;
  float ev = evTarget;
  if (uSnap < 0.5) {
    // 暗→亮（EV 升）比亮→暗快：瞳孔收缩远快于暗适应（UE 默认 3.0 / 1.0）
    float speed = evTarget > previous.g ? uSpeedUp : uSpeedDown;
    ev = evTarget + (previous.g - evTarget) * exp(-uDt * speed);
  }
  float gain = clamp(exp2(uEvAnchor - ev), uGainMin, uGainMax);
  if (uNeutral > 0.5) gain = mix(1.0,gain,uTransientWeight);
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

// --- 局部色调映射：80×45 可分离宽模糊对数亮度（复用 160×90 lumTarget，零额外主场景采样）----
const FRAG_LOCAL_LUM = /* glsl */`
uniform sampler2D uSource;
uniform vec2 uStep;
varying vec2 vUv;
void main() {
  // 9-tap 可分离宽高斯（步幅 2 纹素，覆盖约 18% 屏宽），平滑提取局部环境光照水平。
  float acc = texture2D(uSource, vUv).r * 0.1758;
  acc += (texture2D(uSource, clamp(vUv + uStep * 1.0, vec2(0.001), vec2(0.999))).r
        + texture2D(uSource, clamp(vUv - uStep * 1.0, vec2(0.001), vec2(0.999))).r) * 0.1583;
  acc += (texture2D(uSource, clamp(vUv + uStep * 2.0, vec2(0.001), vec2(0.999))).r
        + texture2D(uSource, clamp(vUv - uStep * 2.0, vec2(0.001), vec2(0.999))).r) * 0.1194;
  acc += (texture2D(uSource, clamp(vUv + uStep * 3.0, vec2(0.001), vec2(0.999))).r
        + texture2D(uSource, clamp(vUv - uStep * 3.0, vec2(0.001), vec2(0.999))).r) * 0.0754;
  acc += (texture2D(uSource, clamp(vUv + uStep * 4.0, vec2(0.001), vec2(0.999))).r
        + texture2D(uSource, clamp(vUv - uStep * 4.0, vec2(0.001), vec2(0.999))).r) * 0.0590;
  // 纵向 pass 顺手对横向已宽模糊的图做 3×3 全帧均值，写入 .g 作为与自动曝光完全解耦的基准对数亮度。
  float frameAvg = acc;
  if (uStep.y > 0.0) {
    float s = 0.0;
    s += texture2D(uSource, vec2(0.17, 0.20)).r + texture2D(uSource, vec2(0.50, 0.20)).r + texture2D(uSource, vec2(0.83, 0.20)).r;
    s += texture2D(uSource, vec2(0.17, 0.50)).r + texture2D(uSource, vec2(0.50, 0.50)).r + texture2D(uSource, vec2(0.83, 0.50)).r;
    s += texture2D(uSource, vec2(0.17, 0.80)).r + texture2D(uSource, vec2(0.50, 0.80)).r + texture2D(uSource, vec2(0.83, 0.80)).r;
    frameAvg = s * (1.0 / 9.0);
  }
  gl_FragColor = vec4(acc, frameAvg, acc, 1.0);
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
    // 局部色调映射：80×45 线性滤波半浮点靶（约 56 KB 显存），存放空间平滑后的 log2 场景亮度。
    const localW = Math.max(8, A.lumWidth >> 1);
    const localH = Math.max(8, A.lumHeight >> 1);
    this.localLumH = MakeRenderTarget(localW, localH,
      { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    this.localLumV = MakeRenderTarget(localW, localH,
      { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    this.localLumActive = false;
    this.localLumWanted = false;
    this.uniformsLocalLum = {
      uSource: { value: this.lumTarget.texture },
      uStep: { value: new THREE.Vector2(1 / localW, 0) },
    };
    this.matLocalLum = MakeFullscreenMaterial(FRAG_LOCAL_LUM, this.uniformsLocalLum);
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
      uTransientWeight: { value: 0 },
      uTransientStart: { value: 0 },
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

  /**
   * Debug Rendering 面板的「曝光直方图」视图。
   * `DebugPass.RegisterView` 是 `PostPipeline.RegisterDebugView` 的别名 ——
   * 走 `GetSource()` 的第 ③ 条登记路，全管线只有那一张表（口径见 docs §1.11）。
   */
  RegisterDebugViews(debugPass) {
    debugPass.RegisterView("exposure", (pipeline) => ({
      material: this.materialView,
      unavailable: !this.active,
      Prepare: (ctx) => {
        this.uniformsView.uLdr.value = pipeline.targets.ldr.texture;
        this.uniformsView.uState.value = this.stateTargets[this.flip].texture;
        // 直方图叠在**输出**画面上，宽高比要取输出那一组（TAAU 开着时两组不同）。
        this.uniformsView.uAspect.value = ctx.outputWidth / Math.max(1, ctx.outputHeight);
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

  /** 局部色调映射的平滑对数亮度图；未启用时返回纯白（同时 Composite 侧强度为 0）。 */
  get LocalLumTexture() {
    return this.localLumActive ? this.localLumV.texture : this.whitePixel;
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

  _WantAuto() {
    // 半浮点靶不可用时整条链没有意义（8 位靶存不下 log 亮度，加法混合也会饱和）
    return !!(this.pipeline.autoExposureEnabled && this.pipeline.hdrCapable);
  }

  _WantLocal(ctx) {
    return !!(this.pipeline.localTonemapEnabled && this.pipeline.hdrCapable
      && ctx?.preset?.localTonemap !== false && this.pipeline.shadingMode !== "wireframe");
  }

  Enabled(ctx) {
    return this._WantAuto() || this._WantLocal(ctx);
  }

  Idle() {
    this.active = false;
    this.localLumActive = false;
    this.localLumWanted = false;
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
    let flareLit=false;
    if(this.flareSource?.fireSources)for(const source of this.flareSource.fireSources.values()){
      if(source.flareShadow&&source.currentIntensity>0){flareLit=true;break;}
    }
    this.transientStart=flareLit&&!(this.transientWeight>0);
    this.transientWeight=flareLit?1:(this.transientWeight||0)*Math.exp(-Math.max(0,ctx.options.dt??1/60)/FLARE_EXPOSURE.recoveryS);
    if(this.transientWeight<FLARE_EXPOSURE.cutoff)this.transientWeight=0;
    this.active = this._WantAuto();
    this.localLumWanted = this._WantLocal(ctx);
    this.localLumActive = false;
    if (!this.active) {
      // 关着时保持复位待命：一打开就吸附，不从几分钟前的旧状态爬过来
      this.snapFrames = AUTO_EXPOSURE.snapFrames;
      return;
    }
    const skyName = ctx.options.exposureProfile || ctx.options.skyPreset || null;
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
    // **输出分辨率**，不是 `ctx.width/height`：这一趟排在 TAA 之后，
    // TAAU 开着时 sceneColor 已经是解算靶（输出网格）。拿内部分辨率算纹素
    // 会让 2×2 盒式抽样的两个偏移落错格子 —— 测光偏一点点，整帧亮度就偏。
    // 直接问靶自己最稳（ctx.outputWidth 是同一个数，见 FrameContext 字段表）。
    this.uniformsLum.uSourceTexel.value.set(
      1 / ctx.sceneColor.width, 1 / ctx.sceneColor.height);
    ctx.blitter.Blit(this.matLum, this.lumTarget);

    if (this.active) {
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
      U.uTransientWeight.value = !hasCalibration&&this.mode!=="absolute" ? (this.transientWeight||0) : 0;
      U.uTransientStart.value = U.uTransientWeight.value>0&&this.transientStart ? 1 : 0;
      if(U.uTransientWeight.value>0){
        U.uEvAnchor.value=AbsoluteAnchorEv(ctx.options.exposure??1,this.tonemap);
        U.uEvUp.value=0;U.uEvDown.value=FLARE_EXPOSURE.maxDarkEv;
      }
      U.uDt.value = Math.min(0.25, Math.max(1 / 240, ctx.options.dt ?? 1 / 60));
      U.uSnap.value = this.snapFrames > 0 ? 1 : 0;
      U.uPrevious.value = this.stateTargets[this.flip].texture;
      this.flip ^= 1;
      ctx.blitter.Blit(this.matState, this.stateTargets[this.flip]);
      if (this.snapFrames > 0) this.snapFrames -= 1;
    }

    // --- 5) 局部色调映射：可分离宽模糊提取 80×45 局部对数亮度 ----------------
    // 与自动曝光完全解耦：autoExposure 开关往返不影响局部适应图。
    const wantLocal = !!this.localLumWanted;
    this.localLumActive = wantLocal;
    if (wantLocal) {
      this.uniformsLocalLum.uSource.value = this.lumTarget.texture;
      this.uniformsLocalLum.uStep.value.set(2 / this.localLumH.width, 0);
      ctx.blitter.Blit(this.matLocalLum, this.localLumH);
      this.uniformsLocalLum.uSource.value = this.localLumH.texture;
      this.uniformsLocalLum.uStep.value.set(0, 2 / this.localLumV.height);
      ctx.blitter.Blit(this.matLocalLum, this.localLumV);
    }
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
    this.localLumH.dispose();
    this.localLumV.dispose();
    this.histTarget.dispose();
    this.binsTarget.dispose();
    for (const target of this.stateTargets) target.dispose();
    this.matLum.dispose();
    this.matLocalLum.dispose();
    this.matHistogram.dispose();
    this.matRows.dispose();
    this.matState.dispose();
    this.materialView.dispose();
    this.points.geometry.dispose();
    this.whitePixel.dispose();
  }
}

export default ExposurePass;
