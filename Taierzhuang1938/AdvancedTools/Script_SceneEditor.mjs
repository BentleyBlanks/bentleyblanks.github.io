// 场景编辑器（docs/Data_Scene.md §6）：SceneEditor.html 的主程序。
//
// 读 Scenes/<Id>/Scene_<Id>.json + 高度图，自己起一个轻量三维视图（不起游戏）：地形按高度色带 + 地面涂色 + 米格线，
// 编辑视口按材质分批画布设，正式预览按需使用同页的游戏渲染器。点选、拖箭头移动、拖金圈转、检视面板改数值，
// 改动全走 Script_SceneEditModel（带撤销）。存盘：本机预览走 /__scene/save（带版本号，对不上 409），线上只能下载。
// 场景文件被人 / agent 在外面改了：没改动就 2 s 内自动重读，有改动就挂横幅让人选。
//
// 只给开发用，面板文字不走文本表（项目契约 10 的开发者面板例外）。

import * as THREE from "three";
import { SCENE_ASSETS, SCENE_CATEGORIES, SCENE_LIST, SCENE_MATERIALS, SceneInfo } from "../Data_SceneAssets.mjs";
import { SCENE_IDS, SceneDir, SceneFileName, DecodeSceneHeights, FlatSceneHeights, IsFlatTerrain, FormatSceneJson, IsSceneCamera, SceneStyle } from "../Script_SceneDoc.mjs";
import { SceneEditModel, SplitGroup } from "./Script_SceneEditModel.mjs";
import {
  HeightGridSampler, BlockoutTintColor, BuildGroundPaint, BackdropGroundSampler, BuildSceneGroundSurface, SceneTrenchDressing,
} from "../Script_EditorBlockoutLevels.mjs";
import {
  DecodeTrenchDatum, CompileSceneTrenches, CarveSceneHeights, GridSampler, TrenchGroup, SegmentReachBounds, UnionBounds,
} from "../Script_SceneTrenches.mjs";
import { CompileSceneAirWalls } from "../Script_SceneAirWalls.mjs";
import { CarveSceneCraters, CompileSceneCraterField } from "../Script_SceneCraters.mjs";
import { TRENCH_PRESETS } from "../Script_TrenchPlan.mjs";
import { TRENCH_DETAILS, TRENCH_LOOKS, EffectiveTrenchDetail } from "../Data_TrenchDetails.mjs";
import { MISSION_LAYOUT } from "../Data_FirstLevelMissionLayout.mjs";
import { ApplyPatches } from "../Script_MaterialPatches.mjs";
import { MakeWhiteboxGridPatch } from "../Script_WhiteboxGrid.mjs";
import { BuildContinuousWaterGeometry } from "../Script_WaterGeometry.mjs";
import { WHITEBOX_MATERIAL } from "../Data_Tuning_WhiteboxMaterial.mjs";
import { ENCOUNTER_DEFAULT_VARIANT_ID, ENCOUNTER_VARIANTS } from "../Data_EncounterVariants.mjs";
import { ApplyEditorLiteCameraProfile } from "../Script_CameraProfile.mjs";
import { SceneEditorEnvironment } from "./Script_SceneEditorEnvironment.mjs";

export const SCENE_EDITOR = Object.freeze({
  pollMs: 2000,
  terrainMaxVerts: 900000,
  near: 0.1, far: 9000, fov: 55,
  flyMps: 14, fastMul: 4, lookRadPerPx: 0.0032,
  grid: WHITEBOX_MATERIAL,   // 米格线与灰表面：同白盒编辑器
  sky: "#adb8c2", fog: [900, 6500],
  snapM: 0.5, snapDeg: 15,
  gizmoScreen: 0.12,
  treeLimit: 400, searchLimit: 500,
  dragPx: 4,
});
const E = SCENE_EDITOR;
const DEG = Math.PI / 180;
const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------------------------------------- 小工具

async function Sha1Hex(buffer) {
  const digest = await crypto.subtle.digest("SHA-1", buffer);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
}

function El(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

function HexInt(value, fallback = parseInt(WHITEBOX_MATERIAL.surfaceColor.slice(1), 16)) {
  if (typeof value === "number") return value;
  if (typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)) return parseInt(value.slice(1), 16);
  return fallback;
}

const Inside = (r, x, z) => r && x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ;
const Fixed = (v, n = 2) => (Number.isFinite(v) ? v.toFixed(n) : "—");
const StageName = /^\d{2}[–-]\d{2}/;

// ---------------------------------------------------------------------------------------------- 编辑器

class SceneEditorApp {
  constructor() {
    const params = new URLSearchParams(location.search);
    this.sceneId = params.get("scene") || SCENE_IDS[0];
    if (!SCENE_IDS.includes(this.sceneId)) this.sceneId = SCENE_IDS[0];
    this.initialSelect = params.get("select") || null;
    this.style = SceneStyle(this.sceneId);
    this.previewParam = SceneInfo(this.sceneId)?.previewParam;
    this.model = null;
    this.writable = false;
    this.revision = null;
    this.show = { backdrop: true, hidden: false };
    this.showInherited = true;
    this.showInheritBounds = true;
    this.inherited = null;
    this.inheritedTerrain = null;
    this.inheritedSelected = null;
    this.inheritedObjectCount = 0;
    this.sceneFilterCat = "all";
    this.layers = [];
    this.where = new Map();          // id → { layer, index }
    this.open = new Set();           // 层级里展开的文件夹（路径），记在本机
    this.hiddenStages = new Set();
    this.LoadOpen();
    this.LoadFolds();                // 检视里各节折叠没有，记在本机
    this.terrainLook = "tint";       // 地面现在怎么画：tint 高度色带 + 米格线；layers 正式场景的分层地表
    this.terrainTokens = {};
    this.terrainPackPromises = new Map();
    this.drag = null;
    this.keys = new Set();
    this.cam = { pos: new THREE.Vector3(), yaw: 0, pitch: -0.5 };
    this.viewMode = "free";
    this.showShotGizmo = true;
    this.cameraSelected = false;
    this.toastTimer = 0;
    this.ready = new Promise((resolve) => { this.Resolve = resolve; });
  }

  // ------------------------------------------------------------------ 起来

  async Start() {
    this.BuildThree();
    this.BindUi();
    await this.CheckWritable();
    await this.LoadScene({ keepCamera: false });
    this.Resolve(true);
    setInterval(() => this.Poll(), E.pollMs);
    requestAnimationFrame((t) => this.Tick(t));
  }

  BuildThree() {
    const canvas = $("seCanvas");
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1));
    ApplyEditorLiteCameraProfile(this.renderer);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(E.fov, 1, E.near, E.far);
    this.camera.rotation.order = "YXZ";
    this.environment = new SceneEditorEnvironment(this.renderer, this.scene);
    this.world = new THREE.Group();
    this.scene.add(this.world);
    this.inheritedGroup = new THREE.Group();
    this.inheritedGroup.name = "SceneEditor_InheritedNorth";
    this.scene.add(this.inheritedGroup);
    this.inheritedOverlayGroup = new THREE.Group();
    this.inheritedOverlayGroup.name = "SceneEditor_InheritedBounds";
    this.scene.add(this.inheritedOverlayGroup);
    this.selectionLines = new THREE.Group();
    this.scene.add(this.selectionLines);
    this.BuildGizmo();
    this.shotCamera = new THREE.PerspectiveCamera(E.fov, 16 / 9, .2, 3.5);
    this.shotHelper = new THREE.CameraHelper(this.shotCamera);
    this.shotHelper.name = "SceneEditor_ReferenceCamera";
    this.shotHelper.material.depthTest = false;
    this.shotHelper.material.toneMapped = false;
    this.shotHelper.renderOrder = 23;
    this.shotHelper.visible = false;
    this.scene.add(this.shotHelper);
    this.geometry = {
      box: new THREE.BoxGeometry(1, 1, 1),
      sphere: new THREE.SphereGeometry(0.5, 14, 10),
      cone: new THREE.ConeGeometry(0.5, 1, 8),
    };
    this.edges = new THREE.EdgesGeometry(this.geometry.box);
    this.edgeMaterial = new THREE.LineBasicMaterial({ color: 0xedca83, depthTest: false, transparent: true, opacity: 0.95, toneMapped: false });
    this.inheritedEdgeMaterial = new THREE.LineBasicMaterial({ color: 0x72cae8, depthTest: false, transparent: true, opacity: 0.95, toneMapped: false });
    new ResizeObserver(() => this.Resize()).observe(canvas.parentElement);
    this.Resize();
  }

  Resize() {
    const box = this.canvas.parentElement.getBoundingClientRect();
    const w = Math.max(1, Math.floor(box.width)), h = Math.max(1, Math.floor(box.height));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  async CheckWritable() {
    try {
      const response = await fetch("/__scene/status", { cache: "no-store" });
      const status = response.ok ? await response.json() : null;
      this.writable = !!status?.writable;
      this.writeReason = status?.reason || (status ? "" : "线上（GitHub Pages）没有存盘口，只能下载");
    } catch {
      this.writable = false;
      this.writeReason = "没有本机存盘口，只能下载";
    }
  }

  async FetchScene() {
    const url = new URL(`../${SceneDir(this.sceneId)}/${SceneFileName(this.sceneId)}`, location.href);
    const response = await fetch(`${url.href}?t=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`场景读不到（HTTP ${response.status}）`);
    const bytes = await response.arrayBuffer();
    const doc = JSON.parse(new TextDecoder().decode(bytes));
    return { doc, revision: await Sha1Hex(bytes), stamp: this.StampOf(response), url };
  }

  StampOf(response) {
    const h = response.headers;
    return h.get("etag") || h.get("last-modified") || h.get("content-length") || null;
  }

  async LoadScene({ keepCamera = true } = {}) {
    this.Status("正在读取场景…");
    const { doc, revision, stamp, url } = await this.FetchScene();
    const terrainKey = JSON.stringify([doc.terrain, doc.trenches?.datum || null]);
    if (!this.pre || terrainKey !== this.terrainKey) {
      if (IsFlatTerrain(doc.terrain)) {
        this.pre = FlatSceneHeights(doc.terrain);
      } else {
        const heightUrl = new URL(doc.terrain.file, url);
        const response = await fetch(`${heightUrl.href}?t=${Date.now()}`, { cache: "no-store" });
        if (!response.ok) throw new Error(`高度图读不到（HTTP ${response.status}）`);
        // 高度图存的是沟没挖之前的地面；壕沟按 trenches 现挖进 this.heights（docs/Data_Scene.md §9）
        this.pre = DecodeSceneHeights(await response.arrayBuffer(), doc.terrain);
      }
      this.datum = [];
      if (doc.trenches?.datum?.file) {
        const datumResponse = await fetch(`${new URL(doc.trenches.datum.file, url).href}?t=${Date.now()}`, { cache: "no-store" });
        if (!datumResponse.ok) throw new Error(`壕沟基准面读不到（HTTP ${datumResponse.status}）`);
        this.datum = DecodeTrenchDatum(doc.trenches.datum, await datumResponse.arrayBuffer());
      }
      this.preSampler = GridSampler(doc.terrain, this.pre);
      this.terrainKey = terrainKey;
    }
    this.revision = revision;
    this.stamp = stamp;
    if (this.model) this.model.Load(doc);
    else this.model = new SceneEditModel(doc);
    if (!doc.camera) { this.viewMode = "free"; this.cameraSelected = false; }
    this.CarveAll();
    this.lookKey = null;
    this.Rebuild();
    await this.SyncInheritedPreview();
    if (!keepCamera) {
      const targetId = this.initialSelect;
      this.initialSelect = null;
      if (targetId && this.model.Find(targetId)) {
        this.SelectIds([targetId]);
        this.Frame([targetId]);
      } else this.Home();
    }
    await this.environment.LoadForScene(this.sceneId, this.camera.position);
    this.RenderTree();
    this.RenderInspector();
    this.SyncPreviewControls();
    if (this.previewFrame) this.StartFormalPreview();
    this.UpdateDirty();
    const statusParts = [
      `${doc.title}：${doc.objects.length} 个物件${this.inherited ? `（另含 ${this.inheritedObjectCount} 个只读继承物件）` : ""}`,
      this.writable ? "本机预览，能直接保存" : this.writeReason,
    ].filter(Boolean);
    this.Status(statusParts.join(" · "));
  }

  // ------------------------------------------------------------------ 地形与物件

  Rebuild() {
    const doc = this.model.doc;
    const lookKey = JSON.stringify([this.terrainKey, this.carveRev, doc.look, doc.paint?.length, doc.backdrop?.ground]);
    if (lookKey !== this.lookKey) { this.BuildTerrain(); this.lookKey = lookKey; }
    this.RebuildObjects();
    this.BuildTrenchLines();
    this.BuildTrenchDressing();
  }

  DisposeGroup(group) {
    const shared = new Set([this.geometry.box, this.geometry.sphere, this.geometry.cone, this.edges]);
    group.traverse((child) => {
      if (child.isInstancedMesh) child.dispose?.();
      if (child.geometry && !shared.has(child.geometry)) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
        else child.material.dispose();
      }
    });
    group.clear();
  }

  ClearInheritedPreview() {
    this.DisposeGroup(this.inheritedGroup);
    this.DisposeGroup(this.inheritedOverlayGroup);
    this.inherited = null;
    this.inheritedTerrain = null;
    this.inheritedSelected = null;
    this.inheritedObjectCount = 0;
  }

  SyncContextLinks() {
    const link = $("seEncounterLink");
    if (!link) return;
    const matched = ENCOUNTER_VARIANTS.find((v) => v.scene === this.sceneId);
    if (matched) {
      link.href = `./Tool_LevelFlow.html${matched.id === ENCOUNTER_DEFAULT_VARIANT_ID ? "" : `?variant=${encodeURIComponent(matched.id)}`}`;
      link.target = "";
      link.rel = "";
      link.textContent = "遭遇设计 ↗";
      link.title = `在遭遇设计编辑器打开：${matched.title}`;
      link.hidden = false;
      return;
    }
    const info = SceneInfo(this.sceneId);
    if (info?.runParam) {
      link.href = `../index.html?${encodeURIComponent(info.runParam)}=1`;
      link.target = "_blank";
      link.rel = "noopener";
      link.textContent = "运行测试场 ↗";
      link.title = `在新标签页启动测试场（?${info.runParam}=1）`;
      link.hidden = false;
      return;
    }
    link.hidden = true;
  }

  SyncInheritedUi() {
    const note = $("seInheritNote");
    if (!note) return;
    if (!this.inherited) {
      note.hidden = true;
      note.open = false;
      return;
    }
    const { info, baseDoc, objects, trenchSegments } = this.inherited;
    const baseInfo = SceneInfo(info.scene);
    $("seInheritLabel").textContent = `继承 z<${info.maxZ}`;
    const meta = $("seInheritMeta");
    meta.textContent = "";
    meta.append(
      document.createTextNode(`北段继承自「${baseInfo?.title || baseDoc.title || info.scene}」`),
      El("small", "", `${info.scene} · z < ${info.maxZ} m · ${objects.length} 物件${trenchSegments.length ? ` · ${trenchSegments.length} 段壕沟` : ""}`),
    );
    $("seToggleInherited").checked = this.showInherited;
    $("seToggleInheritBounds").checked = this.showInheritBounds;
    note.hidden = false;
  }

  RebuildInheritedObjects() {
    if (!this.inherited) return;
    if (this.inherited.objectGroup) {
      this.inheritedGroup.remove(this.inherited.objectGroup);
      this.DisposeGroup(this.inherited.objectGroup);
      this.inherited.objectGroup = null;
    }
    const { baseDoc, objects, sampler, info } = this.inherited;
    const visible = [];
    const groups = new Map();
    const Push = (obj) => {
      if (obj.layer === "backdrop" && !this.show.backdrop) return;
      if (obj.visual === false && !this.show.hidden) return;
      visible.push(obj);
      const key = this.LayerKey(obj);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(obj);
    };
    for (const obj of objects) Push(obj);
    if (this.show.hidden && baseDoc?.airWalls?.length) {
      const ownAirIds = new Set((this.model.doc.airWalls || []).map((w) => w.id));
      const northSplines = baseDoc.airWalls.filter((w) => !ownAirIds.has(w.id) && w.points?.every((p) => p[1] < info.maxZ));
      for (const obj of CompileSceneAirWalls(northSplines, { groundAt: sampler })) Push(obj);
    }
    this.inherited.visibleObjects = visible;
    const objGroup = new THREE.Group();
    objGroup.name = "SceneEditor_InheritedObjects";
    const matrix = new THREE.Matrix4(), color = new THREE.Color();
    for (const [key, list] of groups) {
      if (key === "box:Whitebox/Water") {
        const mesh = this.BuildWaterMesh(list, key, baseDoc, sampler, this.inherited);
        mesh.name = `SceneEditor_Inherited_${key}`;
        objGroup.add(mesh);
        continue;
      }
      const kind = key.startsWith("bd:") ? key.slice(3) : "box";
      const geometry = kind === "backdropBlob" || kind === "backdropHill" ? this.geometry.sphere
        : kind === "backdropTree" || key === "tree" ? this.geometry.cone : this.geometry.box;
      const mesh = new THREE.InstancedMesh(geometry, this.MakeLayerMaterial(key, baseDoc), list.length);
      mesh.frustumCulled = false;
      mesh.name = `SceneEditor_Inherited_${key}`;
      list.forEach((obj, i) => {
        mesh.setMatrixAt(i, this.Matrix(obj, matrix, this.inherited));
        if (key.startsWith("bd:")) {
          const p = obj.params || {};
          color.setHex(HexInt(kind === "backdropTree" ? "#5a5446" : p.color, 0x8a8370), THREE.SRGBColorSpace);
          mesh.setColorAt(i, color);
        }
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      objGroup.add(mesh);
    }
    this.inherited.objectGroup = objGroup;
    this.inheritedGroup.add(objGroup);
  }

  BuildInheritedTrenches() {
    if (!this.inherited) return;
    if (this.inherited.trenchGroup) {
      this.inheritedGroup.remove(this.inherited.trenchGroup);
      this.DisposeGroup(this.inherited.trenchGroup);
      this.inherited.trenchGroup = null;
    }
    const { baseDoc, sampler, bounds, trenchPlan, trenchSegments, objects } = this.inherited;
    if (!trenchPlan || !trenchSegments.length) return;
    const group = new THREE.Group();
    group.name = "SceneEditor_InheritedTrenches";
    const northSegIds = new Set(trenchSegments.map((s) => s.id));
    const northPlan = { ...trenchPlan, segments: trenchPlan.segments.filter((s) => northSegIds.has(s.id)) };
    const keep = objects.filter((o) => o.layer !== "backdrop" && o.solid !== false && o.tag !== "airWall" && o.size)
      .map((o) => ({ x: o.pos[0], z: o.pos[2], w: o.size[0], d: o.size[2], h: o.size[1], ry: (o.yawDeg || 0) * DEG, solid: true }));
    const { blocks } = SceneTrenchDressing(northPlan, sampler, keep, bounds);
    if (blocks.length) {
      const bySemantic = new Map();
      for (const b of blocks) { if (!bySemantic.has(b.semantic)) bySemantic.set(b.semantic, []); bySemantic.get(b.semantic).push(b); }
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
      for (const [semantic, list] of bySemantic) {
        const mesh = new THREE.InstancedMesh(this.geometry.box,
          new THREE.MeshStandardMaterial({ color: this.SemanticColor(semantic, baseDoc), roughness: 0.9, transparent: true, opacity: 0.85 }), list.length);
        list.forEach((b, i) => { m.compose(new THREE.Vector3(b.x, b.y, b.z), q.setFromAxisAngle(up, b.ry || 0), new THREE.Vector3(b.w, b.h, b.d)); mesh.setMatrixAt(i, m); });
        mesh.frustumCulled = false;
        group.add(mesh);
      }
    }
    const Lift = (x, z, up) => new THREE.Vector3(x, (Inside(bounds, x, z) ? sampler(x, z) : 0) + up, z);
    for (const seg of trenchSegments) {
      const compiled = northPlan.segments.find((s) => s.id === seg.id);
      const pts = compiled ? compiled.path.points : seg.points;
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pts.map(([x, z]) => Lift(x, z, 0.25))),
        new THREE.LineBasicMaterial({ color: 0xc98a4b, depthTest: false, transparent: true, opacity: 0.6, toneMapped: false }),
      );
      line.renderOrder = 25;
      group.add(line);
    }
    this.inherited.trenchGroup = group;
    this.inheritedGroup.add(group);
  }

  /** 只用分界线与外圈细虚线标示继承范围，不对地图画面置灰或降对比。 */
  BuildInheritedBoundsOverlay() {
    this.DisposeGroup(this.inheritedOverlayGroup);
    if (!this.inherited) return;
    const { info, bounds, sampler } = this.inherited;
    const { minX, maxX, minZ } = bounds;
    const maxZ = info.maxZ;
    const At = (x, z, up = 0.32) => new THREE.Vector3(x, sampler(x, z) + up, z);

    // 1. z = maxZ 主分界虚线
    const seamPts = [];
    for (let x = minX; x <= maxX; x += 4) seamPts.push(At(x, maxZ));
    if (seamPts.length && seamPts[seamPts.length - 1].x !== maxX) seamPts.push(At(maxX, maxZ));
    const seamLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(seamPts),
      new THREE.LineDashedMaterial({ color: 0x76cde8, dashSize: 3.5, gapSize: 2, depthTest: false, transparent: true, opacity: 0.92, toneMapped: false }),
    );
    seamLine.computeLineDistances();
    seamLine.renderOrder = 24;
    this.inheritedOverlayGroup.add(seamLine);

    // 2. 沿分界线每隔 40 m 画向北（-Z）的地面小箭头，一眼看出哪一侧是继承北段
    const chevronPts = [];
    for (let x = Math.ceil((minX + 16) / 40) * 40; x <= maxX - 16; x += 40) {
      const tip = At(x, maxZ - 5.5, 0.36);
      const left = At(x - 3.2, maxZ - 1.4, 0.36);
      const right = At(x + 3.2, maxZ - 1.4, 0.36);
      chevronPts.push(left, tip, right, tip);
    }
    if (chevronPts.length) {
      const chevrons = new THREE.LineSegments(
        new THREE.BufferGeometry().setFromPoints(chevronPts),
        new THREE.LineBasicMaterial({ color: 0x76cde8, depthTest: false, transparent: true, opacity: 0.85, toneMapped: false }),
      );
      chevrons.renderOrder = 24;
      this.inheritedOverlayGroup.add(chevrons);
    }

    // 3. 继承区域外围淡细框（西 / 北 / 东三边），远眺全图也能看清继承范围
    const outerPts = [];
    for (let z = maxZ; z >= minZ; z -= 16) outerPts.push(At(minX, z, 0.4));
    outerPts.push(At(minX, minZ, 0.4));
    for (let x = minX + 16; x <= maxX; x += 16) outerPts.push(At(x, minZ, 0.4));
    outerPts.push(At(maxX, minZ, 0.4));
    for (let z = minZ + 16; z <= maxZ; z += 16) outerPts.push(At(maxX, z, 0.4));
    outerPts.push(At(maxX, maxZ, 0.4));
    const outerLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(outerPts),
      new THREE.LineDashedMaterial({ color: 0x76cde8, dashSize: 6, gapSize: 5, depthTest: false, transparent: true, opacity: 0.42, toneMapped: false }),
    );
    outerLine.computeLineDistances();
    outerLine.renderOrder = 23;
    this.inheritedOverlayGroup.add(outerLine);
    this.inheritedOverlayGroup.visible = this.showInheritBounds;
  }

  async SyncInheritedPreview() {
    this.ClearInheritedPreview();
    this.SyncContextLinks();
    const inherit = this.model?.doc?.inherit;
    if (!inherit) {
      this.SyncInheritedUi();
      return;
    }
    this.inheritedGroup.visible = this.showInherited;
    this.inheritedOverlayGroup.visible = this.showInheritBounds;
    try {
      const baseUrl = new URL(`../${SceneDir(inherit.scene)}/${SceneFileName(inherit.scene)}`, location.href);
      const res = await fetch(`${baseUrl.href}?t=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) return;
      const baseDoc = await res.json();
      let basePre;
      if (IsFlatTerrain(baseDoc.terrain)) {
        basePre = FlatSceneHeights(baseDoc.terrain);
      } else {
        const hRes = await fetch(`${new URL(baseDoc.terrain.file, baseUrl).href}?t=${Date.now()}`, { cache: "no-store" });
        if (!hRes.ok) return;
        basePre = DecodeSceneHeights(await hRes.arrayBuffer(), baseDoc.terrain);
      }
      let baseDatum = [];
      if (baseDoc.trenches?.datum?.file) {
        const dRes = await fetch(`${new URL(baseDoc.trenches.datum.file, baseUrl).href}?t=${Date.now()}`, { cache: "no-store" });
        if (dRes.ok) baseDatum = DecodeTrenchDatum(baseDoc.trenches.datum, await dRes.arrayBuffer());
      }
      const bt = baseDoc.terrain;
      const splitRow = Math.min(bt.rows, Math.max(1, Math.round((inherit.maxZ - bt.minZ) / bt.cellM)));
      const northPlan = CompileSceneTrenches(baseDoc.trenches, { datum: baseDatum, pre: GridSampler(bt, basePre) });
      let carved = CarveSceneHeights(bt, basePre, northPlan);
      const ownCraterIds = new Set((this.model.doc.craters || []).map((c) => c.id));
      const excludeCraterIds = new Set(inherit.excludeIds || []);
      const northCraters = (baseDoc.craters || []).filter((c) => !ownCraterIds.has(c.id) && !excludeCraterIds.has(c.id) && c.z < inherit.maxZ);
      const northCraterField = northCraters.length ? CompileSceneCraterField(northCraters) : null;
      if (northCraterField) {
        const protect = northPlan ? (x, z) => { const c = northPlan.Corridor(x, z); return !!(c && c.d < c.halfFloor + c.bank * 0.72); } : null;
        carved = CarveSceneCraters(bt, carved, northCraters, { protect });
      }
      const northSampler = HeightGridSampler({ ...bt, heights: carved });
      const step = Math.max(1, Math.ceil(Math.sqrt(((bt.cols + 1) * (splitRow + 1)) / E.terrainMaxVerts)));
      const nx = Math.floor(bt.cols / step), nz = Math.floor(splitRow / step);
      const positions = new Float32Array((nx + 1) * (nz + 1) * 3);
      const colors = new Float32Array(positions.length);
      const tint = baseDoc.look?.heightTint || { lo: northSampler.minY, hi: Math.max(northSampler.minY + 0.5, northSampler.maxY) };
      const flatColor = typeof baseDoc.look?.groundColor === "string" ? new THREE.Color().setHex(HexInt(baseDoc.look.groundColor), THREE.SRGBColorSpace) : null;
      const paint = BuildGroundPaint(baseDoc.paint, baseDoc.bounds);
      const rgb = [0, 0, 0], cr = [0, 0, 0, 0], col = new THREE.Color();
      let k = 0;
      for (let iz = 0; iz <= nz; iz++) {
        const gz = iz === nz ? splitRow : iz * step;
        for (let ix = 0; ix <= nx; ix++) {
          const gx = ix === nx ? bt.cols : ix * step;
          const x = bt.minX + gx * bt.cellM, z = bt.minZ + gz * bt.cellM, y = carved[gz * (bt.cols + 1) + gx];
          positions[k] = x; positions[k + 1] = y; positions[k + 2] = z;
          if (flatColor && !paint && !northCraterField) {
            colors[k] = flatColor.r; colors[k + 1] = flatColor.g; colors[k + 2] = flatColor.b;
          } else {
            BlockoutTintColor(y, tint, rgb);
            if (paint) paint.Blend(x, z, rgb);
            if (northCraterField) {
              northCraterField.SampleSurface(x, z, cr);
              if (cr[1] > 0.02) {
                const mix = Math.min(0.85, cr[1] * 0.8);
                const tr = 0.36 - cr[2] * 0.18 - cr[3] * cr[0] * 0.08;
                const tg = 0.31 - cr[2] * 0.16 - cr[3] * cr[0] * 0.06;
                const tb = 0.25 - cr[2] * 0.14 - cr[3] * cr[0] * 0.02;
                rgb[0] += (tr - rgb[0]) * mix; rgb[1] += (tg - rgb[1]) * mix; rgb[2] += (tb - rgb[2]) * mix;
              }
            }
            col.setRGB(rgb[0], rgb[1], rgb[2], THREE.SRGBColorSpace);
            colors[k] = col.r; colors[k + 1] = col.g; colors[k + 2] = col.b;
          }
          k += 3;
        }
      }
      const index = new Uint32Array(nx * nz * 6);
      let n = 0;
      for (let iz = 0; iz < nz; iz++) {
        for (let ix = 0; ix < nx; ix++) {
          const a = iz * (nx + 1) + ix, b = a + 1, c = a + nx + 1, e = c + 1;
          index[n++] = a; index[n++] = c; index[n++] = b;
          index[n++] = b; index[n++] = c; index[n++] = e;
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      geo.setIndex(new THREE.BufferAttribute(index, 1));
      geo.computeVertexNormals();
      const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
      ApplyPatches(mat, [MakeWhiteboxGridPatch(E.grid)]);
      this.environment.AttachMaterial(mat);
      const northTerrain = new THREE.Mesh(geo, mat);
      northTerrain.name = "SceneEditor_InheritedTerrain";
      this.inheritedTerrain = northTerrain;
      this.inheritedGroup.add(northTerrain);

      const ownIds = new Set(this.model.objects.map((o) => o.id));
      const excludeIds = new Set(inherit.excludeIds || []);
      const northObjects = (baseDoc.objects || []).filter((o) =>
        !ownIds.has(o.id) && !excludeIds.has(o.id) && (!o.pos || o.pos[2] < inherit.maxZ));
      const ownSegIds = new Set(this.model.trenchSegments.map((s) => s.id));
      const northTrenchSegments = (baseDoc.trenches?.segments || []).filter((s) =>
        !ownSegIds.has(s.id) && s.points.every((pt) => pt[1] < inherit.maxZ));
      const northBackdropAt = baseDoc.backdrop
        ? BackdropGroundSampler(baseDoc.backdrop, northSampler, baseDoc.backdrop.siteBounds || baseDoc.bounds, inherit.scene)
        : null;

      this.inheritedObjectCount = northObjects.length;
      this.inherited = {
        info: inherit,
        doc: baseDoc,
        baseDoc,
        sampler: northSampler,
        backdropAt: northBackdropAt,
        bounds: { minX: bt.minX, maxX: bt.minX + bt.cols * bt.cellM, minZ: bt.minZ, maxZ: inherit.maxZ },
        objects: northObjects,
        objectMap: new Map(northObjects.map((o) => [o.id, o])),
        visibleObjects: [],
        trenchPlan: northPlan,
        trenchSegments: northTrenchSegments,
        objectGroup: null,
        trenchGroup: null,
      };

      this.RebuildInheritedObjects();
      this.BuildInheritedTrenches();
      this.BuildInheritedBoundsOverlay();
      this.SyncInheritedUi();

      if (this.style === "formal" || this.model.doc.look?.terrainLayers || baseDoc.look?.terrainLayers) {
        this.DressTerrainMesh(northTerrain, {
          doc: baseDoc, sceneId: inherit.scene, sampler: northSampler, trenchPlan: northPlan, craterField: northCraterField, tokenKey: "inherited",
          setName: baseDoc.look?.terrainLayers || this.model.doc.look?.terrainLayers || MISSION_LAYOUT.ground.terrainLayers,
        });
      }
    } catch (error) {
      console.warn("[SceneEditor] 继承北段预览读取失败", error);
      this.SyncInheritedUi();
    }
  }

  // ------------------------------------------------------------------ 壕沟（docs/Data_Scene.md §9）

  /** 整张地面按壕沟与弹坑重挖（读盘 / 重读时）。 */
  CarveAll() {
    const doc = this.model.doc;
    this.trenchPlan = CompileSceneTrenches(doc.trenches, { datum: this.datum, pre: this.preSampler });
    this.heights = CarveSceneHeights(doc.terrain, this.pre, this.trenchPlan);
    this.craterField = doc.craters?.length ? CompileSceneCraterField(doc.craters) : null;
    if (this.craterField) {
      const protect = this.trenchPlan ? (x, z) => {
        const c = this.trenchPlan.Corridor(x, z);
        return !!(c && c.d < c.halfFloor + c.bank * 0.72);
      } : null;
      this.heights = CarveSceneCraters(doc.terrain, this.heights, doc.craters, { protect });
    }
    this.sampler = HeightGridSampler({ ...doc.terrain, heights: this.heights });
    this.carvedTrenches = JSON.stringify(this.model.trenchSegments);
    this.carvedRev = this.model.trenchRev;
    this.carveRev = (this.carveRev || 0) + 1;
  }

  /**
   * 壕沟改过：重编网络，只重挖改动的段前后两次的影响范围，再重画地面。返回 "terrain"（地面变了）/ "details"（只改了
   * 细节、套餐、备注、分组：地面不动，只重摆构件）/ false（没改）。
   */
  Recarve() {
    if (this.carvedRev === this.model.trenchRev) return false;
    const doc = this.model.doc, before = this.trenchPlan;
    // 影响地面的写法：去掉只管样子的字段
    const Shape = (s) => { const { details, look, note, group, ...rest } = s; return JSON.stringify(rest); };
    const oldById = new Map(JSON.parse(this.carvedTrenches || "[]").map((s) => [s.id, Shape(s)]));
    const now = this.model.trenchSegments;
    const changed = new Set([...oldById.keys()].filter((id) => !now.some((s) => s.id === id)));
    for (const seg of now) if (oldById.get(seg.id) !== Shape(seg)) changed.add(seg.id);
    this.trenchPlan = CompileSceneTrenches(doc.trenches, { datum: this.datum, pre: this.preSampler });
    this.carvedTrenches = JSON.stringify(now);
    this.carvedRev = this.model.trenchRev;
    if (!changed.size) return "details";
    const ids = [...changed];
    // 沟与沟连着（弃土、三岔口），往外多放 4 m
    let region = UnionBounds(SegmentReachBounds(before, ids), SegmentReachBounds(this.trenchPlan, ids));
    if (region) {
      region = { minX: region.minX - 4, maxX: region.maxX + 4, minZ: region.minZ - 4, maxZ: region.maxZ + 4 };
      const t = doc.terrain, w = t.cols + 1;
      // 先把这一块退回没挖的，再按新网络挖
      for (let iz = Math.max(0, Math.floor((region.minZ - t.minZ) / t.cellM)); iz <= Math.min(t.rows, Math.ceil((region.maxZ - t.minZ) / t.cellM)); iz++) {
        const from = iz * w + Math.max(0, Math.floor((region.minX - t.minX) / t.cellM)), to = iz * w + Math.min(t.cols, Math.ceil((region.maxX - t.minX) / t.cellM));
        this.heights.set(this.pre.subarray(from, to + 1), from);
      }
      if (this.trenchPlan) CarveSceneHeights(t, this.pre, this.trenchPlan, { region, into: this.heights });
      if (doc.craters?.length) {
        const protect = this.trenchPlan ? (x, z) => {
          const c = this.trenchPlan.Corridor(x, z);
          return !!(c && c.d < c.halfFloor + c.bank * 0.72);
        } : null;
        CarveSceneCraters(t, this.heights, doc.craters, { region, into: this.heights, protect });
      }
    }
    this.carveRev++;
    return "terrain";
  }

  /**
   * 壕沟的构件（护壁、踏板、射击位、杂物：每段 details 开了的）照游戏里那份摆出来（Script_EditorBlockoutLevels.SceneTrenchDressing），
   * 画成半透明盒子，只看不选；土崖、土团、草根这些土面细节太重，只在游戏里画。
   */
  BuildTrenchDressing() {
    if (this.trenchDressing) { this.world.remove(this.trenchDressing); this.trenchDressing.traverse((o) => { if (o.isMesh) { o.dispose?.(); o.material.dispose(); } }); this.trenchDressing = null; }
    this.trenchDressingCount = 0;
    if (!this.trenchPlan) return;
    const keep = this.model.objects.filter((o) => this.StageVisible(o.group) && o.layer !== "backdrop" && o.solid !== false && o.tag !== "airWall" && o.size)
      .map((o) => ({ x: o.pos[0], z: o.pos[2], w: o.size[0], d: o.size[2], h: o.size[1], ry: (o.yawDeg || 0) * DEG, solid: true }));
    const hiddenTrenches = new Set(this.model.trenchSegments.filter((seg) => !this.StageVisible(TrenchGroup(seg))).map((seg) => seg.id));
    const plan = hiddenTrenches.size ? { ...this.trenchPlan, segments: this.trenchPlan.segments.filter((seg) => !hiddenTrenches.has(seg.id)) } : this.trenchPlan;
    const { blocks } = SceneTrenchDressing(plan, this.sampler, keep, this.model.doc.bounds);
    this.trenchDressingCount = blocks.length;
    if (!blocks.length) return;
    const group = new THREE.Group();
    group.name = "SceneEditor_TrenchDressing";
    const bySemantic = new Map();
    for (const b of blocks) { if (!bySemantic.has(b.semantic)) bySemantic.set(b.semantic, []); bySemantic.get(b.semantic).push(b); }
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    for (const [semantic, list] of bySemantic) {
      const mat = this.environment.AttachMaterial(new THREE.MeshStandardMaterial({ color: this.SemanticColor(semantic), roughness: 0.9, transparent: true, opacity: 0.85 }));
      const mesh = new THREE.InstancedMesh(this.geometry.box, mat, list.length);
      list.forEach((b, i) => { m.compose(new THREE.Vector3(b.x, b.y, b.z), q.setFromAxisAngle(up, b.ry || 0), new THREE.Vector3(b.w, b.h, b.d)); mesh.setMatrixAt(i, m); });
      mesh.frustumCulled = false;
      group.add(mesh);
    }
    this.trenchDressing = group;
    this.world.add(group);
  }

  /** 壕沟画成地面上方的线：没选中的土黄、选中的金色带控制点（透过沟壁也看得见）。拖点时 preview 给那一段的临时控制点。 */
  BuildTrenchLines(preview = null) {
    if (this.trenchLines) {
      this.scene.remove(this.trenchLines);
      this.trenchLines.traverse((o) => { if (o.geometry !== this.geometry.sphere) o.geometry?.dispose(); o.material?.dispose(); });
    }
    const group = new THREE.Group();
    group.name = "SceneEditor_Trenches";
    this.trenchLines = group;
    this.scene.add(group);
    const plan = this.trenchPlan, sel = this.model.trench;
    const Lift = (x, z, up) => new THREE.Vector3(x, (Inside(this.model.doc.bounds, x, z) ? this.sampler(x, z) : 0) + up, z);
    for (const seg of this.model.trenchSegments) {
      if (!this.StageVisible(TrenchGroup(seg))) continue;
      const selected = seg.id === sel;
      const compiled = plan?.segments.find((s) => s.id === seg.id);
      const pts = preview && selected ? preview : seg.points;
      const path = preview && selected || !compiled ? pts.map(([x, z]) => Lift(x, z, 0.25)) : compiled.path.points.map(([x, z]) => Lift(x, z, 0.25));
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(path),
        new THREE.LineBasicMaterial({ color: selected ? 0xedca83 : 0xc98a4b, depthTest: false, transparent: true, opacity: selected ? 1 : 0.75, toneMapped: false }));
      line.renderOrder = selected ? 26 : 25;
      group.add(line);
      if (!selected) continue;
      // 控制点折线 + 点
      const poly = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts.map(([x, z]) => Lift(x, z, 0.9))),
        new THREE.LineDashedMaterial({ color: 0xedca83, dashSize: 0.6, gapSize: 0.4, depthTest: false, transparent: true, opacity: 0.7, toneMapped: false }));
      poly.computeLineDistances();
      poly.renderOrder = 26;
      group.add(poly);
      pts.forEach(([x, z], i) => {
        const dot = new THREE.Mesh(this.geometry.sphere, new THREE.MeshBasicMaterial({
          color: i === this.model.trenchPoint ? 0xffffff : 0xedca83, depthTest: false, transparent: true, toneMapped: false }));
        dot.position.copy(Lift(x, z, 0.9));
        // 屏幕上大约一样大（离相机越远放得越大）
        dot.scale.setScalar(Math.max(0.15, Math.min(3, this.camera.position.distanceTo(dot.position) * 0.006)));
        dot.renderOrder = 27;
        group.add(dot);
      });
    }
  }

  /** 屏幕上离 (clientX, clientY) 最近的选中壕沟控制点（像素以内）。 */
  PickTrenchPoint(clientX, clientY, maxPx = 12) {
    const seg = this.model.FindTrench(this.model.trench);
    if (!seg) return null;
    const rect = this.canvas.getBoundingClientRect();
    let best = null, bestD = maxPx;
    seg.points.forEach(([x, z], i) => {
      const p = new THREE.Vector3(x, this.sampler(x, z) + 0.9, z).project(this.camera);
      if (p.z > 1) return;
      const d = Math.hypot(rect.left + (p.x + 1) / 2 * rect.width - clientX, rect.top + (1 - p.y) / 2 * rect.height - clientY);
      if (d < bestD) { bestD = d; best = i; }
    });
    return best;
  }

  /** 地面上这一点落在哪段沟里（沟沿外弃土也算）。 */
  TrenchAt(point) {
    const hit = point && this.trenchPlan?.Corridor(point.x, point.z);
    const seg = hit && this.model.FindTrench(hit.id);
    return seg && this.StageVisible(TrenchGroup(seg)) ? seg.id : null;
  }

  /** 选中壕沟后 Alt+点地面：在离点击处最近的那一截控制折线里插一个点。 */
  InsertTrenchPointAt(point) {
    const seg = this.model.FindTrench(this.model.trench);
    if (!seg || !point) return;
    let best = 0, bestD = Infinity;
    for (let i = 0; i < seg.points.length - 1; i++) {
      const [ax, az] = seg.points[i], [bx, bz] = seg.points[i + 1], dx = bx - ax, dz = bz - az;
      const t = Math.max(0, Math.min(1, ((point.x - ax) * dx + (point.z - az) * dz) / ((dx * dx + dz * dz) || 1)));
      const d = Math.hypot(point.x - ax - dx * t, point.z - az - dz * t);
      if (d < bestD) { bestD = d; best = i; }
    }
    // 离两头更近就接在端头外面
    const first = seg.points[0], last = seg.points[seg.points.length - 1];
    const dFirst = Math.hypot(point.x - first[0], point.z - first[1]), dLast = Math.hypot(point.x - last[0], point.z - last[1]);
    const after = bestD > 6 && dFirst < dLast ? -1 : bestD > 6 ? seg.points.length - 1 : best;
    this.model.InsertTrenchPoint(seg.id, after, point.x, point.z);
    this.AfterEdit(null);
  }

  SelectTrench(id, point = null) {
    this.cameraSelected = false;
    this.inheritedSelected = null;
    this.model.SelectTrench(id, point);
    const seg = this.model.FindTrench(id);
    if (seg) { const parts = SplitGroup(TrenchGroup(seg)); for (let i = 1; i <= parts.length; i++) this.open.add(parts.slice(0, i).join("/")); this.SaveOpen(); }
    this.revealPending = true;
    this.SyncSelectionLines();
    this.BuildTrenchLines();
    this.RenderTree();
    this.RenderInspector();
  }

  FrameTrench(id = this.model.trench) {
    const seg = this.model.FindTrench(id);
    if (!seg) return;
    const box = new THREE.Box3();
    for (const [x, z] of seg.points) box.expandByPoint(new THREE.Vector3(x, this.sampler(x, z), z));
    const center = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3()).length();
    this.LookAt(center, Math.max(14, size * 1.1), Math.min(-25, this.cam.pitch / DEG));
  }

  SemanticColor(semantic, doc = this.model.doc) {
    const own = doc?.look?.semanticColors?.[semantic];
    if (own) return HexInt(own);
    return HexInt(MISSION_LAYOUT.semanticColors?.[semantic]);
  }

  BuildTerrain() {
    if (this.terrain) { this.world.remove(this.terrain); this.terrain.geometry.dispose(); this.terrain.material.dispose(); }
    if (this.backdropGround) { this.world.remove(this.backdropGround); this.backdropGround.geometry.dispose(); this.backdropGround.material.dispose(); this.backdropGround = null; }
    const doc = this.model.doc, t = doc.terrain, h = this.heights;
    const step = Math.max(1, Math.ceil(Math.sqrt(((t.cols + 1) * (t.rows + 1)) / E.terrainMaxVerts)));
    const nx = Math.floor(t.cols / step), nz = Math.floor(t.rows / step);
    const positions = new Float32Array((nx + 1) * (nz + 1) * 3);
    const colors = new Float32Array(positions.length);
    const tint = doc.look?.heightTint || { lo: this.sampler.minY, hi: Math.max(this.sampler.minY + 0.5, this.sampler.maxY) };
    const flatColor = typeof doc.look?.groundColor === "string" ? new THREE.Color().setHex(HexInt(doc.look.groundColor), THREE.SRGBColorSpace) : null;
    const paint = BuildGroundPaint(doc.paint, doc.bounds);
    const craterField = this.craterField;
    const rgb = [0, 0, 0], cr = [0, 0, 0, 0], color = new THREE.Color();
    let k = 0;
    for (let iz = 0; iz <= nz; iz++) {
      for (let ix = 0; ix <= nx; ix++) {
        const gx = ix * step, gz = iz * step;
        const x = t.minX + gx * t.cellM, z = t.minZ + gz * t.cellM, y = h[gz * (t.cols + 1) + gx];
        positions[k] = x; positions[k + 1] = y; positions[k + 2] = z;
        if (flatColor && !paint && !craterField) {
          colors[k] = flatColor.r; colors[k + 1] = flatColor.g; colors[k + 2] = flatColor.b;
        } else {
          BlockoutTintColor(y, tint, rgb);
          if (paint) paint.Blend(x, z, rgb);
          if (craterField) {
            craterField.SampleSurface(x, z, cr);
            if (cr[1] > 0.02) {
              const mix = Math.min(0.85, cr[1] * 0.8);
              const tr = 0.36 - cr[2] * 0.18 - cr[3] * cr[0] * 0.08;
              const tg = 0.31 - cr[2] * 0.16 - cr[3] * cr[0] * 0.06;
              const tb = 0.25 - cr[2] * 0.14 - cr[3] * cr[0] * 0.02;
              rgb[0] += (tr - rgb[0]) * mix; rgb[1] += (tg - rgb[1]) * mix; rgb[2] += (tb - rgb[2]) * mix;
            }
          }
          color.setRGB(rgb[0], rgb[1], rgb[2], THREE.SRGBColorSpace);
          colors[k] = color.r; colors[k + 1] = color.g; colors[k + 2] = color.b;
        }
        k += 3;
      }
    }
    const index = new Uint32Array(nx * nz * 6);
    let n = 0;
    for (let iz = 0; iz < nz; iz++) {
      for (let ix = 0; ix < nx; ix++) {
        // 与 HeightGridSampler 同一条对角线：a-c-b、b-c-e
        const a = iz * (nx + 1) + ix, b = a + 1, c = a + nx + 1, e = c + 1;
        index[n++] = a; index[n++] = c; index[n++] = b;
        index[n++] = b; index[n++] = c; index[n++] = e;
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geometry.setIndex(new THREE.BufferAttribute(index, 1));
    geometry.computeVertexNormals();
    const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
    ApplyPatches(material, [MakeWhiteboxGridPatch(E.grid)]);
    this.environment.AttachMaterial(material);
    this.terrain = new THREE.Mesh(geometry, material);
    this.terrain.name = "SceneEditor_Terrain";
    this.world.add(this.terrain);
    this.terrainStep = step;
    this.terrainLook = "tint";
    if (this.style === "formal" || doc.look?.terrainLayers) this.terrainReady = this.DressFormalTerrain(this.terrain);

    const bd = doc.backdrop;
    this.backdropAt = bd ? BackdropGroundSampler(bd, this.sampler, bd.siteBounds || doc.bounds, this.sceneId) : null;
    if (bd?.ground) {
      const r = bd.ground.radiusM || 3000;
      const cx = (doc.bounds.minX + doc.bounds.maxX) / 2, cz = (doc.bounds.minZ + doc.bounds.maxZ) / 2;
      const plane = new THREE.Mesh(new THREE.CircleGeometry(r + 800, 48),
        this.environment.AttachMaterial(new THREE.MeshStandardMaterial({ color: HexInt(bd.ground.color), roughness: 1 })));
      plane.rotation.x = -Math.PI / 2;
      plane.position.set(cx, bd.ground.y - 0.6, cz);
      plane.name = "SceneEditor_BackdropGround";
      plane.visible = this.show.backdrop;
      this.backdropGround = plane;
      this.world.add(plane);
    }
  }

  async EnsureTerrainPack(setName) {
    if (this.terrainPack?.setName === setName) return this.terrainPack;
    if (!this.terrainPackPromises.has(setName)) {
      const load = (async () => {
        const { LoadTerrainLayers, CRATER_SCORCHED_LAYER } = await import("../Script_TerrainMaterial.mjs");
        const pack = await LoadTerrainLayers(setName, {
          anisotropy: this.renderer.capabilities.getMaxAnisotropy(), assetBase: new URL("../", location.href),
          extraLayers: [CRATER_SCORCHED_LAYER],
        });
        this.terrainPack = pack;
        return pack;
      })().catch((error) => {
        this.terrainPackPromises.delete(setName);
        throw error;
      });
      this.terrainPackPromises.set(setName, load);
    }
    return this.terrainPackPromises.get(setName);
  }

  /**
   * 正式场景（或带 look.terrainLayers 的场景）地面同游戏里那份：四层贴图（底土 / 车道 / 翻土 / 草茬），
   * 权重按涂色、路、沟、陡坡算（Script_EditorBlockoutLevels.BuildSceneGroundSurface），再叠加零采样器焦土弹坑。
   * 支持给本场景地面和继承北段地面共用同一套贴图包与着色器。
   */
  async DressTerrainMesh(mesh, { doc, sceneId, sampler, trenchPlan, craterField = undefined, tokenKey = "main", setName } = {}) {
    const token = (this.terrainTokens[tokenKey] = (this.terrainTokens[tokenKey] || 0) + 1);
    const targetName = setName || doc.look?.terrainLayers || MISSION_LAYOUT.ground.terrainLayers;
    try {
      const [{ MaterialLibrary }, { CreateTerrainMaterial }, { MakeMaterialShadingUniforms }, pack] = await Promise.all([
        import("../Script_Materials.mjs"),
        import("../Script_TerrainMaterial.mjs"),
        import("../Script_MaterialShading.mjs"),
        this.EnsureTerrainPack(targetName),
      ]);
      const expected = tokenKey === "main" ? this.terrain : this.inheritedTerrain;
      if (token !== this.terrainTokens[tokenKey] || mesh !== expected) return false;
      const cField = craterField !== undefined ? craterField : (doc.craters?.length ? CompileSceneCraterField(doc.craters) : null);
      const surface = BuildSceneGroundSurface({ ...doc, scene: sceneId, trenchPlan, craterField: cField }, sampler);
      const position = mesh.geometry.getAttribute("position"), n = position.count;
      const colors = new Float32Array(n * 3), layers = new Float32Array(n * 4), c = [1, 1, 1], w = [0, 0, 1, 1];
      const cratersAttr = cField ? new Float32Array(n * 4) : null, cr = [0, 0, 0, 0];
      const color = new THREE.Color();
      for (let i = 0; i < n; i++) {
        const px = position.getX(i), pz = position.getZ(i);
        surface(px, pz, c, w);
        color.setRGB(c[0], c[1], c[2], THREE.SRGBColorSpace).toArray(colors, i * 3);
        layers.set(w, i * 4);
        if (cratersAttr) {
          cField.SampleSurface(px, pz, cr);
          cratersAttr.set(cr, i * 4);
        }
      }
      mesh.geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      mesh.geometry.setAttribute("terrainLayers", new THREE.BufferAttribute(layers, 4));
      if (cratersAttr) mesh.geometry.setAttribute("terrainCrater", new THREE.BufferAttribute(cratersAttr, 4));
      if (!this.materialLibrary) {
        const shading = MakeMaterialShadingUniforms();
        shading.quality = {
          pomSteps: 0, pomRefine: 0, pomSelfShadow: false,
          detailNormal: false, microShadow: true, horizonOcclusion: true, skinSss: false,
        };
        this.materialLibrary = new MaterialLibrary(this.renderer, { shading });
      }
      const material = CreateTerrainMaterial(this.materialLibrary, pack, {
        quality: "medium", staticCraters: !!cField,
        name: tokenKey === "main" ? "SceneEditor_TerrainLayers" : "SceneEditor_InheritedTerrainLayers",
      });
      this.environment.AttachMaterial(material);
      mesh.material.dispose();
      mesh.material = material;
      if (tokenKey === "main") this.terrainLook = "layers";
      return true;
    } catch (error) {
      console.warn("[SceneEditor] 分层地表读不到", error);
      if (tokenKey === "main") this.Status("正式场景的分层地表贴图读不到，地面先按高度色带画", true);
      return false;
    }
  }

  DressFormalTerrain(mesh) {
    return this.DressTerrainMesh(mesh, {
      doc: this.model.doc, sceneId: this.sceneId, sampler: this.sampler, trenchPlan: this.trenchPlan, craterField: this.craterField, tokenKey: "main",
    });
  }

  /** y 为 null 的物件脚落在中心与四角最低的地面上（同 Script_EditorBlockoutLevels 的 GroundedBlock）。 */
  GroundY(obj, ctx = null) {
    const sampler = ctx?.sampler || this.sampler;
    const backdropAt = ctx ? ctx.backdropAt : this.backdropAt;
    const doc = ctx?.doc || this.model.doc;
    const [x, , z] = obj.pos;
    if (obj.layer === "backdrop") return backdropAt ? backdropAt(x, z) : (doc.backdrop?.ground?.y ?? 0);
    if (obj.params?.grounding === "conform") return sampler(x, z);
    const [w, , d] = obj.size || [0, 0, 0];
    const ry = (obj.yawDeg || 0) * DEG, c = Math.cos(ry), s = Math.sin(ry), hx = w / 2, hz = d / 2;
    let lowest = sampler(x, z);
    for (const [lx, lz] of [[-hx, -hz], [hx, -hz], [-hx, hz], [hx, hz]]) lowest = Math.min(lowest, sampler(x + lx * c + lz * s, z - lx * s + lz * c));
    return lowest;
  }

  BaseY(obj, ctx = null) { return obj.pos[1] === null ? this.GroundY(obj, ctx) : obj.pos[1]; }

  /** 物件的包围盒：中心、半尺寸、朝向（弧度）。远景的椭球 / 山 / 树也按盒子算（选它用）。 */
  Shape(obj, ctx = null) {
    const yaw = (obj.yawDeg || 0) * DEG;
    const p = obj.params || {};
    const base = this.BaseY(obj, ctx);
    const x = obj.pos[0], z = obj.pos[2];
    switch (SCENE_ASSETS[obj.asset]?.kind) {
      case "box": case "prop": { const [w, h, d] = obj.size; return { kind: "box", c: [x, base + h / 2, z], half: [w / 2, h / 2, d / 2], yaw }; }
      // 树：画成树高那么高的锥（碰撞是 size 那根树干）
      case "tree": { const h = obj.size[1]; return { kind: "cone", c: [x, base + h / 2, z], half: [h * 0.16, h / 2, h * 0.16], yaw }; }
      case "backdropBox": { const h = p.h || 3; return { kind: "box", c: [x, base + (p.lift || 0) + h / 2, z], half: [(p.w || 4) / 2, h / 2, (p.d || 4) / 2], yaw }; }
      case "backdropBlob": { const h = p.h || 8, rx = p.rx || 4, rz = p.rz || rx; return { kind: "sphere", c: [x, base + (p.lift || 0) + h / 2, z], half: [rx, h / 2, rz], yaw }; }
      case "backdropHill": { const h = p.h || 30, rx = p.rx || 200, rz = p.rz || rx; return { kind: "sphere", c: [x, base, z], half: [rx, h, rz], yaw }; }
      case "backdropTree": { const h = p.h || 10; return { kind: "cone", c: [x, base + h / 2, z], half: [h * 0.18, h / 2, h * 0.18], yaw }; }
      default: return { kind: "box", c: [x, base + 0.5, z], half: [0.5, 0.5, 0.5], yaw };
    }
  }

  Matrix(obj, out = new THREE.Matrix4(), ctx = null) {
    const s = this.Shape(obj, ctx);
    return out.compose(new THREE.Vector3(...s.c), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), s.yaw),
      new THREE.Vector3(s.half[0] * 2, s.half[1] * 2, s.half[2] * 2));
  }

  Visible(obj) {
    if (!this.StageVisible(obj.group)) return false;
    if (obj.layer === "backdrop") return this.show.backdrop;
    if (obj.visual === false) return this.show.hidden;
    return true;
  }

  LayerKey(obj) {
    if (obj.layer === "backdrop") return `bd:${SCENE_ASSETS[obj.asset]?.kind}`;
    if (obj.visual === false) return (obj.hideOn || obj.showOn) ? "ghostGate" : "ghost";
    const kind = SCENE_ASSETS[obj.asset]?.kind;
    if (kind === "tree") return "tree";
    if (kind === "prop") return `prop:${obj.asset}`;
    if (typeof obj.params?.color === "string") return `color:${obj.params.color.toLowerCase()}`;
    return `box:${obj.material}`;
  }

  MakeLayerMaterial(key, doc = this.model.doc) {
    if (key === "ghost") return new THREE.MeshBasicMaterial({ color: 0xd6604a, transparent: true, opacity: 0.24, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    if (key === "ghostGate") return new THREE.MeshBasicMaterial({ color: 0xf08c28, transparent: true, opacity: 0.30, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    if (key.startsWith("bd:")) return this.environment.AttachMaterial(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 }));
    if (key === "tree") return this.environment.AttachMaterial(new THREE.MeshStandardMaterial({ color: HexInt("#5a5446"), roughness: 1 }));
    if (key.startsWith("color:")) {
      const material = new THREE.MeshStandardMaterial({ color: HexInt(key.slice(6)), roughness: 0.9 });
      ApplyPatches(material, [MakeWhiteboxGridPatch(E.grid)]);
      return this.environment.AttachMaterial(material);
    }
    // 道具：按弹着表面的语义色画、提亮一档（只是预览，真样子是模型）
    if (key.startsWith("prop:")) {
      const material = new THREE.MeshStandardMaterial({ color: this.SemanticColor(SCENE_ASSETS[key.slice(5)]?.semantic, doc), roughness: 0.8 });
      material.color.multiplyScalar(1.25);
      return this.environment.AttachMaterial(material);
    }
    const material = new THREE.MeshStandardMaterial({ color: this.SemanticColor(SCENE_MATERIALS[key.slice(4)]?.semantic, doc), roughness: 0.95 });
    ApplyPatches(material, [MakeWhiteboxGridPatch(E.grid)]);
    return this.environment.AttachMaterial(material);
  }

  /** 水面物件（Whitebox/Water）按首尾相接的连续河道条带重建，消除刚性水盒在弯道与变宽处的缺口和台阶。 */
  BuildWaterGeometry(list, sampler, ctx = null) {
    const resolved = list.map((obj) => {
      if (!obj?.pos || obj.pos[1] !== null) return obj;
      return { ...obj, pos: [obj.pos[0], this.BaseY(obj, ctx), obj.pos[2]] };
    });
    return BuildContinuousWaterGeometry(resolved, sampler || null, {
      stepM: 2.0,
      across: 4,
      bankTuckM: 0.55,
    });
  }

  BuildWaterMesh(list, key, doc = this.model.doc, sampler = this.sampler, ctx = null) {
    const geometry = this.BuildWaterGeometry(list, sampler, ctx);
    const material = this.MakeLayerMaterial(key, doc);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false;
    mesh.userData.waterCount = list.length;
    return mesh;
  }

  RebuildObjects() {
    for (const layer of this.layers) {
      this.world.remove(layer.mesh);
      if (layer.isWaterSurface) layer.mesh.geometry.dispose();
      else layer.mesh.dispose?.();
      layer.mesh.material.dispose();
    }
    this.layers = [];
    this.where.clear();
    const groups = new Map();
    for (const obj of this.model.objects) {
      if (!this.Visible(obj)) continue;
      const key = this.LayerKey(obj);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(obj);
    }
    if (this.show.hidden && this.model.doc.airWalls?.length) {
      const compiled = CompileSceneAirWalls(this.model.doc.airWalls, { groundAt: this.sampler || null });
      for (const obj of compiled) {
        if (!this.StageVisible(obj.group)) continue;
        const key = this.LayerKey(obj);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(obj);
      }
    }
    const matrix = new THREE.Matrix4(), color = new THREE.Color();
    for (const [key, list] of groups) {
      if (key === "box:Whitebox/Water") {
        const mesh = this.BuildWaterMesh(list, key, this.model.doc, this.sampler);
        mesh.name = `SceneEditor_${key}`;
        const layer = { key, mesh, ids: [], objects: list, isWaterSurface: true };
        list.forEach((obj, i) => {
          if (!obj.meta?.airWallSpline) {
            layer.ids.push(obj.id);
            this.where.set(obj.id, { layer, index: i });
          } else {
            layer.ids.push(null);
          }
        });
        this.world.add(mesh);
        this.layers.push(layer);
        continue;
      }
      const kind = key.startsWith("bd:") ? key.slice(3) : "box";
      const geometry = kind === "backdropBlob" || kind === "backdropHill" ? this.geometry.sphere
        : kind === "backdropTree" || key === "tree" ? this.geometry.cone : this.geometry.box;
      const mesh = new THREE.InstancedMesh(geometry, this.MakeLayerMaterial(key), list.length);
      mesh.frustumCulled = false;
      mesh.name = `SceneEditor_${key}`;
      const layer = { key, mesh, ids: [] };
      list.forEach((obj, i) => {
        mesh.setMatrixAt(i, this.Matrix(obj, matrix));
        if (key.startsWith("bd:")) {
          const p = obj.params || {};
          color.setHex(HexInt(kind === "backdropTree" ? "#5a5446" : p.color, 0x8a8370), THREE.SRGBColorSpace);
          mesh.setColorAt(i, color);
        }
        if (!obj.meta?.airWallSpline) {
          layer.ids.push(obj.id);
          this.where.set(obj.id, { layer, index: i });
        } else {
          layer.ids.push(null);
        }
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      this.world.add(mesh);
      this.layers.push(layer);
    }
    this.SyncSelectionLines();
  }

  /** 只挪了位置 / 角度 / 尺寸：改这几个实例的矩阵，不重建。override 给拖动中的预览物件。 */
  UpdateInstances(ids, override = null) {
    const matrix = new THREE.Matrix4();
    const dirtyWaterLayers = new Set();
    for (const id of ids) {
      const at = this.where.get(id);
      const obj = override?.get(id) || this.model.Find(id);
      if (!at || !obj) continue;
      if (at.layer.isWaterSurface) {
        dirtyWaterLayers.add(at.layer);
        continue;
      }
      at.layer.mesh.setMatrixAt(at.index, this.Matrix(obj, matrix));
      at.layer.mesh.instanceMatrix.needsUpdate = true;
    }
    for (const layer of dirtyWaterLayers) {
      const updatedList = layer.objects.map((o) => override?.get(o.id) || this.model.Find(o.id) || o);
      const nextGeom = this.BuildWaterGeometry(updatedList, this.sampler);
      layer.mesh.geometry.dispose();
      layer.mesh.geometry = nextGeom;
    }
    this.SyncSelectionLines(override);
  }

  SyncSelectionLines(override = null) {
    this.selectionLines.clear();
    const ids = [...this.model.selection].slice(0, 300);
    for (const id of ids) {
      const obj = override?.get(id) || this.model.Find(id);
      if (!obj) continue;
      const lines = new THREE.LineSegments(this.edges, this.edgeMaterial);
      lines.matrixAutoUpdate = false;
      lines.matrix.copy(this.Matrix(obj));
      lines.renderOrder = 20;
      this.selectionLines.add(lines);
    }
    if (!ids.length && this.inheritedSelected && this.inherited) {
      const obj = this.inherited.objectMap.get(this.inheritedSelected);
      if (obj) {
        const lines = new THREE.LineSegments(this.edges, this.inheritedEdgeMaterial);
        lines.matrixAutoUpdate = false;
        lines.matrix.copy(this.Matrix(obj, new THREE.Matrix4(), this.inherited));
        lines.renderOrder = 20;
        this.selectionLines.add(lines);
      }
    }
  }

  // ------------------------------------------------------------------ 手柄

  BuildGizmo() {
    const gizmo = new THREE.Group();
    gizmo.name = "SceneEditor_Gizmo";
    gizmo.visible = false;
    const Basic = (color, opacity = 1) => new THREE.MeshBasicMaterial({ color, depthTest: false, depthWrite: false, transparent: true, opacity, toneMapped: false });
    const Pick = () => new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthTest: false, depthWrite: false });
    const axes = [["x", 0xd6604a, [1, 0, 0]], ["y", 0x9dc07a, [0, 1, 0]], ["z", 0x9dc0e4, [0, 0, 1]]];
    for (const [name, color, dir] of axes) {
      const group = new THREE.Group();
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.82, 8), Basic(color));
      shaft.position.y = 0.41;
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.2, 12), Basic(color));
      tip.position.y = 0.9;
      const pick = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 1.0, 8), Pick());
      pick.position.y = 0.5;
      for (const part of [shaft, tip, pick]) { part.userData.handle = { axis: name, dir: new THREE.Vector3(...dir) }; part.renderOrder = 30; group.add(part); }
      if (name === "x") group.rotation.z = -Math.PI / 2;
      if (name === "z") group.rotation.x = Math.PI / 2;
      gizmo.add(group);
    }
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.022, 6, 64), Basic(0xedca83));
    const ringPick = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.09, 6, 48), Pick());
    for (const part of [ring, ringPick]) { part.rotation.x = Math.PI / 2; part.userData.handle = { ring: true }; part.renderOrder = 30; gizmo.add(part); }
    this.gizmo = gizmo;
    this.scene.add(gizmo);
  }

  Pivot(override = null) {
    if (this.cameraSelected && this.viewMode === "free" && this.showShotGizmo && this.ShotPose()) {
      return new THREE.Vector3(...this.ShotPose().position);
    }
    const list = [...this.model.selection].map(id => override?.get(id) || this.model.Find(id)).filter(Boolean);
    if (!list.length) return null;
    const p = new THREE.Vector3();
    for (const obj of list) p.add(new THREE.Vector3(obj.pos[0], this.BaseY(obj), obj.pos[2]));
    return p.multiplyScalar(1 / list.length);
  }

  UpdateGizmo() {
    const pivot = this.Pivot(this.drag?.preview || null);
    this.gizmo.visible = !!pivot;
    if (!pivot) return;
    this.gizmo.position.copy(pivot);
    const dist = this.camera.position.distanceTo(pivot);
    this.gizmo.scale.setScalar(Math.max(0.2, dist * E.gizmoScreen * Math.tan(E.fov * DEG / 2)));
  }

  // ------------------------------------------------------------------ 拾取

  Ray(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(ndc, this.camera);
    return raycaster;
  }

  PickHandle(raycaster) {
    if (!this.gizmo.visible) return null;
    this.gizmo.updateMatrixWorld(true);
    const hit = raycaster.intersectObject(this.gizmo, true)[0];
    return hit ? hit.object.userData.handle : null;
  }

  /** 最近的物件（按包围盒；远景只在显示时能选）。 */
  PickFromList(ray, list, ctx = null) {
    const o = ray.origin, d = ray.direction;
    let best = null, bestT = Infinity;
    for (const obj of list) {
      if (!ctx && !this.Visible(obj)) continue;
      const s = this.Shape(obj, ctx);
      const c = Math.cos(-s.yaw), sn = Math.sin(-s.yaw);
      const rx = o.x - s.c[0], ry = o.y - s.c[1], rz = o.z - s.c[2];
      const lo = [rx * c + rz * sn, ry, -rx * sn + rz * c];
      const ld = [d.x * c + d.z * sn, d.y, -d.x * sn + d.z * c];
      let t0 = -Infinity, t1 = Infinity;
      for (let i = 0; i < 3; i++) {
        if (Math.abs(ld[i]) < 1e-9) { if (Math.abs(lo[i]) > s.half[i]) { t0 = Infinity; break; } continue; }
        let a = (-s.half[i] - lo[i]) / ld[i], b = (s.half[i] - lo[i]) / ld[i];
        if (a > b) [a, b] = [b, a];
        t0 = Math.max(t0, a); t1 = Math.min(t1, b);
        if (t0 > t1) break;
      }
      if (t0 <= t1 && t1 > 0) {
        const t = Math.max(0, t0);
        if (t < bestT) { bestT = t; best = obj.id; }
      }
    }
    return best ? { id: best, t: bestT } : null;
  }

  PickObject(ray) { return this.PickFromList(ray, this.model.objects); }

  PickInheritedObject(ray) {
    if (!this.inherited || !this.showInherited || !this.inherited.visibleObjects.length) return null;
    return this.PickFromList(ray, this.inherited.visibleObjects, this.inherited);
  }

  SampleGroundAt(x, z) {
    if (Inside(this.model.doc.bounds, x, z)) return this.sampler(x, z);
    if (this.inherited && this.showInherited && Inside(this.inherited.bounds, x, z)) return this.inherited.sampler(x, z);
    return this.model.doc.backdrop?.ground?.y ?? 0;
  }

  /** 视线打到地面的点（场地内与继承北段按高度图步进，场地外落在远景地面高度）。 */
  PickGround(ray, maxM = 4000) {
    const o = ray.origin, d = ray.direction;
    let prev = 0;
    const Above = (t) => {
      const x = o.x + d.x * t, z = o.z + d.z * t;
      return o.y + d.y * t - this.SampleGroundAt(x, z);
    };
    if (Above(0) < 0) return null;
    for (let t = 1; t <= maxM; t += t < 200 ? 0.5 : 2) {
      if (Above(t) < 0) {
        let lo = prev, hi = t;
        for (let i = 0; i < 18; i++) { const m = (lo + hi) / 2; if (Above(m) < 0) hi = m; else lo = m; }
        return new THREE.Vector3(o.x + d.x * hi, o.y + d.y * hi, o.z + d.z * hi);
      }
      prev = t;
    }
    return null;
  }

  // ------------------------------------------------------------------ 相机

  ShotPose() { return this.drag?.cameraPreview || this.model?.doc.camera; }

  ViewPose() {
    return (this.viewMode === "original" && this.ShotPose()) || {
      position: this.cam.pos.toArray(), yawDeg: this.cam.yaw / DEG, pitchDeg: this.cam.pitch / DEG, fovDeg: E.fov,
    };
  }

  ApplyCamera() {
    const pose = this.ViewPose();
    this.camera.position.fromArray(pose.position);
    this.camera.rotation.set(pose.pitchDeg * DEG, pose.yawDeg * DEG, 0, "YXZ");
    if (this.camera.fov !== pose.fovDeg) {
      this.camera.fov = pose.fovDeg;
      this.camera.updateProjectionMatrix();
    }
    this.camera.updateMatrixWorld(true);
  }

  SyncShotGizmo() {
    const pose = this.ShotPose();
    this.shotHelper.visible = !!pose && this.showShotGizmo && this.viewMode === "free";
    if (!this.shotHelper.visible) return;
    const cam = this.shotCamera;
    if (cam.fov !== pose.fovDeg) { cam.fov = pose.fovDeg; cam.updateProjectionMatrix(); this.shotHelper.update(); }
    cam.position.fromArray(pose.position);
    cam.rotation.set(pose.pitchDeg * DEG, pose.yawDeg * DEG, 0, "YXZ");
    cam.updateMatrixWorld(true);
  }

  SelectShot({ frame = false } = {}) {
    const pose = this.ShotPose();
    if (!pose) return;
    this.model.Select([]);
    this.inheritedSelected = null;
    this.cameraSelected = true;
    this.showShotGizmo = true;
    if (frame) {
      this.cam.yaw = (pose.yawDeg + 28) * DEG;
      this.LookAt(new THREE.Vector3(...pose.position), 8, -33);
    }
    this.SyncSelectionLines();
    this.BuildTrenchLines();
    this.SyncPreviewControls();
    this.RenderTree();
    this.RenderInspector();
  }

  SetView(mode) {
    const next = mode === "original" && this.ShotPose() ? "original" : "free";
    if (this.viewMode === next) return;
    this.viewMode = next;
    this.keys.clear();
    this.ApplyCamera();
    this.SyncShotGizmo();
    this.UpdateGizmo();
    this.SyncPreviewControls();
  }

  Forward() {
    const { yaw, pitch } = this.cam;
    return new THREE.Vector3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
  }

  LookAt(target, distance, pitchDeg = -32) {
    this.SetView("free");
    this.cam.pitch = pitchDeg * DEG;
    const f = this.Forward();
    this.cam.pos.copy(target).addScaledVector(f, -distance);
    this.ApplyCamera();
  }

  Home() {
    const sp = this.model.doc.spawn;
    this.cam.yaw = (sp.yawDeg || 0) * DEG;
    this.LookAt(new THREE.Vector3(sp.x, this.sampler(sp.x, sp.z), sp.z), 70, -35);
  }

  Frame(ids = [...this.model.selection]) {
    const list = ids.map(id => this.model.Find(id)).filter(Boolean);
    if (!list.length) return;
    const box = new THREE.Box3();
    for (const obj of list) {
      const s = this.Shape(obj);
      const r = Math.hypot(...s.half);
      box.expandByPoint(new THREE.Vector3(s.c[0] - r, s.c[1] - r, s.c[2] - r));
      box.expandByPoint(new THREE.Vector3(s.c[0] + r, s.c[1] + r, s.c[2] + r));
    }
    const center = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3()).length();
    this.LookAt(center, Math.max(10, size * 1.4), Math.min(-15, this.cam.pitch / DEG));
  }

  Tick(now) {
    const dt = Math.min(0.1, (now - (this.lastTick || now)) / 1000);
    this.lastTick = now;
    const move = new THREE.Vector3();
    if (this.viewMode === "free" && !this.TypingInField()) {
      const f = this.Forward(), right = new THREE.Vector3(Math.cos(this.cam.yaw), 0, -Math.sin(this.cam.yaw));
      if (this.keys.has("KeyW")) move.add(f);
      if (this.keys.has("KeyS")) move.sub(f);
      if (this.keys.has("KeyD")) move.add(right);
      if (this.keys.has("KeyA")) move.sub(right);
      if (this.keys.has("KeyE")) move.y += 1;
      if (this.keys.has("KeyQ")) move.y -= 1;
    }
    if (move.lengthSq() > 0) {
      const speed = E.flyMps * (this.keys.has("ShiftLeft") || this.keys.has("ShiftRight") ? E.fastMul : 1);
      this.cam.pos.addScaledVector(move.normalize(), speed * dt);
    }
    this.ApplyCamera();
    if (this.previewFrame) this.SyncFormalPreview(now);
    else {
      this.environment.Update(dt, this.camera);
      this.SyncShotGizmo();
      this.UpdateGizmo();
      this.renderer.render(this.scene, this.camera);
    }
    this.UpdateHud();
    requestAnimationFrame((t) => this.Tick(t));
  }

  TypingInField() {
    const a = document.activeElement;
    return a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.tagName === "SELECT") && a.type !== "checkbox";
  }

  FrameInherited(id = this.inheritedSelected) {
    const obj = this.inherited?.objectMap.get(id);
    if (!obj) return;
    const s = this.Shape(obj, this.inherited);
    const r = Math.hypot(...s.half);
    this.LookAt(new THREE.Vector3(...s.c), Math.max(10, r * 2.6), Math.min(-18, this.cam.pitch / DEG));
  }

  FocusInheritSeam() {
    if (!this.inherited) return;
    const { bounds, info, sampler } = this.inherited;
    const x = this.model?.doc?.spawn?.x ?? (bounds.minX + bounds.maxX) / 2;
    const z = info.maxZ;
    this.cam.yaw = 0;
    this.LookAt(new THREE.Vector3(x, sampler(x, z), z), 90, -35);
  }

  UpdateHud() {
    if ((this.hudFrame = (this.hudFrame || 0) + 1) % 6) return;
    const p = this.camera.position, ground = this.SampleGroundAt(p.x, p.z);
    const sel = this.model.selection.size;
    const lines = [`相机 x ${Fixed(p.x, 1)}  z ${Fixed(p.z, 1)}  离地 ${Fixed(p.y - ground, 1)} m  朝向 ${Fixed(this.camera.rotation.y / DEG, 0)}°`];
    if (this.inherited) {
      lines.push(p.z < this.inherited.info.maxZ
        ? `区域：继承北段（只读 · ${this.inherited.info.scene}）`
        : `区域：本分支可编辑段（z ≥ ${this.inherited.info.maxZ}）`);
    }
    if (sel) lines.push(`选中 ${sel} 个`);
    else if (this.inheritedSelected) lines.push(`只读继承物件：${this.inheritedSelected}`);
    $("seHud").textContent = lines.join("\n");
  }

  SyncPreviewControls(message = "", error = false) {
    const hasShot = !!this.model?.doc.camera, inPreview = !!this.previewFrame, authored = this.viewMode === "original";
    $("seShotView").hidden = $("seShotControls").hidden = !hasShot;
    $("seFreeView").setAttribute("aria-pressed", String(!authored));
    $("seShotView").setAttribute("aria-pressed", String(authored));
    $("seShotGizmo").checked = this.showShotGizmo;
    $("seFormalControls").hidden = !this.previewParam;
    $("seFormalPreview").setAttribute("aria-pressed", String(inPreview));
    $("seRefreshPreview").hidden = !inPreview;
    $("seRefreshPreview").disabled = inPreview && !this.previewReady;
    $("sePreviewMount").classList.toggle("authored", authored);
    $("sePreviewBar").hidden = !inPreview;
    $("sePreviewBadge").textContent = this.previewReady ? `正式预览 · ${authored ? "原画机位" : "自由视角"}` : "正在加载正式预览…";
    const status = $("sePreviewStatus");
    status.textContent = message || (inPreview && this.previewSceneChanged ? "布设已改动，刷新预览后可查看。" : "");
    status.hidden = !status.textContent;
    status.classList.toggle("error", error);
  }

  StartFormalPreview() {
    if (!this.previewParam || !this.model) return;
    this.CancelDrag();
    const doc = this.model.ToDoc();
    doc.objects = doc.objects.filter((obj) => this.StageVisible(obj.group) && (this.show.backdrop || obj.layer !== "backdrop"));
    if (doc.trenches) doc.trenches.segments = doc.trenches.segments.filter((seg) => this.StageVisible(TrenchGroup(seg)));
    if (!this.show.backdrop) delete doc.backdrop;
    const token = crypto.randomUUID();
    this.previewSnapshot = { token, doc };
    this.previewReady = false;
    this.previewSceneChanged = false;
    this.previewModelState = this.model.state;
    this.previewPoseKey = "";
    this.previewStarted = performance.now();
    const url = new URL("../index.html", location.href);
    url.searchParams.set(this.previewParam, "1");
    url.searchParams.set("shot", "1");
    url.searchParams.set("sceneEditorPreview", token);
    const frame = El("iframe");
    frame.title = "正式场景预览";
    frame.tabIndex = -1;
    frame.src = url.href;
    this.previewFrame = frame;
    $("sePreviewMount").replaceChildren(frame);
    $("sePreviewMount").hidden = false;
    this.SyncPreviewControls();
    this.canvas.focus();
  }

  StopFormalPreview(error = "") {
    this.previewFrame?.remove();
    this.previewFrame = this.previewSnapshot = null;
    this.previewReady = this.previewSceneChanged = false;
    $("sePreviewMount").hidden = true;
    this.SyncPreviewControls(error, !!error);
  }

  SyncFormalPreview(now) {
    const game = this.previewFrame.contentWindow?.Tengxian;
    const api = game?.Debug?.ScenePreview;
    if (!this.previewReady) {
      const state = api?.State();
      if (state?.error) { this.StopFormalPreview(state.error); return; }
      if (!game?.state?.ready || state?.scene !== this.sceneId) {
        if (now - this.previewStarted > 120000) this.StopFormalPreview("正式预览加载超时，可重新打开。");
        return;
      }
      this.previewReady = true;
      this.SyncPreviewControls();
    }
    const pose = this.ViewPose(), key = JSON.stringify(pose);
    if (key !== this.previewPoseKey && api?.SetCamera(pose)) this.previewPoseKey = key;
  }

  // ------------------------------------------------------------------ 鼠标与键盘

  SceneCategoryOf(scene) {
    return SCENE_CATEGORIES.find((c) => c.id === scene?.category) || SCENE_CATEGORIES[1];
  }

  SceneShortTitle(scene) {
    if (!scene) return "";
    if (scene.category === "test") return scene.title.replace(/^测试场景\s*·\s*/, "");
    return scene.title;
  }

  SwitchScene(id, { select = null } = {}) {
    if (!SCENE_IDS.includes(id)) return;
    if (id === this.sceneId && !select) { $("seScenePicker").open = false; return; }
    if (this.model?.dirty && !confirm("有没保存的改动，换场景就丢掉了，继续？")) {
      $("seScene").value = this.sceneId;
      return;
    }
    const url = new URL(location.href);
    url.searchParams.set("scene", id);
    if (select) url.searchParams.set("select", select);
    else url.searchParams.delete("select");
    location.assign(url.href);
  }

  InitScenePicker() {
    const select = $("seScene");
    select.textContent = "";
    for (const cat of SCENE_CATEGORIES) {
      const items = SCENE_LIST.filter((s) => (s.category || "level") === cat.id);
      if (!items.length) continue;
      const group = document.createElement("optgroup");
      group.label = cat.label;
      for (const s of items) group.append(new Option(s.title, s.id));
      select.append(group);
    }
    select.value = this.sceneId;
    select.addEventListener("change", () => this.SwitchScene(select.value));

    const current = SceneInfo(this.sceneId);
    const cat = this.SceneCategoryOf(current);
    const badge = $("seSceneCatBadge");
    badge.textContent = cat.short;
    badge.dataset.cat = cat.id;
    $("seSceneCurrentTitle").textContent = this.SceneShortTitle(current) || this.sceneId;
    const styleTag = $("seSceneStyleTag");
    styleTag.textContent = this.style === "formal" ? "正式" : "白盒";
    styleTag.dataset.style = this.style;

    const catsWrap = $("seSceneCats");
    const tabs = [{ id: "all", label: "全部", count: SCENE_LIST.length },
      ...SCENE_CATEGORIES.map((c) => ({ id: c.id, label: c.label, count: SCENE_LIST.filter((s) => (s.category || "level") === c.id).length }))];
    catsWrap.textContent = "";
    for (const tab of tabs) {
      const btn = El("button", "seSceneCatTab");
      btn.type = "button";
      btn.setAttribute("role", "tab");
      btn.dataset.cat = tab.id;
      btn.setAttribute("aria-selected", String(this.sceneFilterCat === tab.id));
      btn.append(document.createTextNode(tab.label), El("small", "", String(tab.count)));
      btn.addEventListener("click", () => {
        this.sceneFilterCat = tab.id;
        for (const b of catsWrap.querySelectorAll(".seSceneCatTab")) {
          b.setAttribute("aria-selected", String(b.dataset.cat === tab.id));
        }
        this.RenderScenePicker();
      });
      catsWrap.append(btn);
    }

    const filter = $("seSceneFilter");
    filter.addEventListener("input", () => this.RenderScenePicker());
    const picker = $("seScenePicker");
    picker.addEventListener("toggle", () => {
      if (picker.open) {
        $("seInheritNote").open = false;
        this.RenderScenePicker();
        filter.focus();
      }
    });
    const inheritPicker = $("seInheritNote");
    inheritPicker.addEventListener("toggle", () => {
      if (inheritPicker.open) picker.open = false;
    });
    document.addEventListener("pointerdown", (e) => {
      if (picker.open && !picker.contains(e.target)) picker.open = false;
      if (inheritPicker.open && !inheritPicker.contains(e.target)) inheritPicker.open = false;
    });
    this.RenderScenePicker();
  }

  RenderScenePicker() {
    const list = $("seSceneList");
    const q = ($("seSceneFilter")?.value || "").trim().toLowerCase();
    list.textContent = "";
    const cats = this.sceneFilterCat === "all"
      ? SCENE_CATEGORIES
      : SCENE_CATEGORIES.filter((c) => c.id === this.sceneFilterCat);
    let shown = 0;
    for (const cat of cats) {
      const items = SCENE_LIST.filter((s) => {
        if ((s.category || "level") !== cat.id) return false;
        if (!q) return true;
        return `${s.title} ${s.id} ${s.note || ""} ${cat.label}`.toLowerCase().includes(q);
      });
      if (!items.length) continue;
      const section = El("section", "seSceneGroup");
      const head = El("div", "seSceneGroupHead");
      const title = El("span", "seSceneGroupTitle");
      const pill = El("span", "seCatBadge", cat.short);
      pill.dataset.cat = cat.id;
      title.append(pill, document.createTextNode(`${cat.label}（${items.length}）`));
      head.append(title, El("span", "seSceneGroupNote", cat.note));
      section.append(head);
      for (const s of items) {
        const btn = El("button", `seSceneOption${s.id === this.sceneId ? " active" : ""}`);
        btn.type = "button";
        btn.dataset.sceneId = s.id;
        const top = El("div", "seSceneOptionTop");
        top.append(El("span", "seSceneOptionName", this.SceneShortTitle(s)));
        const st = El("span", "seStyleTag", s.style === "formal" ? "正式" : "白盒");
        st.dataset.style = s.style;
        top.append(st);
        const variant = ENCOUNTER_VARIANTS.find((v) => v.scene === s.id);
        if (s.inheritFrom) top.append(El("span", "seInheritChip", `↳ 继承 ${s.inheritFrom}`));
        else if (variant?.isBaseline) top.append(El("span", "seInheritChip", "基线"));
        top.append(El("span", "seSceneOptionId", s.id));
        btn.append(top);
        if (s.note) btn.append(El("div", "seSceneOptionNote", s.note));
        btn.addEventListener("click", () => this.SwitchScene(s.id));
        section.append(btn);
        shown++;
      }
      list.append(section);
    }
    if (!shown) list.append(El("div", "seSceneEmpty", "没有匹配的场景，试试清空关键词或切回「全部」分类。"));
  }

  BindUi() {
    const c = this.canvas;
    c.addEventListener("contextmenu", (e) => e.preventDefault());
    c.addEventListener("pointerdown", (e) => this.PointerDown(e));
    c.addEventListener("pointermove", (e) => this.PointerMove(e));
    c.addEventListener("pointerup", (e) => this.PointerUp(e));
    c.addEventListener("wheel", (e) => this.Wheel(e), { passive: false });
    window.addEventListener("keydown", (e) => this.KeyDown(e));
    window.addEventListener("keyup", (e) => this.keys.delete(e.code));
    window.addEventListener("blur", () => this.keys.clear());
    window.addEventListener("beforeunload", (e) => { if (this.model?.dirty) { e.preventDefault(); e.returnValue = ""; } });

    this.InitScenePicker();
    $("seToggleInherited").addEventListener("change", (e) => {
      this.showInherited = e.target.checked;
      this.inheritedGroup.visible = this.showInherited;
      if (!this.showInherited && this.inheritedSelected) {
        this.inheritedSelected = null;
        this.SyncSelectionLines();
        this.RenderInspector();
      }
    });
    $("seToggleInheritBounds").addEventListener("change", (e) => {
      this.showInheritBounds = e.target.checked;
      this.inheritedOverlayGroup.visible = this.showInheritBounds;
    });
    $("seFocusSeam").addEventListener("click", () => {
      $("seInheritNote").open = false;
      this.FocusInheritSeam();
      this.canvas.focus();
    });
    $("seJumpBase").addEventListener("click", () => {
      if (!this.inherited) return;
      this.SwitchScene(this.inherited.info.scene);
    });
    $("seUndo").addEventListener("click", () => this.Undo());
    $("seRedo").addEventListener("click", () => this.Redo());
    $("seSave").addEventListener("click", () => this.Save());
    $("seDownload").addEventListener("click", () => this.Download());
    $("seReload").addEventListener("click", () => {
      if (this.model?.dirty && !confirm("丢掉没保存的改动，重新读盘？")) return;
      this.LoadScene().catch((error) => this.Fail(error));
    });
    $("seSearch").addEventListener("input", () => this.RenderTree());
    $("seTabTree").addEventListener("click", () => this.Tab("tree"));
    $("seTabPreview").addEventListener("click", () => this.Tab("preview"));
    $("seFreeView").addEventListener("click", () => { this.SetView("free"); this.canvas.focus(); });
    $("seShotView").addEventListener("click", () => this.SetView("original"));
    $("seShotGizmo").addEventListener("change", (e) => { this.showShotGizmo = e.target.checked; });
    $("seSelectShot").addEventListener("click", () => {
      if (this.previewFrame) this.StopFormalPreview();
      this.SelectShot({ frame: true });
      this.canvas.focus();
    });
    $("seFormalPreview").addEventListener("click", () => this.previewFrame ? this.StopFormalPreview() : this.StartFormalPreview());
    $("seRefreshPreview").addEventListener("click", () => this.StartFormalPreview());
    $("seClosePreview").addEventListener("click", () => this.StopFormalPreview());
    $("seShowBackdrop").addEventListener("change", (e) => {
      this.show.backdrop = e.target.checked;
      if (this.backdropGround) this.backdropGround.visible = this.show.backdrop;
      this.RebuildObjects();
      this.RebuildInheritedObjects();
      if (this.previewFrame) this.StartFormalPreview();
    });
    $("seShowHidden").addEventListener("change", (e) => {
      this.show.hidden = e.target.checked;
      this.RebuildObjects();
      this.RebuildInheritedObjects();
    });
  }

  Tab(which) {
    for (const [id, tab] of [["seTabTree", "tree"], ["seTabPreview", "preview"]]) {
      $(id).classList.toggle("selected", which === tab);
      $(id).setAttribute("aria-pressed", String(which === tab));
    }
    $("sePaneTree").hidden = which !== "tree";
    $("sePanePreview").hidden = which !== "preview";
  }

  PointerDown(e) {
    if (!this.model) return;
    this.canvas.focus();
    this.canvas.setPointerCapture(e.pointerId);
    this.down = { x: e.clientX, y: e.clientY, button: e.button, moved: false, ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey };
    if (e.button !== 0 || this.previewFrame || this.viewMode === "original") return;
    const raycaster = this.Ray(e.clientX, e.clientY);
    // 选中壕沟时：按住控制点拖；Alt + 点地面加一个控制点
    if (this.model.trench) {
      const point = this.PickTrenchPoint(e.clientX, e.clientY);
      if (point !== null) { this.BeginTrenchDrag(point); this.down.handled = true; return; }
      if (e.altKey) { this.InsertTrenchPointAt(this.PickGround(raycaster.ray)); this.down.handled = true; return; }
    }
    const handle = this.PickHandle(raycaster);
    if (handle) { this.BeginDrag(handle, raycaster.ray); this.down.handled = true; return; }
    const hit = this.PickObject(raycaster.ray);
    raycaster.params.Line.threshold = .16;
    const shotHit = this.shotHelper.visible && raycaster.intersectObject(this.shotHelper)[0];
    if (shotHit && (!hit || shotHit.distance < hit.t)) { this.down.shot = true; return; }
    this.down.hit = hit;
    if (!hit) this.down.inheritedHit = this.PickInheritedObject(raycaster.ray);
    if (hit && this.model.selection.has(hit.id) && !this.down.ctrl && !this.down.shift) this.down.bodyDrag = true;
  }

  PointerMove(e) {
    const down = this.down;
    if (!down) return;
    const dx = e.clientX - down.x, dy = e.clientY - down.y;
    if (!down.moved && Math.hypot(dx, dy) > E.dragPx) down.moved = true;
    if (this.viewMode === "original" || (this.previewFrame && down.button === 0)) return;
    if (down.button === 2) {
      this.cam.yaw -= e.movementX * E.lookRadPerPx;
      this.cam.pitch = Math.max(-1.55, Math.min(1.55, this.cam.pitch - e.movementY * E.lookRadPerPx));
      return;
    }
    if (down.button === 1) {
      const scale = Math.max(0.05, this.cam.pos.y / 400);
      const right = new THREE.Vector3(Math.cos(this.cam.yaw), 0, -Math.sin(this.cam.yaw));
      const up = new THREE.Vector3().crossVectors(right, this.Forward()).normalize();
      this.cam.pos.addScaledVector(right, -e.movementX * scale).addScaledVector(up, e.movementY * scale);
      return;
    }
    if (down.button !== 0) return;
    if (this.drag?.trench) { this.TrenchDragTo(this.Ray(e.clientX, e.clientY).ray, e.ctrlKey || e.metaKey); return; }
    if (this.drag) { this.DragTo(this.Ray(e.clientX, e.clientY).ray, e.ctrlKey || e.metaKey); return; }
    if (down.bodyDrag && down.moved) { this.BeginDrag({ plane: true }, this.Ray(down.x, down.y).ray); this.DragTo(this.Ray(e.clientX, e.clientY).ray, e.ctrlKey); }
  }

  PointerUp(e) {
    const down = this.down;
    this.down = null;
    if (this.canvas.hasPointerCapture(e.pointerId)) this.canvas.releasePointerCapture(e.pointerId);
    if (!down || down.button !== 0 || this.previewFrame || this.viewMode === "original") return;
    if (this.drag) { this.EndDrag(); return; }
    if (down.handled || down.moved) return;
    if (down.shot) this.SelectShot();
    else if (down.hit) this.SelectIds([down.hit.id], { toggle: down.ctrl, add: down.shift });
    else if (down.inheritedHit && !down.ctrl && !down.shift) this.SelectInherited(down.inheritedHit.id);
    else if (!down.ctrl && !down.shift) {
      // 没点中物件：点在沟里（含沟沿弃土）就选那段沟
      const trench = this.TrenchAt(this.PickGround(this.Ray(e.clientX, e.clientY).ray));
      if (trench) this.SelectTrench(trench);
      else this.SelectIds([]);
    }
  }

  Wheel(e) {
    e.preventDefault();
    if (this.viewMode === "original" || !this.model) return;
    const ray = this.Ray(e.clientX, e.clientY).ray;
    const ground = this.PickGround(ray, 3000);
    const dist = ground ? ground.distanceTo(this.cam.pos) : 40;
    const step = Math.max(1, dist * 0.15) * Math.sign(e.deltaY);
    this.cam.pos.addScaledVector(ray.direction, -step);
  }

  KeyDown(e) {
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && e.code === "KeyS") { e.preventDefault(); this.Save(); return; }
    if (this.TypingInField()) return;
    if (ctrl && e.code === "KeyZ") { e.preventDefault(); if (e.shiftKey) this.Redo(); else this.Undo(); return; }
    if (ctrl && e.code === "KeyY") { e.preventDefault(); this.Redo(); return; }
    if (ctrl && e.code === "KeyD") { e.preventDefault(); this.DuplicateSelection(); return; }
    if (e.code === "Delete" || e.code === "Backspace") { e.preventDefault(); this.DeleteSelection(); return; }
    if (e.code === "Escape") {
      if ($("seScenePicker")?.open) { $("seScenePicker").open = false; return; }
      if ($("seInheritNote")?.open) { $("seInheritNote").open = false; return; }
      if (this.previewFrame) this.StopFormalPreview();
      else if (this.drag) this.CancelDrag();
      else this.SelectIds([]);
      return;
    }
    if (e.code === "KeyF" && !ctrl) {
      if (this.cameraSelected) this.SelectShot({ frame: true });
      else if (this.inheritedSelected) this.FrameInherited();
      else if (this.model.trench) this.FrameTrench();
      else this.Frame();
      return;
    }
    if (!ctrl) this.keys.add(e.code);
  }

  // ------------------------------------------------------------------ 拖手柄

  BeginDrag(handle, ray) {
    const ids = [...this.model.selection];
    const cameraBefore = this.cameraSelected ? this.ShotPose() : null;
    if (!ids.length && !cameraBefore) return;
    const pivot = this.Pivot();
    const start = new Map(ids.map(id => [id, JSON.parse(JSON.stringify(this.model.Find(id)))]));
    this.drag = { handle, ids, pivot, start, preview: new Map(start), delta: [0, 0, 0], yaw: 0, cameraBefore };
    if (handle.axis) this.drag.t0 = this.AxisParam(ray, pivot, handle.dir);
    else this.drag.p0 = this.PlaneHit(ray, pivot.y);
  }

  /** 视线与轴线最近点在轴上的参数（米）。 */
  AxisParam(ray, pivot, dir) {
    const w = ray.origin.clone().sub(pivot), b = ray.direction.dot(dir);
    const denom = b * b - 1;
    if (Math.abs(denom) < 1e-4) return null;
    return (ray.direction.dot(w) * b - dir.dot(w)) / denom;
  }

  PlaneHit(ray, y) {
    if (Math.abs(ray.direction.y) < 1e-6) return null;
    const t = (y - ray.origin.y) / ray.direction.y;
    return t > 0 ? ray.origin.clone().addScaledVector(ray.direction, t) : null;
  }

  DragTo(ray, snap) {
    const d = this.drag;
    const preview = new Map();
    if (d.handle.ring) {
      const p = this.PlaneHit(ray, d.pivot.y);
      if (!p || !d.p0) return;
      const Angle = (q) => Math.atan2(-(q.z - d.pivot.z), q.x - d.pivot.x);
      let deg = (Angle(p) - Angle(d.p0)) / DEG;
      if (snap) deg = Math.round(deg / E.snapDeg) * E.snapDeg;
      d.yaw = deg;
      const rad = deg * DEG, c = Math.cos(rad), s = Math.sin(rad), multi = d.ids.length > 1;
      for (const [id, obj] of d.start) {
        const o = JSON.parse(JSON.stringify(obj));
        o.yawDeg = (o.yawDeg || 0) + deg;
        if (multi) {
          const x = o.pos[0] - d.pivot.x, z = o.pos[2] - d.pivot.z;
          o.pos[0] = d.pivot.x + x * c + z * s; o.pos[2] = d.pivot.z - x * s + z * c;
        }
        preview.set(id, o);
      }
    } else {
      let delta;
      if (d.handle.axis) {
        const t = this.AxisParam(ray, d.pivot, d.handle.dir);
        if (t === null || d.t0 === null) return;
        let m = t - d.t0;
        if (snap) m = Math.round(m / E.snapM) * E.snapM;
        delta = d.handle.dir.clone().multiplyScalar(m);
      } else {
        const p = this.PlaneHit(ray, d.pivot.y);
        if (!p || !d.p0) return;
        delta = p.sub(d.p0).setY(0);
        if (snap) { delta.x = Math.round(delta.x / E.snapM) * E.snapM; delta.z = Math.round(delta.z / E.snapM) * E.snapM; }
      }
      d.delta = [delta.x, delta.y, delta.z];
      for (const [id, obj] of d.start) {
        const o = JSON.parse(JSON.stringify(obj));
        o.pos[0] += delta.x; o.pos[2] += delta.z;
        if (delta.y !== 0) o.pos[1] = (o.pos[1] === null ? this.GroundY(obj) : o.pos[1]) + delta.y;
        preview.set(id, o);
      }
    }
    if (d.cameraBefore) {
      d.cameraPreview = {
        ...d.cameraBefore,
        position: d.cameraBefore.position.map((n, i) => n + d.delta[i]),
        yawDeg: d.cameraBefore.yawDeg + d.yaw,
      };
      return;
    }
    d.preview = preview;
    this.UpdateInstances(d.ids, preview);
  }

  BeginTrenchDrag(index) {
    const seg = this.model.FindTrench(this.model.trench);
    const [x, z] = seg.points[index];
    this.model.trenchPoint = index;
    this.drag = { trench: seg.id, index, y: this.sampler(x, z), start: seg.points.map((p) => [...p]), preview: null };
    this.BuildTrenchLines();
    this.RenderInspector();
  }

  TrenchDragTo(ray, snap) {
    const d = this.drag;
    const p = this.PlaneHit(ray, d.y);
    if (!p) return;
    let x = p.x, z = p.z;
    if (snap) { x = Math.round(x / E.snapM) * E.snapM; z = Math.round(z / E.snapM) * E.snapM; }
    d.preview = d.start.map((q, i) => (i === d.index ? [x, z] : q));
    this.BuildTrenchLines(d.preview);
  }

  EndDrag() {
    const d = this.drag;
    this.drag = null;
    if (!d) return;
    if (d.cameraBefore) {
      if (d.cameraPreview) this.ChangeShot(d.cameraPreview);
      return;
    }
    if (d.trench) {
      if (d.preview) { const [x, z] = d.preview[d.index]; this.model.MoveTrenchPoint(d.trench, d.index, x, z); }
      this.AfterEdit(null);
      return;
    }
    if (d.handle.ring) { if (d.yaw) this.model.RotateBy(d.ids, d.yaw, d.ids.length > 1 ? { x: d.pivot.x, z: d.pivot.z } : null); }
    else if (d.delta.some(v => v !== 0)) this.model.MoveBy(d.ids, d.delta[0], d.delta[1], d.delta[2], { groundY: (obj) => this.GroundY(obj) });
    this.AfterEdit(d.ids);
  }

  CancelDrag() {
    const d = this.drag;
    this.drag = null;
    if (d?.trench) this.BuildTrenchLines();
    else if (d) this.UpdateInstances(d.ids);
  }

  // ------------------------------------------------------------------ 改动

  SelectIds(ids, opts = {}) {
    this.cameraSelected = false;
    this.inheritedSelected = null;
    this.model.Select(ids, opts);
    this.RevealSelection();
    this.revealPending = true;
    this.SyncSelectionLines();
    this.RenderTree();
    this.RenderInspector();
  }

  SelectInherited(id) {
    if (!this.inherited?.objectMap.has(id)) return;
    this.cameraSelected = false;
    this.model.Select([]);
    this.inheritedSelected = id;
    this.SyncSelectionLines();
    this.RenderTree();
    this.RenderInspector();
  }

  /** 改完以后刷新：ids 给了且只是挪位置 → 只改矩阵；否则整批重建。 */
  AfterEdit(ids = null, { structural = false } = {}) {
    // 壕沟改过：重挖地面（落地的物件跟着新地面走，所以整批重建）
    const carved = this.Recarve();
    if (carved === "terrain") { this.Rebuild(); structural = true; }
    else if (carved === "details") { this.BuildTrenchDressing(); if (structural || !ids) this.RebuildObjects(); }
    else if (structural || !ids) this.RebuildObjects();
    else this.UpdateInstances(ids);
    this.BuildTrenchLines();
    this.RenderTree();
    this.RenderInspector();
    this.UpdateDirty();
    if (this.previewFrame) this.previewSceneChanged = this.previewModelState !== this.model.state;
    this.SyncPreviewControls();
  }

  Undo() { const label = this.model.Undo(); if (label) { this.AfterEdit(null); this.Toast(`撤销：${label}`); } }
  Redo() { const label = this.model.Redo(); if (label) { this.AfterEdit(null); this.Toast(`重做：${label}`); } }

  DuplicateSelection() {
    const ids = [...this.model.selection];
    if (!ids.length) {
      if (this.inheritedSelected) this.Toast("继承物件为只读，请前往基线场景编辑");
      return;
    }
    this.model.Duplicate(ids, [1, 0, 1]);
    this.AfterEdit(null, { structural: true });
  }

  DeleteSelection() {
    if (this.model.trench) {
      const id = this.model.trench, point = this.model.trenchPoint;
      if (point !== null) {
        if (!this.model.DeleteTrenchPoint(id, point)) { this.Toast("一段沟至少要两个控制点"); return; }
        this.AfterEdit(null);
        this.Toast("删了一个控制点（Ctrl+Z 撤销）");
      } else {
        this.model.DeleteTrench(id);
        this.AfterEdit(null);
        this.Toast(`删了壕沟 ${id}（Ctrl+Z 撤销）`);
      }
      return;
    }
    const ids = [...this.model.selection];
    if (!ids.length) {
      if (this.inheritedSelected) this.Toast("继承物件为只读，请前往基线场景编辑");
      return;
    }
    this.model.Delete(ids);
    this.AfterEdit(null, { structural: true });
    this.Toast(`删了 ${ids.length} 个（Ctrl+Z 撤销）`);
  }

  // ------------------------------------------------------------------ 层级

  StageVisible(group) {
    return !this.hiddenStages.size || !this.hiddenStages.has(SplitGroup(group)[0]);
  }

  SetStageVisible(name, visible) {
    if (visible) this.hiddenStages.delete(name);
    else this.hiddenStages.add(name);
    try { localStorage.setItem(`sceneEditor.hiddenStages.${this.sceneId}`, JSON.stringify([...this.hiddenStages])); } catch { /* 不记 */ }
    const selected = this.model.Selected(), trench = this.model.FindTrench(this.model.trench);
    if (trench && !this.StageVisible(TrenchGroup(trench))) this.model.SelectTrench(null);
    else if (selected.some((obj) => !this.StageVisible(obj.group))) {
      this.model.Select(selected.filter((obj) => this.StageVisible(obj.group)).map((obj) => obj.id));
    }
    this.RebuildObjects();
    this.BuildTrenchLines();
    this.BuildTrenchDressing();
    this.RenderTree();
    this.RenderInspector();
    if (this.previewFrame) this.StartFormalPreview();
  }

  /** 物件在层级里的小图标与副标题：体块按语义色、道具 ◆、树 ♣、空气墙虚框、远景淡色。 */
  ItemBadge(obj) {
    const asset = SCENE_ASSETS[obj.asset] || {};
    if (obj.tag === "airWall") return { icon: "▢", cls: "air", sub: "空气墙" };
    if (asset.kind === "prop") return { icon: "◆", cls: "prop", sub: asset.label };
    if (asset.kind === "tree") return { icon: "♣", cls: "tree", sub: asset.label };
    if (obj.layer === "backdrop") return { icon: "·", cls: "bd", sub: asset.label };
    const material = SCENE_MATERIALS[obj.material];
    return { icon: "■", cls: "box", color: `#${this.SemanticColor(material?.semantic).toString(16).padStart(6, "0")}`, sub: material?.label || "" };
  }

  /** 选中的物件所在的文件夹都展开（Unity：在画面里点一个，层级里展开到它）。 */
  RevealSelection() {
    for (const id of this.model.selection) {
      const parts = SplitGroup(this.model.Find(id)?.group);
      for (let i = 1; i <= parts.length; i++) this.open.add(parts.slice(0, i).join("/"));
    }
    this.SaveOpen();
  }

  SaveOpen() {
    try { localStorage.setItem(`sceneEditor.open.${this.sceneId}`, JSON.stringify([...this.open])); } catch { /* 隐私窗口：不记 */ }
  }

  LoadOpen() {
    try { for (const path of JSON.parse(localStorage.getItem(`sceneEditor.open.${this.sceneId}`) || "[]")) this.open.add(path); } catch { /* 读不到：全收起 */ }
    try { for (const path of JSON.parse(localStorage.getItem(`sceneEditor.hiddenStages.${this.sceneId}`) || "[]")) this.hiddenStages.add(path); } catch { /* 读不到：全显示 */ }
  }

  RenderTree() {
    const tree = $("seTree");
    const scroll = tree.scrollTop;
    tree.textContent = "";
    const q = $("seSearch").value.trim().toLowerCase();
    const sel = this.model.selection;
    const Item = (obj, depth, showPath = false) => {
      const b = El("button", `seItem${sel.has(obj.id) ? " selected" : ""}`);
      b.style.paddingLeft = `${10 + depth * 14 + 13}px`;
      b.draggable = true;
      const badge = this.ItemBadge(obj);
      const icon = El("i", `seIcon ${badge.cls}`, badge.icon);
      if (badge.color) icon.style.color = badge.color;
      b.append(icon, El("span", "seName", obj.id), El("small", "", showPath ? (obj.group || "") : badge.sub));
      b.title = [`${obj.asset}${obj.material ? ` · ${obj.material}` : ""}`, obj.group ? `分组：${obj.group}` : ""].filter(Boolean).join("\n");
      b.addEventListener("click", (e) => this.SelectIds([obj.id], { toggle: e.ctrlKey || e.metaKey, add: e.shiftKey }));
      b.addEventListener("dblclick", () => this.Frame([obj.id]));
      // 拖到文件夹上 = 挪进那个分组（拖的是选中的之一就整批挪）
      b.addEventListener("dragstart", (e) => {
        const ids = sel.has(obj.id) ? [...sel] : [obj.id];
        e.dataTransfer.setData("text/x-scene-ids", JSON.stringify(ids));
        e.dataTransfer.effectAllowed = "move";
      });
      return b;
    };
    // 壕沟在层级里的一行（〰，副标题是沟型 · 套餐）
    const TrenchItem = (seg, depth, showPath = false) => {
      const b = El("button", `seItem seTrenchItem${this.model.trench === seg.id ? " selected" : ""}`);
      b.style.paddingLeft = `${10 + depth * 14 + 13}px`;
      const look = seg.look ? TRENCH_LOOKS[seg.look]?.label : "";
      b.append(El("i", "seIcon trench", "〰"), El("span", "seName", seg.id),
        El("small", "", showPath ? TrenchGroup(seg) : [TRENCH_PRESETS[seg.preset]?.label, look].filter(Boolean).join(" · ")));
      b.title = `样条壕沟 · ${seg.points.length} 个控制点${seg.note ? `
${seg.note}` : ""}`;
      b.addEventListener("click", () => this.SelectTrench(seg.id));
      b.addEventListener("dblclick", () => { this.SelectTrench(seg.id); this.FrameTrench(seg.id); });
      return b;
    };
    if (q) {
      const trenchHits = this.model.trenchSegments.filter((s) => `${s.id} ${TrenchGroup(s)} ${s.preset} ${s.look || ""} 壕沟 ${s.note || ""}`.toLowerCase().includes(q));
      for (const seg of trenchHits) tree.append(TrenchItem(seg, 0, true));
      const hits = this.model.objects.filter(o => `${o.id} ${o.group || ""} ${o.asset} ${o.material || ""} ${o.meta?.prop || ""}`.toLowerCase().includes(q));
      $("seCount").textContent = `搜到 ${hits.length + trenchHits.length} 个`;
      for (const obj of hits.slice(0, E.searchLimit)) tree.append(Item(obj, 0, true));
      if (hits.length > E.searchLimit) tree.append(El("div", "seMore", `还有 ${hits.length - E.searchLimit} 个，搜得再细一点`));
      return;
    }
    const root = this.model.Hierarchy();
    $("seCount").textContent = `${root.count - this.model.trenchSegments.length} 个物件、${this.model.trenchSegments.length} 段壕沟${this.inherited ? ` · 另继承 ${this.inheritedObjectCount} 件` : ""}`;
    if (this.inherited) {
      const card = El("details", "seInheritTreeCard");
      const summary = El("summary");
      summary.append(
        El("span", "", `↳ 继承北段 (z<${this.inherited.info.maxZ})`),
        El("small", "", `${this.inheritedObjectCount} 件`),
      );
      const body = El("div", "seInheritTreeBody");
      const stageCounts = new Map();
      for (const obj of this.inherited.objects) {
        const top = SplitGroup(obj.group)[0] || "未分组";
        stageCounts.set(top, (stageCounts.get(top) || 0) + 1);
      }
      body.append(El("div", "seInheritTreeRow", `来源：${this.inherited.info.scene}`));
      for (const [name, cnt] of [...stageCounts.entries()].slice(0, 6)) {
        const row = El("div", "seInheritTreeRow");
        row.append(El("span", "", name), El("code", "", `${cnt} 件`));
        body.append(row);
      }
      const jump = El("button", "", `前往 ${this.inherited.info.scene} 编辑 ↗`);
      jump.type = "button";
      jump.addEventListener("click", () => this.SwitchScene(this.inherited.info.scene));
      body.append(jump);
      card.append(summary, body);
      tree.append(card);
    }
    const Folder = (node, depth) => {
      const open = this.open.has(node.path);
      const head = El("button", `seFolder${open ? " open" : ""}`);
      head.setAttribute("aria-expanded", String(open));
      head.style.paddingLeft = `${6 + depth * 14}px`;
      const InPath = (g) => g === node.path || g.startsWith(`${node.path}/`);
      const selectedTrench = this.model.FindTrench(this.model.trench);
      const selectedInside = [...sel].some(id => InPath(this.model.Find(id)?.group || "")) || (selectedTrench && InPath(TrenchGroup(selectedTrench)));
      if (selectedInside) head.classList.add("hasSel");
      head.append(El("i", "seTwisty", open ? "▾" : "▸"), El("span", "seName", node.name), El("small", "", String(node.count)));
      head.title = `${node.path}（${node.count} 个）\n单击展开 / 收起 · 双击选中里面全部`;
      head.addEventListener("click", () => { if (open) this.open.delete(node.path); else this.open.add(node.path); this.SaveOpen(); this.RenderTree(); });
      head.addEventListener("dblclick", () => { this.open.add(node.path); this.SelectIds(this.IdsUnder(node)); this.Frame(); });
      head.addEventListener("dragover", (e) => { if (e.dataTransfer.types.includes("text/x-scene-ids")) { e.preventDefault(); head.classList.add("drop"); } });
      head.addEventListener("dragleave", () => head.classList.remove("drop"));
      head.addEventListener("drop", (e) => {
        e.preventDefault(); head.classList.remove("drop");
        const ids = JSON.parse(e.dataTransfer.getData("text/x-scene-ids") || "[]").filter(id => this.model.Find(id));
        if (!ids.length) return;
        this.model.SetField(ids, "group", node.path, `挪进 ${node.path}`);
        this.open.add(node.path);
        this.AfterEdit(null);
        this.Toast(`${ids.length} 个挪进「${node.path}」`);
      });
      if (depth === 0 && StageName.test(node.name)) {
        const active = this.StageVisible(node.path);
        const row = El("div", `seFolderRow${active ? "" : " off"}`);
        const visibility = El("input", "seStageVisible");
        visibility.type = "checkbox";
        visibility.checked = active;
        visibility.dataset.stage = node.name;
        visibility.setAttribute("aria-label", `显示 ${node.name}`);
        visibility.title = `在视口中显示 ${node.name}`;
        visibility.addEventListener("change", () => this.SetStageVisible(node.path, visibility.checked));
        row.append(head, visibility);
        tree.append(row);
      } else tree.append(head);
      if (!open) return;
      for (const child of node.folders.values()) Folder(child, depth + 1);
      for (const id of node.trenches || []) tree.append(TrenchItem(this.model.FindTrench(id), depth + 1));
      const selected = node.ids.filter(id => sel.has(id));
      const shown = [...new Set([...selected, ...node.ids.slice(0, E.treeLimit)])];
      for (const id of shown) tree.append(Item(this.model.Find(id), depth + 1));
      if (node.ids.length > shown.length) {
        const more = El("div", "seMore", `还有 ${node.ids.length - shown.length} 个（用搜索找）`);
        more.style.paddingLeft = `${10 + (depth + 1) * 14 + 13}px`;
        tree.append(more);
      }
    };
    for (const node of root.folders.values()) Folder(node, 0);
    for (const id of root.ids) tree.append(Item(this.model.Find(id), 0));
    tree.scrollTop = scroll;
    // 刚在画面里点选：滚到它（平时重画不动滚动位置）
    if (this.revealPending) { this.revealPending = false; tree.querySelector(".seItem.selected")?.scrollIntoView({ block: "nearest" }); }
  }

  /** 文件夹下面（含子文件夹）所有物件 id。 */
  IdsUnder(node) {
    const out = [...node.ids];
    for (const child of node.folders.values()) out.push(...this.IdsUnder(child));
    return out;
  }

  // ------------------------------------------------------------------ 检视卡片

  /** 检视用的控件工厂：都在 change（或拖完）时才写进撤销记录。 */
  InspectorKit(box, ids, err) {
    const kit = {};
    kit.Section = (key, title, { headerToggle = null, defaultOpen = true } = {}) => {
      const section = El("section", "seComp");
      const head = El("div", "seCompHead");
      const disclosure = El("button", "seCompDisclosure");
      const twisty = El("i", "seTwisty");
      twisty.setAttribute("aria-hidden", "true");
      disclosure.append(twisty, El("span", "seCompTitle", title));
      head.append(disclosure);
      if (headerToggle) {
        const input = El("input"); input.type = "checkbox"; input.checked = headerToggle.checked; input.title = headerToggle.title || "";
        input.setAttribute("aria-label", headerToggle.title || title);
        input.addEventListener("change", () => headerToggle.onChange(input.checked));
        head.append(input);
      }
      const body = El("div", "seCompBody");
      body.id = `seComponent-${key}`;
      disclosure.setAttribute("aria-controls", body.id);
      const SetOpen = (open) => {
        body.hidden = !open;
        disclosure.setAttribute("aria-expanded", String(open));
        section.classList.toggle("open", open);
        twisty.textContent = open ? "▾" : "▸";
      };
      SetOpen(this.folds.get(key) ?? defaultOpen);
      disclosure.addEventListener("click", () => {
        const open = body.hidden;
        SetOpen(open);
        this.folds.set(key, open);
        this.SaveFolds();
      });
      section.append(head, body);
      box.append(section);
      return body;
    };
    kit.Row = (body, label, ...controls) => {
      const row = El("div", "seProp");
      const name = El("label", "seLabel", label);
      name.title = label;
      const value = El("div", "seValue");
      value.append(...controls);
      row.append(name, value);
      body.append(row);
      return row;
    };
    kit.Num = (value, onChange, { step = 0.1, disabled = false, placeholder = "" } = {}) => {
      const input = El("input"); input.type = "number"; input.step = String(step);
      input.value = Number.isFinite(value) ? String(value) : ""; input.disabled = disabled; input.placeholder = placeholder;
      input.addEventListener("change", () => { const v = Number(input.value); if (input.value !== "" && Number.isFinite(v)) onChange(v); else input.classList.add("bad"); });
      return input;
    };
    /** X / Y / Z 三格：axis 字按住左右拖调数（每像素 step），松手才记一步撤销。 */
    kit.Vec = (values, onChange, { step = 0.05, precision = null, disabled = [false, false, false], placeholders = ["", "", ""], axes = ["X", "Y", "Z"] } = {}) => {
      const wrap = El("div", "seVec");
      values.forEach((v, i) => {
        const cell = El("div", "seAxis");
        const tag = El("span", `seAxisTag a${i}`, axes[i]);
        const displayed = precision !== null && Number.isFinite(v) ? Number(v.toFixed(precision)) : v;
        const input = kit.Num(displayed, (nv) => onChange(i, nv), { step, disabled: disabled[i], placeholder: placeholders[i] });
        input.setAttribute("aria-label", axes[i]);
        if (displayed !== v) input.title = String(v);
        if (!disabled[i]) {
          tag.title = "按住左右拖调数";
          tag.addEventListener("pointerdown", (e) => {
            e.preventDefault();
            tag.setPointerCapture(e.pointerId);
            const x0 = e.clientX, v0 = Number.isFinite(v) ? v : 0, start = input.value;
            let delta = 0;
            const Move = (m) => {
              delta = Math.round(m.clientX - x0) * step * (m.shiftKey ? 10 : 1);
              input.value = delta ? String(Number((v0 + delta).toFixed(3))) : start;
            };
            const Up = () => {
              tag.removeEventListener("pointermove", Move); tag.removeEventListener("pointerup", Up);
              if (delta) onChange(i, Number(input.value));
            };
            tag.addEventListener("pointermove", Move); tag.addEventListener("pointerup", Up);
          });
        }
        cell.append(tag, input);
        wrap.append(cell);
      });
      return wrap;
    };
    kit.Text = (value, onChange, placeholder = "") => {
      const input = El("input"); input.type = "text"; input.value = value || ""; input.placeholder = placeholder;
      input.addEventListener("change", () => onChange(input.value.trim()));
      return input;
    };
    kit.Check = (label, checked, onChange) => {
      const l = El("label", "seCheck"); const input = El("input"); input.type = "checkbox"; input.checked = checked;
      input.addEventListener("change", () => onChange(input.checked));
      l.append(input, document.createTextNode(label));
      return l;
    };
    kit.Select = (options, value, onChange) => {
      const s = El("select");
      for (const [v, text] of options) s.append(new Option(text, v));
      s.value = value;
      s.addEventListener("change", () => onChange(s.value));
      return s;
    };
    kit.MaterialOptions = () => Object.entries(SCENE_MATERIALS).map(([mid, m]) => [mid, `${m.label}（${mid.replace(/^Whitebox\//, "")}）`]);
    kit.GroupInput = (value, onChange) => {
      const input = kit.Text(value, onChange, "06–10/建筑/WN1（「/」分层）");
      const dl = El("datalist"); dl.id = "seGroupPaths";
      for (const p of this.FolderPaths()) dl.append(new Option(p));
      box.append(dl); input.setAttribute("list", dl.id);
      return input;
    };
    kit.Set = (key, value, label, structural = false) => { this.model.SetField(ids, key, value, label); this.AfterEdit(structural ? null : ids, { structural }); };
    return kit;
  }

  /** 所有文件夹路径（分组输入框的候选）。 */
  FolderPaths() {
    const out = [];
    const Walk = (node) => { for (const child of node.folders.values()) { out.push(child.path); Walk(child); } };
    Walk(this.model.Hierarchy());
    return out;
  }

  SaveFolds() {
    try { localStorage.setItem("sceneEditor.folds", JSON.stringify([...this.folds])); } catch { /* 不记 */ }
  }

  LoadFolds() {
    try { this.folds = new Map(JSON.parse(localStorage.getItem("sceneEditor.folds") || "[]")); } catch { this.folds = new Map(); }
  }

  ChangeShot(pose) {
    try {
      if (!IsSceneCamera(pose)) throw new Error("机位的位置、角度或视角无效");
      this.model.SetCamera(pose);
      this.ApplyCamera();
      this.SyncShotGizmo();
      this.UpdateDirty();
    } catch (error) { this.Toast(error.message); }
    this.RenderInspector();
  }

  RenderShotInspector(box) {
    const pose = this.model.doc.camera;
    const section = El("section", "seComp open");
    const head = El("div", "seObjHead");
    head.append(El("strong", "seObjTitle", "原画机位"));
    section.append(head);
    box.append(section);
    const k = this.InspectorKit(box, [], El("div", "seError"));
    k.Row(section, "位置", k.Vec(pose.position, (axis, value) => {
      const position = [...pose.position];
      position[axis] = value;
      this.ChangeShot({ ...pose, position });
    }, { step: .01, precision: 2 }));
    for (const [key, label] of [["yawDeg", "朝向 °"], ["pitchDeg", "俯仰 °"], ["fovDeg", "垂直视角 °"]]) {
      const input = k.Num(pose[key], (value) => this.ChangeShot({ ...pose, [key]: value }), { step: .1 });
      input.setAttribute("aria-label", label);
      k.Row(section, label, input);
    }
  }

  RenderInheritedInspector(box, obj) {
    const { info } = this.inherited;
    const asset = SCENE_ASSETS[obj.asset] || {};
    const material = SCENE_MATERIALS[obj.material];
    const card = El("section", "seObjectCard seInheritedCard");
    const head = El("div", "seObjHead");
    head.append(
      El("div", "seInheritedBadge", `↳ 继承自 ${info.scene}（z < ${info.maxZ} · 只读）`),
      El("div", "seObjTitle", obj.id),
      El("p", "seMuted", "此物件属于基线场景的继承北段，在当前合并分支中按原貌参与整图预览，修改请前往基线场景。"),
    );
    const meta = El("div", "seObjMeta");
    const k = this.InspectorKit(box, [], El("div"));
    k.Row(meta, "资产", El("span", "seId", asset.label || obj.asset));
    if (material) k.Row(meta, "材质", El("span", "seId", `${material.label}（${obj.material}）`));
    if (obj.group) k.Row(meta, "分组", El("span", "seId", obj.group));
    const y = this.BaseY(obj, this.inherited);
    k.Row(meta, "位置", El("code", "", `${Fixed(obj.pos[0], 2)}, ${Fixed(y, 2)}, ${Fixed(obj.pos[2], 2)}${obj.pos[1] === null ? "（落地）" : ""}`));
    if (obj.size) k.Row(meta, "尺寸 m", El("code", "", obj.size.map((v) => Fixed(v, 2)).join(" × ")));
    card.append(head, meta);
    box.append(card);
    const actions = El("div", "seButtons seInspectorButtons");
    const frame = El("button", "", "看它（F）");
    frame.type = "button";
    frame.addEventListener("click", () => this.FrameInherited(obj.id));
    const editBase = El("button", "sePrimary", `在 ${info.scene} 中编辑 ↗`);
    editBase.type = "button";
    editBase.addEventListener("click", () => this.SwitchScene(info.scene, { select: obj.id }));
    actions.append(frame, editBase);
    box.append(actions);
  }

  RenderInspector() {
    const box = $("seInspector");
    box.textContent = "";
    if (this.cameraSelected && this.model.doc.camera) { this.RenderShotInspector(box); return; }
    if (this.inheritedSelected && this.inherited?.objectMap.has(this.inheritedSelected)) {
      this.RenderInheritedInspector(box, this.inherited.objectMap.get(this.inheritedSelected));
      return;
    }
    if (this.model.trench) { this.RenderTrenchInspector(box, this.model.FindTrench(this.model.trench)); return; }
    const list = this.model.Selected();
    if (!list.length) { box.append(El("p", "seMuted seEmpty", "在视图或层级中选中物件。")); return; }
    if (list.length > 1) { this.RenderMulti(box, list); return; }
    const obj = list[0], asset = SCENE_ASSETS[obj.asset] || {}, ids = [obj.id];
    const err = El("div", "seError");
    const k = this.InspectorKit(box, ids, err);
    const backdrop = obj.layer === "backdrop";

    // 实例卡：可见性、名称、来源和分组
    const objectCard = El("section", "seObjectCard");
    const head = El("div", "seObjHead");
    const visible = El("input"); visible.type = "checkbox"; visible.checked = obj.visual !== false; visible.title = "看得见（不勾 = 只要碰撞不画，比如空气墙）";
    visible.setAttribute("aria-label", "可见");
    visible.disabled = backdrop;
    visible.addEventListener("change", () => k.Set("visual", visible.checked ? undefined : false, "改看得见", true));
    const name = k.Text(obj.id, (v) => { try { this.model.Rename(obj.id, v); this.AfterEdit(null); } catch (error) { err.textContent = error.message; name.classList.add("bad"); } });
    name.classList.add("seObjName");
    name.setAttribute("aria-label", "物件名称");
    const line = El("div", "seObjLine"); line.append(visible, name);
    head.append(line, err);
    const meta = El("div", "seObjMeta");
    const source = El("span", "seId seSource", asset.label || obj.asset);
    source.title = [obj.asset, asset.note].filter(Boolean).join(" · ");
    k.Row(meta, "模型来源", source);
    k.Row(meta, "分组", k.GroupInput(obj.group, (v) => k.Set("group", v || undefined, "改分组", true)));
    objectCard.append(head, meta);
    box.append(objectCard);

    const t = k.Section("transform", "变换");
    const grounded = obj.pos[1] === null;
    const SetPos = (i, v) => { const p = [...obj.pos]; p[i] = v; k.Set("pos", p, "改位置"); };
    k.Row(t, "位置", k.Vec(obj.pos, SetPos, { precision: 2, disabled: [false, grounded, false], placeholders: ["", grounded ? Fixed(this.GroundY(obj)) : "", ""] }));
    k.Row(t, "", k.Check(" 落地（Y 跟着地形走）", grounded, (on) => { this.model.SetGrounded(ids, on, (o) => this.GroundY(o)); this.AfterEdit(ids); }));
    k.Row(t, "朝向", k.Vec([obj.yawDeg || 0], (i, v) => k.Set("yawDeg", v, "改朝向"), { step: 1, axes: ["Y°"], disabled: [false], placeholders: [""] }));
    if (asset.sized) {
      const SetSize = (i, v) => { const s = [...obj.size]; s[i] = Math.max(0.02, v); k.Set("size", s, "改尺寸"); };
      k.Row(t, "尺寸 m", k.Vec(obj.size, SetSize, { precision: 2, axes: ["宽", "高", "深"] }));
    }

    // 外观
    if (asset.kind === "box" || obj.material) {
      const look = k.Section("look", "外观");
      k.Row(look, "材质", k.Select(k.MaterialOptions(), obj.material, (v) => k.Set("material", v, "改材质", true)));
    }

    if (!backdrop) {
      // 碰撞（标题条上的勾 = 挡人）
      const col = k.Section("collider", "碰撞", { headerToggle: { checked: obj.solid !== false, title: "挡人（不勾 = 穿得过去）", onChange: (on) => k.Set("solid", on ? undefined : false, "改挡人") } });
      k.Row(col, "空气墙", k.Check(" 只挡玩家、看不见", obj.tag === "airWall", (on) => {
        this.model.SetField(ids, "tag", on ? "airWall" : undefined, "改空气墙");
        if (on) this.model.SetField(ids, "visual", false, "改看得见");
        this.AfterEdit(null, { structural: true });
      }));
      if (obj.tag && obj.tag !== "airWall") k.Row(col, "标签", El("code", "", obj.tag));
      k.Row(col, "翻越", k.Check(" 不能翻过去", obj.noClimb === true, (on) => k.Set("noClimb", on ? true : undefined, "改不能翻")));
      k.Row(col, "站上去", k.Check(" 演员能站在上面（桥面、走道）", obj.standOn === true, (on) => k.Set("standOn", on ? true : undefined, "改能站上去")));
    }

    // 参数 / 附加数据（JSON，默认收起）
    for (const [key, label] of [["params", "参数"], ["meta", "附加数据"]]) {
      if (key === "params" && asset.sized && !obj.params) continue;
      const body = k.Section(key, `${label}（JSON）`, { defaultOpen: false });
      const area = El("textarea");
      area.value = obj[key] ? JSON.stringify(obj[key], null, 1) : "";
      area.placeholder = key === "meta" ? "其余原样带过去的字段（prop、loophole……）" : "";
      area.addEventListener("change", () => {
        const text = area.value.trim();
        if (!text) { k.Set(key, undefined, `清空${label}`, true); return; }
        try {
          const value = JSON.parse(text);
          if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("要是 JSON 对象");
          k.Set(key, value, `改${label}`, true);
        } catch (error) { area.classList.add("bad"); err.textContent = `${label}：${error.message}`; }
      });
      body.append(area);
    }
    this.InspectorButtons(box);
  }

  /**
   * 壕沟的检视（docs/Data_Scene.md §9、docs/Data_TrenchDetails.md）：走向（控制点）、断面（沟型 + 段上改的数，空着 = 用沟型的）、
   * 表现套餐、每一项细节（标题条上的勾 = 开关，展开改参数，灰字是缺省值）、沿沟变化（JSON）。
   */
  RenderTrenchInspector(box, seg) {
    const id = seg.id, err = El("div", "seError");
    const k = this.InspectorKit(box, [], err);
    const compiled = this.trenchPlan?.segments.find((s) => s.id === id);
    const preset = TRENCH_PRESETS[seg.preset] || TRENCH_PRESETS.communication;
    const Edit = (fn) => { fn(); this.AfterEdit(null); };
    const SetField = (key, value, label) => Edit(() => this.model.SetTrenchField(id, key, value, label));

    const objectCard = El("section", "seObjectCard");
    const head = El("div", "seObjHead");
    const name = k.Text(id, (v) => { try { this.model.RenameTrench(id, v); this.AfterEdit(null); } catch (error) { err.textContent = error.message; name.classList.add("bad"); } });
    name.classList.add("seObjName");
    const line = El("div", "seObjLine"); line.append(El("i", "seIcon trench", "〰"), name);
    head.append(line, err);
    const meta = El("div", "seObjMeta");
    k.Row(meta, "类型", El("span", "seId", "样条壕沟"), El("code", "", `${seg.points.length} 个控制点 · ${compiled ? compiled.path.length.toFixed(1) : "—"} m`));
    k.Row(meta, "分组", k.GroupInput(seg.group, (v) => SetField("group", v || undefined, "改壕沟分组")));
    k.Row(meta, "备注", k.Text(seg.note, (v) => SetField("note", v || undefined, "改壕沟备注"), "这段沟是干什么的"));
    objectCard.append(head, meta);
    box.append(objectCard);

    // 走向
    const path = k.Section("trench.path", "走向");
    const pi = this.model.trenchPoint;
    if (pi !== null && seg.points[pi]) {
      k.Row(path, `点 ${pi + 1}`, k.Vec(seg.points[pi], (i, v) => {
        const p = [...seg.points[pi]]; p[i] = v;
        Edit(() => this.model.MoveTrenchPoint(id, pi, p[0], p[1]));
      }, { step: 0.1, axes: ["X", "Z"], disabled: [false, false], placeholders: ["", ""] }));
    } else path.append(El("p", "seNote", "画面里按住金色控制点拖（Ctrl 吸附半米）；点一下选中一个点，这里就能填数。"));
    const buttons = El("div", "seButtons");
    const addAfter = El("button", "", pi !== null ? "在这个点后面加点" : "在末尾加点");
    addAfter.addEventListener("click", () => {
      const at = pi !== null ? pi : seg.points.length - 1;
      const a = seg.points[at], b = seg.points[at + 1] || [a[0] + (a[0] - seg.points[at - 1][0]) * 0.5, a[1] + (a[1] - seg.points[at - 1][1]) * 0.5];
      Edit(() => this.model.InsertTrenchPoint(id, at, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2));
    });
    const delPoint = El("button", "", "删这个点"); delPoint.disabled = pi === null || seg.points.length <= 2;
    delPoint.addEventListener("click", () => Edit(() => this.model.DeleteTrenchPoint(id, pi)));
    const reverse = El("button", "", "掉头（弃土左右对调）");
    reverse.title = "控制点倒过来排：弧长从另一头数起，bermSide 的 plus / minus 跟着对调";
    reverse.addEventListener("click", () => Edit(() => this.model.MutateTrench("壕沟掉头", id, (s) => {
      s.points.reverse();
      if (s.bermSide === "plus") s.bermSide = "minus"; else if (s.bermSide === "minus") s.bermSide = "plus";
    })));
    buttons.append(addAfter, delPoint, reverse);
    path.append(buttons, El("p", "seNote", "选中沟时 Alt + 点地面 = 在最近的那一截加一个点；Del = 删选中的点（没选点就删整段沟）。"));

    // 断面
    const sec = k.Section("trench.section", "断面");
    k.Row(sec, "沟型", k.Select(Object.entries(TRENCH_PRESETS).map(([key, p]) => [key, `${p.label}（${key}）`]), seg.preset, (v) => SetField("preset", v, "改沟型")));
    const nominal = compiled?.nominal || {};
    for (const [key, label, step] of [["depth", "深 m", 0.05], ["floorW", "沟底宽 m", 0.1], ["bankW", "沟壁宽 m", 0.05], ["bermH", "弃土高 m", 0.05],
      ["bermW", "弃土宽 m", 0.1], ["cornerRadiusM", "拐角圆 m", 0.1], ["jitterScale", "毛糙 倍", 0.1], ["widthScale", "宽度 倍", 0.05]]) {
      const fallback = key === "jitterScale" || key === "widthScale" ? 1 : preset[key] ?? nominal[key];
      const input = k.Num(seg[key], (v) => SetField(key, v, `改壕沟 ${label}`), { step, placeholder: Number.isFinite(fallback) ? `${Number(fallback.toFixed(2))}（沟型）` : "" });
      const clear = El("button", "seMini", "×"); clear.title = "清掉，用沟型的"; clear.disabled = seg[key] === undefined;
      clear.addEventListener("click", () => SetField(key, undefined, `清壕沟 ${label}`));
      k.Row(sec, label, input, clear);
    }
    k.Row(sec, "弃土在哪侧", k.Select([["", `（沟型：${preset.bermSide}）`], ["both", "两侧 both"], ["plus", "前进方向右手 plus"], ["minus", "前进方向左手 minus"], ["none", "不堆 none"]],
      seg.bermSide || "", (v) => SetField("bermSide", v || undefined, "改弃土侧")));
    sec.append(El("p", "seNote", "空着的格子用沟型的数（灰字）。毛糙 0 = 宽深不抖、沟沿不起毛。"));

    // 表现套餐
    const lookBody = k.Section("trench.look", "表现套餐");
    const networkLook = this.model.doc.trenches?.look;
    k.Row(lookBody, "套餐", k.Select([["", networkLook ? `（跟整张网：${TRENCH_LOOKS[networkLook]?.label}）` : "（缺省：现行第一关的样子）"],
      ...Object.entries(TRENCH_LOOKS).map(([key, l]) => [key, `${l.label}（${key}）`])], seg.look || "", (v) => SetField("look", v || undefined, "改壕沟套餐")));
    const lookNote = seg.look ? TRENCH_LOOKS[seg.look]?.note : "缺省：木护壁、踏板关，射击位、杂物开，土面细节全开。";
    lookBody.append(El("p", "seNote", `${lookNote} 下面每一项还能单独改，改过的盖过套餐。`));

    // 每一项细节
    const details = compiled?.details;
    for (const [key, info] of Object.entries(TRENCH_DETAILS)) {
      const eff = details ? EffectiveTrenchDetail(details, key) : { on: true };
      const own = seg.details?.[key];
      const changed = own !== undefined;
      const body = k.Section(`trench.detail.${key}`, `${info.label}${info.kind === "dressing" ? "" : " ·土面"}${changed ? " ●" : ""}`, {
        defaultOpen: false,
        headerToggle: { checked: eff.on, title: `${info.note}（勾 = 生成）`, onChange: (on) => Edit(() => this.model.SetTrenchDetail(id, key, on)) },
      });
      body.append(El("p", "seNote", info.note + (info.kind === "earth" ? "（只有正式场景画）" : "")));
      for (const [param, spec] of Object.entries(info.params)) {
        const mine = own && typeof own === "object" ? own[param] : undefined;
        const value = eff[param];
        const Put = (v) => Edit(() => this.model.SetTrenchDetail(id, key, { [param]: v }));
        let control;
        if (spec.type === "side") control = k.Select([["plus", "plus（前进方向右手）"], ["minus", "minus（左手）"]], value || "minus", Put);
        else if (spec.type === "list") control = k.Text((value || []).join(", "), (v) => Put(v ? v.split(/[,，\s]+/).filter(Boolean) : undefined), "Prop/militaryCrateClosed, …");
        else if (spec.type === "range") {
          control = k.Vec(Array.isArray(value) ? value : [0, 0], (i, v) => { const r = [...(Array.isArray(value) ? value : [0, 0])]; r[i] = v; Put(r); },
            { step: spec.step, axes: ["下", "上"], disabled: [false, false], placeholders: ["", ""] });
        } else control = k.Num(mine, Put, { step: spec.step, placeholder: Number.isFinite(value) ? String(Number(value.toFixed(4))) : "" });
        if (spec.type !== "range" && spec.type !== "side" && spec.type !== "list" && mine === undefined) control.classList.add("seDefault");
        k.Row(body, `${spec.label}${spec.unit ? ` ${spec.unit}` : ""}`, control);
      }
      if (changed) {
        const reset = El("button", "", "这一项回到套餐 / 缺省");
        reset.addEventListener("click", () => Edit(() => this.model.SetTrenchDetail(id, key, undefined)));
        const row = El("div", "seButtons"); row.append(reset); body.append(row);
      }
    }

    // 沿沟变化（JSON）
    for (const [key, label, hint] of [["depthAlong", "沿沟深度", "[[弧长 m, 深 m], …]：只改沟底，沟沿仍在原地面上"],
      ["datumAlong", "沿沟基准面抬降", "[[弧长 m, 抬高 m], …]：整个断面连沟沿一起挪（坡道顺坎切下去）"],
      ["collapses", "塌方", "[{ \"s\": 弧长, \"halfLenM\": 1.4, \"featherM\": 1.2, \"depthM\": 0.3 }, …]"]]) {
      const body = k.Section(`trench.${key}`, `${label}（JSON）`, { defaultOpen: false });
      const area = El("textarea");
      area.value = seg[key] ? JSON.stringify(seg[key]) : "";
      area.placeholder = hint;
      area.addEventListener("change", () => {
        const text = area.value.trim();
        if (!text) { SetField(key, undefined, `清${label}`); return; }
        try {
          const value = JSON.parse(text);
          if (!Array.isArray(value)) throw new Error("要是数组");
          SetField(key, value, `改${label}`);
        } catch (error) { area.classList.add("bad"); err.textContent = `${label}：${error.message}`; }
      });
      body.append(El("p", "seNote", hint), area);
    }

    const row = El("div", "seButtons seInspectorButtons");
    const frame = El("button", "", "看它（F）"); frame.addEventListener("click", () => this.FrameTrench(id));
    const del = El("button", "", "删这段沟"); del.addEventListener("click", () => { this.model.SelectTrench(id); this.model.trenchPoint = null; this.DeleteSelection(); });
    row.append(frame, del);
    box.append(row);
    const check = this.model.Validate();
    if (!check.ok) err.textContent = check.errors.filter((e) => e.startsWith("trenches")).slice(0, 3).join("；");
  }

  RenderMulti(box, list) {
    const ids = list.map(o => o.id);
    const k = this.InspectorKit(box, ids, El("div"));
    const objectCard = El("section", "seObjectCard");
    const head = El("div", "seObjHead");
    head.append(El("div", "seObjTitle", `选中 ${list.length} 个`), El("p", "seMuted", ids.slice(0, 8).join("、") + (ids.length > 8 ? " ……" : "")));
    const meta = El("div", "seObjMeta");
    const group = k.GroupInput("", (v) => { this.model.SetField(ids, "group", v || undefined, "改分组"); this.AfterEdit(null); });
    group.placeholder = "一起挪到这个分组";
    k.Row(meta, "分组", group);
    objectCard.append(head, meta);
    box.append(objectCard);
    const t = k.Section("transform", "变换");
    const row = El("div", "seButtons");
    const on = El("button", "", "都落地"); on.addEventListener("click", () => { this.model.SetGrounded(ids, true); this.AfterEdit(ids); });
    const off = El("button", "", "都取消落地"); off.addEventListener("click", () => { this.model.SetGrounded(ids, false, (o) => this.GroundY(o)); this.AfterEdit(ids); });
    row.append(on, off);
    t.append(row);
    const boxes = list.filter(o => SCENE_ASSETS[o.asset]?.kind === "box").map(o => o.id);
    if (boxes.length) {
      const look = k.Section("look", "外观");
      k.Row(look, "材质", k.Select([["", "（不改）"], ...k.MaterialOptions()], "", (v) => { if (v) { this.model.SetField(boxes, "material", v, "改材质"); this.AfterEdit(null, { structural: true }); } }));
    }
    this.InspectorButtons(box);
  }

  InspectorButtons(box) {
    const row = El("div", "seButtons seInspectorButtons");
    const frame = El("button", "", "看它（F）"); frame.addEventListener("click", () => this.Frame());
    const dup = El("button", "", "复制（Ctrl+D）"); dup.addEventListener("click", () => this.DuplicateSelection());
    const del = El("button", "", "删除（Del）"); del.addEventListener("click", () => this.DeleteSelection());
    row.append(frame, dup, del);
    box.append(row);
  }

  // ------------------------------------------------------------------ 存盘与同步

  UpdateDirty() {
    const dirty = this.model?.dirty;
    const node = $("seDirty");
    node.textContent = dirty ? "未保存" : "已保存";
    node.title = dirty ? "有未保存的改动（Ctrl+S 保存）" : "已和盘上一致";
    node.classList.toggle("dirty", !!dirty);
    $("seUndo").disabled = !this.model?.undo.length;
    $("seRedo").disabled = !this.model?.redo.length;
    const saveLabel = $("seSaveLabel");
    if (saveLabel) saveLabel.textContent = this.writable ? "保存" : "保存（下载）";
    else $("seSave").textContent = this.writable ? "保存" : "保存（下载）";
    document.title = `${dirty ? "● " : ""}场景编辑器 · ${this.sceneId}`;
  }

  async Save() {
    if (!this.model) return;
    const check = this.model.Validate();
    if (!check.ok) { this.Banner(`场景过不了校验，没存：${check.errors.slice(0, 4).join("；")}`); return false; }
    if (!this.writable) { this.Download(); this.Toast("线上存不了盘，已下载场景文件：替换 Scenes 里那份再提交"); return false; }
    const doc = this.model.ToDoc();
    const response = await fetch("/__scene/save", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scene: this.sceneId, doc, revision: this.revision }),
    });
    const result = await response.json().catch(() => ({ ok: false, error: `HTTP ${response.status}` }));
    if (response.ok && result.ok) {
      this.revision = result.revision;
      this.model.MarkSaved();
      this.UpdateDirty();
      this.HideBanner();
      this.Toast(`已保存 ${result.file}`);
      return true;
    }
    if (response.status === 409) {
      this.Banner("场景在别处改过了（版本号对不上），没存。", [
        ["重新读取（丢掉我的改动）", () => this.LoadScene().catch((error) => this.Fail(error))],
        ["下载我的版本", () => this.Download()],
      ]);
    } else this.Banner(`没存上：${result.error || response.status}${result.details ? `（${result.details.slice(0, 3).join("；")}）` : ""}`);
    return false;
  }

  Download() {
    const blob = new Blob([FormatSceneJson(this.model.ToDoc())], { type: "application/json" });
    const a = El("a");
    a.href = URL.createObjectURL(blob);
    a.download = SceneFileName(this.sceneId);
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  async Poll() {
    if (!this.model || this.drag || this.polling) return;
    this.polling = true;
    try {
      let changed = false;
      if (this.writable) {
        const response = await fetch("/__scene/status", { cache: "no-store" });
        const status = response.ok ? await response.json() : null;
        const rev = status?.revisions?.[this.sceneId];
        changed = !!rev && rev !== this.revision;
      } else {
        const url = new URL(`../${SceneDir(this.sceneId)}/${SceneFileName(this.sceneId)}`, location.href);
        const response = await fetch(`${url.href}?t=${Date.now()}`, { method: "HEAD", cache: "no-store" });
        const stamp = response.ok ? this.StampOf(response) : null;
        changed = !!stamp && !!this.stamp && stamp !== this.stamp;
      }
      if (!changed) return;
      if (!this.model.dirty) {
        await this.LoadScene({ keepCamera: true });
        this.Toast("场景文件在外面改了，已重新读取");
      } else if (!this.conflictShown) {
        this.conflictShown = true;
        this.Banner("场景文件在外面改了，而你这边也有没保存的改动。", [
          ["重新读取（丢掉我的改动）", () => { this.conflictShown = false; this.LoadScene().catch((error) => this.Fail(error)); }],
          ["先不管", () => this.HideBanner()],
        ]);
      }
    } catch { /* 下次再查 */ } finally { this.polling = false; }
  }


  Status(text, error = false) { const s = $("seStatus"); s.textContent = text; s.classList.toggle("error", error); }

  Toast(text) {
    this.Status(text);
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      const parts = [this.model?.doc.title, this.writable ? "本机预览，能直接保存" : this.writeReason].filter(Boolean);
      this.Status(parts.join(" · "));
    }, 4000);
  }

  Banner(text, actions = []) {
    const b = $("seBanner");
    b.textContent = "";
    b.className = "seBanner";
    b.append(El("span", "", text));
    for (const [label, fn] of actions) { const button = El("button", "", label); button.addEventListener("click", fn); b.append(button); }
    b.hidden = false;
  }

  HideBanner() { $("seBanner").hidden = true; }

  Fail(error) {
    console.error("[SceneEditor]", error);
    this.Status(`出错：${error?.message || error}`, true);
  }

  /** 测试与 agent 用（docs/Data_Scene.md §6）。 */
  Api() {
    return {
      ready: this.ready,
      State: () => ({
        scene: this.sceneId, objects: this.model?.objects.length ?? 0, selected: [...(this.model?.selection || [])],
        dirty: !!this.model?.dirty, writable: this.writable, revision: this.revision, undo: this.model?.undo.length ?? 0,
        trenches: this.model?.trenchSegments.length ?? 0, trench: this.model?.trench ?? null, trenchPoint: this.model?.trenchPoint ?? null,
        trenchDressing: this.trenchDressingCount ?? 0,
        layers: this.layers.map(l => ({ key: l.key, count: l.ids.length })), terrainStep: this.terrainStep, terrainLook: this.terrainLook, style: this.style,
        inheritedFrom: this.model?.doc.inherit || null, inheritedObjects: this.inheritedObjectCount || 0,
        showInherited: this.showInherited, showInheritBounds: this.showInheritBounds, inheritedSelected: this.inheritedSelected,
        camera: { x: this.camera.position.x, y: this.camera.position.y, z: this.camera.position.z,
          yawDeg: this.camera.rotation.y / DEG, pitchDeg: this.camera.rotation.x / DEG, fovDeg: this.camera.fov },
        viewMode: this.viewMode, shotGizmo: this.shotHelper?.visible ?? false, cameraSelected: this.cameraSelected,
        hiddenStages: [...this.hiddenStages], preview: this.previewFrame ? (this.previewReady ? "ready" : "loading") : "closed",
        environment: this.environment?.State() || null,
      }),
      PreviewDocument: (token, id) => {
        const snapshot = this.previewSnapshot;
        return snapshot && snapshot.token === token && snapshot.doc.id === id ? structuredClone(snapshot.doc) : null;
      },
      Find: (id) => this.model.Find(id),
      Select: (ids) => this.SelectIds(ids),
      Frame: (ids) => this.Frame(ids),
      SetCamera: ({ position, yawDeg, pitchDeg } = {}) => {
        this.SetView("free");
        if (Array.isArray(position) && position.length === 3) this.cam.pos.fromArray(position);
        if (Number.isFinite(yawDeg)) this.cam.yaw = yawDeg * DEG;
        if (Number.isFinite(pitchDeg)) this.cam.pitch = Math.max(-1.55, Math.min(1.55, pitchDeg * DEG));
        this.ApplyCamera();
        this.environment?.SnapAt(this.camera.position);
      },
      MoveBy: (dx, dy, dz) => { const ids = [...this.model.selection]; this.model.MoveBy(ids, dx, dy, dz, { groundY: (o) => this.GroundY(o) }); this.AfterEdit(ids); },
      RotateBy: (deg) => { const ids = [...this.model.selection]; this.model.RotateBy(ids, deg); this.AfterEdit(ids); },
      SetField: (key, value) => { this.model.SetField([...this.model.selection], key, value); this.AfterEdit(null, { structural: true }); },
      Duplicate: () => { this.DuplicateSelection(); return [...this.model.selection]; },
      Delete: () => this.DeleteSelection(),
      Undo: () => this.Undo(),
      Redo: () => this.Redo(),
      Save: () => this.Save(),
      Reload: () => this.LoadScene(),
      Doc: () => this.model.ToDoc(),
      GroundY: (id) => this.GroundY(this.model.Find(id)),
      ProjectId: (id) => {
        const s = this.Shape(this.model.Find(id));
        const p = new THREE.Vector3(...s.c).project(this.camera), rect = this.canvas.getBoundingClientRect();
        return { x: rect.left + (p.x + 1) / 2 * rect.width, y: rect.top + (1 - p.y) / 2 * rect.height, visible: p.z < 1 };
      },
      ProjectGizmo: (axis) => {
        const p = this.gizmo.position.clone().add(axis === "ring" ? new THREE.Vector3(1.15 * this.gizmo.scale.x, 0, 0)
          : new THREE.Vector3(axis === "x" ? 0.6 : 0, axis === "y" ? 0.6 : 0, axis === "z" ? 0.6 : 0).multiplyScalar(this.gizmo.scale.x)).project(this.camera);
        const rect = this.canvas.getBoundingClientRect();
        return { x: rect.left + (p.x + 1) / 2 * rect.width, y: rect.top + (1 - p.y) / 2 * rect.height };
      },
      /** 立刻画一帧，缩到 160 宽数像素：天空色占多少、量化后有多少种颜色（「画出来了」要靠像素证明）。 */
      PixelStats: () => {
        this.ApplyCamera();
        this.environment?.Update(0, this.camera);
        this.UpdateGizmo();
        this.renderer.render(this.scene, this.camera);
        const src = this.renderer.domElement, w = 160, h = Math.max(1, Math.round(160 * src.height / src.width));
        const c2 = El("canvas"); c2.width = w; c2.height = h;
        const ctx = c2.getContext("2d");
        ctx.drawImage(src, 0, 0, w, h);
        const data = ctx.getImageData(0, 0, w, h).data, sky = HexInt(E.sky);
        const sr = (sky >> 16) & 255, sg = (sky >> 8) & 255, sb = sky & 255;
        let skyish = 0;
        const colors = new Set();
        for (let i = 0; i < data.length; i += 4) {
          if (Math.abs(data[i] - sr) + Math.abs(data[i + 1] - sg) + Math.abs(data[i + 2] - sb) < 18) skyish++;
          colors.add(((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4));
        }
        return { skyFraction: skyish / (w * h), colors: colors.size };
      },
      TerrainReady: () => this.terrainReady || Promise.resolve(false),
      Tree: () => [...document.querySelectorAll("#seTree .seFolder, #seTree .seItem")].map((n) => ({ folder: n.classList.contains("seFolder"), text: n.querySelector(".seName")?.textContent, indent: parseInt(n.style.paddingLeft, 10) || 0 })),
      Open: (paths) => { for (const p of paths) this.open.add(p); this.RenderTree(); },
      Show: (opts) => { Object.assign(this.show, opts); this.RebuildObjects(); this.RebuildInheritedObjects(); },
      SelectInherited: (id) => this.SelectInherited(id),
      InheritedLayers: () => (this.inherited?.objectGroup?.children || []).map((m) => ({
        name: m.name, count: m.count ?? m.userData?.waterCount ?? 0, color: m.material?.color?.getHex?.() ?? null, transparent: !!m.material?.transparent,
      })),
      // 壕沟（docs/Data_Scene.md §9）
      Trench: (id) => this.model.FindTrench(id),
      SelectTrench: (id, point = null) => this.SelectTrench(id, point),
      MoveTrenchPoint: (id, i, x, z) => { this.model.MoveTrenchPoint(id, i, x, z); this.AfterEdit(null); },
      SetTrenchDetail: (id, key, value) => { this.model.SetTrenchDetail(id, key, value); this.AfterEdit(null); },
      SetTrenchField: (id, key, value) => { this.model.SetTrenchField(id, key, value); this.AfterEdit(null); },
      /** 地面高（挖好的）与没挖的地面高。 */
      HeightAt: (x, z) => ({ carved: this.sampler(x, z), pre: this.preSampler(x, z) }),
      ProjectTrenchPoint: (id, i) => {
        const [x, z] = this.model.FindTrench(id).points[i];
        const p = new THREE.Vector3(x, this.sampler(x, z) + 0.9, z).project(this.camera), rect = this.canvas.getBoundingClientRect();
        return { x: rect.left + (p.x + 1) / 2 * rect.width, y: rect.top + (1 - p.y) / 2 * rect.height, visible: p.z < 1 };
      },
      ProjectWorld: (x, z) => {
        const p = new THREE.Vector3(x, this.sampler(x, z), z).project(this.camera), rect = this.canvas.getBoundingClientRect();
        return { x: rect.left + (p.x + 1) / 2 * rect.width, y: rect.top + (1 - p.y) / 2 * rect.height, visible: p.z < 1 };
      },
      FrameTrench: (id) => this.FrameTrench(id),
      InspectorText: () => $("seInspector").innerText,
    };
  }
}

const app = new SceneEditorApp();
window.SceneEditor = app.Api();
app.Start().catch((error) => app.Fail(error));
