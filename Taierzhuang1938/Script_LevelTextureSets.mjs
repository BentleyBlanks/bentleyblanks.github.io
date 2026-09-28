// 关卡按需贴图集的加载器（零 three，node 门禁可直接驱动）。口径：docs/Data_TextureAssetStandard.md §6。
//
// 用法（关卡建场、造任何用到这些材质的网格之前）：
//     await this.library.LoadLevelSets("FirstLevel");      // MaterialLibrary 上的薄包装
//     const mat = this.library.Get("VillageGreyBrick", { repeat: ... });
//
// 约定：
//   · 永不 reject。每套独立超时、独立失败；失败的那套保留同名程序化配方，没有就借 entry.fallback 那套。
//   · 同一个 library 上同名套只下一次（重复调用、两关共用同一套都复用第一次的 Promise）。
//   · 只换 library.baked 里的纹理；已经建好的材质不会自己换图 —— 所以必须在建网格之前 await。
//   · 不改开机 PBR_SETS 与任何现有贴图的加载时机。
import { LEVEL_TEXTURE_SETS, LevelTextureSetUrls } from "./Data_LevelTextureSets.mjs";

const loadsByLibrary = new WeakMap();

async function LoadOne(library, entry, { timeoutMs, warn }) {
  const urls = LevelTextureSetUrls(entry);
  const flipY = entry.flipY ?? true;
  try {
    if (urls.orm) {
      await library.LoadExternalSet(entry.name, { ...urls, flipY }, { timeoutMs });
    } else {
      await library.LoadExternalBaseNormal(entry.name, entry.ormFrom, { ...urls, flipY }, { timeoutMs });
    }
    return { name: entry.name, ok: true };
  } catch (error) {
    let fallback = library.baked.has(entry.name) ? entry.name : null;
    if (!fallback && entry.fallback && library.baked.has(entry.fallback)) {
      library.baked.set(entry.name, library.baked.get(entry.fallback));
      library.materials?.clear?.();
      fallback = entry.fallback;
    }
    warn(`[LevelTextureSets] ${entry.name} 读取失败，${fallback ? `退回 ${fallback}` : "没有可退回的材质"}：${String(error).slice(0, 180)}`);
    return { name: entry.name, ok: false, fallback, error: String(error) };
  }
}

/**
 * 下某一关的按需贴图集。
 * @param {object} library  MaterialLibrary（或实现 LoadExternalSet / LoadExternalBaseNormal / baked 的替身）
 * @param {string} levelId  LEVEL_TEXTURE_SETS 的键；没有条目的关直接返回空结果
 * @param {object} [options] timeoutMs（单张，默认 30 s）/ table（测试注入）/ warn
 * @returns {Promise<{levelId: string, loaded: string[], failed: {name: string, fallback: string|null, error: string}[]}>}
 */
export async function LoadLevelTextureSets(library, levelId, options = {}) {
  const { timeoutMs = 30000, table = LEVEL_TEXTURE_SETS, warn = console.warn } = options;
  const entries = table[levelId] || [];
  let loads = loadsByLibrary.get(library);
  if (!loads) {
    loads = new Map();
    loadsByLibrary.set(library, loads);
  }
  const results = await Promise.all(entries.map((entry) => {
    if (!loads.has(entry.name)) loads.set(entry.name, LoadOne(library, entry, { timeoutMs, warn }));
    return loads.get(entry.name);
  }));
  return {
    levelId,
    loaded: results.filter((r) => r.ok).map((r) => r.name),
    failed: results.filter((r) => !r.ok).map(({ name, fallback, error }) => ({ name, fallback, error })),
  };
}
