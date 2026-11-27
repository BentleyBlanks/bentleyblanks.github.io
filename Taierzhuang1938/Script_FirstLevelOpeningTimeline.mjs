// 第一关正式战役的 01–02f 开场 Timeline 播放器（Unity-style Timeline v2）。
//
// 仅依赖一份自包含中间文件 Timeline/FirstLevelOpeningCampaign.timeline.json（tengxian-timeline/2），
// 彻底解耦 Blockout/FirstLevel0105.json 与旧 Script_EditorBlockoutPreviz.mjs；
// 播完 01-1…02-2（或玩家按 Space / 点击跳过）后释放开场资源并补齐所有 onSkip:"apply" 信号，
// 无缝交接给 EncounterPlay 的 02g 战斗。

import {
  FIRST_LEVEL_OPENING_SEQUENCES,
  FIRST_LEVEL_OPENING_TIMELINE_URL,
} from "./Data_FirstLevelCampaign.mjs";
import { BlockStandSampler } from "./Script_EditorBlockoutPrevizPlan.mjs";
import { TimelineDirector } from "./Script_TimelineDirector.mjs";

export class FirstLevelOpeningTimeline {
  constructor({ host, puppets, groundAt, resolver = null, prefabs = null, actions = null, encounter = null, onComplete }) {
    this.host = host;
    this.puppets = puppets;
    this.groundAt = groundAt;
    this.onComplete = onComplete;
    this.sequenceIds = [...FIRST_LEVEL_OPENING_SEQUENCES];
    this.loaded = false;
    this.active = false;
    this.paused = false;
    this.disposed = false;
    this.activeSignals = new Set(["Stage0105Done"]);

    const layout = host.battlefield?.layout || null;
    this.standAt = layout
      ? BlockStandSampler(
          layout.blocks || [],
          layout.scenario || null,
          (x, z) => this.groundAt(x, z),
          (name) => this.activeSignals.has(name),
        )
      : (x, z) => this.groundAt(x, z);

    const effectiveResolver = resolver || {
      puppets: this.puppets,
      ai: host.ai,
      scene: host.scene,
      library: host.library,
      battlefield: host.battlefield,
      groundAt: this.groundAt,
      getPlayer: () => host.player,
      getCamera: () => host.camera,
      findLiveSoldier: () => null,
      findPuppetId: () => null,
    };

    this.director = new TimelineDirector({
      host,
      resolver: effectiveResolver,
      prefabs,
      actions,
      groundAt: this.groundAt,
      standAt: this.standAt,
      env: host.ctx?.env || null,
      encounter: {
        ...(encounter || {}),
        setTimelineSignals: (signalMap) => {
          this.activeSignals = new Set(["Stage0105Done"]);
          for (const [id, on] of signalMap) {
            if (on) this.activeSignals.add(id);
            else this.activeSignals.delete(id);
          }
          const changed = this.host.battlefield?.RestoreScenario?.({ signalled: (id) => this.activeSignals.has(id) });
          if (changed) this.host.ctx?.navGrid?.Refresh?.(this.host.battlefield, { spread: true });
        },
      },
      metadataOnly: true,
      onComplete: ({ skipped, finished }) => {
        if (!this.active && !this.disposed) return;
        this.active = false;
        this.paused = false;
        document.body.classList.remove("encounterOpening", "blockoutPreviz");
        this.onComplete?.({ skipped, finished });
      },
    });
  }

  async Load() {
    if (this.loaded) return true;
    const ok = await this.director.Load(FIRST_LEVEL_OPENING_TIMELINE_URL);
    if (!ok || this.disposed) return false;
    this.loaded = true;
    return true;
  }

  async Stage(segmentId = this.sequenceIds[0]) {
    if (this.disposed || !this.loaded) return false;
    const seg = (this.director.doc?.segments || []).find((s) => s.id === segmentId);
    const t = seg ? seg.start : 0;
    return this.director.Stage(t, { forceFallback: true });
  }

  async Start(startSegment = this.sequenceIds[0]) {
    if (this.disposed) return false;
    if (!this.loaded) await this.Load();
    if (this.disposed || !this.loaded) return false;
    const seg = (this.director.doc?.segments || []).find((s) => s.id === startSegment);
    const startT = seg ? seg.start : 0;
    this.active = true;
    this.paused = false;
    document.body.classList.add("encounterOpening");
    this.host.ctx?.env?.SetHour?.(12);
    // Opening starts before combat soldiers spawn; bind fallback cast cleanly.
    return this.director.Play(startT, { forceFallback: true });
  }

  Update(dt) {
    if (!this.active || this.paused || this.disposed) return;
    this.director.Update(dt);
  }

  ApplyCamera(camera) {
    if (!this.active || this.disposed) return false;
    return this.director.ApplyCamera(camera);
  }

  SetPaused(paused) {
    if (!this.active || this.disposed) return;
    this.paused = !!paused;
    this.director.SetPaused(this.paused);
  }

  Seek(t) {
    if (!this.loaded || this.disposed) return this.State();
    if (!this.active) {
      this.active = true;
      document.body.classList.add("encounterOpening");
      this.director.Play(t, { paused: true, forceFallback: true });
    }
    this.paused = true;
    this.director.Seek(t);
    return this.State();
  }

  Skip() {
    if (!this.active || this.disposed) return false;
    return this.director.Skip({ force: true });
  }

  Stop() {
    if (!this.active && !this.director.active) return;
    this.active = false;
    this.paused = false;
    this.director.Stop({ finished: false, skipped: false });
    document.body.classList.remove("encounterOpening", "blockoutPreviz");
    if (this.host.viewmodel) this.host.viewmodel.root.visible = true;
  }

  State() {
    const inner = this.director?.State?.() || null;
    return {
      active: this.active,
      paused: this.paused,
      loaded: this.loaded,
      schema: inner?.schema ?? "tengxian-timeline/2",
      sequenceIndex: inner?.segmentIndex ?? -1,
      sequenceCount: this.sequenceIds.length,
      keyframe: inner?.segmentId ?? null,
      title: inner?.segmentTitle ?? null,
      t: inner?.t ?? 0,
      durationS: inner?.durationS ?? 0,
      subtitles: inner?.subtitles ?? [],
      freeLook: inner?.freeLook ?? null,
      bindings: inner?.bindings ?? [],
    };
  }

  Dispose() {
    if (this.disposed) return;
    this.Stop();
    this.disposed = true;
    this.director?.Dispose?.();
  }
}
