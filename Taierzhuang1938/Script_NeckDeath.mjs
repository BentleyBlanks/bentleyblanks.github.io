// 敌军喉咙里那一声窒息哽咽：**什么时候放**的规则层（纯函数，零 three；口径 docs/Data_NeckDeath.md）。
//
// 两个入口：
//   IsNeckHit(shapes, shapeId, point)  —— 这一发/这一刀打中的命中体上，弹着点是不是在脖子那一带；
//   DecideNeckDeath({...})            —— 综合击杀类型、阵营、离玩家的距离与一次抽签，给出放不放、算哪一类。
// 抽签值由调用方给（Soldier 用 id × 受击序号做哈希，不占用它自己的 rnd 序列，别的随机结果不会因此挪位）。
import { NECK_DEATH } from "./Data_NeckDeath.mjs";

const Sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const Dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;

/**
 * 弹着点在脖子那一带吗？
 * @param {Array<object>} shapes 运行时 `characterRig.GetHitboxes()` 的结果（sphere/ellipsoid 有 center，capsule 有 start/end）
 * @param {string|null} shapeId 打中的命中体 id（不给 = 这条链不做几何，判不了，一律 false）
 * @param {{x:number,y:number,z:number}|null} point 弹着点（世界坐标）
 */
export function IsNeckHit(shapes, shapeId, point, tuning = NECK_DEATH.neck) {
  if (!shapeId || !point || !Array.isArray(shapes)) return false;
  const shape = shapes.find((entry) => entry.id === shapeId);
  if (!shape) return false;
  if (shapeId === "upperTorso" && shape.type === "capsule" && shape.start && shape.end) {
    // 胶囊 a=胸、b=颈：沿轴投影，t=1 是颈根。
    const axis = Sub(shape.end, shape.start);
    const len2 = Dot(axis, axis);
    if (len2 < 1e-9) return false;
    const t = Dot(Sub(point, shape.start), axis) / len2;
    return t >= tuning.torsoFromT;
  }
  if (shapeId === "head" && shape.center) {
    const radius = shape.worldRadii?.y ?? shape.worldRadius ?? 0;
    return radius > 0 && shape.center.y - point.y >= tuning.headBelowFraction * radius;
  }
  return false;
}

/**
 * 这一具倒下的尸体放不放喉音。
 * @param {{side:string, kind:string, neckHit:boolean, distanceM:number, roll:number}} input
 *   kind 是致死那一下的 `info.kind`；roll 是 [0,1) 的抽签值；distanceM 是离玩家的水平/直线距离
 * @returns {{play:boolean, cause:"neckShot"|"blade"|null}}
 */
export function DecideNeckDeath({ side, kind, neckHit, distanceM, roll }, tuning = NECK_DEATH) {
  const no = { play: false, cause: null };
  if (side !== tuning.side) return no;
  if (!(distanceM <= tuning.nearM)) return no;
  let cause = null;
  if (tuning.bladeKinds.includes(kind)) cause = "blade";
  else if (tuning.bulletKinds.includes(kind) && neckHit) cause = "neckShot";
  if (!cause) return no;
  return roll < tuning.chance[cause] ? { play: true, cause } : no;
}

/** id × 受击序号 → [0,1) 的确定性抽签（整数混合，够用即可）。 */
export function NeckDeathRoll(id, sequence) {
  let h = (Math.imul((id | 0) + 0x9e3779b9, 0x85ebca6b) ^ Math.imul((sequence | 0) + 0x7f4a7c15, 0xc2b2ae35)) >>> 0;
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d) >>> 0; h ^= h >>> 12; h = Math.imul(h, 0x297a2d39) >>> 0; h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}
