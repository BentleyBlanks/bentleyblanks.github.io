// Script_CameraShake.mjs — 第一人称相机的通用震动：创伤值噪声 + 定向冲击弹簧。
//
// **纯规则，不 import three。** 只出五个偏移量（pitch / yaw / roll 弧度，rise 米，
// 以及一个取证用的 trauma），由 Script_Player.SyncCamera 在最后一步叠到相机上。
// 数全在 `Data_Tuning_Player.CAMERA_SHAKE`，这里一个魔法数都不写。
//
// 为什么是两层：
//   · 创伤层（trauma → 噪声）管「余震」：爆炸、近失弹、日机弹着都往一个 0..1 的桶里加，
//     桶按秒漏，幅度取平方 —— 小事几乎看不见，大事满幅，叠加不会线性堆成糊。
//   · 冲击层（弹簧）管「那一下」：落地的头一沉、中弹的一歪、扑沟的一栽。位移直接写进弹簧，
//     过阻尼回位，不来回弹三下。
//
// 噪声用 Script_Noise.ValueNoise2（确定性）：出图比对靠同一帧同一画面，Math.random 等于
// 每次给一张新图。与过场的 shakeAt 用的是同一个噪声源，两边观感一致。
//
// 与压制抖动（SUPPRESSION.shakeScale 那根正弦）并存不合并：压制是「被按住抬不起头」的持续
// 触感，这里是事件驱动的震屏，衰减律不同。

import { Clamp, Clamp01, ValueNoise2 } from "./Script_Noise.mjs";
import { CAMERA_SHAKE } from "./Data_Tuning_Player.mjs";

const MAX_STEP_S = 1 / 40;   // 弹簧积分的子步上限；刚度 170 时显式积分在 1/40 s 内稳定

/** 一根临界附近阻尼的弹簧：位移被事件直接写入，自己回零。 */
class Spring {
  constructor() { this.x = 0; this.v = 0; }
  Kick(amount, cap) {
    this.x = Clamp(this.x + amount, -cap, cap);
  }
  Step(dt, stiffness, damping) {
    const a = -stiffness * this.x - damping * this.v;
    this.v += a * dt;
    this.x += this.v * dt;
    if (Math.abs(this.x) < 1e-6 && Math.abs(this.v) < 1e-5) { this.x = 0; this.v = 0; }
  }
  Reset() { this.x = 0; this.v = 0; }
}

export class CameraShake {
  /**
   * @param {object} [tuning] 默认 Data_Tuning_Player.CAMERA_SHAKE；测试可注入
   * @param {number} [seed] 噪声种子
   */
  constructor(tuning = CAMERA_SHAKE, seed = 7) {
    this.T = tuning;
    this.seed = seed;
    this.trauma = 0;
    this.time = 0;
    this.springs = { pitch: new Spring(), yaw: new Spring(), roll: new Spring(), rise: new Spring() };
    this.pitch = 0; this.yaw = 0; this.roll = 0; this.rise = 0;
    this.diveSide = 1;              // 扑沟的侧滚左右交替，不然每次都往同一边栽
    this.events = { explosion: 0, nearMiss: 0, landing: 0, strafe: 0, hit: 0, dive: 0 };
  }

  /** 往创伤桶里加。 */
  AddTrauma(amount) {
    if (!(amount > 0)) return;
    this.trauma = Clamp01(this.trauma + amount);
  }

  /** 定向冲击：直接写位移，弹簧回位。单位弧度 / 米。 */
  Impulse({ pitch = 0, yaw = 0, roll = 0, rise = 0 } = {}) {
    const T = this.T;
    if (pitch) this.springs.pitch.Kick(pitch, T.maxImpulseRad);
    if (yaw) this.springs.yaw.Kick(yaw, T.maxImpulseRad);
    if (roll) this.springs.roll.Kick(roll, T.maxImpulseRad);
    if (rise) this.springs.rise.Kick(rise, T.maxImpulseM);
  }

  /**
   * 爆炸。distance 到爆心（米），reachM 伤害外沿（Combat.Blast 的 radius × radiusScale），
   * 震感延伸到 reachM × reachScale；隔墙打折。返回实际加的创伤（0 = 太远没感觉）。
   */
  Explosion(distanceM, reachM, occluded = false) {
    const E = this.T.explosion;
    const reach = Math.max(0.5, reachM) * E.reachScale;
    const k = Clamp01(1 - Math.max(0, distanceM) / reach);
    let trauma = E.traumaAtCenter * k * k;
    if (occluded) trauma *= E.occludedScale;
    if (trauma < E.minTrauma) return 0;
    this.AddTrauma(trauma);
    this.Impulse({ pitch: E.pitchKickRad * k });
    this.events.explosion += 1;
    return trauma;
  }

  /** 近失弹：按 Player.Suppress 收到的量换算；封顶防连扫。 */
  NearMiss(suppressAmount) {
    const N = this.T.nearMiss;
    const add = Clamp(suppressAmount * N.traumaPerSuppress, 0, N.maxTrauma);
    if (add <= 0) return 0;
    this.AddTrauma(Math.min(add, Math.max(0, N.maxTrauma - this.trauma)));
    this.events.nearMiss += 1;
    return add;
  }

  /** 落地：impact 0..1（Player.jump.landImpact）。轻跳几乎没有，高处跌落头一沉。 */
  Landing(impact01) {
    const L = this.T.landing;
    const k = Clamp01(impact01);
    if (k <= 0) return 0;
    this.AddTrauma(L.traumaScale * k);
    this.Impulse({ pitch: L.pitchKickRad * k });
    this.events.landing += 1;
    return k;
  }

  /** 日机机枪弹着落在玩家几米内。reachM 之外没感觉；封顶。 */
  Strafe(distanceM) {
    const S = this.T.strafe;
    if (!(distanceM < S.reachM)) return 0;
    const k = 1 - distanceM / S.reachM;
    const add = Math.min(S.traumaPerImpact * k, Math.max(0, S.maxTrauma - this.trauma));
    if (add <= 0) return 0;
    this.AddTrauma(add);
    this.events.strafe += 1;
    return add;
  }

  /** 中弹：severity 0..1（Player.PushHitEvent 的 severity）。侧滚方向随来弹左右。 */
  Hit(severity01, side = 1) {
    const H = this.T.hit;
    const k = Clamp01(severity01);
    if (k <= 0) return 0;
    this.AddTrauma(H.traumaScale * k);
    this.Impulse({ roll: H.rollKickRad * k * (side < 0 ? -1 : 1) });
    this.events.hit += 1;
    return k;
  }

  /** B19 扑入路沟：向下一栽 + 侧滚 + 眼位下沉。左右交替。 */
  Dive() {
    const D = this.T.dive;
    this.Impulse({ pitch: D.pitchKickRad, roll: D.rollKickRad * this.diveSide, rise: D.riseKickM });
    this.diveSide = -this.diveSide;
    this.AddTrauma(D.trauma);
    this.events.dive += 1;
    return true;
  }

  /** 每帧推进：创伤按秒漏，弹簧按子步积分，最后合成五个偏移。 */
  Update(dt) {
    const T = this.T;
    const step = Clamp(Number(dt) || 0, 0, 0.25);
    this.time += step;
    this.trauma = Math.max(0, this.trauma - T.traumaDecayPerS * step);
    let remaining = step;
    while (remaining > 1e-6) {
      const h = Math.min(MAX_STEP_S, remaining);
      for (const s of Object.values(this.springs)) s.Step(h, T.impulseStiffness, T.impulseDamping);
      remaining -= h;
    }
    const amp = Math.pow(this.trauma, T.traumaPower);
    const t = this.time * T.noiseHz;
    const n = (v) => (ValueNoise2(t, v, this.seed) - 0.5) * 2;
    this.pitch = amp * T.maxPitchRad * n(3.1) + this.springs.pitch.x;
    this.yaw = amp * T.maxYawRad * n(11.7) + this.springs.yaw.x;
    this.roll = amp * T.maxRollRad * n(23.3) + this.springs.roll.x;
    this.rise = amp * T.maxRiseM * n(41.9) + this.springs.rise.x;
  }

  /** 是否还在动（取证 / 测试用）。 */
  get Active() {
    return this.trauma > 0 || Object.values(this.springs).some((s) => s.x !== 0 || s.v !== 0);
  }

  Reset() {
    this.trauma = 0;
    for (const s of Object.values(this.springs)) s.Reset();
    this.pitch = 0; this.yaw = 0; this.roll = 0; this.rise = 0;
  }

  /** 取证快照。 */
  State() {
    return {
      trauma: this.trauma, pitch: this.pitch, yaw: this.yaw, roll: this.roll, rise: this.rise,
      active: this.Active, events: { ...this.events },
    };
  }
}
