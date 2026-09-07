// 《台儿庄：血战滕县》TAA / TAAU：UE 的 Temporal AA + Temporal AA Upsampling。
//
// ## 2026-09 这一轮（TAAU）改了什么
//   1. **速度从预通道 RT1 来**（`ctx.velocityTexture`），不再由深度反投影猜。
//      深度反投影只有相机运动：走动的兵、开过去的大车在历史里必然错位，靠邻域
//      裁剪硬压回去 —— 表现是人物边缘一圈"糊边"，快动时糊成双影。速度靶里
//      蒙皮人物是**逐骨骼**的真速度，重投影一步到位。
//      膨胀仍然做（3×3 最近片元）：轮廓外一圈像素属于背景，不膨胀的话镜头平移时
//      轮廓会挂一圈背景速度的毛边。
//   2. **解算到显示分辨率（TAAU）**。主场景在 `graphics.renderScale` 的内部分辨率跑，
//      TAA 这一趟把它重采样到输出网格：每个输出像素在**输入像素坐标系**里找到自己的
//      中心，对周围 3×3 个输入样本按「输出像素中心 → 该输入样本的实际采样位置
//      （像素中心 + 本帧抖动）」的距离加权。1:1 时这套公式退化成重构前那份
//      「offset + jitter」的 Blackman-Harris 重定心，逐项相同。
//      八个 Halton 相位轮完一圈，输出网格上每个像素都被真实样本覆盖过 —— 这就是
//      UE TAAU「用 8 帧换一张超分」的全部原理。
//   3. **方差裁剪**（Salvi 2016 / UE4 `AA_VARIANCE`）：3×3 的 min/max 盒再按 μ ± γσ
//      收紧一次。纯 min/max 对高频高光太松，萤火虫能一直留在盒子里逐帧闪。
//   4. **anti-flicker**：局部亮度对比越高，当前帧权重压得越低（Unity HDRP 的
//      feedback 调制）。高对比像素上"这一帧的采样点"本来就不可信。
//   5. **responsive 掩码**（UE 的 Responsive AA）：第一人称手/枪走高当前帧权重。
//      它们的速度恒为 0（预通道明写），世界在它们背后滑过时历史会把瞄具边缘
//      拖出一条虚影；responsive 让它们几乎只用当前帧。
//      没有 stencil 通道，掩码由预通道的前景标签（视深 == FOREGROUND_VIEW_DEPTH）认。
//
// 方案与参数仍对齐 UE 缺省（`TemporalAA.usf` + 出厂 CVar），口径表在
// `Data_Tuning_TemporalDof.TAAU`：
//   r.TemporalAASamples = 8               → Halton(2,3) 八相位子像素抖动
//   r.TemporalAACurrentFrameWeight = 0.04 → 当前帧权重 0.04，历史占 0.96
//   Blackman-Harris 3.3 的高斯拟合 exp(-2.29 r²) 做当前帧重采样
//   历史用 Catmull-Rom 5-tap 重采样（双线性会把几十帧重投影抹成油画）
//   邻域裁剪在 YCoCg 空间做 rounded AABB（3×3 大盒与十字小盒对折）
//   快动时权重向 0.2 抬（lerp(w, 0.2, saturate(velocityPx / 40))）
//   混合在 Karis tonemap 域（c / (1 + luma)）做，防高亮 firefly 帧间闪
//
// **运行时状态仍然挂在 PostPipeline 上**（`post.taaEnabled` / `post.hasTaaHistory` /
// `post.taaFlip` / `post.taaJitterScale`）：一堆测试与画质面板直接写它们。

import * as THREE from "three";
import { MakeFullscreenMaterial, MakeRenderTarget, GLSL_COMMON } from "./Script_PostCommon.mjs";
import { TAAU } from "./Data_Tuning_TemporalDof.mjs";

export const TAA_SAMPLES = 8;
export const TAA_CURRENT_FRAME_WEIGHT = TAAU.currentFrameWeight;

function Halton(index, base) {
  let f = 1, r = 0, i = index;
  while (i > 0) { f /= base; r += f * (i % base); i = Math.floor(i / base); }
  return r;
}
// 与 UE 一致从 1 起数（index 0 是 0，落在像素角上，八点分布会缺一角）
export const TAA_JITTER = [];
for (let i = 1; i <= TAA_SAMPLES; i += 1) {
  TAA_JITTER.push([Halton(i, 2) - 0.5, Halton(i, 3) - 0.5]);
}

const FRAG_TAA = /* glsl */`
uniform sampler2D uCurrent;        // 主场景 HDR（**内部分辨率**）
uniform sampler2D uHistory;        // 历史（**输出分辨率**）
uniform sampler2D uNormalDepth;    // 预通道 RT0（内部分辨率）
uniform sampler2D uVelocity;       // 预通道 RT1（逐物体速度，单位 uv，内部分辨率）
uniform float uUseVelocityBuffer;  // 1 = 读 uVelocity，0 = 深度反投影兜底
uniform vec2 uSourceResolution;    // 内部分辨率
uniform vec2 uSourceTexel;
uniform vec2 uHistoryResolution;   // 输出分辨率（= 本趟写入靶）
uniform vec2 uHistoryTexel;
uniform vec2 uJitter;              // 本帧抖动（输入像素）
uniform float uCurrentWeight;      // UE r.TemporalAACurrentFrameWeight
uniform float uHasHistory;
uniform mat4 uInvView;
uniform mat4 uPrevViewProjection;
uniform vec2 uProjScale;
uniform float uFilterK;            // Blackman-Harris 高斯拟合系数
uniform float uVarianceGamma;      // 方差裁剪 γ（0 = 只用 min/max 盒）
uniform float uAntiFlicker;
uniform float uAntiFlickerFloor;
uniform float uResponsiveWeight;
uniform float uForegroundDepth;    // 预通道的前景标签（0 = 不做 responsive）
uniform float uForegroundEps;
uniform float uMinWeight;
uniform float uFastMotionWeight;
uniform float uFastMotionPx;
uniform float uDebugMode;          // 1 = 输出 (权重, 裁剪量, responsive) 供调试视图
varying vec2 vUv;
${GLSL_COMMON}

// Karis tonemap 域：混合前把 HDR 压进 [0,1)。不压的话一个 40.0 的火光
// firefly 会把邻域盒撑到天上，历史裁剪失效，表现是高亮点逐帧闪。
vec3 TonemapWeight(vec3 c) { return c / (1.0 + Luma(c)); }
vec3 TonemapUnweight(vec3 c) { return c / max(1.0 - Luma(c), 1e-4); }

vec3 RgbToYcocg(vec3 c) {
  return vec3(0.25 * c.r + 0.5 * c.g + 0.25 * c.b,
              0.5 * c.r - 0.5 * c.b,
             -0.25 * c.r + 0.5 * c.g - 0.25 * c.b);
}
vec3 YcocgToRgb(vec3 c) {
  return max(vec3(c.x + c.y - c.z, c.x + c.z, c.x - c.y - c.z), vec3(0.0));
}

vec3 ViewPos(vec2 uv, float depth) {
  vec2 ndc = uv * 2.0 - 1.0;
  return vec3(ndc.x / uProjScale.x, ndc.y / uProjScale.y, -1.0) * depth;
}

// Catmull-Rom 5-tap（Jimenez 的 9→5 优化）：负瓣双三次抵消重投影
// 反复双线性插值的累积模糊。角上四个权重最小的 tap 省掉，误差不可见。
// **在输出分辨率的历史靶上做** —— TAAU 下历史与当前帧不是同一个网格。
vec3 SampleHistory(vec2 uv) {
  vec2 samplePos = uv * uHistoryResolution;
  vec2 tc1 = floor(samplePos - 0.5) + 0.5;
  vec2 f = samplePos - tc1;
  vec2 w0 = f * (-0.5 + f * (1.0 - 0.5 * f));
  vec2 w1 = 1.0 + f * f * (-2.5 + 1.5 * f);
  vec2 w2 = f * (0.5 + f * (2.0 - 1.5 * f));
  vec2 w3 = f * f * (-0.5 + 0.5 * f);
  vec2 w12 = w1 + w2;
  vec2 p0 = (tc1 - 1.0) * uHistoryTexel;
  vec2 p3 = (tc1 + 2.0) * uHistoryTexel;
  vec2 p12 = (tc1 + w2 / w12) * uHistoryTexel;
  vec3 acc = texture2D(uHistory, vec2(p12.x, p0.y)).rgb * (w12.x * w0.y)
           + texture2D(uHistory, vec2(p0.x, p12.y)).rgb * (w0.x * w12.y)
           + texture2D(uHistory, vec2(p12.x, p12.y)).rgb * (w12.x * w12.y)
           + texture2D(uHistory, vec2(p3.x, p12.y)).rgb * (w3.x * w12.y)
           + texture2D(uHistory, vec2(p12.x, p3.y)).rgb * (w12.x * w3.y);
  float wsum = w12.x * w0.y + w0.x * w12.y + w12.x * w12.y
             + w3.x * w12.y + w12.x * w3.y;
  return max(acc / wsum, vec3(0.0));
}

void main() {
  // --- 0) 输出像素落在输入网格的哪里（TAAU 的全部机关就在这四行）---------
  // 输入像素 k 的中心在输入像素坐标系里是 k + 0.5，而它**实际采样到的场景位置**
  // 是 k + 0.5 + jitter（抖动写在投影矩阵上，等价于采样点偏移）。
  // 输出像素中心是 vUv * 输入分辨率。两者的差就是重采样核要吃的距离。
  vec2 centerPos = vUv * uSourceResolution;
  vec2 baseTexel = floor(centerPos);                       // 包含输出中心的那个输入像素
  vec2 baseOffset = (baseTexel + 0.5 + uJitter) - centerPos;

  // --- 1) 3×3 输入邻域一趟拿四样：重采样后的当前帧、YCoCg 包围盒、矩、最近深度 ---
  vec3 filtered = vec3(0.0);
  float weightSum = 0.0;
  vec3 boxMin = vec3(1e5), boxMax = vec3(-1e5);
  vec3 crossMin = vec3(1e5), crossMax = vec3(-1e5);
  vec3 m1 = vec3(0.0), m2 = vec3(0.0);
  float closestDepth = 1e9;
  vec2 closestUv = vUv;
  float centerDepth = 0.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 tap = vec2(float(x), float(y));
      vec2 tapUv = (baseTexel + 0.5 + tap) * uSourceTexel;
      vec3 c = RgbToYcocg(TonemapWeight(texture2D(uCurrent, tapUv).rgb));
      // 距离以**输入像素**为单位。换成输出像素会让核比输出采样间距还窄，
      // 某些输出像素整帧只落到一个输入样本上，时域补不回来（会抖）。
      vec2 d = baseOffset + tap;
      float w = exp(-uFilterK * dot(d, d));
      filtered += c * w;
      weightSum += w;
      boxMin = min(boxMin, c);
      boxMax = max(boxMax, c);
      if (x == 0 || y == 0) { crossMin = min(crossMin, c); crossMax = max(crossMax, c); }
      m1 += c;
      m2 += c * c;
      float depth = texture2D(uNormalDepth, tapUv).w;
      if (x == 0 && y == 0) centerDepth = depth;
      // 天空（w=0）当远处理：大深度下重投影退化成纯旋转视差，正是天该有的
      float dd = depth <= 0.0 ? 400.0 : depth;
      if (dd < closestDepth) { closestDepth = dd; closestUv = tapUv; }
    }
  }
  filtered /= max(weightSum, 1e-5);
  // 3×3 大盒对斜边太松（鬼影漏过去），十字小盒太紧（细节闪），
  // 对折是 UE 的 rounded AABB，两头都稳
  boxMin = 0.5 * (boxMin + crossMin);
  boxMax = 0.5 * (boxMax + crossMax);
  // 方差裁剪（Salvi 2016 / UE4 AA_VARIANCE）：把盒子再按 μ ± γσ 收一次。
  // γ 越小越稳（闪烁少、鬼影多），越大越锐。
  if (uVarianceGamma > 0.0) {
    vec3 mu = m1 / 9.0;
    vec3 sigma = sqrt(max(m2 / 9.0 - mu * mu, vec3(0.0)));
    boxMin = max(boxMin, mu - uVarianceGamma * sigma);
    boxMax = min(boxMax, mu + uVarianceGamma * sigma);
    boxMin = min(boxMin, filtered);      // 当前帧自己永远要在盒子里，否则会自锁
    boxMax = max(boxMax, filtered);
  }

  // --- 2) 速度：优先读预通道 RT1（逐物体），退路是相机深度反投影 --------
  // 两条路都在**最近片元**上取（closest-fragment dilation）。
  vec3 viewPos = ViewPos(closestUv, closestDepth);
  vec4 world = uInvView * vec4(viewPos, 1.0);
  vec4 prevClip = uPrevViewProjection * world;
  vec2 prevUvClosest = (prevClip.xy / max(abs(prevClip.w), 1e-4)) * 0.5 + 0.5;
  vec2 velocity = closestUv - prevUvClosest;
  bool clipValid = prevClip.w > 0.0;
  if (uUseVelocityBuffer > 0.5) {
    velocity = texture2D(uVelocity, closestUv).xy;
    clipValid = true;                    // 速度靶自带钳制与首帧归零，不需要 w 判据
  }
  vec2 prevUv = vUv - velocity;

  bool offscreen = prevUv.x < 0.0 || prevUv.x > 1.0
                || prevUv.y < 0.0 || prevUv.y > 1.0;
  if (uHasHistory < 0.5 || offscreen || !clipValid) {
    vec3 first = TonemapUnweight(YcocgToRgb(filtered));
    gl_FragColor = uDebugMode > 0.5 ? vec4(1.0, 0.0, 0.0, 1.0) : vec4(first, 1.0);
    return;
  }

  // --- 3) 历史：Catmull-Rom 采样 → 裁进邻域盒（防遮挡变化的鬼影）---------
  vec3 history = RgbToYcocg(TonemapWeight(SampleHistory(prevUv)));
  vec3 center = 0.5 * (boxMax + boxMin);
  vec3 extent = 0.5 * (boxMax - boxMin) + 1e-5;
  vec3 dir = history - center;
  float t = min(min(extent.x / max(abs(dir.x), 1e-6),
                    extent.y / max(abs(dir.y), 1e-6)),
                    extent.z / max(abs(dir.z), 1e-6));
  float clipAmount = 1.0 - clamp(t, 0.0, 1.0);   // 0 = 历史原样可用，1 = 被整个拉回盒边
  history = center + dir * clamp(t, 0.0, 1.0);

  // --- 4) 混合权重 -----------------------------------------------------
  // ① anti-flicker 只压**静止**那一档：局部亮度对比越高越信历史，因为高对比
  //    像素上「这一帧恰好采到哪」本身就是噪声源（HDRP 的 feedback 调制同一件事）。
  //    **必须压在 mix 之前**：压在之后的话快动像素的 0.2 会被一起压到 0.07，
  //    邻域裁剪来不及跟上，运动物体的边就开始拖影 —— 那正是要避免的那一头。
  float stillWeight = uCurrentWeight;
  if (uAntiFlicker > 0.0) {
    float contrast = (boxMax.x - boxMin.x) / max(0.5 * (boxMax.x + boxMin.x), 0.05);
    stillWeight *= mix(1.0, uAntiFlickerFloor, clamp(contrast * uAntiFlicker, 0.0, 1.0));
  }
  // ② 静止吃上面那一档（UE 缺省 0.04），快动向 0.2 抬减少拖尾
  float velocityPx = length(velocity * uHistoryResolution);
  float w = mix(stillWeight, uFastMotionWeight,
                clamp(velocityPx / max(uFastMotionPx, 1.0), 0.0, 1.0));
  // ③ responsive（UE ResponsiveAA）：第一人称手/枪几乎只用当前帧。
  //    预通道给它们写的是常数前景标签深度，速度恒 0 —— 世界在它们背后滑过时
  //    历史会把瞄具边缘拖出一条虚影，正是 FPS 手感的红线。
  float responsive = 0.0;
  if (uForegroundDepth > 0.0 && abs(centerDepth - uForegroundDepth) < uForegroundEps) {
    responsive = 1.0;
    w = max(w, uResponsiveWeight);
  }
  w = clamp(max(w, uMinWeight), 0.0, 1.0);

  if (uDebugMode > 0.5) {
    gl_FragColor = vec4(w, clipAmount, responsive, 1.0);
    return;
  }
  vec3 blended = mix(history, filtered, w);
  vec3 result = TonemapUnweight(YcocgToRgb(blended));
  // NaN 杀手（UE 同款）：历史里一旦混进 NaN 会永久驻留且逐帧扩散一圈
  if (any(isnan(result))) result = TonemapUnweight(YcocgToRgb(filtered));
  gl_FragColor = vec4(result, 1.0);
}
`;

export class TaaPass {
  constructor(pipeline) {
    this.name = "taa";
    this.pipeline = pipeline;
    this.uniforms = {
      uCurrent: { value: null }, uHistory: { value: null }, uNormalDepth: { value: null },
      uVelocity: { value: null }, uUseVelocityBuffer: { value: 0 },
      uSourceResolution: { value: new THREE.Vector2(2, 2) },
      uSourceTexel: { value: new THREE.Vector2(0.5, 0.5) },
      uHistoryResolution: { value: new THREE.Vector2(2, 2) },
      uHistoryTexel: { value: new THREE.Vector2(0.5, 0.5) },
      uJitter: { value: new THREE.Vector2() },
      uCurrentWeight: { value: TAAU.currentFrameWeight },
      uHasHistory: { value: 0 },
      uInvView: { value: new THREE.Matrix4() },
      uPrevViewProjection: { value: new THREE.Matrix4() },
      uProjScale: { value: new THREE.Vector2(1, 1) },
      uFilterK: { value: TAAU.filterGaussianK },
      uVarianceGamma: { value: TAAU.varianceGamma },
      uAntiFlicker: { value: TAAU.antiFlicker },
      uAntiFlickerFloor: { value: TAAU.antiFlickerFloor },
      uResponsiveWeight: { value: TAAU.responsiveWeight },
      uForegroundDepth: { value: 0 },
      uForegroundEps: { value: TAAU.responsiveDepthEps },
      uMinWeight: { value: TAAU.historyClampMinWeight },
      uFastMotionWeight: { value: TAAU.fastMotionWeight },
      uFastMotionPx: { value: TAAU.fastMotionPx },
      uDebugMode: { value: 0 },
    };
    this.material = MakeFullscreenMaterial(FRAG_TAA, this.uniforms);
    /** `taaWeight` 调试视图那一张（只在选中时才产出，平时是 null）。 */
    this.debugTarget = null;
    /**
     * 强制走深度反投影那条老路（A/B 取证用，`Script_TaauTest` 靠它量鬼影）。
     * 出厂 false —— 速度靶在就用速度靶。
     */
    this.forceDepthReprojection = false;
  }

  /**
   * 历史靶按 `pipeline.taaEnabled` 建，不按画质档 —— 否则 low 档打开开关也没有靶可写。
   * **尺寸是解算分辨率**（TAAU 开着时 = 输出分辨率），由编排器的 SetSize 传进来。
   */
  Resize(width, height) {
    const T = this.pipeline.targets;
    if (T.taaA) { T.taaA.dispose(); delete T.taaA; }
    if (T.taaB) { T.taaB.dispose(); delete T.taaB; }
    this.debugTarget = null;
    if (this.pipeline.taaEnabled) {
      // TAA 历史乒乓：解算分辨率的 HDR。尺寸一变历史就作废（uv 对不上位），
      // taaFlip/hasTaaHistory 由 SetSize 统一清。
      T.taaA = MakeRenderTarget(width, height, { type: this.pipeline.hdrType });
      T.taaB = MakeRenderTarget(width, height, { type: this.pipeline.hdrType });
    }
  }

  /** 运行时热切用（SetTaaEnabled 调）。关掉立刻还显存。 */
  SyncTargets() {
    const P = this.pipeline;
    const T = P.targets;
    const w = P.resolveWidth || P.width;
    const h = P.resolveHeight || P.height;
    if (P.taaEnabled) {
      if (!T.taaA || T.taaA.width !== w || T.taaA.height !== h) {
        if (T.taaA) T.taaA.dispose();
        if (T.taaB) T.taaB.dispose();
        T.taaA = MakeRenderTarget(w, h, { type: P.hdrType });
        T.taaB = MakeRenderTarget(w, h, { type: P.hdrType });
      }
    } else if (T.taaA) {
      T.taaA.dispose();
      T.taaB.dispose();
      delete T.taaA;
      delete T.taaB;
      this.debugTarget = null;
    }
  }

  /**
   * 本帧到底跑不跑 TAA。
   * `options.taa === false` 是**逐次调用**的 escape hatch（A/B 像素对比测试用），
   * 与面板那一位（taaEnabled）是两回事：前者不动状态，只是这一趟不跑。
   * 纯线框模式也不抖：那一趟的输出绕过 TAA 解算直接送屏，抖动只会让 1 px 的线爬。
   */
  Enabled(ctx) { return ctx.taaActive; }

  /**
   * 子像素抖动：Halton(2,3) 八相位（UE r.TemporalAASamples=8）。
   * 直接改投影矩阵第三列的 x/y：e[8] 加 δ 会让 NDC 平移 -δ（透视除法 w=-z），
   * 即整幅画面平移 -jitter 像素 —— 等价于本帧采样点落在"像素中心 + jitter"。
   * 预通道与主场景同用这份矩阵（深度与颜色必须同一套抖动，SSAO 拷的投影
   * 矩阵也是它，自洽）；主场景画完立刻还原，太阳投影、prevViewProjection
   * 与运动模糊拿到的都是干净矩阵。
   *
   * **除以的是内部分辨率**（主场景那一趟的像素格），TAAU 下不是输出分辨率。
   */
  ApplyJitter(ctx) {
    const P = this.pipeline;
    if (!ctx.taaActive) { ctx.jitterX = 0; ctx.jitterY = 0; return; }
    const jitter = TAA_JITTER[ctx.frame % TAA_SAMPLES];
    ctx.jitterX = jitter[0] * P.taaJitterScale;
    ctx.jitterY = jitter[1] * P.taaJitterScale;
    const pe = ctx.camera.projectionMatrix.elements;
    P.savedProj8 = pe[8];
    P.savedProj9 = pe[9];
    pe[8] += (ctx.jitterX * 2) / P.width;
    pe[9] += (ctx.jitterY * 2) / P.height;
  }

  RemoveJitter(ctx) {
    const P = this.pipeline;
    if (!ctx.taaActive) return;
    const pe = ctx.camera.projectionMatrix.elements;
    pe[8] = P.savedProj8;
    pe[9] = P.savedProj9;
  }

  Render(ctx) {
    const P = this.pipeline;
    const T = P.targets;
    const read = P.taaFlip ? T.taaB : T.taaA;
    const write = P.taaFlip ? T.taaA : T.taaB;
    const U = this.uniforms;
    U.uCurrent.value = T.hdr.texture;
    U.uHistory.value = read.texture;
    U.uNormalDepth.value = ctx.normalDepthTexture;
    U.uVelocity.value = ctx.velocityTexture;
    // 速度靶在就用它。深度反投影那条路留着不是为了 A/B，是为了 hdrCapable=false
    // 的机器（没有浮点靶就没有 RT1）与 velocity 档位关掉的情形。
    U.uUseVelocityBuffer.value = ctx.velocityTexture && !this.forceDepthReprojection ? 1 : 0;
    U.uSourceResolution.value.set(P.width, P.height);
    U.uSourceTexel.value.set(1 / P.width, 1 / P.height);
    U.uHistoryResolution.value.set(write.width, write.height);
    U.uHistoryTexel.value.set(1 / write.width, 1 / write.height);
    U.uJitter.value.set(ctx.jitterX, ctx.jitterY);
    U.uProjScale.value.copy(ctx.projScale);
    U.uInvView.value.copy(ctx.invView);
    U.uPrevViewProjection.value.copy(ctx.prevViewProjection);
    U.uHasHistory.value = P.hasTaaHistory && P.hasPrev ? 1 : 0;
    U.uForegroundDepth.value = P.foregroundViewDepth ?? 0;
    U.uDebugMode.value = 0;
    ctx.blitter.Blit(this.material, write);
    P.taaFlip = !P.taaFlip;
    P.hasTaaHistory = true;
    ctx.sceneColor = write;

    // 调试视图 `taaWeight`：再跑一趟同一份材质，只改 uDebugMode。**只在选中时**，
    // 平时零成本。写进池子的瞬时靶，不污染历史乒乓。
    if (P.debugView === "taaWeight") {
      const debugTarget = ctx.pool.Rent("taaDebug", write.width, write.height,
        { type: P.hdrType });
      U.uDebugMode.value = 1;
      ctx.blitter.Blit(this.material, debugTarget);
      U.uDebugMode.value = 0;
      this.debugTarget = debugTarget;
    } else {
      this.debugTarget = null;
    }
  }

  Dispose() {
    this.material.dispose();
  }
}
