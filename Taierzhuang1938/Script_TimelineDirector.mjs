// Unity-style PlayableDirector (`TimelineDirector`) and multi-instance `TimelineManager`.
//
// Zero dependency on `Script_EditorBlockoutPreviz.mjs` or `Blockout/*.json`.
// Runs any `tengxian-timeline/2` intermediate JSON file in:
//   - `cinematic` mode   (camera takeover, skip support, optional free-look, HUD/viewmodel hide)
//   - `interactive` mode (layered input lock, Wait/Gate markers for player F / events)
//   - `setpiece` mode    (non-blocking concurrent director running alongside live combat!)
//
// Deterministic `Seek(t)` evaluates continuous tracks purely via `EvaluateTimelineAt` (`func(t)`),
// while discrete markers fire cleanly on time crossing and honor `onSkip: "apply" | "ignore"`.

import * as THREE from "three";
import {
  NormalizeTimelineAsset, ValidateTimelineAsset, CollectTimelineDependencies,
  EvaluateTimelineAt, CollectFiredMarkers, CollectSkipActions, BuildVoiceLineMap,
  TIMELINE_V2_FPS, TIMELINE_V2_LINE_FALLBACK_S, TIMELINE_INPUT_LOCKS,
} from "./Script_TimelineAsset.mjs";
import { TimelinePrefabRegistry, TimelineSceneBinder, BuildPuppetUnitFromPrefab } from "./Script_TimelineBindings.mjs";
import { TimelineActionRegistry, ResolveTimelineSfxSpec, TIMELINE_SFX_URL_VERSION } from "./Script_TimelineActions.mjs";
import { PREVIZ_FREE_LOOK, PrevizFreeLookSegment, WrapDeg } from "./Script_EditorBlockoutPrevizPlan.mjs";
import { BlockoutPrevizAircraft } from "./Script_EditorBlockoutPrevizAircraft.mjs";
import { BlockoutPrevizFx } from "./Script_EditorBlockoutPrevizFx.mjs";
import { FlareTrack } from "./Script_FlareTrack.mjs";
import { DialoguePlayer } from "./Script_DialoguePlayer.mjs";
import { LoadFaceTracks, SampleLineFaceTrack } from "./Script_FaceTrack.mjs";
import { SampleSpeechEnvelope } from "./Script_SpeechEnvelope.mjs";
import { BLOCKOUT_PREVIZ_CLIP_LIBRARIES, PREVIZ_WEAPON_SLUNG } from "./Data_BlockoutPrevizClips.mjs";
import { SOUND_NAMES } from "./Script_Audio.mjs";
import { T } from "./Script_Text.mjs";

const DEG = Math.PI / 180;
const VOICE_PREFIX = "timelineV2.";
const URL_SFX_PREFIX = "timelineV2Sfx.";
const SMOKE_KIND = Object.freeze({ SmokeDust: "dust", SmokeWhite: "screen", SmokeBlack: "black" });
const FREE_LOOK_KEYS = Object.freeze({ ArrowLeft: [1, 0], ArrowRight: [-1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] });

let nextDirectorSerial = 1;

// Shared clip-library loader promise so multiple timelines share one download
let sharedClipLibraryPromise = null;
let sharedClipLibrary = null;

async function EnsureSharedClipLibraries(puppets, { metadataOnly = true } = {}) {
  if (sharedClipLibrary) {
    puppets?.SetOpeningLibrary?.(sharedClipLibrary);
    return sharedClipLibrary;
  }
  sharedClipLibraryPromise ||= (async () => {
    const api = await import("./Script_OpeningStoryboardAnimation.mjs");
    const library = await api.LoadOpeningStoryboardAnimation({ metadataOnly });
    if (typeof api.AddOpeningClipLibrary === "function") {
      let previzProps = null;
      try {
        const [props, mod] = await Promise.all([
          import("./Script_OpeningProps.mjs"),
          import("./Script_EditorBlockoutPrevizProps.mjs"),
        ]);
        previzProps = mod;
        previzProps.RegisterPrevizProps(props.RegisterOpeningProp);
      } catch (error) { console.warn("[TimelineDirector] prop registration skipped:", error); }

      const loaded = await Promise.all(BLOCKOUT_PREVIZ_CLIP_LIBRARIES.map(async (lib) => {
        if (metadataOnly && lib.name === "CollectionCare") return null;
        try {
          const v = `?v=${encodeURIComponent(lib.version)}`;
          const resp = await fetch(lib.base + lib.manifest + v);
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
          const config = await resp.json();
          if (metadataOnly) return { config, record: null };
          const row = (config.models || []).find((m) => m.id === "TengxianNra02") || config.models?.[0];
          if (!row?.file) return null;
          const recResp = await fetch(lib.base + row.file + v);
          if (!recResp.ok) throw new Error(`HTTP ${recResp.status}`);
          return { config, record: await recResp.json() };
        } catch { return null; }
      }));
      for (const item of loaded) {
        if (!item) continue;
        api.AddOpeningClipLibrary(item.config, item.record, { weaponSlung: PREVIZ_WEAPON_SLUNG });
        previzProps?.SetPrevizPropScales?.(item.config.props);
      }
    }
    sharedClipLibrary = { api, library };
    return sharedClipLibrary;
  })().catch((error) => {
    sharedClipLibraryPromise = null;
    console.warn("[TimelineDirector] clip library unavailable, using native fallback:", error);
    return null;
  });
  const lib = await sharedClipLibraryPromise;
  if (lib) puppets?.SetOpeningLibrary?.(lib);
  return lib;
}

// ---------------------------------------------------------------------------
// TimelineDirector (Single PlayableDirector instance)

export class TimelineDirector {
  constructor({
    host,
    resolver,
    prefabs = null,
    actions = null,
    groundAt = null,
    standAt = null,
    env = null,
    encounter = null,
    manager = null,
    onComplete = null,
    onGatePaused = null,
    metadataOnly = true,
  } = {}) {
    this.directorId = `d${nextDirectorSerial++}`;
    this.host = host || {};
    this.resolver = resolver || {};
    this.prefabs = prefabs || new TimelinePrefabRegistry();
    this.actions = actions || new TimelineActionRegistry();
    this.groundAt = groundAt || resolver?.groundAt || (() => 0);
    this.standAt = standAt || this.groundAt;
    this.env = env || host?.ctx?.env || null;
    this.encounter = encounter || null;
    this.manager = manager || null;
    this.onComplete = onComplete;
    this.onGatePaused = onGatePaused;
    this.metadataOnly = !!metadataOnly;

    this.doc = null;
    this.deps = null;
    this.validation = null;
    this.voice = null;
    this.voiceMap = new Map();
    this.loadedVoices = new Set();
    this.urlCues = new Map();
    this.faceTracksLoaded = new Set();
    this.openingLib = null;

    this.binder = new TimelineSceneBinder({ resolver: this.resolver, prefabs: this.prefabs });
    this.baseUnits = new Map();

    this.loaded = false;
    this.active = false;
    this.paused = false;
    this.disposed = false;
    this.waitingGate = null;
    this.t = 0;
    this.prevT = -1e-6;
    this.wallT = 0;
    this.timeScale = 1;
    this.inputLock = "none";
    this.baseHour = null;
    this.lastEval = null;
    this.lastCamera = null;
    this.lastShotId = null;
    this._lastEnvHour = null;
    this.runtimeSignals = new Map();
    this.lastSignalKey = "";
    this.smoke = new Map();
    this.timers = [];
    this.speaking = new Map();
    this.transientShake = { strength: 0, until: 0 };
    this.missingActions = new Set();
    this.missingClips = new Set();
    this.missingLines = new Set();
    this.missingSfx = new Set();

    this._cam = new THREE.Vector3();
    this._v = new THREE.Vector3();
    this._d = new THREE.Vector3();
    this.dialogue = null;
    this.air = null;
    this.fx = null;
    this.flareTrack = null;

    this.freeLook = { segment: -1, active: false, yawDeg: 0, pitchDeg: 0, defaultYaw: 0, defaultPitch: 0, keys: new Set(), nudges: 0 };
    this.domBuilt = false;
    this.root = null;
    this.skipButton = null;
    this.elBlack = null;
    this.elFlash = null;
    this.elCaption = null;
    this.elSubs = null;
    this.captionText = "";
    this.subsKey = "";

    this.BindFreeLook();
  }

  // -------------------------------------------------------------------------
  // Loading & Pre-Warm Dependency Preparation

  async Load(docOrUrl, { force = false } = {}) {
    if (this.loaded && !force && typeof docOrUrl === "string" && docOrUrl === this.sourceUrl) return true;
    let raw = docOrUrl;
    if (typeof docOrUrl === "string") {
      this.sourceUrl = docOrUrl;
      const resp = await fetch(docOrUrl);
      if (!resp.ok) throw new Error(`TimelineDirector: failed to load ${docOrUrl}: HTTP ${resp.status}`);
      raw = await resp.json();
    }
    if (this.disposed) return false;
    const normalized = NormalizeTimelineAsset(raw);
    this.doc = normalized;
    this.deps = CollectTimelineDependencies(normalized);

    // Load voice manifest if referenced
    if (this.deps.voiceManifest) {
      try {
        const vr = await fetch(this.deps.voiceManifest);
        if (vr.ok) {
          this.voice = await vr.json();
          this.voiceMap = BuildVoiceLineMap(this.voice);
        }
      } catch (error) {
        console.warn("[TimelineDirector] voice manifest unavailable:", this.deps.voiceManifest, error);
      }
    }

    this.validation = ValidateTimelineAsset(normalized, {
      voice: this.voice,
      knownActions: (id) => this.actions.Has(id),
      knownPrefabs: (id) => this.prefabs.Has(id),
    });
    if (!this.validation.ok) {
      console.warn(`[TimelineDirector] ${normalized.id} validation issues:`, this.validation.errors.slice(0, 6));
    }

    await this.PrepareAssets();
    if (this.disposed) return false;
    this.loaded = true;
    return true;
  }

  async PrepareAssets() {
    if (!this.doc || !this.deps) return;
    const jobs = [];
    const puppets = this.resolver.puppets;
    const audio = this.host.audio;

    // 1. Prepare character cast kits for any fallback/spawn prefabs
    if (puppets?.PrepareCasts) {
      const unitsToPrep = [];
      for (const b of this.doc.bindings || []) {
        if (b.fallbackPrefab) unitsToPrep.push(BuildPuppetUnitFromPrefab(b.slot, b.fallbackPrefab, b.init || {}));
      }
      for (const s of this.doc.spawns || []) {
        unitsToPrep.push(BuildPuppetUnitFromPrefab(s.slot, s.prefab, s.init || {}));
      }
      if (unitsToPrep.length) jobs.push(puppets.PrepareCasts(unitsToPrep).catch(() => {}));
    }

    // 2. Decode referenced dialogue voices
    if (this.deps.voices.length && audio?.LoadVoices) {
      const entries = [];
      for (const lid of this.deps.voices) {
        const line = this.voiceMap.get(lid);
        if (!line) { this.missingLines.add(lid); continue; }
        if (!line.file || this.loadedVoices.has(lid)) continue;
        entries.push({
          key: VOICE_PREFIX + lid,
          file: line.file,
          kind: "story",
          version: (line.sha256 || "").slice(0, 12) || "1",
          analyzeSpeech: true,
        });
      }
      if (entries.length) {
        jobs.push(audio.LoadVoices("", entries).then(() => {
          for (const e of entries) if (audio.voiceBank?.get(e.key)) this.loadedVoices.add(e.key.slice(VOICE_PREFIX.length));
        }).catch(() => {}));
      }
    }

    // 3. Load URL-based SFX cues
    const urlSfx = this.deps.sfx.filter((name) => ResolveTimelineSfxSpec(name)?.url);
    if (urlSfx.length) jobs.push(this.LoadUrlSfx(urlSfx));

    // 4. Load face lip-sync tracks
    if (this.deps.faceTracks && !this.faceTracksLoaded.has(this.deps.faceTracks)) {
      this.faceTracksLoaded.add(this.deps.faceTracks);
      const url = typeof location !== "undefined" ? new URL(this.deps.faceTracks, location.href).href : this.deps.faceTracks;
      jobs.push(LoadFaceTracks(url).catch(() => 0));
    }

    // 5. Load animation clip libraries if any clips are referenced
    if (this.deps.clips.length) {
      jobs.push(EnsureSharedClipLibraries(puppets, { metadataOnly: this.metadataOnly }).then((lib) => {
        this.openingLib = lib;
      }));
    }

    await Promise.all(jobs);
  }

  async LoadUrlSfx(names) {
    const audio = this.host.audio;
    const jobs = [];
    for (const name of new Set(names || [])) {
      const spec = ResolveTimelineSfxSpec(name);
      if (!spec?.url || this.urlCues.has(name)) continue;
      const key = URL_SFX_PREFIX + name;
      if (!audio?.ctx || typeof audio.LoadVoices !== "function") {
        this.urlCues.set(name, { state: "noAudio", key, promise: Promise.resolve() });
        continue;
      }
      const entry = { state: "loading", key, promise: null };
      entry.promise = audio.LoadVoices("", [{ key, file: spec.url, kind: "story", version: TIMELINE_SFX_URL_VERSION }])
        .then(() => { entry.state = audio.voiceBank?.get(key) ? "ok" : "failed"; })
        .catch(() => { entry.state = "failed"; });
      this.urlCues.set(name, entry);
      jobs.push(entry.promise);
    }
    await Promise.all(jobs);
  }

  // -------------------------------------------------------------------------
  // Lifecycle: Stage / Play / Pause / Resume / Seek / Skip / Stop

  BuildBaseUnits() {
    this.baseUnits.clear();
    if (!this.doc) return;
    for (const b of this.doc.bindings || []) {
      const live = this.binder.Get(b.slot);
      const livePos = live?.GetWorldPosition?.(new THREE.Vector3());
      this.baseUnits.set(b.slot, {
        id: b.slot,
        x: livePos ? livePos.x : (b.init?.x ?? 0),
        z: livePos ? livePos.z : (b.init?.z ?? 0),
        yawDeg: b.init?.yawDeg ?? 0,
        stance: b.init?.stance || "stand",
        state: b.init?.state || "alive",
        ...(b.init || {}),
      });
    }
    for (const s of this.doc.spawns || []) {
      this.baseUnits.set(s.slot, { id: s.slot, ...(s.init || {}) });
    }
  }

  EnsureSubsystems() {
    if (!this.doc) return;
    const needsOverlay = this.doc.mode !== "setpiece"
      || this.doc.tracks.some((tr) => tr.type === "overlay" || tr.type === "dialogue");
    if (needsOverlay && !this.domBuilt && typeof document !== "undefined") this.BuildDom();

    const hasThrows = this.doc.tracks.some((tr) => tr.type === "animation" && (tr.keys || []).some((k) => k.throw));
    const hasFlares = this.doc.tracks.some((tr) => tr.type === "vfx" && (tr.clips || []).some((c) => (c.type || c.kind) === "flare"));
    if ((hasThrows || hasFlares) && !this.fx && this.host.scene && this.host.post) {
      try {
        this.fx = new BlockoutPrevizFx({ post: this.host.post, scene: this.host.scene });
        if (hasFlares) this.flareTrack = new FlareTrack(this.fx.root, this.host, (x, z) => this.standAt(x, z));
      } catch (error) { console.warn("[TimelineDirector] fx layer unavailable:", error); }
    }

    const hasAircraft = this.doc.tracks.some((tr) => tr.type === "aircraft");
    if (hasAircraft && !this.air && this.host.scene) {
      try {
        this.air = new BlockoutPrevizAircraft({
          scene: this.host.scene,
          aircraft: () => this.host.ctx?.aircraft || this.host.aircraft,
          sfx: {
            Play: (name, at) => this.PlaySfx(name, at, 1),
            StartLoop: (name, at) => this.StartLoopSfx(name, at),
            MoveLoop: (voice, at, velocity) => this.host.audio?.MoveVoice?.(voice, at, { velocity }),
            StopLoop: (voice) => this.host.audio?.StopVoice?.(voice, 1.0),
          },
          dirt: (x, z) => this.host.vfx?.Impact?.(new THREE.Vector3(x, this.standAt(x, z), z), new THREE.Vector3(0, 1, 0), "dirt"),
        });
      } catch (error) { console.warn("[TimelineDirector] aircraft layer unavailable:", error); }
    }
  }

  /**
   * Stage actors & environment at `atTime` without running the clock yet (used for pre-warm frames).
   */
  Stage(atTime = 0, { forceFallback = false } = {}) {
    if (!this.doc || this.disposed) return false;
    this.EnsureSubsystems();
    this.host.camera?.getWorldPosition?.(this._cam);
    this.binder.ResolveAll(this.doc, {
      directorId: this.directorId,
      camPos: this._cam,
      openingLib: this.openingLib,
      forceFallback,
    });
    this.BuildBaseUnits();
    this.Evaluate(atTime, { fire: false, seek: true });
    return true;
  }

  Play(startTime = 0, { paused = false, forceFallback = false } = {}) {
    if (!this.doc || this.disposed) return false;
    if (this.active) this.Stop({ restore: false, finished: false });

    this.EnsureSubsystems();
    this.host.camera?.getWorldPosition?.(this._cam);
    this.binder.ResolveAll(this.doc, {
      directorId: this.directorId,
      camPos: this._cam,
      openingLib: this.openingLib,
      forceFallback,
    });
    this.BuildBaseUnits();

    this.active = true;
    this.paused = !!paused;
    this.waitingGate = null;
    this.t = Math.max(0, Math.min(this.doc.durationS, Number(startTime) || 0));
    this.prevT = this.t - 1e-6;
    this.wallT = 0;
    this.timeScale = 1;
    this.inputLock = this.doc.inputLock;
    this.baseHour = this.env?.clock?.hour ?? 12;
    this.lastShotId = null;
    this.lastCamera = null;
    this.runtimeSignals.clear();
    this.lastSignalKey = "";
    this.ResetFreeLook();

    const aircraftList = this.doc.tracks.filter((tr) => tr.type === "aircraft" && !tr.muted);
    if (this.air && aircraftList.length) this.air.Begin({ aircraft: aircraftList });

    if (this.host.audio) {
      this.dialogue = new DialoguePlayer({
        audio: this.host.audio,
        Clock: () => this.host.audio?.ctx?.currentTime ?? null,
      });
    }

    if (this.root) {
      this.root.hidden = false;
      if (this.skipButton) this.skipButton.hidden = !this.doc.allowSkip;
    }
    if (this.doc.mode === "cinematic") {
      this.host.ctx?.ReleasePointerLock?.();
      if (this.host.viewmodel && this.doc.hideViewmodel) this.host.viewmodel.root.visible = false;
    }

    this.Evaluate(this.t, { fire: !this.paused, from: this.t === 0 ? -1e-6 : this.t - 1e-6, seek: this.paused });
    return true;
  }

  Pause() {
    if (!this.active) return false;
    this.paused = true;
    this.dialogue?.StopAll();
    return true;
  }

  Resume() {
    if (!this.active) return false;
    this.paused = false;
    return true;
  }

  SetPaused(on) {
    return on ? this.Pause() : this.Resume();
  }

  /**
   * Deterministic `func(t)` seek: jumps directly to `t` seconds, evaluates every continuous track,
   * pauses playback, and settles animations.
   */
  Seek(t) {
    if (!this.doc || this.disposed) return this.State();
    if (!this.active) this.Play(t, { paused: true });
    this.paused = true;
    this.waitingGate = null;
    this.ClearTimers();
    this.ResetFreeLook();
    this.dialogue?.StopAll();
    this.t = Math.max(0, Math.min(this.doc.durationS, Number(t) || 0));
    this.prevT = this.t;
    this.Evaluate(this.t, { fire: false, from: this.t, seek: true });
    return this.State();
  }

  Step(frames = 1) {
    return this.Seek(this.t + frames / TIMELINE_V2_FPS);
  }

  SignalGate(gateId) {
    if (!this.active || !this.waitingGate) return false;
    if (gateId && this.waitingGate.gateId !== gateId) return false;
    this.waitingGate = null;
    return true;
  }

  Skip({ force = false } = {}) {
    if (!this.active || this.disposed) return false;
    if (!force && !this.doc?.allowSkip) return false;
    // Apply all remaining `onSkip: "apply"` state-changing markers before stopping!
    const remaining = CollectSkipActions(this.doc, this.t);
    const actCtx = this.BuildActionContext();
    for (const item of remaining) {
      this.actions.Execute(item.action, item.params, actCtx);
    }
    this.SyncSignals();
    this.Finish({ skipped: true });
    return true;
  }

  Stop({ finished = false, skipped = false } = {}) {
    this.ClearTimers();
    if (!this.active && !this.binder.handles.size) return false;
    this.active = false;
    this.paused = false;
    this.waitingGate = null;
    this.ResetFreeLook();
    this.dialogue?.StopAll();
    this.dialogue = null;

    for (const handle of this.smoke.values()) {
      try { this.host.vfx?.RemoveSmokeSource?.(handle); } catch {}
    }
    this.smoke.clear();
    this.fx?.Clear?.();
    this.flareTrack?.Clear?.();
    this.air?.Clear?.();
    this.binder.ReleaseAll();
    this.speaking.clear();
    this.lastCamera = null;
    this.lastShotId = null;
    this._lastEnvHour = null;

    if (this.root) {
      this.RenderOverlays({ flash: 0, black: 0, captions: [] }, []);
      this.root.hidden = true;
    }
    if (this.doc?.hideViewmodel && this.host.viewmodel) {
      this.host.viewmodel.root.visible = true;
    }
    if (finished || skipped) {
      this.onComplete?.({ id: this.doc?.id || null, skipped, finished });
    }
    return true;
  }

  Finish({ skipped = false } = {}) {
    if (!this.active) return;
    this.Stop({ finished: !skipped, skipped });
  }

  // -------------------------------------------------------------------------
  // Per-Frame Update & Evaluation

  Update(dt) {
    if (!this.active || this.paused || this.disposed || !this.doc) return;

    // Tick scheduled sub-frame action timers (e.g. burst muzzle flashes)
    this.StepTimers(dt);

    if (this.waitingGate) {
      // Frozen on GateMarker: keep current frame posed while waiting for player/event signal
      this.Evaluate(this.t, { fire: false, from: this.t, dt });
      return;
    }

    const prev = this.t;
    const scale = this.lastEval?.timeScale ?? 1;
    this.timeScale = scale;
    this.t = Math.min(this.doc.durationS, this.t + dt * scale);
    this.wallT += dt;
    this.prevT = prev;
    this.dialogue?.Update(dt);
    this.UpdateFreeLook(dt);
    this.Evaluate(this.t, { fire: true, from: prev, dt });

    // Advance puppet visuals for blocking cinematic timelines (non-blocking setpiece timelines share EncounterPlay's tick)
    if (this.doc.mode !== "setpiece" && this.resolver.puppets?.Update) {
      this.host.camera?.getWorldPosition?.(this._cam);
      this.resolver.puppets.Update(dt * scale, this._cam);
    }

    if (this.t >= this.doc.durationS && !this.waitingGate) {
      this.Finish({ skipped: false });
    }
  }

  Evaluate(t, { fire = false, from = -1e-6, seek = false, dt = 1 / 60 } = {}) {
    if (!this.doc) return null;
    const ev = EvaluateTimelineAt(this.doc, t, {
      resolveAnchor: (a) => this.ResolveAnchor(a),
      resolveActor: (id) => this.ResolveActorXZ(id),
      clipDuration: (clip) => this.ClipDuration(clip),
      lineDuration: (id) => this.LineDuration(id),
      baseUnits: this.baseUnits,
      baseHour: this.baseHour ?? 12,
      resolveTime: (spec) => this.env?.ResolveTime?.(spec) ?? null,
      groundAt: (x, z) => this.standAt(x, z),
    });
    this.lastEval = ev;
    this.timeScale = ev.timeScale;
    this.inputLock = ev.inputLock;

    // 1. Apply continuous signals (deterministic for Seek)
    if (seek || !fire) {
      this.runtimeSignals = new Map(ev.signals);
      this.SyncSignals();
    }

    // 2. Drive transforms & animations on bound/spawned handles
    for (const [slot, pose] of ev.transforms) {
      this.binder.Get(slot)?.SetTransform?.(pose, dt);
    }
    for (const [slot, anim] of ev.animations) {
      if (anim.clip && this.openingLib && !this.openingLib.api.OpeningClipMeta(anim.clip)) {
        this.missingClips.add(anim.clip);
      }
      if (this.speaking.has(slot)) anim.talking = true;
      this.binder.Get(slot)?.SetAnimation?.(anim, dt);
    }

    // 3. Environment clock
    if (ev.environment.hour !== null && this.env?.active) {
      const prevHour = this._lastEnvHour;
      this.env.SetHour?.(ev.environment.hour);
      this._lastEnvHour = ev.environment.hour;
      if (prevHour === null || Math.abs(ev.environment.hour - prevHour) >= 0.5) {
        const at = this.host.camera?.position || this._cam;
        if (this.host.ctx?.envBridge?.Apply && this.env.SnapAt) {
          this.host.ctx.envBridge.Apply(this.env.SnapAt(at), { force: true });
        }
      }
    }

    // 4. Continuous smoke sources
    const liveSmokeIds = new Set(ev.activeSmoke.map((s) => s.id));
    for (const [id, handle] of this.smoke) {
      if (!liveSmokeIds.has(id)) {
        try { this.host.vfx?.RemoveSmokeSource?.(handle); } catch {}
        this.smoke.delete(id);
      }
    }
    for (const s of ev.activeSmoke) {
      if (!this.smoke.has(s.id) && this.host.vfx?.SmokeSource) {
        const y = Number.isFinite(s.y) ? s.y : this.standAt(s.x, s.z);
        const opts = { kind: SMOKE_KIND[s.kind] || "dust" };
        if (Number.isFinite(s.scale)) opts.plumeScale = s.scale;
        if (s.prewarm || (seek && t - s.startedAt > 0.3)) opts.prewarm = true;
        this.smoke.set(s.id, this.host.vfx.SmokeSource({ x: s.x, y, z: s.z }, opts));
      }
    }

    // 5. Fire crossed discrete markers (signals, audio, vfx, dialogue starts)
    if (fire) {
      const fired = CollectFiredMarkers(this.doc, from, t);
      const actCtx = this.BuildActionContext();
      for (const item of fired) {
        if (item.kind === "signal") {
          this.actions.Execute(item.action, item.params, actCtx);
        } else if (item.kind === "dialogue") {
          this.StartDialogueClip(item.clip);
        } else if (item.kind === "audio") {
          this.FireAudioClip(item.clip);
        } else if (item.kind === "vfx") {
          this.FireVfxClip(item.clip, actCtx);
        }
      }
      this.SyncSignals();
    }

    // 6. Mouth lip-sync binding for active lines
    this.BindMouths(ev.activeLines, t);

    // 7. Settle animation poses on deterministic Seek
    if (seek && this.resolver.puppets?.Settle) {
      this.host.camera?.getWorldPosition?.(this._cam);
      this.resolver.puppets.Settle(10, 0.05, this._cam);
    }

    // 8. Aircraft & flare & grenade-throw helpers
    if (this.air) {
      try {
        this.host.camera?.getWorldPosition?.(this._cam);
        this.air.Update(t, { fire, from, groundAt: (x, z) => this.standAt(x, z), listener: this._cam });
      } catch (error) { console.warn("[TimelineDirector] aircraft update error:", error); }
    }
    if (this.flareTrack) {
      const flares = this.doc.tracks
        .filter((tr) => tr.type === "vfx" && !tr.muted)
        .flatMap((tr) => (tr.clips || []).filter((c) => (c.type || c.kind) === "flare"));
      if (flares.length) {
        this.flareTrack.Update(flares, t, { fire, from });
        if (this.flareTrack.visuals?.items?.size && this.fx?.root) this.fx.root.visible = true;
      }
    }

    // 9. Overlays & subtitles
    if (this.domBuilt) this.RenderOverlays(ev.overlays, ev.activeLines);

    return ev;
  }

  // -------------------------------------------------------------------------
  // Action Context & Discrete Dispatchers

  BuildActionContext() {
    return {
      director: this,
      host: this.host,
      env: this.env,
      encounter: this.encounter,
      standAt: (x, z) => this.standAt(x, z),
      resolveHandle: (slot) => this.binder.Get(slot),
      setSignal: (id, on) => { this.runtimeSignals.set(id, !!on); },
      playSfx: (name, pos, volume) => this.PlaySfx(name, pos, volume),
      fireFlare: (p) => { /* handled via FlareTrack */ void p; },
      setInputLock: (lock) => { if (TIMELINE_INPUT_LOCKS.includes(lock)) this.inputLock = lock; },
      triggerShake: (strength, dur) => {
        this.transientShake = { strength, until: this.wallT + dur };
      },
      pauseForGate: (gateId, promptKey) => {
        this.waitingGate = { gateId, promptKey, at: this.t };
        this.onGatePaused?.(this.waitingGate);
      },
      startTimeline: (idOrUrl, opts) => this.manager?.Play?.(idOrUrl, opts),
      scheduleTimer: (delayS, fn) => { this.timers.push({ left: delayS, fn }); },
      isStopped: () => !this.active || this.disposed,
      onMissingAction: (id) => { this.missingActions.add(id); },
    };
  }

  SyncSignals() {
    const activeSet = new Set();
    for (const [id, on] of this.runtimeSignals) if (on) activeSet.add(id);
    const key = [...activeSet].sort().join(",");
    if (key === this.lastSignalKey) return;
    this.lastSignalKey = key;
    if (this.encounter?.setTimelineSignals) {
      this.encounter.setTimelineSignals(this.runtimeSignals);
    } else if (this.host.battlefield?.RestoreScenario) {
      const changed = this.host.battlefield.RestoreScenario({ signalled: (id) => activeSet.has(id) });
      if (changed) this.host.ctx?.navGrid?.Refresh?.(this.host.battlefield, { spread: true });
    }
  }

  FireAudioClip(c) {
    if (c.music !== undefined) {
      this.actions.Execute("audio.music", { cue: c.music, fadeOut: c.fadeOut, levelScale: c.levelScale }, this.BuildActionContext());
      return;
    }
    const name = c.name || c.cue;
    const pos = Number.isFinite(c.x) && Number.isFinite(c.z)
      ? { x: c.x, y: Number.isFinite(c.y) ? c.y : this.standAt(c.x, c.z) + 1, z: c.z }
      : null;
    this.PlaySfx(name, pos, Number.isFinite(c.volume) ? c.volume : 1);
  }

  FireVfxClip(c, actCtx) {
    const kind = c.type || c.kind;
    if (kind === "explosion") this.actions.Execute("vfx.explosion", c, actCtx);
    else if (kind === "muzzle") this.actions.Execute("vfx.muzzle", c, actCtx);
    else if (kind === "impact") this.actions.Execute("vfx.impact", c, actCtx);
  }

  PlaySfx(name, position, volume = 1) {
    const audio = this.host.audio;
    const spec = ResolveTimelineSfxSpec(name);
    if (!spec) { this.missingSfx.add(String(name)); return null; }
    if (spec.deafen) { if (audio?.ctx) audio.Deafen?.(spec.deafen); return null; }
    if (spec.url) {
      if (!audio?.ctx) return null;
      let entry = this.urlCues.get(name);
      if (!entry) { this.LoadUrlSfx([name]); entry = this.urlCues.get(name); }
      if (!entry || entry.state === "failed" || entry.state === "noAudio") return null;
      if (entry.state === "ok") return audio.Play("voice." + entry.key, { position, volume }) || null;
      entry.promise?.then(() => { if (this.active && entry.state === "ok") audio.Play("voice." + entry.key, { position, volume }); });
      return null;
    }
    if (!SOUND_NAMES.includes(spec.cue)) { this.missingSfx.add(`${name}→${spec.cue}`); return null; }
    if (!audio?.ctx) return null;
    const n = spec.burst || 1;
    let first = null;
    for (let i = 0; i < n; i++) {
      const delay = i * (spec.interval || 0) + (spec.jitter && i ? ((i * 0.618) % 1) * 0.05 : 0);
      const voice = audio.Play(spec.cue, { position, volume, delay });
      first ||= voice || null;
    }
    return first;
  }

  StartLoopSfx(name, position) {
    const audio = this.host.audio;
    const spec = ResolveTimelineSfxSpec(name);
    if (!spec?.cue || !SOUND_NAMES.includes(spec.cue) || !audio?.ctx || !position) return null;
    try { return audio.Play(spec.cue, { position, volume: 0.9 }) || null; } catch { return null; }
  }

  // -------------------------------------------------------------------------
  // Dialogue & Facial Lip-Sync

  LineDuration(id) {
    const line = this.voiceMap.get(id);
    return Number.isFinite(line?.durationS) ? line.durationS : null;
  }

  SpeakerSlotFor(clip) {
    if (clip.actor && clip.actor !== "player") return this.binder.Get(clip.actor) ? clip.actor : null;
    if (clip.actor === "player") return null;
    const who = clip.line ? this.voiceMap.get(clip.line)?.who : null;
    if (!who) return null;
    for (const [slot, base] of this.baseUnits) if (base.castId === who) return slot;
    return null;
  }

  StartDialogueClip(clip) {
    if (!clip.line) return; // text-only subtitle clip handled purely by RenderOverlays
    const line = this.voiceMap.get(clip.line);
    if (!line) { this.missingLines.add(clip.line); return; }
    const slot = this.SpeakerSlotFor(clip);
    const actor = slot ? this.binder.Get(slot)?.GetActor?.() : null;
    const key = this.loadedVoices.has(line.id) ? VOICE_PREFIX + line.id : null;
    this.dialogue?.Play({
      id: `tl:${line.id}:${clip.t}`,
      lines: [{
        id: line.id, index: 0, who: line.who || "timeline", key,
        duration: line.durationS || TIMELINE_V2_LINE_FALLBACK_S,
        speaker: line.speaker || "", text: line.subtitle ?? line.text ?? "",
        sha256: line.sha256, subtitle: false,
        direction: actor ? {} : { spatial: "self" },
      }],
    }, { speakers: actor ? { [line.who || "timeline"]: { actor } } : {} });
  }

  BindMouths(activeLines, t) {
    this.speaking.clear();
    for (const item of activeLines) {
      if (!item.line) continue;
      const slot = this.SpeakerSlotFor(item);
      if (!slot) continue;
      const line = this.voiceMap.get(item.line);
      if (!line || t >= item.end) continue;
      this.speaking.set(slot, { line, start: item.start });
      const handle = this.binder.Get(slot);
      handle?.SetFacialSource?.(() => this.SpeechFor(slot));
    }
  }

  SpeechFor(slot) {
    const hit = this.speaking.get(slot);
    if (!hit) return null;
    const seconds = Math.max(0, this.t - hit.start);
    const base = { active: true, who: hit.line.who, lineId: hit.line.id, cue: `tl:${hit.line.id}`, line: hit.line.id, sourceTime: seconds };
    const track = SampleLineFaceTrack({ id: hit.line.id, sha256: hit.line.sha256 }, seconds);
    if (track) return { ...base, level: track.jaw ?? 0, brightness: track.wide ?? 0, ...track };
    const env = this.host.audio?.voiceBank?.get(VOICE_PREFIX + hit.line.id)?.speechEnvelope;
    const e = env ? SampleSpeechEnvelope(env, seconds) : { level: 0, brightness: 0 };
    return { ...base, level: e.level || 0, brightness: e.brightness || 0 };
  }

  // -------------------------------------------------------------------------
  // Camera & Anchors & Free-Look

  ClipDuration(clip) {
    const meta = this.openingLib?.api?.OpeningClipMeta?.(clip);
    if (!meta || meta.loop === true) return null;
    return meta.duration ?? null;
  }

  ResolveActorXZ(id) {
    if (id === "player") {
      const p = this.host.player?.position;
      return p ? { x: p.x, z: p.z } : null;
    }
    const pos = this.binder.Get(id)?.GetWorldPosition?.(this._v);
    return pos ? { x: pos.x, z: pos.z } : null;
  }

  ResolveAnchor(anchor) {
    if (typeof anchor.aircraft === "string") {
      const pose = this.air?.PoseOf?.(anchor.aircraft);
      const off = anchor.offset || [0, 0, 0];
      return pose ? { x: pose.x + off[0], y: pose.y + off[1], z: pose.z + off[2] } : { x: off[0], y: off[1], z: off[2] };
    }
    if (anchor.actor === "player" || (anchor.actor === undefined && anchor.eye)) {
      const p = this.host.player?.position || { x: 0, y: 0, z: 0 };
      const off = anchor.offset || [0, 0, 0];
      return {
        x: p.x + off[0], y: p.y + off[1], z: p.z + off[2],
        yawDeg: (this.host.player?.yaw || 0) / DEG,
        pitchDeg: (this.host.player?.pitch || 0) / DEG,
      };
    }
    if (typeof anchor.actor === "string") {
      const pos = this.binder.Get(anchor.actor)?.GetWorldPosition?.(this._v);
      const off = anchor.offset || [0, 0, 0];
      if (!pos) return { x: off[0], y: off[1], z: off[2] };
      return { x: pos.x + off[0], y: pos.y + off[1], z: pos.z + off[2] };
    }
    return {
      x: anchor.x,
      y: this.standAt(anchor.x, anchor.z) + (Number.isFinite(anchor.h) ? anchor.h : PREVIZ_DEFAULTS.pointH),
      z: anchor.z,
    };
  }

  ApplyCamera(camera) {
    if (!this.active || !camera || !this.lastEval?.camera) return false;
    const pose = {
      ...this.lastEval.camera,
      position: { ...this.lastEval.camera.position },
      shake: { ...this.lastEval.camera.shake },
    };

    // Apply transient action-triggered camera shake
    if (this.wallT < this.transientShake.until && this.transientShake.strength > 0) {
      const s = this.transientShake.strength;
      pose.yawDeg += Math.sin(this.wallT * 37) * s * 1.4;
      pose.pitchDeg += Math.cos(this.wallT * 29) * s * 1.1;
    }

    // Free-look support (`eye.free`)
    const fl = this.freeLook;
    if (pose.free && !this.paused) {
      const camClips = this.doc.tracks.filter((tr) => tr.type === "camera" && !tr.muted).flatMap((tr) => tr.clips || []);
      const seg = PrevizFreeLookSegment(camClips, pose.index);
      if (seg !== fl.segment) { fl.segment = seg; fl.active = false; }
      fl.defaultYaw = pose.yawDeg - pose.shake.yawDeg;
      fl.defaultPitch = pose.pitchDeg - pose.shake.pitchDeg;
      if (fl.active) {
        pose.yawDeg = fl.yawDeg + pose.shake.yawDeg;
        pose.pitchDeg = fl.pitchDeg + pose.shake.pitchDeg;
      }
    } else if (fl.segment !== -1) {
      this.ResetFreeLook();
    }

    // Notify post pipeline on shot cut to avoid TAA / MotionVector ghosting
    if (this.lastShotId !== null && this.lastShotId !== pose.shotId) {
      this.host.post?.NotifyCameraCut?.();
    }
    this.lastShotId = pose.shotId;

    camera.position.set(pose.position.x, pose.position.y, pose.position.z);
    camera.rotation.order = "YXZ";
    camera.rotation.set(pose.pitchDeg * DEG, pose.yawDeg * DEG, 0);
    if (Math.abs(camera.fov - pose.fov) > 1e-3) {
      camera.fov = pose.fov;
      camera.updateProjectionMatrix();
    }
    camera.updateMatrixWorld(true);
    this.lastCamera = pose;
    return true;
  }

  BindFreeLook() {
    if (typeof document === "undefined") return;
    this.onFreeMouse = (e) => {
      if (!this.FreeLookAvailable()) return;
      const dx = e.movementX || 0, dy = e.movementY || 0;
      if (Math.abs(dx) > 400 || Math.abs(dy) > 400) return;
      this.Look(dx, dy);
    };
    this.onFreeKeyDown = (e) => {
      if (!FREE_LOOK_KEYS[e.code] || e.ctrlKey || e.metaKey || e.altKey || !this.FreeLookAvailable()) return;
      e.preventDefault();
      this.freeLook.keys.add(e.code);
    };
    this.onFreeKeyUp = (e) => { this.freeLook.keys.delete(e.code); };
    this.onFreeBlur = () => { this.freeLook.keys.clear(); };
    document.addEventListener("mousemove", this.onFreeMouse);
    document.addEventListener("keydown", this.onFreeKeyDown);
    document.addEventListener("keyup", this.onFreeKeyUp);
    window.addEventListener("blur", this.onFreeBlur);
  }

  UnbindFreeLook() {
    if (typeof document === "undefined") return;
    document.removeEventListener("mousemove", this.onFreeMouse);
    document.removeEventListener("keydown", this.onFreeKeyDown);
    document.removeEventListener("keyup", this.onFreeKeyUp);
    window.removeEventListener("blur", this.onFreeBlur);
  }

  FreeLookAvailable() { return this.active && !this.paused && this.lastCamera?.free === true; }
  ResetFreeLook() { const fl = this.freeLook; fl.segment = -1; fl.active = false; fl.nudges = 0; }
  Look(dx, dy) {
    if (!this.FreeLookAvailable()) return false;
    const fl = this.freeLook;
    if (!fl.active) { fl.active = true; fl.yawDeg = fl.defaultYaw; fl.pitchDeg = fl.defaultPitch; }
    fl.yawDeg = WrapDeg(fl.yawDeg - dx * PREVIZ_FREE_LOOK.degPerPx);
    fl.pitchDeg = Math.max(-PREVIZ_FREE_LOOK.pitchMaxDeg, Math.min(PREVIZ_FREE_LOOK.pitchMaxDeg, fl.pitchDeg - dy * PREVIZ_FREE_LOOK.degPerPx));
    fl.nudges += 1;
    return true;
  }
  UpdateFreeLook(dt) {
    const fl = this.freeLook;
    if (!fl.keys.size || !this.FreeLookAvailable()) return;
    let kx = 0, ky = 0;
    for (const code of fl.keys) { const [x, y] = FREE_LOOK_KEYS[code] || [0, 0]; kx += x; ky += y; }
    if (!kx && !ky) return;
    const px = PREVIZ_FREE_LOOK.keyDegPerS * dt / PREVIZ_FREE_LOOK.degPerPx;
    this.Look(-kx * px, -ky * px);
  }

  // -------------------------------------------------------------------------
  // Timers & Overlay DOM

  StepTimers(dt) {
    if (!this.timers.length) return;
    for (let i = this.timers.length - 1; i >= 0; i--) {
      this.timers[i].left -= dt;
      if (this.timers[i].left <= 0) {
        const fn = this.timers[i].fn;
        this.timers.splice(i, 1);
        try { fn(); } catch {}
      }
    }
  }

  ClearTimers() { this.timers.length = 0; }

  BuildDom() {
    this.domBuilt = true;
    this.root = document.createElement("div");
    this.root.className = "encounterOpeningRoot";
    this.root.hidden = true;

    const overlay = document.createElement("div");
    overlay.className = "boPrevizOverlay";
    this.elBlack = document.createElement("i"); this.elBlack.className = "boPrevizBlack";
    this.elFlash = document.createElement("i"); this.elFlash.className = "boPrevizFlash";
    overlay.append(this.elBlack, this.elFlash);

    this.elCaption = document.createElement("div");
    this.elCaption.className = "boPrevizCaption";
    this.elCaption.hidden = true;

    this.elSubs = document.createElement("div");
    this.elSubs.className = "boPrevizSubs";
    this.elSubs.hidden = true;

    this.skipButton = document.createElement("button");
    this.skipButton.type = "button";
    this.skipButton.className = "encounterOpeningSkip";
    this.skipButton.textContent = T("hud.opening.skip");
    this.skipButton.onclick = () => this.Skip();

    this.root.append(overlay, this.elCaption, this.elSubs, this.skipButton);
    document.body.append(this.root);
  }

  RenderOverlays(o, activeLines) {
    if (!this.domBuilt) return;
    this.elFlash.style.opacity = o.flash > 0.001 ? o.flash.toFixed(3) : "0";
    this.elBlack.style.opacity = o.black > 0.001 ? o.black.toFixed(3) : "0";
    const caption = (o.captions || []).join("　");
    if (caption !== this.captionText) {
      this.captionText = caption;
      this.elCaption.textContent = caption;
      this.elCaption.hidden = !caption;
    }
    const rows = activeLines.map((item) => {
      if (item.line) {
        const row = this.voiceMap.get(item.line);
        if (row) return { id: row.id, speaker: row.speaker || "", text: row.subtitle ?? row.text ?? "" };
      }
      if (item.text) return { id: `${item.start}:${item.text}`, speaker: item.speaker || "", text: item.text };
      return null;
    }).filter(Boolean);
    const key = rows.map((r) => r.id).join("|");
    if (key === this.subsKey) return;
    this.subsKey = key;
    this.elSubs.replaceChildren(...rows.map((r, i) => {
      const row = document.createElement("div");
      row.className = `boPrevizSub${i < rows.length - 1 ? " aside" : ""}`;
      if (r.speaker) {
        const who = document.createElement("span");
        who.className = "boPrevizWho";
        who.textContent = r.speaker;
        row.append(who);
      }
      const text = document.createElement("span");
      text.className = "boPrevizText";
      text.textContent = r.text;
      row.append(text);
      return row;
    }));
    this.elSubs.hidden = !rows.length;
  }

  // -------------------------------------------------------------------------
  // State & Disposal

  State() {
    const ev = this.lastEval;
    return {
      directorId: this.directorId,
      id: this.doc?.id ?? null,
      title: this.doc?.title ?? null,
      schema: this.doc?.schema ?? null,
      mode: this.doc?.mode ?? null,
      inputLock: this.active ? this.inputLock : "none",
      loaded: this.loaded,
      active: this.active,
      paused: this.paused,
      waitingGate: this.waitingGate ? { ...this.waitingGate } : null,
      t: +this.t.toFixed(3),
      durationS: this.doc ? +this.doc.durationS.toFixed(3) : 0,
      timeScale: +this.timeScale.toFixed(3),
      envHour: this.env?.clock?.hour ?? null,
      segmentIndex: ev?.segmentIndex ?? -1,
      segmentId: ev?.segmentId ?? null,
      keyframe: ev?.segmentId ?? null,
      segmentTitle: ev?.segmentTitle ?? null,
      bindings: this.binder.report.map((r) => ({ ...r })),
      camera: this.lastCamera && this.active ? { ...this.lastCamera, position: { ...this.lastCamera.position } } : null,
      subtitles: this.domBuilt && !this.elSubs.hidden
        ? [...this.elSubs.querySelectorAll(".boPrevizText")].map((e) => e.textContent)
        : [],
      freeLook: {
        available: this.FreeLookAvailable(),
        active: this.freeLook.active,
        nudges: this.freeLook.nudges,
        yawDeg: +(this.freeLook.active ? this.freeLook.yawDeg : this.freeLook.defaultYaw).toFixed(3),
        pitchDeg: +(this.freeLook.active ? this.freeLook.pitchDeg : this.freeLook.defaultPitch).toFixed(3),
      },
      missingActions: [...this.missingActions],
      missingClips: [...this.missingClips],
      missingLines: [...this.missingLines],
      missingSfx: [...this.missingSfx],
      errors: this.validation?.errors?.slice(0, 12) ?? [],
    };
  }

  Dispose() {
    if (this.disposed) return;
    this.Stop({ finished: false, skipped: false });
    this.disposed = true;
    this.UnbindFreeLook();
    this.flareTrack?.Dispose?.();
    this.fx?.Dispose?.();
    this.air?.Dispose?.();
    this.root?.remove?.();
  }
}

// ---------------------------------------------------------------------------
// Multi-instance TimelineManager (runs blocking cinematics + concurrent setpieces)

export class TimelineManager {
  constructor({ host, resolver, groundAt, standAt, env, encounter, prefabs = null, actions = null, onStateChange = null } = {}) {
    this.host = host || {};
    this.resolver = resolver || {};
    this.groundAt = groundAt || resolver?.groundAt || (() => 0);
    this.standAt = standAt || this.groundAt;
    this.env = env || host?.ctx?.env || null;
    this.encounter = encounter || null;
    this.prefabs = prefabs || new TimelinePrefabRegistry();
    this.actions = actions || new TimelineActionRegistry();
    this.onStateChange = onStateChange;
    this.directors = new Map(); // id -> TimelineDirector
    this.preloaded = new Map(); // url -> normalized doc + deps
    this.disposed = false;
  }

  _NotifyStateChange() {
    this.onStateChange?.({
      activeCount: this.ActiveDirectors().length,
      blocking: this.IsBlockingInput(),
      inputLock: this.InputLockMode(),
      hidesViewmodel: this.HidesViewmodel(),
      hidesHud: this.HidesHud(),
    });
  }

  RegisterPrefab(id, factory) { return this.prefabs.Register(id, factory); }
  RegisterAction(id, handler, opts) { return this.actions.Register(id, handler, opts); }

  /**
   * Statically fetch and collect dependencies for multiple Timeline v2 URLs so
   * the level's Warmup step can pre-warm all prefabs/cast/audio before gameplay starts.
   */
  async PreloadDependencies(urls = []) {
    const combined = {
      prefabs: new Set(), castIds: new Set(), clips: new Set(), weapons: new Set(),
      voices: new Set(), sfx: new Set(), music: new Set(), vfx: new Set(), aircraft: new Set(), actions: new Set(),
    };
    const jobs = (urls || []).map(async (url) => {
      if (typeof url !== "string" || !url) return;
      if (this.preloaded.has(url)) return;
      try {
        const resp = await fetch(url);
        if (!resp.ok) return;
        const doc = NormalizeTimelineAsset(await resp.json());
        const deps = CollectTimelineDependencies(doc);
        this.preloaded.set(url, { doc, deps });
      } catch (error) {
        console.warn("[TimelineManager] PreloadDependencies skipped:", url, error?.message || error);
      }
    });
    await Promise.all(jobs);
    for (const { deps } of this.preloaded.values()) {
      for (const k of Object.keys(combined)) for (const v of deps[k] || []) combined[k].add(v);
    }
    return Object.fromEntries(Object.entries(combined).map(([k, s]) => [k, [...s].sort()]));
  }

  CreateDirector({ onComplete = null, onGatePaused = null, metadataOnly = true } = {}) {
    return new TimelineDirector({
      host: this.host,
      resolver: this.resolver,
      prefabs: this.prefabs,
      actions: this.actions,
      groundAt: this.groundAt,
      standAt: this.standAt,
      env: this.env,
      encounter: this.encounter,
      manager: this,
      onComplete,
      onGatePaused,
      metadataOnly,
    });
  }

  async Play(docOrUrl, { startTime = 0, paused = false, forceFallback = false, onComplete = null, onGatePaused = null, key = null } = {}) {
    if (this.disposed) return null;
    const cached = typeof docOrUrl === "string" ? this.preloaded.get(docOrUrl)?.doc : null;
    const director = this.CreateDirector({
      onGatePaused,
      onComplete: (info) => {
        if (this.directors.get(slotKey) === director) this.directors.delete(slotKey);
        director.Dispose();
        this._NotifyStateChange();
        onComplete?.(info);
      },
    });
    await director.Load(cached || docOrUrl);
    if (this.disposed) { director.Dispose(); return null; }
    const slotKey = key || director.doc?.id || director.directorId;
    if (this.directors.has(slotKey)) {
      const prev = this.directors.get(slotKey);
      this.directors.delete(slotKey);
      prev.Dispose();
    }
    this.directors.set(slotKey, director);
    director.Play(startTime, { paused, forceFallback });
    this._NotifyStateChange();
    return director;
  }

  Get(id) { return this.directors.get(id) || null; }

  ActiveDirectors() {
    return [...this.directors.values()].filter((d) => d.active && !d.disposed);
  }

  HasActive() { return this.ActiveDirectors().length > 0; }

  InputLockMode() {
    const rank = { none: 0, movementOnly: 1, lookOnly: 2, all: 3 };
    let best = "none";
    for (const d of this.ActiveDirectors()) {
      if ((rank[d.inputLock] || 0) > (rank[best] || 0)) best = d.inputLock;
    }
    return best;
  }

  IsBlockingInput() {
    return this.InputLockMode() !== "none";
  }

  HidesViewmodel() {
    return this.ActiveDirectors().some((d) => d.doc?.hideViewmodel);
  }

  HidesHud() {
    return this.ActiveDirectors().some((d) => d.doc?.hideHud);
  }

  Update(dt) {
    if (this.disposed) return;
    for (const d of [...this.directors.values()]) {
      if (d.active && !d.disposed) d.Update(dt);
    }
  }

  ApplyCamera(camera) {
    if (this.disposed) return false;
    // Prefer the most recently started active director that has a camera track
    const active = this.ActiveDirectors();
    for (let i = active.length - 1; i >= 0; i--) {
      if (active[i].ApplyCamera(camera)) return true;
    }
    return false;
  }

  OnKey(detail) {
    const active = this.ActiveDirectors();
    if (!active.length) return undefined;
    // Space skips active skippable cinematic timeline
    if (detail.code === "Space" && detail.down && !detail.repeat) {
      for (let i = active.length - 1; i >= 0; i--) {
        if (active[i].doc?.allowSkip) { active[i].Skip(); return true; }
      }
    }
    // F releases waiting GateMarker if any director is paused on an interactive gate
    if (detail.code === "KeyF" && detail.down !== false) {
      for (let i = active.length - 1; i >= 0; i--) {
        if (active[i].waitingGate) { active[i].SignalGate(active[i].waitingGate.gateId); return true; }
      }
    }
    if (this.IsBlockingInput()) {
      if (detail.code === "Escape") return undefined;
      return true;
    }
    return undefined;
  }

  SetPaused(paused) {
    for (const d of this.directors.values()) if (d.active) d.SetPaused(paused);
  }

  SignalGate(gateId) {
    let released = false;
    for (const d of this.directors.values()) if (d.SignalGate(gateId)) released = true;
    return released;
  }

  Skip(id = null) {
    if (id) return this.directors.get(id)?.Skip() || false;
    let any = false;
    for (const d of [...this.directors.values()]) if (d.active && d.doc?.allowSkip && d.Skip()) any = true;
    return any;
  }

  Stop(id = null) {
    if (id) {
      const d = this.directors.get(id);
      if (!d) return false;
      this.directors.delete(id);
      d.Dispose();
      this._NotifyStateChange();
      return true;
    }
    for (const d of [...this.directors.values()]) d.Dispose();
    this.directors.clear();
    this._NotifyStateChange();
    return true;
  }

  State() {
    const items = [...this.directors.values()].map((d) => d.State());
    return {
      activeCount: items.filter((s) => s.active).length,
      blocking: this.IsBlockingInput(),
      inputLock: this.InputLockMode(),
      hidesViewmodel: this.HidesViewmodel(),
      hidesHud: this.HidesHud(),
      registeredActions: this.actions.List(),
      preloadedUrls: [...this.preloaded.keys()],
      active: items,
    };
  }

  Dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.Stop();
    this.preloaded.clear();
  }
}
