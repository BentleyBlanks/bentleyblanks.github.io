// Script_EditorBlockoutFirstLevel0105KeyframesTest.mjs —— 01–05 白盒关键帧生成器的 node 回归（只给关键帧包自验用）
// 跑法：node Taierzhuang1938/Script_EditorBlockoutFirstLevel0105KeyframesTest.mjs
// 查：生成两次除 generatedAt 外逐字相同、过 ValidateBlockout 且无警告、摆位 / 走位问题为零（有场景文件时连实心块与高差一起查）、
// 拍号齐全、玩家点在场地内、next 不出现「掩护 / 清理 / 护送」、命名人物 id 稳定、与 Blockout/FirstLevel0105.json 一致（没手改时）。

import assert from "node:assert/strict";
import fs from "node:fs";
import { ValidateBlockout } from "./Script_EditorBlockoutConfig.mjs";
import { BuildFirstLevel0105Config, TrenchRoute, LoadSceneLayout } from "./Script_EditorBlockoutFirstLevel0105Keyframes.mjs";
import { SightBlock } from "./Script_EditorBlockoutFirstLevel0105Scene.mjs";
import { L0105_BOUNDS as B, L0105_PLACES as P, L0105_GULLY_POCKETS, InGullyFloor, GullyU } from "./Data_EditorBlockoutFirstLevel0105Space.mjs";

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
// 干沟：02末的人都在沟底（担架可以在凹路口）；10-20 人分三小堆（坑窝 A / 中弯 + 支沟 / 坑窝 B），伤员大多在支沟里
for (const id of ["02E-1", "02E-2"]) {
  const units = KF(id).units.filter((x) => !/^CrestNra|^Pursuer/.test(x.id));
  for (const u of units) {
    const inLane = Math.hypot(u.x - P.laneHead.x, u.z - P.laneHead.z) < 4;
    assert.ok(InGullyFloor(u, 0.5) || inLane, `${id} ${u.id} 不在干沟沟底 (${u.x},${u.z})`);
  }
  const Near = (p, r) => (u) => Math.hypot(u.x - p.x, u.z - p.z) <= r;
  const near = (test) => units.filter(test).length;
  const pa = near(Near(L0105_GULLY_POCKETS.a, 6)), pb = near(Near(L0105_GULLY_POCKETS.b, 6));
  const pm = near((u) => Near(L0105_GULLY_POCKETS.mid, 6)(u) || Near(P.woundedBay, 5)(u));
  assert.ok(pa >= 2 && pb >= 2 && pm >= 4, `${id} 人要分三小堆：坑窝 A ${pa}、中弯/支沟 ${pm}、坑窝 B ${pb}`);
  assert.ok(pa + pm + pb >= units.length - 2, `${id} 还有人不在这三堆里（${units.length - pa - pm - pb}）`);
  const bayWounded = units.filter((u) => /^Wounded/.test(u.id) && GullyU(u.x, u.z) <= 0 && Math.hypot(u.x - P.woundedBay.x, u.z - P.woundedBay.z) < 4.5).length;
  assert.ok(bayWounded >= 4, `${id} 伤员要放在支沟里（现在 ${bayWounded} 个）`);
}
assert.ok(KF("05-4").player.z > 141, "05-4 下到干沟");
assert.ok(KF("03-1").player.z > 135 && KF("03-1").player.yawDeg > -45 && KF("03-1").player.yawDeg < 45, "03-1 从干沟口往北走");
// 05 板桥：05-2 A 车压在桥上，人在桥下
const tank52 = Unit("05-2", "TankA");
assert.ok(DistXZ(tank52, P.crossing) < 0.5, "05-2 A 车在板桥上");
assert.ok(DistXZ(KF("05-2").player, P.crossing) < 2 && KF("05-2").player.stance === "prone", "05-2 顺子趴在桥下");
assert.ok(KF("05-3").signals.includes("TankDisabled") && DistXZ(Unit("05-3", "TankA"), P.tankStop) < 0.5, "05-3 A 车瘫在桥头");

// --- 2026-10-24 第六版：三辆九四式轻装甲车、掷弹筒在旧沟里、旧阵地的尸体 ---
{
  const { L0105_TANKETTES: TK, L0105_OLD_POSITION: OLD, L0105_TRENCHES: TR } = await import("./Data_EditorBlockoutFirstLevel0105Space.mjs");
  const DistLine = (p, line) => { let best = Infinity; for (let i = 1; i < line.length; i++) { const a0 = line[i - 1], a1 = line[i], dx = a1.x - a0.x, dz = a1.z - a0.z, l2 = dx * dx + dz * dz; const k = Math.max(0, Math.min(1, ((p.x - a0.x) * dx + (p.z - a0.z) * dz) / l2)); best = Math.min(best, Math.hypot(p.x - a0.x - dx * k, p.z - a0.z - dz * k)); } return best; };
  // 03-4：三辆在东边麦田冒出来（x 240–310、z −200…−100），都是 tankette，名字 / 文字里没有「炮」；没有叫 Tank 的旧单位
  for (const id of ["03-4", "03-5"]) {
    for (const uid of TK.ids) {
      const u = Unit(id, uid);
      assert.ok(u && u.kind === "tank" && u.shape === "tankette", `${id} ${uid} 要是 tank + shape tankette`);
      assert.ok(u.x >= 240 && u.x <= 310 && u.z >= -200 && u.z <= -100, `${id} ${uid} 要在东边麦田里 (${u.x},${u.z})`);
      assert.ok(!/炮/.test(u.name), `${id} ${uid} 的名字带「炮」`);
    }
    assert.ok(!KF(id).units.some((u) => u.id === "Tank"), `${id} 还有旧的 Tank 单位`);
    assert.ok(!/一炮|炮口|战车/.test(KF(id).what + KF(id).how.join("")), `${id} 的文字里还有战车 / 炮`);
  }
  assert.ok(KF("03-4").signals.includes("PitShelled") && /掷弹筒/.test(KF("03-4").how.join("")), "03-4 胸墙是掷弹筒弹打塌的");
  // 05：A 过桥瘫在桥头、B 停在交通沟东沿（全程不过沟）、C 在田里抛锚（05-1 起不动）、两个乘员在车边；徒步步兵两三百米后头
  const trafficXAt = (z) => { for (let i = 1; i < TR.traffic.length; i++) { const a = TR.traffic[i - 1], b = TR.traffic[i]; if ((z - a.z) * (z - b.z) <= 0 && b.z !== a.z) return a.x + (b.x - a.x) * (z - a.z) / (b.z - a.z); } return TR.traffic[TR.traffic.length - 1].x; };
  for (const kf of a.keyframes) {
    const b = kf.units.find((u) => u.id === "TankB"), c = kf.units.find((u) => u.id === "TankC");
    if (b) assert.ok(b.x - trafficXAt(b.z) >= 4 || b.z < 0, `${kf.id} B 车过了交通沟 (${b.x},${b.z})`);
    if (c) assert.ok(c.x - trafficXAt(Math.max(0, c.z)) >= 4 || c.z < 0, `${kf.id} C 车过了交通沟 (${c.x},${c.z})`);
    for (const u of kf.units) if (u.kind === "tank") assert.equal(u.shape, "tankette", `${kf.id} ${u.id} 不是轻装甲车`);
  }
  for (const id of ["05-2", "05-3", "05-4"]) assert.ok(DistXZ(Unit(id, "TankB"), TK.bStop) < 0.5, `${id} B 车停在沟沿 (${TK.bStop.x},${TK.bStop.z})`);
  for (const id of ["05-1", "05-2", "05-3", "05-4"]) {
    assert.ok(DistXZ(Unit(id, "TankC"), TK.cStall) < 0.5, `${id} C 车抛锚在 (${TK.cStall.x},${TK.cStall.z})`);
    for (const uid of ["TankCrewC1", "TankCrewC2"]) {
      const u = Unit(id, uid);
      assert.ok(u && DistXZ(u, TK.cStall) < 6 && u.state !== "down", `${id} ${uid} 要在 C 车边上`);
      if (id !== "05-1") assert.equal(u.stance, "prone", `${id} ${uid} 要趴着打`);
    }
    for (const uid of ["TankInf1", "TankInf2", "TankInf3"]) assert.ok(DistXZ(Unit(id, uid), P.crossing) > 180, `${id} ${uid} 徒步步兵要在两三百米后头`);
  }
  assert.ok(DistXZ(Unit("05-4", "TankA"), P.tankStop) < 0.5, "05-4 A 车还瘫在桥头");
  assert.ok(Unit("04-3", "TankA").path?.some((p) => DistXZ(p, { x: 175, z: -40 }) < 2), "04-3 A 车从驿道 / 车道岔口拐上车道");
  // 03：掷弹筒组蹲在旧交通沟里（坎下那一截）；旧阵地沟边有没收的尸体
  for (const id of ["03-2", "03-3", "03-4", "03-5"]) {
    const m = Unit(id, "IjaMortar1");
    assert.ok(DistLine(m, OLD.sap) <= 2.5, `${id} 掷弹筒要蹲在旧交通沟里（离沟心 ${DistLine(m, OLD.sap).toFixed(1)} m）`);
    const dead = KF(id).units.filter((u) => /^OldDead/.test(u.id));
    assert.ok(dead.length >= 3 && dead.every((u) => u.state === "down" && u.side === "nra"), `${id} 旧阵地沟边要有没收的尸体`);
  }
}

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
