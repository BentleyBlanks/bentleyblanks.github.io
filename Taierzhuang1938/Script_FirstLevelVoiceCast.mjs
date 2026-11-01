// Data_FirstLevelVoiceCast.mjs 的配套函数（2026-11-02 从数据模块搬出来：数据模块只放能导出成 JSON 的数据，见 docs/Data_DataSources.md「数据模块只放数据」）。

import { BarkTakeVoice, FIRST_LEVEL_VOICE_CAST, SQUAD_BARK_CAST, SQUAD_BARK_EXTRA_TAKES, SQUAD_BARK_KEYS, SQUAD_BARK_RETIRED, SQUAD_BARK_TAKES, SquadBarkFile, SquadBarkKey } from "./Data_FirstLevelVoiceCast.mjs";

/** 实际生成定妆音的那个角色（龙套 sharesWith 时取被共用的一方）。 */
export function CastVoiceOwner(who) {
  const entry = FIRST_LEVEL_VOICE_CAST[who];
  return entry?.sharesWith || who;
}

/** 这一套运行时真用的键 = 录音稿减去撤下的。 */
export const SquadBarkLive = (set) => SQUAD_BARK_KEYS[set].filter((key) => !SQUAD_BARK_RETIRED[set]?.includes(key));

/** 这条录音录哪一套。 */
export const BarkTakeSet = (take) => SQUAD_BARK_EXTRA_TAKES[take]?.set ?? SQUAD_BARK_CAST[take];

/** 运行时装的本人版本：[{ who, take, key, bank, file }]，按 SQUAD_BARK_TAKES 的顺序。 */
export function SquadBarkEntries() {
  return SQUAD_BARK_TAKES.flatMap((take) => SquadBarkLive(BarkTakeSet(take)).map((key) => SquadBarkEntry(take, key)));
}

/** 这条录音稿里的全部句子（含撤下的，按录音顺序）：只给烘焙脚本重建提示词、切整条录音用。 */
export function SquadBarkScript(take) {
  return SQUAD_BARK_KEYS[BarkTakeSet(take)].map((key) => SquadBarkEntry(take, key));
}

function SquadBarkEntry(take, key) {
  const who = BarkTakeVoice(take);
  return { who, take, key, bank: SquadBarkKey(key, who), file: SquadBarkFile(key, who) };
}
