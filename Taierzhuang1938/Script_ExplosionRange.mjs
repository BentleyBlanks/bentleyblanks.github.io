// Test-scene orchestration only. Throws, return fuses, shell collision, damage,
// deformation and actor locomotion all run the ordinary game systems.
import * as THREE from "three";
import { WEAPONS } from "./Data_Weapons.mjs";
import { Mulberry32 } from "./Script_Noise.mjs";
import { BuildSink } from "./Script_World.mjs";
import { EXPLOSION_GRENADES, EXPLOSION_VEHICLES, EXPLOSION_CONTROLS, EXPLOSION_BARRAGE, EXPLOSION_AIRSTRIKE, EXPLOSION_PATROL } from "./Data_ExplosionRange.mjs";

export class ExplosionRange {
  constructor({ battlefield, combat, interact, player, ai, hud, aircraft, GiveGrenade }) {
    Object.assign(this, { battlefield, combat, interact, player, ai, hud, aircraft, GiveGrenade });
    this.random = Mulberry32(19380317); this.barrage = null; this.launches = [];
    this.airstrike = null; this.airDrops = [];
    this.shots = Object.fromEntries(EXPLOSION_VEHICLES.map((s) => [s.id, 0]));
    this.recoils = new Map(); this.pickups = {}; this.patrols = []; this.displayMeshes = [];
    this.BuildGrenadeDisplays(); this.Register();
    for (let i = 0; i < EXPLOSION_PATROL.count; i++) this.SpawnPatrol(i);
  }
  BuildGrenadeDisplays() {
    const sink = new BuildSink(), materials = new Map(); sink.SetSector("ExplosionGrenades");
    for (const spec of EXPLOSION_GRENADES) {
      const source = this.combat.pool[0].children[spec.id === "GrenadeBundle" ? 1 : 0];
      for (let i = 0; i < 6; i++) {
        const root = source.clone(true); root.visible = true;
        root.position.set(spec.x - 1.4 + i % 3 * 1.4, spec.y, spec.z + (i < 3 ? -0.25 : 0.32));
        root.updateMatrixWorld(true);
        root.traverse((object) => {
          if (!object.isMesh) return;
          let key = [...materials].find(([, material]) => material === object.material)?.[0];
          if (!key) { key = `GrenadeMaterial${materials.size}`; materials.set(key, object.material); }
          sink.Add(key, object.geometry.clone().applyMatrix4(object.matrixWorld));
        });
      }
    }
    this.displayMeshes = sink.Flush(this.battlefield.scene, { Get: (key) => materials.get(key) });
  }
  Register() {
    const base = { tag: "ExplosionRange", once: false, facingDot: null, cooldownS: 0.35, reachM: 2.5, heightM: 2 };
    for (const grenade of EXPLOSION_GRENADES) this.interact.Register({ ...base,
      id: `ExplosionPickup${grenade.id}`, position: grenade,
      label: `领取${grenade.name} · ${grenade.id === "GrenadeBundle" ? "H" : "G"} 投掷`,
      OnComplete: () => { this.GiveGrenade(grenade.id); this.pickups[grenade.id] = (this.pickups[grenade.id] || 0) + 1;
        this.hud.Hint(`已领取${grenade.name}，按住 ${grenade.id === "GrenadeBundle" ? "H" : "G"}，松开投出`, 3); },
    });
    for (const vehicle of EXPLOSION_VEHICLES) this.interact.Register({ ...base,
      id: `ExplosionFire${vehicle.id}`, position: { x: vehicle.x, y: 1.2, z: vehicle.z + 4.6 },
      cooldownS: 0.6, reachM: 3.2, label: `${vehicle.name} · 向前开一炮`, OnComplete: () => this.FireVehicle(vehicle.id),
    });
    this.interact.Register({ ...base, id: EXPLOSION_CONTROLS.barrage.id, position: EXPLOSION_CONTROLS.barrage,
      label: () => this.barrage ? "炮击进行中" : "呼叫炮击 · 落点在玩家周围16m", Enabled: () => !this.barrage,
      OnComplete: () => { this.barrage = { left: EXPLOSION_BARRAGE.count, timer: 0 }; this.hud.Hint("炮弹来袭！抬头观察亮光轨迹，移动避开落点", 5); },
    });
    this.interact.Register({ ...base, id: EXPLOSION_CONTROLS.return.id, position: EXPLOSION_CONTROLS.return,
      cooldownS: 4.5, label: "投来一枚活手雷 · 靠近按F掷回", OnComplete: () => this.ThrowPracticeGrenade(),
    });
    this.interact.Register({ ...base, id: EXPLOSION_CONTROLS.airstrike.id, position: EXPLOSION_CONTROLS.airstrike,
      label: () => this.airstrike ? "飞机投弹中，等待飞离" : "召唤飞机 · 玩家周围16m随机投弹",
      Enabled: () => !this.airstrike && !!this.aircraft?.FormFor(EXPLOSION_AIRSTRIKE.aircraftId),
      OnComplete: () => this.StartAirstrike(),
    });
    this.interact.Register({ ...base, id: EXPLOSION_CONTROLS.reset.id, position: EXPLOSION_CONTROLS.reset,
      label: "恢复平地 · 清除在途弹", OnComplete: () => this.Reset(),
    });
  }
  FireVehicle(id) {
    const spec = EXPLOSION_VEHICLES.find((s) => s.id === id), weapon = WEAPONS[id];
    if (!spec || !weapon) return false;
    const model = this.battlefield.models.get(id);
    model.root.updateMatrixWorld(true);
    const muzzle = model.nodes.get("gunMuzzle");
    const from = muzzle ? muzzle.getWorldPosition(new THREE.Vector3())
      : new THREE.Vector3(spec.x, weapon.heightM * 0.72, spec.z - weapon.lengthM * 0.6);
    // Standard mount positions come from the model. Push outside the conservative hull collider.
    from.z = Math.min(from.z, spec.z - weapon.lengthM * 0.6); from.y = Math.max(from.y, 1.3);
    const target = new THREE.Vector3(spec.x, this.battlefield.GroundHeight(spec.x, spec.targetZ), spec.targetZ);
    this.combat.FireShell(from, target, { flight: 0.85, kind: spec.explosive, radius: weapon.gunRadiusM, damage: weapon.gunDamage });
    this.combat.host.vfx?.MuzzleFlash(from, new THREE.Vector3(0, 0, -1), { scale: 3.5 });
    this.combat.host.audio?.Play("explosionNear", { position: from, volume: 0.6 });
    this.recoils.set(id, 0.32); this.shots[id]++;
    return true;
  }
  ThrowPracticeGrenade() {
    const target = this.player.position.clone(); target.z -= 1.2;
    const from = target.clone().add(new THREE.Vector3(-10, 3.5, -6));
    const p = this.combat.Throw("Grenade", 0, from, target.clone().sub(from).normalize(), 0);
    p.owner = "ija";
    const flight = 1.15, velocity = target.sub(p.position).divideScalar(flight); velocity.y += 19.6 * flight * 0.5;
    p.velocity.copy(velocity); p.body?.setLinvel(velocity, true);
    this.hud.Hint("活手雷落到附近后，按 F 拾起并掷回。原引信继续计时", 5);
    return true;
  }
  RandomTarget(radiusM) {
    const center = this.player.position.clone(), bounds = this.battlefield.bounds;
    let target = center.clone(), radius = 0;
    for (let i = 0; i < 40; i++) {
      const angle = this.random() * Math.PI * 2, r = Math.sqrt(this.random()) * radiusM;
      const x = center.x + Math.cos(angle) * r, z = center.z + Math.sin(angle) * r;
      if (x <= bounds.minX + 2 || x >= bounds.maxX - 2 || z <= bounds.minZ + 2 || z >= bounds.maxZ - 2) continue;
      target.set(x, 0, z); radius = r; break;
    }
    target.y = this.battlefield.GroundHeight(target.x, target.z);
    return { center, target, radius };
  }
  StartAirstrike() {
    if (this.airstrike || !this.aircraft?.FormFor(EXPLOSION_AIRSTRIKE.aircraftId)) return false;
    const spec = EXPLOSION_AIRSTRIKE, center = this.player.position.clone();
    const fallS = Math.sqrt(2 * spec.altitudeM / 19.6);
    this.airstrike = { time: 0, dropped: 0, nextDrop: spec.approachS, x: center.x,
      z: center.z - spec.speedMps * (spec.approachS + fallS), y: center.y + spec.altitudeM };
    this.hud.Hint("飞机正在进场，向你附近随机投弹。抬头观察，移动避开弹着！", 6);
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
      this.combat.FireShell(from, target, { flight: Math.sqrt(2 * Math.max(1, from.y - target.y) / 19.6),
        kind: "Shell75", radius: 7, damage: 150, OnImpact: (at) => { drop.impact = at.toArray(); } });
      this.combat.host.vfx?.IncomingMarker(target, 2, { radius: 7 });
      this.combat.host.audio?.Play("shellIncoming", { position: target, volume: 0.85 });
      this.airDrops.push(drop); if (this.airDrops.length > 40) this.airDrops.shift();
      raid.dropped++; raid.nextDrop += spec.intervalS;
    }
    if (raid.time > spec.approachS + spec.count * spec.intervalS + spec.egressS) {
      this.aircraft.SetManualPose(spec.aircraftId, null); this.airstrike = null;
    }
  }
  SpawnPatrol(index) {
    const s = this.ai.Spawn("nra", EXPLOSION_PATROL.minX + index * 4, EXPLOSION_PATROL.z + index * 2, {
      weapon: "HanYang", squadId: `ExplosionPatrol${index}` });
    if (!s) return;
    s.dummy = true; s.state = "advance"; s.order = "advance"; s.scriptArrivalRadius = 0.8;
    s.manualGoalUntil = Infinity;
    s.goal.set(EXPLOSION_PATROL.maxX, 0, EXPLOSION_PATROL.z + index * 2);
    this.patrols[index] = { soldier: s, index, direction: 1, laps: this.patrols[index]?.laps || 0, minY: 0 };
  }
  Update(dt) {
    this.UpdateAirstrike(dt);
    for (const [id, left] of this.recoils) {
      const spec = EXPLOSION_VEHICLES.find((s) => s.id === id), model = this.battlefield.models.get(id);
      const next = Math.max(0, left - dt); model.root.position.z = spec.z + Math.sin(next / 0.32 * Math.PI) * 0.12;
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
        this.barrage.left--; this.barrage.timer += EXPLOSION_BARRAGE.intervalS;
        if (!this.barrage.left) this.barrage = null;
      }
    }
    for (const entry of this.patrols) {
      const s = entry.soldier;
      if (!s.alive) { if (s.deadTime > 3) { this.ai.Remove(s); this.SpawnPatrol(entry.index); } continue; }
      entry.minY = Math.min(entry.minY, s.position.y);
      if (Math.abs(s.position.x - s.goal.x) < 1.5) {
        entry.direction *= -1; entry.laps++;
        s.goal.x = entry.direction > 0 ? EXPLOSION_PATROL.maxX : EXPLOSION_PATROL.minX;
      }
      s.state = "advance"; s.target = null;
    }
  }
  Reset() {
    this.aircraft?.SetManualPose(EXPLOSION_AIRSTRIKE.aircraftId, null); this.airstrike = null;
    this.barrage = null; this.combat.ClearProjectiles(); this.battlefield.deformation.Reset();
    // Restoring ground while someone stands in a pit must lift their real body.
    const ground = this.battlefield.GroundHeight(this.player.position.x, this.player.position.z);
    if (this.player.position.y < ground) {
      this.player.position.y = ground; this.player.velocity.y = 0;
      this.player.body?.Teleport(this.player.position.x, ground, this.player.position.z);
    }
    for (const entry of this.patrols) {
      const s = entry.soldier, y = this.battlefield.GroundHeight(s.position.x, s.position.z);
      if (s.position.y < y) { s.position.y = y; s.velocityY = 0; s.body?.Teleport(s.position.x, y, s.position.z); }
      entry.minY = s.position.y; entry.laps = 0;
    }
    for (const pool of Object.values(this.combat.host.vfx?.pools || {})) pool.Clear?.();
    for (const [id] of this.recoils) this.battlefield.models.get(id).root.position.z = EXPLOSION_VEHICLES.find((s) => s.id === id).z;
    this.recoils.clear(); this.launches.length = 0; this.airDrops.length = 0;
    this.hud.Hint("地形已恢复，可以继续测试", 3); return true;
  }
  GoTo(id) {
    const grenade = EXPLOSION_GRENADES.find((s) => s.id === id);
    const vehicle = EXPLOSION_VEHICLES.find((s) => s.id === id);
    const point = grenade || vehicle || EXPLOSION_CONTROLS[id];
    if (!point) return false;
    const z = point.z + (vehicle ? 6.5 : 2), y = this.battlefield.GroundHeight(point.x, z);
    this.player.position.set(point.x, y, z); this.player.body?.Teleport(point.x, y, z);
    this.player.yaw = 0; this.player.pitch = 0; return true;
  }
  State() { return { shots: { ...this.shots }, pickups: { ...this.pickups }, barrage: this.barrage, launches: this.launches,
    airstrike: this.airstrike, airDrops: this.airDrops,
    visibleAircraft: this.aircraft?.forms.filter((form) => form.root.visible).map((form) => form.spec.id) || [],
    terrain: this.battlefield.deformation.State(), returning: this.combat.Returning, returns: this.combat.returnCount,
    shells: this.combat.shells.map((s) => ({ id: s.id, kind: s.kind, position: s.position.toArray(), target: s.target.toArray() })),
    patrols: this.patrols.map((p) => ({ id: p.soldier.id, alive: p.soldier.alive, position: p.soldier.position.toArray(), laps: p.laps, minY: p.minY })) }; }
  Dispose() {
    this.aircraft?.SetManualPose(EXPLOSION_AIRSTRIKE.aircraftId, null); this.airstrike = null;
    this.interact.Clear("ExplosionRange");
    for (const mesh of this.displayMeshes) { this.battlefield.scene.remove(mesh); mesh.geometry.dispose(); }
    this.displayMeshes.length = 0;
  }
}
