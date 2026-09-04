// Dedicated gun handling laboratory. It owns fixtures and evidence, while all
// pickup, trigger, reload, damage and first-person animation use the game host.
// Moving targets follow the data's constant-distance arc; actor, capsule and
// bone hitboxes are synchronized before the next trigger sample.
import * as THREE from "three";
import { BuildSink } from "./Script_World.mjs";
import { WEAPONS } from "./Data_Weapons.mjs";
import {
  WEAPON_RANGE_WEAPONS, WEAPON_RANGE_TARGETS, WEAPON_RANGE_STATIONS,
  WEAPON_RANGE_TABLE, WEAPON_RANGE_RESPAWN_S, SampleWeaponRangeTargetPosition,
} from "./Data_WeaponRange.mjs";

export class WeaponRangeRuntime {
  constructor(host) {
    this.host = host;
    this.targets = [];
    this.meshes = [];
    this.ammoMode = "infinite";
    this.moving = true;
    this.motionTime = 0;
    this.history = [];
    this.aimDirection = new THREE.Vector3();
    this.stats = { shots: 0, hits: 0, killed: 0, respawned: 0, pickups: 0, resets: 0 };
    this.BuildWeapons();
    this.SeedTargets();
    this.BuildPanel();
    this.api = {
      State: () => this.State(), Targets: () => this.Targets(), Weapons: () => this.Weapons(),
      GoTo: (stationId, weaponId) => this.GoTo(stationId, weaponId),
      AimAt: (id, offsetY) => this.AimAt(id, offsetY),
      AimedTarget: () => this.AimedTarget(),
      Pickup: (id) => this.Pickup(id), Reset: () => this.Reset(),
      SetMoving: (enabled) => this.SetMoving(enabled),
      SetAmmoMode: (mode) => this.SetAmmoMode(mode),
      LastShot: () => this.history.length ? structuredClone(this.history.at(-1)) : null,
      Shots: () => structuredClone(this.history),
    };
  }

  Weapons() {
    return WEAPON_RANGE_WEAPONS.map((slot) => {
      const id = slot.weaponId || slot.id;
      const weapon = WEAPONS[id];
      return { ...slot, id, weaponId: id, ammo: weapon.ammo, ammoType: weapon.ammo, magazine: weapon.magazine,
        position: { x: slot.x, y: slot.y, z: slot.z },
        pickupPosition: slot.pickupPosition || { x: slot.x, y: 0,
          z: WEAPON_RANGE_TABLE.pickupZ || WEAPON_RANGE_TABLE.z + WEAPON_RANGE_TABLE.depth / 2 + 0.85 } };
    });
  }

  BuildWeapons() {
    const { actorFactory, scene, library, interact } = this.host;
    const sink = new BuildSink();
    // The actual firearm catalog includes dedicated GLB texture buckets. Resolve
    // them through the same table as Actor.SetWeapon, rather than painting every
    // imported gun with the generic steel fallback.
    const materials = actorFactory.ActorMaterials("nra", () => 0.5);
    for (const slot of this.Weapons()) {
      const built = actorFactory.WeaponGeometry(slot.id, 0, { includeBayonet: false });
      const pieces = [...built.geometries.entries()].map(([key, source]) => {
        const geometry = source.clone();
        geometry.rotateY(slot.ry || 0);
        geometry.computeBoundingBox();
        return { key, geometry };
      });
      const box = new THREE.Box3();
      for (const { geometry } of pieces) box.union(geometry.boundingBox);
      const center = box.getCenter(new THREE.Vector3());
      for (const { key, geometry } of pieces) {
        geometry.translate(slot.x - center.x, WEAPON_RANGE_TABLE.topY + 0.015 - box.min.y, slot.z - center.z);
        sink.Add(key, geometry);
      }
      interact.Register({ id: `WeaponRangePickup_${slot.id}`, kind: "weaponRangePickup", tag: "WeaponRange",
        position: { x: slot.x, y: WEAPON_RANGE_TABLE.topY, z: slot.z },
        reachM: 2.3, heightM: 2, facingDot: 0.65, priority: 50, once: false, cooldownS: 0.25,
        label: `换上 ${slot.name}`, sound: "magIn", hint: `已领取 ${slot.name}`,
        Enabled: () => !this.host.viewmodel.IsBusy?.(),
        OnComplete: () => this.Pickup(slot.id),
      });
    }
    this.meshes = sink.Flush(scene, library, { resolve: (key) => materials[key] || materials.steel });
    for (const mesh of this.meshes) mesh.name = `WeaponRangeTable_${mesh.name}`;
  }

  Pickup(id) {
    const slot = this.Weapons().find((entry) => entry.id === id);
    const { player, interact, viewmodel } = this.host;
    const point = interact.points.get(`WeaponRangePickup_${id}`);
    if (!slot || !player.Alive || viewmodel.IsBusy?.() || !point || interact.Reach(point, player) == null) return false;
    if (!this.host.Pickup(id)) return false;
    this.stats.pickups += 1;
    this.RefreshPanel();
    return true;
  }

  SpawnTarget(spec) {
    const position = SampleWeaponRangeTargetPosition(spec, this.motionTime);
    const soldier = this.host.ai.Spawn("ija", position.x, position.z,
      { weapon: "Type38", squadId: `WeaponRange_${spec.id}` });
    if (!soldier) throw new Error(`Cannot spawn range target ${spec.id}`);
    soldier.dummy = true;
    soldier.weaponRangeTargetId = spec.id;
    soldier.order = "hold";
    soldier.holdZone = { id: spec.id, x: position.x, z: position.z, radius: 0.1 };
    soldier.yaw = position.ry;
    soldier.weaponRangeMoveSpeed = 0;
    soldier.lookYaw = 0;
    soldier.goal.set(position.x, 0, position.z);
    return soldier;
  }

  SeedTargets() {
    for (const spec of WEAPON_RANGE_TARGETS) {
      this.targets.push({ spec, soldier: this.SpawnTarget(spec), deadCounted: false });
    }
    this.Update(0);
  }

  Update(dt) {
    if (this.moving) this.motionTime += dt;
    const origin = WEAPON_RANGE_STATIONS.find((point) => point.id === "WeaponRangeFire") || WEAPON_RANGE_STATIONS[0];
    for (const entry of this.targets) {
      let soldier = entry.soldier;
      if (!soldier.alive) {
        if (!entry.deadCounted) { entry.deadCounted = true; this.stats.killed += 1; }
        if (soldier.deadTime < WEAPON_RANGE_RESPAWN_S) continue;
        this.host.ai.Remove(soldier);
        soldier = entry.soldier = this.SpawnTarget(entry.spec);
        entry.deadCounted = false;
        this.stats.respawned += 1;
      }
      const point = SampleWeaponRangeTargetPosition(entry.spec, this.motionTime);
      const moved = Math.hypot(point.x - soldier.position.x, point.z - soldier.position.z);
      soldier.position.set(point.x, this.host.battlefield.GroundHeight(point.x, point.z), point.z);
      soldier.body?.Teleport(soldier.position.x, soldier.position.y, soldier.position.z);
      soldier.goal.copy(soldier.position);
      soldier.holdZone.x = point.x; soldier.holdZone.z = point.z;
      soldier.yaw = Math.atan2(-(origin.x - point.x), -(origin.z - point.z));
      soldier.lookYaw = 0;
      soldier.target = null;
      soldier.targetVisible = false;
      soldier.weaponRangeMoveSpeed = dt > 0 ? Math.min(0.7, moved / dt / 3.6) : 0;
      soldier.grounded = true;
      soldier.velocityY = 0;
      soldier.actor.root.position.copy(soldier.position);
      soldier.actor.root.rotation.y = soldier.yaw;
    }
    // Main calls this before ai.Update: AI owns the single animation update and
    // then builds its crowd instances from these same current-frame positions.
    this.RefreshTargetInfo();
    if (this.host.state.frame % 12 === 0) this.RefreshPanel();
  }

  Targets() {
    const { player } = this.host;
    return this.targets.map(({ spec, soldier }) => ({
      id: spec.id, soldierId: soldier.id, distanceM: spec.distanceM,
      distance: Math.hypot(soldier.position.x - player.position.x, soldier.position.z - player.position.z),
      moving: !!spec.moving, alive: soldier.alive, health: soldier.health, deadTime: soldier.deadTime,
      x: soldier.position.x, y: soldier.position.y, z: soldier.position.z,
      position: { x: soldier.position.x, y: soldier.position.y, z: soldier.position.z },
    }));
  }

  State() {
    const { player, camera, state } = this.host;
    return { version: 1, ammoMode: this.ammoMode, moving: this.moving, motionTime: this.motionTime,
      pinned: state.pinned, respawnS: WEAPON_RANGE_RESPAWN_S,
      stats: { ...this.stats }, stations: structuredClone(WEAPON_RANGE_STATIONS),
      weapons: this.Weapons(), targets: this.Targets(),
      player: { x: player.position.x, y: player.position.y, z: player.position.z,
        yaw: player.yaw, pitch: player.pitch, health: player.health, alive: player.Alive,
        weapon: this.host.Weapon(), slot: state.activeSlot, ammo: state.ammo, clips: state.clips,
        ads: player.ads, fov: camera.fov },
    };
  }

  GoTo(stationId = "firing", weaponId) {
    let position;
    if (stationId === "table") position = this.Weapons().find((slot) => slot.id === weaponId)?.pickupPosition
      || this.Weapons()[0].pickupPosition;
    else position = WEAPON_RANGE_STATIONS.find((station) => station.id === stationId)
      || WEAPON_RANGE_STATIONS.find((station) => station.id === "WeaponRangeFire") || WEAPON_RANGE_STATIONS[0];
    this.host.player.Spawn(position.x, position.z, position.ry ?? 0);
    this.host.player.pitch = stationId === "table" ? -0.3 : 0;
    return { ...position };
  }

  AimAt(id, offsetY = 1.05) {
    const entry = this.targets.find((target) => target.spec.id === id);
    if (!entry?.soldier.alive) return null;
    const player = this.host.player;
    const eye = player.EyePosition;
    const position = entry.soldier.position;
    const dx = position.x - eye.x, dz = position.z - eye.z;
    player.yaw = Math.atan2(-dx, -dz);
    player.pitch = Math.atan2(position.y + offsetY - eye.y, Math.hypot(dx, dz));
    player.aimYaw = 0; player.aimPitch = 0;
    return { id, yaw: player.yaw, pitch: player.pitch };
  }

  RecordShot(shot, soldier, damage) {
    this.stats.shots += 1;
    if (soldier) this.stats.hits += 1;
    this.history.push({ ...structuredClone(shot), serial: this.stats.shots,
      weaponId: shot.weapon, targetId: soldier?.weaponRangeTargetId || null,
      damage: damage || 0, time: this.host.state.elapsed });
    if (this.history.length > 256) this.history.shift();
    this.RefreshPanel();
  }

  SetMoving(enabled) { this.moving = !!enabled; this.RefreshPanel(); return this.moving; }

  AimedTarget() {
    const { player } = this.host;
    const eye = player.EyePosition;
    player.AimDirection(this.aimDirection);
    const direction = this.aimDirection;
    const horizontal = Math.hypot(direction.x, direction.z);
    if (horizontal < 0.001) return null;
    let best = null;
    for (const { spec, soldier } of this.targets) {
      const dx = soldier.position.x - eye.x, dz = soldier.position.z - eye.z;
      const distance = Math.hypot(dx, dz);
      const along = (dx * direction.x + dz * direction.z) / horizontal;
      if (along <= 0) continue;
      // The selection envelope is the actual half-width at this distance,
      // including a small aiming allowance; it never grows to an arbitrary
      // screen-space angle that would merge several far target lanes.
      const across = Math.abs(dx * direction.z - dz * direction.x) / horizontal;
      if (across > 0.62) continue;
      const rayY = eye.y + direction.y * along / horizontal;
      if (rayY < soldier.position.y - 0.15 || rayY > soldier.position.y + 2.98) continue;
      if (best && across / distance >= best.error) continue;
      best = { id: spec.id, moving: spec.moving, distanceM: spec.distanceM,
        currentDistanceM: distance, alive: soldier.alive, error: across / distance };
    }
    return best;
  }

  RefreshTargetInfo() {
    if (!this.targetInfo) return;
    const target = this.AimedTarget();
    this.targetInfo.hidden = !!this.host.state.menu || !this.host.player.Alive || !target;
    if (!target) return;
    this.targetInfo.textContent = `${target.id} · ${target.moving ? "移动靶" : "静止靶"}`
      + `  标尺 ${target.distanceM} m · 当前 ${target.currentDistanceM.toFixed(1)} m`
      + (target.alive ? "" : " · 复位中");
  }

  SetAmmoMode(mode) {
    if (!["infinite", "reload"].includes(mode)) return false;
    this.ammoMode = mode;
    this.host.Refill();
    this.RefreshPanel();
    return mode;
  }

  Reset() {
    for (const entry of this.targets) this.host.ai.Remove(entry.soldier);
    this.targets.length = 0;
    this.motionTime = 0;
    this.stats = { shots: 0, hits: 0, killed: 0, respawned: 0, pickups: 0, resets: this.stats.resets + 1 };
    this.history.length = 0;
    this.SeedTargets();
    this.host.Refill();
    this.GoTo("firing");
    this.RefreshPanel();
    return this.State();
  }

  BuildPanel() {
    this.panel = document.createElement("aside");
    this.panel.id = "weaponRangePanel";
    this.panel.innerHTML = `<strong>枪械射击白盒</strong><p>桌前 F 换枪 · 右键机瞄 · 左键射击 · R 换弹</p>
      <p>蓝点为测距原点；左侧静止靶、右侧移动靶。离开蓝点后，以当前距离为准。</p>
      <output id="weaponRangeStatus"></output><div>
      <button id="weaponRangeMotion" type="button">暂停移动靶</button>
      <button id="weaponRangeAmmo" type="button">切换换弹测试</button>
      <button id="weaponRangeReset" type="button">重置靶场</button></div>
      <small>F6 移动靶 · F7 弹药模式 · F8 重置<br>按住 Alt 可用鼠标点击面板<br>目标倒地后自动复位；开镜时自动收起面板</small>`;
    const style = document.createElement("style");
    style.textContent = `#weaponRangePanel{position:fixed;left:18px;top:94px;z-index:12;width:310px;padding:14px 16px;background:rgba(20,30,39,.88);border:1px solid #8198a6;border-left:3px solid #77c8e3;border-radius:4px;color:#edf3f5;font:13px/1.55 system-ui,sans-serif;pointer-events:auto}#weaponRangePanel strong{font-size:17px;letter-spacing:2px}#weaponRangePanel p{margin:7px 0;color:#c9d5da}#weaponRangePanel output{display:block;white-space:pre-line;margin:8px 0;color:#ffe3a4}#weaponRangePanel button{color:#edf3f5;background:#334b5c;border:1px solid #738795;border-radius:3px;padding:5px 7px;margin:2px;cursor:pointer}#weaponRangePanel small{display:block;color:#aabbc5;margin-top:6px}@media(max-width:700px){#weaponRangePanel{top:65px;left:8px;width:225px;padding:8px;font-size:11px}#weaponRangePanel p:nth-of-type(2){display:none}}`;
    this.panel.append(style);
    document.body.append(this.panel);
    this.targetInfo = document.createElement("output");
    this.targetInfo.id = "weaponRangeTargetInfo";
    this.targetInfo.setAttribute("aria-label", "当前瞄准目标与距离");
    this.targetInfo.style.cssText = "position:fixed;left:50%;top:calc(50% + 74px);transform:translateX(-50%);z-index:13;padding:4px 9px;border-radius:3px;background:rgba(20,30,39,.78);color:#f4f6ed;font:14px/1.4 system-ui,sans-serif;white-space:nowrap;pointer-events:none;text-shadow:0 1px 2px #000";
    this.targetInfo.hidden = true;
    document.body.append(this.targetInfo);
    this.panel.querySelector("#weaponRangeMotion").onclick = () => this.SetMoving(!this.moving);
    this.panel.querySelector("#weaponRangeAmmo").onclick = () => this.SetAmmoMode(this.ammoMode === "infinite" ? "reload" : "infinite");
    this.panel.querySelector("#weaponRangeReset").onclick = () => this.Reset();
    this.onKey = (event) => {
      if (event.repeat || /INPUT|TEXTAREA|SELECT/.test(event.target?.tagName || "")) return;
      if (event.code === "F6") this.SetMoving(!this.moving);
      else if (event.code === "F7") this.SetAmmoMode(this.ammoMode === "infinite" ? "reload" : "infinite");
      else if (event.code === "F8") this.Reset();
      else return;
      event.preventDefault();
    };
    document.addEventListener("keydown", this.onKey);
    this.RefreshPanel();
  }

  RefreshPanel() {
    if (!this.panel) return;
    const { player, state } = this.host;
    this.panel.hidden = !!state.menu || player.ads > 0.5;
    const last = this.history.at(-1);
    const target = last?.targetId ? this.targets.find((entry) => entry.spec.id === last.targetId) : null;
    this.panel.querySelector("#weaponRangeStatus").textContent =
      `${WEAPONS[this.host.Weapon()]?.name || "未持枪"} · ${this.ammoMode === "infinite" ? "弹药 ∞" : `弹匣 ${state.ammo} / 备弹 ∞`}\n` +
      `射击 ${this.stats.shots} · 命中 ${this.stats.hits}` +
      (last ? `\n上一发：${target ? `${target.spec.distanceM}m ${target.spec.moving ? "移动" : "静止"}靶` : "未命中人体"} · ${Math.round(last.dist)}m` : "");
    this.panel.querySelector("#weaponRangeMotion").textContent = this.moving ? "暂停移动靶" : "恢复移动靶";
    this.panel.querySelector("#weaponRangeAmmo").textContent = this.ammoMode === "infinite" ? "切换换弹测试" : "恢复无限弹匣";
  }

  Dispose() {
    this.host.interact.Clear("WeaponRange");
    for (const entry of this.targets) this.host.ai.Remove(entry.soldier);
    for (const mesh of this.meshes) { mesh.removeFromParent(); mesh.geometry.dispose(); }
    this.targets.length = 0;
    this.panel?.remove();
    this.targetInfo?.remove();
    document.removeEventListener("keydown", this.onKey);
  }
}
