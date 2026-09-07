// 《台儿庄：血战滕县》TAA：UE 缺省方案照搬。
//
// 2026-09 帧图重构把它从 `Script_Post.mjs` 原样搬出来 —— GLSL、常数、历史乒乓
// 的语义一个字没改。**运行时状态仍然挂在 PostPipeline 上**
// （`post.taaEnabled` / `post.hasTaaHistory` / `post.taaFlip` / `post.taaJitterScale`），
// 因为一堆测试与画质面板直接写它们；这个模块只持有材质、靶与算法。
//
// 方案与参数对齐 UE 的缺省 Temporal AA（Karis, SIGGRAPH 2014 "High Quality
// Temporal Supersampling" + TemporalAA.usf 的出厂 CVar）：
//   r.TemporalAASamples = 8               → Halton(2,3) 八相位子像素抖动
//   r.TemporalAACurrentFrameWeight = 0.04 → 当前帧权重 0.04，历史占 0.96
//   当前帧 3x3 用 Blackman-Harris 3.3 滤波重定心（高斯拟合 exp(-2.29 r²)，
//     权重只依赖本帧抖动，CPU 算好九个数喂 uniform）
//   历史用 Catmull-Rom 5-tap 重采样（双线性会把几十帧重投影抹成油画）
//   邻域裁剪在 YCoCg 空间做 AABB（3x3 大盒与十字小盒对折 = UE 的 rounded box）
//   速度取 3x3 最近片元（closest-fragment dilation），快动时权重向 0.2 抬
//     （UE: lerp(w, 0.2, saturate(velocityPx / 40))）
//   混合在 Karis tonemap 域（c / (1 + luma)）做，防高亮 firefly 帧间闪
//
// **速度来源**：本阶段仍由深度反投影从相机运动推出（与合成 pass 的运动模糊
// 同一套近似）。2026-09 起预通道已经产出逐物体速度靶（`ctx.velocityTexture`），
// 接线点是下面的 `uVelocity` + `uUseVelocityBuffer`：把它置 1 就切过去。
// 出厂仍是 0 —— 切换要连着重新标定邻域裁剪与 `velocityPx/40` 那条曲线，
// 属于 TAAU 那一轮的活，不在地基这一轮。

import * as THREE from "three";
import { MakeFullscreenMaterial, MakeRenderTarget, GLSL_COMMON } from "./Script_PostCommon.mjs";

export const TAA_SAMPLES = 8;
export const TAA_CURRENT_FRAME_WEIGHT = 0.04;
const TAA_FILTER_GAUSSIAN_K = 2.29;

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
// 与 FRAG_TAA 里 TAPS 的次序必须一致（滤波权重按下标对位）
const TAA_OFFSETS = [
  [-1, -1], [0, -1], [1, -1],
  [-1, 0], [0, 0], [1, 0],
  [-1, 1], [0, 1], [1, 1],
];

const FRAG_TAA = /* glsl */`
uniform sampler2D uCurrent;
uniform sampler2D uHistory;
uniform sampler2D uNormalDepth;
uniform sampler2D uVelocity;     // 预通道 RT1（逐物体速度，单位 uv）
uniform float uUseVelocityBuffer; // 0 = 深度反投影（出厂），1 = 读 uVelocity
uniform vec2 uTexel;
uniform vec2 uResolution;
uniform float uWeights[9];       // Blackman-Harris 重定心权重，CPU 已归一
uniform float uCurrentWeight;    // UE r.TemporalAACurrentFrameWeight
uniform float uHasHistory;
uniform mat4 uInvView;
uniform mat4 uPrevViewProjection;
uniform vec2 uProjScale;
varying vec2 vUv;
${GLSL_COMMON}

const vec2 TAPS[9] = vec2[9](
  vec2(-1.0, -1.0), vec2(0.0, -1.0), vec2(1.0, -1.0),
  vec2(-1.0,  0.0), vec2(0.0,  0.0), vec2(1.0,  0.0),
  vec2(-1.0,  1.0), vec2(0.0,  1.0), vec2(1.0,  1.0));

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
vec3 SampleHistory(vec2 uv) {
  vec2 samplePos = uv * uResolution;
  vec2 tc1 = floor(samplePos - 0.5) + 0.5;
  vec2 f = samplePos - tc1;
  vec2 w0 = f * (-0.5 + f * (1.0 - 0.5 * f));
  vec2 w1 = 1.0 + f * f * (-2.5 + 1.5 * f);
  vec2 w2 = f * (0.5 + f * (2.0 - 1.5 * f));
  vec2 w3 = f * f * (-0.5 + 0.5 * f);
  vec2 w12 = w1 + w2;
  vec2 p0 = (tc1 - 1.0) * uTexel;
  vec2 p3 = (tc1 + 2.0) * uTexel;
  vec2 p12 = (tc1 + w2 / w12) * uTexel;
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
  // --- 1) 3x3 邻域一趟拿三样：滤波后的当前帧、YCoCg 包围盒、最近深度 ---
  vec3 filtered = vec3(0.0);
  vec3 boxMin = vec3(1e5), boxMax = vec3(-1e5);
  vec3 crossMin = vec3(1e5), crossMax = vec3(-1e5);
  float closestDepth = 1e9;
  vec2 closestOffset = vec2(0.0);
  for (int i = 0; i < 9; i++) {
    vec2 offset = TAPS[i] * uTexel;
    vec3 c = RgbToYcocg(TonemapWeight(texture2D(uCurrent, vUv + offset).rgb));
    filtered += c * uWeights[i];
    boxMin = min(boxMin, c);
    boxMax = max(boxMax, c);
    if (TAPS[i].x == 0.0 || TAPS[i].y == 0.0) {
      crossMin = min(crossMin, c);
      crossMax = max(crossMax, c);
    }
    float d = texture2D(uNormalDepth, vUv + offset).w;
    // 天空（w=0）当远处理：大深度下重投影退化成纯旋转视差，正是天该有的
    if (d <= 0.0) d = 400.0;
    if (d < closestDepth) { closestDepth = d; closestOffset = offset; }
  }
  // 3x3 大盒对斜边太松（鬼影漏过去），十字小盒太紧（细节闪），
  // 对折是 UE 的 rounded AABB，两头都稳
  boxMin = 0.5 * (boxMin + crossMin);
  boxMax = 0.5 * (boxMax + crossMax);

  // --- 2) 速度：最近片元的相机重投影（closest-fragment dilation）---
  // 取邻域里最近的片元算速度再套给本像素：物体轮廓外一圈像素本属于背景，
  // 不膨胀的话轮廓在镜头平移时会挂一圈背景速度的毛边。
  vec2 uvClosest = vUv + closestOffset;
  vec3 viewPos = ViewPos(uvClosest, closestDepth);
  vec4 world = uInvView * vec4(viewPos, 1.0);
  vec4 prevClip = uPrevViewProjection * world;
  vec2 prevUvClosest = (prevClip.xy / max(abs(prevClip.w), 1e-4)) * 0.5 + 0.5;
  vec2 velocity = uvClosest - prevUvClosest;
  // 逐物体速度靶的接线点（出厂 uUseVelocityBuffer = 0，行为与重构前逐比特相同）。
  if (uUseVelocityBuffer > 0.5) velocity = texture2D(uVelocity, uvClosest).xy;
  vec2 prevUv = vUv - velocity;

  bool offscreen = prevUv.x < 0.0 || prevUv.x > 1.0
                || prevUv.y < 0.0 || prevUv.y > 1.0;
  if (uHasHistory < 0.5 || offscreen || prevClip.w <= 0.0) {
    gl_FragColor = vec4(TonemapUnweight(YcocgToRgb(filtered)), 1.0);
    return;
  }

  // --- 3) 历史：Catmull-Rom 采样 → 裁进邻域盒（防遮挡变化的鬼影）---
  vec3 history = RgbToYcocg(TonemapWeight(SampleHistory(prevUv)));
  vec3 center = 0.5 * (boxMax + boxMin);
  vec3 extent = 0.5 * (boxMax - boxMin) + 1e-5;
  vec3 dir = history - center;
  float t = min(min(extent.x / max(abs(dir.x), 1e-6),
                    extent.y / max(abs(dir.y), 1e-6)),
                    extent.z / max(abs(dir.z), 1e-6));
  history = center + dir * clamp(t, 0.0, 1.0);

  // --- 4) 混合：静止 0.04（UE 缺省），快动向 0.2 抬减少拖尾 ---
  float velocityPx = length(velocity * uResolution);
  float w = mix(uCurrentWeight, 0.2, clamp(velocityPx / 40.0, 0.0, 1.0));
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
      uTexel: { value: new THREE.Vector2() }, uResolution: { value: new THREE.Vector2() },
      uWeights: { value: new Array(9).fill(1 / 9) },
      uCurrentWeight: { value: TAA_CURRENT_FRAME_WEIGHT },
      uHasHistory: { value: 0 },
      uInvView: { value: new THREE.Matrix4() },
      uPrevViewProjection: { value: new THREE.Matrix4() },
      uProjScale: { value: new THREE.Vector2(1, 1) },
    };
    this.material = MakeFullscreenMaterial(FRAG_TAA, this.uniforms);
  }

  /** 历史靶按 `pipeline.taaEnabled` 建，不按画质档 —— 否则 low 档打开开关也没有靶可写。 */
  Resize(width, height) {
    const T = this.pipeline.targets;
    if (T.taaA) { T.taaA.dispose(); delete T.taaA; }
    if (T.taaB) { T.taaB.dispose(); delete T.taaB; }
    if (this.pipeline.taaEnabled) {
      // TAA 历史乒乓：全分辨率 HDR。尺寸一变历史就作废（uv 对不上位），
      // taaFlip/hasTaaHistory 由 SetSize 统一清。
      T.taaA = MakeRenderTarget(width, height, { type: this.pipeline.hdrType });
      T.taaB = MakeRenderTarget(width, height, { type: this.pipeline.hdrType });
    }
  }

  /** 运行时热切用（SetTaaEnabled 调）。关掉立刻还显存。 */
  SyncTargets() {
    const P = this.pipeline;
    const T = P.targets;
    if (P.taaEnabled) {
      if (!T.taaA) {
        T.taaA = MakeRenderTarget(P.width, P.height, { type: P.hdrType });
        T.taaB = MakeRenderTarget(P.width, P.height, { type: P.hdrType });
      }
    } else if (T.taaA) {
      T.taaA.dispose();
      T.taaB.dispose();
      delete T.taaA;
      delete T.taaB;
    }
  }

  /**
   * 本帧到底跑不跑 TAA。
   * `options.taa === false` 是**逐次调用**的 escape hatch（A/B 像素对比测试用），
   * 与面板那一位（taaEnabled）是两回事：前者不动状态，只是这一趟不跑。
   * 纯线框模式也不抖：那一趟的输出绕过 TAA 解算直接送屏，抖动只会让 1 px 的线逐帧爬。
   */
  Enabled(ctx) { return ctx.taaActive; }

  /**
   * 子像素抖动：Halton(2,3) 八相位（UE r.TemporalAASamples=8）。
   * 直接改投影矩阵第三列的 x/y：e[8] 加 δ 会让 NDC 平移 -δ（透视除法 w=-z），
   * 即整幅画面平移 -jitter 像素 —— 等价于本帧采样点落在"像素中心 + jitter"。
   * 预通道与主场景同用这份矩阵（深度与颜色必须同一套抖动，SSAO 拷的投影
   * 矩阵也是它，自洽）；主场景画完立刻还原，太阳投影、prevViewProjection
   * 与运动模糊拿到的都是干净矩阵。
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
    U.uTexel.value.set(1 / P.width, 1 / P.height);
    U.uResolution.value.set(P.width, P.height);
    U.uProjScale.value.copy(ctx.projScale);
    U.uInvView.value.copy(ctx.invView);
    U.uPrevViewProjection.value.copy(ctx.prevViewProjection);
    U.uHasHistory.value = P.hasTaaHistory && P.hasPrev ? 1 : 0;
    // 当前帧 3x3 滤波权重：Blackman-Harris 3.3 的高斯拟合 exp(-2.29 r²)，
    // 围绕本帧子像素采样位置（offset + jitter）重定心。权重只依赖 jitter，
    // 每帧在 CPU 上算九个数，比在着色器里逐像素跑九次 exp 便宜。
    const weights = U.uWeights.value;
    let weightSum = 0;
    for (let i = 0; i < 9; i += 1) {
      const dx = TAA_OFFSETS[i][0] + ctx.jitterX;
      const dy = TAA_OFFSETS[i][1] + ctx.jitterY;
      const w = Math.exp(-TAA_FILTER_GAUSSIAN_K * (dx * dx + dy * dy));
      weights[i] = w;
      weightSum += w;
    }
    for (let i = 0; i < 9; i += 1) weights[i] /= weightSum;
    ctx.blitter.Blit(this.material, write);
    P.taaFlip = !P.taaFlip;
    P.hasTaaHistory = true;
    ctx.sceneColor = write;
  }

  Dispose() {
    this.material.dispose();
  }
}
