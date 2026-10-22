// Script_EditorBlockoutFirstLevel1218KeyframesTest.mjs —— 11–18 白盒（第二版）关键帧生成器的 node 回归（只给关键帧包自验用）
// 跑法：node Taierzhuang1938/Script_EditorBlockoutFirstLevel1218KeyframesTest.mjs
// 查：生成两次除 generatedAt 外逐字相同、过 ValidateBlockout 且无警告、摆位 / 走位问题为零（读 Blockout/FirstLevel1218.scene.json 连实心块、高差、河水一起查）、
// 23 帧（11-1…18-5）齐全、信号按表起、所有人脚下在地面上（高度场或 ≤1 m 的块顶，石板桥 / 浮桥桥面算块顶）、身子不进实心块、没人站在水里；
// 百姓一律程序化身体、只有 14-1…14-3 妮儿、14-3 / 15-1 / 17-1 老耿、15-3 妮儿是骨骼身体（拖被子 / 跪 / 蹲着画驴要放片段）；冬瓜 11-1…13-2 在车上的担架上、13-3 起躺在自己那床单被上、每帧都在、17 起盖着脸不动；
// 车只到 13-2（翻车后是随信号体块）；台词照契约原字；几条关键视线；走位走门、走桥、不穿土坎。

import assert from "node:assert/strict";
import fs from "node:fs";
import { ValidateBlockout, NormalizeBlockout } from "./Script_EditorBlockoutConfig.mjs";
import { FIRST_LEVEL_SPEAKING_CAST } from "./Data_FirstLevelSpeakingCast.mjs";
import { IsBlanketLitter } from "./Script_EditorBlockoutPuppets.mjs";
import { BuildFirstLevel1218Config, StreetRoute, LoadSceneLayout, StandSampler, FirstLevel1218Issues } from "./Script_EditorBlockoutFirstLevel1218Keyframes.mjs";
import { BlockSight, SolidBlocks, BlockCenterY, SightBlock } from "./Script_EditorBlockoutFirstLevel1218Scene.mjs";
import {
  L1218_BOUNDS as B, L1218_PLACES as P, L1218_SIGNALS as SIG, L1218_YARD as Y, L1218_BRIDGE as BR, L1218_STONE_BRIDGE as SB, L1218_TROUGH as TG, L1218_LEVEES as LV,
  L1218_RIVER as RV, L1218_BANK as BK, L1218_BREACH as BCH, L1218_FERRY as FY, L1218_LANE as LN, L1218_TRENCH as TR, TrenchPoint,
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

const IDS = ["11-1", "11-2", "12-1", "12-2", "12-3", "13-1", "13-2", "13-3", "14-1", "14-2", "14-3", "15-1", "15-2", "15-3", "16-1", "17-1", "17-2", "17-3", "18-1", "18-2", "18-3", "18-4", "18-5"];
assert.deepEqual(a.keyframes.map((k) => k.id), IDS, "23 个关键帧按顺序齐全");
const LABELS = { "15-1": "15A", "15-2": "15B", "15-3": "15C" };
for (const kf of a.keyframes) {
  assert.equal(kf.stage, Number(kf.id.split("-")[0]), `${kf.id} 的 stage`);
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
const Has = (id, re) => KF(id).how.join("\n").includes(re);

// --- 台词照契约原字 ---
assert.ok(Has("11-1", "炮一停，狗日的就要钻出来！子弹卸下来，老子们守桥！车拉伤员，往渡口送！"), "11-1 班长的喊话");
assert.ok(Has("11-2", "我跟车！") && Has("11-2", "……文财，你也去！"), "11-2 顺子 / 班长");
assert.ok(Has("12-1", "……到了没得？") && Has("12-1", "快了！"), "12-1 冬瓜 / 顺子");
assert.ok(Has("12-2", "驾！驾！你个畜生——走啊！"), "12-2 老耿");
assert.ok(Has("12-3", "狗日的进了老耿家了！") && Has("12-3", "莫看了！走！") && Has("12-3", "伤兵先上桥！老百姓靠边！"), "12-3 刘文财 / 顺子 / 渡口的兵");
assert.ok(Has("13-1", "对岸！墙角那挺机枪！") && Has("13-2", "飞机！趴倒！") && Has("14-1", "冬瓜！把他弄过来！"), "13 / 14 的喊话");
assert.ok(Has("15-1", "你松你妈啥子手！") && Has("15-1", "龟儿子……手恁个滑……") && Has("15-1", "……八个……抵了。") && !Has("15-1", "又没着打到"), "15A 台词（删「又没着打到」）");
assert.ok(Has("15-3", "等到！里头满起了！挤你妈啥子！") && Has("15-3", "……犟。"), "15C 台词");
assert.ok(Has("16-1", "肚子上的？抬进去！") && Has("16-1", "脚……慢点。") && Has("16-1", "……有门槛。抬高点。"), "16 台词");
assert.ok(Has("17-1", "……没了。") && Has("17-1", "单被盖住他的脸") && !/棉袄/.test(KF("17-1").how.join("")), "17-1 军医；老耿用单被盖脸（不再是棉袄）");
assert.ok(Has("17-3", "咋个搞的？") && Has("17-3", "……飞机。") && Has("17-3", "狗日的。") && Has("17-3", "顺儿。……起来，跟斗走。"), "17-3 台词");
assert.ok(Has("18-2", "炸！不等了！") && Has("18-2", "再等一哈！……顺儿！那挺机枪！") && Has("18-2", "快过来！") && Has("18-2", "后头没得人了！"), "18-2 台词");
assert.ok(Has("18-5", "进城。城里有城墙，比庄上牢靠。") && !/单褂子/.test(KF("18-5").how.join("") + KF("18-5").what), "18-5 老耿（删「单褂子」）");
for (const id of IDS) assert.ok(!/排水沟|沿大路|棉袄|临城|犟种|还有好远/.test(KF(id).what + KF(id).how.join("")), `${id} 还有旧戏的词`);

// --- 百姓一律程序化身体；只有拖被子那几帧妮儿 / 老耿是骨骼身体 ---
// 10-23 第二轮（预演）：14-3 妮儿开场还攥着被角、15-1 老耿跪着按毛巾、15-3 妮儿蹲着画驴、17-1 老耿跪着拉被子盖脸，也要骨骼身体
const RIG = new Set(["14-1/Nier", "14-2/Nier", "14-3/Nier", "14-3/Geng", "15-1/Geng", "15-3/Nier", "17-1/Geng"]);
for (const kf of a.keyframes) for (const u of kf.units) {
  if (u.side !== "civ" || !["civilian", "child"].includes(u.kind)) { assert.ok(!u.body, `${kf.id} ${u.id} 不是百姓不该有 body`); continue; }
  assert.equal(u.body, RIG.has(`${kf.id}/${u.id}`) ? "rig" : "procedural", `${kf.id} ${u.id} 的身体`);
}
for (const id of IDS) { assert.ok(Unit(id, "Geng")?.kind === "civilian", `${id} 老耿要在`); assert.ok(Unit(id, "Nier")?.kind === "child", `${id} 妮儿要在`); }
assert.ok(KF("12-3").units.filter((u) => u.group === "crowd" && u.body === "procedural").length >= 12, "12-3 河滩上往渡口涌的百姓（程序化身体）≥ 12");
assert.ok(KF("13-1").units.filter((u) => u.group === "crowd" && u.side === "civ" && u.state === "down").length >= 2, "13-1 人堆炸开：有百姓倒下");

// --- 车、黑子、车上的东西 ---
for (const id of IDS) assert.equal(!!Unit(id, "GengCart"), IDS.indexOf(id) <= IDS.indexOf("13-2"), `${id} 立着的驴车只到 13-2（翻车后是随信号体块）`);
for (const id of IDS.slice(0, IDS.indexOf("15-3") + 1)) assert.ok(Unit(id, "Heizi")?.kind === "animal", `${id} 黑子要在`);
for (const id of ["13-3", "14-1", "14-2", "14-3", "15-1", "15-2", "15-3"]) assert.equal(Unit(id, "Heizi").state, "down", `${id} 黑子倒了`);
const RideOn = (id, uid) => Unit(id, uid)?.ride;
for (const id of IDS.slice(0, IDS.indexOf("13-2") + 1)) {
  for (const uid of ["LitterDonggua", "CartLitter1", "CartLitter2"]) {
    const r = RideOn(id, uid), u = Unit(id, uid);
    assert.ok(r && r.on === "GengCart" && r.y === 1.075 && Math.abs(r.yawDeg) === 90 && u.bearers === 0, `${id} ${uid} 要横搁在车板上（ride GengCart、y 1.075、bearers 0）：${JSON.stringify(r)}`);
  }
  for (const uid of ["Donggua", "Wounded1", "Wounded2"]) {
    const r = RideOn(id, uid), u = Unit(id, uid);
    assert.ok(r && r.on === "GengCart" && r.y === 1.125 && u.state === "down" && u.lie === "along", `${id} ${uid} 要躺在车上的担架上：${JSON.stringify(r)}`);
  }
  assert.equal(RideOn(id, "LitterDonggua").z, 0.75, `${id} 冬瓜那副靠车尾（本地 z 0.75）`);
  assert.deepEqual(RideOn(id, "Donggua"), { ...RideOn(id, "LitterDonggua"), y: 1.125 }, `${id} 冬瓜躺在自己那副担架上（同一格）`);
}
for (const id of ["11-2", "12-1"]) assert.deepEqual(RideOn(id, "Nier"), { on: "GengCart", x: 0, z: 1.2, y: 0.467, yawDeg: 180 }, `${id} 妮儿坐车尾沿（ride）`);
assert.ok(!RideOn("11-1", "Nier") && !RideOn("12-2", "Nier"), "11-1 妮儿还没上车；12-2 她溜下车去驴头前");
for (const id of IDS.slice(IDS.indexOf("13-3"))) for (const u of KF(id).units) assert.ok(!u.ride, `${id} ${u.id} 车翻了以后谁都不挂在车上`);
for (const id of IDS.slice(IDS.indexOf("13-3"))) assert.ok(!Unit(id, "LitterDonggua") && !Unit(id, "CartLitter1"), `${id} 车板上的竹竿担架翻车后不再摆`);

// --- 冬瓜：13-3…17-3 躺在自己那床单被上（IsBlanketLitter）、每帧都在；17 起盖着脸不动 ---
for (const id of IDS.slice(IDS.indexOf("13-3"), IDS.indexOf("17-3") + 1)) {
  const l = Unit(id, "BlanketDonggua"), d = Unit(id, "Donggua");
  assert.ok(l && l.kind === "litter" && IsBlanketLitter(l) && l.bearers === 0, `${id} 冬瓜的单被（litter，名字带「被」不带「担架」，bearers 0）`);
  assert.ok(d && d.state === "down" && d.lie === "along" && d.castId === "comrade" && DistXZ(l, d) < 0.05 && d.yawDeg === l.yawDeg, `${id} 冬瓜要倒着、顺着被子躺、头朝被子前头`);
}
for (const id of IDS.slice(IDS.indexOf("18-1"))) assert.ok(!Unit(id, "Donggua") && !Unit(id, "BlanketDonggua"), `${id} 冬瓜留在厢房里，不再摆`);
for (const id of ["17-2", "17-3"]) assert.deepEqual([Unit(id, "Donggua").x, Unit(id, "Donggua").z], [Unit("17-1", "Donggua").x, Unit("17-1", "Donggua").z], `${id} 冬瓜盖着脸就不动了`);
assert.ok(DistXZ(Unit("17-1", "BlanketDonggua"), Y.dongguaInside) < 0.05, "17-1 被子放在厢房里");
assert.ok(DistXZ(Unit("13-3", "BlanketDonggua"), P.cartRaidAt) < 5 && DistXZ(Unit("13-3", "BlanketDonggua"), P.cartRaidAt) > 1.5, "13-3 冬瓜摔在翻车旁的空地上");
assert.ok(Unit("15-1", "BlanketDonggua").x >= TG.box.minX && Unit("15-1", "BlanketDonggua").x <= TG.box.maxX && Unit("15-1", "BlanketDonggua").z >= TG.box.minZ && Unit("15-1", "BlanketDonggua").z <= TG.box.maxZ, "15-1 被子在河堤底下的低洼里");
assert.ok(DistXZ(Unit("14-2", "BlanketDonggua"), Unit("14-1", "BlanketDonggua")) >= 3 && DistXZ(Unit("14-2", "BlanketDonggua"), Unit("14-1", "BlanketDonggua")) <= 8, "14-2 被子拖了几米");
assert.ok(KF("14-1").player.stance === "crouch" && DistXZ(KF("14-1").player, Unit("14-1", "BlanketDonggua")) < 1.8 && DistXZ(Unit("14-1", "Nier"), Unit("14-1", "BlanketDonggua")) < 1.8, "14-1 顺子与妮儿各揪被子一角");
assert.ok(KF("14-2").player.stance === "prone" && DistXZ(Unit("14-2", "Nier"), Unit("14-2", "BlanketDonggua")) < 1.8, "14-2 顺子趴倒、妮儿还攥着被角");
assert.ok(DistXZ(Unit("14-3", "Geng"), Unit("14-3", "BlanketDonggua")) < 1.8 && DistXZ(KF("14-3").player, Unit("14-3", "BlanketDonggua")) < 1.8, "14-3 老耿和顺子一人一角");

// --- 信号按表起 ---
const From = (sig, firstId) => IDS.forEach((id, i) => assert.equal(KF(id).signals.includes(sig), i >= IDS.indexOf(firstId), `${id} 的 ${sig}`));
From(SIG.cartOverturned, "13-3"); From(SIG.breachBlasted, "14-3"); From(SIG.chargesSet, "18-1"); From(SIG.bridgeBlown, "18-4");

// --- 豁子上的机枪、班长他们守桥、甩手榴弹 ---
for (const id of ["13-1", "13-2", "13-3", "14-1", "14-2"]) {
  const mg = Unit(id, "BreachMg");
  assert.ok(mg && mg.weapon === "Type11" && mg.stance === "prone" && mg.aim && mg.arc && DistXZ(mg, BCH.mgPost) < 0.05 && Unit(id, "BreachLoader"), `${id} 豁子上的机枪组`);
  assert.ok(KF(id).units.filter((u) => u.group === "breach" && u.role === "rifleman").length >= 3, `${id} 院墙后 / 篱笆后趴开的鬼子`);
}
for (const id of ["14-3", "15-1"]) assert.ok(Unit(id, "BreachMg").state === "down" && Unit(id, "BreachLoader").state === "down", `${id} 机枪哑了（手榴弹）`);
for (const id of ["12-1", "12-2", "12-3", "13-1"]) for (const uid of ["Luo", "Yaowa", "HeYoutian"]) assert.ok(Unit(id, uid).stance === "prone" && Unit(id, uid).x < SB.westHead.x && Unit(id, uid).x > 20 && Math.abs(Unit(id, uid).z - SB.z) < 5, `${id} ${uid} 趴在桥西头坎沿`);
assert.ok(KF("12-3").units.filter((u) => /^Helmet/.test(u.id) && u.side === "ija").length === 3 && KF("12-3").units.filter((u) => /^Helmet/.test(u.id)).every((u) => DistXZ(u, P.helmetsAt) < 4), "12-3 村南口冒出的钢盔");
for (const uid of ["Luo", "Yaowa", "HeYoutian"]) assert.ok(BCH.grenadeFrom.some((p) => DistXZ(Unit("14-3", uid), p) < 0.05) && Unit("14-3", uid).path?.length >= 2, `14-3 ${uid} 摸到河汊子西坎上豁子对面`);

// --- 11 出村南口、12 过桥 ---
assert.ok(DistXZ(KF("11-1").player, P.villageSouth) < 4 && Math.abs(KF("11-1").player.yawDeg - 90) < 20, "11-1 顺子刚出村南口、朝西看");
assert.ok(Unit("11-1", "Bearer1") && Unit("11-1", "Bearer2") && Unit("11-1", "Yaowa").role === "ammoCarrier" && Unit("11-1", "HeYoutian").role === "ammoCarrier", "11-1 担架员、扛子弹箱的幺娃 / 何有田");
for (const id of ["11-2", "12-1"]) assert.ok(Math.abs(Unit(id, "GengCart").z - LN.line[1].z) < 0.6 && Unit(id, "GengCart").yawDeg === 90, `${id} 车在墙根小路上朝西`);
assert.ok(Unit("12-2", "Heizi").z === SB.z && Unit("12-2", "Heizi").x >= SB.toX - 1.5 && Unit("12-2", "Nier").x < Unit("12-2", "Heizi").x, "12-2 黑子在桥东头、妮儿在驴头前");
assert.ok(DistXZ(Unit("12-3", "GengCart"), SB.westHead) < 16 && Unit("12-3", "GengCart").x < SB.westHead.x && KF("12-3").pois.some((p) => p.id === "GengSmoke"), "12-3 车下了桥上河滩；老耿家冒烟的 POI");

// --- 13 翻车、18 散兵坑 / 桥头 / 对岸 ---
assert.ok(DistXZ(Unit("13-1", "GengCart"), P.cartRaidAt) < 0.05 && Unit("13-1", "GengCart").x >= FY.square.minX && Unit("13-1", "GengCart").x <= 8, "13-1 车挤在渡口空场东沿人堆边上");
assert.ok(KF("13-1").player.stance === "crouch" && DistXZ(KF("13-1").player, Unit("13-1", "GengCart")) < 3 && DistXZ(Unit("13-1", "LiuWencai"), Unit("13-1", "GengCart")) < 3, "13-1 顺子和刘文财在车后");
assert.ok(KF("13-2").player.stance === "prone" && KF("13-2").units.filter((u) => u.group === "crowd" && ["soldier", "civilian"].includes(u.kind || "soldier") && u.state !== "down").every((u) => u.stance === "prone"), "13-2 飞机来：人堆全趴");
const officer = Unit("18-1", "BridgeOfficer");
assert.ok(officer.kind === "officer" && officer.castId === "frontOfficer" && DistXZ(officer, FY.officerPost) < 0.05, "18-1 桥头军官");
for (const uid of ["Sapper1", "Sapper2"]) assert.ok(Math.abs(Unit("18-1", uid).x - BR.x) <= BR.deckW / 2 && Unit("18-1", uid).z >= BR.northFootZ && Unit("18-1", uid).z <= BR.northFootZ + 10, `18-1 ${uid} 在第一条船那段桥面上`);
const SQUAD = ["Luo", "Yaowa", "HeYoutian", "LiuWencai", "Squad1", "Squad2"];
for (const uid of SQUAD) {
  assert.ok(Unit("18-1", uid).intent?.length >= 1 && DistXZ(Unit("18-1", uid).intent.at(-1), Unit("18-2", uid)) < 0.1, `18-1 ${uid} 的 intent 指向自己的坑位`);
  assert.ok(TR.slots.some((s) => DistXZ(TrenchPoint(s), Unit("18-2", uid)) < 0.05) && Unit("18-2", uid).yawDeg <= 5 && Unit("18-2", uid).yawDeg >= -75, `18-2 ${uid} 在散兵坑里朝北到东北（看着石板桥西头）`);
}
assert.ok(KF("18-1").pois.some((p) => p.id === "RailBlast" && p.kind === "danger" && p.x > 100), "18-1 远处铁路桥炸用 POI、在东边");
const mg = Unit("18-2", "IjaMg");
assert.ok(mg.weapon === "Type11" && mg.role === "machineGun" && mg.stance === "prone" && mg.arc && DistXZ(mg, P.ijaMg18) < 0.05 && Unit("18-2", "IjaMgLoader"), "18-2 石板桥头的鬼子机枪组");
assert.ok(KF("18-2").units.filter((u) => u.side === "ija" && u.role === "rifleman").length >= 8 && KF("18-2").units.filter((u) => u.side === "ija" && u.role === "rifleman").every((u) => u.x >= 5 && u.x <= 42 && u.z >= 560 && u.z <= 600), "18-2 鬼子 8–10 个从石板桥和河滩北半截压过来");
const last = ["LastGroup1", "LastGroup2", "LastGroup3"].map((id) => Unit("18-2", id));
assert.ok(last.every((u) => u && u.stance === "crouch" && u.x < BK.box.minX && DistXZ(u, P.lastGroupCover) < 2.6) && Unit("18-2", "LastWounded").state === "down", "18-2 最后一拨人缩在土坎西边");
assert.ok(Math.abs(Unit("18-2", "Geng").x - BR.x) <= BR.deckW / 2 && Unit("18-2", "Geng").z > BR.northFootZ && Unit("18-2", "Nier").z > BR.northFootZ, "18-2 老耿牵着妮儿在浮桥上");
assert.ok(KF("18-3").player.z > BR.northFootZ && KF("18-3").player.z < BR.southFootZ && Math.abs(KF("18-3").player.x - BR.x) <= BR.deckW / 2, "18-3 玩家在浮桥面上");
const onDeck3 = SQUAD.map((id) => Unit("18-3", id));
assert.ok(onDeck3.every((u) => Math.abs(u.x - BR.x) <= BR.deckW / 2 && u.z > BR.northFootZ && u.z < BR.southFootZ), "18-3 全班在桥面上");
assert.ok(onDeck3.every((u) => u.id === "Luo" || u.z > Unit("18-3", "Luo").z) && Math.abs(Unit("18-3", "Luo").yawDeg) < 1, "18-3 班长在最北、倒退着");
assert.ok(KF("18-3").units.filter((u) => u.side === "ija" && u.role === "rifleman").every((u) => u.x >= -3 && u.x <= 15 && u.z >= 600 && u.z <= 620), "18-3 鬼子压到渡口空场东沿");
assert.ok(KF("18-4").units.filter((u) => u.group === "levee" && u.kind !== "tank").length >= 12 && KF("18-4").units.filter((u) => u.group === "levee" && u.kind !== "tank").every((u) => Math.abs(u.z - LV.north.z) <= 1.5 && (u.x < LV.north.gaps[0].minX || u.x > LV.north.gaps[0].maxX)), "18-4 北岸堤上一排鬼子（避开浮桥口子）");
assert.ok(Unit("18-4", "IjaTank")?.kind === "tank" && DistXZ(Unit("18-4", "IjaTank"), SB.westHead) < 8, "18-4 战车在石板桥西头");
assert.ok(SQUAD.every((id) => Unit("18-4", id).z >= LV.south.z + 2), "18-4 全班在南堤后");
assert.ok(KF("18-4").pois.some((p) => p.id === "YardLamp") && KF("18-4").pois.some((p) => p.id === "Wreck"), "18-4 POI：院里马灯、断桥往下游漂");
const evac = KF("18-2").units.filter((u) => u.group === "yardEvac");
assert.ok(evac.length >= 3 && evac.every((u) => u.kind === "litter" && u.intent?.at(-1)?.z > BR.southFootZ), "18-2 院里的担架抬出来，往南岸去");
assert.ok(Unit("18-2", "Doctor")?.intent?.at(-1)?.z > BR.southFootZ && !KF("18-2").units.some((u) => /^(YardWounded|GateWounded)/.test(u.id)), "18-2 军医跟着最后一副出院门；院里、门口不再有等着的伤员");
for (const id of ["18-3", "18-4"]) assert.ok(Unit(id, "Doctor").z > BR.southFootZ && KF(id).units.filter((u) => /^YardDead/.test(u.id)).length >= 2, `${id} 军医过了河，院里只剩盖着脸的`);
assert.ok(Unit("18-5", "Guide") && Math.abs(Unit("18-5", "Guide").x - P.northGate.x) < 2 && Unit("18-5", "WaterMan") && Unit("18-5", "SandCart1") && KF("18-5").units.filter((u) => u.role === "refugee").length >= 3, "18-5 北门口");

// --- 15–17：河堤底下、门口、门槛 ---
assert.ok(KF("15-1").player.stance === "crouch" && DistXZ(KF("15-1").player, Unit("15-1", "BlanketDonggua")) < 2.5 && DistXZ(Unit("15-1", "Geng"), Unit("15-1", "BlanketDonggua")) < 2.5, "15-1 顺子蹲在被头、老耿在被子边");
assert.ok(Unit("15-3", "BlanketDonggua").x > Y.box.maxX && DistXZ(Unit("15-3", "BlanketDonggua"), { x: Y.queueAlongX, z: 620 }) < 4 && KF("15-3").units.filter((u) => /^GateWounded/.test(u.id)).length === 6, "15-3 冬瓜的被子排在院门外墙根、墙根下躺一排伤兵");
assert.ok(KF("15-3").player.stance === "crouch" && Unit("15-3", "GateGuard"), "15-3 顺子在被头蹲下、守门的兵");
assert.ok(Unit("16-1", "Doctor") && DistXZ(Unit("16-1", "Doctor"), KF("16-1").player) < 10 && Unit("16-1", "LiuWencai").z < KF("16-1").player.z && DistXZ(KF("16-1").player, { x: Y.xiang.door.x, z: Y.xiang.box.minZ }) < 1.2, "16-1 顺子在厢房门口、刘文财在被尾、军医在院里");
assert.ok(DistXZ(Unit("17-1", "Doctor"), Unit("17-1", "Donggua")) < 0.6 && Unit("17-1", "Doctor").x < Unit("17-1", "Donggua").x && Unit("17-1", "Doctor").stance === "crouch", "17-1 军医跪在冬瓜西边");
assert.ok(KF("17-2").player.stance === "crouch" && DistXZ(KF("17-2").player, Y.thresholdSeat) < 0.05 && Math.abs(KF("17-2").player.yawDeg) < 1, "17-2 顺子坐门槛朝北");
const luo173 = Unit("17-3", "Luo");
assert.ok(luo173.path && luo173.path.some((p) => Math.abs(p.z - Y.gate.z) < 0.1 && Math.abs(p.x - Y.box.maxX) < 1.5) && DistXZ(luo173, KF("17-3").player) < 2.5, "17-3 班长从院门进来走到顺子跟前");
for (const uid of ["Yaowa", "HeYoutian", "Squad1", "Squad2"]) assert.ok(Unit("17-3", uid)?.path?.length >= 2, `17-3 ${uid} 跟着进来`);
for (const id of ["15-3", "16-1", "17-1", "17-2", "17-3"]) assert.ok(KF(id).units.filter((u) => /^YardWounded/.test(u.id) && u.state === "down").length >= 8 && Unit(id, "Doctor")?.weapon === null, `${id} 院里麦秸上躺着伤员、军医空手`);

// --- 走位：过桥走桥面、进厢房走厢房门、从散兵坑上浮桥走空场 / 引道 ---
const overBridge = StreetRoute({ x: 60, z: 551.5 }, { x: 10, z: 600 });
assert.ok(overBridge.some((p) => Math.abs(p.z - SB.z) < 0.1 && p.x >= SB.fromX && p.x <= SB.toX) && overBridge.every((p) => !(p.x > SB.fromX + 1 && p.x < SB.toX - 1 && Math.abs(p.z - SB.z) > 1.3)), "从墙根小路到河滩要走石板桥桥面");
const toXiang = StreetRoute({ x: -20, z: 616.5 }, { x: -42, z: 628.5 });
assert.ok(toXiang.some((p) => Math.abs(p.x - Y.xiang.door.x) < 0.1 && p.z > Y.xiang.box.minZ), "进厢房要走厢房门");
const trenchToBridge = StreetRoute(TrenchPoint(TR.slots[1]), { x: BR.x, z: 680 });
assert.ok(trenchToBridge.some((p) => Math.abs(p.x - BR.x) < 0.1 && p.z <= BR.northFootZ), "从散兵坑上浮桥走空场、引道、桥北脚");

// --- 场景：脚下都在地面上、身子不进实心块、不站在水里、视线 ---
const scene = await LoadSceneLayout();
assert.ok(scene && !scene.error, `读不到场景文件：${scene?.error}`);
const sceneDoc = JSON.parse(fs.readFileSync(new URL("./Blockout/FirstLevel1218.scene.json", import.meta.url), "utf8"));
const PEOPLE = new Set(["soldier", "officer", "civilian", "child"]);
let onDeck = 0, onStone = 0;
for (const kf of NormalizeBlockout(a).keyframes) {
  const stand = StandSampler(scene, kf.signals);
  const solids = SolidBlocks(sceneDoc, kf.signals);
  for (const u of kf.units) {
    if (!PEOPLE.has(u.kind) && u.kind !== "litter") continue;
    if (u.ride) continue;
    const terrain = scene.terrainSampler(u.x, u.z), y = stand(u.x, u.z);
    assert.ok(y >= terrain - 1e-6 && y - terrain <= 1.0, `${kf.id} ${u.id} 脚下 ${y.toFixed(2)}（地形 ${terrain.toFixed(2)}）`);
    if (u.z > RV.waterMinZ && u.z < RV.waterMaxZ) { assert.ok(y >= -0.97 && Math.abs(u.x - BR.x) <= BR.deckW / 2, `${kf.id} ${u.id} 站在河里 (${u.x},${u.z})`); onDeck++; }
    if (u.x >= SB.fromX && u.x <= SB.toX && Math.abs(u.z - SB.z) < 1.3) { assert.ok(y >= 0.3, `${kf.id} ${u.id} 掉进河汊子了 (${u.x},${u.z})`); onStone++; }
    if (!PEOPLE.has(u.kind)) continue;
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
assert.ok(onDeck >= 12 && onStone >= 2, `桥面上的人每帧都查到了（浮桥 ${onDeck}、石板桥 ${onStone}）`);
const EYE = { stand: 1.62, crouch: 1.05, prone: 0.5 };
const Sight = (kfId, target, targetEye, from = null) => {
  const kf = KF(kfId), solids = SolidBlocks(sceneDoc, kf.signals), stand = StandSampler(scene, kf.signals);
  const src = from || kf.player;
  const eye = { x: src.x, z: src.z, eye: stand(src.x, src.z) - scene.terrainSampler(src.x, src.z) + EYE[src.stance || "stand"] };
  return { block: BlockSight(solids, scene.terrainSampler, eye, { x: target.x, z: target.z, eye: targetEye }), ground: SightBlock(scene.terrainSampler, eye, { x: target.x, z: target.z, eye: targetEye }).block };
};
const Clear = (kfId, target, eye, what, from = null) => { const r = Sight(kfId, target, eye, from); assert.ok(r.block === null && r.ground <= 0, `${what}：${r.block ? `被 ${r.block.id} 挡` : `地面挡 ${r.ground}`}`); };
Clear("11-1", P.bridgeWest, 1.0, "11-1 站在村南口要看得见小路尽头的石板桥");
Clear("12-2", Unit("12-2", "Heizi"), 1.2, "12-2 要看得见桥头的黑子");
Clear("13-1", BCH.mgPost, 1.2, "13-1 从车后要看得见豁子上的机枪");
Clear("13-1", Unit("13-1", "FerrySoldier"), 1.6, "13-1 豁子上的机枪要看得见渡口土台子上的兵", Unit("13-1", "BreachMg"));
{ const r = Sight("15-1", BCH.mgPost, 1.2, { ...KF("15-1").player, stance: "prone" }); assert.ok(r.ground > 0.05, `15-1 河堤底下趴着的人机枪看不见（地面挡 ${r.ground}）`); }
Clear("14-2", Unit("14-2", "Nier"), 1.1, "14-2 玩家趴着要看得见攥着被角的妮儿");
Clear("14-2", Unit("14-2", "Donggua"), 0.3, "14-2 玩家要看得见被子上的冬瓜");
Clear("16-1", Y.dongguaInside, 0.3, "16-1 玩家要看得见厢房里放被子的地方");
Clear("18-2", Unit("18-2", "IjaMg"), 0.5, "18-2 玩家在坑里要看得见石板桥头的机枪组");
{ const r = Sight("18-2", Unit("18-2", "LastGroup2"), EYE.crouch, Unit("18-2", "IjaMg")); assert.ok(r.ground > 0.05, `18-2 桥头机枪看不见土坎西边的最后一拨人（地面挡 ${r.ground}）`); }
Clear("18-4", Unit("18-4", "LeveeIja9"), 1.6, "18-4 玩家要看得见北岸堤上的鬼子");
assert.ok(KF("18-2").player.stance === "stand" && KF("18-2").player.yawDeg <= 5 && KF("18-2").player.yawDeg >= -75, "18-2 站在坑里朝北到东北");

const file = new URL("./Blockout/FirstLevel1218.json", import.meta.url);
if (fs.existsSync(file)) {
  const onDisk = JSON.parse(fs.readFileSync(file, "utf8"));
  if (Strip({ ...onDisk, source: { ...onDisk.source, commit: "test" } }) !== Strip(a)) console.log("提示：Blockout/FirstLevel1218.json 与生成器输出不同（手改过，或没重新 export）");
  // 盘上的 JSON 没有生成器的内部标记（躺在担架 / 被子上、照料），按手改的口径查只该多报这一类
  const known = /Donggua 站在 (LitterDonggua|BlanketDonggua)|Wounded\d 站在 CartLitter\d|(Doctor 和 YardWounded09|Donggua 和 Doctor) 重叠|Doctor 站在 BlanketDonggua/;
  const extra = FirstLevel1218Issues(onDisk, { scene }).filter((line) => !known.test(line));
  assert.deepEqual(extra, [], `盘上的 JSON 多报了：\n  ${extra.join("\n  ")}`);
}
console.log(`FirstLevel1218 关键帧：${a.keyframes.length} 帧、${a.keyframes.reduce((s, k) => s + k.units.length, 0)} 个单位位次，校验、摆位、视线全过`);
