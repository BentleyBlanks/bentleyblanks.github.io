// Script_PlayerHitboxTest.mjs — 玩家命中几何的纯 Node 回归：三姿态的头/躯干/四肢都在
// 身高范围里、正面来弹先碰到该碰到的部位、卧倒把躯干藏到头后面、瞄点落在躯干里、
// 散点采样出来的部位分布随姿态变化而且趴着仍然比站着少挨打。
import assert from "node:assert/strict";
import { Mulberry32 } from "./Script_Noise.mjs";
import { STANCE } from "./Data_Tuning_Player.mjs";
import {
  PLAYER_HITBOX, PlayerHitboxes, PlayerAimPoint, RaycastPlayerHitboxes, GaussianPair,
} from "./Script_PlayerHitbox.mjs";

const feet = { x: 10, y: 2, z: -5 };
const Norm = (v) => { const l = Math.hypot(v.x, v.y, v.z) || 1; return { x: v.x / l, y: v.y / l, z: v.z / l }; };

// 三姿态都有四种部位，且全部落在脚底与眼高之间。
for (const stance of ["stand", "crouch", "prone"]) {
  const boxes = PlayerHitboxes(feet, 0, stance);
  const parts = new Set(boxes.map((b) => b.part));
  assert.deepEqual([...parts].sort(), ["arm", "head", "leg", "torso"], `${stance} 四种部位齐`);
  for (const b of boxes) {
    const ys = b.kind === "sphere" ? [b.center.y] : [b.start.y, b.end.y];
    for (const y of ys) {
      assert.ok(y - feet.y >= 0.05 && y - feet.y <= STANCE[stance].eye + 0.02,
        `${stance}.${b.part} 高度 ${y - feet.y} 在脚底与眼高之间`);
    }
  }
  assert.ok(Object.isFrozen(PLAYER_HITBOX[stance]), "分段表冻结");
}

// 站着：正面平射胸口高度先碰躯干；平射头高先碰头；打脚踝先碰腿。
{
  const boxes = PlayerHitboxes(feet, 0, "stand");           // 面朝 -Z，敌人在 -Z 方向 30 m
  const from = (y) => ({ x: feet.x, y: feet.y + y, z: feet.z - 30 });
  const dir = { x: 0, y: 0, z: 1 };
  assert.equal(RaycastPlayerHitboxes(from(1.2), dir, boxes).part, "torso", "胸口高度先碰躯干");
  assert.equal(RaycastPlayerHitboxes(from(STANCE.stand.eye - 0.07), dir, boxes).part, "head", "头高先碰头");
  assert.equal(RaycastPlayerHitboxes({ x: feet.x + 0.11, y: feet.y + 0.4, z: feet.z - 30 }, dir, boxes).part, "leg", "脚踝高度先碰腿");
  assert.equal(RaycastPlayerHitboxes(from(2.0), dir, boxes), null, "头顶上方打空");
  assert.equal(RaycastPlayerHitboxes({ x: feet.x + 0.29, y: feet.y + 1.1, z: feet.z - 30 }, dir, boxes).part,
    "arm", "肩宽外侧先碰胳膊");
}

// 卧倒：躯干藏在头后面 —— 正面平射先碰头，抬高一点就整个人打空；侧面来弹先碰躯干。
{
  const boxes = PlayerHitboxes(feet, 0, "prone");
  const dir = { x: 0, y: 0, z: 1 };
  const head = RaycastPlayerHitboxes({ x: feet.x, y: feet.y + 0.32, z: feet.z - 30 }, dir, boxes);
  assert.equal(head.part, "head", "卧倒正面平射先碰到的是头");
  assert.equal(RaycastPlayerHitboxes({ x: feet.x, y: feet.y + 0.75, z: feet.z - 30 }, dir, boxes), null,
    "卧倒后 0.75 m 高的子弹整个人打空");
  const side = RaycastPlayerHitboxes({ x: feet.x + 30, y: feet.y + 0.25, z: feet.z }, { x: -1, y: 0, z: 0 }, boxes);
  assert.equal(side.part, "torso", "侧面来弹先碰躯干");
  const torso = boxes.find((b) => b.part === "torso");
  assert.ok(torso.start.z < feet.z, "面朝 -Z 时躯干前端在 -Z 侧");
}

// 面朝方向跟着 yaw 转：转 90° 后头球移到 -X 侧。
{
  const boxes = PlayerHitboxes(feet, Math.PI / 2, "prone");
  const head = boxes.find((b) => b.part === "head");
  assert.ok(head.center.x < feet.x - 0.5 && Math.abs(head.center.z - feet.z) < 1e-9,
    `yaw=π/2 面朝 -X，头在 -X 侧 (${head.center.x - feet.x}, ${head.center.z - feet.z})`);
}

// 瞄点在躯干胶囊里。
for (const stance of ["stand", "crouch", "prone"]) {
  const aim = PlayerAimPoint(feet, 0.7, stance);
  const boxes = PlayerHitboxes(feet, 0.7, stance);
  const torso = boxes.find((b) => b.part === "torso");
  const mid = { x: (torso.start.x + torso.end.x) / 2, y: (torso.start.y + torso.end.y) / 2, z: (torso.start.z + torso.end.z) / 2 };
  assert.ok(Math.hypot(aim.x - mid.x, aim.y - mid.y, aim.z - mid.z) < 1e-9, `${stance} 瞄点 = 躯干中点`);
}

// 散点统计：照 Script_Ai 的做法（瞄躯干中点、σ 散一点、射线求交、打空算躯干），
// 站着以躯干为主、爆头是少数；趴着头占比上升但期望倍率仍低于站着的命中率折让。
{
  const rnd = Mulberry32(1234);
  const Sample = (stance, from, sigma = 0.24, n = 4000) => {
    const boxes = PlayerHitboxes(feet, 0, stance);
    const aim = PlayerAimPoint(feet, 0, stance);
    const dir = Norm({ x: aim.x - from.x, y: aim.y - from.y, z: aim.z - from.z });
    // 与 dir 垂直的两个轴
    const u = Norm({ x: dir.z, y: 0, z: -dir.x });
    const w = { x: dir.y * u.z - dir.z * u.y, y: dir.z * u.x - dir.x * u.z, z: dir.x * u.y - dir.y * u.x };
    const count = { head: 0, torso: 0, arm: 0, leg: 0 };
    for (let i = 0; i < n; i += 1) {
      const [g1, g2] = GaussianPair(rnd);
      const target = { x: aim.x + u.x * g1 * sigma + w.x * g2 * sigma, y: aim.y + u.y * g1 * sigma + w.y * g2 * sigma, z: aim.z + u.z * g1 * sigma + w.z * g2 * sigma };
      const d = Norm({ x: target.x - from.x, y: target.y - from.y, z: target.z - from.z });
      const hit = RaycastPlayerHitboxes(from, d, boxes);
      count[hit ? hit.part : "torso"] += 1;
    }
    return count;
  };
  const from = { x: feet.x, y: feet.y + 1.5, z: feet.z - 45 };
  const stand = Sample("stand", from);
  const prone = Sample("prone", from);
  assert.ok(stand.torso > stand.head * 4, `站着以躯干为主 ${JSON.stringify(stand)}`);
  assert.ok(stand.head / 4000 > 0.01 && stand.head / 4000 < 0.20, `站着爆头是少数 ${stand.head / 4000}`);
  assert.ok(prone.head > stand.head, `趴着头露在最前面，爆头占比上升 ${prone.head} > ${stand.head}`);
  // 期望部位倍率（COMBAT.player：head 2.0 / torso 1.0 / limb 0.5）× 姿态命中率折让（prone 0.45）
  const Expect = (c) => (c.head * 2.0 + c.torso * 1.0 + (c.arm + c.leg) * 0.5) / 4000;
  assert.ok(Expect(prone) * 0.45 < Expect(stand) * 0.7,
    `趴着每发期望伤害 × 命中率仍低于站着 ${Expect(prone) * 0.45} < ${Expect(stand)}`);
}

// 高斯对：均值近零、方差近一、确定性。
{
  const rnd = Mulberry32(9);
  let sum = 0, sq = 0; const n = 20000;
  for (let i = 0; i < n; i += 1) { const [a, b] = GaussianPair(rnd); sum += a + b; sq += a * a + b * b; }
  assert.ok(Math.abs(sum / (2 * n)) < 0.03, "均值近零");
  assert.ok(Math.abs(sq / (2 * n) - 1) < 0.05, "方差近一");
  const a = GaussianPair(Mulberry32(5)), b = GaussianPair(Mulberry32(5));
  assert.deepEqual(a, b, "同种子同样本");
}

console.log("PlayerHitboxTest OK — 三姿态分段/正面部位次序/卧倒藏躯干/瞄点/散点分布/高斯对");

// The exposed head and shoulders move; the feet stay in cover. Both yaw and stance mirror.
for (const stance of ["stand", "crouch"]) for (const yaw of [0, Math.PI / 2]) for (const offset of [-.42, .42]) {
  const base = PlayerHitboxes(feet, yaw, stance);
  const leaned = PlayerHitboxes(feet, yaw, stance, [], offset);
  const h0 = base[0].center, h1 = leaned[0].center;
  assert.ok(Math.abs(h1.x-h0.x-Math.cos(yaw)*offset)<1e-9);
  assert.ok(Math.abs(h1.z-h0.z+Math.sin(yaw)*offset)<1e-9);
  assert.deepEqual(leaned.filter(b=>b.part==="leg"),base.filter(b=>b.part==="leg"));
  const torso=leaned.find(b=>b.part==="torso"),aim=PlayerAimPoint(feet,yaw,stance,{},offset);
  assert.ok(Math.hypot(aim.x-(torso.start.x+torso.end.x)/2,aim.z-(torso.start.z+torso.end.z)/2)<1e-9);
  const from={x:h1.x,y:h1.y+10,z:h1.z};
  assert.equal(RaycastPlayerHitboxes(from,{x:0,y:-1,z:0},leaned).part,"head");
}
assert.deepEqual(PlayerHitboxes(feet,0,"prone",[],.42),PlayerHitboxes(feet,0,"prone"));
console.log("PlayerHitboxTest OK — leaning head hittable / torso follows / feet planted / prone unchanged");
