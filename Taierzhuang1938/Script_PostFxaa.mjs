// 《台儿庄：血战滕县》末趟：FXAA 3.11 简化版 + 锐化 → 屏幕。
//
// 跑在 **sRGB 编码之后**：FXAA 的亮度阈值是按感知域标定的，放在线性域会在暗部
// 疯狂涂抹、在亮部几乎不动。TAA 开着时 `uFxaa` 置 0（几何锯齿已经在时域上解决，
// 再糊一层只会掉细节），锐化保留 —— 对应 UE 的 Tonemapper Sharpen。
//
// 2026-09 帧图重构从 `Script_Post.mjs` 原样搬出，GLSL 一个字没改。

import * as THREE from "three";
import { MakeFullscreenMaterial, GLSL_COMMON } from "./Script_PostCommon.mjs";

const FRAG_FXAA = /* glsl */`
uniform sampler2D uSource;
uniform vec2 uTexel;
uniform float uSharpen;
uniform float uFxaa;   // TAA 开着时置 0：几何锯齿已在时域上解决，FXAA 只会再糊一层
varying vec2 vUv;
${GLSL_COMMON}

void main() {
  vec3 rgbNW = texture2D(uSource, vUv + vec2(-1.0, -1.0) * uTexel).rgb;
  vec3 rgbNE = texture2D(uSource, vUv + vec2( 1.0, -1.0) * uTexel).rgb;
  vec3 rgbSW = texture2D(uSource, vUv + vec2(-1.0,  1.0) * uTexel).rgb;
  vec3 rgbSE = texture2D(uSource, vUv + vec2( 1.0,  1.0) * uTexel).rgb;
  vec3 rgbM  = texture2D(uSource, vUv).rgb;

  vec3 aa = rgbM;
  if (uFxaa > 0.5) {
    float lNW = Luma(rgbNW), lNE = Luma(rgbNE), lSW = Luma(rgbSW), lSE = Luma(rgbSE), lM = Luma(rgbM);
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
    aa = (lB < lMin || lB > lMax) ? rgbA : rgbB;
  }

  // 轻锐化（CAS 的思路简化版）：抗锯齿之后画面必然发肉，补回一点边缘
  if (uSharpen > 0.0) {
    vec3 blur = (rgbNW + rgbNE + rgbSW + rgbSE) * 0.25;
    aa = clamp(aa + (aa - blur) * uSharpen, 0.0, 1.0);
  }
  gl_FragColor = vec4(aa, 1.0);
}
`;

export class FxaaPass {
  constructor(pipeline) {
    this.name = "fxaa";
    this.pipeline = pipeline;
    this.uniforms = {
      uSource: { value: null }, uTexel: { value: new THREE.Vector2() },
      uSharpen: { value: pipeline.preset.sharpen }, uFxaa: { value: 1 },
    };
    this.material = MakeFullscreenMaterial(FRAG_FXAA, this.uniforms);
  }

  Enabled() { return true; }

  Resize() { /* 直接送屏，没有自己的靶 */ }

  /**
   * 末趟出画。调试面板要求看中间靶时由 `DebugPass` 接管这一趟（同一个 GPU 段名
   * "fxaa"）—— 编排器按 `pipeline._GetDebugSource()` 的返回值二选一。
   */
  Render(ctx) {
    const debug = this.pipeline.debugPass.GetSource();
    if (debug) {
      this.pipeline.debugPass.RenderView(ctx, debug);
      return;
    }
    this.uniforms.uSource.value = this.pipeline.targets.ldr.texture;
    this.uniforms.uTexel.value.set(1 / ctx.width, 1 / ctx.height);
    this.uniforms.uSharpen.value = ctx.options.sharpen ?? this.pipeline.sharpenStrength;
    this.uniforms.uFxaa.value = ctx.taaActive ? 0 : 1;
    ctx.blitter.Blit(this.material, null);
  }

  Dispose() {
    this.material.dispose();
  }
}
