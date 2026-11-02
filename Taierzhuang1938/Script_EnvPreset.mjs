// 环境预设与场景区域文件：格式、校验、写法、新建、旧天空预设转换（docs/Data_Environment.md §4）。
//
//   Environment/EnvPreset_<Id>.json         预设 = 组件容器（每种组件只留一份），可被多个区域、多个场景复用
//   Scenes/<Scene>/Environment_<Scene>.json 场景的环境：昼夜时钟的默认值 + 区域列表（区域引用预设、管影响范围）
//   Environment/Level_<Id>.json             正片关卡（不是场景文件建的关，例如第一关 ?whitebox=p012）的区域文件，格式同上；
//                                           哪一关用哪份在 Data_EnvLevels，多一节 stages（任务步骤 → 这一步几点）
//
// 纯函数，零 three 依赖：框架、编辑器、本机存盘口（scripts/Script_LocalPreview.mjs）、测试共用。

import { ENV_COMPONENTS } from "./Data_EnvComponents.mjs";
import { ENV_RUNTIME } from "./Data_Tuning_Environment.mjs";
import { CloneValue, IsTrack, ValueFits, WrapHour, SameValue } from "./Script_EnvTrack.mjs";
import { ENV_COMPONENT_LOGIC } from "./Script_EnvComponents.mjs";

export const ENV_PRESET_SCHEMA = "tengxian-env-preset/1";
export const ENV_SCENE_SCHEMA = "tengxian-env-scene/1";
export const ENV_ID_RE = /^[A-Z][A-Za-z0-9]{0,63}$/;
export const ENV_PRESET_FILE_RE = /^Taierzhuang1938\/Environment\/EnvPreset_[A-Z][A-Za-z0-9]{0,63}\.json$/;
export const SCENE_ENV_FILE_RE = /^Taierzhuang1938\/Scenes\/([A-Z][A-Za-z0-9]{0,63})\/Environment_\1\.json$/;
export const LEVEL_ENV_FILE_RE = /^Taierzhuang1938\/Environment\/Level_[A-Z][A-Za-z0-9]{0,63}\.json$/;
/** 区域文件的两种归属：scene = 场景文件建的关（白盒编辑器），level = 正片关卡（Data_EnvLevels 登记）。 */
export const ENV_TARGET_KINDS = Object.freeze(["scene", "level"]);
export const VOLUME_SHAPES = Object.freeze(["global", "box", "sphere"]);
export const VOLUME_MODES = Object.freeze(["partial", "full"]);
const INTERPS = new Set(["smooth", "linear", "step"]);

/** 仓库里的路径（相对仓库根）与页面里的地址（相对 Taierzhuang1938/）。 */
export const EnvPresetRepoPath = (id) => `Taierzhuang1938/Environment/EnvPreset_${id}.json`;
export const EnvPresetUrl = (id) => `./Environment/EnvPreset_${id}.json`;
export const SceneEnvRepoPath = (scene) => `Taierzhuang1938/Scenes/${scene}/Environment_${scene}.json`;
export const SceneEnvUrl = (scene) => `./Scenes/${scene}/Environment_${scene}.json`;
export const LevelEnvRepoPath = (id) => `Taierzhuang1938/Environment/Level_${id}.json`;
export const LevelEnvUrl = (id) => `./Environment/Level_${id}.json`;
/** target = { kind: "scene" | "level", id } → 区域文件地址 / 仓库路径。 */
export const ZoneFileUrl = (target) => (target.kind === "level" ? LevelEnvUrl(target.id) : SceneEnvUrl(target.id));
export const ZoneFileRepoPath = (target) => (target.kind === "level" ? LevelEnvRepoPath(target.id) : SceneEnvRepoPath(target.id));

const DECLS = new Map(ENV_COMPONENTS.map((d) => [d.type, d]));
export function ComponentDecl(type) { return DECLS.get(type) || null; }
export function ParamDecl(type, key) { return DECLS.get(type)?.params.find((p) => p.key === key) || null; }

// ---------------------------------------------------------------------------
// 校验

function IsObject(v) { return !!v && typeof v === "object" && !Array.isArray(v); }
function IsFiniteNumber(v) { return typeof v === "number" && Number.isFinite(v); }
function IsVec3(v) { return Array.isArray(v) && v.length === 3 && v.every(IsFiniteNumber); }

/** 校验一份预设。→ { ok, errors, warnings } */
export function ValidateEnvPreset(doc) {
  const errors = [], warnings = [];
  if (!IsObject(doc)) return { ok: false, errors: ["预设不是对象"], warnings };
  if (doc.schema !== ENV_PRESET_SCHEMA) errors.push(`schema 要是 ${ENV_PRESET_SCHEMA}`);
  if (typeof doc.id !== "string" || !ENV_ID_RE.test(doc.id)) errors.push("id 要是大写字母开头的英文字母数字（≤ 64）");
  if (doc.title !== undefined && typeof doc.title !== "string") errors.push("title 要是文字");
  const lookIds = new Set();
  if (doc.looks !== undefined) {
    if (!Array.isArray(doc.looks)) errors.push("looks 要是数组");
    else doc.looks.forEach((look, i) => {
      if (!IsObject(look) || typeof look.id !== "string" || !look.id) { errors.push(`looks[${i}] 要有 id`); return; }
      if (lookIds.has(look.id)) errors.push(`looks 里 ${look.id} 重复`);
      lookIds.add(look.id);
      if (typeof look.label !== "string") errors.push(`looks[${i}].label 要是文字`);
      if (!IsFiniteNumber(look.hour) || look.hour < 0 || look.hour >= 24) errors.push(`looks[${i}].hour 要在 0–24 之间`);
    });
  }
  if (!IsObject(doc.components)) errors.push("components 要是对象（键是组件 type）");
  else for (const [type, comp] of Object.entries(doc.components)) {
    const decl = DECLS.get(type);
    if (!decl) { errors.push(`components 里有没声明的组件 ${type}`); continue; }
    if (!IsObject(comp)) { errors.push(`组件 ${type} 要是对象`); continue; }
    if (comp.enabled !== undefined && typeof comp.enabled !== "boolean") errors.push(`组件 ${type}.enabled 要是 true / false`);
    if (comp.params !== undefined && !IsObject(comp.params)) { errors.push(`组件 ${type}.params 要是对象`); continue; }
    for (const [key, value] of Object.entries(comp.params || {})) {
      const param = decl.params.find((p) => p.key === key);
      const at = `${type}.${key}`;
      if (!param) { errors.push(`${at}：组件里没有这个参数`); continue; }
      if (!IsTrack(value)) { if (!ValueFits(param, value)) errors.push(`${at}：值不合类型（${param.kind}）`); continue; }
      if (param.animatable === false) errors.push(`${at}：这个参数只能是固定值`);
      if (value.interp !== undefined && !INTERPS.has(value.interp)) errors.push(`${at}.interp 只能是 smooth / linear / step`);
      if (!value.keys.length) errors.push(`${at}：关键帧至少一帧`);
      const hours = [];
      value.keys.forEach((k, i) => {
        if (!IsObject(k)) { errors.push(`${at}.keys[${i}] 要是对象`); return; }
        if (!IsFiniteNumber(k.h) || k.h < 0 || k.h >= 24) errors.push(`${at}.keys[${i}].h 要在 0–24 之间`);
        if (hours.some((h) => Math.abs(h - k.h) < 1e-3)) errors.push(`${at}：${k.h} 点有两帧`);
        hours.push(k.h);
        if (!ValueFits(param, k.v)) errors.push(`${at}.keys[${i}].v 不合类型（${param.kind}）`);
        if (k.tag !== undefined && (typeof k.tag !== "string" || !k.tag)) errors.push(`${at}.keys[${i}].tag 要是文字`);
        else if (k.tag !== undefined && lookIds.size && !lookIds.has(k.tag)) warnings.push(`${at}.keys[${i}].tag ${k.tag} 不在 looks 里`);
      });
    }
  }
  return { ok: errors.length === 0, errors, warnings };
}

/**
 * 一拍的时间（关键帧的 time、Timeline / 预演的 time 事件、正片关卡区域文件的 stages）：
 *   { "hour": 17 } 拨到几点 · { "look": "dusk" } 拨到兜底预设里那一套表现的时刻 · 可带 "blendS"（按真实秒数往前走过去）
 * → 错误列表
 */
export function TimeSpecErrors(spec, at = "time") {
  const errors = [];
  if (!IsObject(spec)) return [`${at} 要是对象 { hour } 或 { look }`];
  const hasHour = spec.hour !== undefined, hasLook = spec.look !== undefined;
  if (hasHour === hasLook) errors.push(`${at} 要写 hour 或 look（只写一个）`);
  if (hasHour && !(IsFiniteNumber(spec.hour) && spec.hour >= 0 && spec.hour < 24)) errors.push(`${at}.hour 要在 0–24 之间`);
  if (hasLook && (typeof spec.look !== "string" || !spec.look)) errors.push(`${at}.look 要是那一套表现的 id（day / dusk / night…）`);
  if (spec.blendS !== undefined && !(IsFiniteNumber(spec.blendS) && spec.blendS >= 0)) errors.push(`${at}.blendS 要是 ≥ 0 的秒数`);
  return errors;
}

/**
 * 这一拍几点：按顺序表从这一拍往前找最近写了时间的那一拍（后面的拍不写就沿用前面的）。
 * @param {object} times id → 时间
 * @param {string[]} order 拍的顺序
 * → { spec, from } 或 null（之前都没写 = 用区域文件的默认时间）
 */
export function BeatTime(times, order, current) {
  if (!times) return null;
  const i = order.indexOf(current);
  if (i < 0) return times[current] ? { spec: times[current], from: current } : null;
  for (let k = i; k >= 0; k -= 1) if (times[order[k]]) return { spec: times[order[k]], from: order[k] };
  return null;
}

/** 一个区域在不在给的点（{x,y,z}）里。 */
export function VolumeContains(volume, point) {
  if (!volume || volume.enabled === false) return false;
  if (volume.shape === "global") return true;
  if (!point) return false;
  const [cx, cy, cz] = volume.center || [0, 0, 0];
  const dx = point.x - cx, dy = point.y - cy, dz = point.z - cz;
  if (volume.shape === "sphere") return dx * dx + dy * dy + dz * dz <= (volume.radius || 0) ** 2;
  if (volume.shape === "box") {
    const yaw = (volume.yawDeg || 0) * Math.PI / 180;
    const c = Math.cos(yaw), s = Math.sin(yaw);
    // 绕 Y 转 -yaw 回到盒子自己的坐标（与 three rotation.y 同向）
    const lx = c * dx - s * dz, lz = s * dx + c * dz;
    const [w, h, d] = volume.size || [0, 0, 0];
    return Math.abs(lx) <= w / 2 && Math.abs(dy) <= h / 2 && Math.abs(lz) <= d / 2;
  }
  return false;
}

/**
 * 校验场景的环境文件。presetIds 给了就核对引用（读不到的预设 = 错）。
 * → { ok, errors, warnings }
 */
export function ValidateSceneEnv(doc, { presetIds = null } = {}) {
  const errors = [], warnings = [];
  if (!IsObject(doc)) return { ok: false, errors: ["场景环境不是对象"], warnings };
  if (doc.schema !== ENV_SCENE_SCHEMA) errors.push(`schema 要是 ${ENV_SCENE_SCHEMA}`);
  if (typeof doc.scene !== "string" || !ENV_ID_RE.test(doc.scene)) errors.push("scene 要是场景 id");
  const time = doc.time;
  if (!IsObject(time)) errors.push("time 要是对象 { hour, speed, paused }");
  else {
    if (!IsFiniteNumber(time.hour) || time.hour < 0 || time.hour >= 24) errors.push("time.hour 要在 0–24 之间");
    if (time.speed !== undefined && (!IsFiniteNumber(time.speed) || time.speed < 0)) errors.push("time.speed 要是 ≥ 0 的数（每秒几个游戏小时）");
    if (time.paused !== undefined && typeof time.paused !== "boolean") errors.push("time.paused 要是 true / false");
  }
  if (!Array.isArray(doc.volumes)) errors.push("volumes 要是数组");
  else {
    const ids = new Set();
    let globals = 0;
    doc.volumes.forEach((v, i) => {
      const at = `volumes[${i}]`;
      if (!IsObject(v)) { errors.push(`${at} 要是对象`); return; }
      if (typeof v.id !== "string" || !ENV_ID_RE.test(v.id)) errors.push(`${at}.id 要是大写字母开头的英文字母数字`);
      else if (ids.has(v.id)) errors.push(`${at}.id ${v.id} 重复`);
      ids.add(v.id);
      if (v.name !== undefined && typeof v.name !== "string") errors.push(`${at}.name 要是文字`);
      if (!VOLUME_SHAPES.includes(v.shape)) errors.push(`${at}.shape 只能是 ${VOLUME_SHAPES.join(" / ")}`);
      if (v.shape === "global") globals += 1;
      if (v.shape === "box") {
        if (!IsVec3(v.center)) errors.push(`${at}.center 要是 [x, y, z]`);
        if (!IsVec3(v.size) || v.size.some((n) => n <= 0)) errors.push(`${at}.size 要是三个正数 [宽, 高, 深]`);
        if (v.yawDeg !== undefined && !IsFiniteNumber(v.yawDeg)) errors.push(`${at}.yawDeg 要是数`);
      }
      if (v.shape === "sphere") {
        if (!IsVec3(v.center)) errors.push(`${at}.center 要是 [x, y, z]`);
        if (!IsFiniteNumber(v.radius) || v.radius <= 0) errors.push(`${at}.radius 要是正数`);
      }
      if (!IsFiniteNumber(v.priority)) errors.push(`${at}.priority 要是数`);
      if (!IsFiniteNumber(v.blendS) || v.blendS < 0) errors.push(`${at}.blendS 要是 ≥ 0 的秒数`);
      if (!VOLUME_MODES.includes(v.mode)) errors.push(`${at}.mode 只能是 partial（只覆盖包含的组件）/ full（完全覆盖）`);
      if (typeof v.preset !== "string" || !ENV_ID_RE.test(v.preset)) errors.push(`${at}.preset 要是预设 id`);
      else if (presetIds && !presetIds.has(v.preset)) errors.push(`${at}.preset ${v.preset} 读不到（Environment/EnvPreset_${v.preset}.json）`);
      if (v.enabled !== undefined && typeof v.enabled !== "boolean") errors.push(`${at}.enabled 要是 true / false`);
    });
    if (!globals) warnings.push("没有兜底区域（shape: global）：走出所有区域时没有环境来源，各组件取关闭值");
  }
  if (doc.stages !== undefined) {
    if (!IsObject(doc.stages)) errors.push("stages 要是对象（任务步骤 id → { hour } / { look }）");
    else for (const [step, spec] of Object.entries(doc.stages)) errors.push(...TimeSpecErrors(spec, `stages.${step}`));
  }
  return { ok: errors.length === 0, errors, warnings };
}

// ---------------------------------------------------------------------------
// 写法：两格缩进，短数组（向量）与关键帧一行一个，方便 diff 与 agent 直接改

function Inline(value) { return JSON.stringify(value).replace(/,/g, ", ").replace(/":/g, "\": "); }

function IsShort(value) {
  if (Array.isArray(value)) return value.length <= 4 && value.every((v) => v === null || typeof v !== "object");
  if (IsObject(value)) return "h" in value && "v" in value && Object.keys(value).length <= 3;
  return true;
}

function FormatValue(value, indent) {
  if (IsShort(value)) return Inline(value);
  const pad = "  ".repeat(indent + 1), end = "  ".repeat(indent);
  if (Array.isArray(value)) {
    if (!value.length) return "[]";
    return `[\n${value.map((v) => pad + FormatValue(v, indent + 1)).join(",\n")}\n${end}]`;
  }
  const entries = Object.entries(value).filter(([, v]) => v !== undefined);
  if (!entries.length) return "{}";
  // 一个区域 / 一个 look 这种全是标量与短向量的小对象：一行写完
  if (indent >= 2 && entries.every(([, v]) => IsShort(v) && !IsObject(v)) && Inline(value).length <= 160) return Inline(value);
  return `{\n${entries.map(([k, v]) => `${pad}${JSON.stringify(k)}: ${FormatValue(v, indent + 1)}`).join(",\n")}\n${end}}`;
}

export function FormatEnvJson(doc) { return `${FormatValue(doc, 0)}\n`; }

// ---------------------------------------------------------------------------
// 新建

export function NewEnvPreset(id, title = id, components = {}) {
  return { schema: ENV_PRESET_SCHEMA, id, title, looks: [], components };
}

export function NewSceneEnv(scene, presetId) {
  return {
    schema: ENV_SCENE_SCHEMA, scene,
    time: { hour: 12, speed: ENV_RUNTIME.defaultSpeedHps, paused: true },
    volumes: [NewVolume("global", { id: "Fallback", name: "兜底（全场）", preset: presetId, priority: 0, blendS: 0, mode: "full" })],
  };
}

/** 一个区域。shape：global / box / sphere；opts 里给什么用什么。 */
export function NewVolume(shape, opts = {}) {
  const base = {
    id: opts.id || "Volume1", name: opts.name || "新区域", shape,
    priority: opts.priority ?? ENV_RUNTIME.defaultLocalPriority,
    blendS: opts.blendS ?? ENV_RUNTIME.defaultBlendS,
    mode: opts.mode || "partial",
    preset: opts.preset || "",
  };
  if (shape === "box") Object.assign(base, { center: opts.center || [0, 0, 0], size: opts.size || [...ENV_RUNTIME.newBoxSize], yawDeg: opts.yawDeg ?? 0 });
  if (shape === "sphere") Object.assign(base, { center: opts.center || [0, 0, 0], radius: opts.radius ?? 12 });
  return base;
}

/** 带序号的新 id：Volume1、Volume2…（取第一个没用过的）。 */
export function NumberedId(prefix, taken) {
  const used = new Set(taken);
  for (let i = 1; i < 10000; i += 1) if (!used.has(`${prefix}${i}`)) return `${prefix}${i}`;
  return `${prefix}${Date.now()}`;
}

/** 场景里没用过的 id：base 没人用就用它，否则 base2、base3…。 */
export function UniqueId(base, taken) {
  const used = new Set(taken);
  if (!used.has(base)) return base;
  for (let i = 2; i < 10000; i += 1) if (!used.has(`${base}${i}`)) return `${base}${i}`;
  return `${base}${Date.now()}`;
}

// ---------------------------------------------------------------------------
// 旧天空预设（Script_Sky.SKY_PRESETS 那种）→ 组件参数

/** 一份旧预设里各组件的参数（全是固定值）。→ { [type]: values } */
export function ComponentValuesFromSkyPreset(legacy, name = "") {
  const out = {};
  for (const decl of ENV_COMPONENTS) {
    const values = {};
    for (const param of decl.params) values[param.key] = CloneValue(param.default);
    ENV_COMPONENT_LOGIC[decl.type]?.FromLegacy?.(decl, legacy, values, name);
    out[decl.type] = values;
  }
  return out;
}

/** 旧预设 → 一份全是固定值的组件预设（旧预设当临时覆盖用，见 Script_Main.ApplySkyPreset）。 */
export function EnvPresetFromSkyPreset(legacy, name, { id = "LegacySky", title = name } = {}) {
  const values = ComponentValuesFromSkyPreset(legacy, name);
  const components = {};
  for (const decl of ENV_COMPONENTS) components[decl.type] = { enabled: true, params: values[decl.type] };
  return NewEnvPreset(id, title, components);
}

/**
 * 几套表现拼成一份按昼夜变化的预设：每一套给一份旧预设与它占的几个时刻（同一套可以占几个时刻，例如晚上 22:00 与 04:00）。
 * 每个参数各套都一样 → 固定值；不一样 → 关键帧（帧上写 tag = 那一套的 id，同一套的几帧联动）。
 * @param {Array<{ id, label, hours: number[], legacy, name }>} looks
 */
export function EnvPresetFromLooks(id, title, looks) {
  const perLook = looks.map((look) => ComponentValuesFromSkyPreset(look.legacy, look.name));
  const components = {};
  for (const decl of ENV_COMPONENTS) {
    const params = {};
    for (const param of decl.params) {
      const values = perLook.map((v) => v[decl.type][param.key]);
      if (param.animatable === false || values.every((v) => SameValue(v, values[0]))) { params[param.key] = CloneValue(values[0]); continue; }
      const keys = [];
      looks.forEach((look, i) => { for (const h of look.hours) keys.push({ h: WrapHour(h), v: CloneValue(values[i]), tag: look.id }); });
      keys.sort((a, b) => a.h - b.h);
      params[param.key] = { keys, interp: "smooth" };
    }
    components[decl.type] = { enabled: true, params };
  }
  return { schema: ENV_PRESET_SCHEMA, id, title, looks: looks.map((l) => ({ id: l.id, label: l.label, hour: l.hours[0] })), components };
}
