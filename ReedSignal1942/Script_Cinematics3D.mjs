import { GetCinematicSequence } from "./Data_Cinematics.mjs?v=20260808z24";

function Clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function EaseInOut(value) {
  const t = Clamp01(value);
  return t * t * (3 - 2 * t);
}

function ResolveEffectValue(value, progress) {
  if (Array.isArray(value) && value.length === 2 && value.every(Number.isFinite)) {
    return value[0] + (value[1] - value[0]) * EaseInOut(progress);
  }
  return value;
}

function ResolveAuthoredMap(source, progress) {
  const resolved = {};
  for (const [key, value] of Object.entries(source || {})) resolved[key] = ResolveEffectValue(value, progress);
  return Object.freeze(resolved);
}

function BuildFrame(active) {
  if (!active) return null;
  const sequence = active.sequence;
  const sequenceTime = active.time / active.timeScale;
  const segmentIndex = Math.max(0, sequence.segments.findIndex((segment) => sequenceTime < segment.to));
  const segment = sequence.segments[segmentIndex] || sequence.segments[sequence.segments.length - 1];
  const localProgress = Clamp01((sequenceTime - segment.from) / Math.max(0.001, segment.to - segment.from));
  const camera = ResolveAuthoredMap(segment.camera, localProgress);
  const effects = ResolveAuthoredMap(segment.effects, localProgress);
  const blocking = ResolveAuthoredMap(segment.blocking, localProgress);
  const locksInput = sequence.lockInput === "all" || sequenceTime < Number(sequence.lockInput || 0);
  return Object.freeze({
    active: true,
    id: sequence.id,
    time: sequenceTime,
    duration: sequence.duration,
    progress: Clamp01(sequenceTime / sequence.duration),
    segmentIndex,
    segmentProgress: localProgress,
    camera: segment.camera ? camera : null,
    actors: segment.actors || null,
    effects,
    blocking,
    caption: segment.caption || "",
    soundCue: segment.soundCue || "",
    eventKey: `${sequence.id}:${segmentIndex}`,
    locksInput,
    canSkip: sequenceTime >= Number(sequence.skippableAfter || 0),
    blocksCompletion: Boolean(sequence.blocksCompletion),
    blocksEnding: Boolean(sequence.blocksEnding),
  });
}

export function CreateCinematicDirector(options = {}) {
  const reducedMotion = Boolean(options.reducedMotion);
  let active = null;
  let finished = null;

  function Start(sequenceId) {
    const sequence = GetCinematicSequence(sequenceId);
    if (!sequence) return false;
    active = {
      sequence,
      time: 0,
      timeScale: reducedMotion ? 0.72 : 1,
    };
    finished = null;
    return true;
  }

  function Finish(reason = "complete") {
    if (!active) return null;
    finished = Object.freeze({
      id: active.sequence.id,
      reason,
      blocksCompletion: Boolean(active.sequence.blocksCompletion),
      blocksEnding: Boolean(active.sequence.blocksEnding),
    });
    active = null;
    return finished;
  }

  function Update(deltaTime, skipRequested = false) {
    if (!active) return null;
    const frameBefore = BuildFrame(active);
    if (skipRequested && frameBefore?.canSkip) {
      Finish("skipped");
      return null;
    }
    active.time += Math.max(0, Math.min(0.05, deltaTime));
    if (active.time / active.timeScale >= active.sequence.duration) {
      Finish("complete");
      return null;
    }
    return BuildFrame(active);
  }

  function ConsumeFinished() {
    const value = finished;
    finished = null;
    return value;
  }

  return Object.freeze({
    Start,
    Finish,
    Update,
    ConsumeFinished,
    GetFrame: () => BuildFrame(active),
    IsPlaying: () => Boolean(active),
    GetActiveId: () => active?.sequence.id || null,
  });
}
