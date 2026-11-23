// 第一关正式战役的 01–02f 开场 Timeline 播放器：直接复用 BlockoutPreviz 与 Timeline/FirstLevelOpening.timeline.json。
// 播完 01-1…02-2（或玩家按 Space / 点击跳过）后清空开场演员与遮罩，无缝交接给 EncounterPlay 的 02g 战斗。

import * as THREE from "three";
import {
  FIRST_LEVEL_OPENING_CONFIG_URL,
  FIRST_LEVEL_OPENING_SEQUENCES,
  FIRST_LEVEL_OPENING_TIMELINE_URL,
} from "./Data_FirstLevelCampaign.mjs";
import { KeyframeIndex, NormalizeBlockout } from "./Script_EditorBlockoutConfig.mjs";
import { BlockoutPreviz } from "./Script_EditorBlockoutPreviz.mjs";
import { BlockStandSampler } from "./Script_EditorBlockoutPrevizPlan.mjs";
import { TimelineAsPreviz } from "./Script_TimelinePlan.mjs";
import { T } from "./Script_Text.mjs";

export class FirstLevelOpeningTimeline {
  constructor({ host, puppets, groundAt, onComplete }) {
    this.host = host;
    this.puppets = puppets;
    this.groundAt = groundAt;
    this.onComplete = onComplete;
    this.sequenceIds = [...FIRST_LEVEL_OPENING_SEQUENCES];
    this.loaded = false;
    this.active = false;
    this.staging = false;
    this.paused = false;
    this.disposed = false;
    this.seqIndex = -1;
    this.token = 0;
    this.baseSignals = new Set(["Stage0105Done"]);
    this.previzSignals = null;
    this.lastSignalKey = "";
    this._cam = new THREE.Vector3();

    this.root = document.createElement("div");
    this.root.className = "encounterOpeningRoot";
    this.root.hidden = true;
    this.skipButton = document.createElement("button");
    this.skipButton.type = "button";
    this.skipButton.className = "encounterOpeningSkip";
    this.skipButton.textContent = T("hud.opening.skip");
    this.skipButton.onclick = () => this.Skip();
    this.root.append(this.skipButton);
    document.body.append(this.root);

    const layout = host.battlefield?.layout || null;
    this.standAt = layout
      ? BlockStandSampler(layout.blocks || [], layout.scenario || null, (x, z) => this.groundAt(x, z), (name) => this.HasSignal(name))
      : (x, z) => this.groundAt(x, z);

    const self = this;
    this.adapter = {
      doc: null,
      index: 0,
      levelKey: "FirstLevel0105",
      puppets: this.puppets,
      params: null,
      get _cam() {
        self.host.camera.getWorldPosition(self._cam);
        return self._cam;
      },
      host: {
        scene: host.scene,
        post: host.post,
        audio: host.audio,
        vfx: host.vfx,
        aircraft: host.ctx.aircraft,
        SetViewmodelVisible: (visible) => {
          if (host.viewmodel) host.viewmodel.root.visible = !!visible && !self.active;
        },
      },
      game: { player: host.player },
      environment: { system: host.ctx.env },
      ui: {
        root: this.root,
        SetPrevizPlaying: () => {},
      },
      standAt: (x, z) => this.standAt(x, z),
      async GoTo(idOrIndex) {
        if (!self.adapter.doc || self.disposed || (!self.active && !self.staging)) return false;
        const token = self.token;
        const index = KeyframeIndex(self.adapter.doc, idOrIndex);
        if (index < 0) return false;
        self.adapter.index = index;
        const kf = self.adapter.doc.keyframes[index];
        self.baseSignals = new Set(["Stage0105Done", ...(kf.signals || [])]);
        self.previzSignals = null;
        self.SyncSignals();
        if (kf.player) {
          self.host.player.Spawn(kf.player.x, kf.player.z, ((kf.player.yawDeg || 0) * Math.PI) / 180);
        }
        await self.puppets.PrepareCasts(kf.units || []);
        if (self.disposed || self.token !== token || (!self.active && !self.staging)) return false;
        self.host.camera.getWorldPosition(self._cam);
        self.puppets.Apply(kf.units || [], self._cam);
        return true;
      },
      SetPrevizSignals(overrides) {
        self.previzSignals = overrides;
        self.SyncSignals();
      },
      ReleasePointerLock() {
        self.host.ctx.ReleasePointerLock?.();
      },
      OnPrevizStart() {},
      OnPrevizProgress() {},
      OnPrevizEnd() {},
      OnPrevizStatus() {},
    };

    this.previz = new BlockoutPreviz(this.adapter, { metadataOnly: true });
    this.previz.SetCameraMode("move");
    // Ensure skip button stays above black/flash overlay and captions/subtitles.
    this.root.append(this.skipButton);
  }

  HasSignal(name) {
    if (this.previzSignals?.has(name)) return !!this.previzSignals.get(name);
    return this.baseSignals.has(name);
  }

  SyncSignals() {
    const active = new Set(this.baseSignals);
    if (this.previzSignals) {
      for (const [name, on] of this.previzSignals) {
        if (on) active.add(name);
        else active.delete(name);
      }
    }
    const key = [...active].sort().join(",");
    if (key === this.lastSignalKey) return;
    this.lastSignalKey = key;
    const changed = this.host.battlefield.RestoreScenario?.({ signalled: (id) => active.has(id) });
    if (changed) this.host.ctx.navGrid?.Refresh?.(this.host.battlefield, { spread: true });
  }

  async Load() {
    if (this.loaded) return true;
    const [timelineResp, configResp] = await Promise.all([
      fetch(FIRST_LEVEL_OPENING_TIMELINE_URL),
      fetch(FIRST_LEVEL_OPENING_CONFIG_URL),
    ]);
    if (!timelineResp.ok) throw new Error(`Opening timeline load failed: HTTP ${timelineResp.status}`);
    if (!configResp.ok) throw new Error(`Opening keyframe config load failed: HTTP ${configResp.status}`);
    const [timelineDoc, configDoc] = await Promise.all([timelineResp.json(), configResp.json()]);
    if (this.disposed) return false;
    const doc = NormalizeBlockout(configDoc);
    // Drop legacy unnamed dugout filler soldiers (Squad1..Squad3) that are not in the authored Encounter squad.
    const HIDDEN_OPENING_EXTRAS = new Set(["Squad1", "Squad2", "Squad3"]);
    for (const kf of doc.keyframes || []) {
      if (Array.isArray(kf.units)) kf.units = kf.units.filter((u) => !HIDDEN_OPENING_EXTRAS.has(u.id));
    }
    this.adapter.doc = doc;
    this.timelineDoc = timelineDoc;
    await this.previz.UseSource(TimelineAsPreviz(timelineDoc));
    await this.previz.EnsureOpening();
    if (this.disposed) return false;
    this.loaded = true;
    return true;
  }

  async Stage(keyframeId = this.sequenceIds[0]) {
    if (this.disposed || !this.loaded) return false;
    this.staging = true;
    try {
      return await this.adapter.GoTo(keyframeId);
    } finally {
      this.staging = false;
    }
  }

  async Start(startKeyframe = this.sequenceIds[0]) {
    if (this.disposed) return false;
    if (!this.loaded) await this.Load();
    if (this.disposed) return false;
    const startIndex = Math.max(0, this.sequenceIds.indexOf(startKeyframe));
    const token = ++this.token;
    this.active = true;
    this.paused = false;
    this.seqIndex = startIndex;
    this.root.hidden = false;
    document.body.classList.add("encounterOpening");
    if (this.host.viewmodel) this.host.viewmodel.root.visible = false;
    this.host.ctx.env?.SetHour?.(12);
    this.RunSequenceLoop(startIndex, token);
    return true;
  }

  async RunSequenceLoop(startIndex, token) {
    try {
      for (let i = startIndex; i < this.sequenceIds.length; i += 1) {
        if (!this.active || this.disposed || this.token !== token) return;
        this.seqIndex = i;
        const finished = await this.previz.Play(this.sequenceIds[i]);
        if (!this.active || this.disposed || this.token !== token || !finished) return;
      }
      this.Finish({ skipped: false });
    } catch (error) {
      console.warn("[FirstLevelOpeningTimeline] Opening sequence error; handing off to combat:", error);
      if (this.active && this.token === token) this.Finish({ skipped: true, error: String(error?.message || error) });
    }
  }

  Update(dt) {
    if (!this.active || this.paused || this.disposed) return;
    this.previz.Update(dt);
    if (!this.active) return;
    this.host.camera.getWorldPosition(this._cam);
    this.puppets.Update(dt * (this.previz.TimeScale?.() ?? 1), this._cam);
  }

  ApplyCamera(camera) {
    if (!this.active || this.disposed) return false;
    return this.previz.ApplyCamera(camera);
  }

  SetPaused(paused) {
    if (!this.active || this.disposed) return;
    this.paused = !!paused;
    if (this.paused) this.previz.Pause();
    else this.previz.Resume();
  }

  Skip() {
    if (!this.active || this.disposed) return false;
    this.Finish({ skipped: true });
    return true;
  }

  Stop() {
    this.token += 1;
    if (!this.active && !this.previz.playing) return;
    this.active = false;
    this.paused = false;
    this.seqIndex = -1;
    this.previz.Stop({ restore: false, finished: false });
    this.previzSignals = null;
    this.lastSignalKey = "";
    this.puppets.Clear();
    this.root.hidden = true;
    document.body.classList.remove("encounterOpening", "blockoutPreviz");
    if (this.host.viewmodel) this.host.viewmodel.root.visible = true;
  }

  Finish({ skipped = false, error = null } = {}) {
    if (!this.active) return;
    this.Stop();
    this.onComplete?.({ skipped, error });
  }

  State() {
    const inner = this.previz?.State?.() || null;
    return {
      active: this.active,
      paused: this.paused,
      loaded: this.loaded,
      sequenceIndex: this.seqIndex,
      sequenceCount: this.sequenceIds.length,
      keyframe: inner?.keyframe ?? (this.active ? this.sequenceIds[this.seqIndex] ?? null : null),
      title: inner?.title ?? null,
      t: inner?.t ?? 0,
      durationS: inner?.durationS ?? 0,
      subtitles: inner?.subtitles ?? [],
      freeLook: inner?.freeLook ?? null,
    };
  }

  Dispose() {
    if (this.disposed) return;
    this.Stop();
    this.disposed = true;
    this.previz?.Dispose?.();
    this.root.remove();
  }
}
