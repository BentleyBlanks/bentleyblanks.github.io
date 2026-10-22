// ===========================================================================
// Script_EditorBlockoutFirstLevel1218Keyframes.mjs —— 第一关 11–18 新剧本白盒（关卡键 FirstLevel1218）的关键帧配置生成器（2026-10-23 第二版）
//
//   node Taierzhuang1938/Script_EditorBlockoutCli.mjs export FirstLevel1218 --force   → Blockout/FirstLevel1218.json
//
// 口径：
//   · 剧本（台词、谁做什么）以集成负责人 2026-10-23 的白盒第二版契约「一、故事」为准（用户 10-23 认的 11–14 五步大纲 + 细化稿）；
//     空间以同契约「二、空间」为准，已换算成世界坐标写在 Data_EditorBlockoutFirstLevel1218Space.mjs —— 本文件所有坐标都从那里算，不手抄数字。
//   · 帧 id 用拍号：11-1、11-2、12-1…12-3、13-1…13-3、14-1…14-3、15-1…15-3（15A / 15B / 15C）、16-1、17-1…17-3、18-1…18-5，共 23 帧。
//   · 每一拍先让玩家亲眼看到出了什么事，再给一句话的下一步；「掩护」「清理」「护送」不进 next。台词照契约原字写进 how。
//   · 百姓一律程序化身体（body:"procedural"，用户 10-23：看不清百姓和士兵谁是谁）；只有非放片段不可的几帧换回骨骼身体：
//     14-1 / 14-2 / 14-3 妮儿与 14-3 老耿（拖被子 PvBlanketDragL/R 与被角握点）、15-1 老耿（跪着按毛巾 CareMedicPress）、15-3 妮儿（蹲着画驴 PvKneelDig）、
//     17-1 老耿（跪着把单被拉上来盖脸 PvKneelPullBlanket）。士兵、日军照旧。
//   · 冬瓜：11-1…13-2 躺在车板上的竹竿担架上（ride 挂在 GengCart 上；单被不上车：布料模拟取的是车底下的地面，被子会落到车下去）；
//     13-3 起摔在车旁、躺在自己那床单被上（BlanketDonggua，名字带「被」不带「担架」= IsBlanketLitter，布料模拟），之后一直在被子上。
//   · 坐标 X 向东、Z 向南、米；yawDeg 0 朝北、+90 朝西、−90 朝东、180 朝南（同 Script_EditorBlockoutConfig）。
//
// 走位：同一个人在相邻关键帧里 id 不变；生成时按路网（墙根小路、石板桥、河滩车道、渡口空场、院门、厢房门、散兵坑、浮桥、南岸路、北门）自动排 path，
// 不让人穿墙、不走进河里（石板桥 / 浮桥桥面除外）；河滩是能自由走动的区域。只在新帧出现的人写 path 起点「走进来」，只在旧帧的人写 intent「走出去」。
//
// 摆位检查（push 进 issues，CLI 打出来）：玩家 / 单位出界；玩家站进实心块、单位站进高块（读 Blockout/FirstLevel1218.scene.json，
// 按两帧 signals 算 gates）；两人重叠（< 0.6 m）、人站在担架上 / 车身里；过渡路线穿高块；路线上 1 m 内高差超过 1.2 m（爬坎的例外）。
// 纯函数式生成：不读时钟、不读 git；只在 node 里读场景文件做检查。
// ===========================================================================

import { BLOCKOUT_SCHEMA, PlanTransition, NormalizeBlockout, YawDegFromTo } from "./Script_EditorBlockoutConfig.mjs";
import { BlockStandSampler } from "./Script_EditorBlockoutPrevizPlan.mjs";
import { PointAlong, PointBeside } from "./Data_EditorBlockoutFirstLevel0105Space.mjs";
import {
  L1218_LEVEL_KEY, L1218_TITLE, L1218_VERSION, L1218_BOUNDS, L1218_PLACES as PL, L1218_LANE as LN, L1218_STONE_BRIDGE as SB, L1218_BEACH, L1218_TROUGH as TG,
  L1218_BANK as BK, L1218_LEVEES as LV, L1218_RIVER as RV, L1218_BRIDGE as BR, L1218_FERRY as FY, L1218_TRENCH as TR, L1218_YARD as Y, L1218_BREACH as BCH,
  L1218_SOUTH as S, L1218_SIGNALS as SIG, L1218_FROM_0610, TrenchPoint,
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
const TK = L1218_BEACH.track;
const BRIDGE_X = BR.x, DECK_Z = SB.z;
/** 墙根小路上按弧长取点（lat 往行进方向左手边偏）。 */
const LP = (d, lat = 0) => { const p = PointBeside(LN.line, d, lat); return Pt(p.x, p.z); };
/** 墙根小路直段（z 551.5）上按 x 取点（lat > 0 = 南）。 */
const LX = (x, lat = 0) => Pt(x, LN.line[1].z + lat);
/** 石板桥桥面上按 x 取点（lat > 0 = 南）。 */
const DP = (x, lat = 0) => Pt(x, DECK_Z + lat);
/** 河滩车道上按弧长取点。 */
const TP = (d, lat = 0) => { const p = PointBeside(TK.line, d, lat); return Pt(p.x, p.z); };
/** 浮桥 / 南岸路上按 z 取点（lat > 0 = 东）。 */
const BP = (z, lat = 0) => Pt(BRIDGE_X + lat, z);
/** 散兵坑里的站位（u 沿坑向）。 */
const TS = (u, v = 0) => { const p = TrenchPoint(u, v); return Pt(p.x, p.z); };

// ---------------------------------------------------------------------------
// 路网：墙根小路 + 石板桥 + 河滩车道 + 渡口空场 + 院门 / 厢房门 + 散兵坑 + 浮桥 + 南岸路 + 北门；河滩 / 空场 / 院子 / 厢房 / 坑是能自由走动的区域，门是出入口。

const DOOR_OUT = 1.3;   // 门两侧各放一个路点，离墙中线这么远
const NET_SNAP_M = 2.6; // 离路中线这么近就算在路上

const NODE = {};
const nodes = [], edges = [], areas = [];
const Node = (name, x, z) => { NODE[name] = nodes.length; nodes.push({ x: R2(x), z: R2(z), name }); return NODE[name]; };
const Edge = (a, b) => edges.push([NODE[a], NODE[b]]);
const Chain = (...names) => { for (let i = 1; i < names.length; i++) Edge(names[i - 1], names[i]); };
const Area = (name, box, ...portals) => areas.push({ name, box, portals: portals.map((n) => NODE[n]) });
const Box = (minX, maxX, minZ, maxZ) => ({ minX, maxX, minZ, maxZ });

// 墙根小路：村南口 → 墙根 → 拐弯 → 桥东头；窄胡同最后一截（村里）
Node("LaneIn", L1218_FROM_0610.backLane.c, 538); Node("VillageS", LN.line[0].x, LN.line[0].z);
LN.line.slice(1, -1).forEach((p, i) => Node(`Lane${i + 1}`, p.x, p.z));
Node("BridgeE", SB.eastHead.x, SB.eastHead.z); Node("BridgeMid", SB.mid.x, SB.mid.z); Node("BridgeW", SB.westHead.x, SB.westHead.z);
Chain("LaneIn", "VillageS", ...LN.line.slice(1, -1).map((_, i) => `Lane${i + 1}`), "BridgeE", "BridgeMid", "BridgeW");
// 河滩车道：桥西头 → 渡口空场 → 浮桥头 → 引道 → 浮桥 → 南岸路 → 北门 → 门内街
TK.line.forEach((p, i) => Node(`Track${i}`, p.x, p.z));
Edge("BridgeW", "Track0");
for (let i = 1; i < TK.line.length; i++) Edge(`Track${i - 1}`, `Track${i}`);
Node("FerryHead", FY.head.x, FY.head.z); Node("RampN", BRIDGE_X, BR.northRampFromZ); Node("BridgeN", BRIDGE_X, BR.northFootZ);
Node("PontoonMid", BRIDGE_X, (BR.northFootZ + BR.southFootZ) / 2); Node("BridgeS", BRIDGE_X, BR.southFootZ); Node("RampS", BRIDGE_X, BR.southRampToZ);
Node("South740", BRIDGE_X, 740); Node("South800", BRIDGE_X, 800); Node("South845", BRIDGE_X, 845);
Node("GateOut", S.gate.x, S.wall.z - S.wall.t / 2 - DOOR_OUT); Node("GateIn", S.gate.x, S.wall.z + S.wall.t / 2 + DOOR_OUT); Node("Street", S.street.x, S.street.toZ - 2);
Chain(`Track${TK.line.length - 1}`, "FerryHead", "RampN", "BridgeN", "PontoonMid", "BridgeS", "RampS", "South740", "South800", "South845", "GateOut", "GateIn", "Street");
// 接收院：东墙大门 → 院里 → 厢房门；院门外墙根排着等的那一线；散兵坑后头
Node("YardGateOut", Y.box.maxX + DOOR_OUT, Y.gate.z); Node("YardGateIn", Y.box.maxX - DOOR_OUT, Y.gate.z);
Node("XiangDoorOut", Y.xiang.door.x, Y.xiang.box.minZ - DOOR_OUT); Node("XiangDoorIn", Y.xiang.door.x, Y.xiang.box.minZ + DOOR_OUT);
Node("QueueHead", Y.queueAlongX, Y.queueFromZ); Node("QueueTail", Y.queueAlongX, Y.queueToZ);
Node("TrenchBack", 6, 616); Node("OfficerPost", FY.officerPost.x, FY.officerPost.z);
Edge("YardGateOut", "YardGateIn"); Edge("XiangDoorOut", "XiangDoorIn"); Chain("YardGateOut", "QueueHead", "QueueTail"); Edge("OfficerPost", "FerryHead");
// 区域：渡口空场、河滩（空场东边到河汊子西坎、桥西头桥台）、散兵坑那一小片、院里、厢房里
Area("Square", Box(FY.square.minX, FY.square.maxX, FY.square.minZ, FY.square.maxZ), "Track2", "Track3", "FerryHead", "YardGateOut", "QueueHead", "TrenchBack", "OfficerPost");
Area("Trench", Box(6, 23, 605, 623), "TrenchBack");
Area("Beach", Box(-10, 28.5, 567, 624), "BridgeW", "Track0", "Track1", "Track2", "TrenchBack");
Area("Yard", Box(Y.box.minX + 1, Y.box.maxX - 0.5, Y.mainHouse.box.maxZ + 0.5, Y.xiang.box.minZ - 0.25), "YardGateIn", "XiangDoorOut");
Area("Xiang", Box(Y.xiang.box.minX + 0.5, Y.xiang.box.maxX - 0.5, Y.xiang.box.minZ + 0.5, Y.xiang.box.maxZ - 0.5), "XiangDoorIn");
// 同一个区域的出入口之间能直走
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
const UNIT_KEY_ORDER = ["id", "side", "kind", "name", "castId", "role", "group", "weapon", "body", "x", "z", "yawDeg", "stance", "aim", "state", "lie", "bearers", "ride", "arc", "speedMps", "path", "intent", "guess"];

/**
 * 一个单位。at = {x,z}；o：
 *   face {x,z} | yaw   朝向；name / castId / kind / role / group / weapon（null = 空手）/ body / stance / aim / down / lie / bearers / arc / speed / guess
 *   from {x,z}|[..]   只在本帧出现：从这里走进来（path 起点）；fromStraight 不走路网
 *   path [..]          显式来路；to / intent 去向（to 沿路网排）；toStraight 直线
 *   straight           上一帧过来走直线（不排路网）
 *   climb              来去要爬坎 / 翻墙（不报高差）；onLitter 躺在哪副担架 / 被子上（不报「站在担架上」）
 *   ride               §3 挂到车上 { on, x, z, y, yawDeg }（x / z 仍写车上那一点的世界坐标，车不在场时的备用）；挂着的人不查重叠 / 车身 / 实心块
 *   tending            跪在哪个伤员身边照料（不报与他重叠）
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
  META.set(u, { straight: !!o.straight, climb: !!o.climb, explicitPath: !!(o.path || o.from), onLitter: o.onLitter || null, tending: o.tending || null });
  return u;
}

const Poi = (id, name, kind, at, radiusM = 2) => ({ id, name, kind, x: R2(at.x), z: R2(at.z), radiusM });
const ArcTo = (from, to, halfDeg, extraM = 6) => ({ halfDeg, rangeM: R1(Dist(from, to) + extraM), yawDeg: Yaw(from, to) });

const POI = {
  laneShell: () => Poi("LaneShell", "身后一发炮落在胡同里", "danger", PL.laneShell, 3),
  villageFire: () => Poi("VillageFire", "庄子里一排排落炮，草顶烧着", "danger", Pt(100, 520), 14),
  bridgeFar: (kind = "landmark") => Poi("StoneBridge", "墙根小路尽头的石板桥", kind, PL.bridgeMid, 4),
  ferry: (kind = "landmark") => Poi("Ferry", "渡口（人流往浮桥上涌）", kind, PL.ferrySquare, 10),
  fieldShell: () => Poi("FieldShell", "一发打偏落在小路南边麦地，土泼一车", "danger", PL.fieldShell, 3),
  gengSmoke: () => Poi("GengSmoke", "老耿家腾起黑烟（按「看」转过去）", "landmark", PL.gengSmoke, 6),
  helmets: () => Poi("Helmets", "村南口冒出两三顶钢盔", "danger", PL.helmetsAt, 3),
  yardGate: (kind = "poi") => Poi("YardGate", "接收院门口（墙根下躺一排伤兵）", kind, PL.yardGate, 2.5),
  breachMg: (kind = "danger") => Poi("BreachMg", "对岸墙角那挺机枪（豁子上）", kind, BCH.mgPost, 4),
  flare: () => Poi("Flare", "信号弹落在渡口上空", "danger", PL.flareAt, 4),
  planesEast: () => Poi("PlanesEast", "东边顺着河传来嗡嗡声", "danger", PL.planesFrom, 12),
  planesOver: () => Poi("PlanesOver", "两架飞机贴着河面从桥头一路扫到人堆", "danger", Pt(4, 626), 14),
  planesWest: () => Poi("PlanesWest", "飞机拉起来往西兜", "danger", Pt(-110, 640), 12),
  planesDive: () => Poi("PlanesDive", "俯冲声压到头顶", "danger", Pt(-40, 632), 12),
  planesGone: () => Poi("PlanesGone", "飞机拉起来往东飞走", "landmark", Pt(110, 640), 10),
  bullets: () => Poi("BulletLine", "一串弹着点顺地皮追过来", "danger", Pt(7.6, 620.2), 2),
  trough: (kind = "objective") => Poi("Trough", "河堤底下", kind, PL.troughAt, 3),
  breachBlast: () => Poi("BreachBlast", "庄子西南角「轰」一声，机枪哑了", "landmark", BCH.mgPost, 4),
  xiangDoor: (kind = "objective") => Poi("XiangDoor", "厢房门（有门槛）", kind, PL.xiangDoor, 1.5),
  dongguaInside: () => Poi("DongguaInside", "厢房里靠墙的空地", "objective", Y.dongguaInside, 1.5),
  threshold: () => Poi("Threshold", "门槛", "poi", Y.thresholdSeat, 1),
  bridge: (kind = "landmark") => Poi("Bridge", "浮桥（一回只过一副）", kind, BP((BR.northFootZ + BR.southFootZ) / 2), 6),
  railBlast: () => Poi("RailBlast", "远处铁路桥炸了（东边）", "danger", PL.railBlast, 8),
  trench: (kind = "objective") => Poi("Trench", "散兵坑（朝东北，对着石板桥和河滩）", kind, PL.trench, 4),
  ijaMg18: (kind = "danger") => Poi("IjaMg", "石板桥头的鬼子机枪", kind, PL.ijaMg18, 4),
  lastGroup: () => Poi("LastGroup", "最后一拨人（土坎后头）", "poi", PL.lastGroupCover, 3),
  southFoot: (kind = "objective") => Poi("SouthFoot", "南岸", kind, PL.bridgeSouthFoot, 3),
  lamp: () => Poi("YardLamp", "北岸院子里马灯还亮着", "landmark", Pt(Y.gateLamp.x, Y.gateLamp.z), 2),
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
  FerrySoldier: { name: "渡口的兵（土台子上喊话）", role: "ferry" },
  FerryGuard1: { name: "渡口的兵", role: "ferry" }, FerryGuard2: { role: "ferry" },
  BridgeOfficer: { name: "桥头军官", kind: "officer", role: "bridgeOfficer", castId: "frontOfficer" },
  Sapper1: { name: "工兵", role: "sapper" }, Sapper2: { role: "sapper" },
  Guide: { name: "带路的兵", role: "guide" },
  Bearer1: { name: "担架员", role: "bearer", weapon: null }, Bearer2: { role: "bearer", weapon: null },
  Wounded1: { name: "肚子挨了枪的", role: "wounded" }, Wounded2: { role: "wounded" },
};
const N = (id, at, o = {}) => U(id, "nra", at, { ...(NRA[id] || {}), ...o });
const CIV = {
  Geng: { name: "老耿", kind: "civilian", role: "carter" },
  Nier: { name: "妮儿", kind: "child" },
  GengCart: { name: "驴车", kind: "cart" },
  Heizi: { name: "黑子", kind: "animal" },
  WaterMan: { name: "舀水的", kind: "civilian" },
};
/** 百姓：一律程序化身体（body procedural）；要放片段的那几帧显式写 body:"rig"。车 / 牲口没有身体字段。 */
const C = (id, at, o = {}) => {
  const base = CIV[id] || {}, kind = base.kind || o.kind || "civilian";
  const body = kind === "civilian" || kind === "child" ? { body: o.body || "procedural" } : {};
  return U(id, "civ", at, { ...base, kind, ...body, ...o });
};
const IJA = {
  BreachMg: { name: "豁子上的机枪", role: "machineGun", weapon: "Type11", group: "breach" },
  BreachLoader: { name: "副射手", role: "loader", group: "breach" },
  IjaMg: { name: "桥头机枪", role: "machineGun", weapon: "Type11", group: "mg" },
  IjaMgLoader: { name: "副射手", role: "loader", group: "mg" },
  IjaTank: { name: "战车", kind: "tank", group: "levee" },
};
const J = (id, at, o = {}) => U(id, "ija", at, { ...(IJA[id] || {}), ...o });

// ---------------------------------------------------------------------------
// 固定站位与成组的人

const CART_LEN = 2.4;
const MG = Pt(BCH.mgPost.x, BCH.mgPost.z), MG_LOADER = Pt(BCH.loaderPost.x, BCH.loaderPost.z);
const MG_ARC = ArcTo(MG, PL.ferrySquare, 22, 10);
const MG18 = Pt(PL.ijaMg18.x, PL.ijaMg18.z), MG18_LOADER = Off(MG18, 1.4, 0.6);
const MG18_ARC = ArcTo(MG18, PL.ferrySquare, 18, 10);
const SQUARE_C = Pt(PL.ferrySquare.x, PL.ferrySquare.z);
const PLATFORM = Pt(FY.soldierPost.x, FY.soldierPost.z);
const OFFICER = Pt(FY.officerPost.x, FY.officerPost.z);
const TROUGH = Pt(PL.troughAt.x, PL.troughAt.z);
const GATE_GUARD = Pt(Y.gateGuardPost.x, Y.gateGuardPost.z);

/**
 * 车上的东西（§3 的 ride 挂到 GengCart 上）：三副竹竿担架横搁在车板上——担架 2.1 m 长、车板 1.5 m 宽，只能横着搁，
 * 三副 0.7 m 宽正好铺满 2.4 m 长的车板；冬瓜那副靠车尾。妮儿坐车尾沿、背对车头、两条腿悬在外头。
 * 车本地坐标 +x 右、−z 前（车辕）；车板顶 1.025 m（Script_EditorBlockoutPuppets BLOCKOUT_CART_SEATS）：担架布底贴车板 y 1.075、
 * 躺在布上的人 1.125；坐车尾的小孩 y = 1.025 − 0.90 × 0.62 = 0.467（VilSitEdge 坐高 0.9）。单位的 x / z 仍写车上那一点的世界坐标（备用）。
 */
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
/** 冬瓜那副担架横搁在车板上靠车尾，冬瓜躺在上面（都挂在 GengCart 上）。 */
const DongguaOnCart = (cart, cartYaw) => {
  const slot = CART_LITTER_SLOTS[0], local = { x: 0, z: slot.z }, at = CartWorld(cart, cartYaw, local), yaw = R1(WrapDeg(cartYaw + slot.yaw));
  return [
    N("LitterDonggua", at, { kind: "litter", name: "冬瓜的担架", bearers: 0, yaw, group: "cart", speed: 1.2, ride: CartRide(local, CART_RIDE_Y.litter, slot.yaw) }),
    N("Donggua", at, { down: true, lie: "along", onLitter: "LitterDonggua", speed: 1.2, yaw, ride: CartRide(local, CART_RIDE_Y.lying, slot.yaw) }),
  ];
};
/** 车板上另外两副担架与上面肚子挨了枪的两个。 */
const CartLitters = (cart, cartYaw) => CART_LITTER_SLOTS.slice(1).flatMap((slot, i) => {
  const local = { x: 0, z: slot.z }, at = CartWorld(cart, cartYaw, local), yaw = R1(WrapDeg(cartYaw + slot.yaw));
  return [
    N(`CartLitter${i + 1}`, at, { kind: "litter", bearers: 0, yaw, group: "cart", speed: 1.4, ride: CartRide(local, CART_RIDE_Y.litter, slot.yaw) }),
    N(`Wounded${i + 1}`, at, { group: "cart", down: true, lie: "along", onLitter: `CartLitter${i + 1}`, speed: 1.4, yaw, ride: CartRide(local, CART_RIDE_Y.lying, slot.yaw) }),
  ];
});
/** 妮儿坐在车尾沿上（程序化身体）。 */
const NierOnTail = (cart, cartYaw) => C("Nier", CartWorld(cart, cartYaw, { x: 0, z: CART_TAIL_LOCAL_Z }), { yaw: R1(WrapDeg(cartYaw + 180)), ride: { ...NIER_TAIL_RIDE } });
/** 冬瓜躺在自己那床单被上（13-3 起）：被子是 litter 单位（名字带「被」不带「担架」= IsBlanketLitter，布料模拟），冬瓜顺着被子躺、头朝被子朝向的前方（拽的那头）。 */
const DongguaOnBlanket = (at, { yaw = 90, extra = {} } = {}) => [
  N("BlanketDonggua", at, { kind: "litter", name: "冬瓜的单被", bearers: 0, yaw, group: "convoy", speed: 1.0, ...extra }),
  N("Donggua", at, { down: true, lie: "along", onLitter: "BlanketDonggua", speed: 1.0, yaw, ...extra }),
];

// 河滩上往渡口涌的人流（12-3 起）：挑铺盖、背老人的百姓（程序化身体）、别处撤下来的兵和担架。按一条「涌向浮桥头」的线排。
const CROWD_LINE = [Pt(12, 596), Pt(2, 612), Pt(-6, 624), Pt(-8, 634)];
const CROWD_SLOTS = Array.from({ length: 26 }, (_, i) => {
  const d = 2.0 + 1.75 * i, side = (i % 3) - 1;
  const kind = i % 6 === 2 ? "litter" : i % 6 === 4 ? "walker" : i % 9 === 8 ? "soldier" : "civ";
  return { i, d, side, kind };
});
/** mode：walk（往桥上挤）/ scatter（13-1 机枪扫过来，人堆炸开：百姓倒几个、其余趴 / 往桥上冲）/ prone（13-2 飞机来，全趴）/ queue（18 排着过桥）。 */
function Crowd(mode = "walk", { exclude = new Set() } = {}) {
  const out = [];
  let civs = 0, litters = 0, walkers = 0, soldiers = 0;
  for (const s of CROWD_SLOTS) {
    const p0 = PointBeside(CROWD_LINE, s.d, s.side * 1.6), p = Pt(p0.x, p0.z);
    const heading = R1(p0.headingYawDeg);
    if (s.kind === "litter") {
      litters++;
      const id = `CLitter${String(litters).padStart(2, "0")}`;
      if (exclude.has(id)) continue;
      out.push(N(id, p, { kind: "litter", name: litters === 1 ? "别处撤下来的担架" : undefined, bearers: mode === "prone" ? 0 : 2, yaw: heading, group: "crowd", straight: true, speed: 1.2 }));
    } else if (s.kind === "walker") {
      walkers++;
      const id = `CWalker${String(walkers).padStart(2, "0")}`;
      if (exclude.has(id)) continue;
      out.push(N(id, p, { role: "walkingWounded", group: "crowd", yaw: heading, stance: mode === "prone" || (mode === "scatter" && walkers % 2) ? "prone" : "stand", straight: true, speed: 1.0 }));
    } else if (s.kind === "soldier") {
      soldiers++;
      const id = `CSoldier${String(soldiers).padStart(2, "0")}`;
      if (exclude.has(id)) continue;
      out.push(N(id, p, { role: "straggler", group: "crowd", yaw: heading, stance: mode === "prone" || mode === "scatter" ? "prone" : "stand", straight: true, speed: 1.6 }));
    } else {
      civs++;
      const id = `CCiv${String(civs).padStart(2, "0")}`;
      if (exclude.has(id)) continue;
      const role = civs % 4 === 1 ? "refugeeWithBundle" : civs % 4 === 2 ? "refugeeCarryingElder" : civs % 4 === 3 ? "refugeeWithChild" : "refugee";
      const hit = mode === "scatter" && civs % 5 === 0;        // 人堆炸开：每五个倒一个
      const dead = (mode === "prone" || mode === "queue") && civs % 5 === 0;
      const down = hit || dead;
      const stance = mode === "prone" ? "prone" : mode === "scatter" && civs % 2 ? "prone" : "stand";   // 程序化身体趴不趴得下运行时看（蹲不下是定论）
      out.push(C(id, down ? Off(p, 0.3, 0.2) : p, { role, group: "crowd", yaw: heading, straight: true, speed: 1.6, ...(down ? { down: true } : { stance }) }));
    }
  }
  return out;
}
/** 渡口的兵：土台子上喊话的那个 + 两个在浮桥头拦人。 */
const FerryMen = ({ aim = false } = {}) => [
  N("FerrySoldier", PLATFORM, { face: Pt(4, 612), ...(aim ? { aim: true } : {}) }),
  N("FerryGuard1", Pt(-11.4, 633.8), { face: Pt(-4, 622), aim }),
  N("FerryGuard2", Pt(-3.6, 634.2), { face: Pt(-8, 622), aim }),
];
/** 接收院门口墙根下躺的一排伤兵 + 守门的兵（12-3 起）。 */
const GATE_ROW_Z = [617.0, 619.4, 621.8, 624.2, 626.6, 629.0];
const GateRow = () => GATE_ROW_Z.map((z, i) => N(`GateWounded${i + 1}`, Pt(Y.queueAlongX, z), { role: "wounded", group: "gateRow", down: true, yaw: 90, guess: true }));
// 接收院里：军医、百姓、麦秸上的伤员
const DOCTOR = Pt(Y.doctorPost.x, Y.doctorPost.z);
const WOUNDED_SPOTS = Object.freeze([
  Pt(-49.6, 606.4), Pt(-46.2, 607.0), Pt(-42.6, 606.3), Pt(-30.4, 607.2), Pt(-27.6, 610.6),
  Pt(-49.8, 611.2), Pt(-46.6, 612.0), Pt(-49.4, 616.2), Pt(-46.0, 619.6), Pt(-28.0, 619.4),
]);
/** 救护片段的站位（Animation/CollectionCare 清单 stages.press：CareMedicPress 跪在 CareLieTreated 的右边）。 */
export const PRESS_STAGE = Object.freeze({ x: 0.42, z: 0.36, yawDeg: 90 });
export function PressPose(patient, patientYaw) {
  const r = patientYaw * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
  return { x: R2(patient.x + PRESS_STAGE.x * c + PRESS_STAGE.z * s), z: R2(patient.z - PRESS_STAGE.x * s + PRESS_STAGE.z * c), yawDeg: R1(WrapDeg(patientYaw + PRESS_STAGE.yawDeg)) };
}
const DOCTOR_PATIENT_I = 8;
export const DOCTOR_PRESS = Object.freeze(PressPose(WOUNDED_SPOTS[DOCTOR_PATIENT_I], (DOCTOR_PATIENT_I % 4) * 45));
const DOCTOR_PATIENT_ID = `YardWounded${String(DOCTOR_PATIENT_I + 1).padStart(2, "0")}`;
const YardPeople = ({ doctorAt = DOCTOR_PRESS, doctorFace = null, doctorStance = "crouch", boardTo = null } = {}) => [
  N("Doctor", doctorAt, { ...(doctorFace ? { face: doctorFace } : { yaw: DOCTOR_PRESS.yawDeg }), stance: doctorStance, tending: DOCTOR_PATIENT_ID }),
  C("Civ1", Pt(Y.kitchen.box.maxX + 1.2, Y.kitchen.box.minZ + 6.2), { name: "烧水的", face: Pt(Y.kitchen.box.maxX, Y.kitchen.box.minZ + 6.2) }),
  C("Civ2", Pt(-30.6, 614.4), { name: "抱门板的", yaw: -90, ...(boardTo ? { to: boardTo } : {}) }),
  C("Civ3", Pt(-48.4, 622.6), { yaw: 0 }),
  ...WOUNDED_SPOTS.map((p, i) => N(`YardWounded${String(i + 1).padStart(2, "0")}`, p, { role: "wounded", group: "yard", down: true, yaw: (i % 4) * 45, guess: true })),
];
// 18-2 起接收院往南岸撤：活着的一副一副抬出院门上桥，军医跟着最后一副走；屋里只剩盖着脸的几个（冬瓜在厢房里，不摆）。
const YARD_DEAD_I = Object.freeze([1, 5, 8]);
const YardDead = () => YARD_DEAD_I.map((i, k) => N(`YardDead${k + 1}`, WOUNDED_SPOTS[i], { name: "盖着脸的", group: "yard", weapon: null, down: true, yaw: (i % 4) * 45, guess: true }));
const GATE_OUT = Pt(PL.yardGate.x + 4.2, PL.yardGate.z + 0.4);
const YardEvac = () => [
  N("YardLitter1", BP(652.5), { kind: "litter", name: "院里抬出来的", group: "yardEvac", yaw: 180, to: BP(740), speed: 1.2 }),
  N("YardLitter2", Pt(-10.0, 628.0), { kind: "litter", name: "院里抬出来的", group: "yardEvac", face: BP(646), to: BP(740), speed: 1.2 }),
  N("YardLitter3", GATE_OUT, { kind: "litter", name: "院里抬出来的", group: "yardEvac", face: SQUARE_C, to: BP(740), speed: 1.2 }),
  N("Doctor", Pt(PL.yardGate.x + 0.8, PL.yardGate.z + 0.6), { face: SQUARE_C, to: BP(740), speed: 1.2 }),
  ...YardDead(),
];

// 散兵坑里的位置（沿坑向 u）：北段（西北那段）何有田、刘文财、Squad1 / 2、渡口的兵；南段班长、幺娃、渡口的兵
const TRENCH_SLOTS = Object.freeze({
  HeYoutian: TS(TR.slots[0]), LiuWencai: TS(TR.slots[1]), Squad1: TS(TR.slots[2]), Squad2: TS(TR.slots[3]), FerryGuard1: TS(TR.slots[4]),
  Luo: TS(TR.slots[5]), Yaowa: TS(TR.slots[6]), FerryGuard2: TS(TR.slots[7]), FerrySoldier: TS(TR.slots[8]),
});
const PLAYER_SLOT = TS(TR.slots[9]);
const NE_FAR = Pt(PL.bridgeWest.x, PL.bridgeWest.z);   // 坑里的人朝东北看的方向（石板桥西头）

// 豁子上的鬼子（13-1 起）：机枪 + 副射手趴在瓦砾堆上 / 院里，几个步枪兵在院墙后、菜园篱笆后趴开
const BreachIja = ({ mgDown = false, exclude = new Set() } = {}) => [
  J("BreachMg", MG, { stance: "prone", aim: !mgDown, arc: mgDown ? undefined : MG_ARC, yaw: MG_ARC.yawDeg, ...(mgDown ? { down: true } : {}) }),
  J("BreachLoader", MG_LOADER, { stance: "prone", face: PL.ferrySquare, ...(mgDown ? { down: true } : {}) }),
  ...BCH.riflePosts.map((p, i) => J(`BreachRifle${i + 1}`, p, { role: "rifleman", group: "breach", stance: "prone", aim: true, face: i % 2 ? PL.bridgeWest : PL.ferrySquare })).filter((u) => !exclude.has(u.id)),
];
/** 班长他们在石板桥西头坎沿趴着守桥（12-2 起）：撬开弹药箱、打回村南口冒出来的钢盔。 */
const BRIDGE_GUARD = Object.freeze({ Luo: Pt(25.6, 564.2), Yaowa: Pt(25.0, 567.8), HeYoutian: Pt(24.2, 562.0), Squad1: Pt(24.6, 570.4), Squad2: Pt(23.4, 565.6) });
const BridgeGuards = ({ face = PL.helmetsAt, aim = true, exclude = new Set(), extra = {} } = {}) =>
  Object.entries(BRIDGE_GUARD).filter(([id]) => !exclude.has(id)).map(([id, p]) => N(id, p, { stance: "prone", aim, face, guess: id.startsWith("Squad"), ...extra }));
// 12-3 村南口冒出的钢盔
const Helmets = () => [Pt(116.2, 548.4), Pt(119.0, 549.2), Pt(113.8, 549.6)].map((p, i) => J(`Helmet${i + 1}`, p, { role: "rifleman", group: "lane", stance: "crouch", aim: true, face: PL.bridgeWest, straight: true }));

// ---------------------------------------------------------------------------
// 关键帧

function Keyframes() {
  const K = [];
  const Add = (kf) => K.push(kf);

  // ======================= 11 冒着炮出村南口 =======================
  const s11 = { stage: 11, stageTitle: "出村南口" };
  // 11-1：顺子最后一个出胡同口，身后一发炮落在胡同里；车停在村南口外，担架员往车板上搁人；班长喊守桥
  const cart111 = LX(113, 0), heizi111 = LX(109.6, 0);   // 车停在村南口外的小路上，朝西
  const p111 = Pt(117, 547.4);
  Add({
    id: "11-1", ...s11, name: "出胡同口",
    player: { x: p111.x, z: p111.z, yawDeg: 100, pitchDeg: -2, stance: "stand" },
    what: "全班冒着炮冲出村南口；车停在口外，担架员把冬瓜横搁上车板。",
    next: { text: "跟着班长往西守桥", x: 62, z: 551.5, radiusM: 4 },
    how: ["顺子最后一个出胡同口，身后一发炮落在胡同里；庄子里一排排落炮，草顶烧着", "老耿的车停在村南口外，黑子一炸一跳，老耿拽着笼头", "往西看：顺着庄子南墙根一条小路，尽头是河汊子上的石板桥；桥那头的河滩上，人流往北沙河边的渡口涌", "班长边跑边喊：「炮一停，狗日的就要钻出来！子弹卸下来，老子们守桥！车拉伤员，往渡口送！」"],
    notes: "村南口 (117,545) 是 0610 第六版窄胡同出村的地方。车停在口外的墙根小路上朝西；冬瓜那副和另外两副担架横搁在车板上（ride 挂在 GengCart 上，车板顶 1.025 m），"
      + "冬瓜靠车尾；担架员两个在车尾（刚搁上去）。幺娃、何有田各扛一箱子弹（没有扛箱子的姿态，站位 + 说明字）。百姓一律程序化身体（body procedural）。",
    signals: [],
    units: [
      C("GengCart", cart111, { yaw: 90 }),
      C("Heizi", heizi111, { yaw: 90 }),
      C("Geng", Off(heizi111, 0.2, -1.1), { face: heizi111 }),
      ...DongguaOnCart(cart111, 90),
      ...CartLitters(cart111, 90),
      N("Bearer1", Off(cart111, 1.9, -0.9), { face: cart111 }),
      N("Bearer2", Off(cart111, 1.9, 0.9), { face: cart111 }),
      N("Luo", LX(104, -0.6), { yaw: 90, speed: 3.0, to: LX(70, -0.6) }),
      N("Yaowa", LX(107.6, 0.8), { yaw: 90, role: "ammoCarrier", speed: 3.0, to: LX(74, 0.8) }),
      N("HeYoutian", LX(106.2, -1.2), { yaw: 90, role: "ammoCarrier", speed: 3.0, to: LX(72, -1.2) }),
      N("Squad1", LX(110.4, 0.6), { yaw: 90, speed: 3.0, guess: true, to: LX(78, 0.6) }),
      N("Squad2", LX(111.8, -1.0), { yaw: 90, speed: 3.0, guess: true, to: LX(80, -1.0) }),
      N("LiuWencai", Pt(118.4, 548.8), { face: p111 }),
      C("Nier", Pt(116.0, 550.2), { face: cart111 }),
    ],
    pois: [POI.laneShell(), POI.villageFire(), POI.bridgeFar(), POI.ferry()],
  });

  // 11-2：车动了：妮儿坐车尾沿；顺子「我跟车！」班长回头：「……文财，你也去！」；班长带人顺南墙根往西先跑
  const cart112 = LX(110.5, 0), heizi112 = LX(107.1, 0);
  const p112 = Pt(113.6, 553.4);
  Add({
    id: "11-2", ...s11, name: "我跟车",
    player: { x: p112.x, z: p112.z, yawDeg: Yaw(p112, LX(96, -0.6)), pitchDeg: -2, stance: "stand" },
    what: "车动了，妮儿坐车尾沿；顺子：我跟车！班长：……文财，你也去！",
    next: { text: "跟车到渡口", x: PL.ferrySquare.x, z: PL.ferrySquare.z, radiusM: 6 },
    how: ["担架员把冬瓜和另外两个肚子挨了枪的横搁上车板（冬瓜靠车尾），车就动了；妮儿坐车尾沿", "幺娃、何有田各扛一箱子弹跑；班长带人顺南墙根往西先跑", "顺子：「我跟车！」班长回头看他一眼：「……文财，你也去！」", "任务字：跟车到渡口"],
    notes: "妮儿坐车尾沿（ride：z +1.2、y 0.467、背对车头，程序化身体）。班长一行在小路西段跑（intent 指向桥西头坎沿）。担架员留在村南口（往回跑接下一副）。",
    signals: [],
    units: [
      C("GengCart", cart112, { yaw: 90, speed: 1.4 }),
      C("Heizi", heizi112, { yaw: 90, speed: 1.4 }),
      C("Geng", Off(heizi112, 0.2, -1.1), { yaw: 90, speed: 1.4 }),
      ...DongguaOnCart(cart112, 90),
      ...CartLitters(cart112, 90),
      NierOnTail(cart112, 90),
      N("Bearer1", Pt(118.6, 550.6), { face: cart112, to: Pt(117, 540) }),
      N("Bearer2", Pt(119.8, 552.0), { face: cart112, to: Pt(117, 541.5) }),
      N("Luo", LX(92, -0.6), { face: p112, speed: 3.0, to: BRIDGE_GUARD.Luo }),
      N("Yaowa", LX(97.6, 0.8), { yaw: 90, role: "ammoCarrier", speed: 3.0, to: BRIDGE_GUARD.Yaowa }),
      N("HeYoutian", LX(95.4, -1.2), { yaw: 90, role: "ammoCarrier", speed: 3.0, to: BRIDGE_GUARD.HeYoutian }),
      N("Squad1", LX(100.2, 0.6), { yaw: 90, speed: 3.0, guess: true, to: BRIDGE_GUARD.Squad1 }),
      N("Squad2", LX(101.8, -1.0), { yaw: 90, speed: 3.0, guess: true, to: BRIDGE_GUARD.Squad2 }),
      N("LiuWencai", Pt(115.2, 553.6), { face: p112 }),
    ],
    pois: [POI.villageFire(), POI.bridgeFar(), POI.ferry("objective")],
  });

  // ======================= 12 过石板桥，往渡口赶 =======================
  const s12 = { stage: 12, stageTitle: "过桥赶渡口" };
  // 12-1：墙根：车顺墙根小路往西，顺子在车尾扶车帮，刘文财在车另一边；墙那头落炮，一发打偏落在麦地；冬瓜：到了没得？
  const cart121 = LX(86, 0), heizi121 = LX(82.6, 0);
  const p121 = Off(cart121, 1.9, 1.0);
  Add({
    id: "12-1", ...s12, name: "墙根",
    player: { x: p121.x, z: p121.z, yawDeg: 90, pitchDeg: -4, stance: "stand" },
    what: "车顺墙根小路往西；一发炮打偏落在小路南边麦地，土泼一车。冬瓜：到了没得？",
    next: { text: "跟车到渡口", x: PL.ferrySquare.x, z: PL.ferrySquare.z, radiusM: 6 },
    how: ["老耿一手笼头一手鞭子；顺子在车尾扶车帮，刘文财在车另一边", "墙那头落炮，一发打偏落在小路南边麦地，土泼一车", "冬瓜睁眼：「……到了没得？」顺子：「快了！」", "任务字：跟车到渡口"],
    notes: "小路中线 z 551.5、净宽 3 m（贴庄子南墙 z 545 外）。车朝西（yaw 90）。班长他们已在桥西头坎沿趴下撬弹药箱。",
    signals: [],
    units: [
      C("GengCart", cart121, { yaw: 90, speed: 1.4 }),
      C("Heizi", heizi121, { yaw: 90, speed: 1.4 }),
      C("Geng", Off(heizi121, 0.2, -1.1), { yaw: 90, speed: 1.4 }),
      ...DongguaOnCart(cart121, 90),
      ...CartLitters(cart121, 90),
      NierOnTail(cart121, 90),
      N("LiuWencai", Off(cart121, 1.9, -1.1), { yaw: 90, speed: 1.4 }),
      ...BridgeGuards({ aim: false, face: Pt(24.5, 566) }),
    ],
    pois: [POI.fieldShell(), POI.villageFire(), POI.bridgeFar("objective"), POI.ferry()],
  });

  // 12-2：石板桥：黑子到桥头低头看水不走，老耿抽它、车往后溜；妮儿溜下车捧黑子的脸、攥笼头上桥
  const cart122 = Pt(43.6, 565.4), heizi122 = DP(40.2, 0);
  const nier122 = DP(38.6, -0.4);
  const p122 = Pt(46.0, 566.9);
  Add({
    id: "12-2", ...s12, name: "石板桥",
    player: { x: p122.x, z: p122.z, yawDeg: Yaw(p122, nier122), pitchDeg: -6, stance: "stand" },
    what: "黑子到桥头低头看水不走，车往后溜；妮儿溜下车捧黑子的脸，攥笼头往桥上走。",
    next: { text: "跟车过桥到河滩", x: 20, z: 572, radiusM: 4 },
    how: ["河汊子贴庄子西墙往南流，坎比人高，沟底一汪浑水齐腰深；桥是几块条石搭两个石墩，刚够一辆车，没栏杆", "班长他们已趴在桥西头坎沿，撬开弹药箱；身后又一排炮更近", "黑子四条腿一撑不走，老耿抽它，它往后坐、车往后溜：「驾！驾！你个畜生——走啊！」", "妮儿两手捧它的脸、脑门贴上去，攥笼头往桥上走，黑子跟她上了桥。从这起妮儿牵着黑子走最前头（班长不对顺子说话）"],
    notes: "桥面 x 28…41、z 564.7…567.3、顶 0.35 与两岸齐平（桥台）；桥下垫了石滩、上头一汪水（演员只能站 ≤ 1 m 的块顶）。妮儿从车尾下来走到驴头前（程序化身体，捧脸那一下预演里做）。",
    signals: [],
    units: [
      C("GengCart", cart122, { yaw: 90 }),
      C("Heizi", heizi122, { yaw: 90 }),
      C("Geng", Pt(41.2, 567.9), { face: heizi122 }),
      ...DongguaOnCart(cart122, 90),
      ...CartLitters(cart122, 90),
      C("Nier", nier122, { face: heizi122 }),
      N("LiuWencai", Pt(45.8, 564.0), { face: cart122 }),
      ...BridgeGuards({ aim: false, face: Pt(26, 565) }),
    ],
    pois: [POI.bridgeFar("objective"), Poi("HeiziBalks", "黑子在桥头不走", "poi", heizi122, 1.5), POI.villageFire()],
  });

  // 12-3：炮停：车下桥刚上河滩，静得出奇；「轰」「叮」——「看」的按键（老耿家腾起黑烟）；村南口冒出钢盔，班长他们一齐开火；河滩上人流往渡口涌
  const cart123 = TP(5.5), heizi123 = TP(9.0), nier123 = TP(11.0, -0.4);
  const p123 = TP(2.8, 1.6);
  Add({
    id: "12-3", ...s12, name: "炮停",
    player: { x: p123.x, z: p123.z, yawDeg: Yaw(p123, PL.gengSmoke), pitchDeg: 4, stance: "stand" },
    what: "炮停了，静得出奇；庄子里「轰」一声——老耿家腾起黑烟。村南口冒出钢盔，班长他们一齐开火。",
    next: { text: "跟车挤到接收院门口", x: PL.yardGate.x + 3, z: PL.yardGate.z, radiusM: 4 },
    how: ["车下桥刚上河滩，身后炮停，静得出奇。两三秒后庄子里「轰」一声，跟着「叮」一声，屏幕出「看」的按键：按了视角转去看老耿家腾起黑烟，不按三秒消失", "刘文财：「狗日的进了老耿家了！」顺子：「莫看了！走！」老耿回头看一眼烟，扬鞭", "墙根小路尽头、村南口冒出两三顶钢盔，桥西头班长他们一齐开火，钢盔缩回去", "河滩：麦苗只有脚面高，一眼望到河边。渡口前人一股股往浮桥上挤；桥窄，一回只过一副担架。渡口的兵站土台子上喊：「伤兵先上桥！老百姓靠边！」"],
    notes: "「看」的按键是美末式提示（POI GengSmoke 标在老耿家院子）。河滩上往渡口涌的人流 26 个：挑铺盖、背老人、抱孩子的百姓（程序化身体）、别处撤下来的兵和担架；"
      + "接收院门口墙根下躺一排伤兵、守门的兵；渡口的兵一个站土台子上喊，两个在浮桥头拦人。不挂红十字。",
    signals: [],
    units: [
      C("Nier", nier123, { yaw: Yaw(nier123, TP(14)), speed: 1.2 }),
      C("Heizi", heizi123, { yaw: Yaw(heizi123, TP(12.5)), speed: 1.2 }),
      C("GengCart", cart123, { yaw: Yaw(cart123, TP(9)), speed: 1.2 }),
      C("Geng", TP(7.2, -1.4), { face: PL.gengSmoke }),
      ...DongguaOnCart(cart123, Yaw(cart123, TP(9))),
      ...CartLitters(cart123, Yaw(cart123, TP(9))),
      N("LiuWencai", TP(4.2, -1.6), { face: PL.gengSmoke }),
      ...BridgeGuards(),
      ...Helmets(),
      ...Crowd("walk"),
      ...FerryMen(),
      N("GateGuard", GATE_GUARD, { face: Pt(-14, 616) }),
      ...GateRow(),
      ...YardPeople({ boardTo: Pt(-26.6, 615.4) }),
    ],
    pois: [POI.gengSmoke(), POI.helmets(), POI.ferry("objective"), POI.yardGate()],
  });

  // ======================= 13 机枪压渡口，飞机来 =======================
  const s13 = { stage: 13, stageTitle: "机枪压渡口" };
  const cart13 = Pt(PL.cartRaidAt.x, PL.cartRaidAt.z), cartYaw13 = 180 + 28;   // 车挤在人堆边上、车头朝西南
  const heizi13 = CartWorld(cart13, cartYaw13, { x: 0, z: -3.3 });
  // 13-1：机枪压渡口：对岸豁子上架起机枪顺人流扫过来，人堆炸开；车后头是河滩上唯一的掩体；刘文财扑到车后：对岸！墙角那挺机枪！
  const p131 = CartWorld(cart13, cartYaw13, { x: -0.9, z: 2.1 });
  const liu131 = CartWorld(cart13, cartYaw13, { x: 1.0, z: 2.2 });
  Add({
    id: "13-1", ...s13, name: "机枪压渡口",
    player: { x: p131.x, z: p131.z, yawDeg: Yaw(p131, MG), pitchDeg: 2, stance: "crouch" },
    what: "对岸墙豁子上架起机枪顺人流扫过来，人堆炸开；刘文财扑到车后：对岸！墙角那挺机枪！",
    next: { text: "打豁子上那挺机枪", x: MG.x, z: MG.z, radiusM: 4 },
    how: ["桥头枪声停一阵，鬼子没再从胡同口硬冲；庄子西南角那个院子挨过炮的院墙塌个豁子，几个鬼子把一挺机枪架上豁子，还有几个在院墙后、菜园篱笆后趴开", "隔着河汊子，石板桥和整片河滩都在眼皮底下：背包袱的女人、抱孩子的、盖白布的担架。机枪顺人流扫过来，人堆炸开，往桥上冲、往河堤底下趴，有人跳进河里", "车后头是河滩上唯一的掩体。刘文财扑到车后：「对岸！墙角那挺机枪！」", "玩家真打：趴车后隔河对射。步枪兵打一个倒一个；机枪手打得倒，倒了副射手爬上来接着打（能换两三个）；压机枪照 08：一打它就缩，一停它就扫人堆。刘文财、渡口那几个兵一起打，桥头班长他们也打豁子"],
    notes: `机枪趴在豁子里 0.9 m 高的瓦砾堆上（块顶站得上），眼高 1.7，到石板桥西头约 35 m、到渡口人堆约 100 m（场景生成器实测），看得见桥西头和整片河滩。`
      + "人堆炸开：百姓每五个倒一个（程序化身体 state down）、兵趴下。车挤在渡口空场东沿人堆边上（cartRaidAt），车头朝西南；玩家和刘文财蹲在车后（车东北边）。",
    signals: [],
    units: [
      C("GengCart", cart13, { yaw: cartYaw13 }),
      C("Heizi", heizi13, { yaw: cartYaw13 }),
      C("Geng", CartWorld(cart13, cartYaw13, { x: 0.3, z: -4.4 }), { face: heizi13 }),
      ...DongguaOnCart(cart13, cartYaw13),
      ...CartLitters(cart13, cartYaw13),
      C("Nier", CartWorld(cart13, cartYaw13, { x: -1.0, z: -3.6 }), { face: heizi13 }),
      N("LiuWencai", liu131, { stance: "crouch", aim: true, face: MG }),
      ...BreachIja(),
      ...BridgeGuards({ face: MG }),
      ...Crowd("scatter"),
      ...FerryMen({ aim: true }),
      N("GateGuard", GATE_GUARD, { stance: "crouch", face: MG }),
      ...GateRow(),
      ...YardPeople(),
    ],
    pois: [POI.breachMg("objective"), Poi("CrowdHit", "人堆炸开", "danger", Pt(-2, 620), 8), POI.bridge()],
  });

  // 13-2：打信号弹，飞机来：对岸一颗信号弹拖着烟打上天；东边顺着河传来嗡嗡声；「飞机！趴倒！」卧倒提示
  const p132 = p131;
  Add({
    id: "13-2", ...s13, name: "飞机来",
    player: { x: p132.x, z: p132.z, yawDeg: Yaw(p132, PL.planesFrom), pitchDeg: 10, stance: "prone" },
    what: "对岸一颗信号弹打上天；东边顺着河传来嗡嗡声：飞机！趴倒！",
    next: { text: "趴倒" },
    how: ["对岸一颗信号弹拖着烟打上天，落在渡口上空", "几秒后东边顺着河传来嗡嗡声。有人喊：「飞机！趴倒！」屏幕出卧倒提示", "两架飞机贴着河面压下来，从桥头一路扫到人堆：桥上的人一个接一个掉进河里，岸上百姓、白布担架都挨打，机枪同时在扫。不趴不判失败", "机枪还在扫；刘文财压着机枪"],
    notes: "飞机没有单位（预演里是 aircraft 轨），关键帧用 POI 标东边河上。一时谁也过不去：人堆全趴、担架搁在地上。",
    signals: [],
    units: [
      C("GengCart", cart13, { yaw: cartYaw13 }),
      C("Heizi", heizi13, { yaw: cartYaw13 }),
      C("Geng", CartWorld(cart13, cartYaw13, { x: 0.3, z: -4.4 }), { face: heizi13 }),
      ...DongguaOnCart(cart13, cartYaw13),
      ...CartLitters(cart13, cartYaw13),
      C("Nier", CartWorld(cart13, cartYaw13, { x: -1.0, z: -3.6 }), { face: heizi13 }),
      N("LiuWencai", liu131, { stance: "prone", aim: true, face: MG }),
      ...BreachIja(),
      ...BridgeGuards({ face: MG }),
      ...Crowd("prone"),
      ...FerryMen({ aim: true }).map((u) => ({ ...u, stance: "prone" })),
      N("GateGuard", GATE_GUARD, { stance: "prone", face: MG }),
      ...GateRow(),
      ...YardPeople(),
    ],
    pois: [POI.flare(), POI.planesEast(), POI.breachMg(), POI.bridge()],
  });

  // 13-3：车翻了：黑子挨一梭惨叫一挣，车翻了，车板上的担架连人甩出去，冬瓜摔在车旁空地上（身底下还是那床单被）；妮儿扑到黑子身上；飞机拉起来往西兜
  const heizi133 = CartWorld(cart13, cartYaw13, { x: 0.6, z: -2.6 });
  const blanket133 = CartWorld(cart13, cartYaw13, { x: -3.2, z: 0.6 });   // 车左后侧（东南）的空地上
  const w1_133 = CartWorld(cart13, cartYaw13, { x: 2.8, z: 1.0 }), w2_133 = CartWorld(cart13, cartYaw13, { x: 3.0, z: -1.4 });
  const p133 = CartWorld(cart13, cartYaw13, { x: -0.6, z: 2.4 });
  Add({
    id: "13-3", ...s13, name: "车翻了",
    player: { x: p133.x, z: p133.z, yawDeg: Yaw(p133, MG), pitchDeg: 2, stance: "crouch" },
    what: "黑子挨一梭惨叫一挣，车翻了，担架连人甩出去；冬瓜摔在车旁空地上。飞机拉起来往西兜。",
    next: { text: "打豁子上那挺机枪", x: MG.x, z: MG.z, radiusM: 4 },
    how: ["黑子挨一梭惨叫一挣，车翻了，车板上的担架连人甩出去，冬瓜摔在车旁空地上，身底下还是那床单被", "妮儿扑到黑子身上", "飞机拉起来往西兜；兜圈时玩家接着压机枪，也可以朝飞机开枪（打不下来）", "另外两个甩出来的伤员躺在车旁"],
    notes: "翻倒的车是随信号体块（CartOverturned：车身 + 一个车轮），立着的车 GengCart 从这一帧起不再摆；黑子 state down。"
      + "冬瓜从这一帧起躺在自己那床单被上（BlanketDonggua，IsBlanketLitter、布料模拟），摔在车旁露在空地上；车板上那三副竹竿担架甩散了不再摆。",
    signals: [SIG.cartOverturned],
    units: [
      C("Heizi", heizi133, { down: true, yaw: cartYaw13 + 40 }),
      C("Nier", Off(heizi133, 0.9, -0.5), { face: heizi133 }),
      ...DongguaOnBlanket(blanket133, { yaw: cartYaw13 + 160 }),
      N("Wounded1", w1_133, { group: "cart", down: true, yaw: 20 }),
      N("Wounded2", w2_133, { group: "cart", down: true, yaw: 250 }),
      C("Geng", Off(heizi133, -1.4, 0.8), { face: blanket133 }),
      N("LiuWencai", liu131, { stance: "crouch", aim: true, face: MG }),
      ...BreachIja(),
      ...BridgeGuards({ face: MG }),
      ...Crowd("scatter"),
      ...FerryMen({ aim: true }),
      N("GateGuard", GATE_GUARD, { stance: "crouch", face: MG }),
      ...GateRow(),
      ...YardPeople(),
    ],
    pois: [POI.planesWest(), Poi("DongguaThrown", "冬瓜摔在车旁空地上", "poi", blanket133, 1.5), POI.breachMg("objective")],
  });

  // ======================= 14 拖被子，松手 =======================
  const s14 = { stage: 14, stageTitle: "拖被子" };
  // 14-1：老耿背着另一个甩出来的伤员往河堤底下爬，回头喊：冬瓜！把他弄过来！玩家揪单被一个角，妮儿爬过来揪住另一个角
  const p141 = Off(blanket133, 0.95, 1.25);          // 被头的一角（朝东南拖）
  const blanketYaw14 = Yaw(blanket133, TROUGH);
  const nier141 = Off(blanket133, -0.35, 1.5);
  const geng141 = Pt(8.4, 621.6), gengW141 = Off(geng141, 0.7, 0.5);
  Add({
    id: "14-1", ...s14, name: "揪被角",
    player: { x: p141.x, z: p141.z, yawDeg: blanketYaw14, pitchDeg: -12, stance: "crouch" },
    what: "老耿背着伤员往河堤底下爬：冬瓜！把他弄过来！玩家揪单被一角，妮儿一声不吭揪住另一角。",
    next: { text: "把冬瓜拖到河堤底下", x: TROUGH.x, z: TROUGH.z, radiusM: 3 },
    how: ["飞机在西边拐弯，掉头声听得见。冬瓜一个人躺在翻倒的车旁、露在空地上", "老耿背着另一个甩出来的伤员往河堤底下爬，回头喊：「冬瓜！把他弄过来！」任务字：把冬瓜拖到河堤底下", "拖人就得停火：玩家一离开车后，机枪不缩了，刘文财一个人压不住", "玩家揪单被一个角（跟 02 拖被子同键同姿势，手上没枪）；妮儿从黑子身边爬过来，一声不吭揪住另一个角。两人往河堤底下拖，河堤在前头十几步。飞机声越来越尖（俯冲）"],
    notes: `河堤底下 = 北堤北脚河滩上的低洼（底 ${TG.floorY}，比河滩低 0.9），离翻车处约 17 m，中间没有掩体。妮儿这一帧换回骨骼身体（body rig）：拖被子要放 PvBlanketDragL/R、被角握点要攥在手上。`
      + "老耿「背着伤员」没有姿态：伤员倒在他身边（Wounded1），他站着朝低洼走。",
    signals: [SIG.cartOverturned],
    units: [
      C("Heizi", heizi133, { down: true, yaw: cartYaw13 + 40 }),
      ...DongguaOnBlanket(blanket133, { yaw: blanketYaw14 }),
      C("Nier", nier141, { body: "rig", face: TROUGH, stance: "crouch" }),
      C("Geng", geng141, { face: TROUGH, speed: 0.8, to: Off(TROUGH, -2.4, 0.6) }),
      N("Wounded1", gengW141, { group: "cart", down: true, yaw: 20, speed: 0.8 }),
      N("Wounded2", w2_133, { group: "cart", down: true, yaw: 250 }),
      N("LiuWencai", liu131, { stance: "crouch", aim: true, face: MG }),
      ...BreachIja(),
      ...BridgeGuards({ face: MG }),
      ...Crowd("prone"),
      ...FerryMen({ aim: true }).map((u) => ({ ...u, stance: "prone" })),
      N("GateGuard", GATE_GUARD, { stance: "prone", face: MG }),
      ...GateRow(),
      ...YardPeople(),
    ],
    pois: [POI.trough("objective"), POI.planesDive(), POI.breachMg()],
  });

  // 14-2：松手 / 抬眼：俯冲声压到头顶，一串弹着点顺地皮追过来，顺子本能扑倒，被角从手里脱出去；妮儿没趴，还攥着另一角一个人往后拽；弹着点从冬瓜身上扫过
  const blanket142 = Pt(3.6, 612.6);                   // 往低洼拖了六米
  const p142 = Off(blanket142, 0.6, 1.6);
  const nier142 = Off(blanket142, -0.9, 1.3);
  Add({
    id: "14-2", ...s14, name: "松手",
    player: { x: p142.x, z: p142.z, yawDeg: Yaw(p142, nier142), pitchDeg: 8, stance: "prone" },
    what: "顺子本能扑倒，被角脱手；妮儿没趴，一个人往后拽；那串弹着点从冬瓜身上扫过，被子上洇开一片血。",
    next: { text: "把冬瓜拖到河堤底下", x: TROUGH.x, z: TROUGH.z, radiusM: 3 },
    how: ["松手（收走控制两三秒，慢镜头）：俯冲声压到头顶，一串弹着点顺地皮追过来，顺子本能扑倒，被角从手里脱出去", "抬眼（控制交还）：自己手边空了；妮儿没趴（听不见），还攥着另一角一个人往后拽，脸朝顺子，不知道他为什么停", "冬瓜被拽着挪了一点、挪不动，那串弹着点从他身上扫过，他一抽，被子上洇开一片血（大腿和腰侧，不当场死）；弹着点擦着妮儿过去，她没挨着", "车后头刘文财脸正冲这边，全看见了"],
    notes: "测：问「冬瓜怎么挨的枪」，答得出「顺子松了手」才算看懂。妮儿骨骼身体（body rig）攥着被角、脸朝顺子；玩家趴在被子东边手边空着。弹着点 POI 从冬瓜身上扫过。",
    signals: [SIG.cartOverturned],
    units: [
      C("Heizi", heizi133, { down: true, yaw: cartYaw13 + 40 }),
      ...DongguaOnBlanket(blanket142, { yaw: blanketYaw14 }),
      C("Nier", nier142, { body: "rig", face: p142, stance: "crouch" }),
      C("Geng", Pt(11.2, 625.4), { face: blanket142 }),
      N("Wounded1", Pt(12.0, 626.2), { group: "cart", down: true, yaw: 20 }),
      N("Wounded2", w2_133, { group: "cart", down: true, yaw: 250 }),
      N("LiuWencai", liu131, { stance: "crouch", face: p142 }),
      ...BreachIja(),
      ...BridgeGuards({ face: MG }),
      ...Crowd("prone"),
      ...FerryMen({ aim: true }).map((u) => ({ ...u, stance: "prone" })),
      N("GateGuard", GATE_GUARD, { stance: "prone", face: MG }),
      ...GateRow(),
      ...YardPeople(),
    ],
    pois: [POI.bullets(), Poi("DongguaHit", "冬瓜挨了枪，被子上洇开一片血", "poi", blanket142, 1.5), POI.trough("objective")],
  });

  // 14-3：老耿扔下伤员跑回来，和顺子一人一角把冬瓜拖进河堤底下；刘文财冲出去把妮儿捞回来；飞机往东飞走；庄子西南角「轰」一声机枪哑了
  const blanket143 = Off(TROUGH, -1.4, -1.2);
  const p143 = Off(blanket143, 0.95, 1.3);
  const geng143 = Off(blanket143, -0.95, 1.3);
  Add({
    id: "14-3", ...s14, name: "拖进河堤底下",
    player: { x: p143.x, z: p143.z, yawDeg: Yaw(p143, TROUGH), pitchDeg: -10, stance: "crouch" },
    what: "老耿跑回来，和顺子一人一角把冬瓜拖进河堤底下；刘文财把妮儿捞回来。庄子西南角「轰」一声，机枪哑了。",
    next: { text: "把冬瓜拖进河堤底下" },
    how: ["老耿扔下背上的伤员跑回来，和顺子一人一角把冬瓜拖进河堤底下", "刘文财冲出去把妮儿捞回来。飞机拉起来往东飞走", "庄子西南角「轰」一声，机枪哑了：班长他们顺着河汊子西坎摸到豁子对面，一捆手榴弹甩进豁子", "桥头零零星星还在打"],
    notes: "老耿这一帧换回骨骼身体（body rig，PvBlanketDrag 另一角）；妮儿也还是骨骼身体（开场还攥着被角，刘文财才把她捞走）。BreachBlasted 从这一帧起：豁子里再塌一堆、机枪手和副射手倒在瓦砾上。班长、幺娃、何有田在河汊子西坎上豁子对面（grenadeFrom），Squad1 / 2 守在桥西头。刘文财抱着妮儿在翻车旁（没有抱人的姿态：并排站）。",
    signals: [SIG.cartOverturned, SIG.breachBlasted],
    units: [
      C("Heizi", heizi133, { down: true, yaw: cartYaw13 + 40 }),
      ...DongguaOnBlanket(blanket143, { yaw: blanketYaw14 }),
      C("Geng", geng143, { body: "rig", face: TROUGH, stance: "crouch", path: [Pt(10.4, 624.2), geng143] }),
      N("Wounded1", Pt(12.0, 626.2), { group: "cart", down: true, yaw: 20 }),
      N("Wounded2", w2_133, { group: "cart", down: true, yaw: 250 }),
      N("LiuWencai", Off(nier142, 1.2, 1.0), { face: p143 }),
      C("Nier", Off(nier142, 0.4, 1.4), { body: "rig", face: p143 }),
      ...BreachIja({ mgDown: true }),
      N("Luo", BCH.grenadeFrom[0], { stance: "crouch", face: MG, path: [BRIDGE_GUARD.Luo, Pt(27.0, 556), BCH.grenadeFrom[0]] }),
      N("Yaowa", BCH.grenadeFrom[1], { stance: "crouch", aim: true, face: MG, path: [BRIDGE_GUARD.Yaowa, Pt(26.6, 556), BCH.grenadeFrom[1]] }),
      N("HeYoutian", BCH.grenadeFrom[2], { stance: "crouch", aim: true, face: MG, path: [BRIDGE_GUARD.HeYoutian, Pt(27.4, 556), BCH.grenadeFrom[2]] }),
      ...BridgeGuards({ face: PL.helmetsAt, exclude: new Set(["Luo", "Yaowa", "HeYoutian"]) }),
      ...Crowd("scatter"),
      ...FerryMen({ aim: true }),
      N("GateGuard", GATE_GUARD, { stance: "crouch", face: MG }),
      ...GateRow(),
      ...YardPeople(),
    ],
    pois: [POI.breachBlast(), POI.planesGone(), POI.trough("objective")],
  });

  // ======================= 15 河堤底下 / 到接收院门口 =======================
  const s15 = { stage: 15, stageTitle: "河堤底下" };
  // 15-1（15A）：河堤底下：老耿跪着把毛巾按回伤口；刘文财：你松你妈啥子手！冬瓜：龟儿子……手恁个滑……八个……抵了
  const blanket151 = TROUGH;
  const p151 = Off(blanket151, 0.4, -1.9), geng151 = Off(blanket151, 1.5, 0.3), liu151 = Off(blanket151, -1.6, 0.6), nier151 = Off(geng151, 1.2, 0.8);
  Add({
    id: "15-1", ...s15, stageLabel: "15A", name: "河堤底下",
    player: { x: p151.x, z: p151.z, yawDeg: Yaw(p151, blanket151), pitchDeg: -16, stance: "crouch" },
    what: "老耿跪着把毛巾按回伤口。刘文财：你松你妈啥子手！冬瓜：龟儿子……手恁个滑……八个……抵了。",
    next: { text: "把冬瓜抬到接收院门口", x: PL.yardGate.x + 3, z: PL.yardGate.z, radiusM: 3 },
    how: ["河堤底下：老耿跪着把毛巾按回伤口", "刘文财：「你松你妈啥子手！」", "冬瓜：「龟儿子……手恁个滑……」「……八个……抵了。」", "刘文财把妮儿推给老耿，接过被角 / 后杠"],
    notes: "低洼底 −0.6、比河滩低 0.9，机枪位看不见这里。老耿「跪着」把毛巾按回伤口：这一帧换骨骼身体（body rig，预演放 CareMedicPress；程序化身体蹲不下）。被子朝向 = 往渡口拖的方向。",
    signals: [SIG.cartOverturned, SIG.breachBlasted],
    units: [
      ...DongguaOnBlanket(blanket151, { yaw: 90 }),
      C("Geng", geng151, { body: "rig", face: blanket151, stance: "crouch" }),
      N("LiuWencai", liu151, { stance: "crouch", face: p151 }),
      C("Nier", nier151, { face: blanket151 }),
      N("Wounded1", Pt(12.0, 626.2), { group: "cart", down: true, yaw: 20 }),
      C("Heizi", heizi133, { down: true, yaw: cartYaw13 + 40 }),
      ...BreachIja({ mgDown: true }),
      N("Luo", BCH.grenadeFrom[0], { stance: "crouch", face: PL.helmetsAt }),
      N("Yaowa", BCH.grenadeFrom[1], { stance: "crouch", aim: true, face: PL.helmetsAt }),
      N("HeYoutian", BCH.grenadeFrom[2], { stance: "crouch", aim: true, face: PL.helmetsAt }),
      ...BridgeGuards({ face: PL.helmetsAt, exclude: new Set(["Luo", "Yaowa", "HeYoutian"]) }),
      ...Crowd("queue"),
      ...FerryMen(),
      N("GateGuard", GATE_GUARD, { face: Pt(-14, 616) }),
      ...GateRow(),
      ...YardPeople(),
    ],
    pois: [Poi("RedSky", "头顶一条红天", "landmark", Off(blanket151, 0, 3), 1), POI.yardGate("objective")],
  });

  // 15-2（15B）：从河堤底下抬到接收院门口（几十米），没有对白，天一点点黑
  const blanket152 = Pt(-12, 620.6);
  const p152 = Off(blanket152, -0.75, -1.5), liu152 = Off(blanket152, 0.75, -1.5), geng152 = Off(blanket152, 0.4, 1.9), nier152 = Off(blanket152, -0.9, 2.2);
  Add({
    id: "15-2", ...s15, stageLabel: "15B", name: "抬到门口",
    player: { x: p152.x, z: p152.z, yawDeg: Yaw(p152, PL.yardGate), pitchDeg: -4, stance: "stand" },
    what: "从河堤底下抬到接收院门口，几十米，没有对白，天一点点黑。",
    next: { text: "抬到接收院门口", x: PL.yardGate.x + 3, z: PL.yardGate.z, radiusM: 3 },
    how: ["顺子和刘文财一人一角拽着被子穿过渡口空场", "老耿牵着妮儿跟在后头", "天一点点黑下来，红褪成灰蓝", "接收院门口墙根下躺一排伤兵，军医在里头；门里有人喊"],
    notes: "被子朝西北（接收院门），玩家在被头左角、刘文财右角（bearers 0，拽的人站位）。渡口的人堆照旧挤浮桥头。",
    signals: [SIG.cartOverturned, SIG.breachBlasted],
    units: [
      ...DongguaOnBlanket(blanket152, { yaw: Yaw(blanket152, PL.yardGate) }),
      N("LiuWencai", liu152, { face: PL.yardGate, speed: 1.0 }),
      C("Geng", geng152, { face: PL.yardGate, speed: 1.0 }),
      C("Nier", nier152, { face: PL.yardGate, speed: 1.0 }),
      N("Wounded1", Pt(12.0, 626.2), { group: "cart", down: true, yaw: 20 }),
      C("Heizi", heizi133, { down: true, yaw: cartYaw13 + 40 }),
      ...BridgeGuards({ face: PL.helmetsAt, aim: false }),
      ...Crowd("queue"),
      ...FerryMen(),
      N("GateGuard", GATE_GUARD, { face: Pt(-14, 616) }),
      ...GateRow(),
      ...YardPeople(),
    ],
    pois: [POI.yardGate("objective"), POI.bridge()],
  });

  // 15-3（15C）：接收院门口等着进院：守门的兵「等到！里头满起了！挤你妈啥子！」；妮儿画驴摆弹壳；刘文财算驴腿的账：「……犟。」老耿看着地上的驴把脸转开
  const s15c = { stage: 15, stageTitle: "接收院门口" };
  const blanket153 = Pt(-18.8, 619.6);
  const p153 = Off(blanket153, 0.2, -2.0), nier153 = Pt(-16.6, 622.6), liu153 = Pt(-15.4, 620.8), geng153 = Pt(-17.6, 616.4);
  Add({
    id: "15-3", ...s15c, stageLabel: "15C", name: "等着进院",
    player: { x: p153.x, z: p153.z, yawDeg: Yaw(p153, nier153), pitchDeg: -18, stance: "crouch" },
    what: "守门的兵：等到！里头满起了！挤你妈啥子！妮儿画驴摆弹壳；刘文财：……犟。",
    next: { text: "等着进院" },
    how: ["守门的兵：「等到！里头满起了！挤你妈啥子！」", "冬瓜搁在墙根排在别人后头，顺子在被头蹲下（自动）", "妮儿画驴摆弹壳；刘文财算驴腿的账、「……犟。」", "老耿看着地上的驴把脸转开"],
    notes: "院门外东墙根从 z 617 排到 629：6 个躺着的伤兵（GateWounded），冬瓜的被子排在后头。妮儿「蹲在地上画驴」：这一帧换骨骼身体（body rig，预演放 PvKneelDig 顶着；程序化身体蹲不下）。黑子倒在翻车旁（从这里看得见）。",
    signals: [SIG.cartOverturned, SIG.breachBlasted],
    units: [
      ...DongguaOnBlanket(blanket153, { yaw: 0 }),
      C("Nier", nier153, { body: "rig", stance: "crouch", face: Pt(nier153.x, nier153.z + 1) }),
      N("LiuWencai", liu153, { stance: "crouch", face: nier153 }),
      C("Geng", geng153, { face: Pt(-24, 612) }),
      N("Wounded1", Pt(12.0, 626.2), { group: "cart", down: true, yaw: 20 }),
      C("Heizi", heizi133, { down: true, yaw: cartYaw13 + 40 }),
      N("GateGuard", GATE_GUARD, { face: p153 }),
      ...GateRow(),
      ...YardPeople({ boardTo: Pt(-26.6, 615.4) }),
      ...BridgeGuards({ face: PL.helmetsAt, aim: false }),
      ...Crowd("queue"),
      ...FerryMen(),
    ],
    pois: [POI.yardGate("objective"), Poi("NierDraw", "妮儿画的驴", "poi", Pt(nier153.x, nier153.z + 1), 1), Poi("HeiziDown", "地上的驴", "poi", heizi133, 1.5)],
  });

  // ======================= 16 过门槛 =======================
  const s16 = { stage: 16, stageTitle: "过门槛" };
  const p161 = Pt(Y.xiang.door.x, 624.1);
  const blanket161 = Pt(Y.xiang.door.x, 622.3), liu161 = Pt(Y.xiang.door.x, 620.4);
  const doctor161 = Pt(DOCTOR_PRESS.x, DOCTOR_PRESS.z);
  Add({
    id: "16-1", ...s16, name: "门槛",
    player: { x: p161.x, z: p161.z, yawDeg: 180, pitchDeg: -22, stance: "stand" },
    what: "军医：肚子上的？抬进去！过门槛担架一歪，冬瓜：脚……慢点。……有门槛。抬高点。",
    next: { text: "把冬瓜慢慢放下", x: Y.dongguaInside.x, z: Y.dongguaInside.z, radiusM: 1.5 },
    how: ["院里点着马灯，麦秸上躺满了人；百姓在灶屋烧水，有人抱着门板往外走", "军医：「肚子上的？抬进去！」", "厢房门口一道门槛，镜头一低一抬：「脚……慢点。」「……有门槛。抬高点。」", "屋里靠墙的空地：按住键慢慢放"],
    notes: "顺子在被头（门口，站在门槛北沿）、刘文财在被尾，被子在两人之间（bearers 0）。门槛是 0.15 高的块（XiangThreshold）。老耿和妮儿跟进了院子，在院门里侧等。",
    signals: [SIG.cartOverturned, SIG.breachBlasted],
    units: [
      ...DongguaOnBlanket(blanket161, { yaw: 180, extra: { speed: 0.8 } }),
      N("LiuWencai", liu161, { yaw: 180, speed: 0.8 }),
      N("Doctor", doctor161, { face: p161, tending: DOCTOR_PATIENT_ID }),
      C("Geng", Pt(-27.6, 615.2), { face: p161 }),
      C("Nier", Pt(-26.8, 617.4), { face: p161 }),
      N("GateGuard", GATE_GUARD, { yaw: -90 }),
      ...GateRow(),
      ...YardPeople().filter((u) => u.id !== "Doctor"),
      ...Crowd("queue"),
      ...FerryMen(),
    ],
    pois: [POI.xiangDoor("objective"), POI.threshold(), POI.dongguaInside()],
  });

  // ======================= 17 门槛上 =======================
  const s17 = { stage: 17, stageTitle: "门槛上" };
  const inside = Pt(Y.dongguaInside.x, Y.dongguaInside.z);
  const p171 = Pt(-40.2, 627.0);
  const doctorPress171 = PressPose(inside, 180);
  const doctor171 = Pt(doctorPress171.x, doctorPress171.z), geng171 = Pt(-44.0, 629.9), nier171 = Pt(Y.xiang.door.x, 626.4), liu171 = Pt(-39.2, 629.0);
  Add({
    id: "17-1", ...s17, name: "没了",
    player: { x: p171.x, z: p171.z, yawDeg: Yaw(p171, inside), pitchDeg: -26, stance: "stand" },
    what: "军医：……没了。老耿用冬瓜自己那床单被盖住他的脸。",
    next: { text: "（在门槛上坐下）", x: Y.thresholdSeat.x, z: Y.thresholdSeat.z, radiusM: 1 },
    how: ["军医蹲下看一眼伤口，又摸摸脖子，停了一会儿：「……没了。」", "他站起来转身去看别人；院子里没人停下来", "老耿用冬瓜自己那床单被盖住他的脸", "妮儿站在门边看这个大人的脸、又看那个"],
    notes: "被子放在厢房里靠墙（dongguaInside），冬瓜 down、盖着脸从这一帧起就不动了。军医跪在被子西边（CareMedicPress 的站位）看伤口，看完回院里那个伤员身边。老耿在被子边：这一帧换骨骼身体（body rig，预演放 PvKneelPullBlanket 把被子拉上来盖脸）。",
    signals: [SIG.cartOverturned, SIG.breachBlasted],
    units: [
      ...DongguaOnBlanket(inside, { yaw: 180 }),
      N("Doctor", doctor171, { stance: "crouch", yaw: doctorPress171.yawDeg, to: Pt(DOCTOR_PRESS.x, DOCTOR_PRESS.z), tending: "Donggua" }),
      C("Geng", geng171, { body: "rig", face: inside, stance: "crouch" }),
      C("Nier", nier171, { face: geng171 }),
      N("LiuWencai", liu171, { face: inside }),
      N("GateGuard", GATE_GUARD, { yaw: -90 }),
      ...GateRow(),
      ...YardPeople().filter((u) => u.id !== "Doctor"),
      ...Crowd("queue"),
      ...FerryMen(),
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
    how: ["退到门口在门槛上坐下（自动两秒），之后能转头不能走", "摸出钱袋把铜板倒在手心里；屏幕上只亮一个 F，不写字；按一下往另一只手挪一个", "院子里有人往里抬、往外抬、烧水；门外渡口上担架一副一副往桥上走"],
    notes: "「坐在门槛上」：玩家机位蹲姿、放在门槛北沿外（z 624.55，门槛块在 625）。军医回到院里去看别人。",
    signals: [SIG.cartOverturned, SIG.breachBlasted],
    units: [
      ...DongguaOnBlanket(inside, { yaw: 180 }),
      N("Doctor", Pt(DOCTOR_PRESS.x, DOCTOR_PRESS.z), { yaw: DOCTOR_PRESS.yawDeg, stance: "crouch", tending: DOCTOR_PATIENT_ID }),
      C("Geng", geng171, { face: inside }),
      C("Nier", nier171, { face: seat }),
      N("LiuWencai", liu171, { face: seat }),
      N("GateGuard", GATE_GUARD, { yaw: -90 }),
      ...GateRow(),
      ...YardPeople().filter((u) => u.id !== "Doctor"),
      ...Crowd("queue"),
      ...FerryMen(),
    ],
    pois: [Poi("Coins", "手心里的铜板", "poi", seat, 0.5), POI.yardGate("landmark"), POI.bridge()],
  });

  // 17-3：班长带人进院（从石板桥撤回来）：咋个搞的？……飞机。狗日的。顺儿。……起来，跟斗走
  const luo173 = Pt(-41.6, 622.4), yaowa173 = Pt(-39.6, 623.2), he173 = Pt(-37.8, 620.4);
  const gateOutside = Pt(-19, 612);
  Add({
    id: "17-3", ...s17, name: "跟斗走",
    player: { x: seat.x, z: seat.z, yawDeg: Yaw(seat, luo173), pitchDeg: 4, stance: "crouch" },
    what: "班长带人进院：咋个搞的？刘文财：……飞机。班长：狗日的。顺儿。……起来，跟斗走。",
    next: { text: "跟着班长去渡口", x: -8, z: 624, radiusM: 3 },
    how: ["院门口一阵乱，班长带着幺娃、何有田和剩下的人从石板桥撤回来进院，满身是土和烟", "「咋个搞的？」刘文财：「……飞机。」「狗日的。」", "幺娃看见顺子手心里那把铜板，把眼睛挪开了", "「顺儿。……起来，跟斗走。」顺子把铜板一把攥住塞回怀里站起来，拿回全部操作"],
    notes: "班长从院门走到顺子跟前（path 从门外进来）；幺娃站在顺子旁边；何有田与 Squad1 / 2 在后头 / 院门口。",
    signals: [SIG.cartOverturned, SIG.breachBlasted],
    units: [
      N("Luo", luo173, { face: seat, from: gateOutside }),
      N("Yaowa", yaowa173, { face: seat, from: gateOutside }),
      N("HeYoutian", he173, { face: seat, from: gateOutside }),
      N("Squad1", Pt(-28.4, 615.4), { face: seat, from: gateOutside, guess: true }),
      N("Squad2", Pt(-27.8, 618.6), { yaw: 90, from: gateOutside, guess: true }),
      ...DongguaOnBlanket(inside, { yaw: 180 }),
      N("Doctor", Pt(DOCTOR_PRESS.x, DOCTOR_PRESS.z), { yaw: DOCTOR_PRESS.yawDeg, stance: "crouch", tending: DOCTOR_PATIENT_ID }),
      C("Geng", geng171, { face: inside }),
      C("Nier", nier171, { face: luo173 }),
      N("LiuWencai", liu171, { face: luo173 }),
      N("GateGuard", GATE_GUARD, { yaw: -90 }),
      ...GateRow(),
      ...YardPeople().filter((u) => u.id !== "Doctor"),
      ...Crowd("queue"),
      ...FerryMen(),
    ],
    pois: [POI.yardGate("objective"), POI.ferry("landmark")],
  });

  // ======================= 18 守渡口 =======================
  const s18 = { stage: 18, stageTitle: "守渡口" };
  // 18-1：桥头的命令：散兵坑朝东北、工兵绑炸药；远处（东边）铁路桥炸了；军官：顶到这儿，等后头的人过完再炸
  const p181 = Pt(-6, 622);
  const SAPPER1 = Pt(FY.sapperPosts[0].x, FY.sapperPosts[0].z), SAPPER2 = Pt(FY.sapperPosts[1].x, FY.sapperPosts[1].z);
  const squad181 = { Luo: Pt(-10, 618.6), Yaowa: Pt(-12.4, 619.4), HeYoutian: Pt(-8.2, 617.4), LiuWencai: Pt(-11.0, 616.0), Squad1: Pt(-14.6, 617.2), Squad2: Pt(-13.8, 615.4) };
  Add({
    id: "18-1", ...s18, name: "桥头的命令",
    player: { x: p181.x, z: p181.z, yawDeg: Yaw(p181, OFFICER), pitchDeg: -2, stance: "stand" },
    what: "远处铁路桥炸了；军官：顶到这儿，等后头的人过完再炸。",
    next: { text: "进散兵坑，朝东北", x: PLAYER_SLOT.x, z: PLAYER_SLOT.z, radiusM: 2 },
    how: ["出了院子就是渡口：空场东侧一道朝东北的散兵坑（对着石板桥和河滩），两个工兵跪在第一条船上往船底绑炸药，引线顺着桥板拉到南岸", "顺着河往东边远处「轰——」一声，天边腾起一大团火光：「铁路桥炸了。」", "「哪部分的？……正好，给老子顶到这儿！后头还有人在撤，等他们过完，这座也炸！」「顶到最后一个过桥！……城里头说了，援兵在路上了。」「在路上？日他妈，老子也在路上。」", "班长把人一个个塞进散兵坑；任务字：等后头的人过桥"],
    notes: "ChargesSet 从这一帧起（北头四条船上的炸药包 + 引线）。工兵站在桥面上（第一条船那一段），跪姿用蹲。远处铁路桥炸用 POI（danger）标在东边 railBlast。全班从院门往空场走，intent 指向各自的坑位；渡口的三个兵也进坑。",
    signals: [SIG.cartOverturned, SIG.breachBlasted, SIG.chargesSet],
    units: [
      N("BridgeOfficer", OFFICER, { face: p181 }),
      N("Sapper1", SAPPER1, { stance: "crouch", yaw: 0 }),
      N("Sapper2", SAPPER2, { stance: "crouch", yaw: 180 }),
      ...Object.entries(squad181).map(([id, p]) => N(id, p, { face: OFFICER, to: TRENCH_SLOTS[id], guess: id.startsWith("Squad") })),
      N("FerrySoldier", PLATFORM, { face: OFFICER, to: TRENCH_SLOTS.FerrySoldier }),
      N("FerryGuard1", Pt(-11.4, 633.8), { face: OFFICER, to: TRENCH_SLOTS.FerryGuard1 }),
      N("FerryGuard2", Pt(-3.6, 634.2), { face: OFFICER, to: TRENCH_SLOTS.FerryGuard2 }),
      N("LitterCross", BP(668), { kind: "litter", name: "过桥的担架", yaw: 180, group: "bridge", to: BP(740) }),
      C("Geng", Pt(-14.4, 622.6), { face: OFFICER }),
      C("Nier", Pt(-13.6, 623.8), { face: Pt(-14.4, 622.6) }),
      N("GateGuard", GATE_GUARD, { yaw: -90 }),
      ...Crowd("queue", { exclude: new Set(["CCiv01", "CCiv02", "CLitter01", "CWalker01"]) }),
      ...GateRow(),
      ...YardPeople(),
    ],
    pois: [POI.railBlast(), POI.trench("objective"), Poi("Sappers", "工兵在第一条船上绑炸药", "poi", SAPPER1, 2), POI.bridge()],
  });

  // 18-2：等：撤下来的人一个个过桥；鬼子从石板桥和庄子西南角压过来；最后一拨（02 坡顶那个班）从北边田里撤下来，被桥头机枪压在土坎后
  const p182 = PLAYER_SLOT;
  const IJA_BEACH = Object.freeze([
    [Pt(22.0, 574.6), "prone"], [Pt(18.4, 579.0), "crouch"], [Pt(26.2, 580.2), "stand"], [Pt(14.6, 584.4), "crouch"], [Pt(20.8, 588.6), "stand"], [Pt(9.8, 590.0), "prone"],
    [Pt(16.0, 594.8), "crouch"], [DP(36.2, -0.6), "stand"], [DP(31.4, 0.5), "stand"], [Pt(10.0, 571.0), "prone"],
  ]);
  const IjaBeach = () => IJA_BEACH.map(([p, stance], i) => J(`Ija${i + 1}`, p, { role: "rifleman", group: "beach", stance, aim: stance !== "stand", face: SQUARE_C, straight: true, intent: [Off(p, -5, 7)], speed: 2.8 }));
  const IjaMg18Group = () => [
    J("IjaMg", MG18, { stance: "prone", aim: true, arc: MG18_ARC, yaw: MG18_ARC.yawDeg }),
    J("IjaMgLoader", MG18_LOADER, { stance: "prone", face: SQUARE_C }),
  ];
  const LAST = Pt(PL.lastGroupCover.x, PL.lastGroupCover.z);
  const LastGroup = () => [
    N("LastGroup1", Off(LAST, 0, -2.2), { role: "lastGroup", group: "last", stance: "crouch", face: SQUARE_C }),
    N("LastGroup2", LAST, { role: "lastGroup", group: "last", stance: "crouch", face: MG18 }),
    N("LastGroup3", Off(LAST, 0.2, 2.0), { role: "lastGroup", group: "last", stance: "crouch", face: SQUARE_C }),
    N("LastWounded", Off(LAST, -1.3, 0.6), { role: "wounded", group: "last", down: true, yaw: 180 }),
  ];
  const SquadInTrench = () => Object.entries(TRENCH_SLOTS).map(([id, p]) => N(id, p, { face: NE_FAR, aim: true, guess: id.startsWith("Squad") }));
  Add({
    id: "18-2", ...s18, name: "等",
    player: { x: p182.x, z: p182.z, yawDeg: Yaw(p182, NE_FAR), pitchDeg: 0, stance: "stand" },
    what: "撤下来的人一个个过桥；接收院的担架也抬出来上桥；最后一拨被石板桥头的机枪压在河滩北边的土坎后。",
    next: { text: "打掉那挺机枪", x: MG18.x, z: MG18.z, radiusM: 4 },
    how: ["天快黑透了，河滩上还有人往渡口来，一到桥头就挤上浮桥；老耿牵着妮儿也在桥上", "接收院的担架抬出来上桥、军医跟最后一副走（院里只剩盖着脸的，冬瓜在里头）", "鬼子从石板桥和庄子西南角那边压过来，河滩上枪口火一闪一闪；石板桥头架起一挺机枪往渡口扫", "最后一拨（02 坡顶那个班）从北边田里撤下来，被机枪压在河滩北边一道土坎后；「炸！不等了！」「再等一哈！……顺儿！那挺机枪！」幺娃「快过来！」「后头没得人了！」"],
    notes: `散兵坑朝东北，坑里站着（坑底 + 1.62）越过土袋看得见石板桥西头（场景生成器核过）；桥头机枪趴着（眼 0.5）看不见土坎西边蹲着的最后一拨人（土坎顶 ${BK.topY}），他们一离开土坎往渡口跑就在枪口下。`
      + `鬼子：机枪组 2 在石板桥西头、步兵 ${IJA_BEACH.length} 个在河滩北半截和桥面上（跃进 intent 向西南）。`,
    signals: [SIG.cartOverturned, SIG.breachBlasted, SIG.chargesSet],
    units: [
      ...SquadInTrench(),
      N("BridgeOfficer", OFFICER, { face: SAPPER1 }),
      N("Sapper1", SAPPER1, { stance: "crouch", yaw: 0 }),
      N("Sapper2", SAPPER2, { stance: "crouch", yaw: 180 }),
      C("Geng", BP(662, -0.3), { yaw: 180, to: BP(740), speed: 1.2 }),
      C("Nier", BP(663.4, 0.5), { yaw: 180, to: BP(741), speed: 1.2 }),
      N("Straggler1", TP(26, 0.8), { role: "walkingWounded", group: "stragglers", yaw: 200, stance: "crouch", to: BP(640), speed: 1.8 }),
      N("Straggler2", TP(31, -0.9), { role: "walkingWounded", group: "stragglers", yaw: 200, to: BP(640), speed: 2.2 }),
      C("Refugee1", TP(34, 0.6), { role: "refugee", group: "stragglers", yaw: 200, to: BP(640), speed: 2.0 }),
      N("LitterCross", BP(690), { kind: "litter", yaw: 180, group: "bridge", to: BP(740) }),
      ...LastGroup(),
      ...IjaMg18Group(),
      ...IjaBeach(),
      N("GateGuard", GATE_GUARD, { yaw: -90 }),
      ...YardEvac(),
      ...Crowd("queue", { exclude: new Set(["CCiv01", "CCiv02", "CCiv03", "CCiv04", "CLitter01", "CLitter02", "CWalker01", "CWalker02", "CSoldier01"]) }),
    ],
    pois: [POI.ijaMg18("danger"), POI.lastGroup(), POI.bridge()],
  });

  // 18-3：撤！过桥！全班在桥面上往南跑，班长最后一个；工兵在南头捏着引线；鬼子压到渡口空场东沿
  const p183 = BP(676);
  const sapperS = Pt(FY.sapperSouth.x, FY.sapperSouth.z);
  const IJA_SQUARE_E = Object.freeze([Pt(10.0, 606.0), Pt(6.4, 611.6), Pt(12.2, 600.8), Pt(2.6, 608.2), Pt(-1.4, 614.8), Pt(5.6, 618.5), Pt(13.8, 613.0), Pt(1.0, 602.0)]);
  Add({
    id: "18-3", ...s18, name: "过桥",
    player: { x: p183.x, z: p183.z, yawDeg: 180, pitchDeg: -4, stance: "stand" },
    what: "撤！过桥！班长最后一个上南岸；工兵：点！",
    next: { text: "跑过桥", x: BRIDGE_X, z: 708, radiusM: 3 },
    how: ["「撤！过桥！」全班从坑里爬出来往桥上跑，班长走在最后倒退着边打边撤", "浮桥在脚底下一沉一晃，板缝里是黑水，子弹打进水里噗噗响", "南岸桥头上工兵蹲着捏着引线等；班长最后一个踏上南岸：「点！」", "引线嗤嗤烧过桥板，大家扑到南岸河堤后头；「轰」北头那几条船炸开，浮桥从中间断开，断的半截着火往下游打转"],
    notes: "桥面 2.4 m 宽（x −9.2…−6.8），人都在板上。班长在最北、倒退着（朝北举枪）。BridgeBlown 在这一拍末，从 18-4 起。鬼子压到渡口空场东沿 x −2…14。",
    signals: [SIG.cartOverturned, SIG.breachBlasted, SIG.chargesSet],
    units: [
      N("Luo", BP(663.5, -0.4), { yaw: 0, aim: true, speed: 2.0 }),
      N("Yaowa", BP(667.5, 0.4), { yaw: 180, speed: 3.0 }),
      N("HeYoutian", BP(670.6, -0.3), { yaw: 180, speed: 3.0 }),
      N("LiuWencai", BP(673.0, 0.5), { yaw: 180, speed: 3.0 }),
      N("Squad1", BP(679.5, -0.5), { yaw: 180, speed: 3.0, guess: true }),
      N("Squad2", BP(682.6, 0.6), { yaw: 180, speed: 3.0, guess: true }),
      N("FerryGuard1", BP(686.0, -0.4), { yaw: 180, speed: 3.0 }),
      N("FerryGuard2", BP(689.2, 0.5), { yaw: 180, speed: 3.0 }),
      N("FerrySoldier", BP(692.4, -0.5), { yaw: 180, speed: 3.0 }),
      N("Sapper1", sapperS, { stance: "crouch", yaw: 0 }),
      N("Sapper2", BP(708, 0.4), { yaw: 0 }),
      N("BridgeOfficer", BP(709.5, 1.4), { yaw: 0 }),
      C("Geng", BP(722, -0.4), { yaw: 180, to: BP(740) }),
      C("Nier", BP(723.0, 0.4), { yaw: 180, to: BP(741) }),
      N("LitterCross", BP(730), { kind: "litter", yaw: 180, group: "bridge", to: BP(760) }),
      ...IJA_SQUARE_E.map((p, i) => J(`Ija${i + 1}`, p, { role: "rifleman", group: "beach", aim: true, face: BP(690), speed: 2.8 })),
      ...IjaMg18Group(),
      N("Doctor", BP(731.5, 1.0), { yaw: 180, to: BP(760), speed: 1.2 }),
      ...YardDead(),
    ],
    pois: [POI.southFoot("objective"), Poi("SapperSouth", "工兵捏着引线", "poi", sapperS, 1.5), Poi("IjaRush", "鬼子压到渡口", "danger", Pt(6, 610), 10)],
  });

  // 18-4：对岸：桥断了；鬼子涌到对岸堤上打不过来；北岸院子里马灯还亮着
  const p184 = Pt(PL.southLeveeCover.x, PL.southLeveeCover.z);
  const leveeLine = (x) => Pt(x, LV.south.z + 3.4);
  const IJA_LEVEE_X = [-36, -33, -30, -27, -24, -21, -18, 3, 6, 9, 12, 15, 18, 21];
  Add({
    id: "18-4", ...s18, name: "对岸",
    player: { x: p184.x, z: p184.z, yawDeg: 0, pitchDeg: 2, stance: "stand" },
    what: "桥断了；鬼子涌到对岸打不过来；北岸院子里马灯还亮着。",
    next: { text: "往南走", x: BRIDGE_X, z: 740, radiusM: 3 },
    how: ["着火的船把北岸照亮了：鬼子一排排涌到对岸河堤上，后头石板桥上还有战车的影子；他们朝这边开枪，可是过不来", "北岸院子里，马灯还亮着", "班长：「走！看你妈啥子，走！」", "往南跑进黑里，身后的枪声慢慢远了"],
    notes: `BridgeBlown 从这一帧起：北头四段桥面与船没了，碎片在下游西边的水面上。站在南堤后（z 717，堤顶 1.5）眼睛刚好越过堤顶往北看（场景生成器核过：看得见北岸堤上的人、看得见院门灯桩上那盏马灯）。鬼子 ${IJA_LEVEE_X.length} 个排在北堤顶（避开浮桥口子），战车在石板桥西头。`,
    signals: [SIG.cartOverturned, SIG.breachBlasted, SIG.chargesSet, SIG.bridgeBlown],
    units: [
      N("Luo", leveeLine(-1.4), { yaw: 0, aim: true }),
      N("Yaowa", leveeLine(1.2), { yaw: 0 }),
      N("HeYoutian", leveeLine(3.8), { yaw: 0, aim: true }),
      N("LiuWencai", leveeLine(-13.6), { yaw: 0, aim: true }),
      N("Squad1", leveeLine(-16.2), { yaw: 0, guess: true }),
      N("Squad2", leveeLine(-18.6), { yaw: 0, guess: true }),
      N("FerryGuard1", leveeLine(-21.2), { yaw: 0 }),
      N("FerryGuard2", leveeLine(-23.6), { yaw: 0 }),
      N("FerrySoldier", leveeLine(6.4), { yaw: 0 }),
      N("Sapper1", Pt(-15.6, 719.8), { yaw: 0 }),
      N("Sapper2", Pt(-6.8, 720.2), { yaw: 0 }),
      N("BridgeOfficer", BP(721.4, 1.4), { yaw: 0 }),
      C("Geng", BP(736, -0.4), { yaw: 180, to: BP(800) }),
      C("Nier", BP(737.0, 0.4), { yaw: 180, to: BP(801) }),
      N("LitterCross", BP(748), { kind: "litter", yaw: 180, group: "bridge", to: BP(800) }),
      ...IJA_LEVEE_X.map((x, i) => J(`LeveeIja${i + 1}`, Pt(x, 634.8), { role: "rifleman", group: "levee", yaw: 180, aim: i % 3 !== 0, stance: i % 4 === 1 ? "crouch" : "stand", straight: true, guess: true })),
      J("IjaTank", Pt(22, 570), { yaw: Yaw(Pt(22, 570), SQUARE_C), straight: true, guess: true }),
      N("Doctor", BP(749.6, 1.0), { yaw: 180, to: BP(800), speed: 1.2 }),
      ...YardDead(),
    ],
    pois: [POI.lamp(), POI.wreck(), Poi("LeveeIja", "鬼子涌到对岸堤上", "danger", Pt(-8, 635), 20), POI.southRoad()],
  });

  // 18-5：夜里，北门：一长溜队伍往南走；老耿：进城。城里有城墙，比庄上牢靠；门口有人运沙土、舀水；带路的兵
  const p185 = Pt(BRIDGE_X - 0.4, 846);
  const gate = Pt(PL.northGate.x, PL.northGate.z);
  const gengIn = BP(842.4, -1.0), nier185 = BP(841.6, 0.2), yaowa185 = BP(841.8, 1.4);
  Add({
    id: "18-5", ...s18, stageTitle: "北门", name: "北门",
    player: { x: p185.x, z: p185.z, yawDeg: 180, pitchDeg: 2, stance: "stand" },
    what: "夜进北门；老耿：进城。城里有城墙，比庄上牢靠。",
    next: { text: "进城", x: gate.x, z: gate.z + 4, radiusM: 3 },
    how: ["黑场，只有脚步声；字幕：1938年3月14日 夜｜滕县北门", "淡入：一长溜队伍往南走，有兵、有担架、有老百姓；老耿牵着妮儿在百姓堆里", "老耿：「进城。城里有城墙，比庄上牢靠。」没人接", "前头黑压压的城墙，门洞里点着火把；兵和老百姓推小车往城墙上运沙土；门洞边有人提着一桶水给进城的人一人舀一瓢；「有地方歇脚！跟我来！」"],
    notes: "北门挪近了（真实隔着十来里，预演黑场带过）：南岸往南 150 m 就是城墙，门洞与浮桥对齐 x −8。队伍从 z 825 排到 849，班长在前；老耿牵着妮儿在百姓堆里，幺娃走在老耿旁边。门口两个百姓推运沙土的小车、一个提水桶舀水的人、带路的兵在门洞口。删了「身上还是那件单褂子」。",
    signals: [SIG.cartOverturned, SIG.breachBlasted, SIG.chargesSet, SIG.bridgeBlown],
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
      N("FerryGuard1", BP(826.4, -1.0), { yaw: 180 }),
      N("FerryGuard2", BP(825.2, 0.9), { yaw: 180 }),
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
  { id: "A", name: "村南口与墙根小路", stages: [11, 12], box: { minX: 36, maxX: 124, minZ: 538, maxZ: 576 } },
  { id: "B", name: "河滩（翻车、拖被子、河堤底下）", stages: [12, 15], box: { minX: -12, maxX: 30, minZ: 566, maxZ: 636 } },
  { id: "C", name: "渡口与接收院", stages: [15, 18], box: { minX: -62, maxX: 8, minZ: 588, maxZ: 640 } },
  { id: "D", name: "浮桥与南岸", stages: [18, 18], box: { minX: -24, maxX: 8, minZ: 636, maxZ: 760 } },
  { id: "E", name: "北门", stages: [18, 18], box: { minX: -60, maxX: 44, minZ: 820, maxZ: 895 } },
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
      gameVersion: `11–18 白盒第二版契约（2026-10-23，集成负责人；用户 10-23 认的 11–14 五步大纲）· ${L1218_VERSION}`,
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
/** 演员脚下的地面（高度场 + ≤1 m 的块顶，同运行时 standAt；石板桥 / 浮桥桥面就是这么站上去的）。 */
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
/** 在水里：北沙河的水里（浮桥桥面上不算）或河汊子沟底（石板桥桥面上不算）—— stand 给的是脚下的高度，桥面是块顶。 */
function InWater(p, stand) {
  if (p.z > RV.waterMinZ && p.z < RV.waterMaxZ) return stand(p.x, p.z) < -1.6 + 0.05;
  if (Math.abs(p.x - SB.mid.x) < 4 && p.z >= 556 && p.z <= RV.waterMinZ) return stand(p.x, p.z) < -1.0;
  return false;
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
    // 挂在车上的人 / 担架（§3 ride）跟着车走、不贴地：不查重叠、不查站在担架 / 车身里、不查实心块（x / z 只是备用）
    const Riding = (u) => !!(u.ride && u.ride.on);
    const people = kf.units.filter((u) => PEOPLE.has(u.kind));
    for (const u of people) {
      if (Riding(u)) continue;
      const d = Dist(u, kf.player), limit = u.state === "down" ? C.playerDownM : C.playerM;
      if (d < limit) out.push(`${kf.id} ${u.id} 离玩家 ${R2(d)} m（< ${limit}）`);
    }
    for (let a = 0; a < people.length; a++) for (let c = a + 1; c < people.length; c++) {
      if (Riding(people[a]) || Riding(people[c])) continue;
      if (M(people[a]).tending === people[c].id || M(people[c]).tending === people[a].id) continue;   // 跪在伤员身边照料
      const d = Dist(people[a], people[c]);
      if (d < C.personM) out.push(`${kf.id} ${people[a].id} 和 ${people[c].id} 重叠 ${R2(d)} m（< ${C.personM}）`);
    }
    for (const l of kf.units.filter((u) => u.kind === "litter")) {
      const seg = CarrySegment(l);
      for (const u of people) {
        if (Riding(u) || M(u).onLitter === l.id) continue;
        if (M(u).tending && people.some((p) => p.id === M(u).tending && M(p).onLitter === l.id)) continue;   // 跪在担架边照料上面的人
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
      if (Riding(unit) || (entry.unitFrom && Riding(entry.unitFrom))) continue;   // 挂着的跟车走，没有自己的路线
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
