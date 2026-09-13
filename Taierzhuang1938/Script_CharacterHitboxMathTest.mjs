import assert from "node:assert/strict";
import { JointOwner, RaycastCapsule, RaycastEllipsoid, RaycastSphere } from "./Script_CharacterHitboxMath.mjs";

const near = (actual, expected, label) => assert.ok(Math.abs(actual - expected) < 1e-7,
  `${label}: expected ${expected}, got ${actual}`);
const origin = { x: 0, y: 0, z: 0 };
const forward = { x: 0, y: 0, z: 1 };
const upward = { x: 0, y: 1, z: 0 };

near(RaycastSphere(origin, forward, { x: 0, y: 0, z: 4 }, 0.5), 3.5, "sphere first hit");
assert.equal(RaycastSphere(origin, forward, { x: 1, y: 0, z: 4 }, 0.5), null, "sphere miss");

const unitAxes = {
  x: { x: 1, y: 0, z: 0 },
  y: { x: 0, y: 1, z: 0 },
  z: { x: 0, y: 0, z: 1 },
};
const headRadii = { x: 0.15, y: 0.15, z: 0.12 };
near(RaycastEllipsoid(origin, forward, { x: 0, y: 0, z: 4 }, headRadii, unitAxes), 3.88,
  "ellipsoid narrow-axis first hit");
assert.equal(RaycastEllipsoid({ x: 0, y: 0, z: 0.121 }, upward,
  { x: 0, y: 4, z: 0 }, headRadii, unitAxes), null, "ellipsoid width near miss");
near(RaycastEllipsoid({ x: 0, y: 0, z: 0.119 }, upward,
  { x: 0, y: 4, z: 0 }, headRadii, unitAxes),
4 - 0.15 * Math.sqrt(1 - (0.119 / 0.12) ** 2), "ellipsoid width near-edge hit");
assert.equal(RaycastEllipsoid({ x: 0, y: 0, z: 4 }, forward,
  { x: 0, y: 0, z: 4 }, headRadii, unitAxes), 0, "ray starts inside ellipsoid");

const top = { x: 0, y: 1, z: 5 }, bottom = { x: 0, y: -1, z: 5 };
near(RaycastCapsule(origin, forward, top, bottom, 0.4), 4.6, "capsule cylinder first hit");
near(RaycastCapsule({ x: 0.25, y: 1.25, z: 0 }, forward, top, bottom, 0.4),
  5 - Math.sqrt(0.4 * 0.4 - 0.25 * 0.25 - 0.25 * 0.25), "capsule cap first hit");
assert.equal(RaycastCapsule({ x: 0.41, y: 0, z: 0 }, forward, top, bottom, 0.4), null,
  "capsule near miss");
assert.equal(RaycastCapsule({ x: 0, y: 0, z: 5 }, forward, top, bottom, 0.4), 0,
  "ray starts inside capsule");

// JointOwner：关节球里的首交点按关节平分面归段（docs/Data_Dismemberment.md §11.9）。
{
  const V = (x, y, z) => ({ x, y, z });
  const Limb = (id, a, b, start, end, worldRadius, part = "limb") =>
    ({ id, type: "capsule", part, a, b, start, end, worldRadius });
  const Unit = (from, to) => {
    const d = V(to.x - from.x, to.y - from.y, to.z - from.z), l = Math.hypot(d.x, d.y, d.z);
    return V(d.x / l, d.y / l, d.z / l);
  };
  const FirstHit = (shapes, from, dir) => {
    let best = null;
    for (const shape of shapes) {
      const t = RaycastCapsule(from, dir, shape.start, shape.end, shape.worldRadius);
      if (t !== null && (!best || t < best.t)) best = { t, shape };
    }
    const point = best && V(from.x + dir.x * best.t, from.y + dir.y * best.t, from.z + dir.z * best.t);
    return best && { first: best.shape.id, owner: JointOwner(shapes, best.shape, point).id };
  };

  // 实测帧：GoreRangeTest 木桩 L10_1（LugouIja01）站定据枪，右膝弯着、胫骨往后斜；
  // 玩家 4 m 外开镜瞄右小腿中点，子弹从枪口往下 17° 进来（2026-09-13 master 取证）。
  const knee = V(3331.838, 0.431, 3348.000);
  const thighR = Limb("thighR", "thighR", "calfR", V(3331.906, 0.778, 3348.005), knee, 0.089);
  const calfR = Limb("calfR", "calfR", "footR", knee, V(3331.879, 0.168, 3347.768), 0.067);
  const muzzle = V(3331.955, 1.159, 3350.686);
  const shot = FirstHit([thighR, calfR], muzzle, Unit(muzzle, V(3331.866, 0.355, 3348.039)));
  assert.equal(shot.first, "thighR", "实测弹道先碰到的是大腿胶囊悬在膝下的端帽");
  assert.equal(shot.owner, "calfR", "那一点在关节平分面的小腿一侧，归小腿（蒙皮权重 95% 在小腿骨）");

  // 同一个膝盖：正对髌骨平射仍是大腿，打在膝盖上方的大腿圆柱面也仍是大腿。
  const front = V(knee.x, knee.y + 0.02, knee.z + 2);
  assert.equal(FirstHit([thighR, calfR], front, Unit(front, V(knee.x, knee.y + 0.02, knee.z))).owner, "thighR",
    "屈膝时膝盖前面（髌骨）归大腿");
  const above = V(knee.x + 0.03, 0.62, knee.z + 2);
  assert.equal(FirstHit([thighR, calfR], above, V(0, 0, -1)).owner, "thighR", "膝盖上方的大腿圆柱面不动");
  // 小腿已经断了：它不在 shapes 里，大腿端帽保留原判定。
  assert.equal(FirstHit([thighR], muzzle, Unit(muzzle, V(3331.866, 0.355, 3348.039))).owner, "thighR",
    "断掉的那一段抢不走任何点");

  // 伸直的腿：平分面就是过膝垂直于腿的面；反过来小腿端帽伸进大腿一侧的点归大腿。
  const straightKnee = V(0, 0.5, 0);
  const thigh = Limb("thighL", "thighL", "calfL", V(0, 0.9, 0), straightKnee, 0.10);
  const calf = Limb("calfL", "calfL", "footL", straightKnee, V(0, 0.1, 0), 0.075);
  assert.equal(JointOwner([thigh, calf], thigh, V(0, 0.44, 0.08)).id, "calfL", "膝下 6 cm 的点归小腿");
  assert.equal(JointOwner([thigh, calf], calf, V(0, 0.53, 0.07)).id, "thighL", "膝上 3 cm 的点归大腿");
  assert.equal(JointOwner([thigh, calf], thigh, V(0, 0.38, 0.1)).id, "thighL", "离关节超过端帽半径的点不改判");

  // 只动肢体：躯干与头的伤害分类照原样；没有骨头名的命中体不串关节。
  const chest = V(0, 1.32, 0);
  const lower = Limb("lowerTorso", "pelvis", "chest", V(0, 1.02, 0), chest, 0.19, "torso");
  const upper = Limb("upperTorso", "chest", "neck", chest, V(0, 1.5, 0), 0.135, "torso");
  assert.equal(JointOwner([lower, upper], lower, V(0, 1.4, 0.17)).id, "lowerTorso", "躯干不按关节改判");
  const anonymous = [{ ...thigh, a: undefined, b: undefined }, { ...calf, a: undefined, b: undefined }];
  assert.equal(JointOwner(anonymous, anonymous[0], V(0, 0.44, 0.08)).id, "thighL", "没有骨头名就不算同一关节");
}

console.log("CharacterHitboxMathTest OK — exact sphere/ellipsoid/capsule entry, miss and inside cases, joint ownership");
