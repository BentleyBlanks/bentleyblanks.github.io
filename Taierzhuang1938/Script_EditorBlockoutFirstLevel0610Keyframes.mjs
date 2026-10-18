// ===========================================================================
// Script_EditorBlockoutFirstLevel0610Keyframes.mjs —— 第一关 06–10 新剧本白盒（关卡键 FirstLevel0610）的关键帧配置生成器
//
//   node Taierzhuang1938/Script_EditorBlockoutCli.mjs export FirstLevel0610 --force   → Blockout/FirstLevel0610.json
//
// 口径：
//   · 剧本（台词、谁做什么）以 Notion「第一关｜往南的路 · 剧本」06–10 为准；距离、站位以集成负责人 10-18 契约 §3–§4 为准，
//     后者已换算成世界坐标写在 Data_EditorBlockoutFirstLevel0610Space.mjs —— 本文件所有坐标都从那里算，不手抄数字。
//   · 每一拍先让玩家亲眼看到出了什么事，再给一句话的下一步；「掩护」「清理」「护送」不进 next。台词不逐句写进关键帧，只写「此时」。
//   · 坐标 X 向东、Z 向南、米；yawDeg 0 朝北、+90 朝西、−90 朝东、180 朝南（同 Script_EditorBlockoutConfig）。
//
// 走位：同一个人在相邻关键帧里 id 不变；生成时按村里的路网（凹路、主街、小空地、东街、巷子、各道门）自动排 path，
// 不让人直线穿墙；野地里的人走直线。只在新帧出现的人写 path 起点「走进来」，只在旧帧的人写 intent「走出去」。
//
// 摆位检查（push 进 issues，CLI 打出来）：玩家 / 单位出界；玩家站进实心块、单位站进高块（读 Blockout/FirstLevel0610.scene.json，
// 按两帧 signals 算 gates）；两人重叠（< 0.6 m）、人站在担架上；过渡路线穿高块（钻狗洞的妮儿例外）；路线上 1 m 内高差超过 1.2 m（爬坎的例外）。
// 纯函数式生成：不读时钟、不读 git；只在 node 里读场景文件做检查。
// ===========================================================================

import { BLOCKOUT_SCHEMA, PlanTransition, NormalizeBlockout, YawDegFromTo } from "./Script_EditorBlockoutConfig.mjs";
import { BlockStandSampler } from "./Script_EditorBlockoutPrevizPlan.mjs";
import {
  L0610_LEVEL_KEY, L0610_TITLE, L0610_BOUNDS, L0610_PLACES as PL, L0610_LANE, L0610_STREETS as ST, L0610_GENG as G,
  L0610_NEIGHBOR as NB, L0610_EAST_YARDS as EY, L0610_SIGNALS as SIG, L0610_FROM_0105, LanePointAtZ, PointAlong, LineLength, Station,
} from "./Data_EditorBlockoutFirstLevel0610Space.mjs";

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

// ---------------------------------------------------------------------------
// 路网：凹路 + 街 + 巷子 + 各道门；院子 / 屋里 / 干沟是能自由走动的区域，门是区域的出入口。

const GULLY = L0610_FROM_0105.gully;
const DOOR_OUT = 1.3;   // 门两侧各放一个路点，离墙中线这么远
const NET_SNAP_M = 2.6; // 离路中线这么近就算在路上

const NODE = {};
const nodes = [], edges = [], areas = [];
const Node = (name, x, z) => { NODE[name] = nodes.length; nodes.push({ x: R2(x), z: R2(z), name }); return NODE[name]; };
const Edge = (a, b) => edges.push([NODE[a], NODE[b]]);
const Chain = (...names) => { for (let i = 1; i < names.length; i++) Edge(names[i - 1], names[i]); };
const Area = (name, box, ...portals) => areas.push({ name, box, portals: portals.map((n) => NODE[n]) });

// 凹路（从凹路口到村口）
L0610_LANE.line.forEach((p, i) => Node(`Lane${i}`, p.x, p.z));
for (let i = 1; i < L0610_LANE.line.length; i++) Edge(`Lane${i - 1}`, `Lane${i}`);
// 主街、小空地、东街
Node("StreetN", ST.main.x, ST.main.fromZ + 1); Node("StreetAlley", ST.main.x, ST.alleyWest.z); Node("StreetS", ST.main.x, ST.square.box.minZ + 2);
Node("Square", PL.square.x, PL.square.z); Node("EastMouth", ST.east.fromX + 1, ST.east.z); Node("EastEnd", ST.east.toX, ST.east.z);
Chain(`Lane${L0610_LANE.line.length - 1}`, "StreetN", "StreetAlley", "StreetS", "Square", "EastMouth", "EastEnd");
// 巷子 → 邻院小门 → 邻院
Node("AlleyMouth", ST.alleyWest.toX - 1.2, ST.alleyWest.z); Node("AlleyCorner", ST.alleySouth.x, ST.alleyWest.z); Node("AlleyEnd", ST.alleySouth.x, NB.westDoor.z);
Node("NeighborDoorOut", PL.neighborDoor.x - 0.9, NB.westDoor.z); Node("NeighborDoorIn", PL.neighborDoor.x + DOOR_OUT, NB.westDoor.z);
Chain("StreetAlley", "AlleyMouth", "AlleyCorner", "AlleyEnd", "NeighborDoorOut", "NeighborDoorIn");
// 邻院 ↔ 老耿家后院：侧门、狗洞（只有妮儿走）
Node("SideGateW", G.sharedWall.x - DOOR_OUT, G.sideGate.z); Node("SideGateE", G.sharedWall.x + DOOR_OUT, G.sideGate.z);
Node("DogHoleW", G.sharedWall.x - 0.9, G.dogHole.z); Node("DogHoleE", G.sharedWall.x + 0.9, G.dogHole.z);
Edge("SideGateW", "SideGateE"); Edge("DogHoleW", "DogHoleE");
// 老耿家：前门、前屋南门、大门过道、灶屋门、偏屋门、后门
Node("FrontDoorOut", G.frontDoor.x, G.frontRoom.box.minZ - DOOR_OUT); Node("FrontDoorIn", G.frontDoor.x, G.frontRoom.box.minZ + DOOR_OUT);
Node("RoomYardDoorIn", G.roomYardDoor.x, G.frontRoom.box.maxZ - DOOR_OUT); Node("RoomYardDoorOut", G.roomYardDoor.x, G.frontRoom.box.maxZ + DOOR_OUT);
const gateX = (G.carriageGate.minX + G.carriageGate.maxX) / 2;
Node("GateOut", gateX, G.compound.minZ - DOOR_OUT); Node("GateIn", gateX, G.compound.minZ + DOOR_OUT); Node("PassageEnd", gateX, G.sideRoom.box.minZ + 0.8);
// 灶屋 / 偏屋的门都开在院子里侧：门外再放一个「院里」路点，从院子深处过来先到它、再拐进门，不会斜着切到屋角
Node("KitchenDoorOut", G.kitchen.box.maxX + DOOR_OUT, G.kitchen.door.z); Node("KitchenDoorIn", G.kitchen.box.maxX - DOOR_OUT, G.kitchen.door.z);
Node("KitchenDoorYard", G.kitchen.box.maxX + 2.4, G.kitchen.box.maxZ + 1.6);
Node("SideRoomDoorOut", G.sideRoom.box.minX - DOOR_OUT, G.sideRoom.door.z); Node("SideRoomDoorIn", G.sideRoom.box.minX + DOOR_OUT, G.sideRoom.door.z);
Node("SideRoomDoorYard", G.sideRoom.box.minX - 2.6, G.sideRoom.box.maxZ - 1.4);
Node("BackDoorIn", G.backDoor.x, G.compound.maxZ - DOOR_OUT); Node("BackDoorOut", G.backDoor.x, G.compound.maxZ + DOOR_OUT); Node("BackLaneS", ST.backLane.x, ST.backLane.toZ);
Edge("Square", "FrontDoorOut"); Edge("FrontDoorOut", "FrontDoorIn"); Edge("FrontDoorIn", "RoomYardDoorIn"); Edge("RoomYardDoorIn", "RoomYardDoorOut");
Edge("Square", "GateOut"); Chain("GateOut", "GateIn", "PassageEnd");
Chain("KitchenDoorYard", "KitchenDoorOut", "KitchenDoorIn"); Chain("SideRoomDoorYard", "SideRoomDoorOut", "SideRoomDoorIn"); Chain("BackDoorIn", "BackDoorOut", "BackLaneS");
// 区域：干沟（集结处）、小空地、邻院、后院、前屋、灶屋、偏屋、过道
const Box = (minX, maxX, minZ, maxZ) => ({ minX, maxX, minZ, maxZ });
Area("Gully", Box(GULLY.minX, GULLY.maxX + 2, GULLY.minZ, GULLY.maxZ + 1), "Lane0");
Area("Square", Box(ST.square.box.minX + 0.5, ST.square.box.maxX, ST.square.box.minZ, ST.square.box.maxZ), "StreetS", "Square", "EastMouth", "FrontDoorOut", "GateOut");
Area("Neighbor", Box(NB.box.minX + 0.5, NB.box.maxX - 0.3, NB.box.minZ + 0.5, NB.box.maxZ - 0.5), "NeighborDoorIn", "SideGateW", "DogHoleW");
Area("Yard", Box(G.yard.minX + 0.3, G.yard.maxX - 0.5, G.yard.minZ + 0.5, G.yard.maxZ - 0.5), "SideGateE", "DogHoleE", "RoomYardDoorOut", "PassageEnd", "KitchenDoorYard", "SideRoomDoorYard", "BackDoorIn");
Area("FrontRoom", Box(G.frontRoom.box.minX + 0.5, G.frontRoom.box.maxX - 0.5, G.frontRoom.box.minZ + 0.5, G.frontRoom.box.maxZ - 0.5), "FrontDoorIn", "RoomYardDoorIn");
Area("Kitchen", Box(G.kitchen.box.minX + 0.5, G.kitchen.box.maxX - 0.5, G.kitchen.box.minZ + 0.5, G.kitchen.box.maxZ - 0.5), "KitchenDoorIn");
Area("SideRoom", Box(G.sideRoom.box.minX + 0.5, G.sideRoom.box.maxX - 0.5, G.sideRoom.box.minZ + 0.5, G.sideRoom.box.maxZ - 0.5), "SideRoomDoorIn");
Area("Passage", Box(G.carriageGate.minX + 0.2, G.carriageGate.maxX - 0.2, G.compound.minZ + 0.3, G.sideRoom.box.minZ + 1), "GateIn", "PassageEnd");
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
  // 边：把 a / b 的投影点插进去
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
const UNIT_KEY_ORDER = ["id", "side", "kind", "name", "castId", "role", "group", "weapon", "x", "z", "yawDeg", "stance", "aim", "state", "bearers", "arc", "speedMps", "path", "intent", "guess"];

/**
 * 一个单位。at = {x,z}；o：
 *   face {x,z} | yaw   朝向；name / castId / kind / role / group / weapon / stance / aim / down / bearers / arc / speed / guess
 *   from {x,z}|[..]   只在本帧出现：从这里走进来（path 起点）；fromStraight 不走路网
 *   path [..]          显式来路；to / intent 去向（to 沿路网排）；toStraight 直线
 *   straight           上一帧过来走直线（不排路网）
 *   climb              来去要爬坎 / 翻墙（不报高差）；through 钻狗洞（不报穿块）；onRoof 站在房顶上（运行时站不上去，只记）
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
  META.set(u, { straight: !!o.straight, climb: !!o.climb, through: !!o.through, onRoof: !!o.onRoof, explicitPath: !!(o.path || o.from), onLitter: o.onLitter || null });
  return u;
}

const Poi = (id, name, kind, at, radiusM = 2) => ({ id, name, kind, x: R2(at.x), z: R2(at.z), radiusM });
const ArcTo = (from, to, halfDeg, extraM = 6) => ({ halfDeg, rangeM: R1(Dist(from, to) + extraM), yawDeg: Yaw(from, to) });

const POI = {
  assembly: (kind = "landmark") => Poi("Assembly", "集结处（干沟，空了）", kind, PL.assembly, 6),
  gullyRest: () => Poi("GullyRest", "冬瓜躺过的地方", "poi", PL.gullyRest, 1.5),
  laneHead: (kind = "landmark") => Poi("LaneHead", "凹路口", kind, PL.laneHead, 2.5),
  cart: (kind = "poi") => Poi("GengCart", "老耿的驴车", kind, PL.cartStop, 2.5),
  nierRim: () => Poi("NierRim", "妮儿捡弹壳的坎顶", "poi", PL.nierRim, 1.5),
  villageMouth: (kind = "landmark") => Poi("VillageMouth", "村北口", kind, PL.villageMouth, 3),
  mainStreet: (kind = "landmark") => Poi("MainStreet", "主街", kind, Pt(ST.main.x, 425), 4),
  window: (kind = "danger") => Poi("NorthWindow", "北窗（机枪）", kind, PL.northWindow, 2),
  roof: () => Poi("Roof", "房顶（扔手榴弹的）", "danger", G.roofPost, 2),
  river: () => Poi("River", "河汊子（沟帮子陡，车下不去）", "landmark", PL.river, 8),
  eastSide: () => Poi("EastSide", "东头（鬼子来的方向）", "danger", PL.fieldEast, 8),
  alleyMouth: (kind = "poi") => Poi("AlleyMouth", "巷子口", kind, Pt(ST.alleyWest.toX - 1, ST.alleyWest.z), 1.5),
  neighborDoor: (kind = "poi") => Poi("NeighborDoor", "邻院的小门", kind, PL.neighborDoor, 1.5),
  dogHole: (kind = "poi") => Poi("DogHole", "狗洞（大人钻不进）", kind, PL.dogHole, 1),
  crack: (kind = "poi") => Poi("Crack", "墙缝", kind, PL.crack, 1),
  sideGate: (kind = "poi") => Poi("SideGate", "侧门（从里头闩着）", kind, PL.sideGate, 1.5),
  cellar: (kind = "danger") => Poi("Cellar", "地瓜窖", kind, PL.cellar, 2),
  sideRoom: () => Poi("SideRoom", "偏屋", "poi", Pt(114, 486), 2),
  kitchenDoor: (kind = "poi") => Poi("KitchenDoor", "灶屋门", kind, PL.kitchenDoor, 1.2),
  mill: () => Poi("Mill", "石磨（绑着老汉）", "poi", PL.mill, 1.5),
  roomYardDoor: (kind = "poi") => Poi("RoomYardDoor", "前屋南门", kind, PL.roomYardDoor, 1.2),
  roller: (kind = "poi") => Poi("Roller", "石碾", kind, PL.roller, 1.5),
  eastEnd: () => Poi("EastEnd", "东街东头", "danger", PL.eastEnd, 4),
  mortar: () => Poi("Mortar", "掷弹筒（院墙后）", "danger", PL.mortarHide, 4),
  frontDoor: (kind = "poi") => Poi("FrontDoor", "前门", kind, PL.frontDoor, 1.5),
  gate: (kind = "poi") => Poi("CarriageGate", "大门（车道）", kind, PL.carriageGate, 1.5),
  backDoor: (kind = "poi") => Poi("BackDoor", "后门", kind, PL.backDoor, 1.5),
  villageSouth: () => Poi("VillageSouth", "村南口（往北沙河）", "landmark", PL.villageSouth, 3),
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
  Officer: { name: "后送队带队的", kind: "officer", role: "convoyLeader" },
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
  MgGunner: { name: "北窗机枪", role: "machineGun", weapon: "Type11", group: "window" },
  MgLoader: { name: "副射手", role: "loader", group: "window" },
  RoofIja: { name: "房顶扔手榴弹的", role: "grenadier", group: "window" },
  KitchenIja: { name: "灶屋里翻东西的", role: "looter", group: "house" },
  CellarIja1: { name: "拎手榴弹的", role: "grenadier", group: "cellar" },
  CellarIja2: { name: "拿刺刀的", role: "bayonet", group: "cellar" },
  CellarIja3: { name: "拖人的", role: "rifleman", group: "cellar" },
  Mortar1: { name: "掷弹筒", role: "mortar", group: "east" },
  Mortar2: { role: "mortarLoader", group: "east" },
};
const J = (id, at, o = {}) => U(id, "ija", at, { ...(IJA[id] || {}), ...o });

// ---------------------------------------------------------------------------
// 固定站位

const A = PL.assembly;
const CART = Pt(PL.cartStop.x, PL.cartStop.z);
const NIER_RIM = Pt(PL.nierRim.x, PL.nierRim.z);
const MOUTH = Pt(PL.villageMouth.x, PL.villageMouth.z);
const WINDOW = Pt(PL.northWindow.x, PL.northWindow.z);
const MG_AT = Pt(G.mgPost.x, G.mgPost.z), MG_LOADER_AT = Pt(G.mgPost.x - 1.3, G.mgPost.z + 0.6);
const MG_ARC = ArcTo(MG_AT, MOUTH, 5, 6);
const ROOF_AT = Pt(G.roofPost.x, G.roofPost.z);
const KITCHEN_IN = Pt(85.4, 483.8);                    // 灶屋里翻东西的鬼子
const CELLAR = Pt(PL.cellar.x, PL.cellar.z);
const MILL_MAN = Pt(G.mill.x + 0.9, G.mill.z + 0.7);   // 反绑在石磨上的老汉（倒在磨边）
const SIDE_ROOM_IN = Pt(114.5, 486);
const ROLLER = Pt(PL.roller.x, PL.roller.z);
const PRONE_AT_ROLLER = Pt(PL.roller.x - 2.2, PL.roller.z + 0.9);   // 石碾后头趴着朝东（视线从碾子北边过去）
const CORNER_N = Pt(ST.east.fromX - 1.6, ST.east.z - ST.east.halfW - 1.8);   // 东街口北角（班长顶着）
const CORNER_S = Pt(ST.east.fromX - 1.4, ST.east.z + ST.east.halfW + 1.9);   // 东街口南角
// 08 村口藏身：凹路尽头的坡道里
const MOUTH_HIDE = Pt(PL.laneEnd.x, PL.laneEnd.z);
const GUARDS_08 = Object.freeze({
  Luo: Pt(98.2, 381.4), Yaowa: Pt(101.8, 381.6), HeYoutian: Pt(97.1, 379.2), LiuWencai: Pt(102.9, 379.4),
  Squad1: Pt(99.0, 377.0), Squad2: Pt(101.2, 376.6), Squad3: Pt(103.5, 377.6), Officer: Pt(96.0, 377.6),
});
// 后送队停成一长溜（07 起不动；10-3 队头才进村）
const COLUMN_FROM_Z = 186, COLUMN_TO_Z = 372, COLUMN_SLOTS = 36;
const DONGGUA_Z = 232;
function ColumnSlots() {
  const out = [];
  const step = (COLUMN_TO_Z - COLUMN_FROM_Z) / (COLUMN_SLOTS - 1);
  for (let i = 0; i < COLUMN_SLOTS; i++) {
    const z = COLUMN_FROM_Z + step * i;
    const lat = i % 2 ? 1.25 : -1.25;   // 贴路两边停，中间留给往前挤的小队
    out.push({ i, z, lat, kind: i % 3 === 0 ? "litter" : "walker", helper: i % 6 === 4 });
  }
  return out;
}
const SLOTS = ColumnSlots();
const HELPER_LAT_IN = 0.7;   // 架着伤员的人站在伤员里侧（路中线那边）
/** 小队往前挤时站路中线（|lat| ≤ 0.3）；z 避开架人的那几个槽位（他们站得靠里）。 */
function SqueezeZ(z) {
  for (const s of SLOTS) {
    const keep = s.helper || s.kind === "litter" ? 1.0 : 0;   // 架人的站得靠里；担架中心 1 m 内不站人
    if (keep && Math.abs(s.z - z) < keep) return s.z + (z >= s.z ? keep : -keep);
  }
  return z;
}
const LS = (z, lat = 0) => LZ(SqueezeZ(z), Math.max(-0.3, Math.min(0.3, lat)));
const DONGGUA_SLOT = SLOTS.reduce((best, s) => (Math.abs(s.z - DONGGUA_Z) < Math.abs(best.z - DONGGUA_Z) ? s : best), SLOTS[0]);
/** 后送队：担架（抬着、停住）、走着的伤员（蹲着）、架着伤员的人。exclude：这些槽位的人这一帧挪走了。 */
function Column({ exclude = new Set(), heading = 180 } = {}) {
  const out = [];
  let litters = 0, walkers = 0, helpers = 0;
  for (const s of SLOTS) {
    if (s === DONGGUA_SLOT) continue;
    const p = LZ(s.z, s.lat);
    if (s.kind === "litter") {
      litters++;
      if (exclude.has(`Litter${String(litters).padStart(2, "0")}`)) continue;
      out.push(N(`Litter${String(litters).padStart(2, "0")}`, p, { kind: "litter", name: litters === 1 ? "担架" : undefined, yaw: heading, group: "convoy", straight: true, speed: 1.2 }));
    } else {
      walkers++;
      const wid = `Walker${String(walkers).padStart(2, "0")}`;
      if (!exclude.has(wid)) out.push(N(wid, p, { role: "walkingWounded", group: "convoy", yaw: heading, stance: "crouch", straight: true, speed: 1.0 }));
      if (s.helper) {
        helpers++;
        const hid = `Helper${String(helpers).padStart(2, "0")}`;
        if (!exclude.has(hid)) out.push(N(hid, LZ(s.z, s.lat - Math.sign(s.lat) * HELPER_LAT_IN), { role: "helper", group: "convoy", face: p, straight: true, speed: 1.0 }));
      }
    }
  }
  return out;
}
const DONGGUA_LITTER = LZ(DONGGUA_SLOT.z, DONGGUA_SLOT.lat);
/** 冬瓜那副担架放在地上（bearers 0），冬瓜躺在上面（倒地姿态横着，要顺着担架躺就比担架转 90°）。 */
const DongguaOnLitter = (at, { bearers = 0, yaw = 180, extra = {} } = {}) => [
  N("LitterDonggua", at, { kind: "litter", name: "冬瓜的担架", bearers, yaw, group: "convoy", speed: 1.2, ...extra }),
  N("Donggua", at, { down: true, onLitter: "LitterDonggua", speed: 1.2, yaw: R1((((yaw + 90) + 540) % 360) - 180), ...extra }),
];
// 东头来的鬼子（10-2 起）
const EAST_IJA = Object.freeze([
  ["EastIja1", Pt(190, 464.8), { stance: "prone", aim: true }], ["EastIja2", Pt(205, 465.8), { stance: "crouch", aim: true }],
  ["EastIja3", Pt(176, 461.0), { climb: true }], ["EastIja4", Pt(168, 470.6), { climb: true }],
  ["EastIja5", Pt(212, 458.4), { climb: true, stance: "crouch" }], ["EastIja6", Pt(226, 471.2), { climb: true }], ["EastIja7", Pt(231.2, 465.6), {}],
]);
const EastIja = (o = {}) => [
  ...EAST_IJA.map(([id, p, e]) => J(id, p, { role: "rifleman", group: "east", face: ROLLER, straight: true, guess: true, ...e, ...o })),
  J("Mortar1", Pt(PL.mortarHide.x, PL.mortarHide.z), { stance: "crouch", face: ROLLER, straight: true, guess: true }),
  J("Mortar2", Pt(PL.mortarHide.x + 1.4, PL.mortarHide.z + 0.7), { stance: "crouch", face: ROLLER, straight: true, guess: true }),
];

// ---------------------------------------------------------------------------
// 关键帧

function Keyframes() {
  const K = [];
  const Add = (kf) => K.push(kf);

  // ======================= 06 回到集结处 =======================
  const s06 = { stage: 6, stageTitle: "回到集结处" };
  const p61 = Pt(35, 147);
  Add({
    id: "06-1", ...s06, name: "回到干沟",
    player: { x: p61.x, z: p61.z, yawDeg: -90, pitchDeg: -4, stance: "stand" },
    what: "从坡道下到干沟：集结处空了，冬瓜不在。何有田：头一趟就抬走了。",
    next: { text: "去凹路口", x: PL.laneHead.x - 1, z: PL.laneHead.z - 1.5, radiusM: 3 },
    how: ["冬瓜躺过的地方只剩血迹和扔下的绷带", "最后两副担架正往东南头的凹路抬", "凹路口停着一辆驴车", "何有田答话时没回头"],
    notes: "05-4 的人原样下到干沟。沟底的血迹 / 绷带 / 空水壶是场景摆件。妮儿已经在北岸坎顶上捡弹壳（12 m 外，顺子这时不一定注意到）。",
    signals: [],
    units: [
      N("Luo", Off(p61, 2.6, -0.9), { yaw: -90 }),
      N("Yaowa", Off(p61, 1.4, 1.6), { face: PL.gullyRest }),
      N("HeYoutian", Off(p61, 3.9, 1.3), { yaw: -80 }),
      N("LiuWencai", Off(p61, 4.6, -0.4), { yaw: -90 }),
      N("Squad1", Off(p61, -1.6, 1.8), { yaw: -90, guess: true }),
      N("Squad2", Off(p61, 5.8, 1.9), { yaw: -90, guess: true }),
      N("Squad3", Off(p61, -2.4, -0.6), { yaw: -90, guess: true }),
      N("Litter01", Pt(50, 151), { kind: "litter", name: "担架", yaw: Yaw(Pt(50, 151), PL.laneHead), group: "convoy", to: LZ(175) }),
      N("Litter02", Pt(44, 153.4), { kind: "litter", yaw: Yaw(Pt(44, 153.4), PL.laneHead), group: "convoy", to: LZ(175) }),
      C("GengCart", CART, { yaw: PL.cartStop.yawDeg, straight: true }),
      C("Geng", Off(CART, -1.2, -1.4), { face: CART }),
      C("Nier", NIER_RIM, { stance: "crouch", yaw: 170, climb: true }),
    ],
    pois: [POI.assembly(), POI.gullyRest(), POI.laneHead("objective"), POI.cart("landmark")],
  });

  const p62 = Pt(58, 153);
  Add({
    id: "06-2", ...s06, name: "凹路口的驴车",
    player: { x: p62.x, z: p62.z, yawDeg: Yaw(p62, CART), pitchDeg: -2, stance: "stand" },
    what: "老耿的驴车停在凹路口，车上还剩几箱弹药；坎顶上妮儿在捡弹壳，何有田喊她没反应，老耿爬上去拍她肩膀。",
    next: { text: "等传令兵" },
    how: ["车被征来拉弹药，撤的时候车上还剩几箱", "何有田冲坎上喊「女娃子，让一哈！」", "妮儿没反应，老耿拍她肩膀她才抬头", "转头往北看坎顶"],
    notes: "妮儿在干沟北岸坎顶（契约 (50,140.5)），老耿从坎下爬上去（爬 2.5 m 的坎，标 climb）。玩家朝东看车，妮儿在左后方 12 m 的坎顶上——要转头。不交代她为什么听不见。",
    signals: [],
    units: [
      N("Luo", Off(p62, 2.4, -1.4), { face: p62 }),
      N("Yaowa", Off(p62, -1.6, -1.8), { face: NIER_RIM }),
      N("HeYoutian", Pt(52.5, 143.4), { face: NIER_RIM }),
      N("LiuWencai", Off(p62, 3.6, 1.2), { face: CART }),
      N("Squad1", Off(p62, -3.4, 0.6), { face: NIER_RIM, guess: true }),
      N("Squad2", Off(p62, -0.4, 2.0), { face: CART, guess: true }),
      N("Squad3", Off(p62, -5.2, -1.2), { yaw: -90, guess: true }),
      N("Litter01", LZ(172, 0.6), { kind: "litter", group: "convoy", speed: 1.2 }),
      N("Litter02", Pt(63.5, 154.7), { kind: "litter", yaw: -90, group: "convoy", speed: 1.2 }),
      C("GengCart", CART, { yaw: PL.cartStop.yawDeg, straight: true }),
      C("Geng", Off(NIER_RIM, 0.9, -0.5), { face: NIER_RIM, stance: "crouch", climb: true }),
      C("Nier", NIER_RIM, { stance: "crouch", yaw: 170, climb: true }),
    ],
    pois: [POI.cart("poi"), POI.nierRim(), POI.laneHead("landmark")],
  });

  // 06-3：传令兵从凹路跑来报信；老耿第一个赶车往南
  // 凹路从干沟东南角往东这一截中线在 z≈154.8、路底 z 152.8…156.8：人都摆在路底里
  const p63 = Pt(70, 156);
  const cart63 = Pt(77.5, 155.2);
  const runner63 = Pt(73.4, 155.6);
  Add({
    id: "06-3", ...s06, name: "往南赶",
    player: { x: p63.x, z: p63.z, yawDeg: Yaw(p63, runner63), pitchDeg: -2, stance: "stand" },
    what: "传令兵从凹路跑来：后送队在南边停了，前头耿家庄在响枪。老耿朝南看了好一会儿，第一个赶车往南。",
    next: { text: "跟着车进凹路", x: LZ(172).x, z: LZ(172).z, radiusM: 3 },
    how: ["传令兵边跑边喊", "老耿手上的活停了，朝南看", "车先走，全班跟着最后两副担架", "车上那几箱弹药跟着车走了（CartDeparted）"],
    notes: "车一走，车上的弹药箱体块随信号 CartDeparted 收掉（编辑器没有「块跟着单位」的能力）。妮儿跟在车边走。",
    signals: [SIG.cartDeparted],
    units: [
      N("Runner", runner63, { face: Off(p63, 1.2, -1.2), from: LZ(185), speed: 3.2 }),
      N("Luo", Pt(71.2, 154.0), { face: runner63 }),
      N("Yaowa", Pt(68.6, 154.6), { face: runner63 }),
      N("HeYoutian", Pt(67.4, 155.9), { face: runner63 }),
      N("LiuWencai", Pt(72.6, 153.4), { face: runner63 }),
      N("Squad1", Pt(65.8, 154.2), { yaw: -90, guess: true }),
      N("Squad2", Pt(66.6, 156.3), { yaw: -90, guess: true }),
      N("Squad3", Pt(64.4, 155.4), { yaw: -90, guess: true }),
      N("Litter01", LZ(178, 0.6), { kind: "litter", group: "convoy", speed: 1.2 }),
      N("Litter02", LZ(166, -0.6), { kind: "litter", group: "convoy", speed: 1.2 }),
      C("GengCart", cart63, { yaw: -90, straight: true, speed: 1.6 }),
      C("Geng", Pt(80.1, 154.1), { yaw: -90, climb: true }),
      C("Nier", Pt(75.9, 156.5), { yaw: -90, climb: true }),
    ],
    pois: [POI.laneHead("landmark"), POI.cart("poi"), POI.villageMouth("landmark")],
  });

  // ======================= 07 沿着后送队往前走 =======================
  const s07 = { stage: 7, stageTitle: "沿着后送队往前走" };
  const cartTail = LZ(181, 0.2);
  const p71 = LZ(195, -0.4);
  /** 小队在凹路里往前挤：都走路中线（担架和伤员停在两边）。 */
  const SquadInLane = (z) => [
    N("Luo", LS(z + 3.2, 0.3), { yaw: 180 }),
    N("Yaowa", LS(z - 1.8, 0.25), { yaw: 180 }),
    N("HeYoutian", LS(z - 3.4, -0.3), { yaw: 180 }),
    N("LiuWencai", LS(z + 1.2, -0.3), { yaw: 180 }),
    N("Squad1", LS(z - 5.6, 0.2), { yaw: 180, guess: true }),
    N("Squad2", LS(z - 7.4, -0.25), { yaw: 180, guess: true }),
    N("Squad3", LS(z - 9.2, 0.1), { yaw: 180, guess: true }),
  ];
  const officerHead = LS(374.5, -0.2);
  Add({
    id: "07-1", ...s07, name: "队尾",
    player: { x: p71.x, z: p71.z, yawDeg: 180, pitchDeg: -3, stance: "stand" },
    what: "凹路里后送队停成一长溜：躺担架的、被人背着的、互相架着走的。小队从队尾往前挤。",
    next: { text: "往队头挤", x: LZ(DONGGUA_Z - 6).x, z: LZ(DONGGUA_Z - 6).z, radiusM: 3 },
    how: ["整条路都是人，一直望到南边", "打仗时这些人全藏在沟里不动，这会儿才让玩家看清有多少", "老耿的车挤不过去，停在队尾", "凹路两壁比人高"],
    notes: `后送队 ${SLOTS.filter((s) => s.kind === "litter").length} 副担架、${SLOTS.filter((s) => s.kind !== "litter").length} 个走着的伤员（其中 ${SLOTS.filter((s) => s.helper).length} 个有人架着），`
      + "从 z 186 停到 z 372；「被人背着的」编辑器没有这种姿态，用蹲着的伤员 + 旁边架着的人顶替。契约队尾 (86,195)，凹路中线在 x 80.5，玩家站路中线西侧。",
    signals: [SIG.cartDeparted],
    units: [
      ...SquadInLane(195),
      N("Runner", LS(203.5, 0), { yaw: 180, to: LZ(300), speed: 3.2 }),
      ...Column(),
      ...DongguaOnLitter(DONGGUA_LITTER),
      N("Medic", Off(DONGGUA_LITTER, -1.1, 0.3), { face: DONGGUA_LITTER, stance: "crouch" }),
      N("Officer", officerHead, { yaw: 180, stance: "crouch" }),
      C("GengCart", cartTail, { yaw: 180, straight: true, speed: 1.6 }),
      C("Geng", Off(cartTail, -1.6, -1.8), { yaw: 180 }),
      C("Nier", Off(cartTail, 1.5, -2.2), { yaw: 180 }),
    ],
    pois: [POI.villageMouth("landmark"), Poi("ColumnHead", "队头", "poi", officerHead, 3)],
  });

  const p72 = Off(DONGGUA_LITTER, -1.7, -0.3);   // 站在担架西边（路中线），小队在身后往北排
  Add({
    id: "07-2", ...s07, name: "找到冬瓜",
    player: { x: p72.x, z: p72.z, yawDeg: Yaw(p72, DONGGUA_LITTER), pitchDeg: -24, stance: "stand" },
    what: "担架里找到冬瓜：裹着那床单被一直在抖。掀开被角，肚子上塞着一条浸透血的毛巾。卫生兵：天黑前送不到军医手里，就表想了。",
    next: { text: "接着往前挤", x: LZ(290).x, z: LZ(290).z, radiusM: 3 },
    how: ["担架放在路边，卫生兵蹲在旁边", "按键掀被角", "冬瓜「表掀……冷得很」", "卫生兵说完就去看下一个"],
    notes: "担架放在地上（litter bearers 0）、冬瓜躺在上面；抬他的两个人蹲在路边歇（Walker 里的两个顶替）。",
    signals: [SIG.cartDeparted],
    units: [
      ...SquadInLane(DONGGUA_Z - 8),
      ...Column(),
      ...DongguaOnLitter(DONGGUA_LITTER),
      N("Medic", Off(DONGGUA_LITTER, 1.1, 0.5), { face: DONGGUA_LITTER, stance: "crouch" }),
      N("Officer", officerHead, { yaw: 180, stance: "crouch" }),
      C("GengCart", cartTail, { yaw: 180, straight: true }),
      C("Geng", Off(cartTail, -1.6, -1.8), { yaw: 180 }),
      C("Nier", Off(cartTail, 1.5, -2.2), { yaw: 180 }),
    ],
    pois: [Poi("DongguaLitter", "冬瓜的担架", "objective", DONGGUA_LITTER, 1.5), POI.villageMouth("landmark")],
  });

  const p73 = LS(290, -0.3);
  const yaowa73 = LS(289.0, 0.3);
  Add({
    id: "07-3", ...s07, name: "数铜板",
    player: { x: p73.x, z: p73.z, yawDeg: R1(p73.heading), pitchDeg: -10, stance: "stand" },
    what: "边走边摸出钱袋数铜板。幺娃凑过来：数来做啥子？一句句问出他要跑、要回去救我妹。",
    next: { text: "挤到队头", x: LZ(368).x, z: LZ(368).z, radiusM: 3 },
    how: ["边走边说，幺娃在左手边", "前头村子的枪声时有时无", "天上飞机飞过去", "幺娃最后：「……我没听到。」"],
    notes: "台词在 Notion 07（路费 / 他舅在船上烧锅炉 / 我妹十二 / 卖你妈个锤子），不逐句进关键帧。幺娃并排走在顺子东边、略后。",
    signals: [SIG.cartDeparted],
    units: [
      N("Yaowa", yaowa73, { face: p73 }),
      N("Luo", LS(296, 0.2), { yaw: 180 }),
      N("HeYoutian", LS(286, -0.3), { yaw: 180 }),
      N("LiuWencai", LS(293.5, -0.2), { yaw: 180 }),
      N("Squad1", LS(283.6, 0.3), { yaw: 180, guess: true }),
      N("Squad2", LS(281.8, -0.3), { yaw: 180, guess: true }),
      N("Squad3", LS(279.5, 0.1), { yaw: 180, guess: true }),
      ...Column(),
      ...DongguaOnLitter(DONGGUA_LITTER),
      N("Medic", LZ(DONGGUA_Z + 14, 1.1), { stance: "crouch", yaw: 180 }),
      N("Officer", officerHead, { yaw: 180, stance: "crouch" }),
      C("GengCart", cartTail, { yaw: 180, straight: true }),
      C("Geng", Off(cartTail, -1.6, -1.8), { yaw: 180 }),
      C("Nier", Off(cartTail, 1.5, -2.2), { yaw: 180 }),
    ],
    pois: [POI.villageMouth("landmark"), Poi("ColumnHead", "队头", "poi", officerHead, 3)],
  });

  const p74 = LS(369, -0.3);
  Add({
    id: "07-4", ...s07, name: "队头",
    player: { x: p74.x, z: p74.z, yawDeg: 180, pitchDeg: 0, stance: "stand" },
    what: "挤到队头，前头就是耿家庄，一阵一阵响枪。往南的路要穿过村里那条主街。",
    next: { text: "到村口", x: MOUTH_HIDE.x, z: MOUTH_HIDE.z, radiusM: 2.5 },
    how: ["带队的蹲在队头不敢往前", "村北口就在凹路尽头", "枪声从村里来"],
    notes: "",
    signals: [SIG.cartDeparted],
    units: [
      N("Luo", LS(372.4, 0.3), { yaw: 180 }),
      N("Yaowa", LS(367.2, 0.3), { yaw: 180 }),
      N("HeYoutian", LS(365.0, -0.3), { yaw: 180 }),
      N("LiuWencai", LS(370.8, -0.3), { yaw: 180 }),
      N("Squad1", LS(363.2, 0.2), { yaw: 180, guess: true }),
      N("Squad2", LS(361.4, -0.3), { yaw: 180, guess: true }),
      N("Squad3", LS(359.4, 0.1), { yaw: 180, guess: true }),
      N("Officer", officerHead, { face: MOUTH, stance: "crouch" }),
      ...Column(),
      ...DongguaOnLitter(DONGGUA_LITTER),
      N("Medic", LZ(DONGGUA_Z + 14, 1.1), { stance: "crouch", yaw: 180 }),
      C("GengCart", cartTail, { yaw: 180, straight: true }),
      C("Geng", Off(cartTail, -1.6, -1.8), { yaw: 180 }),
      C("Nier", Off(cartTail, 1.5, -2.2), { yaw: 180 }),
    ],
    pois: [POI.villageMouth("objective"), POI.mainStreet("landmark")],
  });

  // ======================= 08 村口 =======================
  const s08 = { stage: 8, stageTitle: "村口" };
  const Villagers08 = () => [
    C("Villager1", Pt(98.6, 383.2), { name: "滚进沟里的村民", stance: "crouch", face: MOUTH_HIDE, from: Pt(99.2, 396), fromStraight: true }),
    C("Villager2", Pt(100.8, 412), { down: true, yaw: 20, from: Pt(100.4, 428), fromStraight: true }),
    C("Villager3", Pt(99.2, 437), { down: true, yaw: -30, from: Pt(99.6, 445), fromStraight: true }),
    C("Villager4", Pt(101.6, 396), { yaw: 0, to: Pt(102.4, 376), toStraight: true, speed: 2.4, from: Pt(101.4, 420), fromStraight: true }),
    C("Villager5", Pt(98.4, 405), { yaw: 0, to: Pt(97.2, 377), toStraight: true, speed: 2.4, from: Pt(98.8, 430), fromStraight: true }),
  ];
  const WindowGroup = (o = {}) => [
    J("MgGunner", MG_AT, { yaw: 0, stance: "crouch", aim: true, arc: MG_ARC, ...o }),
    J("MgLoader", MG_LOADER_AT, { yaw: 0, stance: "crouch", ...o }),
    J("RoofIja", ROOF_AT, { yaw: 0, onRoof: true, ...o }),
  ];
  const HouseIja = () => [J("KitchenIja", KITCHEN_IN, { yaw: 120, stance: "crouch" })];
  // 地瓜窖那伙：08 在院里翻东西、围着窖口；一家人还在窖里
  // 地瓜窖那伙：拎手榴弹的在窖口北边、拿刺刀的在西边、拖人的在东边；一家人在窖里（标 climb：窖坑 2 m 深）
  const FamilyInCellar = () => [
    C("CellarMan", Off(CELLAR, -0.5, -0.5), { stance: "crouch", yaw: 0, climb: true }),
    C("CellarWife", Off(CELLAR, 0.5, -0.4), { stance: "crouch", yaw: 0, climb: true }),
    C("CellarGranny", Off(CELLAR, 0, 0.4), { stance: "crouch", yaw: 0, climb: true }),
  ];
  const CellarGroup08 = () => [
    J("CellarIja1", Off(CELLAR, -1.0, -2.4), { face: CELLAR }),
    J("CellarIja2", Off(CELLAR, 2.3, -0.9), { face: CELLAR, aim: true }),
    J("CellarIja3", Off(CELLAR, -2.1, 2.1), { face: CELLAR }),
    ...FamilyInCellar(),
  ];
  const MillMan = () => [C("MillOldMan", MILL_MAN, { down: true, yaw: 60 })];
  const Guards08 = (faces = {}) => Object.entries(GUARDS_08).map(([id, p]) => N(id, p, {
    stance: "crouch", face: faces[id] || WINDOW, aim: !faces[id] && ["Luo", "LiuWencai", "Squad1", "Squad2", "Squad3"].includes(id), guess: id.startsWith("Squad"),
  }));
  const geng08 = Pt(103.4, 378.6), nier08 = Pt(104.4, 377.4);
  Add({
    id: "08-1", ...s08, name: "村口",
    player: { x: MOUTH_HIDE.x, z: MOUTH_HIDE.z, yawDeg: 180, pitchDeg: 0, stance: "crouch" },
    what: "几个村民从主街往村外跑，街那头一扇窗口里机枪打出来，倒下一个；剩下的一个滚进我们藏身的沟里。",
    next: { text: "看清怎么过" },
    how: ["窗口的机枪顺着街扫", "村民倒在街上", "滚进来的那个：「东头……过来的……进庄了……」", "后送队全藏在凹路里不动"],
    notes: "北窗 (97,470) 正对主街 x 97…103，从村口 90 m 外看得见窗口（场景生成器核过视线）。鬼子 08 已在老耿家：窗口机枪组 2、房顶 1、灶屋 1、地瓜窖那伙 3（一家人还在窖里）。"
      + "房顶的鬼子：编辑器演员只能站在 ≤1 m 高的块顶，3.5 m 的房顶站不上去，位置先记在房顶坐标（运行时他会站在屋里地面上）。",
    signals: [SIG.cartDeparted],
    units: [
      ...Guards08(),
      C("Geng", geng08, { face: WINDOW }),
      C("Nier", nier08, { stance: "crouch", face: geng08 }),
      ...Villagers08(),
      ...WindowGroup(),
      ...HouseIja(),
      ...CellarGroup08(),
      ...MillMan(),
      ...Column(),
      ...DongguaOnLitter(DONGGUA_LITTER),
      N("Medic", LZ(DONGGUA_Z + 14, 1.1), { stance: "crouch", yaw: 180 }),
      C("GengCart", LZ(369, 1.1), { yaw: 180, straight: true }),
    ],
    pois: [POI.window("danger"), POI.roof(), POI.mainStreet("landmark"), POI.villageMouth("landmark")],
  });

  const geng82 = Pt(99.4, 378.8);
  Add({
    id: "08-2", ...s08, name: "绕不过去",
    player: { x: MOUTH_HIDE.x, z: MOUTH_HIDE.z, yawDeg: 180, pitchDeg: 0, stance: "crouch" },
    what: "老耿盯着窗口：那是俺家。东边是鬼子来的方向，西边河汊子车下不去；班长：等天黑摸进去。顺子：等天黑冬瓜就没了！",
    next: { text: "找别的路" },
    how: ["带队的想往西绕，老耿说沟帮子陡、车下不去", "担架能一副一副往沟里顺，可这么多副，天黑都过不完", "班长看了看窗口和房顶：硬冲就是送死", "07 卫生兵刚说过：天黑前送不到就表想了"],
    notes: "河汊子在村西 x 10…28、深 3 m；东边 x 235 外是开阔麦地。",
    signals: [SIG.cartDeparted],
    units: [
      ...Guards08({ Luo: geng82, Officer: geng82, Yaowa: geng82 }),
      C("Geng", geng82, { face: GUARDS_08.Luo }),
      C("Nier", Off(geng82, 1.3, 0.9), { stance: "crouch", face: geng82 }),
      ...Villagers08().filter((u) => !u.id.match(/Villager[45]/)),
      ...WindowGroup(),
      ...HouseIja(),
      ...CellarGroup08(),
      ...MillMan(),
      ...Column(),
      ...DongguaOnLitter(DONGGUA_LITTER),
      N("Medic", LZ(DONGGUA_Z + 14, 1.1), { stance: "crouch", yaw: 180 }),
      C("GengCart", LZ(369, 1.1), { yaw: 180, straight: true }),
    ],
    pois: [POI.window("danger"), POI.river(), POI.eastSide(), POI.villageMouth("landmark")],
  });

  // 08-3：老耿给妮儿比划，她钻进巷子；幺娃拽住顺子
  const geng83 = Pt(97.6, 382.0), nier83 = Pt(96.4, 382.8), yaowa83 = Pt(99.3, 379.1);
  const NIER_ALLEY = [Pt(ST.alleyWest.toX - 1.0, ST.alleyWest.z), Pt(ST.alleySouth.x, ST.alleyWest.z), Pt(ST.alleySouth.x, NB.westDoor.z), Pt(PL.neighborDoor.x + 1.2, NB.westDoor.z)];
  Add({
    id: "08-3", ...s08, name: "老耿比划",
    player: { x: MOUTH_HIDE.x, z: MOUTH_HIDE.z, yawDeg: Yaw(MOUTH_HIDE, nier83), pitchDeg: -8, stance: "crouch" },
    what: "狗洞大人钻不进、侧门从里头闩着。老耿蹲下来给妮儿比划：钻洞、拔门闩、马上出来。她点点头钻进巷子。幺娃一把拽住顺子。",
    next: { text: "去侧门外等着", x: PL.sideGate.x - 1.0, z: PL.sideGate.z, radiusM: 2.5 },
    how: ["老耿比划的手在抖", "妮儿盯着他的手，点点头", "班长：「我这儿一杆枪都抽不出来，你一个人去。」", "幺娃：「顺儿哥，你龟儿疯了嗦？」"],
    notes: "妮儿的去向：主街西侧巷子口 (96,398) → 往西 → 沿 x 58.75 往南 → 邻院西墙的小门 (60,490)。班长他们在街口一直朝窗口打，把机枪和房顶的鬼子吸住。",
    signals: [SIG.cartDeparted],
    units: [
      ...Guards08().filter((u) => u.id !== "Yaowa"),
      N("Yaowa", yaowa83, { face: MOUTH_HIDE }),
      C("Geng", geng83, { stance: "crouch", face: nier83 }),
      C("Nier", nier83, { stance: "crouch", face: geng83, to: NIER_ALLEY, toStraight: true, speed: 1.8 }),
      ...Villagers08().filter((u) => !u.id.match(/Villager[45]/)),
      ...WindowGroup(),
      ...HouseIja(),
      ...CellarGroup08(),
      ...MillMan(),
      ...Column(),
      ...DongguaOnLitter(DONGGUA_LITTER),
      N("Medic", LZ(DONGGUA_Z + 14, 1.1), { stance: "crouch", yaw: 180 }),
      C("GengCart", LZ(369, 1.1), { yaw: 180, straight: true }),
    ],
    pois: [POI.alleyMouth("objective"), POI.dogHole("poi"), POI.sideGate("poi"), POI.window("danger")],
  });

  // ======================= 09 摸进老耿家 =======================
  const s09 = { stage: 9, stageTitle: "摸进老耿家" };
  const p91 = Pt(ST.alleySouth.x, 440);
  const nier91 = Pt(ST.alleySouth.x + 0.3, 486.5);
  // 街口的人 09–10 一直在那里朝窗口打（09 不动）
  const Guards09 = () => Guards08().filter((u) => !["Officer"].includes(u.id)).concat([N("Officer", GUARDS_08.Officer, { stance: "crouch", face: WINDOW, kind: "officer" })]);
  const geng09 = Pt(97.0, 380.4);
  const CellarShout = () => [
    J("CellarIja1", Off(CELLAR, -0.8, -2.2), { face: CELLAR, name: "拎手榴弹在窖口吼的" }),
    J("CellarIja2", Off(CELLAR, 2.1, -0.7), { face: CELLAR, aim: true }),
    J("CellarIja3", Off(CELLAR, -1.9, 1.9), { face: CELLAR }),
    ...FamilyInCellar(),
  ];
  const ConvoyWaits = () => [...Column(), ...DongguaOnLitter(DONGGUA_LITTER), N("Medic", LZ(DONGGUA_Z + 14, 1.1), { stance: "crouch", yaw: 180 }), C("GengCart", LZ(369, 1.1), { yaw: 180, straight: true })];
  Add({
    id: "09-1", ...s09, name: "巷子",
    player: { x: p91.x, z: p91.z, yawDeg: 180, pitchDeg: 0, stance: "crouch" },
    what: "一个人顺着巷子往邻院摸：机枪响就挪一段、一停就贴墙不动。院子那头有鬼子在吼「出来！」，地底下有人在哭。",
    next: { text: "去邻院", x: PL.neighborDoor.x + 1.5, z: NB.westDoor.z, radiusM: 2 },
    how: ["街口班长他们一打，窗口的机枪就回一梭子", "巷子两边都是院墙，又窄又直", "只听得见，看不见", "妮儿先到了邻院小门口"],
    notes: "惨剧拆成三下，都隔着墙和缝，玩家开不了枪：这是第一下（只有声音）。",
    signals: [SIG.cartDeparted],
    units: [
      C("Nier", nier91, { stance: "crouch", face: Pt(PL.neighborDoor.x, NB.westDoor.z) }),
      ...Guards09(), C("Geng", geng09, { face: WINDOW }),
      ...WindowGroup(), ...HouseIja(), ...CellarShout(), ...MillMan(),
      ...ConvoyWaits(),
    ],
    pois: [POI.neighborDoor("objective"), POI.cellar("danger"), POI.window("landmark")],
  });

  // 09-2：邻院，贴着墙缝看：窖里的人被逼出来，汉子被刺刀捅倒
  const crackEye = (() => {
    const target = CELLAR, dir = Dist({ x: G.sharedWall.x, z: G.crack.z }, target);
    return Pt(G.sharedWall.x - 0.9 * (target.x - G.sharedWall.x) / dir, G.crack.z - 0.9 * (target.z - G.crack.z) / dir);
  })();
  const nier92 = Pt(G.sharedWall.x - 1.0, G.dogHole.z - 0.6);
  const MAN_BODY = Off(CELLAR, 2.5, -1.3);   // 汉子从东边爬出来就被捅倒（离窖沿 1.3 m，倒地的人会往身边最低处滑，别贴着坑沿）
  const wife92 = Off(CELLAR, -0.9, 2.3), ija3At92 = Off(CELLAR, -1.6, 2.7);
  const CellarOut = () => [
    J("CellarIja1", Off(CELLAR, -1.1, -2.6), { face: CELLAR, name: "拎手榴弹在窖口晃的" }),
    J("CellarIja2", Off(CELLAR, 3.5, -0.6), { face: MAN_BODY, aim: true }),
    J("CellarIja3", ija3At92, { face: wife92 }),
    C("CellarMan", MAN_BODY, { down: true, yaw: 100, climb: true }),
    C("CellarWife", wife92, { face: ija3At92, climb: true }),
    C("CellarGranny", Off(CELLAR, 1.4, 1.4), { yaw: 30, stance: "crouch", climb: true }),
  ];
  Add({
    id: "09-2", ...s09, name: "墙缝",
    player: { x: crackEye.x, z: crackEye.z, yawDeg: Yaw(crackEye, CELLAR), pitchDeg: -4, stance: "stand" },
    what: "隔墙的缝里：一个鬼子拎着手榴弹在窖口上晃，窖里的人举着手一个个往外爬：汉子、年轻媳妇、抱襁褓的老太太。汉子刚爬出来就被刺刀捅倒。",
    next: { text: "去侧门", x: G.sharedWall.x - 1.0, z: G.sideGate.z, radiusM: 1.5 },
    how: ["缝只有一指宽，眼要贴上去", "只看得见窖口那一小片", "顺子还得往侧门挪，视线断了", "妮儿蹲在狗洞边等机枪响"],
    notes: `墙缝 z ${G.crack.z}、宽 ${G.crack.w} m；眼在缝后 0.9 m、对着窖口中心，场景生成器核过这条视线不被块挡。这是三下里的第二下。`,
    signals: [SIG.cartDeparted],
    units: [
      C("Nier", nier92, { stance: "crouch", face: PL.dogHole }),
      ...Guards09(), C("Geng", geng09, { face: WINDOW }),
      ...WindowGroup(), ...HouseIja(), ...CellarOut(), ...MillMan(),
      ...ConvoyWaits(),
    ],
    pois: [POI.crack("poi"), POI.cellar("danger"), POI.sideGate("objective"), POI.dogHole("landmark")],
  });

  // 09-3：侧门外，门缝里：媳妇被拖进偏屋、婴儿被挑起、窖里炸了；妮儿贴着墙根往门挪
  const gateCrackZ = G.sideGate.z - G.sideGate.w / 2 + (G.sideGate.w - G.sideGate.leafW) / 2;
  const gateEye = (() => {
    const target = CELLAR, dir = Dist({ x: G.sharedWall.x, z: gateCrackZ }, target);
    return Pt(G.sharedWall.x - 0.9 * (target.x - G.sharedWall.x) / dir, gateCrackZ - 0.9 * (target.z - gateCrackZ) / dir);
  })();
  const nier93 = Pt(G.sharedWall.x + 1.0, 491.2);
  const CellarMurder = () => [
    J("CellarIja1", Off(CELLAR, -0.7, -2.6), { face: CELLAR, name: "往窖里扔手榴弹的" }),
    J("CellarIja2", Off(CELLAR, 0.8, 2.4), { face: CELLAR, aim: true, name: "挑襁褓的" }),
    J("CellarIja3", Pt(112.0, 486.6), { face: Pt(114.2, 486.2), name: "拖媳妇进偏屋的" }),
    C("CellarMan", MAN_BODY, { down: true, yaw: 100 }),
    C("CellarWife", Pt(114.2, 486.2), { face: Pt(116, 484) }),
    C("CellarGranny", Off(CELLAR, 0, 0.2), { down: true, yaw: 0, name: "老太太（炸在窖里）", climb: true }),
  ];
  Add({
    id: "09-3", ...s09, name: "侧门外",
    player: { x: gateEye.x, z: gateEye.z, yawDeg: Yaw(gateEye, CELLAR), pitchDeg: -3, stance: "stand" },
    what: "门缝里：媳妇被拖进偏屋，只听得见声音；一个鬼子从老太太怀里扯过襁褓一刺刀挑起甩在窖沿上；老太太往窖里爬，手榴弹磕一下扔进去，窖里闷响一声。",
    next: { text: "等门开" },
    how: ["只等十几秒", "门缝在北侧，贴着看", "妮儿正贴着墙根往门这边挪，鬼子都在窖口没人看她", "顺子扶在门上的手一直在抖"],
    notes: `侧门扇 ${G.sideGate.leafW} m、门洞 ${G.sideGate.w} m，北侧留 ${R2(G.sideGate.w - G.sideGate.leafW)} m 的门缝；眼在缝后 0.9 m 对着窖口（生成器核过视线）。`
      + "CellarBlast 从这一帧起为真（窖口冒烟、盖板飞开）——剧本里炸在这一拍末。婴儿只是老太太怀里的包袱，不单独建人。契约机位 (80.5,500) 挪到门缝后面。",
    signals: [SIG.cartDeparted, SIG.cellarBlast],
    units: [
      C("Nier", nier93, { stance: "crouch", yaw: 180, through: true, path: [Pt(G.sharedWall.x - 0.9, G.dogHole.z), Pt(G.sharedWall.x + 0.9, G.dogHole.z), nier93], to: Pt(G.sharedWall.x + 0.9, G.sideGate.z - 0.4), toStraight: true, speed: 0.8 }),
      ...Guards09(), C("Geng", geng09, { face: WINDOW }),
      ...WindowGroup(), ...HouseIja(), ...CellarMurder(), ...MillMan(),
      ...ConvoyWaits(),
    ],
    pois: [POI.sideGate("poi"), POI.cellar("danger"), POI.sideRoom()],
  });

  // 09-4：门开了：撒尿的鬼子就在对面；妮儿看见尸体僵住、呜咽
  const p94 = Pt(G.sharedWall.x + 1.5, G.sideGate.z);
  const nier94 = Pt(G.sharedWall.x + 0.7, G.sideGate.z - 0.5);
  const pisser = Off(CELLAR, G.pisserOffset.x, G.pisserOffset.z);   // 侧着背、在汉子尸体边，离侧门口约 9 m
  const CellarAfter = () => [
    J("CellarIja1", Pt(113.0, 487.6), { face: PL.sideRoomDoor, stance: "crouch", guess: true }),
    J("CellarIja2", pisser, { yaw: -150, name: "撒尿的（留下的那个）" }),
    J("CellarIja3", Pt(115.8, 488.2), { face: Pt(116.4, 484.4), guess: true }),
    C("CellarMan", MAN_BODY, { down: true, yaw: 100 }),
    C("CellarWife", Pt(116.4, 484.4), { down: true, yaw: 90, guess: true }),
    C("CellarGranny", Off(CELLAR, 0, 0.2), { down: true, yaw: 0 }),
  ];
  Add({
    id: "09-4", ...s09, name: "门开了",
    player: { x: p94.x, z: p94.z, yawDeg: Yaw(p94, pisser), pitchDeg: 0, stance: "crouch" },
    what: "门闩一点一点拉开，门开一条缝露出妮儿的脸。门正对着地瓜窖：留下的那个鬼子在八九米外侧着背、在汉子的尸体边撒尿。",
    next: { text: "等鬼子回屋" },
    how: ["侧门一开就是触发，玩家得蹲着不动", "妮儿回头看见院里的人，僵住、开始呜咽", "屏幕弹按键：捂住她的嘴（第一人称看得见自己的手指）", "按到了：鬼子尿完回屋；没按到：他半转身「嗯？」，正好机枪响，骂一句也回屋。不判失败"],
    notes: `侧门正对窖口：门口到撒尿的鬼子 ${R1(Dist(p94, pisser))} m，场景生成器核过门口眼高 1.2 到他看得见。其余鬼子回了偏屋（位置推测）。`,
    signals: [SIG.cartDeparted, SIG.cellarBlast, SIG.sideGateOpen],
    units: [
      C("Nier", nier94, { stance: "crouch", face: pisser, through: true }),
      ...Guards09(), C("Geng", geng09, { face: WINDOW }),
      ...WindowGroup(), ...HouseIja(), ...CellarAfter(), ...MillMan(),
      ...ConvoyWaits(),
    ],
    pois: [Poi("Pisser", "撒尿的鬼子", "danger", pisser, 1.5), POI.cellar("landmark"), POI.mill(), POI.kitchenDoor("landmark")],
  });

  // 09-5：带着妮儿往灶屋摸；石磨上绑着老汉
  const p95 = Pt(88, 496);
  const nier95 = Pt(87.0, 496.9);
  const kitchenDoorOut = Pt(G.kitchen.box.maxX + 1.2, G.kitchen.door.z);
  Add({
    id: "09-5", ...s09, name: "往灶屋摸",
    player: { x: p95.x, z: p95.z, yawDeg: Yaw(p95, kitchenDoorOut), pitchDeg: -4, stance: "crouch" },
    what: "妮儿再也不肯回狗洞，顺子只能带着她。机枪响一梭往灶屋挪一段，一安静就停。石磨上反绑着一个早就死了的老汉。",
    next: { text: "摸到灶屋门口", x: kitchenDoorOut.x, z: kitchenDoorOut.z, radiusM: 1.2 },
    how: ["老汉被自己的裤腰带反绑在石磨上，身上好几个刺刀窟窿（跟 02 冬瓜挨的是同一套）", "中途妮儿再呜咽一次，再弹一次捂嘴", "鬼子都回了屋，院里没人"],
    notes: "灶屋在后院西北角，门朝东（契约 x 82…91、z 480…492；这里收到 z 480…487，不然狗洞 z 488 开进了灶屋）。",
    signals: [SIG.cartDeparted, SIG.cellarBlast, SIG.sideGateOpen],
    units: [
      C("Nier", nier95, { stance: "crouch", face: p95 }),
      ...Guards09(), C("Geng", geng09, { face: WINDOW }),
      ...WindowGroup(), J("KitchenIja", KITCHEN_IN, { face: PL.kitchenDoor, stance: "crouch" }), ...CellarAfter(), ...MillMan(),
      ...ConvoyWaits(),
    ],
    pois: [POI.kitchenDoor("objective"), POI.mill(), POI.sideRoom()],
  });

  // 09-6：灶台边：罐子掉地，鬼子扑出来把顺子撞翻，刺刀往下压；妮儿咬他手腕
  const p96 = Pt(86, 484.4);
  const ija96 = Pt(86.5, 483.3);
  const nier96 = Pt(87.5, 484.0);
  Add({
    id: "09-6", ...s09, name: "灶台边",
    player: { x: p96.x, z: p96.z, yawDeg: Yaw(p96, ija96), pitchDeg: 38, stance: "prone" },
    what: "快到灶屋门口，妮儿怀里的罐子哗啦一声掉地。灶屋里的鬼子扑出来把顺子撞翻在灶台边，刺刀往下压；妮儿一口咬在他握枪的手腕上。",
    next: { text: "拔刀，打进前屋", x: PL.roomYardDoor.x, z: PL.roomYardDoor.z + 1.3, radiusM: 1.5 },
    how: ["玩家连按往外推，推不赢，刀尖一点点下来", "鬼子惨叫手一松：慢动作一秒半，控制交还，不出提示", "平常的键从左肩抽大刀砍两刀", "妮儿嘴边沾着血蹲在地上发抖；前屋的机枪组听见动静扭头往后看"],
    notes: "倒地仰视：卧姿机位朝上看（pitch +38）。鬼子站在顺子身上方略偏北，妮儿扑在他手腕边。机枪组此帧朝南扭头（yaw 180）。",
    signals: [SIG.cartDeparted, SIG.cellarBlast, SIG.sideGateOpen],
    units: [
      J("KitchenIja", ija96, { face: p96, aim: true, name: "灶屋里的鬼子（刺刀压着顺子）" }),
      C("Nier", nier96, { stance: "crouch", face: ija96 }),
      ...Guards09(), C("Geng", geng09, { face: WINDOW }),
      ...WindowGroup({ yaw: 180 }).map((u) => (u.id === "MgGunner" ? { ...u, arc: MG_ARC } : u)),
      ...CellarAfter(), ...MillMan(),
      ...ConvoyWaits(),
    ],
    pois: [POI.roomYardDoor("objective"), POI.window("danger")],
  });

  // ======================= 10 两面夹住机枪 =======================
  const s10 = { stage: 10, stageTitle: "两面夹住机枪" };
  const p101 = Pt(92, 474);
  const StreetRush = () => [
    N("Luo", Pt(99.2, 452), { yaw: 180, aim: true }),
    N("LiuWencai", Pt(101.6, 456), { yaw: 180, aim: true }),
    N("Yaowa", Pt(98.4, 458.5), { yaw: 180 }),
    N("HeYoutian", Pt(102.2, 448), { yaw: 180 }),
    N("Squad1", Pt(98.0, 445), { yaw: 180, aim: true, guess: true }),
    N("Squad2", Pt(101.8, 441), { yaw: 180, guess: true }),
    N("Squad3", Pt(99.6, 437.5), { yaw: 180, guess: true }),
    N("Officer", GUARDS_08.Officer, { stance: "crouch", face: MOUTH, kind: "officer" }),
    C("Geng", geng09, { face: WINDOW }),
  ];
  const nier10 = Pt(92.6, 485.2);   // 蹲在灶屋门外
  Add({
    id: "10-1", ...s10, name: "打进前屋",
    player: { x: p101.x, z: p101.z, yawDeg: Yaw(p101, MG_AT), pitchDeg: -2, stance: "stand" },
    what: "从灶屋打进前屋，抢在机枪组掉转枪口之前从背后把他们打掉；班长在街口正面压。两面一夹机枪哑了，房顶扔手榴弹的也一起清掉。",
    next: { text: "东头鬼子来了，去石碾", x: PRONE_AT_ROLLER.x, z: PRONE_AT_ROLLER.z, radiusM: 2 },
    how: ["机枪组背对着玩家，正扭头", "班长他们顺着主街冲过来", "北窗上那挺十一年式（MgSilenced：窗台上的枪没了）", "东头的枪声近了"],
    notes: "MgSilenced 从这一帧起：机枪组、房顶的鬼子倒地。妮儿留在灶屋门口蹲着。",
    signals: [SIG.cartDeparted, SIG.cellarBlast, SIG.sideGateOpen, SIG.mgSilenced],
    units: [
      J("MgGunner", Off(MG_AT, 0.4, 0.8), { down: true, yaw: 0, weapon: "Type11" }),
      J("MgLoader", Off(MG_LOADER_AT, -0.2, 0.7), { down: true, yaw: 20 }),
      J("RoofIja", Off(ROOF_AT, 0.6, 0.9), { down: true, yaw: 0, onRoof: true }),
      J("KitchenIja", ija96, { down: true, yaw: 0 }),
      C("Nier", nier10, { stance: "crouch", face: PL.roomYardDoor }),
      ...StreetRush(),
      ...CellarAfter(), ...MillMan(),
      ...ConvoyWaits(),
    ],
    pois: [POI.window("poi"), POI.roller("objective"), POI.frontDoor("landmark")],
  });

  // 10-2：缴来的十一年式拖到石碾后头朝东压住东街；子弹和掷弹筒是两个倒计时
  const Corner10 = () => [
    N("Luo", CORNER_N, { stance: "crouch", aim: true, face: Pt(190, 465) }),
    N("LiuWencai", CORNER_S, { stance: "crouch", aim: true, face: Pt(200, 465) }),
    N("Yaowa", Pt(108.4, 468.6), { stance: "crouch", face: PRONE_AT_ROLLER }),
    N("Squad1", Pt(110.2, 462.2), { stance: "crouch", aim: true, face: Pt(180, 465), guess: true }),
    N("Squad2", Pt(114.4, 461.0), { stance: "crouch", aim: true, face: Pt(180, 465), guess: true }),
    N("Squad3", Pt(107.4, 463.6), { stance: "crouch", guess: true, face: Pt(180, 465) }),
  ];
  Add({
    id: "10-2", ...s10, name: "石碾后头",
    player: { x: PRONE_AT_ROLLER.x, z: PRONE_AT_ROLLER.z, yawDeg: -90, pitchDeg: 0, stance: "prone" },
    what: "东头的鬼子撵过来了。班长吼「调过来！朝东打！」顺子把缴来的十一年式拖到门口石碾后头，朝东压住又直又长的窄巷。",
    next: { text: "顶住，等后送队穿院" },
    how: ["弹斗一次装六个五发桥夹，三十发；子弹只有机枪组身上那些", "鬼子不硬冲，翻院墙、走房顶往这边绕", "掷弹筒「嘭」一声开始往石碾附近落", "子弹和掷弹筒是玩家看得见的两个倒计时"],
    notes: `石碾 (${PL.roller.x},${PL.roller.z})，趴在它西北 2.2 m 顺着东街北半边看到东头（场景生成器核过）。东头的鬼子 ${EAST_IJA.length} 个 + 掷弹筒 2 人躲在东头北侧院墙后（位置推测）。`
      + "编辑器玩家拿的还是汉阳造（loadout 固定），石碾后那挺枪用随信号体块 RollerMg 表示。何有田在后头拆机枪组的子弹袋。",
    signals: [SIG.cartDeparted, SIG.cellarBlast, SIG.sideGateOpen, SIG.mgSilenced],
    units: [
      ...Corner10(),
      N("HeYoutian", Pt(99.4, 472.6), { stance: "crouch", face: Off(MG_AT, 0.4, 0.8) }),
      N("Officer", Pt(100.4, 404), { face: MOUTH, kind: "officer" }),
      C("Geng", Pt(102.4, 408), { face: Pt(100, 460) }),
      ...EastIja(),
      J("MgGunner", Off(MG_AT, 0.4, 0.8), { down: true, yaw: 0, weapon: "Type11" }),
      J("MgLoader", Off(MG_LOADER_AT, -0.2, 0.7), { down: true, yaw: 20 }),
      J("RoofIja", Off(ROOF_AT, 0.6, 0.9), { down: true, yaw: 0, onRoof: true }),
      J("KitchenIja", ija96, { down: true, yaw: 0 }),
      C("Nier", nier10, { stance: "crouch", face: PL.roomYardDoor }),
      ...CellarAfter(), ...MillMan(),
      ...ConvoyWaits(),
    ],
    pois: [POI.roller("poi"), POI.eastEnd(), POI.mortar(), POI.gate("landmark")],
  });

  // 10-3：何有田接过机枪；后送队顺着街进老耿家（前门 → 前屋 → 南门，驴车走大门）；老耿看了一眼地上的人
  const p103 = Pt(102, 494);
  const headIn = new Set(["Litter11", "Litter12", "Walker21", "Walker22", "Walker23", "Walker24", "Helper06"]);
  const passageMid = Pt(gateX, 475);
  // 队头进村：担架走大门过道，走着的伤员走前门穿前屋（路线由路网自动排）
  const ConvoyHeadIn = () => [
    N("Litter12", Pt(gateX, 481.5), { kind: "litter", yaw: 180, group: "convoy" }),
    N("Litter11", Pt(gateX, G.compound.minZ - 3.2), { kind: "litter", yaw: 180, group: "convoy" }),
    N("Walker24", Pt(G.roomYardDoor.x, G.frontRoom.box.maxZ + 2.2), { role: "walkingWounded", group: "convoy", yaw: 180, stance: "crouch" }),
    N("Walker23", Pt(G.frontDoor.x - 1.6, G.frontRoom.box.minZ + 2.6), { role: "walkingWounded", group: "convoy", yaw: 180, stance: "crouch" }),
    N("Helper06", Pt(G.frontDoor.x - 0.8, G.frontRoom.box.minZ + 3.1), { role: "helper", group: "convoy", yaw: 180 }),
    N("Walker22", Pt(G.frontDoor.x + 0.6, G.frontRoom.box.minZ - 2.6), { role: "walkingWounded", group: "convoy", yaw: 180, stance: "crouch" }),
    N("Walker21", Pt(ST.main.x - 1.2, 456), { role: "walkingWounded", group: "convoy", yaw: 180, stance: "crouch" }),
  ];
  const dongguaIn = Pt(gateX + 0.2, G.compound.minZ - 7.5);
  Add({
    id: "10-3", ...s10, name: "穿院子",
    player: { x: p103.x, z: p103.z, yawDeg: Yaw(p103, passageMid), pitchDeg: -3, stance: "stand" },
    what: "班长带人顶到东街拐角，何有田接过机枪。后送队顺着街进老耿家：从前门穿前屋、驴车走大门过道。老耿进了院子，看了一眼地上的人，什么也没说。",
    next: { text: "去后门", x: G.backDoor.x + 1.2, z: G.compound.maxZ - 3.4, radiusM: 2 },
    how: ["东头的枪打不进院子，往南的路正好从老耿家后头出去", "担架一副一副从大门过道抬进来", "老耿看了一眼石磨上的老汉", "妮儿还蹲在灶屋门口"],
    notes: "契约 06–10 的前屋占满院宽、后院没有车能进的门；这里前屋收到 x 82…106.4，x 106.9…109.5 留 2.6 m 的大门过道（11 驴车要从后门出村）。只有队头 7 个人进了村，其余还在凹路里。冬瓜的担架这帧抬着（bearers 2）排在大门外。",
    signals: [SIG.cartDeparted, SIG.cellarBlast, SIG.sideGateOpen, SIG.mgSilenced],
    units: [
      N("HeYoutian", PRONE_AT_ROLLER, { stance: "prone", aim: true, weapon: "Type11", yaw: -90, arc: { halfDeg: 8, rangeM: 120 } }),
      N("Luo", CORNER_N, { stance: "crouch", aim: true, face: Pt(190, 465) }),
      N("LiuWencai", CORNER_S, { stance: "crouch", aim: true, face: Pt(200, 465) }),
      N("Yaowa", Pt(110.4, 468.2), { stance: "crouch", face: PRONE_AT_ROLLER }),
      N("Squad1", Pt(110.2, 462.2), { stance: "crouch", aim: true, face: Pt(180, 465), guess: true }),
      N("Squad2", Pt(114.4, 461.0), { stance: "crouch", aim: true, face: Pt(180, 465), guess: true }),
      N("Squad3", Pt(107.4, 463.6), { stance: "crouch", guess: true, face: Pt(180, 465) }),
      N("Officer", Pt(G.frontDoor.x + 2.2, G.frontRoom.box.minZ - 2.2), { face: Pt(ST.main.x, 450), kind: "officer" }),
      N("Medic", Pt(105.8, 487.6), { face: p103, stance: "crouch" }),
      ...DongguaOnLitter(dongguaIn, { bearers: 2, yaw: 180 }),
      ...ConvoyHeadIn(),
      ...Column({ exclude: headIn }),
      C("Geng", Pt(103.6, 489.6), { face: MILL_MAN }),
      C("GengCart", Pt(gateX, G.compound.minZ - 11.5), { yaw: 180, straight: true, speed: 1.6 }),
      C("Nier", nier10, { stance: "crouch", face: Pt(gateX, 481) }),
      ...EastIja({ face: ROLLER }),
      J("MgGunner", Off(MG_AT, 0.4, 0.8), { down: true, yaw: 0, weapon: "Type11" }),
      J("MgLoader", Off(MG_LOADER_AT, -0.2, 0.7), { down: true, yaw: 20 }),
      J("RoofIja", Off(ROOF_AT, 0.6, 0.9), { down: true, yaw: 0, onRoof: true }),
      J("KitchenIja", ija96, { down: true, yaw: 0 }),
      ...CellarAfter(), ...MillMan(),
    ],
    pois: [POI.gate("poi"), POI.frontDoor("poi"), POI.backDoor("objective"), POI.mill()],
  });

  // 10-4：后门：老耿挪开水缸、拔开后门；担架往外抬（接 11：车先走）
  const p104 = Pt(G.backDoor.x, G.compound.maxZ + 2.0);
  const geng104 = Pt(G.backDoor.x + 0.9, G.compound.maxZ - 1.4);
  const dongguaOut = Pt(G.backDoor.x, G.compound.maxZ - 5.6);
  Add({
    id: "10-4", ...s10, name: "后门",
    player: { x: p104.x, z: p104.z, yawDeg: 180, pitchDeg: -2, stance: "stand" },
    what: "老耿挪开堵门的水缸、拔开朝南的后门。后门外是一条往南出村的小路；担架一副接一副往外抬。",
    next: { text: "（接 11）车先走" },
    how: ["水缸挪到门边（BackDoorOpen：水缸换位置、门扇开了）", "后门外的小路一直通到村南口", "车上剩的几箱弹药卸下来留给班长他们", "11 开头：空出来的车装冬瓜和另外两个肚子受伤的"],
    notes: "11 这次不做：车出后门、何有田往门缝里卡手榴弹都在 11。班长他们还在东街拐角顶着。",
    signals: [SIG.cartDeparted, SIG.cellarBlast, SIG.sideGateOpen, SIG.mgSilenced, SIG.backDoorOpen],
    units: [
      C("Geng", geng104, { yaw: 180 }),
      ...DongguaOnLitter(dongguaOut, { bearers: 2, yaw: 180 }),
      N("Medic", Pt(G.backDoor.x - 2.0, G.compound.maxZ - 3.0), { face: dongguaOut, stance: "crouch" }),
      N("Litter12", Pt(104.2, 492.4), { kind: "litter", yaw: Yaw(Pt(104.2, 492.4), Pt(G.backDoor.x, G.compound.maxZ - 4)), group: "convoy" }),
      N("Litter11", Pt(gateX, 481), { kind: "litter", yaw: 180, group: "convoy" }),
      N("Walker24", Pt(95.4, 493.6), { role: "walkingWounded", group: "convoy", face: PL.backDoor, stance: "crouch" }),
      N("Walker23", Pt(94.6, 488.4), { role: "walkingWounded", group: "convoy", face: PL.backDoor, stance: "crouch" }),
      N("Helper06", Pt(93.8, 489.0), { role: "helper", group: "convoy", face: PL.backDoor }),
      N("Walker22", Pt(G.roomYardDoor.x + 0.8, G.frontRoom.box.maxZ + 2.6), { role: "walkingWounded", group: "convoy", yaw: 180, stance: "crouch" }),
      N("Walker21", Pt(G.frontDoor.x - 1.4, G.frontRoom.box.minZ + 2.4), { role: "walkingWounded", group: "convoy", yaw: 180, stance: "crouch" }),
      ...Column({ exclude: headIn }),
      N("HeYoutian", PRONE_AT_ROLLER, { stance: "prone", aim: true, weapon: "Type11", yaw: -90, arc: { halfDeg: 8, rangeM: 120 } }),
      N("Luo", CORNER_N, { stance: "crouch", aim: true, face: Pt(190, 465) }),
      N("LiuWencai", CORNER_S, { stance: "crouch", aim: true, face: Pt(200, 465) }),
      N("Yaowa", Pt(110.4, 468.2), { stance: "crouch", face: PRONE_AT_ROLLER }),
      N("Squad1", Pt(110.2, 462.2), { stance: "crouch", aim: true, face: Pt(180, 465), guess: true }),
      N("Squad2", Pt(114.4, 461.0), { stance: "crouch", aim: true, face: Pt(180, 465), guess: true }),
      N("Squad3", Pt(107.4, 463.6), { stance: "crouch", guess: true, face: Pt(180, 465) }),
      N("Officer", Pt(gateX - 2.4, G.compound.minZ - 2.4), { face: Pt(ST.main.x, 450), kind: "officer" }),
      C("GengCart", Pt(gateX, G.compound.minZ - 3.6), { yaw: 180, straight: true, speed: 1.6 }),
      C("Nier", nier10, { stance: "crouch", face: geng104 }),
      ...EastIja({ face: ROLLER }),
      J("MgGunner", Off(MG_AT, 0.4, 0.8), { down: true, yaw: 0, weapon: "Type11" }),
      J("MgLoader", Off(MG_LOADER_AT, -0.2, 0.7), { down: true, yaw: 20 }),
      J("RoofIja", Off(ROOF_AT, 0.6, 0.9), { down: true, yaw: 0, onRoof: true }),
      J("KitchenIja", ija96, { down: true, yaw: 0 }),
      ...CellarAfter(), ...MillMan(),
    ],
    pois: [POI.backDoor("poi"), POI.villageSouth(), POI.gate("landmark")],
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
  { id: "B", name: "凹路（后送队）", stages: [7, 7], box: { minX: 70, maxX: 106, minZ: 165, maxZ: 385 } },
  { id: "C", name: "村北口与主街", stages: [8, 10], box: { minX: 90, maxX: 110, minZ: 375, maxZ: 470 } },
  { id: "D", name: "巷子与邻院", stages: [9, 9], box: { minX: 55, maxX: 82, minZ: 395, maxZ: 507 } },
  { id: "E", name: "老耿家", stages: [9, 10], box: { minX: 81, maxX: 119, minZ: 469, maxZ: 508 } },
  { id: "F", name: "东街（窄巷）", stages: [10, 10], box: { minX: 118, maxX: 235, minZ: 455, maxZ: 475 } },
  { id: "G", name: "河汊子（车下不去）", stages: [8, 8], box: { minX: 10, maxX: 28, minZ: 200, maxZ: 560 } },
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
      gameVersion: "Notion 06–10 剧本（2026-10-18 晚）+ 搭建契约 §3–§4",
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
 * meta：`${kfId}/${unitId}` → { climb, through, onRoof, onLitter }（生成器内部标记；手改的 JSON 没有它）。
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
      for (const u of people) if (OnCart(u, v, 0.2)) out.push(`${kf.id} ${u.id} 站在车身 ${v.id} 里`);
      if (OnCart(kf.player, v, 0)) out.push(`${kf.id} 玩家在车身 ${v.id} 里`);
    }
    if (Number.isFinite(kf.next?.x) && Dist(kf.next, kf.player) < C.nextM) out.push(`${kf.id} 下一步目标离玩家不到 ${C.nextM} m（只写文字）`);
    if (hasScene) {
      const solids = SolidsFor(scene, kf.signals);
      const ground = StandSampler(scene, kf.signals);
      const hit = BodyHit(solids, ground, kf.player.x, kf.player.z, C.playerBody, 0);
      if (hit) out.push(`${kf.id} 玩家站进 ${hit.id}`);
      for (const u of kf.units) {
        if (!PEOPLE.has(u.kind) || M(u).onRoof) continue;
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
      const m = { climb: !!(m0.climb || m1.climb), through: !!(m0.through || m1.through), onRoof: !!(m0.onRoof || m1.onRoof) };
      if (m.onRoof) continue;
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
