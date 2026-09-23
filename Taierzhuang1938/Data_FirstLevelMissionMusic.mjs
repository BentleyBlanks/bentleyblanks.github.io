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

/**
 * 【2026-09-23】01–05 的战斗配乐让位与标点（用户：「01-05 应该在整体的战斗音效上有一个
 * 比较极致的沉浸感搭配」）。对标 BF1 / CoD WWII：交火最凶的时候配乐退到后面，让枪炮说话；
 * 只在几个节点（战车露面、缺口重开、余队通过）把配乐推上来给一个标点。
 *
 *   · 让位：按 AudioWiring 的战场强度（0..1），从 fromIntensity 到 fullIntensity
 *     线性压到 1 − depth。结果按 stepScale 取整 —— 强度每帧都在动，不取整的话
 *     每帧都要写一条音量斜坡。
 *   · 标点：stingers 里的事实第一次出现后 holdS 秒内不让位，并抬到 lift 倍，
 *     之后 fadeS 秒内回到让位值（Script_FirstLevelMissionMusic 记事实出现的时刻）。
 * 只对 stages 里的步骤生效；07 以后的配乐一个数都不变。
 */
export const FIRST_LEVEL_MUSIC_COMBAT = Object.freeze({
  stages: Object.freeze(["RearTrench", "Support", "MachineGun", "Tank"]),
  fromIntensity: 0.35, fullIntensity: 0.9, depth: 0.55, stepScale: 0.05,
  stingers: Object.freeze(["tankPreviewed", "tankImmobilized", "tankFireDisabled", "lastGuardsWithdrawn"]),
  holdS: 6, fadeS: 4, lift: 1.15,
});

export function FirstLevelMusicState(stage, { shellImpact = false, speaking = false, failed = false,
  intensity = 0, stingerAgeS = Infinity } = {}) {
  const mix = FIRST_LEVEL_MUSIC_MIX;
  // 15A 与 17 是「静」：与失败、受困近爆同一条淡出（silenceS），不走 1.6 s 的常规过渡。
  const silent = failed || (stage === "Trapped" && shellImpact);
  const id = silent ? null : FIRST_LEVEL_STAGE_MUSIC[stage];
  let scale = ({ RearTrench: mix.rearTrenchScale, Orders: mix.ordersScale,
    Transfer: mix.transferScale, Handover: mix.handoverScale,
    WallPath: mix.wallPathScale, ReceptionGate: mix.wallPathScale })[stage] ?? 1;
  const C = FIRST_LEVEL_MUSIC_COMBAT;
  if (C.stages.includes(stage)) {
    const u = Math.min(1, Math.max(0, (intensity - C.fromIntensity) / (C.fullIntensity - C.fromIntensity)));
    let combat = 1 - C.depth * u;
    if (stingerAgeS < C.holdS + C.fadeS) {
      const w = stingerAgeS <= C.holdS ? 1 : 1 - (stingerAgeS - C.holdS) / C.fadeS;
      combat = combat + (C.lift - combat) * Math.max(0, w);
    }
    scale *= Math.round(combat / C.stepScale) * C.stepScale;
  }
  return { cue: id ? `firstLevel${id}` : null,
    scale: scale * (speaking ? mix.dialogueScale : 1),
    fadeOut: silent || ["Death", "Regroup"].includes(stage) ? mix.silenceS : mix.transitionS,
    rampS: speaking ? mix.dialogueAttackS : mix.dialogueReleaseS };
}
