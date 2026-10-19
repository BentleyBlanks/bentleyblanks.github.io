// ===========================================================================
// Script_EditorBlockoutFirstLevel0610Keyframes.mjs —— 第一关 06–10 新剧本白盒（关卡键 FirstLevel0610）的关键帧配置生成器（2026-10-19 第二版）
//
//   node Taierzhuang1938/Script_EditorBlockoutCli.mjs export FirstLevel0610 --force   → Blockout/FirstLevel0610.json
//
// 口径：
//   · 剧本（台词、谁做什么）以 Notion「第一关｜往南的路 · 剧本」06–10（10-19 用户拍板的第二版）为准；关键帧表以集成负责人 10-19 第二版契约 §3 为准（26 帧，id 固定，配音按 id 挂）；
//     距离、站位已换算成世界坐标写在 Data_EditorBlockoutFirstLevel0610Space.mjs —— 本文件所有坐标都从那里算，不手抄数字。
//   · 每一拍先让玩家亲眼看到出了什么事，再给一句话的下一步；「掩护」「清理」「护送」不进 next。台词不逐句写进关键帧，只写「此时」。
//   · 坐标 X 向东、Z 向南、米；yawDeg 0 朝北、+90 朝西、−90 朝东、180 朝南（同 Script_EditorBlockoutConfig）。
//   · 第二版剧情：不上房（没有人站在房顶上，扔手榴弹的在大门过道里）；08 正面打（小队趴在村口路沟的街口坡道上压窗口，班长带何有田和后送队两个兵
//     顺主街东边的门洞摸到翻倒的大车后头被压住）；08-4 一个鬼子跑去东街喊人；08-5 妮儿顺路沟往西钻巷子，顺子追；09 妮儿钻狗洞回家、顺子从墙缝 / 门缝看惨剧三下、
//     妮儿拔门闩、看守撒尿→捂嘴→进偏屋、透过前屋南门看见机枪组的后背、灶屋门口被扑倒；10 背后打掉机枪组，石碾后守东街四步（顺巷子冲 → 掷弹筒 → 砸门抄北边 → 翻墙摸后门），
//     后送队穿院子、老耿挪缸开后门、幺娃接过机枪。
//
// 走位：同一个人在相邻关键帧里 id 不变；生成时按村里的路网（凹路、路沟、街口坡道、主街、小空地、北角、东街、巷子、各道门）自动排 path，
// 不让人直线穿墙；野地里的人走直线。只在新帧出现的人写 path 起点「走进来」，只在旧帧的人写 intent「走出去」。
//
// 摆位检查（push 进 issues，CLI 打出来）：玩家 / 单位出界；玩家站进实心块、单位站进高块（读 Blockout/FirstLevel0610.scene.json，
// 按两帧 signals 算 gates）；两人重叠（< 0.6 m）、人站在担架上；过渡路线穿高块（钻狗洞的妮儿例外）；路线上 1 m 内高差超过 1.2 m（爬坎 / 翻墙的例外）。
// 纯函数式生成：不读时钟、不读 git；只在 node 里读场景文件做检查。
// ===========================================================================

import { BLOCKOUT_SCHEMA, PlanTransition, NormalizeBlockout, YawDegFromTo } from "./Script_EditorBlockoutConfig.mjs";
import { BlockStandSampler } from "./Script_EditorBlockoutPrevizPlan.mjs";
import {
  L0610_LEVEL_KEY, L0610_TITLE, L0610_VERSION, L0610_BOUNDS, L0610_PLACES as PL, L0610_LANE, L0610_DITCH as DT, L0610_STREETS as ST, L0610_GENG as G,
  L0610_NEIGHBOR as NB, L0610_EAST_YARDS as EY, L0610_STREET_YARDS as SY, L0610_SIGNALS as SIG, L0610_FROM_0105, L0610_MOUTH_SHOOTERS, LanePointAtZ,
  PointAlong, LineLength, Station,
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
// 路网：凹路 + 路沟 + 街口坡道 + 街 + 巷子 + 各道门；院子 / 屋里 / 干沟 / 路沟是能自由走动的区域，门是区域的出入口。

const GULLY = L0610_FROM_0105.gully;
const DOOR_OUT = 1.3;   // 门两侧各放一个路点，离墙中线这么远
const NET_SNAP_M = 3.0; // 离路中线这么近就算在路上

const NODE = {};
const nodes = [], edges = [], areas = [];
const Node = (name, x, z) => { NODE[name] = nodes.length; nodes.push({ x: R2(x), z: R2(z), name }); return NODE[name]; };
const Edge = (a, b) => edges.push([NODE[a], NODE[b]]);
const Chain = (...names) => { for (let i = 1; i < names.length; i++) Edge(names[i - 1], names[i]); };
const Area = (name, box, ...portals) => areas.push({ name, box, portals: portals.map((n) => NODE[n]) });

// 凹路（从凹路口到路沟北沿）
L0610_LANE.line.forEach((p, i) => Node(`Lane${i}`, p.x, p.z));
for (let i = 1; i < L0610_LANE.line.length; i++) Edge(`Lane${i - 1}`, `Lane${i}`);
const LANE_END = `Lane${L0610_LANE.line.length - 1}`;
// 村口路沟（沟底）→ 街口坡道 → 主街（过翻倒的大车走西边）→ 小空地 → 北角 / 东街
Node("DitchW", DT.fromX + 4, DT.z); Node("DitchAlley", ST.alleyNorth.x, DT.z); Node("DitchMid", 92, DT.z); Node("DitchStreet", ST.main.x, DT.z); Node("DitchE", DT.toX - 2, DT.z);
Chain("DitchW", "DitchAlley", "DitchMid", "DitchStreet", "DitchE"); Edge(LANE_END, "DitchStreet");
Node("StreetN", ST.main.x, ST.main.fromZ + 1.5); Node("StreetMid", ST.main.x, 420); Node("StreetCartW", ST.main.x - 2.2, PL.cart.z); Node("StreetS", ST.main.x, ST.square.box.minZ + 2);
Node("Square", PL.square.x, PL.square.z); Node("Pocket", PL.pocket.x, PL.pocket.z); Node("EastMouth", ST.east.fromX + 1, ST.east.z); Node("EastEnd", ST.east.toX, ST.east.z);
Chain("DitchStreet", "StreetN", "StreetMid", "StreetCartW", "StreetS", "Square", "EastMouth", "EastEnd"); Edge("Square", "Pocket");
// 巷子：路沟南沿的巷子口 → 夹道 → 东西那截 → 南北那截 → 邻院小门（敞着）→ 邻院
Node("AlleyMouth", ST.alleyNorth.x, PL.alleyMouth.z); Node("AlleyPassageS", ST.alleyNorth.x, ST.alleyWest.z); Node("AlleyCorner", ST.alleySouth.x, ST.alleyWest.z); Node("AlleyEnd", ST.alleySouth.x, NB.westDoor.z);
Node("NeighborDoorOut", PL.neighborDoor.x - 0.9, NB.westDoor.z); Node("NeighborDoorIn", PL.neighborDoor.x + DOOR_OUT, NB.westDoor.z);
Edge("DitchAlley", "AlleyMouth"); Chain("AlleyMouth", "AlleyPassageS", "AlleyCorner", "AlleyEnd", "NeighborDoorOut", "NeighborDoorIn");
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
// 过道尽头直通后院的各个口（过道的盒子和后院的盒子在 z 481 搭着一点，站在那条线上的人也要能走到后门）
for (const n of ["BackDoorIn", "RoomYardDoorOut", "KitchenDoorYard", "SideRoomDoorYard", "SideGateE"]) Edge("PassageEnd", n);
// 区域：干沟（集结处）、路沟、小空地、北角、邻院、后院、前屋、灶屋、偏屋、过道
const Box = (minX, maxX, minZ, maxZ) => ({ minX, maxX, minZ, maxZ });
Area("Gully", Box(GULLY.minX, GULLY.maxX + 2, GULLY.minZ, GULLY.maxZ + 1), "Lane0");
Area("Ditch", Box(DT.fromX + 1, DT.toX - 1, DT.z - DT.floorW / 2 - 0.2, DT.z + DT.floorW / 2 + 0.2), "DitchW", "DitchAlley", "DitchMid", "DitchStreet", "DitchE", LANE_END);
Area("Square", Box(ST.square.box.minX + 0.5, ST.square.box.maxX, ST.square.box.minZ + 0.3, ST.square.box.maxZ), "StreetS", "Square", "EastMouth", "FrontDoorOut", "GateOut", "Pocket");
Area("Pocket", Box(ST.pocket.box.minX + 0.4, ST.pocket.box.maxX - 0.4, ST.pocket.box.minZ + 0.4, ST.pocket.box.maxZ - 0.1), "Pocket");
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

const POI = {
  assembly: (kind = "landmark") => Poi("Assembly", "集结处（干沟，空了）", kind, PL.assembly, 6),
  gullyRest: () => Poi("GullyRest", "冬瓜躺过的地方", "poi", PL.gullyRest, 1.5),
  laneHead: (kind = "landmark") => Poi("LaneHead", "凹路口", kind, PL.laneHead, 2.5),
  cart: (kind = "poi") => Poi("GengCart", "老耿的驴车（树底下）", kind, PL.cartStop, 2.5),
  nierRim: () => Poi("NierRim", "妮儿捡弹壳的沟沿", "poi", PL.nierRim, 1.5),
  villageMouth: (kind = "landmark") => Poi("VillageMouth", "村北口", kind, PL.villageMouth, 3),
  ditch: (kind = "landmark") => Poi("Ditch", "村口路沟", kind, PL.ditch, 4),
  mainStreet: (kind = "landmark") => Poi("MainStreet", "主街", kind, Pt(ST.main.x, 425), 4),
  window: (kind = "danger") => Poi("NorthWindow", "北窗（机枪）", kind, PL.northWindow, 2),
  gatePassage: (kind = "danger") => Poi("GatePassage", "大门过道（甩手榴弹的）", kind, PL.gatePassage, 2),
  overturnedCart: (kind = "poi") => Poi("OverturnedCart", "翻倒的大车", kind, PL.cart, 2),
  river: () => Poi("River", "河汊子（车下不去）", "landmark", PL.river, 8),
  eastSide: () => Poi("EastSide", "东头（鬼子来的方向）", "danger", PL.fieldEast, 8),
  alleyMouth: (kind = "poi") => Poi("AlleyMouth", "巷子口", kind, PL.alleyMouth, 1.5),
  neighborDoor: (kind = "poi") => Poi("NeighborDoor", "邻院的小门（敞着）", kind, PL.neighborDoor, 1.5),
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
  shrine: (kind = "danger") => Poi("Shrine", "土地庙", kind, PL.shrine, 2),
  farmyard: (kind = "danger") => Poi("Farmyard", "场院（麦秸垛后头：掷弹筒）", kind, PL.strawStack, 4),
  pocket: (kind = "danger") => Poi("Pocket", "北角（北边院子的门）", kind, PL.pocket, 3),
  southClimb: () => Poi("SouthClimb", "南边翻墙的地方", "danger", PL.southClimb, 3),
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
  MgGunner: { name: "北窗机枪", role: "machineGun", weapon: "Type11", group: "window" },
  MgLoader: { name: "副射手", role: "loader", group: "window" },
  Leader: { name: "分队长", role: "squadLeader", group: "house" },
  Rifle1: { name: "前屋里的步枪", role: "rifleman", group: "house" },
  Rifle2: { name: "前屋里的步枪", role: "rifleman", group: "house" },
  GateIja1: { name: "大门过道里甩手榴弹的", role: "grenadier", group: "gate" },
  GateIja2: { name: "大门过道里的", role: "rifleman", group: "gate" },
  KitchenIja: { name: "灶屋里翻东西的", role: "looter", group: "house" },
  CellarIja1: { name: "拎手榴弹的", role: "grenadier", group: "cellar" },
  CellarIja2: { name: "拿刺刀的", role: "bayonet", group: "cellar" },
  CellarIja3: { name: "拖人的", role: "rifleman", group: "cellar" },
  Mortar1: { name: "掷弹筒", role: "mortar", group: "east" },
  Mortar2: { role: "mortarLoader", group: "east" },
  Mortar3: { role: "mortarLoader", group: "east" },
};
const J = (id, at, o = {}) => U(id, "ija", at, { ...(IJA[id] || {}), ...o });

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
const WINDOW = Pt(PL.northWindow.x, PL.northWindow.z);
const MG_AT = Pt(G.mgPost.x, G.mgPost.z), MG_LOADER_AT = Pt(G.mgLoaderPost.x, G.mgLoaderPost.z);
const MG_ARC = ArcTo(MG_AT, MOUTH, 5, 6);
const GATE_AT = Pt(G.gatePost.x, G.gatePost.z);
const LEADER_AT = Pt(101.8, 476.4), RIFLE1_ROOM = Pt(100.4, 474.6), RIFLE2_ROOM = Pt(103.6, 473.0);   // 08-1 前屋里的分队长和两杆步枪
const RIFLE1_GATE = Pt(108.9, 474.0), RIFLE2_GATE = Pt(107.6, 476.2), GATE2_AT = Pt(107.5, 471.2);       // 08-3 挪到大门过道
const KITCHEN_IN = Pt(85.4, 483.8);                    // 灶屋里翻东西的鬼子
const CELLAR = Pt(PL.cellar.x, PL.cellar.z);
const MILL_MAN = Pt(G.mill.x + 0.9, G.mill.z + 0.7);   // 反绑在石磨上的老汉（倒在磨边）
const ROLLER = Pt(PL.roller.x, PL.roller.z);
const PRONE_AT_ROLLER = Pt(PL.roller.x - 2.2, PL.roller.z + 0.9);   // 石碾后头趴着朝东（视线从碾子北边过去）
const CORNER_N = Pt(ST.east.fromX - 1.6, ST.east.z - ST.east.halfW - 1.8);   // 东街口北角（班长顶着）
const CORNER_S = Pt(ST.east.fromX - 1.4, ST.east.z + ST.east.halfW + 1.9);   // 东街口南角
const CART_HIDE = Pt(PL.cart.x, PL.cart.z);                                   // 翻倒的大车
const SHOOTER = Object.fromEntries(L0610_MOUTH_SHOOTERS.map((p) => [p.who, Pt(p.x, p.z)]));   // 街口坡道上趴着的四个
// 08 沟底街口西边：老耿、班长、排长、卫生兵、两个后送队的兵、Squad1 / Squad2
const DITCH_08 = Object.freeze({
  Luo: Pt(99.2, 380.5), Geng: Pt(101.6, 380.7), Nier: Pt(102.9, 379.4), Officer: Pt(102.6, 381.1), Medic: Pt(107.6, 381.1),
  HeYoutian: Pt(96.9, 380.2), Escort1: Pt(98.0, 379.3), Escort2: Pt(96.1, 379.0), Squad1: Pt(95.4, 380.5), Squad2: Pt(93.9, 379.4),
  Cart: Pt(104.6, 379.3), DongguaLitter: Pt(106.2, 380.9),
});
// 08-3 起翻倒的大车北侧：班长、何有田、后送队的兵（一个倒了）
const CART_GROUP = Object.freeze({ Luo: Pt(100.2, 444.4), HeYoutian: Pt(101.7, 444.5), Escort1: Pt(100.9, 443.1), Escort2Down: Pt(102.3, 447.9) });

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
      out.push(N(`Litter${String(litters).padStart(2, "0")}`, p, { kind: "litter", name: litters === 1 ? "担架" : undefined, yaw: heading, group: "convoy", bearers: 0, straight: true, speed: 1.2 }));
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
  N("LitterDonggua", at, { kind: "litter", name: "冬瓜的担架", bearers, yaw, group: "convoy", speed: 1.2, ...extra }),
  N("Donggua", at, { down: true, onLitter: "LitterDonggua", speed: 1.2, yaw: R1((((yaw + 90) + 540) % 360) - 180), ...extra }),
];
/** 08–10-4 后送队缩在路沟东半截（担架 7 副顺着沟底排、走着的伤员 9 个贴北壁）与凹路末段（担架 5 副、伤员 7 个）。 */
function DitchConvoy() {
  const out = [];
  for (let i = 0; i < 7; i++) out.push(N(`Litter${String(i + 1).padStart(2, "0")}`, Pt(109.2 + 2.3 * i, 380.8), { kind: "litter", name: i === 0 ? "担架" : undefined, yaw: -90, group: "convoy", bearers: 0, speed: 1.2 }));
  for (let i = 0; i < 9; i++) out.push(N(`Walker${String(i + 1).padStart(2, "0")}`, Pt(108.6 + 1.85 * i, 379.15), { role: "walkingWounded", group: "convoy", yaw: 180, stance: "crouch", speed: 1.0 }));
  out.push(N("Helper01", Pt(108.6 + 1.85 * 2 + 0.92, 379.15), { role: "helper", group: "convoy", yaw: 180, stance: "crouch", speed: 1.0 }));
  out.push(N("Helper02", Pt(108.6 + 1.85 * 6 + 0.92, 379.15), { role: "helper", group: "convoy", yaw: 180, stance: "crouch", speed: 1.0 }));
  [357, 361.5, 366, 370.5, 375].forEach((z, i) => out.push(N(`Litter${String(i + 8).padStart(2, "0")}`, LZ(z, -1.15), { kind: "litter", yaw: 180, group: "convoy", bearers: 0, speed: 1.2 })));
  [356.5, 359.5, 362.5, 365.5, 368.5, 371.5, 374.5].forEach((z, i) => out.push(N(`Walker${String(i + 10).padStart(2, "0")}`, LZ(z, 1.15), { role: "walkingWounded", group: "convoy", yaw: 180, stance: "crouch", speed: 1.0 })));
  out.push(N("Helper03", LZ(359.5, 0.35), { role: "helper", group: "convoy", yaw: 180, stance: "crouch", speed: 1.0 }));
  out.push(N("Helper04", LZ(371.5, 0.35), { role: "helper", group: "convoy", yaw: 180, stance: "crouch", speed: 1.0 }));
  return out;
}
/** 10-5 / 10-6 后送队穿院子：担架顺着大门过道走，走着的伤员走前门穿前屋；给每个人一个落点。 */
const CONVOY_IN = Object.freeze({
  "10-5": Object.freeze({
    donggua: Pt(gateX, 481.6),
    litters: [Pt(gateX, 474.4), Pt(gateX, 466.5), Pt(104.2, 461.6), Pt(98.4, 455.0), Pt(98.3, 449.0), Pt(98.3, 441.5), Pt(98.6, 434.5), Pt(99.2, 427.0), Pt(99.6, 419.5), Pt(100, 412), Pt(100, 404.5), Pt(100, 397)],
    walkers: [Pt(95.8, 496.5), Pt(96.6, 493.0), Pt(95.4, 489.6), Pt(94.0, 480.6), Pt(95.4, 475.8), Pt(99.0, 474.8), Pt(103.4, 473.0), Pt(104.2, 467.2), Pt(101.4, 463.6), Pt(102.3, 457.5), Pt(102.4, 451.4), Pt(102.5, 439.5), Pt(102.4, 432.0), Pt(102.2, 423.5), Pt(102.0, 415.0), Pt(102.0, 406.5)],
    helpers: [Pt(96.4, 489.0), Pt(102.4, 463.0), Pt(101.5, 431.4), Pt(101.1, 414.4)],
    medic: Pt(106.6, 483.4), officer: Pt(103.6, 466.0), cart: Pt(gateX, 463.4),
  }),
  "10-6": Object.freeze({
    donggua: Pt(G.backDoor.x, 511.0),
    litters: [Pt(G.backDoor.x, 505.4), Pt(99.0, 499.4), Pt(102.0, 493.0), Pt(104.6, 487.4), Pt(gateX, 481.4), Pt(gateX, 475.0), Pt(gateX, 466.5), Pt(104.0, 461.6), Pt(98.4, 455.0), Pt(98.3, 448.0), Pt(98.3, 440.5), Pt(98.8, 435.5)],
    walkers: [Pt(97.3, 516.0), Pt(98.6, 519.4), Pt(96.6, 500.2), Pt(95.6, 496.0), Pt(96.4, 492.0), Pt(94.2, 480.6), Pt(95.6, 475.6), Pt(99.2, 474.8), Pt(103.4, 473.2), Pt(104.4, 467.0), Pt(101.4, 463.4), Pt(102.4, 457.0), Pt(102.4, 451.0), Pt(102.5, 439.0), Pt(102.3, 430.5), Pt(102.0, 422.0)],
    helpers: [Pt(95.6, 499.7), Pt(105.4, 466.4), Pt(101.5, 450.4), Pt(101.4, 429.9)],
    medic: Pt(98.9, 513.6), officer: Pt(103.0, 469.5), cart: Pt(107.8, 458.0),
  }),
});
function ConvoyIn(kfId) {
  const S = CONVOY_IN[kfId], out = [];
  const Toward = (p, next) => (next ? Yaw(p, next) : 180);
  const chain = [S.donggua, ...S.litters];
  out.push(...DongguaOnLitter(S.donggua, { bearers: 2, yaw: kfId === "10-6" ? 180 : Toward(S.donggua, Pt(102, 494)) }));
  S.litters.forEach((p, i) => out.push(N(`Litter${String(i + 1).padStart(2, "0")}`, p, { kind: "litter", name: i === 0 ? "担架" : undefined, yaw: Toward(p, chain[i]), group: "convoy", bearers: 2, speed: 1.2 })));
  S.walkers.forEach((p, i) => out.push(N(`Walker${String(i + 1).padStart(2, "0")}`, p, { role: "walkingWounded", group: "convoy", yaw: Toward(p, S.walkers[i - 1]), stance: "crouch", speed: 1.0 })));
  S.helpers.forEach((p, i) => out.push(N(`Helper${String(i + 1).padStart(2, "0")}`, p, { role: "helper", group: "convoy", yaw: 180, speed: 1.0 })));
  out.push(N("Medic", S.medic, { face: S.donggua, stance: "crouch" }));
  out.push(N("Officer", S.officer, { face: Pt(ST.main.x, 440), kind: "officer" }));
  out.push(C("GengCart", S.cart, { yaw: 180, straight: true, speed: 1.6 }));
  return out;
}

// 东街来的大队（10-2 起）：先头五六个，倒两三个，剩下缩到土地庙后头；喊人那个（GateIja2）把他们带回来的
const SHRINE = Pt(EY.shrine.x, EY.shrine.z);
const EastWave = () => [
  J("EastIja1", Pt(150.5, 465.6), { role: "rifleman", group: "east", down: true, yaw: 80, straight: true }),
  J("EastIja2", Pt(163.0, 464.3), { role: "rifleman", group: "east", down: true, yaw: 110, straight: true }),
  J("EastIja3", Pt(172.4, 465.9), { role: "rifleman", group: "east", down: true, yaw: 70, straight: true }),
  J("EastIja4", Pt(193.8, 466.1), { role: "rifleman", group: "east", stance: "crouch", aim: true, face: ROLLER, straight: true, name: "缩在土地庙后的" }),
  J("EastIja5", Pt(195.6, 466.4), { role: "rifleman", group: "east", stance: "crouch", face: ROLLER, straight: true }),
  J("GateIja2", Pt(197.1, 465.9), { stance: "crouch", face: ROLLER, straight: true, name: "跑去喊人的（把大队带回来了）", group: "east" }),
  J("EastIja6", Pt(EY.south.gatesX[3], ST.east.z + ST.east.halfW + 0.5), { role: "rifleman", group: "east", stance: "crouch", face: ROLLER, straight: true, guess: true, name: "贴门洞的" }),
];
const MortarTeam = () => [
  J("Mortar1", Pt(PL.mortarHide.x, PL.mortarHide.z), { stance: "crouch", face: ROLLER, straight: true, guess: true }),
  J("Mortar2", Pt(PL.mortarHide.x + 1.7, PL.mortarHide.z + 0.6), { stance: "crouch", face: ROLLER, straight: true, guess: true }),
  J("Mortar3", Pt(PL.mortarHide.x - 1.7, PL.mortarHide.z + 0.4), { stance: "crouch", face: Pt(PL.mortarHide.x, PL.mortarHide.z), straight: true, guess: true }),
];
// 北边抄后路的（10-4 起）：院子链上从东往西，最前头的已到主街东侧最南那院、北角的院门外
const NC = EY.northChain;
const NorthChain = () => [
  J("NorthIja1", Pt(NC.pocketGate.x + 0.6, NC.pocketGate.z - 2.2), { role: "rifleman", group: "north", stance: "crouch", aim: true, face: Pt(NC.pocketGate.x, NC.pocketGate.z + 4), straight: true, name: "砸北角院门的" }),
  J("NorthIja2", Pt(116.0, 455.6), { role: "rifleman", group: "north", face: Pt(NC.pocketGate.x, NC.pocketGate.z), straight: true }),
  J("NorthIja3", Pt(133.5, 456.6), { role: "rifleman", group: "north", face: Pt(NC.yard1Door.x, NC.yard1Door.z), straight: true, guess: true }),
  J("NorthIja4", Pt(148.8, 450.2), { role: "rifleman", group: "north", face: Pt(NC.yard1Door.x, NC.yard1Door.z), straight: true, guess: true }),
];
// 南边翻墙摸后门的（10-5 起）：翻南侧第一个院的南墙，往老耿家后门外的小路摸
const SC = EY.southClimb;
const SouthClimbers = () => [
  J("SouthIja1", Pt(SC.x, SC.z - 0.6), { role: "rifleman", group: "south", face: Pt(G.backDoor.x, G.compound.maxZ + 3), straight: true, climb: true, name: "翻墙的" }),
  J("SouthIja2", Pt(SC.x - 1.4, SC.z + 1.2), { role: "rifleman", group: "south", stance: "crouch", face: Pt(G.backDoor.x, G.compound.maxZ + 3), straight: true, climb: true }),
  J("SouthIja3", Pt(143.4, 488.2), { role: "rifleman", group: "south", stance: "crouch", face: Pt(SC.x, SC.z), straight: true, guess: true, name: "院里等着翻的" }),
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
    what: "干沟空了：血迹、绷带、空水壶，冬瓜不在。何有田：头一趟就抬起走了。",
    next: { text: "去凹路口", x: PL.laneHead.x - 2, z: PL.laneHead.z - 1.5, radiusM: 3 },
    how: ["冬瓜躺过的地方只剩一片血", "最后两副担架正往东南头的凹路抬", "南岸树底下停着一辆驴车", "何有田答话时没回头"],
    notes: "05-4 的人原样下到干沟。沟底的血迹 / 绷带 / 空水壶是场景摆件。老耿的车停在南岸树底下躲飞机（沟底贴着南壁）；妮儿已经蹲在凹路口边上的沟沿上捡弹壳。",
    signals: [],
    units: [
      N("Luo", Off(p61, 2.6, -0.9), { yaw: -90 }),
      N("Yaowa", Off(p61, 1.4, 1.6), { face: PL.gullyRest }),
      N("HeYoutian", Off(p61, 3.9, 1.3), { yaw: -80 }),
      N("LiuWencai", Off(p61, 4.6, -0.4), { yaw: -90 }),
      N("Squad1", Off(p61, -1.6, 1.8), { yaw: -90, guess: true }),
      N("Squad2", Off(p61, 5.8, 1.9), { yaw: -90, guess: true }),
      N("Squad3", Off(p61, -2.4, -0.6), { yaw: -90, guess: true }),
      N("Litter01", Pt(48, 151), { kind: "litter", name: "担架", yaw: Yaw(Pt(48, 151), PL.laneHead), group: "convoy", to: LZ(175) }),
      N("Litter02", Pt(42, 153.4), { kind: "litter", yaw: Yaw(Pt(42, 153.4), PL.laneHead), group: "convoy", to: LZ(175) }),
      C("GengCart", CART, { yaw: PL.cartStop.yawDeg, straight: true }),
      C("Geng", Off(CART, -1.6, -1.2), { face: CART }),
      C("Nier", NIER_RIM, { stance: "crouch", yaw: 20, climb: true }),
    ],
    pois: [POI.assembly(), POI.gullyRest(), POI.laneHead("objective"), POI.cart("landmark")],
  });

  // 06-2：契约 (58,153) 朝东；车挪到南岸树底下 (54.5,155) 以后玩家站 (50,152.5) 朝东才同时看得见车和妮儿
  const p62 = Pt(50, 152.5);
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
      N("Litter01", LZ(172, 0.6), { kind: "litter", group: "convoy", speed: 1.2 }),
      N("Litter02", Pt(63.5, 154.7), { kind: "litter", yaw: -90, group: "convoy", speed: 1.2 }),
      C("GengCart", CART, { yaw: PL.cartStop.yawDeg, straight: true }),
      C("Geng", Off(NIER_RIM, -0.9, -0.7), { face: NIER_RIM, climb: true }),
      C("Nier", NIER_RIM, { stance: "crouch", yaw: 20, climb: true }),
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
    what: "传令兵：后送队在南边停起了，前头耿家庄在响枪。老耿朝南看了好一会儿，第一个赶车往南。",
    next: { text: "跟着车进凹路", x: LZ(172).x, z: LZ(172).z, radiusM: 3 },
    how: ["传令兵边跑边喊", "老耿手上的活停了，朝南看", "车先走；班长：都跟斗走！", "车上那几箱弹药跟着车走了（CartDeparted）"],
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
      C("Geng", Pt(80.1, 154.1), { yaw: -90 }),
      C("Nier", Pt(75.9, 156.5), { yaw: -90, climb: true }),
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
  /** 小队在凹路里往前挤：路中线偏东（担架和伤员在西边、车在东边）。 */
  const SquadInLane = (z, { stance = null, withLuo = true } = {}) => [
    ...(withLuo ? [N("Luo", LS(z + 3.0, 0.3), { yaw: 180, stance: stance || undefined })] : []),
    N("Yaowa", LS(z - 1.8, 0.25), { yaw: 180, stance: stance || undefined }),
    N("HeYoutian", LS(z - 3.4, -0.3), { yaw: 180, stance: stance || undefined }),
    N("LiuWencai", LS(z + 1.2, -0.3), { yaw: 180, stance: stance || undefined }),
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
    how: ["整条路都是人，一直望到南边", "担架一副挨一副搁在地上，抬担架的蹲在杠子边喘气", "车轮在车辙里颠，弹药箱哐哐响", "幺娃凑过来：顺儿哥，攒起娶婆娘？"],
    notes: `后送队 ${SLOTS.filter((s) => s.kind === "litter").length + 1} 副担架（含冬瓜那副）、${SLOTS.filter((s) => s.kind !== "litter" && s !== DONGGUA_SLOT).length} 个走着的伤员（${SLOTS.filter((s) => s.helper).length} 个有人架着），`
      + "贴西坎从 z 190 停到 z 315；「被人背着的」预演用 VilNraCarryOnBack + VilRideOnBack 一对。车在玩家前头 6 m 靠路东边；妮儿坐在车尾（ride 挂在 GengCart 车尾沿、背对车头，预演播 VilSitEdge），车动她跟着走。",
    signals: [SIG.cartDeparted],
    units: [
      ...SquadInLane(205),
      N("Runner", LS(214.5, 0), { yaw: 180, to: LZ(300), speed: 3.2 }),
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
    what: "顺子说到「……我妹今年十二」，眼前就是车尾晃腿的妮儿。幺娃过了好一会儿：……我没听到。",
    next: { text: "往队头挤", x: LZ(294).x, z: LZ(294).z, radiusM: 3 },
    how: ["边走边说，幺娃在左手边略后", "车尾的妮儿就在正前方几步，不给特写、不点破", "台词在 Notion 07（路费 / 他舅在船上烧锅炉 / 东家拿人抵 / 卖你妈个锤子）", "前头村子的枪声时有时无"],
    notes: "台词不逐句进关键帧。车仍在玩家前头 6 m，妮儿在车尾正对着玩家。",
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
    what: "冬瓜裹着单被发抖。掀开被角：肚子上一条吸透血的毛巾。卫生兵：天黑前送不到军医手里，就表想了。",
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

  // 07-4：短过场（预演机位在东坎上 (100,330) 往南看）；飞机贴麦地飞过，全路的人往坎底下缩，妮儿最后一个趴下
  const p74 = LZ(335, 0);
  Add({
    id: "07-4", ...s07, name: "短过场·飞机和村子",
    player: { x: p74.x, z: p74.z, yawDeg: 180, pitchDeg: 4, stance: "prone" },
    what: "日机贴着麦地飞过来，路上的人全往坎底下缩；妮儿最后一个趴下。飞机没开枪。路爬出洼地，耿家庄冒着烟。",
    next: { text: "到村口路沟", x: DITCH_08.Luo.x, z: DITCH_08.Luo.z, radiusM: 3 },
    how: ["预演机位：东坎上 (100,330) 往南看一长溜担架", "老耿拽着驴往坎边靠", "妮儿是看见别人都趴下才抬头，这时飞机已经在头顶", "全班弯腰顺凹路往前跑，凹路越走越浅，麦地那头几处房顶冒烟"],
    notes: "不能操作的 20 s 短过场，关键帧只摆趴下那一拍：小队、后送队全体 prone；老耿蹲在驴边；妮儿还坐在车尾（ride），她听不见，预演里看见别人都趴了才从车尾滑下来在车边扑倒（最后一个）。飞机是预演里的 aircraft 轨（Ki-30）。",
    signals: [SIG.cartDeparted],
    units: [
      N("Luo", LS(344.0, 0.3), { yaw: 180, stance: "prone" }),
      N("Officer", LS(345.2, -0.3), { yaw: 180, stance: "prone", kind: "officer" }),
      ...SquadInLane(335, { stance: "prone", withLuo: false }),
      ...Column({ stance: "prone" }),
      ...DongguaOnLitter(DONGGUA_LITTER),
      N("Medic", LZ(DONGGUA_SLOT.z + 1.6, COLUMN_LAT + 0.9), { yaw: 180, stance: "prone" }),
      ...CartAhead(335, 6, { stance: "crouch" }),
    ],
    pois: [POI.villageMouth("objective"), POI.ditch("landmark"), Poi("Camera07_4", "短过场机位（东坎上）", "poi", Pt(100, 330), 1.5)],
  });

  // ======================= 08 村口 =======================
  const s08 = { stage: 8, stageTitle: "村口" };
  const P08 = SHOOTER.player;
  const Villagers08 = ({ arriving = false } = {}) => [
    C("Villager1", Pt(94.6, 380.2), { name: "滚进沟里的村民", stance: "crouch", face: DITCH_08.Luo, climb: true, ...(arriving ? { path: [Pt(98.4, 396), Pt(98.6, 383.5), Pt(94.6, 380.2)] } : { straight: true }) }),
    C("Villager2", Pt(101.2, 412), { down: true, yaw: 20, from: Pt(100.4, 428), fromStraight: true }),
    C("Villager3", Pt(99.0, 431), { down: true, yaw: -30, from: Pt(99.4, 440), fromStraight: true }),
    C("Villager4", Pt(102.0, 398), { yaw: 0, intent: [Pt(101.8, 386.5), Pt(103.4, 379.6)], speed: 2.4, from: Pt(101.6, 420), fromStraight: true, climb: true }),
    C("Villager5", Pt(98.6, 406), { yaw: 0, intent: [Pt(98.2, 387.5), Pt(98.0, 383.4), Pt(94.0, 379.8)], speed: 2.4, from: Pt(98.8, 430), fromStraight: true, climb: true }),
  ];
  const WindowGroup = (o = {}) => [
    J("MgGunner", MG_AT, { yaw: 0, stance: "crouch", aim: true, arc: MG_ARC, ...o }),
    J("MgLoader", MG_LOADER_AT, { yaw: 0, stance: "crouch", ...o }),
  ];
  /** 08-1 / 08-2 前屋里：分队长、两杆步枪；大门过道两个 */
  const HouseIja08 = () => [
    J("Leader", LEADER_AT, { yaw: 0, aim: true }),
    J("Rifle1", RIFLE1_ROOM, { yaw: 0, aim: true }),
    J("Rifle2", RIFLE2_ROOM, { yaw: 0, aim: true }),
    J("GateIja1", GATE_AT, { yaw: 0 }),
    J("GateIja2", GATE2_AT, { yaw: 0, aim: true }),
    J("KitchenIja", KITCHEN_IN, { yaw: 120, stance: "crouch" }),
  ];
  /** 08-3 起：两杆步枪挪到大门过道，甩手榴弹的在门楼后头 */
  const HouseIja083 = ({ runnerGone = false } = {}) => [
    J("Leader", LEADER_AT, { yaw: 0, aim: true }),
    J("Rifle1", RIFLE1_GATE, { yaw: 0, aim: true }),
    J("Rifle2", RIFLE2_GATE, { yaw: 0, aim: true }),
    J("GateIja1", GATE_AT, { yaw: 0, name: "大门过道里甩手榴弹的" }),
    ...(runnerGone ? [] : [J("GateIja2", GATE2_AT, { yaw: 0, aim: true })]),
    J("KitchenIja", KITCHEN_IN, { yaw: 120, stance: "crouch" }),
  ];
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
  /** 街口坡道上趴着压窗口的：幺娃、Squad3、刘文财（顺子是玩家） */
  const Shooters08 = (faces = {}) => ["Yaowa", "Squad3", "LiuWencai"].map((id) => N(id, SHOOTER[id], {
    stance: "prone", face: faces[id] || WINDOW, aim: !faces[id], guess: id === "Squad3", arc: faces[id] ? undefined : ArcTo(SHOOTER[id], WINDOW, 4, 4),
  }));
  /** 沟底街口西边的人：班长、老耿、妮儿、排长、卫生兵、何有田、两个后送队的兵、Squad1 / Squad2 */
  const DitchParty08 = (faces = {}) => [
    N("Luo", DITCH_08.Luo, { stance: "crouch", face: faces.Luo || WINDOW }),
    N("HeYoutian", DITCH_08.HeYoutian, { stance: "crouch", face: faces.HeYoutian || DITCH_08.Luo }),
    N("Escort1", DITCH_08.Escort1, { stance: "crouch", face: DITCH_08.Luo }),
    N("Escort2", DITCH_08.Escort2, { stance: "crouch", face: DITCH_08.Luo }),
    N("Squad1", DITCH_08.Squad1, { stance: "crouch", yaw: 180, guess: true }),
    N("Squad2", DITCH_08.Squad2, { stance: "crouch", yaw: 180, guess: true }),
    N("Officer", DITCH_08.Officer, { stance: "crouch", face: faces.Officer || DITCH_08.Luo, kind: "officer" }),
    N("Medic", DITCH_08.Medic, { stance: "crouch", face: DITCH_08.DongguaLitter }),
    C("Geng", DITCH_08.Geng, { face: faces.Geng || WINDOW }),
    C("Nier", DITCH_08.Nier, { stance: "crouch", face: DITCH_08.Geng }),
  ];
  const ConvoyInDitch = () => [...DitchConvoy(), ...DongguaOnLitter(DITCH_08.DongguaLitter, { yaw: -90 }), C("GengCart", DITCH_08.Cart, { yaw: -90, straight: true })];
  Add({
    id: "08-1", ...s08, name: "村口·窗口",
    player: { x: P08.x, z: P08.z, yawDeg: 180, pitchDeg: -1, stance: "prone" },
    what: "村民从主街往外跑，街尽头窗口里机枪打倒两个，一个滚进沟里。老耿盯着那扇窗：那是……俺家。",
    next: { text: "看清怎么过" },
    how: ["趴在路沟南沿上顺着主街看到尽头的北窗", "后送队和车缩在路沟东半截，小队在西半截", "滚进来的那个：东头……过来的……进庄了……", "窗口机枪顺着街扫"],
    notes: `趴在街口坡道上半截 (${P08.x},${P08.z})（眼刚高过街面）：主街只有 6 m 宽，趴在 x < 97 的沟沿上视线被主街西墙北头挡死，所以四个压窗口的人都在街口（契约写西半截 x 78…98）。`
      + "鬼子 08 已在老耿家：北窗机枪组 2、前屋步枪 2 + 分队长、大门过道 2、后院窖口 3（一家人还在窖里）、灶屋 1。没有人在房顶上。",
    signals: [SIG.cartDeparted],
    units: [
      ...Shooters08(), ...DitchParty08(),
      ...Villagers08({ arriving: true }),
      ...WindowGroup(), ...HouseIja08(), ...CellarGroup08(), ...MillMan(),
      ...ConvoyInDitch(),
    ],
    pois: [POI.window("danger"), POI.mainStreet("landmark"), POI.ditch("landmark"), POI.alleyMouth("landmark")],
  });

  Add({
    id: "08-2", ...s08, name: "绕不过去",
    player: { x: P08.x, z: P08.z, yawDeg: Yaw(P08, DITCH_08.Luo), pitchDeg: 6, stance: "prone" },
    what: "班长问路；老耿：两边院子都闩死了，人都钻了窖。排长：等天黑。顺子：冬瓜早凉透了！班长啐一口：打！",
    next: { text: "压窗口" },
    how: ["回头看沟底：老耿、班长、排长、卫生兵蹲在街口西边", "老耿：西边河汊子车下不去，东边是鬼子来的道", "卫生兵：这一沟伤号一半挨不到天黑", "班长：文财、幺娃、顺儿压窗口；有田，你两个跟到我"],
    notes: "墙根有个狗洞，老耿没想起来（小孩走的路）。next 只写文字：下一步还是趴在原地。",
    signals: [SIG.cartDeparted],
    units: [
      ...Shooters08({ Yaowa: DITCH_08.Luo }), ...DitchParty08({ Luo: DITCH_08.Geng, Geng: DITCH_08.Luo, Officer: DITCH_08.Luo }),
      ...Villagers08().filter((u) => !u.id.match(/Villager[45]/)),
      ...WindowGroup(), ...HouseIja08(), ...CellarGroup08(), ...MillMan(),
      ...ConvoyInDitch(),
    ],
    pois: [POI.window("danger"), POI.river(), POI.eastSide(), POI.ditch("landmark")],
  });

  // 08-3：玩家压窗口；班长带何有田和两个后送队的兵顺主街东边的门洞摸到翻倒的大车后头被压住；大门里甩出手榴弹，一个兵倒了
  const CartGroup = ({ luoFace = WINDOW } = {}) => [
    N("Luo", CART_GROUP.Luo, { stance: "crouch", face: luoFace, aim: true }),
    N("HeYoutian", CART_GROUP.HeYoutian, { stance: "crouch", face: WINDOW, aim: true }),
    N("Escort1", CART_GROUP.Escort1, { stance: "crouch", face: CART_GROUP.Luo }),
    N("Escort2", CART_GROUP.Escort2Down, { down: true, yaw: 160 }),
  ];
  const DitchRest08 = (gengFace = WINDOW) => [
    N("Squad1", DITCH_08.Squad1, { stance: "crouch", yaw: 180, guess: true }),
    N("Squad2", DITCH_08.Squad2, { stance: "crouch", yaw: 180, guess: true }),
    N("Officer", DITCH_08.Officer, { stance: "crouch", face: WINDOW, kind: "officer" }),
    N("Medic", DITCH_08.Medic, { stance: "crouch", face: DITCH_08.DongguaLitter }),
    C("Geng", DITCH_08.Geng, { face: gengFace }),
  ];
  Add({
    id: "08-3", ...s08, name: "压窗口",
    player: { x: P08.x, z: P08.z, yawDeg: 180, pitchDeg: -1, stance: "prone" },
    what: "玩家压窗口；班长四人顺街东边一个门洞一个门洞摸到翻倒的大车后头。大门里甩出手榴弹，一个兵倒了。",
    next: { text: "一直压" },
    how: ["机枪一梭打沟沿、一梭打班长：玩家一停火，机枪就掉头追着班长打", "班长：压到起！日你妈压到起啊！", "大门过道里又添了几杆枪，手榴弹从门楼后头甩出来炸在车边", "班长卡在车后头：抬不起头！"],
    notes: `大车横在主街偏东 (${CART_HIDE.x},${CART_HIDE.z})、1.15 m 高，班长四人蹲在它北侧；契约写「西边门洞 / 偏西」，但车放西半边会挡住街口看北窗的视线扇（场景生成器核过）。扔手榴弹的在大门过道里（不上房）。`,
    signals: [SIG.cartDeparted],
    units: [
      ...Shooters08(), ...CartGroup(), ...DitchRest08(),
      C("Nier", DITCH_08.Nier, { stance: "crouch", face: DITCH_08.Geng }),
      ...Villagers08().filter((u) => !u.id.match(/Villager[45]/)),
      ...WindowGroup(), ...HouseIja083(), ...CellarGroup08(), ...MillMan(),
      ...ConvoyInDitch(),
    ],
    pois: [POI.window("danger"), POI.gatePassage("danger"), POI.overturnedCart("poi"), POI.ditch("landmark")],
  });

  // 08-4：一个鬼子从大门出来，先往街里跑几步、再从北角拐去东街喊人（从街口趴着看得见他 ≥ 1.5 s）
  // 大车 1.15 m 高，趴在街口只看得见大车西边那 2.5 m 的街：他出了大门先横过小空地、贴西墙往街里跑几步（这几步看得见），再掉头从北角拐去东街
  const RUNNER_PATH = [Pt(GATE2_AT.x, GATE2_AT.z), Pt(gateX, 468.8), Pt(103.6, 462.8), Pt(99.2, 458.8), Pt(98.5, 452.0)];
  const RUNNER_INTENT = [Pt(98.6, 449.5), Pt(101.2, 451.2), Pt(104.4, 453.4), Pt(109.0, 455.2), Pt(111.0, 461.2), Pt(116.0, 463.4), Pt(119.6, 465.3), Pt(140, ST.east.z)];
  Add({
    id: "08-4", ...s08, name: "喊人的跑了",
    player: { x: P08.x, z: P08.z, yawDeg: Yaw(P08, RUNNER_PATH[4]), pitchDeg: -1, stance: "prone" },
    what: "一个鬼子从老耿家大门跑出来，横穿街口往东街跑。幺娃：跑了一个！刘文财：狗日的喊人去了！",
    next: { text: "继续压" },
    how: ["他从大门出来横过小空地、贴西墙往街里跑几步，再掉头从北角拐去东街", "大车挡着街心，只有大车西边那几步从街口看得见（≥ 1.5 s，测试核过）", "幺娃：跑了一个！往东边跑了！", "压窗口的节奏不变"],
    notes: "契约给的两个办法都用了：主街东侧最南那院的西南角收成小空地的北角，他先往街里跑几步再拐。他就是 10-2 把大队带回来的那个（id 不变：GateIja2）。",
    signals: [SIG.cartDeparted],
    units: [
      ...Shooters08(), ...CartGroup(), ...DitchRest08(),
      C("Nier", DITCH_08.Nier, { stance: "crouch", face: DITCH_08.Geng }),
      ...Villagers08().filter((u) => !u.id.match(/Villager[45]/)),
      ...WindowGroup(), ...HouseIja083({ runnerGone: true }),
      J("GateIja2", RUNNER_PATH[4], { face: RUNNER_INTENT[0], path: RUNNER_PATH, intent: RUNNER_INTENT, speed: 4.0, name: "跑去东街喊人的" }),
      ...CellarGroup08(), ...MillMan(),
      ...ConvoyInDitch(),
    ],
    pois: [Poi("RunnerIja", "跑去喊人的鬼子", "danger", RUNNER_PATH[4], 1.5), POI.pocket("landmark"), POI.eastSide(), POI.window("danger")],
  });

  // 08-5：机枪扫到沟里，妮儿被溅了一脸血，顺着路沟往西、横穿街口、钻进巷子；老耿被压住；顺子离巷子口最近
  const nier85 = Pt(88.0, 380.1);
  const geng85 = Pt(102.0, 382.3), yaowa85 = Pt(101.0, 383.1);
  Add({
    id: "08-5", ...s08, name: "妮儿跑",
    player: { x: P08.x, z: P08.z, yawDeg: Yaw(P08, nier85), pitchDeg: 2, stance: "prone" },
    what: "机枪扫到沟里，妮儿身边一个伤兵中枪，血溅了她一脸。她顺路沟往西跑，横穿街口钻进巷子。老耿：老总！俺妮儿——！",
    next: { text: "追进巷子", x: PL.alleyMouth.x, z: PL.alleyMouth.z, radiusM: 2 },
    how: ["她听不见枪声，子弹追着她脚后跟打在土里", "老耿爬出沟去追，一梭子打在他跟前，幺娃一把把他拽回来", "顺子趴的地方离巷子口最近；玩家不动，老耿就再喊一遍", "刘文财在后头吼：顺子！你狗日的往哪跑！（他以为顺子要开小差）"],
    notes: `妮儿从车尾 (${DITCH_08.Nier.x},${DITCH_08.Nier.z}) 顺沟底往西跑，到 x 80 爬上南沿进巷子口（标 climb）。老耿在南壁上被幺娃拽着。巷子口离顺子 ${R1(Dist(P08, PL.alleyMouth))} m。`,
    signals: [SIG.cartDeparted],
    units: [
      ...Shooters08({ Yaowa: geng85, LiuWencai: P08 }).filter((u) => u.id !== "Yaowa"),
      N("Yaowa", yaowa85, { stance: "crouch", face: geng85 }),
      ...CartGroup(), ...DitchRest08(nier85).filter((u) => u.id !== "Geng"),
      C("Geng", geng85, { stance: "crouch", face: nier85, climb: true }),
      C("Nier", nier85, { yaw: 90, speed: 2.6, path: [DITCH_08.Nier, nier85], intent: [Pt(ST.alleyNorth.x + 0.4, DT.z), Pt(ST.alleyNorth.x, PL.alleyMouth.z), Pt(ST.alleyNorth.x, 392)], climb: true }),
      N("Walker04", Pt(108.6 + 1.85 * 3, 379.15), { role: "walkingWounded", group: "convoy", down: true, yaw: 180, name: "妮儿身边中枪的伤兵" }),
      ...Villagers08().filter((u) => !u.id.match(/Villager[45]/)),
      ...WindowGroup(), ...HouseIja083({ runnerGone: true }), ...CellarGroup08(), ...MillMan(),
      ...ConvoyInDitch().filter((u) => u.id !== "Walker04"),
    ],
    pois: [POI.alleyMouth("objective"), Poi("NierRun", "妮儿", "poi", nier85, 1.5), POI.window("danger")],
  });

  // ======================= 09 摸进老耿家 =======================
  const s09 = { stage: 9, stageTitle: "摸进老耿家" };
  /** 09 街口的仗一直打着：三个压窗口的、大车后的班长四人、沟底的其他人、后送队 */
  const StreetFight09 = () => [
    ...Shooters08(), ...CartGroup(), ...DitchRest08(Pt(ST.alleyNorth.x, DT.z)).filter((u) => u.id !== "Geng"),
    C("Geng", Pt(101.5, 380.8), { stance: "crouch", face: Pt(ST.alleyNorth.x, DT.z) }),
    N("Walker04", Pt(108.6 + 1.85 * 3, 379.15), { role: "walkingWounded", group: "convoy", down: true, yaw: 180 }),
    ...ConvoyInDitch().filter((u) => u.id !== "Walker04"),
    ...Villagers08().filter((u) => !u.id.match(/Villager[45]/)),
  ];
  const CellarShout = () => [
    J("CellarIja1", Off(CELLAR, -0.8, -2.2), { face: CELLAR, name: "拎手榴弹在窖口吼的" }),
    J("CellarIja2", Off(CELLAR, 2.1, -0.7), { face: CELLAR, aim: true }),
    J("CellarIja3", Off(CELLAR, -1.9, 1.9), { face: CELLAR }),
    ...FamilyInCellar(),
  ];
  const p91 = Pt(ST.alleySouth.x, 445);
  const nier91 = Pt(ST.alleySouth.x + 0.6, 487.6);
  Add({
    id: "09-1", ...s09, name: "巷子",
    player: { x: p91.x, z: p91.z, yawDeg: 180, pitchDeg: 0, stance: "crouch" },
    what: "妮儿在前头拐进邻院敞着的小门。后院有鬼子吼「出来！」，地底下有人哭。机枪响就挪一段，一停就贴墙。",
    next: { text: "跟进邻院", x: PL.neighborDoor.x + 1.5, z: NB.westDoor.z, radiusM: 2 },
    how: ["巷子两边都是院墙，又窄又直", "邻院的人跑的时候没顾上关门", "街口那边一直在打：机枪回一梭就挪，一停就贴墙不动（08 自己打出来的节奏）", "只听得见，看不见：这是惨剧三下的第一下"],
    notes: "巷子口在路沟西头的南沿上（x 80），夹道往南接东西那截再往南。",
    signals: [SIG.cartDeparted],
    units: [
      C("Nier", nier91, { face: Pt(PL.neighborDoor.x + 1.3, NB.westDoor.z), speed: 2.4, path: [Pt(ST.alleyNorth.x + 0.4, DT.z), Pt(ST.alleyNorth.x, PL.alleyMouth.z), Pt(ST.alleyNorth.x, ST.alleyWest.z), Pt(ST.alleySouth.x, ST.alleyWest.z), nier91], intent: [Pt(PL.neighborDoor.x + 1.3, NB.westDoor.z), Pt(G.sharedWall.x - 1.0, G.dogHole.z)], climb: true }),
      ...StreetFight09(),
      ...WindowGroup(), ...HouseIja083({ runnerGone: true }), ...CellarShout(), ...MillMan(),
    ],
    pois: [POI.neighborDoor("objective"), POI.cellar("danger"), POI.window("landmark")],
  });

  // 09-2：狗洞：妮儿钻狗洞回了家，大人钻不过
  const p92 = Pt(G.sharedWall.x - 2.0, G.dogHole.z);
  const nier92 = Pt(G.sharedWall.x + 1.4, G.dogHole.z + 1.6);
  const NIER_HIDE = Pt(85.2, 505.1);   // 柴垛后头（南边，离侧门几步）
  Add({
    id: "09-2", ...s09, name: "狗洞",
    player: { x: p92.x, z: p92.z, yawDeg: -90, pitchDeg: -30, stance: "crouch" },
    what: "妮儿一头钻进墙根的狗洞，回了自己家后院。顺子追到洞口：大人钻不过去，也不能喊。",
    next: { text: "从缝里找她", x: PL.crack.x - 1.0, z: PL.crack.z, radiusM: 1.5 },
    how: ["狗洞 0.45 m 宽、0.4 m 高", "她从小就这么钻", "院里有鬼子，喊不得（她也听不见）", "顺着这道墙从缝里找她"],
    notes: `妮儿从狗洞钻进后院（标 through），往柴垛后头缩（${NIER_HIDE.x},${NIER_HIDE.z}）。`,
    signals: [SIG.cartDeparted],
    units: [
      C("Nier", nier92, { stance: "crouch", face: NIER_HIDE, through: true, path: [Pt(PL.neighborDoor.x - 0.9, NB.westDoor.z), Pt(PL.neighborDoor.x + DOOR_OUT, NB.westDoor.z), Pt(G.sharedWall.x - 1.0, G.dogHole.z), Pt(G.sharedWall.x + 0.9, G.dogHole.z), nier92], intent: [NIER_HIDE], speed: 1.6 }),
      ...StreetFight09(),
      ...WindowGroup(), ...HouseIja083({ runnerGone: true }), ...CellarShout(), ...MillMan(),
    ],
    pois: [POI.dogHole("poi"), POI.crack("objective"), POI.cellar("danger")],
  });

  // 09-3：墙缝：窖里的人被逼出来，汉子被刺刀捅倒；前屋有人吼着调人
  const crackEye = (() => {
    const target = CELLAR, dir = Dist({ x: G.sharedWall.x, z: G.crack.z }, target);
    return Pt(G.sharedWall.x - 0.9 * (target.x - G.sharedWall.x) / dir, G.crack.z - 0.9 * (target.z - G.crack.z) / dir);
  })();
  const MAN_BODY = Off(CELLAR, 2.5, -1.3);   // 汉子从东边爬出来就被捅倒（离窖沿 1.3 m，倒地的人会往身边最低处滑，别贴着坑沿）
  const wife93 = Off(CELLAR, -0.9, 2.3), ija3At93 = Off(CELLAR, -1.6, 2.7);
  const CellarOut = () => [
    J("CellarIja1", Off(CELLAR, -1.1, -2.6), { face: CELLAR, name: "拎手榴弹在窖口晃的" }),
    J("CellarIja2", Off(CELLAR, 3.5, -0.6), { face: MAN_BODY, aim: true }),
    J("CellarIja3", ija3At93, { face: wife93 }),
    C("CellarMan", MAN_BODY, { down: true, yaw: 100, climb: true }),
    C("CellarWife", wife93, { face: ija3At93, climb: true }),
    C("CellarGranny", Off(CELLAR, 1.4, 1.4), { yaw: 30, stance: "crouch", climb: true }),
  ];
  Add({
    id: "09-3", ...s09, name: "墙缝",
    player: { x: crackEye.x, z: crackEye.z, yawDeg: Yaw(crackEye, CELLAR), pitchDeg: -4, stance: "stand" },
    what: "墙缝里：鬼子拎着手榴弹在窖口晃，窖里的人举着手往外爬：汉子、媳妇、抱襁褓的老太太。汉子刚出来就被刺刀捅倒。",
    next: { text: "去侧门", x: G.sharedWall.x - 1.0, z: G.sideGate.z, radiusM: 1.5 },
    how: ["缝只有一指宽，眼要贴上去", "只看得见窖口那一小片", "前屋那头有人吼（分队长在调人），这伙鬼子手上加快了", "妮儿缩在柴垛后头发抖"],
    notes: `墙缝 z ${G.crack.z}、宽 ${G.crack.w} m；眼在缝后 0.9 m、对着窖口中心，场景生成器核过这条视线不被块挡。惨剧三下里的第二下。`,
    signals: [SIG.cartDeparted],
    units: [
      C("Nier", NIER_HIDE, { stance: "crouch", face: PL.sideGate }),
      ...StreetFight09(),
      ...WindowGroup(), ...HouseIja083({ runnerGone: true }), ...CellarOut(), ...MillMan(),
    ],
    pois: [POI.crack("poi"), POI.cellar("danger"), POI.sideGate("objective")],
  });

  // 09-4：侧门门缝：媳妇被拖进偏屋、婴儿被挑起、窖里炸了；这伙人往前屋跑，留一个；妮儿缩在柴垛后
  const gateCrackZ = G.sideGate.z - G.sideGate.w / 2 + (G.sideGate.w - G.sideGate.leafW) / 2;
  const gateEye = (() => {
    const target = CELLAR, dir = Dist({ x: G.sharedWall.x, z: gateCrackZ }, target);
    return Pt(G.sharedWall.x - 0.9 * (target.x - G.sharedWall.x) / dir, gateCrackZ - 0.9 * (target.z - gateCrackZ) / dir);
  })();
  const ija1Run = Pt(96.0, 489.6);
  const CellarMurder = () => [
    J("CellarIja1", ija1Run, { face: PL.roomYardDoor, to: [Pt(G.roomYardDoor.x, G.frontRoom.box.maxZ + DOOR_OUT), RIFLE1_ROOM], speed: 3.0, name: "扔完手榴弹跑去前屋的" }),
    J("CellarIja2", Off(CELLAR, 0.8, 2.4), { face: CELLAR, aim: true, name: "挑襁褓的（留下看守的那个）" }),
    J("CellarIja3", Pt(111.6, 486.0), { face: Pt(114.2, 486.2), name: "拖媳妇进偏屋的" }),
    C("CellarMan", MAN_BODY, { down: true, yaw: 100 }),
    C("CellarWife", Pt(113.4, 486.2), { face: Pt(116, 484) }),
    C("CellarGranny", Off(CELLAR, 0, 0.2), { down: true, yaw: 0, name: "老太太（炸在窖里）", climb: true }),
  ];
  Add({
    id: "09-4", ...s09, name: "侧门门缝",
    player: { x: gateEye.x, z: gateEye.z, yawDeg: Yaw(gateEye, CELLAR), pitchDeg: -3, stance: "stand" },
    what: "门缝里：媳妇被拖进偏屋；襁褓被挑起甩在窖沿上；手榴弹磕一下扔进窖里，闷响一声。这伙人往前屋跑，留下一个。",
    next: { text: "推门" },
    how: ["门缝在北侧，贴着看；顺子扶在门上的手一直在抖", "完事他们拎起枪往前屋跑，去帮着打街上的班长", "同一个门缝里，妮儿缩在柴垛后头，离侧门几步", "惨剧三下里的第三下"],
    notes: `侧门扇 ${G.sideGate.leafW} m、门洞 ${G.sideGate.w} m，北侧留 ${R2(G.sideGate.w - G.sideGate.leafW)} m 的门缝；眼在缝后 0.9 m 对着窖口（生成器核过视线）。`
      + "CellarBlast 从这一帧起为真（窖口冒烟、盖板飞开）。婴儿只是老太太怀里的包袱，不单独建人。契约机位 (80.8,500) 挪到门缝后面。",
    signals: [SIG.cartDeparted, SIG.cellarBlast],
    units: [
      C("Nier", NIER_HIDE, { stance: "crouch", face: PL.sideGate }),
      ...StreetFight09(),
      ...WindowGroup(), ...HouseIja083({ runnerGone: true }), ...CellarMurder(), ...MillMan(),
    ],
    pois: [POI.sideGate("poi"), POI.cellar("danger"), POI.sideRoom(), Poi("NierHide", "妮儿（柴垛后头）", "poi", NIER_HIDE, 1.5)],
  });

  // 09-5：门开了：妮儿拔了门闩；看守在八九米外侧着背撒尿；妮儿呜咽，按键捂嘴；看守进偏屋
  const p95 = Pt(G.sharedWall.x + 1.0, G.sideGate.z);
  const nier95 = Pt(G.sharedWall.x + 1.4, G.sideGate.z - 1.0);
  const pisser = Off(CELLAR, G.pisserOffset.x, G.pisserOffset.z);   // 侧着背、在汉子尸体边，离侧门口约 9 m
  const HouseIja09Late = () => [
    J("Leader", LEADER_AT, { yaw: 0, aim: true }),
    J("Rifle1", RIFLE1_GATE, { yaw: 0, aim: true }),
    J("Rifle2", RIFLE2_GATE, { yaw: 0, aim: true }),
    J("GateIja1", GATE_AT, { yaw: 0 }),
    J("CellarIja1", RIFLE1_ROOM, { yaw: 0, aim: true, name: "从后院跑来前屋的" }),
    J("KitchenIja", KITCHEN_IN, { yaw: 120, stance: "crouch" }),
  ];
  const CellarAfter = ({ guardIn = false } = {}) => [
    guardIn
      ? J("CellarIja2", Pt(113.2, 486.4), { face: PL.sideRoomDoor, stance: "crouch", guess: true, name: "看守（进了偏屋）" })
      : J("CellarIja2", pisser, { yaw: -150, name: "撒尿的看守（留下的那个）" }),
    J("CellarIja3", Pt(115.8, 488.2), { face: Pt(116.4, 484.4), guess: true }),
    C("CellarMan", MAN_BODY, { down: true, yaw: 100 }),
    C("CellarWife", Pt(116.4, 484.4), { down: true, yaw: 90, guess: true }),
    C("CellarGranny", Off(CELLAR, 0, 0.2), { down: true, yaw: 0 }),
  ];
  Add({
    id: "09-5", ...s09, name: "门开了",
    player: { x: p95.x, z: p95.z, yawDeg: Yaw(p95, pisser), pitchDeg: 0, stance: "crouch" },
    what: "妮儿看见门缝里是顺子的手，爬过来拔了门闩。门正对地瓜窖：看守在八九米外侧着背、在汉子尸体边撒尿。",
    next: { text: "拽她出去" },
    how: ["门一开就是触发，玩家得蹲着不动", "妮儿回头看见院里的街坊，僵住、开始呜咽；屏幕弹按键：捂住她的嘴（第一人称看得见自己的手指）", "按到了：看守系好裤子往偏屋去了；没按到：他半转身「嗯？」，正好机枪响了一梭，骂一句也去了。不判失败", "她死死攥住顺子的衣角往后坠，一步也不肯挪"],
    notes: `侧门正对窖口：门口到看守 ${R1(Dist(p95, pisser))} m，场景生成器核过门口眼高 1.2 到他看得见。其余鬼子回了偏屋（位置推测）。`,
    signals: [SIG.cartDeparted, SIG.cellarBlast, SIG.sideGateOpen],
    units: [
      C("Nier", nier95, { stance: "crouch", face: pisser, through: true }),
      ...StreetFight09(),
      ...WindowGroup(), ...HouseIja09Late(), ...CellarAfter(), ...MillMan(),
    ],
    pois: [Poi("Pisser", "撒尿的看守", "danger", pisser, 1.5), POI.cellar("landmark"), POI.mill(), POI.roomYardDoor("landmark")],
  });

  // 09-6：妮儿攥衣角不撒手；顺子抬头：透过前屋南门看见机枪组的后背
  const p96 = Pt(G.sightPost09_6.x, G.sightPost09_6.z);
  const nier96 = Pt(p96.x - 0.9, p96.z + 0.6);
  Add({
    id: "09-6", ...s09, name: "屁股对到老子",
    player: { x: p96.x, z: p96.z, yawDeg: Yaw(p96, MG_LOADER_AT), pitchDeg: -2, stance: "crouch" },
    what: "妮儿攥着衣角不撒手。抬头往院里看：前屋南门敞着，门里就是机枪组的后背，正朝着街上的班长打。",
    next: { text: "贴西墙往前屋摸", x: PL.kitchenDoor.x + 1.5, z: PL.kitchenDoor.z + 1.0, radiusM: 1.5 },
    how: ["顺子：……狗日的，屁股对到老子", "院里还有个早就死了的老汉，被自己的裤腰带反绑在石磨上（跟 02 冬瓜挨的是同一套）", "机枪响一梭挪一段，一安静就停；中途她再呜咽一次，再弹一次捂嘴", "硬拽就得出声"],
    notes: `蹲在 (${p96.x},${p96.z})（离侧门 ${R1(Dist(p96, PL.sideGate))} m）透过前屋南门（x ${G.roomYardDoor.x}）看得见副射手的后背（场景生成器核过；机枪手被前屋南墙挡）。灶屋为此收成 x 82…90、z 480…486。`,
    signals: [SIG.cartDeparted, SIG.cellarBlast, SIG.sideGateOpen],
    units: [
      C("Nier", nier96, { stance: "crouch", face: p96 }),
      ...StreetFight09(),
      ...WindowGroup(), ...HouseIja09Late(), ...CellarAfter({ guardIn: true }), ...MillMan(),
    ],
    pois: [POI.roomYardDoor("poi"), POI.window("danger"), POI.mill(), POI.kitchenDoor("objective")],
  });

  // 09-7：灶屋门口：罐子掉地，灶屋鬼子扑出来压住顺子；妮儿咬他手腕；拔大刀
  const p97 = Pt(G.kitchen.box.maxX + 1.7, G.kitchen.door.z + 1.1);
  const ija97 = Pt(G.kitchen.box.maxX + 0.7, G.kitchen.door.z + 0.1);
  const nier97 = Pt(G.kitchen.box.maxX + 2.3, G.kitchen.door.z - 0.1);
  Add({
    id: "09-7", ...s09, name: "灶屋门口",
    player: { x: p97.x, z: p97.z, yawDeg: Yaw(p97, ija97), pitchDeg: 38, stance: "prone" },
    what: "快到灶屋门口，妮儿的罐子哗啦掉地。灶屋里的鬼子扑出来把顺子撞翻，刺刀往下压；妮儿一口咬在他握枪的手腕上。",
    next: { text: "冲进前屋", x: PL.roomYardDoor.x, z: PL.roomYardDoor.z + 1.3, radiusM: 1.5 },
    how: ["玩家连按往外推，推不赢，刀尖一点点下来", "鬼子惨叫手一松：慢动作一秒半，控制交还，不出提示", "平常的键从左肩抽大刀，砍两刀，砍得乱七八糟", "妮儿嘴边沾着血蹲着发抖；前屋有人听见动静扭头往后看"],
    notes: `倒地仰视：卧姿机位朝上看（pitch +38）。鬼子站在灶屋门口（x ${G.kitchen.box.maxX}）顺子身上方，妮儿扑在他手腕边。机枪组此帧朝南扭头（yaw 180）。罐子没有体块。`,
    signals: [SIG.cartDeparted, SIG.cellarBlast, SIG.sideGateOpen],
    units: [
      J("KitchenIja", ija97, { face: p97, aim: true, name: "灶屋里的鬼子（刺刀压着顺子）" }),
      C("Nier", nier97, { stance: "crouch", face: ija97 }),
      ...StreetFight09(),
      ...WindowGroup({ yaw: 180 }).map((u) => (u.id === "MgGunner" ? { ...u, arc: MG_ARC } : u)),
      ...HouseIja09Late().filter((u) => u.id !== "KitchenIja"),
      ...CellarAfter({ guardIn: true }), ...MillMan(),
    ],
    pois: [POI.roomYardDoor("objective"), POI.window("danger")],
  });

  // ======================= 10 背后打掉机枪，守东街 =======================
  const s10 = { stage: 10, stageTitle: "背后打掉机枪，守东街" };
  const p101 = Pt(93, 476);
  const nier10 = Pt(G.kitchen.box.maxX + 1.9, G.kitchen.door.z + 1.9);   // 蹲在灶屋门外
  /** 10-1 起前屋 / 过道里倒下的鬼子 */
  const HouseDown = () => [
    J("MgGunner", Off(MG_AT, 0.4, 0.8), { down: true, yaw: 0, weapon: "Type11" }),
    J("MgLoader", Off(MG_LOADER_AT, -0.2, 0.7), { down: true, yaw: 20 }),
    J("Leader", Off(LEADER_AT, -0.2, -0.6), { down: true, yaw: 30 }),
    J("CellarIja1", Off(RIFLE1_ROOM, 0.6, 0.1), { down: true, yaw: -20 }),
    J("Rifle1", Pt(109.0, 478.6), { down: true, yaw: 10 }),
    J("GateIja1", Off(GATE_AT, 0, -0.9), { down: true, yaw: 0 }),
    J("KitchenIja", ija97, { down: true, yaw: 0 }),
  ];
  const SideRoomPair = () => [
    J("CellarIja2", Pt(113.2, 486.4), { face: PL.sideRoomDoor, stance: "crouch", guess: true, name: "看守（在偏屋里）" }),
    J("CellarIja3", Pt(115.8, 488.2), { face: Pt(116.4, 484.4), guess: true }),
    C("CellarMan", MAN_BODY, { down: true, yaw: 100 }),
    C("CellarWife", Pt(116.4, 484.4), { down: true, yaw: 90, guess: true }),
    C("CellarGranny", Off(CELLAR, 0, 0.2), { down: true, yaw: 0 }),
  ];
  const rifle2Flee = Pt(113.6, 463.6);
  Add({
    id: "10-1", ...s10, name: "背后打",
    player: { x: p101.x, z: p101.z, yawDeg: Yaw(p101, MG_AT), pitchDeg: -2, stance: "stand" },
    what: "从前屋南门冲进去，从背后打掉机枪组和大门过道里的人。机枪一哑，班长从大车后跳起来：冲！",
    next: { text: "东边来人了，去石碾", x: PRONE_AT_ROLLER.x, z: PRONE_AT_ROLLER.z, radiusM: 2 },
    how: ["屋里挤着七八个鬼子，全朝北；先打机枪组", "班长：机枪哑了！冲！日你先人冲啊！", "两面一夹，剩下一两个从大门往东街跑", "MgSilenced：窗台上的枪没了（10-2 出现在石碾后）"],
    notes: "MgSilenced 从这一帧起：机枪组、分队长、过道里的、从后院跑来的都倒了，剩一个（Rifle2）往东街跑。偏屋里那两个还在（推测）。妮儿留在灶屋门口蹲着。",
    signals: [SIG.cartDeparted, SIG.cellarBlast, SIG.sideGateOpen, SIG.mgSilenced],
    units: [
      ...HouseDown(),
      J("Rifle2", rifle2Flee, { face: Pt(ST.east.fromX + 2, ST.east.z), speed: 4.0, path: [RIFLE2_GATE, Pt(gateX, 468.6), rifle2Flee], intent: [Pt(119.5, ST.east.z), Pt(150, ST.east.z)], name: "往东街跑的" }),
      C("Nier", nier10, { stance: "crouch", face: PL.roomYardDoor }),
      N("Luo", Pt(100.2, 455.0), { aim: true, yaw: 180 }),
      N("HeYoutian", Pt(101.8, 458.5), { yaw: 180 }),
      N("Escort1", Pt(99.3, 452.3), { yaw: 180, aim: true }),
      N("Escort2", CART_GROUP.Escort2Down, { down: true, yaw: 160 }),
      N("Yaowa", Pt(99.4, 392.0), { yaw: 180, speed: 3.0 }),
      N("LiuWencai", Pt(101.6, 389.5), { yaw: 180, speed: 3.0 }),
      N("Squad3", Pt(100.3, 394.5), { yaw: 180, guess: true, speed: 3.0 }),
      ...DitchRest08(WINDOW).filter((u) => !["Officer", "Medic", "Geng"].includes(u.id)),
      N("Officer", DITCH_08.Officer, { stance: "crouch", face: WINDOW, kind: "officer" }),
      N("Medic", DITCH_08.Medic, { stance: "crouch", face: DITCH_08.DongguaLitter }),
      C("Geng", Pt(101.5, 380.8), { stance: "crouch", face: WINDOW }),
      N("Walker04", Pt(108.6 + 1.85 * 3, 379.15), { role: "walkingWounded", group: "convoy", down: true, yaw: 180 }),
      ...ConvoyInDitch().filter((u) => u.id !== "Walker04"),
      ...Villagers08().filter((u) => !u.id.match(/Villager[45]/)),
      ...SideRoomPair(), ...MillMan(),
    ],
    pois: [POI.window("poi"), POI.roller("objective"), POI.frontDoor("landmark"), POI.eastSide()],
  });

  // 10-2：石碾后守东街：大队先头五六个顺东街冲，倒两三个，剩下缩到土地庙后
  const Corner10 = ({ yaowa = Pt(108.4, 468.6), yaowaFace = PRONE_AT_ROLLER, liu = CORNER_S, liuFace = Pt(200, ST.east.z) } = {}) => [
    N("Luo", CORNER_N, { stance: "crouch", aim: true, face: Pt(190, ST.east.z) }),
    N("LiuWencai", liu, { stance: "crouch", aim: true, face: liuFace }),
    N("Yaowa", yaowa, { stance: "crouch", face: yaowaFace }),
    N("Escort1", Pt(106.8, 464.4), { stance: "crouch", face: Pt(ST.east.fromX, ST.east.z), guess: true }),
    N("Escort2", CART_GROUP.Escort2Down, { down: true, yaw: 160 }),
    N("Squad3", Pt(107.4, 463.6), { stance: "crouch", guess: true, face: Pt(180, ST.east.z) }),
  ];
  const Street10Rest = () => [
    N("Squad1", DITCH_08.Squad1, { stance: "crouch", yaw: 180, guess: true }),
    N("Squad2", DITCH_08.Squad2, { stance: "crouch", yaw: 180, guess: true }),
    N("Officer", Pt(100.4, 404), { face: MOUTH, kind: "officer" }),
    N("Medic", DITCH_08.Medic, { stance: "crouch", face: DITCH_08.DongguaLitter }),
    C("Geng", Pt(100.6, 408), { face: Pt(100, 460) }),
    N("Walker04", Pt(108.6 + 1.85 * 3, 379.15), { role: "walkingWounded", group: "convoy", down: true, yaw: 180 }),
    ...ConvoyInDitch().filter((u) => u.id !== "Walker04"),
    ...Villagers08().filter((u) => !u.id.match(/Villager[45]/)),
  ];
  const HouseAfter = () => [...HouseDown(), C("Nier", nier10, { stance: "crouch", face: PL.roomYardDoor }), ...SideRoomPair(), ...MillMan()];
  Add({
    id: "10-2", ...s10, name: "石碾·顺巷子冲",
    player: { x: PRONE_AT_ROLLER.x, z: PRONE_AT_ROLLER.z, yawDeg: -90, pitchDeg: 0, stance: "prone" },
    what: "班长：调过来！朝东打！缴来的十一年式拖到石碾后头。大队先头五六个顺东街冲，倒两三个，剩下缩到土地庙后。",
    next: { text: "压住巷子" },
    how: ["弹斗一次装六个五发桥夹，三十发；子弹只有机枪组身上那些", "两个两个贴着门洞往前跳，机枪一扫就趴", "这一步教玩家：这挺枪守得住巷子", "喊人那个鬼子就在土地庙后头"],
    notes: `石碾 (${PL.roller.x},${PL.roller.z})，趴在它西北 2.2 m 顺着东街北半边看到东头（场景生成器核过）。土地庙 (${SHRINE.x},${SHRINE.z}) 贴着南侧院墙、开口朝北，剩下的缩在它东边。`
      + "编辑器玩家拿的还是汉阳造（loadout 固定），石碾后那挺枪用随信号体块 RollerMg 表示。何有田在前屋拆机枪组的子弹袋。",
    signals: [SIG.cartDeparted, SIG.cellarBlast, SIG.sideGateOpen, SIG.mgSilenced],
    units: [
      ...Corner10(),
      N("HeYoutian", Pt(99.4, 472.6), { stance: "crouch", face: Off(MG_AT, 0.4, 0.8) }),
      ...Street10Rest(),
      ...EastWave(),
      ...HouseAfter(),
    ],
    pois: [POI.roller("poi"), POI.shrine("danger"), POI.eastEnd(), POI.gate("landmark")],
  });

  // 10-3：掷弹筒：场院麦秸垛后「嘭」，落点一发比一发近；弹斗见底
  Add({
    id: "10-3", ...s10, name: "掷弹筒",
    player: { x: PRONE_AT_ROLLER.x, z: PRONE_AT_ROLLER.z, yawDeg: -90, pitchDeg: 0, stance: "prone" },
    what: "他们不往巷子里硬挤了。场院麦秸垛后头「嘭」一声，掷弹筒开始找石碾：一发比一发近。弹斗见底。",
    next: { text: "顶住" },
    how: ["第一发落在十几米外，下一发近一点，再下一发更近", "弹斗里还剩几发、落点还差几步：玩家看得见的两个倒计时", "麦秸垛在东街北边的场院里，掷弹筒组躲它北侧", "土地庙后的人不动"],
    notes: `掷弹筒组 3 人在麦秸垛 (${PL.strawStack.x},${PL.strawStack.z}) 北侧（位置推测）。从石碾后趴着看不见麦秸垛本身（东街北墙挡着、场院开口在 45 m 外的斜角上），只听得见「嘭」、看得见冒上来的烟；落点、弹斗没有体块，预演用爆炸事件 / 说明字。`,
    signals: [SIG.cartDeparted, SIG.cellarBlast, SIG.sideGateOpen, SIG.mgSilenced],
    units: [
      ...Corner10(),
      N("HeYoutian", Pt(105.0, 468.8), { stance: "crouch", face: PRONE_AT_ROLLER }),
      ...Street10Rest(),
      ...EastWave(), ...MortarTeam(),
      ...HouseAfter(),
    ],
    pois: [POI.farmyard("danger"), POI.roller("poi"), POI.shrine("danger")],
  });

  // 10-4：砸门抄北边：北边院子砸门声往西挪，一伙人从路口北边的院子钻出来；文财、幺娃堵
  const yaowa104 = Pt(105.6, 461.8), liu104 = Pt(110.6, 462.2), pocketGate = Pt(NC.pocketGate.x, NC.pocketGate.z);
  Add({
    id: "10-4", ...s10, name: "砸门抄北边",
    player: { x: PRONE_AT_ROLLER.x, z: PRONE_AT_ROLLER.z, yawDeg: -35, pitchDeg: 0, stance: "prone" },
    what: "北边院子里「咣、咣」砸门，一个院子一个院子往西挪：一伙人要从路口北边的院子钻出来抄后路。班长：左手院子！文财、幺娃堵到！",
    next: { text: "顶住" },
    how: ["场院 → 北侧第一个院 → 主街东侧最南那院，三道门一道道砸倒（NorthYardGatesBroken）", "最前头的已经到了北角那道院门外", "文财、幺娃蹲在北角口上堵", "东街上土地庙后的人、掷弹筒都还在"],
    notes: `院子链：场院西隔墙的门 (${NC.farmyardDoor.x},${NC.farmyardDoor.z}) → 北侧第一个院西墙的门 (${NC.yard1Door.x},${NC.yard1Door.z}) → 北角北墙的院门 (${NC.pocketGate.x},${NC.pocketGate.z})，出来正好在石碾西北、背后。砸门声没有单位，预演用音效。`,
    signals: [SIG.cartDeparted, SIG.cellarBlast, SIG.sideGateOpen, SIG.mgSilenced, SIG.northYardGatesBroken],
    units: [
      ...Corner10({ yaowa: yaowa104, yaowaFace: pocketGate, liu: liu104, liuFace: pocketGate }).map((u) => (["Yaowa", "LiuWencai"].includes(u.id) ? { ...u, aim: true } : u)),
      N("HeYoutian", Pt(105.0, 468.8), { stance: "crouch", face: PRONE_AT_ROLLER }),
      ...Street10Rest(),
      ...EastWave(), ...MortarTeam(), ...NorthChain(),
      ...HouseAfter(),
    ],
    pois: [POI.pocket("danger"), POI.farmyard("danger"), POI.roller("poi")],
  });

  // 10-5：穿院子·摸后门：南边有人翻墙摸后门，有田去守；后送队穿院；妮儿抱住老耿的腿
  const p105 = Pt(102, 494);
  const geng105 = Pt(104.6, 489.8), nier105 = Pt(104.0, 489.0);
  Add({
    id: "10-5", ...s10, name: "穿院子·摸后门",
    player: { x: p105.x, z: p105.z, yawDeg: Yaw(p105, Pt(gateX, 480)), pitchDeg: -3, stance: "stand" },
    what: "南边有人翻墙往后门摸，班长：有田！滚去后门守到！后送队顺着主街进了老耿家。妮儿扑过去抱住老耿的腿。",
    next: { text: "去后门", x: G.backDoor.x + 1.2, z: G.compound.maxZ - 3.4, radiusM: 2 },
    how: ["东街的枪打不进院子，往南的路正好从老耿家后头出去", "担架一副一副从大门过道抬进来，走着的伤员穿前屋", "老耿看了一眼地上的人，又看了一眼顺子，什么也没说", "南边翻墙的在南侧第一个院的南墙上"],
    notes: `南边翻墙的 2–3 人在 (${SC.x},${SC.z}) 一带翻南院墙（标 climb），往后门外小路摸。石碾后的机枪这帧由 Squad3 顶着（推测，玩家在院里）。后送队：担架走大门过道、走着的走前门穿前屋；只有排在前头的进了村，队尾还在主街上。`,
    signals: [SIG.cartDeparted, SIG.cellarBlast, SIG.sideGateOpen, SIG.mgSilenced, SIG.northYardGatesBroken],
    units: [
      N("HeYoutian", Pt(98.8, 503.2), { stance: "crouch", aim: true, yaw: 180 }),
      N("Luo", CORNER_N, { stance: "crouch", aim: true, face: Pt(190, ST.east.z) }),
      N("LiuWencai", liu104, { stance: "crouch", aim: true, face: pocketGate }),
      N("Yaowa", yaowa104, { stance: "crouch", aim: true, face: pocketGate }),
      N("Squad3", PRONE_AT_ROLLER, { stance: "prone", aim: true, yaw: -90, guess: true, arc: { halfDeg: 8, rangeM: 120 } }),
      N("Escort1", Pt(106.8, 464.4), { stance: "crouch", face: Pt(ST.east.fromX, ST.east.z), guess: true }),
      N("Escort2", CART_GROUP.Escort2Down, { down: true, yaw: 160 }),
      N("Squad1", Pt(113.4, 462.6), { stance: "crouch", aim: true, face: Pt(180, ST.east.z), guess: true }),
      N("Squad2", Pt(115.4, 469.0), { stance: "crouch", face: Pt(180, ST.east.z), guess: true }),
      ...ConvoyIn("10-5"),
      C("Geng", geng105, { face: Pt(G.backDoor.x, G.compound.maxZ) }),
      C("Nier", nier105, { stance: "crouch", face: geng105 }),
      ...EastWave(), ...MortarTeam(), ...NorthChain(), ...SouthClimbers(),
      ...HouseDown(), ...SideRoomPair(), ...MillMan(),
      ...Villagers08().filter((u) => !u.id.match(/Villager[45]/)),
    ],
    pois: [POI.southClimb(), POI.backDoor("objective"), POI.gate("poi"), POI.mill()],
  });

  // 10-6：后门：老耿挪缸开后门，担架往外抬；幺娃接过机枪（接 11）
  const p106 = Pt(G.backDoor.x, G.compound.maxZ + 2.0);
  const geng106 = Pt(100.4, 502.8);
  Add({
    id: "10-6", ...s10, name: "后门",
    player: { x: p106.x, z: p106.z, yawDeg: 180, pitchDeg: -2, stance: "stand" },
    what: "老耿挪开水缸、拔开朝南的后门，何有田端着枪守在门边，担架一副一副往外抬。班长：幺娃，接到！幺娃接过机枪。",
    next: { text: "（接 11）车先走" },
    how: ["老耿站在缸西边把缸往东推开 1.7 m（BackVatMoved），再拔门闩把门板拉开到西墙边（BackDoorOpen）", "后门外的小路一直通到村南口", "弹斗快空了，掷弹筒落到石碾跟前", "11 开头：车先走；文财跟着去；幺娃卸枪栓扔进水缸、何有田最后出门拴上绳子"],
    notes: `11 这次不做。班长还在东街口顶着；北边、南边的鬼子位置照 10-4 / 10-5。缸挪开后在 (${G.backVatMoved.x},${G.backVatMoved.z})（门口东边，PrevizVillage VilPushVat 推 1.7 m 的落点）。`,
    signals: [SIG.cartDeparted, SIG.cellarBlast, SIG.sideGateOpen, SIG.mgSilenced, SIG.northYardGatesBroken, SIG.backVatMoved, SIG.backDoorOpen],
    units: [
      C("Geng", geng106, { face: PL.backDoor }),
      N("HeYoutian", Pt(96.6, 504.6), { stance: "crouch", aim: true, yaw: 180 }),
      C("Nier", Pt(100.0, 501.6), { stance: "crouch", face: geng106 }),
      ...ConvoyIn("10-6"),
      N("Yaowa", PRONE_AT_ROLLER, { stance: "prone", aim: true, weapon: "Type11", yaw: -90, arc: { halfDeg: 8, rangeM: 120 } }),
      N("Luo", CORNER_N, { stance: "crouch", aim: true, face: Pt(190, ST.east.z) }),
      N("LiuWencai", liu104, { stance: "crouch", aim: true, face: pocketGate }),
      N("Squad3", Pt(109.8, 468.6), { stance: "crouch", guess: true, face: Pt(180, ST.east.z) }),
      N("Escort1", Pt(106.8, 464.4), { stance: "crouch", face: Pt(ST.east.fromX, ST.east.z), guess: true }),
      N("Escort2", CART_GROUP.Escort2Down, { down: true, yaw: 160 }),
      N("Squad1", Pt(113.4, 462.6), { stance: "crouch", aim: true, face: Pt(180, ST.east.z), guess: true }),
      N("Squad2", Pt(115.4, 469.0), { stance: "crouch", face: Pt(180, ST.east.z), guess: true }),
      ...EastWave(), ...MortarTeam(), ...NorthChain(), ...SouthClimbers(),
      ...HouseDown(), ...SideRoomPair(), ...MillMan(),
      ...Villagers08().filter((u) => !u.id.match(/Villager[45]/)),
    ],
    pois: [POI.backDoor("poi"), POI.villageSouth(), POI.roller("landmark")],
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
  { id: "D", name: "巷子与邻院", stages: [8, 9], box: { minX: 55, maxX: 82, minZ: 382, maxZ: 507 } },
  { id: "E", name: "老耿家", stages: [9, 10], box: { minX: 81, maxX: 119, minZ: 469, maxZ: 508 } },
  { id: "F", name: "东街与两侧院子（场院 / 土地庙）", stages: [10, 10], box: { minX: 118, maxX: 235, minZ: 438, maxZ: 492 } },
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
      gameVersion: `Notion 06–10 剧本（2026-10-19 用户拍板）+ 第二版契约 §2–§4（${L0610_VERSION}）`,
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
