// Script_BlastExposure.mjs — 一发爆炸落到人头上有多「响」。纯规则，不 import three（契约 2）。
//
// 输入：到爆心的距离、装药量（kg）、挡没挡住、爆点在头的哪一侧（lateral：右 +1 / 左 −1；forward：前 +1 / 后 −1；up：上 +1）。
// 输出：峰值超压（kPa）、峰值声压级（dB），左右耳各自的 dB，以及各种反应在各自 dB 窗里的强度 0..1
//（眨眼 / 缩身 / 闭紧眼 / 左右耳耳鸣 / 恍惚 / 手抖 / 喘与心跳）。数全在 Data_Tuning_BlastReaction.BLAST_EXPOSURE。
//
// 为什么不用原来的「距离 / 杀伤半径」：同样 20 m，一颗手榴弹和一颗 150 毫米榴弹差了 11 dB（约 3.5 倍声压），
// 而杀伤半径是玩法值（掷弹筒 5 m、手榴弹 6.5 m），不跟装药走。超压按装药量的立方根缩放（Hopkinson–Cranz），
// 这是爆炸物理里「多远算近」的那把尺子。
import { BLAST_EXPOSURE } from "./Data_Tuning_BlastReaction.mjs";
import { EXPLOSIVES, ExplosiveIdFor } from "./Data_Explosives.mjs";

const Clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const Clamp01 = (v) => Clamp(v, 0, 1);

/** Kinney–Graham 自由场 TNT：比例距离 Z（m/kg^⅓）→ 峰值超压 / 大气压。 */
export function OverpressureRatio(scaledDistance) {
  const Z = Math.max(1e-3, scaledDistance);
  return 808 * (1 + (Z / 4.5) ** 2)
    / Math.sqrt((1 + (Z / 0.048) ** 2) * (1 + (Z / 0.32) ** 2) * (1 + (Z / 1.35) ** 2));
}

/** 距离（米）+ 装药（kg）→ 峰值超压（kPa）。地面爆炸按 surfaceBurstFactor 倍当量。 */
export function PeakOverpressureKPa(distanceM, chargeKg, E = BLAST_EXPOSURE) {
  const W = Clamp(chargeKg, E.minChargeKg, E.maxChargeKg) * E.tntEquivalence * E.surfaceBurstFactor;
  const R = Math.max(E.minDistanceM, distanceM);
  return OverpressureRatio(R / Math.cbrt(W)) * E.ambientKPa;
}

/** 峰值超压（kPa）→ 峰值声压级（dB SPL）。 */
export function PeakSplDb(kPa, E = BLAST_EXPOSURE) {
  return 20 * Math.log10(Math.max(1e-9, kPa * 1000) / E.referencePa);
}

/** 一种反应在它的 dB 窗里的强度。window = [从, 满, 次方]。 */
export function WindowStrength(db, window) {
  const [from, full, curve = 1] = window;
  const x = Clamp01((db - from) / Math.max(1e-6, full - from));
  return x > 0 ? Math.pow(x, curve) : 0;
}

/**
 * 装药量（kg）：先按弹种查 Data_Explosives，查不到按杀伤半径反推（半径 ∝ 装药的立方根）。
 * @param {string|null} explosiveId  弹种 id 或 Combat 的 kind（grenade / shell / tank …）
 * @param {number} radiusM           Combat.Blast 的半径
 */
export function ChargeKgFor(explosiveId, radiusM, E = BLAST_EXPOSURE) {
  if (explosiveId) {
    const id = EXPLOSIVES[explosiveId] ? explosiveId : ExplosiveIdFor(explosiveId);
    const kg = EXPLOSIVES[id]?.fillingKg;
    if (kg > 0) return kg;
  }
  const r = Math.max(0.5, Number(radiusM) || E.fallbackRadiusM);
  return Clamp(E.fallbackChargeKg * (r / E.fallbackRadiusM) ** 3, E.minChargeKg, E.maxChargeKg);
}

/**
 * 爆点相对人头的方向分量（纯数学，调用方给世界坐标）。yaw 是玩家朝向（three 约定：前 = (−sin, 0, −cos)）。
 * @returns {{lateral:number, forward:number, up:number, distance:number}}
 */
export function BlastBearing(eye, blast, yaw) {
  const dx = blast.x - eye.x, dy = blast.y - eye.y, dz = blast.z - eye.z;
  const distance = Math.hypot(dx, dy, dz);
  const inv = distance > 1e-6 ? 1 / distance : 0;
  const cx = Math.cos(yaw || 0), sx = Math.sin(yaw || 0);
  // 右 = (cos, 0, −sin)，前 = (−sin, 0, −cos)。
  return {
    lateral: (dx * cx - dz * sx) * inv,
    forward: (-dx * sx - dz * cx) * inv,
    up: dy * inv,
    distance,
  };
}

/**
 * 一发爆炸的暴露量。
 * @param {object} p
 * @param {number} p.distanceM
 * @param {number} p.chargeKg
 * @param {boolean} [p.occluded]
 * @param {number} [p.lateral]  爆点在右 +1 / 左 −1
 */
export function BlastExposure({ distanceM, chargeKg, occluded = false, lateral = 0 }, E = BLAST_EXPOSURE) {
  const kPa = PeakOverpressureKPa(distanceM, chargeKg, E);
  const freeDb = PeakSplDb(kPa, E);
  const db = freeDb + (occluded ? E.occludedDb : 0);
  // 头影：背对爆点那只耳朵少挨 headShadowDb（正侧面满额，正前 / 正后不扣）。
  const side = Clamp(lateral, -1, 1);
  const dbRight = db + E.headShadowDb * Math.max(0, -side);
  const dbLeft = db + E.headShadowDb * Math.max(0, side);
  const W = E.windows;
  const out = {
    kPa, freeDb, db, dbLeft, dbRight, occluded: !!occluded, chargeKg, distanceM,
    blink: WindowStrength(db, W.blink),
    flinch: WindowStrength(db, W.flinch),
    squeeze: WindowStrength(db, W.squeeze),
    tinnitusLeft: WindowStrength(dbLeft, W.tinnitus),
    tinnitusRight: WindowStrength(dbRight, W.tinnitus),
    daze: WindowStrength(db, W.daze),
    tremor: WindowStrength(db, W.tremor),
    body: WindowStrength(db, W.body),
    arrivalS: Math.max(0, distanceM) / E.soundSpeedMps,
  };
  out.tinnitus = Math.max(out.tinnitusLeft, out.tinnitusRight);
  out.any = out.blink > 0 || out.flinch > 0 || out.tinnitus > 0;
  return out;
}

export default BlastExposure;
