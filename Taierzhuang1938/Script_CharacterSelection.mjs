// Data_CharacterSelection.mjs 的配套函数（2026-11-02 从数据模块搬出来：数据模块只放能导出成 JSON 的数据，见 docs/Data_DataSources.md「数据模块只放数据」）。

import { CHARACTER_CAST_VARIANTS_BY_KIND, CHARACTER_CLIP_SOURCE_BY_MODEL, CHARACTER_MODEL_VARIANTS_BY_KIND } from "./Data_CharacterSelection.mjs";

/** Id under which a model's per-model clip libraries are stored. */
export function CharacterClipModelId(modelId) {
  return CHARACTER_CLIP_SOURCE_BY_MODEL[modelId] || modelId;
}

/** Whether an explicit modelVariant may spawn for this kind (a castId unlocks cast-only looks). */
export function IsApprovedCharacterVariant(kind, modelVariant, castId = null) {
  if (CHARACTER_MODEL_VARIANTS_BY_KIND[kind]?.includes(modelVariant)) return true;
  const casts = CHARACTER_CAST_VARIANTS_BY_KIND[kind];
  return !!castId && !!casts && Object.hasOwn(casts, modelVariant) && casts[modelVariant].includes(castId);
}
