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
  // 15B/15C 是空袭之后第一次降压：喘息、脚步、担架杆和远炮才是主角，
  // 配乐压到背景里（Notion 15B「近距离枪火暂时消失」）。
  wallPathScale: 0.5,
});
// 2026.09.19 重构：按新 27 步重排（键序必须与 MISSION_STAGES 一致，MusicTest 守着）。
export const FIRST_LEVEL_STAGE_MUSIC = Object.freeze({
  Trapped: null, BunkerRescue: null, RearTrench: "IronSiege",
  Support: "CloseQuartersPressure", MachineGun: "CloseQuartersPressure", Tank: "CloseQuartersPressure", Orders: "TheFrontClosesIn",
  South: "TheRoadSouth", Village: "IronSiege", Melee: "IronSiege", Courtyard: "IronSiege",
  TransferApproach: "TheRoadSouth", Transfer: "CloseQuartersPressure", CartRide: "TheRoadSouth",
  AirFirst: "CloseQuartersPressure", Carry: "TheSouthRoadBreaks", Dive: "TheSouthRoadBreaks",
  Rescue: "IronSiege",
  // 2026.09.20 第二波（End 包）按新 15–18 的情绪核重排：
  //  · 15A 收拢是**整关第一次真正的安静**——飞机声远去、只剩喘息与远炮，这里不放乐；
  //    原来的「别闭眼」既压过了降压感，也把老周提前写成死亡倒计时（Notion 15A 明确
  //    不安排「莫睡」这类临终预告），挪到 16 交接那一刻才对。
  //  · 15B/15C 沿墙缓行用「后头还有活人」，并压到 wallPathScale。
  //  · 17 静（沿用）。
  //  · 18 桥头回到紧张；爆破那一步换成「南路断了」——这一段真正发生的事是一条通路
  //    被不可逆地切断，「把路打开」正好说反了。
  //  · 夜入城收束回到「后头还有活人」：不是胜利庆典，是连夜准备迎敌。
  Regroup: null, WallPath: "TheLivingStillNeedUs",
  ReceptionGate: "TheLivingStillNeedUs", Handover: "KeepYourEyesOpen",
  Death: null, BridgeOrders: "TheFrontClosesIn", BridgeCover: "CloseQuartersPressure",
  BridgeWithdraw: "TheSouthRoadBreaks", NightMarch: "TheLivingStillNeedUs", Complete: null,
});

export function FirstLevelMusicState(stage, { shellImpact = false, speaking = false, failed = false } = {}) {
  const mix = FIRST_LEVEL_MUSIC_MIX;
  // 15A 与 17 是「静」：与失败、受困近爆同一条淡出（silenceS），不走 1.6 s 的常规过渡。
  const silent = failed || (stage === "Trapped" && shellImpact);
  const id = silent ? null : FIRST_LEVEL_STAGE_MUSIC[stage];
  const scale = ({ RearTrench: mix.rearTrenchScale, Orders: mix.ordersScale,
    Transfer: mix.transferScale, Handover: mix.handoverScale,
    WallPath: mix.wallPathScale, ReceptionGate: mix.wallPathScale })[stage] ?? 1;
  return { cue: id ? `firstLevel${id}` : null,
    scale: scale * (speaking ? mix.dialogueScale : 1),
    fadeOut: silent || ["Death", "Regroup"].includes(stage) ? mix.silenceS : mix.transitionS,
    rampS: speaking ? mix.dialogueAttackS : mix.dialogueReleaseS };
}
