// 《台儿庄：血战滕县》末趟：FXAA 3.11 简化版 + **CAS 锐化** → 屏幕。
//
// 跑在 **sRGB 编码之后**：FXAA 的亮度阈值与 CAS 的对比度自适应都是按感知域标定的，
// 放在线性域会在暗部疯狂涂抹、在亮部几乎不动。TAA 开着时 `uFxaa` 置 0
// （几何锯齿已经在时域上解决，再糊一层只会掉细节），锐化保留。
//
// ## 2026-09：锐化从「减模糊」换成 CAS
// 旧版是 `aa + (aa - 四角均值) * s` —— 一个无条件的 unsharp mask：平坦区域的
// 噪点被一起放大、已经接近纯白/纯黑的边缘被推出范围形成硬 ringing。
// 现在走 **AMD FidelityFX Contrast Adaptive Sharpening 1.0**（`ffx_cas.h` 的
// no-scaling 路径）：逐通道取 3×3 的 min/max，按 `sqrt(saturate(min(mn, 2-mx)/mx))`
// 算一个**局部自适应幅度** —— 已经饱和的区域幅度自动趋近 0，锐化只落在真正
// 有余量的地方，所以不会 ringing。UE 的 Tonemapper Sharpen 与 TAAU 之后都是
// 同一类做法（TAAU 必然要补一次锐化，重采样一定会掉高频）。
//
// ## TAAU 与这一趟的分辨率
// TAAU 开着时 TAA 已经把画面解算到**输出分辨率**，composite 的 `ldr` 也是输出
// 分辨率，这里 1:1 送屏，不再有任何拉伸。TAAU 关着（low 档 / 玩家关了 TAA）
// 而渲染分辨率 < 1 时，这一趟仍旧是那次唯一的双线性放大 —— 与重构前一致。
//
// ## 本模块顺带认领三个调试视图
// `velocityTile` / `dofCoc` / `taaWeight` 是运动模糊、景深、TAA 三个 pass 的
// 中间量，展示材质与它们的本帧参数都在本模块手里，所以由本模块的
// `GetDebugSource(view)` 认领 —— 走 `DebugPass.GetSource()` 的**第 ① 条路**
// （pass 自带视图），与 B3 体积雾、B2 GTAO 那几张同一条。
// **`Render()` 里没有第二个拦截分支**：整条管线的调试视图仲裁点只有
// `GetSource()` 那三条路，不许有第四条（口径见 docs §1.11）。

import * as THREE from "three";
import { MakeFullscreenMaterial, GLSL_COMMON } from "./Script_PostCommon.mjs";
import { GLSL_COC, ApplyCocUniforms } from "./Script_PostDof.mjs";
import { CAS, DOF } from "./Data_Tuning_TemporalDof.mjs";
import { FILM_GRAIN } from "./Data_Tuning_Camera.mjs";

const GRAIN_TEX_SIZE = 256;
const GRAIN_TEX_RANGE = 5.0; // ±5.0 映射到 [0, 255]，覆盖 >99.98% 高斯尾部且量化步长 < 0.13 级 sRGB

/**
 * 离线合成一张 256×256 无缝周期 35mm 银盐乳剂纹理（零网络资产、约 256 KB 显存）。
 *
 * 通道布局（NoColorSpace 线性数据，127.5/255 为零均值中心）：
 *   · A    主银盐亮度乳剂（σ_mtf = 0.18 细腻微晶，radius=2 三遍滑窗 −96% 高通彻底剔除 >4 px 糊状脏斑，配合硬件旋转双线性呈 1:1 精致 35mm 银盐）；
 *   · RGB  独立三层彩色染料云（R 0.24 / G 0.20 / B 0.28，COD 默认 chroma=0 纯单色银盐，开启色度时模拟三层胶片染料）。
 *
 * 每通道按「旋转随机相位下的硬件双线性期望方差」精确归一，所以无论 uGrainPx 调多粗、
 * 怎么旋转，送屏标准差始终等于 uGrain × 亮度响应，不随颗粒大小滑杆漂移。
 */
function BuildFilmGrainTexture(size = GRAIN_TEX_SIZE) {
  const count = size * size;
  const mask = size - 1;
  let state = 0x19380317;
  const Rand01 = () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const Gauss = () => Math.sqrt(-2 * Math.log(Math.max(Rand01(), 1e-7))) * Math.cos(6.283185307179586 * Rand01());

  const GaussBlur = (src, sigma) => {
    const r = Math.max(1, Math.ceil(sigma * 3));
    const k = new Float32Array(r + 1);
    let sum = 1;
    k[0] = 1;
    for (let d = 1; d <= r; d++) {
      k[d] = Math.exp(-0.5 * (d / sigma) ** 2);
      sum += 2 * k[d];
    }
    for (let d = 0; d <= r; d++) k[d] /= sum;
    const tmp = new Float32Array(count);
    const dst = new Float32Array(count);
    for (let y = 0; y < size; y++) {
      const row = y * size;
      for (let x = 0; x < size; x++) {
        let acc = src[row + x] * k[0];
        for (let d = 1; d <= r; d++) acc += (src[row + ((x - d) & mask)] + src[row + ((x + d) & mask)]) * k[d];
        tmp[row + x] = acc;
      }
    }
    for (let y = 0; y < size; y++) {
      const row = y * size;
      for (let x = 0; x < size; x++) {
        let acc = tmp[row + x] * k[0];
        for (let d = 1; d <= r; d++) acc += (tmp[((y - d) & mask) * size + x] + tmp[((y + d) & mask) * size + x]) * k[d];
        dst[row + x] = acc;
      }
    }
    return dst;
  };

  // 三遍周期滑窗盒滤波（radius=2 → 等效 σ≈2.45），用来抽离并压制 4–12 px 糊状低频云斑。
  const BoxBlurLow = (src, radius = 2, passes = 3) => {
    const inv = 1 / (radius * 2 + 1);
    const cur = new Float32Array(src);
    const tmp = new Float32Array(count);
    for (let p = 0; p < passes; p++) {
      for (let y = 0; y < size; y++) {
        const row = y * size;
        let sum = 0;
        for (let d = -radius; d <= radius; d++) sum += cur[row + (d & mask)];
        for (let x = 0; x < size; x++) {
          tmp[row + x] = sum * inv;
          sum += cur[row + ((x + radius + 1) & mask)] - cur[row + ((x - radius) & mask)];
        }
      }
      for (let x = 0; x < size; x++) {
        let sum = 0;
        for (let d = -radius; d <= radius; d++) sum += tmp[(d & mask) * size + x];
        for (let y = 0; y < size; y++) {
          cur[y * size + x] = sum * inv;
          sum += tmp[((y + radius + 1) & mask) * size + x] - tmp[((y - radius) & mask) * size + x];
        }
      }
    }
    return cur;
  };

  const MakeLayer = (sigmaMtf, hpWeight) => {
    const white = new Float32Array(count);
    for (let i = 0; i < count; i++) white[i] = Gauss();
    const fine = GaussBlur(white, sigmaMtf);
    // radius=2 三遍滑窗 −96% 高通彻底剔除 >4 px 糊状脏斑，配合 σ_mtf=0.18 与硬件旋转双线性保持细腻 35mm 银盐微晶（不粗不糊）。
    const low = BoxBlurLow(fine, 2, 3);
    const out = new Float32Array(count);
    let mean = 0;
    for (let i = 0; i < count; i++) {
      const v = fine[i] - hpWeight * low[i];
      out[i] = v;
      mean += v;
    }
    mean /= count;
    for (let i = 0; i < count; i++) out[i] -= mean;
    // 解析积分：随机相位 (fx,fy)∈[0,1)² 下双线性插值的期望方差 = (4·v0 + 4·v1 + vd) / 9。
    let v0 = 0, v1 = 0, vd = 0;
    for (let y = 0; y < size; y++) {
      const row = y * size;
      const nextRow = ((y + 1) & mask) * size;
      for (let x = 0; x < size; x++) {
        const nx = (x + 1) & mask;
        const a = out[row + x], b = out[row + nx], c = out[nextRow + x], d = out[nextRow + nx];
        v0 += a * a;
        v1 += a * b + a * c;
        vd += a * d + b * c;
      }
    }
    v0 /= count;
    v1 /= (2 * count);
    vd /= (2 * count);
    const invStd = 1 / Math.sqrt(Math.max((4 * v0 + 4 * v1 + vd) / 9, 1e-8));
    for (let i = 0; i < count; i++) out[i] *= invStd;
    return out;
  };

  // A = 35mm 精细银盐微晶层（σ_mtf = 0.18，彻底去粗糊与低频泥斑）；RGB = 可选染料色度层（COD 默认 chroma=0 纯单色）。
  const r = MakeLayer(0.24, 0.96);
  const g = MakeLayer(0.20, 0.96);
  const b = MakeLayer(0.28, 0.96);
  const a = MakeLayer(0.18, 0.96);
  const bytes = new Uint8Array(count * 4);
  const scale = 127.5 / GRAIN_TEX_RANGE;
  const Pack = (v) => Math.max(0, Math.min(255, Math.round(127.5 + v * scale)));
  for (let i = 0; i < count; i++) {
    const o = i * 4;
    bytes[o] = Pack(r[i]);
    bytes[o + 1] = Pack(g[i]);
    bytes[o + 2] = Pack(b[i]);
    bytes[o + 3] = Pack(a[i]);
  }
  const texture = new THREE.DataTexture(bytes, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.colorSpace = THREE.NoColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.flipY = false;
  texture.unpackAlignment = 1;
  texture.needsUpdate = true;
  return texture;
}

const FRAG_FXAA = /* glsl */`
uniform sampler2D uSource;
uniform sampler2D uGrainTex;
uniform vec2 uTexel;
uniform float uSharpen;   // CAS sharpness，0–1
uniform float uFxaa;      // TAA 开着时置 0：几何锯齿已在时域上解决，FXAA 只会再糊一层
uniform float uCasPeakLow;
uniform float uCasPeakHigh;
uniform float uGrain;          // 胶片颗粒：sRGB 域标准差（0–1）；0 = 关
uniform float uGrainSeed;      // 当前底片的种子（整数，0..seedCount-1）
uniform float uGrainSeedNext;  // 下一张底片的种子（与 uGrainSeed 平滑过渡）
uniform float uGrainBlend;     // 0 = 只用当前种子，1 = 只用下一张；过渡中途按权重平方和归一
uniform float uGrainPx;
uniform float uGrainMode;
uniform float uGrainChroma;    // 彩色颗粒比例（0–1）
uniform vec2 uGrainResponse;
varying vec2 vUv;
${GLSL_COMMON}

const float GRAIN_INV_TEX = ${(1 / GRAIN_TEX_SIZE).toFixed(8)};
const float GRAIN_DECODE = ${(GRAIN_TEX_RANGE * 2).toFixed(4)};

mat2 GrainRot(float angle) {
  float c = cos(angle), s = sin(angle);
  return mat2(c, -s, s, c);
}

vec4 SampleGrainPlate(vec2 coord, float angle, vec2 offset) {
  vec2 uv = (GrainRot(angle) * coord) * GRAIN_INV_TEX + offset;
  return (texture2D(uGrainTex, uv) - vec4(127.5 / 255.0)) * GRAIN_DECODE;
}

vec3 FilmGrainFieldAt(vec2 fragCoord, float seed, float chromaWeight) {
  vec2 plate = (fragCoord - vec2(512.0)) / uGrainPx;
  float angleA = 0.37 + fract(seed * 0.381966011) * 6.28318531;
  vec2 offsetA = fract(seed * vec2(0.75487767, 0.56984029) + vec2(0.13, 0.29));
  vec4 tapA = SampleGrainPlate(plate, angleA, offsetA);
  if (uGrainMode < 0.5) return vec3(tapA.a);

  // 第二层无理角旋转 + 1.15x 细谐波：打破 256px 周期性与轴向双线性格感，同时保持微晶细腻不发粗。
  float angleB = angleA + 1.17809725;
  vec2 offsetB = fract(seed * vec2(0.61803399, 0.38196601) + vec2(0.47, 0.83));
  vec4 tapB = SampleGrainPlate(plate * 1.15, angleB, offsetB);
  vec4 emul = 0.78 * tapA + 0.62578 * tapB;

  float silver = emul.a;
  if (chromaWeight <= 0.0001) return vec3(silver);
  // 真实三层 RGB 染料云中剥离纯零亮度色度，保证不漂移均值且无 1D 橙蓝脏斑。
  vec3 dye = emul.rgb - vec3(Luma(emul.rgb));
  float c = clamp(chromaWeight, 0.0, 0.5);
  return vec3(silver * sqrt(max(1.0 - c * c, 0.0))) + dye * c;
}

// 相邻两张底片平滑过渡；mix 会压方差，除以 √((1−t)²+t²) 让过渡中途强度不掉。
vec3 FilmGrainField(vec2 fragCoord, float chromaWeight) {
  float t = clamp(uGrainBlend, 0.0, 1.0);
  if (t <= 0.001) return FilmGrainFieldAt(fragCoord, uGrainSeed, chromaWeight);
  if (t >= 0.999) return FilmGrainFieldAt(fragCoord, uGrainSeedNext, chromaWeight);
  vec3 a = FilmGrainFieldAt(fragCoord, uGrainSeed, chromaWeight);
  vec3 b = FilmGrainFieldAt(fragCoord, uGrainSeedNext, chromaWeight);
  return mix(a, b, t) * inversesqrt(max((1.0 - t) * (1.0 - t) + t * t, 1e-4));
}

float FilmGrainResponse(float y) {
  // 对标 COD IW8 / UE5 胶片响应：极黑趾部（< 0.015）归零保黑位，阴影与下中间调柔润自然，
  // 浅灰墙面与亮空沿二次摄影肩部平滑压净，避免平整灰面起沙噪。
  float toe = smoothstep(0.015, uGrainResponse.x, y);
  float hi = 1.0 - smoothstep(uGrainResponse.y, 0.88, y);
  return toe * hi * hi;
}

vec3 ApplyFilmGrain(vec3 color) {
  float y = Luma(color);
  float response = FilmGrainResponse(y);
  // 暗部自动退回纯银盐亮度颗粒（COD IW8 默认 chroma = 0，全明度纯单色银盐无彩噪）。
  float chromaWeight = uGrainChroma * smoothstep(0.08, 0.28, y);
  vec3 amplitude = min(vec3(uGrain * response), 0.28 * min(color, 1.0 - color));
  return clamp(color + FilmGrainField(gl_FragCoord.xy, chromaWeight) * amplitude, 0.0, 1.0);
}

void main() {
  // CAS 的 3×3 取名沿用 AMD 原版：
  //   a b c
  //   d e f
  //   g h i
  vec3 a = texture2D(uSource, vUv + vec2(-1.0, -1.0) * uTexel).rgb;
  vec3 b = texture2D(uSource, vUv + vec2( 0.0, -1.0) * uTexel).rgb;
  vec3 c = texture2D(uSource, vUv + vec2( 1.0, -1.0) * uTexel).rgb;
  vec3 d = texture2D(uSource, vUv + vec2(-1.0,  0.0) * uTexel).rgb;
  vec3 e = texture2D(uSource, vUv).rgb;
  vec3 f = texture2D(uSource, vUv + vec2( 1.0,  0.0) * uTexel).rgb;
  vec3 g = texture2D(uSource, vUv + vec2(-1.0,  1.0) * uTexel).rgb;
  vec3 h = texture2D(uSource, vUv + vec2( 0.0,  1.0) * uTexel).rgb;
  vec3 i = texture2D(uSource, vUv + vec2( 1.0,  1.0) * uTexel).rgb;

  if (uFxaa > 0.5) {
    float lNW = Luma(a), lNE = Luma(c), lSW = Luma(g), lSE = Luma(i), lM = Luma(e);
    float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE)));
    float lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));

    vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), ((lNW + lSW) - (lNE + lSE)));
    float dirReduce = max((lNW + lNE + lSW + lSE) * 0.25 * 0.0625, 0.0078125);
    float rcpDirMin = 1.0 / (min(abs(dir.x), abs(dir.y)) + dirReduce);
    dir = clamp(dir * rcpDirMin, vec2(-8.0), vec2(8.0)) * uTexel;

    vec3 rgbA = 0.5 * (texture2D(uSource, vUv + dir * (1.0 / 3.0 - 0.5)).rgb
                     + texture2D(uSource, vUv + dir * (2.0 / 3.0 - 0.5)).rgb);
    vec3 rgbB = rgbA * 0.5 + 0.25 * (texture2D(uSource, vUv + dir * -0.5).rgb
                                   + texture2D(uSource, vUv + dir * 0.5).rgb);
    float lB = Luma(rgbB);
    e = (lB < lMin || lB > lMax) ? rgbA : rgbB;
  }

  vec3 result = e;
  if (uSharpen > 0.0) {
    // AMD CAS：逐通道 min/max（十字 + 对角各一份相加，值域变成 [0,2]，
    // 这是原版 "soft" 变体的写法），幅度 = sqrt(saturate(min(mn, 2-mx) / mx))。
    // 已经贴到 0 或 1 的通道幅度自动趋近 0 —— 这就是它不 ringing 的原因。
    vec3 mn = min(min(min(d, e), min(f, b)), h);
    vec3 mn2 = min(min(min(mn, a), min(c, g)), i);
    mn += mn2;
    vec3 mx = max(max(max(d, e), max(f, b)), h);
    vec3 mx2 = max(max(max(mx, a), max(c, g)), i);
    mx += mx2;
    vec3 rcpMx = 1.0 / max(mx, vec3(1e-4));
    vec3 amp = sqrt(clamp(min(mn, 2.0 - mx) * rcpMx, 0.0, 1.0));
    float peak = mix(uCasPeakLow, uCasPeakHigh, clamp(uSharpen, 0.0, 1.0));
    vec3 w = amp * peak;
    result = clamp((b * w + d * w + f * w + h * w + e) / (1.0 + 4.0 * w), 0.0, 1.0);
  }
  if (uGrain > 0.0) result = ApplyFilmGrain(result);
  gl_FragColor = vec4(result, 1.0);
}
`;

// --- 本模块接管的三个调试视图 ------------------------------------------------
// uMode 0 = 速度 tile（uv 速度 → 方向/幅度假彩色）
//       1 = CoC（蓝 = 锐利、暖黄 = 远景散焦、洋红 = 近景散焦）
//       2 = TAA 权重（R = 当前帧权重、G = 历史被裁掉多少、B = responsive 掩码）
const FRAG_TEMPORAL_DEBUG = /* glsl */`
uniform sampler2D uSource;
uniform sampler2D uNormalDepth;
uniform float uMode;
uniform float uUnavailable;
uniform vec2 uResolution;
uniform float uBlurScale;
varying vec2 vUv;
${GLSL_COMMON}
${GLSL_COC}
vec3 ToSrgb(vec3 c) { return pow(max(c, vec3(0.0)), vec3(1.0 / 2.2)); }
void main() {
  if (uUnavailable > 0.5) {
    float stripe = step(0.5, fract((vUv.x + vUv.y) * 22.0));
    gl_FragColor = vec4(mix(vec3(0.12, 0.012, 0.018), vec3(0.55, 0.03, 0.08), stripe), 1.0);
    return;
  }
  vec3 color;
  if (uMode < 0.5) {
    // 速度 tile：与「速度缓冲」视图同一套编码，只是这一张是 tile 邻域最大值，
    // 而且乘了快门（画面上真正会糊多长）。
    vec2 velocityPx = texture2D(uSource, vUv).xy * uBlurScale * uResolution;
    vec2 dir = clamp(velocityPx / 16.0, vec2(-1.0), vec2(1.0));
    color = vec3(0.5 + dir.x * 0.5, 0.5 + dir.y * 0.5,
                 clamp(length(velocityPx) / 16.0, 0.0, 1.0));
  } else if (uMode < 1.5) {
    float depth = texture2D(uNormalDepth, vUv).w;
    float coc = CocPx(depth, vUv);
    // 焦平面处为 0（深蓝）。远景往暖黄走、近景往洋红走 —— 两侧分色才看得出
    // 「焦平面在不在该在的地方」。
    float farT = clamp(coc / max(uFarMaxPx, 0.001), 0.0, 1.0);
    float nearT = clamp(-coc / max(uNearMaxPx, 0.001), 0.0, 1.0);
    color = vec3(0.015, 0.06, 0.30);
    color = mix(color, vec3(1.0, 0.72, 0.04), farT);
    color = mix(color, vec3(1.0, 0.10, 0.68), nearT);
    // 前景标签：绿；开镜时枪身按离准星的距离往洋红走（准星那圈仍是绿）
    if (IsForeground(depth)) color = mix(vec3(0.05, 0.85, 0.35), vec3(1.0, 0.10, 0.68),
      clamp(-coc / max(uViewmodelMaxPx, 0.001), 0.0, 1.0));
    color = ToSrgb(color);
  } else {
    vec4 t = texture2D(uSource, vUv);
    // R = 当前帧权重（×4 才看得见 0.04 那一档），G = 裁剪量，B = responsive
    color = vec3(clamp(t.r * 4.0, 0.0, 1.0), t.g, t.b);
  }
  gl_FragColor = vec4(color, 1.0);
}
`;

/**
 * 本模块**认领**的调试视图 id。
 *
 * 它们走的是 `DebugPass.GetSource()` 的**第 ① 条路**（pass 自带视图，
 * `GetDebugSource(view)`）—— 与 B3 体积雾、B2 GTAO 那几张同一条。
 * 送屏交给 `DebugPass.RenderView` 的「自带材质」通道，**这里不另开一条送屏分支**：
 * 整个管线的调试视图仲裁点只有 `GetSource()` 那三条路，不许有第四条。
 */
export const TEMPORAL_DEBUG_VIEWS = ["velocityTile", "dofCoc", "taaWeight"];

export class FxaaPass {
  constructor(pipeline) {
    this.name = "fxaa";
    this.grainClock = 0;
    this.grainFrame = 0;
    this.pipeline = pipeline;
    this.grainTexture = BuildFilmGrainTexture();
    this.uniforms = {
      uSource: { value: null }, uGrainTex: { value: this.grainTexture },
      uTexel: { value: new THREE.Vector2() },
      uSharpen: { value: pipeline.preset.sharpen }, uFxaa: { value: 1 },
      uCasPeakLow: { value: CAS.peakLow }, uCasPeakHigh: { value: CAS.peakHigh },
      uGrain: { value: 0 },
      uGrainSeed: { value: 0 }, uGrainSeedNext: { value: 1 }, uGrainBlend: { value: 0 },
      uGrainPx: { value: FILM_GRAIN.sizePx }, uGrainMode: { value: 1 },
      uGrainChroma: { value: FILM_GRAIN.chroma },
      uGrainResponse: { value: new THREE.Vector2(FILM_GRAIN.response.toeEnd, FILM_GRAIN.response.shoulderStart) },
    };
    this.material = MakeFullscreenMaterial(FRAG_FXAA, this.uniforms);

    this.uniformsDebug = {
      uSource: { value: null }, uNormalDepth: { value: null },
      uMode: { value: 0 }, uUnavailable: { value: 0 },
      uResolution: { value: new THREE.Vector2(2, 2) }, uBlurScale: { value: 0.25 },
      uFocus: { value: 1.5 }, uFarGain: { value: 0 }, uNearGain: { value: 0 },
      uFarMaxPx: { value: 0 }, uNearMaxPx: { value: 0 },
      uForegroundDepth: { value: 0 }, uForegroundEps: { value: 0.002 },
      uSightUv: { value: new THREE.Vector2(-1, -1) }, uAspect: { value: 16 / 9 },
      uViewmodelRadius: { value: new THREE.Vector2(DOF.viewmodelSharpRadius, DOF.viewmodelBlurRadius) },
      uViewmodelMaxPx: { value: 0 },
    };
    this.materialDebug = MakeFullscreenMaterial(FRAG_TEMPORAL_DEBUG, this.uniformsDebug);
  }

  Enabled() { return true; }

  Resize() { /* 直接送屏，没有自己的靶 */ }

  /**
   * 末趟出画。调试面板要求看中间靶时由 `DebugPass` 接管这一趟（同一个 GPU 段名
   * "fxaa"）—— 按 `debugPass.GetSource()` 的返回值二选一，**只有这一个判断**。
   * 本模块自己那三项（velocityTile / dofCoc / taaWeight）也从 `GetSource()` 的
   * 第 ① 条路回来（见 `GetDebugSource`），不在这里另开一条拦截分支。
   */
  Render(ctx) {
    const P = this.pipeline;
    const debug = P.debugPass.GetSource();
    if (debug) {
      P.debugPass.RenderView(ctx, debug);
      return;
    }
    const source = P.targets.ldr;
    this.uniforms.uSource.value = source.texture;
    this.uniforms.uTexel.value.set(1 / source.width, 1 / source.height);
    this.uniforms.uSharpen.value = ctx.options.sharpen ?? P.sharpenStrength;
    this.uniforms.uFxaa.value = ctx.taaActive ? 0 : 1;
    const { options } = ctx;
    const U = this.uniforms;
    U.uGrain.value = Math.max(0, options.grain ?? FILM_GRAIN.strength);
    const grainSize = Math.min(FILM_GRAIN.sizeRange.max, Math.max(FILM_GRAIN.sizeRange.min,
      Number.isFinite(options.grainSize) ? options.grainSize : FILM_GRAIN.sizeRange.value));
    // 按 √(输出高 / 1080) 做感知分辨率无关缩放：720p–4K 颗粒观感一致，且高分/高 DPI 屏不会线性放大成粗颗粒。
    U.uGrainPx.value = Math.max(0.75, FILM_GRAIN.sizePx * grainSize * Math.sqrt(P.renderer.domElement.height / 1080));
    U.uGrainMode.value = ctx.preset.filmGrain ? 1 : 0;
    // 对标 COD IW8 / UE5（r.FilmGrain.SequenceLength = 97）：每帧推进 1 格素数周期、零跨帧混合（uGrainBlend = 0）。
    // 严格逐帧步进可避免 59.94/60 Hz rAF 抖动与时钟取整拍频导致的偶发滞留闪动，同时省掉一半颗粒纹理采样。
    if (Number.isFinite(options.dt)) {
      if (options.dt > 0) {
        this.grainClock += options.dt;
        this.grainFrame = (this.grainFrame + 1) % FILM_GRAIN.seedCount;
      }
      U.uGrainSeed.value = this.grainFrame;
    } else {
      U.uGrainSeed.value = ctx.frame % FILM_GRAIN.seedCount;
    }
    U.uGrainSeedNext.value = (U.uGrainSeed.value + 1) % FILM_GRAIN.seedCount;
    U.uGrainBlend.value = 0;
    ctx.blitter.Blit(this.material, null, ctx.options?.outputViewport || null);
  }

  /**
   * ① 那条路：本模块自带的三张调试图（速度 tile / CoC / TAA 权重）。
   * 它们的参数散在 motionBlur / dof / taa 三个 pass 上，而展示材质在本模块 ——
   * 交给 `GetDebugSource` 认领，比往 `Script_PostDebug` 那条内置 switch 里塞
   * 三个 case 干净（那张表是 Phase A 的，不收新子系统的东西）。
   * `unavailable` 恒 false：材质自己画不可用斜纹（`uUnavailable`），
   * 走 RenderView 的自带材质通道即可。
   */
  GetDebugSource(view) {
    if (!TEMPORAL_DEBUG_VIEWS.includes(view)) return null;
    return {
      material: this.materialDebug,
      Prepare: (ctx) => this._PrepareTemporalDebug(ctx, view),
      unavailable: false,
      texture: this.pipeline.targets.normalDepth?.texture,
      mode: 0,
    };
  }

  _PrepareTemporalDebug(ctx, view) {
    const P = this.pipeline;
    const U = this.uniformsDebug;
    U.uResolution.value.set(P.width, P.height);
    U.uNormalDepth.value = ctx.normalDepthTexture;
    U.uForegroundDepth.value = P.foregroundViewDepth ?? 0;
    if (view === "velocityTile") {
      const tile = P.motionBlurPass?.neighbor;
      U.uMode.value = 0;
      U.uSource.value = tile ? tile.texture : null;
      U.uBlurScale.value = P.motionBlurPass?.uniforms.uBlurScale.value ?? 0.25;
      U.uUnavailable.value = tile && P.motionBlurPass.active ? 0 : 1;
    } else if (view === "dofCoc") {
      const dof = P.dofPass;
      U.uMode.value = 1;
      U.uSource.value = ctx.normalDepthTexture;
      if (dof) ApplyCocUniforms(U, dof.coc, P.foregroundViewDepth ?? 0);
      // 景深关着也照样出图（CoC 恒 0 = 一片深蓝，是准确信息不是"不可用"）。
      U.uUnavailable.value = 0;
    } else {
      const target = P.taaPass?.debugTarget;
      U.uMode.value = 2;
      U.uSource.value = target ? target.texture : null;
      U.uUnavailable.value = target ? 0 : 1;
    }
  }

  Dispose() {
    this.material.dispose();
    this.materialDebug.dispose();
    this.grainTexture?.dispose();
  }
}
