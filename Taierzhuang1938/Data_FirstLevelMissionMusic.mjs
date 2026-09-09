// Approved SeedAudio takes, 2026-09-09. Labels are editor-only metadata.
export const FIRST_LEVEL_MUSIC_VERSION = "20260909-seven-r1";
export const FIRST_LEVEL_MUSIC_CUES = Object.freeze(Object.fromEntries([
  ["LeavingHome", "离家的人", 0.72],
  ["TheFrontClosesIn", "前线压来", 0.50],
  ["TheRoadSouth", "往南的路", 0.66],
  ["OpenTheWay", "把路打开", 0.54],
  ["TheSouthRoadBreaks", "南路断了", 0.56],
  ["KeepYourEyesOpen", "别闭眼", 0.58],
  ["TheLivingStillNeedUs", "后头还有活人", 0.60],
].map(([id, label, level]) => [`firstLevel${id}`, Object.freeze({
  label, level, file: `FirstLevel/AudioBgm_${id}.mp3`,
  version: FIRST_LEVEL_MUSIC_VERSION, onDemand: true, loopFadeS: 6,
})])));

export const FIRST_LEVEL_MUSIC_MIX = Object.freeze({
  transitionS: 1.6, silenceS: 0.12, dialogueScale: 0.42,
  dialogueAttackS: 0.15, dialogueReleaseS: 1.2, cacheLimit: 3,
  // Quieter preparation and defensive waiting reuse the same take without restarting it.
  unloadingScale: 0.45, ordersScale: 0.55, transferScale: 0.55, finalCarryScale: 0.55,
});
export const FIRST_LEVEL_STAGE_MUSIC = Object.freeze({
  Train: "LeavingHome", Unloading: "LeavingHome",
  Support: "TheFrontClosesIn", MachineGun: "TheFrontClosesIn", Tank: "TheFrontClosesIn", Orders: "TheFrontClosesIn",
  South: "TheRoadSouth", Village: "OpenTheWay", Melee: "OpenTheWay", Courtyard: "OpenTheWay",
  TransferApproach: "TheRoadSouth", Transfer: "TheFrontClosesIn",
  AirFirst: "TheSouthRoadBreaks", Carry: "TheSouthRoadBreaks", Dive: "TheSouthRoadBreaks",
  Rescue: "KeepYourEyesOpen", RetreatFirst: "KeepYourEyesOpen", RetreatWall: "KeepYourEyesOpen",
  RetreatYard: "KeepYourEyesOpen", Reception: "KeepYourEyesOpen", FinalCarry: "KeepYourEyesOpen",
  Death: null, FinalDefense: "TheLivingStillNeedUs", Exit: "TheLivingStillNeedUs", Complete: null,
});

export function FirstLevelMusicState(stage, { shellImpact = false, speaking = false, failed = false } = {}) {
  const mix = FIRST_LEVEL_MUSIC_MIX;
  const silent = failed || (stage === "Unloading" && shellImpact);
  const id = silent ? null : FIRST_LEVEL_STAGE_MUSIC[stage];
  const scale = ({ Unloading: mix.unloadingScale, Orders: mix.ordersScale,
    Transfer: mix.transferScale, FinalCarry: mix.finalCarryScale })[stage] ?? 1;
  return { cue: id ? `firstLevel${id}` : null,
    scale: scale * (speaking ? mix.dialogueScale : 1),
    fadeOut: silent || stage === "Death" ? mix.silenceS : mix.transitionS,
    rampS: speaking ? mix.dialogueAttackS : mix.dialogueReleaseS };
}
