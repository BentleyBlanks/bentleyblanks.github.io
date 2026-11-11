// Script_PostStunTrail.mjs — 近爆眩晕的拖影：合成之后的帧反馈（COD「shellshock」的做法）。
//
// 排在 composite 之后、fxaa 之前：把 composite 的输出（已调色 / 编码的显示域 LDR）与上一帧自己的输出按权重混，
// `out = mix(current, history, w)`，`w = feedback × mix(centerKeep, 1, smoothstep(0.02, 0.30, r²))`
//（画面中心留清楚一点，便于瞄准；边缘拖得最多）。feedback = min(maxFeedback, exp(−dt / tauS))：
// tauS 由 Script_BlastStun 按眩晕强度给（options.stunTrail，秒），帧率无关。
//
// 只在有眩晕时才跑：`Enabled` = 画质档开关 + options.stunTrail > 0 + 没开 reduced-motion。
// 两张输出分辨率的 HalfFloat 靶 ping-pong，**第一次 Enabled 才建**（平时不占显存）；跑的那些帧把 `pipeline.targets.ldr`
// 改指到本帧输出（fxaa 读它），`Idle` 在不跑的帧还原成 composite 的靶并作废历史。尺寸一变（Resize）重建并作废历史。
// 旋钮在 Data_Tuning_BlastReaction.BLAST_STUN.trail（契约 12）。
import { MakeFullscreenMaterial, MakeRenderTarget } from "./Script_PostCommon.mjs";
import { BLAST_STUN } from "./Data_Tuning_BlastReaction.mjs";

const FRAG_STUN_TRAIL = /* glsl */`
uniform sampler2D uCurrent;
uniform sampler2D uHistory;
uniform float uFeedback;
uniform float uCenterKeep;
varying vec2 vUv;
void main() {
  vec2 centered = vUv - 0.5;
  float r2 = dot(centered, centered);
  float w = uFeedback * mix(uCenterKeep, 1.0, smoothstep(0.02, 0.30, r2));
  gl_FragColor = vec4(mix(texture2D(uCurrent, vUv).rgb, texture2D(uHistory, vUv).rgb, w), 1.0);
}
`;

export class StunTrailPass {
  constructor(pipeline) {
    this.name = "stunTrail";
    this.pipeline = pipeline;
    this.T = BLAST_STUN.trail;
    this.reducedMotion = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)");
    this.uniforms = {
      uCurrent: { value: null }, uHistory: { value: null },
      uFeedback: { value: 0 }, uCenterKeep: { value: this.T.centerKeep },
    };
    this.material = MakeFullscreenMaterial(FRAG_STUN_TRAIL, this.uniforms);
    this.targets = null;
    this.width = 2; this.height = 2;
    this.index = 0;
    this.hasHistory = false;
    this.feedback = 0;
  }

  /** 此刻本趟拖影的靶（还没建 / 没在跑时为 null）。 */
  get Target() { return this.targets ? this.targets[this.index] : null; }

  Enabled(ctx) {
    return !!ctx.preset.stunTrail && (ctx.options.stunTrail || 0) > 0 && !this.reducedMotion?.matches;
  }

  Resize(width, height) {
    this.width = width; this.height = height;
    this._DisposeTargets();
    this.hasHistory = false;
  }

  Render(ctx) {
    const P = this.pipeline;
    if (!this.targets) {
      this.targets = [MakeRenderTarget(this.width, this.height), MakeRenderTarget(this.width, this.height)];
      this.hasHistory = false;
    }
    const tau = ctx.options.stunTrail;
    const dt = Math.min(0.1, Math.max(1 / 240, ctx.options.dt || 0));
    this.feedback = this.hasHistory ? Math.min(this.T.maxFeedback, Math.exp(-dt / tau)) : 0;
    const history = this.targets[this.index];
    const next = this.targets[1 - this.index];
    const U = this.uniforms;
    U.uCurrent.value = P.compositePass.target.texture;
    U.uHistory.value = history.texture;
    U.uFeedback.value = this.feedback;
    ctx.blitter.Blit(this.material, next);
    this.index = 1 - this.index;
    this.hasHistory = true;
    P.targets.ldr = next;
  }

  Idle() {
    this.hasHistory = false;
    this.feedback = 0;
    const composite = this.pipeline.compositePass;
    if (composite.target) this.pipeline.targets.ldr = composite.target;
  }

  _DisposeTargets() {
    if (!this.targets) return;
    for (const t of this.targets) t.dispose();
    this.targets = null;
  }

  Dispose() {
    this._DisposeTargets();
    this.material.dispose();
  }
}

export default StunTrailPass;
