// Script_EditorBlockoutFirstLevel0610KeyframesTest.mjs —— 06–10 白盒关键帧生成器的 node 回归（只给关键帧包自验用；2026-10-19 第二版）
// 跑法：node Taierzhuang1938/Script_EditorBlockoutFirstLevel0610KeyframesTest.mjs
// 查：生成两次除 generatedAt 外逐字相同、过 ValidateBlockout 且无警告、摆位 / 走位问题为零（读 Blockout/FirstLevel0610.scene.json 连实心块与高差一起查）、
// 第二版契约 §3 的 25 帧齐全、玩家点在场地内、next 不出现「掩护 / 清理 / 护送」、what 不超长、人物 id 稳定、castId 都是定妆表里的键；
// 所有人脚下都在地面上（站在高度场或 ≤1 m 的块顶上，身子不进实心块）、**没有人站在房顶上**；
// 七个信号按拍起（10-20：缸挪开 BackVatMoved 与门开 BackDoorOpen 都从 10-6 起）；07 妮儿挂在车尾沿上（ride）、别的帧不挂；后送队够多（07 贴西坎、08 起缩在路沟东半截与凹路末段）；冬瓜一直躺在自己的担架上；
// 08 四个压窗口的人趴在街口坡道上都看得见北窗机枪手、08-4 喊人的鬼子从街口看得见 ≥ 1.5 s、08-5 妮儿顺路沟往西钻巷子口、09-2 从狗洞钻进后院、
// 09-3 / 09-4 缝里看得见窖口、09-5 门开了看得见撒尿的看守、09-6 透过前屋南门看得见机枪组的后背、10-2 石碾后看得见东头与街上倒着的鬼子、
// 10-2 剩下的缩在土地庙后、10-3 掷弹筒在麦秸垛北侧、10-4 抄北边的最前头到了主街东侧最南那院、10-5 南边翻墙、10-6 幺娃接过机枪、何有田守后门。

import assert from "node:assert/strict";
import fs from "node:fs";
import { ValidateBlockout, NormalizeBlockout } from "./Script_EditorBlockoutConfig.mjs";
import { FIRST_LEVEL_SPEAKING_CAST } from "./Data_FirstLevelSpeakingCast.mjs";
import { BuildFirstLevel0610Config, StreetRoute, LoadSceneLayout, StandSampler, FirstLevel0610Issues, RoadPointAtX } from "./Script_EditorBlockoutFirstLevel0610Keyframes.mjs";
import { BlockSight, SolidBlocks, BlockCenterY } from "./Script_EditorBlockoutFirstLevel0610Scene.mjs";
import {
  L0610_BOUNDS as B, L0610_PLACES as P, L0610_GENG as G, L0610_SIGNALS as SIG, L0610_STREETS as ST, L0610_DITCH as DT, L0610_EAST_YARDS as EY,
  L0610_STREET_YARDS as SY, L0610_MOUTH_SHOOTERS, LanePointAtZ,
} from "./Data_EditorBlockoutFirstLevel0610Space.mjs";

const issues = [];
const a = await BuildFirstLevel0610Config({ commit: "test", generatedAt: "A", issues });
const b = await BuildFirstLevel0610Config({ commit: "test", generatedAt: "B" });
const Strip = (doc) => JSON.stringify({ ...doc, source: { ...doc.source, generatedAt: "" } });
assert.equal(Strip(a), Strip(b), "生成两次（除 generatedAt）要逐字相同");

const check = ValidateBlockout(a);
assert.ok(check.ok, check.errors.join("; "));
assert.deepEqual(check.warnings, [], "不该有校验警告");
assert.deepEqual(issues, [], `摆位 / 走位问题：\n  ${issues.join("\n  ")}`);

const IDS = ["06-1", "06-2", "06-3", "07-1", "07-2", "07-3", "07-4", "08-1", "08-2", "08-3", "08-4", "08-5",
  "09-1", "09-2", "09-3", "09-4", "09-5", "09-6", "09-7", "10-1", "10-2", "10-3", "10-4", "10-5", "10-6"];
assert.deepEqual(a.keyframes.map((k) => k.id), IDS, "第二版契约 §3 的 25 个关键帧按顺序齐全");
const TITLES = { 6: "回到集结处", 7: "沿着后送队往前走", 8: "村口", 9: "摸进老耿家", 10: "背后打掉机枪，守东街" };
for (const kf of a.keyframes) {
  assert.equal(kf.stage, Number(kf.id.split("-")[0]), `${kf.id} 的 stage`);
  assert.equal(kf.stageTitle, TITLES[kf.stage], `${kf.id} 的 stageTitle 用剧本标题`);
  assert.ok(kf.player.x >= B.minX && kf.player.x <= B.maxX && kf.player.z >= B.minZ && kf.player.z <= B.maxZ, `${kf.id} 玩家出界`);
  assert.ok(!/掩护|清理|护送/.test(kf.next?.text || ""), `${kf.id} next 用了禁词：${kf.next?.text}`);
  assert.ok(kf.what.length <= 60, `${kf.id} what 太长（${kf.what.length}）`);
  assert.ok((kf.next?.text || "").length <= 20, `${kf.id} next.text 太长`);
  assert.ok(Array.isArray(kf.how) && kf.how.length >= 3, `${kf.id} how 至少三条`);
  for (const u of kf.units) if (u.castId) assert.ok(Object.hasOwn(FIRST_LEVEL_SPEAKING_CAST, u.castId), `${kf.id} ${u.id} 的 castId ${u.castId} 不在定妆表里`);
  for (const u of kf.units) assert.ok(!/Roof|房顶/.test(`${u.id} ${u.name || ""}`), `${kf.id} ${u.id} 不许有人在房顶上`);
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
for (const id of IDS) { assert.ok(Unit(id, "Geng"), `${id} 老耿要在`); assert.ok(Unit(id, "Nier"), `${id} 妮儿要在`); assert.ok(Unit(id, "GengCart")?.kind === "cart", `${id} 驴车要在`); }

// --- 信号按拍起 ---
const From = (sig, firstId) => IDS.forEach((id, i) => assert.equal(KF(id).signals.includes(sig), i >= IDS.indexOf(firstId), `${id} 的 ${sig}`));
From(SIG.cartDeparted, "06-3"); From(SIG.cellarBlast, "09-4"); From(SIG.sideGateOpen, "09-5"); From(SIG.mgSilenced, "10-1"); From(SIG.northYardGatesBroken, "10-4");
From(SIG.backVatMoved, "10-6"); From(SIG.backDoorOpen, "10-6");
assert.equal(Object.keys(SIG).length, 7, "七个信号都查到了");

// --- 06：车在南岸树底下，妮儿蹲在凹路口边上的沟沿上 ---
assert.ok(DistXZ(Unit("06-1", "GengCart"), P.cartStop) < 0.1 && DistXZ(Unit("06-2", "Nier"), P.nierRim) < 0.1, "06 车在树底下、妮儿在沟沿上");
assert.ok(Unit("06-3", "Runner")?.path?.length >= 2, "06-3 传令兵从凹路跑来");

// --- 07：后送队贴西坎、够多；车在玩家前头 5–7 m、妮儿在车尾；冬瓜一直躺在自己的担架上；07-4 全体趴下 ---
for (const id of ["07-1", "07-2", "07-3", "07-4"]) {
  const litters = KF(id).units.filter((u) => u.kind === "litter");
  const walkers = KF(id).units.filter((u) => u.role === "walkingWounded");
  assert.ok(litters.length >= 10 && litters.length <= 12, `${id} 担架 ${litters.length} 副（要 10–12）`);
  assert.ok(walkers.length >= 14 && walkers.length <= 18, `${id} 走着的伤员 ${walkers.length}（要 14–18）`);
  for (const u of [...litters, ...walkers]) assert.ok(u.z >= 185 && u.z <= 320 && Math.abs(u.x - 88) < 20, `${id} ${u.id} 不在凹路 z 190…315 里 (${u.x},${u.z})`);
  const cart = Unit(id, "GengCart"), pl = KF(id).player;
  const ahead = cart.z - pl.z;
  if (id !== "07-3") assert.ok(ahead >= 5 && ahead <= 7.5, `${id} 车在玩家前头 ${ahead.toFixed(1)} m（要 5–7）`);
  assert.ok(DistXZ(Unit(id, "Nier"), cart) < 2.2 && Unit(id, "Nier").z < cart.z, `${id} 妮儿在车尾`);
  // 10-20：妮儿挂在车尾沿上跟车走（§3 ride）：车本地 z +1.2（车尾沿）、根离车底下地面 0.467（车板顶 1.025 − VilSitEdge 坐高 0.9 × 0.62）、背对车头
  assert.deepEqual(Unit(id, "Nier").ride, { on: "GengCart", x: 0, z: 1.2, y: 0.467, yawDeg: 180 }, `${id} 妮儿要挂在车尾沿上（ride）`);
  assert.ok(Math.abs(Unit(id, "Nier").x - cart.x) < 0.05 && Math.abs(cart.z - Unit(id, "Nier").z - 1.2) < 0.05 && Unit(id, "Nier").yawDeg === 0, `${id} 妮儿自己的 x / z 写成车尾那一点、朝北`);
}
for (const id of IDS) if (!/^07-/.test(id)) assert.equal(Unit(id, "Nier").ride, undefined, `${id} 妮儿不在车上（只有 07 坐车尾）`);
for (const id of IDS.slice(3)) {
  const l = Unit(id, "LitterDonggua"), d = Unit(id, "Donggua");
  assert.ok(l && d && d.state === "down" && DistXZ(l, d) < 0.05, `${id} 冬瓜要躺在自己的担架上`);
  assert.equal(l.bearers, id === "10-5" || id === "10-6" ? 2 : 0, `${id} 冬瓜担架的 bearers`);
}
assert.ok(Math.abs(Unit("07-3", "LitterDonggua").z - 300) < 3, "07-3 冬瓜的担架在队头附近 z≈300");
assert.ok(DistXZ(KF("07-3").player, Unit("07-3", "LitterDonggua")) < 3.5, "07-3 玩家蹲在冬瓜担架边");
assert.ok(Unit("07-3", "Luo").x > 98 && Math.abs(Unit("07-3", "Luo").z - 312) < 1.5 && Unit("07-3", "Officer").x > 98, "07-3 班长和排长在东坎上 (≈97…100,312)");
assert.ok(KF("07-4").units.filter((u) => u.side === "nra" && (u.kind || "soldier") === "soldier").every((u) => u.stance === "prone" || u.state === "down"), "07-4 当兵的全趴下");
assert.ok(Unit("07-4", "Nier").stance === undefined || Unit("07-4", "Nier").stance === "stand", "07-4 妮儿最后一个趴下（还站着）");
// 10-21：顺子半蹲贴在凹路东坎根（不是趴）；东北进庄的道上 3–4 个鬼子弯着腰往庄子走（x 255…290，从凹路口看得见的那一段）
{
  const pl = KF("07-4").player, mid = LanePointAtZ(pl.z, 0);
  assert.ok(pl.stance === "crouch" && pl.x - mid.x > 0.8 && pl.x - mid.x < 2.0, `07-4 顺子半蹲在东坎根（路中线东边 0.8–2 m），实际 x 偏 ${(pl.x - mid.x).toFixed(2)}、${pl.stance}`);
  const road = KF("07-4").units.filter((u) => u.group === "road" && u.side === "ija");
  assert.ok(road.length >= 3 && road.length <= 4 && road.every((u) => u.x >= 274 && u.x <= 296 && u.stance === "crouch" && u.intent?.length), `07-4 东北道上要有 3–4 个弯着腰往庄里走的鬼子（x 274…296 那一截从街口才看得见、有去向），现在 ${road.length}`);
  for (const u of road) assert.ok(Math.abs(u.z - RoadPointAtX(u.x).z) < 2.6 && Math.abs(u.x - RoadPointAtX(u.x, 0).x) < 0.01, `07-4 ${u.id} 要在东北进庄的道上`);
}
// 07-1 / 07-2：幺娃并排在顺子左手边略后，刘文财走在两人后头两步（他听见了「路费」那段）
for (const id of ["07-1", "07-2"]) {
  const pl = KF(id).player, yw = Unit(id, "Yaowa"), liu = Unit(id, "LiuWencai");
  assert.ok(pl.z - yw.z > 0.3 && pl.z - yw.z < 1.6 && DistXZ(pl, yw) >= 0.6 && DistXZ(pl, yw) < 1.8, `${id} 幺娃并排在顺子身边略后（实际 dz ${(pl.z - yw.z).toFixed(1)}、离 ${DistXZ(pl, yw).toFixed(1)} m）`);
  assert.ok(pl.z - liu.z > 1.6 && pl.z - liu.z < 3.5 && yw.z - liu.z > 1.0, `${id} 刘文财在顺子和幺娃后头两步（实际 ${(pl.z - liu.z).toFixed(1)} m）`);
}

// --- 08：四个压窗口的趴在街口坡道上；班长四人在大车北侧；喊人的跑了；妮儿顺路沟往西 ---
const shooterIds = L0610_MOUTH_SHOOTERS.filter((p) => p.who !== "player").map((p) => p.who);
for (const id of ["08-1", "08-3", "08-4"]) {
  assert.ok(KF(id).player.stance === "prone" && DistXZ(KF(id).player, L0610_MOUTH_SHOOTERS[0]) < 0.05, `${id} 顺子趴在街口坡道最西头`);
  for (const who of shooterIds) assert.ok(Unit(id, who).stance === "prone" && DistXZ(Unit(id, who), L0610_MOUTH_SHOOTERS.find((p) => p.who === who)) < 0.05, `${id} ${who} 趴在坡道上`);
}
assert.ok(DistXZ(KF("08-1").player, P.alleyMouth) <= 20, "顺子的射击位置到巷子口 ≤ 20 m");
for (const id of ["08-1", "08-2"]) {
  for (const uid of ["Luo", "Geng", "Officer"]) assert.ok(Math.abs(Unit(id, uid).z - DT.z) < 1.6 && Unit(id, uid).x < DT.eastHalfFromX, `${id} ${uid} 在沟底街口西边`);
  assert.ok(DistXZ(Unit(id, "Medic"), Unit(id, "LitterDonggua")) < 2.2, `${id} 卫生兵在冬瓜担架边`);
}
for (const id of ["08-3", "08-4", "08-5", "09-1", "09-7"]) {
  for (const uid of ["Luo", "HeYoutian", "Escort1"]) assert.ok(Unit(id, uid).z < P.cart.z - 1.2 && Math.abs(Unit(id, uid).x - P.cart.x) < 1.8 && Unit(id, uid).stance === "crouch", `${id} ${uid} 蹲在大车北侧`);
  assert.equal(Unit(id, "Escort2").state, "down", `${id} 一个后送队的兵倒了`);
}
assert.ok(KF("08-3").units.filter((u) => u.group === "gate" && u.side === "ija").length + KF("08-3").units.filter((u) => ["Rifle1", "Rifle2"].includes(u.id)).length >= 4
  && Unit("08-3", "Rifle1").z > G.compound.minZ && Unit("08-3", "Rifle1").x > G.carriageGate.minX, "08-3 大门过道多了两杆枪");
assert.ok(Unit("08-3", "GateIja1") && Unit("08-3", "GateIja1").x > G.carriageGate.minX && Unit("08-3", "GateIja1").x < G.carriageGate.maxX, "08-3 甩手榴弹的在大门过道里");
const runner = Unit("08-4", "GateIja2");
assert.ok(runner && runner.path && runner.intent && runner.x > ST.main.x - ST.main.halfW && runner.x < ST.main.x + ST.main.halfW, "08-4 喊人的鬼子在街口里跑");
assert.ok(runner.intent[runner.intent.length - 1].x >= 130 && Math.abs(runner.intent[runner.intent.length - 1].z - ST.east.z) < 1, "08-4 他往东街跑");
assert.ok(!Unit("08-5", "GateIja2") && Unit("10-2", "GateIja2") && Unit("10-2", "GateIja2").x > EY.shrine.x, "喊人的那个 10-2 回来了，在土地庙后头");
const nier85 = Unit("08-5", "Nier");
assert.ok(Math.abs(nier85.z - DT.z) < 0.8 && nier85.x < DT.westHalfToX && nier85.x > ST.alleyNorth.x, "08-5 妮儿在路沟西半截往西跑");
assert.ok(nier85.intent.some((p) => Math.abs(p.x - ST.alleyNorth.x) < 0.5 && Math.abs(p.z - P.alleyMouth.z) < 0.5), "08-5 妮儿的去向过巷子口");
assert.ok(Unit("08-5", "Geng").z > DT.z + 1 && DistXZ(Unit("08-5", "Yaowa"), Unit("08-5", "Geng")) < 1.8, "08-5 老耿爬出沟被幺娃拽住");
assert.ok(KF("08-5").units.some((u) => u.id.startsWith("Walker") && u.state === "down" && Math.abs(u.z - DT.z) < 1.5), "08-5 妮儿身边一个伤兵中枪");
assert.ok(KF("08-1").units.filter((u) => u.id.startsWith("Villager")).length === 5 && KF("08-1").units.filter((u) => u.id.startsWith("Villager") && u.state === "down").length === 2, "08-1 村民 5 个、倒 2 个");
assert.ok(DistXZ(Unit("08-1", "Villager1"), KF("08-1").player) <= 2.0 && Unit("08-1", "Villager1").z > DT.z, "08-1 巷子里滚进沟的那个倒在顺子脚边（≤ 2 m，街口坡道下半截）");
// 10-21 村民走岔路：倒的两个是从主街东边 z 432.5 那道院门冲上街的；滚进沟的那个来路走巷子（南北那截 → 东西那截 → 夹道 → 巷子口）；
// 两个从北边后门下到沟东半截、缩在后送队里（08-2 还在，之后没了）；东北道上远远有 2–3 个鬼子在往庄里走
{
  for (const id of ["Villager2", "Villager3"]) {
    const u = Unit("08-1", id);
    assert.ok(u.state === "down" && u.path?.length >= 2 && u.path[0].x > SY.eastOfMain.box.minX && Math.abs(u.path[0].z - SY.eastOfMain.gatesZ[1]) < 1.0 && u.path[1].x < SY.eastOfMain.box.minX, `08-1 ${id} 要从主街东边 z ${SY.eastOfMain.gatesZ[1]} 那道院门冲出来`);
  }
  const v1 = Unit("08-1", "Villager1");
  assert.ok(v1.path?.length >= 5 && v1.path[0].x > SY.westOfMain.box.minX && Math.abs(v1.path[1].x - ST.alleySouth.x) < 0.3 && Math.abs(v1.path[0].z - SY.westOfMain.alleyBackGateZ) < 1.0, "08-1 Villager1 从院里走巷子后门（alleyBackGate）出来");
  assert.ok(v1.path.some((p) => Math.abs(p.z - ST.alleyWest.z) < 0.6 && Math.abs(p.x - ST.alleySouth.x) < 0.3) && v1.path.some((p) => Math.abs(p.x - ST.alleyNorth.x) < 0.3 && Math.abs(p.z - P.alleyMouth.z) < 0.6), "08-1 Villager1 走巷子东西那截、夹道、巷子口");
  assert.ok(v1.path.every((p) => p.x < 96.5 || p.z < 386), "08-1 Villager1 不上主街");
  for (const id of ["Villager4", "Villager5"]) {
    const u = Unit("08-1", id);
    assert.ok(u.state !== "down" && u.stance === "crouch" && Math.abs(u.z - DT.z) < 1.4 && u.x >= DT.eastHalfFromX, `08-1 ${id} 要活着缩在沟东半截`);
    assert.ok(u.path?.length >= 2 && Math.abs(u.path[0].x - SY.eastOfMain.ditchBackGateX) < 1.0 && u.path[0].z > SY.eastOfMain.box.minZ && u.path[1].z < SY.eastOfMain.box.minZ && u.path[1].z > DT.z, `08-1 ${id} 从院里走路沟后门（ditchBackGate）下来`);
    assert.ok(Unit("08-2", id) && Unit("08-2", id).state !== "down" && !Unit("08-3", id), `${id} 08-2 还缩在沟里，08-3 起跟后送队走了`);
  }
  for (const id of ["08-1", "08-2"]) {
    const far = KF(id).units.filter((u) => u.group === "road" && u.side === "ija");
    assert.ok(far.length >= 2 && far.length <= 3 && far.every((u) => u.x >= 280 && u.x <= 295 && u.intent?.length), `${id} 东北道上远远要有 2–3 个鬼子在往庄里走（x 280…295，从街口趴着看得见的那一截）`);
  }
  assert.ok(!KF("08-3").units.some((u) => u.group === "road"), "08-3 起道上的鬼子进庄了，不再摆");
}
for (const id of ["08-1", "08-2", "08-3", "08-4", "08-5", "09-1", "09-7", "10-1"]) {
  const inDitch = KF(id).units.filter((u) => (u.kind === "litter" || u.role === "walkingWounded") && Math.abs(u.z - DT.z) < 1.4 && u.x >= DT.eastHalfFromX);
  const inLane = KF(id).units.filter((u) => (u.kind === "litter" || u.role === "walkingWounded") && u.z >= 350 && u.z < 378);
  assert.ok(inDitch.length >= 12 && inLane.length >= 8, `${id} 后送队缩在路沟东半截（${inDitch.length}）与凹路末段（${inLane.length}）`);
  assert.ok(Unit(id, "GengCart").x >= DT.eastHalfFromX - 0.5 && Math.abs(Unit(id, "GengCart").z - DT.z) < 1.2, `${id} 老耿的车在路沟东半截`);
}

// --- 09 ---
const nier91 = Unit("09-1", "Nier");
assert.ok(nier91.path && nier91.path.some((p) => Math.abs(p.x - ST.alleyNorth.x) < 0.1 && Math.abs(p.z - ST.alleyWest.z) < 0.1) && nier91.path.some((p) => Math.abs(p.x - ST.alleySouth.x) < 0.1 && Math.abs(p.z - ST.alleyWest.z) < 0.1), "09-1 妮儿走夹道、过巷子拐角");
// 10-21：09-1 从 08-5 预演交还操作的地方起 —— 夹道里、东西那截拐弯前（x 80、z 390…397）
assert.ok(Math.abs(KF("09-1").player.x - ST.alleyNorth.x) < 0.3 && KF("09-1").player.z > 390 && KF("09-1").player.z < ST.alleyWest.z - 0.5 && KF("09-1").player.stance === "crouch", "09-1 玩家在夹道里拐弯前（接 08-5 末尾）");
const nier92 = Unit("09-2", "Nier");
assert.ok(nier92.x > G.sharedWall.x && nier92.path && nier92.path.some((p) => Math.abs(p.z - G.dogHole.z) < 0.1 && p.x > G.sharedWall.x), "09-2 妮儿从狗洞钻进后院");
assert.ok(DistXZ(KF("09-2").player, P.dogHole) < 2.5 && KF("09-2").player.x < G.sharedWall.x, "09-2 玩家蹲在狗洞外");
for (const id of ["09-3", "09-4"]) assert.ok(DistXZ(Unit(id, "Nier"), { x: G.haystack.x, z: G.haystack.z }) < 2.5 && DistXZ(Unit(id, "Nier"), P.sideGate) < 7, `${id} 妮儿缩在柴垛后头、离侧门几步`);
assert.ok(["CellarMan", "CellarWife", "CellarGranny"].every((uid) => Unit("09-3", uid)) && Unit("09-3", "CellarMan").state === "down", "09-3 一家人出窖、汉子倒下");
assert.ok(Unit("09-4", "CellarGranny").state === "down" && DistXZ(Unit("09-4", "CellarGranny"), P.cellar) < 1, "09-4 老太太炸在窖里");
assert.ok(Unit("09-4", "CellarIja1").intent?.length >= 1 && Unit("09-4", "CellarIja3").x > G.sideRoom.box.minX - 2 && Unit("09-4", "CellarWife").x > G.sideRoom.box.minX, "09-4 这伙人往前屋跑、拖人的进了偏屋");
assert.ok(Unit("09-5", "CellarIja2") && DistXZ(Unit("09-5", "CellarIja2"), P.cellar) < 5 && DistXZ(Unit("09-5", "CellarIja2"), Unit("09-5", "CellarMan")) < 2.5, "09-5 撒尿的看守在汉子尸体边");
assert.ok(Unit("09-6", "CellarIja2").x > G.sideRoom.box.minX, "09-6 看守进了偏屋");
assert.ok(Unit("09-5", "CellarIja1").z < G.frontRoom.box.maxZ, "09-5 拎手榴弹的到了前屋");
for (const id of IDS.slice(7)) assert.ok(Unit(id, "MillOldMan")?.state === "down" && DistXZ(Unit(id, "MillOldMan"), P.mill) < 1.5, `${id} 石磨上绑着的老汉`);
assert.ok(KF("09-5").player.stance === "crouch" && DistXZ(KF("09-5").player, P.sideGate) < 2.2 && KF("09-5").player.x > G.sharedWall.x, "09-5 玩家蹲在侧门口里侧");
assert.ok(DistXZ(KF("09-6").player, P.sideGate) <= 6 && KF("09-6").player.stance === "crouch" && DistXZ(Unit("09-6", "Nier"), KF("09-6").player) < 1.5, "09-6 玩家蹲在侧门里几步，妮儿攥着衣角");
assert.ok(KF("09-7").player.stance === "prone" && KF("09-7").player.pitchDeg > 20 && DistXZ(KF("09-7").player, P.kitchenDoor) < 2.5, "09-7 灶屋门口倒地仰视");
assert.ok(Unit("09-7", "KitchenIja").aim && DistXZ(Unit("09-7", "KitchenIja"), KF("09-7").player) < 1.8 && DistXZ(Unit("09-7", "Nier"), Unit("09-7", "KitchenIja")) < 2.2, "09-7 鬼子压着顺子、妮儿咬手腕");
for (const id of ["09-1", "09-2", "09-3", "09-4", "09-5", "09-6", "09-7"]) {
  const mg = Unit(id, "MgGunner");
  assert.ok(mg.weapon === "Type11" && mg.aim && mg.arc && DistXZ(mg, G.mgPost) < 0.1, `${id} 北窗机枪组`);
}
assert.ok(KF("09-7").units.filter((u) => u.side === "ija" && u.state !== "down" && (u.z < G.frontRoom.box.maxZ || (u.x > G.carriageGate.minX - 0.5 && u.x < G.passageEastX && u.z < 480))).length >= 6, "09-7 前屋 + 大门过道约 7 人");

// --- 10 ---
for (const id of ["10-1", "10-2", "10-3", "10-4", "10-5", "10-6"]) for (const uid of ["MgGunner", "MgLoader", "Leader", "GateIja1", "KitchenIja", "CellarIja1"]) assert.equal(Unit(id, uid).state, "down", `${id} ${uid} 该倒了`);
assert.ok(Unit("10-1", "Rifle2") && Unit("10-1", "Rifle2").state !== "down" && Unit("10-1", "Rifle2").intent?.length, "10-1 剩一个往东街跑");
assert.ok(Unit("10-1", "Luo").z > P.cart.z && Unit("10-1", "Luo").z < ST.square.box.minZ, "10-1 班长从大车后冲上来");
assert.ok(KF("10-2").player.stance === "prone" && Math.abs(KF("10-2").player.yawDeg + 90) < 1 && DistXZ(KF("10-2").player, P.roller) < 3, "10-2 石碾后趴着朝东");
const east102 = KF("10-2").units.filter((u) => u.group === "east" && u.side === "ija");
assert.ok(east102.length >= 5 && east102.length <= 7, "10-2 大队先头五六个");
assert.ok(east102.filter((u) => u.state === "down").length >= 2 && east102.filter((u) => u.state === "down").every((u) => u.x > P.roller.x + 30 && u.x < P.roller.x + 70), "10-2 倒两三个，离石碾 30–70 m");
assert.ok(east102.filter((u) => u.state !== "down" && u.x > EY.shrine.x + 0.8 && u.x < EY.shrine.x + 6).length >= 2, "10-2 剩下的缩到土地庙后头");
assert.ok(!Unit("10-2", "Mortar1") && Unit("10-3", "Mortar1"), "掷弹筒 10-3 才开始");
for (const uid of ["Mortar1", "Mortar2", "Mortar3"]) {
  const m = Unit("10-3", uid);
  assert.ok(m && m.z > EY.strawStack.z + EY.strawStack.d / 2 && m.z < EY.strawStack.z + EY.strawStack.d / 2 + 3 && Math.abs(m.x - EY.strawStack.x) < 3, `10-3 ${uid} 躲在麦秸垛北侧`);
}
assert.ok(!Unit("10-3", "NorthIja1") && Unit("10-4", "NorthIja1"), "抄北边的 10-4 才出现");
const north104 = KF("10-4").units.filter((u) => u.group === "north");
assert.ok(north104.length >= 3 && north104.length <= 4, "10-4 北边 3–4 个");
const EM = SY.eastOfMain.box;
assert.ok(north104.some((u) => u.x > EM.minX && u.x < EM.maxX && u.z > 435 && u.z < ST.pocket.box.minZ), "10-4 最前头的已到主街东侧最南那院");
assert.ok(north104.every((u) => u.z >= 435 && u.z <= 463 && u.x >= EM.minX && u.x <= EY.farmyard.minX + 1), "10-4 北边的都在院子链里（场院以西）");
for (const uid of ["Yaowa", "LiuWencai"]) assert.ok(Unit("10-4", uid).aim && Unit("10-4", uid).z > ST.pocket.box.maxZ && Unit("10-4", uid).z < 464 && Unit("10-4", uid).x > EM.minX && Unit("10-4", uid).x < ST.pocket.box.maxX, `10-4 ${uid} 堵在北角口上`);
assert.ok(!Unit("10-4", "SouthIja1") && Unit("10-5", "SouthIja1"), "南边翻墙的 10-5 才出现");
const south105 = KF("10-5").units.filter((u) => u.group === "south");
assert.ok(south105.length >= 2 && south105.length <= 3 && south105.filter((u) => Math.abs(u.z - EY.southClimb.z) < 1.5 && Math.abs(u.x - EY.southClimb.x) < 3).length >= 2, "10-5 南边 2–3 个在翻南院墙");
assert.ok(DistXZ(Unit("10-5", "HeYoutian"), P.backDoor) < 3.5 && Unit("10-5", "HeYoutian").aim, "10-5 何有田去守后门");
assert.ok(DistXZ(Unit("10-5", "Nier"), Unit("10-5", "Geng")) < 1.3, "10-5 妮儿抱住老耿的腿");
const in105 = KF("10-5").units.filter((u) => u.kind === "litter" && u.bearers === 2);
assert.ok(in105.length >= 12 && in105.some((u) => u.x > G.carriageGate.minX && u.x < G.carriageGate.maxX && u.z > G.compound.minZ), "10-5 担架抬着穿院子，有一副在大门过道里");
assert.ok(KF("10-6").player.yawDeg === 180 && Math.abs(KF("10-6").player.x - G.backDoor.x) < 0.1 && KF("10-6").player.z > G.compound.maxZ, "10-6 玩家在后门外朝南");
assert.ok(Unit("10-6", "LitterDonggua").z > G.compound.maxZ && Unit("10-6", "LitterDonggua").bearers === 2, "10-6 冬瓜的担架抬出了后门");
assert.ok(DistXZ(Unit("10-6", "Geng"), G.backVatMoved) < 1.5, "10-6 老耿在挪开的水缸边");
assert.ok(Math.abs(G.backVatMoved.x - 99.7) < 0.01 && Math.abs(G.backVatMoved.z - 504.0) < 0.01, "挪开的缸在 (99.7,504)：VilPushVat 从 (98,504) 往东直推 1.7 m 的落点");
assert.ok(DistXZ(Unit("10-6", "HeYoutian"), P.backDoor) < 2.2 && Unit("10-6", "HeYoutian").aim, "10-6 何有田守在门边");
assert.equal(Unit("10-6", "Yaowa").weapon, "Type11", "10-6 幺娃接过机枪");
assert.ok(Unit("10-6", "Yaowa").stance === "prone" && DistXZ(Unit("10-6", "Yaowa"), P.roller) < 3, "10-6 幺娃趴在石碾后");

// --- 走位：进灶屋要走灶屋门 ---
const toKitchen = StreetRoute({ x: 88, z: 496 }, { x: 86, z: 484.4 });
assert.ok(toKitchen.some((p) => Math.abs(p.z - G.kitchen.door.z) < 0.1 && p.x > G.kitchen.box.maxX), "进灶屋要走灶屋门");
const toBackLane = StreetRoute({ x: 108.2, z: 481 }, { x: 98, z: 511 });
assert.ok(toBackLane.some((p) => Math.abs(p.x - G.backDoor.x) < 0.1 && Math.abs(p.z - (G.compound.maxZ - 1.3)) < 0.1), "从过道尽头去后门外要走后门");

// --- 场景：脚下都在地面上（没人站在房顶上）、视线 ---
const scene = await LoadSceneLayout();
assert.ok(scene && !scene.error, `读不到场景文件：${scene?.error}`);
const sceneDoc = JSON.parse(fs.readFileSync(new URL("./Blockout/FirstLevel0610.scene.json", import.meta.url), "utf8"));
const PEOPLE = new Set(["soldier", "officer", "civilian", "child"]);
const roofs = sceneDoc.blocks.filter((blk) => blk.semantic === "roof" && blk.h <= 0.3);
for (const kf of NormalizeBlockout(a).keyframes) {
  const stand = StandSampler(scene, kf.signals);
  const solids = SolidBlocks(sceneDoc, kf.signals);
  for (const u of kf.units) {
    if (!PEOPLE.has(u.kind)) continue;
    const terrain = scene.terrainSampler(u.x, u.z), y = stand(u.x, u.z);
    assert.ok(y >= terrain - 1e-6 && y - terrain <= 1.0, `${kf.id} ${u.id} 脚下 ${y.toFixed(2)}（地形 ${terrain.toFixed(2)}）`);
    // 没有人站在房顶上：脚下的高度不许等于任何平顶的顶面
    for (const r of roofs) {
      const top = BlockCenterY(r, scene.terrainSampler) + r.h / 2;
      assert.ok(!(Math.abs(u.x - r.x) <= r.w / 2 && Math.abs(u.z - r.z) <= r.d / 2 && Math.abs(y - top) < 0.05), `${kf.id} ${u.id} 站在房顶 ${r.id} 上`);
    }
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
}
const EYE = { stand: 1.6, crouch: 1.2, prone: 0.5 };
const Sight = (kfId, target, targetEye) => {
  const kf = KF(kfId), solids = SolidBlocks(sceneDoc, kf.signals);
  return BlockSight(solids, scene.terrainSampler, { x: kf.player.x, z: kf.player.z, eye: EYE[kf.player.stance] }, { x: target.x, z: target.z, eye: targetEye });
};
const SightFrom = (kfId, from, fromEye, target, targetEye) => {
  const solids = SolidBlocks(sceneDoc, KF(kfId).signals);
  return BlockSight(solids, scene.terrainSampler, { x: from.x, z: from.z, eye: fromEye }, { x: target.x, z: target.z, eye: targetEye });
};
assert.equal(Sight("08-1", Unit("08-1", "MgGunner"), 1.15), null, "08-1 顺子趴在街口要看得见北窗里的机枪手");
for (const who of shooterIds) assert.equal(SightFrom("08-1", Unit("08-1", who), 0.5, Unit("08-1", "MgGunner"), 1.15), null, `08-1 ${who} 要看得见北窗里的机枪手`);
assert.equal(Sight("08-3", Unit("08-3", "Luo"), 1.0), null, "08-3 顺子要看得见大车后的班长");
assert.notEqual(SightFrom("08-3", Unit("08-3", "MgGunner"), 1.2, Unit("08-3", "Luo"), 0.9), null, "08-3 北窗机枪看不见大车北侧的班长（被车挡）");
// 08-4：喊人的鬼子从街口趴着看得见 ≥ 1.5 s（按他的 path + intent 每 0.25 m 取样、跑 4 m/s）
{
  const kf = KF("08-4"), solids = SolidBlocks(sceneDoc, kf.signals);
  const route = [...runner.path, ...runner.intent];
  let visibleM = 0, lastVisible = false;
  for (let i = 1; i < route.length; i++) {
    const p0 = route[i - 1], p1 = route[i], len = DistXZ(p0, p1), n = Math.max(1, Math.ceil(len / 0.25));
    for (let k = 1; k <= n; k++) {
      const q = { x: p0.x + (p1.x - p0.x) * k / n, z: p0.z + (p1.z - p0.z) * k / n };
      const vis = BlockSight(solids, scene.terrainSampler, { x: kf.player.x, z: kf.player.z, eye: 0.5 }, { x: q.x, z: q.z, eye: 1.0 }) === null;
      if (vis) visibleM += len / n;
      lastVisible = vis;
    }
  }
  const speed = runner.speedMps || 4;
  assert.ok(visibleM / speed >= 1.5, `08-4 喊人的鬼子只看得见 ${(visibleM / speed).toFixed(2)} s（要 ≥ 1.5）`);
  assert.equal(Sight("08-4", runner, 1.0), null, "08-4 这一帧的站点要看得见他");
  void lastVisible;
}
assert.equal(Sight("08-5", nier85, 0.9), null, "08-5 顺子要看得见顺路沟往西跑的妮儿");
assert.equal(Sight("09-3", P.cellar, 1.0), null, "09-3 墙缝里要看得见窖口");
assert.equal(Sight("09-4", P.cellar, 1.0), null, "09-4 门缝里要看得见窖口");
assert.equal(Sight("09-5", Unit("09-5", "CellarIja2"), 1.5), null, "09-5 门开了，玩家要看得见撒尿的看守");
const backs = ["MgGunner", "MgLoader"].map((uid) => Sight("09-6", Unit("09-6", uid), 0.8));
assert.ok(backs.some((x) => x === null), `09-6 透过前屋南门要看得见机枪组至少一人的后背：${backs.join(" / ")}`);
assert.equal(Sight("10-2", { x: 230, z: ST.east.z }, 1.0), null, "10-2 石碾后要顺着东街看到东头");
assert.equal(Sight("10-2", Unit("10-2", "EastIja1"), 0.5), null, "10-2 石碾后要看得见街上倒着的鬼子");
assert.ok(/^Shrine/.test(Sight("10-2", Unit("10-2", "EastIja4"), 0.9)?.id || ""), "10-2 缩在土地庙后头的要被土地庙挡住");
assert.notEqual(Sight("10-3", Unit("10-3", "Mortar1"), 1.0), null, "10-3 掷弹筒组藏在麦秸垛后头看不见");
assert.equal(Sight("10-4", { x: EY.northChain.pocketGate.x, z: EY.northChain.pocketGate.z + 1.5 }, 1.0), null, "10-4 石碾后看得见北角那道院门");
assert.equal(Sight("10-5", Unit("10-5", "LitterDonggua"), 0.8), null, "10-5 院里看得见过道里抬进来的担架");

const file = new URL("./Blockout/FirstLevel0610.json", import.meta.url);
if (fs.existsSync(file)) {
  const onDisk = JSON.parse(fs.readFileSync(file, "utf8"));
  if (Strip({ ...onDisk, source: { ...onDisk.source, commit: "test" } }) !== Strip(a)) console.log("提示：Blockout/FirstLevel0610.json 与生成器输出不同（手改过，或没重新 export）");
  // 盘上的 JSON 没有生成器的内部标记（躺在担架上 / 爬坎 / 翻墙 / 钻狗洞），按手改的口径查只该多报这几类
  const known = /Donggua 站在 LitterDonggua|Cellar(Man|Wife|Granny) 的走位在|Nier 的走位穿过 (DogHoleLintel|SharedWall)|Nier 的走位在|Geng 的走位在|Villager[145] 的走位在|Officer 的走位在|Luo 的走位在|SouthIja/;
  const extra = FirstLevel0610Issues(onDisk, { scene }).filter((line) => !known.test(line));
  assert.deepEqual(extra, [], `盘上的 JSON 多报了：\n  ${extra.join("\n  ")}`);
}
console.log(`FirstLevel0610 关键帧：${a.keyframes.length} 帧、${a.keyframes.reduce((s, k) => s + k.units.length, 0)} 个单位位次，校验、摆位、视线全过`);
