// Data_CommandRoomPapers.mjs 的配套函数（2026-11-02 从数据模块搬出来：数据模块只放能导出成 JSON 的数据，见 docs/Data_DataSources.md「数据模块只放数据」）。

import { COMMAND_ROOM_CAMPAIGN_IDS, COMMAND_ROOM_LETTERS, COMMAND_ROOM_MAPS, COMMAND_ROOM_PAPER_VERSION } from "./Data_CommandRoomPapers.mjs";

export function CommandRoomPapers(progress = {}) {
  const cleared = new Set(Array.isArray(progress?.cleared) ? progress.cleared : []);
  let stage = 0;
  while (stage < COMMAND_ROOM_CAMPAIGN_IDS.length && cleared.has(COMMAND_ROOM_CAMPAIGN_IDS[stage])) stage++;
  return { stage, map: COMMAND_ROOM_MAPS[stage], letter: COMMAND_ROOM_LETTERS[stage < 2 ? 0 : stage < 5 ? 1 : 2] };
}

export function CommandRoomPaperUrl(name) {
  return `./Texture/Menu/CommandRoom/Texture_${name}Image.webp?v=${COMMAND_ROOM_PAPER_VERSION}`;
}

/** Preview uses the same chapter prefix as actual saves, without writing storage. */
export function CommandRoomPreviewStage(value) {
  if (value === null || value === "saved") return null;
  if (typeof value === "string" && /^[0-6]$/.test(value)) value = Number(value);
  if (!Number.isInteger(value) || value < 0 || value >= COMMAND_ROOM_MAPS.length) {
    throw new RangeError("Command room preview stage must be 0..6, null or saved");
  }
  return value;
}
