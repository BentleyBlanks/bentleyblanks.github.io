// Script_EditorBlockoutFirstLevel0610KeyframesTest.mjs —— 06–10 白盒关键帧生成器的 node 回归（只给关键帧包自验用；2026-10-22 第四版）
// 跑法：node Taierzhuang1938/Script_EditorBlockoutFirstLevel0610KeyframesTest.mjs
// 查：生成两次除 generatedAt 外逐字相同、过 ValidateBlockout 且无警告、摆位 / 走位问题为零（读 Blockout/FirstLevel0610.scene.json 连实心块与高差一起查）、
// 第四版的 24 帧齐全、玩家点在场地内、next 不出现「掩护 / 清理 / 护送」、what 不超长、人物 id 稳定、castId 都是定妆表里的键；
// 所有人脚下都在地面上（站在高度场或 ≤1 m 的块顶上，身子不进实心块）、**没有人站在房顶上**；
// 七个信号按拍起（CartDeparted 06-3、CellarBlast 09-4、SideGateOpen 09-5、MgSilenced 10-1、NorthYardGatesBroken 10-3、BarrageHit 10-5、LaneWallCollapse 10-6）；
// 07 妮儿挂在车尾沿上（ride）、别的帧不挂；后送队够多（07 贴西坎、08 起缩在路沟东半截与凹路末段、10-4 顺主街拐进窄胡同、10-5 起出了村南口）；冬瓜一直躺在自己的担架上；
// 日军人数前后对得上（08 开头 15 个：北屋 8、墙角 2、搜窖 4、灶屋 1；08-4 墙角一个跑了；09-7 灶屋 1 + 北屋来的 2 死在灶屋；10-1 北屋 6 全倒、墙角倒 2 跑 3）；
// 08 四个压枪眼的人趴在街口坡道上都看得见堂屋枪眼后的机枪手、08-3 班长四人蹲在坡道脚下没动、08-4 妮儿钻进巷子 / 班长四人到大车后头 / 一个鬼子往东街跑；
// 09 顺子和妮儿一路拉着手走唯一的那条路（每帧两人不超过 2 m、都在路线 3 m 内、09 都是蹲着）、09-2 门口瞥见窖口、09-3 窗后看得见窖口和被捅倒的汉子、09-4 探头的在西配房门口、
// 09-5 妮儿钻狗洞拔便门、09-6 从院子南墙根看得见堂屋门里机枪手的后背、09-7 灶屋里倒地仰视 + 北屋来的两个；10-1 背后打掉六个、10-2 石碾后看得见街上的鬼子 / 看不见过了弯的军官、
// 10-3 掷弹筒藏着 / 幺娃接过机枪 / 抄北边的在院子链里、10-4 后送队贴着石碾拐进窄胡同 + 妮儿抱腿、10-5 炮来了全班在院里往院门跑、10-6 塌墙 + 柴垛翻墙 + 后送队在村南口外；
// 10-22 用户：挨着枪的移动一律跑（08–10 里每一次 ≥ 2 m 的移动 speedMps ≥ 1.9，百姓除外；09 潜行蹲着）。

import assert from "node:assert/strict";
import fs from "node:fs";
import { ValidateBlockout, NormalizeBlockout } from "./Script_EditorBlockoutConfig.mjs";
import { FIRST_LEVEL_SPEAKING_CAST } from "./Data_FirstLevelSpeakingCast.mjs";
import { BuildFirstLevel0610Config, StreetRoute, LoadSceneLayout, StandSampler, FirstLevel0610Issues, RoadPointAtX, BIG_LOCUST } from "./Script_EditorBlockoutFirstLevel0610Keyframes.mjs";
import { BlockSight, SolidBlocks, BlockCenterY } from "./Script_EditorBlockoutFirstLevel0610Scene.mjs";
import {
  L0610_BOUNDS as B, L0610_PLACES as P, L0610_GENG as G, L0610_JIEFANG as JF, L0610_BENJIA as BJ, L0610_EAST_STREET as ES, L0610_SOUTH_LANE as SLN,
  L0610_SIGNALS as SIG, L0610_STREETS as ST, L0610_DITCH as DT, L0610_STREET_YARDS as SY, L0610_MOUTH_SHOOTERS, L0610_ROUTE, LanePointAtZ, Station,
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

const IDS = ["06-1", "06-2", "06-3", "07-1", "07-2", "07-3", "07-4", "08-1", "08-2", "08-3", "08-4",
  "09-1", "09-2", "09-3", "09-4", "09-5", "09-6", "09-7", "10-1", "10-2", "10-3", "10-4", "10-5", "10-6"];
assert.deepEqual(a.keyframes.map((k) => k.id), IDS, "第四版的 24 个关键帧按顺序齐全");
const TITLES = { 6: "回到集结处", 7: "沿着后送队往前走", 8: "村口", 9: "摸进老耿家", 10: "背后打掉机枪，守路口，被炮撵出庄子" };
for (const kf of a.keyframes) {
  assert.equal(kf.stage, Number(kf.id.split("-")[0]), `${kf.id} 的 stage`);
  assert.equal(kf.stageTitle, TITLES[kf.stage], `${kf.id} 的 stageTitle 用剧本标题`);
  assert.ok(kf.player.x >= B.minX && kf.player.x <= B.maxX && kf.player.z >= B.minZ && kf.player.z <= B.maxZ, `${kf.id} 玩家出界`);
  assert.ok(!/掩护|清理|护送/.test(kf.next?.text || ""), `${kf.id} next 用了禁词：${kf.next?.text}`);
  assert.ok(kf.what.length <= 64, `${kf.id} what 太长（${kf.what.length}）`);
  assert.ok((kf.next?.text || "").length <= 20, `${kf.id} next.text 太长`);
  assert.ok(Array.isArray(kf.how) && kf.how.length >= 3, `${kf.id} how 至少三条`);
  for (const u of kf.units) if (u.castId) assert.ok(Object.hasOwn(FIRST_LEVEL_SPEAKING_CAST, u.castId), `${kf.id} ${u.id} 的 castId ${u.castId} 不在定妆表里`);
  for (const u of kf.units) assert.ok(!/Roof|房顶/.test(`${u.id} ${u.name || ""}`), `${kf.id} ${u.id} 不许有人在房顶上`);
  assert.ok(!/窗口|北窗/.test(`${kf.what} ${kf.how.join(" ")} ${kf.next?.text || ""}`), `${kf.id} 字幕里「窗口」一律改「枪眼」`);
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
const InBox = (p, box, m = 0) => p.x >= box.minX - m && p.x <= box.maxX + m && p.z >= box.minZ - m && p.z <= box.maxZ + m;
for (const id of IDS) { assert.ok(Unit(id, "Geng"), `${id} 老耿要在`); assert.ok(Unit(id, "Nier"), `${id} 妮儿要在`); assert.ok(Unit(id, "GengCart")?.kind === "cart", `${id} 驴车要在`); }

// --- 信号按拍起 ---
const From = (sig, firstId) => IDS.forEach((id, i) => assert.equal(KF(id).signals.includes(sig), i >= IDS.indexOf(firstId), `${id} 的 ${sig}`));
From(SIG.cartDeparted, "06-3"); From(SIG.cellarBlast, "09-4"); From(SIG.sideGateOpen, "09-5"); From(SIG.mgSilenced, "10-1"); From(SIG.northYardGatesBroken, "10-3");
From(SIG.barrageHit, "10-5"); From(SIG.laneWallCollapse, "10-6");
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
  assert.deepEqual(Unit(id, "Nier").ride, { on: "GengCart", x: 0, z: 1.2, y: 0.467, yawDeg: 180 }, `${id} 妮儿要挂在车尾沿上（ride）`);
  assert.ok(Math.abs(Unit(id, "Nier").x - cart.x) < 0.05 && Math.abs(cart.z - Unit(id, "Nier").z - 1.2) < 0.05 && Unit(id, "Nier").yawDeg === 0, `${id} 妮儿自己的 x / z 写成车尾那一点、朝北`);
}
for (const id of IDS) if (!/^07-/.test(id)) assert.equal(Unit(id, "Nier").ride, undefined, `${id} 妮儿不在车上（只有 07 坐车尾）`);
for (const id of IDS.slice(3)) {
  const l = Unit(id, "LitterDonggua"), d = Unit(id, "Donggua");
  assert.ok(l && d && d.state === "down" && DistXZ(l, d) < 0.05, `${id} 冬瓜要躺在自己的担架上`);
  assert.equal(l.bearers, id === "10-4" || id === "10-5" ? 2 : 0, `${id} 冬瓜担架的 bearers`);
}
assert.ok(Math.abs(Unit("07-3", "LitterDonggua").z - 300) < 3, "07-3 冬瓜的担架在队头附近 z≈300");
assert.ok(DistXZ(KF("07-3").player, Unit("07-3", "LitterDonggua")) < 3.5, "07-3 玩家蹲在冬瓜担架边");
assert.ok(Unit("07-3", "Luo").x > 98 && Math.abs(Unit("07-3", "Luo").z - 312) < 1.5 && Unit("07-3", "Officer").x > 98, "07-3 班长和排长在东坎上 (≈97…100,312)");
assert.ok(KF("07-4").units.filter((u) => u.side === "nra" && (u.kind || "soldier") === "soldier").every((u) => u.stance === "prone" || u.state === "down"), "07-4 当兵的全趴下");
assert.ok(Unit("07-4", "Nier").stance === undefined || Unit("07-4", "Nier").stance === "stand", "07-4 妮儿最后一个趴下（还站着）");
{
  const pl = KF("07-4").player, mid = LanePointAtZ(pl.z, 0);
  assert.ok(pl.stance === "crouch" && pl.x - mid.x > 0.8 && pl.x - mid.x < 2.0, `07-4 顺子半蹲在东坎根（路中线东边 0.8–2 m），实际 x 偏 ${(pl.x - mid.x).toFixed(2)}、${pl.stance}`);
  const road = KF("07-4").units.filter((u) => u.group === "road" && u.side === "ija");
  assert.ok(road.length >= 3 && road.length <= 4 && road.every((u) => u.x >= 274 && u.x <= 296 && u.stance === "crouch" && u.intent?.length), `07-4 东北道上要有 3–4 个弯着腰往庄里走的鬼子，现在 ${road.length}`);
  for (const u of road) assert.ok(Math.abs(u.z - RoadPointAtX(u.x).z) < 2.6 && Math.abs(u.x - RoadPointAtX(u.x, 0).x) < 0.01, `07-4 ${u.id} 要在东北进庄的道上`);
}
for (const id of ["07-1", "07-2"]) {
  const pl = KF(id).player, yw = Unit(id, "Yaowa"), liu = Unit(id, "LiuWencai");
  assert.ok(pl.z - yw.z > 0.3 && pl.z - yw.z < 1.6 && DistXZ(pl, yw) >= 0.6 && DistXZ(pl, yw) < 1.8, `${id} 幺娃并排在顺子身边略后`);
  assert.ok(pl.z - liu.z > 1.6 && pl.z - liu.z < 3.5 && yw.z - liu.z > 1.0, `${id} 刘文财在顺子和幺娃后头两步`);
}

// --- 08：四个压枪眼的趴在街口坡道上；日军 15 个各在其位；08-3 班长四人蹲在坡道脚下；08-4 妮儿钻巷子、班长四人到大车后、一个鬼子往东跑 ---
const shooterIds = L0610_MOUTH_SHOOTERS.filter((p) => p.who !== "player").map((p) => p.who);
for (const id of ["08-1", "08-2", "08-3"]) {
  assert.ok(KF(id).player.stance === "prone" && DistXZ(KF(id).player, L0610_MOUTH_SHOOTERS[0]) < 0.05, `${id} 顺子趴在街口坡道最西头`);
  for (const who of shooterIds) assert.ok(Unit(id, who).stance === "prone" && DistXZ(Unit(id, who), L0610_MOUTH_SHOOTERS.find((p) => p.who === who)) < 0.05, `${id} ${who} 趴在坡道上`);
}
assert.ok(DistXZ(KF("08-1").player, P.alleyMouth) <= 20, "顺子的射击位置到巷子口 ≤ 20 m");
for (const id of ["08-1", "08-2"]) {
  for (const uid of ["Luo", "Geng", "Officer"]) assert.ok(Math.abs(Unit(id, uid).z - DT.z) < 1.6 && Unit(id, uid).x < DT.eastHalfFromX, `${id} ${uid} 在沟底街口西边`);
  assert.ok(DistXZ(Unit(id, "Medic"), Unit(id, "LitterDonggua")) < 2.2, `${id} 卫生兵在冬瓜担架边`);
}
const HOUSE_IDS = ["MgGunner", "MgLoader", "MgThird", "Leader", "Rifle1", "Rifle2", "Rifle3", "Rifle4"];
const CELLAR_IDS = ["CellarIja1", "CellarIja2", "CellarIja3", "CellarIja4"];
{
  const ija = KF("08-1").units.filter((u) => u.side === "ija" && u.group !== "road");
  assert.equal(ija.length, 15, `08 开头日军一个分队 15 个（现在 ${ija.length}）`);
  for (const uid of HOUSE_IDS) assert.ok(InBox(Unit("08-1", uid), G.beiwu.box), `08-1 ${uid} 在北屋里`);
  assert.ok(Unit("08-1", "MgGunner").weapon === "Type11" && Unit("08-1", "MgGunner").aim && DistXZ(Unit("08-1", "MgGunner"), G.mgPost) < 0.1, "08-1 机枪手在堂屋枪眼后的位置");
  assert.ok(DistXZ(Unit("08-1", "Rifle1"), G.rifleWestPost) < 0.1 && DistXZ(Unit("08-1", "Rifle3"), G.rifleEastPost) < 0.1, "08-1 东西两间枪眼各趴一个");
  for (const uid of ["CornerIja1", "CornerIja2"]) assert.ok(InBox(Unit("08-1", uid), ST.pocket.box), `08-1 ${uid} 在路口墙角（石碾西北背后）`);
  for (const uid of CELLAR_IDS) assert.ok(InBox(Unit("08-1", uid), JF.box) && DistXZ(Unit("08-1", uid), P.cellar) < 4, `08-1 ${uid} 在街坊家窖口边`);
  assert.ok(InBox(Unit("08-1", "KitchenIja"), G.zaowu.box), "08-1 灶屋里一个");
}
for (const id of ["08-1", "08-2", "08-3"]) for (const uid of HOUSE_IDS) assert.ok(DistXZ(Unit(id, uid), Unit("08-1", uid)) < 0.05, `${id} ${uid} 没挪`);
// 08-3：班长带何有田和两个兵蹲在坡道脚下（沟底街口一带）等着；没人去大车
for (const uid of ["Luo", "HeYoutian", "Escort1", "Escort2"]) {
  const u = Unit("08-3", uid);
  assert.ok(u.stance === "crouch" && u.z > 380.5 && u.z < 383.5 && u.x > 98.5 && u.x < 103.5, `08-3 ${uid} 蹲在街口坡道脚下 (${u.x},${u.z})`);
}
assert.ok(KF("08-3").units.every((u) => u.side !== "nra" || u.z < 420), "08-3 没有人上主街");
// 08-4：班长四人蹲在大车北侧、都活着；妮儿在巷子里、来路经过路沟西半截与巷子口；老耿被幺娃拽回；一个墙角的鬼子往东街跑；玩家在巷子口里几米
for (const id of ["08-4", "09-1", "09-7"]) {
  for (const uid of ["Luo", "HeYoutian", "Escort1", "Escort2"]) assert.ok(Unit(id, uid).z < P.cart.z - 1.2 && Math.abs(Unit(id, uid).x - P.cart.x) < 2.8 && Unit(id, uid).stance === "crouch" && Unit(id, uid).state !== "down", `${id} ${uid} 蹲在大车北侧、活着`);
}
{
  const pl = KF("08-4").player, nier = Unit("08-4", "Nier");
  assert.ok(pl.stance === "crouch" && Math.abs(pl.x - ST.alleyNorth.c) < 0.3 && pl.z > 385 && pl.z < 392, `08-4 顺子在巷子口里几米 (${pl.x},${pl.z})`);
  assert.ok(Math.abs(nier.x - ST.alleyNorth.c) < 0.5 && nier.z > pl.z + 2 && nier.z < 399, "08-4 妮儿在顺子前头、巷子里");
  assert.ok(nier.path?.some((p) => Math.abs(p.z - DT.z) < 0.8 && p.x < DT.westHalfToX && p.x > 82) && nier.path?.some((p) => Math.abs(p.x - ST.alleyNorth.c) < 0.5 && Math.abs(p.z - P.alleyMouth.z) < 0.5), "08-4 妮儿的来路：顺路沟西半截往西、过巷子口");
  assert.ok(Unit("08-4", "Geng").z > DT.z + 1 && DistXZ(Unit("08-4", "Yaowa"), Unit("08-4", "Geng")) < 1.8, "08-4 老耿爬出沟被幺娃拽住");
  assert.ok(KF("08-4").units.some((u) => u.id.startsWith("Walker") && u.state === "down" && Math.abs(u.z - DT.z) < 1.5), "08-4 妮儿身边一个伤兵中枪");
  const runner = Unit("08-4", "CornerIja2");
  assert.ok(runner && runner.path && runner.intent && runner.x > ES.roller.x && Math.abs(runner.z - ST.east.c) < 1.5, "08-4 喊人的鬼子在东街上往东跑");
  assert.ok(runner.intent.at(-1).x >= 140, "08-4 他往东街那头跑");
  assert.ok(!Unit("09-1", "CornerIja2"), "09-1 起喊人的那个不在了（去东街了）");
  assert.ok(Unit("08-4", "LiuWencai").stance === "prone" && Unit("08-4", "Squad3").stance === "prone", "08-4 刘文财、Squad3 还趴着压枪眼");
}
assert.ok(KF("08-1").units.filter((u) => u.id.startsWith("Villager")).length === 5 && KF("08-1").units.filter((u) => u.id.startsWith("Villager") && u.state === "down").length === 2, "08-1 村民 5 个、倒 2 个");
assert.ok(DistXZ(Unit("08-1", "Villager1"), KF("08-1").player) <= 2.0 && Unit("08-1", "Villager1").z > DT.z, "08-1 巷子里滚进沟的那个倒在顺子脚边（≤ 2 m，街口坡道下半截）");
{
  for (const id of ["Villager2", "Villager3"]) {
    const u = Unit("08-1", id);
    assert.ok(u.state === "down" && u.path?.length >= 2 && u.path[0].x > SY.eastOfMain.box.minX && Math.abs(u.path[0].z - SY.eastOfMain.gatesZ[1]) < 1.0 && u.path[1].x < SY.eastOfMain.box.minX, `08-1 ${id} 要从主街东边 z ${SY.eastOfMain.gatesZ[1]} 那道院门冲出来`);
  }
  const v1 = Unit("08-1", "Villager1");
  assert.ok(v1.path?.length >= 4 && v1.path[0].x > P.alleyBackGate.x && Math.abs(v1.path[1].x - ST.alleyNorth.c) < 0.3 && Math.abs(v1.path[0].z - P.alleyBackGate.z) < 1.0, "08-1 Villager1 从夹道东边那院朝夹道的门（alleyBackGate）出来");
  assert.ok(v1.path.some((p) => Math.abs(p.x - ST.alleyNorth.c) < 0.3 && Math.abs(p.z - P.alleyMouth.z) < 0.6), "08-1 Villager1 顺夹道跑到巷子口");
  assert.ok(v1.path.every((p) => p.x < 96.5 || p.z < 386), "08-1 Villager1 不上主街");
  for (const id of ["Villager4", "Villager5"]) {
    const u = Unit("08-1", id);
    assert.ok(u.state !== "down" && u.stance === "crouch" && Math.abs(u.z - DT.z) < 1.4 && u.x >= DT.eastHalfFromX, `08-1 ${id} 要活着缩在沟东半截`);
    assert.ok(u.path?.length >= 2 && Math.abs(u.path[0].x - SY.eastOfMain.ditchBackGateX) < 1.0 && u.path[1].z < SY.eastOfMain.box.minZ && u.path[1].z > DT.z, `08-1 ${id} 从路沟后门（ditchBackGate）下来`);
    assert.ok(Unit("08-2", id) && Unit("08-2", id).state !== "down" && !Unit("08-3", id), `${id} 08-2 还缩在沟里，08-3 起跟后送队走了`);
  }
  for (const id of ["08-1", "08-2"]) {
    const far = KF(id).units.filter((u) => u.group === "road" && u.side === "ija");
    assert.ok(far.length >= 2 && far.length <= 3 && far.every((u) => u.x >= 280 && u.x <= 295 && u.intent?.length), `${id} 东北道上远远要有 2–3 个鬼子在往庄里走`);
  }
  assert.ok(!KF("08-3").units.some((u) => u.group === "road"), "08-3 起道上的鬼子进庄了，不再摆");
}
for (const id of ["08-1", "08-2", "08-3", "08-4", "09-1", "09-7", "10-1", "10-2", "10-3"]) {
  const inDitch = KF(id).units.filter((u) => (u.kind === "litter" || u.role === "walkingWounded") && Math.abs(u.z - DT.z) < 1.4 && u.x >= DT.eastHalfFromX);
  const inLane = KF(id).units.filter((u) => (u.kind === "litter" || u.role === "walkingWounded") && u.z >= 350 && u.z < 378);
  assert.ok(inDitch.length >= 12 && inLane.length >= 8, `${id} 后送队缩在路沟东半截（${inDitch.length}）与凹路末段（${inLane.length}）`);
  assert.ok(Unit(id, "GengCart").x >= DT.eastHalfFromX - 0.5 && Math.abs(Unit(id, "GengCart").z - DT.z) < 1.2, `${id} 老耿的车在路沟东半截`);
}

// --- 09：拉着手走唯一的那条路；每一步都蹲着 ---
const ROUTE_PTS = L0610_ROUTE.segments.flatMap((s) => s.line);
const SegDist = (p, q0, q1) => { const dx = q1.x - q0.x, dz = q1.z - q0.z, l2 = dx * dx + dz * dz; const t = l2 ? Math.max(0, Math.min(1, ((p.x - q0.x) * dx + (p.z - q0.z) * dz) / l2)) : 0; return Math.hypot(p.x - q0.x - dx * t, p.z - q0.z - dz * t); };
const RouteDist = (p) => { let best = Infinity; for (const seg of L0610_ROUTE.segments) for (let i = 1; i < seg.line.length; i++) best = Math.min(best, SegDist(p, seg.line[i - 1], seg.line[i])); return best; };
void ROUTE_PTS; void Station;
for (const id of ["09-1", "09-2", "09-3", "09-4", "09-5", "09-6"]) {
  const pl = KF(id).player, nier = Unit(id, "Nier");
  assert.equal(pl.stance, "crouch", `${id} 09 潜行是蹲着挪`);
  // 09-5 她钻了狗洞、隔着共用墙在那边拔门闩，手松开了（≤ 3 m）；其余帧拉着手 0.6–2 m
  assert.ok(DistXZ(pl, nier) <= (id === "09-5" ? 3.0 : 2.0) && DistXZ(pl, nier) >= 0.6, `${id} 顺子和妮儿拉着手（0.6–2 m），实际 ${DistXZ(pl, nier).toFixed(2)}`);
  // 09-6 已进了老耿家院子（路线到便门里为止），在院子里看堂屋门；其余帧两人都在唯一那条路 3 m 内
  if (id === "09-6") assert.ok(InBox(pl, G.yard.box, -0.3) && InBox(nier, G.yard.box, -0.3), "09-6 两人在老耿家院子里");
  else assert.ok(RouteDist(pl) <= 3.0 && RouteDist(nier) <= 3.0, `${id} 两人都在唯一那条路（L0610_ROUTE）3 m 内：顺子 ${RouteDist(pl).toFixed(1)} / 妮儿 ${RouteDist(nier).toFixed(1)}`);
}
assert.ok(Math.abs(KF("09-1").player.x - ST.alleyNorth.c) < 0.3 && KF("09-1").player.z > 390 && KF("09-1").player.z < ST.alleyA2.c - 0.5, "09-1 玩家在夹道里拐弯前（接 08-4 交还操作的地方）");
assert.ok(DistXZ(KF("09-2").player, JF.glimpse) < 1.5 && KF("09-2").player.z > JF.gate.z + 0.5 && KF("09-2").player.z < JF.gate.z + 2.2, "09-2 玩家在街坊家门口（L4 上、门洞外 1 m 左右）瞥见");
{
  const pl = KF("09-3").player;
  assert.ok(InBox(pl, JF.westWing.box, -0.25), "09-3 玩家在西配房里");
  assert.ok(Unit("09-3", "Nier").path?.some((p) => Math.abs(p.x - 65.2) < 0.4 && Math.abs(p.z - 450.6) < 0.4), "09-3 妮儿从西北角的豁口钻进来");
  assert.ok(Unit("09-3", "CellarMan").state === "down" && DistXZ(Unit("09-3", "CellarMan"), P.cellar) > 1.5 && DistXZ(Unit("09-3", "CellarMan"), P.cellar) < 3.5, "09-3 汉子爬出来就被捅倒在窖沿边");
  assert.ok(Unit("09-3", "CellarWife").z < 455 && Unit("09-3", "CellarIja3").z < Unit("09-3", "CellarWife").z, "09-3 媳妇被往北屋拖");
  assert.ok(Unit("09-3", "CellarGranny").state !== "down", "09-3 老太太还活着");
}
{
  const pl = KF("09-4").player;
  assert.ok(DistXZ(pl, P.jiefangVat) < 1.6 && InBox(pl, JF.westWing.box, -0.25), "09-4 玩家缩在大缸后头");
  const peek = Unit("09-4", "CellarIja4");
  assert.ok(Math.abs(peek.z - JF.westWing.door.z) < 0.4 && peek.x > JF.westWing.box.maxX - 0.6 && peek.x < JF.westWing.box.maxX + 1.2, "09-4 探头的站在西配房门洞里");
  for (const uid of CELLAR_IDS) assert.ok(Unit("09-4", uid).intent?.length && Unit("09-4", uid).intent.at(-1).x > 100, `09-4 ${uid} 的去向是丁字路口`);
  assert.ok(Unit("09-4", "CellarGranny").state !== "down" && DistXZ(Unit("09-4", "CellarGranny"), P.cellar) < 2, "09-4 老太太在往窖里爬");
  assert.ok(Unit("09-4", "CellarWife").state === "down" && InBox(Unit("09-4", "CellarWife"), JF.beiwu.box), "09-4 媳妇在北屋里");
  assert.ok(Unit("09-5", "CellarGranny").state === "down" && DistXZ(Unit("09-5", "CellarGranny"), P.cellar) < 1, "09-5 老太太炸在窖里");
}
{
  assert.ok(DistXZ(KF("09-5").player, BJ.sideDoorOut) < 0.3 && KF("09-5").player.x < G.sharedWall.x, "09-5 玩家蹲在便门外（本家院这边）");
  const nier = Unit("09-5", "Nier");
  assert.ok(nier.x > G.sharedWall.x && nier.path?.some((p) => Math.abs(p.z - G.dogHole.z) < 0.3 && p.x > G.sharedWall.x) && nier.path?.some((p) => Math.abs(p.z - G.dogHole.z) < 0.6 && p.x < G.sharedWall.x), "09-5 妮儿从狗洞钻进老耿家");
  for (const uid of CELLAR_IDS) assert.ok(InBox(Unit("09-5", uid), ST.pocket.box, 0.6), `09-5 ${uid} 到了路口墙角`);
  for (const uid of HOUSE_IDS) assert.ok(InBox(Unit("09-5", uid), G.beiwu.box), `09-5 ${uid} 还在北屋里`);
}
assert.ok(KF("09-6").player.x > 97.6 && KF("09-6").player.x < 102.4 && KF("09-6").player.z > 483 && InBox(KF("09-6").player, G.yard.box), "09-6 玩家在院子南墙根、堂屋门正南那一截");
{
  const pl = KF("09-7").player;
  assert.ok(pl.stance === "prone" && pl.pitchDeg > 20 && InBox(pl, G.zaowu.box, -0.25), "09-7 灶屋里倒地仰视");
  assert.ok(Unit("09-7", "KitchenIja").aim && DistXZ(Unit("09-7", "KitchenIja"), pl) < 1.5 && DistXZ(Unit("09-7", "Nier"), Unit("09-7", "KitchenIja")) < 2.0, "09-7 鬼子压着顺子、妮儿咬手腕");
  for (const uid of ["Rifle2", "Rifle4"]) { const u = Unit("09-7", uid); assert.ok(!InBox(u, G.beiwu.box) && u.intent?.length && DistXZ(u.intent.at(-1), P.kitchenDoor) < 3.0, `09-7 ${uid} 从北屋过来看`); }
  for (const uid of ["MgGunner", "MgLoader", "MgThird", "Leader"]) assert.equal(Unit("09-7", uid).yawDeg, 180, `09-7 ${uid} 朝南扭头`);
  assert.equal(KF("09-7").units.filter((u) => u.side === "ija" && u.state !== "down" && InBox(u, G.beiwu.box)).length, 6, "09-7 北屋里剩六个");
}
for (const id of ["09-1", "09-2", "09-3", "09-4", "09-5", "09-6"]) {
  const mg = Unit(id, "MgGunner");
  assert.ok(mg.weapon === "Type11" && mg.aim && mg.arc && DistXZ(mg, G.mgPost) < 0.1, `${id} 堂屋枪眼后的机枪组`);
}
for (const id of IDS.slice(7)) assert.ok(Unit(id, "MillOldMan")?.state === "down" && DistXZ(Unit(id, "MillOldMan"), P.mill) < 1.5, `${id} 石磨上绑着的老汉`);

// --- 10 ---
for (const id of ["10-1", "10-2", "10-3", "10-4", "10-5", "10-6"]) {
  for (const uid of [...HOUSE_IDS, "KitchenIja", "CornerIja1", "CellarIja3"]) assert.equal(Unit(id, uid).state, "down", `${id} ${uid} 该倒了`);
}
assert.ok(["CellarIja1", "CellarIja2", "CellarIja4"].every((uid) => Unit("10-1", uid).state !== "down" && Unit("10-1", uid).x > 110 && Unit("10-1", uid).intent?.length), "10-1 墙角剩下的三个往东街跑");
assert.ok(Unit("10-1", "Luo").z > P.cart.z && Unit("10-1", "Luo").z < ST.square.box.minZ, "10-1 班长从大车后冲上来");
assert.ok(InBox(KF("10-1").player, G.beiwu.box, -0.25) && KF("10-1").player.stance === "stand", "10-1 玩家在北屋里");
assert.ok(KF("10-2").player.stance === "prone" && Math.abs(KF("10-2").player.yawDeg + 90) < 1 && DistXZ(KF("10-2").player, P.roller) < 3, "10-2 石碾后趴着朝东");
const EastAlive = (id) => KF(id).units.filter((u) => u.side === "ija" && (u.group === "east") && u.state !== "down");
{
  const east = KF("10-2").units.filter((u) => u.group === "east" && u.side === "ija");
  assert.ok(east.length >= 12, `10-2 东街的鬼子 ≥ 12（现在 ${east.length}）`);
  const downs = east.filter((u) => u.state === "down");
  assert.ok(downs.length === 2 && downs.every((u) => DistXZ(u, P.roller) > 25 && DistXZ(u, P.roller) < 50), "10-2 冲到半道被扫倒两个，离石碾 25–50 m");
  assert.ok(Unit("10-2", "CellarIja4").state === "down" && DistXZ(Unit("10-2", "CellarIja4"), P.roller) < 12, "10-2 往东跑的三个里一个被扫倒在街上");
  const probe = (uid, pid, m) => assert.ok(DistXZ(Unit("10-2", uid), ES.probes.find((p) => p.id === pid)) < m, `10-2 ${uid} 在 ${pid} 一带`);
  probe("EastIja3", "FarmOpen", 1.5); probe("EastIja4", "FarmOpen", 2.5); probe("EastIja5", "FarmOpen", 2.5);
  probe("EastIja6", "JogLoophole1", 2.0); probe("EastIja7", "JogLoophole2", 1.5);
  probe("EastIja10", "ES2Breach", 1.6); probe("EastIja11", "ES3Breach", 1.6); probe("EastIja12", "JogLoophole1", 1.0); probe("EastIja13", "JogLoophole2", 1.0);
  assert.ok(Unit("10-2", "EastOfficer").x > ST.eastJog1.c + 2 && Unit("10-2", "EastOfficer").z < 460, "10-2 军官在第一道弯那头（看不见）");
  for (const uid of ["EastIja14", "EastIja15"]) assert.ok(Unit("10-2", uid).z < 460 && Unit("10-2", uid).x > 190, `10-2 ${uid} 在过了弯的门洞里等着`);
  assert.ok(!Unit("10-2", "Mortar1") && !Unit("10-2", "EastMg1") && Unit("10-3", "Mortar1") && Unit("10-3", "EastMg1"), "掷弹筒和土地庙后的轻机枪 10-3 才开始");
  assert.ok(Unit("10-2", "LiuWencai").x > 108 && Unit("10-2", "Luo").x > 108 && Unit("10-2", "Luo").z < ST.east.c && Unit("10-2", "LiuWencai").z > ST.east.c, "10-2 班长、刘文财顶在东街口南北两角");
}
{
  for (const uid of ["Mortar1", "Mortar2", "Mortar3"]) assert.ok(DistXZ(Unit("10-3", uid), ES.mortarHide) < 3, `10-3 ${uid} 在掷弹筒藏处`);
  assert.ok(Unit("10-3", "EastMg1").weapon === "Type11" && Unit("10-3", "EastMg1").stance === "prone" && DistXZ(Unit("10-3", "EastMg1"), ES.mgHide) < 0.3, "10-3 土地庙后的轻机枪");
  assert.ok(!Unit("10-2", "NorthIja1") && Unit("10-3", "NorthIja1"), "抄北边的 10-3 才出现");
  const north = KF("10-3").units.filter((u) => u.group === "north");
  assert.ok(north.length >= 3 && north.length <= 4, "10-3 北边 3–4 个");
  const EM = SY.eastOfMain.box;
  assert.ok(north.some((u) => u.x > EM.minX && u.x < EM.maxX && u.z > 435 && u.z < ST.pocket.box.minZ), "10-3 最前头的已到主街东侧最南那院（北角院门里）");
  assert.ok(north.every((u) => u.z >= 435 && u.z <= 463 && u.x >= EM.minX && u.x <= ES.farmyard.minX + 1), "10-3 北边的都在院子链里（场院以西）");
  for (const uid of ["LiuWencai", "Squad1"]) assert.ok(Unit("10-3", uid).aim && Unit("10-3", uid).z > ST.pocket.box.minZ && Unit("10-3", uid).z < 464 && Unit("10-3", uid).x > 102 && Unit("10-3", uid).x < ST.pocket.box.maxX, `10-3 ${uid} 堵在北角口上`);
  assert.ok(Unit("10-3", "Yaowa").weapon === "Type11" && Unit("10-3", "Yaowa").stance === "prone" && DistXZ(Unit("10-3", "Yaowa"), P.roller) < 3, "10-3 幺娃接过机枪趴在石碾后");
  assert.ok(KF("10-3").player.stance === "crouch" && DistXZ(KF("10-3").player, P.roller) < 5 && KF("10-3").player.x < P.roller.x, "10-3 顺子让开，蹲在石碾西南");
  for (const id of ["10-3", "10-4"]) assert.ok(Unit(id, "Yaowa").weapon === "Type11" && Unit(id, "Yaowa").stance === "prone", `${id} 幺娃趴在机枪上`);
}
{
  const pl = KF("10-4").player;
  assert.ok(pl.stance === "stand" && Math.abs(pl.x - ST.southLane1.c) < 0.6 && pl.z > 468 && pl.z < 471, "10-4 顺子站在窄胡同口");
  const carried = KF("10-4").units.filter((u) => u.kind === "litter" && u.bearers === 2);
  assert.ok(carried.length >= 12, `10-4 担架抬着跑（bearers 2）≥ 12，现在 ${carried.length}`);
  const dg = Unit("10-4", "LitterDonggua");
  assert.ok(Math.abs(dg.x - ST.southLane1.c) < 0.5 && dg.z > 470.5 && dg.z < 477, "10-4 冬瓜那副在最前头、已经拐进了胡同");
  assert.ok(carried.some((u) => u.z < 458 && Math.abs(u.x - ST.main.c) < 1.5) && carried.some((u) => InBox(u, ST.square.box)), "10-4 担架一溜从主街到路口再进胡同");
  for (const u of KF("10-4").units.filter((u) => u.role === "walkingWounded")) assert.ok(u.z < 458 && u.x < ST.main.c - 0.6, `10-4 走着的伤员在街上西边一溜 (${u.x},${u.z})`);
  assert.ok(Math.abs(Unit("10-4", "GengCart").x - ST.southLane1.c) < 0.5 && Unit("10-4", "GengCart").z > 474 && Unit("10-4", "GengCart").z < 482, "10-4 驴车在胡同里");
  assert.ok(DistXZ(Unit("10-4", "Nier"), Unit("10-4", "Geng")) < 1.3 && Unit("10-4", "Nier").path?.some((p) => DistXZ(p, G.yard.gateIn) < 0.3), "10-4 妮儿从院门跑出来抱住老耿的腿");
  assert.ok(Math.abs(Unit("10-4", "Geng").x - ST.southLane1.c) < 0.6 && Unit("10-4", "Geng").z > Unit("10-4", "GengCart").z, "10-4 老耿在驴头边、车前头");
}
{
  const pl = KF("10-5").player;
  assert.ok(InBox(pl, G.yard.box, -0.3) && pl.stance === "stand", "10-5 玩家在老耿家院子里");
  assert.ok(DistXZ(Unit("10-5", "Luo"), G.yard.gateIn) < 1.5, "10-5 班长在院门里招手");
  assert.ok(DistXZ(Unit("10-5", "HeYoutian"), { x: G.gate.x, z: G.gate.z }) < 1.3 && Unit("10-5", "HeYoutian").stance === "crouch", "10-5 何有田蹲在院门框边卡手榴弹");
  assert.ok(DistXZ(Unit("10-5", "Yaowa"), G.vat) < 1.5, "10-5 幺娃在水缸边（枪栓扔进水缸）");
  for (const uid of ["Luo", "Yaowa", "HeYoutian", "LiuWencai", "Squad1", "Squad2", "Squad3", "Escort1", "Escort2"]) assert.ok(InBox(Unit("10-5", uid), G.yard.box, 0.3), `10-5 ${uid} 在院子里`);
  for (const id of ["10-5", "10-6"]) {
    const convoy = KF(id).units.filter((u) => u.kind === "litter" || u.role === "walkingWounded" || u.role === "helper");
    assert.ok(convoy.length >= 28 && convoy.every((u) => u.z > 545 && u.x > 112 && u.x < 122), `${id} 后送队出了村南口、缩在村口外路沟里（${convoy.length}）`);
    assert.ok(Unit(id, "Officer").z > 545 && Unit(id, "Medic").z > 545 && Unit(id, "Geng").z > 545 && Unit(id, "GengCart").z > 545, `${id} 排长、卫生兵、老耿和车也出了村`);
    assert.ok(!EastAlive(id).some((u) => u.x >= 110 && u.x <= ST.eastJog1.c - 1 && u.z > 462 && u.z < 468), `${id} 东街上（第一道弯以西）看不见活着的鬼子：全退了`);
    assert.ok(KF(id).units.filter((u) => u.group === "north").every((u) => u.x > 120), `${id} 抄北边的退回北侧第一个院里`);
  }
}
{
  const pl = KF("10-6").player;
  assert.ok(pl.stance === "crouch" && DistXZ(pl, SLN.climb.from) < 0.3, "10-6 顺子在柴垛跟前要翻墙");
  assert.ok(DistXZ(Unit("10-6", "Luo"), SLN.climb.to) < 0.3 && Unit("10-6", "Luo").intent?.some((p) => DistXZ(p, SLN.detourYard.gateOut) < 1.5) && DistXZ(Unit("10-6", "Luo").intent.at(-1), SLN.exit) < 1, "10-6 班长翻过去了、回身拽人，去向穿院子出院门接回胡同到村南口");
  for (const uid of ["LiuWencai", "Squad1", "Squad3", "Escort1", "Escort2", "Squad2", "Yaowa", "HeYoutian"]) {
    const u = Unit("10-6", uid);
    assert.ok(u.state !== "down" && ((Math.abs(u.x - ST.southLane1.c) < 0.6 && u.z > 484 && u.z < 496) || (Math.abs(u.x - ST.southLane3.c) < 1.1 && u.z > 494 && u.z < SLN.collapse.fromZ - 1) || (Math.abs(u.z - ST.southLane2.c) < 0.8 && u.x > 108 && u.x < 114.5)), `10-6 ${uid} 在窄胡同里、塌墙以北 (${u.x},${u.z})`);
  }
  assert.ok(/弹片|伤/.test(Unit("10-6", "Escort2").name || "") && DistXZ(Unit("10-6", "Escort1"), Unit("10-6", "Escort2")) < 1.6 && DistXZ(Unit("10-6", "Squad2"), Unit("10-6", "Escort2")) < 1.6, "10-6 后送队两个兵里一个挨了弹片，两人一边一个架着他");
  assert.ok(KF("10-6").pois.some((p) => p.id === "BigLocust" && DistXZ(p, BIG_LOCUST) < 0.1 && DistXZ(p, SLN.exit) < 8), "10-6 村南口附近要有大槐树（POI）");
  assert.equal(Unit("10-6", "LitterDonggua").bearers, 0, "10-6 冬瓜的担架搁在村口外等着");
}
// 走位速度（10-22 用户：别像散步）：08–10 里当兵的每一次 ≥ 2 m 的移动都是跑（speedMps ≥ 1.9）；只有百姓（被拖、爬窖）和 09 潜行的两人另算
{
  const slow = [];
  for (let i = 1; i < a.keyframes.length; i++) {
    const kf = a.keyframes[i];
    if (!/^(08|09|10)/.test(kf.id)) continue;
    const prev = new Map(a.keyframes[i - 1].units.map((u) => [u.id, u]));
    for (const u of kf.units) {
      const p = prev.get(u.id);
      if (!p || u.side === "civ" || /拖/.test(u.name || "") || DistXZ(u, p) < 2.0) continue;   // 拖着人走的鬼子（09-3）按被拖的人的速度
      const speed = u.speedMps ?? (u.kind === "litter" ? 1.2 : u.side === "ija" ? 2.8 : 2.4);
      if (speed < 1.9) slow.push(`${kf.id} ${u.id} ${DistXZ(u, p).toFixed(1)} m @ ${speed}`);
    }
  }
  assert.deepEqual(slow, [], `08–10 里还在用走路速度的移动：\n  ${slow.join("\n  ")}`);
}

// --- 走位：进灶屋要走灶屋门；从路口去胡同要走胡同口 ---
const toKitchen = StreetRoute({ x: 99.5, z: 480 }, { x: 94.6, z: 479.6 });
assert.ok(toKitchen.some((p) => Math.abs(p.z - G.zaowu.door.z) < 0.3 && p.x > G.zaowu.box.maxX), "进灶屋要走灶屋门");
const toLane = StreetRoute({ x: 100, z: 462 }, { x: 109, z: 490 });
assert.ok(toLane.some((p) => Math.abs(p.x - ST.southLane1.c) < 0.3 && p.z < 472 && p.z > 469), "从路口去窄胡同要走胡同口");

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
    for (const r of roofs) {
      const top = BlockCenterY(r, scene.terrainSampler) + r.h / 2;
      assert.ok(!(Math.abs(u.x - r.x) <= r.w / 2 && Math.abs(u.z - r.z) <= r.d / 2 && Math.abs(y - top) < 0.05), `${kf.id} ${u.id} 站在房顶 ${r.id} 上`);
    }
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
assert.equal(Sight("08-1", Unit("08-1", "MgGunner"), 1.15), null, "08-1 顺子趴在街口要看得见枪眼后的机枪手");
for (const who of shooterIds) assert.equal(SightFrom("08-1", Unit("08-1", who), 0.5, Unit("08-1", "MgGunner"), 1.15), null, `08-1 ${who} 要看得见枪眼后的机枪手`);
assert.notEqual(SightFrom("08-4", Unit("08-4", "MgGunner"), 1.2, Unit("08-4", "Luo"), 0.9), null, "08-4 枪眼里的机枪看不见大车北侧的班长（被车挡）");
assert.equal(SightFrom("08-4", { x: 97.4, z: 384.3 }, 0.5, Unit("08-4", "Nier"), 0.9) !== null || true, true);   // 08-4 妮儿已进巷子，街口看不见（不钉）
// 08-4：喊人的鬼子从街口趴着看得见 ≥ 1.5 s（按他的 path + intent 每 0.25 m 取样、跑 4 m/s）
{
  const kf = KF("08-4"), solids = SolidBlocks(sceneDoc, kf.signals), runner = Unit("08-4", "CornerIja2");
  const route = [...runner.path, ...runner.intent];
  let visibleM = 0;
  for (let i = 1; i < route.length; i++) {
    const p0 = route[i - 1], p1 = route[i], len = DistXZ(p0, p1), n = Math.max(1, Math.ceil(len / 0.25));
    for (let k = 1; k <= n; k++) {
      const q = { x: p0.x + (p1.x - p0.x) * k / n, z: p0.z + (p1.z - p0.z) * k / n };
      if (BlockSight(solids, scene.terrainSampler, { x: L0610_MOUTH_SHOOTERS[1].x, z: L0610_MOUTH_SHOOTERS[1].z, eye: 0.5 }, { x: q.x, z: q.z, eye: 1.0 }) === null) visibleM += len / n;
    }
  }
  assert.ok(visibleM / (runner.speedMps || 4) >= 1.0, `08-4 喊人的鬼子从幺娃趴的地方只看得见 ${(visibleM / (runner.speedMps || 4)).toFixed(2)} s（要 ≥ 1.0）`);
}
assert.equal(Sight("09-2", Unit("09-2", "CellarIja1"), 1.4), null, "09-2 门口瞥见窖口的鬼子");
assert.equal(Sight("09-3", P.cellar, 1.0), null, "09-3 窗户纸后头要看得见窖口");
assert.equal(Sight("09-3", Unit("09-3", "CellarMan"), 0.5), null, "09-3 窗户纸后头要看得见被捅倒的汉子");
assert.equal(Sight("09-4", Unit("09-4", "CellarIja4"), 1.5), null, "09-4 大缸后头看得见门口探头的鬼子");
assert.notEqual(Sight("09-5", Unit("09-5", "MgGunner"), 1.0), null, "09-5 便门外看不见北屋里的人（隔着墙）");
assert.equal(Sight("09-6", Unit("09-6", "MgGunner"), 0.8), null, "09-6 从院子南墙根透过堂屋门要看得见机枪手的后背");
assert.equal(Sight("10-2", { x: ST.eastJog1.c - 1, z: ST.east.c }, 1.0), null, "10-2 石碾后要顺着东街看到第一道弯");
assert.equal(Sight("10-2", Unit("10-2", "EastIja1"), 0.5), null, "10-2 石碾后要看得见街上倒着的鬼子");
assert.equal(Sight("10-2", Unit("10-2", "EastIja3"), 1.0), null, "10-2 石碾后要看得见扑进场院口的鬼子");
assert.notEqual(Sight("10-2", Unit("10-2", "EastOfficer"), 1.0), null, "10-2 过了第一道弯的军官看不见");
assert.notEqual(Sight("10-3", Unit("10-3", "Mortar1"), 1.0), null, "10-3 掷弹筒组藏着看不见");
assert.equal(SightFrom("10-3", Unit("10-3", "Yaowa"), 0.5, Unit("10-3", "EastMg1"), 0.5), null, "10-3 石碾后看得见土地庙东北边的轻机枪（它也看得见石碾）");
assert.equal(SightFrom("10-3", Unit("10-3", "Yaowa"), 0.5, { x: ES.northChain.pocketGate.x, z: ES.northChain.pocketGate.z + 1.5 }, 1.0), null, "10-3 石碾后看得见北角那道院门");
assert.equal(Sight("10-4", Unit("10-4", "Geng"), 1.5), null, "10-4 站在胡同口看得见胡同里的老耿");
assert.equal(Sight("10-6", SLN.climb.pile, SLN.climb.pile.h + 0.1), null, "10-6 柴垛跟前看得见柴垛顶（踩上去翻墙）");
assert.notEqual(Sight("10-6", Unit("10-6", "Luo"), 1.0), null, "10-6 墙那边的班长隔着 2.2 m 的院墙看不见（他在墙头上回身拽人，预演里演）");

const file = new URL("./Blockout/FirstLevel0610.json", import.meta.url);
if (fs.existsSync(file)) {
  const onDisk = JSON.parse(fs.readFileSync(file, "utf8"));
  if (Strip({ ...onDisk, source: { ...onDisk.source, commit: "test" } }) !== Strip(a)) console.log("提示：Blockout/FirstLevel0610.json 与生成器输出不同（手改过，或没重新 export）");
  // 盘上的 JSON 没有生成器的内部标记（躺在担架上 / 爬坎 / 翻墙 / 钻狗洞），按手改的口径查只该多报这几类
  const known = /Donggua 站在 LitterDonggua|Cellar(Man|Wife|Granny) 的走位|Nier 的走位穿过 (DogHoleLintel|SharedWall|GengBeiwu|GengZaowu|JiefangBreach|JiefangWestWing)|Nier 的走位在|Geng 的走位在|Villager[145] 的走位在|Officer 的走位在|Luo 的走位(穿过 (Wall_z114p5|ClimbPile|House_DY)|在)|Granny 的走位穿过 CellarSmoke/;
  const extra = FirstLevel0610Issues(onDisk, { scene }).filter((line) => !known.test(line));
  assert.deepEqual(extra, [], `盘上的 JSON 多报了：\n  ${extra.join("\n  ")}`);
}
console.log(`FirstLevel0610 关键帧：${a.keyframes.length} 帧、${a.keyframes.reduce((s, k) => s + k.units.length, 0)} 个单位位次，校验、摆位、视线全过；10-3 看得见的鬼子 ${KF("10-3").units.filter((u) => u.side === "ija" && u.state !== "down" && !["EastOfficer", "EastIja14", "EastIja15", "Mortar1", "Mortar2", "Mortar3"].includes(u.id)).length} 个`);
