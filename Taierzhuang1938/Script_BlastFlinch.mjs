// Script_BlastFlinch.mjs — 第一人称的近爆身体反应：眨眼 / 闭紧眼、扭头避开、低头缩身、歪头、收枪缩肩、手抖、恍惚、喘与心跳。
//
// **纯规则，不 import three。** 由 Script_Player 持有（this.flinch），Combat.BlastFeedback 喂爆炸（Blast），
// Player.Update 推进（Update），SyncCamera 把相机那几项叠在震屏之后（不改 yaw/pitch 本体：枪口不被带歪，过后自己回来），
// Script_Main 把眼皮与恍惚交给后期合成、把手臂那几项交给 Viewmodel，Script_AudioWiring 读喘与心跳。
// 数全在 Data_Tuning_BlastReaction.BLAST_FLINCH；暴露量（强度 0..1）由 Script_BlastExposure 算。
//
// 每一发是一个事件（最多 maxEvents 个），各通道按事件自己的时间线出值，合成时方向性的几项（转头、歪头、侧让）
// 按带符号求和再软限幅，其余取大 —— 连续炮击不会把头越拧越偏，也不会叠成糊。
// 没有 Math.random：正前方爆炸往哪边转按一个交替序列挑，抖动用确定性的值噪声（出图可复现）。
//
// enabled = false 时 Blast 什么都不做（正片默认关；测试场与开了 phase.blastReaction 的关卡打开）。
//
// 眼睛另有三样跨帧的状态（2026-10-29 用户：「都加上」）：
//   adapt         暗适应：闭着眼时往上涨、睁开后退，Script_Main 拿 exposureGain 乘曝光（睁眼那一下偏亮）；
//   after         火光残影：火球在画面上的位置、大小、强度（Player 投到屏幕上交进来），正残像 / 负残像按时间走；
//   睁眼后发糊    并进 daze.focus（闭紧过的那一发，睁眼时糊一下）。
import { Clamp, Clamp01, ValueNoise2 } from "./Script_Noise.mjs";
import { BLAST_FLINCH } from "./Data_Tuning_BlastReaction.mjs";

const Smooth = (x) => { const t = Clamp01(x); return t * t * (3 - 2 * t); };
const EaseOut = (x) => { const t = Clamp01(x); return 1 - (1 - t) * (1 - t) * (1 - t); };
/** 软限幅：小量线性，接近上限时慢慢弯过去。 */
const SoftCap = (v, cap) => cap * Math.tanh(v / cap);

/** 头的包络：潜伏 → 快速转开（ease-out）→ 停 → 回位（带一点过冲再落定）。u 从冲击到人那一刻算。 */
function HeadEnvelope(u, latency, attack, hold, release, overshoot) {
  const a = u - latency;
  if (a <= 0) return 0;
  if (a < attack) return EaseOut(a / attack);
  const r = a - attack - hold;
  if (r <= 0) return 1;
  if (r >= release) return 0;
  const x = r / release;
  return (1 - Smooth(x)) - overshoot * Math.sin(Math.PI * x) * Math.pow(x, 1.5);
}

/** 合上 → 停 → 睁开的一次眼皮。 */
function LidPulse(u, start, close, hold, open) {
  const a = u - start;
  if (a <= 0) return 0;
  if (a < close) return Smooth(a / close);
  if (a < close + hold) return 1;
  const o = a - close - hold;
  return o >= open ? 0 : 1 - Smooth(o / open);
}

export class BlastFlinch {
  /** @param {object} [tuning] 默认 BLAST_FLINCH；测试可注入。 */
  constructor(tuning = BLAST_FLINCH, seed = 23) {
    this.T = tuning;
    this.seed = seed;
    this.enabled = false;
    this.events = [];
    this.time = 0;
    this.frontSide = 1;       // 正前方爆炸：往哪边转，每次交替
    this.serial = 0;
    this.load = 0;            // 连续炮击的累积（BLAST_FLINCH.load）：按时间漏，每发按缩身强度加
    this.loadAt = 0;
    this.adapt = 0;           // 暗适应 0..1（BLAST_FLINCH.adapt）
    this.lidLag = 0;          // 眼皮闭合的滞后一份（瞳孔反应有潜伏期：一刹那的眨眼来不及放大）
    this.exposureGain = 1;    // 1 + gain·adapt
    this.after = null;        // 火光残影（BLAST_FLINCH.afterimage）：{ u, v, radius, aspect, strength, age, seed, positive, negative }
    this.Zero();
    this.stats = { blasts: 0, ignored: 0 };
  }

  Zero() {
    // 相机（弧度 / 米）
    this.yaw = 0; this.pitch = 0; this.roll = 0; this.dropM = 0; this.sideM = 0;
    // 眼皮 0..1、恍惚
    this.eyeClosure = 0;
    this.daze = { amount: 0, focus: 0 };
    // 手臂（相机空间：米 / 弧度）
    this.arms = { dx: 0, dy: 0, dz: 0, rx: 0, ry: 0, rz: 0 };
    this.tremor = 0;
    // 身体声音
    this.heart = 0; this.heartBpm = 0; this.breathless = 0;
    this.headLevel = 0;
  }

  /** 开 / 关（关的时候顺手清掉正在进行的反应）。 */
  SetEnabled(on) {
    this.enabled = !!on;
    if (!this.enabled) this.Reset();
    return this.enabled;
  }

  /**
   * 一发爆炸。exposure 来自 Script_BlastExposure.BlastExposure；bearing 来自 BlastBearing（lateral / forward / up）。
   * 返回登记的事件（取证用的平面对象），没反应返回 null。
   */
  Blast(exposure, bearing = {}) {
    if (!this.enabled || !exposure || !exposure.any) { this.stats.ignored += 1; return null; }
    const T = this.T, H = T.head;
    const lateral = Clamp(Number(bearing.lateral) || 0, -1, 1);
    const forward = Clamp(Number(bearing.forward) || 0, -1, 1);
    const up = Clamp(Number(bearing.up) || 0, -1, 1);
    // 转开的方向 = 背离爆点：爆点在右（lateral > 0）往左转（yaw +）、头往左歪（roll +）。
    let sign;
    if (Math.abs(lateral) >= H.minLateralForSide) sign = lateral > 0 ? 1 : -1;
    else { sign = this.frontSide; this.frontSide = -this.frontSide; }
    const f = exposure.flinch;
    const yawWeight = Clamp01(Math.abs(lateral) + H.frontYawShare * Math.max(0, forward));
    // 连续炮击：先按上一发到现在的时间漏掉，再记上这一发（用这一发之前的累积来拉长闭眼：第一发不受影响）。
    const L = T.load;
    this.load *= Math.exp(-Math.max(0, this.time - this.loadAt) / L.tauS);
    this.loadAt = this.time;
    const load = Math.min(L.max, this.load);
    this.load = Math.min(L.max, this.load + Math.max(f, exposure.squeeze));
    const event = {
      id: ++this.serial, u: -Math.max(0, exposure.arrivalS || 0),
      sign, lateral, forward, up,
      blink: exposure.blink, flinch: f, squeeze: exposure.squeeze, daze: exposure.daze,
      tremor: exposure.tremor, body: exposure.body, db: exposure.db,
      yaw: sign * H.yawRad * f * yawWeight,
      pitch: H.pitchRad * f * (0.75 + 0.25 * Math.max(0, forward) + H.overheadPitchShare * Math.max(0, up)),
      roll: sign * H.rollRad * f * Math.max(Math.abs(lateral), 0.35 * yawWeight),
      drop: H.dropM * f,
      side: -sign * H.sideM * f * Math.abs(lateral),
      hold: H.holdMinS + H.holdSpanS * f,
      release: H.releaseMinS + H.releaseSpanS * f,
      overshoot: H.settleOvershoot * f,
      dazeDecay: T.daze.decayMinS + T.daze.decaySpanS * exposure.daze,
      load,
      breathS: exposure.body > 0 ? T.body.breathMinS + T.body.breathSpanS * exposure.body : 0,
      heartS: exposure.body > 0 ? T.body.heartMinS + T.body.heartSpanS * exposure.body : 0,
    };
    this.events.push(event);
    if (this.events.length > T.maxEvents) this.events.shift();
    this._Afterimage(bearing.flash, exposure);
    this.stats.blasts += 1;
    return { ...event };
  }

  /** 这个事件已经完全结束（所有通道都回零）。 */
  Done(e) {
    const T = this.T;
    const stretch = 1 + Math.max(T.load.holdGain, 1) * (e.load || 0);
    const lidEnd = T.blinkLatencyS + T.squeeze.closeS + (T.squeeze.holdMinS + T.squeeze.holdSpanS) * stretch
      + T.squeeze.openS * 2 + T.squeeze.squintS * 1.5 * stretch + T.blink.reboundAtS + 1;
    const headEnd = T.bodyLatencyS + T.head.attackS + e.hold + e.release + T.arms.lagS;
    const tremorEnd = T.tremor.holdS + T.tremor.decayS * 4;
    const dazeEnd = T.daze.attackS + T.daze.holdS + e.dazeDecay * 4;
    return e.u > Math.max(lidEnd, headEnd, tremorEnd, dazeEnd, e.breathS, e.heartS);
  }

  /** 每帧推进，合成各通道。 */
  Update(dt) {
    const step = Clamp(Number(dt) || 0, 0, 0.25);
    this.time += step;
    for (const e of this.events) e.u += step;
    this.events = this.events.filter((e) => !this.Done(e));
    this.Zero();
    if (this.events.length) this._Channels();
    this._Eyes(step);
  }

  /** 各通道按事件合成（Update 里有事件时调）。 */
  _Channels() {
    const T = this.T, H = T.head, A = T.arms, B = T.blink, S = T.squeeze, D = T.daze, R = T.tremor;
    let yaw = 0, pitch = 0, roll = 0, drop = 0, side = 0;
    let armYaw = 0, armRoll = 0, armDrop = 0, armPull = 0, armPitch = 0;
    let lid = 0, dazeAmount = 0, dazeFocus = 0, tremor = 0, heart = 0, bpmPeak = 0, breath = 0, level = 0;
    for (const e of this.events) {
      const u = e.u;
      if (u < 0) continue;            // 冲击还在路上
      // 头：扭开、低头、歪头、缩身、侧让。
      const h = HeadEnvelope(u, T.bodyLatencyS, H.attackS, e.hold, e.release, e.overshoot);
      yaw += e.yaw * h; pitch += e.pitch * h; roll += e.roll * h; drop += e.drop * h; side += e.side * h;
      level = Math.max(level, Math.abs(h) * e.flinch);
      // 手臂慢半拍：同一条包络往后挪 lagS。
      const ha = HeadEnvelope(u, T.bodyLatencyS + A.lagS, H.attackS, e.hold, e.release, e.overshoot);
      armYaw += -A.counterYaw * e.yaw * ha;
      armRoll += -A.counterRoll * e.roll * ha;
      armDrop += A.dropM * e.flinch * ha;
      armPull += A.pullM * e.flinch * ha;
      armPitch += A.pitchRad * e.flinch * ha;
      // 眼皮：眨眼（+ 强的再眨一下）、闭紧、眯眼。
      if (e.blink > 0) {
        const amp = Clamp01(e.blink / B.fullAt);
        lid = Math.max(lid, amp * LidPulse(u, T.blinkLatencyS, B.closeS, B.holdMinS + B.holdSpanS * e.blink, B.openS));
        // 睁眼时的余颤只在近爆（闭紧过）时有。
        if (e.squeeze >= B.rebound) {
          lid = Math.max(lid, B.reboundClosure * LidPulse(u, B.reboundAtS, B.reboundCloseS, 0.02, B.reboundOpenS));
        }
      }
      if (e.squeeze > 0) {
        // 单发最多停 ~0.25 s；连续炮击（e.load）才越闭越久。
        const hold = (S.holdMinS + S.holdSpanS * e.squeeze) * (1 + T.load.holdGain * e.load);
        const open = S.openS * (1 + 0.6 * e.squeeze);
        lid = Math.max(lid, LidPulse(u, T.blinkLatencyS, S.closeS, hold, open));
        // 睁眼后短暂发糊：泪膜被挤乱、对焦松了，睁眼开始后涨上来再退。
        const RB = T.reopenBlur;
        if (RB && e.squeeze >= RB.from) {
          const a = u - (T.blinkLatencyS + S.closeS + hold);
          if (a > 0) dazeFocus = Math.max(dazeFocus, RB.amount * e.squeeze
            * (a < RB.riseS ? Smooth(a / RB.riseS) : Math.exp(-(a - RB.riseS) / RB.decayS)));
        }
        const squintAmp = e.squeeze >= S.squintFrom || e.load > 0.5
          ? S.squint * Math.max(e.squeeze, 0.5) * (1 + T.load.squintGain * e.load) : 0;
        const squintFrom = T.blinkLatencyS + S.closeS + hold + open * 0.6;
        const squintLen = S.squintS * (0.5 + e.squeeze) * (1 + e.load);
        if (squintAmp > 0 && u > squintFrom) {
          const k = Clamp01((u - squintFrom) / squintLen);
          lid = Math.max(lid, Math.min(0.6, squintAmp) * (1 - Smooth(k)));
        }
      }
      // 恍惚：快起、停一下、慢退；近爆另有一下极短的发糊（冲击晃了一下眼）。
      if (e.daze > 0) {
        const a = u < D.attackS ? Smooth(u / D.attackS)
          : u < D.attackS + D.holdS ? 1 : Math.exp(-(u - D.attackS - D.holdS) / e.dazeDecay);
        dazeAmount = Math.max(dazeAmount, D.amountScale * e.daze * a);
        dazeFocus = Math.max(dazeFocus, D.focusScale * e.daze * a);
      }
      if (e.flinch > 0 && u < D.joltS) dazeFocus = Math.max(dazeFocus, D.jolt * e.flinch * Math.sin(Math.PI * u / D.joltS));
      // 手抖：停一下，再按指数退。
      if (e.tremor > 0) {
        const k = u < R.holdS ? Smooth(u / 0.25) : Math.exp(-(u - R.holdS) / R.decayS);
        tremor = Math.max(tremor, e.tremor * k);
      }
      // 喘与心跳：剩余时间的比例。
      if (e.breathS > 0 && u < e.breathS) breath = Math.max(breath, e.breathS - u);
      if (e.heartS > 0 && u < e.heartS) {
        const k = 1 - u / e.heartS;
        if (e.body * k > heart) heart = e.body * k;
        bpmPeak = Math.max(bpmPeak, e.body);
      }
    }
    const cap = T.stackCap;
    this.yaw = SoftCap(yaw, H.yawRad * cap);
    this.pitch = SoftCap(pitch, Math.abs(H.pitchRad) * cap);
    this.roll = SoftCap(roll, H.rollRad * cap);
    this.dropM = SoftCap(drop, H.dropM * cap);
    this.sideM = SoftCap(side, H.sideM * cap);
    this.headLevel = Math.min(1, level);
    this.eyeClosure = Clamp01(lid);
    this.daze = { amount: Clamp01(dazeAmount), focus: Clamp01(dazeFocus) };
    // 手抖：生理震颤（9.5 Hz 上下）+ 慢晃，确定性值噪声。
    this.tremor = Clamp01(tremor);
    const n = (hz, lane) => (ValueNoise2(this.time * hz, lane, this.seed) - 0.5) * 2;
    const tx = this.tremor * (R.m * n(R.hz, 1.3) + R.slowM * n(R.slowHz, 7.1));
    const ty = this.tremor * (R.m * n(R.hz, 3.7) + R.slowM * n(R.slowHz, 9.9));
    const trx = this.tremor * (R.rad * n(R.hz, 5.3) + R.slowRad * n(R.slowHz, 11.3));
    const try_ = this.tremor * (R.rad * n(R.hz, 13.9) + R.slowRad * n(R.slowHz, 17.5));
    this.arms = {
      dx: tx,
      dy: SoftCap(armDrop, Math.abs(A.dropM) * cap) + ty,
      dz: SoftCap(armPull, A.pullM * cap),
      rx: SoftCap(armPitch, Math.abs(A.pitchRad) * cap) + trx,
      ry: SoftCap(armYaw, H.yawRad * A.counterYaw * cap) + try_,
      rz: SoftCap(armRoll, H.rollRad * A.counterRoll * cap),
    };
    // 镜头也带一点抖（远小于枪）。
    this.pitch += this.tremor * R.cameraRad * n(R.hz * 0.8, 21.1);
    this.yaw += this.tremor * R.cameraRad * n(R.hz * 0.8, 23.7);
    this.heart = Clamp01(heart);
    this.heartBpm = heart > 0 ? T.body.heartBpmMin + (T.body.heartBpmMax - T.body.heartBpmMin) * bpmPeak : 0;
    this.breathless = breath;
  }

  /**
   * 一发的火光残影：flash 来自 Player（火球此刻在画面上的 uv、印子半径、宽高比、视半径）。隔着墙不留；
   * 新的比眼下剩的那块强才换掉（一次只记一块，连着几发时留最亮的那块）。
   */
  _Afterimage(flash, exposure) {
    const P = this.T.afterimage;
    if (!P || !flash || exposure.occluded || !(flash.radius > 0)) return;
    const strength = Math.min(1.2, Clamp01((flash.angleRad - P.minAngleRad) / (P.fullAngleRad - P.minAngleRad)));
    if (strength < 0.02) return;
    const now = this.after ? Math.max(this.after.positive / P.positive, this.after.negative / P.negative) : 0;
    if (strength < now) return;
    this.after = { u: flash.u, v: flash.v, radius: Math.min(P.maxRadius, flash.radius * P.blurScale), aspect: flash.aspect || 1,
      strength, age: 0, seed: (this.serial * 2.399) % 6.283, positive: strength * P.positive, negative: 0 };
  }

  /** 火球的半径（米）：fireballK × 装药^(1/3)。Player 拿它算火球在画面上多大。 */
  FlashRadiusM(chargeKg) {
    return (this.T.afterimage?.fireballK ?? 0.9) * Math.cbrt(Math.max(0.005, Number(chargeKg) || 0));
  }

  /** 眼睛的跨帧状态：暗适应跟着这一帧的眼皮走，火光残影按年纪出正 / 负两份。 */
  _Eyes(step) {
    const A = this.T.adapt;
    if (A) {
      // 先过一段潜伏（latencyS 的一阶滞后），只有闭得够久、滞后那份过了 floor 才开始暗适应
      this.lidLag += (this.eyeClosure - this.lidLag) * (1 - Math.exp(-step / Math.max(1e-3, A.latencyS)));
      const target = Clamp01((this.lidLag - A.floor) / (1 - A.floor));
      const tau = target > this.adapt ? A.riseS : A.fallS;
      this.adapt += (target - this.adapt) * (1 - Math.exp(-step / Math.max(1e-3, tau)));
      if (this.adapt < 1e-4) this.adapt = 0;
    }
    this.exposureGain = 1 + (A?.gain || 0) * this.adapt;
    const im = this.after, P = this.T.afterimage;
    if (!im || !P) return;
    im.age += step;
    im.positive = im.strength * P.positive * Math.exp(-im.age / P.posTauS);
    const fadeAt = P.negRiseS + P.negHoldS;
    im.negative = im.strength * P.negative * Smooth(im.age / P.negRiseS)
      * (im.age > fadeAt ? Math.exp(-(im.age - fadeAt) / P.negTauS) : 1);
    if (im.age > fadeAt + P.negTauS * 5) this.after = null;
  }

  /** 还有没有在动的反应。 */
  get Active() { return this.events.length > 0; }
  /** 眼睛还有没有余下的（暗适应没退完、残影还在）—— 事件都结束了也可能还有。 */
  get EyesActive() { return this.adapt > 0.001 || !!this.after; }

  Reset() {
    this.events.length = 0;
    this.load = 0;
    this.adapt = 0; this.lidLag = 0; this.exposureGain = 1; this.after = null;
    this.Zero();
  }

  /** 取证快照（纯数据）。 */
  State() {
    return {
      enabled: this.enabled, active: this.Active, events: this.events.length,
      yaw: this.yaw, pitch: this.pitch, roll: this.roll, dropM: this.dropM, sideM: this.sideM,
      eyeClosure: this.eyeClosure, daze: { ...this.daze },
      adapt: this.adapt, exposureGain: this.exposureGain, afterimage: this.after ? { ...this.after } : null, arms: { ...this.arms }, tremor: this.tremor,
      heart: this.heart, heartBpm: this.heartBpm, breathless: this.breathless, headLevel: this.headLevel,
      load: this.load * Math.exp(-Math.max(0, this.time - this.loadAt) / this.T.load.tauS),
      stats: { ...this.stats },
      last: this.events.length ? { ...this.events[this.events.length - 1] } : null,
    };
  }
}

export default BlastFlinch;
