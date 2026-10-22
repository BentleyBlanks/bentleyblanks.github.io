// ===========================================================================
// Script_EditorBlockoutFirstLevel1218Scene.mjs —— 第一关 11–18 新剧本白盒（FirstLevel1218）的场景生成器（node 专用，2026-10-23 第二版）
//
// 契约 docs/Data_EditorBlockout.md §2.2（场景文件格式，含 gates 与块的可选 y）、§15 的做法；空间口径是 10-23 的白盒第二版契约。产物：
//   Blockout/FirstLevel1218.scene.json  高度网格 + 体块 + 随信号体块 + 路的中心线
// 跑法：node Taierzhuang1938/Script_EditorBlockoutCli.mjs scene FirstLevel1218 --force
//
// 坐标与尺寸只读 Data_EditorBlockoutFirstLevel1218Space（唯一口径）；本文件只定「怎么烘」：
//   1. 地面：z < seamZ(556) 直接调 0610 的 L0610Ground（村南、窄胡同、河汊子直段逐点一致，两片白盒接得上）；
//      z ≥ seamZ 用本关的地面：平地 = 0105 的 NaturalHeight + 0.3（与 0610 的 BaseHeight 在 z ≥ 372 同一个式子），叠 0610 村子压平的余波，
//      再按锚点开挖 / 堆土：石板桥两头的桥台、渡口空场 / 接收院 / 渡口人家 / 北门内外压平；河堤底下的低洼；河汊子笔直往南通进北沙河
//      （断面照 0610，桥下垫石滩、桥台两头不堆土埂）；两道河堤（浮桥、河汊子入河口留口子）；北沙河（岸坡、河底、浮桥底下一溜浅滩）；
//      河滩车道压低；浮桥两头的引道；朝东北的散兵坑；最后一拨人躲的土坎。
//   2. 体块：村南那一截把 0610 的 L0610Blocks 里中心 z ≥ 470 的块原样带过来（0610 的随信号体块取 10-4 五个信号全开的样子，静态），
//      只有庄子西南角塌出豁子的那几块不带、换成缺角的几截 + 瓦砾堆；石板桥（桥面板 + 两个石墩 + 桥下那一汪水）；河汊子沟底的水；
//      浮桥（桥面板 + 船 + 栏杆桩 + 马灯桩）；接收院（院墙带大门、正房 / 灶屋实心、厢房空心 + 平顶 + 门槛）；渡口人家、兵站的土台子；
//      散兵坑东北沿的土袋；摆件；远处（东边）铁路桥的影子；北门城墙与门内的房子、火把桩。
//   3. 随信号体块：CartOverturned（翻倒的驴车 + 车轮）/ BreachBlasted（豁子里再塌一堆）/ ChargesSet（北头四条船上的炸药包 + 引线）/
//      BridgeBlown（北头四段桥面与船没了、碎片漂到下游）。
//
// 纪律：不读时钟、不读 git（commit / generatedAt 由 CLI 传入）；没有随机数，生成两次逐字相同。
// ===========================================================================

import fs from "node:fs";
import { BLOCKOUT_SCENE_SCHEMA } from "./Script_EditorBlockoutConfig.mjs";
import { HeightGridSampler } from "./Script_EditorBlockoutLevels.mjs";
import { BlockStandSampler } from "./Script_EditorBlockoutPrevizPlan.mjs";
import { NaturalHeight as NaturalHeight0105, SightBlock } from "./Script_EditorBlockoutFirstLevel0105Scene.mjs";
import { L0610Ground, L0610Blocks, BlockSight, BlockCenterY, SolidBlocks } from "./Script_EditorBlockoutFirstLevel0610Scene.mjs";
import {
  L1218_LEVEL_KEY, L1218_BOUNDS, L1218_CELL_M, L1218_GROUND, L1218_HEIGHTS, L1218_LANE, L1218_HECHA, L1218_STONE_BRIDGE, L1218_BEACH, L1218_TROUGH,
  L1218_BANK, L1218_LEVEES, L1218_RIVER, L1218_BRIDGE, L1218_FERRY, L1218_TRENCH, L1218_YARD, L1218_BREACH, L1218_RAIL_BRIDGE, L1218_SOUTH,
  L1218_PROP_KINDS, L1218_PROPS, L1218_SIGNALS, L1218_PLACES, L1218_SPAWN, L1218_FROM_0610, TrenchFrame, TrenchPoint,
} from "./Data_EditorBlockoutFirstLevel1218Space.mjs";

export { SightBlock, BlockSight, BlockCenterY, SolidBlocks };
export const L1218_SCENE_GENERATOR = "Script_EditorBlockoutCli.mjs scene FirstLevel1218";

const H = L1218_HEIGHTS;
const SIG = L1218_SIGNALS;
const V = L1218_FROM_0610.village;
const R2 = (v) => Math.round(v * 100) / 100;
const Clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const Smooth = (v) => { const t = Clamp01(v); return t * t * (3 - 2 * t); };
const Lerp = (a, b, t) => a + (b - a) * t;

// ---------------------------------------------------------------------------
// 1. 地面

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
/** 点到折线的距离与弧长位置。 */
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
/** 平底开挖：box 里到 floorY，外侧 wallM 内斜起。 */
function CarveBox(h, x, z, box, floorY, wallM) {
  const sdf = RectSdf(x, z, box);
  if (sdf >= wallM) return h;
  const k = sdf <= 0 ? 1 : 1 - Smooth(sdf / wallM);
  return Math.min(h, Lerp(h, floorY, k));
}

// 0610 的地面（z < seamZ 整个照抄）
let ground0610 = null;
function Ground0610(x, z) {
  if (!ground0610) ground0610 = L0610Ground().Ground;
  return ground0610(x, z);
}
/** 0610 村子压平的余波（同 0610 的 VillageWeight：box 到 z 548、fadeM 10）。 */
function VillageWeight(x, z) { return 1 - Smooth(RectOutside(x, z, V.box) / V.fadeM); }
/** 平地：0105 的自然起伏 + 0.3（0610 的 BaseHeight 在 z ≥ 372 就是这个数），叠村子压平。 */
export function PlainHeight(x, z) {
  let h = NaturalHeight0105(x, z) + L1218_GROUND.plainY;
  const vw = VillageWeight(x, z);
  if (vw > 0) h = Lerp(h, V.y, vw);
  return h;
}

// 压平的几片：石板桥两头的桥台、渡口空场、接收院、渡口人家、北门内外
const SB = L1218_STONE_BRIDGE;
const FLATS = Object.freeze([
  { box: SB.pads.east, y: H.bridgeDeckY, fadeM: SB.padFadeM },
  { box: SB.pads.west, y: H.bridgeDeckY, fadeM: SB.padFadeM },
  { box: L1218_FERRY.square, y: H.plain, fadeM: 3 },
  { box: L1218_YARD.box, y: H.plain, fadeM: 3 },
  ...L1218_FERRY.houses.map((box) => ({ box, y: H.plain, fadeM: 2 })),
  { box: L1218_SOUTH.flatBox, y: H.gateYardY, fadeM: 4 },
]);
function Flatten(h, x, z) {
  for (const f of FLATS) {
    const w = 1 - Smooth(RectOutside(x, z, f.box) / f.fadeM);
    if (w > 0) h = Lerp(h, f.y, w);
  }
  return h;
}

// 河汊子：横断面照 0610 的 RiverCarve（沟底绝对高、两壁陡起、岸上一道土埂），笔直往南通进北沙河；桥下垫石滩；桥台两头与入河口不堆土埂
const HC = L1218_HECHA;
export const HECHA_FLOOR_Y = R2(V.y - HC.depth);   // −2.7，与 0610 的 RIVER_FLOOR_Y 同一个数
const HECHA_BOX = Object.freeze({ minX: HC.centerX - HC.floorW / 2, maxX: HC.centerX + HC.floorW / 2, minZ: HC.fromZ, maxZ: HC.mouthZ + 30 });
export const HECHA_WEST_RIM_X = HC.centerX - HC.floorW / 2 - HC.wallM;   // 29
export const HECHA_EAST_RIM_X = HC.centerX + HC.floorW / 2 + HC.wallM;   // 40
/** 桥下石滩的权重（1 = 沟底抬到 bridgeSillY）。 */
function SillWeight(z) {
  const over = Math.max(SB.sill.fromZ - z, 0, z - SB.sill.toZ);
  return 1 - Smooth(over / SB.sill.wallM);
}
export function HechaFloorY(z) { return Lerp(HECHA_FLOOR_Y, H.bridgeSillY, SillWeight(z)); }
/** 土埂在这段 z 上堆不堆（1 = 堆；bankOff 的每一段从 fromZ+fadeM 起没了、toZ+fadeM 起回来）。 */
function BankFactor(z) {
  let f = 1;
  for (const o of HC.bankOff) f *= 1 - Smooth((z - o.fromZ) / o.fadeM) * (1 - Smooth((z - o.toZ) / o.fadeM));
  return f;
}
function HechaCarve(h, x, z) {
  const sdf = RectSdf(x, z, HECHA_BOX);
  if (sdf >= HC.wallM + HC.bankW) return h;
  if (sdf < HC.wallM) {
    const k = sdf <= 0 ? 1 : 1 - Smooth(sdf / HC.wallM);
    return Math.min(h, Lerp(h, HechaFloorY(z), k));
  }
  const u = (sdf - HC.wallM) / HC.bankW;
  return h + HC.bankH * Math.sin(u * Math.PI) * BankFactor(z);
}
export function DistanceToHecha(x) { return Math.abs(x - HC.centerX); }

// 河堤底下的低洼（北堤北脚）：在堤之前挖，堤坡用 max 盖回去
const TG = L1218_TROUGH;
function Trough(h, x, z) { return CarveBox(h, x, z, TG.box, TG.floorY, TG.wallM); }

// 两道河堤：顶 1.5、顶宽 2、底半宽 4；浮桥 / 河汊子入河口留口子（口子两头 1.5 m 过渡）
const LV = L1218_LEVEES;
function LeveeWeight(z, zc) {
  const dz = Math.abs(z - zc), half = LV.crestW / 2;
  if (dz >= LV.baseHalfW) return 0;
  return dz <= half ? 1 : 1 - Smooth((dz - half) / (LV.baseHalfW - half));
}
function GapWeight(x, gap) {
  const c = (gap.minX + gap.maxX) / 2, half = (gap.maxX - gap.minX) / 2;
  return Smooth((Math.abs(x - c) - half) / 1.5);
}
function Levees(h, x, z) {
  for (const L of [LV.north, LV.south]) {
    let w = LeveeWeight(z, L.z);
    for (const gap of L.gaps) w *= GapWeight(x, gap);
    if (w > 0) h = Math.max(h, Lerp(h, H.leveeCrestY, w));
  }
  return h;
}

// 北沙河：堤脚 → 水边斜下，水边 → 河底再落一截，河底平
const RV = L1218_RIVER;
function RiverProfile(h, z) {
  if (z <= RV.northToeZ || z >= RV.southToeZ) return h;
  if (z < RV.waterMinZ) return Lerp(h, H.waterY, (z - RV.northToeZ) / (RV.waterMinZ - RV.northToeZ));
  if (z > RV.waterMaxZ) return Lerp(h, H.waterY, (RV.southToeZ - z) / (RV.southToeZ - RV.waterMaxZ));
  const edge = Math.min(z - RV.waterMinZ, RV.waterMaxZ - z);   // 离水边多远
  return Lerp(H.waterY, H.riverBedY, Smooth(edge / 2));
}

// 浮桥两头的引道（穿过堤口子，平地高 → 桥面高）与桥底下那一溜浅滩
const BR = L1218_BRIDGE;
const RAMP_HALF_W = 1.75, RAMP_WALL_M = 0.6;
function Ramps(h, x, z) {
  for (const [fromZ, toZ] of [[BR.northRampFromZ, BR.northFootZ], [BR.southRampToZ, BR.southFootZ]]) {
    const dx = Math.abs(x - BR.x) - RAMP_HALF_W;
    const lo = Math.min(fromZ, toZ), hi = Math.max(fromZ, toZ);
    const over = Math.max(lo - z, 0, z - hi);
    if (dx >= RAMP_WALL_M || over >= RAMP_WALL_M) continue;
    const t = Clamp01((z - fromZ) / (toZ - fromZ));
    const floor = Lerp(PlainHeight(BR.x, fromZ), H.deckTopY, t);
    const k = (1 - Smooth(Math.max(dx, 0) / RAMP_WALL_M)) * (1 - Smooth(over / RAMP_WALL_M));
    h = Math.min(h, Lerp(h, floor, k));
  }
  return h;
}
function BridgeBar(h, x, z) {
  const wx = 1 - Smooth((Math.abs(x - BR.x) - RV.barHalfW) / 0.6);
  if (wx <= 0) return h;
  const wz = Math.min(Smooth(z - BR.northFootZ), Smooth(BR.southFootZ - z));   // 桥脚外 1 m 内从引道高落到浅滩
  if (wz <= 0) return h;
  return Lerp(h, H.bridgeBarY, wx * wz);
}

// 河滩车道、南岸的路（压低）
const TK = L1218_BEACH.track;
function RunDelta(x, z, axis, c, from, to, half, lower) {
  const along = axis === "z" ? z : x, across = axis === "z" ? x : z;
  const over = Math.max(from - along, 0, along - to);
  const d = Math.hypot(Math.max(Math.abs(across - c) - half, 0), over);
  if (d >= 0.9) return 0;
  return -lower * (1 - Smooth((d + 0.3) / 0.6));
}
function TrackDelta(x, z) {
  const d = Math.max(NearestOnLine(TK.line, x, z).dist - TK.halfW, 0);
  if (d >= 0.9) return 0;
  return -H.trackLower * (1 - Smooth((d + 0.3) / 0.6));
}
function RoadDelta(x, z) {
  const south = RunDelta(x, z, "z", L1218_SOUTH.road.line[0].x, L1218_SOUTH.road.line[0].z, L1218_SOUTH.road.line[1].z, L1218_SOUTH.road.halfW, H.trackLower);
  return Math.min(TrackDelta(x, z), south);
}

// 散兵坑（朝东北，两段，相对开挖 0.9）与土坎（堆起来）
const TR = L1218_TRENCH;
const TF = TrenchFrame(TR);
function TrenchCarve(h, x, z) {
  const dx = x - TF.c.x, dz = z - TF.c.z;
  const u = dx * TF.a.x + dz * TF.a.z, v = dx * TF.f.x + dz * TF.f.z;
  for (const [u0, u1] of TR.segments) {
    const qu = Math.max(u0 - u, 0, u - u1), qv = Math.max(Math.abs(v) - TR.floorW / 2, 0);
    const sdf = Math.hypot(qu, qv);
    if (sdf >= TR.wallM) continue;
    const k = sdf <= 0 ? 1 : 1 - Smooth(sdf / TR.wallM);
    h = Math.min(h, Lerp(h, h - H.trenchDepth, k));
  }
  return h;
}
const BK = L1218_BANK;
function Bank(h, x, z) {
  const w = 1 - Smooth(RectOutside(x, z, BK.box) / BK.slopeM);
  return w > 0 ? Math.max(h, Lerp(h, BK.topY, w)) : h;
}

/** 建好的地面函数。 */
export function L1218Ground() {
  const Ground = (x, z) => {
    if (z < L1218_GROUND.seamZ) return Ground0610(x, z);
    let h = PlainHeight(x, z);
    h = Flatten(h, x, z);
    h = Trough(h, x, z);
    h = HechaCarve(h, x, z);
    h = Levees(h, x, z);
    h = RiverProfile(h, z);
    h += RoadDelta(x, z);
    h = Ramps(h, x, z);
    h = BridgeBar(h, x, z);
    h = TrenchCarve(h, x, z);
    h = Bank(h, x, z);
    return h;
  };
  return { Ground };
}

/** 按 §2.2 烘高度：(cols+1)×(rows+1) 个 int16 小端厘米，heights[iz*(cols+1)+ix]。 */
export function BakeL1218Grid(ground, bounds = L1218_BOUNDS, cellM = L1218_CELL_M) {
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
const T = L1218_YARD.wallT;
const Gap = (c, w) => ({ from: c - w / 2, to: c + w / 2 });

/** 一段轴对齐的墙拆成几块（避开 gaps）。axis "x"：墙沿 x 走、z 固定；"z"：沿 z 走、x 固定。 */
function Wall(out, id, axis, fixed, from, to, gaps = [], h = L1218_YARD.wallH, semantic = WALL, extra = {}) {
  const cuts = gaps.filter((g) => g.to > from && g.from < to).sort((a, b) => a.from - b.from);
  const runs = [];
  let cur = from;
  for (const g of cuts) { if (g.from > cur + 0.01) runs.push([cur, Math.min(g.from, to)]); cur = Math.max(cur, g.to); }
  if (to > cur + 0.01) runs.push([cur, to]);
  runs.forEach(([a, b], i) => {
    const mid = (a + b) / 2, len = b - a;
    const sid = runs.length > 1 ? `${id}_${i + 1}` : id;
    out.push(axis === "x" ? Block(sid, mid, fixed, len, T, h, semantic, extra) : Block(sid, fixed, mid, T, len, h, semantic, extra));
  });
}
/** 门洞上方的过梁（显式 y）：从 bottomH 到 topH。 */
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
function House(out, id, box, h, semantic = BRICK) {
  out.push(Block(id, (box.minX + box.maxX) / 2, (box.minZ + box.maxZ) / 2, box.maxX - box.minX, box.maxZ - box.minZ, h, semantic, { house: true }));
}
const PropBlock = (id, kind, x, z, ry = 0, extra = {}) => {
  const k = L1218_PROP_KINDS[kind];
  return Block(id, x, z, k.w, k.d, k.h, k.semantic, { ry: Math.round(ry * 1000) / 1000, prop: kind, ...extra });
};

/** 石板桥：桥面板（显式 y，顶在 bridgeDeckY）、两个石墩（立在桥下石滩上）、石滩上那一汪水（不实心）。 */
export function StoneBridgeBlocks() {
  const out = [];
  const deckY = H.bridgeDeckY - SB.deckT / 2;
  out.push(Block("StoneDeck", (SB.fromX + SB.toX) / 2, SB.z, SB.toX - SB.fromX, SB.deckW, SB.deckT, BRICK, { y: R2(deckY), stoneDeck: true }));
  const pierTop = H.bridgeDeckY - SB.deckT, pierH = pierTop - H.bridgeSillY;
  SB.piersAtX.forEach((x, i) => out.push(Block(`StonePier_${i + 1}`, x, SB.z, SB.pierW, SB.pierD, pierH, BRICK, { y: R2(H.bridgeSillY + pierH / 2) })));
  const poolH = H.bridgePoolTopY - H.bridgeSillY;
  out.push(Block("BridgeWater", HC.centerX, (SB.pool.fromZ + SB.pool.toZ) / 2, HC.floorW, SB.pool.toZ - SB.pool.fromZ, poolH, "water", { y: R2(H.bridgePoolTopY - poolH / 2), solid: false }));
  return out;
}

/** 河汊子沟底的一线浅水：接 0610 的 RiverWater_2（到 z 558），桥下那一段让给 BridgeWater，往南到入河口。 */
function HechaWaterBlocks() {
  const runs = [[HC.waterFromZ, SB.pool.fromZ], [SB.pool.toZ, HC.mouthZ - 2]];
  return runs.map(([z0, z1], i) => Block(`HechaWater_${i + 1}`, HC.centerX, (z0 + z1) / 2, HC.waterW, z1 - z0, HC.waterH, "water", { solid: false }));
}

/** 浮桥：14 段桥面板（显式 y）、每段底下一条船、两边栏杆桩、三根挂马灯的桩；北头四段随 BridgeBlown 消失，碎片在下游出现。 */
export function BridgeBlocks() {
  const blocks = [], gates = [];
  const n = BR.segments;
  const segLen = (BR.southFootZ - BR.northFootZ) / n;
  const deckY = H.deckTopY - BR.deckT / 2, boatY = H.deckTopY - BR.deckT - BR.boat.h / 2;
  const blown = new Set(BR.blownSegments);
  const blownToZ = BR.northFootZ + segLen * BR.blownSegments.length;
  const Put = (b, z) => (z < blownToZ ? gates.push({ ...b, signal: SIG.bridgeBlown }) : blocks.push(b));
  for (let i = 0; i < n; i++) {
    const z = BR.northFootZ + segLen * (i + 0.5), id = String(i + 1).padStart(2, "0");
    // 板长多给 2 cm：块中心只记到厘米，相邻两块之间不留缝（缝里站人会掉进河里）
    Put(Block(`Deck_${id}`, BR.x, z, BR.deckW, segLen + 0.02, BR.deckT, WOOD, { y: R2(deckY), deck: true }), z);
    Put(Block(`Boat_${id}`, BR.x, z, BR.boat.acrossX, BR.boat.alongZ, BR.boat.h, WOOD, { y: R2(boatY), boat: true }), z);
    if (blown.has(i)) {
      // 船上绑的炸药包（ChargesSet 起出现；桥一炸跟着船没了）
      gates.push(Block(`Charge_${id}`, BR.x - BR.boat.acrossX / 2 - 0.2, z, 0.3, 0.4, 0.25, "danger", { y: R2(boatY), prop: "Charge", appearSignal: SIG.chargesSet, signal: SIG.bridgeBlown }));
    }
  }
  for (let z = BR.northFootZ + 2; z <= BR.southFootZ - 2; z += BR.postEveryM) {
    for (const side of [-1, 1]) {
      const b = Block(`Post_${side < 0 ? "W" : "E"}${String(Math.round(z)).padStart(3, "0")}`, BR.x + side * (BR.deckW / 2 - 0.1), z, 0.12, 0.12, BR.postH, WOOD, { y: R2(H.deckTopY + BR.postH / 2) });
      Put(b, z);
    }
  }
  for (const z of BR.lanternsAtZ) {
    const x = BR.x - (BR.deckW / 2 - 0.1);
    const k = L1218_PROP_KINDS.Lantern;
    Put(Block(`LanternPost_${z}`, x, z, 0.12, 0.12, BR.postH + 0.6, WOOD, { y: R2(H.deckTopY + (BR.postH + 0.6) / 2) }), z);
    Put(Block(`BridgeLantern_${z}`, x - 0.2, z, k.w, k.d, k.h, k.semantic, { y: R2(H.deckTopY + BR.postH + 0.6 - k.h / 2), prop: "Lantern" }), z);
  }
  // 引线：顺着桥板从北头第四条船拉到南岸
  const F = L1218_FERRY.fuse;
  gates.push(Block("Fuse", F[0].x, (F[0].z + F[1].z) / 2, 0.06, F[1].z - F[0].z, 0.04, "danger", { y: R2(H.deckTopY + 0.02), solid: false, appearSignal: SIG.chargesSet, signal: SIG.bridgeBlown }));
  // 炸断的桥面与歪着的船往下游漂（西）
  BR.debris.forEach((p, i) => {
    const ry = [0.6, -0.9, 1.3, -0.4][i % 4];
    if (i % 2 === 0) gates.push(Block(`DebrisDeck_${i + 1}`, p.x, p.z, BR.deckW, 3.0, BR.deckT, WOOD, { ry, y: R2(H.waterY + BR.deckT / 2), appearSignal: SIG.bridgeBlown }));
    else gates.push(Block(`DebrisBoat_${i + 1}`, p.x, p.z, BR.boat.acrossX, BR.boat.alongZ, BR.boat.h, WOOD, { ry, y: R2(H.waterY - 0.1), appearSignal: SIG.bridgeBlown }));
  });
  return { blocks, gates, segLen, n };
}

/** 接收院：院墙带东墙大门洞；正房、灶屋实心；厢房空心（墙 + 平顶 + 北墙门洞 + 门槛）；麦秸、马灯、灯桩。 */
function YardBlocks(sample) {
  const out = [];
  const Y = L1218_YARD, B = Y.box, X = Y.xiang;
  Wall(out, "YardNorth", "x", B.minZ, B.minX, B.maxX, []);
  Wall(out, "YardSouth", "x", B.maxZ, B.minX, B.maxX, [{ from: X.box.minX - T / 2, to: X.box.maxX + T / 2 }]);   // 厢房那一段由厢房南墙顶替
  Wall(out, "YardWest", "z", B.minX, B.minZ, B.maxZ, []);
  Wall(out, "YardEast", "z", B.maxX, B.minZ, B.maxZ, [Gap(Y.gate.z, Y.gate.w)]);
  Lintel(out, "YardGateLintel", "z", B.maxX, Y.gate.z - Y.gate.w / 2, Y.gate.z + Y.gate.w / 2, 2.0, Y.wallH + 0.3, sample);
  House(out, "YardMainHouse", Y.mainHouse.box, Y.mainHouse.h);
  House(out, "YardKitchen", Y.kitchen.box, Y.kitchen.h);
  // 厢房：北墙开门（带门槛）、其余三面墙、平顶
  Wall(out, "XiangNorth", "x", X.box.minZ, X.box.minX, X.box.maxX, [Gap(X.door.x, X.door.w)], X.h);
  Lintel(out, "XiangDoorLintel", "x", X.box.minZ, X.door.x - X.door.w / 2, X.door.x + X.door.w / 2, X.door.topH, X.h, sample);
  out.push(Block("XiangThreshold", X.door.x, X.box.minZ, X.door.w, X.threshold.d, X.threshold.h, WOOD, { threshold: true }));
  Wall(out, "XiangSouth", "x", X.box.maxZ, X.box.minX, X.box.maxX, [], X.h);
  Wall(out, "XiangWest", "z", X.box.minX, X.box.minZ, X.box.maxZ, [], X.h);
  Wall(out, "XiangEast", "z", X.box.maxX, X.box.minZ, X.box.maxZ, [], X.h);
  Slab(out, "XiangRoof", X.box, X.roofH, sample);
  // 麦秸：院里铺一片薄块（伤员躺的地方）
  const S = Y.strawBox, k = L1218_PROP_KINDS.Straw;
  let i = 0;
  for (let z = S.minZ + k.d / 2 + 0.3; z + k.d / 2 <= S.maxZ; z += k.d + 1.6) {
    for (let x = S.minX + k.w / 2 + 0.3; x + k.w / 2 <= S.maxX; x += k.w + 1.4) {
      // 军医站的地方、从大门到厢房门的过道留空
      if (Math.abs(x - Y.doctorPost.x) < 2.2 && Math.abs(z - Y.doctorPost.z) < 2.2) continue;
      if (z > 617 && x > X.door.x - 5 && x < X.door.x + 5) continue;
      out.push(Block(`Straw_${String(++i).padStart(2, "0")}`, x, z, k.w, k.d, Y.strawW, k.semantic, { ry: (i % 3) * 0.12, prop: "Straw", solid: false }));
    }
  }
  Y.lamps.forEach((p, j) => out.push(PropBlock(`YardLantern_${j + 1}`, "Lantern", p.x, p.z)));
  const GL = Y.gateLamp, lk = L1218_PROP_KINDS.Lantern;
  out.push(Block("YardGateLampPost", GL.x, GL.z, 0.15, 0.15, GL.postH, WOOD));
  out.push(Block("YardGateLamp", GL.x - 0.2, GL.z, lk.w, lk.d, lk.h, lk.semantic, { y: R2(sample(GL.x, GL.z) + GL.lampH), prop: "Lantern" }));
  return out;
}

/** 渡口：院东边两三间渡口人家（实心）+ 兵站的土台子。 */
function FerryBlocks() {
  const out = [];
  L1218_FERRY.houses.forEach((box, i) => House(out, `FerryHouse_${i + 1}`, box, 3.0));
  const p = L1218_FERRY.platform;
  out.push(Block("FerryPlatform", p.x, p.z, p.w, p.d, p.h, EARTH, { platform: true }));
  return out;
}

/** 散兵坑东北沿一溜土袋（每段一块，立在坑沿外的河滩上，顺着坑向）。 */
function TrenchBlocks() {
  const ry = Math.round(TR.faceYawDeg * Math.PI / 180 * 1000) / 1000;   // 块的 w 边顺着坑向（ry 与 three rotation.y 同号：−45° 把 w 边转到西北→东南）
  return TR.segments.map(([u0, u1], i) => {
    const c = TrenchPoint((u0 + u1) / 2, TR.sandbagOffM);
    return Block(`TrenchSandbags_${i + 1}`, c.x, c.z, u1 - u0, 0.6, TR.sandbagH, "canvas", { ry, prop: "Sandbag" });
  });
}

/** 远处铁路桥的影子：两座桥墩 + 一道钢梁 + 两头一截路基。 */
function RailBridgeBlocks(sample) {
  const RB = L1218_RAIL_BRIDGE, out = [];
  RB.piersAtZ.forEach((z, i) => out.push(Block(`RailPier_${i + 1}`, RB.x, z, 2.2, 2.2, RB.girderY - H.riverBedY, BRICK, { y: R2((RB.girderY + H.riverBedY) / 2) })));
  out.push(Block("RailGirder", RB.x, (RB.fromZ + RB.toZ) / 2, 2.6, RB.toZ - RB.fromZ, 0.8, "metal", { y: R2(RB.girderY + 0.4) }));
  for (const [id, z0, z1] of [["RailBankN", RB.fromZ - 10, RB.fromZ], ["RailBankS", RB.toZ, RB.toZ + 10]]) {
    const top = RB.girderY, base = sample(RB.x, (z0 + z1) / 2);
    out.push(Block(id, RB.x, (z0 + z1) / 2, 4.0, z1 - z0, top - base, EARTH, { y: R2((top + base) / 2) }));
  }
  return out;
}

/** 北门：城墙（门洞上方封住）、门内街两边的房子、火把桩。 */
function NorthGateBlocks(sample) {
  const S = L1218_SOUTH, out = [];
  const W = S.wall, G = S.gate;
  Wall(out, "CityWall", "x", W.z, W.fromX, W.toX, [Gap(G.x, G.w)], W.h, BRICK, { d: W.t });   // 城墙 6 m 厚（extra 里的 d 盖过院墙厚度）
  out.push(Block("CityGateTop", G.x, W.z, G.w, W.t, W.h - G.h, BRICK, { y: R2(sample(G.x, W.z) + (W.h + G.h) / 2) }));
  const ST = S.street;
  const houses = [
    ["GateHouse_W1", ST.x - ST.halfW - 1.0 - 4, 866, ST.x - ST.halfW - 1.0, 878], ["GateHouse_W2", ST.x - ST.halfW - 1.0 - 4, 882, ST.x - ST.halfW - 1.0, 894],
    ["GateHouse_E1", ST.x + ST.halfW + 1.0, 866, ST.x + ST.halfW + 1.0 + 4, 878], ["GateHouse_E2", ST.x + ST.halfW + 1.0, 882, ST.x + ST.halfW + 1.0 + 4, 894],
  ];
  for (const [id, x0, z0, x1, z1] of houses) House(out, id, { minX: x0, maxX: x1, minZ: z0, maxZ: z1 }, 3.2);
  S.torches.forEach((p, i) => out.push(PropBlock(`Torch_${i + 1}`, "Torch", p.x, p.z)));
  return out;
}

/** 日常摆件 → 体块。 */
export function PropBlocks() {
  return L1218_PROPS.map((p) => PropBlock(p.id, p.kind, p.x, p.z, p.ry));
}

/** 13-3 翻在河滩上的驴车（CartOverturned 起出现）：车身在 cartRaidAt，一个车轮立在车身上。 */
function CartGates(sample) {
  const c = L1218_PLACES.cartRaidAt, k = L1218_PROP_KINDS.OverturnedCart;
  const x = c.x + 0.3, z = c.z + 0.2, ry = 0.5;
  return [
    PropBlock("OverturnedCart", "OverturnedCart", x, z, ry, { appearSignal: SIG.cartOverturned }),
    PropBlock("OverturnedCartWheel", "CartWheel", x + 0.4, z - 0.5, ry, { y: R2(sample(x, z) + k.h + L1218_PROP_KINDS.CartWheel.h / 2), appearSignal: SIG.cartOverturned }),
  ];
}

/**
 * 庄子西南角的豁子：不带 0610 那几块，换成缺了角的几截（村西边墙到 z 533 为止、村南边墙 / SW1 南墙 / 菜园北篱从 x 46 起）+ 瓦砾堆；
 * BreachBlasted 起豁子里再塌一堆。
 */
function BreachBlocks() {
  const B = L1218_BREACH, V0 = L1218_FROM_0610.village;
  const out = [], gates = [];
  out.push(Block("VillageWestEdge_N", B.westWall.x, (470 + B.westWall.fromZ) / 2, T, B.westWall.fromZ - 470, V0.wallH, WALL));   // 0610 那块从 z 385 起；1218 只带 z ≥ 470 那一截
  out.push(Block("VillageSouthEdge_E", (B.southEdge.toX + 116.25) / 2, B.southEdge.z, 116.25 - B.southEdge.toX, T, V0.wallH, WALL));
  out.push(Block("Wall_SW1_SouthE", (B.southWall.toX + 61.25) / 2, B.southWall.z, 61.25 - B.southWall.toX, T, V0.wallH, WALL));
  const sw1b = L1218_FROM_0610.sw1b;
  out.push(Block("Fence_SW1b_NE", (B.fenceFromX + sw1b.box.maxX) / 2, sw1b.box.minZ, sw1b.box.maxX - B.fenceFromX, 0.3, V0.fenceH, EARTH, { fence: true }));
  for (const [id, r] of [["BreachRubble", B.rubble], ["BreachRubbleWest", B.rubbleWest]]) out.push(Block(id, r.x, r.z, r.w, r.d, r.h, EARTH, { ry: r.ry, prop: "Rubble" }));
  const rb = B.rubbleBlast;
  gates.push(Block("BreachRubbleBlast", rb.x, rb.z, rb.w, rb.d, rb.h, EARTH, { ry: rb.ry, prop: "Rubble", appearSignal: SIG.breachBlasted }));
  return { blocks: out, gates };
}

/** 村南那一截：0610 的块（中心 z ≥ 470）原样带过来；0610 的随信号体块按 10-4 五个信号全开的样子取静态；豁子那几块不带。 */
function BlocksFrom0610(sample) {
  const from = L0610Blocks(sample);
  const drop = new Set(L1218_BREACH.removes0610);
  const blocks = from.blocks.filter((b) => b.z >= 470 && !drop.has(b.id));
  const gates = from.gates.filter((g) => g.z >= 470 && g.appearSignal && !/^CellarSmoke/.test(g.id))
    .map(({ appearSignal, ...rest }) => ({ ...rest, from0610: appearSignal }));
  return [...blocks, ...gates];
}

/** 全部体块与随信号体块。sample0610：给 0610 的块用的采样（z < 480 出界的地方按 0610 的解析地面）。 */
export function L1218Blocks(sample, sample0610 = sample) {
  const bridge = BridgeBlocks();
  const breach = BreachBlocks();
  const blocks = [
    ...BlocksFrom0610(sample0610), ...breach.blocks,
    ...StoneBridgeBlocks(), ...HechaWaterBlocks(),
    ...YardBlocks(sample), ...FerryBlocks(), ...TrenchBlocks(), ...bridge.blocks, ...RailBridgeBlocks(sample), ...NorthGateBlocks(sample), ...PropBlocks(),
  ];
  // 北沙河：水面一整块
  blocks.push(Block("RiverWater", (L1218_BOUNDS.minX + L1218_BOUNDS.maxX) / 2, (RV.waterMinZ + RV.waterMaxZ) / 2, L1218_BOUNDS.maxX - L1218_BOUNDS.minX, RV.waterMaxZ - RV.waterMinZ, 0.12, "water",
    { y: R2(H.waterY - 0.06), solid: false }));
  const gates = [...CartGates(sample), ...breach.gates, ...bridge.gates];
  return { blocks, gates };
}

// ---------------------------------------------------------------------------
// 3. 核对

/** 接缝 z = seamZ 两侧与 0610 地面逐点比（0610 的解析地面；另有 0610 场景文件时也比一遍）。 */
export function CompareWith0610(sample) {
  const g = L0610Ground().Ground;
  let worst = 0, at = null, n = 0;
  for (const z of [L1218_GROUND.seamZ - 1, L1218_GROUND.seamZ - 0.5, L1218_GROUND.seamZ, L1218_GROUND.seamZ + 0.5, L1218_GROUND.seamZ + 1]) {
    for (let x = -20; x <= 150; x += 1) {
      const d = Math.abs(sample(x, z) - g(x, z));
      n++;
      if (d > worst) { worst = d; at = { x, z }; }
    }
  }
  let file = null;
  const url = new URL("./Blockout/FirstLevel0610.scene.json", import.meta.url);
  if (fs.existsSync(url)) {
    const other = HeightGridSampler(JSON.parse(fs.readFileSync(url, "utf8")).terrain);
    let w2 = 0, at2 = null, n2 = 0;
    for (let z = 481; z <= 555; z += 1.5) for (let x = -18; x <= 148; x += 2) { const d = Math.abs(sample(x, z) - other(x, z)); n2++; if (d > w2) { w2 = d; at2 = { x, z }; } }
    file = { worst: R2(w2), at: at2, samples: n2 };
  }
  return { worst: R2(worst), at, samples: n, file };
}

/** 横断面：沿 (nx,nz) 方向过 (x,z) 量沟底（离最低点 tol 内的连续一段）与两岸。 */
export function SectionAt(sample, x, z, nx, nz, halfM = 8, tol = 0.15) {
  const floor = sample(x, z);
  let run = 0, best = 0;
  for (let s = -halfM; s <= halfM; s += 0.1) { if (sample(x + nx * s, z + nz * s) <= floor + tol) { run += 0.1; best = Math.max(best, run); } else run = 0; }
  return { floor: R2(floor), minus: R2(sample(x - nx * halfM, z - nz * halfM)), plus: R2(sample(x + nx * halfM, z + nz * halfM)), floorW: R2(best) };
}
/** 河汊子某 z 处的断面（东西向切）。 */
export function HechaSectionAtZ(sample, z, halfM = 9) { return { z, x: HC.centerX, ...SectionAt(sample, HC.centerX, z, 1, 0, halfM) }; }

/** 墙根小路沿线每 0.5 m 的地面（中线与两侧 ±halfW−0.25）：最大坡（每 0.5 m 的落差）、最大横向高差、起止高度。z < fromZ 的点跳过（村南口的墙根）。 */
export function LaneProfile(sample, { fromZ = 547, lat = L1218_LANE.halfW - 0.25 } = {}) {
  const line = L1218_LANE.line;
  const pts = [];
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1], b = line[i], len = Math.hypot(b.x - a.x, b.z - a.z), n = Math.max(1, Math.ceil(len / 0.5));
    const nx = -(b.z - a.z) / len, nz = (b.x - a.x) / len;   // 左手法线
    for (let k = i === 1 ? 0 : 1; k <= n; k++) {
      const t = k / n, x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
      if (z < fromZ) continue;
      pts.push({ x: R2(x), z: R2(z), y: sample(x, z), left: sample(x + nx * lat, z + nz * lat), right: sample(x - nx * lat, z - nz * lat) });
    }
  }
  let maxStep = 0, maxLat = 0, at = null;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const lat2 = Math.max(Math.abs(p.left - p.y), Math.abs(p.right - p.y));
    if (lat2 > maxLat) { maxLat = lat2; at = p; }
    if (i) { const step = Math.abs(p.y - pts[i - 1].y); if (step > maxStep) maxStep = step; }
  }
  return { points: pts, maxStep: R2(maxStep), maxLat: R2(maxLat), at, start: R2(pts[0].y), end: R2(pts[pts.length - 1].y) };
}

/** 一条线附近（离线段 < withinM）有没有挡路的实心块（h ≥ minH）。 */
export function BlocksNearLine(blocks, line, withinM, minH = 0.5) {
  const hits = [];
  for (const b of blocks) {
    if (b.solid === false || b.semantic === "water" || b.h < minH) continue;
    const r = Math.hypot(b.w / 2, b.d / 2);
    for (let i = 1; i < line.length; i++) {
      const a = line[i - 1], c = line[i], dx = c.x - a.x, dz = c.z - a.z, l2 = dx * dx + dz * dz;
      const t = l2 ? Math.max(0, Math.min(1, ((b.x - a.x) * dx + (b.z - a.z) * dz) / l2)) : 0;
      const d = Math.hypot(b.x - a.x - dx * t, b.z - a.z - dz * t);
      if (d < withinM + r && RectDist(b, a.x + dx * t, a.z + dz * t) < withinM) { hits.push(b.id); break; }
    }
  }
  return hits;
}
/** 点到旋转块脚印的距离（里面为 0）。 */
export function RectDist(b, x, z) {
  const c = Math.cos(b.ry || 0), s = Math.sin(b.ry || 0), dx = x - b.x, dz = z - b.z;
  const lx = dx * c - dz * s, lz = dx * s + dz * c;
  return Math.hypot(Math.max(Math.abs(lx) - b.w / 2, 0), Math.max(Math.abs(lz) - b.d / 2, 0));
}

const EYE = { stand: 1.62, crouch: 1.05, prone: 0.5 };
/** 测试与 notes 共用的几条视线。stand：站人取地（高度场 + ≤ 1 m 的块顶）；眼高按站的地方算（机枪手趴在瓦砾堆上）。 */
export function L1218SightChecks(scene, sample, stand = sample) {
  const PL = L1218_PLACES, B = L1218_BREACH, Y = L1218_YARD;
  const base = SolidBlocks(scene, []);
  const Eye = (p, eyeH) => ({ x: p.x, z: p.z, eye: R2(stand(p.x, p.z) - sample(p.x, p.z) + eyeH) });
  const Check = (blocks, a, b) => ({ block: BlockSight(blocks, sample, a, b)?.id ?? null, ground: SightBlock(sample, a, b).block, distM: R2(Math.hypot(a.x - b.x, a.z - b.z)) });
  const mgEye = Eye(B.mgPost, EYE.prone);
  const mgBlocks = base.filter((b) => !/^BreachRubble/.test(b.id));   // 机枪手自己趴的那堆不算挡
  // ① 豁子上的机枪（趴在瓦砾堆上）→ 石板桥西头站着的人
  const mgToBridge = Check(mgBlocks, mgEye, { ...B.eyeTargets.bridgeWest, eye: EYE.stand });
  // ② → 渡口人堆
  const mgToCrowd = Check(mgBlocks, mgEye, { ...B.eyeTargets.ferryCrowd, eye: EYE.stand });
  // ③ → 河堤底下低洼里趴着的人（要挡住）
  const mgToTrough = Check(mgBlocks, mgEye, { ...B.eyeTargets.trough, eye: EYE.prone });
  // ④ 18 石板桥西头趴着的机枪 → 土坎西边蹲着的最后一拨人（要挡住）；⑤ → 离开土坎往渡口跑的人（看得见）
  const mg18 = { ...PL.ijaMg18, eye: EYE.prone };
  const mg18ToCover = Check(base, mg18, { ...PL.lastGroupCover, eye: EYE.crouch });
  const mg18ToExposed = Check(base, mg18, { ...PL.lastGroupExposed, eye: EYE.crouch });
  // ⑥ 散兵坑里站着（坑底 + 1.62）越过土袋看石板桥西头
  const slot = TrenchPoint(L1218_TRENCH.slots[1]);
  const trenchToBridge = Check(base, { ...slot, eye: EYE.stand }, { ...PL.bridgeWest, eye: 1.0 });
  // ⑦ 村南口站着往西看石板桥西头
  const villageToBridge = Check(base, { ...L1218_SPAWN, eye: EYE.stand }, { ...PL.bridgeWest, eye: 1.0 });
  // ⑧ 南岸堤后站着越过南堤看北岸堤上的人；⑨ 18-4 从南岸看院门里侧灯桩上那盏马灯（桥炸了以后）
  const southToNorth = Check(base, { ...PL.southLeveeCover, eye: EYE.stand }, { x: PL.southLeveeCover.x, z: RV.northToeZ, eye: 1.6 });
  const lamp = scene.blocks.find((b) => b.id === "YardGateLamp");
  const lampEye = { x: lamp.x, z: lamp.z, eye: R2(lamp.y - sample(lamp.x, lamp.z)) };
  const southToLamp = Check(SolidBlocks(scene, [SIG.chargesSet, SIG.bridgeBlown]).filter((b) => b.id !== "YardGateLamp"), { ...PL.southLeveeCover, eye: EYE.stand }, lampEye);
  const southToInnerLamp = Check(base.filter((b) => !/^YardLantern/.test(b.id)), { ...PL.southLeveeCover, eye: EYE.stand }, { ...Y.lamps[1], eye: 0.2 });
  return { mgToBridge, mgToCrowd, mgToTrough, mg18ToCover, mg18ToExposed, trenchToBridge, villageToBridge, southToNorth, southToLamp, southToInnerLamp, eyes: { mgEye, mg18, lampEye, slot } };
}

// ---------------------------------------------------------------------------
// 4. 场景

const Pts = (line) => line.map((p) => ({ x: p.x, z: p.z }));

/** 生成场景文档。commit / generatedAt 由 CLI 传进来；notes 收抽样核对行（CLI 打到控制台）。 */
export async function BuildFirstLevel1218Scene({ commit = "", generatedAt = "", notes = [] } = {}) {
  const { Ground } = L1218Ground();
  const { terrain, minM, maxM } = BakeL1218Grid(Ground);
  const sample = HeightGridSampler(terrain);
  // 0610 带过来的块里有些中心在 z 470…480（出了本关范围），显式 y 按 0610 的解析地面采，和 0610 场景里一个数
  const sample0610 = (x, z) => (z < L1218_BOUNDS.minZ ? Ground0610(x, z) : sample(x, z));
  const { blocks, gates } = L1218Blocks(sample, sample0610);

  const scene = {
    schema: BLOCKOUT_SCENE_SCHEMA,
    level: L1218_LEVEL_KEY,
    source: {
      generator: L1218_SCENE_GENERATOR,
      generatedAt,
      commit,
      notes: `11–18 新剧本白盒第二版（10-23 契约）：锚点 Data_EditorBlockoutFirstLevel1218Space；高度 ${L1218_CELL_M} m 网格（${minM}…${maxM} m）；`
        + `z<${L1218_GROUND.seamZ} 逐点等于 FirstLevel0610 的地面（村南 / 窄胡同 / 河汊子直段），往南：墙根小路、河汊子笔直通进北沙河（沟底 −2.7，桥下石滩 ${H.bridgeSillY}）、`
        + `石板桥（桥面 ${H.bridgeDeckY} 与两岸齐平）、河滩与车道、河堤底下的低洼（${H.troughFloorY}）、两道河堤（顶 1.5，浮桥与河汊子口留口子）、北沙河（水面 −1.6、河底 −2.6、浮桥底下浅滩 −1.85）、`
        + "浮桥引道、渡口空场 / 接收院 / 渡口人家 / 北门压平、朝东北的散兵坑、最后一拨人躲的土坎；"
        + "体块：0610 村南那一截（庄子西南角换成塌了角的墙 + 瓦砾堆）、石板桥（桥面板 / 石墩 / 桥下的水）、浮桥（桥面板 / 船 / 栏杆桩 / 马灯桩）、接收院（厢房空心带门槛）、渡口人家与土台子、土袋、摆件、远处铁路桥（东边）、北门城墙与街房；"
        + "gates：CartOverturned / BreachBlasted / ChargesSet / BridgeBlown。",
    },
    bounds: { ...L1218_BOUNDS },
    spawn: { x: L1218_SPAWN.x, z: L1218_SPAWN.z, yawDeg: L1218_SPAWN.yawDeg },
    terrain,
    blocks,
    gates,
    ways: {
      roads: [
        Pts(L1218_LANE.line),
        [{ x: SB.fromX, z: SB.z }, { x: SB.toX, z: SB.z }],
        Pts(TK.line),
        Pts(L1218_SOUTH.road.line),
        [{ x: BR.x, z: BR.northRampFromZ }, { x: BR.x, z: BR.southRampToZ }],
        [{ x: L1218_SOUTH.street.x, z: L1218_SOUTH.street.fromZ }, { x: L1218_SOUTH.street.x, z: L1218_SOUTH.street.toZ }],
      ],
      trenches: TR.segments.map(([u0, u1]) => [TrenchPoint(u0), TrenchPoint(u1)]),
    },
  };

  // --- 抽样核对 ---
  const at = (p) => R2(sample(p.x, p.z));
  const PL = L1218_PLACES;
  notes.push(`网格 ${terrain.cols}×${terrain.rows}（${terrain.cellM} m），高度 ${minM}…${maxM} m；体块 ${blocks.length}、随信号体块 ${gates.length}`);
  const cmp = CompareWith0610(sample);
  notes.push(`与 0610 接缝（z ${L1218_GROUND.seamZ}±1 抽 ${cmp.samples} 点）：最大差 ${cmp.worst} m（(${cmp.at.x},${cmp.at.z})）`
    + (cmp.file ? `；与 0610 场景文件（z 481…555 抽 ${cmp.file.samples} 点）最大差 ${cmp.file.worst} m` : "；没有 0610 场景文件，没比"));
  const lane = LaneProfile(sample);
  const laneBlocks = BlocksNearLine(blocks, L1218_LANE.line.filter((p) => p.z >= 547), L1218_LANE.halfW - 0.25);
  notes.push(`墙根小路：村南口 ${at(PL.villageSouth)} → 拐弯 ${at(PL.laneBend)} → 桥东头 ${at(PL.bridgeEast)}；沿线最陡每 0.5 m 落 ${lane.maxStep}、横向高差 ${lane.maxLat}（(${lane.at?.x},${lane.at?.z})）；`
    + `离中线 ${L1218_LANE.halfW - 0.25} m 内挡路的块：${laneBlocks.length ? laneBlocks.join(",") : "无"}`);
  const hechas = [560, 575, 590, 610, 620, 645].map((z) => { const r = HechaSectionAtZ(sample, z); return `z${z} 底 ${r.floor} 岸 ${r.minus}/${r.plus} 宽 ${r.floorW}`; });
  notes.push(`河汊子：${hechas.join(" · ")}；桥下 (34.5,566) ${R2(sample(34.5, 566))}（石滩）、入河口 (34.5,648) ${R2(sample(34.5, 648))}`);
  const deck = blocks.find((b) => b.id === "StoneDeck");
  notes.push(`石板桥：桥面顶 ${R2(deck.y + deck.h / 2)}，东头 (41,566) ${R2(sample(41, 566))} / 西头 (28,566) ${R2(sample(28, 566))}；桥台 (44,566) ${R2(sample(44, 566))}、(24,566) ${R2(sample(24, 566))}`);
  notes.push(`河滩：(10,580) ${R2(sample(10, 580))}、翻车处 ${at(PL.cartRaidAt)}、河堤底下 ${at(PL.troughAt)}（低洼北沿 (13,623) ${R2(sample(13, 623))}）、土坎顶 (0,583) ${R2(sample(0, 583))}（旁 (-3.6,583.5) ${R2(sample(-3.6, 583.5))}）、`
    + `翻车处到低洼 ${R2(RectOutside(PL.cartRaidAt.x, PL.cartRaidAt.z, TG.box))} m`);
  notes.push(`河堤：北 (-40,636) ${R2(sample(-40, 636))} / 浮桥口子 (-8,636) ${R2(sample(-8, 636))} / 河汊子口子 (34.5,636) ${R2(sample(34.5, 636))}；南 (-40,714) ${R2(sample(-40, 714))} / 口子 (-8,714) ${R2(sample(-8, 714))}；`
    + `北沙河 (-40,675) ${R2(sample(-40, 675))}、桥底浅滩 (-8,675) ${R2(sample(-8, 675))}；引道北 (-8,640) ${R2(sample(-8, 640))} → (-8,646) ${R2(sample(-8, 646))}、南 (-8,704) ${R2(sample(-8, 704))} → (-8,712) ${R2(sample(-8, 712))}`);
  const slot = TrenchPoint(TR.slots[1]), slotOut = TrenchPoint(TR.slots[1], -2.5);
  notes.push(`渡口：空场 (-8,620) ${R2(sample(-8, 620))}、土台子 ${at(PL.platform)}、院里 ${at(L1218_YARD.doctorPost)}、厢房里 ${at(L1218_YARD.dongguaInside)}、散兵坑底 (${slot.x},${slot.z}) ${R2(sample(slot.x, slot.z))}（坑后 ${R2(sample(slotOut.x, slotOut.z))}）、北门 ${at(PL.northGate)}`);
  const stand = BlockStandSampler(blocks, gates, sample, () => false);
  const s = L1218SightChecks(scene, sample, stand);
  const Say = (r) => (r.block ? `被 ${r.block} 挡` : r.ground > 0 ? "被地面挡" : "看得见") + `（地面挡 ${r.ground}，${r.distM} m）`;
  notes.push(`视线：①豁子机枪→石板桥西头 ${Say(s.mgToBridge)} · ②→渡口人堆 ${Say(s.mgToCrowd)} · ③→河堤底下趴着的人 ${Say(s.mgToTrough)}（要挡住）`
    + ` · ④桥头机枪→土坎西边蹲着的人 ${Say(s.mg18ToCover)}（要挡住） · ⑤→离开土坎的人 ${Say(s.mg18ToExposed)} · ⑥散兵坑→石板桥西头 ${Say(s.trenchToBridge)}`
    + ` · ⑦村南口→石板桥西头 ${Say(s.villageToBridge)} · ⑧南堤后→北岸堤脚 ${Say(s.southToNorth)} · ⑨南堤后→院门灯桩上的马灯 ${Say(s.southToLamp)}（院里地上那盏 ${s.southToInnerLamp.block ? `被 ${s.southToInnerLamp.block} 挡` : "看得见"}）`);
  return scene;
}
