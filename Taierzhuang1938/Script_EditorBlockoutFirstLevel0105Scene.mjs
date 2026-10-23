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
//   6. 体块：沟里的日常摆件（L0105_PROPS）、路口板桥（横木 + 门板，显式 y）、干沟南岸的枯树，坑北的树桩 / 柏树 / 麦秸垛 / 田里零星的树，以及随信号体块。
//   7. 2026-10-20 第三版：坑北压平（tilt 去掉）、南北向窄条田（FarmLayout → paint）、散坟（烘进高度场）；
//      场地外的田、路、四个村子、东边低山写进远景层 backdrop（L0105Backdrop，契约 §2.2，只看不走）。
//
// 纪律：不读时钟、不读 git（commit / generatedAt 由 CLI 传入）；所有随机来自 TrenchPlan 的种子噪声，生成两次逐字相同。
// ===========================================================================

import { BLOCKOUT_SCENE_SCHEMA, LandmarkIssues } from "./Script_EditorBlockoutConfig.mjs";
import { CompileTrenchNetwork } from "./Script_TrenchPlan.mjs";
import { TRENCH_EARTH_PROFILE } from "./Data_TrenchAppearance.mjs";
import { HeightGridSampler, DecodeHeightGrid } from "./Script_EditorBlockoutLevels.mjs";
import {
  L0105_LEVEL_KEY, L0105_BOUNDS, L0105_CELL_M, L0105_HEIGHTS, L0105_TRENCH_SECTION, L0105_TRENCHES,
  L0105_ROAD, L0105_ROAD_WIDTH_M, L0105_PLACES, L0105_SIGNALS, L0105_SPAWN,
  L0105_GULLY, L0105_GULLY_TREES, L0105_GULLY_SOUTH_BERM, L0105_SUNKEN_LANE, L0105_BRIDGE, L0105_BRANCH_SOUTH_BERM,
  L0105_PROPS, L0105_PROP_KINDS, PointBeside, LineLength, GullyU, L0105_GULLY_POCKETS,
  L0105_PIT_NORTH, BundZ, ScarpZ, PointAlong, DitchEmerge,
  L0105_NORTH_ROAD, L0105_NORTH_ROAD_HALF_W, L0105_FIELD_PATH, L0105_FIELD_PATH_HALF_W, L0105_FIELD_PAINT,
  L0105_FIELD_TREES, L0105_BACKDROP_LONE_TREES, L0105_FIELD_GRAVES, L0105_FARM,
  L0105_BACKDROP, L0105_BACKDROP_ROAD, L0105_BACKDROP_PATHS, L0105_BACKDROP_VILLAGES, L0105_BACKDROP_HILLS,
  // 2026-10-24 第六版空间
  L0105_FRONT_PARTS, L0105_FRONT_BAYS, L0105_OLD_POSITION, L0105_NICHES, L0105_POST_ROAD_SOUTH, L0105_FIELD_LANES,
  L0105_SOUTH_GRAVES, L0105_WOODS, L0105_SOUTH_TREES, L0105_BACKDROP_POST_ROAD, L0105_TANKETTES, FrontStationAtX,
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
// 坟：两座孤坟 + 坟地五座 + 第三版田里散的单个坟（L0105_FIELD_GRAVES）+ 坑北的两片林（刘家林、赵家林）里的坟（2026-10-24）
const GRAVES = Object.freeze([...PN.loneGraves, ...PN.graveyard, ...L0105_FIELD_GRAVES, ...L0105_WOODS.filter((w) => w.z < PIT_NORTH_FROM_Z).flatMap((w) => w.graves)]);
// 南半场（z ≥ −8）的坟：张家林、李家林、田里零散的几座（烘进 Ground，不进 NaturalHeight）
const SOUTH_GRAVES = Object.freeze([...L0105_SOUTH_GRAVES, ...L0105_WOODS.filter((w) => w.z >= PIT_NORTH_FROM_Z).flatMap((w) => w.graves)]);

/** 点到干水沟中心线：→ { d 横向距离, along 弧长, side 在哪一边（+1 = 顺沟走的左手 = 西北岸，−1 = 东南岸） }（离沟很远时 d = Infinity）。 */
export function DitchStation(x, z) {
  if (x < DITCH_BOX.minX || x > DITCH_BOX.maxX || z < DITCH_BOX.minZ || z > DITCH_BOX.maxZ) return { d: Infinity, along: 0, side: 1 };
  let best = Infinity, at = 0, side = 1, walked = 0;
  for (let i = 1; i < DITCH.line.length; i++) {
    const a = DITCH.line[i - 1], b = DITCH.line[i];
    const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz);
    const t = Clamp01(((x - a.x) * dx + (z - a.z) * dz) / (len * len));
    const d = Math.hypot(x - a.x - dx * t, z - a.z - dz * t);
    if (d < best) { best = d; at = walked + len * t; side = (dx * (z - a.z) - dz * (x - a.x)) < 0 ? 1 : -1; }
    walked += len;
  }
  return { d: best, along: at, side };
}
/** 两岸不齐（2026-10-24）：这一岸在弧长 along 处的顶半宽倍数（1 ± bankWobble，两岸各用一条正弦，确定性）。 */
function DitchBankScale(along, side) {
  const w = DITCH.bankWobble || 0;
  return side > 0 ? 1 + w * Math.sin(along * 0.061 + 0.8) : 1 + w * Math.sin(along * 0.047 + 2.9);
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
/** 地坎（≤ 0，北边低 drop）：坎面宽 faceM，干水沟穿过处放宽成豁口，大路 / 小路穿过处放宽成坡道，旧交通沟穿过处一个窄豁口（2026-10-24）。 */
const SAP_NOTCH = L0105_OLD_POSITION.sapScarpNotch;
export function ScarpDelta(x, z, ditchD = DitchStation(x, z).d) {
  const s = PN.scarp;
  const u = ScarpZ(x) - z;   // 坎线以北为正
  let notch = s.notchM * (1 - Smooth(ditchD / s.notchR));
  if (Math.abs(u) < (s.faceM + SCARP_ROAD_NOTCH.roadM) / 2 + 0.5) {
    notch = Math.max(notch, SCARP_ROAD_NOTCH.roadM * (1 - Smooth(DistanceToPolyline(x, z, L0105_NORTH_ROAD) / SCARP_ROAD_NOTCH.roadR)),
      SCARP_ROAD_NOTCH.pathM * (1 - Smooth(DistanceToPolyline(x, z, L0105_FIELD_PATH) / SCARP_ROAD_NOTCH.pathR)),
      SAP_NOTCH.m * (1 - Smooth(Math.hypot(x - SAP_NOTCH.x, z - SAP_NOTCH.z) / SAP_NOTCH.r)));
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
  if (!(st.d < (DITCH.topW / 2) * (1 + (DITCH.bankWobble || 0)) + DITCH.lipW)) return { cap: Infinity, lip: 0 };
  // 大路北段从沟上过：路面下填平（涵洞土），离路边 3 m 渐回原深
  const fill = Smooth((DistanceToPolyline(x, z, L0105_NORTH_ROAD) - L0105_NORTH_ROAD_HALF_W - 1) / 3);
  if (fill <= 0) return { cap: Infinity, lip: 0 };
  const depth = DitchDepthAt(st.along) * fill;
  // 两岸不齐（2026-10-24）：沟底宽不变，这一岸的顶宽按弧长起伏
  const fh = DITCH.floorW / 2, th = (DITCH.topW / 2) * DitchBankScale(st.along, st.side);
  if (st.d >= th + DITCH.lipW) return { cap: Infinity, lip: 0 };
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

function RoadDeltaOf(x, z, line, half, lowerM = ROAD_LOWER_M, shoulderM = ROAD_SHOULDER_M) {
  const d = DistanceToPolyline(x, z, line);
  if (d > half + ROAD_SHOULDER_W + 0.5) return 0;
  const lower = -lowerM * (1 - Smooth((d - half + 0.3) / 0.6));
  const u = (d - half) / ROAD_SHOULDER_W;
  const shoulder = u > 0 && u < 1 ? shoulderM * Math.sin(u * Math.PI) : 0;
  return lower + shoulder;
}
/**
 * 路面：车道 L0105_ROAD 照旧；2026-10-24 老驿道南段（L0105_POST_ROAD_SOUTH，坑南那截涂不了色，靠这点凹凸认路）、
 * 南半场的田间小路（浅浅一道）。都只进 Ground，不进 NaturalHeight；都不在 0610 接缝范围（x −18…150、z 121…190）里。
 */
function RoadDelta(x, z) {
  let d = RoadDeltaOf(x, z, L0105_ROAD, L0105_ROAD_WIDTH_M / 2);
  if (x > 160 && z > -12) d += RoadDeltaOf(x, z, L0105_POST_ROAD_SOUTH, L0105_NORTH_ROAD_HALF_W);
  if (z > -12) for (const lane of L0105_FIELD_LANES) if (lane[0].z > -12) d += RoadDeltaOf(x, z, lane, L0105_FIELD_PATH_HALF_W, 0.08, 0.03);
  return d;
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

/** 前沿链上 x 处的点（折线自西向东 x 单调）。 */
function FrontPointAtX(x) { return PointAlong(L0105_TRENCHES.front, FrontStationAtX(x)); }

/**
 * 网络规格（2026-10-24 第六版）：前沿三段各烘一段（西头往北折的那一截弃土堆在西边，东西走向的段弃土堆在北边），段与段之间是浅连沟（窄、1 m 深、不堆弃土），
 * 每段几个往外凸的射击位（短短一截）；主交通沟 + 第二条交通沟 + 支沟 + 爬沟；北边旧阵地的三段射击沟、往南的旧交通沟、往北通警戒阵地的旧交通沟、两段警戒沟
 * （旧沟：弃土小、毛边大、塌了几截）。
 */
export function L0105TrenchSpec() {
  const front = Pts(L0105_TRENCHES.front);
  const FP = L0105_FRONT_PARTS;
  const Part = ([i0, i1]) => front.slice(i0, i1 + 1);
  const OLD = L0105_OLD_POSITION;
  const OldJitter = TRENCH_JITTER_SCALE * 2.2;   // 旧沟：毛边大、塌土多
  const segments = [
    // 法向 n = (−tz, tx)；minus 一侧：东西段（t=+X）是北，往北折那截（t=−Z）是西。都朝敌。
    { id: "FrontFlank", preset: "fire", points: [front[1], front[0]], depth: S.front.depth, floorW: FloorWFor(S.front.floorW),
      bermSide: "minus", jitterScale: TRENCH_JITTER_SCALE, source: "L0105_TRENCHES.front[0..1]（西头直角往北折，护左翼）" },
    { id: "FrontWest", preset: "fire", points: Part(FP.west), depth: S.front.depth, floorW: FloorWFor(S.front.floorW),
      bermSide: "minus", jitterScale: TRENCH_JITTER_SCALE, source: "L0105_FRONT_PARTS.west（西邻班那一段）" },
    { id: "FrontMid", preset: "fire", points: Part(FP.mid), depth: S.front.depth, floorW: FloorWFor(S.front.floorW),
      bermSide: "minus", jitterScale: TRENCH_JITTER_SCALE, source: "L0105_FRONT_PARTS.mid（本班这一段，沟口在中间）" },
    { id: "FrontEast", preset: "fire", points: Part(FP.east), depth: S.front.depth, floorW: FloorWFor(S.front.floorW),
      bermSide: "minus", jitterScale: TRENCH_JITTER_SCALE, source: "L0105_FRONT_PARTS.east（东邻班那一段，01 前已丢）" },
    { id: "FrontLinkW", preset: "sap", points: Part(FP.linkW), depth: S.frontLink.depth, floorW: S.frontLink.floorW, bankW: 0.8, bermH: 0.1, bermW: 0.9,
      cornerRadiusM: 0, jitterScale: TRENCH_JITTER_SCALE, source: "L0105_FRONT_PARTS.linkW（西段 ↔ 本班的浅连沟）" },
    { id: "FrontLinkE", preset: "sap", points: Part(FP.linkE), depth: S.frontLink.depth, floorW: S.frontLink.floorW, bankW: 0.8, bermH: 0.1, bermW: 0.9,
      cornerRadiusM: 0, jitterScale: TRENCH_JITTER_SCALE, source: "L0105_FRONT_PARTS.linkE（本班 ↔ 东段的浅连沟，03 清沟的从这过来）" },
    ...L0105_FRONT_BAYS.map((b) => {
      const p = FrontPointAtX(b.x);
      return { id: b.id, preset: "sap", points: [{ x: R2(p.x), z: R2(p.z) }, { x: R2(p.x), z: R2(p.z - b.lenM) }], depth: S.frontBay.depth, floorW: S.frontBay.floorW,
        bankW: 0.7, bermH: 0.3, bermW: 1.0, cornerRadiusM: 0, jitterScale: TRENCH_JITTER_SCALE, source: `L0105_FRONT_BAYS ${b.id}（往外凸的射击位）` };
    }),
    { id: "Traffic", preset: "communication", points: Pts(L0105_TRENCHES.traffic), depth: S.traffic.depth,
      floorW: FloorWFor(S.traffic.floorW), jitterScale: TRENCH_JITTER_SCALE, source: "L0105_TRENCHES.traffic" },
    { id: "Traffic2", preset: "communication", points: Pts(L0105_TRENCHES.traffic2), depth: S.traffic2.depth,
      floorW: FloorWFor(S.traffic2.floorW), jitterScale: TRENCH_JITTER_SCALE, source: "L0105_TRENCHES.traffic2（第二条交通沟，西邻班的退路）" },
    // 北边放弃的旧阵地（沿地坎南沿）：三段射击沟（弃土堆北边，小）、往南的旧交通沟、往北通警戒阵地的旧交通沟、两段警戒沟
    ...OLD.fire.map((f) => ({ id: f.id, preset: "fire", points: Pts(f.line), depth: S.oldFire.depth, floorW: S.oldFire.floorW, bermH: 0.18, bermW: 1.4,
      bermSide: "minus", jitterScale: OldJitter, source: `L0105_OLD_POSITION.fire ${f.id}（原来固守的射击沟，放弃了）` })),
    { id: "OldComm", preset: "sap", points: Pts(OLD.comm), depth: S.oldComm.depth, floorW: S.oldComm.floorW, bankW: 0.9, bermH: 0.08, bermW: 0.8, cornerRadiusM: 0.4,
      jitterScale: OldJitter, source: "L0105_OLD_POSITION.comm（撤下来走的旧交通沟，浅）" },
    { id: "OldSap", preset: "sap", points: Pts(OLD.sap), depth: S.oldComm.depth, floorW: S.oldComm.floorW, bankW: 0.9, bermH: 0.08, bermW: 0.8, cornerRadiusM: 0.4,
      jitterScale: OldJitter, source: "L0105_OLD_POSITION.sap（通警戒阵地的旧交通沟，穿地坎；03 掷弹筒组蹲在坎下那一截）" },
    ...OLD.outposts.map((f) => ({ id: f.id, preset: "fire", points: Pts(f.line), depth: S.oldOutpost.depth, floorW: S.oldOutpost.floorW, bermH: 0.12, bermW: 1.2,
      bermSide: "minus", jitterScale: OldJitter, source: `L0105_OLD_POSITION.outposts ${f.id}（警戒阵地的短沟，早撤了）` })),
  ];
  return {
    version: 1,
    seed: "tengxian1938:L0105:trench",
    earthProfile: TRENCH_EARTH_PROFILE,
    segments: [
      ...segments,
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
// 5c. 2026-10-24 第六版：龛、排长掩蔽部、预备队浅坑、旧阵地的坑与塌方、南半场的坟包（都只进 Ground，不进 NaturalHeight）

/** 旋转的方盒开挖：中心 (cx,cz)，本地 u 轴朝 (ux,uz)（单位向量），半长 hu、半宽 hv；盒里是 floorY，外面 wallM 内陡起。 */
function CarveLocalBox(h, x, z, cx, cz, ux, uz, hu, hv, floorY, wallM) {
  const dx = x - cx, dz = z - cz;
  const lu = dx * ux + dz * uz, lv = -dx * uz + dz * ux;
  const qu = Math.abs(lu) - hu, qv = Math.abs(lv) - hv;
  const sdf = Math.hypot(Math.max(qu, 0), Math.max(qv, 0)) + Math.min(Math.max(qu, qv), 0);
  if (sdf >= wallM) return h;
  const k = sdf <= 0 ? 1 : 1 - Smooth(sdf / wallM);
  return Math.min(h, Lerp(h, floorY, k));
}

const NICHE_LINES = Object.freeze({ front: L0105_TRENCHES.front, traffic: L0105_TRENCHES.traffic, traffic2: L0105_TRENCHES.traffic2 });
const NICHE_DEPTH = Object.freeze({ front: S.front.depth, traffic: S.traffic.depth, traffic2: S.traffic2.depth });
const NICHE_FLOOR_HALF = Object.freeze({ front: FloorWFor(S.front.floorW) / 2, traffic: FloorWFor(S.traffic.floorW) / 2, traffic2: FloorWFor(S.traffic2.floorW) / 2 });
/** 龛的几何（摆块、开挖、地标共用）：→ { id, kind, x, z（龛心）, ux, uz（顺沟）, hu, hv, floorY, mouth {x,z}（沟底边上的开口中心） }。 */
export const L0105_NICHE_SHAPES = Object.freeze(L0105_NICHES.map((n) => {
  const line = NICHE_LINES[n.on];
  const c = PointBeside(line, n.d, 0);
  const r = c.headingYawDeg * Math.PI / 180;
  const fx = -Math.sin(r), fz = -Math.cos(r), lx = -Math.cos(r), lz = Math.sin(r);   // 前方、左手
  const edge = NICHE_FLOOR_HALF[n.on];
  const off = n.side * (edge + n.acrossM / 2);
  const x = c.x + lx * off, z = c.z + lz * off;
  const mouth = { x: R2(c.x + lx * n.side * edge), z: R2(c.z + lz * n.side * edge) };
  return Object.freeze({ id: n.id, kind: n.kind, on: n.on, x: R2(x), z: R2(z), ux: fx, uz: fz, side: n.side, lx: lx * n.side, lz: lz * n.side,
    hu: n.lenM / 2, hv: n.acrossM / 2 + 0.2, floorY: R2(NaturalHeight(c.x, c.z) - NICHE_DEPTH[n.on]), mouth });
}));
const NICHE_BOX = (() => {
  const xs = L0105_NICHE_SHAPES.map((n) => n.x), zs = L0105_NICHE_SHAPES.map((n) => n.z);
  return { minX: Math.min(...xs) - 4, maxX: Math.max(...xs) + 4, minZ: Math.min(...zs) - 4, maxZ: Math.max(...zs) + 4 };
})();
function CarveNiches(h, x, z) {
  if (x < NICHE_BOX.minX || x > NICHE_BOX.maxX || z < NICHE_BOX.minZ || z > NICHE_BOX.maxZ) return h;
  for (const n of L0105_NICHE_SHAPES) {
    if (Math.abs(x - n.x) > 3 || Math.abs(z - n.z) > 3) continue;
    h = CarveLocalBox(h, x, z, n.x, n.z, n.ux, n.uz, n.hu, n.hv, n.floorY, 0.45);
  }
  return h;
}

const PSH = P.platoonShelter;
const PSH_BOX = Object.freeze({ minX: PSH.x - PSH.w / 2, maxX: PSH.x + PSH.w / 2, minZ: PSH.z - PSH.d / 2, maxZ: PSH.z + PSH.d / 2 });
const OLD = L0105_OLD_POSITION;
const RESERVE = P.reserve;
/** 南半场（z ≥ −8）的坟包：张家林、李家林、田里零散的单坟。圆顶，底半径同坟地。 */
function SouthMound(x, z) {
  if (z < PIT_NORTH_FROM_Z) return 0;
  let best = 0;
  const R = PN.graveBaseR;
  for (const g of SOUTH_GRAVES) {
    const r = Math.hypot(x - g.x, z - g.z);
    if (r >= R) continue;
    best = Math.max(best, g.h * Math.pow(1 - (r / R) * (r / R), 1.2));
  }
  return best;
}
/** 旧交通沟塌了的几截：沟底在塌点前后 2 m 回填到自然地面下 0.3 m（土堆块另摆）。 */
function OldCollapses(h, x, z, natural) {
  if (z > -80) return h;
  for (const [line, alongs] of [[OLD.comm, OLD.commCollapsed], [OLD.sap, OLD.sapCollapsed]]) {
    for (const c of alongs) {
      const p = PointAlong(line, c);
      const d = Math.hypot(x - p.x, z - p.z);
      if (d > 2.6) continue;
      const k = 1 - Smooth((d - 1.4) / 1.2);
      h = Math.max(h, Lerp(h, natural - 0.3, k));
    }
  }
  return h;
}
/** 第六版的坑：旧阵地的空机枪掩体、掩蔽部、警戒散兵坑、掷弹筒组蹲的圆坑；排长掩蔽部；坡后预备队的浅坑。 */
function SixthRoundCarves(h, x, z, natural) {
  if (z < -150) {
    for (const n of OLD.mgNests) h = CarveBox(h, x, z, { minX: n.x - OLD.mgNest.w / 2, maxX: n.x + OLD.mgNest.w / 2, minZ: n.z - OLD.mgNest.d / 2, maxZ: n.z + OLD.mgNest.d / 2 }, NaturalHeight(n.x, n.z) - OLD.mgNest.depth, 0.4);
    const sh = OLD.shelter;
    h = CarveBox(h, x, z, { minX: sh.x - sh.w / 2, maxX: sh.x + sh.w / 2, minZ: sh.z - sh.d / 2, maxZ: sh.z + sh.d / 2 }, NaturalHeight(sh.x, sh.z) - sh.floorDepth, 0.35);
    for (const f of OLD.foxholes) h = CarveDisc(h, x, z, f.x, f.z, OLD.foxholeR, NaturalHeight(f.x, f.z) - OLD.foxholeDepth, 0.4);
    h = CarveDisc(h, x, z, P.mortar.x, P.mortar.z, OLD.mortarBay.r, NaturalHeight(P.mortar.x, P.mortar.z) - OLD.mortarBay.depth, 0.5);
    return OldCollapses(h, x, z, natural);
  }
  if (z > 15 && z < 40) h = CarveBox(h, x, z, PSH_BOX, NaturalHeight(PSH.x, PSH.z) - PSH.floorDepth, 0.4);
  if (z > 130 && z < 158 && x < -20) for (const q of RESERVE.pits) h = CarveDisc(h, x, z, q.x, q.z, RESERVE.pitR, NaturalHeight(q.x, q.z) - RESERVE.pitDepth, 0.5);
  return h;
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
    let h = natural + RoadDelta(x, z) + SouthMound(x, z);
    h = plan.Apply(x, z, h, natural + TrafficBaseLift(x, z));
    // 2026-10-24：沟壁上的龛（弹药 / 手榴弹 / 让担架）、排长掩蔽部、预备队浅坑、旧阵地的坑与塌方
    h = CarveNiches(h, x, z);
    h = SixthRoundCarves(h, x, z, natural);
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

// ---------------------------------------------------------------------------
// 5b. 圈住玩家（2026-10-21 用户：防止玩家跳出壕沟）：沟沿上方一圈只挡玩家的隐形墙
//   「沟里」= 开挖比没挖之前的地面低 KEEP_IN.depthM 以上、而且和机枪坑连得上的那一片（壕沟、坑、爬沟、散兵坑、防炮洞、
//   交通沟坡道、干沟、凹路）。在它的边上立墙：tag "airWall"（Script_Physics 只挡角色控制器；子弹、手榴弹、视线、布娃娃都穿过去），
//   预演 / 关键帧里的人不是物理角色，不受影响。墙线在边上那条格线（离沟底一侧的格点 0.25 m），按 0.2 m 容差拉直成一段段斜墙。

export const KEEP_IN = Object.freeze({
  depthM: 0.6,        // 比没挖之前低这么多才算沟里（爬沟 1.0、坡顶段 1.5 都在里头）
  fromZ: -30,         // 只在坑北这条线以南圈（壕沟网最北到散兵坑 −16.6；坑北的干水沟、弹坑不圈）
  thickM: 0.2,        // 墙厚
  simplifyM: 0.3,     // 拉直容差
  belowM: 0.6,        // 墙脚：比沟里一侧最低的地面再低
  aboveM: 3.0,        // 墙顶：比两侧最高的地面再高（站在摆件上也跳不过去）
  seed: Object.freeze({ x: 0, z: -7 }),   // 机枪坑
});

/** 没挖干沟、凹路之前的地面（台地 / 坡顶 / 田）：圈「沟里」用。同 NaturalHeight 去掉干沟和凹路两刀。 */
export function UncutHeight(x, z) {
  let h = H.front;
  h += H.fieldNorthDip * Smooth((FIELD_DIP_FROM_Z - z) / FIELD_DIP_RAMP_M);
  h += SouthProfile(x, z);
  h += Undulation(x, z);
  h += GullySouthBerm(x, z);
  if (z < PIT_NORTH_FROM_Z) h = PitNorthHeight(x, z, h);
  return h;
}

/** 格点上的「沟里」掩码（Uint8：1 = 沟里、和机枪坑连得上；小的封闭洞填上）。terrain = 烘好的网格。 */
export function KeepInMask(terrain, heights = DecodeHeightGrid(terrain)) {
  const { minX, minZ, cellM, cols, rows } = terrain;
  const W = cols + 1;
  const iz0 = Math.max(0, Math.ceil((KEEP_IN.fromZ - minZ) / cellM));
  const deep = new Uint8Array((cols + 1) * (rows + 1));
  for (let iz = iz0; iz <= rows; iz++) {
    const z = minZ + iz * cellM;
    for (let ix = 0; ix <= cols; ix++) {
      const x = minX + ix * cellM, i = iz * W + ix;
      if (UncutHeight(x, z) + RoadDelta(x, z) - heights[i] >= KEEP_IN.depthM) deep[i] = 1;
    }
  }
  // 和机枪坑连得上的那一片（四邻接）
  const mask = new Uint8Array(deep.length);
  const seed = Math.round((KEEP_IN.seed.z - minZ) / cellM) * W + Math.round((KEEP_IN.seed.x - minX) / cellM);
  if (!deep[seed]) throw new Error("KeepInMask：机枪坑那一点不算沟里");
  const stack = [seed];
  mask[seed] = 1;
  while (stack.length) {
    const i = stack.pop(), ix = i % W, iz = (i - ix) / W;
    for (const [jx, jz] of [[ix + 1, iz], [ix - 1, iz], [ix, iz + 1], [ix, iz - 1]]) {
      if (jx < 0 || jx > cols || jz < iz0 || jz > rows) continue;
      const j = jz * W + jx;
      if (deep[j] && !mask[j]) { mask[j] = 1; stack.push(j); }
    }
  }
  // 封闭在沟里的小块（从网格边上走不到的「沟外」）填成沟里，免得沟底中间立墙
  const outside = new Uint8Array(deep.length);
  const q = [];
  for (let iz = iz0; iz <= rows; iz++) for (let ix = 0; ix <= cols; ix++) {
    if (ix !== 0 && ix !== cols && iz !== iz0 && iz !== rows) continue;
    const i = iz * W + ix;
    if (!mask[i] && !outside[i]) { outside[i] = 1; q.push(i); }
  }
  while (q.length) {
    const i = q.pop(), ix = i % W, iz = (i - ix) / W;
    for (const [jx, jz] of [[ix + 1, iz], [ix - 1, iz], [ix, iz + 1], [ix, iz - 1]]) {
      if (jx < 0 || jx > cols || jz < iz0 || jz > rows) continue;
      const j = jz * W + jx;
      if (!mask[j] && !outside[j]) { outside[j] = 1; q.push(j); }
    }
  }
  let filled = 0;
  for (let iz = iz0; iz <= rows; iz++) for (let ix = 0; ix <= cols; ix++) {
    const i = iz * W + ix;
    if (!mask[i] && !outside[i]) { mask[i] = 1; filled += 1; }
  }
  return { mask, iz0, filled, W };
}

/** 道格拉斯—普克（闭合环先在最远两点处拆开）。pts = [{x,z}]。 */
function SimplifyLoop(pts, tol) {
  const DP = (a) => {
    if (a.length <= 2) return a;
    const p = a[0], q = a[a.length - 1], dx = q.x - p.x, dz = q.z - p.z, L = Math.hypot(dx, dz) || 1e-9;
    let worst = -1, at = 0;
    for (let k = 1; k < a.length - 1; k++) {
      const d = Math.abs((a[k].x - p.x) * dz - (a[k].z - p.z) * dx) / L;
      if (d > worst) { worst = d; at = k; }
    }
    if (worst <= tol) return [p, q];
    return [...DP(a.slice(0, at + 1)).slice(0, -1), ...DP(a.slice(at))];
  };
  let far = 0, best = -1;
  for (let k = 1; k < pts.length; k++) { const d = Math.hypot(pts[k].x - pts[0].x, pts[k].z - pts[0].z); if (d > best) { best = d; far = k; } }
  const a = DP(pts.slice(0, far + 1)), b = DP([...pts.slice(far), pts[0]]);
  return [...a.slice(0, -1), ...b.slice(0, -1)];
}

/**
 * 沟沿隐形墙（体块，tag "airWall"、visual false、semantic "airWall"）：掩码的边（沟里格点 | 沟外格点之间那条格线）
 * 顺着「沟里在左手」串成环、拉直，每段一块斜墙（两头各多伸出半个墙厚，拐角不漏缝）。
 * 墙脚 = 沟里一侧 0.4 m 处地面的最低 − belowM，墙顶 = 两侧最高 + aboveM。sample = 烘好的网格采样。
 */
export function L0105KeepInWalls(terrain, sample) {
  const heights = DecodeHeightGrid(terrain);
  const { mask, iz0, filled, W } = KeepInMask(terrain, heights);
  const { minX, minZ, cellM, cols, rows } = terrain;
  const In = (ix, iz) => ix >= 0 && ix <= cols && iz >= iz0 && iz <= rows && mask[iz * W + ix] === 1;
  // 有向边（角点用两倍格坐标，免得出现半格小数）：沟里在左手
  const out = new Map();   // 起点角 → [终点角]
  const Add = (ax, az, bx, bz) => { const k = `${ax},${az}`; if (!out.has(k)) out.set(k, []); out.get(k).push(`${bx},${bz}`); };
  for (let iz = iz0; iz <= rows; iz++) for (let ix = 0; ix <= cols; ix++) {
    if (!In(ix, iz)) continue;
    const X = 2 * ix, Z = 2 * iz;
    if (!In(ix + 1, iz)) Add(X + 1, Z - 1, X + 1, Z + 1);
    if (!In(ix - 1, iz)) Add(X - 1, Z + 1, X - 1, Z - 1);
    if (!In(ix, iz + 1)) Add(X + 1, Z + 1, X - 1, Z + 1);
    if (!In(ix, iz - 1)) Add(X - 1, Z - 1, X + 1, Z - 1);
  }
  const P2 = (k) => { const [a, b] = k.split(",").map(Number); return { x: minX + a * cellM / 2, z: minZ + b * cellM / 2 }; };
  const loops = [];
  for (const start of [...out.keys()]) {
    while (out.get(start)?.length) {
      const loop = [start];
      let cur = start, prev = null;
      for (let guard = 0; guard < 200000; guard++) {
        const list = out.get(cur);
        if (!list?.length) break;
        // 鞍点（两条出边）：先拐左（沟里两块在角上碰头时各自成环）
        let pick = 0;
        if (list.length > 1 && prev) {
          const [px, pz] = prev.split(",").map(Number), [cx, cz] = cur.split(",").map(Number);
          const dx = cx - px, dz = cz - pz;
          pick = list.findIndex((n) => { const [nx, nz] = n.split(",").map(Number); return dx * (nz - cz) - dz * (nx - cx) > 0; });
          if (pick < 0) pick = 0;
        }
        const next = list.splice(pick, 1)[0];
        prev = cur; cur = next;
        if (cur === start) break;
        loop.push(cur);
      }
      if (loop.length >= 4) loops.push(loop.map(P2));
    }
  }
  const walls = [];
  const t = KEEP_IN.thickM;
  let n = 0;
  for (const loop of loops) {
    const pts = SimplifyLoop(loop, KEEP_IN.simplifyM);
    for (let k = 0; k < pts.length; k++) {
      const a = pts[k], b = pts[(k + 1) % pts.length];
      const dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz);
      if (L < 1e-3) continue;
      const fx = dx / L, fz = dz / L, lx = -fz, lz = fx;   // lx/lz：左手（沟里）
      let low = Infinity, high = -Infinity;
      for (let s = 0; s <= L + 1e-6; s += Math.min(0.5, L)) {
        const x = a.x + fx * s, z = a.z + fz * s;
        const gin = sample(x + lx * 0.4, z + lz * 0.4), gout = sample(x - lx * 0.4, z - lz * 0.4), g0 = sample(x, z);
        low = Math.min(low, gin);
        high = Math.max(high, gin, gout, g0);
      }
      const bottom = low - KEEP_IN.belowM, top = high + KEEP_IN.aboveM;
      n += 1;
      walls.push({
        id: `KeepIn_${String(n).padStart(4, "0")}`, x: R2((a.x + b.x) / 2), z: R2((a.z + b.z) / 2),
        w: R2(L + t), d: t, h: R2(top - bottom), ry: Math.round(Math.atan2(-fz, fx) * 1e4) / 1e4,
        y: R2((top + bottom) / 2), semantic: "airWall", tag: "airWall", visual: false, solid: true,
      });
    }
  }
  return { walls, loops: loops.length, filled };
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

  // --- 坑北前景（2026-10-20）：树桩、坟地柏树、麦秸垛、田里零星的树（田埂 / 坟包 / 干水沟 / 地坎在高度场里） ----------
  blocks.push(...PitNorthBlocks(sample));

  // --- 2026-10-24 第六版：龛里的箱子、机枪坑的弹药箱、排长掩蔽部、预备队、连弹药所、旧阵地的摆设、林里的柏树、南半场零星的树 ----------
  const sixth = SixthRoundBlocks(sample);
  blocks.push(...sixth.blocks);
  Object.assign(facts, sixth.facts);

  return { blocks, gates, facts };
}

/**
 * 第六版的体块（2026-10-24）。显式 y 的按 sample（烘好的网格）算；龛里的箱子落在龛底（floorY）。
 * 弹药龛两三个弹药箱（小木箱）、手榴弹龛一两个小箱；机枪坑东南角两个弹药箱；排长掩蔽部顶上横木 + 覆土、里头一部野战电话；
 * 预备队三个浅坑北沿各一垛土袋；连弹药所：箱子一堆、苫布、两垛土袋；旧阵地：空机枪掩体北沿土袋、掩蔽部西半边顶 + 东半边塌下来的顶板和土、
 * 丢下的弹药箱、破枪、旧交通沟塌方的土堆；四片林的柏树；南半场零星的树。
 */
export function SixthRoundBlocks(sample) {
  const out = [];
  const N2 = (i) => String(i + 1).padStart(2, "0");
  const Tree = (id, x, z, h) => out.push(Block(id, x, z, 0.6, 0.6, h, "foliage", { prop: "Tree" }));
  const Low = (x, z, w, d) => Math.min(sample(x, z), sample(x - w / 2, z - d / 2), sample(x + w / 2, z - d / 2), sample(x - w / 2, z + d / 2), sample(x + w / 2, z + d / 2));
  const facts = { ammoNiches: 0, grenadeNiches: 0, litterNiches: 0 };
  // 龛：箱子顺着沟放在龛底（本地 X 顺沟）
  for (const n of L0105_NICHE_SHAPES) {
    const ry = Math.round(Math.atan2(-n.uz, n.ux) * 1000) / 1000;
    const inward = { x: n.lx, z: n.lz };   // 往墙里
    if (n.kind === "ammo") {
      facts.ammoNiches += 1;
      // 两个并排在底下、一个摞在上面
      for (const [k, du, dv] of [[1, -0.3, 0.05], [2, 0.3, 0.05]]) {
        out.push(Block(`${n.id}_Crate${k}`, n.x + n.ux * du + inward.x * dv, n.z + n.uz * du + inward.z * dv, 0.55, 0.38, 0.32, "timber", { ry, prop: "AmmoCrate", y: R2(n.floorY + 0.16) }));
      }
      out.push(Block(`${n.id}_Crate3`, n.x + n.ux * 0.05 + inward.x * 0.05, n.z + n.uz * 0.05 + inward.z * 0.05, 0.55, 0.38, 0.32, "timber", { ry: R2(ry + 0.05), prop: "AmmoCrate", y: R2(n.floorY + 0.48) }));
    } else if (n.kind === "grenade") {
      facts.grenadeNiches += 1;
      out.push(Block(`${n.id}_Box1`, n.x - n.ux * 0.2, n.z - n.uz * 0.2, 0.45, 0.3, 0.28, "timber", { ry, prop: "GrenadeBox", y: R2(n.floorY + 0.14) }));
      out.push(Block(`${n.id}_Box2`, n.x + n.ux * 0.25, n.z + n.uz * 0.25, 0.45, 0.3, 0.28, "timber", { ry: R2(ry - 0.08), prop: "GrenadeBox", y: R2(n.floorY + 0.14) }));
    } else facts.litterNiches += 1;
  }
  // 机枪坑东南角的弹药箱
  const pa = P.pitAmmo, pitY = sample(PIT.x, PIT.z);
  out.push(Block("PitAmmoCrate1", pa.x, pa.z, 0.55, 0.38, 0.32, "timber", { prop: "AmmoCrate", y: R2(pitY + 0.16) }));
  out.push(Block("PitAmmoCrate2", pa.x - 0.6, pa.z + 0.1, 0.55, 0.38, 0.32, "timber", { ry: 0.2, prop: "AmmoCrate", y: R2(pitY + 0.16) }));
  // 排长掩蔽部兼通信所：东边 2.6 m 盖顶（横木 + 覆土），沟那一侧 1.4 m 留作出入口；里头靠北墙一部野战电话、一条木凳
  {
    const s = P.platoonShelter, floorY = NaturalHeight(s.x, s.z) - s.floorDepth, clear = 1.9, roofW = 2.6;
    const roofX = s.x + s.w / 2 - roofW / 2;
    out.push(Block("PlatoonShelterRoofTimber", roofX, s.z, roofW + 0.4, s.d + 0.8, 0.25, "timber", { y: R2(floorY + clear + 0.125) }));
    out.push(Block("PlatoonShelterRoofEarth", roofX + 0.1, s.z, roofW + 0.8, s.d + 1.2, 0.45, "earthDark", { y: R2(floorY + clear + 0.25 + 0.225) }));
    out.push(Block("PlatoonFieldPhone", s.x + 1.3, s.z - 1.2, 0.45, 0.35, 0.3, "timber", { prop: "FieldPhone", y: R2(floorY + 0.55) }));
    out.push(Block("PlatoonBench", s.x + 1.3, s.z - 1.2, 1.6, 0.45, 0.4, "timber", { y: R2(floorY + 0.2) }));
  }
  // 坡后预备队：三个浅坑北沿各一垛土袋（朝北）
  P.reserve.pits.forEach((q, i) => out.push(Block(`ReserveSandbag${i + 1}`, q.x, q.z - P.reserve.pitR - 0.4, 1.8, 0.8, 0.6, "cover", { cover: { ...FACE_NORTH } })));
  // 连弹药所：一堆箱子（两层）、苫布盖着、两垛土袋在北边
  {
    const c = P.companyAmmo, y0 = Low(c.x, c.z, 3, 2);
    const crates = [[-0.9, -0.5], [0, -0.5], [0.9, -0.5], [-0.45, 0.4], [0.45, 0.4]];
    crates.forEach(([dx, dz], i) => out.push(Block(`CompanyAmmoCrate${i + 1}`, c.x + dx, c.z + dz, 0.8, 0.5, 0.5, "timber", { prop: "AmmoCrate", y: R2(y0 + 0.25) })));
    out.push(Block("CompanyAmmoCrate6", c.x - 0.45, c.z - 0.1, 0.8, 0.5, 0.5, "timber", { prop: "AmmoCrate", y: R2(y0 + 0.75), ry: 0.1 }));
    out.push(Block("CompanyAmmoTarp", c.x, c.z, 3.2, 2.0, 0.08, "canvas", { y: R2(y0 + 1.06) }));
    out.push(Block("CompanyAmmoSandbag1", c.x - 1.2, c.z - 1.9, 2.0, 0.8, 0.8, "cover", { cover: { ...FACE_NORTH } }));
    out.push(Block("CompanyAmmoSandbag2", c.x + 1.2, c.z - 1.9, 2.0, 0.8, 0.8, "cover", { cover: { ...FACE_NORTH } }));
  }
  // 旧阵地（放弃了）
  {
    OLD.mgNests.forEach((n) => out.push(Block(`${n.id}_Sandbags`, n.x, n.z - OLD.mgNest.d / 2 - 1.5, OLD.mgNest.w + 0.6, 0.6, 0.45, "cover", { cover: { ...FACE_NORTH } })));
    const sh = OLD.shelter, floorY = NaturalHeight(sh.x, sh.z) - sh.floorDepth, clear = 1.7;
    // 西半边的顶还在：横木 + 覆土；东半边塌了：顶板斜着落在坑里（歪一点、矮一截）、土堆在上面
    out.push(Block("OldShelterRoofTimber", sh.x - sh.w / 4, sh.z, sh.w / 2 + 0.4, sh.d + 0.8, 0.25, "timber", { y: R2(floorY + clear + 0.125) }));
    out.push(Block("OldShelterRoofEarth", sh.x - sh.w / 4, sh.z, sh.w / 2 + 0.6, sh.d + 1.2, 0.4, "earthDark", { y: R2(floorY + clear + 0.25 + 0.2) }));
    out.push(Block("OldShelterFallenSlab", sh.x + sh.w / 4 + 0.2, sh.z + 0.3, sh.w / 2 - 0.2, sh.d - 0.6, 0.22, "timber", { ry: 0.16, y: R2(floorY + 0.45) }));
    out.push(Block("OldShelterFallenEarth", sh.x + sh.w / 4 + 0.3, sh.z + 0.2, sh.w / 2 - 0.4, sh.d - 1.0, 0.8, "earthDark", { ry: 0.1, y: R2(floorY + 0.95) }));
    OLD.crates.forEach((c, i) => out.push(Block(`OldCrate_${N2(i)}`, c.x, c.z, 0.6, 0.4, 0.35, "timber", { ry: R2((i * 0.7) % 1.5), prop: "AmmoCrate" })));
    OLD.rifles.forEach((c, i) => out.push(Block(`OldRifle_${N2(i)}`, c.x, c.z, 1.1, 0.09, 0.09, "timber", { ry: R2(0.3 + i * 0.9), prop: "BrokenRifle" })));
    let k = 0;
    for (const [line, alongs] of [[OLD.comm, OLD.commCollapsed], [OLD.sap, OLD.sapCollapsed]]) {
      for (const c of alongs) {
        const p = PointAlong(line, c), r = p.headingYawDeg * Math.PI / 180, fx = -Math.sin(r), fz = -Math.cos(r);
        out.push(Block(`OldCollapse_${N2(k++)}`, p.x, p.z, 2.2, 1.3, 0.35, "earthDark", { ry: R2(Math.atan2(-fz, fx)), prop: "Collapse" }));
      }
    }
  }
  // 林（家族坟地）里的柏树；南半场零星的树
  for (const w of L0105_WOODS) w.cypresses.forEach((t, i) => out.push(Block(`${w.id}_Cypress${i + 1}`, t.x, t.z, 1.1, 1.1, t.h, "foliage", { prop: "Cypress" })));
  L0105_SOUTH_TREES.forEach((t, i) => Tree(`SouthTree_${N2(i)}`, t.x, t.z, t.h));
  return { blocks: out, facts };
}

/**
 * 坑北前景的体块（2026-10-20）：树桩（矮块，不挡人）、坟地柏树（细高块）、麦秸垛（两层块，圆顶感）；
 * 第二轮起：大路北段两边的杨树、田边零星的树、田间小路边一排树。第三版：村子拿掉（挪到远景层）。
 * 2026-10-21：不再沿大路、沿小路成排种树，只剩田里零星的（L0105_FIELD_TREES）；场地外的零星树在远景层（L0105_BACKDROP_LONE_TREES）。
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

  // 田里零星的树（2026-10-21：不再沿大路、沿小路成排种，一棵一棵散在田里；见 L0105_FIELD_TREES）
  L0105_FIELD_TREES.forEach((t, i) => Tree(`FieldTree_${N2(i)}`, t.x, t.z, t.h));
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
/** 组排的一条南北界在 x 处的 z（"scarp" = 地坎中心线、田埂 id = 那道田埂的中心线；出了场地按边界上的值延长，远景里的田接得上）。 */
export function FarmEdgeZ(edge, x) {
  const cx = Math.max(L0105_BOUNDS.minX, Math.min(L0105_BOUNDS.maxX, x));
  if (edge === "scarp") return ScarpZ(cx);
  if (typeof edge === "string") { const b = PN.bunds.find((q) => q.id === edge); if (!b) throw new Error(`FarmEdgeZ：没有田埂 ${edge}`); return BundZ(b, cx); }
  return edge;
}
/** 多边形裁一条半平面（Sutherland–Hodgman）。 */
function ClipPoly(pts, inside, cross) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const ia = inside(a), ib = inside(b);
    if (ia) out.push(a);
    if (ia !== ib) out.push(cross(a, b));
  }
  return out;
}
/** 多边形按 x 范围裁（只裁竖直的两条边）。 */
function ClipPolyX(poly, xMin, xMax) {
  const At = (a, b, x) => ({ x, z: a.z + (b.z - a.z) * (x - a.x) / (b.x - a.x) });
  let pts = ClipPoly(poly, (p) => p.x >= xMin, (a, b) => At(a, b, xMin));
  pts = ClipPoly(pts, (p) => p.x <= xMax, (a, b) => At(a, b, xMax));
  return pts;
}
/** 多边形按 z ≥ zMin 裁（斜条地被场地北边界截断时，截口处的 x 要按斜度算，不能只把 z 夹住）。 */
export function ClipPolyZ(poly, zMin) {
  return ClipPoly(poly, (p) => p.z >= zMin, (a, b) => ({ x: a.x + (b.x - a.x) * (zMin - a.z) / (b.z - a.z), z: zMin }));
}
/**
 * 一块地的多边形（2026-10-24 拼块）：条地在这一片里斜 shearDeg（x 随 z 线性偏），裁到片的 x 范围 [gx0, gx1]；
 * 南北界按 FarmEdgeZ（地坎 / 田埂是曲线，按 stepM 取点）。南北界各往外多 pad（排与排之间的小路留给底色）。
 */
export function ParcelPoly(p, row, gx0, gx1, pad, stepM = 6) {
  const t = Math.tan((p.shearDeg || 0) * Math.PI / 180);
  const cx = (p.x0 + p.x1) / 2;
  const zMid = (FarmEdgeZ(row.south, cx) + FarmEdgeZ(row.north, cx)) / 2;
  const S = (x) => FarmEdgeZ(row.south, x) - pad, N = (x) => FarmEdgeZ(row.north, x) + pad;
  const south = [], north = [];
  const n = Math.max(1, Math.ceil((p.x1 - p.x0) / stepM));
  for (let i = 0; i <= n; i++) {
    const x = p.x0 + (p.x1 - p.x0) * i / n;
    south.push({ x: x + (S(x) - zMid) * t, z: S(x) });
    north.push({ x: x + (N(x) - zMid) * t, z: N(x) });
  }
  const poly = [...south, ...north.reverse()];
  return t === 0 ? poly : ClipPolyX(poly, gx0, gx1);
}
/** 种什么：按 crops 的比例抽；kind + 两档深浅里的哪一档。 */
function PickCrop(u, shadeU) {
  let acc = 0;
  for (const [kind, w] of FARM.crops) { acc += w; if (u < acc) return { kind, shade: shadeU < 0.5 ? 0 : 1 }; }
  return { kind: FARM.crops[FARM.crops.length - 1][0], shade: shadeU < 0.5 ? 0 : 1 };
}
export function CropColor(c) { return L0105_FIELD_PAINT[c.kind][c.shade]; }

/**
 * 切田（2026-10-24 拼块）：→ { rows: [{ index, south, north }], groups: [{ row, index, x0, x1, gx0, gx1, whole, shearDeg, poly }],
 *   parcels: [{ row, group, x0, x1, w, crop, shearDeg, whole }] }。
 * 组排：rowsZ 定的几排之后按 rowLen 往北排到 region.minZ；每排从 originX 起按 groupW（50–110 m）切片（每排起点错开）；
 * 每片自己的方向 shearDeg（±FARM.shearDeg 里按序号抽）；约 wholeFrac 的片整块不分条；其余按 stripW（10–32 m）切条（最后一条把剩下的分匀，不留细边），
 * 左右相邻两条不种同一样；片心离坑 > polyRadiusM 的（远景里）一片一块、不斜（poly = false，轴对齐矩形）。
 */
export function FarmLayout() {
  const edges = [...FARM.rowsZ];
  for (let k = 0; ; k++) {
    const last = edges[edges.length - 1];
    if (typeof last === "number" && last <= FARM.region.minZ) break;
    const lastZ = typeof last === "number" ? last : FarmEdgeZ(last, P.pit.x);
    edges.push(Math.max(FARM.region.minZ, Math.round(lastZ - Pick(FARM.rowLen, Hash01(k, 31)))));
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
      const poly = Math.hypot((x0 + x1) / 2 - pit.x, midZ - pit.z) <= FARM.polyRadiusM;
      const key = r * 1000 + g;
      const whole = Hash01(key, 67) < FARM.wholeFrac;
      // 方向：±shearDeg 里抽，但别太小（不然看不出各片方向不同）
      const u = Hash01(key, 71);
      const shearDeg = poly && !whole ? Math.round((u < 0.5 ? -1 : 1) * (0.3 + 0.7 * Hash01(key, 73)) * FARM.shearDeg * 10) / 10 : 0;
      const gx0 = x0 + FARM.pathHalfW, gx1 = x1 - FARM.pathHalfW;
      const group = { row: r, index: g, x0, x1, gx0, gx1, whole, shearDeg, poly };
      groups.push(group);
      if (whole || !poly) {
        parcels.push({ row: r, group: g, x0: gx0, x1: gx1, w: R2(gx1 - gx0), crop: PickCrop(Hash01(key, 53), Hash01(key, 59)), shearDeg: 0, whole: true });
        continue;
      }
      let sx = gx0, prev = null;
      for (let s = 0; sx < gx1 - 0.01; s++) {
        const su = Hash01(key * 100 + s, 47);
        let sw = FARM.stripW[0] + (FARM.stripW[1] - FARM.stripW[0]) * Math.pow(su, 1.2);
        const rem = gx1 - sx;
        if (rem <= FARM.stripW[1] && rem - sw < FARM.stripW[0]) sw = rem;
        else if (rem - sw < FARM.stripW[0]) sw = rem / 2;
        let crop = PickCrop(Hash01(key * 100 + s, 53), Hash01(key * 100 + s, 59));
        if (prev && crop.kind === prev.kind) {
          const kinds = FARM.crops.map((c) => c[0]).filter((k) => k !== prev.kind);
          crop = { kind: kinds[Hash01(key * 100 + s, 61) < 0.5 ? 0 : 1], shade: crop.shade };
        }
        parcels.push({ row: r, group: g, x0: R2(sx), x1: R2(sx + sw), w: R2(sw), crop, shearDeg, whole: false });
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
  // 扫清带：z −12…−80（避开坑、散兵坑、爬沟；东段前沿沟往北错了 9 m，它的北沿弃土那一截也留出来）
  out.push({ id: "Cleared", color: C.cleared, feather: 1.5, poly: [
    PPt(B.minX, -80), PPt(B.maxX, -80), PPt(B.maxX, -12), PPt(104, -12), PPt(104, -18), PPt(38, -18), PPt(38, -12),
    PPt(-1.5, -12), PPt(-1.5, -17.5), PPt(-11.5, -17.5), PPt(-11.5, -12), PPt(B.minX, -12)] });
  // 爬沟、丙位散兵坑一圈是挖出来的土（扫清带上留的那个缺口）
  out.push({ id: "SapSpoil", color: C.ditchSoil, strength: 0.75, feather: 1.2, poly: [PPt(-1.5, -12), PPt(-1.5, -17.5), PPt(-11.5, -17.5), PPt(-11.5, -12)] });
  // 田间小路底色：整片坑北先涂成小路色，田块之间留下的缝就是片与片、排与排之间的小路
  out.push({ id: "FarmPaths", color: C.fieldPath, feather: 0.6, poly: [PPt(X0, -80), PPt(X1, -80), PPt(X1, Z1), PPt(X0, Z1)] });
  // 拼块田（场地里那几片）：条地按片的方向斜，裁到片的范围里
  const ph = FARM.pathHalfW;
  for (const p of farm.parcels) {
    const row = farm.rows[p.row], group = farm.groups.find((g) => g.row === p.row && g.index === p.group);
    if (group.x1 < X0 || group.x0 > X1) continue;
    const gx0 = Math.max(X0, group.gx0), gx1 = Math.min(X1, group.gx1);
    if (!(gx1 - gx0 > 0.2)) continue;
    const cx = (p.x0 + p.x1) / 2;
    if (FarmEdgeZ(row.south, cx) - ph < Z1) continue;
    const poly = ClipPolyZ(ParcelPoly({ ...p, x0: Math.max(gx0, p.x0), x1: Math.min(gx1, p.x1) }, row, gx0, gx1, -ph), Z1).map((q) => PPt(q.x, q.z));
    if (poly.length < 3) continue;
    out.push({ id: `Field_${p.row + 1}_${String(p.group).padStart(2, "0")}_${String(Math.round(p.x0 * 10))}`, color: CropColor(p.crop), feather: 0.8, poly });
  }
  // 田埂（烘进高度场的那几道）
  for (const b of PN.bunds) out.push({ id: `Bund_${b.id}`, color: C.bund, strength: 0.75, feather: 0.8, halfW: 0.45, line: SampleCurve((q) => BundZ(b, q), b.minX, b.maxX, 5) });
  // 干沙沟：两边翻出来的新土（连沟一起涂）+ 沟底的沙（2026-10-24）
  out.push({ id: "DitchSoil", color: C.ditchSoil, strength: 0.9, feather: 0.8, halfW: PR1(DITCH.topW / 2 * (1 + (DITCH.bankWobble || 0)) + DITCH.lipW), line: DITCH.line.map((p) => PPt(p.x, p.z)) });
  out.push({ id: "DitchSand", color: C.ditchSand, strength: 0.95, feather: 0.9, halfW: PR1(DITCH.floorW / 2 + 0.5), line: DITCH.line.map((p) => PPt(p.x, p.z)) });
  // 地坎坎面
  out.push({ id: "ScarpFace", color: C.scarpFace, strength: 0.9, feather: 0.8, halfW: 1.3, line: SampleCurve(ScarpZ, B.minX, B.maxX, 5) });
  // 北边放弃的旧阵地（2026-10-24）：沟沿塌土 + 蒿草的灰绿，跟现在的沟分得开
  for (const f of OLD.fire) out.push({ id: `OldTrench_${f.id}`, color: OLD.paint, strength: 0.85, feather: 0.9, halfW: OLD.paintHalfW, line: f.line.map((p) => PPt(p.x, p.z)) });
  out.push({ id: "OldTrench_Comm", color: OLD.paint, strength: 0.8, feather: 0.9, halfW: PR1(OLD.paintHalfW - 0.6), line: OLD.comm.map((p) => PPt(p.x, p.z)) });
  out.push({ id: "OldTrench_Sap", color: OLD.paint, strength: 0.8, feather: 0.9, halfW: PR1(OLD.paintHalfW - 0.6), line: OLD.sap.map((p) => PPt(p.x, p.z)) });
  for (const f of OLD.outposts) out.push({ id: `OldTrench_${f.id}`, color: OLD.paint, strength: 0.85, feather: 0.9, halfW: PR1(OLD.paintHalfW - 0.3), line: f.line.map((p) => PPt(p.x, p.z)) });
  OLD.foxholes.forEach((f, i) => out.push({ id: `OldFoxhole_${String(i + 1).padStart(2, "0")}`, color: OLD.paint, strength: 0.85, feather: 0.6, poly: Octagon(f.x, f.z, 1.6) }));
  // 坟包：坟地与两座孤坟是老坟，田里散的单个坟是新土；林里的坟是老坟
  [...PN.loneGraves.map((g, i) => ({ id: `LoneGrave${i + 1}`, ...g })), ...PN.graveyard].forEach((g) => {
    out.push({ id: `Grave_${g.id}`, color: C.graveSoil, feather: 0.6, poly: Octagon(g.x, g.z, 1.9) });
  });
  L0105_FIELD_GRAVES.forEach((g, i) => out.push({ id: `FieldGrave_${String(i + 1).padStart(2, "0")}`, color: C.newSoil, feather: 0.6, poly: Octagon(g.x, g.z, 1.9) }));
  for (const w of L0105_WOODS) if (w.z < PIT_NORTH_FROM_Z) {
    out.push({ id: `${w.id}_Ground`, color: C.graveSoil, strength: 0.6, feather: 1.5, poly: [PPt(w.x - w.w / 2, w.z - w.d / 2), PPt(w.x + w.w / 2, w.z - w.d / 2), PPt(w.x + w.w / 2, w.z + w.d / 2), PPt(w.x - w.w / 2, w.z + w.d / 2)] });
    w.graves.forEach((g, i) => out.push({ id: `${w.id}_Grave${i + 1}`, color: C.graveSoil, feather: 0.6, poly: Octagon(g.x, g.z, 1.9) }));
  }
  // 路：车道在坑北这一截（到 z −11.5，南面不涂）+ 老驿道北段（到北边界）与南段在坑北的那一截 + 田间小路 + 坑北的两条田间小路（2026-10-24）
  {
    const endZ = -11.5;   // 圆头 + 柔边不过 z −8
    const a = L0105_ROAD[0], b = L0105_ROAD[1], t = (endZ - a.z) / (b.z - a.z);
    out.push({ id: "RoadNorthEnd", color: C.road, feather: 0.8, halfW: PR1(L0105_ROAD_WIDTH_M / 2), line: [PPt(a.x, a.z), PPt(a.x + (b.x - a.x) * t, endZ)] });
    const c = L0105_POST_ROAD_SOUTH[0], d = L0105_POST_ROAD_SOUTH[1], u = (endZ - c.z) / (d.z - c.z);
    out.push({ id: "PostRoadNorthEnd", color: C.road, feather: 0.8, halfW: L0105_NORTH_ROAD_HALF_W, line: [PPt(c.x, c.z), PPt(c.x + (d.x - c.x) * u, endZ)] });
  }
  out.push({ id: "NorthRoad", color: C.road, feather: 0.8, halfW: L0105_NORTH_ROAD_HALF_W, line: L0105_NORTH_ROAD.map((p) => PPt(p.x, p.z)) });
  out.push({ id: "FieldPath", color: C.path, feather: 0.6, halfW: L0105_FIELD_PATH_HALF_W, line: L0105_FIELD_PATH.map((p) => PPt(p.x, p.z)) });
  L0105_FIELD_LANES.forEach((lane, i) => { if (lane[0].z < -12) out.push({ id: `FieldLane_${i + 1}`, color: C.path, feather: 0.6, halfW: L0105_FIELD_PATH_HALF_W, line: lane.map((p) => PPt(p.x, p.z)) }); });
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
  const rects = [], polys = [];
  const ph = FARM.pathHalfW;
  for (const p of farm.parcels) {
    const row = farm.rows[p.row], cx = (p.x0 + p.x1) / 2;
    const group = farm.groups.find((g) => g.row === p.row && g.index === p.group);
    // 600 m 以内（2026-10-24 拼块）：跟场地里一样的斜条多边形；再远一片一块、轴对齐矩形
    if (group.poly) {
      const poly = ParcelPoly(p, row, group.gx0, group.gx1, -ph).map((q) => PPt(q.x, q.z));
      if (poly.length >= 3) polys.push({ id: `BdField_${p.row + 1}_${String(p.group).padStart(2, "0")}_${String(Math.round(p.x0 * 10))}`, color: CropColor(p.crop), feather: 0.8, poly });
      continue;
    }
    const z0 = FarmEdgeZ(row.south, cx) - ph, z1 = FarmEdgeZ(row.north, cx) + ph;   // z0 南（大）、z1 北（小）
    if (!(z0 - z1 > 0.5)) continue;
    rects.push([R1(p.x0), R1(z1), R1(p.x1), R1(z0), Ci(CropColor(p.crop))]);
  }
  const paint = [
    { id: "BdCleared", color: C.cleared, feather: 1.5, poly: [PPt(FR.minX, FARM.cleared.minZ), PPt(FR.maxX, FARM.cleared.minZ), PPt(FR.maxX, FARM.cleared.maxZ), PPt(FR.minX, FARM.cleared.maxZ)] },
    { id: "BdFarmPaths", color: C.fieldPath, feather: 1, poly: [PPt(FR.minX, FR.minZ), PPt(FR.maxX, FR.minZ), PPt(FR.maxX, FR.maxZ), PPt(FR.minX, FR.maxZ)] },
    { id: "BdFields", rects, palette },
    ...polys,
  ];
  for (const v of L0105_BACKDROP_VILLAGES) {
    paint.push({ id: `BdVillage${v.id}Ground`, color: C.yard, feather: 4, poly: Ellipse(v.x, v.z, v.rx + 6, v.rz + 6) });
    paint.push({ id: `BdVillage${v.id}Threshing`, color: C.threshing, feather: 2, poly: [PPt(v.x - v.rx * 0.6, v.z + v.rz + 10), PPt(v.x - v.rx * 0.2, v.z + v.rz + 10), PPt(v.x - v.rx * 0.2, v.z + v.rz + 26), PPt(v.x - v.rx * 0.6, v.z + v.rz + 26)] });
  }
  paint.push({ id: "BdRoad", color: C.road, feather: 0.8, halfW: L0105_NORTH_ROAD_HALF_W, line: L0105_BACKDROP_ROAD.map((p) => PPt(p.x, p.z)) });
  paint.push({ id: "BdPostRoad", color: C.road, feather: 0.8, halfW: L0105_NORTH_ROAD_HALF_W, line: L0105_BACKDROP_POST_ROAD.map((p) => PPt(p.x, p.z)) });
  L0105_BACKDROP_PATHS.forEach((line, i) => paint.push({ id: `BdPath${i + 1}`, color: C.path, feather: 0.8, halfW: L0105_FIELD_PATH_HALF_W, line: line.map((p) => PPt(p.x, p.z)) }));

  const shapes = [];
  // 田野上零星的树（2026-10-21 起不再沿大路种；村子外圈的树照旧在 VillageShapes 里）
  L0105_BACKDROP_LONE_TREES.forEach((t, i) => shapes.push({ id: `BdLoneTree${String(i + 1).padStart(2, "0")}`, kind: "tree", x: t.x, z: t.z, h: t.h }));
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
const LINES = Object.freeze({ front: L0105_TRENCHES.front, traffic: L0105_TRENCHES.traffic, traffic2: L0105_TRENCHES.traffic2, branch: L0105_TRENCHES.branch });

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
      const face = p.on === "front" ? { x: 0, z: -1 } : (p.on === "traffic" || p.on === "traffic2") ? { x: -fx, z: -fz } : { x: fx, z: fz };
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
/** 旧阵地的所有沟线（核对时跳过它们附近）。 */
export const OLD_LINES = Object.freeze([...L0105_OLD_POSITION.fire.map((f) => f.line), L0105_OLD_POSITION.comm, L0105_OLD_POSITION.sap, ...L0105_OLD_POSITION.outposts.map((f) => f.line)]);
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
    if (DitchStation(x, z).d < (PN.ditch.topW / 2) * 1.3 + 2 || GraveHeight(x, z + 2) > 0 || GraveHeight(x, z - 2) > 0) continue;
    if (OLD_LINES.some((line) => DistanceToPolyline(x, z, line) < 5)) continue;   // 2026-10-24：旧阵地的沟从田埂边上过
    bunds.push({ id: b.id, x, h: R2(sample(x, z) - (sample(x, z - 2) + sample(x, z + 2)) / 2) });
  }
  // 干水沟：沿沟每 3 m（尽头渐浅段不算）量深 = 两沿外 2.6 m 的地面平均 − 沟底
  const ditchRows = [];
  const tops = [];
  const rimOff = PN.ditch.topW / 2 * (1 + (PN.ditch.bankWobble || 0)) + PN.ditch.lipW + 0.4;   // 两岸翻土外面的地面
  for (let d = 2; d <= DITCH_LEN - PN.ditch.endTaperM - 1; d += 3) {
    const c = PointBeside(PN.ditch.line, d, 0), l = PointBeside(PN.ditch.line, d, rimOff), r = PointBeside(PN.ditch.line, d, -rimOff);
    if (Math.abs(ScarpZ(c.x) - c.z) < PN.scarp.notchR + 8) continue;   // 豁口那一截是斜的
    if (DistanceToPolyline(c.x, c.z, L0105_NORTH_ROAD) < L0105_NORTH_ROAD_HALF_W + 6) continue;   // 大路从沟上过，那一截填平了
    const floor = sample(c.x, c.z);
    tops.push(R2((sample(l.x, l.z) + sample(r.x, r.z)) / 2 - floor));
    ditchRows.push({ x: c.x, z: c.z, eye: PIT_NORTH_DITCH_HEAD_M });
  }
  // 地坎：坎线南 9.5 m（旧阵地的沟在坎线南 4–8 m，量它后面）与北 6 m 的地面差（离豁口 10 m 以外，每 10 m；旧沟 / 掩体 / 坑窝的地方不算）
  const drops = [];
  for (let x = L0105_BOUNDS.minX + 5; x <= L0105_BOUNDS.maxX - 5; x += 10) {
    const z = ScarpZ(x);
    if (DitchStation(x, z).d < 14) continue;
    if (DistanceToPolyline(x, z, L0105_NORTH_ROAD) < 12 || DistanceToPolyline(x, z, L0105_FIELD_PATH) < 8) continue;   // 路穿过处是坡道
    if (Math.hypot(x - SAP_NOTCH.x, z - SAP_NOTCH.z) < SAP_NOTCH.r + 6) continue;   // 旧交通沟穿过处是窄豁口（2026-10-24）
    const south = { x, z: z + 9.5 }, north = { x, z: z - 6 };
    if (OLD_LINES.some((line) => DistanceToPolyline(south.x, south.z, line) < 3.5 || DistanceToPolyline(north.x, north.z, line) < 3.5)) continue;
    if (OLD.mgNests.some((n) => Math.abs(n.x - x) < 3) || Math.abs(OLD.shelter.x - x) < 5) continue;
    drops.push(R2(sample(south.x, south.z) - sample(north.x, north.z) - (PitNorthRoll(south.x, south.z) - PitNorthRoll(north.x, north.z))));
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
  // 烟：要「看得见」，取最容易被挡的那一对（block 最大）。2026-10-24：烟从旧交通沟东边的地面上冒（mortarSmoke），不在沟底
  const smokeRows = Run([{ x: P.mortarSmoke.x, z: P.mortarSmoke.z, eye: 3.0 }]);
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
    L("LmFrontWestFold", "前沿沟西头北折", "area", front[0].x, (front[0].z + front[1].z) / 2, { w: L0105_TRENCH_SECTION.front.floorW, d: R2(Math.abs(front[1].z - front[0].z)), note: "西段守军顺沟撤到沟口" }),
    L("LmCorner1", P.corner1.name, "place", P.corner1.x, P.corner1.z, { radiusM: 1.5, note: "04 第一次回身顶" }),
    L("LmBend", P.bend.name, "place", P.bend.x, P.bend.z, { radiusM: 1.5, note: "04 第二次回身" }),
    // 03 坑北：孤坟、坟地、麦秸垛、干水沟、地坎、掷弹筒、五道田埂、战车露头
    ...PN.loneGraves.map((g, i) => L(`LmLoneGrave${i + 1}`, "孤坟", "prop", g.x, g.z, { ...Size(PN.graveBaseR * 2, PN.graveBaseR * 2, g.h), note: "扫清带里平不掉的坟" })),
    L("LmGraveyard", "坟地", "area", yard.x, yard.z, { radiusM: 8, note: "轻机枪（西）架在坟头后" }),
    L("LmHaystack", "麦秸垛", "prop", hs.x, hs.z, { ...Size(hs.w, hs.d, hs.h), note: "轻机枪（东）靠在它西南角" }),
    L("LmDitchMid", "干水沟（深 1.2 m）", "place", ditchMid.x, ditchMid.z, { radiusM: 2, note: "弯着腰走，坑里看不见头" }),
    L("LmDitchEnd", "干水沟尽头", "place", emerge.x, emerge.z, { radiusM: 3, note: "03 沟里那个班从这出沟" }),
    L("LmScarp", "地坎（北低 2 m）", "place", 16, ScarpZ(16), { radiusM: 4, note: "03 人从坎后那片低地翻上来" }),
    L("LmMortar", P.mortar.name, "place", P.mortar.x, P.mortar.z, { radiusM: 2, note: "蹲在旧交通沟里（坎下），坑里只看得见发射的烟" }),
    ...PN.bunds.map((b) => L(`LmBund${b.id}`, `田埂 ${b.id}（离坑约 ${Math.round(Math.abs(BundZ(b, bundLabelX) - P.pit.z) / 5) * 5} m）`, "place", bundLabelX, BundZ(b, bundLabelX), { radiusM: 1, note: "03 跃进扑在埂后" })),
    L("LmTankSeen", P.tankFirstSeen.name, "place", P.tankFirstSeen.x, P.tankFirstSeen.z, { radiusM: 6, note: "03-4 三辆九四式轻装甲车从东边麦田冒出来" }),
    // 2026-10-24 第六版：三段前沿、第二条交通沟、龛、排长掩蔽部、预备队、连弹药所、连指挥所、旧阵地、林、驿道岔口、05 的 B / C 车
    L("LmFrontWest", "前沿西段（西邻班）", "area", (FRONT_W_MID.x), FRONT_W_MID.z, { w: 42, d: 6, note: "整体往南错 8 m，浅连沟通本班" }),
    L("LmFrontEast", "前沿东段（东邻班）", "area", FRONT_E_MID.x, FRONT_E_MID.z, { w: 54, d: 6, note: "01 前已丢，03 从这经浅沟清过来" }),
    L("LmTraffic2", "第二条交通沟（西邻班）", "place", L0105_TRENCHES.traffic2[2].x, L0105_TRENCHES.traffic2[2].z, { radiusM: 2, note: "西邻班的退路，通坡后预备队；01–05 的戏不走它" }),
    L("LmPlatoonShelter", P.platoonShelter.name, "pit", P.platoonShelter.x, P.platoonShelter.z, { ...Size(P.platoonShelter.w, P.platoonShelter.d, P.platoonShelter.floorDepth), y: PitY(P.platoonShelter, P.platoonShelter.floorDepth), note: "交通沟东壁上，从沟里进；里头一部野战电话" }),
    L("LmReserve", P.reserve.name, "area", P.reserve.x, P.reserve.z, { radiusM: 6, note: "坡后几个浅坑 + 土袋" }),
    L("LmCompanyAmmo", P.companyAmmo.name, "prop", P.companyAmmo.x, P.companyAmmo.z, { ...Size(3.2, 2.0, 1.1), note: "坡后、路口边，箱子盖着苫布" }),
    L("LmCompanyPost", P.companyPost.name, "place", P.companyPost.x, P.companyPost.z, { radiusM: 3, note: "干沟里，不加体块（人多）" }),
    ...L0105_NICHE_SHAPES.filter((n) => n.kind !== "litter").map((n) => L(`Lm${n.id}`, n.kind === "ammo" ? "弹药龛" : "手榴弹龛", "prop", n.x, n.z, { ...Size(n.hu * 2, (n.hv - 0.2) * 2, 0.9), ry: R2(Math.atan2(-n.uz, n.ux)), y: R2(n.floorY + 0.45), note: n.kind === "ammo" ? "沟后壁，两三个弹药箱" : "跟弹药龛隔开 ≥ 3 m" })),
    L("LmLitterNiches", "让担架的龛（主交通沟）", "place", L0105_NICHE_SHAPES.find((n) => n.id === "LitterNiche_05").x, L0105_NICHE_SHAPES.find((n) => n.id === "LitterNiche_05").z, { radiusM: 1.2, note: "板桥以北每隔约 10 m 一个，沟壁凹进 0.75 m" }),
    L("LmOldLine", "原来的阵地（放弃了）", "area", 0, OLD_LINE_Z, { w: 200, d: 14, note: "沿地坎南沿三段旧沟、空机枪掩体、掩蔽部；东边鬼子一迂回就放弃了" }),
    L("LmOldShelter", "旧掩蔽部（顶塌了半边）", "pit", OLD.shelter.x, OLD.shelter.z, { ...Size(OLD.shelter.w, OLD.shelter.d, OLD.shelter.floorDepth), y: PitY(OLD.shelter, OLD.shelter.floorDepth) }),
    ...OLD.mgNests.map((n, i) => L(`LmOldMgNest${i + 1}`, "空机枪掩体", "pit", n.x, n.z, { ...Size(OLD.mgNest.w, OLD.mgNest.d, OLD.mgNest.depth), y: PitY(n, OLD.mgNest.depth) })),
    L("LmOldComm", "撤下来走的旧交通沟", "place", OLD.comm[2].x, OLD.comm[2].z, { radiusM: 2, note: "浅 0.9 m，塌了几截" }),
    L("LmOldSap", "通警戒阵地的旧交通沟", "place", OLD.sap[6].x, OLD.sap[6].z, { radiusM: 2, note: "穿地坎往北，03 掷弹筒组蹲在坎下那一截" }),
    L("LmOutposts", "警戒阵地（早撤了）", "area", 20, -448, { w: 150, d: 30, note: "两段短沟 + 几个空散兵坑" }),
    ...L0105_WOODS.map((w) => L(`Lm${w.id}`, w.name, "area", w.x, w.z, { w: w.w, d: w.d, note: `家族坟地：${w.graves.length} 座坟、${w.cypresses.length} 棵柏树` })),
    L("LmRoadFork", "驿道 / 车道岔口", "place", L0105_ROAD[0].x, L0105_ROAD[0].z, { radiusM: 4, note: "老驿道北通界河、南到耿家庄东头；车道往西南过板桥" }),
    L("LmTankBStop", "B 车停的沟沿", "place", L0105_TANKETTES.bStop.x, L0105_TANKETTES.bStop.z, { radiusM: 3, note: "05：过不了交通沟，停在沟沿上打坡顶" }),
    L("LmTankCStall", "C 车抛锚的地方", "place", L0105_TANKETTES.cStall.x, L0105_TANKETTES.cStall.z, { radiusM: 3, note: "05：半路熄火，两个乘员拿车上的机枪就地打" }),
  ];
}
const FRONT_W_MID = PointAlong(L0105_TRENCHES.front, FrontStationAtX(-49));
const FRONT_E_MID = PointAlong(L0105_TRENCHES.front, FrontStationAtX(71));
const OLD_LINE_Z = R2(ScarpZ(0) + 5);

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
  // 防止玩家跳出壕沟（2026-10-21）：① 胸墙、板桥（横木 / 门板）标「不能攀」（noClimb：翻越 / 攀爬在它们上面不触发，射击台上照样露头开枪）；
  // ② 沟沿一圈只挡玩家的隐形墙（L0105KeepInWalls，tag airWall）
  const NO_CLIMB = /^(Parapet(West|East|Middle|Rubble)|Bridge(DoorBoard|Stringer|BrokenBoard)_\d+)$/;
  for (const b of [...blocks, ...gates]) if (NO_CLIMB.test(b.id)) b.noClimb = true;
  const keepIn = L0105KeepInWalls(terrain, sample);
  blocks.push(...keepIn.walls);
  notes.push(`圈住玩家：沟里（比没挖之前低 ≥ ${KEEP_IN.depthM} m、和机枪坑连得上）${keepIn.loops} 个环、封闭小洞填了 ${keepIn.filled} 格；沟沿隐形墙 ${keepIn.walls.length} 段（只挡玩家）；`
    + `不能攀的块 ${[...blocks, ...gates].filter((b) => b.noClimb).length} 个（胸墙、板桥）`);

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
      + `散坟 ${L0105_FIELD_GRAVES.length} 座（坑南另 ${L0105_SOUTH_GRAVES.length} 座）；林 ${L0105_WOODS.length} 片（柏树 ${count(/_Cypress\d/)}）；田里零星的树 ${count(/^FieldTree_/)} + 坑南 ${count(/^SouthTree_/)}（不沿路种）；`
      + `片的朝向 ${[...new Set(farm.groups.filter((g) => g.poly && !g.whole && g.x1 > -110 && g.x0 < 320 && g.row <= 4).map((g) => g.shearDeg))].length} 种；`
      + `龛：弹药 ${facts.ammoNiches}、手榴弹 ${facts.grenadeNiches}、让担架 ${facts.litterNiches}；旧阵地射击沟 ${OLD.fire.length} 段、警戒沟 ${OLD.outposts.length} 段；`
      + `地面：坑沿 (0,−11) ${R2(sample(0, -11))} · 坎上 (28,−190) ${R2(sample(28, -190))} · 坎下 (28,−213) ${R2(sample(28, -213))} · (30,−260) ${R2(sample(30, -260))} · (30,−340) ${R2(sample(30, -340))} · 北边界 (30,−480) ${R2(sample(30, -480))}；`
      + `色带 ${southMinM}…${southMaxM}（钉在南面；全场 ${minM}…${maxM}）`);
    notes.push(`远景层：地面高 ${backdrop.ground.y} m、铺出去 ${backdrop.ground.radiusM} m、远裁剪 ${backdrop.far} m；田块 ${rects.length} 块；体块 ${Object.entries(bdShapes).map(([k, n]) => `${k}×${n}`).join(" ")}；`
      + `村子 ${L0105_BACKDROP_VILLAGES.map((v) => `${v.id} (${v.x},${v.z}) 离坑 ${Math.round(Math.hypot(v.x - P.pit.x, v.z - P.pit.z))} m`).join("、")}`);
  }
  const FW = (x) => { const p = FrontPointAtX(x); return [p.x, p.z]; };
  const widths = [
    ["前沿西段 x−50", ...FW(-50), 0, 1], ["前沿中段 x−9", ...FW(-9), 0, 1], ["前沿中段 x16", ...FW(16), 0, 1], ["前沿东段 x62", ...FW(62), 0, 1], ["前沿西折", -70, 0, 1, 0],
    ["浅连沟（东）", ...FW(37), 0.6, 1], ["第二条交通沟", -47, 30, 5, 1],
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
        + "壕沟 = Script_TrenchPlan.CompileTrenchNetwork（2026-10-24 第六版：前沿三段 + 两条浅连沟 + 射击位，主交通沟 + 第二条交通沟 + 支沟 + 爬沟，北边旧阵地的三段射击沟 / 两条旧交通沟 / 两段警戒沟；"
        + "交通沟板桥下加深、坡顶变浅、坡道下到干沟靠改基准面；支沟弃土只堆南沿成土垄；沟壁上有弹药 / 手榴弹 / 让担架的龛）；"
        + "集结处 = 坡后干沟（沟底 −1.0、两岸 2.5 m 陡坎、南岸坎顶一道 0.6–0.8 m 矮土埂、南岸枯树、东南头接凹路）；坑 / 散兵坑 / 洞 / 排长掩蔽部为平底开挖；沟里日常摆件；路口板桥（白盒先做，剧本这一拍待拍板）；"
        + "gates：DugoutCollapsed / PitShelled（掷弹筒弹打塌一截胸墙）/ TankDisabled（A 车瘫在桥头，桥面两块门板压断）。",
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
      roads: [Pts(L0105_ROAD), Pts(L0105_SUNKEN_LANE.line), Pts(L0105_NORTH_ROAD), Pts(L0105_FIELD_PATH), Pts(L0105_POST_ROAD_SOUTH), ...L0105_FIELD_LANES.map(Pts)],
      trenches: [Pts(L0105_TRENCHES.front), Pts(L0105_TRENCHES.traffic), Pts(L0105_TRENCHES.traffic2), Pts(L0105_TRENCHES.branch), Pts(L0105_TRENCHES.crawlSap),
        ...OLD.fire.map((f) => Pts(f.line)), Pts(OLD.comm), Pts(OLD.sap), ...OLD.outposts.map((f) => Pts(f.line))],
    },
  };
  return scene;
}
