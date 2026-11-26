// 遭遇设计多关卡与分段变体组装器（纯逻辑层，零 three、零 DOM，编辑器与 EncounterPlay 共用）。
//
// 支持两类变体：
//   1. 跨段落/跨场景组合变体（如 L1_BeishaheMerged：01–07 直接复用 L1_Front0107，08 起切入单村合并段）
//   2. 同场景遭遇微调变体（spec.overrides 覆盖特定 group / trigger / playGate 参数，无需新建文件）

import {
  ENCOUNTER_DEFAULT_VARIANT_ID, ENCOUNTER_LEVELS, ENCOUNTER_VARIANTS,
} from "./Data_EncounterVariants.mjs";
import {
  FLOW_SOURCE, FLOW_STAGES, FLOW_BEATS, FLOW_WAVES, FLOW_VILLAGE_STEALTH,
} from "./Scenes/FirstLevelEncounter/Data_LevelFlow.mjs";
import { FLOW_SOURCE_EXCERPTS } from "./Scenes/FirstLevelEncounter/Data_LevelFlowSource.mjs";
import { ENCOUNTER_PLAY as BASE_PLAY_CONFIG } from "./Scenes/FirstLevelEncounter/Data_Play.mjs";
import {
  FLOW_TIMELINE, STAGE_TIMELINE, FLOW_DURATION, DEFAULT_ENCOUNTER_DOCUMENT,
  EvaluateFlow, FormatFlowTime, SharedFrontActors, SharedFrontOpeningActors, SharedFrontEffects,
} from "./Scenes/FirstLevelEncounter/Script_LevelFlowModel.mjs";
import {
  CreateEncounterDocument, CompileEncounters, SampleEncounters, ENCOUNTER_CINEMATICS,
} from "./Scenes/FirstLevelEncounter/Script_LevelFlowEncounter.mjs";
import { SampleFlowDialogue } from "./Scenes/FirstLevelEncounter/Script_LevelFlowDialogue.mjs";
import { Clamp, Distance, SampleBeatRoute } from "./Scenes/FirstLevelEncounter/Script_LevelFlowGeometry.mjs";
import { BeishaheSurfaceAt } from "./Scenes/FirstLevelEncounter/Script_LevelFlowBeishahe.mjs";
import {
  MERGED_SOURCE, MERGED_STAGES, MERGED_BEATS, MERGED_WAVES, MERGED_DIALOGUE,
  MERGED_PLAY_GATES, MERGED_GUIDANCE, MERGED_SIGNALS, MERGED_STEALTH, MERGED_CINEMATICS, MERGED_MISSION_AREAS, MERGED_MUSIC,
} from "./Scenes/FirstLevelMerged/Data_LevelFlowMerged.mjs";
import {
  MergedActors, ApplyMergedSurfaces, MergedEffects, MergedSignals, MergedSurfaceAt,
} from "./Scenes/FirstLevelMerged/Script_LevelFlowMerged.mjs";

export { ENCOUNTER_DEFAULT_VARIANT_ID, ENCOUNTER_LEVELS, ENCOUNTER_VARIANTS, FormatFlowTime };

const compiledVariantCache = new Map();

export function GetEncounterVariantSpec(variantId) {
  return ENCOUNTER_VARIANTS.find((v) => v.id === variantId)
    || ENCOUNTER_VARIANTS.find((v) => v.id === ENCOUNTER_DEFAULT_VARIANT_ID)
    || ENCOUNTER_VARIANTS[0];
}

/** 对默认遭遇文档应用同场景/变体级参数覆盖（overrides.groups / overrides.triggers）。 */
export function ApplyEncounterOverrides(document, overrides) {
  if (!overrides) return document;
  const next = structuredClone(document);
  if (overrides.groups) {
    for (const [id, patch] of Object.entries(overrides.groups)) {
      const target = next.groups.find((g) => g.id === id);
      if (target && patch) Object.assign(target, structuredClone(patch));
    }
  }
  if (overrides.triggers) {
    for (const [id, patch] of Object.entries(overrides.triggers)) {
      const target = next.triggers.find((t) => t.id === id);
      if (target && patch) Object.assign(target, structuredClone(patch));
    }
  }
  return next;
}

function BuildTimeline(beats) {
  let elapsed = 0;
  const timeline = beats.map((beat) => {
    const entry = { ...beat, start: elapsed, end: elapsed + beat.duration };
    elapsed = entry.end;
    return entry;
  });
  return { timeline, duration: elapsed };
}

function BuildStageTimeline(stages, timeline) {
  return stages.map((stage) => {
    const beats = timeline.filter((beat) => beat.stage === stage.id);
    return { ...stage, start: beats[0].start, end: beats.at(-1).end, beats };
  });
}

function FilterFrontRecord(record) {
  return Object.fromEntries(
    Object.entries(record || {}).filter(([beatId]) => Number(beatId.slice(0, 2)) <= 7),
  );
}

function CompileMergedVariant(spec) {
  const sharedStages = FLOW_STAGES.filter((s) => Number(s.id) <= 7);
  const sharedBeats = FLOW_BEATS.filter((b) => Number(b.stage) <= 7);
  const sharedWaves = FLOW_WAVES.filter((w) => Number(w.beat.slice(0, 2)) <= 7);

  const stagesRaw = [...sharedStages, ...MERGED_STAGES];
  const beatsRaw = [...sharedBeats, ...MERGED_BEATS];
  const wavesRaw = [...sharedWaves, ...MERGED_WAVES];
  const { timeline, duration } = BuildTimeline(beatsRaw);
  const stages = BuildStageTimeline(stagesRaw, timeline);
  const BeatById = (id) => timeline.find((beat) => beat.id === id);

  const baseDoc = CreateEncounterDocument(timeline, wavesRaw, {
    id: spec.id,
    revision: spec.revision || "2026-11-22-beishahe-merged-1",
  });
  const defaultDocument = ApplyEncounterOverrides(baseDoc, spec.overrides);

  const frontSignals = BASE_PLAY_CONFIG.signals.filter((s) =>
    s.time !== undefined || Number(String(s.beat).slice(0, 2)) <= 7);
  const mergedPlaySignals = MERGED_SIGNALS.map((s) => {
    const idx = timeline.findIndex((b) => b.id === s.beat);
    const applyBeat = (s.fraction ?? 0) >= 0.5 && idx >= 0 && idx + 1 < timeline.length
      ? timeline[idx + 1].id
      : s.beat;
    return { beat: applyBeat, id: s.id };
  });
  const playConfig = {
    ...BASE_PLAY_CONFIG,
    scene: spec.scene,
    reachByBeat: FilterFrontRecord(BASE_PLAY_CONFIG.reachByBeat),
    environment: { ...BASE_PLAY_CONFIG.environment, duskBeat: "11c" },
    guidance: {
      ...FilterFrontRecord(BASE_PLAY_CONFIG.guidance),
      ...MERGED_GUIDANCE,
      ...(spec.overrides?.guidance || {}),
    },
    gates: {
      ...FilterFrontRecord(BASE_PLAY_CONFIG.gates),
      ...MERGED_PLAY_GATES,
      ...(spec.overrides?.playGates || {}),
    },
    missionAreas: {
      ...MERGED_MISSION_AREAS,
      ...(spec.overrides?.missionAreas || {}),
    },
    signals: [...frontSignals, ...mergedPlaySignals],
    music: {
      ...Object.fromEntries(Object.entries(BASE_PLAY_CONFIG.music).filter(([st]) => Number(st) <= 7)),
      ...MERGED_MUSIC,
    },
  };

  const cinematics = [
    ...ENCOUNTER_CINEMATICS.filter((id) => Number(id.slice(0, 2)) <= 7),
    ...MERGED_CINEMATICS,
  ];
  const sourceExcerpts = {
    ...FilterFrontRecord(FLOW_SOURCE_EXCERPTS),
    ...Object.fromEntries(MERGED_BEATS.map((b) => [b.id, b.passage])),
  };

  const compiledDocs = new WeakMap();
  const GetCompiled = (doc) => {
    if (!compiledDocs.has(doc)) compiledDocs.set(doc, CompileEncounters(doc, timeline));
    return compiledDocs.get(doc);
  };

  const Evaluate = (requestedTime, document = defaultDocument) => {
    const time = Clamp(Number.isFinite(requestedTime) ? requestedTime : 0, 0, duration);
    const beat = timeline.find((entry) => time < entry.end) ?? timeline.at(-1);
    const stage = stages.find((entry) => entry.id === beat.stage);
    const progress = Clamp((time - beat.start) / beat.duration, 0, 1);
    const player = SampleBeatRoute(beat, progress);
    const compiled = GetCompiled(document);
    const tankTrigger = compiled.triggers.find((t) => t.id === "Trigger_TankEscort");
    const tankStart = tankTrigger?.firedAt ?? Infinity;
    const inFront = Number(beat.stage) <= 7;

    const actors = inFront
      ? SharedFrontActors(beat, time, player, progress, tankStart)
      : MergedActors(beat, time, player, progress, timeline);

    const encounter = SampleEncounters(compiled, time, actors, (sampleTime) => {
      const sb = timeline.find((e) => sampleTime < e.end) ?? timeline.at(-1);
      const sp = Clamp((sampleTime - sb.start) / sb.duration, 0, 1);
      const sPlayer = SampleBeatRoute(sb, sp);
      return Number(sb.stage) <= 7
        ? SharedFrontActors(sb, sampleTime, sPlayer, sp, tankStart)
        : MergedActors(sb, sampleTime, sPlayer, sp, timeline);
    });

    if (inFront) actors.push(...SharedFrontOpeningActors(time));
    actors.push(...encounter.actors);
    if (!inFront) ApplyMergedSurfaces(actors, time, timeline);

    const effects = [
      ...(inFront ? SharedFrontEffects(beat, time, progress, actors) : MergedEffects(beat, time, progress, actors, timeline)),
      ...encounter.effects,
    ];
    if (beat.id === "03h") {
      actors[0].pose = (progress >= 0.22 && progress < 0.32) || (progress >= 0.5 && progress < 0.6) ? "shoot" : "drag";
      const pursuer = encounter.actors.find((actor) => actor.wave === "RearPursuit" && actor.pose !== "dead");
      if (pursuer) {
        for (const id of ["luo", "liu", ...(actors[0].pose === "shoot" ? ["player"] : [])]) {
          const defender = actors.find((actor) => actor.id === id);
          if (defender) effects.push({ kind: "fire", a: defender.p, b: pursuer.p, side: defender.side, phase: (time * 3.2 + defender.p[0]) % 1 });
        }
      }
    }

    const zone = beat.zone ? { p: beat.zone.slice(0, 2), radius: beat.zone[2], condition: beat.gate, active: progress >= 0.75 } : null;
    const nearest = actors
      .filter((actor) => actor.side === "enemy" && actor.pose !== "dead")
      .reduce((value, actor) => Math.min(value, Distance(player, actor.p)), Infinity);
    const dialogue = inFront
      ? SampleFlowDialogue(beat, time, actors)
      : SampleFlowDialogue(beat, time, actors, MERGED_DIALOGUE);
    const stealthActive = MERGED_STEALTH.beats.includes(beat.id);
    const stealth = {
      active: stealthActive,
      noFire: stealthActive,
      armMinZ: stealthActive ? MERGED_STEALTH.armMinZ : null,
      pulling: false,
      objective: stealthActive ? "穿过关帝庙与西巷绕向老耿家后院，途中禁止响枪" : null,
    };
    const signals = inFront ? [] : MergedSignals(time, timeline);
    const duskStart = BeatById("12a").start, nightStart = BeatById("13e").start;
    const nightBlend = time < duskStart ? 0 : Clamp((time - duskStart) / Math.max(1, nightStart - duskStart), 0, 1);

    return {
      time, beat, stage, progress, player, actors, effects, dialogue,
      spawns: encounter.groups, groups: encounter.groups, triggers: encounter.triggers,
      zone, nearest, stretchersPassed: null, defenseWarning: null, stealth,
      missionArea: playConfig.missionAreas?.[beat.id] || null,
      signals, customSignals: !inFront, nightBlend,
    };
  };

  return {
    id: spec.id,
    spec,
    stages,
    timeline,
    duration,
    BeatById,
    defaultDocument,
    playConfig,
    cinematics,
    sourceInfo: MERGED_SOURCE,
    sourceExcerpts,
    stealthPlan: null,
    surfaceAt: MergedSurfaceAt,
    evaluate: Evaluate,
  };
}

function CompileOriginalVariant(spec) {
  const defaultDocument = spec.overrides
    ? ApplyEncounterOverrides(DEFAULT_ENCOUNTER_DOCUMENT, spec.overrides)
    : DEFAULT_ENCOUNTER_DOCUMENT;
  const playConfig = spec.overrides?.playGates || spec.overrides?.guidance
    ? {
        ...BASE_PLAY_CONFIG,
        gates: { ...BASE_PLAY_CONFIG.gates, ...(spec.overrides.playGates || {}) },
        guidance: { ...BASE_PLAY_CONFIG.guidance, ...(spec.overrides.guidance || {}) },
      }
    : BASE_PLAY_CONFIG;

  return {
    id: spec.id,
    spec,
    stages: STAGE_TIMELINE,
    timeline: FLOW_TIMELINE,
    duration: FLOW_DURATION,
    BeatById: (id) => FLOW_TIMELINE.find((b) => b.id === id),
    defaultDocument,
    playConfig,
    cinematics: ENCOUNTER_CINEMATICS,
    sourceInfo: FLOW_SOURCE,
    sourceExcerpts: FLOW_SOURCE_EXCERPTS,
    stealthPlan: FLOW_VILLAGE_STEALTH,
    surfaceAt: BeishaheSurfaceAt,
    evaluate: (time, doc = defaultDocument) => EvaluateFlow(time, doc),
  };
}

/**
 * 编译指定变体（传入注册表 variantId 或自定义变体规格对象，用于测试同场景覆写变体）。
 */
export function CompileEncounterVariant(variantOrId = ENCOUNTER_DEFAULT_VARIANT_ID) {
  if (typeof variantOrId === "string" && compiledVariantCache.has(variantOrId)) {
    return compiledVariantCache.get(variantOrId);
  }
  const spec = typeof variantOrId === "object" && variantOrId !== null
    ? variantOrId
    : GetEncounterVariantSpec(variantOrId);
  const usesMerged = spec.segments?.includes("L1_BeishaheMerged0813");
  const compiled = usesMerged ? CompileMergedVariant(spec) : CompileOriginalVariant(spec);
  if (typeof variantOrId === "string" && spec.id === variantOrId) {
    compiledVariantCache.set(variantOrId, compiled);
  }
  return compiled;
}
