// Script_EditorBlockoutFirstLevel1218KeyframesTest.mjs —— 12–18 白盒关键帧生成器的 node 回归（只给关键帧包自验用）
// 跑法：node Taierzhuang1938/Script_EditorBlockoutFirstLevel1218KeyframesTest.mjs
// 查：生成两次除 generatedAt 外逐字相同、过 ValidateBlockout 且无警告、摆位 / 走位问题为零（读 Blockout/FirstLevel1218.scene.json 连实心块、高差、河水一起查）、
// 19 帧齐全、信号按表起、所有人脚下在地面上（高度场或 ≤1 m 的块顶，浮桥桥面算块顶）、身子不进实心块（按那一帧的信号算随信号体块）、没人站在水里（桥面除外）、
// 冬瓜从 12-1 到 17-3 每一帧都在（down、顺着担架躺），17 起盖着脸不动，担架一直跟着他；后送队 / 长队 / 院里伤员够多；几条关键视线；走位走门、走沟口、走大路。

import assert from "node:assert/strict";
import fs from "node:fs";
import { ValidateBlockout, NormalizeBlockout } from "./Script_EditorBlockoutConfig.mjs";
import { FIRST_LEVEL_SPEAKING_CAST } from "./Data_FirstLevelSpeakingCast.mjs";
import { BuildFirstLevel1218Config, StreetRoute, LoadSceneLayout, StandSampler, FirstLevel1218Issues, DitchPoint } from "./Script_EditorBlockoutFirstLevel1218Keyframes.mjs";
import { BlockSight, SolidBlocks, BlockCenterY, SightBlock } from "./Script_EditorBlockoutFirstLevel1218Scene.mjs";
import {
  L1218_BOUNDS as B, L1218_PLACES as P, L1218_SIGNALS as SIG, L1218_YARD as Y, L1218_BRIDGE as BR, L1218_BRIDGEHEAD as BH, L1218_DITCH as DT, L1218_LEVEES as LV,
  L1218_RIVER as RV, L1218_BANK as BK, L1218_ROAD as RD,
} from "./Data_EditorBlockoutFirstLevel1218Space.mjs";

const issues = [];
const a = await BuildFirstLevel1218Config({ commit: "test", generatedAt: "A", issues });
const b = await BuildFirstLevel1218Config({ commit: "test", generatedAt: "B" });
const Strip = (doc) => JSON.stringify({ ...doc, source: { ...doc.source, generatedAt: "" } });
assert.equal(Strip(a), Strip(b), "生成两次（除 generatedAt）要逐字相同");

const check = ValidateBlockout(a);
assert.ok(check.ok, check.errors.join("; "));
assert.deepEqual(check.warnings, [], "不该有校验警告");
assert.deepEqual(issues, [], `摆位 / 走位问题：\n  ${issues.join("\n  ")}`);

const IDS = ["12-1", "12-2", "12-3", "13-1", "13-2", "14-1", "14-2", "15-1", "15-2", "15-3", "16-1", "17-1", "17-2", "17-3", "18-1", "18-2", "18-3", "18-4", "18-5"];
assert.deepEqual(a.keyframes.map((k) => k.id), IDS, "19 个关键帧按顺序齐全");
const TITLES = { 12: "车边", 13: "空袭", 14: "松手", 15: "沟里", 16: "过门槛", 17: "门槛上", 18: "守桥头" };
const TITLE_BY_ID = { "15-3": "桥头", "18-5": "北门" };
const LABELS = { "15-1": "15A", "15-2": "15B", "15-3": "15C" };
for (const kf of a.keyframes) {
  assert.equal(kf.stage, Number(kf.id.split("-")[0]), `${kf.id} 的 stage`);
  assert.equal(kf.stageTitle, TITLE_BY_ID[kf.id] || TITLES[kf.stage], `${kf.id} 的 stageTitle`);
  assert.equal(kf.stageLabel, LABELS[kf.id], `${kf.id} 的 stageLabel`);
  assert.ok(kf.player.x >= B.minX && kf.player.x <= B.maxX && kf.player.z >= B.minZ && kf.player.z <= B.maxZ, `${kf.id} 玩家出界`);
  assert.ok(!/掩护|清理|护送/.test(kf.next?.text || ""), `${kf.id} next 用了禁词：${kf.next?.text}`);
  assert.ok(kf.what.length <= 80, `${kf.id} what 太长`);
  assert.ok(kf.how.length >= 3 && kf.notes.length > 0, `${kf.id} how / notes 要写`);
  for (const u of kf.units) if (u.castId) assert.ok(Object.hasOwn(FIRST_LEVEL_SPEAKING_CAST, u.castId), `${kf.id} ${u.id} 的 castId ${u.castId} 不在定妆表里`);
}
// 单位 id 在关卡内稳定：同一个 id 不换阵营 / 种类
const identity = new Map();
for (const kf of a.keyframes) for (const u of kf.units) {
  const key = `${u.side}/${u.kind || "soldier"}`;
  if (identity.has(u.id)) assert.equal(identity.get(u.id), key, `${u.id} 在 ${kf.id} 换了阵营或种类`);
  else identity.set(u.id, key);
}
const KF = (id) => a.keyframes.find((k) => k.id === id);
const Unit = (id, uid) => KF(id).units.find((u) => u.id === uid);
const DistXZ = (p, q) => Math.hypot(p.x - q.x, p.z - q.z);
for (const id of IDS) { assert.ok(Unit(id, "Geng")?.kind === "civilian", `${id} 老耿要在`); assert.ok(Unit(id, "Nier")?.kind === "child", `${id} 妮儿要在`); }
for (const id of IDS) assert.equal(!!Unit(id, "GengCart"), IDS.indexOf(id) <= IDS.indexOf("13-1"), `${id} 立着的驴车只到 13-1（翻车后是随信号体块）`);
for (const id of IDS.slice(0, 7)) assert.ok(Unit(id, "Heizi")?.kind === "animal", `${id} 黑子要在`);
// --- 车上的东西（2026-10-20 ride）：12-1…13-1 冬瓜那副担架 + 冬瓜 + 另两副担架和上面的伤员都挂在 GengCart 上（担架 bearers 0、横搁、布 y 1.075 / 人 1.125），
//     12-1 / 12-2 妮儿坐车尾沿（z +1.2、y 0.467、背对车头），12-3 起她在驴头前（不挂）；13-2 起车翻了，谁都不挂
const RideOn = (id, uid) => Unit(id, uid)?.ride;
for (const id of IDS.slice(0, IDS.indexOf("13-1") + 1)) {
  for (const uid of ["LitterDonggua", "CartLitter1", "CartLitter2"]) {
    const r = RideOn(id, uid), u = Unit(id, uid);
    assert.ok(r && r.on === "GengCart" && r.y === 1.075 && Math.abs(r.yawDeg) === 90 && u.bearers === 0, `${id} ${uid} 要横搁在车板上（ride GengCart、y 1.075、bearers 0）：${JSON.stringify(r)}`);
  }
  for (const uid of ["Donggua", "CartWounded1", "CartWounded2"]) {
    const r = RideOn(id, uid), u = Unit(id, uid);
    assert.ok(r && r.on === "GengCart" && r.y === 1.125 && u.state === "down" && u.lie === "along", `${id} ${uid} 要躺在车上的担架上（ride GengCart、y 1.125、down、顺着躺）：${JSON.stringify(r)}`);
  }
  assert.equal(RideOn(id, "LitterDonggua").z, 0.75, `${id} 冬瓜那副靠车尾（本地 z 0.75）`);
  assert.ok(new Set(["LitterDonggua", "CartLitter1", "CartLitter2"].map((uid) => RideOn(id, uid).z)).size === 3, `${id} 三副担架各占一格`);
  assert.deepEqual(RideOn(id, "Donggua"), { ...RideOn(id, "LitterDonggua"), y: 1.125 }, `${id} 冬瓜躺在自己那副担架上（同一格）`);
}
for (const id of ["12-1", "12-2"]) assert.deepEqual(RideOn(id, "Nier"), { on: "GengCart", x: 0, z: 1.2, y: 0.467, yawDeg: 180 }, `${id} 妮儿坐车尾沿（ride）`);
assert.ok(!RideOn("12-3", "Nier") && !RideOn("13-1", "Nier"), "12-3 起妮儿下了车（牵驴 / 站在路当中）");
for (const id of IDS.slice(IDS.indexOf("13-2"))) for (const u of KF(id).units) assert.ok(!u.ride, `${id} ${u.id} 车翻了以后谁都不挂在车上`);
for (const id of IDS.slice(IDS.indexOf("13-2"))) assert.ok(!Unit(id, "CartLitter1") && !Unit(id, "CartWounded1"), `${id} 车上那两副担架翻车后不再摆（13-2 预演里被滚上别的担架抬走）`);
// --- 军医跪在麦秸上一个伤员身边（CareMedicPress 的站位）；17-1 跪在冬瓜右边（担架西边）---
for (const id of ["15-3", "16-1", "17-2", "17-3", "18-1"]) assert.ok(DistXZ(Unit(id, "Doctor"), Unit(id, "YardWounded09")) < 0.6, `${id} 军医在 YardWounded09 身边`);
assert.ok(DistXZ(Unit("17-1", "Doctor"), Unit("17-1", "Donggua")) < 0.6 && Unit("17-1", "Doctor").x < Unit("17-1", "Donggua").x && Unit("17-1", "Doctor").stance === "crouch", "17-1 军医跪在冬瓜西边");
for (const id of ["13-2", "14-1", "14-2"]) assert.equal(Unit(id, "Heizi").state, "down", `${id} 黑子倒了`);

// --- 信号按表起 ---
const From = (sig, firstId) => IDS.forEach((id, i) => assert.equal(KF(id).signals.includes(sig), i >= IDS.indexOf(firstId), `${id} 的 ${sig}`));
From(SIG.cartOverturned, "13-2"); From(SIG.chargesSet, "18-1"); From(SIG.bridgeBlown, "18-4");

// --- 冬瓜：12-1…17-3 每一帧都在、倒地、顺着担架躺；担架一直跟着他（摔出去的两帧在他旁边）；17 起盖着脸不动 ---
const DONGGUA_IDS = IDS.slice(0, IDS.indexOf("17-3") + 1);
for (const id of DONGGUA_IDS) {
  const l = Unit(id, "LitterDonggua"), d = Unit(id, "Donggua");
  assert.ok(l && l.kind === "litter" && d && d.state === "down" && d.lie === "along" && d.castId === "comrade", `${id} 冬瓜要倒着、顺着躺、在自己的担架边`);
  assert.equal(l.bearers, 0, `${id} 冬瓜担架 bearers 0（前后由玩家 / 老耿 / 刘文财抬，或搁在地上）`);
  if (id === "13-2" || id === "14-2") assert.ok(DistXZ(l, d) > 1.0 && DistXZ(l, d) <= 2.5, `${id} 冬瓜摔在担架旁边（${DistXZ(l, d).toFixed(2)} m）`);
  else { assert.ok(DistXZ(l, d) < 0.05, `${id} 冬瓜要躺在自己的担架上`); assert.equal(d.yawDeg, l.yawDeg, `${id} 冬瓜头朝担架前头`); }
}
for (const id of IDS.slice(IDS.indexOf("18-1"))) assert.ok(!Unit(id, "Donggua"), `${id} 冬瓜留在厢房里，不再摆`);
for (const id of ["17-2", "17-3"]) assert.deepEqual([Unit(id, "Donggua").x, Unit(id, "Donggua").z], [Unit("17-1", "Donggua").x, Unit("17-1", "Donggua").z], `${id} 冬瓜盖着脸就不动了`);
assert.ok(DistXZ(Unit("17-1", "LitterDonggua"), Y.dongguaInside) < 0.05, "17-1 担架放在厢房里");
assert.ok(DistXZ(Unit("14-2", "Donggua"), P.dropAt) < 5 && Math.abs(Unit("14-2", "Donggua").z - RD.line[0].z) <= 1.5 && Unit("14-2", "Donggua").yawDeg === 90, "14-2 冬瓜滑到路当中、头朝西");
assert.ok(DistXZ(Unit("15-1", "LitterDonggua"), P.ditchHalt) < 1 && Unit("15-1", "Geng") && DistXZ(Unit("15-1", "Geng"), Unit("15-1", "LitterDonggua")) < 2.5, "15-1 担架在沟底歇脚处、老耿在担架边");

// --- 人够多：后送队、长队、院门口的担架、院里的伤员 ---
for (const id of IDS.slice(0, 7)) {
  const litters = KF(id).units.filter((u) => /^Litter\d/.test(u.id)), walkers = KF(id).units.filter((u) => /^Walker\d/.test(u.id));
  assert.ok(litters.length >= 6 && litters.length <= 8 && walkers.length >= 6 && walkers.length <= 10, `${id} 跟在车后头的担架 ${litters.length} / 伤兵 ${walkers.length}`);
}
for (const id of IDS.slice(IDS.indexOf("12-3"), IDS.indexOf("17-3") + 1)) {
  const q = KF(id).units.filter((u) => u.group === "queue");
  assert.ok(q.length >= 25 && q.length <= 35, `${id} 过桥的长队 ${q.length} 个（要 25–35）`);
  assert.ok(q.every((u) => u.x <= -20 && u.x >= -146 && Math.abs(u.z - RD.line[0].z) <= 3.6), `${id} 长队都在大路西段上`);
  assert.ok(q.filter((u) => u.kind === "cart").length >= 1 && q.filter((u) => u.kind === "litter").length >= 6, `${id} 长队里有牛车和担架`);
}
for (const id of ["13-1", "14-2"]) {
  const people = KF(id).units.filter((u) => (u.group === "queue" || u.group === "convoy") && !["litter", "cart"].includes(u.kind || "soldier"));
  assert.ok(people.every((u) => u.stance === "prone" && Math.abs(Math.abs(u.z - RD.line[0].z) - RD.gutterOffset) < 0.2), `${id} 路上的人都趴进路边浅沟`);
}
assert.ok(KF("13-1").units.filter((u) => u.kind === "litter" && u.bearers === 0).length >= 6, "13-1 担架来不及抬下路，搁在路上");
for (const id of ["15-3", "16-1", "17-1", "17-2", "17-3"]) {
  assert.ok(KF(id).units.filter((u) => /^GLitter/.test(u.id)).length === 5, `${id} 院门口墙根排着 5 副别人的担架`);
  assert.ok(KF(id).units.filter((u) => /^YardWounded/.test(u.id) && u.state === "down").length >= 8, `${id} 院里麦秸上躺着 8–10 个伤员`);
  assert.ok(Unit(id, "Doctor") && Unit(id, "Doctor").weapon === null && Unit(id, "GateGuard"), `${id} 军医（空手）与守门的兵`);
}
assert.ok(DistXZ(Unit("15-3", "LitterDonggua"), { x: Y.queueAlongX, z: 625 }) < 2 && Unit("15-3", "LitterDonggua").x > Y.box.maxX, "15-3 冬瓜的担架排在东墙外的队里");
assert.ok(KF("15-3").player.stance === "crouch" && DistXZ(KF("15-3").player, Unit("15-3", "LitterDonggua")) < 2.5, "15-3 顺子在担架头上蹲下");
assert.ok(Unit("16-1", "Doctor") && DistXZ(Unit("16-1", "Doctor"), KF("16-1").player) < 8 && Unit("16-1", "LiuWencai").z < KF("16-1").player.z, "16-1 军医在院里指厢房，刘文财抬后头");
assert.ok(KF("17-2").player.stance === "crouch" && DistXZ(KF("17-2").player, Y.thresholdSeat) < 0.05 && Math.abs(KF("17-2").player.yawDeg) < 1, "17-2 顺子坐门槛朝北");

// --- 17-3 班长从院门进来；18 桥头 ---
const luo173 = Unit("17-3", "Luo");
assert.ok(luo173.path && luo173.path.some((p) => Math.abs(p.z - Y.gate.z) < 0.1 && Math.abs(p.x - Y.box.maxX) < 1.5) && DistXZ(luo173, KF("17-3").player) < 2, "17-3 班长从院门进来走到顺子跟前");
for (const uid of ["Yaowa", "HeYoutian", "Squad1", "Squad2"]) assert.ok(Unit("17-3", uid)?.path?.length >= 2, `17-3 ${uid} 跟着进来`);
const officer = Unit("18-1", "BridgeOfficer");
assert.ok(officer.kind === "officer" && officer.castId === "frontOfficer" && DistXZ(officer, BH.officerPost) < 0.05, "18-1 桥头军官");
for (const uid of ["Sapper1", "Sapper2"]) assert.ok(Math.abs(Unit("18-1", uid).x - BR.x) <= BR.deckW / 2 && Unit("18-1", uid).z >= BR.northFootZ && Unit("18-1", uid).z <= BR.northFootZ + 10, `18-1 ${uid} 在第一条船那段桥面上`);
for (const uid of ["Luo", "Yaowa", "HeYoutian", "LiuWencai", "Squad1", "Squad2"]) {
  assert.ok(Unit("18-1", uid).intent?.length >= 1 && DistXZ(Unit("18-1", uid).intent.at(-1), { x: BH.trench.x, z: Unit("18-2", uid).z }) < 0.1, `18-1 ${uid} 的 intent 指向自己的坑位`);
  assert.ok(Math.abs(Unit("18-2", uid).x - BH.trench.x) < 0.1 && Math.abs(Unit("18-2", uid).yawDeg + 90) < 20, `18-2 ${uid} 在散兵坑里朝东`);
}
assert.ok(KF("18-1").pois.some((p) => p.id === "RailBlast" && p.kind === "danger"), "18-1 远处铁路桥炸用 POI");
const mg = Unit("18-2", "IjaMg");
assert.ok(mg.weapon === "Type11" && mg.role === "machineGun" && mg.stance === "prone" && mg.arc && DistXZ(mg, P.ijaMg) < 0.05 && Unit("18-2", "IjaMgLoader"), "18-2 鬼子机枪组");
assert.ok(KF("18-2").units.filter((u) => u.side === "ija" && u.role === "rifleman").length >= 8 && Unit("18-2", "Mortar1") && DistXZ(Unit("18-2", "Mortar1"), P.ijaMortar) < 0.05, "18-2 步兵 8–10 + 掷弹筒");
assert.ok(KF("18-2").units.filter((u) => u.side === "ija" && u.role === "rifleman").every((u) => u.x >= -30 && u.x <= 20 && u.intent?.length && u.intent[0].x < u.x), "18-2 鬼子散在大路两边麦地、跃进向西");
const last = ["LastGroup1", "LastGroup2", "LastGroup3"].map((id) => Unit("18-2", id));
assert.ok(last.every((u) => u && u.stance === "crouch" && u.x < BK.box.minX && DistXZ(u, P.lastGroupCover) < 2.5) && Unit("18-2", "LastWounded").state === "down", "18-2 最后一拨人缩在土坎西边");
assert.ok(Math.abs(Unit("18-2", "Geng").x - BR.x) <= BR.deckW / 2 && Unit("18-2", "Geng").z > BR.northFootZ && Unit("18-2", "Nier").z > BR.northFootZ, "18-2 老耿牵着妮儿在桥面上");
assert.ok(KF("18-2").units.filter((u) => u.group === "stragglers").length >= 4, "18-2 大路上撤下来的人 4–6 个");
assert.ok(KF("18-3").player.z > BR.northFootZ && KF("18-3").player.z < BR.southFootZ && Math.abs(KF("18-3").player.x - BR.x) <= BR.deckW / 2, "18-3 玩家在桥面上");
const onDeck3 = ["Luo", "Yaowa", "HeYoutian", "LiuWencai", "Squad1", "Squad2"].map((id) => Unit("18-3", id));
assert.ok(onDeck3.every((u) => Math.abs(u.x - BR.x) <= BR.deckW / 2 && u.z > BR.northFootZ && u.z < BR.southFootZ), "18-3 全班在桥面上");
assert.ok(onDeck3.every((u) => u.id === "Luo" || u.z > Unit("18-3", "Luo").z) && Math.abs(Unit("18-3", "Luo").yawDeg) < 1, "18-3 班长在最北、倒退着");
assert.ok(Unit("18-3", "Sapper1").stance === "crouch" && Unit("18-3", "Sapper1").z > BR.southFootZ - 2 && Unit("18-3", "BridgeOfficer").z > BR.southFootZ, "18-3 工兵在南头蹲着，军官在南头");
assert.ok(KF("18-3").units.filter((u) => u.side === "ija" && u.role === "rifleman").every((u) => u.x >= -136 && u.x <= -108 && u.path?.some((p) => Math.abs(p.z - RD.line[0].z) <= 1.1)), "18-3 鬼子顺着大路追到桥头空场东边");
assert.ok(KF("18-4").units.filter((u) => u.group === "levee" && u.kind !== "tank").length >= 14 && KF("18-4").units.filter((u) => u.group === "levee" && u.kind !== "tank").every((u) => Math.abs(u.z - LV.north.z) <= 1.5), "18-4 北岸堤上一排鬼子 14–18");
assert.ok(Unit("18-4", "IjaTank")?.kind === "tank", "18-4 后头路上一辆战车");
assert.ok(["Luo", "Yaowa", "HeYoutian", "LiuWencai", "Squad1", "Squad2"].every((id) => Unit("18-4", id).z >= LV.south.z + 2), "18-4 全班在南堤后");
assert.ok(KF("18-4").pois.some((p) => p.id === "YardLamp") && KF("18-4").pois.some((p) => p.id === "Wreck"), "18-4 POI：院里马灯、断桥往下游漂");
// 炸桥前接收院撤空（10-19）：18-2 院里的担架抬出来上桥、军医跟着最后一副；18-3 起院里只剩盖着脸的，军医在南岸
const evac = KF("18-2").units.filter((u) => u.group === "yardEvac");
assert.ok(evac.length >= 3 && evac.every((u) => u.kind === "litter" && u.intent?.at(-1)?.z > BR.southFootZ), "18-2 院里的担架抬出来，往南岸去");
assert.ok(Unit("18-2", "Doctor")?.intent?.at(-1)?.z > BR.southFootZ && !KF("18-2").units.some((u) => /^(YardWounded|GLitter)/.test(u.id)), "18-2 军医跟着最后一副出院门；院里、门口不再有等着的伤员");
for (const id of ["18-2", "18-3", "18-4"]) {
  const dead = KF(id).units.filter((u) => /^YardDead/.test(u.id));
  assert.ok(dead.length >= 2 && dead.every((u) => u.state === "down" && u.x >= Y.box.minX && u.x <= Y.box.maxX && u.z >= Y.box.minZ && u.z <= Y.box.maxZ), `${id} 院里只留盖着脸的几个`);
}
for (const id of ["18-3", "18-4"]) assert.ok(Unit(id, "Doctor").z > BR.southFootZ && !KF(id).units.some((u) => /^YardWounded/.test(u.id)), `${id} 军医已经过了河，院里没有活着的伤员`);
const luo185 = Unit("18-5", "Luo");
assert.ok(KF("18-5").units.filter((u) => u.side === "nra" && u.kind !== "litter").every((u) => u.id === "Guide" || u.id === "WaterMan" || u.z <= luo185.z) && DistXZ(Unit("18-5", "Yaowa"), Unit("18-5", "Geng")) < 2.6, "18-5 班长在前，幺娃走在老耿旁边");
assert.ok(Unit("18-5", "Guide") && Math.abs(Unit("18-5", "Guide").x - P.northGate.x) < 2 && Unit("18-5", "WaterMan") && Unit("18-5", "SandCart1") && Unit("18-5", "SandCart2"), "18-5 北门口：带路的兵、舀水的、推小车的");
assert.ok(KF("18-5").units.filter((u) => u.role === "refugee").length >= 3, "18-5 几个百姓");

// --- 走位：进沟走沟口的斜坡、沟里的人在中线上、过院门、鬼子走大路 ---
const liu151 = Unit("15-1", "LiuWencai");
assert.ok(liu151.path.some((p) => Math.abs(p.x - DT.line[0].x) < 0.5 && Math.abs(p.z - DT.line[0].z) < 0.5), "15-1 刘文财从沟口斜坡下沟");
for (const id of ["15-1", "15-2"]) for (const u of KF(id).units.filter((u) => ["Geng", "Nier", "LiuWencai", "LitterDonggua"].includes(u.id))) {
  assert.ok(DistXZ(u, DitchPoint(u.x)) < 0.05, `${id} ${u.id} 要在沟中线上`);
}
assert.ok(DistXZ(KF("15-1").player, DitchPoint(KF("15-1").player.x)) < 0.05 && DistXZ(KF("15-2").player, DitchPoint(KF("15-2").player.x)) < 0.05, "15-1 / 15-2 玩家在沟中线上");
const toXiang = StreetRoute({ x: -166, z: 616.5 }, { x: -182, z: 630.5 });
assert.ok(toXiang.some((p) => Math.abs(p.x - Y.xiang.door.x) < 0.1 && p.z > Y.xiang.box.minZ), "进厢房要走厢房门");
const trenchToBridge = StreetRoute({ x: BH.trench.x, z: 603.4 }, { x: BR.x, z: 680 });
assert.ok(trenchToBridge.some((p) => Math.abs(p.x - BR.x) < 0.1 && p.z <= BR.northFootZ) && trenchToBridge.every((p) => p.x < -100), "从散兵坑上桥走空场、引道、桥北脚（不绕排水沟）");

// --- 场景：脚下都在地面上、身子不进实心块、不站在水里、视线 ---
const scene = await LoadSceneLayout();
assert.ok(scene && !scene.error, `读不到场景文件：${scene?.error}`);
const sceneDoc = JSON.parse(fs.readFileSync(new URL("./Blockout/FirstLevel1218.scene.json", import.meta.url), "utf8"));
const PEOPLE = new Set(["soldier", "officer", "civilian", "child"]);
let onDeck = 0;
for (const kf of NormalizeBlockout(a).keyframes) {
  const stand = StandSampler(scene, kf.signals);
  const solids = SolidBlocks(sceneDoc, kf.signals);
  for (const u of kf.units) {
    if (!PEOPLE.has(u.kind) && u.kind !== "litter") continue;
    const terrain = scene.terrainSampler(u.x, u.z), y = stand(u.x, u.z);
    assert.ok(y >= terrain - 1e-6 && y - terrain <= 1.0, `${kf.id} ${u.id} 脚下 ${y.toFixed(2)}（地形 ${terrain.toFixed(2)}）`);
    if (u.z > RV.waterMinZ && u.z < RV.waterMaxZ) { assert.ok(y >= -0.97 && Math.abs(u.x - BR.x) <= BR.deckW / 2, `${kf.id} ${u.id} 站在河里 (${u.x},${u.z})`); onDeck++; }
    if (!PEOPLE.has(u.kind)) continue;
    // 身子（0.3 m 半径、离脚 0.5…1.4 m）不进任何高过 0.9 m 的实心块
    for (const blk of solids) {
      if (blk.h <= 0.9) continue;
      const c = Math.cos(blk.ry || 0), s = Math.sin(blk.ry || 0), dx = u.x - blk.x, dz = u.z - blk.z;
      const lx = dx * c - dz * s, lz = dx * s + dz * c;
      const ex = Math.abs(lx) - blk.w / 2, ez = Math.abs(lz) - blk.d / 2;
      const pen = ex <= 0 && ez <= 0 ? 0.3 + Math.min(-ex, -ez) : 0.3 - Math.hypot(Math.max(ex, 0), Math.max(ez, 0));
      if (pen <= 0.08) continue;
      const cy = BlockCenterY(blk, scene.terrainSampler);
      if (cy + blk.h / 2 < y + 0.5 || cy - blk.h / 2 > y + 1.4) continue;
      if (pen >= 0.3 && cy + blk.h / 2 <= y + 0.75) continue;
      assert.fail(`${kf.id} ${u.id} 埋进 ${blk.id}`);
    }
  }
  const pl = kf.player, ps = stand(pl.x, pl.z);
  assert.ok(ps - scene.terrainSampler(pl.x, pl.z) <= 1.0, `${kf.id} 玩家脚下`);
  if (pl.z > RV.waterMinZ && pl.z < RV.waterMaxZ) assert.ok(ps >= -0.97 && Math.abs(pl.x - BR.x) <= BR.deckW / 2, `${kf.id} 玩家站在河里`);
}
assert.ok(onDeck >= 12, "桥面上的人每帧都查到了");
const EYE = { stand: 1.62, crouch: 1.05, prone: 0.5 };
const Sight = (kfId, target, targetEye) => {
  const kf = KF(kfId), solids = SolidBlocks(sceneDoc, kf.signals);
  const eye = { x: kf.player.x, z: kf.player.z, eye: EYE[kf.player.stance] };
  return { block: BlockSight(solids, scene.terrainSampler, eye, { x: target.x, z: target.z, eye: targetEye }), ground: SightBlock(scene.terrainSampler, eye, { x: target.x, z: target.z, eye: targetEye }).block };
};
const Clear = (kfId, target, eye, what) => { const r = Sight(kfId, target, eye); assert.ok(r.block === null && r.ground <= 0, `${what}：${r.block ? `被 ${r.block.id} 挡` : `地面挡 ${r.ground}`}`); };
Clear("13-1", Unit("13-1", "Nier"), 1.1, "13-1 玩家趴着要看得见路当中的妮儿");
Clear("14-2", Unit("14-2", "Geng"), 1.6, "14-2 玩家要看得见老耿");
Clear("14-2", Unit("14-2", "Donggua"), 0.3, "14-2 玩家要看得见滑到路当中的冬瓜");
const roadMan = KF("15-2").units.filter((u) => u.group === "queue" && PEOPLE.has(u.kind || "soldier")).sort((p, q) => Math.abs(p.x - KF("15-2").player.x) - Math.abs(q.x - KF("15-2").player.x))[0];
assert.ok(Sight("15-2", roadMan, 1.6).ground > 0.1, `15-2 沟里看不见大路上的人（沟比人深）：${roadMan.id} 地面挡 ${Sight("15-2", roadMan, 1.6).ground}`);
Clear("16-1", Y.dongguaInside, 0.3, "16-1 玩家要看得见厢房里放担架的地方");
Clear("18-2", Unit("18-2", "IjaMg"), 0.5, "18-2 玩家要看得见鬼子机枪组");
Clear("18-2", { x: (BK.box.minX + BK.box.maxX) / 2, z: (BK.box.minZ + BK.box.maxZ) / 2 }, 0.2, "18-2 玩家要看得见土坎");
Clear("18-4", Unit("18-4", "LeveeIja9"), 1.6, "18-4 玩家要看得见北岸堤上的鬼子");
assert.ok(KF("18-2").player.stance === "stand" && Math.abs(KF("18-2").player.yawDeg + 90) < 1, "18-2 站在坑里朝东");

const file = new URL("./Blockout/FirstLevel1218.json", import.meta.url);
if (fs.existsSync(file)) {
  const onDisk = JSON.parse(fs.readFileSync(file, "utf8"));
  if (Strip({ ...onDisk, source: { ...onDisk.source, commit: "test" } }) !== Strip(a)) console.log("提示：Blockout/FirstLevel1218.json 与生成器输出不同（手改过，或没重新 export）");
  // 盘上的 JSON 没有生成器的内部标记（躺在担架上），按手改的口径查只该多报这一类
  const known = /Donggua 站在 LitterDonggua|CartWounded\d 站在 CartLitter\d|(Doctor 和 YardWounded09|Donggua 和 Doctor) 重叠|Doctor 站在 LitterDonggua/;   // 生成器内部标记（onLitter / tending）盘上没有
  const extra = FirstLevel1218Issues(onDisk, { scene }).filter((line) => !known.test(line));
  assert.deepEqual(extra, [], `盘上的 JSON 多报了：\n  ${extra.join("\n  ")}`);
}
console.log(`FirstLevel1218 关键帧：${a.keyframes.length} 帧、${a.keyframes.reduce((s, k) => s + k.units.length, 0)} 个单位位次，校验、摆位、视线全过`);
