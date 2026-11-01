// Data_FirstLevelSpeakingCast.mjs 的配套函数（2026-11-02 从数据模块搬出来：数据模块只放能导出成 JSON 的数据，见 docs/Data_DataSources.md「数据模块只放数据」）。

import { FIRST_LEVEL_SPEAKING_CAST } from "./Data_FirstLevelSpeakingCast.mjs";

/** Spawn options for a speaking role: its castId and pinned model (unknown roles: {}). */
export function SpeakingCastOptions(castId) {
  const spec = Object.hasOwn(FIRST_LEVEL_SPEAKING_CAST, castId) ? FIRST_LEVEL_SPEAKING_CAST[castId] : null;
  return spec ? { castId, modelVariant: spec.modelVariant } : {};
}
