// 《燎原 · 敌后1937》 —— 战略地图生成器（太行山—冀西—冀中平原过渡带）。
//
// 这不是"撒一层噪声然后按高度切地形"的随机地图，而是一张有战略地理的图：
//
//   西部（低 q）  太行主脊：连脊高山 + 深切峡谷，敌人上不来，我们也运不出去。
//   中部          冀西丘陵与黄土台地：梯田、村落与山口，根据地的腹心在这里。
//   东部（高 q）  冀中平原：产粮最多、藏人最难，铁路与公路在这里织成囚笼。
//   河流          发源于山中，顺坡东流入平原，河谷是走廊，渡口是咽喉。
//   铁路          干线沿平原东侧南北纵贯，另有一条支线自干线向西切入丘陵，
//                 这是"囚笼政策"的骨架，也是破袭战的首要目标。
//   公路          把县城串联起来，把根据地切成一块一块，炮楼沿路而立。
//
// 生成流水线（每一步都是可单测的纯函数）：
//   BuildLattice → BuildElevationField → CarveRivers → ComputeMoistureField
//   → ClassifyTerrain → ComputeFertilityField → ChooseHomeBasin → PlaceSettlements
//   → LayRailways → LayRoads → PlaceStrongholds → ComputeEnemyPressure
//   → ChooseStart → AssignControl → ComputeMassBase → BuildRegions → AssembleHexes
//
// 硬性保证（GenerateMap 内部即已满足，可用 ValidateMap 复核）：
//   1. 同一 seed 产出完全相同的地图（全部随机数来自 Script_Hex 的 CreateRng）。
//   2. 9 种地形全部出现；10 种地物全部出现。
//   3. 地图全连通（所有地形 moveCost 有限，BFS 可达）。
//   4. 相邻格 elevation 高差 ≤ 0.28（渲染做地形高度时不会出现刀劈的断崖）。
//   5. startKey 位于山区/丘陵，且其 1–2 环内至少有 4 座村庄。
//
// 纯逻辑模块：不引用 window / document / three / Math.random。

import {
  hexDirections,
  HexKey,
  HexDistance,
  HexesInRange,
  HexRing,
  CreateRng,
  HashString,
  Clamp,
  Clamp01,
  SmoothStep,
  FractalNoise2D,
  RidgeNoise2D,
} from "./Script_Hex.mjs";

import {
  terrainDefinitions,
  featureDefinitions,
  terrainKeys,
  featureKeys,
  HexBaseYields,
  HexMoveCost,
  HexConcealment,
} from "./Data_Terrain.mjs";

// ---------------------------------------------------------------------------
// 0. 生成参数
// ---------------------------------------------------------------------------

export const mapGenDefaults = Object.freeze({
  slopeLimit: 0.18, // 造地形时的相邻高差上限
  finalSlopeLimit: 0.24, // 河流下切之后的兜底上限（契约要求 ≤ 0.28）
  slopeIterations: 160,
  riverCarve: 0.06, // 河床下切深度
  riverBankCarve: 0.024, // 河岸跟着下沉，做出河谷断面
  riverCountMin: 3,
  riverCountMax: 4,
  forestShare: 0.11, // 林地占比（配额法，保证每个 seed 都有林地）
  loessShare: 0.085,
  marshShare: 0.035,
  gorgeShare: 0.028,
  villageShare: 0.135, // 村庄占全图格数的比例上限
  countySeatMin: 3,
  countySeatMax: 5,
  townMin: 5,
  townMax: 8,
  homeVillageTarget: 5, // 腹心盆地 1–2 环内预置的村庄数
});

const riverNames = Object.freeze([
  "清漳河",
  "浊漳河",
  "滹沱河",
  "唐　河",
  "沙　河",
  "拒马河",
  "绵　河",
  "漭　河",
]);

const countyNames = Object.freeze([
  "阜平",
  "涞源",
  "灵丘",
  "曲阳",
  "唐　县",
  "行唐",
  "平山",
  "井陉",
  "赞皇",
  "内丘",
  "黎城",
  "武乡",
  "沁源",
  "襄垣",
  "涉　县",
]);

const townNames = Object.freeze([
  "龙泉关",
  "王快镇",
  "东回舍",
  "石桥铺",
  "南　关",
  "柏　林",
  "白　岸",
  "大　道",
  "苇　泽",
  "五　台",
  "娘子店",
  "槐树铺",
  "青　塔",
  "赵　庄",
  "长　城",
]);

const villagePrefixes = Object.freeze([
  "王", "李", "张", "赵", "杨", "石", "柳", "桑", "枣", "杏",
  "东", "西", "南", "北", "上", "下", "大", "小", "老", "新",
  "黄", "清", "白", "青", "红", "井", "寺", "槐", "松", "梨",
]);

const villageSuffixes = Object.freeze([
  "家庄", "家沟", "家岭", "家峪", "家湾", "家口", "村", "坪",
  "岔", "峪", "沟", "岗", "堡", "寨", "窑", "铺", "口", "洼",
]);

// ---------------------------------------------------------------------------
// 1. 基础工具
// ---------------------------------------------------------------------------

/** 种子归一化：接受数字或字符串，返回 uint32。 */
export function NormalizeSeed(seed) {
  if (typeof seed === "number" && Number.isFinite(seed)) return seed >>> 0 || 0x9e3779b9;
  if (typeof seed === "string" && seed.length > 0) return HashString(seed);
  return 0x9e3779b9;
}

/** 由主种子派生一路子种子，保证各阶段互不串扰。 */
function DeriveSeed(seed, tag) {
  return (NormalizeSeed(seed) ^ HashString(tag)) >>> 0;
}

/** 列行坐标 → 轴向键（本模块的矩形网格约定：q = col, r = row - floor(col/2)）。 */
export function LatticeKeyAt(col, row) {
  return HexKey(col, row - Math.floor(col / 2));
}

/** 极简二叉堆，供 A* / Dijkstra 使用。 */
class PriorityQueue {
  constructor() {
    this.keys = [];
    this.costs = [];
  }

  get size() {
    return this.keys.length;
  }

  Push(key, cost) {
    this.keys.push(key);
    this.costs.push(cost);
    let index = this.keys.length - 1;
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (this.costs[parent] <= this.costs[index]) break;
      this.Swap(parent, index);
      index = parent;
    }
  }

  Pop() {
    if (this.keys.length === 0) return null;
    const top = this.keys[0];
    const lastKey = this.keys.pop();
    const lastCost = this.costs.pop();
    if (this.keys.length > 0) {
      this.keys[0] = lastKey;
      this.costs[0] = lastCost;
      let index = 0;
      for (;;) {
        const left = index * 2 + 1;
        const right = left + 1;
        let smallest = index;
        if (left < this.keys.length && this.costs[left] < this.costs[smallest]) smallest = left;
        if (right < this.keys.length && this.costs[right] < this.costs[smallest]) smallest = right;
        if (smallest === index) break;
        this.Swap(smallest, index);
        index = smallest;
      }
    }
    return top;
  }

  Swap(a, b) {
    const key = this.keys[a];
    this.keys[a] = this.keys[b];
    this.keys[b] = key;
    const cost = this.costs[a];
    this.costs[a] = this.costs[b];
    this.costs[b] = cost;
  }
}

/** A* 寻路。costFunction(toKey, fromKey) 返回进入代价，Infinity 表示不可通行。 */
export function FindPath(lattice, startKey, goalKey, costFunction, options = {}) {
  if (!lattice.cells[startKey] || !lattice.cells[goalKey]) return null;
  if (startKey === goalKey) return [startKey];
  const minStep = options.minStepCost ?? 0.3;
  const goal = lattice.cells[goalKey];
  const open = new PriorityQueue();
  const cameFrom = new Map();
  const bestCost = new Map();
  bestCost.set(startKey, 0);
  open.Push(startKey, 0);
  while (open.size > 0) {
    const current = open.Pop();
    if (current === goalKey) break;
    const currentCost = bestCost.get(current);
    for (const neighbor of lattice.neighbors[current]) {
      const step = costFunction(neighbor, current);
      if (!Number.isFinite(step)) continue;
      const nextCost = currentCost + step;
      const known = bestCost.get(neighbor);
      if (known !== undefined && known <= nextCost + 1e-9) continue;
      bestCost.set(neighbor, nextCost);
      cameFrom.set(neighbor, current);
      const cell = lattice.cells[neighbor];
      open.Push(neighbor, nextCost + HexDistance(cell, goal) * minStep);
    }
  }
  if (!bestCost.has(goalKey)) return null;
  const path = [goalKey];
  let cursor = goalKey;
  while (cursor !== startKey) {
    cursor = cameFrom.get(cursor);
    if (cursor === undefined) return null;
    path.push(cursor);
  }
  path.reverse();
  return path;
}

/** Dijkstra 到"最近的一个目标"，用于把村庄接上已有路网。 */
export function FindPathToAny(lattice, startKey, goalSet, costFunction, maxCost = Infinity) {
  if (!lattice.cells[startKey]) return null;
  if (goalSet.has(startKey)) return [startKey];
  const open = new PriorityQueue();
  const cameFrom = new Map();
  const bestCost = new Map();
  bestCost.set(startKey, 0);
  open.Push(startKey, 0);
  let reached = null;
  while (open.size > 0) {
    const current = open.Pop();
    const currentCost = bestCost.get(current);
    if (currentCost > maxCost) break;
    if (goalSet.has(current) && current !== startKey) {
      reached = current;
      break;
    }
    for (const neighbor of lattice.neighbors[current]) {
      const step = costFunction(neighbor, current);
      if (!Number.isFinite(step)) continue;
      const nextCost = currentCost + step;
      if (nextCost > maxCost) continue;
      const known = bestCost.get(neighbor);
      if (known !== undefined && known <= nextCost + 1e-9) continue;
      bestCost.set(neighbor, nextCost);
      cameFrom.set(neighbor, current);
      open.Push(neighbor, nextCost);
    }
  }
  if (reached === null) return null;
  const path = [reached];
  let cursor = reached;
  while (cursor !== startKey) {
    cursor = cameFrom.get(cursor);
    if (cursor === undefined) return null;
    path.push(cursor);
  }
  path.reverse();
  return path;
}

/** 多源 BFS 步数场（不计地形代价，用于"离河/离铁路多少格"）。 */
export function FloodSteps(lattice, sourceKeys, limit = 99) {
  const distance = Object.create(null);
  for (const key of lattice.order) distance[key] = limit;
  let frontier = [];
  for (const key of sourceKeys) {
    if (!lattice.cells[key]) continue;
    if (distance[key] !== 0) {
      distance[key] = 0;
      frontier.push(key);
    }
  }
  let step = 0;
  while (frontier.length > 0 && step < limit) {
    step += 1;
    const next = [];
    for (const key of frontier) {
      for (const neighbor of lattice.neighbors[key]) {
        if (distance[neighbor] > step) {
          distance[neighbor] = step;
          next.push(neighbor);
        }
      }
    }
    frontier = next;
  }
  return distance;
}

/** 相邻高差限制（投影松弛）：反复把超限的相邻对拉近，直到全图满足 limit。 */
export function EnforceSlopeLimit(lattice, elevation, limit, iterations = 160) {
  const { order, neighbors } = lattice;
  const count = order.length;
  for (let pass = 0; pass < iterations; pass += 1) {
    let changed = false;
    const forward = pass % 2 === 0;
    for (let index = 0; index < count; index += 1) {
      const key = forward ? order[index] : order[count - 1 - index];
      const list = neighbors[key];
      for (let n = 0; n < list.length; n += 1) {
        const other = list[n];
        const delta = elevation[key] - elevation[other];
        if (delta > limit) {
          const excess = (delta - limit) * 0.5;
          elevation[key] -= excess;
          elevation[other] += excess;
          changed = true;
        } else if (delta < -limit) {
          const excess = (-delta - limit) * 0.5;
          elevation[key] += excess;
          elevation[other] -= excess;
          changed = true;
        }
      }
    }
    if (!changed) return pass + 1;
  }
  return iterations;
}

/** 拉普拉斯平滑，strength 越大越平。 */
function SmoothField(lattice, field, passes = 1, strength = 0.35) {
  for (let pass = 0; pass < passes; pass += 1) {
    const snapshot = Object.assign(Object.create(null), field);
    for (const key of lattice.order) {
      const list = lattice.neighbors[key];
      if (list.length === 0) continue;
      let sum = 0;
      for (const neighbor of list) sum += snapshot[neighbor];
      const average = sum / list.length;
      field[key] = snapshot[key] + (average - snapshot[key]) * strength;
    }
  }
}

/** 取全图 elevation 的最大相邻高差，用于自检。 */
export function MaxNeighborDelta(lattice, elevation) {
  let worst = 0;
  for (const key of lattice.order) {
    for (const neighbor of lattice.neighbors[key]) {
      const delta = Math.abs(elevation[key] - elevation[neighbor]);
      if (delta > worst) worst = delta;
    }
  }
  return worst;
}

/** 取已排序数组的分位数。 */
function Percentile(sorted, ratio) {
  if (sorted.length === 0) return 0;
  const index = Clamp(Math.floor(sorted.length * ratio), 0, sorted.length - 1);
  return sorted[index];
}

/** 按分数排序取前 count 个（带 key 兜底比较，保证跨平台稳定）。 */
function TopByScore(entries, count) {
  const sorted = entries.slice().sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
  });
  return sorted.slice(0, Math.max(0, count));
}

/** 判断 key 与已选点集是否满足最小间距。 */
function FarEnough(lattice, key, chosen, minDistance) {
  const cell = lattice.cells[key];
  for (const other of chosen) {
    if (HexDistance(cell, lattice.cells[other]) < minDistance) return false;
  }
  return true;
}

/** 取半径内实际存在的格键。 */
function KeysInRange(lattice, key, radius) {
  const center = lattice.cells[key];
  const result = [];
  for (const coord of HexesInRange(center, radius)) {
    const other = HexKey(coord.q, coord.r);
    if (lattice.cells[other]) result.push(other);
  }
  return result;
}

/** 取某一环上实际存在的格键。 */
function KeysInRing(lattice, key, radius) {
  const center = lattice.cells[key];
  const result = [];
  for (const coord of HexRing(center, radius)) {
    const other = HexKey(coord.q, coord.r);
    if (lattice.cells[other]) result.push(other);
  }
  return result;
}

// ---------------------------------------------------------------------------
// 2. 网格
// ---------------------------------------------------------------------------

/**
 * 建立矩形排布的六边形网格（flat-top，列错行）。
 * cells[key] = { key, q, r, col, row, u, v }，u 为东西归一化坐标，v 为南北归一化坐标。
 */
export function BuildLattice(width = 26, height = 20) {
  const cells = Object.create(null);
  const order = [];
  for (let col = 0; col < width; col += 1) {
    for (let row = 0; row < height; row += 1) {
      const q = col;
      const r = row - Math.floor(col / 2);
      const key = HexKey(q, r);
      cells[key] = {
        key,
        q,
        r,
        col,
        row,
        u: width > 1 ? col / (width - 1) : 0,
        v: height > 1 ? row / (height - 1) : 0,
      };
      order.push(key);
    }
  }
  const neighbors = Object.create(null);
  for (const key of order) {
    const cell = cells[key];
    const list = [];
    for (const direction of hexDirections) {
      const other = HexKey(cell.q + direction.q, cell.r + direction.r);
      if (cells[other]) list.push(other);
    }
    neighbors[key] = list;
  }
  return { width, height, cells, order, neighbors };
}

// ---------------------------------------------------------------------------
// 3. 高程场：太行主脊 → 山前断崖 → 丘陵黄土 → 平原
// ---------------------------------------------------------------------------

/**
 * 生成高程场。剖面由三段叠加而成：
 *   scarp  山前大断崖（uw 0.10→0.40 之间迅速掉高）
 *   ramp   丘陵—黄土的长缓坡（uw 0.32→0.78）
 *   spine  主脊：RidgeNoise 折出的锐利脊线，只在西部生效
 * 再叠丘陵噪声、平原微起伏与南北构造差异，最后做平滑 + 相邻高差限制。
 */
export function BuildElevationField(lattice, seed, options = {}) {
  const config = { ...mapGenDefaults, ...options };
  const seedWarp = DeriveSeed(seed, "warp");
  const seedFine = DeriveSeed(seed, "fine");
  const seedSpine = DeriveSeed(seed, "spine");
  const seedHill = DeriveSeed(seed, "hill");
  const seedPlain = DeriveSeed(seed, "plain");
  const seedTrend = DeriveSeed(seed, "trend");

  const elevation = Object.create(null);
  const ridge = Object.create(null);
  const warpField = Object.create(null);

  // 第一遍：算出扭曲后的东西坐标与主脊噪声的原始值。
  // RidgeNoise2D 的取值集中在高位（p50 ≈ 0.83），直接叠加只会把西部整体抬成一块高原；
  // 所以先统计分位数把脊线抽出来，再让"脊上升、脊间降"——这样才是连脊而不是一堵墙。
  const spineMaskByKey = Object.create(null);
  const spineRawByKey = Object.create(null);
  const spineSamples = [];
  for (const key of lattice.order) {
    const cell = lattice.cells[key];
    const { u, v } = cell;
    const warp =
      (FractalNoise2D(v * 2.4, 1.7, { seed: seedWarp, octaves: 3, persistence: 0.58 }) - 0.5) * 0.22;
    const fine =
      (FractalNoise2D(u * 4.3, v * 4.3, { seed: seedFine, octaves: 3, persistence: 0.5 }) - 0.5) * 0.08;
    const uw = Clamp01(u + warp + fine);
    warpField[key] = uw;
    const mask = Math.pow(1 - SmoothStep(0.0, 0.34, uw), 1.2);
    spineMaskByKey[key] = mask;
    const raw = RidgeNoise2D(u * 2.3, v * 3.8, { seed: seedSpine, octaves: 4, persistence: 0.52 });
    spineRawByKey[key] = raw;
    if (mask > 0.08) spineSamples.push(raw);
  }
  spineSamples.sort((a, b) => a - b);
  const spineLow = spineSamples.length > 8 ? Percentile(spineSamples, 0.22) : 0.62;
  const spineHigh = spineSamples.length > 8 ? Percentile(spineSamples, 0.93) : 0.98;
  const spineRange = spineHigh - spineLow || 1;

  for (const key of lattice.order) {
    const cell = lattice.cells[key];
    const { u, v } = cell;
    const uw = warpField[key];

    // scarp 是山前大断崖（高山→山梁），ramp 是山梁→丘陵→平原的长缓坡。
    // 两段叠加，才有"出了山口就是一马平川"的太行东麓剖面，而不是一路匀速下降。
    const scarp = 1 - SmoothStep(0.06, 0.3, uw);
    const ramp = 1 - SmoothStep(0.22, 0.76, uw);
    let value = 0.12 + 0.31 * scarp + 0.42 * ramp;

    // 主脊：脊线抬升，脊间的谷地下沉，做出"一道梁一条沟"的太行剖面。
    const spineMask = spineMaskByKey[key];
    const shaped = Clamp01((spineRawByKey[key] - spineLow) / spineRange);
    const spine = spineMask * (shaped - 0.4);
    value += spine * 0.44;
    ridge[key] = spineMask * shaped;

    // 丘陵/黄土梁峁：在过渡带上做中频起伏，把山梁与丘陵的界线打散。
    const hillMask = 1 - Clamp01(Math.abs(uw - 0.4) / 0.34);
    const hillNoise = FractalNoise2D(u * 5.6, v * 5.6, { seed: seedHill, octaves: 4, persistence: 0.48 });
    value += hillMask * (hillNoise - 0.44) * 0.28;

    // 平原微起伏：河间地略高，古河道略低。
    const plainMask = SmoothStep(0.5, 0.82, uw);
    value +=
      plainMask * (FractalNoise2D(u * 7.4, v * 7.4, { seed: seedPlain, octaves: 3 }) - 0.5) * 0.07;

    // 南北构造：北段山体更整、南段更破碎。
    value += (FractalNoise2D(v * 1.9, 5.7, { seed: seedTrend, octaves: 2 }) - 0.5) * 0.07 * (1 - plainMask);

    elevation[key] = Clamp01(value);
  }

  SmoothField(lattice, elevation, 2, 0.3);
  EnforceSlopeLimit(lattice, elevation, config.slopeLimit, config.slopeIterations);
  for (const key of lattice.order) elevation[key] = Clamp01(elevation[key]);

  // 局部起伏（relief）：本格与邻居的平均落差，供峡谷判定与盆地判定使用。
  const relief = Object.create(null);
  for (const key of lattice.order) {
    const list = lattice.neighbors[key];
    let sum = 0;
    for (const neighbor of list) sum += Math.abs(elevation[key] - elevation[neighbor]);
    relief[key] = list.length ? sum / list.length : 0;
  }

  return { elevation, ridge, relief, warp: warpField };
}

// ---------------------------------------------------------------------------
// 4. 河流：山中发源，顺坡东流，汇入平原
// ---------------------------------------------------------------------------

/**
 * 在高程场上刻出 3–4 条自西向东的河流，并把河床与河岸下切成河谷。
 * 河流是天然分界与机动障碍，同时也是村落与渡口的分布骨架。
 * 注意：本函数会**就地修改** elevation（下切河床），返回值只带河道信息。
 */
export function CarveRivers(lattice, elevation, seed, options = {}) {
  const config = { ...mapGenDefaults, ...options };
  const rng = CreateRng(DeriveSeed(seed, "rivers"));
  const seedWander = DeriveSeed(seed, "riverWander");
  const { cells, width, height } = lattice;

  // 河源：西部高处，南北方向拉开距离。
  const sourceCandidates = [];
  for (const key of lattice.order) {
    const cell = cells[key];
    if (cell.u > 0.34) continue;
    if (cell.row < 2 || cell.row > height - 3) continue;
    if (elevation[key] < 0.6) continue;
    sourceCandidates.push({
      key,
      score: elevation[key] * 1.2 + rng() * 0.5 + (1 - Math.abs(cell.v - 0.5)) * 0.15,
    });
  }
  const riverCount = Math.max(
    config.riverCountMin,
    Math.min(config.riverCountMax, config.riverCountMin + Math.floor(rng() * (config.riverCountMax - config.riverCountMin + 1))),
  );
  const ranked = TopByScore(sourceCandidates, sourceCandidates.length);
  const sources = [];
  for (const entry of ranked) {
    if (sources.length >= riverCount) break;
    if (!FarEnough(lattice, entry.key, sources, 5)) continue;
    let rowClash = false;
    for (const other of sources) {
      if (Math.abs(cells[entry.key].row - cells[other].row) < 3) rowClash = true;
    }
    if (rowClash) continue;
    sources.push(entry.key);
  }
  // 极端情况下（地形太平）放宽间距，保证至少有河。
  if (sources.length === 0 && ranked.length > 0) sources.push(ranked[0].key);

  const riverSet = new Set();
  const riverIdByKey = Object.create(null);
  const rivers = [];
  const maxSteps = width * 2 + height;

  sources.sort((a, b) => cells[a].row - cells[b].row || (a < b ? -1 : 1));

  for (let index = 0; index < sources.length; index += 1) {
    const sourceKey = sources[index];
    if (riverSet.has(sourceKey)) continue;
    const path = [sourceKey];
    const visited = new Set([sourceKey]);
    let current = sourceKey;
    let merged = false;
    for (let step = 0; step < maxSteps; step += 1) {
      const cell = cells[current];
      if (cell.col >= width - 1) break; // 出图入海（图外的大平原）
      let best = null;
      let bestScore = Infinity;
      for (const neighbor of lattice.neighbors[current]) {
        if (visited.has(neighbor)) continue;
        const other = cells[neighbor];
        // 顺坡而下为主，向东为辅，再加低频摆动——平原上落差几乎为零，
        // 全靠这层摆动河才不会笔直地一路向东，而是蛇曲成一道天然分界。
        let score = elevation[neighbor] * 6;
        score -= (other.col - cell.col) * 0.5;
        if (other.col < cell.col) score += 0.45; // 不倒流回山里
        score += Math.abs(other.row - cell.row) * 0.04;
        score += Math.max(0, 2 - other.col) * 0.6; // 别贴着西边界南北游荡
        score +=
          (FractalNoise2D(other.col * 0.26, other.row * 0.26, { seed: seedWander, octaves: 2 }) - 0.5) * 0.55;
        score += rng() * 0.06;
        // 避免摊成一片水面：邻接已有河道太多就绕开。
        let touching = 0;
        for (const around of lattice.neighbors[neighbor]) {
          if (riverSet.has(around) || visited.has(around)) touching += 1;
        }
        if (touching > 1) score += (touching - 1) * 0.5;
        if (riverSet.has(neighbor)) score -= 0.85; // 鼓励汇流
        if (score < bestScore) {
          bestScore = score;
          best = neighbor;
        }
      }
      if (best === null) break;
      path.push(best);
      visited.add(best);
      if (riverSet.has(best)) {
        merged = true;
        break;
      }
      current = best;
    }
    if (path.length < 4) continue;
    const riverId = rivers.length;
    for (const key of path) {
      riverSet.add(key);
      if (riverIdByKey[key] === undefined) riverIdByKey[key] = riverId;
    }
    rivers.push({
      id: riverId,
      name: riverNames[riverId % riverNames.length],
      path,
      merged,
      mouthKey: path[path.length - 1],
      sourceKey,
    });
  }

  // 下切河床与河岸，做出可见的河谷断面。
  const bank = new Set();
  for (const key of riverSet) {
    for (const neighbor of lattice.neighbors[key]) {
      if (!riverSet.has(neighbor)) bank.add(neighbor);
    }
  }
  for (const key of riverSet) elevation[key] = Clamp01(elevation[key] - config.riverCarve);
  for (const key of bank) elevation[key] = Clamp01(elevation[key] - config.riverBankCarve);
  EnforceSlopeLimit(lattice, elevation, config.finalSlopeLimit, config.slopeIterations);
  for (const key of lattice.order) elevation[key] = Clamp01(elevation[key]);

  const riverKeys = lattice.order.filter((key) => riverSet.has(key));
  const riverDistance = FloodSteps(lattice, riverKeys, 12);

  return { riverKeys, riverSet, rivers, riverDistance, riverIdByKey };
}

// ---------------------------------------------------------------------------
// 5. 湿度场
// ---------------------------------------------------------------------------

/** 湿度 = 低洼 + 近河 + 噪声 − 山前旱带。供植被着色与地形分类使用。 */
export function ComputeMoistureField(lattice, elevation, riverDistance, seed) {
  const seedWet = DeriveSeed(seed, "moisture");
  const moisture = Object.create(null);
  for (const key of lattice.order) {
    const cell = lattice.cells[key];
    const wet = FractalNoise2D(cell.u * 3.4, cell.v * 3.4, { seed: seedWet, octaves: 4, persistence: 0.55 });
    const spread = Clamp01(0.5 + (wet - 0.5) * 2.1);
    const lowland = Math.pow(1 - elevation[key], 1.4);
    const nearRiver = 0.42 * Math.exp(-(riverDistance[key] ?? 9) / 1.7);
    // 山前旱带：黄土台地这一线雨影明显，梯田靠的是背水的沟坝地。
    const dryBelt = 0.09 * Math.max(0, 1 - Math.abs(cell.u - 0.46) / 0.24);
    moisture[key] = Clamp01(0.1 + 0.46 * spread + 0.3 * lowland + nearRiver - dryBelt);
  }
  SmoothField(lattice, moisture, 1, 0.25);
  for (const key of lattice.order) moisture[key] = Clamp01(moisture[key]);
  return moisture;
}

// ---------------------------------------------------------------------------
// 6. 地形分类
// ---------------------------------------------------------------------------

/**
 * 先按高程分出 Mountain / Ridge / Hill / Plain 四个基带（河流单列），
 * 再用"配额 + 排序"的方式覆盖出 Gorge / Forest / Loess / Marsh —— 配额法保证
 * 每个 seed 下 9 种地形必定都出现，并且占比稳定可控。
 */
export function ClassifyTerrain(lattice, elevation, moisture, riverInfo, seed, options = {}) {
  const config = { ...mapGenDefaults, ...options };
  const seedVeg = DeriveSeed(seed, "vegetation");
  const riverSet = riverInfo.riverSet;
  const terrain = Object.create(null);
  const cellCount = lattice.order.length;

  // 6.1 高程基带
  for (const key of lattice.order) {
    if (riverSet.has(key)) {
      terrain[key] = "River";
      continue;
    }
    const value = elevation[key];
    if (value >= 0.78) terrain[key] = "Mountain";
    else if (value >= 0.54) terrain[key] = "Ridge";
    else if (value >= 0.3) terrain[key] = "Hill";
    else terrain[key] = "Plain";
  }

  // 6.2 峡谷：西部深切、两侧高起的谷道，优先落在山中河流的两岸。
  const gorgeCandidates = [];
  for (const key of lattice.order) {
    if (terrain[key] === "River") continue;
    const cell = lattice.cells[key];
    if (cell.u > 0.5) continue;
    const value = elevation[key];
    if (value < 0.44 || value > 0.82) continue;
    let higher = 0;
    let sum = 0;
    for (const neighbor of lattice.neighbors[key]) {
      const delta = elevation[neighbor] - value;
      sum += delta;
      if (delta > 0.1) higher += 1;
    }
    const average = lattice.neighbors[key].length ? sum / lattice.neighbors[key].length : 0;
    let score = average * 4 + higher * 0.35;
    if ((riverInfo.riverDistance[key] ?? 9) <= 1) score += 1.1; // 山中河谷两壁
    if (higher < 2) score -= 1.2;
    gorgeCandidates.push({ key, score });
  }
  for (const entry of TopByScore(gorgeCandidates, Math.round(cellCount * config.gorgeShare))) {
    if (entry.score <= 0) continue;
    terrain[entry.key] = "Gorge";
  }

  // 6.3 林地：湿润 + 山坡 + 植被噪声，按配额取前 N 名。
  const forestCandidates = [];
  for (const key of lattice.order) {
    const current = terrain[key];
    if (current === "River" || current === "Gorge" || current === "Mountain") continue;
    const value = elevation[key];
    if (value < 0.3 || value > 0.75) continue;
    const cell = lattice.cells[key];
    const vegetation = FractalNoise2D(cell.u * 4.8, cell.v * 4.8, { seed: seedVeg, octaves: 4, persistence: 0.52 });
    const score =
      Clamp01(0.5 + (vegetation - 0.5) * 2.2) * 0.62 +
      moisture[key] * 0.42 +
      (1 - Math.abs(value - 0.5) / 0.24) * 0.16;
    forestCandidates.push({ key, score });
  }
  for (const entry of TopByScore(forestCandidates, Math.round(cellCount * config.forestShare))) {
    terrain[entry.key] = "Forest";
  }

  // 6.4 黄土台地：夹在丘陵与平原之间的一条岗地，干燥、离河远、被雨水割成沟壑。
  const loessCandidates = [];
  for (const key of lattice.order) {
    const current = terrain[key];
    if (current !== "Hill" && current !== "Plain") continue;
    const value = elevation[key];
    if (value < 0.2 || value > 0.5) continue;
    const cell = lattice.cells[key];
    if (cell.u < 0.28 || cell.u > 0.72) continue;
    const score =
      (1 - moisture[key]) * 1.05 +
      Math.min(4, riverInfo.riverDistance[key] ?? 9) * 0.06 +
      (1 - Math.abs(cell.u - 0.52) / 0.26) * 0.45;
    loessCandidates.push({ key, score });
  }
  for (const entry of TopByScore(loessCandidates, Math.round(cellCount * config.loessShare))) {
    terrain[entry.key] = "Loess";
  }

  // 6.5 洼淀：东部低洼、近河、湿。
  const marshCandidates = [];
  for (const key of lattice.order) {
    if (terrain[key] !== "Plain") continue;
    const value = elevation[key];
    if (value > 0.24) continue;
    const score = moisture[key] * 1.4 + (1 - value) * 0.5 + (lattice.cells[key].u - 0.5) * 0.4;
    marshCandidates.push({ key, score });
  }
  for (const entry of TopByScore(marshCandidates, Math.round(cellCount * config.marshShare))) {
    terrain[entry.key] = "Marsh";
  }

  // 6.6 兜底：万一某种地形一个都没有（极端 seed / 极端尺寸），强制补齐。
  EnsureEveryTerrain(lattice, elevation, moisture, terrain, riverInfo);

  const counts = Object.create(null);
  for (const key of terrainKeys) counts[key] = 0;
  for (const key of lattice.order) counts[terrain[key]] += 1;

  return { terrain, counts };
}

/** 保证 9 种地形都出现：缺哪种就在最合适的几格上补哪种。 */
function EnsureEveryTerrain(lattice, elevation, moisture, terrain, riverInfo) {
  const counts = Object.create(null);
  for (const key of terrainKeys) counts[key] = 0;
  for (const key of lattice.order) counts[terrain[key]] += 1;

  const suitability = {
    Mountain: (key) => elevation[key] * 2 - lattice.cells[key].u,
    Ridge: (key) => elevation[key] * 1.6 - lattice.cells[key].u * 0.8,
    Hill: (key) => 1 - Math.abs(elevation[key] - 0.46) * 4,
    Forest: (key) => moisture[key] + 1 - Math.abs(elevation[key] - 0.5) * 3,
    Plain: (key) => 1 - elevation[key] * 2 + lattice.cells[key].u,
    Loess: (key) => 1 - moisture[key] + 1 - Math.abs(elevation[key] - 0.4) * 3,
    Marsh: (key) => moisture[key] * 2 - elevation[key] * 3 + lattice.cells[key].u,
    Gorge: (key) => elevation[key] - lattice.cells[key].u * 1.5,
    River: (key) => 1 - elevation[key],
  };

  for (const wanted of terrainKeys) {
    if (counts[wanted] > 0) continue;
    const scorer = suitability[wanted];
    const candidates = [];
    for (const key of lattice.order) {
      if (terrain[key] === "River" && wanted !== "River") continue;
      if (riverInfo.riverSet.has(key) && wanted !== "River") continue;
      if (counts[terrain[key]] <= 2) continue; // 别把另一种地形挖没了
      candidates.push({ key, score: scorer(key) });
    }
    const picks = TopByScore(candidates, 3);
    for (const entry of picks) {
      counts[terrain[entry.key]] -= 1;
      terrain[entry.key] = wanted;
      counts[wanted] += 1;
    }
  }
}

// ---------------------------------------------------------------------------
// 7. 耕地适宜度
// ---------------------------------------------------------------------------

/** 耕地/聚落适宜度 0..1：坡缓、有水、能种粮的地方人才会成村。 */
export function ComputeFertilityField(lattice, elevation, moisture, terrain, riverInfo, relief) {
  const fertility = Object.create(null);
  for (const key of lattice.order) {
    const definition = terrainDefinitions[terrain[key]];
    const grain = definition ? definition.yields.grain : 0;
    const water = Math.exp(-(riverInfo.riverDistance[key] ?? 9) / 2.2);
    const flat = 1 - Clamp01((relief[key] ?? 0) / 0.14);
    const wetness = 1 - Math.abs(moisture[key] - 0.58) * 1.6;
    // 海拔越高，无霜期越短、水越难上山，同样的坡地也养不了那么多人。
    const altitude = 1 - SmoothStep(0.45, 0.88, elevation[key]);
    const value =
      (grain / 3) * 0.36 + water * 0.22 + flat * 0.18 + Clamp01(wetness) * 0.14 + altitude * 0.1;
    fertility[key] = Clamp01(value);
  }
  return fertility;
}

// ---------------------------------------------------------------------------
// 8. 腹心盆地（玩家的落脚点）
// ---------------------------------------------------------------------------

/**
 * 选一处"群山环抱、有水有田"的山间盆地作为根据地腹心。
 * 这是整张图上唯一一处被刻意设计出来的地方——玩家的第一个立足点不应该靠运气。
 */
export function ChooseHomeBasin(lattice, elevation, terrain, fertility, riverInfo, relief, seed) {
  const rng = CreateRng(DeriveSeed(seed, "basin"));
  const allowed = new Set(["Hill", "Forest", "Ridge"]);
  const candidates = [];
  for (const key of lattice.order) {
    const cell = lattice.cells[key];
    if (!allowed.has(terrain[key])) continue;
    if (cell.u < 0.16 || cell.u > 0.54) continue;
    if (cell.row < 3 || cell.row > lattice.height - 4) continue;
    const value = elevation[key];
    if (value < 0.4 || value > 0.7) continue;

    const around = KeysInRange(lattice, key, 2);
    let fertilitySum = 0;
    let concealSum = 0;
    let landCount = 0;
    for (const other of around) {
      fertilitySum += fertility[other];
      concealSum += HexConcealment(terrain[other], null);
      if (terrain[other] !== "River") landCount += 1;
    }
    const size = around.length || 1;
    const score =
      1.2 * (1 - Math.abs(value - 0.52) / 0.2) +
      0.9 * (1 - Clamp01((relief[key] ?? 0) / 0.13)) +
      0.85 * Math.exp(-Math.max(0, (riverInfo.riverDistance[key] ?? 9) - 1) / 2) +
      1.1 * (fertilitySum / size) +
      0.6 * (concealSum / size) +
      0.75 * (1 - Math.abs(cell.v - 0.5) * 1.6) +
      0.35 * (landCount / size) +
      rng() * 0.2;
    candidates.push({ key, score });
  }
  if (candidates.length === 0) {
    // 退而求其次：全图高程最接近 0.5 的格。
    const fallback = TopByScore(
      lattice.order.map((key) => ({ key, score: 1 - Math.abs(elevation[key] - 0.5) })),
      1,
    );
    return fallback.length ? fallback[0].key : lattice.order[0];
  }
  return TopByScore(candidates, 1)[0].key;
}

// ---------------------------------------------------------------------------
// 9. 聚落与地物
// ---------------------------------------------------------------------------

/**
 * 布置县城、集镇、村庄，以及渡口、隘口、古庙、梯田、果林、石场、盐滩。
 * 村庄按水源与耕地密度分布：平原密、山地疏；腹心盆地周围先行预置一簇村庄。
 */
export function PlaceSettlements(
  lattice,
  elevation,
  moisture,
  terrain,
  riverInfo,
  fertility,
  relief,
  homeBasinKey,
  seed,
  options = {},
) {
  const config = { ...mapGenDefaults, ...options };
  const rng = CreateRng(DeriveSeed(seed, "settlements"));
  const seedName = DeriveSeed(seed, "names");
  const nameRng = CreateRng(seedName);
  const cellCount = lattice.order.length;

  const feature = Object.create(null);
  const siteNames = Object.create(null);
  for (const key of lattice.order) {
    feature[key] = null;
    siteNames[key] = null;
  }
  // 腹心盆地的正中先占住：那里要留给玩家的落脚点，不能被集镇或县城压上。
  const reservedMark = "__reserved";
  feature[homeBasinKey] = reservedMark;

  const villageKeys = [];
  const townKeys = [];
  const countySeatKeys = [];
  const usedNames = new Set();

  const IsLand = (key) => terrain[key] !== "River";
  const SettlementScore = (key) => {
    const cell = lattice.cells[key];
    const water = Math.exp(-(riverInfo.riverDistance[key] ?? 9) / 2.4);
    return (
      fertility[key] * 1.15 +
      water * 0.35 +
      (1 - Clamp01((relief[key] ?? 0) / 0.15)) * 0.3 +
      (1 - Math.abs(moisture[key] - 0.55) * 1.2) * 0.2 +
      (1 - Math.abs(cell.v - 0.5) * 0.7) * 0.1
    );
  };

  // 9.1 县城 3–5 座：东部平原 2–3 座（将来铁路穿城），丘陵 1–2 座（公路与支线的尽头）。
  const seatQuota = Math.max(
    config.countySeatMin,
    Math.min(config.countySeatMax, config.countySeatMin + Math.floor(rng() * (config.countySeatMax - config.countySeatMin + 1))),
  );
  const plainSeatQuota = Math.max(2, seatQuota - 2);
  const plainSeatCandidates = [];
  const hillSeatCandidates = [];
  for (const key of lattice.order) {
    if (!IsLand(key)) continue;
    const cell = lattice.cells[key];
    const kind = terrain[key];
    if (kind === "Mountain" || kind === "Gorge" || kind === "Marsh") continue;
    if (cell.row < 1 || cell.row > lattice.height - 2) continue;
    const distanceToBasin = HexDistance(lattice.cells[key], lattice.cells[homeBasinKey]);
    if (distanceToBasin < 4) continue;
    const base = SettlementScore(key) + rng() * 0.12;
    // 平原县城要落在将来铁路干线的走廊里（否则干线会为了穿城而向西拐出一个大弯）。
    if (cell.u >= 0.66 && cell.col <= lattice.width - 2) {
      plainSeatCandidates.push({ key, score: base + (1 - Math.abs(cell.u - 0.82) * 1.8) * 0.45 });
    } else if (cell.u >= 0.3 && cell.u <= 0.58) {
      hillSeatCandidates.push({ key, score: base + (1 - Math.abs(cell.u - 0.44) * 1.8) * 0.35 });
    }
  }
  for (const entry of TopByScore(plainSeatCandidates, plainSeatCandidates.length)) {
    if (countySeatKeys.length >= plainSeatQuota) break;
    if (!FarEnough(lattice, entry.key, countySeatKeys, 6)) continue;
    countySeatKeys.push(entry.key);
  }
  for (const entry of TopByScore(hillSeatCandidates, hillSeatCandidates.length)) {
    if (countySeatKeys.length >= seatQuota) break;
    if (!FarEnough(lattice, entry.key, countySeatKeys, 6)) continue;
    countySeatKeys.push(entry.key);
  }
  // 若丘陵候选不足，用平原候选补满。
  for (const entry of TopByScore(plainSeatCandidates, plainSeatCandidates.length)) {
    if (countySeatKeys.length >= seatQuota) break;
    if (countySeatKeys.includes(entry.key)) continue;
    if (!FarEnough(lattice, entry.key, countySeatKeys, 5)) continue;
    countySeatKeys.push(entry.key);
  }
  countySeatKeys.sort((a, b) => lattice.cells[a].row - lattice.cells[b].row || (a < b ? -1 : 1));
  const PickName = (pool) => {
    for (let attempt = 0; attempt < pool.length * 2; attempt += 1) {
      const name = pool[Math.floor(nameRng() * pool.length) % pool.length];
      if (!usedNames.has(name)) {
        usedNames.add(name);
        return name;
      }
    }
    return pool[Math.floor(nameRng() * pool.length) % pool.length];
  };
  for (const key of countySeatKeys) {
    feature[key] = "CountySeat";
    siteNames[key] = PickName(countyNames);
  }

  // 9.2 集镇：交通与集市的节点，离县城和彼此都要有距离。
  const townQuota = Math.max(
    config.townMin,
    Math.min(config.townMax, config.townMin + Math.floor(rng() * (config.townMax - config.townMin + 1))),
  );
  const townCandidates = [];
  for (const key of lattice.order) {
    if (!IsLand(key) || feature[key]) continue;
    const kind = terrain[key];
    if (kind === "Mountain" || kind === "Gorge") continue;
    const water = Math.exp(-(riverInfo.riverDistance[key] ?? 9) / 2);
    townCandidates.push({ key, score: SettlementScore(key) + water * 0.3 + rng() * 0.15 });
  }
  for (const entry of TopByScore(townCandidates, townCandidates.length)) {
    if (townKeys.length >= townQuota) break;
    if (!FarEnough(lattice, entry.key, townKeys, 4)) continue;
    if (!FarEnough(lattice, entry.key, countySeatKeys, 4)) continue;
    townKeys.push(entry.key);
  }
  for (const key of townKeys) {
    feature[key] = "Town";
    siteNames[key] = PickName(townNames);
  }

  const MakeVillageName = () => {
    for (let attempt = 0; attempt < 24; attempt += 1) {
      const prefix = villagePrefixes[Math.floor(nameRng() * villagePrefixes.length)];
      const suffix = villageSuffixes[Math.floor(nameRng() * villageSuffixes.length)];
      const name = prefix + suffix;
      if (!usedNames.has(name)) {
        usedNames.add(name);
        return name;
      }
    }
    const fallback = `${villagePrefixes[Math.floor(nameRng() * villagePrefixes.length)]}家庄`;
    return fallback;
  };

  const PlaceVillage = (key) => {
    feature[key] = "Village";
    siteNames[key] = MakeVillageName();
    villageKeys.push(key);
  };

  // 9.3 腹心盆地：先在 1–2 环上预置一簇村庄，这是玩家最初的依托。
  const basinCandidates = [];
  for (const radius of [1, 2]) {
    for (const key of KeysInRing(lattice, homeBasinKey, radius)) {
      if (!IsLand(key) || feature[key]) continue;
      basinCandidates.push({ key, score: SettlementScore(key) + (radius === 1 ? 0.25 : 0) + rng() * 0.1 });
    }
  }
  for (const entry of TopByScore(basinCandidates, basinCandidates.length)) {
    if (villageKeys.length >= config.homeVillageTarget) break;
    if (!FarEnough(lattice, entry.key, villageKeys, 2)) continue;
    PlaceVillage(entry.key);
  }
  // 万一间距过严导致不足，放宽到"不重叠即可"，保证起始点周围有 4 个以上村庄。
  if (villageKeys.length < config.homeVillageTarget) {
    for (const entry of TopByScore(basinCandidates, basinCandidates.length)) {
      if (villageKeys.length >= config.homeVillageTarget) break;
      if (feature[entry.key]) continue;
      PlaceVillage(entry.key);
    }
  }

  // 9.4 全图村庄：按地形给不同的成村概率，平原密、山地疏。
  const villageChanceByTerrain = {
    Plain: 0.6,
    Loess: 0.46,
    Hill: 0.36,
    Forest: 0.2,
    Marsh: 0.16,
    Ridge: 0.13,
    Mountain: 0.05,
    Gorge: 0.04,
    River: 0,
  };
  const villageQuota = Math.round(cellCount * config.villageShare);
  const villageCandidates = [];
  for (const key of lattice.order) {
    if (!IsLand(key) || feature[key]) continue;
    villageCandidates.push({ key, score: SettlementScore(key) + rng() * 0.22 });
  }
  for (const entry of TopByScore(villageCandidates, villageCandidates.length)) {
    if (villageKeys.length >= villageQuota) break;
    const key = entry.key;
    if (feature[key]) continue;
    if (!FarEnough(lattice, key, villageKeys, 2)) continue;
    if (!FarEnough(lattice, key, townKeys, 2)) continue;
    if (!FarEnough(lattice, key, countySeatKeys, 2)) continue;
    const chance = (villageChanceByTerrain[terrain[key]] ?? 0.1) * (0.5 + fertility[key] * 1.1);
    if (rng() > chance) continue;
    PlaceVillage(key);
  }

  // 9.5 渡口：河道上能徒涉的地方，两岸都要有落脚处。
  const fordKeys = [];
  const fordCandidates = [];
  for (const river of riverInfo.rivers) {
    for (let index = 1; index < river.path.length - 1; index += 1) {
      const key = river.path[index];
      if (feature[key]) continue;
      let landNeighbors = 0;
      for (const neighbor of lattice.neighbors[key]) {
        if (terrain[neighbor] !== "River") landNeighbors += 1;
      }
      if (landNeighbors < 3) continue;
      const score =
        (1 - elevation[key]) * 0.7 +
        landNeighbors * 0.16 +
        (1 - Clamp01((relief[key] ?? 0) / 0.15)) * 0.4 +
        rng() * 0.15;
      fordCandidates.push({ key, score });
    }
  }
  const fordQuota = Clamp(Math.round(riverInfo.rivers.length * 1.6), 3, 8);
  for (const entry of TopByScore(fordCandidates, fordCandidates.length)) {
    if (fordKeys.length >= fordQuota) break;
    if (!FarEnough(lattice, entry.key, fordKeys, 3)) continue;
    feature[entry.key] = "Ford";
    fordKeys.push(entry.key);
  }

  // 9.6 隘口：山梁上的鞍部，两侧高、中间低，是山里山外唯一的通道。
  const passKeys = [];
  const passCandidates = [];
  for (const key of lattice.order) {
    if (feature[key]) continue;
    const kind = terrain[key];
    if (kind !== "Mountain" && kind !== "Ridge" && kind !== "Gorge") continue;
    let higher = 0;
    let lower = 0;
    for (const neighbor of lattice.neighbors[key]) {
      if (elevation[neighbor] > elevation[key] + 0.05) higher += 1;
      if (elevation[neighbor] < elevation[key] - 0.05) lower += 1;
    }
    if (higher < 2 || lower < 1) continue;
    passCandidates.push({ key, score: higher * 0.5 + lower * 0.25 - elevation[key] * 0.4 + rng() * 0.2 });
  }
  const passQuota = Clamp(Math.round(lattice.height / 5), 3, 6);
  for (const entry of TopByScore(passCandidates, passCandidates.length)) {
    if (passKeys.length >= passQuota) break;
    if (!FarEnough(lattice, entry.key, passKeys, 4)) continue;
    feature[entry.key] = "Pass";
    passKeys.push(entry.key);
  }

  // 9.7 乡土地物：古庙、梯田、果林、石场、盐滩。
  const minorKeys = { Shrine: [], Terrace: [], Grove: [], Quarry: [], SaltPan: [] };

  const NearAnySettlement = (key, radius) => {
    for (const other of KeysInRange(lattice, key, radius)) {
      const kind = feature[other];
      if (kind === "Village" || kind === "Town" || kind === "CountySeat") return true;
    }
    return false;
  };

  const minorPlans = [
    {
      kind: "Shrine",
      quota: Clamp(Math.round(cellCount * 0.006), 2, 4),
      spacing: 6,
      accept: (key) => ["Mountain", "Ridge", "Forest", "Hill", "Gorge"].includes(terrain[key]),
      score: (key) => elevation[key] * 0.6 + (NearAnySettlement(key, 3) ? 0.6 : 0) + rng() * 0.3,
    },
    {
      kind: "Terrace",
      quota: Clamp(Math.round(cellCount * 0.018), 5, 14),
      spacing: 2,
      accept: (key) => ["Hill", "Loess", "Ridge"].includes(terrain[key]) && NearAnySettlement(key, 2),
      score: (key) => fertility[key] * 0.8 + (1 - Clamp01((relief[key] ?? 0) / 0.15)) * 0.4 + rng() * 0.25,
    },
    {
      kind: "Grove",
      quota: Clamp(Math.round(cellCount * 0.018), 5, 14),
      spacing: 2,
      accept: (key) =>
        ["Forest", "Hill", "Loess", "Plain"].includes(terrain[key]) && NearAnySettlement(key, 2),
      score: (key) => moisture[key] * 0.7 + fertility[key] * 0.4 + rng() * 0.25,
    },
    {
      kind: "Quarry",
      quota: Clamp(Math.round(cellCount * 0.007), 2, 5),
      spacing: 5,
      accept: (key) => ["Mountain", "Ridge", "Gorge"].includes(terrain[key]),
      score: (key) => (NearAnySettlement(key, 3) ? 0.8 : 0) + elevation[key] * 0.4 + rng() * 0.3,
    },
    {
      kind: "SaltPan",
      quota: Clamp(Math.round(cellCount * 0.006), 1, 4),
      spacing: 4,
      accept: (key) =>
        (terrain[key] === "Marsh" || terrain[key] === "Plain") &&
        elevation[key] < 0.26 &&
        lattice.cells[key].u > 0.5,
      score: (key) => moisture[key] * 0.9 + (1 - elevation[key]) * 0.6 + rng() * 0.25,
    },
  ];

  for (const plan of minorPlans) {
    const candidates = [];
    for (const key of lattice.order) {
      if (feature[key]) continue;
      if (!plan.accept(key)) continue;
      candidates.push({ key, score: plan.score(key) });
    }
    for (const entry of TopByScore(candidates, candidates.length)) {
      if (minorKeys[plan.kind].length >= plan.quota) break;
      if (!FarEnough(lattice, entry.key, minorKeys[plan.kind], plan.spacing)) continue;
      feature[entry.key] = plan.kind;
      minorKeys[plan.kind].push(entry.key);
    }
  }

  // 9.8 兜底：保证 10 种地物每种至少出现一次（放宽条件再挑一次）。
  const fallbackPlans = {
    Shrine: (key) => elevation[key] > 0.4 && terrain[key] !== "River",
    Terrace: (key) => elevation[key] > 0.3 && terrain[key] !== "River",
    Grove: (key) => terrain[key] !== "River" && moisture[key] > 0.35,
    Quarry: (key) => elevation[key] > 0.5 && terrain[key] !== "River",
    SaltPan: (key) => terrain[key] !== "River" && elevation[key] < 0.35,
    Ford: (key) => terrain[key] === "River",
    Pass: (key) => elevation[key] > 0.55 && terrain[key] !== "River",
  };
  for (const kind of Object.keys(fallbackPlans)) {
    const already = lattice.order.some((key) => feature[key] === kind);
    if (already) continue;
    const candidates = [];
    for (const key of lattice.order) {
      if (feature[key]) continue;
      if (!fallbackPlans[kind](key)) continue;
      candidates.push({ key, score: fertility[key] + rng() * 0.2 });
    }
    const picked = TopByScore(candidates, 1);
    if (picked.length > 0) {
      feature[picked[0].key] = kind;
      if (kind === "Ford") fordKeys.push(picked[0].key);
      if (kind === "Pass") passKeys.push(picked[0].key);
      if (minorKeys[kind]) minorKeys[kind].push(picked[0].key);
    }
  }

  // 解除腹心盆地正中的占位。
  if (feature[homeBasinKey] === reservedMark) feature[homeBasinKey] = null;

  return {
    feature,
    siteNames,
    villageKeys,
    townKeys,
    countySeatKeys,
    fordKeys,
    passKeys,
    minorKeys,
  };
}

/**
 * 保证起始点 1–2 环内至少有 target 座村庄。
 * 山间盆地本来就该是村落成簇的地方，缺了就补——玩家的立足点不该看运气。
 */
export function EnsureHomeVillages(lattice, terrain, settlements, centerKey, target = 4) {
  const { feature, villageKeys, siteNames } = settlements;
  const ring = [...KeysInRing(lattice, centerKey, 1), ...KeysInRing(lattice, centerKey, 2)];
  let count = 0;
  for (const key of ring) if (feature[key] === "Village") count += 1;
  if (count >= target) return count;

  const replaceable = new Set([null, "Terrace", "Grove", "Shrine", "Quarry", "SaltPan"]);
  const candidates = [];
  for (const key of ring) {
    if (terrain[key] === "River") continue;
    if (!replaceable.has(feature[key])) continue;
    candidates.push({ key, score: (feature[key] === null ? 1 : 0) + (terrain[key] === "Hill" ? 0.4 : 0) });
  }
  for (const entry of TopByScore(candidates, candidates.length)) {
    if (count >= target) break;
    feature[entry.key] = "Village";
    if (!siteNames[entry.key]) {
      siteNames[entry.key] = `${villagePrefixes[(villageKeys.length * 7) % villagePrefixes.length]}家庄`;
    }
    villageKeys.push(entry.key);
    count += 1;
  }
  return count;
}

// ---------------------------------------------------------------------------
// 10. 铁路：囚笼的骨架
// ---------------------------------------------------------------------------

/**
 * 干线沿东部平原南北纵贯，穿过平原上的县城；
 * 支线自干线中段向西切入丘陵，终点是山口一侧的县城（正太、白晋一类的山地铁路）。
 * 铁路格是破袭战的首要目标：hex.railway = true。
 */
export function LayRailways(lattice, elevation, terrain, settlements, riverInfo, seed) {
  const rng = CreateRng(DeriveSeed(seed, "railway"));
  const { width, height, cells } = lattice;

  const railTerrainCost = {
    Plain: 1,
    Loess: 1.6,
    Marsh: 4.5,
    River: 3.2,
    Hill: 3.4,
    Forest: 2.8,
    Ridge: 7.5,
    Mountain: 13,
    Gorge: 8,
  };

  const trunkColumn = Clamp(Math.round(width * 0.82), width - 6, width - 2);
  const trunkU = width > 1 ? trunkColumn / (width - 1) : 0;

  const TrunkCost = (toKey, fromKey) => {
    const cell = cells[toKey];
    const base = railTerrainCost[terrain[toKey]] ?? 3;
    const slope = Math.abs(elevation[toKey] - elevation[fromKey]) * 26;
    const corridor = Math.abs(cell.u - trunkU) * 22;
    return base + slope + corridor + 0.4;
  };

  // 干线途经点：北边界 → 走廊内的平原县城（自北向南） → 南边界。
  // 只把落在走廊里的县城当途经点，否则干线会为了穿城而向西甩出一个大弯。
  const plainSeats = settlements.countySeatKeys
    .filter((key) => Math.abs(cells[key].u - trunkU) <= 0.2)
    .sort((a, b) => cells[a].row - cells[b].row || (a < b ? -1 : 1));
  const northColumn = Clamp(trunkColumn + (rng() < 0.5 ? -1 : 1), width - 6, width - 2);
  const southColumn = Clamp(trunkColumn + (rng() < 0.5 ? -1 : 1), width - 6, width - 2);
  const waypoints = [LatticeKeyAt(northColumn, 0), ...plainSeats, LatticeKeyAt(southColumn, height - 1)];

  const trunkKeys = [];
  for (let index = 0; index < waypoints.length - 1; index += 1) {
    const path = FindPath(lattice, waypoints[index], waypoints[index + 1], TrunkCost, { minStepCost: 0.9 });
    if (!path) continue;
    for (const key of path) {
      if (trunkKeys.length === 0 || trunkKeys[trunkKeys.length - 1] !== key) trunkKeys.push(key);
    }
  }
  const railwaySet = new Set(trunkKeys);

  // 支线：从干线上离山地县城最近的一格向西切入丘陵。
  // 支线终点偏好"既靠西又靠中"的县城：这样支线才是拦腰切进根据地的那一刀。
  const hillSeats = TopByScore(
    settlements.countySeatKeys
      .filter((key) => cells[key].u < 0.62)
      .map((key) => ({ key, score: (1 - cells[key].u) * 1.2 + (1 - Math.abs(cells[key].v - 0.5) * 2) * 0.7 })),
    99,
  ).map((entry) => entry.key);
  let branchTarget = hillSeats.length > 0 ? hillSeats[0] : null;
  if (!branchTarget) {
    // 没有山地县城就挑一个丘陵集镇作为支线终点。
    const candidates = settlements.townKeys
      .filter((key) => cells[key].u < 0.55)
      .map((key) => ({ key, score: 1 - cells[key].u }));
    const picked = TopByScore(candidates, 1);
    branchTarget = picked.length > 0 ? picked[0].key : null;
  }

  const BranchCost = (toKey, fromKey) => {
    const base = railTerrainCost[terrain[toKey]] ?? 3;
    const slope = Math.abs(elevation[toKey] - elevation[fromKey]) * 30;
    // 山地铁路一律沿河谷走，这也正是破袭战最爱的地形。
    const valley = (riverInfo.riverDistance[toKey] ?? 9) <= 1 ? -0.8 : 0;
    return base + slope + valley + 0.6;
  };

  let branchKeys = [];
  let junctionKey = null;
  if (branchTarget && trunkKeys.length > 0) {
    const targetCell = cells[branchTarget];
    let best = trunkKeys[0];
    let bestDistance = Infinity;
    for (const key of trunkKeys) {
      const distance = HexDistance(cells[key], targetCell);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = key;
      }
    }
    junctionKey = best;
    const path = FindPath(lattice, junctionKey, branchTarget, BranchCost, { minStepCost: 0.9 });
    if (path) {
      branchKeys = path;
      for (const key of path) railwaySet.add(key);
    }
  }

  // 车站：干线每 4 格一座，加上枢纽、终点与穿城处。
  const stationKeys = [];
  const PushStation = (key) => {
    if (key && !stationKeys.includes(key)) stationKeys.push(key);
  };
  for (let index = 2; index < trunkKeys.length - 1; index += 4) PushStation(trunkKeys[index]);
  for (const key of trunkKeys) {
    const kind = settlements.feature[key];
    if (kind === "CountySeat" || kind === "Town") PushStation(key);
  }
  PushStation(junctionKey);
  if (branchKeys.length > 3) {
    PushStation(branchKeys[Math.floor(branchKeys.length / 2)]);
    PushStation(branchKeys[branchKeys.length - 1]);
  }

  const railwayKeys = lattice.order.filter((key) => railwaySet.has(key));
  return { railwayKeys, railwaySet, trunkKeys, branchKeys, stationKeys, junctionKey, trunkColumn };
}

// ---------------------------------------------------------------------------
// 11. 公路与土路：把根据地切成一块一块
// ---------------------------------------------------------------------------

/**
 * 公路（road = 2）把县城与车站串成网，这是"囚笼政策"的铁丝；
 * 土路（road = 1）把集镇与村庄接上公路网。
 * 道路穿河处自动成为渡口。
 */
export function LayRoads(lattice, elevation, terrain, settlements, railInfo, seed) {
  const rng = CreateRng(DeriveSeed(seed, "roads"));
  const { cells } = lattice;
  const road = Object.create(null);
  for (const key of lattice.order) road[key] = 0;

  const feature = settlements.feature;

  const BaseCost = (key, fromKey) => {
    const definition = terrainDefinitions[terrain[key]];
    let cost = definition ? definition.moveCost : 2;
    if (terrain[key] === "River") cost = feature[key] === "Ford" ? 1.5 : 9;
    if (terrain[key] === "Marsh") cost += 2;
    cost += Math.abs(elevation[key] - elevation[fromKey]) * 16;
    if (road[key] >= 1) cost *= 0.35; // 已有路就并线，形成路网而不是放射线
    if (railInfo.railwaySet.has(key)) cost *= 0.8;
    if (feature[key] === "Village" || feature[key] === "Town") cost *= 0.75;
    return cost;
  };

  const ApplyRoad = (path, level) => {
    for (const key of path) {
      if (road[key] < level) road[key] = level;
      if (terrain[key] === "River" && !feature[key]) {
        feature[key] = "Ford";
        if (!settlements.fordKeys.includes(key)) settlements.fordKeys.push(key);
      }
    }
  };

  // 11.1 公路骨架：县城之间用最小生成树连起来，再补两条弦形成环形封锁。
  const nodes = [...settlements.countySeatKeys];
  for (const key of railInfo.stationKeys) if (!nodes.includes(key)) nodes.push(key);
  const highwayKeys = [];
  if (nodes.length >= 2) {
    const connected = [nodes[0]];
    const remaining = nodes.slice(1);
    while (remaining.length > 0) {
      let bestFrom = null;
      let bestTo = null;
      let bestDistance = Infinity;
      for (const from of connected) {
        for (const to of remaining) {
          const distance = HexDistance(cells[from], cells[to]);
          if (distance < bestDistance) {
            bestDistance = distance;
            bestFrom = from;
            bestTo = to;
          }
        }
      }
      if (!bestFrom || !bestTo) break;
      const path = FindPath(lattice, bestFrom, bestTo, BaseCost, { minStepCost: 0.08 });
      if (path) {
        ApplyRoad(path, 2);
        for (const key of path) if (!highwayKeys.includes(key)) highwayKeys.push(key);
      }
      connected.push(bestTo);
      remaining.splice(remaining.indexOf(bestTo), 1);
    }
    // 补弦：县城之间再连两条，形成"分割包围"的环。
    const seats = settlements.countySeatKeys;
    for (let index = 0; index + 2 < seats.length; index += 1) {
      if (rng() > 0.85) continue;
      const path = FindPath(lattice, seats[index], seats[index + 2], BaseCost, { minStepCost: 0.08 });
      if (path) {
        ApplyRoad(path, 2);
        for (const key of path) if (!highwayKeys.includes(key)) highwayKeys.push(key);
      }
    }
  }

  // 11.2 土路：集镇 → 公路网；村庄 → 最近的路/镇（超过一定长度就不修，山村本就闭塞）。
  const networkKeys = new Set();
  for (const key of lattice.order) if (road[key] >= 1) networkKeys.add(key);
  for (const key of settlements.countySeatKeys) networkKeys.add(key);
  for (const key of railInfo.stationKeys) networkKeys.add(key);

  const trailKeys = [];
  const ConnectToNetwork = (fromKey, maxCost) => {
    if (networkKeys.has(fromKey)) return;
    const path = FindPathToAny(lattice, fromKey, networkKeys, BaseCost, maxCost);
    if (!path) return;
    ApplyRoad(path, 1);
    for (const key of path) {
      networkKeys.add(key);
      if (!trailKeys.includes(key)) trailKeys.push(key);
    }
  };

  for (const key of settlements.townKeys) ConnectToNetwork(key, 24);
  // 平原上的村子先接进路网；山村本就闭塞，只有近的才修得起大车道，
  // 这层"山里没有路"正是根据地能站住脚的物质条件之一。
  const roughTerrain = new Set(["Mountain", "Ridge", "Gorge"]);
  const orderedVillages = settlements.villageKeys
    .slice()
    .sort((a, b) => cells[b].u - cells[a].u || (a < b ? -1 : 1));
  for (const key of orderedVillages) {
    ConnectToNetwork(key, roughTerrain.has(terrain[key]) ? 5 : 9);
  }

  return { road, highwayKeys, trailKeys };
}

// ---------------------------------------------------------------------------
// 12. 敌军据点
// ---------------------------------------------------------------------------

/**
 * 据点分四类：县城驻军（CountySeat）、铁路车站（RailStation）、
 * 集镇守备队（Garrison）、公路与渡口隘口上的炮楼（Blockhouse）。
 * 炮楼沿公路每三四格一座——这就是"囚笼"的钉子。
 */
export function PlaceStrongholds(lattice, terrain, settlements, railInfo, roadInfo, homeBasinKey, seed) {
  const rng = CreateRng(DeriveSeed(seed, "strongholds"));
  const { cells } = lattice;
  const seeds = [];
  const taken = new Set();

  // era 标记该据点在史实上大致何时立起来：县城、车站、守备队开局就有，
  // 炮楼是 1941 年前后"囚笼政策"才沿路密布的，交给 Rules / Ai 按时期启用。
  // 深山里的据点补给线长、运一趟粮要走两天，supply 相应打折——这是"挤敌人"的着力点。
  const remoteTerrain = new Set(["Mountain", "Ridge", "Gorge", "Marsh"]);
  const Push = (key, type, garrison, supply, era) => {
    if (!key || taken.has(key)) return;
    taken.add(key);
    seeds.push({
      key,
      type,
      garrison,
      supply: Math.round(supply * (remoteTerrain.has(terrain[key]) ? 0.6 : 1)),
      alarm: 0,
      era,
      name: settlements.siteNames[key] || null,
    });
  };

  for (const key of settlements.countySeatKeys) {
    Push(key, "CountySeat", 4 + Math.floor(rng() * 2), 100, "Opening");
  }
  for (const key of railInfo.stationKeys) {
    Push(key, "RailStation", 2 + Math.floor(rng() * 2), 80, "Opening");
  }
  // 集镇守备队：优先挑靠近公路与铁路的集镇。
  const townScores = settlements.townKeys.map((key) => {
    let score = rng() * 0.3;
    if (roadInfo.road[key] >= 2) score += 1;
    if (railInfo.railwaySet.has(key)) score += 0.8;
    score += cells[key].u * 0.7;
    return { key, score };
  });
  const garrisonQuota = Clamp(Math.round(settlements.townKeys.length * 0.7), 3, 7);
  for (const entry of TopByScore(townScores, garrisonQuota)) {
    Push(entry.key, "Garrison", 2 + Math.floor(rng() * 2), 60, "Opening");
  }

  // 炮楼：沿公路每 3–4 格一座，另外把守渡口与隘口。
  const highway = roadInfo.highwayKeys.filter((key) => roadInfo.road[key] >= 2);
  const ordered = highway.slice().sort((a, b) => {
    const cellA = cells[a];
    const cellB = cells[b];
    return cellA.row - cellB.row || cellA.col - cellB.col;
  });
  const blockhouses = [];
  for (const key of ordered) {
    if (taken.has(key)) continue;
    if (!FarEnough(lattice, key, blockhouses, 3)) continue;
    if (!FarEnough(lattice, key, [...taken], 2)) continue;
    blockhouses.push(key);
    Push(key, "Blockhouse", 1 + Math.floor(rng() * 2), 40, "Growth");
  }
  // 咽喉：渡口与隘口，靠近敌人一侧的先修。
  const chokepoints = [...settlements.fordKeys, ...settlements.passKeys]
    .filter((key) => !taken.has(key))
    .map((key) => ({ key, score: cells[key].u * 1.2 + rng() * 0.4 }));
  const chokeQuota = Clamp(Math.round(chokepoints.length * 0.45), 2, 6);
  let chokeCount = 0;
  for (const entry of TopByScore(chokepoints, chokepoints.length)) {
    if (chokeCount >= chokeQuota) break;
    if (HexDistance(cells[entry.key], cells[homeBasinKey]) < 3) continue;
    if (!FarEnough(lattice, entry.key, blockhouses, 3)) continue;
    blockhouses.push(entry.key);
    Push(entry.key, "Blockhouse", 1 + Math.floor(rng() * 2), 35, "Hardship");
    chokeCount += 1;
  }

  seeds.sort((a, b) => {
    const cellA = cells[a.key];
    const cellB = cells[b.key];
    return cellA.col - cellB.col || cellA.row - cellB.row;
  });
  return seeds;
}

/** 敌军压力场：据点强度按距离衰减叠加，再加上铁路公路的加成。 */
export function ComputeEnemyPressure(lattice, strongholdSeeds, railInfo, roadInfo) {
  const pressure = Object.create(null);
  for (const key of lattice.order) pressure[key] = 0;
  const weightByType = { CountySeat: 1.5, Garrison: 0.95, RailStation: 0.8, Blockhouse: 0.6 };
  for (const seed of strongholdSeeds) {
    const weight = weightByType[seed.type] ?? 0.6;
    const radius = seed.type === "CountySeat" ? 5 : 4;
    for (const key of KeysInRange(lattice, seed.key, radius)) {
      const distance = HexDistance(lattice.cells[key], lattice.cells[seed.key]);
      pressure[key] += weight * Math.exp(-distance / 2.1);
    }
  }
  for (const key of lattice.order) {
    if (railInfo.railwaySet.has(key)) pressure[key] += 0.45;
    if (roadInfo.road[key] === 2) pressure[key] += 0.3;
    else if (roadInfo.road[key] === 1) pressure[key] += 0.08;
  }
  return pressure;
}

// ---------------------------------------------------------------------------
// 13. 起始点
// ---------------------------------------------------------------------------

/** 起始点必须在山区/丘陵，且 1–2 环内有 4 座以上村庄，离敌人据点不能太近。 */
export function ChooseStart(lattice, elevation, terrain, settlements, pressure, homeBasinKey) {
  const allowed = new Set(["Hill", "Ridge", "Mountain", "Forest"]);
  const CountVillages = (key) => {
    let count = 0;
    for (const radius of [1, 2]) {
      for (const other of KeysInRing(lattice, key, radius)) {
        if (settlements.feature[other] === "Village") count += 1;
      }
    }
    return count;
  };

  const candidates = [];
  for (const key of KeysInRange(lattice, homeBasinKey, 2)) {
    if (!allowed.has(terrain[key])) continue;
    if (elevation[key] < 0.4) continue;
    if (settlements.feature[key] === "CountySeat" || settlements.feature[key] === "Town") continue;
    const villages = CountVillages(key);
    if (villages < 4) continue;
    candidates.push({
      key,
      score:
        villages * 0.5 +
        HexConcealment(terrain[key], settlements.feature[key]) * 1.2 -
        pressure[key] * 1.5 -
        HexDistance(lattice.cells[key], lattice.cells[homeBasinKey]) * 0.3,
    });
  }
  if (candidates.length > 0) return TopByScore(candidates, 1)[0].key;

  // 兜底：全图找一个满足"山区 + 4 村"的最优格。
  const wide = [];
  for (const key of lattice.order) {
    if (!allowed.has(terrain[key])) continue;
    if (elevation[key] < 0.4) continue;
    const villages = CountVillages(key);
    if (villages < 4) continue;
    wide.push({ key, score: villages * 0.5 - pressure[key] * 1.5 });
  }
  if (wide.length > 0) return TopByScore(wide, 1)[0].key;
  return homeBasinKey;
}

// ---------------------------------------------------------------------------
// 14. 政权归属与群众基础
// ---------------------------------------------------------------------------

/**
 * 划分初始政权归属。1937 年秋的实情是：敌人只占得住城镇与交通线，
 * 广大乡村是"两面政权"的游击区——根据地不是天生的，是要一寸一寸开辟出来的。
 * 因此全图默认游击区，基本区只有腹心盆地周围的那么几个村。
 */
export function AssignControl(lattice, terrain, settlements, pressure, homeBasinKey, startKey) {
  const control = Object.create(null);
  const basinCell = lattice.cells[homeBasinKey];
  // 敌人上不去的地形（高山、峡谷、苇塘），只要压力接近于零，即使离腹心远一些也算基本区。
  const unreachable = new Set(["Mountain", "Gorge", "Marsh"]);
  for (const key of lattice.order) {
    const value = pressure[key];
    const distance = HexDistance(lattice.cells[key], basinCell);
    let kind = "Contested";
    if (value >= 1.1) kind = "Enemy";
    else if (value < 0.35 && distance <= 3) kind = "Guerrilla";
    else if (value < 0.15 && distance <= 6 && unreachable.has(terrain[key])) kind = "Guerrilla";
    const featureKind = settlements.feature[key];
    if (featureKind === "CountySeat") kind = "Enemy";
    control[key] = kind;
  }
  for (const key of KeysInRange(lattice, homeBasinKey, 1)) {
    if (control[key] !== "Enemy") control[key] = "Guerrilla";
  }
  control[startKey] = "Base";
  return control;
}

/** 群众基础 0..100：山区群众动员空间大，敌人据点近则被压低。 */
export function ComputeMassBase(lattice, terrain, settlements, control, pressure, homeBasinKey, seed) {
  const seedMass = DeriveSeed(seed, "mass");
  const massBase = Object.create(null);
  const controlBonus = { Enemy: -12, Contested: 0, Guerrilla: 9, Base: 15 };
  for (const key of lattice.order) {
    const cell = lattice.cells[key];
    const terrainDefinition = terrainDefinitions[terrain[key]];
    const featureDefinition = settlements.feature[key] ? featureDefinitions[settlements.feature[key]] : null;
    const noise = FractalNoise2D(cell.u * 6.1, cell.v * 6.1, { seed: seedMass, octaves: 3 });
    let value = 38;
    value += terrainDefinition ? terrainDefinition.massBaseBias : 0;
    value += featureDefinition ? featureDefinition.massBaseBonus : 0;
    value += controlBonus[control[key]] ?? 0;
    // 敌军压力封顶：炮楼再密，群众也不会变成负数——只是不敢公开而已。
    value -= Math.min(pressure[key], 2) * 7;
    value += (noise - 0.5) * 14;
    const distanceToBasin = HexDistance(cell, lattice.cells[homeBasinKey]);
    value += 13 * Math.exp(-distanceToBasin / 3.5);
    massBase[key] = Math.round(Clamp(value, 5, 88));
  }
  return massBase;
}

// ---------------------------------------------------------------------------
// 15. 战略分区
// ---------------------------------------------------------------------------

const regionBlueprints = Object.freeze({
  WestMountains: {
    name: "西部山地",
    shortName: "山地",
    kind: "Mountain",
    blurb: "太行主脊与深谷。粮少人稀，却是全局的屋脊：守住山，就守住了退路与后方医院。",
  },
  CentralHills: {
    name: "中部丘陵",
    shortName: "丘陵",
    kind: "Hill",
    blurb: "梯田、黄土与山口。根据地的腹心与人力都在这里，也是敌人蚕食推进的主要方向。",
  },
  EastPlain: {
    name: "东部平原",
    shortName: "平原",
    kind: "Plain",
    blurb: "产粮最多、藏人最难。夏天靠青纱帐，冬天靠地道，平原上的斗争全靠群众掩护。",
  },
  RailCorridor: {
    name: "铁路走廊",
    shortName: "铁路",
    kind: "Corridor",
    blurb: "路基、车站、护路沟与炮楼串成一条线。这是敌人的动脉，也是破袭战的首要目标。",
  },
  HomeBasin: {
    name: "腹心盆地",
    shortName: "腹心",
    kind: "Basin",
    blurb: "群山环抱的山间盆地，机关、被服厂与后方医院的落脚处。丢了这里，全区都要重新开始。",
  },
  RiverValley: {
    name: "河谷走廊",
    shortName: "河谷",
    kind: "Valley",
    blurb: "河谷是通道也是障碍：渡口决定了两岸能不能互相支援，汛期一到，谁也过不去。",
  },
});

/** 把地图切成有名字的战略区，供 AI 选择扫荡轴线、供 UI 报地名。 */
export function BuildRegions(lattice, elevation, terrain, settlements, railInfo, riverInfo, homeBasinKey) {
  const assignment = Object.create(null);
  for (const key of lattice.order) {
    const value = elevation[key];
    if (value >= 0.58) assignment[key] = "WestMountains";
    else if (value >= 0.3) assignment[key] = "CentralHills";
    else assignment[key] = "EastPlain";
  }
  for (const key of lattice.order) {
    if (!railInfo.railwaySet.has(key)) continue;
    assignment[key] = "RailCorridor";
    for (const neighbor of lattice.neighbors[key]) assignment[neighbor] = "RailCorridor";
  }
  for (const key of KeysInRange(lattice, homeBasinKey, 2)) {
    if (assignment[key] === "RailCorridor") continue;
    assignment[key] = "HomeBasin";
  }

  // 河谷走廊是叠加区（不参与划分）：河道本身加上两岸的谷底，崖顶不算。
  const overlays = Object.create(null);
  overlays.RiverValley = [];
  for (const key of lattice.order) {
    const distance = riverInfo.riverDistance[key] ?? 9;
    if (distance === 0 || (distance === 1 && elevation[key] < 0.52)) overlays.RiverValley.push(key);
  }

  const buckets = Object.create(null);
  for (const key of lattice.order) {
    const id = assignment[key];
    if (!buckets[id]) buckets[id] = [];
    buckets[id].push(key);
  }

  const regions = [];
  const MakeRegion = (id, hexKeys, exclusive) => {
    if (!hexKeys || hexKeys.length === 0) return;
    const blueprint = regionBlueprints[id];
    let colSum = 0;
    let rowSum = 0;
    const terrainMix = Object.create(null);
    let villageCount = 0;
    for (const key of hexKeys) {
      const cell = lattice.cells[key];
      colSum += cell.col;
      rowSum += cell.row;
      terrainMix[terrain[key]] = (terrainMix[terrain[key]] ?? 0) + 1;
      if (settlements.feature[key] === "Village") villageCount += 1;
    }
    const centerCol = colSum / hexKeys.length;
    const centerRow = rowSum / hexKeys.length;
    let centerKey = hexKeys[0];
    let bestDistance = Infinity;
    for (const key of hexKeys) {
      const cell = lattice.cells[key];
      const distance = (cell.col - centerCol) ** 2 + (cell.row - centerRow) ** 2;
      if (distance < bestDistance) {
        bestDistance = distance;
        centerKey = key;
      }
    }
    let elevationSum = 0;
    for (const key of hexKeys) elevationSum += elevation[key];
    regions.push({
      id,
      key: id,
      name: blueprint.name,
      shortName: blueprint.shortName,
      kind: blueprint.kind,
      exclusive,
      hexKeys,
      centerKey,
      size: hexKeys.length,
      averageElevation: Number((elevationSum / hexKeys.length).toFixed(3)),
      terrainMix,
      villageCount,
      blurb: blueprint.blurb,
    });
  };

  for (const id of ["WestMountains", "CentralHills", "EastPlain", "RailCorridor", "HomeBasin"]) {
    MakeRegion(id, buckets[id], true);
  }
  MakeRegion("RiverValley", overlays.RiverValley, false);

  return { regions, assignment };
}

// ---------------------------------------------------------------------------
// 16. 组装 Hex
// ---------------------------------------------------------------------------

function AssembleHexes(lattice, layers) {
  const {
    elevation,
    moisture,
    terrain,
    settlements,
    railInfo,
    roadInfo,
    control,
    massBase,
    regionAssignment,
    riverInfo,
    fertility,
    relief,
    startKey,
  } = layers;

  const exploredSet = new Set(KeysInRange(lattice, startKey, 3));
  const hexes = {};
  for (const key of lattice.order) {
    const cell = lattice.cells[key];
    const featureKind = settlements.feature[key];
    const intelSeed = exploredSet.has(key)
      ? Math.round(40 * Math.exp(-HexDistance(cell, lattice.cells[startKey]) / 2.4))
      : 0;
    hexes[key] = {
      q: cell.q,
      r: cell.r,
      key,
      col: cell.col,
      row: cell.row,
      terrain: terrain[key],
      feature: featureKind,
      road: roadInfo.road[key],
      railway: railInfo.railwaySet.has(key),
      railBroken: 0,
      elevation: Number(elevation[key].toFixed(4)),
      moisture: Number(moisture[key].toFixed(4)),
      yields: HexBaseYields(terrain[key], featureKind),
      massBase: massBase[key],
      control: control[key],
      tunnel: false,
      works: [],
      baseId: null,
      explored: exploredSet.has(key),
      visibility: 0,
      intel: intelSeed,
      scorch: 0,
      // 以下为地图层附加信息：不属于状态机必需字段，但渲染与 AI 都用得上。
      regionId: regionAssignment[key],
      riverId: riverInfo.riverIdByKey[key] ?? null,
      riverDistance: Math.min(9, riverInfo.riverDistance[key] ?? 9),
      fertility: Number(fertility[key].toFixed(3)),
      relief: Number((relief[key] ?? 0).toFixed(4)),
      moveCost: HexMoveCost(terrain[key], featureKind, roadInfo.road[key]),
      concealment: Number(HexConcealment(terrain[key], featureKind).toFixed(3)),
      siteName: settlements.siteNames[key],
    };
  }
  return hexes;
}

// ---------------------------------------------------------------------------
// 17. 入口
// ---------------------------------------------------------------------------

/**
 * 生成一整张战略地图。
 * @param {number|string} seed 随机种子（同一 seed 必定产出完全相同的地图）
 * @param {number} width 列数（东西方向）
 * @param {number} height 行数（南北方向）
 */
export function GenerateMap(seed, width = 26, height = 20) {
  const numericSeed = NormalizeSeed(seed);
  const lattice = BuildLattice(width, height);

  const field = BuildElevationField(lattice, numericSeed);
  const elevation = field.elevation;

  const riverInfo = CarveRivers(lattice, elevation, numericSeed);

  // 兜底：契约要求相邻高差 ≤ 0.28（渲染要做平滑的地形高度）。
  // 正常情况下 CarveRivers 里的松弛已经收敛到 0.24 以内，这里再兜一道保险。
  if (MaxNeighborDelta(lattice, elevation) > mapGenDefaults.finalSlopeLimit + 1e-6) {
    EnforceSlopeLimit(lattice, elevation, mapGenDefaults.finalSlopeLimit, 400);
    for (const key of lattice.order) elevation[key] = Clamp01(elevation[key]);
  }

  const moisture = ComputeMoistureField(lattice, elevation, riverInfo.riverDistance, numericSeed);

  // 河流下切之后局部起伏变了，重算一次，后续的盆地/峡谷判定才准。
  const relief = Object.create(null);
  for (const key of lattice.order) {
    const list = lattice.neighbors[key];
    let sum = 0;
    for (const neighbor of list) sum += Math.abs(elevation[key] - elevation[neighbor]);
    relief[key] = list.length ? sum / list.length : 0;
  }

  const terrainInfo = ClassifyTerrain(lattice, elevation, moisture, riverInfo, numericSeed);
  const terrain = terrainInfo.terrain;

  const fertility = ComputeFertilityField(lattice, elevation, moisture, terrain, riverInfo, relief);
  const homeBasinKey = ChooseHomeBasin(lattice, elevation, terrain, fertility, riverInfo, relief, numericSeed);

  const settlements = PlaceSettlements(
    lattice,
    elevation,
    moisture,
    terrain,
    riverInfo,
    fertility,
    relief,
    homeBasinKey,
    numericSeed,
  );
  EnsureHomeVillages(lattice, terrain, settlements, homeBasinKey, 5);

  const railInfo = LayRailways(lattice, elevation, terrain, settlements, riverInfo, numericSeed);
  const roadInfo = LayRoads(lattice, elevation, terrain, settlements, railInfo, numericSeed);
  const strongholdSeeds = PlaceStrongholds(
    lattice,
    terrain,
    settlements,
    railInfo,
    roadInfo,
    homeBasinKey,
    numericSeed,
  );

  const pressure = ComputeEnemyPressure(lattice, strongholdSeeds, railInfo, roadInfo);
  const startKey = ChooseStart(lattice, elevation, terrain, settlements, pressure, homeBasinKey);
  const control = AssignControl(lattice, terrain, settlements, pressure, homeBasinKey, startKey);
  const massBase = ComputeMassBase(lattice, terrain, settlements, control, pressure, homeBasinKey, numericSeed);
  const regionInfo = BuildRegions(lattice, elevation, terrain, settlements, railInfo, riverInfo, homeBasinKey);

  const hexes = AssembleHexes(lattice, {
    elevation,
    moisture,
    terrain,
    settlements,
    railInfo,
    roadInfo,
    control,
    massBase,
    regionAssignment: regionInfo.assignment,
    riverInfo,
    fertility,
    relief,
    startKey,
  });

  const stats = {
    terrainCounts: terrainInfo.counts,
    villageCount: settlements.villageKeys.length,
    townCount: settlements.townKeys.length,
    countySeatCount: settlements.countySeatKeys.length,
    strongholdCount: strongholdSeeds.length,
    riverCount: riverInfo.rivers.length,
    railwayCount: railInfo.railwayKeys.length,
    highwayCount: roadInfo.highwayKeys.length,
    maxNeighborDelta: Number(MaxNeighborDelta(lattice, elevation).toFixed(4)),
  };

  return {
    width,
    height,
    hexes,
    order: lattice.order.slice(),
    startKey,
    strongholdSeeds,
    countySeatKeys: settlements.countySeatKeys.slice(),
    railwayKeys: railInfo.railwayKeys.slice(),
    riverKeys: riverInfo.riverKeys.slice(),
    regions: regionInfo.regions,
    // 附加信息
    seed: numericSeed,
    homeBasinKey,
    townKeys: settlements.townKeys.slice(),
    villageKeys: settlements.villageKeys.slice(),
    fordKeys: settlements.fordKeys.slice(),
    passKeys: settlements.passKeys.slice(),
    stationKeys: railInfo.stationKeys.slice(),
    junctionKey: railInfo.junctionKey,
    highwayKeys: roadInfo.highwayKeys.slice(),
    rivers: riverInfo.rivers.map((river) => ({
      id: river.id,
      name: river.name,
      path: river.path.slice(),
      sourceKey: river.sourceKey,
      mouthKey: river.mouthKey,
    })),
    stats,
  };
}

// ---------------------------------------------------------------------------
// 18. 自检
// ---------------------------------------------------------------------------

/**
 * 校验一张地图是否满足全部硬性约束，返回 { ok, issues, stats }。
 * 供冒烟测试与其他模块在开发期调用。
 */
export function ValidateMap(map, options = {}) {
  const maxDelta = options.maxNeighborDelta ?? 0.28;
  const minHomeVillages = options.minHomeVillages ?? 4;
  const issues = [];
  const { hexes, order } = map;

  // 1) 地形齐全
  const counts = Object.create(null);
  for (const key of terrainKeys) counts[key] = 0;
  for (const key of order) counts[hexes[key].terrain] += 1;
  for (const key of terrainKeys) {
    if (counts[key] === 0) issues.push(`缺少地形：${key}`);
  }

  // 2) 地物齐全
  const featureCounts = Object.create(null);
  for (const key of featureKeys) featureCounts[key] = 0;
  for (const key of order) {
    const kind = hexes[key].feature;
    if (kind) featureCounts[kind] = (featureCounts[kind] ?? 0) + 1;
  }
  for (const key of featureKeys) {
    if (featureCounts[key] === 0) issues.push(`缺少地物：${key}`);
  }

  // 3) 相邻高差
  let worstDelta = 0;
  let worstPair = null;
  for (const key of order) {
    const hex = hexes[key];
    for (const direction of hexDirections) {
      const other = HexKey(hex.q + direction.q, hex.r + direction.r);
      const neighbor = hexes[other];
      if (!neighbor) continue;
      const delta = Math.abs(hex.elevation - neighbor.elevation);
      if (delta > worstDelta) {
        worstDelta = delta;
        worstPair = [key, other];
      }
    }
  }
  if (worstDelta > maxDelta) {
    issues.push(`相邻高差 ${worstDelta.toFixed(4)} 超过上限 ${maxDelta}（${worstPair && worstPair.join(" / ")}）`);
  }

  // 4) 连通性：BFS 走遍 moveCost 有限的格
  const visited = new Set();
  const stack = [map.startKey];
  visited.add(map.startKey);
  while (stack.length > 0) {
    const key = stack.pop();
    const hex = hexes[key];
    for (const direction of hexDirections) {
      const other = HexKey(hex.q + direction.q, hex.r + direction.r);
      const neighbor = hexes[other];
      if (!neighbor || visited.has(other)) continue;
      const cost = HexMoveCost(neighbor.terrain, neighbor.feature, neighbor.road);
      if (!Number.isFinite(cost)) continue;
      visited.add(other);
      stack.push(other);
    }
  }
  if (visited.size !== order.length) {
    issues.push(`地图不连通：可达 ${visited.size} / ${order.length}`);
  }

  // 5) 起始点
  const startHex = hexes[map.startKey];
  if (!startHex) {
    issues.push("startKey 不存在");
  } else {
    const mountainish = new Set(["Mountain", "Ridge", "Hill", "Forest", "Gorge"]);
    if (!mountainish.has(startHex.terrain)) issues.push(`起始点地形不是山区/丘陵：${startHex.terrain}`);
    if (startHex.elevation < 0.4) issues.push(`起始点高程过低：${startHex.elevation}`);
    let villages = 0;
    for (const coord of HexesInRange({ q: startHex.q, r: startHex.r }, 2)) {
      const other = HexKey(coord.q, coord.r);
      if (other === map.startKey) continue;
      const hex = hexes[other];
      if (hex && hex.feature === "Village") villages += 1;
    }
    if (villages < minHomeVillages) issues.push(`起始点 2 环内村庄不足：${villages} < ${minHomeVillages}`);
  }

  // 6) 战略骨架
  if (map.countySeatKeys.length < 3 || map.countySeatKeys.length > 5) {
    issues.push(`县城数量异常：${map.countySeatKeys.length}`);
  }
  if (map.railwayKeys.length < map.height) issues.push(`铁路过短：${map.railwayKeys.length}`);
  if (map.riverKeys.length < 8) issues.push(`河流过短：${map.riverKeys.length}`);
  if (!map.regions || map.regions.length < 4) issues.push("战略分区不足");
  if (!map.strongholdSeeds || map.strongholdSeeds.length < 6) issues.push("敌军据点过少");

  return {
    ok: issues.length === 0,
    issues,
    stats: {
      terrainCounts: counts,
      featureCounts,
      maxNeighborDelta: Number(worstDelta.toFixed(4)),
      reachable: visited.size,
      total: order.length,
    },
  };
}
