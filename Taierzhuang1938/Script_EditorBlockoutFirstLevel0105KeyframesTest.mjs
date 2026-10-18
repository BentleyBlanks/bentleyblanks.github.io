// Script_EditorBlockoutFirstLevel0105KeyframesTest.mjs —— 01–05 白盒关键帧生成器的 node 回归（只给关键帧包自验用）
// 跑法：node Taierzhuang1938/Script_EditorBlockoutFirstLevel0105KeyframesTest.mjs
// 查：生成两次除 generatedAt 外逐字相同、过 ValidateBlockout 且无警告、摆位 / 走位问题为零（有场景文件时连实心块与高差一起查）、
// 拍号齐全、玩家点在场地内、next 不出现「掩护 / 清理 / 护送」、命名人物 id 稳定、与 Blockout/FirstLevel0105.json 一致（没手改时）。

import assert from "node:assert/strict";
import fs from "node:fs";
import { ValidateBlockout } from "./Script_EditorBlockoutConfig.mjs";
import { BuildFirstLevel0105Config, TrenchRoute, LoadSceneLayout } from "./Script_EditorBlockoutFirstLevel0105Keyframes.mjs";
import { SightBlock } from "./Script_EditorBlockoutFirstLevel0105Scene.mjs";
import { L0105_BOUNDS as B, L0105_PLACES as P } from "./Data_EditorBlockoutFirstLevel0105Space.mjs";

const issues = [];
const a = await BuildFirstLevel0105Config({ commit: "test", generatedAt: "A", issues });
const b = await BuildFirstLevel0105Config({ commit: "test", generatedAt: "B" });
const Strip = (doc) => JSON.stringify({ ...doc, source: { ...doc.source, generatedAt: "" } });
assert.equal(Strip(a), Strip(b), "生成两次（除 generatedAt）要逐字相同");

const check = ValidateBlockout(a);
assert.ok(check.ok, check.errors.join("; "));
assert.deepEqual(check.warnings, [], "不该有校验警告");
assert.deepEqual(issues, [], `摆位 / 走位问题：\n  ${issues.join("\n  ")}`);

const ids = a.keyframes.map((k) => k.id);
for (const id of ["01-1", "01-2", "01-3", "01-4", "02-1", "02-2", "02-3", "02-4", "02-5", "02-6", "02-7", "02E-1", "02E-2",
  "03-1", "03-2", "03-3", "03-4", "03-5", "04-1", "04-2", "04-3", "05-1", "05-2", "05-3", "05-4"]) assert.ok(ids.includes(id), `缺关键帧 ${id}`);
for (const kf of a.keyframes) {
  assert.ok(kf.player.x >= B.minX && kf.player.x <= B.maxX && kf.player.z >= B.minZ && kf.player.z <= B.maxZ, `${kf.id} 玩家出界`);
  assert.ok(!/掩护|清理|护送/.test(kf.next?.text || ""), `${kf.id} next 用了禁词：${kf.next?.text}`);
  if (kf.stageLabel) assert.equal(kf.stage, 2, "02末 的 stage 用 2");
}
const luo = a.keyframes.filter((k) => k.units.some((u) => u.id === "Luo")).length;
assert.ok(luo >= 23, `罗班长应当几乎每帧都在（现在 ${luo} 帧）`);
const blanket = a.keyframes.filter((k) => k.units.some((u) => u.id === "Blanket" && u.kind === "litter"));
assert.ok(blanket.length >= 7 && blanket.every((k) => k.units.some((u) => u.id === "Donggua" && u.state === "down")), "单被那几帧冬瓜都躺在上面");

// --- 10-18 返工 ---
const KF = (id) => a.keyframes.find((k) => k.id === id);
const Unit = (id, uid) => KF(id).units.find((u) => u.id === uid);
const DistXZ = (p, q) => Math.hypot(p.x - q.x, p.z - q.z);
const BranchCenterZ = (x) => 67.1 + (64.5 - 67.1) * (x - 21.9) / (63 - 21.9);
// 02 反冲两拨：压制组在支沟口台阶上，迂回组在支沟南沿土垄外侧（沟心往南 ≥ 4.5 m）
for (const id of ["01-4", "02-1"]) {
  for (const uid of ["HeYoutian", "Squad1"]) assert.ok(DistXZ(Unit(id, uid), P.steps) < 3, `${id} ${uid} 要在支沟口台阶上（压制组）`);
  for (const uid of ["Luo", "LiuWencai", "Squad2", "Squad3"]) {
    const u = Unit(id, uid);
    assert.ok(u && u.z - BranchCenterZ(u.x) >= 4.5 && u.stance === "prone", `${id} ${uid} 要趴在南沿土垄外侧（迂回组）`);
  }
}
for (const uid of ["Luo", "LiuWencai", "Squad2", "Squad3"]) assert.ok(Unit("02-1", uid).x > Unit("01-4", uid).x + 15, `02-1 ${uid} 要往东爬了三十多米里的大半`);
assert.ok(Math.abs(Unit("02-1", "Luo").x - P.interrogation.x) < 3, "02-1 班长趴在审问处正对面");
{
  // 02-1：沟底的人（顺子趴着、审问的鬼子站着）都看不见土垄背后的迂回组；北沿机枪趴着也看不见
  const scene = await LoadSceneLayout();
  const g = scene.terrainSampler;
  const pin = KF("02-1").player;
  for (const uid of ["Luo", "LiuWencai", "Squad2", "Squad3"]) {
    const u = Unit("02-1", uid);
    for (const [who, from] of [["顺子", { x: pin.x, z: pin.z, eye: 0.3 }], ["甲", { ...Unit("02-1", "IjaJia"), eye: 1.6 }], ["北沿机枪", { ...Unit("02-1", "IjaMgGunner"), eye: 0.35 }]]) {
      const r = SightBlock(g, from, { x: u.x, z: u.z, eye: 0.45 });
      assert.ok(r.block > 0.2, `02-1 ${who} 看得见土垄背后的 ${uid}（挡 ${r.block} m）`);
    }
  }
}
assert.ok(Unit("02-2", "LiuWencai").z - BranchCenterZ(Unit("02-2", "LiuWencai").x) > 3, "02-2 刘文财还在南沿上");
assert.ok(DistXZ(Unit("02-2", "HeYoutian"), KF("02-2").player) < 2, "02-2 何有田第一个到顺子身边扒土");
// 拖单被：两人并排在被子头上、面朝前；何有田是独立单位（castId heyoutian），单被 litter bearers 0
for (const id of ["02-3", "02-7"]) {
  const k = KF(id), bl = Unit(id, "Blanket"), he = Unit(id, "HeYoutian");
  assert.equal(bl.kind, "litter"); assert.equal(bl.bearers, 0, `${id} 单被 bearers 0`);
  assert.equal(he.castId, "heyoutian"); assert.ok(!he.kind || he.kind === "soldier", `${id} 何有田是独立单位`);
  const fx = -Math.sin(bl.yawDeg * Math.PI / 180), fz = -Math.cos(bl.yawDeg * Math.PI / 180);
  const ahead = (p) => (p.x - bl.x) * fx + (p.z - bl.z) * fz;
  assert.ok(ahead(he) > 1.2 && ahead(k.player) > 1.2, `${id} 两人都在被子前头（面朝前往前拖）`);
  assert.ok(DistXZ(he, k.player) < 1.6, `${id} 两人并排`);
  assert.ok(ahead(Unit(id, "Luo")) < -3, `${id} 班长在冬瓜后头断后`);
}
// 三处躲：被子拖到掩体后、玩家蹲在掩体旁边
for (const [id, near] of [["02-4", { x: 40.9, z: 67.2 }], ["02-6", null]]) {
  const k = KF(id);
  assert.equal(k.player.stance, "crouch", `${id} 玩家蹲在掩体后`);
  if (near) assert.ok(DistXZ(k.player, near) < 2.5, `${id} 玩家要在那垛弹药箱旁边`);
}
// 干沟：02末的人都在沟底；05-4 下到干沟
for (const id of ["02E-1", "02E-2"]) {
  for (const u of KF(id).units.filter((x) => !/^CrestNra|^Pursuer/.test(x.id))) {
    assert.ok(u.x >= 12 && u.x <= 62 && u.z >= 141 && u.z <= 156, `${id} ${u.id} 不在干沟里 (${u.x},${u.z})`);
  }
}
assert.ok(KF("05-4").player.z > 141, "05-4 下到干沟");
assert.ok(KF("03-1").player.z > 135 && KF("03-1").player.yawDeg > -45 && KF("03-1").player.yawDeg < 45, "03-1 从干沟口往北走");
// 05 板桥：05-2 战车压在桥上，人在桥下
const tank52 = Unit("05-2", "Tank");
assert.ok(DistXZ(tank52, P.crossing) < 0.5, "05-2 战车在板桥上");
assert.ok(DistXZ(KF("05-2").player, P.crossing) < 2 && KF("05-2").player.stance === "prone", "05-2 顺子趴在桥下");
assert.ok(KF("05-3").signals.includes("TankDisabled") && DistXZ(Unit("05-3", "Tank"), P.tankStop) < 0.5, "05-3 战车瘫在桥头");

// 壕沟网走位：洞口到坑必须经支沟口、沟口（不直线翻野地）
const route = TrenchRoute(P.dugoutMouth, P.pit);
assert.ok(route.some((p) => Math.hypot(p.x - P.branchMouth.x, p.z - P.branchMouth.z) < 0.5), "洞口→坑要经过支沟口");
assert.ok(route.some((p) => Math.hypot(p.x - P.mouth.x, p.z - P.mouth.z) < 0.5), "洞口→坑要经过沟口");

const file = new URL("./Blockout/FirstLevel0105.json", import.meta.url);
if (fs.existsSync(file)) {
  const onDisk = JSON.parse(fs.readFileSync(file, "utf8"));
  if (Strip({ ...onDisk, source: { ...onDisk.source, commit: "test" } }) !== Strip(a)) console.log("提示：Blockout/FirstLevel0105.json 与生成器输出不同（手改过，或没重新 export）");
}
console.log(`FirstLevel0105 关键帧：${a.keyframes.length} 帧、${a.keyframes.reduce((s, k) => s + k.units.length, 0)} 个单位位次，校验与摆位全过`);
