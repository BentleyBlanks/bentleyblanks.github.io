// 第一关北方远距零星炮击：纯逻辑编译、确定性采样与躲避位移（零 three、零 DOM）。
// 供 LevelFlowModel、EncounterVariants、EncounterPlay 及 Encounter Designer 共用。

import { Clamp, Distance } from "./Script_LevelFlowGeometry.mjs";
import { FLOW_ARTILLERY_CONFIG } from "./Data_LevelFlowArtillery.mjs";

function Smoothstep(edge0, edge1, x) {
  if (edge1 <= edge0) return x >= edge1 ? 1 : 0;
  const t = Clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * 将节拍相对时间编排编译为按绝对时间排序的确定性炮击时间表。
 * 任何任意时间点的拖动（前跳、回拖）都只依赖该表，绝不累积状态。
 */
export function CompileArtillerySchedule(strikes, timeline, config = FLOW_ARTILLERY_CONFIG) {
  if (!Array.isArray(strikes) || !Array.isArray(timeline)) return [];
  const beatMap = new Map(timeline.map((beat) => [beat.id, beat]));
  const compiled = [];
  for (const strike of strikes) {
    const beat = beatMap.get(strike.beat);
    if (!beat) continue;
    const warnS = Number.isFinite(strike.warnS) ? strike.warnS : 2.8;
    const impactAt = beat.start + strike.at;
    const warnAt = impactAt - warnS;
    const blastVisualS = config.blastVisualS ?? 1.6;
    const craterFadeS = config.craterFadeS ?? 22;
    const recoverS = config.recoverS ?? 1.15;
    const evadeLeadFraction = config.evadeLeadFraction ?? 0.78;
    const evadeStartAt = impactAt - warnS * evadeLeadFraction;
    const evadeEndAt = Math.min(beat.end - 0.4, impactAt + recoverS);
    const originNorthOffsetZ = config.originNorthOffsetZ ?? 165;
    const from = strike.from
      ? [strike.from[0], strike.from[1]]
      : [strike.p[0] + (strike.fromDx ?? 0), strike.p[1] - originNorthOffsetZ];
    compiled.push({
      ...strike,
      stage: beat.stage,
      beatStart: beat.start,
      beatEnd: beat.end,
      warnS,
      warnAt,
      impactAt,
      blastEndAt: impactAt + blastVisualS,
      craterEndAt: impactAt + craterFadeS,
      evadeStartAt,
      evadeEndAt,
      from,
      p: [strike.p[0], strike.p[1]],
      dodgeShift: strike.dodgeShift ? [strike.dodgeShift[0], strike.dodgeShift[1]] : [0, 0],
      dodgeActors: Array.isArray(strike.dodgeActors) ? [...strike.dodgeActors] : [],
    });
  }
  compiled.sort((a, b) => a.impactAt - b.impactAt || a.id.localeCompare(b.id));
  return compiled;
}

/** 采样某时间点全部处于预警 / 起爆 / 留坑渐隐期的炮击特效。 */
export function SampleArtilleryEffects(schedule, time, config = FLOW_ARTILLERY_CONFIG) {
  if (!Array.isArray(schedule) || !schedule.length) return [];
  const effects = [];
  const blastVisualS = config.blastVisualS ?? 1.6;
  const craterFadeS = config.craterFadeS ?? 22;
  for (const entry of schedule) {
    if (time >= entry.warnAt && time < entry.impactAt) {
      const progress = Clamp((time - entry.warnAt) / Math.max(0.001, entry.warnS), 0, 1);
      effects.push({
        kind: "artilleryWarn",
        id: entry.id,
        beat: entry.beat,
        role: entry.role,
        caliber: entry.caliber || "75mm",
        label: entry.label,
        dodgeHint: entry.dodgeHint || "",
        note: entry.note || "",
        p: entry.p,
        from: entry.from,
        radius: entry.radius,
        progress,
        remainingS: Math.max(0, entry.impactAt - time),
        warnS: entry.warnS,
        impactAt: entry.impactAt,
      });
    } else if (time >= entry.impactAt && time < entry.blastEndAt) {
      effects.push({
        kind: "artilleryBlast",
        id: entry.id,
        beat: entry.beat,
        role: entry.role,
        caliber: entry.caliber || "75mm",
        label: entry.label,
        p: entry.p,
        from: entry.from,
        radius: entry.radius,
        age: time - entry.impactAt,
        duration: blastVisualS,
      });
    }
    if (time >= entry.impactAt + 0.3 && time < entry.craterEndAt) {
      const age = time - entry.impactAt;
      effects.push({
        kind: "artilleryCrater",
        id: entry.id,
        beat: entry.beat,
        role: entry.role,
        p: entry.p,
        radius: entry.radius,
        age,
        alpha: Clamp(1 - age / craterFadeS, 0, 1),
      });
    }
  }
  return effects;
}

/** 计算给定时间点某次需躲避炮弹的平滑规避包络（0..1，beat 边界处必为 0）。 */
export function ArtilleryEvadeWeight(entry, time, config = FLOW_ARTILLERY_CONFIG) {
  if (!entry || entry.role !== "dodge") return 0;
  if (time <= entry.evadeStartAt || time >= entry.evadeEndAt) return 0;
  const holdBefore = config.evadeHoldBeforeImpactS ?? 0.35;
  const holdAfter = config.evadeHoldAfterImpactS ?? 0.28;
  const peakStart = Math.max(entry.evadeStartAt + 0.1, entry.impactAt - holdBefore);
  const peakEnd = Math.min(entry.evadeEndAt - 0.1, entry.impactAt + holdAfter);
  if (time < peakStart) return Smoothstep(entry.evadeStartAt, peakStart, time);
  if (time <= peakEnd) return 1;
  return 1 - Smoothstep(peakEnd, entry.evadeEndAt, time);
}

/**
 * 在需躲避（role="dodge"）的落点预警至冲击余波窗口内，让近旁指定角色伏低并向安全方向短暂侧移。
 * 只对确实处于威胁范围内且存活的人形单位生效；若位移会拉近与落点的距离，则改为原地缩低伏身。
 * 返回同步后的 player 位置，保持 frame.player 与 actors[0].p 一致。
 */
export function ApplyArtilleryEvasion(schedule, time, actors, framePlayer, config = FLOW_ARTILLERY_CONFIG) {
  if (!Array.isArray(schedule) || !schedule.length || !Array.isArray(actors)) return framePlayer;
  const padM = config.evadeMaxDistancePadM ?? 4.5;
  let nextPlayer = framePlayer;

  for (const entry of schedule) {
    if (entry.role !== "dodge" || !entry.dodgeActors.length) continue;
    const weight = ArtilleryEvadeWeight(entry, time, config);
    if (weight <= 0.001) continue;
    const [sx, sz] = entry.dodgeShift;
    const hasShift = Math.hypot(sx, sz) > 0.01;
    const statusText = entry.dodgeHint ? `躲避炮弹 · ${entry.dodgeHint}` : "躲避北来炮弹";

    for (const actorId of entry.dodgeActors) {
      const actor = actors.find((item) => item.id === actorId);
      if (!actor || actor.pose === "dead" || actor.kind === "quilt") continue;
      const distBefore = Distance(actor.p, entry.p);
      if (distBefore > entry.radius + padM) continue;

      if (hasShift) {
        const shiftedFull = [actor.p[0] + sx, actor.p[1] + sz];
        // 只允许远离爆心的侧移，防止处于落点另一侧的队友反向靠近炮弹
        if (Distance(shiftedFull, entry.p) > distBefore + 0.05) {
          actor.p = [actor.p[0] + sx * weight, actor.p[1] + sz * weight];
          if (actor.id === "player") nextPlayer = actor.p;
        }
      }
      if (weight >= 0.25) {
        actor.pose = "crouch";
        actor.firing = false;
        actor.evadingArtillery = true;
        actor.status = statusText;
      }
    }
  }
  return nextPlayer;
}

/** 检索指定节拍内编排的全部炮击事件。 */
export function ArtilleryForBeat(schedule, beatId) {
  if (!Array.isArray(schedule) || !beatId) return [];
  return schedule.filter((entry) => entry.beat === beatId);
}
