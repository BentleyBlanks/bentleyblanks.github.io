// 第一人称持枪检查：只读检查正片 Viewmodel、挂点/骨骼残差与准心对位，并内建
// 「连射拉栓（#3）」与「移动惯性（#4）」改前 / 改后实时对照台架（writeBack: false）。

import * as THREE from "three";
import {
  El, Panel, Section, Slider, Chips, Toggle, Button, ButtonRow, Facts, ListBox,
} from "../Script_EditorUi.mjs";
import { MarkNoPrepass } from "../Script_Post.mjs";
import { WEAPONS } from "../Data_Weapons.mjs";
import { WeaponShelved } from "../Script_Weapons.mjs";
import { WEAPON_MESH_BY_ID, WEAPON_MESH_VARIANTS, BAYONET_MESH_BY_WEAPON } from "../Data_Meshes.mjs";
import { FPS_ANIMATION_LABELS } from "../Data_FpsSkeletalAnimation.mjs";
import { FIRE_CONTROL } from "../Data_Tuning_FirearmActions.mjs";
import { FirearmCadence } from "../Script_FirearmActions.mjs";
import { TOOL_INFO } from "../Data_DevTools.mjs";

const MOUNT_NAMES = Object.freeze(["muzzle", "gripR", "gripL", "sight", "magazine"]);
const MOUNT_STYLE = Object.freeze({
  muzzle: { color: 0xe5533d, label: "muzzle 枪口" },
  gripR: { color: 0xf0a43a, label: "gripR 后手" },
  gripL: { color: 0x4ca7e8, label: "gripL 前手" },
  sight: { color: 0x69c76f, label: "sight 瞄具" },
  magazine: { color: 0xb889e8, label: "magazine 弹仓" },
});

const PREFERRED_ORDER = Object.freeze([
  "ZhongZheng", "HanYang", "Type38", "Zb26", "Type11",
  "ServicePistol", "Grenade", "GrenadeBundle",
  "Dadao", "OfficerSwordSet",
]);

const BOLT_RIFLE_IDS = Object.freeze(["HanYang", "ZhongZheng", "Type38"]);

function IsFirstPersonInspectable(id) {
  const weapon = WEAPONS[id];
  if (!weapon || !WEAPON_MESH_BY_ID[id] || WeaponShelved(id)) return false;
  return weapon.kind !== "vehicle" && weapon.kind !== "mortar" && weapon.kind !== "hmg";
}

const FIRST_PERSON_IDS = Object.freeze([
  ...PREFERRED_ORDER.filter(IsFirstPersonInspectable),
  ...Object.keys(WEAPONS)
    .filter((id) => IsFirstPersonInspectable(id) && !PREFERRED_ORDER.includes(id))
    .sort(),
]);

function PoseKind(weapon) {
  if (!weapon) return "—";
  if (weapon.kind === "lmg") return "机枪";
  if (weapon.kind === "pistol") return "手枪";
  if (weapon.kind === "throwable") return "投掷";
  if (weapon.kind === "melee") return "近战";
  return "步枪";
}

function CanAction(weapon, action) {
  if (!weapon) return false;
  if (action === "fire") return !!weapon.fireIntervalS && weapon.kind !== "melee" && weapon.kind !== "throwable";
  if (action === "bolt") return weapon.kind === "boltRifle" && !!weapon.boltTimeS;
  if (action === "reload") return !!weapon.reloadKind && !!weapon.reloadTimeS;
  if (action === "throw") return weapon.kind === "throwable";
  if (action === "melee") return weapon.kind !== "throwable";
  if (action === "auto") return !!weapon.rpm && CanAction(weapon, "fire");
  return false;
}

function HasIronSight(id) {
  const kind = WEAPONS[id]?.kind;
  return kind === "boltRifle" || kind === "lmg" || kind === "pistol";
}

function CanPreviewBayonet(id) {
  return !!(WEAPONS[id]?.bayonet && BAYONET_MESH_BY_WEAPON[id]);
}

const ACTION_CLIP_PREFIX = "action:";
const ACTION_TIMELINE_FPS = 60;
function ActionClipLabel(weaponId, action) {
  if (action === "melee") return weaponId === "Dadao" ? "大刀劈砍（程序动作）" : "白刃（程序动作）";
  return action;
}

function SetDepth(material, depthTest) {
  const materials = Array.isArray(material) ? material : [material];
  for (const entry of materials) {
    if (!entry) continue;
    entry.depthTest = depthTest;
    entry.depthWrite = false;
    entry.transparent = true;
    entry.opacity = 0.92;
  }
}

function SerializeTransform(object) {
  return {
    position: object.position.clone(),
    quaternion: object.quaternion.clone(),
    scale: object.scale.clone(),
  };
}

function RestoreTransform(object, saved) {
  object.position.copy(saved.position);
  object.quaternion.copy(saved.quaternion);
  object.scale.copy(saved.scale);
}

const PLAYER_EYE = Object.freeze({ x: 0, y: 1.56, z: 3.2 });
const PLAYER_LOOK = Object.freeze({ x: 0, y: 1.56, z: -6.8 });

export class FirstPersonEditor {
  static id = "firstPerson";
  static label = TOOL_INFO.firstPerson.label;
  static hint = TOOL_INFO.firstPerson.hint;

  constructor(host) {
    this.id = FirstPersonEditor.id;
    this.host = host;
    this.studio = host.studio;
    this.cameraMode = "studio";
    this.panel = null;
    this.weaponId = "ZhongZheng";
    this.weaponVariant = 0;
    this.view = "player";
    this.pose = "hip";
    this.ads = 0;
    this.sprint = 0;
    this.time = 0;
    this.mode = "inspect";
    this.comparisonProfile = "after";

    this.showReticle = true;
    this.showRange = true;
    this.showMounts = true;
    this.showSkeleton = true;
    this.showGripLines = true;
    this.showGrid = false;

    this.mountSources = new Map();
    this.markerEntries = new Map();
    this.markerResources = [];
    this.lineEntries = new Map();
    this.labelEntries = new Map();
    this.rangeResources = [];
    this.rangeBackdrop = null;

    this.cleanTimer = null;
    this.refreshTimer = 0;
    this.saved = null;
    this.actionPreview = null;
    this.bayonetPreview = false;
    this.autoFire = false;
    this.fireTimer = 0;

    // #3 Bolt-fire loop bench state
    this.boltDriver = "sightTap";
    this.boltPlaying = true;
    this.boltTapTimer = 0;
    this.boltCadence = new FirearmCadence();
    this.queuedBoltShot = null;
    this.boltShotCount = 0;
    this.boltDropCount = 0;
    this.boltBufferCount = 0;
    this.boltHistory = [];
    this.boltEvents = [];

    // #4 Movement inertia bench state
    this.inertiaDriver = "stepStrafe";
    this.inertiaPlaying = true;
    this.inertiaClock = 0;
    this.simRightMps = 0;
    this.simForwardMps = 0;
    this.simEyeHeight = 1.62;
    this.simCrouch = 0;
    this.simCamOffsetX = 0;
    this.simCamOffsetZ = 0;
    this.manualKeys = new Set();
    this.inertiaHistory = [];
  }

  Enter(root) {
    const viewmodel = this.host.viewmodel;
    if (!viewmodel) throw new Error("第一人称检查编辑器需要 Viewmodel");
    this.saved = {
      parent: viewmodel.root.parent,
      transform: SerializeTransform(viewmodel.root),
      visible: viewmodel.root.visible,
      weaponId: this.host.playerWeaponId || null,
      weaponVariant: this.host.playerWeaponVariant ?? 0,
      bayonetFixed: !!viewmodel.bayonetFixed,
      comparisonProfile: viewmodel.comparisonProfile || "after",
    };

    this.studio.Open(this.host.hideInStudio);
    this.BuildRangeBackdrop();

    this.panel = Panel({
      title: "第一人称持枪检查", sub: "",
      variant: "work", onClose: () => this.host.Close(),
    });
    root.appendChild(this.panel.root);
    this.BuildModeBar();
    this.BuildUi(this.panel.body);
    this.BuildOverlay(root);
    this.BuildScopeDock(root);
    this.BuildDiagnostics();
    this.BindKeys();

    const params = new URLSearchParams(globalThis.location?.search || "");
    const initialWeapon = params.get("weapon");
    if (initialWeapon && FIRST_PERSON_IDS.includes(initialWeapon)) this.weaponId = initialWeapon;
    this.SetWeapon(this.weaponId);
    this.SetView("player");

    const initialProfile = params.get("profile");
    if (initialProfile === "before" || initialProfile === "after") {
      this.SetComparisonProfile(initialProfile, false);
    }
    const initialMode = params.get("mode");
    if (initialMode === "bolt" || initialMode === "inertia") {
      this.SetMode(initialMode);
    }
    return this;
  }

  Exit() {
    const viewmodel = this.host.viewmodel;
    this.UnbindKeys();
    this.ClearCleanMode();
    this.DisposeDiagnostics();
    this.DisposeRangeBackdrop();
    if (viewmodel?.action?.hold != null) viewmodel.action = null;
    this.actionPreview = null;
    if (viewmodel && this.saved) {
      viewmodel.SetComparisonProfile?.(this.saved.comparisonProfile || "after");
      viewmodel.root.removeFromParent();
      if (this.saved.parent) this.saved.parent.add(viewmodel.root);
      RestoreTransform(viewmodel.root, this.saved.transform);
      viewmodel.Equip(this.saved.weaponId, this.saved.weaponVariant);
      viewmodel.SetBayonetFixed?.(this.saved.bayonetFixed);
      viewmodel.root.visible = this.saved.visible;
    }
    this.host.SetCrosshair(false);
    if (this.panel) this.panel.root.remove();
    if (this.labelLayer) this.labelLayer.remove();
    if (this.legend) this.legend.remove();
    if (this.scopeDock) this.scopeDock.remove();
    this.panel = null;
    this.labelLayer = null;
    this.legend = null;
    this.scopeDock = null;
    this.scopeCanvas = null;
    this.studio.Close();
    this.saved = null;
  }

  // ------------------------------------------------------------------ 3D 靶墙参照景
  BuildRangeBackdrop() {
    if (!this.studio?.root) return;
    const group = new THREE.Group();
    group.name = "FpsRangeBackdrop";
    const Track = (...items) => { for (const it of items) if (it) this.rangeResources.push(it); };

    const frameMat = new THREE.MeshBasicMaterial({ color: 0x22231d });
    const boardMat = new THREE.MeshBasicMaterial({ color: 0x161813 });
    const lineGold = new THREE.LineBasicMaterial({ color: 0xd9bb7b, transparent: true, opacity: 0.72, depthWrite: false });
    const lineMuted = new THREE.LineBasicMaterial({ color: 0x8f9283, transparent: true, opacity: 0.42, depthWrite: false });
    const lineCenter = new THREE.LineBasicMaterial({ color: 0xd6604a, transparent: true, opacity: 0.85, depthWrite: false });
    MarkNoPrepass(frameMat);
    MarkNoPrepass(boardMat);
    MarkNoPrepass(lineGold);
    MarkNoPrepass(lineMuted);
    MarkNoPrepass(lineCenter);
    Track(frameMat, boardMat, lineGold, lineMuted, lineCenter);

    const zTarget = PLAYER_LOOK.z;
    const eyeY = PLAYER_LOOK.y;

    // 主靶板 + 立柱
    const backPlane = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.5), boardMat);
    backPlane.position.set(0, eyeY, zTarget - 0.02);
    group.add(backPlane);
    Track(backPlane.geometry);

    const postGeo = new THREE.BoxGeometry(0.08, 2.45, 0.08);
    Track(postGeo);
    for (const x of [-1.64, 1.64]) {
      const post = new THREE.Mesh(postGeo, frameMat);
      post.position.set(x, 1.225, zTarget - 0.03);
      group.add(post);
    }
    // 近景视差标杆（z = -2.2m，横移时立刻提供前景/远景视差参照）
    const stakeGeo = new THREE.BoxGeometry(0.045, 1.65, 0.045);
    Track(stakeGeo);
    for (const x of [-1.18, 1.18]) {
      const stake = new THREE.Mesh(stakeGeo, frameMat);
      stake.position.set(x, 0.825, -2.2);
      group.add(stake);
    }

    // 标尺线（水平眼高线 + 垂直中轴 + 横向分划刻度）
    const crossVerts = [
      -1.55, eyeY, zTarget, 1.55, eyeY, zTarget,
      0, eyeY - 0.68, zTarget, 0, eyeY + 0.68, zTarget,
    ];
    const crossGeo = new THREE.BufferGeometry();
    crossGeo.setAttribute("position", new THREE.Float32BufferAttribute(crossVerts, 3));
    group.add(new THREE.LineSegments(crossGeo, lineCenter));
    Track(crossGeo);

    const tickVerts = [];
    for (let i = -6; i <= 6; i += 1) {
      if (i === 0) continue;
      const x = i * 0.22;
      const half = i % 2 === 0 ? 0.16 : 0.08;
      tickVerts.push(x, eyeY - half, zTarget, x, eyeY + half, zTarget);
    }
    for (const dy of [-0.44, -0.22, 0.22, 0.44]) {
      tickVerts.push(-1.45, eyeY + dy, zTarget, 1.45, eyeY + dy, zTarget);
    }
    const tickGeo = new THREE.BufferGeometry();
    tickGeo.setAttribute("position", new THREE.Float32BufferAttribute(tickVerts, 3));
    group.add(new THREE.LineSegments(tickGeo, lineMuted));
    Track(tickGeo);

    // 同心靶环
    for (const radius of [0.09, 0.22, 0.40]) {
      const pts = [];
      const segs = 48;
      for (let i = 0; i <= segs; i += 1) {
        const a = (i / segs) * Math.PI * 2;
        pts.push(new THREE.Vector3(Math.cos(a) * radius, eyeY + Math.sin(a) * radius, zTarget + 0.002));
      }
      const ringGeo = new THREE.BufferGeometry().setFromPoints(pts);
      group.add(new THREE.Line(ringGeo, radius < 0.12 ? lineCenter : lineGold));
      Track(ringGeo);
    }

    this.studio.root.add(group);
    this.rangeBackdrop = group;
  }

  DisposeRangeBackdrop() {
    if (this.rangeBackdrop?.parent) this.rangeBackdrop.parent.remove(this.rangeBackdrop);
    for (const res of new Set(this.rangeResources)) res?.dispose?.();
    this.rangeResources.length = 0;
    this.rangeBackdrop = null;
  }

  // ------------------------------------------------------------------ 面板与模式栏
  BuildModeBar() {
    const bar = El("div", "edPanelBar");
    const tabs = El("div", "edFpsTabs");
    this.modeTabButtons = new Map();
    const specs = [
      { id: "inspect", label: "持枪检查" },
      { id: "bolt", label: "#3 连射拉栓" },
      { id: "inertia", label: "#4 移动惯性" },
    ];
    for (const spec of specs) {
      const btn = El("button", `edFpsTab${this.mode === spec.id ? " on" : ""}`, spec.label);
      btn.type = "button";
      btn.dataset.fpsMode = spec.id;
      btn.addEventListener("click", () => this.SetMode(spec.id));
      tabs.appendChild(btn);
      this.modeTabButtons.set(spec.id, btn);
    }
    bar.appendChild(tabs);
    this.panel.root.insertBefore(bar, this.panel.body);
  }

  BuildAbSwitch(parent) {
    const wrap = El("div", "edFpsAbSwitch");
    const beforeBtn = El("button", "edFpsAbBtn before", "改前 · 旧参数");
    beforeBtn.type = "button";
    beforeBtn.dataset.profile = "before";
    beforeBtn.addEventListener("click", () => this.SetComparisonProfile("before"));

    const afterBtn = El("button", "edFpsAbBtn after on", "改后 · 现行");
    afterBtn.type = "button";
    afterBtn.dataset.profile = "after";
    afterBtn.addEventListener("click", () => this.SetComparisonProfile("after"));

    wrap.append(beforeBtn, afterBtn);
    parent.appendChild(wrap);
    return { wrap, beforeBtn, afterBtn };
  }

  BuildUi(body) {
    // --- A/B 对照区（仅在 #3 / #4 模式展开） ---
    const compareSec = Section(body, "前后效果对比");
    this.compareSection = compareSec.parentElement;
    this.compareSection.hidden = true;
    this.abInspector = this.BuildAbSwitch(compareSec);

    // #3 连射拉栓子控件
    this.boltControls = El("div");
    compareSec.appendChild(this.boltControls);
    this.boltRifleChips = Chips(this.boltControls, BOLT_RIFLE_IDS.map((id) => ({
      value: id, label: WEAPONS[id]?.name || id,
    })), "HanYang", (id) => {
      this.SetWeapon(id);
      this.ResetBoltBench(true);
    });
    this.boltDriverChips = Chips(this.boltControls, [
      { value: "sightTap", label: "归位即扣" },
      { value: "rapid", label: "高频连点" },
      { value: "manual", label: "手动左键" },
    ], this.boltDriver, (value) => {
      this.boltDriver = value;
      this.ResetBoltBench(value !== "manual");
    });
    const boltBtns = El("div", "edBtns");
    this.boltControls.appendChild(boltBtns);
    this.boltPlayToggle = Toggle(boltBtns, "自动循环", true, (on) => {
      this.boltPlaying = on;
      if (on) this.ResetBoltBench(true);
    });
    Button(boltBtns, "单次扣扳机", () => this.HandleBoltClick(true));

    // #4 移动惯性子控件
    this.inertiaControls = El("div");
    this.inertiaControls.hidden = true;
    compareSec.appendChild(this.inertiaControls);
    this.inertiaDriverChips = Chips(this.inertiaControls, [
      { value: "stepStrafe", label: "起步→匀速→急停" },
      { value: "counterStrafe", label: "A↔D 折返" },
      { value: "surgeStop", label: "急起急停" },
      { value: "stanceHop", label: "蹲↔立" },
      { value: "manual", label: "WASD 手动" },
    ], this.inertiaDriver, (value) => {
      this.inertiaDriver = value;
      this.ResetInertiaBench();
    });
    const inertiaBtns = El("div", "edBtns");
    this.inertiaControls.appendChild(inertiaBtns);
    this.inertiaPlayToggle = Toggle(inertiaBtns, "自动驱动", true, (on) => {
      this.inertiaPlaying = on;
      if (!on) { this.simRightMps = 0; this.simForwardMps = 0; }
    });
    Button(inertiaBtns, "重播周期", () => this.ResetInertiaBench());

    // --- 装备列表 ---
    const pick = Section(body, "装备");
    this.list = ListBox(pick, { height: 156, onPick: (id) => this.SetWeapon(id) });
    this.list.Fill(FIRST_PERSON_IDS.map((id) => ({
      id,
      name: WEAPONS[id].name,
      tail: PoseKind(WEAPONS[id]),
      title: WEAPONS[id].fullName,
    })));

    // --- 视角与姿态 ---
    const view = Section(body, "视角与姿态");
    this.viewChips = Chips(view, [
      { value: "player", label: "玩家视角" },
      { value: "inspect", label: "外部环绕" },
    ], this.view, (value) => this.SetView(value));
    this.orbitRow = ButtonRow(view, [
      { label: "右后侧", onClick: () => this.SetInspectPreset("rightRear") },
      { label: "左后侧", onClick: () => this.SetInspectPreset("leftRear") },
      { label: "枪口侧", onClick: () => this.SetInspectPreset("front") },
      { label: "俯视", onClick: () => this.SetInspectPreset("top") },
    ]);
    this.poseChips = Chips(view, [
      { value: "hip", label: "腰射" },
      { value: "ads", label: "开镜" },
      { value: "sprint", label: "冲刺" },
    ], this.pose, (value) => this.SetPose(value));
    this.adsSlider = Slider(view, {
      label: "ADS", min: 0, max: 1, step: 0.01, value: 0,
      onInput: (value) => {
        this.ads = value;
        this.sprint = 0;
        this.pose = value >= 0.5 ? "ads" : "hip";
        this.poseChips?.Set(this.pose);
      },
    });
    const actions = El("div", "edBtns");
    view.appendChild(actions);
    this.actionButtons = {
      fire: Button(actions, "开火", () => this.Trigger("fire")),
      bolt: Button(actions, "拉栓", () => this.Trigger("bolt")),
      reload: Button(actions, "装填", () => this.Trigger("reload")),
      melee: Button(actions, "白刃", () => this.Trigger("melee")),
      throw: Button(actions, "投掷", () => this.Trigger("throw")),
    };
    this.autoFireToggle = Toggle(actions, "连发", false, (on) => {
      this.autoFire = on;
      this.fireTimer = 0;
    });
    this.bayonetToggle = Toggle(actions, "刺刀", false, (on) => {
      this.bayonetPreview = on;
      this.ApplyBayonetPreview();
    });

    // --- 片段时间轴 ---
    const timeline = Section(body, "动作帧检");
    this.animationSelect = El("select");
    this.animationSelect.setAttribute("aria-label", "动画片段");
    this.animationSelect.addEventListener("change", () => this.SetAnimation(this.animationSelect.value));
    timeline.appendChild(this.animationSelect);
    this.animationPosition = Slider(timeline, {
      label: "进度", min: 0, max: 1, step: 0.001, value: 0,
      format: (v) => `${Math.round(v * 100)}%`,
      onInput: (v) => this.SeekAnimation({ normalized: v }),
    });
    ButtonRow(timeline, [
      { label: "播放", onClick: () => this.PlayAnimation(true) },
      { label: "暂停", onClick: () => this.PlayAnimation(false) },
      { label: "前一帧", onClick: () => this.StepAnimation(-1) },
      { label: "后一帧", onClick: () => this.StepAnimation(1) },
      { label: "实时输入", onClick: () => this.ClearAnimation() },
    ]);

    // --- 辅助标尺与残差读数 ---
    const overlay = Section(body, "标尺与残差");
    const toggles = El("div", "edBtns");
    overlay.appendChild(toggles);
    this.reticleToggle = Toggle(toggles, "准心", this.showReticle, (on) => {
      this.showReticle = on;
      this.UpdateReticleView();
    });
    this.rangeToggle = Toggle(toggles, "靶墙", this.showRange, (on) => {
      this.showRange = on;
      this.ApplyDiagnosticVisibility();
    });
    this.mountToggle = Toggle(toggles, "挂点", this.showMounts, (on) => {
      this.showMounts = on;
      this.ApplyDiagnosticVisibility();
    });
    this.skeletonToggle = Toggle(toggles, "骨骼", this.showSkeleton, (on) => {
      this.showSkeleton = on;
      this.ApplyDiagnosticVisibility();
    });
    this.lineToggle = Toggle(toggles, "残差线", this.showGripLines, (on) => {
      this.showGripLines = on;
      this.ApplyDiagnosticVisibility();
    });
    this.gridToggle = Toggle(toggles, "米格", this.showGrid, (on) => {
      this.showGrid = on;
      this.ApplyDiagnosticVisibility();
    });
    Button(toggles, "净屏 3s", () => this.CleanForScreenshot());

    this.facts = Facts(overlay, ["右掌→IK目标", "左掌→IK目标", "双臂拉伸"]);
    this.RefreshActions();
  }

  BuildOverlay(root) {
    this.labelLayer = El("div", "edFpsMountHud");
    root.appendChild(this.labelLayer);

    this.legend = El("div", "edFpsLegend");
    this.legend.innerHTML = [
      '<span style="--c:#e5533d">枪口</span>',
      '<span style="--c:#f0a43a">后手</span>',
      '<span style="--c:#4ca7e8">前手</span>',
      '<span style="--c:#69c76f">瞄具</span>',
      '<span style="--c:#ffffff">掌心</span>',
    ].join("");
    root.appendChild(this.legend);
  }

  BuildScopeDock(root) {
    const dock = El("div", "edFpsScope");
    dock.hidden = true;
    const head = El("div", "edFpsScopeHead");
    const left = El("div", "edFpsScopeLeft");
    this.scopeAb = this.BuildAbSwitch(left);
    this.scopeAb.wrap.style.margin = "0";
    const metrics = El("div", "edFpsScopeMetrics");
    this.scopeMetrics = metrics;
    head.append(left, metrics);
    const canvas = El("canvas", "edFpsScopeCanvas");
    dock.append(head, canvas);
    root.appendChild(dock);
    this.scopeDock = dock;
    this.scopeCanvas = canvas;
  }

  // ------------------------------------------------------------------ 模式与改前/改后切换
  SetMode(mode) {
    if (mode !== "inspect" && mode !== "bolt" && mode !== "inertia") return false;
    this.ClearAnimation();
    this.mode = mode;
    for (const [id, btn] of this.modeTabButtons) btn.classList.toggle("on", id === mode);
    if (this.compareSection) this.compareSection.hidden = mode === "inspect";
    if (this.boltControls) this.boltControls.hidden = mode !== "bolt";
    if (this.inertiaControls) this.inertiaControls.hidden = mode !== "inertia";
    if (this.scopeDock) this.scopeDock.hidden = mode === "inspect";

    if (mode === "bolt") {
      if (WEAPONS[this.weaponId]?.kind !== "boltRifle") this.SetWeapon("HanYang");
      this.boltRifleChips?.Set(this.weaponId);
      this.showMounts = false;
      this.showSkeleton = false;
      this.showGripLines = false;
      this.SyncOverlayToggles();
      this.SetView("player");
      this.SetPose("ads");
      this.host.viewmodel?.SetComparisonProfile?.(this.comparisonProfile);
      this.ResetBoltBench(this.boltDriver !== "manual");
    } else if (mode === "inertia") {
      if (WEAPONS[this.weaponId]?.kind === "throwable") this.SetWeapon("HanYang");
      this.showMounts = false;
      this.showSkeleton = false;
      this.showGripLines = false;
      this.SyncOverlayToggles();
      this.SetView("player");
      this.SetPose("hip");
      this.host.viewmodel?.SetComparisonProfile?.(this.comparisonProfile);
      this.ResetInertiaBench();
    } else {
      this.SetComparisonProfile("after", false);
      this.simRightMps = 0;
      this.simForwardMps = 0;
      this.simCamOffsetX = 0;
      this.simCamOffsetZ = 0;
      this.simEyeHeight = 1.62;
      this.showMounts = true;
      this.showSkeleton = true;
      this.showGripLines = true;
      this.SyncOverlayToggles();
      this.ApplyPlayerCamera(0, 0, PLAYER_EYE.y);
      this.ApplyDiagnosticVisibility();
    }
    return true;
  }

  SyncOverlayToggles() {
    this.mountToggle?.Set(this.showMounts);
    this.skeletonToggle?.Set(this.showSkeleton);
    this.lineToggle?.Set(this.showGripLines);
  }

  SetComparisonProfile(profile, resetBench = true) {
    const next = profile === "before" ? "before" : "after";
    this.comparisonProfile = next;
    this.host.viewmodel?.SetComparisonProfile?.(next);
    for (const pair of [this.abInspector, this.scopeAb]) {
      if (!pair) continue;
      pair.beforeBtn.classList.toggle("on", next === "before");
      pair.afterBtn.classList.toggle("on", next === "after");
    }
    if (resetBench) {
      if (this.mode === "bolt") this.ResetBoltBench(this.boltDriver !== "manual");
      else if (this.mode === "inertia") this.ResetInertiaBench();
    }
    return next;
  }

  ResetBoltBench(kickFirstShot = true) {
    const vm = this.host.viewmodel;
    this.boltCadence.Reset();
    this.queuedBoltShot = null;
    this.boltShotCount = 0;
    this.boltDropCount = 0;
    this.boltBufferCount = 0;
    this.boltHistory.length = 0;
    this.boltEvents.length = 0;
    this.boltTapTimer = 0;
    if (vm) {
      vm.action = null;
      vm.pendingBoltAt = -1;
      vm.boltOpen = false;
      vm._ResetAnimatedParts?.();
      vm.adsSpring?.Set(this.ads);
      vm.adsGripSpring?.Set(this.ads);
      vm.sprintSpring?.Set(0);
    }
    if (kickFirstShot && this.boltPlaying) {
      this.ExecuteBoltShot();
      this.ScheduleNextBoltTap();
    }
  }

  ScheduleNextBoltTap() {
    if (this.boltDriver === "rapid") {
      this.boltTapTimer = 0.24;
      return;
    }
    // 「归位即扣」：模拟人眼看到准星回平即立刻点左键的自然反应时刻
    const tapByWeapon = { HanYang: 1.168, ZhongZheng: 1.115, Type38: 1.195 };
    this.boltTapTimer = tapByWeapon[this.weaponId] ?? 1.16;
  }

  CurrentBoltBufferWindow() {
    return this.comparisonProfile === "before"
      ? FIRE_CONTROL.inputBufferS
      : FIRE_CONTROL.boltInputBufferS;
  }

  BoltLockRemaining() {
    const vm = this.host.viewmodel;
    const actionRem = vm?.action ? vm.action.duration * (1 - vm.action.t) : 0;
    return Math.max(0, actionRem, this.boltCadence.remainingS);
  }

  ExecuteBoltShot() {
    const vm = this.host.viewmodel;
    const weapon = WEAPONS[this.weaponId];
    if (!vm || !weapon) return false;
    vm.boltOpen = false;
    vm.TriggerFire();
    this.boltCadence.Fired(vm.FireIntervalS(weapon), true);
    this.boltShotCount += 1;
    this.boltEvents.push({ t: this.time, kind: "fired" });
    return true;
  }

  HandleBoltClick(manual = false) {
    const vm = this.host.viewmodel;
    if (!vm || WEAPONS[this.weaponId]?.kind !== "boltRifle") return false;
    if (manual && this.boltDriver !== "manual") {
      this.boltDriver = "manual";
      this.boltDriverChips?.Set("manual");
    }
    const rem = this.BoltLockRemaining();
    const bufferWindow = this.CurrentBoltBufferWindow();
    if (!vm.IsBusy() && this.boltCadence.Ready()) {
      return this.ExecuteBoltShot();
    }
    if (rem <= bufferWindow) {
      this.queuedBoltShot = { ttl: bufferWindow };
      this.boltBufferCount += 1;
      this.boltEvents.push({ t: this.time, kind: "buffered" });
      return true;
    }
    this.boltDropCount += 1;
    this.boltEvents.push({ t: this.time, kind: "dropped" });
    return false;
  }

  StepBoltBench(dt) {
    this.boltCadence.Step(dt);
    if (this.queuedBoltShot) {
      this.queuedBoltShot.ttl -= dt;
      if (this.queuedBoltShot.ttl <= 0) this.queuedBoltShot = null;
      else if (!this.host.viewmodel.IsBusy() && this.boltCadence.Ready()) {
        this.queuedBoltShot = null;
        this.ExecuteBoltShot();
        if (this.boltPlaying && this.boltDriver !== "manual") this.ScheduleNextBoltTap();
      }
    }
    if (this.boltPlaying && this.boltDriver !== "manual") {
      this.boltTapTimer -= dt;
      if (this.boltTapTimer <= 0) {
        const firedOrQueued = this.HandleBoltClick(false);
        if (this.boltDriver === "rapid") this.boltTapTimer = 0.24;
        else if (!firedOrQueued) this.boltTapTimer = 0.42; // 吞键后玩家反应过来补点下一枪
        else this.boltTapTimer = 99; // 等排队的这一发真正打出后再排下一轮
      }
    }
  }

  ResetInertiaBench() {
    this.inertiaClock = 0;
    this.simRightMps = 0;
    this.simForwardMps = 0;
    this.simEyeHeight = 1.62;
    this.simCrouch = 0;
    this.simCamOffsetX = 0;
    this.simCamOffsetZ = 0;
    this.inertiaHistory.length = 0;
    this.host.viewmodel?.moveInertia?.Reset?.();
  }

  StepInertiaStimulus(dt) {
    let targetRight = 0;
    let targetForward = 0;
    let targetCrouch = 0;
    let sprint = 0;

    if (this.inertiaDriver === "manual") {
      const r = (this.manualKeys.has("KeyD") ? 1 : 0) - (this.manualKeys.has("KeyA") ? 1 : 0);
      const f = (this.manualKeys.has("KeyW") ? 1 : 0) - (this.manualKeys.has("KeyS") ? 1 : 0);
      sprint = this.manualKeys.has("ShiftLeft") || this.manualKeys.has("ShiftRight") ? 1 : 0;
      targetCrouch = this.manualKeys.has("KeyC") ? 1 : 0;
      const len = Math.hypot(r, f) || 1;
      const top = sprint ? 5.2 : targetCrouch ? 2.1 : 3.8;
      targetRight = (r / len) * (r || f ? top : 0);
      targetForward = (f / len) * (r || f ? top : 0);
    } else if (this.inertiaPlaying) {
      this.inertiaClock += dt;
      if (this.inertiaDriver === "stepStrafe") {
        const u = this.inertiaClock % 3.2;
        targetRight = u < 1.65 ? 3.8 : 0;
      } else if (this.inertiaDriver === "counterStrafe") {
        const u = this.inertiaClock % 3.2;
        if (u < 1.15) targetRight = 3.8;
        else if (u < 1.60) targetRight = 0;
        else if (u < 2.75) targetRight = -3.8;
        else targetRight = 0;
      } else if (this.inertiaDriver === "surgeStop") {
        const u = this.inertiaClock % 3.0;
        if (u < 1.45) { targetForward = 4.5; sprint = 0.35; }
        else targetForward = 0;
      } else if (this.inertiaDriver === "stanceHop") {
        const u = this.inertiaClock % 2.8;
        targetCrouch = u < 1.4 ? 1 : 0;
      }
    }

    const velFollow = 1 - Math.exp(-16 * dt);
    const crouchFollow = 1 - Math.exp(-11 * dt);
    this.simRightMps += (targetRight - this.simRightMps) * velFollow;
    this.simForwardMps += (targetForward - this.simForwardMps) * velFollow;
    this.simCrouch += (targetCrouch - this.simCrouch) * crouchFollow;
    this.simEyeHeight = THREE.MathUtils.lerp(1.62, 1.05, this.simCrouch);

    // 摄影棚内给玩家相机施加有界位移回中，让靶墙近远标杆呈现真实视差
    const targetCamX = THREE.MathUtils.clamp(this.simRightMps * 0.085, -0.38, 0.38);
    const targetCamZ = THREE.MathUtils.clamp(-this.simForwardMps * 0.075, -0.36, 0.36);
    const camFollow = 1 - Math.exp(-7 * dt);
    this.simCamOffsetX += (targetCamX - this.simCamOffsetX) * camFollow;
    this.simCamOffsetZ += (targetCamZ - this.simCamOffsetZ) * camFollow;
    if (this.view === "player") {
      this.ApplyPlayerCamera(this.simCamOffsetX, this.simCamOffsetZ, PLAYER_EYE.y - this.simCrouch * 0.36);
    }

    const moveSpeed = Math.hypot(this.simRightMps, this.simForwardMps);
    return {
      dt,
      moveSpeed,
      strafe: THREE.MathUtils.clamp(this.simRightMps / 3.8, -1, 1),
      localMoveRight: this.simRightMps,
      localMoveForward: this.simForwardMps,
      stanceEyeHeight: this.simEyeHeight,
      grounded: true,
      sprint: this.ads > 0.2 ? 0 : sprint,
      ads: this.ads,
      lookDeltaYaw: 0,
      lookDeltaPitch: 0,
      crouch: this.simCrouch,
      elapsed: this.time,
      lowAmmo: false,
    };
  }

  // ------------------------------------------------------------------ 诊断节点
  BuildDiagnostics() {
    const viewmodel = this.host.viewmodel;
    this.markerLayer = new THREE.Group();
    this.markerLayer.name = "FpsGripEditorMarkers";
    this.markerLayer.userData.skipNormalDepth = true;
    viewmodel.root.add(this.markerLayer);

    for (const name of MOUNT_NAMES) this.CreateMarker(name, MOUNT_STYLE[name].color, MOUNT_STYLE[name].label);
    this.CreateMarker("actualR", 0xffffff, "右掌 grip", 0.011);
    this.CreateMarker("actualL", 0xffffff, "左掌 grip", 0.011);
    this.CreateLine("r", 0xf0a43a);
    this.CreateLine("l", 0x4ca7e8);

    if (viewmodel.riggedArms?.root) {
      this.skeletonHelper = new THREE.SkeletonHelper(viewmodel.riggedArms.root);
      this.skeletonHelper.name = "FpsGripEditorSkeleton";
      SetDepth(this.skeletonHelper.material, false);
      this.skeletonHelper.renderOrder = 1002;
      this.host.scene.add(this.skeletonHelper);
      this.markerResources.push(this.skeletonHelper.geometry);
      const skeletonMaterials = Array.isArray(this.skeletonHelper.material)
        ? this.skeletonHelper.material
        : [this.skeletonHelper.material];
      this.markerResources.push(...skeletonMaterials);
    }
  }

  CreateMarker(id, color, label, radius = 0.009) {
    const group = new THREE.Group();
    group.name = `FpsGripEditorMarker_${id}`;
    const geometry = new THREE.SphereGeometry(radius, 12, 8);
    const material = new THREE.MeshBasicMaterial({ color, depthTest: false, depthWrite: false });
    const sphere = new THREE.Mesh(geometry, material);
    sphere.renderOrder = 1003;
    const axes = new THREE.AxesHelper(id.startsWith("actual") ? 0.035 : 0.060);
    SetDepth(axes.material, false);
    axes.renderOrder = 1003;
    group.add(sphere, axes);
    this.markerLayer.add(group);
    this.markerEntries.set(id, { group, sphere, axes, label });
    this.markerResources.push(geometry, material, axes.geometry);
    const axesMaterials = Array.isArray(axes.material) ? axes.material : [axes.material];
    this.markerResources.push(...axesMaterials);

    const element = El("div", `edFpsMountLabel ${id.startsWith("actual") ? "actual" : "mount"}`, label);
    element.dataset.mount = id;
    element.style.setProperty("--mount-color", `#${color.toString(16).padStart(6, "0")}`);
    this.labelLayer.appendChild(element);
    this.labelEntries.set(id, element);
  }

  CreateLine(id, color) {
    const positions = new Float32Array(6);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const material = new THREE.LineBasicMaterial({ color, depthTest: false, depthWrite: false, transparent: true, opacity: 0.95 });
    const line = new THREE.Line(geometry, material);
    line.name = `FpsGripEditorResidual_${id}`;
    line.renderOrder = 1002;
    this.markerLayer.add(line);
    this.lineEntries.set(id, line);
    this.markerResources.push(geometry, material);
  }

  DisposeDiagnostics() {
    if (this.markerLayer?.parent) this.markerLayer.parent.remove(this.markerLayer);
    if (this.skeletonHelper?.parent) this.skeletonHelper.parent.remove(this.skeletonHelper);
    for (const resource of new Set(this.markerResources)) resource?.dispose?.();
    this.markerEntries.clear();
    this.lineEntries.clear();
    this.labelEntries.clear();
    this.mountSources.clear();
    this.markerResources.length = 0;
    this.markerLayer = null;
    this.skeletonHelper = null;
  }

  // ------------------------------------------------------------------ 装备 / 视角 / 姿态
  SetWeapon(id, variant = 0) {
    if (!FIRST_PERSON_IDS.includes(id)) return false;
    if (this.actionPreview || this.host.viewmodel.skeletalAnimation?.preview) this.ClearAnimation();
    this.weaponId = id;
    const variants = WEAPON_MESH_VARIANTS[id] || [];
    this.weaponVariant = variants.length && variant > 0 && variant < variants.length ? variant | 0 : 0;
    const previousRig = this.host.viewmodel.riggedArms;
    this.host.viewmodel.Equip(id, this.weaponVariant);
    this.host.viewmodel.SetComparisonProfile?.(this.comparisonProfile);
    if (this.markerLayer && previousRig !== this.host.viewmodel.riggedArms) {
      this.DisposeDiagnostics();
      this.labelLayer.replaceChildren();
      this.BuildDiagnostics();
      this.ApplyDiagnosticVisibility();
    }
    this.list?.Select(id);
    if (BOLT_RIFLE_IDS.includes(id)) this.boltRifleChips?.Set(id);
    this.time = 0;
    this.bayonetPreview = false;
    this.bayonetToggle?.Set(false);
    this.ApplyBayonetPreview();
    this.RebuildMountSources();
    this.RefreshActions();
    this.UpdateReticleView();
    this.RefreshAnimationList();
    this.RefreshFacts(true);
    if (this.mode === "bolt" && WEAPONS[id]?.kind === "boltRifle") this.ResetBoltBench(this.boltDriver !== "manual");
    else if (this.mode === "inertia") this.ResetInertiaBench();
    return true;
  }

  ApplyPlayerCamera(offsetX = 0, offsetZ = 0, eyeY = PLAYER_EYE.y) {
    const camera = this.host.camera;
    if (!camera) return;
    camera.position.set(PLAYER_EYE.x + offsetX, eyeY, PLAYER_EYE.z + offsetZ);
    camera.lookAt(PLAYER_LOOK.x + offsetX * 0.15, eyeY, PLAYER_LOOK.z);
  }

  SetView(value) {
    const viewmodel = this.host.viewmodel;
    if (!viewmodel || (value !== "player" && value !== "inspect")) return false;
    this.view = value;
    this.viewChips?.Set(value);
    if (this.orbitRow) this.orbitRow.hidden = value !== "inspect";
    viewmodel.root.removeFromParent();
    if (value === "inspect") {
      this.studio.stand.add(viewmodel.root);
      viewmodel.root.position.set(0, 1.18, 0);
      viewmodel.root.quaternion.identity();
      viewmodel.root.scale.copy(this.saved?.transform.scale || new THREE.Vector3(1, 1, 1));
      this.SetStudioFov(42);
      this.SetInspectPreset("rightRear", false);
    } else {
      const parent = this.saved?.parent || this.host.camera;
      parent.add(viewmodel.root);
      RestoreTransform(viewmodel.root, this.saved?.transform || {
        position: new THREE.Vector3(), quaternion: new THREE.Quaternion(), scale: new THREE.Vector3(1, 1, 1),
      });
      this.SetStudioFov(this.PlayerFov());
      this.ApplyPlayerCamera(0, 0, PLAYER_EYE.y);
    }
    viewmodel.root.visible = true;
    this.ApplyDiagnosticVisibility();
    this.UpdateReticleView();
    this.RefreshFacts(true);
    return true;
  }

  SetInspectPreset(id, switchView = true) {
    if (switchView && this.view !== "inspect") this.SetView("inspect");
    const presets = {
      rightRear: { yaw: 0.62, pitch: 0.18, dist: 1.62 },
      leftRear: { yaw: -0.62, pitch: 0.18, dist: 1.62 },
      front: { yaw: Math.PI, pitch: 0.10, dist: 1.66 },
      top: { yaw: 0.35, pitch: 1.15, dist: 1.72 },
    };
    const preset = presets[id] || presets.rightRear;
    this.studio.orbit.yaw = preset.yaw;
    this.studio.orbit.pitch = preset.pitch;
    this.studio.orbit.dist = preset.dist;
    this.studio.orbit.target.set(0.06, 1.04, -0.38);
    this.studio.ApplyCamera();
    this.inspectPreset = id in presets ? id : "rightRear";
    return true;
  }

  SetPose(value) {
    this.ClearAnimation();
    if (value !== "hip" && value !== "ads" && value !== "sprint") return false;
    this.pose = value;
    this.ads = value === "ads" ? 1 : 0;
    this.sprint = value === "sprint" ? 1 : 0;
    this.poseChips?.Set(value);
    this.adsSlider?.Set(this.ads);
    if (this.view === "player") this.SetStudioFov(this.PlayerFov());
    return true;
  }

  PlayerFov() {
    const scale = WEAPONS[this.weaponId]?.adsFovScale ?? 0.75;
    const vm = this.host.viewmodel;
    const liveAds = vm?.skeletalAnimation?.State()?.[0]
      ?? (this.mode === "bolt" && vm?.adsSpring ? vm.adsSpring.value : this.ads);
    return 55 * (1 - liveAds * (1 - scale));
  }

  SetStudioFov(value) {
    const camera = this.host.camera;
    if (!camera || Math.abs(camera.fov - value) < 1e-4) return;
    camera.fov = value;
    camera.updateProjectionMatrix();
  }

  Trigger(action, reloadOptions = { remainingRounds: 0 }) {
    this.ClearAnimation();
    const viewmodel = this.host.viewmodel;
    const weapon = WEAPONS[this.weaponId];
    if (!viewmodel || !CanAction(weapon, action)) return false;
    if (action === "fire") viewmodel.TriggerFire();
    else if (action === "bolt") viewmodel.TriggerBolt();
    else if (action === "reload") viewmodel.TriggerReload(reloadOptions);
    else if (action === "melee") viewmodel.TriggerMelee();
    else if (action === "throw") viewmodel.TriggerThrow(1);
    return true;
  }

  RefreshActions() {
    const weapon = WEAPONS[this.weaponId];
    for (const [action, button] of Object.entries(this.actionButtons || {})) {
      button.hidden = !CanAction(weapon, action);
    }
    const canAutoFire = CanAction(weapon, "auto");
    if (this.autoFireToggle) this.autoFireToggle.root.hidden = !canAutoFire;
    if (!canAutoFire && this.autoFire) {
      this.autoFire = false;
      this.autoFireToggle?.Set(false);
    }
    if (this.bayonetToggle) this.bayonetToggle.root.hidden = !CanPreviewBayonet(this.weaponId);
  }

  ApplyBayonetPreview() {
    this.host.viewmodel?.SetBayonetFixed?.(this.bayonetPreview && CanPreviewBayonet(this.weaponId));
  }

  UpdateReticleView() {
    const active = this.showReticle && this.view === "player" && HasIronSight(this.weaponId);
    this.host.SetCrosshair(active, active ? "calibration" : "");
  }

  // ------------------------------------------------------------------ 时间轴
  RefreshAnimationList() {
    if (!this.animationSelect) return;
    this.animationSelect.replaceChildren();
    const names = this.AnimationNames();
    for (const name of names) {
      const action = this.ActionClip(name);
      const option = El("option", "", action ? ActionClipLabel(this.weaponId, action) : FPS_ANIMATION_LABELS[name] || name);
      option.value = name;
      this.animationSelect.appendChild(option);
    }
    this.animationSelect.disabled = !names.length;
    this.RefreshAnimationTimeline();
  }

  AnimationNames() {
    const weapon = WEAPONS[this.weaponId];
    return [
      ...(this.host.viewmodel.skeletalAnimation?.Clips() || []),
      ...(CanAction(weapon, "melee") ? [ACTION_CLIP_PREFIX + "melee"] : []),
    ];
  }

  ActionClip(name) {
    if (typeof name !== "string" || !name.startsWith(ACTION_CLIP_PREFIX)) return null;
    const action = name.slice(ACTION_CLIP_PREFIX.length);
    return action === "melee" && CanAction(WEAPONS[this.weaponId], action) ? action : null;
  }

  ActivePreview() {
    return this.actionPreview || this.host.viewmodel.skeletalAnimation?.preview || null;
  }

  DefaultAnimation() {
    return this.animationSelect?.value || this.AnimationNames()[0] || "Idle";
  }

  SetAnimation(name, options = {}) {
    const vm = this.host.viewmodel;
    const action = this.ActionClip(name);
    if (!action && !vm.skeletalAnimation?.Clip(name)) return false;
    this.ClearAnimation();
    vm.action = null;
    vm.pendingBoltAt = -1;
    vm._ResetAnimatedParts();
    vm.adsSpring.Set(0);
    vm.adsGripSpring?.Set(0);
    vm.sprintSpring.Set(0);
    this.ads = 0;
    this.sprint = 0;
    this.animationSelect.value = name;
    const result = action ? this.StartActionPreview(action, options) : vm.skeletalAnimation.SetPreview(name, options);
    this.SetStudioFov(this.PlayerFov());
    this.RefreshAnimationTimeline();
    this.UpdateDiagnostics();
    return result;
  }

  StartActionPreview(action, { time = 0, playing = false, loop = true, speed = 1 } = {}) {
    const vm = this.host.viewmodel;
    if (!Number.isFinite(time) || !Number.isFinite(speed)) return false;
    if (action !== "melee" || !vm.TriggerMelee() || !vm.action) return false;
    const duration = vm.action.duration;
    this.actionPreview = {
      name: ACTION_CLIP_PREFIX + action, action, kind: vm.action.kind, mode: vm.action.melee, duration,
      time: THREE.MathUtils.clamp(time, 0, duration), playing: !!playing, loop: !!loop,
      speed: THREE.MathUtils.clamp(speed, 0.1, 2),
    };
    this.SettleActionPreview();
    return this.AnimationSnapshot();
  }

  HoldActionPreview() {
    const preview = this.actionPreview;
    const vm = this.host.viewmodel;
    if (!preview) return false;
    if (vm.action?.kind !== preview.kind || vm.action.hold == null) {
      vm.action = null;
      if (!vm.TriggerMelee(preview.mode) || !vm.action) { this.actionPreview = null; return false; }
    }
    vm.action.hold = preview.duration ? preview.time / preview.duration : 0;
    return true;
  }

  SettleActionPreview() {
    if (!this.HoldActionPreview()) return false;
    for (let i = 0; i < 8; i += 1) this.StepViewmodel(1 / 60);
    return true;
  }

  SeekAnimation({ seconds, normalized, frame } = {}) {
    if (!this.ActivePreview() && !this.SetAnimation(this.DefaultAnimation())) return false;
    if (this.actionPreview) {
      const preview = this.actionPreview;
      const time = seconds ?? (normalized != null ? normalized * preview.duration : frame != null ? frame / ACTION_TIMELINE_FPS : NaN);
      if (!Number.isFinite(time)) return false;
      preview.time = THREE.MathUtils.clamp(time, 0, preview.duration);
      preview.playing = false;
      this.SettleActionPreview();
      this.RefreshAnimationTimeline();
      this.UpdateDiagnostics();
      return this.AnimationSnapshot();
    }
    const player = this.host.viewmodel.skeletalAnimation;
    const clip = player.Clip(player.preview.name);
    const time = seconds ?? (normalized != null ? normalized * clip.duration : frame != null ? frame * clip.duration / (clip.count - 1) : NaN);
    const result = player.Seek(time);
    this.SetStudioFov(this.PlayerFov());
    this.RefreshAnimationTimeline();
    this.UpdateDiagnostics();
    return result;
  }

  PlayAnimation(playing = true) {
    return this.SetAnimationPlayback({ playing });
  }

  SetAnimationPlayback(options = {}) {
    if (!this.ActivePreview() && !this.SetAnimation(this.DefaultAnimation())) return false;
    if (options.speed != null && !Number.isFinite(options.speed)) return false;
    const preview = this.ActivePreview();
    if (options.playing && this.actionPreview && !preview.loop && preview.time >= preview.duration) preview.time = 0;
    if (options.playing != null) preview.playing = !!options.playing;
    if (options.loop != null) preview.loop = !!options.loop;
    if (options.speed != null) preview.speed = Math.max(0.1, Math.min(2, options.speed));
    this.RefreshAnimationTimeline();
    return this.AnimationSnapshot();
  }

  StepAnimation(delta = 1) {
    if (!this.ActivePreview() && !this.SetAnimation(this.DefaultAnimation())) return false;
    if (this.actionPreview) {
      return this.SeekAnimation({ frame: Math.round(this.actionPreview.time * ACTION_TIMELINE_FPS) + Math.trunc(delta) });
    }
    const player = this.host.viewmodel.skeletalAnimation;
    const clip = player.Clip(player.preview.name);
    const frame = Math.round(player.preview.time / clip.duration * (clip.count - 1)) + Math.trunc(delta);
    return this.SeekAnimation({ frame });
  }

  ClearAnimation() {
    const vm = this.host.viewmodel;
    if (vm?.skeletalAnimation) vm.skeletalAnimation.preview = null;
    if (this.actionPreview && vm?.action?.hold != null) vm.action = null;
    this.actionPreview = null;
    vm?.armAnchor.position.set(0, 0, 0);
    vm?.armAnchor.quaternion.identity();
    vm?.armAnchor.scale.set(1, 1, 1);
    this.RefreshAnimationTimeline();
    return true;
  }

  AnimationSnapshot() {
    const preview = this.actionPreview;
    if (!preview) return this.host.viewmodel.skeletalAnimation?.Snapshot() || null;
    const frames = Math.round(preview.duration * ACTION_TIMELINE_FPS) + 1;
    return {
      available: this.AnimationNames(), name: preview.name, time: preview.time, duration: preview.duration,
      frame: Math.min(frames - 1, Math.round(preview.time * ACTION_TIMELINE_FPS)), frames, source: "ProceduralAction",
      action: preview.action, mode: preview.mode, playing: preview.playing, loop: preview.loop, speed: preview.speed,
    };
  }

  RefreshAnimationTimeline() {
    const snapshot = this.AnimationSnapshot();
    if (this.animationPosition) this.animationPosition.Set(snapshot?.duration ? snapshot.time / snapshot.duration : 0);
  }

  // ------------------------------------------------------------------ 挂点与骨骼同步
  RebuildMountSources() {
    const viewmodel = this.host.viewmodel;
    this.mountSources.clear();
    const rig = viewmodel.rig;
    if (!rig) return;
    rig.group.updateWorldMatrix(true, true);
    for (const name of MOUNT_NAMES) {
      const modelNode = rig.group.getObjectByName(name);
      let positionObject = modelNode;
      let orientationObject = modelNode;
      const source = modelNode ? "model" : "runtime";
      let local = null;
      if (name === "gripR") {
        positionObject ||= viewmodel.handRight.group;
        orientationObject = viewmodel.handRight.group;
      } else if (name === "gripL") {
        positionObject ||= viewmodel.handLeft.group;
        orientationObject = viewmodel.handLeft.group;
      } else if (name === "muzzle") {
        positionObject ||= viewmodel.muzzleAnchor;
        orientationObject ||= viewmodel.muzzleAnchor;
      } else if (name === "sight" && !positionObject && rig.sight) {
        positionObject = rig.group;
        orientationObject = rig.group;
        local = rig.sight.clone();
      }
      if (!positionObject) continue;
      this.mountSources.set(name, { positionObject, orientationObject: orientationObject || positionObject, local, source });
    }
  }

  SourceFrame(source, position, quaternion) {
    if (!source?.positionObject) return false;
    if (source.local) source.positionObject.localToWorld(position.copy(source.local));
    else source.positionObject.getWorldPosition(position);
    source.orientationObject.getWorldQuaternion(quaternion);
    return true;
  }

  PlaceMarker(id, source) {
    const entry = this.markerEntries.get(id);
    if (!entry || !source || !this.markerLayer) {
      if (entry) entry.group.visible = false;
      return;
    }
    const worldPosition = new THREE.Vector3();
    const worldQuaternion = new THREE.Quaternion();
    if (!this.SourceFrame(source, worldPosition, worldQuaternion)) {
      entry.group.visible = false;
      return;
    }
    const root = this.host.viewmodel.root;
    root.updateWorldMatrix(true, false);
    entry.group.position.copy(root.worldToLocal(worldPosition));
    const rootQuaternion = root.getWorldQuaternion(new THREE.Quaternion()).invert();
    entry.group.quaternion.copy(rootQuaternion.multiply(worldQuaternion));
    entry.group.visible = this.showMounts;
  }

  UpdateLine(side, actual, target) {
    const line = this.lineEntries.get(side);
    if (!line || !actual || !target) {
      if (line) line.visible = false;
      return;
    }
    const root = this.host.viewmodel.root;
    const a = root.worldToLocal(actual.getWorldPosition(new THREE.Vector3()));
    const b = root.worldToLocal(target.getWorldPosition(new THREE.Vector3()));
    const attribute = line.geometry.getAttribute("position");
    attribute.setXYZ(0, a.x, a.y, a.z);
    attribute.setXYZ(1, b.x, b.y, b.z);
    attribute.needsUpdate = true;
    line.visible = this.showGripLines;
  }

  UpdateDiagnostics() {
    const viewmodel = this.host.viewmodel;
    if (!viewmodel.rig) return;
    for (const [name, source] of this.mountSources) this.PlaceMarker(name, source);
    for (const name of MOUNT_NAMES) {
      if (!this.mountSources.has(name)) this.markerEntries.get(name).group.visible = false;
    }
    const arms = viewmodel.riggedArms;
    const actualR = arms?.gripNodes?.r || null;
    const actualL = arms?.gripNodes?.l || null;
    this.PlaceMarker("actualR", actualR ? { positionObject: actualR, orientationObject: actualR, source: "skeleton" } : null);
    this.PlaceMarker("actualL", actualL ? { positionObject: actualL, orientationObject: actualL, source: "skeleton" } : null);
    this.UpdateLine("r", actualR, viewmodel.handRight?.group);
    this.UpdateLine("l", actualL, viewmodel.handLeft?.group);
    this.UpdateLabels();
  }

  ApplyDiagnosticVisibility() {
    if (this.markerLayer) this.markerLayer.visible = this.showMounts || this.showGripLines;
    if (this.skeletonHelper) this.skeletonHelper.visible = this.showSkeleton;
    if (this.labelLayer) this.labelLayer.hidden = !this.showMounts;
    for (const line of this.lineEntries.values()) line.visible = this.showGripLines;
    if (this.legend) this.legend.hidden = !this.showMounts || this.mode !== "inspect";
    if (this.rangeBackdrop) this.rangeBackdrop.visible = this.view === "player" && this.showRange;
    if (this.studio?.pad) this.studio.pad.visible = this.view === "player" ? this.showRange : this.showGrid;
    if (this.studio?.grid) this.studio.grid.visible = this.showGrid;
  }

  UpdateLabels() {
    if (!this.labelLayer || !this.showMounts) return;
    const camera = this.host.camera;
    const rect = this.host.canvas.getBoundingClientRect();
    for (const [id, element] of this.labelEntries) {
      const marker = this.markerEntries.get(id)?.group;
      if (!marker?.visible) {
        element.hidden = true;
        continue;
      }
      const point = marker.getWorldPosition(new THREE.Vector3()).project(camera);
      const inFront = point.z > -1 && point.z < 1 && Math.abs(point.x) < 1.08 && Math.abs(point.y) < 1.08;
      element.hidden = !inFront;
      if (!inFront) continue;
      element.style.left = `${rect.left + (point.x * 0.5 + 0.5) * rect.width}px`;
      element.style.top = `${rect.top + (-point.y * 0.5 + 0.5) * rect.height}px`;
    }
  }

  // ------------------------------------------------------------------ 示波器绘制（#3 / #4）
  RecordScopeSample() {
    const vm = this.host.viewmodel;
    if (!vm) return;
    if (this.mode === "bolt") {
      const QuatDeg = (q) => q ? 2 * Math.acos(Math.min(1, Math.abs(q.w))) * (180 / Math.PI) : 0;
      const PosMm = (p) => p ? Math.hypot(p.x, p.y, p.z) * 1000 : 0;
      const mountDeg = QuatDeg(vm.weaponMount?.quaternion);
      const mountMm = PosMm(vm.weaponMount?.position);
      const recoilDeg = QuatDeg(vm.recoilPivot?.quaternion);
      const recoilMm = PosMm(vm.recoilPivot?.position);
      const headDeg = vm.root ? Math.hypot(vm.root.rotation.x, vm.root.rotation.y, vm.root.rotation.z) * (180 / Math.PI) : 0;
      const adsVal = vm.adsSpring?.value ?? this.ads;
      const sightDev = mountDeg + recoilDeg + headDeg * 1.4 + (mountMm + recoilMm) * 0.12 + (1 - adsVal) * 5.5;
      const lockRem = this.BoltLockRemaining();
      const bufWin = this.CurrentBoltBufferWindow();
      this.boltHistory.push({
        t: this.time, sightDev, adsVal, lockRem, bufWin,
      });
      while (this.boltHistory.length > 260) this.boltHistory.shift();
      while (this.boltEvents.length && this.time - this.boltEvents[0].t > 4.2) this.boltEvents.shift();
    } else if (this.mode === "inertia") {
      const mi = vm.moveInertia;
      const active = this.comparisonProfile !== "before" && mi;
      const xMm = active ? mi.x * 1000 : 0;
      const yMm = active ? mi.y * 1000 : 0;
      const zMm = active ? mi.z * 1000 : 0;
      const rollDeg = active
        ? THREE.MathUtils.radToDeg(mi.roll)
        : THREE.MathUtils.radToDeg(-(this.simRightMps / 3.8) * 0.044 * (1 - this.ads));
      const yawDeg = active ? THREE.MathUtils.radToDeg(mi.yaw) : 0;
      this.inertiaHistory.push({
        t: this.time,
        vRight: this.simRightMps,
        vFwd: this.simForwardMps,
        crouch: this.simCrouch,
        xMm, yMm, zMm, rollDeg, yawDeg,
      });
      while (this.inertiaHistory.length > 240) this.inertiaHistory.shift();
    }
  }

  RenderScope() {
    if (!this.scopeCanvas || !this.scopeDock || this.scopeDock.hidden) return;
    const canvas = this.scopeCanvas;
    const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    const width = Math.max(240, canvas.clientWidth || 560);
    const height = Math.max(96, canvas.clientHeight || 114);
    const pw = Math.round(width * dpr);
    const ph = Math.round(height * dpr);
    if (canvas.width !== pw || canvas.height !== ph) {
      canvas.width = pw;
      canvas.height = ph;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    if (this.mode === "bolt") this.DrawBoltScope(ctx, width, height);
    else if (this.mode === "inertia") this.DrawInertiaScope(ctx, width, height);
  }

  SetScopePills(specs) {
    if (!this.scopeMetrics) return;
    while (this.scopeMetrics.children.length > specs.length) this.scopeMetrics.lastChild.remove();
    while (this.scopeMetrics.children.length < specs.length) this.scopeMetrics.appendChild(El("span", "edFpsScopePill"));
    for (let i = 0; i < specs.length; i += 1) {
      const el = this.scopeMetrics.children[i];
      const { k, v, tone = "" } = specs[i];
      el.className = `edFpsScopePill${tone ? " " + tone : ""}`;
      el.innerHTML = `${k} <b>${v}</b>`;
    }
  }

  DrawBoltScope(ctx, w, h) {
    const weapon = WEAPONS[this.weaponId];
    const intervalS = this.host.viewmodel?.FireIntervalS(weapon) ?? 1.25;
    const bufMs = Math.round(this.CurrentBoltBufferWindow() * 1000);
    const last = this.boltHistory.at(-1);
    const adsPct = Math.round((last?.adsVal ?? this.ads) * 100);
    this.SetScopePills([
      { k: "单发周期", v: `${intervalS.toFixed(2)}s`, tone: this.comparisonProfile === "after" ? "good" : "" },
      { k: "预输入窗", v: `${bufMs}ms`, tone: bufMs >= 300 ? "good" : "bad" },
      { k: "开镜保持", v: `${adsPct}%`, tone: adsPct >= 65 ? "good" : "bad" },
      { k: "击发 / 吞键", v: `${this.boltShotCount} / ${this.boltDropCount}`, tone: this.boltDropCount > 0 ? "bad" : "good" },
    ]);

    const spanS = 3.6;
    const tEnd = this.time + 0.12;
    const tStart = tEnd - spanS;
    const X = (t) => ((t - tStart) / spanS) * w;

    // 背景分带：闭锁区 / 吞键死区（准星已稳但未进缓冲窗） / 预输入缓冲窗
    for (let i = 1; i < this.boltHistory.length; i += 1) {
      const a = this.boltHistory[i - 1];
      const b = this.boltHistory[i];
      if (b.t < tStart) continue;
      const x0 = Math.max(0, X(a.t));
      const x1 = Math.min(w, X(b.t));
      if (x1 <= x0) continue;
      if (b.lockRem > b.bufWin) {
        const deadSightFreeze = b.sightDev < 0.85;
        ctx.fillStyle = deadSightFreeze ? "rgba(214, 96, 74, 0.28)" : "rgba(214, 96, 74, 0.08)";
        ctx.fillRect(x0, 0, x1 - x0 + 0.6, h);
      } else if (b.lockRem > 0.002) {
        ctx.fillStyle = "rgba(157, 192, 228, 0.16)";
        ctx.fillRect(x0, 0, x1 - x0 + 0.6, h);
      }
    }

    // 基准参考线
    ctx.strokeStyle = "rgba(193, 189, 171, 0.16)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, h - 18); ctx.lineTo(w, h - 18);
    ctx.moveTo(0, 20); ctx.lineTo(w, 20);
    ctx.stroke();

    // 曲线 1：开镜保持率（天蓝）
    ctx.strokeStyle = "#9dc0e4";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    let started = false;
    for (const s of this.boltHistory) {
      if (s.t < tStart) continue;
      const x = X(s.t);
      const y = (h - 18) - s.adsVal * (h - 38);
      if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // 曲线 2：照门偏移（旧金色，底部 = 0 已归零）
    ctx.strokeStyle = "#edca83";
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    started = false;
    for (const s of this.boltHistory) {
      if (s.t < tStart) continue;
      const x = X(s.t);
      const norm = Math.min(1, s.sightDev / 14);
      const y = (h - 18) - norm * (h - 36);
      if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // 点击与击发标记
    ctx.font = '11px ui-monospace, "Cascadia Mono", Consolas, monospace';
    for (const ev of this.boltEvents) {
      if (ev.t < tStart || ev.t > tEnd) continue;
      const x = X(ev.t);
      if (ev.kind === "fired") {
        ctx.strokeStyle = "rgba(237, 202, 131, 0.65)";
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
        ctx.fillStyle = "#ffe0a1";
        ctx.fillText("●击发", x + 3, 13);
      } else if (ev.kind === "buffered") {
        ctx.strokeStyle = "rgba(157, 192, 228, 0.7)";
        ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = "#9dc0e4";
        ctx.fillText("◎预输入", x + 3, 26);
      } else if (ev.kind === "dropped") {
        ctx.strokeStyle = "#e5533d";
        ctx.lineWidth = 1.8;
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
        ctx.lineWidth = 1;
        ctx.fillStyle = "#ff8b75";
        ctx.fillText("×吞键", x + 3, 13);
      }
    }

    // 左下简明图例（纯符号）
    ctx.fillStyle = "#edca83"; ctx.fillText("━ 照门偏移", 8, h - 5);
    ctx.fillStyle = "#9dc0e4"; ctx.fillText("━ 开镜保持", 88, h - 5);
    ctx.fillStyle = "#9dc0e4"; ctx.fillText("■ 预输入窗", 168, h - 5);
    ctx.fillStyle = "#f08c76"; ctx.fillText("■ 归位死锁区", 248, h - 5);
  }

  DrawInertiaScope(ctx, w, h) {
    const last = this.inertiaHistory.at(-1);
    const xMm = last?.xMm ?? 0;
    const zyMm = Math.abs(last?.zMm ?? 0) >= Math.abs(last?.yMm ?? 0) ? (last?.zMm ?? 0) : (last?.yMm ?? 0);
    const rollDeg = last?.rollDeg ?? 0;
    const speed = Math.hypot(this.simRightMps, this.simForwardMps);
    this.SetScopePills([
      { k: "移速", v: `${speed.toFixed(1)} m/s` },
      { k: "横向滞后 X", v: `${xMm >= 0 ? "+" : ""}${xMm.toFixed(1)} mm`, tone: Math.abs(xMm) > 0.5 ? "good" : "" },
      { k: "冲程 Z/Y", v: `${zyMm >= 0 ? "+" : ""}${zyMm.toFixed(1)} mm`, tone: Math.abs(zyMm) > 0.5 ? "good" : "" },
      { k: "倾角", v: `${rollDeg >= 0 ? "+" : ""}${rollDeg.toFixed(2)}°` },
    ]);

    const boxSize = h - 14;
    const boxLeft = w - boxSize - 8;
    const traceW = Math.max(120, boxLeft - 14);
    const midY = Math.round((h - 14) * 0.5) + 2;

    // 零轴线
    ctx.strokeStyle = "rgba(193, 189, 171, 0.2)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, midY); ctx.lineTo(traceW, midY);
    ctx.stroke();

    const spanS = 3.2;
    const tEnd = this.time;
    const tStart = tEnd - spanS;
    const X = (t) => ((t - tStart) / spanS) * traceW;

    // 1. 身体输入速度（灰虚线）
    ctx.strokeStyle = "rgba(194, 195, 182, 0.42)";
    ctx.setLineDash([4, 3]);
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    let started = false;
    for (const s of this.inertiaHistory) {
      if (s.t < tStart) continue;
      const x = X(s.t);
      const vNorm = Math.abs(s.vRight) >= Math.abs(s.vFwd)
        ? s.vRight / 4.5
        : s.vFwd > 0.1 ? s.vFwd / 4.5 : (s.crouch - 0.5) * 1.2;
      const y = midY - THREE.MathUtils.clamp(vNorm, -1, 1) * (midY - 12);
      if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // 2. 前后冲程 Z / 蹲立滞后 Y（天蓝）
    ctx.strokeStyle = "#9dc0e4";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    started = false;
    for (const s of this.inertiaHistory) {
      if (s.t < tStart) continue;
      const x = X(s.t);
      const val = Math.abs(s.zMm) >= Math.abs(s.yMm) ? s.zMm : s.yMm;
      const y = midY - THREE.MathUtils.clamp(val / 16, -1, 1) * (midY - 10);
      if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // 3. 横向惯性位移 X（金色主线）
    ctx.strokeStyle = "#edca83";
    ctx.lineWidth = 2.1;
    ctx.beginPath();
    started = false;
    for (const s of this.inertiaHistory) {
      if (s.t < tStart) continue;
      const x = X(s.t);
      const y = midY - THREE.MathUtils.clamp(s.xMm / 18, -1, 1) * (midY - 10);
      if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
    }
    ctx.stroke();

    ctx.font = '11px ui-monospace, "Cascadia Mono", Consolas, monospace';
    ctx.fillStyle = "rgba(194,195,182,0.75)"; ctx.fillText("┄ 身体速度", 8, h - 4);
    ctx.fillStyle = "#edca83"; ctx.fillText("━ 横向惯性 X", 86, h - 4);
    ctx.fillStyle = "#9dc0e4"; ctx.fillText("━ 冲程/垂向 Z·Y", 178, h - 4);

    // 右侧：枪口平面 2D 轨迹靶（X vs Y/Z）
    const cx = boxLeft + boxSize * 0.5;
    const cy = 4 + boxSize * 0.5;
    ctx.strokeStyle = "rgba(193, 189, 171, 0.25)";
    ctx.strokeRect(boxLeft, 4, boxSize, boxSize);
    ctx.beginPath();
    ctx.moveTo(boxLeft, cy); ctx.lineTo(boxLeft + boxSize, cy);
    ctx.moveTo(cx, 4); ctx.lineTo(cx, 4 + boxSize);
    ctx.stroke();

    const tail = this.inertiaHistory.slice(-55);
    if (tail.length > 1) {
      ctx.strokeStyle = "#edca83";
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      for (let i = 0; i < tail.length; i += 1) {
        const s = tail[i];
        const px = cx + THREE.MathUtils.clamp(s.xMm / 18, -0.92, 0.92) * (boxSize * 0.5);
        const py = cy - THREE.MathUtils.clamp((s.yMm - s.zMm * 0.75) / 16, -0.92, 0.92) * (boxSize * 0.5);
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
      const headPt = tail.at(-1);
      const hx = cx + THREE.MathUtils.clamp(headPt.xMm / 18, -0.92, 0.92) * (boxSize * 0.5);
      const hy = cy - THREE.MathUtils.clamp((headPt.yMm - headPt.zMm * 0.75) / 16, -0.92, 0.92) * (boxSize * 0.5);
      ctx.fillStyle = "#ffe0a1";
      ctx.beginPath();
      ctx.arc(hx, hy, 3.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ------------------------------------------------------------------ 快照与读数
  Snapshot() {
    const viewmodel = this.host.viewmodel;
    const arms = viewmodel.riggedArms;
    const ArmGeometry = (side) => {
      const chain = arms?.bones?.[side];
      const marker = arms?.gripNodes?.[side];
      if (!chain || !marker || !arms.anchor) return null;
      const Point = (object) => arms._InAnchor(object, new THREE.Vector3());
      const shoulder = Point(chain.upperArm);
      const elbow = Point(chain.forearm);
      const wrist = Point(chain.hand);
      const palm = Point(marker);
      const forearmAxis = wrist.clone().sub(elbow).normalize();
      const wristAxis = palm.clone().sub(wrist).normalize();
      const elbowPlane = elbow.clone().sub(shoulder).cross(wrist.clone().sub(elbow)).normalize();
      const Round = (vector) => vector.toArray().map((value) => +value.toFixed(5));
      return {
        targetPalm: Round(arms.gripGoalAnchorPosition[side]), actualPalm: Round(palm),
        wristAxis: Round(wristAxis), forearmAxis: Round(forearmAxis), elbowPlane: Round(elbowPlane),
        positionResidualM: arms.gripError[side], rotationResidualDeg: arms.rotationError[side],
        handTranslationM: arms.handTranslation[side], twistDeg: { ...arms.jointTwist[side] },
        stretch: arms.stretch[side], reachRatio: arms.reachRatio[side], reachable: arms.reachable[side],
      };
    };
    const right = ArmGeometry("r");
    const left = ArmGeometry("l");
    const sources = {};
    for (const [name, source] of this.mountSources) sources[name] = source.source;
    return {
      editor: FirstPersonEditor.id,
      writeBack: false,
      mode: this.mode,
      comparisonProfile: this.comparisonProfile,
      weaponId: this.weaponId,
      weaponVariant: this.weaponVariant,
      supportedWeapons: [...FIRST_PERSON_IDS],
      view: this.view,
      inspectPreset: this.inspectPreset || null,
      pose: this.pose,
      animation: this.AnimationSnapshot(),
      ads: +this.ads.toFixed(3),
      sprint: +this.sprint.toFixed(3),
      rigSource: viewmodel.rigSource,
      rootParent: viewmodel.root.parent?.name || viewmodel.root.parent?.type || null,
      mountNames: [...this.mountSources.keys()],
      mountSources: sources,
      gripResidual: {
        right: right ? { meters: right.positionResidualM, degrees: right.rotationResidualDeg } : null,
        left: left ? { meters: left.positionResidualM, degrees: left.rotationResidualDeg } : null,
      },
      anatomy: { right, left },
      stretch: arms ? { right: arms.stretch.r, left: arms.stretch.l } : null,
      skeleton: arms ? {
        source: arms.report?.source,
        bones: arms.report?.bones,
        chains: arms.report?.chains,
        profile: arms.profile,
      } : null,
    };
  }

  RefreshFacts(force = false) {
    if (!this.facts) return;
    if (!force && this.refreshTimer > 0) return;
    this.refreshTimer = 0.15;
    const snapshot = this.Snapshot();
    const FormatGrip = (value) => value
      ? `${(value.meters * 1000).toFixed(2)} mm · ${value.degrees.toFixed(2)}°`
      : "—";
    this.facts.Set("右掌→IK目标", FormatGrip(snapshot.gripResidual.right));
    this.facts.Set("左掌→IK目标", FormatGrip(snapshot.gripResidual.left));
    if (snapshot.stretch) {
      this.facts.Set("双臂拉伸", `右 ×${snapshot.stretch.right} · 左 ×${snapshot.stretch.left}`,
        snapshot.stretch.right > 1.08 || snapshot.stretch.left > 1.08 ? "warn" : "");
    }
    if (this.legend) {
      this.legend.dataset.view = `${WEAPONS[this.weaponId]?.name || this.weaponId} · ${this.view === "player" ? "玩家视角" : "外部环绕"}`;
    }
  }

  CleanForScreenshot() {
    this.ClearCleanMode();
    document.body.classList.add("edFpsClean");
    this.host.SetHint("净屏 3 秒");
    this.cleanTimer = window.setTimeout(() => this.ClearCleanMode(), 3000);
  }

  SetAnimationClean(clean) {
    this.ClearCleanMode();
    document.body.classList.toggle("edFpsClean", !!clean);
    this.showMounts = !clean;
    this.showSkeleton = !clean;
    this.showGripLines = !clean;
    this.ApplyDiagnosticVisibility();
  }

  ClearCleanMode() {
    if (this.cleanTimer != null) window.clearTimeout(this.cleanTimer);
    this.cleanTimer = null;
    document.body.classList.remove("edFpsClean");
  }

  // ------------------------------------------------------------------ 输入与步进
  BindKeys() {
    const Editable = (el) => el && (el.tagName === "INPUT" || el.tagName === "SELECT" || el.tagName === "TEXTAREA");
    this._onKeyDown = (event) => {
      if (Editable(event.target)) return;
      if (this.mode === "inertia" && this.inertiaDriver === "manual") {
        if (/^(KeyW|KeyA|KeyS|KeyD|KeyC|ShiftLeft|ShiftRight)$/.test(event.code)) {
          this.manualKeys.add(event.code);
          event.stopPropagation();
        }
      }
    };
    this._onKeyUp = (event) => {
      this.manualKeys.delete(event.code);
    };
    window.addEventListener("keydown", this._onKeyDown, true);
    window.addEventListener("keyup", this._onKeyUp, true);
  }

  UnbindKeys() {
    if (this._onKeyDown) window.removeEventListener("keydown", this._onKeyDown, true);
    if (this._onKeyUp) window.removeEventListener("keyup", this._onKeyUp, true);
    this._onKeyDown = null;
    this._onKeyUp = null;
    this.manualKeys.clear();
  }

  OnPress(_event, button) {
    if (this.view !== "player") return;
    if (button === 2) {
      this.SetPose(this.ads >= 0.5 ? "hip" : "ads");
      return;
    }
    if (button === 0 && this.mode === "bolt") {
      this.HandleBoltClick(true);
    }
  }

  OnDrag(dx, dy, button) {
    if (this.view === "inspect") this.studio.Drag(dx, dy, button);
  }

  OnWheel(delta) {
    if (this.view === "inspect") this.studio.Zoom(delta);
  }

  StepViewmodel(dt) {
    const input = this.mode === "inertia"
      ? this.StepInertiaStimulus(dt)
      : {
          dt, moveSpeed: this.sprint ? 4 : 0, strafe: 0,
          localMoveRight: 0, localMoveForward: this.sprint ? 4 : 0,
          stanceEyeHeight: 1.62, grounded: true, sprint: this.sprint,
          ads: this.ads, lookDeltaYaw: 0, lookDeltaPitch: 0,
          crouch: 0, elapsed: this.time, lowAmmo: false,
        };
    this.host.viewmodel.Update(dt, input);
  }

  Update(dt) {
    this.time += dt;
    this.refreshTimer -= dt;
    const preview = this.actionPreview;
    if (preview?.playing) {
      preview.time += dt * preview.speed;
      if (preview.time > preview.duration) {
        if (preview.loop) preview.time %= preview.duration;
        else { preview.time = preview.duration; preview.playing = false; }
      }
    }
    if (preview) this.HoldActionPreview();
    if (this.mode === "bolt") {
      this.StepBoltBench(dt);
    } else if (this.autoFire && CanAction(WEAPONS[this.weaponId], "auto")) {
      this.fireTimer -= dt;
      if (this.fireTimer <= 0) {
        this.fireTimer = Math.max(0.08, WEAPONS[this.weaponId].fireIntervalS || 1.2);
        this.Trigger("fire");
      }
    }
    this.StepViewmodel(dt);
    this.RecordScopeSample();
    this.RenderScope();
    this.RefreshAnimationTimeline();
    this.UpdateDiagnostics();
    this.RefreshFacts();
    if (this.view === "player") this.SetStudioFov(this.PlayerFov());
    if (this.host.lights) {
      this.host.lights.UpdateShadowFrustum(
        new THREE.Vector3(0, 1.0, 0), new THREE.Vector3(0, 0, -1));
    }
  }
}

export default FirstPersonEditor;
