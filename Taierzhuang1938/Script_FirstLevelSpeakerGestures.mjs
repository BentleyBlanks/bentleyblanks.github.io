// Data_FirstLevelSpeakerGestures.mjs 的配套函数（2026-11-02 从数据模块搬出来：数据模块只放能导出成 JSON 的数据，见 docs/Data_DataSources.md「数据模块只放数据」）。

import { FIRST_LEVEL_SPEAKER_GESTURES } from "./Data_FirstLevelSpeakerGestures.mjs";

/** The gesture row for a per-line voice sample's lineId ("<Scene>.<NN>"), or null (no gesture on that line). */
export function SpeakerGestureForLine(lineId) {
  const row = Object.hasOwn(FIRST_LEVEL_SPEAKER_GESTURES, lineId) ? FIRST_LEVEL_SPEAKER_GESTURES[lineId] : null;
  return row?.gesture ? row : null;
}
