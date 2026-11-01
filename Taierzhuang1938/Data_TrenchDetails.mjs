// 壕沟细节：每段沟单独开关、单独调参数（docs/Data_TrenchDetails.md 是给人和 agent 看的参数表）。
//
// 用户 2026-11-01：「护壁、踏板，甚至是土崖、土团、草根、沟沿碎土这些布设的细节，应该也是作为 PCG 的可生成选项来的，
// 而不是默认全部都有，也应该有参数可调，方便 agent 在合适的需求地方配置合适的表现」。
//
// 一段沟的细节按三层取值，后面的盖前面的：
//   1. 缺省：护壁 / 踏板 / 射击位 / 杂物的数值取沟型（Script_TrenchPlan.TRENCH_PRESETS），土面细节取全关那一套
//      （Data_TrenchAppearance.TRENCH_APPEARANCE、Data_TrenchSurface.TRENCH_SURFACE）。开关缺省 = 现行第一关的样子：
//      木护壁、踏板关（裸土，对标概念图 07），射击位、杂物、所有土面细节开。
//   2. 表现套餐 look（TRENCH_LOOKS）：整组改，例如「弃置旧沟」把构件全关、塌土草根加多。网络级 look 给所有段，段上的 look 盖它。
//   3. 段上的 details：只写想改的那几项。写法 { revetment: { on: true, spacingM: 3.5 }, roots: false }——
//      true / false 是只开关不改数；对象里不写 on 就保持上一层的开关。
//
// 纯数据 + 纯函数：零 three，node 与浏览器共用。

import { TRENCH_APPEARANCE } from "./Data_TrenchAppearance.mjs";
import { TRENCH_SURFACE } from "./Data_TrenchSurface.mjs";

const A = TRENCH_APPEARANCE, S = TRENCH_SURFACE;
const F = Object.freeze;

/**
 * 细节目录。kind：dressing = 有体块的构件（白盒、正式都摆，可能挡人）；earth = 土面细节（只有正式场景画，不挡人）。
 * params：参数名 → { label, unit, min, max, step?, type? }；type "range" 是 [下限, 上限] 两个数，"side" 是 plus / minus，
 * "list" 是资产名数组。from：earth 类参数对应 TRENCH_APPEARANCE / TRENCH_SURFACE 里的哪个键（解析时换过去）。
 */
export const TRENCH_DETAILS = F({
  revetment: F({ label: "木护壁", kind: "dressing", note: "沟壁两侧的木桩 + 横板（不挡人）", params: F({
    spacingM: F({ label: "间距", unit: "m", min: 1.5, max: 12, step: 0.1 }),
    spacingJitter: F({ label: "间距抖动", unit: "比例", min: 0, max: 0.8, step: 0.01 }),
    skipChance: F({ label: "缺一块的概率", unit: "0–1", min: 0, max: 1, step: 0.01 }),
    slatsMin: F({ label: "横板最少", unit: "块", min: 1, max: 6, step: 1 }),
    slatsMax: F({ label: "横板最多", unit: "块", min: 1, max: 6, step: 1 }),
    postHMin: F({ label: "桩高下限", unit: "m", min: 0.4, max: 2, step: 0.05 }),
    postHMax: F({ label: "桩高上限", unit: "m", min: 0.4, max: 2, step: 0.05 }),
    slatLenM: F({ label: "横板长", unit: "m", min: 1, max: 6, step: 0.1 }),
    leanRad: F({ label: "歪斜", unit: "弧度", min: 0, max: 0.3, step: 0.01 }),
  }) }),
  duckboard: F({ label: "踏板", kind: "dressing", note: "沟底顺沟铺的木板（不挡人）", params: F({
    chance: F({ label: "每站出现概率", unit: "0–1", min: 0, max: 1, step: 0.01 }),
    lenM: F({ label: "长", unit: "m", min: 0.6, max: 5, step: 0.1 }),
    widthM: F({ label: "宽", unit: "m", min: 0.3, max: 1.6, step: 0.05 }),
  }) }),
  bays: F({ label: "射击位", kind: "dressing", note: "沟沿外侧的矮土台，掩体，**挡人**", params: F({
    everyM: F({ label: "每隔", unit: "m", min: 6, max: 80, step: 1 }),
    maxCount: F({ label: "最多", unit: "个", min: 0, max: 20, step: 1 }),
    lenMin: F({ label: "长下限", unit: "m", min: 1, max: 8, step: 0.1 }),
    lenMax: F({ label: "长上限", unit: "m", min: 1, max: 8, step: 0.1 }),
    h: F({ label: "高", unit: "m", min: 0.2, max: 1.2, step: 0.05 }),
    d: F({ label: "厚", unit: "m", min: 0.4, max: 2, step: 0.05 }),
    side: F({ label: "在哪侧", type: "side" }),
  }) }),
  props: F({ label: "沟底杂物", kind: "dressing", note: "箱子、麻袋之类撒在沟底（不挡人）", params: F({
    perM: F({ label: "每米几件", unit: "件/m", min: 0, max: 0.2, step: 0.001 }),
    kinds: F({ label: "撒哪些", type: "list" }),
  }) }),
  cliffs: F({ label: "土崖（沟壁）", kind: "earth", note: "沟壁换成带裂面、垮口的土崖模型；关了是平滑的地形坡面", params: F({}) }),
  spoilSkin: F({ label: "弃土表皮", kind: "earth", note: "沟沿弃土垄表面一层松土", params: F({}) }),
  clods: F({ label: "沟壁土团", kind: "earth", note: "嵌在沟壁上的大小土块", params: F({
    chance: F({ label: "每站概率", unit: "0–1", min: 0, max: 1, step: 0.01, from: "clodChance" }),
    count: F({ label: "每站另加", unit: "个", min: 0, max: 12, step: 1, from: "bankClods" }),
    radiusM: F({ label: "半径", unit: "m", type: "range", min: 0.02, max: 0.3, step: 0.005, from: "clodRadiusM" }),
    reliefM: F({ label: "凸出", unit: "m", type: "range", min: 0.01, max: 0.2, step: 0.005, from: "clodReliefM" }),
  }) }),
  crumbs: F({ label: "沟底碎土", kind: "earth", note: "落在沟底、堆在墙脚的碎土", params: F({
    count: F({ label: "每站", unit: "个", min: 0, max: 40, step: 1, from: "crumbs" }),
    toe: F({ label: "其中堆墙脚的", unit: "个", min: 0, max: 40, step: 1, from: "toeCrumbs" }),
    radiusM: F({ label: "半径", unit: "m", type: "range", min: 0.01, max: 0.3, step: 0.005, from: "crumbRadiusM" }),
  }) }),
  lip: F({ label: "沟沿碎土", kind: "earth", note: "沟沿上被踩碎、带草根的土块", params: F({
    count: F({ label: "每站", unit: "个", min: 0, max: 40, step: 1, from: "lipClods" }),
    radiusM: F({ label: "半径", unit: "m", type: "range", min: 0.02, max: 0.4, step: 0.005, from: "lipRadiusM" }),
    reliefM: F({ label: "凸出", unit: "m", type: "range", min: 0.01, max: 0.3, step: 0.005, from: "lipReliefM" }),
  }) }),
  spoilClods: F({ label: "弃土土块", kind: "earth", note: "弃土垄上的土块", params: F({
    count: F({ label: "每站", unit: "个", min: 0, max: 40, step: 1, from: "spoilClods" }),
    radiusM: F({ label: "半径", unit: "m", type: "range", min: 0.02, max: 0.4, step: 0.005, from: "spoilRadiusM" }),
    reliefM: F({ label: "凸出", unit: "m", type: "range", min: 0.01, max: 0.3, step: 0.005, from: "spoilReliefM" }),
  }) }),
  roots: F({ label: "草根", kind: "earth", note: "沟沿往下垂的草根须", params: F({
    chance: F({ label: "每站概率", unit: "0–1", min: 0, max: 1, step: 0.01, from: "rootChance" }),
    strands: F({ label: "每簇几根", unit: "根", min: 1, max: 12, step: 1, from: "rootStrands" }),
    lengthM: F({ label: "长", unit: "m", type: "range", min: 0.1, max: 1.5, step: 0.01, from: "rootLengthM" }),
  }) }),
  grass: F({ label: "沟沿干草", kind: "earth", note: "垂在沟沿上的干草垫", params: F({
    chance: F({ label: "每站概率", unit: "0–1", min: 0, max: 1, step: 0.01, from: "grass.chance" }),
    scale: F({ label: "大小", unit: "倍", type: "range", min: 0.1, max: 1.5, step: 0.01, from: "grass.scale" }),
  }) }),
  stones: F({ label: "碎石", kind: "earth", note: "沟壁脚下的小石头", params: F({
    chance: F({ label: "每站概率", unit: "0–1", min: 0, max: 1, step: 0.01, from: "stone.chance" }),
    scale: F({ label: "大小", unit: "m", type: "range", min: 0.01, max: 0.4, step: 0.005, from: "stone.scale" }),
  }) }),
});
export const TRENCH_DETAIL_KEYS = F(Object.keys(TRENCH_DETAILS));

/** 缺省开关：现行第一关的样子（木护壁、踏板关，其余开）。 */
const DEFAULT_ON = F({ revetment: false, duckboard: false });

/** earth 类参数的缺省值：从全关那一套里取。 */
function EarthDefault(spec) {
  const [root, key] = spec.from.includes(".") ? spec.from.split(".") : [null, spec.from];
  const value = root ? S[root][key] : A[key];
  return Array.isArray(value) ? [...value] : value;
}

const OFF = F({ on: false });
/**
 * 表现套餐。label 给人看，note 说用在哪；patch 的写法同段上的 details。
 * 新加套餐写在这里，并在 docs/Data_TrenchDetails.md 补一行。
 */
export const TRENCH_LOOKS = F({
  fresh: F({ label: "新挖完好", note: "刚修好、有人守的沟：木护壁、踏板齐全，土面干净，草根少", patch: F({
    revetment: F({ on: true }), duckboard: F({ on: true }),
    crumbs: F({ count: 6, toe: 2 }), roots: F({ chance: 0.3 }), grass: F({ chance: 0.06 }),
  }) }),
  bare: F({ label: "裸土沟", note: "只有土，不摆任何构件（护壁、踏板、射击位、杂物都关），土面细节照常", patch: F({
    revetment: OFF, duckboard: OFF, bays: OFF, props: OFF,
  }) }),
  abandoned: F({ label: "弃置旧沟", note: "撤走了的旧阵地：构件全没了，塌土、碎土、草根、干草都多", patch: F({
    revetment: OFF, duckboard: OFF, bays: OFF, props: OFF,
    clods: F({ chance: 0.6, count: 5 }), crumbs: F({ count: 20, toe: 8 }), lip: F({ count: 20 }),
    roots: F({ chance: 0.9, strands: 7 }), grass: F({ chance: 0.3 }), stones: F({ chance: 0.08 }),
  }) }),
  scrape: F({ label: "临时掘壕", note: "仓促挖的浅沟：没有构件，新土多，没有草根、干草", patch: F({
    revetment: OFF, duckboard: OFF, bays: OFF, props: OFF,
    roots: OFF, grass: F({ chance: 0.03 }), crumbs: F({ count: 8, toe: 4 }), spoilClods: F({ count: 16 }),
  }) }),
});
export const TRENCH_LOOK_KEYS = F(Object.keys(TRENCH_LOOKS));

function ApplyPatch(out, patch) {
  for (const [key, value] of Object.entries(patch || {})) {
    if (!out[key]) continue;
    if (typeof value === "boolean") out[key].on = value;
    else if (value && typeof value === "object") {
      for (const [k, v] of Object.entries(value)) out[key][k] = Array.isArray(v) ? [...v] : v;
    }
  }
}

/**
 * 一段沟最后用的细节：{ revetment: { on, spacingM, … }, …, cliffs: { on }, … }。
 * @param presetParams 沟型合并后的参数（TrenchPreset(name)：含 revetment / duckboard / bays / props 四组）
 * @param networkLook  网络级套餐名（可空）
 * @param segment      { look?, details? }
 * @param propKinds    杂物的缺省资产名（场景用 Prop/*；缺省沿用沟型里那三样）
 */
export function ResolveTrenchDetails(presetParams, { networkLook = null, segment = {}, propKinds = null } = {}) {
  const out = {};
  for (const [key, info] of Object.entries(TRENCH_DETAILS)) {
    const values = { on: DEFAULT_ON[key] ?? true };
    if (info.kind === "dressing") {
      const base = presetParams?.[key] || {};
      for (const [k, v] of Object.entries(base)) values[k] = Array.isArray(v) ? [...v] : v;
      if (key === "props" && propKinds) values.kinds = [...propKinds];
    }
    // 土面细节只记改过的数：没改的到画的时候再读全关那一套（TRENCH_APPEARANCE / TRENCH_SURFACE），那边调了跟着变；
    // 要看实际用的数走 EffectiveTrenchDetail。
    out[key] = values;
  }
  const look = segment.look ?? networkLook;
  if (look && TRENCH_LOOKS[look]) ApplyPatch(out, TRENCH_LOOKS[look].patch);
  ApplyPatch(out, segment.details);
  for (const value of Object.values(out)) Object.freeze(value);
  return F(out);
}

/** 一项细节实际用的数（土面细节没改的取全关那一套）——检视面板、参数表用。 */
export function EffectiveTrenchDetail(details, key) {
  const info = TRENCH_DETAILS[key], d = details[key];
  if (info.kind === "dressing") return d;
  const out = { on: d.on };
  for (const [k, spec] of Object.entries(info.params)) out[k] = d[k] !== undefined ? d[k] : EarthDefault(spec);
  return out;
}

/** 解析好的细节 → BuildTrenchEarth 用的样式（只盖改过的键与关掉的项；什么都没改返回 null = 用 base）。 */
export function TrenchEarthStyle(details, base = A) {
  const patch = {};
  for (const key of ["clods", "crumbs", "lip", "spoilClods", "roots"]) {
    const info = TRENCH_DETAILS[key], d = details[key];
    for (const [k, spec] of Object.entries(info.params)) {
      if (!d.on) { if (spec.type !== "range") patch[spec.from] = 0; continue; }
      if (d[k] !== undefined) patch[spec.from] = d[k];
    }
  }
  return Object.keys(patch).length ? { ...base, ...patch } : null;
}

/** 解析好的细节 → BuildTrenchSurface 每段用的 { stone: { chance, scale }, grass: { chance, scale } }（没改的读全关那一套）。 */
export function TrenchSurfaceStyle(details) {
  const One = (d, global) => ({ chance: d.on ? (d.chance ?? global.chance) : 0, scale: d.scale ?? global.scale });
  return { stone: One(details.stones, S.stone), grass: One(details.grass, S.grass) };
}

/** 段上 look / details 的写法问题（场景校验用）。 */
export function TrenchDetailIssues(segment, at, errors) {
  if (segment.look !== undefined && !TRENCH_LOOKS[segment.look]) errors.push(`${at}.look 要是 ${TRENCH_LOOK_KEYS.join(" / ")} 之一`);
  if (segment.details === undefined) return;
  if (!segment.details || typeof segment.details !== "object" || Array.isArray(segment.details)) { errors.push(`${at}.details 要是对象`); return; }
  for (const [key, value] of Object.entries(segment.details)) {
    const info = TRENCH_DETAILS[key];
    if (!info) { errors.push(`${at}.details.${key} 不认识（认 ${TRENCH_DETAIL_KEYS.join(" / ")}）`); continue; }
    if (typeof value === "boolean") continue;
    if (!value || typeof value !== "object" || Array.isArray(value)) { errors.push(`${at}.details.${key} 要是 true / false 或对象`); continue; }
    for (const [k, v] of Object.entries(value)) {
      if (k === "on") { if (typeof v !== "boolean") errors.push(`${at}.details.${key}.on 要是 true / false`); continue; }
      const spec = info.params[k];
      // 沟型里还有几项没进目录的（insetM、thickM、jitter），照收但要是数
      if (!spec) {
        if (!(typeof v === "number" && Number.isFinite(v))) errors.push(`${at}.details.${key}.${k} 不认识`);
        continue;
      }
      if (spec.type === "side") { if (v !== "plus" && v !== "minus") errors.push(`${at}.details.${key}.${k} 要是 plus / minus`); continue; }
      if (spec.type === "list") { if (!Array.isArray(v) || !v.every((s) => typeof s === "string" && s)) errors.push(`${at}.details.${key}.${k} 要是资产名数组`); continue; }
      const nums = spec.type === "range" ? v : [v];
      if (!Array.isArray(nums) || nums.length !== (spec.type === "range" ? 2 : 1) || !nums.every((n) => typeof n === "number" && Number.isFinite(n))) {
        errors.push(`${at}.details.${key}.${k} 要是${spec.type === "range" ? " [下限, 上限]" : "数字"}`);
      } else if (nums.some((n) => n < spec.min || n > spec.max)) errors.push(`${at}.details.${key}.${k} 超出 ${spec.min}…${spec.max}`);
    }
  }
}
