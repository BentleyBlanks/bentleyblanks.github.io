// ===========================================================================
// Script_EditorBlockoutFirstLevel0105Scene.mjs —— 第一关 01–05 新剧本白盒（FirstLevel0105）的场景生成器（node 专用）
//
// 契约 docs/Data_EditorBlockout.md §2.2（场景文件格式，含可选 gates 与块的可选 y）。产物：
//   Blockout/FirstLevel0105.scene.json  高度网格 + 体块 + 随信号体块（塌洞 / 坑沿被炸 / 战车压塌沟沿）+ 路与沟的中心线
// 跑法：node Taierzhuang1938/Script_EditorBlockoutCli.mjs scene FirstLevel0105 --force
//
// 坐标与尺寸只读 Data_EditorBlockoutFirstLevel0105Space（唯一口径）；本文件不另造锚点，只定「怎么烘」：
//   1. 自然地面 NaturalHeight：前沿 0、坑北开阔地略低、z −206 东西向土坎、z 60→131 缓升到坡顶、
//      坡顶往南落到 +1.5 的台地，台地里一道东西向干沟（集结处，沟底 −1.0、两岸 2.5 m 陡坎），干沟东南头接一条往南的凹路，
//      南岸再往南十来米落到平地 0；南岸坎顶堆一道连续的矮土埂（0.6–0.8 m，L0105_GULLY_SOUTH_BERM，凹路处被切开）；
//      叠一层确定性的低频起伏（几条固定频率的正弦，不用随机数）。
//   2. 路面：路宽内压低一点，两侧路肩略起。
//   3. 壕沟：复用 Script_TrenchPlan.CompileTrenchNetwork（与游戏第一关同一套断面、弃土垄与位置噪声）。
//      交通沟在板桥底下加深 0.3 m、过坡顶那段变浅、末端顺着干沟北岸的坎切成坡道下到沟底：不拆段，而是给 Apply 的
//      「开挖基准面」加一个随 z 变的量，这样沟底是连续的坡，不会在两段交接处出一道坎。
//      支沟的弃土只堆南沿（一道 0.75 m 的土垄，02 迂回组贴着它外侧爬，北沿的机枪看不见）。
//   4. 支沟口：支沟比交通沟深 0.4 m；交通沟里不许被支沟的端头挖深（夹到交通沟底），落差在支沟口用台阶块补。
//   5. 机枪坑、散兵坑、防炮洞：矩形 / 圆形平底开挖（底面取中心自然地面减深度，一整块平的）。
//   6. 体块：沟里的日常摆件（L0105_PROPS）、路口板桥（横木 + 门板，显式 y）、干沟南岸的枯树，以及随信号体块。
//
// 纪律：不读时钟、不读 git（commit / generatedAt 由 CLI 传入）；所有随机来自 TrenchPlan 的种子噪声，生成两次逐字相同。
// ===========================================================================

import { BLOCKOUT_SCENE_SCHEMA } from "./Script_EditorBlockoutConfig.mjs";
import { CompileTrenchNetwork } from "./Script_TrenchPlan.mjs";
import { TRENCH_EARTH_PROFILE } from "./Data_TrenchAppearance.mjs";
import { HeightGridSampler } from "./Script_EditorBlockoutLevels.mjs";
import {
  L0105_LEVEL_KEY, L0105_BOUNDS, L0105_CELL_M, L0105_HEIGHTS, L0105_TRENCH_SECTION, L0105_TRENCHES,
  L0105_ROAD, L0105_ROAD_WIDTH_M, L0105_PLACES, L0105_SIGNALS, L0105_SPAWN,
  L0105_GULLY, L0105_GULLY_TREES, L0105_GULLY_SOUTH_BERM, L0105_SUNKEN_LANE, L0105_BRIDGE, L0105_BRANCH_SOUTH_BERM,
  L0105_PROPS, L0105_PROP_KINDS, PointBeside, LineLength,
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

/** 点到矩形（轴对齐）的外部距离；里面为 0。 */
function RectOutside(x, z, minX, maxX, minZ, maxZ) {
  const dx = Math.max(minX - x, 0, x - maxX), dz = Math.max(minZ - z, 0, z - maxZ);
  return Math.hypot(dx, dz);
}
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
// 土坎（mortarBank）：长 w、厚 d；坎顶留 1.5 m 平台，两侧 2.5 m 起坡，东西两头 8 m 收尖
const BANK = P.mortarBank;
const BANK_HALF_TOP_M = 0.75, BANK_SLOPE_M = BANK.d / 2 - 0.75, BANK_END_TAPER_M = 8;
// 东边轻机枪的弹坑（敌人趴在坑里，往南打）
const LMG_CRATER = Object.freeze({ x: P.enemyLmgEast.x, z: P.enemyLmgEast.z - 0.4, r: 2.6, depth: 0.6, rimH: 0.3, rimW: 1.6 });

/** 干沟「挖进去多少」（0…1）：沟底里 1，两岸 wallM 内陡起、东西两头 endWallM 内缓起。 */
function GullyWeight(x, z) {
  const ox = Math.max(G.minX - x, 0, x - G.maxX) / G.endWallM;
  const oz = Math.max(G.minZ - z, 0, z - G.maxZ) / G.wallM;
  const u = Math.hypot(ox, oz);
  return u >= 1 ? 0 : 1 - Smooth(u);
}

/** 低频起伏（±0.3 m 量级）：三条固定频率与相位的正弦叠加，确定性。坡顶脊线与干沟一带压小，免得把高差带歪。 */
function Undulation(x, z) {
  const raw = 0.16 * Math.sin(x * 0.071 + z * 0.023 + 1.3)
    + 0.11 * Math.sin(-x * 0.031 + z * 0.083 + 0.4)
    + 0.06 * Math.sin(x * 0.137 - z * 0.109 + 2.1);
  const crestCalm = 1 - 0.75 * (1 - Smooth(Math.abs(z - P.crest.z) / 12));
  const gullyCalm = 1 - 0.85 * (1 - Smooth(RectOutside(x, z, G.minX, G.maxX, G.northRimZ, G.southRimZ) / 8));
  const frontCalm = 1 - 0.6 * (1 - Smooth(Math.hypot(x - P.pit.x, z - P.pit.z) / 25));
  return raw * crestCalm * gullyCalm * frontCalm;
}

/**
 * 南岸坎顶土埂加多少高（米）：横断面平顶 topW、两侧落到底宽 w；顶高按弧长慢慢起伏（确定性正弦），西头收尖。
 * 东头不收：一直堆到凹路，由 LaneCap 切开。
 */
const SB = L0105_GULLY_SOUTH_BERM;
const SB_LEN = (() => { let n = 0; for (let i = 1; i < SB.line.length; i++) n += Math.hypot(SB.line[i].x - SB.line[i - 1].x, SB.line[i].z - SB.line[i - 1].z); return n; })();
export function GullySouthBermTop(along) {
  return SB.h + 0.06 * Math.sin(along * 0.29 + 0.7) + 0.03 * Math.sin(along * 0.83 + 2.2);
}
/** 点到土埂中心线：→ { d 横向距离, along 弧长 }。 */
function BermStation(x, z) {
  let best = Infinity, at = 0, walked = 0;
  for (let i = 1; i < SB.line.length; i++) {
    const a = SB.line[i - 1], b = SB.line[i];
    const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz);
    const t = Clamp01(((x - a.x) * dx + (z - a.z) * dz) / (len * len));
    const d = Math.hypot(x - a.x - dx * t, z - a.z - dz * t);
    if (d < best) { best = d; at = walked + len * t; }
    walked += len;
  }
  return { d: best, along: at };
}
export function GullySouthBerm(x, z) {
  const halfBase = SB.w / 2;
  if (x < 2 || x > 86 || z < 143 || z > 161) return 0;
  const { d, along } = BermStation(x, z);
  if (d >= halfBase) return 0;
  const halfTop = SB.topW / 2;
  const k = d <= halfTop ? 1 : 1 - Smooth((d - halfTop) / (halfBase - halfTop));
  const ends = Smooth(along / SB.taperM) * Smooth((SB_LEN - along) / 1.5);
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

/** 坡顶往南的大形：z 60 → 坡顶缓升；坡顶 → 干沟北岸坎顶落到 gullyRim；台地；干沟南岸往南 southSlopeM 内落到平地。 */
function SouthProfile(z) {
  if (z <= P.crest.z) return H.crest * Smooth((z - CREST_RISE_FROM_Z) / (P.crest.z - CREST_RISE_FROM_Z));
  if (z <= G.northRimZ) return Lerp(H.crest, H.gullyRim, Smooth((z - P.crest.z) / (G.northRimZ - P.crest.z)));
  if (z <= G.southRimZ) return H.gullyRim;
  return Lerp(H.gullyRim, H.southPlain, Smooth((z - G.southRimZ) / G.southSlopeM));
}

/** 开挖前的自然地面（米）。干沟与凹路算自然地形（雨水冲出来的沟、走出来的路），在这里就挖好。 */
export function NaturalHeight(x, z) {
  let h = H.front;
  // 坑北开阔地略低（守方居高一点）
  h += H.fieldNorthDip * Smooth((FIELD_DIP_FROM_Z - z) / FIELD_DIP_RAMP_M);
  // 土坎：相对两侧地面高 mortarBankTop
  {
    const across = Smooth((BANK_HALF_TOP_M + BANK_SLOPE_M - Math.abs(z - BANK.z)) / BANK_SLOPE_M);
    const along = Smooth((BANK.w / 2 - Math.abs(x - BANK.x)) / BANK_END_TAPER_M);
    h += H.mortarBankTop * across * along;
  }
  h += SouthProfile(z);
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
  // 东轻机枪的弹坑：碗 + 一圈翻出来的土
  {
    const d = Math.hypot(x - LMG_CRATER.x, z - LMG_CRATER.z);
    if (d < LMG_CRATER.r + LMG_CRATER.rimW) {
      const bowl = -LMG_CRATER.depth * (1 - Smooth(d / LMG_CRATER.r));
      const u = (d - LMG_CRATER.r * 0.7) / (LMG_CRATER.rimW + LMG_CRATER.r * 0.3);
      const rim = u > 0 && u < 1 ? LMG_CRATER.rimH * Math.sin(u * Math.PI) : 0;
      h += bowl + rim;
    }
  }
  return h;
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
const RAMP_TO_Z = L0105_GULLY.minZ + 1;          // 142：坡道落到干沟沟底
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

  // --- 远处日军：西轻机枪趴在小土包后，东轻机枪在弹坑里（坑沿是地形） ----------
  blocks.push(Block("EnemyLmgWestMound", P.enemyLmgWest.x, P.enemyLmgWest.z + 1.3, 2.4, 1.1, 0.6, "earthDark", { cover: { ...FACE_SOUTH } }));
  blocks.push(Block("EnemyLmgEastLip", P.enemyLmgEast.x, LMG_CRATER.z + LMG_CRATER.r + 0.5, 2.0, 0.8, 0.35, "earthDark", { cover: { ...FACE_SOUTH } }));

  return { blocks, gates, facts };
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
  // ① 集结处（干沟沟底，站姿眼高 1.6）→ 前沿的人头（1.5）：要被坡挡住
  assemblyFrom: Object.freeze([[20, 145], [35, 148.5], [50, 152], [58, 144], [37, 142.5], [15, 154]].map(([x, z]) => ({ x, z, eye: 1.6 }))),
  frontTargets: Object.freeze([[0, -7], [0, 0], [40, 0], [-40, 0]].map(([x, z]) => ({ x, z, eye: 1.5 }))),
  // ② 南边平地上（离南岸坎顶 ≥ 12 m，眼高 1.6）→ 干沟沟底站着的人头（1.6）：要看不见；凹路两边 8 m 内的点不算（顺着凹路能看进沟口）
  southFrom: Object.freeze((() => {
    const out = [];
    for (const z of [170, 180, 195]) for (let x = -10; x <= 90; x += 10) out.push({ x, z, eye: 1.6 });
    return out;
  })()),
  gullyTargets: Object.freeze((() => {
    const out = [];
    for (let x = L0105_GULLY.minX + 3; x <= L0105_GULLY.maxX - 3; x += 4) for (const z of [142.5, 145.5, 148.5, 151.5, 154.5]) out.push({ x, z, eye: 1.6 });
    return out;
  })()),
});

/** 干沟沟底的南北宽（在 x 处）与东西长（在 z 处）：高度离沟底 tol 以内的连续一段。 */
export function GullyFloorExtent(sample, x = L0105_PLACES.assembly.x + 8, z = L0105_PLACES.assembly.z, tol = 0.15) {
  const floorY = H.assemblyFloor + tol;
  const Run = (f, from, to) => { let best = 0, cur = 0; for (let v = from; v <= to; v += 0.1) { if (f(v) <= floorY) { cur += 0.1; best = Math.max(best, cur); } else cur = 0; } return R2(best); };
  return { width: Run((zz) => sample(x, zz), L0105_GULLY.minZ - 6, L0105_GULLY.maxZ + 6), length: Run((xx) => sample(xx, z), L0105_GULLY.minX - 10, L0105_GULLY.maxX + 10) };
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

/** 生成场景文档。commit / generatedAt 由 CLI 传进来；notes 收抽样核对行（CLI 打到控制台）。 */
export async function BuildFirstLevel0105Scene({ commit = "", generatedAt = "", notes = [] } = {}) {
  const { Ground } = L0105Ground();
  const { terrain, minM, maxM } = BakeL0105Grid(Ground);
  const sample = HeightGridSampler(terrain);

  const branchFloorAtSteps = Math.min(...[0, 0.5, 1.0].map((dx) => sample(STEP_TOP_X + 0.6 + dx, BranchZAt(STEP_TOP_X + 0.6 + dx))));
  const trafficFloorAtJunction = sample(P.branchMouth.x, P.branchMouth.z);
  const frontFloorAtMouth = sample(P.mouth.x, P.mouth.z - 0.8);
  const { blocks, gates, facts } = L0105Blocks(sample, {
    pitFloorY: sample(PIT.x, PIT.z), frontFloorAtMouth, branchFloorAtSteps, trafficFloorAtJunction, dugoutFloorY: sample(DUG.x, DUG.z),
  });

  // --- 抽样核对 ---
  const at = (p) => R2(sample(p.x, p.z));
  const nat = (p) => R2(NaturalHeight(p.x, p.z));
  notes.push(`网格 ${terrain.cols}×${terrain.rows}（${terrain.cellM} m），高度 ${minM}…${maxM} m；体块 ${blocks.length}（其中摆件 ${facts.props}）、随信号体块 ${gates.length}`);
  notes.push(`地面：沟口 ${at(P.mouth)}（自然 ${nat(P.mouth)}）· 坑底 ${at(PIT)}（坑边自然 ${nat(PIT)}，深 ${R2(nat(PIT) - at(PIT))}）· 散兵坑底 ${at(FIREC)} · `
    + `洞底 ${at(DUG)}（自然 ${nat(DUG)}，深 ${R2(nat(DUG) - at(DUG))}）`);
  notes.push(`沟底：拐角1 ${at(P.corner1)} · 南直段 ${at({ x: 12.5, z: 32 })} · 支沟口（交通沟） ${R2(trafficFloorAtJunction)} · 台阶脚（支沟） ${R2(branchFloorAtSteps)}（落差 ${R2(facts.stepRise)}，${STEP_COUNT} 级）`
    + ` · 拐角2 ${at(P.corner2)} · 板桥下 ${at(P.crossing)}（沟深 ${R2(nat(P.crossing) - at(P.crossing))}）· 坡顶沟底 ${at(P.crest)}（坡顶自然 ${nat(P.crest)}，沟深 ${R2(nat(P.crest) - at(P.crest))}）· 干沟口 ${at(P.assemblyEntry)}`);
  const crestTop = R2(sample(P.crest.x + 12, P.crest.z)), floor = R2(sample(P.assembly.x, P.assembly.z));
  const rimN = R2(sample(P.assembly.x + 8, L0105_GULLY.northRimZ - 0.5));
  const bermS = R2(GullySouthBerm(P.assembly.x + 8, L0105_GULLY.southRimZ + 0.5));
  const rimS = R2(sample(P.assembly.x + 8, L0105_GULLY.southRimZ + 0.5) - bermS);   // 南岸坎顶（扣掉上面那道土埂）
  const gw = GullyFloorExtent(sample);
  notes.push(`干沟：坡顶（沟东 12 m）${crestTop} · 沟底 ${floor} → 高差 ${R2(crestTop - floor)} m（锚点 ${R2(H.crest - H.assemblyFloor)}）；北岸坎顶 ${rimN}、南岸坎顶 ${rimS}（上面再堆 ${bermS} m 土埂）→ 坎高 ${R2(rimN - floor)} / ${R2(rimS - floor)} m；`
    + `沟底（离 −1.0 在 15 cm 内）南北宽 ${gw.width} m、东西长 ${gw.length} m；凹路口 ${at(P.laneHead)}、凹路 (83,170) 底 ${R2(sample(83, 170))} / 旁边地面 ${R2(sample(91, 170))}`);
  {
    const tops = [];
    let low = 0;
    for (let along = SB.taperM; along <= SB_LEN - 10; along += 1) {
      tops.push(R2(GullySouthBermTop(along)));
      if (GullySouthBermTop(along) < 0.6) low += 1;
    }
    notes.push(`南岸土埂：中心线 ${R2(SB_LEN)} m（西头顺缓坎往北 ${SB.taperM} m 收尖、绕过西南角顺南岸到 x ${SB.line[SB.line.length - 1].x}，东头凹路切开），`
      + `顶高 ${Math.min(...tops)}…${Math.max(...tops)} m、底宽 ${SB.w} m、顶宽 ${SB.topW} m；低于 0.6 m 的地方 ${low} 处`);
  }
  notes.push(`坑北开阔地 (0,−80) ${R2(sample(0, -80))} · 土坎顶 (28,−206) ${R2(sample(BANK.x, BANK.z))}、坎北掷弹筒 ${at(P.mortar)} · 东轻机枪弹坑底 ${at(P.enemyLmgEast)}`);
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
    blocks,
    gates,
    ways: {
      roads: [Pts(L0105_ROAD), Pts(L0105_SUNKEN_LANE.line)],
      trenches: [Pts(L0105_TRENCHES.front), Pts(L0105_TRENCHES.traffic), Pts(L0105_TRENCHES.branch), Pts(L0105_TRENCHES.crawlSap)],
    },
  };
  return scene;
}
