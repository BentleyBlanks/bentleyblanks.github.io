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

// 河汊子
const RV = L0610_RIVER;
export const RIVER_FLOOR_Y = R2(H.plain - RV.depth + 0.3);
export const RIVER_EAST_RIM_X = RV.centerX + RV.floorW / 2 + RV.wallM;
const RIVER_BOX = Object.freeze({ minX: RV.centerX - RV.floorW / 2, maxX: RV.centerX + RV.floorW / 2, minZ: RV.fromZ, maxZ: RV.toZ + 50 });
function EastBankFactor(z) {
  const off = RV.eastBankOff;
  if (!off) return 1;
  return 1 - Smooth((z - off.fromZ) / off.fadeM) * (1 - Smooth((z - off.toZ) / off.fadeM));
}
function RiverCarve(h, x, z) {
  const sdf = RectSdf(x, z, RIVER_BOX);
  if (sdf >= RV.wallM + RV.bankW) return h;
  const fade = Smooth((z - RV.fromZ + RV.wallM) / RV.endM);
  if (sdf < RV.wallM) {
    const k = sdf <= 0 ? 1 : 1 - Smooth(sdf / RV.wallM);
    return Math.min(h, Lerp(h, Lerp(h, RIVER_FLOOR_Y, fade), k));
  }
  const u = (sdf - RV.wallM) / RV.bankW;
  const bank = x > RV.centerX ? EastBankFactor(z) : 1;
  return h + RV.bankH * Math.sin(u * Math.PI) * fade * bank;
}

// 东北进庄的道
const ER = L0610_EAST_ROAD;
function EastRoadDelta(x, z) {
  const d = Math.max(NearestOnLine(ER.line, x, z).dist - ER.halfW, 0);
  if (d >= 0.9) return 0;
  return -ER.lowerM * (1 - Smooth((d + 0.3) / 0.6));
}
function GraveBumps(x, z) {
  let dh = 0;
  for (const g of ER.graves || []) {
    const r = Math.hypot(x - g.x, z - g.z);
    if (r < g.r) dh += g.h * (1 - Smooth(r / g.r));
  }
  return dh;
}

function VillageWeight(x, z) { return 1 - Smooth(RectOutside(x, z, V.box) / V.fadeM); }

// 街巷压低：所有净空条 + 丁字路口
export const STREET_RUNS = Object.freeze(Object.values(ST).filter((r) => r.axis));
function StreetDelta(x, z) {
  let d = Infinity;
  for (const r of STREET_RUNS) {
    const along = r.axis === "z" ? z : x, across = r.axis === "z" ? x : z;
    const over = Math.max(r.from - along, 0, along - r.to);
    d = Math.min(d, Math.hypot(Math.max(Math.abs(across - r.c) - r.halfW, 0), over));
  }
  d = Math.min(d, RectSdf(x, z, ST.square.box));
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
  const Ground = (x, z) => {
    let h = BaseHeight(x, z);
    const vw = VillageWeight(x, z);
    if (vw > 0) h = Lerp(h, V.y, vw);
    const cap = LaneCap(x, z);
    if (cap < h) h = cap;
    const ditch = DitchCap(h, x, z);
    if (ditch < h) h = ditch;
    h = RiverCarve(h, x, z);
    h += Math.min(StreetDelta(x, z), EastRoadDelta(x, z));
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
      HollowHouse(plan, out, id, h.box, h.h, sample, { loopholes: lps, breach: h.breach ? { wall: "N", x: h.breach.x, w: h.breach.w, sillH: h.breach.sillH } : null, door: { wall: "S", x: (h.box.minX + h.box.maxX) / 2, w: V.doorW } });
    } else if (L0610_COLLAPSED_HOUSES.includes(id)) CollapsedHouse(out, id, h.box, h.h);
    else House(out, id, h.box, h.h);
  });
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

/** 倒在胡同里的一截墙（静态）：墙上缺一截，墙板横躺在胡同里（0.25 高，跨得过），墙根一堆土（1.2 高，占半边胡同）。 */
function FallenWallBlocks(plan, out) {
  for (const f of L0610_FALLEN_WALLS) {
    const len = f.to - f.from, mid = (f.from + f.to) / 2;
    plan.Cut(f.axis, f.fixed, f.from, f.to);
    const off1 = f.side * (T / 2 + 1.0), off2 = f.side * (T / 2 + 0.45);
    if (f.axis === "x") {
      out.push(Block(`${f.id}_Slab`, mid + 0.2, f.fixed + off1, len, 2.0, 0.25, WALL, { ry: 0.1, prop: "Rubble", fallen: true }));
      out.push(Block(`${f.id}_Heap`, mid - 0.4, f.fixed + off2, len * 0.7, 0.9, 1.2, EARTH, { ry: -0.2, prop: "Rubble", rubble: true }));
      out.push(Block(`${f.id}_Stub`, f.from - 0.3, f.fixed, 0.6, T, 1.1, WALL, { fallen: true }));
    } else {
      out.push(Block(`${f.id}_Slab`, f.fixed + off1, mid + 0.2, 2.0, len, 0.25, WALL, { ry: 0.1, prop: "Rubble", fallen: true }));
      out.push(Block(`${f.id}_Heap`, f.fixed + off2, mid - 0.4, 0.9, len * 0.7, 1.2, EARTH, { ry: -0.2, prop: "Rubble", rubble: true }));
      out.push(Block(`${f.id}_Stub`, f.fixed, f.from - 0.3, T, 0.6, 1.1, WALL, { fallen: true }));
    }
  }
}

/** 全村的墙、房、门、篱、院子链上的三道门、瓦砾、树、摆件、石碾、土地庙、麦秸垛。 */
function VillageBlocks(sample) {
  const blocks = [], gates = [];
  const plan = new WallPlan();
  GengBlocks(plan, blocks, gates, sample);
  JiefangBlocks(plan, blocks, gates, sample);
  BenjiaBlocks(plan, blocks, sample);
  for (const y of L0610_YARDS) YardBlocks(plan, blocks, gates, y, sample);
  // 每条胡同两边都是墙（院墙已经盖了大半，这里补齐缝隙），死胡同的尽头封死（caps）；别的胡同横过来的地方留口子
  LaneWalls(plan);
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
  FallenWallBlocks(plan, blocks);
  plan.Emit(blocks);
  Shrine(blocks, sample);
  RubbleBlocks(blocks);
  // 零散的树（foliage 细块；石榴矮一点）
  L0610_TREES.forEach((t, i) => blocks.push(Block(`Tree_${String(i + 1).padStart(2, "0")}`, t.x, t.z, t.kind === "pomegranate" ? 0.3 : 0.42, t.kind === "pomegranate" ? 0.3 : 0.42, t.h, "foliage", { tree: t.kind })));
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
  const RVW = L0610_RIVER;
  const z0 = RVW.fromZ + RVW.endM, z1 = L0610_BOUNDS.maxZ - 2, zm = (z0 + z1) / 2;
  blocks.push(Block("RiverWater_1", RVW.centerX, (z0 + zm) / 2, RVW.waterW, zm - z0, RVW.waterH, "water", { solid: false }));
  blocks.push(Block("RiverWater_2", RVW.centerX, (zm + z1) / 2, RVW.waterW, z1 - zm, RVW.waterH, "water", { solid: false }));
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
    L("LmRiver", RV.name, "area", RV.centerX, (RV.fromZ + L0610_BOUNDS.maxZ) / 2, { w: RV.floorW + 2 * RV.wallM, d: L0610_BOUNDS.maxZ - RV.fromZ, note: "车下不去；沟底齐腰深的水，抬伤号过不去" }),
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
  for (let x = RV.centerX; x <= wallFace; x += 0.05) { if (sample(x, z) >= V.y - 0.3) { rim = x; break; } }
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
export function RiverSectionAt(sample, z) {
  const floor = sample(RV.centerX, z);
  let run = 0, best = 0;
  for (let x = RV.centerX - 10; x <= RV.centerX + 10; x += 0.1) { if (sample(x, z) <= floor + 0.15) { run += 0.1; best = Math.max(best, run); } else run = 0; }
  return { floor: R2(floor), west: R2(sample(RV.centerX - 10, z)), east: R2(sample(RV.centerX + 10, z)), floorW: R2(best) };
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
      notes: `06–10 新剧本白盒（2026-10-22 第六版空间）：锚点 Data_EditorBlockoutFirstLevel0610Space；高度 ${L0610_CELL_M} m 网格（${minM}…${maxM} m）；`
        + "z<205 逐点等于 FirstLevel0105 的地面，往南：凹路南段、村口路沟（西头通进河汊子）、河汊子（贴庄子西墙、沟底 1 m 深的水）、"
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
      ],
      trenches: [
        Pts(L0610_FROM_0105.trafficTrench.filter((p) => p.z >= L0610_BOUNDS.minZ)),
        [{ x: DT.fromX, z: DT.z }, { x: DT.toX, z: DT.z }],
        [{ x: RV.centerX, z: RV.fromZ + RV.endM }, { x: RV.centerX, z: L0610_BOUNDS.maxZ }],
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
