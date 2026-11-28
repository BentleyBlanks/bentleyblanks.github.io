// 特效预览窗口的昼夜：读项目里的环境预设（Environment/EnvPreset_*.json），不另写一套时段。
//
// 预设是组件容器（主光、环境光、天空、雾、曝光与调色……），参数可按 24 小时关键帧；
// 每份预设自带 looks（白天 / 黄昏 / 晚上 各是几点）。这里：
//   · 列出可用的预设：本机预览服的 /__environment/status（磁盘上的全部预设），
//     读不到时退回「场景清单里每个场景的区域文件引用了哪份预设」；
//   · 选中一份预设 + 一个 look → 用环境系统同一套纯函数（Script_EnvSystem / Script_EnvComponents）
//     求值并拼成环境参数（与 SKY_PRESETS 同形），交给预览台的灯、天空、曝光与特效系统。
// 环境组件逻辑、关键帧插值、关闭值都是游戏那一份；本文件不 import three 以外的任何渲染模块。

import { ENV_COMPONENTS } from "../Data_EnvComponents.mjs";
import { EvaluateComponent, OffValues } from "../Script_EnvSystem.mjs";
import { ComposeEnvironment } from "../Script_EnvComponents.mjs";
import { EnvPresetUrl, SceneEnvUrl, ValidateEnvPreset } from "../Script_EnvPreset.mjs";
import { SCENE_LIST } from "../Data_SceneAssets.mjs";
import { FlareSceneScaleFor } from "../Data_Tuning_FlareEffects.mjs";

/** 指向太阳的单位向量（与 Script_Sky.SunDirectionFrom 同一换算：高度角、方位角按度）。 */
export function SunDirectionFrom(elevationDeg, azimuthDeg) {
  const phi = (90 - elevationDeg) * Math.PI / 180;
  const theta = azimuthDeg * Math.PI / 180;
  const s = Math.sin(phi);
  return { x: s * Math.sin(theta), y: Math.cos(phi), z: s * Math.cos(theta) };
}

/** 一份预设在 hour 时拼出来的环境参数：没有或关掉的组件取关闭值（同区域 mode = full 的口径）。 */
export function ComposePresetAt(preset, hour) {
  const states = ENV_COMPONENTS.map((decl) => {
    const comp = preset?.components?.[decl.type];
    const values = comp && comp.enabled !== false ? EvaluateComponent(decl, comp, hour) : OffValues(decl);
    return { decl, values, enabled: !!comp && comp.enabled !== false };
  });
  return ComposeEnvironment(states);
}

/** 预设的 looks；没写 looks 的旧预设按 12 / 18 / 22 点给三档。 */
export function PresetLooks(preset) {
  const looks = Array.isArray(preset?.looks) && preset.looks.length ? preset.looks : [
    { id: "day", label: "白天", hour: 12 }, { id: "dusk", label: "黄昏", hour: 18 }, { id: "night", label: "晚上", hour: 22 },
  ];
  return looks.map((look) => ({ id: look.id, label: look.label || look.id, hour: Number(look.hour) || 0 }));
}

async function FetchJson(url, fetchFn) {
  const response = await fetchFn(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.json();
}

/**
 * 可用的预设 id（有序）：先按场景清单里各场景区域文件引用的顺序，再补本机预览服报的其余预设。
 * @returns {Promise<string[]>}
 */
export async function ListEnvPresets({ fetchFn = globalThis.fetch, base = globalThis.document?.baseURI } = {}) {
  const ids = [];
  const Add = (id) => { if (id && !ids.includes(id)) ids.push(id); };
  await Promise.all(SCENE_LIST.map(async (scene) => {
    try {
      const doc = await FetchJson(new URL(SceneEnvUrl(scene.id), base), fetchFn);
      return { scene: scene.id, presets: (doc.volumes || []).map((volume) => volume.preset) };
    } catch { return { scene: scene.id, presets: [] }; }
  })).then((list) => { for (const entry of list) for (const id of entry.presets) Add(id); });
  try {
    const status = await FetchJson(new URL("/__environment/status", base), fetchFn);
    for (const id of Object.keys(status.presets || {}).sort()) Add(id);
  } catch { /* 不是本机预览服：只用场景清单引用到的那些 */ }
  return ids;
}

export async function LoadEnvPreset(id, { fetchFn = globalThis.fetch, base = globalThis.document?.baseURI } = {}) {
  const doc = await FetchJson(new URL(EnvPresetUrl(id), base), fetchFn);
  const check = ValidateEnvPreset(doc);
  if (check && check.ok === false) throw new Error(`环境预设 ${id} 校验失败：${(check.errors || []).slice(0, 2).join("；")}`);
  return doc;
}

/**
 * 预览用的环境：一份预设 + 一个 look。Apply 之后 env 是拼好的环境参数，sunDirection 是指向太阳的向量，
 * flareSceneScale 是照明弹昼夜口径（按预设的后期档案查，同游戏）。
 */
export class PreviewEnvironment {
  constructor({ fetchFn = globalThis.fetch, base = globalThis.document?.baseURI } = {}) {
    this.fetchFn = fetchFn;
    this.base = base;
    this.presetIds = [];
    this.presets = new Map();
    this.presetId = null;
    this.lookId = null;
    this.env = null;
    this.listeners = new Set();
  }

  async Init(preferredPreset = null) {
    this.presetIds = await ListEnvPresets({ fetchFn: this.fetchFn, base: this.base });
    if (!this.presetIds.length) throw new Error("没有读到任何环境预设（Environment/EnvPreset_*.json）");
    const first = preferredPreset && this.presetIds.includes(preferredPreset) ? preferredPreset : this.presetIds[0];
    await this.Select(first, null);
    return this;
  }

  async Preset(id) {
    if (!this.presets.has(id)) this.presets.set(id, await LoadEnvPreset(id, { fetchFn: this.fetchFn, base: this.base }));
    return this.presets.get(id);
  }

  Looks(id = this.presetId) { return PresetLooks(this.presets.get(id)); }

  Options() {
    return this.presetIds.map((id) => ({ value: id, label: this.presets.get(id)?.title ? `${id} · ${this.presets.get(id).title}` : id }));
  }

  LookOptions() {
    return this.Looks().map((look) => ({ value: look.id, label: `${look.label} · ${String(look.hour).padStart(2, "0")}:00` }));
  }

  /** 选预设 / look（look 不给或这份预设没有就沿用同名 look，再没有取第一档）。 */
  async Select(presetId, lookId = this.lookId) {
    await this.Preset(presetId);
    return this.ApplyLoaded(presetId, lookId);
  }

  /** 同一份（已读进来的）预设里换 look，同步生效。 */
  SelectLook(lookId) {
    if (!this.presetId || !this.presets.has(this.presetId)) return null;
    return this.ApplyLoaded(this.presetId, lookId);
  }

  ApplyLoaded(presetId, lookId) {
    const preset = this.presets.get(presetId);
    const looks = PresetLooks(preset);
    const look = looks.find((entry) => entry.id === lookId) || looks[0];
    this.presetId = presetId;
    this.lookId = look.id;
    this.hour = look.hour;
    this.env = ComposePresetAt(preset, look.hour);
    this.sunDirection = SunDirectionFrom(this.env.sunElevation ?? 45, this.env.sunAzimuth ?? 180);
    this.flareSceneScale = FlareSceneScaleFor(this.env.profile);
    for (const listener of this.listeners) listener(this);
    return this.State();
  }

  OnChange(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }

  State() {
    return {
      preset: this.presetId, look: this.lookId, hour: this.hour, profile: this.env?.profile ?? null,
      flareSceneScale: this.flareSceneScale,
      lightIntensity: this.env?.lightIntensity,
    };
  }
}
