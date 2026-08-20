// 可破坏场景预览编辑器。
//
// 它不另造一套假靶场：预览直接运行正式 DestructionSystem，命中真实关卡的
// BuildSink 碰撞记录，因此看到的耐久、Rapier 分裂、shader 破口、残骸、掩体与
// 导航重建就是正片结果。编辑器只负责三件事：选靶、施加测试伤害、把状态读清楚。
//
// 退出必须无痕。Enter 时由 DestructionSystem.CaptureSnapshot 留底，重置与 Exit
// 都走 RestoreSnapshot；不能只把洞的 uniform 清零，那会留下看不见的物理缺口。

import * as THREE from "three";
import {
  Panel, Section, ButtonRow, Chips, Slider, ListBox, Facts, Note, Toggle,
} from "./Script_EditorUi.mjs";
import { ScreenRay } from "./Script_EditorStage.mjs";
import { MarkNoPrepass } from "./Script_Post.mjs";
import { PHASES } from "./Data_Battle.mjs";

const MAX_GIZMO_VOLUMES = 96;
const WALL_TAGS = new Set([
  "wall", "zhaiWall", "parapet", "villageWall", "villageStoneWall", "villageFoundation",
]);
const FLOOR_TAGS = new Set([
  "bridge", "platform", "floor", "ceiling", "roof", "villageRoof",
]);
const STRUCTURAL_TAGS = new Set(["cityWall", "rampart", "ramp", "tower"]);

function CenterOf(box) {
  return box.c ? box.c.slice() : [
    (box.min[0] + box.max[0]) * 0.5,
    (box.min[1] + box.max[1]) * 0.5,
    (box.min[2] + box.max[2]) * 0.5,
  ];
}

function HalfOf(box) {
  return box.h ? box.h.slice() : [
    (box.max[0] - box.min[0]) * 0.5,
    (box.max[1] - box.min[1]) * 0.5,
    (box.max[2] - box.min[2]) * 0.5,
  ];
}

function FormatResult(result) {
  if (!result) return "尚未测试";
  if (result.protected) return `承重保护 · ${result.profile}`;
  if (Number.isFinite(result.hits)) return `爆炸命中 ${result.hits} · 形成 ${result.broken} 个破口`;
  if (result.broken) return `破坏完成 · ${result.profile}`;
  if (result.damaged) return `损伤 ${(result.ratio * 100).toFixed(0)}% · 阶段 ${result.stage}`;
  return "没有产生破坏";
}

export class DestructionEditor {
  static id = "destruction";
  static label = "可破坏场景预览";
  static hint = "在七关真实场景里试射、爆破、检查承重白名单与复原拓扑";

  constructor(host) {
    this.host = host;
    this.cameraMode = "fly";
    this.panel = null;
    this.baseline = null;
    this.boundField = null;
    this.loading = false;
    this.entered = false;
    this.action = "inspect";       // inspect | bullet | shell | blast
    this.bulletEnergy = 66;
    this.shellEnergy = 900;
    this.blastRadius = 4.5;
    this.burst = 1;
    this.showVolumes = true;
    this.target = null;
    this.lastResult = null;
    this.lastPoint = null;
    this.lastAction = "";
    this.hoverTimer = 0;
    this.message = "左键选择；切到伤害工具后左键直接测试";
    this.root = new THREE.Group();
    this.root.name = "EditorDestructionGizmos";
    this.matrix = new THREE.Matrix4();
    this.quaternion = new THREE.Quaternion();
    this.position = new THREE.Vector3();
    this.scale = new THREE.Vector3();
    this.rayDirection = new THREE.Vector3();
  }

  get destruction() { return this.host.destruction; }
  get field() { return this.host.game.battlefield; }

  Enter(root) {
    if (!this.destruction) throw new Error("DestructionSystem 没有接进编辑器宿主");
    this.entered = true;
    this.host.scene.add(this.root);
    this.BuildGizmos();
    this.host.flycam.Open();
    this.host.SetViewmodelVisible(false);
    this.panel = Panel({
      title: "可破坏场景预览", sub: "WASD+QE 飞 · 左键测试 · R 复原",
      variant: "work wide", onClose: () => this.host.Close(),
    });
    root.appendChild(this.panel.root);
    this.BuildUi(this.panel.body);
    this.BindWorld();
    this._onKeyDown = (event) => {
      const tag = event.target && event.target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      const tools = { Digit1: "inspect", Digit2: "bullet", Digit3: "shell", Digit4: "blast" };
      if (tools[event.code]) { this.SetAction(tools[event.code]); event.preventDefault(); }
      else if (event.code === "KeyR") { this.ResetPreview(); event.preventDefault(); }
      else if (event.code === "KeyF") { this.ApplyAtCenter(); event.preventDefault(); }
    };
    document.addEventListener("keydown", this._onKeyDown);
    this.host.SetCrosshair(true);
    return this;
  }

  Exit() {
    this.entered = false;
    if (this.baseline && this.boundField === this.field) {
      this.destruction.RestoreSnapshot(this.baseline);
      this.destruction.Update(this.host.game.player.position);
    }
    document.removeEventListener("keydown", this._onKeyDown);
    this.host.scene.remove(this.root);
    this.DisposeGizmos();
    this.host.flycam.Close();
    this.host.SetViewmodelVisible(true);
    this.host.SetCrosshair(false);
    this.host.SetHint("");
    if (this.panel) this.panel.root.remove();
    this.panel = null;
    this.baseline = null;
    this.boundField = null;
  }

  BuildUi(body) {
    const level = Section(body, "关卡切片");
    this.levelList = ListBox(level, {
      height: 112,
      onPick: (id) => {
        const index = PHASES.findIndex((phase) => phase.id === id);
        if (index >= 0) this.SwitchLevel(index);
      },
    });
    this.levelList.Fill(PHASES.map((phase) => ({
      id: phase.id, name: phase.label, tail: phase.date || "", title: phase.brief || "",
    })));

    const camera = Section(body, "取景与靶位");
    Slider(camera, {
      label: "飞行速度", min: 1, max: 80, step: 1, value: 14,
      format: (value) => `${value.toFixed(0)} m/s`,
      onInput: (value) => { this.host.flycam.speed = value; },
    });
    ButtonRow(camera, [
      { label: "定位墙面", onClick: () => this.FocusTags(WALL_TAGS) },
      { label: "定位楼板", onClick: () => this.FocusTags(FLOOR_TAGS) },
      { label: "定位承重", onClick: () => this.FocusTags(STRUCTURAL_TAGS) },
    ]);

    const tool = Section(body, "破坏工具");
    this.actionChips = Chips(tool, [
      { value: "inspect", label: "1 检查" },
      { value: "bullet", label: "2 枪弹" },
      { value: "shell", label: "3 炮弹" },
      { value: "blast", label: "4 范围爆破" },
    ], this.action, (value) => this.SetAction(value));
    Slider(tool, {
      label: "枪弹能量", min: 20, max: 240, step: 1, value: this.bulletEnergy,
      format: (value) => value.toFixed(0), onInput: (value) => { this.bulletEnergy = value; },
    });
    Slider(tool, {
      label: "炮爆能量", min: 100, max: 2400, step: 20, value: this.shellEnergy,
      format: (value) => value.toFixed(0), onInput: (value) => { this.shellEnergy = value; },
    });
    Slider(tool, {
      label: "爆破半径", min: 1, max: 12, step: 0.25, value: this.blastRadius,
      format: (value) => `${value.toFixed(2)} m`, onInput: (value) => { this.blastRadius = value; },
    });
    Slider(tool, {
      label: "连发次数", min: 1, max: 24, step: 1, value: this.burst,
      format: (value) => `${value.toFixed(0)} 发`, onInput: (value) => { this.burst = value | 0; },
    });
    ButtonRow(tool, [
      { label: "对准测试 F", onClick: () => this.ApplyAtCenter() },
      { label: "复原预览 R", onClick: () => this.ResetPreview() },
    ]);
    Toggle(tool, "显示碰撞盒与破口体积", this.showVolumes, (on) => {
      this.showVolumes = on;
      this.RefreshGizmos();
    });
    Note(tool, "预览调用正式耐久、碰撞和导航链；复原或退出会还原进入编辑器时的状态。", true);

    const profiles = Section(body, "本关材质分布");
    this.profileList = ListBox(profiles, {
      height: 96, onPick: (id) => this.FocusProfile(id),
    });

    const target = Section(body, "准心目标");
    this.targetFacts = Facts(target);
    const scene = Section(body, "破坏取证");
    this.sceneFacts = Facts(scene);
  }

  SetAction(action) {
    this.action = action;
    if (this.actionChips) this.actionChips.Set(action);
    const labels = {
      inspect: "检查模式：左键只选中，不施加伤害",
      bullet: `枪弹模式：左键按 ${this.burst} 发累积耐久`,
      shell: "炮弹模式：左键在命中点直接开局部破口",
      blast: `范围爆破：左键以命中点为圆心，半径 ${this.blastRadius.toFixed(2)} m`,
    };
    this.message = labels[action] || "";
  }

  async SwitchLevel(index) {
    if (!this.entered || this.loading || index < 0 || index >= PHASES.length) return false;
    this.loading = true;
    this.message = `正在装入 ${PHASES[index].label}…`;
    if (this.baseline && this.boundField === this.field) this.destruction.RestoreSnapshot(this.baseline);
    this.baseline = null;
    this.boundField = null;
    this.target = null;
    try {
      await this.host.game.JumpToLevel(index);
      // JumpToLevel 是异步的。用户可在装载中关闭面板；那时不能再给已经退出的
      // editor 抓一张无人负责复原的快照，也不能继续改已摘下的 UI。
      if (!this.entered) return false;
      if (this.host.game.state.ready) this.BindWorld();
      this.message = `${PHASES[index].label} 已装入`;
      return true;
    } finally {
      this.loading = false;
    }
  }

  BindWorld() {
    if (!this.field || !this.host.game.state.ready) return false;
    this.boundField = this.field;
    this.baseline = this.destruction.CaptureSnapshot();
    this.target = null;
    this.lastResult = null;
    this.lastPoint = null;
    this.FillProfiles();
    const phase = PHASES[this.host.game.state.phaseIndex];
    if (phase && this.levelList) this.levelList.Select(phase.id);
    this.RefreshFacts();
    return !!this.baseline;
  }

  ResetPreview() {
    if (!this.baseline || this.boundField !== this.field) return false;
    const restored = this.destruction.RestoreSnapshot(this.baseline);
    this.target = null;
    this.lastResult = null;
    this.lastPoint = null;
    this.lastAction = "";
    this.message = restored ? "预览已复原：视觉、Rapier、掩体与导航一致" : "当前关卡已变，旧快照不能复原";
    this.destruction.Update(this.host.camera.position);
    this.RefreshGizmos();
    this.RefreshFacts();
    return restored;
  }

  FillProfiles() {
    if (!this.profileList || !this.field) return;
    const counts = new Map();
    for (const box of this.field.colliders || []) {
      const profile = this.destruction.Profile(box);
      let row = counts.get(profile.id);
      if (!row) {
        row = { id: profile.id, name: profile.label, count: 0, destructible: profile.destructible };
        counts.set(profile.id, row);
      }
      row.count += 1;
    }
    this.profileList.Fill([...counts.values()].map((row) => ({
      id: row.id, name: row.name, tail: `${row.count}${row.destructible ? "" : " · 承重"}`,
    })));
  }

  FocusProfile(profileId) {
    return this.FocusWhere((box) => this.destruction.Profile(box).id === profileId);
  }

  FocusWall() { return this.FocusTags(WALL_TAGS); }

  FocusFloor() { return this.FocusTags(FLOOR_TAGS); }

  FocusStructural() { return this.FocusTags(STRUCTURAL_TAGS); }

  FocusTags(tags) {
    return this.FocusWhere((box) => tags.has(box.tag));
  }

  FocusWhere(predicate) {
    if (!this.field) return false;
    const origin = this.host.game.player ? this.host.game.player.position : this.host.camera.position;
    let best = null, bestDistance = Infinity;
    for (const box of this.field.colliders || []) {
      if (!box || box.destroyed || !predicate(box)) continue;
      const center = CenterOf(box);
      const distance = (center[0] - origin.x) ** 2 + (center[2] - origin.z) ** 2;
      if (distance < bestDistance) { best = box; bestDistance = distance; }
    }
    if (!best) {
      this.message = "当前关卡没有这一类构件";
      return false;
    }
    const center = CenterOf(best);
    const half = HalfOf(best);
    const ry = best.ry || 0;
    let normal;
    if (half[1] < Math.min(half[0], half[2]) * 0.75) {
      normal = new THREE.Vector3(0.12, 1, 0.18).normalize();
    } else if (half[0] < half[2]) {
      normal = new THREE.Vector3(Math.cos(ry), 0, -Math.sin(ry));
    } else {
      normal = new THREE.Vector3(Math.sin(ry), 0, Math.cos(ry));
    }
    const point = new THREE.Vector3(center[0], center[1], center[2]);
    const distance = Math.max(4.5, Math.min(18, Math.max(half[0], half[1], half[2]) + 5.5));
    this.host.camera.position.copy(point).addScaledVector(normal, distance);
    if (normal.y < 0.5) this.host.camera.position.y = center[1] + Math.min(1.2, half[1] * 0.35);
    this.host.camera.lookAt(point);
    const euler = new THREE.Euler().setFromQuaternion(this.host.camera.quaternion, "YXZ");
    this.host.flycam.yaw = euler.y;
    this.host.flycam.pitch = euler.x;
    this.target = {
      box: best, point, normal: normal.clone().negate(), distance,
    };
    this.message = `已定位 ${best.tag} · 左键或 F 测试`;
    this.RefreshGizmos();
    this.RefreshFacts();
    return true;
  }

  Pick(clientX, clientY, terrain = false) {
    if (!this.field || !this.field.Raycast) return null;
    ScreenRay(this.host.camera, this.host.canvas, clientX, clientY, this.rayDirection);
    const hit = this.field.Raycast(this.host.camera.position, this.rayDirection, 700,
      terrain ? { terrain: true } : null);
    if (!hit) return null;
    const point = this.host.camera.position.clone().addScaledVector(this.rayDirection, hit.t);
    const normal = new THREE.Vector3(hit.normal[0], hit.normal[1], hit.normal[2]).normalize();
    return { box: hit.box, point, normal, distance: hit.t };
  }

  ApplyAtCenter() {
    const rect = this.host.canvas.getBoundingClientRect();
    const hit = this.Pick(rect.left + rect.width * 0.5, rect.top + rect.height * 0.5,
      this.action === "blast");
    if (!hit) { this.message = "准心没有命中场景"; return null; }
    this.target = hit;
    return this.ApplyTarget(this.action);
  }

  ApplyTarget(action = this.action) {
    if (!this.target || !this.target.box) {
      this.message = "先左键选择一个碰撞构件";
      return null;
    }
    if (action === "inspect") {
      this.lastResult = null;
      this.message = `已选中 ${this.target.box.tag}`;
      this.RefreshFacts();
      return { inspected: true };
    }
    // terrain=true 的射线允许范围爆破把解析地表当爆心，但地表不是 BuildSink
    // 构件，不能套用默认 masonry 档案去伪造一只零尺寸“墙”。
    if (this.target.box.tag === "dirt" && action !== "blast") {
      this.lastResult = null;
      this.message = "解析地表只可作为范围爆破的爆心";
      this.RefreshFacts();
      return { terrain: true, ignored: true };
    }
    const point = this.target.point;
    let result = null;
    if (action === "bullet") {
      for (let i = 0; i < this.burst; i += 1) {
        result = this.destruction.Hit(this.target.box, point, this.bulletEnergy,
          { kind: "bullet", normal: this.target.normal });
        if (result.broken || result.protected) break;
      }
    } else if (action === "shell") {
      result = this.destruction.Hit(this.target.box, point, this.shellEnergy,
        { kind: "shell", normal: this.target.normal });
    } else if (action === "blast") {
      result = this.destruction.Blast(point, this.blastRadius, this.shellEnergy, { kind: "shell" });
    }
    this.lastResult = result;
    this.lastAction = action;
    this.lastPoint = point.clone();
    this.message = FormatResult(result);
    // 编辑器暂停了正式物理帧；把新碎片立刻提交给 Rapier broad phase，才能在
    // 同一次预览里继续拾取破口边缘，而不必先退出编辑器让 gameplay Step 一帧。
    if (this.destruction.physics?.RefreshStaticQueries) {
      this.destruction.physics.RefreshStaticQueries();
    }
    this.destruction.Update(this.host.camera.position);
    this.FillProfiles();
    this.RefreshGizmos();
    this.RefreshFacts();
    return result;
  }

  OnClick(event, button) {
    if (button !== 0 || this.loading) return;
    const hit = this.Pick(event.clientX, event.clientY, this.action === "blast");
    if (!hit) { this.target = null; this.message = "这个方向没有碰撞构件"; return; }
    this.target = hit;
    this.ApplyTarget(this.action);
  }

  BuildGizmos() {
    const targetMaterial = new THREE.MeshBasicMaterial({
      color: 0xe0b062, wireframe: true, transparent: true, opacity: 0.92,
      depthTest: false, depthWrite: false,
    });
    MarkNoPrepass(targetMaterial);
    this.targetGizmo = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), targetMaterial);
    this.targetGizmo.renderOrder = 950;
    this.targetGizmo.visible = false;
    this.root.add(this.targetGizmo);

    const breachMaterial = new THREE.MeshBasicMaterial({
      color: 0xd6604a, wireframe: true, transparent: true, opacity: 0.78,
      depthTest: false, depthWrite: false,
    });
    MarkNoPrepass(breachMaterial);
    this.breachGizmos = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1), breachMaterial, MAX_GIZMO_VOLUMES);
    this.breachGizmos.renderOrder = 949;
    this.breachGizmos.frustumCulled = false;
    this.breachGizmos.count = 0;
    this.root.add(this.breachGizmos);

    const ringMaterial = new THREE.MeshBasicMaterial({
      color: 0xe0b062, transparent: true, opacity: 0.8,
      depthTest: false, depthWrite: false, side: THREE.DoubleSide,
    });
    MarkNoPrepass(ringMaterial);
    this.blastGizmo = new THREE.Mesh(new THREE.RingGeometry(0.97, 1, 64), ringMaterial);
    this.blastGizmo.rotation.x = -Math.PI / 2;
    this.blastGizmo.renderOrder = 951;
    this.blastGizmo.visible = false;
    this.root.add(this.blastGizmo);
  }

  RefreshGizmos() {
    if (!this.targetGizmo || !this.breachGizmos) return;
    this.targetGizmo.visible = !!(this.showVolumes && this.target && this.target.box
      && this.target.box.tag !== "dirt");
    if (this.targetGizmo.visible) {
      const center = CenterOf(this.target.box);
      const half = HalfOf(this.target.box);
      this.targetGizmo.position.set(center[0], center[1], center[2]);
      this.targetGizmo.rotation.set(0, this.target.box.ry || 0, 0);
      this.targetGizmo.scale.set(half[0] * 2.01, half[1] * 2.01, half[2] * 2.01);
      const protectedTarget = !this.destruction.Profile(this.target.box).destructible;
      this.targetGizmo.material.color.setHex(protectedTarget ? 0x6fa8dc : 0xe0b062);
    }
    const breaches = this.destruction.breaches || [];
    const count = this.showVolumes ? Math.min(MAX_GIZMO_VOLUMES, breaches.length) : 0;
    this.breachGizmos.count = count;
    for (let i = 0; i < count; i += 1) {
      const breach = breaches[i];
      this.position.set(breach.center[0], breach.center[1], breach.center[2]);
      this.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), breach.ry || 0);
      this.scale.set(breach.half[0] * 2.02, breach.half[1] * 2.02, breach.half[2] * 2.02);
      this.matrix.compose(this.position, this.quaternion, this.scale);
      this.breachGizmos.setMatrixAt(i, this.matrix);
    }
    this.breachGizmos.instanceMatrix.needsUpdate = true;
    this.blastGizmo.visible = !!(this.showVolumes && this.lastPoint && this.lastAction === "blast");
    if (this.blastGizmo.visible) {
      this.blastGizmo.position.copy(this.lastPoint).add(new THREE.Vector3(0, 0.035, 0));
      this.blastGizmo.scale.setScalar(this.blastRadius);
    }
  }

  DisposeGizmos() {
    if (!this.targetGizmo) return;
    for (const object of [this.targetGizmo, this.breachGizmos, this.blastGizmo]) {
      if (!object) continue;
      if (object.geometry) object.geometry.dispose();
      if (object.material) object.material.dispose();
    }
    this.root.clear();
    this.targetGizmo = null;
    this.breachGizmos = null;
    this.blastGizmo = null;
  }

  RefreshFacts() {
    if (!this.sceneFacts || !this.targetFacts) return;
    const stats = this.destruction.Stats();
    const phase = PHASES[this.host.game.state.phaseIndex];
    this.sceneFacts.Set("关卡", phase ? phase.label : "装载中", this.loading ? "warn" : "");
    this.sceneFacts.Set("可破坏 / 承重", stats ? `${stats.destructible} / ${stats.structural}` : "—");
    this.sceneFacts.Set("受损 / 破口", stats ? `${stats.damaged} / ${stats.breaches}` : "—");
    this.sceneFacts.Set("shader 活跃体积", stats ? `${stats.activeVolumes} / ${this.destruction.uniforms.maxVolumes}` : "—");
    this.sceneFacts.Set("常驻残骸", stats ? stats.rubble : "—");
    this.sceneFacts.Set("拓扑重建", stats ? stats.topologyRebuilds : "—");
    this.sceneFacts.Set("最近结果", this.message,
      this.lastResult && (this.lastResult.broken || this.lastResult.protected) ? "warn" : "");

    if (!this.target || !this.target.box) {
      this.targetFacts.Set("目标", "准心未命中");
      this.targetFacts.Set("材质", "—");
      this.targetFacts.Set("耐久", "—");
      return;
    }
    const box = this.target.box;
    if (box.tag === "dirt") {
      this.targetFacts.Set("目标", "解析地表");
      this.targetFacts.Set("材质", "地表 · 仅作为爆心");
      this.targetFacts.Set("规则", "范围爆破影响附近构件");
      this.targetFacts.Set("耐久", "不适用");
      this.targetFacts.Set("尺寸", "连续地形");
      this.targetFacts.Set("距离", `${Number(this.target.distance || 0).toFixed(1)} m`);
      return;
    }
    const profile = this.destruction.Profile(box);
    const state = this.destruction.damage.get(box);
    const half = HalfOf(box);
    this.targetFacts.Set("目标", box.tag || "未命名");
    this.targetFacts.Set("材质", `${profile.label} · ${profile.id}`,
      profile.destructible ? "good" : "warn");
    this.targetFacts.Set("规则", profile.destructible ? "可破坏" : "承重保护");
    this.targetFacts.Set("耐久", state
      ? `${Math.max(0, state.health - state.damage).toFixed(0)} / ${state.health.toFixed(0)} · 阶段 ${state.stage}`
      : (box.destroyed ? "已形成破口" : `${Number.isFinite(profile.health) ? profile.health.toFixed(0) : "∞"} / ${Number.isFinite(profile.health) ? profile.health.toFixed(0) : "∞"}`));
    this.targetFacts.Set("尺寸", `${(half[0] * 2).toFixed(2)} × ${(half[1] * 2).toFixed(2)} × ${(half[2] * 2).toFixed(2)} m`);
    this.targetFacts.Set("距离", `${Number(this.target.distance || 0).toFixed(1)} m`);
  }

  Update(dt) {
    this.host.flycam.Update(dt);
    if (this.field && this.host.game.state.ready && this.boundField !== this.field) this.BindWorld();
    this.destruction.Update(this.host.camera.position);
    this.hoverTimer -= dt;
    const viewport = this.host.viewport;
    if (this.hoverTimer <= 0 && viewport && viewport.over && !viewport.dragging && !this.loading) {
      const hit = this.Pick(viewport.x, viewport.y, this.action === "blast");
      if (hit) this.target = hit;
      this.hoverTimer = 0.08;
      this.RefreshGizmos();
    }
    this.RefreshFacts();
    this.host.SetHint(this.message);
  }
}

export default DestructionEditor;
