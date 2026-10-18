// ===========================================================================
// Script_EditorBlockoutFirstLevel1218Keyframes.mjs —— 第一关 12–18 新剧本白盒（关卡键 FirstLevel1218）的关键帧配置生成器
//
//   node Taierzhuang1938/Script_EditorBlockoutCli.mjs export FirstLevel1218 --force   → Blockout/FirstLevel1218.json
//
// 口径：
//   · 剧本（台词、谁做什么）以集成负责人 2026-10-19 的 12–18 扩写稿为准；距离、站位以同日的分拍空间图为准，
//     后者已换算成世界坐标写在 Data_EditorBlockoutFirstLevel1218Space.mjs —— 本文件所有坐标都从那里算，不手抄数字。
//   · 每一拍先让玩家亲眼看到出了什么事，再给一句话的下一步；「掩护」「清理」「护送」不进 next。台词不逐句写进关键帧，只写「此时」。
//   · 坐标 X 向东、Z 向南、米；yawDeg 0 朝北、+90 朝西、−90 朝东、180 朝南（同 Script_EditorBlockoutConfig）。
//
// 走位：同一个人在相邻关键帧里 id 不变；生成时按路网（出村小路、大路、排水沟、桥头空场、院门、厢房门、浮桥、南岸路、北门）自动排 path，
// 不让人穿墙、不走进河里（浮桥桥面除外）；野地里的人走直线。只在新帧出现的人写 path 起点「走进来」，只在旧帧的人写 intent「走出去」。
//
// 摆位检查（push 进 issues，CLI 打出来）：玩家 / 单位出界；玩家站进实心块、单位站进高块（读 Blockout/FirstLevel1218.scene.json，
// 按两帧 signals 算 gates）；两人重叠（< 0.6 m）、人站在担架上 / 车身里；过渡路线穿高块；路线上 1 m 内高差超过 1.2 m（爬坎的例外）。
// 纯函数式生成：不读时钟、不读 git；只在 node 里读场景文件做检查。
// ===========================================================================

import { BLOCKOUT_SCHEMA, PlanTransition, NormalizeBlockout, YawDegFromTo } from "./Script_EditorBlockoutConfig.mjs";
import { BlockStandSampler } from "./Script_EditorBlockoutPrevizPlan.mjs";
import { PointAlong, PointBeside } from "./Data_EditorBlockoutFirstLevel0105Space.mjs";
import {
  L1218_LEVEL_KEY, L1218_TITLE, L1218_BOUNDS, L1218_PLACES as PL, L1218_LANE as LN, L1218_ROAD as RD, L1218_DITCH as DT, L1218_BRIDGE as BR,
  L1218_BRIDGEHEAD as BH, L1218_YARD as Y, L1218_OTHER_YARDS, L1218_BANK as BK, L1218_SOUTH as S, L1218_SIGNALS as SIG, L1218_LEVEES as LV, L1218_RIVER as RV,
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
const ROAD_Z = RD.line[0].z, LANE_X = LN.line[0].x, BRIDGE_X = BR.x;
/** 大路上按 x 取点（lat > 0 = 路南）。 */
const RP = (x, lat = 0) => Pt(x, ROAD_Z + lat);
/** 出村小路上按 z 取点（lat > 0 = 东）。 */
const LP = (z, lat = 0) => Pt(LANE_X + lat, z);
/** 浮桥 / 南岸路上按 z 取点（lat > 0 = 东）。 */
const BP = (z, lat = 0) => Pt(BRIDGE_X + lat, z);
/** 排水沟中线上按 x 取点（沟底只有 1.6 m 宽，沟里的人一律站中线；lat 往南偏）。 */
export function DitchPoint(x, lat = 0) {
  const line = DT.line;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1], b = line[i];
    if (b.x !== a.x && (x - a.x) * (x - b.x) <= 0) return Pt(x, a.z + (b.z - a.z) * (x - a.x) / (b.x - a.x) + lat);
  }
  return Pt(x, line[line.length - 1].z + lat);
}
/** 排水沟按弧长取点（出口那一截不再按 x 单调）。 */
const DA = (d) => { const p = PointAlong(DT.line, d); return Pt(p.x, p.z); };

// ---------------------------------------------------------------------------
// 路网：小路 + 大路 + 排水沟 + 桥头空场 + 院门 / 厢房门 + 浮桥 + 南岸路 + 北门；院子 / 厢房 / 空场是能自由走动的区域，门是出入口。

const DOOR_OUT = 1.3;   // 门两侧各放一个路点，离墙中线这么远
const NET_SNAP_M = 2.6; // 离路中线这么近就算在路上

const NODE = {};
const nodes = [], edges = [], areas = [];
const Node = (name, x, z) => { NODE[name] = nodes.length; nodes.push({ x: R2(x), z: R2(z), name }); return NODE[name]; };
const Edge = (a, b) => edges.push([NODE[a], NODE[b]]);
const Chain = (...names) => { for (let i = 1; i < names.length; i++) Edge(names[i - 1], names[i]); };
const Area = (name, box, ...portals) => areas.push({ name, box, portals: portals.map((n) => NODE[n]) });
const Box = (minX, maxX, minZ, maxZ) => ({ minX, maxX, minZ, maxZ });

// 出村小路：村南口 → 大路
Node("LaneN", LANE_X, LN.line[0].z); Node("LaneMid", LANE_X, 580); Node("LaneJ", LANE_X, ROAD_Z);
Chain("LaneN", "LaneMid", "LaneJ");
// 大路：东头出界 → 桥头空场
const ROAD_XS = [150, 40, 2, PL.cartRaidAt.x, -40, -70, -100, -120, BH.trench.x, -140, -150];
Node("RoadE", ROAD_XS[0], ROAD_Z);
Edge("RoadE", "LaneJ");
let prevRoad = "LaneJ";
for (const x of ROAD_XS.slice(1)) {
  const name = x === BH.trench.x ? "TrenchGap" : x === -40 ? "DitchMouthRoad" : x === -140 ? "RoadSq" : `Road${Math.abs(x)}${x < 0 ? "W" : "E"}`;
  Node(name, x, ROAD_Z); Edge(prevRoad, name); prevRoad = name;
}
// 排水沟：沟口（浅沟）→ 沟底 → 出口（桥脚东边的河滩）→ 桥北脚
DT.line.forEach((p, i) => Node(`Ditch${i}`, p.x, p.z));
Edge("DitchMouthRoad", "Ditch0");
for (let i = 1; i < DT.line.length; i++) Edge(`Ditch${i - 1}`, `Ditch${i}`);
// 桥头：空场南边 → 北引道 → 桥北脚 → 桥面 → 桥南脚 → 南引道 → 南岸路 → 北门 → 门内街
Node("SquareS", BRIDGE_X, 624); Node("OfficerPost", BH.officerPost.x, BH.officerPost.z); Node("RampN", BRIDGE_X, BR.northRampFromZ); Node("BridgeN", BRIDGE_X, BR.northFootZ);
Node("BridgeMid", BRIDGE_X, (BR.northFootZ + BR.southFootZ) / 2); Node("BridgeS", BRIDGE_X, BR.southFootZ); Node("RampS", BRIDGE_X, BR.southRampToZ);
Node("South740", BRIDGE_X, 740); Node("South800", BRIDGE_X, 800); Node("South845", BRIDGE_X, 845);
Node("GateOut", S.gate.x, S.wall.z - S.wall.t / 2 - DOOR_OUT); Node("GateIn", S.gate.x, S.wall.z + S.wall.t / 2 + DOOR_OUT); Node("Street", S.street.x, S.street.toZ - 2);
Chain("SquareS", "RampN", "BridgeN", "BridgeMid", "BridgeS", "RampS", "South740", "South800", "South845", "GateOut", "GateIn", "Street");
Edge(`Ditch${DT.line.length - 1}`, "BridgeN"); Edge("OfficerPost", "SquareS");
// 接收院：东墙大门 → 院里 → 厢房门；院门外墙根排担架的那一线
Node("YardGateOut", Y.box.maxX + DOOR_OUT, Y.gate.z); Node("YardGateIn", Y.box.maxX - DOOR_OUT, Y.gate.z);
Node("XiangDoorOut", Y.xiang.door.x, Y.xiang.box.minZ - DOOR_OUT); Node("XiangDoorIn", Y.xiang.door.x, Y.xiang.box.minZ + DOOR_OUT);
Node("QueueHead", Y.queueAlongX, Y.queueFromZ); Node("QueueTail", Y.queueAlongX, Y.queueToZ);
Edge("YardGateOut", "YardGateIn"); Edge("XiangDoorOut", "XiangDoorIn"); Chain("YardGateOut", "QueueHead", "QueueTail");
// 区域：桥头空场（含散兵坑南段）、散兵坑北段那一条、院里、厢房里
Area("Square", Box(-166, -128, 604.5, 626), "RoadSq", "TrenchGap", "SquareS", "YardGateOut", "QueueHead");
Area("TrenchN", Box(BH.trench.x - 4, BH.trench.x + 4, BH.trench.segments[0][0] - 1, 610), "TrenchGap");
Area("Yard", Box(Y.box.minX + 7, Y.box.maxX - 0.5, Y.mainHouse.box.maxZ + 0.5, Y.xiang.box.minZ - 0.25), "YardGateIn", "XiangDoorOut");
Area("Xiang", Box(Y.xiang.box.minX + 0.5, Y.xiang.box.maxX - 0.5, Y.xiang.box.minZ + 0.5, Y.xiang.box.maxZ - 0.5), "XiangDoorIn");
// 同一个区域的出入口之间能直走（院里从大门走到厢房门、空场从路口走到引道）
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
/** 点所在的区域（嵌套时取最小的那个）。 */
const AreaOf = (p) => areas.filter((a) => InBox(a.box, p)).sort((a, b) => BoxArea(a.box) - BoxArea(b.box))[0] || null;
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
const UNIT_KEY_ORDER = ["id", "side", "kind", "name", "castId", "role", "group", "weapon", "x", "z", "yawDeg", "stance", "aim", "state", "lie", "bearers", "arc", "speedMps", "path", "intent", "guess"];

/**
 * 一个单位。at = {x,z}；o：
 *   face {x,z} | yaw   朝向；name / castId / kind / role / group / weapon（null = 空手）/ stance / aim / down / lie / bearers / arc / speed / guess
 *   from {x,z}|[..]   只在本帧出现：从这里走进来（path 起点）；fromStraight 不走路网
 *   path [..]          显式来路；to / intent 去向（to 沿路网排）；toStraight 直线
 *   straight           上一帧过来走直线（不排路网）
 *   climb              来去要爬坎 / 翻墙（不报高差）；onLitter 躺在哪副担架上（不报「站在担架上」）
 */
function U(id, side, at, o = {}) {
  const u = { id, side, x: R2(at.x), z: R2(at.z) };
  if (o.kind && o.kind !== "soldier") u.kind = o.kind;
  if (o.name) u.name = o.name;
  if (o.castId) u.castId = o.castId;
  if (o.role) u.role = o.role;
  if (o.group) u.group = o.group;
  if (o.weapon !== undefined) u.weapon = o.weapon;
  u.yawDeg = o.face ? Yaw(at, o.face) : R1(o.yaw ?? at.heading ?? 0);
  if (o.stance && o.stance !== "stand") u.stance = o.stance;
  if (o.aim) u.aim = true;
  if (o.down) u.state = "down";
  if (o.down && o.lie) u.lie = o.lie;
  if (o.bearers !== undefined) u.bearers = o.bearers;
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
  META.set(u, { straight: !!o.straight, climb: !!o.climb, explicitPath: !!(o.path || o.from), onLitter: o.onLitter || null });
  return u;
}

const Poi = (id, name, kind, at, radiusM = 2) => ({ id, name, kind, x: R2(at.x), z: R2(at.z), radiusM });
const ArcTo = (from, to, halfDeg, extraM = 6) => ({ halfDeg, rangeM: R1(Dist(from, to) + extraM), yawDeg: Yaw(from, to) });

const POI = {
  gengSmoke: () => Poi("GengSmoke", "老耿家那个方向冒烟", "landmark", PL.gengSmoke, 6),
  laneJunction: (kind = "poi") => Poi("LaneJunction", "小路接上大路", kind, PL.laneJunction, 3),
  bridgehead: (kind = "landmark") => Poi("Bridgehead", "桥头那几间屋（伤兵都往那儿送）", kind, Pt(-150, 618), 10),
  planes: () => Poi("Planes", "两架日机顺着大路扫", "danger", Pt(-14, 611), 12),
  planesEast: () => Poi("PlanesEast", "东边天上嗡嗡响", "danger", Pt(120, 600), 10),
  ditchMouth: (kind = "objective") => Poi("DitchMouth", "沟口（这沟通河边）", kind, PL.ditchMouth, 2.5),
  bullets: () => Poi("BulletLine", "弹孔一串（离担架一步远）", "danger", Pt(-30.4, 611.5), 1.5),
  ditchOutlet: (kind = "objective") => Poi("DitchOutlet", "沟到头：桥脚东边的河滩", kind, PL.ditchOutlet, 2.5),
  yardGate: (kind = "poi") => Poi("YardGate", "接收院大门", kind, PL.yardGate, 2),
  xiangDoor: (kind = "objective") => Poi("XiangDoor", "厢房门（有门槛）", kind, PL.xiangDoor, 1.5),
  dongguaInside: () => Poi("DongguaInside", "厢房里靠墙的空地", "objective", Y.dongguaInside, 1.5),
  threshold: () => Poi("Threshold", "门槛", "poi", Y.thresholdSeat, 1),
  bridge: (kind = "landmark") => Poi("Bridge", "浮桥（一回只过一副）", kind, BP((BR.northFootZ + BR.southFootZ) / 2), 6),
  railBlast: () => Poi("RailBlast", "远处铁路桥炸了", "danger", PL.railBlast, 8),
  trench: (kind = "objective") => Poi("Trench", "散兵坑（正对东边来的路）", kind, Pt(BH.trench.x, 616.5), 3),
  ijaMg: (kind = "danger") => Poi("IjaMg", "鬼子机枪（大路北边）", kind, PL.ijaMg, 4),
  lastGroup: () => Poi("LastGroup", "最后一拨人（土坎后头）", "poi", PL.lastGroupCover, 3),
  mortar: () => Poi("Mortar", "掷弹筒", "danger", PL.ijaMortar, 4),
  southFoot: (kind = "objective") => Poi("SouthFoot", "南岸", kind, PL.bridgeSouthFoot, 3),
  lamp: () => Poi("YardLamp", "接收院里马灯还亮着", "landmark", Pt(Y.gateLamp.x, Y.gateLamp.z), 2),
  wreck: () => Poi("Wreck", "断桥着火往下游漂", "landmark", BR.debris[1], 6),
  northGate: (kind = "objective") => Poi("NorthGate", "北门", kind, PL.northGate, 4),
  southRoad: () => Poi("SouthRoad", "往南走", "objective", BP(740), 3),
};

// ---------------------------------------------------------------------------
// 人物

const NRA = {
  Luo: { name: "罗班长", role: "squadLeader", castId: "luo" },
  Yaowa: { name: "幺娃", castId: "yaowa" },
  HeYoutian: { name: "何有田", castId: "heyoutian" },
  LiuWencai: { name: "刘文财", castId: "liuwencai" },
  Donggua: { name: "冬瓜", role: "comrade", castId: "comrade" },
  Doctor: { name: "军医", role: "doctor", weapon: null },           // 没有 castId：用 NRA 身体（能动嘴），空手
  GateGuard: { name: "守门的兵", role: "guard" },
  BridgeOfficer: { name: "桥头军官", kind: "officer", role: "bridgeOfficer", castId: "frontOfficer" },
  Sapper1: { name: "工兵", role: "sapper" }, Sapper2: { role: "sapper" },
  Guide: { name: "带路的兵", role: "guide" },
};
const N = (id, at, o = {}) => U(id, "nra", at, { ...(NRA[id] || {}), ...o });
const CIV = {
  Geng: { name: "老耿", kind: "civilian", role: "carter" },
  Nier: { name: "妮儿", kind: "child" },
  GengCart: { name: "驴车", kind: "cart" },
  Heizi: { name: "黑子", kind: "animal" },
  WaterMan: { name: "舀水的", kind: "civilian" },
};
const C = (id, at, o = {}) => U(id, "civ", at, { ...(CIV[id] || {}), kind: (CIV[id] || {}).kind || "civilian", ...o });
const IJA = {
  IjaMg: { name: "鬼子机枪", role: "machineGun", weapon: "Type11", group: "mg" },
  IjaMgLoader: { name: "副射手", role: "loader", group: "mg" },
  Mortar1: { name: "掷弹筒", role: "mortar", group: "mortar" },
  Mortar2: { role: "mortarLoader", group: "mortar" },
  IjaTank: { name: "战车", kind: "tank", group: "levee" },
};
const J = (id, at, o = {}) => U(id, "ija", at, { ...(IJA[id] || {}), ...o });

// ---------------------------------------------------------------------------
// 固定站位与成组的人

const CART_LEN = 2.4, CART_TAIL = CART_LEN / 2 + 0.3;   // 车身 2.4 长；车尾外一步
const MOUTH = Pt(PL.ditchMouth.x, PL.ditchMouth.z);
const OFFICER = Pt(BH.officerPost.x, BH.officerPost.z);
const MG = Pt(PL.ijaMg.x, PL.ijaMg.z), MG_LOADER = Off(MG, 1.2, 0.7);
const MG_ARC = ArcTo(MG, Pt(-140, 616), 10, 12);
const LAST_COVER = Pt(PL.lastGroupCover.x, PL.lastGroupCover.z);
const SQUARE_C = Pt(-149, 619);

/** 冬瓜那副担架：bearers 0 = 搁在地上 / 车尾；冬瓜躺在上面顺着担架（lie:"along"，头朝担架朝向的前方）。 */
const DongguaOnLitter = (at, { bearers = 0, yaw = 90, extra = {} } = {}) => [
  N("LitterDonggua", at, { kind: "litter", name: "冬瓜的担架", bearers, yaw, group: "convoy", speed: 1.2, ...extra }),
  N("Donggua", at, { down: true, lie: "along", onLitter: "LitterDonggua", speed: 1.2, yaw, ...extra }),
];
/** 冬瓜不在担架上（摔在车旁 / 滑到路当中）：担架在他旁边。 */
const DongguaOff = (body, litterAt, { yaw = 90, litterYaw = 90 } = {}) => [
  N("LitterDonggua", litterAt, { kind: "litter", name: "冬瓜的担架", bearers: 0, yaw: litterYaw, group: "convoy", speed: 1.2 }),
  N("Donggua", body, { down: true, lie: "along", yaw, speed: 1.2 }),
];

// 跟在驴车后头的后送队（12-1…14-2）：8 副担架 + 7 个走着的伤兵，按离车尾的距离排在「车尾往回」的折线上
const CONVOY_SLOTS = Array.from({ length: 15 }, (_, i) => ({ i, d: 4.6 + 2.9 * i, kind: i % 2 === 0 ? "litter" : "walker", side: i % 2 ? 1 : -1 }));
/**
 * mode：walk（抬着走）/ prone（担架搁在路上，人趴进路边浅沟）/ crouch（人蹲在浅沟里）。
 * back：车尾往回的折线（先沿大路往东、再上小路往北）；heading：行进朝向。
 */
function Convoy(back, mode = "walk", heading = 90, { exclude = new Set() } = {}) {
  const out = [];
  let litters = 0, walkers = 0;
  for (const s of CONVOY_SLOTS) {
    const onRoad = PointAlong(back, s.d).z <= ROAD_Z + 0.1 && PointAlong(back, s.d).x < LANE_X - 1;
    const gutter = onRoad ? RD.gutterOffset : 1.2;
    if (s.kind === "litter") {
      litters++;
      const id = `Litter${String(litters).padStart(2, "0")}`;
      if (exclude.has(id)) continue;
      const p = PointBeside(back, s.d, s.side * 0.8);
      out.push(N(id, p, { kind: "litter", name: litters === 1 ? "担架" : undefined, bearers: mode === "walk" ? 2 : 0, yaw: heading, group: "convoy", straight: true, speed: 1.2 }));
    } else {
      walkers++;
      const id = `Walker${String(walkers).padStart(2, "0")}`;
      if (exclude.has(id)) continue;
      const p = PointBeside(back, s.d, s.side * (mode === "walk" ? 0.8 : gutter));
      out.push(N(id, p, { role: "walkingWounded", group: "convoy", yaw: heading, stance: mode === "walk" ? "stand" : mode, straight: true, speed: 1.0 }));
    }
  }
  return out;
}
const BackLine = (tail) => (tail.z < ROAD_Z - 0.1 ? [tail, LP(540)] : [tail, RP(LANE_X), LP(540)]);

// 12-3 起大路西段排着过桥的长队：担架、牛车、背着铺盖的百姓、走着的伤兵（30 个），停在路上
const QUEUE_SLOTS = Array.from({ length: 30 }, (_, i) => {
  const x = -23 - 4.2 * i, side = i % 2 ? 1 : -1;
  const kind = i === 7 || i === 19 ? "cart" : i % 3 === 1 ? "litter" : i % 3 === 0 ? "civ" : "walker";
  return { i, x, side, kind };
});
/** mode：stand（排着等）/ prone（趴进浅沟）/ crouch（蹲在浅沟里）。担架搁在路上、车不动。 */
function Queue(mode = "stand") {
  const out = [];
  let litters = 0, civs = 0, walkers = 0, carts = 0;
  for (const s of QUEUE_SLOTS) {
    const onRoad = RP(s.x, s.side * 0.9);
    if (s.kind === "litter") {
      litters++;
      out.push(N(`QLitter${String(litters).padStart(2, "0")}`, onRoad, { kind: "litter", bearers: mode === "stand" ? 2 : 0, yaw: 90, group: "queue", straight: true, speed: 1.2 }));
    } else if (s.kind === "cart") {
      carts++;
      out.push(C(`QCart${carts}`, RP(s.x, s.side * 0.6), { kind: "cart", name: carts === 1 ? "牛车" : undefined, yaw: 90, group: "queue", straight: true }));
    } else {
      const p = mode === "stand" ? onRoad : RP(s.x, s.side * RD.gutterOffset);
      if (s.kind === "civ") { civs++; out.push(C(`QCiv${String(civs).padStart(2, "0")}`, p, { role: "refugee", group: "queue", yaw: 90, stance: mode === "stand" ? "stand" : mode, straight: true })); }
      else { walkers++; out.push(N(`QWalker${String(walkers).padStart(2, "0")}`, p, { role: "walkingWounded", group: "queue", yaw: 90, stance: mode === "stand" ? "stand" : mode, straight: true, speed: 1.0 })); }
    }
  }
  return out;
}

// 散兵坑里的位置（坑底 x −132；北段 598…609、南段 615…623.5）
const TR_X = BH.trench.x;
const TRENCH_SLOTS = Object.freeze({
  Luo: Pt(TR_X, 618.6), Yaowa: Pt(TR_X, 620.6), BridgeGuard3: Pt(TR_X, 622.6),
  HeYoutian: Pt(TR_X, 599.4), LiuWencai: Pt(TR_X, 601.4), Squad1: Pt(TR_X, 603.4), Squad2: Pt(TR_X, 605.4), BridgeGuard1: Pt(TR_X, 607.4), BridgeGuard2: Pt(TR_X, 608.8),
});
const EAST_FAR = Pt(60, 609);   // 坑里的人朝东看的方向

// 接收院里：军医、百姓、麦秸上的伤员
const DOCTOR = Pt(Y.doctorPost.x, Y.doctorPost.z);
const WOUNDED_SPOTS = Object.freeze([
  Pt(-189.6, 608.4), Pt(-186.2, 609.0), Pt(-182.6, 608.3), Pt(-170.4, 609.2), Pt(-167.2, 611.6),
  Pt(-189.8, 613.2), Pt(-186.6, 614.0), Pt(-189.4, 618.2), Pt(-186.0, 621.6), Pt(-167.0, 620.4),
]);
const YardPeople = ({ doctorAt = DOCTOR, doctorFace = Pt(Y.gate.z ? PL.yardGate.x : 0, PL.yardGate.z), doctorStance = "stand", boardTo = null } = {}) => [
  N("Doctor", doctorAt, { face: doctorFace, stance: doctorStance }),
  C("Civ1", Pt(Y.kitchen.box.maxX + 1.2, Y.kitchen.box.minZ + 6.2), { name: "烧水的", face: Pt(Y.kitchen.box.maxX, Y.kitchen.box.minZ + 6.2) }),
  C("Civ2", Pt(-170.6, 616.4), { name: "抱门板的", yaw: -90, ...(boardTo ? { to: boardTo } : {}) }),
  C("Civ3", Pt(-188.4, 624.6), { yaw: 0, stance: "crouch" }),
  ...WOUNDED_SPOTS.map((p, i) => N(`YardWounded${String(i + 1).padStart(2, "0")}`, p, { role: "wounded", group: "yard", down: true, yaw: (i % 4) * 45, guess: true })),
];
const GATE_GUARD = Pt(Y.gateGuardPost.x, Y.gateGuardPost.z);
// 院门外墙根排着等的担架
const QUEUE_Z = [618.8, 621.4, 624.2, 627.2, 630.0, 632.8];
const DONGGUA_QUEUE_I = 2;
const GateQueue = () => QUEUE_Z.flatMap((z, i) => (i === DONGGUA_QUEUE_I ? [] : [N(`GLitter${i + 1}`, Pt(Y.queueAlongX, z), { kind: "litter", bearers: 0, yaw: 0, group: "gateQueue" })]));
const DONGGUA_QUEUE = Pt(Y.queueAlongX, QUEUE_Z[DONGGUA_QUEUE_I]);

// 浮桥上的人：桥面 x −151.2…−148.8
const SAPPER1 = Pt(BH.sapperPosts[0].x, BH.sapperPosts[0].z), SAPPER2 = Pt(BH.sapperPosts[1].x, BH.sapperPosts[1].z);

// ---------------------------------------------------------------------------
// 关键帧

function Keyframes() {
  const K = [];
  const Add = (kf) => K.push(kf);

  // ======================= 12 车边 =======================
  const s12 = { stage: 12, stageTitle: "车边" };
  // 12-1：出了后门往南，驴车在前头（朝南），顺子走在车尾边上
  const p121 = Pt(99.7, 589.6);   // 车尾边上（冬瓜那副担架东边一步），不踩担架
  const cart121 = LP(592.6), tail121 = Pt(98.2, 590.9), heizi121 = LP(595.0);
  Add({
    id: "12-1", ...s12, name: "出村",
    player: { x: p121.x, z: p121.z, yawDeg: 180, pitchDeg: -2, stance: "stand" },
    what: "驴车出后门往南；身后机枪停了、轰一声，老耿家方向冒烟。",
    next: { text: "跟着驴车往西去桥头", x: 40, z: ROAD_Z, radiusM: 4 },
    how: ["车板上横搁着三副担架，冬瓜那副靠车尾，妮儿坐车尾两条腿悬着", "刘文财跟在身后半步，顺子停他也停", "身后村里机枪声停了、「轰」一声闷响", "老耿回头看一眼冒烟的方向，鞭杆搭一下接着走"],
    notes: "车上没法摆东西（编辑器的车是一个块）：冬瓜那副担架（bearers 0）和冬瓜摆在车尾外一步、妮儿站在车尾边上。黑子用 kind animal 单独一个单位走在车前头。"
      + "后送队 8 副担架 + 7 个走着的伤兵跟在车后头（从小路一直排到村南口）。",
    signals: [],
    units: [
      C("GengCart", cart121, { yaw: 180, speed: 1.4 }),
      C("Heizi", heizi121, { yaw: 180, speed: 1.4 }),
      C("Geng", Off(heizi121, 1.1, 0.2), { yaw: 180 }),
      ...DongguaOnLitter(tail121, { yaw: 180 }),
      C("Nier", Pt(97.0, 590.8), { yaw: 180 }),
      N("LiuWencai", Pt(100.0, 588.0), { yaw: 180 }),
      ...Convoy(BackLine(Pt(98, 589.2)), "walk", 180),
    ],
    pois: [POI.gengSmoke(), POI.laneJunction("poi"), POI.bridgehead()],
  });

  // 12-2：大路上往西；妮儿扯短褂，顺子夺回来；老耿脱棉袄盖冬瓜
  const p122 = Pt(39.8, 614.4);
  const cart122 = RP(37.5), nier122 = RP(39.9, 0.6), tail122 = RP(40.0, -0.6);
  Add({
    id: "12-2", ...s12, name: "短褂",
    player: { x: p122.x, z: p122.z, yawDeg: Yaw(p122, nier122), pitchDeg: -6, stance: "stand" },
    what: "妮儿扯短褂，顺子夺回来；老耿脱棉袄盖冬瓜。",
    next: { text: "跟着车往西", x: 2, z: 613, radiusM: 4 },
    how: ["背后被扯一下，镜头一顿，回头是妮儿攥着那截蓝布袖子", "短过场：攥手腕、夺回来、塞回包底", "老耿把鞭子往车辕一插，脱棉袄扔过去盖严", "冬瓜：「临城再换……查得紧……」刘文财：「他说啥子？」"],
    notes: "车已拐上大路朝西。妮儿站在车尾边上（车上坐不了人，站着顶替），冬瓜的担架在车尾外一步。短过场里的手是 09 捂她嘴的那只手。",
    signals: [],
    units: [
      C("GengCart", cart122, { yaw: 90, speed: 1.4 }),
      C("Heizi", RP(35.0), { yaw: 90, speed: 1.4 }),
      C("Geng", RP(41.2, -1.4), { face: tail122 }),
      ...DongguaOnLitter(tail122, { yaw: 90 }),
      C("Nier", nier122, { face: p122 }),
      N("LiuWencai", Pt(41.4, 614.8), { face: p122 }),
      ...Convoy(BackLine(RP(38.7)), "walk", 90),
    ],
    pois: [POI.bridgehead(), POI.laneJunction("landmark")],
  });

  // 12-3：妮儿下车牵驴走在最前头；路上人越来越多；东边嗡嗡响
  const p123 = Pt(5, 614.5);
  const cart123 = RP(3.0), heizi123 = RP(0.6), nier123 = RP(-0.9, 0.4);
  Add({
    id: "12-3", ...s12, name: "犟种",
    player: { x: p123.x, z: p123.z, yawDeg: 90, pitchDeg: -2, stance: "stand" },
    what: "妮儿下车牵驴；路上排着过桥的长队；东边嗡嗡响。",
    next: { text: "（东边天上有飞机声）" },
    how: ["妮儿攥着笼头不撒手，老耿掰不开：「犟种。」顺子：「犟得跟我妹儿一样。」", "越往西人越多，车走一阵停一阵；「桥窄！一回只过得到一副！」", "太阳落到桥那头，路上的人都成了黑影子", "东边天上嗡嗡声由小变大"],
    notes: `大路西段 x −23…−145 排着 ${QUEUE_SLOTS.length} 个过桥的：担架 ${QUEUE_SLOTS.filter((s) => s.kind === "litter").length}、牛车 2、背铺盖的百姓 ${QUEUE_SLOTS.filter((s) => s.kind === "civ").length}、走着的伤兵 ${QUEUE_SLOTS.filter((s) => s.kind === "walker").length}。飞机没有单位，只有声音（POI 标在东边天上）。`,
    signals: [],
    units: [
      C("Nier", nier123, { yaw: 90, speed: 1.2 }),
      C("Heizi", heizi123, { yaw: 90, speed: 1.2 }),
      C("GengCart", cart123, { yaw: 90, speed: 1.2 }),
      C("Geng", RP(1.8, -1.4), { yaw: 90 }),
      ...DongguaOnLitter(RP(4.4, -0.6), { yaw: 90 }),
      N("LiuWencai", Pt(6.4, 614.9), { yaw: 90 }),
      ...Convoy(BackLine(RP(4.2)), "walk", 90),
      ...Queue("stand"),
    ],
    pois: [POI.planesEast(), POI.bridge(), POI.bridgehead()],
  });

  // ======================= 13 空袭 =======================
  const s13 = { stage: 13, stageTitle: "空袭" };
  // 13-1：两架日机顺着大路扫；人往浅沟里扑；妮儿站在路当中攥着笼头；刘文财扑出去
  const p131 = Pt(-6, 616.8);
  const cart131 = Pt(PL.cartRaidAt.x, PL.cartRaidAt.z), heizi131 = RP(cart131.x - 2.9), nier131 = RP(cart131.x - 4.5, 0.3);
  const liu131 = RP(-10.5, -RD.gutterOffset), geng131 = RP(-15.2, -RD.gutterOffset);
  Add({
    id: "13-1", ...s13, name: "第一轮",
    player: { x: p131.x, z: p131.z, yawDeg: Yaw(p131, nier131), pitchDeg: 4, stance: "prone" },
    what: "两架日机顺着大路扫，妮儿站在路当中，刘文财扑出去。",
    next: { text: "趴着，等飞机过去" },
    how: ["声音先到，路上的人一个接一个抬头；「飞机！趴倒！」（卧倒提示 Z，07 教过就不出）", "一串弹着点从路那头犁过来，从白布担架中间穿过去", "妮儿听不见，站在路当中四下看", "刘文财从沟里跳出去拦腰抱住她滚进路沟；弹着扫过黑子，车翻了"],
    notes: "飞机没有单位：POI（danger）标在路上方，声音先到。路上的人都趴进路两边的浅沟（z 608.6 / 615.4），担架来不及抬下路，搁在路上（bearers 0）。"
      + "玩家趴在路南浅沟边（z 616.8，沟边的平地上）。刘文财在北边浅沟里、intent 指向妮儿。黑子还立着、车还立着（翻车是这一拍末，CartOverturned 从 13-2 起）。",
    signals: [],
    units: [
      C("Nier", nier131, { face: p131 }),
      C("Heizi", heizi131, { yaw: 90 }),
      C("GengCart", cart131, { yaw: 90 }),
      ...DongguaOnLitter(RP(cart131.x + CART_TAIL + 0.6, -0.6), { yaw: 90 }),
      C("Geng", geng131, { stance: "prone", face: nier131 }),
      N("LiuWencai", liu131, { stance: "prone", face: nier131, intent: [RP(-16.6, -1.2), RP(nier131.x - 0.6, -RD.gutterOffset + 0.2)] }),
      ...Convoy(BackLine(RP(cart131.x + CART_TAIL)), "prone", 90),
      ...Queue("prone"),
    ],
    pois: [POI.planes(), Poi("NierOnRoad", "妮儿站在路当中", "poi", nier131, 1.5), POI.ditchMouth("landmark")],
  });

  // 13-2：飞机在西边兜圈子；车翻了、黑子蹬腿；冬瓜摔在车旁；老耿：顺着沟走！
  const p132 = Pt(-11, 616.4);
  const heizi132 = RP(cart131.x - 2.7, 1.4);
  const body132 = RP(cart131.x + 3.1, 1.0), litter132 = RP(cart131.x + 4.5, -0.4);
  const liu132 = RP(-19.1, -RD.gutterOffset + 0.3), nier132 = RP(-19.8, -RD.gutterOffset - 0.2);
  Add({
    id: "13-2", ...s13, name: "飞机兜回来",
    player: { x: p132.x, z: p132.z, yawDeg: Yaw(p132, MOUTH), pitchDeg: -2, stance: "stand" },
    what: "车翻了，冬瓜摔在车旁；老耿：顺着沟走！",
    next: { text: "把冬瓜抬进沟里", x: MOUTH.x, z: MOUTH.z, radiusM: 2.5 },
    how: ["飞机拉起来在西边的红天底下拐大弯，没走", "黑子侧躺着蹬腿，妮儿在刘文财怀里往黑子那边挣，喉咙里「啊——啊——」", "后头的担架员把另外两个伤员滚上担架抬着跑了", "老耿看黑子一眼就一眼，转身奔冬瓜：「顺着沟走！这沟通河边！」老耿抓后头两根杠子：「抬！」"],
    notes: "翻倒的车是随信号体块（CartOverturned：车身在 cartRaidAt 南边的路肩 + 一个车轮），立着的车 GengCart 从这一帧起不再摆；黑子 state down。"
      + "冬瓜摔在车旁的土里（担架甩在他旁边，bearers 0），这一拍里老耿和顺子把他翻回担架（自动）。另外两副担架被抬着往西走（intent）。",
    signals: [SIG.cartOverturned],
    units: [
      C("Heizi", heizi132, { down: true, yaw: 60 }),
      ...DongguaOff(body132, litter132, { yaw: 120, litterYaw: 90 }),
      C("Geng", RP(cart131.x + 4.6, 1.6), { face: body132 }),
      N("LiuWencai", liu132, { stance: "crouch", face: nier132 }),
      C("Nier", nier132, { stance: "crouch", face: heizi132 }),
      ...Convoy(BackLine(RP(cart131.x + CART_TAIL)), "crouch", 90, { exclude: new Set(["Litter01", "Litter02"]) }),
      N("Litter01", RP(-4.8, 0.8), { kind: "litter", name: "担架", yaw: 90, group: "convoy", intent: [RP(-30, 0.8)], speed: 1.6 }),
      N("Litter02", RP(-1.2, -0.8), { kind: "litter", yaw: 90, group: "convoy", intent: [RP(-28, -0.8)], speed: 1.6 }),
      ...Queue("crouch"),
    ],
    pois: [POI.ditchMouth("objective"), Poi("PlanesWest", "飞机在西边兜圈子", "danger", Pt(-120, 600), 10), Poi("Heizi", "黑子", "poi", heizi132, 1.5)],
  });

  // ======================= 14 松手 =======================
  const s14 = { stage: 14, stageTitle: "松手" };
  // 14-1：抬着冬瓜往沟口走：顺子抬前头、老耿抬后头；刘文财抱着妮儿先到沟口趴在沟沿上；飞机兜回来了
  const p141 = Pt(-24, 616);
  const litter141 = Pt(-22.7, 616.1), geng141 = Pt(-21.4, 616.2);
  const liu141 = Pt(-42.4, 622.3), nier141 = Pt(-41.5, 622.0);
  Add({
    id: "14-1", ...s14, name: "抬着走",
    player: { x: p141.x, z: p141.z, yawDeg: Yaw(p141, MOUTH), pitchDeg: -4, stance: "stand" },
    what: "抬着冬瓜往沟口走，飞机兜回来了。",
    next: { text: "把冬瓜抬进沟里", x: MOUTH.x, z: MOUTH.z, radiusM: 2.5 },
    how: ["两只手攥着杠子，枪背在背上，只能慢走，能转头", "往前看：沟口就在前头，刘文财抱着妮儿先到了，趴在沟沿上", "往后看：冬瓜躺在担架上，老耿在后头抬着喘得厉害：「快！快些！」", "往天上看：两架飞机兜完了弯正冲这边来，飞机声越来越响"],
    notes: "担架单位 bearers 0、摆在玩家与老耿之间（前头是玩家、后头是老耿，各离担架中心 1.3 m），冬瓜顺着担架躺。沿路南浅沟的南沿走（z 616）。",
    signals: [SIG.cartOverturned],
    units: [
      ...DongguaOnLitter(litter141, { yaw: 90, extra: { speed: 0.9 } }),
      C("Geng", geng141, { yaw: 90, speed: 0.9 }),
      // 刘文财抱着妮儿从北边浅沟穿过大路，贴着沟口东边、南边的岸上绕到沟沿（不从沟口那一下坡上跳下去）
      N("LiuWencai", liu141, { stance: "prone", face: p141, path: [RP(-22.4, 0.6), RP(-36.2, 2.6), Pt(-38.8, 621.9), liu141] }),
      C("Nier", nier141, { stance: "prone", face: p141, path: [RP(-21.6, 0.2), RP(-35.6, 2.4), Pt(-38.4, 621.4), nier141] }),
      C("Heizi", heizi132, { down: true, yaw: 60 }),
      ...Convoy(BackLine(RP(cart131.x + CART_TAIL)), "walk", 90, { exclude: new Set(["Litter01", "Litter02"]) }),
      ...Queue("stand"),
    ],
    pois: [POI.ditchMouth("objective"), Poi("PlanesBack", "飞机兜回来了", "danger", Pt(30, 600), 12)],
  });

  // 14-2：第二轮：顺子自己扑倒松了手；担架前头着地、后头还在老耿手里；冬瓜滑到路当中
  const p142 = Pt(PL.dropAt.x, PL.dropAt.z);
  const litter142 = Pt(-30.6, 615.6), geng142 = Pt(-29.0, 615.4), body142 = Pt(-31.0, 613.3);
  Add({
    id: "14-2", ...s14, name: "第二轮",
    player: { x: p142.x, z: p142.z, yawDeg: -25, pitchDeg: 6, stance: "prone" },
    what: "顺子自己扑倒松了手：担架前头着地、后头还在老耿手里，冬瓜滑到路当中。",
    next: { text: "和老耿把冬瓜抬进沟里", x: MOUTH.x, z: MOUTH.z, radiusM: 2.5 },
    how: ["控制被收走两三秒：画面往下一砸，脸贴到土上，杠子「咚」一声砸在地上", "抬眼看到四样东西：手边的杠子、斜着的担架、滚到路当中的冬瓜（毛巾掉了伤口崩开）、这时才松手扑上去用背挡着的老耿", "地上那串弹孔离担架只有一步远，谁都没打着", "沟沿上刘文财抱着妮儿脸正冲这边；飞机过去了，顺子爬回去和老耿把冬瓜抬进沟（自动）"],
    notes: "测：试玩的人要答得出「顺子先松的手」。担架前头着地（bearers 0）放在玩家东北边，老耿站在担架后头「还举着后杠」；冬瓜滑到路当中（头朝西）。",
    signals: [SIG.cartOverturned],
    units: [
      ...DongguaOff(body142, litter142, { yaw: 90, litterYaw: 90 }),
      C("Geng", geng142, { face: litter142 }),
      N("LiuWencai", liu141, { stance: "prone", face: p142 }),
      C("Nier", nier141, { stance: "prone", face: p142 }),
      C("Heizi", heizi132, { down: true, yaw: 60 }),
      ...Convoy(BackLine(RP(cart131.x + CART_TAIL)), "prone", 90, { exclude: new Set(["Litter01", "Litter02"]) }),
      ...Queue("prone"),
    ],
    pois: [POI.bullets(), Poi("DongguaOnRoad", "冬瓜滚在路当中", "poi", body142, 1.5), POI.ditchMouth("objective")],
  });

  // ======================= 15 沟里 / 桥头 =======================
  const s15 = { stage: 15, stageTitle: "沟里" };
  // 15-1（15A）：沟底：担架搁在沟底，老耿按毛巾；刘文财：你松啥子手？冬瓜：八个……抵了
  const p151 = DitchPoint(-50.0);
  const litter151 = DitchPoint(-47.6), geng151 = DitchPoint(-45.6), liu151 = DitchPoint(-52.0), nier151 = DitchPoint(-53.6);
  Add({
    id: "15-1", ...s15, stageLabel: "15A", name: "沟底",
    player: { x: p151.x, z: p151.z, yawDeg: Yaw(p151, litter151), pitchDeg: -14, stance: "crouch" },
    what: "刘文财：又没着打到，你松啥子手？冬瓜：八个……抵了。",
    next: { text: "顺着沟抬到桥头", x: PL.ditchOutlet.x, z: PL.ditchOutlet.z, radiusM: 3 },
    how: ["沟比人深，头顶只剩一条红天；飞机声往南去了", "老耿跪在旁边把毛巾按回伤口里，冬瓜整个人弓起来", "冬瓜：「龟儿子……手恁个滑……八个……抵了。」没人接话", "刘文财把妮儿推给老耿：「老人家，你牵到她。我来。」弯腰攥住后头的杠子"],
    notes: "沟底只有 1.6 m 宽，人都排在沟中线上（DitchPoint）。老耿「跪在旁边」：百姓是程序化身体蹲不下来，站在担架东头顶替。歇脚处 ditchHalt 挪到了沟中线上（草稿在南壁上）。",
    signals: [SIG.cartOverturned],
    units: [
      ...DongguaOnLitter(litter151, { yaw: 90 }),
      C("Geng", geng151, { face: litter151 }),
      // 从沟沿回到沟口顶上，顺着斜坡下到沟底再往西（不从沟壁跳）
      N("LiuWencai", liu151, { face: p151, path: [Pt(-38.6, 621.4), Pt(-38.3, 616.2), DT.line[0], ...StreetRoute(DT.line[0], liu151)] }),
      C("Nier", nier151, { face: liu151, path: [Pt(-38.2, 621.0), Pt(-37.9, 615.8), Pt(DT.line[0].x + 0.3, DT.line[0].z), ...StreetRoute(DT.line[0], nier151)] }),
      ...Queue("stand"),
    ],
    pois: [POI.ditchOutlet("objective"), Poi("RedSky", "头顶一条红天", "landmark", DitchPoint(-48), 1)],
  });

  // 15-2（15B）：沿沟抬：顺子前头、刘文财后头；老耿牵着妮儿在最后；一路没话
  const p152 = DitchPoint(-100);
  const litter152 = DitchPoint(-98.7), liu152 = DitchPoint(-97.4), geng152 = DitchPoint(-94.4), nier152 = DitchPoint(-93.0);
  Add({
    id: "15-2", ...s15, stageLabel: "15B", name: "沿沟抬",
    player: { x: p152.x, z: p152.z, yawDeg: 90, pitchDeg: -3, stance: "stand" },
    what: "顺子抬前头、刘文财抬后头，一路没话。",
    next: { text: "抬到桥头", x: PL.ditchOutlet.x, z: PL.ditchOutlet.z, radiusM: 3 },
    how: ["只有喘气声、踩烂泥的声音、杠子吱呀响，冬瓜一下一下地哼", "回头：刘文财低着头看路不看顺子；老耿牵着妮儿走在最后，身上只有单褂子", "天一点点黑下来，红褪成灰蓝", "沟越走越浅，走到头眼前一下开阔：浮桥、马灯、桥头挤满人的院子"],
    notes: "沟比人深：沟里站着（眼 −0.28）看不见大路上的人（KeyframesTest 核）。担架在玩家与刘文财之间（bearers 0）。机位从草稿的 (−100,623.6)（在南壁上）挪到沟中线。",
    signals: [SIG.cartOverturned],
    units: [
      ...DongguaOnLitter(litter152, { yaw: 90, extra: { speed: 0.9 } }),
      N("LiuWencai", liu152, { yaw: 90, speed: 0.9 }),
      C("Geng", geng152, { yaw: 90, speed: 0.9 }),
      C("Nier", nier152, { yaw: 90, speed: 0.9 }),
      ...Queue("stand"),
    ],
    pois: [POI.ditchOutlet("objective"), POI.bridge()],
  });

  // 15-3（15C）：接收院门口：墙根排着担架；妮儿画驴摆弹壳；刘文财算驴腿的账
  const s15c = { stage: 15, stageTitle: "桥头" };
  const p153 = Pt(-157.6, 623.4);
  const nier153 = Pt(-156.4, 626.2), liu153 = Pt(-155.4, 625.0), geng153 = Pt(-160.4, 625.9);
  Add({
    id: "15-3", ...s15c, stageLabel: "15C", name: "接收院门口",
    player: { x: p153.x, z: p153.z, yawDeg: Yaw(p153, nier153), pitchDeg: -18, stance: "crouch" },
    what: "院门口墙根排着担架；妮儿画驴摆弹壳，刘文财算驴腿的账。",
    next: { text: "等着进院" },
    how: ["守门的兵把人往外推：「等到！里头满起了！」", "冬瓜搁在墙根排在别人后头，顺子在担架头上蹲下（自动）；老耿靠墙坐下抱着胳膊发抖", "妮儿拿树枝画驴，掏出弹壳在驴旁边摆一排；刘文财：「画的黑子嗦？」「你攒到出嫁，也换不到一条驴腿。」", "门里有人喊：「下一副！」"],
    notes: `院门外东墙根从 z ${Y.queueFromZ} 排到 ${Y.queueToZ}：${QUEUE_Z.length} 副担架（bearers 0），冬瓜那副第 ${DONGGUA_QUEUE_I + 1}。妮儿「蹲在地上画」：百姓蹲不下，站着顶替；老耿「靠墙坐」也是站着。`
      + "院里：军医、烧水抱门板的百姓、麦秸上躺着 10 个伤员。",
    signals: [SIG.cartOverturned],
    units: [
      ...DongguaOnLitter(DONGGUA_QUEUE, { yaw: 0 }),
      ...GateQueue(),
      C("Nier", nier153, { face: Pt(nier153.x, nier153.z + 1) }),
      N("LiuWencai", liu153, { stance: "crouch", face: nier153 }),
      C("Geng", geng153, { face: nier153 }),
      N("GateGuard", GATE_GUARD, { face: p153 }),
      ...YardPeople({ boardTo: Pt(-165.0, 617.4) }),
      ...Queue("stand"),
    ],
    pois: [POI.yardGate("objective"), Poi("NierDraw", "妮儿画的驴", "poi", Pt(nier153.x, nier153.z + 1), 1), POI.bridge()],
  });

  // ======================= 16 过门槛 =======================
  const s16 = { stage: 16, stageTitle: "过门槛" };
  const p161 = Pt(Y.xiang.door.x, 625.6);
  const litter161 = Pt(Y.xiang.door.x, 624.3), liu161 = Pt(Y.xiang.door.x, 623.0);
  const doctor161 = Pt(-177.5, 619.4);
  Add({
    id: "16-1", ...s16, name: "门槛",
    player: { x: p161.x, z: p161.z, yawDeg: 180, pitchDeg: -22, stance: "stand" },
    what: "军医指厢房；过门槛担架一歪，冬瓜：脚……慢点。",
    next: { text: "把担架慢慢放下", x: Y.dongguaInside.x, z: Y.dongguaInside.z, radiusM: 1.5 },
    how: ["院里点着马灯，麦秸上躺满了人；百姓在灶屋烧水，有人抱着门板往外走", "军医满手是血站起来扫一眼：「肚子上的？抬进去！表堵到门口！」", "厢房门口一道门槛，镜头一低一抬，担架往一边歪：「脚……慢点。」「……有门槛。抬高点。」（冬瓜最后一句话）", "屋里靠墙的空地：按住键慢慢放，一松手担架就砸下去"],
    notes: "顺子抬前头（在门口）、刘文财抬后头，担架在两人之间（bearers 0）。门槛是 0.15 高的块（XiangThreshold）。老耿和妮儿跟进了院子，在院门里侧等。",
    signals: [SIG.cartOverturned],
    units: [
      ...DongguaOnLitter(litter161, { yaw: 180, extra: { speed: 0.8 } }),
      N("LiuWencai", liu161, { yaw: 180, speed: 0.8 }),
      N("Doctor", doctor161, { face: p161 }),
      C("Geng", Pt(-165.5, 617.0), { face: p161 }),
      C("Nier", Pt(-165.0, 618.4), { face: p161 }),
      N("GateGuard", GATE_GUARD, { yaw: -90 }),
      ...GateQueue(),
      ...YardPeople().filter((u) => u.id !== "Doctor"),
      ...Queue("stand"),
    ],
    pois: [POI.xiangDoor("objective"), POI.threshold(), POI.dongguaInside()],
  });

  // ======================= 17 门槛上 =======================
  const s17 = { stage: 17, stageTitle: "门槛上" };
  const inside = Pt(Y.dongguaInside.x, Y.dongguaInside.z);
  const p171 = Pt(-180.2, 629);
  const doctor171 = Pt(-183.6, 629.2), geng171 = Pt(-184.0, 631.9), nier171 = Pt(Y.xiang.door.x, 628.4), liu171 = Pt(-179.2, 628.2);
  Add({
    id: "17-1", ...s17, name: "没了",
    player: { x: p171.x, z: p171.z, yawDeg: Yaw(p171, inside), pitchDeg: -26, stance: "stand" },
    what: "军医：……没了。老耿用自己的棉袄盖住冬瓜的脸。",
    next: { text: "（在门槛上坐下）", x: Y.thresholdSeat.x, z: Y.thresholdSeat.z, radiusM: 1 },
    how: ["军医蹲下掀开棉袄看一眼伤口，又摸摸脖子，停了一会儿：「……没了。」", "他站起来冲门口吼：「下一副！日你妈，表堵到门！」转身去看别人；院子里没人停下来", "刘文财：「刚才过门槛，还在说话……」没人答", "老耿把棉袄往上拉盖住脸，没拿回去；妮儿站在门边看这个大人的脸、又看那个"],
    notes: "担架放在厢房里靠墙（dongguaInside），冬瓜 down、盖着脸从这一帧起就不动了。军医「蹲下」：NRA 身体能蹲，蹲在担架西边。老耿在担架边（站着）。",
    signals: [SIG.cartOverturned],
    units: [
      ...DongguaOnLitter(inside, { yaw: 180 }),
      N("Doctor", doctor171, { stance: "crouch", face: inside, to: Pt(-176.4, 616.6) }),
      C("Geng", geng171, { face: inside }),
      C("Nier", nier171, { face: geng171 }),
      N("LiuWencai", liu171, { face: inside }),
      N("GateGuard", GATE_GUARD, { yaw: -90 }),
      ...GateQueue(),
      ...YardPeople().filter((u) => u.id !== "Doctor"),
      ...Queue("stand"),
    ],
    pois: [POI.threshold(), Poi("DongguaDead", "盖着脸的冬瓜", "poi", inside, 1.5)],
  });

  // 17-2：顺子坐在门槛上数铜板；院子里照常忙
  const seat = Pt(Y.thresholdSeat.x, Y.thresholdSeat.z);
  Add({
    id: "17-2", ...s17, name: "铜板",
    player: { x: seat.x, z: seat.z, yawDeg: 0, pitchDeg: -30, stance: "crouch" },
    what: "顺子坐在门槛上数铜板，院子里照常忙。",
    next: { text: "（按 F 数铜板）" },
    how: ["退到门口在门槛上坐下（自动两秒），之后能转头不能走", "摸出钱袋把铜板倒在手心里；屏幕上只亮一个 F，不写字；按一下往另一只手挪一个，手指头有点抖；不按也行", "院子里有人往里抬、往外抬、烧水；门外桥头上担架一副一副往桥上走"],
    notes: "「坐在门槛上」：玩家机位蹲姿、放在门槛北沿外（z 626.55，门槛块在 627）。军医回到院里去看别人。",
    signals: [SIG.cartOverturned],
    units: [
      ...DongguaOnLitter(inside, { yaw: 180 }),
      N("Doctor", Pt(-176.4, 616.6), { face: WOUNDED_SPOTS[3], stance: "crouch" }),
      C("Geng", geng171, { face: inside }),
      C("Nier", nier171, { face: seat }),
      N("LiuWencai", liu171, { face: seat }),
      N("GateGuard", GATE_GUARD, { yaw: -90 }),
      ...GateQueue(),
      ...YardPeople().filter((u) => u.id !== "Doctor"),
      ...Queue("stand"),
    ],
    pois: [Poi("Coins", "手心里的铜板", "poi", seat, 0.5), POI.yardGate("landmark"), POI.bridge()],
  });

  // 17-3：班长带人进来；掀棉袄看一眼；「咋个搞的？」「……飞机。」「起来，跟斗走」
  const luo173 = Pt(-181.4, 625.0), yaowa173 = Pt(-179.6, 625.6), he173 = Pt(-177.8, 622.6);
  const gateOutside = Pt(-156, 613);
  Add({
    id: "17-3", ...s17, name: "跟斗走",
    player: { x: seat.x, z: seat.z, yawDeg: Yaw(seat, luo173), pitchDeg: 4, stance: "crouch" },
    what: "班长：咋个搞的？刘文财：……飞机。班长：起来，跟斗走。",
    next: { text: "跟着班长去桥头", x: -147, z: 621, radiusM: 3 },
    how: ["院门口一阵乱，班长带着幺娃、何有田和剩下的人进来，满身是土和烟", "班长看见门槛上的顺子、屋里盖着脸的那个；蹲下掀开棉袄一角看看，又盖回去", "「咋个搞的？」「……飞机。」「狗日的。」幺娃看见顺子手心里那把铜板，把眼睛挪开了", "「顺儿。……起来，跟斗走。」顺子把铜板一把攥住塞回怀里站起来，拿回全部操作"],
    notes: "班长从院门走到顺子跟前（path 从门外进来）；幺娃站在顺子旁边；何有田与班里另外两个兵（Squad1 / Squad2，没有 castId）在后头 / 院门口。班长蹲下看冬瓜那一下在预演里做。",
    signals: [SIG.cartOverturned],
    units: [
      N("Luo", luo173, { face: seat, from: gateOutside }),
      N("Yaowa", yaowa173, { face: seat, from: gateOutside }),
      N("HeYoutian", he173, { face: seat, from: gateOutside }),
      N("Squad1", Pt(-167.0, 617.6), { face: seat, from: gateOutside, guess: true }),
      N("Squad2", Pt(-165.6, 619.8), { yaw: 90, from: gateOutside, guess: true }),
      ...DongguaOnLitter(inside, { yaw: 180 }),
      N("Doctor", Pt(-176.4, 616.6), { face: WOUNDED_SPOTS[3], stance: "crouch" }),
      C("Geng", geng171, { face: inside }),
      C("Nier", nier171, { face: luo173 }),
      N("LiuWencai", liu171, { face: luo173 }),
      N("GateGuard", GATE_GUARD, { yaw: -90 }),
      ...GateQueue(),
      ...YardPeople().filter((u) => u.id !== "Doctor"),
      ...Queue("stand"),
    ],
    pois: [POI.yardGate("objective"), POI.bridgehead("landmark")],
  });

  // ======================= 18 守桥头 =======================
  const s18 = { stage: 18, stageTitle: "守桥头" };
  // 18-1：桥头的命令：散兵坑、工兵绑炸药；远处铁路桥炸了；军官：顶到这儿，等后头的人过完再炸
  const p181 = Pt(-147, 621);
  const guards = { BridgeGuard1: TRENCH_SLOTS.BridgeGuard1, BridgeGuard2: TRENCH_SLOTS.BridgeGuard2, BridgeGuard3: TRENCH_SLOTS.BridgeGuard3 };
  const BridgeGuards = (o = {}) => Object.entries(guards).map(([id, p]) => N(id, p, { role: "bridgeGuard", group: "bridgehead", face: EAST_FAR, aim: true, ...o }));
  const squad181 = { Luo: Pt(-152, 617.6), Yaowa: Pt(-154.4, 618.4), HeYoutian: Pt(-150.2, 616.4), LiuWencai: Pt(-153.0, 615.0), Squad1: Pt(-156.6, 616.2), Squad2: Pt(-155.8, 614.4) };
  Add({
    id: "18-1", ...s18, name: "桥头的命令",
    player: { x: p181.x, z: p181.z, yawDeg: Yaw(p181, OFFICER), pitchDeg: -2, stance: "stand" },
    what: "远处铁路桥炸了；军官：顶到这儿，等后头的人过完再炸。",
    next: { text: "进散兵坑，朝东", x: -131.6, z: 616.5, radiusM: 2 },
    how: ["出了院子就是桥头：东边沿路一道浅浅的散兵坑，军官带几个兵守着；两个工兵跪在第一条船上往船底绑炸药，引线顺着桥板拉到南岸", "顺着河往远处「轰——」一声，天边腾起一大团火光：「铁路桥炸了。」", "「哪部分的？……正好，给老子顶到这儿！后头还有人在撤，等他们过完，这座也炸！」「顶到最后一个过桥！……城里头说了，援兵在路上了。」「在路上？日他妈，老子也在路上。」", "班长把人一个个塞进散兵坑，顺子的位置正对东边来的那条路；任务字：等后头的人过桥"],
    notes: "ChargesSet 从这一帧起（北头四条船上的炸药包 + 引线）。工兵站在桥面上（第一条船那一段），跪姿用蹲。远处铁路桥炸用 POI（danger）标在 railBlast。全班从院门往空场走，intent 指向各自的坑位。",
    signals: [SIG.cartOverturned, SIG.chargesSet],
    units: [
      N("BridgeOfficer", OFFICER, { face: p181 }),
      N("Sapper1", SAPPER1, { stance: "crouch", yaw: 0 }),
      N("Sapper2", SAPPER2, { stance: "crouch", yaw: 180 }),
      ...BridgeGuards(),
      ...Object.entries(squad181).map(([id, p]) => N(id, p, { face: OFFICER, to: TRENCH_SLOTS[id], guess: id.startsWith("Squad") })),
      N("LitterCross", BP(668), { kind: "litter", name: "过桥的担架", yaw: 180, group: "bridge", to: BP(740) }),
      C("Geng", Pt(-156.4, 619.6), { face: OFFICER }),
      C("Nier", Pt(-155.6, 620.8), { face: Pt(-156.4, 619.6) }),
      N("GateGuard", GATE_GUARD, { yaw: -90 }),
      N("Straggler1", RP(-80, -0.8), { role: "walkingWounded", group: "stragglers", yaw: 90, stance: "crouch", to: SQUARE_C }),
      N("Straggler2", RP(-62, 0.9), { role: "walkingWounded", group: "stragglers", yaw: 90, to: SQUARE_C }),
      C("Refugee1", RP(-70, 0.6), { role: "refugee", group: "stragglers", yaw: 90, to: SQUARE_C }),
      ...GateQueue(),
      ...YardPeople({ doctorAt: Pt(-176.4, 616.6), doctorStance: "crouch", doctorFace: WOUNDED_SPOTS[3] }),
    ],
    pois: [POI.railBlast(), POI.trench("objective"), Poi("Sappers", "工兵在第一条船上绑炸药", "poi", SAPPER1, 2), POI.bridge()],
  });

  // 18-2：等：撤下来的人一个个过桥；鬼子跟上来了；最后一拨被机枪压在土坎后
  const p182 = Pt(-131.6, 616.5);
  const IJA_FIELD = Object.freeze([
    [Pt(-28, 603.5), "prone"], [Pt(-22, 605.8), "crouch"], [Pt(-16, 602.6), "stand"], [Pt(-8, 606.4), "crouch"], [Pt(0, 604.0), "stand"], [Pt(12, 603.0), "stand"],
    [Pt(-30, 618.6), "prone"], [Pt(-20, 620.2), "crouch"], [Pt(-10, 617.8), "stand"], [Pt(4, 619.6), "crouch"],
  ]);
  const IjaField = () => IJA_FIELD.map(([p, stance], i) => J(`Ija${i + 1}`, p, { role: "rifleman", group: "east", stance, aim: stance !== "stand", face: SQUARE_C, straight: true, intent: [Off(p, -14, 0)], speed: 2.8 }));
  const IjaMgGroup = () => [
    J("IjaMg", MG, { stance: "prone", aim: true, arc: MG_ARC, yaw: MG_ARC.yawDeg }),
    J("IjaMgLoader", MG_LOADER, { stance: "prone", face: SQUARE_C }),
    J("Mortar1", Pt(PL.ijaMortar.x, PL.ijaMortar.z), { stance: "crouch", face: SQUARE_C }),
    J("Mortar2", Off(PL.ijaMortar, 1.3, 0.8), { stance: "crouch", face: SQUARE_C }),
  ];
  const LastGroup = () => [
    N("LastGroup1", Pt(-77.4, 602.6), { role: "lastGroup", group: "last", stance: "crouch", face: SQUARE_C }),
    N("LastGroup2", Pt(-77.6, 604.4), { role: "lastGroup", group: "last", stance: "crouch", face: MG }),
    N("LastGroup3", Pt(-78.0, 606.2), { role: "lastGroup", group: "last", stance: "crouch", face: SQUARE_C }),
    N("LastWounded", Pt(-78.9, 604.6), { role: "wounded", group: "last", down: true, yaw: 90 }),
  ];
  const SquadInTrench = () => ["Luo", "Yaowa", "HeYoutian", "LiuWencai", "Squad1", "Squad2"].map((id) => N(id, TRENCH_SLOTS[id], { face: EAST_FAR, aim: true, guess: id.startsWith("Squad") }));
  Add({
    id: "18-2", ...s18, name: "等",
    player: { x: p182.x, z: p182.z, yawDeg: -90, pitchDeg: 0, stance: "stand" },
    what: "撤下来的人一个个过桥；最后一拨被机枪压在土坎后。",
    next: { text: "打掉那挺机枪", x: MG.x, z: MG.z, radiusM: 4 },
    how: ["天快黑透了，东边路上还有人往这边来，一到桥头就挤上浮桥；老耿牵着妮儿也在桥上，踩着一沉一沉的桥板往南", "路两边麦地里枪口火一闪一闪，先零星后连成一片，鬼子散开往前跃进；玩家打冲在前头朝撤下来的人开枪的鬼子", "越来越糟：路边架起一挺机枪往桥头扫，桥板上有人中枪掉进河里；掷弹筒「嘭」一声落在坑前头；军官冲工兵喊「准备点火！」", "最后一拨三四个兵拖着一个伤的被机枪压在土坎后头过不来；「炸！不等了！」「还有人！」「再等一哈！……顺儿！那挺机枪！」机枪一哑幺娃站起来挥手：「快过来！」领头的跑过时：「后头没得人了！」"],
    notes: `散兵坑里站着（坑底 + 1.62）越过东沿的土袋看得见大路东边的机枪（场景生成器核过）；机枪趴着（眼 0.5）看不见土坎西边蹲着的最后一拨人（土坎顶 ${BK.topY}）。`
      + `鬼子：机枪组 2 在 ijaMg、步兵 ${IJA_FIELD.length} 个散在大路两边麦地 x −30…+12（跃进 intent 向西）、掷弹筒 2 在 ijaMortar。`,
    signals: [SIG.cartOverturned, SIG.chargesSet],
    units: [
      ...SquadInTrench(),
      ...BridgeGuards(),
      N("BridgeOfficer", OFFICER, { face: SAPPER1 }),
      N("Sapper1", SAPPER1, { stance: "crouch", yaw: 0 }),
      N("Sapper2", SAPPER2, { stance: "crouch", yaw: 180 }),
      C("Geng", BP(662, -0.3), { yaw: 180, to: BP(740), speed: 1.2 }),
      C("Nier", BP(663.4, 0.5), { yaw: 180, to: BP(741), speed: 1.2 }),
      N("Straggler1", RP(-108, -0.8), { role: "walkingWounded", group: "stragglers", yaw: 90, stance: "crouch", to: BP(640), speed: 1.8 }),
      N("Straggler2", RP(-96, 0.9), { role: "walkingWounded", group: "stragglers", yaw: 90, to: BP(640), speed: 2.2 }),
      C("Refugee1", RP(-102, 0.6), { role: "refugee", group: "stragglers", yaw: 90, to: BP(640), speed: 2.0 }),
      N("Straggler3", RP(-66, -0.9), { role: "walkingWounded", group: "stragglers", yaw: 90, to: BP(640), speed: 2.4, from: RP(-30, -0.9) }),
      C("Refugee2", RP(-58, 0.8), { role: "refugee", group: "stragglers", yaw: 90, to: BP(640), speed: 2.0, from: RP(-24, 0.8) }),
      N("LitterCross", BP(690), { kind: "litter", yaw: 180, group: "bridge", to: BP(740) }),
      ...LastGroup(),
      ...IjaMgGroup(),
      ...IjaField(),
      N("GateGuard", GATE_GUARD, { yaw: -90 }),
      ...GateQueue().slice(0, 2),
      ...YardPeople({ doctorAt: Pt(-176.4, 616.6), doctorStance: "crouch", doctorFace: WOUNDED_SPOTS[3] }),
    ],
    pois: [POI.ijaMg("danger"), POI.lastGroup(), POI.mortar(), POI.bridge()],
  });

  // 18-3：撤！过桥！全班在桥面上往南跑，班长最后一个；工兵在南头捏着引线；鬼子追到桥头空场东边
  const p183 = BP(676);
  const sapperS = Pt(-150.9, 703.2);
  const IJA_SQUARE_E = Object.freeze([Pt(-112, 609.0), Pt(-116, 614.6), Pt(-120, 606.8), Pt(-124, 611.2), Pt(-128, 617.8), Pt(-118, 619.5), Pt(-110, 616.0), Pt(-135, 604.0)]);
  Add({
    id: "18-3", ...s18, name: "过桥",
    player: { x: p183.x, z: p183.z, yawDeg: 180, pitchDeg: -4, stance: "stand" },
    what: "撤！过桥！班长最后一个上南岸；工兵：点！",
    next: { text: "跑过桥", x: BRIDGE_X, z: 708, radiusM: 3 },
    how: ["「撤！过桥！」全班从坑里爬出来往桥上跑，班长走在最后倒退着边打边撤", "浮桥在脚底下一沉一晃，板缝里是黑水，子弹打进水里噗噗响", "南岸桥头上工兵蹲着捏着引线等；班长最后一个踏上南岸：「点！」", "引线嗤嗤烧过桥板，大家扑到南岸河堤后头；「轰」北头那几条船炸开，浮桥从中间断开，断的半截着火往下游打转"],
    notes: "桥面 2.4 m 宽（x −151.2…−148.8），人都在板上。班长在最北、倒退着（朝北举枪）。BridgeBlown 在这一拍末，从 18-4 起。鬼子追到桥头空场东边 x −135…−110。",
    signals: [SIG.cartOverturned, SIG.chargesSet],
    units: [
      N("Luo", BP(663.5, -0.4), { yaw: 0, aim: true, speed: 2.0 }),
      N("Yaowa", BP(667.5, 0.4), { yaw: 180, speed: 3.0 }),
      N("HeYoutian", BP(670.6, -0.3), { yaw: 180, speed: 3.0 }),
      N("LiuWencai", BP(673.0, 0.5), { yaw: 180, speed: 3.0 }),
      N("Squad1", BP(679.5, -0.5), { yaw: 180, speed: 3.0, guess: true }),
      N("Squad2", BP(682.6, 0.6), { yaw: 180, speed: 3.0, guess: true }),
      N("BridgeGuard1", BP(686.0, -0.4), { role: "bridgeGuard", group: "bridgehead", yaw: 180, speed: 3.0 }),
      N("BridgeGuard2", BP(689.2, 0.5), { role: "bridgeGuard", group: "bridgehead", yaw: 180, speed: 3.0 }),
      N("BridgeGuard3", BP(692.4, -0.5), { role: "bridgeGuard", group: "bridgehead", yaw: 180, speed: 3.0 }),
      N("Sapper1", sapperS, { stance: "crouch", yaw: 0 }),
      N("Sapper2", BP(708, 0.4), { yaw: 0 }),
      N("BridgeOfficer", BP(709.5, 1.4), { yaw: 0 }),
      C("Geng", BP(722, -0.4), { yaw: 180, to: BP(740) }),
      C("Nier", BP(723.0, 0.4), { yaw: 180, to: BP(741) }),
      N("LitterCross", BP(730), { kind: "litter", yaw: 180, group: "bridge", to: BP(760) }),
      // 从麦地回到大路、顺着路追到桥头空场东边（不横穿排水沟）
      ...IJA_SQUARE_E.map((p, i) => J(`Ija${i + 1}`, p, { role: "rifleman", group: "east", aim: true, face: BP(690), speed: 2.8,
        path: [RP(IJA_FIELD[i][0].x, IJA_FIELD[i][0].z > ROAD_Z ? 1.0 : -1.0), RP(p.x, p.z > ROAD_Z ? 1.0 : -1.0), p] })),
      ...IjaMgGroup(),
      ...YardPeople({ doctorAt: Pt(-176.4, 616.6), doctorStance: "crouch", doctorFace: WOUNDED_SPOTS[3] }).filter((u) => u.id === "Doctor" || /^YardWounded/.test(u.id)),
    ],
    pois: [POI.southFoot("objective"), Poi("SapperSouth", "工兵捏着引线", "poi", sapperS, 1.5), Poi("IjaRush", "鬼子追到桥头", "danger", Pt(-120, 612), 10)],
  });

  // 18-4：对岸：桥断了；鬼子涌到对岸堤上打不过来；接收院里马灯还亮着
  const p184 = Pt(PL.southLeveeCover.x, PL.southLeveeCover.z);
  const leveeLine = (x) => Pt(x, LV.south.z + 3.4);
  const IJA_LEVEE_X = [-178, -175, -172, -169, -166, -163, -160, -157, -139, -136, -133, -130, -127, -124, -121, -118];
  Add({
    id: "18-4", ...s18, name: "对岸",
    player: { x: p184.x, z: p184.z, yawDeg: 0, pitchDeg: 2, stance: "stand" },
    what: "桥断了；鬼子涌到对岸打不过来；接收院里马灯还亮着。",
    next: { text: "往南走", x: BRIDGE_X, z: 740, radiusM: 3 },
    how: ["着火的船把北岸照亮了：鬼子一排排涌到对岸河堤上，后头路上还有战车的影子；他们朝这边开枪，可是过不来", "北岸那几间院子里，马灯还亮着", "班长：「走！看你妈啥子，走！」", "往南跑进黑里，身后的枪声慢慢远了"],
    notes: `BridgeBlown 从这一帧起：北头四段桥面与船没了，碎片在下游西边的水面上。站在南堤后（z 717，堤顶 1.5）眼睛刚好越过堤顶往北看（场景生成器核过：看得见北岸堤上的人、看得见院门灯桩上那盏马灯）。鬼子 ${IJA_LEVEE_X.length} 个排在北堤顶（避开桥口子和排水沟），战车在大路上。`,
    signals: [SIG.cartOverturned, SIG.chargesSet, SIG.bridgeBlown],
    units: [
      N("Luo", leveeLine(-143.4), { yaw: 0, aim: true }),
      N("Yaowa", leveeLine(-140.8), { yaw: 0 }),
      N("HeYoutian", leveeLine(-138.2), { yaw: 0, aim: true }),
      N("LiuWencai", leveeLine(-155.6), { yaw: 0, aim: true }),
      N("Squad1", leveeLine(-158.2), { yaw: 0, guess: true }),
      N("Squad2", leveeLine(-160.6), { yaw: 0, guess: true }),
      N("BridgeGuard1", leveeLine(-163.2), { role: "bridgeGuard", group: "bridgehead", yaw: 0 }),
      N("BridgeGuard2", leveeLine(-165.6), { role: "bridgeGuard", group: "bridgehead", yaw: 0 }),
      N("BridgeGuard3", leveeLine(-135.6), { role: "bridgeGuard", group: "bridgehead", yaw: 0 }),
      N("Sapper1", Pt(-157.6, 719.8), { yaw: 0 }),
      N("Sapper2", Pt(-148.8, 720.2), { yaw: 0 }),
      N("BridgeOfficer", BP(721.4, 1.4), { yaw: 0 }),
      C("Geng", BP(736, -0.4), { yaw: 180, to: BP(800) }),
      C("Nier", BP(737.0, 0.4), { yaw: 180, to: BP(801) }),
      N("LitterCross", BP(748), { kind: "litter", yaw: 180, group: "bridge", to: BP(800) }),
      ...IJA_LEVEE_X.map((x, i) => J(`LeveeIja${i + 1}`, Pt(x, 634.8), { role: "rifleman", group: "levee", yaw: 180, aim: i % 3 !== 0, stance: i % 4 === 1 ? "crouch" : "stand", straight: true, guess: true })),
      J("IjaTank", RP(-118), { yaw: 90, straight: true, guess: true }),
      ...YardPeople({ doctorAt: Pt(-176.4, 616.6), doctorStance: "crouch", doctorFace: WOUNDED_SPOTS[3] }).filter((u) => u.id === "Doctor" || /^YardWounded/.test(u.id)),
    ],
    pois: [POI.lamp(), POI.wreck(), Poi("LeveeIja", "鬼子涌到对岸堤上", "danger", Pt(-150, 635), 20), POI.southRoad()],
  });

  // 18-5：夜里，北门：一长溜队伍往南走；老耿：进城，城里有城墙比庄上牢靠；门口有人运沙土、舀水；带路的兵
  const p185 = Pt(-150.4, 846);
  const gate = Pt(PL.northGate.x, PL.northGate.z);
  const gengIn = BP(842.4, -1.0), nier185 = BP(841.6, 0.2), yaowa185 = BP(841.8, 1.4);
  Add({
    id: "18-5", ...s18, stageTitle: "北门", name: "北门",
    player: { x: p185.x, z: p185.z, yawDeg: 180, pitchDeg: 2, stance: "stand" },
    what: "夜里进北门；老耿：城里有城墙，比庄上牢靠。",
    next: { text: "进城", x: gate.x, z: gate.z + 4, radiusM: 3 },
    how: ["黑场，只有脚步声；字幕：1938年3月14日 夜｜滕县北门（14 还是 15 日待定）", "淡入：一长溜队伍往南走，有兵、有担架、有老百姓；老耿牵着妮儿在百姓堆里，身上还是那件单褂子", "幺娃：「老人家，你嗯往哪儿走？」老耿：「进城。城里有城墙，比庄上牢靠。」没人接", "前头黑压压的城墙，门洞里点着火把；兵和老百姓推小车往城墙上运沙土、扛木料；门洞边有人提着一桶水给进城的人一人舀一瓢；「有地方歇脚！跟我来！」"],
    notes: "北门挪近了（真实隔着十来里，预演黑场带过）：南岸往南 150 m 就是城墙。队伍从 z 828 排到 849，班长在前；老耿牵着妮儿在百姓堆里，幺娃走在老耿旁边。门口两个百姓推运沙土的小车、一个提水桶舀水的人、带路的兵在门洞口。",
    signals: [SIG.cartOverturned, SIG.chargesSet, SIG.bridgeBlown],
    units: [
      N("Luo", BP(848.8, 0.6), { yaw: 180, to: Off(gate, 0, 8) }),
      C("Geng", gengIn, { yaw: 180, to: Off(gate, -0.8, 8) }),
      C("Nier", nier185, { yaw: 180, to: Off(gate, 0.2, 8.6) }),
      N("Yaowa", yaowa185, { face: gengIn, to: Off(gate, 1.0, 8) }),
      C("Refugee1", BP(840.0, -2.2), { role: "refugee", yaw: 180, to: Off(gate, -1.2, 9) }),
      C("Refugee2", BP(844.0, 2.4), { role: "refugee", yaw: 180, to: Off(gate, 1.2, 9) }),
      C("Refugee3", BP(838.6, 1.6), { role: "refugee", yaw: 180, to: Off(gate, 0.6, 10) }),
      N("HeYoutian", BP(837.4, -1.4), { yaw: 180, to: Off(gate, -0.6, 10) }),
      N("LiuWencai", BP(836.0, 0.4), { yaw: 180, to: Off(gate, 0.4, 11) }),
      N("Squad1", BP(834.2, -0.6), { yaw: 180, guess: true, to: Off(gate, -0.4, 12) }),
      N("Squad2", BP(832.4, 0.8), { yaw: 180, guess: true, to: Off(gate, 0.6, 12.5) }),
      N("LitterCross", BP(829), { kind: "litter", yaw: 180, group: "bridge", to: Off(gate, 0, 14) }),
      N("BridgeGuard1", BP(826.4, -1.0), { role: "bridgeGuard", group: "bridgehead", yaw: 180 }),
      N("BridgeGuard2", BP(825.2, 0.9), { role: "bridgeGuard", group: "bridgehead", yaw: 180 }),
      C("SandCart1", Pt(S.sandCarts[0].x, S.sandCarts[0].z - 1.3), { name: "推小车的", yaw: 180, to: Pt(S.sandCarts[0].x, 855.6), toStraight: true }),
      C("SandCart2", Pt(S.sandCarts[1].x, S.sandCarts[1].z - 1.3), { yaw: 180, to: Pt(S.sandCarts[1].x, 855.6), toStraight: true }),
      C("WaterMan", Pt(S.waterBucket.x, S.waterBucket.z), { face: p185 }),
      N("Guide", Pt(gate.x - 0.6, gate.z - 1.4), { face: p185 }),
    ],
    pois: [POI.northGate("objective"), Poi("Torches", "门洞里的火把", "landmark", Pt(S.torches[0].x, S.torches[0].z), 2), Poi("SandCarts", "推小车运沙土修工事", "poi", Pt(S.sandCarts[0].x, S.sandCarts[0].z), 2)],
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
  { id: "A", name: "出村小路与大路东段", stages: [12, 12], box: { minX: -20, maxX: 150, minZ: 545, maxZ: 620 } },
  { id: "B", name: "大路中段与沟口（空袭）", stages: [13, 14], box: { minX: -60, maxX: 10, minZ: 600, maxZ: 625 } },
  { id: "C", name: "排水沟", stages: [15, 15], box: { minX: -148, maxX: -38, minZ: 614, maxZ: 648 } },
  { id: "D", name: "桥头与接收院", stages: [15, 18], box: { minX: -240, maxX: -100, minZ: 584, maxZ: 640 } },
  { id: "E", name: "浮桥与南岸", stages: [18, 18], box: { minX: -180, maxX: -120, minZ: 636, maxZ: 760 } },
  { id: "F", name: "北门", stages: [18, 18], box: { minX: -200, maxX: -100, minZ: 820, maxZ: 895 } },
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
      gameVersion: "12–18 扩写稿（2026-10-19，集成负责人）+ 同日分拍空间图",
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
// 摆位 / 走位检查（照 0610）

/** node 里读场景文件（没有或在浏览器里返回 null：只做与场景无关的检查）。 */
export async function LoadSceneLayout() {
  try {
    const fs = await import("node:fs");
    const url = new URL("./Blockout/FirstLevel1218.scene.json", import.meta.url);
    if (!fs.existsSync(url)) return null;
    const doc = JSON.parse(fs.readFileSync(url, "utf8"));
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
/** 演员脚下的地面（高度场 + ≤1 m 的块顶，同运行时 standAt；浮桥桥面就是这么站上去的）。 */
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
/** 车身（驴车 1.5×2.4）脚印里有没有人。 */
function OnCart(p, v, margin) {
  const r = v.yawDeg * Math.PI / 180, fx = -Math.sin(r), fz = -Math.cos(r);
  const dx = p.x - v.x, dz = p.z - v.z;
  return Math.abs(dx * fx + dz * fz) < CART_LEN / 2 + margin && Math.abs(-dx * fz + dz * fx) < 1.5 / 2 + margin;
}
/** 在北沙河的水里（浮桥桥面上不算：桥面是 ≤1 m 的块顶，stand 给的就是桥面高）。 */
function InRiver(p, stand) {
  if (p.z <= RV.waterMinZ || p.z >= RV.waterMaxZ) return false;
  return stand(p.x, p.z) < -1.6 + 0.05;
}

/**
 * 配置的摆位 / 走位问题（每条一行）。scene = LayoutFromSceneDoc 的结果（null = 场景还没有，只做与场景无关的检查）。
 * meta：`${kfId}/${unitId}` → { climb, onLitter }（生成器内部标记；手改的 JSON 没有它）。
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
      for (const u of people) if (OnCart(u, v, 0.2)) out.push(`${kf.id} ${u.id} 站在车身 ${v.id} 里`);
      if (OnCart(kf.player, v, 0)) out.push(`${kf.id} 玩家在车身 ${v.id} 里`);
    }
    if (Number.isFinite(kf.next?.x) && Dist(kf.next, kf.player) < C.nextM) out.push(`${kf.id} 下一步目标离玩家不到 ${C.nextM} m（只写文字）`);
    if (hasScene) {
      const solids = SolidsFor(scene, kf.signals);
      const ground = StandSampler(scene, kf.signals);
      const hit = BodyHit(solids, ground, kf.player.x, kf.player.z, C.playerBody, 0);
      if (hit) out.push(`${kf.id} 玩家站进 ${hit.id}`);
      if (InRiver(kf.player, ground)) out.push(`${kf.id} 玩家站在河里`);
      for (const u of kf.units) {
        if (!PEOPLE.has(u.kind) && u.kind !== "litter") continue;
        if (InRiver(u, ground)) out.push(`${kf.id} ${u.id} 在河里 (${u.x}, ${u.z})`);
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
      const climb = !!(m0.climb || m1.climb);
      const samples = Samples(entry.route, C.stepM);
      if (!hasScene) continue;
      const hits = new Set();
      for (const p of samples) {
        const h = BodyHit(solids, ground, p.x, p.z, C.body, C.body.routeTallM);
        if (h && !hits.has(h.id)) { hits.add(h.id); out.push(`${prev.id}→${kf.id} ${entry.id} 的走位穿过 ${h.id}（${R1(p.atM)} m 处）`); }
        if (InRiver(p, ground)) { out.push(`${prev.id}→${kf.id} ${entry.id} 的走位进了河里（${R1(p.atM)} m 处）`); break; }
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
