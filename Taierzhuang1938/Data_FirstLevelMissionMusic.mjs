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
// 【2026-09-26】01/02 开场过场原来不放乐（null）。用户：「过场动画里的背景音乐和爆炸枪声略少，
// 没有什么战场嘈杂的氛围」—— 改成「前线压来」（D 小调 96 BPM，低弦短弓固定音型 + 深沉模拟贝斯，
// 提示词里就要求「给现场音效和四川话对白留出空间」），压在台词与远处枪炮下面；
// 电平、对白让位与近爆那一下的静默见下面 FIRST_LEVEL_MUSIC_OPENING。用已有成稿，不另生成。
export const FIRST_LEVEL_STAGE_MUSIC = Object.freeze({
  Trapped: "TheFrontClosesIn", BunkerRescue: "TheFrontClosesIn", RearTrench: "IronSiege",
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
  // breachReopened（Front 包 09-24）：战车哑火、缺口前没人再封 —— 撤口重新打开那一刻。
  stingers: Object.freeze(["tankPreviewed", "tankImmobilized", "tankFireDisabled", "breachReopened", "lastGuardsWithdrawn"]),
  holdS: 6, fadeS: 4, lift: 1.15,
});

/**
 * 【2026-09-26】01/02 开场过场的配乐（「前线压来」）。
 *   · scale：这两步的电平（× cue 自己的 level 0.50）。压在台词与远处枪炮下面，是一层床，不是主角。
 *   · dialogueScale：说话时的倍率。常规的 0.42（−7.5 dB）再叠对白侧链的 −6 dB 共 −13.5 dB，
 *     开场台词占七成时间，配乐等于一直听不见；这两步用 0.6（−4.4 dB，合计 −10.4 dB）。
 *     实测（p012 实时）：两句之间配乐 RMS 约 −38 dBFS，说话时约 −44（台词 RMS 约 −26）。
 *   · 近爆（01 的 shellImpact 事实）：silenceS 秒内静（与原来「受困近爆」同一条快淡出 silenceS），
 *     盖住黑屏、醒来与剧情档耳鸣（TINNITUS.story.ringS 9.5 s）—— 耳鸣里不该有配乐；
 *     之后 returnS 秒里按 stepScale 一档一档爬回 scale（压在总线低通恢复曲线后面回来）。
 *     【2026-09-27 合并 d10ae280 后复核】剧情耳鸣改成先开 0.75 s（Data_FirstLevelOpening.deafenHoldS）、
 *     0.4 s 关（TINNITUS.story.closeS），总线低通回到 6.2 kHz 的时刻从近爆后 7.7 s 挪到 8.35 s、
 *     回满从 10.2 s 挪到 10.85 s。silenceS 跟着 9.5 → 10.1：配乐仍在低通回到 6.2 kHz 之后约 1.7 s 才开始爬
 *    （第一档 0.05 ≈ −26 dB 在 10.3 s，那时低通约 1.5 万 Hz）。事实与 Deafen 同一帧记，起点对得上。
 *     事实第一次出现时已经为真（跳关、读档从醒来之后进）算「很久以前」，直接在顶上。
 */
export const FIRST_LEVEL_MUSIC_OPENING = Object.freeze({
  stages: Object.freeze({ Trapped: 0.8, BunkerRescue: 0.85 }),
  dialogueScale: 0.6,
  blastStage: "Trapped", silenceS: 10.1, returnS: 8, stepScale: 0.05,
});

export function FirstLevelMusicState(stage, { shellImpact = false, shellImpactAgeS = shellImpact ? 0 : Infinity,
  speaking = false, failed = false, intensity = 0, stingerAgeS = Infinity } = {}) {
  const mix = FIRST_LEVEL_MUSIC_MIX;
  const O = FIRST_LEVEL_MUSIC_OPENING;
  // 01 近爆之后：silenceS 内静，之后 returnS 内爬回（见 FIRST_LEVEL_MUSIC_OPENING）。
  const blastAge = stage === O.blastStage && shellImpact ? shellImpactAgeS : Infinity;
  const blastBack = Number.isFinite(blastAge)
    ? Math.round(Math.min(1, Math.max(0, (blastAge - O.silenceS) / O.returnS)) / O.stepScale) * O.stepScale : 1;
  // 15A 与 17 是「静」：与失败、受困近爆同一条淡出（silenceS），不走 1.6 s 的常规过渡。
  const silent = failed || blastBack <= 0;
  const id = silent ? null : FIRST_LEVEL_STAGE_MUSIC[stage];
  let scale = ({ RearTrench: mix.rearTrenchScale, Orders: mix.ordersScale,
    Transfer: mix.transferScale, Handover: mix.handoverScale,
    WallPath: mix.wallPathScale, ReceptionGate: mix.wallPathScale, ...O.stages })[stage] ?? 1;
  scale *= blastBack;
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
  const dialogueScale = O.stages[stage] != null ? O.dialogueScale : mix.dialogueScale;
  return { cue: id ? `firstLevel${id}` : null,
    scale: scale * (speaking ? dialogueScale : 1),
    fadeOut: silent || ["Death", "Regroup"].includes(stage) ? mix.silenceS : mix.transitionS,
    rampS: speaking ? mix.dialogueAttackS : mix.dialogueReleaseS };
}
