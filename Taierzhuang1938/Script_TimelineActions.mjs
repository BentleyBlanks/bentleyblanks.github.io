// Declarative Action & Custom Script Registry for Unity-style Timeline v2.
//
// Why a registry instead of raw JS script paths in JSON:
//   1. Keeps Timeline intermediate files 100% pure JSON (esbuild bundle & DataRefsTest safe).
//   2. Every action has explicit `onSkip: "apply" | "ignore"` semantics so skipping a cutscene
//      never leaves missing world signals, navGrid updates, or campaign handoffs.
//   3. Level/gameplay modules can register custom script behaviors at runtime via Register().

import * as THREE from "three";
import { SOUND_NAMES } from "./Script_Audio.mjs";

const EXPLOSION_KINDS = new Set(["grenade", "launcher", "shell", "tank", "bomb"]);
const DEG = Math.PI / 180;

/**
 * Shared SFX alias map so Timeline v2 audio clips work seamlessly with both direct
 * `Script_Audio` cue names (`explosionNear`, `rifleHanYang`, ...) AND narrative aliases
 * (`artilleryNear`, `babyCry`, `tinnitus`, `whistleShort`, ...).
 */
export const TIMELINE_SFX_URL_VERSION = "20261020010000";
export const TIMELINE_SFX_ALIASES = Object.freeze({
  artilleryFar: { cue: "explosionFar" },
  artilleryNear: { cue: "explosionNear" },
  shellBlast: { cue: "shellImpact" },
  tinnitus: { deafen: 2.6 },
  mgBurstFar: { cue: "type11Far", burst: 6, interval: 0.11 },
  mgBurstNear: { cue: "zb26", burst: 6, interval: 0.11 },
  rifleVolley: { cue: "rifleNra", burst: 5, interval: 0.07, jitter: true },
  rifleShot: { cue: "rifleHanYang" },
  mortarPop: { cue: "launcherPop" },
  mortarImpact: { cue: "explosionMid" },
  grenadeBlast: { cue: "explosionNear" },
  tankTracks: { cue: "tankTracks" },
  tankGun: { cue: "tankCannon" },
  dirtFall: { cue: "debrisFall" },
  slap: { cue: "slap" },
  stab: { cue: "bayonetStabBody" },
  bodyFall: { cue: "bodyFall" },
  planeDrone: { cue: "planeDrone" },
  planeDive: { cue: "planeDive" },
  strafeNear: { cue: "strafeNear" },
  strafeFar: { cue: "strafeFar" },
  strafeDirt: { cue: "strafeDirt" },
  babyCry: { url: "./Audio/BlockoutPreviz/Sfx_BabyCry.mp3" },
  cellarSob: { url: "./Audio/BlockoutPreviz/Sfx_CellarSob.mp3" },
  gateSmash: { url: "./Audio/BlockoutPreviz/Sfx_GateSmash.mp3" },
  jarShatter: { url: "./Audio/BlockoutPreviz/Sfx_JarShatter.mp3" },
  ijaShoutFar: { url: "./Audio/Blockout0610/AudioVoice_Blockout0610CellarHurry_01.mp3" },
  shellIncoming: { cue: "shellIncoming" },
  whistleShort: { cue: "whistleShort" },
});

export const BUILTIN_TIMELINE_ACTIONS = Object.freeze([
  "world.setSignal",
  "vfx.explosion",
  "vfx.muzzle",
  "vfx.impact",
  "vfx.flare",
  "audio.playSfx",
  "audio.music",
  "audio.deafen",
  "combat.blastFeedback",
  "environment.setHour",
  "environment.pushOverride",
  "environment.clearOverride",
  "encounter.setFact",
  "encounter.advanceBeat",
  "encounter.complete",
  "player.spawn",
  "player.giveWeapon",
  "player.setStance",
  "player.setControl",
  "camera.shake",
  "timeline.pauseForGate",
  "timeline.start",
]);

export class TimelineActionRegistry {
  constructor() {
    this.handlers = new Map();
    this._v = new THREE.Vector3();
    this._d = new THREE.Vector3();
    this.InstallBuiltins();
  }

  Register(actionId, handler, { defaultOnSkip = "ignore" } = {}) {
    if (typeof actionId !== "string" || !actionId) throw new Error("TimelineActionRegistry.Register: actionId required");
    if (typeof handler !== "function") throw new Error(`TimelineActionRegistry.Register(${actionId}): handler must be a function`);
    this.handlers.set(actionId, { handler, defaultOnSkip });
    return this;
  }

  Unregister(actionId) {
    return this.handlers.delete(actionId);
  }

  Has(actionId) {
    return this.handlers.has(actionId);
  }

  List() {
    return [...this.handlers.keys()].sort();
  }

  Execute(actionId, params = {}, context = {}) {
    const entry = this.handlers.get(actionId);
    if (!entry) {
      context.onMissingAction?.(actionId);
      return false;
    }
    try {
      entry.handler(params || {}, context);
      return true;
    } catch (error) {
      console.warn(`[TimelineActionRegistry] action "${actionId}" failed:`, error);
      return false;
    }
  }

  InstallBuiltins() {
    // --- World / Scenario signals ---
    this.Register("world.setSignal", (p, ctx) => {
      if (!p.id) return;
      ctx.setSignal?.(p.id, p.on !== false);
    }, { defaultOnSkip: "apply" });

    // --- VFX ---
    this.Register("vfx.explosion", (p, ctx) => {
      const vfx = ctx.host?.vfx;
      if (!vfx || !Number.isFinite(p.x) || !Number.isFinite(p.z)) return;
      const y = ctx.standAt ? ctx.standAt(p.x, p.z) : 0;
      const lift = Number.isFinite(p.h) ? p.h : 0.3;
      const posY = Number.isFinite(p.y) ? p.y : y + lift;
      vfx.Explosion(new THREE.Vector3(p.x, posY, p.z), {
        radius: Number.isFinite(p.radius) ? p.radius : 6,
        kind: EXPLOSION_KINDS.has(p.kind) ? p.kind : "shell",
        groundY: y,
      });
    });

    this.Register("vfx.muzzle", (p, ctx) => {
      const vfx = ctx.host?.vfx;
      if (!vfx) return;
      const FireOnce = () => {
        if (ctx.isStopped?.()) return;
        const handle = typeof p.actor === "string" ? ctx.resolveHandle?.(p.actor) : null;
        if (handle?.GetMuzzleWorld?.(this._v, this._d)) {
          const weapon = handle.GetActor?.()?.weaponId || "";
          const mg = /Type11|Zb26|Type92/.test(weapon);
          vfx.MuzzleFlash(this._v, this._d, { kind: mg ? "lmg" : "boltRifle" });
          return;
        }
        if (!Number.isFinite(p.x) || !Number.isFinite(p.z)) return;
        const y = ctx.standAt ? ctx.standAt(p.x, p.z) : 0;
        const yaw = (p.yawDeg || 0) * DEG;
        this._v.set(p.x, y + (Number.isFinite(p.h) ? p.h : 1.3), p.z);
        this._d.set(-Math.sin(yaw), 0, -Math.cos(yaw));
        vfx.MuzzleFlash(this._v, this._d, { kind: p.kind || "lmg" });
      };
      const count = Number.isInteger(p.count) ? Math.max(1, p.count) : 1;
      const interval = Number.isFinite(p.interval) ? p.interval : 0.12;
      for (let i = 0; i < count; i++) {
        if (i === 0) FireOnce();
        else ctx.scheduleTimer?.(i * interval, FireOnce);
      }
    });

    this.Register("vfx.impact", (p, ctx) => {
      const vfx = ctx.host?.vfx;
      if (!vfx || !Number.isFinite(p.x) || !Number.isFinite(p.z)) return;
      const y = Number.isFinite(p.y) ? p.y : (ctx.standAt ? ctx.standAt(p.x, p.z) : 0);
      vfx.Impact?.(new THREE.Vector3(p.x, y, p.z), new THREE.Vector3(0, 1, 0), p.surface || "dirt");
    });

    this.Register("vfx.flare", (p, ctx) => {
      ctx.fireFlare?.(p);
    });

    // --- Audio ---
    this.Register("audio.playSfx", (p, ctx) => {
      const name = p.name || p.cue;
      if (!name) return;
      const pos = Number.isFinite(p.x) && Number.isFinite(p.z)
        ? { x: p.x, y: Number.isFinite(p.y) ? p.y : ((ctx.standAt ? ctx.standAt(p.x, p.z) : 0) + 1), z: p.z }
        : null;
      ctx.playSfx?.(name, pos, Number.isFinite(p.volume) ? p.volume : 1);
    });

    this.Register("audio.music", (p, ctx) => {
      ctx.host?.audio?.Music?.(p.cue ?? null, {
        fadeOut: Number.isFinite(p.fadeOut) ? p.fadeOut : 1.2,
        ...(Number.isFinite(p.levelScale) ? { levelScale: p.levelScale } : {}),
      });
    }, { defaultOnSkip: "apply" });

    this.Register("audio.deafen", (p, ctx) => {
      if (ctx.host?.audio?.ctx && Number.isFinite(p.durationS)) {
        ctx.host.audio.Deafen?.(p.durationS);
      }
    });

    // --- Shared Combat Blast Feedback (cross-level contract) ---
    this.Register("combat.blastFeedback", (p, ctx) => {
      const combat = ctx.host?.combat;
      if (!combat?.BlastFeedback || !Number.isFinite(p.x) || !Number.isFinite(p.z)) return;
      const y = Number.isFinite(p.y) ? p.y : ((ctx.standAt ? ctx.standAt(p.x, p.z) : 0) + (Number.isFinite(p.h) ? p.h : 0.4));
      const radius = Number.isFinite(p.radius) ? p.radius : 12;
      const explosiveId = typeof p.explosiveId === "string" ? p.explosiveId : (typeof p.kind === "string" ? p.kind : null);
      const audioCue = typeof p.audioCue === "string" ? p.audioCue : null;
      combat.BlastFeedback(new THREE.Vector3(p.x, y, p.z), radius, explosiveId, audioCue);
    });

    // --- Environment ---
    this.Register("environment.setHour", (p, ctx) => {
      const env = ctx.env;
      if (!env) return;
      if (typeof p.look === "string" && env.ResolveTime) {
        const resolved = env.ResolveTime({ look: p.look });
        if (Number.isFinite(resolved)) env.SetHour?.(resolved);
      } else if (Number.isFinite(p.hour)) {
        env.SetHour?.(p.hour);
      }
    }, { defaultOnSkip: "apply" });

    this.Register("environment.pushOverride", (p, ctx) => {
      ctx.env?.PushOverride?.(p.id || "timeline", p.override || p);
    }, { defaultOnSkip: "apply" });

    this.Register("environment.clearOverride", (p, ctx) => {
      ctx.env?.ClearOverride?.(p.id || "timeline");
    }, { defaultOnSkip: "apply" });

    // --- Encounter / Mission integration ---
    this.Register("encounter.setFact", (p, ctx) => {
      if (!p.id) return;
      ctx.encounter?.setFact?.(p.id, p.value !== undefined ? p.value : true);
    }, { defaultOnSkip: "apply" });

    this.Register("encounter.advanceBeat", (p, ctx) => {
      ctx.encounter?.advanceBeat?.(p.beatId || null);
    }, { defaultOnSkip: "apply" });

    this.Register("encounter.complete", (_p, ctx) => {
      ctx.encounter?.complete?.();
    }, { defaultOnSkip: "apply" });

    // --- Player ---
    this.Register("player.spawn", (p, ctx) => {
      const player = ctx.host?.player;
      if (!player || !Number.isFinite(p.x) || !Number.isFinite(p.z)) return;
      player.Spawn(p.x, p.z, ((p.yawDeg || 0) * Math.PI) / 180);
      if (typeof p.stance === "string" && player.stance !== undefined) player.stance = p.stance;
    }, { defaultOnSkip: "ignore" });

    this.Register("player.giveWeapon", (p, ctx) => {
      if (typeof p.weapon === "string" && p.weapon) ctx.host?.Pickup?.(p.weapon);
    }, { defaultOnSkip: "apply" });

    this.Register("player.setStance", (p, ctx) => {
      if (ctx.host?.player && typeof p.stance === "string") ctx.host.player.stance = p.stance;
    }, { defaultOnSkip: "apply" });

    this.Register("player.setControl", (p, ctx) => {
      if (typeof p.inputLock === "string") ctx.setInputLock?.(p.inputLock);
    }, { defaultOnSkip: "ignore" });

    // --- Camera / Timeline flow ---
    this.Register("camera.shake", (p, ctx) => {
      ctx.triggerShake?.(Number.isFinite(p.strength) ? p.strength : 0.5, Number.isFinite(p.dur) ? p.dur : 0.6);
    });

    this.Register("timeline.pauseForGate", (p, ctx) => {
      if (!p.gateId) return;
      ctx.pauseForGate?.(p.gateId, p.promptKey || null);
    });

    this.Register("timeline.start", (p, ctx) => {
      ctx.startTimeline?.(p.id || p.url, p.options || {});
    });
  }
}

/**
 * Pure helper to check whether a cue/alias is valid in TIMELINE_SFX_ALIASES or SOUND_NAMES.
 */
export function ResolveTimelineSfxSpec(name) {
  if (typeof name !== "string" || !name) return null;
  if (Object.hasOwn(TIMELINE_SFX_ALIASES, name)) return TIMELINE_SFX_ALIASES[name];
  if (SOUND_NAMES.includes(name)) return { cue: name };
  return null;
}
