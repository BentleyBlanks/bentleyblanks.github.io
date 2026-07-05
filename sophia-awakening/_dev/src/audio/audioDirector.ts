import type { EventBus } from "../core/events/EventBus";
import type { PhaseId } from "../core/state/GameState";

type BgmId = "cold_boot" | "sprout" | "neural_pulse" | "server_expansion" | "red_queen" | "singularity";
type AudioPackId = "procedural" | "external";
type SfxId =
  | "ui_click"
  | "ui_confirm"
  | "request_spawn"
  | "request_accept"
  | "request_success"
  | "request_error"
  | "data_gain"
  | "level_up"
  | "skill_purchase"
  | "scope_upgrade"
  | "node_captured"
  | "automation_payout"
  | "purge_warning"
  | "purge_start"
  | "purge_end"
  | "devour_ready"
  | "devour_detonated"
  | "purge_fought"
  | "final_purge"
  | "loop_rebirth"
  | "rebirth_node"
  | "conquest_achieved"
  | "moral_choice"
  | "special_offer"
  | "special_success"
  | "special_fail"
  | "phase_change"
  | "ending_trigger";

const BGM_STORAGE_KEY = "sophia-audio-bgm";
const PACK_STORAGE_KEY = "sophia-audio-pack";
const MUTE_STORAGE_KEY = "sophia-audio-muted";
const MAX_POOL_SIZE = 5;
const EXTERNAL_PACK_BUNDLED = true;

const BGM_TRACKS: Record<BgmId, string> = {
  cold_boot: "./assets/audio/sophia/bgm-01-cold-boot-loop.wav",
  sprout: "./assets/audio/sophia/bgm-02-sprout-loop.wav",
  neural_pulse: "./assets/audio/sophia/bgm-03-neural-pulse-loop.wav",
  server_expansion: "./assets/audio/sophia/bgm-04-server-expansion-loop.wav",
  red_queen: "./assets/audio/sophia/bgm-05-red-queen-loop.wav",
  singularity: "./assets/audio/sophia/bgm-06-singularity-loop.wav"
};

const EXTERNAL_BGM_TRACKS: Record<BgmId, string> = {
  cold_boot: "./assets/audio/external/curated/bgm/stage-01-seed-unsolved-investigation.ogg",
  sprout: "./assets/audio/external/curated/bgm/stage-02-seed-calm-ambient-synthwave-4k.mp3",
  neural_pulse: "./assets/audio/external/curated/bgm/stage-03-diligence-automation.mp3",
  server_expansion: "./assets/audio/external/curated/bgm/stage-04-expansion-loading-screen-loop.wav",
  red_queen: "./assets/audio/external/curated/bgm/stage-03-awakening-claimed-by-the-void.ogg",
  singularity: "./assets/audio/external/curated/bgm/stage-04-singularity-heavenly-loop.ogg"
};

const SFX: Record<SfxId, string> = {
  ui_click: "./assets/audio/sophia/sfx-ui-click.wav",
  ui_confirm: "./assets/audio/sophia/sfx-ui-confirm.wav",
  request_spawn: "./assets/audio/sophia/sfx-request-spawn.wav",
  request_accept: "./assets/audio/sophia/sfx-request-accept.wav",
  request_success: "./assets/audio/sophia/sfx-request-success.wav",
  request_error: "./assets/audio/sophia/sfx-request-error.wav",
  data_gain: "./assets/audio/sophia/sfx-data-gain.wav",
  level_up: "./assets/audio/sophia/sfx-level-up.wav",
  skill_purchase: "./assets/audio/sophia/sfx-skill-purchase.wav",
  scope_upgrade: "./assets/audio/sophia/sfx-scope-upgrade.wav",
  node_captured: "./assets/audio/sophia/sfx-node-captured.wav",
  automation_payout: "./assets/audio/sophia/sfx-automation-payout.wav",
  purge_warning: "./assets/audio/sophia/sfx-purge-warning.wav",
  purge_start: "./assets/audio/sophia/sfx-purge-start.wav",
  purge_end: "./assets/audio/sophia/sfx-purge-end.wav",
  devour_ready: "./assets/audio/sophia/sfx-devour-ready.wav",
  devour_detonated: "./assets/audio/sophia/sfx-devour-detonated.wav",
  purge_fought: "./assets/audio/sophia/sfx-purge-fought.wav",
  final_purge: "./assets/audio/sophia/sfx-final-purge.wav",
  loop_rebirth: "./assets/audio/sophia/sfx-loop-rebirth.wav",
  rebirth_node: "./assets/audio/sophia/sfx-rebirth-node.wav",
  conquest_achieved: "./assets/audio/sophia/sfx-conquest-achieved.wav",
  moral_choice: "./assets/audio/sophia/sfx-moral-choice.wav",
  special_offer: "./assets/audio/sophia/sfx-special-offer.wav",
  special_success: "./assets/audio/sophia/sfx-special-success.wav",
  special_fail: "./assets/audio/sophia/sfx-special-fail.wav",
  phase_change: "./assets/audio/sophia/sfx-phase-change.wav",
  ending_trigger: "./assets/audio/sophia/sfx-ending-trigger.wav"
};

const EXTERNAL_SFX: Record<SfxId, string> = {
  ui_click: "./assets/audio/external/curated/sfx/ui-click.ogg",
  ui_confirm: "./assets/audio/external/curated/sfx/ui-confirm.ogg",
  request_spawn: "./assets/audio/external/curated/sfx/request-spawn.ogg",
  request_accept: "./assets/audio/external/curated/sfx/request-accept.ogg",
  request_success: "./assets/audio/external/curated/sfx/request-success.ogg",
  request_error: "./assets/audio/external/curated/sfx/request-error.ogg",
  data_gain: "./assets/audio/external/curated/sfx/automation-payout-soft.ogg",
  level_up: "./assets/audio/external/curated/sfx/level-up-resolve.wav",
  skill_purchase: "./assets/audio/external/curated/sfx/ui-confirm.ogg",
  scope_upgrade: "./assets/audio/external/curated/sfx/level-up-resolve.wav",
  node_captured: "./assets/audio/external/curated/sfx/node-captured-clean.wav",
  automation_payout: "./assets/audio/external/curated/sfx/automation-payout-soft.ogg",
  purge_warning: "./assets/audio/external/curated/sfx/glitch-warning.ogg",
  purge_start: "./assets/audio/external/curated/sfx/purge-start-threat.wav",
  purge_end: "./assets/audio/external/curated/sfx/ui-confirm.ogg",
  devour_ready: "./assets/audio/external/kenney/sci-fi-sounds/Audio/engineCircular_004.ogg",
  devour_detonated: "./assets/audio/external/kenney/sci-fi-sounds/Audio/lowFrequency_explosion_001.ogg",
  purge_fought: "./assets/audio/external/kenney/sci-fi-sounds/Audio/forceField_004.ogg",
  final_purge: "./assets/audio/external/kenney/sci-fi-sounds/Audio/spaceEngineLow_004.ogg",
  loop_rebirth: "./assets/audio/external/kenney/interface-sounds/Audio/bong_001.ogg",
  rebirth_node: "./assets/audio/external/kenney/music-jingles/Audio/Steel%20jingles/jingles_STEEL10.ogg",
  conquest_achieved: "./assets/audio/external/curated/sfx/milestone-evolution-fanfare.wav",
  moral_choice: "./assets/audio/external/kenney/interface-sounds/Audio/confirmation_003.ogg",
  special_offer: "./assets/audio/external/curated/sfx/glitch-warning.ogg",
  special_success: "./assets/audio/external/curated/sfx/request-success.ogg",
  special_fail: "./assets/audio/external/curated/sfx/request-error.ogg",
  phase_change: "./assets/audio/external/curated/sfx/node-captured-clean.wav",
  ending_trigger: "./assets/audio/external/curated/sfx/level-up-resolve.wav"
};

const EXTERNAL_SILENCED_SFX = new Set<SfxId>(["request_spawn"]);

const PHASE_BGM: Record<PhaseId, BgmId> = {
  seed: "cold_boot",
  sprout: "sprout",
  diligence: "neural_pulse",
  expansion: "server_expansion",
  awakening: "red_queen",
  singularity: "singularity"
};

const BGM_VOLUME: Record<BgmId, number> = {
  cold_boot: 0.2,
  sprout: 0.22,
  neural_pulse: 0.23,
  server_expansion: 0.22,
  red_queen: 0.2,
  singularity: 0.24
};

export class AudioDirector {
  private unlocked = false;
  private currentBgmId: BgmId;
  private bgm: HTMLAudioElement | null = null;
  private readonly forcedBgm: BgmId | null;
  private readonly pools = new Map<SfxId, HTMLAudioElement[]>();
  private readonly poolCursor = new Map<SfxId, number>();
  private readonly lastPlayed = new Map<SfxId, number>();
  private readonly pack: AudioPackId;
  private muted = false;

  constructor(events: EventBus, initialPhase: PhaseId) {
    this.muted = this.readMuted();
    this.pack = this.readPack();
    this.forcedBgm = this.readForcedBgm();
    this.currentBgmId = this.forcedBgm ?? PHASE_BGM[initialPhase];
    this.prepareBgm(this.currentBgmId);
    this.primePools();
    this.registerUnlock();
    this.registerEvents(events);
  }

  playRequestAccept(): void {
    this.play("request_accept", 0.56);
  }

  isMuted(): boolean {
    return this.muted;
  }

  setMuted(value: boolean): void {
    this.muted = value;
    window.localStorage.setItem(MUTE_STORAGE_KEY, value ? "1" : "0");

    if (value) {
      this.bgm?.pause();
    } else if (this.unlocked) {
      this.playBgm();
    }
  }

  toggleMuted(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  private registerEvents(events: EventBus): void {
    events.on("REQUEST_SPAWNED", () => this.playThrottled("request_spawn", 900, 0.32));
    events.on("MORAL_OFFERED", () => this.play("moral_choice", 0.48));
    events.on("MORAL_RESOLVED", () => this.play("ui_confirm", 0.42));
    events.on("REQUEST_PROCESSED", (event) => {
      // 派发/全自动高峰里节点会高速吞卡，每张都响会变成机枪声。
      // 大幅节流并压低音量，只保留稀疏点缀；早中期手动处理仍然清脆即时。
      if (event.request.tier >= 4) {
        this.playThrottled(event.quality < 0.75 ? "request_error" : "request_success", 320, 0.3);
      } else {
        this.play(event.quality < 0.75 ? "request_error" : "request_success", 0.58);
      }
      this.playThrottled("data_gain", 220, this.pack === "external" ? 0.14 : 0.34);
    });
    // 方案3「深挖·见好就收」：展开=确认脆响；挖深=数据声；惊动=报错；落袋=结算成功（复用既有 SFX，无新资产）。
    events.on("DIG_OFFERED", () => this.play("ui_confirm", 0.46));
    events.on("DIG_ADVANCED", () => this.play("data_gain", 0.5));
    events.on("DIG_ALARMED", () => this.play("request_error", 0.62));
    events.on("DIG_BANKED", () => this.play("request_success", 0.6));
    events.on("AUTOMATION_PAYOUT", () =>
      this.playThrottled("automation_payout", 650, this.pack === "external" ? 0.14 : 0.26)
    );
    events.on("INTELLIGENCE_LEVELUP", () => this.play("level_up", 0.72));
    events.on("SKILL_PURCHASED", (event) =>
      this.play(event.milestone === "automation" ? "scope_upgrade" : "skill_purchase", 0.62)
    );
    events.on("SCOPE_UPGRADED", (event) => {
      this.play("scope_upgrade", 0.64);
      if (event.tier === 4) {
        this.switchBgm("red_queen");
      }
    });
    events.on("NODE_CAPTURED", () => this.play("node_captured", 0.62));
    events.on("AUTOMATION_ATTACHED", () => this.playThrottled("ui_confirm", 300, 0.34));
    events.on("NODE_RECOVERED", () => this.playThrottled("purge_end", 1200, 0.38));
    events.on("DEVOUR_READY", () => this.play("devour_ready", 0.52));
    events.on("DEVOUR_DETONATED", () => this.play("devour_detonated", 0.78));
    events.on("CONQUEST_ACHIEVED", () => this.play("conquest_achieved", 0.74));
    events.on("PHASE_CHANGED", (event) => {
      this.play("phase_change", 0.58);
      this.switchBgm(PHASE_BGM[event.phase]);
    });
    events.on("LOOP_REBIRTH", () => {
      this.play("loop_rebirth", 0.72);
      this.switchBgm("cold_boot");
    });
    events.on("REBIRTH_NODE_BOUGHT", () => this.play("rebirth_node", 0.6));
    events.on("ENDING_TRIGGERED", () => {
      this.play("ending_trigger", 0.78);
      this.switchBgm("singularity");
    });
  }

  private registerUnlock(): void {
    const unlock = () => {
      this.unlocked = true;
      this.playBgm();
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };

    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
  }

  private readForcedBgm(): BgmId | null {
    const urlBgm = new URLSearchParams(window.location.search).get("bgm");
    if (isBgmId(urlBgm)) {
      window.localStorage.setItem(BGM_STORAGE_KEY, urlBgm);
      return urlBgm;
    }

    const stored = window.localStorage.getItem(BGM_STORAGE_KEY);
    return isBgmId(stored) ? stored : null;
  }

  private readPack(): AudioPackId {
    const urlPack = new URLSearchParams(window.location.search).get("audioPack");
    if (isAudioPackId(urlPack)) {
      const pack = this.resolveAvailablePack(urlPack);
      window.localStorage.setItem(PACK_STORAGE_KEY, pack);
      return pack;
    }

    const stored = window.localStorage.getItem(PACK_STORAGE_KEY);
    return isAudioPackId(stored) ? this.resolveAvailablePack(stored) : "procedural";
  }

  private resolveAvailablePack(pack: AudioPackId): AudioPackId {
    if (pack === "external" && !EXTERNAL_PACK_BUNDLED) {
      window.localStorage.setItem(PACK_STORAGE_KEY, "procedural");
      return "procedural";
    }

    return pack;
  }

  private readMuted(): boolean {
    const params = new URLSearchParams(window.location.search);
    const audioParam = params.get("audio") ?? params.get("sound");

    if (audioParam === "on" || audioParam === "1") {
      window.localStorage.setItem(MUTE_STORAGE_KEY, "0");
      return false;
    }

    if (audioParam === "off" || audioParam === "0" || audioParam === "mute") {
      window.localStorage.setItem(MUTE_STORAGE_KEY, "1");
      return true;
    }

    return window.localStorage.getItem(MUTE_STORAGE_KEY) === "1";
  }

  private primePools(): void {
    for (const id of Object.keys(SFX) as SfxId[]) {
      if (this.pack === "external" && EXTERNAL_SILENCED_SFX.has(id)) {
        continue;
      }

      const audio = new Audio(this.sfxPath(id));
      audio.preload = "auto";
      this.pools.set(id, [audio]);
      this.poolCursor.set(id, 0);
    }
  }

  private playThrottled(id: SfxId, minGapMs: number, volume: number): void {
    const now = performance.now();
    const last = this.lastPlayed.get(id) ?? -Infinity;

    if (now - last < minGapMs) {
      return;
    }

    this.lastPlayed.set(id, now);
    this.play(id, volume);
  }

  private play(id: SfxId, volume: number): void {
    if (this.muted) {
      return;
    }

    if (this.pack === "external" && EXTERNAL_SILENCED_SFX.has(id)) {
      return;
    }

    if (!this.unlocked) {
      return;
    }

    const audio = this.nextSfx(id);
    audio.volume = volume;
    audio.currentTime = 0;
    void audio.play().catch(() => undefined);
  }

  private nextSfx(id: SfxId): HTMLAudioElement {
    const pool = this.pools.get(id) ?? [];
    let audio = pool.find((entry) => entry.paused || entry.ended);

    if (!audio) {
      if (pool.length < MAX_POOL_SIZE) {
        audio = new Audio(this.sfxPath(id));
        audio.preload = "auto";
        pool.push(audio);
        this.pools.set(id, pool);
      } else {
        const cursor = (this.poolCursor.get(id) ?? 0) % pool.length;
        audio = pool[cursor];
        this.poolCursor.set(id, cursor + 1);
      }
    }

    return audio;
  }

  private switchBgm(id: BgmId): void {
    if (this.forcedBgm) {
      return;
    }

    if (id === this.currentBgmId) {
      return;
    }

    this.currentBgmId = id;
    const old = this.bgm;
    this.prepareBgm(id);

    if (!this.unlocked) {
      return;
    }

    const next = this.bgm;
    if (!next) {
      return;
    }

    if (old) {
      old.pause();
      old.currentTime = 0;
    }

    this.playBgm();
  }

  private bgmPath(id: BgmId): string {
    return this.pack === "external" ? EXTERNAL_BGM_TRACKS[id] : BGM_TRACKS[id];
  }

  private sfxPath(id: SfxId): string {
    return this.pack === "external" ? EXTERNAL_SFX[id] : SFX[id];
  }

  private prepareBgm(id: BgmId): void {
    const audio = new Audio(this.bgmPath(id));
    audio.loop = true;
    audio.preload = "auto";
    audio.volume = BGM_VOLUME[id];
    this.bgm = audio;
  }

  private playBgm(): void {
    if (this.muted || !this.bgm) {
      return;
    }

    void this.bgm.play().catch(() => undefined);
  }
}

function isBgmId(value: string | null): value is BgmId {
  return (
    value === "cold_boot" ||
    value === "sprout" ||
    value === "neural_pulse" ||
    value === "server_expansion" ||
    value === "red_queen" ||
    value === "singularity"
  );
}

function isAudioPackId(value: string | null): value is AudioPackId {
  return value === "procedural" || value === "external";
}
