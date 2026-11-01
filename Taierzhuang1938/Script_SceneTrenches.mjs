// 场景里的壕沟（docs/Data_Scene.md §9）：场景文件 trenches 一节是样条壕沟网络，地面按它现挖。
//
// 2026-11-01 用户：「样条编辑器管不到场景」「沟里那些细节能匹配壕沟的样条做 PCG 生成吗」。原来 01–05 的沟是生成器拿
// Script_TrenchPlan 挖好、烘进高度图的，场景里只剩坑，没有能选中、能改的沟。现在：
//   · 高度图（Scene_<Id>.height.bin）存「沟没挖之前」的地面；
//   · trenches.segments 是一段段样条沟（控制点、沟型、断面、沿沟深度、塌方、细节开关），读场景时现挖；
//   · trenches.datum 是挖沟的基准面（Scene_<Id>.trench.bin，1 m 格，几块），沟底 = 基准面 − 深度。基准面和地面分开存，
//     因为地面上还有坑、凹路、土包，沟穿过它们时沟底不该跟着落下去；样条拖出基准面的范围就用地面当基准。
// 挖法、断面、细节都是 Script_TrenchPlan 那一套（与现行第一关同一份代码），细节开关与参数在 Data_TrenchDetails。
//
// 纯模块：零 three、零 DOM，node 与浏览器共用。

import { CompileTrenchNetwork, TRENCH_PRESETS } from "./Script_TrenchPlan.mjs";
import { TRENCH_EARTH_PROFILE } from "./Data_TrenchAppearance.mjs";
import { TrenchDetailIssues, TRENCH_LOOKS, TRENCH_LOOK_KEYS } from "./Data_TrenchDetails.mjs";

export const SCENE_TRENCH_DATUM_ENCODING = "int16-cm-le";
/** 场景里写的 earthProfile 名 → 断面档（缺省 compact = 照片 01/14 的压实手挖土）。 */
export const SCENE_TRENCH_EARTH_PROFILES = Object.freeze({ compact: TRENCH_EARTH_PROFILE });
/** 段上认的字段。 */
export const SCENE_TRENCH_SEGMENT_KEYS = Object.freeze([
  "id", "preset", "points", "group", "note", "depth", "floorW", "bankW", "bermH", "bermW", "bermSide", "cornerRadiusM",
  "jitterScale", "widthScale", "depthAlong", "datumAlong", "collapses", "look", "details",
]);
const SEGMENT_NUMBERS = Object.freeze({
  depth: [0.2, 4], floorW: [0.4, 8], bankW: [0.2, 4], bermH: [0, 3], bermW: [0, 8], cornerRadiusM: [0, 10], jitterScale: [0, 5], widthScale: [0.2, 3],
});

const IsObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const Finite = (v) => typeof v === "number" && Number.isFinite(v);

/** 网络级缺省的分组（场景编辑器层级里放哪）。 */
export function TrenchGroup(segment) {
  return segment.group || "壕沟";
}

// ---------------------------------------------------------------------------
// 校验

/** trenches 一节的写法问题，推进 errors。 */
export function SceneTrenchIssues(trenches, errors, at = "trenches") {
  if (!IsObject(trenches)) { errors.push(`${at} 要是对象`); return; }
  if (trenches.seed !== undefined && !(typeof trenches.seed === "string" && trenches.seed)) errors.push(`${at}.seed 要是非空字符串`);
  if (trenches.earthProfile !== undefined && trenches.earthProfile !== null && !SCENE_TRENCH_EARTH_PROFILES[trenches.earthProfile]) {
    errors.push(`${at}.earthProfile 要是 ${Object.keys(SCENE_TRENCH_EARTH_PROFILES).join(" / ")} 或 null`);
  }
  if (trenches.look !== undefined && trenches.look !== null && !TRENCH_LOOKS[trenches.look]) errors.push(`${at}.look 要是 ${TRENCH_LOOK_KEYS.join(" / ")} 之一`);
  if (trenches.propKinds !== undefined && !(Array.isArray(trenches.propKinds) && trenches.propKinds.every((s) => typeof s === "string" && s))) errors.push(`${at}.propKinds 要是资产名数组`);
  const d = trenches.datum;
  if (d !== undefined) {
    if (!IsObject(d) || typeof d.file !== "string" || !d.file || /[\\/]/.test(d.file)) errors.push(`${at}.datum.file 要是同目录下的文件名`);
    else if (d.encoding !== SCENE_TRENCH_DATUM_ENCODING) errors.push(`${at}.datum.encoding 要是 ${JSON.stringify(SCENE_TRENCH_DATUM_ENCODING)}`);
    else if (!Array.isArray(d.patches) || !d.patches.every((p) => IsObject(p) && Finite(p.minX) && Finite(p.minZ) && Finite(p.cellM) && p.cellM > 0
      && Number.isInteger(p.cols) && Number.isInteger(p.rows) && p.cols > 0 && p.rows > 0)) errors.push(`${at}.datum.patches 要是 [{ minX, minZ, cellM, cols, rows }]`);
  }
  if (trenches.noBermBelowM !== undefined && !(Finite(trenches.noBermBelowM) && trenches.noBermBelowM >= 0)) errors.push(`${at}.noBermBelowM 要是不小于 0 的数`);
  if (trenches.noBerm !== undefined) {
    if (!Array.isArray(trenches.noBerm)) errors.push(`${at}.noBerm 要是数组`);
    else trenches.noBerm.forEach((z, i) => {
      const ok = IsObject(z) && ((Finite(z.x) && Finite(z.z) && Finite(z.r) && z.r > 0)
        || (Finite(z.minX) && Finite(z.maxX) && Finite(z.minZ) && Finite(z.maxZ))
        || (Array.isArray(z.line) && z.line.length >= 2 && z.line.every((p) => Array.isArray(p) && (p.length === 2 || p.length === 3) && p.every(Finite)) && Finite(z.halfW) && z.halfW > 0));
      if (!ok) errors.push(`${at}.noBerm[${i}] 要是 { x, z, r } / { minX, maxX, minZ, maxZ } / { line: [[x, z(, 半宽)]…], halfW }`);
    });
  }
  if (!Array.isArray(trenches.segments)) { errors.push(`${at}.segments 要是数组`); return; }
  const ids = new Set();
  trenches.segments.forEach((seg, i) => {
    const sat = `${at}.segments[${i}]`;
    if (!IsObject(seg)) { errors.push(`${sat} 要是对象`); return; }
    if (!(typeof seg.id === "string" && /^[A-Za-z0-9_]+$/.test(seg.id))) errors.push(`${sat}.id 要是字母数字下划线`);
    else if (ids.has(seg.id)) errors.push(`${sat}.id 重复：${seg.id}`);
    else ids.add(seg.id);
    if (!TRENCH_PRESETS[seg.preset]) errors.push(`${sat}.preset 要是 ${Object.keys(TRENCH_PRESETS).join(" / ")} 之一`);
    if (!Array.isArray(seg.points) || seg.points.length < 2 || !seg.points.every((p) => Array.isArray(p) && p.length === 2 && Finite(p[0]) && Finite(p[1]))) {
      errors.push(`${sat}.points 要是至少两个 [x, z]`);
    }
    for (const [k, [lo, hi]] of Object.entries(SEGMENT_NUMBERS)) {
      if (seg[k] !== undefined && !(Finite(seg[k]) && seg[k] >= lo && seg[k] <= hi)) errors.push(`${sat}.${k} 要是 ${lo}…${hi} 的数`);
    }
    if (seg.bermSide !== undefined && !["both", "plus", "minus", "none"].includes(seg.bermSide)) errors.push(`${sat}.bermSide 要是 both / plus / minus / none`);
    if (seg.group !== undefined && typeof seg.group !== "string") errors.push(`${sat}.group 要是字符串`);
    if (seg.note !== undefined && typeof seg.note !== "string") errors.push(`${sat}.note 要是字符串`);
    if (seg.depthAlong !== undefined && !(Array.isArray(seg.depthAlong) && seg.depthAlong.length >= 1
      && seg.depthAlong.every((p) => Array.isArray(p) && p.length === 2 && Finite(p[0]) && Finite(p[1]) && p[1] >= 0 && p[1] <= 6))) {
      errors.push(`${sat}.depthAlong 要是 [[弧长 m, 深度 m], …]`);
    }
    if (seg.datumAlong !== undefined && !(Array.isArray(seg.datumAlong) && seg.datumAlong.length >= 1
      && seg.datumAlong.every((p) => Array.isArray(p) && p.length === 2 && Finite(p[0]) && Finite(p[1]) && Math.abs(p[1]) <= 6))) {
      errors.push(`${sat}.datumAlong 要是 [[弧长 m, 抬高 m], …]`);
    }
    if (seg.collapses !== undefined && !(Array.isArray(seg.collapses) && seg.collapses.every((c) => IsObject(c) && Finite(c.s)
      && ["halfLenM", "featherM", "depthM"].every((k) => c[k] === undefined || (Finite(c[k]) && c[k] >= 0))))) {
      errors.push(`${sat}.collapses 要是 [{ s, halfLenM?, featherM?, depthM? }]`);
    }
    TrenchDetailIssues(seg, sat, errors);
    for (const k of Object.keys(seg)) if (!SCENE_TRENCH_SEGMENT_KEYS.includes(k)) errors.push(`${sat} 不认识的字段 ${k}`);
  });
}

// ---------------------------------------------------------------------------
// 编译

/** 场景 trenches → Script_TrenchPlan.CompileTrenchNetwork 的网络规格。 */
export function SceneTrenchSpec(trenches) {
  return {
    version: 1,
    seed: trenches.seed || "scene:trench",
    ...(trenches.earthProfile !== null ? { earthProfile: SCENE_TRENCH_EARTH_PROFILES[trenches.earthProfile || "compact"] } : {}),
    look: trenches.look ?? null,
    propKinds: trenches.propKinds || null,
    noBerm: trenches.noBerm || [],
    ...(Finite(trenches.noBermBelowM) ? { noBermBelowM: trenches.noBermBelowM } : {}),
    segments: trenches.segments.map((seg) => {
      const { points, note, group, ...rest } = seg;
      return { ...rest, points: points.map(([x, z]) => ({ x, z })), source: note || "", group: TrenchGroup(seg) };
    }),
  };
}

/** 基准面字节 → [{ minX, minZ, cellM, cols, rows, heights }]（几块依次排在一个文件里）。 */
export function DecodeTrenchDatum(datum, bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const view = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let offset = 0;
  const patches = datum.patches.map((p) => {
    const count = (p.cols + 1) * (p.rows + 1);
    if (offset + count * 2 > u8.byteLength) throw new Error(`壕沟基准面字节不够（要 ${offset + count * 2}，只有 ${u8.byteLength}）`);
    const heights = new Float32Array(count);
    for (let i = 0; i < count; i++) heights[i] = view.getInt16(offset + i * 2, true) / 100;
    offset += count * 2;
    return { ...p, heights };
  });
  if (offset !== u8.byteLength) throw new Error(`壕沟基准面多出 ${u8.byteLength - offset} 字节`);
  return patches;
}

/** [{ minX, minZ, cellM, cols, rows, heights }] → int16 小端厘米字节。 */
export function EncodeTrenchDatum(patches) {
  const total = patches.reduce((n, p) => n + p.heights.length, 0);
  const out = new Uint8Array(total * 2);
  const view = new DataView(out.buffer);
  let i = 0;
  for (const p of patches) for (const h of p.heights) view.setInt16(2 * i++, Math.max(-32768, Math.min(32767, Math.round(h * 100))), true);
  return out;
}

/** 基准面采样：落在哪块里就在那块里双线性插值，哪块都不在就用 fallback（地面）。 */
export function TrenchDatumSampler(patches, fallback) {
  return (x, z) => {
    for (const p of patches) {
      const gx = (x - p.minX) / p.cellM, gz = (z - p.minZ) / p.cellM;
      if (gx < 0 || gz < 0 || gx > p.cols || gz > p.rows) continue;
      const ix = Math.min(p.cols - 1, Math.floor(gx)), iz = Math.min(p.rows - 1, Math.floor(gz));
      const u = gx - ix, v = gz - iz, w = p.cols + 1, h = p.heights;
      const a = h[iz * w + ix], b = h[iz * w + ix + 1], c = h[(iz + 1) * w + ix], d = h[(iz + 1) * w + ix + 1];
      return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
    }
    return fallback ? fallback(x, z) : 0;
  };
}

/** 整张高度图（未挖）→ 同三角剖分的采样（同 Script_EditorBlockoutLevels.HeightGridSampler，这里不 import 它免得绕圈）。 */
export function GridSampler(terrain, heights) {
  const { minX, minZ, cellM, cols, rows } = terrain;
  const width = cols + 1, w = cols * cellM, d = rows * cellM;
  const H = (ix, iz) => heights[Math.max(0, Math.min(rows, iz)) * width + Math.max(0, Math.min(cols, ix))];
  return (px, pz) => {
    const gx = Math.max(0, Math.min(1, (px - minX) / w)) * cols, gz = Math.max(0, Math.min(1, (pz - minZ) / d)) * rows;
    const ix = Math.min(cols - 1, Math.floor(gx)), iz = Math.min(rows - 1, Math.floor(gz));
    const u = gx - ix, v = gz - iz;
    const a = H(ix, iz), b = H(ix + 1, iz), c = H(ix, iz + 1), e = H(ix + 1, iz + 1);
    return u + v <= 1 ? a + (b - a) * u + (c - a) * v : e + (c - e) * (1 - u) + (b - e) * (1 - v);
  };
}

/**
 * 编好的壕沟网络。datum：解好的基准面块（DecodeTrenchDatum），pre：未挖地面的高度采样。
 * 没有 trenches 或一段都没有返回 null。
 */
export function CompileSceneTrenches(trenches, { datum = [], pre = null } = {}) {
  if (!trenches?.segments?.length) return null;
  const natural = TrenchDatumSampler(datum, pre);
  const plan = CompileTrenchNetwork(SceneTrenchSpec(trenches), { natural });
  return plan;
}

/**
 * 按壕沟网络把地面挖出来：只扫沟的影响范围（plan.bounds，或给的 region）里的格点。
 * @returns Float32Array（新的一份；pre 不动）
 */
export function CarveSceneHeights(terrain, pre, plan, { natural = null, region = null, into = null } = {}) {
  const out = into || new Float32Array(pre);
  if (!plan) return out;
  const b = region || plan.bounds;
  const { minX, minZ, cellM, cols, rows } = terrain, width = cols + 1;
  const ix0 = Math.max(0, Math.floor((b.minX - minX) / cellM)), ix1 = Math.min(cols, Math.ceil((b.maxX - minX) / cellM));
  const iz0 = Math.max(0, Math.floor((b.minZ - minZ) / cellM)), iz1 = Math.min(rows, Math.ceil((b.maxZ - minZ) / cellM));
  const base = natural || plan.natural;
  for (let iz = iz0; iz <= iz1; iz++) {
    const z = minZ + iz * cellM;
    for (let ix = ix0; ix <= ix1; ix++) {
      const i = iz * width + ix, x = minX + ix * cellM, h = pre[i];
      out[i] = plan.Apply(x, z, h, base ? base(x, z) : h);
    }
  }
  return out;
}

/** 读好的场景 → { heights（挖好的）, pre（没挖的）, plan, datum }。没有壕沟时 heights === pre。 */
export function PrepareSceneTerrain(doc, pre, datumBytes = null) {
  const trenches = doc.trenches;
  if (!trenches?.segments?.length) return { heights: pre, pre, plan: null, datum: [] };
  const datum = trenches.datum && datumBytes ? DecodeTrenchDatum(trenches.datum, datumBytes) : [];
  const preSampler = GridSampler(doc.terrain, pre);
  const plan = CompileSceneTrenches(trenches, { datum, pre: preSampler });
  return { heights: CarveSceneHeights(doc.terrain, pre, plan), pre, plan, datum };
}

/** 俯视图 / 地面涂色用的沟中线（控制点折线）。 */
export function SceneTrenchLines(plan) {
  return plan ? plan.segments.map((seg) => seg.control.map((p) => ({ x: p.x, z: p.z }))) : [];
}

/**
 * 只留跟这一块范围沾边的段（白盒关卡按段落取一块建场：别处的沟不摆构件、不画土面细节）。挖地面、Corridor 照旧用整张网，
 * 返回的是同一份网络换了 segments 的浅拷贝。
 */
export function SliceTrenchPlan(plan, bounds, marginM = 4) {
  if (!plan || !bounds) return plan;
  const segments = plan.segments.filter((s) => s.bounds.maxX >= bounds.minX - marginM && s.bounds.minX <= bounds.maxX + marginM
    && s.bounds.maxZ >= bounds.minZ - marginM && s.bounds.minZ <= bounds.maxZ + marginM);
  if (!segments.length) return null;
  return segments.length === plan.segments.length ? plan : Object.freeze({ ...plan, segments: Object.freeze(segments) });
}

/** 段的影响范围（米）：拖点前后各挖一次时只重算这一块。 */
export function SegmentReachBounds(plan, ids) {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const seg of plan?.segments || []) {
    if (ids && !ids.includes(seg.id)) continue;
    minX = Math.min(minX, seg.bounds.minX); maxX = Math.max(maxX, seg.bounds.maxX);
    minZ = Math.min(minZ, seg.bounds.minZ); maxZ = Math.max(maxZ, seg.bounds.maxZ);
  }
  return Number.isFinite(minX) ? { minX, maxX, minZ, maxZ } : null;
}

export function UnionBounds(a, b) {
  if (!a) return b; if (!b) return a;
  return { minX: Math.min(a.minX, b.minX), maxX: Math.max(a.maxX, b.maxX), minZ: Math.min(a.minZ, b.minZ), maxZ: Math.max(a.maxZ, b.maxZ) };
}
