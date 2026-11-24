// Refactored explosion test range orchestration:
//   · Uncluttered arena driven by the left-side UI control panel (Script_ExplosionRangeLab)
//   · Houses the special pull-cord cookable wooden-handle grenade (Script_TimedGrenade)
//   · On-demand enemy grenade-evade squad, optional sandbag cover, single tank pad,
//     artillery barrage, Ki-30 airstrike, return-grenade drill, and crater patrols.
// Throws, fuses, shell collision, damage, AI evade, and terrain deformation all run the real game systems.
import * as THREE from "three";
import { WEAPONS } from "./Data_Weapons.mjs";
import { T } from "./Script_Text.mjs";
import { Mulberry32 } from "./Script_Noise.mjs";
import { TimedStickGrenade } from "./Script_TimedGrenade.mjs";
import { ExplosionRangeLab } from "./Script_ExplosionRangeLab.mjs";
import {
  EXPLOSION_SPAWN, EXPLOSION_GRENADES, EXPLOSION_VEHICLES, EXPLOSION_VEHICLE_PAD,
  EXPLOSION_BARRAGE, EXPLOSION_AIRSTRIKE, EXPLOSION_PATROL,
  EXPLOSION_ENEMY_DISTANCES, EXPLOSION_ENEMY_MODES, EXPLOSION_ENEMY_OFFSETS,
} from "./Data_ExplosionRange.mjs";

export class ExplosionRange {
  constructor(host) {
    this.host = host;
    Object.assign(this, {
      battlefield: host.battlefield,
      combat: host.combat,
      interact: host.interact,
      player: host.player,
      ai: host.ai,
      hud: host.hud,
      aircraft: host.aircraft,
      vfx: host.vfx,
      audio: host.audio,
      viewmodel: host.viewmodel,
      state: host.state,
      GiveGrenade: host.GiveGrenade,
    });
    this.random = Mulberry32(19380317);
    this.barrage = null;
    this.launches = [];
    this.airstrike = null;
    this.airDrops = [];
    this.activeVehicle = null;
    this.shots = Object.fromEntries(EXPLOSION_VEHICLES.map((s) => [s.id, 0]));
    this.recoils = new Map();
    this.pickups = {};

    this.enemyMode = "evadeHold"; // "evadeHold" | "evadeFire" | "static"
    this.enemyDistanceM = 22;
    this.coverWall = false;
    this.enemies = [];
    this.enemyReport = { spawned: 0, alive: 0, killed: 0, evaded: 0 };

    this.patrolsEnabled = false;
    this.patrols = [];
    this.paintAccum = 0;

    this.timed = new TimedStickGrenade({
      battlefield: this.battlefield,
      combat: this.combat,
      player: this.player,
      camera: host.camera,
      scene: host.scene,
      library: host.library,
      vfx: this.vfx,
      audio: this.audio,
      hud: this.hud,
      viewmodel: this.viewmodel,
      state: this.state,
      ctx: host.ctx,
      CanUse: host.CanUse,
      OnDetonate: (record) => this._OnTimedDetonate(record),
    });

    this.lab = new ExplosionRangeLab(this);

    // 默认干净开场：无堆叠战车/飞机，正前方 22 m 布置一组可真实躲雷的日军靶兵，手握特制拉线木柄手榴弹
    this.SpawnEnemies();
    this.timed.Equip();
    this.PaintPanel();

    this.api = {
      State: () => this.State(),
      GoTo: (id) => this.GoTo(id),
      Reset: () => this.Reset(),
      EquipTimed: () => this.SelectLoadout("timed"),
      SelectLoadout: (mode) => this.SelectLoadout(mode),
      SetFuseDuration: (s) => this.SetFuseDuration(s),
      SetShowTimer: (on) => this.SetShowTimer(on),
      SetOvercookExplodes: (on) => this.SetOvercookExplodes(on),
      BeginPull: (mode) => this.timed.BeginPull(mode),
      RequestThrow: (power) => this.timed.RequestThrow(power),
      SpawnEnemies: () => this.SpawnEnemies(),
      ClearEnemies: () => this.ClearEnemies(),
      SetEnemyMode: (mode) => this.SetEnemyMode(mode),
      SetEnemyDistance: (m) => this.SetEnemyDistance(m),
      SetCoverWall: (on) => this.SetCoverWall(on),
      SetPatrols: (on) => this.SetPatrols(on),
      SetVehicle: (id) => this.SetVehicle(id),
      FireVehicle: (id) => this.FireVehicle(id),
      StartBarrage: () => this.StartBarrage(),
      StartAirstrike: () => this.StartAirstrike(),
      ThrowPracticeGrenade: () => this.ThrowPracticeGrenade(),
      RefillThrowables: () => this.RefillThrowables(),
    };
  }

  // -------------------------------------------------------------------------
  // 武器与特制拉线木柄弹调度
  // -------------------------------------------------------------------------

  SelectLoadout(mode) {
    if (mode === "timed") {
      this.timed.Equip();
      this.hud?.Hint?.(T("range.explosion.timed.hintEquip"), 3.2);
      this.PaintPanel();
      return true;
    }
    if (this.timed.Lit) return false;
    this.timed.Stow({ force: true });
    if (mode === "grenade") {
      this.GiveGrenade?.("Grenade");
      if (this.state) this.state.grenades = Math.max(this.state.grenades, 12);
      this.pickups.Grenade = (this.pickups.Grenade || 0) + 1;
      if (this.host.ctx?.ActivateSlot) this.host.ctx.ActivateSlot("throwable");
      else this.viewmodel?.Equip("Grenade", 0, { instant: true });
      this.hud?.Hint?.(T("range.explosion.pickupHint", { name: WEAPONS.Grenade.name, key: "G" }), 2.8);
    } else if (mode === "bundle") {
      this.GiveGrenade?.("GrenadeBundle");
      if (this.state) this.state.bundles = Math.max(this.state.bundles, 6);
      this.pickups.GrenadeBundle = (this.pickups.GrenadeBundle || 0) + 1;
      if (this.host.ctx?.ActivateSlot) this.host.ctx.ActivateSlot("throwable");
      else this.viewmodel?.Equip("GrenadeBundle", 0, { instant: true });
      this.hud?.Hint?.(T("range.explosion.pickupHint", { name: WEAPONS.GrenadeBundle.name, key: "H" }), 2.8);
    } else if (mode === "rifle") {
      this.host.ctx?.ActivateSlot?.("primary");
    }
    this.PaintPanel();
    return true;
  }

  RefillThrowables() {
    if (this.state) {
      this.state.grenades = Math.max(this.state.grenades, 24);
      this.state.bundles = Math.max(this.state.bundles, 6);
    }
    this.PaintPanel();
    return true;
  }

  SetFuseDuration(seconds) {
    const v = this.timed.SetFuseDuration(seconds);
    this.PaintPanel();
    return v;
  }

  SetShowTimer(on) {
    const v = this.timed.SetShowTimer(on);
    this.PaintPanel();
    return v;
  }

  SetOvercookExplodes(on) {
    const v = this.timed.SetOvercookExplodes(on);
    this.PaintPanel();
    return v;
  }

  // -------------------------------------------------------------------------
  // 日军躲雷试爆靶组与掩体
  // -------------------------------------------------------------------------

  SpawnEnemies() {
    this.ClearEnemies();
    const cx = EXPLOSION_SPAWN.x;
    const cz = EXPLOSION_SPAWN.z - this.enemyDistanceM;
    const isStatic = this.enemyMode === "static";
    const holdFire = this.enemyMode !== "evadeFire";
    for (let i = 0; i < EXPLOSION_ENEMY_OFFSETS.length; i += 1) {
      const [dx, dz] = EXPLOSION_ENEMY_OFFSETS[i];
      const x = cx + dx, z = cz + dz;
      const s = this.ai.Spawn("ija", x, z, {
        weapon: "Type38",
        squadId: "ExplosionEnemyTargets",
      });
      if (!s) continue;
      // 面向南方（玩家方向 yaw = Math.PI），守点且默认停火但保留完整躲雷 AI
      this.ai.ConfigureRangeTarget(s, {
        holdZone: { id: `ExplosionTarget_${i}`, x, z, radius: 1.6 },
        defensive: true,
        holdFire,
        dummy: isStatic,
        yaw: Math.PI,
      });
      this.enemies.push({ soldier: s, originX: x, originZ: z, evaded: false });
    }
    this._SyncCoverWall();
    this._RefreshEnemyReport();
    this.PaintPanel();
    return this.enemies.length;
  }

  ClearEnemies() {
    for (const entry of this.enemies) {
      if (entry.soldier) this.ai.Remove(entry.soldier);
    }
    this.enemies.length = 0;
    this._RefreshEnemyReport();
    this.PaintPanel();
    return true;
  }

  SetEnemyMode(mode) {
    if (!EXPLOSION_ENEMY_MODES.includes(mode)) return this.enemyMode;
    this.enemyMode = mode;
    if (this.enemies.length) this.SpawnEnemies();
    else this.PaintPanel();
    return this.enemyMode;
  }

  SetEnemyDistance(meters) {
    const next = Number(meters);
    if (!EXPLOSION_ENEMY_DISTANCES.includes(next)) return this.enemyDistanceM;
    this.enemyDistanceM = next;
    this._SyncCoverWall();
    if (this.enemies.length) this.SpawnEnemies();
    else this.PaintPanel();
    return this.enemyDistanceM;
  }

  SetCoverWall(on) {
    this.coverWall = on === undefined ? !this.coverWall : !!on;
    this._SyncCoverWall();
    this.PaintPanel();
    return this.coverWall;
  }

  _SyncCoverWall() {
    const zPos = EXPLOSION_SPAWN.z - this.enemyDistanceM + 1.85;
    this.battlefield.SetCoverWall?.(this.coverWall, zPos);
  }

  _RefreshEnemyReport() {
    let alive = 0, evaded = 0;
    for (const entry of this.enemies) {
      const s = entry.soldier;
      if (s?.alive) alive += 1;
      if (s?.grenadeEvade || entry.evaded) { entry.evaded = true; evaded += 1; }
    }
    const spawned = this.enemies.length;
    this.enemyReport = { spawned, alive, killed: Math.max(0, spawned - alive), evaded };
  }

  _OnTimedDetonate(record) {
    this._RefreshEnemyReport();
    record.enemiesKilled = this.enemyReport.killed;
    record.enemiesEvaded = this.enemyReport.evaded;
    this.PaintPanel();
  }

  // -------------------------------------------------------------------------
  // 按需炮坑通行巡逻兵
  // -------------------------------------------------------------------------

  SetPatrols(on) {
    const next = on === undefined ? !this.patrolsEnabled : !!on;
    this.patrolsEnabled = next;
    if (next) {
      if (!this.patrols.length) {
        for (let i = 0; i < EXPLOSION_PATROL.count; i += 1) this.SpawnPatrol(i);
      }
    } else {
      for (const entry of this.patrols) if (entry?.soldier) this.ai.Remove(entry.soldier);
      this.patrols.length = 0;
    }
    this.PaintPanel();
    return this.patrolsEnabled;
  }

  SpawnPatrol(index) {
    const s = this.ai.Spawn("nra", EXPLOSION_PATROL.minX + index * 4, EXPLOSION_PATROL.z + index * 2, {
      weapon: "HanYang", squadId: `ExplosionPatrol${index}`,
    });
    if (!s) return;
    s.dummy = true;
    s.state = "advance";
    s.order = "advance";
    s.scriptArrivalRadius = 0.8;
    s.manualGoalUntil = Infinity;
    s.goal.set(EXPLOSION_PATROL.maxX, 0, EXPLOSION_PATROL.z + index * 2);
    this.patrols[index] = { soldier: s, index, direction: 1, laps: this.patrols[index]?.laps || 0, minY: 0 };
  }

  // -------------------------------------------------------------------------
  // 按需单车召唤与开炮 / 炮击 / 空袭 / 返掷练习
  // -------------------------------------------------------------------------

  SetVehicle(id) {
    const active = this.battlefield.SetActiveVehicle?.(id || null) ?? null;
    this.activeVehicle = active;
    this.PaintPanel();
    return this.activeVehicle;
  }

  FireVehicle(id = this.activeVehicle) {
    const targetId = id || EXPLOSION_VEHICLES[0]?.id;
    const spec = EXPLOSION_VEHICLES.find((s) => s.id === targetId);
    const weapon = WEAPONS[targetId];
    if (!spec || !weapon) return false;
    if (this.activeVehicle !== targetId) this.SetVehicle(targetId);
    const model = this.battlefield.models.get(targetId);
    if (!model) return false;
    model.root.updateMatrixWorld(true);
    const muzzle = model.nodes.get("gunMuzzle");
    const from = muzzle ? muzzle.getWorldPosition(new THREE.Vector3())
      : new THREE.Vector3(spec.x, weapon.heightM * 0.72, spec.z - weapon.lengthM * 0.6);
    from.z = Math.min(from.z, spec.z - weapon.lengthM * 0.6);
    from.y = Math.max(from.y, 1.3);
    const target = new THREE.Vector3(spec.x, this.battlefield.GroundHeight(spec.x, spec.targetZ), spec.targetZ);
    this.combat.FireShell(from, target, { flight: 0.85, kind: spec.explosive, radius: weapon.gunRadiusM, damage: weapon.gunDamage });
    this.combat.host.vfx?.MuzzleFlash(from, new THREE.Vector3(0, 0, -1), { scale: 3.5 });
    this.combat.host.audio?.Play("explosionNear", { position: from, volume: 0.6 });
    this.recoils.set(targetId, 0.32);
    this.shots[targetId] = (this.shots[targetId] || 0) + 1;
    this.PaintPanel();
    return true;
  }

  StartBarrage() {
    if (this.barrage) return false;
    this.barrage = { left: EXPLOSION_BARRAGE.count, timer: 0 };
    this.hud?.Hint?.(T("range.explosion.barrageHint"), 5);
    this.PaintPanel();
    return true;
  }

  ThrowPracticeGrenade() {
    const target = this.player.position.clone();
    target.z -= 1.2;
    const from = target.clone().add(new THREE.Vector3(-10, 3.5, -6));
    const p = this.combat.Throw("Grenade", 0, from, target.clone().sub(from).normalize(), 0);
    if (!p) return false;
    p.owner = "ija";
    const flight = 1.15;
    const velocity = target.sub(p.position).divideScalar(flight);
    velocity.y += 19.6 * flight * 0.5;
    p.velocity.copy(velocity);
    p.body?.setLinvel(velocity, true);
    this.hud?.Hint?.(T("range.explosion.returnHint"), 5);
    this.PaintPanel();
    return true;
  }

  RandomTarget(radiusM) {
    const center = this.player.position.clone(), bounds = this.battlefield.bounds;
    let target = center.clone(), radius = 0;
    for (let i = 0; i < 40; i += 1) {
      const angle = this.random() * Math.PI * 2, r = Math.sqrt(this.random()) * radiusM;
      const x = center.x + Math.cos(angle) * r, z = center.z + Math.sin(angle) * r;
      if (x <= bounds.minX + 2 || x >= bounds.maxX - 2 || z <= bounds.minZ + 2 || z >= bounds.maxZ - 2) continue;
      target.set(x, 0, z);
      radius = r;
      break;
    }
    target.y = this.battlefield.GroundHeight(target.x, target.z);
    return { center, target, radius };
  }

  StartAirstrike() {
    if (this.airstrike || !this.aircraft?.FormFor(EXPLOSION_AIRSTRIKE.aircraftId)) return false;
    const spec = EXPLOSION_AIRSTRIKE, center = this.player.position.clone();
    const fallS = Math.sqrt(2 * spec.altitudeM / 19.6);
    this.airstrike = {
      time: 0, dropped: 0, nextDrop: spec.approachS, x: center.x,
      z: center.z - spec.speedMps * (spec.approachS + fallS), y: center.y + spec.altitudeM,
    };
    this.hud?.Hint?.(T("range.explosion.airstrikeHint"), 6);
    this.PaintPanel();
    return true;
  }

  UpdateAirstrike(dt) {
    const raid = this.airstrike;
    if (!raid) return;
    const spec = EXPLOSION_AIRSTRIKE;
    raid.time += dt;
    const depart = Math.max(0, raid.time - spec.approachS - spec.count * spec.intervalS);
    const from = new THREE.Vector3(raid.x, raid.y + depart * 7, raid.z + raid.time * spec.speedMps);
    this.aircraft.SetManualPose(spec.aircraftId, { x: from.x, y: from.y, z: from.z, dirX: 0, dirZ: 1, climb: depart > 0 ? 0.16 : 0 });
    if (raid.dropped < spec.count && raid.time >= raid.nextDrop) {
      from.y -= 1.4;
      const { center, target, radius } = this.RandomTarget(spec.radiusM);
      const drop = { from: from.toArray(), center: { x: center.x, z: center.z }, target: { x: target.x, z: target.z }, radius, impact: null };
      this.combat.FireShell(from, target, {
        flight: Math.sqrt(2 * Math.max(1, from.y - target.y) / 19.6),
        kind: "Shell75", radius: 7, damage: 150, OnImpact: (at) => { drop.impact = at.toArray(); },
      });
      this.combat.host.vfx?.IncomingMarker(target, 2, { radius: 7 });
      this.combat.host.audio?.Play("shellIncoming", { position: target, volume: 0.85 });
      this.airDrops.push(drop);
      if (this.airDrops.length > 40) this.airDrops.shift();
      raid.dropped += 1;
      raid.nextDrop += spec.intervalS;
    }
    if (raid.time > spec.approachS + spec.count * spec.intervalS + spec.egressS) {
      this.aircraft.SetManualPose(spec.aircraftId, null);
      this.airstrike = null;
    }
  }

  // -------------------------------------------------------------------------
  // 钩子与每帧更新
  // -------------------------------------------------------------------------

  OnKey(detail) {
    return this.timed.HandleInput(detail);
  }

  ActionPrompts() {
    // 活手榴弹返掷提示永远优先，不能被特制弹提示遮掉
    if (this.combat.ReturnCandidate?.()) return null;
    return this.timed.ActionPrompts();
  }

  UpdatePanel() {
    this.PaintPanel();
  }

  PaintPanel() {
    this.lab?.Update(this.State());
  }

  Update(dt) {
    this.timed.Update(dt);
    this.UpdateAirstrike(dt);
    for (const [id, left] of this.recoils) {
      const spec = EXPLOSION_VEHICLES.find((s) => s.id === id);
      const model = this.battlefield.models.get(id);
      const next = Math.max(0, left - dt);
      if (model && spec) model.root.position.z = spec.z + Math.sin(next / 0.32 * Math.PI) * 0.12;
      if (next <= 0) this.recoils.delete(id); else this.recoils.set(id, next);
    }
    if (this.barrage) {
      this.barrage.timer -= dt;
      if (this.barrage.timer <= 0) {
        const { center, target, radius: r } = this.RandomTarget(EXPLOSION_BARRAGE.radiusM);
        const from = target.clone().add(new THREE.Vector3(45, 28, -EXPLOSION_BARRAGE.distanceM));
        this.combat.FireShell(from, target, { flight: EXPLOSION_BARRAGE.flightS, kind: "Shell75", radius: 7, damage: 150 });
        this.combat.host.vfx?.IncomingMarker(target, EXPLOSION_BARRAGE.flightS, { radius: 7 });
        this.combat.host.audio?.Play("shellIncoming", { position: target, volume: 0.9 });
        this.launches.push({ center: { x: center.x, z: center.z }, target: { x: target.x, z: target.z }, radius: r });
        if (this.launches.length > 60) this.launches.shift();
        this.barrage.left -= 1;
        this.barrage.timer += EXPLOSION_BARRAGE.intervalS;
        if (!this.barrage.left) this.barrage = null;
      }
    }
    for (const entry of this.patrols) {
      const s = entry.soldier;
      if (!s.alive) {
        if (s.deadTime > 3) { this.ai.Remove(s); this.SpawnPatrol(entry.index); }
        continue;
      }
      entry.minY = Math.min(entry.minY, s.position.y);
      if (Math.abs(s.position.x - s.goal.x) < 1.5) {
        entry.direction *= -1;
        entry.laps += 1;
        s.goal.x = entry.direction > 0 ? EXPLOSION_PATROL.maxX : EXPLOSION_PATROL.minX;
      }
      s.state = "advance";
      s.target = null;
    }
    this._RefreshEnemyReport();
    this.paintAccum += dt;
    if (this.paintAccum >= 0.1) {
      this.paintAccum = 0;
      this.PaintPanel();
    }
  }

  Reset() {
    this.aircraft?.SetManualPose(EXPLOSION_AIRSTRIKE.aircraftId, null);
    this.airstrike = null;
    this.barrage = null;
    this.combat.ClearProjectiles();
    this.timed.Reset();
    this.battlefield.deformation.Reset();
    const ground = this.battlefield.GroundHeight(this.player.position.x, this.player.position.z);
    if (this.player.position.y < ground) {
      this.player.position.y = ground;
      this.player.velocity.y = 0;
      this.player.body?.Teleport(this.player.position.x, ground, this.player.position.z);
    }
    for (const entry of this.patrols) {
      const s = entry.soldier, y = this.battlefield.GroundHeight(s.position.x, s.position.z);
      if (s.position.y < y) { s.position.y = y; s.velocityY = 0; s.body?.Teleport(s.position.x, y, s.position.z); }
      entry.minY = s.position.y;
      entry.laps = 0;
    }
    for (const entry of this.enemies) {
      const s = entry.soldier;
      if (!s?.alive) continue;
      const y = this.battlefield.GroundHeight(s.position.x, s.position.z);
      if (s.position.y < y) { s.position.y = y; s.velocityY = 0; s.body?.Teleport(s.position.x, y, s.position.z); }
    }
    for (const pool of Object.values(this.combat.host.vfx?.pools || {})) pool.Clear?.();
    for (const [id] of this.recoils) {
      const model = this.battlefield.models.get(id);
      const spec = EXPLOSION_VEHICLES.find((s) => s.id === id);
      if (model && spec) model.root.position.z = spec.z;
    }
    this.recoils.clear();
    this.launches.length = 0;
    this.airDrops.length = 0;
    this.hud?.Hint?.(T("range.explosion.resetHint"), 3);
    this.PaintPanel();
    return true;
  }

  GoTo(id) {
    let x = EXPLOSION_SPAWN.x, z = EXPLOSION_SPAWN.z, yaw = 0;
    if (id === "spawn" || id === "return" || id === "barrage" || id === "airstrike" || id === "reset") {
      x = EXPLOSION_SPAWN.x; z = EXPLOSION_SPAWN.z;
    } else if (id === "vehicle" || EXPLOSION_VEHICLES.some((v) => v.id === id)) {
      x = EXPLOSION_VEHICLE_PAD.x; z = EXPLOSION_VEHICLE_PAD.z + 7.5;
    } else if (id === "enemies") {
      x = EXPLOSION_SPAWN.x; z = EXPLOSION_SPAWN.z - Math.max(4, this.enemyDistanceM - 10);
    } else if (id === "patrol") {
      x = EXPLOSION_SPAWN.x; z = EXPLOSION_PATROL.z + 8;
    } else {
      const grenade = EXPLOSION_GRENADES.find((g) => g.id === id);
      if (!grenade) return false;
      x = grenade.x; z = grenade.z;
    }
    const y = this.battlefield.GroundHeight(x, z);
    this.player.position.set(x, y, z);
    this.player.body?.Teleport(x, y, z);
    this.player.yaw = yaw;
    this.player.pitch = 0;
    return true;
  }

  State() {
    const visibleVehicles = [];
    for (const [id, model] of this.battlefield.models || []) {
      if (model.root.visible) visibleVehicles.push(id);
    }
    return {
      menu: !!this.state?.menu,
      activeLoadout: this.timed.Active ? "timed"
        : this.viewmodel?.weaponId === "GrenadeBundle" ? "bundle"
          : this.viewmodel?.weaponId === "Grenade" ? "grenade" : "rifle",
      timed: this.timed.State(),
      grenades: this.state?.grenades ?? 0,
      bundles: this.state?.bundles ?? 0,
      activeVehicle: this.activeVehicle,
      visibleVehicles,
      shots: { ...this.shots },
      pickups: { ...this.pickups },
      barrage: this.barrage,
      launches: this.launches,
      airstrike: this.airstrike,
      airDrops: this.airDrops,
      visibleAircraft: this.aircraft?.forms.filter((form) => form.root.visible).map((form) => form.spec.id) || [],
      terrain: this.battlefield.deformation.State(),
      returning: this.combat.Returning,
      returns: this.combat.returnCount,
      shells: this.combat.shells.map((s) => ({ id: s.id, kind: s.kind, position: s.position.toArray(), target: s.target.toArray() })),
      enemyMode: this.enemyMode,
      enemyDistanceM: this.enemyDistanceM,
      coverWall: this.coverWall,
      enemyReport: { ...this.enemyReport },
      enemies: this.enemies.map((e) => ({
        id: e.soldier.id, alive: e.soldier.alive, health: Math.max(0, Math.round(e.soldier.health)),
        evaded: e.evaded || !!e.soldier.grenadeEvade,
        position: e.soldier.position.toArray(),
      })),
      patrolsEnabled: this.patrolsEnabled,
      patrols: this.patrols.map((p) => ({
        id: p.soldier.id, alive: p.soldier.alive, position: p.soldier.position.toArray(), laps: p.laps, minY: p.minY,
      })),
    };
  }

  Dispose() {
    this.aircraft?.SetManualPose(EXPLOSION_AIRSTRIKE.aircraftId, null);
    this.airstrike = null;
    this.interact.Clear("ExplosionRange");
    this.ClearEnemies();
    this.SetPatrols(false);
    this.battlefield.SetActiveVehicle?.(null);
    this.battlefield.SetCoverWall?.(false);
    this.timed.Dispose();
    this.lab?.Dispose();
  }
}
