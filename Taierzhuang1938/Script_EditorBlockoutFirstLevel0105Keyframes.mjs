// ===========================================================================
// Script_EditorBlockoutFirstLevel0105Keyframes.mjs —— 第一关 01–05 新剧本白盒（关卡键 FirstLevel0105）的关键帧配置生成器
//
//   node Taierzhuang1938/Script_EditorBlockoutCli.mjs export FirstLevel0105 --force   → Blockout/FirstLevel0105.json
//
// 口径：
//   · 剧本（台词、谁做什么）以 Notion「第一关｜往南的路 · 剧本」01–05 为准；距离、站位以子页「空间拓扑关系」为准，
//     后者已换算成世界坐标写在 Data_EditorBlockoutFirstLevel0105Space.mjs —— 本文件所有坐标都从那里算（L0105_PLACES、
//     L0105_TRENCHES + PointAlong、L0105_ROAD），不手抄数字。要挪地方先改锚点表，再重跑两个生成器。
//   · 每一拍先让玩家亲眼看到出了什么事，再给一句话的下一步；下一步指着一个看得见的东西；
//     「掩护」「清理」「护送」这类词不进 next。
//   · 坐标 X 向东、Z 向南、米；yawDeg 0 朝北、+90 朝西、−90 朝东、180 朝南（同 Script_EditorBlockoutConfig）。
//
// 走位：同一个人在相邻关键帧里 id 不变；生成时按壕沟网（前沿沟、交通沟、支沟、爬沟 + 坑 / 洞里的连线）自动排 path，
// 不让人直线穿过沟壁 / 洞顶；野地里的人（日军跃进、坡沿上的兵、集结处）走直线。只在新帧出现的人写 path 起点「走进来」，
// 只在旧帧的人写 intent「走出去」。
//
// 摆位检查（push 进 issues，CLI 打出来）：玩家 / 单位出界；玩家站进实心块、单位站进高块（读 Blockout/FirstLevel0105.scene.json，
// 按两帧 signals 算 gates）；两人重叠（< 0.6 m）、人站在被子 / 担架上；人站在车身上；过渡路线穿高块；
// 两端都在沟里的过渡路线离开沟（沟壁翻不过去）、路线上 1 m 内高差超过 1.2 m（场景高度网格）。
// 纯函数式生成：不读时钟、不读 git（commit / generatedAt 由 CLI 传进来）；只在 node 里读场景文件做检查。
// ===========================================================================

import { BLOCKOUT_SCHEMA, PlanTransition, NormalizeBlockout, YawDegFromTo } from "./Script_EditorBlockoutConfig.mjs";
import {
  L0105_LEVEL_KEY, L0105_TITLE, L0105_BOUNDS, L0105_PLACES as PL, L0105_TRENCHES as TR, L0105_TRENCH_SECTION,
  L0105_ROAD, L0105_FRONT_LOST_FROM_X, L0105_SIGNALS as SIG, PointAlong, LineLength,
  L0105_GULLY, L0105_GULLY_POCKETS, L0105_SUNKEN_LANE, L0105_PROPS, L0105_BRIDGE, InGullyFloor, PointBeside,
  L0105_RUSH_STATIONS, L0105_RUSH_KEY, L0105_RUSH_FALLEN, RushStation,
  L0105_DITCH_SQUAD, DitchSquadStart, DitchSquadFallenAt, DitchEmerge, L0105_PIT_NORTH, ScarpZ,
} from "./Data_EditorBlockoutFirstLevel0105Space.mjs";

export const FIRST_LEVEL_0105_GENERATOR = "Script_EditorBlockoutCli.mjs export FirstLevel0105";

// ---------------------------------------------------------------------------
// 小工具

const R2 = (v) => Math.round(v * 100) / 100;
const R1 = (v) => Math.round(v * 10) / 10;
const Pt = (x, z) => ({ x: R2(x), z: R2(z) });
const Dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const Yaw = (from, to) => R1(YawDegFromTo(from, to));

/** 折线上按弧长取点，再往行进方向左手边偏 lat 米（左 = 面朝行进方向的左边）。 */
function Along(line, d, lat = 0) {
  const p = PointAlong(line, d);
  const r = p.headingYawDeg * Math.PI / 180;
  // 前方 (−sin, −cos)；左手 = 前方逆时针转 90°（俯视 X 东 Z 南）= (−cos, +sin)
  return { x: R2(p.x - Math.cos(r) * lat), z: R2(p.z + Math.sin(r) * lat), heading: R1(p.headingYawDeg) };
}

/** 沿线往回看（朝弧长减小的方向）的朝向。 */
function BackYaw(line, d) { return R1(((PointAlong(line, d).headingYawDeg + 360) % 360) - 180); }

/** 一条折线上某点的弧长参数（最近点）。 */
function Station(line, p) {
  let best = { d: 0, dist: Infinity }, walked = 0;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1], b = line[i], len = Dist(a, b);
    const t = len > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.z - a.z) * (b.z - a.z)) / (len * len))) : 0;
    const q = { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
    const dist = Dist(p, q);
    if (dist < best.dist) best = { d: walked + len * t, dist };
    walked += len;
  }
  return best.d;
}

/** 折线在弧长 d0 → d1 之间的那一截（含两端；d1 < d0 时倒着走）。 */
function Slice(line, d0, d1) {
  const out = [];
  const Push = (p) => { const last = out[out.length - 1]; if (!last || Dist(last, p) > 0.05) out.push(Pt(p.x, p.z)); };
  Push(PointAlong(line, d0));
  const cum = [0];
  for (let i = 1; i < line.length; i++) cum.push(cum[i - 1] + Dist(line[i - 1], line[i]));
  if (d1 >= d0) { for (let i = 0; i < line.length; i++) if (cum[i] > d0 && cum[i] < d1) Push(line[i]); }
  else { for (let i = line.length - 1; i >= 0; i--) if (cum[i] < d0 && cum[i] > d1) Push(line[i]); }
  Push(PointAlong(line, d1));
  return out;
}

/** 前沿沟上 x = 给定值的那一点（沟口以东 / 以西的折线段 x 单调）。 */
export function FrontAtX(x, lat = 0) {
  const line = TR.front;
  let walked = 0;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1], b = line[i], len = Dist(a, b);
    if (b.x !== a.x && (x - a.x) * (x - b.x) <= 0) return Along(line, walked + len * (x - a.x) / (b.x - a.x), lat);
    walked += len;
  }
  return Along(line, LineLength(line), lat);
}

// ---------------------------------------------------------------------------
// 几条常用的线（都从锚点算）

const TRAFFIC = TR.traffic;
const BRANCH = TR.branch;
const BRANCH_LEN = LineLength(BRANCH);
/** 拖单被的路线：防炮洞口 → 支沟 → 支沟口 → 交通沟往南 → 拐角 2 → 路口（板桥底下）→ 坡顶 → 坡道下到干沟 → 顺沟底往东（坑窝 A → 中弯）→ 支沟里冬瓜躺的地方。 */
export const DRAG = Object.freeze([
  PL.dugoutMouth, PL.branchMouth,
  ...TRAFFIC.slice(TRAFFIC.findIndex((p) => p.x === PL.corner2.x && p.z === PL.corner2.z)),
  ...L0105_GULLY.line.slice(1, L0105_GULLY.line.findIndex((p) => p.x === L0105_GULLY_POCKETS.mid.x && p.z === L0105_GULLY_POCKETS.mid.z) + 1),
  PL.donguaRest,
].map((p) => Object.freeze({ x: p.x, z: p.z })));
const D_BRANCH_MOUTH = BRANCH_LEN;                                                  // 约 41 m（Notion 43）
const PROP = (id) => L0105_PROPS.find((p) => p.id === id);
const D_CRATE = BRANCH_LEN - PROP("CrateStack_B1").d;                               // 约 22 m：支沟里那垛弹药箱（第一次躲）
const D_CORNER2 = Station(DRAG, PL.corner2);                                        // 约 62 m（Notion 63）
const D_CROSSING = Station(DRAG, PL.crossing);                                      // 约 92 m（Notion 93）
const D_CREST = Station(DRAG, PL.crest);                                            // 约 107 m（Notion 108）
const T_CORNER1 = Station(TRAFFIC, PL.corner1);
const T_BEND = Station(TRAFFIC, PL.bend);
const T_SOUTH_END = Station(TRAFFIC, PL.southLegEnd);
const T_BRANCH = Station(TRAFFIC, PL.branchMouth);
const T_CORNER2 = Station(TRAFFIC, PL.corner2);
const T_CROSSING = Station(TRAFFIC, PL.crossing);
const T_CREST = Station(TRAFFIC, PL.crest);
const T_END = LineLength(TRAFFIC);

const T = (d, lat = 0) => Along(TRAFFIC, d, lat);       // 交通沟（往南走，左手 = 东）
const B = (d, lat = 0) => Along(BRANCH, d, lat);        // 支沟（从支沟口往东走，左手 = 北）
const D = (d, lat = 0) => Along(DRAG, d, lat);          // 拖行路线（从洞口往西 / 南走；支沟里左手 = 南，交通沟里左手 = 东）
export { Along as AlongLine };

/** 路：取离路口 m 米（往东北回溯为正）的点，朝向 = 往西南开。 */
const ROAD_D_CROSSING = Station(L0105_ROAD, PL.crossing);
function RoadBack(m, lat = 0) { return Along(L0105_ROAD, ROAD_D_CROSSING - m, lat); }
function RoadRoute(from, to) { return Slice(L0105_ROAD, Station(L0105_ROAD, from), Station(L0105_ROAD, to)).slice(1); }

// ---------------------------------------------------------------------------
// 壕沟网：沟中心线 + 坑 / 洞里的连线。自动排路线用（Dijkstra），也给「两端在沟里的过渡不许离开沟」那条检查用。

const PIT_LINKS = Object.freeze([
  [PL.mouth, { x: PL.mouth.x, z: PL.pit.z + PL.pit.d / 2 - 0.5 }, PL.pit],   // 沟口 → 台阶 → 坑心
  [PL.pit, PL.fireA], [PL.pit, PL.zb26], [PL.pit, TR.crawlSap[0]],
  [TR.crawlSap[TR.crawlSap.length - 1], PL.fireC],
  [PL.dugoutMouth, PL.dugout, { x: PL.dugout.x + PL.dugout.w / 2 - 1, z: PL.dugout.z }], // 洞口 → 洞里
  [TRAFFIC[TRAFFIC.length - 1], L0105_GULLY.line[1]],                                   // 交通沟坡道口 → 干沟沟底
]);
// 干沟（弯沟）中心线与支沟也算在网上：沟底里沿中心线走，不抄直线翻坎
const NET_LINES = Object.freeze([TR.front, TRAFFIC, BRANCH, TR.crawlSap, L0105_GULLY.line, L0105_GULLY.branch, ...PIT_LINKS]);
/** 「在沟里」的余量：沟底半宽 + 0.6 m。 */
const NET_SNAP_M = L0105_TRENCH_SECTION.traffic.floorW / 2 + 0.6;
/** 能自由走动的开挖区（坑、洞、散兵坑）：在里面就算在网上（集结处干沟另算，见 InGullyFloor）。 */
const OPEN_AREAS = Object.freeze([
  { x: PL.pit.x, z: PL.pit.z, hw: PL.pit.w / 2 + 0.3, hd: PL.pit.d / 2 + 0.3 },
  { x: PL.dugout.x, z: PL.dugout.z, hw: PL.dugout.w / 2 + 0.3, hd: PL.dugout.d / 2 + 0.3 },
  { x: PL.fireC.x, z: PL.fireC.z, hw: PL.fireC.radiusM + 0.3, hd: PL.fireC.radiusM + 0.3 },
]);
const InArea = (a, p) => Math.abs(p.x - a.x) <= a.hw && Math.abs(p.z - a.z) <= a.hd;

const NET = (() => {
  const nodes = [];
  const Key = (p) => `${p.x.toFixed(2)},${p.z.toFixed(2)}`;
  const index = new Map();
  const Node = (p) => {
    const k = Key(p);
    if (!index.has(k)) { index.set(k, nodes.length); nodes.push({ x: p.x, z: p.z }); }
    return index.get(k);
  };
  const raw = [];
  for (const line of NET_LINES) for (let i = 1; i < line.length; i++) { Node(line[i - 1]); Node(line[i]); raw.push([line[i - 1], line[i]]); }
  // 某条线的端点落在另一条线中段（沟口、支沟口）：在那里断开，连成路口
  const edges = [];
  for (const [a, b] of raw) {
    const len = Dist(a, b);
    const cuts = [];
    for (const n of nodes) {
      const t = ((n.x - a.x) * (b.x - a.x) + (n.z - a.z) * (b.z - a.z)) / (len * len);
      if (t <= 1e-6 || t >= 1 - 1e-6) continue;
      if (Dist(n, { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t }) < 0.3) cuts.push({ t, n });
    }
    cuts.sort((p, q) => p.t - q.t);
    const chain = [a, ...cuts.map((c) => c.n), b];
    for (let i = 1; i < chain.length; i++) edges.push([Node(chain[i - 1]), Node(chain[i])]);
  }
  return { nodes, edges };
})();

function NearestOnNet(p) {
  let best = null;
  NET.edges.forEach(([i, j], e) => {
    const a = NET.nodes[i], b = NET.nodes[j], len = Dist(a, b);
    const t = len > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.z - a.z) * (b.z - a.z)) / (len * len))) : 0;
    const q = { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
    const dist = Dist(p, q);
    if (!best || dist < best.dist) best = { e, t, q, dist };
  });
  return best;
}

/** 点在不在沟里 / 坑里 / 洞里。 */
function OnNet(p) {
  if (OPEN_AREAS.some((a) => InArea(a, p))) return true;
  return NearestOnNet(p).dist <= NET_SNAP_M;
}

/**
 * 沿壕沟网从 a 走到 b 的折线（不含 a，含 b）。两端都不在网上（野地、集结处）→ 直线 [b]。
 * 一端在网上、一端在野地：网上那一端沿沟走到离野地那端最近的网点，再直线过去。
 */
export function TrenchRoute(a, b) {
  const aOn = OnNet(a), bOn = OnNet(b);
  if (!aOn && !bOn) return [Pt(b.x, b.z)];
  const sa = NearestOnNet(a), sb = NearestOnNet(b);
  const nodes = NET.nodes.map((n) => ({ ...n }));
  const adj = nodes.map(() => []);
  const Link = (i, j) => { const w = Dist(nodes[i], nodes[j]); adj[i].push([j, w]); adj[j].push([i, w]); };
  // 把 a、b 的投影点插进它们所在的边
  const ia = nodes.push({ ...sa.q }) - 1, ib = nodes.push({ ...sb.q }) - 1;
  adj.push([], []);
  NET.edges.forEach(([i, j], e) => {
    const cuts = [];
    if (e === sa.e) cuts.push({ t: sa.t, n: ia });
    if (e === sb.e) cuts.push({ t: sb.t, n: ib });
    cuts.sort((p, q) => p.t - q.t);
    const chain = [i, ...cuts.map((c) => c.n), j];
    for (let k = 1; k < chain.length; k++) Link(chain[k - 1], chain[k]);
  });
  // Dijkstra（节点不到一百个，线性扫就够）
  const dist = nodes.map(() => Infinity), prev = nodes.map(() => -1), done = nodes.map(() => false);
  dist[ia] = 0;
  for (;;) {
    let u = -1;
    for (let i = 0; i < nodes.length; i++) if (!done[i] && dist[i] < Infinity && (u < 0 || dist[i] < dist[u])) u = i;
    if (u < 0 || u === ib) break;
    done[u] = true;
    for (const [v, w] of adj[u]) if (dist[u] + w < dist[v]) { dist[v] = dist[u] + w; prev[v] = u; }
  }
  const chain = [];
  for (let u = ib; u >= 0; u = prev[u]) chain.unshift(nodes[u]);
  const out = [];
  const Push = (p) => { const last = out.length ? out[out.length - 1] : a; if (Dist(last, p) > 0.15) out.push(Pt(p.x, p.z)); };
  for (const p of chain) Push(p);
  Push(b);
  // 去掉共线的中间点
  const pts = [a, ...out];
  const keep = [];
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
 *   face {x,z} | yaw   朝向；name / castId（定妆角色，预演动嘴用）/ kind / role / group / weapon / stance / aim / down / lie / bearers / arc / speed / guess
 *                      （lie:"along" = 倒地的人顺着朝向躺、头朝前，§3；被子上 / 担架上的伤员用）
 *   from {x,z}|[..]   只在本帧出现：从这里走进来（path 起点）
 *   path [..]          显式来路（不含上一帧的起点）
 *   to {x,z}|[..]      即将去：沿壕沟网排 intent（数组 = 依次经过，每段都沿网排）
 *   intent [..]        显式去向
 *   straight           上一帧过来走直线（野地里的人、战车）
 *   buried             不做实心块检查（被埋在塌土里的冬瓜）
 *   climb              来去要翻沟沿 / 跳进沟（日军从路边跳进支沟、翻出北沿），不报高差
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
  if (o.down && o.lie) u.lie = o.lie;
  if (o.bearers !== undefined) u.bearers = o.bearers;
  if (o.arc) u.arc = o.arc;
  if (o.speed) u.speedMps = o.speed;
  if (o.path) u.path = o.path.map((p) => Pt(p.x, p.z));
  else if (o.from) {
    const froms = Array.isArray(o.from) ? o.from : [o.from];
    const route = [Pt(froms[0].x, froms[0].z)];
    let cur = froms[0];
    for (const p of [...froms.slice(1), at]) { route.push(...(o.fromStraight ? [Pt(p.x, p.z)] : TrenchRoute(cur, p))); cur = p; }
    u.path = route;
  }
  if (o.intent) u.intent = o.intent.map((p) => Pt(p.x, p.z));
  else if (o.to) {
    const tos = Array.isArray(o.to) ? o.to : [o.to];
    const route = [];
    let cur = at;
    for (const p of tos) { route.push(...(o.toStraight ? [Pt(p.x, p.z)] : TrenchRoute(cur, p))); cur = p; }
    u.intent = route;
  }
  if (o.guess) u.guess = true;
  META.set(u, { straight: !!o.straight, buried: !!o.buried, climb: !!o.climb, explicitPath: !!(o.path || o.from), onLitter: o.onLitter || null });
  return u;
}

const Poi = (id, name, kind, at, radiusM = 2) => ({ id, name, kind, x: R2(at.x), z: R2(at.z), radiusM });
const ArcTo = (from, to, halfDeg, extraM = 6) => ({ halfDeg, rangeM: R1(Dist(from, to) + extraM), yawDeg: Yaw(from, to) });

// 常用 POI
const POI = {
  dugout: () => Poi("Dugout", "防炮洞", "landmark", PL.dugout, 3),
  branchMouth: (kind = "landmark") => Poi("BranchMouth", "支沟口（台阶）", kind, PL.steps, 2.5),
  branchGun: () => Poi("BranchGun", "日军机枪（支沟沿）", "danger", PL.enemyBranchGun, 2),
  corner2: (kind = "landmark") => Poi("Corner2", "拐角 2", kind, PL.corner2, 2.5),
  crossing: (kind = "landmark") => Poi("Crossing", "路口", kind, PL.crossing, 3),
  crest: (kind = "landmark") => Poi("Crest", "坡顶", kind, PL.crest, 3),
  assembly: (kind = "landmark") => Poi("Assembly", "集结处", kind, PL.assembly, 6),
  mouth: (kind = "landmark") => Poi("Mouth", "沟口", kind, PL.mouth, 2.5),
  pit: (kind = "landmark", name = "机枪坑") => Poi("Pit", name, kind, PL.pit, 4),
  fireA: (kind = "poi") => Poi("FireA", "甲 · 坑沿（朝北）", kind, PL.fireA, 1.2),
  fireB: (kind = "poi") => Poi("FireB", "乙 · 沟口（朝东）", kind, PL.fireB, 1.2),
  fireC: (kind = "poi") => Poi("FireC", "丙 · 散兵坑（朝西北）", kind, PL.fireC, 1.5),
  corner1: (kind = "landmark") => Poi("Corner1", "拐角 1", kind, PL.corner1, 2.5),
  mortar: () => Poi("Mortar", "掷弹筒（只看得见烟）", "danger", PL.mortar, 6),
  frontLost: (beat) => Poi("FrontLost", "前沿沟东段已丢", "danger", FrontAtX(L0105_FRONT_LOST_FROM_X[beat] + 12), 6),
};

// ---------------------------------------------------------------------------
// 人物（有名字的）

const NRA = {
  Luo: { name: "罗班长", role: "squadLeader", castId: "luo" },
  Donggua: { name: "冬瓜", role: "comrade", castId: "comrade" },
  Yaowa: { name: "幺娃", castId: "yaowa" },
  LiuWencai: { name: "刘文财", castId: "liuwencai" },
  HeYoutian: { name: "何有田", castId: "heyoutian" },
  Runner: { name: "传令兵", role: "runner", castId: "runner" },
  Gunner: { name: "机枪手", role: "machineGun", weapon: "Zb26" },
  Medic: { name: "卫生兵", role: "medic" },
};
const N = (id, at, o = {}) => U(id, "nra", at, { ...(NRA[id] || {}), ...o });
const IJA = {
  IjaJia: { name: "甲", role: "leader", group: "vanguard", castId: "ijaA" },
  IjaYi: { name: "乙", role: "bayonet", group: "vanguard", castId: "ijaB" },
  IjaDing: { name: "丁", role: "recruit", group: "vanguard", castId: "ijaD" },
  IjaMgGunner: { name: "支沟机枪", role: "machineGun", weapon: "Type11", group: "vanguard", castId: "ijaC" },
  IjaMgLoader: { name: "副射手", role: "loader", group: "vanguard" },
  Interpreter: { name: "翻译", role: "interpreter", group: "vanguard", castId: "interpreter" },
  Tank: { name: "战车", kind: "tank", group: "tank" },
};
const J = (id, at, o = {}) => U(id, "ija", at, { ...(IJA[id] || {}), ...o });

// ---------------------------------------------------------------------------
// 固定站位

const SIT = Object.freeze({
  // 洞里（01-1）：玩家坐在出生点，冬瓜挨着；班长在洞口背影；幺娃蹲着数炮；刘文财分子弹；何有田缩在帽子底下
  player: { x: 66.5, z: 64.2 },
});
// 01-4 起的塌洞口：玩家趴在洞口北半边（腰被横木压住，脸朝支沟），冬瓜埋在南半边的塌土里
const PINNED = Pt(PL.dugoutMouth.x + 0.3, PL.dugoutMouth.z - 0.7);
const BURIED = Pt(PL.dugoutMouth.x + 0.6, PL.dugoutMouth.z + 1.0);
// 支沟机枪组（架在支沟北沿上，顺沟朝西压住支沟口）
const MG_AT = Pt(PL.enemyBranchGun.x, PL.enemyBranchGun.z);
const MG_LOADER_AT = Pt(PL.enemyBranchGun.x + 1.3, PL.enemyBranchGun.z - 0.2);
const MG_ARC = ArcTo(MG_AT, PL.branchMouth, 5, 4);
// 01-4 起罗班长的人分两拨：
//   压制组（何有田 + 一个弟兄）留在支沟口台阶上，一直顺着笔直的支沟朝洞口打，把北沿那挺机枪钉住；
//   迂回组（班长、刘文财 + 两个弟兄）在支沟口往南 10 m 处爬出交通沟，贴支沟南沿土垄外侧往东爬三十多米到审问处对面。
const STEPS_GROUP = Object.freeze({ HeYoutian: B(1.2, 1.1), Squad1: B(1.0, -1.1) });
const OUTFLANK_IDS = Object.freeze(["Luo", "LiuWencai", "Squad2", "Squad3"]);
/** 南沿土垄外侧的爬行线：沿支沟从支沟口量 d、往南偏 6.2 m（场景生成器 L0105_OUTFLANK_CRAWL_LAT 同值）。 */
export const OUTFLANK_CRAWL_LAT = -6.2;
export const OUTFLANK_FIRE_LAT = -6.4;      // 02-1 趴在土垄背后等（再往里沟底的人就看得见枪管）
export const OUTFLANK_RIM_LAT = -4.2;       // 02-2 起身到土垄顶 / 南沿上往下打
const Crawl = (d, lat = OUTFLANK_CRAWL_LAT) => B(d, lat);
const OUTFLANK_CRAWL_014 = Object.freeze({ Luo: 14.0, LiuWencai: 12.4, Squad2: 10.8, Squad3: 9.2 });   // 01-4：刚爬出来
export const OUTFLANK_FIRE_021 = Object.freeze({ Luo: 35.4, LiuWencai: 33.2, Squad2: 37.6, Squad3: 31.0 });   // 02-1：审问处（d≈35.6）正对面
// 坑里（03）
const PIT = Object.freeze({
  gunner: Pt(PL.zb26.x, PL.zb26.z + 0.2),
  yaowa: Pt(PL.zb26.x - 1.2, PL.zb26.z + 1.0),
  pitNra1: Pt(PL.pit.x + 2.7, PL.pit.z - 1.7),
  // 2026-10-19：原来 (2.8, 1.4) 跟蹲在 (2.0, 1.7) 的刘文财叠在一起，往南挪开、身子顺着南北躺（lie:"along"，倒地动作不再把人甩回刘文财身上；离刘文财 ≥ 0.6 m）
  pitNra2: Pt(PL.pit.x + 3.0, PL.pit.z + 2.2),
  pitNra3: Pt(PL.pit.x - 3.0, PL.pit.z + 1.0),
  pitNra4: Pt(PL.pit.x - 0.6, PL.pit.z + 0.6),
  entry: Pt(PL.pit.x + 0.9, PL.pit.z + 2.0),
});
// 抱手榴弹的弟兄死在坑沿外，那捆手榴弹落在沟沿上（胸墙北边）
const BUNDLE = Pt(PL.parapet.x + 1.6, PL.parapet.z - 1.3);
const BUNDLE_MAN = Pt(PL.parapet.x + 0.6, PL.parapet.z - 3.0);
// 03 远处的日军
const LMG_W = Pt(PL.enemyLmgWest.x, PL.enemyLmgWest.z), LMG_E = Pt(PL.enemyLmgEast.x, PL.enemyLmgEast.z);
// 2026-10-20：副射手 —— 坟地那挺的趴在坟包 G2 正后面（坟在他和坑之间），麦秸垛那挺的趴在垛西头、射手身后
const LMG_W_LOADER = Pt(-28.34, -117.58), LMG_E_LOADER = Pt(36.0, -139.4);
const MORTAR_1 = Pt(PL.mortar.x - 1, PL.mortar.z), MORTAR_2 = Pt(PL.mortar.x + 1.2, PL.mortar.z - 0.6);
const TANK_SEEN = Pt(PL.tankFirstSeen.x, PL.tankFirstSeen.z);
const TANK_STOP = Pt(PL.tankStop.x, PL.tankStop.z);
/** 板桥本地坐标 → 世界：along 顺路（往西南为正），across 横着桥面（往东南为正）。 */
function BridgePt(along, across) {
  const r = L0105_BRIDGE.yawDeg * Math.PI / 180, fx = -Math.sin(r), fz = -Math.cos(r);
  return Pt(L0105_BRIDGE.x + fx * along + fz * across, L0105_BRIDGE.z + fz * along - fx * across);
}
/**
 * 绕桥东头（10-18 第三轮）：05-3 → 05-4 跟车步兵与沟里追来的鬼子原来按直线穿过桥头横木端头（−0.43 m）、从桥底下钻过去。
 * 改成沿路走到横木端头外 1.25 m（横木顺路伸出桥面中心 5.25 m），横过路面往东南，再从沟东边绕到坡顶：桥底、横木一样都不碰。
 */
export const BRIDGE_EAST_DETOUR = Object.freeze([BridgePt(-6.5, 0), BridgePt(-6.5, 6), Pt(40.5, 124)]);
const ROAD_YAW = R1(Along(L0105_ROAD, ROAD_D_CROSSING).heading);   // 路口那一段往西南开的朝向
// 先头部队剩下的几个退回去等战车的路边；从支沟北沿翻出去，绕开洞顶
const ROADSIDE = Pt(PL.roadsideNearDugout.x, PL.roadsideNearDugout.z);
const BRANCH_EXIT = B(BRANCH_LEN - 4.5, 0);                                                  // 洞口西边几米：从这里翻上北沿
const RIM_NORTH = Pt(BRANCH_EXIT.x + 1, PL.enemyBranchGun.z - 0.6);
const AROUND_ROOF = Pt(PL.dugout.x + 5, PL.dugout.z - PL.dugout.d / 2 - 4);
const ROADSIDE_IN = [ROADSIDE, AROUND_ROOF, RIM_NORTH];   // 从路边跳进支沟（倒过来就是翻出去）

// 03 正面跃进的步兵：四组，每组两人（2026-10-20 第四轮：短跃进、正面只是拖住；Data_EditorBlockoutFirstLevel0105Space.L0105_RUSH_STATIONS，
// 哪一拍用第几格见 L0105_RUSH_KEY）。扑在掩体后 / 麦地里的趴着端枪；地坎后低地里的蹲着、不端枪（坑里看不见）；中弹的躺在倒下的地方。
// 野地里跨沟、翻埂、翻坎（climb，不报高差）。
const RushUnits = (kfId) => Object.entries(L0105_RUSH_STATIONS).map(([id, list], i) => {
  const k = L0105_RUSH_KEY[kfId], fell = L0105_RUSH_FALLEN[id];
  const base = { group: `rush${Math.floor(i / 2) + 1}`, role: "rifleman", straight: true, climb: true };
  if (fell && k >= fell.bound) return J(id, Pt(fell.at.x, fell.at.z), { ...base, yaw: Yaw(fell.at, PL.pit), down: true });
  const st = RushStation(list[k]);
  const down = !!(st.cover || st.prone);
  return J(id, Pt(st.x, st.z), { ...base, face: PL.pit, aim: down, stance: down ? "prone" : st.hidden ? "crouch" : "stand" });
});

// 03 西边干水沟里摸过来的一个班（L0105_DITCH_SQUAD）：03-2 / 03-3 在沟里弯着腰排成一串；03-4 出了沟（轻机枪趴在渐浅段、
// 步兵扑在 N2 后、两个倒在出沟的路上）；03-5 打头的两个跳到了 N1 后。
const DITCH_LINE = L0105_PIT_NORTH.ditch.line, DITCH_LEN = LineLength(DITCH_LINE);
const FIRE_C = Pt(PL.fireC.x, PL.fireC.z);
function DitchSquadUnits(kfId) {
  const S = L0105_DITCH_SQUAD;
  return S.ids.map((id, i) => {
    const base = { group: "ditchSquad", role: id === S.lmg ? "machineGun" : id === S.leader ? "leader" : "rifleman", straight: true, climb: true,
      ...(id === S.lmg ? { name: "轻机枪（沟里那个班）", weapon: "Type11" } : id === S.leader ? { name: "沟里那个班的班长" } : {}) };
    if (kfId === "03-2" || kfId === "03-3") {
      const p = DitchSquadStart(i);
      return J(id, Pt(p.x, p.z), { ...base, yaw: R1(p.headingYawDeg), stance: "crouch" });
    }
    if (id === S.lmg || id === S.loader) {
      const p = PointAlong(DITCH_LINE, id === S.lmg ? S.lmgD : S.loaderD);
      return J(id, Pt(p.x, p.z), { ...base, face: FIRE_C, stance: "prone", aim: id === S.lmg, ...(id === S.lmg ? { arc: ArcTo(p, FIRE_C, 5) } : {}) });
    }
    if (S.fallen.includes(id)) { const p = DitchSquadFallenAt(id); return J(id, Pt(p.x, p.z), { ...base, yaw: Yaw(p, FIRE_C), down: true }); }
    const n1 = kfId === "03-5" && S.toN1[id];
    const st = RushStation({ bund: n1 ? "N1" : "N2", x: n1 ? n1.x : S.n2X[id] });
    return J(id, Pt(st.x, st.z), { ...base, face: FIRE_C, stance: "prone", aim: true });
  });
}

// 03–04 沿丢掉的前沿沟从东往西清过来的那股（x 往西推）
const TrenchClearers = (xs, o = {}) => xs.map((x, i) => J(`IjaTrench${i + 1}`, FrontAtX(x, i % 2 ? 0.6 : -0.6), {
  group: "trenchClear", role: "rifleman", yaw: 90, aim: i === 0, to: i === 0 && o.to ? o.to : undefined,
}));

// 02 末 / 03-1 交通沟里往南撤的人流的去向：下到干沟里，往东散开（坑窝 A 东边那一弯）
const SOUTH_OUT = Pt(47.5, 147);

// ---------------------------------------------------------------------------
// 关键帧

function Keyframes() {
  const K = [];
  const Add = (kf) => K.push(kf);

  // ======================= 01 洞里，塌洞 =======================
  const s01 = { stage: 1, stageTitle: "洞里，塌洞" };
  const caveLuo = Pt(PL.dugoutMouth.x + 0.5, PL.dugoutMouth.z);
  const caveYaowa = Pt(PL.dugout.x - 1.6, PL.dugout.z - 1.4);
  const caveLiu = Pt(PL.dugout.x + 2.0, PL.dugout.z - 1.3);
  const caveHe = Pt(PL.dugout.x + 2.6, PL.dugout.z + 1.2);
  const caveDonggua = Pt(SIT.player.x + 0.6, SIT.player.z + 1.0);
  const caveSquad1 = Pt(PL.dugout.x - 1.8, PL.dugout.z + 1.6);
  const caveSquad2 = Pt(PL.dugout.x + 0.9, PL.dugout.z - 1.6);
  const PIT_TARGET = [PL.mouth, PL.pit];   // 幺娃 / 传令兵：出洞 → 支沟 → 支沟口 → 交通沟往北 → 沟口 → 坑
  Add({
    id: "01-1", ...s01, name: "黑场醒来、绑绷带",
    player: { x: SIT.player.x, z: SIT.player.z, yawDeg: Yaw(SIT.player, caveDonggua), pitchDeg: -12, stance: "crouch" },
    what: "炮声里醒来，冬瓜左肩的绷带黑了一大块，伸过膀子要顺子帮他绑。",
    next: { text: "给冬瓜重新绑绷带" },
    how: ["炮光一闪一闪照出洞里的人", "冬瓜「帮老子绑一哈」", "开场唯一的交互：按键绑绷带", "转头看得见：班长洞口背影、幺娃数炮、刘文财分子弹"],
    notes: "洞里的人不专门介绍，名字靠别人喊：幺娃「九哈……比刚才慢了。」、刘文财「顺儿、冬瓜，一人三夹，多的没得。」、何有田在帽子底下骂。玩家坐着，机位用 crouch。洞里另两个弟兄的位置是推测。",
    units: [
      N("Donggua", caveDonggua, { face: SIT.player, stance: "crouch" }),
      N("Luo", caveLuo, { yaw: 90 }),
      N("Yaowa", caveYaowa, { yaw: 90, stance: "crouch" }),
      N("LiuWencai", caveLiu, { face: SIT.player, stance: "crouch" }),
      N("HeYoutian", caveHe, { yaw: 90, stance: "crouch" }),
      N("Squad1", caveSquad1, { yaw: 60, stance: "crouch", guess: true }),
      N("Squad2", caveSquad2, { yaw: 120, stance: "crouch", guess: true }),
    ],
    pois: [POI.dugout(), Poi("DugoutMouth01", "洞口", "landmark", PL.dugoutMouth, 1.5)],
  });

  const runnerAt = Pt(PL.dugoutMouth.x - 1.6, PL.dugoutMouth.z + 0.3);
  const yaowaUp = Pt(PL.dugoutMouth.x + 1.4, PL.dugoutMouth.z - 0.9);
  Add({
    id: "01-2", ...s01, name: "传令兵报信，幺娃替顺子去",
    player: { x: SIT.player.x, z: SIT.player.z, yawDeg: Yaw(SIT.player, PL.dugoutMouth), pitchDeg: -3, stance: "crouch" },
    what: "传令兵扑到洞口：东边阵地丢了！班长要顺子去西边坑，幺娃抢着去了。",
    next: { text: "把冬瓜的绷带打好结" },
    how: ["外面有人喊「罗班长——！」", "枪炮声一下子近了", "班长看了顺子一眼，没说话", "幺娃钻出洞口往前沿跑"],
    notes: "班长：「顺儿，跟他去西边坑，喊机枪组走！」顺子手上还在打结，慢了半拍；幺娃「我跑得快，我去！」。幺娃与传令兵的去向：出洞 → 支沟 → 支沟口 → 交通沟往北 → 沟口机枪坑（虚线）。",
    units: [
      N("Donggua", caveDonggua, { face: SIT.player, stance: "crouch" }),
      N("Luo", Pt(caveLuo.x + 0.6, caveLuo.z + 0.6), { face: SIT.player }),
      N("Runner", runnerAt, { yaw: -90, stance: "crouch", from: T(T_BRANCH - 12), to: PIT_TARGET, speed: 3.2 }),
      N("Yaowa", yaowaUp, { face: PL.dugoutMouth, to: PIT_TARGET, speed: 3.2 }),
      N("LiuWencai", caveLiu, { face: caveLuo, stance: "crouch" }),
      N("HeYoutian", caveHe, { face: caveLuo, stance: "crouch" }),
      N("Squad1", caveSquad1, { face: caveLuo, stance: "crouch", guess: true }),
      N("Squad2", caveSquad2, { face: caveLuo, stance: "crouch", guess: true }),
    ],
    pois: [POI.dugout(), POI.pit("poi", "西边坑（机枪坑）"), POI.frontLost("01")],
  });

  // 01-3：其他人已出洞，沿支沟往西走；班长在洞口回头
  const p013 = Pt(SIT.player.x + 0.3, SIT.player.z);
  const dg013 = Pt(p013.x - 1.0, p013.z + 0.9);
  const retreatW = [-40, -30, -20, -11].map((x, i) => FrontAtX(x, i % 2 ? 0.5 : -0.5));
  Add({
    id: "01-3", ...s01, name: "最后两个人：今天就跑",
    player: { x: p013.x, z: p013.z, yawDeg: Yaw(p013, dg013), pitchDeg: -8, stance: "crouch" },
    what: "人都出洞了，班长在洞口回头催。冬瓜按住顺子的手：「顺儿，今天就跑。」",
    next: { text: "跟冬瓜往洞口跑", x: PL.dugoutMouth.x, z: PL.dugoutMouth.z, radiusM: 1.5 },
    how: ["班长「磨啥子，跟斗走！」", "包口露出老百姓的短褂", "顺子先朝洞口看一眼", "冬瓜压着嗓子说话"],
    notes: "外面：西段守军接到撤退令，沿前沿沟往沟口撤（RetreatNra*）；东段（x≥25）刚丢。其余人沿支沟往西走（刘文财扛弹药箱，何有田第一个钻出去）。Notion 待定：冬瓜手抖系不上背包带，背包是顺子帮他捆的。",
    units: [
      N("Donggua", dg013, { face: p013, stance: "crouch" }),
      N("Luo", Pt(PL.dugoutMouth.x - 0.6, PL.dugoutMouth.z), { yaw: -90 }),
      N("LiuWencai", B(BRANCH_LEN - 11, 0.4), { yaw: 93 }),
      N("HeYoutian", B(BRANCH_LEN - 16, -0.4), { yaw: 93 }),
      N("Squad1", B(BRANCH_LEN - 7, -0.4), { yaw: 93, guess: true }),
      N("Squad2", B(BRANCH_LEN - 19.5, 0.4), { yaw: 93, guess: true }),
      ...retreatW.map((p, i) => N(`RetreatNra${i + 1}`, p, { yaw: -80, group: "westFront", to: [PL.mouth, T(T_CORNER1 + 4)], guess: true })),
    ],
    pois: [POI.dugout(), POI.frontLost("01"), POI.mouth()],
  });

  // 01-4：塌洞后醒来，先头部队清沟；后沟那头罗班长的人已经分成两拨
  const yiAt = B(BRANCH_LEN - 2.8, 0.3);
  const jiaAt = B(BRANCH_LEN - 10, 0.7);
  const dingAt = B(BRANCH_LEN - 17, -0.6);
  const StepsGroup = (o = {}) => [
    N("HeYoutian", STEPS_GROUP.HeYoutian, { face: MG_AT, stance: "crouch", aim: true, ...o }),
    N("Squad1", STEPS_GROUP.Squad1, { face: MG_AT, stance: "crouch", aim: true, guess: true, ...o }),
  ];
  Add({
    id: "01-4", ...s01, name: "塌洞后醒来：先头部队清沟",
    player: { x: PINNED.x, z: PINNED.z, yawDeg: Yaw(PINNED, PL.branchMouth) - 6, pitchDeg: -2, stance: "prone" },
    what: "塌洞醒来，腰被横木压住。四五个鬼子从路那边跳进支沟，机枪架上北沿朝西打。",
    next: { text: "只能转头看" },
    how: ["耳鸣里枪炮声慢慢回来", "枪在一臂开外，够不着", "乙见到趴着的人就往背上扎一刀", "支沟口那头有枪在还：台阶上的枪口火光"],
    notes: "全程只能转头（卧姿机位）。日军打手势分开：丁往拐角后甩手榴弹、甲守岔口、乙顺沟走过来补刀（分工按剧本，谁干哪样是推测）；机枪组把两具尸体垫上北沿。"
      + "罗班长的人分两拨：何有田带一个弟兄留在支沟口台阶上顺着笔直的支沟朝洞口打（顺子看得见台阶那头的枪口火光）；"
      + "班长带刘文财和两个弟兄在支沟口往南 10 m 处爬出交通沟，贴支沟南沿土垄外侧往东爬（土垄挡住北沿机枪，顺子也看不见他们）。冬瓜埋在洞口南半边的塌土里。",
    signals: [SIG.dugoutCollapsed],
    units: [
      N("Donggua", BURIED, { yaw: 90, down: true, buried: true }),
      J("IjaYi", yiAt, { yaw: -86, aim: true, climb: true, path: [ROADSIDE, AROUND_ROOF, RIM_NORTH, yiAt].slice(1) }),
      J("IjaJia", jiaAt, { face: PL.branchMouth, guess: true }),
      J("IjaDing", dingAt, { face: PL.branchMouth, aim: true, guess: true }),
      J("IjaMgGunner", MG_AT, { yaw: 90, stance: "prone", aim: true, arc: MG_ARC }),
      J("IjaMgLoader", MG_LOADER_AT, { yaw: 90, stance: "prone" }),
      ...StepsGroup(),
      ...OUTFLANK_IDS.map((id) => N(id, Crawl(OUTFLANK_CRAWL_014[id]), { yaw: -88, stance: "prone", climb: true, group: "outflank",
        guess: id.startsWith("Squad"), ...(id === "Squad3" ? { from: PL.outflankExit, fromStraight: true } : {}) })),
    ],
    pois: [POI.branchGun(), POI.branchMouth("poi"), Poi("Rifle", "顺子的枪（一臂开外）", "poi", Pt(PINNED.x - 1.2, PINNED.z - 0.4), 0.5),
      Poi("OutflankExit", "迂回组爬出交通沟", "poi", PL.outflankExit, 1.5), Poi("SouthBerm", "支沟南沿土垄（挡住机枪）", "landmark", B(24, -4.2), 2)],
  });

  // ======================= 02 枪到手里 =======================
  const s02 = { stage: 2, stageTitle: "枪到手里" };
  const interrogation = Pt(PL.interrogation.x, PL.interrogation.z);
  const pinnedView = { x: PINNED.x, z: PINNED.z, stance: "prone" };
  Add({
    id: "02-1", ...s02, name: "审问冬瓜",
    player: { ...pinnedView, yawDeg: Yaw(PINNED, interrogation), pitchDeg: 2 },
    what: "冬瓜被拖出来按跪在沟壁下，翻译蹲在他面前连珠炮地问后沟有多少人。",
    next: { text: "盯着支沟口那头", x: PL.steps.x, z: PL.steps.z, radiusM: 2.5 },
    how: ["翻译说北方话，日军说日语", "冬瓜啐唾沫，挨一枪托", "甲朝后沟那边看一眼", "台阶那头的枪一直没停"],
    notes: "同一站位还要演：甲发现顺子活着、乙揪头发、两记耳光；丁被逼着练刺刀扎冬瓜肩膀和肚子，甲把刀抵上冬瓜喉咙（不另起关键帧）。翻译从路边跳进支沟（来路推测）。"
      + "这段时间里迂回组贴着南沿土垄外侧爬到审问处正对面，趴在土垄背后等；台阶上的压制组一直朝北沿机枪打（预演里顺子顺着支沟能看见那头的枪口火光）。",
    signals: [SIG.dugoutCollapsed],
    units: [
      N("Donggua", interrogation, { yaw: 0, stance: "crouch", path: [Pt(BURIED.x - 1.6, BURIED.z - 0.2), interrogation] }),
      J("Interpreter", B(Station(BRANCH, interrogation), 0.7), { face: interrogation, stance: "crouch", climb: true, from: ROADSIDE_IN, fromStraight: true }),
      J("IjaJia", Pt(interrogation.x + 1.6, interrogation.z - 0.9), { face: interrogation }),
      J("IjaYi", Pt(interrogation.x - 1.5, interrogation.z - 0.8), { face: interrogation, aim: true }),
      J("IjaDing", Pt(interrogation.x + 1.2, interrogation.z + 0.9), { face: interrogation }),
      J("IjaMgGunner", MG_AT, { yaw: 90, stance: "prone", aim: true, arc: MG_ARC }),
      J("IjaMgLoader", MG_LOADER_AT, { yaw: 90, stance: "prone" }),
      ...StepsGroup(),
      ...OUTFLANK_IDS.map((id) => N(id, B(OUTFLANK_FIRE_021[id], OUTFLANK_FIRE_LAT), { face: B(OUTFLANK_FIRE_021[id], 0), stance: "prone", group: "outflank",
        straight: true, guess: id.startsWith("Squad") })),
    ],
    pois: [POI.branchGun(), POI.branchMouth("poi"), Poi("Interrogation", "审问处", "poi", interrogation, 1.5), Poi("SouthBerm", "支沟南沿土垄（迂回组趴在背后）", "landmark", B(34, -4.2), 2.5)],
  });

  // 02-2 反冲（布设 = 打完那一刻）：日军全倒；班长从南沿跳进沟里，刘文财还在南沿上，何有田顺着支沟冲过来第一个到顺子身边扒土
  const DGround = Station(DRAG, interrogation);                              // 冬瓜摔回泥里那一点的拖行里程（约 5.5 m）
  const bodies = {
    IjaJia: D(DGround - 2.4, -1.2), IjaYi: D(DGround - 2.9, 1.2), IjaDing: D(1.6, -0.4),   // 乙从洞口那头挺刺刀冲班长，倒在班长东边
    Interpreter: D(DGround + 2.0, -1.3),
  };
  const DGfall = D(DGround, 0.3);
  const heDig = Pt(PINNED.x - 0.9, PINNED.z - 0.7);   // 蹲在顺子北边（洞口北半边），别挡住他看南沿
  // 机枪手和副射手中枪后栽进沟里（停在北壁脚下）
  const MG_FELL = Pt(PL.enemyBranchGun.x, PL.enemyBranchGun.z + 2.0), MG_LOADER_FELL = Pt(PL.enemyBranchGun.x + 1.4, PL.enemyBranchGun.z + 2.1);
  Add({
    id: "02-2", ...s02, name: "反冲：南沿上一排枪",
    // 10-18 第二轮：原来正对南沿（132°）、何有田蹲在右手边占了半屏，沟里倒下的人看不见。改成顺着支沟往西偏南看：
    // 左上是南沿上开火的人，中间是跳下来的班长，沟底一路倒着的人；何有田出了画面右边。顺子仍趴在洞口。
    player: { ...pinnedView, yawDeg: Yaw(PINNED, { x: 0.7 * D(DGround - 1.5, -0.3).x + 0.3 * B(OUTFLANK_FIRE_021.Luo, OUTFLANK_RIM_LAT).x,
      z: 0.7 * D(DGround - 1.5, -0.3).z + 0.3 * B(OUTFLANK_FIRE_021.Luo, OUTFLANK_RIM_LAT).z }), pitchDeg: 6 },
    what: "台阶那头枪声一停，机枪手抬头往西看；南沿上「打！」一排枪打下来，班长抡刀跳进沟里。",
    next: { text: "等何有田来扒土" },
    how: ["台阶那头的枪声忽然停了半秒", "南沿上「打！」——一排枪从头顶打下来", "台阶那头的人顺着支沟冲过来", "自动演出，玩家只能看"],
    notes: "架机枪的先倒（栽进沟里），丁胸口中弹倒在顺子面前，甲胳膊中弹、手一松冬瓜摔回泥里。甲中枪还去摸手榴弹，被跳下来的班长一刀劈倒；"
      + "乙挺刺刀迎上来，被南沿上的刘文财一枪打倒，翻译想跑也被打倒。压制组顺着支沟冲过来，何有田第一个到顺子身边扒土（下一帧他抬木头）。"
      + "顺子趴在洞口只看得见台阶那头的火光，看不见绕过来的人——南沿开火那一下才知道他们在头顶。",
    signals: [SIG.dugoutCollapsed],
    units: [
      N("Donggua", DGfall, { yaw: 90, down: true }),
      J("Interpreter", bodies.Interpreter, { yaw: -60, down: true }),
      J("IjaJia", bodies.IjaJia, { yaw: 90, down: true }),
      J("IjaYi", bodies.IjaYi, { yaw: 90, down: true }),
      J("IjaDing", bodies.IjaDing, { yaw: -90, down: true }),
      J("IjaMgGunner", MG_FELL, { yaw: 90, stance: "prone", down: true, arc: MG_ARC, climb: true }),
      J("IjaMgLoader", MG_LOADER_FELL, { yaw: 90, down: true, climb: true }),
      // 班长是抡着大刀从南沿跳下来的（剧本）：这一帧手里还是大刀，02-3 把枪塞给顺子之前才换回步枪
      N("Luo", D(DGround - 1.5, -0.3), { yaw: -86, aim: true, climb: true, group: "outflank", weapon: "Dadao" }),
      N("LiuWencai", B(OUTFLANK_FIRE_021.LiuWencai + 0.6, OUTFLANK_RIM_LAT), { face: PINNED, stance: "crouch", aim: true, climb: true, group: "outflank" }),
      N("Squad3", B(OUTFLANK_FIRE_021.Squad3, OUTFLANK_RIM_LAT), { face: B(OUTFLANK_FIRE_021.Squad3 + 3, 0), stance: "crouch", aim: true, climb: true, group: "outflank", guess: true }),
      N("Squad2", B(32.5, -0.6), { yaw: -86, aim: true, climb: true, group: "outflank", guess: true }),
      N("HeYoutian", heDig, { face: PINNED, stance: "crouch" }),
      N("Squad1", B(BRANCH_LEN - 12, 0.4), { yaw: -86, aim: true, guess: true }),
    ],
    pois: [POI.branchMouth("poi"), Poi("SouthRim", "南沿（迂回组从这里开火、跳沟）", "poi", B(OUTFLANK_FIRE_021.Luo, OUTFLANK_RIM_LAT), 3)],
  });

  // 02-3 起：单被（litter，bearers 0 只画被子）；顺子和何有田并排站在被子头上，各揪一个被角，面朝支沟口往前拖，
  // 被子在身后贴着脚后跟滑，冬瓜躺在上面；班长在冬瓜后头倒退着走、面朝洞口断后。
  // 拖行里程 d 是两人站的位置；被子中心在身后 PULL_TO_CENTER 米；左右各偏 PULL_HALF_GAP（支沟里左手 = 南）。
  const PULL_HALF_GAP = 0.55, PULL_TO_CENTER = 1.6, LUO_BEHIND = 4.4;
  const Formation = (d, { lat = 0, luoLat = 0.5 } = {}) => {
    const center = D(d - PULL_TO_CENTER, lat);
    return { d, center, he: D(d, lat + PULL_HALF_GAP), me: D(d, lat - PULL_HALF_GAP), luo: D(d - PULL_TO_CENTER - LUO_BEHIND, luoLat), yaw: center.heading };
  };
  const BodiesStay = () => [
    J("Interpreter", bodies.Interpreter, { yaw: -60, down: true }),
    J("IjaJia", bodies.IjaJia, { yaw: 90, down: true }),
    J("IjaYi", bodies.IjaYi, { yaw: 90, down: true }),
    J("IjaDing", bodies.IjaDing, { yaw: -90, down: true }),
    J("IjaMgGunner", MG_FELL, { yaw: 90, stance: "prone", down: true }),
    J("IjaMgLoader", MG_LOADER_FELL, { yaw: 90, down: true }),
  ];
  // 单被只画被子（bearers 0）；何有田是独立单位（castId heyoutian），站在被子头上揪一个被角往前拽（预演里他要动嘴、单独演拽到掩体后）
  const Blanket = (at, o = {}) => N("Blanket", at.center ?? at, { kind: "litter", name: o.name ?? "单被", bearers: 0, yaw: o.yaw ?? at.yaw, speed: 1.2, ...o.extra });
  // 冬瓜顺着被子躺（lie:"along"，§3）：头朝被子头 = 拖的人那头，朝向就是被子的朝向（10-18 第二轮：不再比被子转 90°）
  const OnBlanket = (at, o = {}) => N("Donggua", at.center ?? at, { down: true, lie: "along", speed: 1.2, onLitter: "Blanket", ...o, yaw: R1(o.yaw ?? at.yaw) });
  const HePulling = (at, o = {}) => N("HeYoutian", at.he, { yaw: at.yaw, speed: 1.2, ...o });
  const Ahead = (d0, o = {}) => [
    N("LiuWencai", D(d0, -0.4), { yaw: D(d0).heading, guess: true, ...o }),
    N("Squad1", D(d0 + 3, 0.5), { yaw: D(d0 + 3).heading, guess: true, ...o }),
    N("Squad2", D(d0 + 5.5, -0.5), { yaw: D(d0 + 5.5).heading, guess: true, ...o }),
    N("Squad3", D(d0 + 8, 0.4), { yaw: D(d0 + 8).heading, guess: true, ...o }),
  ];

  const g3 = Formation(DGround + PULL_TO_CENTER, { lat: 0.2 });
  Add({
    id: "02-3", ...s02, name: "接枪、揪被角",
    player: { x: g3.me.x, z: g3.me.z, yawDeg: g3.yaw, pitchDeg: -6, stance: "stand" },
    what: "何有田抬开木头，冬瓜被挪上单被。班长把枪塞进顺子手里：「跟到老子，走！」",
    next: { text: "揪住被角往支沟口拖", x: PL.steps.x, z: PL.steps.z, radiusM: 2.5 },
    how: ["何有田「顺儿，揪到那头！」", "冬瓜「顺子……表丢下我」然后手松开", "拖的时候手上没枪", "玩家拿回操作"],
    notes: "两人并排站在被子头上（何有田一个被角、顺子一个被角），面朝支沟口往前拖，被子在身后贴着脚后跟滑，冬瓜躺在上面；"
      + "班长在冬瓜后头倒退着走、面朝洞口断后。单被 = litter + bearers 0（只画被子），何有田是独立单位。刘文财和几个弟兄在前头开路（推测）。",
    signals: [SIG.dugoutCollapsed],
    units: [
      Blanket(g3),
      OnBlanket(g3),
      HePulling(g3),
      N("Luo", g3.luo, { yaw: R1(g3.yaw + 180), aim: true }),
      ...Ahead(DGround + 9),
      ...BodiesStay(),
    ],
    pois: [POI.branchMouth("objective"), Poi("CrateB1", "弹药箱垛（第一处能躲的）", "landmark", B(PROP("CrateStack_B1").d, PROP("CrateStack_B1").lat), 1.2)],
  });

  // 02-4：第一处——支沟里一垛弹药箱。何有田把被子拽到箱垛后头（西边、贴南壁），顺子松手转身，和班长蹲在箱垛后朝洞口那头打
  const crate = B(PROP("CrateStack_B1").d, PROP("CrateStack_B1").lat);
  const pursuers4 = [D(3.0, 0.7), D(4.6, -0.8), D(6.4, 0.3)];
  const blanket4 = D(D_CRATE + 3.3, 1.0);
  const p4 = D(D_CRATE + 1.45, 1.3);
  Add({
    id: "02-4", ...s02, name: "弹药箱垛后头第一次回身打",
    player: { x: p4.x, z: p4.z, yawDeg: Yaw(p4, pursuers4[0]), pitchDeg: 0, stance: "crouch" },
    what: "刚拖到弹药箱垛，班长喊「后头！」——追兵从洞口那头露头，子弹打在被子边上的土里。",
    next: { text: "松手，蹲在箱垛后把追兵打回去", x: pursuers4[0].x, z: pursuers4[0].z, radiusM: 3 },
    how: ["班长先开枪，喊「后头！」", "何有田把被子往箱垛后头一拽", "冬瓜疼得叫", "箱垛齐腰高，蹲下藏得住"],
    notes: "拖行约 22 m（Notion：第一次打在支沟里一垛弹药箱后头）。这一段教会玩家：拖人时手上没枪，要开枪就得松手——这里松手是对的；14 同一个本能害死冬瓜。"
      + "追兵的子弹只打在被子旁边，冬瓜不会在这一段死。追兵从洞旁路边绕过洞顶跳进支沟（来路推测）。箱垛是沟里本来就有的弹药箱（CrateStack_B1），不是专门摆的。",
    signals: [SIG.dugoutCollapsed],
    units: [
      Blanket(blanket4, { yaw: blanket4.heading }),
      OnBlanket(blanket4, { yaw: blanket4.heading }),
      N("HeYoutian", D(D_CRATE + 5.0, 0.6), { face: blanket4, stance: "crouch", speed: 1.2 }),
      N("Luo", D(D_CRATE + 1.3, 0.55), { face: pursuers4[0], stance: "crouch", aim: true }),
      ...Ahead(D_CRATE + 9),
      ...pursuers4.map((p, i) => J(`Pursuer${i + 1}`, p, { face: crate, aim: i < 2, group: "pursuers", role: "rifleman", climb: true, from: ROADSIDE_IN, fromStraight: true, guess: true })),
      ...BodiesStay(),
    ],
    pois: [Poi("CrateB1", "弹药箱垛（第一次躲）", "poi", crate, 1.2), POI.branchMouth("landmark")],
  });

  // 02-5：第二处——支沟口台阶拐角。被子拖上台阶、拐进交通沟往南；顺子和班长蹲在拐角，探出去顺着支沟朝东打
  const pursuers5 = [B(PROP("CrateStack_B1").d + 1.4, 0.6), B(PROP("CrateStack_B1").d - 2.2, -0.2), B(PROP("CrateStack_B1").d + 4.5, 0.4)];
  const blanket5 = T(T_BRANCH + 6.6, -0.75);
  const p5 = T(T_BRANCH + 2.6, 1.15);
  Add({
    id: "02-5", ...s02, name: "台阶拐角第二次打",
    player: { x: p5.x, z: p5.z, yawDeg: Yaw(p5, pursuers5[0]), pitchDeg: 0, stance: "crouch" },
    what: "刚把被子拖上台阶拐进交通沟，追兵又顺着笔直的支沟打过来。坡上坑里的捷克式还在一阵一阵响。",
    next: { text: "在拐角探身，顺着支沟打回去", x: pursuers5[0].x, z: pursuers5[0].z, radiusM: 3 },
    how: ["班长「后头！又来了！」", "被子拐过拐角就挨不着支沟里的子弹", "支沟笔直，追兵没处躲，只能缩在那垛弹药箱后头", "捷克式一阵一阵响（北边坡上的坑）"],
    notes: "拖行约 41–48 m（Notion 第二次打：支沟口的台阶拐角）。拐角就是掩体（旁边交通沟东壁下有一垛土袋 SandbagStack_J1）。"
      + "追兵这次缩在刚才我们躲过的那垛弹药箱后头。坑里是幺娃和机枪组——这时还在顶着；POI 标出坑的方向。",
    signals: [SIG.dugoutCollapsed],
    units: [
      Blanket(blanket5, { yaw: blanket5.heading }),
      OnBlanket(blanket5, { yaw: blanket5.heading }),
      N("HeYoutian", T(T_BRANCH + 8.3, -0.6), { face: blanket5, stance: "crouch", speed: 1.2 }),
      N("Luo", T(T_BRANCH + 3.4, 0.35), { face: pursuers5[0], stance: "crouch", aim: true }),
      ...Ahead(D_BRANCH_MOUTH + 13),
      ...pursuers5.map((p, i) => J(`Pursuer${i + 1}`, p, { face: PL.branchMouth, aim: true, stance: i === 1 ? "crouch" : undefined, group: "pursuers", role: "rifleman", guess: true })),
    ],
    pois: [POI.branchMouth("landmark"), POI.pit("poi", "机枪坑（捷克式还在响）"), Poi("CornerSteps", "台阶拐角（第二次躲）", "poi", p5, 1.5)],
  });

  // 02-6：第三处——拐角 2。被子拖过拐角往南；顺子和班长蹲在拐角那垛土袋后头，朝来路（北）打
  const bag2 = PROP("SandbagStack_C2");
  const p6 = T(bag2.d + 1.5, 1.3);
  const pursuers6 = [T(T_BRANCH + 11, 0.6), T(T_BRANCH + 8.5, -0.6), T(T_BRANCH + 6, 0.3)];
  const blanket6 = T(T_CORNER2 + 6.4, -0.8);
  Add({
    id: "02-6", ...s02, name: "拐角 2 第三次打",
    player: { x: p6.x, z: p6.z, yawDeg: Yaw(p6, pursuers6[0]), pitchDeg: 0, stance: "crouch" },
    what: "刚拖过拐角 2，追兵又追上来露头，第三次松手，蹲在土袋垛后回身打。",
    next: { text: "在土袋后头回身打退追兵", x: pursuers6[0].x, z: pursuers6[0].z, radiusM: 3 },
    how: ["班长「后头——！」", "子弹打在被子边上的土里", "冬瓜疼得叫", "土袋垛齐腰高"],
    notes: "拖行约 62–68 m（Notion 第三次打：拐角 2）。土袋垛 SandbagStack_C2 本来就码在拐角下（交通沟东壁）。",
    signals: [SIG.dugoutCollapsed],
    units: [
      Blanket(blanket6, { yaw: blanket6.heading }),
      OnBlanket(blanket6, { yaw: blanket6.heading }),
      N("HeYoutian", T(T_CORNER2 + 8.1, -0.7), { face: blanket6, stance: "crouch", speed: 1.2 }),
      N("Luo", T(bag2.d + 1.6, 0.4), { face: pursuers6[0], stance: "crouch", aim: true }),
      ...Ahead(D_CORNER2 + 14),
      ...pursuers6.map((p, i) => J(`Pursuer${i + 1}`, p, { yaw: R1(p.heading + 180), aim: true, group: "pursuers", role: "rifleman", guess: true })),
    ],
    pois: [POI.corner2("landmark"), Poi("SandbagC2", "土袋垛（第三次躲）", "poi", T(bag2.d, bag2.lat), 1.2), POI.crest("poi")],
  });

  const g7 = Formation(D_CREST + 3.4);
  const crestPosts = PL.crestPosts.map((p) => Pt(p.x, p.z));
  const pursuers7 = [D(D_CORNER2 - 3.2, 0.6), D(D_CORNER2 - 5.0, -0.6), D(D_CORNER2 - 6.8, 0.3)];
  const ROADSIDE_OUT = [B(BRANCH_LEN - 4.5), ...ROADSIDE_IN.slice().reverse().slice(1), ROADSIDE];
  const CrestNra = (i, o = {}) => N(`CrestNra${i + 1}`, crestPosts[i], { castId: i === 0 ? "shouter" : undefined, face: PL.corner2, stance: "prone", aim: true, group: "crestPost", straight: true, ...o });
  Add({
    id: "02-7", ...s02, name: "翻坡顶：快过来！",
    player: { x: g7.me.x, z: g7.me.z, yawDeg: Yaw(g7.me, PL.corner2), pitchDeg: -3, stance: "stand" },
    what: "拖着冬瓜从板桥底下钻过去、翻上坡顶，别的班趴在坡沿上喊「快过来！」；追兵在拐角 2 一露头就挨枪，缩回去了。",
    next: { text: "把冬瓜拖下干沟", x: PL.assembly.x, z: PL.assembly.z, radiusM: 5 },
    how: ["坡沿上的兵喊「快过来！」", "顺子他们一翻过去，这几个兵就朝拐角 2 开枪", "追兵缩回去"],
    notes: "追来的是先头部队剩下的几个：缩回洞旁路边等战车（03 战车就从这条路露头）——去向画回支沟、从洞口西边翻出北沿、绕过洞顶到路边。"
      + "Notion 拖行：拐角 2 63 m → 路口 93 → 坡顶 108 → 集结处 130 m（本白盒：坡顶 107、干沟 125）。",
    signals: [SIG.dugoutCollapsed],
    units: [
      Blanket(g7),
      OnBlanket(g7),
      HePulling(g7),
      N("Luo", g7.luo, { yaw: R1(g7.yaw + 180), aim: true }),
      ...Ahead(D_CREST + 11, { yaw: 180 }),
      ...crestPosts.map((_, i) => CrestNra(i, { from: Pt(crestPosts[i].x, crestPosts[i].z + 6) })),
      ...pursuers7.map((p, i) => J(`Pursuer${i + 1}`, p, { yaw: BackYaw(DRAG, D_CORNER2 - 4) + 180, aim: i === 0, group: "pursuers", role: "rifleman", climb: true,
        to: ROADSIDE_OUT.map((q, k) => (k === ROADSIDE_OUT.length - 1 ? Pt(q.x + i * 1.2, q.z - i * 1.0) : q)), guess: true })),
    ],
    pois: [POI.crest("landmark"), POI.corner2("danger"), POI.assembly("objective"), Poi("Bridge", "路口板桥", "landmark", PL.crossing, 3)],
  });

  // ======================= 02 末 集结处（坡后干沟） =======================
  const s02e = { stage: 2, stageLabel: "02末", stageTitle: "集结处" };
  const A = PL.assembly;
  // 10-20：人不挤在一处，分三小堆，都贴北岸陡坎（北边是坡顶，那边来的炮弹打不进坎根）：
  //   坑窝 A（坡道东边）：刚撤下来的两个兵 + 一个伤员；中弯 + 支沟：伤员都放支沟里，冬瓜、卫生兵、何有田、班长一伙在这；坑窝 B（东头）：两个坐着的轻伤 + 两个兵
  const PA = L0105_GULLY_POCKETS.a, PB = L0105_GULLY_POCKETS.b;
  const restAt = { center: Pt(PL.donguaRest.x, PL.donguaRest.z), yaw: PL.donguaRest.yawDeg };
  const medicAt = Pt(restAt.center.x - 1.2, restAt.center.z - 0.9);
  const pE = Pt(restAt.center.x - 2.6, restAt.center.z - 4.6);
  const heE = Pt(restAt.center.x + 1.5, restAt.center.z - 0.6);
  const luoE = Pt(pE.x - 2.2, pE.z - 1.6);
  const liuE = Pt(pE.x - 3.4, pE.z + 0.2);
  const BayAt = (d, lat) => { const p = PointBeside(L0105_GULLY.branch, d, lat); return Pt(p.x, p.z); };
  const wounded = [
    BayAt(1.8, 1.4), BayAt(0.6, -1.8), BayAt(5.0, 1.5), BayAt(4.9, -0.4),   // 支沟里躺着的（冬瓜在西侧）
    Pt(PA.x - 2.0, PA.z - 2.6),                                            // 坑窝 A 坎根下躺着一个
    Pt(PB.x - 1.6, PB.z - 3.2), Pt(PB.x + 1.4, PB.z - 3.4),                // 坑窝 B 坎根下坐着两个轻伤
  ];
  const roadsideWait = [0, 1, 2].map((i) => Pt(ROADSIDE.x + i * 1.2, ROADSIDE.z - i * 1.0));
  const stretcherAt = Pt(PL.laneHead.x + 1.5, PL.laneHead.z + 0.2);
  const stretcherOut = [Pt(PL.laneHead.x, PL.laneHead.z), Pt(L0105_SUNKEN_LANE.line[1].x, L0105_SUNKEN_LANE.line[1].z), Pt(L0105_SUNKEN_LANE.line[2].x - 2, L0105_SUNKEN_LANE.line[2].z)];
  const Wounded = (o = {}) => wounded.map((p, i) => N(`Wounded${i + 1}`, p, { yaw: i < 4 ? R1(PL.donguaRest.yawDeg + (i % 2 ? 180 : 0)) : 180, down: i !== 5 && i !== 6, stance: i === 5 || i === 6 ? "crouch" : undefined, group: "wounded", straight: true, ...o }));
  const RestBlanket = () => [Blanket(restAt), OnBlanket(restAt)];
  const squadE = { Squad1: Pt(PA.x + 1.2, PA.z - 3.0), Squad2: Pt(PB.x, PB.z - 1.6), Squad3: Pt(PA.x + 2.8, PA.z - 2.2) };
  Add({
    id: "02E-1", ...s02e, name: "集结处：幺娃回来没得？",
    player: { x: pE.x, z: pE.z, yawDeg: Yaw(pE, restAt.center), pitchDeg: -12, stance: "stand" },
    what: "坡后干沟里，人三三两两贴着北边的陡坎，伤员都放在往南那条支沟里。卫生兵背对顺子蹲在冬瓜身边；班长问：「幺娃回来没得？」",
    next: { text: "看交通沟下来的坡道", x: PL.assemblyEntry.x, z: PL.assemblyEntry.z, radiusM: 2.5 },
    how: ["没人吭声，刘文财摇了摇头", "坡顶那边一挺机枪一直在响", "担架员「下一趟就抬拉。」", "担架顺着东南头的凹路抬走一副，空手跑回来抬下一副"],
    notes: "集结处是坡顶背后一道雨水冲出来的弯沟（沟底宽 5–15 m、两岸 2.5 m 陡坎、两岸疏疏落落几棵枯树）：看不见前沿，南边平地上也看不进沟底。"
      + "人分三小堆贴北岸坎根（坑窝 A、中弯、坑窝 B），不挤一处；伤员放中弯往南的支沟里，支沟南头就是凹路口（后送路），担架从那抬走。"
      + "人多、担架少、交通沟一次只过一个人。何有田放下被角，留在冬瓜身边。追兵此时退在洞旁路边等战车。（形状与摆法是创作，见对照表）",
    signals: [SIG.dugoutCollapsed],
    units: [
      ...RestBlanket(),
      N("Medic", medicAt, { face: restAt.center, stance: "crouch", from: BayAt(4.4, 0), fromStraight: true }),
      N("HeYoutian", heE, { face: restAt.center, stance: "crouch" }),
      N("Luo", luoE, { face: Pt(PL.woundedBay.x, PL.woundedBay.z) }),
      N("LiuWencai", liuE, { face: luoE }),
      N("Squad1", squadE.Squad1, { face: restAt.center, stance: "crouch", guess: true }),
      N("Squad2", squadE.Squad2, { face: restAt.center, guess: true }),
      N("Squad3", squadE.Squad3, { face: restAt.center, stance: "crouch", guess: true }),
      ...Wounded(),
      N("Stretcher1", stretcherAt, { kind: "litter", name: "担架", yaw: Yaw(stretcherAt, PL.laneHead), toStraight: true, to: stretcherOut, straight: true }),
      ...crestPosts.map((_, i) => CrestNra(i)),
      ...roadsideWait.map((p, i) => J(`Pursuer${i + 1}`, p, { face: PL.crossing, stance: "crouch", group: "pursuers", role: "rifleman", guess: true })),
    ],
    pois: [POI.assembly("landmark"), POI.crest("poi"), Poi("AssemblyEntry", "交通沟下到干沟的坡道", "poi", PL.assemblyEntry, 2), Poi("LaneHead", "凹路口（往后送）", "landmark", PL.laneHead, 2.5)],
  });

  const runnerE = Pt(PL.assemblyEntry.x - 0.4, PL.assemblyEntry.z + 4.0);
  Add({
    id: "02E-2", ...s02e, name: "传令兵报坑，班长带人上去",
    player: { x: pE.x, z: pE.z, yawDeg: Yaw(pE, runnerE), pitchDeg: -2, stance: "stand" },
    what: "传令兵逆着人流从坡道挤下来：沟口那个坑，东头鬼子要绕过去了，幺娃和机枪组在里头。",
    next: { text: "跟班长从坡道回交通沟往北", x: PL.assemblyEntry.x, z: PL.assemblyEntry.z, radiusM: 2.5 },
    how: ["传令兵满身是泥", "班长看了一眼满地的伤员：「那个坑，丢不得。」", "何有田留下看冬瓜", "上去的人本来该是顺子"],
    notes: "传令兵原话剧本没写，配音占位「沟口那个坑，东头的鬼子要绕过去了！幺娃跟机枪组都在里头！」。班长：「前头人还没下完，伤员也没抬完。」顺子一句话也没说，跟上了。",
    signals: [SIG.dugoutCollapsed],
    units: [
      ...RestBlanket(),
      N("Medic", medicAt, { face: restAt.center, stance: "crouch" }),
      N("HeYoutian", heE, { face: runnerE, stance: "crouch" }),
      N("Runner", runnerE, { face: luoE, from: T(T_CREST - 2) }),
      N("Luo", Pt(luoE.x + 0.6, luoE.z - 1.0), { face: runnerE }),
      N("LiuWencai", liuE, { face: runnerE }),
      N("Squad1", squadE.Squad1, { face: runnerE, stance: "crouch", guess: true }),
      N("Squad2", squadE.Squad2, { face: runnerE, guess: true }),
      N("Squad3", squadE.Squad3, { face: runnerE, stance: "crouch", guess: true }),
      ...Wounded(),
      ...crestPosts.map((_, i) => CrestNra(i)),
      ...roadsideWait.map((p, i) => J(`Pursuer${i + 1}`, p, { face: PL.crossing, stance: "crouch", group: "pursuers", role: "rifleman", guess: true })),
    ],
    pois: [POI.assembly("landmark"), Poi("AssemblyEntry", "交通沟下到干沟的坡道", "objective", PL.assemblyEntry, 2)],
  });

  // ======================= 03 逆着人流上去，守坑 =======================
  const s03 = { stage: 3, stageTitle: "逆着人流上去，守坑" };
  // 03-1：从干沟上坡道回交通沟往北；人流顺着交通沟往南下到干沟里
  const p31 = T(T_END - 4, 0.3);
  const crowd = [
    ["RetreatNra2", T(T_END - 5.8, -0.95), {}], ["RetreatNra1", T(T_END - 10.5, -0.8), {}],
    ["WalkWounded1", T(T_END - 14.5, 0.55), { role: "walkingWounded" }], ["RetreatHelper1", T(T_END - 14.5, -0.55), { role: "helper" }],
    ["RetreatNra3", T(T_END - 23, -0.6), {}], ["RetreatNra4", T(T_CROSSING - 1.5, 0.6), {}], ["RetreatNra5", T(T_END - 1.6, 0.95), {}],
  ];
  Add({
    id: "03-1", ...s03, name: "逆着人流",
    player: { x: p31.x, z: p31.z, yawDeg: BackYaw(TRAFFIC, T_END - 4), pitchDeg: 2, stance: "stand" },
    what: "从干沟上坡道回交通沟：沟里挤满往南撤的人，拎枪的、架着走的伤员、担架。只有我们三个往北挤。",
    next: { text: "挤到沟口的机枪坑", x: PL.pit.x, z: PL.pit.z, radiusM: 4 },
    how: ["挨撞挨骂「往哪走！」", "越往上枪声越近", "人流里的伤越来越重", "三个人侧着身子挤"],
    notes: "玩家第一次看清：整条线在撤，只有我们在往回走。出干沟、翻坡顶、钻过板桥底下，一路往北（预演里挤到板桥一带）。人流的具体人数、担架位置是推测。",
    units: [
      N("Luo", T(T_END - 7.5, 0.9), { yaw: BackYaw(TRAFFIC, T_END - 7.5) }),
      N("LiuWencai", T(T_END - 0.8, -0.4), { yaw: BackYaw(TRAFFIC, T_END - 0.8) }),
      ...crowd.map(([id, p, o]) => N(id, p, { yaw: p.heading, group: "retreat", to: SOUTH_OUT, guess: true, ...o })),
      N("Stretcher2", T(T_END - 19), { kind: "litter", name: "担架", yaw: T(T_END - 19).heading, group: "retreat", to: SOUTH_OUT, guess: true }),
    ],
    pois: [POI.pit("objective"), POI.crest("landmark"), Poi("Bridge", "路口板桥", "landmark", PL.crossing, 3)],
  });

  // 03-2 进坑就挨一发掷弹筒
  const p32 = PIT.entry;
  const lmgUnits = (o = {}) => [
    J("IjaLmgWest", LMG_W, { name: "轻机枪（西）", weapon: "Type11", role: "machineGun", group: "lmg", stance: "prone", aim: true, arc: ArcTo(LMG_W, PL.parapet, 6), straight: true, ...o }),
    J("IjaLmgWestLoader", LMG_W_LOADER, { group: "lmg", stance: "prone", face: PL.pit, straight: true }),
    J("IjaLmgEast", LMG_E, { name: "轻机枪（东）", weapon: "Type11", role: "machineGun", group: "lmg", stance: "prone", aim: true, arc: ArcTo(LMG_E, PL.parapet, 6), straight: true, ...o }),
    J("IjaLmgEastLoader", LMG_E_LOADER, { group: "lmg", stance: "prone", face: PL.pit, straight: true }),
  ];
  const mortarUnits = () => [
    J("IjaMortar1", MORTAR_1, { name: "掷弹筒", role: "mortar", group: "mortar", stance: "crouch", face: PL.pit, straight: true }),
    J("IjaMortar2", MORTAR_2, { role: "mortarLoader", group: "mortar", stance: "crouch", face: PL.pit, straight: true }),
  ];
  const pitPois = (fire = "poi") => [POI.fireA(fire), POI.fireB(fire), POI.fireC(fire), POI.mortar()];
  // 2026-10-20 第四轮：人从地坎后上来（坎北低 2 m，坑里看不见人）；西边干水沟尽头是那个班出沟的地方
  const scarpPoi = () => Poi("ScarpEdge", "地坎（坎后低 2 m，人从这里冒出来）", "landmark", Pt(16, ScarpZ(16)), 10);
  const ditchEndPoi = () => Poi("DitchEnd", "干水沟尽头（沟里那个班从这里出沟）", "danger", DitchEmerge(), 6);
  Add({
    id: "03-2", ...s03, name: "进坑就挨一发掷弹筒",
    player: { x: p32.x, z: p32.z, yawDeg: Yaw(p32, PIT.yaowa), pitchDeg: -6, stance: "crouch" },
    what: "刚挤进坑，一发掷弹筒落在坑沿，一个弟兄被掀翻。幺娃在给机枪手压弹匣。",
    next: { text: "上坑沿（甲位）", x: PL.fireA.x, z: PL.fireA.z, radiusM: 1.2 },
    how: ["「丢弹筒！挪起走！」", "幺娃看见顺子，愣了一下", "坑里能打的只有三个位置"],
    notes: "坑在交通沟口，一挺捷克式，四五个人（坑里另几个弟兄的站位推测）。三个射位：甲 坑沿朝北、乙 沟口朝东、丙 散兵坑朝西北。坑北（2026-10-20 第四轮）：正面两组趴在最远那道田埂 F3（约 185 m）后，另两组还在地坎后的低地里（坎北低 2 m，坑里看不见）；西边干水沟里弯着腰摸着一个班（8 人、一挺轻机枪），坑里也看不见。",
    units: [
      N("Luo", Pt(PL.pit.x - 1.6, PL.pit.z + 2.3), { face: PL.fireA, stance: "crouch" }),
      N("LiuWencai", Pt(PL.pit.x - 2.8, PL.pit.z + 2.4), { face: PL.fireA, stance: "crouch" }),
      N("Gunner", PIT.gunner, { yaw: 0, stance: "crouch", aim: true, from: TR.crawlSap[0] }),
      N("Yaowa", PIT.yaowa, { face: p32, stance: "crouch", from: TR.crawlSap[0] }),
      N("PitNra1", PIT.pitNra1, { yaw: 0, aim: true, guess: true }),
      N("PitNra2", PIT.pitNra2, { yaw: 180, down: true, lie: "along", guess: true }),
      N("PitNra3", PIT.pitNra3, { face: PL.fireC, stance: "crouch", guess: true }),
      N("PitNra4", PIT.pitNra4, { face: PL.parapet, stance: "crouch", role: "grenadeBundle", guess: true }),
      ...[-30, -18].map((x, i) => N(`RetreatNraW${i + 1}`, FrontAtX(x, i ? 0.5 : -0.5), { yaw: -80, group: "westFront", to: [PL.mouth, T(T_CORNER1 + 6)], guess: true })),
      ...lmgUnits(), ...mortarUnits(), ...RushUnits("03-2"), ...DitchSquadUnits("03-2"),
    ],
    pois: [...pitPois(), Poi("ShellHit", "掷弹筒弹落点（坑沿）", "danger", Pt(PIT.pitNra2.x + 0.4, PL.pit.z - PL.pit.d / 2 - 0.4), 1.5), scarpPoi()],
  });

  const pA = Pt(PL.fireA.x, PL.fireA.z);
  const lost03 = L0105_FRONT_LOST_FROM_X["03"];
  Add({
    id: "03-3", ...s03, name: "三个射位轮换",
    player: { x: pA.x, z: pA.z, yawDeg: PL.fireA.yawDeg, pitchDeg: 1, stance: "stand" },
    what: "地坎上冒出人来，翻过来扑在最远那道田埂后；两挺轻机枪一扫坑沿就得缩头，正面趁这几秒跳一段。西边干水沟里一个班摸到坑西北，东头的鬼子沿沟往西清过来。",
    next: { text: "掷弹筒冒烟就换射位", x: PL.fireC.x, z: PL.fireC.z, radiusM: 1.5 },
    how: ["地坎上冒出钢盔——人是从坎后那片看不见的低地上来的", "机枪一扫坑沿就缩头；再抬头，正面又近了十几米", "「左边沟里头有人！」——沟里那个班才是要命的", "东头沟里的一个弯一个弯清过来", "掷弹筒冒烟——几秒后落地，一发比一发近"],
    notes: "2026-10-20 第四轮（用户问「日军真是在大平面上直直冲过来的？」）：正面是拖住守军的——先用轻机枪压住坑沿、趁坑里的人缩头一组跳一段，一跃 12–18 m、三四秒就扑倒，两道田埂之间扑在麦地里；整个 03-3 正面只从 F3（约 185 m）推到 F2（约 140 m）。主攻在侧面：西边干水沟里一个班（8 人、一挺轻机枪），班长在沟里探头被刘文财看见，出沟后轻机枪架在沟尽头打丙位、步兵扑在 N2 后（离坑约 60 m），丙位打倒两个。东头清沟的从约 40 m 推到约 15 m。依据：日军进攻先用火力压住守军、散开一段段往前、出发线放在挡得住枪弹的地方、偏爱包抄（美军 TM-E 30-480，1944）；滕县攻城的日军步兵第 10 联队带轻机枪 72 挺、炮 54 门（中文维基转引战斗详报）。具体人数、路线、时刻是创作。掷弹筒编制待核（资料多说每小队配 2–3 具，与「分队一级的配备」不一致）。从坑里只看得见发射冒的烟；听到「嘭」后约 5–6 s 落地（物理估算）。轻机枪一挺架在坑北约 110 m 坟地的坟后、一挺靠在约 135 m 的麦秸垛边，掷弹筒组在约 205 m 那道地坎下（北边低 2 m，从坑里看不见人）。坑北的地物是创作（鲁南农田三月的常见样子）。",
    units: [
      N("Luo", Pt(PL.fireB.x - 0.2, PL.fireB.z - 0.2), { yaw: PL.fireB.yawDeg, aim: true }),
      N("LiuWencai", Pt(PL.pit.x + 2.0, PL.pit.z + 1.7), { face: PL.fireA, stance: "crouch", guess: true }),
      N("Gunner", PIT.gunner, { yaw: 0, stance: "crouch", aim: true }),
      N("Yaowa", PIT.yaowa, { face: PIT.gunner, stance: "crouch" }),
      N("PitNra1", PIT.pitNra1, { yaw: 0, aim: true, guess: true }),
      N("PitNra2", PIT.pitNra2, { yaw: 180, down: true, lie: "along", guess: true }),
      N("PitNra3", Pt(PL.fireC.x, PL.fireC.z), { yaw: PL.fireC.yawDeg, aim: true, guess: true }),
      N("PitNra4", PIT.pitNra4, { face: PL.parapet, stance: "crouch", role: "grenadeBundle", guess: true }),
      ...lmgUnits(), ...mortarUnits(), ...RushUnits("03-3"), ...DitchSquadUnits("03-3"),
      ...TrenchClearers([lost03 + 27, lost03 + 33, lost03 + 39], { to: FrontAtX(lost03) }),
    ],
    pois: [...pitPois(), POI.frontLost("03"), scarpPoi(), ditchEndPoi()],
  });

  const tankArc = ArcTo(TANK_SEEN, PL.parapet, 4, 4);
  const p34 = Pt(PL.fireA.x + 1.0, PL.fireA.z + 0.3);   // 胸墙塌下来的土埋了甲位，往东让开一步（还在射击踏台上）
  Add({
    id: "03-4", ...s03, name: "变坏：机枪手中弹、战车露头",
    player: { x: p34.x, z: p34.z, yawDeg: R1(Yaw(p34, TANK_SEEN) + 25), pitchDeg: 1, stance: "crouch" },
    what: "机枪手腿上中弹，幺娃把他往后拖；路那头战车露头，一炮打在坑沿。",
    next: { text: "看坑沿外那捆手榴弹", x: BUNDLE.x, z: BUNDLE.z, radiusM: 1 },
    how: ["掷弹筒弹落在捷克式旁边", "战车一炮打塌一截胸墙", "抱手榴弹的弟兄爬出去，死在坑沿外", "那捆手榴弹落在沟沿上"],
    notes: "机枪手 03-4 先算倒地（刚中弹），03-5 起由幺娃架着走。战车炮口射界画到坑沿。坑外（第四轮）：正面这时才趴到 F2（约 140 m）；沟里那个班的轻机枪架在沟尽头打丙位，步兵趴在 N2 后（离坑约 60 m）、出沟时倒了两个；东头清沟的到了约 15 m。",
    signals: [SIG.pitShelled],
    units: [
      N("Luo", Pt(PL.fireB.x - 0.2, PL.fireB.z - 0.2), { yaw: PL.fireB.yawDeg, aim: true }),
      N("LiuWencai", Pt(PL.pit.x + 2.0, PL.pit.z + 1.7), { face: PL.fireA, stance: "crouch", guess: true }),
      N("Gunner", Pt(PL.pit.x - 1.0, PL.pit.z - 0.6), { yaw: 0, down: true }),
      N("Yaowa", Pt(PL.pit.x - 1.6, PL.pit.z + 0.7), { face: PIT.gunner, stance: "crouch" }),
      N("PitNra1", PIT.pitNra1, { yaw: 0, aim: true, guess: true }),
      N("PitNra2", PIT.pitNra2, { yaw: 180, down: true, lie: "along", guess: true }),
      N("PitNra3", Pt(PL.fireC.x, PL.fireC.z), { yaw: PL.fireC.yawDeg, aim: true, guess: true }),
      N("PitNra4", BUNDLE_MAN, { yaw: 0, down: true, climb: true, path: [Pt(PL.parapet.x + 0.5, PL.parapet.z), BUNDLE_MAN] }),
      J("Tank", TANK_SEEN, { yaw: PL.tankFirstSeen.yawDeg, arc: tankArc, straight: true, path: Slice(L0105_ROAD, Station(L0105_ROAD, TANK_SEEN) - 14, Station(L0105_ROAD, TANK_SEEN)) }),
      ...lmgUnits(), ...mortarUnits(), ...RushUnits("03-4"), ...DitchSquadUnits("03-4"),
      ...TrenchClearers([lost03 + 2, lost03 + 7, lost03 + 13]),
    ],
    pois: [Poi("Bundle", "那捆手榴弹", "objective", BUNDLE, 0.8), Poi("TankSeen", "战车露头", "danger", TANK_SEEN, 5), ...pitPois()],
  });

  const p35 = Pt(PL.fireA.x + 1.6, PL.fireA.z + 1.2);   // 踏台下、塌土东边
  Add({
    id: "03-5", ...s03, name: "撤：把那捆捡起",
    player: { x: p35.x, z: p35.z, yawDeg: Yaw(p35, BUNDLE), pitchDeg: -10, stance: "crouch" },
    what: "殿后的兵跑过沟口：「后头没得人了！」班长：「走了！把那捆捡起！」",
    next: { text: "捡起那捆手榴弹", x: BUNDLE.x, z: BUNDLE.z, radiusM: 1 },
    how: ["殿后的兵从西边沟里跑过沟口", "班长下到沟口回身喊", "幺娃架着机枪手先往下走", "捡完退到拐角 1"],
    notes: "捡起后的下一步是拐角 1（下一帧）。坑里另两个能动的弟兄跟着往南撤（推测），倒下的两个留在坑里。为什么撤（第四轮）：三面挤——正面还拖在 130 m 外，西边沟里那个班有两个跳到了 N1（离坑约 45 m），东头沟里的到了 10 m 上下。",
    signals: [SIG.pitShelled],
    units: [
      N("Luo", T(1.5, 0.6), { face: PL.pit, aim: true }),
      N("LiuWencai", T(5.5, -0.4), { yaw: T(5.5).heading }),
      N("Gunner", T(3.0, -0.45), { yaw: T(3).heading, stance: "crouch" }),
      N("Yaowa", T(3.0, 0.45), { yaw: T(3).heading }),
      N("PitNra1", T(8.0, 0.5), { yaw: T(8).heading, to: T(T_SOUTH_END + 10), guess: true }),
      N("PitNra2", PIT.pitNra2, { yaw: 180, down: true, lie: "along", guess: true }),
      N("PitNra3", T(10.0, -0.5), { yaw: T(10).heading, to: T(T_SOUTH_END + 13), guess: true }),
      N("PitNra4", BUNDLE_MAN, { yaw: 0, down: true }),
      N("RearguardNra", FrontAtX(-4, 0.4), { name: "殿后的兵", yaw: -85, to: [PL.mouth, T(T_BEND + 3)], from: FrontAtX(-26, 0.4) }),
      J("Tank", TANK_SEEN, { yaw: PL.tankFirstSeen.yawDeg, arc: tankArc, straight: true, intent: RoadRoute(TANK_SEEN, RoadBack(70)) }),
      ...lmgUnits(), ...mortarUnits(), ...RushUnits("03-5"), ...DitchSquadUnits("03-5"),
      ...TrenchClearers([lost03 - 3, lost03 + 2, lost03 + 8]),
    ],
    pois: [Poi("Bundle", "那捆手榴弹", "objective", BUNDLE, 0.8), POI.corner1("poi"), POI.mouth("landmark")],
  });

  // ======================= 04 一段一段往后退 =======================
  const s04 = { stage: 4, stageTitle: "一段一段往后退" };
  const p41 = T(T_CORNER1 + 1.6, -0.2);
  const pitArcFrom = Pt(PL.pit.x - 0.4, PL.pit.z + 1.6);
  Add({
    id: "04-1", ...s04, name: "退到拐角 1 回身顶",
    player: { x: p41.x, z: p41.z, yawDeg: Yaw(p41, PL.pit), pitchDeg: 2, stance: "crouch" },
    what: "坑丢了，鬼子在坑里顺第一段沟往下打。拐角 1 挡住射线，回身顶一阵。",
    next: { text: "顶一阵再退到下个拐角", x: PL.bend.x, z: PL.bend.z, radiusM: 2.5 },
    how: ["子弹顺着第一段沟打下来", "幺娃架着机枪手就在前头几步", "班长在下个拐角回身喊人", "交通沟只有一条路"],
    notes: "回身顶住，就是为了给前头这两个人争时间。坑里的日军是 03 东头沿前沿沟清过来的那几个（IjaTrench1–3，离坑最近，先进的坑；2026-10-20 第四轮起正面跃进的还在 130 m 外）。",
    signals: [SIG.pitShelled],
    units: [
      N("Luo", T(T_BEND + 0.6, 0.6), { yaw: BackYaw(TRAFFIC, T_BEND - 2) }),
      N("LiuWencai", T(T_BEND - 5, -0.4), { yaw: T(T_BEND - 5).heading }),
      N("Gunner", T(T_CORNER1 + 6.5, -0.45), { yaw: T(T_CORNER1 + 6.5).heading }),
      N("Yaowa", T(T_CORNER1 + 6.5, 0.45), { yaw: T(T_CORNER1 + 6.5).heading }),
      J("IjaTrench1", pitArcFrom, { group: "trenchClear", role: "rifleman", face: PL.corner1, aim: true, arc: ArcTo(pitArcFrom, PL.corner1, 4, 3) }),
      J("IjaTrench2", Pt(PL.pit.x + 1.8, PL.pit.z - 0.6), { group: "trenchClear", role: "rifleman", face: PL.mouth, aim: true }),
      J("IjaTrench3", FrontAtX(4.5, 0.3), { group: "trenchClear", role: "rifleman", yaw: 180, aim: true }),
    ],
    pois: [POI.corner1("landmark"), POI.pit("danger", "机枪坑（已丢）"), Poi("Bend", "下个拐角", "poi", PL.bend, 2)],
  });

  const p42 = T(T_SOUTH_END + 1.2, 0.2);
  const ija42 = [T(T_SOUTH_END - 6, 0.5), T(T_SOUTH_END - 12.5, -0.5), T(T_SOUTH_END - 18, 0.3)];
  Add({
    id: "04-2", ...s04, name: "第二次回身：拐角近战",
    player: { x: p42.x, z: p42.z, yawDeg: Yaw(p42, ija42[0]), pitchDeg: 0, stance: "stand" },
    what: "鬼子跳进沟里追，变成拐角近战：手榴弹扔进来要躲，有时要拼刺刀。",
    next: { text: "跟班长退到拐角 2", x: PL.corner2.x, z: PL.corner2.z, radiusM: 2.5 },
    how: ["手榴弹落进沟里", "鬼子从拐角后探身", "班长先到下个拐角回身喊人"],
    notes: "在南直段尽头那个拐角回身；日军跳进交通沟追下来（追兵沿用 03 清前沿沟的那股）。",
    signals: [SIG.pitShelled],
    units: [
      N("Luo", T(T_BRANCH - 2, 0.6), { yaw: BackYaw(TRAFFIC, T_BRANCH - 2) }),
      N("LiuWencai", T(T_SOUTH_END + 13, -0.4), { yaw: T(T_SOUTH_END + 13).heading }),
      N("Gunner", T(T_SOUTH_END + 7, -0.45), { yaw: T(T_SOUTH_END + 7).heading }),
      N("Yaowa", T(T_SOUTH_END + 7, 0.45), { yaw: T(T_SOUTH_END + 7).heading }),
      ...ija42.map((p, i) => J(`IjaTrench${i + 1}`, p, { yaw: p.heading, aim: i === 0, group: "trenchClear" })),
    ],
    pois: [Poi("Grenade", "手榴弹", "danger", T(T_SOUTH_END - 1.5, -0.7), 1.2), Poi("SouthLegEnd", "南直段尽头", "landmark", PL.southLegEnd, 2), POI.corner2("poi")],
  });

  const p43 = T(T_CORNER2 + 1.0, 0.2);
  const tank43 = RoadBack(40);
  const tankInf = (m, i, o = {}) => J(`TankInf${i + 1}`, RoadBack(m, i % 2 ? 1.6 : -1.6), { group: "tankEscort", role: "rifleman", yaw: ROAD_YAW, straight: true, ...o });
  Add({
    id: "04-3", ...s04, name: "退到拐角 2：履带声",
    player: { x: p43.x, z: p43.z, yawDeg: Yaw(p43, tank43), pitchDeg: 4, stance: "crouch" },
    what: "退到拐角 2，路上传来履带声：战车顺着路追下来了，离路口还有几十米。",
    next: { text: "退到路口", x: PL.crossing.x, z: PL.crossing.z, radiusM: 3 },
    how: ["履带声从东北的路上传来", "跟车步兵跟在车后", "沟里的鬼子还在后头追"],
    notes: "战车离路口约 40 m（推测）；跟车步兵三人在车后。战车从 03 露头处顺路开过来。",
    signals: [SIG.pitShelled],
    units: [
      // 10-18 第三轮：班长先到路口、站在板桥北沿外一步回身招呼（原来站在桥面北沿底下，站直了头顶贴着横木）
      N("Luo", T(T_CROSSING - 3.6, 0.6), { yaw: BackYaw(TRAFFIC, T_CROSSING - 3.6) }),
      // 10-18 第三轮：刘文财先过了板桥、在桥南几步蹲着等（从北边过来要钻桥底：过渡里按目标姿态蹲着走，头顶不贴横木）
      N("LiuWencai", T(T_CROSSING + 6, -0.4), { yaw: T(T_CROSSING + 6).heading, stance: "crouch" }),
      N("Gunner", T(T_CORNER2 + 6, -0.45), { yaw: T(T_CORNER2 + 6).heading }),
      N("Yaowa", T(T_CORNER2 + 6, 0.45), { yaw: T(T_CORNER2 + 6).heading }),
      J("IjaTrench1", T(T_SOUTH_END - 6, 0.5), { yaw: 0, down: true }),
      J("IjaTrench2", T(T_BRANCH + 4, -0.5), { yaw: T(T_BRANCH + 4).heading, aim: true }),
      J("IjaTrench3", T(T_BRANCH - 1, 0.4), { yaw: T(T_BRANCH - 1).heading }),
      J("Tank", tank43, { yaw: ROAD_YAW, straight: true, path: [Pt(RoadBack(70).x, RoadBack(70).z), ...RoadRoute(RoadBack(70), tank43)] }),
      tankInf(46, 0, { from: RoadBack(78, -1.6), fromStraight: true }), tankInf(50, 1, { from: RoadBack(82, 1.6), fromStraight: true }), tankInf(54, 2, { from: RoadBack(86, -1.6), fromStraight: true }),
    ],
    pois: [POI.corner2("landmark"), POI.crossing("poi"), Poi("TankRoad", "战车（路上）", "danger", tank43, 4)],
  });

  // ======================= 05 沟里伏击战车（路口板桥） =======================
  // 班长判断：战车要追上来，交通沟太宽、车跨不过去，只有走路口那座板桥才过得了沟——带顺子钻到桥下的沟底趴着等；
  // 幺娃架着机枪手缩在桥南几步。战车压上板桥，板子嘎吱、土从板缝往下漏；车刚过桥，顺子从桥边探身把那捆手榴弹甩上车尾，
  // 车瘫在桥头（TankDisabled，桥面两块门板压断下沉），横着把路堵死。剧本这一拍用户还没最后拍板，白盒先按这个做。
  const s05 = { stage: 5, stageTitle: "沟里伏击战车" };
  const BRIDGE_C = Pt(L0105_BRIDGE.x, L0105_BRIDGE.z);
  const BRIDGE_YAW = L0105_BRIDGE.yawDeg;
  const underMe = T(T_CROSSING + 0.6, -0.5);                 // 桥面底下、中间那根横木旁边
  const underLuo = T(T_CROSSING - 0.9, 0.55);
  const yaowa51 = T(T_CROSSING + 7, 0.45), gunner51 = T(T_CROSSING + 7, -0.45);
  const tank51 = RoadBack(15);
  Add({
    id: "05-1", ...s05, name: "板桥底下：缩在沟底",
    player: { x: underMe.x, z: underMe.z, yawDeg: Yaw(underMe, tank51), pitchDeg: 18, stance: "prone" },
    what: "班长看了一眼路上的战车：「它要过来，只有走那座板桥。」带顺子钻到桥下的沟底趴着。",
    next: { text: "趴在桥下别动" },
    how: ["履带声越来越近", "桥面门板缝里透光", "幺娃架着机枪手缩在桥南几步", "它一过沟，坡后撤下去的人就全在枪口底下"],
    notes: "路口那段交通沟上搭了一座简易板桥：三根顺路方向的横木上铺门板，桥面 3.8 m 宽、与两头路面齐平，驴车和担架都过得去；桥下照常是沟，沟底到横木底约 1.8 m。"
      + "交通沟太宽，战车只能走板桥过沟。班长的判断不新增配音，预演里用说明字。剧本这一拍用户还没最后拍板（Notion 待定：路口要不要盖木板），白盒先按这个做。",
    signals: [SIG.pitShelled],
    units: [
      N("Luo", underLuo, { face: tank51, stance: "crouch" }),
      N("LiuWencai", T(T_CREST + 3, -0.4), { yaw: T(T_CREST + 3).heading, guess: true }),
      N("Gunner", gunner51, { face: BRIDGE_C, stance: "crouch" }),
      N("Yaowa", yaowa51, { face: BRIDGE_C, stance: "crouch" }),
      J("IjaTrench2", T(T_CORNER2 + 8, -0.5), { yaw: T(T_CORNER2 + 8).heading, aim: true }),
      J("IjaTrench3", T(T_CORNER2 + 3, 0.4), { yaw: T(T_CORNER2 + 3).heading }),
      J("Tank", tank51, { yaw: ROAD_YAW, straight: true, path: RoadRoute(tank43, tank51) }),
      tankInf(21, 0, { path: RoadRoute(RoadBack(46, -1.6), RoadBack(21, -1.6)) }), tankInf(25, 1, { path: RoadRoute(RoadBack(50, 1.6), RoadBack(25, 1.6)) }), tankInf(29, 2, { path: RoadRoute(RoadBack(54, -1.6), RoadBack(29, -1.6)) }),
    ],
    pois: [POI.crossing("landmark"), POI.crest("poi")],
  });

  Add({
    id: "05-2", ...s05, name: "战车压上板桥",
    player: { x: underMe.x, z: underMe.z, yawDeg: Yaw(underMe, BRIDGE_C), pitchDeg: 32, stance: "prone" },
    what: "战车压上板桥，门板嘎吱响，土从板缝往下漏，车底就在头顶。",
    next: { text: "车一过桥就甩那捆手榴弹" },
    how: ["履带从头顶压过去", "板子嘎吱响、往下弯", "土从板缝往下漏"],
    notes: "战车车身正压在板桥上（桥面上、车底离顺子不到 2 m）；跟车步兵还在车后。人在桥下沟底，摆位检查按高差认作「在桥下」，不算站在车身脚印里。",
    signals: [SIG.pitShelled],
    units: [
      // 10-18 第三轮：蹲着缩在桥下（原来趴着：从趴到蹲那一下动作库先站起来再跪，头顶贴着横木）
      N("Luo", underLuo, { face: BRIDGE_C, stance: "crouch" }),
      N("LiuWencai", T(T_CREST + 3, -0.4), { yaw: T(T_CREST + 3).heading, guess: true }),
      N("Gunner", gunner51, { face: BRIDGE_C, stance: "crouch" }),
      N("Yaowa", yaowa51, { face: BRIDGE_C, stance: "crouch" }),
      J("IjaTrench2", T(T_CORNER2 + 13, -0.5), { yaw: T(T_CORNER2 + 13).heading, aim: true }),
      J("IjaTrench3", T(T_CORNER2 + 8.5, 0.4), { yaw: T(T_CORNER2 + 8.5).heading }),
      J("Tank", BRIDGE_C, { yaw: BRIDGE_YAW, straight: true, path: RoadRoute(tank51, BRIDGE_C) }),
      tankInf(7, 0, { path: RoadRoute(RoadBack(21, -1.6), RoadBack(7, -1.6)) }), tankInf(11, 1, { path: RoadRoute(RoadBack(25, 1.6), RoadBack(11, 1.6)) }), tankInf(15, 2, { path: RoadRoute(RoadBack(29, -1.6), RoadBack(15, -1.6)) }),
    ],
    pois: [POI.crossing("danger")],
  });

  const p53 = T(T_CROSSING + 4.6, -1.5);   // 桥面西南边沿外一步、贴西壁站起来探身（站直了眼睛刚好够得着车尾顶）
  const stopR = PL.tankStop.yawDeg * Math.PI / 180;
  const tankRear = Pt(TANK_STOP.x + Math.sin(stopR) * 2.9, TANK_STOP.z + Math.cos(stopR) * 2.9);
  const blocked = [RoadBack(9, -1.6), RoadBack(12, 1.6), RoadBack(15, -1.6)];
  Add({
    id: "05-3", ...s05, name: "甩手榴弹炸车尾",
    player: { x: p53.x, z: p53.z, yawDeg: Yaw(p53, tankRear), pitchDeg: 22, stance: "stand" },
    what: "车刚过桥，顺子从桥边探身把那捆手榴弹甩上车尾。战车瘫在桥头，横着把路堵死。",
    next: { text: "搭把手，架机枪手翻坡顶", x: PL.crest.x, z: PL.crest.z, radiusM: 3 },
    how: ["幺娃「顺儿哥，搭把手！」", "车体残骸斜在桥头路上", "桥面压断了两块门板", "跟车步兵和沟里追来的鬼子被堵在桥那头"],
    notes: "TankDisabled：战车停在锚点 tankStop（桥头西南、车身斜着堵住路），场景 gates 里桥面中间两块门板压断下沉——后面的人过不了沟。",
    signals: [SIG.pitShelled, SIG.tankDisabled],
    units: [
      // 10-18 第三轮：班长原来站在桥下正中、站直了头顶贴着桥板（桥下横木底离沟底只有 1.76 m，压断的两块门板塌下来后只剩 1.5 m）：
      // 改成钻出桥底、在桥面南沿外一步蹲着端枪（05-2 → 05-3 蹲着走过去；05-3 → 05-4 往南走不再从桥底过）
      N("Luo", T(T_CROSSING + 3.2, 0.6), { face: tankRear, aim: true, stance: "crouch" }),
      N("LiuWencai", T(T_CREST + 3, -0.4), { yaw: BackYaw(TRAFFIC, T_CREST + 3), guess: true }),
      N("Gunner", gunner51, { face: p53, stance: "crouch" }),
      N("Yaowa", yaowa51, { face: p53 }),
      J("IjaTrench2", T(T_CROSSING - 13, -0.5), { yaw: T(T_CROSSING - 13).heading, aim: true }),
      J("IjaTrench3", T(T_CROSSING - 17, 0.4), { yaw: T(T_CROSSING - 17).heading }),
      J("Tank", TANK_STOP, { name: "战车（瘫）", yaw: PL.tankStop.yawDeg, straight: true, arc: null, path: [Pt(BRIDGE_C.x, BRIDGE_C.z), TANK_STOP].slice(1) }),
      ...blocked.map((p, i) => J(`TankInf${i + 1}`, p, { group: "tankEscort", role: "rifleman", face: BRIDGE_C, stance: i === 1 ? "crouch" : undefined, straight: true })),
    ],
    pois: [Poi("TankWreck", "战车（瘫在桥头）", "landmark", TANK_STOP, 4), Poi("BrokenBoards", "压断的门板", "danger", BRIDGE_C, 2), POI.crest("objective")],
  });

  const p54 = Pt(PL.assemblyEntry.x + 0.8, PL.assemblyEntry.z + 3.0);
  const crestIja = [[-7, -2.5], [5.5, -3], [10, -1.5], [-12, -1]].map(([dx, dz]) => Pt(PL.crest.x + dx, PL.crest.z + dz));
  const crestIjaIds = ["TankInf1", "TankInf2", "TankInf3", "IjaTrench2"];
  Add({
    id: "05-4", ...s05, name: "翻过坡顶下到干沟，回头：不撵了？",
    player: { x: p54.x, z: p54.z, yawDeg: Yaw(p54, PL.crest), pitchDeg: 14, stance: "stand" },
    what: "翻过坡顶、下到干沟里回头：鬼子停在坡顶上架枪，没追下来。刘文财：「……不撵了？」",
    next: { text: "「表看了，走！」顺干沟往东", x: PL.laneHead.x, z: PL.laneHead.z, radiusM: 4 },
    how: ["班长「表看了，走！」", "鬼子趴在坡顶上架枪", "顺子和幺娃架着机枪手，最后一个回来"],
    notes: "坡顶上的鬼子是跟车步兵和沟里追来的那几个，桥面压断了过不来，从桥东头绕过沟爬上坡顶（位置推测）。干沟两岸陡坎挡着，他们得走到坎沿上才看得见沟底。06 接着在这条干沟里（冬瓜头一趟就抬走了）。",
    signals: [SIG.pitShelled, SIG.tankDisabled],
    units: [
      N("Luo", Pt(p54.x - 1.4, p54.z + 2.6), { yaw: 180 }),
      N("LiuWencai", Pt(p54.x - 2.6, p54.z + 0.8), { face: PL.crest }),
      N("Gunner", Pt(p54.x + 0.9, p54.z - 0.6), { face: PL.assembly, stance: "crouch" }),
      N("Yaowa", Pt(p54.x + 1.8, p54.z - 1.2), { face: PL.crest }),
      J("Tank", TANK_STOP, { name: "战车（瘫）", yaw: PL.tankStop.yawDeg, straight: true, arc: null }),
      // 10-18 第三轮：都绕桥东头上坡顶（BRIDGE_EAST_DETOUR），沟里追来的那个先绕过靠沟壁的门板、从沟东沿爬出来
      ...crestIja.map((p, i) => J(crestIjaIds[i], p, { group: "crestHold", role: "rifleman", face: PL.assembly, stance: "prone", aim: true, straight: true, guess: true, climb: true,
        path: [...(i === 3 ? [T(T_CROSSING - 11.4, 0), T(T_CROSSING - 10.6, 5)] : []), ...BRIDGE_EAST_DETOUR, p] })),
    ],
    pois: [POI.crest("danger"), POI.assembly("landmark"), Poi("LaneHead", "凹路口（往后送）", "objective", PL.laneHead, 2.5), Poi("TankWreck", "战车（瘫在桥头）", "landmark", TANK_STOP, 4)],
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
      const route = TrenchRoute(from, u);
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
  { id: "A", name: "前沿沟与机枪坑", stages: [3, 4], box: { minX: -70, maxX: 125, minZ: -28, maxZ: 14 } },
  { id: "B", name: "支沟与防炮洞", stages: [1, 2], box: { minX: 18, maxX: 75, minZ: 56, maxZ: 74 } },
  { id: "C", name: "交通沟", stages: [2, 5], box: { minX: -6, maxX: 42, minZ: 0, maxZ: 131 } },
  { id: "D", name: "路口板桥、坡顶与干沟（集结处）", stages: [2, 5], box: { minX: 8, maxX: 86, minZ: 110, maxZ: 162 } },
  { id: "E", name: "坑北开阔地（03 日军）", stages: [3, 3], box: { minX: -60, maxX: 60, minZ: -222, maxZ: -28 } },
]);

/**
 * 生成 FirstLevel0105 的配置。issues（可选数组）：摆位 / 走位问题一条一行 push 进去（读得到场景文件时才查实心块与高度）。
 * @returns {Promise<object>}
 */
export async function BuildFirstLevel0105Config({ commit = "", generatedAt = "", issues = null } = {}) {
  const raw = Keyframes();
  FinishPaths(raw);
  const doc = {
    schema: BLOCKOUT_SCHEMA,
    level: L0105_LEVEL_KEY,
    title: L0105_TITLE,
    source: {
      generator: FIRST_LEVEL_0105_GENERATOR,
      gameVersion: "Notion 01–05 剧本 + 空间拓扑关系（2026-10-18）",
      commit, generatedAt,
    },
    zones: ZONES.map((z) => ({ ...z, stages: [...z.stages], box: { ...z.box } })),
    keyframes: raw.map(OrderKeyframe),
  };
  if (Array.isArray(issues)) {
    const meta = new Map();
    raw.forEach((kf) => kf.units.forEach((u) => meta.set(`${kf.id}/${u.id}`, META.get(u) || {})));
    const scene = await LoadSceneLayout();
    issues.push(...FirstLevel0105Issues(doc, { scene, meta }));
  }
  return doc;
}

// ---------------------------------------------------------------------------
// 摆位 / 走位检查

/** node 里读场景文件（没有或在浏览器里返回 null：只做与场景无关的检查）。 */
export async function LoadSceneLayout() {
  try {
    const fs = await import("node:fs");
    const url = new URL("./Blockout/FirstLevel0105.scene.json", import.meta.url);
    if (!fs.existsSync(url)) return null;
    const doc = JSON.parse(fs.readFileSync(url, "utf8"));
    const { LayoutFromSceneDoc } = await import("./Script_EditorBlockoutLevels.mjs");
    return LayoutFromSceneDoc(doc);
  } catch (error) {
    return { error: String(error?.message || error) };
  }
}

export const L0105_CHECK = Object.freeze({
  personM: 0.6, playerM: 0.6, playerDownM: 0.4, litterM: 1.0, carryM: 0.5, carryReachM: 1.6, nextM: 2,
  tank: { w: 2.18, d: 5.75, marginM: 0.3 },
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
    // 站在台阶 / 射击踏台上（脚点在块脚印里、块顶不高过地面 STEP_M）：人是站在它上面，不算站进去
    if (pen >= body.radiusM && b.y + b.h / 2 <= g + L0105_CHECK.stepUpM) continue;
    return b;
  }
  return null;
}

function InCorridor(p) {
  if (OPEN_AREAS.some((a) => InArea(a, p)) || InGullyFloor(p, 0.3)) return true;
  return NearestOnNet(p).dist <= NET_SNAP_M;
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
  const r = l.yawDeg * Math.PI / 180, fx = -Math.sin(r), fz = -Math.cos(r), reach = L0105_CHECK.carryReachM;
  const front = { x: l.x + fx * reach, z: l.z + fz * reach };
  const rear = bearers >= 2 ? { x: l.x - fx * reach, z: l.z - fz * reach } : { x: l.x, z: l.z };
  return [rear, front];
}
function SegDist(p, a, b) {
  const dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz;
  const t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / l2)) : 0;
  return Math.hypot(p.x - a.x - dx * t, p.z - a.z - dz * t);
}
/** 车身脚印上中心、四角、四边中点 9 处取最高的地面（同运行时 TankGroundY，只看高度场）。 */
function TankFootGround(ground, v) {
  const r = v.yawDeg * Math.PI / 180, fx = -Math.sin(r), fz = -Math.cos(r), sx = -fz, sz = fx;
  const hl = L0105_CHECK.tank.d / 2, hw = L0105_CHECK.tank.w / 2;
  let best = -Infinity;
  for (const a of [-1, 0, 1]) for (const b of [-1, 0, 1]) best = Math.max(best, ground(v.x + fx * hl * a + sx * hw * b, v.z + fz * hl * a + sz * hw * b));
  return best;
}
function OnTank(p, v, margin) {
  const r = v.yawDeg * Math.PI / 180, fx = -Math.sin(r), fz = -Math.cos(r);
  const dx = p.x - v.x, dz = p.z - v.z;
  return Math.abs(dx * fx + dz * fz) < L0105_CHECK.tank.d / 2 + margin && Math.abs(-dx * fz + dz * fx) < L0105_CHECK.tank.w / 2 + margin;
}

/**
 * 配置的摆位 / 走位问题（每条一行）。scene = LayoutFromSceneDoc 的结果（null = 场景还没有，只做与场景无关的检查）。
 * meta：`${kfId}/${unitId}` → { buried, onLitter }（生成器内部标记；手改的 JSON 没有它，冬瓜埋在土里那一帧会多报一条）。
 */
export function FirstLevel0105Issues(doc, { scene = null, meta = new Map() } = {}) {
  const C = L0105_CHECK, out = [];
  const norm = NormalizeBlockout(doc);
  const b = L0105_BOUNDS;
  const InBounds = (p) => p.x >= b.minX && p.x <= b.maxX && p.z >= b.minZ && p.z <= b.maxZ;
  const hasScene = scene && !scene.error;
  if (scene?.error) out.push(`场景文件读不进来，跳过实心块 / 高度检查：${scene.error}`);
  const ground = hasScene ? scene.terrainSampler : null;
  norm.keyframes.forEach((kf, i) => {
    const M = (u) => meta.get(`${kf.id}/${u.id}`) || {};
    if (!InBounds(kf.player)) out.push(`${kf.id} 玩家出界 (${kf.player.x}, ${kf.player.z})`);
    for (const u of kf.units) if (!InBounds(u)) out.push(`${kf.id} ${u.id} 出界 (${u.x}, ${u.z})`);
    // 间距
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
    for (const v of kf.units.filter((u) => u.kind === "tank")) {
      // 桥下的沟底（比车身脚下低 ≥ 1.5 m）不算：05 战车压过板桥时人趴在桥下
      const tankY = ground ? TankFootGround(ground, v) : null;
      const Under = (p) => tankY !== null && ground(p.x, p.z) < tankY - 1.5;
      for (const u of people) if (OnTank(u, v, C.tank.marginM) && !Under(u)) out.push(`${kf.id} ${u.id} 站在车身 ${v.id} 下 / 上`);
      if (OnTank(kf.player, v, 0) && !Under(kf.player)) out.push(`${kf.id} 玩家在车身 ${v.id} 的脚印里`);
    }
    if (Number.isFinite(kf.next?.x) && Dist(kf.next, kf.player) < C.nextM) out.push(`${kf.id} 下一步目标离玩家不到 ${C.nextM} m（只写文字）`);
    // 实心块
    if (hasScene) {
      const solids = SolidsFor(scene, kf.signals);
      const hit = BodyHit(solids, ground, kf.player.x, kf.player.z, C.playerBody, 0);
      if (hit) out.push(`${kf.id} 玩家站进 ${hit.id}`);
      for (const u of kf.units) {
        if (!PEOPLE.has(u.kind) || M(u).buried) continue;
        const h = BodyHit(solids, ground, u.x, u.z, C.body, C.body.unitTallM);
        if (h) out.push(`${kf.id} ${u.id} 站进 ${h.id}`);
      }
    }
    // 过渡
    if (i === 0) return;
    const prev = norm.keyframes[i - 1];
    const solids = hasScene ? SolidsFor(scene, [...prev.signals, ...kf.signals]) : null;
    for (const entry of PlanTransition(prev, kf).units) {
      const unit = entry.unitTo || entry.unitFrom;
      if (!PEOPLE.has(unit.kind) && unit.kind !== "litter") continue;
      if (entry.route.length < 2) continue;
      const samples = Samples(entry.route, C.stepM);
      const ends = [entry.route[0], entry.route[entry.route.length - 1]];
      if (ends.every(InCorridor)) {
        const off = samples.find((p) => !InCorridor(p));
        if (off) out.push(`${prev.id}→${kf.id} ${entry.id} 的走位离开沟（${R1(off.atM)} m 处 (${R1(off.x)}, ${R1(off.z)})，会翻沟壁）`);
      }
      if (!hasScene) continue;
      const hits = new Set();
      for (const p of samples) {
        const h = BodyHit(solids, ground, p.x, p.z, C.body, C.body.routeTallM);
        if (h && !hits.has(h.id)) { hits.add(h.id); out.push(`${prev.id}→${kf.id} ${entry.id} 的走位穿过 ${h.id}（${R1(p.atM)} m 处）`); }
      }
      // 高差：1 m 内爬升 / 下降超过 climbM（沟壁）；标了 climb 的（跳进沟、翻出沟沿）不报
      if ((meta.get(`${kf.id}/${entry.id}`) || {}).climb || (meta.get(`${prev.id}/${entry.id}`) || {}).climb) continue;
      const hs = samples.map((p) => ground(p.x, p.z));
      const win = Math.round(C.climbWindowM / C.stepM);
      for (let k = win; k < hs.length; k++) {
        if (Math.abs(hs[k] - hs[k - win]) > C.climbM) {
          out.push(`${prev.id}→${kf.id} ${entry.id} 的走位在 ${R1(samples[k].atM)} m 处 1 m 内高差 ${R2(Math.abs(hs[k] - hs[k - win]))} m（翻沟壁？）`);
          break;
        }
      }
    }
  });
  return out;
}
