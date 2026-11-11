// Script_BlastStun.mjs — 近爆眩晕的画面：边缘色散、拖影、重影、发灰发糊、相机慢晃，外加并进耳闷的那一路强度。
//
// **纯规则，不 import three。** 由 Script_Player 持有（this.stun），Player.BlastReaction 喂爆炸（Blast，**永远启用**，
// 不看 flinch.enabled：所有关卡的近爆都有），Player.Update 推进（Update），SyncCamera 把相机慢晃叠在震屏之后
//（不改 yaw/pitch 本体）；Script_Main 读各通道交给后期合成（aberration / hitDisorientation / concussion / stunTrail）
// 与 Script_Audio.SetHitDisorientation。数全在 Data_Tuning_BlastReaction.BLAST_STUN；强度 s 来自
// Script_BlastExposure 的 stun 窗（按装药 / 距离 / 遮挡）。
//
// 每一发是一个事件（最多 maxEvents 个）：冲击到人才开始，attackS 内涨满，停 hold，再指数退；
// 总强度 = 最大的那份 + stackShare × 其余之和，封顶 1（连发不会无限叠）。
// 没有 Math.random：相机慢晃用确定性的值噪声（出图可复现）。calm = true（prefers-reduced-motion）时相机三轴恒 0。
import { Clamp, Clamp01, ValueNoise2 } from "./Script_Noise.mjs";
import { BLAST_STUN } from "./Data_Tuning_BlastReaction.mjs";

const Smooth = (x) => { const t = Clamp01(x); return t * t * (3 - 2 * t); };
const DONE_BELOW = 0.004;

export class BlastStun {
  /** @param {object} [tuning] 默认 BLAST_STUN；测试可注入。 */
  constructor(tuning = BLAST_STUN, seed = 41) {
    this.T = tuning;
    this.seed = seed;
    this.calm = false;
    this.events = [];
    this.time = 0;
    this.Zero();
    this.stats = { blasts: 0, ignored: 0 };
  }

  Zero() {
    this.level = 0;
    this.chroma = 0;
    this.trailTauS = 0;
    this.double = 0;
    this.haze = { amount: 0, focus: 0 };
    this.audio = 0;
    this.roll = 0; this.pitch = 0; this.yaw = 0;
  }

  get Active() { return this.events.length > 0; }

  Reset() {
    this.events.length = 0;
    this.Zero();
  }

  /** 一发爆炸。exposure 来自 BlastExposure；返回登记的事件（取证用的平面拷贝），没反应返回 null。 */
  Blast(exposure) {
    const T = this.T;
    const s = Number(exposure?.stun) || 0;
    if (!(s >= T.minStrength)) { this.stats.ignored += 1; return null; }
    const strength = Math.min(1, s);
    const event = {
      u: -Math.max(0, Number(exposure.arrivalS) || 0),
      s: strength,
      hold: T.holdMinS + T.holdSpanS * strength,
      tau: T.decayMinS + T.decaySpanS * strength,
    };
    this.events.push(event);
    if (this.events.length > T.maxEvents) this.events.shift();
    this.stats.blasts += 1;
    return { ...event };
  }

  /** 一个事件此刻的强度（含强度本身）。 */
  _Value(e) {
    const T = this.T;
    const u = e.u;
    if (u < 0) return 0;
    if (u < T.attackS) return e.s * Smooth(u / T.attackS);
    const r = u - T.attackS - e.hold;
    return r < 0 ? e.s : e.s * Math.exp(-r / e.tau);
  }

  /** 每帧推进，合成各通道。 */
  Update(dt) {
    const T = this.T;
    const step = Clamp(Number(dt) || 0, 0, 0.25);
    this.time += step;
    for (const e of this.events) e.u += step;
    let peak = 0, sum = 0;
    this.events = this.events.filter((e) => {
      const v = this._Value(e);
      if (v < DONE_BELOW && e.u > T.attackS + e.hold) return false;
      peak = Math.max(peak, v);
      sum += v;
      return true;
    });
    this.Zero();
    if (!this.events.length) return;
    const level = Math.min(1, peak + T.stackShare * (sum - peak));
    this.level = level;
    this.chroma = T.chroma.max * Math.pow(level, T.chroma.curve);
    this.trailTauS = level >= T.trail.minLevel ? T.trail.tauS * Math.pow(level, T.trail.curve) : 0;
    this.double = T.double.scale * level;
    this.haze = { amount: Clamp01(T.haze.amount * level), focus: Clamp01(T.haze.focus * level) };
    this.audio = Math.min(T.audio.max, T.audio.scale * level);
    if (!this.calm) {
      const S = T.sway;
      const n = (lane) => (ValueNoise2(this.time * S.hz, lane, this.seed) - 0.5) * 2;
      this.roll = S.rollRad * level * n(0.5);
      this.pitch = S.pitchRad * level * n(1.5);
      this.yaw = S.yawRad * level * n(2.5);
    }
  }

  /** 纯数据快照（测试 / 调试口取证用）。 */
  State() {
    return {
      level: this.level, active: this.Active, events: this.events.map((e) => ({ ...e })),
      chroma: this.chroma, trailTauS: this.trailTauS, double: this.double,
      haze: { ...this.haze }, audio: this.audio,
      roll: this.roll, pitch: this.pitch, yaw: this.yaw, calm: this.calm,
    };
  }
}

export default BlastStun;
