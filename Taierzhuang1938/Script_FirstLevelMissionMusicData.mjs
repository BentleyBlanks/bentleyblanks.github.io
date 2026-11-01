// Data_FirstLevelMissionMusic.mjs 的配套函数（2026-11-02 从数据模块搬出来：数据模块只放能导出成 JSON 的数据，见 docs/Data_DataSources.md「数据模块只放数据」）。

import { FIRST_LEVEL_MUSIC_COMBAT, FIRST_LEVEL_MUSIC_MIX, FIRST_LEVEL_MUSIC_OPENING, FIRST_LEVEL_MUSIC_SPLITS, FIRST_LEVEL_STAGE_MUSIC } from "./Data_FirstLevelMissionMusic.mjs";

/** 这一步此刻该放的 cue id（不带 firstLevel 前缀；null = 不放）。 */
export function FirstLevelStageCue(stage, has) {
  const split = FIRST_LEVEL_MUSIC_SPLITS[stage];
  if (split && typeof has === "function" && has(split.fact)) return split.then;
  return FIRST_LEVEL_STAGE_MUSIC[stage] ?? null;
}

export function FirstLevelMusicState(stage, { shellImpact = false, shellImpactAgeS = shellImpact ? 0 : Infinity,
  speaking = false, failed = false, intensity = 0, stingerAgeS = Infinity, has = null } = {}) {
  const mix = FIRST_LEVEL_MUSIC_MIX;
  const O = FIRST_LEVEL_MUSIC_OPENING;
  // 01 近爆之后：silenceS 内静，之后 returnS 内爬回（见 FIRST_LEVEL_MUSIC_OPENING）。
  const blastAge = stage === O.blastStage && shellImpact ? shellImpactAgeS : Infinity;
  const blastBack = Number.isFinite(blastAge)
    ? Math.round(Math.min(1, Math.max(0, (blastAge - O.silenceS) / O.returnS)) / O.stepScale) * O.stepScale : 1;
  // 15A 与 17 是「静」：与失败、受困近爆同一条淡出（silenceS），不走 1.6 s 的常规过渡。
  const silent = failed || blastBack <= 0;
  const id = silent ? null : FirstLevelStageCue(stage, has);
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
