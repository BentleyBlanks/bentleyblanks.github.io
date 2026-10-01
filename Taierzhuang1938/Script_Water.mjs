// 《台儿庄：血战滕县》程序化水面 —— 参考 Wave Harmonic 的 Crest（Unity/Godot 海洋系统）
// 的分层思路，裁剪到本作管线能负担的那几层；2026-10-01 第二版按河水重做细节层与合成。
//
// ---------------------------------------------------------------------------
// 取什么、舍什么
//
// 取：
//   1) **Gerstner 波位移**：顶点级三波叠加，振幅按「三月枯水、无风细浪」压到厘米级。
//      法线改在片元里按同一张波表解析算：河水网格横向一格十来米，逐顶点插值的法线
//      会把 4 m 的短波采成十米一块的假起伏。
//   2) **波谱涟漪法线图**（2026-10-01 取代旧的六个正弦）：启动时用 FFT 按幂律波谱
//      （斜率谱每倍频程等能量、低频截断、高频滚降）合成两份互相独立、严格可平铺的
//      斜率场，打进一张 256² RGBA8。片元在 1.3 / 3.3 / 8.6 / 31 m 四个尺度、四个
//      朝向上各采一次，各自顺流漂移 + 自己的传播方向 —— 叠出来的图样随时间变化、
//      重复周期是四个瓦片的公倍数。旧版法线图的基频是 4 m 一个周期、斜率 0.17，
//      近处读出来是一大块一大块的云斑（用户截图 2026-10-01）；真实河面的斜率集中在
//      分米到米级的细涟漪上，长波几乎是平的。
//   3) **阵风斑块**：一层顺流拉长、随水漂走的低频噪声调制涟漪强度 —— 有的地方平得
//      像镜子、照得清对岸，有的地方毛糙发亮。这是河面最像河面的那一层，也顺手把
//      瓦片重复打散（Valve 2010《Water Flow in Portal 2》用噪声扰动打散脉动的同一思路）。
//   4) **屏幕空间水深 → 浑水消光**：PostPipeline 的深度法线预通道（rtNormalDepth.w =
//      线性视深）减去水面视深 = 视线在水里走过的长度，按 Beer–Lambert 求透射率
//     （Unreal Single Layer Water 的吸收 / 散射系数那一套的单标量版本）。浑水一两分米
//      就看不见底：桥船吃水那一截不再透出一条亮带，岸边浅处又自然软化成湿泥。
//   5) **反射**：解析天空（借 SkyDome uniform）打底 → 屏幕里的天空（云、烟柱）→ Hi-Z
//      SSR（对岸、船、桥）。屏幕天空那一层：反射方向在无穷远处投到屏幕上，那一像素
//      若是天空（预通道深度 0），就取上一帧的场景色 —— 一次采样，云和烟柱就进了倒影。
//   6) **预乘 alpha 合成**：反射项不被透明度打折（浅水边照样反光），水体只遮住
//      (1 − F)·T 那一份身后的河床。
//   7) 岸线 / 桥墩 / 船舷的接触泡沫（屏幕空间水深）；护城河与荆河保留浪尖泡沫。
//
// 舍：FFT 实时波浪、flow map、实时平面反射、水下后处理。雾不在这里做：合成 pass 按
// 预通道深度统一上雾（水面对预通道是 skipNormalDepth，雾吃的是它身后河床的深度）。
//
// ---------------------------------------------------------------------------
// 管线契约（改这里之前先读 Script_Post.mjs 的 MarkNoPrepass 注释块）：
//   · 材质 transparent + depthWrite=false → 建完立刻 MarkNoPrepass；
//   · 整片铺开的大面积半透明面必须再挂 userData.skipNormalDepth = true，
//     否则它会拿自己的着色器画进预通道，把水面颜色写进法线、把 alpha 写进
//     「线性视深」—— SSAO 与雾的判据当场作废（天空穹当年就是这么炸的）；
//   · 渲染器 toneMapping=NoToneMapping、输出线性 HDR，tonemap 在 Composite：
//     这里输出的颜色一律是**线性 HDR 辐亮度**（预乘 alpha），不许自己先做 gamma 或 ACES；
//   · 时间与相机相关的共享 uniform 由 UpdateWaterSurfaces() 每帧推一次，
//     调用点是 Script_Main.RenderScene（与 vfx.SetDepthSource 同一批账）。
// ---------------------------------------------------------------------------

import * as THREE from "three";
import { MarkNoPrepass } from "./Script_Post.mjs";
import { BindSsrTraceUniforms, SsrSurfaceBlockGlsl } from "./Script_PostSsr.mjs";

// ---------------------------------------------------------------------------
// 共享 uniform：所有水面材质引用同一批对象，UpdateWaterSurfaces 改一次全生效。
// ---------------------------------------------------------------------------

const sharedUniforms = {
  uTime: { value: 0 },
  uSceneDepth: { value: null },          // PostPipeline.NormalDepthTexture（xyz 法线 / w 线性视深）
  uDepthValid: { value: 0 },             // 深度源还没接上时按深水处理，岸线泡沫静默关闭
  uResolution: { value: new THREE.Vector2(1, 1) },
  // SSR 用：世界 → 视空间。水面在世界空间算光，Hi-Z 追踪在视空间。
  // 放在共享包里而不是逐材质：UpdateWaterSurfaces 每帧写一次就全生效。
  uWaterViewMatrix: { value: new THREE.Matrix4() },
};

// ---------------------------------------------------------------------------
// 涟漪斜率图：FFT 合成的两份独立斜率场（RG = 场 A 的 ∂h/∂x、∂h/∂z，BA = 场 B）。
// 不引入来源不明的外部资产：种子固定，每次启动同一张；256² 两次二维 IFFT 冷启动约 40 ms（只在第一份水面材质建出来时跑一次）。
// 频率都是整数格点，四边连续不露接缝；按单位 RMS 斜率归一，±4σ 编进 8 位。
// ---------------------------------------------------------------------------

const RIPPLE_TEXTURE_SIZE = 256;
const RIPPLE_ENCODE_SIGMA = 4;      // 8 位里装 ±4σ；着色器解码乘回同一个数

function Mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 原地基 2 FFT（正号指数 = 逆变换，不做 1/n 归一 —— 斜率场最后整体按 RMS 归一）。 */
function Fft1d(re, im, n, cosTable, sinTable) {
  for (let i = 1, j = 0; i < n; i += 1) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      let t = re[i]; re[i] = re[j]; re[j] = t;
      t = im[i]; im[i] = im[j]; im[j] = t;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1, stride = n / len;
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < half; k += 1) {
        const cr = cosTable[k * stride], ci = sinTable[k * stride];
        const a = i + k, b = a + half;
        const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti;
        re[a] += tr; im[a] += ti;
      }
    }
  }
}

function Ifft2d(re, im, n) {
  const cosTable = new Float64Array(n / 2), sinTable = new Float64Array(n / 2);
  for (let k = 0; k < n / 2; k += 1) {
    cosTable[k] = Math.cos((2 * Math.PI * k) / n);
    sinTable[k] = Math.sin((2 * Math.PI * k) / n);
  }
  const rowRe = new Float64Array(n), rowIm = new Float64Array(n);
  for (let y = 0; y < n; y += 1) {
    const o = y * n;
    Fft1d(re.subarray(o, o + n), im.subarray(o, o + n), n, cosTable, sinTable);
  }
  for (let x = 0; x < n; x += 1) {
    for (let y = 0; y < n; y += 1) { rowRe[y] = re[y * n + x]; rowIm[y] = im[y * n + x]; }
    Fft1d(rowRe, rowIm, n, cosTable, sinTable);
    for (let y = 0; y < n; y += 1) { re[y * n + x] = rowRe[y]; im[y * n + x] = rowIm[y]; }
  }
}

/**
 * 一份随机斜率场。高度谱 ∝ k⁻⁴（斜率谱每倍频程等能量 —— 细涟漪和长一点的波一样
 * 「有东西」），低频在 2–4 个周期以下截掉（不许出现瓦片尺度的大斑），高频在 k≈60
 * 滚降（离奈奎斯特 128 远一点，小 mip 不起摩尔纹）。方向带一点各向异性（风向）。
 * 返回 { sx, sz }，已归一成单位 RMS（每个分量）。
 */
function RippleSlopeField(n, seed, windAngle, anisotropy) {
  const random = Mulberry32(seed);
  const size = n * n;
  const gRe = new Float64Array(size), gIm = new Float64Array(size);
  const Freq = (i) => (i < n / 2 ? i : i - n);
  const windX = Math.cos(windAngle), windZ = Math.sin(windAngle);
  for (let v = 0; v < n; v += 1) {
    for (let u = 0; u < n; u += 1) {
      const index = v * n + u;
      // Box–Muller 一次出一对高斯数（实部、虚部），先取随机数再判零频，序列与格点一一对应
      const radius = Math.sqrt(-2 * Math.log(Math.max(random(), 1e-12)));
      const angle = 2 * Math.PI * random();
      const fx = Freq(u), fz = Freq(v), k2 = fx * fx + fz * fz;
      if (k2 === 0) continue;
      const k = Math.sqrt(k2);
      const lowCut = Math.min(Math.max((k - 2.0) / 2.0, 0), 1);
      const along = (fx * windX + fz * windZ) / k;
      const spread = 1 - anisotropy + anisotropy * along * along;
      const amplitude = lowCut * lowCut * (3 - 2 * lowCut) * Math.exp(-k2 / 3600) * spread / k2;
      gRe[index] = radius * Math.cos(angle) * amplitude;
      gIm[index] = radius * Math.sin(angle) * amplitude;
    }
  }
  // 厄米对称 H(k) = (G(k) + conj G(−k)) / 2 → 高度与两个斜率都是实场，
  // 于是 Z = i·kx·H + i·(i·kz·H) 一次复 IFFT 同时得到 ∂h/∂x（实部）与 ∂h/∂z（虚部）。
  const zRe = new Float64Array(size), zIm = new Float64Array(size);
  for (let v = 0; v < n; v += 1) {
    for (let u = 0; u < n; u += 1) {
      const index = v * n + u;
      const mirror = ((n - v) % n) * n + ((n - u) % n);
      const hRe = 0.5 * (gRe[index] + gRe[mirror]);
      const hIm = 0.5 * (gIm[index] - gIm[mirror]);
      const fx = Freq(u), fz = Freq(v);
      zRe[index] = -fx * hIm - fz * hRe;
      zIm[index] = fx * hRe - fz * hIm;
    }
  }
  Ifft2d(zRe, zIm, n);
  let sum = 0;
  for (let i = 0; i < size; i += 1) sum += zRe[i] * zRe[i] + zIm[i] * zIm[i];
  const invRms = 1 / Math.sqrt(sum / (2 * size) || 1);
  for (let i = 0; i < size; i += 1) { zRe[i] *= invRms; zIm[i] *= invRms; }
  return { sx: zRe, sz: zIm };
}

let waterNormalTexture = null;
function GetWaterNormalTexture() {
  if (waterNormalTexture) return waterNormalTexture;
  const n = RIPPLE_TEXTURE_SIZE;
  const fieldA = RippleSlopeField(n, 0x5A11E, 0.35, 0.35);
  const fieldB = RippleSlopeField(n, 0x2B0A7, -0.9, 0.25);
  const data = new Uint8Array(n * n * 4);
  const Encode = (s) => Math.round(Math.min(Math.max(0.5 + s / (2 * RIPPLE_ENCODE_SIGMA), 0), 1) * 255);
  for (let i = 0; i < n * n; i += 1) {
    data[i * 4] = Encode(fieldA.sx[i]);
    data[i * 4 + 1] = Encode(fieldA.sz[i]);
    data[i * 4 + 2] = Encode(fieldB.sx[i]);
    data[i * 4 + 3] = Encode(fieldB.sz[i]);
  }
  waterNormalTexture = new THREE.DataTexture(data, n, n, THREE.RGBAFormat, THREE.UnsignedByteType);
  waterNormalTexture.name = "Texture_WaterRippleSlopes";
  waterNormalTexture.wrapS = THREE.RepeatWrapping;
  waterNormalTexture.wrapT = THREE.RepeatWrapping;
  waterNormalTexture.magFilter = THREE.LinearFilter;
  waterNormalTexture.minFilter = THREE.LinearMipmapLinearFilter;
  waterNormalTexture.generateMipmaps = true;
  // 掠射角的河面全靠各向异性过滤：只做三线性，十米外顺视线方向就糊成一片平镜。
  // three 会按驱动上限截断，这里给 8 就行。
  waterNormalTexture.anisotropy = 8;
  waterNormalTexture.colorSpace = THREE.NoColorSpace;
  waterNormalTexture.needsUpdate = true;
  return waterNormalTexture;
}

/** 借 SkyDome 的 uniform（Script_Main 在建完天空后调一次）。 */
let skyUniformsRef = null;
export function SetWaterSkyUniforms(skyUniforms) { skyUniformsRef = skyUniforms; }

/**
 * 借 SSR 的追踪端 uniform（`Script_PostSsr.MakeSsrTraceUniforms` 那一包）。
 *
 * 水面**不能**走 SSR 靶：它 `transparent + depthWrite=false`，而且整只
 * `skipNormalDepth` 藏出了预通道，所以它那一像素在 RT0 里存的是**河床**的法线
 * 与深度 —— SSR 靶在水面位置算的是河床的反射。让水面写进预通道也不行：上面
 * `BehindSurfaceDepth` 那套浑水消光与岸线泡沫正是靠「读自己身后那个面」工作的。
 * 所以水面自己按平面反射假设追同一条 Hi-Z（`SsrSurfaceBlockGlsl`），拿它自己
 * 的波浪法线当反射面，再按置信度与解析天空反射混合。
 *
 * 传 null（或压根不调）= 只有解析天空反射，没有屏幕天空也没有 SSR。
 * **必须在任何水面材质建出来之前调**：材质按 preset+flow 缓存，建完就定型。
 */
let ssrTraceRef = null;
export function SetWaterSsr(traceUniforms) { ssrTraceRef = traceUniforms || null; }

// ---------------------------------------------------------------------------
// 预设。颜色一律 new THREE.Color(hex)，在 ColorManagement 下自动转线性 —— 直接当反照率用。
//
//   extinction   视线在水里每走 1 m 的消光系数（Beer–Lambert）：透射率 = exp(−extinction·路程）。
//                浑水 7（一分米剩一半：船吃水那一截只透出一点影子），护城河 / 荆河 1.2–1.6。
//   scatterColor 水体自己的散射反照率（乘天光辐照度）：浑水就是泥色。
//   rippleSlope  涟漪的 RMS 斜率（每个分量）。三月无风的河 0.05–0.08（Cox–Munk 微风量级）。
//   gustContrast 阵风斑块的对比：0 = 全河一样毛，0.6 = 平处只剩 40%、毛处到 124%。
//   ssrStrength  SSR 能盖过解析 / 屏幕天空反射的最大比例（乘在置信度上，见 WATER_SSR 注释）。
//   skyStrength  屏幕天空反射盖过解析天空的比例。
//   crestFoam    浪尖泡沫强度（只有护城河 / 荆河那种短促的浪需要）。
// ---------------------------------------------------------------------------

function LinearColor(hex) { return new THREE.Color(hex); }

const WATER_PRESETS = {
  // 护城河：窄、滞水、泥沙重。波长压短、流速近零，吸收快（一脚深的岸边就见底）。
  moat: {
    waves: [
      { dir: [0.94, 0.34], len: 16.0, amp: 0.028 },
      { dir: [-0.57, 0.82], len: 9.2, amp: 0.014 },
      { dir: [0.83, -0.55], len: 5.4, amp: 0.007 },
    ],
    chop: 0.50,
    timeScale: 0.85,
    flow: [0.00, 0.00],
    extinction: 1.6,
    scatterColor: 0x5C6352,
    foamColor: 0xB8B2A0,
    foamWidth: 0.42,
    foamStrength: 0.80,
    crestFoam: 0.60,
    rippleSlope: 0.070,
    gustContrast: 0.45,
    ssrStrength: 0.55,
    skyStrength: 0.85,
  },
  // 荆河：三十米宽的活水，顺流有整体漂移，浪比濠里略长略高。
  river: {
    waves: [
      { dir: [0.10, 0.99], len: 19.0, amp: 0.034 },
      { dir: [-0.86, 0.51], len: 8.6, amp: 0.015 },
      { dir: [0.66, -0.75], len: 5.2, amp: 0.008 },
    ],
    chop: 0.55,
    timeScale: 1.0,
    flow: [0.04, 0.45],
    extinction: 1.2,
    scatterColor: 0x56614F,
    foamColor: 0xBDB7A4,
    foamWidth: 0.60,
    foamStrength: 1.0,
    crestFoam: 0.60,
    rippleSlope: 0.080,
    gustContrast: 0.5,
    ssrStrength: 0.55,
    skyStrength: 0.85,
  },
  // 第一关北沙河（2026-09-28 B1，2026-10-01 按河水重做）：三月枯水、泥沙重的缓流。
  // 一两分米浑水就看不见底；没有浪尖泡沫，只在岸线、船舷、桥桩脚贴边留一细圈泥沫；
  // 平处照得出对岸与浮桥，阵风扫过的地方发毛发亮。
  muddyRiver: {
    waves: [
      { dir: [0.99, 0.12], len: 14.0, amp: 0.018 },
      { dir: [-0.62, 0.78], len: 7.4, amp: 0.009 },
      { dir: [0.7, -0.71], len: 4.3, amp: 0.005 },
    ],
    chop: 0.35,
    timeScale: 0.8,
    flow: [0.3, 0.0],
    extinction: 7.0,
    scatterColor: 0x6B6250,
    foamColor: 0x968D7C,
    foamWidth: 0.07,
    foamStrength: 0.40,
    crestFoam: 0.0,
    rippleSlope: 0.070,
    gustContrast: 0.6,
    ssrStrength: 0.85,
    skyStrength: 0.9,
  },
};

/**
 * 涟漪的四个尺度。tile = 一张斜率图铺多少米；angle = 采样坐标转多少（弧度，四层
 * 互不对齐）；drift = 相对水流的传播速度（米/秒，短波跑得快）；flowCarry = 被水流
 * 带走的比例（大尺度的斑纹几乎跟着水走，细涟漪有自己的传播）；weight 在着色器里
 * 归一成平方和为 1，所以 rippleSlope 就是叠加后的 RMS 斜率。
 * 三张瓦片的边长互质般错开（31 / 8.6 / 3.3 / 1.27），重复周期远大于一条河。
 */
const RIPPLE_LAYERS = [
  { tile: 31.0, field: 1, angle: 0.23, drift: [0.05, -0.03], flowCarry: 0.95, weight: 0.32 },
  { tile: 8.6, field: 0, angle: 0.0, drift: [0.09, 0.06], flowCarry: 0.9, weight: 0.58 },
  { tile: 3.3, field: 1, angle: 0.73, drift: [-0.06, 0.14], flowCarry: 0.85, weight: 0.55 },
  { tile: 1.27, field: 0, angle: -1.17, drift: [0.17, -0.11], flowCarry: 0.8, weight: 0.5 },
];

// ---------------------------------------------------------------------------
// GLSL
// ---------------------------------------------------------------------------

const WATER_VERT = /* glsl */`
uniform float uTime;
uniform float uAmpScale;
uniform float uChop;
uniform vec2 uFlow;
uniform float uTimeScale;

varying vec3 vWorldPos;
varying vec2 vRestXZ;
varying float vSharpness;
varying float vViewZ;

// 三波 Gerstner。波长/方向是常量表（按预设生成），位置随 uFlow 整体漂移。
__WAVE_TABLE__

void main() {
  vec3 worldPos = (modelMatrix * vec4(position, 1.0)).xyz;
  float waterTime = uTime * uTimeScale;
  vec2 advected = worldPos.xz - uFlow * waterTime;

  vec3 disp = vec3(0.0);
  float sharp = 0.0;
  float weightSum = 0.0001;

  for (int i = 0; i < WAVE_COUNT; i++) {
    vec2 dir = WAVE_DIR(i);
    float k = WAVE_K(i);
    float w = WAVE_W(i);
    float amp = WAVE_AMP(i) * uAmpScale;
    float phase = k * dot(dir, advected) - w * waterTime;
    float s = sin(phase), c = cos(phase);
    // 水平位移系数取常数 chop（不做 GPU Gems 那套 Q 归一化）：
    // 这里的浪是厘米级装饰，横向摆动按振幅同量级给一点就够，归一化反而算出过冲。
    disp.x += uChop * amp * dir.x * c;
    disp.z += uChop * amp * dir.y * c;
    disp.y += amp * s;
    sharp += (s * 0.5 + 0.5) * (amp * k);
    weightSum += amp * k;
  }

  vSharpness = sharp / weightSum;
  vRestXZ = worldPos.xz;
  vec3 displaced = worldPos + disp;
  vWorldPos = displaced;
  vec4 viewPos = viewMatrix * vec4(displaced, 1.0);
  vViewZ = -viewPos.z;
  gl_Position = projectionMatrix * viewPos;
}
`;

const WATER_FRAG = /* glsl */`
uniform float uTime;
uniform sampler2D uSceneDepth;
uniform sampler2D uNormalMap;
uniform float uDepthValid;
uniform vec2 uResolution;
uniform vec2 uFlow;
uniform float uTimeScale;
uniform float uAmpScale;

uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uGround;
uniform vec3 uSunDirection;
uniform vec3 uSunColor;

uniform vec3 uScatterColor;
uniform vec3 uFoamColor;
uniform float uExtinction;
uniform float uFoamWidth;
uniform float uFoamStrength;
uniform float uCrestFoam;
uniform float uRippleSlope;
uniform float uGustContrast;
uniform float uSsrWaterStrength;
uniform float uSkyScreenStrength;
uniform mat4 uWaterViewMatrix;
__SSR_BLOCK__

varying vec3 vWorldPos;
varying vec2 vRestXZ;
varying float vSharpness;
varying float vViewZ;

__WAVE_TABLE__
__RIPPLE_LAYERS__

// 值噪声：只给阵风斑块与泡沫打散用，频率很低，hash 精度够。
float WaterHash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float WaterNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(WaterHash(i), WaterHash(i + vec2(1.0, 0.0)), u.x),
             mix(WaterHash(i + vec2(0.0, 1.0)), WaterHash(i + vec2(1.0, 1.0)), u.x), u.y);
}

// Gerstner 的解析斜率（片元里算：河水网格横向十来米一格，逐顶点插值会把短波采坏）。
vec2 GerstnerSlope(vec2 p, float waterTime) {
  vec2 advected = p - uFlow * waterTime;
  vec2 slope = vec2(0.0);
  for (int i = 0; i < WAVE_COUNT; i++) {
    vec2 dir = WAVE_DIR(i);
    float k = WAVE_K(i);
    float amp = WAVE_AMP(i) * uAmpScale;
    float phase = k * dot(dir, advected) - WAVE_W(i) * waterTime;
    slope += dir * (k * amp * cos(phase));
  }
  return slope;
}

float BehindSurfaceDepth(vec2 uv, float surfaceZ) {
  vec2 texel = 1.0 / max(uResolution, vec2(1.0));
  float best = 10000.0;
  float d = texture2D(uSceneDepth, uv).w;
  if (d > surfaceZ + 0.001) best = min(best, d - surfaceZ);
  d = texture2D(uSceneDepth, uv + vec2(texel.x, 0.0)).w;
  if (d > surfaceZ + 0.001) best = min(best, d - surfaceZ);
  d = texture2D(uSceneDepth, uv - vec2(texel.x, 0.0)).w;
  if (d > surfaceZ + 0.001) best = min(best, d - surfaceZ);
  d = texture2D(uSceneDepth, uv + vec2(0.0, texel.y)).w;
  if (d > surfaceZ + 0.001) best = min(best, d - surfaceZ);
  d = texture2D(uSceneDepth, uv - vec2(0.0, texel.y)).w;
  if (d > surfaceZ + 0.001) best = min(best, d - surfaceZ);
  return best > 9999.0 ? 30.0 : best;
}

void main() {
  vec3 V = normalize(cameraPosition - vWorldPos);
  float dist = length(cameraPosition - vWorldPos);
  float waterTime = uTime * uTimeScale;
  vec2 flowDirection = length(uFlow) > 0.01 ? normalize(uFlow) : normalize(vec2(0.72, 0.28));

  // --- 阵风斑块：顺流拉长（沿流 46 m、横流 19 m），跟着水漂走 ---------------
  vec2 gustPos = vRestXZ - uFlow * waterTime * 0.9 - vec2(0.06, 0.035) * waterTime;
  vec2 gustUv = vec2(dot(gustPos, flowDirection) / 46.0,
    dot(gustPos, vec2(-flowDirection.y, flowDirection.x)) / 19.0);
  float gust = WaterNoise(gustUv) * 0.62 + WaterNoise(gustUv * 2.3 + vec2(7.1, 3.7)) * 0.38;
  gust = smoothstep(0.22, 0.80, gust);
  float roughness = mix(1.0 - uGustContrast, 1.0 + uGustContrast * 0.4, gust);

  // --- 法线：Gerstner 解析斜率 + 四层涟漪 -----------------------------------
  float lostVariance = 0.0;
  vec2 ripple = RippleSlope(vRestXZ, waterTime, lostVariance) * (uRippleSlope * roughness);
  // 两三百米外整体再压一半：各向异性过滤在掠射角沿短轴保留的细节到这里只剩闪烁
  ripple *= 1.0 - smoothstep(160.0, 420.0, dist) * 0.5;
  vec2 waveSlope = GerstnerSlope(vRestXZ, waterTime);
  vec2 slope = waveSlope + ripple;
  vec3 N = normalize(vec3(-slope.x, 1.0, -slope.y));
  // SSR 追踪用的法线只带三成多细涟漪：带满的话射线逐像素乱指，近处零星打中桥面与船舷、
  // 又被逐帧抖动成一粒一粒的暗点。倒影照样随波晃，细碎的那层留给天空反射与菲涅耳。
  vec2 traceSlope = waveSlope + ripple * 0.35;
  vec3 traceN = normalize(vec3(-traceSlope.x, 1.0, -traceSlope.y));
  if (!gl_FrontFacing) { N = -N; traceN = -traceN; }     // 蹲进濠里抬头看水面
  // 过滤掉的那部分斜率方差 → 反射锥变宽（远处不是一面完美的镜子，倒影要糊）
  float specAlpha = 0.012 + 1.41 * uRippleSlope * roughness * sqrt(lostVariance);

  // --- 屏幕空间水深：视线在水里走过的长度 ------------------------------------
  vec2 suv = gl_FragCoord.xy / max(uResolution, vec2(1.0));
  // rtNormalDepth.w 与 vViewZ 都是从相机向前递增的正数：河床在水面后方，
  // 所以必须 sceneZ - vViewZ。旧版写反后，整条河都被判成 0 深岸线。
  float rayDepth = BehindSurfaceDepth(suv, vViewZ);
  if (uDepthValid < 0.5) rayDepth = 30.0;   // 深度源没接上（探针页/首帧）：按深水渲染
  // 竖直水深只给泡沫带用：视线越平，同样的视差对应越浅的水
  float depth = rayDepth * clamp(abs(V.y), 0.22, 1.0);

  // --- 天光辐照度近似（借天空预设的四个量，昼夜自动跟随）---
  vec3 sunDir = normalize(uSunDirection);
  float sunUp = clamp(sunDir.y, 0.0, 1.0);
  vec3 irradiance = uZenith * 0.52 + uHorizon * 0.38 + uSunColor * (0.22 * sunUp);

  // --- 水体：Beer–Lambert 透射 + 泥沙散射 -----------------------------------
  float transmit = exp(-rayDepth * uExtinction);
  vec3 body = uScatterColor * irradiance;

  // --- 泡沫：岸线 / 船舷接触带 + 浪尖 ---------------------------------------
  vec2 foamPos = vRestXZ - uFlow * waterTime;
  float foamNoise = WaterNoise(foamPos * 1.9) * 0.6 + WaterNoise(foamPos * 4.7 + vec2(3.1, 9.2)) * 0.4;
  float shore = 1.0 - smoothstep(0.0, uFoamWidth * (0.55 + foamNoise * 0.9), depth);
  float crest = smoothstep(0.66, 0.94, vSharpness + (foamNoise - 0.5) * 0.20) * uCrestFoam;
  float foamTex = smoothstep(0.30, 0.70, foamNoise + (shore + crest) * 0.18);
  // 泡沫带是厘米级的东西：几十米外只剩一条亮线（读出来像水面和岸之间裂了条缝），淡掉
  float foam = clamp((shore * 0.95 + crest) * foamTex * uFoamStrength, 0.0, 1.0)
    * (1.0 - smoothstep(25.0, 70.0, dist));

  // --- 反射：解析天空 → 屏幕天空 → SSR -------------------------------------
  vec3 R = reflect(-V, N);
  float up = clamp(R.y, -1.0, 1.0);
  vec3 refl = mix(uHorizon, uZenith, pow(clamp(up, 0.0, 1.0), 0.42));
  refl = mix(refl, uGround, smoothstep(0.02, -0.08, up));
  // 太阳高光按「隔着云的太阳」给宽而柔的一团：针尖高光（旧版的 pow 420）打在分米级涟漪上
  // 会碎成满屏的小亮点，阴天里读出来是噪点。过滤掉的涟漪方差再把它摊开一点。
  float sunDot = max(dot(R, sunDir), 0.0);
  float sunSpread = clamp(0.06 / max(specAlpha, 0.06), 0.3, 1.0);
  vec3 spec = uSunColor * (pow(sunDot, 90.0 * sunSpread) * 0.5 * sunSpread + pow(sunDot, 12.0) * 0.05) * sunUp;

  __SSR_REFLECT__

  float fresnel = 0.02 + 0.98 * pow(1.0 - max(dot(N, V), 0.0), 5.0);

  // --- 合成（预乘 alpha）---------------------------------------------------
  // 看到的 = 反射·F + (1 − F)·[水体散射·(1 − T) + 身后河床·T]；
  // 河床那一项交给混合：src.a = 1 − (1 − F)·T，混合式 ONE / ONE_MINUS_SRC_ALPHA。
  vec3 col = refl * fresnel + spec * (0.35 + 0.65 * fresnel) + body * ((1.0 - fresnel) * (1.0 - transmit));
  float alpha = 1.0 - (1.0 - fresnel) * transmit;
  float foamLight = 0.74 + 0.26 * max(dot(N, sunDir), 0.0);
  col = mix(col, uFoamColor * irradiance * foamLight, foam);
  alpha = mix(alpha, 1.0, foam);

  gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
}
`;

/**
 * 水面 SSR 的口径。步数比场景 SSR 少：反射线从水面斜着打到对岸，三十二步的 Hi-Z
 * 足够跨过去；水面又是大面，步数直接乘在填充率上，多给没有画面收益。
 *   roughness 采上一帧场景色 mip 的粗糙度下限（片元里再按过滤掉的涟漪方差加宽）
 *
 * 强度在预设里（ssrStrength）。护城河那 0.55 的来历（2026-09-08，0.92 → 0.55）：
 * 0.92 等于「有置信度的地方就整块换成 SSR」，掠射角上被换成对岸城墙那一片暗色
 *（Gate_SouthOuter 的水面带均值 134.6 → 104.8），而且半分辨率追出来的那一份把涟漪
 * 顶成块状低频噪声。北沙河给 0.85：平处要照得出对岸、浮桥与船，阵风斑块与新的
 * 涟漪图让倒影本身带着涟漪，不再是一块平的。
 */
const WATER_SSR = { steps: 32, refine: 3, roughness: 0.035 };

/**
 * 水面片元着色器。SSR 关着（`SetWaterSsr(null)`，即 low 档或无浮点靶）时两个
 * 锚点替换成空串 —— 只剩解析天空反射。
 */
function WaterFragment(withSsr) {
  if (!withSsr) {
    return WATER_FRAG.replace("__SSR_BLOCK__", "").replace("__SSR_REFLECT__", "");
  }
  return WATER_FRAG
    .replace("__SSR_BLOCK__", SsrSurfaceBlockGlsl({
      steps: WATER_SSR.steps, refine: WATER_SSR.refine, name: "SsrWaterReflection", rejectFront: true,
    }))
    .replace("__SSR_REFLECT__", /* glsl */`
  if (uSsrWaterStrength > 0.0 && uSsrHasColor > 0.5) {
    // 水面在世界空间算光，SSR 追踪在视空间 —— 这里转一次。追踪用 traceN（细涟漪打了折，
    // 见上），屏幕天空那一层用满涟漪的 R：它只是一次取色，不会碎成噪点。
    vec3 ssrViewPos = (uWaterViewMatrix * vec4(vWorldPos, 1.0)).xyz;
    vec3 ssrViewNormal = normalize(mat3(uWaterViewMatrix) * traceN);
    float ssrRoughness = sqrt(max(specAlpha, ${(WATER_SSR.roughness * WATER_SSR.roughness).toFixed(5)}));
    // 屏幕里的天空：反射方向在无穷远处投到屏幕上；那一像素若是天空（预通道深度 0），
    // 取上一帧场景色 —— 云、烟柱、天边的霾一次采样进倒影。被地物挡住的方向交给
    // 下面的 SSR，追不中就留解析天空。
    vec3 skyDir = mat3(uWaterViewMatrix) * R;
    if (skyDir.z < -0.02) {
      vec2 skyUv = SsrViewToUv(skyDir);
      vec2 skyEdge = min(skyUv, vec2(1.0) - skyUv);
      float skyConf = smoothstep(0.0, uSsrEdgeFade, min(skyEdge.x, skyEdge.y));
      if (skyConf > 0.0 && texture2D(uSsrDepth, skyUv).a <= 0.0) {
        vec3 skyRadiance = SsrFetchRadiance(skyUv, SsrColorLod(ssrRoughness, 1.0, 1.0));
        refl = mix(refl, skyRadiance, skyConf * uSkyScreenStrength);
      }
    }
    float ssrNoise = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453
      + uSsrFrame * 0.618034);
    vec4 waterSsr = SsrWaterReflection(ssrViewPos, ssrViewNormal, ssrRoughness, ssrNoise);
    refl = mix(refl, waterSsr.rgb, clamp(waterSsr.a * uSsrWaterStrength, 0.0, 1.0));
  }`);
}

/** 把一波表展开成 GLSL 常量数组（ShaderMaterial 里手写循环要下标常量）。 */
function WaveTableGlsl(waves) {
  const dirs = waves.map((w) => `vec2(${w.dir[0].toFixed(4)}, ${w.dir[1].toFixed(4)})`).join(", ");
  const ks = waves.map((w) => ((2 * Math.PI) / w.len).toFixed(6)).join(", ");
  const ws = waves.map((w) => Math.sqrt(9.8 * ((2 * Math.PI) / w.len)).toFixed(6)).join(", ");
  const amps = waves.map((w) => w.amp.toFixed(5)).join(", ");
  return `#define WAVE_COUNT ${waves.length}
const vec2 WAVE_DIRS[WAVE_COUNT] = vec2[](${dirs});
const float WAVE_KS[WAVE_COUNT] = float[](${ks});
const float WAVE_WS[WAVE_COUNT] = float[](${ws});
const float WAVE_AMPS[WAVE_COUNT] = float[](${amps});
vec2 WAVE_DIR(int i) { return WAVE_DIRS[i]; }
float WAVE_K(int i) { return WAVE_KS[i]; }
float WAVE_W(int i) { return WAVE_WS[i]; }
float WAVE_AMP(int i) { return WAVE_AMPS[i]; }
`;
}

/**
 * 四层涟漪展开成直线代码（每层一次采样）。斜率图存的是采样坐标系里的 ∂h/∂q，
 * 采样坐标 q = Rθ·p / tile，所以世界斜率 = Rθᵀ·s（瓦片尺度已经被单位 RMS 归一吃掉）。
 * r：这一层按像素足迹（每像素多少个纹素）留下的比例 —— 频谱在 3–4 个纹素的波长处滚降，
 * 足迹到 3 纹素时只留一半；lostVariance 是收掉的那部分方差。
 */
function RippleLayersGlsl(layers) {
  const norm = 1 / Math.sqrt(layers.reduce((sum, layer) => sum + layer.weight * layer.weight, 0));
  const body = layers.map((layer, index) => {
    const c = Math.cos(layer.angle).toFixed(6), s = Math.sin(layer.angle).toFixed(6);
    const negS = (-Math.sin(layer.angle)).toFixed(6);   // 字面量里不能写「-(-0.9)」：GLSL 把 -- 当自减
    const texelsPerMeter = (RIPPLE_TEXTURE_SIZE / layer.tile).toFixed(6);
    const channel = layer.field === 0 ? "rg" : "ba";
    return `  {
    vec2 p${index} = p - (uFlow * ${layer.flowCarry.toFixed(3)} + vec2(${layer.drift[0].toFixed(4)}, ${layer.drift[1].toFixed(4)})) * t;
    vec2 q${index} = vec2(${c} * p${index}.x + ${negS} * p${index}.y, ${s} * p${index}.x + ${c} * p${index}.y) / ${layer.tile.toFixed(4)};
    vec2 s${index} = (texture2D(uNormalMap, q${index}).${channel} * 2.0 - 1.0) * ${RIPPLE_ENCODE_SIGMA.toFixed(1)};
    float f${index} = footprint * ${texelsPerMeter};
    float r${index} = 1.0 / (1.0 + f${index} * f${index} * 0.10);
    slope += ${(layer.weight * norm).toFixed(6)} * r${index} * vec2(${c} * s${index}.x + ${s} * s${index}.y, ${negS} * s${index}.x + ${c} * s${index}.y);
    lostVariance += ${((layer.weight * norm) ** 2).toFixed(6)} * (1.0 - r${index} * r${index});
  }`;
  }).join("\n");
  return `vec2 RippleSlope(vec2 p, float t, out float lostVariance) {
  vec2 slope = vec2(0.0);
  lostVariance = 0.0;
  // 像素足迹（米）：掠射角下沿视线那一轴比横向长十几倍。各向异性过滤沿短轴还留着细节，
  // 但反射方向随长轴那一向的涟漪乱跳 —— 那就是远岸倒影边上一粒一粒的噪点。所以往长轴偏，
  // 每层按足迹把斜率收掉（r），收掉的那份方差记进 lostVariance，交给反射锥去糊。
  vec2 dx = dFdx(p), dy = dFdy(p);
  float axisX = length(dx), axisY = length(dy);
  float footprint = mix(sqrt(axisX * axisY), max(axisX, axisY), 0.5);
${body}
  return slope;
}
`;
}

// ---------------------------------------------------------------------------
// 材质缓存：同一 preset + flow 只建一份 ShaderMaterial（关卡重建复用，不泄漏）。
// ---------------------------------------------------------------------------

const materialCache = new Map();

function GetWaterMaterial(presetName, flowKey) {
  const key = `${presetName}|${flowKey}`;
  if (materialCache.has(key)) return materialCache.get(key);
  const preset = WATER_PRESETS[presetName];
  if (!preset) throw new Error(`未知水面预设：${presetName}`);
  const skyU = skyUniformsRef;
  const ssrTrace = ssrTraceRef;
  const fallbackSkyUniforms = {
    uZenith: { value: new THREE.Vector3(1.9, 2.35, 3.2) },
    uHorizon: { value: new THREE.Vector3(2.4, 2.46, 2.62) },
    uGround: { value: new THREE.Vector3(0.58, 0.52, 0.42) },
    uSunDirection: { value: new THREE.Vector3(0.2, 0.78, -0.59).normalize() },
    uSunColor: { value: new THREE.Vector3(1.0, 0.92, 0.78) },
  };
  const waveTable = WaveTableGlsl(preset.waves);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      ...sharedUniforms,
      uNormalMap: { value: GetWaterNormalTexture() },
      // 借天空 uniform 的同一批对象：换时段预设，水面的反射与光色跟着变
      ...(skyU ? {
        uZenith: skyU.uZenith, uHorizon: skyU.uHorizon, uGround: skyU.uGround,
        uSunDirection: skyU.uSunDirection, uSunColor: skyU.uSunColor,
      } : fallbackSkyUniforms),
      uScatterColor: { value: LinearColor(preset.scatterColor) },
      uFoamColor: { value: LinearColor(preset.foamColor) },
      uExtinction: { value: preset.extinction },
      uFoamWidth: { value: preset.foamWidth },
      uFoamStrength: { value: preset.foamStrength },
      uCrestFoam: { value: preset.crestFoam },
      uRippleSlope: { value: preset.rippleSlope },
      uGustContrast: { value: preset.gustContrast },
      uAmpScale: { value: 1 },
      uChop: { value: preset.chop },
      uTimeScale: { value: preset.timeScale },
      uFlow: { value: new THREE.Vector2(
        flowKey ? Number(flowKey.split("_")[0]) : preset.flow[0],
        flowKey ? Number(flowKey.split("_")[1]) : preset.flow[1]) },
      // SSR 关着时这两项也留着（值恒 0），着色器里那一段整块不编。
      uSsrWaterStrength: { value: ssrTrace ? preset.ssrStrength : 0 },
      uSkyScreenStrength: { value: ssrTrace ? preset.skyStrength : 0 },
      ...(ssrTrace ? BindSsrTraceUniforms({}, ssrTrace) : {}),
    },
    vertexShader: WATER_VERT.replace("__WAVE_TABLE__", waveTable),
    fragmentShader: WaterFragment(!!ssrTrace)
      .replace("__WAVE_TABLE__", waveTable)
      .replace("__RIPPLE_LAYERS__", RippleLayersGlsl(RIPPLE_LAYERS)),
    transparent: true,
    // 预乘 alpha：反射项不被透明度打折，见片元「合成」一节
    premultipliedAlpha: true,
    depthWrite: false,
    side: THREE.DoubleSide,     // 蹲进濠里抬头还要看得见水面
    fog: false,                 // 雾收在 Composite pass 里
    toneMapped: false,
  });
  // 大面积半透明面：既不换材质进预通道（allowOverride），也整只藏出预通道
  //（skipNormalDepth 由 PostPipeline._CollectSkipped 读）—— 见文件头管线契约。
  MarkNoPrepass(material);
  materialCache.set(key, material);
  return material;
}

/**
 * 造一片水面网格并挂进场景。
 * @param {object} options
 *   geometry  已合批的水面几何（世界坐标，position+uv）
 *   preset    "moat" | "river" | "muddyRiver"
 *   flow      可选 [vx,vz] 覆盖预设的整体漂移（米/秒）
 *   name      场景里的对象名
 */
export function CreateWaterSurface({ geometry, scene, preset = "moat", flow = null, name = "Water" }) {
  const flowKey = flow ? `${flow[0]}_${flow[1]}` : null;
  const mesh = new THREE.Mesh(geometry, GetWaterMaterial(preset, flowKey));
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.name = name;
  mesh.userData.skipNormalDepth = true;
  scene.add(mesh);
  return mesh;
}

/**
 * 每帧推一次时间与深度源。调用点：Script_Main.RenderScene
 *（与 vfx.SetDepthSource 同一批账：预通道靶会被 SetSize 重建，纹理引用
 * 每帧都可能换，不能只在初始化接一次）。
 */
export function UpdateWaterSurfaces(dt, depthTexture, width, height, camera = null) {
  sharedUniforms.uTime.value += Math.min(Math.max(dt, 0.0), 0.1);
  // 世界→视空间：SSR 追踪要它。相机为空时保持上一帧那份（探针页/首帧），
  // 追踪端本来就靠 uSsrHasColor 兜底，不会因此画出错的东西。
  if (camera) sharedUniforms.uWaterViewMatrix.value.copy(camera.matrixWorldInverse);
  if (depthTexture) {
    sharedUniforms.uSceneDepth.value = depthTexture;
    sharedUniforms.uDepthValid.value = 1;
  } else {
    sharedUniforms.uDepthValid.value = 0;
  }
  sharedUniforms.uResolution.value.set(width || 1, height || 1);
}
