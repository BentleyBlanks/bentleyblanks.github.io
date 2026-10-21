// Script_AudioEarTrauma.mjs — 被炸过的耳朵（2026-10-21）：左右耳分开的暂时性听力损失 + 一条稳定的高音耳鸣。
//
// Script_Audio 在「耳朵模型 = trauma」（SetEarModel）时用它代替原来的耳鸣（DeafenShared / DeafenFirstLevel），
// 关着时一个节点都不插、原来的总线一字不动。数全在 Data_Tuning_BlastReaction.EAR_TRAUMA，听感为什么这么做见那张表的抬头。
//
// 总线（只在 trauma 模式下插进 deafFilter 与 outGain 之间，常驻 9 个节点，不进 liveNodes 账 —— 与 deafFilter 同属总线设施）：
//   deafFilter → inGain（固定两声道：单声道内容按扬声器规则复制到左右）→ 分声道
//     → 每只耳朵：lowpass（变闷）→ peaking（耳鸣音高处听力掉一个坑）→ gain（听阈抬高：整体小下去）
//   → 合声道 → outGain
// 鸣响（一条，用时才建、连续近爆复用，进 liveNodes 账）：
//   一个正弦（两只耳朵共用同一个音高：融成脑袋里的一条音，而不是两条音互相拍）
//     + 慢噪声调频（极细的音高起伏）+ 慢噪声调幅（极细的响度起伏）
//   + 每只耳朵一路窄带噪声（两个起点不同的白噪声 → 带通，Q 从宽收窄：刚炸完一片「沙——」，一两秒内收成细音）
//   → 每只耳朵一个包络 → 合声道 → 用户音效音量 → outGain（接在变闷与听阈**之后**：耳鸣是脑子里那声，不被自己的耳朵闷掉）。
import { EAR_TRAUMA } from "./Data_Tuning_BlastReaction.mjs";

const FLOOR = 1e-4;
const Clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const DbToGain = (db) => Math.pow(10, db / 20);
const SIDES = Object.freeze(["left", "right"]);

/** 简单的确定性随机（Mulberry32），慢噪声与音高种子用。 */
function Rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** AudioParam：从此刻的值接着排（Chrome 有 cancelAndHoldAtTime，没有就读当前值再钉住）。 */
function Hold(param, t) {
  if (typeof param.cancelAndHoldAtTime === "function") {
    try { param.cancelAndHoldAtTime(t); return; } catch (err) { /* 落到下面 */ }
  }
  const v = param.value;
  param.cancelScheduledValues(t);
  param.setValueAtTime(v, t);
}

export class EarTrauma {
  /** @param {object} engine Script_Audio 的实例（取 ctx、outGain、预算账本、噪声缓冲、Later）。 */
  constructor(engine, tuning = EAR_TRAUMA, seed = 19380314) {
    this.engine = engine;
    this.T = tuning;
    this.seed = seed;
    const rnd = Rng(seed);
    // 一局一个耳鸣音高（人的耳鸣音高是固定的）。
    this.pitchHz = Math.round(tuning.pitchMinHz + (tuning.pitchMaxHz - tuning.pitchMinHz) * rnd());
    this.stage = null;
    this.ring = null;
    this.ringTimer = null;
    this.ears = { left: this.EmptyEar(), right: this.EmptyEar() };
    this.stats = { triggers: 0, ringsBuilt: 0, budgetSkips: 0 };
  }

  EmptyEar() { return { strength: 0, at: -1e9, ringEnd: -1e9, ttsS: 0 }; }

  get ctx() { return this.engine.ctx; }
  get Installed() { return !!this.stage; }

  // -------------------------------------------------------------------------
  // 总线
  // -------------------------------------------------------------------------

  /** 把耳朵那一段插进 from → to 之间（from 原本直连 to）。重复调用是空操作。 */
  Install(from, to) {
    const ctx = this.ctx;
    if (!ctx || this.stage || !from || !to) return !!this.stage;
    const nyquist = ctx.sampleRate / 2;
    const inGain = ctx.createGain();
    inGain.channelCount = 2;
    inGain.channelCountMode = "explicit";
    inGain.channelInterpretation = "speakers";
    const split = ctx.createChannelSplitter(2);
    const merge = ctx.createChannelMerger(2);
    const ears = {};
    SIDES.forEach((side, index) => {
      const low = ctx.createBiquadFilter();
      low.type = "lowpass"; low.frequency.value = nyquist; low.Q.value = 0.6;
      const notch = ctx.createBiquadFilter();
      notch.type = "peaking"; notch.frequency.value = this.pitchHz; notch.Q.value = this.T.notchQ; notch.gain.value = 0;
      const gain = ctx.createGain();
      gain.gain.value = 1;
      split.connect(low, index);
      low.connect(notch).connect(gain).connect(merge, 0, index);
      ears[side] = { low, notch, gain };
    });
    inGain.connect(split);
    merge.connect(to);
    try { from.disconnect(to); } catch (err) { /* 本来就没直连 */ }
    from.connect(inGain);
    this.stage = { from, to, inGain, split, merge, ears, nyquist };
    return true;
  }

  /** 拔掉耳朵那一段，from 直连回 to。 */
  Uninstall() {
    const s = this.stage;
    if (!s) return;
    this.StopRing(0);
    try { s.from.disconnect(s.inGain); } catch (err) { /* 已断开 */ }
    try { s.from.connect(s.to); } catch (err) { /* ctx 已关 */ }
    for (const node of [s.inGain, s.split, s.merge, ...SIDES.flatMap((side) => [s.ears[side].low, s.ears[side].notch, s.ears[side].gain])]) {
      try { node.disconnect(); } catch (err) { /* 已断开 */ }
    }
    this.stage = null;
    this.ears = { left: this.EmptyEar(), right: this.EmptyEar() };
  }

  // -------------------------------------------------------------------------
  // 触发
  // -------------------------------------------------------------------------

  /** 这只耳朵此刻的残余强度（按鸣响长度线性退）。 */
  Residual(side, t = this.ctx?.currentTime ?? 0) {
    const ear = this.ears[side];
    if (!ear || !(ear.strength > 0)) return 0;
    const span = Math.max(0.1, ear.ringEnd - ear.at);
    return ear.strength * Clamp01(1 - (t - ear.at) / span);
  }

  /**
   * 一次近爆。left / right 是两只耳朵各自的强度（0..1）；holdS 是起音期（含传播延迟），
   * lengthScale > 1 给剧情炮震（拉长恢复）。返回此次两只耳朵的合成强度（取证用）。
   */
  Trigger({ left = 0, right = 0, holdS = this.T.attackHoldS, lengthScale = 1 } = {}) {
    const ctx = this.ctx;
    if (!ctx || !this.stage) return null;
    const T = this.T;
    const t = ctx.currentTime;
    const want = { left: Clamp01(left), right: Clamp01(right) };
    if (!(Math.max(want.left, want.right) >= T.minStrength)) return null;
    const out = {};
    const fired = new Set();
    for (const side of SIDES) {
      const res = this.Residual(side, t);
      const s = want[side] >= T.minStrength
        ? Math.min(1, Math.max(res, want[side]) + T.stackShare * Math.min(res, want[side])) : res;
      out[side] = s;
      if (!(s > 0) || !(want[side] >= T.minStrength)) continue;
      const tts = (T.ttsMinS + T.ttsSpanS * s) * lengthScale;
      const len = (T.ringMinS + T.ringSpanS * Math.pow(s, T.ringLengthCurve)) * lengthScale;
      this.ears[side] = { strength: s, at: t + holdS, ringEnd: t + holdS + len, ttsS: tts };
      this.ScheduleEar(side, s, t, holdS, tts);
      fired.add(side);
    }
    if (fired.size) this.ScheduleRing(out, fired, t, holdS);
    this.stats.triggers += 1;
    return out;
  }

  /** 一只耳朵的变闷 / 听阈 / 听力坑：起音期原样放过，再关门、停一下、按各自的时间常数回来。 */
  ScheduleEar(side, s, t, holdS, tts) {
    const T = this.T, ear = this.stage.ears[side], nyquist = this.stage.nyquist;
    const clear = Math.min(T.clearHz, nyquist);
    const close = t + holdS, shut = close + T.closeS;
    const plateau = shut + T.plateauMinS + T.plateauSpanS * s;
    // 变闷：低通几何插值，比此刻更闷才往下压（残余更闷时不往回抬）。
    const low = ear.low.frequency;
    const now = Math.max(40, Math.min(clear, low.value));
    const target = Math.min(now, clear * Math.pow(T.muffledHz / clear, Math.pow(s, T.lowCurve)));
    Hold(low, t);
    low.setValueAtTime(now, close);
    low.exponentialRampToValueAtTime(Math.max(40, target), shut);
    low.setValueAtTime(Math.max(40, target), plateau);
    low.setTargetAtTime(clear, plateau, tts * T.lowTauShare);
    // 听阈抬高：先多压一下（反射 + 饱和），回到平台，再慢慢回来。
    const g = ear.gain.gain;
    const gNow = Math.max(FLOOR, Math.min(1, g.value));
    const flat = Math.min(gNow, DbToGain(-T.attenDb * s));
    const stun = Math.min(flat, DbToGain(-(T.attenDb + T.stunDb) * s));
    Hold(g, t);
    g.setValueAtTime(gNow, close);
    g.exponentialRampToValueAtTime(Math.max(FLOOR, stun), shut);
    g.setTargetAtTime(flat, shut, T.stunS / 3);
    g.setTargetAtTime(1, plateau, tts * T.gainTauShare);
    // 耳鸣音高处的听力坑：最慢回来。
    const n = ear.notch.gain;
    const depth = Math.min(n.value, -T.notchDb * s);
    Hold(n, t);
    n.setValueAtTime(n.value, close);
    n.linearRampToValueAtTime(depth, shut);
    n.setValueAtTime(depth, plateau);
    n.setTargetAtTime(0, plateau, tts * T.notchTauShare);
  }

  // -------------------------------------------------------------------------
  // 鸣响
  // -------------------------------------------------------------------------

  /** 慢噪声缓冲：wobbleHz 一个随机点、余弦插值、归一到 ±1，循环播（8 kHz 采样够用，省内存）。 */
  SlowNoise() {
    if (this.slowNoise) return this.slowNoise;
    const ctx = this.ctx, rate = 8000, seconds = 9.7;
    const len = Math.floor(rate * seconds);
    const buffer = ctx.createBuffer(1, len, rate);
    const data = buffer.getChannelData(0);
    const rnd = Rng(this.seed ^ 0x5bd1e995);
    const step = rate / this.T.wobbleHz;
    const points = Math.ceil(len / step) + 2;
    const knots = Array.from({ length: points }, () => rnd() * 2 - 1);
    knots[points - 1] = knots[0]; knots[points - 2] = knots[0];   // 首尾接上，循环不跳
    let peak = 0;
    for (let i = 0; i < len; i += 1) {
      const x = i / step, k = Math.floor(x), f = x - k;
      const w = (1 - Math.cos(Math.PI * f)) / 2;
      data[i] = knots[k] * (1 - w) + knots[k + 1] * w;
      peak = Math.max(peak, Math.abs(data[i]));
    }
    for (let i = 0; i < len; i += 1) data[i] /= peak || 1;
    this.slowNoise = buffer;
    return buffer;
  }

  /** 建一条鸣响（两只耳朵共用）。预算不够返回 null（只做变闷，不鸣）。 */
  BuildRing() {
    const engine = this.engine, ctx = this.ctx, T = this.T;
    if (engine.liveNodes + T.ringNodes > engine.nodeBudget) { this.stats.budgetSkips += 1; return null; }
    const t = ctx.currentTime, pitch = this.pitchHz;
    const nodes = [];
    const Own = (node) => { nodes.push(node); return node; };
    const osc = Own(ctx.createOscillator());
    osc.type = "sine"; osc.frequency.value = pitch;
    const level = Own(ctx.createGain());
    level.gain.value = T.toneLevel;
    const slow = this.SlowNoise();
    const am = Own(ctx.createBufferSource()); am.buffer = slow; am.loop = true;
    const amDepth = Own(ctx.createGain()); amDepth.gain.value = T.toneLevel * T.amDepth;
    const fm = Own(ctx.createBufferSource()); fm.buffer = slow; fm.loop = true; fm.playbackRate.value = 0.83;
    const fmDepth = Own(ctx.createGain()); fmDepth.gain.value = pitch * T.fmDepth;
    am.connect(amDepth).connect(level.gain);
    fm.connect(fmDepth).connect(osc.frequency);
    osc.connect(level);
    const white = engine.NoiseBuffer("white");
    const merge = Own(ctx.createChannelMerger(2));
    const user = Own(ctx.createGain());
    user.gain.value = engine.outputVolume * engine.mix.sfx;
    const mix = {}, band = {}, noise = {};
    SIDES.forEach((side, index) => {
      const src = Own(ctx.createBufferSource());
      src.buffer = white; src.loop = true;
      const bp = Own(ctx.createBiquadFilter());
      bp.type = "bandpass"; bp.frequency.value = pitch; bp.Q.value = T.noiseQEnd;
      const g = Own(ctx.createGain());
      g.gain.value = FLOOR;
      src.connect(bp).connect(g);
      level.connect(g);
      g.connect(merge, 0, index);
      mix[side] = g; band[side] = bp; noise[side] = src;
      src.start(t, index * 1.7);
    });
    merge.connect(user).connect(engine.outGain);
    osc.start(t); am.start(t, 0); fm.start(t, 4.3);
    engine.liveNodes += nodes.length;
    const ring = { nodes, osc, level, mix, band, noise, user, am, fm };
    // 借 voice 账本：Dispose 时 pendingVoices 一并拆掉（没有 releaseAt，按帧清账不碰它，生命期自己管）。
    engine.pendingVoices.add(ring);
    this.stats.ringsBuilt += 1;
    return ring;
  }

  /** strength：两只耳朵的合成强度；fired：这一发真正挨到的耳朵（另一只的包络不动，照旧走完）。 */
  ScheduleRing(strength, fired, t, holdS) {
    const T = this.T;
    if (!this.ring) this.ring = this.BuildRing();
    const ring = this.ring;
    if (!ring) return;
    const on = t + holdS;
    const peakS = Math.max(strength.left || 0, strength.right || 0);
    // 音高：刚炸完略高一点，很快落定。
    const f = ring.osc.frequency;
    Hold(f, t);
    f.setValueAtTime(this.pitchHz * (1 + T.pitchSettle * peakS), on);
    f.setTargetAtTime(this.pitchHz, on, T.pitchSettleTauS);
    for (const side of fired) {
      const s = strength[side] || 0;
      const g = ring.mix[side].gain;
      const q = ring.band[side].Q;
      const ear = this.ears[side];
      if (!(s > 0) || ear.ringEnd <= t) continue;
      Hold(g, t);
      Hold(q, t);
      const peak = T.ringGain * Math.pow(s, T.ringCurve);
      const cur = Math.max(FLOOR, g.value);
      const top = Math.max(cur, peak);
      const hold = T.ringHoldMinS + T.ringHoldSpanS * s;
      const fastAt = on + T.ringAttackS + hold;
      const tailAt = fastAt + T.ringFastTauS * 2.5;
      const len = Math.max(tailAt - on + 0.5, ear.ringEnd - on);
      g.setValueAtTime(cur, on);
      g.linearRampToValueAtTime(top, on + T.ringAttackS);
      g.setValueAtTime(top, fastAt);
      g.setTargetAtTime(top * T.ringFastShare, fastAt, T.ringFastTauS);
      g.setTargetAtTime(FLOOR, tailAt, Math.max(0.2, (on + len - tailAt) / 4.6));
      // 窄带噪声：宽的「沙——」收窄成细音。
      q.setValueAtTime(T.noiseQStart, on);
      q.exponentialRampToValueAtTime(T.noiseQEnd, on + T.noiseNarrowS);
    }
    const end = Math.max(this.ears.left.ringEnd, this.ears.right.ringEnd);
    if (end > t) this.ScheduleRingRelease(end - t + 0.4);
  }

  ScheduleRingRelease(seconds) {
    const engine = this.engine;
    if (this.ringTimer) { clearTimeout(this.ringTimer); engine.timers.delete(this.ringTimer); }
    this.ringTimer = engine.Later(seconds * 1000, () => { this.ringTimer = null; this.StopRing(0.05); });
  }

  /** 收掉鸣响：淡出 fade 秒后停振荡 / 噪声、归还节点。 */
  StopRing(fade = 0.06) {
    const ring = this.ring, engine = this.engine;
    this.ring = null;
    if (this.ringTimer) { clearTimeout(this.ringTimer); engine.timers.delete(this.ringTimer); this.ringTimer = null; }
    if (!ring) return;
    const ctx = this.ctx;
    const stop = () => {
      for (const node of ring.nodes) { try { if (typeof node.stop === "function") node.stop(); } catch (err) { /* 已停 */ } }
      engine.FreeVoice(ring);
    };
    if (!ctx || !(fade > 0)) { stop(); return; }
    const t = ctx.currentTime;
    for (const side of SIDES) {
      const g = ring.mix[side].gain;
      try { Hold(g, t); g.linearRampToValueAtTime(FLOOR, t + fade); } catch (err) { /* 已拆 */ }
    }
    engine.Later(fade * 1000 + 30, stop);
  }

  /** 用户音量变了（主音量 / 音效音量）。 */
  SyncVolume() {
    const ring = this.ring, ctx = this.ctx;
    if (ring && ctx) ring.user.gain.setTargetAtTime(this.engine.outputVolume * this.engine.mix.sfx, ctx.currentTime, 0.02);
  }

  /** 换场景 / 关掉：鸣响收掉，两只耳朵立刻恢复。 */
  Reset() {
    this.StopRing(0.01);
    this.ears = { left: this.EmptyEar(), right: this.EmptyEar() };
    const s = this.stage, ctx = this.ctx;
    if (!s || !ctx) return;
    const t = ctx.currentTime;
    for (const side of SIDES) {
      const ear = s.ears[side];
      for (const [param, value] of [[ear.low.frequency, s.nyquist], [ear.gain.gain, 1], [ear.notch.gain, 0]]) {
        param.cancelScheduledValues(t);
        param.setValueAtTime(value, t);
      }
    }
  }

  /** 此刻耳朵外界被压掉多少（0 = 没事，1 = 压到 attenDb + stunDb）：给心跳 / 喘的补偿用。 */
  Attenuation() {
    const s = this.stage;
    if (!s) return 0;
    const g = Math.min(s.ears.left.gain.gain.value, s.ears.right.gain.gain.value);
    return Clamp01(-20 * Math.log10(Math.max(FLOOR, g)) / (this.T.attenDb + this.T.stunDb));
  }

  /** 取证快照：两只耳朵此刻的低通 / 听阈 / 听力坑、鸣响电平、残余强度。 */
  State() {
    const s = this.stage, ring = this.ring, t = this.ctx?.currentTime ?? 0;
    const ear = (side) => ({
      lowHz: s ? s.ears[side].low.frequency.value : null,
      gainDb: s ? 20 * Math.log10(Math.max(FLOOR, s.ears[side].gain.gain.value)) : 0,
      notchDb: s ? s.ears[side].notch.gain.value : 0,
      ring: ring ? ring.mix[side].gain.value : 0,
      residual: this.Residual(side, t),
    });
    return {
      installed: !!s, pitchHz: this.pitchHz, ringing: !!ring, ringNodes: ring ? ring.nodes.length : 0,
      left: ear("left"), right: ear("right"), stats: { ...this.stats },
    };
  }

  Dispose() {
    this.Uninstall();
    this.StopRing(0);
  }
}

export default EarTrauma;
