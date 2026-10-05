// Menu paper artwork, authored from the current Notion campaign and cited historical excerpts.
// Only a contiguous prefix of real cleared chapter IDs advances the artwork; furthest/debug IDs do not.
export const COMMAND_ROOM_PAPER_VERSION = "202610051500";
export const COMMAND_ROOM_CAMPAIGN_IDS = Object.freeze([
  "FirstLevelP012Whitebox", "CH2_Shouliudan", "CH3_Jiuhusuo",
  "CH4_DongguanYe", "CH5_Chengqiang", "CH6_Zuihou",
]);
export const COMMAND_ROOM_MAPS = Object.freeze([
  "CommandRoomMapInitial", "CommandRoomMapWithdrawal", "CommandRoomMapEastDefense",
  "CommandRoomMapAidReturn", "CommandRoomMapNightBattle", "CommandRoomMapLastStand",
  "CommandRoomMapEpilogue",
]);
export const COMMAND_ROOM_LETTERS = Object.freeze([
  "CommandRoomLetterOpening", "CommandRoomLetterMiddle", "CommandRoomLetterFinal",
]);
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
