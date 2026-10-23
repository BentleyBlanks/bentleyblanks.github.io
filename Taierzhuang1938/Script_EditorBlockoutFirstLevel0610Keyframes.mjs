// ===========================================================================
// Script_EditorBlockoutFirstLevel0610Keyframes.mjs —— 第一关 06–10 新剧本白盒（关卡键 FirstLevel0610）的关键帧配置生成器（2026-10-22 第四版）
//
//   node Taierzhuang1938/Script_EditorBlockoutCli.mjs export FirstLevel0610 --force   → Blockout/FirstLevel0610.json
//
// 口径：
//   · 剧本（台词、谁做什么）以 Notion「第一关｜往南的路 · 剧本」06–10（10-22 定稿）为准；关键帧 24 帧（06 三帧、07 四帧、08 四帧、09 七帧、10 六帧），id 固定，配音按 id 挂；
//     距离、站位已换算成世界坐标写在 Data_EditorBlockoutFirstLevel0610Space.mjs（第六版空间）—— 本文件所有坐标都从那里算，不手抄数字。
//   · 每一拍先让玩家亲眼看到出了什么事，再给一句话的下一步；「掩护」「清理」「护送」不进 next。台词不逐句写进关键帧，只写「此时」。
//   · 坐标 X 向东、Z 向南、米；yawDeg 0 朝北、+90 朝西、−90 朝东、180 朝南（同 Script_EditorBlockoutConfig）。
//   · 第四版剧情（10-22）：老耿家是半面槽院，机枪从北屋后墙的枪眼里打；08 正面打（四人趴在街口坡道上压枪眼）；08-4 妮儿顺路沟往西钻巷子、顺子追，
//     班长冲巷子口定计（带到她摸到屁股后头），再带三个人贴主街东边门洞摸到大车后头被压住，墙角一个鬼子去东街喊人；
//     09 顺子抓住妮儿、拉着手走唯一的一条路：街坊家门口一眼瞥见 → 从西配房塌掉的西北角钻进去、窗户纸后头看窖口（捂嘴）→ 缩到大缸后、鬼子探头、
//     哨子响、搜窖那伙去路口 → 穿院子、夹道、本家院，妮儿钻狗洞拔便门 → 老耿家后院看见堂屋门里机枪组的后背 → 灶屋门口被扑进灶屋、妮儿咬手腕、屋里打；
//     10 从背后打掉北屋里的六个，石碾后守路口（试探 / 掷弹筒 / 砸门抄北边）、后送队贴着石碾拐进窄胡同，炮一来进屋再撤、炮里走窄胡同翻墙出村南口。
//   · 走位速度（10-22 用户：别像散步）：挨着枪的一律跑 / 猫腰跑（3.2 m/s）、抬担架小跑（1.9）、鬼子跑 3.6；只有 09 潜行蹲着慢慢挪（0.8–1.2）；10-6 全程跑。
//   · 日军人数（08 开头一个分队 15 人）：北屋机枪组 3 + 分队长 + 东西两间枪眼 4 个兵；路口墙角 2；街坊家搜窖 4；老耿家灶屋 1。
//     08-4 墙角一个往东跑去喊人；09-7 灶屋 1 死、北屋过来的两个（东西两间各一个）也死在灶屋里；10-1 北屋剩下的六个全被从背后打倒，
//     墙角那几个（搜窖的四个 + 留下的一个）两面挨打倒两个、三个往东街跑；10-2 起东街是喊来的小队（约 45 人，白盒只摆看得见的那十几个 + 掷弹筒 3 + 抄北边 4）。
//   · 两路（2026-10-24，用户「班长和顺子应该分两路穿插巷口，而不是傻傻的等着」）：08-4 末班长带何有田、Escort1 从大车后头钻进主街东边 z 432.5 那道敞着的院门（EM2），
//     09-1 刚进院门、09-2 / 09-3 在 EM2 院里、09-4 踩柴垛搭人梯翻 z 435 那道墙、09-5 落在 EM3 北屋西边的空地上、09-6 / 09-7 蹲在 EM3 南门（pocket 北门）后头——
//     门外就是墙角那伙鬼子；09-7 末隔墙甩两颗手榴弹、撞开门（EastGateBurst）贴身砍；10-1 班长三人在 pocket 里。正面留人吸火：坡道上三个打一枪换个窝（09 每帧换一次窝），
//     Escort2 留在大车后头时不时冒头打一枪。站位全程不在三个枪眼和墙角哨的视线里（L0610_EAST_YARD_ROUTE；KeyframesTest 逐帧核）。
//
// 走位：同一个人在相邻关键帧里 id 不变；生成时按村里的路网（凹路、路沟、街口坡道、主街、丁字路口、东街、巷子、L4、街坊家、夹道、本家院、
// 老耿家、便门 / 狗洞、窄胡同、绕路的院子、北边院子链）自动排 path，不让人直线穿墙；野地里的人走直线。只在新帧出现的人写 path 起点「走进来」，只在旧帧的人写 intent「走出去」。
//
// 摆位检查（push 进 issues，CLI 打出来）：玩家 / 单位出界；玩家站进实心块、单位站进高块（读 Blockout/FirstLevel0610.scene.json，
// 按两帧 signals 算 gates）；两人重叠（< 0.6 m）、人站在担架上；过渡路线穿高块（钻狗洞的妮儿例外）；路线上 1 m 内高差超过 1.2 m（爬坎 / 翻墙的例外）。
// 纯函数式生成：不读时钟、不读 git；只在 node 里读场景文件做检查。
// ===========================================================================

import { BLOCKOUT_SCHEMA, PlanTransition, NormalizeBlockout, YawDegFromTo } from "./Script_EditorBlockoutConfig.mjs";
import { BlockStandSampler } from "./Script_EditorBlockoutPrevizPlan.mjs";
import {
  L0610_LEVEL_KEY, L0610_TITLE, L0610_VERSION, L0610_BOUNDS, L0610_PLACES as PL, L0610_LANE, L0610_DITCH as DT, L0610_STREETS as ST, L0610_GENG as G,
  L0610_JIEFANG as JF, L0610_BENJIA as BJ, L0610_EAST_STREET as ES, L0610_SOUTH_LANE as SLN, L0610_STREET_YARDS as SY, L0610_SIGNALS as SIG, L0610_FROM_0105,
  L0610_MOUTH_SHOOTERS, LanePointAtZ, L0610_EAST_ROAD, L0610_EAST_YARD_ROUTE as EYR, L0610_RUBBLE, L0610_WATCHTOWER, PointAlong, PointBeside, LineLength, Station,
} from "./Data_EditorBlockoutFirstLevel0610Space.mjs";
/** 巷子第一道弯往西那条死胡同口上的瓦砾（09-1 顺子走到头被它堵死）。 */
const L0610_RUBBLE_WEST = L0610_RUBBLE.find((r) => r.blocks === "alleyWestStub");

export const FIRST_LEVEL_0610_GENERATOR = "Script_EditorBlockoutCli.mjs export FirstLevel0610";

// ---------------------------------------------------------------------------
// 小工具

const R2 = (v) => Math.round(v * 100) / 100;
const R1 = (v) => Math.round(v * 10) / 10;
const Pt = (x, z) => ({ x: R2(x), z: R2(z) });
const Dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const Yaw = (from, to) => R1(YawDegFromTo(from, to));
const Off = (p, dx, dz) => Pt(p.x + dx, p.z + dz);
/** 凹路上按 z 取点（lat > 0 = 往南走的左手 = 东）。 */
const LZ = (z, lat = 0) => { const p = LanePointAtZ(z, lat); return { x: R2(p.x), z: R2(p.z), heading: R1(p.headingYawDeg) }; };
/**
 * 东北进庄的道（第五版 L0610_EAST_ROAD：从东街东头 (232,465) 往东北到 (300,320)，x 单调增）上按 x 取中线上的点；
 * lat 按折线的行进方向（往东北）左手偏。鬼子顺这条道往庄子走 = 往 x 小的方向走，面朝折线上 x 更小的那一点。
 */
export function RoadPointAtX(x, lat = 0) {
  const line = L0610_EAST_ROAD.line;
  let walked = 0;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1], b = line[i], len = Math.hypot(b.x - a.x, b.z - a.z);
    if (b.x !== a.x && (x - a.x) * (x - b.x) <= 0) { const p = PointBeside(line, walked + len * (x - a.x) / (b.x - a.x), lat); return Pt(p.x, p.z); }
    walked += len;
  }
  const p = PointBeside(line, x <= line[0].x ? 0 : LineLength(line), lat);
  return Pt(p.x, p.z);
}
/** 折线上从头算 s 米处的点（超出就夹在两端）。 */
function AlongLine(line, s) { const p = PointAlong(line, Math.max(0, Math.min(LineLength(line), s))); return Pt(p.x, p.z); }

// 街巷的几个常用数（第六版字段：axis / c / from / to / halfW）
const MAIN_X = ST.main.c, MAIN_FROM = ST.main.from;
const EAST_Z = ST.east.c, EAST_FROM = ST.east.from;
const ALLEY_X = ST.alleyNorth.c, A2_Z = ST.alleyA2.c, A3_X = ST.alleyA3.c, A4_Z = ST.alleyA4.c, A5_X = ST.alleyA5.c, L4_Z = ST.l4.c, PASSAGE_X = ST.passage.c, PASSAGE_END_Z = ST.passageEnd.c;
const LANE1_X = ST.southLane1.c, LANE3_X = ST.southLane3.c, EXIT_X = ST.backLane.c;

// ---------------------------------------------------------------------------
// 路网：干沟中心线 + 凹路 + 路沟 + 街口坡道 + 街 + 巷子 + 各道门；院子 / 屋里 / 路沟是能自由走动的区域，门是区域的出入口。

const GULLY = L0610_FROM_0105.gully;
const NET_SNAP_M = 3.0; // 离路中线这么近就算在路上

const NODE = {};
const nodes = [], edges = [], areas = [];
const Node = (name, x, z) => { NODE[name] = nodes.length; nodes.push({ x: R2(x), z: R2(z), name }); return NODE[name]; };
const Edge = (a, b) => edges.push([NODE[a], NODE[b]]);
const Chain = (...names) => { for (let i = 1; i < names.length; i++) Edge(names[i - 1], names[i]); };
const Area = (name, box, ...portals) => areas.push({ name, box, portals: portals.map((n) => NODE[n]) });
const Box = (minX, maxX, minZ, maxZ) => ({ minX, maxX, minZ, maxZ });

// 凹路（从凹路口到路沟北沿）
L0610_LANE.line.forEach((p, i) => Node(`Lane${i}`, p.x, p.z));
for (let i = 1; i < L0610_LANE.line.length; i++) Edge(`Lane${i - 1}`, `Lane${i}`);
// 干沟（10-20 改弯沟）：沟底中心线 + 中弯往南的支沟，支沟南头接凹路口（Lane0）
GULLY.line.forEach((p, i) => Node(`Gully${i}`, p.x, p.z));
for (let i = 1; i < GULLY.line.length; i++) Edge(`Gully${i - 1}`, `Gully${i}`);
{
  const mid = GULLY.line.findIndex((p) => p.x === GULLY.branch[0].x && p.z === GULLY.branch[0].z);
  GULLY.branch.forEach((p, i) => { if (i > 0) Node(`GullyBay${i}`, p.x, p.z); });
  Edge(`Gully${mid}`, "GullyBay1");
  for (let i = 2; i < GULLY.branch.length; i++) Edge(`GullyBay${i - 1}`, `GullyBay${i}`);
  Edge(`GullyBay${GULLY.branch.length - 1}`, "Lane0");
}
const LANE_END = `Lane${L0610_LANE.line.length - 1}`;
// 村口路沟（沟底）→ 街口坡道 → 主街（过翻倒的大车走西边）→ 丁字路口 → 北角 / 东街（拐两道弯到东头）
Node("DitchW", DT.fromX + 4, DT.z); Node("DitchAlley", ALLEY_X, DT.z); Node("DitchMid", 92, DT.z); Node("DitchStreet", MAIN_X, DT.z); Node("DitchE", DT.toX - 2, DT.z);
Chain("DitchW", "DitchAlley", "DitchMid", "DitchStreet", "DitchE"); Edge(LANE_END, "DitchStreet");
Node("StreetN", MAIN_X, MAIN_FROM + 1.5); Node("StreetMid", MAIN_X, 420); Node("StreetCartW", MAIN_X - 2.2, PL.cart.z); Node("StreetS", MAIN_X, ST.square.box.minZ + 2);
Node("Square", PL.square.x, PL.square.z); Node("Pocket", PL.pocket.x, PL.pocket.z); Node("EastMouth", EAST_FROM - 0.8, EAST_Z);
Node("EN1GateS", ES.probes[0].x, EAST_Z); Node("FarmOpenS", ES.probes[2].x, EAST_Z); Node("EastJog1N", ST.eastJog1.c, EAST_Z); Node("EastJog1S", ST.eastJog1.c, ST.east2.c);
Node("EN3aOut", ES.probes[7].x, ST.east2.c); Node("EN3bOut", ES.probes[8].x, ST.east2.c); Node("East2End", ST.eastJog2.c, ST.east2.c); Node("EastJog2N", ST.eastJog2.c, ST.east3.c); Node("EastEnd", ST.east3.to, ST.east3.c);
Chain("DitchStreet", "StreetN", "StreetMid", "StreetCartW", "StreetS", "Square", "EastMouth", "EN1GateS", "FarmOpenS", "EastJog1N", "EastJog1S", "EN3aOut", "EN3bOut", "East2End", "EastJog2N", "EastEnd");
Edge("Square", "Pocket");
// 巷子（顺子和妮儿那条唯一的路）：巷子口 → 夹道 → 第一道弯往西 → 往南 → 第二道弯往西 → 街坊家西墙外的窄夹道 → L4 → 东头接丁字路口
Node("AlleyMouth", ALLEY_X, PL.alleyMouth.z); Node("A1S", ALLEY_X, A2_Z); Node("A2W", A3_X, A2_Z); Node("A3S", A3_X, A4_Z); Node("A4W", A5_X, A4_Z);
Node("A5Breach", A5_X, 450); Node("A5S", A5_X, L4_Z); Node("L4Glimpse", JF.gate.x, L4_Z); Node("L4Passage", PASSAGE_X, L4_Z); Node("L4Mouth", 92.6, L4_Z);
Edge("DitchAlley", "AlleyMouth"); Chain("AlleyMouth", "A1S", "A2W", "A3S", "A4W", "A5Breach", "A5S", "L4Glimpse", "L4Passage", "L4Mouth", "Square");
// 街坊家：南墙半掩的院门、西配房（东墙的门、西北角的豁口）、北屋的门
Node("JfGateIn", JF.gate.x, JF.gate.z - 1.3); Node("JfYardSW", 68.8, 464.6); Node("JfYardS", 70.5, 462.0);
Node("JfWingDoorOut", JF.westWing.box.maxX + 1.3, JF.westWing.door.z); Node("JfWingDoorIn", JF.westWing.box.maxX - 1.3, JF.westWing.door.z);
Node("JfBreachIn", 65.2, 450.6); Node("JfBeiwuDoorOut", JF.beiwu.door.x, JF.beiwu.box.maxZ + 1.3); Node("JfBeiwuDoorIn", JF.beiwu.door.x, JF.beiwu.box.maxZ - 1.3);
Chain("L4Glimpse", "JfGateIn", "JfYardSW", "JfYardS"); Edge("JfWingDoorOut", "JfWingDoorIn"); Edge("A5Breach", "JfBreachIn"); Edge("JfBeiwuDoorOut", "JfBeiwuDoorIn");
// 夹道往南到本家院的院门、院子、便门 / 狗洞
Node("PassageS", PASSAGE_X, PASSAGE_END_Z); Node("PassageEndE", BJ.gate.x, PASSAGE_END_Z); Node("BjGateIn", BJ.gate.x, BJ.gate.z - 1.4); Node("BjYardSW", 79.2, 485.0); Node("BjYardMid", 84.5, 484.6);
Node("BjSideOut", BJ.sideDoorOut.x, BJ.sideDoorOut.z); Node("SideGateE", G.yard.sideDoorIn.x, G.yard.sideDoorIn.z);
Node("BjN1", 86.6, 476.0); Node("BjN2", 90.3, 475.8); Node("DogHoleW", 91.2, 473.4); Node("DogHoleE", 92.9, G.dogHole.z); Node("GengBand", 94.0, 475.5); Node("GengBandE", 96.8, 475.6);
Chain("L4Passage", "PassageS", "PassageEndE", "BjGateIn", "BjYardSW", "BjYardMid", "BjSideOut", "SideGateE");
Chain("BjYardMid", "BjN1", "BjN2", "DogHoleW", "DogHoleE", "GengBand", "GengBandE");
// 老耿家：便门里 → 院子 → 灶屋门 / 堂屋门 / 院门；院门朝东墙外的窄胡同
Node("GengSW", 96.9, 484.6); Node("GengNW2", 97.3, 476.4); Node("GengE", 101.6, 483.4); Node("GengMid", 102.6, 482.6); Node("GengGateIn", G.yard.gateIn.x, G.yard.gateIn.z); Node("GengGateOut", LANE1_X, G.gate.z);
Node("KitchenDoorYard", 98.4, G.zaowu.door.z); Node("KitchenDoorOut", G.zaowu.box.maxX + 1.0, G.zaowu.door.z); Node("KitchenDoorIn", 95.0, G.zaowu.door.z);
Node("TangwuDoorOut", G.beiwu.tangwuDoor.x, 476.0); Node("TangwuDoorIn", G.beiwu.tangwuDoor.x, 474.2);
Chain("SideGateE", "GengSW"); Chain("GengBandE", "GengNW2"); Chain("KitchenDoorYard", "KitchenDoorOut", "KitchenDoorIn"); Chain("TangwuDoorOut", "TangwuDoorIn"); Chain("GengE", "GengMid", "GengGateIn", "GengGateOut");
// 往南的窄胡同：丁字路口东南角 → 老耿家东墙外 → 三道弯 → 塌墙处（柴垛翻进旁边院子绕）→ 村南口 → 出村的路
const SLL = SLN.line;
Node("SquareSE", 108.9, 468.6); Node("LaneN", LANE1_X, 470.5); Node("Lane1S", SLL[1].x, SLL[1].z); Node("Lane2E", SLL[2].x, SLL[2].z); Node("LanePileN", LANE3_X, 499.4); Node("LaneCollapse", SLN.collapse.x, SLN.collapse.z);
Node("LaneDYGate", LANE3_X, SLN.detourYard.gateOut.z); Node("Lane3S", SLL[3].x, SLL[3].z); Node("Lane4E", SLL[4].x, SLL[4].z); Node("ExitN", SLL[5].x, SLL[5].z); Node("ExitS", EXIT_X, 552); Node("RoadSW", 98, 566);
Chain("Square", "SquareSE", "LaneN", "GengGateOut", "Lane1S", "Lane2E", "LanePileN", "LaneCollapse", "LaneDYGate", "Lane3S", "Lane4E", "ExitN", "ExitS", "RoadSW");
Node("ClimbFrom", SLN.climb.from.x, SLN.climb.from.z); Node("ClimbTo", SLN.climb.to.x, SLN.climb.to.z); Node("DYin", SLN.detourYard.inside.x, SLN.detourYard.inside.z);
Node("DYGateIn", SLN.detourYard.gateOut.x + 1.3, SLN.detourYard.gateOut.z); Node("DYGateOut", LANE3_X + 0.3, SLN.detourYard.gateOut.z);
Chain("LanePileN", "ClimbFrom", "ClimbTo", "DYin", "DYGateIn", "DYGateOut", "LaneDYGate");
// 北边抄后路的院子链：北角北墙的院门 → 主街东侧最南那院 → 北侧第一个院西墙的门 → 场院西隔墙的门 → 场院 → 场院敞着的南边接东街
const NC = ES.northChain;
Node("PocketGateS", NC.pocketGate.x, NC.pocketGate.z + 1.3); Node("PocketGateN", NC.pocketGate.x, NC.pocketGate.z - 1.3); Node("EM3Yard", 112.0, 452.0);
Node("Yard1DoorW", NC.yard1Door.x - 1.3, NC.yard1Door.z); Node("Yard1DoorE", NC.yard1Door.x + 1.3, NC.yard1Door.z); Node("EN1W", 123.6, 455.2); Node("EN1E", 143.4, 457.0); Node("EN1NE", 149.0, 456.0);
Node("EN1GateN", ES.probes[0].x, ES.probes[0].z - 1.5); Node("FarmDoorW", NC.farmyardDoor.x - 1.3, NC.farmyardDoor.z); Node("FarmDoorE", NC.farmyardDoor.x + 1.3, NC.farmyardDoor.z); Node("FarmS", 157.0, 461.6);
Chain("Pocket", "PocketGateS", "PocketGateN", "EM3Yard", "Yard1DoorW", "Yard1DoorE", "EN1W", "EN1E", "EN1NE", "FarmDoorW", "FarmDoorE", "FarmS", "FarmOpenS");
Chain("EN1GateS", "EN1GateN", "EN1E");
// 班长那一路（10-24 两路；第九版不上主街）：路沟东半截 → EM1 北墙朝路沟的后门 → EM1 院里绕过杂货铺 → EM1 / EM2 豁口 → EM2 西边那条空地（柴垛跟前）；
// 翻墙那一跃不进路网（关键帧写显式 path、标 climb / through），EM3 北屋西边那条空地（EM3N）从南头接进 EM3 院子。
// EM2 朝主街的院门（EM2GateOut / EM2GateIn）留着给 08-1 冲上街的村民
Node("DitchGate", EYR.backGate.x, DT.z + 0.6); Node("BackGateOut", EYR.backGateOut.x, EYR.backGateOut.z); Node("BackGateIn", EYR.backGateIn.x, EYR.backGateIn.z);
EYR.em1.forEach((p, i) => Node(`EM1Way${i}`, p.x, p.z));
Node("BreachN", EYR.breach.from.x, EYR.breach.from.z); Node("BreachS", EYR.breach.to.x, EYR.breach.to.z);
Node("StreetEastWall", 102.4, 439.5); Node("EM2GateOut", EYR.gateOut.x, EYR.gateOut.z); Node("EM2GateIn", EYR.gateIn.x, EYR.gateIn.z); Node("EM2ClimbFrom", EYR.climb.from.x, EYR.climb.from.z);
Node("EM3ClimbTo", EYR.climb.to.x, EYR.climb.to.z); Node("EM3West", EYR.stripOut.x, EYR.stripOut.z);
Chain("DitchGate", "BackGateOut", "BackGateIn", ...EYR.em1.map((_, i) => `EM1Way${i}`), "BreachN", "BreachS");
Edge("StreetCartW", "StreetEastWall"); Chain("StreetEastWall", "EM2GateOut", "EM2GateIn");
Edge("EM3ClimbTo", "EM3West");
// 区域（嵌套时取最小的那个）
Area("Ditch", Box(DT.fromX + 1, DT.toX - 1, DT.z - DT.floorW / 2 - 0.2, DT.z + DT.floorW / 2 + 0.2), "DitchW", "DitchAlley", "DitchMid", "DitchStreet", "DitchE", "DitchGate", LANE_END);
Area("Square", Box(ST.square.box.minX + 1.8, ST.square.box.maxX - 0.8, ST.square.box.minZ + 0.5, ST.square.box.maxZ - 0.5), "StreetS", "Square", "EastMouth", "Pocket", "L4Mouth", "SquareSE");
Area("Pocket", Box(ST.pocket.box.minX + 0.4, ST.pocket.box.maxX - 0.6, ST.pocket.box.minZ + 0.4, ST.pocket.box.maxZ - 0.1), "Pocket", "PocketGateS");
Area("JfYard", Box(68.4, 79.6, 449.4, 463.2), "JfYardS", "JfWingDoorOut", "JfBeiwuDoorOut");
Area("JfWing", Box(JF.westWing.box.minX + 0.4, JF.westWing.box.maxX - 0.4, JF.westWing.box.minZ + 0.4, JF.westWing.box.maxZ - 0.4), "JfWingDoorIn", "JfBreachIn");
Area("JfBeiwu", Box(JF.beiwu.box.minX + 0.4, JF.beiwu.box.maxX - 0.4, JF.beiwu.box.minZ + 0.4, JF.beiwu.box.maxZ - 0.4), "JfBeiwuDoorIn");
Area("BjYard", Box(BJ.westWing.box.maxX + 0.3, BJ.eastWing.box.minX - 0.3, BJ.beiwu.box.maxZ + 0.5, BJ.nanwu.box.minZ - 0.4), "BjYardMid", "BjN1");
Area("GengYard", Box(96.6, 101.9, 476.0, 485.2), "GengSW", "GengNW2", "GengE", "KitchenDoorYard", "TangwuDoorOut");   // 院子西半（石榴树以西）
Area("GengYardE", Box(102.3, 106.9, 478.6, 484.0), "GengMid", "GengGateIn");                                       // 院子东半（石榴树以东、柴垛以北）
Area("EN1", Box(123.2, 143.6, 446.2, 458.4), "EN1W", "EN1E");
Area("ExitDitch", Box(113.0, 121.5, 545.5, 560.0), "ExitN", "ExitS");   // 村南口外后送队缩着等的那片路沟
Area("GengBeiwu", Box(G.beiwu.box.minX + 0.6, G.beiwu.box.maxX - 0.6, G.beiwu.box.minZ + 0.6, G.beiwu.box.maxZ - 0.6), "TangwuDoorIn");
Area("GengKitchen", Box(94.0, 95.5, 478.0, 481.4), "KitchenDoorIn");
Area("DY", Box(115.5, 124.5, 502.0, 518.5), "ClimbTo", "DYin", "DYGateIn");
Area("EM3", Box(104.0, 117.6, 441.0, 457.4), "PocketGateN", "EM3Yard", "Yard1DoorW", "EM3West");
Area("EM2W", Box(103.6, 105.8, EYR.breach.to.z - 0.2, 433.3), "BreachS", "EM2GateIn", "EM2ClimbFrom");      // EM2 西边那条空地（豁口到柴垛跟前；排房在 x 106 以东、柴垛在 z 433.65 以南）
Area("EM3N", Box(EYR.strip.minX + 0.1, EYR.strip.maxX - 0.3, EYR.strip.minZ + 0.4, EYR.strip.maxZ + 1.1), "EM3ClimbTo", "EM3West");   // EM3 北屋西边的空地
// 一个区域的出入口两两相连：路线可以穿过区域（区域的盒子按没有块的空地画，直线能走）
for (const a of areas) for (let i = 0; i < a.portals.length; i++) for (let j = i + 1; j < a.portals.length; j++) edges.push([a.portals[i], a.portals[j]]);
const InBox = (b, p) => p.x >= b.minX && p.x <= b.maxX && p.z >= b.minZ && p.z <= b.maxZ;

function NearestOnNet(p) {
  let best = null;
  edges.forEach(([i, j], e) => {
    const a = nodes[i], b = nodes[j], len = Dist(a, b);
    const t = len > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.z - a.z) * (b.z - a.z)) / (len * len))) : 0;
    const q = { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
    const dist = Dist(p, q);
    if (!best || dist < best.dist) best = { e, t, q, dist };
  });
  return best;
}
const BoxArea = (b) => (b.maxX - b.minX) * (b.maxZ - b.minZ);
/** 点所在的区域（嵌套时取最小的那个：灶屋在后院的盒子里，人在灶屋里就只算灶屋）。 */
const AreaOf = (p) => areas.filter((a) => InBox(a.box, p)).sort((a, b) => BoxArea(a.box) - BoxArea(b.box))[0] || null;
export function OnNet(p) { return !!AreaOf(p) || NearestOnNet(p).dist <= NET_SNAP_M; }

/**
 * 沿路网从 a 走到 b 的折线（不含 a，含 b）。两端都不在路网上（野地、院外）→ 直线 [b]。
 * 一端在路网上、一端在野地：网上那一端沿路走到离野地那端最近的路点，再直线过去。
 */
export function StreetRoute(a, b) {
  const aOn = OnNet(a), bOn = OnNet(b);
  if (!aOn && !bOn) return [Pt(b.x, b.z)];
  const vs = nodes.map((n) => ({ x: n.x, z: n.z }));
  const adj = vs.map(() => []);
  const Link = (i, j, w = Dist(vs[i], vs[j])) => { adj[i].push([j, w]); adj[j].push([i, w]); };
  const ia = vs.push({ x: a.x, z: a.z }) - 1, ib = vs.push({ x: b.x, z: b.z }) - 1;
  adj.push([], []);
  // 同一区域里直走
  const areaA = AreaOf(a), areaB = AreaOf(b);
  if (areaA && areaA === areaB) return [Pt(b.x, b.z)];
  // 边：把 a / b 的投影点插进去（野地那一端也挂到最近的路点上：沿路走到离它最近处再直线过去）
  const sa = NearestOnNet(a), sb = NearestOnNet(b);
  const cutsByEdge = new Map();
  const AddCut = (s, idx) => { if (!cutsByEdge.has(s.e)) cutsByEdge.set(s.e, []); const k = vs.push({ ...s.q }) - 1; adj.push([]); cutsByEdge.get(s.e).push({ t: s.t, n: k }); Link(idx, k); };
  if (!areaA) AddCut(sa, ia);
  if (!areaB) AddCut(sb, ib);
  edges.forEach(([i, j], e) => {
    const cuts = (cutsByEdge.get(e) || []).sort((p, q) => p.t - q.t);
    const chain = [i, ...cuts.map((c) => c.n), j];
    for (let k = 1; k < chain.length; k++) Link(chain[k - 1], chain[k]);
  });
  // 区域：a / b 在区域里就直连该区域的所有出入口
  if (areaA) for (const n of areaA.portals) Link(ia, n);
  if (areaB) for (const n of areaB.portals) Link(ib, n);
  // Dijkstra
  const dist = vs.map(() => Infinity), prev = vs.map(() => -1), done = vs.map(() => false);
  dist[ia] = 0;
  for (;;) {
    let u = -1;
    for (let i = 0; i < vs.length; i++) if (!done[i] && dist[i] < Infinity && (u < 0 || dist[i] < dist[u])) u = i;
    if (u < 0 || u === ib) break;
    done[u] = true;
    for (const [v, w] of adj[u]) if (dist[u] + w < dist[v]) { dist[v] = dist[u] + w; prev[v] = u; }
  }
  if (dist[ib] === Infinity) return [Pt(b.x, b.z)];
  const chain = [];
  for (let u = ib; u >= 0; u = prev[u]) chain.unshift(vs[u]);
  const out = [];
  const Push = (p) => { const last = out.length ? out[out.length - 1] : a; if (Dist(last, p) > 0.15) out.push(Pt(p.x, p.z)); };
  for (const p of chain.slice(1)) Push(p);
  Push(b);
  // 去掉共线的中间点
  const pts = [a, ...out], keep = [];
  for (let i = 1; i < pts.length; i++) {
    const p0 = pts[i - 1], p1 = pts[i], p2 = pts[i + 1];
    if (p2) {
      const cross = (p1.x - p0.x) * (p2.z - p0.z) - (p1.z - p0.z) * (p2.x - p0.x);
      if (Math.abs(cross) / Math.max(1e-6, Dist(p0, p2)) < 0.05) continue;
    }
    keep.push(p1);
  }
  return keep.length ? keep : [Pt(b.x, b.z)];
}

// ---------------------------------------------------------------------------
// 单位与 POI

const META = new WeakMap();
const UNIT_KEY_ORDER = ["id", "side", "kind", "name", "castId", "role", "group", "weapon", "x", "z", "yawDeg", "stance", "aim", "state", "bearers", "ride", "arc", "speedMps", "path", "intent", "guess"];

/**
 * 一个单位。at = {x,z}；o：
 *   face {x,z} | yaw   朝向；name / castId / kind / role / group / weapon / stance / aim / down / bearers / arc / speed / guess
 *   from {x,z}|[..]   只在本帧出现：从这里走进来（path 起点）；fromStraight 不走路网
 *   path [..]          显式来路；to / intent 去向（to 沿路网排）；toStraight 直线
 *   straight           上一帧过来走直线（不排路网）
 *   climb              来去要爬坎 / 翻墙（不报高差）；through 钻狗洞（不报穿块）
 *   onLitter           躺在哪副担架上（不报「站在担架上」）
 */
function U(id, side, at, o = {}) {
  const u = { id, side, x: R2(at.x), z: R2(at.z) };
  if (o.kind && o.kind !== "soldier") u.kind = o.kind;
  if (o.name) u.name = o.name;
  if (o.castId) u.castId = o.castId;
  if (o.role) u.role = o.role;
  if (o.group) u.group = o.group;
  if (o.weapon) u.weapon = o.weapon;
  u.yawDeg = o.face ? Yaw(at, o.face) : R1(o.yaw ?? at.heading ?? 0);
  if (o.stance && o.stance !== "stand") u.stance = o.stance;
  if (o.aim) u.aim = true;
  if (o.down) u.state = "down";
  if (o.bearers !== undefined) u.bearers = o.bearers;
  if (o.ride) u.ride = { ...o.ride };   // §3 ride（10-20）：挂到车上，位姿跟车；x / z 只当车不在场时的备用
  if (o.arc) u.arc = o.arc;
  if (o.speed) u.speedMps = o.speed;
  if (o.path) u.path = o.path.map((p) => Pt(p.x, p.z));
  else if (o.from) {
    const froms = Array.isArray(o.from) ? o.from : [o.from];
    const route = [Pt(froms[0].x, froms[0].z)];
    let cur = froms[0];
    for (const p of [...froms.slice(1), at]) { route.push(...(o.fromStraight ? [Pt(p.x, p.z)] : StreetRoute(cur, p))); cur = p; }
    u.path = route;
  }
  if (o.intent) u.intent = o.intent.map((p) => Pt(p.x, p.z));
  else if (o.to) {
    const tos = Array.isArray(o.to) ? o.to : [o.to];
    const route = [];
    let cur = at;
    for (const p of tos) { route.push(...(o.toStraight ? [Pt(p.x, p.z)] : StreetRoute(cur, p))); cur = p; }
    u.intent = route;
  }
  if (o.guess) u.guess = true;
  META.set(u, { straight: !!o.straight, climb: !!o.climb, through: !!o.through, explicitPath: !!(o.path || o.from), onLitter: o.onLitter || null });
  return u;
}

const Poi = (id, name, kind, at, radiusM = 2) => ({ id, name, kind, x: R2(at.x), z: R2(at.z), radiusM });
const ArcTo = (from, to, halfDeg, extraM = 6) => ({ halfDeg, rangeM: R1(Dist(from, to) + extraM), yawDeg: Yaw(from, to) });

/** 村口附近要有一棵看得见的大槐树（10-6 班长「往那棵大槐树跑」）：空间表里还没有，先用 POI 标在村南口外东边；Scene 里加树由空间负责人合（见报告）。 */
export const BIG_LOCUST = Object.freeze(Pt(121.5, 548.5));

const POI = {
  assembly: (kind = "landmark") => Poi("Assembly", "集结处（干沟，空了）", kind, PL.assembly, 6),
  gullyRest: () => Poi("GullyRest", "冬瓜躺过的地方", "poi", PL.gullyRest, 1.5),
  laneHead: (kind = "landmark") => Poi("LaneHead", "凹路口", kind, PL.laneHead, 2.5),
  cart: (kind = "poi") => Poi("GengCart", "老耿的驴车（树底下）", kind, PL.cartStop, 2.5),
  nierRim: () => Poi("NierRim", "妮儿捡弹壳的沟沿", "poi", PL.nierRim, 1.5),
  villageMouth: (kind = "landmark") => Poi("VillageMouth", "村北口", kind, PL.villageMouth, 3),
  ditch: (kind = "landmark") => Poi("Ditch", "村口路沟", kind, PL.ditch, 4),
  mainStreet: (kind = "landmark") => Poi("MainStreet", "主街", kind, Pt(MAIN_X, 425), 4),
  loophole: (kind = "danger") => Poi("Loophole", "枪眼（机枪）", kind, PL.northWindow, 2),
  overturnedCart: (kind = "poi") => Poi("OverturnedCart", "翻倒的大车", kind, PL.cart, 2),
  river: () => Poi("River", "河汊子（水齐腰深）", "landmark", PL.river, 8),
  eastSide: () => Poi("EastSide", "东头（鬼子来的方向）", "danger", PL.fieldEast, 8),
  eastRoad: () => Poi("EastRoad", "东北进庄的道（鬼子顺它进的庄）", "danger", PL.eastRoadView, 8),
  alleyMouth: (kind = "poi") => Poi("AlleyMouth", "巷子口", kind, PL.alleyMouth, 1.5),
  corner: (kind = "danger") => Poi("Corner", "路口墙角（守着的鬼子）", kind, Pt(108.2, 461.4), 2),
  jiefangGate: (kind = "poi") => Poi("JiefangGate", "街坊家院门（半掩）", kind, PL.jiefangGate, 1.5),
  jiefangBreach: (kind = "poi") => Poi("JiefangBreach", "西配房塌掉的西北角", kind, PL.jiefangBreach, 1.5),
  jiefangWindow: (kind = "poi") => Poi("JiefangWindow", "西配房的窗（窗户纸）", kind, PL.jiefangWindow, 1.2),
  jiefangVat: (kind = "poi") => Poi("JiefangVat", "西配房里的大缸", kind, PL.jiefangVat, 1.0),
  cellar: (kind = "danger") => Poi("Cellar", "地瓜窖（街坊家）", kind, PL.cellar, 2),
  mill: () => Poi("Mill", "石磨（绑着老汉）", "poi", PL.mill, 1.5),
  benjiaGate: (kind = "poi") => Poi("BenjiaGate", "本家院的院门（敞着）", kind, PL.benjiaGate, 1.5),
  dogHole: (kind = "poi") => Poi("DogHole", "狗洞（大人钻不进）", kind, PL.dogHole, 1),
  sideGate: (kind = "poi") => Poi("SideGate", "便门（从老耿家那边闩着）", kind, PL.sideGate, 1.5),
  kitchenDoor: (kind = "poi") => Poi("KitchenDoor", "灶屋门", kind, PL.kitchenDoor, 1.2),
  tangwuDoor: (kind = "poi") => Poi("TangwuDoor", "堂屋门（门里是机枪组的后背）", kind, PL.tangwuDoor, 1.2),
  gengGate: (kind = "poi") => Poi("GengGate", "老耿家院门（东墙，朝窄胡同）", kind, PL.gengGate, 1.5),
  laneMouth: (kind = "poi") => Poi("LaneMouth", "窄胡同口（丁字路口东南角）", kind, Pt(LANE1_X, 470.5), 1.5),
  roller: (kind = "poi") => Poi("Roller", "石碾", kind, PL.roller, 1.5),
  eastEnd: () => Poi("EastEnd", "东街东头", "danger", PL.eastEnd, 4),
  eastJog1: (kind = "danger") => Poi("EastJog1", "东街第一道弯（过了弯看不见）", kind, PL.eastJog1, 3),
  shrine: (kind = "danger") => Poi("Shrine", "土地庙（轻机枪缩在它后头）", kind, PL.shrine, 2),
  farmyard: (kind = "danger") => Poi("Farmyard", "场院（麦秸垛后头：掷弹筒）", kind, PL.strawStack, 4),
  pocket: (kind = "danger") => Poi("Pocket", "北角（北边院子的门）", kind, PL.pocket, 3),
  laneCollapse: (kind = "danger") => Poi("LaneCollapse", "窄胡同塌墙处", kind, PL.laneCollapse, 2),
  climbPile: (kind = "poi") => Poi("ClimbPile", "翻墙的柴垛", kind, PL.climbPile, 1.2),
  detourGate: (kind = "poi") => Poi("DetourGate", "绕路院子的院门", kind, PL.detourGate, 1.5),
  bigLocust: (kind = "landmark") => Poi("BigLocust", "大槐树（过了它就是村口）", kind, BIG_LOCUST, 3),
  villageSouth: (kind = "landmark") => Poi("VillageSouth", "村南口（往北沙河）", kind, PL.villageSouth, 3),
};

// ---------------------------------------------------------------------------
// 人物

const NRA = {
  Luo: { name: "罗班长", role: "squadLeader", castId: "luo" },
  Yaowa: { name: "幺娃", castId: "yaowa" },
  HeYoutian: { name: "何有田", castId: "heyoutian" },
  LiuWencai: { name: "刘文财", castId: "liuwencai" },
  Runner: { name: "传令兵", role: "runner", castId: "runner" },
  Donggua: { name: "冬瓜", role: "comrade", castId: "comrade" },
  Medic: { name: "卫生兵", role: "medic" },
  Officer: { name: "后送队带队的排长", kind: "officer", role: "convoyLeader" },
  Escort1: { name: "后送队的兵", role: "convoyGuard", group: "convoy" },
  Escort2: { name: "后送队的兵", role: "convoyGuard", group: "convoy" },
};
const N = (id, at, o = {}) => U(id, "nra", at, { ...(NRA[id] || {}), ...o });
const CIV = {
  Geng: { name: "老耿", kind: "civilian", role: "carter" },
  Nier: { name: "妮儿", kind: "child" },
  GengCart: { name: "驴车（车上几箱弹药）", kind: "cart" },
  CellarMan: { name: "汉子", kind: "civilian", group: "cellarFamily" },
  CellarWife: { name: "年轻媳妇", kind: "civilian", group: "cellarFamily" },
  CellarGranny: { name: "抱襁褓的老太太", kind: "civilian", group: "cellarFamily" },
  MillOldMan: { name: "绑在石磨上的老汉", kind: "civilian" },
};
const C = (id, at, o = {}) => U(id, "civ", at, { ...(CIV[id] || {}), kind: (CIV[id] || {}).kind || "civilian", ...o });
const IJA = {
  MgGunner: { name: "堂屋枪眼后的机枪", role: "machineGun", weapon: "Type11", group: "house" },
  MgLoader: { name: "副射手", role: "loader", group: "house" },
  MgThird: { name: "机枪组的弹药手", role: "loader", group: "house" },
  Leader: { name: "分队长", role: "squadLeader", group: "house" },
  Rifle1: { name: "西间枪眼的步枪", role: "rifleman", group: "house" },
  Rifle2: { name: "西间递弹的", role: "rifleman", group: "house" },
  Rifle3: { name: "东间枪眼的步枪", role: "rifleman", group: "house" },
  Rifle4: { name: "东间递弹的", role: "rifleman", group: "house" },
  CornerIja1: { name: "路口墙角守着的", role: "rifleman", group: "corner" },
  CornerIja2: { name: "路口墙角守着的（去东街喊人）", role: "rifleman", group: "corner" },
  KitchenIja: { name: "灶屋里看后院的", role: "looter", group: "house" },
  CellarIja1: { name: "拎手榴弹的", role: "grenadier", group: "cellar" },
  CellarIja2: { name: "拿刺刀的", role: "bayonet", group: "cellar" },
  CellarIja3: { name: "拖人的", role: "rifleman", group: "cellar" },
  CellarIja4: { name: "翻东西的", role: "looter", group: "cellar" },
  EastOfficer: { name: "喊来的小队的军官", role: "officer", group: "east" },
  EastMg1: { name: "土地庙后的轻机枪", role: "machineGun", weapon: "Type11", group: "east" },
  EastMg2: { name: "轻机枪副射手", role: "loader", group: "east" },
  Mortar1: { name: "掷弹筒", role: "mortar", group: "east" },
  Mortar2: { role: "mortarLoader", group: "east" },
  Mortar3: { role: "mortarLoader", group: "east" },
  // 第五版（10-21）：东北进庄的道上往庄子走的鬼子（占了老耿家那伙的尾巴）；第九版（10-24）：07-4 最后四个离了大路、弯着腰斜穿麦地往庄子东北角钻（离凹路尽头 100–120 m），
  // 08-1 / 08-2 远远还有三个在道上 x 285…298
  RoadIja1: { name: "离了大路斜穿麦地往庄子东北角钻的", role: "rifleman", group: "road" },
  RoadIja2: { role: "rifleman", group: "road" },
  RoadIja3: { role: "rifleman", group: "road" },
  RoadIja4: { role: "rifleman", group: "road" },
  RoadIja5: { name: "东北道上远远走着的", role: "rifleman", group: "road" },
  RoadIja6: { role: "rifleman", group: "road" },
  RoadIja7: { role: "rifleman", group: "road" },
  // 第九版（10-24）：08-1 从庄子东北角的墙后头冒出来朝逃出来的村民打一梭子的（露一下就缩回去，08-2 起不再摆）
  NeCornerIja: { name: "东北角墙后打了一梭子的（露一下就缩回去）", role: "rifleman", group: "ne" },
};
const J = (id, at, o = {}) => U(id, "ija", at, { ...(IJA[id] || {}), ...o });

// 走位速度（10-22 用户：别像散步）
const RUN = 3.2, IJA_RUN = 3.6, TROT = 1.9, CREEP = 1.0, NIER_RUN = 2.6, CART_RUN = 2.0;

// ---------------------------------------------------------------------------
// 固定站位

const A = PL.assembly;
const CART = Pt(PL.cartStop.x, PL.cartStop.z);
/**
 * 07 妮儿坐车尾（§3 ride，10-20）：挂在 GengCart 的车尾沿（车本地 z +1.2 = Script_EditorBlockoutPuppets BLOCKOUT_CART_SEATS.tail），背对车头，
 * 根离车底下地面 = 车板顶 1.025 − VilSitEdge 坐高 0.90 × 小孩 0.62 = 0.467（SitRootY）。数字照 docs §5.6 的例子，不 import Puppets（它带 three）。
 */
export const NIER_RIDE = Object.freeze({ on: "GengCart", x: 0, z: 1.2, y: 0.467, yawDeg: 180 });
const NIER_RIM = Pt(PL.nierRim.x, PL.nierRim.z);
const MOUTH = Pt(PL.villageMouth.x, PL.villageMouth.z);
const LOOPHOLE = Pt(PL.northWindow.x, PL.northWindow.z);                      // 堂屋枪眼（机枪）(100,470)
const MG_AT = Pt(G.mgPost.x, G.mgPost.z), MG_LOADER_AT = Pt(G.mgLoaderPost.x, G.mgLoaderPost.z), MG_THIRD_AT = Pt(101.4, 472.6);
const MG_ARC = ArcTo(MG_AT, MOUTH, 5, 6);
const RIFLE_W_AT = Pt(G.rifleWestPost.x, G.rifleWestPost.z), RIFLE_W2_AT = Pt(96.4, 473.6);
const RIFLE_E_AT = Pt(G.rifleEastPost.x, G.rifleEastPost.z), RIFLE_E2_AT = Pt(103.6, 473.6);
const LEADER_AT = Pt(101.2, 473.9);
const CORNER1_AT = Pt(108.2, 460.4), CORNER2_AT = Pt(108.7, 462.6);          // 路口墙角（丁字路口东北角、石碾西北背后）
const KITCHEN_IN = Pt(95.0, 479.4);                                           // 灶屋门里看后院的鬼子
const CELLAR = Pt(PL.cellar.x, PL.cellar.z);
const MILL = Pt(PL.mill.x, PL.mill.z);
const MILL_MAN = Pt(MILL.x + 0.9, MILL.z + 0.7);                              // 反绑在石磨上的老汉（倒在磨边）
const ROLLER = Pt(PL.roller.x, PL.roller.z);
const PRONE_AT_ROLLER = Pt(PL.roller.x - 2.2, PL.roller.z + 0.75);   // 趴在石碾西北、碾子南沿外一点：视线从碾子南边过去，身子不顶东街南墙             // 石碾后头趴着朝东（视线从碾子北边过去）
const CORNER_N = Pt(108.9, 463.4), CORNER_S = Pt(108.9, 468.0);              // 东街口北角 / 南角（班长 / 刘文财顶着）
const CART_HIDE = Pt(PL.cart.x, PL.cart.z);                                   // 翻倒的大车
const SHOOTER = Object.fromEntries(L0610_MOUTH_SHOOTERS.map((p) => [p.who, Pt(p.x, p.z)]));   // 街口坡道上趴着的四个
const GATE_IN = Pt(G.yard.gateIn.x, G.yard.gateIn.z), GATE_OUT = Pt(LANE1_X, G.gate.z);
const SIDE_IN = Pt(G.yard.sideDoorIn.x, G.yard.sideDoorIn.z), SIDE_OUT = Pt(BJ.sideDoorOut.x, BJ.sideDoorOut.z);
const TANGWU_OUT = Pt(G.yard.tangwuDoorOut.x, G.yard.tangwuDoorOut.z);
const KITCHEN_OUT = Pt(G.yard.kitchenDoorOut.x, G.yard.kitchenDoorOut.z);
const JF_GATE = Pt(JF.gate.x, JF.gate.z), GLIMPSE = Pt(JF.glimpse.x, JF.glimpse.z);
const SHRINE = Pt(ES.shrine.x, ES.shrine.z), MG_HIDE = Pt(ES.mgHide.x, ES.mgHide.z), MORTAR_HIDE = Pt(ES.mortarHide.x, ES.mortarHide.z);
const POCKET_GATE = Pt(NC.pocketGate.x, NC.pocketGate.z);
// 08 沟底街口西边：老耿、班长、排长、卫生兵、两个后送队的兵、Squad1 / Squad2
const DITCH_08 = Object.freeze({
  Luo: Pt(99.2, 380.5), Geng: Pt(101.6, 380.7), Nier: Pt(102.9, 379.4), Officer: Pt(102.6, 381.1), Medic: Pt(107.6, 381.1),
  HeYoutian: Pt(96.9, 380.2), Escort1: Pt(98.0, 379.3), Escort2: Pt(96.1, 379.0), Squad1: Pt(95.4, 380.5), Squad2: Pt(93.9, 379.4),
  Cart: Pt(104.6, 379.3), DongguaLitter: Pt(106.2, 380.9),
});
// 08-3 班长带何有田和后送队两个兵蹲在街口坡道脚下等着往前摸
const LUO_WAIT = Object.freeze({ Luo: Pt(101.4, 382.2), HeYoutian: Pt(102.6, 382.9), Escort1: Pt(100.4, 381.3), Escort2: Pt(99.4, 382.0) });
// 08-4 末班长、何有田、Escort1 从沟底爬上路沟南沿、钻 EM1 北墙的后门（第九版 10-24：班长不上主街，大车后头没人了）
const BACK_GATE_PARTY = Object.freeze({ Luo: Pt(109.8, 382.3), HeYoutian: Pt(108.6, 382.5), Escort1: Pt(111.0, 382.5) });
/**
 * 班长那一路（10-24 两路；第九版从后门进）逐帧站位：09-1 刚进 EM1 后门、蹲在门里；09-2 在 EM1 / EM2 之间那道墙的豁口（一个过去了、一个在豁口里、一个在 EM1 等）；
 * 09-3 EM2 西边空地南头的柴垛跟前；09-4 人梯（何有田蹲在柴垛北边当垫脚、班长在他身后）；09-5 翻过 z 435 那道墙落在 EM3 北屋西边的空地上；
 * 09-6 / 09-7 蹲在 EM3 南门（pocket 北门）后头；10-1 撞开门在 pocket 里。
 * 全程蹲着、不开枪；每个点都在三个枪眼和墙角哨的视线外（EM1 / EM2 都在主街东墙后头，翻墙点在主街东墙和 pocket 北墙后头）。
 */
const EAST_ROUTE = Object.freeze({
  "09-1": { Luo: Pt(109.3, 387.6), HeYoutian: Pt(107.9, 386.9), Escort1: Pt(110.6, 387.3) },
  "09-2": { Luo: Pt(EYR.breach.x, 412.6), HeYoutian: Pt(EYR.breach.x, 409.7), Escort1: Pt(105.1, 406.6) },
  "09-3": { Luo: Pt(105.6, 432.1), HeYoutian: EYR.climb.from, Escort1: Pt(104.0, 431.3) },
  "09-4": { Luo: Pt(EYR.climb.from.x, 432.2), HeYoutian: EYR.climb.from, Escort1: Pt(106.1, 432.6) },
  "09-5": { Luo: Pt(104.7, 438.4), HeYoutian: Pt(104.6, 436.3), Escort1: Pt(104.8, 437.2) },
  "09-6": EYR.behindGate, "09-7": EYR.behindGate,
  "10-1": EYR.inPocket,
});
const EAST_TRIO = ["Luo", "HeYoutian", "Escort1"];
const POCKET_GATE_AT = Pt(EYR.pocketGate.x, EYR.pocketGate.z);
/** 08-4 起坡道上四个压枪眼的「打一枪换个窝」（第九版：Escort2 也在坡道上，顺子的射击位 08-4 起空出来了）：每帧换一次窝 */
const SHOOTER_IDS = ["Yaowa", "Squad3", "LiuWencai", "Escort2"];
// 四个射击位从西到东：player / Yaowa / Squad3 / LiuWencai；每帧相邻两个人换一次窝（只有那两个人动，爬过去不穿别人）
const SHOOTER_SLOTS_09 = Object.freeze({
  "08-4": { Escort2: "player", Yaowa: "Yaowa", Squad3: "Squad3", LiuWencai: "LiuWencai" },
  "09-1": { Yaowa: "player", Escort2: "Yaowa", Squad3: "Squad3", LiuWencai: "LiuWencai" },
  "09-2": { Yaowa: "player", Squad3: "Yaowa", Escort2: "Squad3", LiuWencai: "LiuWencai" },
  "09-3": { Yaowa: "player", Squad3: "Yaowa", LiuWencai: "Squad3", Escort2: "LiuWencai" },
  "09-4": { Squad3: "player", Yaowa: "Yaowa", LiuWencai: "Squad3", Escort2: "LiuWencai" },
  "09-5": { Squad3: "player", LiuWencai: "Yaowa", Yaowa: "Squad3", Escort2: "LiuWencai" },
  "09-6": { Squad3: "player", LiuWencai: "Yaowa", Escort2: "Squad3", Yaowa: "LiuWencai" },
  "09-7": { LiuWencai: "player", Squad3: "Yaowa", Escort2: "Squad3", Yaowa: "LiuWencai" },
});

// 后送队：07 贴西坎停成一长溜 z 190…315（担架 11 副 + 冬瓜那副、走着的伤员 16、架人的 4）
const COLUMN_FROM_Z = 190, COLUMN_TO_Z = 315, COLUMN_SLOTS = 28, COLUMN_LAT = -1.25;
const DONGGUA_Z = 300;
function ColumnSlots() {
  const out = [];
  const step = (COLUMN_TO_Z - COLUMN_FROM_Z) / (COLUMN_SLOTS - 1);
  for (let i = 0; i < COLUMN_SLOTS; i++) {
    const z = COLUMN_FROM_Z + step * i;
    const litter = (i % 5 === 0 || i % 5 === 2) && i !== 27;
    out.push({ i, z, lat: COLUMN_LAT, kind: litter ? "litter" : "walker", helper: !litter && i % 4 === 1 });
  }
  return out;
}
const SLOTS = ColumnSlots();
const HELPER_LAT_IN = 0.75;   // 架着伤员的人站在伤员里侧（路中线那边）
const DONGGUA_SLOT = SLOTS.reduce((best, s) => (Math.abs(s.z - DONGGUA_Z) < Math.abs(best.z - DONGGUA_Z) ? s : best), SLOTS[0]);
/** 小队往前挤时站路中线偏东（担架和伤员停在西边、车在东边）；z 避开架人的那几个槽位。 */
function SqueezeZ(z) {
  for (const s of SLOTS) {
    const keep = s.helper ? 1.0 : s.kind === "litter" ? 0.8 : 0;
    if (keep && Math.abs(s.z - z) < keep) return s.z + (z >= s.z ? keep : -keep);
  }
  return z;
}
const LS = (z, lat = 0) => LZ(SqueezeZ(z), Math.max(-0.35, Math.min(0.3, lat)));
/** 后送队停在凹路西边：担架（放在地上）、走着的伤员（蹲着）、架着伤员的人。stance 给 07-4 全体趴下用。 */
function Column({ heading = 180, stance = null } = {}) {
  const out = [];
  let litters = 0, walkers = 0, helpers = 0;
  for (const s of SLOTS) {
    if (s === DONGGUA_SLOT) continue;
    const p = LZ(s.z, s.lat);
    if (s.kind === "litter") {
      litters++;
      out.push(N(`Litter${String(litters).padStart(2, "0")}`, p, { kind: "litter", name: litters === 1 ? "担架" : undefined, yaw: heading, group: "convoy", bearers: 0, straight: true, speed: TROT }));
    } else {
      walkers++;
      out.push(N(`Walker${String(walkers).padStart(2, "0")}`, p, { role: "walkingWounded", group: "convoy", yaw: heading, stance: stance || "crouch", straight: true, speed: 1.0 }));
      if (s.helper) {
        helpers++;
        out.push(N(`Helper${String(helpers).padStart(2, "0")}`, LZ(s.z, s.lat + HELPER_LAT_IN), { role: "helper", group: "convoy", face: stance ? null : p, yaw: stance ? heading : undefined, stance: stance || undefined, straight: true, speed: 1.0 }));
      }
    }
  }
  return out;
}
const DONGGUA_LITTER = LZ(DONGGUA_SLOT.z, DONGGUA_SLOT.lat);
/** 冬瓜那副担架（bearers 0 = 放在地上），冬瓜躺在上面（倒地姿态横着，要顺着担架躺就比担架转 90°）。 */
const DongguaOnLitter = (at, { bearers = 0, yaw = 180, extra = {} } = {}) => [
  N("LitterDonggua", at, { kind: "litter", name: "冬瓜的担架", bearers, yaw, group: "convoy", speed: TROT, ...extra }),
  N("Donggua", at, { down: true, onLitter: "LitterDonggua", speed: TROT, yaw: R1((((yaw + 90) + 540) % 360) - 180), ...extra }),
];
/** 08–10-3 后送队缩在路沟东半截（担架 7 副顺着沟底排、走着的伤员 9 个贴北壁）与凹路末段（担架 5 副、伤员 7 个）。 */
function DitchConvoy() {
  const out = [];
  for (let i = 0; i < 7; i++) out.push(N(`Litter${String(i + 1).padStart(2, "0")}`, Pt(109.2 + 2.3 * i, 380.8), { kind: "litter", name: i === 0 ? "担架" : undefined, yaw: -90, group: "convoy", bearers: 0, speed: TROT }));
  for (let i = 0; i < 9; i++) out.push(N(`Walker${String(i + 1).padStart(2, "0")}`, Pt(108.6 + 1.85 * i, 379.15), { role: "walkingWounded", group: "convoy", yaw: 180, stance: "crouch", speed: 2.0 }));
  out.push(N("Helper01", Pt(108.6 + 1.85 * 2 + 0.92, 379.15), { role: "helper", group: "convoy", yaw: 180, stance: "crouch", speed: 2.0 }));
  out.push(N("Helper02", Pt(108.6 + 1.85 * 6 + 0.92, 379.15), { role: "helper", group: "convoy", yaw: 180, stance: "crouch", speed: 2.0 }));
  [357, 361.5, 366, 370.5, 375].forEach((z, i) => out.push(N(`Litter${String(i + 8).padStart(2, "0")}`, LZ(z, -1.15), { kind: "litter", yaw: 180, group: "convoy", bearers: 0, speed: TROT })));
  [356.5, 359.5, 362.5, 365.5, 368.5, 371.5, 374.5].forEach((z, i) => out.push(N(`Walker${String(i + 10).padStart(2, "0")}`, LZ(z, 1.15), { role: "walkingWounded", group: "convoy", yaw: 180, stance: "crouch", speed: 2.0 })));
  out.push(N("Helper03", LZ(359.5, 0.35), { role: "helper", group: "convoy", yaw: 180, stance: "crouch", speed: 2.0 }));
  out.push(N("Helper04", LZ(371.5, 0.35), { role: "helper", group: "convoy", yaw: 180, stance: "crouch", speed: 2.0 }));
  return out;
}
/**
 * 10-4 后送队顺主街跑到路口、贴着石碾背后一副一副拐进窄胡同：从队头（冬瓜那副，在胡同里车后头）往回按弧长排在这条折线上；
 * 在街上时走着的伤员靠东边一步，进了胡同就一溜排开。担架小跑（bearers 2）。
 */
const CONVOY_LINE_104 = Object.freeze([Pt(LANE1_X, 474.5), Pt(LANE1_X, 470.6), Pt(107.2, 467.4), Pt(103.0, 462.8), Pt(MAIN_X, 457.5), Pt(MAIN_X, 395)]);
function ConvoyRunning() {
  const line = CONVOY_LINE_104, out = [];
  const total = LineLength(line);
  const At = (d, lat) => { const p = PointBeside(line, Math.min(total, d), lat); return Pt(p.x, p.z); };
  const Heading = (d) => { const a = At(Math.min(total, d + 0.6), 0), b = At(Math.max(0, d - 0.6), 0); return Yaw(a, b); };   // 朝队头（折线起点）走
  out.push(...DongguaOnLitter(At(0, 0), { bearers: 2, yaw: Heading(0) }));
  // 担架一副接一副排在中线上（抬的人前后各 1.6 m，副与副隔 3.4 m）
  for (let i = 0; i < 12; i++) {
    const d = 3.4 * (i + 1);
    out.push(N(`Litter${String(i + 1).padStart(2, "0")}`, At(d, 0), { kind: "litter", name: i === 0 ? "担架" : undefined, yaw: Heading(d), group: "convoy", bearers: 2, speed: TROT }));
  }
  // 走着的伤员在街上（z < 458）靠西边一溜（离担架的杠子 ≥ 1.3 m），架人的在他们外侧
  let walkers = 0, helpers = 0;
  for (let i = 0; i < 16; i++) {
    const d = 20.0 + 1.7 * i;
    walkers++;
    out.push(N(`Walker${String(walkers).padStart(2, "0")}`, At(d, 1.3), { role: "walkingWounded", group: "convoy", yaw: Heading(d), stance: "crouch", speed: 2.0 }));
    if (i % 4 === 1 && helpers < 4) { helpers++; out.push(N(`Helper${String(helpers).padStart(2, "0")}`, At(d, 2.0), { role: "helper", group: "convoy", yaw: Heading(d), speed: 2.0 })); }
  }
  return out;
}
/** 10-5 / 10-6 后送队出了村南口，缩在村口外的路沟里等着（两列担架搁在地上、走着的伤员蹲两边）。 */
function ConvoyAtExit({ dongguaBearers = 0 } = {}) {
  const out = [];
  out.push(...DongguaOnLitter(Pt(EXIT_X + 0.1, 546.0), { bearers: dongguaBearers, yaw: 180 }));
  for (let k = 0; k < 6; k++) {
    out.push(N(`Litter${String(k + 1).padStart(2, "0")}`, Pt(116.0, 547.5 + 2.1 * k), { kind: "litter", name: k === 0 ? "担架" : undefined, yaw: 180, group: "convoy", bearers: 0, speed: TROT }));
    out.push(N(`Litter${String(k + 7).padStart(2, "0")}`, Pt(118.3, 548.55 + 2.1 * k), { kind: "litter", yaw: 180, group: "convoy", bearers: 0, speed: TROT }));
  }
  for (let k = 0; k < 8; k++) {
    out.push(N(`Walker${String(k + 1).padStart(2, "0")}`, Pt(114.3, 547.6 + 1.3 * k), { role: "walkingWounded", group: "convoy", yaw: 180, stance: "crouch", speed: 2.0 }));
    out.push(N(`Walker${String(k + 9).padStart(2, "0")}`, Pt(120.0, 548.2 + 1.3 * k), { role: "walkingWounded", group: "convoy", yaw: 180, stance: "crouch", speed: 2.0 }));
  }
  out.push(N("Helper01", Pt(113.4, 552.0), { role: "helper", group: "convoy", yaw: 180, stance: "crouch", speed: 2.0 }));
  out.push(N("Helper02", Pt(120.9, 552.6), { role: "helper", group: "convoy", yaw: 180, stance: "crouch", speed: 2.0 }));
  out.push(N("Helper03", Pt(114.3, 558.4), { role: "helper", group: "convoy", yaw: 180, stance: "crouch", speed: 2.0 }));
  out.push(N("Helper04", Pt(120.0, 558.9), { role: "helper", group: "convoy", yaw: 180, stance: "crouch", speed: 2.0 }));
  out.push(N("Medic", Pt(117.1, 548.7), { face: Pt(EXIT_X + 0.1, 546.0), stance: "crouch", speed: RUN }));
  out.push(N("Officer", Pt(115.3, 559.3), { face: Pt(117, 545), kind: "officer", speed: RUN }));
  return out;
}

// 东街来的小队（10-2 起，约 45 人，白盒只摆看得见的那十几个）：试探小组两三人一组从街北院门冲出来跑几步扑进下一个门洞，街南后墙的豁子和枪眼里打冷枪；
// 过了第一道弯是 hidden：军官和下一拨在那头
const PB = Object.fromEntries(ES.probes.map((p) => [p.id, Pt(p.x, p.z)]));
const ES2_IN = Pt(PB.ES2Breach.x, PB.ES2Breach.z + 1.4), ES3_IN = Pt(PB.ES3Breach.x, PB.ES3Breach.z + 1.4);   // 豁子里头（空心北屋里）
const JOG_LP1 = Pt(ES.jogLoopholes[0].x + 0.9, ES.jogLoopholes[0].z), JOG_LP2 = Pt(ES.jogLoopholes[1].x + 0.9, ES.jogLoopholes[1].z);   // 第一道弯正面墙枪眼后头（院里）
const OFFICER_HIDE = Pt(184.6, 458.8);
const EastProbe = ({ pulledBack = false } = {}) => [
  J("EastIja1", Pt(139.6, 464.4), { role: "rifleman", group: "east", down: true, yaw: 80, straight: true, name: "冲到半道被扫倒的" }),
  J("EastIja2", Pt(160.8, 465.6), { role: "rifleman", group: "east", down: true, yaw: 110, straight: true }),
  J("EastIja3", pulledBack ? Pt(166.4, 461.6) : Pt(166.0, 463.8), { role: "rifleman", group: "east", stance: "crouch", aim: !pulledBack, face: ROLLER, straight: true, name: "扑进场院口的" }),
  J("EastIja4", pulledBack ? Pt(164.6, 462.2) : Pt(164.6, 464.6), { role: "rifleman", group: "east", stance: "prone", aim: true, face: ROLLER, straight: true }),
  J("EastIja5", pulledBack ? Pt(168.0, 462.0) : Pt(167.6, 464.2), { role: "rifleman", group: "east", stance: "crouch", face: ROLLER, straight: true, name: "带着这一组的" }),
  J("EastIja6", Pt(180.8, 463.6), { role: "rifleman", group: "east", stance: "crouch", aim: true, face: ROLLER, straight: true, name: "第一道弯拐角的" }),
  J("EastIja7", Pt(181.2, 465.9), { role: "rifleman", group: "east", stance: "prone", aim: true, face: ROLLER, straight: true }),
  J("EastIja10", ES2_IN, { role: "rifleman", group: "east", aim: true, yaw: 0, straight: true, name: "街南后墙豁子里打冷枪的" }),
  J("EastIja11", ES3_IN, { role: "rifleman", group: "east", aim: true, yaw: 0, straight: true, name: "街南后墙豁子里打冷枪的" }),
  J("EastIja12", JOG_LP1, { role: "rifleman", group: "east", stance: "crouch", aim: true, yaw: 90, straight: true, name: "第一道弯枪眼里的" }),
  J("EastIja13", JOG_LP2, { role: "rifleman", group: "east", stance: "crouch", aim: true, yaw: 90, straight: true, name: "第一道弯枪眼里的" }),
  J("EastOfficer", OFFICER_HIDE, { stance: "crouch", face: Pt(180, 458), straight: true, name: "喊来的小队的军官（过了弯，看不见）" }),
  J("EastIja14", Pt(PB.EN3aGate.x, PB.EN3aGate.z + 1.3), { role: "rifleman", group: "east", stance: "crouch", face: Pt(180, 458), straight: true, guess: true, name: "过了弯等着的下一拨" }),
  J("EastIja15", Pt(PB.EN3bGate.x, PB.EN3bGate.z + 1.3), { role: "rifleman", group: "east", stance: "crouch", face: Pt(180, 458), straight: true, guess: true }),
];
/** 10-2 两个正从第一道弯往土地庙跑的；10-3 起缩在土地庙后头 */
const EastRunners = ({ atShrine = false } = {}) => [
  J("EastIja8", atShrine ? Pt(173.0, 466.3) : Pt(176.4, 464.2), { role: "rifleman", group: "east", stance: "crouch", face: atShrine ? ROLLER : SHRINE, straight: true, speed: IJA_RUN, name: "往土地庙跑的" }),
  J("EastIja9", atShrine ? Pt(175.0, 466.2) : Pt(178.0, 465.6), { role: "rifleman", group: "east", stance: "crouch", face: atShrine ? ROLLER : SHRINE, straight: true, speed: IJA_RUN }),
];
const ShrineMg = () => [
  J("EastMg1", MG_HIDE, { stance: "prone", aim: true, face: ROLLER, arc: { halfDeg: 6, rangeM: 70, yawDeg: Yaw(MG_HIDE, ROLLER) }, straight: true }),
  J("EastMg2", Pt(173.9, 465.9), { stance: "crouch", face: MG_HIDE, straight: true }),
];
const MortarTeam = () => [
  J("Mortar1", MORTAR_HIDE, { stance: "crouch", face: ROLLER, straight: true, guess: true }),
  J("Mortar2", Off(MORTAR_HIDE, 1.7, 0.6), { stance: "crouch", face: ROLLER, straight: true, guess: true }),
  J("Mortar3", Off(MORTAR_HIDE, -1.7, 0.4), { stance: "crouch", face: MORTAR_HIDE, straight: true, guess: true }),
];
// 北边抄后路的（10-3 起）：院子链上从东往西，最前头的已到主街东侧最南那院、北角的院门外
const NorthChain = () => [
  J("NorthIja1", Pt(NC.pocketGate.x + 0.6, NC.pocketGate.z - 2.2), { role: "rifleman", group: "north", stance: "crouch", aim: true, face: Pt(NC.pocketGate.x, NC.pocketGate.z + 4), straight: true, name: "砸北角院门的" }),
  J("NorthIja2", Pt(116.0, 455.6), { role: "rifleman", group: "north", face: Pt(NC.pocketGate.x, NC.pocketGate.z), straight: true }),
  J("NorthIja3", Pt(133.5, 456.6), { role: "rifleman", group: "north", face: Pt(NC.yard1Door.x, NC.yard1Door.z), straight: true, guess: true }),
  J("NorthIja4", Pt(148.8, 450.2), { role: "rifleman", group: "north", face: Pt(NC.yard1Door.x, NC.yard1Door.z), straight: true, guess: true }),
];
/** 10-5 / 10-6 日军全退：东街的缩到第一道弯那头（看不见），抄北边的退回北侧第一个院里 */
const EastRetreated = () => [
  J("EastIja1", Pt(139.6, 464.4), { role: "rifleman", group: "east", down: true, yaw: 80, straight: true }),
  J("EastIja2", Pt(160.8, 465.6), { role: "rifleman", group: "east", down: true, yaw: 110, straight: true }),
  J("EastIja3", Pt(188.6, 458.4), { role: "rifleman", group: "east", stance: "crouch", yaw: -90, speed: IJA_RUN }),
  J("EastIja4", Pt(190.8, 457.4), { role: "rifleman", group: "east", stance: "crouch", yaw: -90, speed: IJA_RUN }),
  J("EastIja5", Pt(192.6, 458.9), { role: "rifleman", group: "east", stance: "crouch", yaw: -90, speed: IJA_RUN }),
  J("EastIja6", Pt(186.4, 457.2), { role: "rifleman", group: "east", stance: "crouch", yaw: 90, speed: IJA_RUN }),
  J("EastIja7", Pt(186.6, 459.2), { role: "rifleman", group: "east", stance: "crouch", yaw: 90, speed: IJA_RUN }),
  J("EastIja8", Pt(195.4, 457.6), { role: "rifleman", group: "east", stance: "crouch", yaw: -90, speed: IJA_RUN }),
  J("EastIja9", Pt(197.2, 459.0), { role: "rifleman", group: "east", stance: "crouch", yaw: -90, speed: IJA_RUN }),
  J("EastIja10", ES2_IN, { role: "rifleman", group: "east", stance: "crouch", yaw: 0, straight: true }),
  J("EastIja11", ES3_IN, { role: "rifleman", group: "east", stance: "crouch", yaw: 0, straight: true }),
  J("EastIja12", JOG_LP1, { role: "rifleman", group: "east", stance: "crouch", yaw: 90, straight: true }),
  J("EastIja13", JOG_LP2, { role: "rifleman", group: "east", stance: "crouch", yaw: 90, straight: true }),
  J("EastOfficer", OFFICER_HIDE, { stance: "crouch", face: Pt(180, 458), straight: true }),
  J("EastIja14", Pt(PB.EN3aGate.x, PB.EN3aGate.z + 1.3), { role: "rifleman", group: "east", stance: "crouch", face: Pt(180, 458), straight: true, guess: true }),
  J("EastIja15", Pt(PB.EN3bGate.x, PB.EN3bGate.z + 1.3), { role: "rifleman", group: "east", stance: "crouch", face: Pt(180, 458), straight: true, guess: true }),
  J("EastMg1", Pt(199.6, 457.4), { stance: "crouch", yaw: -90, speed: IJA_RUN }),
  J("EastMg2", Pt(201.2, 458.8), { stance: "crouch", yaw: -90, speed: IJA_RUN }),
  ...MortarTeam(),
  J("NorthIja1", Pt(128.0, 452.0), { role: "rifleman", group: "north", stance: "crouch", yaw: 90, speed: IJA_RUN }),
  J("NorthIja2", Pt(131.0, 454.6), { role: "rifleman", group: "north", stance: "crouch", yaw: 90, speed: IJA_RUN }),
  J("NorthIja3", Pt(135.0, 451.4), { role: "rifleman", group: "north", stance: "crouch", yaw: 90, speed: IJA_RUN }),
  J("NorthIja4", Pt(139.0, 455.2), { role: "rifleman", group: "north", stance: "crouch", yaw: 90, speed: IJA_RUN }),
];
// 东北进庄的道上弯着腰往庄子东头走的鬼子（第五版 10-21）：[id, x, lat]；都面朝道上 x 更小的那一点、去向是东街东头
const RoadWalkers = (list) => list.map(([id, x, lat]) => J(id, RoadPointAtX(x, lat), {
  stance: "crouch", face: RoadPointAtX(x - 8, lat), straight: true, guess: id !== "RoadIja1" && id !== "RoadIja5",
  intent: [RoadPointAtX(x - 14, lat), RoadPointAtX(Math.max(236, x - 28), lat * 0.5), Pt(ST.east3.to, ST.east3.c)],
}));
// 实测（空间负责人 10-21）：从街口坡道趴着（眼 0.32）看东北道，道中线 x ≥ 274 那一截才稳看得见（x 272 擦着主街东侧院子北墙东头）；
// 凹路里蹲着看不见任何一段，07-4 末要直起腰（眼 1.62）。08 道上远远走着的三个放在 L0610_EAST_ROAD.viewFromX…viewToX（274…290）往外一点那一截。
const ROAD_IJA_08 = [["RoadIja5", 284, 0.5], ["RoadIja6", 289, -0.6], ["RoadIja7", 294, 0.4]];
/**
 * 第九版（10-24）07-4：最后四个离了大路（在 (292,330) 一带下了东北大道，顺东北场院那条田间小路斜穿麦地），弯着腰奔庄子东北角的土炮楼去，
 * 这一拍在庄子北边的麦地里 x 212…219、z 362…371：离凹路尽头 (100,378) 112…120 m（直起腰的眼睛 ≤ 120 m，画面里认得出是人）。去向顺着麦地直走到炮楼西北角（不排路网）。
 * 08-1 其中一个从炮楼西北角的墙后头冒出来朝逃出来的村民打一梭子（NE_CORNER_IJA）：从街口坡道趴着看，这一点擦着主街东侧院子北墙的东头，刚好看得见。
 */
const TOWER_NW = Pt(L0610_WATCHTOWER.x - L0610_WATCHTOWER.w / 2, L0610_WATCHTOWER.z - L0610_WATCHTOWER.d / 2);   // 土炮楼西北角 (227,388)
const NE_CORNER_IJA = Pt(TOWER_NW.x - 0.4, TOWER_NW.z - 1.5);                 // 08-1 冒出来打一梭子的站点：炮楼西北角外头、庄子北墙（z 388）北边
const FIELD_IJA_074 = [["RoadIja1", 214.5, 366.0], ["RoadIja2", 217.5, 362.5], ["RoadIja3", 212.0, 370.5], ["RoadIja4", 219.0, 368.0]];
const FieldWalkers = (list) => list.map(([id, x, z]) => J(id, Pt(x, z), {
  stance: "crouch", face: Pt(TOWER_NW.x - 0.5, TOWER_NW.z - 2), straight: true, guess: id !== "RoadIja1",
  intent: [Pt(x + 4, z + 8), Pt(TOWER_NW.x - 2.5, TOWER_NW.z - 3.5)],
}));

// ---------------------------------------------------------------------------
// 关键帧

function Keyframes() {
  const K = [];
  const Add = (kf) => K.push(kf);

  // ======================= 06 回到集结处 =======================
  const s06 = { stage: 6, stageTitle: "回到集结处" };
  const p61 = Pt(39, 145.2);   // 10-20 弯沟：坡道下来往东几步，坑窝 A（沟底宽 ~10 m）
  Add({
    id: "06-1", ...s06, name: "回到干沟",
    player: { x: p61.x, z: p61.z, yawDeg: -90, pitchDeg: -4, stance: "stand" },
    what: "干沟空了：血迹、绷带、空水壶，冬瓜不在。何有田：头一趟就抬起走了。",
    next: { text: "去凹路口", x: PL.laneHead.x - 2, z: PL.laneHead.z - 1.5, radiusM: 3 },
    how: ["冬瓜躺过的地方只剩一片血", "最后两副担架正往支沟南头的凹路口抬", "南岸树底下停着一辆驴车", "何有田答话时没回头"],
    notes: "05-4 的人原样下到干沟。沟底的血迹 / 绷带 / 空水壶是场景摆件。10-20 干沟改弯沟：冬瓜躺过的地方在中弯往南的支沟里；老耿的车停在支沟口西壁的坎根、头顶是南岸那棵枯树；妮儿已经蹲在支沟南头的坎脚上捡弹壳（离凹路口三四米）。",
    signals: [],
    units: [
      N("Luo", Off(p61, 2.6, -0.9), { yaw: -90 }),
      N("Yaowa", Off(p61, 1.4, 1.6), { face: PL.gullyRest }),
      N("HeYoutian", Off(p61, 3.9, 1.3), { yaw: -80 }),
      N("LiuWencai", Off(p61, 4.6, -0.4), { yaw: -90 }),
      N("Squad1", Off(p61, -1.6, 1.8), { yaw: -90, guess: true }),
      N("Squad2", Off(p61, 5.8, 1.9), { yaw: -90, guess: true }),
      N("Squad3", Off(p61, -2.4, -0.6), { yaw: -90, guess: true }),
      N("Litter01", Pt(50.5, 149.6), { kind: "litter", name: "担架", yaw: Yaw(Pt(50.5, 149.6), PL.laneHead), group: "convoy", to: LZ(175) }),
      N("Litter02", Pt(47.4, 147.9), { kind: "litter", yaw: Yaw(Pt(47.4, 147.9), PL.laneHead), group: "convoy", to: LZ(175) }),
      C("GengCart", CART, { yaw: PL.cartStop.yawDeg, straight: true }),
      C("Geng", Off(CART, -1.6, -1.2), { face: CART }),
      C("Nier", NIER_RIM, { stance: "crouch", yaw: 20, climb: true }),
    ],
    pois: [POI.assembly(), POI.gullyRest(), POI.laneHead("objective"), POI.cart("landmark")],
  });

  // 06-2：契约 (58,153) 朝东；10-20 弯沟：车在支沟口 (54.5,155)、妮儿在支沟南头坎脚，玩家站中弯西边 (50.5,149.2) 朝东南才同时看得见车和妮儿
  const p62 = Pt(50.5, 149.2);
  Add({
    id: "06-2", ...s06, name: "树底下的驴车",
    player: { x: p62.x, z: p62.z, yawDeg: Yaw(p62, Off(CART, 1, 1)), pitchDeg: -2, stance: "stand" },
    what: "老耿的车停在南岸树底下躲飞机，车上还剩几箱弹药；妮儿蹲在沟沿上捡弹壳，何有田喊她没反应。",
    next: { text: "等传令兵" },
    how: ["车被征来拉弹药，撤的时候车上还剩几箱", "何有田冲她喊「女娃子，让一哈！」", "她没反应；老耿过去拍她肩膀她才抬头、挪开", "不交代她为什么听不见"],
    notes: `契约 (58,153) 朝东；车在 (${CART.x},${CART.z}) 树底下、妮儿在 (${NIER_RIM.x},${NIER_RIM.z}) 的沟沿上（坎脚斜坡），玩家退到 (${p62.x},${p62.z}) 朝东才两个都在画里。妮儿标 climb（蹲在斜坡上）。`,
    signals: [],
    units: [
      N("Luo", Off(p62, 2.4, -1.4), { face: p62 }),
      N("Yaowa", Off(p62, -1.6, -1.8), { face: NIER_RIM }),
      N("HeYoutian", Pt(57.2, 156.2), { face: NIER_RIM }),
      N("LiuWencai", Off(p62, 3.6, 1.0), { face: CART }),
      N("Squad1", Off(p62, -3.4, 0.6), { face: NIER_RIM, guess: true }),
      N("Squad2", Off(p62, -0.4, 2.0), { face: CART, guess: true }),
      N("Squad3", Off(p62, -5.2, -1.2), { yaw: -90, guess: true }),
      N("Litter01", LZ(172, 0.6), { kind: "litter", group: "convoy", speed: TROT }),
      N("Litter02", Pt(63.5, 157.6), { kind: "litter", yaw: -99, group: "convoy", speed: TROT }),
      C("GengCart", CART, { yaw: PL.cartStop.yawDeg, straight: true }),
      C("Geng", Off(NIER_RIM, -0.9, -0.7), { face: NIER_RIM, climb: true }),
      C("Nier", NIER_RIM, { stance: "crouch", yaw: 20, climb: true }),
    ],
    pois: [POI.cart("poi"), POI.nierRim(), POI.laneHead("landmark")],
  });

  // 06-3：传令兵从凹路跑来报信；老耿第一个赶车往南
  // 凹路从支沟南头往东这一截（10-20 弯沟）中线在 z 157.7…158.6、路底宽 4 m：人都摆在路底里
  const p63 = Pt(70, 159.8);
  const cart63 = Pt(77.5, 158.9);
  const runner63 = Pt(73.4, 159.3);
  Add({
    id: "06-3", ...s06, name: "往南赶",
    player: { x: p63.x, z: p63.z, yawDeg: Yaw(p63, runner63), pitchDeg: -2, stance: "stand" },
    what: "传令兵：后送队在南边停起了，前头耿家庄在响枪。老耿朝南看了好一会儿，第一个赶车往南。",
    next: { text: "跟着车进凹路", x: LZ(172).x, z: LZ(172).z, radiusM: 3 },
    how: ["传令兵边跑边喊", "老耿手上的活停了，朝南看", "车先走；班长：都跟斗走！", "车上那几箱弹药跟着车走了（CartDeparted）"],
    notes: "车一走，车上的弹药箱体块随信号 CartDeparted 收掉（编辑器没有「块跟着单位」的能力）。妮儿跟在车边走。",
    signals: [SIG.cartDeparted],
    units: [
      N("Runner", runner63, { face: Off(p63, 1.2, -1.2), from: LZ(185), speed: RUN }),
      N("Luo", Pt(71.2, 157.8), { face: runner63 }),
      N("Yaowa", Pt(68.6, 158.2), { face: runner63 }),
      N("HeYoutian", Pt(67.4, 159.4), { face: runner63 }),
      N("LiuWencai", Pt(72.6, 157.2), { face: runner63 }),
      N("Squad1", Pt(65.8, 157.5), { yaw: -90, guess: true }),
      N("Squad2", Pt(66.6, 159.7), { yaw: -90, guess: true }),
      N("Squad3", Pt(64.4, 158.5), { yaw: -90, guess: true }),
      N("Litter01", LZ(178, 0.6), { kind: "litter", group: "convoy", speed: TROT }),
      N("Litter02", LZ(166, -0.6), { kind: "litter", group: "convoy", speed: TROT }),
      C("GengCart", cart63, { yaw: -90, straight: true, speed: 1.6 }),
      C("Geng", Pt(80.1, 157.8), { yaw: -90 }),
      C("Nier", Pt(75.9, 160.2), { yaw: -90, climb: true }),
    ],
    pois: [POI.laneHead("landmark"), POI.cart("poi"), POI.villageMouth("landmark")],
  });

  // ======================= 07 沿着后送队往前走 =======================
  const s07 = { stage: 7, stageTitle: "沿着后送队往前走" };
  const CART_LAT = 1.0;
  /**
   * 老耿的车在玩家前头 ahead 米、靠路东边；妮儿坐在车尾跟车走（§3 ride，10-20）；老耿在驴头边。
   * 车尾沿在车本地 z = +1.2（Script_EditorBlockoutPuppets BLOCKOUT_CART_SEATS.tail），车板顶 1.025；VilSitEdge 的根在屁股正下方、坐沿在根上 0.90，
   * 小孩身体缩 0.62 → ride.y = 1.025 − 0.90 × 0.62 = 0.467（SitRootY）；背对车头 = yawDeg 180。她自己的 x / z 写成车尾那一点（车不在场时的备用）。
   */
  const CartAhead = (playerZ, ahead = 6, { stance = null } = {}) => {
    const cz = playerZ + ahead;
    const cart = LZ(cz, CART_LAT);
    return [
      C("GengCart", cart, { yaw: 180, straight: true, speed: 1.6 }),
      C("Geng", LZ(cz + 1.9, 0.2), { yaw: 180, stance: stance || undefined }),
      C("Nier", Pt(cart.x, cart.z - NIER_RIDE.z), { yaw: 0, ride: NIER_RIDE }),
    ];
  };
  /**
   * 小队在凹路里往前挤：路中线偏东（担架和伤员在西边、车在东边）。
   * 10-21：幺娃凑在顺子左手边略后（并排说话），刘文财走在顺子和幺娃后头两步、一声不吭（他听见了「路费」那段，08 才会以为顺子要跑）。
   */
  const SquadInLane = (z, { stance = null, withLuo = true } = {}) => [
    ...(withLuo ? [N("Luo", LS(z + 3.0, 0.3), { yaw: 180, stance: stance || undefined })] : []),
    N("Yaowa", LS(z - 0.7, 0.3), { yaw: 180, stance: stance || undefined }),
    N("HeYoutian", LS(z - 3.6, -0.3), { yaw: 180, stance: stance || undefined }),
    N("LiuWencai", LS(z - 2.2, -0.3), { yaw: 180, stance: stance || undefined }),
    N("Squad1", LS(z - 5.6, 0.2), { yaw: 180, guess: true, stance: stance || undefined }),
    N("Squad2", LS(z - 7.4, -0.25), { yaw: 180, guess: true, stance: stance || undefined }),
    N("Squad3", LS(z - 9.2, 0.1), { yaw: 180, guess: true, stance: stance || undefined }),
  ];
  const BANK_LUO = Pt(99.2, 312.0), BANK_OFFICER = Pt(100.2, 311.2);   // 班长和排长蹲在凹路东坎上
  const p71 = LZ(205, 0.2);
  Add({
    id: "07-1", ...s07, name: "队尾·数铜板",
    player: { x: p71.x, z: p71.z, yawDeg: 180, pitchDeg: -6, stance: "stand" },
    what: "后送队贴西坎停成一长溜。顺子边走边数铜板，幺娃问：数个锤子哦？车在前头几步，妮儿坐车尾晃腿。",
    next: { text: "往前挤", x: LZ(244).x, z: LZ(244).z, radiusM: 3 },
    how: ["整条路都是人，一直望到南边", "担架一副挨一副搁在地上，抬担架的蹲在杠子边喘气", "车轮在车辙里颠，弹药箱哐哐响", "幺娃凑过来：顺儿哥，攒起娶婆娘？", "刘文财走在两人后头两步，一声不吭（他听见了）"],
    notes: `后送队 ${SLOTS.filter((s) => s.kind === "litter").length + 1} 副担架（含冬瓜那副）、${SLOTS.filter((s) => s.kind !== "litter" && s !== DONGGUA_SLOT).length} 个走着的伤员（${SLOTS.filter((s) => s.helper).length} 个有人架着），`
      + "贴西坎从 z 190 停到 z 315；「被人背着的」预演用 VilNraCarryOnBack + VilRideOnBack 一对。车在玩家前头 6 m 靠路东边；妮儿坐在车尾（ride 挂在 GengCart 车尾沿、背对车头，预演播 VilSitEdge），车动她跟着走。",
    signals: [SIG.cartDeparted],
    units: [
      ...SquadInLane(205),
      N("Runner", LS(214.5, 0), { yaw: 180, to: LZ(300), speed: RUN }),
      ...Column(),
      ...DongguaOnLitter(DONGGUA_LITTER),
      N("Medic", LZ(DONGGUA_SLOT.z + 0.9, COLUMN_LAT + 0.8), { face: DONGGUA_LITTER, stance: "crouch" }),
      N("Officer", BANK_OFFICER, { face: MOUTH, stance: "crouch", climb: true }),
      ...CartAhead(205),
    ],
    pois: [POI.villageMouth("landmark"), Poi("ColumnHead", "队头", "poi", LZ(314), 3)],
  });

  const p72 = LZ(250, 0.2);
  Add({
    id: "07-2", ...s07, name: "我妹今年十二",
    player: { x: p72.x, z: p72.z, yawDeg: 180, pitchDeg: -4, stance: "stand" },
    what: "顺子说到「……我妹今年十二」，眼前就是车尾晃腿的妮儿。幺娃过了好一会儿：老子一个字都没听到。表跟第二个人讲。",
    next: { text: "往队头挤", x: LZ(294).x, z: LZ(294).z, radiusM: 3 },
    how: ["边走边说，幺娃在左手边略后", "车尾的妮儿就在正前方几步，不给特写、不点破", "台词在 Notion 07（路费 / 他舅在船上烧锅炉 / 东家拿人抵 / 卖你妈个锤子）", "刘文财在后头两步，回头能看见他，他不吭声", "前头村子的枪声时有时无"],
    notes: "台词不逐句进关键帧。车仍在玩家前头 6 m，妮儿在车尾正对着玩家。刘文财听见了「路费」那段，08-4 才会吼「往哪……」。",
    signals: [SIG.cartDeparted],
    units: [
      ...SquadInLane(250),
      ...Column(),
      ...DongguaOnLitter(DONGGUA_LITTER),
      N("Medic", LZ(DONGGUA_SLOT.z + 0.9, COLUMN_LAT + 0.8), { face: DONGGUA_LITTER, stance: "crouch" }),
      N("Officer", BANK_OFFICER, { face: MOUTH, stance: "crouch", climb: true }),
      ...CartAhead(250),
    ],
    pois: [POI.villageMouth("landmark"), Poi("ColumnHead", "队头", "poi", LZ(314), 3)],
  });

  // 07-3：冬瓜在队头附近 z≈300 的担架上（他是头一趟抬下来的）；班长和排长蹲在东坎上往南看
  const p73 = LZ(DONGGUA_SLOT.z - 0.4, 0.35);
  Add({
    id: "07-3", ...s07, name: "冬瓜",
    player: { x: p73.x, z: p73.z, yawDeg: Yaw(p73, DONGGUA_LITTER), pitchDeg: -24, stance: "stand" },
    what: "冬瓜裹着单被发抖。掀开被角：肚子上一条吸透血的毛巾。卫生兵：天黑前送不到军医手上，就等到挖坑埋人！",
    next: { text: "跟班长往前", x: LZ(336).x, z: LZ(336).z, radiusM: 3 },
    how: ["担架搁在西坎根，卫生兵满手是血蹲在旁边给别人缠绷带", "按键掀被角", "冬瓜：表掀……冷得很", "队头坎上班长和排长蹲着往南看：狗日的庄子里有鬼子"],
    notes: `契约 (95,300) 朝东南看担架；后送队贴西坎，冬瓜的担架在路西边 (${DONGGUA_LITTER.x},${DONGGUA_LITTER.z})，玩家站路中线偏东朝西南看它。班长 / 排长在东坎顶 (${BANK_LUO.x},${BANK_LUO.z})（契约 (97,312) 在坎的斜面上，挪到坎顶）。`,
    signals: [SIG.cartDeparted],
    units: [
      N("Luo", BANK_LUO, { face: MOUTH, stance: "crouch", climb: true }),
      N("Officer", BANK_OFFICER, { face: MOUTH, stance: "crouch", climb: true }),
      ...SquadInLane(DONGGUA_SLOT.z - 4, { withLuo: false }),
      ...Column(),
      ...DongguaOnLitter(DONGGUA_LITTER),
      N("Medic", LZ(DONGGUA_SLOT.z + 1.6, COLUMN_LAT + 0.9), { face: LZ(DONGGUA_SLOT.z + 4, COLUMN_LAT), stance: "crouch" }),
      ...CartAhead(DONGGUA_SLOT.z, 7),
    ],
    pois: [Poi("DongguaLitter", "冬瓜的担架", "objective", DONGGUA_LITTER, 1.5), Poi("BankLuo", "班长和排长（坎上）", "poi", BANK_LUO, 2), POI.villageMouth("landmark")],
  });

  // 07-4：全程第一人称（10-21 用户：不要第三人称机位）。三架日机高高地往南飞过去炸县城，全路的人往坎底下缩，妮儿最后一个趴下；
  // 顺子半蹲贴在凹路东坎根（不是趴），飞机过头顶那 10 s 能转头不能走（预演 eye.free）。东北进庄的道上三四个鬼子弯着腰往庄子东头走。
  const p74 = LZ(333.5, 1.3);
  Add({
    id: "07-4", ...s07, name: "飞机和村子",
    player: { x: p74.x, z: p74.z, yawDeg: 150, pitchDeg: 2, stance: "crouch" },
    what: "三架日机高高地往南飞过（去炸县城），路上的人全往坎底下缩；妮儿最后一个趴下。路爬出洼地，庄子东头冒着烟。",
    next: { text: "到村口路沟", x: DITCH_08.Luo.x, z: DITCH_08.Luo.z, radiusM: 3 },
    how: ["全程第一人称：蹲着跟班长的后背顺凹路跑，排长喊「飞机！贴到坎！」", "顺子半蹲贴在东坎根，飞机过头顶那 10 s 能转头不能走；老耿拽着驴往坎边靠", "妮儿是看见别人都趴下才抬头，这时飞机已经在头顶", "班长「起来！走！」全班弯腰顺凹路往前跑，凹路越走越浅，直起腰先看庄子：冒烟的都在东头（塌了角的房、一两处草顶着火），枪声也从东头一阵一阵传来，夹着听不清的日本话", "再看东北角：道上最后几个鬼子离了大路，从土炮楼那边弯着腰斜穿麦地往庄子东北角钻（100–120 m，认得出是人）", "到村口路沟，班长回头压手「趴倒！」"],
    notes: `不能走的约 30 s 第一人称段，关键帧只摆趴下那一拍：顺子半蹲在东坎根 (${p74.x},${p74.z})，小队、后送队全体 prone；老耿蹲在驴边；妮儿还坐在车尾（ride），她听不见，预演里看见别人都趴了才从车尾滑下来在车边扑倒（最后一个）。飞机是预演里的 aircraft 轨：三架 Ki-30 离地约 400 m 往南去炸县城，不下来、不开枪；它们看见了这里的人，13 低空扫射的就是它们炸完回去、再一次出动来的。第九版（10-24）：四个鬼子（占了老耿家那伙的尾巴）已经离了大路，在庄子北边的麦地里 x 212…219、z 362…371，离凹路尽头 (100,378) 112…120 m，弯着腰奔东北角的土炮楼去；凹路里蹲着看不见，末段直起腰才看得见。08-1 从东北角墙后打村民那一梭子就是他们打的。`,
    signals: [SIG.cartDeparted],
    units: [
      N("Luo", LS(344.0, 0.3), { yaw: 180, stance: "prone" }),
      N("Officer", LS(345.2, -0.3), { yaw: 180, stance: "prone", kind: "officer" }),
      ...SquadInLane(335, { stance: "prone", withLuo: false }),
      ...Column({ stance: "prone" }),
      ...DongguaOnLitter(DONGGUA_LITTER),
      N("Medic", LZ(DONGGUA_SLOT.z + 1.6, COLUMN_LAT + 0.9), { yaw: 180, stance: "prone" }),
      ...CartAhead(p74.z, 6.5, { stance: "crouch" }),
      ...FieldWalkers(FIELD_IJA_074),
    ],
    pois: [POI.villageMouth("objective"), POI.ditch("landmark"), POI.eastRoad(), Poi("NeCorner", "庄子东北角的土炮楼（鬼子斜穿麦地往那儿钻）", "danger", TOWER_NW, 4)],
  });

  // ======================= 08 村口 =======================
  const s08 = { stage: 8, stageTitle: "村口" };
  const P08 = SHOOTER.player;
  /**
   * 08-1 逃出来的五个村民（第五版 10-21，用户：笔直的主街对着机枪不可能跑掉，活下来的走岔路；第九版 10-24：巷子那边不再有人跑出来，改从东头来）：
   *   · Villager2 / 3 从主街东边 z 432.5 那道院门（MAIN_EAST_GATE2）冲上主街往北跑，被堂屋枪眼里的机枪打倒（3 号出门两步就倒，2 号跑到 z 412）；
   *   · Villager1 从庄子东北角跑出来（鬼子进庄时他从北墙外的麦地里溜了，这一拍从北墙根 (166,385.2) 起跑，离街口坡道 69 m），顺着庄子北墙、路沟北沿往西跑；
   *     东北角土炮楼的墙后冒出来的鬼子打来一梭子（土在他脚后跟溅起一串，不往沟里打），他扑进路沟东半截、手脚并用爬到坡道边（离坡道 1 m），
   *     冲班长喘着说「东头……过来的……进庄了……」，之后跟着后送队；
   *   · Villager4 / 5 从主街东边最北那院北墙上朝路沟的后门（ditchBackGate）出来，直接下到沟东半截缩进后送队（08-2 还在，之后跟后送队走了）；班长看了那道后门一眼（记住了）。
   */
  const DITCH_GATE_OUT = Pt(SY.eastOfMain.ditchBackGateX, SY.eastOfMain.box.minZ - 0.75);   // 后门外、路沟南沿上
  const DITCH_GATE_IN = Pt(SY.eastOfMain.ditchBackGateX, SY.eastOfMain.box.minZ - 0.3);     // 后门洞里（第九版：EM1 的北屋挪到门东边了，门里是院子，班长那一路从这里进）
  const MAIN_EAST_GATE2 = Pt(SY.eastOfMain.box.minX, SY.eastOfMain.gatesZ[1]);           // 主街东边 z 432.5 那道院门
  const V4_IN = Pt(110.35, 381.1), V5_IN = Pt(112.65, 381.1);                             // 沟东半截两副担架之间
  const V1_IN = Pt(104.0, 381.6);                                                         // 沟东半截、坡道边（车尾和排长之间）
  const V1_DIVE = Pt(107.2, 377.0);                                                       // 路沟北沿上扑进沟的地方
  const V1_START = Pt(166.0, 385.2);                                                      // 庄子北墙根外的麦地（北墙 z 388 的北面）
  const Villagers08 = ({ arriving = false } = {}) => [
    C("Villager1", V1_IN, { name: "东头跑来扑进沟的村民", stance: "crouch", face: DITCH_08.Luo, climb: true, speed: 2.9,
      ...(arriving ? { from: [V1_START, Pt(140, 381.5), Pt(125, 377.5), V1_DIVE, Pt(106.3, 379.6)], fromStraight: true } : { straight: true }) }),
    C("Villager2", Pt(101.2, 412), { down: true, yaw: 20, name: "院门冲出来的村民", speed: 2.9, ...(arriving ? { from: [Off(MAIN_EAST_GATE2, 1.45, 0.1), Off(MAIN_EAST_GATE2, -0.9, 0.0)], fromStraight: true } : { straight: true }) }),
    C("Villager3", Pt(99.0, 431), { down: true, yaw: -30, speed: 2.9, ...(arriving ? { from: [Off(MAIN_EAST_GATE2, 1.5, -0.5), Off(MAIN_EAST_GATE2, -0.7, -0.4)], fromStraight: true } : { straight: true }) }),
    C("Villager4", V4_IN, { stance: "crouch", face: Pt(V4_IN.x, V4_IN.z - 3), name: "后门下到沟里的村民", climb: true, speed: 2.9,
      ...(arriving ? { from: [Off(DITCH_GATE_IN, -0.3, 0.3), Off(DITCH_GATE_OUT, -0.3, 0)], fromStraight: true } : { intent: [Pt(118.0, 381.2)] }) }),
    C("Villager5", V5_IN, { stance: "crouch", face: Pt(V5_IN.x, V5_IN.z - 3), climb: true, speed: 2.9,
      ...(arriving ? { from: [Off(DITCH_GATE_IN, 0.3, 0.2), Off(DITCH_GATE_OUT, 0.3, 0.1)], fromStraight: true } : { intent: [Pt(120.3, 381.2)] }) }),
  ];
  /** 北屋里的八个：机枪组三个守堂屋枪眼，分队长在后头，东西两间枪眼各两个（一个趴枪眼、一个递弹）。 */
  const HouseIja = ({ mgArc = MG_ARC, mgFace = LOOPHOLE, heads = 0, without = [] } = {}) => [
    J("MgGunner", MG_AT, { yaw: heads || 0, stance: "crouch", aim: true, arc: mgArc, face: heads ? undefined : mgFace }),
    J("MgLoader", MG_LOADER_AT, { yaw: heads || 0, stance: "crouch" }),
    J("MgThird", MG_THIRD_AT, { yaw: heads || 0, stance: "crouch" }),
    J("Leader", LEADER_AT, { yaw: heads || 0, aim: !heads }),
    J("Rifle1", RIFLE_W_AT, { yaw: 0, stance: "crouch", aim: true }),
    J("Rifle2", RIFLE_W2_AT, { yaw: heads || 0 }),
    J("Rifle3", RIFLE_E_AT, { yaw: 0, stance: "crouch", aim: true }),
    J("Rifle4", RIFLE_E2_AT, { yaw: heads || 0 }),
  ].filter((u) => !without.includes(u.id));
  const CornerIja = ({ runnerGone = false } = {}) => [
    J("CornerIja1", CORNER1_AT, { stance: "crouch", aim: true, face: Pt(MAIN_X, 440) }),
    ...(runnerGone ? [] : [J("CornerIja2", CORNER2_AT, { stance: "crouch", face: Pt(MAIN_X, 440) })]),
  ];
  const KitchenIja = () => [J("KitchenIja", KITCHEN_IN, { yaw: -90 })];
  // 地瓜窖那伙（街坊家）：拎手榴弹的在窖口北边、拿刺刀的在东边、拖人的在西边、翻东西的在南边；一家人在窖里（标 climb：窖坑 2 m 深）
  const FamilyInCellar = () => [
    C("CellarMan", Off(CELLAR, -0.5, -0.5), { stance: "crouch", yaw: 0, climb: true }),
    C("CellarWife", Off(CELLAR, 0.5, -0.4), { stance: "crouch", yaw: 0, climb: true }),
    C("CellarGranny", Off(CELLAR, 0, 0.4), { stance: "crouch", yaw: 0, climb: true }),
  ];
  const CellarGroup08 = () => [
    J("CellarIja1", Pt(72.4, 458.2), { face: CELLAR }),
    J("CellarIja2", Pt(75.9, 459.6), { face: CELLAR, aim: true }),
    J("CellarIja3", Pt(71.4, 462.4), { face: CELLAR }),
    J("CellarIja4", Pt(75.2, 462.6), { face: CELLAR }),
    ...FamilyInCellar(),
  ];
  const MillMan = () => [C("MillOldMan", MILL_MAN, { down: true, yaw: 60 })];
  /** 街口坡道上趴着压枪眼的：幺娃、Squad3、刘文财（顺子是玩家）；08-4 起 Escort2 也趴上来（四个）。slots：打一枪换个窝（谁趴哪个射击位） */
  const Shooters08 = (faces = {}, slots = {}, ids = ["Yaowa", "Squad3", "LiuWencai"]) => ids.map((id) => { const at = SHOOTER[slots[id] || id]; return N(id, at, {
    stance: "prone", face: faces[id] || LOOPHOLE, aim: !faces[id], guess: id === "Squad3", arc: faces[id] ? undefined : ArcTo(at, LOOPHOLE, 4, 4), speed: RUN,
  }); });
  /** 沟底街口西边的人：班长、老耿、妮儿、排长、卫生兵、何有田、两个后送队的兵、Squad1 / Squad2 */
  const DitchParty08 = (faces = {}) => [
    N("Luo", DITCH_08.Luo, { stance: "crouch", face: faces.Luo || LOOPHOLE, speed: RUN }),
    N("HeYoutian", DITCH_08.HeYoutian, { stance: "crouch", face: faces.HeYoutian || DITCH_08.Luo, speed: RUN }),
    N("Escort1", DITCH_08.Escort1, { stance: "crouch", face: DITCH_08.Luo, speed: RUN }),
    N("Escort2", DITCH_08.Escort2, { stance: "crouch", face: DITCH_08.Luo, speed: RUN }),
    N("Squad1", DITCH_08.Squad1, { stance: "crouch", yaw: 180, guess: true, speed: RUN }),
    N("Squad2", DITCH_08.Squad2, { stance: "crouch", yaw: 180, guess: true, speed: RUN }),
    N("Officer", DITCH_08.Officer, { stance: "crouch", face: faces.Officer || DITCH_08.Luo, kind: "officer", speed: RUN }),
    N("Medic", DITCH_08.Medic, { stance: "crouch", face: DITCH_08.DongguaLitter, speed: RUN }),
    C("Geng", DITCH_08.Geng, { face: faces.Geng || LOOPHOLE, speed: 2.0 }),
    C("Nier", DITCH_08.Nier, { stance: "crouch", face: DITCH_08.Geng, speed: NIER_RUN }),
  ];
  const ConvoyInDitch = () => [...DitchConvoy(), ...DongguaOnLitter(DITCH_08.DongguaLitter, { yaw: -90 }), C("GengCart", DITCH_08.Cart, { yaw: -90, straight: true, speed: CART_RUN })];
  Add({
    id: "08-1", ...s08, name: "村口·枪眼",
    player: { x: P08.x, z: P08.z, yawDeg: 180, pitchDeg: -1, stance: "prone" },
    what: "两个村民冲上主街被枪眼打倒；一个从东头跑来、挨了东北角一梭子扑进沟：东头……进庄了。两个从后门下到沟。老耿：那是俺家。",
    next: { text: "看清怎么过" },
    how: ["趴在路沟南沿上顺着主街看到尽头：老耿家北屋后墙上凿的枪眼，机枪从那里打出来", "后送队和车缩在路沟东半截，小队在西半截", "一个村民从庄子东北角跑出来（六七十米外），顺庄子北墙根、路沟北沿往西跑；东北角土炮楼的墙后冒出一两个鬼子打来一梭子，土在他脚后跟溅起一串，不往沟里打；那人露一下就缩回去了", "他扑进路沟东半截，手脚并用爬到坡道边，冲班长喘着说「东头……过来的……进庄了……」，边说边往东指", "两个从主街东边院门冲上街被打倒；两个从北边后门钻出来溜进沟东半截——班长看了那道后门一眼（记住了）", "老耿只说一句：那是俺家……狗日的占了俺家", "东北道上远远还有两三个鬼子在往庄里走"],
    notes: `趴在街口坡道上半截 (${P08.x},${P08.z})（眼刚高过街面）：主街只有 6 m 宽，趴在 x < 97 的沟沿上视线被主街西墙北头挡死，所以四个压枪眼的人都在街口。`
      + "鬼子 08 已在老耿家：北屋机枪组 3 守堂屋枪眼、分队长 + 东西两间枪眼 4 个兵、路口墙角 2、灶屋 1；街坊家搜窖 4（一家人还在窖里）。一共 15 个，没有人在房顶上。"
      + `村民走岔路（10-21 用户；第九版 10-24 巷子那边不再有人）：Villager2 / 3 从 (${MAIN_EAST_GATE2.x},${MAIN_EAST_GATE2.z}) 那道院门冲上街被打倒；Villager1 从庄子北墙根外 (${V1_START.x},${V1_START.z}) 顺北墙、路沟北沿往西跑、在 (${V1_DIVE.x},${V1_DIVE.z}) 扑进沟、爬到 (${V1_IN.x},${V1_IN.z})；Villager4 / 5 从路沟后门 (${DITCH_GATE_OUT.x},${SY.eastOfMain.box.minZ}) 下到沟东半截。`
      + `东北角那一梭子是 07-4 斜穿麦地那伙打的：NeCornerIja 在土炮楼西北角外 (${NE_CORNER_IJA.x},${NE_CORNER_IJA.z}) 露一下就缩回去（08-2 起不摆）；从坡道趴着看，这一点擦着主街东侧院子北墙的东头，刚看得见。`,
    signals: [SIG.cartDeparted],
    units: [
      ...Shooters08(), ...DitchParty08(),
      ...Villagers08({ arriving: true }),
      J("NeCornerIja", NE_CORNER_IJA, { stance: "crouch", aim: true, face: Pt(118, 378), straight: true, intent: [Pt(TOWER_NW.x - 2.0, TOWER_NW.z - 2.5)] }),
      ...HouseIja(), ...CornerIja(), ...KitchenIja(), ...CellarGroup08(), ...MillMan(),
      ...ConvoyInDitch(),
      ...RoadWalkers(ROAD_IJA_08),
    ],
    pois: [POI.loophole("danger"), POI.mainStreet("landmark"), POI.ditch("landmark"), Poi("NeCorner", "东北角墙角（打了一梭子）", "danger", NE_CORNER_IJA, 2), Poi("BackGate", "朝路沟的后门（班长记住了）", "poi", Pt(EYR.backGate.x, EYR.backGate.z), 1.2), POI.eastRoad()],
  });

  Add({
    id: "08-2", ...s08, name: "绕不过去",
    player: { x: P08.x, z: P08.z, yawDeg: Yaw(P08, DITCH_08.Luo), pitchDeg: 6, stance: "prone" },
    what: "班长：东边走不得，西边喃？老耿：河汊子水齐腰深；往南就一条道，俺家东墙外头那条小胡同。排长：等天黑。班长：打！",
    next: { text: "压枪眼" },
    how: ["回头看沟底：老耿、班长、排长、卫生兵蹲在街口西边", "班长先扭头朝东看一眼（视线跟着看到东北角刚才开枪的墙角，再落回来）：东边是狗日的来的路，走不得；再问老耿西边", "老耿朝西指河汊子（坎陡、水齐腰深）；卫生兵：抬起蹚水？泡一哈冷水就没得了", "老耿指着主街尽头自家：往南就一条道，俺家东墙外头那条小胡同，胡同口就挨着俺家", "排长：等天黑。顺子：冬瓜早他妈凉透了！卫生兵：一半挨不到天黑", "班长盯着枪眼啐一口：……日他妈。打！给老子把那个枪眼压到！"],
    notes: "墙根有个狗洞，老耿没想起来（小孩走的路）。next 只写文字：下一步还是趴在原地。后门下来的两个村民还缩在沟东半截的担架之间；东头跑来的那个也在，挤在车尾和排长之间。第九版（10-24）：班长最后一句改短，这一拍不点名、不分人。",
    signals: [SIG.cartDeparted],
    units: [
      ...Shooters08({ Yaowa: DITCH_08.Luo }), ...DitchParty08({ Luo: DITCH_08.Geng, Geng: DITCH_08.Luo, Officer: DITCH_08.Luo }),
      ...Villagers08(),
      ...HouseIja(), ...CornerIja(), ...KitchenIja(), ...CellarGroup08(), ...MillMan(),
      ...ConvoyInDitch(),
      ...RoadWalkers(ROAD_IJA_08),
    ],
    pois: [POI.loophole("danger"), POI.river(), POI.eastRoad(), POI.ditch("landmark")],
  });

  // 08-3：玩家趴在街口坡道上压枪眼，枪眼一梭打沟沿；班长带何有田和后送队两个兵蹲在街口坡道脚下（第九版：不再往大车摸，这一拍末机枪扫到沟里、妮儿身边一个伤兵中枪）。没有台词
  const LuoWait = () => [
    N("Luo", LUO_WAIT.Luo, { stance: "crouch", face: Pt(MAIN_X, 400), speed: RUN }),
    N("HeYoutian", LUO_WAIT.HeYoutian, { stance: "crouch", face: LUO_WAIT.Luo, speed: RUN }),
    N("Escort1", LUO_WAIT.Escort1, { stance: "crouch", face: LUO_WAIT.Luo, speed: RUN }),
    N("Escort2", LUO_WAIT.Escort2, { stance: "crouch", face: LUO_WAIT.Luo, speed: RUN }),
  ];
  const DitchRest08 = (gengFace = LOOPHOLE) => [
    N("Squad1", DITCH_08.Squad1, { stance: "crouch", yaw: 180, guess: true, speed: RUN }),
    N("Squad2", DITCH_08.Squad2, { stance: "crouch", yaw: 180, guess: true, speed: RUN }),
    N("Officer", DITCH_08.Officer, { stance: "crouch", face: LOOPHOLE, kind: "officer", speed: RUN }),
    N("Medic", DITCH_08.Medic, { stance: "crouch", face: DITCH_08.DongguaLitter, speed: RUN }),
    C("Geng", DITCH_08.Geng, { face: gengFace, speed: 2.0 }),
  ];
  Add({
    id: "08-3", ...s08, name: "压枪眼",
    player: { x: P08.x, z: P08.z, yawDeg: 180, pitchDeg: -1, stance: "prone" },
    what: "玩家趴在街口坡道上朝枪眼打，枪眼一梭打沟沿。末了机枪扫到沟里：妮儿身边一个伤兵中枪，血溅了她一脸，她缩在沟底不动了。",
    next: { text: "一直压" },
    how: ["机枪一梭打沟沿：玩家一打，枪眼就回一梭；一停火它就找别的目标", "班长四人蹲在坡道脚下，不动（第九版：不往大车摸了）", "没有台词", "这一段教会玩家：这边一打，枪眼就回一梭", "拍末机枪回过来一梭扫到沟里：妮儿身边一个伤兵中枪，血溅了她一脸，她缩在沟底不动了"],
    notes: `枪眼 (${LOOPHOLE.x},${LOOPHOLE.z})：0.5 m 厚的墙上 0.3 m 的洞，只能朝正面 ±30° 打；机枪的射界只罩得住主街和街口坡道。班长四人在坡道脚下 (${LUO_WAIT.Luo.x},${LUO_WAIT.Luo.z}) 一带蹲着。伤兵中枪在这一拍末（预演里演），08-4 起 Walker04 倒着。`,
    signals: [SIG.cartDeparted],
    units: [
      ...Shooters08(), ...LuoWait(), ...DitchRest08(),
      C("Nier", DITCH_08.Nier, { stance: "crouch", face: DITCH_08.Geng, speed: NIER_RUN }),
      ...Villagers08().filter((u) => !u.id.match(/Villager[45]/)),
      ...HouseIja(), ...CornerIja(), ...KitchenIja(), ...CellarGroup08(), ...MillMan(),
      ...ConvoyInDitch(),
    ],
    pois: [POI.loophole("danger"), POI.corner("danger"), POI.ditch("landmark"), POI.alleyMouth("landmark")],
  });

  // 08-4（第九版 10-24 定计）：班长瞄一眼后门一句话定计（有田穿院子、顺儿走巷子、哪个先到哪个先打）；班长带何有田、Escort1 爬上南沿钻 EM1 的后门；
  // 顺子顺沟南沿往西爬到巷子口、拐进巷子（约 5 s 不能操作，刘文财嘟囔「让他一个人走？」被「闭嘴！压到枪眼！」堵回去），进巷子十来米交还操作；
  // 身后老耿喊「妮儿！」、幺娃拽他：妮儿趁乱溜出沟顺沟底往西、爬上南沿跟着钻进巷子（玩家只听得见）；墙角一个鬼子出路口往东跑去喊人
  const p84 = Pt(ALLEY_X, 388.6);
  const nier84 = Pt(ALLEY_X + 0.4, 384.0);                                   // 巷子口里（顺子身后 4.6 m，默认视线朝南看不见她）
  const geng84 = Pt(102.0, 382.3);
  // 墙角在主街东边的院墙后头，街口看不见；他出墙角先横过路口（主街那 6 m 宽的口子里露 1–2 s，幺娃才看得见喊「跑了一个」）再拐进东街
const RUNNER_PATH = [CORNER2_AT, Pt(102.4, 461.8), Pt(99.4, 464.6), Pt(103.8, 466.6), Pt(109.4, 465.4), Pt(112.4, 465.0), Pt(116.4, 465.1)];
  /** 08-4 末班长三人在路沟南沿下、后门跟前（从坡道脚下顺沟底过去，爬上南沿钻门：标 climb） */
  const BackGateParty = () => EAST_TRIO.map((id) => N(id, BACK_GATE_PARTY[id], { stance: "crouch", face: Pt(EYR.backGate.x, EYR.backGate.z), climb: true, speed: RUN }));
  Add({
    id: "08-4", ...s08, name: "班长定计·分三拨",
    player: { x: p84.x, z: p84.z, yawDeg: 180, pitchDeg: -2, stance: "crouch" },
    what: "班长瞄一眼后门：有田跟老子穿院子，顺儿走巷子摸到他屁股后头，哪个先到哪个先打！顺子爬进巷子；妮儿趁乱跟了进去。",
    next: { text: "顺巷子往里摸", x: A3_X, z: A2_Z + 2, radiusM: 2 },
    how: ["班长瞄了一眼那道后门，一句话定计：压到枪眼！有田，跟老子穿院子。顺儿，你走巷子，摸到他屁股后头。哪个先到哪个先打！", "班长带何有田和一个后送队的兵顺沟底往东、爬上南沿猫腰钻进后门进 EM1；坡道上留幺娃、刘文财、Squad3 和另一个兵接着压枪眼（打一枪挪一下窝）", "顺子顺沟南沿往西爬到巷子口、拐进巷子（约 5 s 不能操作）；刘文财在后头嘟囔：让他一个人走？……班长头也不回：闭嘴！压到枪眼！", "进巷子十来米交还操作（能转头不能走）。身后听见老耿喊「妮儿！妮儿——！」、幺娃「老人家你不要命了嗦！」：妮儿趁乱溜出沟，顺沟底往西、爬上南沿，跟着钻进了巷子（看不见，只听得见）", "幺娃又喊：跑了一个！往东边跑了！墙角一个鬼子出路口往东跑", "大车后头没有人了：班长那一路不上主街"],
    notes: `顺子交还操作的地方 (${p84.x},${p84.z})：巷子口往里几米。妮儿从车尾 (${DITCH_08.Nier.x},${DITCH_08.Nier.z}) 顺沟底往西、在 x 80 爬上南沿（标 climb），这一帧刚到巷子口里 (${nier84.x},${nier84.z})、在顺子身后；09-1 她从后头追上他。班长、何有田、Escort1 在路沟南沿下后门跟前 (${BACK_GATE_PARTY.Luo.x},${BACK_GATE_PARTY.Luo.z}) 一带、要钻 (${EYR.backGate.x},${EYR.backGate.z}) 那道后门进 EM1（班长那一路见 09 各帧）；Escort2 趴上坡道、补顺子空出来的射击位。老耿爬出沟被幺娃拽回之后蹲在沟沿下，幺娃爬回自己的射击位。`,
    signals: [SIG.cartDeparted],
    units: [
      C("Nier", nier84, { yaw: 180, stance: "crouch", speed: NIER_RUN, path: [DITCH_08.Nier, Pt(90, 380.6), Pt(ALLEY_X + 0.4, DT.z), nier84], intent: [Pt(ALLEY_X, 392), Pt(ALLEY_X, 398), Pt(A3_X, A2_Z)], climb: true }),
      ...Shooters08({}, SHOOTER_SLOTS_09["08-4"], SHOOTER_IDS),
      ...BackGateParty(), ...DitchRest08(Pt(ALLEY_X, DT.z)).filter((u) => u.id !== "Geng"),
      C("Geng", geng84, { stance: "crouch", face: Pt(ALLEY_X, PL.alleyMouth.z), climb: true, speed: 2.0 }),
      N("Walker04", Pt(108.6 + 1.85 * 3, 379.15), { role: "walkingWounded", group: "convoy", down: true, yaw: 180, name: "妮儿身边中枪的伤兵" }),
      ...Villagers08().filter((u) => !u.id.match(/Villager[45]/)),
      ...HouseIja(), ...CornerIja({ runnerGone: true }),
      J("CornerIja2", RUNNER_PATH[6], { face: Pt(146, EAST_Z), path: RUNNER_PATH, intent: [Pt(PB.EN1Gate.x, EAST_Z), PB.EN1Gate, Pt(PB.EN1Gate.x, PB.EN1Gate.z - 2)], speed: 4.0, name: "跑去东街喊人的" }),
      ...KitchenIja(), ...CellarGroup08(), ...MillMan(),
      ...ConvoyInDitch().filter((u) => u.id !== "Walker04"),
    ],
    pois: [POI.alleyMouth("landmark"), Poi("NierFollows", "妮儿（巷子口里，跟着进来了）", "poi", nier84, 1.5), Poi("RunnerIja", "跑去喊人的鬼子", "danger", RUNNER_PATH[6], 1.5), POI.loophole("danger"), Poi("BackGate", "班长那一路进的后门", "objective", Pt(EYR.backGate.x, EYR.backGate.z), 1.2)],
  });

  // ======================= 09 摸进老耿家 =======================
  const s09 = { stage: 9, stageTitle: "摸进老耿家" };
  /**
   * 班长那一路（两路，10-24；第九版从后门进）在这一帧的三个人：站位 EAST_ROUTE；09-1 从路沟南沿下爬上去钻后门进 EM1（显式 path、标 climb），
   * 09-2 到 EM1 / EM2 豁口（路网：绕过杂货铺），09-5 翻墙（显式 path、标 climb / through），其余帧按路网 / 院子里直走。全程蹲着、不端枪。
   */
  const EastRouteTrio = (kfId) => EAST_TRIO.map((id) => {
    const at = EAST_ROUTE[kfId][id];
    const o = { stance: "crouch", speed: RUN };
    if (kfId === "09-1") Object.assign(o, { path: [BACK_GATE_PARTY[id], Pt(EYR.backGate.x, EYR.backGateOut.z), EYR.backGateIn, at], climb: true, face: id === "Escort1" ? Pt(at.x, at.z - 4) : Pt(at.x - 1, at.z + 5) });
    else if (kfId === "09-2") Object.assign(o, { face: id === "Escort1" ? Pt(at.x + 4, at.z - 6) : Pt(at.x, at.z + 6) });
    else if (kfId === "09-3" || kfId === "09-4") Object.assign(o, { face: id === "Escort1" ? Pt(EYR.breach.x, EYR.breach.z + 2) : Pt(at.x, at.z + 3) });
    else if (kfId === "09-5") Object.assign(o, { path: [EAST_ROUTE["09-4"][id], EYR.climb.from, EYR.climb.to, at], climb: true, through: true, face: Pt(at.x, at.z + 6) });
    else if (kfId === "09-6" || kfId === "09-7") Object.assign(o, { face: POCKET_GATE_AT });
    else Object.assign(o, { stance: "stand", face: id === "Luo" ? Pt(109, 464) : Pt(at.x + 3, at.z + 1), aim: id !== "Luo" });
    if (kfId === "10-1" && id === "Luo") o.weapon = "Dadao";
    return N(id, at, o);
  });
  const EastRouteHow = {
    "09-1": "班长三人这时刚从路沟南沿钻进 EM1 的后门，蹲在门里听了听；坡道上四个打一枪换个窝",
    "09-2": "班长三人这时在 EM1 / EM2 之间那道墙的豁口（挨过炮塌了一角）：班长先钻过去，一个在豁口里、一个在 EM1 等",
    "09-3": "班长三人这时在 EM2 西边那条空地的南头、墙根的柴垛跟前：何有田蹲下当垫脚，一个兵回头盯着豁口",
    "09-4": "班长三人这时在翻 EM2 / EM3 之间那道墙：踩柴垛、踩肩膀，班长先上，再把人拉上去（人梯）",
    "09-5": "班长三人这时已翻进 EM3，蹲在北屋西边那条空地上往南摸",
    "09-6": "班长三人这时蹲在 EM3 南墙的院门后头，门外就是路口墙角那伙鬼子；等顺子那头一响",
    "09-7": "班长三人这时蹲在 EM3 南门后头，手榴弹攥在手里：灶屋这头一响，隔墙甩两颗进墙角，撞开门贴身砍",
  };
  const EastRoutePoi = (kfId) => Poi("LuoRoute", "班长三人（班长那一路）", "poi", EAST_ROUTE[kfId].Luo, 1.5);
  /** 09 街口的仗一直打着：坡道上四个压枪眼的（每帧换个窝）、班长那一路的三个、沟底的其他人、后送队；大车后头没人了 */
  const StreetFight09 = (kfId) => [
    ...Shooters08({}, SHOOTER_SLOTS_09[kfId], SHOOTER_IDS), ...EastRouteTrio(kfId),
    ...DitchRest08(Pt(ALLEY_X, DT.z)).filter((u) => u.id !== "Geng"),
    C("Geng", Pt(101.5, 380.8), { stance: "crouch", face: Pt(ALLEY_X, DT.z), speed: 2.0 }),
    N("Walker04", Pt(108.6 + 1.85 * 3, 379.15), { role: "walkingWounded", group: "convoy", down: true, yaw: 180 }),
    ...ConvoyInDitch().filter((u) => u.id !== "Walker04"),
    ...Villagers08().filter((u) => !u.id.match(/Villager[45]/)),
  ];
  const House09 = (o = {}) => [...HouseIja({ mgArc: ArcTo(MG_AT, CART_HIDE, 5, 6), mgFace: CART_HIDE, ...o }), ...CornerIja({ runnerGone: true })];
  const CellarShout = () => [
    J("CellarIja1", Pt(72.6, 458.0), { face: CELLAR, name: "拎手榴弹在窖口吼的" }),
    J("CellarIja2", Pt(75.9, 459.6), { face: CELLAR, aim: true }),
    J("CellarIja3", Pt(71.4, 462.4), { face: CELLAR }),
    J("CellarIja4", Pt(75.2, 462.6), { face: CELLAR }),
    ...FamilyInCellar(),
  ];
  // 09-1（第九版 10-24）：顺子一个人往里摸，第一道弯没拐南、直着拐进往西那条死胡同（alleyWestStub），两步就被瓦砾堵死；身后有人拽他衣角——妮儿，脸上还糊着血，
  // 自己追上来的；她朝他摇头，攥住他的手往回拽、往南带（接回唯一那条路 alleyA3）
  const WEST_STUB = ST.alleyWestStub, STUB_RUBBLE = L0610_RUBBLE_WEST;
  const p91 = Pt(STUB_RUBBLE.x + STUB_RUBBLE.w / 2 + 0.75, A2_Z + 0.1);        // 瓦砾跟前（瓦砾东沿往东 0.75 m，身子不进块）
  const nier91 = Pt(p91.x + 1.5, A2_Z + 0.35);                                // 他身后一步半（拽衣角）
  Add({
    id: "09-1", ...s09, name: "死胡同·妮儿追上来",
    player: { x: p91.x, z: p91.z, yawDeg: 90, pitchDeg: -6, stance: "crouch" },
    what: "顺子拐进往西那条巷子，两步就被塌墙堵死。身后有人拽他衣角：妮儿，脸上糊着血，自己追上来的。她摇头，攥住他的手往南带。",
    next: { text: "跟她往南", x: A3_X, z: A2_Z + 7, radiusM: 2 },
    how: ["一个人往里摸，第一道弯直着拐进往西那条巷子，走到头：塌墙的瓦砾堵死了", "身后有人拽他衣角——回头是妮儿，脸上还糊着那个伤兵的血，整个人在抖；她是自己追上来的", "她朝他摇头，攥住他的手往回拽、往南带：她知道回家的路，这条才是唯一通到老耿家的路", "领着她的时候顺子手上没枪（枪背在背上），两人一路拉着手走", "街口那边一直在打：坡道上四个替两路吸着火", EastRouteHow["09-1"]],
    notes: `玩家 (${p91.x},${p91.z}) 在往西那条死胡同（${WEST_STUB.name}，x ${WEST_STUB.from}…${WEST_STUB.to}、z ${WEST_STUB.c}）里、瓦砾 ${STUB_RUBBLE.id} 东沿跟前，面朝西；妮儿 (${nier91.x},${nier91.z}) 在他身后。09 一路走 L0610_ROUTE：第一道弯往西 → 往南 → 第二道弯往西 → 街坊家西墙外的窄夹道 → L4。`,
    signals: [SIG.cartDeparted],
    units: [
      C("Nier", nier91, { face: p91, stance: "crouch", speed: NIER_RUN, path: [nier84, Pt(ALLEY_X, 392), Pt(ALLEY_X + 0.2, A2_Z - 0.4), Pt(73.0, A2_Z + 0.3), nier91], intent: [Pt(A3_X, A2_Z + 2), Pt(A3_X, A4_Z)] }),
      ...StreetFight09("09-1"),
      ...House09(), ...KitchenIja(), ...CellarGroup08(), ...MillMan(),
    ],
    pois: [Poi("NierHere", "妮儿（追上来了）", "objective", nier91, 1.2), Poi("WestStub", "往西的死胡同（塌墙堵死）", "danger", Pt(STUB_RUBBLE.x, STUB_RUBBLE.z), 2), POI.jiefangGate("landmark"), EastRoutePoi("09-1")],
  });

  // 09-2：路过街坊家西南角半掩的院门，一眼瞥见院里日军在吼（出来！），地底下有人哭；两人缩回墙根，不在门口停
  // 瞥见的站点：门洞 (66.5,467.5) 往外 1 m、落在「窖口 → 门洞」那条线上（场景生成器核视线用的同一个眼：HoleEye(gate, cellar, 1.0)）；
  // 空间表的 glimpse (66.5,469.2) 正对门洞往北看，门缝里看不到偏东的窖口（见报告）
  const p92 = (() => { const d = Dist(JF_GATE, CELLAR); return Pt(JF_GATE.x - (CELLAR.x - JF_GATE.x) / d, JF_GATE.z - (CELLAR.z - JF_GATE.z) / d); })();
  const nier92 = Pt(p92.x - 1.0, p92.z + 0.7);
  Add({
    id: "09-2", ...s09, name: "一眼瞥见",
    player: { x: p92.x, z: p92.z, yawDeg: Yaw(p92, CELLAR), pitchDeg: -2, stance: "crouch" },
    what: "路过街坊家半掩的院门，一眼瞥见院里：一个鬼子拎着手榴弹冲窖口吼「出来！」，地底下有人哭。两人缩回墙根。",
    next: { text: "跟她绕到西边", x: PL.jiefangBreach.x - 0.8, z: PL.jiefangBreach.z, radiusM: 1.5 },
    how: ["拉着手走过 L4，街坊家西南角的院门半掩着，门缝里一眼看见院当中的窖口", "鬼子拎着手榴弹吼「出来！」「都出来！快点！」，地底下有人在哭", "不在门口停：两人缩回墙根，妮儿拽他绕到西边窄夹道", "这是惨剧的第一下，只瞥见一眼", EastRouteHow["09-2"]],
    notes: `瞥见的站点 (${p92.x},${p92.z}) 在 L4 上、院门 (${JF_GATE.x},${JF_GATE.z}) 外；门扇斜开，门缝对着窖口 (${CELLAR.x},${CELLAR.z})（${R1(Dist(p92, CELLAR))} m，场景生成器核过这条视线）。`,
    signals: [SIG.cartDeparted],
    units: [
      C("Nier", nier92, { stance: "crouch", face: p92, speed: NIER_RUN }),
      ...StreetFight09("09-2"),
      ...House09(), ...KitchenIja(), ...CellarShout(), ...MillMan(),
    ],
    pois: [POI.jiefangGate("poi"), POI.cellar("danger"), POI.jiefangBreach("objective"), EastRoutePoi("09-2")],
  });

  // 09-3：从西配房西北角的豁口钻进黑屋，缩到窗下隔着破窗户纸看院子：汉子一出来就被刺刀捅倒，媳妇被拖进北屋，石磨上绑着老汉；妮儿认出街坊呜咽，按键捂嘴
  const WINDOW = Pt(JF.westWing.box.maxX, JF.westWing.window.z);
  // 眼睛在窗（墙中线）后 0.95 m = 墙面后 0.6 m（窗台 0.9 高，身子不能顶在台上）、对着窖口
  const windowEye = (() => { const d = Dist(WINDOW, CELLAR), k = JF.westWing.eyeBackM + 0.35; return Pt(WINDOW.x - k * (CELLAR.x - WINDOW.x) / d, WINDOW.z - k * (CELLAR.z - WINDOW.z) / d); })();
  const nier93 = Pt(windowEye.x - 0.7, windowEye.z + 0.9);
  const MAN_BODY = Pt(75.0, 460.8);   // 汉子从东沿爬出来站直就被捅倒（和窖口几乎在窗后那只眼的同一条线上：窗只有 0.9 m 宽）
  const CellarOut = () => [
    J("CellarIja1", Pt(73.3, 458.2), { face: CELLAR, name: "拎手榴弹在窖口晃的" }),
    J("CellarIja2", Pt(77.0, 459.4), { face: MAN_BODY, aim: true }),
    J("CellarIja3", Pt(73.9, 452.3), { face: Pt(73.9, 455), name: "拖媳妇进北屋的", speed: 0.9 }),
    J("CellarIja4", Pt(70.6, 462.8), { face: CELLAR, name: "翻东西的" }),
    C("CellarMan", MAN_BODY, { down: true, yaw: 100, climb: true }),
    C("CellarWife", Pt(73.8, 453.6), { face: Pt(73.9, 452.3), climb: true, speed: 0.9 }),
    C("CellarGranny", Pt(72.6, 461.9), { yaw: 180, stance: "crouch", climb: true }),
  ];
  Add({
    id: "09-3", ...s09, name: "豁口·窗户纸·捂嘴",
    player: { x: windowEye.x, z: windowEye.z, yawDeg: Yaw(windowEye, CELLAR), pitchDeg: -4, stance: "crouch" },
    what: "窗户纸后头：鬼子拎着手榴弹在窖口晃，一家人举手往外爬，汉子刚出来就被刺刀捅倒。妮儿认出街坊，呜咽——按键捂嘴。",
    next: { text: "缩到大缸后头", x: PL.jiefangVat.x - 0.8, z: PL.jiefangVat.z - 0.5, radiusM: 1.2 },
    how: ["妮儿拽他绕到西边窄夹道，从西配房塌掉的西北角钻进黑屋，缩到窗下隔着破窗户纸看院子", "一个鬼子拎着手榴弹在窖口晃，窖里一家举手往外爬：汉子、年轻媳妇、抱襁褓的老太太；汉子一出来就被刺刀捅倒", "媳妇被拖进北屋（只听声音）；石磨上绑着早死的老汉", "妮儿认出街坊、呜咽；屏幕弹按键：捂住她的嘴（第一人称看得见自己的手指，上面露着她瞪大的眼睛）", "没按到不判失败：外头正好响一梭机枪盖过去", EastRouteHow["09-3"]],
    notes: `豁口 (${PL.jiefangBreach.x},${PL.jiefangBreach.z})（西墙 z ${JF.westWing.breach.z}…${JF.westWing.breach.zTo}、北墙 x ${JF.westWing.box.minX + 0.25}…${JF.westWing.breach.xTo} 没了，地上一摊矮瓦砾）；眼在窗 (${WINDOW.x},${WINDOW.z}) 后 ${JF.westWing.eyeBackM} m、对着窖口（${R1(Dist(windowEye, CELLAR))} m，石磨 ${R1(Dist(windowEye, MILL))} m），蹲着眼高 1.2 在窗台 ${JF.westWing.window.sillH} 之上。`,
    signals: [SIG.cartDeparted],
    units: [
      C("Nier", nier93, { stance: "crouch", face: CELLAR, speed: NIER_RUN, path: [Pt(A5_X, L4_Z), Pt(A5_X, 450), Pt(65.2, 450.6), nier93], through: true }),
      ...StreetFight09("09-3"),
      ...House09(), ...KitchenIja(), ...CellarOut(), ...MillMan(),
    ],
    pois: [POI.jiefangWindow("poi"), POI.cellar("danger"), POI.mill(), POI.jiefangVat("objective"), EastRoutePoi("09-3")],
  });

  // 09-4：一个日军朝西配房走来翻东西，两人缩到大缸后头；他推门刚探进头，街上枪声一下子密了（班长在吸火），丁字路口吹哨；院里的赶紧了结：
  // 婴儿被挑起甩在窖沿，老太太往窖里爬，手榴弹磕钢盔扔进窖（CellarBlast）；探头的扭头走了，四个人出院门顺 L4 往东跑去路口
  const VAT = Pt(JF.westWing.vat.x, JF.westWing.vat.z);
  const p94 = Pt(66.4, 449.7);
  const nier94 = Pt(65.5, 449.9);
  const peek94 = Pt(JF.westWing.box.maxX - 0.3, JF.westWing.door.z);   // 推开门把头探进门洞里（门洞 1 m 宽，身子还在门里）
  const CORNER_RALLY = [Pt(106.4, 459.2), Pt(107.4, 461.9), Pt(105.0, 460.0), Pt(108.8, 463.2)];   // 搜窖的四个到了路口墙角以后的站位
  const CellarMurder = () => [
    J("CellarIja1", Pt(73.5, 458.3), { yaw: 180, name: "磕钢盔扔手榴弹的", to: [Pt(JF.gate.x, JF.gate.z - 1.3), Pt(JF.gate.x, L4_Z), Pt(80, L4_Z), CORNER_RALLY[0]], speed: IJA_RUN }),
    J("CellarIja2", Pt(75.0, 462.1), { face: CELLAR, aim: true, name: "挑襁褓的", to: [Pt(JF.gate.x, JF.gate.z - 1.3), Pt(JF.gate.x, L4_Z), Pt(80, L4_Z), CORNER_RALLY[1]], speed: IJA_RUN }),
    J("CellarIja3", Pt(73.9, 450.6), { yaw: 180, name: "拖完人回来的", to: [Pt(JF.gate.x, JF.gate.z - 1.3), Pt(JF.gate.x, L4_Z), Pt(80, L4_Z), CORNER_RALLY[2]], speed: IJA_RUN }),
    J("CellarIja4", peek94, { face: VAT, name: "探进西配房的（嗯？）", to: [Pt(JF.gate.x, JF.gate.z - 1.3), Pt(JF.gate.x, L4_Z), Pt(80, L4_Z), CORNER_RALLY[3]], speed: IJA_RUN }),
    C("CellarMan", MAN_BODY, { down: true, yaw: 100 }),
    C("CellarWife", Pt(74.0, 447.3), { down: true, yaw: 90, name: "年轻媳妇（拖进北屋）" }),
    C("CellarGranny", Pt(73.0, 461.7), { stance: "crouch", face: CELLAR, climb: true, name: "老太太（往窖里爬）" }),
  ];
  Add({
    id: "09-4", ...s09, name: "大缸·哨子",
    player: { x: p94.x, z: p94.z, yawDeg: Yaw(p94, peek94), pitchDeg: -2, stance: "crouch" },
    what: "一个鬼子朝西配房走来翻东西，两人缩到大缸后头。他推门刚探进头，街上枪声一下子密了，路口吹哨；院里的赶紧了结，扭头走了。",
    next: { text: "穿院子去本家院", x: PL.benjiaGate.x, z: PL.benjiaGate.z + 1.2, radiusM: 2 },
    how: ["一个鬼子朝西配房走来，两人缩到西北角的大缸后头", "他推门刚探进头（嗯？），街上枪声一下子密了：坡道上那三个在吸火；丁字路口那边吹哨", "院里的赶紧了结：婴儿被一刺刀扎穿挑起甩在窖沿；老太太往窖里爬，手榴弹往钢盔上一磕扔进窖，闷响（CellarBlast）", "探头的扭头走了。四个人拎枪出院门、顺 L4 胡同往东跑去丁字路口支援", EastRouteHow["09-4"]],
    notes: `大缸 (${VAT.x},${VAT.z}) 在西配房西北角墙根、豁口旁边；门在东墙 z ${JF.westWing.door.z}，探头的站在门外 (${peek94.x},${peek94.z})，从门到缸 ${R1(Dist(peek94, VAT))} m。CellarBlast 从这一帧起为真（窖口冒烟、盖板飞开）。婴儿只是老太太怀里的包袱，不单独建人。`,
    signals: [SIG.cartDeparted, SIG.cellarBlast],
    units: [
      C("Nier", nier94, { stance: "crouch", face: peek94, speed: NIER_RUN }),
      ...StreetFight09("09-4"),
      ...House09(), ...KitchenIja(), ...CellarMurder(), ...MillMan(),
    ],
    pois: [POI.jiefangVat("poi"), Poi("Peeker", "探进西配房的鬼子", "danger", peek94, 1.5), POI.cellar("danger"), POI.benjiaGate("objective"), EastRoutePoi("09-4")],
  });

  // 09-5：两人穿过院子（妮儿在窖口僵住，顺子拽着走），出院门往西、顺夹道到本家院，妮儿钻狗洞，从老耿家那边拔开便门放顺子进来
  const p95 = SIDE_OUT;
  const nier95 = Pt(SIDE_IN.x - 0.2, SIDE_IN.z - 0.6);
  /** 搜窖的四个到了路口墙角（和 House09 里留下的那个 CornerIja1 凑成五个） */
  const CORNER_FIVE = () => [
    J("CellarIja1", CORNER_RALLY[0], { stance: "crouch", aim: true, face: Pt(MAIN_X, 440) }),
    J("CellarIja2", CORNER_RALLY[1], { stance: "crouch", aim: true, face: Pt(MAIN_X, 440) }),
    J("CellarIja3", CORNER_RALLY[2], { stance: "crouch", face: Pt(MAIN_X, 440) }),
    J("CellarIja4", CORNER_RALLY[3], { stance: "crouch", face: Pt(MAIN_X, 440) }),
  ];
  const JiefangBodies = () => [
    C("CellarMan", MAN_BODY, { down: true, yaw: 100 }),
    C("CellarWife", Pt(74.0, 447.3), { down: true, yaw: 90 }),
    C("CellarGranny", Off(CELLAR, 0, 0.2), { down: true, yaw: 0, name: "老太太（炸在窖里）", climb: true, through: true }),
    ...MillMan(),
  ];
  Add({
    id: "09-5", ...s09, name: "狗洞·便门",
    player: { x: p95.x, z: p95.z, yawDeg: -90, pitchDeg: -6, stance: "crouch" },
    what: "穿院子、出院门，顺夹道到本家院。妮儿钻进墙根的狗洞，从老耿家那边拔开便门，放顺子进来。",
    next: { text: "进便门", x: SIDE_IN.x + 0.6, z: SIDE_IN.z, radiusM: 1.2 },
    how: ["两人穿过街坊家院子（妮儿在窖口僵住，顺子拽着走），出半掩的院门，L4 往西几步，南北夹道往南到本家院的院门（敞着）", "本家院空了：人跑的时候没顾上关门", "共用墙上的狗洞 0.45 m 宽、0.4 m 高，她从小就这么钻；大人钻不过", "顺子蹲在便门外等；门闩从老耿家那边拔开（SideGateOpen）", EastRouteHow["09-5"]],
    notes: `便门 (${PL.sideGate.x},${PL.sideGate.z})、狗洞 (${PL.dogHole.x},${PL.dogHole.z}) 都在共用墙 x ${G.sharedWall.x} 上。妮儿钻狗洞：本家院里绕过东厢房北头、钻洞（标 through），落在老耿家北屋西边那条窄地上，再沿北屋南墙与灶屋北墙之间 1 m 的夹缝到院子、拔门闩。`,
    signals: [SIG.cartDeparted, SIG.cellarBlast, SIG.sideGateOpen],
    units: [
      C("Nier", nier95, { stance: "crouch", face: SIDE_IN, through: true, speed: NIER_RUN, path: [nier94, ...StreetRoute(nier94, Pt(84.5, 484.6)), Pt(86.6, 484.2), Pt(86.6, 476.0), Pt(90.3, 475.8), Pt(91.2, 473.4), Pt(92.9, G.dogHole.z), Pt(94.0, 475.5), Pt(96.8, 475.5), Pt(97.0, 480.0), Pt(97.0, 483.2), nier95] }),
      ...StreetFight09("09-5"),
      ...House09(), ...KitchenIja(), ...CORNER_FIVE(), ...JiefangBodies(),
    ],
    pois: [POI.dogHole("poi"), POI.sideGate("objective"), POI.benjiaGate("landmark"), EastRoutePoi("09-5")],
  });

  // 09-6：老耿家后院没人；堂屋门朝南开着，门里是机枪组后背，十几步远。贴西墙往堂屋门摸，得先过灶屋门口；机枪响一梭挪一段，一安静就停
  const p96 = Pt(98.6, 484.4);
  const nier96 = Pt(97.5, 485.0);
  Add({
    id: "09-6", ...s09, name: "屁股对到老子",
    player: { x: p96.x, z: p96.z, yawDeg: Yaw(p96, MG_AT), pitchDeg: -2, stance: "crouch" },
    what: "老耿家后院没人。堂屋门朝南开着，门里是机枪组的后背，十几步远。顺子：……狗日的，屁股对到老子。",
    next: { text: "贴西墙往堂屋门摸", x: KITCHEN_OUT.x + 1.2, z: KITCHEN_OUT.z + 1.2, radiusM: 1.5 },
    how: ["进了便门往院里看：院子空的，堂屋门朝南敞着，门里就是机枪组的后背，正朝街上打", "顺子：……狗日的，屁股对到老子", "带着她贴西墙往堂屋门摸，得先过灶屋门口", "机枪响一梭挪一段，一安静就停（08 自己打出来的节奏）", EastRouteHow["09-6"]],
    notes: `便门里 (${SIDE_IN.x},${SIDE_IN.z}) 到堂屋门 (${PL.tangwuDoor.x},${PL.tangwuDoor.z}) ${R1(Dist(SIDE_IN, PL.tangwuDoor))} m；门洞 1.2 m 宽，机枪手正对门后 3.5 m，从院子南墙根 x 97.8…102.2 那一截才看得进门里的后背，所以看见的站点在 (${p96.x},${p96.z})（场景生成器 / 测试核这条视线）。`,
    signals: [SIG.cartDeparted, SIG.cellarBlast, SIG.sideGateOpen],
    units: [
      C("Nier", nier96, { stance: "crouch", face: p96, speed: NIER_RUN }),
      ...StreetFight09("09-6"),
      ...House09(), ...KitchenIja(), ...CORNER_FIVE(), ...JiefangBodies(),
    ],
    pois: [POI.tangwuDoor("poi"), POI.loophole("danger"), POI.kitchenDoor("objective"), EastRoutePoi("09-6")],
  });

  // 09-7：快到灶屋门口，妮儿的弹壳罐掉地哗啦一声；灶屋里的鬼子扑出来，把顺子撞进灶屋、翻倒在灶台边用刺刀往下压；妮儿咬他握枪的手腕；拔刀砍两刀。
  // 动静传到北屋，东西两间递弹的两个过来看，在灶屋门口撞个正着：在屋里打
  const PIN = Pt(93.9, 478.0), PIN_YAW = -135;
  const p97 = Pt(94.7, 478.8);
  const nier97 = Pt(93.6, 479.4);
  Add({
    id: "09-7", ...s09, name: "灶屋",
    player: { x: p97.x, z: p97.z, yawDeg: Yaw(p97, PIN), pitchDeg: 38, stance: "prone" },
    what: "弹壳罐掉地。灶屋里的鬼子扑出来把顺子撞进灶屋，翻倒在灶台边用刺刀往下压；妮儿一口咬在他握枪的手腕上。北屋过来两个。",
    next: { text: "拔刀", x: KITCHEN_OUT.x, z: KITCHEN_OUT.z, radiusM: 1.5 },
    how: ["快到灶屋门口，妮儿的弹壳罐掉地哗啦一声", "灶屋里看后院的鬼子嘴里塞着东西扑出来，把顺子撞进灶屋、翻倒在灶台边，刺刀往下压：玩家连按往外推", "妮儿摸进来一口咬住他握枪的手腕（过场正常速度，不放慢）；鬼子惨叫、手一松；屏幕弹一个键「拔刀」，顺子从左肩抽大刀砍两刀", "妮儿嘴边沾血蹲在灶台边发抖；动静传到北屋，两个鬼子过来看，在灶屋门口撞个正着：在屋里打", EastRouteHow["09-7"]],
    notes: `倒地仰视：卧姿机位朝上看（pitch +38）。灶屋 x ${G.zaowu.box.minX}…${G.zaowu.box.maxX}、z ${G.zaowu.box.minZ}…${G.zaowu.box.maxZ}，灶台 (${G.stove.x},${G.stove.z})；鬼子骑在顺子身上 (${PIN.x},${PIN.z})、妮儿在他右手边。北屋过来的是东西两间递弹的两个（Rifle2 / Rifle4），机枪组这帧朝南扭头。罐子没有体块。`,
    signals: [SIG.cartDeparted, SIG.cellarBlast, SIG.sideGateOpen],
    units: [
      J("KitchenIja", PIN, { yaw: PIN_YAW, aim: true, name: "灶屋里的鬼子（刺刀压着顺子）" }),
      C("Nier", nier97, { stance: "crouch", face: PIN, speed: NIER_RUN }),
      ...StreetFight09("09-7"),
      ...House09({ heads: 180, without: ["Rifle2", "Rifle4"] }),
      J("Rifle2", Pt(100.2, 476.4), { face: KITCHEN_OUT, aim: true, to: [KITCHEN_OUT], speed: IJA_RUN, name: "北屋过来看的（どうした！）" }),
      J("Rifle4", Pt(101.5, 477.6), { face: KITCHEN_OUT, aim: true, to: [Pt(KITCHEN_OUT.x + 1.4, KITCHEN_OUT.z - 0.4)], speed: IJA_RUN, name: "北屋过来看的" }),
      ...KitchenIja().filter(() => false),
      ...CORNER_FIVE(), ...JiefangBodies(),
    ],
    pois: [POI.kitchenDoor("poi"), POI.tangwuDoor("objective"), POI.loophole("danger"), EastRoutePoi("09-7")],
  });

  // ======================= 10 背后打掉机枪，守路口，被炮撵出庄子 =======================
  const s10 = { stage: 10, stageTitle: "背后打掉机枪，守路口，被炮撵出庄子" };
  const p101 = Pt(99.8, 474.3);
  const nier10 = Pt(97.9, 480.6);   // 蹲在灶屋门外
  /** 10-1 起北屋里倒下的六个 + 灶屋里倒下的三个 */
  const HouseDown = () => [
    J("MgGunner", Pt(100.3, 471.8), { down: true, yaw: 0, weapon: "Type11" }),
    J("MgLoader", Pt(98.5, 472.7), { down: true, yaw: 20 }),
    J("MgThird", Pt(101.8, 472.4), { down: true, yaw: -30 }),
    J("Leader", Pt(101.6, 473.9), { down: true, yaw: 30 }),
    J("Rifle1", Pt(96.7, 472.2), { down: true, yaw: 10 }),
    J("Rifle3", Pt(102.3, 474.1), { down: true, yaw: -10 }),
    J("KitchenIja", PIN, { down: true, yaw: 0 }),
    J("Rifle2", Pt(95.1, 480.6), { down: true, yaw: 60, name: "北屋过来看的（死在灶屋里）" }),
    J("Rifle4", Pt(96.9, 479.0), { down: true, yaw: -80, name: "北屋过来看的（死在灶屋门口）" }),
  ];
  const CornerDown = () => [
    J("CornerIja1", Pt(108.0, 460.8), { down: true, yaw: 0 }),
    J("CellarIja3", Pt(105.4, 460.0), { down: true, yaw: 40 }),
  ];
  Add({
    id: "10-1", ...s10, name: "背后打",
    player: { x: p101.x, z: p101.z, yawDeg: Yaw(p101, MG_AT), pitchDeg: -2, stance: "stand" },
    what: "从灶屋出来顺屋檐摸到堂屋门冲进北屋，从背后开打，先打机枪组。机枪一哑，班长在路口墙角冲坡道上吼：冲！",
    next: { text: "东边来人了，去石碾", x: PRONE_AT_ROLLER.x, z: PRONE_AT_ROLLER.z, radiusM: 2 },
    how: ["北屋还剩六个：机枪组三个守堂屋枪眼，分队长和两个兵趴东西两间的枪眼，全朝北打", "灶屋那头一响，班长三人隔墙甩两颗手榴弹进路口墙角、撞开门（EastGateBurst）抡大刀冲进去：墙角五个手榴弹倒一个、砍倒一个，三个往东街跑", "顺子从背后开打，先打机枪组。机枪一哑（MgSilenced），班长在墙角里扭头冲坡道上吼：机枪哑了！冲！日你先人冲啊！坡道上那四个顺主街冲上来（大车后头没有人）", "两路在丁字路口会合：顺子从东间枪眼看得见墙角里的班长三人", "MgSilenced：枪眼后头那挺枪没了（10-2 出现在石碾后）"],
    notes: "MgSilenced、EastGateBurst 从这一帧起：北屋六个全倒；墙角五个倒两个（守着的那个挨了手榴弹、拖人的那个被班长砍倒），三个往东街跑；班长三人在 pocket 里（班长手里是大刀）。妮儿留在灶屋门口蹲着。东间枪眼正对着路口墙角（±17° 以内），顺子打完机枪组从那儿看见墙角里的班长。第九版：Escort2 也是从坡道上冲上来的。",
    signals: [SIG.cartDeparted, SIG.cellarBlast, SIG.sideGateOpen, SIG.eastGateBurst, SIG.mgSilenced],
    units: [
      ...HouseDown(), ...CornerDown(),
      J("CellarIja1", Pt(114.6, 464.8), { face: PB.EN1Gate, speed: IJA_RUN, intent: [PB.EN1Gate, Pt(PB.EN1Gate.x + 1.0, PB.EN1Gate.z - 2.4)], name: "往东街跑的" }),
      J("CellarIja2", Pt(117.8, 465.4), { face: PB.EN1Gate, speed: IJA_RUN, intent: [PB.EN1Gate, Pt(PB.EN1Gate.x - 1.0, PB.EN1Gate.z - 2.0)], name: "往东街跑的" }),
      J("CellarIja4", Pt(112.0, 464.0), { face: PB.EN1Gate, speed: IJA_RUN, intent: [Pt(121.6, 465.2)], name: "往东街跑的" }),
      C("Nier", nier10, { stance: "crouch", face: TANGWU_OUT, speed: NIER_RUN }),
      ...EastRouteTrio("10-1"),
      N("Escort2", Pt(98.3, 397.2), { yaw: 180, aim: true, speed: RUN, name: "坡道上冲上来的后送队的兵" }),
      N("Yaowa", Pt(99.4, 392.0), { yaw: 180, speed: RUN }),
      N("LiuWencai", Pt(101.6, 389.5), { yaw: 180, speed: RUN }),
      N("Squad3", Pt(100.3, 394.5), { yaw: 180, guess: true, speed: RUN }),
      ...DitchRest08(LOOPHOLE).filter((u) => !["Officer", "Medic", "Geng"].includes(u.id)),
      N("Officer", DITCH_08.Officer, { stance: "crouch", face: LOOPHOLE, kind: "officer", speed: RUN }),
      N("Medic", DITCH_08.Medic, { stance: "crouch", face: DITCH_08.DongguaLitter, speed: RUN }),
      C("Geng", Pt(101.5, 380.8), { stance: "crouch", face: LOOPHOLE, speed: 2.0 }),
      N("Walker04", Pt(108.6 + 1.85 * 3, 379.15), { role: "walkingWounded", group: "convoy", down: true, yaw: 180 }),
      ...ConvoyInDitch().filter((u) => u.id !== "Walker04"),
      ...Villagers08().filter((u) => !u.id.match(/Villager[45]/)),
      ...JiefangBodies(),
    ],
    pois: [POI.loophole("poi"), POI.roller("objective"), POI.tangwuDoor("landmark"), POI.eastSide()],
  });

  // 10-2：守路口·试探：班长「调过来！朝东打！」缴来的十一年式拖到石碾后朝东。喊来的小队不往街上硬冲：两三人一组从街北院门冲出来、跑几步扑进下一个门洞；
  // 街南后墙的豁子和枪眼里打冷枪。班长喊方位：「左手第二道门！」「右边墙豁子！」
  const Corner10 = ({ yaowa = Pt(107.2, 466.4), yaowaFace = PRONE_AT_ROLLER, liu = CORNER_S, liuFace = Pt(200, EAST_Z), squad1 = Pt(96.2, 462.4), squad1Face = Pt(180, EAST_Z) } = {}) => [
    N("Luo", CORNER_N, { stance: "crouch", aim: true, face: Pt(190, EAST_Z), speed: RUN }),
    N("LiuWencai", liu, { stance: "crouch", aim: true, face: liuFace, speed: RUN }),
    N("Yaowa", yaowa, { stance: "crouch", face: yaowaFace, speed: RUN }),
    N("Escort1", Pt(106.6, 464.6), { stance: "crouch", face: Pt(EAST_FROM, EAST_Z), guess: true, speed: RUN }),
    N("Escort2", Pt(105.4, 467.2), { stance: "crouch", face: Pt(EAST_FROM, EAST_Z), guess: true, speed: RUN }),
    N("Squad3", Pt(107.4, 462.2), { stance: "crouch", guess: true, face: Pt(180, EAST_Z), speed: RUN }),
    N("Squad1", squad1, { stance: "crouch", aim: true, face: squad1Face, guess: true, speed: RUN }),
    N("Squad2", Pt(94.6, 465.0), { stance: "crouch", yaw: 0, guess: true, speed: RUN }),
  ];
  const Street10Rest = () => [
    N("Officer", Pt(100.4, 404), { face: MOUTH, kind: "officer", speed: RUN }),
    N("Medic", DITCH_08.Medic, { stance: "crouch", face: DITCH_08.DongguaLitter, speed: RUN }),
    C("Geng", Pt(100.6, 408), { face: Pt(100, 460), speed: 2.0 }),
    N("Walker04", Pt(108.6 + 1.85 * 3, 379.15), { role: "walkingWounded", group: "convoy", down: true, yaw: 180 }),
    ...ConvoyInDitch().filter((u) => u.id !== "Walker04"),
    ...Villagers08().filter((u) => !u.id.match(/Villager[45]/)),
  ];
  const FledEast = ({ cellar4Down = true } = {}) => [
    J("CellarIja1", Pt(147.4, 460.6), { stance: "crouch", face: Pt(146.5, 464), speed: IJA_RUN, name: "跑进街北第一个院的" }),
    J("CellarIja2", Pt(145.6, 461.2), { stance: "crouch", face: Pt(146.5, 464), speed: IJA_RUN }),
    J("CellarIja4", Pt(121.6, 465.2), cellar4Down ? { down: true, yaw: -80, straight: true, name: "跑到半道被机枪扫倒的" } : { face: PB.EN1Gate, speed: IJA_RUN }),
  ];
  const HouseAfter = () => [...HouseDown(), ...CornerDown(), C("Nier", nier10, { stance: "crouch", face: TANGWU_OUT, speed: NIER_RUN }), ...JiefangBodies()];
  Add({
    id: "10-2", ...s10, name: "守路口·试探",
    player: { x: PRONE_AT_ROLLER.x, z: PRONE_AT_ROLLER.z, yawDeg: -90, pitchDeg: 0, stance: "prone" },
    what: "班长：调过来！朝东打！缴来的十一年式拖到石碾后朝东。鬼子不硬冲：两三人一组从街北院门冲出来扑进下一个门洞，街南豁子里打冷枪。",
    next: { text: "压住路口" },
    how: ["弹斗一次装六个五发桥夹，三十发；子弹只有机枪组身上那些", "喊来的小队约 45 人（两个轻机枪分队 + 一个掷弹筒分队），不往街上硬冲：两三人一组从街北院门冲出来、跑几步扑进下一个门洞", "街南后墙的豁子和第一道弯正面墙上的枪眼里打冷枪", "班长蹲在东街口北角喊方位：左手第二道门！右边墙豁子！", "过了第一道弯石碾看不见：军官和下一拨在那头"],
    notes: `石碾 (${PL.roller.x},${PL.roller.z})，趴在它西北 2.2 m 顺着东街看到第一道弯 (${PL.eastJog1.x},${PL.eastJog1.z})（场景生成器核过）。门洞 / 豁子 / 枪眼 / 庙 / 垛按 L0610_EAST_STREET.probes 摆人：街北第一个院门 ${R1(Dist(ROLLER, PB.EN1Gate))} m、场院口 ${R1(Dist(ROLLER, PB.FarmOpen))} m、南侧两个豁子 ${R1(Dist(ROLLER, PB.ES2Breach))} / ${R1(Dist(ROLLER, PB.ES3Breach))} m、第一道弯枪眼 ${R1(Dist(ROLLER, PB.JogLoophole1))} m。`
      + "编辑器玩家拿的还是汉阳造（loadout 固定），石碾后那挺枪用随信号体块 RollerMg 表示。何有田在北屋拆机枪组的子弹袋。白盒摆看得见的 14 个 + 过了弯的 3 个。",
    signals: [SIG.cartDeparted, SIG.cellarBlast, SIG.sideGateOpen, SIG.eastGateBurst, SIG.mgSilenced],
    units: [
      ...Corner10(),
      N("HeYoutian", Pt(99.2, 473.6), { stance: "crouch", face: Pt(100.3, 471.8), speed: RUN }),
      ...Street10Rest(),
      ...EastProbe(), ...EastRunners(), ...FledEast(),
      ...HouseAfter(),
    ],
    pois: [POI.roller("poi"), Poi("EN1Gate", "左手第二道门（街北院门）", "danger", PB.EN1Gate, 1.5), Poi("ES2Breach", "右边墙豁子", "danger", PB.ES2Breach, 1.5), POI.eastJog1("danger"), POI.shrine("danger")],
  });

  // 10-3：掷弹筒·北边抄：土地庙后一挺轻机枪压过来；场院麦秸垛后「嘭」，掷弹筒找石碾，一发比一发近；北边院子「咣、咣」砸门往西挪（NorthYardGatesBroken），
  // 要从石碾背后西北角钻出来；班长「左手院子！文财、幺娃，给老子堵到！」弹斗快空、掷弹筒落到石碾跟前，班长「幺娃，接到！」幺娃滚过来接过机枪
  const p103 = Pt(109.3, 468.0);
  const liu104 = Pt(105.2, 461.4), squad1_104 = Pt(103.8, 462.0);
  Add({
    id: "10-3", ...s10, name: "掷弹筒·北边抄",
    player: { x: p103.x, z: p103.z, yawDeg: -90, pitchDeg: 0, stance: "crouch" },
    what: "土地庙后一挺轻机枪压过来，麦秸垛后「嘭」掷弹筒找石碾；北边院子砸门往西挪。班长：左手院子！堵到！弹斗快空：幺娃，接到！",
    next: { text: "后送队上来了" },
    how: ["土地庙后一挺轻机枪压过来，子弹打在石碾上", "场院麦秸垛后「嘭」一声，掷弹筒开始找石碾，一发比一发近", "北边院子「咣、咣」砸门往西挪（NorthYardGatesBroken），要从石碾背后西北角钻出来；班长：左手院子！文财、幺娃，给老子堵到！", "弹斗快空、掷弹筒落到石碾跟前；班长：幺娃，接到！幺娃滚过来接过机枪，顺子退到石碾南边"],
    notes: `轻机枪缩在土地庙 (${SHRINE.x},${SHRINE.z}) 东北边 (${MG_HIDE.x},${MG_HIDE.z})；掷弹筒组 3 人在麦秸垛 (${PL.strawStack.x},${PL.strawStack.z}) 南边 (${MORTAR_HIDE.x},${MORTAR_HIDE.z})（场院西隔墙挡着，从石碾看不见，只听得见「嘭」、看得见冒上来的烟）。院子链：场院西隔墙的门 (${NC.farmyardDoor.x},${NC.farmyardDoor.z}) → 北侧第一个院西墙的门 (${NC.yard1Door.x},${NC.yard1Door.z}) → 北角北墙的院门 (${NC.pocketGate.x},${NC.pocketGate.z})，出来正好在石碾西北、背后。幺娃接过机枪趴在石碾后，刘文财和 Squad1 堵北角口。`,
    signals: [SIG.cartDeparted, SIG.cellarBlast, SIG.sideGateOpen, SIG.eastGateBurst, SIG.mgSilenced, SIG.northYardGatesBroken],
    units: [
      ...Corner10({ yaowa: PRONE_AT_ROLLER, liu: liu104, liuFace: POCKET_GATE, squad1: squad1_104, squad1Face: POCKET_GATE }).map((u) => (u.id === "Yaowa" ? { ...u, stance: "prone", aim: true, weapon: "Type11", yawDeg: -90, arc: { halfDeg: 8, rangeM: 120 } } : u.id === "LiuWencai" ? { ...u, aim: true } : u)),
      N("HeYoutian", Pt(110.0, 464.6), { stance: "crouch", face: PRONE_AT_ROLLER, speed: RUN }),
      ...Street10Rest(),
      ...EastProbe({ pulledBack: true }), ...EastRunners({ atShrine: true }), ...ShrineMg(), ...MortarTeam(), ...NorthChain(), ...FledEast(),
      ...HouseAfter(),
    ],
    pois: [POI.shrine("danger"), POI.farmyard("danger"), POI.pocket("danger"), POI.roller("poi")],
  });

  // 10-4：后送队过胡同：后送队顺主街跑到路口，贴着石碾背后一副一副拐进窄胡同往南；老耿赶着车过来，妮儿从老耿家院门跑出来抱住他的腿；
  // 老耿往院里看一眼地上的人、看一眼顺子，什么也没说，拽着驴进胡同
  const p104 = Pt(109.4, 469.3);
  const cart104 = Pt(LANE1_X, 478.4), geng104 = Pt(LANE1_X + 0.1, 481.4), nier104 = Pt(LANE1_X + 0.1, 482.3);
  Add({
    id: "10-4", ...s10, name: "后送队过胡同",
    player: { x: p104.x, z: p104.z, yawDeg: 180, pitchDeg: -4, stance: "stand" },
    what: "后送队顺主街跑到路口，贴着石碾背后一副一副拐进窄胡同往南。老耿赶着车进胡同，妮儿从院门跑出来抱住他的腿。",
    next: { text: "守住，等后送队过完" },
    how: ["后送队顺主街跑到路口，贴着石碾背后一副一副拐进窄胡同（老耿家东墙外）往南；担架小跑", "老耿赶着车过来进胡同（驴车在窄胡同里挤一点能过）", "妮儿从老耿家院门（东墙靠南）跑出来抱住他的腿", "老耿往院里看一眼地上的人、看一眼顺子，什么也没说，拽着驴进胡同", "幺娃在石碾后的机枪上顶着，刘文财堵北角口"],
    notes: `顺子站在窄胡同口 (${p104.x},${p104.z}) 朝南看着担架一副一副拐进去；车 (${cart104.x},${cart104.z}) 在胡同里、老耿 (${geng104.x},${geng104.z}) 在驴头边、妮儿从院门 (${PL.gengGate.x},${PL.gengGate.z}) 出来抱住他的腿。后送队按弧长排在主街 → 路口 → 胡同这条线上（冬瓜那副在最前头、车后面）。`,
    signals: [SIG.cartDeparted, SIG.cellarBlast, SIG.sideGateOpen, SIG.eastGateBurst, SIG.mgSilenced, SIG.northYardGatesBroken],
    units: [
      N("Luo", CORNER_N, { stance: "crouch", aim: true, face: Pt(190, EAST_Z), speed: RUN }),
      N("Yaowa", PRONE_AT_ROLLER, { stance: "prone", aim: true, weapon: "Type11", yaw: -90, arc: { halfDeg: 8, rangeM: 120 }, speed: RUN }),
      N("LiuWencai", liu104, { stance: "crouch", aim: true, face: POCKET_GATE, speed: RUN }),
      N("Squad1", squad1_104, { stance: "crouch", aim: true, face: POCKET_GATE, guess: true, speed: RUN }),
      N("HeYoutian", Pt(110.0, 464.6), { stance: "crouch", face: PRONE_AT_ROLLER, speed: RUN }),
      N("Squad3", Pt(107.4, 462.2), { stance: "crouch", guess: true, face: Pt(180, EAST_Z), speed: RUN }),
      N("Escort1", Pt(104.6, 467.6), { face: Pt(100, 458), guess: true, speed: RUN }),
      N("Escort2", Pt(106.4, 468.8), { face: Pt(LANE1_X, 472), guess: true, speed: RUN }),
      N("Squad2", Pt(99.6, 466.2), { face: Pt(100, 455), guess: true, speed: RUN }),
      ...ConvoyRunning(),
      N("Medic", Pt(103.4, 468.9), { stance: "crouch", face: Pt(LANE1_X, 474.5), speed: RUN }),
      N("Officer", Pt(101.6, 465.4), { face: Pt(MAIN_X, 440), kind: "officer", speed: RUN }),
      C("GengCart", cart104, { yaw: 180, speed: CART_RUN }),
      C("Geng", geng104, { face: nier104, speed: 2.0 }),
      C("Nier", nier104, { stance: "crouch", face: geng104, speed: NIER_RUN, path: [nier10, Pt(101.6, 483.4), GATE_IN, GATE_OUT, nier104] }),
      ...EastProbe({ pulledBack: true }), ...EastRunners({ atShrine: true }), ...ShrineMg(), ...MortarTeam(), ...NorthChain(), ...FledEast(),
      ...HouseDown(), ...CornerDown(), ...JiefangBodies(),
      ...Villagers08().filter((u) => !u.id.match(/Villager[45]/)),
    ],
    pois: [POI.laneMouth("poi"), POI.gengGate("poi"), POI.roller("landmark"), POI.pocket("danger")],
  });

  // 10-5：炮·撤：试几次攻不上来，东街那头吹哨，日军全退；静两三秒。班长「炮！进屋！」第一排炮落在石碾和路口（BarrageHit），耳鸣。
  // 班长「撤！走胡同！跟斗老子！」大家从北屋冲进院子往院门跑；幺娃路过灶屋把枪栓扔进水缸；何有田蹲在院门框边往门缝里卡手榴弹：「滚！表挡事！」
  const p105 = Pt(103.2, 480.8);
  Add({
    id: "10-5", ...s10, name: "炮·撤",
    player: { x: p105.x, z: p105.z, yawDeg: Yaw(p105, GATE_IN), pitchDeg: -2, stance: "stand" },
    what: "东街那头吹哨，鬼子全退；静两三秒。班长：炮！进屋！第一排炮落在石碾和路口。撤！走胡同！何有田在院门框边卡手榴弹：滚！表挡事！",
    next: { text: "出院门进胡同", x: GATE_OUT.x, z: GATE_OUT.z + 1.5, radiusM: 1.5 },
    how: ["试几次攻不上来，东街那头吹哨，日军全退；静两三秒", "班长：炮！进屋！第一排炮落在石碾和路口（BarrageHit：北屋塌一角、石碾旁新瓦砾、草顶着火），耳鸣", "班长：撤！走胡同！跟斗老子！大家从北屋冲进院子往院门跑", "幺娃路过灶屋把枪栓扔进水缸；何有田蹲在院门框边往门缝里卡手榴弹，只有几秒：滚！表挡事！"],
    notes: `BarrageHit 从这一帧起：北屋东间（x ≥ ${G.beiwu.collapseFromX}）后墙和房顶塌下来、石碾旁一堆新瓦砾；草顶着火没做体块（预演用烟事件）。全班在院子里往院门 (${GATE_IN.x},${GATE_IN.z}) 跑；后送队已出村南口缩在路沟里等着。鬼子都退到第一道弯那头 / 北侧第一个院里（看不见）。`,
    signals: [SIG.cartDeparted, SIG.cellarBlast, SIG.sideGateOpen, SIG.eastGateBurst, SIG.mgSilenced, SIG.northYardGatesBroken, SIG.barrageHit],
    units: [
      N("Luo", Pt(106.4, 483.0), { face: Pt(101, 480), speed: RUN }),
      N("HeYoutian", Pt(107.3, 484.5), { stance: "crouch", face: Pt(108, 483.5), speed: RUN }),
      N("Yaowa", Pt(98.3, 482.4), { face: Pt(G.vat.x, G.vat.z), speed: RUN }),
      N("LiuWencai", Pt(104.8, 482.0), { face: GATE_IN, speed: RUN }),
      N("Squad1", Pt(102.0, 483.6), { face: GATE_IN, guess: true, speed: RUN }),
      N("Squad2", Pt(100.4, 481.9), { face: GATE_IN, guess: true, speed: RUN }),
      N("Squad3", Pt(105.6, 478.9), { face: GATE_IN, guess: true, speed: RUN }),
      N("Escort1", Pt(101.4, 478.2), { face: GATE_IN, speed: RUN }),
      N("Escort2", Pt(104.4, 479.6), { face: GATE_IN, speed: RUN }),
      ...ConvoyAtExit({ dongguaBearers: 2 }),
      C("GengCart", Pt(111.4, 558.6), { face: Pt(98, 566), speed: CART_RUN }),
      C("Geng", Pt(110.0, 559.6), { face: Pt(98, 566), speed: 2.0 }),
      C("Nier", Pt(109.4, 558.0), { stance: "crouch", face: Pt(110.0, 559.6), speed: NIER_RUN }),
      ...EastRetreated(),
      ...HouseDown(), ...CornerDown(), ...JiefangBodies(),
      ...Villagers08().filter((u) => !u.id.match(/Villager[45]/)),
    ],
    pois: [POI.gengGate("objective"), POI.roller("danger"), POI.kitchenDoor("poi"), POI.laneMouth("landmark")],
  });

  // 10-6：炮里撤：窄胡同拐几道弯，炮一排比一排近追着人跑。班长跑最前，每个拐角先到、回身招手；前头一发砸塌院墙堵死胡同（LaneWallCollapse）：
  // 过不去！翻墙！先踩墙根柴垛爬上墙头、翻进旁边院子、回身把人一个个拽上去，穿院子从那家院门出来接上胡同；后送队两个兵里一个挨了弹片，两人一边一个架着他跑；
  // 班长「往那棵大槐树跑！过了槐树就是村口！」；出村南口，后送队缩在路沟里等着
  const p106 = Pt(SLN.climb.from.x, SLN.climb.from.z);
  const luo106 = Pt(SLN.climb.to.x, SLN.climb.to.z);
  Add({
    id: "10-6", ...s10, name: "炮里撤",
    player: { x: p106.x, z: p106.z, yawDeg: -90, pitchDeg: 14, stance: "crouch" },
    what: "炮一排比一排近追着人跑。前头一发砸塌院墙堵死胡同：过不去！翻墙！班长踩柴垛上墙翻进院子，回身把人一个个拽上去。",
    next: { text: "翻墙，穿院子出村", x: SLN.detourYard.inside.x, z: SLN.detourYard.inside.z, radiusM: 2 },
    how: ["窄胡同拐几道弯，炮一排比一排近追着人跑；班长跑最前，每个拐角先到、回身招手，边跑边喊（炮！趴倒！起来！跑！莫停！莫回头！这边！）", "前头一发砸塌院墙堵死胡同（LaneWallCollapse）：过不去！翻墙！先踩墙根柴垛爬上墙头、翻进旁边院子、回身把人一个个拽上去", "跟班长摸街的后送队两个兵里一个挨了弹片，两人一边一个架着他跑", "穿院子从那家院门出来接上胡同；班长：往那棵大槐树跑！过了槐树就是村口！出村南口，后送队缩在路沟里等着", "10-6 全程跑"],
    notes: `塌墙处 (${PL.laneCollapse.x},${PL.laneCollapse.z})：WD2 的东墙 x ${SLN.collapse.wallX}、z ${SLN.collapse.fromZ}…${SLN.collapse.toZ} 倒进胡同；柴垛 (${PL.climbPile.x},${PL.climbPile.z}) 1.2 高贴着东边那院的西墙，从 (${SLN.climb.from.x},${SLN.climb.from.z}) 踩上去翻到 (${SLN.climb.to.x},${SLN.climb.to.z})，穿院子从西南角的院门 (${PL.detourGate.x},${PL.detourGate.z}) 出来接回胡同。大槐树还没进空间表：先用 POI 标在村南口外 (${BIG_LOCUST.x},${BIG_LOCUST.z})（见报告）。`,
    signals: [SIG.cartDeparted, SIG.cellarBlast, SIG.sideGateOpen, SIG.eastGateBurst, SIG.mgSilenced, SIG.northYardGatesBroken, SIG.barrageHit, SIG.laneWallCollapse],
    units: [
      N("Luo", luo106, { stance: "crouch", face: p106, climb: true, through: true, speed: RUN, intent: [Pt(SLN.detourYard.inside.x, SLN.detourYard.inside.z), Pt(SLN.detourYard.gateOut.x + 1.3, SLN.detourYard.gateOut.z), Pt(LANE3_X, SLN.detourYard.gateOut.z), Pt(LANE3_X, 521), Pt(EXIT_X, 521), Pt(EXIT_X, 545)] }),
      N("LiuWencai", Pt(113.3, 498.6), { stance: "crouch", face: p106, speed: RUN }),
      N("Squad1", Pt(113.2, 496.8), { stance: "crouch", face: Pt(113.3, 498.6), guess: true, speed: RUN }),
      N("Squad3", Pt(111.6, 495.2), { stance: "crouch", face: Pt(113.2, 496.8), guess: true, speed: RUN }),
      N("Escort2", Pt(109.3, 492.6), { face: Pt(LANE1_X, 495), speed: RUN, name: "挨了弹片的后送队的兵" }),
      N("Escort1", Pt(109.3, 491.5), { face: Pt(LANE1_X, 495), speed: RUN, name: "架着伤的那个跑的" }),
      N("Squad2", Pt(109.2, 493.7), { face: Pt(LANE1_X, 495), guess: true, speed: RUN }),
      N("Yaowa", Pt(109.3, 489.6), { face: Pt(LANE1_X, 495), speed: RUN }),
      N("HeYoutian", Pt(109.2, 487.4), { face: Pt(LANE1_X, 495), speed: RUN }),
      ...ConvoyAtExit(),
      C("GengCart", Pt(111.4, 558.6), { face: Pt(98, 566), speed: CART_RUN }),
      C("Geng", Pt(110.0, 559.6), { face: Pt(98, 566), speed: 2.0 }),
      C("Nier", Pt(109.4, 558.0), { stance: "crouch", face: Pt(110.0, 559.6), speed: NIER_RUN }),
      ...EastRetreated(),
      ...HouseDown(), ...CornerDown(), ...JiefangBodies(),
      ...Villagers08().filter((u) => !u.id.match(/Villager[45]/)),
    ],
    pois: [POI.laneCollapse("danger"), POI.climbPile("objective"), POI.detourGate("poi"), POI.bigLocust(), POI.villageSouth("landmark")],
  });

  return K;
}

// ---------------------------------------------------------------------------
// 收尾：自动来路、清掉空字段、按固定顺序排键

function FinishPaths(keyframes) {
  for (let i = 1; i < keyframes.length; i++) {
    const prev = new Map(keyframes[i - 1].units.map((u) => [u.id, u]));
    for (const u of keyframes[i].units) {
      const meta = META.get(u) || {};
      const from = prev.get(u.id);
      if (!from || meta.explicitPath || meta.straight) continue;
      if (Dist(from, u) < 0.3) continue;
      const route = StreetRoute(from, u);
      if (route.length > 1) u.path = route;
    }
  }
}

function OrderUnit(u) {
  const out = {};
  for (const k of UNIT_KEY_ORDER) if (u[k] !== undefined && u[k] !== null) out[k] = u[k];
  if (Array.isArray(out.path) && !out.path.length) delete out.path;
  if (Array.isArray(out.intent) && !out.intent.length) delete out.intent;
  return out;
}

const KF_KEY_ORDER = ["id", "stage", "stageLabel", "stageTitle", "name", "player", "what", "next", "how", "notes", "signals", "units", "pois"];
function OrderKeyframe(kf) {
  const out = {};
  for (const k of KF_KEY_ORDER) if (kf[k] !== undefined) out[k] = kf[k];
  out.player = { x: R2(kf.player.x), z: R2(kf.player.z), yawDeg: R1(kf.player.yawDeg), pitchDeg: kf.player.pitchDeg ?? 0, stance: kf.player.stance || "stand" };
  if (out.next && Number.isFinite(out.next.x)) out.next = { text: out.next.text, x: R2(out.next.x), z: R2(out.next.z), radiusM: out.next.radiusM ?? 3 };
  out.signals = kf.signals || [];
  out.units = kf.units.map(OrderUnit);
  return out;
}

const ZONES = Object.freeze([
  { id: "A", name: "干沟与凹路口（集结处）", stages: [6, 6], box: { minX: 10, maxX: 90, minZ: 136, maxZ: 165 } },
  { id: "B", name: "凹路（后送队）", stages: [7, 7], box: { minX: 70, maxX: 106, minZ: 165, maxZ: 376 } },
  { id: "C", name: "村口路沟与主街", stages: [8, 10], box: { minX: 55, maxX: 126, minZ: 376, maxZ: 470 } },
  { id: "D", name: "巷子、街坊家与夹道", stages: [8, 9], box: { minX: 55, maxX: 92, minZ: 382, maxZ: 493 } },
  { id: "E", name: "本家院与老耿家", stages: [9, 10], box: { minX: 75, maxX: 110, minZ: 469, maxZ: 497 } },
  { id: "F", name: "东街与两侧院子（场院 / 土地庙）", stages: [10, 10], box: { minX: 110, maxX: 235, minZ: 438, maxZ: 492 } },
  { id: "G", name: "河汊子（水齐腰深）", stages: [8, 8], box: { minX: 10, maxX: 42, minZ: 200, maxZ: 560 } },
  { id: "H", name: "东北进庄的道与庄子东北角（鬼子顺它进的庄）", stages: [7, 8], box: { minX: 200, maxX: 310, minZ: 310, maxZ: 470 } },
  { id: "I", name: "往南的窄胡同与村南口", stages: [10, 10], box: { minX: 106, maxX: 132, minZ: 469, maxZ: 560 } },
]);

/**
 * 生成 FirstLevel0610 的配置。issues（可选数组）：摆位 / 走位问题一条一行 push 进去（读得到场景文件时才查实心块与高度）。
 * @returns {Promise<object>}
 */
export async function BuildFirstLevel0610Config({ commit = "", generatedAt = "", issues = null } = {}) {
  const raw = Keyframes();
  FinishPaths(raw);
  const doc = {
    schema: BLOCKOUT_SCHEMA,
    level: L0610_LEVEL_KEY,
    title: L0610_TITLE,
    source: {
      generator: FIRST_LEVEL_0610_GENERATOR,
      gameVersion: `Notion 06–10 剧本（2026-10-22 定稿）+ 第六版空间（${L0610_VERSION}）`,
      commit, generatedAt,
    },
    zones: ZONES.map((z) => ({ ...z, stages: [...z.stages], box: { ...z.box } })),
    keyframes: raw.map(OrderKeyframe),
  };
  if (Array.isArray(issues)) {
    const meta = new Map();
    raw.forEach((kf) => kf.units.forEach((u) => meta.set(`${kf.id}/${u.id}`, META.get(u) || {})));
    const scene = await LoadSceneLayout();
    issues.push(...FirstLevel0610Issues(doc, { scene, meta }));
  }
  return doc;
}

// ---------------------------------------------------------------------------
// 摆位 / 走位检查

/** node 里读场景文件（没有或在浏览器里返回 null：只做与场景无关的检查）。 */
export async function LoadSceneLayout() {
  try {
    const fs = await import("node:fs");
    const url = new URL("./Blockout/FirstLevel0610.scene.json", import.meta.url);
    if (!fs.existsSync(url)) return null;
    const doc = JSON.parse(fs.readFileSync(url, "utf8"));
    const { LayoutFromSceneDoc } = await import("./Script_EditorBlockoutLevels.mjs");
    return LayoutFromSceneDoc(doc);
  } catch (error) {
    return { error: String(error?.message || error) };
  }
}

export const L0610_CHECK = Object.freeze({
  personM: 0.6, playerM: 0.6, playerDownM: 0.4, litterM: 1.0, carryM: 0.5, carryReachM: 1.6, nextM: 2,
  body: { radiusM: 0.3, toleranceM: 0.08, fromM: 0.5, toM: 1.4, unitTallM: 0.9, routeTallM: 1.6 },
  playerBody: { radiusM: 0.3, toleranceM: 0.01, fromM: 0.35, toM: 1.6 },
  stepM: 0.25, climbWindowM: 1.0, climbM: 1.2, stepUpM: 0.75,
});

function SolidsFor(scene, signals) {
  const on = new Set(signals);
  const out = scene.blocks.filter((b) => b.solid !== false && !b.blockoutWater);
  for (const g of scene.gates || []) {
    const absent = (g.signal && on.has(g.signal)) || (g.appearSignal && !on.has(g.appearSignal));
    if (!absent && g.solid !== false) out.push(g);
  }
  return out;
}
/** 演员脚下的地面（高度场 + ≤1 m 的块顶，同运行时 standAt）。 */
export function StandSampler(scene, signals) {
  const on = new Set(signals);
  return BlockStandSampler(scene.blocks, scene.gates || [], scene.terrainSampler, (name) => on.has(name));
}

function Penetration(b, x, z, r) {
  const c = Math.cos(b.ry || 0), s = Math.sin(b.ry || 0);
  const dx = x - b.x, dz = z - b.z;
  const lx = dx * c - dz * s, lz = dx * s + dz * c;
  const ex = Math.abs(lx) - b.w / 2, ez = Math.abs(lz) - b.d / 2;
  if (ex <= 0 && ez <= 0) return r + Math.min(-ex, -ez);
  return r - Math.hypot(Math.max(ex, 0), Math.max(ez, 0));
}

function BodyHit(blocks, ground, x, z, body, tallM = 0) {
  let g = null;
  for (const b of blocks) {
    if (b.h <= tallM) continue;
    const pen = Penetration(b, x, z, body.radiusM);
    if (pen <= body.toleranceM) continue;
    if (g === null) g = ground(x, z);
    if (b.y + b.h / 2 < g + body.fromM || b.y - b.h / 2 > g + body.toM) continue;
    if (pen >= body.radiusM && b.y + b.h / 2 <= g + L0610_CHECK.stepUpM) continue;
    return b;
  }
  return null;
}

function Samples(route, stepM) {
  const out = [{ x: route[0].x, z: route[0].z, atM: 0 }];
  let walked = 0;
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1], b = route[i], len = Dist(a, b), n = Math.max(1, Math.ceil(len / stepM));
    for (let k = 1; k <= n; k++) out.push({ x: a.x + (b.x - a.x) * k / n, z: a.z + (b.z - a.z) * k / n, atM: walked + len * k / n });
    walked += len;
  }
  return out;
}

const PEOPLE = new Set(["soldier", "officer", "civilian", "child"]);
function CarrySegment(l) {
  const bearers = Number.isInteger(l.bearers) ? l.bearers : 2;
  if (bearers <= 0) return null;
  const r = l.yawDeg * Math.PI / 180, fx = -Math.sin(r), fz = -Math.cos(r), reach = L0610_CHECK.carryReachM;
  const front = { x: l.x + fx * reach, z: l.z + fz * reach };
  const rear = bearers >= 2 ? { x: l.x - fx * reach, z: l.z - fz * reach } : { x: l.x, z: l.z };
  return [rear, front];
}
function SegDist(p, a, b) {
  const dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz;
  const t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / l2)) : 0;
  return Math.hypot(p.x - a.x - dx * t, p.z - a.z - dz * t);
}
/** 车身（驴车 1.5×2.4）脚印里有没有人。 */
function OnCart(p, v, margin) {
  const r = v.yawDeg * Math.PI / 180, fx = -Math.sin(r), fz = -Math.cos(r);
  const dx = p.x - v.x, dz = p.z - v.z;
  return Math.abs(dx * fx + dz * fz) < 2.4 / 2 + margin && Math.abs(-dx * fz + dz * fx) < 1.5 / 2 + margin;
}

/**
 * 配置的摆位 / 走位问题（每条一行）。scene = LayoutFromSceneDoc 的结果（null = 场景还没有，只做与场景无关的检查）。
 * meta：`${kfId}/${unitId}` → { climb, through, onLitter }（生成器内部标记；手改的 JSON 没有它）。
 */
export function FirstLevel0610Issues(doc, { scene = null, meta = new Map() } = {}) {
  const C = L0610_CHECK, out = [];
  const norm = NormalizeBlockout(doc);
  const b = L0610_BOUNDS;
  const InBounds = (p) => p.x >= b.minX && p.x <= b.maxX && p.z >= b.minZ && p.z <= b.maxZ;
  const hasScene = scene && !scene.error;
  if (scene?.error) out.push(`场景文件读不进来，跳过实心块 / 高度检查：${scene.error}`);
  norm.keyframes.forEach((kf, i) => {
    const M = (u) => meta.get(`${kf.id}/${u.id}`) || {};
    if (!InBounds(kf.player)) out.push(`${kf.id} 玩家出界 (${kf.player.x}, ${kf.player.z})`);
    for (const u of kf.units) if (!InBounds(u)) out.push(`${kf.id} ${u.id} 出界 (${u.x}, ${u.z})`);
    const people = kf.units.filter((u) => PEOPLE.has(u.kind));
    for (const u of people) {
      const d = Dist(u, kf.player), limit = u.state === "down" ? C.playerDownM : C.playerM;
      if (d < limit) out.push(`${kf.id} ${u.id} 离玩家 ${R2(d)} m（< ${limit}）`);
    }
    for (let a = 0; a < people.length; a++) for (let c = a + 1; c < people.length; c++) {
      const d = Dist(people[a], people[c]);
      if (d < C.personM) out.push(`${kf.id} ${people[a].id} 和 ${people[c].id} 重叠 ${R2(d)} m（< ${C.personM}）`);
    }
    for (const l of kf.units.filter((u) => u.kind === "litter")) {
      const seg = CarrySegment(l);
      for (const u of people) {
        if (M(u).onLitter === l.id) continue;
        const d = Dist(u, l);
        if (d < C.litterM) out.push(`${kf.id} ${u.id} 站在 ${l.id} 上（${R2(d)} m）`);
        else if (seg && SegDist(u, seg[0], seg[1]) < C.carryM) out.push(`${kf.id} ${u.id} 站在 ${l.id} 抬的人身上`);
      }
      if (Dist(l, kf.player) < C.litterM - 0.2) out.push(`${kf.id} 玩家站在 ${l.id} 上`);
    }
    for (const v of kf.units.filter((u) => u.kind === "cart")) {
      for (const u of people) if (u.ride?.on !== v.id && OnCart(u, v, 0.2)) out.push(`${kf.id} ${u.id} 站在车身 ${v.id} 里`);   // 挂在这辆车上的人（ride）本来就在车上
      if (OnCart(kf.player, v, 0)) out.push(`${kf.id} 玩家在车身 ${v.id} 里`);
    }
    if (Number.isFinite(kf.next?.x) && Dist(kf.next, kf.player) < C.nextM) out.push(`${kf.id} 下一步目标离玩家不到 ${C.nextM} m（只写文字）`);
    if (hasScene) {
      const solids = SolidsFor(scene, kf.signals);
      const ground = StandSampler(scene, kf.signals);
      const hit = BodyHit(solids, ground, kf.player.x, kf.player.z, C.playerBody, 0);
      if (hit) out.push(`${kf.id} 玩家站进 ${hit.id}`);
      for (const u of kf.units) {
        if (!PEOPLE.has(u.kind)) continue;
        const h = BodyHit(solids, ground, u.x, u.z, C.body, C.body.unitTallM);
        if (h) out.push(`${kf.id} ${u.id} 站进 ${h.id}`);
      }
    }
    if (i === 0) return;
    const prev = norm.keyframes[i - 1];
    const solids = hasScene ? SolidsFor(scene, [...prev.signals, ...kf.signals]) : null;
    const ground = hasScene ? StandSampler(scene, [...prev.signals, ...kf.signals]) : null;
    for (const entry of PlanTransition(prev, kf).units) {
      const unit = entry.unitTo || entry.unitFrom;
      if (!PEOPLE.has(unit.kind) && unit.kind !== "litter") continue;
      if (entry.route.length < 2) continue;
      const m0 = meta.get(`${prev.id}/${entry.id}`) || {}, m1 = meta.get(`${kf.id}/${entry.id}`) || {};
      const m = { climb: !!(m0.climb || m1.climb), through: !!(m0.through || m1.through) };
      const samples = Samples(entry.route, C.stepM);
      if (!hasScene) continue;
      if (!m.through) {
        const hits = new Set();
        for (const p of samples) {
          const h = BodyHit(solids, ground, p.x, p.z, C.body, C.body.routeTallM);
          if (h && !hits.has(h.id)) { hits.add(h.id); out.push(`${prev.id}→${kf.id} ${entry.id} 的走位穿过 ${h.id}（${R1(p.atM)} m 处）`); }
        }
      }
      if (m.climb) continue;
      const hs = samples.map((p) => ground(p.x, p.z));
      const win = Math.round(C.climbWindowM / C.stepM);
      for (let k = win; k < hs.length; k++) {
        if (Math.abs(hs[k] - hs[k - win]) > C.climbM) {
          out.push(`${prev.id}→${kf.id} ${entry.id} 的走位在 ${R1(samples[k].atM)} m 处 1 m 内高差 ${R2(Math.abs(hs[k] - hs[k - win]))} m（翻沟壁 / 翻墙？）`);
          break;
        }
      }
    }
  });
  return out;
}
