// ===========================================================================
// Script_EditorBlockoutFirstLevel1218Keyframes.mjs —— 第一关 11–18 新剧本白盒（关卡键 FirstLevel1218）的关键帧配置生成器（2026-10-26 第三版）
//
//   node Taierzhuang1938/Script_EditorBlockoutCli.mjs export FirstLevel1218 --force   → Blockout/FirstLevel1218.json
//
// 口径：
//   · 剧本（台词、谁做什么）以集成负责人 2026-10-26 的白盒第三版契约「一、故事」为准（用户 10-26 认的北沙河村这一版）；
//     空间以同契约「二、空间」为准，已换算成世界坐标写在 Data_EditorBlockoutFirstLevel1218Space.mjs —— 本文件所有坐标都从那里算，不手抄数字。
//   · 帧 id 用拍号：11-1、11-2、12-1…12-7、13-1…13-3、14-1…14-6、15-1…15-3（15A / 15B / 15C）、16-1、17-1…17-3、18-1…18-8，共 33 帧。
//   · 每一拍先让玩家亲眼看到出了什么事，再给一句话的下一步；「掩护」「清理」「护送」不进 next。台词照契约原字写进 how。
//   · 百姓一律程序化身体（body:"procedural"）；只有非放片段不可的几帧换骨骼身体：14-4 / 14-5 / 14-6 妮儿、14-6 老耿（拖被子 PvBlanketDragL/R 与被角握点）、
//     15-1 老耿（跪着按毛巾 CareMedicPress）、15-3 妮儿（蹲着画驴 PvKneelDig）、17-1 老耿（跪着把单被拉上来盖脸 PvKneelPullBlanket）。
//     女娃、她娘、老汉、钻洞的一家、教堂里的百姓、蹚水的老乡：程序化身体。七二七团的兵（连长、哨兵、医官、工兵、军官）是 NRA 骨骼身体，用名字区分。
//   · 冬瓜：11-1…12-6 躺在车板上的竹竿担架上（ride 挂在 GengCart 上；单被不上车：布料模拟取的是车底下的地面）；
//     12-7 起连单被一起搁在救护所院里墙根（BlanketDonggua，名字带「被」不带「担架」= IsBlanketLitter，布料模拟），之后一直在被子上；18 起留在厢房里，不再摆。
//   · 驴车：11-1…14-2 立着（12-7 起停在救护所门前）；14-3 黑子挨了一梭、连车带驴翻在院门口（信号 CartOverturned，翻倒的车是随信号体块），黑子倒地到 18-2；
//     18-3 起不摆（车过不了枕木桥，留在村里——剧本没写，白盒推定）。
//   · 坐标 X 向东、Z 向南、米；yawDeg 0 朝北、+90 朝西、−90 朝东、180 朝南（同 Script_EditorBlockoutConfig）。
//
// 走位：同一个人在相邻关键帧里 id 不变；生成时按路网（土路、官道、板桥、主街、西头的街、北头小巷、救护所门前、村西口、田间小路、上下路基的土坡、
// 铁路桥、南岸路、北门）自动排 path，不让人穿墙；麦地、院里、厢房、教堂院里、战壕、河床、河堤后头是能自由走动的区域。
// 只在新帧出现的人写 path 起点「走进来」，只在旧帧的人写 intent「走出去」。
// 铁路桥桥面：每孔一条看不见的 standOn 走道（2026-10-26），演员站在枕木顶上走过桥（BlockStandSampler 对 standOn 块不限 1 m 台阶）。
//
// 摆位检查（push 进 issues，CLI 打出来）：玩家 / 单位出界；玩家站进实心块、单位站进高块（读 Blockout/FirstLevel1218.scene.json，按两帧 signals 算 gates）；
// 两人重叠（< 0.6 m）、人站在担架上 / 车身里；过渡路线穿高块；路线上 1 m 内高差超过 1.2 m（爬坎、下战壕、过铁路桥的例外）；人站进河汊子的深水里。
// 纯函数式生成：不读时钟、不读 git；只在 node 里读场景文件做检查。
// ===========================================================================

import { BLOCKOUT_SCHEMA, PlanTransition, NormalizeBlockout, YawDegFromTo } from "./Script_EditorBlockoutConfig.mjs";
import { BlockStandSampler } from "./Script_EditorBlockoutPrevizPlan.mjs";
import { PointAlong, PointBeside } from "./Data_EditorBlockoutFirstLevel0105Space.mjs";
import {
  L1218_LEVEL_KEY, L1218_TITLE, L1218_VERSION, L1218_BOUNDS, L1218_PLACES as PL, L1218_DIRT_ROAD as DR, L1218_JUNCTION, L1218_POST_ROAD as PR, L1218_LANES as LN,
  L1218_FIELD_PATH as FP, L1218_SOUTH_ROAD as SR, L1218_AT_DITCH as AT, L1218_PLANK as PK, L1218_TRENCH as TR, L1218_VILLAGE as VL, L1218_YARDS,
  L1218_OLD_MAN, L1218_FAMILY_HOLE as FH, L1218_SLEEPER_PILES, L1218_SLOGANS, L1218_CHURCH as CH, L1218_WEST_TURN, L1218_CART_PARK as CPK, L1218_AID as A,
  L1218_GIRL_YARD as GY, L1218_RAIL as RL, L1218_RAIL_RAMPS, L1218_RAIL_BRIDGE as RB, L1218_RIVER as RV, L1218_BANK as BK, L1218_LEVEE as LV, L1218_NORTH_GATE as NG,
  L1218_GRAVES, L1218_VILLAGE_LIGHTS, L1218_SIGNALS as SIG, L1218_FROM_0610, StreetPoint, StreetFrame, RiverAtX,
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
/** 主街上按 s（沿街）、d（离中线，东北为正）取点。 */
const SP = (s, d = 0) => { const p = StreetPoint(s, d); return Pt(p.x, p.z); };
const STREET_YAW = R1(YawDegFromTo(StreetPoint(0), StreetPoint(10)));   // 顺着主街往东南走的朝向
/** 院子按 id。 */
const YARD = Object.fromEntries(L1218_YARDS.map((y) => [y.id, y]));
const RAMP_N = L1218_RAIL_RAMPS[0], RAMP_S = L1218_RAIL_RAMPS[1];
const BR_N = Pt(RL.x, RB.northZ - 1.5), BR_S = Pt(RL.x, RB.southZ + 1.5);   // 铁路桥两头路基上（演员站得上的最后一点）
const RIVER_AT_RAIL = RiverAtX(RL.x);

/** 驴车走的那条线：村南口 → 土路 → 官道 → 板桥 → 主街 → 西头的街 → 救护所院门外。按弧长取车 / 黑子 / 牵驴的位置。 */
const JI = PR.north.findIndex((p) => p.x === L1218_JUNCTION.x && p.z === L1218_JUNCTION.z);
export const CART_LINE = Object.freeze([...DR.line, ...PR.north.slice(JI + 1), Pt(PK.x, PK.toZ), ...PR.street.slice(1, 3), Pt(L1218_WEST_TURN.x, L1218_WEST_TURN.z), Pt(95.2, 688), Pt(PL.aidGateOut.x, PL.aidGateOut.z)].map((p) => Pt(p.x, p.z)));
const CL = (d, lat = 0) => { const p = PointBeside(CART_LINE, d, lat); return { ...Pt(p.x, p.z), heading: R1(p.headingYawDeg) }; };
const STREET_D0 = (() => { let d = 0; for (let i = 1; i < CART_LINE.length; i++) { if (CART_LINE[i - 1].x === PR.street[2].x && CART_LINE[i - 1].z === PR.street[2].z) return d; d += Dist(CART_LINE[i - 1], CART_LINE[i]); } return d; })();
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
const nodes = [], edges = [], areas = [];
const Node = (name, x, z) => { NODE[name] = nodes.length; nodes.push({ x: R2(x), z: R2(z), name }); return NODE[name]; };
const Edge = (a, b) => edges.push([NODE[a], NODE[b]]);
const Chain = (...names) => { for (let i = 1; i < names.length; i++) Edge(names[i - 1], names[i]); };
const Area = (name, box, ...portals) => areas.push({ name, box, portals: portals.map((n) => NODE[n]) });
const Box = (minX, maxX, minZ, maxZ) => ({ minX, maxX, minZ, maxZ });

// 窄胡同最后一截 → 村南口 → 土路 → 交叉口；官道东头 → 交叉口 → 沟北 → 板桥 → 主街
Node("LaneIn", L1218_FROM_0610.backLane.c, 538);
DR.line.forEach((p, i) => Node(`Dirt${i}`, p.x, p.z));
Chain("LaneIn", ...DR.line.map((_, i) => `Dirt${i}`));
PR.north.forEach((p, i) => { if (i !== JI) Node(`PostN${i}`, p.x, p.z); });
const PostName = (i) => (i === JI ? `Dirt${DR.line.length - 1}` : `PostN${i}`);
Chain(...PR.north.map((_, i) => PostName(i)));
Node("PlankS", PK.x, PK.toZ); Edge(PostName(PR.north.length - 1), "PlankS");
// 主街：每 15 m 一个点 + 北头小巷口、往西拐、东南出村
const STREET_S = [0, 15, 30, 45, 66.1, 85, 110, 139.3];
Node("Street_a", PR.street[1].x, PR.street[1].z); Edge("PlankS", "Street_a");
STREET_S.forEach((s, i) => { const p = StreetPoint(s); Node(`St${i}`, p.x, p.z); });
Edge("Street_a", "St0");
Chain(...STREET_S.map((_, i) => `St${i}`));
PR.southeast.slice(1).forEach((p, i) => Node(`PostSE${i}`, p.x, p.z));
Chain(`St${STREET_S.length - 1}`, ...PR.southeast.slice(1).map((_, i) => `PostSE${i}`));
const ST_NORTH_LANE = `St${STREET_S.indexOf(30)}`, ST_WEST = `St${STREET_S.indexOf(66.1)}`;
// 西头的街 → 救护所门前 → 院门；北头小巷；救护所东墙外往南的巷子；村西口；西头街南边的东西巷
Node("WestSt1", 120, LN.west.c); Node("GateSq", 97, LN.west.c); Node("AidGateOut", PL.aidGateOut.x, PL.aidGateOut.z); Node("AidGateIn", PL.aidGateIn.x, PL.aidGateIn.z);
Chain(ST_WEST, "WestSt1", "GateSq", "AidGateOut", "AidGateIn");
Node("NorthLaneW", LN.north.from, LN.north.c); Node("NorthLaneSq", 97, LN.north.c);
Chain(ST_NORTH_LANE, "NorthLaneSq", "NorthLaneW"); Edge("NorthLaneSq", "GateSq");
Node("SouthLane700", LN.southLane.c, 700); Node("SouthLane710", LN.southLane.c, LN.midLane.c); Node("SouthLane721", LN.southLane.c, LN.westExit.c); Node("SouthLane742", LN.southLane.c, 742);
Chain("AidGateOut", "SouthLane700", "SouthLane710", "SouthLane721", "SouthLane742");
Node("MidLaneE", LN.midLane.to, LN.midLane.c); Edge("SouthLane710", "MidLaneE");
// 村西口 → 田间小路 → 桥北头土坡 → 路基 → 铁路桥 → 路基 → 桥南头土坡 → 南岸路 → 北门 → 门内街
FP.line.forEach((p, i) => Node(`Field${i}`, p.x, p.z));
Edge("SouthLane721", "Field0");
Chain(...FP.line.map((_, i) => `Field${i}`));
Node("RampNTop", RAMP_N.to.x, RAMP_N.to.z); Node("BridgeN", BR_N.x, BR_N.z); Node("BridgeS", BR_S.x, BR_S.z);
Node("RampSTop", RAMP_S.to.x, RAMP_S.to.z); Node("RampSFoot", RAMP_S.from.x, RAMP_S.from.z);
Chain(`Field${FP.line.length - 1}`, "RampNTop", "BridgeN", "BridgeS", "RampSTop", "RampSFoot");
SR.line.slice(1).forEach((p, i) => Node(`South${i}`, p.x, p.z));
Node("GateOut", NG.gate.x, NG.wall.z - NG.wall.t / 2 - DOOR_OUT); Node("GateIn", NG.gate.x, NG.wall.z + NG.wall.t / 2 + DOOR_OUT); Node("Street", NG.street.x, NG.street.toZ - 2);
Chain("RampSFoot", ...SR.line.slice(1).map((_, i) => `South${i}`), "GateOut", "GateIn", "Street");
// 院门 / 厢房门 / 教堂院门 / 钻洞那家的院门
const X = A.xiang;
Node("XiangDoorOut", X.box.maxX + DOOR_OUT, X.door.z); Node("XiangDoorIn", X.box.maxX - DOOR_OUT, X.door.z); Edge("XiangDoorOut", "XiangDoorIn");
const cgO = StreetPoint(CH.gate.s, CH.d0 - DOOR_OUT), cgI = StreetPoint(CH.gate.s, CH.d0 + DOOR_OUT);
Node("ChurchGateOut", cgO.x, cgO.z); Node("ChurchGateIn", cgI.x, cgI.z); Edge("ChurchGateOut", "ChurchGateIn"); Edge(ST_WEST, "ChurchGateOut");
const N1 = YARD.N1;
Node("N1GateOut", N1.box.minX - DOOR_OUT, N1.gate.at); Node("N1GateIn", N1.box.minX + DOOR_OUT, N1.gate.at); Edge("N1GateOut", "N1GateIn"); Edge(`St${STREET_S.indexOf(15)}`, "N1GateOut");
// 区域：沟北麦地、救护所院里、厢房里、教堂院里、钻洞那家院里、村西麦地、河床、南头河堤后头、战壕东段 / 西段
Area("NorthField", Box(40, 236, 557, 629.5), "Dirt2", "Dirt3", "Dirt4", PostName(JI + 1), PostName(JI + 2), PostName(PR.north.length - 1), "PostN3", "PostN2");
Area("AidYard", Box(A.box.minX + 0.6, A.box.maxX - 0.6, A.mainHouse.box.maxZ + 0.6, A.box.maxZ - 0.6), "AidGateIn", "XiangDoorOut");
Area("Xiang", Box(X.box.minX + 0.6, X.box.maxX - 0.5, X.box.minZ + 0.5, X.box.maxZ - 0.5), "XiangDoorIn");
Area("GirlYard", Box(GY.box.minX + 0.6, GY.box.maxX - 0.6, GY.box.minZ + 0.6, GY.box.maxZ - 0.6));
Area("N1Yard", Box(N1.box.minX + 0.6, N1.box.maxX - 0.6, 650.5, N1.box.maxZ - 0.6), "N1GateIn");

// 河床：两处滑坡道上下（蹚水的老乡）；铁路桥桥面那一条不算河床（AreaOf 里排除）
{
  const sn = RV.slides.find((x) => x.bank === "north"), ss = RV.slides.find((x) => x.bank === "south"), rn = RiverAtX(sn.x), rs = RiverAtX(ss.x);
  Node("SlideNTop", sn.x, rn.northTop - 4.5); Node("SlideNBed", sn.x, rn.northToe + 4.5); Node("SlideSBed", ss.x, rs.southToe - 4.5); Node("SlideSTop", ss.x, rs.southTop + 1.5);
  Edge("SlideNTop", "SlideNBed"); Edge("SlideSBed", "SlideSTop"); Edge("SlideSTop", "RampSFoot");
}
Area("RiverBed", Box(L1218_BOUNDS.minX, L1218_BOUNDS.maxX, RIVER_AT_RAIL.northToe + 0.5, RIVER_AT_RAIL.southToe - 0.5), "SlideNBed", "SlideSBed");
Area("WestField", Box(-97, 55, 600, 761), "Field0", "Field1", "Field2", "Field3", "Field4", "Field5", "Field6", "NorthLaneW", "SlideNTop");
Area("BehindLevee", Box(-160, -30, LV.z + 1.6, 840), "RampSFoot", "South0");
Area("TrenchE", Box(116.5, 205, TR.east[1].z - 0.45, TR.east[1].z + 0.45));
Area("TrenchW", Box(52, 76.5, TR.west[0].z - 0.45, TR.west[0].z + 0.45));
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
 *   face {x,z} | yaw   朝向；name / castId / kind / shape / role / group / weapon（null = 空手）/ body / stance / aim / down / lie / bearers / arc / speed / guess
 *   from {x,z}|[..]   只在本帧出现：从这里走进来（path 起点）；fromStraight 不走路网
 *   path [..]          显式来路；to / intent 去向（to 沿路网排）；toStraight 直线
 *   straight           上一帧过来走直线（不排路网）
 *   climb              来去要下战壕 / 爬坎 / 过铁路桥（不报高差）；onLitter 躺在哪副担架 / 被子上（不报「站在担架上」）
 *   ride               §3 挂到车上 { on, x, z, y, yawDeg }（x / z 仍写车上那一点的世界坐标，车不在场时的备用）
 *   tending            跪在哪个伤员身边照料（不报与他重叠）
 *   wade               蹚沙河那一股水（齐小腿，不算站在水里）
 */
function U(id, side, at, o = {}) {
  const u = { id, side, x: R2(at.x), z: R2(at.z) };
  if (o.kind && o.kind !== "soldier") u.kind = o.kind;
  if (o.shape) u.shape = o.shape;
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

const POI = {
  laneShell: () => Poi("LaneShell", "身后一发炮落在胡同里", "danger", PL.laneShell, 3),
  villageFire: () => Poi("VillageFire", "庄子里一排排落炮，草顶烧着", "danger", Pt(110, 515), 14),
  beishahe: (kind = "landmark") => Poi("Beishahe", "官道尽头北沙河村的树和院墙", kind, Pt(120, 660), 12),
  fieldShell: () => Poi("FieldShell", "一发打偏落在路边麦地，土泼一车", "danger", PL.fieldShell, 3),
  gengSmoke: () => Poi("GengSmoke", "老耿家腾起黑烟（按「看」转过去）", "landmark", PL.gengSmoke, 6),
  ditch: (kind = "landmark") => Poi("AtDitch", "村口沟（比人深）和板桥", kind, PL.plankMid, 3),
  helmets: () => Poi("Helmets", "耿家庄村南口冒出两三顶钢盔", "danger", PL.helmetsAt, 3),
  slogan: () => Poi("Slogan", "墙上刷的大字标语", "landmark", Pt(L1218_SLOGANS[0].x + 1, L1218_SLOGANS[0].z), 2),
  familyHole: () => Poi("FamilyHole", "一家人往院里的洞里钻", "poi", Pt(FH.mouth.x + 1.2, FH.mouth.z), 1.6),
  oldMan: () => Poi("OldMan", "老汉坐在自家门口不走", "poi", L1218_OLD_MAN.at, 1.2),
  sleepers: () => Poi("SleeperPile", "门口码着铁路上拆来的枕木当柴", "landmark", Pt(L1218_SLEEPER_PILES[1].x, L1218_SLEEPER_PILES[1].z), 1.6),
  church: () => Poi("ChurchGate", "教堂门口：背着老人往里进，院里挤满了老乡", "landmark", SP(CH.gate.s, CH.d0 + 3), 3),
  aid: (kind = "objective") => Poi("AidGate", "救护所（七二七团借的院子）", kind, PL.aidGateOut, 2),
  girlHole: () => Poi("GirlHole", "隔壁院洞口探出一个女娃", "poi", GY.hole.mouth, 1.2),
  trench: (kind = "objective") => Poi("TrenchSquad", "沟口战壕（班长在这儿）", kind, PL.trenchSquad, 2),
  tankettes: () => Poi("Tankettes", "两辆九四式过不了沟，停在沟沿那边", "danger", PL.tankette1, 4),
  flare: () => Poi("Flare", "对面一颗信号弹拖着烟打上天", "danger", PL.flareAt, 4),
  planesEast: () => Poi("PlanesEast", "东边嗡嗡声：飞机", "danger", PL.planesFrom, 12),
  bombsTrench: () => Poi("BombsTrench", "飞机顺着北沿战壕和沟口扔小炸弹、扫射", "danger", Pt(140, 641), 18),
  planesStreet: () => Poi("PlanesStreet", "飞机掉头顺着街扫，往西头去", "danger", SP(60), 10),
  heizi: () => Poi("HeiziHit", "黑子挨了一梭，连车带驴翻在地上", "poi", CPK.heizi, 2),
  hole: (kind = "objective") => Poi("AidHoleA", "院里的洞（十几步外）", kind, A.holes[0].mouth, 1.6),
  planesDive: () => Poi("PlanesDive", "飞机掉头俯冲，声音越来越尖", "danger", Pt(150, 700), 12),
  bullets: (at) => Poi("BulletLine", "一串弹着点顺着院子地皮追过来", "danger", at, 2),
  planesGone: () => Poi("PlanesGone", "飞机拉起来往东飞走", "landmark", Pt(220, 650), 10),
  redSky: (at) => Poi("RedSky", "洞顶漏下一条红天", "landmark", at, 0.6),
  xiangDoor: (kind = "objective") => Poi("XiangDoor", "厢房门（有门槛）", kind, PL.xiangDoor, 1.2),
  dongguaInside: () => Poi("DongguaInside", "厢房里靠墙的空地", "objective", A.dongguaInside, 1.2),
  threshold: () => Poi("Threshold", "门槛", "poi", A.thresholdSeat, 0.8),
  girlYard: () => Poi("GirlYard", "隔壁院：女娃她娘把席子拉上", "poi", GY.hole.mouth, 1.4),
  sunWest: () => Poi("SunWest", "太阳落到铁路那头", "landmark", Pt(-150, 760), 6),
  railBridge: (kind = "objective") => Poi("RailBridge", "铁路桥（桥面只有枕木）", kind, Pt(RL.x, (RB.northZ + RB.southZ) / 2), 4),
  wade: () => Poi("Wade", "有老乡顺着陡岸滑下河床，蹚水过去", "poi", PL.wadeAt, 3),
  sappers: () => Poi("Sappers", "两个工兵在桥墩上绑炸药", "poi", Pt(RL.x + 2, RB.northZ + (RB.southZ - RB.northZ) / RB.spans), 2),
  mg18: (kind = "danger") => Poi("IjaMg18", "田里那挺机枪顺着路基扫", kind, PL.ijaMg18, 3),
  bank: () => Poi("Bank", "班长他们被压在桥北头土坎后头", "poi", PL.lastGroupCover, 3),
  blast: () => Poi("BridgeBlast", "「轰」北头两孔钢梁断开砸进河床", "landmark", Pt(RL.x, RB.northZ + 11), 6),
  lights: () => Poi("VillageLights", "北沙河村里几户人家亮着灯", "landmark", L1218_VILLAGE_LIGHTS[1], 6),
  northGate: (kind = "objective") => Poi("NorthGate", "滕县北门", kind, PL.northGate, 4),
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
  Sentry: { name: "七二七团哨兵", role: "sentry" },
  Captain: { name: "七二七团连长", kind: "officer", role: "captain727", castId: "frontOfficer" },
  Mg727: { name: "七二七团机枪", role: "machineGun", weapon: "Zb26", group: "ditch727" },
  Doctor: { name: "医官", role: "doctor", weapon: null },
  DoorGuard: { name: "守门的兵", role: "guard" },
  Officer18: { name: "七二七团军官", kind: "officer", role: "bridgeOfficer" },
  Sapper1: { name: "工兵", role: "sapper" }, Sapper2: { name: "工兵", role: "sapper" },
  Guide: { name: "带路的兵", role: "guide" },
};
const N = (id, at, o = {}) => U(id, "nra", at, { ...(NRA[id] || {}), ...o });
const CIV = {
  Geng: { name: "老耿", kind: "civilian", role: "carter" },
  Nier: { name: "妮儿", kind: "child" },
  GengCart: { name: "驴车", kind: "cart" },
  Heizi: { name: "黑子", kind: "animal" },
  OldMan: { name: "老汉", kind: "civilian", role: "oldMan" },
  Girl: { name: "女娃", kind: "child", role: "girl" },
  GirlMother: { name: "女娃她娘", kind: "civilian", role: "girlMother" },
  WaterMan: { name: "舀水的", kind: "civilian" },
};
/** 百姓：一律程序化身体（body procedural）；要放片段的那几帧显式写 body:"rig"。车 / 牲口没有身体字段。 */
const C = (id, at, o = {}) => {
  const base = CIV[id] || {}, kind = base.kind || o.kind || "civilian";
  const body = kind === "civilian" || kind === "child" ? { body: o.body || "procedural" } : {};
  return U(id, "civ", at, { ...base, kind, ...body, ...o });
};
const J = (id, at, o = {}) => U(id, "ija", at, o);
const SQUAD = ["Luo", "Yaowa", "HeYoutian", "Squad1", "Squad2"];

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

const PLAYER_NEAR = (p, dx, dz) => Off(p, dx, dz);
const TRENCH_E = (x) => Pt(x, TR.east[1].z);
const TRENCH_W = (x) => Pt(x, TR.west[0].z);
const TANK1 = Pt(PL.tankette1.x, PL.tankette1.z), TANK2 = Pt(PL.tankette2.x, PL.tankette2.z);
const DITCH_ARC = (from) => ArcTo(from, TRENCH_E(124), 16, 8);
/** 13 沟北边的鬼子：两辆九四式（kind tank、shape tankette）+ 车后、坟头后、田埂后散开的步兵。 */
const IjaNorth = ({ mode = "stand" } = {}) => {
  const g = (id) => L1218_GRAVES.find((x) => x.id === id);
  const prone = mode !== "advance";
  return [
    J("Tankette1", TANK1, { kind: "tank", shape: "tankette", name: "九四式 1", group: "tankettes", yaw: 180, arc: DITCH_ARC(TANK1), straight: true, speed: 2.0 }),
    J("Tankette2", TANK2, { kind: "tank", shape: "tankette", name: "九四式 2", group: "tankettes", yaw: Yaw(TANK2, PL.plankNorth), arc: ArcTo(TANK2, TRENCH_W(66), 14, 8), straight: true, speed: 2.0 }),
    J("IjaInf1", Off(TANK1, 1.4, -3.2), { role: "rifleman", group: "north", stance: "crouch", aim: true, face: TRENCH_E(124), straight: true }),
    J("IjaInf2", Off(TANK2, -1.6, -3.0), { role: "rifleman", group: "north", stance: "crouch", aim: true, face: TRENCH_W(70), straight: true }),
    J("IjaInf3", Pt(g("G_N1").x, g("G_N1").z - 1.7), { role: "rifleman", group: "north", stance: prone ? "prone" : "crouch", aim: true, face: PL.plankMid, straight: true }),
    J("IjaInf4", Pt(g("G_N2").x, g("G_N2").z - 1.6), { role: "rifleman", group: "north", stance: prone ? "prone" : "crouch", aim: true, face: TRENCH_E(124), straight: true }),
    J("IjaInf5", Pt(68, 610.2), { role: "rifleman", group: "north", stance: "prone", aim: true, face: TRENCH_W(64), straight: true }),
    J("IjaInf6", Pt(128, 610.2), { role: "rifleman", group: "north", stance: "prone", aim: true, face: TRENCH_E(130), straight: true }),
    J("IjaInf7", Pt(144, 610.2), { role: "rifleman", group: "north", stance: "prone", aim: true, face: TRENCH_E(140), straight: true }),
    J("IjaOfficer", Off(TANK2, 2.2, -4.4), { kind: "officer", name: "鬼子军官", group: "north", face: PL.plankMid, straight: true }),
  ];
};
/** 七二七团守沟口的：沟两边战壕里的兵、沟东头南沿那挺机枪。 */
const Ditch727 = ({ stance = "stand", aim = true, skip = new Set(), down = new Set() } = {}) => [
  N("Mg727", PL.mg727, { stance: "prone", aim, face: PL.junction, arc: ArcTo(PL.mg727, PL.junction, 14, 10), climb: true }),
  ...[["S727_W1", TRENCH_W(58)], ["S727_W2", TRENCH_W(64)], ["S727_W3", TRENCH_W(70)], ["S727_E1", TRENCH_E(132)], ["S727_E2", TRENCH_E(136)], ["S727_E3", TRENCH_E(142)], ["S727_E4", TRENCH_E(150)]]
    .filter(([id]) => !skip.has(id))
    .map(([id, p]) => N(id, p, { name: id === "S727_W1" ? "七二七团兵" : undefined, role: "rifleman727", group: "ditch727", stance: down.has(id) ? "stand" : stance, aim: aim && !down.has(id), face: Pt(p.x, 600), climb: true, ...(down.has(id) ? { down: true } : {}) })),
];
/** 沟口东段战壕里的班长他们（13 起）。 */
const SQUAD_TRENCH = Object.freeze({ Luo: TRENCH_E(PL.trenchSquad.x), Yaowa: TRENCH_E(119.2), HeYoutian: TRENCH_E(125.6), Squad1: TRENCH_E(127.6), Squad2: TRENCH_E(129.8) });
const PLAYER_TRENCH = TRENCH_E(123.6);
const SquadInTrench = ({ stance = "stand", aim = true, face = TANK1, skip = new Set() } = {}) =>
  Object.entries(SQUAD_TRENCH).filter(([id]) => !skip.has(id)).map(([id, p]) => N(id, p, { stance, aim, face, guess: id.startsWith("Squad"), climb: true }));

// 救护所院里：医官、伤员、帮忙的兵
const AID_WOUNDED = Object.freeze([Pt(70.2, 677.4), Pt(73.8, 677.0), Pt(77.6, 677.4), Pt(81.0, 677.8), Pt(69.6, 680.6), Pt(79.4, 681.4), Pt(82.4, 684.4), Pt(71.6, 690.6)]);
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
const DOOR_GUARD = Pt(68.4, 683.4);
const AidPeople = ({ doctor = true, doctorAt = DOCTOR_PRESS, doctorFace = null, doctorStance = "crouch", guard = true, skip = new Set() } = {}) => [
  ...(doctor ? [N("Doctor", doctorAt, { ...(doctorFace ? { face: doctorFace } : { yaw: DOCTOR_PRESS.yawDeg }), stance: doctorStance, tending: DOCTOR_PATIENT_ID })] : []),
  ...(guard ? [N("DoorGuard", DOOR_GUARD, { face: Pt(74, 686) })] : []),
  N("AidHelper", Pt(82.0, 675.2), { name: "七二七团兵（烧水）", role: "helper727", weapon: null, face: Pt(86, 676) }),
  ...AidWounded({ skip }),
];
/** 院里的两个伤员（车上卸下来的）。 */
const CART_WOUNDED_IN_YARD = Object.freeze({ Wounded1: Pt(84.6, 688.2), Wounded2: Pt(84.8, 692.4) });
const CartWoundedInYard = (o = {}) => Object.entries(CART_WOUNDED_IN_YARD).map(([id, p]) => N(id, p, { group: "aid", down: true, yaw: 0, ...(o[id] || {}) }));
// 冬瓜搁的墙根：被子顺着东墙、头朝北
const WALL_ROOT = Pt(A.wallRootDonggua.x, A.wallRootDonggua.z);
const HOLE_A = A.holes[0];
const HoleA = (u, v = 0) => { const D = HOLE_A.dir; return Pt(HOLE_A.mouth.x + D.x * u - D.z * v, HOLE_A.mouth.z + D.z * u + D.x * v); };
const CHAMBER_A = HoleA(HOLE_A.rampM + HOLE_A.chamber.d / 2);
/** 进洞 / 出洞走坡道（不从洞壁上翻）：lat = 横着偏多少。 */
const HoleIn = (target, lat = 0) => [Pt(HOLE_A.mouth.x + 1.2, HOLE_A.mouth.z + lat * 0.5), HoleA(0.3, lat * 0.5), HoleA(HOLE_A.rampM - 0.4, lat * 0.6), target];
const HoleOut = (target, lat = 0) => [HoleA(HOLE_A.rampM - 0.4, lat * 0.6), HoleA(0.2, lat * 0.5), Pt(HOLE_A.mouth.x + 1.0, HOLE_A.mouth.z - 1.0), target];

// 18：七二七团一拨守着一拨往后撤；南头河堤后的军官、兵；工兵；北边田里的鬼子
const LEVEE_CREST = (x) => Pt(x, LV.z);
const BEHIND_LEVEE = (x) => Pt(x, LV.z + 2.6);
const FOXHOLE = (x) => Pt(x, LV.foxhole.z);
const SPAN = (RB.southZ - RB.northZ) / RB.spans;
const PIER = (i) => Pt(RL.x + RB.pier.w / 2 + 0.6, RB.northZ + SPAN * i - 0.6);   // 桥墩东边河床上（工兵站的地方）
const LAST_COVER = Pt(PL.lastGroupCover.x, PL.lastGroupCover.z);
const MG18 = Pt(PL.ijaMg18.x, PL.ijaMg18.z);
const MG18_ARC = ArcTo(MG18, Pt(RL.x + 6, RB.northZ - 6), 14, 10);
const IjaField18 = ({ mgDown = false, near = false } = {}) => [
  J("IjaMg18", MG18, { name: "田里那挺机枪", role: "machineGun", weapon: "Type11", group: "mg18", stance: "prone", aim: !mgDown, ...(mgDown ? { down: true } : { arc: MG18_ARC }), yaw: MG18_ARC.yawDeg, straight: true }),
  J("IjaMg18Loader", Off(MG18, 1.3, -0.9), { name: "副射手", role: "loader", group: "mg18", stance: "prone", face: LAST_COVER, straight: true, ...(mgDown ? { down: true } : {}) }),
  ...(near
    ? [Pt(-64, 722), Pt(-56, 716), Pt(-48, 724), Pt(-72, 714), Pt(-40, 719), Pt(-60, 708)]
    : [Pt(-58, 708), Pt(-48, 701), Pt(-38, 712), Pt(-66, 700), Pt(-28, 706), Pt(-52, 694)]).map((p, i) => J(`IjaField${i + 1}`, p, { role: "rifleman", group: "field18", stance: i % 3 === 0 ? "prone" : "crouch", aim: true, face: LAST_COVER, straight: true, speed: 2.4 })),
];
/** 班长他们缩在桥北土坎后（18-4）。 */
const LAST_SLOTS = Object.freeze({ Luo: Off(LAST_COVER, -4.0, 0), Yaowa: Off(LAST_COVER, -1.6, 0.4), HeYoutian: Off(LAST_COVER, 0.8, 0), Squad1: Off(LAST_COVER, 3.2, 0.5), Squad2: Off(LAST_COVER, 5.6, 0) });

// ---------------------------------------------------------------------------
// 关键帧

function Keyframes() {
  const K = [];
  const Add = (kf) => K.push(kf);

  // ======================= 11 冒着炮出村南口 =======================
  const s11 = { stage: 11, stageTitle: "出村南口" };
  const c111 = CartOn(7);
  const p111 = Pt(PL.villageSouth.x, 546.4);
  Add({
    id: "11-1", ...s11, name: "出胡同口",
    player: { x: p111.x, z: p111.z, yawDeg: 180, pitchDeg: -2, stance: "stand" },
    what: "全班冒着炮冲出村南口；车停在口外，担架员把冬瓜横搁上车板。",
    next: { text: "跟车往南", x: CL(30).x, z: CL(30).z, radiusM: 4 },
    how: ["顺子最后一个出胡同口，身后一发炮落在胡同里；庄子里一排排落炮，草顶烧着", "老耿的车停在村南口外，黑子一炸一跳，老耿拽着笼头",
      "往南看：一条土路穿过麦地接上官道，官道尽头是北沙河村的树和院墙，村口那一带有兵在动", "担架员把冬瓜和另外两个肚子挨了枪的横搁上车板（冬瓜靠车尾），妮儿坐车尾沿，车就动了"],
    notes: "村南口 (117,545) 是 0610 窄胡同出村的地方；土路从这里往南 58 m 接官道。车停在口外的土路上朝南；三副担架横搁在车板上（ride 挂在 GengCart 上，车板顶 1.025 m），冬瓜靠车尾。"
      + "百姓一律程序化身体（body procedural）。",
    signals: [],
    units: [
      ...CartGroup(c111, { gengFace: c111.heizi }),
      N("Bearer1", CartWorld(c111.cart, c111.yaw, { x: -1.6, z: 0.9 }), { face: c111.cart }),
      N("Bearer2", CartWorld(c111.cart, c111.yaw, { x: 1.6, z: 0.9 }), { face: c111.cart }),
      N("Luo", Pt(115.4, 549.6), { face: CL(20) }),
      N("Yaowa", Pt(120.2, 550.6), { face: CL(20) }),
      N("HeYoutian", Pt(115.0, 551.8), { face: CL(20) }),
      N("Squad1", Pt(119.0, 548.8), { face: CL(20), guess: true }),
      N("Squad2", Pt(119.4, 553.6), { face: CL(20), guess: true }),
      N("LiuWencai", Pt(118.6, 546.6), { face: p111 }),
      C("Nier", Pt(115.2, 553.4), { face: c111.cart }),
    ],
    pois: [POI.laneShell(), POI.villageFire(), POI.beishahe()],
  });

  const c112 = CartOn(13);
  const p112 = Pt(118.4, 553.2);
  Add({
    id: "11-2", ...s11, name: "往北沙河撤",
    player: { x: p112.x, z: p112.z, yawDeg: Yaw(p112, CL(24)), pitchDeg: -2, stance: "stand" },
    what: "车动了；班长：往北沙河撤！七二七团在那！车拉伤员，跟斗走！",
    next: { text: "跟车往北沙河", x: CL(40).x, z: CL(40).z, radiusM: 4 },
    how: ["车就动了，妮儿坐在车尾沿", "班长：「往北沙河撤！七二七团在那！车拉伤员，跟斗走！」", "全班跟车往南跑", "担架员往回跑接下一副（出画）"],
    notes: "妮儿坐车尾沿（ride：z +1.2、y 0.467、背对车头，程序化身体）。班长一行在车前后跑（intent 指向土路前头）。",
    signals: [],
    units: [
      ...CartGroup(c112, { nier: "tail", speed: 1.4 }),
      N("Bearer1", Pt(116.0, 548.4), { face: Pt(117, 540), to: Pt(117, 540) }),
      N("Bearer2", Pt(118.0, 548.0), { face: Pt(117, 540), to: Pt(117, 541.5) }),
      N("Luo", Pt(115.6, 555.4), { face: p112, speed: 3.0, to: CL(36, 1.6) }),
      N("Yaowa", CL(22, -1.8), { yaw: c112.yaw, speed: 3.0, to: CL(40, -1.8) }),
      N("HeYoutian", CL(20, 2.0), { yaw: c112.yaw, speed: 3.0, to: CL(38, 2.0) }),
      N("Squad1", CL(24, 1.6), { yaw: c112.yaw, speed: 3.0, guess: true, to: CL(42, 1.6) }),
      N("Squad2", CL(5, -1.6), { yaw: c112.yaw, speed: 3.0, guess: true, to: CL(26, -1.6) }),
      N("LiuWencai", Pt(119.2, 555.0), { face: c112.cart }),
    ],
    pois: [POI.villageFire(), POI.beishahe("objective")],
  });

  // ======================= 12 进北沙河村 =======================
  const s12 = { stage: 12, stageTitle: "进北沙河村" };
  const c121 = CartOn(32);
  const p121 = CartWorld(c121.cart, c121.yaw, { x: -1.0, z: 1.7 });
  Add({
    id: "12-1", ...s12, name: "路上",
    player: { x: p121.x, z: p121.z, yawDeg: c121.yaw, pitchDeg: -4, stance: "stand" },
    what: "车顺土路往南；身后一发炮打偏落在路边麦地，土泼一车。冬瓜：……到了没得？",
    next: { text: "跟车进北沙河村", x: PL.plankNorth.x, z: PL.plankNorth.z - 3, radiusM: 4 },
    how: ["车顺土路往南，老耿一手笼头一手鞭子；顺子在车尾扶车帮，刘文财在车另一边", "身后一发炮打偏落在路边麦地，土泼一车", "冬瓜睁眼：「……到了没得？」顺子：「快了！」", "任务字：跟车进北沙河村"],
    notes: "土路宽 3 m、压低 8 cm，两边返青麦地。班长他们在车前头走。",
    signals: [],
    units: [
      ...CartGroup(c121, { nier: "tail", speed: 1.4 }),
      N("LiuWencai", CartWorld(c121.cart, c121.yaw, { x: 1.1, z: 0.6 }), { yaw: c121.yaw, speed: 1.4 }),
      N("Luo", CL(48, 0.6), { yaw: CL(48).heading, speed: 2.0 }),
      N("Yaowa", CL(45, -1.0), { yaw: CL(45).heading, speed: 2.0 }),
      N("HeYoutian", CL(44, 1.0), { yaw: CL(44).heading, speed: 2.0 }),
      N("Squad1", CL(26, 1.2), { yaw: c121.yaw, speed: 2.0, guess: true }),
      N("Squad2", CL(24, -1.2), { yaw: c121.yaw, speed: 2.0, guess: true }),
    ],
    pois: [POI.fieldShell(), POI.villageFire(), POI.beishahe("objective")],
  });

  const c122 = CartOn(64);
  const p122 = CartWorld(c122.cart, c122.yaw, { x: -1.2, z: 2.2 });
  Add({
    id: "12-2", ...s12, name: "炮停",
    player: { x: p122.x, z: p122.z, yawDeg: Yaw(p122, PL.gengSmoke), pitchDeg: 4, stance: "stand" },
    what: "身后炮停，静得出奇；庄子里「轰」一声——按「看」：老耿家腾起黑烟。",
    next: { text: "跟车进北沙河村", x: PL.plankNorth.x, z: PL.plankNorth.z - 3, radiusM: 4 },
    how: ["身后炮停，静得出奇。两三秒后庄子里「轰」一声，跟着「叮」，屏幕出「看」的按键（美末式）：按了视角转去看老耿家腾起黑烟，不按三秒消失",
      "刘文财：「狗日的进了老耿家了！」顺子：「莫看了！走！」", "老耿回头看一眼烟，扬鞭", "车刚拐上官道（交叉口在 (106,602)）"],
    notes: "「看」的按键是美末式提示（POI GengSmoke 标在老耿家院子）。往北回头看：耿家庄的南墙和窄胡同口，往南看：官道尽头村口那一带有兵在动。",
    signals: [],
    units: [
      ...CartGroup(c122, { nier: "tail", gengFace: PL.gengSmoke }),
      N("LiuWencai", CartWorld(c122.cart, c122.yaw, { x: 1.2, z: 1.0 }), { face: PL.gengSmoke }),
      N("Luo", CL(78, 0.8), { yaw: CL(78).heading, speed: 2.0 }),
      N("Yaowa", CL(75, -1.0), { yaw: CL(75).heading, speed: 2.0 }),
      N("HeYoutian", CL(74, 1.0), { yaw: CL(74).heading, speed: 2.0 }),
      N("Squad1", CL(58, 1.3), { yaw: c122.yaw, guess: true }),
      N("Squad2", CL(56, -1.3), { yaw: c122.yaw, guess: true }),
    ],
    pois: [POI.gengSmoke(), POI.ditch()],
  });

  // 12-3 沟口：哨兵盘问、连长；12-4 黑子不走、妮儿牵它过板桥、钢盔冒头
  const c123 = CartOn(80.4);
  const sentry = Pt(PL.sentry.x, PL.sentry.z), captain123 = Pt(97.4, 640.4);
  const p123 = Pt(99.6, 625.4);
  Add({
    id: "12-3", ...s12, name: "沟口",
    player: { x: p123.x, z: p123.z, yawDeg: Yaw(p123, sentry), pitchDeg: -4, stance: "stand" },
    what: "官道走到头是一道比人深的沟，只留门板搭的板桥。哨兵：站到！哪部分的？",
    next: { text: "过板桥进村", x: PL.plankSouth.x, z: PL.plankSouth.z + 3, radiusM: 3 },
    how: ["官道走到头是一道比人深的沟，把路齐齐截断，沟那边堆着枣树枝和杂木，只留几块门板搭的板桥，刚够一辆车", "沟沿上七二七团的兵还在往杂木堆上添树枝，沟两边是战壕和铁丝网",
      "哨兵端枪：「站到！哪部分的？」班长：「前头撤下来的！车上是伤兵！」", "七二七团一个连长过来扫了一眼：「伤兵往村西头送，救护所在那。你们几个——留到这儿，后头还有人要撤进来。」"],
    notes: `村口反坦克沟深 ${R1(VL.y - AT.floorY)} m、顶宽 ${AT.topW} m、长 ${AT.toX - AT.fromX} m（x ${AT.fromX}…${AT.toX}），沟南沿堆杂木；板桥宽 ${PK.w}、长 ${PK.toZ - PK.fromZ}，底下垫土墩（白盒：演员站得上桥面）。`
      + "七二七团的兵是 NRA 骨骼身体，用名字区分（哨兵、连长）。",
    signals: [],
    units: [
      ...CartGroup(c123, { nier: "tail", gengFace: sentry }),
      N("LiuWencai", CartWorld(c123.cart, c123.yaw, { x: 1.3, z: 1.4 }), { face: sentry }),
      N("Luo", Pt(96.2, 628.8), { face: sentry }),
      N("Yaowa", Pt(94.6, 627.6), { face: sentry }),
      N("HeYoutian", Pt(100.6, 628.2), { face: sentry }),
      N("Squad1", Pt(95.0, 624.6), { face: sentry, guess: true }),
      N("Squad2", Pt(101.4, 622.4), { face: sentry, guess: true }),
      N("Sentry", sentry, { aim: true, face: Pt(97, 626) }),
      N("Captain", captain123, { face: PL.plankNorth, from: SP(8, 0.6) }),
      N("Branch1", Pt(89.8, 639.7), { name: "七二七团兵（添树枝）", role: "rifleman727", weapon: null, face: Pt(89.8, 636.8) }),
      N("Branch2", Pt(105.2, 640.0), { role: "rifleman727", weapon: null, face: Pt(105.2, 636.8) }),
      ...Ditch727({ aim: false, skip: new Set(["S727_E3", "S727_E4"]) }),
    ],
    pois: [POI.ditch("objective"), Poi("Abatis", "杂木（枣树枝）", "landmark", Pt(90, 636.9), 2)],
  });

  const c124 = CartOn(84.2);
  const heizi124 = c124.heizi, nier124 = Pt(PK.x, PK.fromZ + 0.9);
  const p124 = Pt(99.4, 627.0);
  Add({
    id: "12-4", ...s12, name: "黑子不走",
    player: { x: p124.x, z: p124.z, yawDeg: Yaw(p124, nier124), pitchDeg: -8, stance: "stand" },
    what: "黑子到板桥头低头看沟，四条腿一撑不走；妮儿捧它的脸，攥着笼头上了板桥。",
    next: { text: "跟车过板桥", x: PL.plankSouth.x, z: PL.plankSouth.z + 3, radiusM: 3 },
    how: ["黑子到板桥头低头看沟，四条腿一撑不走，老耿抽它，它往后坐", "妮儿溜下车跑到黑子头前，两手捧它的脸、脑门贴上去，攥着笼头上了板桥，黑子跟她过去。从这起妮儿牵着黑子走最前头",
      "身后耿家庄村南口冒出两三顶钢盔，沟沿上七二七团的机枪一响，钢盔缩回去", "班长对顺子：「送到了就回来。」"],
    notes: "妮儿站在板桥北头的门板上（程序化身体，捧脸那一下预演里做）。钢盔在耿家庄村南口外 (117,549)，七二七团的机枪在沟东头南沿 (114.4,638.6)，相距约 90 m。",
    signals: [],
    units: [
      ...CartGroup(c124, { gengSide: -1.3, gengFace: heizi124 }),
      C("Nier", nier124, { face: heizi124 }),
      N("LiuWencai", CartWorld(c124.cart, c124.yaw, { x: 1.3, z: 1.2 }), { face: heizi124 }),
      N("Luo", Pt(101.2, 627.8), { face: p124 }),
      N("Yaowa", Pt(94.2, 626.4), { face: PL.helmetsAt }),
      N("HeYoutian", Pt(102.6, 625.6), { face: PL.helmetsAt }),
      N("Squad1", Pt(94.4, 622.6), { face: PL.helmetsAt, guess: true }),
      N("Squad2", Pt(101.8, 621.8), { face: PL.helmetsAt, guess: true }),
      N("Sentry", sentry, { face: Pt(97, 626) }),
      N("Captain", captain123, { face: PL.plankNorth }),
      N("Branch1", Pt(89.8, 639.7), { role: "rifleman727", weapon: null, face: Pt(89.8, 636.8) }),
      N("Branch2", Pt(105.2, 640.0), { role: "rifleman727", weapon: null, face: Pt(105.2, 636.8) }),
      ...Ditch727({ skip: new Set(["S727_E3", "S727_E4"]) }),
      ...[Pt(116.2, 548.6), Pt(119.0, 549.4), Pt(113.8, 549.8)].map((p, i) => J(`Helmet${i + 1}`, p, { role: "rifleman", group: "helmets", stance: "crouch", aim: true, face: PL.plankMid, straight: true })),
    ],
    pois: [Poi("HeiziBalks", "黑子在板桥头不走", "poi", heizi124, 1.5), POI.helmets(), POI.ditch()],
  });

  // 12-5 穿村：老汉门口、标语、钻洞的一家（车在主街 s 12）；12-6 枕木垛、教堂（车在往西拐的地方）；12-7 救护所
  const c125 = CartOn(STREET_D0 + 12);
  const p125 = CartWorld(c125.cart, c125.yaw, { x: -1.1, z: 1.6 });
  const famMouth = FH.mouth, famIn = Pt(famMouth.x + 0.7, famMouth.z);
  Add({
    id: "12-5", ...s12, name: "穿村",
    player: { x: p125.x, z: p125.z, yawDeg: Yaw(p125, L1218_OLD_MAN.at), pitchDeg: -2, stance: "stand" },
    what: "主街斜穿村子：墙上刷着大字标语；一家人往院里的洞里钻；老汉坐在门口不走。",
    next: { text: "跟车去村西头", x: L1218_WEST_TURN.x, z: L1218_WEST_TURN.z, radiusM: 4 },
    how: ["官道就是村里的主街，斜着往东南穿过去；墙上刷着大字标语（「打倒日本帝国主义」之类）", "一家人往院里的洞里钻，最后一个拿席子盖住洞口",
      "一个老汉坐在自家门口不走。老耿：「老哥，咋不走？」老汉：「走哪去？家在这儿。」", "自己走、跟车；一路看得见，不解释、没人讲"],
    notes: "老汉家在主街西南侧、靠沟口那头（S1，院门朝街）；钻洞的一家在主街东北侧（N1，院门开在西墙、正对着洞）。标语是朝街墙上的浅色长条（地标写着字）。全是程序化身体。",
    signals: [],
    units: [
      ...CartGroup(c125, { nier: "lead", gengSide: -1.2, gengFace: L1218_OLD_MAN.at }),
      N("LiuWencai", CartWorld(c125.cart, c125.yaw, { x: 1.2, z: 1.0 }), { yaw: c125.yaw }),
      C("OldMan", L1218_OLD_MAN.at, { stance: "stand", yaw: L1218_OLD_MAN.yawDeg }),
      C("Fam1", famIn, { kind: "child", name: "钻洞的一家", group: "family", face: Pt(famIn.x + 2, famIn.z) }),
      C("Fam2", Pt(famMouth.x - 0.6, famMouth.z - 0.9), { group: "family", face: famIn }),
      C("Fam3", Pt(famMouth.x - 1.0, famMouth.z + 0.9), { group: "family", role: "matCarrier", face: famIn }),
      N("Sentry", sentry, { face: Pt(97, 626) }),
    ],
    pois: [POI.slogan(), POI.familyHole(), POI.oldMan()],
  });

  const c126 = CartOn(STREET_D0 + 57);
  const p126 = CartWorld(c126.cart, c126.yaw, { x: -1.1, z: 1.8 });
  const cgate = SP(CH.gate.s, CH.d0 - 1.0), cIn = (s, d) => SP(s, d);
  Add({
    id: "12-6", ...s12, name: "教堂门口",
    player: { x: p126.x, z: p126.z, yawDeg: Yaw(p126, cgate), pitchDeg: 0, stance: "stand" },
    what: "门口码着拆来的枕木；教堂门口有人背着老人往里进，院里挤满了老乡。车往西拐。",
    next: { text: "跟车去救护所", x: PL.aidGateOut.x, z: PL.aidGateOut.z, radiusM: 3 },
    how: ["门口码着一垛铁路上拆来的枕木当柴", "教堂门口：有人提着包袱、背着老人往里进，门边有人张罗着放人；院门开着，看得见院里挤满了老乡",
      "车在中间往西拐进一条街去村西头", "钻洞那家的洞口已经拿席子盖上了"],
    notes: "教堂是「德国教堂（位置是创作）」：主街东北侧一座带围墙的院子，顺着街斜摆、院门朝街敞着，礼拜堂比民房高、前头一座钟楼。往西拐的地方正对教堂院门。FamilyHidden 从这一帧起。",
    signals: [SIG.familyHidden],
    units: [
      ...CartGroup(c126, { nier: "lead", gengSide: -1.2 }),
      N("LiuWencai", CartWorld(c126.cart, c126.yaw, { x: 1.2, z: 1.0 }), { yaw: c126.yaw }),
      C("ChurchKeeper", SP(CH.gate.s + 2.4, CH.d0 + 1.0), { name: "张罗着放人的", group: "church", face: cgate }),
      C("ChurchIn1", SP(CH.gate.s - 0.8, CH.d0 - 0.6), { name: "背着老人的", role: "carryingElder", group: "church", face: SP(CH.gate.s, CH.d0 + 4) }),
      C("ChurchIn2", SP(CH.gate.s + 0.6, CH.d0 - 1.8), { role: "refugeeWithBundle", group: "church", face: SP(CH.gate.s, CH.d0 + 4) }),
      C("ChurchIn3", SP(CH.gate.s - 2.4, CH.d0 - 1.6), { role: "refugeeWithChild", group: "church", face: SP(CH.gate.s, CH.d0 + 4) }),
      ...[[56, 8.5], [58.5, 10.5], [61, 8], [63.5, 11], [66.5, 9], [69, 11.5], [71.5, 8.5], [73.5, 12], [60, 13.5], [64.5, 14], [68.5, 14.6], [72, 15.4]]
        .map(([s, d], i) => C(`ChurchCrowd${String(i + 1).padStart(2, "0")}`, cIn(s, d), { group: "church", kind: i % 5 === 3 ? "child" : "civilian", face: cIn(65, 6) })),
      C("OldMan", L1218_OLD_MAN.at, { yaw: L1218_OLD_MAN.yawDeg }),
    ],
    pois: [POI.sleepers(), POI.church(), POI.aid()],
  });

  // 12-7 救护所：冬瓜连单被搁在墙根；医官「排到」；隔壁塌墙那边女娃探出头；「到了。」
  const blanket127 = WALL_ROOT, p127 = Pt(89.6, 692.8);
  const girl = Pt(GY.hole.mouth.x, GY.hole.mouth.z + 0.7), nier127 = Pt(86.8, 697.6);
  Add({
    id: "12-7", ...s12, name: "救护所",
    player: { x: p127.x, z: p127.z, yawDeg: Yaw(p127, blanket127), pitchDeg: -14, stance: "stand" },
    what: "院里地上躺满了；医官：肚子上的？排到。隔壁塌墙那边，洞口探出一个女娃。",
    next: { text: "回沟口", x: PL.trenchSquad.x, z: PL.trenchSquad.z, radiusM: 3 },
    how: ["村西头七二七团借的一个院子，院里地上躺满了。医官满手是血，扫一眼冬瓜：「肚子上的？排到。」", "冬瓜连单被一起被搁在院里墙根",
      "隔壁院墙塌了半截，看得见那家院里的洞口探出一个跟妮儿差不多大的女娃，妮儿看着她", "冬瓜：「……到了没得？」顺子：「到了。」顺子转身往回跑。任务字：回沟口"],
    notes: "冬瓜从这一帧起躺在自己那床单被上（BlanketDonggua，布料模拟），顺着东墙根、头朝北。车停在院门外那块空地上（车朝西、黑子在车辕里）。另外两个伤员卸在院里。"
      + "女娃（程序化身体）站在她家洞的坡道里，只露上半身。",
    signals: [SIG.familyHidden],
    units: [
      C("GengCart", CPK.cart, { yaw: CPK.yawDeg }),
      C("Heizi", CPK.heizi, { yaw: CPK.yawDeg }),
      C("Geng", Pt(95.4, 684.6), { face: CPK.heizi }),
      ...DongguaOnBlanket(blanket127, { yaw: 0 }),
      ...CartWoundedInYard(),
      C("Nier", nier127, { face: girl }),
      C("Girl", girl, { face: nier127 }),
      N("LiuWencai", Pt(87.6, 695.0), { face: blanket127 }),
      N("Doctor", Pt(88.0, 698.2), { face: blanket127 }),
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
    C("Geng", Pt(86.8, 694.4), { face: WALL_ROOT }), C("Nier", Pt(86.6, 697.8), { face: WALL_ROOT }), N("LiuWencai", Pt(87.6, 692.6), { face: WALL_ROOT }),
    ...AidPeople(),
  ];
  Add({
    id: "13-1", ...s13, name: "回沟口",
    player: { x: p131.x, z: p131.z, yawDeg: Yaw(p131, TANK1), pitchDeg: 0, stance: "stand" },
    what: "追兵顺官道撵过来了，两辆九四式冲到沟前过不去，停在沟沿那边拿机枪扫。",
    next: { text: "打车后头露头的步兵", x: TANK1.x, z: TANK1.z - 3, radiusM: 4 },
    how: ["顺子跳回沟边的战壕，挨着班长", "追兵顺官道撵过来了，路上会合的两辆九四式轻装甲车开在前头", "车冲到沟前过不去，停在沟沿那边拿机枪扫我们这边的沟沿；步兵在车后、坟头后、田埂后散开", "车打不动，不要求打车；车的机枪一扫就得缩头"],
    notes: `九四式用 0105 那套占位（kind tank、shape tankette；3.36 × 1.62 m、一挺机枪、没有炮），停在沟北沿外的官道上（${TANK1.x},${TANK1.z}）/（${TANK2.x},${TANK2.z}）。`
      + "战壕底 −0.9（深 1.2），站在壕底眼睛越过北沿的堆土看得见车和坟头（场景生成器核过）。",
    signals: [SIG.familyHidden],
    units: [...SquadInTrench(), ...Ditch727(), N("Sentry", Pt(99.4, 641.6), { stance: "crouch", aim: true, face: TANK1 }), N("Captain", TRENCH_W(72.6), { face: TANK2, climb: true }), ...IjaNorth(), ...YardRest()],
    pois: [POI.tankettes(), Poi("Graves", "坟头后、田埂后趴开的鬼子", "danger", Pt(84, 612), 4)],
  });

  const RUNNERS = [[Pt(78, 604), "stand"], [Pt(72, 598), "stand"], [Pt(86, 618), "stand"], [Pt(82, 610), "down"], [Pt(66, 592), "stand"], [Pt(90, 624), "stand"]];
  Add({
    id: "13-2", ...s13, name: "有人往沟口跑",
    player: { x: p131.x, z: p131.z, yawDeg: Yaw(p131, Pt(84, 612)), pitchDeg: 0, stance: "stand" },
    what: "三五个撤下来的兵和几个百姓从田里往沟口跑，有的倒在半路，有的扑上板桥爬过来。",
    next: { text: "压住冲板桥的鬼子", x: PL.plankNorth.x, z: PL.plankNorth.z - 4, radiusM: 4 },
    how: ["中途有三五个撤下来的兵和几个百姓从田里往沟口跑，有的倒在半路，有的扑上板桥爬过来", "玩家真打：打车后头露头的步兵；车的机枪一扫就得缩头", "步兵冲板桥就打回去", "一时谁也过不去"],
    notes: "跑的人从沟北西边的麦地斜着奔板桥；倒在半路的是程序化身体倒地（state down）。",
    signals: [SIG.familyHidden],
    units: [
      ...SquadInTrench({ face: Pt(84, 612) }), ...Ditch727(), N("Sentry", Pt(99.4, 641.6), { stance: "crouch", aim: true, face: TANK1 }), N("Captain", TRENCH_W(72.6), { face: TANK2 }), ...IjaNorth(),
      ...RUNNERS.map(([p, st], i) => (i % 2 ? C(`Runner${i + 1}`, p, { role: "refugee", group: "runners", face: PL.plankNorth, ...(st === "down" ? { down: true } : {}), fromStraight: true, from: Off(p, -14, -10) })
        : N(`Runner${i + 1}`, p, { role: "straggler", group: "runners", face: PL.plankNorth, ...(st === "down" ? { down: true } : {}), fromStraight: true, from: Off(p, -14, -10) }))),
      N("Crawler", Pt(PK.x, PK.fromZ + 1.6), { name: "扑上板桥爬过来的", role: "straggler", group: "runners", stance: "prone", face: PL.plankSouth }),
      ...YardRest(),
    ],
    pois: [Poi("Runners", "撤下来的人从田里往沟口跑", "poi", Pt(78, 606), 6), POI.ditch()],
  });

  Add({
    id: "13-3", ...s13, name: "信号弹",
    player: { x: p131.x, z: p131.z, yawDeg: Yaw(p131, PL.planesFrom), pitchDeg: 12, stance: "prone" },
    what: "对面一颗信号弹拖着烟打上天；几秒后东边嗡嗡声。有人喊：飞机！趴倒！",
    next: { text: "趴倒" },
    how: ["对面一颗信号弹拖着烟打上天", "几秒后东边嗡嗡声", "有人喊：「飞机！趴倒！」屏幕出卧倒提示", "跑过来的人有的爬过了板桥，有的倒在沟北边"],
    notes: "信号弹没有单位（预演里用信号弹特效），关键帧用 POI。玩家在壕里趴下。",
    signals: [SIG.familyHidden],
    units: [
      ...SquadInTrench({ stance: "crouch", face: PL.planesFrom, aim: false }), ...Ditch727({ stance: "crouch" }), N("Sentry", Pt(99.4, 641.6), { stance: "prone", face: TANK1 }), N("Captain", TRENCH_W(72.6), { stance: "crouch", face: PL.planesFrom }), ...IjaNorth(),
      N("Runner1", Pt(98.8, 643.0), { role: "straggler", group: "runners", stance: "prone", face: PL.planesFrom }), C("Runner2", Pt(95.2, 643.6), { role: "refugee", group: "runners", stance: "prone", face: PL.planesFrom }),
      N("Runner3", Pt(86, 618), { role: "straggler", group: "runners", down: true }), C("Runner4", Pt(82, 610), { role: "refugee", group: "runners", down: true }),
      ...YardRest(),
    ],
    pois: [POI.flare(), POI.planesEast()],
  });

  // ======================= 14 空袭，救护所院里松手 =======================
  const s14 = { stage: 14, stageTitle: "空袭" };
  Add({
    id: "14-1", ...s14, name: "扫沟口",
    player: { x: p131.x, z: p131.z, yawDeg: Yaw(p131, Pt(160, 630)), pitchDeg: 10, stance: "prone" },
    what: "两架飞机顺着村北沿的战壕和沟口扔小炸弹、扫射，再掉头顺着村里的街扫。",
    next: { text: "趴着别动" },
    how: ["两架飞机先顺着村北沿的战壕和沟口扔小炸弹、扫射", "再掉头顺着村里的街扫", "不趴不判失败", "壕里有人挨了，七二七团的兵倒了两个"],
    notes: "飞机没有单位（预演里是 aircraft 轨），关键帧用 POI。壕里的人都趴 / 蹲。",
    signals: [SIG.familyHidden],
    units: [
      ...SquadInTrench({ stance: "crouch", aim: false, face: Pt(160, 630) }), ...Ditch727({ stance: "crouch", aim: false, down: new Set(["S727_E2", "S727_W2"]) }),
      N("Sentry", Pt(99.4, 641.6), { stance: "prone", face: TANK1 }), N("Captain", TRENCH_W(72.6), { stance: "crouch", face: Pt(160, 630) }), ...IjaNorth(),
      N("Runner1", Pt(98.8, 643.0), { role: "straggler", group: "runners", stance: "prone", face: PL.planesFrom }), C("Runner2", Pt(95.2, 643.6), { role: "refugee", group: "runners", stance: "prone", face: PL.planesFrom }),
      ...YardRest(),
    ],
    pois: [POI.bombsTrench(), POI.planesStreet()],
  });

  const p142 = SP(36, -0.8);
  Add({
    id: "14-2", ...s14, name: "去看冬瓜",
    player: { x: p142.x, z: p142.z, yawDeg: STREET_YAW, pitchDeg: 2, stance: "stand" },
    what: "飞机往西头扫过去。班长一把推顺子：顺儿！去看冬瓜！顺子顺着街往村西头跑。",
    next: { text: "去救护所", x: PL.aidGateOut.x, z: PL.aidGateOut.z, radiusM: 3 },
    how: ["飞机往西头扫过去", "班长一把推顺子：「顺儿！去看冬瓜！」", "顺子顺着街往村西头跑（自己跑）", "街上有人往院里跑"],
    notes: "玩家在主街上往东南跑，到教堂那儿往西拐。",
    signals: [SIG.familyHidden],
    units: [
      ...SquadInTrench({ stance: "crouch", aim: true, face: TANK1 }), ...Ditch727({ down: new Set(["S727_E2", "S727_W2"]) }), N("Captain", TRENCH_W(72.6), { face: TANK2 }), ...IjaNorth(),
      C("StreetRunner1", SP(46, -2.4), { role: "refugee", group: "street", yaw: STREET_YAW, speed: 3.0 }), C("StreetRunner2", SP(28, 2.6), { role: "refugee", group: "street", yaw: -STREET_YAW, speed: 3.0 }),
      ...YardRest(),
    ],
    pois: [POI.planesStreet(), POI.aid()],
  });

  // 14-3 院门口：黑子挨了一梭，连车带驴翻在地上，后腿一下一下地蹬
  const p143 = Pt(101.4, 688.6), heiziDown = Pt(CPK.heizi.x + 0.2, CPK.heizi.z + 0.9);
  const YardChaos = ({ blanket = WALL_ROOT, blanketYaw = 0, gengAt = Pt(84.2, 692.6), gengBody = "procedural", wounded1 = Pt(83.4, 691.6), first = false, dragSolo = false } = {}) => [
    C("Heizi", heiziDown, { down: true, yaw: CPK.yawDeg - 40 }),
    ...DongguaOnBlanket(blanket, { yaw: blanketYaw, dragSolo }),
    C("Geng", gengAt, { face: HOLE_A.mouth, body: gengBody }),
    N("Wounded1", wounded1, { group: "aid", down: true, yaw: 90 }),
    N("Wounded2", CART_WOUNDED_IN_YARD.Wounded2, { group: "aid", down: true, yaw: 0 }),
    N("Doctor", Pt(72.6, 698.2), { face: A.holes[1].mouth, ...(first ? { path: [Pt(73.4, 689.6), Pt(72.6, 698.2)] } : {}) }),
    N("DoorGuard", Pt(67.4, 697.6), { face: A.holes[1].mouth }),
    N("AidHelper", Pt(70.0, 698.8), { name: "七二七团兵（往洞里拖人）", role: "helper727", weapon: null, face: A.holes[1].mouth, ...(first ? { path: [Pt(73.2, 690), Pt(73.0, 698.6), Pt(70.0, 698.8)] } : {}) }),
    ...AidWounded({ skip: new Set([7]) }),
    // 沟口那边照旧顶着（17 班长才说「沟口那边鬼子缩回去了」）
    ...SquadInTrench({ stance: "crouch", aim: true, face: TANK1 }), ...Ditch727({ stance: "crouch", down: new Set(["S727_E2", "S727_W2"]) }), N("Captain", TRENCH_W(72.6), { face: TANK2 }), ...IjaNorth(),
  ];
  Add({
    id: "14-3", ...s14, name: "院门口的驴",
    player: { x: p143.x, z: p143.z, yawDeg: Yaw(p143, heiziDown), pitchDeg: -12, stance: "stand" },
    what: "救护所院门口，拴在车辕里的黑子挨了一梭，连车带驴翻在地上，后腿一下一下地蹬。",
    next: { text: "进院找冬瓜", x: PL.aidGateIn.x, z: PL.aidGateIn.z, radiusM: 2 },
    how: ["救护所院门口，拴在车辕里的黑子挨了一梭，连车带驴翻在地上，后腿一下一下地蹬", "（15C 妮儿画驴、五关「打死驴黑子那次」要接得上）", "院里乱成一团", "刘文财在院门口朝天上打"],
    notes: "CartOverturned 从这一帧起：翻倒的车（随信号体块）在院门外那块空地上，立着的车 GengCart 从这一帧起不再摆；黑子 state down，倒在车辕前头。",
    signals: [SIG.familyHidden, SIG.cartOverturned],
    units: [
      ...YardChaos({ first: true }),
      N("LiuWencai", Pt(93.6, 692.2), { aim: true, face: Pt(120, 670) }),
      C("Nier", Pt(87.2, 697.8), { face: WALL_ROOT }),
    ],
    pois: [POI.heizi(), POI.planesDive()],
  });

  // 14-4 揪被角：老耿「冬瓜！把他弄过来！」；玩家揪一角、妮儿揪另一角，往洞口拖
  const dragYaw = Yaw(WALL_ROOT, HOLE_A.mouth);
  const b144 = Off(WALL_ROOT, -0.4, -0.3);
  const p144 = BlanketCorner(b144, dragYaw, 1), nier144 = BlanketCorner(b144, dragYaw, -1);
  Add({
    id: "14-4", ...s14, name: "揪被角",
    player: { x: p144.x, z: p144.z, yawDeg: dragYaw, pitchDeg: -14, stance: "crouch" },
    what: "老耿背着伤员往洞口挪：冬瓜！把他弄过来！玩家揪单被一角，妮儿一声不吭揪住另一角。",
    next: { text: "把冬瓜拖进洞里", x: HOLE_A.mouth.x, z: HOLE_A.mouth.z, radiusM: 1.6 },
    how: ["救护所院里乱成一团：能动的往院里挖的洞里钻，抬的抬拖的拖；冬瓜一个人躺在墙根露天里", "老耿背着另一个伤员往洞口挪，回头喊：「冬瓜！把他弄过来！」任务字：把冬瓜拖进洞里",
      "刘文财在院门口朝天上打", "玩家揪单被一个角（跟 02 拖被子同键同姿势，手上没枪）；妮儿一声不吭揪住另一个角。两人往洞口拖，洞口在十几步外。飞机掉头，声音越来越尖（俯冲）"],
    notes: `墙根到洞口 ${R1(Dist(WALL_ROOT, HOLE_A.mouth))} m（十几步），中间没有挡的。妮儿这一帧换骨骼身体（body rig）：拖被子要放 PvBlanketDragL/R、被角握点要攥在手上。老耿「背着伤员」没有姿态：伤员倒在他身边。`,
    signals: [SIG.familyHidden, SIG.cartOverturned],
    units: [
      ...YardChaos({ blanket: b144, blanketYaw: dragYaw }),
      C("Nier", nier144, { body: "rig", stance: "crouch", face: HOLE_A.mouth }),
      N("LiuWencai", Pt(91.0, 689.0), { aim: true, face: Pt(120, 670) }),
    ],
    pois: [POI.hole("objective"), POI.planesDive()],
  });

  // 14-5 松手 / 抬眼：顺子扑倒、被角脱手；妮儿还攥着另一角一个人往后拽；弹着点从冬瓜身上扫过
  const b145 = PointBeside([WALL_ROOT, HOLE_A.mouth], 3.4, 0), b145p = Pt(b145.x, b145.z);
  const p145 = BlanketCorner(b145p, dragYaw, 1, 1.6, 1.0), nier145 = BlanketCorner(b145p, dragYaw, -1);
  Add({
    id: "14-5", ...s14, name: "松手",
    player: { x: p145.x, z: p145.z, yawDeg: Yaw(p145, nier145), pitchDeg: 6, stance: "prone" },
    what: "顺子本能扑倒，被角脱手；妮儿没趴，一个人往后拽；那串弹着点从冬瓜身上扫过，被子上洇开一片血。",
    next: { text: "把冬瓜拖进洞里", x: HOLE_A.mouth.x, z: HOLE_A.mouth.z, radiusM: 1.6 },
    how: ["松手（收走控制两三秒，慢镜头）：俯冲声压到头顶，一串弹着点顺着院子地皮追过来，顺子本能扑倒，被角从手里脱出去",
      "抬眼（控制交还）：自己手边空了；妮儿没趴（听不见），还攥着另一角一个人往后拽，脸朝顺子，不知道他为什么停",
      "冬瓜被拽着挪了一点、挪不动，那串弹着点从他身上扫过，他一抽，被子上洇开一片血（大腿和腰侧，不当场死）；弹着点擦着妮儿过去，她没挨着", "院门口刘文财脸正冲这边，全看见了"],
    notes: "测：问「冬瓜怎么挨的枪」，答得出「顺子松了手」才算看懂。妮儿骨骼身体（body rig）攥着被角、脸朝顺子；被子单位写了 dragSolo: true（§5.6：玩家那角不再取镜像、落地，只剩妮儿攥着一个角）。",
    signals: [SIG.familyHidden, SIG.cartOverturned],
    units: [
      ...YardChaos({ blanket: b145p, blanketYaw: dragYaw, gengAt: Pt(82.4, 691.2), wounded1: Pt(81.6, 690.2), dragSolo: true }),
      C("Nier", nier145, { body: "rig", stance: "crouch", face: p145 }),
      N("LiuWencai", Pt(91.0, 689.0), { face: b145p }),
    ],
    pois: [POI.bullets(b145p), Poi("DongguaHit", "冬瓜挨了枪，被子上洇开一片血", "poi", b145p, 1.2), POI.hole("objective")],
  });

  // 14-6 老耿跑回来，和顺子一人一角把冬瓜拖进洞里；刘文财把妮儿捞走；飞机往东飞走
  const b146 = HoleA(1.0), holeYaw = Yaw(HOLE_A.mouth, HoleA(2));
  const p146 = BlanketCorner(b146, holeYaw, 1, 1.25, 0.6), geng146 = BlanketCorner(b146, holeYaw, -1, 1.25, 0.6);
  Add({
    id: "14-6", ...s14, name: "拖进洞里",
    player: { x: p146.x, z: p146.z, yawDeg: holeYaw, pitchDeg: -16, stance: "crouch" },
    what: "老耿扔下背上的伤员跑回来，和顺子一人一角把冬瓜拖进洞里；刘文财把妮儿捞走。",
    next: { text: "把冬瓜拖进洞里", x: CHAMBER_A.x, z: CHAMBER_A.z, radiusM: 1.4 },
    how: ["老耿扔下背上的伤员跑回来，和顺子一人一角把冬瓜拖进洞里", "刘文财冲过来把妮儿捞走", "飞机拉起来往东飞走", "院里的人一个个从洞里探出头"],
    notes: "老耿这一帧换骨骼身体（body rig，PvBlanketDrag 另一角）；妮儿也还是骨骼身体（刘文财捞她，没有抱人的姿态：并排站）。被子在坡道上（洞口往里 1 m）。",
    signals: [SIG.familyHidden, SIG.cartOverturned],
    units: [
      ...YardChaos({ blanket: b146, blanketYaw: holeYaw, gengAt: geng146, gengBody: "rig", wounded1: Pt(82.6, 690.8) }).map((u) => (u.id === "Geng" ? Mod(u, { stance: "crouch", path: [Pt(HOLE_A.mouth.x + 1.4, HOLE_A.mouth.z), HoleA(0.4), geng146] }) : u)),
      N("LiuWencai", Pt(85.4, 696.6), { face: p146 }),
      C("Nier", Pt(84.6, 697.6), { body: "rig", face: p146 }),
    ],
    pois: [POI.hole("objective"), POI.planesGone()],
  });

  // ======================= 15 洞里，抬到厢房门口 =======================
  const s15 = { stage: 15, stageTitle: "洞里" };
  const b151 = CHAMBER_A, yaw151 = Yaw(CHAMBER_A, HoleA(HOLE_A.rampM + HOLE_A.chamber.d));
  const press151 = PressPose(b151, yaw151);
  const p151 = HoleA(HOLE_A.rampM + 0.45, -0.8), liu151 = HoleA(HOLE_A.rampM + 0.45, 0.9), nier151 = HoleA(HOLE_A.rampM + HOLE_A.chamber.d - 0.45, -1.15);
  const HoleRest = () => [
    C("Heizi", heiziDown, { down: true, yaw: CPK.yawDeg - 40 }),
    N("Wounded1", Pt(82.6, 690.8), { group: "aid", down: true, yaw: 90 }), N("Wounded2", CART_WOUNDED_IN_YARD.Wounded2, { group: "aid", down: true, yaw: 0 }),
    ...AidPeople({ doctorAt: Pt(74.6, 684.2), doctorFace: Pt(74.6, 680), doctorStance: "stand" }),
  ];
  Add({
    id: "15-1", ...s15, stageLabel: "15A", name: "洞里",
    player: { x: p151.x, z: p151.z, yawDeg: Yaw(p151, b151), pitchDeg: -18, stance: "crouch" },
    what: "洞顶漏下一条红天。刘文财：你松你妈啥子手！冬瓜：龟儿子……手恁个滑……八个……抵了。",
    next: { text: "把冬瓜抬到厢房门口", x: PL.xiangDoor.x + 2.2, z: PL.xiangDoor.z, radiusM: 2 },
    how: ["洞顶漏下一条红天。老耿跪着把毛巾按回伤口", "刘文财：「你松你妈啥子手！」顺子说不出话", "冬瓜睁眼看着顺子：「龟儿子……手恁个滑……」喘了好几口：「……八个……抵了。」", "刘文财把妮儿推给老耿：「老人家，你牵到她。」接过被角"],
    notes: `洞内一小间 ${HOLE_A.chamber.w}×${HOLE_A.chamber.d} m、底 −1.7、净高 1.7，洞顶有一条 0.3 m 的缝（漏红天）。老耿「跪着」按毛巾：这一帧换骨骼身体（body rig，预演放 CareMedicPress；程序化身体蹲不下）。`,
    signals: [SIG.familyHidden, SIG.cartOverturned],
    units: [
      ...DongguaOnBlanket(b151, { yaw: yaw151 }),
      C("Geng", press151, { body: "rig", stance: "crouch", yaw: press151.yawDeg, tending: "Donggua", path: [HoleA(HOLE_A.rampM - 0.4, -0.3), press151] }),
      N("LiuWencai", liu151, { stance: "crouch", face: p151, path: HoleIn(liu151, 0.8) }),
      C("Nier", nier151, { stance: "crouch", face: b151, path: HoleIn(nier151, -0.8) }),
      ...HoleRest(),
    ],
    pois: [POI.redSky(HoleA(HOLE_A.rampM + HOLE_A.chamber.d / 2 + 0.2)), POI.xiangDoor("objective")],
  });

  const b152 = Pt(73.2, 688.6), yaw152 = Yaw(b152, PL.xiangDoor);
  const p152 = BlanketCorner(b152, yaw152, 1, 1.25, 0.6), liu152 = BlanketCorner(b152, yaw152, -1, 1.25, 0.6);
  Add({
    id: "15-2", ...s15, stageLabel: "15B", name: "抬到厢房门口",
    player: { x: p152.x, z: p152.z, yawDeg: yaw152, pitchDeg: -4, stance: "stand" },
    what: "顺子、刘文财把冬瓜连被子抬出洞，抬到厢房门口，没有对白，天一点点黑。",
    next: { text: "抬到厢房门口", x: PL.xiangDoor.x + 2.2, z: PL.xiangDoor.z, radiusM: 1.6 },
    how: ["顺子、刘文财把冬瓜连被子抬出洞", "抬到厢房门口（几十米，白盒院子小、只有十几米），没有对白", "天一点点黑，红褪成灰蓝", "老耿牵着妮儿跟在后头"],
    notes: "被子朝西北（厢房门），玩家在被头左角、刘文财右角（bearers 0，拽的人站位）。",
    signals: [SIG.familyHidden, SIG.cartOverturned],
    units: [
      ...DongguaOnBlanket(b152, { yaw: yaw152, extra: { path: HoleOut(b152) } }),
      N("LiuWencai", liu152, { face: PL.xiangDoor, speed: 1.0, path: HoleOut(liu152, 0.8) }),
      C("Geng", Off(b152, 2.0, 1.4), { face: PL.xiangDoor, speed: 1.0, path: HoleOut(Off(b152, 2.0, 1.4), -0.4) }), C("Nier", Off(b152, 2.4, 2.4), { face: PL.xiangDoor, speed: 1.0, path: HoleOut(Off(b152, 2.4, 2.4), -0.8) }),
      ...HoleRest(),
    ],
    pois: [POI.xiangDoor("objective")],
  });

  const s15c = { stage: 15, stageTitle: "厢房门口" };
  const b153 = Pt(70.6, 688.8), p153 = Pt(70.4, 690.9), nier153 = Pt(72.6, 686.4), liu153 = Pt(73.8, 685.4), geng153 = Pt(74.4, 688.2);
  Add({
    id: "15-3", ...s15c, stageLabel: "15C", name: "等着进",
    player: { x: p153.x, z: p153.z, yawDeg: Yaw(p153, nier153), pitchDeg: -18, stance: "crouch" },
    what: "守门的兵：等到！里头满起了！妮儿在土里画驴、摆弹壳；刘文财：……犟。",
    next: { text: "等着进厢房" },
    how: ["守门的兵：「等到！里头满起了！挤你妈啥子！」", "妮儿捡根树枝在土里画驴、后头拖辆车，掏出弹壳在驴旁边摆一排。刘文财：「画的黑子嗦？」……「一个壳子三四钱重，四五十个才一斤……你攒到出嫁，也换不到一条驴腿。」",
      "妮儿把他手心里那个弹壳拿回去摆好。刘文财：「……犟。」老耿看着地上那头驴，把脸转开", "门里：「下一副！」"],
    notes: "妮儿「蹲在地上画驴」：这一帧换骨骼身体（body rig，预演放 PvKneelDig 顶着；程序化身体蹲不下）。医官在厢房里头。黑子还倒在院门外（从院里看不见）。",
    signals: [SIG.familyHidden, SIG.cartOverturned],
    units: [
      ...DongguaOnBlanket(b153, { yaw: 0 }),
      C("Nier", nier153, { body: "rig", stance: "crouch", face: Pt(nier153.x, nier153.z + 1) }),
      N("LiuWencai", liu153, { stance: "crouch", face: nier153 }),
      C("Geng", geng153, { face: Pt(80, 690) }),
      C("Heizi", heiziDown, { down: true, yaw: CPK.yawDeg - 40 }),
      N("Wounded1", Pt(82.6, 690.8), { group: "aid", down: true, yaw: 90 }), N("Wounded2", CART_WOUNDED_IN_YARD.Wounded2, { group: "aid", down: true, yaw: 0 }),
      ...AidPeople({ doctorAt: Pt(62.8, 683.4), doctorFace: PL.xiangDoor, doctorStance: "stand" }).map((u) => (u.id === "DoorGuard" ? Mod(u, { yawDeg: Yaw(DOOR_GUARD, p153) }) : u)),
    ],
    pois: [POI.xiangDoor("objective"), Poi("NierDraw", "妮儿画的驴", "poi", Pt(nier153.x, nier153.z + 1), 0.8)],
  });

  // ======================= 16 过门槛 =======================
  const s16 = { stage: 16, stageTitle: "过门槛" };
  const p161 = Pt(X.box.maxX + 0.25, X.door.z), b161 = Pt(X.box.maxX + 2.05, X.door.z), liu161 = Pt(X.box.maxX + 3.9, X.door.z);
  Add({
    id: "16-1", ...s16, name: "门槛",
    player: { x: p161.x, z: p161.z, yawDeg: 90, pitchDeg: -22, stance: "stand" },
    what: "医官：肚子上的？抬进去！过门槛，冬瓜：脚……慢点。……有门槛。抬高点。",
    next: { text: "把冬瓜慢慢放下", x: A.dongguaInside.x, z: A.dongguaInside.z, radiusM: 1.2 },
    how: ["医官：「肚子上的？抬进去！表堵到门口！」", "门槛：「脚……慢点。」", "「……有门槛。抬高点。」（冬瓜最后一句）", "放下要按住键慢慢放"],
    notes: "顺子在被头（站在门槛上）、刘文财在被尾，被子在两人之间（bearers 0）。门槛是 0.15 高的块（AidXiangThreshold）。老耿和妮儿在院里等。",
    signals: [SIG.familyHidden, SIG.cartOverturned],
    units: [
      ...DongguaOnBlanket(b161, { yaw: 90, extra: { speed: 0.8 } }),
      N("LiuWencai", liu161, { yaw: 90, speed: 0.8 }),
      C("Geng", Pt(74.8, 688.0), { face: p161 }), C("Nier", Pt(74.0, 689.4), { face: p161 }),
      C("Heizi", heiziDown, { down: true, yaw: CPK.yawDeg - 40 }),
      N("Wounded1", Pt(82.6, 690.8), { group: "aid", down: true, yaw: 90 }), N("Wounded2", CART_WOUNDED_IN_YARD.Wounded2, { group: "aid", down: true, yaw: 0 }),
      ...AidPeople({ doctorAt: Pt(68.8, 682.0), doctorFace: p161, doctorStance: "stand" }).map((u) => (u.id === "DoorGuard" ? Mod(u, { x: 68.6, z: 687.6 }) : u)),
    ],
    pois: [POI.xiangDoor("objective"), POI.threshold(), POI.dongguaInside()],
  });

  // ======================= 17 坐在门槛上 =======================
  const s17 = { stage: 17, stageTitle: "门槛上" };
  const inside = Pt(A.dongguaInside.x, A.dongguaInside.z);
  const press171 = PressPose(inside, 0);
  const geng171 = Pt(inside.x - 1.0, inside.z - 0.2), nier171 = Pt(65.4, 686.6), liu171 = Pt(63.4, 686.0), p171 = Pt(65.2, 688.2);
  const Yard17 = () => [
    C("Heizi", heiziDown, { down: true, yaw: CPK.yawDeg - 40 }),
    N("Wounded1", Pt(82.6, 690.8), { group: "aid", down: true, yaw: 90 }), N("Wounded2", CART_WOUNDED_IN_YARD.Wounded2, { group: "aid", down: true, yaw: 0 }),
  ];
  Add({
    id: "17-1", ...s17, name: "没了",
    player: { x: p171.x, z: p171.z, yawDeg: Yaw(p171, inside), pitchDeg: -26, stance: "stand" },
    what: "医官：……没了。下一副！老耿用冬瓜自己那床单被盖住他的脸。",
    next: { text: "（在门槛上坐下）", x: A.thresholdSeat.x, z: A.thresholdSeat.z, radiusM: 0.8 },
    how: ["医官：「……没了。」「下一副！」", "刘文财：「刚才过门槛，还在说话……」", "老耿用冬瓜自己那床单被盖住他的脸", "妮儿看看这个大人的脸，又看看那个"],
    notes: "被子放在厢房里靠墙（dongguaInside），冬瓜 down、盖着脸从这一帧起就不动了。医官跪在被子边（CareMedicPress 的站位），看完回院里。老耿：这一帧换骨骼身体（body rig，预演放 PvKneelPullBlanket 把被子拉上来盖脸）。",
    signals: [SIG.familyHidden, SIG.cartOverturned],
    units: [
      ...DongguaOnBlanket(inside, { yaw: 0 }),
      N("Doctor", press171, { stance: "crouch", yaw: press171.yawDeg, tending: "Donggua", to: Pt(74.6, 684.2) }),
      C("Geng", geng171, { body: "rig", stance: "crouch", face: inside, tending: "Donggua" }),
      C("Nier", nier171, { face: geng171 }),
      N("LiuWencai", liu171, { face: inside }),
      N("DoorGuard", DOOR_GUARD, { face: Pt(74, 686) }), N("AidHelper", Pt(82.0, 675.2), { weapon: null, role: "helper727", face: Pt(86, 676) }), ...AidWounded(), ...Yard17(),
    ],
    pois: [POI.threshold(), Poi("DongguaDead", "盖着脸的冬瓜", "poi", inside, 1.2)],
  });

  const seat = Pt(A.thresholdSeat.x, A.thresholdSeat.z);
  const Yard172 = () => [
    ...DongguaOnBlanket(inside, { yaw: 0 }),
    N("Doctor", Pt(74.6, 684.2), { face: Pt(74.6, 680) }),
    C("Geng", geng171, { face: inside }), C("Nier", nier171, { face: seat }), N("LiuWencai", liu171, { face: seat }),
    N("DoorGuard", DOOR_GUARD, { face: Pt(74, 686) }), N("AidHelper", Pt(82.0, 675.2), { weapon: null, role: "helper727", face: Pt(86, 676) }), ...AidWounded(), ...Yard17(),
  ];
  Add({
    id: "17-2", ...s17, name: "铜板",
    player: { x: seat.x, z: seat.z, yawDeg: -90, pitchDeg: -30, stance: "crouch" },
    what: "顺子坐在门槛上数铜板，院子里照常忙。",
    next: { text: "（按 F 数铜板）" },
    how: ["退到门口在门槛上坐下（自动两秒），之后能转头不能走", "摸出钱袋把铜板倒在手心里；屏幕上只亮一个 F，不写字；按一下往另一只手挪一个", "院子里有人往里抬、往外抬、烧水", "天黑下来了，院里点上马灯"],
    notes: "「坐在门槛上」：玩家机位蹲姿、放在门槛东沿外（门槛块在 x 66.5），朝东看院子。",
    signals: [SIG.familyHidden, SIG.cartOverturned],
    units: Yard172(),
    pois: [Poi("Coins", "手心里的铜板", "poi", seat, 0.4), POI.aid("landmark")],
  });

  const luo173 = Pt(69.4, 686.2), yaowa173 = Pt(69.8, 684.0), he173 = Pt(71.4, 687.4);
  Add({
    id: "17-3", ...s17, name: "起来",
    player: { x: seat.x, z: seat.z, yawDeg: Yaw(seat, luo173), pitchDeg: 4, stance: "crouch" },
    what: "班长带人进院：咋个搞的？刘文财：……飞机。班长：狗日的。顺儿。……起来。",
    next: { text: "跟着班长" },
    how: ["班长带幺娃、何有田进院（沟口那边鬼子缩回去了，交给七二七团守）", "班长掀开被角看一眼：「咋个搞的？」刘文财看顺子一眼：「……飞机。」班长：「狗日的。」", "幺娃看见顺子手心的铜板，把眼睛挪开", "班长：「顺儿。……起来。」"],
    notes: "班长从院门走到顺子跟前（path 从门外进来）；幺娃站在顺子旁边；何有田与 Squad1 / 2 在后头 / 院门口。",
    signals: [SIG.familyHidden, SIG.cartOverturned],
    units: [
      N("Luo", luo173, { face: seat, from: PL.aidGateOut }),
      N("Yaowa", yaowa173, { face: seat, from: PL.aidGateOut }),
      N("HeYoutian", he173, { face: seat, from: PL.aidGateOut }),
      N("Squad1", Pt(84.6, 689.2), { face: seat, from: PL.aidGateOut, guess: true }),
      N("Squad2", Pt(86.0, 691.8), { yaw: 90, from: PL.aidGateOut, guess: true }),
      ...Yard172(),
    ],
    pois: [POI.aid("landmark")],
  });

  // ======================= 18 撤过铁路桥 =======================
  const s18 = { stage: 18, stageTitle: "撤过铁路桥" };
  const captain181 = Pt(76.8, 687.4), p181 = Pt(67.8, 686.4);
  const YardEvac = ({ phase = 0 } = {}) => [
    N("AidLitter1", phase ? Pt(98.6, 690.2) : Pt(81.0, 685.6), { kind: "litter", name: "院里抬出去的担架", group: "aidEvac", face: PL.aidGateOut, to: Pt(SR.line[0].x, SR.line[0].z), speed: 1.2 }),
    N("AidLitter2", phase ? Pt(84.2, 689.4) : Pt(78.0, 681.6), { kind: "litter", group: "aidEvac", face: PL.aidGateOut, to: Pt(SR.line[0].x, SR.line[0].z), speed: 1.2 }),
    N("AidLitter3", phase ? Pt(79.0, 683.6) : Pt(73.6, 678.6), { kind: "litter", group: "aidEvac", face: PL.aidGateOut, to: Pt(SR.line[0].x, SR.line[0].z), speed: 1.2 }),
    N("Doctor", phase ? Pt(77.0, 682.0) : Pt(74.6, 684.2), { face: PL.aidGateOut, to: Pt(SR.line[0].x - 1, SR.line[0].z), speed: 1.2 }),
    ...[1, 4, 6].map((i, k) => N(`AidDead${k + 1}`, AID_WOUNDED[i], { name: k ? undefined : "盖着脸的", group: "aid", weapon: null, down: true, yaw: WoundedYaw(i), guess: true })),
  ];
  Add({
    id: "18-1", ...s18, stageLabel: "18A", name: "命令",
    player: { x: p181.x, z: p181.z, yawDeg: Yaw(p181, captain181), pitchDeg: 0, stance: "stand" },
    what: "连长：命令下来了：撤回县城，铁路桥天黑前炸。担架先走！班长：顺儿，你跟担架走。",
    next: { text: "跟担架走", x: PL.aidGateOut.x, z: PL.aidGateOut.z, radiusM: 2.5 },
    how: ["七二七团连长进院：「命令下来了：撤回县城，铁路桥天黑前炸。城里说援兵在路上了。」何有田：「在路上？日他妈，老子也在路上。」",
      "连长：「担架先走！」对班长：「你们跟我殿后。」", "班长：「顺儿，你跟担架走。到桥南头等到老子。」", "院里的担架一副副抬出去，医官跟着最后一副走，院门敞着，屋里只剩盖着脸的（冬瓜在里头）"],
    notes: "冬瓜留在厢房里，从这一帧起不再摆。院里活着的伤员一副一副抬出去（AidLitter1–3，intent 往南岸路），死了的盖着脸留下（AidDead）。",
    signals: [SIG.familyHidden, SIG.cartOverturned],
    units: [
      N("Captain", captain181, { face: Pt(70, 686), from: PL.aidGateOut }),
      N("Luo", Pt(70.2, 687.8), { face: captain181 }), N("Yaowa", Pt(69.8, 684.0), { face: captain181 }), N("HeYoutian", Pt(72.4, 688.8), { face: captain181 }),
      N("Squad1", Pt(84.6, 689.2), { face: captain181, guess: true }), N("Squad2", Pt(86.0, 691.8), { face: captain181, guess: true }),
      N("LiuWencai", Pt(65.6, 688.2), { face: captain181 }),
      C("Geng", Pt(74.4, 690.6), { face: captain181 }), C("Nier", Pt(73.0, 691.4), { face: captain181 }),
      C("Heizi", heiziDown, { down: true, yaw: CPK.yawDeg - 40 }),
      ...YardEvac(),
    ],
    pois: [POI.aid("objective")],
  });

  const gengWall = Pt(76.4, 698.8), mother = Pt(GY.hole.mouth.x, GY.hole.mouth.z + 0.8), p182 = Pt(80.4, 697.0);
  Add({
    id: "18-2", ...s18, stageLabel: "18A", name: "隔壁院",
    player: { x: p182.x, z: p182.z, yawDeg: Yaw(p182, mother), pitchDeg: -10, stance: "stand" },
    what: "老耿冲隔壁那家洞口喊：走啊！鬼子要来了！洞口那个女人摇摇头，把席子拉上，盖住洞口。",
    next: { text: "跟担架走", x: PL.aidGateOut.x, z: PL.aidGateOut.z, radiusM: 2.5 },
    how: ["隔壁院：老耿冲那家洞口喊：「走啊！鬼子要来了！」", "洞口那个女人摇摇头，把席子拉上，盖住洞口", "担架一副副从院门抬出去", "妮儿站在老耿身边看着那个洞口"],
    notes: "GirlHoleCovered 从这一帧起（女娃家洞口的席子出现）。女娃她娘站在她家洞的坡道里（程序化身体）。隔着救护所南墙塌了的那一截喊。",
    signals: [SIG.familyHidden, SIG.cartOverturned, SIG.girlHoleCovered],
    units: [
      C("Geng", gengWall, { face: mother, path: [Pt(73.2, 691.6), Pt(73.4, 697.0), gengWall] }), C("Nier", Off(gengWall, 1.2, -0.6), { face: mother, path: [Pt(72.6, 692.4), Pt(73.0, 697.2), Off(gengWall, 1.2, -0.6)] }),
      C("GirlMother", mother, { face: gengWall }),
      N("LiuWencai", Pt(82.6, 695.6), { face: PL.aidGateIn }),
      N("Luo", Pt(84.8, 688.0), { face: PL.aidGateIn }), N("Yaowa", Pt(86.4, 689.4), { face: PL.aidGateIn }), N("HeYoutian", Pt(84.2, 686.2), { face: PL.aidGateIn }),
      N("Captain", Pt(88.2, 688.4), { face: PL.aidGateOut }),
      C("Heizi", heiziDown, { down: true, yaw: CPK.yawDeg - 40 }),
      ...YardEvac({ phase: 1 }),
    ],
    pois: [POI.girlYard()],
  });

  // 18-3 18B 到铁路桥：出村往西，太阳落到铁路那头；担架和兵走桥面，老乡蹚水，老耿牵妮儿走桥面
  const p183 = Pt(RL.x + 0.9, RB.northZ - 3.2);
  const RG = [Pt(-18, 731.2), Pt(-4, 729.6), Pt(10, 727.6), Pt(-30, 733.4)];
  Add({
    id: "18-3", ...s18, stageLabel: "18B", name: "铁路桥",
    player: { x: p183.x, z: p183.z, yawDeg: 180, pitchDeg: -10, stance: "stand" },
    what: "路基比人高、北边铁轨拆了；铁路桥几孔钢梁架在石墩上，桥面只有枕木，缝里看得见沙和一股水。",
    next: { text: "过铁路桥", x: BR_S.x, z: BR_S.z, radiusM: 3 },
    how: ["出村往西，一公里麦地（白盒压短），太阳落到铁路那头。七二七团的兵一拨守着一拨往后撤", "铁路路基比人高，北边铁轨拆了，只剩光路基",
      "铁路桥是几孔钢梁架在石墩上，桥面只有枕木，缝里看得见底下的沙和一股水。担架和兵走桥面，踩着枕木一格一格过", "有老乡顺着陡岸滑下河床，蹚水过去。老耿牵着妮儿走桥面"],
    notes: "桥面上的人站在枕木顶上（每孔一条看不见的 standOn 走道，2026-10-26 给 BlockStandSampler 加的）：担架、老耿牵着妮儿、殿后的兵踩着枕木过桥。"
      + "蹚水的老乡在河床那一股水里（齐小腿）。",
    signals: [SIG.familyHidden, SIG.cartOverturned, SIG.girlHoleCovered],
    units: [
      N("AidLitter1", BR_S, { kind: "litter", name: "院里抬出去的担架", group: "aidEvac", yaw: 180, climb: true, to: Pt(RAMP_S.from.x, RAMP_S.from.z) }),
      N("AidLitter2", Pt(RL.x, (RB.northZ + RB.southZ) / 2 + 3), { kind: "litter", group: "aidEvac", yaw: 180 }),
      N("AidLitter3", Pt(RAMP_N.from.x - 3.2, RAMP_N.from.z), { kind: "litter", group: "aidEvac", yaw: 90 }),
      N("Doctor", Pt(RAMP_N.from.x + 0.6, RAMP_N.from.z - 1.6), { face: Pt(RL.x, RB.northZ) }),
      C("Geng", Pt(RL.x - 0.4, RB.northZ + 9.0), { yaw: 180 }), C("Nier", Pt(RL.x + 0.5, RB.northZ + 9.6), { yaw: 180 }),
      N("LiuWencai", Pt(RL.x - 1.2, RB.northZ - 4.4), { yaw: 180 }),
      N("Rear727_5", Pt(RL.x + 0.3, RB.northZ + 3.6), { role: "rearGuard727", group: "rear727", yaw: 180 }),
      C("Wader1", Pt(RV.slides[0].x, RIVER_AT_RAIL.northToe + 2.4), { name: "蹚水的老乡", role: "refugee", group: "waders", face: Pt(RV.slides[0].x, 790), climb: true }),
      C("Wader2", Pt(-80.6, RiverAtX(-80.6).streamZ - 1.2), { role: "refugeeWithBundle", group: "waders", face: Pt(-80, 800), wade: true }),
      C("Wader3", Pt(-78.2, RiverAtX(-78.2).streamZ + 2.0), { role: "refugeeCarryingElder", group: "waders", face: Pt(-78, 805), wade: true }),
      ...RG.map((p, i) => N(`Rear727_${i + 1}`, p, { name: i ? undefined : "七二七团兵（殿后）", role: "rearGuard727", group: "rear727", stance: i % 2 ? "stand" : "crouch", aim: i % 2 === 0, face: Pt(60, 690) })),
    ],
    pois: [POI.sunWest(), POI.railBridge("objective"), POI.wade()],
  });

  // 18-4 18C 南头等：工兵绑炸药；班长他们被田里那挺机枪压在桥北土坎后头
  const p184 = Pt(PL.leveePlayer.x, PL.leveePlayer.z);
  const sappers = [PIER(1), PIER(2)];
  const Levee18 = ({ stance = "prone" } = {}) => [
    N("LiuWencai", LEVEE_CREST(-96.0), { stance, aim: true, face: MG18 }),
    N("Officer18", BEHIND_LEVEE(-91.0), { face: Pt(RL.x, RB.northZ) }),
    ...[FOXHOLE(-79), FOXHOLE(-75), FOXHOLE(-71)].map((p, i) => N(`Levee727_${i + 1}`, p, { role: "rifleman727", group: "levee727", stance: "crouch", aim: true, face: MG18 })),
    C("Geng", Pt(-95.6, LV.z + 4.4), { face: Pt(RL.x, RB.northZ) }), C("Nier", Pt(-94.4, LV.z + 4.8), { face: Pt(RL.x, RB.northZ) }),
    N("AidLitter1", Pt(-86.8, 830.0), { kind: "litter", group: "aidEvac", yaw: 180, to: Pt(-88, 900) }),
    N("Doctor", Pt(-89.4, 832.6), { yaw: 180, to: Pt(-89, 900) }),
  ];
  Add({
    id: "18-4", ...s18, stageLabel: "18C", name: "南头等",
    player: { x: p184.x, z: p184.z, yawDeg: Yaw(p184, MG18), pitchDeg: 1, stance: "prone" },
    what: "工兵在桥墩上绑炸药；北边田里，班长他们被一挺机枪压在桥北头土坎后头，离开土坎就是靶子。",
    next: { text: "压住那挺机枪", x: MG18.x, z: MG18.z, radiusM: 4 },
    how: ["南头桥头河堤后，七二七团军官带几个兵守着，两个工兵在桥墩上绑炸药，引线拉到河堤后。顺子、刘文财趴在河堤上", "七二七团最后几拨过桥。天快黑透，北边田里，班长他们一拨一拨往回跳",
      "鬼子步兵徒手过了村口的沟追上来，在田里一挺机枪顺着路基扫，班长他们被压在桥北头一道土坎后头，离开土坎就是靶子",
      "军官：「炸！不等了！」刘文财：「班长他们还在后头！」军官：「鬼子都上来了！」刘文财：「再等一哈！……顺儿！那挺机枪！」"],
    notes: `ChargesSet 从这一帧起（北头两座桥墩上的炸药 + 引线拉到河堤后）。土坎高 1 m、坎后挖低 0.3，蹲着的人机枪看不见；机枪在路基东脚的坟头旁，从河堤上（路基东边 10 m）隔着沙河看得见它，${R1(Dist(p184, MG18))} m（场景生成器核过）。`,
    signals: [SIG.familyHidden, SIG.cartOverturned, SIG.girlHoleCovered, SIG.chargesSet],
    units: [
      ...Levee18(),
      ...sappers.map((p, i) => N(`Sapper${i + 1}`, p, { stance: "crouch", face: Pt(RL.x, p.z), climb: true })),
      ...Object.entries(LAST_SLOTS).map(([id, p]) => N(id, p, { stance: "crouch", aim: id === "Luo" || id === "HeYoutian", face: MG18, guess: id.startsWith("Squad"), climb: true })),
      N("LastWounded", Off(LAST_COVER, 1.8, 1.8), { role: "wounded", group: "last", down: true, yaw: 90 }),
      N("Rear727_1", Pt(RL.x, RB.northZ - 2.2), { name: "七二七团兵（最后几拨）", role: "rearGuard727", group: "rear727", yaw: 180, climb: true }),
      N("Rear727_2", BR_S, { role: "rearGuard727", group: "rear727", yaw: 180, climb: true }),
      ...IjaField18(),
    ],
    pois: [POI.mg18("objective"), POI.bank(), POI.sappers()],
  });

  // 18-5 机枪一哑，顺子站起来挥手：快过来！班长他们跑过桥，班长最后一个
  Add({
    id: "18-5", ...s18, stageLabel: "18C", name: "快过来",
    player: { x: p184.x, z: p184.z, yawDeg: Yaw(p184, Pt(RL.x, RB.northZ)), pitchDeg: 2, stance: "stand" },
    what: "机枪一哑，顺子站起来冲他们挥手：快过来！快过来！班长他们跑过桥，班长最后一个。",
    next: { text: "等班长过桥", x: BR_S.x, z: BR_S.z, radiusM: 2.5 },
    how: ["玩家压机枪。机枪一哑，顺子站起来冲他们挥手：「快过来！快过来！」（02 坡顶别人冲他喊的那句，这回是他喊）", "班长他们跑过桥，班长最后一个",
      "班长踏上南岸：「后头没得人了！」", "鬼子步兵在田里往桥头压"],
    notes: "班长他们从土坎后往桥头跑（离开土坎就在机枪的视线里——机枪已经哑了）；跑在前头的幺娃已经在桥面上（站在枕木顶上）。",
    signals: [SIG.familyHidden, SIG.cartOverturned, SIG.girlHoleCovered, SIG.chargesSet],
    units: [
      ...Levee18({ stance: "crouch" }),
      N("Sapper1", BEHIND_LEVEE(-92.6), { stance: "crouch", face: Pt(RL.x, RB.northZ), climb: true }), N("Sapper2", BEHIND_LEVEE(-90.2), { stance: "crouch", face: Pt(RL.x, RB.northZ), climb: true }),
      N("Yaowa", Pt(RL.x + 0.4, (RB.northZ + RB.southZ) / 2), { yaw: 180, speed: 3.2 }),
      N("HeYoutian", Pt(RAMP_N.to.x + 1.0, RAMP_N.to.z + 0.4), { yaw: 180, speed: 3.2 }),
      N("Squad1", Pt(-95.6, 748.4), { yaw: Yaw(Pt(-95.6, 748.4), BR_N), speed: 3.2, guess: true }),
      N("Squad2", Pt(-90.4, 744.6), { yaw: Yaw(Pt(-90.4, 744.6), BR_N), speed: 3.2, guess: true }),
      N("Luo", Pt(-84.6, 739.6), { yaw: Yaw(Pt(-84.6, 739.6), BR_N), aim: true, speed: 3.0 }),
      N("LastWounded", Pt(-93.0, 746.6), { role: "wounded", group: "last", down: true, yaw: 140 }),
      ...IjaField18({ mgDown: true, near: true }),
    ],
    pois: [POI.mg18("danger"), POI.railBridge("landmark")],
  });

  // 18-6 炸桥：军官：点！大家扑到河堤后头，「轰」一声，北头两孔钢梁断开砸进河床
  const p186 = Pt(PL.leveeCover.x, PL.leveeCover.z);
  const BehindLevee = (o = {}) => [
    N("Luo", BEHIND_LEVEE(-97.4), { stance: "crouch", face: Pt(RL.x, RB.northZ), climb: true, ...o }),
    N("Yaowa", BEHIND_LEVEE(-99.4), { stance: "crouch", face: Pt(RL.x, RB.northZ), climb: true, ...o }),
    N("HeYoutian", BEHIND_LEVEE(-88.4), { stance: "crouch", face: Pt(RL.x, RB.northZ), climb: true, ...o }),
    N("Squad1", BEHIND_LEVEE(-86.2), { stance: "crouch", guess: true, face: Pt(RL.x, RB.northZ), climb: true, ...o }),
    N("Squad2", BEHIND_LEVEE(-84.0), { stance: "crouch", guess: true, face: Pt(RL.x, RB.northZ), climb: true, ...o }),
    N("LiuWencai", BEHIND_LEVEE(-96.0), { stance: "crouch", face: Pt(RL.x, RB.northZ), ...o }),
    N("Officer18", BEHIND_LEVEE(-91.0), { face: Pt(RL.x, RB.northZ), ...o }),
    N("Sapper1", BEHIND_LEVEE(-92.8), { stance: "crouch", face: Pt(RL.x, RB.northZ), ...o }), N("Sapper2", BEHIND_LEVEE(-90.0), { stance: "crouch", face: Pt(RL.x, RB.northZ), ...o }),
    ...[FOXHOLE(-79), FOXHOLE(-75), FOXHOLE(-71)].map((p, i) => N(`Levee727_${i + 1}`, p, { role: "rifleman727", group: "levee727", stance: "crouch", aim: true, face: Pt(RL.x, RB.northZ) })),
    C("Geng", Pt(-95.6, LV.z + 4.4), { face: Pt(RL.x, RB.northZ) }), C("Nier", Pt(-94.4, LV.z + 4.8), { face: Pt(RL.x, RB.northZ) }),
  ];
  Add({
    id: "18-6", ...s18, stageLabel: "18C", name: "炸桥",
    player: { x: p186.x, z: p186.z, yawDeg: Yaw(p186, Pt(RL.x, RB.northZ + 10)), pitchDeg: 8, stance: "prone" },
    what: "军官：点！大家扑到河堤后头，「轰」一声，北头两孔钢梁断开砸进河床。",
    next: { text: "趴在河堤后头" },
    how: ["班长最后一个踏上南岸：「后头没得人了！」", "军官：「点！」", "大家扑到河堤后头，「轰」一声", "北头两孔钢梁断开砸进河床"],
    notes: "BridgeBlown 从这一帧起：北头两孔的钢梁、枕木、轨没了，断梁和散落的枕木砸在河床上（随信号体块）。",
    signals: [SIG.familyHidden, SIG.cartOverturned, SIG.girlHoleCovered, SIG.chargesSet, SIG.bridgeBlown],
    units: [...BehindLevee(), ...IjaField18({ mgDown: true, near: true }).map((u) => (u.id.startsWith("IjaField") ? Mod(u, { stance: "prone" }) : u))],
    pois: [POI.blast()],
  });

  // 18-7 对岸：鬼子涌到北岸路基上朝这边打，过不来；北沙河村里几户人家亮着灯
  const p187 = LEVEE_CREST(-94.0);
  const NORTH_BANK_IJA = [[RL.x - 0.8, 748], [RL.x + 0.9, 752], [RL.x - 1.4, 756], [RL.x + 1.6, 744], [-95.4, 756], [-90.6, 754], [-86.2, 757.4], [-80.4, 756.8], [-74.6, 758.2], [-112.6, 756.6], [-117.6, 755.2], [-123.0, 757.6]];
  Add({
    id: "18-7", ...s18, stageLabel: "18C", name: "对岸",
    player: { x: p187.x, z: p187.z, yawDeg: 0, pitchDeg: 2, stance: "stand" },
    what: "鬼子涌到北岸路基上朝这边打，过不来；北沙河村里几户人家亮着灯。",
    next: { text: "往南走", x: SR.line[1].x, z: SR.line[1].z + 6, radiusM: 3 },
    how: ["对岸（半过场，能转头，约 30 秒）：鬼子涌到北岸路基上朝这边打，过不来", "北沙河村里几户人家亮着灯", "班长：「走！看你妈啥子，走！」", "往南走进黑里，身后的枪声慢慢远了"],
    notes: `站在南头河堤顶（1.8）往北看：北岸桥头路基上、坎沿上一排鬼子（${NORTH_BANK_IJA.length} 个），断了的桥北头两孔砸在河床上。`,
    signals: [SIG.familyHidden, SIG.cartOverturned, SIG.girlHoleCovered, SIG.chargesSet, SIG.bridgeBlown],
    units: [
      ...BehindLevee({ stance: "stand" }).map((u) => (u.id === "Luo" ? Mod(u, { yawDeg: Yaw(u, p187) }) : u)),
      ...NORTH_BANK_IJA.map(([x, z], i) => J(`BankIja${i + 1}`, Pt(x, z), { role: "rifleman", group: "northBank", stance: i % 3 === 1 ? "crouch" : "stand", aim: i % 4 !== 3, face: p187, straight: true, guess: true })),
    ],
    pois: [POI.lights(), POI.blast()],
  });

  // 18-8 夜里，北门：黑场字幕；一长溜队伍往南走；老耿：进城。城里有城墙，比庄上牢靠
  const gate = Pt(PL.northGate.x, PL.northGate.z);
  const RX = (z, lat = 0) => Pt(SR.line[2].x + lat, z);
  const p188 = RX(930, -0.4);
  Add({
    id: "18-8", ...s18, stageLabel: "18夜", stageTitle: "北门", name: "北门",
    player: { x: p188.x, z: p188.z, yawDeg: 180, pitchDeg: 2, stance: "stand" },
    what: "夜进北门；幺娃：老人家，你嗯往哪儿走？老耿：进城。城里有城墙，比庄上牢靠。",
    next: { text: "进城", x: gate.x, z: gate.z + 6, radiusM: 3 },
    how: ["黑场字幕：1938年3月14日 夜｜滕县北门", "一长溜队伍往南走。幺娃：「老人家，你嗯往哪儿走？」老耿：「进城。城里有城墙，比庄上牢靠。」", "北门洞火把，连夜修工事，有人给进城的人舀水", "顺子进门洞，黑场"],
    notes: "北门挪近了（真实离北沙河十来里，预演黑场带过）：南岸往南约 143 m 就是城墙，门洞在南岸路上（路基东边）。",
    signals: [SIG.familyHidden, SIG.cartOverturned, SIG.girlHoleCovered, SIG.chargesSet, SIG.bridgeBlown],
    units: [
      N("Luo", RX(934.6, 0.6), { yaw: 180, to: Off(gate, 0, 8) }),
      C("Geng", RX(927.6, -1.0), { yaw: 180, to: Off(gate, -0.8, 8) }),
      C("Nier", RX(926.8, 0.2), { yaw: 180, to: Off(gate, 0.2, 8.6) }),
      N("Yaowa", RX(927.0, 1.4), { face: RX(927.6, -1.0), to: Off(gate, 1.0, 8) }),
      C("Refugee1", RX(924.0, -1.6), { role: "refugee", yaw: 180, to: Off(gate, -1.2, 9) }),
      C("Refugee2", RX(921.4, 1.2), { role: "refugeeWithBundle", yaw: 180, to: Off(gate, 1.2, 9) }),
      N("HeYoutian", RX(918.6, -0.8), { yaw: 180, to: Off(gate, -0.6, 10) }),
      N("LiuWencai", RX(916.4, 0.6), { yaw: 180, to: Off(gate, 0.4, 11) }),
      N("Squad1", RX(914.2, -0.6), { yaw: 180, guess: true, to: Off(gate, -0.4, 12) }),
      N("Squad2", RX(912.0, 0.8), { yaw: 180, guess: true, to: Off(gate, 0.6, 12.5) }),
      N("AidLitter1", RX(908.0), { kind: "litter", group: "aidEvac", yaw: 180, to: Off(gate, 0, 14) }),
      N("Doctor", RX(904.8, 1.2), { yaw: 180 }),
      C("SandCart1", Pt(NG.sandCarts[0].x, NG.sandCarts[0].z - 1.3), { name: "推小车运沙土的", yaw: 180, to: Pt(NG.sandCarts[0].x, 945.6), toStraight: true }),
      C("SandCart2", Pt(NG.sandCarts[1].x, NG.sandCarts[1].z - 1.3), { yaw: 180, to: Pt(NG.sandCarts[1].x, 945.6), toStraight: true }),
      C("WaterMan", Pt(NG.waterBucket.x - 1.0, NG.waterBucket.z - 0.6), { face: p188 }),
      N("Guide", Pt(gate.x - 1.2, gate.z - NG.wall.t / 2 - 1.2), { face: p188 }),
    ],
    pois: [POI.northGate("objective"), Poi("Torches", "门洞里的火把", "landmark", Pt(NG.torches[0].x, NG.torches[0].z), 2), Poi("SandCarts", "连夜修工事、运沙土", "poi", Pt(NG.sandCarts[0].x, NG.sandCarts[0].z), 2)],
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
  { id: "B", name: "北沙河村（主街、教堂、救护所）", stages: [12, 18], box: { minX: 56, maxX: 210, minZ: 645, maxZ: 742 } },
  { id: "C", name: "村西麦地 → 铁路桥 → 南头河堤", stages: [18, 18], box: { minX: -160, maxX: 56, minZ: 660, maxZ: 840 } },
  { id: "D", name: "北门", stages: [18, 18], box: { minX: -100, maxX: 20, minZ: 900, maxZ: 980 } },
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
      gameVersion: `11–18 白盒第三版契约（2026-10-26，集成负责人；用户 10-26 认的北沙河村这一版）· ${L1218_VERSION}`,
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
