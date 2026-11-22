// 第一人称持枪检查（独立窗口页 Tool_FirstPersonInspection.html 控制器）：
// - 复用游戏完整后处理与光影底座（CreateStudioBase + firstLevelBattleDay + WeaponLight + ADS 近景景深）；
// - 极简 COD 风格清水混凝土试枪靶场（FirstPersonRangeScene，可实弹射击、留弹孔、打摆钢靶）；
// - 真实弹仓与运行时一致的空仓换弹 / 战术换弹 / 开火后坐与 FOV 顿挫；
// - 可视化人物姿态剪影 + 实时键位高亮 + #3 连射拉栓 / #4 移动惯性改前改后直出对比（只读，writeBack: false）。

import * as THREE from "three";
import { CreateStudioBase, MAX_FRAME_DT } from "./Script_ToolStudioRenderBase.mjs";
import { FirstPersonRangeScene } from "./Script_FirstPersonRangeScene.mjs";
import { LoadToolsVolume, SaveToolsVolume, ToolsVolumeLevel } from "../Script_EditorVolume.mjs";
import { WEAPONS } from "../Data_Weapons.mjs";
import { WeaponShelved } from "../Script_Weapons.mjs";
import { WeaponClassOf } from "../Script_AudioWiring.mjs";
import { WEAPON_MESH_BY_ID, BAYONET_MESH_BY_WEAPON } from "../Data_Meshes.mjs";
import { FIRE_CONTROL } from "../Data_Tuning_FirearmActions.mjs";
import { LENS_FLARE } from "../Data_Tuning_Camera.mjs";
import { FirearmCadence } from "../Script_FirearmActions.mjs";

const Clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const Clamp01 = (v) => Clamp(v, 0, 1);

const PLAYER_BASE_EYE = Object.freeze({ x: 0, y: 1.62, z: 0.0 });
const CROUCH_EYE_Y = 1.05;
const ADS_FOV_TIME = 0.15;
const ADS_NEAR_DOF_STRENGTH = 0.72;
const ADS_NEAR_DOF_FOCUS_M = 1.60;
const ADS_NEAR_DOF_RANGE_M = 0.85;
const ADS_NEAR_DOF_MAX_PX = 4.5;
const FIRE_PUNCH_DECAY_S = 0.085;
const FIRE_PUNCH_FOV_DEG = 1.9;
const PLAYER_BOLT_VOLUME = 0.42;

const WEAPON_LIGHT_BY_SKY = Object.freeze({
  firstLevelBattleDay: Object.freeze({ fill: 0.55, spec: 0.25, color: "#ffffff", ambient: 1.0, sun: 1.0 }),
  smokyDay: Object.freeze({ fill: 0.55, spec: 0.25, color: "#ffffff", ambient: 1.0, sun: 1.0 }),
  dusk: Object.freeze({ fill: 0.50, spec: 0.22, color: "#ffe2c4", ambient: 0.5, sun: 0.6 }),
});

const IMPACT_CUE = Object.freeze({
  brick: "impactBrick", dirt: "impactDirt", wood: "impactWood", metal: "impactMetal",
});

const PREFERRED_ORDER = Object.freeze([
  "HanYang", "ZhongZheng", "Type38", "Zb26", "Type11",
  "ServicePistol", "Grenade", "GrenadeBundle", "Dadao", "OfficerSwordSet",
]);
const BOLT_RIFLE_IDS = Object.freeze(["HanYang", "ZhongZheng", "Type38"]);

function IsInspectable(id) {
  const w = WEAPONS[id];
  if (!w || !WEAPON_MESH_BY_ID[id] || WeaponShelved(id)) return false;
  return w.kind !== "vehicle" && w.kind !== "mortar" && w.kind !== "hmg";
}

const WEAPON_IDS = Object.freeze([
  ...PREFERRED_ORDER.filter(IsInspectable),
  ...Object.keys(WEAPONS).filter((id) => IsInspectable(id) && !PREFERRED_ORDER.includes(id)).sort(),
]);

function KindTag(w) {
  if (!w) return "—";
  if (w.kind === "lmg") return "机枪";
  if (w.kind === "pistol") return "手枪";
  if (w.kind === "throwable") return "投掷";
  if (w.kind === "melee") return "近战";
  return "步枪";
}

function CanAction(w, action) {
  if (!w) return false;
  if (action === "fire") return !!w.fireIntervalS && w.kind !== "melee" && w.kind !== "throwable";
  if (action === "bolt") return w.kind === "boltRifle" && !!w.boltTimeS;
  if (action === "reload") return !!w.reloadKind && !!w.reloadTimeS;
  if (action === "throw") return w.kind === "throwable";
  if (action === "melee") return w.kind !== "throwable";
  if (action === "auto") return !!w.rpm && CanAction(w, "fire");
  return false;
}

function HasIronSight(id) {
  const k = WEAPONS[id]?.kind;
  return k === "boltRifle" || k === "lmg" || k === "pistol";
}

function CanBayonet(id) {
  return !!(WEAPONS[id]?.bayonet && BAYONET_MESH_BY_WEAPON[id]);
}

const MOUNT_SPECS = Object.freeze([
  { id: "muzzle", color: 0xe5533d, label: "枪口" },
  { id: "gripR", color: 0xf0a43a, label: "后手" },
  { id: "gripL", color: 0x4ca7e8, label: "前手" },
  { id: "sight", color: 0x69c76f, label: "瞄具" },
  { id: "actualR", color: 0xffffff, label: "右掌", radius: 0.010 },
  { id: "actualL", color: 0xffffff, label: "左掌", radius: 0.010 },
]);

const ORBIT_PRESETS = Object.freeze({
  rightRear: { yaw: 0.78, pitch: 0.14, dist: 1.48 },
  leftRear: { yaw: -0.78, pitch: 0.14, dist: 1.48 },
  front: { yaw: Math.PI, pitch: 0.08, dist: 1.58 },
  top: { yaw: 0.34, pitch: 1.12, dist: 1.66 },
});

const BOLT_DRIVERS = Object.freeze([
  { value: "sightTap", label: "归位即扣" },
  { value: "rapid", label: "高频连点" },
  { value: "manual", label: "手动左键" },
]);

const INERTIA_DRIVERS = Object.freeze([
  { value: "stepStrafe", label: "横移急停" },
  { value: "counterStrafe", label: "左右折返" },
  { value: "surgeStop", label: "急起急停" },
  { value: "stanceHop", label: "蹲立切换" },
  { value: "manual", label: "自由走动" },
]);

const _muzzle = new THREE.Vector3();
const _boltAt = new THREE.Vector3();
const _aimDir = new THREE.Vector3();
const _kick = new THREE.Vector2();
const _sightWorld = new THREE.Vector3();
const _vA = new THREE.Vector3();
const _vB = new THREE.Vector3();
const _qA = new THREE.Quaternion();
const _qB = new THREE.Quaternion();
const _sA = new THREE.Vector3();
const _mA = new THREE.Matrix4();

class FirstPersonInspectionApp {
  constructor(base) {
    this.base = base;
    this.vm = base.viewmodel;
    this.camera = base.camera;
    this.range = new FirstPersonRangeScene(base);

    // 核心状态
    this.mode = "range"; // "range" | "bolt" | "inertia"
    this.profile = "after"; // "before" | "after"
    this.skyName = "firstLevelBattleDay";
    this.view = "player"; // "player" | "inspect"
    this.orbitPreset = "rightRear";
    this.weaponId = "HanYang";
    this.ammo = WEAPONS.HanYang?.magazine || 5;
    this.reloadContext = null;

    // 玩家姿态与移动
    this.stancePreset = "stand"; // "stand" | "crouch" | "sprint"
    this.adsLocked = false;
    this.rmbHeld = false;
    this.lmbHeld = false;
    this.autoFire = false;
    this.bayonetFixed = false;
    this.aimYaw = 0;
    this.aimPitch = 0;
    this.recoilPitch = 0;
    this.recoilYaw = 0;
    this.recoilRecoverS = 0.4;
    this.adsFovT = 0;
    this.firePunch = 0;
    this.posX = 0;
    this.posZ = 0;
    this.velRight = 0;
    this.velForward = 0;
    this.crouchT = 0;
    this.eyeY = PLAYER_BASE_EYE.y;
    this.keys = new Set();
    this.virtualKeys = new Set();
    this.time = 0;
    this.hitmarkerTimer = 0;

    // 慢放与逐帧
    this.timeScale = 1;
    this.paused = false;

    // 外部环绕相机
    this.orbit = { yaw: 0.62, pitch: 0.16, dist: 1.56, target: new THREE.Vector3(0.05, 1.48, -0.36) };
    this.standAnchor = new THREE.Group();
    this.standAnchor.name = "FpsExternalStand";
    this.standAnchor.position.set(0, 1.46, 0);
    base.scene.add(this.standAnchor);
    this.vmSavedLocal = {
      pos: this.vm.root.position.clone(),
      quat: this.vm.root.quaternion.clone(),
      scale: this.vm.root.scale.clone(),
    };

    // #3 连射拉栓对照状态
    this.boltDriver = "sightTap";
    this.boltAuto = true;
    this.boltTapTimer = 0;
    this.boltCadence = new FirearmCadence();
    this.queuedBoltShot = null;
    this.boltShots = 0;
    this.boltDrops = 0;
    this.boltBuffers = 0;
    this.boltFeedbackTimer = 0;

    // #4 移动惯性对照状态
    this.inertiaDriver = "stepStrafe";
    this.inertiaAuto = true;
    this.inertiaClock = 0;
    this.inertiaTrail = [];

    // 调试叠加层（默认关闭）
    this.showReticle = true;
    this.showDebug = false;
    this.debugGroup = null;
    this.debugMarkers = new Map();
    this.debugLabels = new Map();
    this.debugResources = [];
    this.skeletonHelper = null;
    this.debugRefreshT = 0;

    // 音效音量（复用高级工具存档键）
    this.toolsVolume = LoadToolsVolume(base.audio?.masterVolume ?? 1);
    this.ApplyToolsVolume();

    this.CollectDom();
    this.WireViewmodelCallbacks();
    this.ApplySky("firstLevelBattleDay");
    this.BuildWeaponList();
    this.BuildCompareChips();
    this.BuildDebugOverlay();
    this.BindEvents();

    // URL 参数初始化
    const params = new URLSearchParams(location.search);
    const paramWeapon = params.get("weapon");
    if (paramWeapon && WEAPON_IDS.includes(paramWeapon)) this.weaponId = paramWeapon;
    this.SetWeapon(this.weaponId);

    const paramProfile = params.get("profile");
    if (paramProfile === "before" || paramProfile === "after") this.SetProfile(paramProfile, false);

    const paramMode = params.get("mode");
    if (paramMode === "bolt" || paramMode === "inertia") this.SetMode(paramMode);
    else this.SetMode("range");
  }

  CollectDom() {
    const $ = (id) => document.getElementById(id);
    this.dom = {
      stage: $("stage"),
      canvas: $("view"),
      reticle: $("reticle"),
      hitmarker: $("hitmarker"),
      orbitPresets: $("orbitPresets"),
      reticleToggle: $("reticleToggle"),
      debugToggle: $("debugToggle"),
      debugBadge: $("debugBadge"),
      abFloat: $("abFloat"),
      postureDock: $("postureDock"),
      silhouetteWrap: $("silhouetteWrap"),
      stanceLabel: $("stanceLabel"),
      speedLabel: $("speedLabel"),
      keycaps: $("keycaps"),
      ammoRow: $("ammoRow"),
      ammoBars: $("ammoBars"),
      ammoText: $("ammoText"),
      inertiaDial: $("inertiaDial"),
      inertiaCanvas: $("inertiaCanvas"),
      inertiaPhase: $("inertiaPhase"),
      boltCard: $("boltCard"),
      boltStats: $("boltStats"),
      segFire: $("segFire"),
      segBolt: $("segBolt"),
      segBuf: $("segBuf"),
      boltCursor: $("boltCursor"),
      boltFeedback: $("boltFeedback"),
      mountLabels: $("mountLabels"),
      stageHint: $("stageHint"),
      muteToggle: $("muteToggle"),
      compareCard: $("compareCard"),
      compareCardTitle: $("compareCardTitle"),
      boltControls: $("boltControls"),
      boltRifleChips: $("boltRifleChips"),
      boltDriverChips: $("boltDriverChips"),
      boltAutoBtn: $("boltAutoBtn"),
      boltTriggerBtn: $("boltTriggerBtn"),
      inertiaControls: $("inertiaControls"),
      inertiaDriverChips: $("inertiaDriverChips"),
      inertiaAutoBtn: $("inertiaAutoBtn"),
      inertiaReplayBtn: $("inertiaReplayBtn"),
      weaponList: $("weaponList"),
      weaponMeta: $("weaponMeta"),
      stanceChips: $("stanceChips"),
      adsToggleBtn: $("adsToggleBtn"),
      actionGrid: $("actionGrid"),
      autoFireBtn: $("autoFireBtn"),
      bayonetBtn: $("bayonetBtn"),
      clearHolesBtn: $("clearHolesBtn"),
      speedChips: $("speedChips"),
      pauseBtn: $("pauseBtn"),
      stepBackBtn: $("stepBackBtn"),
      stepFwdBtn: $("stepFwdBtn"),
      scrubWrap: $("scrubWrap"),
      actionScrub: $("actionScrub"),
      actionStatusText: $("actionStatusText"),
    };
  }

  WireViewmodelCallbacks() {
    const audio = this.base.audio;
    this.vm.onBoltStart = (weapon) => {
      if (!weapon?.boltCue) return;
      this.vm.MuzzleWorld(_boltAt);
      audio.Play(weapon.boltCue, {
        position: _boltAt.clone(), volume: PLAYER_BOLT_VOLUME, priority: true, firstPerson: true,
      });
    };
    this.vm.onBoltCue = (weapon, cue) => {
      if (!weapon?.boltCue) return;
      this.vm.MuzzleWorld(_boltAt);
      audio.Play(weapon.boltCue, {
        position: _boltAt.clone(), volume: PLAYER_BOLT_VOLUME, priority: true, firstPerson: true,
        offset: cue.offset, maxDuration: cue.maxDuration,
      });
    };
    this.vm.onReloadEvent = (event, action) => {
      const ctx = this.reloadContext;
      if (ctx && ctx.action === action && event.id === "loaded" && !ctx.committed) {
        ctx.committed = true;
        this.ammo = WEAPONS[this.weaponId]?.magazine || 0;
        this.RefreshAmmoHud();
      }
      if (event.cue) {
        audio.Play(event.cue, {
          volume: event.volume ?? 0.6,
          offset: event.offset ?? 0,
          maxDuration: event.maxDuration ?? Infinity,
          priority: true, firstPerson: true, burst: 1,
        });
      }
    };
    this.vm.onActionEnd = (kind, action) => {
      if (kind === "reload" && this.reloadContext?.action === action) {
        if (!this.reloadContext.committed) {
          this.ammo = WEAPONS[this.weaponId]?.magazine || 0;
          this.RefreshAmmoHud();
        }
        this.reloadContext = null;
      }
    };
  }

  ApplyToolsVolume() {
    const level = ToolsVolumeLevel(this.toolsVolume);
    this.base.audio?.SetMasterVolume?.(level);
    if (this.dom?.muteToggle) {
      const muted = this.toolsVolume.muted || level <= 0.001;
      this.dom.muteToggle.setAttribute("aria-pressed", String(muted));
      this.dom.muteToggle.textContent = muted ? "🔇" : "🔊";
    }
  }

  ApplySky(name) {
    if (!WEAPON_LIGHT_BY_SKY[name]) return false;
    this.skyName = name;
    this.base.ApplySkyPreset(name);
    this.base.firstPersonSelfShadow?.SetWeaponLight?.(WEAPON_LIGHT_BY_SKY[name]);
    for (const btn of document.querySelectorAll("[data-sky]")) {
      btn.setAttribute("aria-pressed", String(btn.dataset.sky === name));
    }
    return true;
  }

  BuildWeaponList() {
    this.dom.weaponList.replaceChildren();
    for (const id of WEAPON_IDS) {
      const w = WEAPONS[id];
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "weapon-row";
      btn.role = "option";
      btn.dataset.weapon = id;
      btn.title = w.fullName || w.name;
      btn.innerHTML = `<span>${w.name}</span><span>${KindTag(w)}</span>`;
      btn.addEventListener("click", () => this.SetWeapon(id));
      this.dom.weaponList.appendChild(btn);
    }
  }

  BuildCompareChips() {
    this.dom.boltRifleChips.replaceChildren();
    for (const id of BOLT_RIFLE_IDS) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "chip";
      btn.dataset.boltRifle = id;
      btn.textContent = WEAPONS[id]?.name || id;
      btn.addEventListener("click", () => {
        this.SetWeapon(id);
        this.ResetBoltBench(this.boltDriver !== "manual");
      });
      this.dom.boltRifleChips.appendChild(btn);
    }

    this.dom.boltDriverChips.replaceChildren();
    for (const d of BOLT_DRIVERS) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "chip";
      btn.dataset.boltDriver = d.value;
      btn.textContent = d.label;
      btn.addEventListener("click", () => {
        this.boltDriver = d.value;
        this.boltAuto = d.value !== "manual";
        this.SyncCompareChips();
        this.ResetBoltBench(this.boltAuto);
      });
      this.dom.boltDriverChips.appendChild(btn);
    }

    this.dom.inertiaDriverChips.replaceChildren();
    for (const d of INERTIA_DRIVERS) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "chip";
      btn.dataset.inertiaDriver = d.value;
      btn.textContent = d.label;
      btn.addEventListener("click", () => {
        this.inertiaDriver = d.value;
        this.inertiaAuto = d.value !== "manual";
        this.SyncCompareChips();
        this.ResetInertiaBench();
      });
      this.dom.inertiaDriverChips.appendChild(btn);
    }
    this.SyncCompareChips();
  }

  SyncCompareChips() {
    for (const b of this.dom.boltRifleChips.querySelectorAll("button")) {
      b.setAttribute("aria-pressed", String(b.dataset.boltRifle === this.weaponId));
    }
    for (const b of this.dom.boltDriverChips.querySelectorAll("button")) {
      b.setAttribute("aria-pressed", String(b.dataset.boltDriver === this.boltDriver));
    }
    this.dom.boltAutoBtn.setAttribute("aria-pressed", String(this.boltAuto));
    for (const b of this.dom.inertiaDriverChips.querySelectorAll("button")) {
      b.setAttribute("aria-pressed", String(b.dataset.inertiaDriver === this.inertiaDriver));
    }
    this.dom.inertiaAutoBtn.setAttribute("aria-pressed", String(this.inertiaAuto));
  }

  BindEvents() {
    const unlockAudio = () => this.base.audio?.Unlock?.();
    document.addEventListener("pointerdown", unlockAudio, { once: true, capture: true });

    // 彻底禁用靶场与画布上的浏览器右键菜单
    const blockContext = (e) => e.preventDefault();
    this.dom.stage.addEventListener("contextmenu", blockContext);
    this.dom.canvas.addEventListener("contextmenu", blockContext);

    // 模式切换
    for (const btn of document.querySelectorAll("[data-mode]")) {
      btn.addEventListener("click", () => this.SetMode(btn.dataset.mode));
    }
    // 光照切换
    for (const btn of document.querySelectorAll("[data-sky]")) {
      btn.addEventListener("click", () => this.ApplySky(btn.dataset.sky));
    }
    // 静音开关
    this.dom.muteToggle.addEventListener("click", () => {
      this.toolsVolume = { ...this.toolsVolume, muted: !this.toolsVolume.muted };
      SaveToolsVolume(this.toolsVolume);
      this.ApplyToolsVolume();
    });
    // 返回控制中心（由控制中心弹出时切回原窗口并关闭自己）
    const backLink = document.getElementById("controlCenter");
    backLink?.addEventListener("click", (event) => {
      if (event.ctrlKey || event.metaKey || event.shiftKey) return;
      try {
        if (window.opener?.location.pathname !== new URL(backLink.href).pathname) return;
        window.opener.focus();
        window.close();
        event.preventDefault();
      } catch { /* 独立打开时走链接本身 */ }
    });
    // 视角切换 & 外部机位
    for (const btn of document.querySelectorAll("[data-view]")) {
      btn.addEventListener("click", () => this.SetView(btn.dataset.view));
    }
    for (const btn of document.querySelectorAll("[data-orbit]")) {
      btn.addEventListener("click", () => this.SetOrbitPreset(btn.dataset.orbit));
    }
    this.dom.reticleToggle.addEventListener("click", () => {
      this.showReticle = !this.showReticle;
      this.dom.reticleToggle.setAttribute("aria-pressed", String(this.showReticle));
      this.SyncReticleVisibility();
    });
    this.dom.debugToggle.addEventListener("click", () => {
      this.showDebug = !this.showDebug;
      this.dom.debugToggle.setAttribute("aria-pressed", String(this.showDebug));
      this.SyncDebugVisibility();
    });

    // A/B 改前改后切换
    for (const btn of this.dom.abFloat.querySelectorAll("[data-profile]")) {
      btn.addEventListener("click", () => this.SetProfile(btn.dataset.profile, true));
    }

    // #3 / #4 按钮
    this.dom.boltAutoBtn.addEventListener("click", () => {
      this.boltAuto = !this.boltAuto;
      this.dom.boltAutoBtn.setAttribute("aria-pressed", String(this.boltAuto));
      if (this.boltAuto) this.ResetBoltBench(true);
    });
    this.dom.boltTriggerBtn.addEventListener("click", () => this.HandleBoltTrigger(true));
    this.dom.inertiaAutoBtn.addEventListener("click", () => {
      this.inertiaAuto = !this.inertiaAuto;
      this.dom.inertiaAutoBtn.setAttribute("aria-pressed", String(this.inertiaAuto));
      if (!this.inertiaAuto) { this.velRight = 0; this.velForward = 0; }
    });
    this.dom.inertiaReplayBtn.addEventListener("click", () => this.ResetInertiaBench());

    // 姿态 chips
    for (const btn of this.dom.stanceChips.querySelectorAll("[data-stance]")) {
      btn.addEventListener("click", () => this.SetStance(btn.dataset.stance));
    }
    this.dom.adsToggleBtn.addEventListener("click", () => {
      this.adsLocked = !this.adsLocked;
      if (this.adsLocked && this.stancePreset === "sprint") this.stancePreset = "stand";
      this.SyncStanceButtons();
    });

    // 动作按钮
    for (const btn of this.dom.actionGrid.querySelectorAll("[data-act]")) {
      btn.addEventListener("click", () => this.TriggerAction(btn.dataset.act));
    }
    this.dom.autoFireBtn.addEventListener("click", () => {
      this.autoFire = !this.autoFire;
      this.dom.autoFireBtn.setAttribute("aria-pressed", String(this.autoFire));
    });
    this.dom.bayonetBtn.addEventListener("click", () => {
      this.bayonetFixed = !this.bayonetFixed;
      this.vm.SetBayonetFixed?.(this.bayonetFixed && CanBayonet(this.weaponId));
      this.dom.bayonetBtn.setAttribute("aria-pressed", String(this.bayonetFixed));
    });
    this.dom.clearHolesBtn.addEventListener("click", () => this.range.ClearBulletHoles());

    // 慢放与逐帧
    for (const btn of this.dom.speedChips.querySelectorAll("[data-speed]")) {
      btn.addEventListener("click", () => {
        this.timeScale = parseFloat(btn.dataset.speed) || 1;
        for (const b of this.dom.speedChips.querySelectorAll("[data-speed]")) {
          b.setAttribute("aria-pressed", String(b === btn));
        }
      });
    }
    this.dom.pauseBtn.addEventListener("click", () => this.SetPaused(!this.paused));
    this.dom.stepFwdBtn.addEventListener("click", () => {
      this.SetPaused(true);
      this.StepSimulation(1 / 60);
    });
    this.dom.stepBackBtn.addEventListener("click", () => {
      this.SetPaused(true);
      this.StepActionBackward();
    });
    this.dom.actionScrub.addEventListener("input", () => {
      const t = parseFloat(this.dom.actionScrub.value);
      if (Number.isFinite(t)) this.ScrubActiveAction(t);
    });

    // 鼠标在 3D 画布上的交互（玩家视角：左键开火、右键按住开镜兼拖曳微调准心；外部视角：左键环绕、右键平移、滚轮缩放）
    let dragMode = null;
    let lastX = 0;
    let lastY = 0;
    this.dom.canvas.addEventListener("mousedown", (e) => {
      this.dom.canvas.focus();
      lastX = e.clientX;
      lastY = e.clientY;
      if (this.view === "inspect") {
        dragMode = e.button === 2 ? "pan" : "orbit";
        return;
      }
      if (e.button === 0) {
        this.lmbHeld = true;
        if (this.mode === "bolt") this.HandleBoltTrigger(true);
        else this.TryPlayerFire();
      } else if (e.button === 2) {
        this.rmbHeld = true;
        if (this.stancePreset === "sprint") this.stancePreset = "stand";
        dragMode = "aim";
        this.SyncStanceButtons();
      } else if (e.button === 1) {
        e.preventDefault();
        dragMode = "aim";
      }
    });

    window.addEventListener("mousemove", (e) => {
      if (!dragMode) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      if (dragMode === "orbit") {
        this.orbit.yaw -= dx * 0.007;
        this.orbit.pitch = Clamp(this.orbit.pitch + dy * 0.006, -0.55, 1.35);
      } else if (dragMode === "pan") {
        const right = new THREE.Vector3(Math.cos(this.orbit.yaw), 0, -Math.sin(this.orbit.yaw));
        this.orbit.target.addScaledVector(right, -dx * 0.0018 * this.orbit.dist);
        this.orbit.target.y = Clamp(this.orbit.target.y + dy * 0.0018 * this.orbit.dist, 0.5, 2.4);
      } else if (dragMode === "aim") {
        this.aimYaw = Clamp(this.aimYaw - dx * 0.0022, -0.56, 0.56);
        this.aimPitch = Clamp(this.aimPitch - dy * 0.0020, -0.32, 0.32);
      }
    });

    window.addEventListener("mouseup", (e) => {
      if (e.button === 0) this.lmbHeld = false;
      if (e.button === 2) {
        this.rmbHeld = false;
        this.SyncStanceButtons();
      }
      dragMode = null;
    });

    this.dom.canvas.addEventListener("wheel", (e) => {
      if (this.view !== "inspect") return;
      e.preventDefault();
      this.orbit.dist = Clamp(this.orbit.dist * (1 + Math.sign(e.deltaY) * 0.10), 0.65, 3.2);
    }, { passive: false });

    // 键盘交互：WASD 移动、Shift 冲刺、C 蹲伏、R 换弹、V 白刃、Tab 切改前/改后、Space 暂停/继续、Home 视角回正
    window.addEventListener("keydown", (e) => {
      if (e.target.closest?.("input, select, textarea")) return;
      if (e.code === "Tab" && this.mode !== "range") {
        e.preventDefault();
        this.SetProfile(this.profile === "after" ? "before" : "after", true);
        return;
      }
      if (e.code === "KeyR" && !e.repeat) {
        e.preventDefault();
        this.TriggerRuntimeReload();
        return;
      }
      if (e.code === "KeyV" && !e.repeat) {
        this.TriggerAction("melee");
        return;
      }
      if (e.code === "KeyC" && !e.repeat && this.mode === "range") {
        this.SetStance(this.stancePreset === "crouch" ? "stand" : "crouch");
        return;
      }
      if (e.code === "Home" || e.code === "KeyQ") {
        this.aimYaw = 0;
        this.aimPitch = 0;
        return;
      }
      if (["KeyW", "KeyA", "KeyS", "KeyD", "ShiftLeft", "ShiftRight", "KeyC", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) {
        if (e.code.startsWith("Arrow")) e.preventDefault();
        this.keys.add(e.code);
      }
    });
    window.addEventListener("keyup", (e) => this.keys.delete(e.code));
    window.addEventListener("blur", () => {
      this.keys.clear();
      this.rmbHeld = false;
      this.lmbHeld = false;
      dragMode = null;
    });
  }

  // ------------------------------------------------------------------ 模式与武器
  SetMode(mode) {
    if (mode !== "range" && mode !== "bolt" && mode !== "inertia") return false;
    this.mode = mode;
    // 切换模式时清空未完结动作与虚拟键位，避免跨模式残留拉栓或亮键
    this.vm.action = null;
    this.vm.pendingBoltAt = -1;
    this.queuedBoltShot = null;
    this.reloadContext = null;
    this.virtualKeys.clear();
    this.boltCadence.Reset();

    for (const btn of document.querySelectorAll("[data-mode]")) {
      btn.setAttribute("aria-selected", String(btn.dataset.mode === mode));
    }
    const isCompare = mode !== "range";
    this.dom.abFloat.hidden = !isCompare;
    this.dom.compareCard.hidden = !isCompare;
    this.dom.boltControls.hidden = mode !== "bolt";
    this.dom.inertiaControls.hidden = mode !== "inertia";
    this.dom.boltCard.hidden = mode !== "bolt";
    this.dom.inertiaDial.hidden = mode !== "inertia";
    this.dom.compareCardTitle.textContent = mode === "bolt" ? "连射拉栓对照" : "移动惯性对照";

    if (mode === "bolt") {
      if (WEAPONS[this.weaponId]?.kind !== "boltRifle") this.SetWeapon("HanYang");
      this.SetView("player");
      this.stancePreset = "stand";
      this.adsLocked = true;
      this.aimYaw = 0;
      this.aimPitch = 0;
      this.vm.SetComparisonProfile?.(this.profile);
      this.ResetBoltBench(this.boltAuto);
    } else if (mode === "inertia") {
      if (WEAPONS[this.weaponId]?.kind === "throwable") this.SetWeapon("HanYang");
      this.SetView("player");
      this.stancePreset = "stand";
      this.adsLocked = false;
      this.aimYaw = 0;
      this.aimPitch = 0;
      this.vm.SetComparisonProfile?.(this.profile);
      this.ResetInertiaBench();
    } else {
      this.SetProfile("after", false);
      this.adsLocked = false;
      this.velRight = 0;
      this.velForward = 0;
      this.posX = 0;
      this.posZ = 0;
      this.vm.moveInertia?.Reset?.();
    }
    this.SyncStanceButtons();
    this.SyncCompareChips();
    this.SyncStageHint();
    return true;
  }

  SetProfile(profile, resetBench = true) {
    const next = profile === "before" ? "before" : "after";
    this.profile = next;
    this.vm.SetComparisonProfile?.(next);
    for (const btn of this.dom.abFloat.querySelectorAll("[data-profile]")) {
      btn.setAttribute("aria-pressed", String(btn.dataset.profile === next));
    }
    this.dom.segBuf.classList.toggle("disabled", next === "before");
    if (resetBench) {
      if (this.mode === "bolt") this.ResetBoltBench(this.boltAuto);
      else if (this.mode === "inertia") this.ResetInertiaBench();
    }
    return next;
  }

  SetWeapon(id) {
    if (!WEAPON_IDS.includes(id)) return false;
    this.weaponId = id;
    const w = WEAPONS[id];
    const prevRig = this.vm.riggedArms;
    this.vm.Equip(id, 0);
    this.vm.SetComparisonProfile?.(this.mode === "range" ? "after" : this.profile);
    this.ammo = w.magazine || 0;
    this.reloadContext = null;
    this.bayonetFixed = false;
    this.vm.SetBayonetFixed?.(false);
    this.autoFire = false;
    this.recoilPitch = 0;
    this.recoilYaw = 0;
    this.boltCadence.Reset();

    if (prevRig !== this.vm.riggedArms) {
      this.DisposeDebugOverlay();
      this.BuildDebugOverlay();
    }

    for (const row of this.dom.weaponList.querySelectorAll(".weapon-row")) {
      row.setAttribute("aria-selected", String(row.dataset.weapon === id));
    }
    this.dom.weaponMeta.textContent = w.magazine ? `${w.magazine} 发` : KindTag(w);
    this.RefreshActionButtons();
    this.RefreshAmmoHud();
    this.SyncCompareChips();
    this.SyncReticleVisibility();
    if (this.mode === "bolt" && w.kind === "boltRifle") this.ResetBoltBench(this.boltAuto);
    else if (this.mode === "inertia") this.ResetInertiaBench();
    return true;
  }

  SetView(view) {
    if (view !== "player" && view !== "inspect") return false;
    this.view = view;
    for (const btn of document.querySelectorAll("[data-view]")) {
      btn.setAttribute("aria-pressed", String(btn.dataset.view === view));
    }
    this.dom.orbitPresets.hidden = view !== "inspect";
    this.dom.stage.classList.toggle("inspect-mode", view === "inspect");
    this.dom.postureDock.hidden = view !== "player";

    this.vm.root.removeFromParent();
    if (view === "inspect") {
      this.standAnchor.add(this.vm.root);
      this.vm.root.position.set(0, 0, 0);
      this.vm.root.quaternion.identity();
      this.vm.root.scale.copy(this.vmSavedLocal.scale);
      this.SetOrbitPreset(this.orbitPreset, false);
    } else {
      this.camera.add(this.vm.root);
      this.vm.root.position.copy(this.vmSavedLocal.pos);
      this.vm.root.quaternion.copy(this.vmSavedLocal.quat);
      this.vm.root.scale.copy(this.vmSavedLocal.scale);
    }
    this.SyncReticleVisibility();
    this.SyncStageHint();
    return true;
  }

  SetOrbitPreset(id, switchView = true) {
    if (switchView && this.view !== "inspect") this.SetView("inspect");
    const p = ORBIT_PRESETS[id] || ORBIT_PRESETS.rightRear;
    this.orbitPreset = id in ORBIT_PRESETS ? id : "rightRear";
    this.orbit.yaw = p.yaw;
    this.orbit.pitch = p.pitch;
    this.orbit.dist = p.dist;
    this.orbit.target.set(0.05, 1.48, -0.36);
    for (const btn of document.querySelectorAll("[data-orbit]")) {
      btn.setAttribute("aria-pressed", String(btn.dataset.orbit === this.orbitPreset));
    }
  }

  SetStance(stance) {
    if (stance !== "stand" && stance !== "crouch" && stance !== "sprint") return;
    this.stancePreset = stance;
    if (stance === "sprint") this.adsLocked = false;
    this.SyncStanceButtons();
  }

  SyncStanceButtons() {
    for (const btn of this.dom.stanceChips.querySelectorAll("[data-stance]")) {
      btn.setAttribute("aria-pressed", String(btn.dataset.stance === this.stancePreset));
    }
    const adsOn = this.adsLocked || this.rmbHeld;
    this.dom.adsToggleBtn.setAttribute("aria-pressed", String(adsOn));
  }

  SyncReticleVisibility() {
    const show = this.showReticle && this.view === "player" && HasIronSight(this.weaponId);
    this.dom.reticle.hidden = !show;
  }

  SyncStageHint() {
    if (this.view === "inspect") {
      this.dom.stageHint.textContent = "左键环绕 · 右键平移 · 滚轮缩放";
    } else if (this.mode === "bolt") {
      this.dom.stageHint.textContent = "左键扣扳机 · 右键按住瞄准 · Tab 切换改前/改后";
    } else if (this.mode === "inertia") {
      this.dom.stageHint.textContent = "WASD 移动 · Shift 冲刺 · C 蹲伏 · Tab 切换改前/改后";
    } else {
      this.dom.stageHint.textContent = "左键开火 · 右键瞄准并拖曳微调 · WASD 移动 · C 蹲伏 · R 换弹";
    }
  }

  RefreshActionButtons() {
    const w = WEAPONS[this.weaponId];
    const showMap = {
      fire: CanAction(w, "fire"),
      bolt: CanAction(w, "bolt"),
      emptyReload: CanAction(w, "reload"),
      tacReload: CanAction(w, "reload"),
      melee: CanAction(w, "melee"),
      throw: CanAction(w, "throw"),
    };
    for (const btn of this.dom.actionGrid.querySelectorAll("[data-act]")) {
      btn.hidden = !showMap[btn.dataset.act];
    }
    this.dom.autoFireBtn.hidden = !CanAction(w, "auto");
    this.dom.autoFireBtn.setAttribute("aria-pressed", String(this.autoFire));
    this.dom.bayonetBtn.hidden = !CanBayonet(this.weaponId);
    this.dom.bayonetBtn.setAttribute("aria-pressed", String(this.bayonetFixed));
  }

  RefreshAmmoHud() {
    const w = WEAPONS[this.weaponId];
    const mag = w?.magazine || 0;
    this.dom.ammoRow.hidden = mag <= 0;
    if (mag <= 0) return;

    const pips = Math.min(mag, 15);
    const filled = mag > 15 ? Math.ceil((this.ammo / mag) * pips) : this.ammo;
    if (this.dom.ammoBars.childElementCount !== pips) {
      this.dom.ammoBars.replaceChildren();
      for (let i = 0; i < pips; i += 1) {
        const s = document.createElement("span");
        s.className = "ammo-pip";
        this.dom.ammoBars.appendChild(s);
      }
    }
    Array.from(this.dom.ammoBars.children).forEach((el, idx) => {
      el.classList.toggle("spent", idx >= filled);
    });
    const empty = this.ammo <= 0;
    this.dom.ammoText.classList.toggle("empty", empty);
    this.dom.ammoText.textContent = empty ? "空仓 · R 换弹" : `${this.ammo} / ${mag}`;
  }

  // ------------------------------------------------------------------ 实战开火与真实装填
  TriggerAction(act) {
    const w = WEAPONS[this.weaponId];
    if (!w) return false;
    if (act === "fire") return this.TryPlayerFire(true);
    if (act === "bolt") {
      if (!CanAction(w, "bolt")) return false;
      this.vm.action = null;
      this.vm.pendingBoltAt = -1;
      return !!this.vm.TriggerBolt();
    }
    if (act === "emptyReload") return this.StartReload("empty");
    if (act === "tacReload") return this.StartReload("tactical");
    if (act === "melee") return !!this.vm.TriggerMelee();
    if (act === "throw") return !!this.vm.TriggerThrow(1);
    return false;
  }

  StartReload(kind) {
    const w = WEAPONS[this.weaponId];
    if (!CanAction(w, "reload")) return false;
    const mag = w.magazine || 5;
    // 清掉进行中的旧动作，确保演示按钮随时一键响应且走正片同一条 TriggerReload 路径
    this.vm.action = null;
    this.vm.pendingBoltAt = -1;
    this.queuedBoltShot = null;

    let remaining = 0;
    if (kind === "empty") {
      this.ammo = 0;
      remaining = 0;
      // 栓动步枪最后一发打空后枪机停在开膛位（正片 TriggerReload 靠 boltOpen 走 openSkipS）
      this.vm.boltOpen = w.kind === "boltRifle";
      this.vm.spentCasePending = false;
    } else {
      remaining = (this.ammo > 0 && this.ammo < mag) ? this.ammo : Math.max(1, Math.min(mag - 1, Math.floor(mag * 0.4)));
      this.ammo = remaining;
      this.vm.boltOpen = false;
      this.vm.spentCasePending = false;
    }
    this.RefreshAmmoHud();
    if (!this.vm.TriggerReload({ remainingRounds: remaining })) return false;
    this.reloadContext = { action: this.vm.action, committed: false };
    return true;
  }

  TriggerRuntimeReload() {
    const w = WEAPONS[this.weaponId];
    if (!CanAction(w, "reload")) return false;
    const mag = w.magazine || 5;
    if (this.vm.IsBusy?.() && this.vm.action?.kind === "reload") return false;
    if (this.ammo <= 0) {
      // 保留真实运行时 boltOpen 状态
      const keepOpen = this.vm.boltOpen || w.kind === "boltRifle";
      this.vm.action = null;
      this.vm.pendingBoltAt = -1;
      this.vm.boltOpen = keepOpen;
      if (!this.vm.TriggerReload({ remainingRounds: 0 })) return false;
      this.reloadContext = { action: this.vm.action, committed: false };
      return true;
    }
    return this.StartReload("tactical");
  }

  TryPlayerFire(allowEmptyAutoRefill = false) {
    const w = WEAPONS[this.weaponId];
    if (!CanAction(w, "fire")) return false;
    if (this.vm.IsBusy?.()) return false;
    if (!this.boltCadence.Ready()) return false;
    const mag = w.magazine || 0;
    if (mag > 0 && this.ammo <= 0) {
      if (allowEmptyAutoRefill) {
        this.TriggerRuntimeReload();
      } else {
        this.base.audio?.Play?.("emptyClick", { volume: 0.45, firstPerson: true });
      }
      return false;
    }
    return this.ExecuteFire({ consumeAmmo: this.mode !== "bolt" });
  }

  ExecuteFire({ consumeAmmo = true } = {}) {
    const w = WEAPONS[this.weaponId];
    if (!w) return false;
    if (consumeAmmo && (w.magazine || 0) > 0) {
      this.ammo = Math.max(0, this.ammo - 1);
      this.RefreshAmmoHud();
    }
    const interval = this.vm.FireIntervalS ? this.vm.FireIntervalS(w) : (w.fireIntervalS || 0.25);
    this.boltCadence.Fired(interval, true);
    this.vm.TriggerFire();
    this.firePunch = 1;

    // 真实相机后坐力（同 Script_Main）
    this.vm.ConsumeCameraKick(_kick);
    this.recoilPitch = Clamp(this.recoilPitch + _kick.x, -0.18, 0.28);
    this.recoilYaw = Clamp(this.recoilYaw + _kick.y, -0.16, 0.16);
    this.recoilRecoverS = w.recoil?.recoverS ?? 0.4;

    // 枪口焰、实弹弹道与靶面弹孔/钢靶受击
    this.vm.MuzzleWorld(_muzzle);
    this.camera.getWorldDirection(_aimDir);
    this.base.vfx?.MuzzleFlash?.(_muzzle, _aimDir, { scale: 1.0, player: true, kind: w.kind });

    const audio = this.base.audio;
    const shotCue = w.shotCue || "rifleNra";
    const shotOpts = { position: _muzzle.clone(), priority: true, firstPerson: true, weaponClass: WeaponClassOf(this.weaponId), burst: 1 };
    if (audio?.PlayGunshot) audio.PlayGunshot(shotCue, shotOpts);
    else audio?.Play?.(shotCue, shotOpts);

    if (w.kind === "boltRifle" && !w.boltCue) {
      audio?.Play?.("bolt", { position: _muzzle.clone(), volume: PLAYER_BOLT_VOLUME, delay: 0.24 });
    }
    if (!w.boltCue) {
      audio?.Play?.("shellDrop", { volume: 0.52, pan: 0.35, delay: w.kind === "boltRifle" ? 0.62 : 0.38 });
    }

    const hit = this.range.RaycastShot(this.camera.position, _aimDir);
    if (hit) {
      this.base.vfx?.Impact?.(hit.point, hit.normal, hit.surface, { weaponKind: w.kind, hardSparks: hit.surface === "metal" });
      audio?.Play?.(IMPACT_CUE[hit.surface] || "impactBrick", { position: hit.point.clone(), volume: 0.5 });
      if (hit.targetLabel) this.FlashHitmarker();
    }
    return true;
  }

  FlashHitmarker() {
    this.hitmarkerTimer = 0.14;
    this.dom.hitmarker.classList.add("on");
  }

  // ------------------------------------------------------------------ #3 连射拉栓对照
  EffectiveBoltBufferS() {
    return this.profile === "before" ? FIRE_CONTROL.inputBufferS : FIRE_CONTROL.boltInputBufferS;
  }

  ResetBoltBench(startShot = true) {
    this.boltCadence.Reset();
    this.queuedBoltShot = null;
    this.boltShots = 0;
    this.boltDrops = 0;
    this.boltBuffers = 0;
    this.boltTapTimer = startShot ? 0.14 : 99;
    this.vm.action = null;
    this.vm.pendingBoltAt = -1;
    this.vm.boltOpen = false;
    this.ammo = WEAPONS[this.weaponId]?.magazine || 5;
    this.RefreshAmmoHud();
    this.SetBoltFeedback("等待扣扳机：观察归位前点击是否被吞", "");
    this.RefreshBoltCard();
  }

  SetBoltFeedback(text, kind) {
    this.dom.boltFeedback.textContent = text;
    this.dom.boltFeedback.className = `bolt-feedback${kind ? ` ${kind}` : ""}`;
    this.boltFeedbackTimer = kind ? 1.15 : 0;
  }

  HandleBoltTrigger(isUser = false) {
    const w = WEAPONS[this.weaponId];
    if (!w || w.kind !== "boltRifle") return false;
    const busy = this.vm.IsBusy?.();
    const ready = this.boltCadence.Ready();
    if (!busy && ready) {
      this.queuedBoltShot = null;
      this.ExecuteFire({ consumeAmmo: false });
      this.boltShots += 1;
      if (isUser) this.SetBoltFeedback("✓ 击发完成，正在拉栓装填", "ok");
      this.RefreshBoltCard();
      return true;
    }

    const action = this.vm.action;
    const remAction = action?.kind === "bolt" ? Math.max(0, action.duration * (1 - action.t)) : 0;
    const remCadence = Math.max(0, this.boltCadence.remainingS || 0);
    const rem = Math.max(remAction, remCadence);
    const bufferWindow = this.EffectiveBoltBufferS();
    const canBuffer = (!action || action.kind === "bolt") && rem <= bufferWindow;

    if (canBuffer) {
      this.queuedBoltShot = { until: this.time + bufferWindow + 0.05 };
      this.boltBuffers += 1;
      this.SetBoltFeedback("✓ 提前点击已预存，拉栓收尾瞬间立即击发！", "ok");
      this.RefreshBoltCard();
      return true;
    }

    this.boltDrops += 1;
    this.SetBoltFeedback(`× 刚才点击被吞（拉栓还剩 ${Math.round(rem * 1000)} ms，超出旧缓冲）`, "drop");
    this.RefreshBoltCard();
    return false;
  }

  StepBoltBench(dt) {
    this.boltCadence.Step(dt);
    if (this.queuedBoltShot) {
      if (this.time > this.queuedBoltShot.until) {
        this.queuedBoltShot = null;
      } else if (!this.vm.IsBusy?.() && this.boltCadence.Ready()) {
        this.queuedBoltShot = null;
        this.ExecuteFire({ consumeAmmo: false });
        this.boltShots += 1;
        if (this.boltAuto && this.boltDriver === "sightTap") {
          const w = WEAPONS[this.weaponId];
          const total = this.vm.FireIntervalS ? this.vm.FireIntervalS(w) : (w.fireIntervalS || 1.2);
          // 模拟真实玩家「看到准星刚回正就点左键」（比拉栓结束早 0.25s）
          this.boltTapTimer = Math.max(0.35, total - 0.25);
        }
        this.RefreshBoltCard();
      }
    }

    if (this.boltAuto && this.boltDriver !== "manual") {
      this.boltTapTimer -= dt;
      if (this.boltTapTimer <= 0) {
        const ok = this.HandleBoltTrigger(false);
        const w = WEAPONS[this.weaponId];
        const total = this.vm.FireIntervalS ? this.vm.FireIntervalS(w) : (w.fireIntervalS || 1.2);
        if (this.boltDriver === "rapid") {
          this.boltTapTimer = 0.26;
        } else if (!ok) {
          this.boltTapTimer = 0.42;
        } else if (this.queuedBoltShot) {
          this.boltTapTimer = 99;
        } else {
          this.boltTapTimer = Math.max(0.35, total - 0.25);
        }
      }
    }
    this.RefreshBoltCard();
  }

  RefreshBoltCard() {
    if (this.mode !== "bolt") return;
    this.dom.boltStats.textContent = `连发 ${this.boltShots} · 吞键 ${this.boltDrops}`;
    const w = WEAPONS[this.weaponId];
    const total = Math.max(0.3, this.vm.FireIntervalS ? this.vm.FireIntervalS(w) : (w?.fireIntervalS || 1.25));
    const rem = Math.max(
      this.vm.action?.kind === "bolt" ? Math.max(0, this.vm.action.duration * (1 - this.vm.action.t)) : 0,
      Math.max(0, this.boltCadence.remainingS || 0),
    );
    const progress = Clamp01(1 - rem / total);
    this.dom.boltCursor.style.left = `${(progress * 100).toFixed(1)}%`;

    const bufFrac = Clamp(this.EffectiveBoltBufferS() / total, 0.17, 0.40);
    const fireFrac = 0.15;
    const boltFrac = Math.max(0.28, 1 - fireFrac - bufFrac);
    this.dom.segFire.style.width = `${(fireFrac * 100).toFixed(1)}%`;
    this.dom.segBolt.style.width = `${(boltFrac * 100).toFixed(1)}%`;
    this.dom.segBuf.style.width = `${(bufFrac * 100).toFixed(1)}%`;
    this.dom.segBuf.textContent = this.profile === "before" ? "无缓冲" : "可提前扣扳机";
  }

  // ------------------------------------------------------------------ #4 移动惯性对照与紧凑指示盘
  ResetInertiaBench() {
    this.inertiaClock = 0;
    this.velRight = 0;
    this.velForward = 0;
    this.posX = 0;
    this.posZ = 0;
    this.crouchT = 0;
    this.eyeY = PLAYER_BASE_EYE.y;
    this.inertiaTrail.length = 0;
    this.vm.moveInertia?.Reset?.();
  }

  DrawInertiaDial(phaseText) {
    const canvas = this.dom.inertiaCanvas;
    const ctx = canvas?.getContext("2d");
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    const cx = w * 0.5;
    const cy = h * 0.5;
    const r = w * 0.43;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#0b1117";
    ctx.fillRect(0, 0, w, h);

    // 圆形坐标格
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.lineWidth = 1;
    for (const frac of [0.5, 1.0]) {
      ctx.beginPath();
      ctx.arc(cx, cy, r * frac, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy);
    ctx.moveTo(cx, cy - r); ctx.lineTo(cx, cy + r);
    ctx.stroke();

    const mi = this.vm.moveInertia;
    const ox = mi?.x || 0;
    const oy = mi?.y || 0;
    const oz = mi?.z || 0;
    const roll = mi?.roll || 0;

    // 映射到指示盘像素（±14mm 对应满圆，清晰可见起步滞后与急停回摆）
    const px = cx + Clamp(ox / 0.014, -1, 1) * (r - 6);
    const py = cy + Clamp((oz - oy * 0.7) / 0.014, -1, 1) * (r - 6);
    this.inertiaTrail.push({ x: px, y: py });
    if (this.inertiaTrail.length > 28) this.inertiaTrail.shift();

    // 轨迹拖尾
    const accent = this.profile === "before" ? "240,138,108" : "142,224,207";
    for (let i = 1; i < this.inertiaTrail.length; i += 1) {
      const a = i / this.inertiaTrail.length;
      ctx.strokeStyle = `rgba(${accent}, ${(a * 0.78).toFixed(2)})`;
      ctx.lineWidth = 1.6 + a * 1.6;
      ctx.beginPath();
      ctx.moveTo(this.inertiaTrail[i - 1].x, this.inertiaTrail[i - 1].y);
      ctx.lineTo(this.inertiaTrail[i].x, this.inertiaTrail[i].y);
      ctx.stroke();
    }

    // 枪身滚转倾角短线
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(-roll * 4.8);
    ctx.strokeStyle = "#e8c474";
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(-11, 0); ctx.lineTo(11, 0);
    ctx.stroke();
    ctx.restore();

    // 中心实心光点
    ctx.fillStyle = this.profile === "before" ? "#f08a6c" : "#8ee0cf";
    ctx.beginPath();
    ctx.arc(px, py, 4.2, 0, Math.PI * 2);
    ctx.fill();

    this.dom.inertiaPhase.textContent = phaseText;
    this.dom.inertiaPhase.style.color = this.profile === "before" ? "#ffb39c" : "#8ee0cf";
  }

  // ------------------------------------------------------------------ 慢放、暂停、逐帧
  SetPaused(on) {
    this.paused = !!on;
    this.dom.pauseBtn.setAttribute("aria-pressed", String(this.paused));
    this.dom.pauseBtn.textContent = this.paused ? "▶ 继续" : "⏸ 暂停";
  }

  StepActionBackward() {
    const a = this.vm.action;
    if (!a || !a.duration) return;
    const prevT = Math.max(0, a.t - (1 / 60) / a.duration);
    this.ScrubActiveAction(prevT);
  }

  ScrubActiveAction(normT) {
    const a = this.vm.action;
    if (!a || !a.duration) return;
    this.SetPaused(true);
    a.t = Clamp01(normT);
    // 强制 viewmodel 以极小步长按当前 a.t 重算所有骨骼/部件变换
    this.vm.Update(1e-5, this.BuildViewmodelInput(1e-5, 0, 0));
    this.SyncPlaybackHud();
  }

  SyncPlaybackHud() {
    const a = this.vm.action;
    const labels = { reload: "换弹", bolt: "拉栓", melee: "白刃", throw: "投掷" };
    if (a && a.duration > 0) {
      const pct = Math.round(Clamp01(a.t) * 100);
      this.dom.actionStatusText.textContent = `${labels[a.kind] || a.kind} ${pct}%`;
      this.dom.scrubWrap.hidden = false;
      this.dom.actionScrub.value = Clamp01(a.t).toFixed(3);
    } else {
      this.dom.actionStatusText.textContent = this.paused ? "已暂停" : (this.timeScale < 1 ? `${this.timeScale}× 慢放` : "实时运行");
      this.dom.scrubWrap.hidden = true;
    }
  }

  // ------------------------------------------------------------------ 骨骼调试（默认关闭）
  BuildDebugOverlay() {
    this.debugGroup = new THREE.Group();
    this.debugGroup.name = "FpsDebugMarkers";
    this.debugGroup.userData.skipNormalDepth = true;
    this.vm.root.add(this.debugGroup);
    this.dom.mountLabels.replaceChildren();

    for (const spec of MOUNT_SPECS) {
      const g = new THREE.Group();
      const geo = new THREE.SphereGeometry(spec.radius || 0.0085, 10, 8);
      const mat = new THREE.MeshBasicMaterial({ color: spec.color, depthTest: false, depthWrite: false });
      const sphere = new THREE.Mesh(geo, mat);
      sphere.renderOrder = 1003;
      g.add(sphere);
      this.debugGroup.add(g);
      this.debugMarkers.set(spec.id, g);
      this.debugResources.push(geo, mat);

      const tag = document.createElement("div");
      tag.className = "mount-tag";
      tag.textContent = spec.label;
      tag.style.setProperty("--mc", `#${spec.color.toString(16).padStart(6, "0")}`);
      this.dom.mountLabels.appendChild(tag);
      this.debugLabels.set(spec.id, tag);
    }

    if (this.vm.riggedArms?.root) {
      this.skeletonHelper = new THREE.SkeletonHelper(this.vm.riggedArms.root);
      const mats = Array.isArray(this.skeletonHelper.material) ? this.skeletonHelper.material : [this.skeletonHelper.material];
      for (const m of mats) { m.depthTest = false; m.depthWrite = false; m.transparent = true; m.opacity = 0.8; }
      this.skeletonHelper.renderOrder = 1002;
      this.base.scene.add(this.skeletonHelper);
      this.debugResources.push(this.skeletonHelper.geometry, ...mats);
    }
    this.SyncDebugVisibility();
  }

  DisposeDebugOverlay() {
    this.debugGroup?.removeFromParent();
    this.skeletonHelper?.removeFromParent();
    for (const r of new Set(this.debugResources)) r?.dispose?.();
    this.debugResources.length = 0;
    this.debugMarkers.clear();
    this.debugLabels.clear();
    this.debugGroup = null;
    this.skeletonHelper = null;
  }

  SyncDebugVisibility() {
    if (this.debugGroup) this.debugGroup.visible = this.showDebug;
    if (this.skeletonHelper) this.skeletonHelper.visible = this.showDebug;
    this.dom.mountLabels.hidden = !this.showDebug;
    this.dom.debugBadge.hidden = !this.showDebug;
  }

  UpdateDebugOverlay(dt) {
    if (!this.showDebug || !this.debugGroup) return;
    this.vm.root.updateWorldMatrix(true, true);
    const invRoot = _mA.copy(this.vm.root.matrixWorld).invert();
    const rig = this.vm.rig;
    const grip = this.vm.riggedArms?.gripDebug;
    const rect = this.dom.canvas.getBoundingClientRect();

    const Place = (id, worldPos) => {
      const m = this.debugMarkers.get(id);
      const tag = this.debugLabels.get(id);
      if (!m || !tag) return;
      if (!worldPos) { m.visible = false; tag.hidden = true; return; }
      m.visible = true;
      m.position.copy(worldPos).applyMatrix4(invRoot);
      const p = _vB.copy(worldPos).project(this.camera);
      if (p.z < -1 || p.z > 1) { tag.hidden = true; return; }
      tag.hidden = false;
      tag.style.left = `${(p.x * 0.5 + 0.5) * rect.width}px`;
      tag.style.top = `${(-p.y * 0.5 + 0.5) * rect.height}px`;
    };

    const RigWorld = (localVec) => localVec && rig?.group ? _vA.copy(localVec).applyMatrix4(rig.group.matrixWorld).clone() : null;
    Place("muzzle", RigWorld(rig?.muzzle));
    Place("gripR", RigWorld(rig?.gripR));
    Place("gripL", RigWorld(rig?.gripL));
    Place("sight", RigWorld(rig?.sight));
    Place("actualR", grip?.r?.actualWorld || null);
    Place("actualL", grip?.l?.actualWorld || null);

    this.debugRefreshT += dt;
    if (this.debugRefreshT >= 0.12) {
      this.debugRefreshT = 0;
      const rMm = grip?.r?.posMm ?? 0;
      const lMm = grip?.l?.posMm ?? 0;
      this.dom.debugBadge.textContent = `掌心贴合 右 ${rMm.toFixed(2)}mm · 左 ${lMm.toFixed(2)}mm`;
    }
  }

  // ------------------------------------------------------------------ 主仿真步进
  BuildViewmodelInput(dt, targetSprint, targetAds) {
    const moveSpeed = Math.hypot(this.velRight, this.velForward);
    return {
      dt,
      moveSpeed,
      strafe: Clamp(this.velRight / 3.8, -1, 1),
      localMoveRight: this.velRight,
      localMoveForward: this.velForward,
      stanceEyeHeight: this.eyeY,
      grounded: true,
      sprint: targetAds > 0.2 ? 0 : targetSprint,
      ads: targetAds,
      lookDeltaYaw: 0,
      lookDeltaPitch: 0,
      crouch: this.crouchT,
      elapsed: this.time,
      lowAmmo: (WEAPONS[this.weaponId]?.magazine || 0) > 0 && this.ammo <= 0,
    };
  }

  ComputeMovementAndStance(dt) {
    this.virtualKeys.clear();
    let targetRight = 0;
    let targetForward = 0;
    let targetCrouch = this.stancePreset === "crouch" ? 1 : 0;
    let targetSprint = this.stancePreset === "sprint" ? 1 : 0;
    let phaseLabel = "已回稳";

    // 方向键微调瞄准方向
    const turnSpeed = 0.85;
    if (this.keys.has("ArrowLeft")) this.aimYaw = Clamp(this.aimYaw + turnSpeed * dt, -0.56, 0.56);
    if (this.keys.has("ArrowRight")) this.aimYaw = Clamp(this.aimYaw - turnSpeed * dt, -0.56, 0.56);
    if (this.keys.has("ArrowUp")) this.aimPitch = Clamp(this.aimPitch + turnSpeed * 0.7 * dt, -0.32, 0.32);
    if (this.keys.has("ArrowDown")) this.aimPitch = Clamp(this.aimPitch - turnSpeed * 0.7 * dt, -0.32, 0.32);

    const hasManualKeys = this.keys.has("KeyW") || this.keys.has("KeyA") || this.keys.has("KeyS") || this.keys.has("KeyD");

    if (this.mode === "inertia" && this.inertiaAuto && this.inertiaDriver !== "manual" && !hasManualKeys) {
      this.inertiaClock += dt;
      if (this.inertiaDriver === "stepStrafe") {
        const u = this.inertiaClock % 3.2;
        if (u < 1.65) {
          targetRight = 3.8;
          this.virtualKeys.add("KeyD");
          phaseLabel = u < 0.32 ? "起步滞后" : "匀速回正";
        } else {
          targetRight = 0;
          phaseLabel = u < 2.15 ? "急停前甩" : "已回稳";
        }
      } else if (this.inertiaDriver === "counterStrafe") {
        const u = this.inertiaClock % 3.2;
        if (u < 1.15) { targetRight = 3.8; this.virtualKeys.add("KeyD"); phaseLabel = u < 0.28 ? "右切滞后" : "右移回正"; }
        else if (u < 1.55) { targetRight = 0; phaseLabel = "急停回摆"; }
        else if (u < 2.70) { targetRight = -3.8; this.virtualKeys.add("KeyA"); phaseLabel = u < 1.85 ? "左折滞后" : "左移回正"; }
        else { targetRight = 0; phaseLabel = "急停回摆"; }
      } else if (this.inertiaDriver === "surgeStop") {
        const u = this.inertiaClock % 3.0;
        if (u < 1.45) {
          targetForward = 4.6;
          targetSprint = 0.45;
          this.virtualKeys.add("KeyW");
          this.virtualKeys.add("Shift");
          phaseLabel = u < 0.30 ? "冲刺后压" : "前推巡航";
        } else {
          targetForward = 0;
          phaseLabel = u < 1.95 ? "急停前冲" : "已回稳";
        }
      } else if (this.inertiaDriver === "stanceHop") {
        const u = this.inertiaClock % 2.8;
        if (u < 1.4) {
          targetCrouch = 1;
          this.virtualKeys.add("KeyC");
          phaseLabel = u < 0.38 ? "下蹲上抬" : "蹲姿已稳";
        } else {
          targetCrouch = 0;
          phaseLabel = u < 1.78 ? "起身下沉" : "站姿已稳";
        }
      }
    } else {
      const r = (this.keys.has("KeyD") ? 1 : 0) - (this.keys.has("KeyA") ? 1 : 0);
      const f = (this.keys.has("KeyW") ? 1 : 0) - (this.keys.has("KeyS") ? 1 : 0);
      const shift = this.keys.has("ShiftLeft") || this.keys.has("ShiftRight");
      const crouchKey = this.keys.has("KeyC");
      if (crouchKey && this.mode === "inertia") targetCrouch = 1;
      if (shift && (r || f)) targetSprint = 1;
      const len = Math.hypot(r, f) || 1;
      const top = targetSprint ? 5.0 : targetCrouch ? 2.1 : 3.8;
      targetRight = (r / len) * (r || f ? top : 0);
      targetForward = (f / len) * (r || f ? top : 0);
      if (r || f) phaseLabel = targetSprint ? "冲刺前推" : "移动惯性";
    }

    const velFollow = 1 - Math.exp(-15 * dt);
    const crouchFollow = 1 - Math.exp(-11 * dt);
    this.velRight += (targetRight - this.velRight) * velFollow;
    this.velForward += (targetForward - this.velForward) * velFollow;
    this.crouchT += (targetCrouch - this.crouchT) * crouchFollow;
    this.eyeY = THREE.MathUtils.lerp(PLAYER_BASE_EYE.y, CROUCH_EYE_Y, this.crouchT);

    // 射手位置在靶位安全区内真实移动，横移与前进时两侧水泥柱立刻产生清晰视差
    if (this.mode === "inertia" && this.inertiaAuto && this.inertiaDriver !== "manual" && !hasManualKeys) {
      const targetX = Clamp(this.velRight * 0.24, -1.25, 1.25);
      const targetZ = Clamp(-this.velForward * 0.16, -0.75, 0.75);
      const follow = 1 - Math.exp(-5.5 * dt);
      this.posX += (targetX - this.posX) * follow;
      this.posZ += (targetZ - this.posZ) * follow;
    } else {
      this.posX = Clamp(this.posX + this.velRight * dt * 0.65, -2.6, 2.6);
      this.posZ = Clamp(this.posZ - this.velForward * dt * 0.65, -0.55, 2.2);
    }

    const adsWanted = HasIronSight(this.weaponId) && (this.adsLocked || this.rmbHeld) ? 1 : 0;
    const sprintEff = adsWanted > 0.2 ? 0 : targetSprint;
    return { sprintEff, adsWanted, phaseLabel };
  }

  StepSimulation(rawDt) {
    const dt = Math.min(MAX_FRAME_DT, Math.max(0, rawDt));
    this.time += dt;

    // 命中十字淡出
    if (this.hitmarkerTimer > 0) {
      this.hitmarkerTimer = Math.max(0, this.hitmarkerTimer - dt);
      if (this.hitmarkerTimer <= 0) this.dom.hitmarker.classList.remove("on");
    }

    // 开火顿挫与后坐回稳（同 Script_Main）
    if (this.firePunch > 0) this.firePunch = Math.max(0, this.firePunch - dt / FIRE_PUNCH_DECAY_S);
    const recAlpha = 1 - Math.exp(-dt / Math.max(0.08, this.recoilRecoverS * 0.45));
    this.recoilPitch += (0 - this.recoilPitch) * recAlpha;
    this.recoilYaw += (0 - this.recoilYaw) * recAlpha;

    // 节拍与自动连发
    if (this.mode === "bolt") {
      this.StepBoltBench(dt);
    } else {
      this.boltCadence.Step(dt);
      const w = WEAPONS[this.weaponId];
      if ((this.autoFire || (this.lmbHeld && CanAction(w, "auto"))) && this.mode === "range") {
        this.TryPlayerFire(false);
      }
    }

    // 运动、姿态与 Viewmodel 更新
    const { sprintEff, adsWanted, phaseLabel } = this.ComputeMovementAndStance(dt);
    const vmInput = this.BuildViewmodelInput(dt, sprintEff, adsWanted);
    this.vm.Update(dt, vmInput);

    // 相机 ADS FOV 过渡（150ms，受 adsSuppress 调制，同 Script_FrameStepsPlayer）
    const adsStep = dt / ADS_FOV_TIME;
    if (adsWanted > this.adsFovT) this.adsFovT = Math.min(adsWanted, this.adsFovT + adsStep);
    else this.adsFovT = Math.max(adsWanted, this.adsFovT - adsStep);

    // 靶场与特效更新
    this.range.Update(dt);
    this.base.vfx?.Update?.(dt);

    // 更新 HUD
    this.UpdatePostureHud(sprintEff, adsWanted);
    if (this.mode === "inertia") this.DrawInertiaDial(phaseLabel);
    this.SyncPlaybackHud();
  }

  UpdatePostureHud(sprintEff, adsWanted) {
    const speed = Math.hypot(this.velRight, this.velForward);
    const stance = this.crouchT > 0.45 ? "crouch" : (sprintEff > 0.35 && speed > 0.5 ? "sprint" : "stand");
    const isAds = adsWanted > 0.5;
    const isMoving = speed > 0.25;

    this.dom.silhouetteWrap.dataset.stance = stance;
    this.dom.silhouetteWrap.dataset.ads = isAds ? "1" : "0";
    this.dom.silhouetteWrap.dataset.moving = isMoving ? "1" : "0";

    const stanceName = stance === "crouch" ? "蹲伏" : stance === "sprint" ? "冲刺" : "站立";
    const aimName = stance === "sprint" ? "持枪奔跑" : (isAds ? "开镜瞄准" : "腰射持枪");
    this.dom.stanceLabel.textContent = `${stanceName} · ${aimName}`;
    this.dom.speedLabel.textContent = isMoving ? `${speed.toFixed(1)} m/s` : "静止";
    this.dom.reticle.classList.toggle("ads", isAds);

    // 实时键位高亮（支持真实按键 + 自动演示虚拟按键）
    const activeSet = new Set([...this.keys, ...this.virtualKeys]);
    if (this.keys.has("ShiftLeft") || this.keys.has("ShiftRight") || stance === "sprint") activeSet.add("Shift");
    if (stance === "crouch") activeSet.add("KeyC");
    for (const el of this.dom.keycaps.querySelectorAll(".kc")) {
      el.classList.toggle("on", activeSet.has(el.dataset.k));
    }
  }

  ApplyCamera() {
    if (this.view === "inspect") {
      const { yaw, pitch, dist, target } = this.orbit;
      const cp = Math.cos(pitch);
      this.camera.position.set(
        target.x + Math.sin(yaw) * cp * dist,
        target.y + Math.sin(pitch) * dist,
        target.z + Math.cos(yaw) * cp * dist,
      );
      this.camera.lookAt(target);
      this.SetCameraFov(44);
      return;
    }

    this.camera.position.set(PLAYER_BASE_EYE.x + this.posX, this.eyeY, PLAYER_BASE_EYE.z + this.posZ);
    const headDip = this.vm.headDipRad || 0;
    this.camera.rotation.set(
      Clamp(this.aimPitch + this.recoilPitch - headDip, -0.75, 0.75),
      this.aimYaw + this.recoilYaw,
      0,
      "YXZ",
    );

    const w = WEAPONS[this.weaponId];
    const baseFov = this.base.graphics?.fov || 70;
    const adsScale = w?.adsFovScale ?? 0.75;
    const adsEff = Clamp01(this.adsFovT * (this.vm.adsSuppress ?? 1));
    const punchDeg = this.firePunch * this.firePunch * FIRE_PUNCH_FOV_DEG;
    const fov = baseFov * (1 - adsEff * (1 - adsScale)) + punchDeg;
    this.SetCameraFov(fov);
  }

  SetCameraFov(fov) {
    if (Math.abs(this.camera.fov - fov) < 1e-4) return;
    this.camera.fov = fov;
    this.camera.updateProjectionMatrix();
  }

  AdsSightUv() {
    const rig = this.vm?.rig;
    if (!rig?.sight || !rig.group) return null;
    rig.group.updateWorldMatrix(true, false);
    _sightWorld.copy(rig.sight).applyMatrix4(rig.group.matrixWorld).project(this.camera);
    return [_sightWorld.x * 0.5 + 0.5, _sightWorld.y * 0.5 + 0.5];
  }

  RenderFrame(dt) {
    if (!this.paused && dt > 0) {
      this.StepSimulation(dt * this.timeScale);
    }
    this.ApplyCamera();
    this.camera.updateMatrixWorld(true);
    this.UpdateDebugOverlay(dt);

    // 与正片完全一致的 ADS 近景景深 + 镜头光晕压暗
    const adsNearDof = this.view === "player" && this.vm?.rig?.sight
      ? Clamp01(this.adsFovT * (this.vm.adsSuppress ?? 1))
      : 0;
    const nearDof = adsNearDof > 0.01 ? {
      strength: adsNearDof * ADS_NEAR_DOF_STRENGTH,
      focus: ADS_NEAR_DOF_FOCUS_M,
      range: ADS_NEAR_DOF_RANGE_M,
      maxPx: ADS_NEAR_DOF_MAX_PX,
      sightUv: this.AdsSightUv(),
    } : null;
    const lensFlareScale = 1 - adsNearDof * (1 - LENS_FLARE.adsScale);

    this.base.Frame(dt > 0 ? dt : 1 / 60, { nearDof, lensFlareScale });
  }

  Snapshot() {
    const w = WEAPONS[this.weaponId];
    return {
      mode: this.mode,
      profile: this.profile,
      sky: this.skyName,
      view: this.view,
      weaponId: this.weaponId,
      weaponName: w?.name || this.weaponId,
      ammo: this.ammo,
      magazine: w?.magazine || 0,
      boltOpen: !!this.vm.boltOpen,
      fov: Number(this.camera.fov.toFixed(2)),
      adsFovT: Number(this.adsFovT.toFixed(3)),
      stance: this.dom.silhouetteWrap.dataset.stance,
      action: this.vm.action ? { kind: this.vm.action.kind, t: Number(this.vm.action.t.toFixed(3)) } : null,
      boltShots: this.boltShots,
      boltDrops: this.boltDrops,
      boltBuffers: this.boltBuffers,
      moveInertia: this.vm.moveInertia ? {
        offsetXMm: Number(((this.vm.moveInertia.x || 0) * 1000).toFixed(2)),
        offsetYMm: Number(((this.vm.moveInertia.y || 0) * 1000).toFixed(2)),
        offsetZMm: Number(((this.vm.moveInertia.z || 0) * 1000).toFixed(2)),
        rollDeg: Number(THREE.MathUtils.radToDeg(this.vm.moveInertia.roll || 0).toFixed(2)),
      } : null,
      paused: this.paused,
      timeScale: this.timeScale,
    };
  }
}

async function Main() {
  const bootOverlay = document.getElementById("bootOverlay");
  const bootBar = document.getElementById("bootBar");
  const bootStep = document.getElementById("bootStep");
  const SetStep = (label, progress) => {
    if (bootStep) bootStep.textContent = label;
    if (bootBar) bootBar.style.width = `${Math.round(Clamp01(progress) * 100)}%`;
  };
  const canvas = document.getElementById("view");
  const params = new URLSearchParams(location.search);
  try {
    const base = await CreateStudioBase({
      canvas,
      onStep: SetStep,
      fitCanvas: true,
      initialSky: "firstLevelBattleDay",
    });
    const app = new FirstPersonInspectionApp(base);
    // 先跑 2 帧预热相机、靶场与反射探针
    app.RenderFrame(1 / 60);
    app.RenderFrame(1 / 60);

    const manual = params.get("manual") === "1";
    base.onResize = () => {
      if (manual || app.paused) app.RenderFrame(0);
    };
    let last = performance.now();
    const Loop = (now) => {
      requestAnimationFrame(Loop);
      const dt = Math.min(MAX_FRAME_DT, (now - last) / 1000);
      last = now;
      if (manual) return;
      app.RenderFrame(dt);
    };
    requestAnimationFrame(Loop);

    window.FirstPersonInspection = {
      ready: true,
      app,
      base,
      SetMode: (m) => app.SetMode(m),
      SetProfile: (p, reset) => app.SetProfile(p, reset),
      SetWeapon: (id) => app.SetWeapon(id),
      SetView: (v) => app.SetView(v),
      SetSky: (s) => app.ApplySky(s),
      SetStance: (s) => app.SetStance(s),
      SetAds: (on) => { app.adsLocked = !!on; app.SyncStanceButtons(); },
      Trigger: (act) => app.TriggerAction(act),
      StepFrames(count = 1, dt = 1 / 60) { for (let i = 0; i < count; i += 1) app.RenderFrame(dt); },
      Snapshot: () => app.Snapshot(),
    };
    bootOverlay?.setAttribute("hidden", "");
  } catch (error) {
    SetStep(`启动失败：${error.message}`, 0);
    console.error(error);
    throw error;
  }
}

if (typeof document !== "undefined" && document.getElementById("bootOverlay")) Main();
