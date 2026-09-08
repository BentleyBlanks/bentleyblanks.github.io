// Script_PlayerHitbox.mjs — 玩家自己的子弹判定几何：按姿态摆的头球 + 躯干/四肢胶囊。
//
// **纯规则，不 import three。** 以前 AI 打玩家的部位是**抽概率**的（COMBAT.player.headChance），
// 玩家本人在世界里没有任何命中体 —— 趴下之后除了命中率乘 0.45，身体露出多少、哪儿露出来
// 对 AI 的子弹没有意义。现在 AI 照胸口瞄、按 aimScatterM 散一点，射线真的去碰这几根胶囊，
// 打到哪儿算哪儿：卧倒的人头在最前面、躯干贴地藏在头后面；蹲着的人腿收起来。
//
// 尺寸与 `Data_Tuning_Player.STANCE` 的 eye 同源（头球中心 = 眼高 − 头心到眼的 0.07），
// 其余各段是按 1.70 m 身高的比例写的；不是从骨骼量的，玩家没有第三人称骨骼。
// 求交用 Script_CharacterHitboxMath 那套精确 ray/capsule 首交点（与 NPC 同一套核）。

import { STANCE } from "./Data_Tuning_Player.mjs";
import { RaycastCapsule, RaycastSphere } from "./Script_CharacterHitboxMath.mjs";

/**
 * 每个姿态的分段。局部坐标：f 沿面朝方向（米），r 沿右手方向，y 离脚底高度。
 * kind = sphere: { f, r, y, radius }；capsule: { f0, r0, y0, f1, r1, y1, radius }。
 * 同名部位可以有多段（两条腿、两条胳膊），部位名与 Player.TakeHit 的 part 同一套：head / torso / arm / leg。
 */
export const PLAYER_HITBOX = Object.freeze({
  stand: Object.freeze([
    { part: "head", kind: "sphere", f: 0.02, r: 0, y: STANCE.stand.eye - 0.07, radius: 0.13 },
    { part: "torso", kind: "capsule", f0: 0, r0: 0, y0: 0.95, f1: 0, r1: 0, y1: 1.40, radius: 0.20 },
    { part: "arm", kind: "capsule", f0: 0.02, r0: 0.28, y0: 0.85, f1: 0, r1: 0.28, y1: 1.40, radius: 0.07 },
    { part: "arm", kind: "capsule", f0: 0.02, r0: -0.28, y0: 0.85, f1: 0, r1: -0.28, y1: 1.40, radius: 0.07 },
    { part: "leg", kind: "capsule", f0: 0, r0: 0.11, y0: 0.12, f1: 0, r1: 0.11, y1: 0.92, radius: 0.12 },
    { part: "leg", kind: "capsule", f0: 0, r0: -0.11, y0: 0.12, f1: 0, r1: -0.11, y1: 0.92, radius: 0.12 },
  ]),
  crouch: Object.freeze([
    { part: "head", kind: "sphere", f: 0.06, r: 0, y: STANCE.crouch.eye - 0.07, radius: 0.13 },
    { part: "torso", kind: "capsule", f0: 0.02, r0: 0, y0: 0.50, f1: 0.06, r1: 0, y1: 0.88, radius: 0.21 },
    { part: "arm", kind: "capsule", f0: 0.10, r0: 0.27, y0: 0.45, f1: 0.04, r1: 0.27, y1: 0.88, radius: 0.07 },
    { part: "arm", kind: "capsule", f0: 0.10, r0: -0.27, y0: 0.45, f1: 0.04, r1: -0.27, y1: 0.88, radius: 0.07 },
    { part: "leg", kind: "capsule", f0: 0.12, r0: 0.13, y0: 0.12, f1: -0.05, r1: 0.13, y1: 0.52, radius: 0.14 },
    { part: "leg", kind: "capsule", f0: 0.12, r0: -0.13, y0: 0.12, f1: -0.05, r1: -0.13, y1: 0.52, radius: 0.14 },
  ]),
  prone: Object.freeze([
    { part: "head", kind: "sphere", f: 0.70, r: 0, y: STANCE.prone.eye - 0.08, radius: 0.12 },
    { part: "torso", kind: "capsule", f0: 0.50, r0: 0, y0: 0.27, f1: -0.30, r1: 0, y1: 0.24, radius: 0.22 },
    { part: "arm", kind: "capsule", f0: 0.55, r0: 0.22, y0: 0.20, f1: 0.88, r1: 0.16, y1: 0.22, radius: 0.07 },
    { part: "arm", kind: "capsule", f0: 0.55, r0: -0.22, y0: 0.20, f1: 0.88, r1: -0.16, y1: 0.22, radius: 0.07 },
    { part: "leg", kind: "capsule", f0: -0.30, r0: 0.12, y0: 0.14, f1: -1.10, r1: 0.14, y1: 0.12, radius: 0.11 },
    { part: "leg", kind: "capsule", f0: -0.30, r0: -0.12, y0: 0.14, f1: -1.10, r1: -0.14, y1: 0.12, radius: 0.11 },
  ]),
});

/** 面朝 / 右手方向。与 Script_Player 同一套：yaw=0 面朝 -Z，右手是 +X。 */
function Basis(yaw) {
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
  return { fx, fz, rx: Math.cos(yaw), rz: -Math.sin(yaw) };
}

function Place(out, position, b, f, r, y) {
  out.x = position.x + b.fx * f + b.rx * r;
  out.y = position.y + y;
  out.z = position.z + b.fz * f + b.rz * r;
  return out;
}

/**
 * 按姿态把分段摆到世界里。
 * @param {{x:number,y:number,z:number}} position 脚底（Player.position）
 * @param {number} yaw Player.yaw
 * @param {"stand"|"crouch"|"prone"} stance
 * @param {Array} [out] 复用的输出数组（每帧调用不产垃圾）
 * @returns {Array<{part:string,kind:string,center?:object,start?:object,end?:object,radius:number}>}
 */
export function PlayerHitboxes(position, yaw, stance, out = [], leanOffsetM = 0) {
  const spec = PLAYER_HITBOX[stance] || PLAYER_HITBOX.stand;
  const b = Basis(yaw);
  out.length = 0;
  for (const s of spec) {
    if (s.kind === "sphere") {
      out.push({ part: s.part, kind: "sphere", center: Place({}, position, b, s.f, s.r, s.y), radius: s.radius });
    } else {
      out.push({
        part: s.part, kind: "capsule",
        start: Place({}, position, b, s.f0, s.r0, s.y0),
        end: Place({}, position, b, s.f1, s.r1, s.y1),
        radius: s.radius,
      });
    }
  }
  // Lean the upper body from the hips; feet and collision capsule stay planted.
  if (stance !== "prone" && leanOffsetM) {
    const headY = spec.find((s) => s.part === "head").y;
    const pivotY = spec.find((s) => s.part === "torso").y0;
    for (const box of out) {
      if (box.part === "leg") continue;
      for (const point of box.center ? [box.center] : [box.start, box.end]) {
        const k = Math.max(0, Math.min(1, (point.y - position.y - pivotY) / (headY - pivotY)));
        point.x += b.rx * leanOffsetM * k; point.z += b.rz * leanOffsetM * k;
      }
    }
  }
  return out;
}

/** AI 瞄的点：躯干胶囊的中点（站着是胸口，趴着是背心）。 */
export function PlayerAimPoint(position, yaw, stance, out = { x: 0, y: 0, z: 0 }, leanOffsetM = 0) {
  const spec = PLAYER_HITBOX[stance] || PLAYER_HITBOX.stand;
  const torso = spec.find((s) => s.part === "torso");
  const b = Basis(yaw);
  const headY = spec.find((s) => s.part === "head").y;
  const shift = stance === "prone" ? 0 : leanOffsetM * (torso.y1 - torso.y0) * 0.5 / (headY - torso.y0);
  return Place(out, position, b, (torso.f0 + torso.f1) * 0.5, (torso.r0 + torso.r1) * 0.5 + shift, (torso.y0 + torso.y1) * 0.5);
}

/**
 * 子弹线先碰到哪一段。direction 必须归一化。
 * @returns {{part:string,t:number}|null}
 */
export function RaycastPlayerHitboxes(origin, direction, hitboxes, maxDistance = Infinity) {
  let best = null;
  for (const h of hitboxes) {
    const t = h.kind === "sphere"
      ? RaycastSphere(origin, direction, h.center, h.radius)
      : RaycastCapsule(origin, direction, h.start, h.end, h.radius);
    if (t === null || t === undefined || t > maxDistance) continue;
    if (!best || t < best.t) best = { part: h.part, t };
  }
  return best;
}

/**
 * 从 [0,1) 均匀随机造一对标准正态（Box–Muller）。给 AI 的瞄准散点用；
 * 传入的 rnd 是士兵自己的确定性随机源，不许 Math.random。
 */
export function GaussianPair(rnd) {
  const u1 = Math.max(1e-9, rnd());
  const u2 = rnd();
  const mag = Math.sqrt(-2 * Math.log(u1));
  return [mag * Math.cos(2 * Math.PI * u2), mag * Math.sin(2 * Math.PI * u2)];
}
