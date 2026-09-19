// Train and unloading use diegetic sound only. Retained score labels are editor metadata.
export const FIRST_LEVEL_MUSIC_VERSION = "20260910-combat-duo";
export const FIRST_LEVEL_MUSIC_CUES = Object.freeze(Object.fromEntries([
  ["LeavingHome", "车厢闲话", 0.72],
  ["TheFrontClosesIn", "前线压来", 0.50],
  ["TheRoadSouth", "往南的路", 0.66],
  ["OpenTheWay", "把路打开", 0.54],
  ["TheSouthRoadBreaks", "南路断了", 0.56],
  ["KeepYourEyesOpen", "别闭眼", 0.58],
  ["TheLivingStillNeedUs", "后头还有活人", 0.60],
  ["CloseQuartersPressure", "交火前沿", 0.54],
  ["IronSiege", "钢铁围攻", 0.54],
].map(([id, label, level]) => [`firstLevel${id}`, Object.freeze({
  label, level, file: `FirstLevel/AudioBgm_${id}.mp3`,
  version: FIRST_LEVEL_MUSIC_VERSION, onDemand: true, loopFadeS: 6,
})])));

export const FIRST_LEVEL_MUSIC_MIX = Object.freeze({
  transitionS: 1.6, silenceS: 0.12, dialogueScale: 0.42,
  dialogueAttackS: 0.15, dialogueReleaseS: 1.2, cacheLimit: 3,
  // Preparation stays restrained; transfer defense uses the normal battle level.
  rearTrenchScale: 0.45, ordersScale: 0.55, transferScale: 1, handoverScale: 0.55,
});
// 2026.09.19 重构：按新 27 步重排（键序必须与 MISSION_STAGES 一致，MusicTest 守着）。
export const FIRST_LEVEL_STAGE_MUSIC = Object.freeze({
  Trapped: null, BunkerRescue: null, RearTrench: "IronSiege",
  Support: "CloseQuartersPressure", MachineGun: "CloseQuartersPressure", Tank: "CloseQuartersPressure", Orders: "TheFrontClosesIn",
  South: "TheRoadSouth", Village: "IronSiege", Melee: "IronSiege", Courtyard: "IronSiege",
  TransferApproach: "TheRoadSouth", Transfer: "CloseQuartersPressure", CartRide: "TheRoadSouth",
  AirFirst: "CloseQuartersPressure", Carry: "TheSouthRoadBreaks", Dive: "TheSouthRoadBreaks",
  Rescue: "IronSiege", Regroup: "KeepYourEyesOpen", WallPath: "TheLivingStillNeedUs",
  ReceptionGate: "TheLivingStillNeedUs", Handover: "KeepYourEyesOpen",
  Death: null, BridgeOrders: "TheFrontClosesIn", BridgeCover: "CloseQuartersPressure",
  BridgeWithdraw: "OpenTheWay", NightMarch: "TheLivingStillNeedUs", Complete: null,
});

export function FirstLevelMusicState(stage, { shellImpact = false, speaking = false, failed = false } = {}) {
  const mix = FIRST_LEVEL_MUSIC_MIX;
  const silent = failed || (stage === "Trapped" && shellImpact);
  const id = silent ? null : FIRST_LEVEL_STAGE_MUSIC[stage];
  const scale = ({ RearTrench: mix.rearTrenchScale, Orders: mix.ordersScale,
    Transfer: mix.transferScale, Handover: mix.handoverScale })[stage] ?? 1;
  return { cue: id ? `firstLevel${id}` : null,
    scale: scale * (speaking ? mix.dialogueScale : 1),
    fadeOut: silent || stage === "Death" ? mix.silenceS : mix.transitionS,
    rampS: speaking ? mix.dialogueAttackS : mix.dialogueReleaseS };
}
