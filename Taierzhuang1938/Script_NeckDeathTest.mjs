// 敌军喉咙窒息哽咽的规则层：脖子几何、类型/阵营/距离/概率闸、抽签的确定性与分布（纯 Node，毫秒级）。
import assert from "node:assert/strict";
import fs from "node:fs";
import { NECK_DEATH } from "./Data_NeckDeath.mjs";
import { IsNeckHit, DecideNeckDeath, NeckDeathRoll } from "./Script_NeckDeath.mjs";

// --- 几何：上身胶囊 胸(0,1.2,0) → 颈(0,1.5,0)；头球心 (0,1.65,0) 半径 0.15 ------------------
const shapes = [
  { id: "upperTorso", type: "capsule", start: { x: 0, y: 1.2, z: 0 }, end: { x: 0, y: 1.5, z: 0 }, worldRadius: 0.135 },
  { id: "head", type: "sphere", center: { x: 0, y: 1.65, z: 0 }, worldRadius: 0.15 },
  { id: "lowerTorso", type: "capsule", start: { x: 0, y: 0.9, z: 0 }, end: { x: 0, y: 1.2, z: 0 }, worldRadius: 0.19 },
];
const P = (y) => ({ x: 0, y, z: 0.13 });
assert.equal(IsNeckHit(shapes, "upperTorso", P(1.47)), true, "颈根一带算脖子");
assert.equal(IsNeckHit(shapes, "upperTorso", P(1.30)), false, "胸口不算");
assert.equal(IsNeckHit(shapes, "upperTorso", P(1.2 + 0.3 * 0.72 - 0.002)), false, "阈值以下不算");
assert.equal(IsNeckHit(shapes, "upperTorso", P(1.2 + 0.3 * 0.72 + 0.002)), true, "阈值刚过算脖子");
assert.equal(IsNeckHit(shapes, "head", P(1.65 - 0.10)), true, "下巴/喉结那一圈算脖子");
assert.equal(IsNeckHit(shapes, "head", P(1.65)), false, "打脸不算");
assert.equal(IsNeckHit(shapes, "head", P(1.75)), false, "打脑门不算");
assert.equal(IsNeckHit(shapes, "lowerTorso", P(1.1)), false, "别的命中体不算");
assert.equal(IsNeckHit(shapes, null, P(1.47)), false, "没有命中体 id（不做几何的链）判不了 → 不算");
assert.equal(IsNeckHit(shapes, "upperTorso", null), false, "没有弹着点 → 不算");
assert.equal(IsNeckHit([shapes[1]], "upperTorso", P(1.47)), false, "命中体已被卸掉 → 不算");
assert.equal(IsNeckHit(null, "head", P(1.55)), false, "没有命中体表 → 不算");
// 椭球头（NRA 的帽檐头）按纵向半径判
assert.equal(IsNeckHit([{ id: "head", type: "ellipsoid", center: { x: 0, y: 1.65, z: 0 }, worldRadii: { x: 0.12, y: 0.15, z: 0.15 } }],
  "head", P(1.55)), true, "椭球头取 y 半径");

// --- 决策 -------------------------------------------------------------------------------
const base = { side: "ija", kind: "blade", neckHit: false, distanceM: 6, roll: 0.1 };
assert.deepEqual(DecideNeckDeath(base), { play: true, cause: "blade" }, "近处刀杀，抽中 → 放");
assert.equal(DecideNeckDeath({ ...base, roll: NECK_DEATH.chance.blade }).play, false, "抽签 ≥ 概率 → 不放（部分敌军）");
assert.equal(DecideNeckDeath({ ...base, roll: NECK_DEATH.chance.blade - 1e-9 }).play, true, "抽签 < 概率 → 放");
for (const kind of ["blade", "slash", "cut", "thrust", "stab"]) assert.equal(DecideNeckDeath({ ...base, kind }).play, true, `${kind} 算刀`);
for (const kind of ["butt", "melee", "explosion", "fire", null, undefined]) assert.equal(DecideNeckDeath({ ...base, kind }).play, false, `${kind} 不算刀`);
assert.equal(DecideNeckDeath({ ...base, side: "nra" }).play, false, "中方的兵不放");
assert.equal(DecideNeckDeath({ ...base, distanceM: NECK_DEATH.nearM + 0.1 }).play, false, "太远不放");
assert.equal(DecideNeckDeath({ ...base, distanceM: NECK_DEATH.nearM }).play, true, "恰好在近处线上算近");
assert.equal(DecideNeckDeath({ ...base, distanceM: NaN }).play, false, "距离未知不放");
const shot = { ...base, kind: "bullet", roll: 0.5 };
assert.equal(DecideNeckDeath({ ...shot, neckHit: false }).play, false, "子弹没打在脖子上 → 不放");
assert.deepEqual(DecideNeckDeath({ ...shot, neckHit: true }), { play: true, cause: "neckShot" }, "脖子中弹 → 放");
assert.equal(DecideNeckDeath({ ...shot, kind: "hmg", neckHit: true }).play, true, "机枪打脖子同样算");
assert.equal(DecideNeckDeath({ ...shot, roll: 0.7, neckHit: true }).play, false, "脖子中弹也只放部分");
assert.ok(NECK_DEATH.chance.neckShot > NECK_DEATH.chance.blade, "明确打在喉咙上的概率不低于一般刀伤");

// --- 抽签：确定、落在 [0,1)、大致均匀 -----------------------------------------------------
assert.equal(NeckDeathRoll(7, 3), NeckDeathRoll(7, 3), "同输入同抽签");
assert.notEqual(NeckDeathRoll(7, 3), NeckDeathRoll(7, 4), "受击序号变则抽签变");
assert.notEqual(NeckDeathRoll(7, 3), NeckDeathRoll(8, 3), "士兵 id 变则抽签变");
let below = 0, N = 20000;
for (let i = 0; i < N; i += 1) {
  const r = NeckDeathRoll(i % 97, (i / 97) | 0);
  assert.ok(r >= 0 && r < 1, `抽签越界 ${r}`);
  if (r < 0.45) below += 1;
}
assert.ok(Math.abs(below / N - 0.45) < 0.02, `抽签分布偏了：P(<0.45)=${(below / N).toFixed(3)}`);

// --- 接线：清单里有这条 cue、成品文件在、两个变体 ------------------------------------------
const manifest = JSON.parse(fs.readFileSync(new URL("./Audio/Sfx/Data_SfxManifest.json", import.meta.url), "utf8"));
const cue = manifest.cues.neckDeath;
assert.ok(cue && cue.files.length === 2, "清单里 neckDeath 有两个变体");
for (const file of cue.files) assert.ok(fs.existsSync(new URL(`./Audio/Sfx/${file}`, import.meta.url)), `${file} 在盘上`);
const ai = fs.readFileSync(new URL("./Script_Ai.mjs", import.meta.url), "utf8");
assert.ok(/this\.Kill\(direction, sever, this\.NeckDeathCause\(kind, info\)\)/.test(ai), "TakeHit 致死时把喉音判定交给 Kill");
assert.ok(/A2\.Play\("neckDeath"/.test(ai), "Kill 里播 neckDeath");

console.log("NeckDeathTest OK — neck geometry, kind/side/range/chance gates, deterministic roll, manifest wiring");
