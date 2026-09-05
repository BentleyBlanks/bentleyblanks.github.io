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

import * as THREE from "three";
import {
  Panel, Section, Slider, Chips, Toggle, Button, ButtonRow, Facts, Note, ListBox, TextArea,
} from "./Script_EditorUi.mjs";
import { WEAPONS } from "./Data_Weapons.mjs";
import { WEAPON_MESH_BY_ID, WEAPON_MESH_VARIANTS } from "./Data_Meshes.mjs";

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
  if (!weapon || !WEAPON_MESH_BY_ID[id]) return false;
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
  return false;
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
  static hint = "枪/手榴弹切换、玩家/外部视角、真实挂点与骨骼残差";

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
    this.weaponId = id;
    const variants = WEAPON_MESH_VARIANTS[id] || [];
    this.weaponVariant = variants.length && variant > 0 && variant < variants.length ? variant | 0 : 0;
    this.host.viewmodel.Equip(id, this.weaponVariant);
    this.list?.Select(id);
    this.time = 0;
    this.RebuildMountSources();
    this.RefreshActions();
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
    if (value !== "hip" && value !== "ads" && value !== "sprint") return false;
    this.pose = value;
    this.ads = value === "ads" ? 1 : 0;
    this.sprint = value === "sprint" ? 1 : 0;
    this.poseChips?.Set(value);
    this.adsSlider?.Set(this.ads);
    this.SetStudioFov(this.PlayerFov());
    return true;
  }

  PlayerFov() {
    const scale = WEAPONS[this.weaponId]?.adsFovScale ?? 0.75;
    return 55 * (1 - this.ads * (1 - scale));
  }

  SetStudioFov(value) {
    const camera = this.host.camera;
    if (!camera || Math.abs(camera.fov - value) < 1e-4) return;
    camera.fov = value;
    camera.updateProjectionMatrix();
  }

  Trigger(action) {
    const viewmodel = this.host.viewmodel;
    const weapon = WEAPONS[this.weaponId];
    if (!viewmodel || !CanAction(weapon, action)) return false;
    if (action === "fire") viewmodel.TriggerFire();
    else if (action === "bolt") viewmodel.TriggerBolt();
    else if (action === "reload") viewmodel.TriggerReload();
    else if (action === "melee") viewmodel.TriggerMelee();
    else if (action === "throw") viewmodel.TriggerThrow(1);
    return true;
  }

  RefreshActions() {
    const weapon = WEAPONS[this.weaponId];
    for (const [action, button] of Object.entries(this.actionButtons || {})) {
      button.hidden = !CanAction(weapon, action);
    }
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

  ClearCleanMode() {
    if (this.cleanTimer != null) window.clearTimeout(this.cleanTimer);
    this.cleanTimer = null;
    document.body.classList.remove("edFpsClean");
  }

  OnDrag(dx, dy, button) {
    if (this.view === "inspect") this.studio.Drag(dx, dy, button);
  }

  OnWheel(delta) {
    if (this.view === "inspect") this.studio.Zoom(delta);
  }

  Update(dt) {
    const viewmodel = this.host.viewmodel;
    this.time += dt;
    this.refreshTimer -= dt;
    viewmodel.Update(dt, {
      dt, moveSpeed: this.sprint ? 4 : 0, strafe: 0, grounded: true, sprint: this.sprint,
      ads: this.ads, lookDeltaYaw: 0, lookDeltaPitch: 0,
      crouch: 0, elapsed: this.time, lowAmmo: false,
    });
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
