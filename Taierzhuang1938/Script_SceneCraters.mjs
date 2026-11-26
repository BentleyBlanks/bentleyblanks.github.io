// 场景弹坑与通用弹坑形态规则（docs/Data_ExplosionRange.md / docs/Data_Scene.md）。
//
// 纯模块：零 three、零 DOM，Node、Worker、场景编辑器、遭遇设计器与游戏运行时共用。
// 职责：
//   1. 统一弹坑几何形态（漏斗壁 + 碎土平底、按口径自适应坑沿宽/高、斜射椭圆偏移与下风向抛土加厚、新/旧/积水陈化档）；
//      同时供静态场景 doc.craters 与动态运行时 Script_TerrainDeformation 调用。
//   2. 场景文件 doc.craters 校验与归一化（SceneCraterIssues / NormalizeSceneCraters）。
//   3. 静态高度图挖坑（CarveSceneCraters）：与运行时共用单调叠加、不填旧坑、maxAxisGrade 可通行坡度松弛与保护区闸门。
//   4. 空间分桶表面场（CompileSceneCraterField）：毫秒级采样 [cavity, wear, scorch, water]，驱动零额外采样器的
//      terrainCrater 顶点属性、分层地表去草茬/露焦土/坑底积水，以及 2D/3D 编辑器着色。

import { EXPLOSIVES, TERRAIN_DEFORMATION } from "./Data_Explosives.mjs";
import { ExplosiveIdFor } from "./Script_Explosives.mjs";
import { ValueNoise2 } from "./Script_Noise.mjs";

const IsObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const Finite = (v) => typeof v === "number" && Number.isFinite(v);
const Clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const Smooth01 = (t) => { const c = Clamp(t, 0, 1); return c * c * (3 - 2 * c); };
const DEG = Math.PI / 180;

const NEIGHBORS = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
];

export const SCENE_CRATER_LIMITS = Object.freeze({ maxItems: 2000, idMax: 96 });

export const SCENE_CRATER_KEYS = Object.freeze([
  "id", "x", "z", "kind", "radius", "depth", "rim", "rimWidth", "age",
  "dirDeg", "oblique", "scorch", "water", "seed", "debris", "group", "note",
]);

/**
 * 弹坑陈化档：
 *   fresh     — 刚炸出的弹坑：锐利漏斗壁、饱满翻土唇、高焦黑与烟灰、干碎土；
 *   weathered — 经历过前序炮击与雨水冲刷的旧坑：略浅、坑唇塌缓、焦痕转淡、坑底微潮；
 *   flooded   — 低洼/河汊/老弹坑积水态：平坦淤泥底、缓唇、淡焦痕、坑底高积水与湿泥环。
 */
export const CRATER_AGES = Object.freeze({
  fresh: Object.freeze({
    depthScale: 1.0, rimScale: 1.0, scorch: 1.0, ash: 1.0, water: 0.0,
    floorFlat: 0.24, wallExp: 1.75, ejectaReach: 1.72,
  }),
  weathered: Object.freeze({
    depthScale: 0.86, rimScale: 0.64, scorch: 0.44, ash: 0.24, water: 0.26,
    floorFlat: 0.42, wallExp: 1.9, ejectaReach: 1.48,
  }),
  flooded: Object.freeze({
    depthScale: 0.8, rimScale: 0.54, scorch: 0.24, ash: 0.1, water: 0.92,
    floorFlat: 0.6, wallExp: 2.05, ejectaReach: 1.38,
  }),
});

export const CRATER_AGE_KEYS = Object.freeze(Object.keys(CRATER_AGES));

export function CraterAgeParams(age) {
  return CRATER_AGES[age] || CRATER_AGES.fresh;
}

/**
 * 来袭 3D 方向（弹道前进方向）→ 水平单位方向 + 斜射系数 oblique ∈ [0, 1]。
 * 垂直落弹 oblique≈0；45° 榴弹 oblique≈0.46；平射直射弹 oblique≈0.85。
 */
export function IncomingToHorizontalDir(incoming) {
  if (!incoming || !Finite(incoming.x) || !Finite(incoming.z)) {
    return { dirX: 0, dirZ: 0, oblique: 0 };
  }
  const h = Math.hypot(incoming.x, incoming.z);
  if (h < 1e-4) return { dirX: 0, dirZ: 0, oblique: 0 };
  const v = Finite(incoming.y) ? Math.abs(incoming.y) : 0;
  return {
    dirX: incoming.x / h,
    dirZ: incoming.z / h,
    oblique: Clamp(h / (h + v * 1.15), 0, 0.9),
  };
}

/** 仓库通用 yawDeg（0=朝北 -Z，+90=朝西 -X，180=朝南 +Z）→ 水平单位前进向量。 */
export function CraterDirFromDeg(dirDeg) {
  if (!Finite(dirDeg)) return { dirX: 0, dirZ: 0 };
  const r = dirDeg * DEG;
  return { dirX: -Math.sin(r), dirZ: -Math.cos(r) };
}

/**
 * 按口径与陈化档自适应坑沿宽/高：
 *   小口径手榴弹坑唇紧凑（~0.52 m），75mm 保持 ~1.20 m，105/150/50kg 重弹展开至 1.6–2.55 m 且最高不越 maxRimM。
 */
export function CraterRimParams(radius, depth, config = TERRAIN_DEFORMATION, age = "fresh") {
  const params = CraterAgeParams(age);
  const maxRimM = Finite(config?.maxRimM) ? config.maxRimM : TERRAIN_DEFORMATION.maxRimM;
  const width = Clamp(radius * 0.56, 0.52, 2.55);
  const height = Math.min(maxRimM, depth * 0.36) * params.rimScale;
  return { width, height };
}

/**
 * 归一化径向剖面 rNorm ∈ [0, 1] → 挖掘系数 ∈ [0, 1]。
 * 两条项均在 [0, 1] 单调递减，r=0 处为 1 且导数为 0，r=1 处为 0 且导数为 0；
 * 兼顾锐利漏斗侧壁与平缓碎土/淤泥坑底（供旧坑与积水坑自然蓄水）。
 */
export function CraterCavityProfile(rNorm, age = "fresh") {
  if (rNorm >= 1) return 0;
  if (rNorm <= 0) return 1;
  const { floorFlat, wallExp } = CraterAgeParams(age);
  const r2 = rNorm * rNorm;
  const funnel = Math.pow(1 - r2, wallExp);
  const flatBowl = (1 - r2 * r2) ** 2;
  return funnel * (1 - floorFlat) + flatBowl * floorFlat;
}

/**
 * 不规则边缘轮廓因子（>0）：低频多谐波破口 + 噪声 + 斜射方向拉长。
 */
export function CraterContourFactor(dx, dz, worldX, worldZ, phase, dirX = 0, dirZ = 0, oblique = 0) {
  const angle = Math.atan2(dz, dx);
  const organic = 0.96
    + 0.095 * Math.sin(angle * 3 + phase)
    + 0.05 * Math.sin(angle * 7 - phase)
    + 0.065 * (ValueNoise2(worldX * 1.3, worldZ * 1.3, 8317) - 0.5);
  if (!(oblique > 1e-4) || (!dirX && !dirZ)) return organic;
  const dist = Math.hypot(dx, dz);
  if (dist < 1e-5) return organic;
  const along = (dx * dirX + dz * dirZ) / dist;
  return organic * (1 + oblique * (0.16 * along * along + 0.08 * along - 0.06 * (1 - along * along)));
}

/**
 * 斜射抛土方向调制：顺着来袭前进方向（下风向，along > 0）坑唇更高更厚，来袭入口侧（along < 0）较薄。
 */
export function CraterRimDirectionalScale(dx, dz, dirX = 0, dirZ = 0, oblique = 0) {
  if (!(oblique > 1e-4) || (!dirX && !dirZ)) return 1;
  const dist = Math.hypot(dx, dz);
  if (dist < 1e-5) return 1;
  const along = (dx * dirX + dz * dirZ) / dist;
  return Clamp(1 + oblique * (0.34 * along), 0.62, 1.36);
}

function HashId(text, x, z) {
  let h = 2166136261 >>> 0;
  const s = `${text || ""}:${Math.round(x * 10)}:${Math.round(z * 10)}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

// ---------------------------------------------------------------------------
// 场景 doc.craters 校验与归一化

export function SceneCraterIssues(craters, errors, at = "craters", existingIds = null) {
  if (!Array.isArray(craters)) { errors.push(`${at} 要是数组`); return; }
  if (craters.length > SCENE_CRATER_LIMITS.maxItems) {
    errors.push(`${at} 最多 ${SCENE_CRATER_LIMITS.maxItems} 个，现在 ${craters.length}`);
  }
  const ids = existingIds || new Set();
  craters.forEach((item, i) => {
    const cat = `${at}[${i}]`;
    if (!IsObject(item)) { errors.push(`${cat} 要是对象`); return; }
    if (typeof item.id !== "string" || !item.id || item.id.length > SCENE_CRATER_LIMITS.idMax) {
      errors.push(`${cat}.id 要是 1–${SCENE_CRATER_LIMITS.idMax} 字的字符串`);
    } else if (ids.has(item.id)) {
      errors.push(`${cat}.id 重复：${item.id}`);
    } else {
      ids.add(item.id);
    }
    if (!Finite(item.x) || !Finite(item.z)) errors.push(`${cat} 要带有限的 x / z`);
    if (item.kind !== undefined && (typeof item.kind !== "string" || !Object.hasOwn(EXPLOSIVES, item.kind))) {
      errors.push(`${cat}.kind 要是 EXPLOSIVES 里的口径之一（${Object.keys(EXPLOSIVES).join(" / ")}）`);
    }
    if (item.radius !== undefined && !(Finite(item.radius) && item.radius >= 0.3 && item.radius <= 14)) {
      errors.push(`${cat}.radius 要在 0.3…14 米`);
    }
    if (item.depth !== undefined && !(Finite(item.depth) && item.depth >= 0.05 && item.depth <= TERRAIN_DEFORMATION.maxDepthM)) {
      errors.push(`${cat}.depth 要在 0.05…${TERRAIN_DEFORMATION.maxDepthM} 米`);
    }
    if (item.rim !== undefined && !(Finite(item.rim) && item.rim >= 0 && item.rim <= 0.45)) {
      errors.push(`${cat}.rim 要在 0…0.45 米`);
    }
    if (item.rimWidth !== undefined && !(Finite(item.rimWidth) && item.rimWidth >= 0.3 && item.rimWidth <= 4)) {
      errors.push(`${cat}.rimWidth 要在 0.3…4 米`);
    }
    if (item.age !== undefined && !CRATER_AGE_KEYS.includes(item.age)) {
      errors.push(`${cat}.age 要是 ${CRATER_AGE_KEYS.join(" / ")}`);
    }
    if (item.dirDeg !== undefined && !Finite(item.dirDeg)) errors.push(`${cat}.dirDeg 要是有限数字`);
    if (item.oblique !== undefined && !(Finite(item.oblique) && item.oblique >= 0 && item.oblique <= 1)) {
      errors.push(`${cat}.oblique 要在 0…1`);
    }
    if (item.scorch !== undefined && !(Finite(item.scorch) && item.scorch >= 0 && item.scorch <= 1)) {
      errors.push(`${cat}.scorch 要在 0…1`);
    }
    if (item.water !== undefined && !(Finite(item.water) && item.water >= 0 && item.water <= 1)) {
      errors.push(`${cat}.water 要在 0…1`);
    }
    if (item.seed !== undefined && !Finite(item.seed)) errors.push(`${cat}.seed 要是有限数字`);
    if (item.debris !== undefined && typeof item.debris !== "boolean") errors.push(`${cat}.debris 要是 true / false`);
    if (item.group !== undefined && typeof item.group !== "string") errors.push(`${cat}.group 要是字符串`);
    if (item.note !== undefined && typeof item.note !== "string") errors.push(`${cat}.note 要是字符串`);
    for (const k of Object.keys(item)) {
      if (!SCENE_CRATER_KEYS.includes(k)) errors.push(`${cat} 不认识的字段 ${k}`);
    }
  });
}

/** 原始 doc.craters → 补齐缺省与预计算方向/相位的不可变清单。 */
export function NormalizeSceneCraters(craters, config = TERRAIN_DEFORMATION) {
  if (!Array.isArray(craters) || !craters.length) return [];
  const out = [];
  for (const raw of craters) {
    if (!IsObject(raw) || !Finite(raw.x) || !Finite(raw.z)) continue;
    const kind = raw.kind && Object.hasOwn(EXPLOSIVES, raw.kind) ? raw.kind : ExplosiveIdFor(raw.kind || "Shell75");
    const spec = EXPLOSIVES[kind] || EXPLOSIVES.Shell75;
    const age = CRATER_AGE_KEYS.includes(raw.age) ? raw.age : "fresh";
    const ageP = CraterAgeParams(age);
    const radius = Finite(raw.radius) && raw.radius > 0 ? raw.radius : spec.craterRadiusM;
    const baseDepth = Finite(raw.depth) && raw.depth > 0 ? raw.depth : spec.craterDepthM * ageP.depthScale;
    const depth = Clamp(baseDepth, 0.04, config.maxDepthM);
    const autoRim = CraterRimParams(radius, depth, config, age);
    const rim = Finite(raw.rim) ? Clamp(raw.rim, 0, config.maxRimM) : autoRim.height;
    const rimWidth = Finite(raw.rimWidth) ? Clamp(raw.rimWidth, 0.3, 4) : autoRim.width;
    const dirDeg = Finite(raw.dirDeg) ? raw.dirDeg : 0;
    const oblique = Finite(raw.oblique) ? Clamp(raw.oblique, 0, 1) : 0;
    const { dirX, dirZ } = oblique > 1e-4 ? CraterDirFromDeg(dirDeg) : { dirX: 0, dirZ: 0 };
    const seed = Finite(raw.seed) ? raw.seed : HashId(raw.id, raw.x, raw.z);
    const phase = ((seed % 10007) / 10007) * Math.PI * 2;
    const scorch = Finite(raw.scorch) ? Clamp(raw.scorch, 0, 1) : ageP.scorch;
    const water = Finite(raw.water) ? Clamp(raw.water, 0, 1) : ageP.water;
    const ejectaReach = radius * ageP.ejectaReach * (1 + oblique * 0.25);
    const outerReach = Math.max(radius * (1.22 + oblique * 0.22) + rimWidth, ejectaReach);
    out.push(Object.freeze({
      id: typeof raw.id === "string" && raw.id ? raw.id : `Crater_${out.length}`,
      x: raw.x, z: raw.z, kind, age, radius, depth, rim, rimWidth,
      dirDeg, dirX, dirZ, oblique, scorch, water, seed, phase,
      debris: raw.debris !== false,
      ejectaReach, outerReach,
      group: typeof raw.group === "string" ? raw.group : "",
    }));
  }
  return out;
}

/** 弹坑影响外包框（含坑沿与抛土）。 */
export function CraterReachBounds(crater) {
  const r = crater.outerReach ?? ((crater.radius || 2.5) * 1.9 + 2);
  return { minX: crater.x - r, maxX: crater.x + r, minZ: crater.z - r, maxZ: crater.z + r };
}

/** 按矩形区域切片弹坑（保留影响范围沾边的弹坑，避免区域边界被切半）。 */
export function SliceSceneCraters(craters, region, marginM = 2) {
  if (!Array.isArray(craters) || !craters.length || !region) return craters || [];
  const norm = NormalizeSceneCraters(craters);
  const kept = [];
  for (let i = 0; i < norm.length; i++) {
    const c = norm[i], pad = c.outerReach + marginM;
    if (c.x + pad >= region.minX && c.x - pad <= region.maxX
      && c.z + pad >= region.minZ && c.z - pad <= region.maxZ) {
      kept.push(craters[i]);
    }
  }
  return kept;
}

// ---------------------------------------------------------------------------
// 静态场景高度图挖坑（稀疏页 + 单调松弛 + 不填旧坑 + maxAxisGrade 可通行）

const PAGE_SIZE = 32;
const PAGE_SPAN = 4096;
const NODE_SPAN = 65536;
const SparsePageKey = (tx, tz) => tx * PAGE_SPAN + tz;
const SparseNodeKey = (ix, iz) => ix * NODE_SPAN + iz;

/**
 * 将 doc.craters 静态刻入场景高度图（与运行时 TerrainDeformation 同源物理口径）。
 *
 * @param {{ minX:number, minZ:number, cellM:number, cols:number, rows:number }} terrain
 * @param {Float32Array} heights 未挖弹坑的高度图（不改动它，除非传 into === heights）
 * @param {Array} craters doc.craters（原始或已归一化均可）
 * @param {{ protect?: (x:number, z:number)=>boolean, into?: Float32Array, region?: object, config?: object }} options
 *   protect(x, z) 返回 true 表示该点受保护（不可挖坑也不可堆唇，如壕沟底/水面/屋基）
 * @returns {Float32Array} 挖好弹坑后的高度数组
 */
export function CarveSceneCraters(terrain, heights, craters, { protect = null, into = null, region = null, config = TERRAIN_DEFORMATION } = {}) {
  const out = into || new Float32Array(heights);
  const list = NormalizeSceneCraters(craters, config);
  if (!list.length) return out;
  const { minX, minZ, cellM: s, cols, rows } = terrain;
  const width = cols + 1;
  const maxDepthM = config.maxDepthM ?? TERRAIN_DEFORMATION.maxDepthM;
  const maxAxisGrade = config.maxAxisGrade ?? TERRAIN_DEFORMATION.maxAxisGrade;
  const step = maxAxisGrade * s;
  const reach = Math.ceil(maxDepthM / Math.max(1e-4, step));

  // 稀疏页存有符号形变：正值 = 向下挖深，负值 = 向上堆起的坑唇（同 TerrainDeformation 符号约定）
  const pages = new Map();
  let lastKey = NaN, lastPage = null;
  const GetNode = (ix, iz) => {
    const tx = Math.floor(ix / PAGE_SIZE), tz = Math.floor(iz / PAGE_SIZE);
    const key = SparsePageKey(tx, tz);
    let page = key === lastKey ? lastPage : pages.get(key);
    if (key !== lastKey) { lastKey = key; lastPage = page || null; }
    return page ? page[(iz - tz * PAGE_SIZE) * PAGE_SIZE + (ix - tx * PAGE_SIZE)] : 0;
  };
  const SetNode = (ix, iz, val) => {
    const tx = Math.floor(ix / PAGE_SIZE), tz = Math.floor(iz / PAGE_SIZE);
    const key = SparsePageKey(tx, tz);
    let page = key === lastKey ? lastPage : pages.get(key);
    if (!page) { page = new Float32Array(PAGE_SIZE * PAGE_SIZE); pages.set(key, page); }
    lastKey = key; lastPage = page;
    page[(iz - tz * PAGE_SIZE) * PAGE_SIZE + (ix - tx * PAGE_SIZE)] = val;
  };

  const allowedCache = new Map();
  const Allowed = (ix, iz) => {
    if (ix <= 0 || ix >= cols || iz <= 0 || iz >= rows) return false;
    const key = SparseNodeKey(ix, iz);
    let ok = allowedCache.get(key);
    if (ok === undefined) {
      ok = protect ? !protect(minX + ix * s, minZ + iz * s) : true;
      allowedCache.set(key, ok);
    }
    return ok;
  };

  const caps = new Map();
  const Cap = (ix, iz, key, target) => {
    if (!protect) return maxDepthM;
    let entry = caps.get(key);
    if (!entry) { entry = { cap: maxDepthM, j: 0 }; caps.set(key, entry); }
    let j = entry.j;
    while (j < reach && (j + 1) * step < entry.cap && (j + 1) * step < target) {
      j++;
      for (let axis = 0; axis < 4; axis++) {
        if (!Allowed(ix + NEIGHBORS[axis][0] * j, iz + NEIGHBORS[axis][1] * j)) {
          entry.cap = j * step;
          break;
        }
      }
    }
    entry.j = j;
    return entry.cap;
  };

  const ixMinR = region ? Math.max(0, Math.floor((region.minX - minX) / s)) : 0;
  const ixMaxR = region ? Math.min(cols, Math.ceil((region.maxX - minX) / s)) : cols;
  const izMinR = region ? Math.max(0, Math.floor((region.minZ - minZ) / s)) : 0;
  const izMaxR = region ? Math.min(rows, Math.ceil((region.maxZ - minZ) / s)) : rows;

  for (const c of list) {
    const pad = c.outerReach + s;
    const cx0 = Math.floor((c.x - pad - minX) / s), cx1 = Math.ceil((c.x + pad - minX) / s);
    const cz0 = Math.floor((c.z - pad - minZ) / s), cz1 = Math.ceil((c.z + pad - minZ) / s);
    if (cx1 < ixMinR || cx0 > ixMaxR || cz1 < izMinR || cz0 > izMaxR) continue;

    const queue = [], changed = [], changedKeys = new Set();
    const Lower = (ix, iz, target) => {
      if (ix < 1 || ix >= cols || iz < 1 || iz >= rows) return;
      const old = GetNode(ix, iz);
      if (target <= old + 1e-5 || !Allowed(ix, iz)) return;
      const key = SparseNodeKey(ix, iz);
      const next = Math.min(target, Cap(ix, iz, key, target));
      if (next <= old + 1e-5) return;
      SetNode(ix, iz, next);
      queue.push(ix, iz);
      if (!changedKeys.has(key)) { changedKeys.add(key); changed.push(ix, iz); }
    };

    const excavateR = c.radius * (1.22 + c.oblique * 0.24);
    const ix0 = Math.max(1, Math.floor((c.x - excavateR - minX) / s));
    const ix1 = Math.min(cols - 1, Math.ceil((c.x + excavateR - minX) / s));
    const iz0 = Math.max(1, Math.floor((c.z - excavateR - minZ) / s));
    const iz1 = Math.min(rows - 1, Math.ceil((c.z + excavateR - minZ) / s));

    for (let iz = iz0; iz <= iz1; iz++) {
      const wz = minZ + iz * s, dz = wz - c.z;
      for (let ix = ix0; ix <= ix1; ix++) {
        const wx = minX + ix * s, dx = wx - c.x;
        const contour = CraterContourFactor(dx, dz, wx, wz, c.phase, c.dirX, c.dirZ, c.oblique);
        const rNorm = Math.hypot(dx, dz) / (c.radius * contour);
        if (rNorm >= 1) continue;
        const rough = 0.9 + 0.1 * ValueNoise2(wx * 1.9, wz * 1.9, 1938 + (c.seed & 1023));
        const profile = CraterCavityProfile(rNorm, c.age);
        // 叠加坑深化但受 maxDepthM 封顶；单坑按目标剖面挖，叠坑按额外 72% 能量加深（避免双坑立刻塌成深井）
        const old = Math.max(0, GetNode(ix, iz));
        const add = c.depth * profile * rough;
        const target = old > 1e-4 ? Math.min(maxDepthM, Math.max(old, add) + Math.min(old, add) * 0.62) : add;
        Lower(ix, iz, target);
      }
    }

    // 单调坡度松弛：相邻格点高度差始终满足 maxAxisGrade
    for (let head = 0; head < queue.length; head += 2) {
      const ix = queue[head], iz = queue[head + 1], depthHere = GetNode(ix, iz);
      for (const [dx, dz, dd] of NEIGHBORS) Lower(ix + dx, iz + dz, depthHere - step * dd);
    }

    if (!changed.length || !(c.rim > 1e-4)) continue;

    // 围绕实际挖掘外轮廓堆起翻土唇（永不回填已有坑腔）
    const rimEntries = new Map(), rimQueue = [];
    const VisitRim = (ix, iz, dist) => {
      if (ix < 1 || ix >= cols || iz < 1 || iz >= rows) return;
      const key = SparseNodeKey(ix, iz), known = rimEntries.get(key);
      if (dist >= c.rimWidth || dist >= (known ? known.distance : Infinity)
        || GetNode(ix, iz) > 0 || !Allowed(ix, iz)) return;
      const entry = { x: ix, z: iz, distance: dist, height: 0 };
      rimEntries.set(key, entry);
      rimQueue.push(entry);
    };
    for (let i = 0; i < changed.length; i += 2) {
      const ix = changed[i], iz = changed[i + 1];
      if (GetNode(ix, iz) <= 0) continue;
      for (const [dx, dz, dd] of NEIGHBORS) VisitRim(ix + dx, iz + dz, s * dd);
    }
    for (let head = 0; head < rimQueue.length; head++) {
      const { x, z, distance } = rimQueue[head];
      for (const [dx, dz, dd] of NEIGHBORS) VisitRim(x + dx, z + dz, distance + s * dd);
    }
    const rimList = [...rimEntries.values()];
    for (const entry of rimList) {
      const wx = minX + entry.x * s, wz = minZ + entry.z * s;
      const rough = 0.42 + 0.58 * ValueNoise2(wx * 2.1, wz * 2.1, 6319 + (c.seed & 1023));
      const dirScale = CraterRimDirectionalScale(wx - c.x, wz - c.z, c.dirX, c.dirZ, c.oblique);
      entry.old = -GetNode(entry.x, entry.z);
      const proposed = Math.min(config.maxRimM ?? TERRAIN_DEFORMATION.maxRimM, c.rim * dirScale)
        * Math.sin(Math.PI * entry.distance / c.rimWidth) ** 2 * rough;
      entry.height = Math.max(entry.old, proposed);
      entry.links = [];
      entry.limit = Infinity;
      for (const [dx, dz, dd] of NEIGHBORS) {
        const nx = entry.x + dx, nz = entry.z + dz;
        const nb = rimEntries.get(SparseNodeKey(nx, nz));
        const w = step * dd;
        if (nb) entry.links.push(nb, w);
        else entry.limit = Math.min(entry.limit, -GetNode(nx, nz) + w);
      }
    }
    let unsettled = true;
    while (unsettled) {
      unsettled = false;
      for (const entry of rimList) {
        let next = Math.min(entry.height, entry.limit);
        const links = entry.links;
        for (let i = 0; i < links.length; i += 2) {
          const bound = links[i].height + links[i + 1];
          if (bound < next) next = bound;
        }
        next = Math.max(entry.old, next);
        if (next < entry.height - 1e-5) { entry.height = next; unsettled = true; }
      }
    }
    for (const entry of rimList) {
      if (entry.height > entry.old + 1e-5) SetNode(entry.x, entry.z, -entry.height);
    }
  }

  // 把稀疏页有符号形变写回输出高度数组（只写有改动的页，毫秒级）
  for (const [pageKey, page] of pages) {
    const tx = Math.floor((pageKey + PAGE_SPAN / 2) / PAGE_SPAN);
    const tz = pageKey - tx * PAGE_SPAN;
    const xBase = tx * PAGE_SIZE, zBase = tz * PAGE_SIZE;
    const z0 = Math.max(izMinR, zBase), z1 = Math.min(izMaxR, zBase + PAGE_SIZE - 1);
    const x0 = Math.max(ixMinR, xBase), x1 = Math.min(ixMaxR, xBase + PAGE_SIZE - 1);
    for (let iz = z0; iz <= z1; iz++) {
      const rowOff = iz * width, lz = (iz - zBase) * PAGE_SIZE;
      for (let ix = x0; ix <= x1; ix++) {
        const d = page[lz + (ix - xBase)];
        if (d !== 0) out[rowOff + ix] -= d;
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// 静态弹坑表面属性空间分桶场（给顶点属性 terrainCrater、去草茬、2D/3D 编辑器着色）

const BUCKET_M = 16;

/**
 * 编译静态弹坑空间分桶查询器。
 * SampleSurface(x, z, out) 写出 4 元组：
 *   out[0] = cavity  ∈ [0, 1]（坑腔深浅，坑底接近 1，坑沿回 0）
 *   out[1] = wear    ∈ [0, 1]（翻土 + 坑唇 + 放射抛土覆盖度，驱动焦土 PBR 与去草茬）
 *   out[2] = scorch  ∈ [0, 1]（爆心灼黑与烟灰强度，随 age 衰减）
 *   out[3] = water   ∈ [0, 1]（坑底蓄水/泥浆倾向，flooded 高、weathered 中、fresh 0）
 */
export function CompileSceneCraterField(craters, config = TERRAIN_DEFORMATION) {
  const list = NormalizeSceneCraters(craters, config);
  if (!list.length) return null;
  const buckets = new Map();
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const c of list) {
    const r = c.outerReach;
    if (c.x - r < minX) minX = c.x - r;
    if (c.x + r > maxX) maxX = c.x + r;
    if (c.z - r < minZ) minZ = c.z - r;
    if (c.z + r > maxZ) maxZ = c.z + r;
    const bx0 = Math.floor((c.x - r) / BUCKET_M), bx1 = Math.floor((c.x + r) / BUCKET_M);
    const bz0 = Math.floor((c.z - r) / BUCKET_M), bz1 = Math.floor((c.z + r) / BUCKET_M);
    for (let bz = bz0; bz <= bz1; bz++) {
      for (let bx = bx0; bx <= bx1; bx++) {
        const key = bx * 65536 + bz;
        let cell = buckets.get(key);
        if (!cell) { cell = []; buckets.set(key, cell); }
        cell.push(c);
      }
    }
  }
  const bounds = Object.freeze({ minX, maxX, minZ, maxZ });

  function SampleSurface(x, z, out = [0, 0, 0, 0]) {
    out[0] = 0; out[1] = 0; out[2] = 0; out[3] = 0;
    if (x < minX || x > maxX || z < minZ || z > maxZ) return out;
    const listAt = buckets.get(Math.floor(x / BUCKET_M) * 65536 + Math.floor(z / BUCKET_M));
    if (!listAt) return out;
    let cavity = 0, wear = 0, scorch = 0, water = 0;
    for (let i = 0; i < listAt.length; i++) {
      const c = listAt[i];
      const dx = x - c.x, dz = z - c.z;
      const dist2 = dx * dx + dz * dz;
      const outer = c.outerReach;
      if (dist2 >= outer * outer) continue;
      const dist = Math.sqrt(dist2);
      const contour = CraterContourFactor(dx, dz, x, z, c.phase, c.dirX, c.dirZ, c.oblique);
      const rEdge = c.radius * contour;
      const rNorm = dist / Math.max(0.1, rEdge);
      const rimEnd = rEdge + c.rimWidth;
      const dirScale = CraterRimDirectionalScale(dx, dz, c.dirX, c.dirZ, c.oblique);

      // 1. 坑腔强度（与真实挖深挂钩，小口径浅坑不会显得像 2m 深井）
      if (rNorm < 1) {
        const depthFactor = Clamp(c.depth / 0.85, 0.28, 1.0);
        const prof = CraterCavityProfile(rNorm, c.age);
        const cav = prof * depthFactor;
        if (cav > cavity) cavity = cav;
      }

      // 2. 暴露翻土 + 坑唇 + 放射抛土丝
      let w = 0;
      if (rNorm < 1.04) {
        w = 1.0;
      } else if (dist < rimEnd) {
        const t = (dist - rEdge) / Math.max(0.15, c.rimWidth);
        const lipNoise = 0.72 + 0.28 * ValueNoise2(x * 2.3, z * 2.3, 6319 + (c.seed & 1023));
        w = (1 - Smooth01(t)) * Clamp(0.82 * dirScale * lipNoise, 0.25, 1.0);
      }
      // 放射抛土纹（向抛土外缘衰减，不出现呆板正圆黑饼）
      if (dist < c.ejectaReach) {
        const angle = Math.atan2(dz, dx);
        const rays = (Math.sin(angle * 15 + c.phase) + Math.sin(angle * 27 - c.phase) * 0.55 + 1.55) / 3.1;
        const grain = ValueNoise2(x * 1.4, z * 1.4, 417 + (c.seed & 1023));
        const ejNorm = dist / Math.max(0.2, c.ejectaReach);
        const powder = (1 - ejNorm) ** 1.75 * (0.16 + rays * 0.84) * (0.55 + grain * 0.45) * dirScale;
        if (powder * 0.82 > w) w = powder * 0.82;
      }
      if (w > wear) wear = w;

      // 3. 爆心焦痕与烟灰（仅集中在坑腔内壁与坑底）
      if (rNorm < 1.15 && c.scorch > 1e-3) {
        const noise = ValueNoise2(x * 1.6, z * 1.6, 517 + (c.seed & 1023));
        const sc = Math.max(0, 1 - rNorm / 1.12) ** 1.45 * (0.68 + noise * 0.32) * c.scorch;
        if (sc > scorch) scorch = sc;
      }

      // 4. 坑底蓄水/湿泥（只落在坑底平缓区 rNorm < 0.72，坑唇永远干）
      if (rNorm < 0.78 && c.water > 1e-3) {
        const pool = (1 - Smooth01((rNorm - 0.32) / 0.46)) * c.water;
        if (pool > water) water = pool;
      }
    }
    out[0] = Clamp(cavity, 0, 1);
    out[1] = Clamp(wear, 0, 1);
    out[2] = Clamp(scorch, 0, 1);
    out[3] = Clamp(water, 0, 1);
    return out;
  }

  return Object.freeze({ craters: Object.freeze(list), bounds, SampleSurface });
}
