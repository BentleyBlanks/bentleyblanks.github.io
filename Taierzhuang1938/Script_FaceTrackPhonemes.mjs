// Data_FaceTrackPhonemes.mjs 的配套函数（2026-11-02 从数据模块搬出来：数据模块只放能导出成 JSON 的数据，见 docs/Data_DataSources.md「数据模块只放数据」）。

import { HAN_PINYIN } from "./Data_FaceTrackPhonemes.mjs";

/** Every Han character with a reading, as a Map char -> syllable (first reading wins). */
export function HanReadings() {
  const map = new Map();
  for (const [syllable, chars] of Object.entries(HAN_PINYIN)) for (const ch of chars) if (!map.has(ch)) map.set(ch, syllable);
  return map;
}
