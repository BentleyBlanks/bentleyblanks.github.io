// ===========================================================================
// Script_EditorBlockoutFirstLevel0105Scene.mjs —— 第一关 01–05 新剧本白盒（FirstLevel0105）的场景生成器（node 专用）
//
// 契约 docs/Data_EditorBlockout.md §2.2（场景文件格式，含可选 gates 与块的可选 y）。产物：
//   Blockout/FirstLevel0105.scene.json  高度网格 + 体块 + 随信号体块（塌洞 / 坑沿被炸 / 战车压塌沟沿）+ 路与沟的中心线
// 跑法：node Taierzhuang1938/Script_EditorBlockoutCli.mjs scene FirstLevel0105 --force
//
// 坐标与尺寸只读 Data_EditorBlockoutFirstLevel0105Space（唯一口径）；本文件不另造锚点，只定「怎么烘」：
//   1. 自然地面 NaturalHeight：前沿 0、坑北开阔地略低、z −206 东西向土坎、z 60→131 缓升到坡顶、
//      坡顶南侧落进集结处洼地、再往南回到约 0；叠一层确定性的低频起伏（几条固定频率的正弦，不用随机数）。
//   2. 路面：路宽内压低一点，两侧路肩略起。
//   3. 壕沟：复用 Script_TrenchPlan.CompileTrenchNetwork（与游戏第一关同一套断面、弃土垄与位置噪声）。
//      交通沟过坡顶那段变浅、末端爬出到集结处洼地底：不拆段，而是给 Apply 的「开挖基准面」加一个随 z 抬高的量，
//      这样沟底是连续的坡，不会在两段交接处出一道坎。
//   4. 支沟口：支沟比交通沟深 0.4 m；交通沟里不许被支沟的端头挖深（夹到交通沟底），落差在支沟口用台阶块补。
//   5. 机枪坑、散兵坑、防炮洞：矩形 / 圆形平底开挖（底面取中心自然地面减深度，一整块平的）。
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

const ASSEMBLY_RECT = Object.freeze({
  minX: P.assembly.x - P.assembly.w / 2, maxX: P.assembly.x + P.assembly.w / 2,
  minZ: P.assembly.z - P.assembly.d / 2 - 0, maxZ: P.assembly.z + P.assembly.d / 2,
});
const ASSEMBLY_RIM_M = 9;        // 洼地边缘缓起的宽度
const CREST_RISE_FROM_Z = 60;    // 从这里往南缓缓升到坡顶
const CREST_FALL_M = 45;         // 坡顶往南回到约 0 的距离（洼地之外）
const FIELD_DIP_FROM_Z = -25;    // 坑北这条线以北开始变低
const FIELD_DIP_RAMP_M = 25;
// 土坎（mortarBank）：长 w、厚 d；坎顶留 1.5 m 平台，两侧 2.5 m 起坡，东西两头 8 m 收尖
const BANK = P.mortarBank;
const BANK_HALF_TOP_M = 0.75, BANK_SLOPE_M = BANK.d / 2 - 0.75, BANK_END_TAPER_M = 8;
// 东边轻机枪的弹坑（敌人趴在坑里，往南打）
const LMG_CRATER = Object.freeze({ x: P.enemyLmgEast.x, z: P.enemyLmgEast.z - 0.4, r: 2.6, depth: 0.6, rimH: 0.3, rimW: 1.6 });

/** 低频起伏（±0.3 m 量级）：三条固定频率与相位的正弦叠加，确定性。坡顶脊线与洼地里压小，免得把高差带歪。 */
function Undulation(x, z) {
  const raw = 0.16 * Math.sin(x * 0.071 + z * 0.023 + 1.3)
    + 0.11 * Math.sin(-x * 0.031 + z * 0.083 + 0.4)
    + 0.06 * Math.sin(x * 0.137 - z * 0.109 + 2.1);
  const crestCalm = 1 - 0.75 * (1 - Smooth(Math.abs(z - P.crest.z) / 12));
  const bowlCalm = 1 - 0.75 * (1 - Smooth(RectOutside(x, z, ASSEMBLY_RECT.minX, ASSEMBLY_RECT.maxX, ASSEMBLY_RECT.minZ, ASSEMBLY_RECT.maxZ) / ASSEMBLY_RIM_M));
  const frontCalm = 1 - 0.6 * (1 - Smooth(Math.hypot(x - P.pit.x, z - P.pit.z) / 25));
  return raw * crestCalm * bowlCalm * frontCalm;
}

/** 开挖前的自然地面（米）。 */
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
  // 往南：z 60 → 坡顶缓升到 crest，坡顶再往南回落
  let south;
  if (z <= P.crest.z) south = H.crest * Smooth((z - CREST_RISE_FROM_Z) / (P.crest.z - CREST_RISE_FROM_Z));
  else south = H.crest * (1 - Smooth((z - P.crest.z) / CREST_FALL_M));
  h += south;
  // 集结处洼地：里面是平底 assemblyFloor，边缘 ASSEMBLY_RIM_M 内缓起
  {
    const out = RectOutside(x, z, ASSEMBLY_RECT.minX, ASSEMBLY_RECT.maxX, ASSEMBLY_RECT.minZ, ASSEMBLY_RECT.maxZ);
    const w = 1 - Smooth(out / ASSEMBLY_RIM_M);
    h = Lerp(h, H.assemblyFloor, w);
  }
  h += Undulation(x, z);
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
      { id: "Branch", preset: "communication", points: Pts(L0105_TRENCHES.branch), depth: S.branch.depth,
        floorW: FloorWFor(S.branch.floorW), jitterScale: TRENCH_JITTER_SCALE, source: "L0105_TRENCHES.branch" },
      { id: "CrawlSap", preset: "sap", points: Pts(L0105_TRENCHES.crawlSap), depth: S.crawlSap.depth,
        floorW: S.crawlSap.floorW, bankW: 0.6, bermH: 0.12, bermW: 0.8, cornerRadiusM: 0, jitterScale: TRENCH_JITTER_SCALE,
        source: "L0105_TRENCHES.crawlSap（坑西北角 → 散兵坑）" },
    ],
  };
}

/**
 * 交通沟的目标深度随 z：路口以北 traffic.depth；过坡顶那段 trafficAtCrest.depth；
 * 坡顶南边往集结处洼地爬出来，到集结处入口归零（沟底接上洼地底）。
 */
const CREST_SHALLOW_FROM_Z = P.crossing.z + 5;   // 121：过了路口开始变浅
const CREST_SHALLOW_FULL_Z = P.crest.z - 7;      // 124
const EXIT_FROM_Z = P.crest.z + 6;               // 137：坡顶南边开始往外爬
const EXIT_TO_Z = P.assemblyEntry.z;             // 145：集结处入口
export function TrafficDepthAt(z) {
  const deep = S.traffic.depth, crest = S.trafficAtCrest.depth;
  if (z <= CREST_SHALLOW_FROM_Z) return deep;
  if (z <= EXIT_FROM_Z) return Lerp(deep, crest, Smooth((z - CREST_SHALLOW_FROM_Z) / (CREST_SHALLOW_FULL_Z - CREST_SHALLOW_FROM_Z)));
  return crest * (1 - Smooth((z - EXIT_FROM_Z) / (EXIT_TO_Z - EXIT_FROM_Z)));
}
/** Apply 的开挖基准面抬高量：只在交通沟坡顶那一截（别的沟够不着这里）。 */
function TrafficBaseLift(x, z) {
  if (z <= CREST_SHALLOW_FROM_Z || Math.abs(x - P.crest.x) > 12) return 0;
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

  // --- 05：战车压塌路口两侧的沟沿 -------------------------------------------
  const cx = P.crossing.x, cz = P.crossing.z;
  gates.push(Block("TankCrushRimWest", cx - 2.4, cz + 0.3, 1.5, 2.6, 0.6, "earthDark", { ry: 0.08, appearSignal: L0105_SIGNALS.tankDisabled }));
  gates.push(Block("TankCrushRimEast", cx + 2.4, cz - 0.4, 1.5, 2.8, 0.6, "earthDark", { ry: -0.1, appearSignal: L0105_SIGNALS.tankDisabled }));

  // --- 坡顶别的班的坡沿（趴着朝北）：低沙袋 / 土埂 ----------------------------
  P.crestPosts.forEach((p, i) => {
    blocks.push(Block(`CrestPost${i + 1}`, p.x, p.z - 0.6, 2.6, 0.8, 0.45, i % 2 ? "earthDark" : "cover", { cover: { ...FACE_NORTH } }));
  });

  // --- 远处日军：西轻机枪趴在小土包后，东轻机枪在弹坑里（坑沿是地形） ----------
  blocks.push(Block("EnemyLmgWestMound", P.enemyLmgWest.x, P.enemyLmgWest.z + 1.3, 2.4, 1.1, 0.6, "earthDark", { cover: { ...FACE_SOUTH } }));
  blocks.push(Block("EnemyLmgEastLip", P.enemyLmgEast.x, LMG_CRATER.z + LMG_CRATER.r + 0.5, 2.0, 0.8, 0.35, "earthDark", { cover: { ...FACE_SOUTH } }));

  // --- 集结处：两道土埂 -------------------------------------------------------
  blocks.push(Block("AssemblyBermWest", ASSEMBLY_RECT.minX + 5, P.assembly.z - 4, 1.2, 7, 0.6, "earthDark"));
  blocks.push(Block("AssemblyBermEast", ASSEMBLY_RECT.maxX - 7, P.assembly.z + 6, 8, 1.2, 0.5, "earthDark"));

  return { blocks, gates, facts };
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
  return { width: R2(Edge(1) + Edge(-1)), depth: R2(maxCut) };
}

// ---------------------------------------------------------------------------
// 场景

/** 生成场景文档。commit / generatedAt 由 CLI 传进来；notes 收抽样核对行（CLI 打到控制台）。 */
export async function BuildFirstLevel0105Scene({ commit = "", generatedAt = "", notes = [] } = {}) {
  const { Ground, pitFloorY, fireCFloorY, dugoutFloorY } = L0105Ground();
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
  notes.push(`网格 ${terrain.cols}×${terrain.rows}（${terrain.cellM} m），高度 ${minM}…${maxM} m；体块 ${blocks.length}、随信号体块 ${gates.length}`);
  notes.push(`地面：沟口 ${at(P.mouth)}（自然 ${nat(P.mouth)}）· 坑底 ${at(PIT)}（坑边自然 ${nat(PIT)}，深 ${R2(nat(PIT) - at(PIT))}）· 散兵坑底 ${at(FIREC)} · `
    + `洞底 ${at(DUG)}（自然 ${nat(DUG)}，深 ${R2(nat(DUG) - at(DUG))}）`);
  notes.push(`沟底：拐角1 ${at(P.corner1)} · 南直段 ${at({ x: 12.5, z: 32 })} · 支沟口（交通沟） ${R2(trafficFloorAtJunction)} · 台阶脚（支沟） ${R2(branchFloorAtSteps)}（落差 ${R2(facts.stepRise)}，${STEP_COUNT} 级）`
    + ` · 拐角2 ${at(P.corner2)} · 路口 ${at(P.crossing)} · 坡顶沟底 ${at(P.crest)}（坡顶自然 ${nat(P.crest)}，沟深 ${R2(nat(P.crest) - at(P.crest))}）· 集结处入口 ${at(P.assemblyEntry)}`);
  const crestTop = R2(sample(P.crest.x + 12, P.crest.z)), bowl = R2(sample(P.assembly.x, P.assembly.z));
  notes.push(`坡顶（沟东 12 m）${crestTop} · 集结处洼地底 ${bowl} → 高差 ${R2(crestTop - bowl)} m（锚点 ${R2(H.crest - H.assemblyFloor)}）· `
    + `坑北开阔地 (0,−80) ${R2(sample(0, -80))} · 土坎顶 (28,−206) ${R2(sample(BANK.x, BANK.z))}、坎北掷弹筒 ${at(P.mortar)} · 东轻机枪弹坑底 ${at(P.enemyLmgEast)}`);
  const widths = [
    ["前沿沟 x−30", -30.5, 0, 0, 1], ["前沿沟 x60", 56, 0, 0.5, 1], ["前沿沟西折", -62, -12, 1, 0],
    ["交通沟南直段", 12.5, 32, 23, 1], ["交通沟斜段", 26, 76.6, 42, -18], ["交通沟坡顶", 35, 128, 1, 0], ["交通沟路口南", 35, 121, 1, 0], ["支沟中段", 42, 65.8, 2.6, 41.1],
  ].map(([name, x, z, nx, nz]) => { const r = FloorWidthAt(sample, x, z, nx, nz); return `${name} ${r.width}（深 ${r.depth}）`; });
  notes.push(`沟底宽（开挖深度离最深处 5 cm 内，网格插值后）：${widths.join(" · ")}；名义 floorW ${FloorWFor(S.traffic.floorW)}（最窄 ≥ ${S.traffic.floorW}），爬沟 ${S.crawlSap.floorW}`);
  const sightTargets = [{ x: 0, z: -7, eye: 1.5 }, { x: 0, z: 0, eye: 1.5 }, { x: 40, z: 0, eye: 1.5 }];
  const sightFrom = [{ x: 35, z: 158, eye: 1.6 }, { x: 20, z: 148, eye: 1.6 }, { x: 52, z: 168, eye: 1.6 }, { x: 35, z: 146, eye: 1.6 }];
  let worstSeen = Infinity;
  const sightRows = [];
  for (const from of sightFrom) for (const to of sightTargets) {
    const r = SightBlock(sample, from, to);
    worstSeen = Math.min(worstSeen, r.block);
    sightRows.push(`(${from.x},${from.z})→(${to.x},${to.z}) 挡 ${r.block} m@${r.at.x},${r.at.z}`);
  }
  notes.push(`视线（集结处站姿眼高 1.6 → 前沿人头 1.5）：${worstSeen > 0 ? "全部被坡挡住" : "有看得见的！"}，最少也挡 ${R2(worstSeen)} m；${sightRows.slice(0, 3).join(" · ")} …`);
  const branchSight = SightBlock(sample, { x: P.dugoutMouth.x + 0.8, z: P.dugoutMouth.z - 0.5, eye: 0.3 }, { x: P.branchMouth.x + 3, z: BranchZAt(P.branchMouth.x + 3), eye: 1.0 });
  notes.push(`洞口趴着（眼高 0.3）→ 支沟口：挡 ${branchSight.block} m（≤0 = 看得见，体块未计）；洞里净高 ${facts.dugoutClear} m；塌洞横木离地 ${facts.beamGap} m（下沿）`);

  const scene = {
    schema: BLOCKOUT_SCENE_SCHEMA,
    level: L0105_LEVEL_KEY,
    source: {
      generator: L0105_SCENE_GENERATOR,
      generatedAt,
      commit,
      notes: `01–05 新剧本白盒：锚点 Data_EditorBlockoutFirstLevel0105Space；高度 ${L0105_CELL_M} m 网格（${minM}…${maxM} m）；`
        + "壕沟 = Script_TrenchPlan.CompileTrenchNetwork（前沿两段 + 交通 + 支沟 + 爬沟，坡顶一截靠抬基准面变浅）；"
        + "坑 / 散兵坑 / 洞为平底开挖；gates：DugoutCollapsed / PitShelled / TankDisabled。路口未盖木板（Notion 待定）。",
    },
    bounds: { ...L0105_BOUNDS },
    spawn: { x: L0105_SPAWN.x, z: L0105_SPAWN.z, yawDeg: L0105_SPAWN.yawDeg },
    terrain,
    blocks,
    gates,
    ways: {
      roads: [Pts(L0105_ROAD)],
      trenches: [Pts(L0105_TRENCHES.front), Pts(L0105_TRENCHES.traffic), Pts(L0105_TRENCHES.branch), Pts(L0105_TRENCHES.crawlSap)],
    },
  };
  return scene;
}
