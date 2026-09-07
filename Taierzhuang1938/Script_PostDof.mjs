// 《台儿庄：血战滕县》散景景深：COD:AW 那一套四段式 gather。
//
// 参考实现：Jimenez, "Next Generation Post Processing in Call of Duty: Advanced
// Warfare"（SIGGRAPH 2014 Course）的 DOF 一节。四趟：
//   1. **降采样 + 预滤波**（半分辨率）：rgb = Karis 加权平均的颜色（压掉会在
//      散景里放大成一坨的 firefly），a = **带符号 CoC**（远景为正、近景为负，像素）。
//   2. **主 gather**（半分辨率，MRT 两路）：48 抽样同心环，近场与远场**分开算**。
//      远场按「样本自己的 CoC 够不够覆盖到中心」加权（scatter-as-gather）；
//      近场按**固定的最大近景半径**采集，因为近景要往画面外/往清楚的背景上渗。
//   3. **填洞**（半分辨率，只做近场）：近场在半分辨率上采集必然留空洞（前景轮廓
//      内侧一圈），3×3 取覆盖度最大的补上。
//   4. **上采样合成**（输出分辨率）：远场按本像素 CoC 混、近场按覆盖度 alpha 盖上去。
//
// ## CoC 是物理的（薄透镜），幅度归一到既有的美术上限
// ```
//   coc = A·f·(d − dF) / (d·(dF − f))     A = f/N
//   coc/coc(∞) = 1 − dF/d                 ← **形状只由焦平面 dF 决定，光圈只改幅度**
// ```
// 所以这一版把「形状」交给薄透镜（远景随距离渐进逼近上限，而不是像旧版
// `smoothstep(focus, focus+range)` 那样在 focus+range 处一刀切平），把「幅度」
// 归一到调用点原来给的 `dofMaxPx` / `nearDofMaxPx`。**调用点一个字不用改，
// 画面上限也不变**，变的是中间那段的过渡曲线（更像真镜头）。
// 想要真·光圈驱动（改 f/N 就改虚化量）把 `DOF.apertureDriven` 置 true。
//
// ## 前景（第一人称手/枪）
// 预通道给它写常数近景标签深度（`FOREGROUND_VIEW_DEPTH`）。这里三处认它：
// CoC 恒 0、不进近场采集、合成时直接返回原色。开镜（ADS）那一档的全部意义
// 就是「贴眼的掩体糊、正在瞄的枪锐」，认错一处这条就废了。

import * as THREE from "three";
import { MakeFullscreenMaterial, MakeRenderTarget, GLSL_COMMON } from "./Script_PostCommon.mjs";
import { DOF } from "./Data_Tuning_TemporalDof.mjs";

/** CoC 的公共声明与算式。DoF 自己、调试视图（Script_PostFxaa）共用同一份。 */
export const GLSL_COC = /* glsl */`
uniform float uFocus;          // 焦平面（米，线性视深）
uniform float uFarGain;        // 远景幅度（像素）：coc(∞) 的绝对值
uniform float uNearGain;       // 近景幅度（像素）
uniform float uFarMaxPx;
uniform float uNearMaxPx;
uniform float uForegroundDepth;
uniform float uForegroundEps;

bool IsForeground(float viewDepth) {
  return uForegroundDepth > 0.0 && abs(viewDepth - uForegroundDepth) < uForegroundEps;
}

/** 带符号 CoC（输出像素）。正 = 远景散焦，负 = 近景散焦，0 = 合焦。 */
float CocPx(float viewDepth) {
  if (viewDepth <= 0.0) return uFarMaxPx;          // 天空：无穷远
  if (IsForeground(viewDepth)) return 0.0;         // 第一人称手/枪永远锐
  float rel = 1.0 - uFocus / max(viewDepth, 0.02);
  float coc = rel >= 0.0 ? rel * uFarGain : rel * uNearGain;
  return clamp(coc, -uNearMaxPx, uFarMaxPx);
}
`;

// --- 1) 降采样 + 预滤波 -----------------------------------------------------
const FRAG_DOF_DOWN = /* glsl */`
uniform sampler2D uColor;
uniform sampler2D uNormalDepth;
uniform vec2 uColorTexel;
varying vec2 vUv;
${GLSL_COMMON}
${GLSL_COC}
void main() {
  vec3 sum = vec3(0.0);
  float weightSum = 0.0;
  float coc = 0.0;
  for (int y = 0; y < 2; y++) {
    for (int x = 0; x < 2; x++) {
      vec2 offset = (vec2(float(x), float(y)) - 0.5) * uColorTexel;
      vec3 c = texture2D(uColor, vUv + offset).rgb;
      // Karis 平均：亮度越高权重越低。不做的话一个高光点会在 48 抽样的
      // 散景盘里被复制成 48 个亮斑（"firefly 变成一串珠子"）。
      float w = 1.0 / (1.0 + Luma(c));
      sum += c * w;
      weightSum += w;
      float d = texture2D(uNormalDepth, vUv + offset).w;
      float c4 = CocPx(d);
      // 取**绝对值最大**的那个：近场要往外渗，保守一点才不会在轮廓上留硬边。
      if (abs(c4) > abs(coc)) coc = c4;
    }
  }
  gl_FragColor = vec4(sum / max(weightSum, 1e-4), coc);
}
`;

// --- 2) 主 gather（近/远两路 MRT）-------------------------------------------
function MakeGatherFrag(samples) {
  return /* glsl */`
precision highp float;
uniform sampler2D uSource;      // 半分辨率：rgb = 颜色，a = 带符号 CoC（输出像素）
uniform vec2 uTexel;            // 1 / 半分辨率
uniform float uNearRadius;      // 近场固定采集半径（本靶像素）
uniform float uCocScale;        // 输出像素 → 本靶像素（= 本靶宽 / 输出宽）
uniform float uFrame;
varying vec2 vUv;
${GLSL_COMMON}
layout(location = 0) out vec4 oNear;
layout(location = 1) out vec4 oFar;

void main() {
  vec4 center = texture2D(uSource, vUv);
  float cocCenter = center.a;
  float farRadius = max(cocCenter, 0.0) * uCocScale;
  vec3 farSum = center.rgb * 1.0;
  float farWeight = 1.0;
  vec3 nearSum = vec3(0.0);
  float nearWeight = 0.0;
  // 每像素旋转整个采样盘：固定角度会让所有散景对齐成同一朵花。
  float rot = Ign(gl_FragCoord.xy + uFrame * 1.37) * 6.2831853;

  for (int i = 0; i < ${samples}; i++) {
    float fi = float(i);
    // 三个同心环 8 / 16 / 24（外环样本多，面积权重才均匀）
    float ring = i < 8 ? 1.0 : (i < 24 ? 2.0 : 3.0);
    float idx = i < 8 ? fi : (i < 24 ? fi - 8.0 : fi - 24.0);
    float cnt = i < 8 ? 8.0 : (i < 24 ? 16.0 : 24.0);
    float rf = ring / 3.0;
    float angle = (idx + 0.5) / cnt * 6.2831853 + rot + ring * 0.7;
    vec2 dir = vec2(cos(angle), sin(angle)) * rf;

    // 远场：只有 CoC 够大、能覆盖到中心的**远景**样本才算数（scatter-as-gather）
    if (farRadius > 0.5) {
      vec2 offset = dir * farRadius;
      vec4 s = texture2D(uSource, vUv + offset * uTexel);
      float cocS = max(s.a, 0.0) * uCocScale;
      float w = clamp(cocS - length(offset) + 1.0, 0.0, 1.0);
      farSum += s.rgb * w;
      farWeight += w;
    }
    // 近场：按**最大**近景半径采，让前景往清楚的背景上渗（这是近景景深的全部意义）
    if (uNearRadius > 0.5) {
      vec2 offset = dir * uNearRadius;
      vec4 s = texture2D(uSource, vUv + offset * uTexel);
      float cocS = max(-s.a, 0.0) * uCocScale;
      float w = clamp(cocS - length(offset) + 1.0, 0.0, 1.0);
      nearSum += s.rgb * w;
      nearWeight += w;
    }
  }

  // 近场覆盖度：本像素自己是近景就直接满，否则看采到多少近景样本。
  float selfNear = clamp(max(-cocCenter, 0.0) * uCocScale, 0.0, 1.0);
  float gathered = clamp(nearWeight / (float(${samples}) * 0.25), 0.0, 1.0);
  float coverage = max(selfNear, gathered);
  oNear = vec4(nearSum / max(nearWeight, 1e-4), coverage);
  oFar = vec4(farSum / max(farWeight, 1e-4), farRadius > 0.5 ? 1.0 : 0.0);
}
`;
}

// --- 3) 填洞（只做近场）-----------------------------------------------------
const FRAG_DOF_FILL = /* glsl */`
uniform sampler2D uNear;
uniform vec2 uTexel;
uniform float uRadius;
varying vec2 vUv;
void main() {
  vec4 best = texture2D(uNear, vUv);
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec4 s = texture2D(uNear, vUv + vec2(float(x), float(y)) * uRadius * uTexel);
      // 取覆盖度最高的那个：半分辨率采集在前景轮廓内侧必然留空洞，
      // 不补的话合成之后能看见一圈锯齿状的锐利残留。
      if (s.a > best.a) best = s;
    }
  }
  gl_FragColor = best;
}
`;

// --- 4) 上采样合成 ---------------------------------------------------------
const FRAG_DOF_COMPOSITE = /* glsl */`
uniform sampler2D uColor;
uniform sampler2D uNormalDepth;
uniform sampler2D uNear;
uniform sampler2D uFar;
uniform float uFarBlendPx;
uniform float uNearCoverageGain;
uniform float uMinCocPx;
varying vec2 vUv;
${GLSL_COMMON}
${GLSL_COC}
void main() {
  float depth = texture2D(uNormalDepth, vUv).w;
  vec3 sharp = texture2D(uColor, vUv).rgb;
  if (IsForeground(depth)) {          // 第一人称手/枪：原样送走
    gl_FragColor = vec4(sharp, 1.0);
    return;
  }
  float coc = CocPx(depth);
  vec4 far = texture2D(uFar, vUv);
  vec4 near = texture2D(uNear, vUv);
  // 远场按**本像素自己的** CoC 混：合焦的东西不会被邻居的散景糊掉。
  float farBlend = clamp((coc - uMinCocPx) / max(uFarBlendPx, 1e-3), 0.0, 1.0) * far.a;
  vec3 color = mix(sharp, far.rgb, farBlend);
  // 近场按覆盖度盖上去（前景往前渗，包括渗到合焦的背景上）。
  float nearBlend = clamp(near.a * uNearCoverageGain, 0.0, 1.0);
  gl_FragColor = vec4(mix(color, near.rgb, nearBlend), 1.0);
}
`;

/** CoC 的一组 uniform（四个 pass + 调试视图共用同一份数值）。 */
function MakeCocUniforms() {
  return {
    uFocus: { value: 1.5 },
    uFarGain: { value: 0 },
    uNearGain: { value: 0 },
    uFarMaxPx: { value: 0 },
    uNearMaxPx: { value: 0 },
    uForegroundDepth: { value: 0 },
    uForegroundEps: { value: 0.002 },
  };
}

export class DofPass {
  constructor(pipeline) {
    this.name = "dof";
    this.pipeline = pipeline;
    this.samples = 48;
    this.scale = pipeline.preset.dofScale > 0 ? pipeline.preset.dofScale : 0.5;
    /** 本帧的 CoC 参数（Prepare 每帧算，调试视图与测试直接读）。 */
    this.coc = { focus: 1.5, farGain: 0, nearGain: 0, farMaxPx: 0, nearMaxPx: 0, active: false };

    this.uniformsDown = {
      uColor: { value: null }, uNormalDepth: { value: null },
      uColorTexel: { value: new THREE.Vector2() },
      ...MakeCocUniforms(),
    };
    this.matDown = MakeFullscreenMaterial(FRAG_DOF_DOWN, this.uniformsDown);

    this.uniformsGather = {
      uSource: { value: null }, uTexel: { value: new THREE.Vector2() },
      uNearRadius: { value: 0 }, uCocScale: { value: 0.5 }, uFrame: { value: 0 },
    };
    this.matGather = MakeFullscreenMaterial(MakeGatherFrag(this.samples), this.uniformsGather,
      { glslVersion: THREE.GLSL3 });

    this.uniformsFill = {
      uNear: { value: null }, uTexel: { value: new THREE.Vector2() },
      uRadius: { value: DOF.nearFillRadius },
    };
    this.matFill = MakeFullscreenMaterial(FRAG_DOF_FILL, this.uniformsFill);

    this.uniforms = {
      uColor: { value: null }, uNormalDepth: { value: null },
      uNear: { value: null }, uFar: { value: null },
      uFarBlendPx: { value: 2.0 }, uNearCoverageGain: { value: DOF.nearCoverageGain },
      uMinCocPx: { value: DOF.minCocPx },
      ...MakeCocUniforms(),
    };
    this.material = MakeFullscreenMaterial(FRAG_DOF_COMPOSITE, this.uniforms);

    this.half = null;
    this.gather = null;      // MRT ×2：[0] 近场、[1] 远场
    this.fill = null;
    this.target = null;
    this.active = false;
  }

  Resize(width, height) {
    for (const rt of [this.half, this.gather, this.fill, this.target]) if (rt) rt.dispose();
    const P = this.pipeline;
    // 半分辨率是 COD:AW 的口径；`dofScale` 再乘一档（ultra = 1.0 → 半分辨率，
    // 其余 0.5 → 四分之一分辨率），够用而且散景本来就是低频。
    const w = Math.max(2, Math.round(width * 0.5 * this.scale));
    const h = Math.max(2, Math.round(height * 0.5 * this.scale));
    const options = { type: P.hdrType };
    this.half = MakeRenderTarget(w, h, options);
    this.gather = MakeRenderTarget(w, h, { ...options, count: 2 });
    this.gather.textures[0].name = "dofNear";
    this.gather.textures[1].name = "dofFar";
    this.fill = MakeRenderTarget(w, h, options);
    this.target = MakeRenderTarget(width, height, options);
    P.targets.dof = this.target;
    P.targets.dofCoc = this.half;
  }

  /**
   * 每帧把调用点那套旧参数（dofStrength / dofFocus / dofRange / dofMaxPx +
   * nearDof*）映射成一组物理 CoC 参数。**跑在 Enabled 之前**，所以景深关着的时候
   * 调试视图也拿得到本帧的正确数值。
   */
  Prepare(ctx) {
    const o = ctx.options || {};
    const farStrength = o.dofStrength ?? 0;
    const nearStrength = o.nearDofStrength ?? 0;
    const farMaxPx = (o.dofMaxPx ?? 11) * Math.min(1, Math.max(0, farStrength));
    const nearMaxPx = (o.nearDofMaxPx ?? 4.5) * Math.min(1, Math.max(0, nearStrength));
    // 焦平面：两条景深理论上互斥（阵亡时不可能在开镜），同时开就以阵亡那条为准。
    const focus = farStrength > 0.001 ? (o.dofFocus ?? 1.5) : (o.nearDofFocus ?? 1.6);
    let farGain = farMaxPx;              // coc(∞) 的绝对值 = 美术上限
    // 近景：把旧的「nearDofFocus − nearDofRange 处达到 nearDofMaxPx」钉住。
    const nearStart = Math.max(0.05, (o.nearDofFocus ?? 1.6) - Math.max(o.nearDofRange ?? 0.85, 0.01));
    const relAtStart = Math.abs(1 - focus / nearStart);
    let nearGain = nearMaxPx / Math.max(relAtStart, 1e-3);
    if (DOF.apertureDriven) {
      // 真·光圈驱动：幅度直接来自 f/N，不再归一到美术上限。
      const f = DOF.focalLengthMm / 1000;
      const aperture = f / Math.max(DOF.fNumber, 0.5);
      const cocInfM = aperture * f / Math.max(focus - f, 1e-4);
      const px = cocInfM / (DOF.sensorWidthMm / 1000) * (this.pipeline.resolveWidth || ctx.width);
      if (farMaxPx > 0) farGain = px;
      if (nearMaxPx > 0) nearGain = px;
    }
    const coc = this.coc;
    coc.focus = focus;
    coc.farGain = farGain;
    coc.nearGain = nearGain;
    coc.farMaxPx = Math.min(farMaxPx, DOF.maxCocPx);
    coc.nearMaxPx = Math.min(nearMaxPx, DOF.maxCocPx);
    coc.active = coc.farMaxPx > 0.01 || coc.nearMaxPx > 0.01;
    const fg = this.pipeline.foregroundViewDepth ?? 0;
    for (const U of [this.uniformsDown, this.uniforms]) {
      U.uFocus.value = coc.focus;
      U.uFarGain.value = coc.farGain;
      U.uNearGain.value = coc.nearGain;
      U.uFarMaxPx.value = coc.farMaxPx;
      U.uNearMaxPx.value = coc.nearMaxPx;
      U.uForegroundDepth.value = fg;
    }
  }

  /** 只在真的有散焦时跑（`dofStrength = 0` 的常态帧一个 GPU 段都不产生）。 */
  Enabled(ctx) {
    this.active = !!(ctx.preset.dof && this.coc.active && this.target);
    return this.active;
  }

  Render(ctx) {
    // 1) 降采样 + CoC
    const UD = this.uniformsDown;
    UD.uColor.value = ctx.sceneColor.texture;
    UD.uNormalDepth.value = ctx.normalDepthTexture;
    UD.uColorTexel.value.set(1 / ctx.sceneColor.width, 1 / ctx.sceneColor.height);
    ctx.blitter.Blit(this.matDown, this.half);

    // 2) 主 gather（近 + 远，一趟出两张）
    const UG = this.uniformsGather;
    const cocScale = this.half.width / Math.max(1, this.target.width);
    UG.uSource.value = this.half.texture;
    UG.uTexel.value.set(1 / this.half.width, 1 / this.half.height);
    UG.uCocScale.value = cocScale;
    // 近场半径按最大近景 CoC 定（换算到这张靶的像素）：近场必须往外渗，
    // 按本像素 CoC 采的话前景根本盖不住背景。
    UG.uNearRadius.value = this.coc.nearMaxPx * cocScale;
    UG.uFrame.value = ctx.frame;
    ctx.blitter.Blit(this.matGather, this.gather);

    // 3) 近场填洞
    const UF = this.uniformsFill;
    UF.uNear.value = this.gather.textures[0];
    UF.uTexel.value.set(1 / this.half.width, 1 / this.half.height);
    ctx.blitter.Blit(this.matFill, this.fill);

    // 4) 上采样合成
    const U = this.uniforms;
    U.uColor.value = ctx.sceneColor.texture;
    U.uNormalDepth.value = ctx.normalDepthTexture;
    U.uNear.value = this.fill.texture;
    U.uFar.value = this.gather.textures[1];
    ctx.blitter.Blit(this.material, this.target);
    ctx.sceneColor = this.target;
  }

  Dispose() {
    for (const rt of [this.half, this.gather, this.fill, this.target]) if (rt) rt.dispose();
    this.half = this.gather = this.fill = this.target = null;
    this.matDown.dispose();
    this.matGather.dispose();
    this.matFill.dispose();
    this.material.dispose();
  }
}
