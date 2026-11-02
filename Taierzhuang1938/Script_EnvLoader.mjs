// 读一关的环境：区域文件 + 它引用的预设（docs/Data_Environment.md §4、§6）。
//   场景关卡（白盒编辑器）  Scenes/<Scene>/Environment_<Scene>.json
//   正片关卡（Data_EnvLevels 登记）  Environment/Level_<Id>.json
// 页面与 Node 共用（fetch 由调用方给，测试可以喂假的）。读不到区域文件（404）= 这一关没有环境，走旧天空预设。

import { EnvPresetUrl, ValidateEnvPreset, ValidateSceneEnv, ZoneFileUrl } from "./Script_EnvPreset.mjs";
import { ENV_LEVELS } from "./Data_EnvLevels.mjs";

/** 场景 URL（./Scenes/<Id>/Scene_<Id>.json）→ 场景 id；认不出 → null。 */
export function SceneIdOfUrl(url) {
  return /\/?Scenes\/([A-Za-z0-9]+)\/Scene_\1\.json(?:\?.*)?$/.exec(String(url || ""))?.[1] || null;
}

/**
 * 这一关的区域文件归谁：白盒编辑器的场景关卡按场景 URL 认场景 id；否则查 Data_EnvLevels 的正片关卡登记。
 * → { kind: "scene" | "level", id } 或 null（这一关没有区域文件可言）
 */
export function EnvTargetForPhase(phase) {
  const sceneId = SceneIdOfUrl(phase?.blockout?.SceneUrl?.());
  if (sceneId) return { kind: "scene", id: sceneId };
  const levelId = phase?.id ? ENV_LEVELS[phase.id] : null;
  return levelId ? { kind: "level", id: levelId } : null;
}

async function ReadJson(fetchFn, url) {
  const response = await fetchFn(`${url}?t=${Date.now()}`, { cache: "no-store" });
  if (response.status === 404) return { missing: true };
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const text = await response.text();
  return { text, doc: JSON.parse(text) };
}

/** 兼容旧调用：按场景 id 读。 */
export function LoadSceneEnvironment(sceneId, options) { return LoadEnvironment({ kind: "scene", id: sceneId }, options); }

/**
 * @param {{ kind: "scene" | "level", id: string }} target
 * @param {object} options { fetchFn = fetch, extraPresets = [] 额外要读的预设 id（编辑器的预设列表） }
 * @returns {Promise<{ sceneDoc, sceneText, presets: Map, presetTexts: Map, errors: string[] } | null>} null = 没有区域文件
 */
export async function LoadEnvironment(target, { fetchFn = globalThis.fetch, extraPresets = [] } = {}) {
  const errors = [];
  const scene = await ReadJson(fetchFn, ZoneFileUrl(target));
  if (scene.missing) return null;
  const sceneCheck = ValidateSceneEnv(scene.doc);
  if (!sceneCheck.ok) throw new Error(`${target.kind === "level" ? "关卡" : "场景"}环境 ${target.id} 不合规：${sceneCheck.errors.join("；")}`);
  const ids = new Set([...scene.doc.volumes.map((v) => v.preset), ...extraPresets]);
  const presets = new Map(), presetTexts = new Map();
  await Promise.all([...ids].map(async (id) => {
    try {
      const result = await ReadJson(fetchFn, EnvPresetUrl(id));
      if (result.missing) { errors.push(`预设 ${id} 读不到`); return; }
      const check = ValidateEnvPreset(result.doc);
      if (!check.ok) { errors.push(`预设 ${id} 不合规：${check.errors.slice(0, 3).join("；")}`); return; }
      presets.set(id, result.doc);
      presetTexts.set(id, result.text);
    } catch (error) { errors.push(`预设 ${id} 读不了：${error.message}`); }
  }));
  return { sceneDoc: scene.doc, sceneText: scene.text, presets, presetTexts, errors };
}
