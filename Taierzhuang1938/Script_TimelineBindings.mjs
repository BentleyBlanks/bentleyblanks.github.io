// Unified Prefab Registry & Scene Binder for Unity-style Timeline v2.
//
// Thin facade over existing engine subsystems — does NOT rewrite ECS/Actor/XBot:
//   - TimelinePrefabRegistry: spawns ephemeral prefabs (`Cast/*`, `Soldier/*`, `Officer/*`,
//     `Civilian/*`, `Vehicle/*`, `Litter/*`, `Animal/*`, `Prop/*`, `Whitebox/Box`, `Aircraft/*`)
//     returning a uniform `PlayableHandle`.
//   - TimelineSceneBinder: resolves `bindings[]` against live scene entities (AI soldiers via
//     `SOLDIER_TAGS.timelineControlled` Possess/Release, puppets, tanks, dynamic `bindId`
//     scene objects, player, camera) and applies `onMissing: "spawnFallback" | "skip" | "error"`.

import * as THREE from "three";
import { FIRST_LEVEL_SPEAKING_CAST } from "./Data_FirstLevelSpeakingCast.mjs";
import { InstantiateExternalProp } from "./Script_ExternalProps.mjs";
import { MarkDynamicPrepass } from "./Script_RenderTags.mjs";

const DEG = Math.PI / 180;

const BUILTIN_PREFAB_PREFIXES = Object.freeze([
  "Cast/", "Soldier/", "Officer/", "Civilian/", "Vehicle/", "Litter/", "Animal/", "Prop/", "Aircraft/", "Whitebox/",
]);

export function IsKnownBuiltinPrefab(prefabId) {
  if (typeof prefabId !== "string" || !prefabId) return false;
  return BUILTIN_PREFAB_PREFIXES.some((prefix) => prefabId.startsWith(prefix));
}

function DefaultSideForCast(castId) {
  const row = FIRST_LEVEL_SPEAKING_CAST[castId];
  if (!row) return { side: "nra", kind: "soldier" };
  if (row.actorKind === "ija") return { side: "ija", kind: "soldier" };
  if (row.actorKind === "ijaOfficer") return { side: "ija", kind: "officer" };
  if (row.actorKind === "nraOfficer") return { side: "nra", kind: "officer" };
  if (row.actorKind === "civilian") return { side: "civ", kind: "civilian" };
  if (row.actorKind === "child") return { side: "civ", kind: "child" };
  return { side: "nra", kind: "soldier" };
}

export function BuildPuppetUnitFromPrefab(id, prefabId, init = {}) {
  const base = {
    id,
    x: 0,
    z: 0,
    yawDeg: 0,
    side: "nra",
    kind: "soldier",
    stance: "stand",
    state: "alive",
    aim: false,
    ...init,
  };
  if (prefabId.startsWith("Cast/")) {
    const castId = prefabId.slice(5);
    const defaults = DefaultSideForCast(castId);
    base.castId = castId;
    if (!init.side) base.side = defaults.side;
    if (!init.kind) base.kind = defaults.kind;
    if (init.weapon === undefined) {
      base.weapon = base.side === "civ" || castId === "interpreter" || castId === "comrade"
        ? null
        : (base.side === "ija" ? "Type38" : "HanYang");
    }
  } else if (prefabId.startsWith("Soldier/")) {
    const side = prefabId.slice(8);
    base.side = side === "ija" ? "ija" : "nra";
    base.kind = "soldier";
    if (init.weapon === undefined) base.weapon = base.side === "ija" ? "Type38" : "HanYang";
  } else if (prefabId.startsWith("Officer/")) {
    const side = prefabId.slice(8);
    base.side = side === "ija" ? "ija" : "nra";
    base.kind = "officer";
    if (init.weapon === undefined) base.weapon = base.side === "ija" ? "Type14" : "MauserC96";
  } else if (prefabId === "Civilian/Child") {
    base.side = "civ"; base.kind = "child"; base.weapon = null;
  } else if (prefabId.startsWith("Civilian/")) {
    base.side = "civ"; base.kind = "civilian"; base.weapon = null;
  } else if (prefabId === "Vehicle/Type94Tankette") {
    base.side = "ija"; base.kind = "tank"; base.shape = "tankette"; base.weapon = null;
  } else if (prefabId === "Vehicle/Type89Tank") {
    base.side = "ija"; base.kind = "tank"; base.shape = "tank"; base.weapon = null;
  } else if (prefabId === "Vehicle/DraftCart") {
    base.side = "civ"; base.kind = "cart"; base.weapon = null;
  } else if (prefabId === "Litter/Blanket") {
    base.side = "nra"; base.kind = "litter"; base.name = init.name || "单被"; base.weapon = null;
  } else if (prefabId === "Litter/Stretcher") {
    base.side = "nra"; base.kind = "litter"; base.name = init.name || "担架"; base.weapon = null;
  } else if (prefabId === "Animal/Ox") {
    base.side = "civ"; base.kind = "animal"; base.draft = "ox"; base.weapon = null;
  } else if (prefabId.startsWith("Animal/")) {
    base.side = "civ"; base.kind = "animal"; base.draft = "horse"; base.weapon = null;
  }
  return base;
}

// ---------------------------------------------------------------------------
// PlayableHandle Factories (Live & Spawned)

export function CreatePuppetHandle({ slot, puppetId, puppets, owned = true, prefabId = null, source = "spawn" }) {
  const facialSaved = new WeakMap();
  return {
    slot,
    kind: "puppet",
    source,
    owned,
    prefabId,
    puppetId,
    SetTransform(pose) {
      puppets.Drive(puppetId, {
        x: pose.x,
        z: pose.z,
        yawDeg: pose.yawDeg ?? 0,
        stance: "stand",
        state: "alive",
        visible: pose.visible !== false,
        moving: !!pose.moving,
        speed: pose.speed || 0,
      });
    },
    SetAnimation(state) {
      puppets.Drive(puppetId, state);
    },
    SetVisible(visible) {
      const p = puppets.Get?.(puppetId);
      if (p) p.visible = !!visible;
    },
    SetFacialSource(fn) {
      const p = puppets.Get?.(puppetId);
      for (const h of p?.humans || []) {
        const facial = h.actor?.characterRig?.facial;
        if (!facial) continue;
        if (!facialSaved.has(facial)) facialSaved.set(facial, facial.source ?? null);
        facial.source = fn;
      }
    },
    GetWorldPosition(out = new THREE.Vector3()) {
      const p = puppets.Get?.(puppetId);
      if (!p) return null;
      const actor = p.humans?.[0]?.actor;
      if (actor?.root) return actor.root.getWorldPosition(out);
      return out.set(p.x ?? 0, puppets.groundAt ? puppets.groundAt(p.x ?? 0, p.z ?? 0) : 0, p.z ?? 0);
    },
    GetMuzzleWorld(posOut = new THREE.Vector3(), dirOut = new THREE.Vector3()) {
      const p = puppets.Get?.(puppetId);
      const actor = p?.humans?.[0]?.actor;
      if (actor?.MuzzleWorld && p.visible !== false) {
        actor.MuzzleWorld(posOut);
        actor.MuzzleDirection?.(dirOut);
        return true;
      }
      return false;
    },
    GetActor() {
      return puppets.Get?.(puppetId)?.humans?.[0]?.actor || null;
    },
    Release() {
      const p = puppets.Get?.(puppetId);
      for (const h of p?.humans || []) {
        const facial = h.actor?.characterRig?.facial;
        if (facial && facialSaved.has(facial)) facial.source = facialSaved.get(facial);
      }
      if (owned) puppets.ReleaseDriveFor?.(puppetId);
      else if (p) p.drive = null;
    },
  };
}

/**
 * Possess a live AI Soldier (`host.ai.soldiers` / `EncounterPlay.entries`) without destroying
 * or duplicating it. Sets `SOLDIER_TAGS.timelineControlled` so AI skips Think/Act/Separation
 * while keeping physics capsule synced, then releases control seamlessly on cutscene end.
 */
export function CreateLiveSoldierHandle({ slot, soldier, ai, groundAt, openingLib = null }) {
  const prevControlled = soldier.HasTag ? soldier.HasTag("timelineControlled") : false;
  const prevUntargetable = soldier.HasTag ? soldier.HasTag("untargetable") : false;
  const prevWeapon = soldier.actor?.weaponId ?? soldier.weaponId ?? null;
  const facial = soldier.actor?.characterRig?.facial || null;
  const prevFacialSource = facial ? facial.source ?? null : null;
  let released = false;
  let lastT = 0;

  // Possess immediately
  soldier.SetTag?.("timelineControlled", true);
  soldier.SetTag?.("untargetable", true);
  if (soldier.velocity) soldier.velocity.set(0, 0, 0);

  const ApplyPose = (x, y, z, yawDeg, stance, state, visible, clip, clipT, weapon, moving, speed, aim, dt) => {
    const gy = Number.isFinite(y) ? y : (groundAt ? groundAt(x, z) : soldier.position.y);
    const yawRad = (yawDeg || 0) * DEG;
    const stanceCode = stance === "prone" ? 2 : stance === "crouch" ? 1 : 0;
    const crouchBlend = stance === "crouch" ? 1 : 0;
    const proneBlend = stance === "prone" ? 1 : 0;
    const moveSpeed = moving ? (speed || 1.4) : 0;
    const aimBlend = aim ? 1 : 0;
    if (typeof soldier.ApplyTimelinePose === "function") {
      soldier.ApplyTimelinePose({
        x, y: gy, z, yaw: yawRad,
        stance: stanceCode, crouchBlend, proneBlend, moveSpeed, aimBlend,
      });
    } else {
      soldier.position?.set?.(x, gy, z);
      soldier.body?.Teleport?.(x, gy, z);
    }

    if (weapon !== undefined && weapon !== soldier.actor?.weaponId) {
      soldier.actor?.SetWeapon?.(weapon);
    }

    const skin = ai?.view?.skins?.get?.(soldier) || null;
    if (soldier.actor?.root) {
      soldier.actor.root.visible = visible !== false;
      soldier.actor.root.position.set(x, gy, z);
      soldier.actor.root.rotation.y = yawRad;
    }
    if (skin?.root) skin.root.visible = visible !== false;

    const animState = {
      moveSpeed,
      aim: aimBlend,
      crouch: crouchBlend,
      prone: proneBlend,
      grounded: true,
      dead: state === "down" || state === "dead",
      dying: state === "down" || state === "dead" ? 1 : 0,
      elapsed: ai?.time ?? lastT,
      lookYaw: 0,
      lookPitch: 0,
      ...(clip ? { clip, clipTime: clipT ?? 0 } : {}),
    };
    const stepDt = Math.max(0, Math.min(0.1, dt || 1 / 60));
    lastT += stepDt;
    if (ai?.view) {
      ai.view.Place(soldier);
      ai.view.Animate(soldier, stepDt, animState);
    } else if (soldier.actor) {
      soldier.actor.Update(stepDt, animState);
    }
  };

  return {
    slot,
    kind: "actor",
    source: "live",
    owned: false,
    soldier,
    soldierId: soldier.id,
    SetTransform(pose, dt) {
      ApplyPose(
        pose.x ?? soldier.position.x,
        pose.y,
        pose.z ?? soldier.position.z,
        pose.yawDeg ?? (soldier.yaw / DEG),
        "stand", "alive", pose.visible !== false,
        null, 0, undefined, !!pose.moving, pose.speed || 0, false, dt,
      );
    },
    SetAnimation(state, dt) {
      ApplyPose(
        state.x ?? soldier.position.x,
        state.y,
        state.z ?? soldier.position.z,
        state.yawDeg ?? (soldier.yaw / DEG),
        state.stance || "stand",
        state.state || "alive",
        state.visible !== false,
        state.clip || null,
        state.clipSeconds ?? state.clipT ?? 0,
        state.weapon,
        !!state.moving,
        state.speed || 0,
        !!state.aim,
        dt,
      );
    },
    SetVisible(visible) {
      if (soldier.actor?.root) soldier.actor.root.visible = !!visible;
      const skin = ai?.view?.skins?.get?.(soldier);
      if (skin?.root) skin.root.visible = !!visible;
    },
    SetFacialSource(fn) {
      if (facial) facial.source = fn;
    },
    GetWorldPosition(out = new THREE.Vector3()) {
      return out.copy(soldier.position);
    },
    GetMuzzleWorld(posOut = new THREE.Vector3(), dirOut = new THREE.Vector3()) {
      if (soldier.actor?.MuzzleWorld) {
        soldier.actor.MuzzleWorld(posOut);
        soldier.actor.MuzzleDirection?.(dirOut);
        return true;
      }
      return false;
    },
    GetActor() {
      return soldier.actor || null;
    },
    Release() {
      if (released) return;
      released = true;
      soldier.SetTag?.("timelineControlled", prevControlled);
      soldier.SetTag?.("untargetable", prevUntargetable);
      if (facial) facial.source = prevFacialSource;
      if (prevWeapon !== null && soldier.actor?.weaponId !== prevWeapon) {
        soldier.actor?.SetWeapon?.(prevWeapon);
      }
      if (soldier.actor?.root) soldier.actor.root.visible = true;
      const skin = ai?.view?.skins?.get?.(soldier);
      if (skin?.root) skin.root.visible = true;
    },
  };
}

export function CreateSceneObjectHandle({ slot, bindId, battlefield, restoreOnRelease = false }) {
  return {
    slot,
    kind: "sceneObject",
    source: "live",
    owned: false,
    bindId,
    SetTransform(pose) {
      battlefield.SetBindableTransform(bindId, {
        x: pose.x,
        y: pose.y,
        z: pose.z,
        rx: (pose.pitchDeg || 0) * DEG,
        ry: (pose.yawDeg || 0) * DEG,
        rz: (pose.rollDeg || 0) * DEG,
        sx: pose.sx ?? 1,
        sy: pose.sy ?? 1,
        sz: pose.sz ?? 1,
        visible: pose.visible,
      });
    },
    SetAnimation(state) {
      battlefield.SetBindableTransform(bindId, {
        x: state.x,
        y: state.y,
        z: state.z,
        ry: (state.yawDeg || 0) * DEG,
        visible: state.visible,
      });
    },
    SetVisible(visible) {
      battlefield.SetBindableVisible(bindId, !!visible);
    },
    SetFacialSource() {},
    GetWorldPosition(out = new THREE.Vector3()) {
      const entry = battlefield.GetBindable(bindId);
      if (!entry) return null;
      if (entry.mesh) return entry.mesh.getWorldPosition(out);
      return out.set(entry.basePos.x, entry.basePos.y, entry.basePos.z);
    },
    GetMuzzleWorld() { return false; },
    GetActor() { return null; },
    Release() {
      if (restoreOnRelease) battlefield.ResetBindable(bindId);
    },
  };
}

export function CreatePropHandle({ slot, prefabId, root, scene, groundAt }) {
  return {
    slot,
    kind: "prop",
    source: "spawn",
    owned: true,
    prefabId,
    root,
    SetTransform(pose) {
      const y = Number.isFinite(pose.y) ? pose.y : (groundAt ? groundAt(pose.x ?? 0, pose.z ?? 0) : 0);
      root.position.set(pose.x ?? 0, y, pose.z ?? 0);
      root.rotation.set((pose.pitchDeg || 0) * DEG, (pose.yawDeg || 0) * DEG, (pose.rollDeg || 0) * DEG, "YXZ");
      root.scale.set(pose.sx ?? 1, pose.sy ?? 1, pose.sz ?? 1);
      root.visible = pose.visible !== false;
    },
    SetAnimation(state) {
      const y = Number.isFinite(state.y) ? state.y : (groundAt ? groundAt(state.x ?? 0, state.z ?? 0) : 0);
      root.position.set(state.x ?? 0, y, state.z ?? 0);
      root.rotation.set(0, (state.yawDeg || 0) * DEG, 0);
      root.visible = state.visible !== false;
    },
    SetVisible(visible) { root.visible = !!visible; },
    SetFacialSource() {},
    GetWorldPosition(out = new THREE.Vector3()) { return root.getWorldPosition(out); },
    GetMuzzleWorld() { return false; },
    GetActor() { return null; },
    Release() {
      scene?.remove(root);
      root.traverse?.((o) => {
        if (o.userData?.timelineOwnedGeometry) o.geometry?.dispose?.();
        if (o.userData?.timelineOwnedMaterial) o.material?.dispose?.();
      });
    },
  };
}

export function CreatePlayerHandle({ slot, player }) {
  return {
    slot,
    kind: "player",
    source: "live",
    owned: false,
    SetTransform(pose) {
      if (Number.isFinite(pose.x) && Number.isFinite(pose.z)) {
        player.Spawn?.(pose.x, pose.z, (pose.yawDeg || 0) * DEG);
      }
    },
    SetAnimation(state) {
      if (Number.isFinite(state.x) && Number.isFinite(state.z)) {
        player.Spawn?.(state.x, state.z, (state.yawDeg || 0) * DEG);
      }
    },
    SetVisible() {},
    SetFacialSource() {},
    GetWorldPosition(out = new THREE.Vector3()) {
      return player?.position ? out.copy(player.position) : null;
    },
    GetMuzzleWorld() { return false; },
    GetActor() { return null; },
    Release() {},
  };
}

// ---------------------------------------------------------------------------
// Prefab Registry

export class TimelinePrefabRegistry {
  constructor() {
    this.custom = new Map();
  }

  Register(prefabId, factory) {
    if (typeof prefabId !== "string" || !prefabId) throw new Error("TimelinePrefabRegistry.Register: prefabId required");
    if (typeof factory !== "function") throw new Error(`TimelinePrefabRegistry.Register(${prefabId}): factory required`);
    this.custom.set(prefabId, factory);
    return this;
  }

  Has(prefabId) {
    return this.custom.has(prefabId) || IsKnownBuiltinPrefab(prefabId);
  }

  Spawn({ slot, prefabId, init = {}, directorId = "tl", resolver, camPos = null, source = "spawn" }) {
    if (this.custom.has(prefabId)) {
      return this.custom.get(prefabId)({ slot, prefabId, init, directorId, resolver, camPos, source });
    }
    if (prefabId.startsWith("Prop/")) {
      const modelId = prefabId.slice(5);
      const root = new THREE.Group();
      root.name = `TimelineProp_${directorId}_${slot}`;
      const mesh = InstantiateExternalProp?.(modelId, resolver.library);
      if (mesh) {
        mesh.traverse?.((o) => { if (o.isMesh) MarkDynamicPrepass(o); });
        root.add(mesh);
      } else {
        const size = init.size || [0.6, 0.4, 0.5];
        const geo = new THREE.BoxGeometry(size[0], size[1], size[2]);
        const mat = new THREE.MeshStandardMaterial({ color: 0x8e867a, roughness: 0.85 });
        const box = new THREE.Mesh(geo, mat);
        box.position.y = size[1] * 0.5;
        box.userData.timelineOwnedGeometry = true;
        box.userData.timelineOwnedMaterial = true;
        MarkDynamicPrepass(box);
        root.add(box);
      }
      resolver.scene?.add(root);
      const handle = CreatePropHandle({ slot, prefabId, root, scene: resolver.scene, groundAt: resolver.groundAt });
      if (Number.isFinite(init.x) && Number.isFinite(init.z)) handle.SetTransform(init);
      return handle;
    }
    if (prefabId === "Whitebox/Box") {
      const size = init.size || [1, 1, 1];
      const geo = new THREE.BoxGeometry(size[0], size[1], size[2]);
      const mat = new THREE.MeshStandardMaterial({ color: init.color ?? 0x909397, roughness: 0.9 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.timelineOwnedGeometry = true;
      mesh.userData.timelineOwnedMaterial = true;
      MarkDynamicPrepass(mesh);
      const root = new THREE.Group();
      root.name = `TimelineBox_${directorId}_${slot}`;
      mesh.position.y = size[1] * 0.5;
      root.add(mesh);
      resolver.scene?.add(root);
      const handle = CreatePropHandle({ slot, prefabId, root, scene: resolver.scene, groundAt: resolver.groundAt });
      if (Number.isFinite(init.x) && Number.isFinite(init.z)) handle.SetTransform(init);
      return handle;
    }
    if (prefabId.startsWith("Aircraft/")) {
      // Aircraft tracks are driven by the director's Aircraft subsystem; expose a lightweight marker handle.
      return {
        slot, kind: "aircraft", source, owned: true, prefabId,
        SetTransform() {}, SetAnimation() {}, SetVisible() {}, SetFacialSource() {},
        GetWorldPosition() { return null; }, GetMuzzleWorld() { return false; }, GetActor() { return null; },
        Release() {},
      };
    }
    if (!resolver.puppets) {
      throw new Error(`TimelinePrefabRegistry: cannot spawn "${prefabId}" for slot "${slot}" without puppets subsystem`);
    }
    const puppetId = `__tl_${directorId}_${slot}`;
    const unit = BuildPuppetUnitFromPrefab(puppetId, prefabId, init);
    resolver.puppets.Spawn(unit, camPos);
    return CreatePuppetHandle({ slot, puppetId, puppets: resolver.puppets, owned: true, prefabId, source });
  }
}

// ---------------------------------------------------------------------------
// Scene Binder (Live Possession + Fallback Prefab Resolution)

export class TimelineSceneBinder {
  constructor({ resolver, prefabs }) {
    this.resolver = resolver || {};
    this.prefabs = prefabs || new TimelinePrefabRegistry();
    this.handles = new Map(); // slot -> PlayableHandle
    this.report = [];         // binding resolution diagnostics
  }

  ResolveAll(doc, { directorId = "tl", camPos = null, openingLib = null, forceFallback = false } = {}) {
    this.ReleaseAll();
    const r = this.resolver;

    for (const b of doc.bindings || []) {
      const slot = b.slot;
      const match = b.match || { id: slot };
      let handle = null;

      if (b.type === "camera") {
        const cam = r.getCamera?.();
        if (cam) {
          handle = {
            slot, kind: "camera", source: "live", owned: false, camera: cam,
            SetTransform() {}, SetAnimation() {}, SetVisible() {}, SetFacialSource() {},
            GetWorldPosition(out = new THREE.Vector3()) { return cam.getWorldPosition(out); },
            GetMuzzleWorld() { return false; }, GetActor() { return null; }, Release() {},
          };
        }
      } else if (b.type === "player") {
        const player = r.getPlayer?.();
        if (player) handle = CreatePlayerHandle({ slot, player });
      } else if (!forceFallback && b.type === "sceneObject") {
        const bindId = match.bindId || match.id || slot;
        if (r.battlefield?.GetBindable?.(bindId)) {
          handle = CreateSceneObjectHandle({
            slot, bindId, battlefield: r.battlefield, restoreOnRelease: b.restoreOnRelease === true,
          });
        }
      } else if (!forceFallback && (b.type === "actor" || b.type === "puppet" || b.type === "tank")) {
        // Priority 1: live AI soldier (possess without duplicate!)
        const liveSoldier = b.type === "actor" ? r.findLiveSoldier?.(match, slot) : null;
        if (liveSoldier && liveSoldier.alive) {
          handle = CreateLiveSoldierHandle({
            slot, soldier: liveSoldier, ai: r.ai, groundAt: r.groundAt, openingLib,
          });
        } else {
          // Priority 2: existing puppet in scene
          const existingPuppetId = r.findPuppetId?.(match, slot);
          if (existingPuppetId && r.puppets?.Get?.(existingPuppetId)) {
            handle = CreatePuppetHandle({
              slot, puppetId: existingPuppetId, puppets: r.puppets, owned: false, source: "live",
            });
          }
        }
      }

      if (handle) {
        this.handles.set(slot, handle);
        this.report.push({ slot, type: b.type, status: "bound", source: handle.source });
        continue;
      }

      const policy = b.onMissing || "spawnFallback";
      if (policy === "spawnFallback" && b.fallbackPrefab) {
        const spawned = this.prefabs.Spawn({
          slot, prefabId: b.fallbackPrefab, init: b.init || {}, directorId, resolver: r, camPos, source: "fallback",
        });
        this.handles.set(slot, spawned);
        this.report.push({ slot, type: b.type, status: "fallback", prefab: b.fallbackPrefab });
      } else if (policy === "skip") {
        this.report.push({ slot, type: b.type, status: "skipped" });
      } else if (b.type === "camera" && !r.getCamera?.()) {
        this.report.push({ slot, type: b.type, status: "skipped" });
      } else {
        throw new Error(`TimelineSceneBinder: missing binding "${slot}" (type=${b.type}, onMissing=${policy})`);
      }
    }

    for (const s of doc.spawns || []) {
      const spawned = this.prefabs.Spawn({
        slot: s.slot, prefabId: s.prefab, init: s.init || {}, directorId, resolver: r, camPos, source: "spawn",
      });
      this.handles.set(s.slot, spawned);
      this.report.push({ slot: s.slot, type: s.type || "prefab", status: "spawned", prefab: s.prefab });
    }

    return this.report;
  }

  Get(slot) {
    return this.handles.get(slot) || null;
  }

  ReleaseAll() {
    for (const handle of this.handles.values()) {
      try { handle.Release?.(); } catch (error) { console.warn("[TimelineSceneBinder] release failed:", error); }
    }
    this.handles.clear();
    this.report = [];
  }
}
