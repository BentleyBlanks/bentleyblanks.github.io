// ===========================================================================
// Script_EditorBlockoutFirstLevel1218Scene.mjs —— 第一关 11–18 新剧本白盒（FirstLevel1218）的场景生成器（node 专用，2026-10-26 第三版）
//
// 契约 docs/Data_EditorBlockout.md §2.2（场景文件格式：gates、块的可选 y、paint、colorSemantics、landmarks）、§15 / §16 的做法；
// 空间口径是 10-26 的白盒第三版契约（北沙河村）。产物：
//   Blockout/FirstLevel1218.scene.json  高度网格 + 体块 + 随信号体块 + 地面涂色 + 地标 + 路的中心线
// 跑法：node Taierzhuang1938/Script_EditorBlockoutCli.mjs scene FirstLevel1218 --force
//
// 坐标与尺寸只读 Data_EditorBlockoutFirstLevel1218Space（唯一口径）；本文件只定「怎么烘」：
//   1. 地面：z < seamZ(556) 直接调 0610 的 L0610Ground（村南、窄胡同、河汊子直段逐点一致）；0610 场地以西（x < −60）叠铁路路基；
//      z ≥ seamZ：平地 = 0105 NaturalHeight + 0.3、叠耿家庄压平的余波；北沙河村 / 北门压平；田埂、坟头；河汊子沟尾；土路 / 官道 / 村里小街 / 田间小路 / 南岸路压低
//      （接缝起 4 m 内渐进）；村口反坦克沟（板桥底下的土墩）；村北沿战壕（北沿堆土）；院里躲身的洞（坡道 + 洞内一小间）；
//      沙河（两岸陡坎、沙床、一股浅水、两处滑坡道）；铁路路基（桥头上路基的土坡）；桥北土坎与坎后的洼；南头河堤（南岸路处留口子）与堤后的散兵坑。
//   2. 体块：耿家庄村南那一截（0610 的 L0610Blocks 里中心 z ≥ 470 的块，随信号体块取 10-4 全开的样子，静态）；
//      板桥门板、杂木、铁丝网；北沙河村的院子（院墙、草顶房、老汉家、钻洞的一家、枕木垛、标语、夜里的灯）、德国教堂（顺着街斜摆、钟楼）、
//      救护所（正房 / 灶屋实心，厢房空心带门槛、院里麦秸 / 马灯、两处洞的洞顶）、女娃家（隔墙东半截塌了）；
//      铁路桥（桥台、三座石墩、四孔钢梁、枕木、两根轨）、桥南的轨与枕木；河汊子沟尾的水、沙河那一股水；北门城墙、门内街房、火把；摆件。
//   3. 随信号体块：FamilyHidden（席子盖住洞口）/ CartOverturned（救护所门前翻倒的驴车）/ GirlHoleCovered（女娃家洞口的席子）/
//      ChargesSet（桥墩上的炸药 + 引线）/ BridgeBlown（北头两孔钢梁、枕木、轨没了，断梁砸进河床）。
//
// 纪律：不读时钟、不读 git（commit / generatedAt 由 CLI 传入）；没有随机数，生成两次逐字相同。
// ===========================================================================

import fs from "node:fs";
import { BLOCKOUT_SCENE_SCHEMA, LandmarkIssues } from "./Script_EditorBlockoutConfig.mjs";
import { HeightGridSampler } from "./Script_EditorBlockoutLevels.mjs";
import { BlockStandSampler } from "./Script_EditorBlockoutPrevizPlan.mjs";
import { NaturalHeight as NaturalHeight0105, SightBlock } from "./Script_EditorBlockoutFirstLevel0105Scene.mjs";
import { L0610Ground, L0610Blocks, BlockSight, BlockCenterY, SolidBlocks } from "./Script_EditorBlockoutFirstLevel0610Scene.mjs";
import {
  L1218_LEVEL_KEY, L1218_BOUNDS, L1218_CELL_M, L1218_GROUND, L1218_HEIGHTS, L1218_DIRT_ROAD, L1218_JUNCTION, L1218_POST_ROAD, L1218_STREET, L1218_LANES,
  L1218_VILLAGE_WEST, L1218_FIELD_PATH, L1218_SOUTH_ROAD, L1218_AT_DITCH, L1218_PLANK, L1218_ABATIS, L1218_TRENCH, L1218_WIRE, L1218_VILLAGE, L1218_YARDS,
  L1218_OLD_MAN, L1218_FAMILY_HOLE, L1218_SLEEPER_PILES, L1218_SLOGANS, L1218_CHURCH, L1218_WEST_TURN, L1218_CART_PARK, L1218_AID, L1218_GIRL_YARD, L1218_TREES,
  L1218_GRAVES, L1218_RIDGES, L1218_RIDGE, L1218_RAIL, L1218_RAIL_RAMP, L1218_RAIL_RAMPS, L1218_RIVER, L1218_RAIL_BRIDGE, L1218_BANK, L1218_LEVEE, L1218_NORTH_GATE,
  L1218_PROP_KINDS, L1218_PROPS, L1218_VILLAGE_LIGHTS, L1218_SIGNALS, L1218_PLACES, L1218_SPAWN, L1218_FROM_0610,
  StreetPoint, StreetFrame, STREET_RY, RiverAtX,
} from "./Data_EditorBlockoutFirstLevel1218Space.mjs";

export { SightBlock, BlockSight, BlockCenterY, SolidBlocks };
export const L1218_SCENE_GENERATOR = "Script_EditorBlockoutCli.mjs scene FirstLevel1218";

const H = L1218_HEIGHTS;
const SIG = L1218_SIGNALS;
const V0 = L1218_FROM_0610.village;
const R2 = (v) => Math.round(v * 100) / 100;
const R3 = (v) => Math.round(v * 1000) / 1000;
const Clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const Smooth = (v) => { const t = Clamp01(v); return t * t * (3 - 2 * t); };
const Lerp = (a, b, t) => a + (b - a) * t;

// ---------------------------------------------------------------------------
// 1. 地面

/** 点到矩形（轴对齐）的外部距离；里面为 0。 */
export function RectOutside(x, z, box) {
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
export function NearestOnLine(line, x, z) {
  let best = Infinity, at = 0, walked = 0, q = null;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1], b = line[i];
    const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz);
    const t = len > 0 ? Clamp01(((x - a.x) * dx + (z - a.z) * dz) / (len * len)) : 0;
    const px = a.x + dx * t, pz = a.z + dz * t;
    const d = Math.hypot(x - px, z - pz);
    if (d < best) { best = d; at = walked + len * t; q = { x: px, z: pz }; }
    walked += len;
  }
  return { dist: best, at, q };
}
/** 平底开挖：box 里到 floorY，外侧 wallM 内斜起。 */
function CarveBox(h, x, z, box, floorY, wallM) {
  const sdf = RectSdf(x, z, box);
  if (sdf >= wallM) return h;
  const k = sdf <= 0 ? 1 : 1 - Smooth(sdf / wallM);
  return Math.min(h, Lerp(h, floorY, k));
}

let ground0610 = null;
function Ground0610(x, z) {
  if (!ground0610) ground0610 = L0610Ground().Ground;
  return ground0610(x, z);
}
/** 耿家庄压平的余波（同 0610 的 VillageWeight：box 到 z 548、fadeM 10）。 */
function GengVillageWeight(x, z) { return 1 - Smooth(RectOutside(x, z, V0.box) / V0.fadeM); }
/** 平地：0105 的自然起伏 + 0.3（0610 的 BaseHeight 在 z ≥ 372 就是这个数），叠耿家庄压平。 */
export function PlainHeight(x, z) {
  let h = NaturalHeight0105(x, z) + L1218_GROUND.plainY;
  const vw = GengVillageWeight(x, z);
  if (vw > 0) h = Lerp(h, V0.y, vw);
  return h;
}

const VL = L1218_VILLAGE, NG = L1218_NORTH_GATE;
const FLATS = Object.freeze([
  { box: VL.box, y: VL.y, fadeM: VL.fadeM },
  { box: { minX: 76, maxX: 118, minZ: 621, maxZ: 645 }, y: VL.y, fadeM: 6 },   // 沟口两边压平：板桥两头与官道路面齐平
  { box: NG.flatBox, y: H.gateYardY, fadeM: 4 },
]);
function Flatten(h, x, z) {
  for (const f of FLATS) {
    const w = 1 - Smooth(RectOutside(x, z, f.box) / f.fadeM);
    if (w > 0) h = Lerp(h, f.y, w);
  }
  return h;
}

// 路（中心线 + 半宽 + 压低多少）：车走的、人走的
const ROAD_LINES = Object.freeze([
  { id: "DirtRoad", line: L1218_DIRT_ROAD.line, halfW: L1218_DIRT_ROAD.halfW, lower: H.dirtRoadLower },
  { id: "PostRoadNorth", line: L1218_POST_ROAD.north, halfW: L1218_POST_ROAD.halfW, lower: H.postRoadLower },
  { id: "MainStreet", line: L1218_POST_ROAD.street, halfW: L1218_POST_ROAD.halfW, lower: H.postRoadLower },
  { id: "PostRoadSE", line: L1218_POST_ROAD.southeast, halfW: L1218_POST_ROAD.halfW, lower: H.postRoadLower },
  ...Object.values(L1218_LANES).map((r) => ({ id: r.id, line: RunLine(r), halfW: r.halfW, lower: H.laneLower })),
  { id: "FieldPath", line: L1218_FIELD_PATH.line, halfW: L1218_FIELD_PATH.halfW, lower: 0.06 },
  { id: "SouthRoad", line: L1218_SOUTH_ROAD.line, halfW: L1218_SOUTH_ROAD.halfW, lower: H.laneLower },
  { id: "GateStreet", line: [{ x: NG.street.x, z: NG.street.fromZ }, { x: NG.street.x, z: NG.street.toZ }], halfW: NG.street.halfW, lower: H.laneLower },
]);
/** 轴对齐净空条 → 中线折线。 */
export function RunLine(r) {
  return r.axis === "x" ? [{ x: r.from, z: r.c }, { x: r.to, z: r.c }] : [{ x: r.c, z: r.from }, { x: r.c, z: r.to }];
}
export const L1218_ROAD_LINES = ROAD_LINES;
/** 离最近一条路边多远（米；在路上为负）。 */
export function RoadEdgeDistance(x, z) {
  let best = Infinity;
  for (const r of ROAD_LINES) best = Math.min(best, NearestOnLine(r.line, x, z).dist - r.halfW);
  return best;
}
function RoadDelta(x, z) {
  let lower = 0;
  for (const r of ROAD_LINES) {
    const d = Math.max(NearestOnLine(r.line, x, z).dist - r.halfW, 0);
    if (d >= 0.9) continue;
    lower = Math.max(lower, r.lower * (1 - Smooth((d + 0.3) / 0.6)));
  }
  return -lower * Smooth((z - L1218_GROUND.seamZ - 1) / L1218_GROUND.roadFadeInM);   // 接缝外 1 m 内一点不动（CompareWith0610 抽到 seam+1）
}

// 田埂、坟头（离路 1 m 以内不堆；村里不堆）
function RidgesAndGraves(x, z) {
  let add = 0;
  for (const r of L1218_RIDGES) {
    const over = Math.max(r.fromX - x, 0, x - r.toX), d = Math.hypot(over, Math.max(Math.abs(z - r.z) - L1218_RIDGE.halfW, 0));
    if (d < 0.5) add = Math.max(add, L1218_RIDGE.h * (1 - Smooth(d / 0.5)));
  }
  for (const g of L1218_GRAVES) {
    const d = Math.hypot(x - g.x, z - g.z);
    if (d < g.r) { const t = d / g.r; add = Math.max(add, g.h * (1 - t * t) * (1 - t * t)); }
  }
  if (add <= 0) return 0;
  const road = RoadEdgeDistance(x, z);
  return add * Smooth((road - 0.4) / 0.8);
}

// 河汊子沟尾：0610 的直段（中线 34.5、沟底 −2.7、壁 2.5、岸上土埂）接着往南 18 m，z 574 起沟底渐浅、582 平
const RV0 = L1218_FROM_0610.river;
export const HECHA_FLOOR_Y = R2(V0.y - RV0.depth);   // −2.7，与 0610 的 RIVER_FLOOR_Y 同一个数
export const HECHA_END = Object.freeze({ fullToZ: 574, endZ: 582 });
const HECHA_BOX = Object.freeze({ minX: RV0.centerX - RV0.floorW / 2, maxX: RV0.centerX + RV0.floorW / 2, minZ: 540, maxZ: HECHA_END.endZ });
function HechaFloorY(z) { return Lerp(HECHA_FLOOR_Y, H.plain, Smooth((z - HECHA_END.fullToZ) / (HECHA_END.endZ - HECHA_END.fullToZ))); }
function HechaCarve(h, x, z) {
  const sdf = RectSdf(x, z, HECHA_BOX);
  if (sdf >= RV0.wallM + RV0.bankW) return h;
  if (sdf < RV0.wallM) {
    const k = sdf <= 0 ? 1 : 1 - Smooth(sdf / RV0.wallM);
    return Math.min(h, Lerp(h, HechaFloorY(z), k));
  }
  const u = (sdf - RV0.wallM) / RV0.bankW;
  return h + RV0.bankH * Math.sin(u * Math.PI) * (1 - Smooth((z - HECHA_END.fullToZ) / 6));
}

// 村口反坦克沟（板桥正下方垫土墩）
const AT = L1218_AT_DITCH, PK = L1218_PLANK;
export const AT_FLOOR_BOX = Object.freeze({ minX: AT.fromX + AT.wallM, maxX: AT.toX - AT.wallM, minZ: AT.z - AT.floorW / 2, maxZ: AT.z + AT.floorW / 2 });
function AtDitch(h, x, z) {
  const sdf = RectSdf(x, z, AT_FLOOR_BOX);
  if (sdf >= AT.wallM) return h;
  let floor = AT.floorY;
  const plug = 1 - Smooth((Math.abs(x - PK.x) - PK.plugHalfW) / 0.3);
  if (plug > 0) floor = Lerp(floor, H.plankPlugY, plug);
  const k = sdf <= 0 ? 1 : 1 - sdf / AT.wallM;   // 线性：壁陡
  return Math.min(h, Lerp(h, floor, k));
}

// 村北沿战壕（北沿堆土）
const TR = L1218_TRENCH;
function Trench(h, x, z) {
  let out = h;
  for (const line of [TR.west, TR.east]) {
    const n = NearestOnLine(line, x, z);
    const half = TR.floorW / 2;
    if (n.dist < half + TR.wallM) {
      const k = n.dist <= half ? 1 : 1 - (n.dist - half) / TR.wallM;
      out = Math.min(out, Lerp(h, TR.floorY, k));
    } else if (z < n.q.z - 0.2 && z > 636.5) {
      const u = (n.dist - TR.bermOffM + TR.bermW / 2) / TR.bermW;
      if (u > 0 && u < 1) out = Math.max(out, h + TR.bermH * Math.sin(u * Math.PI));
    }
  }
  return out;
}

// 院里躲身的洞：坡道 + 洞内一小间
export const L1218_HOLES = Object.freeze([L1218_FAMILY_HOLE, ...L1218_AID.holes, L1218_GIRL_YARD.hole].map((h) => ({ ...h, chamber: { ...h.chamber } })));
/** 洞的坐标架：u 顺着往下（从洞口起）、v 横着。 */
export function HoleLocal(hole, x, z) {
  const D = hole.dir, dx = x - hole.mouth.x, dz = z - hole.mouth.z;
  return { u: dx * D.x + dz * D.z, v: -dx * D.z + dz * D.x };
}
export function HoleWorld(hole, u, v) {
  const D = hole.dir;
  return { x: R2(hole.mouth.x + D.x * u - D.z * v), z: R2(hole.mouth.z + D.z * u + D.x * v) };
}
const RAMP_HALF_W = 0.8;
function Holes(h, x, z) {
  for (const hole of L1218_HOLES) {
    const { u, v } = HoleLocal(hole, x, z);
    const c = hole.chamber;
    if (u < -0.4 || u > hole.rampM + c.d + 0.3) continue;
    let floor = null, halfW = 0;
    if (u <= hole.rampM) { floor = Lerp(h, H.holeFloorY, Clamp01(u / hole.rampM)); halfW = RAMP_HALF_W; }
    if (u >= hole.rampM - 0.3) { const f = H.holeFloorY; if (floor === null || f < floor) floor = f; halfW = Math.max(halfW, c.w / 2); }
    const ov = Math.abs(v) - halfW, ou = Math.max(u - (hole.rampM + c.d), -u, 0);
    const out = Math.max(ov, ou);
    if (out >= 0.15) continue;
    const k = out <= 0 ? 1 : 1 - out / 0.15;
    h = Math.min(h, Lerp(h, floor, k));
  }
  return h;
}

// 沙河：两岸陡坎、沙床、中间一股浅水；两处滑坡道
const RVR = L1218_RIVER;
function RiverCut(h, x, z) {
  const r = RiverAtX(x), bed = H.riverBedY;
  let y = h;
  if (z > r.northTop && z < r.southTop) {
    if (z < r.northToe) y = Lerp(h, bed, Smooth((z - r.northTop) / RVR.cliffM));
    else if (z > r.southToe) y = Lerp(h, bed, Smooth((r.southTop - z) / RVR.cliffM));
    else {
      const d = Math.abs(z - r.streamZ) - RVR.stream.halfW;
      y = d <= 0 ? H.streamFloorY : d < RVR.stream.edgeM ? Lerp(H.streamFloorY, bed, Smooth(d / RVR.stream.edgeM)) : bed;
    }
  }
  for (const s of RVR.slides) {
    const w = 1 - Smooth((Math.abs(x - s.x) - s.halfW) / 0.8);
    if (w <= 0) continue;
    const extra = (s.lenM - RVR.cliffM) / 2;
    const [zTop, zBed] = s.bank === "north" ? [r.northTop - extra, r.northToe + extra] : [r.southTop + extra, r.southToe - extra];
    const t = (z - zTop) / (zBed - zTop);
    if (t < 0 || t > 1) continue;
    const ys = Lerp(h, bed, t);
    y = Lerp(y, ys, w);
  }
  return y;
}

// 铁路路基（桥的那一段不堆）+ 桥头上路基的土坡
const RL = L1218_RAIL, RB = L1218_RAIL_BRIDGE;
const RAIL_TOP_HALF = RL.topW / 2;
export const RAIL_TOE_HALF = RAIL_TOP_HALF + (RL.topY - H.plain) * RL.slope;
function Rail(h, x, z) {
  if (z > RB.northZ + 0.6 && z < RB.southZ - 0.6) return h;   // 路基顶伸到坎沿外 0.6 m（桥台挡着）
  const dx = Math.abs(x - RL.x);
  let y = h;
  if (dx < RAIL_TOE_HALF + 0.5) {
    const target = dx <= RAIL_TOP_HALF ? RL.topY : RL.topY - (dx - RAIL_TOP_HALF) / RL.slope;
    y = Math.max(y, target);
  }
  for (const RP of L1218_RAIL_RAMPS) {
    const len = RP.from.x - RP.to.x, t = (RP.from.x - x) / len;
    if (t <= -0.1 || t >= 1.05) continue;
    const wz = 1 - Smooth((Math.abs(z - RP.from.z) - RP.halfW) / 1.0);
    if (wz > 0) y = Math.max(y, Lerp(h, Lerp(H.plain, RL.topY, Clamp01(t)), wz));
  }
  return y;
}

// 桥北土坎 + 坎后的洼
const BK = L1218_BANK;
const BANK_BOX = Object.freeze({ minX: BK.fromX, maxX: BK.toX, minZ: BK.z - BK.halfD, maxZ: BK.z + BK.halfD });
const HOLLOW_BOX = Object.freeze({ minX: BK.fromX, maxX: BK.toX, minZ: BK.hollow.fromZ, maxZ: BK.hollow.toZ });
function Bank(h, x, z) {
  h = CarveBox(h, x, z, HOLLOW_BOX, BK.hollow.y, BK.hollow.fadeM);
  const d = RectOutside(x, z, BANK_BOX);
  if (d < BK.slopeM) h = Math.max(h, Lerp(BK.topY, h, d / BK.slopeM));
  return h;
}

// 南头河堤 + 堤后的散兵坑
const LV = L1218_LEVEE;
function Levee(h, x, z) {
  const dz = Math.abs(z - LV.z), half = LV.crestW / 2;
  if (dz < LV.baseHalfW) {
    let w = dz <= half ? 1 : 1 - Smooth((dz - half) / (LV.baseHalfW - half));
    w *= Smooth((x - LV.fromX + 2) / 4) * Smooth((LV.toX - x) / 6);
    if (w > 0) h = Math.max(h, Lerp(h, LV.crestY, w));
  }
  const FX = LV.foxhole;
  const box = { minX: FX.fromX, maxX: FX.toX, minZ: FX.z - FX.floorW / 2, maxZ: FX.z + FX.floorW / 2 };
  if (RectSdf(x, z, box) < FX.wallM) h = CarveBox(h, x, z, box, h - FX.depth, FX.wallM);
  return h;
}

/** 建好的地面函数。 */
export function L1218Ground() {
  const Ground = (x, z) => {
    if (z < L1218_GROUND.seamZ) {
      const h = Ground0610(x, z);
      return x < L1218_GROUND.railFromX ? Rail(h, x, z) : h;
    }
    let h = PlainHeight(x, z);
    h = Flatten(h, x, z);
    h += RidgesAndGraves(x, z);
    h = HechaCarve(h, x, z);
    h += RoadDelta(x, z);
    h = AtDitch(h, x, z);
    h = Trench(h, x, z);
    h = Holes(h, x, z);
    h = RiverCut(h, x, z);
    h = Bank(h, x, z);
    h = Levee(h, x, z);
    h = Rail(h, x, z);
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
const WALL = "plaster", BRICK = "structure", ROOF = "roof", WOOD = "timber", EARTH = "earthDark", METAL = "metal";
const T = VL.wallT;
const Gap = (c, w) => ({ from: c - w / 2, to: c + w / 2 });

/** 一段轴对齐的墙拆成几块（避开 gaps）。axis "x"：墙沿 x 走、z 固定；"z"：沿 z 走、x 固定。 */
function Wall(out, id, axis, fixed, from, to, gaps = [], h = VL.wallH, semantic = WALL, extra = {}) {
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
/** 实心房子：墙体 + 草顶（屋面块压在上头，出檐 0.3）。 */
function House(out, id, box, h, sample, semantic = WALL) {
  const cx = (box.minX + box.maxX) / 2, cz = (box.minZ + box.maxZ) / 2, w = box.maxX - box.minX, d = box.maxZ - box.minZ;
  out.push(Block(id, cx, cz, w, d, h, semantic, { house: true }));
  out.push(Block(`${id}_Roof`, cx, cz, w + 0.6, d + 0.6, VL.roofH, ROOF, { y: R2(sample(cx, cz) + h + VL.roofH / 2) }));
}
const PropBlock = (id, kind, x, z, ry = 0, extra = {}) => {
  const k = L1218_PROP_KINDS[kind];
  return Block(id, x, z, k.w, k.d, k.h, k.semantic, { ry: R3(ry), prop: kind, ...extra });
};

/** 一个院子：四面墙（朝街那面开院门）、房子。 */
function YardBlocks(yard, sample) {
  const out = [], B = yard.box, g = yard.gate;
  const gap = (wall) => (g.wall === wall ? [Gap(g.at, g.w)] : []);
  Wall(out, `${yard.id}_WallN`, "x", B.minZ, B.minX, B.maxX, gap("n"));
  Wall(out, `${yard.id}_WallS`, "x", B.maxZ, B.minX, B.maxX, gap("s"));
  Wall(out, `${yard.id}_WallW`, "z", B.minX, B.minZ + T / 2, B.maxZ - T / 2, gap("w"));
  Wall(out, `${yard.id}_WallE`, "z", B.maxX, B.minZ + T / 2, B.maxZ - T / 2, gap("e"));
  yard.houses.forEach((hs, i) => House(out, `${yard.id}_House${i + 1}`, hs.box, hs.h || VL.houseH, sample));
  return out;
}

/** 村口：板桥门板（deck）、杂木、铁丝网、沟口机枪位的土袋。 */
function GateOfVillageBlocks() {
  const out = [];
  const bw = PK.w / PK.boards, len = PK.toZ - PK.fromZ;
  for (let i = 0; i < PK.boards; i++) {
    out.push(Block(`Plank_${i + 1}`, PK.x - PK.w / 2 + bw * (i + 0.5), (PK.fromZ + PK.toZ) / 2, bw - 0.03, len, PK.deckT, WOOD, { y: R2(H.plankDeckY - PK.deckT / 2), deck: true, plank: true }));
  }
  // 杂木：沟南沿，板桥口子留空
  const AB = L1218_ABATIS;
  for (const [a, b, side] of [[AT.fromX, PK.x - AB.gapHalfW, "W"], [PK.x + AB.gapHalfW, AT.toX, "E"]]) {
    const n = Math.max(1, Math.round((b - a) / AB.pieceW)), pw = (b - a) / n;
    for (let i = 0; i < n; i++) out.push(Block(`Abatis_${side}${i + 1}`, a + pw * (i + 0.5), AB.z + (i % 2 ? 0.15 : -0.1), pw, AB.d, AB.h - (i % 3) * 0.1, "foliage", { ry: (i % 2 ? 0.05 : -0.04), abatis: true }));
  }
  // 铁丝网：桩 + 两道横线
  const W = L1218_WIRE;
  for (const [side, [a, b]] of [["W", W.west], ["E", W.east]]) {
    const n = Math.round((b - a) / W.postEveryM);
    for (let i = 0; i <= n; i++) out.push(Block(`WirePost_${side}${String(i).padStart(2, "0")}`, a + (b - a) * i / n, W.z, 0.1, 0.1, W.postH, WOOD, { wire: true }));
    W.wireYs.forEach((y, k) => out.push(Block(`Wire_${side}${k + 1}`, (a + b) / 2, W.z, b - a, 0.03, 0.03, METAL, { y: null, lift: y, wire: true })));
  }
  return out;
}

/** 院里的洞：洞顶（土，显式 y；有缝的分两半）。 */
function HoleRoofs(sample) {
  const out = [];
  for (const hole of L1218_HOLES) {
    const c = hole.chamber, u0 = hole.rampM - 0.1, u1 = hole.rampM + c.d + 0.25, top = sample(hole.mouth.x, hole.mouth.z) + 0.04;
    const parts = hole.slitM > 0 ? [[u0, (u0 + u1) / 2 - hole.slitM / 2], [(u0 + u1) / 2 + hole.slitM / 2, u1]] : [[u0, u1]];
    parts.forEach(([a, b], i) => {
      const cp = HoleWorld(hole, (a + b) / 2, 0), along = b - a, across = c.w + 0.5;
      const alongX = Math.abs(hole.dir.x) > 0.5;
      out.push(Block(`${hole.id}_Roof${parts.length > 1 ? i + 1 : ""}`, cp.x, cp.z, alongX ? along : across, alongX ? across : along, L1218_AID.roofT, EARTH, { y: R2(top - L1218_AID.roofT / 2), holeRoof: hole.id }));
    });
  }
  return out;
}

/** 北沙河村：院子、老汉家门口的小凳、钻洞那家的席子（FamilyHidden）、枕木垛、标语、夜里亮灯的几户、树。 */
function VillageBlocks(sample) {
  const blocks = [], gates = [];
  for (const y of L1218_YARDS) blocks.push(...YardBlocks(y, sample));
  const OM = L1218_OLD_MAN;
  blocks.push(Block("OldManStool", OM.at.x, OM.at.z, 0.4, 0.4, 0.4, WOOD, { prop: "Stool" }));
  const FH = L1218_FAMILY_HOLE, mat = HoleWorld(FH, 0.6, 0);
  gates.push(Block("FamilyHoleMat", mat.x, mat.z, FH.mat.w, FH.mat.d, 0.04, "canvas", { y: R2(sample(FH.mouth.x, FH.mouth.z) + 0.02), solid: false, prop: "Mat", appearSignal: SIG.familyHidden }));
  for (const p of L1218_SLEEPER_PILES) blocks.push(Block(p.id, p.x, p.z, p.w, p.d, p.h, WOOD, { prop: "SleeperPile" }));
  for (const s of L1218_SLOGANS) {
    const alongZ = s.face === "e" || s.face === "w";
    blocks.push(Block(s.id, s.x, s.z, alongZ ? 0.04 : s.len, alongZ ? s.len : 0.04, 0.9, "canvas", { y: R2(sample(s.x, s.z) + 1.45), solid: false, slogan: s.text }));
  }
  L1218_VILLAGE_LIGHTS.forEach((p, i) => {
    blocks.push(Block(`VillageLightPost_${i + 1}`, p.x, p.z, 0.12, 0.12, 2.6, WOOD));
    blocks.push(PropBlock(`VillageLight_${i + 1}`, "Lantern", p.x + 0.2, p.z, 0, { y: R2(sample(p.x, p.z) + 2.3) }));
  });
  L1218_TREES.forEach((t, i) => blocks.push(Block(`BshTree_${String(i + 1).padStart(2, "0")}`, t.x, t.z, 0.42, 0.42, t.h, "foliage")));
  return { blocks, gates };
}

/** 主街坐标里的一段墙（顺着街斜摆）：从 (s0,d0) 到 (s1,d1)，只许沿 s 或沿 d。 */
function StreetWall(out, id, s0, d0, s1, d1, h, semantic = BRICK, gaps = []) {
  const alongS = Math.abs(d1 - d0) < 1e-6;
  const a = alongS ? Math.min(s0, s1) : Math.min(d0, d1), b = alongS ? Math.max(s0, s1) : Math.max(d0, d1);
  const runs = [];
  let cur = a;
  for (const g of gaps.slice().sort((p, q) => p.from - q.from)) { if (g.from > cur + 0.01) runs.push([cur, g.from]); cur = Math.max(cur, g.to); }
  if (b > cur + 0.01) runs.push([cur, b]);
  runs.forEach(([p, q], i) => {
    const mid = (p + q) / 2, len = q - p, c = alongS ? StreetPoint(mid, d0) : StreetPoint(s0, mid);
    out.push(Block(runs.length > 1 ? `${id}_${i + 1}` : id, c.x, c.z, alongS ? len : T, alongS ? T : len, h, semantic, { ry: STREET_RY }));
  });
}
/** 德国教堂：顺着街斜摆的围墙、朝街敞着的院门、礼拜堂（比民房高）、钟楼。 */
function ChurchBlocks(sample) {
  const out = [], C = L1218_CHURCH;
  StreetWall(out, "Church_WallFront", C.s0, C.d0, C.s1, C.d0, C.wallH, BRICK, [Gap(C.gate.s, C.gate.w)]);
  StreetWall(out, "Church_WallBack", C.s0, C.d1, C.s1, C.d1, C.wallH);
  StreetWall(out, "Church_WallNW", C.s0, C.d0, C.s0, C.d1, C.wallH);
  StreetWall(out, "Church_WallSE", C.s1, C.d0, C.s1, C.d1, C.wallH);
  const hc = StreetPoint((C.hall.s0 + C.hall.s1) / 2, (C.hall.d0 + C.hall.d1) / 2);
  out.push(Block("Church_Hall", hc.x, hc.z, C.hall.s1 - C.hall.s0, C.hall.d1 - C.hall.d0, C.hall.h, BRICK, { ry: STREET_RY, house: true }));
  out.push(Block("Church_HallRoof", hc.x, hc.z, C.hall.s1 - C.hall.s0 + 0.8, C.hall.d1 - C.hall.d0 + 0.8, 0.9, ROOF, { ry: STREET_RY, y: R2(sample(hc.x, hc.z) + C.hall.h + 0.45) }));
  const tc = StreetPoint(C.tower.s, C.tower.d);
  out.push(Block("Church_Tower", tc.x, tc.z, C.tower.w, C.tower.w, C.tower.h, BRICK, { ry: STREET_RY, house: true }));
  out.push(Block("Church_TowerCap", tc.x, tc.z, C.tower.w + 0.4, C.tower.w + 0.4, 1.6, ROOF, { ry: STREET_RY, y: R2(sample(tc.x, tc.z) + C.tower.h + 0.8) }));
  const cross = StreetPoint(C.tower.s, C.tower.d);
  out.push(Block("Church_Cross", cross.x, cross.z, 0.12, 0.12, 1.4, METAL, { ry: STREET_RY, y: R2(sample(cross.x, cross.z) + C.tower.h + 2.3), solid: false }));
  return out;
}

/** 救护所：院墙（东墙开院门、南墙东半截塌了）、正房 / 灶屋实心、厢房空心（门洞 + 过梁 + 门槛 + 平顶）、麦秸、马灯、水缸。 */
function AidBlocks(sample) {
  const out = [];
  const A = L1218_AID, B = A.box, X = A.xiang, G = L1218_GIRL_YARD;
  Wall(out, "AidWallN", "x", B.minZ, B.minX, B.maxX, []);
  Wall(out, "AidWallW", "z", B.minX, B.minZ + T / 2, B.maxZ - T / 2, []);
  Wall(out, "AidWallE", "z", B.maxX, B.minZ + T / 2, B.maxZ - T / 2, [Gap(A.gate.z, A.gate.w)]);
  // 南墙 = 女娃家的北墙：东半截塌了，只剩 0.6 高的墙根 + 土堆
  Wall(out, "AidWallS", "x", B.maxZ, B.minX, B.maxX, [{ from: G.collapsed.fromX, to: G.collapsed.toX }]);
  out.push(Block("AidWallS_Collapsed", (G.collapsed.fromX + G.collapsed.toX) / 2, B.maxZ, G.collapsed.toX - G.collapsed.fromX, T, G.collapsed.h, WALL, { collapsed: true }));
  [[69.5, 699.0, 2.2, 1.2], [76.2, 701.1, 2.6, 1.3], [81.8, 699.2, 1.8, 1.0]].forEach(([x, z, w, d], i) => out.push(Block(`AidWallS_Rubble${i + 1}`, x, z, w, d, 0.35, EARTH, { ry: (i - 1) * 0.3, prop: "Rubble", solid: false })));
  House(out, "AidMainHouse", A.mainHouse.box, A.mainHouse.h, sample);
  House(out, "AidKitchen", A.kitchen.box, A.kitchen.h, sample);
  // 厢房：西墙借院墙；北、南、东三面墙，东墙开门（门槛），平顶
  Wall(out, "AidXiangN", "x", X.box.minZ, X.box.minX + T / 2, X.box.maxX, [], X.h);
  Wall(out, "AidXiangS", "x", X.box.maxZ, X.box.minX + T / 2, X.box.maxX, [], X.h);
  Wall(out, "AidXiangE", "z", X.box.maxX, X.box.minZ, X.box.maxZ, [Gap(X.door.z, X.door.w)], X.h);
  Lintel(out, "AidXiangDoorLintel", "z", X.box.maxX, X.door.z - X.door.w / 2, X.door.z + X.door.w / 2, X.door.topH, X.h, sample);
  out.push(Block("AidXiangThreshold", X.box.maxX, X.door.z, X.threshold.d, X.door.w, X.threshold.h, WOOD, { threshold: true }));
  Slab(out, "AidXiangRoof", { minX: X.box.minX, maxX: X.box.maxX + 0.25, minZ: X.box.minZ - 0.25, maxZ: X.box.maxZ + 0.25 }, X.roofH, sample);
  // 麦秸：避开医官、去厢房门的过道、两处洞、冬瓜搁的墙根
  const S = A.strawBox, k = L1218_PROP_KINDS.Straw;
  let i = 0;
  for (let z = S.minZ + k.d / 2 + 0.3; z + k.d / 2 <= S.maxZ; z += k.d + 1.5) {
    for (let x = S.minX + k.w / 2 + 0.3; x + k.w / 2 <= S.maxX; x += k.w + 1.3) {
      if (Math.abs(x - A.doctorPost.x) < 2.2 && Math.abs(z - A.doctorPost.z) < 2.0) continue;
      if (Math.abs(z - X.door.z) < 2.0 && x < 74) continue;
      if (L1218_HOLES.some((h) => Math.hypot(x - h.mouth.x, z - h.mouth.z) < 4.2)) continue;
      out.push(Block(`AidStraw_${String(++i).padStart(2, "0")}`, x, z, k.w, k.d, A.strawW, k.semantic, { ry: (i % 3) * 0.12, prop: "Straw", solid: false }));
    }
  }
  A.lamps.forEach((p, j) => out.push(PropBlock(`AidLantern_${j + 1}`, "Lantern", p.x, p.z)));
  // 女娃家：西、南、东三面墙（东墙开门）、房子
  Wall(out, "GirlWallW", "z", G.box.minX, G.box.minZ + T / 2, G.box.maxZ - T / 2, []);
  Wall(out, "GirlWallS", "x", G.box.maxZ, G.box.minX, G.box.maxX, []);
  Wall(out, "GirlWallE", "z", G.box.maxX, G.box.minZ + T / 2, G.box.maxZ - T / 2, [Gap(G.gate.at, G.gate.w)]);
  G.houses.forEach((hs, j) => House(out, `GirlHouse${j + 1}`, hs.box, VL.houseH, sample));
  return out;
}

/** 铁路桥（桥台、石墩、钢梁、枕木、轨；北头两孔随 BridgeBlown 没了，断梁砸进河床）、桥南的轨与枕木、炸药与引线。 */
export function RailBlocks(sample) {
  const blocks = [], gates = [];
  const n = RB.spans, spanLen = (RB.southZ - RB.northZ) / n;
  const girderTop = H.sleeperTopY - RB.sleeper.h, girderBottom = girderTop - RB.girder.h;
  const blown = new Set(RB.blownSpans);
  const Put = (b, span) => (blown.has(span) ? gates.push({ ...b, signal: SIG.bridgeBlown }) : blocks.push(b));
  // 桥台（两头，石头）
  for (const [id, z] of [["RailAbutmentN", RB.northZ + RB.abutment.d / 2 - 0.2], ["RailAbutmentS", RB.southZ - RB.abutment.d / 2 + 0.2]]) {
    blocks.push(Block(id, RB.x, z, RB.abutment.w, RB.abutment.d, girderTop - H.riverBedY, BRICK, { y: R2((girderTop + H.riverBedY) / 2) }));
  }
  // 石墩（三座）
  for (let i = 1; i < n; i++) {
    blocks.push(Block(`RailPier_${i}`, RB.x, RB.northZ + spanLen * i, RB.pier.w, RB.pier.d, girderBottom - H.riverBedY, BRICK, { y: R2((girderBottom + H.riverBedY) / 2) }));
  }
  const S = RB.sleeper;
  for (let sp = 0; sp < n; sp++) {
    const z0 = RB.northZ + spanLen * sp, zc = z0 + spanLen / 2, tag = `S${sp + 1}`;
    for (const side of [-1, 1]) Put(Block(`RailGirder_${tag}${side < 0 ? "W" : "E"}`, RB.x + side * RB.girder.offX, zc, RB.girder.w, spanLen + 0.1, RB.girder.h, METAL, { y: R2((girderTop + girderBottom) / 2) }), sp);
    const count = Math.round(spanLen / S.everyM);
    for (let k = 0; k < count; k++) {
      const z = z0 + S.everyM * (k + 0.5) * (spanLen / (count * S.everyM));
      Put(Block(`RailSleeper_${tag}_${String(k + 1).padStart(2, "0")}`, RB.x, z, S.len, S.w, S.h, WOOD, { y: R2(H.sleeperTopY - S.h / 2), deck: true, sleeper: true }), sp);
    }
    for (const side of [-1, 1]) Put(Block(`RailTrack_${tag}${side < 0 ? "W" : "E"}`, RB.x + side * RL.gauge / 2, zc, RL.railW, spanLen, RL.railH, METAL, { y: R2(H.sleeperTopY + RL.railH / 2) }), sp);
    // 看不见的走道（standOn，§5.6 / BlockStandSampler 2026-10-26）：演员站在枕木顶上，不从枕木缝里掉下去。不画、只留碰撞；
    // 炸掉的那两孔也是普通块（gate 不认 visual:false 会画出来），炸了以后那一截还在——18 炸桥以后不往那里摆人
    blocks.push(Block(`RailWalk_${tag}`, RB.x, zc, RB.walkW, spanLen + 0.1, 0.04, WOOD, { y: R2(H.sleeperTopY - 0.02), standOn: true, visual: false, walkway: true }));
  }
  // 断梁、散落的枕木（BridgeBlown 起，砸在河床上）
  RB.blownSpans.forEach((sp, j) => {
    const zc = RB.northZ + spanLen * (sp + 0.5);
    for (const side of [-1, 1]) gates.push(Block(`FallenGirder_S${sp + 1}${side < 0 ? "W" : "E"}`, RB.x + side * (RB.girder.offX + 0.8) + (j ? 0.6 : -0.4), zc + side * 0.8, RB.girder.h, spanLen - 1.2, RB.girder.w + 0.2, METAL, { ry: R3(side * 0.12 + (j ? 0.08 : -0.06)), y: R2(H.riverBedY + (RB.girder.w + 0.2) / 2 + (j ? 0.5 : 0)), appearSignal: SIG.bridgeBlown }));
    for (let k = 0; k < 5; k++) gates.push(Block(`FallenSleeper_S${sp + 1}_${k + 1}`, RB.x + (k - 2) * 1.3, zc - 4 + k * 2, S.len, S.w, S.h, WOOD, { ry: R3((k % 3 - 1) * 0.7), y: R2(H.riverBedY + 0.6 + (k % 2) * 0.3), appearSignal: SIG.bridgeBlown }));
  });
  // 炸药（北头两座桥墩上）+ 引线（顺着桥拉到南头河堤后）
  for (const i of RB.charges) {
    const z = RB.northZ + spanLen * (i + 1);
    gates.push(PropBlock(`RailCharge_${i + 1}`, "Charge", RB.x + RB.pier.w / 2 + 0.2, z, 0, { y: R2(girderBottom - 0.3), appearSignal: SIG.chargesSet, signal: SIG.bridgeBlown }));
  }
  const fz0 = RB.northZ + spanLen, fz1 = RB.southZ;
  gates.push(Block("RailFuse_Bridge", RB.x + RB.girder.offX + 0.3, (fz0 + fz1) / 2, 0.05, fz1 - fz0, 0.04, "danger", { y: R2(girderBottom + 0.05), solid: false, appearSignal: SIG.chargesSet, signal: SIG.bridgeBlown }));
  const f0 = { x: RB.x + 2.0, z: RB.southZ + 0.5 }, f1 = { x: L1218_PLACES.leveeCover.x - 1.2, z: L1218_PLACES.leveeCover.z + 1.0 };
  const fl = Math.hypot(f1.x - f0.x, f1.z - f0.z), fry = Math.atan2(-(f1.z - f0.z), f1.x - f0.x);
  gates.push(Block("RailFuse_Bank", (f0.x + f1.x) / 2, (f0.z + f1.z) / 2, fl, 0.05, 0.04, "danger", { ry: R3(fry), solid: false, y: null, lift: 0.02, appearSignal: SIG.chargesSet, signal: SIG.bridgeBlown }));
  // 桥南的轨与枕木（北段光路基没有）
  const segM = 20;
  for (let z0 = RB.southZ + 0.4, k = 1; z0 < L1218_BOUNDS.maxZ - 0.5; z0 += segM, k++) {
    const z1 = Math.min(z0 + segM, L1218_BOUNDS.maxZ - 0.5), zc = (z0 + z1) / 2, len = z1 - z0;
    blocks.push(Block(`RailBed_${k}`, RL.x, zc, 2.6, len, 0.12, WOOD, { y: R2(RL.topY + 0.06), sleeperBed: true }));
    for (const side of [-1, 1]) blocks.push(Block(`RailLine_${k}${side < 0 ? "W" : "E"}`, RL.x + side * RL.gauge / 2, zc, RL.railW, len, RL.railH, METAL, { y: R2(RL.topY + 0.12 + RL.railH / 2) }));
  }
  return { blocks, gates, spanLen };
}

/** 水：河汊子沟尾的水、沙河中间那一股水（每 8 m 一块，顺着弯转）。 */
function WaterBlocks() {
  const out = [];
  out.push(Block("HechaTailWater", RV0.centerX, (558 + HECHA_END.fullToZ - 1) / 2, RV0.waterW, HECHA_END.fullToZ - 1 - 558, RV0.waterH, "water", { solid: false }));
  const step = 8, h = H.streamTopY - H.streamFloorY;
  for (let x = L1218_BOUNDS.minX, i = 1; x < L1218_BOUNDS.maxX; x += step, i++) {
    const x1 = Math.min(x + step, L1218_BOUNDS.maxX), a = RiverAtX(x), b = RiverAtX(x1);
    const len = Math.hypot(x1 - x, b.streamZ - a.streamZ) + 0.6;
    out.push(Block(`SandRiverWater_${String(i).padStart(2, "0")}`, (x + x1) / 2, (a.streamZ + b.streamZ) / 2, len, L1218_RIVER.stream.halfW * 2, h, "water",
      { ry: R3(Math.atan2(-(b.streamZ - a.streamZ), x1 - x)), y: R2(H.streamTopY - h / 2), solid: false }));
  }
  return out;
}

/** 北门：城墙（门洞上方封住）、门内街两边的房子、火把桩。 */
function NorthGateBlocks(sample) {
  const out = [], W = NG.wall, G = NG.gate;
  Wall(out, "NgCityWall", "x", W.z, W.fromX, W.toX, [Gap(G.x, G.w)], W.h, BRICK, { d: W.t });
  out.push(Block("NgGateTop", G.x, W.z, G.w, W.t, W.h - G.h, BRICK, { y: R2(sample(G.x, W.z) + (W.h + G.h) / 2) }));
  const ST = NG.street;
  for (const [id, x0, z0, x1, z1] of [
    ["NgHouse_W1", ST.x - ST.halfW - 5, 956, ST.x - ST.halfW - 1, 966], ["NgHouse_W2", ST.x - ST.halfW - 5, 969, ST.x - ST.halfW - 1, 979],
    ["NgHouse_E1", ST.x + ST.halfW + 1, 956, ST.x + ST.halfW + 5, 966], ["NgHouse_E2", ST.x + ST.halfW + 1, 969, ST.x + ST.halfW + 5, 979],
  ]) House(out, id, { minX: x0, maxX: x1, minZ: z0, maxZ: z1 }, 3.0, sample);
  NG.torches.forEach((p, i) => out.push(PropBlock(`NgTorch_${i + 1}`, "Torch", p.x, p.z)));
  out.push(PropBlock("NgWaterVat", "WaterVat", NG.waterBucket.x, NG.waterBucket.z));
  return out;
}

/** 日常摆件 → 体块。 */
export function PropBlocks() { return L1218_PROPS.map((p) => PropBlock(p.id, p.kind, p.x, p.z, p.ry)); }

/** 14-3 救护所门前翻倒的驴车（CartOverturned 起出现；立着的车是单位 GengCart，从 14-3 起不再摆）。 */
function CartGates(sample) {
  const c = L1218_CART_PARK, k = L1218_PROP_KINDS.OverturnedCart;
  const x = c.overturned.x, z = c.overturned.z, ry = c.overturnedRy;
  return [
    PropBlock("OverturnedCart", "OverturnedCart", x, z, ry, { appearSignal: SIG.cartOverturned }),
    PropBlock("OverturnedCartWheel", "CartWheel", x + 0.3, z - 0.6, ry, { y: R2(sample(x, z) + k.h + L1218_PROP_KINDS.CartWheel.h / 2), appearSignal: SIG.cartOverturned }),
  ];
}

/** 耿家庄村南那一截：0610 的块（中心 z ≥ 470）原样带过来；0610 的随信号体块按 10-4 全开的样子取静态（会消失的那一份与窖口冒烟不带）。 */
function BlocksFrom0610(sample) {
  const from = L0610Blocks(sample);
  const Reach = (b) => b.z + Math.max(b.w, b.d) / 2 >= 470;   // 长条（村西边墙）中心在北边、南头伸进本关的也带
  const blocks = from.blocks.filter(Reach);
  const gates = from.gates.filter((g) => Reach(g) && g.appearSignal && !/^CellarSmoke/.test(g.id))
    .map(({ appearSignal, ...rest }) => ({ ...rest, from0610: appearSignal }));
  return [...blocks, ...gates];
}

/** 铁丝网的横线：lift = 离地多高（按地面换成显式 y）。 */
function ResolveLift(list, sample) {
  return list.map((b) => {
    if (b.lift === undefined) return b;
    const { lift, ...rest } = b;
    return { ...rest, y: R2(sample(b.x, b.z) + lift + b.h / 2) };
  });
}

/** 全部体块与随信号体块。sample0610：给 0610 的块用的采样（z < 480 出界的地方按 0610 的解析地面）。 */
export function L1218Blocks(sample, sample0610 = sample) {
  const rail = RailBlocks(sample);
  const village = VillageBlocks(sample);
  const blocks = ResolveLift([
    ...BlocksFrom0610(sample0610),
    ...GateOfVillageBlocks(), ...village.blocks, ...ChurchBlocks(sample), ...AidBlocks(sample), ...HoleRoofs(sample),
    ...rail.blocks, ...WaterBlocks(), ...NorthGateBlocks(sample), ...PropBlocks(),
  ], sample);
  const gates = ResolveLift([...village.gates, ...CartGates(sample), ...rail.gates], sample);
  const GH = L1218_GIRL_YARD.hole, gm = HoleWorld(GH, 0.6, 0);
  gates.push(Block("GirlHoleMat", gm.x, gm.z, GH.mat.w, GH.mat.d, 0.04, "canvas", { y: R2(sample(GH.mouth.x, GH.mouth.z) + 0.02), solid: false, prop: "Mat", appearSignal: SIG.girlHoleCovered }));
  return { blocks, gates };
}

// ---------------------------------------------------------------------------
// 3. 地面涂色、地标

const COLORS = Object.freeze({ field: "#5d6b40", village: "#8a8170", road: "#d8cfb6", sand: "#d7c18b", stream: "#4e6c75", ballast: "#4a4640", levee: "#7f7254", ditch: "#5a4532" });
/** 地面涂色（§2.2 paint）：麦地、村子、路、沙河的沙床与那一股水、铁路路基、村口沟。 */
export function L1218Paint() {
  const B = L1218_BOUNDS, seam = L1218_GROUND.seamZ;
  const Rect = (minX, maxX, minZ, maxZ) => [{ x: minX, z: minZ }, { x: maxX, z: minZ }, { x: maxX, z: maxZ }, { x: minX, z: maxZ }];
  const out = [{ id: "Fields", color: COLORS.field, feather: 1.5, poly: Rect(B.minX, B.maxX, seam + 1, B.maxZ) }];
  out.push({ id: "Village", color: COLORS.village, feather: 2, poly: Rect(VL.box.minX, VL.box.maxX, VL.box.minZ, VL.box.maxZ) });
  out.push({ id: "NorthGateYard", color: COLORS.village, feather: 2, poly: Rect(NG.flatBox.minX, NG.flatBox.maxX, NG.flatBox.minZ, NG.flatBox.maxZ) });
  // 沙床：北坎脚 → 南坎脚（每 8 m 取一次）
  const xs = [];
  for (let x = B.minX; x <= B.maxX; x += 8) xs.push(x);
  if (xs[xs.length - 1] !== B.maxX) xs.push(B.maxX);
  out.push({ id: "SandBed", color: COLORS.sand, feather: 1.2, poly: [...xs.map((x) => ({ x, z: R2(RiverAtX(x).northTop + 0.6) })), ...xs.slice().reverse().map((x) => ({ x, z: R2(RiverAtX(x).southTop - 0.6) }))] });
  out.push({ id: "Stream", color: COLORS.stream, feather: 1.0, halfW: L1218_RIVER.stream.halfW, line: xs.map((x) => ({ x, z: R2(RiverAtX(x).streamZ) })) });
  out.push({ id: "Levee", color: COLORS.levee, feather: 1.0, halfW: 2.2, line: [{ x: LV.fromX, z: LV.z }, { x: LV.toX, z: LV.z }] });
  for (const r of ROAD_LINES) out.push({ id: `Road_${r.id}`, color: COLORS.road, feather: 0.6, halfW: r.halfW, line: r.line.map((p) => ({ x: p.x, z: p.z })) });
  out.push({ id: "AtDitch", color: COLORS.ditch, feather: 0.4, poly: Rect(AT.fromX, AT.toX, AT.z - AT.topW / 2, AT.z + AT.topW / 2) });
  out.push({ id: "RailNorth", color: COLORS.ballast, feather: 0.8, halfW: RAIL_TOP_HALF + 0.3, line: [{ x: RL.x, z: B.minZ }, { x: RL.x, z: RB.northZ }] });
  out.push({ id: "RailSouth", color: COLORS.ballast, feather: 0.8, halfW: RAIL_TOP_HALF + 0.3, line: [{ x: RL.x, z: RB.southZ }, { x: RL.x, z: B.maxZ }] });
  return out;
}

/** 地标（§2.2 landmarks）：俯视图、3D 里都要一眼看得出的地方。 */
export function L1218Landmarks(sample) {
  const L = (id, name, kind, x, z, extra = {}) => ({ id, name, kind, x: R2(x), z: R2(z), ...extra });
  const PL = L1218_PLACES, A = L1218_AID, C = L1218_CHURCH, G = L1218_GIRL_YARD;
  const Pit = (hole, name, note) => {
    const c = HoleWorld(hole, hole.rampM + hole.chamber.d / 2, 0), alongX = Math.abs(hole.dir.x) > 0.5;
    const depth = sample(hole.mouth.x, hole.mouth.z) - H.holeFloorY;
    return L(`Lm${hole.id}`, name, "pit", c.x, c.z, { w: R2(alongX ? hole.chamber.d : hole.chamber.w), d: R2(alongX ? hole.chamber.w : hole.chamber.d), h: R2(depth), y: R2(H.holeFloorY + depth / 2), note });
  };
  const church = StreetPoint((C.s0 + C.s1) / 2, (C.d0 + C.d1) / 2), cgate = StreetPoint(C.gate.s, C.d0);
  const rb = L1218_RAIL_BRIDGE, rbMid = (rb.northZ + rb.southZ) / 2;
  const out = [
    L("LmVillageSouth", "耿家庄村南口", "place", PL.villageSouth.x, PL.villageSouth.z, { radiusM: 2.5, note: "11 从这里冲出来" }),
    L("LmDirtRoad", "土路", "place", 113.5, 575, { radiusM: 1.5, note: "村南口往南 58 m 接官道" }),
    L("LmJunction", "土路接官道", "place", L1218_JUNCTION.x, L1218_JUNCTION.z, { radiusM: 3 }),
    L("LmPostRoad", "官道（往东北）", "place", 180, 578, { radiusM: 3, note: "13 追兵和两辆九四式顺这条道来" }),
    L("LmAtDitch", "村口反坦克沟·板桥", "pit", AT.x, AT.z, { w: AT.toX - AT.fromX, d: AT.topW, h: R2(H.plain - AT.floorY), y: R2((H.plain + AT.floorY) / 2), note: "深 2.8、宽 4、长 30，车过不去" }),
    L("LmPlank", "板桥（门板）", "prop", PK.x, (PK.fromZ + PK.toZ) / 2, { w: PK.w, d: PK.toZ - PK.fromZ, h: 0.3, y: R2(H.plankDeckY - 0.1), note: "刚够一辆车" }),
    L("LmAbatis", "杂木（枣树枝）", "area", (AT.fromX + AT.toX) / 2, L1218_ABATIS.z, { w: AT.toX - AT.fromX, d: L1218_ABATIS.d }),
    L("LmTrench", "村北沿战壕（七二七团）", "place", 140, 642.5, { radiusM: 2, note: "沟口两边接上；13 班长他们趴这里" }),
    L("LmTrenchSquad", "沟口东段战壕", "place", PL.trenchSquad.x, PL.trenchSquad.z, { radiusM: 1.5 }),
    L("LmWire", "铁丝网", "area", 160, L1218_WIRE.z, { w: 90, d: 1 }),
    L("LmTankettes", "九四式停车处（沟北）", "place", PL.tankette1.x, PL.tankette1.z, { radiusM: 3 }),
    L("LmVillage", "北沙河村", "area", (VL.box.minX + VL.box.maxX) / 2, (VL.box.minZ + VL.box.maxZ) / 2, { w: VL.box.maxX - VL.box.minX, d: VL.box.maxZ - VL.box.minZ, note: "约 170 户（任世淦调查）；白盒压小" }),
    L("LmMainStreet", "主街（官道）", "place", StreetPoint(30).x, StreetPoint(30).z, { radiusM: 2, note: "西北 → 东南斜穿村子" }),
    L("LmOldMan", "老汉门口", "place", L1218_OLD_MAN.at.x, L1218_OLD_MAN.at.z, { radiusM: 1.2, note: "走哪去？家在这儿" }),
    Pit(L1218_FAMILY_HOLE, "钻洞的那一家", "最后一个拿席子盖住洞口"),
    ...L1218_SLEEPER_PILES.map((p) => L(`Lm${p.id}`, "枕木垛", "prop", p.x, p.z, { w: p.w, d: p.d, h: p.h, note: "铁路上拆来的枕木当柴" })),
    ...L1218_SLOGANS.map((s) => L(`Lm${s.id}`, `标语「${s.text}」`.slice(0, 24), "prop", s.x, s.z, { note: "墙上刷的大字" })),
    L("LmChurch", "德国教堂（位置是创作）", "area", church.x, church.z, { w: C.s1 - C.s0, d: C.d1 - C.d0, ry: STREET_RY, note: "院门朝街敞着，院里挤满了老乡" }),
    L("LmChurchGate", "教堂院门", "door", cgate.x, cgate.z, { w: C.gate.w, d: 0.6, h: 2.6, ry: STREET_RY }),
    L("LmWestTurn", "往西拐（西头的街）", "place", L1218_WEST_TURN.x, L1218_WEST_TURN.z, { radiusM: 2.5 }),
    L("LmAid", "救护所（七二七团借的院子）", "area", (A.box.minX + A.box.maxX) / 2, (A.box.minZ + A.box.maxZ) / 2, { w: A.box.maxX - A.box.minX, d: A.box.maxZ - A.box.minZ, note: "位置是创作" }),
    L("LmAidName", "救护所", "place", (A.box.minX + A.box.maxX) / 2, A.mainHouse.box.minZ + 2.5, { radiusM: 1, note: "正房在北、厢房在西、院门朝东" }),
    L("LmAidGate", "救护所院门", "door", A.box.maxX, A.gate.z, { w: T, d: A.gate.w, h: 2.2 }),
    L("LmCartPark", "驴车停处", "place", L1218_CART_PARK.cart.x, L1218_CART_PARK.cart.z, { radiusM: 1.6, note: "14 黑子挨了一梭，连车带驴翻在这里" }),
    Pit(A.holes[0], "院里的洞（东）", "14 冬瓜被拖进这个洞；15A"),
    Pit(A.holes[1], "院里的洞（西南）", "能动的往洞里钻"),
    L("LmWallRoot", "冬瓜搁的墙根", "place", A.wallRootDonggua.x, A.wallRootDonggua.z, { radiusM: 1 }),
    L("LmXiangDoor", "厢房门（门槛）", "door", A.xiang.box.maxX, A.xiang.door.z, { w: T, d: A.xiang.door.w, h: A.xiang.door.topH, note: "16 过门槛" }),
    L("LmGirlYard", "女娃家（隔壁院）", "area", (G.box.minX + G.box.maxX) / 2, (G.box.minZ + G.box.maxZ) / 2, { w: G.box.maxX - G.box.minX, d: G.box.maxZ - G.box.minZ }),
    Pit(G.hole, "女娃家的洞（盖席子）", "18 她娘把席子拉上"),
    L("LmCollapsedWall", "塌了半截的院墙", "prop", (G.collapsed.fromX + G.collapsed.toX) / 2, A.box.maxZ, { w: G.collapsed.toX - G.collapsed.fromX, d: 1.2, h: 0.8, note: "从救护所院里看得见那家的洞口" }),
    L("LmVillageWest", "村西口", "place", L1218_VILLAGE_WEST.x, L1218_VILLAGE_WEST.z, { radiusM: 2.5, note: "往西一片麦地到铁路" }),
    L("LmFieldPath", "往铁路桥的田间小路", "place", -12, 731, { radiusM: 1.5 }),
    L("LmRailNorth", "津浦铁路（北段光路基）", "area", RL.x, (L1218_BOUNDS.minZ + rb.northZ) / 2, { w: RL.topW, d: rb.northZ - L1218_BOUNDS.minZ, note: "2 月工兵拆了轨，枕木让老乡拿去当柴" }),
    ...L1218_RAIL_RAMPS.map((rp) => L(`Lm${rp.id}`, rp.name, "place", rp.from.x - 3, rp.from.z, { radiusM: 1.5 })),
    L("LmRailBridge", "铁路桥（钢梁四孔）", "area", RL.x, rbMid, { w: 6, d: rb.southZ - rb.northZ, note: "桥面只有枕木和两根轨；18 炸北头两孔" }),
    L("LmRiver", "沙河", "area", 40, RiverAtX(40).streamZ, { w: 380, d: 40, note: "岸陡，河床大半是沙，中间一股齐小腿深的水（创作）" }),
    ...L1218_RIVER.slides.map((s) => L(`Lm${s.id}`, s.name, "place", s.x, s.bank === "north" ? RiverAtX(s.x).northTop + 1 : RiverAtX(s.x).southTop - 1, { radiusM: 1.5 })),
    L("LmBank", "桥北土坎", "prop", (BK.fromX + BK.toX) / 2, BK.z, { w: BK.toX - BK.fromX, d: BK.halfD * 2, h: 1.0, y: R2(H.plain + 0.5), note: "18 班长他们缩在坎后" }),
    L("LmMg18", "鬼子机枪位（坟头旁）", "place", PL.ijaMg18.x, PL.ijaMg18.z, { radiusM: 2, note: "顺着路基往南扫" }),
    L("LmLevee", "南头河堤", "area", (LV.fromX + LV.toX) / 2, LV.z, { w: LV.toX - LV.fromX, d: LV.crestW + 2, note: "顶高 1.5；工兵引线拉到堤后" }),
    L("LmFoxhole", "南头散兵坑", "pit", (LV.foxhole.fromX + LV.foxhole.toX) / 2, LV.foxhole.z, { w: LV.foxhole.toX - LV.foxhole.fromX, d: LV.foxhole.floorW + 0.8, h: LV.foxhole.depth, y: R2(H.plain - LV.foxhole.depth / 2) }),
    L("LmSouthRoad", "往北门的路", "place", L1218_SOUTH_ROAD.line[0].x, 880, { radiusM: 2 }),
    L("LmNorthGate", "滕县北门", "door", NG.gate.x, NG.wall.z, { w: NG.gate.w, d: NG.wall.t, h: NG.gate.h, note: "真实离北沙河十来里，白盒压近" }),
    L("LmHechaTail", "河汊子沟尾", "place", RV0.centerX, HECHA_END.fullToZ, { radiusM: 3, note: "0610 的河汊子在这里收住" }),
  ];
  return out;
}

// ---------------------------------------------------------------------------
// 4. 核对

/** 接缝 z = seamZ 两侧与 0610 地面逐点比（0610 的解析地面；另有 0610 场景文件时也比一遍）。 */
export function CompareWith0610(sample) {
  const g = L0610Ground().Ground;
  let worst = 0, at = null, n = 0;
  for (const z of [L1218_GROUND.seamZ - 1, L1218_GROUND.seamZ - 0.5, L1218_GROUND.seamZ, L1218_GROUND.seamZ + 0.5, L1218_GROUND.seamZ + 1]) {
    for (let x = -20; x <= 236; x += 1) {
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
    for (let z = 481; z <= 555; z += 1.5) for (let x = -18; x <= 236; x += 2) { const d = Math.abs(sample(x, z) - other(x, z)); n2++; if (d > w2) { w2 = d; at2 = { x, z }; } }
    file = { worst: R2(w2), at: at2, samples: n2 };
  }
  return { worst: R2(worst), at, samples: n, file };
}

/** 驴车走的那条线：村南口 → 土路 → 官道 → 板桥 → 主街 → 西头的街 → 救护所院门外。 */
export const L1218_CART_ROUTE = Object.freeze([
  ...L1218_DIRT_ROAD.line, ...L1218_POST_ROAD.north.slice(L1218_POST_ROAD.north.findIndex((p) => p.x === L1218_JUNCTION.x && p.z === L1218_JUNCTION.z) + 1), { x: PK.x, z: PK.toZ - 0.1 }, ...L1218_POST_ROAD.street.slice(1, 3),
  { x: L1218_WEST_TURN.x, z: L1218_WEST_TURN.z }, { x: 95.2, z: 688 }, { x: L1218_PLACES.aidGateOut.x, z: L1218_PLACES.aidGateOut.z },
].map((p) => ({ x: p.x, z: p.z })));

/** 一条线沿途每 0.5 m 的站人地面（中线与两侧 ±lat）：最大坡（每 0.5 m 的落差）、最大横向高差、起止高度。z < fromZ 的点跳过。 */
export function RouteProfile(stand, line, { fromZ = -Infinity, lat = 1.25 } = {}) {
  const pts = [];
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1], b = line[i], len = Math.hypot(b.x - a.x, b.z - a.z), n = Math.max(1, Math.ceil(len / 0.5));
    if (len < 1e-6) continue;
    const nx = -(b.z - a.z) / len, nz = (b.x - a.x) / len;
    for (let k = i === 1 ? 0 : 1; k <= n; k++) {
      const t = k / n, x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
      if (z < fromZ) continue;
      pts.push({ x: R2(x), z: R2(z), y: stand(x, z), left: stand(x + nx * lat, z + nz * lat), right: stand(x - nx * lat, z - nz * lat) });
    }
  }
  let maxStep = 0, maxLat = 0, at = null, stepAt = null;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const lat2 = Math.max(Math.abs(p.left - p.y), Math.abs(p.right - p.y));
    if (lat2 > maxLat) { maxLat = lat2; at = p; }
    if (i) { const step = Math.abs(p.y - pts[i - 1].y); if (step > maxStep) { maxStep = step; stepAt = p; } }
  }
  return { points: pts, maxStep: R2(maxStep), maxLat: R2(maxLat), at, stepAt, start: R2(pts[0].y), end: R2(pts[pts.length - 1].y) };
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

export const EYE = Object.freeze({ stand: 1.62, crouch: 1.05, prone: 0.5, child: 1.0 });
/** 测试与 notes 共用的几条视线。stand：站人取地（高度场 + ≤ 1 m 的块顶）；眼高按站的地方算。 */
export function L1218SightChecks(scene, sample, stand = sample) {
  const PL = L1218_PLACES, A = L1218_AID, G = L1218_GIRL_YARD;
  const base = SolidBlocks(scene, []);
  const Eye = (p, eyeH) => ({ x: p.x, z: p.z, eye: R2(stand(p.x, p.z) - sample(p.x, p.z) + eyeH) });
  const Check = (blocks, a, b) => ({ block: BlockSight(blocks, sample, a, b)?.id ?? null, ground: SightBlock(sample, a, b).block, distM: R2(Math.hypot(a.x - b.x, a.z - b.z)) });
  // ① 沟底站着的人往外看（北、南沟沿外 6 m 的人）：要被沟壁挡住
  const inDitch = Eye(PL.ditchFloor, EYE.stand);
  const ditchToNorth = Check(base, inDitch, { x: PL.ditchFloor.x, z: AT.z - AT.topW / 2 - 6, eye: 1.0 });
  const ditchToSouth = Check(base, inDitch, { x: PL.ditchFloor.x, z: AT.z + AT.topW / 2 + 6, eye: 1.0 });
  // ② 沟口东段战壕里站着（壕底 + 1.62）看沟北边的车和坟头
  const tr = Eye(PL.trenchSquad, EYE.stand);
  const trenchToTank1 = Check(base, tr, { ...PL.tankette1, eye: 1.2 });
  const trenchToTank2 = Check(base, tr, { ...PL.tankette2, eye: 1.2 });
  const graves = ["G_N1", "G_N2"].map((id) => L1218_GRAVES.find((g) => g.id === id));
  const trenchToGraves = graves.map((g) => ({ id: g.id, ...Check(base, tr, { x: g.x, z: g.z, eye: g.h + 0.25 }) }));
  // ③ 18：田里那挺机枪（趴着）→ 土坎背后蹲着的人（要挡住）、离开土坎的人（看得见）；南头河堤上趴着的人 → 机枪（看得见）
  const mg = Eye(PL.ijaMg18, EYE.prone);
  const mgToCover = Check(base, mg, Eye(PL.lastGroupCover, EYE.crouch));
  const mgToExposed = Check(base, mg, Eye(PL.lastGroupExposed, EYE.crouch));
  const leveeToMg = Check(base, Eye(PL.leveePlayer, EYE.prone), { ...PL.ijaMg18, eye: 0.4 });
  // ④ 救护所墙根（冬瓜搁的地方，妮儿的眼高）越过塌了的墙看女娃家的洞口（探出半个头）
  const wall = Eye({ x: A.wallRootDonggua.x - 1.6, z: A.wallRootDonggua.z + 0.4 }, EYE.child);
  const gm = HoleWorld(G.hole, 0.3, 0);
  const wallToGirlHole = Check(base.filter((b) => !/^GirlHole/.test(b.id)), wall, { x: gm.x, z: gm.z, eye: 0.35 });
  // ⑤ 村南口站着往南看：沟口那一带（板桥北头站着的人）
  const villageSouthToDitch = Check(base, Eye(L1218_SPAWN, EYE.stand), { ...PL.plankNorth, eye: 1.6 });
  // ⑥ 主街往西拐的地方看得见教堂院门
  const cg = StreetPoint(L1218_CHURCH.gate.s, L1218_CHURCH.d0 + 1.2);
  const turnToChurch = Check(base, Eye(L1218_WEST_TURN, EYE.stand), { ...cg, eye: 1.5 });
  // ⑦ 南头河堤上站着看北岸桥头路基上的人（18 对岸）
  const leveeToNorthBank = Check(base, Eye(PL.leveePlayer, EYE.stand), { x: L1218_RAIL.x, z: L1218_RAIL_BRIDGE.northZ - 8, eye: 1.6 });
  return { ditchToNorth, ditchToSouth, trenchToTank1, trenchToTank2, trenchToGraves, mgToCover, mgToExposed, leveeToMg, wallToGirlHole, villageSouthToDitch, turnToChurch, leveeToNorthBank, eyes: { inDitch, tr, mg, wall } };
}

// ---------------------------------------------------------------------------
// 5. 场景

const Pts = (line) => line.map((p) => ({ x: p.x, z: p.z }));

/** 生成场景文档。commit / generatedAt 由 CLI 传进来；notes 收抽样核对行（CLI 打到控制台）。 */
export async function BuildFirstLevel1218Scene({ commit = "", generatedAt = "", notes = [] } = {}) {
  const { Ground } = L1218Ground();
  const { terrain, minM, maxM } = BakeL1218Grid(Ground);
  const sample = HeightGridSampler(terrain);
  // 0610 带过来的块里有些中心在 z 470…480（出了本关范围），显式 y 按 0610 的解析地面采，和 0610 场景里一个数
  const sample0610 = (x, z) => (z < L1218_BOUNDS.minZ ? Ground0610(x, z) : sample(x, z));
  const { blocks, gates } = L1218Blocks(sample, sample0610);
  const landmarks = L1218Landmarks(sample);
  {
    const errors = [];
    LandmarkIssues(landmarks, errors);
    if (errors.length) throw new Error(`地标表有错：${errors.join("；")}`);
  }

  const scene = {
    schema: BLOCKOUT_SCENE_SCHEMA,
    level: L1218_LEVEL_KEY,
    source: {
      generator: L1218_SCENE_GENERATOR,
      generatedAt,
      commit,
      notes: `11–18 新剧本白盒第三版（10-26 契约，北沙河村）：锚点 Data_EditorBlockoutFirstLevel1218Space；高度 ${L1218_CELL_M} m 网格（${minM}…${maxM} m）；`
        + `z<${L1218_GROUND.seamZ} 逐点等于 FirstLevel0610 的地面（耿家庄村南 / 窄胡同 / 河汊子直段），往南：河汊子沟尾、土路、官道、村口反坦克沟（深 2.8，板桥底下垫土墩）、村北沿战壕、`
        + "北沙河村压平、院里躲身的洞、田埂与坟头、村西麦地与田间小路、津浦铁路路基（北段光路基、桥头土坡）、沙河（陡坎 3 m、沙床、一股浅水、两处滑坡道）、桥北土坎与坎后的洼、南头河堤与散兵坑、北门内外压平；"
        + "体块：耿家庄村南那一截（0610）、板桥门板 / 杂木 / 铁丝网、北沙河村 20 个院子（老汉家、钻洞的一家、枕木垛、标语、夜里的灯）、德国教堂（顺街斜摆、钟楼）、救护所（厢房空心带门槛、两处洞）、女娃家、"
        + "铁路桥（桥台、三座石墩、四孔钢梁、枕木、轨）、桥南的轨、河汊子沟尾与沙河的水、北门城墙与街房、摆件；"
        + `gates：FamilyHidden / CartOverturned / GirlHoleCovered / ChargesSet / BridgeBlown；paint 地面涂色；landmarks：${landmarks.length} 个地标。`,
    },
    bounds: { ...L1218_BOUNDS },
    spawn: { x: L1218_SPAWN.x, z: L1218_SPAWN.z, yawDeg: L1218_SPAWN.yawDeg },
    colorSemantics: ["roof", "foliage", "structure", "canvas", "danger", "metal", "timber"],
    semanticColors: { roof: "#4d473c", structure: "#d9d3c4", canvas: "#ebe4d0", danger: "#b8452e", metal: "#3c4245", timber: "#6e5c45" },
    terrain,
    blocks,
    gates,
    paint: L1218Paint(),
    landmarks,
    ways: {
      roads: ROAD_LINES.map((r) => Pts(r.line)),
      trenches: [Pts(TR.west), Pts(TR.east), [{ x: AT.fromX, z: AT.z }, { x: AT.toX, z: AT.z }], [{ x: LV.foxhole.fromX, z: LV.foxhole.z }, { x: LV.foxhole.toX, z: LV.foxhole.z }]],
    },
  };

  // --- 抽样核对 ---
  const at = (p) => R2(sample(p.x, p.z));
  const PL = L1218_PLACES;
  notes.push(`网格 ${terrain.cols}×${terrain.rows}（${terrain.cellM} m），高度 ${minM}…${maxM} m；体块 ${blocks.length}、随信号体块 ${gates.length}、地标 ${landmarks.length}、涂色 ${scene.paint.length}`);
  const cmp = CompareWith0610(sample);
  notes.push(`与 0610 接缝（z ${L1218_GROUND.seamZ}±1 抽 ${cmp.samples} 点）：最大差 ${cmp.worst} m（${cmp.at ? `(${cmp.at.x},${cmp.at.z})` : "—"}）`
    + (cmp.file ? `；与 0610 场景文件（z 481…555 抽 ${cmp.file.samples} 点）最大差 ${cmp.file.worst} m` : "；没有 0610 场景文件，没比"));
  const stand = BlockStandSampler(blocks, gates, sample, () => false);
  const route = RouteProfile(stand, L1218_CART_ROUTE, { fromZ: 547 });
  const routeBlocks = BlocksNearLine(blocks, L1218_CART_ROUTE.filter((p) => p.z >= 547), 1.25).filter((id) => !/^Plank_/.test(id));
  notes.push(`驴车那条路：村南口 ${at(PL.villageSouth)} → 交叉口 ${at(PL.junction)} → 沟北沿 ${at(PL.ditchNorth)} → 板桥面 ${R2(stand(PK.x, AT.z))} → 主街 ${at(L1218_STREET.from)} → 往西拐 ${at(L1218_WEST_TURN)} → 院门外 ${at(PL.aidGateOut)}；`
    + `每 0.5 m 最陡 ${route.maxStep}（(${route.stepAt?.x},${route.stepAt?.z})）、横向高差 ${route.maxLat}（(${route.at?.x},${route.at?.z})）；离中线 1.25 m 内挡路的块：${routeBlocks.length ? routeBlocks.join(",") : "无"}`);
  notes.push(`村口沟：沟底 ${at(PL.ditchFloor)}、北沿 ${R2(sample(88, AT.z - AT.topW / 2 - 0.5))}、南沿 ${R2(sample(88, AT.z + AT.topW / 2 + 0.5))}；板桥底下土墩 ${R2(sample(PK.x, AT.z))}；`
    + `战壕底 ${at(PL.trenchSquad)}；救护所院里 ${at(L1218_AID.doctorPost)}、洞（东）底 ${R2(sample(HoleWorld(L1218_AID.holes[0], 4.5, 0).x, HoleWorld(L1218_AID.holes[0], 4.5, 0).z))}、厢房里 ${at(L1218_AID.dongguaInside)}`);
  const r = RiverAtX(RL.x);
  notes.push(`沙河（铁路处）：北坎顶 z ${R2(r.northTop)} ${R2(sample(RL.x + 12, r.northTop - 0.5))} → 河床 ${R2(sample(RL.x + 12, r.northToe + 3))} → 水底 ${R2(sample(RL.x + 12, r.streamZ))} → 南坎顶 z ${R2(r.southTop)}；`
    + `路基顶 (${RL.x},700) ${R2(sample(RL.x, 700))}、(${RL.x},880) ${R2(sample(RL.x, 880))}；土坎顶 ${R2(sample(-80, BK.z))}、坎后 ${at(PL.lastGroupCover)}；河堤顶 ${at(PL.leveePlayer)}；北门 ${at(PL.northGate)}`);
  const s = L1218SightChecks(scene, sample, stand);
  const Say = (v) => (v.block ? `被 ${v.block} 挡` : v.ground > 0 ? "被地面挡" : "看得见") + `（地面挡 ${v.ground}，${v.distM} m）`;
  notes.push(`视线：①沟底→北沿外 ${Say(s.ditchToNorth)} / →南沿外 ${Say(s.ditchToSouth)}（要挡住） · ②战壕→车1 ${Say(s.trenchToTank1)} / 车2 ${Say(s.trenchToTank2)} / 坟 ${s.trenchToGraves.map((g) => `${g.id} ${Say(g)}`).join(" / ")}`
    + ` · ③机枪→坎后 ${Say(s.mgToCover)}（要挡住） / →离开土坎 ${Say(s.mgToExposed)} / 河堤→机枪 ${Say(s.leveeToMg)}`
    + ` · ④墙根→女娃家洞口 ${Say(s.wallToGirlHole)} · ⑤村南口→板桥 ${Say(s.villageSouthToDitch)} · ⑥往西拐→教堂院门 ${Say(s.turnToChurch)} · ⑦河堤→北岸路基 ${Say(s.leveeToNorthBank)}`);
  return scene;
}
