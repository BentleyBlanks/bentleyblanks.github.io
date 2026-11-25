// 测试场插件调度器（docs/Data_SandboxRanges.md）：按需懒加载独立测试场插件模块。
//
// 2026-11-25 拆包：每个测试场的玩法逻辑与场景接线独立放在 Script_SandboxPlugin_<Name>.mjs，
// 本模块仅保留静态字面量动态 import() 路由表：
//   · 正常玩正式第一关 / 主菜单时，10 个功能测试场与 6 个环境预览插件均 0 加载、0 下载；
//   · 只有命中 `?<id>=1` 时，才按需加载对应的那一个插件小包及独立场景文件 Scenes/<Id>/Scene_<Id>.json；
//   · esbuild（Script_BuildBrowserBundle）自动将每个动态 import() 拆为独立 chunk。

import { SANDBOX_RANGES, SandboxRangeById, SandboxRangeForPhase } from "./Data_SandboxRanges.mjs";
import { CreateEncounterPlayPluginInstance } from "./Script_SandboxPlugin_EncounterPlay.mjs";

export { CreateEncounterPlayPluginInstance };

/**
 * 静态字面量动态 import() 表（既供 esbuild 自动分包，也供 Script_ModuleGraphTest 扫描 import map）。
 */
const PLUGIN_LOADERS = Object.freeze({
  encounterPlay: () => import("./Script_SandboxPlugin_EncounterPlay.mjs").then((m) => m.CreatePlugin()),
  firstLevelScenePreview: () => import("./Script_SandboxPlugin_SceneryPreview.mjs").then((m) => m.CreatePlugin("firstLevelScenePreview")),
  dugoutAidOpenFields: () => import("./Script_SandboxPlugin_SceneryPreview.mjs").then((m) => m.CreatePlugin("dugoutAidOpenFields")),
  gengjiazhuangFieldApproach: () => import("./Script_SandboxPlugin_SceneryPreview.mjs").then((m) => m.CreatePlugin("gengjiazhuangFieldApproach")),
  gengjiazhuangEastSmoke: () => import("./Script_SandboxPlugin_SceneryPreview.mjs").then((m) => m.CreatePlugin("gengjiazhuangEastSmoke")),
  tanketteAdvanceEastTrack: () => import("./Script_SandboxPlugin_SceneryPreview.mjs").then((m) => m.CreatePlugin("tanketteAdvanceEastTrack")),
  aircraftEvacuationDitch: () => import("./Script_SandboxPlugin_SceneryPreview.mjs").then((m) => m.CreatePlugin("aircraftEvacuationDitch")),
  movement: () => import("./Script_SandboxPlugin_Movement.mjs").then((m) => m.CreatePlugin()),
  weapons: () => import("./Script_SandboxPlugin_Weapons.mjs").then((m) => m.CreatePlugin()),
  range: () => import("./Script_SandboxPlugin_Range.mjs").then((m) => m.CreatePlugin()),
  explosions: () => import("./Script_SandboxPlugin_Explosions.mjs").then((m) => m.CreatePlugin()),
  melee: () => import("./Script_SandboxPlugin_Melee.mjs").then((m) => m.CreatePlugin()),
  gore: () => import("./Script_SandboxPlugin_Gore.mjs").then((m) => m.CreatePlugin()),
  impacts: () => import("./Script_SandboxPlugin_Impacts.mjs").then((m) => m.CreatePlugin()),
  reactions: () => import("./Script_SandboxPlugin_Reactions.mjs").then((m) => m.CreatePlugin()),
  cloth: () => import("./Script_SandboxPlugin_Cloth.mjs").then((m) => m.CreatePlugin()),
  hair: () => import("./Script_SandboxPlugin_Hair.mjs").then((m) => m.CreatePlugin()),
});

/** 已按需加载好的插件实例缓存（id → plugin）。 */
const loadedPlugins = new Map();

/** 支持的全部测试场插件键（与登记表对账用）。 */
export const SANDBOX_PLUGIN_IDS = Object.freeze(Object.keys(PLUGIN_LOADERS));

/** 按登记表行或 id 异步按需加载单个测试场插件。 */
export async function LoadSandboxPlugin(entryOrId) {
  const entry = typeof entryOrId === "string" ? SandboxRangeById(entryOrId) : entryOrId;
  if (!entry) return null;
  if (loadedPlugins.has(entry.id)) return loadedPlugins.get(entry.id);
  const loader = PLUGIN_LOADERS[entry.id];
  if (!loader) throw new Error(`SandboxRanges: no plugin loader for ${entry.id}`);
  const raw = await loader();
  if (!raw?.phase) return null;
  const plugin = Object.freeze({
    id: entry.id,
    entry,
    ...raw,
    Create: (host) => Object.assign(raw.Create(host), { id: entry.id }),
  });
  loadedPlugins.set(entry.id, plugin);
  return plugin;
}

/** 批量加载全部插件（仅用于自动化回归测试全量核对，游戏运行时不调）。 */
export async function LoadAllSandboxPlugins() {
  const list = [];
  for (const entry of SANDBOX_RANGES) {
    const plugin = await LoadSandboxPlugin(entry);
    if (plugin) list.push(plugin);
  }
  return Object.freeze(list);
}

/** 取已经加载过的插件（同步，未加载返回 null）。 */
export function SandboxPluginFor(entry) {
  return entry ? (loadedPlugins.get(entry.id) || null) : null;
}

/** 这一关是不是某个测试场的场地（按纯数据表匹配，无需加载任何插件；已加载则带上插件引用）。 */
export function SandboxForPhase(phase) {
  const entry = SandboxRangeForPhase(phase);
  if (!entry) return null;
  return loadedPlugins.get(entry.id) || Object.freeze({ id: entry.id, entry });
}

/** 当前已加载测试场的场地类表：关卡 id → 场地类。 */
export function SandboxWorldClasses() {
  const out = {};
  for (const plugin of loadedPlugins.values()) {
    if (plugin.phase?.id && plugin.World) out[plugin.phase.id] = plugin.World;
  }
  return out;
}

/**
 * 常驻的取证口：不管开没开那个测试场都在（不在时返回 null），签名不许改（测试与出图脚本按它取）。
 * `current()` 取装配层当前的测试场实例。
 */
export function SandboxDebugStubs(current) {
  const Explosions = () => { const s = current(); return s?.id === "explosions" ? s.api : null; };
  return {
    Explosions: {
      State: () => Explosions()?.State() || null,
      GoTo: (id) => Explosions()?.GoTo(id),
      Reset: () => Explosions()?.Reset(),
      SelectLoadout: (mode) => Explosions()?.SelectLoadout?.(mode),
      SetFuseDuration: (s) => Explosions()?.SetFuseDuration?.(s),
      SetShowTimer: (on) => Explosions()?.SetShowTimer?.(on),
      SetOvercookExplodes: (on) => Explosions()?.SetOvercookExplodes?.(on),
      BeginPull: (mode) => Explosions()?.BeginPull?.(mode),
      RequestThrow: (power) => Explosions()?.RequestThrow?.(power),
      SpawnEnemies: () => Explosions()?.SpawnEnemies?.(),
      ClearEnemies: () => Explosions()?.ClearEnemies?.(),
      SetEnemyMode: (mode) => Explosions()?.SetEnemyMode?.(mode),
      SetEnemyDistance: (m) => Explosions()?.SetEnemyDistance?.(m),
      SetCoverWall: (on) => Explosions()?.SetCoverWall?.(on),
      SetPatrols: (on) => Explosions()?.SetPatrols?.(on),
      SetVehicle: (id) => Explosions()?.SetVehicle?.(id),
      FireVehicle: (id) => Explosions()?.FireVehicle?.(id),
      StartBarrage: () => Explosions()?.StartBarrage?.(),
      StartAirstrike: () => Explosions()?.StartAirstrike?.(),
      ThrowPracticeGrenade: () => Explosions()?.ThrowPracticeGrenade?.(),
      RefillThrowables: () => Explosions()?.RefillThrowables?.(),
    },
  };
}
