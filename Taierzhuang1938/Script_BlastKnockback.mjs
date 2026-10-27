// Script_BlastKnockback.mjs — 一发爆炸推人推得多狠。纯规则，不 import three（契约 2）。
//
// 输入：爆点、人脚底的位置、姿态、装药量（kg）、挡没挡住。
// 输出：人整体得到的速度增量 Δv（大小、水平方向、竖直分量）与分档（没事 / 推一把 / 趴着被推着滑 / 倒地 / 掀飞），
//       以及撞墙、摔地的钝伤。数全在 Data_Tuning_BlastKnockback。
//
// 怎么算（docs/Data_BlastKnockback.md）：
//   1. 冲击波：Kinney–Graham 峰值超压 ps（与 Script_BlastExposure 同一个式子、同一份当量）；正压持续 td 也用 Kinney–Graham 拟合式。
//      Rankine–Hugoniot（空气 γ = 1.4）给激波速度 U、波后风速 u、动压 q、正面反射压 pr。
//   2. 人身上的冲量：绕射段（迎波面先吃 pr，清除时间 3S/U 内降到 ps，前后压差按三角形积分）+ 拖曳段（Cd·q 推人，动压衰减快，积分 0.19·q·td）。
//      乘迎波面积、除以 80 kg 就是 Δv。挡住了乘 0.4；不超过波后风速的一半、不超过 18 m/s。
//   3. 分档：站得住的上限按外推质心（迈一步能接住）；超过就绕脚翻倒；转得够快（L·ω² > g，脚撑不住）或者冲击有竖直分量就脚离地。
import { BLAST_EXPOSURE } from "./Data_Tuning_BlastReaction.mjs";
import { BLAST_KNOCKBACK } from "./Data_Tuning_BlastKnockback.mjs";
import { OverpressureRatio } from "./Script_BlastExposure.mjs";

const Clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const StanceKey = (stance) => (stance === "crouch" || stance === "prone" ? stance : "stand");

/** Kinney–Graham 正压持续时间：比例距离 Z（m/kg^⅓）→ td / W^⅓（毫秒 / kg^⅓）。 */
export function PositiveDurationScaledMs(scaledDistance) {
  const Z = Math.max(1e-3, scaledDistance);
  return 980 * (1 + (Z / 0.54) ** 10)
    / ((1 + (Z / 0.02) ** 3) * (1 + (Z / 0.74) ** 6) * Math.sqrt(1 + (Z / 6.9) ** 2));
}

/**
 * 冲击波到某个距离时的状态。
 * @returns {{chargeTntKg:number, scaledDistance:number, psKPa:number, prKPa:number, qKPa:number, tdS:number, shockMps:number, windMps:number}}
 */
export function BlastWave(distanceM, chargeKg, E = BLAST_EXPOSURE, K = BLAST_KNOCKBACK) {
  const W = Clamp(chargeKg, E.minChargeKg, E.maxChargeKg) * E.tntEquivalence * E.surfaceBurstFactor;
  const cube = Math.cbrt(W), R = Math.max(E.minDistanceM, distanceM), Z = R / cube;
  const P0 = E.ambientKPa, c0 = K.impulse.soundSpeedMps;
  const ps = OverpressureRatio(Z) * P0;
  const shockK = Math.sqrt(1 + 6 * ps / (7 * P0));
  return {
    chargeTntKg: W, scaledDistance: Z, psKPa: ps,
    prKPa: 2 * ps * (7 * P0 + 4 * ps) / (7 * P0 + ps),
    qKPa: 5 * ps * ps / (2 * (ps + 7 * P0)),
    tdS: PositiveDurationScaledMs(Z) * cube / 1000,
    shockMps: c0 * shockK,
    windMps: (5 * ps / (7 * P0)) * c0 / shockK,
  };
}

/**
 * 人整体得到的速度增量（只看大小，方向另算）。
 * @param {{distanceM:number, chargeKg:number, stance?:string, occluded?:boolean}} o  distanceM = 爆点到人质心
 * @returns {{dvMps:number, impulseNs:number, perAreaPaS:number, diffractionPaS:number, dragPaS:number, capped:string|null, wave:object}}
 */
export function BodyImpulse({ distanceM, chargeKg, stance = "stand", occluded = false }, K = BLAST_KNOCKBACK, E = BLAST_EXPOSURE) {
  const I = K.impulse, wave = BlastWave(distanceM, chargeKg, E, K);
  const clearS = Math.min(3 * I.clearingM / wave.shockMps, wave.tdS);
  const diffraction = 0.5 * (wave.prKPa - wave.psKPa) * 1000 * clearS;
  const drag = I.dragCoefficient * wave.qKPa * 1000 * wave.tdS * I.dynamicImpulseShape;
  const perArea = diffraction + drag;
  let dv = perArea * I.areaM2[StanceKey(stance)] / I.massKg;
  if (occluded) dv *= I.occludedScale;
  let capped = null;
  const windCap = I.windFractionCap * wave.windMps;
  if (dv > windCap) { dv = windCap; capped = "wind"; }
  if (dv > I.maxDeltaVMps) { dv = I.maxDeltaVMps; capped = "max"; }
  return { dvMps: dv, impulseNs: dv * I.massKg, perAreaPaS: perArea, diffractionPaS: diffraction, dragPaS: drag, capped, wave };
}

/** 站得住的上限（m/s）：迈一步接得住 = 迈步距离 × √(g / 质心高)。趴着不会被推倒（∞）。 */
export function BalanceLimitMps(stance, K = BLAST_KNOCKBACK) {
  const key = StanceKey(stance);
  if (key === "prone") return Infinity;
  const B = K.body;
  return B.stepReachM[key] * Math.sqrt(B.gravityMps2 / B.comHeightM[key]);
}

/** 绕脚翻倒的初始转速（rad/s）：冲量对脚的角动量 m·Δv·L = 绕脚的转动惯量 m(k² + L²)·ω。 */
export function ToppleSpinRadS(dvMps, stance, K = BLAST_KNOCKBACK) {
  const key = StanceKey(stance), B = K.body, L = B.comHeightM[key], k = B.gyrationM[key];
  return dvMps * L / (k * k + L * L);
}

/** 脚撑不住、整个人离地的水平速度（m/s）：L·ω² > g，即 Δv > √(gL)·(k² + L²) / L²。 */
export function LiftoffMps(stance, K = BLAST_KNOCKBACK) {
  const key = StanceKey(stance), B = K.body, L = B.comHeightM[key], k = B.gyrationM[key];
  return Math.sqrt(B.gravityMps2 * L) * (k * k + L * L) / (L * L);
}

/**
 * 分档。
 * @returns {"none"|"stagger"|"slide"|"fall"|"thrown"}
 */
export function KnockRegime({ horizontalMps, upMps = 0, stance = "stand" }, K = BLAST_KNOCKBACK) {
  const R = K.regime, key = StanceKey(stance);
  const total = Math.hypot(horizontalMps, Math.max(0, upMps));
  if (total < R.ignoreMps) return "none";
  if (key === "prone") return horizontalMps >= R.proneSlideMps ? "slide" : "stagger";
  const balance = BalanceLimitMps(key, K);
  // 往上掀只有在本来就站不住时才算「飞出去」：站得住的那一下往上抬几毫米，落回来还是晃一步
  if (horizontalMps > LiftoffMps(key, K) || (upMps > R.liftVerticalMps && horizontalMps >= balance)) return "thrown";
  return horizontalMps >= balance ? "fall" : "stagger";
}

/**
 * 一发爆炸对一个人的推力（方向从爆点指向人的质心）。
 * @param {{burst:{x,y,z}, feet:{x,y,z}, stance?:string, chargeKg:number, occluded?:boolean}} o
 * @returns {{dvMps:number, horizontalMps:number, upMps:number, dirX:number, dirZ:number, distanceM:number, regime:string, impulse:object}}
 */
export function BlastPush({ burst, feet, stance = "stand", chargeKg, occluded = false }, K = BLAST_KNOCKBACK, E = BLAST_EXPOSURE) {
  const key = StanceKey(stance);
  const cx = feet.x - burst.x, cy = feet.y + K.body.comHeightM[key] - burst.y, cz = feet.z - burst.z;
  const flat = Math.hypot(cx, cz), distanceM = Math.hypot(flat, cy);
  const impulse = BodyImpulse({ distanceM, chargeKg, stance: key, occluded }, K, E);
  const dv = impulse.dvMps, inv = 1 / Math.max(1e-6, distanceM);
  // 正好站在爆点正上方：水平方向随便挑一个固定的（出图可复现），推力几乎全是竖直的
  const dirX = flat > 1e-4 ? cx / flat : 1, dirZ = flat > 1e-4 ? cz / flat : 0;
  const horizontalMps = dv * flat * inv, upMps = dv * cy * inv;
  const regime = KnockRegime({ horizontalMps, upMps, stance: key }, K);
  return { dvMps: dv, horizontalMps, upMps, dirX, dirZ, distanceM, regime, impulse };
}

/** 撞击钝伤（HP）：surface = "wall" | "ground"，分段线性、最后一段往外延。 */
export function ImpactDamage(speedMps, surface = "ground", K = BLAST_KNOCKBACK) {
  const table = K.damage[surface] || K.damage.ground;
  const v = Math.max(0, speedMps);
  if (v <= table[0][0]) return 0;
  for (let i = 1; i < table.length; i += 1) {
    const [v1, d1] = table[i];
    if (v <= v1 || i === table.length - 1) {
      const [v0, d0] = table[i - 1];
      return Math.max(0, d0 + (d1 - d0) * (v - v0) / (v1 - v0));
    }
  }
  return 0;
}

export default BlastPush;
