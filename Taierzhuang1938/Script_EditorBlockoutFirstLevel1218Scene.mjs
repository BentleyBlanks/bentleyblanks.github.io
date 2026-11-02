// ===========================================================================
// Script_EditorBlockoutFirstLevel1218Scene.mjs —— 第一关 11–18 新剧本白盒（FirstLevel1218）这一片场地「怎么烘」（node 专用，2026-11-02 第四版）
//
// 2026-10-31 起场景以 Scenes/FirstLevelWhitebox 为准（三段合一，docs/Data_Scene.md），本文件不再直接写场景文件：
//   Script_SceneRebuild1218.mjs 调这里的 BuildFirstLevel1218Site() 得到 11–18 南片（z ≥ 556）的地面函数、体块、随信号体块、涂色、地标、路、沟，
//   转成场景物件拼进两份场景文件。Script_EditorBlockoutFirstLevel1218SceneTest 用这里的核对函数（路、视线）查场景里取出来的那一块。
// 坐标与尺寸只读 Data_EditorBlockoutFirstLevel1218Space（唯一口径）；本文件只定「怎么烘」：
//   1. 地面（z ≥ 556）：平地 = 0105 NaturalHeight + 0.3、叠耿家庄压平的余波；北沙河村 / 沟口 / 官道桥两头 / 李子行压平；田埂、坟头；河汊子沟尾；水塘；
//      土路 / 官道 / 三条街 / 胡同 / 出村小路 / 北岸土路 / 南岸路压低（接缝起 4 m 内渐进）；村口反坦克沟（折线，板桥底下垫土墩）；院里躲身的洞（坡道 + 洞内一小间）；
//      沙河（折线中线、两岸陡坎、沙床、一股浅水、两处滑坡道）；桥北土坎与坎后的洼；南头河堤（顺着河道）与堤后的散兵坑；铁路路基（桥头上下路基的土坡）。
//      村北沿战壕不在这里挖：它是场景 trenches 里的两段样条沟（L1218TrenchSegments 给段、depthAlong）。
//   2. 体块：板桥门板、杂木（一堆一堆）、铁丝网；北沙河村的院子（条带生成，随街转）、挨炸的洞那一家、水井、水塘、德国教堂、救护所、女娃家、枕木垛、标语、夜里的灯；
//      官道桥（木桥）；李子行；铁路桥（桥台、三座石墩、四孔钢梁、枕木、两根轨、standOn 走道）、桥南的轨；河汊子沟尾的水、沙河那一股水；县城的灯；摆件；树。
//   3. 随信号体块（七个剧情事件，中文名在 Data_SceneEvents）：GuandaoBridgeBlown / DugoutBombed / CartOverturned / RaidAftermath / GirlHoleCovered / ChargesSet / BridgeBlown。
//
// 纪律：不读时钟、不读 git；没有随机数，生成两次逐字相同。
// ===========================================================================

import { BlockStandSampler } from "./Script_EditorBlockoutPrevizPlan.mjs";
import { NaturalHeight as NaturalHeight0105, SightBlock } from "./Script_EditorBlockoutFirstLevel0105Scene.mjs";
import { L0610Ground, BlockSight, BlockCenterY, SolidBlocks } from "./Script_EditorBlockoutFirstLevel0610Scene.mjs";
import { CompileTrenchNetwork } from "./Script_TrenchPlan.mjs";
import {
  L1218_LEVEL_KEY, L1218_BOUNDS, L1218_CELL_M, L1218_GROUND, L1218_HEIGHTS, L1218_ROADS, L1218_GATE_YARD, L1218_JUNCTION, L1218_SOUTH_STREET_CORNER,
  L1218_AT_DITCH, L1218_PLANK, L1218_ABATIS, L1218_TRENCH, L1218_WIRE, L1218_GRAVES, L1218_RIDGES, L1218_RIDGE,
  L1218_VILLAGE, L1218_VILLAGE_OUTLINE, L1218_YARD_STRIPS, L1218_BOMBED_YARD, L1218_WELLS, L1218_PONDS, L1218_GARDENS, L1218_CHURCH, L1218_AID, L1218_GIRL_YARD,
  L1218_CART_PARK, L1218_SLOGAN_TEXTS, L1218_LIZIHANG, L1218_TREES, L1218_FIELD_PATCHES,
  L1218_RIVER, L1218_GUANDAO_BRIDGE, L1218_RAIL, L1218_RAIL_RAMPS, L1218_RAIL_BRIDGE, L1218_BANK, L1218_IJA_MG, L1218_LEVEE, L1218_CITY_LIGHTS,
  L1218_PROP_KINDS, L1218_PROPS, L1218_SIGNALS, L1218_PLACES, L1218_SPAWN, L1218_FROM_0610,
  StripFrame, RiverFrame, RiverAtS, RiverArcAtX, RiverPoint, RiverAtX, RIVER_LENGTH,
} from "./Data_EditorBlockoutFirstLevel1218Space.mjs";

export { SightBlock, BlockSight, BlockCenterY, SolidBlocks };
export const L1218_SCENE_GENERATOR = "Script_SceneRebuild1218.mjs（Script_EditorBlockoutFirstLevel1218Scene.BuildFirstLevel1218Site）";

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
/** 点到折线的距离与弧长位置、最近点、那一截的方向。 */
export function NearestOnLine(line, x, z) {
  let best = Infinity, at = 0, walked = 0, q = null, u = null;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1], b = line[i];
    const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz);
    const t = len > 0 ? Clamp01(((x - a.x) * dx + (z - a.z) * dz) / (len * len)) : 0;
    const px = a.x + dx * t, pz = a.z + dz * t;
    const d = Math.hypot(x - px, z - pz);
    if (d < best) { best = d; at = walked + len * t; q = { x: px, z: pz }; u = { x: dx / len, z: dz / len }; }
    walked += len;
  }
  return { dist: best, at, q, u };
}
/** 折线总长。 */
function LineLength(line) { let l = 0; for (let i = 1; i < line.length; i++) l += Math.hypot(line[i].x - line[i - 1].x, line[i].z - line[i - 1].z); return l; }
/** 弧长 s 处折线上的点与方向。 */
function LineAt(line, s) {
  let walked = 0;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1], b = line[i], len = Math.hypot(b.x - a.x, b.z - a.z);
    if (s <= walked + len || i === line.length - 1) {
      const t = len > 0 ? Clamp01((s - walked) / len) : 0;
      return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, u: { x: (b.x - a.x) / len, z: (b.z - a.z) / len } };
    }
    walked += len;
  }
  return null;
}
/** 方向 u 的「朝南」法向（z 分量为正的那个）。 */
const SouthNormal = (u) => (u.x >= 0 ? { x: -u.z, z: u.x } : { x: u.z, z: -u.x });
/** 平底开挖：box 里到 floorY，外侧 wallM 内斜起。 */
function CarveBox(h, x, z, box, floorY, wallM) {
  const sdf = RectSdf(x, z, box);
  if (sdf >= wallM) return h;
  const k = sdf <= 0 ? 1 : 1 - Smooth(sdf / wallM);
  return Math.min(h, Lerp(h, floorY, k));
}
/** 点在多边形里（射线法）。 */
export function PointInPoly(x, z, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.z > z) !== (b.z > z) && x < (b.x - a.x) * (z - a.z) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
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

const VL = L1218_VILLAGE, GB = L1218_GUANDAO_BRIDGE, LZ = L1218_LIZIHANG;
const FLATS = Object.freeze([
  { box: VL.box, y: VL.y, fadeM: VL.fadeM },
  { box: { minX: 30, maxX: 190, minZ: 628, maxZ: 662 }, y: VL.y, fadeM: 6 },   // 沟口一带压平：板桥两头与官道路面齐平、战壕沿着平地走
  { box: { minX: GB.north.x - 4, maxX: GB.north.x + 4, minZ: GB.north.z - 5, maxZ: GB.north.z + 1 }, y: VL.y, fadeM: 4 },   // 官道桥北头
  { box: { minX: GB.south.x - 4, maxX: GB.south.x + 4, minZ: GB.south.z - 1, maxZ: GB.south.z + 5 }, y: VL.y, fadeM: 4 },   // 官道桥南头
  { box: LZ.box, y: VL.y, fadeM: 3 },
]);
function Flatten(h, x, z) {
  for (const f of FLATS) {
    const w = 1 - Smooth(RectOutside(x, z, f.box) / f.fadeM);
    if (w > 0) h = Lerp(h, f.y, w);
  }
  return h;
}

// 路（中心线 + 半宽 + 压低多少）：车走的、人走的；门前空地是一块矩形
const ROAD_LINES = Object.freeze([
  ...Object.values(L1218_ROADS).map((r) => ({ id: r.id, name: r.name, line: r.line, halfW: r.halfW, lower: r.lower })),
  { id: "LiziLane", name: "李子行的土巷", line: [{ x: LZ.lane.fromX, z: LZ.lane.z }, { x: LZ.lane.toX, z: LZ.lane.z }], halfW: LZ.lane.halfW, lower: H.laneLower },
]);
export const L1218_ROAD_LINES = ROAD_LINES;
/** 离最近一条路边多远（米；在路上为负）。 */
export function RoadEdgeDistance(x, z) {
  let best = Infinity;
  for (const r of ROAD_LINES) best = Math.min(best, NearestOnLine(r.line, x, z).dist - r.halfW);
  best = Math.min(best, RectSdf(x, z, L1218_GATE_YARD.box));
  return best;
}
function RoadDelta(x, z) {
  let lower = 0;
  for (const r of ROAD_LINES) {
    const d = Math.max(NearestOnLine(r.line, x, z).dist - r.halfW, 0);
    if (d >= 0.9) continue;
    lower = Math.max(lower, r.lower * (1 - Smooth((d + 0.3) / 0.6)));
  }
  const gy = Math.max(RectSdf(x, z, L1218_GATE_YARD.box), 0);
  if (gy < 0.9) lower = Math.max(lower, L1218_GATE_YARD.lower * (1 - Smooth((gy + 0.3) / 0.6)));
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
  return add * Smooth((road - 0.4) / 0.8) * Smooth((RectOutside(x, z, VL.box) - 1) / 2);
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

// 水塘（椭圆洼）
function Ponds(h, x, z) {
  for (const p of L1218_PONDS) {
    const r = Math.hypot((x - p.x) / p.rx, (z - p.z) / p.rz);
    if (r >= 1 + p.fadeM / Math.min(p.rx, p.rz)) continue;
    const edge = (r - 1) * Math.min(p.rx, p.rz);
    const k = edge <= 0 ? 1 : 1 - Smooth(edge / p.fadeM);
    h = Math.min(h, Lerp(h, H.pondFloorY, k));
  }
  return h;
}

// 村口反坦克沟（折线；板桥正下方垫土墩）
const AT = L1218_AT_DITCH, PK = L1218_PLANK;
const AT_HALF_FLOOR = AT.floorW / 2;
function AtDitch(h, x, z) {
  const n = NearestOnLine(AT.line, x, z);
  if (n.dist >= AT_HALF_FLOOR + AT.wallM) return h;
  let floor = AT.floorY;
  const plug = 1 - Smooth((Math.abs(x - PK.x) - PK.plugHalfW) / 0.3);
  if (plug > 0) floor = Lerp(floor, H.plankPlugY, plug);
  const k = n.dist <= AT_HALF_FLOOR ? 1 : 1 - (n.dist - AT_HALF_FLOOR) / AT.wallM;   // 线性：壁陡
  return Math.min(h, Lerp(h, floor, k));
}
/** 沟中线上 x 处的 z（沟的中线从西往东 x 单调增）。 */
export function DitchZAtX(x) {
  const L = AT.line;
  for (let i = 1; i < L.length; i++) if (x >= L[i - 1].x && x <= L[i].x) return L[i - 1].z + (L[i].z - L[i - 1].z) * (x - L[i - 1].x) / (L[i].x - L[i - 1].x);
  return x < L[0].x ? L[0].z : L[L.length - 1].z;
}

// 院里躲身的洞：坡道 + 洞内一小间（救护所两处、女娃家、挨炸的那家）
const BY = L1218_BOMBED_YARD, BY_F = StripFrame(BY);
const BombedHoleWorld = (() => {
  const m = BY_F.World(BY.hole.mouthS, BY.hole.mouthD);
  const dir = { x: R3(BY_F.u.x * BY.hole.dir.s + BY_F.n.x * BY.hole.dir.d), z: R3(BY_F.u.z * BY.hole.dir.s + BY_F.n.z * BY.hole.dir.d) };
  return { id: BY.hole.id, name: BY.hole.name, mouth: m, dir, rampM: BY.hole.rampM, chamber: { ...BY.hole.chamber }, slitM: BY.hole.slitM, yard: BY.id };
})();
export const L1218_HOLES = Object.freeze([...L1218_AID.holes, L1218_GIRL_YARD.hole, BombedHoleWorld].map((h) => ({ ...h, chamber: { ...h.chamber } })));
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
    if (u < -0.4 || u > hole.rampM + c.d + 0.3 || Math.abs(v) > c.w / 2 + 0.4) continue;
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

// 沙河：折线中线、两岸陡坎、沙床、中间一股浅水；两处滑坡道（河道坐标 s / d）
const RVR = L1218_RIVER;
const SLIDE_S = RVR.slides.map((s) => ({ ...s, s0: RiverArcAtX(s.x) }));
function RiverCut(h, x, z) {
  const f = RiverFrame(x, z), ad = Math.abs(f.d), bed = H.riverBedY;
  if (ad >= RVR.halfTop + 6) return h;
  let y = h;
  if (ad < RVR.halfTop) {
    if (ad > RVR.halfTop - RVR.cliffM) y = Lerp(h, bed, Smooth((RVR.halfTop - ad) / RVR.cliffM));
    else {
      const d = Math.abs(f.d - RVR.stream.offsetD) - RVR.stream.halfW;
      y = d <= 0 ? H.streamFloorY : d < RVR.stream.edgeM ? Lerp(H.streamFloorY, bed, Smooth(d / RVR.stream.edgeM)) : bed;
    }
  }
  for (const s of SLIDE_S) {
    const w = 1 - Smooth((Math.abs(f.s - s.s0) - s.halfW) / 0.8);
    if (w <= 0) continue;
    const extra = (s.lenM - RVR.cliffM) / 2;
    const dTop = RVR.halfTop + extra, dBed = RVR.halfTop - RVR.cliffM - extra;
    const dd = s.bank === "north" ? -f.d : f.d;
    const t = (dd - dBed) / (dTop - dBed);
    if (t < 0 || t > 1) continue;
    y = Lerp(y, Lerp(bed, h, t), w);
  }
  return y;
}

// 铁路路基（桥的那一段不堆）+ 桥头上下路基的土坡
const RL = L1218_RAIL, RB = L1218_RAIL_BRIDGE;
const RAIL_TOP_HALF = RL.topW / 2;
export const RAIL_TOE_HALF = RAIL_TOP_HALF + (RL.topY - H.plain) * RL.slope;
export function Rail(h, x, z) {
  if (z > RB.northZ + 0.6 && z < RB.southZ - 0.6) return h;   // 路基顶伸到坎沿外 0.6 m（桥台挡着）
  const dx = Math.abs(x - RL.x);
  let y = h;
  if (dx < RAIL_TOE_HALF + 0.5) {
    const target = dx <= RAIL_TOP_HALF ? RL.topY : RL.topY - (dx - RAIL_TOP_HALF) / RL.slope;
    // 场地北边 z 480 起 12 m 内从地面抬起来（北边是 0105 / 0610 那两段往外延的地，没有路基；玩家走不到那儿）
    y = Math.max(y, Lerp(h, target, Smooth((z - RL.fromZ) / 12)));
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

// 南头河堤（顺着河道：d = halfTop + offD）+ 堤后的散兵坑
const LV = L1218_LEVEE;
const LEVEE_D = RVR.halfTop + LV.offD;
const FOX = LV.foxhole, FOX_D = RVR.halfTop + FOX.offD;
const FOX_S = { a: RiverArcAtX(FOX.toX), b: RiverArcAtX(FOX.fromX) };   // 弧长从东往西增
function Levee(h, x, z) {
  if (x < LV.fromX - 4 || x > LV.toX + 8) return h;
  const f = RiverFrame(x, z);
  const dz = Math.abs(f.d - LEVEE_D), half = LV.crestW / 2;
  if (dz < LV.baseHalfW) {
    let w = dz <= half ? 1 : 1 - Smooth((dz - half) / (LV.baseHalfW - half));
    w *= Smooth((x - LV.fromX + 2) / 4) * Smooth((LV.toX - x) / 6);
    if (w > 0) h = Math.max(h, Lerp(h, LV.crestY, w));
  }
  const qs = Math.max(FOX_S.a - f.s, 0, f.s - FOX_S.b), qd = Math.max(Math.abs(f.d - FOX_D) - FOX.floorW / 2, 0);
  const sdf = Math.hypot(qs, qd);
  if (sdf < FOX.wallM) { const k = sdf <= 0 ? 1 : 1 - Smooth(sdf / FOX.wallM); h = Math.min(h, Lerp(h, h - FOX.depth, k)); }
  return h;
}

/**
 * 建好的地面函数（z ≥ seamZ 用；z < seamZ 的点由重建脚本保留文件里的，x < railFromX 另叠 Rail）。
 * trench / atDitch 两个开关只为老的一次性转换脚本（Script_SceneTrenchMigrate）还 import 得动：战壕本来就不在这里挖。
 */
export function L1218Ground({ atDitch = true } = {}) {
  const Ground = (x, z) => {
    if (z < L1218_GROUND.seamZ) {
      const h = Ground0610(x, z);
      return x < L1218_GROUND.railFromX ? Rail(h, x, z) : h;
    }
    let h = PlainHeight(x, z);
    h = Flatten(h, x, z);
    h += RidgesAndGraves(x, z);
    h = HechaCarve(h, x, z);
    h = Ponds(h, x, z);
    h += RoadDelta(x, z);
    if (atDitch) h = AtDitch(h, x, z);
    h = Holes(h, x, z);
    h = RiverCut(h, x, z);
    h = Bank(h, x, z);
    h = Levee(h, x, z);
    h = Rail(h, x, z);
    return h;
  };
  return { Ground, Rail };
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
/** 实心房子（轴对齐）：墙体 + 草顶（屋面块压在上头，出檐 0.3）。 */
function House(out, id, box, h, sample, semantic = WALL) {
  const cx = (box.minX + box.maxX) / 2, cz = (box.minZ + box.maxZ) / 2, w = box.maxX - box.minX, d = box.maxZ - box.minZ;
  out.push(Block(id, cx, cz, w, d, h, semantic, { house: true }));
  out.push(Block(`${id}_Roof`, cx, cz, w + 0.6, d + 0.6, VL.roofH, ROOF, { y: R2(sample(cx, cz) + h + VL.roofH / 2) }));
}
const PropBlock = (id, kind, x, z, ry = 0, extra = {}) => {
  const k = L1218_PROP_KINDS[kind];
  return Block(id, x, z, k.w, k.d, k.h, k.semantic, { ry: R3(ry), prop: kind, ...extra });
};

// --- 条带坐标里的墙与房子（随街转）---

/** 条带坐标里一段墙：沿 s（d 固定）或沿 d（s 固定），避开 gaps（按那条轴的坐标）。 */
function FrameWall(out, frame, id, { s0, s1, d0, d1 }, gaps = [], h = VL.wallH, semantic = WALL, extra = {}) {
  const alongS = Math.abs(d1 - d0) < 1e-6;
  const a = alongS ? Math.min(s0, s1) : Math.min(d0, d1), b = alongS ? Math.max(s0, s1) : Math.max(d0, d1);
  const runs = [];
  let cur = a;
  for (const g of gaps.filter((g) => g.to > a && g.from < b).sort((p, q) => p.from - q.from)) { if (g.from > cur + 0.01) runs.push([cur, Math.min(g.from, b)]); cur = Math.max(cur, g.to); }
  if (b > cur + 0.01) runs.push([cur, b]);
  runs.forEach(([p, q], i) => {
    const mid = (p + q) / 2, len = q - p, c = alongS ? frame.World(mid, d0) : frame.World(s0, mid);
    out.push(Block(runs.length > 1 ? `${id}_${i + 1}` : id, c.x, c.z, alongS ? len : T, alongS ? T : len, h, semantic, { ry: frame.ry, ...extra }));
  });
}
/** 条带坐标里一块实心（房子 / 过梁 / 平顶）：矩形 (s0,s1)×(d0,d1)。 */
function FrameBox(frame, id, { s0, s1, d0, d1 }, h, semantic, extra = {}) {
  const c = frame.World((s0 + s1) / 2, (d0 + d1) / 2);
  return Block(id, c.x, c.z, s1 - s0, d1 - d0, h, semantic, { ry: frame.ry, ...extra });
}
function FrameHouse(out, frame, id, rect, h, sample) {
  out.push(FrameBox(frame, id, rect, h, WALL, { house: true }));
  const c = frame.World((rect.s0 + rect.s1) / 2, (rect.d0 + rect.d1) / 2);
  out.push(FrameBox(frame, `${id}_Roof`, { s0: rect.s0 - 0.3, s1: rect.s1 + 0.3, d0: rect.d0 - 0.3, d1: rect.d1 + 0.3 }, VL.roofH, ROOF, { y: R2(sample(c.x, c.z) + h + VL.roofH / 2) }));
}

/**
 * 条带 → 院子表：每个院子 { id, name, frame, s0, s1, d0, d1, gate: { s, w }, houses: [rect…], flags }。
 * d0 = setback（前墙中线离街中线）、d1 = d0 + depth；院墙的厚度 T 居中在这些线上。
 */
export function StripYards(strip) {
  const frame = StripFrame(strip), out = [];
  let s = strip.s0 || 0;
  // 条带的基线是街的一段弦，街在中间拐一点弯的地方弦会压到路上：每个院子单独往后退，退到前墙离最近的路边 ≥ 0.6 m
  const FrontClearance = (s0, s1, d) => {
    let worst = Infinity;
    const n = Math.max(2, Math.ceil((s1 - s0) / 0.5));
    for (let k = 0; k <= n; k++) {
      const p = frame.World(s0 + (s1 - s0) * k / n, d);
      for (const r of ROAD_LINES) worst = Math.min(worst, NearestOnLine(r.line, p.x, p.z).dist - r.halfW);
      worst = Math.min(worst, RectSdf(p.x, p.z, L1218_GATE_YARD.box));
    }
    return worst;
  };
  strip.widths.forEach((w, i) => {
    const s0 = s, s1 = s + w;
    let push = 0;
    for (let iter = 0; iter < 6; iter++) {
      const c = FrontClearance(s0, s1, strip.setback + push);
      if (c >= 0.6) break;
      push = Math.ceil((push + (0.6 - c) + 0.02) * 20) / 20;
    }
    const d0 = strip.setback + push, d1 = d0 + strip.depth;
    const inner = { s0: s0 + T / 2, s1: s1 - T / 2, d0: d0 + T / 2, d1: d1 - T / 2 };
    const houses = [];
    // 正房：靠着对着院门的那面墙（后墙），三间 ≈ 10–12 m
    const mainLen = Math.min(w - 3.2, 12), ms = (s0 + s1) / 2 - mainLen / 2;
    houses.push({ s0: ms, s1: ms + mainLen, d0: inner.d1 - 5.4, d1: inner.d1 - 0.3 });
    // 厢房：靠着 s0 那面侧墙，宽 3.8、长 6
    if ((strip.sideHouse || []).includes(i)) houses.push({ s0: inner.s0 + 0.3, s1: inner.s0 + 4.1, d0: d0 + 3.4, d1: d0 + 9.4 });
    out.push({
      id: `${strip.id}${i + 1}`, name: `${strip.name} ${i + 1}`, strip: strip.id, index: i, frame, s0, s1, d0, d1, inner, push,
      prev: out[out.length - 1] || null,
      gate: { s: (s0 + s1) / 2, w: 1.6 }, houses,
      light: (strip.lights || []).includes(i), slogan: (strip.slogan || []).includes(i), sleepers: (strip.sleepers || []).includes(i), raidWall: (strip.raidWall || []).includes(i),
      first: i === 0, last: i === strip.widths.length - 1,
    });
    s = s1;
  });
  return out;
}
/** 院子四个角（世界坐标，顺序）。 */
export function YardCorners(y) {
  return [y.frame.World(y.s0, y.d0), y.frame.World(y.s1, y.d0), y.frame.World(y.s1, y.d1), y.frame.World(y.s0, y.d1)];
}
/** 全部院子（条带 + 挨炸的那家 + 李子行）。 */
export function AllYards() {
  const yards = L1218_YARD_STRIPS.flatMap(StripYards);
  const by = L1218_BOMBED_YARD;
  const byYard = StripYards({ ...by, widths: [by.width], s0: by.s0, lights: [], sideHouse: [], slogan: [], sleepers: [] })[0];
  yards.push({ ...byYard, id: by.id, name: by.name, bombed: true });
  for (const lz of LZ.yards) {
    const front = lz.gate === "s" ? lz.box.maxZ : lz.box.minZ;
    const spec = { a: { x: lz.box.minX, z: front }, b: { x: lz.box.maxX, z: front }, side: lz.gate === "s" ? -1 : 1 };
    const frame = StripFrame(spec), w = lz.box.maxX - lz.box.minX, depth = lz.box.maxZ - lz.box.minZ;
    const inner = { s0: T / 2, s1: w - T / 2, d0: T / 2, d1: depth - T / 2 };
    const mainLen = Math.min(w - 3.2, 11), ms = w / 2 - mainLen / 2;
    yards.push({
      id: lz.id, name: `李子行的院子 ${lz.id}`, strip: "Lz", frame, s0: 0, s1: w, d0: 0, d1: depth, inner, gate: { s: w / 2, w: 1.6 },
      houses: [{ s0: ms, s1: ms + mainLen, d0: inner.d1 - 5.2, d1: inner.d1 - 0.3 }], empty: true, first: true, last: true,
    });
  }
  return yards;
}

/** 一个院子的体块：前墙（院门）、后墙、两面侧墙（条带里相邻院子共墙：不是第一个就不画 s0 那面）、房子。 */
function YardBlocks(y, sample, gates) {
  const out = [], f = y.frame;
  FrameWall(out, f, `${y.id}_WallF`, { s0: y.s0, s1: y.s1, d0: y.d0, d1: y.d0 }, [Gap(y.gate.s, y.gate.w)]);
  if (y.bombed) {
    // 挨炸的那家：朝南街的那面端墙（s1）中间一截随 DugoutBombed 塌了（从南街看得见院里的弹坑）
    const b0 = y.d0 + 4.5, b1 = y.d1 - 4.5;
    FrameWall(out, f, `${y.id}_WallB`, { s0: y.s0, s1: y.s0, d0: y.d0 + T / 2, d1: y.d1 - T / 2 });
    FrameWall(out, f, `${y.id}_WallS`, { s0: y.s1, s1: y.s1, d0: y.d0 + T / 2, d1: y.d1 - T / 2 }, [{ from: b0, to: b1 }]);
    gates.push(...(() => { const g = []; FrameWall(g, f, `${y.id}_WallS_Intact`, { s0: y.s1, s1: y.s1, d0: b0, d1: b1 }, [], VL.wallH, WALL, { signal: SIG.dugoutBombed }); return g; })());
    gates.push(FrameBox(f, `${y.id}_WallS_Stub`, { s0: y.s1 - T / 2, s1: y.s1 + T / 2, d0: b0, d1: b1 }, 0.5, WALL, { collapsed: true, appearSignal: SIG.dugoutBombed }));
  } else {
    FrameWall(out, f, `${y.id}_WallB`, { s0: y.s0, s1: y.s1, d0: y.d1, d1: y.d1 });
  }
  if (!y.bombed) FrameWall(out, f, `${y.id}_WallR`, { s0: y.s1, s1: y.s1, d0: y.d0 + T / 2, d1: y.d1 - T / 2 });
  if (y.bombed) FrameWall(out, f, `${y.id}_WallBack`, { s0: y.s0, s1: y.s1, d0: y.d1, d1: y.d1 });
  else if (!y.prev) FrameWall(out, f, `${y.id}_WallL`, { s0: y.s0, s1: y.s0, d0: y.d0 + T / 2, d1: y.d1 - T / 2 });
  else {
    // 条带里挨着的院子共墙：左边那家的 WallR 已经盖住 [prev.d0, prev.d1]，这家往后退了多少就只补没盖到的那一截
    const covered = { from: y.prev.d0 + T / 2, to: y.prev.d1 - T / 2 };
    FrameWall(out, f, `${y.id}_WallL`, { s0: y.s0, s1: y.s0, d0: y.d0 + T / 2, d1: y.d1 - T / 2 }, [covered]);
  }
  y.houses.forEach((hs, i) => FrameHouse(out, f, `${y.id}_House${i + 1}`, hs, VL.houseH, sample));
  if (y.raidWall) {
    // 出村小路边那家（15-1 起）：朝小路的侧墙（s0 那面）塌了半截（RaidAftermath）
    const r0 = y.d0 + 3, r1 = y.d0 + 8;
    const idx = out.findIndex((b) => b.id === `${y.id}_WallL`);
    if (idx >= 0) {
      out.splice(idx, 1);
      FrameWall(out, f, `${y.id}_WallL`, { s0: y.s0, s1: y.s0, d0: y.d0 + T / 2, d1: y.d1 - T / 2 }, [{ from: r0, to: r1 }]);
      const g = []; FrameWall(g, f, `${y.id}_WallL_Intact`, { s0: y.s0, s1: y.s0, d0: r0, d1: r1 }, [], VL.wallH, WALL, { signal: SIG.raidAftermath }); gates.push(...g);
      gates.push(FrameBox(f, `${y.id}_WallL_Stub`, { s0: y.s0 - T / 2, s1: y.s0 + T / 2, d0: r0, d1: r1 }, 0.6, WALL, { collapsed: true, appearSignal: SIG.raidAftermath }));
      const rc = f.World(y.s0 - 0.9, (r0 + r1) / 2);
      gates.push(PropBlock(`${y.id}_RaidRubble`, "Rubble", rc.x, rc.z, f.ry + 0.3, { solid: false, appearSignal: SIG.raidAftermath }));
    }
  }
  return out;
}

/** 门口的枕木垛、朝街的标语、夜里的灯（按院子的 flags）。 */
function YardExtras(yards, sample) {
  const out = [];
  let slogans = 0, lights = 0, piles = 0;
  for (const y of yards) {
    const f = y.frame;
    if (y.sleepers) {
      const c = f.World(y.gate.s + 2.6, y.d0 - 0.85);
      out.push(Block(`SleeperPile_${y.id}`, c.x, c.z, 2.6, 1.0, 1.0, WOOD, { ry: f.ry, prop: "SleeperPile" })); piles++;
    }
    if (y.slogan) {
      const text = L1218_SLOGAN_TEXTS[slogans % L1218_SLOGAN_TEXTS.length];
      const len = Math.min(0.55 * text.length + 1, y.s1 - y.s0 - y.gate.w - 2.4), sc = y.gate.s - y.gate.w / 2 - 0.6 - len / 2;
      const c = f.World(sc, y.d0 - T / 2 - 0.03);
      out.push(Block(`Slogan_${y.id}`, c.x, c.z, len, 0.04, 0.9, "canvas", { ry: f.ry, y: R2(sample(c.x, c.z) + 1.45), solid: false, slogan: text })); slogans++;
    }
    if (y.light) {
      const c = f.World(y.s0 + 1.2, y.d0 + 1.6);
      out.push(Block(`VillageLightPost_${y.id}`, c.x, c.z, 0.12, 0.12, 2.6, WOOD));
      out.push(PropBlock(`VillageLight_${y.id}`, "Lantern", c.x + 0.2, c.z, 0, { y: R2(sample(c.x, c.z) + 2.3) })); lights++;
    }
  }
  return { blocks: out, counts: { slogans, lights, piles } };
}

/** 村口：板桥门板（deck）、杂木（一堆一堆）、铁丝网。 */
function GateOfVillageBlocks() {
  const out = [];
  const bw = PK.w / PK.boards, len = PK.toZ - PK.fromZ;
  for (let i = 0; i < PK.boards; i++) {
    out.push(Block(`Plank_${i + 1}`, PK.x - PK.w / 2 + bw * (i + 0.5), PK.z, bw - 0.03, len, PK.deckT, WOOD, { y: R2(H.plankDeckY - PK.deckT / 2), deck: true, plank: true }));
  }
  // 杂木：沟南沿一堆一堆，板桥口子留空，沟口东段战壕前头那 18 m 还没堆
  const AB = L1218_ABATIS, total = LineLength(AT.line), step = AB.pieceLen + AB.pieceGap;
  let k = 0;
  for (let s = 1.5 + AB.pieceLen / 2; s + AB.pieceLen / 2 <= total - 1.5; s += step) {
    const p = LineAt(AT.line, s), n = SouthNormal(p.u);
    const cx = p.x + n.x * AB.offM, cz = p.z + n.z * AB.offM;
    if (Math.abs(cx - PK.x) < AB.gapHalfW + AB.pieceLen / 2) continue;
    if (cx > AB.unstacked.fromX - AB.pieceLen / 2 && cx < AB.unstacked.toX + AB.pieceLen / 2) continue;
    const ry = Math.atan2(-p.u.z, p.u.x);
    out.push(Block(`Abatis_${String(++k).padStart(2, "0")}`, cx + (k % 2 ? 0.1 : -0.1), cz + (k % 3 ? 0.15 : -0.1), AB.pieceLen, AB.d, AB.h - (k % 3) * 0.1, "foliage", { ry: R3(ry + (k % 2 ? 0.05 : -0.04)), abatis: true }));
  }
  // 铁丝网：桩 + 两道横线
  const W = L1218_WIRE;
  for (const [side, [a, b]] of [["W", W.west], ["E", W.east]]) {
    const n = Math.round((b - a) / W.postEveryM);
    for (let i = 0; i <= n; i++) out.push(Block(`WirePost_${side}${String(i).padStart(2, "0")}`, a + (b - a) * i / n, W.z, 0.1, 0.1, W.postH, WOOD, { wire: true }));
    W.wireYs.forEach((y, k2) => out.push(Block(`Wire_${side}${k2 + 1}`, (a + b) / 2, W.z, b - a, 0.03, 0.03, METAL, { y: null, lift: y, wire: true })));
  }
  return out;
}

/** 院里的洞：洞顶（土，显式 y；有缝的分两半）。挨炸那家的洞顶随 DugoutBombed 消失。 */
function HoleRoofs(sample) {
  const blocks = [], gates = [];
  for (const hole of L1218_HOLES) {
    const c = hole.chamber, u0 = hole.rampM - 0.1, u1 = hole.rampM + c.d + 0.25, top = sample(hole.mouth.x, hole.mouth.z) + 0.04;
    const parts = hole.slitM > 0 ? [[u0, (u0 + u1) / 2 - hole.slitM / 2], [(u0 + u1) / 2 + hole.slitM / 2, u1]] : [[u0, u1]];
    const ry = Math.atan2(-hole.dir.z, hole.dir.x);
    parts.forEach(([a, b], i) => {
      const cp = HoleWorld(hole, (a + b) / 2, 0), along = b - a, across = c.w + 0.5;
      const blk = Block(`${hole.id}_Roof${parts.length > 1 ? i + 1 : ""}`, cp.x, cp.z, along, across, L1218_AID.roofT, EARTH, { ry: R3(ry), y: R2(top - L1218_AID.roofT / 2), holeRoof: hole.id });
      if (hole.id === BY.hole.id) gates.push({ ...blk, signal: SIG.dugoutBombed }); else blocks.push(blk);
    });
  }
  return { blocks, gates };
}

/** 挨炸的洞（DugoutBombed 起）：弹坑（深色圆盘 + 一圈土）、碎砖、塌了的洞顶。 */
function BombedGates(sample) {
  const out = [], cr = BY.crater, c = BY_F.World(cr.s, cr.d), g = sample(c.x, c.z);
  out.push(Block("BombedCrater_Disc", c.x, c.z, cr.r * 2, cr.r * 2, 0.06, EARTH, { ry: BY_F.ry, y: R2(g + 0.03), solid: false, crater: true, appearSignal: SIG.dugoutBombed }));
  out.push(Block("BombedCrater_Disc2", c.x, c.z, cr.r * 2, cr.r * 2, 0.06, EARTH, { ry: R3(BY_F.ry + Math.PI / 4), y: R2(g + 0.03), solid: false, crater: true, appearSignal: SIG.dugoutBombed }));
  for (let i = 0; i < 6; i++) {
    const a = BY_F.ry + i * Math.PI / 3, px = c.x + Math.cos(a) * (cr.r + 0.5), pz = c.z - Math.sin(a) * (cr.r + 0.5);
    out.push(Block(`BombedCrater_Rim${i + 1}`, px, pz, 1.6, 0.9, 0.4, EARTH, { ry: R3(a), prop: "Rubble", solid: false, appearSignal: SIG.dugoutBombed }));
  }
  const hole = BombedHoleWorld, hc = HoleWorld(hole, hole.rampM + hole.chamber.d / 2, 0), hry = Math.atan2(-hole.dir.z, hole.dir.x);
  out.push(Block("BombedHole_RoofFallen1", hc.x, hc.z, hole.chamber.d * 0.6, hole.chamber.w * 0.6, L1218_AID.roofT, EARTH, { ry: R3(hry + 0.3), y: R2(H.holeFloorY + 0.4), appearSignal: SIG.dugoutBombed }));
  out.push(Block("BombedHole_RoofFallen2", hc.x + 0.6, hc.z + 0.4, hole.chamber.d * 0.5, hole.chamber.w * 0.5, L1218_AID.roofT, EARTH, { ry: R3(hry - 0.5), y: R2(H.holeFloorY + 0.9), appearSignal: SIG.dugoutBombed }));
  const rb = BY_F.World(BY.s0 + BY.width - 1.2, BY.setback + 9.5);
  out.push(PropBlock("BombedRubble_1", "Rubble", rb.x, rb.z, BY_F.ry + 0.2, { solid: false, appearSignal: SIG.dugoutBombed }));
  const rb2 = BY_F.World(BY.s0 + BY.width + 1.0, BY.setback + 7.0);
  out.push(PropBlock("BombedRubble_2", "Rubble", rb2.x, rb2.z, BY_F.ry - 0.4, { solid: false, appearSignal: SIG.dugoutBombed }));
  return out;
}

/** 德国教堂：顺着官道斜摆的围墙、朝官道敞着的院门、礼拜堂（比民房高）、钟楼。 */
function ChurchBlocks(sample) {
  const out = [], C = L1218_CHURCH, f = StripFrame({ ...C, side: 1 });
  FrameWall(out, f, "Church_WallFront", { s0: C.s0, s1: C.s1, d0: C.d0, d1: C.d0 }, [Gap(C.gate.s, C.gate.w)], C.wallH, BRICK);
  FrameWall(out, f, "Church_WallBack", { s0: C.s0, s1: C.s1, d0: C.d1, d1: C.d1 }, [], C.wallH, BRICK);
  FrameWall(out, f, "Church_WallNW", { s0: C.s0, s1: C.s0, d0: C.d0 + T / 2, d1: C.d1 - T / 2 }, [], C.wallH, BRICK);
  FrameWall(out, f, "Church_WallSE", { s0: C.s1, s1: C.s1, d0: C.d0 + T / 2, d1: C.d1 - T / 2 }, [], C.wallH, BRICK);
  const hc = f.World((C.hall.s0 + C.hall.s1) / 2, (C.hall.d0 + C.hall.d1) / 2);
  out.push(FrameBox(f, "Church_Hall", C.hall, C.hall.h, BRICK, { house: true }));
  out.push(FrameBox(f, "Church_HallRoof", { s0: C.hall.s0 - 0.4, s1: C.hall.s1 + 0.4, d0: C.hall.d0 - 0.4, d1: C.hall.d1 + 0.4 }, 0.9, ROOF, { y: R2(sample(hc.x, hc.z) + C.hall.h + 0.45) }));
  const tc = f.World(C.tower.s, C.tower.d);
  out.push(Block("Church_Tower", tc.x, tc.z, C.tower.w, C.tower.w, C.tower.h, BRICK, { ry: f.ry, house: true }));
  out.push(Block("Church_TowerCap", tc.x, tc.z, C.tower.w + 0.4, C.tower.w + 0.4, 1.6, ROOF, { ry: f.ry, y: R2(sample(tc.x, tc.z) + C.tower.h + 0.8) }));
  out.push(Block("Church_Cross", tc.x, tc.z, 0.12, 0.12, 1.4, METAL, { ry: f.ry, y: R2(sample(tc.x, tc.z) + C.tower.h + 2.3), solid: false }));
  return out;
}

/** 救护所：院墙（东墙开院门、南墙东半截塌了）、正房 / 灶屋实心、厢房空心（门洞 + 过梁 + 门槛 + 平顶）、麦秸、马灯；女娃家。 */
function AidBlocks(sample) {
  const out = [];
  const A = L1218_AID, B = A.box, X = A.xiang, G = L1218_GIRL_YARD;
  Wall(out, "AidWallN", "x", B.minZ, B.minX, B.maxX, []);
  Wall(out, "AidWallW", "z", B.minX, B.minZ + T / 2, B.maxZ - T / 2, []);
  Wall(out, "AidWallE", "z", B.maxX, B.minZ + T / 2, B.maxZ - T / 2, [Gap(A.gate.z, A.gate.w)]);
  // 南墙 = 女娃家的北墙：东半截塌了，只剩 0.6 高的墙根 + 土堆
  Wall(out, "AidWallS", "x", B.maxZ, B.minX, B.maxX, [{ from: G.collapsed.fromX, to: G.collapsed.toX }]);
  out.push(Block("AidWallS_Collapsed", (G.collapsed.fromX + G.collapsed.toX) / 2, B.maxZ, G.collapsed.toX - G.collapsed.fromX, T, G.collapsed.h, WALL, { collapsed: true }));
  [[93.5, 821.0, 2.2, 1.2], [100.2, 823.1, 2.6, 1.3], [105.8, 821.2, 1.8, 1.0]].forEach(([x, z, w, d], i) => out.push(Block(`AidWallS_Rubble${i + 1}`, x, z, w, d, 0.35, EARTH, { ry: (i - 1) * 0.3, prop: "Rubble", solid: false })));
  House(out, "AidMainHouse", A.mainHouse.box, A.mainHouse.h, sample);
  House(out, "AidKitchen", A.kitchen.box, A.kitchen.h, sample);
  // 厢房：西墙借院墙；北、南、东三面墙，东墙开门（门槛），平顶
  Wall(out, "AidXiangN", "x", X.box.minZ, X.box.minX + T / 2, X.box.maxX, [], X.h);
  Wall(out, "AidXiangS", "x", X.box.maxZ, X.box.minX + T / 2, X.box.maxX, [], X.h);
  Wall(out, "AidXiangE", "z", X.box.maxX, X.box.minZ, X.box.maxZ, [Gap(X.door.z, X.door.w)], X.h);
  Lintel(out, "AidXiangDoorLintel", "z", X.box.maxX, X.door.z - X.door.w / 2, X.door.z + X.door.w / 2, X.door.topH, X.h, sample);
  out.push(Block("AidXiangThreshold", X.box.maxX, X.door.z, X.threshold.d, X.door.w, X.threshold.h, WOOD, { threshold: true }));
  Slab(out, "AidXiangRoof", { minX: X.box.minX, maxX: X.box.maxX + 0.25, minZ: X.box.minZ - 0.25, maxZ: X.box.maxZ + 0.25 }, X.roofH, sample);
  // 麦秸：避开军医、去厢房门的过道、两处洞、冬瓜搁的墙根
  const S = A.strawBox, k = L1218_PROP_KINDS.Straw;
  let i = 0;
  for (let z = S.minZ + k.d / 2 + 0.3; z + k.d / 2 <= S.maxZ; z += k.d + 1.5) {
    for (let x = S.minX + k.w / 2 + 0.3; x + k.w / 2 <= S.maxX; x += k.w + 1.3) {
      if (Math.abs(x - A.doctorPost.x) < 2.2 && Math.abs(z - A.doctorPost.z) < 2.0) continue;
      if (Math.abs(z - X.door.z) < 2.0 && x < 98) continue;
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

/** 水井（井台 + 两根柱子 + 横梁）、水塘的水。 */
function WellsAndPonds(sample) {
  const out = [];
  for (const w of L1218_WELLS) {
    out.push(Block(`${w.id}_Curb`, w.x, w.z, 1.2, 1.2, 0.6, BRICK, { prop: "Well" }));
    out.push(Block(`${w.id}_PostW`, w.x - 0.9, w.z, 0.12, 0.12, 2.0, WOOD, { prop: "Well" }));
    out.push(Block(`${w.id}_PostE`, w.x + 0.9, w.z, 0.12, 0.12, 2.0, WOOD, { prop: "Well" }));
    out.push(Block(`${w.id}_Beam`, w.x, w.z, 2.0, 0.1, 0.1, WOOD, { prop: "Well", y: R2(sample(w.x, w.z) + 1.95) }));
  }
  for (const p of L1218_PONDS) {
    const h = H.pondWaterY - H.pondFloorY;
    out.push(Block(`${p.id}_Water`, p.x, p.z, p.rx * 2, p.rz * 2, h, "water", { y: R2(H.pondWaterY - h / 2), solid: false }));
  }
  return out;
}

/** 官道桥（木桥）：桥面六跨（deck + standOn）、木桩每 8 m 一排；中间三跨随 GuandaoBridgeBlown 没了、断木砸在河床与水里。 */
function GuandaoBridgeBlocks(sample) {
  const blocks = [], gates = [], f = StripFrame({ a: GB.north, b: GB.south, side: 1 });
  const spanLen = f.len / GB.spans, deckBottom = GB.deckY - GB.deckT;
  const blown = new Set(GB.blownSpans);
  for (let i = 0; i < GB.spans; i++) {
    const c = f.World(spanLen * (i + 0.5), 0);
    const blk = Block(`GuandaoDeck_${i + 1}`, c.x, c.z, spanLen + 0.05, GB.deckW, GB.deckT, WOOD, { ry: f.ry, y: R2(GB.deckY - GB.deckT / 2), deck: true, standOn: true });
    if (blown.has(i)) gates.push({ ...blk, signal: SIG.guandaoBridgeBlown }); else blocks.push(blk);
  }
  for (let i = 0; i <= GB.spans; i++) {
    // 桩在跨与跨之间；炸掉那几跨中间的桩也没了，两头剩下的还立着
    const gone = blown.has(i) && blown.has(i - 1);
    for (const side of [-1, 1]) {
      const c = f.World(spanLen * i, side * (GB.deckW / 2 - 0.4));
      const g = Math.min(sample(c.x, c.z), deckBottom - 0.6), h = deckBottom - g;
      const blk = Block(`GuandaoPile_${i}${side < 0 ? "W" : "E"}`, c.x, c.z, GB.pile.w, GB.pile.d, h, WOOD, { ry: f.ry, y: R2(g + h / 2) });
      if (gone) gates.push({ ...blk, signal: SIG.guandaoBridgeBlown }); else blocks.push(blk);
    }
  }
  // 断木（GuandaoBridgeBlown 起）：桥面断成几截歪在沙床和水里
  GB.blownSpans.forEach((i, j) => {
    const c = f.World(spanLen * (i + 0.5) + (j - 1) * 1.5, (j - 1) * 1.8);
    gates.push(Block(`GuandaoFallen_${j + 1}`, c.x, c.z, spanLen - 1.5, GB.deckW - 0.8, GB.deckT, WOOD, { ry: R3(f.ry + (j - 1) * 0.35), y: R2(H.riverBedY + 0.35 + j * 0.25), appearSignal: SIG.guandaoBridgeBlown }));
  });
  for (let k = 0; k < 3; k++) {
    const c = f.World(spanLen * 3 + (k - 1) * 3.2, 2.6 - k * 1.1);
    gates.push(Block(`GuandaoFallenPile_${k + 1}`, c.x, c.z, 2.4, GB.pile.d, GB.pile.w, WOOD, { ry: R3(f.ry + 0.9 + k * 0.6), y: R2(H.riverBedY + 0.2), appearSignal: SIG.guandaoBridgeBlown }));
  }
  return { blocks, gates };
}

/** 铁路桥（桥台、石墩、钢梁、枕木、轨；北头两孔随 BridgeBlown 没了，断梁砸进河床）、桥南的轨与枕木、炸药与引线。 */
export function RailBlocks(sample) {
  const blocks = [], gates = [];
  const n = RB.spans, spanLen = (RB.southZ - RB.northZ) / n;
  const girderTop = H.sleeperTopY - RB.sleeper.h, girderBottom = girderTop - RB.girder.h;
  const blown = new Set(RB.blownSpans);
  const Put = (b, span) => (blown.has(span) ? gates.push({ ...b, signal: SIG.bridgeBlown }) : blocks.push(b));
  for (const [id, z] of [["RailAbutmentN", RB.northZ + RB.abutment.d / 2 - 0.2], ["RailAbutmentS", RB.southZ - RB.abutment.d / 2 + 0.2]]) {
    blocks.push(Block(id, RB.x, z, RB.abutment.w, RB.abutment.d, girderTop - H.riverBedY, BRICK, { y: R2((girderTop + H.riverBedY) / 2) }));
  }
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
    // 看不见的走道（standOn，§5.6 / BlockStandSampler 2026-10-26）：演员站在枕木顶上，不从枕木缝里掉下去
    blocks.push(Block(`RailWalk_${tag}`, RB.x, zc, RB.walkW, spanLen + 0.1, 0.04, WOOD, { y: R2(H.sleeperTopY - 0.02), standOn: true, visual: false, walkway: true }));
  }
  RB.blownSpans.forEach((sp, j) => {
    const zc = RB.northZ + spanLen * (sp + 0.5);
    for (const side of [-1, 1]) gates.push(Block(`FallenGirder_S${sp + 1}${side < 0 ? "W" : "E"}`, RB.x + side * (RB.girder.offX + 0.8) + (j ? 0.6 : -0.4), zc + side * 0.8, RB.girder.h, spanLen - 1.2, RB.girder.w + 0.2, METAL, { ry: R3(side * 0.12 + (j ? 0.08 : -0.06)), y: R2(H.riverBedY + (RB.girder.w + 0.2) / 2 + (j ? 0.5 : 0)), appearSignal: SIG.bridgeBlown }));
    for (let k = 0; k < 5; k++) gates.push(Block(`FallenSleeper_S${sp + 1}_${k + 1}`, RB.x + (k - 2) * 1.3, zc - 4 + k * 2, S.len, S.w, S.h, WOOD, { ry: R3((k % 3 - 1) * 0.7), y: R2(H.riverBedY + 0.6 + (k % 2) * 0.3), appearSignal: SIG.bridgeBlown }));
  });
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

/** 水：河汊子沟尾的水、沙河中间那一股水（顺着河道每 8 m 一块）。 */
function WaterBlocks() {
  const out = [];
  out.push(Block("HechaTailWater", RV0.centerX, (558 + HECHA_END.fullToZ - 1) / 2, RV0.waterW, HECHA_END.fullToZ - 1 - 558, RV0.waterH, "water", { solid: false }));
  const step = 8, h = H.streamTopY - H.streamFloorY;
  let i = 1;
  for (let s = 0; s < RIVER_LENGTH; s += step, i++) {
    const s1 = Math.min(s + step, RIVER_LENGTH), a = RiverPoint(s, RVR.stream.offsetD), b = RiverPoint(s1, RVR.stream.offsetD);
    const len = Math.hypot(b.x - a.x, b.z - a.z) + 0.6;
    out.push(Block(`SandRiverWater_${String(i).padStart(2, "0")}`, (a.x + b.x) / 2, (a.z + b.z) / 2, len, RVR.stream.halfW * 2, h, "water",
      { ry: R3(Math.atan2(-(b.z - a.z), b.x - a.x)), y: R2(H.streamTopY - h / 2), solid: false }));
  }
  return out;
}

/** 远处县城的灯（灯桩 + 马灯）。 */
function CityLightBlocks(sample) {
  const out = [];
  L1218_CITY_LIGHTS.forEach((p, i) => {
    out.push(Block(`CityLightPost_${i + 1}`, p.x, p.z, 0.12, 0.12, 2.4, WOOD));
    out.push(PropBlock(`CityLight_${i + 1}`, "Lantern", p.x + 0.2, p.z, 0, { y: R2(sample(p.x, p.z) + 2.1) }));
  });
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

/** 空袭过后（RaidAftermath 起）：南街、出村小路、救护所门前、北岸土路头上一排排盖着席子的人（席子块）、几处碎砖堆。 */
function RaidGates(sample) {
  const out = [];
  const rows = [
    { id: "SouthSt", line: [{ x: 100, z: 779.4 }, { x: 118, z: 781.6 }], n: 4, side: -2.6 },
    { id: "SouthStE", line: [{ x: 128, z: 781.8 }, { x: 144, z: 778 }], n: 3, side: 2.6 },
    { id: "ExitPath", line: [{ x: 123.4, z: 824 }, { x: 123.4, z: 840 }], n: 4, side: 0 },
    { id: "GateYard", line: [{ x: 117.6, z: 800 }, { x: 117.6, z: 806 }], n: 2, side: 0 },
    { id: "NorthBank", line: [{ x: 112, z: 848.8 }, { x: 104, z: 858 }], n: 3, side: 2.2 },
  ];
  let k = 0;
  for (const r of rows) {
    const [a, b] = r.line, len = Math.hypot(b.x - a.x, b.z - a.z), ux = (b.x - a.x) / len, uz = (b.z - a.z) / len, nx = -uz, nz = ux;
    for (let i = 0; i < r.n; i++) {
      const t = (i + 0.5) / r.n, x = a.x + (b.x - a.x) * t + nx * r.side, z = a.z + (b.z - a.z) * t + nz * r.side;
      out.push(PropBlock(`RaidMat_${r.id}_${i + 1}`, "Mat", x, z, Math.atan2(-uz, ux) + Math.PI / 2 + ((++k % 3) - 1) * 0.12, { solid: false, appearSignal: SIG.raidAftermath }));
    }
  }
  [[150.5, 783.6, 0.3], [124.6, 789.2, -0.5], [96.4, 782.2, 0.8]].forEach(([x, z, ry], i) => out.push(PropBlock(`RaidRubble_${i + 1}`, "Rubble", x, z, ry, { solid: false, appearSignal: SIG.raidAftermath })));
  return out;
}

/** 铁丝网的横线等：lift = 离地多高（按地面换成显式 y）。 */
function ResolveLift(list, sample) {
  return list.map((b) => {
    if (b.lift === undefined) return b;
    const { lift, ...rest } = b;
    return { ...rest, y: R2(sample(b.x, b.z) + lift + b.h / 2) };
  });
}

/** 树（脚印 0.42、高 ≥ 5）：离路 ≥ 1 m、不进院子 / 教堂 / 救护所，否则跳过并报出来。 */
function TreeBlocks(yards, report) {
  const out = [];
  const polys = [...yards.map(YardCorners), YardCorners({ frame: StripFrame({ ...L1218_CHURCH, side: 1 }), s0: L1218_CHURCH.s0, s1: L1218_CHURCH.s1, d0: L1218_CHURCH.d0, d1: L1218_CHURCH.d1 })];
  const boxes = [L1218_AID.box, L1218_GIRL_YARD.box];
  L1218_TREES.forEach((t, i) => {
    const road = RoadEdgeDistance(t.x, t.z);
    const inYard = polys.some((p) => PointInPoly(t.x, t.z, p)) || boxes.some((b) => RectOutside(t.x, t.z, b) < 0.6);
    const inWater = Math.abs(RiverFrame(t.x, t.z).d) < RVR.halfTop + 1 || L1218_PONDS.some((p) => Math.hypot((t.x - p.x) / p.rx, (t.z - p.z) / p.rz) < 1.3);
    if (road < 1.0 || inYard || inWater) { report.push(`树 ${i + 1} (${t.x},${t.z}) ${road < 1 ? "压路" : inYard ? "进院子" : "进水"}，跳过`); return; }
    out.push(Block(`BshTree_${String(i + 1).padStart(2, "0")}`, t.x, t.z, 0.42, 0.42, t.h, "foliage"));
  });
  return out;
}

/**
 * 院子互相 / 院子与路 / 院子与教堂、救护所的冲突（条带参数调错了这里会报）：
 * 返回 [{ a, b, what }]；院子之间要空 ≥ 0.6（同一条带里相邻的共墙除外），离路边 ≥ 0.6。
 */
export function YardConflicts(yards) {
  const issues = [];
  const polys = yards.map((y) => ({ y, poly: YardCorners(y) }));
  const church = { y: { id: "Church", strip: "Church" }, poly: YardCorners({ frame: StripFrame({ ...L1218_CHURCH, side: 1 }), s0: L1218_CHURCH.s0, s1: L1218_CHURCH.s1, d0: L1218_CHURCH.d0, d1: L1218_CHURCH.d1 }) };
  const aid = { y: { id: "Aid", strip: "Aid" }, poly: [{ x: 82, z: 788 }, { x: 116, z: 788 }, { x: 116, z: 840 }, { x: 82, z: 840 }] };
  const all = [...polys, church, aid];
  const Dist = (p, q) => Math.hypot(p.x - q.x, p.z - q.z);
  const SegDist = (a, b, p) => { const dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz || 1; const t = Clamp01(((p.x - a.x) * dx + (p.z - a.z) * dz) / l2); return Dist(p, { x: a.x + dx * t, z: a.z + dz * t }); };
  const PolyDist = (P, Q) => {
    if (P.some((p) => PointInPoly(p.x, p.z, Q)) || Q.some((q) => PointInPoly(q.x, q.z, P))) return -1;
    let best = Infinity;
    for (let i = 0; i < P.length; i++) for (let j = 0; j < Q.length; j++) best = Math.min(best, SegDist(Q[j], Q[(j + 1) % Q.length], P[i]), SegDist(P[i], P[(i + 1) % P.length], Q[j]));
    return best;
  };
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const A = all[i], B = all[j];
      // 同一条带里挨着的院子共墙（s 区间不重叠，只是前后退得不一样），不查
      if (A.y.strip === B.y.strip && A.y.strip !== "Lz" && Math.abs((A.y.index ?? 0) - (B.y.index ?? 0)) === 1) continue;
      const d = PolyDist(A.poly, B.poly);
      if (d < 0.6) issues.push({ a: A.y.id, b: B.y.id, what: `院子 ${A.y.id} 与 ${B.y.id} 挨得太近（${d < 0 ? "重叠" : `${d.toFixed(2)} m`}）` });
    }
  }
  for (const { y, poly } of polys) {
    let worst = Infinity, where = null;
    for (const r of ROAD_LINES) {
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i], b = poly[(i + 1) % poly.length], n = Math.ceil(Dist(a, b) / 0.5);
        for (let k2 = 0; k2 <= n; k2++) {
          const p = { x: a.x + (b.x - a.x) * k2 / n, z: a.z + (b.z - a.z) * k2 / n };
          const d = NearestOnLine(r.line, p.x, p.z).dist - r.halfW;
          if (d < worst) { worst = d; where = { road: r.id, x: R2(p.x), z: R2(p.z) }; }
        }
      }
    }
    if (worst < 0.6 - 1e-9) issues.push({ a: y.id, b: where.road, what: `院子 ${y.id} 离 ${where.road} 路边只有 ${worst.toFixed(2)} m（(${where.x},${where.z})）` });
  }
  return issues;
}

/** 李子行的土巷两头、院门：都在 ROAD_LINES 里（LiziLane）。 */

/** 全部体块与随信号体块。 */
export function L1218Blocks(sample, report = []) {
  const yards = AllYards();
  const conflicts = YardConflicts(yards);
  if (conflicts.length) throw new Error(`院子摆得有冲突：\n${conflicts.map((c) => c.what).join("\n")}`);
  const gates = [];
  const yardBlocks = yards.flatMap((y) => YardBlocks(y, sample, gates));
  const extras = YardExtras(yards, sample);
  const rail = RailBlocks(sample), guandao = GuandaoBridgeBlocks(sample), roofs = HoleRoofs(sample);
  const blocks = ResolveLift([
    ...GateOfVillageBlocks(), ...yardBlocks, ...extras.blocks, ...ChurchBlocks(sample), ...AidBlocks(sample), ...roofs.blocks, ...WellsAndPonds(sample),
    ...guandao.blocks, ...rail.blocks, ...WaterBlocks(), ...CityLightBlocks(sample), ...PropBlocks(), ...TreeBlocks(yards, report),
  ], sample);
  gates.push(...roofs.gates, ...BombedGates(sample), ...CartGates(sample), ...RaidGates(sample), ...guandao.gates, ...rail.gates);
  const GH = L1218_GIRL_YARD.hole, gm = HoleWorld(GH, 0.6, 0);
  gates.push(Block("GirlHoleMat", gm.x, gm.z, GH.mat.w, GH.mat.d, 0.04, "canvas", { y: R2(sample(GH.mouth.x, GH.mouth.z) + 0.02), solid: false, prop: "Mat", appearSignal: SIG.girlHoleCovered }));
  report.push(`院子 ${yards.length} 个（村里 ${yards.filter((y) => y.strip !== "Lz").length}、李子行 ${yards.filter((y) => y.strip === "Lz").length}）；标语 ${extras.counts.slogans}、枕木垛 ${extras.counts.piles}、亮灯的院子 ${extras.counts.lights}`);
  return { blocks, gates: ResolveLift(gates, sample), yards };
}

// ---------------------------------------------------------------------------
// 3. 地面涂色、地标、路与沟、战壕段

const COLORS = Object.freeze({ field: "#5d6b40", wheat: "#66723f", garden: "#4f6a3a", village: "#8a8170", road: "#d8cfb6", sand: "#d7c18b", stream: "#4e6c75", ballast: "#4a4640", levee: "#7f7254", ditch: "#5a4532" });
const Rect = (b) => [{ x: b.minX, z: b.minZ }, { x: b.maxX, z: b.minZ }, { x: b.maxX, z: b.maxZ }, { x: b.minX, z: b.maxZ }];
/** 地面涂色（§2.2 paint）：麦地、麦地拼块、村子、菜园、李子行、路、沙床与那一股水、河堤、村口沟、铁路路基。 */
export function L1218Paint() {
  const B = L1218_BOUNDS, seam = L1218_GROUND.seamZ;
  const out = [{ id: "Fields", color: COLORS.field, feather: 1.5, poly: Rect({ minX: B.minX, maxX: B.maxX, minZ: seam + 1, maxZ: B.maxZ }) }];
  L1218_FIELD_PATCHES.forEach((b, i) => out.push({ id: `Wheat_${String(i + 1).padStart(2, "0")}`, color: COLORS.wheat, feather: 1.5, poly: Rect(b) }));
  out.push({ id: "Village", color: COLORS.village, feather: 2, poly: L1218_VILLAGE_OUTLINE.map((p) => ({ x: p.x, z: p.z })) });
  out.push({ id: "Lizihang", color: COLORS.village, feather: 2, poly: Rect(LZ.box) });
  for (const g of L1218_GARDENS) out.push({ id: g.id, color: COLORS.garden, feather: 0.8, poly: g.poly.map((p) => ({ x: p.x, z: p.z })) });
  // 沙床：北坎脚 → 南坎脚（顺着河道每 8 m 取一次）
  const ss = [];
  for (let s = 0; s <= RIVER_LENGTH; s += 8) ss.push(s);
  if (ss[ss.length - 1] !== RIVER_LENGTH) ss.push(RIVER_LENGTH);
  out.push({ id: "SandBed", color: COLORS.sand, feather: 1.2, poly: [...ss.map((s) => RiverPoint(s, -(RVR.halfTop - 0.6))), ...ss.slice().reverse().map((s) => RiverPoint(s, RVR.halfTop - 0.6))] });
  out.push({ id: "Stream", color: COLORS.stream, feather: 1.0, halfW: RVR.stream.halfW, line: ss.map((s) => RiverPoint(s, RVR.stream.offsetD)) });
  const lv = [];
  for (let x = LV.fromX; x <= LV.toX; x += 10) lv.push(RiverPoint(RiverArcAtX(x), LEVEE_D));
  out.push({ id: "Levee", color: COLORS.levee, feather: 1.0, halfW: 2.2, line: lv });
  for (const r of ROAD_LINES) out.push({ id: `Road_${r.id}`, color: COLORS.road, feather: 0.6, halfW: r.halfW, line: r.line.map((p) => ({ x: p.x, z: p.z })) });
  out.push({ id: "GateYard", color: COLORS.road, feather: 0.6, poly: Rect(L1218_GATE_YARD.box) });
  out.push({ id: "AtDitch", color: COLORS.ditch, feather: 0.4, halfW: AT.topW / 2, line: AT.line.map((p) => ({ x: p.x, z: p.z })) });
  out.push({ id: "RailNorth", color: COLORS.ballast, feather: 0.8, halfW: RAIL_TOP_HALF + 0.3, line: [{ x: RL.x, z: RL.fromZ }, { x: RL.x, z: RB.northZ }] });
  out.push({ id: "RailSouth", color: COLORS.ballast, feather: 0.8, halfW: RAIL_TOP_HALF + 0.3, line: [{ x: RL.x, z: RB.southZ }, { x: RL.x, z: B.maxZ }] });
  return out;
}

/** 地标（§2.2 landmarks）：俯视图、3D 里都要一眼看得出的地方。 */
export function L1218Landmarks(sample, yards) {
  const L = (id, name, kind, x, z, extra = {}) => ({ id, name, kind, x: R2(x), z: R2(z), ...extra });
  const PL = L1218_PLACES, A = L1218_AID, C = L1218_CHURCH, G = L1218_GIRL_YARD, cf = StripFrame({ ...C, side: 1 });
  const Pit = (hole, name, note) => {
    const c = HoleWorld(hole, hole.rampM + hole.chamber.d / 2, 0), alongX = Math.abs(hole.dir.x) > 0.5;
    const depth = sample(hole.mouth.x, hole.mouth.z) - H.holeFloorY;
    return L(`Lm${hole.id}`, name, "pit", c.x, c.z, { w: R2(alongX ? hole.chamber.d : hole.chamber.w), d: R2(alongX ? hole.chamber.w : hole.chamber.d), h: R2(depth), y: R2(H.holeFloorY + depth / 2), note });
  };
  const church = cf.World((C.s0 + C.s1) / 2, (C.d0 + C.d1) / 2);
  const rbMid = (RB.northZ + RB.southZ) / 2;
  const by = yards.find((y) => y.bombed), byc = by.frame.World((by.s0 + by.s1) / 2, (by.d0 + by.d1) / 2);
  const bank = L1218_BANK;
  const out = [
    L("LmDirtRoad", "土路", "place", 108, 582, { radiusM: 1.5, note: "耿家庄村南口往南接官道" }),
    L("LmJunction", "交叉口（土路接官道）", "place", L1218_JUNCTION.x, L1218_JUNCTION.z, { radiusM: 3 }),
    L("LmPostRoad", "官道（往西北）", "place", 10, 590, { radiusM: 3, note: "日军从这边来；13 追兵顺这条道来" }),
    L("LmFlare", "信号弹打上天的地方", "place", PL.flareAt.x, PL.flareAt.z, { radiusM: 2, note: "13-3" }),
    L("LmAtDitch", "村口反坦克沟", "area", 109, DitchZAtX(109), { w: 140, d: AT.topW, note: "深 2.8、宽 4、从 x 40 到 178，车过不去（烘进高度图）" }),
    L("LmPlank", "板桥（门板）", "prop", PK.x, PK.z, { w: PK.w, d: PK.toZ - PK.fromZ, h: 0.3, y: R2(H.plankDeckY - 0.1), note: "刚够一辆车" }),
    L("LmAbatis", "杂木（枣树枝，一堆一堆）", "area", 60, DitchZAtX(60) + L1218_ABATIS.offM, { w: 40, d: L1218_ABATIS.d, note: "沟口东段战壕前头那 18 m 还没堆到" }),
    L("LmTrenchWest", "村北沿战壕（西段）", "place", 64, 655, { radiusM: 2, note: "七二七团二营；样条沟" }),
    L("LmTrenchSquad", "沟口东段战壕", "place", PL.trenchSquad.x, PL.trenchSquad.z, { radiusM: 1.5, note: "13 班长他们趴这里" }),
    L("LmMg727", "七二七团的机枪", "place", PL.mg727.x, PL.mg727.z, { radiusM: 1.2, note: "压着板桥与官道" }),
    L("LmSentry", "哨兵（板桥南头）", "place", PL.sentry.x, PL.sentry.z, { radiusM: 1 }),
    L("LmWire", "铁丝网", "area", 110, L1218_WIRE.z, { w: 144, d: 1 }),
    L("LmVillage", "北沙河村", "area", (VL.box.minX + VL.box.maxX) / 2, (VL.box.minZ + VL.box.maxZ) / 2, { w: VL.box.maxX - VL.box.minX, d: VL.box.maxZ - VL.box.minZ, note: "官道斜穿当主街；北街 / 中街 / 南街东西向" }),
    L("LmMainStreet", "主街（官道）", "place", 127, 710, { radiusM: 2, note: "西北 → 东南斜穿村子" }),
    L("LmNorthStreet", "北街", "place", 150, 691, { radiusM: 1.5 }), L("LmMidStreet", "中街", "place", 100, 729.5, { radiusM: 1.5 }), L("LmSouthStreet", "南街", "place", 108, 780, { radiusM: 1.5 }),
    L("LmWestLane", "西胡同", "place", 86, 708, { radiusM: 1.2 }), L("LmEastLane", "东胡同", "place", 152, 710, { radiusM: 1.2 }),
    L("LmSouthStreetCorner", "南街口", "place", PL.southStreetCorner.x, PL.southStreetCorner.z, { radiusM: 2.5, note: "12-6 顺官道往东南望得见官道桥" }),
    L("LmChurch", "德国教堂（位置是创作）", "area", church.x, church.z, { w: C.s1 - C.s0, d: C.d1 - C.d0, ry: cf.ry, note: "院门朝官道敞着，院里挤满了老乡" }),
    L("LmChurchGate", "教堂院门", "door", PL.churchGate.x, PL.churchGate.z, { w: C.gate.w, d: 0.6, h: 2.6, ry: cf.ry }),
    L("LmBombedYard", "挨炸的洞那一家", "area", byc.x, byc.z, { w: by.s1 - by.s0, d: by.d1 - by.d0, ry: by.frame.ry, note: "14 第二拨飞机炸中的；南街看得见" }),
    Pit(BombedHoleWorld, "院里挨炸的洞", "DugoutBombed 起成了弹坑"),
    ...L1218_WELLS.map((w, i) => L(`Lm${w.id}`, `水井 ${i + 1}`, "prop", w.x, w.z, { w: 1.2, d: 1.2, h: 0.6 })),
    ...L1218_PONDS.map((p) => L(`Lm${p.id}`, p.name, "area", p.x, p.z, { w: p.rx * 2, d: p.rz * 2 })),
    L("LmGateYard", "救护所门前空地", "area", 121, 810, { w: 10, d: 24, note: "驴车停这里；14-3 黑子挨了一梭连车带驴翻在这里" }),
    L("LmAid", "救护所（七二七团借的院子）", "area", (A.box.minX + A.box.maxX) / 2, (A.box.minZ + A.box.maxZ) / 2, { w: A.box.maxX - A.box.minX, d: A.box.maxZ - A.box.minZ, note: "位置是创作" }),
    L("LmAidName", "救护所", "place", (A.box.minX + A.box.maxX) / 2, A.mainHouse.box.minZ + 2.5, { radiusM: 1, note: "正房在北、厢房在西、院门朝东" }),
    L("LmAidGate", "救护所院门", "door", A.box.maxX, A.gate.z, { w: T, d: A.gate.w, h: 2.2 }),
    Pit(A.holes[0], "院里的洞（东）", "14 冬瓜被拖进这个洞；15-1"),
    Pit(A.holes[1], "院里的洞（西南）", "能动的往洞里钻"),
    L("LmWallRoot", "冬瓜搁的墙根", "place", A.wallRootDonggua.x, A.wallRootDonggua.z, { radiusM: 1 }),
    L("LmXiangDoor", "厢房门（门槛）", "door", A.xiang.box.maxX, A.xiang.door.z, { w: T, d: A.xiang.door.w, h: A.xiang.door.topH, note: "16 过门槛" }),
    L("LmGirlYard", "女娃家（隔壁院）", "area", (G.box.minX + G.box.maxX) / 2, (G.box.minZ + G.box.maxZ) / 2, { w: G.box.maxX - G.box.minX, d: G.box.maxZ - G.box.minZ }),
    Pit(G.hole, "女娃家的洞（盖席子）", "18-2 她娘把席子拉上"),
    L("LmCollapsedWall", "塌了半截的院墙", "prop", (G.collapsed.fromX + G.collapsed.toX) / 2, A.box.maxZ, { w: G.collapsed.toX - G.collapsed.fromX, d: 1.2, h: 0.8, note: "从救护所院里看得见那家的洞口" }),
    L("LmExitPath", "出村小路", "place", 121, 834, { radiusM: 1.5, note: "南街 → 救护所门前 → 村南头" }),
    L("LmGuandaoBridge", "官道桥（木桥）", "area", PL.guandaoBridgeMid.x, PL.guandaoBridgeMid.z, { w: 52.8, d: GB.deckW, ry: StripFrame({ a: GB.north, b: GB.south, side: 1 }).ry, note: "二营 13 炸了它（GuandaoBridgeBlown）；过了河往南 8 km 是滕县城" }),
    L("LmNorthBankRoad", "北岸土路", "place", 40, 885, { radiusM: 2, note: "村南头顺北岸往西南到铁路桥" }),
    L("LmLizihang", "李子行（空了的小村）", "area", (LZ.box.minX + LZ.box.maxX) / 2, (LZ.box.minZ + LZ.box.maxZ) / 2, { w: LZ.box.maxX - LZ.box.minX, d: LZ.box.maxZ - LZ.box.minZ, note: "18 路过，村里没人（创作）" }),
    L("LmRailNorth", "津浦铁路（北段光路基）", "area", RL.x, (RL.fromZ + RB.northZ) / 2, { w: RL.topW, d: RB.northZ - RL.fromZ, note: "2 月工兵拆了轨，枕木让老乡拿去当柴" }),
    ...L1218_RAIL_RAMPS.map((rp) => L(`Lm${rp.id}`, rp.name, "place", rp.from.x - 3, rp.from.z, { radiusM: 1.5 })),
    L("LmRailBridge", "铁路桥（钢梁四孔）", "area", RL.x, rbMid, { w: 6, d: RB.southZ - RB.northZ, note: "桥面只有枕木和两根轨；18 炸北头两孔" }),
    L("LmRiver", "沙河", "area", 60, RiverAtX(60).center.z, { w: 480, d: 44, note: "岸陡，河床大半是沙，中间一股齐小腿深的水（创作）" }),
    ...RVR.slides.map((s) => { const r = RiverAtX(s.x), p = s.bank === "north" ? r.northTop : r.southTop; return L(`Lm${s.id}`, s.name, "place", p.x, p.z, { radiusM: 1.5 }); }),
    L("LmBank", "桥北土坎", "prop", (bank.fromX + bank.toX) / 2, bank.z, { w: bank.toX - bank.fromX, d: bank.halfD * 2, h: 1.0, y: R2(H.plain + 0.5), note: "18 班长他们缩在坎后" }),
    L("LmMg18", "鬼子机枪位（路基东脚、坟头旁）", "place", PL.ijaMg18.x, PL.ijaMg18.z, { radiusM: 2, note: "顺着路基往南扫" }),
    L("LmLevee", "南头河堤", "area", -90, RiverPoint(RiverArcAtX(-90), LEVEE_D).z, { w: LV.toX - LV.fromX, d: LV.crestW + 2, note: "顶高 1.5；工兵引线拉到堤后" }),
    L("LmFoxhole", "南头散兵坑", "pit", (FOX.fromX + FOX.toX) / 2, RiverPoint(RiverArcAtX((FOX.fromX + FOX.toX) / 2), FOX_D).z, { w: FOX.toX - FOX.fromX, d: FOX.floorW + 0.8, h: FOX.depth, y: R2(H.plain - FOX.depth / 2) }),
    L("LmSouthRoad", "南岸路（往县城）", "place", PL.southRoadMid.x, PL.southRoadMid.z, { radiusM: 2, note: "18-8 夜里顺这条路往南" }),
    L("LmCityLights", "远处县城的灯", "place", PL.cityLights.x, PL.cityLights.z, { radiusM: 4, note: "18 夜里从河堤往南看得见几点亮" }),
    L("LmHechaTail", "河汊子沟尾", "place", RV0.centerX, HECHA_END.fullToZ, { radiusM: 3, note: "0610 的河汊子在这里收住" }),
  ];
  return out;
}

/** 村北沿战壕两段（场景 trenches.segments 的写法）：壕底在绝对高度 floorY（沿沟深度 = 基准面 − 壕底），北沿堆土。datumAt = 挖沟基准面。 */
export function L1218TrenchSegments(datumAt) {
  const TR = L1218_TRENCH, floorY = TR.floorY;
  const Simplify = (points, tol) => {
    if (points.length <= 2) return points;
    const [a, b] = [points[0], points[points.length - 1]];
    let worst = -1, at = 0;
    for (let i = 1; i < points.length - 1; i++) {
      const p = points[i], t = (p[0] - a[0]) / ((b[0] - a[0]) || 1), d = Math.abs(p[1] - (a[1] + (b[1] - a[1]) * t));
      if (d > worst) { worst = d; at = i; }
    }
    if (worst <= tol) return [a, b];
    return [...Simplify(points.slice(0, at + 1), tol).slice(0, -1), ...Simplify(points.slice(at), tol)];
  };
  return [
    { id: "VillageNorthWest", pts: TR.west, which: "west" },
    { id: "VillageNorthEast", pts: TR.east, which: "east" },
  ].map(({ id, pts, which }) => {
    // 两段都自西向东写点：minus = 北，弃土在北沿
    const compiled = CompileTrenchNetwork({ seed: "probe", segments: [{ id, preset: "fire", points: pts.map((p) => ({ x: p.x, z: p.z })), cornerRadiusM: 0, jitterScale: 0 }] }).segments[0];
    const samples = [];
    for (let s = 0; s <= compiled.path.length + 1e-6; s += 0.5) {
      const p = compiled.path.At(Math.min(s, compiled.path.length));
      samples.push([R2(s), R2(Math.max(0.2, datumAt(p.x, p.z) - floorY))]);
    }
    return {
      id, preset: "fire", points: pts.map((p) => [R2(p.x), R2(p.z)]), group: "11–18/壕沟",
      note: `L1218_TRENCH.${which}（村北沿战壕，七二七团二营；沟南边 8–10 m，壕底宽 1、深 1.2、北沿堆土；第四版 2026-11-02）`,
      depthAlong: Simplify(samples, 0.01), floorW: TR.floorW, bankW: TR.wallM, bermH: TR.bermH,
      bermW: R2((TR.bermOffM + TR.bermW / 2 - TR.floorW / 2 - TR.wallM) / 1.5), bermSide: "minus", cornerRadiusM: 0, jitterScale: 0, look: "scrape",
    };
  });
}
/** 村北沿战壕两段的基准面要盖住的范围（1 m 格）。 */
export function L1218TrenchDatumBox() {
  const pts = [...L1218_TRENCH.west, ...L1218_TRENCH.east];
  const xs = pts.map((p) => p.x), zs = pts.map((p) => p.z);
  return { minX: Math.floor(Math.min(...xs) - 6), maxX: Math.ceil(Math.max(...xs) + 6), minZ: Math.floor(Math.min(...zs) - 6), maxZ: Math.ceil(Math.max(...zs) + 6) };
}
/** 不堆弃土的地方（战壕两端挨着官道 / 板桥那条路）。 */
export function L1218NoBerm() {
  return [{ line: [[97, 640], [99, 645], [103, 658]], halfW: 3.4 }];
}

// ---------------------------------------------------------------------------
// 4. 核对

/** 接缝 z = seamZ 两侧与 0610 地面逐点比（0610 的解析地面）。 */
export function CompareWith0610(sample) {
  const g = L0610Ground().Ground;
  let worst = 0, at = null, n = 0;
  for (const z of [L1218_GROUND.seamZ - 1, L1218_GROUND.seamZ - 0.5, L1218_GROUND.seamZ, L1218_GROUND.seamZ + 0.5, L1218_GROUND.seamZ + 1]) {
    for (let x = -20; x <= 320; x += 1) {
      const d = Math.abs(sample(x, z) - g(x, z));
      n++;
      if (d > worst) { worst = d; at = { x, z }; }
    }
  }
  return { worst: R2(worst), at, samples: n };
}

/** 驴车走的那条线：村南口 → 土路 → 交叉口 → 官道 → 板桥 → 主街 → 南街口 → 南街 → 出村小路 → 救护所门前空地（车停的地方）。 */
export const L1218_CART_ROUTE = Object.freeze([
  ...L1218_ROADS.dirt.line,
  ...L1218_ROADS.postNorth.line.slice(L1218_ROADS.postNorth.line.findIndex((p) => p.x === L1218_JUNCTION.x && p.z === L1218_JUNCTION.z) + 1),
  { x: PK.x, z: PK.z }, ...L1218_ROADS.mainStreet.line.slice(0, 4),
  { x: 146, z: 777 }, { x: 121, z: 783 }, { x: 121, z: 800 }, { x: L1218_CART_PARK.cart.x, z: L1218_CART_PARK.cart.z },
].map((p) => ({ x: p.x, z: p.z })));
/** 18 担架走的那条线：救护所院门 → 门前空地 → 出村小路 → 北岸土路 → 土坡 → 桥北头。 */
export const L1218_STRETCHER_ROUTE = Object.freeze([
  L1218_PLACES.aidGateOut, { x: 121, z: 814 }, ...L1218_ROADS.exitPath.line.slice(1), ...L1218_ROADS.northBank.line.slice(1), L1218_PLACES.railRampTop,
  { x: RL.x, z: RB.northZ - 1.5 },
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
/** 测试与报告共用的几条视线。stand：站人取地（高度场 + ≤ 1 m 的块顶 / standOn）；眼高按站的地方算。 */
export function L1218SightChecks(scene, sample, stand = sample) {
  const PL = L1218_PLACES, A = L1218_AID, G = L1218_GIRL_YARD;
  const base = SolidBlocks(scene, []);
  const Eye = (p, eyeH) => ({ x: p.x, z: p.z, eye: R2(stand(p.x, p.z) - sample(p.x, p.z) + eyeH) });
  const Check = (blocks, a, b) => ({ block: BlockSight(blocks, sample, a, b)?.id ?? null, ground: SightBlock(sample, a, b).block, distM: R2(Math.hypot(a.x - b.x, a.z - b.z)) });
  // ① 沟底站着的人往外看（北、南沟沿外 6 m 的人）：要被沟壁挡住
  const inDitch = Eye(PL.ditchFloor, EYE.stand), dz0 = DitchZAtX(PL.ditchFloor.x);
  const ditchToNorth = Check(base, inDitch, { x: PL.ditchFloor.x, z: dz0 - AT.topW / 2 - 6, eye: 1.0 });
  const ditchToSouth = Check(base, inDitch, { x: PL.ditchFloor.x, z: dz0 + AT.topW / 2 + 6, eye: 1.0 });
  // ② 沟口东段战壕里站着（壕底 + 1.62）看沟北边的坟头与田埂；机枪看村南口
  const tr = Eye(PL.trenchSquad, EYE.stand);
  const graves = ["G_N1", "G_N2"].map((id) => L1218_GRAVES.find((g) => g.id === id));
  const trenchToGraves = graves.map((g) => ({ id: g.id, ...Check(base, tr, { x: g.x, z: g.z, eye: g.h + 0.25 }) }));
  const trenchToRidge = Check(base, tr, { x: 120, z: 611, eye: 0.6 });
  const mgToVillageSouth = Check(base, Eye(PL.mg727, EYE.stand), { ...PL.helmetsAt, eye: 1.5 });
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
  // ⑥ 主街上（教堂院门正对面）看得见教堂院门
  const streetToChurch = Check(base, Eye({ x: 124.5, z: 706 }, EYE.stand), { ...PL.churchGate, eye: 1.5 });
  // ⑦ 南头河堤上站着看北岸桥头路基上的人（18 对岸）
  const leveeToNorthBank = Check(base, Eye(PL.leveePlayer, EYE.stand), { x: L1218_RAIL.x, z: L1218_RAIL_BRIDGE.northZ - 8, eye: 1.6 });
  // ⑧ 南街口顺官道往东南望官道桥（桥面上抱着东西跑的兵）
  const cornerToBridge = Check(base, Eye(PL.southStreetCorner, EYE.stand), Eye(PL.guandaoBridgeMid, 1.5));   // 桥面上的人：站人取地给的是桥板顶（standOn）
  // ⑨ 14-2 顺子跑过南街看得见挨炸那家院里的弹坑（炸塌的端墙那边）
  const bombedBlocks = SolidBlocks(scene, [SIG.dugoutBombed]);
  const crater = BY_F.World(BY.crater.s + BY.crater.r + 0.3, BY.crater.d);   // 弹坑远边的坑沿（坑中心在塌了的洞上头，地面是洞底）
  const streetToCrater = Check(bombedBlocks, Eye({ x: 154, z: 775.4 }, EYE.stand), { x: crater.x, z: crater.z, eye: 0.6 });
  // ⑩ 救护所院里（冬瓜搁的墙根）到洞口中间无挡（拖被子那一路）
  const dragLine = BlocksNearLine(base, [A.wallRootDonggua, A.holes[0].mouth], 0.7, 0.4);
  return { ditchToNorth, ditchToSouth, trenchToGraves, trenchToRidge, mgToVillageSouth, mgToCover, mgToExposed, leveeToMg, wallToGirlHole, villageSouthToDitch, streetToChurch, leveeToNorthBank, cornerToBridge, streetToCrater, dragLine, eyes: { inDitch, tr, mg, wall } };
}

// ---------------------------------------------------------------------------
// 5. 这一片场地（给重建脚本）

const Pts = (line) => line.map((p) => ({ x: p.x, z: p.z }));

/**
 * 11–18 南片：地面函数 + 体块 + 随信号体块 + 涂色 + 地标 + 路 / 沟中线 + 战壕段 + 基准面范围。
 * sample：高度图采样（重建脚本烘完地面再给；块的显式 y 按它算）。report 收抽样核对行。
 */
export function BuildFirstLevel1218Site(sample, { report = [] } = {}) {
  const { blocks, gates, yards } = L1218Blocks(sample, report);
  const landmarks = L1218Landmarks(sample, yards);
  const ways = {
    roads: ROAD_LINES.map((r) => Pts(r.line)),
    trenches: [Pts(AT.line), [RiverPoint(RiverArcAtX(FOX.fromX), FOX_D), RiverPoint(RiverArcAtX(FOX.toX), FOX_D)]],
  };
  const scene = {
    level: L1218_LEVEL_KEY, bounds: { ...L1218_BOUNDS }, spawn: { ...L1218_SPAWN },
    colorSemantics: ["roof", "foliage", "structure", "canvas", "danger", "metal", "timber"],
    semanticColors: { roof: "#4d473c", structure: "#d9d3c4", canvas: "#ebe4d0", danger: "#b8452e", metal: "#3c4245", timber: "#6e5c45" },
    blocks, gates, paint: L1218Paint(), landmarks, ways,
  };
  // --- 抽样核对 ---
  const at = (p) => R2(sample(p.x, p.z));
  const PL = L1218_PLACES;
  report.push(`体块 ${blocks.length}、随信号体块 ${gates.length}（${[...new Set(gates.flatMap((g) => [g.signal, g.appearSignal]).filter(Boolean))].join(" / ")}）、地标 ${landmarks.length}、涂色 ${scene.paint.length}`);
  const cmp = CompareWith0610(sample);
  report.push(`与 0610 接缝（z ${L1218_GROUND.seamZ}±1 抽 ${cmp.samples} 点）：最大差 ${cmp.worst} m（${cmp.at ? `(${cmp.at.x},${cmp.at.z})` : "—"}）`);
  const stand = BlockStandSampler(blocks, gates, sample, () => false);
  const route = RouteProfile(stand, L1218_CART_ROUTE, { fromZ: 547 });
  const routeBlocks = BlocksNearLine(blocks, L1218_CART_ROUTE.filter((p) => p.z >= 547), 1.25).filter((id) => !/^Plank_/.test(id));
  report.push(`驴车那条路：村南口 ${at(PL.villageSouth)} → 交叉口 ${at(PL.junction)} → 沟北沿 ${at(PL.ditchNorth)} → 板桥面 ${R2(stand(PK.x, PK.z))} → 南街口 ${at(PL.southStreetCorner)} → 门前空地 ${at(PL.cartPark)}；`
    + `每 0.5 m 最陡 ${route.maxStep}（(${route.stepAt?.x},${route.stepAt?.z})）、横向高差 ${route.maxLat}（(${route.at?.x},${route.at?.z})）；离中线 1.25 m 内挡路的块：${routeBlocks.length ? routeBlocks.join(",") : "无"}`);
  report.push(`村口沟：沟底 ${at(PL.ditchFloor)}、北沿 ${R2(sample(80, DitchZAtX(80) - AT.topW / 2 - 0.5))}、南沿 ${R2(sample(80, DitchZAtX(80) + AT.topW / 2 + 0.5))}；板桥底下土墩 ${R2(sample(PK.x, PK.z))}；`
    + `救护所院里 ${at(L1218_AID.doctorPost)}、洞（东）底 ${R2(sample(HoleWorld(L1218_AID.holes[0], 4.5, 0).x, HoleWorld(L1218_AID.holes[0], 4.5, 0).z))}、厢房里 ${at(L1218_AID.dongguaInside)}`);
  const r = RiverAtX(RL.x);
  report.push(`沙河（铁路处）：北坎顶 z ${R2(r.northTop.z)} ${R2(sample(RL.x - 12, r.northTop.z - 0.5))} → 河床 ${R2(sample(RL.x - 12, r.northToe.z + 3))} → 水底 ${R2(sample(RL.x - 12, r.stream.z))} → 南坎顶 z ${R2(r.southTop.z)}；`
    + `路基顶 (${RL.x},700) ${R2(sample(RL.x, 700))}、(${RL.x},880) ${R2(sample(RL.x, 880))}；土坎顶 ${R2(sample(-55, BK.z))}、坎后 ${at(PL.lastGroupCover)}；河堤顶 ${at(PL.leveePlayer)}；官道桥北头 ${at(GB.north)} / 南头 ${at(GB.south)}`);
  const s = L1218SightChecks(scene, sample, stand);
  const Say = (v) => (v.block ? `被 ${v.block} 挡` : v.ground > 0 ? "被地面挡" : "看得见") + `（地面挡 ${v.ground}，${v.distM} m）`;
  report.push(`视线：①沟底→北沿外 ${Say(s.ditchToNorth)} / →南沿外 ${Say(s.ditchToSouth)}（要挡住） · ②战壕→坟 ${s.trenchToGraves.map((g) => `${g.id} ${Say(g)}`).join(" / ")} / →田埂 ${Say(s.trenchToRidge)} / 机枪→村南口 ${Say(s.mgToVillageSouth)}`
    + ` · ③机枪→坎后 ${Say(s.mgToCover)}（要挡住） / →离开土坎 ${Say(s.mgToExposed)} / 河堤→机枪 ${Say(s.leveeToMg)}`
    + ` · ④墙根→女娃家洞口 ${Say(s.wallToGirlHole)} · ⑤村南口→板桥 ${Say(s.villageSouthToDitch)} · ⑥主街→教堂院门 ${Say(s.streetToChurch)} · ⑦河堤→北岸路基 ${Say(s.leveeToNorthBank)}`
    + ` · ⑧南街口→官道桥 ${Say(s.cornerToBridge)} · ⑨南街→弹坑 ${Say(s.streetToCrater)} · ⑩墙根→洞口中间挡的块 ${s.dragLine.length ? s.dragLine.join(",") : "无"}`);
  return { scene, yards, report };
}

export { L1218_SOUTH_STREET_CORNER, StripFrame, RiverAtS, L1218_CELL_M };
