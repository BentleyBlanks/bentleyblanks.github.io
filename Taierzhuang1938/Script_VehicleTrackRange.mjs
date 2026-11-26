// 车辆车辙测试场运行时（?tracks=1）：
// 加载三辆真实精模（八九式中战车 + Type89Motion、九四式轻装甲车 + Type94Mechanism、灰驴两轮木车 + DonkeyWalk/CartRoll），
// 沿平滑闭合缓弯实时驱动并压出真 3D 几何凹陷 + 2 cm GPU 微观细节，同时与场景预置的静态交叉车辙互动。

import * as THREE from "three";
import { ManagedGLTFLoader } from "./Script_ModelImports.mjs";
import { AttachShadowDepth } from "./Script_ShadowDepth.mjs";
import { TerrainTrailSystem } from "./Script_TerrainTrails.mjs";
import { TERRAIN_DEBUG_UNIFORM } from "./Script_TerrainMaterial.mjs";
import { T } from "./Script_Text.mjs";
import { ResolveVehicleTrackProfile } from "./Script_VehicleTrackField.mjs";
import { Type89Motion } from "./Model/Type89MediumTank/Script_Type89Motion.mjs";
import { Type94Mechanism } from "./Model/Type94Tankette/Script_Type94Mechanism.mjs";
import {
  VEHICLE_TRACK_RANGE_VEHICLES,
  VEHICLE_TRACK_RANGE_CAMERAS,
} from "./Data_VehicleTrackRange.mjs";

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const DONKEY_STRIDE_M = 0.68;
const DONKEY_WALK_S = 1.2;
const CART_CIRC_M = Math.PI * 0.8; // wheel radius 0.40 m
const CART_ROLL_S = 2.0;

const STYLE = `
#track-range-panel{position:fixed;left:16px;top:16px;bottom:52px;width:304px;z-index:24;background:rgba(24,27,25,.93);color:#ebe5d5;border:1px solid #6f7363;border-radius:8px;box-shadow:0 8px 28px #0006;font:13px/1.45 system-ui,sans-serif;overflow:auto;pointer-events:auto;padding:14px 16px;box-sizing:border-box}
#track-range-panel *{box-sizing:border-box}
#track-range-panel h2{font-size:18px;margin:0 0 2px;font-weight:650}
#track-range-panel .sub{font-size:11px;color:#b8b5a6;margin:0 0 12px}
#track-range-panel h3{font-size:11px;color:#c2bca8;font-weight:600;letter-spacing:.08em;margin:14px 0 6px;border-top:1px solid #484d43;padding-top:10px}
#track-range-panel .grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}
#track-range-panel .row{display:flex;gap:6px;flex-wrap:wrap}
#track-range-panel button{background:#343a36;border:1px solid #60685c;color:#ebe5d5;border-radius:4px;font:12px/1.3 system-ui,sans-serif;padding:7px 8px;cursor:pointer;flex:1;min-width:0}
#track-range-panel button:hover{background:#475049}
#track-range-panel button[aria-pressed=true]{background:#d2be82;color:#20241d;border-color:#d2be82;font-weight:600}
#track-range-panel .stats{font:11px/1.55 ui-monospace,monospace;color:#c7cab8;white-space:pre-line;background:#1a1e1c;border:1px solid #40463d;border-radius:4px;padding:8px 9px;margin-top:8px}
#track-range-toggle{position:fixed;left:16px;bottom:16px;z-index:25;background:#232a25;color:#ebe5d5;border:1px solid #757b68;border-radius:4px;padding:7px 12px;font:12px system-ui;cursor:pointer}
#track-range-hint{position:fixed;right:16px;bottom:16px;z-index:23;background:rgba(24,29,25,.78);color:#eee8d5;padding:7px 12px;border-radius:4px;font:12px system-ui;pointer-events:none}
`;

/** 将控制点用闭合 Catmull-Rom 重采样为均匀弧长环路，确保弯道连续平滑。 */
function BuildClosedLoop(waypoints, subdivisionsPerSeg = 14) {
  const n = waypoints.length;
  const raw = [];
  const Pt = (i) => waypoints[((i % n) + n) % n];
  for (let i = 0; i < n; i++) {
    const p0 = Pt(i - 1), p1 = Pt(i), p2 = Pt(i + 1), p3 = Pt(i + 2);
    for (let s = 0; s < subdivisionsPerSeg; s++) {
      const t = s / subdivisionsPerSeg;
      const t2 = t * t, t3 = t2 * t;
      const x = 0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3);
      const z = 0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3);
      raw.push({ x, z });
    }
  }
  const cum = [0];
  for (let i = 1; i <= raw.length; i++) {
    const a = raw[i - 1], b = raw[i % raw.length];
    cum.push(cum[i - 1] + Math.hypot(b.x - a.x, b.z - a.z));
  }
  const total = cum[cum.length - 1];
  const Sample = (dist) => {
    const s = ((dist % total) + total) % total;
    let lo = 0, hi = raw.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (cum[mid] <= s) lo = mid; else hi = mid - 1;
    }
    const a = raw[lo], b = raw[(lo + 1) % raw.length];
    const seg = Math.max(1e-6, cum[lo + 1] - cum[lo]);
    const u = (s - cum[lo]) / seg;
    const x = a.x + (b.x - a.x) * u;
    const z = a.z + (b.z - a.z) * u;
    const dx = b.x - a.x, dz = b.z - a.z;
    const len = Math.hypot(dx, dz) || 1;
    const fx = dx / len, fz = dz / len;
    // 项目约定 −Z 为车头，rotation.y = atan2(-fx, -fz)
    const yaw = Math.atan2(-fx, -fz);
    return { x, z, fx, fz, yaw };
  };
  return { total, Sample };
}

function PrepareModelShadows(root) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    if (o.isSkinnedMesh) o.frustumCulled = false;
    AttachShadowDepth(o);
  });
}

export class VehicleTrackRange {
  constructor(host) {
    this.host = host;
    this.ready = false;
    this.error = null;
    this.disposed = false;
    this.paused = false;
    this.panelShown = true;
    this.vehiclesVisible = true;
    this.displacementEnabled = true;
    this.wetness = 1.1;
    this.debugView = 0;
    this.activeCam = "overview";
    this.simTime = 0;
    this.loadedCount = 0;

    this.root = new THREE.Group();
    this.root.name = "VehicleTrackRangeActors";
    host.scene.add(this.root);

    this.actors = [];
    this.listeners = [];
    this.keys = new Set();
    this._focus = new THREE.Vector3();
    this._statsTimer = 0;

    // 自由环绕 + WASD 观察相机
    const firstCam = VEHICLE_TRACK_RANGE_CAMERAS[0];
    this.target = V(...firstCam.target);
    this.radius = firstCam.radius;
    this.azimuth = firstCam.azimuth;
    this.elevation = firstCam.elevation;

    host.SetViewmodelHidden?.(true);
    this._BuildUi();
    this._BindInput();

    this.api = {
      State: () => this.State(),
      Camera: (id) => this.Camera(id),
      Pause: (on) => this.Pause(on),
      Step: (seconds = 0.5) => this.Step(seconds),
      Reset: () => this.Reset(),
      SetDisplacement: (on) => this.SetDisplacement(on),
      SetWetness: (value) => this.SetWetness(value),
      SetDebugView: (mode) => this.SetDebugView(mode),
      SetVehiclesVisible: (on) => this.SetVehiclesVisible(on),
      ShowPanel: (on) => this.ShowPanel(on),
      SampleDepth: (x, z) => this.host.battlefield?.vehicleTrackField?.DepthAt(x, z) ?? 0,
      SampleOffset: (x, z) => this.host.battlefield?.vehicleTrackField?.OffsetAt(x, z) ?? 0,
      ProfileCrossSection: (x0, z0, x1, z1, samples = 25) => this.ProfileCrossSection(x0, z0, x1, z1, samples),
    };

    this.loading = this._LoadVehicles();
  }

  _Listen(target, name, fn, options) {
    target.addEventListener(name, fn, options);
    this.listeners.push(() => target.removeEventListener(name, fn, options));
  }

  _Cut() {
    this.host.post?.NotifyCameraCut?.();
    this.host.NotifyCameraCut?.();
  }

  async _LoadVehicles() {
    const loader = new ManagedGLTFLoader();
    try {
      const [t89Gltf, t89Path, t94Gltf, t94Meta, dcGltf] = await Promise.all([
        loader.loadAsync("./Model/Type89MediumTank/Model_Type89MediumTank.glb").then((r) => { this.loadedCount++; this._PaintStats(); return r; }),
        fetch("./Model/Type89MediumTank/Data_TrackPath.json").then((r) => r.json()),
        loader.loadAsync("./Model/Type94Tankette/Model_Type94Tankette.glb").then((r) => { this.loadedCount++; this._PaintStats(); return r; }),
        fetch("./Model/Type94Tankette/Data_Type94Tankette.json").then((r) => r.json()),
        loader.loadAsync("./Model/DonkeyCart/Model_DonkeyCart.glb").then((r) => { this.loadedCount++; this._PaintStats(); return r; }),
      ]);
      if (this.disposed) return;

      const byId = Object.fromEntries(VEHICLE_TRACK_RANGE_VEHICLES.map((v) => [v.id, v]));

      // 1. 八九式中战车
      {
        const spec = byId.type89;
        const root = new THREE.Group();
        root.name = "TrackRange_Type89Tank";
        PrepareModelShadows(t89Gltf.scene);
        root.add(t89Gltf.scene);
        this.root.add(root);
        let motion = null;
        try { motion = new Type89Motion(t89Gltf.scene, t89Path); } catch (e) { console.warn("[TrackRange] Type89Motion fallback", e); }
        const profile = ResolveVehicleTrackProfile(spec.profile);
        this.actors.push({
          id: spec.id,
          spec,
          profile,
          root,
          loop: BuildClosedLoop(spec.waypoints),
          distanceM: 0,
          leftM: 0,
          rightM: 0,
          prevYaw: null,
          drive: (leftM, rightM) => motion?.SetTravel(leftM, rightM),
        });
        TerrainTrailSystem.TrackVehicle(root, profile, { fixedGauge: false });
      }

      // 2. 九四式轻装甲车
      {
        const spec = byId.type94;
        const root = new THREE.Group();
        root.name = "TrackRange_Type94Tankette";
        PrepareModelShadows(t94Gltf.scene);
        root.add(t94Gltf.scene);
        this.root.add(root);
        let mech = null;
        try { mech = new Type94Mechanism(t94Gltf.scene, t94Meta.mechanisms.path); } catch (e) { console.warn("[TrackRange] Type94Mechanism fallback", e); }
        const profile = ResolveVehicleTrackProfile(spec.profile);
        this.actors.push({
          id: spec.id,
          spec,
          profile,
          root,
          loop: BuildClosedLoop(spec.waypoints),
          distanceM: 0,
          leftM: 0,
          rightM: 0,
          prevYaw: null,
          drive: (leftM, rightM) => {
            if (!mech) return;
            mech.SetBeltDistance("Left", leftM);
            mech.SetBeltDistance("Right", rightM);
          },
        });
        TerrainTrailSystem.TrackVehicle(root, profile, { fixedGauge: false });
      }

      // 3. 灰驴两轮木车（保留骨骼动画 DonkeyWalk + CartRoll）
      {
        const spec = byId.donkeyCart;
        const root = new THREE.Group();
        root.name = "TrackRange_DonkeyCart";
        PrepareModelShadows(dcGltf.scene);
        root.add(dcGltf.scene);
        this.root.add(root);
        const mixer = new THREE.AnimationMixer(dcGltf.scene);
        const walkClip = dcGltf.animations.find((c) => c.name === "DonkeyWalk");
        const rollClip = dcGltf.animations.find((c) => c.name === "CartRoll");
        const walkAction = walkClip ? mixer.clipAction(walkClip) : null;
        const rollAction = rollClip ? mixer.clipAction(rollClip) : null;
        walkAction?.play();
        rollAction?.play();
        const profile = ResolveVehicleTrackProfile(spec.profile);
        this.actors.push({
          id: spec.id,
          spec,
          profile,
          root,
          mixer,
          loop: BuildClosedLoop(spec.waypoints),
          distanceM: 0,
          leftM: 0,
          rightM: 0,
          prevYaw: null,
          drive: (leftM, rightM) => {
            const dist = 0.5 * (leftM + rightM);
            if (walkAction) walkAction.time = ((dist / DONKEY_STRIDE_M) * DONKEY_WALK_S) % walkClip.duration;
            if (rollAction) rollAction.time = ((dist / CART_CIRC_M) * CART_ROLL_S) % rollClip.duration;
            mixer.update(0);
          },
        });
        TerrainTrailSystem.TrackVehicle(root, profile, { useNodes: true });
      }

      this.ready = true;
      // 进场预推几米行驶路径：第一帧即可同时看到三辆实车 + 身后 13–15 m 鲜明真 3D 凹陷车辙 + 静态交叉车辙！
      this._PreRollTracks();
      this.SetWetness(this.wetness);
      this.Camera("overview");
      this._PaintStats();
    } catch (error) {
      this.error = String(error?.message || error);
      console.error("[VehicleTrackRange]", error);
      this._PaintStats();
    }
  }

  /** 将三辆车从起跑线按固定小步推进到起始展位，留下完整连续的 3D 真凹陷与 GPU 微观细节。 */
  _PreRollTracks() {
    const steps = 70;
    const stepDt = 0.08;
    const savedPaused = this.paused;
    const savedIdleSkip = TerrainTrailSystem.idleSkip;
    this.paused = false;
    TerrainTrailSystem.idleSkip = false;
    for (const actor of this.actors) {
      actor.distanceM = 0;
      actor.leftM = 0;
      actor.rightM = 0;
      actor.prevYaw = null;
    }
    this._PlaceActors(0);
    TerrainTrailSystem.Update(0.016, { focus: this.host.camera.getWorldPosition(this._focus), scene: this.host.scene });
    for (let i = 0; i < steps; i++) {
      this._StepSimulation(stepDt);
    }
    this.host.battlefield?.UpdateVehicleTracks?.();
    TerrainTrailSystem.generation++;
    TerrainTrailSystem.idleSkip = savedIdleSkip;
    this.paused = savedPaused;
  }

  _PlaceActors(dt) {
    const field = this.host.battlefield;
    const baseHeight = (x, z) => field?.TerrainHeight?.(x, z) ?? 0;
    const rutOffset = (x, z) => field?.VehicleTrackOffsetAt?.(x, z) ?? 0;
    for (const actor of this.actors) {
      const advance = actor.spec.speedMps * dt;
      actor.distanceM += advance;
      const pose = actor.loop.Sample(actor.distanceM);
      // 差分左右履带行驶距离（弯道外侧走得更快）
      let dYaw = 0;
      if (actor.prevYaw !== null) {
        dYaw = Math.atan2(Math.sin(pose.yaw - actor.prevYaw), Math.cos(pose.yaw - actor.prevYaw));
      }
      actor.prevYaw = pose.yaw;
      const halfGauge = actor.profile.id === "type89Tank" ? 0.92 : actor.profile.id === "type94Tankette" ? 0.66 : 0.68;
      actor.leftM += advance - dYaw * halfGauge;
      actor.rightM += advance + dYaw * halfGauge;

      // 按地形坡度 + 车辙真沉陷贴合车身姿态
      const halfL = actor.profile.id === "type89Tank" ? 1.8 : actor.profile.id === "type94Tankette" ? 1.1 : 1.1;
      const rx = -pose.fz, rz = pose.fx;
      const sink = actor.profile.sinkFactor ?? 0.45;
      const hC = baseHeight(pose.x, pose.z) + rutOffset(pose.x, pose.z) * sink;
      const hF = baseHeight(pose.x + pose.fx * halfL, pose.z + pose.fz * halfL);
      const hB = baseHeight(pose.x - pose.fx * halfL, pose.z - pose.fz * halfL);
      const hL = baseHeight(pose.x - rx * halfGauge, pose.z - rz * halfGauge);
      const hR = baseHeight(pose.x + rx * halfGauge, pose.z + rz * halfGauge);
      const pitch = Math.atan2(hF - hB, halfL * 2);
      const roll = Math.atan2(hL - hR, halfGauge * 2);

      actor.root.position.set(pose.x, hC, pose.z);
      actor.root.rotation.order = "YXZ";
      actor.root.rotation.set(pitch, pose.yaw, roll);
      actor.root.visible = this.vehiclesVisible;
      actor.drive(actor.leftM, actor.rightM);
      actor.root.updateMatrixWorld(true);
    }
  }

  _StepSimulation(dt) {
    if (!this.ready || dt <= 0) return;
    this.simTime += dt;
    this._PlaceActors(dt);
    TerrainTrailSystem.Update(dt, {
      focus: this.host.camera.getWorldPosition(this._focus),
      scene: this.host.scene,
    });
    this.host.battlefield?.UpdateVehicleTracks?.();
  }

  Update(dt) {
    if (this.disposed) return;
    const step = Math.min(Math.max(dt || 0, 0), 0.1);
    if (this.ready && !this.paused && step > 0) {
      this._StepSimulation(step);
    } else if (this.ready) {
      // 暂停时照旧推一下相机焦点同步（保持 GPU 痕迹靶跟随相机滑动回填静态与动态车辙）
      TerrainTrailSystem.Update(0, {
        focus: this.host.camera.getWorldPosition(this._focus),
        scene: this.host.scene,
      });
      this.host.battlefield?.UpdateVehicleTracks?.();
    }
    this._statsTimer += step || 0.016;
    if (this._statsTimer >= 0.25) {
      this._statsTimer = 0;
      this._PaintStats();
    }
  }

  UpdateCamera(dt) {
    if (this.disposed) return;
    const camera = this.host.camera;
    // WASD / QE 飞行微调焦点
    if (dt > 0 && this.keys.size && this.host.CanUse?.()) {
      const speed = (this.keys.has("ShiftLeft") || this.keys.has("ShiftRight") ? 14 : 6) * dt;
      const fwdX = -Math.sin(this.azimuth), fwdZ = -Math.cos(this.azimuth);
      const rightX = Math.cos(this.azimuth), rightZ = -Math.sin(this.azimuth);
      if (this.keys.has("KeyW")) { this.target.x += fwdX * speed; this.target.z += fwdZ * speed; }
      if (this.keys.has("KeyS")) { this.target.x -= fwdX * speed; this.target.z -= fwdZ * speed; }
      if (this.keys.has("KeyD")) { this.target.x += rightX * speed; this.target.z += rightZ * speed; }
      if (this.keys.has("KeyA")) { this.target.x -= rightX * speed; this.target.z -= rightZ * speed; }
      if (this.keys.has("KeyE")) this.target.y += speed * 0.6;
      if (this.keys.has("KeyQ")) this.target.y = Math.max(-0.5, this.target.y - speed * 0.6);
    }
    const cosE = Math.cos(this.elevation);
    const x = this.target.x + Math.sin(this.azimuth) * cosE * this.radius;
    const y = Math.max(0.18, this.target.y + Math.sin(this.elevation) * this.radius);
    const z = this.target.z + Math.cos(this.azimuth) * cosE * this.radius;
    camera.position.set(x, y, z);
    camera.lookAt(this.target);
    camera.updateMatrixWorld();
  }

  Camera(id) {
    const preset = VEHICLE_TRACK_RANGE_CAMERAS.find((c) => c.id === id) || VEHICLE_TRACK_RANGE_CAMERAS[0];
    this.activeCam = preset.id;
    this.target.set(...preset.target);
    this.radius = preset.radius;
    this.azimuth = preset.azimuth;
    this.elevation = preset.elevation;
    this.UpdateCamera(0);
    this._Cut();
    this._SyncButtons();
    return preset.id;
  }

  Pause(on = !this.paused) {
    this.paused = !!on;
    this._SyncButtons();
    return this.paused;
  }

  Step(seconds = 0.5) {
    if (!this.ready) return 0;
    const chunks = Math.max(1, Math.ceil(seconds / 0.05));
    const dt = seconds / chunks;
    for (let i = 0; i < chunks; i++) this._StepSimulation(dt);
    this._PaintStats();
    return this.simTime;
  }

  Reset() {
    const field = this.host.battlefield;
    TerrainTrailSystem.Reset({ keepStatic: false });
    if (field?.layout?.vehicleTracks?.length) {
      TerrainTrailSystem.AddStaticTracks(field.layout.vehicleTracks);
      field.UpdateVehicleTracks?.();
    }
    if (this.ready) this._PreRollTracks();
    this._PaintStats();
    return this.State();
  }

  SetDisplacement(on = !this.displacementEnabled) {
    this.displacementEnabled = !!on;
    TerrainTrailSystem.SetDisplacementEnabled(this.displacementEnabled);
    this._SyncButtons();
    return this.displacementEnabled;
  }

  SetWetness(value) {
    this.wetness = Math.max(0, Math.min(3, Number(value) || 0));
    this.host.battlefield?.SetTerrainWetness?.(this.wetness);
    this._SyncButtons();
    return this.wetness;
  }

  SetDebugView(mode) {
    this.debugView = Number(mode) || 0;
    TERRAIN_DEBUG_UNIFORM.value = this.debugView;
    this._SyncButtons();
    return this.debugView;
  }

  SetVehiclesVisible(on = !this.vehiclesVisible) {
    this.vehiclesVisible = !!on;
    for (const actor of this.actors) actor.root.visible = this.vehiclesVisible;
    this._SyncButtons();
    return this.vehiclesVisible;
  }

  ShowPanel(on = !this.panelShown) {
    this.panelShown = !!on;
    if (this.panel) this.panel.style.display = this.panelShown ? "" : "none";
    if (this.toggleBtn) this.toggleBtn.textContent = T(this.panelShown ? "tracks.hide" : "tracks.show");
    return this.panelShown;
  }

  ProfileCrossSection(x0, z0, x1, z1, samples = 25) {
    const field = this.host.battlefield?.vehicleTrackField;
    if (!field) return [];
    const out = [];
    for (let i = 0; i < samples; i++) {
      const t = samples === 1 ? 0 : i / (samples - 1);
      const x = x0 + (x1 - x0) * t;
      const z = z0 + (z1 - z0) * t;
      out.push({
        t: +t.toFixed(3),
        x: +x.toFixed(3),
        z: +z.toFixed(3),
        offsetM: +field.OffsetAt(x, z).toFixed(4),
        depthM: +field.DepthAt(x, z).toFixed(4),
      });
    }
    return out;
  }

  State() {
    const trails = TerrainTrailSystem.Describe();
    return {
      ready: this.ready,
      error: this.error,
      paused: this.paused,
      simTime: +this.simTime.toFixed(2),
      activeCam: this.activeCam,
      displacementEnabled: this.displacementEnabled,
      wetness: this.wetness,
      debugView: this.debugView,
      vehiclesVisible: this.vehiclesVisible,
      vehicles: this.actors.map((a) => ({
        id: a.id,
        profile: a.profile.id,
        x: +a.root.position.x.toFixed(2),
        y: +a.root.position.y.toFixed(3),
        z: +a.root.position.z.toFixed(2),
        distanceM: +a.distanceM.toFixed(2),
      })),
      trails,
    };
  }

  _BindInput() {
    const canvas = this.host.canvas;
    if (!canvas) return;
    let dragMode = null, lastX = 0, lastY = 0;
    this._Listen(canvas, "contextmenu", (e) => e.preventDefault());
    this._Listen(canvas, "pointerdown", (e) => {
      if (!this.host.CanUse?.()) return;
      dragMode = e.button === 2 || e.button === 1 ? "pan" : "orbit";
      lastX = e.clientX; lastY = e.clientY;
      canvas.setPointerCapture?.(e.pointerId);
    });
    this._Listen(canvas, "pointermove", (e) => {
      if (!dragMode) return;
      const dx = e.clientX - lastX, dy = e.clientY - lastY;
      lastX = e.clientX; lastY = e.clientY;
      if (dragMode === "orbit") {
        this.azimuth -= dx * 0.006;
        this.elevation = Math.max(0.06, Math.min(1.42, this.elevation + dy * 0.005));
      } else {
        const pan = this.radius * 0.0018;
        const rightX = Math.cos(this.azimuth), rightZ = -Math.sin(this.azimuth);
        const fwdX = -Math.sin(this.azimuth), fwdZ = -Math.cos(this.azimuth);
        this.target.x -= rightX * dx * pan - fwdX * dy * pan;
        this.target.z -= rightZ * dx * pan - fwdZ * dy * pan;
      }
      this.UpdateCamera(0);
    });
    const endDrag = () => { dragMode = null; };
    this._Listen(canvas, "pointerup", endDrag);
    this._Listen(canvas, "pointercancel", endDrag);
    this._Listen(canvas, "wheel", (e) => {
      if (!this.host.CanUse?.()) return;
      e.preventDefault();
      this.radius = Math.max(2.2, Math.min(48, this.radius * (1 + Math.sign(e.deltaY) * 0.1)));
      this.UpdateCamera(0);
    }, { passive: false });
    this._Listen(window, "keydown", (e) => { this.keys.add(e.code); });
    this._Listen(window, "keyup", (e) => { this.keys.delete(e.code); });
  }

  _BuildUi() {
    if (typeof document === "undefined") return;
    this.styleEl = document.createElement("style");
    this.styleEl.textContent = STYLE;
    document.head.appendChild(this.styleEl);

    const panel = document.createElement("aside");
    panel.id = "track-range-panel";
    panel.dataset.labPanel = "tracks";
    const h2 = document.createElement("h2");
    h2.textContent = T("tracks.title");
    const sub = document.createElement("div");
    sub.className = "sub";
    sub.textContent = T("tracks.subtitle");
    panel.append(h2, sub);

    // 1. 播放控制
    const hPlay = document.createElement("h3");
    hPlay.textContent = T("tracks.section.playback");
    const playRow = document.createElement("div");
    playRow.className = "row";
    this.btnPause = this._Btn(T("tracks.pause"), () => this.Pause());
    this.btnStep = this._Btn(T("tracks.step"), () => this.Step(0.5));
    this.btnReset = this._Btn(T("tracks.reset"), () => this.Reset());
    playRow.append(this.btnPause, this.btnStep, this.btnReset);
    panel.append(hPlay, playRow);

    // 2. 机位预设
    const hCam = document.createElement("h3");
    hCam.textContent = T("tracks.section.cameras");
    const camGrid = document.createElement("div");
    camGrid.className = "grid";
    this.camBtns = new Map();
    for (const cam of VEHICLE_TRACK_RANGE_CAMERAS) {
      const btn = this._Btn(T(cam.labelKey), () => this.Camera(cam.id));
      this.camBtns.set(cam.id, btn);
      camGrid.appendChild(btn);
    }
    panel.append(hCam, camGrid);

    // 3. A/B 与地表对照
    const hCmp = document.createElement("h3");
    hCmp.textContent = T("tracks.section.compare");
    const cmpRow1 = document.createElement("div");
    cmpRow1.className = "row";
    this.btnDisp = this._Btn(T("tracks.dispOn"), () => this.SetDisplacement());
    this.btnVeh = this._Btn(T("tracks.vehiclesOn"), () => this.SetVehiclesVisible());
    cmpRow1.append(this.btnDisp, this.btnVeh);

    const wetLabel = document.createElement("div");
    wetLabel.className = "sub";
    wetLabel.style.margin = "8px 0 4px";
    wetLabel.textContent = T("tracks.wetness");
    const wetRow = document.createElement("div");
    wetRow.className = "row";
    this.wetBtns = [
      [0.3, this._Btn(T("tracks.wet.dry"), () => this.SetWetness(0.3))],
      [1.1, this._Btn(T("tracks.wet.damp"), () => this.SetWetness(1.1))],
      [2.4, this._Btn(T("tracks.wet.rain"), () => this.SetWetness(2.4))],
    ];
    for (const [, btn] of this.wetBtns) wetRow.appendChild(btn);

    const viewLabel = document.createElement("div");
    viewLabel.className = "sub";
    viewLabel.style.margin = "8px 0 4px";
    viewLabel.textContent = T("tracks.debugView");
    const viewRow = document.createElement("div");
    viewRow.className = "row";
    this.viewBtns = [
      [0, this._Btn(T("tracks.view.lit"), () => this.SetDebugView(0))],
      [3, this._Btn(T("tracks.view.normal"), () => this.SetDebugView(3))],
      [8, this._Btn(T("tracks.view.trail"), () => this.SetDebugView(8))],
    ];
    for (const [, btn] of this.viewBtns) viewRow.appendChild(btn);
    panel.append(hCmp, cmpRow1, wetLabel, wetRow, viewLabel, viewRow);

    // 4. 实时统计
    const hStats = document.createElement("h3");
    hStats.textContent = T("tracks.section.stats");
    this.statsEl = document.createElement("div");
    this.statsEl.className = "stats";
    panel.append(hStats, this.statsEl);

    document.body.appendChild(panel);
    this.panel = panel;

    this.toggleBtn = document.createElement("button");
    this.toggleBtn.id = "track-range-toggle";
    this.toggleBtn.textContent = T("tracks.hide");
    this.toggleBtn.addEventListener("click", () => this.ShowPanel());
    document.body.appendChild(this.toggleBtn);

    this.hintEl = document.createElement("div");
    this.hintEl.id = "track-range-hint";
    this.hintEl.textContent = T("tracks.hint");
    document.body.appendChild(this.hintEl);

    this._SyncButtons();
    this._PaintStats();
  }

  _Btn(label, onClick) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.addEventListener("click", onClick);
    return b;
  }

  _SyncButtons() {
    if (!this.panel) return;
    this.btnPause.textContent = T(this.paused ? "tracks.play" : "tracks.pause");
    this.btnPause.setAttribute("aria-pressed", String(this.paused));
    this.btnDisp.textContent = T(this.displacementEnabled ? "tracks.dispOn" : "tracks.dispOff");
    this.btnDisp.setAttribute("aria-pressed", String(this.displacementEnabled));
    this.btnVeh.textContent = T(this.vehiclesVisible ? "tracks.vehiclesOn" : "tracks.vehiclesOff");
    this.btnVeh.setAttribute("aria-pressed", String(!this.vehiclesVisible));
    for (const [id, btn] of this.camBtns) btn.setAttribute("aria-pressed", String(id === this.activeCam));
    for (const [v, btn] of this.wetBtns) btn.setAttribute("aria-pressed", String(Math.abs(this.wetness - v) < 0.15));
    for (const [v, btn] of this.viewBtns) btn.setAttribute("aria-pressed", String(this.debugView === v));
  }

  _PaintStats() {
    if (!this.statsEl) return;
    if (this.error) {
      this.statsEl.textContent = T("tracks.error", { error: this.error });
      return;
    }
    if (!this.ready) {
      this.statsEl.textContent = T("tracks.loading", { done: this.loadedCount, total: 3 });
      return;
    }
    const field = this.host.battlefield?.vehicleTrackField;
    const desc = TerrainTrailSystem.Describe();
    const disp = desc.displacement;
    const SampleLaneMax = (xCenter, z) => {
      if (!field) return 0;
      let maxD = 0;
      for (let dx = -1.3; dx <= 1.3; dx += 0.08) maxD = Math.max(maxD, field.DepthAt(xCenter + dx, z));
      return maxD;
    };
    this.statsEl.textContent = T("tracks.stats", {
      tiles: disp?.tiles ?? 0,
      cellCm: field ? (field.cellM * 100).toFixed(1) : "0",
      tris: disp?.triangles ?? 0,
      stamps: desc.stats.stamps,
      staticStamps: desc.staticStamps,
      d89: (SampleLaneMax(-8.5, 9) * 100).toFixed(1),
      d94: (SampleLaneMax(0.0, 9) * 100).toFixed(1),
      ddc: (SampleLaneMax(9.0, 9) * 100).toFixed(1),
    });
  }

  Dispose() {
    if (this.disposed) return;
    this.disposed = true;
    TERRAIN_DEBUG_UNIFORM.value = 0;
    for (const off of this.listeners) off();
    this.listeners.length = 0;
    for (const actor of this.actors) {
      TerrainTrailSystem.UntrackVehicle(actor.root);
      actor.mixer?.stopAllAction();
      actor.root.removeFromParent();
    }
    this.actors.length = 0;
    this.root.removeFromParent();
    this.panel?.remove();
    this.toggleBtn?.remove();
    this.hintEl?.remove();
    this.styleEl?.remove();
  }
}

export default VehicleTrackRange;
