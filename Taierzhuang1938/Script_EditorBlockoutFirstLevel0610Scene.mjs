// ===========================================================================
// Script_EditorBlockoutFirstLevel0610Scene.mjs —— 第一关 06–10 新剧本白盒（FirstLevel0610）的场景生成器（node 专用）
//
// 契约 docs/Data_EditorBlockout.md §2.2（场景文件格式，含 gates 与块的可选 y）、§15。产物：
//   Blockout/FirstLevel0610.scene.json  高度网格 + 体块 + 随信号体块 + 路与沟的中心线
// 跑法：node Taierzhuang1938/Script_EditorBlockoutCli.mjs scene FirstLevel0610 --force
//
// 坐标与尺寸只读 Data_EditorBlockoutFirstLevel0610Space（唯一口径）；本文件只定「怎么烘」：
//   1. 自然地面：z < 205 直接用 0105 的 L0105Ground（交通沟坡道、干沟、南岸、凹路头一段逐点一致，两片白盒以后能接上）；
//      z ≥ 205 用 0105 的 NaturalHeight（那里只剩低频起伏）再叠本关的大形：凹路中段两侧略高（路才有 2.5 m 深）、往南落回村子的 +0.3。
//   2. 凹路：0105 的折线原样接上再往南到村口路沟的北沿，路底按弧长分段缓降 / 缓升到 −0.9 直接接进沟底；路底宽、两壁宽沿用 0105。
//   3. 村口路沟（第二版）：东西向，沟底 3 m 宽、−0.9，两壁 1.3 m 陡起；街口那一段南壁放缓成 3.6 m 的坡道（驴车从这里上主街）；两头 4 m 内收掉。
//   4. 河汊子：村西一条南北向干沟，沟底绝对高 −2.7（两岸 2.7…3.7 m）、两壁 2.5 m 陡起、岸上一道矮土埂；沟底一条水块（只做样子）。
//   5. 耿家庄：整村压平到 +0.3（土坯墙才站得稳），街面压低 12 cm；地瓜窖是平底开挖。
//   6. 体块：院墙（带门洞 / 窗洞 / 狗洞 / 墙缝）、房子（实心块）、老耿家三间屋（空心 + 平顶 + 女墙，没人站上去）、石磨、窖沿与盖板、
//      柴草垛、水缸、翻倒的大车（加高到 1.15）、场院的麦秸垛、东街的土地庙等日常摆件、干沟南岸的枯树（0105 的表），以及随信号体块：
//      CartDeparted（车上的弹药箱）/ SideGateOpen（侧门扇）/ CellarBlast（盖板飞开、窖口冒烟）/ MgSilenced（北窗上的机枪 → 石碾后）/
//      NorthYardGatesBroken（北边院子链上的三道门扇倒下）/ BackVatMoved（水缸推到门东边，10-20 拆出来的）/ BackDoorOpen（后门扇）。
//
// 纪律：不读时钟、不读 git（commit / generatedAt 由 CLI 传入）；没有随机数，生成两次逐字相同。
// ===========================================================================

import fs from "node:fs";
import { BLOCKOUT_SCENE_SCHEMA } from "./Script_EditorBlockoutConfig.mjs";
import { HeightGridSampler } from "./Script_EditorBlockoutLevels.mjs";
import { L0105Ground, NaturalHeight as NaturalHeight0105, SightBlock } from "./Script_EditorBlockoutFirstLevel0105Scene.mjs";
import {
  L0610_LEVEL_KEY, L0610_BOUNDS, L0610_CELL_M, L0610_HEIGHTS, L0610_PLAIN_PROFILE, L0610_LANE, L0610_DITCH, L0610_RIVER, L0610_VILLAGE,
  L0610_STREETS, L0610_GENG, L0610_NEIGHBOR, L0610_EAST_YARDS, L0610_STREET_YARDS, L0610_PROP_KINDS, L0610_PROPS,
  L0610_COLLAPSED_HOUSES, L0610_SIGNALS, L0610_PLACES, L0610_SPAWN, L0610_FROM_0105, L0610_MOUTH_SHOOTERS, LineLength, Station,
} from "./Data_EditorBlockoutFirstLevel0610Space.mjs";

export { SightBlock, L0610_MOUTH_SHOOTERS };
export const L0610_SCENE_GENERATOR = "Script_EditorBlockoutCli.mjs scene FirstLevel0610";

const H = L0610_HEIGHTS;
const V = L0610_VILLAGE;
const G = L0610_GENG;
const SIG = L0610_SIGNALS;
const R2 = (v) => Math.round(v * 100) / 100;
const Clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const Smooth = (v) => { const t = Clamp01(v); return t * t * (3 - 2 * t); };
const Lerp = (a, b, t) => a + (b - a) * t;

// ---------------------------------------------------------------------------
// 1. 自然地面

/** 点到矩形（轴对齐）的外部距离；里面为 0。 */
function RectOutside(x, z, box) {
  const dx = Math.max(box.minX - x, 0, x - box.maxX), dz = Math.max(box.minZ - z, 0, z - box.maxZ);
  return Math.hypot(dx, dz);
}
/** 点到矩形的有符号距离（外正内负）。 */
function RectSdf(x, z, box) {
  const cx = (box.minX + box.maxX) / 2, cz = (box.minZ + box.maxZ) / 2, hx = (box.maxX - box.minX) / 2, hz = (box.maxZ - box.minZ) / 2;
  const qx = Math.abs(x - cx) - hx, qz = Math.abs(z - cz) - hz;
  return Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0);
}
/** 控制点 [[t, y], …]（t 递增）之间平滑过渡。 */
function Knots(knots, t) {
  if (t <= knots[0][0]) return knots[0][1];
  for (let i = 1; i < knots.length; i++) {
    const [t0, y0] = knots[i - 1], [t1, y1] = knots[i];
    if (t <= t1) return Lerp(y0, y1, Smooth((t - t0) / (t1 - t0)));
  }
  return knots[knots.length - 1][1];
}

const NORTH_SPLIT_Z = 205;   // 这条线以北照抄 0105 的地面（含交通沟坡道、干沟、凹路头一段）
let north0105 = null;
function NorthGround(x, z) {
  if (!north0105) north0105 = L0105Ground().Ground;
  return north0105(x, z);
}
/** 0105 的地面 + 本关平地大形（z ≤ 200 为 0，所以北半截逐点等于 0105）。 */
export function BaseHeight(x, z) {
  const base = z < NORTH_SPLIT_Z ? NorthGround(x, z) : NaturalHeight0105(x, z);
  return base + Knots(L0610_PLAIN_PROFILE, z);
}

// 凹路
const LANE = L0610_LANE;
const LANE_LEN = LineLength(LANE.line);
const LANE_LEN_0105 = LineLength(L0610_FROM_0105.lane.line);
const LANE_WALL_RISE_M = 3;   // 与 0105 同
const LANE_KNOTS = (() => {
  const knots = [[LANE_LEN_0105, L0610_FROM_0105.lane.toY]];
  for (const k of LANE.floorKnots) knots.push([Station(LANE.line, k.at), k.y]);
  knots.push([LANE_LEN, LANE.mouthY]);   // 末端 = 路沟沟底，直接接进沟里
  return knots;
})();
/** 路底高度随弧长：0105 那一截照 0105 的公式（接得上），之后按锚点的控制点。 */
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
/** 凹路开挖后的高度上限（不在路上 = Infinity）。 */
function LaneCap(x, z) {
  const { dist, at } = NearestOnLine(LANE.line, x, z);
  const half = LANE.floorW / 2;
  if (dist >= half + LANE.wallM) return Infinity;
  const floorY = LaneFloorY(at);
  return dist <= half ? floorY : floorY + LANE_WALL_RISE_M * Smooth((dist - half) / LANE.wallM);
}
export function DistanceToLane(x, z) { return NearestOnLine(LANE.line, x, z).dist; }

// 村口路沟：东西向，沟底 floorW 宽、floorY；南北两壁 wallM 陡起；街口那一段（|x − 主街中线| ≤ rampHalfW）南壁放缓成 rampWallM 的坡道；两头 endM 内收掉
const DT = L0610_DITCH;
const DITCH_HALF = DT.floorW / 2;
/** 路沟开挖后的高度上限（不在沟上 = Infinity）。h 是开挖前的地面（壁从沟底升到它）。 */
function DitchCap(h, x, z) {
  const dz = Math.abs(z - DT.z);
  const south = z > DT.z;
  const nearStreet = 1 - Smooth((Math.abs(x - ST.main.x) - DT.rampHalfW) / DT.rampBlendM);
  const wallM = south ? Lerp(DT.wallM, DT.rampWallM, nearStreet) : DT.wallM;
  if (dz >= DITCH_HALF + wallM) return Infinity;
  const over = Math.max(DT.fromX - x, 0, x - DT.toX);
  if (over >= DT.endM) return Infinity;
  const fade = 1 - Smooth(over / DT.endM);
  const floor = Lerp(h, DT.floorY, fade);
  if (dz <= DITCH_HALF) return floor;
  return Lerp(floor, h, Smooth((dz - DITCH_HALF) / wallM));
}

// 河汊子：沟底绝对高（两岸随平地起伏，沟底不随）
const RV = L0610_RIVER;
export const RIVER_FLOOR_Y = R2(H.plain - RV.depth + 0.3);   // −2.7
const RIVER_BOX = Object.freeze({ minX: RV.centerX - RV.floorW / 2, maxX: RV.centerX + RV.floorW / 2, minZ: RV.fromZ, maxZ: RV.toZ + 50 });
function RiverCarve(h, x, z) {
  const sdf = RectSdf(x, z, RIVER_BOX);
  if (sdf >= RV.wallM + RV.bankW) return h;
  const fade = Smooth((z - RV.fromZ + RV.wallM) / RV.endM);   // 北头 endM 内从无到有
  if (sdf < RV.wallM) {
    const k = sdf <= 0 ? 1 : 1 - Smooth(sdf / RV.wallM);
    return Math.min(h, Lerp(h, Lerp(h, RIVER_FLOOR_Y, fade), k));
  }
  const u = (sdf - RV.wallM) / RV.bankW;
  return h + RV.bankH * Math.sin(u * Math.PI) * fade;
}

// 村子：整村压平
function VillageWeight(x, z) { return 1 - Smooth(RectOutside(x, z, V.box) / V.fadeM); }

// 街面压低（两边是墙，不要路肩）
const ST = L0610_STREETS;
const STREET_RUNS = Object.freeze([
  { axis: "z", c: ST.main.x, from: ST.main.fromZ, to: ST.main.toZ, half: ST.main.halfW },
  { axis: "x", c: ST.east.z, from: ST.east.fromX, to: ST.east.toX, half: ST.east.halfW },
  { axis: "z", c: ST.alleyNorth.x, from: ST.alleyNorth.fromZ, to: ST.alleyNorth.toZ, half: ST.alleyNorth.halfW },
  { axis: "x", c: ST.alleyWest.z, from: ST.alleyWest.fromX, to: ST.alleyWest.toX, half: ST.alleyWest.halfW },
  { axis: "z", c: ST.alleySouth.x, from: ST.alleySouth.fromZ, to: ST.alleySouth.toZ, half: ST.alleySouth.halfW },
  { axis: "z", c: ST.backLane.x, from: ST.backLane.fromZ, to: ST.backLane.toZ, half: ST.backLane.halfW },
]);
function StreetDelta(x, z) {
  let d = Infinity;
  for (const r of STREET_RUNS) {
    const along = r.axis === "z" ? z : x, across = r.axis === "z" ? x : z;
    const over = Math.max(r.from - along, 0, along - r.to);
    d = Math.min(d, Math.hypot(Math.max(Math.abs(across - r.c) - r.half, 0), over));
  }
  d = Math.min(d, RectSdf(x, z, ST.square.box), RectSdf(x, z, ST.pocket.box));
  if (d >= 0.9) return 0;
  return -V.streetLowerM * (1 - Smooth((d + 0.3) / 0.6));
}

// 地瓜窖（平底开挖）
const CELLAR = G.cellar;
const CELLAR_BOX = Object.freeze({ minX: CELLAR.x - CELLAR.floorW / 2, maxX: CELLAR.x + CELLAR.floorW / 2, minZ: CELLAR.z - CELLAR.floorW / 2, maxZ: CELLAR.z + CELLAR.floorW / 2 });
export const CELLAR_FLOOR_Y = R2(V.y - CELLAR.depth);
function CarveBox(h, x, z, box, floorY, wallM) {
  const sdf = RectSdf(x, z, box);
  if (sdf >= wallM) return h;
  const k = sdf <= 0 ? 1 : 1 - Smooth(sdf / wallM);
  return Math.min(h, Lerp(h, floorY, k));
}

/** 建好的地面函数。 */
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
    h += StreetDelta(x, z);
    h = CarveBox(h, x, z, CELLAR_BOX, CELLAR_FLOOR_Y, CELLAR.wallM);
    return h;
  };
  return { Ground };
}

/** 按 §2.2 烘高度：(cols+1)×(rows+1) 个 int16 小端厘米，heights[iz*(cols+1)+ix]。 */
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
// 体块

const Block = (id, x, z, w, d, h, semantic, extra = {}) => ({ id, x: R2(x), z: R2(z), w: R2(w), d: R2(d), h: R2(h), ry: 0, semantic, solid: true, ...extra });
const WALL = "plaster", BRICK = "structure", ROOF = "roof", WOOD = "timber";
const T = V.wallT;

/**
 * 一段轴对齐的墙拆成几块（避开 gaps）。axis "x"：墙沿 x 走、z 固定；"z"：沿 z 走、x 固定。
 * gaps：[{ from, to }]（沿墙方向的坐标）。h 可以是数或函数 (from, to) => h。
 */
function Wall(out, id, axis, fixed, from, to, gaps = [], h = V.wallH, semantic = WALL, extra = {}) {
  const cuts = gaps.filter((g) => g.to > from && g.from < to).sort((a, b) => a.from - b.from);
  const runs = [];
  let cur = from;
  for (const g of cuts) { if (g.from > cur + 0.01) runs.push([cur, Math.min(g.from, to)]); cur = Math.max(cur, g.to); }
  if (to > cur + 0.01) runs.push([cur, to]);
  runs.forEach(([a, b], i) => {
    const mid = (a + b) / 2, len = b - a, hh = typeof h === "function" ? h(a, b) : h;
    const sid = runs.length > 1 ? `${id}_${i + 1}` : id;
    out.push(axis === "x" ? Block(sid, mid, fixed, len, T, hh, semantic, extra) : Block(sid, fixed, mid, T, len, hh, semantic, extra));
  });
}
/** 门洞 / 窗洞上方的过梁（显式 y）：从 bottomH 到 topH。 */
function Lintel(out, id, axis, fixed, from, to, bottomH, topH, sample, semantic = WALL) {
  const mid = (from + to) / 2, len = to - from;
  const gy = axis === "x" ? sample(mid, fixed) : sample(fixed, mid);
  const y = R2(gy + (bottomH + topH) / 2);
  out.push(axis === "x" ? Block(id, mid, fixed, len, T, topH - bottomH, semantic, { y }) : Block(id, fixed, mid, T, len, topH - bottomH, semantic, { y }));
}
/** 平顶（显式 y，顶在 topH）。 */
function Slab(out, id, box, topH, sample, thick = 0.2, semantic = ROOF) {
  const cx = (box.minX + box.maxX) / 2, cz = (box.minZ + box.maxZ) / 2;
  out.push(Block(id, cx, cz, box.maxX - box.minX, box.maxZ - box.minZ, thick, semantic, { y: R2(sample(cx, cz) + topH - thick / 2) }));
}
/** 实心房子。 */
function House(out, id, box, h = V.houseH, semantic = BRICK) {
  out.push(Block(id, (box.minX + box.maxX) / 2, (box.minZ + box.maxZ) / 2, box.maxX - box.minX, box.maxZ - box.minZ, h, semantic, { house: true }));
}
/** 塌了一角的房子：东南角缺一块，缺口里堆一摊土。 */
function CollapsedHouse(out, id, box, h = V.houseH) {
  const cw = Math.min(4, (box.maxX - box.minX) / 2), cd = Math.min(3, (box.maxZ - box.minZ) / 2);
  House(out, `${id}_A`, { minX: box.minX, maxX: box.maxX - cw, minZ: box.minZ, maxZ: box.maxZ }, h);
  House(out, `${id}_B`, { minX: box.maxX - cw, maxX: box.maxX, minZ: box.minZ, maxZ: box.maxZ - cd }, h);
  const k = L0610_PROP_KINDS.Rubble;
  out.push(Block(`${id}_Rubble`, box.maxX - cw / 2 + 0.3, box.maxZ - cd / 2 + 0.4, k.w, k.d, k.h, k.semantic, { ry: 0.3, prop: "Rubble" }));
}
const Gap = (c, w) => ({ from: c - w / 2, to: c + w / 2 });
/** 关着的院门：门洞里一扇门板。 */
function ClosedGate(out, id, axis, fixed, c, w) {
  out.push(axis === "x" ? Block(id, c, fixed, w - 0.1, 0.08, 2.0, WOOD, { gate: true }) : Block(id, fixed, c, 0.08, w - 0.1, 2.0, WOOD, { gate: true }));
}

/** 老耿家 + 邻院（含随信号体块）。 */
function GengBlocks(sample) {
  const blocks = [], gates = [];
  const FR = G.frontRoom, K = G.kitchen, SR = G.sideRoom, C = G.compound;
  const roomH = FR.roofH;
  const gy = sample(100, 488);   // 后院地面（整村压平，一个数就够；显式 y 的块另按各自位置采）

  // --- 前屋：北墙带北窗与前门，南墙带开向后院的门，东西墙，平顶 + 北女墙 ----------------
  Wall(blocks, "GengFrontNorth", "x", FR.box.minZ, FR.box.minX, FR.box.maxX, [Gap(G.window.x, G.window.w), Gap(G.frontDoor.x, G.frontDoor.w)], roomH);
  blocks.push(Block("GengWindowSill", G.window.x, FR.box.minZ, G.window.w, T, G.window.sillH, WALL));
  Lintel(blocks, "GengWindowLintel", "x", FR.box.minZ, G.window.x - G.window.w / 2, G.window.x + G.window.w / 2, G.window.topH, roomH, sample);
  Lintel(blocks, "GengFrontDoorLintel", "x", FR.box.minZ, G.frontDoor.x - G.frontDoor.w / 2, G.frontDoor.x + G.frontDoor.w / 2, G.frontDoor.topH, roomH, sample);
  Wall(blocks, "GengFrontSouth", "x", FR.box.maxZ, FR.box.minX, FR.box.maxX, [Gap(G.roomYardDoor.x, G.roomYardDoor.w)], roomH);
  Lintel(blocks, "GengRoomYardDoorLintel", "x", FR.box.maxZ, G.roomYardDoor.x - G.roomYardDoor.w / 2, G.roomYardDoor.x + G.roomYardDoor.w / 2, G.roomYardDoor.topH, roomH, sample);
  Wall(blocks, "GengFrontWest", "z", FR.box.minX, FR.box.minZ, FR.box.maxZ, [], roomH);
  Wall(blocks, "GengFrontEast", "z", FR.box.maxX, FR.box.minZ, FR.box.maxZ, [], roomH);
  Slab(blocks, "GengFrontRoof", FR.box, roomH, sample);
  const roofTop = sample((FR.box.minX + FR.box.maxX) / 2, (FR.box.minZ + FR.box.maxZ) / 2) + roomH;   // 与平顶同一个基准（街面压低 12 cm，不按墙脚采）
  blocks.push(Block("GengRoofParapetNorth", (FR.box.minX + FR.box.maxX) / 2, FR.box.minZ, FR.box.maxX - FR.box.minX, T, FR.parapetH, WALL,
    { y: R2(roofTop + FR.parapetH / 2) }));
  // 北窗上的十一年式（机枪组被打掉前一直在窗台上；10-2 起出现在石碾后头）
  gates.push(Block("GengWindowMg", G.window.x, FR.box.minZ, 0.12, 0.9, 0.14, "metal", { y: R2(sample(G.window.x, FR.box.minZ) + G.window.sillH + 0.07), signal: SIG.mgSilenced }));
  const RL = L0610_PLACES.roller;
  gates.push(Block("RollerMg", RL.x - 1.0, RL.z + 0.6, 0.9, 0.12, 0.14, "metal", { appearSignal: SIG.mgSilenced }));

  // --- 大门（车道）与院墙北段：门楼过梁 2.6 m，两扇门板敞开贴着过道两壁 ------------------
  const CG = G.carriageGate;
  Wall(blocks, "GengNorthWallEast", "x", C.minZ, FR.box.maxX, C.maxX, [Gap((CG.minX + CG.maxX) / 2, CG.maxX - CG.minX)], (a) => (a < CG.maxX + 0.6 ? 3.0 : V.wallH));
  Lintel(blocks, "GengGateLintel", "x", C.minZ, FR.box.maxX, CG.maxX + 0.5, CG.topH, 3.0, sample);
  blocks.push(Block("GengGateLeafWest", CG.minX - 0.15, C.minZ + 0.95, 0.08, 1.3, 2.0, WOOD, { gate: true }));
  blocks.push(Block("GengGateLeafEast", CG.maxX + 0.2, C.minZ + 0.95, 0.08, 1.3, 2.0, WOOD, { gate: true }));
  Wall(blocks, "GengPassageEast", "z", G.passageEastX, C.minZ, SR.box.minZ, []);

  // --- 院墙：东（偏屋那段高到 3.0）、南（后门）、与邻院共用的西墙（狗洞 / 墙缝 / 侧门） -------------
  Wall(blocks, "GengEastWall", "z", C.maxX, L0610_EAST_YARDS.south.box.minZ, C.maxZ, [], (a, b) => (a >= SR.box.minZ - 0.01 && b <= SR.box.maxZ + 0.01 ? SR.roofH : V.wallH));
  Wall(blocks, "GengSouthWall", "x", C.maxZ, C.minX, C.maxX, [Gap(G.backDoor.x, G.backDoor.w)]);
  Lintel(blocks, "GengBackDoorLintel", "x", C.maxZ, G.backDoor.x - G.backDoor.w / 2, G.backDoor.x + G.backDoor.w / 2, G.backDoor.topH, V.wallH, sample);
  const SW = G.sharedWall, DH = G.dogHole, CR = G.crack, SG = G.sideGate;
  Wall(blocks, "SharedWall", "z", SW.x, SW.fromZ, SW.toZ, [Gap(DH.z, DH.w), Gap(CR.z, CR.w), Gap(SG.z, SG.w)]);
  Lintel(blocks, "DogHoleLintel", "z", SW.x, DH.z - DH.w / 2, DH.z + DH.w / 2, DH.h, V.wallH, sample);
  Lintel(blocks, "SideGateLintel", "z", SW.x, SG.z - SG.w / 2, SG.z + SG.w / 2, 2.0, V.wallH, sample);
  // 侧门扇：关着时贴南侧铰链、北边留门缝；开了以后往老耿家这边摆成一字
  const leafZ0 = SG.z + SG.w / 2 - SG.leafW;
  gates.push(Block("SideGateLeaf", SW.x - 0.15, leafZ0 + SG.leafW / 2, SG.leafT, SG.leafW, 2.0, WOOD, { signal: SIG.sideGateOpen }));
  gates.push(Block("SideGateLeafOpen", SW.x + T / 2 + SG.leafW / 2, SG.z + SG.w / 2 + 0.05, SG.leafW, SG.leafT, 2.0, WOOD, { appearSignal: SIG.sideGateOpen }));
  // 后门：门扇关着（向里开，被水缸顶着），水缸堵在门里头；10 末老耿先把水缸往东推开（BackVatMoved，片段 2.8 s），再拔门闩把门扇拉开到西墙边（BackDoorOpen，6.1 s）
  gates.push(Block("BackDoorLeaf", G.backDoor.x, C.maxZ - 0.15, G.backDoor.w - 0.05, 0.08, 2.0, WOOD, { signal: SIG.backDoorOpen }));
  gates.push(Block("BackDoorLeafOpen", G.backDoor.x - G.backDoor.w / 2 + 0.05, C.maxZ - 0.25 - (G.backDoor.w - 0.05) / 2, 0.08, G.backDoor.w - 0.05, 2.0, WOOD, { appearSignal: SIG.backDoorOpen }));
  const vat = L0610_PROP_KINDS.WaterVat;
  gates.push(Block("BackVat", G.backVat.x, G.backVat.z, vat.w, vat.d, vat.h, vat.semantic, { prop: "WaterVat", signal: SIG.backVatMoved }));
  gates.push(Block("BackVatMoved", G.backVatMoved.x, G.backVatMoved.z, vat.w, vat.d, vat.h, vat.semantic, { prop: "WaterVat", appearSignal: SIG.backVatMoved }));

  // --- 灶屋（西北，门朝东）：空心 + 平顶；灶台、案板 -------------------------------------------
  Wall(blocks, "KitchenNorth", "x", K.box.minZ, K.box.minX, K.box.maxX, [], K.roofH);
  Wall(blocks, "KitchenSouth", "x", K.box.maxZ, K.box.minX, K.box.maxX, [], K.roofH);
  Wall(blocks, "KitchenWest", "z", K.box.minX, K.box.minZ, K.box.maxZ, [], K.roofH);
  Wall(blocks, "KitchenEast", "z", K.box.maxX, K.box.minZ, K.box.maxZ, [Gap(K.door.z, K.door.w)], K.roofH);
  Lintel(blocks, "KitchenDoorLintel", "z", K.box.maxX, K.door.z - K.door.w / 2, K.door.z + K.door.w / 2, V.doorTopH, K.roofH, sample);
  Slab(blocks, "KitchenRoof", K.box, K.roofH, sample);
  blocks.push(Block("KitchenStove", G.stove.x, G.stove.z, G.stove.w, G.stove.d, G.stove.h, "earthDark"));
  blocks.push(Block("KitchenBoard", G.board.x, G.board.z, G.board.w, G.board.d, G.board.h, WOOD));
  blocks.push(Block("KitchenVat", K.box.maxX - 1.0, K.box.minZ + 0.9, vat.w, vat.d, vat.h, vat.semantic, { prop: "WaterVat" }));

  // --- 偏屋（东，门朝西） ------------------------------------------------------------------
  Wall(blocks, "SideRoomNorth", "x", SR.box.minZ, SR.box.minX, SR.box.maxX, [], SR.roofH);
  Wall(blocks, "SideRoomSouth", "x", SR.box.maxZ, SR.box.minX, SR.box.maxX, [], SR.roofH);
  Wall(blocks, "SideRoomWest", "z", SR.box.minX, SR.box.minZ, SR.box.maxZ, [Gap(SR.door.z, SR.door.w)], SR.roofH);
  Lintel(blocks, "SideRoomDoorLintel", "z", SR.box.minX, SR.door.z - SR.door.w / 2, SR.door.z + SR.door.w / 2, V.doorTopH, SR.roofH, sample);
  Slab(blocks, "SideRoomRoof", SR.box, SR.roofH, sample);

  // --- 石磨、地瓜窖、柴草垛 ------------------------------------------------------------------
  const M = G.mill;
  blocks.push(Block("MillBase", M.x, M.z, M.baseW, M.baseW, M.baseH, BRICK));
  blocks.push(Block("MillStone", M.x, M.z, M.stoneW, M.stoneW, M.stoneH, BRICK, { y: R2(sample(M.x, M.z) + M.baseH + M.stoneH / 2) }));
  // 窖沿矮块贴着网格里的坑口外沿：坑心外 1.0 m 那一圈格点是整高（Data_…Space 的 cellar 注），矮块放在 1.2…1.4 m（不随 wallM 走，爬出窖的根 1.1 m 不踩它）
  const rimOff = CELLAR.floorW / 2 + L0610_CELL_M, rimLen = (rimOff + 0.1) * 2;
  blocks.push(Block("CellarRimNorth", CELLAR.x, CELLAR.z - rimOff, rimLen, 0.2, CELLAR.rimH, WOOD));
  blocks.push(Block("CellarRimSouth", CELLAR.x, CELLAR.z + rimOff, rimLen, 0.2, CELLAR.rimH, WOOD));
  blocks.push(Block("CellarRimWest", CELLAR.x - rimOff, CELLAR.z, 0.2, rimLen, CELLAR.rimH, WOOD));
  blocks.push(Block("CellarRimEast", CELLAR.x + rimOff, CELLAR.z, 0.2, rimLen, CELLAR.rimH, WOOD));
  const lid = G.cellarLid;
  gates.push(Block("CellarLid", lid.x, lid.z, lid.w, lid.d, lid.t, WOOD, { ry: lid.ry, signal: SIG.cellarBlast }));
  gates.push(Block("CellarLidBlown", G.cellarLidBlown.x, G.cellarLidBlown.z, lid.w, lid.d, lid.t, WOOD, { ry: G.cellarLidBlown.ry, appearSignal: SIG.cellarBlast }));
  gates.push(Block("CellarSmoke", CELLAR.x, CELLAR.z, 0.8, 0.8, 3.2, ROOF, { y: R2(gy + 1.0), appearSignal: SIG.cellarBlast }));
  gates.push(Block("CellarSmokeTop", CELLAR.x + 0.3, CELLAR.z - 0.2, 1.3, 1.3, 1.2, ROOF, { y: R2(gy + 3.0), appearSignal: SIG.cellarBlast }));
  const hs = G.haystack;
  blocks.push(Block("GengHaystack", hs.x, hs.z, hs.w, hs.d, hs.h, "canvas", { prop: "Haystack" }));

  // --- 邻院（共用西墙在上面）：北、南、西墙（西墙开小门），一座房，水缸、鸡笼 ----------------------
  const NB = L0610_NEIGHBOR;
  Wall(blocks, "NeighborNorth", "x", NB.box.minZ, NB.box.minX, NB.box.maxX, []);
  Wall(blocks, "NeighborSouth", "x", NB.box.maxZ, NB.box.minX, NB.box.maxX, []);
  House(blocks, "NeighborHouse", NB.house.box, NB.house.h);
  blocks.push(Block("NeighborVat", NB.vat.x, NB.vat.z, vat.w, vat.d, vat.h, vat.semantic, { prop: "WaterVat" }));
  const coop = L0610_PROP_KINDS.ChickenCoop;
  blocks.push(Block("NeighborCoop", NB.coop.x, NB.coop.z, coop.w, coop.d, coop.h, coop.semantic, { prop: "ChickenCoop" }));

  return { blocks, gates };
}

/** 砸得倒的院门（北边抄后路那条院子链上的三道）：关着的门扇随 signal 消失，倒在地上的门扇随 appearSignal 出现。 */
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

/** 东街南侧院墙外贴着街的土地庙：三面薄墙 + 顶，开口朝北（白盒占位；标 prop 让街的净空检查放过它）。 */
function Shrine(out, sample) {
  const S = L0610_EAST_YARDS.shrine, t = S.wallT, g = sample(S.x, S.z);
  const extra = { prop: "Shrine" };
  out.push(Block("ShrineBack", S.x, S.z + S.d / 2 - t / 2, S.w, t, S.h, BRICK, extra));
  out.push(Block("ShrineWest", S.x - S.w / 2 + t / 2, S.z, t, S.d, S.h, BRICK, extra));
  out.push(Block("ShrineEast", S.x + S.w / 2 - t / 2, S.z, t, S.d, S.h, BRICK, extra));
  out.push(Block("ShrineRoof", S.x, S.z, S.w + 0.2, S.d + 0.2, t, ROOF, { ...extra, y: R2(g + S.h - t / 2 + 0.02) }));
}

/** 村里其余的院子、街墙、房子、院门（含北边院子链上随 NorthYardGatesBroken 的三道门）。 */
function VillageBlocks(sample) {
  const blocks = [], gates = [];
  const Y = L0610_STREET_YARDS, E = L0610_EAST_YARDS, NB = L0610_NEIGHBOR, C = G.compound, PK = ST.pocket.box, NC = E.northChain;
  const gw = V.gateW;

  // --- 主街两侧的街墙（带院门；巷子不再在主街上开口） ---------------------------------------------
  const W = Y.westOfMain, EM = Y.eastOfMain;
  Wall(blocks, "MainWestWall", "z", W.box.maxX, ST.main.fromZ, Y.squareNorthWallZ, W.gatesZ.map((z) => Gap(z, gw)));
  Wall(blocks, "MainEastWall", "z", EM.box.minX, ST.main.fromZ, PK.minZ, EM.gatesZ.map((z) => Gap(z, gw)));   // 到北角的北墙为止
  ClosedGate(blocks, "MainWestGate2", "z", W.box.maxX, W.gatesZ[1], gw);
  ClosedGate(blocks, "MainEastGate1", "z", EM.box.minX, EM.gatesZ[0], gw);
  // 小空地北角（主街东侧最南那院收掉的西南角）：北墙（开一道院门，10-4 抄后路的日军从这里钻出来）、东墙；再往东是小空地北边原来那截墙
  Wall(blocks, "PocketNorthWall", "x", PK.minZ, PK.minX, PK.maxX, [Gap(NC.pocketGate.x, NC.pocketGate.w)]);
  Lintel(blocks, "PocketGateLintel", "x", PK.minZ, NC.pocketGate.x - NC.pocketGate.w / 2, NC.pocketGate.x + NC.pocketGate.w / 2, V.doorTopH, V.wallH, sample);
  BreakableGate(gates, "PocketGateLeaf", "x", PK.minZ, NC.pocketGate.x, NC.pocketGate.w, SIG.northYardGatesBroken, 1);
  Wall(blocks, "PocketEastWall", "z", PK.maxX, PK.minZ, Y.squareNorthWallZ, []);
  Wall(blocks, "SquareNorthWall", "x", Y.squareNorthWallZ, PK.maxX, C.maxX, []);
  // 主街西边院子：南墙（小空地西头 / 夹道的北边）、隔墙；村北边（夹道两边各一截，夹道口留着）
  Wall(blocks, "WestYardsSouth", "x", W.box.maxZ, W.box.minX, W.box.maxX, []);
  for (const z of W.splitsZ) Wall(blocks, `WestYardsSplit${z}`, "x", z, W.box.minX, W.box.maxX, []);
  Wall(blocks, "WestYardsNorthEdge", "x", ST.main.fromZ, Y.northOfAlleyWest.box.minX, Y.northOfAlleyEast.box.maxX, [Gap(ST.alleyNorth.x, ST.alleyNorth.halfW * 2 + T)]);
  // 主街东边院子：东墙（到东街北侧院子的北墙为止，再往南是那片院子的西墙）、隔墙、村北边
  Wall(blocks, "EastYardsEast", "z", EM.box.maxX, EM.box.minZ, E.north.box.minZ, []);
  for (const z of EM.splitsZ) Wall(blocks, `EastYardsSplit${z}`, "x", z, EM.box.minX, EM.box.maxX, []);
  Wall(blocks, "EastYardsNorthEdge", "x", EM.box.minZ, EM.box.minX, EM.box.maxX, []);

  // --- 巷子：北头的夹道（两道墙，北头开在路沟南沿上）、东西那截（主街那头封死）、南北那截的西墙、尽头；
  //     西边院子的西墙 = x 60 那道（从巷子到邻院南墙，开邻院小门，不放门扇） ---
  const AN = ST.alleyNorth, AW = ST.alleyWest, AS = ST.alleySouth, WA = Y.westOfAlley;
  const alleyNorthWallZ = AW.z - AW.halfW - T / 2, alleySouthWallZ = AW.z + AW.halfW + T / 2;
  Wall(blocks, "AlleyPassageWest", "z", AN.x - AN.halfW - T / 2, ST.main.fromZ, alleyNorthWallZ + T / 2, []);
  Wall(blocks, "AlleyPassageEast", "z", AN.x + AN.halfW + T / 2, ST.main.fromZ, alleySouthWallZ + T / 2, []);
  Wall(blocks, "AlleyNorthWall", "x", alleyNorthWallZ, WA.box.maxX, AN.x - AN.halfW, []);
  Wall(blocks, "AlleySouthWall", "x", alleySouthWallZ, W.box.minX, W.box.maxX, []);   // 一直到主街西墙：巷子不通主街
  Wall(blocks, "AlleyWestWall", "z", WA.box.maxX, ST.main.fromZ, AS.toZ + T / 2, []);
  Wall(blocks, "AlleyEndWall", "x", AS.toZ, WA.box.maxX - T / 2, W.box.minX + T / 2, []);
  Wall(blocks, "WestYardsWest", "z", W.box.minX, alleySouthWallZ, NB.box.maxZ, [Gap(NB.westDoor.z, NB.westDoor.w)]);
  Lintel(blocks, "NeighborDoorLintel", "z", W.box.minX, NB.westDoor.z - NB.westDoor.w / 2, NB.westDoor.z + NB.westDoor.w / 2, V.doorTopH, V.wallH, sample);
  // 巷子西边的院子：村西边、北边、隔墙
  Wall(blocks, "VillageWestEdge", "z", WA.box.minX, ST.main.fromZ, WA.box.maxZ, []);
  Wall(blocks, "WestAlleyYardsNorth", "x", ST.main.fromZ, WA.box.minX, WA.box.maxX, []);
  for (const z of WA.splitsZ) Wall(blocks, `WestAlleyYardsSplit${z}`, "x", z, WA.box.minX, WA.box.maxX, []);
  Wall(blocks, "WestAlleyYardsSouth", "x", WA.box.maxZ, WA.box.minX, WA.box.maxX - T / 2, []);

  // --- 东街：两侧街墙（带院门；北侧第二个院是场院，南墙中段不要）、两侧院子的外墙与隔墙、院子链上的门 ---------------
  const EN = E.north, ES = E.south, FY = E.farmyard;
  const northWallZ = ST.east.z - ST.east.halfW - T / 2, southWallZ = ST.east.z + ST.east.halfW + T / 2;
  Wall(blocks, "EastStreetNorthWall", "x", northWallZ, EN.box.minX, EN.box.maxX, [...EN.gatesX.map((x) => Gap(x, gw)), { from: FY.openFromX, to: FY.openToX }]);
  Wall(blocks, "EastStreetSouthWall", "x", southWallZ, ES.box.minX, ES.box.maxX, ES.gatesX.map((x) => Gap(x, gw)));
  ClosedGate(blocks, "EastNorthGate3", "x", northWallZ, EN.gatesX[2], gw);
  ClosedGate(blocks, "EastSouthGate1", "x", southWallZ, ES.gatesX[0], gw);
  ClosedGate(blocks, "EastSouthGate3", "x", southWallZ, ES.gatesX[2], gw);
  Wall(blocks, "EastNorthYardsNorth", "x", EN.box.minZ, EN.box.minX, EN.box.maxX, []);
  // 北侧第一个院的西墙 = 主街东侧最南那院的东墙：开一道门（院子链第二道）
  Wall(blocks, "EastNorthYardsWest", "z", EN.box.minX, EN.box.minZ, ST.east.z - ST.east.halfW, [Gap(NC.yard1Door.z, NC.yard1Door.w)]);
  Lintel(blocks, "Yard1DoorLintel", "z", EN.box.minX, NC.yard1Door.z - NC.yard1Door.w / 2, NC.yard1Door.z + NC.yard1Door.w / 2, V.doorTopH, V.wallH, sample);
  BreakableGate(gates, "Yard1GateLeaf", "z", EN.box.minX, NC.yard1Door.z, NC.yard1Door.w, SIG.northYardGatesBroken, -1);
  Wall(blocks, "EastNorthYardsEast", "z", EN.box.maxX, EN.box.minZ, ST.east.z - ST.east.halfW, []);
  for (const x of EN.splitsX) {
    const isFarmyardWest = x === FY.minX;   // 场院西隔墙：开一道门（院子链第一道）
    Wall(blocks, `EastNorthSplit${x}`, "z", x, EN.box.minZ, ST.east.z - ST.east.halfW - T, isFarmyardWest ? [Gap(NC.farmyardDoor.z, NC.farmyardDoor.w)] : []);
    if (isFarmyardWest) {
      Lintel(blocks, "FarmyardDoorLintel", "z", x, NC.farmyardDoor.z - NC.farmyardDoor.w / 2, NC.farmyardDoor.z + NC.farmyardDoor.w / 2, V.doorTopH, V.wallH, sample);
      BreakableGate(gates, "FarmyardGateLeaf", "z", x, NC.farmyardDoor.z, NC.farmyardDoor.w, SIG.northYardGatesBroken, -1);
    }
  }
  Wall(blocks, "EastSouthYardsSouth", "x", ES.box.maxZ, ES.box.minX, ES.box.maxX, []);
  Wall(blocks, "EastSouthYardsEast", "z", ES.box.maxX, ST.east.z + ST.east.halfW, ES.box.maxZ, []);
  for (const x of ES.splitsX) Wall(blocks, `EastSouthSplit${x}`, "z", x, ST.east.z + ST.east.halfW + T, ES.box.maxZ, []);
  Shrine(blocks, sample);

  // --- 后门外的小路：两边的墙（各开一个口）、南边两片院子的外墙、村南边 ----------------------------
  const BL = ST.backLane, SWY = Y.southWest, SEY = Y.southEast;
  Wall(blocks, "BackLaneWestWall", "z", BL.x - BL.halfW - T / 2, BL.fromZ + T / 2, Y.villageSouthZ, [Gap(520.75, gw)]);
  Wall(blocks, "BackLaneEastWall", "z", BL.x + BL.halfW + T / 2, BL.fromZ, Y.villageSouthZ, [Gap(530.75, gw)]);
  Wall(blocks, "SouthWestYardWest", "z", SWY.box.minX, NB.box.maxZ, Y.villageSouthZ, []);
  Wall(blocks, "SouthWestYardSouth", "x", Y.villageSouthZ, SWY.box.minX, SWY.box.maxX, []);
  Wall(blocks, "SouthEastYardEast", "z", SEY.box.maxX, ES.box.maxZ, Y.villageSouthZ, []);
  Wall(blocks, "SouthEastYardSouth", "x", Y.villageSouthZ, SEY.box.minX, SEY.box.maxX, []);

  // --- 房子（实心），两座塌了一角；场院（EN2）不盖房；夹道把原来的 NA1 拆成两座 ----------------------
  const HOUSES = {
    House_WM1: { minX: 66, maxX: 80, minZ: 402, maxZ: 408 }, House_WM2: { minX: 66, maxX: 80, minZ: 432, maxZ: 438 },
    House_EM1: { minX: 107, maxX: 117, minZ: 390, maxZ: 400 }, House_EM2: { minX: 107, maxX: 117, minZ: 414, maxZ: 424 }, House_EM3: { minX: 104, maxX: 112, minZ: 437, maxZ: 443 },
    House_NA1: { minX: 63, maxX: 77, minZ: 386, maxZ: 392 }, House_NA2: { minX: 83, maxX: 95, minZ: 386, maxZ: 392 },
    House_WA1: { minX: 42, maxX: 54, minZ: 402, maxZ: 410 }, House_WA2: { minX: 42, maxX: 54, minZ: 436, maxZ: 444 }, House_WA3: { minX: 42, maxX: 54, minZ: 468, maxZ: 476 },
    House_EN1: { minX: 124, maxX: 146, minZ: 441, maxZ: 447 },
    House_EN3: { minX: 188, maxX: 208, minZ: 441, maxZ: 447 }, House_EN4: { minX: 218, maxX: 230, minZ: 441, maxZ: 447 },
    House_ES1: { minX: 124, maxX: 142, minZ: 483, maxZ: 489 }, House_ES2: { minX: 152, maxX: 172, minZ: 483, maxZ: 489 },
    House_ES3: { minX: 184, maxX: 204, minZ: 483, maxZ: 489 }, House_ES4: { minX: 216, maxX: 230, minZ: 483, maxZ: 489 },
    House_SW1: { minX: 70, maxX: 90, minZ: 520, maxZ: 526 }, House_SE1: { minX: 104, maxX: 124, minZ: 520, maxZ: 526 },
  };
  for (const [id, box] of Object.entries(HOUSES)) {
    if (L0610_COLLAPSED_HOUSES.includes(id)) CollapsedHouse(blocks, id, box);
    else House(blocks, id, box);
  }
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

/** 老耿驴车上的几箱弹药：06-3 车走了就跟着没了（随信号体块）。车身顶 = 地面 + 1.025（Script_EditorBlockoutPuppets 的 cart 尺寸）。 */
function CartBoxes(sample) {
  const c = L0610_PLACES.cartStop, k = L0610_PROP_KINDS.AmmoBox;
  const top = sample(c.x, c.z) + 0.75 + 0.55 / 2;
  return [[-0.6, -0.3], [-0.6, 0.35], [0.3, 0.0]].map(([dx, dz], i) =>
    Block(`CartAmmoBox${i + 1}`, c.x + dx, c.z + dz, k.w, k.d, k.h, k.semantic, { y: R2(top + k.h / 2), prop: "AmmoBox", signal: SIG.cartDeparted }));
}

/** 全部体块与随信号体块。 */
export function L0610Blocks(sample) {
  const geng = GengBlocks(sample), village = VillageBlocks(sample);
  const blocks = [...geng.blocks, ...village.blocks, ...PropBlocks(sample)];
  const gates = [...geng.gates, ...village.gates, ...CartBoxes(sample)];
  // 干沟南岸一排枯树（0105 的表）
  L0610_FROM_0105.gullyTrees.forEach((t, i) => blocks.push(Block(`DeadTree_${String(i + 1).padStart(2, "0")}`, t.x, t.z, 0.42, 0.42, t.h, "foliage")));
  // 石碾（东街口）
  const RL = L0610_PLACES.roller;
  blocks.push(Block("RollerBase", RL.x, RL.z, RL.baseW, RL.baseW, RL.baseH, BRICK));
  blocks.push(Block("Roller", RL.x, RL.z, RL.w, RL.d, RL.h, BRICK, { y: R2(sample(RL.x, RL.z) + RL.baseH + RL.h / 2) }));
  // 河汊子沟底的一线浅水（两段）
  const RVW = L0610_RIVER;
  const z0 = RVW.fromZ + RVW.endM, z1 = L0610_BOUNDS.maxZ - 2, zm = (z0 + z1) / 2;
  blocks.push(Block("RiverWater_1", RVW.centerX, (z0 + zm) / 2, RVW.waterW, zm - z0, RVW.waterH, "water", { solid: false }));
  blocks.push(Block("RiverWater_2", RVW.centerX, (zm + z1) / 2, RVW.waterW, z1 - zm, RVW.waterH, "water", { solid: false }));
  return { blocks, gates };
}

// ---------------------------------------------------------------------------
// 核对

/** 当前信号下在场的实心块（gates 按 signal / appearSignal 取舍）。 */
export function SolidBlocks(scene, signals = []) {
  const on = new Set(signals);
  const out = scene.blocks.filter((b) => b.solid !== false && b.semantic !== "water");
  for (const g of scene.gates || []) {
    const absent = (g.signal && on.has(g.signal)) || (g.appearSignal && !on.has(g.appearSignal));
    if (!absent && g.solid !== false) out.push(g);
  }
  return out;
}

/** 块的实际中心高度（显式 y 或落地：脚在中心与四角最低处，同 Levels.GroundedBlock）。 */
export function BlockCenterY(b, sample) {
  if (Number.isFinite(b.y)) return b.y;
  const ry = b.ry || 0, c = Math.cos(ry), s = Math.sin(ry), hx = b.w / 2, hz = b.d / 2;
  let lowest = sample(b.x, b.z);
  for (const [lx, lz] of [[-hx, -hz], [hx, -hz], [-hx, hz], [hx, hz]]) lowest = Math.min(lowest, sample(b.x + lx * c + lz * s, b.z - lx * s + lz * c));
  return lowest + b.h / 2;
}

/**
 * 从 a 到 b（各给 eye 离地高）的视线有没有被实心块挡住：返回第一块挡住的块（按离 a 的远近），没有返回 null。
 * 只看块，不看地面（地面用 SightBlock）。
 */
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

/** 测试与 notes 共用的几条视线。 */
export function L0610SightChecks(scene, sample) {
  const RL = L0610_PLACES.roller, SG = G.sideGate, SW = G.sharedWall, C = G.cellar, CR = G.crack;
  const base = SolidBlocks(scene, []);
  const gateOpen = SolidBlocks(scene, [SIG.sideGateOpen, SIG.cellarBlast]);
  // ① 侧门口（门开了，蹲着眼高 1.2）→ 窖口边站着的人（1.5）
  const pisser = { x: C.x + G.pisserOffset.x, z: C.z + G.pisserOffset.z, eye: 1.5 };
  const doorway = { x: SW.x + 1.1, z: SG.z, eye: 1.2 };
  const sideGateToCellar = { block: BlockSight(gateOpen, sample, doorway, pisser)?.id ?? null, ground: SightBlock(sample, doorway, pisser).block };
  // ② 关着的门：门缝（北侧）里能看见窖口（眼在缝后 0.9 m、对着窖口中心）
  const crackZ = SG.z - SG.w / 2 + (SG.w - SG.leafW) / 2;
  const target = { x: C.x, z: C.z, eye: 1.0 };
  const dir = Math.hypot(target.x - SW.x, target.z - crackZ);
  const eye09_3 = { x: SW.x - 0.9 * (target.x - SW.x) / dir, z: crackZ - 0.9 * (target.z - crackZ) / dir, eye: 1.5 };
  const throughGateCrack = BlockSight(base, sample, eye09_3, target)?.id ?? null;
  const outside = { x: SW.x - 1.0, z: SG.z, eye: 1.6 };
  const gateClosedBlocks = BlockSight(base, sample, outside, pisser)?.id ?? null;
  // ③ 墙缝（z 493）：眼在缝后 0.9 m、对着窖口
  const dir2 = Math.hypot(target.x - SW.x, target.z - CR.z);
  const eye09_2 = { x: SW.x - 0.9 * (target.x - SW.x) / dir2, z: CR.z - 0.9 * (target.z - CR.z) / dir2, eye: 1.5 };
  const throughCrack = BlockSight(base, sample, eye09_2, target)?.id ?? null;
  // ④ 北窗里跪着的机枪手（1.2）→ 村北口站着的人（1.6）；反过来村口蹲着（1.2）→ 窗口
  const mg = { x: G.mgPost.x, z: G.mgPost.z, eye: 1.2 }, mouth = { x: L0610_PLACES.villageMouth.x, z: L0610_PLACES.villageMouth.z, eye: 1.6 };
  const windowToMouth = BlockSight(base, sample, mg, mouth)?.id ?? null;
  const mouthToWindow = BlockSight(base, sample, { ...mouth, eye: 1.2 }, { ...mg, eye: 1.0 })?.id ?? null;
  const windowGround = SightBlock(sample, mg, mouth).block;
  // ⑤ 石碾后趴着（0.5）→ 东街东头站着的人（1.0）
  const prone = { x: RL.x - 2.2, z: RL.z + 0.9, eye: 0.5 }, eastEnd = { x: 230, z: ST.east.z, eye: 1.0 };
  const rollerToEast = BlockSight(SolidBlocks(scene, [SIG.mgSilenced]), sample, prone, eastEnd)?.id ?? null;
  const rollerGround = SightBlock(sample, prone, eastEnd).block;
  // ⑥（第二版）街口坡道上趴着的四个人（0.5）→ 北窗里跪着的机枪手的头（1.15，枪身在窗台上 0.9…1.04）：块与地面都不能挡；翻倒的大车在视线扇外头
  const shooters = L0610_MOUTH_SHOOTERS.map((p) => ({ ...p, eye: 0.5 }));
  const mgHead = { ...mg, eye: 1.15 };
  const shooterToWindow = shooters.map((p) => ({ at: p, block: BlockSight(base, sample, p, mgHead)?.id ?? null, ground: SightBlock(sample, p, mgHead).block }));
  // ⑦（第二版）北窗机枪手（1.2）→ 巷子口与巷子各段（跑的人 1.0 / 蹲的人 0.9）：都得被挡（块或地面）
  const alleyPoints = [
    { name: "巷子口", x: ST.alleyNorth.x, z: L0610_PLACES.alleyMouth.z, eye: 1.0 },
    { name: "夹道中段", x: ST.alleyNorth.x, z: 391, eye: 1.0 },
    { name: "夹道南头", x: ST.alleyNorth.x, z: ST.alleyWest.z, eye: 1.0 },
    { name: "东西那截中段", x: 70, z: ST.alleyWest.z, eye: 1.0 },
    { name: "巷子拐角", x: ST.alleySouth.x, z: ST.alleyWest.z, eye: 1.0 },
    { name: "南北那截", x: ST.alleySouth.x, z: 445, eye: 0.9 },
    { name: "邻院小门口", x: L0610_PLACES.neighborDoor.x - 1, z: L0610_PLACES.neighborDoor.z, eye: 0.9 },
  ];
  const windowToAlley = alleyPoints.map((p) => ({ name: p.name, block: BlockSight(base, sample, mg, p)?.id ?? null, ground: SightBlock(sample, mg, p).block }));
  // ⑧（第二版）09-6：侧门里几步蹲着（1.2）透过前屋南门看机枪组的后背（跪着的人身体中心 0.8）：两人里至少一个看得见
  const eye09_6 = { x: G.sightPost09_6.x, z: G.sightPost09_6.z, eye: 1.2 };
  const mgBacks = [{ who: "机枪手", x: G.mgPost.x, z: G.mgPost.z, eye: 0.8 }, { who: "副射手", x: G.mgLoaderPost.x, z: G.mgLoaderPost.z, eye: 0.8 }];
  const sideToMgBacks = mgBacks.map((t) => ({ who: t.who, block: BlockSight(gateOpen, sample, eye09_6, t)?.id ?? null }));
  // ⑨（第二版）北窗机枪手（1.2）→ 翻倒的大车北侧蹲着的班长（0.9）：要被大车挡住
  const cart = L0610_PLACES.cart;
  const behindCart = { x: cart.x - 0.5, z: cart.z - 1.9, eye: 0.9 };
  const windowToCartHide = BlockSight(base, sample, mg, behindCart)?.id ?? null;
  return {
    sideGateToCellar, gateClosedBlocks, throughGateCrack, throughCrack, windowToMouth, mouthToWindow, windowGround, rollerToEast, rollerGround,
    shooterToWindow, windowToAlley, sideToMgBacks, windowToCartHide,
    eyes: { crack: eye09_2, gateCrack: eye09_3, doorway, prone, side09_6: eye09_6, behindCart },
  };
}

/** 村口路沟某 x 处：沟底、两沿、沟底宽（高度离沟底 15 cm 内的连续一段）。 */
export function DitchSectionAt(sample, x) {
  const floor = sample(x, DT.z);
  let run = 0, best = 0;
  for (let z = DT.z - 6; z <= DT.z + 6; z += 0.1) { if (sample(x, z) <= floor + 0.15) { run += 0.1; best = Math.max(best, run); } else run = 0; }
  return { floor: R2(floor), north: R2(sample(x, DT.z - 6)), south: R2(sample(x, DT.z + 6)), floorW: R2(best) };
}

/** 与 0105 场景文件接得上不：读 Blockout/FirstLevel0105.scene.json（没有就返回 null），在两片重叠的北半截抽样比高度。 */
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

/** 凹路某 z 处：路底高、两侧地面高、深。 */
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

/** 河汊子某 z 处：沟底、两岸、沟底宽（高度离沟底 15 cm 内的连续一段）。 */
export function RiverSectionAt(sample, z) {
  const floor = sample(RV.centerX, z);
  let run = 0, best = 0;
  for (let x = RV.centerX - 10; x <= RV.centerX + 10; x += 0.1) { if (sample(x, z) <= floor + 0.15) { run += 0.1; best = Math.max(best, run); } else run = 0; }
  return { floor: R2(floor), west: R2(sample(RV.centerX - 10, z)), east: R2(sample(RV.centerX + 10, z)), floorW: R2(best) };
}

// ---------------------------------------------------------------------------
// 场景

const Pts = (line) => line.map((p) => ({ x: p.x, z: p.z }));

/** 生成场景文档。commit / generatedAt 由 CLI 传进来；notes 收抽样核对行（CLI 打到控制台）。 */
export async function BuildFirstLevel0610Scene({ commit = "", generatedAt = "", notes = [] } = {}) {
  const { Ground } = L0610Ground();
  const { terrain, minM, maxM } = BakeL0610Grid(Ground);
  const sample = HeightGridSampler(terrain);
  const { blocks, gates } = L0610Blocks(sample);

  const scene = {
    schema: BLOCKOUT_SCENE_SCHEMA,
    level: L0610_LEVEL_KEY,
    source: {
      generator: L0610_SCENE_GENERATOR,
      generatedAt,
      commit,
      notes: `06–10 新剧本白盒（2026-10-19 第二版）：锚点 Data_EditorBlockoutFirstLevel0610Space；高度 ${L0610_CELL_M} m 网格（${minM}…${maxM} m）；`
        + "z<205 逐点等于 FirstLevel0105 的地面（交通沟坡道 / 干沟 / 凹路头一段），往南：凹路南段（路底按弧长缓降缓升，直接接进村口路沟）、村口路沟（东西向、沟底 −0.9、街口南壁放缓成坡道）、"
        + "河汊子（沟底 −2.7 的南北向干沟 + 一线浅水）、耿家庄（整村压平 +0.3、街面压低 12 cm、地瓜窖平底开挖）；体块：院墙带门洞 / 窗洞 / 狗洞 / 墙缝、实心房子、老耿家三间空心屋 + 平顶（没人上房）、"
        + "石磨、窖沿与盖板、翻倒的大车（横在主街偏东）、场院的麦秸垛、东街的土地庙、日常摆件、0105 的南岸枯树；巷子北头的夹道开在路沟南沿上、主街那头封死；"
        + "gates：CartDeparted / SideGateOpen / CellarBlast / MgSilenced / NorthYardGatesBroken / BackVatMoved / BackDoorOpen（10-20 第四版：缸挪开与门开拆成两个信号，窖壁收直到 0.15）。",
    },
    bounds: { ...L0610_BOUNDS },
    spawn: { x: L0610_SPAWN.x, z: L0610_SPAWN.z, yawDeg: L0610_SPAWN.yawDeg },
    terrain,
    blocks,
    gates,
    ways: {
      roads: [
        Pts(LANE.line),
        [{ x: ST.main.x, z: DT.z }, { x: ST.main.x, z: ST.main.toZ }],
        [{ x: ST.east.fromX, z: ST.east.z }, { x: ST.east.toX, z: ST.east.z }],
        [{ x: ST.alleyNorth.x, z: ST.alleyNorth.fromZ }, { x: ST.alleyNorth.x, z: ST.alleyWest.z }, { x: ST.alleySouth.x, z: ST.alleyWest.z }, { x: ST.alleySouth.x, z: ST.alleySouth.toZ }],
        [{ x: ST.backLane.x, z: ST.backLane.fromZ }, { x: ST.backLane.x, z: ST.backLane.toZ }],
      ],
      trenches: [
        Pts(L0610_FROM_0105.trafficTrench.filter((p) => p.z >= L0610_BOUNDS.minZ)),
        [{ x: DT.fromX, z: DT.z }, { x: DT.toX, z: DT.z }],
      ],
    },
  };

  // --- 抽样核对 ---
  const at = (p) => R2(sample(p.x, p.z));
  const PL = L0610_PLACES;
  notes.push(`网格 ${terrain.cols}×${terrain.rows}（${terrain.cellM} m），高度 ${minM}…${maxM} m；体块 ${blocks.length}、随信号体块 ${gates.length}`);
  const cmp = CompareWith0105(sample);
  notes.push(`与 0105 接缝（z 121…190 抽 ${cmp?.samples ?? 0} 点）：${cmp ? `最大差 ${cmp.worst} m（(${cmp.at.x},${cmp.at.z})）` : "没有 0105 场景文件，没比"}；`
    + `干沟沟底 ${at(PL.assembly)}、坡道口 ${at(PL.assemblyEntry)}、凹路口 ${at(PL.laneHead)}、妮儿的坎顶 ${at(PL.nierRim)}、驴车处 ${at(PL.cartStop)}`);
  const lanes = [170, 199, 230, 260, 300, 340, 370, 376].map((z) => { const r = LaneDepthAt(sample, z); return `z${z} 底 ${r.floor} / 旁 ${r.side} 深 ${r.depth}`; });
  notes.push(`凹路：${lanes.join(" · ")}；村口（街口坡道顶 (100,385)）${at(PL.villageMouth)}`);
  const ditches = [60, 80, 100, 115, 124].map((x) => { const r = DitchSectionAt(sample, x); return `x${x} 底 ${r.floor} 沿 ${r.north}/${r.south} 宽 ${r.floorW}`; });
  notes.push(`村口路沟：${ditches.join(" · ")}；街口坡道 z381.5…385 ${[381.5, 382.5, 383.5, 384.3, 385].map((z) => R2(sample(100, z))).join(" → ")}；趴着的人脚下 ${L0610_MOUTH_SHOOTERS.map((p) => `${p.who} ${R2(sample(p.x, p.z))}`).join(" / ")}`);
  const rivers = [215, 260, 400, 500].map((z) => { const r = RiverSectionAt(sample, z); return `z${z} 底 ${r.floor} 岸 ${r.west}/${r.east} 宽 ${r.floorW}`; });
  notes.push(`河汊子：${rivers.join(" · ")}`);
  notes.push(`村里：小空地 ${at(PL.square)} · 后院 ${R2(sample(100, 494))} · 主街 (100,420) ${R2(sample(100, 420))} · 东街 (180,465) ${R2(sample(180, 465))} · 窖底 ${at(PL.cellar)}（深 ${R2(sample(100, 494) - sample(PL.cellar.x, PL.cellar.z))}）· 村南口 ${at(PL.villageSouth)}`);
  const s = L0610SightChecks(scene, sample);
  notes.push(`视线：侧门口→窖边的人 ${s.sideGateToCellar.block ? `被 ${s.sideGateToCellar.block} 挡` : "看得见"}（地面挡 ${s.sideGateToCellar.ground}）· 门关着时 ${s.gateClosedBlocks ? `被 ${s.gateClosedBlocks} 挡` : "居然看得见"}`
    + ` · 门缝里（眼 (${R2(s.eyes.gateCrack.x)},${R2(s.eyes.gateCrack.z)})）→窖口 ${s.throughGateCrack ? `被 ${s.throughGateCrack} 挡` : "看得见"}`
    + ` · 墙缝（眼 (${R2(s.eyes.crack.x)},${R2(s.eyes.crack.z)})）→窖口 ${s.throughCrack ? `被 ${s.throughCrack} 挡` : "看得见"}`);
  notes.push(`视线：北窗→村北口 ${s.windowToMouth ? `被 ${s.windowToMouth} 挡` : "看得见"}（地面挡 ${s.windowGround}）· 村口→北窗 ${s.mouthToWindow ? `被 ${s.mouthToWindow} 挡` : "看得见"}`
    + ` · 石碾后趴着→东街东头 ${s.rollerToEast ? `被 ${s.rollerToEast} 挡` : "看得见"}（地面挡 ${s.rollerGround}）`);
  notes.push(`视线（第二版）：街口坡道上趴着→北窗机枪手 ${s.shooterToWindow.map((r) => `${r.at.who} ${r.block ? `被 ${r.block} 挡` : r.ground > 0 ? `地面挡 ${r.ground}` : "看得见"}`).join(" / ")}`
    + ` · 北窗→巷子 ${s.windowToAlley.map((r) => `${r.name} ${r.block ? `被 ${r.block} 挡` : r.ground > 0 ? "被地面挡" : "看得见！"}`).join(" / ")}`
    + ` · 侧门里 (${s.eyes.side09_6.x},${s.eyes.side09_6.z}) 透过前屋南门看机枪组后背 ${s.sideToMgBacks.map((r) => `${r.who} ${r.block ? `被 ${r.block} 挡` : "看得见"}`).join(" / ")}`
    + ` · 北窗→大车北侧蹲着的人 ${s.windowToCartHide ? `被 ${s.windowToCartHide} 挡` : "看得见！"}`);
  const dh = blocks.filter((b) => b.id.startsWith("SharedWall_")).map((b) => [b.z - b.d / 2, b.z + b.d / 2]).sort((a, b) => a[0] - b[0]);
  const holes = dh.slice(1).map((r, i) => R2(r[0] - dh[i][1])).filter((w) => w > 0.01);
  notes.push(`共用墙上的口子（从北到南）：${holes.join(" / ")} m（狗洞 / 墙缝 / 侧门）；狗洞过梁下沿 ${R2(blocks.find((b) => b.id === "DogHoleLintel").y - blocks.find((b) => b.id === "DogHoleLintel").h / 2 - sample(81.5, 488))} m`);
  return scene;
}
