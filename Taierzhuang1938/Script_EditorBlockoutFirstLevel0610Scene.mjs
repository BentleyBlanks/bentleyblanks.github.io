// ===========================================================================
// Script_EditorBlockoutFirstLevel0610Scene.mjs —— 第一关 06–10 新剧本白盒（FirstLevel0610）的场景生成器（node 专用）
//
// 契约 docs/Data_EditorBlockout.md §2.2（场景文件格式，含 gates 与块的可选 y）、§15。产物：
//   Blockout/FirstLevel0610.scene.json  高度网格 + 体块 + 随信号体块 + 地标 + 路与沟的中心线
// 跑法：node Taierzhuang1938/Script_EditorBlockoutCli.mjs scene FirstLevel0610 --force
//
// 坐标与尺寸只读 Data_EditorBlockoutFirstLevel0610Space（唯一口径）；本文件只定「怎么烘」：
//   1. 自然地面：z < 205 直接用 0105 的 L0105Ground（交通沟坡道、干沟、南岸、凹路头一段逐点一致）；z ≥ 205 用 0105 的 NaturalHeight 再叠本关的大形。
//   2. 凹路：0105 的折线原样接上再往南到村口路沟的北沿，路底按弧长分段缓降 / 缓升到 −0.9 直接接进沟底。
//   3. 村口路沟：东西向，沟底 3 m 宽、−0.9；街口那一段南壁放缓成坡道；东头收掉、西头挖进河汊子。
//   4. 河汊子：贴着庄子西墙的南北向河沟，沟底 −2.7、两壁陡、庄子那一段东岸不堆土埂；沟底铺满 1 m 深的水。
//   5. 耿家庄：整村压平到 +0.3，胡同 / 街 / 路口压低 12 cm；街坊家的地瓜窖、村西的取土坑（积水）平底开挖。东北进庄的道压低 0.15、道边坟头。
//   6. 体块（第六版，2026-10-22）：全村院子按 L0610_YARDS 一院一院盖——院墙（共墙只画一道，按 WallPlan 合并；带门洞 / 枪眼 / 豁口 / 狗洞）、
//      北屋 / 配房 / 南屋（大多实心；老耿家北屋与灶屋、街坊家北屋与西配房、东街南侧两座后墙对街的北屋是空心的，墙 + 平顶）、
//      菜园的矮篱、取土坑的水、关着的 / 半掩的院门扇、瓦砾堆（炸塌的墙和房，把岔路堵死）、窄胡同里的柴垛、石碾、土地庙、麦秸垛、
//      零散的树（房前屋后，不成排）、日常摆件、干沟南岸的枯树（0105 的表）；随信号体块：
//      CartDeparted（车上的弹药箱）/ SideGateOpen（共用墙上的便门扇）/ CellarBlast（街坊家窖口的盖板飞开、冒烟）/ MgSilenced（堂屋枪眼后的机枪 → 石碾后）/
//      NorthYardGatesBroken（北边院子链上的三道门扇倒下）/ BarrageHit（老耿家北屋东间的后墙与房顶塌下来、石碾旁一堆新瓦砾）/
//      LaneWallCollapse（窄胡同中段西墙倒进胡同：墙板横着、瓦砾堆把胡同堵死）。
//
// 纪律：不读时钟、不读 git（commit / generatedAt 由 CLI 传入）；没有随机数，生成两次逐字相同。
// ===========================================================================

import fs from "node:fs";
import { BLOCKOUT_SCENE_SCHEMA, LandmarkIssues } from "./Script_EditorBlockoutConfig.mjs";
import { HeightGridSampler } from "./Script_EditorBlockoutLevels.mjs";
import { L0105Ground, NaturalHeight as NaturalHeight0105, SightBlock } from "./Script_EditorBlockoutFirstLevel0105Scene.mjs";
import {
  L0610_LEVEL_KEY, L0610_BOUNDS, L0610_CELL_M, L0610_HEIGHTS, L0610_PLAIN_PROFILE, L0610_LANE, L0610_DITCH, L0610_RIVER, L0610_VILLAGE,
  L0610_STREETS, L0610_GENG, L0610_JIEFANG, L0610_BENJIA, L0610_YARDS, L0610_RUBBLE, L0610_SOUTH_LANE, L0610_EAST_STREET, L0610_ROUTE, L0610_TREES,
  L0610_EAST_ROAD, L0610_PROP_KINDS, L0610_PROPS, L0610_COLLAPSED_HOUSES, L0610_SIGNALS, L0610_PLACES, L0610_SPAWN, L0610_FROM_0105, L0610_MOUTH_SHOOTERS,
  L0610_FALLEN_WALLS, L0610_EAST_YARD_ROUTE, LineLength, Station, LanePointAtZ,
  // 第八版
  L0610_LANE_SIDE, L0610_ROADS, L0610_FOOTPATHS, L0610_FIELD_ZONES, L0610_FIELDS, L0610_FIELD_RIDGE, L0610_GROVES, L0610_FIELD_GRAVES, L0610_FIELD_TREES, L0610_EDGE_CLUMPS,
  L0610_THRESHING, L0610_OUTER_GARDENS, L0610_OUTER_POND, L0610_OUTER_DUNG, L0610_FARMSTEADS, L0610_WELLS, L0610_FIELD_SHRINE, L0610_WATCHTOWER, L0610_TEMPLE, L0610_SHOP, L0610_TOILET,
  L0610_LANE_PATHS, L0610_LOCKED_YARDS, L0610_YARD_POSE, L0610_DROPPED_YARDS, L0610_NAMED_TOILETS, RiverAtZ, Hash01, PointInPoly, PathNearest, YardPose, YardToWorld, YardCorners, ToiletFor, YardGateWorld,
} from "./Data_EditorBlockoutFirstLevel0610Space.mjs";

export { SightBlock, L0610_MOUTH_SHOOTERS };
const EYR = L0610_EAST_YARD_ROUTE;
export const L0610_SCENE_GENERATOR = "Script_EditorBlockoutCli.mjs scene FirstLevel0610";

const H = L0610_HEIGHTS;
const V = L0610_VILLAGE;
const G = L0610_GENG;
const J = L0610_JIEFANG;
const B = L0610_BENJIA;
const ST = L0610_STREETS;
const ES = L0610_EAST_STREET;
const SLN = L0610_SOUTH_LANE;
const SIG = L0610_SIGNALS;
const R2 = (v) => Math.round(v * 100) / 100;
const Clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const Smooth = (v) => { const t = Clamp01(v); return t * t * (3 - 2 * t); };
const Lerp = (a, b, t) => a + (b - a) * t;

// ---------------------------------------------------------------------------
// 1. 自然地面

function RectOutside(x, z, box) {
  const dx = Math.max(box.minX - x, 0, x - box.maxX), dz = Math.max(box.minZ - z, 0, z - box.maxZ);
  return Math.hypot(dx, dz);
}
function RectSdf(x, z, box) {
  const cx = (box.minX + box.maxX) / 2, cz = (box.minZ + box.maxZ) / 2, hx = (box.maxX - box.minX) / 2, hz = (box.maxZ - box.minZ) / 2;
  const qx = Math.abs(x - cx) - hx, qz = Math.abs(z - cz) - hz;
  return Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0);
}
function Knots(knots, t) {
  if (t <= knots[0][0]) return knots[0][1];
  for (let i = 1; i < knots.length; i++) {
    const [t0, y0] = knots[i - 1], [t1, y1] = knots[i];
    if (t <= t1) return Lerp(y0, y1, Smooth((t - t0) / (t1 - t0)));
  }
  return knots[knots.length - 1][1];
}

const NORTH_SPLIT_Z = 205;
let north0105 = null;
function NorthGround(x, z) {
  if (!north0105) north0105 = L0105Ground().Ground;
  return north0105(x, z);
}
export function BaseHeight(x, z) {
  const base = z < NORTH_SPLIT_Z ? NorthGround(x, z) : NaturalHeight0105(x, z);
  return base + Knots(L0610_PLAIN_PROFILE, z);
}

// 凹路
const LANE = L0610_LANE;
const LANE_LEN = LineLength(LANE.line);
const LANE_LEN_0105 = LineLength(L0610_FROM_0105.lane.line);
const LANE_WALL_RISE_M = 3;
const LANE_KNOTS = (() => {
  const knots = [[LANE_LEN_0105, L0610_FROM_0105.lane.toY]];
  for (const k of LANE.floorKnots) knots.push([Station(LANE.line, k.at), k.y]);
  knots.push([LANE_LEN, LANE.mouthY]);
  return knots;
})();
export function LaneFloorY(d) {
  if (d <= LANE_LEN_0105) return Lerp(L0610_FROM_0105.lane.fromY, L0610_FROM_0105.lane.toY, Smooth(d / LANE_LEN_0105));
  return Knots(LANE_KNOTS, d);
}
function NearestOnLine(line, x, z) {
  let best = Infinity, at = 0, walked = 0;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1], b = line[i];
    const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz);
    const t = Clamp01(((x - a.x) * dx + (z - a.z) * dz) / (len * len));
    const d = Math.hypot(x - a.x - dx * t, z - a.z - dz * t);
    if (d < best) { best = d; at = walked + len * t; }
    walked += len;
  }
  return { dist: best, at };
}
function LaneCap(x, z) {
  const { dist, at } = NearestOnLine(LANE.line, x, z);
  const half = LANE.floorW / 2;
  if (dist >= half + LANE.wallM) return Infinity;
  const floorY = LaneFloorY(at);
  return dist <= half ? floorY : floorY + LANE_WALL_RISE_M * Smooth((dist - half) / LANE.wallM);
}
export function DistanceToLane(x, z) { return NearestOnLine(LANE.line, x, z).dist; }

// 村口路沟
const DT = L0610_DITCH;
const DITCH_HALF = DT.floorW / 2;
function DitchCap(h, x, z) {
  const dz = Math.abs(z - DT.z);
  const south = z > DT.z;
  const nearStreet = 1 - Smooth((Math.abs(x - ST.main.c) - DT.rampHalfW) / DT.rampBlendM);
  const wallM = south ? Lerp(DT.wallM, DT.rampWallM, nearStreet) : DT.wallM;
  if (dz >= DITCH_HALF + wallM) return Infinity;
  if (x < DT.fromX) return Infinity;
  const over = Math.max(DT.westOpensToRiver ? 0 : DT.fromX - x, 0, x - DT.toX);
  if (over >= DT.endM) return Infinity;
  const fade = 1 - Smooth(over / DT.endM);
  const floor = Lerp(h, DT.floorY, fade);
  if (dz <= DITCH_HALF) return floor;
  return Lerp(floor, h, Smooth((dz - DITCH_HALF) / wallM));
}

// 河汊子（第八版：弯河）。横断面照旧：到中线折线的距离 d ≤ 本段半宽 → 沟底；再往外 wallM 陡起；岸上一道土埂。凸岸泥滩、苇子洼、西来小沟另算。
const RV = L0610_RIVER;
export const RIVER_FLOOR_Y = R2(H.plain - RV.depth + 0.3);
export const RIVER_EAST_RIM_X = RV.centerX + RV.floorW / 2 + RV.wallM;   // 接缝 / 路沟那一段的东坎沿（40）
function EastBankFactor(z) {
  const off = RV.eastBankOff;
  if (!off) return 1;
  return 1 - Smooth((z - off.fromZ) / off.fadeM) * (1 - Smooth((z - off.toZ) / off.fadeM));
}
/** 到河中线折线的距离与本段半宽（半宽沿折线线性插）。 */
export function RiverNearest(x, z) {
  const line = RV.line, hw = RV.halfW;
  let best = { dist: Infinity, halfW: hw[0], side: 1, t: 0, seg: 0 };
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1], b = line[i];
    const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz);
    const t = Clamp01(((x - a.x) * dx + (z - a.z) * dz) / (len * len));
    const px = a.x + dx * t, pz = a.z + dz * t;
    const d = Math.hypot(x - px, z - pz);
    if (d < best.dist) best = { dist: d, halfW: hw[i - 1] + (hw[i] - hw[i - 1]) * t, side: Math.sign((x - px) * dz - (z - pz) * dx) || 1, t, seg: i - 1 };
  }
  return best;
}
function RiverCarve(h, x, z) {
  const n = RiverNearest(x, z);
  const sdf = n.dist - n.halfW;
  if (sdf >= RV.wallM + RV.bankW) return h;
  const fade = Smooth((z - RV.fromZ + RV.wallM) / RV.endM);
  if (sdf < RV.wallM) {
    const k = sdf <= 0 ? 1 : 1 - Smooth(sdf / RV.wallM);
    return Math.min(h, Lerp(h, Lerp(h, RIVER_FLOOR_Y, fade), k));
  }
  const u = (sdf - RV.wallM) / RV.bankW;
  const bank = x > RiverAtZ(z).x ? EastBankFactor(z) : 1;
  return h + RV.bankH * Math.sin(u * Math.PI) * fade * bank;
}
/** 凸岸泥滩：每个弯的内侧一片椭圆，壁换成缓坡到 −1.4（水面上头 0.3，烂泥）。 */
function MudFlats(h, x, z) {
  const M = RV.mud;
  for (const b of RV.bends) {
    const r = RiverAtZ(b.z);
    const cx = b.x + b.side * (r.halfW + 2.0);
    const e = Math.hypot((x - cx) / M.rx, (z - b.z) / M.rz);
    if (e >= 1 + M.fadeM / M.rx) continue;
    const k = e <= 1 ? 1 : 1 - Smooth((e - 1) * M.rx / M.fadeM);
    h = Math.min(h, Lerp(h, M.y, k));
  }
  return h;
}
/** 苇子洼：河弯离开庄子西墙那一段（z 380…464），河东坎沿到墙根 x 39.75 之间烂泥 −0.9；贴墙那 0.35 m 抬回来（墙脚不悬空）。 */
function MarshCarve(h, x, z) {
  const M = RV.marsh;
  if (x >= M.eastX || z < M.fromZ || z > M.toZ + M.fadeOutM) return h;
  const r = RiverAtZ(z);
  if (x < r.x) return h;
  const wz = Smooth((z - M.fromZ) / M.fadeInM) * (1 - Smooth((z - M.toZ) / M.fadeOutM));
  const wx = 1 - Smooth((x - (M.eastX - M.edgeFadeM)) / M.edgeFadeM);
  const w = wz * wx;
  return w > 0 ? Math.min(h, Lerp(h, M.floorY, w)) : h;
}
/** 西来小沟：河西一条 2.5 m 宽、−1.3 深的小沟汇进河汊子。 */
function TributaryCarve(h, x, z) {
  const T = RV.tributary;
  const n = NearestOnLine(T.line, x, z);
  const sdf = n.dist - T.halfW;
  if (sdf >= T.wallM) return h;
  const k = sdf <= 0 ? 1 : 1 - Smooth(sdf / T.wallM);
  return Math.min(h, Lerp(h, T.floorY, k));
}

// 凹路两边土坎高低不一（第八版）：离路中线 innerM…outerM 这一带，东 / 西各加一点、沿 z 起伏
function LaneSideBanks(x, z) {
  const B = LANE.banks;
  if (z < B.fromZ - 10 || z > B.toZ + 10) return 0;
  const n = NearestOnLine(LANE.line, x, z);
  if (n.dist < B.innerM - 1 || n.dist > B.outerM + 4) return 0;
  const ring = Smooth((n.dist - (B.innerM - 1)) / 2) * (1 - Smooth((n.dist - B.outerM) / 4));
  const span = Smooth((z - B.fromZ) / 10) * (1 - Smooth((z - B.toZ) / 10));   // z ≤ 205 是 0105 的地面，不碰
  const east = x > LanePointAtZ(Math.max(LANE.line[0].z, Math.min(z, LANE.line[LANE.line.length - 1].z))).x;
  const s = east ? B.east : B.west;
  return (s.base + s.amp * Math.sin(z / s.periodM * Math.PI * 2 + (east ? 0.4 : 2.1))) * ring * span;
}

// 第八版的路：老驿道 / 往东邻庄的大道（压低 0.12–0.15）、田间小路（压低 0.08）
function RoadsDelta(x, z) {
  let d = 0;
  if (z < NORTH_SPLIT_Z) return 0;   // z < 205 是 0105 的地面（驿道北头那一截要 0105 自己烘）
  const fadeN = Smooth((z - NORTH_SPLIT_Z) / 6);
  for (const r of L0610_ROADS) {
    const o = Math.max(NearestOnLine(r.line, x, z).dist - r.halfW, 0);
    if (o < 0.9) d = Math.min(d, -r.lowerM * (1 - Smooth((o + 0.3) / 0.6)));
  }
  for (const p of L0610_FOOTPATHS) {
    const o = Math.max(NearestOnLine(p.line, x, z).dist - p.halfW, 0);
    if (o < 0.6) d = Math.min(d, -0.08 * (1 - Smooth((o + 0.2) / 0.4)));
  }
  return d * fadeN;
}
/** 离任何一条路（凹路 / 东北道 / 驿道 / 东邻庄大道 / 田间小路）的净距（到路边）。 */
export function DistanceToAnyRoad(x, z) {
  let best = Math.max(NearestOnLine(LANE.line, x, z).dist - LANE.floorW / 2 - LANE.wallM, 0);
  best = Math.min(best, Math.max(NearestOnLine(ER.line, x, z).dist - ER.halfW, 0));
  for (const r of L0610_ROADS) best = Math.min(best, Math.max(NearestOnLine(r.line, x, z).dist - r.halfW, 0));
  for (const p of L0610_FOOTPATHS) best = Math.min(best, Math.max(NearestOnLine(p.line, x, z).dist - p.halfW, 0));
  return best;
}

// 田（第八版）：拼块里按条；田埂烘进高度场（条与条之间、块的四边）。路、河、林、场院、菜园、独院、坑、庄子跟前不烘。
const FIELD_PIECES = L0610_FIELDS.map((p) => ({ ...p, c: Math.cos(p.angleDeg * Math.PI / 180), s: Math.sin(p.angleDeg * Math.PI / 180), zone: L0610_FIELD_ZONES.find((zn) => zn.id === p.zone) }));
/** (x,z) 落在哪块田的哪条上：{ piece, u, v, strip }（先到的块算数；在区域多边形外不算）。 */
export function FieldAt(x, z) {
  for (const p of FIELD_PIECES) {
    const dx = x - p.x, dz = z - p.z;
    const u = dx * p.c - dz * p.s, v = dx * p.s + dz * p.c;   // 同块的 ry：块转 angle（俯视逆时针）
    if (Math.abs(u) > p.w / 2 || Math.abs(v) > p.d / 2) continue;
    if (!PointInPoly(x, z, p.zone.poly)) return null;
    const strip = p.strips.find((st) => u >= st.from && u < st.to) || p.strips[p.strips.length - 1];
    return { piece: p, u, v, strip };
  }
  return null;
}
const RIDGE_MASK = Object.freeze([
  ...L0610_GROVES.map((g) => ({ x: g.x, z: g.z, r: Math.hypot(g.w, g.d) / 2 + 2 })),
  ...L0610_THRESHING.map((t) => ({ x: t.x, z: t.z, r: Math.hypot(t.w, t.d) / 2 + 2 })),
  ...L0610_OUTER_GARDENS.map((g) => ({ x: g.x, z: g.z, r: Math.hypot(g.w, g.d) / 2 + 2 })),
  ...L0610_FARMSTEADS.map((f) => ({ x: f.x, z: f.z, r: Math.hypot(f.w, f.d) / 2 + 3 })),
  { x: L0610_OUTER_POND.x, z: L0610_OUTER_POND.z, r: Math.max(L0610_OUTER_POND.rx, L0610_OUTER_POND.rz) + 3 },
  { x: L0610_FIELD_SHRINE.x, z: L0610_FIELD_SHRINE.z, r: 7 },
  ...L0610_WELLS.map((w) => ({ x: w.x, z: w.z, r: 3 })),
]);
function FieldMaskOk(x, z) {
  if (z > 547) return false;   // 接缝 z 556 两边的地面要跟 1218 逐点一样（1218 的地面没有田埂）
  if (RectOutside(x, z, V.box) < 12) return false;
  if (DistanceToAnyRoad(x, z) < 1.2) return false;
  if (Math.abs(z - DT.z) < DT.floorW / 2 + DT.rampWallM + 2 && x >= DT.fromX - 4 && x <= DT.toX + 6) return false;
  const rn = RiverNearest(x, z);
  if (rn.dist < rn.halfW + RV.wallM + RV.bankW + 1.5) return false;
  if (NearestOnLine(RV.tributary.line, x, z).dist < RV.tributary.halfW + RV.tributary.wallM + 1.5) return false;
  if (x < RV.marsh.eastX + 2 && z > RV.marsh.fromZ - 3 && z < RV.marsh.toZ + 8 && x > 15) return false;
  for (const m of RIDGE_MASK) if (Math.hypot(x - m.x, z - m.z) < m.r) return false;
  return true;
}
function FieldRidge(x, z) {
  const f = FieldAt(x, z);
  if (!f || !FieldMaskOk(x, z)) return 0;
  const R = L0610_FIELD_RIDGE, p = f.piece;
  let d = Math.min(Math.abs(f.u - f.strip.from), Math.abs(f.strip.to - f.u), p.d / 2 - Math.abs(f.v));
  if (d >= R.halfW) return 0;
  return R.h * (1 - Smooth(d / R.halfW));
}

// 林里的坟头、田里的单坟、坎上的坟：圆包
const ALL_GRAVES = (() => {
  const out = [];
  for (const g of L0610_GROVES) {
    const c = Math.cos(g.ry), s = Math.sin(g.ry);
    for (const [lx, lz, r, h] of g.graves) out.push({ x: g.x + lx * c + lz * s, z: g.z - lx * s + lz * c, r, h });
  }
  for (const g of L0610_FIELD_GRAVES) out.push({ x: g.x, z: g.z, r: g.r, h: g.h });
  for (const g of L0610_LANE_SIDE.graves) out.push({ x: g.x, z: g.z, r: g.r, h: g.h });
  return out;
})();
function GraveBumps(x, z) {
  let dh = 0;
  for (const g of ER.graves || []) {
    const r = Math.hypot(x - g.x, z - g.z);
    if (r < g.r) dh += g.h * (1 - Smooth(r / g.r));
  }
  for (const g of ALL_GRAVES) {
    if (Math.abs(x - g.x) > g.r || Math.abs(z - g.z) > g.r) continue;
    const r = Math.hypot(x - g.x, z - g.z);
    if (r < g.r) dh += g.h * (1 - Smooth(r / g.r));
  }
  return dh;
}

// 场院、独院：压平（转过的矩形）；庄东北的取土坑：椭圆坑
function RotRectSdf(x, z, cx, cz, w, d, ry) {
  const c = Math.cos(ry), s = Math.sin(ry), dx = x - cx, dz = z - cz;
  const lx = dx * c - dz * s, lz = dx * s + dz * c;
  const qx = Math.abs(lx) - w / 2, qz = Math.abs(lz) - d / 2;
  return Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0);
}
function FlattenPads(h, x, z, base) {
  for (const t of L0610_THRESHING) {
    const w = 1 - Smooth(RotRectSdf(x, z, t.x, t.z, t.w, t.d, t.ry) / 2.5);
    if (w > 0) h = Lerp(h, base(t.x, t.z), w);
  }
  for (const f of L0610_FARMSTEADS) {
    const w = 1 - Smooth(RotRectSdf(x, z, f.x, f.z, f.w + 2, f.d + 2, f.ry) / 2.5);
    if (w > 0) h = Lerp(h, base(f.x, f.z), w);
  }
  return h;
}
export const OUTER_POND_FLOOR_Y = R2(H.village - L0610_OUTER_POND.depth);
function OuterPondCarve(h, x, z) {
  const Pd = L0610_OUTER_POND;
  const e = Math.hypot((x - Pd.x) / Pd.rx, (z - Pd.z) / Pd.rz);
  if (e >= 1 + Pd.fadeM / Pd.rx) return h;
  const k = e <= 1 ? 1 : 1 - Smooth((e - 1) * Pd.rx / Pd.fadeM);
  return Math.min(h, Lerp(h, OUTER_POND_FLOOR_Y, k));
}

// 东北进庄的道
const ER = L0610_EAST_ROAD;
function EastRoadDelta(x, z) {
  const d = Math.max(NearestOnLine(ER.line, x, z).dist - ER.halfW, 0);
  if (d >= 0.9) return 0;
  return -ER.lowerM * (1 - Smooth((d + 0.3) / 0.6));
}
function VillageWeight(x, z) { return 1 - Smooth(RectOutside(x, z, V.box) / V.fadeM); }

// 街巷压低：所有净空条 + 丁字路口 + 折线胡同（第八版）
export const STREET_RUNS = Object.freeze(Object.values(ST).filter((r) => r.axis));
export const LANE_PATHS = Object.freeze(Object.values(L0610_LANE_PATHS));
function StreetDelta(x, z) {
  let d = Infinity;
  for (const r of STREET_RUNS) {
    const along = r.axis === "z" ? z : x, across = r.axis === "z" ? x : z;
    const over = Math.max(r.from - along, 0, along - r.to);
    d = Math.min(d, Math.hypot(Math.max(Math.abs(across - r.c) - r.halfW, 0), over));
  }
  d = Math.min(d, RectSdf(x, z, ST.square.box));
  if (RectOutside(x, z, V.box) < 1) for (const p of LANE_PATHS) { const n = PathNearest(p, x, z); d = Math.min(d, Math.max(n.dist - n.halfW, 0)); }
  if (d >= 0.9) return 0;
  return -V.streetLowerM * (1 - Smooth((d + 0.3) / 0.6));
}

// 地瓜窖（街坊家）、取土坑：平底开挖
const CELLAR = J.cellar;
const CELLAR_BOX = Object.freeze({ minX: CELLAR.x - CELLAR.floorW / 2, maxX: CELLAR.x + CELLAR.floorW / 2, minZ: CELLAR.z - CELLAR.floorW / 2, maxZ: CELLAR.z + CELLAR.floorW / 2 });
export const CELLAR_FLOOR_Y = R2(V.y - CELLAR.depth);
const POND = L0610_YARDS.find((y) => y.kind === "pond").pond;
const POND_BOX = Object.freeze({ minX: POND.x - POND.w / 2, maxX: POND.x + POND.w / 2, minZ: POND.z - POND.d / 2, maxZ: POND.z + POND.d / 2 });
export const POND_FLOOR_Y = R2(V.y - POND.depth);
function CarveBox(h, x, z, box, floorY, wallM) {
  const sdf = RectSdf(x, z, box);
  if (sdf >= wallM) return h;
  const k = sdf <= 0 ? 1 : 1 - Smooth(sdf / wallM);
  return Math.min(h, Lerp(h, floorY, k));
}

export function L0610Ground() {
  const Plain = (x, z) => {   // 开挖以前的「自然地面」（村子压平、坎的高低、压平的场院 / 独院）
    let h = BaseHeight(x, z);
    h += LaneSideBanks(x, z);
    const vw = VillageWeight(x, z);
    if (vw > 0) h = Lerp(h, V.y, vw);
    return h;
  };
  const Ground = (x, z) => {
    let h = Plain(x, z);
    h = FlattenPads(h, x, z, Plain);
    h += FieldRidge(x, z);
    const cap = LaneCap(x, z);
    if (cap < h) h = cap;
    const ditch = DitchCap(h, x, z);
    if (ditch < h) h = ditch;
    h = RiverCarve(h, x, z);
    h = MudFlats(h, x, z);
    h = MarshCarve(h, x, z);
    h = TributaryCarve(h, x, z);
    h = OuterPondCarve(h, x, z);
    h += Math.min(StreetDelta(x, z), EastRoadDelta(x, z), RoadsDelta(x, z));
    h += GraveBumps(x, z);
    h = CarveBox(h, x, z, CELLAR_BOX, CELLAR_FLOOR_Y, CELLAR.wallM);
    h = CarveBox(h, x, z, POND_BOX, POND_FLOOR_Y, 1.6);
    return h;
  };
  return { Ground };
}

export function BakeL0610Grid(ground, bounds = L0610_BOUNDS, cellM = L0610_CELL_M) {
  const cols = Math.round((bounds.maxX - bounds.minX) / cellM);
  const rows = Math.round((bounds.maxZ - bounds.minZ) / cellM);
  const buffer = Buffer.alloc((cols + 1) * (rows + 1) * 2);
  let min = Infinity, max = -Infinity;
  for (let iz = 0; iz <= rows; iz++) {
    for (let ix = 0; ix <= cols; ix++) {
      const y = ground(bounds.minX + ix * cellM, bounds.minZ + iz * cellM);
      const cm = Math.max(-32768, Math.min(32767, Math.round(y * 100)));
      if (cm < min) min = cm;
      if (cm > max) max = cm;
      buffer.writeInt16LE(cm, (iz * (cols + 1) + ix) * 2);
    }
  }
  return {
    terrain: { kind: "heightmap", minX: bounds.minX, minZ: bounds.minZ, cellM, cols, rows, encoding: "int16-cm-base64", data: buffer.toString("base64") },
    minM: min / 100, maxM: max / 100,
  };
}

// ---------------------------------------------------------------------------
// 2. 体块

const Block = (id, x, z, w, d, h, semantic, extra = {}) => ({ id, x: R2(x), z: R2(z), w: R2(w), d: R2(d), h: R2(h), ry: 0, semantic, solid: true, ...extra });
const WALL = "plaster", BRICK = "structure", ROOF = "roof", WOOD = "timber", EARTH = "earthDark";
const T = V.wallT;
const Gap = (c, w) => ({ from: c - w / 2, to: c + w / 2 });

/**
 * 墙的总表：按（轴、固定坐标）那条线收集墙段（带高度）与洞口，最后合并成块——共墙只画一道，两院高度不同取高的。
 * Add(axis, fixed, from, to, h, name)：name 给这段墙的块 id 前缀（没给用 Wall_x92 这样的名字）。Cut(axis, fixed, from, to)：洞口。
 */
class WallPlan {
  constructor() { this.lines = new Map(); this.fences = new Set(); }
  Key(axis, fixed) { return `${axis}@${R2(fixed)}`; }
  Line(axis, fixed) {
    const k = this.Key(axis, fixed);
    if (!this.lines.has(k)) this.lines.set(k, { axis, fixed: R2(fixed), segs: [], cuts: [], names: [] });
    return this.lines.get(k);
  }
  Add(axis, fixed, from, to, h = V.wallH, name = null) {
    if (to - from < 0.05) return;
    const L = this.Line(axis, fixed);
    L.segs.push({ from: R2(Math.min(from, to)), to: R2(Math.max(from, to)), h });
    if (name) L.names.push({ from: R2(Math.min(from, to)), to: R2(Math.max(from, to)), name });
  }
  Cut(axis, fixed, from, to) { this.Line(axis, fixed).cuts.push({ from: R2(from), to: R2(to) }); }
  /** 盖：按 0.05 m 的格子把每条线铺开（高度取最大），再减洞口、合并成连续段。 */
  Emit(out, semantic = WALL) {
    const STEP = 0.05;
    const keys = [...this.lines.keys()].sort();
    for (const k of keys) {
      const L = this.lines.get(k);
      if (!L.segs.length) continue;
      const lo = Math.min(...L.segs.map((s) => s.from)), hi = Math.max(...L.segs.map((s) => s.to));
      const n = Math.round((hi - lo) / STEP);
      const cover = new Float64Array(n);
      for (const s of L.segs) {
        const a = Math.round((s.from - lo) / STEP), b = Math.round((s.to - lo) / STEP);
        for (let i = a; i < b; i++) cover[i] = Math.max(cover[i], s.h);
      }
      for (const c of L.cuts) {
        const a = Math.max(0, Math.round((c.from - lo) / STEP)), b = Math.min(n, Math.round((c.to - lo) / STEP));
        for (let i = a; i < b; i++) cover[i] = 0;
      }
      const runs = [];
      let i = 0;
      while (i < n) {
        if (cover[i] <= 0) { i++; continue; }
        const h = cover[i];
        let j = i;
        while (j < n && Math.abs(cover[j] - h) < 1e-9) j++;
        runs.push({ from: lo + i * STEP, to: lo + j * STEP, h });
        i = j;
      }
      const base = `Wall_${L.axis}${String(L.fixed).replace(".", "p")}`;
      runs.forEach((r, idx) => {
        if (r.to - r.from < 0.049) return;
        const mid = (r.from + r.to) / 2, len = r.to - r.from;
        const named = L.names.find((nm) => mid >= nm.from - 0.01 && mid <= nm.to + 0.01);
        const id = named ? `${named.name}_${idx + 1}` : `${base}_${idx + 1}`;
        out.push(L.axis === "x" ? Block(id, mid, L.fixed, len, T, r.h, semantic) : Block(id, L.fixed, mid, T, len, r.h, semantic));
      });
    }
  }
}

/** 门洞 / 窗洞上方的过梁（显式 y）：从 bottomH 到 topH。 */
function Lintel(out, id, axis, fixed, from, to, bottomH, topH, sample, semantic = WALL, extra = {}) {
  const mid = (from + to) / 2, len = to - from;
  const gy = axis === "x" ? sample(mid, fixed) : sample(fixed, mid);
  const y = R2(gy + (bottomH + topH) / 2);
  out.push(axis === "x" ? Block(id, mid, fixed, len, T, topH - bottomH, semantic, { y, ...extra }) : Block(id, fixed, mid, T, len, topH - bottomH, semantic, { y, ...extra }));
}
/** 窗台 / 枪眼下的墙（落地）。 */
function Sill(out, id, axis, fixed, from, to, h, extra = {}) {
  const mid = (from + to) / 2, len = to - from;
  out.push(axis === "x" ? Block(id, mid, fixed, len, T, h, WALL, extra) : Block(id, fixed, mid, T, len, h, WALL, extra));
}
/** 平顶（显式 y，顶在 topH）。 */
function Slab(out, id, box, topH, sample, thick = 0.2, extra = {}) {
  const cx = (box.minX + box.maxX) / 2, cz = (box.minZ + box.maxZ) / 2;
  out.push(Block(id, cx, cz, box.maxX - box.minX, box.maxZ - box.minZ, thick, ROOF, { y: R2(sample(cx, cz) + topH - thick / 2), ...extra }));
}
function House(out, id, box, h = V.houseH) {
  out.push(Block(id, (box.minX + box.maxX) / 2, (box.minZ + box.maxZ) / 2, box.maxX - box.minX, box.maxZ - box.minZ, h, BRICK, { house: true }));
}
/** 塌了一角的房子：东南角缺一块，缺口里堆一摊土。 */
function CollapsedHouse(out, id, box, h = V.houseH) {
  const cw = Math.min(4, (box.maxX - box.minX) / 2), cd = Math.min(3, (box.maxZ - box.minZ) / 2);
  House(out, `${id}_A`, { minX: box.minX, maxX: box.maxX - cw, minZ: box.minZ, maxZ: box.maxZ }, h);
  House(out, `${id}_B`, { minX: box.maxX - cw, maxX: box.maxX, minZ: box.minZ, maxZ: box.maxZ - cd }, h);
  const k = L0610_PROP_KINDS.Rubble;
  out.push(Block(`${id}_Rubble`, box.maxX - cw / 2 + 0.3, box.maxZ - cd / 2 + 0.4, k.w, k.d, k.h, k.semantic, { ry: 0.3, prop: "Rubble" }));
}
/** 关着的院门：门洞里一扇门板。 */
function ClosedGate(out, id, axis, fixed, c, w) {
  out.push(axis === "x" ? Block(id, c, fixed, w - 0.1, 0.08, 2.0, WOOD, { gate: true }) : Block(id, fixed, c, 0.08, w - 0.1, 2.0, WOOD, { gate: true }));
}
/** 半掩的院门：门扇往院里推开约 72°，铰链在洞口一侧；门缝和门洞都能往里瞥（人也挤得过）。inward +1 = 往 −z / −x 那边开。 */
function AjarGate(out, id, axis, fixed, c, w, inward = 1) {
  const leafW = w - 0.1, ang = 1.25;
  if (axis === "x") {
    const hx = c - w / 2 + 0.05, cx = hx + Math.cos(ang) * leafW / 2, cz = fixed - inward * Math.sin(ang) * leafW / 2;
    out.push(Block(id, cx, cz, leafW, 0.08, 2.0, WOOD, { gate: true, ry: inward * ang }));
  } else {
    const hz = c - w / 2 + 0.05, cz = hz + Math.cos(ang) * leafW / 2, cx = fixed + inward * Math.sin(ang) * leafW / 2;
    out.push(Block(id, cx, cz, 0.08, leafW, 2.0, WOOD, { gate: true, ry: inward * ang }));
  }
}
/** 砸得倒的院门：关着的门扇随 signal 消失，倒在地上的门扇随 appearSignal 出现。 */
function BreakableGate(gates, id, axis, fixed, c, w, signal, fallenSide = 1) {
  const leafW = w - 0.1;
  if (axis === "x") {
    gates.push(Block(id, c, fixed, leafW, 0.08, 2.0, WOOD, { gate: true, signal }));
    gates.push(Block(`${id}Fallen`, c + 0.3, fixed + fallenSide * (0.35 + leafW / 2), leafW, 2.0, 0.08, WOOD, { ry: 0.12, appearSignal: signal }));
  } else {
    gates.push(Block(id, fixed, c, 0.08, leafW, 2.0, WOOD, { gate: true, signal }));
    gates.push(Block(`${id}Fallen`, fixed + fallenSide * (0.35 + leafW / 2), c + 0.3, 2.0, leafW, 0.08, WOOD, { ry: 0.12, appearSignal: signal }));
  }
}

/** 一面墙的「轴 / 固定坐标 / 起止」。 */
function Side(box, wall) {
  switch (wall) {
    case "N": return { axis: "x", fixed: box.minZ, from: box.minX, to: box.maxX };
    case "S": return { axis: "x", fixed: box.maxZ, from: box.minX, to: box.maxX };
    case "W": return { axis: "z", fixed: box.minX, from: box.minZ, to: box.maxZ };
    default: return { axis: "z", fixed: box.maxX, from: box.minZ, to: box.maxZ };
  }
}
/** 空心房：四面墙进总表（门 / 窗 / 枪眼 / 豁口留洞），平顶、过梁、窗台另出。 */
function HollowHouse(plan, out, id, box, h, sample, { door = null, loopholes = [], breach = null, window = null } = {}) {
  for (const w of ["N", "S", "W", "E"]) { const s = Side(box, w); plan.Add(s.axis, s.fixed, s.from, s.to, h, `${id}_${w}`); }
  if (door) {
    const s = Side(box, door.wall);
    const c = door.wall === "N" || door.wall === "S" ? door.x : door.z, w = door.w;
    plan.Cut(s.axis, s.fixed, c - w / 2, c + w / 2);
    Lintel(out, `${id}_DoorLintel`, s.axis, s.fixed, c - w / 2, c + w / 2, door.topH ?? V.doorTopH, h, sample);
  }
  const LH = V.loophole;
  loopholes.forEach((lp, i) => {
    const s = Side(box, lp.wall ?? "N"), c = lp.x ?? lp.z;
    plan.Cut(s.axis, s.fixed, c - LH.w / 2, c + LH.w / 2);
    Sill(out, `${id}_LoopholeSill${i + 1}`, s.axis, s.fixed, c - LH.w / 2, c + LH.w / 2, LH.sillH, { loophole: true });
    Lintel(out, `${id}_LoopholeLintel${i + 1}`, s.axis, s.fixed, c - LH.w / 2, c + LH.w / 2, LH.topH, h, sample, WALL, { loophole: true });
  });
  if (breach) {
    const s = Side(box, breach.wall ?? "N"), c = breach.x ?? breach.z;
    plan.Cut(s.axis, s.fixed, c - breach.w / 2, c + breach.w / 2);
    Sill(out, `${id}_BreachSill`, s.axis, s.fixed, c - breach.w / 2, c + breach.w / 2, breach.sillH, { breach: true });
    Lintel(out, `${id}_BreachLintel`, s.axis, s.fixed, c - breach.w / 2, c + breach.w / 2, breach.topH ?? V.doorTopH, h, sample, WALL, { breach: true });
  }
  if (window) {
    const s = Side(box, window.wall), c = window.wall === "N" || window.wall === "S" ? window.x : window.z;
    plan.Cut(s.axis, s.fixed, c - window.w / 2, c + window.w / 2);
    Sill(out, `${id}_WindowSill`, s.axis, s.fixed, c - window.w / 2, c + window.w / 2, window.sillH, { window: true });
    Lintel(out, `${id}_WindowLintel`, s.axis, s.fixed, c - window.w / 2, c + window.w / 2, window.topH, h, sample, WALL, { window: true });
  }
  Slab(out, `${id}_Roof`, box, h, sample);
}

/** 一个院子：院墙（矮篱的那几面另出）、院门（洞 + 过梁 + 门扇）、房子。 */
function YardBlocks(plan, out, gates, y, sample) {
  const wallH = y.wallH ?? V.wallH;
  const fences = new Set(y.fences || []);
  const sides = y.notch ? NotchedSides(y.box, y.notch) : ["N", "S", "W", "E"].map((w) => ({ ...Side(y.box, w), wall: w }));
  for (const s of sides) {
    if (fences.has(s.wall)) {
      const key = `${s.axis}@${R2(s.fixed)}:${R2(s.from)}-${R2(s.to)}`;
      if (plan.fences.has(key)) continue;   // 两院共一道篱，只画一次
      plan.fences.add(key);
      const mid = (s.from + s.to) / 2, len = s.to - s.from;
      out.push(s.axis === "x" ? Block(`Fence_${y.id}_${s.wall}`, mid, s.fixed, len, 0.3, V.fenceH, EARTH, { fence: true }) : Block(`Fence_${y.id}_${s.wall}`, s.fixed, mid, 0.3, len, V.fenceH, EARTH, { fence: true }));
      continue;
    }
    plan.Add(s.axis, s.fixed, s.from, s.to, wallH, y.wallName ?? null);
  }
  const Door = (gate, tag) => {
    if (!gate) return;
    const s = Side(y.box, gate.wall), fixed = gate.at ?? s.fixed;   // at：门不在外框那面墙上（缺角的院子）
    const c = gate.c;
    plan.Cut(s.axis, fixed, c - gate.w / 2, c + gate.w / 2);
    Lintel(out, `Gate_${y.id}${tag}_Lintel`, s.axis, fixed, c - gate.w / 2, c + gate.w / 2, V.doorTopH, wallH, sample);
    if (gate.leaf === "closed") ClosedGate(out, `Gate_${y.id}${tag}_Leaf`, s.axis, fixed, c, gate.w);
    else if (gate.leaf === "ajar") AjarGate(out, `Gate_${y.id}${tag}_Leaf`, s.axis, fixed, c, gate.w, gate.wall === "S" || gate.wall === "E" ? 1 : -1);
    // "open" / "breakable" / null：不放门扇（砸得倒的那三道在院子链那里单独出）
  };
  if (y.gate) Door(y.gate, "");
  if (y.backGate) Door(y.backGate, "Back");
  if (y.open) {   // 场院：南墙中段不要
    const s = Side(y.box, "S");
    plan.Cut(s.axis, s.fixed, y.open.fromX, y.open.toX);
  }
  y.houses.forEach((h, i) => {
    const id = h.id ? `House_${h.id}` : `House_${y.id}_${i + 1}`;
    if (h.hollow) {
      const lps = (h.loopholes || []).map((lp) => ({ wall: "N", x: lp.x }));
      HollowHouse(plan, out, id, h.box, h.h, sample, { loopholes: lps, breach: h.breach ? { wall: "N", x: h.breach.x, w: h.breach.w, sillH: h.breach.sillH } : null,
        door: h.door || { wall: "S", x: (h.box.minX + h.box.maxX) / 2, w: V.doorW }, window: h.window || null });
    } else if (L0610_COLLAPSED_HOUSES.includes(id)) CollapsedHouse(out, id, h.box, h.h);
    else House(out, id, h.box, h.h);
  });
  // 茅圈（第八版）：离院门最远又不压房子的角
  ToiletBlocks(out, y.id, ToiletFor(y), { cx: (y.box.minX + y.box.maxX) / 2, cz: (y.box.minZ + y.box.maxZ) / 2, ry: 0, s: 1 }, sample);
  if (y.kind === "pond") {
    const p = y.pond;
    out.push(Block(`PondWater_${y.id}`, p.x, p.z, p.w - 0.6, p.d - 0.6, p.waterH, "water", { y: R2(POND_FLOOR_Y + p.waterH / 2 - 0.02), solid: false }));
  }
}
/** 被路口切掉一角的院子（WM3 / EM3）：墙沿着 L 形走。notch 在 box 的一个角上。 */
function NotchedSides(box, notch) {
  const sides = [];
  const atEast = Math.abs(notch.maxX - box.maxX) < 0.01, atSouth = Math.abs(notch.maxZ - box.maxZ) < 0.01;
  // 北、西两面完整（notch 在东南或西南角）
  sides.push({ axis: "x", fixed: box.minZ, from: box.minX, to: box.maxX, wall: "N" });
  if (atEast) {
    sides.push({ axis: "z", fixed: box.minX, from: box.minZ, to: box.maxZ, wall: "W" });
    sides.push({ axis: "z", fixed: box.maxX, from: box.minZ, to: atSouth ? notch.minZ : box.maxZ, wall: "E" });
    sides.push({ axis: "x", fixed: notch.minZ, from: notch.minX, to: box.maxX, wall: "S" });     // 缺角的北边 = 路口的北墙
    sides.push({ axis: "z", fixed: notch.minX, from: notch.minZ, to: box.maxZ, wall: "E" });     // 缺角的西边 = 路口的西墙
    sides.push({ axis: "x", fixed: box.maxZ, from: box.minX, to: notch.minX, wall: "S" });
  } else {
    sides.push({ axis: "z", fixed: box.maxX, from: box.minZ, to: box.maxZ, wall: "E" });
    sides.push({ axis: "z", fixed: box.minX, from: box.minZ, to: notch.minZ, wall: "W" });
    sides.push({ axis: "x", fixed: notch.minZ, from: box.minX, to: notch.maxX, wall: "S" });
    sides.push({ axis: "z", fixed: notch.maxX, from: notch.minZ, to: box.maxZ, wall: "W" });
    sides.push({ axis: "x", fixed: box.maxZ, from: notch.maxX, to: box.maxX, wall: "S" });
  }
  return sides;
}

/** 老耿家（半面槽院）+ 共用墙 + 随信号体块。 */
function GengBlocks(plan, blocks, gates, sample) {
  const C = G.box, BW = G.beiwu, K = G.zaowu, LH = V.loophole;
  const wallH = G.wallH;
  // 院墙：北（= 丁字路口南边）、东（院门）、南；西墙 = 与本家院共用（狗洞 / 便门）
  plan.Add("x", C.minZ, C.minX, C.maxX, wallH, "GengNorthWall");
  plan.Add("z", C.maxX, C.minZ, C.maxZ, wallH, "GengEastWall");
  plan.Add("x", C.maxZ, C.minX, C.maxX, wallH, "GengSouthWall");
  plan.Add("z", C.minX, C.minZ, C.maxZ, wallH, "SharedWall");
  // 院门（东墙靶南，敞着）
  const GT = G.gate;
  plan.Cut("z", C.maxX, GT.z - GT.w / 2, GT.z + GT.w / 2);
  Lintel(blocks, "GengGateLintel", "z", C.maxX, GT.z - GT.w / 2, GT.z + GT.w / 2, GT.topH, wallH, sample);
  blocks.push(Block("GengGateLeafOpen", C.maxX - T / 2 - 0.12, GT.z - GT.w / 2 - 0.55, 0.08, GT.w - 0.1, 2.0, WOOD, { gate: true, ry: 0.25 }));   // 门扇推开贴在院里东墙上（胡同里不占地）
  // 狗洞与便门（共用墙）
  const DH = G.dogHole, SG = G.sideGate;
  plan.Cut("z", C.minX, DH.z - DH.w / 2, DH.z + DH.w / 2);
  Lintel(blocks, "DogHoleLintel", "z", C.minX, DH.z - DH.w / 2, DH.z + DH.w / 2, DH.h, wallH, sample);
  plan.Cut("z", C.minX, SG.z - SG.w / 2, SG.z + SG.w / 2);
  Lintel(blocks, "SideGateLintel", "z", C.minX, SG.z - SG.w / 2, SG.z + SG.w / 2, 2.0, wallH, sample);
  const leafZ0 = SG.z + SG.w / 2 - SG.leafW;
  gates.push(Block("SideGateLeaf", C.minX + 0.15, leafZ0 + SG.leafW / 2, SG.leafT, SG.leafW, 2.0, WOOD, { signal: SIG.sideGateOpen }));
  gates.push(Block("SideGateLeafOpen", C.minX + T / 2 + SG.leafW / 2, SG.z + SG.w / 2 + 0.05, SG.leafW, SG.leafT, 2.0, WOOD, { appearSignal: SIG.sideGateOpen }));

  // --- 北屋三间：空心、平顶 + 北女墙；后墙三个枪眼；堂屋门朝南；东间（x ≥ collapseFromX）的后墙与房顶随 BarrageHit 塌下 ---
  const roomH = BW.roofH, cx = BW.collapseFromX;
  plan.Add("x", BW.box.minZ, BW.box.minX, cx, roomH, "GengBeiwuNorth");
  plan.Cut("x", BW.box.minZ, cx, BW.box.maxX);   // 东间那段后墙单独做成随信号块
  plan.Add("x", BW.box.maxZ, BW.box.minX, BW.box.maxX, roomH, "GengBeiwuSouth");
  plan.Add("z", BW.box.minX, BW.box.minZ, BW.box.maxZ, roomH, "GengBeiwuWest");
  plan.Add("z", BW.box.maxX, BW.box.minZ, BW.box.maxZ, roomH, "GengBeiwuEast");
  const TD = BW.tangwuDoor;
  plan.Cut("x", BW.box.maxZ, TD.x - TD.w / 2, TD.x + TD.w / 2);
  Lintel(blocks, "GengTangwuDoorLintel", "x", BW.box.maxZ, TD.x - TD.w / 2, TD.x + TD.w / 2, TD.topH, roomH, sample);
  for (const lp of BW.loopholes) {
    const from = lp.x - LH.w / 2, to = lp.x + LH.w / 2;
    const collapses = lp.x >= cx;
    const extra = collapses ? { loophole: true, signal: SIG.barrageHit } : { loophole: true };
    const list = collapses ? gates : blocks;
    if (!collapses) plan.Cut("x", BW.box.minZ, from, to);
    Sill(list, `GengLoopholeSill_${lp.who}`, "x", BW.box.minZ, from, to, LH.sillH, extra);
    Lintel(list, `GengLoopholeLintel_${lp.who}`, "x", BW.box.minZ, from, to, LH.topH, roomH, sample, WALL, extra);
  }
  // 东间后墙（枪眼两边的两截）随 BarrageHit 消失
  const eastLp = BW.loopholes.find((lp) => lp.x >= cx);
  const eRuns = eastLp ? [[cx, eastLp.x - LH.w / 2], [eastLp.x + LH.w / 2, BW.box.maxX]] : [[cx, BW.box.maxX]];
  eRuns.forEach(([a, b], i) => gates.push(Block(`GengBeiwuNorthEast_${i + 1}`, (a + b) / 2, BW.box.minZ, b - a, T, roomH, WALL, { signal: SIG.barrageHit })));
  Slab(blocks, "GengBeiwuRoofWest", { minX: BW.box.minX, maxX: cx, minZ: BW.box.minZ, maxZ: BW.box.maxZ }, roomH, sample);
  Slab(gates, "GengBeiwuRoofEast", { minX: cx, maxX: BW.box.maxX, minZ: BW.box.minZ, maxZ: BW.box.maxZ }, roomH, sample, 0.2, { signal: SIG.barrageHit });
  const roofTop = sample((BW.box.minX + BW.box.maxX) / 2, (BW.box.minZ + BW.box.maxZ) / 2) + roomH;
  blocks.push(Block("GengRoofParapetNorth", (BW.box.minX + cx) / 2, BW.box.minZ, cx - BW.box.minX, T, BW.parapetH, WALL, { y: R2(roofTop + BW.parapetH / 2) }));
  gates.push(Block("GengRoofParapetNorthEast", (cx + BW.box.maxX) / 2, BW.box.minZ, BW.box.maxX - cx, T, BW.parapetH, WALL, { y: R2(roofTop + BW.parapetH / 2), signal: SIG.barrageHit }));
  const CR = G.collapseRubble;
  gates.push(Block("GengCollapseRubble", CR.x, CR.z, CR.w, CR.d, CR.h, EARTH, { ry: CR.ry, prop: "Rubble", appearSignal: SIG.barrageHit }));
  // 堂屋枪眼上的十一年式（机枪组被打掉前一直在；10-2 起出现在石碾后头）；石碾旁随炮轰出现的一堆新瓦砾
  const mgLp = BW.loopholes.find((lp) => lp.who === "mg");
  gates.push(Block("GengLoopholeMg", mgLp.x, BW.box.minZ, 0.12, 0.9, 0.14, "metal", { y: R2(sample(mgLp.x, BW.box.minZ) + LH.sillH + 0.07), signal: SIG.mgSilenced }));
  const RL = ES.roller;
  gates.push(Block("RollerMg", RL.x - 1.0, RL.z + 0.6, 0.9, 0.12, 0.14, "metal", { appearSignal: SIG.mgSilenced }));
  gates.push(Block("RollerRubble", 111.0, 461.6, 2.0, 1.6, 1.0, EARTH, { ry: -0.4, prop: "Rubble", appearSignal: SIG.barrageHit }));

  // --- 灶屋两间（西屋，门朝东）：空心 + 平顶；灶台、案板；门口的水缸 ---
  HollowHouse(plan, blocks, "GengZaowu", K.box, K.roofH, sample, { door: { wall: "E", z: K.door.z, w: K.door.w } });
  blocks.push(Block("KitchenStove", G.stove.x, G.stove.z, G.stove.w, G.stove.d, G.stove.h, EARTH));
  blocks.push(Block("KitchenBoard", G.board.x, G.board.z, G.board.w, G.board.d, G.board.h, WOOD));
  const vat = L0610_PROP_KINDS.WaterVat;
  blocks.push(Block("GengVat", G.vat.x, G.vat.z, vat.w, vat.d, vat.h, vat.semantic, { prop: "WaterVat" }));
  const hs = G.haystack;
  blocks.push(Block("GengHaystack", hs.x, hs.z, hs.w, hs.d, hs.h, "canvas", { prop: "Haystack" }));
}

/** 街坊家（四合院）：北屋空心、西配房空心（塌掉的西北角 / 窗洞 / 门 / 大缸）、东配房、南屋、半掩的院门、地瓜窖、石磨。 */
function JiefangBlocks(plan, blocks, gates, sample) {
  const C = J.box;
  for (const w of ["N", "S", "W", "E"]) { const s = Side(C, w); plan.Add(s.axis, s.fixed, s.from, s.to, V.wallH, `Jiefang${w}`); }
  const GT = J.gate;
  plan.Cut("x", C.maxZ, GT.x - GT.w / 2, GT.x + GT.w / 2);
  Lintel(blocks, "JiefangGateLintel", "x", C.maxZ, GT.x - GT.w / 2, GT.x + GT.w / 2, GT.topH, V.wallH, sample);
  AjarGate(blocks, "JiefangGateLeaf", "x", C.maxZ, GT.x, GT.w, 1);
  // 北屋（空心，堂屋门朝南）
  HollowHouse(plan, blocks, "JiefangBeiwu", J.beiwu.box, J.beiwu.roofH, sample, { door: { wall: "S", x: J.beiwu.door.x, w: J.beiwu.door.w } });
  // 西配房：西墙 = 院子西墙；西北角塌了（西墙 z 449.25…450.75、北墙 x 64.25…65.6 没了），地上一摊矮瓦砾；东墙窗洞 + 门
  const WW = J.westWing, BR = WW.breach;
  HollowHouse(plan, blocks, "JiefangWestWing", WW.box, WW.roofH, sample, {
    door: { wall: "E", z: WW.door.z, w: WW.door.w },
    window: { wall: "E", z: WW.window.z, w: WW.window.w, sillH: WW.window.sillH, topH: WW.window.topH },
  });
  plan.Cut("z", WW.box.minX, BR.z, BR.zTo);
  plan.Cut("x", WW.box.minZ, WW.box.minX, BR.xTo);
  blocks.push(Block("JiefangBreachRubble", WW.box.minX + 0.55, BR.z + 0.6, 1.5, 1.6, BR.rubbleH, EARTH, { ry: 0.5, prop: "Rubble", breach: true }));
  blocks.push(Block("JiefangBreachRubble2", WW.box.minX - 0.5, BR.zTo + 0.2, 1.0, 0.9, 0.35, EARTH, { ry: -0.3, prop: "Rubble", breach: true }));
  const vat = L0610_PROP_KINDS.WaterVat;
  blocks.push(Block("JiefangWingVat", WW.vat.x, WW.vat.z, 0.9, 0.9, 1.0, vat.semantic, { prop: "WaterVat" }));
  House(blocks, "JiefangEastWing", J.eastWing.box, J.eastWing.roofH);
  House(blocks, "JiefangNanwu", J.nanwu.box, J.nanwu.roofH);
  // 地瓜窖：窖沿矮块贴着坑口外沿（坑心外 1.2…1.4 m）、掀开的盖板；炸了以后盖板飞开、窖口冒烟
  const rimOff = CELLAR.floorW / 2 + L0610_CELL_M, rimLen = (rimOff + 0.1) * 2;
  blocks.push(Block("CellarRimNorth", CELLAR.x, CELLAR.z - rimOff, rimLen, 0.2, CELLAR.rimH, WOOD));
  blocks.push(Block("CellarRimSouth", CELLAR.x, CELLAR.z + rimOff, rimLen, 0.2, CELLAR.rimH, WOOD));
  blocks.push(Block("CellarRimWest", CELLAR.x - rimOff, CELLAR.z, 0.2, rimLen, CELLAR.rimH, WOOD));
  blocks.push(Block("CellarRimEast", CELLAR.x + rimOff, CELLAR.z, 0.2, rimLen, CELLAR.rimH, WOOD));
  const lid = J.cellarLid, gy = sample(CELLAR.x + 3, CELLAR.z);
  gates.push(Block("CellarLid", lid.x, lid.z, lid.w, lid.d, lid.t, WOOD, { ry: lid.ry, signal: SIG.cellarBlast }));
  gates.push(Block("CellarLidBlown", J.cellarLidBlown.x, J.cellarLidBlown.z, lid.w, lid.d, lid.t, WOOD, { ry: J.cellarLidBlown.ry, appearSignal: SIG.cellarBlast }));
  gates.push(Block("CellarSmoke", CELLAR.x, CELLAR.z, 0.8, 0.8, 3.2, ROOF, { y: R2(gy + 1.0), appearSignal: SIG.cellarBlast }));
  gates.push(Block("CellarSmokeTop", CELLAR.x + 0.3, CELLAR.z - 0.2, 1.3, 1.3, 1.2, ROOF, { y: R2(gy + 3.0), appearSignal: SIG.cellarBlast }));
  const M = J.mill;
  blocks.push(Block("MillBase", M.x, M.z, M.baseW, M.baseW, M.baseH, BRICK));
  blocks.push(Block("MillStone", M.x, M.z, M.stoneW, M.stoneW, M.stoneH, BRICK, { y: R2(sample(M.x, M.z) + M.baseH + M.stoneH / 2) }));
}

/** 本家院（四合院，共用墙在老耿家那边画）：院门敞着在南墙西南角。 */
function BenjiaBlocks(plan, blocks, sample) {
  const C = B.box;
  for (const w of ["N", "S", "W"]) { const s = Side(C, w); plan.Add(s.axis, s.fixed, s.from, s.to, V.wallH, `Benjia${w}`); }
  const GT = B.gate;
  plan.Cut("x", C.maxZ, GT.x - GT.w / 2, GT.x + GT.w / 2);
  Lintel(blocks, "BenjiaGateLintel", "x", C.maxZ, GT.x - GT.w / 2, GT.x + GT.w / 2, GT.topH, V.wallH, sample);
  House(blocks, "BenjiaBeiwu", B.beiwu.box, B.beiwu.roofH);
  House(blocks, "BenjiaWestWing", B.westWing.box, B.westWing.roofH);
  House(blocks, "BenjiaEastWing", B.eastWing.box, B.eastWing.roofH);
  House(blocks, "BenjiaNanwu", B.nanwu.box, B.nanwu.roofH);
  const vat = L0610_PROP_KINDS.WaterVat, coop = L0610_PROP_KINDS.ChickenCoop, NB = { vat: { x: 89.4, z: 485.2 }, coop: { x: 77.2, z: 488.6 } };
  blocks.push(Block("BenjiaVat", NB.vat.x, NB.vat.z, vat.w, vat.d, vat.h, vat.semantic, { prop: "WaterVat" }));
  blocks.push(Block("BenjiaCoop", NB.coop.x, NB.coop.z, coop.w, coop.d, coop.h, coop.semantic, { prop: "ChickenCoop" }));
}

/** 东街南侧院墙外贴着街的土地庙：三面薄墙 + 顶，开口朝北。 */
function Shrine(out, sample) {
  const S = ES.shrine, t = S.wallT, g = sample(S.x, S.z);
  const extra = { prop: "Shrine" };
  out.push(Block("ShrineBack", S.x, S.z + S.d / 2 - t / 2, S.w, t, S.h, BRICK, extra));
  out.push(Block("ShrineWest", S.x - S.w / 2 + t / 2, S.z, t, S.d, S.h, BRICK, extra));
  out.push(Block("ShrineEast", S.x + S.w / 2 - t / 2, S.z, t, S.d, S.h, BRICK, extra));
  out.push(Block("ShrineRoof", S.x, S.z, S.w + 0.2, S.d + 0.2, t, ROOF, { ...extra, y: R2(g + S.h - t / 2 + 0.02) }));
}

/** 瓦砾堆：几块错落的土坯块（2 高块 + 1 矮块），整体 ≥ 1.6 高。 */
function RubbleBlocks(out) {
  for (const r of L0610_RUBBLE) {
    const c = Math.cos(r.ry), s = Math.sin(r.ry);
    const Off = (lx, lz) => ({ x: r.x + lx * c + lz * s, z: r.z - lx * s + lz * c });
    const a = Off(-r.w * 0.22, 0.1), b = Off(r.w * 0.24, -0.15), d = Off(0, r.d * 0.3);
    out.push(Block(`${r.id}_1`, a.x, a.z, r.w * 0.56, r.d * 0.9, r.h, EARTH, { ry: r.ry + 0.08, prop: "Rubble", rubble: true }));
    out.push(Block(`${r.id}_2`, b.x, b.z, r.w * 0.56, r.d * 0.85, r.h - 0.15, EARTH, { ry: r.ry - 0.1, prop: "Rubble", rubble: true }));
    out.push(Block(`${r.id}_3`, d.x, d.z, r.w * 0.9, r.d * 0.5, 0.6, EARTH, { ry: r.ry + 0.25, prop: "Rubble", rubble: true }));
  }
}

/** 窄胡同：塌墙（随 LaneWallCollapse）、柴垛、绕路院子的落点由院子表盖；这里出塌墙与柴垛。 */
function SouthLaneBlocks(plan, blocks, gates) {
  const CL = SLN.collapse;
  plan.Cut("z", CL.wallX, CL.fromZ, CL.toZ);
  gates.push(Block("LaneWallStanding", CL.wallX, (CL.fromZ + CL.toZ) / 2, T, CL.toZ - CL.fromZ, V.wallH, WALL, { signal: SIG.laneWallCollapse }));
  gates.push(Block("LaneWallFallen", CL.x, CL.z, CL.slab.w, CL.slab.d, CL.slab.t, WALL, { ry: CL.slab.ry, appearSignal: SIG.laneWallCollapse }));
  gates.push(Block("LaneWallRubble", CL.x - 0.25, CL.z - 0.2, CL.rubble.w, CL.rubble.d, CL.rubble.h, EARTH, { ry: CL.rubble.ry, prop: "Rubble", rubble: true, appearSignal: SIG.laneWallCollapse }));
  gates.push(Block("LaneWallRubble2", CL.x + 0.4, CL.z + 0.9, 1.2, 1.1, 1.1, EARTH, { ry: -0.5, prop: "Rubble", rubble: true, appearSignal: SIG.laneWallCollapse }));
  const P = SLN.climb.pile;
  blocks.push(Block("ClimbPile", P.x, P.z, P.w, P.d, P.h, "canvas", { prop: "Haystack", climb: true }));
}

/** 班长那一路（10-24）：EM2 / EM3 之间 z 435 那道院墙北面墙根的柴垛（踩着翻墙的台阶，同 ClimbPile 的做法：不开口子，只是一块 1.2 高的垛）。 */
function EastYardBlocks(blocks) {
  const P = EYR.climb.pile;
  blocks.push(Block("EastClimbPile", P.x, P.z, P.w, P.d, P.h, "canvas", { prop: "Haystack", climb: true }));
}

/** 一条胡同的净空范围（轴对齐盒子）。 */
function RunBox(r) {
  return r.axis === "z" ? { minX: r.c - r.halfW, maxX: r.c + r.halfW, minZ: r.from, maxZ: r.to } : { minX: r.from, maxX: r.to, minZ: r.c - r.halfW, maxZ: r.c + r.halfW };
}
/**
 * 胡同两边的墙与死胡同尽头的墙：每条胡同沿两侧各加一道墙（院墙在同一条线上的合并掉），
 * 横过来的胡同（轴不同的）与丁字路口经过的那一截减掉；caps 里标的那头加一道横墙封死。
 */
function LaneWalls(plan) {
  const runs = STREET_RUNS, boxes = [ST.square.box, ST.pocket.box];
  for (const r of runs) {
    const along = r.axis === "z" ? ["minZ", "maxZ"] : ["minX", "maxX"], across = r.axis === "z" ? ["minX", "maxX"] : ["minZ", "maxZ"];
    for (const side of [-1, 1]) {
      const fixed = r.c + side * (r.halfW + T / 2);
      plan.Add(r.axis, fixed, r.from, r.to, V.wallH);
      for (const q of runs) {
        if (q === r || q.axis === r.axis) continue;
        const b = RunBox(q), lo = b[across[0]], hi = b[across[1]];
        const inside = fixed > lo + 0.1 && fixed < hi - 0.1;                                    // 横穿过去
        const touches = Math.abs(fixed - lo) <= 0.3 || Math.abs(fixed - hi) <= 0.3;             // 顶在这道墙上
        const outward = side < 0 ? lo < fixed - 0.5 : hi > fixed + 0.5;                          // 并且往离开这条胡同的那边延伸（丁字口），不是在这条胡同里到头
        if (inside || (touches && outward)) plan.Cut(r.axis, fixed, Math.max(b[along[0]], r.from), Math.min(b[along[1]], r.to));
      }
      for (const b of boxes) if (fixed > b[across[0]] + 0.1 && fixed < b[across[1]] - 0.1) plan.Cut(r.axis, fixed, Math.max(b[along[0]], r.from), Math.min(b[along[1]], r.to));
    }
    for (const end of r.caps || []) {
      const at = end === "from" ? r.from : r.to;
      plan.Add(r.axis === "z" ? "x" : "z", at, r.c - r.halfW - T / 2, r.c + r.halfW + T / 2, V.wallH);
    }
  }
}

// ---------------------------------------------------------------------------
// 第八版：转过的院子、折线胡同、茅圈、独院、庙 / 铺 / 炮楼 / 井 / 场院 / 菜园 / 林 / 树 / 河岸

/** 转过的块：局部 (lx,lz) 以 (cx,cz) 为原点、按 ry 转；块本身也转 ry（加 extraRy）。 */
function RBlock(id, pose, lx, lz, w, d, h, semantic, extra = {}, extraRy = 0) {
  const p = YardToWorld(pose, lx, lz, false);
  return Block(id, p.x, p.z, w, d, h, semantic, { ...extra, ry: R2(pose.ry + extraRy) });
}
/** 转过的过梁（显式 y，按门中心的地面）。 */
function RLintel(id, pose, lx, lz, len, bottomH, topH, sample, across = false) {
  const p = YardToWorld(pose, lx, lz, false);
  const y = R2(sample(p.x, p.z) + (bottomH + topH) / 2);
  return Block(id, p.x, p.z, across ? T : len, across ? len : T, topH - bottomH, WALL, { y, ry: R2(pose.ry) });
}

/**
 * 茅圈（厕所连猪圈）：三面矮土墙 + 一个口（朝院子中间）+ 里面一个坑（矮块）。toilet：{ lx, lz }（院子局部，未缩）；pose 院子姿态（局部偏移按 s 缩）。
 */
function ToiletBlocks(out, yardId, toilet, pose, sample, open = null) {
  if (!toilet) return;
  const TL = L0610_TOILET, lx = toilet.lx * pose.s, lz = toilet.lz * pose.s;
  let openX = Math.abs(lx) >= Math.abs(lz) ? -Math.sign(lx) : 0, openZ = openX ? 0 : -Math.sign(lz);   // 口子朝院子中间
  if (open) { openX = open === "W" ? -1 : open === "E" ? 1 : 0; openZ = open === "N" ? -1 : open === "S" ? 1 : 0; }
  const sides = [["N", 0, -TL.d / 2, TL.w, TL.wallT], ["S", 0, TL.d / 2, TL.w, TL.wallT], ["W", -TL.w / 2, 0, TL.wallT, TL.d], ["E", TL.w / 2, 0, TL.wallT, TL.d]];
  for (const [name, ox, oz, w, d] of sides) {
    const isOpen = (name === "N" && openZ < 0) || (name === "S" && openZ > 0) || (name === "W" && openX < 0) || (name === "E" && openX > 0);
    if (isOpen) continue;
    out.push(RBlock(`Toilet_${yardId}_${name}`, pose, lx + ox, lz + oz, w, d, TL.wallH, EARTH, { toilet: true }));
  }
  out.push(RBlock(`Toilet_${yardId}_Pit`, pose, lx + 0.2 * (openX ? -openX : 0), lz + 0.2 * (openZ ? -openZ : 0), 0.9, 0.9, 0.06, EARTH, { toilet: true, prop: "Pit" }));
}

/**
 * 转过的院子的院门对着直胡同时，在胡同的墙（LaneWalls 加的那道，或死胡同的封头）上开口：门洞中心往外 2 m 这一截碰到哪道墙就在那里开 门宽 + 0.8。
 * 院门对着折线胡同的（锁定的 / 转过的都算）由 PathLaneWalls 按 YardGateGaps 留口子。
 */
function CutRunWallForGate(plan, gw) {
  const far = { x: gw.x + gw.normal.x * 3.2, z: gw.z + gw.normal.z * 3.2 };   // 门外 3.2 m 以内碰到的墙：转过的院子往里收了，门外有一小块门道
  const Hit = (axis, fixed, from, to) => {
    // 线段 gw→far 与这条墙线（axis x：z = fixed；axis z：x = fixed）的交点
    const a = axis === "x" ? gw.z : gw.x, b = axis === "x" ? far.z : far.x;
    if ((a - fixed) * (b - fixed) > 0) return null;
    const t = Math.abs(b - a) < 1e-9 ? 0 : (fixed - a) / (b - a);
    const along = axis === "x" ? gw.x + (far.x - gw.x) * t : gw.z + (far.z - gw.z) * t;
    return along >= from - 0.3 && along <= to + 0.3 ? along : null;
  };
  for (const r of STREET_RUNS) {
    for (const side of [-1, 1]) {
      const fixed = r.c + side * (r.halfW + T / 2);
      const at = Hit(r.axis, fixed, r.from, r.to);
      if (at !== null) plan.Cut(r.axis, fixed, at - 1.15, at + 1.15);
    }
    for (const end of r.caps || []) {
      const fixed = end === "from" ? r.from : r.to, axis = r.axis === "z" ? "x" : "z";
      const at = Hit(axis, fixed, r.c - r.halfW - T / 2, r.c + r.halfW + T / 2);
      if (at !== null) plan.Cut(axis, fixed, at - 1.15, at + 1.15);
    }
  }
}
/** 所有院门（世界坐标）对着折线胡同的：在那条胡同的墙上留的口子 { path, at, len, side }。 */
function YardGateGaps() {
  const out = [];
  for (const y of L0610_YARDS) {
    if (!y.gate) continue;
    const gw = YardGateWorld(y);
    for (const p of LANE_PATHS) {
      const n = PathNearest(p, gw.out.x, gw.out.z);
      if (n.dist > n.halfW + T + 2.6) continue;   // 门外 3.2 m 以内（门道）
      const a = p.line[n.seg], b = p.line[n.seg + 1];
      const side = Math.sign((b.x - a.x) * (gw.z - a.z) - (b.z - a.z) * (gw.x - a.x)) || 1;   // +1 = 行进方向的右手（x 东 z 南：往东走右手是南）
      out.push({ path: p.id, at: n.at, len: y.gate.w + 0.8, side });
    }
  }
  return out;
}

/** 转过的院子（第八版）：院墙四面（院门那面留洞 + 过梁 + 关着的门扇）、房子（不缩，按缩过的院子夹在里头）、菜园的矮篱、树、茅圈。 */
function RotatedYardBlocks(out, y, pose, sample, plan) {
  if (y.gate && plan) CutRunWallForGate(plan, YardGateWorld(y));
  const b = y.box, hw = (b.maxX - b.minX) / 2 * pose.s, hd = (b.maxZ - b.minZ) / 2 * pose.s;
  const wallH = y.wallH ?? V.wallH, fences = new Set(y.fences || []);
  const g = y.gate;
  const gateOn = g ? g.wall : null;
  const gl = g ? (g.wall === "N" || g.wall === "S" ? (g.c - (b.minX + b.maxX) / 2) * pose.s : (g.c - (b.minZ + b.maxZ) / 2) * pose.s) : 0;
  for (const side of ["N", "S", "W", "E"]) {
    const horizontal = side === "N" || side === "S";
    const fixed = side === "N" ? -hd : side === "S" ? hd : side === "W" ? -hw : hw;
    const half = horizontal ? hw : hd;
    if (fences.has(side)) {
      out.push(horizontal ? RBlock(`Fence_${y.id}_${side}`, pose, 0, fixed, half * 2, 0.3, V.fenceH, EARTH, { fence: true }) : RBlock(`Fence_${y.id}_${side}`, pose, fixed, 0, 0.3, half * 2, V.fenceH, EARTH, { fence: true }));
      continue;
    }
    if (gateOn === side) {
      const a0 = -half, a1 = gl - g.w / 2, b0 = gl + g.w / 2, b1 = half;
      const seg = (tag, from, to) => {
        if (to - from < 0.05) return;
        const mid = (from + to) / 2, len = to - from;
        out.push(horizontal ? RBlock(`Wall_${y.id}_${side}${tag}`, pose, mid, fixed, len, T, wallH, WALL) : RBlock(`Wall_${y.id}_${side}${tag}`, pose, fixed, mid, T, len, wallH, WALL));
      };
      seg("a", a0, a1); seg("b", b0, b1);
      out.push(horizontal ? RLintel(`Gate_${y.id}_Lintel`, pose, gl, fixed, g.w, V.doorTopH, wallH, sample) : RLintel(`Gate_${y.id}_Lintel`, pose, fixed, gl, g.w, V.doorTopH, wallH, sample, true));
      if (g.leaf === "closed") out.push(horizontal ? RBlock(`Gate_${y.id}_Leaf`, pose, gl, fixed, g.w - 0.1, 0.08, 2.0, WOOD, { gate: true }) : RBlock(`Gate_${y.id}_Leaf`, pose, fixed, gl, 0.08, g.w - 0.1, 2.0, WOOD, { gate: true }));
      continue;
    }
    out.push(horizontal ? RBlock(`Wall_${y.id}_${side}`, pose, 0, fixed, half * 2, T, wallH, WALL) : RBlock(`Wall_${y.id}_${side}`, pose, fixed, 0, T, half * 2, wallH, WALL));
  }
  const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
  const Fit = (hb) => {   // 房子偏移按 s 缩，再夹在缩过的院子里（墙里退 0.5）
    const w = hb.maxX - hb.minX, d = hb.maxZ - hb.minZ;
    let lx = ((hb.minX + hb.maxX) / 2 - cx) * pose.s, lz = ((hb.minZ + hb.maxZ) / 2 - cz) * pose.s;
    lx = Math.max(-hw + 0.5 + w / 2, Math.min(hw - 0.5 - w / 2, lx));
    lz = Math.max(-hd + 0.5 + d / 2, Math.min(hd - 0.5 - d / 2, lz));
    return { lx, lz, w, d };
  };
  const fitted = [];
  y.houses.forEach((h, i) => {
    const id = h.id ? `House_${h.id}` : `House_${y.id}_${i + 1}`;
    const f = Fit(h.box);
    fitted.push(f);
    if (L0610_COLLAPSED_HOUSES.includes(id)) {
      const cw = Math.min(4, f.w / 2), cd = Math.min(3, f.d / 2);
      out.push(RBlock(`${id}_A`, pose, f.lx - cw / 2, f.lz, f.w - cw, f.d, h.h, BRICK, { house: true }));
      out.push(RBlock(`${id}_B`, pose, f.lx + f.w / 2 - cw / 2, f.lz - cd / 2, cw, f.d - cd, h.h, BRICK, { house: true }));
      const k = L0610_PROP_KINDS.Rubble;
      out.push(RBlock(`${id}_Rubble`, pose, f.lx + f.w / 2 - cw / 2 + 0.3, f.lz + f.d / 2 - cd / 2 + 0.4, k.w, k.d, k.h, k.semantic, { prop: "Rubble" }, 0.3));
    } else out.push(RBlock(id, pose, f.lx, f.lz, f.w, f.d, h.h, BRICK, { house: true }));
  });
  // 茅圈：在缩过的院子里重新找角（房子没缩，按夹好的房子算）；局部坐标已经是缩过的，ToiletBlocks 不再乘 s
  if (ToiletFor(y) !== null && !["garden", "pond", "farmyard", "temple"].includes(y.kind) && g) {
    const TL = L0610_TOILET, ins = TL.inset + TL.w / 2;
    const gp = g.wall === "S" ? [gl, hd] : g.wall === "N" ? [gl, -hd] : g.wall === "E" ? [hw, gl] : [-hw, gl];
    const cs = [[-hw + ins, -hd + ins], [hw - ins, -hd + ins], [-hw + ins, hd - ins], [hw - ins, hd - ins]].sort((p, q) => Math.hypot(q[0] - gp[0], q[1] - gp[1]) - Math.hypot(p[0] - gp[0], p[1] - gp[1]));
    const pick = cs.find((c) => Math.hypot(c[0] - gp[0], c[1] - gp[1]) >= 2.4 && !fitted.some((f) => c[0] + TL.w / 2 > f.lx - f.w / 2 - 0.2 && c[0] - TL.w / 2 < f.lx + f.w / 2 + 0.2 && c[1] + TL.d / 2 > f.lz - f.d / 2 - 0.2 && c[1] - TL.d / 2 < f.lz + f.d / 2 + 0.2));
    if (pick) ToiletBlocks(out, y.id, { lx: pick[0], lz: pick[1] }, { ...pose, s: 1 }, sample);
  }
}

/** 院子的树（转过的院子里的树跟着转；外头的照旧）。 */
function YardTreeWorld(y, t) {
  const pose = YardPose(y);
  if (!pose.ry) return { x: t.x, z: t.z };
  return YardToWorld(pose, (t.x - pose.cx), (t.z - pose.cz));
}

/** 折线胡同的墙：每段两边各一道转过的块（内角处各伸 ext 搭住）；封头；塌墙的缺口 + 倒下的墙板与土堆；接口处让开。 */
function PathLaneWalls(out, plan) {
  const paths = L0610_LANE_PATHS;
  const ByRun = (id) => ST[id];
  const gateGaps = YardGateGaps();
  for (const p of Object.values(paths)) {
    const line = p.line, n = line.length;
    const segLen = [], cum = [0];
    for (let i = 1; i < n; i++) { segLen.push(Math.hypot(line[i].x - line[i - 1].x, line[i].z - line[i - 1].z)); cum.push(cum[i - 1] + segLen[i - 1]); }
    const total = cum[n - 1];
    // 缺口：自己的 gaps + 别的折线接到我身上的口子 + 对着我的院门
    const gaps = [...(p.gaps || []).map((g) => ({ at: g.at, len: g.len, side: g.side, id: g.id })), ...gateGaps.filter((g) => g.path === p.id)];
    for (const q of Object.values(paths)) for (const j of q.joins || []) {
      if (j.path !== p.id) continue;
      const near = PathNearest(p, j.at.x, j.at.z);
      // 子胡同从哪边接进来：看它离接点 2 m 的那一点在我哪一边
      const qStart = Math.hypot(q.line[0].x - j.at.x, q.line[0].z - j.at.z) < 0.5;
      const probe = qStart ? q.line[1] : q.line[q.line.length - 2];
      const seg = p.line[near.seg], seg2 = p.line[near.seg + 1];
      const dx = seg2.x - seg.x, dz = seg2.z - seg.z;
      const side = Math.sign(dx * (probe.z - seg.z) - dz * (probe.x - seg.x)) || 1;   // +1 = 右手（行进方向的右边；x 东 z 南）
      gaps.push({ at: near.at, len: 2 * (qStart ? q.halfW[0] : q.halfW[q.halfW.length - 1]) + 0.5, side });
    }
    // 两头：接到直胡同的头上（续着走，不伸）/ 接到别的胡同的身上（让开人家的半宽 + 墙）/ 封头
    const trim = { from: 0, to: 0 };
    for (const j of p.joins || []) {
      if (j.run && j.end) continue;   // 续着直胡同的头：墙贴着接上
      const atStart = Math.hypot(line[0].x - j.at.x, line[0].z - j.at.z) < 0.5;
      let room = 0;
      if (j.run) { const r = ByRun(j.run); room = r.halfW + T; plan.Cut(r.axis, r.c + (r.axis === "z" ? (j.at.x < r.c ? -1 : 1) : (j.at.z < r.c ? -1 : 1)) * (r.halfW + T / 2), (r.axis === "z" ? j.at.z : j.at.x) - (atStart ? p.halfW[0] : p.halfW[n - 1]) - 0.2, (r.axis === "z" ? j.at.z : j.at.x) + (atStart ? p.halfW[0] : p.halfW[n - 1]) + 0.2); }
      else { const near = PathNearest(paths[j.path], j.at.x, j.at.z); room = near.halfW + T; }
      if (atStart) trim.from = Math.max(trim.from, room); else trim.to = Math.max(trim.to, room);
    }
    const EXT = 0.8;
    for (let i = 0; i < n - 1; i++) {
      const a = line[i], b = line[i + 1], len = segLen[i];
      const ux = (b.x - a.x) / len, uz = (b.z - a.z) / len;
      const ry = Math.atan2(-uz, ux);
      const hwA = p.halfW[i], hwB = p.halfW[i + 1];
      for (const side of [-1, 1]) {
        const nx = side * -uz, nz = side * ux;   // +1 = 右手
        // 这一段这一边的墙：从 s0 到 s1（沿段的弧长），减去缺口
        let s0 = i === 0 ? trim.from : -EXT, s1 = i === n - 2 ? len - trim.to : len + EXT;
        const pieces = [[s0, s1]];
        for (const g of gaps) {
          if (g.side !== side) continue;
          const g0 = g.at - g.len / 2 - cum[i], g1 = g.at + g.len / 2 - cum[i];
          for (let k = pieces.length - 1; k >= 0; k--) {
            const [q0, q1] = pieces[k];
            if (g1 <= q0 || g0 >= q1) continue;
            pieces.splice(k, 1);
            if (g0 > q0) pieces.push([q0, g0]);
            if (g1 < q1) pieces.push([g1, q1]);
          }
        }
        pieces.sort((u, v) => u[0] - v[0]).forEach(([q0, q1], k) => {
          if (q1 - q0 < 0.1) return;
          const mid = (q0 + q1) / 2, t = Clamp01(mid / len);
          const hw = hwA + (hwB - hwA) * t;
          const cx = a.x + ux * mid + nx * (hw + T / 2), cz = a.z + uz * mid + nz * (hw + T / 2);
          out.push(Block(`PathWall_${p.id}_${i + 1}${side < 0 ? "L" : "R"}${k ? String.fromCharCode(97 + k) : ""}`, cx, cz, q1 - q0, T, V.wallH, WALL, { ry: R2(ry) }));
        });
      }
      // 这一段上的塌墙：墙板横在胡同里、墙根一堆土、一截残墙
      for (const g of gaps) {
        if (!g.id || g.at < cum[i] || g.at >= cum[i + 1]) continue;
        const sAt = g.at - cum[i], t = Clamp01(sAt / len), hw = hwA + (hwB - hwA) * t;
        const nx = g.side * -uz, nz = g.side * ux;   // 墙在这一边；倒进胡同 = 往 −n 那边
        const wx = a.x + ux * sAt, wz = a.z + uz * sAt;
        const slabOff = hw + T / 2 - 1.0, heapOff = hw + T / 2 - 0.45;
        out.push(Block(`${g.id}_Slab`, wx + ux * 0.2 + nx * slabOff, wz + uz * 0.2 + nz * slabOff, g.len, 2.0, 0.25, WALL, { ry: R2(ry + 0.1), prop: "Rubble", fallen: true }));
        out.push(Block(`${g.id}_Heap`, wx - ux * 0.4 + nx * heapOff, wz - uz * 0.4 + nz * heapOff, g.len * 0.7, 0.9, 1.2, EARTH, { ry: R2(ry - 0.2), prop: "Rubble", rubble: true }));
        const stubS = sAt - g.len / 2 - 0.3, so = hw + T / 2;
        out.push(Block(`${g.id}_Stub`, a.x + ux * stubS + nx * so, a.z + uz * stubS + nz * so, 0.6, T, 1.1, WALL, { ry: R2(ry), fallen: true }));
      }
    }
    for (const end of p.caps || []) {
      const i = end === "from" ? 0 : n - 1, j = end === "from" ? 1 : n - 2;
      const v = line[i], w = line[j], len = Math.hypot(w.x - v.x, w.z - v.z);
      const ux = (w.x - v.x) / len, uz = (w.z - v.z) / len, hw = p.halfW[i];
      out.push(Block(`PathCap_${p.id}_${end}`, v.x, v.z, T, 2 * hw + 2 * T, V.wallH, WALL, { ry: R2(Math.atan2(-uz, ux)) }));
    }
  }
}

/** 外沿的单门独院：院墙 + 院门（关着）+ 一排房（排房院）或北屋 + 厢房（半面槽院）+ 茅圈 + 一棵树。 */
function FarmsteadBlocks(out, sample) {
  for (const f of L0610_FARMSTEADS) {
    const pose = { cx: f.x, cz: f.z, ry: f.ry, s: 1 };
    const hw = f.w / 2, hd = f.d / 2;
    const gateSide = f.gate, gw = V.gateW;
    for (const side of ["N", "S", "W", "E"]) {
      const horizontal = side === "N" || side === "S";
      const fixed = side === "N" ? -hd : side === "S" ? hd : side === "W" ? -hw : hw;
      const half = horizontal ? hw : hd;
      if (side === gateSide) {
        const gl = horizontal ? half - 2.0 : half - 2.0;   // 院门在角上
        const seg = (tag, from, to) => { if (to - from < 0.05) return; const mid = (from + to) / 2, len = to - from; out.push(horizontal ? RBlock(`Wall_${f.id}_${side}${tag}`, pose, mid, fixed, len, T, V.wallH, WALL) : RBlock(`Wall_${f.id}_${side}${tag}`, pose, fixed, mid, T, len, V.wallH, WALL)); };
        seg("a", -half, gl - gw / 2); seg("b", gl + gw / 2, half);
        out.push(horizontal ? RLintel(`Gate_${f.id}_Lintel`, pose, gl, fixed, gw, V.doorTopH, V.wallH, sample) : RLintel(`Gate_${f.id}_Lintel`, pose, fixed, gl, gw, V.doorTopH, V.wallH, sample, true));
        out.push(horizontal ? RBlock(`Gate_${f.id}_Leaf`, pose, gl, fixed, gw - 0.1, 0.08, 2.0, WOOD, { gate: true }) : RBlock(`Gate_${f.id}_Leaf`, pose, fixed, gl, 0.08, gw - 0.1, 2.0, WOOD, { gate: true }));
        continue;
      }
      out.push(horizontal ? RBlock(`Wall_${f.id}_${side}`, pose, 0, fixed, half * 2, T, V.wallH, WALL) : RBlock(`Wall_${f.id}_${side}`, pose, fixed, 0, T, half * 2, V.wallH, WALL));
    }
    // 房子：北屋贴北墙；半面槽院再加一间厢房
    const bw = Math.min(10, f.w - 3), bd = 4.8;
    out.push(RBlock(`House_${f.id}_1`, pose, 0, -hd + 0.5 + bd / 2, bw, bd, V.houseH, BRICK, { house: true }));
    if (f.kind === "banmian") out.push(RBlock(`House_${f.id}_2`, pose, hw - 0.5 - 2, Math.min(hd - 0.6 - 3, -hd + 0.5 + bd + 0.6 + 3), 4, 6, V.wingH, BRICK, { house: true }));
    // 茅圈：南边一角（北屋占着北边；厢房在东边时放西南角）
    const TL = L0610_TOILET;
    const tl = { lx: (gateSide === "W" && f.kind === "paifang" ? 1 : -1) * (hw - TL.inset - TL.w / 2), lz: hd - TL.inset - TL.d / 2 };
    ToiletBlocks(out, f.id, tl, pose, sample);
    const tr = YardToWorld(pose, hw * 0.3, hd * 0.3, false);
    out.push(Block(`Tree_${f.id}`, tr.x, tr.z, 0.42, 0.42, 5.5, "foliage", { tree: "paulownia" }));
  }
}

/** 关帝庙殿里的课桌与香案、杂货铺的柜台、村外小庙、土炮楼、井、场院、菜园、取土坑、粪堆、去掉的院子、林、树、河岸。 */
function OutsideBlocks(out, sample) {
  // 关帝庙（兼村塾）：香案靠北墙、六张破课桌
  const TP = L0610_TEMPLE;
  out.push(Block("TempleAltar", TP.altar.x, TP.altar.z, TP.altar.w, TP.altar.d, TP.altar.h, WOOD, { prop: "Altar" }));
  TP.desks.forEach(([x, z], i) => out.push(Block(`TempleDesk_${i + 1}`, x, z, 1.2, 0.5, 0.75, WOOD, { ry: (i % 2 ? -0.06 : 0.05), prop: "Desk" })));
  // 杂货铺：柜台
  const SH = L0610_SHOP;
  out.push(Block("ShopCounter", SH.counter.x, SH.counter.z, SH.counter.w, SH.counter.d, SH.counter.h, WOOD, { prop: "Counter" }));
  // 村外小庙：三面墙 2.6，门洞里砌死的砖，东墙塌了一截（瓦砾），半个顶
  const FS = L0610_FIELD_SHRINE, fp = { cx: FS.x, cz: FS.z, ry: FS.ry, s: 1 }, fhw = FS.w / 2, fhd = FS.d / 2;
  out.push(RBlock("FieldShrine_N", fp, 0, -fhd, FS.w, T, FS.wallH, BRICK));
  out.push(RBlock("FieldShrine_W", fp, -fhw, 0, T, FS.d, FS.wallH, BRICK));
  out.push(RBlock("FieldShrine_Ea", fp, fhw, -fhd / 2, T, fhd, FS.wallH, BRICK));
  out.push(RBlock("FieldShrine_Eb", fp, fhw, fhd / 2, T, fhd, 0.9, BRICK, { fallen: true }));   // 东墙南半截塌了
  out.push(RBlock("FieldShrine_Sa", fp, -(fhw + FS.doorW / 2) / 2, fhd, fhw - FS.doorW / 2, T, FS.wallH, BRICK));
  out.push(RBlock("FieldShrine_Sb", fp, (fhw + FS.doorW / 2) / 2, fhd, fhw - FS.doorW / 2, T, FS.wallH, BRICK));
  out.push(RBlock("FieldShrine_DoorBrick", fp, 0, fhd, FS.doorW, T - 0.1, 2.0, "structure", { bricked: true }));
  out.push(RLintel("FieldShrine_DoorLintel", fp, 0, fhd, FS.doorW, 2.0, FS.wallH, sample));
  out.push(RBlock("FieldShrine_Rubble", fp, fhw + 0.6, fhd / 2 + 0.4, 2.2, 2.0, 0.7, EARTH, { prop: "Rubble" }, 0.4));
  {
    const c = YardToWorld(fp, -fhw / 2, 0, false);
    out.push(Block("FieldShrine_Roof", c.x, c.z, fhw + 0.3, FS.d + 0.3, 0.2, ROOF, { y: R2(sample(c.x, c.z) + FS.wallH - 0.1), ry: R2(FS.ry) }));
  }
  // 土炮楼
  const WT = L0610_WATCHTOWER;
  out.push(Block("WatchTower", WT.x, WT.z, WT.w, WT.d, WT.h, "structure", { tower: true }));
  out.push(Block("WatchTowerParapet", WT.x, WT.z, WT.w + 0.4, WT.d + 0.4, 0.5, WALL, { y: R2(sample(WT.x, WT.z) + WT.h + 0.25) }));
  // 井：井台（矮块，跨得过）；浇地井加辘轳架（两根柱 + 横梁）
  for (const w of L0610_WELLS) {
    out.push(Block(`${w.id}_Rim`, w.x, w.z, 1.2, 1.2, w.rimH, BRICK, { prop: "Well" }));
    if (w.kind === "irrigation") {
      out.push(Block(`${w.id}_PostW`, w.x - 0.85, w.z, 0.15, 0.15, w.frameH, WOOD, { prop: "Well" }));
      out.push(Block(`${w.id}_PostE`, w.x + 0.85, w.z, 0.15, 0.15, w.frameH, WOOD, { prop: "Well" }));
      out.push(Block(`${w.id}_Beam`, w.x, w.z, 1.9, 0.12, 0.12, WOOD, { prop: "Well", y: R2(sample(w.x, w.z) + w.frameH - 0.06) }));
    }
  }
  // 场院：麦秸垛、石磙
  for (const t of L0610_THRESHING) {
    const pose = { cx: t.x, cz: t.z, ry: t.ry, s: 1 };
    t.stacks.forEach(([lx, lz, r], i) => out.push(RBlock(`${t.id}_Stack${i + 1}`, pose, lx, lz, r * 2, r * 2, 2.4, "canvas", { prop: "StrawStack" }, 0.2 * i)));
    out.push(RBlock(`${t.id}_Roller`, pose, t.roller[0], t.roller[1], 1.5, 0.7, 0.7, BRICK, { prop: "Roller" }, t.roller[2]));
  }
  // 庄外的菜园：四面矮篱
  for (const g of L0610_OUTER_GARDENS) {
    const pose = { cx: g.x, cz: g.z, ry: g.ry, s: 1 };
    out.push(RBlock(`Fence_${g.id}_N`, pose, 0, -g.d / 2, g.w, 0.3, V.fenceH, EARTH, { fence: true }));
    out.push(RBlock(`Fence_${g.id}_S`, pose, 0, g.d / 2, g.w, 0.3, V.fenceH, EARTH, { fence: true }));
    out.push(RBlock(`Fence_${g.id}_W`, pose, -g.w / 2, 0, 0.3, g.d, V.fenceH, EARTH, { fence: true }));
    out.push(RBlock(`Fence_${g.id}_E`, pose, g.w / 2, 0, 0.3, g.d, V.fenceH, EARTH, { fence: true }));
  }
  // 取土坑的水、粪堆
  const OP = L0610_OUTER_POND;
  out.push(Block("OuterPondWater", OP.x, OP.z, OP.rx * 1.6, OP.rz * 1.6, OP.waterH, "water", { y: R2(OUTER_POND_FLOOR_Y + OP.waterH / 2 - 0.02), solid: false }));
  const dk = L0610_PROP_KINDS.DungHeap;
  L0610_OUTER_DUNG.forEach((d, i) => out.push(Block(`DungHeap_O${i + 1}`, d.x, d.z, dk.w, dk.d, dk.h, dk.semantic, { ry: d.ry, prop: "DungHeap" })));
  // 去掉的院子：空地 + 一团树 + 一截塌了的旧院墙 + 瓦砾
  for (const dy of L0610_DROPPED_YARDS) {
    dy.trees.forEach(([x, z, h], i) => out.push(Block(`Tree_${dy.id}_${i + 1}`, x, z, 0.42, 0.42, h, "foliage", { tree: "paulownia" })));
    const r = dy.ruin;
    out.push(Block(`Ruin_${dy.id}`, r.x, r.z, r.w, r.d, r.h, WALL, { ry: r.ry, fallen: true }));
    out.push(Block(`RuinRubble_${dy.id}`, r.x + 2.5, r.z + 1.2, 2.0, 1.6, 0.6, EARTH, { ry: r.ry + 0.5, prop: "Rubble" }));
  }
  // 林：松柏 / 杂树、义林的木牌
  for (const g of L0610_GROVES) {
    const pose = { cx: g.x, cz: g.z, ry: g.ry, s: 1 };
    g.trees.forEach(([lx, lz, h], i) => out.push(RBlock(`Tree_${g.id}_${i + 1}`, pose, lx, lz, 0.42, 0.42, h, "foliage", { tree: g.kind === "family" ? "cypress" : "scrub" })));
    (g.markers || []).forEach(([lx, lz], i) => out.push(RBlock(`Marker_${g.id}_${i + 1}`, pose, lx, lz - 0.9, 0.25, 0.05, 0.8, WOOD, { prop: "GraveMarker" }, 0.1 * i)));
  }
  // 田里零星的树、庄子外沿的树丛、凹路坎上的树
  L0610_FIELD_TREES.forEach((t, i) => out.push(Block(`Tree_F${String(i + 1).padStart(2, "0")}`, t.x, t.z, 0.42, 0.42, t.h, "foliage", { tree: "paulownia" })));
  L0610_EDGE_CLUMPS.forEach((c, i) => { for (let k = 0; k < c.n; k++) out.push(Block(`Tree_C${i + 1}_${k + 1}`, R2(c.x + (Hash01(i, k, 1) - 0.5) * 10), R2(c.z + (Hash01(i, k, 2) - 0.5) * 10), 0.42, 0.42, R2(5 + Hash01(i, k, 3) * 2.5), "foliage", { tree: "paulownia" })); });
  L0610_LANE_SIDE.trees.forEach((t, i) => out.push(Block(`Tree_L${i + 1}`, t.x, t.z, 0.42, 0.42, t.h, "foliage", { tree: "locust" })));
  // 河岸：零散的柳树、枯芦苇丛（岸上，庄子那一段东岸不放）；苇子洼里的芦苇
  for (let i = 0; i < RV.bankTrees; i++) {
    const z = 206 + Hash01(i, 11) * 330, r = RiverAtZ(z), side = Hash01(i, 12) < 0.5 ? -1 : 1;
    if (side > 0 && z > 376 && z < 552) continue;
    const x = R2(r.x + side * (r.halfW + RV.wallM + 0.8 + Hash01(i, 13) * 2.5)), zz = R2(z);
    if (NearestOnLine(RV.tributary.line, x, zz).dist < 3 || DistanceToAnyRoad(x, zz) < 2) continue;
    if (Hash01(i, 14) < 0.55) out.push(Block(`Reed_${String(i + 1).padStart(2, "0")}`, x, zz, 1.3, 1.3, 1.8, "foliage", { reed: true, solid: false }));
    else out.push(Block(`Willow_${String(i + 1).padStart(2, "0")}`, x, zz, 0.42, 0.42, R2(4.5 + Hash01(i, 15) * 2.5), "foliage", { tree: "willow" }));
  }
  for (let i = 0; i < RV.marsh.reeds; i++) {
    const z = R2(386 + Hash01(i, 21) * 74), r = RiverAtZ(z);
    const x = R2(r.x + r.halfW + RV.wallM + 0.6 + Hash01(i, 22) * Math.max(0.5, RV.marsh.eastX - 1.2 - (r.x + r.halfW + RV.wallM + 0.6)));
    out.push(Block(`MarshReed_${String(i + 1).padStart(2, "0")}`, x, z, 1.2, 1.2, 1.7, "foliage", { reed: true, solid: false }));
  }
}

/** 河汊子沟底的水（第八版：一段一段跟着弯走；最后一截直的到 z 558 还叫 RiverWater_2，1218 从它末尾接）、西来小沟的水。 */
function RiverWaterBlocks() {
  const out = [];
  const line = RV.line, hw = RV.halfW;
  const z0 = RV.fromZ + RV.endM, zTail = 520, z1 = L0610_BOUNDS.maxZ - 2;
  let k = 0;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1], b = line[i];
    if (b.z <= z0 || a.z >= zTail) continue;
    const ta = Math.max(0, (z0 - a.z) / (b.z - a.z)), tb = Math.min(1, (zTail - a.z) / (b.z - a.z));
    const ax = a.x + (b.x - a.x) * ta, az = a.z + (b.z - a.z) * ta, bx = a.x + (b.x - a.x) * tb, bz = a.z + (b.z - a.z) * tb;
    const len = Math.hypot(bx - ax, bz - az) + 0.6, w = (hw[i - 1] + hw[i]) * 0.5 * 2;
    out.push(Block(`RiverWater_1_${String(++k).padStart(2, "0")}`, (ax + bx) / 2, (az + bz) / 2, w, len, RV.waterH, "water", { solid: false, y: R2(RIVER_FLOOR_Y + RV.waterH / 2), ry: R2(Math.atan2(bx - ax, bz - az)) }));   // 块的 d 轴顺着这一段
  }
  out.push(Block("RiverWater_2", RV.centerX, (zTail + z1) / 2, RV.waterW, z1 - zTail, RV.waterH, "water", { solid: false, y: R2(RIVER_FLOOR_Y + RV.waterH / 2) }));
  const TR = RV.tributary;
  for (let i = 1; i < TR.line.length; i++) {
    const a = TR.line[i - 1], b = TR.line[i], len = Math.hypot(b.x - a.x, b.z - a.z) + 0.4;
    out.push(Block(`TributaryWater_${i}`, (a.x + b.x) / 2, (a.z + b.z) / 2, len, TR.halfW * 2, TR.waterH, "water", { solid: false, y: R2(TR.floorY + TR.waterH / 2), ry: R2(Math.atan2(-(b.z - a.z), b.x - a.x)) }));
  }
  return out;
}

/** 全村的墙、房、门、篱、院子链上的三道门、瓦砾、树、摆件、石碾、土地庙、麦秸垛。 */
function VillageBlocks(sample) {
  const blocks = [], gates = [];
  const plan = new WallPlan();
  GengBlocks(plan, blocks, gates, sample);
  JiefangBlocks(plan, blocks, gates, sample);
  BenjiaBlocks(plan, blocks, sample);
  // 三个有名字的院子的茅圈（第八版）
  for (const [id, t] of Object.entries(L0610_NAMED_TOILETS)) ToiletBlocks(blocks, id, { lx: 0, lz: 0 }, { cx: t.x, cz: t.z, ry: 0, s: 1 }, sample, t.open);
  // 院子：锁定的轴对齐（墙进总表）；其余转过的（第八版）各自出块
  for (const y of L0610_YARDS) {
    const pose = YardPose(y);
    if (pose.ry) RotatedYardBlocks(blocks, y, pose, sample, plan);
    else YardBlocks(plan, blocks, gates, y, sample);
  }
  // 每条胡同两边都是墙（院墙已经盖了大半，这里补齐缝隙），死胡同的尽头封死（caps）；别的胡同横过来的地方留口子
  LaneWalls(plan);
  // 折线胡同（第八版）：两边转过的墙、封头、塌墙的缺口；接到直胡同身上的在它墙上开口
  PathLaneWalls(blocks, plan);
  const E3 = ST.east3;
  // 第一道弯正面墙（x 182、z 460…467）上凿的两个枪眼：正对着街口打
  for (const [i, lp] of (ES.jogLoopholes || []).entries()) {
    const LH = V.loophole;
    plan.Cut("z", lp.x, lp.z - LH.w / 2, lp.z + LH.w / 2);
    Sill(blocks, `JogLoopholeSill${i + 1}`, "z", lp.x, lp.z - LH.w / 2, lp.z + LH.w / 2, LH.sillH, { loophole: true });
    Lintel(blocks, `JogLoopholeLintel${i + 1}`, "z", lp.x, lp.z - LH.w / 2, lp.z + LH.w / 2, LH.topH, V.wallH, sample, WALL, { loophole: true });
  }
  // 庄子外沿补齐：西墙 x 40（385…545，一个口子都没有：死胡同顶到墙根）、东墙 x 232（388…545，只有东街东头一个口子）
  plan.Add("z", V.box.minX, ST.main.from, 545, V.wallH, "VillageWestEdge");
  plan.Add("z", 232, 388, 545, V.wallH, "VillageEastEdge");
  plan.Cut("z", 232, E3.c - E3.halfW, E3.c + E3.halfW);
  // 南墙 z 545（只有村南口一个口子）、北墙 z 385（夹道口、主街口、路沟后门）与东北角的北墙 z 388
  plan.Add("x", 545, V.box.minX, 232, V.wallH, "VillageSouthEdge");
  plan.Cut("x", 545, ST.backLane.c - ST.backLane.halfW, ST.backLane.c + ST.backLane.halfW);
  plan.Add("x", ST.main.from, V.box.minX, 118.25, V.wallH, "VillageNorthEdge");
  plan.Cut("x", ST.main.from, ST.alleyNorth.c - ST.alleyNorth.halfW, ST.alleyNorth.c + ST.alleyNorth.halfW);
  plan.Cut("x", ST.main.from, ST.main.c - ST.main.halfW, ST.main.c + ST.main.halfW);
  plan.Add("x", 388, 118.25, 232, V.wallH, "VillageNorthEastEdge");
  // 丁字路口：西北角 / 东北角的墙由 WM3 / EM3 的缺角盖；东边 x 110 从东街南墙到老耿家北墙那 3 m 由 ES1 的西墙盖
  // 巷子北头夹道两边的墙从路沟南沿起；A1 到 A2 的拐角等都由院子表盖
  // 院子链上的三道砸得倒的门（EM3 南墙的院门洞已在院子表里开了洞）
  const NC = ES.northChain;
  // 路口东北角那院的南门（pocket 北门）：10-24 起随 EastGateBurst 倒——09-7 班长三人从院里撞开它冲进 pocket；10-3 北边院子链只剩另两道门要砸
  BreakableGate(gates, "PocketGateLeaf", "x", NC.pocketGate.z, NC.pocketGate.x, NC.pocketGate.w, SIG.eastGateBurst, 1);
  plan.Cut("z", NC.yard1Door.x, NC.yard1Door.z - NC.yard1Door.w / 2, NC.yard1Door.z + NC.yard1Door.w / 2);
  Lintel(blocks, "Yard1DoorLintel", "z", NC.yard1Door.x, NC.yard1Door.z - NC.yard1Door.w / 2, NC.yard1Door.z + NC.yard1Door.w / 2, V.doorTopH, V.wallH, sample);
  BreakableGate(gates, "Yard1GateLeaf", "z", NC.yard1Door.x, NC.yard1Door.z, NC.yard1Door.w, SIG.northYardGatesBroken, -1);
  plan.Cut("z", NC.farmyardDoor.x, NC.farmyardDoor.z - NC.farmyardDoor.w / 2, NC.farmyardDoor.z + NC.farmyardDoor.w / 2);
  Lintel(blocks, "FarmyardDoorLintel", "z", NC.farmyardDoor.x, NC.farmyardDoor.z - NC.farmyardDoor.w / 2, NC.farmyardDoor.z + NC.farmyardDoor.w / 2, V.doorTopH, V.wallH, sample);
  BreakableGate(gates, "FarmyardGateLeaf", "z", NC.farmyardDoor.x, NC.farmyardDoor.z, NC.farmyardDoor.w, SIG.northYardGatesBroken, -1);
  SouthLaneBlocks(plan, blocks, gates);
  EastYardBlocks(blocks);
  plan.Emit(blocks);
  // 庄子西墙 x 40 那一道（苇子洼那一段墙脚的地是 −0.9）：块显式给 y，顶在村里地面 +2.2、底到 −0.3，墙脚不悬空、也不矮一截
  for (const b of blocks) if (/^VillageWestEdge_/.test(b.id)) { b.h = R2(V.wallH + 0.6); b.y = R2(V.y + V.wallH - b.h / 2); }
  Shrine(blocks, sample);
  RubbleBlocks(blocks);
  FarmsteadBlocks(blocks, sample);
  OutsideBlocks(blocks, sample);
  // 零散的树（foliage 细块；石榴矮一点）；转过的院子里的树跟着院子转
  L0610_TREES.forEach((t, i) => {
    const y = t.yard && L0610_YARDS.find((q) => q.id === t.yard);
    const p = y ? YardTreeWorld(y, t) : { x: t.x, z: t.z };
    blocks.push(Block(`Tree_${String(i + 1).padStart(2, "0")}`, p.x, p.z, t.kind === "pomegranate" ? 0.3 : 0.42, t.kind === "pomegranate" ? 0.3 : 0.42, t.h, "foliage", { tree: t.kind }));
  });
  (L0610_EAST_ROAD.trees || []).forEach((t, i) => blocks.push(Block(`RoadTree_${i + 1}`, t.x, t.z, 0.42, 0.42, t.h, "foliage")));
  // 村南口外的大槐树（10-6「往那棵大槐树跑」）：树干粗一点、9 m 高，从窄胡同里望得见树冠
  const BL = L0610_PLACES.bigLocust;
  blocks.push(Block("BigLocust", BL.x, BL.z, 0.8, 0.8, BL.h, "foliage", { tree: "locust" }));
  return { blocks, gates };
}

/** 日常摆件 → 体块（含 06 干沟里的血迹 / 绷带 / 水壶；翻倒的大车的车轮用显式 y 立在车身上）。 */
export function PropBlocks(sample) {
  const out = [];
  for (const p of L0610_PROPS) {
    const k = L0610_PROP_KINDS[p.kind];
    const extra = { ry: Math.round(p.ry * 1000) / 1000, prop: p.kind };
    if (p.kind === "CartWheel") {
      const body = L0610_PROP_KINDS.OverturnedCart;
      extra.y = R2(sample(p.x, p.z) + body.h + k.h / 2);
    }
    out.push(Block(p.id, p.x, p.z, k.w, k.d, k.h, k.semantic, extra));
  }
  return out;
}

function CartBoxes(sample) {
  const c = L0610_PLACES.cartStop, k = L0610_PROP_KINDS.AmmoBox;
  const top = sample(c.x, c.z) + 0.75 + 0.55 / 2;
  return [[-0.6, -0.3], [-0.6, 0.35], [0.3, 0.0]].map(([dx, dz], i) =>
    Block(`CartAmmoBox${i + 1}`, c.x + dx, c.z + dz, k.w, k.d, k.h, k.semantic, { y: R2(top + k.h / 2), prop: "AmmoBox", signal: SIG.cartDeparted }));
}

/** 全部体块与随信号体块。 */
export function L0610Blocks(sample) {
  const village = VillageBlocks(sample);
  const blocks = [...village.blocks, ...PropBlocks(sample)];
  const gates = [...village.gates, ...CartBoxes(sample)];
  L0610_FROM_0105.gullyTrees.forEach((t, i) => blocks.push(Block(`DeadTree_${String(i + 1).padStart(2, "0")}`, t.x, t.z, 0.42, 0.42, t.h, "foliage")));
  const RL = ES.roller;
  blocks.push(Block("RollerBase", RL.x, RL.z, RL.baseW, RL.baseW, RL.baseH, BRICK));
  blocks.push(Block("Roller", RL.x, RL.z, RL.w, RL.d, RL.h, BRICK, { y: R2(sample(RL.x, RL.z) + RL.baseH + RL.h / 2) }));
  blocks.push(...RiverWaterBlocks());
  return { blocks, gates };
}

// ---------------------------------------------------------------------------
// 地标（§2.2 landmarks）：白盒灰里看不清的特殊地方，编辑器画亮色线框 + 光柱 + 标签。坐标一律取锚点表的常量。

export function L0610Landmarks(sample) {
  const PL = L0610_PLACES, BW = G.beiwu, K = G.zaowu, C = G.box, NC = ES.northChain, PK = L0610_PROP_KINDS, LH = V.loophole;
  const L = (id, name, kind, x, z, extra = {}) => ({ id, name, kind, x: R2(x), z: R2(z), ...extra });
  const Size = (w, d, h) => ({ w: R2(w), d: R2(d), h: R2(h) });
  const DoorX = (w) => Size(w, T, V.doorTopH);
  const DoorZ = (w) => Size(T, w, V.doorTopH);
  const Area = (box) => ({ x: R2((box.minX + box.maxX) / 2), z: R2((box.minZ + box.maxZ) / 2), w: R2(box.maxX - box.minX), d: R2(box.maxZ - box.minZ) });
  const Run = (r) => (r.axis === "z" ? { x: r.c, z: (r.from + r.to) / 2, w: r.halfW * 2, d: r.to - r.from } : { x: (r.from + r.to) / 2, z: r.c, w: r.to - r.from, d: r.halfW * 2 });
  const sq = Area(ST.square.box), pk = Area(ST.pocket.box), fy = Area({ minX: ES.farmyard.minX, maxX: ES.farmyard.maxX, minZ: 440, maxZ: ST.east.c - ST.east.halfW });
  const shooters = L0610_MOUTH_SHOOTERS;
  const shX = (shooters[0].x + shooters[shooters.length - 1].x) / 2, shZ = shooters.reduce((s, p) => s + p.z, 0) / shooters.length;
  const cart = PK.OverturnedCart, straw = ES.strawStack, shrine = ES.shrine, M = J.mill, RL = ES.roller, WW = J.westWing;
  const cellarY = R2(sample(J.cellar.x + 3, J.cellar.z) - J.cellar.depth / 2);
  const Loophole = (lp) => L(`LmLoophole_${lp.who}`, lp.name, "window", lp.x, lp.z, { ...Size(LH.w, T, LH.topH - LH.sillH), y: R2(sample(lp.x, lp.z) + (LH.sillH + LH.topH) / 2), note: lp.who === "mg" ? "机枪搬到这里；08 四人趴街口压它" : "步枪枪眼" });
  const out = [
    L("LmGully", "干沟（集结处）", "area", PL.assembly.x, PL.assembly.z, { radiusM: 9, note: "06 回到这里" }),
    L("LmCartStop", PL.cartStop.name, "place", PL.cartStop.x, PL.cartStop.z, { radiusM: 2.2 }),
    L("LmNierRim", PL.nierRim.name, "place", PL.nierRim.x, PL.nierRim.z),
    L("LmLaneHead", "凹路口", "place", PL.laneHead.x, PL.laneHead.z, { radiusM: 2.5 }),
    L("LmLaneEnd", PL.laneEnd.name, "place", PL.laneEnd.x, PL.laneEnd.z),
    L("LmDitch", DT.name, "area", (DT.fromX + DT.toX) / 2, DT.z, { w: DT.toX - DT.fromX, d: DT.floorW + 2 * DT.wallM, note: "沟底 −0.9" }),
    L("LmDitchEast", PL.ditchEast.name, "place", PL.ditchEast.x, PL.ditchEast.z, { radiusM: 6 }),
    L("LmMouthShooters", "街口坡道射击位", "place", shX, shZ, { w: shooters[shooters.length - 1].x - shooters[0].x + 1.4, d: 1.2, h: 0.5, note: "08 四人趴这里压堂屋枪眼" }),
    L("LmVillageMouth", PL.villageMouth.name, "place", PL.villageMouth.x, PL.villageMouth.z),
    L("LmAlleyMouth", PL.alleyMouth.name, "place", PL.alleyMouth.x, PL.alleyMouth.z, { radiusM: 1.5 }),
    // 街巷
    L("LmMainStreet", ST.main.name, "area", Run(ST.main).x, Run(ST.main).z, { w: Run(ST.main).w, d: Run(ST.main).d }),
    L("LmSquare", ST.square.name, "area", sq.x, sq.z, { w: sq.w, d: sq.d }),
    L("LmPocket", ST.pocket.name, "area", pk.x, pk.z, { w: pk.w, d: pk.d, note: "10-4 鬼子从这院门钻出来" }),
    L("LmEastStreet", ST.east.name, "area", Run(ST.east).x, Run(ST.east).z, { w: Run(ST.east).w, d: Run(ST.east).d }),
    L("LmEastJog1", PL.eastJog1.name, "place", PL.eastJog1.x, PL.eastJog1.z, { note: "石碾后看到这里为止" }),
    L("LmEastJog2", PL.eastJog2.name, "place", PL.eastJog2.x, PL.eastJog2.z),
    L("LmL4", ST.l4.name, "area", Run(ST.l4).x, Run(ST.l4).z, { w: Run(ST.l4).w, d: Run(ST.l4).d, note: "东头通路口，不堵" }),
    L("LmCart", PL.cart.name, "prop", PL.cart.x, PL.cart.z, { ...Size(cart.d, cart.w, cart.h), note: "08-3 班长四人躲它北头" }),
    // 顺子和妮儿那条路
    ...L0610_ROUTE.segments.map((s, i) => L(`LmRoute_${s.seg}`, `唯一的路·第 ${i + 1} 段 ${s.seg}`, "place", s.line[0].x, s.line[0].z, { radiusM: 1.2, note: s.name })),
    L("LmJiefangGate", PL.jiefangGate.name, "door", J.gate.x, J.box.maxZ, { ...DoorX(J.gate.w), note: "09 从门缝瞥见院里" }),
    L("LmJiefangBreach", PL.jiefangBreach.name, "hole", WW.box.minX, (WW.breach.z + WW.breach.zTo) / 2, { ...Size(T + 0.2, WW.breach.zTo - WW.breach.z, WW.roofH), note: "09 从这里钻进西配房" }),
    L("LmJiefangWindow", PL.jiefangWindow.name, "window", WW.box.maxX, WW.window.z, { ...Size(T, WW.window.w, WW.window.topH - WW.window.sillH), y: R2(sample(WW.box.maxX, WW.window.z) + (WW.window.sillH + WW.window.topH) / 2), note: "从窗洞看窖口（9.7 m）和石磨" }),
    L("LmJiefangVat", PL.jiefangVat.name, "prop", WW.vat.x, WW.vat.z, { ...Size(0.9, 0.9, 1.0), note: "藏人的大缸" }),
    L("LmJiefangBeiwuDoor", PL.jiefangBeiwuDoor.name, "door", J.beiwu.door.x, J.beiwu.box.maxZ, { ...DoorX(J.beiwu.door.w), note: "媳妇被拖进去" }),
    L("LmCellar", PL.cellar.name, "pit", J.cellar.x, J.cellar.z, { ...Size(J.cellar.floorW, J.cellar.floorW, J.cellar.depth), y: cellarY, note: "深 2 m，一家人藏在里头" }),
    L("LmMill", PL.mill.name, "prop", M.x, M.z, { ...Size(M.baseW, M.baseW, M.baseH + M.stoneH), note: "绑着老汉" }),
    L("LmBenjiaGate", PL.benjiaGate.name, "door", B.gate.x, B.box.maxZ, DoorX(B.gate.w)),
    L("LmDogHole", PL.dogHole.name, "hole", C.minX, G.dogHole.z, { ...Size(T + 0.2, G.dogHole.w, G.dogHole.h), note: `${G.dogHole.w} m 宽、${G.dogHole.h} m 高，大人钻不过` }),
    L("LmSideGate", PL.sideGate.name, "door", C.minX, G.sideGate.z, { ...Size(T, G.sideGate.w, 2.0), note: "老耿家那边闩着；SideGateOpen 开" }),
    // 老耿家
    ...BW.loopholes.map(Loophole),
    L("LmTangwuDoor", PL.tangwuDoor.name, "door", BW.tangwuDoor.x, BW.box.maxZ, DoorX(BW.tangwuDoor.w)),
    L("LmKitchenDoor", PL.kitchenDoor.name, "door", K.box.maxX, K.door.z, { ...DoorZ(K.door.w), note: "顺子那条路的终点" }),
    L("LmGengGate", PL.gengGate.name, "door", C.maxX, G.gate.z, { ...DoorZ(G.gate.w), note: "东南角、朝东墙外的窄胡同" }),
    L("LmGengHaystack", "柴垛（老耿家）", "prop", G.haystack.x, G.haystack.z, Size(G.haystack.w, G.haystack.d, G.haystack.h)),
    L("LmGengCollapse", "北屋东间（炮轰塌下）", "area", (BW.collapseFromX + BW.box.maxX) / 2, (BW.box.minZ + BW.box.maxZ) / 2, { w: BW.box.maxX - BW.collapseFromX, d: BW.box.maxZ - BW.box.minZ, note: "BarrageHit 起塌一块" }),
    // 窄胡同
    L("LmSouthLane", SLN.name, "area", Run(ST.southLane3).x, Run(ST.southLane3).z, { w: Run(ST.southLane3).w, d: Run(ST.southLane3).d, note: "丁字路口到村南口只有这一条" }),
    L("LmLaneCollapse", PL.laneCollapse.name, "place", PL.laneCollapse.x, PL.laneCollapse.z, { radiusM: 1.6, note: "LaneWallCollapse：西墙倒进胡同" }),
    L("LmClimbPile", PL.climbPile.name, "prop", SLN.climb.pile.x, SLN.climb.pile.z, { ...Size(SLN.climb.pile.w, SLN.climb.pile.d, SLN.climb.pile.h), note: "踩着翻进旁边院子" }),
    L("LmDetourGate", PL.detourGate.name, "door", 114.5, 518, { ...DoorZ(1.2), note: "翻墙绕路的出口" }),
    L("LmVillageSouth", PL.villageSouth.name, "place", PL.villageSouth.x, PL.villageSouth.z, { radiusM: 2.5, note: "11 从这里出村" }),
    // 东街
    L("LmRoller", RL.name, "prop", RL.x, RL.z, { ...Size(RL.baseW, RL.baseW, RL.baseH + RL.h), note: "10-2 趴它后头顺东街打" }),
    L("LmFarmyard", ES.farmyard.name, "area", fy.x, fy.z, { w: fy.w, d: fy.d }),
    L("LmStrawStack", straw.name, "prop", straw.x, straw.z, { ...Size(straw.w, straw.d, straw.h), note: "10-3 掷弹筒组躲北侧" }),
    L("LmShrine", shrine.name, "prop", shrine.x, shrine.z, { ...Size(shrine.w, shrine.d, shrine.h), note: "10-2 轻机枪缩在它东边" }),
    ...ES.probes.filter((p) => p.kind !== "shrine").map((p) => L(`LmProbe_${p.id}`, `探头·${p.id}`, p.kind === "door" ? "door" : "window", p.x, p.z, { note: p.note, ...(p.kind === "door" ? DoorX(1.5) : p.kind === "breach" ? { ...Size(1.2, T, 1.5), y: R2(sample(p.x, p.z) + 1.25) } : { ...Size(T, LH.w, LH.topH - LH.sillH), y: R2(sample(p.x, p.z) + 1.1) }) })),
    L("LmNorthGate1", "院门①（场院西隔墙）", "door", NC.farmyardDoor.x, NC.farmyardDoor.z, { ...DoorZ(NC.farmyardDoor.w), note: "10-4 砸开" }),
    L("LmNorthGate2", "院门②（北侧第一个院西墙）", "door", NC.yard1Door.x, NC.yard1Door.z, { ...DoorZ(NC.yard1Door.w), note: "10-4 砸开" }),
    L("LmNorthGate3", "院门③（路口东北角那院南墙）", "door", NC.pocketGate.x, NC.pocketGate.z, { ...DoorX(NC.pocketGate.w), note: "09-6 班长三人蹲在门后、09-7 撞开（EastGateBurst）；就在石碾西北背后" }),
    L("LmEastClimbPile", PL.eastClimb.name, "prop", EYR.climb.pile.x, EYR.climb.pile.z, { ...Size(EYR.climb.pile.w, EYR.climb.pile.d, EYR.climb.pile.h), note: "09-4 班长三人踩着翻 z 435 那道墙（人梯）" }),
    L("LmSouthClimb", PL.southClimb.name, "place", ES.southClimb.x, ES.southClimb.z, { ...Size(3, T, V.wallH), note: "10-5 南边两个鬼子翻这段墙" }),
    L("LmMortarHide", "掷弹筒藏处", "place", ES.mortarHide.x, ES.mortarHide.z, { radiusM: 1.8 }),
    L("LmEastEnd", PL.eastEnd.name, "place", PL.eastEnd.x, PL.eastEnd.z, { radiusM: 2 }),
    L("LmEastRoadView", PL.eastRoadView.name, "place", PL.eastRoadView.x, PL.eastRoadView.z, { radiusM: 6, note: "鬼子顺这条道进庄；07 末 / 08 看得见" }),
    L("LmAlleyBackGate", PL.alleyBackGate.name, "door", PL.alleyBackGate.x, PL.alleyBackGate.z, { ...DoorZ(1.2), note: "08-1 村民顺巷子逃到巷子口；没门扇" }),
    L("LmDitchBackGate", PL.ditchBackGate.name, "door", PL.ditchBackGate.x, PL.ditchBackGate.z, { ...DoorX(V.gateW), note: "08-1 两个村民下到沟东半截；没门扇" }),
    L("LmMainEastGate", PL.mainEastGate.name, "door", PL.mainEastGate.x, PL.mainEastGate.z, { ...DoorZ(V.gateW), note: "08-1 两个村民冲上主街被打倒；08-4 末班长三人从这里钻进院子（在大车的影子里）" }),
    ...L0610_RUBBLE.map((r) => L(`Lm${r.id}`, r.name, "prop", r.x, r.z, { ...Size(r.w, r.d, r.h), ry: r.ry })),
    L("LmBigLocust", PL.bigLocust.name, "prop", PL.bigLocust.x, PL.bigLocust.z, { ...Size(0.8, 0.8, PL.bigLocust.h), note: "10-6「过了槐树就是村口」" }),
    L("LmPond", PL.pond.name, "pit", POND.x, POND.z, { ...Size(POND.w, POND.d, POND.depth), y: R2(POND_FLOOR_Y + POND.depth / 2), note: "取土坑积的水；1949 年前多数人喝河、坑、沟水" }),
    L("LmRiver", RV.name, "area", RV.centerX, (RV.fromZ + L0610_BOUNDS.maxZ) / 2, { w: RV.floorW + 2 * RV.wallM, d: L0610_BOUNDS.maxZ - RV.fromZ, note: "弯河（第八版）；车下不去；沟底齐腰深的水，抬伤号过不去" }),
    // 第八版
    L("LmTemple", PL.temple.name, "area", PL.temple.x, PL.temple.z, { w: 24, d: 22, note: "主街西边那院改的；北边三间正殿、殿里课桌（村塾）" }),
    L("LmShop", PL.shop.name, "prop", PL.shop.x, PL.shop.z, { ...Size(4, 7, 3), note: "EM1 临街一间：门板窗、柜台" }),
    L("LmFieldShrine", PL.fieldShrine.name, "prop", PL.fieldShrine.x, PL.fieldShrine.z, { ...Size(L0610_FIELD_SHRINE.w, L0610_FIELD_SHRINE.d, L0610_FIELD_SHRINE.wallH), ry: L0610_FIELD_SHRINE.ry, note: "东北大道边、离庄子七八十米" }),
    L("LmWatchTower", PL.watchTower.name, "prop", PL.watchTower.x, PL.watchTower.z, { ...Size(L0610_WATCHTOWER.w, L0610_WATCHTOWER.d, L0610_WATCHTOWER.h), note: "庄子东北角大户院子角上，5×5、7.5 高" }),
    ...L0610_WELLS.map((w) => L(`Lm${w.id}`, w.name, "prop", w.x, w.z, Size(1.2, 1.2, w.rimH))),
    L("LmMarsh", PL.marsh.name, "area", PL.marsh.x, PL.marsh.z, { w: 14, d: 84, note: "河弯离开庄子西墙那一段：烂泥 −0.9，走不了人" }),
    L("LmTributary", PL.tributary.name, "place", PL.tributary.x, PL.tributary.z, { radiusM: 4, note: "河西一条小沟汇进河汊子（两股并一股）" }),
    L("LmGengGrove", PL.gengGrove.name, "area", PL.gengGrove.x, PL.gengGrove.z, { w: 30, d: 20, note: "耿家的坟地（松柏）；林外两座小坟" }),
    L("LmWangGrove", PL.wangGrove.name, "area", PL.wangGrove.x, PL.wangGrove.z, { w: 18, d: 12 }),
    L("LmYiGrove", PL.yiGrove.name, "area", PL.yiGrove.x, PL.yiGrove.z, { w: 16, d: 11, note: "外乡人埋这里：杂树、小坟、没字的木牌" }),
    L("LmThreshing1", PL.threshing1.name, "area", PL.threshing1.x, PL.threshing1.z, { w: 22, d: 13, note: "麦秸垛、石磙" }),
    L("LmThreshing2", PL.threshing2.name, "area", PL.threshing2.x, PL.threshing2.z, { w: 20, d: 14 }),
    L("LmPostRoad", PL.postRoad.name, "place", PL.postRoad.x, PL.postRoad.z, { radiusM: 4, note: "北通界河，南接东北大道" }),
    L("LmEastVillageRoad", PL.eastVillageRoad.name, "place", PL.eastVillageRoad.x, PL.eastVillageRoad.z, { radiusM: 4 }),
    L("LmOuterPond", PL.outerPond.name, "pit", PL.outerPond.x, PL.outerPond.z, { ...Size(L0610_OUTER_POND.rx * 2, L0610_OUTER_POND.rz * 2, L0610_OUTER_POND.depth), y: R2(OUTER_POND_FLOOR_Y + L0610_OUTER_POND.depth / 2) }),
    ...L0610_FARMSTEADS.map((f) => L(`Lm${f.id}`, f.name, "area", f.x, f.z, { w: f.w, d: f.d, ry: f.ry })),
  ];
  return out;
}

// ---------------------------------------------------------------------------
// 核对

export function SolidBlocks(scene, signals = []) {
  const on = new Set(signals);
  const out = scene.blocks.filter((b) => b.solid !== false && b.semantic !== "water");
  for (const g of scene.gates || []) {
    const absent = (g.signal && on.has(g.signal)) || (g.appearSignal && !on.has(g.appearSignal));
    if (!absent && g.solid !== false) out.push(g);
  }
  return out;
}

export function BlockCenterY(b, sample) {
  if (Number.isFinite(b.y)) return b.y;
  const ry = b.ry || 0, c = Math.cos(ry), s = Math.sin(ry), hx = b.w / 2, hz = b.d / 2;
  let lowest = sample(b.x, b.z);
  for (const [lx, lz] of [[-hx, -hz], [hx, -hz], [-hx, hz], [hx, hz]]) lowest = Math.min(lowest, sample(b.x + lx * c + lz * s, b.z - lx * s + lz * c));
  return lowest + b.h / 2;
}

export function BlockSight(blocks, sample, a, b) {
  const ay = sample(a.x, a.z) + a.eye, by = sample(b.x, b.z) + b.eye;
  let best = null;
  for (const blk of blocks) {
    const cy = BlockCenterY(blk, sample);
    const ry = blk.ry || 0, c = Math.cos(ry), s = Math.sin(ry);
    const L = (x, z) => ({ lx: (x - blk.x) * c - (z - blk.z) * s, lz: (x - blk.x) * s + (z - blk.z) * c });
    const p0 = L(a.x, a.z), p1 = L(b.x, b.z);
    let t0 = 0, t1 = 1;
    for (const [q0, q1, half] of [[p0.lx, p1.lx, blk.w / 2], [p0.lz, p1.lz, blk.d / 2], [ay - cy, by - cy, blk.h / 2]]) {
      const dq = q1 - q0;
      if (Math.abs(dq) < 1e-9) { if (Math.abs(q0) > half) { t0 = 1; t1 = 0; break; } continue; }
      let ta = (-half - q0) / dq, tb = (half - q0) / dq;
      if (ta > tb) [ta, tb] = [tb, ta];
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
      if (t0 > t1) break;
    }
    if (t0 <= t1 && t0 < 1 && t1 > 0 && (!best || t0 < best.t)) best = { t: t0, block: blk };
  }
  return best ? best.block : null;
}

/** 从一个洞口（墙上的点）往某个目标看时眼睛该站在哪：洞口中心往后退 back 米、对着目标。 */
export function HoleEye(hole, target, back, eyeH) {
  const d = Math.hypot(target.x - hole.x, target.z - hole.z);
  return { x: hole.x - back * (target.x - hole.x) / d, z: hole.z - back * (target.z - hole.z) / d, eye: eyeH };
}

/** 测试与 notes 共用的几条视线。 */
export function L0610SightChecks(scene, sample) {
  const RL = ES.roller, BW = G.beiwu, WW = J.westWing;
  const base = SolidBlocks(scene, []);
  const mgLp = BW.loopholes.find((lp) => lp.who === "mg");
  const mgEye = { x: G.mgPost.x, z: G.mgPost.z, eye: 1.1 };
  const loophole = { x: mgLp.x, z: mgLp.z, eye: mgLp.h };
  // ① 街口坡道上趴着的四个人（0.5）→ 堂屋枪眼（离地 1.1）：块与地面都不能挡
  const shooters = L0610_MOUTH_SHOOTERS.map((p) => ({ ...p, eye: 0.5 }));
  const shooterToLoophole = shooters.map((p) => ({ at: p, block: BlockSight(base, sample, p, loophole)?.id ?? null, ground: SightBlock(sample, p, loophole).block }));
  // ② 枪眼后的机枪手（1.1，就是枪眼的高度）顺主街看到村北口站着的人（1.6）；反过来村口蹲着（1.2）→ 枪眼
  const mouth = { x: L0610_PLACES.villageMouth.x, z: L0610_PLACES.villageMouth.z, eye: 1.6 };
  const loopholeToMouth = BlockSight(base, sample, mgEye, mouth)?.id ?? null;
  const mouthToLoophole = BlockSight(base, sample, { ...mouth, eye: 1.2 }, loophole)?.id ?? null;
  const loopholeGround = SightBlock(sample, mgEye, mouth).block;
  // ③ 枪眼后的机枪（1.1）→ 巷子口与巷子各段（跑的人 1.0 / 蹲的人 0.9）：都得被挡
  const alleyPoints = [
    { name: "巷子口", x: ST.alleyNorth.c, z: L0610_PLACES.alleyMouth.z, eye: 1.0 },
    { name: "夹道中段", x: ST.alleyNorth.c, z: 391, eye: 1.0 },
    { name: "夹道南头", x: ST.alleyNorth.c, z: ST.alleyA2.c, eye: 1.0 },
    { name: "第一道弯", x: ST.alleyA3.c, z: ST.alleyA2.c, eye: 1.0 },
    { name: "往南那截", x: ST.alleyA3.c, z: 412, eye: 0.9 },
    { name: "窄夹道", x: ST.alleyA5.c, z: 440, eye: 0.9 },
    { name: "街坊家门口", x: J.gate.x, z: ST.l4.c, eye: 0.9 },
  ];
  const loopholeToAlley = alleyPoints.map((p) => ({ name: p.name, block: BlockSight(base, sample, mgEye, p)?.id ?? null, ground: SightBlock(sample, mgEye, p).block }));
  // ④ 枪眼后的机枪（1.1）→ 翻倒的大车北头蹲着的人（0.9）：要被大车挡住
  const cart = L0610_PLACES.cart;
  const behindCart = { x: cart.x, z: cart.z - 1.9, eye: 0.9 };
  const loopholeToCartHide = BlockSight(base, sample, mgEye, behindCart)?.id ?? null;
  // ⑤ 街坊家：窗洞后 0.6 m 的眼睛（蹲着 1.3）→ 窖口（1.0）与石磨上的人（1.0）；门缝（半掩的门）→ 窖口；豁口外（夹道里）看不见窖口（得钻进去才看得见）
  const windowHole = { x: WW.box.maxX, z: WW.window.z };
  const cellarT = { x: J.cellar.x, z: J.cellar.z, eye: 1.0 }, millT = { x: J.mill.x, z: J.mill.z, eye: 1.0 };
  const eyeWindowCellar = HoleEye(windowHole, cellarT, WW.eyeBackM, 1.3), eyeWindowMill = HoleEye(windowHole, millT, WW.eyeBackM, 1.3);
  const windowToCellar = BlockSight(base, sample, eyeWindowCellar, cellarT)?.id ?? null;
  const windowToMill = BlockSight(base, sample, eyeWindowMill, millT)?.id ?? null;
  const gateHole = { x: J.gate.x + 0.35, z: J.box.maxZ };   // 半掩的门：门扇挂在西边，东半边的门洞敞着
  const eyeGate = HoleEye(gateHole, cellarT, 1.0, 1.5);
  const gateToCellar = BlockSight(base, sample, eyeGate, cellarT)?.id ?? null;
  const gateToBeiwuDoor = BlockSight(base, sample, eyeGate, { x: J.beiwu.door.x, z: J.beiwu.box.maxZ + 0.6, eye: 1.0 })?.id ?? null;
  const laneEye = { x: ST.alleyA5.c, z: 450, eye: 1.5 };
  const laneToCellar = BlockSight(base, sample, laneEye, cellarT)?.id ?? null;
  // 关键帧 09-2 的站点（L0610_JIEFANG.glimpse，站着 1.5）斜着从门洞里看窖口：门扇 / 南屋都不许挡
  const glimpseEye = { x: J.glimpse.x, z: J.glimpse.z, eye: 1.5 };
  const glimpseToCellar = BlockSight(base, sample, glimpseEye, cellarT)?.id ?? null;
  // 窄胡同里望大槐树树冠（离地 8 m）：拐进出村那截以后 (117,523) 与 (117,532)，蹲着 1.2；院墙不挡
  //（塌墙那截 x 113.25 里 2.2 m 的墙贴着脸，37 m 外的树冠要仰 10° 以上才露头，从那里看不见，拐过第三道弯才看得见）
  const BL = L0610_PLACES.bigLocust;
  const laneToLocust = [{ x: ST.backLane.c, z: 523, eye: 1.2 }, { x: ST.backLane.c, z: 532, eye: 1.2 }].map((e) => BlockSight(base, sample, e, { x: BL.x - 0.7, z: BL.z - 0.3, eye: 8.0 })?.id ?? null);   // 看树冠西沿，别打在树干块里
  // ⑥ 石碾后趴着（0.5）→ 东街里每个探头点（门洞里 / 枪眼后 / 庙后 / 垛前的人 1.0；枪眼目标取枪眼高度）
  const prone = { x: RL.x - 2.2, z: RL.z + 0.9, eye: 0.5 };
  // 探头点的目标：门洞 / 豁口 = 从里头探到街上半步的人（1.0）；枪眼 = 洞本身（离地 1.1）；庙 = 庙身（视线该落在庙上）
  const streetZ = (p) => (p.z < 461 ? ST.east2.c : ST.east.c);
  const probes = ES.probes.map((p) => {
    const t = p.kind === "loophole" ? { x: p.x, z: p.z, eye: p.h } : p.kind === "shrine" ? { x: p.x, z: p.z, eye: 1.0 } : { x: p.x, z: p.z + Math.sign(streetZ(p) - p.z) * 0.85, eye: 1.0 };
    const dist = Math.hypot(p.x - RL.x, p.z - RL.z), deg = Math.atan2(p.z - RL.z, p.x - RL.x) * 180 / Math.PI;
    return { id: p.id, kind: p.kind, hidden: !!p.hidden, dist: R2(dist), deg: R2(deg), target: t, block: BlockSight(SolidBlocks(scene, [SIG.mgSilenced]), sample, prone, t)?.id ?? null, ground: SightBlock(sample, prone, t).block };
  });
  // 庙东北边的轻机枪（0.8）→ 石碾后趴着的人（0.5）：庙不许挡它
  const mgHideToRoller = BlockSight(SolidBlocks(scene, [SIG.mgSilenced]), sample, { x: ES.mgHide.x, z: ES.mgHide.z, eye: 0.8 }, prone)?.id ?? null;
  const jogWall = { x: ST.eastJog1.c + ST.eastJog1.halfW - 0.3, z: 464.5, eye: 1.0 };   // 贴着第一道弯正面墙站着的人
  const rollerToJog = BlockSight(SolidBlocks(scene, [SIG.mgSilenced]), sample, prone, jogWall)?.id ?? null;
  // ⑦ 东北进庄的道（第五版）：凹路尽头蹲着（1.05）与街口坡道上趴着的顺子（0.32）→ 道上 x 274…290 那一段 1.5 m 高的人
  const laneMouth = { ...LanePointAtZ(366), eye: 1.05 };
  const proneShooter = { ...L0610_MOUTH_SHOOTERS[0], eye: 0.32 };
  const eastRoadTargets = EastRoadViewPoints().map((p) => ({ ...p, eye: 1.5 }));
  const eastRoad = { laneMouth: [], ramp: [] };
  for (const t of eastRoadTargets) {
    eastRoad.laneMouth.push({ at: t, block: BlockSight(base, sample, laneMouth, t)?.id ?? null, ground: SightBlock(sample, laneMouth, t).block });
    eastRoad.ramp.push({ at: t, block: BlockSight(base, sample, proneShooter, t)?.id ?? null, ground: SightBlock(sample, proneShooter, t).block });
  }
  return {
    shooterToLoophole, loopholeToMouth, mouthToLoophole, loopholeGround, loopholeToAlley, loopholeToCartHide,
    windowToCellar, windowToMill, gateToCellar, gateToBeiwuDoor, laneToCellar, glimpseToCellar, laneToLocust, probes, rollerToJog, mgHideToRoller, eastRoad,
    eyes: { windowCellar: eyeWindowCellar, windowMill: eyeWindowMill, gate: eyeGate, prone, behindCart, laneMouth, proneShooter, laneEye },
  };
}

export function EastRoadViewPoints() {
  const line = ER.line, out = [{ x: L0610_PLACES.eastRoadView.x, z: L0610_PLACES.eastRoadView.z }];
  for (let x = ER.viewFromX; x <= ER.viewToX + 1e-6; x += 3) {
    for (let i = 1; i < line.length; i++) {
      const a = line[i - 1], b = line[i];
      if ((x - a.x) * (x - b.x) <= 0 && b.x !== a.x) { out.push({ x: R2(x), z: R2(a.z + (b.z - a.z) * (x - a.x) / (b.x - a.x)) }); break; }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// 可走格子与泛洪（SceneTest 的「只有一条路」用）：0.25 m 一格，人按 0.3 m 半径算；
// 挡人的块：实心、高 ≥ stepH（0.55，矮篱 0.5 / 矮瓦砾 0.45 跨得过）、下沿低于头顶 1.8（门洞过梁不挡、狗洞过梁挡）；
// 坑（地面比村里低 0.8 以上）也算不能走（掉得下去爬不上来）。

export function WalkGrid(scene, sample, signals = [], { box = { minX: 40, maxX: 232, minZ: 383, maxZ: 548 }, cell = 0.25, radius = 0.3, stepH = 0.55, headH = 1.8 } = {}) {
  const cols = Math.round((box.maxX - box.minX) / cell), rows = Math.round((box.maxZ - box.minZ) / cell);
  const walk = new Uint8Array(cols * rows).fill(1);
  const X = (ix) => box.minX + (ix + 0.5) * cell, Z = (iz) => box.minZ + (iz + 0.5) * cell;
  for (let iz = 0; iz < rows; iz++) for (let ix = 0; ix < cols; ix++) {
    if (sample(X(ix), Z(iz)) < V.y - 0.8) walk[iz * cols + ix] = 0;
  }
  for (const b of SolidBlocks(scene, signals)) {
    if (b.h < stepH) continue;
    const cy = BlockCenterY(b, sample);
    const bottom = cy - b.h / 2 - sample(b.x, b.z);
    if (bottom >= headH) continue;
    const ry = b.ry || 0, c = Math.cos(ry), s = Math.sin(ry), hw = b.w / 2 + radius, hd = b.d / 2 + radius;
    const reach = Math.hypot(hw, hd);
    const ix0 = Math.max(0, Math.floor((b.x - reach - box.minX) / cell)), ix1 = Math.min(cols - 1, Math.ceil((b.x + reach - box.minX) / cell));
    const iz0 = Math.max(0, Math.floor((b.z - reach - box.minZ) / cell)), iz1 = Math.min(rows - 1, Math.ceil((b.z + reach - box.minZ) / cell));
    for (let iz = iz0; iz <= iz1; iz++) for (let ix = ix0; ix <= ix1; ix++) {
      const dx = X(ix) - b.x, dz = Z(iz) - b.z;
      const lx = dx * c - dz * s, lz = dx * s + dz * c;
      if (Math.abs(lx) <= hw && Math.abs(lz) <= hd) walk[iz * cols + ix] = 0;
    }
  }
  const Index = (x, z) => {
    const ix = Math.floor((x - box.minX) / cell), iz = Math.floor((z - box.minZ) / cell);
    return ix < 0 || iz < 0 || ix >= cols || iz >= rows ? -1 : iz * cols + ix;
  };
  return { box, cell, cols, rows, walk, Index, X, Z, At: (x, z) => { const i = Index(x, z); return i >= 0 && walk[i] === 1; } };
}

/**
 * 从 start 泛洪（四邻）。links：[{ from, to }] 额外的通路（翻柴垛）；barriers：[(x,z)=>bool] 不许进的格子（测试用来在 L4 东头截断）。
 * 返回 { reached: Uint8Array, Has(x,z), count }。
 */
export function FloodFrom(grid, start, { links = [], barriers = [] } = {}) {
  const { cols, rows, walk, Index } = grid;
  const reached = new Uint8Array(cols * rows);
  const Blocked = (i) => barriers.some((f) => f(grid.X(i % cols), grid.Z(Math.floor(i / cols))));
  const stack = [];
  const Seed = (x, z) => { const i = Index(x, z); if (i >= 0 && walk[i] && !reached[i] && !Blocked(i)) { reached[i] = 1; stack.push(i); } };
  Seed(start.x, start.z);
  while (stack.length) {
    const i = stack.pop();
    const ix = i % cols, iz = Math.floor(i / cols);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const jx = ix + dx, jz = iz + dz;
      if (jx < 0 || jz < 0 || jx >= cols || jz >= rows) continue;
      const j = jz * cols + jx;
      if (walk[j] && !reached[j] && !Blocked(j)) { reached[j] = 1; stack.push(j); }
    }
    for (const l of links) { const a = Index(l.from.x, l.from.z); if (a === i) Seed(l.to.x, l.to.z); }
  }
  let count = 0;
  for (const r of reached) count += r;
  return { reached, count, Has: (x, z) => { const i = Index(x, z); return i >= 0 && reached[i] === 1; } };
}

export function RiverEastLedgeAt(sample, z) {
  const wallFace = 40 - T / 2;
  let rim = wallFace;
  for (let x = RiverAtZ(z).x; x <= wallFace; x += 0.05) { if (sample(x, z) >= V.y - 0.3) { rim = x; break; } }
  return { rimX: R2(rim), ledgeW: R2(wallFace - rim) };
}
export function DitchSectionAt(sample, x) {
  const floor = sample(x, DT.z);
  let run = 0, best = 0;
  for (let z = DT.z - 6; z <= DT.z + 6; z += 0.1) { if (sample(x, z) <= floor + 0.15) { run += 0.1; best = Math.max(best, run); } else run = 0; }
  return { floor: R2(floor), north: R2(sample(x, DT.z - 6)), south: R2(sample(x, DT.z + 6)), floorW: R2(best) };
}
export function CompareWith0105(sample) {
  const url = new URL("./Blockout/FirstLevel0105.scene.json", import.meta.url);
  if (!fs.existsSync(url)) return null;
  const other = HeightGridSampler(JSON.parse(fs.readFileSync(url, "utf8")).terrain);
  let worst = 0, at = null, n = 0;
  for (let z = 121; z <= 190; z += 1.5) {
    for (let x = -18; x <= 150; x += 2) {
      const d = Math.abs(sample(x, z) - other(x, z));
      n++;
      if (d > worst) { worst = d; at = { x, z }; }
    }
  }
  return { worst: R2(worst), at, samples: n };
}
export function LaneDepthAt(sample, z) {
  const line = LANE.line;
  let cx = null;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1], b = line[i];
    if ((z - a.z) * (z - b.z) <= 0 && b.z !== a.z) { cx = a.x + (b.x - a.x) * (z - a.z) / (b.z - a.z); break; }
  }
  if (cx === null) return null;
  const floor = sample(cx, z), side = Math.max(sample(cx - 9, z), sample(cx + 9, z));
  return { x: R2(cx), floor: R2(floor), side: R2(side), depth: R2(side - floor) };
}
/** 河汊子横断面（第八版：按中线折线在 z 处的 x 量；东西 10 m 外的岸）。 */
export function RiverSectionAt(sample, z) {
  const cx = RiverAtZ(z).x;
  const floor = sample(cx, z);
  let run = 0, best = 0;
  for (let x = cx - 12; x <= cx + 12; x += 0.1) { if (sample(x, z) <= floor + 0.15) { run += 0.1; best = Math.max(best, run); } else run = 0; }
  // 西岸取中线外 13 m（凸岸泥滩最宽 11 m 多一点，岸要在泥滩外头量）；东岸 11 m（再远就进了村里的取土坑）
  return { x: R2(cx), floor: R2(floor), west: R2(sample(cx - 13, z)), east: R2(sample(cx + 11, z)), floorW: R2(best) };
}
/** 河汊子中线相邻两段的方向差（度）：天然的弯河该有好几处 ≥ 10°。 */
export function RiverBendAngles() {
  const line = RV.line, out = [];
  for (let i = 1; i < line.length - 1; i++) {
    const a = Math.atan2(line[i].x - line[i - 1].x, line[i].z - line[i - 1].z), b = Math.atan2(line[i + 1].x - line[i].x, line[i + 1].z - line[i].z);
    out.push({ z: line[i].z, deg: R2(Math.abs(((b - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * 180 / Math.PI) });
  }
  return out;
}
/** 折线胡同的拐角（度，0 = 直）与直段长：给门禁用。 */
export function LaneCorners() {
  const out = [];
  const Angle = (a, b, c) => { const u = Math.atan2(b.x - a.x, b.z - a.z), v = Math.atan2(c.x - b.x, c.z - b.z); return R2(Math.abs(((v - u + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * 180 / Math.PI); };
  for (const p of LANE_PATHS) for (let i = 1; i < p.line.length - 1; i++) out.push({ lane: p.id, x: p.line[i].x, z: p.line[i].z, deg: Angle(p.line[i - 1], p.line[i], p.line[i + 1]), locked: false });
  // 直胡同之间的拐角（轴对齐的 = 90°）：巷子 / L4 / 夹道 / 窄胡同 / 东街的弯
  const pairs = [["alleyNorth", "alleyA2"], ["alleyA2", "alleyA3"], ["alleyA3", "alleyA4"], ["alleyA4", "alleyA5"], ["alleyA5", "l4"], ["passage", "passageEnd"],
    ["southLane1", "southLane2"], ["southLane2", "southLane3"], ["southLane3", "southLane4"], ["southLane4", "backLane"], ["east", "eastJog1"], ["eastJog1", "east2"], ["east2", "eastJog2"], ["eastJog2", "east3"]];
  for (const [a, b] of pairs) out.push({ lane: `${a}+${b}`, deg: 90, locked: true });
  return out;
}
/** 胡同最长的直段（米）：直胡同按 from…to，折线按段。 */
export function LaneStraightRuns() {
  const out = STREET_RUNS.map((r) => ({ lane: r.id, len: R2(r.to - r.from) }));
  for (const p of LANE_PATHS) for (let i = 1; i < p.line.length; i++) out.push({ lane: `${p.id}#${i}`, len: R2(Math.hypot(p.line[i].x - p.line[i - 1].x, p.line[i].z - p.line[i - 1].z)) });
  return out;
}

// ---------------------------------------------------------------------------
// 场景

const Pts = (line) => line.map((p) => ({ x: p.x, z: p.z }));

export async function BuildFirstLevel0610Scene({ commit = "", generatedAt = "", notes = [] } = {}) {
  const { Ground } = L0610Ground();
  const { terrain, minM, maxM } = BakeL0610Grid(Ground);
  const sample = HeightGridSampler(terrain);
  const { blocks, gates } = L0610Blocks(sample);
  const landmarks = L0610Landmarks(sample);
  {
    const errors = [];
    LandmarkIssues(landmarks, errors);
    if (errors.length) throw new Error(`地标表有错：${errors.join("；")}`);
  }
  const scene = {
    schema: BLOCKOUT_SCENE_SCHEMA,
    level: L0610_LEVEL_KEY,
    source: {
      generator: L0610_SCENE_GENERATOR,
      generatedAt,
      commit,
      notes: `06–10 新剧本白盒（2026-10-24 第八版空间）：锚点 Data_EditorBlockoutFirstLevel0610Space；高度 ${L0610_CELL_M} m 网格（${minM}…${maxM} m）；`
        + "z<205 逐点等于 FirstLevel0105 的地面，往南：凹路南段（几道缓弯、两边坎高低不一）、村口路沟（西头通进河汊子）、河汊子（天然的弯河：凸岸泥滩、苇子洼、西来小沟；沟底 1 m 深的水）、"
        + "拼块的田（田埂烘进高度场）、林里的坟头、老驿道 / 往东邻庄的大道 / 田间小路、场院与独院压平、庄东北的取土坑；"
        + "耿家庄（整村压平 +0.3、胡同 / 街 / 路口压低 12 cm、街坊家的地瓜窖与村西的取土坑平底开挖）、东北进庄的道；"
        + `体块：按县志重摆的 ${L0610_YARDS.length + 3} 个院子（四合院 / 半面槽院 / 排房院混着、夹菜园空地与水坑；共墙只画一道），老耿家半面槽院（北屋三间空心、后墙三个枪眼、灶屋两间、东墙院门）、`
        + "街坊家（北屋空心、西配房塌掉的西北角 / 窗洞 / 大缸、地瓜窖、石磨、半掩的院门）、本家院（共用墙上的狗洞 / 便门）、拐四道弯的巷子与瓦砾堵死的岔路、"
        + "往南拐三道弯的窄胡同（塌墙处、柴垛、绕路院子）、拐两道弯的东街（门洞 / 枪眼 / 豁口 / 土地庙 / 麦秸垛）、各片错开的小巷与死胡同、塌了一角的房子、倒在胡同里的墙、菜园空宅基粪堆、零散的树、日常摆件、0105 的南岸枯树；"
        + "gates：CartDeparted / SideGateOpen / CellarBlast / EastGateBurst / MgSilenced / NorthYardGatesBroken / BarrageHit / LaneWallCollapse；"
        + `landmarks：${landmarks.length} 个地标。`,
    },
    bounds: { ...L0610_BOUNDS },
    spawn: { x: L0610_SPAWN.x, z: L0610_SPAWN.z, yawDeg: L0610_SPAWN.yawDeg },
    terrain,
    blocks,
    gates,
    landmarks,
    ways: {
      roads: [
        Pts(LANE.line),
        [{ x: ST.main.c, z: DT.z }, { x: ST.main.c, z: ST.square.box.maxZ }],
        Pts(ES.line),
        Pts(L0610_ROUTE.segments[0].line), Pts(L0610_ROUTE.segments[1].line),
        Pts(SLN.line),
        Pts(ER.line),
        ...L0610_ROADS.map((r) => Pts(r.line)),
        ...L0610_FOOTPATHS.map((p) => Pts(p.line)),
        ...LANE_PATHS.map((p) => Pts(p.line)),
      ],
      trenches: [
        Pts(L0610_FROM_0105.trafficTrench.filter((p) => p.z >= L0610_BOUNDS.minZ)),
        [{ x: DT.fromX, z: DT.z }, { x: DT.toX, z: DT.z }],
        Pts(RV.line.filter((p) => p.z >= RV.fromZ + RV.endM && p.z <= L0610_BOUNDS.maxZ)),
        Pts(RV.tributary.line),
      ],
    },
  };

  const at = (p) => R2(sample(p.x, p.z));
  const PL = L0610_PLACES;
  notes.push(`网格 ${terrain.cols}×${terrain.rows}（${terrain.cellM} m），高度 ${minM}…${maxM} m；体块 ${blocks.length}、随信号体块 ${gates.length}、院子 ${L0610_YARDS.length + 3}`);
  const cmp = CompareWith0105(sample);
  notes.push(`与 0105 接缝（z 121…190 抽 ${cmp?.samples ?? 0} 点）：${cmp ? `最大差 ${cmp.worst} m（(${cmp.at.x},${cmp.at.z})）` : "没有 0105 场景文件，没比"}；`
    + `干沟沟底 ${at(PL.assembly)}、凹路口 ${at(PL.laneHead)}、驴车处 ${at(PL.cartStop)}`);
  const lanes = [199, 260, 340, 376].map((z) => { const r = LaneDepthAt(sample, z); return `z${z} 深 ${r.depth}`; });
  notes.push(`凹路：${lanes.join(" · ")}；村口 ${at(PL.villageMouth)}；路沟 x80 底 ${DitchSectionAt(sample, 80).floor} 宽 ${DitchSectionAt(sample, 80).floorW}；河汊子 z400 底 ${RiverSectionAt(sample, 400).floor}`);
  notes.push(`村里：路口 ${at(PL.square)} · 老耿家院里 ${at(G.yard.center)} · 街坊家窖底 ${at(PL.cellar)} · 水坑底 ${R2(sample(POND.x, POND.z))} · 村南口 ${at(PL.villageSouth)} · 巷子口 ${at(PL.alleyMouth)}`);
  const s = L0610SightChecks(scene, sample);
  notes.push(`视线：街口坡道趴着→堂屋枪眼 ${s.shooterToLoophole.map((r) => `${r.at.who} ${r.block ? `被 ${r.block} 挡` : r.ground > 0 ? `地面挡 ${r.ground}` : "看得见"}`).join(" / ")}`
    + ` · 枪眼→村北口 ${s.loopholeToMouth ? `被 ${s.loopholeToMouth} 挡` : "看得见"} · 枪眼→巷子 ${s.loopholeToAlley.map((r) => `${r.name} ${r.block || r.ground > 0 ? "挡" : "看得见！"}`).join(" / ")}`
    + ` · 枪眼→大车北头 ${s.loopholeToCartHide ? `被 ${s.loopholeToCartHide} 挡` : "看得见！"}`);
  notes.push(`视线：西配房窗洞→窖口 ${s.windowToCellar ? `被 ${s.windowToCellar} 挡` : "看得见"} · →石磨 ${s.windowToMill ? `被 ${s.windowToMill} 挡` : "看得见"} · 半掩的门缝→窖口 ${s.gateToCellar ? `被 ${s.gateToCellar} 挡` : "看得见"}`
    + ` · 夹道里→窖口 ${s.laneToCellar ? `被 ${s.laneToCellar} 挡` : "看得见"} · 石碾后→探头点 ${s.probes.map((p) => `${p.id} ${p.dist}m/${p.deg}° ${p.block ? `被 ${p.block} 挡` : "看得见"}`).join(" / ")}`);
  notes.push(`视线：凹路尽头蹲着→东北道 ${s.eastRoad.laneMouth.filter((r) => !r.block).length}/${s.eastRoad.laneMouth.length} 点块不挡 · 街口坡道趴着→东北道 ${s.eastRoad.ramp.filter((r) => !r.block).length}/${s.eastRoad.ramp.length} 点块不挡`);
  return scene;
}
