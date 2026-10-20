// ===========================================================================
// Script_EditorBlockoutFirstLevel0105Scene.mjs —— 第一关 01–05 新剧本白盒（FirstLevel0105）的场景生成器（node 专用）
//
// 契约 docs/Data_EditorBlockout.md §2.2（场景文件格式，含可选 gates 与块的可选 y）。产物：
//   Blockout/FirstLevel0105.scene.json  高度网格 + 体块 + 随信号体块（塌洞 / 坑沿被炸 / 战车压塌沟沿）+ 路与沟的中心线
// 跑法：node Taierzhuang1938/Script_EditorBlockoutCli.mjs scene FirstLevel0105 --force
//
// 坐标与尺寸只读 Data_EditorBlockoutFirstLevel0105Space（唯一口径）；本文件不另造锚点，只定「怎么烘」：
//   1. 自然地面 NaturalHeight：前沿 0、坑北开阔地略低、z 60→131 缓升到坡顶、
//      坡顶往南落到 +1.5 的台地，台地里一道弯弯曲曲的干沟（集结处，沟底 −1.0、两岸 2.5 m 陡坎，按 Space 的 GullyU 挖），
//      中弯往南接支沟，支沟南头接一条往南的凹路；南岸再往南十来米落到平地 0；南岸坎顶堆两段矮土埂（0.6–0.8 m，L0105_GULLY_SOUTH_BERM，支沟处切开）；
//      叠一层确定性的低频起伏（几条固定频率的正弦，不用随机数）。
//      2026-10-20 坑北前景（只碰 z < −8，PitNorthHeight）：80 m 外 ±1 m 的大起伏、z ≈ −206 横贯全场的地坎（北低南高 2 m）、
//      五道田埂、七座坟包、一条斜到坑西北的干水沟（深 1.2 m，两沿翻土，穿地坎处是豁口）；原来的土坎与东轻机枪弹坑去掉。
//   2. 路面：路宽内压低一点，两侧路肩略起。
//   3. 壕沟：复用 Script_TrenchPlan.CompileTrenchNetwork（与游戏第一关同一套断面、弃土垄与位置噪声）。
//      交通沟在板桥底下加深 0.3 m、过坡顶那段变浅、末端顺着干沟北岸的坎切成坡道下到沟底：不拆段，而是给 Apply 的
//      「开挖基准面」加一个随 z 变的量，这样沟底是连续的坡，不会在两段交接处出一道坎。
//      支沟的弃土只堆南沿（一道 0.75 m 的土垄，02 迂回组贴着它外侧爬，北沿的机枪看不见）。
//   4. 支沟口：支沟比交通沟深 0.4 m；交通沟里不许被支沟的端头挖深（夹到交通沟底），落差在支沟口用台阶块补。
//   5. 机枪坑、散兵坑、防炮洞：矩形 / 圆形平底开挖（底面取中心自然地面减深度，一整块平的）。
//   6. 体块：沟里的日常摆件（L0105_PROPS）、路口板桥（横木 + 门板，显式 y）、干沟南岸的枯树，坑北的树桩 / 柏树 / 麦秸垛 / 杨树，以及随信号体块。
//   7. 2026-10-20 第三版：坑北压平（tilt 去掉）、南北向窄条田（FarmLayout → paint）、散坟（烘进高度场）；
//      场地外的田、路、四个村子、东边低山写进远景层 backdrop（L0105Backdrop，契约 §2.2，只看不走）。
//
// 纪律：不读时钟、不读 git（commit / generatedAt 由 CLI 传入）；所有随机来自 TrenchPlan 的种子噪声，生成两次逐字相同。
// ===========================================================================

import { BLOCKOUT_SCENE_SCHEMA, LandmarkIssues } from "./Script_EditorBlockoutConfig.mjs";
import { CompileTrenchNetwork } from "./Script_TrenchPlan.mjs";
import { TRENCH_EARTH_PROFILE } from "./Data_TrenchAppearance.mjs";
import { HeightGridSampler } from "./Script_EditorBlockoutLevels.mjs";
import {
  L0105_LEVEL_KEY, L0105_BOUNDS, L0105_CELL_M, L0105_HEIGHTS, L0105_TRENCH_SECTION, L0105_TRENCHES,
  L0105_ROAD, L0105_ROAD_WIDTH_M, L0105_PLACES, L0105_SIGNALS, L0105_SPAWN,
  L0105_GULLY, L0105_GULLY_TREES, L0105_GULLY_SOUTH_BERM, L0105_SUNKEN_LANE, L0105_BRIDGE, L0105_BRANCH_SOUTH_BERM,
  L0105_PROPS, L0105_PROP_KINDS, PointBeside, LineLength, GullyU, L0105_GULLY_POCKETS,
  L0105_PIT_NORTH, BundZ, ScarpZ, PointAlong, DitchEmerge,
  L0105_NORTH_ROAD, L0105_NORTH_ROAD_HALF_W, L0105_FIELD_PATH, L0105_FIELD_PATH_HALF_W, L0105_FIELD_PAINT,
  L0105_FIELD_TREES, L0105_ROAD_TREES, L0105_PATH_TREES, L0105_FIELD_GRAVES, L0105_FARM,
  L0105_BACKDROP, L0105_BACKDROP_ROAD, L0105_BACKDROP_PATHS, L0105_BACKDROP_VILLAGES, L0105_BACKDROP_HILLS,
} from "./Data_EditorBlockoutFirstLevel0105Space.mjs";

export const L0105_SCENE_GENERATOR = "Script_EditorBlockoutCli.mjs scene FirstLevel0105";

const P = L0105_PLACES;
const H = L0105_HEIGHTS;
const R2 = (v) => Math.round(v * 100) / 100;
const Clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const Smooth = (v) => { const t = Clamp01(v); return t * t * (3 - 2 * t); };
const Lerp = (a, b, t) => a + (b - a) * t;

// ---------------------------------------------------------------------------
// 1. 自然地面

/** 点到矩形的有符号距离（外正内负）。 */
function RectSdf(x, z, minX, maxX, minZ, maxZ) {
  const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2, hx = (maxX - minX) / 2, hz = (maxZ - minZ) / 2;
  const qx = Math.abs(x - cx) - hx, qz = Math.abs(z - cz) - hz;
  return Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0);
}

const G = L0105_GULLY;
const CREST_RISE_FROM_Z = 60;    // 从这里往南缓缓升到坡顶
const FIELD_DIP_FROM_Z = -25;    // 坑北这条线以北开始变低
const FIELD_DIP_RAMP_M = 25;
// （2026-10-20：原来 z −206 那道 90 m 宽、高 2.2 m 的土坎与东轻机枪的弹坑去掉，换成坑北前景 PitNorthHeight，见本文件「坑北前景」一节）

/** 干沟「挖进去多少」（0…1）：沟底里 1，两岸 wallM 内陡起、东西两头 endWallM 内缓起（形状在 Space 的 GullyU）。 */
function GullyWeight(x, z) {
  const u = GullyU(x, z);
  return u <= 0 ? 1 : u >= 1 ? 0 : 1 - Smooth(u);
}

/** 低频起伏（±0.3 m 量级）：三条固定频率与相位的正弦叠加，确定性。坡顶脊线与干沟一带压小，免得把高差带歪。 */
function Undulation(x, z) {
  const raw = 0.16 * Math.sin(x * 0.071 + z * 0.023 + 1.3)
    + 0.11 * Math.sin(-x * 0.031 + z * 0.083 + 0.4)
    + 0.06 * Math.sin(x * 0.137 - z * 0.109 + 2.1);
  const crestCalm = 1 - 0.75 * (1 - Smooth(Math.abs(z - P.crest.z) / 12));
  const gullyCalm = 1 - 0.85 * (1 - Smooth(Math.max(0, GullyU(x, z)) * G.wallM / 8));
  const frontCalm = 1 - 0.6 * (1 - Smooth(Math.hypot(x - P.pit.x, z - P.pit.z) / 25));
  return raw * crestCalm * gullyCalm * frontCalm;
}

/**
 * 南岸坎顶土埂加多少高（米）：横断面平顶 topW、两侧落到底宽 w；顶高按弧长慢慢起伏（确定性正弦），每段两头收尖。
 * 两段（支沟 / 凹路是开口）；弧长两段连着算（第二段接着第一段往下数），起伏不在接缝处重复。
 */
const SB = L0105_GULLY_SOUTH_BERM;
const SB_LENS = SB.lines.map((line) => { let n = 0; for (let i = 1; i < line.length; i++) n += Math.hypot(line[i].x - line[i - 1].x, line[i].z - line[i - 1].z); return n; });
const SB_LEN = SB_LENS.reduce((a, b) => a + b, 0);
export function GullySouthBermTop(along) {
  return SB.h + 0.06 * Math.sin(along * 0.29 + 0.7) + 0.03 * Math.sin(along * 0.83 + 2.2);
}
/** 点到土埂中心线：→ { d 横向距离, along 两段连着数的弧长, local 本段弧长, len 本段长 }。 */
function BermStation(x, z) {
  let best = { d: Infinity, along: 0, local: 0, len: 1 }, offset = 0;
  SB.lines.forEach((line, k) => {
    let walked = 0;
    for (let i = 1; i < line.length; i++) {
      const a = line[i - 1], b = line[i];
      const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz);
      const t = Clamp01(((x - a.x) * dx + (z - a.z) * dz) / (len * len));
      const d = Math.hypot(x - a.x - dx * t, z - a.z - dz * t);
      if (d < best.d) best = { d, along: offset + walked + len * t, local: walked + len * t, len: SB_LENS[k] };
      walked += len;
    }
    offset += SB_LENS[k];
  });
  return best;
}
export function GullySouthBerm(x, z) {
  const halfBase = SB.w / 2;
  if (x < 16 || x > 88 || z < 146 || z > 166) return 0;
  const { d, along, local, len } = BermStation(x, z);
  if (d >= halfBase) return 0;
  const halfTop = SB.topW / 2;
  const k = d <= halfTop ? 1 : 1 - Smooth((d - halfTop) / (halfBase - halfTop));
  const ends = Smooth(local / SB.taperM) * Smooth((len - local) / SB.taperM);
  return GullySouthBermTop(along) * k * ends;
}
export const L0105_GULLY_SOUTH_BERM_LENGTH = SB_LEN;

/** 凹路：路底按弧长从 fromY 缓降到 toY，路底宽 floorW，两壁 wallM 内陡起。返回这一点开挖后的高度上限（不在路上 = Infinity）。 */
const LANE = L0105_SUNKEN_LANE;
const LANE_LEN = (() => { let s = 0; for (let i = 1; i < LANE.line.length; i++) s += Math.hypot(LANE.line[i].x - LANE.line[i - 1].x, LANE.line[i].z - LANE.line[i - 1].z); return s; })();
const LANE_WALL_RISE_M = 3;
function LaneCap(x, z) {
  let best = Infinity, at = 0, walked = 0;
  for (let i = 1; i < LANE.line.length; i++) {
    const a = LANE.line[i - 1], b = LANE.line[i];
    const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz);
    const t = Clamp01(((x - a.x) * dx + (z - a.z) * dz) / (len * len));
    const d = Math.hypot(x - a.x - dx * t, z - a.z - dz * t);
    if (d < best) { best = d; at = walked + len * t; }
    walked += len;
  }
  const half = LANE.floorW / 2;
  if (best >= half + LANE.wallM) return Infinity;
  const floorY = Lerp(LANE.fromY, LANE.toY, Smooth(at / LANE_LEN));
  return best <= half ? floorY : floorY + LANE_WALL_RISE_M * Smooth((best - half) / LANE.wallM);
}

/**
 * 台地南沿（米，随 x）：大体在 southRimZ；凹路在台地里往东走的那一段（x 约 50–82）往南鼓出 5 m，
 * 南岸土埂压在凹路南边也还在台地顶上（10-20 改弯沟时加；台地边本来就不是一条直线）。
 */
export function TerraceSouthRimZ(x) {
  return G.southRimZ + 5 * Smooth((x - 44) / 8) * Smooth((88 - x) / 6);
}
/** 坡顶往南的大形：z 60 → 坡顶缓升；坡顶 → 干沟北岸坎顶落到 gullyRim；台地；台地南沿往南 southSlopeM 内落到平地。 */
function SouthProfile(x, z) {
  if (z <= P.crest.z) return H.crest * Smooth((z - CREST_RISE_FROM_Z) / (P.crest.z - CREST_RISE_FROM_Z));
  if (z <= G.northRimZ) return Lerp(H.crest, H.gullyRim, Smooth((z - P.crest.z) / (G.northRimZ - P.crest.z)));
  const rimZ = TerraceSouthRimZ(x);
  if (z <= rimZ) return H.gullyRim;
  return Lerp(H.gullyRim, H.southPlain, Smooth((z - rimZ) / G.southSlopeM));
}

/** 开挖前的自然地面（米）。干沟与凹路算自然地形（雨水冲出来的沟、走出来的路），在这里就挖好。 */
export function NaturalHeight(x, z) {
  let h = H.front;
  // 坑北开阔地略低（守方居高一点）
  h += H.fieldNorthDip * Smooth((FIELD_DIP_FROM_Z - z) / FIELD_DIP_RAMP_M);
  h += SouthProfile(x, z);
  h += Undulation(x, z);
  // 南岸坎顶土埂（在干沟 / 凹路开挖之前堆：坎里那一侧被干沟削掉一点，凹路处整个切开）
  h += GullySouthBerm(x, z);
  // 干沟：沟底平 assemblyFloor
  {
    const w = GullyWeight(x, z);
    if (w > 0) h = Math.min(h, Lerp(h, H.assemblyFloor, w));
  }
  // 凹路
  {
    const cap = LaneCap(x, z);
    if (cap < h) h = cap;
  }
  // 坑北前景（大起伏、地坎、田埂、坟包、干水沟；只动 z < PIT_NORTH_FROM_Z）
  if (z < PIT_NORTH_FROM_Z) h = PitNorthHeight(x, z, h);
  return h;
}

// ---------------------------------------------------------------------------
// 1b. 坑北前景（2026-10-20，L0105_PIT_NORTH；创作，无史料出处）
//   大起伏 + 地坎（北低南高）先改「地形」，记作 base；再在上面堆田埂、坟包；最后按 base 往下挖干水沟（沟底不被田埂垫高），
//   两沿各翻一条矮土。地坎在干水沟穿过处把坎面放宽成豁口。只碰 z < PIT_NORTH_FROM_Z（前沿沟北沿弃土以北），南面一点不动。

const PN = L0105_PIT_NORTH;
const PIT_NORTH_FROM_Z = -8;
const DITCH = PN.ditch;
const DITCH_LEN = LineLength(DITCH.line);
const DITCH_BOX = (() => {
  const xs = DITCH.line.map((p) => p.x), zs = DITCH.line.map((p) => p.z), m = DITCH.topW / 2 + DITCH.lipW + PN.scarp.notchR + 2;
  return { minX: Math.min(...xs) - m, maxX: Math.max(...xs) + m, minZ: Math.min(...zs) - m, maxZ: Math.max(...zs) + m };
})();
// 坟：两座孤坟 + 坟地五座 + 第三版田里散的单个坟（L0105_FIELD_GRAVES）
const GRAVES = Object.freeze([...PN.loneGraves, ...PN.graveyard, ...L0105_FIELD_GRAVES]);

/** 点到干水沟中心线：→ { d 横向距离, along 弧长 }（离沟很远时 d = Infinity）。 */
export function DitchStation(x, z) {
  if (x < DITCH_BOX.minX || x > DITCH_BOX.maxX || z < DITCH_BOX.minZ || z > DITCH_BOX.maxZ) return { d: Infinity, along: 0 };
  let best = Infinity, at = 0, walked = 0;
  for (let i = 1; i < DITCH.line.length; i++) {
    const a = DITCH.line[i - 1], b = DITCH.line[i];
    const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz);
    const t = Clamp01(((x - a.x) * dx + (z - a.z) * dz) / (len * len));
    const d = Math.hypot(x - a.x - dx * t, z - a.z - dz * t);
    if (d < best) { best = d; at = walked + len * t; }
    walked += len;
  }
  return { d: best, along: at };
}
/** 干水沟在这一处的深度系数（西南头最后 endTaperM 渐浅到 0）。 */
export function DitchDepthAt(along) { return DITCH.depth * Smooth((DITCH_LEN - along) / DITCH.endTaperM); }

/** 大起伏（米）：z < clearedToZ 起 rampM 内渐强。 */
export function PitNorthRoll(x, z) {
  const w = Smooth((PN.clearedToZ - z) / PN.roll.rampM);
  if (w <= 0) return 0;
  const r = PN.roll;
  return w * (r.a1 * Math.sin(x * r.k1x + z * r.k1z + r.p1) + r.a2 * Math.sin(x * r.k2x + z * r.k2z + r.p2));
}
/** 路穿过地坎处的坡道（2026-10-20 第二轮）：大路放宽 roadM、田间小路放宽 pathM，离路中心 R 米内渐变。 */
const SCARP_ROAD_NOTCH = Object.freeze({ roadM: 14, roadR: 7, pathM: 9, pathR: 4 });
/** 地坎（≤ 0，北边低 drop）：坎面宽 faceM，干水沟穿过处放宽成豁口，大路 / 小路穿过处放宽成坡道。 */
export function ScarpDelta(x, z, ditchD = DitchStation(x, z).d) {
  const s = PN.scarp;
  const u = ScarpZ(x) - z;   // 坎线以北为正
  let notch = s.notchM * (1 - Smooth(ditchD / s.notchR));
  if (Math.abs(u) < (s.faceM + SCARP_ROAD_NOTCH.roadM) / 2 + 0.5) {
    notch = Math.max(notch, SCARP_ROAD_NOTCH.roadM * (1 - Smooth(DistanceToPolyline(x, z, L0105_NORTH_ROAD) / SCARP_ROAD_NOTCH.roadR)),
      SCARP_ROAD_NOTCH.pathM * (1 - Smooth(DistanceToPolyline(x, z, L0105_FIELD_PATH) / SCARP_ROAD_NOTCH.pathR)));
  }
  const W = s.faceM + notch;
  if (u < -W / 2 - 0.01) return 0;
  return -s.drop * Smooth((u + W / 2) / W);
}
/** 田埂加高（米）：最高那一道。 */
export function BundHeight(x, z) {
  let best = 0;
  for (const b of PN.bunds) {
    if (x < b.minX - 1 || x > b.maxX + 1) continue;
    const zc = BundZ(b, x);
    const slope = b.amp * b.k * Math.cos(b.k * x + b.phase);
    const d = Math.abs(z - zc) / Math.hypot(1, slope);
    const half = PN.bundTopW / 2;
    if (d >= half + PN.bundSlopeM) continue;
    const k = d <= half ? 1 : 1 - Smooth((d - half) / PN.bundSlopeM);
    const ends = Smooth((x - b.minX) / 3) * Smooth((b.maxX - x) / 3);
    best = Math.max(best, PN.bundH * k * ends);
  }
  return best;
}
/** 坟包加高（米）：圆顶，底半径 graveBaseR。 */
export function GraveHeight(x, z) {
  let best = 0;
  const R = PN.graveBaseR;
  for (const g of GRAVES) {
    const r = Math.hypot(x - g.x, z - g.z);
    if (r >= R) continue;
    best = Math.max(best, g.h * Math.pow(1 - (r / R) * (r / R), 1.2));
  }
  return best;
}
/** 干水沟：返回 { cap 开挖后的高度上限（Infinity = 不挖）, lip 沟沿翻土加高 }；base = 起伏 + 地坎后的地面。 */
function DitchCut(base, st, x, z) {
  if (!(st.d < DITCH.topW / 2 + DITCH.lipW)) return { cap: Infinity, lip: 0 };
  // 大路北段从沟上过：路面下填平（涵洞土），离路边 3 m 渐回原深
  const fill = Smooth((DistanceToPolyline(x, z, L0105_NORTH_ROAD) - L0105_NORTH_ROAD_HALF_W - 1) / 3);
  if (fill <= 0) return { cap: Infinity, lip: 0 };
  const depth = DitchDepthAt(st.along) * fill;
  const fh = DITCH.floorW / 2, th = DITCH.topW / 2;
  if (st.d >= th) {
    const u = (st.d - th) / DITCH.lipW;
    return { cap: Infinity, lip: DITCH.lipH * Math.sin(u * Math.PI) * (depth / DITCH.depth) };
  }
  const k = st.d <= fh ? 1 : 1 - Smooth((st.d - fh) / (th - fh));
  return { cap: base - depth * k, lip: 0 };
}
/** 坑北前景合到地面上。h = 原来的自然地面（含前沿一带的小起伏、坑北略低）。 */
export function PitNorthHeight(x, z, h) {
  const st = DitchStation(x, z);
  const base = h + PitNorthRoll(x, z) + ScarpDelta(x, z, st.d);   // 2026-10-20 第三版：往北抬的那层（tilt）去掉，压平
  let out = base + Math.max(BundHeight(x, z), GraveHeight(x, z));
  const cut = DitchCut(base, st, x, z);
  if (cut.cap < out) out = cut.cap;
  else out += cut.lip;
  return out;
}

// ---------------------------------------------------------------------------
// 2. 路

const ROAD_LOWER_M = 0.15, ROAD_SHOULDER_M = 0.1, ROAD_SHOULDER_W = 1.4;

function DistanceToPolyline(x, z, line) {
  let best = Infinity;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1], b = line[i];
    const dx = b.x - a.x, dz = b.z - a.z;
    const t = Clamp01(((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1));
    best = Math.min(best, Math.hypot(x - a.x - dx * t, z - a.z - dz * t));
  }
  return best;
}

function RoadDelta(x, z) {
  const d = DistanceToPolyline(x, z, L0105_ROAD);
  const half = L0105_ROAD_WIDTH_M / 2;
  if (d > half + ROAD_SHOULDER_W + 0.5) return 0;
  const lower = -ROAD_LOWER_M * (1 - Smooth((d - half + 0.3) / 0.6));
  const u = (d - half) / ROAD_SHOULDER_W;
  const shoulder = u > 0 && u < 1 ? ROAD_SHOULDER_M * Math.sin(u * Math.PI) : 0;
  return lower + shoulder;
}

// ---------------------------------------------------------------------------
// 3. 壕沟（Script_TrenchPlan）

/**
 * 沟底宽：锚点给的 floorW 是「最窄处」下限。TrenchPlan 的位置噪声会把沟底按 ±floorJitter·jitterScale 揉窄揉宽、
 * 沟沿再加 ±edgeJitterM·jitterScale 的毛边；这里把随机压到 TRENCH_JITTER_SCALE，再把名义宽放到 FloorWFor(min)，
 * 保证最窄处仍 ≥ 锚点值（爬沟例外，只给玩家爬）。
 */
const TRENCH_JITTER_SCALE = 0.4;
const FLOOR_JITTER = 0.16, EDGE_JITTER_M = 0.12; // 与 TRENCH_PRESETS.communication / fire 同
function FloorWFor(minFloorW) {
  const js = TRENCH_JITTER_SCALE;
  return Math.ceil(((minFloorW / 2 + EDGE_JITTER_M * js) / (1 - FLOOR_JITTER * js)) * 2 * 10) / 10;
}

const S = L0105_TRENCH_SECTION;
const Pts = (line) => line.map((p) => ({ x: p.x, z: p.z }));

/** 网络规格：前沿沟拆两段（西头往北折的那一截弃土堆在西边，东西走向的主段弃土堆在北边）。 */
export function L0105TrenchSpec() {
  const front = Pts(L0105_TRENCHES.front);
  return {
    version: 1,
    seed: "tengxian1938:L0105:trench",
    earthProfile: TRENCH_EARTH_PROFILE,
    segments: [
      // 法向 n = (−tz, tx)；minus 一侧：东西段（t=+X）是北，往北折那截（t=−Z）是西。都朝敌。
      { id: "FrontFlank", preset: "fire", points: [front[1], front[0]], depth: S.front.depth, floorW: FloorWFor(S.front.floorW),
        bermSide: "minus", jitterScale: TRENCH_JITTER_SCALE, source: "L0105_TRENCHES.front[0..1]（西头直角往北折，护左翼）" },
      { id: "FrontLine", preset: "fire", points: front.slice(1), depth: S.front.depth, floorW: FloorWFor(S.front.floorW),
        bermSide: "minus", jitterScale: TRENCH_JITTER_SCALE, source: "L0105_TRENCHES.front[1..]" },
      { id: "Traffic", preset: "communication", points: Pts(L0105_TRENCHES.traffic), depth: S.traffic.depth,
        floorW: FloorWFor(S.traffic.floorW), jitterScale: TRENCH_JITTER_SCALE, source: "L0105_TRENCHES.traffic" },
      // 支沟自西向东：plus 一侧是南。弃土只堆南沿，堆成一道土垄（北沿留给日军机枪架枪）。
      { id: "Branch", preset: "communication", points: Pts(L0105_TRENCHES.branch), depth: S.branch.depth,
        floorW: FloorWFor(S.branch.floorW), bermSide: "plus", bermH: L0105_BRANCH_SOUTH_BERM.h, bermW: L0105_BRANCH_SOUTH_BERM.w,
        jitterScale: TRENCH_JITTER_SCALE, source: "L0105_TRENCHES.branch（南沿土垄 = L0105_BRANCH_SOUTH_BERM）" },
      { id: "CrawlSap", preset: "sap", points: Pts(L0105_TRENCHES.crawlSap), depth: S.crawlSap.depth,
        floorW: S.crawlSap.floorW, bankW: 0.6, bermH: 0.12, bermW: 0.8, cornerRadiusM: 0, jitterScale: TRENCH_JITTER_SCALE,
        source: "L0105_TRENCHES.crawlSap（坑西北角 → 散兵坑）" },
    ],
  };
}

/**
 * 交通沟的目标深度随 z：路口以北 traffic.depth；板桥底下 trafficAtCrossing.depth（桥下净空）；
 * 过坡顶那段 trafficAtCrest.depth；坡顶往南沟底按 RAMP 直线降到干沟沟底（顺着北岸的坎切成坡道），深度 = 自然地面 − 沟底。
 */
const CROSSING_DEEP_FROM_Z = P.crossing.z - 9;   // 107：板桥往北 9 m 开始加深
const CROSSING_DEEP_FULL_Z = P.crossing.z - 4;   // 112
const CREST_SHALLOW_FROM_Z = P.crossing.z + 4;   // 120：板桥往南 4 m 开始变浅
const CREST_SHALLOW_FULL_Z = P.crest.z - 6;      // 125
const RAMP_FROM_Z = P.crest.z;                   // 131：坡顶沟底（自然 3.0 − 1.5）
const RAMP_TO_Z = 142;                           // 坡道落到干沟沟底（干沟在 x 35 的北沿约 141.5）
export function TrafficDepthAt(z) {
  const deep = S.traffic.depth, under = S.trafficAtCrossing.depth, crest = S.trafficAtCrest.depth;
  if (z <= CROSSING_DEEP_FROM_Z) return deep;
  if (z <= CROSSING_DEEP_FULL_Z) return Lerp(deep, under, Smooth((z - CROSSING_DEEP_FROM_Z) / (CROSSING_DEEP_FULL_Z - CROSSING_DEEP_FROM_Z)));
  if (z <= CREST_SHALLOW_FROM_Z) return under;
  if (z <= RAMP_FROM_Z) return Lerp(under, crest, Smooth((z - CREST_SHALLOW_FROM_Z) / (CREST_SHALLOW_FULL_Z - CREST_SHALLOW_FROM_Z)));
  const floorTop = NaturalHeight(P.crest.x, RAMP_FROM_Z) - crest;
  const floorY = Lerp(floorTop, H.assemblyFloor, Clamp01((z - RAMP_FROM_Z) / (RAMP_TO_Z - RAMP_FROM_Z)));
  return Math.max(0, NaturalHeight(P.crest.x, z) - floorY);
}
/** Apply 的开挖基准面抬高量（负 = 挖深）：只在交通沟板桥往南那一截（别的沟够不着这里）。 */
function TrafficBaseLift(x, z) {
  if (z <= CROSSING_DEEP_FROM_Z || Math.abs(x - P.crest.x) > 12) return 0;
  return S.traffic.depth - TrafficDepthAt(z);
}

// 支沟口：交通沟这一侧不许被支沟端头挖深；台阶从 STEP_TOP_X 往东排
const STEP_TREAD_M = 0.45;
const STEP_COUNT = P.steps.count;
const STEP_TOP_X = P.steps.x - (STEP_COUNT * STEP_TREAD_M) / 2;   // 最上一级的西沿 = 交通沟这边的「坎」
const JUNCTION_ZONE = Object.freeze({ minX: P.branchMouth.x - 6, maxX: STEP_TOP_X, halfZ: 4.5 });
function BranchZAt(x) {
  const [a, b] = L0105_TRENCHES.branch;
  return a.z + (b.z - a.z) * (x - a.x) / (b.x - a.x);
}

// ---------------------------------------------------------------------------
// 5. 坑与洞（平底开挖）

const PIT = P.pit;
const PIT_WALL_M = 0.45;
// 坑的南边并进前沿沟的北坡（坑底到沟底一步落差，用 PitStep 补）
const PIT_BOX = Object.freeze({ minX: PIT.x - PIT.w / 2 + PIT_WALL_M, maxX: PIT.x + PIT.w / 2 - PIT_WALL_M,
  minZ: PIT.z - PIT.d / 2 + PIT_WALL_M, maxZ: -2.6 });
const FIREC = P.fireC;
const DUG = P.dugout;
const DUG_WALL_M = 0.3;
const DUG_BOX = Object.freeze({ minX: DUG.x - DUG.w / 2, maxX: DUG.x + DUG.w / 2, minZ: DUG.z - DUG.d / 2, maxZ: DUG.z + DUG.d / 2 });

/** 平底开挖：box 里是 floorY，外面 wallM 内陡起到原地面。 */
function CarveBox(h, x, z, box, floorY, wallM) {
  const sdf = RectSdf(x, z, box.minX, box.maxX, box.minZ, box.maxZ);
  if (sdf >= wallM) return h;
  const k = sdf <= 0 ? 1 : 1 - Smooth(sdf / wallM);
  return Math.min(h, Lerp(h, floorY, k));
}
function CarveDisc(h, x, z, cx, cz, r, floorY, wallM) {
  const d = Math.hypot(x - cx, z - cz) - r;
  if (d >= wallM) return h;
  const k = d <= 0 ? 1 : 1 - Smooth(d / wallM);
  return Math.min(h, Lerp(h, floorY, k));
}

// ---------------------------------------------------------------------------
// 地面合成

/** 建好的地面函数（含壕沟 / 坑 / 洞）与几个平底高度。 */
export function L0105Ground() {
  const plan = CompileTrenchNetwork(L0105TrenchSpec(), { natural: NaturalHeight });
  const pitFloorY = NaturalHeight(PIT.x, PIT.z) - PIT.floorDepth;
  const fireCFloorY = NaturalHeight(FIREC.x, FIREC.z) - FIREC.depth;
  const dugoutFloorY = NaturalHeight(DUG.x, DUG.z) - DUG.floorDepth;
  const Ground = (x, z) => {
    const natural = NaturalHeight(x, z);
    let h = natural + RoadDelta(x, z);
    h = plan.Apply(x, z, h, natural + TrafficBaseLift(x, z));
    // 支沟口：交通沟里夹到交通沟底（支沟端头别把交通沟挖深）
    if (x > JUNCTION_ZONE.minX && x < JUNCTION_ZONE.maxX && Math.abs(z - BranchZAt(x)) < JUNCTION_ZONE.halfZ) {
      h = Math.max(h, natural - S.traffic.depth);
    }
    // 板桥两头：交通沟的弃土垄不许堆在路面上（桥面要与路面齐平）
    if (Math.hypot(x - L0105_BRIDGE.x, z - L0105_BRIDGE.z) < L0105_BRIDGE.spanM && DistanceToPolyline(x, z, L0105_ROAD) < L0105_ROAD_WIDTH_M / 2 + 1.2) {
      h = Math.min(h, natural + RoadDelta(x, z));
    }
    // 干沟里压平：交通沟末端的弃土垄别堆在沟底（坡道是往下挖的，不受影响）；南岸土埂脚下不再削第二遍（NaturalHeight 已按干沟削过）
    { const w = GullyWeight(x, z); if (w > 0 && !(GullySouthBerm(x, z) > 0)) h = Math.min(h, Lerp(h, H.assemblyFloor, w)); }
    h = CarveBox(h, x, z, PIT_BOX, pitFloorY, PIT_WALL_M);
    h = CarveDisc(h, x, z, FIREC.x, FIREC.z, FIREC.radiusM - 0.35, fireCFloorY, 0.35);
    h = CarveBox(h, x, z, DUG_BOX, dugoutFloorY, DUG_WALL_M);
    return h;
  };
  return { Ground, plan, pitFloorY, fireCFloorY, dugoutFloorY };
}

/** 按 §2.2 烘高度：(cols+1)×(rows+1) 个 int16 小端厘米，heights[iz*(cols+1)+ix]。 */
export function BakeL0105Grid(ground, bounds = L0105_BOUNDS, cellM = L0105_CELL_M) {
  const cols = Math.round((bounds.maxX - bounds.minX) / cellM);
  const rows = Math.round((bounds.maxZ - bounds.minZ) / cellM);
  const buffer = Buffer.alloc((cols + 1) * (rows + 1) * 2);
  let min = Infinity, max = -Infinity, southMax = -Infinity, southMin = Infinity;
  for (let iz = 0; iz <= rows; iz++) {
    const south = bounds.minZ + iz * cellM >= PIT_NORTH_FROM_Z;
    for (let ix = 0; ix <= cols; ix++) {
      const y = ground(bounds.minX + ix * cellM, bounds.minZ + iz * cellM);
      const cm = Math.max(-32768, Math.min(32767, Math.round(y * 100)));
      if (cm < min) min = cm;
      if (cm > max) max = cm;
      if (south && cm > southMax) southMax = cm;
      if (south && cm < southMin) southMin = cm;
      buffer.writeInt16LE(cm, (iz * (cols + 1) + ix) * 2);
    }
  }
  return {
    terrain: { kind: "heightmap", minX: bounds.minX, minZ: bounds.minZ, cellM, cols, rows, encoding: "int16-cm-base64", data: buffer.toString("base64") },
    minM: min / 100, maxM: max / 100, southMaxM: southMax / 100, southMinM: southMin / 100,
  };
}

// ---------------------------------------------------------------------------
// 体块

const Block = (id, x, z, w, d, h, semantic, extra = {}) => ({ id, x: R2(x), z: R2(z), w: R2(w), d: R2(d), h: R2(h), ry: 0, semantic, solid: true, ...extra });
const FACE_NORTH = Object.freeze({ faceX: 0, faceZ: -1 });
const FACE_SOUTH = Object.freeze({ faceX: 0, faceZ: 1 });

/**
 * 体块与随信号体块。sample 是烘好的网格采样（与浏览器里建出来的地面逐点一致），显式 y 都按它算。
 * 返回 { blocks, gates, facts }，facts 给 notes 用。
 */
export function L0105Blocks(sample, floors) {
  const blocks = [], gates = [];
  const facts = {};

  // --- 机枪坑：北沿胸墙三截，中间那截 03 末被战车一炮打塌 -------------------
  const par = P.parapet;
  const third = par.w / 3;
  const parY = (x) => sample(x, par.z) + par.h / 2 - 0.12;   // 胸墙脚埋进土里 12 cm（坑沿那一角是坡）
  blocks.push(Block("ParapetWest", par.x - third, par.z, third, par.d, par.h, "earthDark", { y: R2(parY(par.x - third)), cover: { ...FACE_NORTH } }));
  blocks.push(Block("ParapetEast", par.x + third, par.z, third, par.d, par.h, "earthDark", { y: R2(parY(par.x + third)), cover: { ...FACE_NORTH } }));
  gates.push(Block("ParapetMiddle", par.x, par.z, third, par.d, par.h, "earthDark", { y: R2(parY(par.x)), cover: { ...FACE_NORTH }, signal: L0105_SIGNALS.pitShelled }));
  // 塌下来的土：一摊矮的盖在坑沿上，一块溜进坑里
  gates.push(Block("ParapetRubble", par.x + 0.3, par.z + 0.2, third + 0.8, par.d + 0.6, 0.4, "earthDark",
    { y: R2(sample(par.x, par.z) + 0.1), cover: { ...FACE_NORTH }, appearSignal: L0105_SIGNALS.pitShelled }));
  gates.push(Block("ParapetRubbleSlump", par.x + 0.6, PIT.z - PIT.d / 2 + 2.1, 1.6, 1.0, 0.45, "earthDark",
    { appearSignal: L0105_SIGNALS.pitShelled }));
  // 射击台：坑底 −1.3 加胸墙 0.8，站在坑底眼高（1.6）比胸墙顶低 0.5 m，看不出去。
  // 沿北壁垫一条 0.7 m 的土台（甲位 / 捷克式都在上面），站上去眼高比胸墙顶高约 0.3 m；跳下来就在胸墙后面。
  blocks.push(Block("PitFireStep", PIT.x, PIT.z - PIT.d / 2 + PIT_WALL_M + 0.55, PIT.w - 2 * PIT_WALL_M, 1.1, 0.7, "earthDark"));
  // 坑底到前沿沟底的一级台阶（在沟的北沿脚下）
  blocks.push(Block("PitStep", PIT.x, -1.7, 2.6, 0.6, R2(Math.max(0.2, (floors.pitFloorY - floors.frontFloorAtMouth) / 2)), "step"));

  // --- 支沟口台阶：从支沟底往西一级一级上到交通沟底 --------------------------
  const branchFloor = floors.branchFloorAtSteps, trafficFloor = floors.trafficFloorAtJunction;
  const rise = Math.max(0.3, trafficFloor - branchFloor);
  facts.stepRise = rise;
  for (let i = 0; i < STEP_COUNT; i++) {
    // i = 0 是最上一级（最西），高 = 全落差；往东一级比一级矮
    const h = rise * (STEP_COUNT - i) / STEP_COUNT;
    const x = STEP_TOP_X + STEP_TREAD_M * (i + 0.5);
    blocks.push(Block(`BranchStep${i + 1}`, x, BranchZAt(x), STEP_TREAD_M, 3.4, h, "step", { y: R2(branchFloor + h / 2) }));
  }

  // --- 防炮洞 ---------------------------------------------------------------
  const floorY = floors.dugoutFloorY;
  const mouthX = P.dugoutMouth.x;
  const clearM = 2.45;                        // 洞里顶板下净高（门楣下 2.15）
  const timberT = 0.3, earthT = 0.5;
  const roofUnder = floorY + clearM;
  const roofMinZ = DUG_BOX.minZ - 0.6, roofMaxZ = DUG_BOX.maxZ + 0.6, roofD = roofMaxZ - roofMinZ, roofZ = (roofMinZ + roofMaxZ) / 2;
  const mouthStripW = 1.5;                    // 洞口那一截顶盖（塌洞时塌掉）
  const backX0 = mouthX + mouthStripW, backX1 = DUG_BOX.maxX + 0.6;
  blocks.push(Block("DugoutRoofTimber", (backX0 + backX1) / 2, roofZ, backX1 - backX0, roofD, timberT, "timber", { y: R2(roofUnder + timberT / 2) }));
  blocks.push(Block("DugoutRoofEarth", (backX0 + backX1) / 2 + 0.2, roofZ, backX1 - backX0 + 0.8, roofD + 0.8, earthT, "earthDark", { y: R2(roofUnder + timberT + earthT / 2) }));
  gates.push(Block("DugoutMouthRoofTimber", mouthX + mouthStripW / 2, roofZ, mouthStripW, roofD, timberT, "timber",
    { y: R2(roofUnder + timberT / 2), signal: L0105_SIGNALS.dugoutCollapsed }));
  gates.push(Block("DugoutMouthRoofEarth", mouthX + mouthStripW / 2, roofZ, mouthStripW, roofD + 0.8, earthT, "earthDark",
    { y: R2(roofUnder + timberT + earthT / 2), signal: L0105_SIGNALS.dugoutCollapsed }));
  // 洞口：两根门柱 + 横楣；门柱外侧到洞壁用挡土板封上（洞口宽 2.6 m）
  const doorHalf = 1.3, postT = 0.25, postH = clearM - 0.3;
  for (const [id, s] of [["DugoutDoorPostNorth", -1], ["DugoutDoorPostSouth", 1]]) {
    blocks.push(Block(id, mouthX, P.dugoutMouth.z + s * (doorHalf + postT / 2), postT, postT, postH, "timber", { y: R2(floorY + postH / 2) }));
  }
  gates.push(Block("DugoutLintel", mouthX, P.dugoutMouth.z, 0.3, doorHalf * 2 + postT * 2 + 0.4, 0.3, "timber",
    { y: R2(floorY + postH + 0.15), signal: L0105_SIGNALS.dugoutCollapsed }));
  for (const [id, s] of [["DugoutMouthWallNorth", -1], ["DugoutMouthWallSouth", 1]]) {
    const inner = P.dugoutMouth.z + s * (doorHalf + postT), outer = s < 0 ? DUG_BOX.minZ - DUG_WALL_M : DUG_BOX.maxZ + DUG_WALL_M;
    const z0 = Math.min(inner, outer), z1 = Math.max(inner, outer);
    blocks.push(Block(id, mouthX - 0.1, (z0 + z1) / 2, 0.25, z1 - z0, clearM, "timber", { y: R2(floorY + clearM / 2) }));
  }
  // 塌洞：压顺子腰的横木（横在洞口内侧，下沿离地 0.34 m，略斜）、洞口南半边的土堆、散落的土块
  // 顺子趴在洞口往东 0.5–1 m、头朝西：头约 x 63.4，腰约 x 64.3；洞口北半边留空，他转头能看见支沟。
  const beamX = mouthX + 1.3;
  gates.push(Block("DugoutCollapseBeam", beamX, P.dugoutMouth.z + 0.4, 0.32, 4.4, 0.32, "timber",
    { y: R2(floorY + 0.5), ry: 0.12, appearSignal: L0105_SIGNALS.dugoutCollapsed }));
  gates.push(Block("DugoutCollapseHeap", mouthX + 0.4, P.dugoutMouth.z + 1.55, 2.2, 1.9, 1.3, "earthDark",
    { y: R2(floorY + 0.65), appearSignal: L0105_SIGNALS.dugoutCollapsed }));
  gates.push(Block("DugoutCollapseHeapInner", mouthX + 1.9, P.dugoutMouth.z + 1.7, 1.4, 1.5, 0.7, "earthDark",
    { y: R2(floorY + 0.35), appearSignal: L0105_SIGNALS.dugoutCollapsed }));
  const clods = [[-1.2, 1.0, 0.6, 0.5, 0.35], [-2.0, 1.4, 0.5, 0.4, 0.25], [2.4, -0.6, 0.6, 0.5, 0.3], [-0.6, -1.4, 0.4, 0.4, 0.2]];
  clods.forEach(([dx, dz, w, d, h], i) => {
    const x = mouthX + dx, z = P.dugoutMouth.z + dz;
    gates.push(Block(`DugoutCollapseClod${i + 1}`, x, z, w, d, h, "earthDark", { appearSignal: L0105_SIGNALS.dugoutCollapsed }));
  });
  facts.dugoutClear = clearM;
  facts.beamGap = R2(0.5 - 0.16);

  // --- 路口板桥：顺路方向三根横木，上面一排门板，桥面与两头地面齐平 -------------
  const bridge = BridgeBlocks(sample);
  blocks.push(...bridge.blocks);
  gates.push(...bridge.gates);
  Object.assign(facts, bridge.facts);

  // --- 沟里的日常摆件 ---------------------------------------------------------
  const props = PropBlocks();
  blocks.push(...props);
  facts.props = props.length;

  // --- 干沟南岸一排枯树（树干块） ----------------------------------------------
  L0105_GULLY_TREES.forEach((t, i) => {
    blocks.push(Block(`DeadTree_${String(i + 1).padStart(2, "0")}`, t.x, t.z, 0.42, 0.42, t.h, "foliage"));
  });

  // --- 坡顶别的班的坡沿（趴着朝北）：低沙袋 / 土埂 ----------------------------
  P.crestPosts.forEach((p, i) => {
    blocks.push(Block(`CrestPost${i + 1}`, p.x, p.z - 0.6, 2.6, 0.8, 0.45, i % 2 ? "earthDark" : "cover", { cover: { ...FACE_NORTH } }));
  });

  // --- 坑北前景（2026-10-20）：树桩、坟地柏树、麦秸垛、村前杨树、土坯房（田埂 / 坟包 / 干水沟 / 地坎在高度场里） ----------
  blocks.push(...PitNorthBlocks(sample));

  return { blocks, gates, facts };
}

/**
 * 坑北前景的体块（2026-10-20）：树桩（矮块，不挡人）、坟地柏树（细高块）、麦秸垛（两层块，圆顶感）；
 * 第二轮起：大路北段两边的杨树、田边零星的树、田间小路边一排树。第三版：村子拿掉（挪到远景层），杨树顺新的大路北段种到北边界，
 * 出了边界的那几棵进远景层（L0105Backdrop）。
 * 树都是细高 foliage 块（脚印 0.6 m ≤ 1 m），编辑器种成树模型（IsSceneTreeBlock）。
 * 显式 y 的块（麦秸垛上层）按 sample 在脚印中心与四角取最低的地面算（同不写 y 时加载器的落地法）。
 */
export function PitNorthBlocks(sample) {
  const out = [];
  const Low = (x, z, w, d) => Math.min(sample(x, z), sample(x - w / 2, z - d / 2), sample(x + w / 2, z - d / 2), sample(x - w / 2, z + d / 2), sample(x + w / 2, z + d / 2));
  const N2 = (i) => String(i + 1).padStart(2, "0");
  const Tree = (id, x, z, h) => out.push(Block(id, x, z, 0.6, 0.6, h, "foliage", { prop: "Tree" }));
  PN.stumps.forEach((s, i) => out.push(Block(`FieldStump_${N2(i)}`, s.x, s.z, 0.45, 0.45, s.h, "timber", { prop: "Stump" })));
  PN.cypresses.forEach((t, i) => out.push(Block(`GraveCypress_${N2(i)}`, t.x, t.z, 1.1, 1.1, t.h, "foliage", { prop: "Cypress" })));
  const Haystack = (id, x, z, w, d, h, baseH, topW, topD, extra = {}) => {
    const y0 = Low(x, z, w, d);
    out.push(Block(id, x, z, w, d, baseH, "canvas", { prop: "Haystack", y: R2(y0 + baseH / 2), ...extra }));
    out.push(Block(`${id}Top`, x, z, topW, topD, h - baseH, "canvas", { prop: "Haystack", y: R2(y0 + baseH + (h - baseH) / 2) }));
  };
  const hs = PN.haystack;
  Haystack("Haystack", hs.x, hs.z, hs.w, hs.d, hs.h, hs.baseH, hs.topW, hs.topD, { cover: { ...FACE_SOUTH } });

  // 大路北段两边的杨树（场地里那几棵；出了北边界的进远景层）
  for (const t of RoadPoplarSpots()) if (t.inField) Tree(t.id, t.x, t.z, t.h);
  L0105_FIELD_TREES.forEach((t, i) => Tree(`FieldTree_${N2(i)}`, t.x, t.z, t.h));
  {
    const PT = L0105_PATH_TREES;
    let k = 0;
    for (let d = PT.fromM; d <= PT.toM; d += PT.spacing, k += 1) {
      const p = PointBeside(L0105_FIELD_PATH, d, -PT.lat);   // 小路从北边界往南走，右手 = 西侧
      if (Math.abs(ScarpZ(p.x) - p.z) < 6 || GraveHeight(p.x, p.z) > 0) continue;
      Tree(`PathTree_${N2(k)}`, p.x, p.z, PT.hMin + (PT.hMax - PT.hMin) * Hash01(k, 19));
    }
  }
  return out;
}

/** 大路北段 + 远景里那段连起来（村 A 南口以南）的弧长线。 */
const ROAD_TO_A = Object.freeze([...L0105_NORTH_ROAD, ...L0105_BACKDROP_ROAD.slice(1)]);
/**
 * 大路两边的杨树：spacing 米一棵，位置 / 树高按序号做确定性抖动；不种在干水沟、地坎坎面上，不压着田间小路和坟。
 * inField = 在场地里（z ≥ minZ + 1）→ 体块；否则进远景层（kind "tree"）。
 */
export function RoadPoplarSpots() {
  const RT = L0105_ROAD_TREES, out = [];
  let ti = 0;
  for (let d = RT.fromM; d <= RT.toM; d += RT.spacing) {
    for (const side of [1, -1]) {
      const j = Hash01(ti * 2 + (side > 0 ? 0 : 1), 7);
      const p = PointBeside(ROAD_TO_A, d + (j - 0.5) * 2 * RT.jitterM, side * (RT.lat + (Hash01(ti, 11) - 0.5) * 0.8));
      ti += 1;
      if (DitchStation(p.x, p.z).d < 4 || Math.abs(ScarpZ(p.x) - p.z) < 6 || DistanceToPolyline(p.x, p.z, L0105_FIELD_PATH) < 4 || GraveHeight(p.x, p.z) > 0) continue;
      out.push({ id: `RoadPoplar_${String(ti).padStart(3, "0")}`, x: R2(p.x), z: R2(p.z), h: R2(RT.hMin + (RT.hMax - RT.hMin) * Hash01(ti, 13)),
        inField: p.z >= L0105_BOUNDS.minZ + 1 });
    }
  }
  return out;
}

/** 确定性 0…1（不读随机数）。 */
function Hash01(i, salt = 0) {
  const v = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return v - Math.floor(v);
}

// ---------------------------------------------------------------------------
// 田的分组网格（2026-10-20 第三版，L0105_FARM）：场地的涂色与远景层的田块都从这里切，接缝两边对得上

const FARM = L0105_FARM;
const Pick = (range, u) => range[0] + (range[1] - range[0]) * u;
/** 组排的一条南北界在 x 处的 z（"scarp" = 地坎中心线；出了场地按边界上的值延长，远景里的田接得上）。 */
export function FarmEdgeZ(edge, x) {
  if (edge === "scarp") return ScarpZ(Math.max(L0105_BOUNDS.minX, Math.min(L0105_BOUNDS.maxX, x)));
  return edge;
}
/** 种什么：按 crops 的比例抽；kind + 两档深浅里的哪一档。 */
function PickCrop(u, shadeU) {
  let acc = 0;
  for (const [kind, w] of FARM.crops) { acc += w; if (u < acc) return { kind, shade: shadeU < 0.5 ? 0 : 1 }; }
  return { kind: FARM.crops[FARM.crops.length - 1][0], shade: shadeU < 0.5 ? 0 : 1 };
}
export function CropColor(c) { return L0105_FIELD_PAINT[c.kind][c.shade]; }

/**
 * 切田：→ { rows: [{ index, south, north }], groups: [{ row, index, x0, x1, strips: bool }], parcels: [{ row, group, x0, x1, crop }] }。
 * 组排：rowsZ 定的几排之后按 rowLen 往北排到 region.minZ；每排从 originX 起按 groupW 切组（每排起点错开）；
 * 组里按 stripW 切条（最后一条把剩下的分匀，不留细边），左右相邻两条不种同一样；组心离坑 > stripRadiusM 的一组一块。
 */
export function FarmLayout() {
  const edges = [...FARM.rowsZ];
  for (let k = 0; ; k++) {
    const last = edges[edges.length - 1];
    if (last <= FARM.region.minZ) break;
    edges.push(Math.max(FARM.region.minZ, Math.round(last - Pick(FARM.rowLen, Hash01(k, 31)))));
  }
  const rows = [], groups = [], parcels = [];
  const pit = { x: P.pit.x, z: P.pit.z };
  for (let r = 0; r + 1 < edges.length; r++) {
    const row = { index: r, south: edges[r], north: edges[r + 1] };
    rows.push(row);
    let x = FARM.originX - Hash01(r, 41) * FARM.groupW[1];
    for (let g = 0; x < FARM.region.maxX; g++) {
      const w = Math.round(Pick(FARM.groupW, Hash01(r * 1000 + g, 43)));
      const x0 = x, x1 = x + w;
      x = x1;
      if (x1 < FARM.region.minX) continue;
      const midZ = (FarmEdgeZ(row.south, (x0 + x1) / 2) + FarmEdgeZ(row.north, (x0 + x1) / 2)) / 2;
      const strips = Math.hypot((x0 + x1) / 2 - pit.x, midZ - pit.z) <= FARM.stripRadiusM;
      const group = { row: r, index: g, x0, x1, strips };
      groups.push(group);
      const key = r * 1000 + g;
      const gx0 = x0 + FARM.pathHalfW, gx1 = x1 - FARM.pathHalfW;
      if (!strips) {
        parcels.push({ row: r, group: g, x0: gx0, x1: gx1, crop: PickCrop(Hash01(key, 53), Hash01(key, 59)) });
        continue;
      }
      let sx = gx0, prev = null;
      for (let s = 0; sx < gx1 - 0.01; s++) {
        const u = Hash01(key * 100 + s, 47);
        let sw = FARM.stripW[0] + (FARM.stripW[1] - FARM.stripW[0]) * Math.pow(u, 1.4);
        const rem = gx1 - sx;
        if (rem <= FARM.stripW[1] && rem - sw < FARM.stripW[0]) sw = rem;
        else if (rem - sw < FARM.stripW[0]) sw = rem / 2;
        let crop = PickCrop(Hash01(key * 100 + s, 53), Hash01(key * 100 + s, 59));
        if (prev && crop.kind === prev.kind) {
          const kinds = FARM.crops.map((c) => c[0]).filter((k) => k !== prev.kind);
          crop = { kind: kinds[Hash01(key * 100 + s, 61) < 0.5 ? 0 : 1], shade: crop.shade };
        }
        parcels.push({ row: r, group: g, x0: sx, x1: sx + sw, crop });
        prev = crop;
        sx += sw;
      }
    }
  }
  return { rows, groups, parcels };
}

// ---------------------------------------------------------------------------
// 坑北地面涂色（场景文件 paint，§2.2 / §6.3；2026-10-20 第二轮起，第三版换成窄条田）

const PR1 = (v) => Math.round(v * 10) / 10;
const PPt = (x, z) => ({ x: PR1(x), z: PR1(z) });
/** 折线 / 曲线按步长取点。 */
function SampleCurve(fn, x0, x1, stepM) {
  const pts = [];
  const n = Math.max(1, Math.ceil((x1 - x0) / stepM));
  for (let i = 0; i <= n; i++) { const x = x0 + (x1 - x0) * i / n; pts.push(PPt(x, fn(x))); }
  return pts;
}
/** 八边形（坟包涂色）。 */
function Octagon(x, z, r) {
  const poly = []; for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; poly.push(PPt(x + Math.cos(a) * r, z + Math.sin(a) * r)); }
  return poly;
}

/**
 * 坑北的涂色项（按顺序叠，后面的盖前面的）：扫清带 → 田间小路底色 → 窄条田（FarmLayout，场地里那几组）→ 田埂 → 干水沟翻土 → 地坎坎面 → 坟 → 路 → 田间小路。
 * 田块的多边形往场地外多伸 2 m（栅格按场地边界裁，边上是满涂，跟远景层接得上）；地坎两边那两排的南 / 北沿顺着地坎曲线走。
 */
export function L0105Paint(farm = FarmLayout()) {
  const C = L0105_FIELD_PAINT, B = L0105_BOUNDS;
  const out = [];
  const X0 = B.minX - 2, X1 = B.maxX + 2, Z1 = B.minZ - 2;
  // 扫清带：z −12…−80（避开坑、散兵坑、爬沟和前沿沟西头北折那一截）
  out.push({ id: "Cleared", color: C.cleared, feather: 1.5, poly: [
    PPt(B.minX, -80), PPt(B.maxX, -80), PPt(B.maxX, -12), PPt(-1.5, -12), PPt(-1.5, -17.5), PPt(-11.5, -17.5), PPt(-11.5, -12),
    PPt(-56, -12), PPt(-56, -27), PPt(-68, -27), PPt(-68, -12), PPt(B.minX, -12)] });
  // 爬沟、丙位散兵坑一圈是挖出来的土（扫清带上留的那个缺口）
  out.push({ id: "SapSpoil", color: C.ditchSoil, strength: 0.75, feather: 1.2, poly: [PPt(-1.5, -12), PPt(-1.5, -17.5), PPt(-11.5, -17.5), PPt(-11.5, -12)] });
  // 田间小路底色：整片坑北先涂成小路色，田块之间留下的缝就是组与组、排与排之间的小路
  out.push({ id: "FarmPaths", color: C.fieldPath, feather: 0.6, poly: [PPt(X0, -80), PPt(X1, -80), PPt(X1, Z1), PPt(X0, Z1)] });
  // 窄条田（场地里那几组）
  const ph = FARM.pathHalfW;
  for (const p of farm.parcels) {
    const row = farm.rows[p.row];
    const x0 = Math.max(X0, p.x0), x1 = Math.min(X1, p.x1);
    if (!(x1 - x0 > 0.2)) continue;
    const s0 = row.south, n0 = row.north;
    const SouthZ = (x) => FarmEdgeZ(s0, x) - ph, NorthZ = (x) => Math.max(Z1, FarmEdgeZ(n0, x) + ph);
    if (SouthZ((x0 + x1) / 2) < Z1) continue;
    const south = s0 === "scarp" ? SampleCurve(SouthZ, x0, x1, 6) : [PPt(x0, SouthZ(x0)), PPt(x1, SouthZ(x1))];
    const north = (n0 === "scarp" ? SampleCurve(NorthZ, x0, x1, 6) : [PPt(x0, NorthZ(x0)), PPt(x1, NorthZ(x1))]).reverse();
    out.push({ id: `Field_${p.row + 1}_${String(p.group).padStart(2, "0")}_${String(Math.round(p.x0 * 10))}`, color: CropColor(p.crop), feather: 0.8, poly: [...south, ...north] });
  }
  // 田埂（烘进高度场的那几道）
  for (const b of PN.bunds) out.push({ id: `Bund_${b.id}`, color: C.bund, strength: 0.75, feather: 0.8, halfW: 0.45, line: SampleCurve((q) => BundZ(b, q), b.minX, b.maxX, 5) });
  // 干水沟两边翻出来的新土（连沟一起涂）
  out.push({ id: "DitchSoil", color: C.ditchSoil, strength: 0.9, feather: 0.8, halfW: PR1(DITCH.topW / 2 + DITCH.lipW), line: DITCH.line.map((p) => PPt(p.x, p.z)) });
  // 地坎坎面
  out.push({ id: "ScarpFace", color: C.scarpFace, strength: 0.9, feather: 0.8, halfW: 1.3, line: SampleCurve(ScarpZ, B.minX, B.maxX, 5) });
  // 坟包：坟地与两座孤坟是老坟，田里散的单个坟是新土
  [...PN.loneGraves.map((g, i) => ({ id: `LoneGrave${i + 1}`, ...g })), ...PN.graveyard].forEach((g) => {
    out.push({ id: `Grave_${g.id}`, color: C.graveSoil, feather: 0.6, poly: Octagon(g.x, g.z, 1.9) });
  });
  L0105_FIELD_GRAVES.forEach((g, i) => out.push({ id: `FieldGrave_${String(i + 1).padStart(2, "0")}`, color: C.newSoil, feather: 0.6, poly: Octagon(g.x, g.z, 1.9) }));
  // 路：大路在坑北这一截（到 z −11.5，南面不涂）+ 大路北段（到北边界）+ 田间小路
  {
    const endZ = -11.5;   // 圆头 + 柔边不过 z −8
    const a = L0105_ROAD[0], b = L0105_ROAD[1], t = (endZ - a.z) / (b.z - a.z);
    out.push({ id: "RoadNorthEnd", color: C.road, feather: 0.8, halfW: PR1(L0105_ROAD_WIDTH_M / 2), line: [PPt(a.x, a.z), PPt(a.x + (b.x - a.x) * t, endZ)] });
  }
  out.push({ id: "NorthRoad", color: C.road, feather: 0.8, halfW: L0105_NORTH_ROAD_HALF_W, line: L0105_NORTH_ROAD.map((p) => PPt(p.x, p.z)) });
  out.push({ id: "FieldPath", color: C.path, feather: 0.6, halfW: L0105_FIELD_PATH_HALF_W, line: L0105_FIELD_PATH.map((p) => PPt(p.x, p.z)) });
  return out;
}

// ---------------------------------------------------------------------------
// 远景层（场景文件 backdrop，§2.2 / §6.3；2026-10-20 第三版）：场地外的田、路、四个村子、东边低山。只看不走。

const R1 = (v) => Math.round(v * 10) / 10;
/** 椭圆（村里的地）。 */
function Ellipse(x, z, rx, rz, n = 20) {
  const poly = []; for (let k = 0; k < n; k++) { const a = k * 2 * Math.PI / n; poly.push(PPt(x + Math.cos(a) * rx, z + Math.sin(a) * rz)); }
  return poly;
}

/**
 * 一个村子的远景体块：一排排院子（正房 + 一侧厢房，墙 + 深色屋顶；村 A 加院墙），外面一圈树、院里零星几棵。
 * 村 A 的树用编辑器的枯树模型（kind "tree"），别的村用树冠块（kind "blob"）。有 streetX 的村子中间留一条南北街（大路从这里穿过去），树圈在街口断开。
 * → shapes 数组（id 前缀 Village<id>_）。
 */
export function VillageShapes(v) {
  const BD = L0105_BACKDROP, out = [];
  const pre = `Village${v.id}_`;
  const yardD = 16, laneM = 4, yardW = v.yardW || 19;
  const nRows = Math.max(1, Math.floor((2 * v.rz + laneM) / (yardD + laneM)));
  const z0 = v.z - (nRows * (yardD + laneM) - laneM) / 2;
  let n = 0;
  const near = v.treeKind === "tree";
  for (let r = 0; r < nRows; r++) {
    const zN = z0 + r * (yardD + laneM), zS = zN + yardD;
    // 椭圆里能放下的那一段
    const zc = (zN + zS) / 2, k = 1 - Math.pow((zc - v.z) / (v.rz + 4), 2);
    if (k <= 0.05) continue;
    const half = v.rx * Math.sqrt(k);
    let x = v.x - half + (r % 2 ? 4 : 0);
    for (let g = 0; x < v.x + half - 8; g++) {
      const w = yardW - 3 + 6 * Hash01(n, 71);
      const x0 = x, x1 = Math.min(x + w, v.x + half);
      x = x1 + 1.5;
      if (Number.isFinite(v.streetX) && x0 < v.streetX + 5 && x1 > v.streetX - 5) { x = v.streetX + 5; continue; }
      if (x1 - x0 < 10) continue;
      const id = `${pre}Y${String(n + 1).padStart(2, "0")}`;
      const wallH = R1(3.0 + 0.6 * Hash01(n, 73)), cx = (x0 + x1) / 2;
      // 正房：坐北，贴北墙
      out.push({ id: `${id}_House`, kind: "box", x: R1(cx), z: R1(zN + 3.5), w: R1(x1 - x0 - 2), d: 6, h: wallH, color: BD.wall });
      out.push({ id: `${id}_Roof`, kind: "box", x: R1(cx), z: R1(zN + 3.5), w: R1(x1 - x0 - 1.2), d: 6.8, h: 1.2, lift: wallH, color: BD.roof });
      // 厢房：东或西（按户号交替）；远处的村子隔一户才有
      if (near || n % 2 === 0) {
        const side = n % 2 ? 1 : -1, hx = side < 0 ? x0 + 3 : x1 - 3;
        out.push({ id: `${id}_Side`, kind: "box", x: R1(hx), z: R1(zN + 10.5), w: 4.8, d: 6, h: 3, color: BD.wall });
        out.push({ id: `${id}_SideRoof`, kind: "box", x: R1(hx), z: R1(zN + 10.5), w: 5.6, d: 6.8, h: 1.1, lift: 3, color: BD.roof });
      }
      if (near) {
        // 院墙（2 m）：北、东、西、南（南墙门口断开 3 m）
        const t = 0.5, gate = n % 2 ? x0 + 4 : x1 - 4;
        out.push({ id: `${id}_WallN`, kind: "box", x: R1(cx), z: R1(zN), w: R1(x1 - x0), d: t, h: 2, color: BD.wall });
        out.push({ id: `${id}_WallW`, kind: "box", x: R1(x0), z: R1(zc), w: t, d: yardD, h: 2, color: BD.wall });
        out.push({ id: `${id}_WallE`, kind: "box", x: R1(x1), z: R1(zc), w: t, d: yardD, h: 2, color: BD.wall });
        if (gate - 1.5 - x0 > 0.6) out.push({ id: `${id}_WallS1`, kind: "box", x: R1((x0 + gate - 1.5) / 2), z: R1(zS), w: R1(gate - 1.5 - x0), d: t, h: 2, color: BD.wall });
        if (x1 - gate - 1.5 > 0.6) out.push({ id: `${id}_WallS2`, kind: "box", x: R1((gate + 1.5 + x1) / 2), z: R1(zS), w: R1(x1 - gate - 1.5), d: t, h: 2, color: BD.wall });
      }
      // 院里的树（远处的村子隔一户一棵、村 A 隔两户一棵，院子南半边）：从外面看是村里冒出来的一团团树梢
      if (n % (near ? 3 : 2) === 1) Crown(`${id}_Tree`, x0 + (x1 - x0) * (0.3 + 0.4 * Hash01(n, 79)), zS - 4, n);
      n += 1;
    }
  }
  // 外面一圈树：椭圆（半轴 = 房子那一片 + ringM/2 + 4），每 spacing 米一棵，径向抖 ±ringM/2；街口断开
  const ax = v.rx + v.ringM / 2 + 4, az = v.rz + v.ringM / 2 + 4;
  const perim = 2 * Math.PI * Math.sqrt((ax * ax + az * az) / 2);
  const spacing = near ? 6.5 : 8.5;
  const count = Math.round(perim / spacing);
  for (let i = 0; i < count; i++) {
    const a = (i + 0.5 * Hash01(i, 83)) / count * 2 * Math.PI;
    const jr = (Hash01(i, 89) - 0.5) * v.ringM;
    const x = v.x + Math.cos(a) * (ax + jr), z = v.z + Math.sin(a) * (az + jr);
    if (Number.isFinite(v.streetX) && Math.abs(x - v.streetX) < 7) continue;
    // 树圈不是一道齐整的篱笆：一段段疏密不一（按角度的慢变化决定这一段稀不稀），远看是一团团
    if (!near && Hash01(i, 113) < 0.35 * (0.5 + 0.5 * Math.sin(a * 3 + v.x * 0.01))) continue;
    Crown(`${pre}Ring${String(i + 1).padStart(3, "0")}`, x, z, i + 500);
    // 外圈再错开半棵补一层（远看是厚厚一团）
    if (!near && Hash01(i, 97) < 0.6) Crown(`${pre}RingB${String(i + 1).padStart(3, "0")}`, v.x + Math.cos(a + 0.5 / count * 2 * Math.PI) * (ax + v.ringM * 0.6), v.z + Math.sin(a + 0.5 / count * 2 * Math.PI) * (az + v.ringM * 0.6), i + 900);
  }
  return out;
  function Crown(id, x, z, i) {
    if (near) { out.push({ id, kind: "tree", x: R1(x), z: R1(z), h: R1(11 + 5 * Hash01(i, 101)) }); return; }
    const color = BD.crowns[Math.floor(Hash01(i, 109) * BD.crowns.length) % BD.crowns.length];
    // 一成多是细高的杨树（树冠窄、19–24 m），其余是槐、榆一类的圆树冠（9–18 m，高矮差得开），树梢一高一低
    if (Hash01(i, 127) < 0.14) {
      const r = 2.2 + 1.2 * Hash01(i, 103);
      out.push({ id, kind: "blob", x: R1(x), z: R1(z), rx: R1(r), rz: R1(r), h: R1(17 + 5 * Hash01(i, 101)), lift: 2, color });
      return;
    }
    const h = 9 + 9 * Math.pow(Hash01(i, 101), 1.3), r = 4 + 4 * Hash01(i, 103);
    out.push({ id, kind: "blob", x: R1(x), z: R1(z), rx: R1(r), rz: R1(r * (0.8 + 0.4 * Hash01(i, 107))), h: R1(h - 1.5), lift: 1.5, color });
  }
}

/**
 * 远景层文档（§2.2 backdrop）。groundY：远处地面的高（取场地北边界的平均地面，坑北压平以后就是坎下那一片的高）。
 * paint 顺序：扫清带往东西接着延伸 → 田间小路底色 → 田块（rects，同 FarmLayout）→ 村里的地 → 大路 → 田间小路。
 */
export function L0105Backdrop(sample, farm = FarmLayout()) {
  const BD = L0105_BACKDROP, C = L0105_FIELD_PAINT, FR = FARM.region, B = L0105_BOUNDS;
  let sum = 0, n = 0;
  for (let x = B.minX; x <= B.maxX; x += 2) { sum += sample(x, B.minZ); n += 1; }
  const groundY = R2(sum / n);
  const palette = [], ci = new Map();
  const Ci = (color) => { if (!ci.has(color)) { ci.set(color, palette.length); palette.push(color); } return ci.get(color); };
  const rects = [];
  const ph = FARM.pathHalfW;
  for (const p of farm.parcels) {
    const row = farm.rows[p.row], cx = (p.x0 + p.x1) / 2;
    const z0 = FarmEdgeZ(row.south, cx) - ph, z1 = FarmEdgeZ(row.north, cx) + ph;   // z0 南（大）、z1 北（小）
    if (!(z0 - z1 > 0.5)) continue;
    rects.push([R1(p.x0), R1(z1), R1(p.x1), R1(z0), Ci(CropColor(p.crop))]);
  }
  const paint = [
    { id: "BdCleared", color: C.cleared, feather: 1.5, poly: [PPt(FR.minX, FARM.cleared.minZ), PPt(FR.maxX, FARM.cleared.minZ), PPt(FR.maxX, FARM.cleared.maxZ), PPt(FR.minX, FARM.cleared.maxZ)] },
    { id: "BdFarmPaths", color: C.fieldPath, feather: 1, poly: [PPt(FR.minX, FR.minZ), PPt(FR.maxX, FR.minZ), PPt(FR.maxX, FR.maxZ), PPt(FR.minX, FR.maxZ)] },
    { id: "BdFields", rects, palette },
  ];
  for (const v of L0105_BACKDROP_VILLAGES) {
    paint.push({ id: `BdVillage${v.id}Ground`, color: C.yard, feather: 4, poly: Ellipse(v.x, v.z, v.rx + 6, v.rz + 6) });
    paint.push({ id: `BdVillage${v.id}Threshing`, color: C.threshing, feather: 2, poly: [PPt(v.x - v.rx * 0.6, v.z + v.rz + 10), PPt(v.x - v.rx * 0.2, v.z + v.rz + 10), PPt(v.x - v.rx * 0.2, v.z + v.rz + 26), PPt(v.x - v.rx * 0.6, v.z + v.rz + 26)] });
  }
  paint.push({ id: "BdRoad", color: C.road, feather: 0.8, halfW: L0105_NORTH_ROAD_HALF_W, line: L0105_BACKDROP_ROAD.map((p) => PPt(p.x, p.z)) });
  L0105_BACKDROP_PATHS.forEach((line, i) => paint.push({ id: `BdPath${i + 1}`, color: C.path, feather: 0.8, halfW: L0105_FIELD_PATH_HALF_W, line: line.map((p) => PPt(p.x, p.z)) }));

  const shapes = [];
  for (const t of RoadPoplarSpots()) if (!t.inField) shapes.push({ id: `Bd${t.id}`, kind: "tree", x: R1(t.x), z: R1(t.z), h: R1(t.h) });
  for (const v of L0105_BACKDROP_VILLAGES) shapes.push(...VillageShapes(v));
  for (const h of L0105_BACKDROP_HILLS) shapes.push({ id: h.id, kind: "hill", x: h.x, z: h.z, rx: h.rx, rz: h.rz, h: h.h, ry: h.ry, color: BD.hill, topColor: BD.hillTop });
  return {
    far: BD.far,
    ground: { color: BD.ground, y: groundY, radiusM: BD.radiusM, blendM: BD.blendM },
    haze: { ...BD.haze },
    paint,
    shapes,
  };
}

/** 折线（米）上的弧长 → 点 + 走向；摆件、板桥用。 */
const LINES = Object.freeze({ front: L0105_TRENCHES.front, traffic: L0105_TRENCHES.traffic, branch: L0105_TRENCHES.branch });

/**
 * 日常摆件 → 体块。长边顺着沟（ry 按走向转），贴 lat 那一侧；能挡子弹的写 cover，朝向 = 防的方向：
 * 前沿沟防北（敌人在北），交通沟防来路（往北、朝前沿那头），支沟防洞口那头（东，02 追兵从那边来）。
 */
export function PropBlocks() {
  const out = [];
  for (const p of L0105_PROPS) {
    const k = L0105_PROP_KINDS[p.kind];
    const at = PointBeside(LINES[p.on], p.d, p.lat);
    const r = at.headingYawDeg * Math.PI / 180;
    const fx = -Math.sin(r), fz = -Math.cos(r);           // 行进方向
    const ry = Math.atan2(-fz, fx);                       // 本地 X（长边）对齐行进方向
    const extra = { ry: Math.round(ry * 1000) / 1000, prop: p.kind };
    if (k.cover) {
      const face = p.on === "front" ? { x: 0, z: -1 } : p.on === "traffic" ? { x: -fx, z: -fz } : { x: fx, z: fz };
      extra.cover = { faceX: R2(face.x), faceZ: R2(face.z) };
    }
    const b = Block(p.id, at.x, at.z, k.len, k.across, k.h, k.semantic, extra);
    out.push(b);
  }
  return out;
}

/**
 * 路口板桥：deck 一排门板（顺路方向一块 boardM 宽、横着 deckW 长）+ stringerOffsets 三根顺路的横木。
 * 桥面顶 = 两头桥台（沟沿外、路面上）的地面高；横木压在桥面下。TankDisabled 时中间两块门板压断（消失），
 * 换成两块往下塌了 0.4 m、歪着的断板。
 */
export function BridgeBlocks(sample) {
  const B = L0105_BRIDGE;
  const r = B.yawDeg * Math.PI / 180;
  const fx = -Math.sin(r), fz = -Math.cos(r);   // 顺路方向（往西南）
  const ry = Math.atan2(fx, fz);                // 本地 Z（d）对齐顺路方向
  const ax = fz, az = -fx;                      // 横着桥面（本地 X）
  const half = B.spanM / 2;
  const endY = (s) => sample(B.x + fx * s, B.z + fz * s);
  const deckTop = Math.max(endY(-half + 0.3), endY(half - 0.3));
  const deckY = deckTop - B.boardT / 2;
  const blocks = [], gates = [];
  const rows = Math.round(B.spanM / B.boardM);
  const broken = new Set([Math.floor(rows / 2) - 1, Math.floor(rows / 2)]);
  for (let i = 0; i < rows; i++) {
    const s = -half + B.boardM * (i + 0.5);
    const id = `BridgeDoorBoard_${String(i + 1).padStart(2, "0")}`;
    // 每块门板单独一个块，之间留 gapM 的缝（R2 只到厘米：d 取 boardM − gapM 正好）；
    // 旧门板厚薄、高低、长短、歪斜逐块不同（boardJitter）：底面 = 桥面顶 − boardT + lift（压在横木顶上或垫高一点，横木与净空不变）
    const [lift, T, dW, dRy] = B.boardJitter?.[i] || [0, B.boardT, 0, 0];
    const b = Block(id, B.x + fx * s, B.z + fz * s, B.deckW + dW, B.boardM - B.gapM, T, "timber", { ry: R2(ry + dRy), y: R2(deckTop - B.boardT + lift + T / 2) });
    if (broken.has(i)) gates.push({ ...b, signal: L0105_SIGNALS.tankDisabled });
    else blocks.push(b);
  }
  // 压断的两块：往下塌、一头翘（只能歪 ry，不能俯仰：用矮一截 + 下沉表示）
  [...broken].forEach((i, k) => {
    const s = -half + B.boardM * (i + 0.5);
    gates.push(Block(`BridgeBrokenBoard_${k + 1}`, B.x + fx * s + ax * (k ? 0.5 : -0.4), B.z + fz * s + az * (k ? 0.5 : -0.4),
      B.deckW * 0.6, B.boardM - 0.1, B.boardT, "timber", { ry: R2(ry + (k ? 0.22 : -0.18)), y: R2(deckY - 0.42 - k * 0.12), appearSignal: L0105_SIGNALS.tankDisabled }));
  });
  const stringerY = deckY - B.boardT / 2 - B.stringerH / 2;
  B.stringerOffsets.forEach((o, i) => {
    blocks.push(Block(`BridgeStringer_${i + 1}`, B.x + ax * o, B.z + az * o, B.stringerW, B.spanM + 1.0, B.stringerH, "timber", { ry: R2(ry), y: R2(stringerY) }));
  });
  const floorUnder = sample(B.x, B.z);
  return {
    blocks, gates,
    facts: { bridgeDeckTop: R2(deckTop), bridgeEnds: [R2(endY(-half + 0.3)), R2(endY(half - 0.3))], bridgeClear: R2(stringerY - B.stringerH / 2 - floorUnder), bridgeFloor: R2(floorUnder) },
  };
}

// ---------------------------------------------------------------------------
// 核对

/** 从 a 到 b（各给离地高）沿直线采样，返回最大遮挡量（地面高出视线多少米；≤0 表示看得见）。 */
export function SightBlock(sample, a, b, stepM = 0.5) {
  const ay = sample(a.x, a.z) + a.eye, by = sample(b.x, b.z) + b.eye;
  const len = Math.hypot(b.x - a.x, b.z - a.z);
  const n = Math.max(2, Math.ceil(len / stepM));
  let worst = -Infinity, at = null;
  for (let i = 1; i < n; i++) {
    const t = i / n;
    const x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
    const over = sample(x, z) - (ay + (by - ay) * t);
    if (over > worst) { worst = over; at = { x: R2(x), z: R2(z) }; }
  }
  return { block: R2(worst), at };
}

/**
 * 横断面量沟底宽：沿 (nx,nz) 方向 ±5 m，「开挖深度（自然地面 − 网格高度）」离本断面最深处 tol 以内的连续一段。
 * 用开挖深度而不是绝对高度：沟底顺着自然地面的坡走，斜着切过坡的断面按绝对高度量会把沟底量窄。
 */
export function FloorWidthAt(sample, x, z, nx, nz, tol = 0.05) {
  const r = FloorSpanAt(sample, x, z, nx, nz, tol);
  return { width: R2(r.plus + r.minus), depth: r.depth };
}

/** 同上，分两边给：plus = 沿 (nx,nz) 方向到沟底边的距离，minus = 反方向。 */
export function FloorSpanAt(sample, x, z, nx, nz, tol = 0.05) {
  const len = Math.hypot(nx, nz); nx /= len; nz /= len;
  const step = 0.02, span = 5;
  const Cut = (s) => NaturalHeight(x + nx * s, z + nz * s) - sample(x + nx * s, z + nz * s);
  let maxCut = -Infinity;
  for (let s = -span; s <= span; s += step) maxCut = Math.max(maxCut, Cut(s));
  const Edge = (dir) => {
    let s = 0;
    while (s < span && Cut(s * dir) >= maxCut - tol) s += step;
    return s;
  };
  return { plus: R2(Edge(1)), minus: R2(Edge(-1)), depth: R2(maxCut) };
}

/** 摆件旁边留下的通道（米）：在摆件所在断面量沟底两边，减去摆件占的那一截，取宽的那一边。 */
export function PropPassage(sample, prop) {
  const k = L0105_PROP_KINDS[prop.kind];
  const c = PointBeside(LINES[prop.on], prop.d, 0);
  const r = c.headingYawDeg * Math.PI / 180;
  const lx = -Math.cos(r), lz = Math.sin(r);            // 左手（lat 正方向）
  const span = FloorSpanAt(sample, c.x, c.z, lx, lz);
  const inner = prop.lat - k.across / 2, outer = prop.lat + k.across / 2;
  return R2(Math.max(span.plus - outer, inner + span.minus));
}

/** 每段 ≥ minM 的直沟上有几件摆件（只数段中间、离两头拐角 1 m 以外的）。 */
export function PropsPerStraight(minM = 15) {
  const rows = [];
  for (const [on, line] of Object.entries(LINES)) {
    let s = 0;
    for (let i = 1; i < line.length; i++) {
      const len = Math.hypot(line[i].x - line[i - 1].x, line[i].z - line[i - 1].z);
      if (len >= minM - 1e-6) {
        const n = L0105_PROPS.filter((p) => p.on === on && p.d > s + 1 && p.d < s + len - 1).length;
        rows.push({ on, from: line[i - 1], to: line[i], len: R2(len), count: n });
      }
      s += len;
    }
  }
  return rows;
}

/** 两条视线的取样点（测试与 notes 共用）。 */
export const L0105_SIGHTS = Object.freeze({
  // ① 集结处（干沟沟底、支沟，站姿眼高 1.6）→ 前沿的人头（1.5）：要被坡挡住
  assemblyFrom: Object.freeze([[29, 145.5], [35, 143.5], [43, 142], [50, 149], [56, 152], [58.5, 158], [64, 148], [71, 142.5], [77, 146.5]].map(([x, z]) => ({ x, z, eye: 1.6 }))),
  frontTargets: Object.freeze([[0, -7], [0, 0], [40, 0], [-40, 0]].map(([x, z]) => ({ x, z, eye: 1.5 }))),
  // ② 南边平地上（离台地南沿 ≥ 12 m，眼高 1.6）→ 干沟沟底站着的人头（1.6）：要看不见；凹路两边 8 m 内的点不算（顺着凹路能看进沟口）
  //    台地南沿随 x（凹路那段往南鼓 5 m），观察点跟着往南挪：南沿往南 12 / 22 / 37 m（南沿在 158 的地方就是原来的 170 / 180 / 195）
  southFrom: Object.freeze((() => {
    const out = [];
    for (const dz of [12, 22, 37]) for (let x = -10; x <= 90; x += 10) out.push({ x, z: R2(TerraceSouthRimZ(x) + dz), eye: 1.6 });
    return out;
  })()),
  // 沟底的人：沿中心线每 3 m，中线与两侧各离边 1 m（不在沟底的点不算）；再加支沟里几处
  gullyTargets: Object.freeze((() => {
    const out = [];
    const G = L0105_GULLY, len = LineLength(G.line);
    for (let d = 2; d <= len - 2; d += 3) {
      const hw = HalfWidthAt(G, d);
      for (const side of [-1, 0, 1]) {
        const p = PointBeside(G.line, d, side * Math.max(0, hw - 1));
        if (GullyU(p.x, p.z) <= 0) out.push({ x: R2(p.x), z: R2(p.z), eye: 1.6 });
      }
    }
    for (const d of [2, 5, 8, 10]) { const p = PointBeside(G.branch, d, 0); out.push({ x: R2(p.x), z: R2(p.z), eye: 1.6 }); }
    return out;
  })()),
});

/** 干沟中心线弧长 d 处的名义沟底半宽（逐点线性插值，不含起伏）。 */
function HalfWidthAt(G, d) {
  let walked = 0;
  for (let i = 1; i < G.line.length; i++) {
    const a = G.line[i - 1], b = G.line[i], len = Math.hypot(b.x - a.x, b.z - a.z);
    if (d <= walked + len || i === G.line.length - 1) return Lerp(G.halfW[i - 1], G.halfW[i], Clamp01((d - walked) / len));
    walked += len;
  }
  return G.halfW[G.halfW.length - 1];
}
/** 干沟中心线上离 p 最近的弧长。 */
function GullyStation(p) {
  const G = L0105_GULLY, len = LineLength(G.line);
  let best = 0, bd = Infinity;
  for (let d = 0; d <= len; d += 0.5) { const c = PointBeside(G.line, d, 0); const dd = Math.hypot(c.x - p.x, c.z - p.z); if (dd < bd) { bd = dd; best = d; } }
  return best;
}

/**
 * 干沟沟底的量法（弯沟没有「南北宽 / 东西长」）：沿中心线每 1 m 横着量沟底宽（高度离沟底 tol 以内的连续一段），
 * → { widths 每米的宽, min, max, floorLen 中心线上连续是沟底的长度, pocketA / mid / pocketB 三处的宽 }。
 */
export function GullyFloorExtent(sample, tol = 0.15) {
  const G = L0105_GULLY, floorY = H.assemblyFloor + tol, len = LineLength(G.line);
  const WidthAt = (d) => {
    const c = PointBeside(G.line, d, 0);
    if (sample(c.x, c.z) > floorY) return 0;
    const Run = (dir) => { let w = 0; for (let s = 0.1; s <= 9; s += 0.1) { const p = PointBeside(G.line, d, dir * s); if (sample(p.x, p.z) > floorY) break; w = s; } return w; };
    return R2(Run(1) + Run(-1));
  };
  const widths = [];
  for (let d = 0; d <= len; d += 1) widths.push(WidthAt(d));
  let floorLen = 0, cur = 0;
  for (const w of widths) { if (w > 0) { cur += 1; floorLen = Math.max(floorLen, cur); } else cur = 0; }
  const inner = widths.filter((w) => w > 0);
  const At = (p) => WidthAt(GullyStation(p));
  return { widths, min: Math.min(...inner), max: Math.max(...inner), floorLen, pocketA: At(L0105_GULLY_POCKETS.a), mid: At(L0105_GULLY_POCKETS.mid), pocketB: At(L0105_GULLY_POCKETS.b) };
}

/**
 * 几处坎高（坎顶 − 沟底，扣掉南岸土埂）：坑窝 A / 中弯 / 坑窝 B 的北岸，坑窝 A / 坑窝 B 对面的南岸。
 * 坎顶取沟底边往外 wallM + 0.5 m 处；steep = 坎顶往沟里 3 m 内的落差。→ [{ name, x, z, h, steep }]。
 */
export function GullyBankHeights(sample) {
  const G = L0105_GULLY;
  const rows = [["坑窝 A 北岸", L0105_GULLY_POCKETS.a, 1], ["中弯北岸", L0105_GULLY_POCKETS.mid, 1], ["坑窝 B 北岸", L0105_GULLY_POCKETS.b, 1],
    ["坑窝 A 南岸", L0105_GULLY_POCKETS.a, -1], ["坑窝 B 南岸", L0105_GULLY_POCKETS.b, -1]];
  return rows.map(([name, p, side]) => {
    const d = GullyStation(p);
    const c = PointBeside(G.line, d, 0);
    const floorY = sample(c.x, c.z);
    // 沿中心线往东走，左手 = 北（side +1）、右手 = 南（side −1）：先找沟底边，再往外 wallM + 0.5
    let edge = 0;
    for (let s = 0.1; s <= 10; s += 0.1) { const q = PointBeside(G.line, d, side * s); if (GullyU(q.x, q.z) > 0) { edge = s; break; } }
    const top = PointBeside(G.line, d, side * (edge + G.wallM + 0.5));
    const inner = PointBeside(G.line, d, side * (edge + G.wallM + 0.5 - 3));
    const topY = sample(top.x, top.z) - GullySouthBerm(top.x, top.z);
    return { name, x: R2(top.x), z: R2(top.z), h: R2(topY - floorY), steep: R2(sample(top.x, top.z) - sample(inner.x, inner.z)) };
  });
}

/**
 * 坑北前景的核对（notes 与 SceneTest 共用）。观察者 = 坑里北壁射击台上站着的人（坑底 + 踏台 0.7 + 眼高 1.62，世界高 pitEyeY），
 * 沿胸墙 x −3…3 与甲位五个点。sample = 烘好的网格。
 */
export const PIT_NORTH_DITCH_HEAD_M = 1.2;   // 干水沟里弯着腰走 / 蹲着的人，头顶离沟底
export const PIT_NORTH_MORTAR_HEAD_M = 1.25; // 掷弹筒组蹲着，头顶离地
export function PitNorthObservers(sample) {
  const pitEyeY = sample(PIT.x, PIT.z) + 0.7 + 1.62;
  return { pitEyeY: R2(pitEyeY), points: [[-3, -9.4], [-1.5, -9.4], [0, -9.4], [P.fireA.x, P.fireA.z], [1.5, -9.4], [3, -9.4]].map(([x, z]) => ({ x, z, eyeY: pitEyeY })) };
}
/** 世界高 aY 的眼睛 → 目标点离地 b.eye：最大遮挡（地面高出视线多少米；≤ 0 = 看得见）。 */
export function SightBlockFromY(sample, a, b, stepM = 0.5) {
  return SightBlock(sample, { x: a.x, z: a.z, eye: a.eyeY - sample(a.x, a.z) }, b, stepM);
}
export function PitNorthChecks(sample) {
  const R = PN.graveBaseR;
  const graves = [...PN.loneGraves.map((g, i) => ({ id: `孤坟${i + 1}`, ...g })), ...PN.graveyard].map((g) => {
    let ring = 0; for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; ring += sample(g.x + Math.cos(a) * (R + 1), g.z + Math.sin(a) * (R + 1)); }
    return { id: g.id, want: g.h, h: R2(sample(g.x, g.z) - ring / 12) };
  });
  // 田埂：每道每 10 m 量一次（埂顶 − 埂前后 2 m 的地面平均），避开干水沟和坟
  const bunds = [];
  for (const b of PN.bunds) for (let x = b.minX + 6; x <= b.maxX - 6; x += 10) {
    const z = BundZ(b, x);
    if (DitchStation(x, z).d < 4 || GraveHeight(x, z + 2) > 0 || GraveHeight(x, z - 2) > 0) continue;
    bunds.push({ id: b.id, x, h: R2(sample(x, z) - (sample(x, z - 2) + sample(x, z + 2)) / 2) });
  }
  // 干水沟：沿沟每 3 m（尽头渐浅段不算）量深 = 两沿外 2.6 m 的地面平均 − 沟底
  const ditchRows = [];
  const tops = [];
  for (let d = 2; d <= DITCH_LEN - PN.ditch.endTaperM - 1; d += 3) {
    const c = PointBeside(PN.ditch.line, d, 0), l = PointBeside(PN.ditch.line, d, 2.6), r = PointBeside(PN.ditch.line, d, -2.6);
    if (Math.abs(ScarpZ(c.x) - c.z) < PN.scarp.notchR + 8) continue;   // 豁口那一截是斜的
    if (DistanceToPolyline(c.x, c.z, L0105_NORTH_ROAD) < L0105_NORTH_ROAD_HALF_W + 6) continue;   // 大路从沟上过，那一截填平了
    const floor = sample(c.x, c.z);
    tops.push(R2((sample(l.x, l.z) + sample(r.x, r.z)) / 2 - floor));
    ditchRows.push({ x: c.x, z: c.z, eye: PIT_NORTH_DITCH_HEAD_M });
  }
  // 地坎：坎线南 6 m 与北 6 m 的地面差（离豁口 10 m 以外，每 10 m）
  const drops = [];
  for (let x = L0105_BOUNDS.minX + 5; x <= L0105_BOUNDS.maxX - 5; x += 10) {
    const z = ScarpZ(x);
    if (DitchStation(x, z).d < 10) continue;
    if (DistanceToPolyline(x, z, L0105_NORTH_ROAD) < 12 || DistanceToPolyline(x, z, L0105_FIELD_PATH) < 8) continue;   // 路穿过处是坡道
    drops.push(R2(sample(x, z + 6) - sample(x, z - 6) - (PitNorthRoll(x, z + 6) - PitNorthRoll(x, z - 6))));
  }
  // 豁口：顺着沟走，1 m 内最大高差
  let notchStep = 0;
  for (let d = 0; d < DITCH_LEN - 1; d += 0.25) {
    const a = PointBeside(PN.ditch.line, d, 0), b = PointBeside(PN.ditch.line, d + 1, 0);
    if (Math.abs(ScarpZ(a.x) - a.z) > 12) continue;
    notchStep = Math.max(notchStep, Math.abs(sample(a.x, a.z) - sample(b.x, b.z)));
  }
  const obs = PitNorthObservers(sample);
  const Run = (targets) => {
    let worst = Infinity, worstRow = null; const rows = [];
    for (const a of obs.points) for (const b of targets) { const r = SightBlockFromY(sample, a, b); rows.push({ a, b, ...r }); if (r.block < worst) { worst = r.block; worstRow = rows[rows.length - 1]; } }
    return { worst: R2(worst), worstRow, rows };
  };
  const m = P.mortar;
  const mortar = Run([[m.x - 1, m.z], [m.x + 1.2, m.z - 0.6], [m.x, m.z], [m.x + 0.8, m.z + 0.9]].map(([x, z]) => ({ x, z, eye: PIT_NORTH_MORTAR_HEAD_M })));
  // 烟：要「看得见」，取最容易被挡的那一对（block 最大）
  const smokeRows = Run([{ x: m.x, z: m.z + 2, eye: 3.0 }]);
  const smoke = { worst: R2(Math.max(...smokeRows.rows.map((r) => r.block))) };
  const ditch = Run(ditchRows);
  const fireA = { x: P.fireA.x, z: P.fireA.z, eyeY: obs.pitEyeY };
  const lmgW = SightBlockFromY(sample, fireA, { x: P.enemyLmgWest.x, z: P.enemyLmgWest.z, eye: 0.4 });
  const lmgE = SightBlockFromY(sample, fireA, { x: P.enemyLmgEast.x, z: P.enemyLmgEast.z, eye: 0.4 });
  const hs = PN.haystack;
  return {
    pitEyeY: obs.pitEyeY, graves, bunds, bundMin: Math.min(...bunds.map((b) => b.h)), bundMax: Math.max(...bunds.map((b) => b.h)),
    ditchDepthMin: Math.min(...tops), ditchDepthMax: Math.max(...tops), scarpMin: Math.min(...drops), scarpMax: Math.max(...drops), notchStep: R2(notchStep),
    haystackTop: R2(hs.h), mortar, smoke, ditch, lmgW, lmgE,
  };
}

/** 点到凹路中心线的水平距离。 */
export function DistanceToLane(x, z) { return DistanceToPolyline(x, z, L0105_SUNKEN_LANE.line); }

/** 迂回组爬行线（支沟南沿土垄外侧）上的取样点：沿支沟从支沟口量 d、往南偏 5.8 m。 */
export const L0105_OUTFLANK_CRAWL_LAT = -6.2;
export function OutflankCrawlPoint(d) { return PointBeside(L0105_TRENCHES.branch, d, L0105_OUTFLANK_CRAWL_LAT); }

/** 所有视线核对（notes 与测试共用）。返回 { assembly, south, mgToCrawl, pinnedToSteps }，各是 { worst, rows }。 */
export function L0105SightChecks(sample) {
  const Run = (pairs) => {
    let worst = Infinity, worstRow = null;
    const rows = [];
    for (const [a, b] of pairs) {
      const r = SightBlock(sample, a, b);
      rows.push({ a, b, ...r });
      if (r.block < worst) { worst = r.block; worstRow = rows[rows.length - 1]; }
    }
    return { worst: R2(worst), worstRow, rows };
  };
  const S1 = L0105_SIGHTS;
  const assembly = Run(S1.assemblyFrom.flatMap((a) => S1.frontTargets.map((b) => [a, b])));
  const southFrom = S1.southFrom.filter((p) => DistanceToLane(p.x, p.z) > 8);
  const south = Run(southFrom.flatMap((a) => S1.gullyTargets.map((b) => [a, b])));
  const mg = { x: P.enemyBranchGun.x, z: P.enemyBranchGun.z, eye: 0.35 };
  const mgToCrawl = Run([9, 12, 15, 18, 22, 26, 30, 34, 38].map((d) => { const p = OutflankCrawlPoint(d); return [mg, { x: p.x, z: p.z, eye: 0.4 }]; }));
  const pinned = { x: P.dugoutMouth.x + 0.3, z: P.dugoutMouth.z - 0.7, eye: 0.3 };
  const pinnedToSteps = Run([[pinned, { x: P.steps.x - 1.2, z: BranchZAt(P.steps.x - 1.2) - 1.0, eye: 1.2 }], [pinned, { x: P.steps.x - 1.2, z: BranchZAt(P.steps.x - 1.2) + 1.0, eye: 1.2 }]]);
  return { assembly, south, mgToCrawl, pinnedToSteps, southObservers: southFrom.length };
}

// ---------------------------------------------------------------------------
// 场景


// ---------------------------------------------------------------------------
// 地标（§2.2 landmarks，2026-10-20，格式与写法照 0610 的 L0610Landmarks）：白盒灰里看不清的关键地方，编辑器画亮色线框 + 光柱 + 标签。
// 坐标一律取锚点表（L0105_PLACES / L0105_PIT_NORTH / L0105_BRIDGE …）或已经生成的体块，不抄数字；有尺寸的给 w / d / h，片区给宽深或半径，地名只给点。

/** 全部地标。sample 给坑 / 洞这种要显式 y 的；blocks 取摆件的实际尺寸与朝向；bridgeDeckTop 是板桥桥面顶。 */
export function L0105Landmarks(sample, blocks, bridgeDeckTop) {
  const L = (id, name, kind, x, z, extra = {}) => ({ id, name, kind, x: R2(x), z: R2(z), ...extra });
  const Size = (w, d, h) => ({ w: R2(w), d: R2(d), h: R2(h) });
  const FromBlock = (id) => { const b = blocks.find((q) => q.id === id); if (!b) throw new Error(`地标找不到体块 ${id}`); return b; };
  const BlockBox = (b) => ({ ...Size(b.w, b.d, b.h), ...(b.ry ? { ry: R2(b.ry) } : {}) });
  const PitY = (c, depth) => R2(sample(c.x, c.z) + depth / 2);   // 坑 / 洞：线框从坑底立到地面
  const PN = L0105_PIT_NORTH;
  // 支沟：支沟口 → 洞口一条直线，本地 X 顺着沟（同 PropBlocks 的 ry 口径）
  const BR = L0105_TRENCHES.branch, b0 = BR[0], b1 = BR[BR.length - 1];
  const brLen = Math.hypot(b1.x - b0.x, b1.z - b0.z), brRy = Math.atan2(-(b1.z - b0.z) / brLen, (b1.x - b0.x) / brLen);
  // 板桥：本地 Z 顺路（同 BridgeBlocks 的 ry 口径）
  const BRG = L0105_BRIDGE, br = BRG.yawDeg * Math.PI / 180, bfx = -Math.sin(br), bfz = -Math.cos(br);
  const bridgeRy = Math.atan2(bfx, bfz);
  const par = P.parapet, crest = P.crestPosts;
  const crestX = (crest[0].x + crest[crest.length - 1].x) / 2, crestZ = crest.reduce((a, q) => a + q.z, 0) / crest.length;
  const yard = { x: PN.graveyard.reduce((a, g) => a + g.x, 0) / PN.graveyard.length, z: PN.graveyard.reduce((a, g) => a + g.z, 0) / PN.graveyard.length };
  const hs = PN.haystack, emerge = DitchEmerge(), ditchMid = PointAlong(PN.ditch.line, 200);
  const bundLabelX = -88;
  const crate = FromBlock("CrateStack_B1"), sbJ = FromBlock("SandbagStack_J1"), sbC = FromBlock("SandbagStack_C2");
  const front = L0105_TRENCHES.front;
  return [
    // 01–02：防炮洞、支沟、审问处、台阶、迂回、三处回身打的掩体
    L("LmDugout", P.dugout.name, "pit", P.dugout.x, P.dugout.z, { ...Size(P.dugout.w, P.dugout.d, P.dugout.floorDepth), y: PitY(P.dugout, P.dugout.floorDepth), note: "01 开场；洞口朝西对着支沟" }),
    L("LmDugoutMouth", P.dugoutMouth.name, "place", P.dugoutMouth.x, P.dugoutMouth.z, { radiusM: 1.4, note: "01 塌洞，顺子被压在这" }),
    L("LmBranch", "支沟", "area", (b0.x + b1.x) / 2, (b0.z + b1.z) / 2, { w: R2(brLen), d: L0105_TRENCH_SECTION.branch.floorW, ry: R2(brRy), note: "02 拖着冬瓜从洞口往西拖" }),
    L("LmBranchGun", P.enemyBranchGun.name, "place", P.enemyBranchGun.x, P.enemyBranchGun.z, { radiusM: 1.2, note: "01–02 架在北沿上顺沟压支沟口" }),
    L("LmInterrogation", P.interrogation.name, "place", P.interrogation.x, P.interrogation.z, { radiusM: 1.5, note: "02 冬瓜在这挨刺刀" }),
    L("LmSteps", P.branchMouth.name, "place", P.steps.x, P.steps.z, { radiusM: 1.5, note: "02 何有田几个在台阶上压机枪" }),
    L("LmOutflankExit", P.outflankExit.name, "place", P.outflankExit.x, P.outflankExit.z, { radiusM: 1.2, note: "02 班长一组从这爬出去绕南沿" }),
    L("LmCover1", "弹药箱垛", "prop", crate.x, crate.z, { ...BlockBox(crate), note: "02 拖被子第一次回身打" }),
    L("LmCover2", "土袋垛（台阶拐角）", "prop", sbJ.x, sbJ.z, { ...BlockBox(sbJ), note: "02 第二次回身打" }),
    L("LmCover3", "土袋垛（拐角 2）", "prop", sbC.x, sbC.z, { ...BlockBox(sbC), note: "02 第三次回身打" }),
    L("LmCorner2", P.corner2.name, "place", P.corner2.x, P.corner2.z, { radiusM: 1.5 }),
    // 05：板桥、坡顶；02 末 / 06：干沟
    L("LmBridge", BRG.name, "prop", BRG.x, BRG.z, { ...Size(BRG.deckW, BRG.spanM, 0.4), ry: R2(bridgeRy), y: R2(bridgeDeckTop - 0.2), note: "05 战车只能走桥，班长带顺子趴桥下" }),
    L("LmCrest", P.crest.name, "place", P.crest.x, P.crest.z, { radiusM: 2 }),
    L("LmCrestPosts", "坡沿（别的班守着）", "area", crestX, crestZ, { w: R2(crest[crest.length - 1].x - crest[0].x + 4), d: 3, note: "02 末接应，05 守坡沿" }),
    L("LmAssemblyEntry", P.assemblyEntry.name, "place", P.assemblyEntry.x, P.assemblyEntry.z, { radiusM: 1.5 }),
    L("LmGully", "干沟（集结处）", "area", P.assembly.x, P.assembly.z, { radiusM: 9, note: "02 末撤到这里" }),
    L("LmPocketA", "坑窝 A", "place", L0105_GULLY_POCKETS.a.x, L0105_GULLY_POCKETS.a.z, { radiusM: 2 }),
    L("LmPocketB", "坑窝 B", "place", L0105_GULLY_POCKETS.b.x, L0105_GULLY_POCKETS.b.z, { radiusM: 2 }),
    L("LmWoundedBay", P.woundedBay.name, "place", P.woundedBay.x, P.woundedBay.z, { radiusM: 1.5 }),
    L("LmLaneHead", "凹路口", "place", P.laneHead.x, P.laneHead.z, { radiusM: 2.5 }),
    // 03–04：沟口、机枪坑与三个射位、胸墙、西头北折、拐角 1、斜折
    L("LmMouth", P.mouth.name, "place", P.mouth.x, P.mouth.z, { radiusM: 1.5 }),
    L("LmPit", P.pit.name, "pit", P.pit.x, P.pit.z, { ...Size(P.pit.w, P.pit.d, P.pit.floorDepth), y: PitY(P.pit, P.pit.floorDepth), note: "03 守坑，一挺捷克式" }),
    L("LmFireA", P.fireA.name, "place", P.fireA.x, P.fireA.z, { radiusM: 0.8, note: "朝北压正面" }),
    L("LmFireB", P.fireB.name, "place", P.fireB.x, P.fireB.z, { radiusM: 0.8, note: "朝东挡沟里清过来的" }),
    L("LmFireC", P.fireC.name, "pit", P.fireC.x, P.fireC.z, { ...Size(P.fireC.radiusM * 2, P.fireC.radiusM * 2, P.fireC.depth), y: PitY(P.fireC, P.fireC.depth), note: "朝西北护侧翼" }),
    L("LmParapet", P.parapet.name, "prop", par.x, par.z, { ...Size(par.w, par.d, par.h), note: "03-4 战车一炮打塌中间一截" }),
    L("LmFrontWestFold", "前沿沟西头北折", "area", front[0].x, (front[0].z + front[1].z) / 2, { w: L0105_TRENCH_SECTION.front.floorW, d: R2(front[1].z - front[0].z), note: "西段守军顺沟撤到沟口" }),
    L("LmCorner1", P.corner1.name, "place", P.corner1.x, P.corner1.z, { radiusM: 1.5, note: "04 第一次回身顶" }),
    L("LmBend", P.bend.name, "place", P.bend.x, P.bend.z, { radiusM: 1.5, note: "04 第二次回身" }),
    // 03 坑北：孤坟、坟地、麦秸垛、干水沟、地坎、掷弹筒、五道田埂、战车露头
    ...PN.loneGraves.map((g, i) => L(`LmLoneGrave${i + 1}`, "孤坟", "prop", g.x, g.z, { ...Size(PN.graveBaseR * 2, PN.graveBaseR * 2, g.h), note: "扫清带里平不掉的坟" })),
    L("LmGraveyard", "坟地", "area", yard.x, yard.z, { radiusM: 8, note: "轻机枪（西）架在坟头后" }),
    L("LmHaystack", "麦秸垛", "prop", hs.x, hs.z, { ...Size(hs.w, hs.d, hs.h), note: "轻机枪（东）靠在它西南角" }),
    L("LmDitchMid", "干水沟（深 1.2 m）", "place", ditchMid.x, ditchMid.z, { radiusM: 2, note: "弯着腰走，坑里看不见头" }),
    L("LmDitchEnd", "干水沟尽头", "place", emerge.x, emerge.z, { radiusM: 3, note: "03 沟里那个班从这出沟" }),
    L("LmScarp", "地坎（北低 2 m）", "place", 16, ScarpZ(16), { radiusM: 4, note: "03 人从坎后那片低地翻上来" }),
    L("LmMortar", P.mortar.name, "place", P.mortar.x, P.mortar.z, { radiusM: 2, note: "坑里只看得见发射的烟" }),
    ...PN.bunds.map((b) => L(`LmBund${b.id}`, `田埂 ${b.id}（离坑约 ${Math.round(Math.abs(BundZ(b, bundLabelX) - P.pit.z) / 5) * 5} m）`, "place", bundLabelX, BundZ(b, bundLabelX), { radiusM: 1, note: "03 跃进扑在埂后" })),
    L("LmTankSeen", P.tankFirstSeen.name, "place", P.tankFirstSeen.x, P.tankFirstSeen.z, { radiusM: 4, note: "03-4 战车从这条路露头" }),
  ];
}

/** 生成场景文档。commit / generatedAt 由 CLI 传进来；notes 收抽样核对行（CLI 打到控制台）。 */
export async function BuildFirstLevel0105Scene({ commit = "", generatedAt = "", notes = [] } = {}) {
  const { Ground } = L0105Ground();
  const { terrain, minM, maxM, southMaxM, southMinM } = BakeL0105Grid(Ground);
  const sample = HeightGridSampler(terrain);

  const branchFloorAtSteps = Math.min(...[0, 0.5, 1.0].map((dx) => sample(STEP_TOP_X + 0.6 + dx, BranchZAt(STEP_TOP_X + 0.6 + dx))));
  const trafficFloorAtJunction = sample(P.branchMouth.x, P.branchMouth.z);
  const frontFloorAtMouth = sample(P.mouth.x, P.mouth.z - 0.8);
  const { blocks, gates, facts } = L0105Blocks(sample, {
    pitFloorY: sample(PIT.x, PIT.z), frontFloorAtMouth, branchFloorAtSteps, trafficFloorAtJunction, dugoutFloorY: sample(DUG.x, DUG.z),
  });

  const farm = FarmLayout();
  const paint = L0105Paint(farm);
  const backdrop = L0105Backdrop(sample, farm);
  const landmarks = L0105Landmarks(sample, [...blocks, ...gates], facts.bridgeDeckTop);
  {
    const errors = [];
    LandmarkIssues(landmarks, errors);
    if (errors.length) throw new Error(`地标表有错：${errors.join("；")}`);
  }

  // --- 抽样核对 ---
  const at = (p) => R2(sample(p.x, p.z));
  const nat = (p) => R2(NaturalHeight(p.x, p.z));
  notes.push(`网格 ${terrain.cols}×${terrain.rows}（${terrain.cellM} m），高度 ${minM}…${maxM} m；体块 ${blocks.length}（其中摆件 ${facts.props}）、随信号体块 ${gates.length}`);
  notes.push(`地面：沟口 ${at(P.mouth)}（自然 ${nat(P.mouth)}）· 坑底 ${at(PIT)}（坑边自然 ${nat(PIT)}，深 ${R2(nat(PIT) - at(PIT))}）· 散兵坑底 ${at(FIREC)} · `
    + `洞底 ${at(DUG)}（自然 ${nat(DUG)}，深 ${R2(nat(DUG) - at(DUG))}）`);
  notes.push(`沟底：拐角1 ${at(P.corner1)} · 南直段 ${at({ x: 12.5, z: 32 })} · 支沟口（交通沟） ${R2(trafficFloorAtJunction)} · 台阶脚（支沟） ${R2(branchFloorAtSteps)}（落差 ${R2(facts.stepRise)}，${STEP_COUNT} 级）`
    + ` · 拐角2 ${at(P.corner2)} · 板桥下 ${at(P.crossing)}（沟深 ${R2(nat(P.crossing) - at(P.crossing))}）· 坡顶沟底 ${at(P.crest)}（坡顶自然 ${nat(P.crest)}，沟深 ${R2(nat(P.crest) - at(P.crest))}）· 干沟口 ${at(P.assemblyEntry)}`);
  const crestTop = R2(sample(P.crest.x + 12, P.crest.z)), floor = R2(sample(P.assembly.x, P.assembly.z));
  const banks = GullyBankHeights(sample);
  const gw = GullyFloorExtent(sample);
  notes.push(`干沟：坡顶（沟东 12 m）${crestTop} · 沟底 ${floor} → 高差 ${R2(crestTop - floor)} m（锚点 ${R2(H.crest - H.assemblyFloor)}）；`
    + `坎高（扣掉土埂）${banks.map((b) => `${b.name} ${b.h}（3 m 内落 ${b.steep}）`).join(" · ")}；`
    + `沟底（离 −1.0 在 15 cm 内）宽 ${gw.min}…${gw.max} m（坑窝 A ${gw.pocketA}、中弯 ${gw.mid}、坑窝 B ${gw.pocketB}），中心线连续沟底 ${gw.floorLen} m；`
    + `支沟 ${at(P.woundedBay)}、凹路口 ${at(P.laneHead)}、凹路 (83,177) 底 ${R2(sample(83, 177))} / 旁边地面 ${R2(sample(91, 177))}`);
  {
    const tops = [];
    let low = 0;
    for (let along = SB.taperM; along <= SB_LEN - 10; along += 1) {
      tops.push(R2(GullySouthBermTop(along)));
      if (GullySouthBermTop(along) < 0.6) low += 1;
    }
    notes.push(`南岸土埂：两段共 ${R2(SB_LEN)} m（南岸一长段绕过支沟压在凹路南边 + 凹路北边一小段：${SB_LENS.map(R2).join(" + ")}，每段两头 ${SB.taperM} m 收尖），`
      + `顶高 ${Math.min(...tops)}…${Math.max(...tops)} m、底宽 ${SB.w} m、顶宽 ${SB.topW} m；低于 0.6 m 的地方 ${low} 处`);
  }
  {
    const pn = PitNorthChecks(sample);
    notes.push(`坑北前景：坑北 (0,−80) ${R2(sample(0, -80))}；坟高 ${pn.graves.map((g) => `${g.id} ${g.h}`).join(" / ")} m；田埂高 ${pn.bundMin}…${pn.bundMax} m；`
      + `干水沟深 ${pn.ditchDepthMin}…${pn.ditchDepthMax} m（沿沟每 3 m，尽头渐浅段不算）；地坎落差 ${pn.scarpMin}…${pn.scarpMax} m（离豁口 10 m 外）、豁口处 1 m 内最大高差 ${pn.notchStep} m；`
      + `麦秸垛顶 ${pn.haystackTop} m`);
    notes.push(`坑北视线（坑里射击台上站着，眼高 ${pn.pitEyeY} m）：掷弹筒组蹲着的头 ${pn.mortar.worst > 0 ? "全被地坎挡住" : "看得见！"}（最少挡 ${pn.mortar.worst} m），`
      + `发射烟（离地 3 m）${pn.smoke.worst <= 0 ? "看得见" : "被挡住！"}（最少露 ${R2(-pn.smoke.worst)} m）；干水沟里弯腰的人头（沟底 + ${PIT_NORTH_DITCH_HEAD_M}）${pn.ditch.worst > 0 ? "全看不见" : "有看得见的！"}（最少挡 ${pn.ditch.worst} m，${pn.ditch.rows.length} 对）；`
      + `两挺轻机枪趴着的头（0.4）挡 ${pn.lmgW.block} / ${pn.lmgE.block} m`);
  }
  {
    const count = (re) => blocks.filter((b) => re.test(b.id)).length;
    const fieldStrips = paint.filter((p) => /^Field_/.test(p.id));
    const kinds = {}; for (const f of fieldStrips) kinds[f.color] = (kinds[f.color] || 0) + 1;
    const widths = fieldStrips.map((f) => { const xs = f.poly.map((q) => q.x); return Math.max(...xs) - Math.min(...xs); });
    const bdShapes = {}; for (const sh of backdrop.shapes) bdShapes[sh.kind] = (bdShapes[sh.kind] || 0) + 1;
    const rects = backdrop.paint.find((p) => p.rects)?.rects || [];
    notes.push(`坑北第三版：涂色 ${paint.length} 项（场地里窄条田 ${fieldStrips.length} 条，宽 ${R2(Math.min(...widths))}…${R2(Math.max(...widths))} m，按颜色 ${Object.entries(kinds).map(([c, n]) => `${c}×${n}`).join(" ")}）；`
      + `散坟 ${L0105_FIELD_GRAVES.length} 座；路边杨树 ${count(/^RoadPoplar_/)}（场地里）、田边树 ${count(/^FieldTree_/)}、小路边树 ${count(/^PathTree_/)}；`
      + `地面：坑沿 (0,−11) ${R2(sample(0, -11))} · 坎上 (28,−190) ${R2(sample(28, -190))} · 坎下 (28,−213) ${R2(sample(28, -213))} · (30,−260) ${R2(sample(30, -260))} · (30,−340) ${R2(sample(30, -340))} · 北边界 (30,−480) ${R2(sample(30, -480))}；`
      + `色带 ${southMinM}…${southMaxM}（钉在南面；全场 ${minM}…${maxM}）`);
    notes.push(`远景层：地面高 ${backdrop.ground.y} m、铺出去 ${backdrop.ground.radiusM} m、远裁剪 ${backdrop.far} m；田块 ${rects.length} 块；体块 ${Object.entries(bdShapes).map(([k, n]) => `${k}×${n}`).join(" ")}；`
      + `村子 ${L0105_BACKDROP_VILLAGES.map((v) => `${v.id} (${v.x},${v.z}) 离坑 ${Math.round(Math.hypot(v.x - P.pit.x, v.z - P.pit.z))} m`).join("、")}`);
  }
  const widths = [
    ["前沿沟 x−30", -30.5, 0, 0, 1], ["前沿沟 x60", 56, 0, 0.5, 1], ["前沿沟西折", -62, -12, 1, 0],
    ["交通沟南直段", 12.5, 32, 23, 1], ["交通沟斜段", 26, 76.6, 42, -18], ["交通沟坡顶", 35, 128, 1, 0], ["交通沟板桥下", 35, 116.5, 1, 0], ["支沟中段", 42, 65.8, 2.6, 41.1],
  ].map(([name, x, z, nx, nz]) => { const r = FloorWidthAt(sample, x, z, nx, nz); return `${name} ${r.width}（深 ${r.depth}）`; });
  notes.push(`沟底宽（开挖深度离最深处 5 cm 内，网格插值后）：${widths.join(" · ")}；名义 floorW ${FloorWFor(S.traffic.floorW)}（最窄 ≥ ${S.traffic.floorW}），爬沟 ${S.crawlSap.floorW}`);
  notes.push(`板桥：桥面 ${L0105_BRIDGE.deckW}×${L0105_BRIDGE.spanM} m，桥面顶 ${facts.bridgeDeckTop}（两头地面 ${facts.bridgeEnds.join(" / ")}），桥下沟底 ${facts.bridgeFloor}，横木底净高 ${facts.bridgeClear} m`);
  const passages = L0105_PROPS.map((p) => ({ id: p.id, w: PropPassage(sample, p) })).sort((a, b) => a.w - b.w);
  const straights = PropsPerStraight(15);
  notes.push(`摆件 ${L0105_PROPS.length} 件（能挡子弹 ${L0105_PROPS.filter((p) => L0105_PROP_KINDS[p.kind].cover).length}）；最窄通道 ${passages.slice(0, 3).map((p) => `${p.id} ${p.w} m`).join("、")}；`
    + `≥15 m 直沟 ${straights.length} 段，每段摆件 ${straights.map((r) => r.count).join("/")}`);
  const sights = L0105SightChecks(sample);
  const W = (r) => `${r.worst} m（(${r.worstRow.a.x},${r.worstRow.a.z})→(${r.worstRow.b.x},${r.worstRow.b.z})）`;
  notes.push(`视线①（干沟沟底眼高 1.6 → 前沿人头 1.5，${sights.assembly.rows.length} 对）：${sights.assembly.worst > 0 ? "全部被坡挡住" : "有看得见的！"}，最少也挡 ${W(sights.assembly)}`);
  notes.push(`视线②（南边平地眼高 1.6 → 干沟沟底人头 1.6，${sights.southObservers} 个观察点 × ${L0105_SIGHTS.gullyTargets.length} 个人，凹路两边 8 m 不算）：${sights.south.worst > 0 ? "全部看不见" : "有看得见的！"}，最少也挡 ${W(sights.south)}`);
  notes.push(`北沿机枪（趴着眼高 0.35）→ 南沿土垄外爬行的人（0.4）：${sights.mgToCrawl.worst > 0 ? "全被土垄挡住" : "有看得见的！"}，最少挡 ${sights.mgToCrawl.worst} m；`
    + `洞口趴着（0.3）→ 台阶上开枪的人（1.2）：挡 ${sights.pinnedToSteps.worst > 0 ? sights.pinnedToSteps.worst : "≤0，看得见"}（体块未计）；洞里净高 ${facts.dugoutClear} m；塌洞横木离地 ${facts.beamGap} m（下沿）`);

  const scene = {
    schema: BLOCKOUT_SCENE_SCHEMA,
    level: L0105_LEVEL_KEY,
    source: {
      generator: L0105_SCENE_GENERATOR,
      generatedAt,
      commit,
      notes: `01–05 新剧本白盒：锚点 Data_EditorBlockoutFirstLevel0105Space；高度 ${L0105_CELL_M} m 网格（${minM}…${maxM} m）；`
        + "壕沟 = Script_TrenchPlan.CompileTrenchNetwork（前沿两段 + 交通 + 支沟 + 爬沟；交通沟板桥下加深、坡顶变浅、坡道下到干沟靠改基准面；支沟弃土只堆南沿成土垄）；"
        + "集结处 = 坡后干沟（沟底 −1.0、两岸 2.5 m 陡坎、南岸坎顶一道 0.6–0.8 m 矮土埂、南岸枯树、东南头接凹路）；坑 / 散兵坑 / 洞为平底开挖；沟里日常摆件；路口板桥（白盒先做，剧本这一拍待拍板）；"
        + "gates：DugoutCollapsed / PitShelled / TankDisabled（桥面两块门板压断）。",
    },
    bounds: { ...L0105_BOUNDS },
    spawn: { x: L0105_SPAWN.x, z: L0105_SPAWN.z, yawDeg: L0105_SPAWN.yawDeg },
    terrain,
    // 色带钉在南面（z ≥ −8）的最低 / 最高点：坑北压平后坎下比南面的沟底还低，色带不跟着挪，南面颜色跟原来一样；坑北有涂色盖着
    heightTint: { lo: southMinM, hi: southMaxM },
    // 白盒画质里树冠块（坟地柏树）保留暗绿（第三版村子挪进远景层，场地里没有屋顶块了）
    colorSemantics: ["foliage"],
    blocks,
    gates,
    paint,
    // 2026-10-20 第三版：远景层（场地外的田、路、四个村子、东边低山；只看不走），§2.2 backdrop
    backdrop,
    // 2026-10-20：地标（§2.2 landmarks，编辑器「地标」开关）：洞、支沟、三处回身打的掩体、板桥、坑与三个射位、坑北的坟 / 垛 / 沟 / 坎 / 田埂
    landmarks,
    ways: {
      roads: [Pts(L0105_ROAD), Pts(L0105_SUNKEN_LANE.line), Pts(L0105_NORTH_ROAD), Pts(L0105_FIELD_PATH)],
      trenches: [Pts(L0105_TRENCHES.front), Pts(L0105_TRENCHES.traffic), Pts(L0105_TRENCHES.branch), Pts(L0105_TRENCHES.crawlSap)],
    },
  };
  return scene;
}
