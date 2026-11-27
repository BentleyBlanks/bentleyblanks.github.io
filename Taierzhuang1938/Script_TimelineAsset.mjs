// Unity-style Timeline v2 intermediate asset model, validator, dependency scanner,
// deterministic evaluator (func(t)), and v1-to-v2 compiler.
//
// Pure module: ZERO three.js, ZERO DOM — shared by Node CLI/tests and Browser runtime.
//
// Design:
//   A Timeline v2 JSON file (`schema: "tengxian-timeline/2"`) is 100% self-contained:
//   it declares its own `bindings` (live scene actors/objects to possess with fallbackPrefabs),
//   `spawns` (ephemeral prefabs owned by the timeline), and typed `tracks`:
//     camera | transform | animation | dialogue | audio | vfx | environment | overlay | aircraft | slowmo | signal
//   Continuous tracks evaluate deterministically at any time `t` (`EvaluateTimelineAt`).
//   Discrete markers fire on crossing `(fromT, toT]` and explicitly declare `onSkip: "apply" | "ignore"`.
//   `CollectTimelineDependencies(doc)` statically enumerates every prefab, clip, voice, sfx,
//   and vfx kind so WebGL shader/texture/audio warmup finishes BEFORE playback starts.

import {
  SamplePrevizActor, SamplePrevizCamera, PrevizOverlays, PrevizShakeOffset,
  PrevizTimeScale, PrevizWallTime, PrevizHourAt, SamplePrevizAircraft,
  PrevizSequenceDuration, PREVIZ_DEFAULTS, WrapDeg,
} from "./Script_EditorBlockoutPrevizPlan.mjs";

export const TIMELINE_V2_SCHEMA = "tengxian-timeline/2";
export const TIMELINE_V2_FPS = 30;
export const TIMELINE_V2_LINE_FALLBACK_S = 2;

export const TIMELINE_MODES = Object.freeze(["cinematic", "interactive", "setpiece"]);
export const TIMELINE_INPUT_LOCKS = Object.freeze(["all", "lookOnly", "movementOnly", "none"]);
export const TIMELINE_BINDING_TYPES = Object.freeze([
  "camera", "actor", "puppet", "tank", "sceneObject", "player", "aircraft", "prop",
]);
export const TIMELINE_MISSING_POLICIES = Object.freeze(["spawnFallback", "skip", "error"]);
export const TIMELINE_TRACK_TYPES = Object.freeze([
  "camera", "transform", "animation", "dialogue", "audio", "vfx", "environment", "overlay", "aircraft", "slowmo", "signal",
]);
export const TIMELINE_SKIP_POLICIES = Object.freeze(["apply", "ignore"]);

const ID_RE = /^[A-Za-z][A-Za-z0-9_-]*$/;
const SLOT_RE = /^[A-Za-z0-9_.:/-]+$/;
const IsObject = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const Finite = (v) => typeof v === "number" && Number.isFinite(v);
const Clamp01 = (v) => Math.max(0, Math.min(1, v));
const Clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

function EaseValue(u, ease = "inOut") {
  const x = Clamp01(u);
  if (ease === "linear") return x;
  if (ease === "step") return x >= 1 ? 1 : 0;
  if (ease === "in") return x * x;
  if (ease === "out") return 1 - (1 - x) * (1 - x);
  return x * x * (3 - 2 * x);
}

function LerpAngleDeg(a, b, t) {
  return WrapDeg(a + WrapDeg(b - a) * Clamp01(t));
}

export function DefaultInputLockForMode(mode) {
  if (mode === "cinematic") return "all";
  if (mode === "interactive") return "movementOnly";
  return "none";
}

export function IsTimelineV2(doc) {
  return IsObject(doc) && doc.schema === TIMELINE_V2_SCHEMA;
}

// ---------------------------------------------------------------------------
// Voice Manifest helper

export function BuildVoiceLineMap(voice) {
  const map = new Map();
  for (const scene of voice?.scenes || []) {
    for (const line of scene?.lines || []) if (line?.id) map.set(line.id, line);
  }
  for (const line of Array.isArray(voice?.lines) ? voice.lines : []) {
    if (line?.id) map.set(line.id, line);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Duration & Normalization

export function TimelineAssetDuration(doc, { lineDuration = null } = {}) {
  if (!IsObject(doc)) return 0;
  let maxT = Finite(doc.durationS) && doc.durationS > 0 ? doc.durationS : 0;
  for (const seg of Array.isArray(doc.segments) ? doc.segments : []) {
    if (Finite(seg?.end)) maxT = Math.max(maxT, seg.end);
    else if (Finite(seg?.start) && Finite(seg?.durationS)) maxT = Math.max(maxT, seg.start + seg.durationS);
  }
  for (const track of Array.isArray(doc.tracks) ? doc.tracks : []) {
    if (!IsObject(track) || track.muted === true) continue;
    for (const c of Array.isArray(track.clips) ? track.clips : []) {
      if (!IsObject(c)) continue;
      const t = Finite(c.t) ? c.t : 0;
      let dur = Finite(c.dur) ? c.dur : 0;
      if (track.type === "dialogue" && !Finite(c.dur) && typeof c.line === "string") {
        const ld = lineDuration ? lineDuration(c.line) : null;
        dur = Finite(ld) ? ld : TIMELINE_V2_LINE_FALLBACK_S;
      }
      maxT = Math.max(maxT, t + Math.max(0, dur));
    }
    for (const k of Array.isArray(track.keys) ? track.keys : []) {
      if (IsObject(k) && Finite(k.t)) maxT = Math.max(maxT, k.t);
    }
    for (const m of Array.isArray(track.markers) ? track.markers : []) {
      if (IsObject(m) && Finite(m.t)) maxT = Math.max(maxT, m.t);
    }
    if (track.type === "aircraft" && Array.isArray(track.path)) {
      for (const w of track.path) if (Finite(w?.t)) maxT = Math.max(maxT, w.t);
    }
  }
  return maxT;
}

export function NormalizeTimelineAsset(raw) {
  const doc = Clone(raw || {});
  doc.schema = TIMELINE_V2_SCHEMA;
  doc.mode = TIMELINE_MODES.includes(doc.mode) ? doc.mode : "cinematic";
  doc.inputLock = TIMELINE_INPUT_LOCKS.includes(doc.inputLock) ? doc.inputLock : DefaultInputLockForMode(doc.mode);
  doc.allowSkip = doc.allowSkip !== undefined ? !!doc.allowSkip : doc.mode === "cinematic";
  doc.hideViewmodel = doc.hideViewmodel !== undefined ? !!doc.hideViewmodel : doc.mode === "cinematic";
  doc.hideHud = doc.hideHud !== undefined ? !!doc.hideHud : doc.mode === "cinematic";
  doc.cameraMode = doc.cameraMode === "cut" ? "cut" : "move";
  doc.bindings = Array.isArray(doc.bindings) ? doc.bindings.map((b) => ({
    ...b,
    onMissing: TIMELINE_MISSING_POLICIES.includes(b.onMissing) ? b.onMissing : "spawnFallback",
  })) : [];
  doc.spawns = Array.isArray(doc.spawns) ? doc.spawns : [];
  doc.segments = Array.isArray(doc.segments) ? doc.segments.map((s, i) => ({
    id: s.id || `seg_${i}`,
    title: s.title || s.id || `seg_${i}`,
    start: Finite(s.start) ? s.start : 0,
    end: Finite(s.end) ? s.end : (Finite(s.start) && Finite(s.durationS) ? s.start + s.durationS : 0),
    durationS: Finite(s.durationS) ? s.durationS : Math.max(0, (s.end || 0) - (s.start || 0)),
    ...(s.player ? { player: s.player } : {}),
    ...(Array.isArray(s.signals) ? { signals: [...s.signals] } : {}),
  })).sort((a, b) => a.start - b.start) : [];

  doc.tracks = Array.isArray(doc.tracks) ? doc.tracks.map((tr, i) => {
    const track = { ...tr, id: tr.id || `${tr.type || "track"}_${i}`, muted: tr.muted === true };
    if (Array.isArray(track.clips)) {
      track.clips = track.clips.map((c) => ({ ...c })).sort((a, b) => (a.t || 0) - (b.t || 0));
    }
    if (Array.isArray(track.keys)) {
      track.keys = track.keys.map((k) => ({ ...k })).sort((a, b) => (a.t || 0) - (b.t || 0));
    }
    if (Array.isArray(track.markers)) {
      track.markers = track.markers.map((m) => ({
        ...m,
        onSkip: TIMELINE_SKIP_POLICIES.includes(m.onSkip)
          ? m.onSkip
          : (DefaultOnSkipForAction(m.action)),
      })).sort((a, b) => (a.t || 0) - (b.t || 0));
    }
    return track;
  }) : [];

  doc.durationS = TimelineAssetDuration(doc);
  return doc;
}

export function DefaultOnSkipForAction(action) {
  if (typeof action !== "string") return "ignore";
  if (
    action.startsWith("world.")
    || action.startsWith("encounter.")
    || action.startsWith("environment.")
    || action.startsWith("player.")
  ) return "apply";
  return "ignore";
}

// ---------------------------------------------------------------------------
// Validation

export function ValidateTimelineAsset(doc, { voice = null, knownActions = null, knownPrefabs = null } = {}) {
  const errors = [], warnings = [];
  if (!IsObject(doc)) return { ok: false, errors: ["Timeline v2 文件要是 JSON 对象"], warnings };
  if (doc.schema !== TIMELINE_V2_SCHEMA) errors.push(`schema 要是 ${TIMELINE_V2_SCHEMA}`);
  if (typeof doc.id !== "string" || !ID_RE.test(doc.id)) errors.push("id 要是字母开头的标识符");
  if (doc.title !== undefined && typeof doc.title !== "string") errors.push("title 要是字符串");
  if (doc.mode !== undefined && !TIMELINE_MODES.includes(doc.mode)) {
    errors.push(`mode 要是 ${TIMELINE_MODES.join(" / ")}`);
  }
  if (doc.inputLock !== undefined && !TIMELINE_INPUT_LOCKS.includes(doc.inputLock)) {
    errors.push(`inputLock 要是 ${TIMELINE_INPUT_LOCKS.join(" / ")}`);
  }
  if (doc.durationS !== undefined && !(Finite(doc.durationS) && doc.durationS > 0)) {
    errors.push("durationS 要是正数");
  }

  const slots = new Map(); // slot -> { source, type, prefab }
  if (doc.bindings !== undefined && !Array.isArray(doc.bindings)) errors.push("bindings 要是数组");
  (Array.isArray(doc.bindings) ? doc.bindings : []).forEach((b, i) => {
    const at = `bindings[${i}]`;
    if (!IsObject(b)) { errors.push(`${at} 要是对象`); return; }
    if (typeof b.slot !== "string" || !SLOT_RE.test(b.slot)) errors.push(`${at}.slot 要是有效槽位名`);
    else if (slots.has(b.slot)) errors.push(`${at}.slot 重复：${b.slot}`);
    else slots.set(b.slot, { source: "binding", type: b.type, prefab: b.fallbackPrefab || null });
    if (!TIMELINE_BINDING_TYPES.includes(b.type)) errors.push(`${at}.type 要是 ${TIMELINE_BINDING_TYPES.join(" / ")}`);
    if (b.onMissing !== undefined && !TIMELINE_MISSING_POLICIES.includes(b.onMissing)) {
      errors.push(`${at}.onMissing 要是 ${TIMELINE_MISSING_POLICIES.join(" / ")}`);
    }
    if (b.onMissing === "spawnFallback" && b.type !== "camera" && b.type !== "player" && b.type !== "sceneObject" && !b.fallbackPrefab) {
      warnings.push(`${at} 设了 spawnFallback 但未提供 fallbackPrefab`);
    }
    if (knownPrefabs && b.fallbackPrefab && !knownPrefabs(b.fallbackPrefab)) {
      errors.push(`${at}.fallbackPrefab 未在 PrefabRegistry 登记：${b.fallbackPrefab}`);
    }
  });

  if (doc.spawns !== undefined && !Array.isArray(doc.spawns)) errors.push("spawns 要是数组");
  (Array.isArray(doc.spawns) ? doc.spawns : []).forEach((s, i) => {
    const at = `spawns[${i}]`;
    if (!IsObject(s)) { errors.push(`${at} 要是对象`); return; }
    if (typeof s.slot !== "string" || !SLOT_RE.test(s.slot)) errors.push(`${at}.slot 要是有效槽位名`);
    else if (slots.has(s.slot)) errors.push(`${at}.slot 与 bindings/spawns 重名：${s.slot}`);
    else slots.set(s.slot, { source: "spawn", type: s.type || "prefab", prefab: s.prefab || null });
    if (typeof s.prefab !== "string" || !s.prefab) errors.push(`${at}.prefab 必填`);
    else if (knownPrefabs && !knownPrefabs(s.prefab)) {
      errors.push(`${at}.prefab 未在 PrefabRegistry 登记：${s.prefab}`);
    }
  });

  if (!Array.isArray(doc.tracks) || doc.tracks.length === 0) {
    errors.push("tracks 至少要包含一条轨道");
    return { ok: false, errors, warnings };
  }

  const voiceMap = voice ? BuildVoiceLineMap(voice) : null;
  const trackIds = new Set();
  doc.tracks.forEach((tr, ti) => {
    const at = `tracks[${ti}]`;
    if (!IsObject(tr)) { errors.push(`${at} 要是对象`); return; }
    if (!TIMELINE_TRACK_TYPES.includes(tr.type)) {
      errors.push(`${at}.type 不支持：${tr.type}（允许 ${TIMELINE_TRACK_TYPES.join(" / ")}）`);
      return;
    }
    if (tr.id !== undefined) {
      if (typeof tr.id !== "string" || !tr.id) errors.push(`${at}.id 要是非空字符串`);
      else if (trackIds.has(tr.id)) errors.push(`${at}.id 重复：${tr.id}`);
      else trackIds.add(tr.id);
    }
    if (["transform", "animation"].includes(tr.type)) {
      if (typeof tr.target !== "string" || !tr.target) errors.push(`${at}.target 必填`);
      else if (tr.target !== "player" && !slots.has(tr.target)) {
        errors.push(`${at}.target "${tr.target}" 不在 bindings 或 spawns 里`);
      }
    }
    if (tr.type === "camera") {
      if (!Array.isArray(tr.clips)) errors.push(`${at}.clips 要是数组`);
      (Array.isArray(tr.clips) ? tr.clips : []).forEach((c, ci) => {
        if (!IsObject(c) || !Finite(c.t) || c.t < 0) errors.push(`${at}.clips[${ci}].t 要是非负数`);
        if (c.dur !== undefined && (!Finite(c.dur) || c.dur < 0)) errors.push(`${at}.clips[${ci}].dur 要是非负数`);
      });
    } else if (tr.type === "transform") {
      if (!Array.isArray(tr.keys)) errors.push(`${at}.keys 要是数组`);
      (Array.isArray(tr.keys) ? tr.keys : []).forEach((k, ki) => {
        if (!IsObject(k) || !Finite(k.t) || k.t < 0) errors.push(`${at}.keys[${ki}].t 要是非负数`);
      });
    } else if (tr.type === "animation") {
      if (!Array.isArray(tr.keys)) errors.push(`${at}.keys 要是数组`);
      (Array.isArray(tr.keys) ? tr.keys : []).forEach((k, ki) => {
        if (!IsObject(k) || !Finite(k.t) || k.t < 0) errors.push(`${at}.keys[${ki}].t 要是非负数`);
      });
    } else if (tr.type === "dialogue") {
      if (!Array.isArray(tr.clips)) errors.push(`${at}.clips 要是数组`);
      (Array.isArray(tr.clips) ? tr.clips : []).forEach((c, ci) => {
        if (!IsObject(c) || !Finite(c.t) || c.t < 0) errors.push(`${at}.clips[${ci}].t 要是非负数`);
        if (typeof c.line !== "string" && typeof c.text !== "string") {
          errors.push(`${at}.clips[${ci}] 需要 line（配音编号）或 text（纯文字对白）`);
        }
        if (voiceMap && typeof c.line === "string" && !voiceMap.has(c.line)) {
          errors.push(`${at}.clips[${ci}].line 在台词清单里找不到：${c.line}`);
        }
      });
    } else if (tr.type === "audio") {
      if (!Array.isArray(tr.clips)) errors.push(`${at}.clips 要是数组`);
      (Array.isArray(tr.clips) ? tr.clips : []).forEach((c, ci) => {
        if (!IsObject(c) || !Finite(c.t) || c.t < 0) errors.push(`${at}.clips[${ci}].t 要是非负数`);
        if (typeof c.cue !== "string" && typeof c.name !== "string" && typeof c.music !== "string") {
          errors.push(`${at}.clips[${ci}] 需要 cue / name / music`);
        }
      });
    } else if (tr.type === "vfx") {
      if (!Array.isArray(tr.clips)) errors.push(`${at}.clips 要是数组`);
      (Array.isArray(tr.clips) ? tr.clips : []).forEach((c, ci) => {
        if (!IsObject(c) || !Finite(c.t) || c.t < 0) errors.push(`${at}.clips[${ci}].t 要是非负数`);
        if (typeof c.kind !== "string" && typeof c.type !== "string") {
          errors.push(`${at}.clips[${ci}] 需要 type / kind`);
        }
      });
    } else if (tr.type === "environment") {
      if (!Array.isArray(tr.clips)) errors.push(`${at}.clips 要是数组`);
      (Array.isArray(tr.clips) ? tr.clips : []).forEach((c, ci) => {
        if (!IsObject(c) || !Finite(c.t) || c.t < 0) errors.push(`${at}.clips[${ci}].t 要是非负数`);
      });
    } else if (tr.type === "overlay") {
      if (!Array.isArray(tr.clips)) errors.push(`${at}.clips 要是数组`);
      (Array.isArray(tr.clips) ? tr.clips : []).forEach((c, ci) => {
        if (!IsObject(c) || !Finite(c.t) || c.t < 0) errors.push(`${at}.clips[${ci}].t 要是非负数`);
        if (!["black", "flash", "caption", "shake"].includes(c.kind)) {
          errors.push(`${at}.clips[${ci}].kind 要是 black / flash / caption / shake`);
        }
      });
    } else if (tr.type === "aircraft") {
      if (!Array.isArray(tr.path) || tr.path.length < 2) errors.push(`${at}.path 至少需要 2 个航点`);
    } else if (tr.type === "slowmo") {
      if (!Array.isArray(tr.clips)) errors.push(`${at}.clips 要是数组`);
      (Array.isArray(tr.clips) ? tr.clips : []).forEach((c, ci) => {
        if (!IsObject(c) || !Finite(c.t) || !Finite(c.dur) || c.dur <= 0) errors.push(`${at}.clips[${ci}] 需要合法 t 与正数 dur`);
        if (!Finite(c.rate) || c.rate < 0.05 || c.rate > 1) errors.push(`${at}.clips[${ci}].rate 要在 0.05–1`);
      });
    } else if (tr.type === "signal") {
      if (!Array.isArray(tr.markers)) errors.push(`${at}.markers 要是数组`);
      (Array.isArray(tr.markers) ? tr.markers : []).forEach((m, mi) => {
        const mat = `${at}.markers[${mi}]`;
        if (!IsObject(m) || !Finite(m.t) || m.t < 0) errors.push(`${mat}.t 要是非负数`);
        if (typeof m.action !== "string" || !m.action) errors.push(`${mat}.action 必填`);
        else if (knownActions && !knownActions(m.action)) {
          errors.push(`${mat}.action 未在 ActionRegistry 登记：${m.action}`);
        }
        if (m.onSkip !== undefined && !TIMELINE_SKIP_POLICIES.includes(m.onSkip)) {
          errors.push(`${mat}.onSkip 要是 apply / ignore`);
        }
      });
    }
  });

  if (TimelineAssetDuration(doc) <= 0) errors.push("Timeline 总时长必须大于 0");
  return { ok: errors.length === 0, errors, warnings };
}

// ---------------------------------------------------------------------------
// Static Dependency Collector (for WebGL Shader / Cast / Audio Pre-Warm)

export function CollectTimelineDependencies(doc) {
  const prefabs = new Set();
  const castIds = new Set();
  const clips = new Set();
  const weapons = new Set();
  const voices = new Set();
  const sfx = new Set();
  const music = new Set();
  const vfx = new Set();
  const aircraft = new Set();
  const actions = new Set();

  const RegisterPrefab = (prefab, init) => {
    if (typeof prefab === "string" && prefab) {
      prefabs.add(prefab);
      if (prefab.startsWith("Cast/")) castIds.add(prefab.slice(5));
      if (prefab.startsWith("Aircraft/")) aircraft.add(prefab.slice(9));
    }
    if (init?.castId) castIds.add(init.castId);
    if (init?.weapon) weapons.add(init.weapon);
  };

  for (const b of doc?.bindings || []) RegisterPrefab(b.fallbackPrefab, b.init);
  for (const s of doc?.spawns || []) RegisterPrefab(s.prefab, s.init);

  for (const tr of doc?.tracks || []) {
    if (!IsObject(tr) || tr.muted === true) continue;
    if (tr.type === "animation") {
      for (const k of tr.keys || []) {
        if (typeof k.clip === "string" && k.clip) clips.add(k.clip);
        if (typeof k.weapon === "string" && k.weapon) weapons.add(k.weapon);
        if (k.throw) clips.add("GrenadeThrow");
      }
    } else if (tr.type === "dialogue") {
      for (const c of tr.clips || []) if (typeof c.line === "string" && c.line) voices.add(c.line);
    } else if (tr.type === "audio") {
      for (const c of tr.clips || []) {
        if (typeof c.cue === "string" && c.cue) sfx.add(c.cue);
        if (typeof c.name === "string" && c.name) sfx.add(c.name);
        if (typeof c.music === "string" && c.music) music.add(c.music);
      }
    } else if (tr.type === "vfx") {
      for (const c of tr.clips || []) vfx.add(c.kind || c.type || "explosion");
    } else if (tr.type === "aircraft") {
      aircraft.add(tr.model || "MitsubishiKi30");
    } else if (tr.type === "signal") {
      for (const m of tr.markers || []) {
        if (typeof m.action === "string") actions.add(m.action);
        if (m.action === "audio.playSfx" && m.params?.name) sfx.add(m.params.name);
        if (m.action === "audio.music" && m.params?.cue) music.add(m.params.cue);
        if (m.action === "player.giveWeapon" && m.params?.weapon) weapons.add(m.params.weapon);
      }
    }
  }

  return {
    prefabs: [...prefabs].sort(),
    castIds: [...castIds].sort(),
    clips: [...clips].sort(),
    weapons: [...weapons].sort(),
    voices: [...voices].sort(),
    sfx: [...sfx].sort(),
    music: [...music].sort(),
    vfx: [...vfx].sort(),
    aircraft: [...aircraft].sort(),
    actions: [...actions].sort(),
    voiceManifest: typeof doc?.voice === "string" ? doc.voice : null,
    faceTracks: typeof doc?.faceTracks === "string" ? doc.faceTracks : null,
  };
}

// ---------------------------------------------------------------------------
// Deterministic Evaluator: func(t)

export function LocateSegment(doc, t) {
  const segs = doc?.segments || [];
  if (!segs.length) return { index: -1, segment: null, local: t };
  const clamped = Math.max(0, Math.min(doc.durationS || 0, Number(t) || 0));
  for (let i = 0; i < segs.length; i++) {
    if (clamped < segs[i].end || i === segs.length - 1) {
      return { index: i, segment: segs[i], local: Math.max(0, clamped - segs[i].start) };
    }
  }
  const last = segs[segs.length - 1];
  return { index: segs.length - 1, segment: last, local: last.durationS };
}

export function SampleTransformTrack(track, t, base = null) {
  const keys = track?.keys || [];
  const state = {
    x: base?.x ?? 0,
    y: base?.y ?? null,
    z: base?.z ?? 0,
    yawDeg: base?.yawDeg ?? 0,
    pitchDeg: base?.pitchDeg ?? 0,
    rollDeg: base?.rollDeg ?? 0,
    sx: base?.sx ?? 1,
    sy: base?.sy ?? 1,
    sz: base?.sz ?? 1,
    visible: base?.visible !== false,
    moving: false,
    speed: 0,
  };
  if (!keys.length) return state;

  // Step fields (visible)
  for (const k of keys) {
    if (k.t > t) break;
    if (k.visible !== undefined) state.visible = !!k.visible;
  }

  // Continuous fields: find bracketing keys with x/z (or y/rot/scale)
  const LerpAxis = (field, angle = false) => {
    let prev = null, next = null;
    for (const k of keys) {
      if (k[field] === undefined) continue;
      if (k.t <= t) prev = k;
      else { next = k; break; }
    }
    if (!prev && !next) return;
    if (prev && !next) { state[field] = prev[field]; return; }
    if (!prev && next) { state[field] = next[field]; return; }
    const span = next.t - prev.t;
    if (span <= 1e-6 || next.ease === "step") {
      state[field] = t >= next.t ? next[field] : prev[field];
      return;
    }
    const u = EaseValue((t - prev.t) / span, next.ease || "inOut");
    state[field] = angle ? LerpAngleDeg(prev[field], next[field], u) : prev[field] + (next[field] - prev[field]) * u;
  };

  // XZ movement speed tracking
  let prevXZ = null, nextXZ = null;
  for (const k of keys) {
    if (!Finite(k.x) || !Finite(k.z)) continue;
    if (k.t <= t) prevXZ = k;
    else { nextXZ = k; break; }
  }
  if (prevXZ && nextXZ && nextXZ.t > prevXZ.t && nextXZ.ease !== "step") {
    const dist = Math.hypot(nextXZ.x - prevXZ.x, nextXZ.z - prevXZ.z);
    if (dist > 0.02) {
      state.moving = true;
      state.speed = dist / (nextXZ.t - prevXZ.t);
    }
  }

  LerpAxis("x", false);
  LerpAxis("y", false);
  LerpAxis("z", false);
  LerpAxis("yawDeg", true);
  LerpAxis("pitchDeg", true);
  LerpAxis("rollDeg", true);
  LerpAxis("sx", false);
  LerpAxis("sy", false);
  LerpAxis("sz", false);
  return state;
}

export function EvaluateSlowmoScale(doc, t) {
  const slowmoClips = [];
  for (const tr of doc?.tracks || []) {
    if (tr.type === "slowmo" && !tr.muted && Array.isArray(tr.clips)) slowmoClips.push(...tr.clips);
  }
  if (!slowmoClips.length) return 1;
  return PrevizTimeScale({ slowmo: slowmoClips }, t);
}

export function EvaluateWallTime(doc, t) {
  const slowmoClips = [];
  for (const tr of doc?.tracks || []) {
    if (tr.type === "slowmo" && !tr.muted && Array.isArray(tr.clips)) slowmoClips.push(...tr.clips);
  }
  if (!slowmoClips.length) return t;
  return PrevizWallTime({ slowmo: slowmoClips }, t);
}

export function EvaluateTimelineAt(doc, t, {
  resolveAnchor = null,
  resolveActor = null,
  clipDuration = null,
  lineDuration = null,
  baseUnits = null,
  baseHour = 12,
  resolveTime = null,
  cameraMode = null,
  groundAt = null,
} = {}) {
  const clamped = Math.max(0, Math.min(doc.durationS || 0, Number(t) || 0));
  const segLoc = LocateSegment(doc, clamped);
  const timeScale = EvaluateSlowmoScale(doc, clamped);

  const transforms = new Map();
  const animations = new Map();
  const activeLines = [];
  const activeSmoke = [];
  const aircraft = [];
  const overlayEvents = [];
  const timeEvents = [];
  const cameraClips = [];
  const signals = new Map();

  // Base segment signals first
  if (Array.isArray(segLoc.segment?.signals)) {
    for (const s of segLoc.segment.signals) signals.set(s, true);
  }

  // Signal track deterministic state (world.setSignal up to t)
  let inputLock = doc.inputLock || DefaultInputLockForMode(doc.mode);
  for (const tr of doc.tracks || []) {
    if (tr.muted) continue;
    if (tr.type === "signal") {
      for (const m of tr.markers || []) {
        if (m.t > clamped) break;
        if (m.action === "world.setSignal" && m.params?.id) {
          signals.set(m.params.id, m.params.on !== false);
        } else if (m.action === "player.setControl" && TIMELINE_INPUT_LOCKS.includes(m.params?.inputLock)) {
          inputLock = m.params.inputLock;
        }
      }
    } else if (tr.type === "camera") {
      for (const c of tr.clips || []) cameraClips.push({ ...c, _trackId: tr.id });
    } else if (tr.type === "overlay") {
      for (const c of tr.clips || []) {
        overlayEvents.push({
          t: c.t, dur: c.dur, fade: c.fade, type: c.kind,
          strength: c.strength, text: c.text,
        });
      }
    } else if (tr.type === "environment") {
      for (const c of tr.clips || []) {
        timeEvents.push({
          t: c.t, dur: c.dur, type: "time",
          hour: c.hour, look: c.look, ease: c.ease,
        });
      }
    } else if (tr.type === "dialogue") {
      for (const c of tr.clips || []) {
        const dur = Finite(c.dur) ? c.dur : (lineDuration ? (lineDuration(c.line) ?? TIMELINE_V2_LINE_FALLBACK_S) : TIMELINE_V2_LINE_FALLBACK_S);
        const hold = PREVIZ_DEFAULTS.subtitleHoldS;
        if (clamped >= c.t && clamped < c.t + dur + hold) {
          activeLines.push({
            line: c.line || null,
            text: c.text || null,
            speaker: c.speaker || null,
            actor: c.actor || null,
            start: c.t,
            end: c.t + dur,
            trackId: tr.id,
          });
        }
      }
    } else if (tr.type === "vfx") {
      for (let ci = 0; ci < (tr.clips || []).length; ci++) {
        const c = tr.clips[ci];
        if ((c.type || c.kind) === "smoke") {
          const dur = Finite(c.dur) ? c.dur : 6;
          if (clamped >= c.t && clamped < c.t + dur) {
            activeSmoke.push({
              id: `${tr.id}:${ci}`,
              x: c.x, y: c.y, z: c.z,
              kind: c.smokeKind || c.kind || "SmokeDust",
              scale: c.scale,
              prewarm: c.prewarm === true,
              startedAt: c.t,
            });
          }
        }
      }
    } else if (tr.type === "aircraft") {
      const pose = SamplePrevizAircraft(tr, clamped, { groundAt });
      if (pose) {
        aircraft.push({
          id: tr.id,
          slot: tr.target || tr.id,
          model: tr.model || "MitsubishiKi30",
          pose,
        });
      }
    } else if (tr.type === "transform") {
      const base = baseUnits?.get?.(tr.target) || null;
      transforms.set(tr.target, SampleTransformTrack(tr, clamped, base));
    } else if (tr.type === "animation") {
      const base = baseUnits?.get?.(tr.target) || tr.base || { id: tr.target, x: 0, z: 0, yawDeg: 0, stance: "stand", state: "alive" };
      const sampled = SamplePrevizActor(
        { id: tr.target, keys: tr.keys || [] },
        clamped,
        base,
        { resolve: resolveActor, clipDuration },
      );
      animations.set(tr.target, sampled);
    }
  }

  // Overlays & shake
  const overlays = PrevizOverlays({ events: overlayEvents }, clamped);

  // Camera
  let camera = null;
  if (cameraClips.length && resolveAnchor) {
    cameraClips.sort((a, b) => a.t - b.t);
    const cuts = (cameraMode || doc.cameraMode) === "cut";
    const shot = SamplePrevizCamera(cameraClips, clamped, resolveAnchor, { cuts });
    if (shot) {
      const shakeAmt = Math.max(shot.shake || 0, overlays.shake || 0);
      const o = PrevizShakeOffset(shakeAmt, clamped);
      const srcClip = cameraClips[shot.index] || null;
      camera = {
        position: { x: shot.position.x + o.x, y: shot.position.y + o.y, z: shot.position.z + o.z },
        yawDeg: shot.yawDeg + o.yawDeg,
        pitchDeg: shot.pitchDeg + o.pitchDeg,
        fov: shot.fov,
        index: shot.index,
        shotId: srcClip?.id || `${srcClip?._trackId || "cam"}:${shot.index}`,
        eye: shot.eye,
        free: shot.free === true,
        shake: o,
      };
    }
  }

  // Environment hour
  const envHour = timeEvents.length
    ? PrevizHourAt({ events: timeEvents }, clamped, baseHour, resolveTime)
    : null;

  return {
    t: clamped,
    segmentIndex: segLoc.index,
    segmentId: segLoc.segment?.id ?? null,
    segmentTitle: segLoc.segment?.title ?? null,
    segmentLocalT: segLoc.local,
    timeScale,
    inputLock,
    camera,
    transforms,
    animations,
    activeLines,
    overlays,
    environment: { hour: envHour },
    activeSmoke,
    aircraft,
    signals,
  };
}

// ---------------------------------------------------------------------------
// Discrete Marker & Skip Collector

/**
 * Collect discrete events crossed in (fromT, toT].
 * When fromT < 0 and toT >= 0, events at t === 0 are included.
 */
export function CollectFiredMarkers(doc, fromT, toT) {
  const fired = [];
  const Crossed = (mt) => (fromT < 0 ? mt >= 0 && mt <= toT : mt > fromT && mt <= toT);

  for (const tr of doc?.tracks || []) {
    if (tr.muted) continue;
    if (tr.type === "signal") {
      for (let i = 0; i < (tr.markers || []).length; i++) {
        const m = tr.markers[i];
        if (!Crossed(m.t)) continue;
        fired.push({
          kind: "signal",
          t: m.t,
          trackId: tr.id,
          index: i,
          action: m.action,
          params: m.params || {},
          onSkip: m.onSkip || DefaultOnSkipForAction(m.action),
        });
      }
    } else if (tr.type === "dialogue") {
      for (let i = 0; i < (tr.clips || []).length; i++) {
        const c = tr.clips[i];
        if (!Crossed(c.t)) continue;
        fired.push({ kind: "dialogue", t: c.t, trackId: tr.id, index: i, clip: c });
      }
    } else if (tr.type === "audio") {
      for (let i = 0; i < (tr.clips || []).length; i++) {
        const c = tr.clips[i];
        if (!Crossed(c.t)) continue;
        fired.push({ kind: "audio", t: c.t, trackId: tr.id, index: i, clip: c });
      }
    } else if (tr.type === "vfx") {
      for (let i = 0; i < (tr.clips || []).length; i++) {
        const c = tr.clips[i];
        const kind = c.type || c.kind;
        if (kind === "smoke") continue; // smoke is continuous
        if (!Crossed(c.t)) continue;
        fired.push({ kind: "vfx", t: c.t, trackId: tr.id, index: i, clip: c });
      }
    }
  }
  fired.sort((a, b) => a.t - b.t);
  return fired;
}

/**
 * Collect all remaining state-changing markers (`onSkip: "apply"`) strictly after `fromT`
 * so skipping a cutscene never skips required world signals, environment changes, or mission handoffs.
 */
export function CollectSkipActions(doc, fromT = -1) {
  const out = [];
  for (const tr of doc?.tracks || []) {
    if (tr.muted) continue;
    if (tr.type === "signal") {
      for (const m of tr.markers || []) {
        if (m.t <= fromT) continue;
        const policy = m.onSkip || DefaultOnSkipForAction(m.action);
        if (policy === "apply") {
          out.push({ t: m.t, action: m.action, params: m.params || {}, trackId: tr.id });
        }
      }
    } else if (tr.type === "environment") {
      // Apply the final environment time clip if any occur after fromT
      const later = (tr.clips || []).filter((c) => c.t > fromT);
      if (later.length) {
        const last = later[later.length - 1];
        out.push({
          t: last.t,
          action: "environment.setHour",
          params: { hour: last.hour, look: last.look },
          trackId: tr.id,
        });
      }
    }
  }
  out.sort((a, b) => a.t - b.t);
  return out;
}

// ---------------------------------------------------------------------------
// Overview / Describe helpers (for CLI & Timeline Editor Panel)

export function TimelineAssetOverview(doc, { lineInfo = null } = {}) {
  const durationS = TimelineAssetDuration(doc, {
    lineDuration: lineInfo ? (id) => lineInfo(id)?.durationS ?? TIMELINE_V2_LINE_FALLBACK_S : null,
  });
  const segments = (doc.segments || []).map((s, i) => ({
    index: i, id: s.id, keyframe: s.id, title: s.title || s.id,
    start: s.start, durationS: s.durationS || Math.max(0, s.end - s.start), end: s.end,
    src: `segments[${i}]`,
  }));
  const shots = [], lines = [], events = [];
  for (let ti = 0; ti < (doc.tracks || []).length; ti++) {
    const tr = doc.tracks[ti];
    if (tr.muted) continue;
    if (tr.type === "camera") {
      const clips = tr.clips || [];
      clips.forEach((c, ci) => {
        const next = clips[ci + 1];
        const t1 = next ? next.t : durationS;
        shots.push({
          t0: +c.t.toFixed(2), t1: +Math.max(c.t, Math.min(durationS, t1)).toFixed(2),
          label: c.id || `${tr.id}·${ci + 1}`,
          kind: c.eye ? (c.eye.free ? "眼睛·可转头" : "眼睛") : "机位",
          fov: Finite(c.fov) ? c.fov : null,
          keepMove: c.keepMove === true,
          src: `tracks[${ti}].clips[${ci}]`,
        });
      });
    } else if (tr.type === "dialogue") {
      (tr.clips || []).forEach((c, ci) => {
        const info = lineInfo && c.line ? lineInfo(c.line) : null;
        const dur = Finite(c.dur) ? c.dur : (Finite(info?.durationS) ? info.durationS : TIMELINE_V2_LINE_FALLBACK_S);
        lines.push({
          t0: +c.t.toFixed(2), t1: +Math.min(durationS, c.t + dur).toFixed(2),
          id: c.line || `text_${ci}`,
          label: info ? `${info.speaker || info.who || ""}：${info.subtitle || info.text || ""}` : `${c.speaker || c.actor || ""}：${c.text || c.line || ""}`,
          missing: !!c.line && !!lineInfo && !info,
          src: `tracks[${ti}].clips[${ci}]`,
        });
      });
    } else if (tr.type === "signal") {
      (tr.markers || []).forEach((m, mi) => {
        events.push({
          t0: +m.t.toFixed(2), t1: null, type: "signal",
          label: `${m.action}${m.params?.id ? ` ${m.params.id}` : ""}`,
          src: `tracks[${ti}].markers[${mi}]`,
        });
      });
    } else if (tr.type === "overlay") {
      (tr.clips || []).forEach((c, ci) => {
        events.push({
          t0: +c.t.toFixed(2), t1: Finite(c.dur) ? +Math.min(durationS, c.t + c.dur).toFixed(2) : null,
          type: c.kind, label: c.kind === "caption" ? (c.text || "说明字") : c.kind,
          src: `tracks[${ti}].clips[${ci}]`,
        });
      });
    } else if (tr.type === "audio") {
      (tr.clips || []).forEach((c, ci) => {
        events.push({
          t0: +c.t.toFixed(2), t1: null, type: "sfx",
          label: c.cue || c.name || c.music || "audio",
          src: `tracks[${ti}].clips[${ci}]`,
        });
      });
    } else if (tr.type === "vfx") {
      (tr.clips || []).forEach((c, ci) => {
        events.push({
          t0: +c.t.toFixed(2), t1: Finite(c.dur) ? +Math.min(durationS, c.t + c.dur).toFixed(2) : null,
          type: c.type || c.kind || "vfx", label: c.kind || c.type || "vfx",
          src: `tracks[${ti}].clips[${ci}]`,
        });
      });
    } else if (tr.type === "slowmo") {
      (tr.clips || []).forEach((c, ci) => {
        events.push({
          t0: +c.t.toFixed(2), t1: +Math.min(durationS, c.t + c.dur).toFixed(2),
          type: "slowmo", label: `慢动作 ×${c.rate}`,
          src: `tracks[${ti}].clips[${ci}]`,
        });
      });
    }
  }
  return { durationS, segments, shots, lines, events };
}

// ---------------------------------------------------------------------------
// Legacy v1 + Blockout Config → Self-Contained v2 Compiler

function PrefabIdForLegacyUnit(unit) {
  if (!unit) return "Soldier/nra";
  if (unit.kind === "tank") return unit.shape === "tankette" ? "Vehicle/Type94Tankette" : "Vehicle/Type89Tank";
  if (unit.kind === "cart") return "Vehicle/DraftCart";
  if (unit.kind === "animal") return unit.draft === "ox" ? "Animal/Ox" : "Animal/Horse";
  if (unit.kind === "litter") return /被/.test(unit.name || "") && !/担架/.test(unit.name || "") ? "Litter/Blanket" : "Litter/Stretcher";
  if (unit.castId) return `Cast/${unit.castId}`;
  if (unit.kind === "officer") return unit.side === "ija" ? "Officer/ija" : "Officer/nra";
  if (unit.kind === "child") return "Civilian/Child";
  if (unit.kind === "civilian" || unit.side === "civ") return "Civilian/Adult";
  return unit.side === "ija" ? "Soldier/ija" : "Soldier/nra";
}

function UnitInitProps(u) {
  const init = {
    x: u.x ?? 0,
    z: u.z ?? 0,
    yawDeg: u.yawDeg ?? 0,
    side: u.side || "nra",
    kind: u.kind || "soldier",
    stance: u.stance || "stand",
    state: u.state || "alive",
    aim: !!u.aim,
  };
  if (u.name) init.name = u.name;
  if (u.castId) init.castId = u.castId;
  if (u.weapon !== undefined) init.weapon = u.weapon;
  if (u.lie) init.lie = u.lie;
  if (u.ride) init.ride = Clone(u.ride);
  if (u.shape) init.shape = u.shape;
  if (u.draft) init.draft = u.draft;
  if (u.animal !== undefined) init.animal = u.animal;
  if (u.bearers !== undefined) init.bearers = u.bearers;
  if (u.body) init.body = u.body;
  if (u.arc) init.arc = Clone(u.arc);
  return init;
}

/**
 * Compile a legacy `tengxian-timeline/1` document + its external `Blockout/<Level>.json` config
 * into a 100% self-contained `tengxian-timeline/2` asset that has ZERO dependency on Blockout files.
 */
export function CompileLegacyTimelineToV2(v1Doc, blockoutConfig, {
  id = null,
  title = null,
  mode = "cinematic",
  sequenceIds = null,
  dropUnits = [],
  voice = null,
  baseSignals = [],
} = {}) {
  const drop = new Set(dropUnits);
  const kfById = new Map((blockoutConfig?.keyframes || []).map((k) => [k.id, k]));
  const voiceMap = voice ? BuildVoiceLineMap(voice) : null;
  const lineDuration = voiceMap ? (lid) => voiceMap.get(lid)?.durationS ?? TIMELINE_V2_LINE_FALLBACK_S : null;

  const selected = Array.isArray(sequenceIds) && sequenceIds.length
    ? sequenceIds.map((kid) => (v1Doc.sequences || []).find((s) => s.keyframe === kid)).filter(Boolean)
    : (v1Doc.sequences || []);

  const bindingsMap = new Map(); // slot -> binding spec
  const spawnsMap = new Map();   // slot -> spawn spec
  const actorKeysBySlot = new Map(); // slot -> keys[]
  const actorBaseBySlot = new Map(); // slot -> base unit spec

  const segments = [];
  const cameraClips = [];
  const dialogueClips = [];
  const audioClips = [];
  const vfxClips = [];
  const overlayClips = [];
  const envClips = [];
  const slowmoClips = [];
  const signalMarkers = [];
  const aircraftTracks = [];

  for (const s of baseSignals) {
    signalMarkers.push({ t: 0, action: "world.setSignal", params: { id: s, on: true }, onSkip: "apply" });
  }

  let cursor = 0;
  const knownActors = new Set();

  for (let si = 0; si < selected.length; si++) {
    const seq = selected[si];
    const kf = kfById.get(seq.keyframe) || { units: [], signals: [] };
    const dur = PrevizSequenceDuration(seq, { lineDuration });
    const segStart = +cursor.toFixed(4);
    const segEnd = +(cursor + dur).toFixed(4);

    segments.push({
      id: seq.keyframe,
      title: seq.title || seq.keyframe,
      start: segStart,
      end: segEnd,
      durationS: +dur.toFixed(4),
      ...(kf.player ? { player: Clone(kf.player) } : {}),
      ...(Array.isArray(kf.signals) && kf.signals.length ? { signals: [...kf.signals] } : {}),
    });

    // Segment start signals
    for (const sig of kf.signals || []) {
      signalMarkers.push({ t: segStart, action: "world.setSignal", params: { id: sig, on: true }, onSkip: "apply" });
    }
    if (kf.player) {
      signalMarkers.push({
        t: segStart,
        action: "player.spawn",
        params: { x: kf.player.x, z: kf.player.z, yawDeg: kf.player.yawDeg || 0, stance: kf.player.stance || "stand" },
        onSkip: "ignore",
      });
    }

    // Active units in this segment
    const presentInSeg = new Set();
    const kfUnits = (kf.units || []).filter((u) => !drop.has(u.id));
    const unitMap = new Map(kfUnits.map((u) => [u.id, u]));
    for (const entry of seq.actors || []) {
      if (drop.has(entry.id)) continue;
      if (entry.spawn && !unitMap.has(entry.id)) {
        const sp = { id: entry.id, side: "nra", kind: "soldier", stance: "stand", yawDeg: 0, aim: false, state: "alive", ...entry.spawn };
        if (sp.weapon === undefined) sp.weapon = sp.side === "ija" ? "Type38" : sp.side === "nra" ? "HanYang" : null;
        unitMap.set(entry.id, sp);
      }
    }

    // Register actors and inject segment-start cut key so each segment's staging is exact
    for (const [uid, unit] of unitMap) {
      presentInSeg.add(uid);
      knownActors.add(uid);
      if (!bindingsMap.has(uid) && !spawnsMap.has(uid)) {
        const init = UnitInitProps(unit);
        const prefab = PrefabIdForLegacyUnit(unit);
        // Named speaking cast members are bindings (can bind live actors OR spawnFallback);
        // unnamed/ephemeral soldiers are spawns owned by this timeline.
        if (unit.castId) {
          bindingsMap.set(uid, {
            slot: uid,
            type: "actor",
            match: { castId: unit.castId, id: uid },
            fallbackPrefab: prefab,
            onMissing: "spawnFallback",
            init,
          });
        } else {
          spawnsMap.set(uid, {
            slot: uid,
            type: unit.kind === "tank" ? "tank" : "puppet",
            prefab,
            init,
          });
        }
        actorBaseBySlot.set(uid, { id: uid, ...init });
      }
      if (!actorKeysBySlot.has(uid)) actorKeysBySlot.set(uid, []);
      const keys = actorKeysBySlot.get(uid);
      // Segment-start staging snapshot (snap to keyframe unit placement, reset transient state)
      const stageKey = {
        t: segStart,
        x: unit.x ?? 0,
        z: unit.z ?? 0,
        move: "cut",
        yawDeg: unit.yawDeg ?? 0,
        stance: unit.stance || "stand",
        aim: !!unit.aim,
        state: unit.state || "alive",
        visible: true,
        clip: null,
        weapon: unit.weapon !== undefined ? unit.weapon : (unit.side === "ija" ? "Type38" : unit.side === "nra" ? "HanYang" : null),
        lie: unit.lie || null,
        ride: unit.ride ? Clone(unit.ride) : null,
        carryRole: unit.carryRole || null,
        woundedWalk: !!unit.woundedWalk,
        dragSolo: false,
      };
      keys.push(stageKey);
    }

    // Hide previously known actors that are NOT present in this segment
    for (const uid of knownActors) {
      if (!presentInSeg.has(uid)) {
        if (!actorKeysBySlot.has(uid)) actorKeysBySlot.set(uid, []);
        actorKeysBySlot.get(uid).push({ t: segStart, visible: false, clip: null });
      }
    }

    // Append actor animation keys shifted by segStart
    for (const entry of seq.actors || []) {
      if (drop.has(entry.id) || !presentInSeg.has(entry.id)) continue;
      const keys = actorKeysBySlot.get(entry.id);
      for (const k of entry.keys || []) {
        const shifted = Clone(k);
        shifted.t = +(segStart + (k.t || 0)).toFixed(4);
        // Merge with segment-start staging key if both land on segStart so initial clip/faceTo isn't overwritten
        const last = keys[keys.length - 1];
        if (last && Math.abs(last.t - shifted.t) < 1e-6) {
          Object.assign(last, shifted);
        } else {
          keys.push(shifted);
        }
      }
    }

    // Camera clips
    for (let ci = 0; ci < (seq.camera || []).length; ci++) {
      const c = Clone(seq.camera[ci]);
      c.t = +(segStart + (c.t || 0)).toFixed(4);
      c.id = `${seq.keyframe}_${ci + 1}`;
      cameraClips.push(c);
    }

    // Dialogue clips
    for (const l of seq.lines || []) {
      const c = Clone(l);
      c.t = +(segStart + (l.t || 0)).toFixed(4);
      dialogueClips.push(c);
    }

    // Events -> split into proper typed tracks
    for (const e of seq.events || []) {
      const shiftedT = +(segStart + (e.t || 0)).toFixed(4);
      if (["black", "flash", "caption", "shake"].includes(e.type)) {
        overlayClips.push({
          t: shiftedT,
          dur: e.dur,
          fade: e.fade,
          kind: e.type,
          ...(e.strength !== undefined ? { strength: e.strength } : {}),
          ...(e.text !== undefined ? { text: e.text } : {}),
        });
      } else if (e.type === "sfx") {
        audioClips.push({
          t: shiftedT,
          name: e.name,
          ...(Finite(e.x) ? { x: e.x } : {}),
          ...(Finite(e.z) ? { z: e.z } : {}),
          ...(Finite(e.y) ? { y: e.y } : {}),
          ...(Finite(e.volume) ? { volume: e.volume } : {}),
        });
      } else if (["explosion", "smoke", "muzzle", "flare"].includes(e.type)) {
        const v = Clone(e);
        v.t = shiftedT;
        if (v.type === "smoke") {
          v.smokeKind = v.kind || "SmokeDust";
        }
        vfxClips.push(v);
      } else if (e.type === "signal") {
        signalMarkers.push({
          t: shiftedT,
          action: "world.setSignal",
          params: { id: e.name, on: e.on !== false },
          onSkip: "apply",
        });
      } else if (e.type === "time") {
        envClips.push({
          t: shiftedT,
          ...(Finite(e.dur) ? { dur: e.dur } : {}),
          ...(Finite(e.hour) ? { hour: e.hour } : {}),
          ...(e.look ? { look: e.look } : {}),
          ...(e.ease ? { ease: e.ease } : {}),
        });
      }
    }

    // Slowmo
    for (const w of seq.slowmo || []) {
      slowmoClips.push({
        t: +(segStart + (w.t || 0)).toFixed(4),
        dur: w.dur,
        rate: w.rate,
        ...(Finite(w.fade) ? { fade: w.fade } : {}),
      });
    }

    // Aircraft
    for (const ac of seq.aircraft || []) {
      const shiftedAc = Clone(ac);
      shiftedAc.type = "aircraft";
      shiftedAc.id = `${seq.keyframe}_${ac.id}`;
      shiftedAc.path = (ac.path || []).map((w) => ({ ...w, t: +(segStart + w.t).toFixed(4) }));
      if (Array.isArray(ac.strafe)) {
        shiftedAc.strafe = ac.strafe.map((st) => ({
          ...st,
          t0: +(segStart + st.t0).toFixed(4),
          t1: +(segStart + st.t1).toFixed(4),
        }));
      }
      if (shiftedAc.sound && Finite(shiftedAc.sound.diveT)) {
        shiftedAc.sound.diveT = +(segStart + shiftedAc.sound.diveT).toFixed(4);
      }
      aircraftTracks.push(shiftedAc);
    }

    cursor += dur;
  }

  // Ensure actors that only enter in later segments start hidden at t=0
  for (const [uid, keys] of actorKeysBySlot) {
    if (keys.length && keys[0].t > 0) {
      keys.unshift({ t: 0, visible: false, clip: null });
    }
  }

  const tracks = [];
  if (cameraClips.length) tracks.push({ id: "CameraMain", type: "camera", clips: cameraClips });
  for (const [uid, keys] of actorKeysBySlot) {
    tracks.push({
      id: `Anim_${uid}`,
      type: "animation",
      target: uid,
      base: actorBaseBySlot.get(uid),
      keys,
    });
  }
  if (dialogueClips.length) tracks.push({ id: "DialogueMain", type: "dialogue", clips: dialogueClips });
  if (audioClips.length) tracks.push({ id: "AudioSfx", type: "audio", clips: audioClips });
  if (vfxClips.length) tracks.push({ id: "VfxMain", type: "vfx", clips: vfxClips });
  if (overlayClips.length) tracks.push({ id: "OverlayMain", type: "overlay", clips: overlayClips });
  if (envClips.length) tracks.push({ id: "EnvClock", type: "environment", clips: envClips });
  if (slowmoClips.length) tracks.push({ id: "Slowmo", type: "slowmo", clips: slowmoClips });
  if (signalMarkers.length) tracks.push({ id: "Signals", type: "signal", markers: signalMarkers });
  tracks.push(...aircraftTracks);

  const bindings = [
    { slot: "mainCamera", type: "camera", onMissing: "error" },
    ...bindingsMap.values(),
  ];

  return {
    schema: TIMELINE_V2_SCHEMA,
    id: id || `${v1Doc.id}V2`,
    title: title || v1Doc.title || v1Doc.id,
    mode,
    inputLock: DefaultInputLockForMode(mode),
    allowSkip: mode === "cinematic",
    hideViewmodel: mode === "cinematic",
    hideHud: mode === "cinematic",
    cameraMode: "move",
    durationS: +cursor.toFixed(4),
    note: `Self-contained Unity-style Timeline v2 compiled from ${v1Doc.id} (${selected.map((s) => s.keyframe).join(", ")}). Zero Blockout config dependency.`,
    ...(v1Doc.voice ? { voice: v1Doc.voice } : {}),
    ...(v1Doc.faceTracks ? { faceTracks: v1Doc.faceTracks } : {}),
    segments,
    bindings,
    spawns: [...spawnsMap.values()],
    tracks,
  };
}
