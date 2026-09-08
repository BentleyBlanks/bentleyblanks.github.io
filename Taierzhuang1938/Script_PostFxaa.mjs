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
import { GLSL_COC } from "./Script_PostDof.mjs";
import { CAS } from "./Data_Tuning_TemporalDof.mjs";

const FRAG_FXAA = /* glsl */`
uniform sampler2D uSource;
uniform vec2 uTexel;
uniform float uSharpen;   // CAS sharpness，0–1
uniform float uFxaa;      // TAA 开着时置 0：几何锯齿已在时域上解决，FXAA 只会再糊一层
uniform float uCasPeakLow;
uniform float uCasPeakHigh;
varying vec2 vUv;
${GLSL_COMMON}

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
    float coc = CocPx(depth);
    // 焦平面处为 0（深蓝）。远景往暖黄走、近景往洋红走 —— 两侧分色才看得出
    // 「焦平面在不在该在的地方」。
    float farT = clamp(coc / max(uFarMaxPx, 0.001), 0.0, 1.0);
    float nearT = clamp(-coc / max(uNearMaxPx, 0.001), 0.0, 1.0);
    color = vec3(0.015, 0.06, 0.30);
    color = mix(color, vec3(1.0, 0.72, 0.04), farT);
    color = mix(color, vec3(1.0, 0.10, 0.68), nearT);
    if (IsForeground(depth)) color = vec3(0.05, 0.85, 0.35);   // 前景标签：绿
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
    this.pipeline = pipeline;
    this.uniforms = {
      uSource: { value: null }, uTexel: { value: new THREE.Vector2() },
      uSharpen: { value: pipeline.preset.sharpen }, uFxaa: { value: 1 },
      uCasPeakLow: { value: CAS.peakLow }, uCasPeakHigh: { value: CAS.peakHigh },
    };
    this.material = MakeFullscreenMaterial(FRAG_FXAA, this.uniforms);

    this.uniformsDebug = {
      uSource: { value: null }, uNormalDepth: { value: null },
      uMode: { value: 0 }, uUnavailable: { value: 0 },
      uResolution: { value: new THREE.Vector2(2, 2) }, uBlurScale: { value: 0.25 },
      uFocus: { value: 1.5 }, uFarGain: { value: 0 }, uNearGain: { value: 0 },
      uFarMaxPx: { value: 0 }, uNearMaxPx: { value: 0 },
      uForegroundDepth: { value: 0 }, uForegroundEps: { value: 0.002 },
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
    ctx.blitter.Blit(this.material, null);
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
      U.uFocus.value = dof?.coc.focus ?? 1.5;
      U.uFarGain.value = dof?.coc.farGain ?? 0;
      U.uNearGain.value = dof?.coc.nearGain ?? 0;
      U.uFarMaxPx.value = dof?.coc.farMaxPx ?? 0;
      U.uNearMaxPx.value = dof?.coc.nearMaxPx ?? 0;
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
  }
}
