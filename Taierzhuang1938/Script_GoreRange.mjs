// 断肢测试场运行时（?gore=1）：
//   · 默认加载 BlenderMCP 精切版日军士兵A测试副本（Model_JapaneseSoldierAGoreTest.glb）
//     并绑定 65 骨 XBotSkin + HairGroom + 雕刻 PBR 解剖断面盖；支持一键切换旧模型对照；
//   · 提供 6 套实时实景演示（大刀斩首 / 大刀断臂 / 手雷近炸 / 机枪扫射断肢 / 重机枪爆头碎裂 / 弹飞钢盔），
//     全部走正式战斗与断肢核心链（Kill / TakeHit / Blast / Gore.Sever / PopHelmet）；
//   · 支持 1× / 0.2× / 0.05× 慢放、暂停/单步、自由观察相机（WASD+QE）与第一人称无缝切换。
// 约束：零 Math.random、玩家可见文案全部走 Data_Text_Range.mjs、保持 Debug.GoreRange 全向后兼容。

import * as THREE from "three";
import { WEAPONS } from "./Data_Weapons.mjs";
import { GoreLab } from "./Script_GoreLab.mjs";
import { XBotSkins } from "./Script_EditorBlockoutXBot.mjs";
import { LoadStumpAssets } from "./Script_CharacterGore.mjs";
import {
  GORE_RANGE_POSTS, GORE_CRATER, GORE_LIMB_BUTTONS, GORE_SLOW_MOTION,
  GORE_TEST_CHARACTER, GORE_CAMERA_PRESETS, GORE_STATION_TELEPORTS,
} from "./Data_GoreRange.mjs";

const GRENADE = WEAPONS.Grenade;
const STEP_DT = 1 / 60;
const PAUSED_DT = 1e-5;
const FREE_CAMERA = Object.freeze({ speedMps: 8.5, fastScale: 2.6, minAboveGroundM: 0.3, maxPitch: Math.PI / 2 - 0.02 });

const TMP_A = new THREE.Vector3();
const TMP_B = new THREE.Vector3();
const TMP_DIR = new THREE.Vector3();

export class GoreRange {
  constructor(host) {
    this.host = host;
    this.posts = [];
    this.clock = 0;
    this.realDt = 1 / 60;
    this.nextPaint = 0;
    this.frameMs = 0;
    this.lastStamp = 0;
    this.timeScale = 1;
    this.slowMotion = false;
    this.paused = false;
    this.stepFrames = 0;
    this.force = null;
    this.detonations = 0;
    this.severCommands = 0;
    this.rngState = 19380317;
    this.lastLive = 0;
    this.useCutModel = true;
    this.activeDemo = null;
    this.demoQueue = [];
    this.demoVisuals = [];
    this.disposed = false;

    // 相机状态：默认第一人称（保证 ?gore=1 原有测试与实战体验 100% 一致），点演示或自由相机时切自由模式。
    this.cameraMode = "player";
    this.cameraPreset = null;
    this.cam = { pos: new THREE.Vector3(3340, 2.2, 3362), yaw: 0, pitch: -0.1, lastPlayerYaw: 0 };
    this.keys = new Set();
    this.viewmodelHidden = false;
    this.activeWeapon = "HanYang";

    this.OnKey = (event) => this.HandleKey(event, event.type === "keydown");
    this.OnBlur = () => this.keys.clear();
    if (typeof window !== "undefined") {
      window.addEventListener("keydown", this.OnKey, true);
      window.addEventListener("keyup", this.OnKey, true);
      window.addEventListener("blur", this.OnBlur);
    }

    // 异步载入精切日军士兵A副本（XBotSkins）与雕刻 PBR 断面合集，载完自动无缝换装到所有木桩兵！
    this.xbotSkins = new XBotSkins({
      characterKeys: [GORE_TEST_CHARACTER.key],
      customCharacters: { [GORE_TEST_CHARACTER.key]: GORE_TEST_CHARACTER },
    });
    this.xbotSkins.view = {
      camera: host.camera,
      renderer: host.renderer,
      post: host.post || null,
      lightRig: host.lights || null,
    };
    this.assetsReady = Promise.all([
      this.xbotSkins.Load(),
      LoadStumpAssets(),
    ]).then(() => {
      if (this.disposed) return;
      if (this.useCutModel) this.ApplySkinsToPosts();
      this.PaintPanel();
    }).catch((err) => {
      console.warn("[GoreRange] Gore test asset preload warning:", err);
    });

    this.Seed();
    this.lab = new GoreLab(this);

    this.api = {
      State: () => this.State(),
      Reset: () => this.Reset(),
      Detonate: () => this.Detonate(),
      Target: () => this.TargetSummary(),
      SeverLimb: (limbId, postId = null) => this.SeverLimb(limbId, postId),
      SeverRandom: () => this.SeverRandom(),
      PopHelmet: (postId = null) => this.PopHelmet(postId),
      SetForce: (kind) => this.SetForce(kind),
      SetSlowMotion: (on) => this.SetSlowMotion(on),
      SetTimeScale: (scale) => this.SetTimeScale(scale),
      SetPaused: (on) => this.SetPaused(on),
      StepFrame: (n = 1) => this.StepFrame(n),
      SetCutModel: (on) => this.SetCutModel(on),
      PlayDemo: (demoId) => this.PlayDemo(demoId),
      EquipWeapon: (weaponId) => this.EquipWeapon(weaponId),
      SetCameraMode: (mode) => this.SetCameraMode(mode),
      FocusPreset: (presetId) => this.FocusPreset(presetId),
      SetCameraPose: (pose) => this.SetCameraPose(pose),
      TeleportStation: (stationId) => this.TeleportStation(stationId),
      LimbPoint: (postId, limbId) => this.LimbPointOf(postId, limbId),
      Posts: () => this.posts.map((entry) => ({ ...entry.spec })),
      Ready: () => this.assetsReady,
    };
  }

  // -------------------------------------------------------------------------
  // 木桩兵与精切模型绑定
  // -------------------------------------------------------------------------

  Rng() {
    this.rngState = (this.rngState * 1664525 + 1013904223) >>> 0;
    return this.rngState / 4294967296;
  }

  AttachCutSkin(soldier, postId) {
    if (!this.useCutModel || !this.xbotSkins?.ready || !soldier?.actor) return null;
    if (this.host.ai?.view?.skins?.has(soldier)) return this.host.ai.view.skins.get(soldier);
    const skin = this.xbotSkins.Attach(soldier.actor, {
      faction: "ija",
      unitId: `Gore_${postId}`,
      seed: postId,
      kitKey: GORE_TEST_CHARACTER.key,
      goreEnabled: true,
    });
    if (!skin) return null;
    // 藏掉旧卢沟桥骨架自带的背后钢盔/挂件（只保留手持步枪 weaponGroup），避免精切日军A背上多出一顶绿钢盔！
    const weaponRoot = soldier.actor.weaponGroup;
    const keepNodes = new Set();
    if (weaponRoot) weaponRoot.traverse((n) => keepNodes.add(n));
    soldier.actor.characterRig?.root?.traverse((o) => {
      if (o.isMesh && !o.isSkinnedMesh && !keepNodes.has(o)) o.visible = false;
    });
    this.host.ai?.view?.SetSkin?.(soldier, skin);
    this.host.ai?.view?.Place?.(soldier);
    this.host.ai?.view?.SyncSkin?.(soldier, 0, {
      moveSpeed: 0, aim: 0, crouch: 0, prone: 0, grounded: true, dead: !soldier.alive,
    });
    return skin;
  }

  ApplySkinsToPosts() {
    for (const entry of this.posts) {
      if (entry.soldier?.alive) this.AttachCutSkin(entry.soldier, entry.spec.id);
    }
  }

  SetCutModel(on) {
    this.useCutModel = !!on;
    this.Reset();
    return this.useCutModel;
  }

  SpawnPost(spec) {
    const soldier = this.host.ai.Spawn("ija", spec.x, spec.z, {
      weapon: spec.weapon || "Type38", squadId: `Gore_${spec.id}`,
    });
    if (!soldier) return null;
    soldier.dummy = true;
    soldier.order = "hold";
    soldier.holdZone = { id: `Gore_${spec.id}`, x: spec.x, z: spec.z, radius: 1.5 };
    const y = spec.standY || 0;
    soldier.position.set(spec.x, y, spec.z);
    soldier.body?.Teleport(spec.x, y, spec.z);
    soldier.goal.set(spec.x, 0, spec.z);
    soldier.yaw = spec.yaw;
    soldier.lookYaw = spec.yaw;
    if (this.useCutModel && this.xbotSkins?.ready) {
      this.AttachCutSkin(soldier, spec.id);
    }
    return soldier;
  }

  Seed() {
    this.posts.length = 0;
    for (const spec of GORE_RANGE_POSTS) this.posts.push({ spec, soldier: this.SpawnPost(spec) });
  }

  ClearDemoVisuals() {
    this.demoQueue.length = 0;
    for (const item of this.demoVisuals) {
      if (item.mesh?.parent) item.mesh.parent.remove(item.mesh);
      item.mesh?.geometry?.dispose?.();
      item.mesh?.material?.dispose?.();
    }
    this.demoVisuals.length = 0;
  }

  /** 整场复位：断肢与血渍全部释放，木桩兵全部重立，玩家满血满弹。 */
  Reset({ keepDemo = false } = {}) {
    if (!keepDemo) this.activeDemo = null;
    this.ClearDemoVisuals();
    const gore = this.host.Gore?.();
    gore?.Reset?.();
    this.host.vfx?.bloodEffects?.decals?.Clear?.();
    for (const entry of this.posts) if (entry.soldier) this.host.ai.Remove(entry.soldier);
    this.Seed();
    this.force = null;
    gore?.SetForce?.(null);
    const player = this.host.player;
    if (player) { player.health = 100; player.bleeding = false; }
    this.PaintPanel();
    return this.State();
  }

  Post(id) { return this.posts.find((entry) => entry.spec.id === id) || null; }

  // -------------------------------------------------------------------------
  // 一键实景演示（刀砍 / 爆炸 / 枪击 / 爆头 / 钢盔弹飞）
  // -------------------------------------------------------------------------

  /** 在白刃演示瞬间生成一道半透明钢刃斩光弧，让慢动作下刀轨清晰可见。 */
  SpawnBladeArcVisual(center, normalDir) {
    const scene = this.host.scene;
    if (!scene) return;
    const geom = new THREE.RingGeometry(0.45, 0.96, 28, 1, -Math.PI * 0.42, Math.PI * 0.84);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xeae5d6, transparent: true, opacity: 0.72, side: THREE.DoubleSide, depthWrite: false,
    });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.name = "GoreDemoBladeArc";
    mesh.position.copy(center);
    mesh.rotation.x = Math.PI * 0.48;
    mesh.rotation.z = normalDir.x >= 0 ? -0.35 : 0.35;
    scene.add(mesh);
    this.demoVisuals.push({ mesh, age: 0, life: 0.28, spinY: 7.5 });
  }

  /** 在爆破演示起爆前于爆心放置一颗实景木柄手榴弹短闪提示。 */
  SpawnCraterFuseVisual(at) {
    const scene = this.host.scene;
    if (!scene) return;
    const geom = new THREE.CylinderGeometry(0.032, 0.032, 0.24, 10);
    const mat = new THREE.MeshStandardMaterial({ color: 0x5c4632, roughness: 0.7, emissive: 0x6b2608, emissiveIntensity: 0.9 });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.name = "GoreDemoGrenade";
    mesh.position.copy(at).add(new THREE.Vector3(0, 0.14, 0));
    mesh.rotation.z = Math.PI * 0.38;
    scene.add(mesh);
    this.demoVisuals.push({ mesh, age: 0, life: 0.18, spinY: 0 });
  }

  /** 发射一条可见高能曳光弹并走正片 TakeHit + Gore 链，供枪击/重机枪演示实时观摩。 */
  FireDemoShot(from, postId, limbId, { kind = "hmg", damage = 140, headBurst = false, forceSever = true, soundCue = "fireZb26" } = {}) {
    const entry = this.Post(postId);
    const soldier = entry?.soldier;
    if (!soldier) return;
    const ptArr = this.LimbPointOf(postId, limbId);
    const targetPt = ptArr
      ? new THREE.Vector3(ptArr[0], ptArr[1], ptArr[2])
      : new THREE.Vector3(soldier.position.x, soldier.position.y + (limbId === "head" ? 1.62 : 1.15), soldier.position.z);
    const dir = targetPt.clone().sub(from).normalize();

    this.host.vfx?.Tracer?.(from, targetPt, true);
    this.host.audio?.Play?.(soundCue, { position: from, volume: 0.85 });
    const gore = this.host.Gore?.();
    if (forceSever) gore?.SetForce?.(kind);
    const part = limbId === "head" ? "head" : "limb";
    soldier.TakeHit(damage, part, dir, {
      kind,
      shapeId: limbId,
      weaponId: kind === "hmg" ? "Zb26" : "HanYang",
      point: targetPt,
      headBurst,
    });
  }

  PlayDemo(demoId) {
    this.Reset({ keepDemo: true });
    this.activeDemo = demoId;
    this.paused = false;
    this.stepFrames = 0;
    const gore = this.host.Gore?.();

    if (demoId === "bladeDecap") {
      // 1. 大刀斩首演示：白刃反差白灰墙前，0.2× 慢放斩断颈部，钢盔弹飞 + 完整带发飞头 + PBR 颈椎气管断面
      this.SetCameraPose({ position: { x: 3317.15, y: 1.56, z: 3337.75 }, lookAt: { x: 3316.0, y: 1.48, z: 3335.7 } });
      this.SetTimeScale(0.2);
      this.demoQueue.push({
        delay: 0.14,
        run: () => {
          const entry = this.Post("B_2");
          if (!entry?.soldier || !gore?.Sever) return;
          const pt = new THREE.Vector3(entry.spec.x, 1.56, entry.spec.z);
          this.SpawnBladeArcVisual(pt, new THREE.Vector3(1, 0, 0));
          this.host.audio?.Play?.("dadaoSwing", { position: pt, volume: 0.9 });
          gore.Sever(entry.soldier.id, "head", [0.85, 0.42, 0.25], { kind: "blade", point: pt });
        },
      });
    } else if (demoId === "bladeArm") {
      // 2. 大刀断臂演示：贴身斜劈右上臂，右臂连同三八式步枪向前右方向飞入画面中央，露出臂骨断茬与染血破衣断面
      this.SetCameraPose({ position: { x: 3315.85, y: 1.44, z: 3338.35 }, lookAt: { x: 3315.85, y: 1.24, z: 3335.7 } });
      this.SetTimeScale(0.2);
      this.demoQueue.push({
        delay: 0.14,
        run: () => {
          const entry = this.Post("B_2");
          if (!entry?.soldier || !gore?.Sever) return;
          const pt = new THREE.Vector3(entry.spec.x - 0.28, 1.36, entry.spec.z);
          this.SpawnBladeArcVisual(pt, new THREE.Vector3(-1, 0, 0));
          this.host.audio?.Play?.("dadaoSwing", { position: pt, volume: 0.9 });
          gore.Sever(entry.soldier.id, "upperArmR", [-0.35, 0.32, 0.88], { kind: "blade", point: pt });
        },
      });
    } else if (demoId === "blastCrater") {
      // 3. 手雷近炸演示：弹坑高角度特写，0.25× 慢放真实 Combat.Blast，1m 圈多段粉碎 + 碎块布片 + 钢盔弹飞
      this.SetCameraPose({ position: { x: 3360.8, y: 2.65, z: 3342.2 }, lookAt: { x: 3364.0, y: 0.95, z: 3336.0 } });
      this.SetTimeScale(0.25);
      this.SpawnCraterFuseVisual(new THREE.Vector3(GORE_CRATER.x, 0, GORE_CRATER.z));
      this.demoQueue.push({
        delay: 0.16,
        run: () => { this.Detonate(); },
      });
    } else if (demoId === "gunfireBurst") {
      // 4. 机枪扫射断肢演示：捷克式 7.92mm 曳光连发实射 L10_3（右前臂连枪 → 左小腿 → 左上臂）
      this.SetCameraPose({ position: { x: 3341.75, y: 1.44, z: 3350.65 }, lookAt: { x: 3340.0, y: 1.12, z: 3348.0 } });
      this.SetTimeScale(0.25);
      const muzzle = new THREE.Vector3(3340.0, 1.32, 3357.2);
      this.demoQueue.push(
        { delay: 0.10, run: () => this.FireDemoShot(muzzle, "L10_3", "forearmR", { kind: "hmg", damage: 95, forceSever: true }) },
        { delay: 0.22, run: () => this.FireDemoShot(muzzle, "L10_3", "calfL", { kind: "hmg", damage: 95, forceSever: true }) },
        { delay: 0.34, run: () => this.FireDemoShot(muzzle, "L10_3", "upperArmL", { kind: "hmg", damage: 95, forceSever: true }) },
      );
    } else if (demoId === "headBurst") {
      // 5. 重机枪爆头碎裂演示：近距特写 + 0.15× 极慢放，7.7/7.92 重弹掀飞钢盔 + 颅骨粉碎 8 块碎骨 + 颅底动脉血柱
      this.SetCameraPose({ position: { x: 3341.15, y: 1.62, z: 3349.85 }, lookAt: { x: 3340.0, y: 1.56, z: 3348.0 } });
      this.SetTimeScale(0.15);
      const muzzle = new THREE.Vector3(3340.0, 1.52, 3357.2);
      this.demoQueue.push({
        delay: 0.10,
        run: () => this.FireDemoShot(muzzle, "L10_3", "head", {
          kind: "hmg", damage: 220, headBurst: true, forceSever: true, soundCue: "fireZb26",
        }),
      });
    } else if (demoId === "helmetPop") {
      // 6. 弹飞九〇式钢盔演示：擦盔一枪把 1,727 面钢盔与下巴带打飞，清晰展示下方完好日军头颅与 HairGroom 发丝
      this.SetCameraPose({ position: { x: 3340.95, y: 1.66, z: 3349.55 }, lookAt: { x: 3340.0, y: 1.64, z: 3348.0 } });
      this.SetTimeScale(0.25);
      const muzzle = new THREE.Vector3(3340.0, 1.68, 3357.2);
      this.demoQueue.push({
        delay: 0.10,
        run: () => {
          const entry = this.Post("L10_3");
          if (!entry?.soldier) return;
          const pt = new THREE.Vector3(entry.spec.x, 1.78, entry.spec.z);
          this.host.vfx?.Tracer?.(muzzle, pt, true);
          this.host.audio?.Play?.("fireRifle", { position: muzzle, volume: 0.8 });
          this.host.audio?.Play?.("impactMetal", { position: pt, volume: 0.95 });
          gore?.PopHelmet?.(entry.soldier.id, [0.45, 0.85, -0.55]);
        },
      });
    }

    this.PaintPanel();
    return this.State();
  }

  // -------------------------------------------------------------------------
  // 常规控制与武器 / 机位
  // -------------------------------------------------------------------------

  EquipWeapon(weaponId) {
    this.activeWeapon = weaponId;
    if (this.cameraMode === "free") this.SetCameraMode("player");
    if (weaponId === "HanYang" || weaponId === "Zb26") {
      this.host.Pickup?.(weaponId);
      this.host.Refill?.();
    } else if (weaponId === "Dadao") {
      this.host.ctx?.SwitchSlot?.("melee");
    } else if (weaponId === "Grenade") {
      this.host.GiveGrenade?.("Grenade");
      this.host.ctx?.SwitchSlot?.("throwable");
    }
    this.PaintPanel();
    return this.activeWeapon;
  }

  TeleportStation(stationId) {
    const dest = GORE_STATION_TELEPORTS[stationId];
    if (!dest) return false;
    this.SetCameraMode("player");
    this.host.player?.Spawn?.(dest.x, dest.z, dest.ry);
    this.PaintPanel();
    return true;
  }

  Detonate() {
    const crater = GORE_CRATER;
    const y = (this.host.battlefield?.GroundHeight(crater.x, crater.z) ?? 0) + 0.15;
    TMP_A.set(crater.x, y, crater.z);
    this.detonations += 1;
    this.host.combat.Blast(TMP_A, GRENADE.radiusM, GRENADE.damage, "grenade", "ija", false, null, "Grenade", null);
    this.PaintPanel();
    return this.State();
  }

  SetForce(kind) {
    this.force = kind || null;
    this.host.Gore?.()?.SetForce?.(this.force);
    this.PaintPanel();
    return this.force;
  }

  SetSlowMotion(on) {
    this.slowMotion = on ?? !this.slowMotion;
    this.timeScale = this.slowMotion ? GORE_SLOW_MOTION : 1;
    this.paused = false;
    this.PaintPanel();
    return this.slowMotion;
  }

  SetTimeScale(scale) {
    const value = Number(scale);
    if (!Number.isFinite(value) || value <= 0) return this.timeScale;
    this.timeScale = value;
    this.slowMotion = value < 0.99;
    this.paused = false;
    this.PaintPanel();
    return this.timeScale;
  }

  SetPaused(on) {
    this.paused = !!on;
    this.stepFrames = 0;
    this.PaintPanel();
    return this.paused;
  }

  StepFrame(count = 1) {
    this.paused = true;
    this.stepFrames += Math.max(1, count | 0);
    this.PaintPanel();
    return this.stepFrames;
  }

  ScaleDt(realDt) {
    this.realDt = Number.isFinite(realDt) ? Math.min(Math.max(realDt, 0), 0.1) : STEP_DT;
    if (this.stepFrames > 0) {
      this.stepFrames -= 1;
      return STEP_DT;
    }
    if (this.paused) return PAUSED_DT;
    return this.realDt * this.timeScale;
  }

  SeverLimb(limbId, postId = null) {
    const gore = this.host.Gore?.();
    const entry = postId ? this.Post(postId) : (this.Target() || this.Post("L10_3") || this.Post("B_2"));
    if (!gore?.Sever || !entry?.soldier) return null;
    this.severCommands += 1;
    gore.Sever(entry.soldier.id, limbId);
    this.PaintPanel();
    return { post: entry.spec.id, limb: limbId };
  }

  PopHelmet(postId = null) {
    const gore = this.host.Gore?.();
    const entry = postId ? this.Post(postId) : (this.Target() || this.Post("L10_3") || this.Post("B_2"));
    if (!gore?.PopHelmet || !entry?.soldier) return false;
    const ok = gore.PopHelmet(entry.soldier.id, [0.4, 0.85, -0.4]);
    this.PaintPanel();
    return ok;
  }

  SeverRandom() {
    const limb = GORE_LIMB_BUTTONS[Math.floor(this.Rng() * GORE_LIMB_BUTTONS.length)];
    return this.SeverLimb(limb);
  }

  // -------------------------------------------------------------------------
  // 自由观察相机（与 ShellImpactRange 同接口）
  // -------------------------------------------------------------------------

  SetViewmodelHidden(hidden) {
    if (this.viewmodelHidden === hidden) return;
    this.viewmodelHidden = hidden;
    this.host.SetViewmodelHidden?.(hidden);
  }

  SetCameraMode(mode) {
    if (mode === "player") {
      this.cameraMode = "player";
      this.cameraPreset = null;
      this.SetViewmodelHidden(false);
      this.PaintPanel();
      return this.cameraMode;
    }
    if (this.cameraMode !== "free") {
      const cam = this.host.camera;
      if (cam) {
        cam.getWorldPosition(this.cam.pos);
        const dir = cam.getWorldDirection(TMP_DIR);
        this.cam.yaw = Math.atan2(-dir.x, -dir.z);
        this.cam.pitch = Math.asin(THREE.MathUtils.clamp(dir.y, -0.99, 0.99));
      }
      if (this.host.player) {
        this.cam.lastPlayerYaw = this.host.player.yaw;
        this.host.player.pitch = 0;
      }
    }
    this.cameraMode = "free";
    this.SetViewmodelHidden(true);
    this.PaintPanel();
    return this.cameraMode;
  }

  FocusPreset(presetId) {
    const preset = GORE_CAMERA_PRESETS[presetId];
    if (!preset) return false;
    this.SetCameraPose({
      position: { x: preset.pos[0], y: preset.pos[1], z: preset.pos[2] },
      lookAt: { x: preset.lookAt[0], y: preset.lookAt[1], z: preset.lookAt[2] },
    });
    this.cameraPreset = presetId;
    this.PaintPanel();
    return true;
  }

  SetCameraPose(pose) {
    const p = pose.position;
    this.cam.pos.set(p.x, p.y, p.z);
    if (pose.lookAt) {
      const dx = pose.lookAt.x - p.x, dy = pose.lookAt.y - p.y, dz = pose.lookAt.z - p.z;
      this.cam.yaw = Math.atan2(-dx, -dz);
      this.cam.pitch = Math.atan2(dy, Math.hypot(dx, dz));
    } else {
      if (Number.isFinite(pose.yaw)) this.cam.yaw = pose.yaw;
      if (Number.isFinite(pose.pitch)) this.cam.pitch = pose.pitch;
    }
    this.cameraMode = "free";
    this.cameraPreset = "custom";
    if (this.host.player) {
      this.cam.lastPlayerYaw = this.host.player.yaw;
      this.host.player.pitch = 0;
    }
    this.SetViewmodelHidden(true);
    this.PaintPanel();
    return this.cam;
  }

  CapturesInput() { return this.cameraMode === "free" && !!this.host.CanUse?.(); }

  HandleKey(event, down) {
    const code = event.code;
    if (code !== "KeyW" && code !== "KeyA" && code !== "KeyS" && code !== "KeyD"
      && code !== "KeyQ" && code !== "KeyE" && code !== "ShiftLeft" && code !== "ShiftRight") return;
    if (down) this.keys.add(code); else this.keys.delete(code);
  }

  ApplyCamera(camera) {
    if (this.cameraMode !== "free") return false;
    const player = this.host.player, dt = this.realDt;
    if (player) {
      let dyaw = player.yaw - this.cam.lastPlayerYaw;
      if (dyaw > Math.PI) dyaw -= Math.PI * 2; else if (dyaw < -Math.PI) dyaw += Math.PI * 2;
      this.cam.yaw += dyaw;
      this.cam.lastPlayerYaw = player.yaw;
      this.cam.pitch = Math.max(-FREE_CAMERA.maxPitch, Math.min(FREE_CAMERA.maxPitch, this.cam.pitch + player.pitch));
      player.pitch = 0;
    }
    if (this.CapturesInput() || this.keys.size) {
      const speed = FREE_CAMERA.speedMps * (this.keys.has("ShiftLeft") || this.keys.has("ShiftRight") ? FREE_CAMERA.fastScale : 1) * dt;
      const forward = (this.keys.has("KeyW") ? 1 : 0) - (this.keys.has("KeyS") ? 1 : 0);
      const strafe = (this.keys.has("KeyD") ? 1 : 0) - (this.keys.has("KeyA") ? 1 : 0);
      const rise = (this.keys.has("KeyE") ? 1 : 0) - (this.keys.has("KeyQ") ? 1 : 0);
      const cp = Math.cos(this.cam.pitch), sp = Math.sin(this.cam.pitch);
      const fx = -Math.sin(this.cam.yaw) * cp, fy = sp, fz = -Math.cos(this.cam.yaw) * cp;
      const rx = Math.cos(this.cam.yaw), rz = -Math.sin(this.cam.yaw);
      this.cam.pos.x += (fx * forward + rx * strafe) * speed;
      this.cam.pos.y += (fy * forward + rise) * speed;
      this.cam.pos.z += (fz * forward + rz * strafe) * speed;
    }
    const floor = (this.host.battlefield?.GroundHeight(this.cam.pos.x, this.cam.pos.z) ?? 0) + FREE_CAMERA.minAboveGroundM;
    if (this.cam.pos.y < floor) this.cam.pos.y = floor;
    camera.position.copy(this.cam.pos);
    camera.rotation.order = "YXZ";
    camera.rotation.set(this.cam.pitch, this.cam.yaw, 0);
    camera.updateMatrixWorld(true);
    return true;
  }

  // -------------------------------------------------------------------------
  // 准星目标与读数
  // -------------------------------------------------------------------------

  Target() {
    const camera = this.host.camera;
    if (!camera) return null;
    camera.getWorldPosition(TMP_A);
    camera.getWorldDirection(TMP_DIR);
    let best = null, bestDot = Math.cos((16 * Math.PI) / 180);
    for (const entry of this.posts) {
      const soldier = entry.soldier;
      if (!soldier) continue;
      TMP_B.set(soldier.position.x, soldier.position.y + 1.2, soldier.position.z).sub(TMP_A);
      const distance = TMP_B.length();
      if (distance > 60 || distance < 0.05) continue;
      const dot = TMP_B.divideScalar(distance).dot(TMP_DIR);
      if (dot > bestDot) { bestDot = dot; best = entry; }
    }
    return best;
  }

  TargetSummary() {
    const entry = this.Target();
    if (!entry?.soldier) return null;
    const soldier = entry.soldier;
    const refPos = this.cameraMode === "free" ? this.cam.pos : this.host.player.position;
    return {
      id: entry.spec.id, station: entry.spec.station, runtimeId: soldier.id,
      alive: soldier.alive, health: soldier.health,
      distance: Math.hypot(soldier.position.x - refPos.x, soldier.position.z - refPos.z),
    };
  }

  LimbPointOf(postId, limbId) {
    const soldier = this.Post(postId)?.soldier;
    const shapes = soldier?.actor?.GetBoneHitboxes?.() || [];
    const shape = shapes.find((candidate) => candidate.id === limbId);
    if (!shape) return null;
    if (shape.type === "capsule" && shape.start && shape.end) {
      return [(shape.start.x + shape.end.x) / 2, (shape.start.y + shape.end.y) / 2,
        (shape.start.z + shape.end.z) / 2];
    }
    return shape.center ? [shape.center.x, shape.center.y, shape.center.z] : null;
  }

  State() {
    const gore = this.host.Gore?.() || null;
    const goreState = gore?.State?.() || null;
    const severedBySoldier = new Map();
    for (const record of goreState?.severed || []) severedBySoldier.set(record.soldierId, record.limbs);
    const posts = this.posts.map(({ spec, soldier }) => ({
      id: spec.id, station: spec.station, x: spec.x, z: spec.z,
      ringM: spec.ringM ?? null, rangeM: spec.rangeM ?? null,
      runtimeId: soldier?.id ?? null, alive: !!soldier?.alive, health: soldier?.health ?? 0,
      severed: (soldier && severedBySoldier.get(soldier.id)) || [],
    }));
    const live = goreState?.budget?.live ?? goreState?.parts?.length ?? 0;
    const caps = posts.reduce((sum, post) => sum + post.severed.length, 0) + live;
    return {
      ready: !!goreState,
      enabled: goreState?.enabled ?? null,
      quality: goreState?.quality ?? null,
      pbrCapsReady: !!goreState?.pbrCapsReady,
      useCutModel: this.useCutModel,
      cutModelReady: !!this.xbotSkins?.ready,
      activeDemo: this.activeDemo,
      activeWeapon: this.activeWeapon,
      cameraMode: this.cameraMode,
      cameraPreset: this.cameraPreset,
      paused: this.paused,
      menuOpen: !!this.host.state?.menu,
      posts,
      live,
      max: goreState?.budget?.max ?? 0,
      caps,
      helmets: goreState?.helmets ?? 0,
      gibs: goreState?.gibs ?? 0,
      spurts: goreState?.spurts ?? 0,
      parts: goreState?.parts || [],
      drawCalls: live + caps,
      frameMs: this.frameMs,
      force: this.force,
      slowMotion: this.slowMotion,
      timeScale: this.timeScale,
      detonations: this.detonations,
      severCommands: this.severCommands,
      target: this.TargetSummary(),
      limbs: [...GORE_LIMB_BUTTONS],
    };
  }

  Update(dt) {
    this.clock += dt;
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    if (this.lastStamp) this.frameMs = now - this.lastStamp;
    this.lastStamp = now;

    // 推进演示定时动作队列（按真实仿真时间，慢放也能自然触发）
    if (this.demoQueue.length && !this.paused) {
      for (let i = this.demoQueue.length - 1; i >= 0; i -= 1) {
        const task = this.demoQueue[i];
        task.delay -= this.realDt;
        if (task.delay <= 0) {
          this.demoQueue.splice(i, 1);
          try { task.run(); } catch (err) { console.warn("[GoreRange] Demo step failed:", err); }
        }
      }
    }

    // 推进临时演示视觉件（大刀斩光弧 / 引爆前手雷）
    for (let i = this.demoVisuals.length - 1; i >= 0; i -= 1) {
      const item = this.demoVisuals[i];
      item.age += dt;
      if (item.spinY) item.mesh.rotation.y += item.spinY * dt;
      if (item.mesh.material?.transparent) {
        item.mesh.material.opacity = Math.max(0, 0.75 * (1 - item.age / item.life));
      }
      if (item.age >= item.life) {
        if (item.mesh.parent) item.mesh.parent.remove(item.mesh);
        item.mesh.geometry?.dispose?.();
        item.mesh.material?.dispose?.();
        this.demoVisuals.splice(i, 1);
      }
    }

    const live = this.host.Gore?.()?.State?.()?.budget?.live || 0;
    if (live !== this.lastLive) { this.lastLive = live; this.PaintPanel(); this.nextPaint = this.clock + 0.1; }
    else if (this.clock >= this.nextPaint) { this.nextPaint = this.clock + 0.1; this.PaintPanel(); }
  }

  PaintPanel() { this.lab?.Update(this.State()); }

  Dispose() {
    this.disposed = true;
    if (typeof window !== "undefined") {
      window.removeEventListener("keydown", this.OnKey, true);
      window.removeEventListener("keyup", this.OnKey, true);
      window.removeEventListener("blur", this.OnBlur);
    }
    this.ClearDemoVisuals();
    this.SetViewmodelHidden(false);
    this.xbotSkins?.DisposeHair?.();
    this.lab?.Dispose();
    this.lab = null;
    this.posts.length = 0;
  }
}

export default GoreRange;
