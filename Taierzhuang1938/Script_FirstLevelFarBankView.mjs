// ===========================================================================
// Script_FirstLevelFarBankView.mjs —— 18 对岸傀儡战车的表现层（带 three）
//
// 规则与状态在 Script_FirstLevelBridgeFarBank（零 three）：这里只把它每帧给出的战车状态
// { x, z, hullYaw, turretYaw, gunPitch, recoil, speed, pivotRate, rpm, load, visible } 画出来。
// 模型、炮管枢轴、履带滚动、按车体轴贴地、履带尘 / 排气全部照 Script_FirstLevelMissionView 的 03–05 战车
// （BuildTank / SyncTank / UpdateTankFx），数值取 Data_Tuning_Tank.view；差别只有三条：
//   · 多辆同时存在（Type89Tank 模型每辆现造一份几何；材质共用，履带材质每辆克隆一份挂滚动补丁）；
//   · 碰撞盒 tag 是 `farBankTank`，**不进 battlefield.colliders**、不叫 `missionTank`
//     （否则子弹命中会转进 03–05 的 tankRuntime.OnBulletHit）；只进 physics（子弹与视线射线打得到）；
//   · 不用 Type89Damage：傀儡不可摧毁 —— 碰撞记录带 destruction.profile "structural"、surface "metal"。
// 挂在 view.root（任务白盒根）之下：开机预热画一帧的隐藏组会把它们的着色器一起编好。
// 声音只留两样：一个共用的 TankAudio 实例（发动机循环跟最近的一辆、炮口声给每辆的炮击用）。
// ===========================================================================
import * as THREE from "three";
import { TANK } from "./Data_Tuning_Tank.mjs";
import { CloneShadedMaterial } from "./Script_Materials.mjs";
import { ApplyPatches, PatchesOf, MakeUvScrollPatch } from "./Script_MaterialPatches.mjs";
import { TankAudio } from "./Script_TankAudio.mjs";

const HALF = [1.075, 1.28, 2.15];
// 集结地上空的烟尘源（世界 x, z）：岸线后二三十米的人堆与战车停位一带。
const HAZE_SPOTS = Object.freeze([[-104, 68], [-96, 58], [-88, 64], [-72, 56], [-64, 66], [-56, 60], [-48, 66], [-80, 48], [-100, 46], [-60, 46]]);
const HAZE_SOURCE = Object.freeze({ kind: "dust", rate: 3, radius: 11, rise: 0.4, sizeStart: 3.6, sizeEnd: 10, life: 7, opacity: 0.2, prewarm: true });

export class FarBankTankView {
  constructor({ root, battlefield, physics, actorFactory, library, vfx, audio = null }) {
    Object.assign(this, { battlefield, physics, actorFactory, library, vfx, audio });
    this.group = new THREE.Group();
    this.group.name = "FarBankTanks";
    root.add(this.group);
    this.entries = new Map();
    this.materials = [];
    this.sound = null;
    this.time = null;
    this.point = new THREE.Vector3();
  }
  /** 共用的 TankAudio：第一次用到才建；没有音频引擎（node 测试）就一直是 null。 */
  get Sound() {
    if (!this.sound && this.audio) this.sound = new TankAudio(this.audio, TANK.audio, TANK.drive, { occluder: () => null });
    return this.sound;
  }
  Build(id) {
    const group = new THREE.Group();
    group.name = `FarBankTank_${id}`;
    group.visible = false;
    this.group.add(group);
    const trackMaterial = CloneShadedMaterial(this.library.Get("Type89Track", { side: THREE.DoubleSide }));
    const trackScroll = { value: new THREE.Vector2() };
    ApplyPatches(trackMaterial, [...(PatchesOf(trackMaterial) || []), MakeUvScrollPatch(trackScroll, { key: "tankTrackScroll1" })]);
    this.materials.push(trackMaterial);
    const materials = { type89Armor: this.library.Get("Type89Armor", { side: THREE.DoubleSide }),
      type89Barrel: this.library.Get("Type89Armor", { side: THREE.DoubleSide }), type89Track: trackMaterial };
    const model = this.actorFactory.ModelInstance("Type89Tank", materials);
    if (!model) throw new Error("FarBank requires the existing Type89Tank model");
    group.add(model.root);
    model.root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    const turret = model.nodes.get("turret");
    const trunnion = new THREE.Vector3().fromArray(TANK.view.trunnion);
    const gun = new THREE.Group(); gun.name = "FarBankGunTrunnion"; gun.position.copy(trunnion); turret.add(gun);
    const gunRecoil = new THREE.Group(); gunRecoil.name = "FarBankGunRecoil"; gun.add(gunRecoil);
    const barrel = model.meshes.find((m) => m.name.endsWith("_type89Barrel"));
    if (barrel) { gunRecoil.add(barrel); barrel.position.sub(trunnion); }
    const muzzle = model.nodes.get("gunMuzzle");
    if (muzzle) { gunRecoil.add(muzzle); muzzle.position.sub(trunnion); }
    const collider = { min: [0, 0, 0], max: [0, 0, 0], c: [0, 0, 0], h: [...HALF], tag: "farBankTank", ry: 0,
      surface: "metal", destruction: { profile: "structural" } };
    const entry = { id, group, model, turret, gun, gunRecoil, trackScroll, collider, registered: false,
      fx: { dust: [null, null], exhaust: null, puff: null, puffAt: -Infinity }, key: "" };
    this.entries.set(id, entry);
    return entry;
  }
  /** 一辆车此刻的姿态（与 MissionView.SyncTank 同一套：按车体轴取四点地高）。 */
  Pose(entry, tank) {
    const h = (x, z) => this.battlefield.GroundHeight(x, z), hullYaw = tank.hullYaw ?? Math.PI;
    const fx = -Math.sin(hullYaw), fz = -Math.cos(hullYaw), rx = Math.cos(hullYaw), rz = -Math.sin(hullYaw);
    const front = h(tank.x + fx * 1.8, tank.z + fz * 1.8), rear = h(tank.x - fx * 1.8, tank.z - fz * 1.8);
    const right = h(tank.x + rx, tank.z + rz), left = h(tank.x - rx, tank.z - rz);
    entry.group.position.set(tank.x, (front + rear + left + right) / 4, tank.z);
    entry.group.rotation.set(Math.atan2(front - rear, 3.6) + (tank.hullPitch || 0), hullYaw, Math.atan2(right - left, 2), "YXZ");
    entry.turret.rotation.y = tank.turretYaw - hullYaw;
    entry.gun.rotation.x = tank.gunPitch || 0;
    entry.gunRecoil.position.z = (tank.recoil || 0) * (TANK.view.recoilM / 0.34);
    entry.group.updateMatrixWorld(true);
  }
  Collider(tank) { return this.entries.get(tank.id)?.collider ?? null; }
  /** 炮口 / 机枪口的世界坐标（Fx 与炮击用）。 */
  Muzzle(tank, kind) {
    const entry = this.entries.get(tank.id);
    if (!entry) return null;
    const node = entry.model.nodes.get(kind === "mg" ? "mgMuzzle" : "gunMuzzle") || entry.model.nodes.get("gunMuzzle");
    if (!node) return null;
    entry.group.updateMatrixWorld(true);
    const p = node.getWorldPosition(new THREE.Vector3());
    return { x: p.x, y: p.y, z: p.z };
  }
  UpdateFx(entry, tank, dt, shown) {
    const V = TANK.view, fx = entry.fx;
    entry.trackScroll.value.x = (entry.trackScroll.value.x - (tank.speed || 0) * dt * V.trackUvPerM) % 64;
    entry.trackScroll.value.y = (entry.trackScroll.value.y + (tank.pivotRate || 0) * dt * 0.9 * V.trackUvPerM) % 64;
    const dusty = shown && (Math.abs(tank.speed || 0) >= V.trackDust.minSpeedMps || Math.abs(tank.pivotRate || 0) > 0.05);
    for (let i = 0; i < 2; i++) {
      if (dusty) {
        this.point.fromArray(V.trackDust.offsets[i]); entry.group.localToWorld(this.point);
        if (fx.dust[i] == null) fx.dust[i] = this.vfx?.SmokeSource(this.point.clone(), V.trackDust.source) ?? null;
        else this.vfx?.MoveSmokeSource(fx.dust[i], this.point);
      } else if (fx.dust[i] != null) { this.vfx?.RemoveSmokeSource(fx.dust[i]); fx.dust[i] = null; }
    }
    const running = shown && (tank.rpm || 0) > 1;
    this.point.fromArray(V.exhaust.offset); entry.group.localToWorld(this.point);
    if (running) {
      if (fx.exhaust == null) fx.exhaust = this.vfx?.SmokeSource(this.point.clone(), V.exhaust.source) ?? null;
      else this.vfx?.MoveSmokeSource(fx.exhaust, this.point);
    } else if (fx.exhaust != null) { this.vfx?.RemoveSmokeSource(fx.exhaust); fx.exhaust = null; }
  }
  StopFx(entry) {
    const fx = entry.fx;
    for (const handle of [...fx.dust, fx.exhaust, fx.puff]) if (handle != null) this.vfx?.RemoveSmokeSource(handle);
    fx.dust = [null, null]; fx.exhaust = null; fx.puff = null;
  }
  /**
   * 对岸集结地上空的一层低矮烟尘（部队开进来扬起的土）：九十米外一个人只有十来个像素，成片的烟尘才读得出「一大群」。
   * 战车一露面就起、全撤了就收；几团大而淡的 dust 源（半径 9 m、不透明 0.13），预热成稳态，不参与任何碰撞。
   */
  UpdateHaze(active) {
    if (active && !this.haze) {
      this.haze = HAZE_SPOTS.map(([x, z]) => this.vfx?.SmokeSource({ x, y: this.battlefield.GroundHeight(x, z) + 0.4, z }, HAZE_SOURCE) ?? null);
    } else if (!active && this.haze) {
      for (const handle of this.haze) if (handle != null) this.vfx?.RemoveSmokeSource(handle);
      this.haze = null;
    }
  }
  /** 每帧：把模块给的战车状态画出来。tanks 是 FirstLevelFarBank.tanks（可空 = 全部收起）。 */
  Sync(tanks, time, listener = null) {
    const dt = this.time == null ? 0 : Math.min(0.1, Math.max(0, time - this.time));
    this.time = time;
    const live = new Set();
    let nearest = null, nearestD = Infinity;
    for (const tank of tanks || []) {
      if (!tank.visible) continue;
      live.add(tank.id);
      const entry = this.entries.get(tank.id) || this.Build(tank.id);
      entry.group.visible = true;
      const key = `${tank.x}|${tank.z}|${tank.hullYaw}|${tank.turretYaw}|${tank.gunPitch}|${tank.recoil}`;
      if (key !== entry.key) {
        entry.key = key;
        this.Pose(entry, tank);
        const c = entry.collider;
        c.ry = tank.hullYaw ?? Math.PI;
        c.c = [tank.x, entry.group.position.y + 1.28, tank.z];
        c.min = c.c.map((v, i) => v - c.h[i]); c.max = c.c.map((v, i) => v + c.h[i]);
        if (!entry.registered) { this.physics.AddSolid(c); entry.registered = true; } else this.physics.MoveSolid(c);
      }
      this.UpdateFx(entry, tank, dt, true);
      if (listener) { const d = Math.hypot(tank.x - listener.x, tank.z - listener.z); if (d < nearestD) { nearestD = d; nearest = tank; } }
    }
    this.UpdateHaze(live.size > 0);
    for (const [id, entry] of this.entries) {
      if (live.has(id)) continue;
      entry.group.visible = false;
      this.StopFx(entry);
      if (entry.registered) { this.physics.RemoveSolid(entry.collider._physicsHandle); entry.registered = false; }
    }
    // 发动机循环只跟最近的一辆（三条循环 × 三辆会占满声部预算）。
    const sound = this.Sound;
    if (sound && nearest && dt > 0) {
      const entry = this.entries.get(nearest.id);
      sound.Update(dt, { x: nearest.x, z: nearest.z, groundY: entry.group.position.y, rpm: nearest.rpm, load: nearest.load, speed: nearest.speed,
        pivotRate: nearest.pivotRate, turretRate: 0, cranking: false, damageState: "Intact" });
    }
  }
  Dispose() {
    this.UpdateHaze(false);
    for (const entry of this.entries.values()) {
      this.StopFx(entry);
      if (entry.registered) this.physics.RemoveSolid(entry.collider._physicsHandle);
    }
    const geometries = new Set();
    this.group.traverse((o) => { if (o.isMesh) geometries.add(o.geometry); });
    for (const g of geometries) g.dispose();
    for (const m of this.materials) m.dispose();
    this.group.removeFromParent();
    this.entries.clear();
    this.sound?.StopLoops?.(0.2);
  }
}
