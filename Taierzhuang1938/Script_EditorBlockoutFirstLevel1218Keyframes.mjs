// ===========================================================================
// Script_EditorBlockoutFirstLevel1218Keyframes.mjs —— 第一关 11–18 新剧本白盒（关卡键 FirstLevel1218）的关键帧配置生成器（2026-11-02 第四版）
//
//   node Taierzhuang1938/Script_EditorBlockoutCli.mjs export FirstLevel1218 --force   → Blockout/FirstLevel1218.json
//
// 口径：
//   · 剧本（台词、谁做什么）以集成负责人 2026-11-02 的《FirstLevel1218 白盒第四版契约》第三节「故事」为准（tmp/Contract1218_v4.md）；
//     空间以同契约第二节为准，已写成 Data_EditorBlockoutFirstLevel1218Space.mjs 的锚点 —— 本文件所有坐标都从那里（与 Scene 模块的 AllYards / 车路线）算，不手抄数字。
//   · 帧 id 用拍号：11-1、11-2、12-1…12-7、13-1…13-3、14-1…14-6、15-1…15-3（15A / 15B / 15C）、16-1、17-1…17-3、18-1…18-8，共 33 帧。
//   · 每一拍先让玩家亲眼看到出了什么事，再给一句话的下一步；「掩护」「清理」「护送」不进 next。台词照契约原字写进 how。
//   · 百姓一律程序化身体（body:"procedural"）；只有非放片段不可的几帧换骨骼身体：14-4 / 14-5 / 14-6 妮儿、14-6 老耿（拖被子 PvBlanketDragL/R 与被角握点）、
//     15-1 老耿（跪着按毛巾 CareMedicPress）、15-3 妮儿（蹲着画驴 PvKneelDig）、17-1 老耿（跪着把单被拉上来盖脸 PvKneelPullBlanket）。
//     女娃、她娘、教堂门口的人、街上的女人和孩子、蹚水的老乡、夜里队伍里的百姓：程序化身体。七二七团的人是 NRA 骨骼身体，名字里带「二营」「三营」区分（哨兵、连长、军医、守门的兵、工兵、三营军官）。
//   · 冬瓜：11-1…12-6 躺在车板上的竹竿担架上（ride 挂在 GengCart 上）；12-7 起连单被一起搁在救护所院里墙根（BlanketDonggua，布料模拟）；
//     17-1 起在厢房里盖着脸不动；18 起留在厢房里，不再摆。
//   · 驴车：11-1…14-2 立着（12-7 起停在救护所门前空地，车头朝南）；14-3 黑子挨了一梭、连车带驴翻在门前（信号 CartOverturned，翻倒的车是随信号体块），黑子倒地到 18-2；
//     18-3 起不摆（车过不了枕木桥，留在村里——剧本没写，白盒推定）。
//   · 13 沟北边是耿家庄撵出来那伙步兵：两挺轻机枪 + 一具掷弹筒 + 步兵，散在坟头后、田埂后；没有装甲车。
//   · 坐标 X 向东、Z 向南、米；yawDeg 0 朝北、+90 朝西、−90 朝东、180 朝南（同 Script_EditorBlockoutConfig）。
//
// 走位：同一个人在相邻关键帧里 id 不变；生成时按路网（土路、官道北截、板桥、主街、北 / 中 / 南街、胡同、出村小路、门前空地、救护所院门 / 厢房门、教堂院门、
// 女娃家院门、挨炸那家的院门、北岸土路、李子行土巷、上下路基的土坡、铁路桥、南岸路、两处滑坡道）自动排 path，不让人穿墙；
// 沟北麦地、救护所院里、厢房里、战壕东西段、河床、河堤后头、桥北土坎后是能自由走动的区域。
// 只在新帧出现的人写 path 起点「走进来」，只在旧帧的人写 intent「走出去」。
// 铁路桥桥面：每孔一条看不见的 standOn 走道，演员站在枕木顶上走过桥；官道桥桥面也是 standOn（12-6 桥上抱东西跑的兵）。
//
// 摆位检查（push 进 issues，CLI 打出来）：玩家 / 单位出界；玩家站进实心块、单位站进高块（按两帧 signals 算 gates）；
// 两人重叠（< 0.6 m）、人站在担架上 / 车身里；过渡路线穿高块；路线上 1 m 内高差超过 1.2 m（爬坎、下战壕、过铁路桥的例外）；人站进河汊子的深水里（沙河那股水齐小腿不算）。
// 纯函数式生成：不读时钟、不读 git；只在 node 里读场景文件做检查。
// ===========================================================================

import { BLOCKOUT_SCHEMA, PlanTransition, NormalizeBlockout, YawDegFromTo } from "./Script_EditorBlockoutConfig.mjs";
import { BlockStandSampler } from "./Script_EditorBlockoutPrevizPlan.mjs";
import { PointAlong, PointBeside } from "./Data_EditorBlockoutFirstLevel0105Space.mjs";
import { AllYards, HoleWorld, L1218_CART_ROUTE } from "./Script_EditorBlockoutFirstLevel1218Scene.mjs";
import {
  L1218_LEVEL_KEY, L1218_TITLE, L1218_VERSION, L1218_BOUNDS, L1218_PLACES as PL, L1218_ROADS as RD, L1218_GATE_YARD as GYD, L1218_JUNCTION,
  L1218_AT_DITCH as AT, L1218_PLANK as PK, L1218_TRENCH as TR, L1218_VILLAGE as VL, L1218_CHURCH as CH, L1218_AID as A, L1218_GIRL_YARD as GY,
  L1218_CART_PARK as CPK, L1218_RAIL as RL, L1218_RAIL_RAMPS, L1218_RAIL_BRIDGE as RB, L1218_RIVER as RV, L1218_BANK as BK, L1218_LEVEE as LV,
  L1218_GUANDAO_BRIDGE as GB, L1218_BOMBED_YARD as BY, L1218_GRAVES, L1218_RIDGES, L1218_SIGNALS as SIG, L1218_FROM_0610, L1218_LIZIHANG as LZ,
  L1218_SPAWN, L1218_HEIGHTS as H, L1218_TELEGRAPH, StripFrame, RiverAtX, RiverPoint, RiverArcAtX,
} from "./Data_EditorBlockoutFirstLevel1218Space.mjs";

export const FIRST_LEVEL_1218_GENERATOR = "Script_EditorBlockoutCli.mjs export FirstLevel1218";

// ---------------------------------------------------------------------------
// 小工具

const R2 = (v) => Math.round(v * 100) / 100;
const R1 = (v) => Math.round(v * 10) / 10;
const Pt = (x, z) => ({ x: R2(x), z: R2(z) });
const Dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const Yaw = (from, to) => R1(YawDegFromTo(from, to));
const Off = (p, dx, dz) => Pt(p.x + dx, p.z + dz);
const WrapDeg = (d) => { const v = ((d + 180) % 360 + 360) % 360 - 180; return v === -180 ? 180 : v; };
const PathLen = (line) => { let l = 0; for (let i = 1; i < line.length; i++) l += Dist(line[i - 1], line[i]); return l; };
/** 折线上离 p 最近的点的弧长。 */
function ArcOf(line, p) {
  let best = Infinity, at = 0, walked = 0;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1], b = line[i], len = Dist(a, b);
    const t = len > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.z - a.z) * (b.z - a.z)) / (len * len))) : 0;
    const d = Dist(p, { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
    if (d < best) { best = d; at = walked + len * t; }
    walked += len;
  }
  return at;
}
/** 折线（x 单调）在 x 处的 z。 */
function LineZAtX(line, x) {
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1], b = line[i];
    if ((x >= a.x && x <= b.x) || (x >= b.x && x <= a.x)) return a.z + (b.z - a.z) * ((x - a.x) / (b.x - a.x));
  }
  return x < line[0].x ? line[0].z : line[line.length - 1].z;
}
/** 两条直线 (a1→a2)、(b1→b2) 的交点。 */
function LineHit(a1, a2, b1, b2) {
  const d1x = a2.x - a1.x, d1z = a2.z - a1.z, d2x = b2.x - b1.x, d2z = b2.z - b1.z;
  const den = d1x * d2z - d1z * d2x;
  const t = ((b1.x - a1.x) * d2z - (b1.z - a1.z) * d2x) / den;
  return Pt(a1.x + d1x * t, a1.z + d1z * t);
}
/** 路上按弧长 s、横向 lat（左手为正）取点，带朝向。 */
const RoadAt = (line, s, lat = 0) => { const p = PointBeside(line, s, lat); return { ...Pt(p.x, p.z), heading: R1(p.headingYawDeg) }; };
const MS = (s, lat = 0) => RoadAt(RD.mainStreet.line, s, lat);          // 主街（从板桥南头 (99,645) 起算）
const MS_LEN = PathLen(RD.mainStreet.line);
const SR = (s, lat = 0) => RoadAt(RD.southRoad.line, s, lat);           // 南岸路（从土坡脚 (−68,980) 起算）
const SR_YAW = SR(10).heading;
const RAMP_N = L1218_RAIL_RAMPS[0], RAMP_S = L1218_RAIL_RAMPS[1];
const BR_N = Pt(RL.x, RB.northZ - 1.5), BR_S = Pt(RL.x, RB.southZ + 1.5);   // 铁路桥两头路基上（演员站得上的最后一点）
const RIVER_AT_RAIL = RiverAtX(RL.x);
const GBF = StripFrame({ a: GB.north, b: GB.south, side: 1 });
const GBDeck = (s, lat = 0) => { const p = GBF.World(s, lat); return Pt(p.x, p.z); };     // 官道桥桥面（s 从北头起、lat 往西南为正）
const GB_YAW = Yaw(GB.north, GB.south);
const BYF = StripFrame(BY);
const CHF = StripFrame({ ...CH, side: 1 });
const ChurchAt = (s, d) => { const p = CHF.World(s, d); return Pt(p.x, p.z); };
/** 院子按 id（Scene 模块确定性生成的那一套）。 */
const YARD = Object.fromEntries(AllYards().map((y) => [y.id, y]));
const YardAt = (id, s, d) => { const y = YARD[id], p = y.frame.World(s, d); return Pt(p.x, p.z); };
/** 救护所院里的点：院子本地坐标（从院子西北角 (82,788) 起量）。 */
const AY = (dx, dz) => Pt(A.box.minX + dx, A.box.minZ + dz);
/** 战壕东 / 西段壕底中线上 x 处的点。 */
const TRENCH_E = (x) => Pt(x, LineZAtX(TR.east, x));
const TRENCH_W = (x) => Pt(x, LineZAtX(TR.west, x));
/** 南头河堤（顺着河道，x −100…−61 这一段是正东西）：堤顶、堤后（row 排）、散兵坑。 */
const LEVEE_Z = (x) => RiverPoint(RiverArcAtX(x), RV.halfTop + LV.offD).z;
const LEVEE_CREST = (x) => Pt(x, LEVEE_Z(x));
const BEHIND_LEVEE = (x, row = 0) => Pt(x, LEVEE_Z(x) + 2.6 + row * 1.2);
const FOXHOLE = (x) => Pt(x, RiverPoint(RiverArcAtX(x), RV.halfTop + LV.foxhole.offD).z);
const STREAM_AT = (x, dOff = 0) => { const p = RiverPoint(RiverArcAtX(x), RV.stream.offsetD + dOff); return Pt(p.x, p.z); };
const SLIDE_N = RV.slides.find((s) => s.bank === "north"), SLIDE_S = RV.slides.find((s) => s.bank === "south");
const SLIDE_EXTRA = (SLIDE_N.lenM - RV.cliffM) / 2;
const SlideN = (dOff) => { const p = RiverPoint(RiverArcAtX(SLIDE_N.x), -(RV.halfTop + SLIDE_EXTRA) + dOff); return Pt(p.x, p.z); };   // dOff 从坡顶往河床算（正 = 往下）
const SlideS = (dOff) => { const p = RiverPoint(RiverArcAtX(SLIDE_S.x), RV.halfTop + SLIDE_EXTRA - dOff); return Pt(p.x, p.z); };

/** 驴车走的那条线（Scene 模块的 L1218_CART_ROUTE）：村南口 → 土路 → 交叉口 → 官道 → 板桥 → 主街 → 南街口 → 南街 → 出村小路 → 救护所门前空地。按弧长取车 / 黑子 / 牵驴的位置。 */
export const CART_LINE = Object.freeze(L1218_CART_ROUTE.map((p) => Pt(p.x, p.z)));
const CL = (d, lat = 0) => { const p = PointBeside(CART_LINE, d, lat); return { ...Pt(p.x, p.z), heading: R1(p.headingYawDeg) }; };
const D_JUNCTION = ArcOf(CART_LINE, L1218_JUNCTION);
const D_MAIN0 = ArcOf(CART_LINE, RD.mainStreet.line[0]);
const D_CORNER = ArcOf(CART_LINE, PL.southStreetCorner);
export const CART_HITCH_M = 3.4;
const HITCH_M = CART_HITCH_M;   // 黑子在车中心前头多远（Puppets 车前 hitchedAnimalM 4 m 内另有牲口就藏车自己的）
/** 车在线上 d 处：车、黑子、牵驴的人（妮儿走最前头）。预演生成器也用它排车走的路。 */
export function CartOn(d) {
  const cart = CL(d), heizi = CL(d + HITCH_M), lead = CL(d + HITCH_M + 1.3);
  return { cart, yaw: cart.heading, heizi, heiziYaw: heizi.heading, lead };
}

// ---------------------------------------------------------------------------
// 路网

const DOOR_OUT = 1.3;
const NET_SNAP_M = 2.6;
const NODE = {};
const NODE_AT = new Map();
const nodes = [], edges = [], areas = [];
const Node = (name, x, z) => {
  const key = `${R2(x)},${R2(z)}`;
  if (NODE_AT.has(key)) { NODE[name] = NODE_AT.get(key); return NODE[name]; }
  NODE[name] = nodes.length; NODE_AT.set(key, nodes.length); nodes.push({ x: R2(x), z: R2(z), name });
  return NODE[name];
};
const Edge = (a, b) => edges.push([NODE[a], NODE[b]]);
const Chain = (...names) => { for (let i = 1; i < names.length; i++) Edge(names[i - 1], names[i]); };
/** 一条路：顶点依次成节点（同坐标的节点自动合并 = 路口），extras 是顺着弧长插进去的带名字的点。 */
function RoadChain(prefix, line, extras = []) {
  const pts = [...line.map((p, i) => ({ name: `${prefix}${i}`, x: p.x, z: p.z, s: ArcOf(line, p) })), ...extras.map((e) => ({ ...e, s: ArcOf(line, e) }))].sort((p, q) => p.s - q.s);
  for (const p of pts) Node(p.name, p.x, p.z);
  Chain(...pts.map((p) => p.name));
}
const Area = (name, box, ...portals) => areas.push({ name, box, portals: portals.map((n) => NODE[n]) });
const Box = (minX, maxX, minZ, maxZ) => ({ minX, maxX, minZ, maxZ });

// 窄胡同最后一截 → 村南口 → 土路 → 交叉口 → 官道 → 板桥 → 主街 → 官道桥 → 过河往南
Node("LaneIn", L1218_FROM_0610.backLane.c, 538);
RoadChain("Dirt", RD.dirt.line); Edge("LaneIn", "Dirt0");
RoadChain("PostN", RD.postNorth.line);
RoadChain("Plank", RD.plankLink.line);
const MAIN_TRENCH_E = MS(ArcOf(RD.mainStreet.line, Pt(100, TR.east[0].z - 1.4)));
const MAIN_TRENCH_W = MS(ArcOf(RD.mainStreet.line, Pt(100, TR.west[2].z - 0.6)));
const MAIN_CHURCH = MS(ArcOf(RD.mainStreet.line, PL.churchGate));
const MAIN_BOMBED = MS(ArcOf(RD.mainStreet.line, PL.bombedYardGate));
RoadChain("Main", RD.mainStreet.line, [{ name: "MainTrenchE", ...MAIN_TRENCH_E }, { name: "MainTrenchW", ...MAIN_TRENCH_W }, { name: "MainChurch", ...MAIN_CHURCH }, { name: "MainBombed", ...MAIN_BOMBED }]);
Node("GBn", GB.north.x, GB.north.z); Node("GBs", GB.south.x, GB.south.z); Edge("GBn", "GBs");
RoadChain("PostS", RD.postSouth.line);
// 北街、中街、南街、胡同、死胡同
RoadChain("NorthSt", RD.northSt.line);
RoadChain("MidSt", RD.midSt.line);
const WEST_LANE_END = RD.westLane.line[RD.westLane.line.length - 1];
const SOUTH_ST_W = RoadAt(RD.southSt.line, ArcOf(RD.southSt.line, WEST_LANE_END));
RoadChain("SouthSt", RD.southSt.line, [{ name: "SouthStW", ...SOUTH_ST_W }]);
RoadChain("WestLane", RD.westLane.line); Edge(`WestLane${RD.westLane.line.length - 1}`, "SouthStW");
RoadChain("EastLane", RD.eastLane.line);
RoadChain("SeLane", RD.seLane.line);
RoadChain("DeadN", RD.deadEndN.line);
RoadChain("DeadW", RD.deadEndW.line);
// 出村小路（救护所院门、女娃家院门对着的点）→ 村南头 → 北岸土路 → 土坡 → 铁路桥 → 土坡 → 南岸路；李子行土巷
const EXIT_X = RD.exitPath.line[0].x;
RoadChain("Exit", RD.exitPath.line, [{ name: "ExitGate", x: EXIT_X, z: A.gate.z }, { name: "ExitGirl", x: EXIT_X, z: GY.gate.at }]);
RoadChain("NorthBank", RD.northBank.line);
Node("RampNFoot", RAMP_N.from.x, RAMP_N.from.z); Node("RampNTop", RAMP_N.to.x, RAMP_N.to.z); Node("BridgeN", BR_N.x, BR_N.z); Node("BridgeS", BR_S.x, BR_S.z);
Node("RampSTop", RAMP_S.to.x, RAMP_S.to.z); Node("RampSFoot", RAMP_S.from.x, RAMP_S.from.z);
Chain("RampNFoot", "RampNTop", "BridgeN", "BridgeS", "RampSTop", "RampSFoot");
RoadChain("South", RD.southRoad.line);
Node("LiziW", LZ.lane.fromX, LZ.lane.z); Node("LiziE", LZ.lane.toX, LZ.lane.z); Edge("LiziW", "LiziE");
Edge("LiziE", `NorthBank${RD.northBank.line.findIndex((p) => p.x === LZ.lane.toX)}`);
// 救护所院门 / 厢房门 / 女娃家院门 / 教堂院门 / 挨炸那家的院门 / 战壕口
Node("AidGateOut", PL.aidGateOut.x, PL.aidGateOut.z); Node("AidGateIn", PL.aidGateIn.x, PL.aidGateIn.z); Chain("ExitGate", "AidGateOut", "AidGateIn");
const X = A.xiang;
Node("XiangDoorOut", X.box.maxX + DOOR_OUT, X.door.z); Node("XiangDoorIn", X.box.maxX - DOOR_OUT, X.door.z); Edge("XiangDoorOut", "XiangDoorIn");
Node("GirlGateOut", GY.box.maxX + DOOR_OUT, GY.gate.at); Node("GirlGateIn", GY.box.maxX - DOOR_OUT, GY.gate.at); Chain("ExitGirl", "GirlGateOut", "GirlGateIn");
const cgO = ChurchAt(CH.gate.s, CH.d0 - DOOR_OUT), cgI = ChurchAt(CH.gate.s, CH.d0 + DOOR_OUT);
Node("ChurchGateOut", cgO.x, cgO.z); Node("ChurchGateIn", cgI.x, cgI.z); Chain("MainChurch", "ChurchGateOut", "ChurchGateIn");
const bgO = YardAt(BY.id, YARD[BY.id].gate.s, YARD[BY.id].d0 - DOOR_OUT), bgI = YardAt(BY.id, YARD[BY.id].gate.s, YARD[BY.id].d0 + DOOR_OUT);
Node("BombedGateOut", bgO.x, bgO.z); Node("BombedGateIn", bgI.x, bgI.z); Chain("MainBombed", "BombedGateOut", "BombedGateIn");
Node("TrenchE_W", MAIN_TRENCH_E.x + 3.8, MAIN_TRENCH_E.z); Edge("MainTrenchE", "TrenchE_W");
Node("TrenchW_E", MAIN_TRENCH_W.x - 6.0, MAIN_TRENCH_W.z); Edge("MainTrenchW", "TrenchW_E");
// 河床：两处滑坡道上下（蹚水的老乡）；铁路桥桥面那一条不算河床（AreaOf 里排除）
{
  const nt = SlideN(-1.0), nb = SlideN(SLIDE_N.lenM + 1.0), sb = SlideS(SLIDE_S.lenM + 1.0), st = SlideS(-1.0);
  Node("SlideNTop", nt.x, nt.z); Node("SlideNBed", nb.x, nb.z); Node("SlideSBed", sb.x, sb.z); Node("SlideSTop", st.x, st.z);
  Edge("SlideNTop", "SlideNBed"); Edge("SlideSBed", "SlideSTop"); Edge("SlideSTop", "RampSFoot"); Edge("SlideNTop", "RampNFoot");
}
// 区域
Area("NorthField", Box(40, 236, 557, 629.5), "Dirt2", "Dirt3", "PostN5", "PostN7", "PostN8");
Area("GateYard", Box(GYD.box.minX, GYD.box.maxX, GYD.box.minZ, GYD.box.maxZ), "ExitGate", "AidGateOut", "Exit1");
Area("AidYard", Box(A.box.minX + 0.6, A.box.maxX - 0.6, A.mainHouse.box.maxZ + 0.6, A.box.maxZ - 0.6), "AidGateIn", "XiangDoorOut");
Area("Xiang", Box(X.box.minX + 0.6, X.box.maxX - 0.5, X.box.minZ + 0.5, X.box.maxZ - 0.5), "XiangDoorIn");
Area("GirlYard", Box(GY.box.minX + 0.6, GY.box.maxX - 0.6, GY.box.minZ + 0.6, GY.box.maxZ - 0.6), "GirlGateIn");
Area("TrenchE", Box(107, 160, TR.east[1].z - 0.8, TR.east[0].z + 1.0), "TrenchE_W");
Area("TrenchW", Box(50, 90, TR.west[2].z - 0.3, TR.west[0].z - 2.5), "TrenchW_E");
Area("RiverBed", Box(-100, -50, RIVER_AT_RAIL.northToe.z + 0.5, RIVER_AT_RAIL.southToe.z - 0.5), "SlideNBed", "SlideSBed");
Area("BehindLevee", Box(-110, -40, LEVEE_Z(-70) - 3.4, 984), "RampSFoot", "SlideSTop", "South1");
Area("BankHollow", Box(BK.fromX, BK.toX, BK.hollow.fromZ - 0.4, 906), `NorthBank${RD.northBank.line.length - 2}`);
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
const AreaOf = (p) => areas.filter((a) => InBox(a.box, p) && !(a.name === "RiverBed" && OnRailBridge(p))).sort((a, b) => BoxArea(a.box) - BoxArea(b.box))[0] || null;
export function OnNet(p) { return !!AreaOf(p) || NearestOnNet(p).dist <= NET_SNAP_M; }

/**
 * 沿路网从 a 走到 b 的折线（不含 a，含 b）。两端都不在路网上（野地）→ 直线 [b]。
 * 一端在路网上、一端在野地：野地那一端挂到离它最近的路点上，沿路走到那里再直线过去。
 */
export function StreetRoute(a, b) {
  const aOn = OnNet(a), bOn = OnNet(b);
  if (!aOn && !bOn) return [Pt(b.x, b.z)];
  const areaA = AreaOf(a), areaB = AreaOf(b);
  if (areaA && areaA === areaB) return [Pt(b.x, b.z)];
  const vs = nodes.map((n) => ({ x: n.x, z: n.z }));
  const adj = vs.map(() => []);
  const Link = (i, j, w = Dist(vs[i], vs[j])) => { adj[i].push([j, w]); adj[j].push([i, w]); };
  const ia = vs.push({ x: a.x, z: a.z }) - 1, ib = vs.push({ x: b.x, z: b.z }) - 1;
  adj.push([], []);
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
  if (areaA) for (const n of areaA.portals) Link(ia, n);
  if (areaB) for (const n of areaB.portals) Link(ib, n);
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
const UNIT_KEY_ORDER = ["id", "side", "kind", "shape", "name", "castId", "role", "group", "weapon", "body", "x", "z", "yawDeg", "stance", "aim", "state", "lie", "bearers", "dragSolo", "ride", "arc", "speedMps", "path", "intent", "guess"];

/**
 * 一个单位。at = {x,z}；o：
 *   face {x,z} | yaw   朝向；name / castId / kind / role / group / weapon（null = 空手）/ body / stance / aim / down / lie / bearers / arc / speed / guess
 *   from {x,z}|[..]   只在本帧出现：从这里走进来（path 起点）；fromStraight 不走路网
 *   path [..]          显式来路；to / intent 去向（to 沿路网排）；toStraight 直线
 *   straight           上一帧过来走直线（不排路网）
 *   climb              来去要下战壕 / 爬坎 / 过铁路桥 / 翻河堤（不报高差）；onLitter 躺在哪副担架 / 被子上（不报「站在担架上」）
 *   ride               §3 挂到车上 { on, x, z, y, yawDeg }（x / z 仍写车上那一点的世界坐标，车不在场时的备用）
 *   tending            跪在哪个伤员身边照料（不报与他重叠）
 *   wade               蹚沙河那一股水（齐小腿，不算站在水里）
 */
function U(id, side, at, o = {}) {
  const u = { id, side, x: R2(at.x), z: R2(at.z) };
  if (o.kind && o.kind !== "soldier") u.kind = o.kind;
  if (o.name) u.name = o.name;
  if (o.castId) u.castId = o.castId;
  if (o.role) u.role = o.role;
  if (o.group) u.group = o.group;
  if (o.weapon !== undefined) u.weapon = o.weapon;
  if (o.body) u.body = o.body;
  u.yawDeg = o.face ? Yaw(at, o.face) : R1(o.yaw ?? at.heading ?? 0);
  if (o.stance && o.stance !== "stand") u.stance = o.stance;
  if (o.aim) u.aim = true;
  if (o.down) u.state = "down";
  if (o.down && o.lie) u.lie = o.lie;
  if (o.bearers !== undefined) u.bearers = o.bearers;
  if (o.dragSolo) u.dragSolo = true;   // 单被：只认真有手攥着的角（§5.6；14-5 顺子松了手）
  if (o.ride) u.ride = { on: o.ride.on, x: R2(o.ride.x ?? 0), z: R2(o.ride.z ?? 0), y: Math.round((o.ride.y ?? 0) * 1000) / 1000, yawDeg: R1(o.ride.yawDeg ?? 0) };
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
  META.set(u, { straight: !!o.straight, climb: !!o.climb, explicitPath: !!(o.path || o.from), onLitter: o.onLitter || null, tending: o.tending || null, wade: !!o.wade });
  return u;
}

/** 改单位的几个字段（保留生成器内部标记）。 */
const Mod = (u, patch) => { const v = { ...u, ...patch }; META.set(v, META.get(u)); return v; };

const Poi = (id, name, kind, at, radiusM = 2) => ({ id, name, kind, x: R2(at.x), z: R2(at.z), radiusM });
const ArcTo = (from, to, halfDeg, extraM = 6) => ({ halfDeg, rangeM: R1(Dist(from, to) + extraM), yawDeg: Yaw(from, to) });

const G = (id) => L1218_GRAVES.find((g) => g.id === id);
const SUN_WEST = Pt(PL.sunWest.x, PL.sunWest.z);   // 第二轮起 sunWest 本身就在场地里（土路长直段 → 桥北头的延长线上）
const TELE_POLE_NEAR_BRIDGE = Pt(L1218_TELEGRAPH.x, 885);   // 桥北头边上那根电线杆（TelegraphPoleZs 里 z 885）
const SLEEPER_PILE_DA1 = YardAt("DA1", YARD.DA1.gate.s + 2.6, YARD.DA1.d0 - 0.85);     // Scene 里 SleeperPile_DA1 的位置
const SLOGAN_DA1 = YardAt("DA1", YARD.DA1.gate.s - 3.6, YARD.DA1.d0 - 0.3);            // Slogan_DA1 大致在院门西边的前墙上
const RAID_WALL_SR1 = YardAt("SR1", YARD.SR1.s0 - 0.9, YARD.SR1.d0 + 5.5);              // 出村小路边那家塌了半截的墙（RaidAftermath）
const POI = {
  laneShell: () => Poi("LaneShell", "身后一发炮落在胡同里", "danger", PL.laneShell, 3),
  villageFire: () => Poi("VillageFire", "庄子里一排排落炮，草顶烧着", "danger", Off(PL.gengSmoke, 10, 37), 14),
  beishahe: (kind = "landmark") => Poi("Beishahe", "官道尽头北沙河村的树和院墙，沟口有兵在动", kind, Pt(VL.box.minX + 65, VL.box.minZ + 5), 12),
  fieldShell: () => Poi("FieldShell", "一发炮打偏落在路边麦地", "danger", PL.fieldShell, 3),
  gengSmoke: () => Poi("GengSmoke", "老耿家腾起黑烟（按「看」转过去）", "landmark", PL.gengSmoke, 6),
  ditch: (kind = "landmark") => Poi("AtDitch", "村口沟（比人深）和板桥", kind, PL.plankMid, 3),
  abatis: () => Poi("Abatis", "杂木（枣树枝），二营的兵还在添", "landmark", Pt(90.6, LineZAtX(AT.line, 90.6) + 2.9), 2),
  helmets: () => Poi("Helmets", "耿家庄村南口冒出两三顶钢盔", "danger", PL.helmetsAt, 3),
  slogan: () => Poi("Slogan", "墙上刷的大字标语", "landmark", SLOGAN_DA1, 2),
  sleepers: () => Poi("SleeperPile", "门口码着铁路上拆来的枕木当柴", "landmark", SLEEPER_PILE_DA1, 1.6),
  church: () => Poi("ChurchGate", "教堂门口：有人背着老人往里进", "landmark", PL.churchGate, 3),
  boards: () => Poi("BoardRunners", "二营的兵扛门板、抱树枝往沟口跑", "poi", MS(68), 6),
  guandaoFar: () => Poi("GuandaoBridgeFar", "顺官道往东南望：河、官道桥，几个兵抱着东西往桥上跑", "landmark", PL.guandaoBridgeMid, 8),
  guandaoBlown: () => Poi("GuandaoBlown", "村子东南「轰」一声，房顶后头冲起一柱土烟：官道桥炸了", "danger", PL.guandaoBridgeMid, 10),
  aid: (kind = "objective") => Poi("AidGate", "救护所（七二七团借的院子）", kind, PL.aidGateOut, 2),
  girlHole: () => Poi("GirlHole", "隔壁塌墙那边，洞口探出一个女娃", "poi", GY.hole.mouth, 1.2),
  trench: (kind = "objective") => Poi("TrenchSquad", "沟口东段战壕（班长在这儿）", kind, PL.trenchSquad, 2),
  graves: () => Poi("Graves", "坟头后、田埂后散开的鬼子步兵，两挺轻机枪压沟沿", "danger", Pt(G("G_N1").x, G("G_N1").z - 1), 6),
  grenadier: () => Poi("Grenadier", "掷弹筒「嘭」追着战壕找人", "danger", Pt(G("G_N4").x, G("G_N4").z - 1.6), 3),
  runners: () => Poi("Runners", "撤下来的人从田里往沟口跑", "poi", Pt(90, 620), 6),
  flare: () => Poi("Flare", "对面一颗信号弹拖着烟打上天", "danger", PL.flareAt, 4),
  planesEast: () => Poi("PlanesEast", "东边嗡嗡声：飞机", "danger", PL.planesFrom, 12),
  wave1: () => Poi("Wave1", "第一拨三架：顺着村北沿战壕和沟口扔炸弹扫射", "danger", Pt(140, LineZAtX(AT.line, 140) + 5), 20),
  wave2: () => Poi("Wave2", "第二拨三架掉头顺着村里的街扫、往院子里扔炸弹，几处房顶着火", "danger", MS(120), 16),
  planesStreet: () => Poi("PlanesStreet", "飞机顺着街扫过来", "danger", MS(150), 12),
  bombedHole: () => Poi("BombedHole", "南街边那家院里的洞挨了一颗，炸成一个坑", "danger", PL.bombedHole, 3),
  streetDown: (at) => Poi("StreetDown", "街上躺着人；一个女人拖着孩子往墙根爬", "poi", at, 3),
  heizi: () => Poi("HeiziHit", "黑子挨了一梭，连车带驴翻在地上，后腿一下一下蹬", "poi", CPK.heizi, 2),
  hole: (kind = "objective") => Poi("AidHoleA", "院里的洞（十几步外）", kind, A.holes[0].mouth, 1.6),
  planesDive: () => Poi("PlanesDive", "飞机掉头俯冲，声音越来越尖", "danger", Pt(150, 700), 12),
  bullets: (at) => Poi("BulletLine", "一串弹着点顺着院子地皮追过来", "danger", at, 2),
  planesGone: () => Poi("PlanesGone", "飞机拉起来往东飞走", "landmark", Pt(220, 650), 10),
  redSky: (at) => Poi("RedSky", "洞顶漏下一条红天", "landmark", at, 0.6),
  xiangDoor: (kind = "objective") => Poi("XiangDoor", "厢房门（有门槛）", kind, PL.xiangDoor, 1.2),
  dongguaInside: () => Poi("DongguaInside", "厢房里靠墙的空地", "objective", A.dongguaInside, 1.2),
  threshold: () => Poi("Threshold", "门槛", "poi", A.thresholdSeat, 0.8),
  passing: () => Poi("Passing2nd", "院门外二营的兵一拨拨跑过", "poi", Pt(EXIT_X, A.gate.z + 4), 4),
  girlYard: () => Poi("GirlYard", "隔壁院：女娃她娘把席子拉上盖住洞口", "poi", GY.hole.mouth, 1.4),
  // 18 引导（第二轮）：三处路边小场景按走路顺序沿北岸土路排（村里 SR1 的塌墙、出村小路的席子还在，18-3 的 POI 不再指它们）
  raidWall: () => Poi("RaidWall", "一出村南头，路北边一个孤零零的院子挨了炸：墙塌了半边，房梁在冒烟", "landmark", PL.roadsideYard, 4),
  raidMats: () => Poi("RaidMats", "路北边一道土墙，墙根一排人盖着席子、露着脚", "poi", PL.roadsideMats, 5),
  lizihang: () => Poi("Lizihang", "路过李子行，村里空了", "landmark", PL.liziHang, 8),
  liziGate: () => Poi("LiziGate", "李子行朝路的院门：门板歪着斜靠在门框上，地上掉着一只鞋", "poi", PL.liziSouthGate, 2),
  sunWest: () => Poi("SunWest", "顺着土路往西南看，夕阳正落在铁路桥那头", "landmark", SUN_WEST, 6),
  telegraph: () => Poi("Telegraph", "路基边一排电线杆（7 m 高、35 m 一根），远远标着铁路和桥在哪", "landmark", TELE_POLE_NEAR_BRIDGE, 3),
  railBridge: (kind = "objective") => Poi("RailBridge", "铁路桥（几孔钢梁架在石墩上，桥面只有枕木）", kind, PL.bridgeMid, 4),
  wade: () => Poi("Wade", "有老乡顺着陡岸滑下河床，蹚水过去", "poi", PL.wadeAt, 3),
  sappers: () => Poi("Sappers", "两个工兵在桥墩上绑炸药，引线拉到南岸河堤后", "poi", Pt(RL.x + 2, RB.northZ + (RB.southZ - RB.northZ) / RB.spans), 2),
  mg18: (kind = "danger") => Poi("IjaMg18", "一挺机枪架在路基脚顺着路基扫", kind, PL.ijaMg18, 3),
  bank: () => Poi("Bank", "班长他们被压在桥北头土坎后头，一离开土坎就是靶子", "poi", PL.lastGroupCover, 3),
  blast: () => Poi("BridgeBlast", "「轰」北头两孔钢梁断开砸进河床", "landmark", Pt(RL.x, RB.northZ + 11), 6),
  villageGuns: () => Poi("VillageGuns", "东北边北沙河村那头枪声还在响（二营）", "danger", Pt(VL.box.minX + 60, VL.box.maxZ - 40), 20),
  cityLights: () => Poi("CityLights", "黑地里远远几点灯，是县城", "landmark", PL.cityLights, 6),
};

// ---------------------------------------------------------------------------
// 人物

const NRA = {
  Luo: { name: "罗班长", role: "squadLeader", castId: "luo" },
  Yaowa: { name: "幺娃", castId: "yaowa" },
  HeYoutian: { name: "何有田", castId: "heyoutian" },
  LiuWencai: { name: "刘文财", castId: "liuwencai" },
  Donggua: { name: "冬瓜", role: "comrade", castId: "comrade" },
  Bearer1: { name: "担架员", role: "bearer", weapon: null }, Bearer2: { role: "bearer", weapon: null },
  Wounded1: { name: "肚子挨了枪的", role: "wounded" }, Wounded2: { role: "wounded" },
  Sentry: { name: "二营哨兵", role: "sentry" },
  Captain: { name: "二营连长", kind: "officer", role: "captain2nd", castId: "frontOfficer" },
  Mg727: { name: "二营机枪", role: "machineGun", weapon: "Zb26", group: "ditch2nd" },
  Doctor: { name: "军医", role: "doctor", weapon: null },
  DoorGuard: { name: "守门的兵", role: "guard" },
  Officer18: { name: "三营军官", kind: "officer", role: "bridgeOfficer" },
  Sapper1: { name: "工兵", role: "sapper" }, Sapper2: { name: "工兵", role: "sapper" },
};
const N = (id, at, o = {}) => U(id, "nra", at, { ...(NRA[id] || {}), ...o });
const CIV = {
  Geng: { name: "老耿", kind: "civilian", role: "carter" },
  Nier: { name: "妮儿", kind: "child" },
  GengCart: { name: "驴车", kind: "cart" },
  Heizi: { name: "黑子", kind: "animal" },
  Girl: { name: "女娃", kind: "child", role: "girl" },
  GirlMother: { name: "女娃她娘", kind: "civilian", role: "girlMother" },
};
/** 百姓：一律程序化身体（body procedural）；要放片段的那几帧显式写 body:"rig"。车 / 牲口没有身体字段。 */
const C = (id, at, o = {}) => {
  const base = CIV[id] || {}, kind = base.kind || o.kind || "civilian";
  const body = kind === "civilian" || kind === "child" ? { body: o.body || "procedural" } : {};
  return U(id, "civ", at, { ...base, kind, ...body, ...o });
};
const J = (id, at, o = {}) => U(id, "ija", at, o);

// ---------------------------------------------------------------------------
// 车上的东西（照第二版：§3 ride 挂到 GengCart 上）

const CART_LEN = 2.4;
const CART_RIDE_Y = Object.freeze({ litter: 1.075, lying: 1.125, nierSit: 0.467 });
const CART_TAIL_LOCAL_Z = 1.2;
const CART_LITTER_SLOTS = Object.freeze([{ z: 0.75, yaw: 90 }, { z: 0, yaw: -90 }, { z: -0.75, yaw: 90 }]);   // [0] 靠车尾 = 冬瓜那副
export const NIER_TAIL_RIDE = Object.freeze({ on: "GengCart", x: 0, z: CART_TAIL_LOCAL_Z, y: CART_RIDE_Y.nierSit, yawDeg: 180 });
/** 车本地点 → 世界坐标（同 Puppets RideWorldPose）。 */
export function CartWorld(cart, cartYaw, local) {
  const r = cartYaw * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
  return Pt(cart.x + local.x * c + local.z * s, cart.z - local.x * s + local.z * c);
}
const CartRide = (local, y, yaw = 0) => ({ on: "GengCart", x: local.x, z: local.z, y, yawDeg: yaw });
const DongguaOnCart = (cart, cartYaw) => {
  const slot = CART_LITTER_SLOTS[0], local = { x: 0, z: slot.z }, at = CartWorld(cart, cartYaw, local), yaw = R1(WrapDeg(cartYaw + slot.yaw));
  return [
    N("LitterDonggua", at, { kind: "litter", name: "冬瓜的担架", bearers: 0, yaw, group: "cart", speed: 1.2, ride: CartRide(local, CART_RIDE_Y.litter, slot.yaw) }),
    N("Donggua", at, { down: true, lie: "along", onLitter: "LitterDonggua", speed: 1.2, yaw, ride: CartRide(local, CART_RIDE_Y.lying, slot.yaw) }),
  ];
};
const CartLitters = (cart, cartYaw) => CART_LITTER_SLOTS.slice(1).flatMap((slot, i) => {
  const local = { x: 0, z: slot.z }, at = CartWorld(cart, cartYaw, local), yaw = R1(WrapDeg(cartYaw + slot.yaw));
  return [
    N(`CartLitter${i + 1}`, at, { kind: "litter", bearers: 0, yaw, group: "cart", speed: 1.4, ride: CartRide(local, CART_RIDE_Y.litter, slot.yaw) }),
    N(`Wounded${i + 1}`, at, { group: "cart", down: true, lie: "along", onLitter: `CartLitter${i + 1}`, speed: 1.4, yaw, ride: CartRide(local, CART_RIDE_Y.lying, slot.yaw) }),
  ];
});
const NierOnTail = (cart, cartYaw) => C("Nier", CartWorld(cart, cartYaw, { x: 0, z: CART_TAIL_LOCAL_Z }), { yaw: R1(WrapDeg(cartYaw + 180)), ride: { ...NIER_TAIL_RIDE } });
/** 车 + 黑子 + 车上的东西（cart = CartOn(d)）。nier：tail（坐车尾）/ lead（牵驴走最前头）/ null（另摆）。 */
function CartGroup(cp, { nier = null, speed = 1.3, gengSide = -1.1, geng = true, gengFace = null } = {}) {
  const out = [
    C("GengCart", cp.cart, { yaw: cp.yaw, speed }),
    C("Heizi", cp.heizi, { yaw: cp.heiziYaw, speed }),
    ...DongguaOnCart(cp.cart, cp.yaw), ...CartLitters(cp.cart, cp.yaw),
  ];
  if (geng) { const g = CartWorld(cp.heizi, cp.heiziYaw, { x: gengSide, z: 0.4 }); out.push(C("Geng", g, gengFace ? { face: gengFace, speed } : { yaw: cp.heiziYaw, speed })); }
  if (nier === "tail") out.push(NierOnTail(cp.cart, cp.yaw));
  if (nier === "lead") out.push(C("Nier", cp.lead, { yaw: cp.heiziYaw, speed }));
  return out;
}
/** 冬瓜躺在自己那床单被上：被子是 litter 单位（IsBlanketLitter，布料模拟），冬瓜顺着被子躺、头朝被子朝向的前方（拽的那头）。 */
const DongguaOnBlanket = (at, { yaw = 0, extra = {}, dragSolo = false } = {}) => [
  N("BlanketDonggua", at, { kind: "litter", name: "冬瓜的单被", bearers: 0, yaw, group: "donggua", speed: 1.0, ...(dragSolo ? { dragSolo: true } : {}), ...extra }),
  N("Donggua", at, { down: true, lie: "along", onLitter: "BlanketDonggua", speed: 1.0, yaw, ...extra }),
];
/** 被子的四个角：front = 头那头（朝向前方 0.95 m）、side ±1 = 左 / 右（左手 = 朝向转 +90°）。 */
const BlanketCorner = (at, yaw, side, front = 1.25, out = 0.75) => {
  const r = yaw * Math.PI / 180, fx = -Math.sin(r), fz = -Math.cos(r), lx = -Math.cos(r), lz = Math.sin(r);
  return Pt(at.x + fx * front + lx * out * side, at.z + fz * front + lz * out * side);
};

// ---------------------------------------------------------------------------
// 固定站位与成组的人

const VS = PL.villageSouth;
/** 13 沟北边的鬼子：耿家庄撵出来那伙步兵 —— 两挺轻机枪趴在坟头背坡上（枪口压过坟顶）、一具掷弹筒在坟后、步兵在田埂后、军官在坟后。 */
const IJA_MG1 = Pt(G("G_N1").x, G("G_N1").z - 0.6), IJA_MG2 = Pt(G("G_N2").x, G("G_N2").z - 0.6);
const RIDGE_N = (x) => Pt(x, L1218_RIDGES[0].z - 0.9), RIDGE_FAR = (x) => Pt(x, L1218_RIDGES[2].z - 0.9);
const IjaNorth = () => [
  J("IjaMg1", IJA_MG1, { name: "鬼子轻机枪", role: "machineGun", weapon: "Type11", group: "north", stance: "prone", aim: true, arc: ArcTo(IJA_MG1, TRENCH_E(124), 16, 10), yaw: Yaw(IJA_MG1, TRENCH_E(124)), straight: true }),
  J("IjaMg2", IJA_MG2, { name: "鬼子轻机枪", role: "machineGun", weapon: "Type11", group: "north", stance: "prone", aim: true, arc: ArcTo(IJA_MG2, TRENCH_E(136), 16, 10), yaw: Yaw(IJA_MG2, TRENCH_E(136)), straight: true }),
  J("IjaGrenadier", Pt(G("G_N4").x, G("G_N4").z - 1.7), { name: "掷弹筒", role: "grenadier", group: "north", stance: "crouch", face: TRENCH_E(130), straight: true }),
  J("IjaInf1", RIDGE_N(60), { role: "rifleman", group: "north", stance: "prone", aim: true, face: TRENCH_W(64), straight: true }),
  J("IjaInf2", RIDGE_N(76), { role: "rifleman", group: "north", stance: "prone", aim: true, face: TRENCH_W(70), straight: true }),
  J("IjaInf3", RIDGE_N(128), { role: "rifleman", group: "north", stance: "prone", aim: true, face: TRENCH_E(130), straight: true }),
  J("IjaInf4", RIDGE_N(144), { role: "rifleman", group: "north", stance: "prone", aim: true, face: TRENCH_E(140), straight: true }),
  J("IjaInf5", RIDGE_N(160), { role: "rifleman", group: "north", stance: "prone", aim: true, face: TRENCH_E(150), straight: true }),
  J("IjaInf6", RIDGE_FAR(80), { role: "rifleman", group: "north", stance: "crouch", aim: true, face: PL.plankMid, straight: true }),
  J("IjaInf7", RIDGE_FAR(120), { role: "rifleman", group: "north", stance: "crouch", aim: true, face: TRENCH_E(124), straight: true }),
  J("IjaOfficer", Pt(G("G_N3").x, G("G_N3").z - 1.7), { kind: "officer", name: "鬼子军官", group: "north", stance: "crouch", face: PL.plankMid, straight: true }),
];
/** 七二七团二营守沟口的：沟两边战壕里的兵、沟东头那挺机枪。 */
const Ditch727 = ({ stance = "stand", aim = true, skip = new Set(), down = new Set() } = {}) => [
  N("Mg727", PL.mg727, { stance: "prone", aim, face: PL.junction, arc: ArcTo(PL.mg727, PL.junction, 14, 10), climb: true }),
  ...[["S727_W1", TRENCH_W(58)], ["S727_W2", TRENCH_W(64)], ["S727_W3", TRENCH_W(70)], ["S727_E1", TRENCH_E(132)], ["S727_E2", TRENCH_E(136)], ["S727_E3", TRENCH_E(142)], ["S727_E4", TRENCH_E(150)]]
    .filter(([id]) => !skip.has(id))
    .map(([id, p]) => N(id, p, { name: id === "S727_W1" ? "二营兵" : down.has(id) ? "二营兵（挨炸倒下）" : undefined, role: "rifleman2nd", group: "ditch2nd", stance: down.has(id) ? "stand" : stance, aim: aim && !down.has(id), face: Pt(p.x, 600), climb: true, ...(down.has(id) ? { down: true } : {}) })),
];
/** 沟口东段战壕里的班长他们（13 起）。 */
const SQUAD_TRENCH = Object.freeze({ Luo: TRENCH_E(122.0), Yaowa: TRENCH_E(120.4), LiuWencai: TRENCH_E(125.2), HeYoutian: TRENCH_E(126.8), Squad1: TRENCH_E(128.6), Squad2: TRENCH_E(130.4) });
const PLAYER_TRENCH = TRENCH_E(123.6);
const SquadInTrench = ({ stance = "stand", aim = true, face = IJA_MG1, skip = new Set() } = {}) =>
  Object.entries(SQUAD_TRENCH).filter(([id]) => !skip.has(id)).map(([id, p]) => N(id, p, { stance, aim, face, guess: id.startsWith("Squad"), climb: true }));
const SENTRY_FIGHT = Pt(PL.sentry.x - 0.2, PL.sentry.z + 0.4);

// 救护所院里：军医、伤员、帮忙的兵（院子本地坐标；照第三版的摆法整体平移）
const AID_WOUNDED = Object.freeze([AY(12.2, 11.4), AY(15.8, 11.0), AY(19.6, 11.4), AY(23.0, 11.8), AY(11.6, 14.6), AY(21.4, 15.4), AY(24.4, 18.4), AY(13.6, 24.6)]);
export const PRESS_STAGE = Object.freeze({ x: 0.42, z: 0.36, yawDeg: 90 });
export function PressPose(patient, patientYaw) {
  const r = patientYaw * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
  return { x: R2(patient.x + PRESS_STAGE.x * c + PRESS_STAGE.z * s), z: R2(patient.z - PRESS_STAGE.x * s + PRESS_STAGE.z * c), yawDeg: R1(WrapDeg(patientYaw + PRESS_STAGE.yawDeg)) };
}
const WoundedYaw = (i) => (i % 4) * 45;
const DOCTOR_PATIENT_I = 5;
export const DOCTOR_PRESS = Object.freeze(PressPose(AID_WOUNDED[DOCTOR_PATIENT_I], WoundedYaw(DOCTOR_PATIENT_I)));
const DOCTOR_PATIENT_ID = `AidWounded${String(DOCTOR_PATIENT_I + 1).padStart(2, "0")}`;
const AidWounded = ({ skip = new Set() } = {}) => AID_WOUNDED.map((p, i) => [p, i]).filter(([, i]) => !skip.has(i))
  .map(([p, i]) => N(`AidWounded${String(i + 1).padStart(2, "0")}`, p, { role: "wounded", group: "aid", down: true, yaw: WoundedYaw(i), guess: true }));
const DOOR_GUARD = Pt(A.gateGuardPost.x, A.gateGuardPost.z);
const HELPER = AY(24.0, 9.2);
const AidPeople = ({ doctor = true, doctorAt = DOCTOR_PRESS, doctorFace = null, doctorStance = "crouch", guard = true, skip = new Set() } = {}) => [
  ...(doctor ? [N("Doctor", doctorAt, { ...(doctorFace ? { face: doctorFace } : { yaw: DOCTOR_PRESS.yawDeg }), stance: doctorStance, tending: DOCTOR_PATIENT_ID })] : []),
  ...(guard ? [N("DoorGuard", DOOR_GUARD, { face: Off(DOOR_GUARD, 5, 1) })] : []),
  N("AidHelper", HELPER, { name: "二营兵（烧水）", role: "helper2nd", weapon: null, face: Off(HELPER, 4, 0.8) }),
  ...AidWounded({ skip }),
];
/** 院里的两个伤员（车上卸下来的）。 */
const CART_WOUNDED_IN_YARD = Object.freeze({ Wounded1: AY(26.6, 22.2), Wounded2: AY(26.8, 26.4) });
const CartWoundedInYard = (o = {}) => Object.entries(CART_WOUNDED_IN_YARD).map(([id, p]) => N(id, p, { group: "aid", down: true, yaw: 0, ...(o[id] || {}) }));
// 冬瓜搁的墙根：被子顺着东墙、头朝北
const WALL_ROOT = Pt(A.wallRootDonggua.x, A.wallRootDonggua.z);
const HOLE_A = A.holes[0];
const HoleA = (u, v = 0) => { const p = HoleWorld(HOLE_A, u, v); return Pt(p.x, p.z); };
const CHAMBER_A = HoleA(HOLE_A.rampM + HOLE_A.chamber.d / 2);
/** 进洞 / 出洞走坡道（不从洞壁上翻）：lat = 横着偏多少。 */
const HoleIn = (target, lat = 0) => [Pt(HOLE_A.mouth.x + 1.2, HOLE_A.mouth.z + lat * 0.5), HoleA(0.3, lat * 0.5), HoleA(HOLE_A.rampM - 0.4, lat * 0.6), target];
const HoleOut = (target, lat = 0) => [HoleA(HOLE_A.rampM - 0.4, lat * 0.6), HoleA(0.2, lat * 0.5), Pt(HOLE_A.mouth.x + 1.0, HOLE_A.mouth.z - 1.0), target];
/** 15-3 厢房门口排队等的：两副担架、拿门板抬来的老乡、抱着烧伤孩子的娘。 */
const WAIT_LITTERS = Object.freeze([AY(14.2, 18.0), AY(16.8, 16.8)]);
const DoorQueue = () => [
  ...WAIT_LITTERS.flatMap((p, i) => [
    N(`WaitLitter${i + 1}`, p, { kind: "litter", name: i ? undefined : "等着进的担架", bearers: 0, yaw: 90, group: "queue" }),
    N(`WaitWounded${i + 1}`, p, { role: "wounded", group: "queue", down: true, lie: "along", onLitter: `WaitLitter${i + 1}`, yaw: 90 }),
  ]),
  C("BoardMan", AY(17.6, 19.4), { name: "拿门板抬人来的老乡", role: "doorBoard", group: "queue", face: PL.xiangDoor }),
  C("BurnedMother", AY(19.0, 18.0), { name: "抱着烧伤孩子的娘", role: "mother", group: "queue", face: PL.xiangDoor }),
  C("BurnedChild", AY(19.2, 17.2), { name: "胳膊烧黑了的孩子", kind: "child", role: "burned", group: "queue", face: PL.xiangDoor }),
];

// 18：三营守桥头 / 南头河堤后；工兵；北边田里的鬼子
const SPAN = (RB.southZ - RB.northZ) / RB.spans;
const PIER = (i) => Pt(RL.x + RB.pier.w / 2 + 0.6, RB.northZ + SPAN * i - 0.6);   // 桥墩东边河床上（工兵站的地方）
const LAST_COVER = Pt(PL.lastGroupCover.x, PL.lastGroupCover.z);
const MG18 = Pt(PL.ijaMg18.x, PL.ijaMg18.z);
const MG18_ARC = ArcTo(MG18, Pt(RL.x + 6, RB.northZ - 6), 14, 10);
const IJA_FIELD_FAR = [Pt(-74.6, 848), Pt(-70.2, 852.4), Pt(-75.4, 840), Pt(-66.8, 846.4), Pt(-73.0, 832), Pt(-69.4, 838)];
const IJA_FIELD_NEAR = [Pt(-73.4, 878), Pt(-69.0, 874), Pt(-75.2, 884), Pt(-65.6, 880), Pt(-71.8, 868), Pt(-67.2, 886)];
const IjaField18 = ({ mgDown = false, near = false } = {}) => [
  J("IjaMg18", MG18, { name: "路基脚那挺机枪", role: "machineGun", weapon: "Type11", group: "mg18", stance: "prone", aim: !mgDown, ...(mgDown ? { down: true } : { arc: MG18_ARC }), yaw: MG18_ARC.yawDeg, straight: true }),
  J("IjaMg18Loader", Off(MG18, 1.3, -0.9), { name: "副射手", role: "loader", group: "mg18", stance: "prone", face: LAST_COVER, straight: true, ...(mgDown ? { down: true } : {}) }),
  ...(near ? IJA_FIELD_NEAR : IJA_FIELD_FAR).map((p, i) => J(`IjaField${i + 1}`, p, { role: "rifleman", group: "field18", stance: i % 3 === 0 ? "prone" : "crouch", aim: true, face: LAST_COVER, straight: true, speed: 2.4 })),
];
/** 班长他们缩在桥北土坎后（18-4）。 */
const LAST_SLOTS = Object.freeze({ Luo: Off(LAST_COVER, -4.0, 0), Yaowa: Off(LAST_COVER, -1.6, 0.4), HeYoutian: Off(LAST_COVER, 0.8, 0), Squad1: Off(LAST_COVER, 3.2, 0.5), Squad2: Off(LAST_COVER, 5.6, 0) });
const LEVEE_3RD = [FOXHOLE(-75), FOXHOLE(-67), FOXHOLE(-60)];
const Levee3rd = () => LEVEE_3RD.map((p, i) => N(`Levee3rd_${i + 1}`, p, { name: i ? undefined : "三营兵", role: "rifleman3rd", group: "levee3rd", stance: "crouch", aim: true, face: MG18, climb: true }));

// ---------------------------------------------------------------------------
// 关键帧

function Keyframes() {
  const K = [];
  const Add = (kf) => K.push(kf);

  // ======================= 11 冒着炮出村南口 =======================
  const s11 = { stage: 11, stageTitle: "出村南口" };
  const c111 = CartOn(7);
  const p111 = Pt(L1218_SPAWN.x, L1218_SPAWN.z);
  Add({
    id: "11-1", ...s11, name: "出胡同口",
    player: { x: p111.x, z: p111.z, yawDeg: 180, pitchDeg: -2, stance: "stand" },
    what: "全班冒着炮冲出窄胡同，顺子最后一个，身后一发炮落在胡同里；老耿车停村南口外，黑子一炸一跳。",
    next: { text: "跟车往南", x: CL(30).x, z: CL(30).z, radiusM: 4 },
    how: ["全班冒炮冲出窄胡同，顺子最后一个出胡同口，身后一发炮落在胡同里；庄子里一排排落炮，草顶烧着", "老耿的车停在村南口外，黑子一炸一跳，老耿拽着笼头",
      "往南看：一条土路穿过麦地接上官道，官道尽头是北沙河村的树和院墙，沟口那一带有兵在动", "担架员把冬瓜和另外两个肚子挨了枪的往车板上搁（冬瓜靠车尾）"],
    notes: `村南口 (${VS.x},${VS.z}) 是 0610 窄胡同出村的地方；土路从这里往南 ${R1(D_JUNCTION)} m 到交叉口 (${L1218_JUNCTION.x},${L1218_JUNCTION.z}) 接官道。车停在口外的土路上朝南；三副担架横搁在车板上（ride 挂在 GengCart 上，车板顶 1.025 m），冬瓜靠车尾。`
      + "百姓一律程序化身体（body procedural）。",
    signals: [],
    units: [
      ...CartGroup(c111, { gengFace: c111.heizi }),
      N("Bearer1", CartWorld(c111.cart, c111.yaw, { x: -1.6, z: 0.9 }), { face: c111.cart }),
      N("Bearer2", CartWorld(c111.cart, c111.yaw, { x: 1.6, z: 0.9 }), { face: c111.cart }),
      N("Luo", Off(VS, -1.6, 4.6), { face: CL(20) }),
      N("Yaowa", Off(VS, 3.2, 5.6), { face: CL(20) }),
      N("HeYoutian", Off(VS, -2.0, 6.8), { face: CL(20) }),
      N("Squad1", Off(VS, 2.0, 3.8), { face: CL(20), guess: true }),
      N("Squad2", Off(VS, 2.4, 8.6), { face: CL(20), guess: true }),
      N("LiuWencai", Off(VS, 1.6, 1.6), { face: p111 }),
      C("Nier", Off(VS, -1.8, 8.4), { face: c111.cart }),
    ],
    pois: [POI.laneShell(), POI.villageFire(), POI.beishahe()],
  });

  const c112 = CartOn(13);
  const p112 = Off(VS, 1.4, 8.2);
  Add({
    id: "11-2", ...s11, name: "往北沙河撤",
    player: { x: p112.x, z: p112.z, yawDeg: Yaw(p112, c112.cart), pitchDeg: -6, stance: "stand" },
    what: "顺子爬上车板掖好冬瓜的单被，凑耳边：冬瓜，撑到。班长：往北沙河撤！七二七团在那！",
    next: { text: "跟车往北沙河", x: CL(40).x, z: CL(40).z, radiusM: 4 },
    how: ["担架员把冬瓜和另两个肚子挨枪的搁上车板，冬瓜靠车尾；顺子爬上车板把冬瓜身下单被扯平掖好，凑耳边——顺子：「冬瓜，撑到。到了就有军医。」冬瓜没应",
      "妮儿坐车尾沿", "班长：「往北沙河撤！七二七团在那！车拉伤员，跟斗走！」", "全班跟车往南跑；往南看得见土路、官道尽头北沙河村的树和院墙、沟口有兵在动；担架员往回跑接下一副（出画）"],
    notes: "妮儿坐车尾沿（ride：z +1.2、y 0.467、背对车头，程序化身体）。顺子「爬上车板」没有姿态：机位在车尾外、俯看车板。班长一行在车前后跑（intent 指向土路前头）。",
    signals: [],
    units: [
      ...CartGroup(c112, { nier: "tail", speed: 1.4 }),
      N("Bearer1", Off(VS, -1.0, 3.4), { face: Off(VS, 0, -5), to: Off(VS, 0, -5) }),
      N("Bearer2", Off(VS, 1.0, 3.0), { face: Off(VS, 0, -5), to: Off(VS, 0, -3.5) }),
      N("Luo", Off(VS, -1.4, 10.4), { face: p112, speed: 3.0, to: CL(36, 1.6) }),
      N("Yaowa", CL(22, -1.8), { yaw: c112.yaw, speed: 3.0, to: CL(40, -1.8) }),
      N("HeYoutian", CL(20, 2.0), { yaw: c112.yaw, speed: 3.0, to: CL(38, 2.0) }),
      N("Squad1", CL(24, 1.6), { yaw: c112.yaw, speed: 3.0, guess: true, to: CL(42, 1.6) }),
      N("Squad2", CL(5, -1.6), { yaw: c112.yaw, speed: 3.0, guess: true, to: CL(26, -1.6) }),
      N("LiuWencai", Off(VS, 2.6, 10.6), { face: c112.cart }),
    ],
    pois: [POI.villageFire(), POI.beishahe("objective")],
  });

  // ======================= 12 进北沙河村 =======================
  const s12 = { stage: 12, stageTitle: "进北沙河村" };
  const c121 = CartOn(40);
  const p121 = CartWorld(c121.cart, c121.yaw, { x: -1.0, z: 1.7 });
  Add({
    id: "12-1", ...s12, name: "路上",
    player: { x: p121.x, z: p121.z, yawDeg: c121.yaw, pitchDeg: -4, stance: "stand" },
    what: "车顺土路往南，一发炮打偏落在路边麦地。冬瓜压得很低：顺儿……钱……揣好没得？我舅的信……也在我这儿。",
    next: { text: "跟车进北沙河村", x: PL.plankNorth.x, z: PL.plankNorth.z - 3, radiusM: 4 },
    how: ["车顺土路往南（土路 → 交叉口 → 官道）；顺子在车尾扶车帮，刘文财在车另一边", "一发炮打偏落在路边麦地", "冬瓜：「……到了没得？」顺子：「快了！」",
      "冬瓜（压得很低）：「顺儿……钱……揣好没得？」顺子（隔着衣服按胸口）：「揣到的。」冬瓜（手在自己胸口摸了摸）：「我舅的信……也在我这儿。……莫跟别个讲。」刘文财抬眼看了顺子一下，没吭声", "任务字：跟车进北沙河村"],
    notes: `土路宽 ${RD.dirt.halfW * 2} m、压低 ${Math.round(RD.dirt.lower * 100)} cm，两边返青麦地；打偏的那发炮在 (${PL.fieldShell.x},${PL.fieldShell.z})。班长他们在车前头走。`,
    signals: [],
    units: [
      ...CartGroup(c121, { nier: "tail", speed: 1.4 }),
      N("LiuWencai", CartWorld(c121.cart, c121.yaw, { x: 1.1, z: 0.6 }), { yaw: c121.yaw, speed: 1.4 }),
      N("Luo", CL(56, 0.6), { yaw: CL(56).heading, speed: 2.0 }),
      N("Yaowa", CL(53, -1.0), { yaw: CL(53).heading, speed: 2.0 }),
      N("HeYoutian", CL(52, 1.0), { yaw: CL(52).heading, speed: 2.0 }),
      N("Squad1", CL(34, 1.2), { yaw: c121.yaw, speed: 2.0, guess: true }),
      N("Squad2", CL(32, -1.2), { yaw: c121.yaw, speed: 2.0, guess: true }),
    ],
    pois: [POI.fieldShell(), POI.villageFire(), POI.beishahe("objective")],
  });

  const c122 = CartOn(D_JUNCTION + 4);
  const p122 = CartWorld(c122.cart, c122.yaw, { x: -1.2, z: 2.2 });
  Add({
    id: "12-2", ...s12, name: "炮停",
    player: { x: p122.x, z: p122.z, yawDeg: Yaw(p122, PL.gengSmoke), pitchDeg: 4, stance: "stand" },
    what: "身后炮停，两三秒后庄子里「轰」一声——按「看」：老耿家腾起黑烟。刘文财：狗日的进了老耿家了！",
    next: { text: "跟车进北沙河村", x: PL.plankNorth.x, z: PL.plankNorth.z - 3, radiusM: 4 },
    how: ["身后炮停，静得出奇。两三秒后庄子里「轰」一声，屏幕出「看」的按键（美末式）：按了视角转去看老耿家腾起黑烟，不按三秒消失",
      "刘文财：「狗日的进了老耿家了！」顺子：「莫看了！走！」", "老耿回头看一眼烟，扬鞭", `车刚拐上官道（交叉口在 (${L1218_JUNCTION.x},${L1218_JUNCTION.z})）`],
    notes: "「看」的按键是美末式提示（POI GengSmoke 标在老耿家院子）。往北回头看：耿家庄的南墙和窄胡同口，往南看：官道尽头沟口那一带有兵在动。",
    signals: [],
    units: [
      ...CartGroup(c122, { nier: "tail", gengFace: PL.gengSmoke }),
      N("LiuWencai", CartWorld(c122.cart, c122.yaw, { x: 1.2, z: 1.0 }), { face: PL.gengSmoke }),
      N("Luo", CL(D_JUNCTION + 18, 0.8), { yaw: CL(D_JUNCTION + 18).heading, speed: 2.0 }),
      N("Yaowa", CL(D_JUNCTION + 15, -1.0), { yaw: CL(D_JUNCTION + 15).heading, speed: 2.0 }),
      N("HeYoutian", CL(D_JUNCTION + 14, 1.0), { yaw: CL(D_JUNCTION + 14).heading, speed: 2.0 }),
      N("Squad1", CL(D_JUNCTION - 2, 1.3), { yaw: c122.yaw, guess: true }),
      N("Squad2", CL(D_JUNCTION - 4, -1.3), { yaw: c122.yaw, guess: true }),
    ],
    pois: [POI.gengSmoke(), POI.ditch()],
  });

  // 12-3 沟口：哨兵盘问、二营连长；12-4 黑子不走、妮儿牵它过板桥、钢盔冒头
  const c123 = CartOn(ArcOf(CART_LINE, PL.ditchNorth) - 2.2 - HITCH_M);
  const sentry = Pt(PL.sentry.x, PL.sentry.z), captain123 = Pt(PK.x, PK.toZ + 1.3);
  const p123 = Off(PL.ditchNorth, 1.6, -1.2);
  const BranchMen = () => [
    N("Branch1", Pt(90.2, LineZAtX(AT.line, 90.2) + 4.6), { name: "二营兵（添树枝）", role: "rifleman2nd", weapon: null, face: Pt(90.2, LineZAtX(AT.line, 90.2) + 1) }),
    N("Branch2", Pt(112.0, LineZAtX(AT.line, 112.0) + 5.4), { role: "rifleman2nd", weapon: null, face: Pt(112.0, LineZAtX(AT.line, 112.0) + 1) }),
  ];
  Add({
    id: "12-3", ...s12, name: "沟口",
    player: { x: p123.x, z: p123.z, yawDeg: Yaw(p123, sentry), pitchDeg: -4, stance: "stand" },
    what: "官道到头一道比人深的沟，板桥、杂木，二营的兵还在添树枝。哨兵：站到！哪部分的？",
    next: { text: "过板桥进村", x: PL.plankSouth.x, z: PL.plankSouth.z + 3, radiusM: 3 },
    how: ["官道到头一道比人深的沟，把路齐齐截断，沟南沿堆着枣树枝和杂木，只留门板搭的板桥；二营的兵还在添树枝，沟后是战壕和铁丝网",
      "哨兵（端枪）：「站到！哪部分的？」班长：「前头撤下来的！车上是伤兵！后头鬼子撵过来了，还有小铁车！」",
      "二营连长（扫一眼车上）：「晓得。沟就是挖给铁王八的。」（冲身后）「去，喊工兵把官道桥炸了！」（冲班长）「伤兵往村西南头送，救护所在那。你们几个留到这儿，后头还有人要撤进来。」",
      "顺子（抢上一步）：「班长，我送冬瓜过去！」（班长看他一会儿，又看刘文财）班长：「文财，你跟到他。送到了，两个都给老子回来。」"],
    notes: `村口反坦克沟深 ${R1(VL.y - AT.floorY)} m、顶宽 ${AT.topW} m（x ${AT.line[0].x}…${AT.line[AT.line.length - 1].x}），沟南沿堆杂木；板桥宽 ${PK.w}、长 ${PK.toZ - PK.fromZ}，底下垫土墩（白盒：演员站得上桥面）。`
      + "七二七团的兵是 NRA 骨骼身体，用名字区分（二营哨兵、二营连长）。连长站在板桥南头，隔着沟说话。",
    signals: [],
    units: [
      ...CartGroup(c123, { nier: "tail", gengFace: sentry }),
      N("LiuWencai", CartWorld(c123.cart, c123.yaw, { x: 1.3, z: 1.4 }), { face: sentry }),
      N("Luo", Off(PL.plankNorth, -1.2, -1.7), { face: captain123 }),
      N("Yaowa", Off(PL.ditchNorth, -3.8, -3.0), { face: sentry }),
      N("HeYoutian", Off(PL.ditchNorth, 3.8, -3.4), { face: sentry }),
      N("Squad1", Off(PL.ditchNorth, -4.4, -5.8), { face: sentry, guess: true }),
      N("Squad2", Off(PL.ditchNorth, 4.6, -6.2), { face: sentry, guess: true }),
      N("Sentry", sentry, { aim: true, face: p123 }),
      N("Captain", captain123, { face: c123.cart, from: MS(10, 0.6) }),
      ...BranchMen(),
      ...Ditch727({ aim: false, skip: new Set(["S727_E3", "S727_E4"]) }),
    ],
    pois: [POI.ditch("objective"), POI.abatis()],
  });

  const c124 = CartOn(ArcOf(CART_LINE, Pt(PK.x, PK.fromZ - 0.9)) - HITCH_M);
  const heizi124 = c124.heizi, nier124 = Pt(PK.x, PK.fromZ + 0.9);
  const p124 = Off(PL.ditchNorth, -2.8, 1.2);
  Add({
    id: "12-4", ...s12, name: "黑子不走",
    player: { x: p124.x, z: p124.z, yawDeg: Yaw(p124, nier124), pitchDeg: -8, stance: "stand" },
    what: "黑子到板桥头四腿一撑不走；妮儿溜下车捧住它的脸、脑门贴上去，攥笼头牵过板桥。身后村南口冒出钢盔。",
    next: { text: "跟车过板桥", x: PL.plankSouth.x, z: PL.plankSouth.z + 3, radiusM: 3 },
    how: ["黑子到板桥头四腿一撑不走，老耿抽它，它往后坐", "妮儿溜下车跑到黑子头前，捧住它的脸、脑门贴上去，攥笼头牵过板桥。从这起妮儿牵着黑子走最前头",
      "身后耿家庄村南口冒出两三顶钢盔，沟沿上二营机枪一响缩回去", "车跟着上板桥"],
    notes: `妮儿站在板桥北头的门板上（程序化身体，捧脸那一下预演里做）。钢盔在耿家庄村南口外 (${PL.helmetsAt.x},${PL.helmetsAt.z})，二营的机枪在沟口东段战壕西头 (${PL.mg727.x},${PL.mg727.z})，相距约 ${Math.round(Dist(PL.helmetsAt, PL.mg727))} m。`,
    signals: [],
    units: [
      ...CartGroup(c124, { gengSide: -1.3, gengFace: heizi124 }),
      C("Nier", nier124, { face: heizi124 }),
      N("LiuWencai", CartWorld(c124.cart, c124.yaw, { x: 1.3, z: 1.2 }), { face: heizi124 }),
      N("Luo", Off(PL.ditchNorth, 2.6, -0.2), { face: p124 }),
      N("Yaowa", Off(PL.ditchNorth, -4.0, -2.4), { face: PL.helmetsAt }),
      N("HeYoutian", Off(PL.ditchNorth, 4.0, -2.8), { face: PL.helmetsAt }),
      N("Squad1", Off(PL.ditchNorth, -4.2, -5.6), { face: PL.helmetsAt, guess: true }),
      N("Squad2", Off(PL.ditchNorth, 4.8, -6.0), { face: PL.helmetsAt, guess: true }),
      N("Sentry", sentry, { face: nier124 }),
      N("Captain", captain123, { face: PL.plankNorth }),
      ...BranchMen(),
      ...Ditch727({ skip: new Set(["S727_E3", "S727_E4"]) }),
      ...[Off(PL.helmetsAt, -0.8, -0.4), Off(PL.helmetsAt, 2.0, 0.4), Off(PL.helmetsAt, -3.2, 0.8)].map((p, i) => J(`Helmet${i + 1}`, p, { role: "rifleman", group: "helmets", stance: "crouch", aim: true, face: PL.plankMid, straight: true })),
    ],
    pois: [Poi("HeiziBalks", "黑子在板桥头不走", "poi", heizi124, 1.5), POI.helmets(), POI.ditch()],
  });

  // 12-5 穿村：官道 = 主街往东南；二营的兵扛门板往沟口跑、标语、枕木垛、教堂门口（不说话）
  const c125 = CartOn(D_MAIN0 + 50);
  const p125 = CartWorld(c125.cart, c125.yaw, { x: -1.1, z: 1.6 });
  const RUN_BACK = (s, lat) => { const p = MS(s, lat); return { at: p, yaw: R1(WrapDeg(p.heading + 180)) }; };
  const b1 = RUN_BACK(60, -1.6), b2 = RUN_BACK(69, 1.6), b3 = RUN_BACK(77, -1.2);
  Add({
    id: "12-5", ...s12, name: "穿村",
    player: { x: p125.x, z: p125.z, yawDeg: Yaw(p125, PL.churchGate), pitchDeg: -2, stance: "stand" },
    what: "官道就是主街，斜着往东南穿村：二营的兵扛门板、抱树枝往沟口跑；墙上大字标语；门口枕木垛；教堂门口有人背着老人往里进。",
    next: { text: "跟车去救护所", x: PL.southStreetCorner.x, z: PL.southStreetCorner.z, radiusM: 4 },
    how: ["官道就是村里的主街，斜着往东南穿过去；二营的兵扛门板、抱树枝迎面往沟口跑", "墙上刷着大字标语（「打倒日本帝国主义」之类）；门口码着铁路上拆来的枕木垛",
      "路过教堂门口，有人背着老人往里进", "不说话，自己走、跟车；一路看得见，不解释"],
    notes: `主街压低 ${Math.round(RD.mainStreet.lower * 100)} cm、半宽 ${RD.mainStreet.halfW} m。教堂（位置是创作）在官道西边、北街与中街之间，顺着官道斜摆，院门 (${PL.churchGate.x},${PL.churchGate.z}) 朝官道敞着。`
      + "标语与枕木垛是场景里的块（Slogan_DA1 / SleeperPile_DA1），POI 指过去。全是程序化身体。",
    signals: [],
    units: [
      ...CartGroup(c125, { nier: "lead", gengSide: -1.2, gengFace: PL.churchGateOut }),
      N("LiuWencai", CartWorld(c125.cart, c125.yaw, { x: 1.2, z: 1.0 }), { yaw: c125.yaw }),
      N("Board1", b1.at, { name: "二营兵（扛门板）", role: "boardCarrier", weapon: null, group: "boards", yaw: b1.yaw, speed: 3.0, to: Off(PL.plankSouth, 2.4, 1.8) }),
      N("Board2", b2.at, { role: "boardCarrier", weapon: null, group: "boards", yaw: b2.yaw, speed: 3.0, to: Off(PL.plankSouth, -3.0, 2.0) }),
      N("Branch3", b3.at, { name: "二营兵（抱树枝）", role: "branchCarrier", weapon: null, group: "boards", yaw: b3.yaw, speed: 3.0, to: Pt(112.0, LineZAtX(AT.line, 112.0) + 5.4) }),
      C("ElderCarrier", PL.churchGateOut, { name: "背着老人往里进的", role: "carryingElder", group: "church", face: ChurchAt(CH.gate.s, CH.d0 + 4) }),
      C("ChurchKeeper", ChurchAt(CH.gate.s + 2.0, CH.d0 + 1.4), { name: "门边张罗的", group: "church", face: PL.churchGateOut }),
      C("ChurchIn2", ChurchAt(CH.gate.s - 1.8, CH.d0 - 1.0), { role: "refugeeWithBundle", group: "church", face: ChurchAt(CH.gate.s, CH.d0 + 4) }),
    ],
    pois: [POI.boards(), POI.slogan(), POI.sleepers(), POI.church()],
  });

  // 12-6 南街口：顺官道往东南望得见河、官道桥，几个兵抱着东西往桥上跑；车往西拐进南街
  const c126 = CartOn(D_CORNER + 2.6);
  const p126 = Pt(PL.southStreetCorner.x, PL.southStreetCorner.z);
  const BRIDGE_RUNNERS = [GBDeck(16, -1.0), GBDeck(23, 0.9), GBDeck(29, 0.1)];
  Add({
    id: "12-6", ...s12, name: "南街口",
    player: { x: p126.x, z: p126.z, yawDeg: Yaw(p126, PL.guandaoBridgeMid), pitchDeg: 0, stance: "stand" },
    what: "南街口，顺官道往东南望得见河、官道桥，几个兵抱着东西往桥上跑。冬瓜：……过了河……就是县城嗦？",
    next: { text: "跟车去救护所", x: PL.aidGateOut.x, z: PL.aidGateOut.z, radiusM: 3 },
    how: ["南街口：顺官道往东南望得见河、官道桥，几个二营的兵抱着东西往桥上跑", "冬瓜：「……过了河……就是县城嗦？」顺子：「嗯。过了河就是。」", "车往西拐进南街", "妮儿牵着黑子走最前头"],
    notes: `南街口 (${PL.southStreetCorner.x},${PL.southStreetCorner.z}) 到官道桥中间 ${Math.round(Dist(PL.southStreetCorner, PL.guandaoBridgeMid))} m（场景生成器核过：桥面上的人看得见）。桥上的兵站在官道桥桥面（standOn 块，顶 ${GB.deckY}）。`,
    signals: [],
    units: [
      ...CartGroup(c126, { nier: "lead", gengSide: -1.2 }),
      N("LiuWencai", CartWorld(c126.cart, c126.yaw, { x: 1.2, z: 1.0 }), { yaw: c126.yaw }),
      ...BRIDGE_RUNNERS.map((p, i) => N(`BridgeRunner${i + 1}`, p, { name: i ? undefined : "二营兵（抱着东西往桥上跑）", role: "bridgeRunner", weapon: null, group: "bridgeRunners", yaw: GB_YAW, speed: 3.0, straight: true, climb: true })),
      N("BridgeRunner4", MS(MS_LEN - 9, 0.8), { role: "bridgeRunner", weapon: null, group: "bridgeRunners", yaw: MS(MS_LEN - 9).heading, speed: 3.0, straight: true }),
    ],
    pois: [POI.guandaoFar(), POI.aid()],
  });

  // 12-7 救护所：军医蹲下处理；冬瓜连单被搁墙根；隔壁塌墙那边女娃探出头；「天黑我就来」
  const blanket127 = WALL_ROOT, p127 = AY(31.6, 26.8), press127 = PressPose(blanket127, 0);
  const girl = HoleWorld(GY.hole, 0.5, 0), nier127 = AY(28.8, 31.6);
  Add({
    id: "12-7", ...s12, name: "救护所",
    player: { x: p127.x, z: p127.z, yawDeg: Yaw(p127, blanket127), pitchDeg: -14, stance: "stand" },
    what: "救护所院里躺满人。军医蹲下处理冬瓜：肚子上的，莫给他喝水。搁墙根。天黑了跟车送城里。顺子：我送！",
    next: { text: "回沟口", x: PL.trenchSquad.x, z: PL.trenchSquad.z, radiusM: 3 },
    how: ["救护所院里躺满人。军医满手是血，蹲下掀开冬瓜被角、撕开衣襟，抓一把纱布往伤口里塞（冬瓜疼得一挺），拿绷带一圈圈勒紧",
      "军医：「肚子上的，莫给他喝水。」（冲担架员）「搁墙根。天黑了跟车送城里，城里才开得了刀。」顺子：「天黑哪个送？」军医（已经去看下一个）：「哪个闲到哪个送。」顺子：「我送！」（刘文财看了他一眼）",
      "冬瓜连单被搁在墙根。隔壁塌了半截的墙那边，女娃家洞口探出一个跟妮儿差不多大的女娃，妮儿看着她",
      "冬瓜（嘴唇起壳）：「……水……」（顺子摘下水壶拧开，停住，又拧上）顺子：「先生说的，莫喝。」冬瓜（扯了一下嘴角）：「……这下好……你跟斗伤兵走……哪个管得到。」",
      "刘文财：「走了。班长等到的。」（顺子蹲着不动）刘文财（揪住他胳膊）：「顺儿。」顺子（冲冬瓜）：「天黑我就来。天黑我送你进城。」被刘文财拽出院门。任务字：回沟口"],
    notes: `冬瓜从这一帧起躺在自己那床单被上（BlanketDonggua，布料模拟），顺着东墙根 (${WALL_ROOT.x},${WALL_ROOT.z})、头朝北；墙根到洞口 ${R1(Dist(WALL_ROOT, HOLE_A.mouth))} m。车停在院门外门前空地 (${CPK.cart.x},${CPK.cart.z})、车头朝南，黑子在车辕里。`
      + "另外两个伤员卸在院里。军医蹲在冬瓜身边（CareMedicPress 的站位），看完去看下一个。女娃（程序化身体）站在她家洞的坡道里，只露上半身。",
    signals: [],
    units: [
      C("GengCart", CPK.cart, { yaw: CPK.yawDeg }),
      C("Heizi", CPK.heizi, { yaw: CPK.yawDeg }),
      C("Geng", Off(CPK.heizi, -1.4, 0.4), { face: CPK.heizi }),
      ...DongguaOnBlanket(blanket127, { yaw: 0 }),
      N("Doctor", press127, { stance: "crouch", yaw: press127.yawDeg, tending: "Donggua", to: A.doctorPost }),
      N("Bearer1", AY(29.0, 32.6), { face: blanket127 }),
      N("Bearer2", AY(30.2, 33.0), { face: blanket127 }),
      ...CartWoundedInYard(),
      C("Nier", nier127, { face: girl }),
      C("Girl", girl, { face: nier127 }),
      N("LiuWencai", AY(29.6, 29.0), { face: blanket127 }),
      ...AidPeople({ doctor: false }),
    ],
    pois: [POI.girlHole(), Poi("WallRoot", "冬瓜连单被搁在墙根", "poi", blanket127, 1.2), POI.trench("objective")],
  });

  // ======================= 13 沟口 =======================
  const s13 = { stage: 13, stageTitle: "沟口" };
  const p131 = PLAYER_TRENCH;
  const YardRest = () => [
    C("GengCart", CPK.cart, { yaw: CPK.yawDeg }), C("Heizi", CPK.heizi, { yaw: CPK.yawDeg }),
    ...DongguaOnBlanket(WALL_ROOT, { yaw: 0 }), ...CartWoundedInYard(),
    C("Geng", AY(28.8, 28.4), { face: WALL_ROOT }), C("Nier", AY(28.6, 31.8), { face: WALL_ROOT }),
    ...AidPeople(),
  ];
  Add({
    id: "13-1", ...s13, name: "回沟口",
    player: { x: p131.x, z: p131.z, yawDeg: Yaw(p131, IJA_MG1), pitchDeg: 0, stance: "stand" },
    what: "顺子、刘文财跳回沟口东段战壕挨着班长。追兵顺官道撵过来：耿家庄那伙步兵，两挺轻机枪压沟沿，掷弹筒追着战壕找人。",
    next: { text: "打坟头后露头的步兵", x: IJA_MG1.x, z: IJA_MG1.z - 2, radiusM: 5 },
    how: ["顺子、刘文财跳回沟口东段战壕挨着班长", "追兵顺官道撵过来：就是耿家庄撵出来那伙步兵，两挺轻机枪 + 掷弹筒，散在坟头后、田埂后",
      "机枪压沟沿，掷弹筒「嘭」追着战壕找人", "坟头后露头的步兵真打；机枪一扫就得缩头"],
    notes: `鬼子步兵散在沟北的坟头 G_N1…G_N5 与 z ${L1218_RIDGES[0].z} / ${L1218_RIDGES[2].z} 两道田埂后；两挺轻机枪趴在坟头背坡上（枪口压过坟顶）。`
      + `战壕底 ${TR.floorY}（深 ${TR.depth}），站在壕底眼睛越过北沿的堆土看得见坟头与田埂（场景生成器核过）。没有装甲车。`,
    signals: [],
    units: [...SquadInTrench(), ...Ditch727(), N("Sentry", SENTRY_FIGHT, { stance: "crouch", aim: true, face: IJA_MG1 }), N("Captain", TRENCH_W(72.6), { face: IJA_MG1, climb: true }), ...IjaNorth(), ...YardRest()],
    pois: [POI.graves(), POI.grenadier()],
  });

  const RUNNERS = [[Pt(93.4, 626.6), "stand", "nra"], [Pt(88.6, 616.0), "stand", "civ"], [Pt(96.2, 630.4), "stand", "nra"], [Pt(84.0, 620.4), "down", "civ"], [Pt(80.2, 606.2), "stand", "nra"], [Pt(102.6, 628.0), "stand", "civ"]];
  const Runner = (i, p, st, side, extra = {}) => (side === "civ"
    ? C(`Runner${i + 1}`, p, { role: "refugee", group: "runners", face: PL.plankNorth, ...(st === "down" ? { down: true } : {}), ...extra })
    : N(`Runner${i + 1}`, p, { name: i ? undefined : "撤下来的兵", role: "straggler", group: "runners", face: PL.plankNorth, ...(st === "down" ? { down: true } : {}), ...extra }));
  Add({
    id: "13-2", ...s13, name: "有人往沟口跑",
    player: { x: p131.x, z: p131.z, yawDeg: Yaw(p131, Pt(90, 620)), pitchDeg: 0, stance: "stand" },
    what: "三五个撤下来的兵和几个百姓从田里往沟口跑，有的倒在半路，有的扑上板桥爬过来。村子东南「轰」一声：官道桥炸了。",
    next: { text: "压住坟头后的鬼子", x: IJA_MG1.x, z: IJA_MG1.z - 2, radiusM: 5 },
    how: ["三五个撤下来的兵和几个百姓从田里往沟口跑，有的倒在半路，有的扑上板桥爬过来", "打到一半村子东南「轰」一声，房顶后头冲起一柱土烟",
      "二营的兵：「官道桥炸了！」顺子扭头看那股烟（低声）：「……桥。」刘文财：「看你妈啥子！打！」", "一时谁也过不去"],
    notes: "GuandaoBridgeBlown 从这一帧起（官道桥中间三跨没了、断木砸进河床）。跑的人从沟北西边的麦地斜着奔板桥；倒在半路的是程序化身体倒地（state down）。",
    signals: [SIG.guandaoBridgeBlown],
    units: [
      ...SquadInTrench({ face: Pt(90, 620) }), ...Ditch727(), N("Sentry", SENTRY_FIGHT, { stance: "crouch", aim: true, face: IJA_MG1 }), N("Captain", TRENCH_W(72.6), { face: IJA_MG1 }), ...IjaNorth(),
      ...RUNNERS.map(([p, st, side], i) => Runner(i, p, st, side, { fromStraight: true, from: Off(p, -14, -10) })),
      N("Crawler", Pt(PK.x, PK.fromZ + 1.6), { name: "扑上板桥爬过来的", role: "straggler", group: "runners", stance: "prone", face: PL.plankSouth }),
      ...YardRest(),
    ],
    pois: [POI.runners(), POI.guandaoBlown(), POI.ditch()],
  });

  const RunnersAfter = () => [
    Runner(0, Pt(PK.x, PK.toZ - 0.5), "stand", "nra", { stance: "prone", face: PL.planesFrom }), Runner(1, Pt(96.4, LineZAtX(AT.line, 96.4) + 5.0), "stand", "civ", { stance: "prone", face: PL.planesFrom }),
    Runner(2, RUNNERS[2][0], "down", "nra"), Runner(3, RUNNERS[3][0], "down", "civ"),
  ];
  Add({
    id: "13-3", ...s13, name: "信号弹",
    player: { x: p131.x, z: p131.z, yawDeg: Yaw(p131, PL.planesFrom), pitchDeg: 12, stance: "prone" },
    what: "对面一颗信号弹拖着烟上天；几秒后东边嗡嗡声。有人喊：飞机！趴倒！",
    next: { text: "趴倒" },
    how: ["对面一颗信号弹拖着烟上天", "几秒后东边嗡嗡声", "有人喊：「飞机！趴倒！」屏幕出卧倒提示", "跑过来的人有的爬过了板桥，有的倒在沟北边"],
    notes: `信号弹从沟北 (${PL.flareAt.x},${PL.flareAt.z}) 打上天（预演里用信号弹特效），关键帧用 POI。玩家在壕里趴下。`,
    signals: [SIG.guandaoBridgeBlown],
    units: [
      ...SquadInTrench({ stance: "crouch", face: PL.planesFrom, aim: false }), ...Ditch727({ stance: "crouch" }), N("Sentry", SENTRY_FIGHT, { stance: "prone", face: IJA_MG1 }), N("Captain", TRENCH_W(72.6), { stance: "crouch", face: PL.planesFrom }), ...IjaNorth(),
      ...RunnersAfter(),
      ...YardRest(),
    ],
    pois: [POI.flare(), POI.planesEast()],
  });

  // ======================= 14 空袭，救护所院里松手 =======================
  const s14 = { stage: 14, stageTitle: "空袭" };
  const wave1At = Pt(160, LineZAtX(AT.line, 160));
  Add({
    id: "14-1", ...s14, name: "两拨飞机",
    player: { x: p131.x, z: p131.z, yawDeg: Yaw(p131, wave1At), pitchDeg: 10, stance: "prone" },
    what: "六架分两拨：第一拨三架顺村北沿战壕和沟口扔炸弹扫射，二营的兵一片片倒；第二拨三架掉头顺着村里的街扫、往院子里扔炸弹。",
    next: { text: "趴着别动" },
    how: ["六架分两拨。第一拨三架顺着村北沿战壕和沟口扔炸弹、扫射：二营的兵一片片倒，添树枝的被掀翻，杂木着火", "第二拨三架掉头顺着村里的街扫、往院子里扔炸弹，几处房顶着火",
      "壕里二营的兵倒了两个", "不趴不判失败"],
    notes: "飞机没有单位（预演里是 aircraft 轨），关键帧用两个 POI 标两拨。壕里的人都趴 / 蹲。",
    signals: [SIG.guandaoBridgeBlown],
    units: [
      ...SquadInTrench({ stance: "crouch", aim: false, face: wave1At }), ...Ditch727({ stance: "crouch", aim: false, down: new Set(["S727_E2", "S727_W2"]) }),
      N("Sentry", SENTRY_FIGHT, { stance: "prone", face: IJA_MG1 }), N("Captain", TRENCH_W(72.6), { stance: "crouch", face: wave1At }), ...IjaNorth(),
      ...RunnersAfter(),
      ...YardRest(),
    ],
    pois: [POI.wave1(), POI.wave2()],
  });

  // 14-2 往回跑：顺子不等人喊就往村里跑；官道 → 南街 → 出村小路；南街上看得见挨炸的洞
  const hitRay = [YardAt(BY.id, YARD[BY.id].s1, BY.hole.mouthD + 0.6), YardAt(BY.id, YARD[BY.id].s1 + 30, BY.hole.mouthD + 0.6)];
  const southSeg = RD.southSt.line.slice(3, 5);
  const p142 = Off(LineHit(hitRay[0], hitRay[1], southSeg[0], southSeg[1]), 0, 0.6);
  const womanAt = RoadAt(RD.southSt.line, ArcOf(RD.southSt.line, p142) - 7.4, 1.0), childAt = Off(womanAt, -0.5, 0.9);
  const liu142 = MS(D_CORNER - D_MAIN0 - 6, 0.8);
  Add({
    id: "14-2", ...s14, name: "往回跑",
    player: { x: p142.x, z: p142.z, yawDeg: Yaw(p142, PL.bombedHole), pitchDeg: -6, stance: "stand" },
    what: "飞机往村里扫，顺子不等人喊就爬起来往村里跑。班长没拽住：文财！跟到他！南街上躺着人，那家院里的洞挨了一颗。",
    next: { text: "去救护所", x: PL.aidGateOut.x, z: PL.aidGateOut.z, radiusM: 3 },
    how: ["飞机往村里扫，顺子不等人喊就爬起来往村里跑；班长一把没拽住：「文财！跟到他！」", "顺着着火的官道 → 南街 → 出村小路往村西南头跑（自己跑）",
      "街上躺着人，一个女人拖着一个孩子往墙根爬", "南街边那家院里的洞挨了一颗，炸成一个坑（塌了的端墙那边看得见）；刘文财跟在后头"],
    notes: `DugoutBombed 从这一帧起。玩家摆在南街 (${p142.x},${p142.z})，透过挨炸那家塌了的端墙看得见洞口 (${PL.bombedHole.x},${PL.bombedHole.z})（场景生成器核过的那条视线附近）。女人和孩子是程序化身体。`,
    signals: [SIG.guandaoBridgeBlown, SIG.dugoutBombed],
    units: [
      ...SquadInTrench({ stance: "crouch", aim: true, face: IJA_MG1, skip: new Set(["LiuWencai"]) }), ...Ditch727({ down: new Set(["S727_E2", "S727_W2"]) }), N("Captain", TRENCH_W(72.6), { face: IJA_MG1 }), ...IjaNorth(),
      N("LiuWencai", liu142, { face: p142, speed: 3.2 }),
      C("StreetWoman", womanAt, { name: "拖着孩子往墙根爬的女人", role: "mother", group: "street", stance: "crouch", face: Off(womanAt, 0, -3) }),
      C("StreetChild", childAt, { kind: "child", role: "dragged", group: "street", down: true, yaw: 0 }),
      N("StreetDown1", RoadAt(RD.southSt.line, ArcOf(RD.southSt.line, p142) - 16, -0.8), { role: "rifleman2nd", group: "street", down: true, yaw: 60, guess: true }),
      C("StreetDown2", RoadAt(RD.southSt.line, ArcOf(RD.southSt.line, p142) + 5.5, 0.6), { role: "refugee", group: "street", down: true, yaw: 120 }),
      ...YardRest(),
    ],
    pois: [POI.bombedHole(), POI.streetDown(womanAt), POI.planesStreet(), POI.aid()],
  });

  // 14-3 院门口：黑子挨了一梭，连车带驴翻在地上，后腿一下一下地蹬；顺子在车边停了一步
  const heiziDown = Off(CPK.heizi, 0.2, 0.9);
  const p143 = Off(PL.aidGateOut, 1.8, -2.9);
  const YardChaos = ({ blanket = WALL_ROOT, blanketYaw = 0, gengAt = AY(26.2, 26.6), gengBody = "procedural", wounded1 = AY(25.4, 25.6), first = false, dragSolo = false } = {}) => [
    C("Heizi", heiziDown, { down: true, yaw: CPK.yawDeg - 40 }),
    ...DongguaOnBlanket(blanket, { yaw: blanketYaw, dragSolo }),
    C("Geng", gengAt, { face: HOLE_A.mouth, body: gengBody }),
    N("Wounded1", wounded1, { group: "aid", down: true, yaw: 90 }),
    N("Wounded2", CART_WOUNDED_IN_YARD.Wounded2, { group: "aid", down: true, yaw: 0 }),
    N("Doctor", AY(14.6, 32.2), { face: A.holes[1].mouth, ...(first ? { path: [AY(15.4, 23.6), AY(14.6, 32.2)] } : {}) }),
    N("DoorGuard", AY(8.6, 31.8), { face: A.holes[1].mouth }),
    N("AidHelper", AY(12.0, 32.8), { name: "二营兵（往洞里拖人）", role: "helper2nd", weapon: null, face: A.holes[1].mouth, ...(first ? { path: [AY(15.2, 24.0), AY(15.0, 32.6), AY(12.0, 32.8)] } : {}) }),
    ...AidWounded({ skip: new Set([7]) }),
    // 沟口那边照旧顶着
    ...SquadInTrench({ stance: "crouch", aim: true, face: IJA_MG1, skip: new Set(["LiuWencai"]) }), ...Ditch727({ stance: "crouch", down: new Set(["S727_E2", "S727_W2"]) }), N("Captain", TRENCH_W(72.6), { face: IJA_MG1 }), ...IjaNorth(),
  ];
  Add({
    id: "14-3", ...s14, name: "院门口的驴",
    player: { x: p143.x, z: p143.z, yawDeg: Yaw(p143, heiziDown), pitchDeg: -12, stance: "stand" },
    what: "救护所门前，拴在车辕里的黑子挨了一梭，连车带驴翻在地上，后腿一下一下地蹬。顺子在车边停了一步。",
    next: { text: "进院找冬瓜", x: PL.aidGateIn.x, z: PL.aidGateIn.z, radiusM: 2 },
    how: ["救护所门前，拴在车辕里的黑子挨了一梭，连车带驴翻在地上，后腿一下一下地蹬", "顺子在车边停了一步", "（15C 妮儿画驴、五关「打死驴黑子那次」要接得上）", "院里乱成一团；刘文财跟在后头"],
    notes: `CartOverturned 从这一帧起：翻倒的车（随信号体块）在门前空地 (${CPK.overturned.x},${CPK.overturned.z})，立着的车 GengCart 从这一帧起不再摆；黑子 state down，倒在车辕前头。`,
    signals: [SIG.guandaoBridgeBlown, SIG.dugoutBombed, SIG.cartOverturned],
    units: [
      ...YardChaos({ first: true }),
      N("LiuWencai", Pt(EXIT_X, GYD.box.minZ + 3.4), { yaw: 180, speed: 3.2 }),
      C("Nier", AY(29.2, 31.8), { face: WALL_ROOT }),
    ],
    pois: [POI.heizi(), POI.planesDive()],
  });

  // 14-4 揪被角：老耿「冬瓜！把他弄过来！」；玩家揪一角、妮儿揪另一角，往洞口拖
  const dragYaw = Yaw(WALL_ROOT, HOLE_A.mouth);
  const b144 = Off(WALL_ROOT, -0.4, -0.3);
  const p144 = BlanketCorner(b144, dragYaw, 1), nier144 = BlanketCorner(b144, dragYaw, -1);
  const liuGate = Off(PL.aidGateIn, 0.6, -1.5), liuSky = Off(PL.aidGateIn, 30, -20);
  Add({
    id: "14-4", ...s14, name: "揪被角",
    player: { x: p144.x, z: p144.z, yawDeg: dragYaw, pitchDeg: -14, stance: "crouch" },
    what: "院里乱成一团，冬瓜一个人躺在墙根露天里。老耿背着伤员往洞口挪：冬瓜！把他弄过来！顺子揪单被一角，妮儿一声不吭揪另一角。",
    next: { text: "把冬瓜拖进洞里", x: HOLE_A.mouth.x, z: HOLE_A.mouth.z, radiusM: 1.6 },
    how: ["院里乱成一团：能动的往洞里钻；冬瓜一个人躺在墙根露天里", "老耿背着另一个伤员往洞口挪，回头喊：「冬瓜！把他弄过来！」任务字：把冬瓜拖进洞里",
      "刘文财在院门口朝天上打", "顺子揪单被一角（同 02 拖被子同一个键、同一个姿势，手上没枪）；妮儿一声不吭揪另一角，往十几步外的洞口拖。飞机掉头，声音越来越尖"],
    notes: `墙根到洞口 ${R1(Dist(WALL_ROOT, HOLE_A.mouth))} m（十几步），中间没有挡的。妮儿这一帧换骨骼身体（body rig）：拖被子要放 PvBlanketDragL/R、被角握点要攥在手上。老耿「背着伤员」没有姿态：伤员倒在他身边。`,
    signals: [SIG.guandaoBridgeBlown, SIG.dugoutBombed, SIG.cartOverturned],
    units: [
      ...YardChaos({ blanket: b144, blanketYaw: dragYaw }),
      C("Nier", nier144, { body: "rig", stance: "crouch", face: HOLE_A.mouth }),
      N("LiuWencai", liuGate, { aim: true, face: liuSky }),
    ],
    pois: [POI.hole("objective"), POI.planesDive()],
  });

  // 14-5 松手：顺子扑倒、被角脱手；妮儿没趴还攥着另一角一个人往后拽；弹着点从冬瓜身上扫过
  const b145 = PointBeside([WALL_ROOT, HOLE_A.mouth], 3.4, 0), b145p = Pt(b145.x, b145.z);
  const p145 = BlanketCorner(b145p, dragYaw, 1, 1.6, 1.0), nier145 = BlanketCorner(b145p, dragYaw, -1);
  Add({
    id: "14-5", ...s14, name: "松手",
    player: { x: p145.x, z: p145.z, yawDeg: Yaw(p145, nier145), pitchDeg: 6, stance: "prone" },
    what: "顺子本能扑倒，被角脱手；妮儿没趴，一个人往后拽；弹着点从冬瓜身上扫过去，擦着妮儿过去。院门口的刘文财脸正冲这边。",
    next: { text: "把冬瓜拖进洞里", x: HOLE_A.mouth.x, z: HOLE_A.mouth.z, radiusM: 1.6 },
    how: ["松手（收控制两三秒、慢动作）：俯冲声压到头顶，一串弹着点顺院子地皮追过来，顺子本能扑倒，被角脱手",
      "妮儿没趴（听不见），还攥着另一角一个人往后拽", "冬瓜被拽着挪了一点挪不动，弹着点从他身上扫过去（大腿和腰侧，没当场死），擦着妮儿过去", "院门口的刘文财脸正冲着这边"],
    notes: "测：问「冬瓜怎么挨的枪」，答得出「顺子松了手」才算看懂。妮儿骨骼身体（body rig）攥着被角、脸朝顺子；被子单位写了 dragSolo: true（§5.6：玩家那角不再取镜像、落地，只剩妮儿攥着一个角）。",
    signals: [SIG.guandaoBridgeBlown, SIG.dugoutBombed, SIG.cartOverturned],
    units: [
      ...YardChaos({ blanket: b145p, blanketYaw: dragYaw, gengAt: AY(24.4, 25.2), wounded1: AY(23.6, 24.2), dragSolo: true }),
      C("Nier", nier145, { body: "rig", stance: "crouch", face: p145 }),
      N("LiuWencai", liuGate, { face: b145p }),
    ],
    pois: [POI.bullets(b145p), Poi("DongguaHit", "冬瓜挨了枪，被子上洇开一片血", "poi", b145p, 1.2), POI.hole("objective")],
  });

  // 14-6 老耿跑回来，和顺子一人一角把冬瓜拖进洞；刘文财把妮儿捞走；飞机往东飞走
  const b146 = HoleA(1.0), holeYaw = Yaw(HOLE_A.mouth, HoleA(2));
  const p146 = BlanketCorner(b146, holeYaw, 1, 1.25, 0.6), geng146 = BlanketCorner(b146, holeYaw, -1, 1.25, 0.6);
  Add({
    id: "14-6", ...s14, name: "拖进洞里",
    player: { x: p146.x, z: p146.z, yawDeg: holeYaw, pitchDeg: -16, stance: "crouch" },
    what: "老耿扔下背上的伤员跑回来，和顺子一人一角把冬瓜拖进洞；刘文财冲过来把妮儿捞走。飞机往东飞走。",
    next: { text: "把冬瓜拖进洞里", x: CHAMBER_A.x, z: CHAMBER_A.z, radiusM: 1.4 },
    how: ["老耿扔下背上的伤员跑回来，和顺子一人一角把冬瓜拖进洞", "刘文财冲过来把妮儿捞走", "飞机往东飞走", "院里的人一个个从洞里探出头"],
    notes: "老耿这一帧换骨骼身体（body rig，PvBlanketDrag 另一角）；妮儿也还是骨骼身体（刘文财捞她，没有抱人的姿态：并排站）。被子在坡道上（洞口往里 1 m）。",
    signals: [SIG.guandaoBridgeBlown, SIG.dugoutBombed, SIG.cartOverturned],
    units: [
      ...YardChaos({ blanket: b146, blanketYaw: holeYaw, gengAt: geng146, gengBody: "rig", wounded1: AY(24.6, 24.8) }).map((u) => (u.id === "Geng" ? Mod(u, { stance: "crouch", path: [Pt(HOLE_A.mouth.x + 1.4, HOLE_A.mouth.z), HoleA(0.4), geng146] }) : u)),
      N("LiuWencai", AY(27.4, 30.6), { face: p146 }),
      C("Nier", AY(26.6, 31.6), { body: "rig", face: p146 }),
    ],
    pois: [POI.hole("objective"), POI.planesGone()],
  });

  // ======================= 15 洞里，抬到厢房门口 =======================
  const s15 = { stage: 15, stageTitle: "洞里" };
  const b151 = CHAMBER_A, yaw151 = Yaw(CHAMBER_A, HoleA(HOLE_A.rampM + HOLE_A.chamber.d));
  const press151 = PressPose(b151, yaw151);
  const p151 = HoleA(HOLE_A.rampM + 0.45, -0.8), liu151 = HoleA(HOLE_A.rampM + 0.45, 0.9), nier151 = HoleA(HOLE_A.rampM + HOLE_A.chamber.d - 0.45, -1.15);
  const DOCTOR_YARD = AY(16.6, 18.2);
  const HoleRest = () => [
    C("Heizi", heiziDown, { down: true, yaw: CPK.yawDeg - 40 }),
    N("Wounded1", AY(24.6, 24.8), { group: "aid", down: true, yaw: 90 }), N("Wounded2", CART_WOUNDED_IN_YARD.Wounded2, { group: "aid", down: true, yaw: 0 }),
    ...AidPeople({ doctorAt: DOCTOR_YARD, doctorFace: Off(DOCTOR_YARD, 0, -4), doctorStance: "stand" }),
  ];
  const S15_SIG = [SIG.guandaoBridgeBlown, SIG.dugoutBombed, SIG.cartOverturned, SIG.raidAftermath];
  Add({
    id: "15-1", ...s15, stageLabel: "15A", name: "洞里",
    player: { x: p151.x, z: p151.z, yawDeg: Yaw(p151, b151), pitchDeg: -18, stance: "crouch" },
    what: "洞顶漏下一条红天。刘文财：你松你妈啥子手！冬瓜：龟儿子……手恁个滑……八个……抵了。顺子：抵个锤子……",
    next: { text: "把冬瓜抬到厢房门口", x: PL.xiangDoor.x + 2.2, z: PL.xiangDoor.z, radiusM: 2 },
    how: ["洞顶漏下一条红天。老耿跪着捡起毛巾按回伤口", "刘文财：「你松你妈啥子手！」（顺子说不出话）", "冬瓜（睁眼看着顺子）：「龟儿子……手恁个滑……」（喘了好几口）冬瓜：「……八个……抵了。」顺子：「抵个锤子……到了汉口，你拿钱还老子。」",
      "刘文财把妮儿推到老耿身边：「老人家，你牵到她。我来。」揪住被子另一头，老耿等他揪稳才松手"],
    notes: `洞内一小间 ${HOLE_A.chamber.w}×${HOLE_A.chamber.d} m、底 ${H.holeFloorY}、净高 ${R1(H.holeFloorY * -1 + VL.y - A.roofT + 0)}，洞顶有一条 ${HOLE_A.slitM} m 的缝（漏红天）。老耿「跪着」按毛巾：这一帧换骨骼身体（body rig，预演放 CareMedicPress；程序化身体蹲不下）。`
      + "RaidAftermath 从这一帧起（街上、门前、路头上盖着席子的人）。",
    signals: S15_SIG,
    units: [
      ...DongguaOnBlanket(b151, { yaw: yaw151 }),
      C("Geng", press151, { body: "rig", stance: "crouch", yaw: press151.yawDeg, tending: "Donggua", path: [HoleA(HOLE_A.rampM - 0.4, -0.3), press151] }),
      N("LiuWencai", liu151, { stance: "crouch", face: p151, path: HoleIn(liu151, 0.8) }),
      C("Nier", nier151, { stance: "crouch", face: b151, path: HoleIn(nier151, -0.8) }),
      ...HoleRest(),
    ],
    pois: [POI.redSky(HoleA(HOLE_A.rampM + HOLE_A.chamber.d / 2 + 0.2)), POI.xiangDoor("objective")],
  });

  const b152 = AY(15.2, 22.6), yaw152 = Yaw(b152, PL.xiangDoor);
  const p152 = BlanketCorner(b152, yaw152, 1, 1.25, 0.6), liu152 = BlanketCorner(b152, yaw152, -1, 1.25, 0.6);
  Add({
    id: "15-2", ...s15, stageLabel: "15B", name: "抬到厢房门口",
    player: { x: p152.x, z: p152.z, yawDeg: yaw152, pitchDeg: -4, stance: "stand" },
    what: "顺子、刘文财一人一头连被子抬出洞，几十步到厢房门口。没有对白，天一点点黑。",
    next: { text: "抬到厢房门口", x: PL.xiangDoor.x + 2.2, z: PL.xiangDoor.z, radiusM: 1.6 },
    how: ["顺子、刘文财一人一头连被子把冬瓜抬出洞", "几十步到厢房门口（白盒院子小，只有十几米），没有对白", "天一点点黑，红褪成灰蓝", "老耿牵着妮儿跟在后头"],
    notes: "被子朝西北（厢房门），玩家在被头左角、刘文财右角（bearers 0，拽的人站位）。",
    signals: S15_SIG,
    units: [
      ...DongguaOnBlanket(b152, { yaw: yaw152, extra: { path: HoleOut(b152) } }),
      N("LiuWencai", liu152, { face: PL.xiangDoor, speed: 1.0, path: HoleOut(liu152, 0.8) }),
      C("Geng", Off(b152, 2.0, 1.4), { face: PL.xiangDoor, speed: 1.0, path: HoleOut(Off(b152, 2.0, 1.4), -0.4) }), C("Nier", Off(b152, 2.4, 2.4), { face: PL.xiangDoor, speed: 1.0, path: HoleOut(Off(b152, 2.4, 2.4), -0.8) }),
      ...HoleRest(),
    ],
    pois: [POI.xiangDoor("objective")],
  });

  const s15c = { stage: 15, stageTitle: "厢房门口" };
  const b153 = AY(12.6, 22.6), p153 = AY(12.4, 20.9), nier153 = AY(15.0, 23.4), liu153 = AY(16.2, 22.2), geng153 = AY(14.4, 25.6);
  const drawAt = Off(nier153, 0, 1.0);
  const DOCTOR_INSIDE = AY(4.8, 17.4);
  Add({
    id: "15-3", ...s15c, stageLabel: "15C", name: "等着进",
    player: { x: p153.x, z: p153.z, yawDeg: Yaw(p153, nier153), pitchDeg: -18, stance: "crouch" },
    what: "门口一副挨一副摆着等的。守门的兵：等到！里头满起了！妮儿在土里画驴、摆弹壳；刘文财：……犟。门里：下一副！",
    next: { text: "等着进厢房" },
    how: ["门口一副挨一副摆着等的：有兵，也有拿门板抬来的老乡，一个孩子胳膊烧黑了，他娘抱着他不出声。守门的兵：「等到！里头满起了！挤你妈啥子！」",
      "顺子放下冬瓜就去找守门的：「兄弟，让一哈，他等不得了……」守门的（一把推回来）：「哪个等得？等到！」顺子还要挤，刘文财从后头揪住他领子：「你挤进去他就活了？」顺子蹲回冬瓜头边，把他的手塞回被子里",
      "妮儿蹲着用树枝在土里画驴、拖着车，从衣兜掏出弹壳在驴旁边摆成一排。刘文财：「画的黑子嗦？」（她听不见，接着摆）刘文财（拈起一个弹壳掂了掂）：「一个壳子三四钱重，四五十个才一斤。收破烂的，一斤给你几个铜板……」（看着地上那头驴）「你攒到出嫁，也换不到一条驴腿。」",
      "妮儿把弹壳拿回来摆回原处。刘文财：「……犟。」老耿看着地上那头驴，把脸转开。门里有人：「下一副！」"],
    notes: "妮儿「蹲在地上画驴」：这一帧换骨骼身体（body rig，预演放 PvKneelDig 顶着；程序化身体蹲不下）。军医在厢房里头。黑子还倒在院门外（从院里看不见）。排队的担架、老乡、娘和孩子是程序化身体。",
    signals: S15_SIG,
    units: [
      ...DongguaOnBlanket(b153, { yaw: 0 }),
      C("Nier", nier153, { body: "rig", stance: "crouch", face: drawAt }),
      N("LiuWencai", liu153, { stance: "crouch", face: nier153 }),
      C("Geng", geng153, { face: Off(geng153, 4, 0) }),
      C("Heizi", heiziDown, { down: true, yaw: CPK.yawDeg - 40 }),
      N("Wounded1", AY(24.6, 24.8), { group: "aid", down: true, yaw: 90 }), N("Wounded2", CART_WOUNDED_IN_YARD.Wounded2, { group: "aid", down: true, yaw: 0 }),
      ...AidPeople({ doctorAt: DOCTOR_INSIDE, doctorFace: PL.xiangDoor, doctorStance: "stand" }).map((u) => (u.id === "DoorGuard" ? Mod(u, { yawDeg: Yaw(DOOR_GUARD, p153) }) : u)),
      ...DoorQueue(),
    ],
    pois: [POI.xiangDoor("objective"), Poi("NierDraw", "妮儿画的驴", "poi", drawAt, 0.8)],
  });

  // ======================= 16 过门槛 =======================
  const s16 = { stage: 16, stageTitle: "过门槛" };
  const p161 = Pt(X.box.maxX + 0.25, X.door.z), b161 = Pt(X.box.maxX + 2.05, X.door.z), liu161 = Pt(X.box.maxX + 3.9, X.door.z);
  const guard161 = AY(10.6, 21.6);
  Add({
    id: "16-1", ...s16, name: "门槛",
    player: { x: p161.x, z: p161.z, yawDeg: 90, pitchDeg: -22, stance: "stand" },
    what: "院里点起马灯。军医：又挨了？抬进来！表堵到门口！过门槛，冬瓜：脚……慢点。顺子：……有门槛。抬高点。",
    next: { text: "把冬瓜慢慢放下", x: A.dongguaInside.x, z: A.dongguaInside.z, radiusM: 1.2 },
    how: ["院里点起马灯。军医从一副担架边站起来，看见冬瓜被子上新洇的血：「又挨了？抬进来！表堵到门口！」", "顺子抬前头、刘文财抬后头往厢房进；门槛，镜头一低一抬，被子往一边歪",
      "冬瓜：「脚……慢点。」顺子：「……有门槛。抬高点。」（冬瓜最后一句话）", "屋里靠墙空地，按住键慢慢放"],
    notes: `顺子在被头（站在门槛上）、刘文财在被尾，被子在两人之间（bearers 0）。门槛是 ${X.threshold.h} m 高的块（AidXiangThreshold）。老耿和妮儿在院里等。`,
    signals: S15_SIG,
    units: [
      ...DongguaOnBlanket(b161, { yaw: 90, extra: { speed: 0.8 } }),
      N("LiuWencai", liu161, { yaw: 90, speed: 0.8 }),
      C("Geng", AY(16.8, 22.0), { face: p161 }), C("Nier", AY(16.0, 23.4), { face: p161 }),
      C("Heizi", heiziDown, { down: true, yaw: CPK.yawDeg - 40 }),
      N("Wounded1", AY(24.6, 24.8), { group: "aid", down: true, yaw: 90 }), N("Wounded2", CART_WOUNDED_IN_YARD.Wounded2, { group: "aid", down: true, yaw: 0 }),
      ...AidPeople({ doctorAt: AY(10.8, 16.0), doctorFace: p161, doctorStance: "stand" }).map((u) => (u.id === "DoorGuard" ? Mod(u, { x: guard161.x, z: guard161.z }) : u)),
      ...DoorQueue(),
    ],
    pois: [POI.xiangDoor("objective"), POI.threshold(), POI.dongguaInside()],
  });

  // ======================= 17 坐在门槛上 =======================
  const s17 = { stage: 17, stageTitle: "门槛上" };
  const inside = Pt(A.dongguaInside.x, A.dongguaInside.z);
  const press171 = PressPose(inside, 0);
  const geng171 = Pt(inside.x - 1.0, inside.z - 0.2), nier171 = AY(7.4, 20.6), liu171 = AY(5.4, 20.0), p171 = AY(7.2, 22.2);
  const Yard17 = () => [
    C("Heizi", heiziDown, { down: true, yaw: CPK.yawDeg - 40 }),
    N("Wounded1", AY(24.6, 24.8), { group: "aid", down: true, yaw: 90 }), N("Wounded2", CART_WOUNDED_IN_YARD.Wounded2, { group: "aid", down: true, yaw: 0 }),
  ];
  Add({
    id: "17-1", ...s17, name: "没了",
    player: { x: p171.x, z: p171.z, yawDeg: Yaw(p171, inside), pitchDeg: -26, stance: "stand" },
    what: "军医蹲下看伤口、摸脖子，停了一会儿：……没了。下一副！老耿把冬瓜身底下那床单被扯上来盖住他的脸。",
    next: { text: "（蹲到冬瓜身边）", x: A.thresholdSeat.x, z: A.thresholdSeat.z, radiusM: 0.8 },
    how: ["军医蹲下看伤口、摸脖子，停了一会儿：「……没了。」站起来冲门口吼：「下一副！表堵到门！」", "刘文财：「刚才过门槛，还在说话……」",
      "老耿把冬瓜身底下那床单被扯上来盖住他的脸", "妮儿站在门边看看这个大人的脸、又看看那个"],
    notes: "被子放在厢房里靠墙（dongguaInside），冬瓜 down、盖着脸从这一帧起就不动了。军医跪在被子边（CareMedicPress 的站位），看完回院里。老耿：这一帧换骨骼身体（body rig，预演放 PvKneelPullBlanket 把被子拉上来盖脸）。",
    signals: S15_SIG,
    units: [
      ...DongguaOnBlanket(inside, { yaw: 0 }),
      N("Doctor", press171, { stance: "crouch", yaw: press171.yawDeg, tending: "Donggua", to: DOCTOR_YARD }),
      C("Geng", geng171, { body: "rig", stance: "crouch", face: inside, tending: "Donggua" }),
      C("Nier", nier171, { face: geng171 }),
      N("LiuWencai", liu171, { face: inside }),
      N("DoorGuard", DOOR_GUARD, { face: Off(DOOR_GUARD, 5, 1) }), N("AidHelper", HELPER, { weapon: null, role: "helper2nd", face: Off(HELPER, 4, 0.8) }), ...AidWounded(), ...Yard17(),
    ],
    pois: [POI.threshold(), Poi("DongguaDead", "盖着脸的冬瓜", "poi", inside, 1.2)],
  });

  const seat = Pt(A.thresholdSeat.x, A.thresholdSeat.z);
  const PASSING = [Pt(EXIT_X + 0.4, A.gate.z + 0.5), Pt(EXIT_X - 0.8, A.gate.z + 3.9), Pt(EXIT_X + 0.8, A.gate.z + 7.3)];
  const Passing2nd = (shift = 0) => PASSING.map((p, i) => N(`Passing${i + 1}`, Off(p, 0, shift), { name: i ? undefined : "二营兵（跑过院门外）", role: "rifleman2nd", group: "passing2nd", yaw: 180, speed: 3.0, to: PL.villageSouthEnd }));
  const Yard172 = () => [
    ...DongguaOnBlanket(inside, { yaw: 0 }),
    N("Doctor", DOCTOR_YARD, { face: Off(DOCTOR_YARD, 0, -4) }),
    C("Geng", geng171, { face: inside }), C("Nier", nier171, { face: seat }), N("LiuWencai", liu171, { face: seat }),
    N("DoorGuard", DOOR_GUARD, { face: Off(DOOR_GUARD, 5, 1) }), N("AidHelper", HELPER, { weapon: null, role: "helper2nd", face: Off(HELPER, 4, 0.8) }), ...AidWounded(), ...Yard17(),
  ];
  Add({
    id: "17-2", ...s17, name: "舅舅的信",
    player: { x: seat.x, z: seat.z, yawDeg: -90, pitchDeg: -30, stance: "crouch" },
    what: "顺子蹲在冬瓜身边，屏幕只亮一个 F：手伸进冬瓜贴身衣兜摸出一封汗湿的信，塞进自己的钱袋，退到门槛上坐下。",
    next: { text: "（按 F 摸出信）" },
    how: ["顺子蹲在冬瓜身边，屏幕只亮一个 F；按下去，手伸进冬瓜贴身衣兜，摸出一封折成小方块、汗湿了的信（冬瓜他舅从汉口寄来的）",
      "顺子把信塞进自己的钱袋，退到门口在门槛上坐下（自动），能转头不能走", "院子照常忙：往里抬、往外抬、烧水", "院门外二营的兵一拨拨跑过"],
    notes: `「坐在门槛上」：玩家机位蹲姿、放在门槛东沿外 (${seat.x},${seat.z})，朝东看院子；按 F 那一下在厢房里冬瓜身边（预演里做）。院门外跑过的兵在出村小路上（intent 往村南头）。`,
    signals: S15_SIG,
    units: [...Yard172(), ...Passing2nd()],
    pois: [Poi("Letter", "冬瓜贴身衣兜里他舅的信", "poi", inside, 0.6), POI.passing(), POI.aid("landmark")],
  });

  const luo173 = AY(11.4, 20.2), yaowa173 = AY(11.8, 18.0), he173 = AY(13.4, 21.4);
  Add({
    id: "17-3", ...s17, name: "起来",
    player: { x: seat.x, z: seat.z, yawDeg: Yaw(seat, luo173), pitchDeg: 4, stance: "crouch" },
    what: "班长带人进院，满身土和烟，掀开被角看了看：咋个搞的？刘文财：……飞机。班长：狗日的。顺儿。……起来，跟斗走。",
    next: { text: "跟着班长" },
    how: ["罗班长带幺娃、何有田和剩下几个人进院，满身土和烟。班长看见门槛上的顺子、屋里盖着脸的那个，走过去蹲下掀开被角看了看又盖回去",
      "班长：「咋个搞的？」（刘文财看了顺子一眼）刘文财：「……飞机。」（班长没再问）班长：「狗日的。」", "幺娃看见顺子攥着的钱袋和露出一角的信，把眼睛挪开",
      "班长：「顺儿。」（顺子没抬头）班长：「……起来，跟斗走。」顺子把钱袋塞回怀里站起来"],
    notes: "班长从院门走到顺子跟前（path 从门外进来）；幺娃站在顺子旁边；何有田与 Squad1 / 2 在后头 / 院门口。",
    signals: S15_SIG,
    units: [
      N("Luo", luo173, { face: seat, from: PL.aidGateOut }),
      N("Yaowa", yaowa173, { face: seat, from: PL.aidGateOut }),
      N("HeYoutian", he173, { face: seat, from: PL.aidGateOut }),
      N("Squad1", AY(26.6, 23.2), { face: seat, from: PL.aidGateOut, guess: true }),
      N("Squad2", AY(28.0, 25.8), { yaw: 90, from: PL.aidGateOut, guess: true }),
      ...Yard172(), ...Passing2nd(8),
    ],
    pois: [POI.aid("landmark"), POI.passing()],
  });

  // ======================= 18 撤过铁路桥 =======================
  const s18 = { stage: 18, stageTitle: "撤过铁路桥" };
  const captain181 = AY(18.8, 21.4), p181 = AY(9.8, 20.4);
  const YardEvac = ({ phase = 0 } = {}) => [
    N("AidLitter1", phase ? Pt(GYD.box.minX + 6.6, A.gate.z - 0.3) : AY(23.0, 19.6), { kind: "litter", name: "院里抬出去的担架", group: "aidEvac", face: PL.aidGateOut, to: PL.villageSouthEnd, speed: 1.2 }),
    N("AidLitter2", phase ? AY(26.2, 23.4) : AY(20.0, 15.6), { kind: "litter", group: "aidEvac", face: PL.aidGateOut, to: PL.villageSouthEnd, speed: 1.2 }),
    N("AidLitter3", phase ? AY(21.0, 17.6) : AY(15.6, 12.6), { kind: "litter", group: "aidEvac", face: PL.aidGateOut, to: PL.villageSouthEnd, speed: 1.2 }),
    N("Doctor", phase ? AY(19.0, 16.0) : DOCTOR_YARD, { face: PL.aidGateOut, to: Off(PL.villageSouthEnd, -1, 0), speed: 1.2 }),
    ...[1, 4, 6].map((i, k) => N(`AidDead${k + 1}`, AID_WOUNDED[i], { name: k ? undefined : "盖着脸的", group: "aid", weapon: null, down: true, yaw: WoundedYaw(i), guess: true })),
  ];
  Add({
    id: "18-1", ...s18, stageLabel: "18A", name: "命令",
    player: { x: p181.x, z: p181.z, yawDeg: Yaw(p181, captain181), pitchDeg: 0, stance: "stand" },
    what: "二营连长进院：命令下来了：三营今晚回城，伤兵跟三营走，过了铁路桥就炸。班长：顺儿，你跟担架走。到桥南头等到老子。",
    next: { text: "跟担架走", x: PL.aidGateOut.x, z: PL.aidGateOut.z, radiusM: 2.5 },
    how: ["二营连长进院：「命令下来了：三营今晚回城，伤兵跟三营走，过了铁路桥就炸。城里说汤军团在路上了。」何有田：「在路上？日他妈，老子也在路上。」",
      "班长：「你们二营喃？」连长：「守到这儿。」（停一下）「你们跟三营走，把伤兵给我送进城。」", "班长：「顺儿，你跟担架走。我们殿后，到桥南头等到老子。」",
      "顺子愣了一下，耳朵里响起冬瓜在防炮洞里那句（01 的原录音，压低发闷）：「撤的时候乱，我嗯两个跟斗伤兵走，哪个管得到？」顺子隔着衣服按了按胸口：「……要得。」",
      "院里担架一副副抬出去，军医跟最后一副出院门；屋里只剩盖着脸的那几个"],
    notes: "冬瓜留在厢房里，从这一帧起不再摆。院里活着的伤员一副一副抬出去（AidLitter1–3，intent 往村南头 → 北岸土路），死了的盖着脸留下（AidDead）。冬瓜那句是 01 的原录音压低发闷，不另录。",
    signals: S15_SIG,
    units: [
      N("Captain", captain181, { face: Off(p181, 2, 0), from: PL.aidGateOut }),
      N("Luo", AY(12.2, 21.8), { face: captain181 }), N("Yaowa", AY(11.8, 18.0), { face: captain181 }), N("HeYoutian", AY(14.4, 22.8), { face: captain181 }),
      N("Squad1", AY(26.6, 23.2), { face: captain181, guess: true }), N("Squad2", AY(28.0, 25.8), { face: captain181, guess: true }),
      N("LiuWencai", AY(7.6, 22.2), { face: captain181 }),
      C("Geng", AY(16.4, 24.6), { face: captain181 }), C("Nier", AY(15.0, 25.4), { face: captain181 }),
      C("Heizi", heiziDown, { down: true, yaw: CPK.yawDeg - 40 }),
      ...YardEvac(),
    ],
    pois: [POI.aid("objective")],
  });

  const gengWall = AY(18.4, 32.8), mother = HoleWorld(GY.hole, 0.8, 0), p182 = Pt(X.box.maxX + 2.1, X.door.z + 1.4);
  Add({
    id: "18-2", ...s18, stageLabel: "18A", name: "隔壁院",
    player: { x: p182.x, z: p182.z, yawDeg: Yaw(p182, mother), pitchDeg: -8, stance: "stand" },
    what: "顺子在厢房门口停了一下，何有田推他：走了。老耿隔着塌墙冲女娃家洞口喊：走啊！鬼子要来了！女人摇摇头，把席子拉上。",
    next: { text: "跟担架走", x: PL.aidGateOut.x, z: PL.aidGateOut.z, radiusM: 2.5 },
    how: ["顺子在厢房门口停了一下，何有田在后头推他：「走了。」", "老耿隔着塌墙冲女娃家洞口喊：「走啊！鬼子要来了！」", "洞口那个女人摇摇头，把席子拉上盖住洞口", "妮儿看着那张席子；担架一副副从院门抬出去"],
    notes: "GirlHoleCovered 从这一帧起（女娃家洞口的席子出现）。女娃她娘站在她家洞的坡道里（程序化身体）。老耿隔着救护所南墙塌了的那一截喊。",
    signals: [...S15_SIG, SIG.girlHoleCovered],
    units: [
      C("Geng", gengWall, { face: mother, path: [AY(15.0, 25.6), AY(15.0, 31.4), gengWall] }), C("Nier", Off(gengWall, 1.2, -0.6), { face: mother, path: [AY(14.4, 26.4), AY(14.6, 31.8), Off(gengWall, 1.2, -0.6)] }),
      C("GirlMother", mother, { face: gengWall }),
      N("HeYoutian", Off(p182, 1.0, 1.3), { face: p182 }),
      N("LiuWencai", AY(24.6, 29.6), { face: PL.aidGateIn }),
      N("Luo", AY(26.8, 22.0), { face: PL.aidGateIn }), N("Yaowa", AY(28.4, 23.4), { face: PL.aidGateIn }),
      N("Captain", AY(30.2, 22.4), { face: PL.aidGateOut }),
      C("Heizi", heiziDown, { down: true, yaw: CPK.yawDeg - 40 }),
      ...YardEvac({ phase: 1 }),
    ],
    pois: [POI.girlYard()],
  });

  // 18-3 出村、铁路桥：出村小路 → 北岸土路 → 李子行 → 铁路桥北头土坡；担架踩枕木过桥、老乡蹚水、老耿牵妮儿走桥面；三营守桥头、工兵绑炸药
  const p183 = Pt(RL.x + 1.8, RB.northZ - 4.6);
  const S18B_SIG = [...S15_SIG, SIG.girlHoleCovered, SIG.chargesSet];
  const sappers = [PIER(1), PIER(2)];
  Add({
    id: "18-3", ...s18, stageLabel: "18B", name: "出村、铁路桥",
    player: { x: p183.x, z: p183.z, yawDeg: 180, pitchDeg: -10, stance: "stand" },
    what: "跟着担架队顺北岸土路走到铁路桥北头：桥北只剩光路基；桥是几孔钢梁架在石墩上，桥面只有枕木。三营守桥头，两个工兵在桥墩上绑炸药。",
    next: { text: "过铁路桥", x: BR_S.x, z: BR_S.z, radiusM: 3 },
    how: ["有人可跟：担架队排成一溜走在顺子前头（三四副担架连抬的人、军医、几个走得动的伤兵和百姓、老耿牵着妮儿、三营一两个押队的兵），刘文财跟在顺子后头。队伍按走路速度走；顺子落后十来米，队头就停下、押队的兵回头等（白盒表现不了，说明字）",
      "远处有目标：一出村南头顺着土路往西南看，夕阳正落在铁路桥那头；路基边一排电线杆远远标着铁路和桥在哪",
      "路上隔一阵有点东西（按走路顺序，约每 45–60 m 一处，都从路上看得见）：①一出村南头，路北边一个孤零零的院子挨了炸，墙塌了半边、房梁在冒烟；②再往前路北边一道土墙，墙根一排人躺着盖着席子露着脚；③李子行朝路那一面开着一个院门，门板歪着斜靠在门框上，地上掉着一只鞋，村里空了",
      "铁路桥北边只剩光路基；桥是几孔钢梁架在石墩上，桥面只有枕木", "三营的兵守桥头，两个工兵在桥墩上绑炸药，引线拉到南岸河堤后",
      "担架踩着枕木一格一格过；有老乡顺陡岸滑下河床蹚水过去；老耿牵着妮儿走桥面"],
    notes: `ChargesSet 从这一帧起。这一帧是到桥北头那一刻：玩家在桥北头路基上 (${p183.x},${p183.z})（上路基的土坡顶在 (${PL.railRampTop.x},${PL.railRampTop.z})）；队头的担架已经在桥面上、队尾那副和军医在顺子前头的路基上、押队的三营兵回头等着，刘文财在顺子身后的土坡上。`
      + `队伍在北岸土路上走的样子在预演里演（18-3 段：顺子的眼睛沿路四个定镜，每个都看得见前头的队伍，路过三处路边小场景，朝西南时夕阳 / 铁路桥 / 电线杆在画面里）。`
      + `桥面上的人站在枕木顶上（每孔一条看不见的 standOn 走道）：担架、老耿牵着妮儿、三营的兵踩着枕木过桥；蹚水的老乡在河床那一股水里（齐小腿，蹚水点 (${PL.wadeAt.x},${PL.wadeAt.z})）。`
      + `北沙河村到铁路桥约 ${Math.round(Dist(PL.villageSouthEnd, PL.bridgeNorth))} m（白盒压短，真实 1.2 km）。夕阳锚点 sunWest (${PL.sunWest.x},${PL.sunWest.z}) 在土路长直段 → 桥北头的延长线上；电线杆是创作。`,
    signals: S18B_SIG,
    units: [
      N("AidLitter1", BR_S, { kind: "litter", name: "院里抬出去的担架", group: "aidEvac", yaw: 180, climb: true, to: RAMP_S.from }),
      N("AidLitter2", Pt(RL.x, (RB.northZ + RB.southZ) / 2 + 3), { kind: "litter", group: "aidEvac", yaw: 180, climb: true }),
      N("AidLitter3", Pt(RL.x + 0.3, RB.northZ - 2.6), { kind: "litter", group: "aidEvac", yaw: 180, climb: true }),   // 队尾那副：顺子前头的路基上，正要上桥
      N("AidLitter4", Pt(RL.x - 0.2, RB.northZ + 36), { kind: "litter", group: "aidEvac", yaw: 180, climb: true, from: PL.railRampTop }),
      N("Doctor", Pt(RL.x - 1.5, RB.northZ - 3.0), { face: PL.bridgeNorth, climb: true }),
      C("Geng", Pt(RL.x - 0.4, RB.northZ + 9.0), { yaw: 180, climb: true }), C("Nier", Pt(RL.x + 0.5, RB.northZ + 9.6), { yaw: 180, climb: true }),
      N("LiuWencai", Pt(RAMP_N.from.x - 6.5, RAMP_N.from.z + 0.2), { face: p183, climb: true }),   // 跟在顺子后头（土坡上）
      N("B3Rear", Pt(RL.x - 0.6, RB.northZ - 0.6), { name: "三营兵（押队，回头等）", role: "rifleman3rd", group: "bridge3rd", face: p183, climb: true }),
      N("B3Guard1", Pt(RL.x - 2.0, RB.northZ - 8.6), { name: "三营兵（守桥头）", role: "rifleman3rd", group: "bridge3rd", stance: "crouch", aim: true, face: Pt(RL.x - 2, RB.northZ - 60) }),
      N("B3Guard2", Pt(RL.x + 2.2, RB.northZ - 9.4), { role: "rifleman3rd", group: "bridge3rd", stance: "crouch", aim: true, face: MG18 }),
      N("B3Guard3", Pt(RL.x - 4.8, RB.northZ - 4.4), { role: "rifleman3rd", group: "bridge3rd", face: Pt(RL.x - 20, RB.northZ - 40) }),
      N("B3Escort", Pt(RL.x + 0.6, RB.northZ + 18.2), { name: "三营兵（跟担架过桥）", role: "rifleman3rd", group: "bridge3rd", yaw: 180, climb: true }),
      N("B3South", Pt(RL.x - 1.2, RB.southZ + 2.6), { role: "rifleman3rd", group: "bridge3rd", face: PL.bridgeNorth, climb: true }),
      N("Officer18", BEHIND_LEVEE(-62.4), { face: PL.bridgeNorth }),
      ...sappers.map((p, i) => N(`Sapper${i + 1}`, p, { stance: "crouch", face: Pt(RL.x, p.z), climb: true })),
      C("Wader1", SlideN(2.0), { name: "蹚水的老乡", role: "refugee", group: "waders", face: SlideN(12), climb: true }),
      C("Wader2", STREAM_AT(-64.5, -1.0), { role: "refugeeWithBundle", group: "waders", face: STREAM_AT(-64.5, 12), wade: true }),
      C("Wader3", STREAM_AT(-63.2, 2.0), { role: "refugeeCarryingElder", group: "waders", face: STREAM_AT(-63.2, 12), wade: true }),
    ],
    pois: [POI.raidWall(), POI.raidMats(), POI.liziGate(), POI.lizihang(), POI.sunWest(), POI.telegraph(), POI.railBridge("objective"), POI.sappers(), POI.wade()],
  });

  // 18-4 南头等：顺子、刘文财趴河堤；担架一副副往南走进黑地；鬼子顺路基摸下来、机枪压土坎后的班长他们
  const p184 = Pt(PL.leveePlayer.x, PL.leveePlayer.z);
  const Levee18 = ({ stance = "prone", roadD = 0 } = {}) => [
    N("LiuWencai", LEVEE_CREST(-66.4), { stance, aim: true, face: MG18, climb: true }),
    N("Officer18", BEHIND_LEVEE(-62.4), { face: PL.bridgeNorth }),
    N("Sapper1", BEHIND_LEVEE(-74.4), { stance: "crouch", face: PL.bridgeNorth, climb: true }), N("Sapper2", BEHIND_LEVEE(-76.0), { stance: "crouch", face: PL.bridgeNorth, climb: true }),
    ...Levee3rd(),
    C("Geng", SR(roadD + 7, -0.8), { yaw: SR_YAW, to: SR(roadD + 40, -0.8) }), C("Nier", SR(roadD + 7.8, 0.4), { yaw: SR_YAW, to: SR(roadD + 40.8, 0.4) }),
    N("AidLitter1", SR(roadD + 14), { kind: "litter", group: "aidEvac", yaw: SR_YAW, to: SR(roadD + 50) }),
    N("AidLitter2", SR(roadD + 2.5), { kind: "litter", group: "aidEvac", yaw: SR_YAW, to: SR(roadD + 38) }),
    N("Doctor", SR(roadD + 17, 1.2), { yaw: SR_YAW, to: SR(roadD + 52, 1.2) }),
  ];
  Add({
    id: "18-4", ...s18, stageLabel: "18C", name: "南头等",
    player: { x: p184.x, z: p184.z, yawDeg: Yaw(p184, MG18), pitchDeg: 1, stance: "prone" },
    what: "担架一副副往南走进黑地。北边一小股鬼子顺路基摸下来，一挺机枪扫，班长他们被压在桥北土坎后。军官：炸！不等了！",
    next: { text: "等班长他们过桥", x: BR_S.x, z: BR_S.z, radiusM: 3 },
    how: ["顺子、刘文财趴在南岸河堤上。担架一副副从身边过去，往南走进黑地里，老耿牵着妮儿跟在后头", "顺子回头看着那条路，手按在胸口（低声）：「……哪个管得到。」刘文财在旁边看了他一眼，没吭声",
      "北边枪响：一小股鬼子绕开村口沟，顺铁路路基从北边摸下来，一挺机枪架在路基脚扫；殿后的班长他们被压在桥北土坎后，一离开土坎就是靶子",
      "三营军官：「炸！不等了！」刘文财：「班长他们还在后头！」军官：「鬼子都摸到路基上了！」刘文财：「再等一哈！……顺儿！那挺机枪！」顺子把脸从南边转回来，趴到堤上"],
    notes: `土坎高 ${R1(BK.topY - VL.y)} m、坎后挖低到 ${BK.hollow.y}，蹲着的人机枪看不见；机枪在路基东脚的坟头旁 (${MG18.x},${MG18.z})，从河堤上（路基东边 10 m）隔着沙河看得见它，${R1(Dist(p184, MG18))} m（场景生成器核过）。`,
    signals: S18B_SIG,
    units: [
      ...Levee18(),
      ...Object.entries(LAST_SLOTS).map(([id, p]) => N(id, p, { stance: "crouch", aim: id === "Luo" || id === "HeYoutian", face: MG18, guess: id.startsWith("Squad"), climb: true })),
      N("LastWounded", Off(LAST_COVER, 1.8, 1.8), { role: "wounded", group: "last", down: true, yaw: 90 }),
      N("B3Guard1", Pt(RL.x - 0.4, RB.northZ - 2.2), { name: "三营兵（最后几拨）", role: "rifleman3rd", group: "bridge3rd", yaw: 180, climb: true }),
      N("B3Guard2", BR_S, { role: "rifleman3rd", group: "bridge3rd", yaw: 180, climb: true }),
      ...IjaField18(),
    ],
    pois: [POI.mg18("objective"), POI.bank(), POI.sappers()],
  });

  // 18-5 机枪一哑，顺子站起来挥手：快过来！班长他们跑上桥，班长最后一个扑到堤后点头不说话
  Add({
    id: "18-5", ...s18, stageLabel: "18C", name: "快过来",
    player: { x: p184.x, z: p184.z, yawDeg: Yaw(p184, PL.bridgeNorth), pitchDeg: 2, stance: "stand" },
    what: "机枪一哑，顺子站起来冲他们挥手：快过来！快过来！班长他们爬起来往桥上跑：幺娃、何有田，班长最后一个。",
    next: { text: "等班长过桥", x: BR_S.x, z: BR_S.z, radiusM: 2.5 },
    how: ["玩家压机枪。机枪一哑，顺子站起来冲他们挥手：「快过来！快过来！」（02 坡顶别人冲他喊的那句，这回是他喊）", "班长他们爬起来往桥上跑：幺娃、何有田，班长最后一个",
      "班长扑到河堤后头，喘着，冲军官点一下头（不说话）", "鬼子步兵在田里往桥头压"],
    notes: "班长他们从土坎后往桥头跑（离开土坎就在机枪的视线里——机枪已经哑了）；跑在前头的幺娃已经在桥面上（站在枕木顶上）。",
    signals: S18B_SIG,
    units: [
      ...Levee18({ stance: "crouch", roadD: 11 }),
      N("Yaowa", Pt(RL.x + 0.4, (RB.northZ + RB.southZ) / 2), { yaw: 180, speed: 3.2, climb: true }),
      N("HeYoutian", Pt(RAMP_N.to.x + 1.2, RAMP_N.to.z + 0.4), { face: PL.bridgeNorth, speed: 3.2, climb: true }),
      N("Squad1", Pt(RAMP_N.from.x + 3.4, RAMP_N.from.z - 2.6), { face: PL.bridgeNorth, speed: 3.2, guess: true, climb: true }),
      N("Squad2", Pt(RAMP_N.from.x + 6.2, RAMP_N.from.z - 5.0), { face: PL.bridgeNorth, speed: 3.2, guess: true, climb: true }),
      N("Luo", Off(LAST_COVER, -3.2, 3.4), { face: PL.bridgeNorth, aim: true, speed: 3.0, climb: true }),
      N("LastWounded", Pt(RAMP_N.from.x + 4.6, RAMP_N.from.z - 1.4), { role: "wounded", group: "last", down: true, yaw: 140 }),
      N("B3Guard1", Pt(RL.x - 1.0, RB.southZ - 1.6), { role: "rifleman3rd", group: "bridge3rd", yaw: 180, climb: true }),
      N("B3Guard2", Pt(RAMP_S.to.x + 1.6, RAMP_S.to.z - 0.8), { role: "rifleman3rd", group: "bridge3rd", yaw: 180, climb: true }),
      ...IjaField18({ mgDown: true, near: true }),
    ],
    pois: [POI.mg18("danger"), POI.railBridge("landmark")],
  });

  // 18-6 炸桥：军官：点！大家扑到河堤后头，「轰」一声，北头两孔钢梁断开砸进河床
  const p186 = Pt(PL.leveeCover.x, PL.leveeCover.z);
  const S18C_SIG = [...S18B_SIG, SIG.bridgeBlown];
  const BehindLevee = ({ roadD = 22, ...o } = {}) => [
    N("Luo", BEHIND_LEVEE(-64.8), { stance: "crouch", face: PL.bridgeNorth, climb: true, ...o }),
    N("Yaowa", BEHIND_LEVEE(-67.2), { stance: "crouch", face: PL.bridgeNorth, climb: true, ...o }),
    N("HeYoutian", BEHIND_LEVEE(-61.2), { stance: "crouch", face: PL.bridgeNorth, climb: true, ...o }),
    N("Squad1", BEHIND_LEVEE(-63.6, 1), { stance: "crouch", guess: true, face: PL.bridgeNorth, climb: true, ...o }),
    N("Squad2", BEHIND_LEVEE(-66.0, 1), { stance: "crouch", guess: true, face: PL.bridgeNorth, climb: true, ...o }),
    N("LiuWencai", BEHIND_LEVEE(-72.2), { stance: "crouch", face: PL.bridgeNorth, climb: true, ...o }),
    N("Officer18", BEHIND_LEVEE(-62.4, 1), { face: PL.bridgeNorth, ...o }),
    N("Sapper1", BEHIND_LEVEE(-74.4), { stance: "crouch", face: PL.bridgeNorth, ...o }), N("Sapper2", BEHIND_LEVEE(-76.0), { stance: "crouch", face: PL.bridgeNorth, ...o }),
    ...Levee3rd(),
    N("B3Guard1", BEHIND_LEVEE(-69.8, 1), { role: "rifleman3rd", group: "bridge3rd", stance: "crouch", face: PL.bridgeNorth, climb: true, ...o }),
    N("B3Guard2", BEHIND_LEVEE(-71.4, 1), { role: "rifleman3rd", group: "bridge3rd", stance: "crouch", face: PL.bridgeNorth, climb: true, ...o }),
    N("LastWounded", BEHIND_LEVEE(-68.6, 2), { role: "wounded", group: "last", down: true, yaw: 90 }),
    C("Geng", SR(roadD + 7, -0.8), { yaw: SR_YAW, to: SR(roadD + 40, -0.8) }), C("Nier", SR(roadD + 7.8, 0.4), { yaw: SR_YAW, to: SR(roadD + 40.8, 0.4) }),
    N("AidLitter1", SR(roadD + 14), { kind: "litter", group: "aidEvac", yaw: SR_YAW, to: SR(roadD + 50) }),
    N("AidLitter2", SR(roadD + 2.5), { kind: "litter", group: "aidEvac", yaw: SR_YAW, to: SR(roadD + 38) }),
    N("Doctor", SR(roadD + 17, 1.2), { yaw: SR_YAW, to: SR(roadD + 52, 1.2) }),
  ];
  Add({
    id: "18-6", ...s18, stageLabel: "18C", name: "炸桥",
    player: { x: p186.x, z: p186.z, yawDeg: Yaw(p186, Pt(RL.x, RB.northZ + 10)), pitchDeg: 8, stance: "prone" },
    what: "军官：点！大家扑到河堤后，「轰」，北头两孔钢梁断开砸进河床。",
    next: { text: "趴在河堤后头" },
    how: ["军官：「点！」", "大家扑到河堤后", "「轰」，北头两孔钢梁断开砸进河床", "断梁和散落的枕木砸在河床上"],
    notes: "BridgeBlown 从这一帧起：北头两孔的钢梁、枕木、轨没了，断梁和散落的枕木砸在河床上（随信号体块）。",
    signals: S18C_SIG,
    units: [...BehindLevee(), ...IjaField18({ mgDown: true, near: true }).map((u) => (u.id.startsWith("IjaField") ? Mod(u, { stance: "prone" }) : u))],
    pois: [POI.blast()],
  });

  // 18-7 对岸：鬼子涌到北岸路基上朝这边打，过不来；东北边北沙河村那头枪声还在响
  const p187 = LEVEE_CREST(-70);
  const NORTH_BANK_IJA = [[RL.x - 0.8, 906], [RL.x + 0.9, 910], [RL.x - 1.4, 914], [RL.x + 1.6, 902], [-95.4, 915.2], [-90.6, 914.6], [-86.2, 915.6], [-74.6, 915.8], [-70.2, 915.0], [-112.6, 915.4], [-117.6, 914.4], [-123.0, 915.6]];
  Add({
    id: "18-7", ...s18, stageLabel: "18C", name: "对岸",
    player: { x: p187.x, z: p187.z, yawDeg: 0, pitchDeg: 2, stance: "stand" },
    what: "鬼子涌到北岸路基上朝这边开枪，过不来。东北边北沙河村那头枪声还在响。幺娃：二营的……班长：走！",
    next: { text: "往南走", x: SR(12).x, z: SR(12).z, radiusM: 3 },
    how: ["对岸（半过场，能转头）：鬼子涌到北岸路基上朝这边开枪，过不来", "东北边北沙河村那头枪声还在响（二营）", "幺娃：「二营的……」班长：「走！」", "往南走进黑里，身后的枪声慢慢远了"],
    notes: `站在南头河堤顶（${LV.crestY}）往北看：北岸桥头路基上、坎沿上一排鬼子（${NORTH_BANK_IJA.length} 个，都在北坎顶 z ${RB.northZ} 以北），断了的桥北头两孔砸在河床上。`,
    signals: S18C_SIG,
    units: [
      ...BehindLevee({ roadD: 32, stance: "stand" }).map((u) => (u.id === "Luo" ? Mod(u, { yawDeg: Yaw(u, p187) }) : u)),
      ...NORTH_BANK_IJA.map(([x, z], i) => J(`BankIja${i + 1}`, Pt(x, z), { role: "rifleman", group: "northBank", stance: i % 3 === 1 ? "crouch" : "stand", aim: i % 4 !== 3, face: p187, straight: true, guess: true })),
    ],
    pois: [POI.villageGuns(), POI.blast()],
  });

  // 18-8 夜里：一长溜队伍顺南岸路往南走；远处县城的灯
  const p188 = SR(50);
  Add({
    id: "18-8", ...s18, stageLabel: "18夜", stageTitle: "夜里", name: "夜里",
    player: { x: p188.x, z: p188.z, yawDeg: p188.heading, pitchDeg: 2, stance: "stand" },
    what: "夜里，一长溜队伍顺南岸路往南走：有兵、有担架、有老百姓，老耿牵着妮儿在百姓堆里。黑地里远远有几点灯，是县城。",
    next: { text: "往南走", x: SR(80).x, z: SR(80).z, radiusM: 4 },
    how: ["黑场只有脚步声，字幕「1938年3月14日 夜」；淡入：一长溜队伍在夜里顺南岸路往南走，有兵、有担架、有老百姓，老耿牵着妮儿在百姓堆里",
      "有人可跟、远处有目标：前头队伍里两三个人提着马灯（队头的三营军官、第一副担架的杠头、百姓堆里一个），黑地里一溜晃着的小亮点就是路；再远处几点不动的灯，是县城",
      "何有田：「老人家，跟到我们进城做啥子？鬼子明天就撵到城底下了。」老耿：「……城里有城墙，比庄上牢靠。」（没人接话）",
      "顺子走在队伍后头，手伸进怀里攥着钱袋和信（低声）：「……进了城再说。」", "黑地里远远有几点灯，是县城。黑场，第一关结束"],
    notes: `南岸路从土坡脚 (${RD.southRoad.line[0].x},${RD.southRoad.line[0].z}) 往南到场地南边；队伍前后有兵、担架、百姓。县城的灯在路尽头 (${PL.cityLights.x},${PL.cityLights.z})（马灯 / 灯桩，几点亮），没有城墙、没有城门。`
      + `手提马灯（18 引导第二轮）：白盒单位挂不了手持道具、预演也没有跟人走的灯光事件，队伍里的三盏马灯（Officer18、AidLitter1 杠头、Refugee3）这轮只写在这里和预演说明字里，等预演支持手持道具 / 跟人的点光再挂。`,
    signals: S18C_SIG,
    units: [
      N("Officer18", SR(76, -0.9), { yaw: SR_YAW, to: SR(100, -0.9) }),
      N("AidLitter1", SR(70), { kind: "litter", group: "aidEvac", yaw: SR_YAW, to: SR(100) }),
      C("Refugee3", SR(66, -1.2), { role: "refugeeWithChild", yaw: SR_YAW, to: SR(96, -1.2) }),
      C("RefugeeChild", SR(66.6, -0.2), { kind: "child", role: "refugee", yaw: SR_YAW, to: SR(96.6, -0.2) }),
      N("Luo", SR(64, 0.6), { yaw: SR_YAW, to: SR(94, 0.6) }),
      C("Geng", SR(60, -1.0), { yaw: SR_YAW, to: SR(90, -1.0) }),
      C("Nier", SR(60.8, 0.2), { yaw: SR_YAW, to: SR(90.8, 0.2) }),
      N("HeYoutian", SR(58, 1.4), { face: SR(60, -1.0), to: SR(88, 1.4) }),
      C("Refugee2", SR(56.6, 1.2), { role: "refugeeWithBundle", yaw: SR_YAW, to: SR(86.6, 1.2) }),
      C("Refugee1", SR(55, -1.4), { role: "refugee", yaw: SR_YAW, to: SR(85, -1.4) }),
      N("Yaowa", SR(53, 1.0), { yaw: SR_YAW, to: SR(83, 1.0) }),
      N("LiuWencai", SR(47, -0.8), { yaw: SR_YAW, to: SR(77, -0.8) }),
      N("AidLitter2", SR(44), { kind: "litter", group: "aidEvac", yaw: SR_YAW, to: SR(74) }),
      N("Doctor", SR(42, 1.2), { yaw: SR_YAW, to: SR(72, 1.2) }),
      N("Squad1", SR(40, -0.6), { yaw: SR_YAW, guess: true, to: SR(70, -0.6) }),
      N("Squad2", SR(38, 0.8), { yaw: SR_YAW, guess: true, to: SR(68, 0.8) }),
    ],
    pois: [POI.cityLights(), Poi("Column", "一长溜队伍顺南岸路往南走", "poi", SR(62), 8)],
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
  for (const k of UNIT_KEY_ORDER) if (u[k] !== undefined && (u[k] !== null || k === "weapon")) out[k] = u[k];
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
  { id: "A", name: "耿家庄村南口 → 土路 → 官道 → 村口沟", stages: [11, 13], box: { minX: 50, maxX: 236, minZ: 540, maxZ: 645 } },
  { id: "B", name: "北沙河村（主街、教堂、南街、救护所）", stages: [12, 18], box: { minX: 54, maxX: 224, minZ: 645, maxZ: 845 } },
  { id: "C", name: "北岸土路 → 李子行 → 铁路桥 → 南头河堤", stages: [18, 18], box: { minX: -160, maxX: 56, minZ: 845, maxZ: 985 } },
  { id: "D", name: "南岸路（夜里往南，县城的灯）", stages: [18, 18], box: { minX: -100, maxX: 20, minZ: 985, maxZ: 1080 } },
]);

/**
 * 生成 FirstLevel1218 的配置。issues（可选数组）：摆位 / 走位问题一条一行 push 进去（读得到场景文件时才查实心块与高度）。
 * @returns {Promise<object>}
 */
export async function BuildFirstLevel1218Config({ commit = "", generatedAt = "", issues = null } = {}) {
  const raw = Keyframes();
  FinishPaths(raw);
  const doc = {
    schema: BLOCKOUT_SCHEMA,
    level: L1218_LEVEL_KEY,
    title: L1218_TITLE,
    source: {
      generator: FIRST_LEVEL_1218_GENERATOR,
      gameVersion: `11–18 白盒第四版契约（2026-11-02，集成负责人；tmp/Contract1218_v4.md 第三节）· ${L1218_VERSION}`,
      commit, generatedAt,
    },
    zones: ZONES.map((z) => ({ ...z, stages: [...z.stages], box: { ...z.box } })),
    keyframes: raw.map(OrderKeyframe),
  };
  if (Array.isArray(issues)) {
    const meta = new Map();
    raw.forEach((kf) => kf.units.forEach((u) => meta.set(`${kf.id}/${u.id}`, META.get(u) || {})));
    const scene = await LoadSceneLayout();
    issues.push(...FirstLevel1218Issues(doc, { scene, meta }));
  }
  return doc;
}
// ---------------------------------------------------------------------------
// 摆位 / 走位检查（照 0610 / 第二版）

/** node 里读场景文件（没有或在浏览器里返回 null：只做与场景无关的检查）。 */
export async function LoadSceneLayout() {
  try {
    // 2026-10-31：场景在 Scenes/FirstLevelWhitebox（三段合一），按这一关的范围取一块（docs/Data_Scene.md）
    const { ReadBlockoutSceneDocSync } = await import("./Script_SceneNode.mjs");
    const doc = ReadBlockoutSceneDocSync("FirstLevel1218");
    const { LayoutFromSceneDoc } = await import("./Script_EditorBlockoutLevels.mjs");
    return LayoutFromSceneDoc(doc);
  } catch (error) {
    return { error: String(error?.message || error) };
  }
}

export const L1218_CHECK = Object.freeze({
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
/** 演员脚下的地面（高度场 + ≤1 m 的块顶，同运行时 standAt；板桥门板、门槛就是这么站上去的）。 */
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
    if (pen >= body.radiusM && b.y + b.h / 2 <= g + L1218_CHECK.stepUpM) continue;
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
  const r = l.yawDeg * Math.PI / 180, fx = -Math.sin(r), fz = -Math.cos(r), reach = L1218_CHECK.carryReachM;
  const front = { x: l.x + fx * reach, z: l.z + fz * reach };
  const rear = bearers >= 2 ? { x: l.x - fx * reach, z: l.z - fz * reach } : { x: l.x, z: l.z };
  return [rear, front];
}
function SegDist(p, a, b) {
  const dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz;
  const t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / l2)) : 0;
  return Math.hypot(p.x - a.x - dx * t, p.z - a.z - dz * t);
}
function OnCart(p, v, margin) {
  const r = v.yawDeg * Math.PI / 180, fx = -Math.sin(r), fz = -Math.cos(r);
  const dx = p.x - v.x, dz = p.z - v.z;
  return Math.abs(dx * fx + dz * fz) < CART_LEN / 2 + margin && Math.abs(-dx * fz + dz * fx) < 1.5 / 2 + margin;
}
const HECHA_X = L1218_FROM_0610.river.centerX;
/** 在深水里：河汊子沟尾（沟底一米深的水）。沙河那一股水齐小腿，蹚得过去，不算。 */
function InWater(p, stand) {
  if (Math.abs(p.x - HECHA_X) < 4 && p.z >= 540 && p.z <= 576) return stand(p.x, p.z) < -2.0;
  return false;
}

/** 铁路桥那一段（两头桥台之间、路基宽）。 */
export function OnRailBridge(p) { return Math.abs(p.x - RL.x) < RB.walkW / 2 + 0.2 && p.z > RB.northZ - 1 && p.z < RB.southZ + 1; }

/**
 * 配置的摆位 / 走位问题（每条一行）。scene = LayoutFromSceneDoc 的结果（null = 场景还没有，只做与场景无关的检查）。
 * meta：`${kfId}/${unitId}` → { climb, onLitter, tending, wade }（生成器内部标记；手改的 JSON 没有它）。
 */
export function FirstLevel1218Issues(doc, { scene = null, meta = new Map() } = {}) {
  const C = L1218_CHECK, out = [];
  const norm = NormalizeBlockout(doc);
  const b = L1218_BOUNDS;
  const InBounds = (p) => p.x >= b.minX && p.x <= b.maxX && p.z >= b.minZ && p.z <= b.maxZ;
  const hasScene = scene && !scene.error;
  if (scene?.error) out.push(`场景文件读不进来，跳过实心块 / 高度检查：${scene.error}`);
  norm.keyframes.forEach((kf, i) => {
    const M = (u) => meta.get(`${kf.id}/${u.id}`) || {};
    if (!InBounds(kf.player)) out.push(`${kf.id} 玩家出界 (${kf.player.x}, ${kf.player.z})`);
    for (const u of kf.units) if (!InBounds(u)) out.push(`${kf.id} ${u.id} 出界 (${u.x}, ${u.z})`);
    const Riding = (u) => !!(u.ride && u.ride.on);
    const people = kf.units.filter((u) => PEOPLE.has(u.kind));
    for (const u of people) {
      if (Riding(u)) continue;
      const d = Dist(u, kf.player), limit = u.state === "down" ? C.playerDownM : C.playerM;
      if (d < limit) out.push(`${kf.id} ${u.id} 离玩家 ${R2(d)} m（< ${limit}）`);
    }
    for (let a = 0; a < people.length; a++) for (let c = a + 1; c < people.length; c++) {
      if (Riding(people[a]) || Riding(people[c])) continue;
      if (M(people[a]).tending === people[c].id || M(people[c]).tending === people[a].id) continue;
      const d = Dist(people[a], people[c]);
      if (d < C.personM) out.push(`${kf.id} ${people[a].id} 和 ${people[c].id} 重叠 ${R2(d)} m（< ${C.personM}）`);
    }
    for (const l of kf.units.filter((u) => u.kind === "litter")) {
      const seg = CarrySegment(l);
      for (const u of people) {
        if (Riding(u) || M(u).onLitter === l.id) continue;
        if (M(u).tending && people.some((p) => p.id === M(u).tending && M(p).onLitter === l.id)) continue;
        const d = Dist(u, l);
        if (d < C.litterM) out.push(`${kf.id} ${u.id} 站在 ${l.id} 上（${R2(d)} m）`);
        else if (seg && SegDist(u, seg[0], seg[1]) < C.carryM) out.push(`${kf.id} ${u.id} 站在 ${l.id} 抬的人身上`);
      }
      if (!Riding(l) && Dist(l, kf.player) < C.litterM - 0.2) out.push(`${kf.id} 玩家站在 ${l.id} 上`);
    }
    for (const v of kf.units.filter((u) => u.kind === "cart")) {
      for (const u of people) if (!Riding(u) && OnCart(u, v, 0.2)) out.push(`${kf.id} ${u.id} 站在车身 ${v.id} 里`);
      if (OnCart(kf.player, v, 0)) out.push(`${kf.id} 玩家在车身 ${v.id} 里`);
    }
    if (Number.isFinite(kf.next?.x) && Dist(kf.next, kf.player) < C.nextM) out.push(`${kf.id} 下一步目标离玩家不到 ${C.nextM} m（只写文字）`);
    if (hasScene) {
      const solids = SolidsFor(scene, kf.signals);
      const ground = StandSampler(scene, kf.signals);
      const hit = BodyHit(solids, ground, kf.player.x, kf.player.z, C.playerBody, 0);
      if (hit) out.push(`${kf.id} 玩家站进 ${hit.id}`);
      if (InWater(kf.player, ground)) out.push(`${kf.id} 玩家站在水里`);
      for (const u of kf.units) {
        if (!PEOPLE.has(u.kind) && u.kind !== "litter") continue;
        if (Riding(u)) continue;
        if (InWater(u, ground)) out.push(`${kf.id} ${u.id} 在水里 (${u.x}, ${u.z})`);
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
      if (Riding(unit) || (entry.unitFrom && Riding(entry.unitFrom))) continue;
      if (entry.route.length < 2) continue;
      const m0 = meta.get(`${prev.id}/${entry.id}`) || {}, m1 = meta.get(`${kf.id}/${entry.id}`) || {};
      const climb = !!(m0.climb || m1.climb);
      const samples = Samples(entry.route, C.stepM);
      if (!hasScene) continue;
      const hits = new Set();
      for (const p of samples) {
        const h = BodyHit(solids, ground, p.x, p.z, C.body, C.body.routeTallM);
        if (h && !hits.has(h.id)) { hits.add(h.id); out.push(`${prev.id}→${kf.id} ${entry.id} 的走位穿过 ${h.id}（${R1(p.atM)} m 处）`); }
        if (InWater(p, ground)) { out.push(`${prev.id}→${kf.id} ${entry.id} 的走位进了水里（${R1(p.atM)} m 处）`); break; }
      }
      if (climb) continue;
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
