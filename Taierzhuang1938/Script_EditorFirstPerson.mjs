// 第一人称持枪检查编辑器：只读地把正片 Viewmodel、武器挂点与蒙皮双臂摊开看。
//
// 这不是第二套持枪实现，也没有任何“编辑后保存参数”的入口。它直接复用正在运行的
// Script_Viewmodel，并把同一份最终结果切到两种镜头：
//   玩家视角 —— 正片相机里的最终画面，用于截图验收遮挡、穿模和轮廓；
//   检查视角 —— 把整棵 Viewmodel 从相机下临时移到摄影棚，允许绕到侧后方看肩肘腕。
//
// 可视化同时区分三层真相：
//   武器挂点（TZM 节点；程序化兜底时读运行时 mount）、IK 目标坐标系、真实掌心 grip。
// 掌心与 IK 目标间的连线/残差只能说明“解算有没有追到目标”；它不能替代人眼判断
// 目标本身是否合理。退出时必须把父节点、局部变换、玩家武器和刺刀状态原样还回去。
//
// 第一人称的一切检查都在这里（2026-10-31 起「枪械」编辑器只剩台架）：上刺刀预览、
// 连续开火与「放大准心校准」也从枪械编辑器搬了过来，不再两处各有一套动作按钮。

import * as THREE from "three";
import {
  Panel, Section, Slider, Chips, Toggle, Button, ButtonRow, Facts, Note, ListBox, TextArea,
} from "./Script_EditorUi.mjs";
import { WEAPONS, WeaponShelved } from "./Data_Weapons.mjs";
import { WEAPON_MESH_BY_ID, WEAPON_MESH_VARIANTS, BAYONET_MESH_BY_WEAPON } from "./Data_Meshes.mjs";
import { FPS_ANIMATION_LABELS } from "./Data_FpsSkeletalAnimation.mjs";

const MOUNT_NAMES = Object.freeze(["muzzle", "gripR", "gripL", "sight", "magazine"]);
const MOUNT_STYLE = Object.freeze({
  muzzle: { color: 0xe5533d, label: "muzzle 枪口" },
  gripR: { color: 0xf0a43a, label: "gripR 后手挂点 / IK轴" },
  gripL: { color: 0x4ca7e8, label: "gripL 前手挂点 / IK轴" },
  sight: { color: 0x69c76f, label: "sight 瞄准基点" },
  magazine: { color: 0xb889e8, label: "magazine 弹仓" },
});

const PREFERRED_ORDER = Object.freeze([
  "ZhongZheng", "HanYang", "Type38", "Zb26", "Type11",
  "ServicePistol", "Grenade", "GrenadeBundle",
  "Dadao", "OfficerSwordSet",
]);

function IsFirstPersonInspectable(id) {
  const weapon = WEAPONS[id];
  // 停用的武器（手枪）不进持枪检查；姿势数据和模型都还在，恢复时自动回到列表里。
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
  if (weapon.kind === "throwable") return "投掷物";
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

/** 只有真正有照门/准星的火器才显示弹道校准，刀与手榴弹没有这条轴线。 */
function CanCalibrate(id) {
  const kind = WEAPONS[id]?.kind;
  return kind === "boltRifle" || kind === "lmg" || kind === "pistol";
}

/** 可切换预览的刺刀必须既有规则支持，也有可挂到枪口的独立模型。 */
function CanPreviewBayonet(id) {
  return !!(WEAPONS[id]?.bayonet && BAYONET_MESH_BY_WEAPON[id]);
}

// 程序动作（白刃等）没有 Blender 骨骼片段，姿势由 Viewmodel 的动作时钟逐帧算出来。
// 时间轴把同一个正片动作钉在某个进度上（action.hold），不另抄一份动画。
// 只收纯按进度求值的动作：投掷会真的扔出手榴弹，装填会提交弹药与发声，不能来回拖。
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

function WorldAxis(object, axis, target = new THREE.Vector3()) {
  const origin = object.getWorldPosition(new THREE.Vector3());
  return object.localToWorld(target.copy(axis)).sub(origin).normalize();
}

function GripResidual(actual, target) {
  if (!actual || !target) return null;
  const actualPosition = actual.getWorldPosition(new THREE.Vector3());
  const targetPosition = target.getWorldPosition(new THREE.Vector3());
  let radians = 0;
  for (const axis of [
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(0, 0, 1),
  ]) {
    radians = Math.max(radians, WorldAxis(actual, axis).angleTo(WorldAxis(target, axis)));
  }
  return {
    meters: actualPosition.distanceTo(targetPosition),
    degrees: THREE.MathUtils.radToDeg(radians),
  };
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

export class FirstPersonEditor {
  static id = "firstPerson";
  static label = "第一人称持枪检查";
  static hint = "枪/手榴弹切换、玩家/外部视角、真实挂点与骨骼残差、准心校准";

  constructor(host) {
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
    this.showMounts = true;
    this.showSkeleton = true;
    this.showGripLines = true;
    this.showGrid = false;
    this.mountSources = new Map();
    this.markerEntries = new Map();
    this.markerResources = [];
    this.lineEntries = new Map();
    this.labelEntries = new Map();
    this.cleanTimer = null;
    this.refreshTimer = 0;
    this.saved = null;
    this.actionPreview = null;
    this.bayonetPreview = false;
    this.autoFire = false;
    this.fireTimer = 0;
    this.calibration = true;
    this.calibrationByWeapon = new Map();
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
    };

    this.studio.Open(this.host.hideInStudio);
    this.panel = Panel({
      title: "第一人称持枪检查", sub: "",
      variant: "work", onClose: () => this.host.Close(),
    });
    root.appendChild(this.panel.root);
    this.BuildUi(this.panel.body);
    this.BuildOverlay(root);
    this.BuildDiagnostics();
    this.SetWeapon(this.weaponId);
    this.SetView("player");
    return this;
  }

  Exit() {
    const viewmodel = this.host.viewmodel;
    this.ClearCleanMode();
    this.DisposeDiagnostics();
    if (viewmodel?.action?.hold != null) viewmodel.action = null;
    this.actionPreview = null;
    if (viewmodel && this.saved) {
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
    this.panel = null;
    this.labelLayer = null;
    this.legend = null;
    this.studio.Close();
    this.saved = null;
  }

  BuildUi(body) {
    const pick = Section(body, "检查装备");
    this.list = ListBox(pick, { height: 190, onPick: (id) => this.SetWeapon(id) });
    this.list.Fill(FIRST_PERSON_IDS.map((id) => ({
      id,
      name: WEAPONS[id].name,
      tail: PoseKind(WEAPONS[id]),
      title: WEAPONS[id].fullName,
    })));

    const view = Section(body, "检查视角");
    this.viewChips = Chips(view, [
      { value: "player", label: "玩家视角" },
      { value: "inspect", label: "外部检查" },
    ], this.view, (value) => this.SetView(value));
    ButtonRow(view, [
      { label: "右后侧", onClick: () => this.SetInspectPreset("rightRear") },
      { label: "左后侧", onClick: () => this.SetInspectPreset("leftRear") },
      { label: "枪口侧", onClick: () => this.SetInspectPreset("front") },
      { label: "俯视", onClick: () => this.SetInspectPreset("top") },
    ]);
    Note(view, "左键环绕 · 滚轮缩放");

    const pose = Section(body, "静态姿态与动作");
    this.poseChips = Chips(pose, [
      { value: "hip", label: "腰射" },
      { value: "ads", label: "开镜" },
      { value: "sprint", label: "冲刺" },
    ], this.pose, (value) => this.SetPose(value));
    this.adsSlider = Slider(pose, {
      label: "开镜权重", min: 0, max: 1, step: 0.01, value: 0,
      onInput: (value) => {
        this.ads = value;
        this.sprint = 0;
        this.pose = value >= 0.5 ? "ads" : "hip";
        this.poseChips?.Set(this.pose);
      },
    });
    const actions = document.createElement("div");
    actions.className = "edBtns";
    pose.appendChild(actions);
    this.actionButtons = {
      fire: Button(actions, "开火", () => this.Trigger("fire")),
      bolt: Button(actions, "拉栓", () => this.Trigger("bolt")),
      reload: Button(actions, "装填", () => this.Trigger("reload")),
      melee: Button(actions, "白刃", () => this.Trigger("melee")),
      throw: Button(actions, "投掷", () => this.Trigger("throw")),
    };
    const extras = document.createElement("div");
    extras.className = "edBtns";
    pose.appendChild(extras);
    this.autoFireToggle = Toggle(extras, "连续开火", false, (on) => {
      this.autoFire = on;
      this.fireTimer = 0;
    });
    this.bayonetToggle = Toggle(extras, "上刺刀预览", false, (on) => {
      this.bayonetPreview = on;
      this.ApplyBayonetPreview();
    });

    const calibration = Section(body, "放大准心校准");
    this.calibrationSection = calibration.parentElement;
    const calibrationButtons = document.createElement("div");
    calibrationButtons.className = "edBtns";
    calibration.appendChild(calibrationButtons);
    this.calibrationToggle = Toggle(calibrationButtons, "显示真实弹道点", true, (on) => {
      this.calibration = on;
      this.UpdateCalibrationView();
    });
    this.offsetXSlider = Slider(calibration, {
      label: "横向 X", min: -32, max: 32, step: 0.5, value: 0,
      format: (v) => `${v > 0 ? "+" : ""}${v.toFixed(1)} px`,
      onInput: () => this.ApplyCalibrationFromUi(),
    });
    this.offsetYSlider = Slider(calibration, {
      label: "纵向 Y", min: -32, max: 32, step: 0.5, value: 0,
      format: (v) => `${v > 0 ? "+" : ""}${v.toFixed(1)} px`,
      onInput: () => this.ApplyCalibrationFromUi(),
    });
    ButtonRow(calibration, [
      { label: "进入校准", onClick: () => this.EnterCalibration() },
      { label: "归零", onClick: () => this.SetCalibration(0, 0) },
      { label: "恢复预设", onClick: () => this.ResetCalibration() },
      { label: "复制配置", onClick: () => this.CopyCalibration() },
    ]);
    this.calibrationOutput = TextArea(calibration, { rows: 3 });
    this.calibrationOutput.readOnly = true;
    Note(calibration, "玩家视角下拖动画面，让准星尖对齐红十字；Y 正值向上。");

    const timeline = Section(body, "骨骼动画时间轴");
    this.animationSelect = document.createElement("select");
    this.animationSelect.setAttribute("aria-label", "动画片段");
    this.animationSelect.addEventListener("change",()=>this.SetAnimation(this.animationSelect.value));
    timeline.appendChild(this.animationSelect);
    this.animationPosition = Slider(timeline, {label:"播放位置",min:0,max:1,step:.001,value:0,
      format:value=>`${Math.round(value*100)}%`,onInput:value=>this.SeekAnimation({normalized:value})});
    ButtonRow(timeline,[
      {label:"播放",onClick:()=>this.PlayAnimation(true)},
      {label:"暂停",onClick:()=>this.PlayAnimation(false)},
      {label:"前一帧",onClick:()=>this.StepAnimation(-1)},
      {label:"后一帧",onClick:()=>this.StepAnimation(1)},
      {label:"实时输入",onClick:()=>this.ClearAnimation()},
    ]);
    this.animationLoop = Toggle(timeline,"循环",true,on=>{
      const preview=this.ActivePreview();if(preview)preview.loop=on;
    });
    this.animationSpeed = Slider(timeline,{label:"播放速度",min:.1,max:2,step:.1,value:1,format:value=>`${value.toFixed(1)}×`,onInput:value=>{
      const preview=this.ActivePreview();if(preview)preview.speed=value;
    }});
    this.animationTime = Note(timeline,"");

    const overlay = Section(body, "挂点与骨骼");
    const toggles = document.createElement("div");
    toggles.className = "edBtns";
    overlay.appendChild(toggles);
    this.mountToggle = Toggle(toggles, "真实挂点", true, (on) => {
      this.showMounts = on;
      this.ApplyDiagnosticVisibility();
    });
    this.skeletonToggle = Toggle(toggles, "骨骼", true, (on) => {
      this.showSkeleton = on;
      this.ApplyDiagnosticVisibility();
    });
    this.lineToggle = Toggle(toggles, "掌心残差线", true, (on) => {
      this.showGripLines = on;
      this.ApplyDiagnosticVisibility();
    });
    this.gridToggle = Toggle(toggles, "米格", false, (on) => {
      this.showGrid = on;
      this.studio.SetGridVisible(on && this.view === "inspect");
    });

    const capture = Section(body, "截图与取证");
    ButtonRow(capture, [
      { label: "净屏 3 秒", onClick: () => this.CleanForScreenshot() },
      { label: "复制检查 JSON", onClick: () => this.CopySnapshot() },
    ]);
    this.output = TextArea(capture, { rows: 5 });
    this.output.readOnly = true;

    const facts = Section(body, "当前真值");
    this.facts = Facts(facts, ["右掌→IK目标", "左掌→IK目标", "双臂拉伸"]);
    this.RefreshActions();
  }

  BuildOverlay(root) {
    this.labelLayer = document.createElement("div");
    this.labelLayer.className = "edFpsMountHud";
    root.appendChild(this.labelLayer);

    this.legend = document.createElement("div");
    this.legend.className = "edFpsLegend";
    this.legend.innerHTML = [
      '<span style="--c:#e5533d">枪口</span>',
      '<span style="--c:#f0a43a">后手挂点</span>',
      '<span style="--c:#4ca7e8">前手挂点</span>',
      '<span style="--c:#69c76f">瞄准</span>',
      '<span style="--c:#ffffff">真实掌心</span>',
    ].join("");
    root.appendChild(this.legend);
  }

  BuildDiagnostics() {
    const viewmodel = this.host.viewmodel;
    this.markerLayer = new THREE.Group();
    this.markerLayer.name = "FpsGripEditorMarkers";
    this.markerLayer.userData.skipNormalDepth = true;
    viewmodel.root.add(this.markerLayer);

    for (const name of MOUNT_NAMES) this.CreateMarker(name, MOUNT_STYLE[name].color, MOUNT_STYLE[name].label);
    this.CreateMarker("actualR", 0xffffff, "右掌真实 grip", 0.011);
    this.CreateMarker("actualL", 0xffffff, "左掌真实 grip", 0.011);
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

    const element = document.createElement("div");
    element.className = `edFpsMountLabel ${id.startsWith("actual") ? "actual" : "mount"}`;
    element.dataset.mount = id;
    element.textContent = label;
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

  SetWeapon(id, variant = 0) {
    if (!FIRST_PERSON_IDS.includes(id)) return false;
    // 时间轴是按装备列的（骨骼片段 / 程序动作），换装备先把上一件的预览收掉。
    if (this.actionPreview || this.host.viewmodel.skeletalAnimation?.preview) this.ClearAnimation();
    this.weaponId = id;
    const variants = WEAPON_MESH_VARIANTS[id] || [];
    this.weaponVariant = variants.length && variant > 0 && variant < variants.length ? variant | 0 : 0;
    const previousRig=this.host.viewmodel.riggedArms;
    this.host.viewmodel.Equip(id, this.weaponVariant);
    if(this.markerLayer&&previousRig!==this.host.viewmodel.riggedArms){
      this.DisposeDiagnostics();
      this.labelLayer.replaceChildren();
      this.BuildDiagnostics();
      this.ApplyDiagnosticVisibility();
    }
    this.list?.Select(id);
    this.time = 0;
    // 刺刀预览按装备算，换一件就收起；校准覆盖本轮按武器记着，换回来接着用。
    this.bayonetPreview = false;
    this.bayonetToggle?.Set(false);
    this.ApplyBayonetPreview();
    const savedOffset = this.calibrationByWeapon.get(id);
    if (savedOffset) this.host.viewmodel.SetIronSightOffsetPixels(savedOffset.x, savedOffset.y);
    this.RebuildMountSources();
    this.RefreshActions();
    this.RefreshCalibrationUi();
    this.UpdateCalibrationView();
    this.RefreshAnimationList();
    this.RefreshFacts(true);
    return true;
  }

  SetView(value) {
    const viewmodel = this.host.viewmodel;
    if (!viewmodel || (value !== "player" && value !== "inspect")) return false;
    this.view = value;
    this.viewChips?.Set(value);
    viewmodel.root.removeFromParent();
    if (value === "inspect") {
      this.studio.stand.add(viewmodel.root);
      viewmodel.root.position.set(0, 1.18, 0);
      viewmodel.root.quaternion.identity();
      viewmodel.root.scale.copy(this.saved?.transform.scale || new THREE.Vector3(1, 1, 1));
      this.SetStudioFov(42);
      this.studio.SetGridVisible(this.showGrid);
      this.SetInspectPreset("rightRear", false);
    } else {
      const parent = this.saved?.parent || this.host.camera;
      parent.add(viewmodel.root);
      RestoreTransform(viewmodel.root, this.saved?.transform || {
        position: new THREE.Vector3(), quaternion: new THREE.Quaternion(), scale: new THREE.Vector3(1, 1, 1),
      });
      this.SetStudioFov(this.PlayerFov());
      this.studio.SetGridVisible(false);
      this.studio.Frame(1.7, 2.6);
    }
    viewmodel.root.visible = true;
    this.ApplyDiagnosticVisibility();
    this.UpdateCalibrationView();
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
    this.RefreshCalibrationOutput();
    return true;
  }

  PlayerFov() {
    const scale = WEAPONS[this.weaponId]?.adsFovScale ?? 0.75;
    const ads=this.host.viewmodel.skeletalAnimation?.State()?.[0]??this.ads;
    return 55 * (1 - ads * (1 - scale));
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
    if (this.calibrationSection) this.calibrationSection.hidden = !CanCalibrate(this.weaponId);
  }

  ApplyBayonetPreview() {
    this.host.viewmodel?.SetBayonetFixed?.(this.bayonetPreview && CanPreviewBayonet(this.weaponId));
  }

  // ---------------------------------------------------------------- 放大准心校准
  // 红十字是枪口真实弹道在屏幕上的固定中心；拖画面或 X/Y 滑杆移动铁瞄，直到准星尖与红十字重合。
  // 读数按 900p 基准像素。覆盖只活在编辑器这一轮里：退出时 Viewmodel.Equip 会清掉它，
  // 正片「准心、弹道、机械瞄具共用屏幕中心」的规则不受影响。

  EnterCalibration() {
    if (!CanCalibrate(this.weaponId)) return false;
    this.calibration = true;
    this.calibrationToggle?.Set(true);
    this.SetView("player");
    this.SetPose("ads");
    this.UpdateCalibrationView();
    return true;
  }

  ApplyCalibrationFromUi() {
    if (!this.offsetXSlider || !this.offsetYSlider) return;
    this.SetCalibration(this.offsetXSlider.Value(), this.offsetYSlider.Value(), false);
  }

  SetCalibration(x, y, syncUi = true) {
    const viewmodel = this.host.viewmodel;
    if (!viewmodel || !CanCalibrate(this.weaponId)) return;
    const ClampPixel = (value) => Math.max(-32, Math.min(32, Number(value) || 0));
    const value = { x: ClampPixel(x), y: ClampPixel(y) };
    this.calibrationByWeapon.set(this.weaponId, value);
    if (viewmodel.weaponId === this.weaponId) viewmodel.SetIronSightOffsetPixels(value.x, value.y);
    if (syncUi) {
      this.offsetXSlider?.Set(value.x);
      this.offsetYSlider?.Set(value.y);
    }
    this.RefreshCalibrationOutput();
  }

  ResetCalibration() {
    const viewmodel = this.host.viewmodel;
    if (!viewmodel || !CanCalibrate(this.weaponId)) return;
    this.calibrationByWeapon.delete(this.weaponId);
    const value = viewmodel.weaponId === this.weaponId ? viewmodel.ResetIronSightOffsetPixels() : { x: 0, y: 0 };
    this.offsetXSlider?.Set(value.x);
    this.offsetYSlider?.Set(value.y);
    this.RefreshCalibrationOutput();
  }

  RefreshCalibrationUi() {
    if (!this.offsetXSlider) return;
    const value = this.calibrationByWeapon.get(this.weaponId) || { x: 0, y: 0 };
    this.offsetXSlider.Set(value.x);
    this.offsetYSlider.Set(value.y);
    this.RefreshCalibrationOutput();
  }

  RefreshCalibrationOutput() {
    if (!this.calibrationOutput) return;
    if (!CanCalibrate(this.weaponId)) {
      this.calibrationOutput.value = "此条目没有可校准的第一人称机械瞄具";
      return;
    }
    const value = this.calibrationByWeapon.get(this.weaponId) || { x: 0, y: 0 };
    this.calibrationOutput.value = `${this.weaponId}: { x: ${value.x}, y: ${value.y} },\n`
      + `ADS FOV: ${this.PlayerFov().toFixed(2)}°\n`
      + `说明: X 正值向右，Y 正值向上`;
  }

  async CopyCalibration() {
    this.RefreshCalibrationOutput();
    const text = this.calibrationOutput.value.split("\n")[0];
    try {
      await navigator.clipboard.writeText(text);
      this.host.SetHint(`已复制 ${text}`);
    } catch {
      this.calibrationOutput.focus();
      this.calibrationOutput.select();
      this.host.SetHint("浏览器未授权剪贴板，配置已选中，请按 Ctrl+C");
    }
  }

  /** 红十字只在玩家视角下出：外部检查的机位不是玩家眼睛，弹道中心在那里没有意义。 */
  CalibrationActive() {
    return this.calibration && this.view === "player" && CanCalibrate(this.weaponId);
  }

  UpdateCalibrationView() {
    const active = this.CalibrationActive();
    this.host.SetCrosshair(active, active ? "calibration" : "");
    this.RefreshCalibrationOutput();
  }

  RefreshAnimationList() {
    if(!this.animationSelect)return;
    this.animationSelect.replaceChildren();
    const names=this.AnimationNames();
    for(const name of names){
      const action=this.ActionClip(name);
      const option=document.createElement('option');option.value=name;
      option.textContent=action?ActionClipLabel(this.weaponId,action):FPS_ANIMATION_LABELS[name]||name;
      this.animationSelect.appendChild(option);
    }
    this.animationSelect.disabled=!names.length;
    this.RefreshAnimationTimeline();
  }

  AnimationNames() {
    const weapon=WEAPONS[this.weaponId];
    return [...(this.host.viewmodel.skeletalAnimation?.Clips()||[]),
      ...(CanAction(weapon,"melee")?[ACTION_CLIP_PREFIX+"melee"]:[])];
  }

  /** "action:melee" → "melee"；不是本装备能做的程序动作就返回 null。 */
  ActionClip(name) {
    if(typeof name!=='string'||!name.startsWith(ACTION_CLIP_PREFIX))return null;
    const action=name.slice(ACTION_CLIP_PREFIX.length);
    return action==="melee"&&CanAction(WEAPONS[this.weaponId],action)?action:null;
  }

  /** 当前时间轴背后的那份播放状态（骨骼片段或程序动作），没有就是 null。 */
  ActivePreview() {
    return this.actionPreview||this.host.viewmodel.skeletalAnimation?.preview||null;
  }

  DefaultAnimation() {
    return this.animationSelect?.value||this.AnimationNames()[0]||'Idle';
  }

  SetAnimation(name,options={}) {
    const vm=this.host.viewmodel;
    const action=this.ActionClip(name);
    if(!action&&!vm.skeletalAnimation?.Clip(name))return false;
    this.ClearAnimation();
    vm.action=null;vm.pendingBoltAt=-1;vm._ResetAnimatedParts();
    vm.adsSpring.Set(0);vm.sprintSpring.Set(0);
    this.ads=0;this.sprint=0;
    this.animationSelect.value=name;
    const result=action?this.StartActionPreview(action,options):vm.skeletalAnimation.SetPreview(name,options);
    this.SetStudioFov(this.PlayerFov());
    this.RefreshAnimationTimeline();this.UpdateDiagnostics();return result;
  }

  StartActionPreview(action,{time=0,playing=false,loop=true,speed=1}={}) {
    const vm=this.host.viewmodel;
    if(!Number.isFinite(time)||!Number.isFinite(speed))return false;
    if(action!=="melee"||!vm.TriggerMelee()||!vm.action)return false;
    const duration=vm.action.duration;
    this.actionPreview={name:ACTION_CLIP_PREFIX+action,action,kind:vm.action.kind,mode:vm.action.melee,duration,
      time:THREE.MathUtils.clamp(time,0,duration),playing:!!playing,loop:!!loop,speed:THREE.MathUtils.clamp(speed,.1,2)};
    this.SettleActionPreview();
    return this.AnimationSnapshot();
  }

  /** 把正片动作钉在预览进度上；动作被别的入口清掉了就按同一模式重新起一次。 */
  HoldActionPreview() {
    const preview=this.actionPreview,vm=this.host.viewmodel;
    if(!preview)return false;
    if(vm.action?.kind!==preview.kind||vm.action.hold==null){
      vm.action=null;
      if(!vm.TriggerMelee(preview.mode)||!vm.action){this.actionPreview=null;return false;}
    }
    vm.action.hold=preview.duration?preview.time/preview.duration:0;
    return true;
  }

  /**
   * 拖动/逐帧之后让双臂落到这一帧。大刀的肘轨是采样好的，一帧就到位；其余动作的肘平面
   * 带历史限速，多走几步同一进度，避免拖动结果取决于上一次停在哪。
   */
  SettleActionPreview() {
    if(!this.HoldActionPreview())return false;
    for(let i=0;i<8;i++)this.StepViewmodel(1/60);
    return true;
  }

  SeekAnimation({seconds,normalized,frame}={}) {
    if(!this.ActivePreview()&&!this.SetAnimation(this.DefaultAnimation()))return false;
    if(this.actionPreview){
      const preview=this.actionPreview;
      const time=seconds??(normalized!=null?normalized*preview.duration:frame!=null?frame/ACTION_TIMELINE_FPS:NaN);
      if(!Number.isFinite(time))return false;
      preview.time=THREE.MathUtils.clamp(time,0,preview.duration);preview.playing=false;
      this.SettleActionPreview();
      this.RefreshAnimationTimeline();this.UpdateDiagnostics();return this.AnimationSnapshot();
    }
    const player=this.host.viewmodel.skeletalAnimation;
    const clip=player.Clip(player.preview.name);
    const time=seconds??(normalized!=null?normalized*clip.duration:frame!=null?frame*clip.duration/(clip.count-1):NaN);
    const result=player.Seek(time);
    this.SetStudioFov(this.PlayerFov());
    this.RefreshAnimationTimeline();this.UpdateDiagnostics();return result;
  }

  PlayAnimation(playing=true) {
    return this.SetAnimationPlayback({playing});
  }

  SetAnimationPlayback(options={}) {
    if(!this.ActivePreview()&&!this.SetAnimation(this.DefaultAnimation()))return false;
    if(options.speed!=null&&!Number.isFinite(options.speed))return false;
    const preview=this.ActivePreview();
    // 播完停在末帧的程序动作，再按播放从头来，和骨骼片段的循环口径一致。
    if(options.playing&&this.actionPreview&&!preview.loop&&preview.time>=preview.duration)preview.time=0;
    if(options.playing!=null)preview.playing=!!options.playing;
    if(options.loop!=null)preview.loop=!!options.loop;
    if(options.speed!=null)preview.speed=Math.max(.1,Math.min(2,options.speed));
    this.RefreshAnimationTimeline();return this.AnimationSnapshot();
  }

  StepAnimation(delta=1) {
    if(!this.ActivePreview()&&!this.SetAnimation(this.DefaultAnimation()))return false;
    if(this.actionPreview)
      return this.SeekAnimation({frame:Math.round(this.actionPreview.time*ACTION_TIMELINE_FPS)+Math.trunc(delta)});
    const player=this.host.viewmodel.skeletalAnimation;
    const clip=player.Clip(player.preview.name);
    const frame=Math.round(player.preview.time/clip.duration*(clip.count-1))+Math.trunc(delta);
    return this.SeekAnimation({frame});
  }

  ClearAnimation() {
    const vm=this.host.viewmodel;
    if(vm?.skeletalAnimation)vm.skeletalAnimation.preview=null;
    if(this.actionPreview&&vm?.action?.hold!=null)vm.action=null;
    this.actionPreview=null;
    vm?.armAnchor.position.set(0,0,0);vm?.armAnchor.quaternion.identity();vm?.armAnchor.scale.set(1,1,1);
    this.RefreshAnimationTimeline();return true;
  }

  AnimationSnapshot() {
    const preview=this.actionPreview;
    if(!preview)return this.host.viewmodel.skeletalAnimation?.Snapshot()||null;
    const frames=Math.round(preview.duration*ACTION_TIMELINE_FPS)+1;
    return {available:this.AnimationNames(),name:preview.name,time:preview.time,duration:preview.duration,
      frame:Math.min(frames-1,Math.round(preview.time*ACTION_TIMELINE_FPS)),frames,source:'ProceduralAction',
      action:preview.action,mode:preview.mode,playing:preview.playing,loop:preview.loop,speed:preview.speed};
  }

  RefreshAnimationTimeline() {
    const snapshot=this.AnimationSnapshot();
    if(this.animationLoop)this.animationLoop.Set(snapshot?.loop??true);
    if(this.animationSpeed)this.animationSpeed.Set(snapshot?.speed??1);
    if(this.animationPosition)this.animationPosition.Set(snapshot?.duration?snapshot.time/snapshot.duration:0);
    if(this.animationTime)this.animationTime.textContent=snapshot?.duration
      ? `${snapshot.time.toFixed(3)} / ${snapshot.duration.toFixed(3)} s · ${snapshot.frame} / ${snapshot.frames-1} 帧 · ${snapshot.playing?'播放':'暂停'}`
      : '选择片段后可拖动、逐帧定位';
  }

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
      let source = modelNode ? "model" : "runtime";
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
    if (source.local) {
      source.positionObject.localToWorld(position.copy(source.local));
    } else {
      source.positionObject.getWorldPosition(position);
    }
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
    if (this.legend) this.legend.hidden = !this.showMounts;
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
      ? `${(value.meters * 1000).toFixed(2)} mm / ${value.degrees.toFixed(2)}°`
      : "无骨骼掌心";
    this.facts.Set("装备", `${WEAPONS[this.weaponId]?.name || this.weaponId} · ${this.weaponId}`);
    this.facts.Set("视角", this.view === "player" ? "玩家最终画面" : `外部检查 · ${this.inspectPreset || "环绕"}`);
    this.facts.Set("rig 来源", snapshot.rigSource || "—", snapshot.rigSource?.includes("riggedArms") ? "good" : "bad");
    this.facts.Set("握姿族", snapshot.skeleton?.profile || "—");
    this.facts.Set("挂点", snapshot.mountNames.map((name) => `${name}:${snapshot.mountSources[name]}`).join(" · "));
    this.facts.Set("右掌→IK目标", FormatGrip(snapshot.gripResidual.right));
    this.facts.Set("左掌→IK目标", FormatGrip(snapshot.gripResidual.left));
    if (snapshot.anatomy.right && snapshot.anatomy.left) {
      this.facts.Set("Hand 末端平移", `右 ${(snapshot.anatomy.right.handTranslationM * 1000).toFixed(2)} mm · 左 ${(snapshot.anatomy.left.handTranslationM * 1000).toFixed(2)} mm`,
        snapshot.anatomy.right.handTranslationM > 0.003 || snapshot.anatomy.left.handTranslationM > 0.003 ? "bad" : "good");
      const Twist = (side) => Object.entries(snapshot.anatomy[side].twistDeg)
        .map(([joint, value]) => `${joint}:${Number(value).toFixed(1)}°`).join("/");
      this.facts.Set("右侧 joint twist", Twist("right"));
      this.facts.Set("左侧 joint twist", Twist("left"));
      this.facts.Set("肩肘腕可达", `右 ${snapshot.anatomy.right.reachRatio.toFixed(3)} · 左 ${snapshot.anatomy.left.reachRatio.toFixed(3)}`,
        snapshot.anatomy.right.reachable && snapshot.anatomy.left.reachable ? "good" : "bad");
      this.facts.Set("前臂轴 / 肘平面", `右 ${snapshot.anatomy.right.forearmAxis.join(",")} / ${snapshot.anatomy.right.elbowPlane.join(",")}`);
    }
    if (snapshot.stretch) {
      this.facts.Set("双臂拉伸", `右 ×${snapshot.stretch.right} · 左 ×${snapshot.stretch.left}`,
        snapshot.stretch.right > 1.08 || snapshot.stretch.left > 1.08 ? "warn" : "");
    }
    this.facts.Set("姿态参数写回", "无（只读）", "good");
    if (this.output) this.output.value = JSON.stringify(snapshot, null, 2);
    if (this.legend) this.legend.dataset.view = `${WEAPONS[this.weaponId]?.name || this.weaponId} · ${this.view === "player" ? "玩家视角" : "外部检查"}`;
  }

  async CopySnapshot() {
    const text = JSON.stringify(this.Snapshot(), null, 2);
    if (this.output) this.output.value = text;
    try {
      await navigator.clipboard.writeText(text);
      this.host.SetHint("已复制第一人称检查 JSON");
    } catch {
      this.output?.focus();
      this.output?.select();
      this.host.SetHint("浏览器未授权剪贴板，JSON 已选中，请按 Ctrl+C");
    }
  }

  CleanForScreenshot() {
    this.ClearCleanMode();
    document.body.classList.add("edFpsClean");
    this.host.SetHint("净屏截图：3 秒后自动恢复面板");
    this.cleanTimer = window.setTimeout(() => this.ClearCleanMode(), 3000);
  }

  SetAnimationClean(clean) {
    this.ClearCleanMode();
    document.body.classList.toggle('edFpsClean',!!clean);
    this.showMounts=!clean;this.showSkeleton=!clean;this.showGripLines=!clean;
    this.ApplyDiagnosticVisibility();
  }

  ClearCleanMode() {
    if (this.cleanTimer != null) window.clearTimeout(this.cleanTimer);
    this.cleanTimer = null;
    document.body.classList.remove("edFpsClean");
  }

  OnDrag(dx, dy, button) {
    if (this.view === "inspect") { this.studio.Drag(dx, dy, button); return; }
    // 玩家视角下左键拖 = 挪铁瞄（900p 基准像素，按当前画布高度换算）
    if (button === 0 && this.CalibrationActive()) {
      const current = this.calibrationByWeapon.get(this.weaponId) || { x: 0, y: 0 };
      const scale = 900 / Math.max(1, this.host.canvas.clientHeight || 900);
      this.SetCalibration(current.x + dx * scale, current.y - dy * scale);
    }
  }

  OnWheel(delta) {
    if (this.view === "inspect") this.studio.Zoom(delta);
  }

  StepViewmodel(dt) {
    this.host.viewmodel.Update(dt, {
      dt, moveSpeed: this.sprint ? 4 : 0, strafe: 0, grounded: true, sprint: this.sprint,
      ads: this.ads, lookDeltaYaw: 0, lookDeltaPitch: 0,
      crouch: 0, elapsed: this.time, lowAmmo: false,
    });
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
    if (this.autoFire && CanAction(WEAPONS[this.weaponId], "auto")) {
      this.fireTimer -= dt;
      if (this.fireTimer <= 0) {
        this.fireTimer = Math.max(0.08, WEAPONS[this.weaponId].fireIntervalS || 1.2);
        this.Trigger("fire");
      }
    }
    this.StepViewmodel(dt);
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
