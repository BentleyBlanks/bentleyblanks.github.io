// Data_FirstLevelDialogueDirection.mjs 的配套函数（2026-11-02 从数据模块搬出来：数据模块只放能导出成 JSON 的数据，见 docs/Data_DataSources.md「数据模块只放数据」）。

import { FIRST_LEVEL_VOICE_CAST } from "./Data_FirstLevelVoiceCast.mjs";
import { FALLBACK_GAP_S, FIRST_LEVEL_DIALOGUE_DIRECTION } from "./Data_FirstLevelDialogueDirection.mjs";

/** 逐句 id：`<Scene>.<NN>`（两位序号，从 01 起）。 */
export const LineId = (sceneId, index) => `${sceneId}.${String(index + 1).padStart(2, "0")}`;

/**
 * 一句的导演参数。缺省：after prev（首句 start）、offsetS null（= 沿用录音间隔，播放时由清单填）、
 * intensity 0.5、projection 取定妆表的角色默认、spatial 顺子 self 其余 head。
 */
export function LineDirection(cue, index) {
  const line = cue.lines[index];
  const authored = FIRST_LEVEL_DIALOGUE_DIRECTION[cue.id]?.lines?.[String(index + 1).padStart(2, "0")] || {};
  return Object.freeze({
    after: index ? "prev" : "start", offsetS: index ? null : 0, intensity: 0.5,
    projection: FIRST_LEVEL_VOICE_CAST[line.who]?.projection || "normal",
    spatial: line.who === "shunzi" ? "self" : "head",
    ...authored,
  });
}

/** 播放用的间隔：导演写了 offsetS 就用它，否则沿用整段录音里的原始间隔（缺录音时兜底 FALLBACK_GAP_S）。 */
export function PlaybackOffset(direction, recordedGapS) {
  if (direction.offsetS != null) return direction.offsetS;
  return Number.isFinite(recordedGapS) ? recordedGapS : FALLBACK_GAP_S;
}
