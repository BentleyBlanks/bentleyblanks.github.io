// 读场景的环境：Scenes/<Scene>/Environment_<Scene>.json + 它引用的预设（docs/Data_Environment.md §4）。
// 页面与 Node 共用（fetch 由调用方给，测试可以喂假的）。读不到区域文件（404）= 这个场景没有环境，走旧天空预设。

import { EnvPresetUrl, SceneEnvUrl, ValidateEnvPreset, ValidateSceneEnv } from "./Script_EnvPreset.mjs";

/** 场景 URL（./Scenes/<Id>/Scene_<Id>.json）→ 场景 id；认不出 → null。 */
export function SceneIdOfUrl(url) {
  return /\/?Scenes\/([A-Za-z0-9]+)\/Scene_\1\.json(?:\?.*)?$/.exec(String(url || ""))?.[1] || null;
}

async function ReadJson(fetchFn, url) {
  const response = await fetchFn(`${url}?t=${Date.now()}`, { cache: "no-store" });
  if (response.status === 404) return { missing: true };
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const text = await response.text();
  return { text, doc: JSON.parse(text) };
}

/**
 * @param {string} sceneId
 * @param {object} options { fetchFn = fetch, extraPresets = [] 额外要读的预设 id（编辑器的预设列表） }
 * @returns {Promise<{ sceneDoc, sceneText, presets: Map, presetTexts: Map, errors: string[] } | null>} null = 没有区域文件
 */
export async function LoadSceneEnvironment(sceneId, { fetchFn = globalThis.fetch, extraPresets = [] } = {}) {
  const errors = [];
  const scene = await ReadJson(fetchFn, SceneEnvUrl(sceneId));
  if (scene.missing) return null;
  const sceneCheck = ValidateSceneEnv(scene.doc);
  if (!sceneCheck.ok) throw new Error(`场景环境 ${sceneId} 不合规：${sceneCheck.errors.join("；")}`);
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
