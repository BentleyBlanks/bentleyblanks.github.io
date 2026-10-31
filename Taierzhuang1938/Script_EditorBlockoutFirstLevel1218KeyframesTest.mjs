// Script_EditorBlockoutFirstLevel1218KeyframesTest.mjs —— 11–18 白盒（第三版，北沙河村）关键帧生成器的 node 回归
// 跑法：node Taierzhuang1938/Script_EditorBlockoutFirstLevel1218KeyframesTest.mjs
// 查：生成两次除 generatedAt 外逐字相同、过 ValidateBlockout 且无警告、摆位 / 走位问题为零（读 Blockout/FirstLevel1218.scene.json 连实心块、高差、深水一起查）、
// 33 帧（11-1…18-8）齐全、信号按表起、所有人脚下在地面上（高度场或 ≤ 1 m 的块顶：板桥门板、门槛）、身子不进实心块、没人站在河汊子的深水里；
// 百姓一律程序化身体、只有 14-4…14-6 妮儿、14-6 / 15-1 / 17-1 老耿、15-3 妮儿是骨骼身体；七二七团的兵用名字区分；
// 冬瓜 11-1…12-6 在车上的担架上、12-7…17-3 躺在自己那床单被上、17 起盖着脸不动、18 起留在厢房里；车只到 14-2（14-3 起翻在救护所院门口，黑子倒地）；
// 台词照契约原字；没有第二版的旧戏；几条关键视线；走位走板桥、走门、上下路基走土坡；铁路桥桥面上的人站在枕木顶（standOn 走道）。

import assert from "node:assert/strict";
import fs from "node:fs";
import { ValidateBlockout, NormalizeBlockout } from "./Script_EditorBlockoutConfig.mjs";
import { FIRST_LEVEL_SPEAKING_CAST } from "./Data_FirstLevelSpeakingCast.mjs";
import { IsBlanketLitter } from "./Script_EditorBlockoutPuppets.mjs";
import { BuildFirstLevel1218Config, StreetRoute, LoadSceneLayout, StandSampler, FirstLevel1218Issues, OnRailBridge, CART_LINE } from "./Script_EditorBlockoutFirstLevel1218Keyframes.mjs";
import { BlockSight, SolidBlocks, BlockCenterY, SightBlock } from "./Script_EditorBlockoutFirstLevel1218Scene.mjs";
import { ReadBlockoutSceneDocSync } from "./Script_SceneNode.mjs";
import {
  L1218_BOUNDS as B, L1218_PLACES as P, L1218_SIGNALS as SIG, L1218_AID as A, L1218_AT_DITCH as AT, L1218_PLANK as PK, L1218_TRENCH as TR, L1218_HEIGHTS as H,
  L1218_CART_PARK as CPK, L1218_RAIL as RL, L1218_RAIL_BRIDGE as RB, L1218_BANK as BK, L1218_LEVEE as LV, L1218_NORTH_GATE as NG, L1218_GIRL_YARD as GY, L1218_FROM_0610,
  L1218_RAIL_RAMPS, RiverAtX,
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

const IDS = ["11-1", "11-2", "12-1", "12-2", "12-3", "12-4", "12-5", "12-6", "12-7", "13-1", "13-2", "13-3", "14-1", "14-2", "14-3", "14-4", "14-5", "14-6",
  "15-1", "15-2", "15-3", "16-1", "17-1", "17-2", "17-3", "18-1", "18-2", "18-3", "18-4", "18-5", "18-6", "18-7", "18-8"];
assert.deepEqual(a.keyframes.map((k) => k.id), IDS, "33 个关键帧按顺序齐全");
const LABELS = { "15-1": "15A", "15-2": "15B", "15-3": "15C", "18-1": "18A", "18-2": "18A", "18-3": "18B", "18-4": "18C", "18-5": "18C", "18-6": "18C", "18-7": "18C", "18-8": "18夜" };
for (const kf of a.keyframes) {
  assert.equal(kf.stage, Number(kf.id.split("-")[0]), `${kf.id} 的 stage`);
  assert.equal(kf.stageLabel, LABELS[kf.id], `${kf.id} 的 stageLabel`);
  assert.ok(kf.player.x >= B.minX && kf.player.x <= B.maxX && kf.player.z >= B.minZ && kf.player.z <= B.maxZ, `${kf.id} 玩家出界`);
  assert.ok(!/掩护|清理|护送/.test(kf.next?.text || ""), `${kf.id} next 用了禁词：${kf.next?.text}`);
  assert.ok(kf.what.length <= 80, `${kf.id} what 太长`);
  assert.ok(kf.how.length >= 3 && kf.notes.length > 0, `${kf.id} how / notes 要写`);
  for (const u of kf.units) if (u.castId) assert.ok(Object.hasOwn(FIRST_LEVEL_SPEAKING_CAST, u.castId), `${kf.id} ${u.id} 的 castId ${u.castId} 不在定妆表里`);
}
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
const From = (sig, firstId) => IDS.forEach((id, i) => assert.equal(KF(id).signals.includes(sig), i >= IDS.indexOf(firstId), `${id} 的 ${sig}`));

// --- 台词照契约原字 ---
assert.ok(Has("11-2", "往北沙河撤！七二七团在那！车拉伤员，跟斗走！"), "11 班长");
assert.ok(Has("12-1", "……到了没得？") && Has("12-1", "快了！"), "12 路上");
assert.ok(Has("12-2", "狗日的进了老耿家了！") && Has("12-2", "莫看了！走！"), "12 炮停");
assert.ok(Has("12-3", "站到！哪部分的？") && Has("12-3", "前头撤下来的！车上是伤兵！") && Has("12-3", "伤兵往村西头送，救护所在那。你们几个——留到这儿，后头还有人要撤进来。"), "12 沟口");
assert.ok(Has("12-4", "送到了就回来。"), "12 班长对顺子");
assert.ok(Has("12-5", "老哥，咋不走？") && Has("12-5", "走哪去？家在这儿。"), "12 老汉");
assert.ok(Has("12-7", "肚子上的？排到。") && Has("12-7", "到了。"), "12 救护所");
assert.ok(Has("13-3", "飞机！趴倒！") && Has("14-2", "顺儿！去看冬瓜！") && Has("14-4", "冬瓜！把他弄过来！"), "13 / 14 的喊话");
assert.ok(Has("15-1", "你松你妈啥子手！") && Has("15-1", "龟儿子……手恁个滑……") && Has("15-1", "……八个……抵了。") && Has("15-1", "老人家，你牵到她。"), "15A");
assert.ok(Has("15-3", "等到！里头满起了！挤你妈啥子！") && Has("15-3", "画的黑子嗦？") && Has("15-3", "……犟。") && Has("15-3", "下一副！"), "15C");
assert.ok(Has("16-1", "肚子上的？抬进去！表堵到门口！") && Has("16-1", "脚……慢点。") && Has("16-1", "……有门槛。抬高点。"), "16");
assert.ok(Has("17-1", "……没了。") && Has("17-1", "刚才过门槛，还在说话……") && Has("17-1", "单被盖住他的脸"), "17-1");
assert.ok(Has("17-3", "咋个搞的？") && Has("17-3", "……飞机。") && Has("17-3", "狗日的。") && Has("17-3", "顺儿。……起来。"), "17-3");
assert.ok(Has("18-1", "命令下来了：撤回县城，铁路桥天黑前炸。城里说援兵在路上了。") && Has("18-1", "在路上？日他妈，老子也在路上。") && Has("18-1", "顺儿，你跟担架走。到桥南头等到老子。"), "18A");
assert.ok(Has("18-2", "走啊！鬼子要来了！"), "18A 隔壁院");
assert.ok(Has("18-4", "炸！不等了！") && Has("18-4", "班长他们还在后头！") && Has("18-4", "再等一哈！……顺儿！那挺机枪！"), "18C");
assert.ok(Has("18-5", "快过来！快过来！") && Has("18-5", "后头没得人了！") && Has("18-6", "点！") && Has("18-7", "走！看你妈啥子，走！"), "18C 炸桥 / 对岸");
assert.ok(Has("18-8", "老人家，你嗯往哪儿走？") && Has("18-8", "进城。城里有城墙，比庄上牢靠。") && Has("18-8", "1938年3月14日 夜｜滕县北门"), "18 北门");
for (const id of IDS) assert.ok(!/石板桥|渡口|浮桥|墙豁子|子弹卸下来|守桥|排水沟|河滩|棉袄|临城|犟种|单褂子|短褂|填沟|接收院/.test(KF(id).what + KF(id).how.join("") + (KF(id).next?.text || "")), `${id} 还有第二版的旧戏 / 不要的词`);

// --- 身体：百姓一律程序化；只有拖被子 / 跪 / 蹲着画驴那几帧是骨骼身体 ---
const RIG = new Set(["14-4/Nier", "14-5/Nier", "14-6/Nier", "14-6/Geng", "15-1/Geng", "15-3/Nier", "17-1/Geng"]);
for (const kf of a.keyframes) for (const u of kf.units) {
  if (u.side !== "civ" || !["civilian", "child"].includes(u.kind)) { assert.ok(!u.body, `${kf.id} ${u.id} 不是百姓不该有 body`); continue; }
  assert.equal(u.body, RIG.has(`${kf.id}/${u.id}`) ? "rig" : "procedural", `${kf.id} ${u.id} 的身体`);
}
for (const id of IDS) { assert.ok(Unit(id, "Geng")?.kind === "civilian", `${id} 老耿要在`); assert.ok(Unit(id, "Nier")?.kind === "child", `${id} 妮儿要在`); }
for (const [id, uid] of [["12-5", "OldMan"], ["12-5", "Fam1"], ["12-7", "Girl"], ["18-2", "GirlMother"], ["18-3", "Wader2"]]) assert.ok(Unit(id, uid)?.side === "civ" && Unit(id, uid).body === "procedural", `${id} ${uid} 程序化身体`);
assert.ok(KF("12-6").units.filter((u) => u.group === "church" && u.side === "civ").length >= 12, "12-6 教堂院里挤满了老乡（程序化身体）");
for (const uid of ["Sentry", "Captain"]) assert.ok(Unit("12-3", uid)?.side === "nra" && /七二七团/.test(Unit("12-3", uid).name), `12-3 ${uid} 是七二七团的兵（用名字区分）`);
assert.ok(Unit("12-7", "Doctor")?.name === "医官" && Unit("12-7", "Doctor").weapon === null && Unit("18-4", "Sapper1")?.name === "工兵" && /七二七团/.test(Unit("18-4", "Officer18").name), "医官空手、工兵、七二七团军官");

// --- 车、黑子、车上的东西 ---
for (const id of IDS) assert.equal(!!Unit(id, "GengCart"), IDS.indexOf(id) <= IDS.indexOf("14-2"), `${id} 立着的驴车只到 14-2（14-3 起翻在院门口）`);
for (const id of IDS.slice(IDS.indexOf("12-7"), IDS.indexOf("14-2") + 1)) assert.ok(DistXZ(Unit(id, "GengCart"), CPK.cart) < 0.05 && DistXZ(Unit(id, "Heizi"), CPK.heizi) < 0.05, `${id} 车和黑子停在救护所门前`);
for (const id of IDS.slice(0, IDS.indexOf("18-2") + 1)) assert.ok(Unit(id, "Heizi")?.kind === "animal", `${id} 黑子要在`);
for (const id of IDS.slice(IDS.indexOf("14-3"), IDS.indexOf("18-2") + 1)) assert.ok(Unit(id, "Heizi").state === "down" && DistXZ(Unit(id, "Heizi"), CPK.heizi) < 1.5, `${id} 黑子倒在救护所院门口`);
for (const id of IDS.slice(IDS.indexOf("18-3"))) assert.ok(!Unit(id, "Heizi"), `${id} 黑子和车留在村里`);
From(SIG.cartOverturned, "14-3");
const RideOn = (id, uid) => Unit(id, uid)?.ride;
for (const id of IDS.slice(0, IDS.indexOf("12-6") + 1)) {
  for (const uid of ["LitterDonggua", "CartLitter1", "CartLitter2"]) {
    const r = RideOn(id, uid), u = Unit(id, uid);
    assert.ok(r && r.on === "GengCart" && r.y === 1.075 && Math.abs(r.yawDeg) === 90 && u.bearers === 0, `${id} ${uid} 要横搁在车板上（ride GengCart、y 1.075、bearers 0）`);
  }
  for (const uid of ["Donggua", "Wounded1", "Wounded2"]) { const r = RideOn(id, uid); assert.ok(r && r.on === "GengCart" && r.y === 1.125 && Unit(id, uid).state === "down", `${id} ${uid} 躺在车上的担架上`); }
  assert.equal(RideOn(id, "LitterDonggua").z, 0.75, `${id} 冬瓜那副靠车尾`);
}
for (const id of ["11-2", "12-1", "12-2", "12-3"]) assert.deepEqual(RideOn(id, "Nier"), { on: "GengCart", x: 0, z: 1.2, y: 0.467, yawDeg: 180 }, `${id} 妮儿坐车尾沿`);
for (const id of ["12-4", "12-5", "12-6"]) assert.ok(!RideOn(id, "Nier") && DistXZ(Unit(id, "Nier"), Unit(id, "Heizi")) < 2.6, `${id} 从板桥起妮儿牵着黑子走最前头`);
assert.ok(Unit("12-4", "Nier").z >= PK.fromZ && Unit("12-4", "Nier").z <= PK.toZ && Math.abs(Unit("12-4", "Nier").x - PK.x) < PK.w / 2 && Unit("12-4", "Heizi").z < PK.fromZ, "12-4 妮儿上了板桥、黑子在板桥头");
for (const id of IDS.slice(IDS.indexOf("12-7"))) for (const u of KF(id).units) assert.ok(!u.ride, `${id} ${u.id} 到了救护所以后谁都不挂在车上`);

// --- 冬瓜 ---
for (const id of IDS.slice(IDS.indexOf("12-7"), IDS.indexOf("17-3") + 1)) {
  const l = Unit(id, "BlanketDonggua"), d = Unit(id, "Donggua");
  assert.ok(l && l.kind === "litter" && IsBlanketLitter(l) && l.bearers === 0, `${id} 冬瓜的单被`);
  assert.ok(d && d.state === "down" && d.lie === "along" && d.castId === "comrade" && DistXZ(l, d) < 0.05 && d.yawDeg === l.yawDeg, `${id} 冬瓜顺着被子躺`);
}
assert.ok(DistXZ(Unit("12-7", "BlanketDonggua"), A.wallRootDonggua) < 0.05, "12-7 冬瓜连单被搁在墙根");
for (const id of IDS.slice(IDS.indexOf("18-1"))) assert.ok(!Unit(id, "Donggua") && !Unit(id, "BlanketDonggua"), `${id} 冬瓜留在厢房里，不再摆`);
for (const id of ["17-2", "17-3"]) assert.deepEqual([Unit(id, "Donggua").x, Unit(id, "Donggua").z], [Unit("17-1", "Donggua").x, Unit("17-1", "Donggua").z], `${id} 冬瓜盖着脸就不动了`);
assert.ok(DistXZ(Unit("17-1", "BlanketDonggua"), A.dongguaInside) < 0.05, "17-1 被子放在厢房里");

// --- 14 拖被子、松手、拖进洞；15A 洞里 ---
const holeA = A.holes[0];
const holeD = (p) => DistXZ(p, holeA.mouth);
assert.ok(holeD(Unit("14-4", "BlanketDonggua")) > holeD(Unit("14-5", "BlanketDonggua")) && holeD(Unit("14-5", "BlanketDonggua")) > holeD(Unit("14-6", "BlanketDonggua")) - 0.01, "14 被子一路往洞口拖");
assert.ok(DistXZ(Unit("14-4", "BlanketDonggua"), Unit("14-5", "BlanketDonggua")) >= 2 && DistXZ(Unit("14-4", "BlanketDonggua"), Unit("14-5", "BlanketDonggua")) <= 6, "14-5 被子挪了几米");
assert.ok(KF("14-4").player.stance === "crouch" && DistXZ(KF("14-4").player, Unit("14-4", "BlanketDonggua")) < 1.8 && DistXZ(Unit("14-4", "Nier"), Unit("14-4", "BlanketDonggua")) < 1.8, "14-4 顺子与妮儿各揪被子一角");
assert.ok(KF("14-5").player.stance === "prone" && DistXZ(Unit("14-5", "Nier"), Unit("14-5", "BlanketDonggua")) < 1.8 && Unit("14-5", "Nier").stance !== "prone", "14-5 顺子扑倒、妮儿没趴还攥着被角");
assert.ok(Unit("14-5", "BlanketDonggua").dragSolo === true && !Unit("14-4", "BlanketDonggua").dragSolo && !Unit("14-6", "BlanketDonggua").dragSolo, "14-5 单被 dragSolo（只剩妮儿攥着一个角）");
assert.ok(DistXZ(Unit("14-6", "Geng"), Unit("14-6", "BlanketDonggua")) < 1.8 && DistXZ(KF("14-6").player, Unit("14-6", "BlanketDonggua")) < 1.8, "14-6 老耿和顺子一人一角");
assert.ok(KF("14-4").pois.some((p) => p.id === "AidHoleA") && DistXZ(A.wallRootDonggua, holeA.mouth) >= 7 && DistXZ(A.wallRootDonggua, holeA.mouth) <= 14, "14 洞口在十几步外");
assert.ok(DistXZ(Unit("14-4", "LiuWencai"), P.aidGateIn) < 2.5 && Unit("14-4", "LiuWencai").aim, "14 刘文财在院门口朝天上打");

// --- 13 沟口 ---
for (const id of ["13-1", "13-2", "13-3", "14-1"]) {
  const t1 = Unit(id, "Tankette1"), t2 = Unit(id, "Tankette2");
  assert.ok(t1 && t2 && t1.kind === "tank" && t1.shape === "tankette" && t2.shape === "tankette", `${id} 两辆九四式（tankette）`);
  assert.ok(Math.max(t1.z, t2.z) + 1.7 < AT.z - AT.topW / 2, `${id} 车在沟北沿外`);
  assert.ok(KF(id).units.filter((u) => u.side === "ija" && u.group === "north" && u.kind !== "tank").length >= 6, `${id} 车后、坟头后、田埂后的步兵`);
  assert.ok(KF(id).units.filter((u) => u.group === "ditch727").length >= 6, `${id} 七二七团守沟口`);
}
assert.ok(DistXZ(KF("13-1").player, Unit("13-1", "Luo")) < 2 && Math.abs(KF("13-1").player.z - TR.east[1].z) < 0.5, "13-1 顺子跳回沟边的战壕，挨着班长");
assert.ok(KF("13-2").units.filter((u) => u.group === "runners").length >= 5 && KF("13-2").units.some((u) => u.group === "runners" && u.state === "down") && KF("13-2").units.some((u) => u.id === "Crawler" && u.z > PK.fromZ && u.z < PK.toZ), "13-2 撤下来的人往沟口跑，有的倒下、有的扑上板桥");
assert.ok(KF("13-3").player.stance === "prone" && KF("13-3").pois.some((p) => p.id === "Flare"), "13-3 信号弹、趴倒");
for (const id of ["12-4"]) assert.ok(KF(id).units.filter((u) => /^Helmet/.test(u.id)).every((u) => DistXZ(u, P.helmetsAt) < 4) && Unit(id, "Mg727"), "12-4 村南口冒出钢盔、七二七团的机枪");

// --- 12 穿村、救护所 ---
assert.ok(Unit("12-5", "OldMan") && DistXZ(Unit("12-5", "OldMan"), P.villageSouth) > 90 && KF("12-5").units.filter((u) => u.group === "family").length === 3, "12-5 老汉、钻洞的一家");
From(SIG.familyHidden, "12-6");
assert.ok(KF("12-6").pois.some((p) => p.id === "SleeperPile") && KF("12-6").pois.some((p) => p.id === "ChurchGate") && Unit("12-6", "ChurchKeeper"), "12-6 枕木垛、教堂门口");
assert.ok(Unit("12-7", "Girl") && DistXZ(Unit("12-7", "Girl"), GY.hole.mouth) < 1.5 && Unit("12-7", "Girl").z > A.box.maxZ, "12-7 隔壁院洞口的女娃");

// --- 15–17 ---
assert.ok(DistXZ(Unit("15-1", "BlanketDonggua"), { x: holeA.mouth.x + holeA.dir.x * (holeA.rampM + holeA.chamber.d / 2), z: holeA.mouth.z }) < 0.1, "15-1 冬瓜在洞内那一小间");
assert.ok(KF("15-1").player.stance === "crouch" && DistXZ(Unit("15-1", "Geng"), Unit("15-1", "BlanketDonggua")) < 0.8, "15-1 老耿跪着按毛巾、顺子蹲在洞里");
assert.ok(DistXZ(Unit("15-3", "BlanketDonggua"), P.xiangDoor) < 6 && Unit("15-3", "DoorGuard"), "15-3 厢房门口等着进");
assert.ok(DistXZ(KF("16-1").player, P.xiangDoor) < 0.5 && Unit("16-1", "LiuWencai").x > KF("16-1").player.x, "16-1 顺子在门槛上、刘文财在被尾");
assert.ok(DistXZ(Unit("17-1", "Doctor"), Unit("17-1", "Donggua")) < 0.7 && Unit("17-1", "Doctor").stance === "crouch", "17-1 医官跪在冬瓜旁边");
assert.ok(KF("17-2").player.stance === "crouch" && DistXZ(KF("17-2").player, A.thresholdSeat) < 0.05, "17-2 顺子坐门槛");
assert.ok(Unit("17-3", "Luo").path?.some((p) => Math.abs(p.x - P.aidGateOut.x) < 1.5) && DistXZ(Unit("17-3", "Luo"), KF("17-3").player) < 2.8, "17-3 班长从院门进来走到顺子跟前");

// --- 18 ---
From(SIG.girlHoleCovered, "18-2"); From(SIG.chargesSet, "18-4"); From(SIG.bridgeBlown, "18-6");
assert.ok(KF("18-1").units.filter((u) => u.group === "aidEvac" && u.kind === "litter").length === 3 && KF("18-1").units.filter((u) => /^AidDead/.test(u.id)).length >= 2, "18-1 担架一副副抬出去、屋里只剩盖着脸的");
assert.ok(Unit("18-2", "GirlMother") && DistXZ(Unit("18-2", "Geng"), Unit("18-2", "GirlMother")) < 12, "18-2 老耿冲隔壁那家洞口喊");
const onDeck18 = (id) => KF(id).units.filter((u) => OnRailBridge(u) && u.role !== "sapper" && u.z > RB.northZ + 0.7 && u.z < RB.southZ - 0.7);
assert.ok(onDeck18("18-3").length >= 4 && onDeck18("18-3").some((u) => u.kind === "litter") && onDeck18("18-3").some((u) => u.id === "Geng") && onDeck18("18-5").some((u) => u.id === "Yaowa"), "18-3 担架、老耿和兵在铁路桥桥面上；18-5 幺娃在桥面上");
assert.ok(KF("18-3").units.some((u) => u.kind === "litter" && u.z < RB.northZ) && KF("18-3").units.some((u) => u.kind === "litter" && u.z > RB.southZ) && KF("18-3").units.filter((u) => u.group === "waders").length >= 3, "18-3 担架在桥两头、老乡蹚水");
for (const uid of ["Wader2", "Wader3"]) { const w = Unit("18-3", uid), r = RiverAtX(w.x); assert.ok(Math.abs(w.z - r.streamZ) <= 3.5, `18-3 ${uid} 在那一股水里`); }
const last = ["Luo", "Yaowa", "HeYoutian", "Squad1", "Squad2"].map((id) => Unit("18-4", id));
assert.ok(last.every((u) => u.stance === "crouch" && u.z > BK.z && u.z < BK.hollow.toZ && u.x > BK.fromX && u.x < BK.toX), "18-4 班长他们缩在桥北土坎背后");
assert.ok(DistXZ(Unit("18-4", "IjaMg18"), P.ijaMg18) < 0.05 && Unit("18-4", "IjaMg18").weapon === "Type11" && Unit("18-4", "IjaMg18").arc, "18-4 田里那挺机枪");
assert.ok(KF("18-4").player.stance === "prone" && Math.abs(KF("18-4").player.z - LV.z) < 0.5, "18-4 顺子趴在河堤上");
for (const uid of ["Sapper1", "Sapper2"]) assert.ok(Math.abs(Unit("18-4", uid).x - RL.x) < 4 && Unit("18-4", uid).z > RB.northZ && Unit("18-4", uid).z < RB.southZ, `18-4 ${uid} 在桥墩上绑炸药`);
assert.ok(Unit("18-5", "IjaMg18").state === "down" && KF("18-5").player.stance === "stand", "18-5 机枪一哑、顺子站起来挥手");
for (const id of ["18-6", "18-7"]) assert.ok(["Luo", "Yaowa", "HeYoutian", "LiuWencai"].every((uid) => Unit(id, uid).z > RB.southZ), `${id} 全班过了河`);
assert.ok(KF("18-7").units.filter((u) => u.side === "ija").length >= 10 && KF("18-7").units.filter((u) => u.side === "ija").every((u) => u.z < RB.northZ) && KF("18-7").pois.some((p) => p.id === "VillageLights"), "18-7 鬼子在北岸过不来、村里亮灯");
assert.ok(DistXZ(KF("18-8").player, P.northGate) < 30 && Unit("18-8", "Guide") && Unit("18-8", "WaterMan"), "18-8 北门");

// --- 走位：过板桥、进厢房走门、去铁路桥走村西口 / 田间小路 / 土坡 ---
const toAid = StreetRoute({ x: 117, z: 548 }, P.aidGateOut);
assert.ok(toAid.some((p) => Math.abs(p.x - PK.x) < 0.3 && p.z >= PK.fromZ - 0.1 && p.z <= PK.toZ + 0.1), "从村南口到救护所要走板桥");
const toXiang = StreetRoute(P.aidGateOut, A.dongguaInside);
assert.ok(toXiang.some((p) => Math.abs(p.z - A.xiang.door.z) < 0.1 && p.x < A.xiang.box.maxX), "进厢房要走厢房门");
const toBridge = StreetRoute(P.aidGateOut, { x: RL.x, z: RB.southZ + 1.5 });
assert.ok(toBridge.some((p) => Math.abs(p.x - P.villageWest.x) < 0.3) && toBridge.some((p) => Math.abs(p.x - L1218_RAIL_RAMPS[0].to.x) < 0.3), "从救护所去铁路桥走村西口、上路基的土坡");
assert.ok(CART_LINE.length >= 12 && Math.hypot(CART_LINE.at(-1).x - P.aidGateOut.x, CART_LINE.at(-1).z - P.aidGateOut.z) < 0.1, "车走的那条线到救护所院门");

// --- 场景：脚下都在地面上、身子不进实心块、视线 ---
const scene = await LoadSceneLayout();
assert.ok(scene && !scene.error, `读不到场景文件：${scene?.error}`);
const sceneDoc = ReadBlockoutSceneDocSync("FirstLevel1218");
const PEOPLE = new Set(["soldier", "officer", "civilian", "child"]);
let onPlank = 0, inHole = 0, onRail = 0;
for (const kf of NormalizeBlockout(a).keyframes) {
  const stand = StandSampler(scene, kf.signals);
  const solids = SolidBlocks(sceneDoc, kf.signals);
  for (const u of kf.units) {
    if (!PEOPLE.has(u.kind) && u.kind !== "litter") continue;
    if (u.ride) continue;
    const terrain = scene.terrainSampler(u.x, u.z), y = stand(u.x, u.z);
    if (OnRailBridge(u) && u.role !== "sapper" && u.z > RB.northZ + 0.7 && u.z < RB.southZ - 0.7) { assert.ok(Math.abs(y - H.sleeperTopY) < 0.02, `${kf.id} ${u.id} 在铁路桥上要站在枕木顶（${y.toFixed(2)}）`); onRail++; continue; }
    assert.ok(y >= terrain - 1e-6 && y - terrain <= 1.0, `${kf.id} ${u.id} 脚下 ${y.toFixed(2)}（地形 ${terrain.toFixed(2)}）`);
    if (Math.abs(u.x - L1218_FROM_0610.river.centerX) < 4 && u.z < 576) assert.ok(y > -2.0, `${kf.id} ${u.id} 站进河汊子的深水里`);
    if (Math.abs(u.x - PK.x) < PK.w / 2 && u.z > PK.fromZ && u.z < PK.toZ) { assert.ok(y >= H.plankDeckY - 0.05, `${kf.id} ${u.id} 掉进村口沟了`); onPlank++; }
    if (y < H.holeFloorY + 0.1) inHole++;
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
}
assert.ok(onPlank >= 2 && inHole >= 4 && onRail >= 5, `板桥上、洞里、铁路桥上的人都查到了（板桥 ${onPlank}、洞里 ${inHole}、铁路桥 ${onRail}）`);
const EYE = { stand: 1.62, crouch: 1.05, prone: 0.5, child: 1.0 };
const Sight = (kfId, target, targetEye, from = null, fromEye = null) => {
  const kf = KF(kfId), solids = SolidBlocks(sceneDoc, kf.signals), stand = StandSampler(scene, kf.signals);
  const src = from || kf.player;
  const eye = { x: src.x, z: src.z, eye: stand(src.x, src.z) - scene.terrainSampler(src.x, src.z) + (fromEye ?? EYE[src.stance || "stand"]) };
  const tgt = { x: target.x, z: target.z, eye: stand(target.x, target.z) - scene.terrainSampler(target.x, target.z) + targetEye };
  return { block: BlockSight(solids, scene.terrainSampler, eye, tgt), ground: SightBlock(scene.terrainSampler, eye, tgt).block };
};
const Clear = (kfId, target, eye, what, from = null, fromEye = null) => { const r = Sight(kfId, target, eye, from, fromEye); assert.ok(r.block === null && r.ground <= 0, `${what}：${r.block ? `被 ${r.block.id} 挡` : `地面挡 ${r.ground}`}`); };
Clear("11-1", P.plankNorth, 1.6, "11-1 站在村南口往南看得见村口那一带");
Clear("12-4", Unit("12-4", "Heizi"), 1.2, "12-4 看得见板桥头的黑子");
Clear("13-1", Unit("13-1", "Tankette1"), 1.2, "13-1 战壕里看得见沟北边的车");
Clear("12-7", Unit("12-7", "Girl"), 1.0, "12-7 妮儿越过塌了的院墙看得见洞口的女娃", Unit("12-7", "Nier"), EYE.child);
Clear("14-5", Unit("14-5", "Nier"), 1.0, "14-5 顺子趴着要看得见攥着被角的妮儿");
Clear("14-5", Unit("14-5", "Donggua"), 0.3, "14-5 顺子要看得见被子上的冬瓜");
Clear("14-5", KF("14-5").player, 0.5, "14-5 院门口的刘文财看得见这边", Unit("14-5", "LiuWencai"));
Clear("16-1", A.dongguaInside, 0.3, "16-1 看得见厢房里放被子的地方");
Clear("18-4", Unit("18-4", "IjaMg18"), 0.4, "18-4 河堤上趴着看得见田里那挺机枪");
{ const r = Sight("18-4", Unit("18-4", "Luo"), EYE.crouch, Unit("18-4", "IjaMg18")); assert.ok(r.ground > 0.05 || r.block, `18-4 机枪看不见土坎后的班长（地面挡 ${r.ground}）`); }
Clear("18-7", Unit("18-7", "BankIja2"), 1.6, "18-7 河堤上看得见北岸路基上的鬼子");

const file = new URL("./Blockout/FirstLevel1218.json", import.meta.url);
if (fs.existsSync(file)) {
  const onDisk = JSON.parse(fs.readFileSync(file, "utf8"));
  if (Strip({ ...onDisk, source: { ...onDisk.source, commit: "test" } }) !== Strip(a)) console.log("提示：Blockout/FirstLevel1218.json 与生成器输出不同（手改过，或没重新 export）");
  // 盘上的 JSON 没有生成器的内部标记（躺在担架 / 被子上、照料、下战壕 / 过桥），按手改的口径查只该多报这一类
  const known = /Donggua 站在 (LitterDonggua|BlanketDonggua)|Wounded\d 站在 CartLitter\d|重叠|Doctor 站在 BlanketDonggua|Geng 站在 BlanketDonggua|1 m 内高差/;
  const extra = FirstLevel1218Issues(onDisk, { scene }).filter((line) => !known.test(line));
  assert.deepEqual(extra, [], `盘上的 JSON 多报了：\n  ${extra.join("\n  ")}`);
}
console.log(`FirstLevel1218 关键帧：${a.keyframes.length} 帧、${a.keyframes.reduce((s, k) => s + k.units.length, 0)} 个单位位次，校验、摆位、视线全过`);
