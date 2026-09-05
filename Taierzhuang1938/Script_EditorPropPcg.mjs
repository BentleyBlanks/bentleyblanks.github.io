// 工事 / 生活用具 PCG 编辑器：在当前真实关卡里调 volume、规则与种子，实时重跑
// Script_PropPcg，并用正片 ExternalProps 模型预览结果。面板数据只存 localStorage；
// 导出后誊回 Data_PropPcg 才会进入正式布设。
//
// 正片已有 PCG 根在进入时暂时隐藏，避免预览模型与正式实例重叠闪烁；退出完整还原。
// 编辑器预览允许逐件 clone（玩法暂停、几十件量级），正式运行仍只走 PropBatcher 的
// InstancedMesh / StaticDrawUsage 桶。面板同时显示正片 live bucket 与实例数，优化取证
// 不靠猜。

import * as THREE from "three";
import {
  Panel, Section, Row, ButtonRow, Slider, Chips, Toggle, Select, ListBox,
  Facts, Note, TextArea, El, CameraProjectionControls,
} from "./Script_EditorUi.mjs";
import { PickWorld, ScreenRay } from "./Script_EditorStage.mjs";
import { MarkNoPrepass } from "./Script_Post.mjs";
import { MakeRoadPath } from "./Script_RoadPath.mjs";
import {
  PROP_PCG_DOCUMENT, PROP_PCG_PROFILE_OPTIONS, PROP_PCG_PROFILES,
} from "./Data_PropPcg.mjs";
import {
  GeneratePropPcg, NormalizePropPcgDocument, PropPcgSummary, ValidatePropPcgDocument,
} from "./Script_PropPcg.mjs";
import {
  BasePlacements, ExternalPropCatalog, InstantiateExternalProp,
} from "./Script_ExternalProps.mjs";
import { TownDressingFor } from "./Script_TownDressing.mjs";

const STORE_KEY = "tengxian1938_propPcg_v2";
const DEFAULT_FAR = 2200;
const DEFAULT_FOV = 55;
const PROFILE_COLOR = {
  householdLife: 0x60c8a2, defenseSupport: 0xe0a455,
  defenseFiringLine: 0xe26f52, defenseWireLine: 0xd6b552,
};

function Clone(value) { return JSON.parse(JSON.stringify(value)); }

function Clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

function PhaseFor(game) {
  const state = game.state || {};
  const index = Number.isInteger(state.builtPhase) ? state.builtPhase : state.phaseIndex;
  return game.PHASES?.[index] || null;
}

function VolumeCenter(volume) {
  const bounds = volume.bounds;
  return { x: (bounds.minX + bounds.maxX) / 2, z: (bounds.minZ + bounds.maxZ) / 2 };
}

function SplineBounds(points, padding = 4) {
  const xs = points.map((point) => Number(point[0]));
  const zs = points.map((point) => Number(point[1]));
  return {
    minX: Math.min(...xs) - padding, maxX: Math.max(...xs) + padding,
    minZ: Math.min(...zs) - padding, maxZ: Math.max(...zs) + padding,
  };
}

function MakeInput(value, onInput) {
  const input = El("input");
  input.type = "text";
  input.value = value;
  input.maxLength = 48;
  for (const type of ["keydown", "keyup", "keypress"]) {
    input.addEventListener(type, (event) => event.stopPropagation());
  }
  input.addEventListener("input", () => onInput(input.value));
  return input;
}

export class PropPcgEditor {
  static id = "propPcg";
  static label = "PCG 撒点";
  static hint = "按院落/矩形/样条规则自动布设生活用具与工事，并取证 GPU 实例桶";

  constructor(host) {
    this.host = host;
    this.cameraMode = "fly";
    this.document = Clone(PROP_PCG_DOCUMENT);
    this.selectedId = this.document.volumes[0]?.id || null;
    this.catalog = ExternalPropCatalog();
    this.assetIds = this.catalog.map((entry) => entry.id);
    this.previewRoot = new THREE.Group();
    this.previewRoot.name = "EditorPropPcgPreview";
    this.panel = null;
    this.result = null;
    this.realModels = true;
    this.showVolumes = true;
    this.showPoints = true;
    this.hiddenRuntimeRoots = [];
    this.owned = [];
    this.previewToken = 0;
    this.refreshTimer = 0;
    this.nextVolume = 1;
  }

  get field() { return this.host.game.battlefield; }
  get selected() { return this.document.volumes.find((entry) => entry.id === this.selectedId) || null; }

  Enter(root) {
    this.host.flycam.Open();
    this.host.camera.far = Math.max(DEFAULT_FAR, this.host.camera.far);
    this.host.camera.fov = DEFAULT_FOV;
    this.host.camera.updateProjectionMatrix();
    this.host.SetViewmodelVisible(false);
    this.host.scene.add(this.previewRoot);
    this.HideRuntimeProps();
    this.Restore();
    this.panel = Panel({
      title: "生活用具 / 工事 PCG 编辑器",
      sub: "WASD+QE 飞 · 固定种子 · 真实碰撞裁决",
      variant: "work wide", onClose: () => this.host.Close(),
    });
    root.appendChild(this.panel.root);
    this.BuildUi(this.panel.body);
    this.RefreshPreview();
    return this;
  }

  Exit() {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.previewToken += 1;
    this.ClearPreview();
    this.host.scene.remove(this.previewRoot);
    for (const entry of this.hiddenRuntimeRoots) entry.root.visible = entry.visible;
    this.hiddenRuntimeRoots.length = 0;
    this.host.flycam.Close();
    this.host.SetViewmodelVisible(true);
    this.panel?.root.remove();
    this.panel = null;
  }

  HideRuntimeProps() {
    this.hiddenRuntimeRoots.length = 0;
    for (const child of this.host.scene.children) {
      if (!child.userData?.externalProps) continue;
      this.hiddenRuntimeRoots.push({ root: child, visible: child.visible });
      child.visible = false;
    }
  }

  BuildUi(body) {
    const volumes = Section(body, "撒点区");
    this.volumeList = ListBox(volumes, { height: 170, onPick: (id) => this.SelectVolume(id) });
    this.FillVolumeList();
    ButtonRow(volumes, [
      { label: "准心处新建 40m 区", onClick: () => this.AddAtView() },
      { label: "准心处新建 40m 工事线", onClick: () => this.AddSplineAtView() },
      { label: "复制所选", onClick: () => this.DuplicateSelected() },
      { label: "删除所选", onClick: () => this.DeleteSelected(), cls: "danger" },
    ]);

    this.ruleSection = Section(body, "所选区规则");
    this.BuildRuleUi();

    const preview = Section(body, "预览与相机");
    const toggles = El("div", "edBtns");
    preview.appendChild(toggles);
    Toggle(toggles, "真实构件", this.realModels, (value) => { this.realModels = value; this.RefreshPreview(); });
    Toggle(toggles, "撒点区框", this.showVolumes, (value) => { this.showVolumes = value; this.RefreshPreview(); });
    Toggle(toggles, "落点标记", this.showPoints, (value) => { this.showPoints = value; this.RefreshPreview(); });
    ButtonRow(preview, [
      { label: "重跑 PCG", onClick: () => this.RefreshPreview() },
      { label: "俯瞰当前切片", onClick: () => this.TopDown() },
      { label: "看所选区", onClick: () => this.FrameSelected() },
    ]);
    CameraProjectionControls(preview, this.host.camera, { farMax: 5000 });

    const evidence = Section(body, "规则与 GPU 取证");
    this.facts = Facts(evidence, ["PCG 结果", "拒绝原因"]);
    this.status = Note(evidence, "");

    const io = Section(body, "存取 / 交付");
    ButtonRow(io, [
      { label: "存到本地", onClick: () => this.Save() },
      { label: "读回", onClick: () => this.Restore(true) },
      { label: "导出 JSON", onClick: () => { this.io.value = JSON.stringify(this.document, null, 2); } },
      { label: "导入 JSON", onClick: () => this.Import(this.io.value) },
      { label: "恢复源码默认", onClick: () => this.Reset(), cls: "danger" },
    ]);
    this.io = TextArea(io, { rows: 5, placeholder: "{ \"version\":2, \"seed\":…, \"volumes\":[…] }" });
    this.ioNote = Note(io, "");
  }

  FillVolumeList() {
    if (!this.volumeList) return;
    this.volumeList.Fill(this.document.volumes.map((entry) => ({
      id: entry.id, name: entry.label,
      tail: `${entry.enabled === false ? "关 · " : ""}`
        + ({ cells: "院落", rect: "矩形", spline: "样条" }[entry.shape] || entry.shape),
      title: `${entry.profile} · ${entry.id}`,
    })));
    if (!this.selected && this.document.volumes.length) this.selectedId = this.document.volumes[0].id;
    this.volumeList.Select(this.selectedId);
  }

  SelectVolume(id) {
    this.selectedId = id;
    this.volumeList.Select(id);
    this.BuildRuleUi();
    this.RefreshPreview();
  }

  BuildRuleUi() {
    const box = this.ruleSection;
    if (!box) return;
    box.innerHTML = "";
    const volume = this.selected;
    if (!volume) { Note(box, "点击准心处新建撒点区。"); return; }
    Row(box, "名称", MakeInput(volume.label, (value) => {
      volume.label = value.slice(0, 48) || volume.id;
      this.FillVolumeList();
    }));
    Select(box, "规则组", PROP_PCG_PROFILE_OPTIONS, volume.profile, (value) => {
      volume.profile = value;
      this.RequestRefresh();
    });
    const stateRow = El("div", "edBtns");
    box.appendChild(stateRow);
    Toggle(stateRow, "启用", volume.enabled !== false, (value) => {
      volume.enabled = value;
      this.FillVolumeList();
      this.RequestRefresh();
    });
    Chips(stateRow, [
      { value: "cells", label: "院落格" }, { value: "rect", label: "矩形散布" },
      { value: "spline", label: "样条工事" },
    ], volume.shape, (value) => {
      volume.shape = value;
      if (value === "spline" && (!Array.isArray(volume.points) || volume.points.length < 2)) {
        const center = VolumeCenter(volume);
        volume.points = [[center.x - 20, center.z], [center.x + 20, center.z]];
        volume.bounds = SplineBounds(volume.points);
        volume.profile = "defenseFiringLine";
      }
      this.BuildRuleUi();
      this.FillVolumeList();
      this.RequestRefresh();
    });
    if (volume.shape === "spline") {
      const pathInput = TextArea(box, { rows: 3, placeholder: "[[x,z],[x,z],…]" });
      pathInput.value = JSON.stringify(volume.points || []);
      pathInput.addEventListener("change", () => {
        try {
          const points = JSON.parse(pathInput.value);
          if (!Array.isArray(points) || points.length < 2 || points.some((point) => (
            !Array.isArray(point) || point.length < 2
            || !Number.isFinite(Number(point[0])) || !Number.isFinite(Number(point[1]))
          ))) throw new Error("至少两个有限 XZ 控制点");
          volume.points = points.slice(0, 32).map((point) => [Number(point[0]), Number(point[1])]);
          volume.bounds = SplineBounds(volume.points);
          pathInput.value = JSON.stringify(volume.points);
          this.RequestRefresh();
        } catch (error) {
          this.host.SetHint(`控制点错误：${String(error).slice(0, 100)}`);
        }
      });
      Slider(box, { label: "模块间隔", min: 0.75, max: 40, step: 0.05, value: volume.spacing ?? 3.2,
        format: (v) => `${v.toFixed(2)} m`, onInput: (v) => { volume.spacing = v; this.RequestRefresh(); } });
      Slider(box, { label: "起点退让", min: 0, max: 30, step: 0.1, value: volume.startInset ?? 0,
        format: (v) => `${v.toFixed(1)} m`, onInput: (v) => { volume.startInset = v; this.RequestRefresh(); } });
      Slider(box, { label: "终点退让", min: 0, max: 30, step: 0.1, value: volume.endInset ?? 0,
        format: (v) => `${v.toFixed(1)} m`, onInput: (v) => { volume.endInset = v; this.RequestRefresh(); } });
      Slider(box, { label: "侧向偏移", min: -12, max: 12, step: 0.1, value: volume.sideOffset ?? 0,
        format: (v) => `${v.toFixed(1)} m`, onInput: (v) => { volume.sideOffset = v; this.RequestRefresh(); } });
      Slider(box, { label: "侧向抖动", min: 0, max: 3, step: 0.02, value: volume.sideJitter ?? 0,
        format: (v) => `${v.toFixed(2)} m`, onInput: (v) => { volume.sideJitter = v; this.RequestRefresh(); } });
      Slider(box, { label: "沿线抖动", min: 0, max: 3, step: 0.02, value: volume.alongJitter ?? 0,
        format: (v) => `${v.toFixed(2)} m`, onInput: (v) => { volume.alongJitter = v; this.RequestRefresh(); } });

    } else {
      const center = VolumeCenter(volume);
      const width = volume.bounds.maxX - volume.bounds.minX;
      const depth = volume.bounds.maxZ - volume.bounds.minZ;
      const SetBounds = (cx, cz, w, d) => {
        volume.bounds = { minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 };
        this.RequestRefresh();
      };
      let currentX = center.x, currentZ = center.z, currentW = width, currentD = depth;
      Slider(box, { label: "中心 X", min: -1800, max: 1800, step: 1, value: center.x,
        format: (v) => `${v.toFixed(0)} m`, onInput: (v) => { currentX = v; SetBounds(currentX, currentZ, currentW, currentD); } });
      Slider(box, { label: "中心 Z", min: -1800, max: 1800, step: 1, value: center.z,
        format: (v) => `${v.toFixed(0)} m`, onInput: (v) => { currentZ = v; SetBounds(currentX, currentZ, currentW, currentD); } });
      Slider(box, { label: "宽", min: 4, max: 900, step: 1, value: width,
        format: (v) => `${v.toFixed(0)} m`, onInput: (v) => { currentW = v; SetBounds(currentX, currentZ, currentW, currentD); } });
      Slider(box, { label: "深", min: 4, max: 900, step: 1, value: depth,
        format: (v) => `${v.toFixed(0)} m`, onInput: (v) => { currentD = v; SetBounds(currentX, currentZ, currentW, currentD); } });
    }
    if (volume.shape === "cells") {
      Slider(box, { label: "院落命中率", min: 0, max: 1, step: 0.01, value: volume.chance,
        format: (v) => `${(v * 100).toFixed(0)}%`, onInput: (v) => { volume.chance = v; this.RequestRefresh(); } });
      Slider(box, { label: "最多生活组", min: 0, max: 64, step: 1, value: volume.maxAnchors,
        format: (v) => `${v.toFixed(0)} 组`, onInput: (v) => { volume.maxAnchors = Math.round(v); this.RequestRefresh(); } });
    } else if (volume.shape === "rect") {
      Slider(box, { label: "目标组数", min: 0, max: 64, step: 1, value: volume.count,
        format: (v) => `${v.toFixed(0)} 组`, onInput: (v) => { volume.count = Math.round(v); this.RequestRefresh(); } });
      Slider(box, { label: "固定朝向", min: 0, max: Math.PI * 2, step: 0.02,
        value: Number.isFinite(volume.axisYaw) ? volume.axisYaw : 0,
        format: (v) => `${(v * 180 / Math.PI).toFixed(0)}°`,
        onInput: (v) => { volume.axisYaw = v; this.RequestRefresh(); } });
    }
    if (volume.shape !== "spline") {
      Slider(box, { label: "边界退让", min: 0, max: 12, step: 0.1, value: volume.inset,
        format: (v) => `${v.toFixed(1)} m`, onInput: (v) => { volume.inset = v; this.RequestRefresh(); } });
      Slider(box, { label: "组间距", min: 0, max: 40, step: 0.5, value: volume.minSpacing,
        format: (v) => `${v.toFixed(1)} m`, onInput: (v) => { volume.minSpacing = v; this.RequestRefresh(); } });
    }
    Slider(box, { label: "种子偏移", min: 0, max: 4096, step: 1, value: volume.seedOffset,
      format: (v) => v.toFixed(0), onInput: (v) => { volume.seedOffset = Math.round(v); this.RequestRefresh(); } });
    const profile = PROP_PCG_PROFILES[volume.profile];

  }

  Context() {
    const field = this.field;
    const phase = PhaseFor(this.host.game);
    const phaseId = phase?.fieldFrom || phase?.id;
    const fixed = [
      ...(BasePlacements()[phaseId] || []),
      ...TownDressingFor(field?.bounds),
      ...(field?.generatedExternalProps || []),
    ];
    return {
      bounds: field?.bounds || null,
      cells: field?.city?.cells || [],
      blockers: field?.propPcgBlockers || [],
      fixedPlacements: fixed,
      groundAt: field?.GroundHeight ? (x, z) => field.GroundHeight(x, z) : () => 0,
      assetIds: this.assetIds,
    };
  }

  RequestRefresh() {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(() => { this.refreshTimer = 0; this.RefreshPreview(); }, 90);
  }

  async RefreshPreview() {
    const token = ++this.previewToken;
    this.ClearPreview();
    const context = this.Context();
    this.result = GeneratePropPcg(this.document, context);
    if (this.showVolumes) this.BuildVolumeLines(context.groundAt);
    if (this.showPoints) this.BuildPointMarkers(context.groundAt);
    this.RefreshFacts();
    if (!this.realModels || this.result.errors.length) return;
    const models = await Promise.all(this.result.placements.map(async (placement) => ({
      placement, root: await InstantiateExternalProp(placement.asset, this.host.library),
    })));
    if (token !== this.previewToken) return;
    for (const { placement, root } of models) {
      if (!root) continue;
      root.name = `PcgPreview_${placement.asset}`;
      root.position.set(placement.x, context.groundAt(placement.x, placement.z), placement.z);
      root.rotation.y = placement.ry || 0;
      root.scale.setScalar(placement.scale || 1);
      this.previewRoot.add(root);
    }
    this.RefreshFacts();
  }

  ClearPreview() {
    for (const child of [...this.previewRoot.children]) this.previewRoot.remove(child);
    for (const resource of this.owned) resource.dispose?.();
    this.owned.length = 0;
  }

  BuildVolumeLines(groundAt) {
    for (const volume of this.document.volumes) {
      if (volume.enabled === false) continue;
      let points = [];
      let loop = true;
      if (volume.shape === "spline") {
        try {
          const path = MakeRoadPath(volume.points);
          points = path.Dense(3);
          loop = false;
        } catch (error) { continue; }
      } else {
        const b = volume.bounds;
        points = [[b.minX, b.minZ], [b.maxX, b.minZ], [b.maxX, b.maxZ], [b.minX, b.maxZ]];
      }
      const geometry = new THREE.BufferGeometry().setFromPoints(points.map(([x, z]) => (
        new THREE.Vector3(x, groundAt(x, z) + 0.22, z)
      )));
      const material = MarkNoPrepass(new THREE.LineBasicMaterial({
        color: PROFILE_COLOR[volume.profile] || 0xffffff,
        transparent: true, opacity: volume.id === this.selectedId ? 1 : 0.48,
        depthTest: false,
      }));
      const line = loop ? new THREE.LineLoop(geometry, material) : new THREE.Line(geometry, material);
      line.renderOrder = 920;
      line.userData.skipNormalDepth = true;
      this.previewRoot.add(line);
      this.owned.push(geometry, material);
    }
  }

  BuildPointMarkers(groundAt) {
    for (const profileId of Object.keys(PROP_PCG_PROFILES)) {
      const entries = this.result.placements.filter((entry) => entry.pcgProfile === profileId);
      if (!entries.length) continue;
      const geometry = new THREE.SphereGeometry(0.20, 7, 5);
      const material = MarkNoPrepass(new THREE.MeshBasicMaterial({
        color: PROFILE_COLOR[profileId] || 0xffffff, depthTest: false,
      }));
      const mesh = new THREE.InstancedMesh(geometry, material, entries.length);
      const matrix = new THREE.Matrix4();
      for (let index = 0; index < entries.length; index += 1) {
        const entry = entries[index];
        matrix.makeTranslation(entry.x, groundAt(entry.x, entry.z) + 0.34, entry.z);
        mesh.setMatrixAt(index, matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
      mesh.frustumCulled = true;
      mesh.renderOrder = 930;
      mesh.userData.skipNormalDepth = true;
      this.previewRoot.add(mesh);
      this.owned.push(geometry, material);
    }
  }

  RefreshFacts() {
    if (!this.facts || !this.result) return;
    const stats = this.result.stats;
    const runtime = this.field?.externalStreamer?.Stats?.() || null;
    const rejected = Object.entries(stats.rejected).filter(([, count]) => count)
      .map(([reason, count]) => `${reason}:${count}`).join(" · ") || "0";
    let previewMeshes = 0;
    this.previewRoot.traverse((node) => { if (node.isMesh) previewMeshes += 1; });
    this.facts.Set("PCG 结果", PropPcgSummary(this.result), this.result.errors.length ? "bad" : "good");
    this.facts.Set("拒绝原因", rejected);
    this.facts.Set("当前 profile", Object.entries(stats.byProfile).map(([id, count]) => `${id}:${count}`).join(" · ") || "无");
    this.facts.Set("编辑器真实模型", this.realModels ? `${previewMeshes} 个网格节点` : "关闭");
    this.facts.Set("正片视觉策略", "距离流送 + GPU InstancedMesh", "good");
    this.facts.Set("正片 live", runtime ? `${runtime.live}/${runtime.registered} 件` : "未接入");
    this.facts.Set("正片实例桶", runtime?.batch
      ? `${runtime.batch.instances} 实例 / ${runtime.batch.liveBuckets} live buckets / ${runtime.batch.buckets} reserved`
      : "无运行时统计", runtime?.batch?.overflow ? "bad" : "good");
    this.facts.Set("buffer overflow", runtime?.batch?.overflow ?? 0, runtime?.batch?.overflow ? "bad" : "good");
    this.status.textContent = this.result.errors.length
      ? this.result.errors.join("；") : "规则合法；编辑器改动尚未写入正式数据。";
  }

  PickCenter() {
    const rect = this.host.canvas.getBoundingClientRect();
    const direction = ScreenRay(this.host.camera, this.host.canvas,
      rect.left + rect.width / 2, rect.top + rect.height / 2);
    return PickWorld(this.field, this.host.camera.position, direction, {
      maxDist: Math.max(400, this.host.camera.far), solids: false,
    });
  }

  AddAtView() {
    const hit = this.PickCenter();
    if (!hit) { this.host.SetHint("准心没有落到地面，先把镜头压低"); return; }
    let id = "";
    do { id = `PcgVolume${this.nextVolume++}`; }
    while (this.document.volumes.some((entry) => entry.id === id));
    this.document.volumes.push({
      id, label: `新撒点区 ${this.nextVolume - 1}`, enabled: true,
      profile: "householdLife", shape: "rect",
      bounds: { minX: hit.x - 20, maxX: hit.x + 20, minZ: hit.z - 20, maxZ: hit.z + 20 },
      seedOffset: this.nextVolume * 101, chance: 0.16, count: 5, maxAnchors: 12,
      attemptsPerAnchor: 30, inset: 1.5, minSpacing: 6, axisYaw: null, exclusions: [],
    });
    this.selectedId = id;
    this.FillVolumeList();
    this.BuildRuleUi();
    this.RefreshPreview();
  }

  AddSplineAtView() {
    const hit = this.PickCenter();
    if (!hit) { this.host.SetHint("准心没有落到地面，先把镜头压低"); return; }
    let id = "";
    do { id = `PcgSpline${this.nextVolume++}`; }
    while (this.document.volumes.some((entry) => entry.id === id));
    const direction = new THREE.Vector3();
    this.host.camera.getWorldDirection(direction);
    direction.y = 0;
    if (direction.lengthSq() < 1e-4) direction.set(1, 0, 0); else direction.normalize();
    const points = [
      [hit.x - direction.x * 20, hit.z - direction.z * 20],
      [hit.x + direction.x * 20, hit.z + direction.z * 20],
    ];
    this.document.volumes.push({
      id, label: `新工事线 ${this.nextVolume - 1}`, enabled: true,
      profile: "defenseFiringLine", shape: "spline", bounds: SplineBounds(points), points,
      seedOffset: this.nextVolume * 101, spacing: 3.2, startInset: 1.5, endInset: 1.5,
      sideOffset: 0, sideJitter: 0.12, alongJitter: 0.16, minSpacing: 0, exclusions: [],
    });
    this.selectedId = id;
    this.FillVolumeList();
    this.BuildRuleUi();
    this.RefreshPreview();
  }

  DuplicateSelected() {
    const source = this.selected;
    if (!source) return;
    const copy = Clone(source);
    let suffix = 2;
    do { copy.id = `${source.id}Copy${suffix++}`; }
    while (this.document.volumes.some((entry) => entry.id === copy.id));
    copy.label = `${source.label} 副本`;
    copy.bounds.minX += 8; copy.bounds.maxX += 8;
    copy.bounds.minZ += 8; copy.bounds.maxZ += 8;
    if (copy.shape === "spline") copy.points = copy.points.map((point) => [point[0] + 8, point[1] + 8]);
    copy.seedOffset += 97;
    this.document.volumes.push(copy);
    this.selectedId = copy.id;
    this.FillVolumeList();
    this.BuildRuleUi();
    this.RefreshPreview();
  }

  DeleteSelected() {
    const index = this.document.volumes.findIndex((entry) => entry.id === this.selectedId);
    if (index < 0) return;
    this.document.volumes.splice(index, 1);
    this.selectedId = this.document.volumes[Math.min(index, this.document.volumes.length - 1)]?.id || null;
    this.FillVolumeList();
    this.BuildRuleUi();
    this.RefreshPreview();
  }

  FrameSelected() {
    const volume = this.selected;
    if (!volume) return;
    const center = VolumeCenter(volume);
    const span = Math.max(volume.bounds.maxX - volume.bounds.minX, volume.bounds.maxZ - volume.bounds.minZ, 20);
    this.host.camera.position.set(center.x, Math.max(20, span * 0.9), center.z + span * 0.35);
    this.host.flycam.yaw = 0;
    this.host.flycam.pitch = -1.18;
  }

  TopDown() {
    const bounds = this.field?.bounds || { minX: -320, maxX: 320, minZ: -320, maxZ: 320 };
    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerZ = (bounds.minZ + bounds.maxZ) / 2;
    const span = Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ);
    this.host.camera.position.set(centerX, Math.max(180, span * 0.95), centerZ + span * 0.07);
    this.host.flycam.yaw = 0;
    this.host.flycam.pitch = -1.5;
    this.host.camera.far = Math.max(this.host.camera.far, span * 2.2);
    this.host.camera.updateProjectionMatrix();
  }

  OnClick(event, button) {
    if (button !== 0) return;
    const direction = ScreenRay(this.host.camera, this.host.canvas, event.clientX, event.clientY);
    const hit = PickWorld(this.field, this.host.camera.position, direction, {
      maxDist: Math.max(400, this.host.camera.far), solids: false,
    });
    if (!hit) return;
    let best = null, bestDistance = Infinity;
    for (const volume of this.document.volumes) {
      const center = VolumeCenter(volume);
      const distance = Math.hypot(hit.x - center.x, hit.z - center.z);
      if (distance < bestDistance) { best = volume; bestDistance = distance; }
    }
    if (best) this.SelectVolume(best.id);
  }

  Save() {
    localStorage.setItem(STORE_KEY, JSON.stringify(this.document));
    this.ioNote.textContent = `已存：${this.document.volumes.length} 个撒点区 · ${new Date().toLocaleTimeString()}`;
  }

  Restore(refresh = false) {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) {
      if (refresh && this.ioNote) this.ioNote.textContent = "没有本地 PCG 试调存档。";
      return false;
    }
    try {
      const document = NormalizePropPcgDocument(JSON.parse(raw));
      const errors = ValidatePropPcgDocument(document, { assetIds: this.assetIds });
      if (errors.length) throw new Error(errors.join("；"));
      this.document = document;
      this.selectedId = document.volumes[0]?.id || null;
      if (this.volumeList) { this.FillVolumeList(); this.BuildRuleUi(); }
      if (refresh) this.RefreshPreview();
      return true;
    } catch (error) {
      if (this.ioNote) this.ioNote.textContent = `读回失败：${String(error).slice(0, 180)}`;
      return false;
    }
  }

  Import(text) {
    try {
      const document = NormalizePropPcgDocument(JSON.parse(text));
      const errors = ValidatePropPcgDocument(document, { assetIds: this.assetIds });
      if (errors.length) throw new Error(errors.join("；"));
      this.document = document;
      this.selectedId = document.volumes[0]?.id || null;
      this.FillVolumeList();
      this.BuildRuleUi();
      this.RefreshPreview();
      this.ioNote.textContent = `已导入 ${document.volumes.length} 个撒点区（尚未存本地）`;
    } catch (error) {
      this.ioNote.textContent = `导入失败：${String(error).slice(0, 180)}`;
    }
  }

  Reset() {
    localStorage.removeItem(STORE_KEY);
    this.document = Clone(PROP_PCG_DOCUMENT);
    this.selectedId = this.document.volumes[0]?.id || null;
    this.FillVolumeList();
    this.BuildRuleUi();
    this.RefreshPreview();
    this.ioNote.textContent = "已恢复源码默认；本地试调存档已清除。";
  }

  Update(dt) {
    this.host.flycam.Update(dt);
    if (this.host.viewmodel?.root?.visible) this.host.SetViewmodelVisible(false);
  }
}

export default PropPcgEditor;
