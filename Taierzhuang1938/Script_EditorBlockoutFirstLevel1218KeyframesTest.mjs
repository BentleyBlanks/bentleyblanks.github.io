// Script_EditorBlockoutFirstLevel1218KeyframesTest.mjs —— 11–18 白盒（第四版，北沙河村，2026-11-02）关键帧生成器的 node 回归
// 跑法：node Taierzhuang1938/Script_EditorBlockoutFirstLevel1218KeyframesTest.mjs
// 查：生成两次除 generatedAt 外逐字相同、过 ValidateBlockout 且无警告、摆位 / 走位问题为零（读场景取出来的那一块连实心块、高差、深水一起查）、
// 33 帧（11-1…18-8）齐全、名字按契约、信号按拍起（含 ChargesSet 18-3）、所有人脚下在地面上（高度场或 ≤ 1 m 的块顶：板桥门板、门槛；铁路桥 / 官道桥桥面是 standOn）、身子不进实心块；
// 百姓一律程序化身体、只有 14-4…14-6 妮儿、14-6 / 15-1 / 17-1 老耿、15-3 妮儿是骨骼身体；七二七团的人名字里带「二营」「三营」；
// 冬瓜 11-1…12-6 在车上的担架上、12-7…17-3 躺在自己那床单被上、17 起盖着脸不动、18 起留在厢房里；车只到 14-2（12-7 起停在门前空地；14-3 起翻在门前，黑子倒地到 18-2，18-3 起不摆）；
// 台词照契约第三节原字；没有第三版删掉的旧戏；13 没有装甲车、是步兵 + 两挺机枪 + 掷弹筒；几条关键视线；走位走板桥、走南街、走门、上下路基走土坡；桥面上的人站在枕木顶。

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
  L1218_CART_PARK as CPK, L1218_RAIL as RL, L1218_RAIL_BRIDGE as RB, L1218_BANK as BK, L1218_GIRL_YARD as GY, L1218_GUANDAO_BRIDGE as GB, L1218_FROM_0610,
  L1218_RAIL_RAMPS, L1218_ROADS, RiverAtX, StripFrame,
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
const NAMES = { "11-1": "出胡同口", "11-2": "往北沙河撤", "12-1": "路上", "12-2": "炮停", "12-3": "沟口", "12-4": "黑子不走", "12-5": "穿村", "12-6": "南街口", "12-7": "救护所",
  "13-1": "回沟口", "13-2": "有人往沟口跑", "13-3": "信号弹", "14-1": "两拨飞机", "14-2": "往回跑", "14-3": "院门口的驴", "14-4": "揪被角", "14-5": "松手", "14-6": "拖进洞里",
  "15-1": "洞里", "15-2": "抬到厢房门口", "15-3": "等着进", "16-1": "门槛", "17-1": "没了", "17-2": "舅舅的信", "17-3": "起来",
  "18-1": "命令", "18-2": "隔壁院", "18-3": "出村、铁路桥", "18-4": "南头等", "18-5": "快过来", "18-6": "炸桥", "18-7": "对岸", "18-8": "夜里" };
for (const kf of a.keyframes) {
  assert.equal(kf.stage, Number(kf.id.split("-")[0]), `${kf.id} 的 stage`);
  assert.equal(kf.stageLabel, LABELS[kf.id], `${kf.id} 的 stageLabel`);
  assert.equal(kf.name, NAMES[kf.id], `${kf.id} 的名字按契约`);
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

// --- 信号按拍起（契约 2.6）---
From(SIG.guandaoBridgeBlown, "13-2"); From(SIG.dugoutBombed, "14-2"); From(SIG.cartOverturned, "14-3"); From(SIG.raidAftermath, "15-1");
From(SIG.girlHoleCovered, "18-2"); From(SIG.chargesSet, "18-3"); From(SIG.bridgeBlown, "18-6");
for (const id of IDS) assert.ok(!KF(id).signals.includes("FamilyHidden"), `${id} 不该有 FamilyHidden`);

// --- 台词照契约第三节原字 ---
assert.ok(Has("11-2", "冬瓜，撑到。到了就有军医。") && Has("11-2", "往北沙河撤！七二七团在那！车拉伤员，跟斗走！"), "11-2");
assert.ok(Has("12-1", "……到了没得？") && Has("12-1", "快了！") && Has("12-1", "顺儿……钱……揣好没得？") && Has("12-1", "揣到的。") && Has("12-1", "我舅的信……也在我这儿。……莫跟别个讲。"), "12-1");
assert.ok(Has("12-2", "狗日的进了老耿家了！") && Has("12-2", "莫看了！走！"), "12-2");
assert.ok(Has("12-3", "站到！哪部分的？") && Has("12-3", "前头撤下来的！车上是伤兵！后头鬼子撵过来了，还有小铁车！") && Has("12-3", "晓得。沟就是挖给铁王八的。") && Has("12-3", "去，喊工兵把官道桥炸了！")
  && Has("12-3", "伤兵往村西南头送，救护所在那。你们几个留到这儿，后头还有人要撤进来。") && Has("12-3", "班长，我送冬瓜过去！") && Has("12-3", "文财，你跟到他。送到了，两个都给老子回来。"), "12-3");
assert.ok(Has("12-6", "……过了河……就是县城嗦？") && Has("12-6", "嗯。过了河就是。"), "12-6");
assert.ok(Has("12-7", "肚子上的，莫给他喝水。") && Has("12-7", "搁墙根。天黑了跟车送城里，城里才开得了刀。") && Has("12-7", "天黑哪个送？") && Has("12-7", "哪个闲到哪个送。") && Has("12-7", "我送！")
  && Has("12-7", "……水……") && Has("12-7", "先生说的，莫喝。") && Has("12-7", "……这下好……你跟斗伤兵走……哪个管得到。") && Has("12-7", "走了。班长等到的。") && Has("12-7", "顺儿。") && Has("12-7", "天黑我就来。天黑我送你进城。"), "12-7");
assert.ok(Has("13-2", "官道桥炸了！") && Has("13-2", "……桥。") && Has("13-2", "看你妈啥子！打！"), "13-2");
assert.ok(Has("13-3", "飞机！趴倒！") && Has("14-2", "文财！跟到他！") && Has("14-4", "冬瓜！把他弄过来！"), "13 / 14 的喊话");
assert.ok(/6 架|六架/.test(KF("14-1").what + KF("14-1").how.join("")) && /第一拨/.test(KF("14-1").how.join("")) && /第二拨/.test(KF("14-1").how.join("")), "14-1 六架分两拨");
assert.ok(Has("15-1", "你松你妈啥子手！") && Has("15-1", "龟儿子……手恁个滑……") && Has("15-1", "……八个……抵了。") && Has("15-1", "抵个锤子……到了汉口，你拿钱还老子。") && Has("15-1", "老人家，你牵到她。我来。"), "15A");
assert.ok(Has("15-3", "等到！里头满起了！挤你妈啥子！") && Has("15-3", "兄弟，让一哈，他等不得了……") && Has("15-3", "哪个等得？等到！") && Has("15-3", "你挤进去他就活了？") && Has("15-3", "画的黑子嗦？")
  && Has("15-3", "一个壳子三四钱重，四五十个才一斤。收破烂的，一斤给你几个铜板……") && Has("15-3", "你攒到出嫁，也换不到一条驴腿。") && Has("15-3", "……犟。") && Has("15-3", "下一副！"), "15C");
assert.ok(Has("16-1", "又挨了？抬进来！表堵到门口！") && Has("16-1", "脚……慢点。") && Has("16-1", "……有门槛。抬高点。"), "16");
assert.ok(Has("17-1", "……没了。") && Has("17-1", "下一副！表堵到门！") && Has("17-1", "刚才过门槛，还在说话……") && Has("17-1", "单被扯上来盖住他的脸"), "17-1");
assert.ok(Has("17-2", "钱袋") && Has("17-2", "信"), "17-2 舅舅的信");
assert.ok(Has("17-3", "咋个搞的？") && Has("17-3", "……飞机。") && Has("17-3", "狗日的。") && Has("17-3", "顺儿。") && Has("17-3", "……起来，跟斗走。") && Has("17-3", "钱袋"), "17-3");
assert.ok(Has("18-1", "命令下来了：三营今晚回城，伤兵跟三营走，过了铁路桥就炸。城里说汤军团在路上了。") && Has("18-1", "在路上？日他妈，老子也在路上。") && Has("18-1", "你们二营喃？") && Has("18-1", "守到这儿。")
  && Has("18-1", "你们跟三营走，把伤兵给我送进城。") && Has("18-1", "顺儿，你跟担架走。我们殿后，到桥南头等到老子。") && Has("18-1", "撤的时候乱，我嗯两个跟斗伤兵走，哪个管得到？") && Has("18-1", "01 的原录音") && Has("18-1", "……要得。"), "18A");
assert.ok(Has("18-2", "走了。") && Has("18-2", "走啊！鬼子要来了！"), "18A 隔壁院");
assert.ok(Has("18-4", "……哪个管得到。") && Has("18-4", "炸！不等了！") && Has("18-4", "班长他们还在后头！") && Has("18-4", "鬼子都摸到路基上了！") && Has("18-4", "再等一哈！……顺儿！那挺机枪！"), "18C");
assert.ok(Has("18-5", "快过来！快过来！") && Has("18-5", "不说话") && Has("18-6", "点！") && Has("18-7", "二营的……") && Has("18-7", "走！"), "18C 炸桥 / 对岸");
assert.ok(Has("18-8", "老人家，跟到我们进城做啥子？鬼子明天就撵到城底下了。") && Has("18-8", "……城里有城墙，比庄上牢靠。") && Has("18-8", "……进了城再说。") && Has("18-8", "1938年3月14日 夜"), "18 夜里");
// 删掉的旧戏（第三版有、第四版不要）；班长那句台词里的「小铁车」留着
const BAN = /老汉|钻洞|北门|九四式|小铁车|后头没得人了|排到|医官|你嗯往哪儿走|火把|门洞|有地方歇脚|送到了就回来|田间小路|村西口|tankette|Tankette|石板桥|渡口|浮桥|墙豁子|FamilyHidden/;
for (const id of IDS) {
  const text = JSON.stringify(KF(id)).replace("后头鬼子撵过来了，还有小铁车！", "");
  const hit = text.match(BAN);
  assert.ok(!hit, `${id} 还有第三版的旧戏 / 不要的词：${hit?.[0]}`);
}

// --- 身体：百姓一律程序化；只有拖被子 / 跪 / 蹲着画驴那几帧是骨骼身体 ---
const RIG = new Set(["14-4/Nier", "14-5/Nier", "14-6/Nier", "14-6/Geng", "15-1/Geng", "15-3/Nier", "17-1/Geng"]);
for (const kf of a.keyframes) for (const u of kf.units) {
  if (u.side !== "civ" || !["civilian", "child"].includes(u.kind)) { assert.ok(!u.body, `${kf.id} ${u.id} 不是百姓不该有 body`); continue; }
  assert.equal(u.body, RIG.has(`${kf.id}/${u.id}`) ? "rig" : "procedural", `${kf.id} ${u.id} 的身体`);
}
for (const id of IDS) { assert.ok(Unit(id, "Geng")?.kind === "civilian", `${id} 老耿要在`); assert.ok(Unit(id, "Nier")?.kind === "child", `${id} 妮儿要在`); }
for (const [id, uid] of [["12-5", "ElderCarrier"], ["12-7", "Girl"], ["14-2", "StreetWoman"], ["15-3", "BurnedMother"], ["18-2", "GirlMother"], ["18-3", "Wader2"], ["18-8", "Refugee1"]]) assert.ok(Unit(id, uid)?.side === "civ" && Unit(id, uid).body === "procedural", `${id} ${uid} 程序化身体`);
for (const uid of ["Sentry", "Captain"]) assert.ok(Unit("12-3", uid)?.side === "nra" && /二营/.test(Unit("12-3", uid).name), `12-3 ${uid} 是二营的（名字带「二营」）`);
assert.equal(Unit("12-3", "Captain").castId, "frontOfficer", "二营连长的定妆 frontOfficer");
assert.ok(Unit("12-7", "Doctor")?.name === "军医" && Unit("12-7", "Doctor").weapon === null && Unit("12-7", "Doctor").stance === "crouch" && DistXZ(Unit("12-7", "Doctor"), A.wallRootDonggua) < 0.8, "12-7 军医空手、蹲在冬瓜身边处理");
assert.ok(Unit("18-3", "Sapper1")?.name === "工兵" && /三营/.test(Unit("18-4", "Officer18").name) && KF("18-3").units.filter((u) => /三营/.test(u.name || "") || u.group === "bridge3rd").length >= 3, "工兵、三营军官、三营守桥头");
for (const kf of a.keyframes) for (const u of kf.units) assert.ok(!/七二七团(兵|哨兵|连长|军官|机枪)/.test(u.name || ""), `${kf.id} ${u.id} 的名字要用「二营 / 三营」区分：${u.name}`);
for (const uid of ["Guide", "WaterMan", "OldMan", "Fam1", "Tankette1", "Tankette2"]) for (const id of IDS) assert.ok(!Unit(id, uid), `${id} 不该有 ${uid}`);

// --- 车、黑子、车上的东西 ---
for (const id of IDS) assert.equal(!!Unit(id, "GengCart"), IDS.indexOf(id) <= IDS.indexOf("14-2"), `${id} 立着的驴车只到 14-2（14-3 起翻在门前）`);
for (const id of IDS.slice(IDS.indexOf("12-7"), IDS.indexOf("14-2") + 1)) assert.ok(DistXZ(Unit(id, "GengCart"), CPK.cart) < 0.05 && DistXZ(Unit(id, "Heizi"), CPK.heizi) < 0.05 && Unit(id, "GengCart").yawDeg === CPK.yawDeg, `${id} 车和黑子停在救护所门前空地、车头朝南`);
for (const id of IDS.slice(0, IDS.indexOf("18-2") + 1)) assert.ok(Unit(id, "Heizi")?.kind === "animal", `${id} 黑子要在`);
for (const id of IDS.slice(IDS.indexOf("14-3"), IDS.indexOf("18-2") + 1)) assert.ok(Unit(id, "Heizi").state === "down" && DistXZ(Unit(id, "Heizi"), CPK.heizi) < 1.5, `${id} 黑子倒在救护所门前`);
for (const id of IDS.slice(IDS.indexOf("18-3"))) assert.ok(!Unit(id, "Heizi"), `${id} 黑子和车留在村里`);
assert.ok(CART_LINE.length >= 12 && DistXZ(CART_LINE.at(-1), CPK.cart) < 0.1 && DistXZ(CART_LINE[0], P.villageSouth) < 0.1, "车走的那条线从村南口到门前空地的停车处");
for (const p of [P.junction, P.plankMid, P.southStreetCorner, P.southStreetMid]) assert.ok(CART_LINE.some((q) => DistXZ(p, q) < 0.1), `车走的线路过 (${p.x},${p.z})`);
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
assert.ok(DistXZ(KF("12-6").player, P.southStreetCorner) < 0.1 && Unit("12-6", "GengCart").x < P.southStreetCorner.x, "12-6 顺子在南街口，车往西拐进南街");

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
assert.ok(DistXZ(KF("14-3").player, P.heizi) < 5 && Unit("14-3", "Heizi").state === "down", "14-3 顺子在翻倒的车边停了一步");

// --- 13 沟口：没有装甲车，是步兵 + 两挺轻机枪 + 掷弹筒 ---
const ditchZ = (x) => { const L = AT.line; for (let i = 1; i < L.length; i++) if (x >= L[i - 1].x && x <= L[i].x) return L[i - 1].z + (L[i].z - L[i - 1].z) * (x - L[i - 1].x) / (L[i].x - L[i - 1].x); return L[0].z; };
for (const id of ["13-1", "13-2", "13-3", "14-1"]) {
  const north = KF(id).units.filter((u) => u.side === "ija" && u.group === "north");
  assert.ok(!KF(id).units.some((u) => u.kind === "tank"), `${id} 没有装甲车`);
  assert.ok(north.filter((u) => u.role === "machineGun" && u.weapon === "Type11").length >= 2, `${id} 沟北两挺轻机枪`);
  assert.ok(north.some((u) => u.role === "grenadier"), `${id} 沟北一具掷弹筒`);
  assert.ok(north.filter((u) => u.role === "rifleman").length >= 6, `${id} 沟北 ≥ 6 个步兵`);
  assert.ok(north.every((u) => u.z < ditchZ(u.x) - AT.topW / 2 - 1), `${id} 鬼子都在沟北沿外`);
  assert.ok(KF(id).units.filter((u) => u.group === "ditch2nd").length >= 6, `${id} 二营守沟口`);
}
assert.ok(DistXZ(KF("13-1").player, Unit("13-1", "Luo")) < 2 && DistXZ(KF("13-1").player, Unit("13-1", "LiuWencai")) < 3 && Math.abs(KF("13-1").player.z - TR.east[1].z) < 1.5, "13-1 顺子、刘文财跳回沟口东段战壕挨着班长");
assert.ok(KF("13-2").units.filter((u) => u.group === "runners").length >= 5 && KF("13-2").units.some((u) => u.group === "runners" && u.state === "down") && KF("13-2").units.some((u) => u.id === "Crawler" && u.z > PK.fromZ && u.z < PK.toZ && u.stance === "prone"), "13-2 撤下来的人往沟口跑，有的倒下、有的扑上板桥爬");
assert.ok(KF("13-2").pois.some((p) => p.id === "GuandaoBlown" && DistXZ(p, P.guandaoBridgeMid) < 0.1), "13-2 官道桥炸了（POI 指官道桥）");
assert.ok(KF("13-3").player.stance === "prone" && KF("13-3").pois.some((p) => p.id === "Flare" && DistXZ(p, P.flareAt) < 0.1), "13-3 信号弹、趴倒");
assert.ok(KF("14-1").pois.some((p) => p.id === "Wave1") && KF("14-1").pois.some((p) => p.id === "Wave2") && KF("14-1").units.filter((u) => u.group === "ditch2nd" && u.state === "down").length >= 2, "14-1 两拨飞机、壕里倒两个二营兵");
assert.ok(KF("12-4").units.filter((u) => /^Helmet/.test(u.id)).every((u) => DistXZ(u, P.helmetsAt) < 4) && Unit("12-4", "Mg727"), "12-4 村南口冒出钢盔、二营的机枪");
assert.ok(!Has("13-1", "掩护") && !/掩护|清理|护送/.test(KF("13-1").next.text), "13-1 next 不写掩护 / 清理 / 护送");

// --- 12 穿村、南街口、救护所 ---
assert.ok(KF("12-5").units.filter((u) => u.group === "boards").length >= 2 && KF("12-5").pois.some((p) => p.id === "Slogan") && KF("12-5").pois.some((p) => p.id === "SleeperPile") && Unit("12-5", "ElderCarrier") && DistXZ(Unit("12-5", "ElderCarrier"), P.churchGateOut) < 0.1, "12-5 扛门板的兵、标语、枕木垛、教堂门口背老人的");
assert.ok(!/：「/.test(KF("12-5").how.join("") + KF("12-5").what), "12-5 不说话（没有人物台词）");
const gbf = StripFrame({ a: GB.north, b: GB.south, side: 1 });
const OnGuandao = (p) => { const dx = p.x - GB.north.x, dz = p.z - GB.north.z, s = dx * gbf.u.x + dz * gbf.u.z, d = dx * gbf.n.x + dz * gbf.n.z; return s > 1 && s < gbf.len - 1 && Math.abs(d) < GB.deckW / 2; };
assert.ok(KF("12-6").units.filter((u) => u.group === "bridgeRunners" && OnGuandao(u)).length >= 2, "12-6 官道桥上有几个抱东西跑的兵");
assert.ok(Unit("12-7", "Girl") && DistXZ(Unit("12-7", "Girl"), GY.hole.mouth) < 1.5 && Unit("12-7", "Girl").z > A.box.maxZ, "12-7 隔壁院洞口的女娃");
assert.ok(KF("14-2").player.z > 770 && KF("14-2").player.z < 785 && DistXZ(KF("14-2").player, P.southStreetWest) < 16 && Unit("14-2", "StreetWoman") && Unit("14-2", "LiuWencai") && KF("14-2").pois.some((p) => p.id === "BombedHole"), "14-2 顺子在南街上，女人拖着孩子，刘文财跟在后头");

// --- 15–17 ---
assert.ok(DistXZ(Unit("15-1", "BlanketDonggua"), { x: holeA.mouth.x + holeA.dir.x * (holeA.rampM + holeA.chamber.d / 2), z: holeA.mouth.z }) < 0.1, "15-1 冬瓜在洞内那一小间");
assert.ok(KF("15-1").player.stance === "crouch" && DistXZ(Unit("15-1", "Geng"), Unit("15-1", "BlanketDonggua")) < 0.8, "15-1 老耿跪着按毛巾、顺子蹲在洞里");
assert.ok(DistXZ(Unit("15-3", "BlanketDonggua"), P.xiangDoor) < 6 && Unit("15-3", "DoorGuard") && KF("15-3").units.filter((u) => u.group === "queue" && u.kind === "litter").length >= 2 && Unit("15-3", "BurnedChild"), "15-3 厢房门口一副挨一副等着进、烧伤的孩子和他娘");
assert.ok(DistXZ(KF("16-1").player, P.xiangDoor) < 0.5 && Unit("16-1", "LiuWencai").x > KF("16-1").player.x, "16-1 顺子在门槛上、刘文财在被尾");
assert.ok(DistXZ(Unit("17-1", "Doctor"), Unit("17-1", "Donggua")) < 0.7 && Unit("17-1", "Doctor").stance === "crouch", "17-1 军医跪在冬瓜旁边");
assert.ok(KF("17-2").player.stance === "crouch" && DistXZ(KF("17-2").player, A.thresholdSeat) < 0.05 && KF("17-2").units.filter((u) => u.group === "passing2nd").length >= 2, "17-2 顺子坐门槛、院门外二营的兵一拨拨跑过");
assert.ok(Unit("17-3", "Luo").path?.some((p) => Math.abs(p.x - P.aidGateOut.x) < 1.5) && DistXZ(Unit("17-3", "Luo"), KF("17-3").player) < 2.8, "17-3 班长从院门进来走到顺子跟前");

// --- 18 ---
assert.ok(KF("18-1").units.filter((u) => u.group === "aidEvac" && u.kind === "litter").length === 3 && KF("18-1").units.filter((u) => /^AidDead/.test(u.id)).length >= 2 && /二营/.test(Unit("18-1", "Captain").name), "18-1 二营连长进院、担架一副副抬出去、屋里只剩盖着脸的");
assert.ok(Unit("18-2", "GirlMother") && DistXZ(Unit("18-2", "Geng"), Unit("18-2", "GirlMother")) < 12 && Unit("18-2", "Geng").z > A.box.maxZ - 3 && DistXZ(Unit("18-2", "HeYoutian"), KF("18-2").player) < 2.5, "18-2 老耿隔着塌墙冲女娃家洞口喊；何有田在顺子后头");
assert.ok(DistXZ(KF("18-3").player, P.bridgeNorth) < 8 || DistXZ(KF("18-3").player, P.railRampTop) < 8, "18-3 顺子在铁路桥北头路基上");
const onDeck18 = (id) => KF(id).units.filter((u) => OnRailBridge(u) && u.role !== "sapper" && u.z > RB.northZ + 0.7 && u.z < RB.southZ - 0.7);
assert.ok(onDeck18("18-3").length >= 4 && onDeck18("18-3").some((u) => u.kind === "litter") && onDeck18("18-3").some((u) => u.id === "Geng") && onDeck18("18-3").some((u) => u.id === "Nier") && onDeck18("18-5").some((u) => u.id === "Yaowa"), "18-3 担架、老耿牵妮儿和兵在铁路桥桥面上；18-5 幺娃在桥面上");
assert.ok(KF("18-3").units.some((u) => u.kind === "litter" && u.z < RB.northZ) && KF("18-3").units.some((u) => u.kind === "litter" && u.z > RB.southZ) && KF("18-3").units.filter((u) => u.group === "waders").length >= 3, "18-3 担架在桥两头、老乡蹚水");
for (const uid of ["Wader2", "Wader3"]) { const w = Unit("18-3", uid), r = RiverAtX(w.x); assert.ok(Math.abs(w.z - r.stream.z) <= 3.5, `18-3 ${uid} 在那一股水里`); }
for (const uid of ["Sapper1", "Sapper2"]) assert.ok(Math.abs(Unit("18-3", uid).x - RL.x) < 4 && Unit("18-3", uid).z > RB.northZ && Unit("18-3", uid).z < RB.northZ + (RB.southZ - RB.northZ) / 2 + 1, `18-3 ${uid} 在北头的桥墩上绑炸药`);
for (const id of ["18-3", "18-4"]) assert.ok(KF(id).pois.some((p) => p.id === "Sappers"), `${id} 工兵 POI`);
assert.ok(KF("18-3").pois.some((p) => p.id === "Lizihang") && KF("18-3").pois.some((p) => p.id === "SunWest") && KF("18-3").pois.some((p) => p.id === "RaidMats"), "18-3 李子行空了、太阳落到铁路那头、盖席子的一排人");
// 18 引导（第二轮）：18-3 的 POI 指路边三处小场景与新的夕阳方向、电线杆；how 写了担架队在前 / 刘文财在后 / 落后就停下等；刘文财在顺子身后、押队的兵回头等；18-8 马灯
{ const Poi3 = (id) => KF("18-3").pois.find((p) => p.id === id);
  assert.ok(Poi3("RaidWall") && DistXZ(Poi3("RaidWall"), P.roadsideYard) < 0.1 && Poi3("RaidMats") && DistXZ(Poi3("RaidMats"), P.roadsideMats) < 0.1 && Poi3("LiziGate") && DistXZ(Poi3("LiziGate"), P.liziSouthGate) < 0.1, "18-3 三处路边小场景的 POI（孤院、土墙席子、李子行院门）");
  assert.ok(DistXZ(Poi3("SunWest"), P.sunWest) < 0.1 && P.sunWest.x >= B.minX && Poi3("Telegraph"), "18-3 夕阳 POI 就是 sunWest（在场地里）、电线杆 POI");
  for (const p of [Poi3("RaidWall"), Poi3("RaidMats"), Poi3("LiziGate")]) {
    let best = Infinity; const L = L1218_ROADS.northBank.line;
    for (let i = 1; i < L.length; i++) { const a0 = L[i - 1], b0 = L[i], dx = b0.x - a0.x, dz = b0.z - a0.z, l2 = dx * dx + dz * dz, k = Math.max(0, Math.min(1, ((p.x - a0.x) * dx + (p.z - a0.z) * dz) / l2)); best = Math.min(best, Math.hypot(p.x - a0.x - dx * k, p.z - a0.z - dz * k)); }
    assert.ok(best <= 16, `18-3 POI ${p.id} 要在北岸土路边（离中线 ${best.toFixed(1)} m；孤院的看点是院里冒烟的房梁，离路 14 m）`);
  }
  const how3 = KF("18-3").how.join("\n");
  for (const w of ["担架队排成一溜走在顺子前头", "刘文财跟在顺子后头", "落后十来米，队头就停下", "回头等", "夕阳正落在铁路桥那头", "电线杆", "孤零零的院子", "盖着席子露着脚", "门板歪着", "一只鞋"]) assert.ok(how3.includes(w), `18-3 how 要写「${w}」`);
  const pl3 = KF("18-3").player, liu = Unit("18-3", "LiuWencai"), rear = Unit("18-3", "B3Rear");
  assert.ok(liu && DistXZ(liu, P.bridgeNorth) > DistXZ(pl3, P.bridgeNorth) + 2 && DistXZ(liu, pl3) < 9, "18-3 刘文财跟在顺子后头（离桥头比顺子远）");
  assert.ok(rear && /押队/.test(rear.name) && DistXZ(rear, P.bridgeNorth) < DistXZ(pl3, P.bridgeNorth) && Math.abs(((rear.yawDeg - Math.atan2(-(pl3.x - rear.x), -(pl3.z - rear.z)) * 180 / Math.PI + 540) % 360) - 180) < 25, "18-3 押队的三营兵在顺子前头、回头看着他");
  assert.ok(Unit("18-3", "AidLitter3") && DistXZ(Unit("18-3", "AidLitter3"), P.bridgeNorth) < DistXZ(pl3, P.bridgeNorth) && Unit("18-3", "Doctor") && DistXZ(Unit("18-3", "Doctor"), P.bridgeNorth) < DistXZ(pl3, P.bridgeNorth), "18-3 队尾那副担架和军医在顺子前头");
  assert.ok(KF("18-8").how.join("\n").includes("马灯") && /马灯/.test(KF("18-8").notes), "18-8 前头队伍里有人提着马灯（how + notes 说明挂不了手持道具）"); }
const last = ["Luo", "Yaowa", "HeYoutian", "Squad1", "Squad2"].map((id) => Unit("18-4", id));
assert.ok(last.every((u) => u.stance === "crouch" && u.z > BK.z && u.z < BK.hollow.toZ && u.x > BK.fromX && u.x < BK.toX), "18-4 班长他们缩在桥北土坎背后");
assert.ok(DistXZ(Unit("18-4", "IjaMg18"), P.ijaMg18) < 0.05 && Unit("18-4", "IjaMg18").weapon === "Type11" && Unit("18-4", "IjaMg18").arc, "18-4 路基脚那挺机枪");
assert.ok(KF("18-4").player.stance === "prone" && DistXZ(KF("18-4").player, P.leveePlayer) < 0.1 && Unit("18-4", "LiuWencai").stance === "prone", "18-4 顺子、刘文财趴在河堤上");
assert.ok(KF("18-4").units.filter((u) => u.group === "aidEvac").every((u) => u.z > 975) && Unit("18-4", "Geng").z > 975 && Unit("18-4", "Nier").z > 975, "18-4 担架一副副往南走进黑地，老耿牵着妮儿跟在后头");
assert.ok(Unit("18-5", "IjaMg18").state === "down" && KF("18-5").player.stance === "stand", "18-5 机枪一哑、顺子站起来挥手");
for (const id of ["18-6", "18-7"]) assert.ok(["Luo", "Yaowa", "HeYoutian", "LiuWencai", "Squad1", "Squad2"].every((uid) => Unit(id, uid).z > RB.southZ), `${id} 全班过了河`);
assert.ok(KF("18-7").units.filter((u) => u.side === "ija").length >= 10 && KF("18-7").units.filter((u) => u.side === "ija").every((u) => u.z < RB.northZ) && KF("18-7").pois.some((p) => p.id === "VillageGuns"), "18-7 鬼子都在北岸过不来、村那头枪声");
const civ188 = KF("18-8").units.filter((u) => u.side === "civ" && ["civilian", "child"].includes(u.kind) && !["Geng", "Nier"].includes(u.id));
assert.ok(DistXZ(KF("18-8").player, P.southRoadMid) < 30 && civ188.length >= 2 && KF("18-8").units.some((u) => u.kind === "litter") && KF("18-8").pois.some((p) => p.id === "CityLights" && DistXZ(p, P.cityLights) < 0.1), "18-8 夜里南岸路上的队伍：百姓、担架、县城的灯");
assert.ok(KF("18-8").units.every((u) => Math.abs(u.x - L1218_ROADS.southRoad.line[2].x) < 20 && u.z > 985), "18-8 队伍都在南岸路上");

// --- 走位：过板桥、走南街、进厢房走门、去铁路桥走出村小路 / 北岸土路 / 土坡 ---
const toAid = StreetRoute({ x: P.villageSouth.x, z: P.villageSouth.z + 3 }, P.aidGateOut);
assert.ok(toAid.some((p) => Math.abs(p.x - PK.x) < 0.3 && p.z >= PK.fromZ - 0.1 && p.z <= PK.toZ + 0.1) || toAid.some((p, i) => i && Math.abs(p.x - PK.x) < 0.3 && toAid[i - 1].z < PK.fromZ && p.z > PK.toZ), "从村南口到救护所要走板桥");
assert.ok(toAid.some((p) => DistXZ(p, P.southStreetMid) < 2), "从村南口到救护所走南街（经过 (121,783)）");
const toXiang = StreetRoute(P.aidGateOut, A.dongguaInside);
assert.ok(toXiang.some((p) => Math.abs(p.z - A.xiang.door.z) < 0.1 && p.x < A.xiang.box.maxX), "进厢房要走厢房门");
const toBridge = StreetRoute(P.aidGateOut, { x: RL.x, z: RB.southZ + 1.5 });
assert.ok(toBridge.some((p) => Math.abs(p.x - P.villageSouthEnd.x) < 0.3 && p.z > 830) && toBridge.some((p) => DistXZ(p, P.northBankRoadB) < 0.3) && toBridge.some((p) => DistXZ(p, L1218_RAIL_RAMPS[0].to) < 0.3), "从救护所去铁路桥走出村小路、北岸土路、上路基的土坡");

// --- 场景：脚下都在地面上、身子不进实心块、视线 ---
const scene = await LoadSceneLayout();
assert.ok(scene && !scene.error, `读不到场景文件：${scene?.error}`);
const sceneDoc = ReadBlockoutSceneDocSync("FirstLevel1218");
const PEOPLE = new Set(["soldier", "officer", "civilian", "child"]);
let onPlank = 0, inHole = 0, onRail = 0, onGuandao = 0;
for (const kf of NormalizeBlockout(a).keyframes) {
  const stand = StandSampler(scene, kf.signals);
  const solids = SolidBlocks(sceneDoc, kf.signals);
  for (const u of kf.units) {
    if (!PEOPLE.has(u.kind) && u.kind !== "litter") continue;
    if (u.ride) continue;
    const terrain = scene.terrainSampler(u.x, u.z), y = stand(u.x, u.z);
    if (OnRailBridge(u) && u.role !== "sapper" && u.z > RB.northZ + 0.7 && u.z < RB.southZ - 0.7) { assert.ok(Math.abs(y - H.sleeperTopY) < 0.02, `${kf.id} ${u.id} 在铁路桥上要站在枕木顶（${y.toFixed(2)}）`); onRail++; continue; }
    if (OnGuandao(u)) { assert.ok(Math.abs(y - GB.deckY) < 0.02, `${kf.id} ${u.id} 在官道桥上要站在桥面（${y.toFixed(2)}）`); onGuandao++; continue; }
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
assert.ok(onPlank >= 2 && inHole >= 4 && onRail >= 5 && onGuandao >= 2, `板桥上、洞里、铁路桥上、官道桥上的人都查到了（板桥 ${onPlank}、洞里 ${inHole}、铁路桥 ${onRail}、官道桥 ${onGuandao}）`);
const EYE = { stand: 1.62, crouch: 1.05, prone: 0.5, child: 1.0 };
const Sight = (kfId, target, targetEye, from = null, fromEye = null) => {
  const kf = KF(kfId), solids = SolidBlocks(sceneDoc, kf.signals), stand = StandSampler(scene, kf.signals);
  const src = from || kf.player;
  const eye = { x: src.x, z: src.z, eye: stand(src.x, src.z) - scene.terrainSampler(src.x, src.z) + (fromEye ?? EYE[src.stance || "stand"]) };
  const tgt = { x: target.x, z: target.z, eye: stand(target.x, target.z) - scene.terrainSampler(target.x, target.z) + targetEye };
  return { block: BlockSight(solids, scene.terrainSampler, eye, tgt), ground: SightBlock(scene.terrainSampler, eye, tgt).block };
};
const Clear = (kfId, target, eye, what, from = null, fromEye = null) => { const r = Sight(kfId, target, eye, from, fromEye); assert.ok(r.block === null && r.ground <= 0, `${what}：${r.block ? `被 ${r.block.id} 挡` : `地面挡 ${r.ground}`}`); };
Clear("11-1", P.plankNorth, 1.6, "11-1 站在村南口往南看得见板桥北头那一带");
Clear("12-4", Unit("12-4", "Heizi"), 1.2, "12-4 看得见板桥头的黑子");
Clear("12-6", P.guandaoBridgeMid, 1.6, "12-6 南街口顺官道望得见官道桥上的人");
Clear("12-7", Unit("12-7", "Girl"), 1.0, "12-7 妮儿越过塌了的院墙看得见洞口的女娃", Unit("12-7", "Nier"), EYE.child);
Clear("13-1", Unit("13-1", "IjaMg1"), 0.5, "13-1 战壕里看得见坟头后的鬼子机枪");
Clear("14-2", P.bombedHole, 0.3, "14-2 南街上看得见挨炸的洞");
Clear("14-5", Unit("14-5", "Nier"), 1.0, "14-5 顺子趴着要看得见攥着被角的妮儿");
Clear("14-5", Unit("14-5", "Donggua"), 0.3, "14-5 顺子要看得见被子上的冬瓜");
Clear("14-5", KF("14-5").player, 0.5, "14-5 院门口的刘文财看得见这边", Unit("14-5", "LiuWencai"));
Clear("16-1", A.dongguaInside, 0.3, "16-1 看得见厢房里放被子的地方");
Clear("18-4", Unit("18-4", "IjaMg18"), 0.4, "18-4 河堤上趴着看得见路基脚那挺机枪");
{ const r = Sight("18-4", Unit("18-4", "Luo"), EYE.crouch, Unit("18-4", "IjaMg18")); assert.ok(r.ground > 0.05 || r.block, `18-4 机枪看不见土坎后的班长（地面挡 ${r.ground}）`); }
Clear("18-7", Unit("18-7", "BankIja2"), 1.6, "18-7 河堤上看得见北岸路基上的鬼子");
Clear("18-8", P.cityLights, 1.0, "18-8 南岸路上看得见县城的灯");

const file = new URL("./Blockout/FirstLevel1218.json", import.meta.url);
if (fs.existsSync(file)) {
  const onDisk = JSON.parse(fs.readFileSync(file, "utf8"));
  if (Strip({ ...onDisk, source: { ...onDisk.source, commit: "test" } }) !== Strip(a)) console.log("提示：Blockout/FirstLevel1218.json 与生成器输出不同（手改过，或没重新 export）");
  // 盘上的 JSON 没有生成器的内部标记（躺在担架 / 被子上、照料、下战壕 / 过桥），按手改的口径查只该多报这一类
  const known = /Donggua 站在 (LitterDonggua|BlanketDonggua)|Wounded\d 站在 CartLitter\d|WaitWounded\d 站在 WaitLitter\d|重叠|Doctor 站在 BlanketDonggua|Geng 站在 BlanketDonggua|1 m 内高差/;
  const extra = FirstLevel1218Issues(onDisk, { scene }).filter((line) => !known.test(line));
  assert.deepEqual(extra, [], `盘上的 JSON 多报了：\n  ${extra.join("\n  ")}`);
}
console.log(`FirstLevel1218 关键帧：${a.keyframes.length} 帧、${a.keyframes.reduce((s, k) => s + k.units.length, 0)} 个单位位次，校验、摆位、视线全过`);
