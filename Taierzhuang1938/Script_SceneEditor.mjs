// 场景编辑器（docs/Data_Scene.md §6）：SceneEditor.html 的主程序。
//
// 读 Scenes/<Id>/Scene_<Id>.json + 高度图，自己起一个轻量三维视图（不起游戏）：地形按高度色带 + 地面涂色 + 米格线，
// 白盒体块按材质分批实例化画，远景层画成简单的盒子 / 椭球 / 锥。点选、拖箭头移动、拖金圈转、检视面板改数值，
// 改动全走 Script_SceneEditModel（带撤销）。存盘：本机预览走 /__scene/save（带版本号，对不上 409），线上只能下载。
// 场景文件被人 / agent 在外面改了：没改动就 2 s 内自动重读，有改动就挂横幅让人选。
//
// 只给开发用，面板文字不走文本表（项目契约 10 的开发者面板例外）。

import * as THREE from "three";
import { SCENE_ASSETS, SCENE_MATERIALS } from "./Data_SceneAssets.mjs";
import { SCENE_IDS, SceneDir, SceneFileName, DecodeSceneHeights, FormatSceneJson } from "./Script_SceneDoc.mjs";
import { SceneEditModel } from "./Script_SceneEditModel.mjs";
import {
  BLOCKOUT_LEVELS, HeightGridSampler, BlockoutTintColor, BuildGroundPaint, BackdropGroundSampler,
} from "./Script_EditorBlockoutLevels.mjs";
import { MISSION_LAYOUT } from "./Data_FirstLevelMissionLayout.mjs";
import { ApplyPatches } from "./Script_MaterialPatches.mjs";
import { MakeWhiteboxGridPatch } from "./Script_WhiteboxGrid.mjs";
import { WHITEBOX_MATERIAL } from "./Data_Tuning_WhiteboxMaterial.mjs";

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

// ---------------------------------------------------------------------------------------------- 编辑器

class SceneEditorApp {
  constructor() {
    this.sceneId = new URLSearchParams(location.search).get("scene") || SCENE_IDS[0];
    if (!SCENE_IDS.includes(this.sceneId)) this.sceneId = SCENE_IDS[0];
    this.model = null;
    this.writable = false;
    this.revision = null;
    this.signals = new Set();
    this.show = { backdrop: true, hidden: false };
    this.layers = [];
    this.where = new Map();          // id → { layer, index }
    this.open = new Set();           // 层级里展开的组
    this.drag = null;
    this.keys = new Set();
    this.cam = { pos: new THREE.Vector3(), yaw: 0, pitch: -0.5 };
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
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(E.sky);
    this.scene.fog = new THREE.Fog(E.sky, E.fog[0], E.fog[1]);
    this.camera = new THREE.PerspectiveCamera(E.fov, 1, E.near, E.far);
    this.camera.rotation.order = "YXZ";
    this.scene.add(new THREE.HemisphereLight(0xe4ebf2, 0x6b6656, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 2.1);
    sun.position.set(40, 70, 25);
    this.scene.add(sun);
    this.world = new THREE.Group();
    this.scene.add(this.world);
    this.selectionLines = new THREE.Group();
    this.scene.add(this.selectionLines);
    this.BuildGizmo();
    this.geometry = {
      box: new THREE.BoxGeometry(1, 1, 1),
      sphere: new THREE.SphereGeometry(0.5, 14, 10),
      cone: new THREE.ConeGeometry(0.5, 1, 8),
    };
    this.edges = new THREE.EdgesGeometry(this.geometry.box);
    this.edgeMaterial = new THREE.LineBasicMaterial({ color: 0xedca83, depthTest: false, transparent: true, opacity: 0.95 });
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
    const url = new URL(`./${SceneDir(this.sceneId)}/${SceneFileName(this.sceneId)}`, location.href);
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
    const terrainKey = JSON.stringify(doc.terrain);
    if (!this.heights || terrainKey !== this.terrainKey) {
      const heightUrl = new URL(doc.terrain.file, url);
      const response = await fetch(`${heightUrl.href}?t=${Date.now()}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`高度图读不到（HTTP ${response.status}）`);
      this.heights = DecodeSceneHeights(await response.arrayBuffer(), doc.terrain);
      this.terrainKey = terrainKey;
      this.sampler = HeightGridSampler({ ...doc.terrain, heights: this.heights });
    }
    this.revision = revision;
    this.stamp = stamp;
    if (this.model) this.model.Load(doc);
    else this.model = new SceneEditModel(doc);
    this.lookKey = null;
    this.Rebuild();
    if (!keepCamera) this.Home();
    this.FillSignals();
    this.RenderTree();
    this.RenderInspector();
    this.RenderAssets();
    this.UpdateDirty();
    this.Status(`${doc.title}：${doc.objects.length} 个物件 · ${this.writable ? "本机预览，能直接保存" : this.writeReason}`);
  }

  // ------------------------------------------------------------------ 地形与物件

  Rebuild() {
    const doc = this.model.doc;
    const lookKey = JSON.stringify([this.terrainKey, doc.look, doc.paint?.length, doc.backdrop?.ground]);
    if (lookKey !== this.lookKey) { this.BuildTerrain(); this.lookKey = lookKey; }
    this.RebuildObjects();
  }

  SemanticColor(semantic) {
    const own = this.model.doc.look?.semanticColors?.[semantic];
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
    const paint = BuildGroundPaint(doc.paint, doc.bounds);
    const rgb = [0, 0, 0], color = new THREE.Color();
    let k = 0;
    for (let iz = 0; iz <= nz; iz++) {
      for (let ix = 0; ix <= nx; ix++) {
        const gx = ix * step, gz = iz * step;
        const x = t.minX + gx * t.cellM, z = t.minZ + gz * t.cellM, y = h[gz * (t.cols + 1) + gx];
        positions[k] = x; positions[k + 1] = y; positions[k + 2] = z;
        BlockoutTintColor(y, tint, rgb);
        if (paint) paint.Blend(x, z, rgb);
        color.setRGB(rgb[0], rgb[1], rgb[2], THREE.SRGBColorSpace);
        colors[k] = color.r; colors[k + 1] = color.g; colors[k + 2] = color.b;
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
    this.terrain = new THREE.Mesh(geometry, material);
    this.terrain.name = "SceneEditor_Terrain";
    this.world.add(this.terrain);
    this.terrainStep = step;

    const bd = doc.backdrop;
    this.backdropAt = bd ? BackdropGroundSampler(bd, this.sampler, bd.siteBounds || doc.bounds) : null;
    if (bd?.ground) {
      const r = bd.ground.radiusM || 3000;
      const cx = (doc.bounds.minX + doc.bounds.maxX) / 2, cz = (doc.bounds.minZ + doc.bounds.maxZ) / 2;
      const plane = new THREE.Mesh(new THREE.CircleGeometry(r + 800, 48),
        new THREE.MeshStandardMaterial({ color: HexInt(bd.ground.color), roughness: 1 }));
      plane.rotation.x = -Math.PI / 2;
      plane.position.set(cx, bd.ground.y - 0.6, cz);
      plane.name = "SceneEditor_BackdropGround";
      this.backdropGround = plane;
      this.world.add(plane);
    }
  }

  /** y 为 null 的物件脚落在中心与四角最低的地面上（同 Script_EditorBlockoutLevels 的 GroundedBlock）。 */
  GroundY(obj) {
    const [x, , z] = obj.pos;
    if (obj.layer === "backdrop") return this.backdropAt ? this.backdropAt(x, z) : (this.model.doc.backdrop?.ground?.y ?? 0);
    const [w, , d] = obj.size || [0, 0, 0];
    const ry = (obj.yawDeg || 0) * DEG, c = Math.cos(ry), s = Math.sin(ry), hx = w / 2, hz = d / 2;
    let lowest = this.sampler(x, z);
    for (const [lx, lz] of [[-hx, -hz], [hx, -hz], [-hx, hz], [hx, hz]]) lowest = Math.min(lowest, this.sampler(x + lx * c + lz * s, z - lx * s + lz * c));
    return lowest;
  }

  BaseY(obj) { return obj.pos[1] === null ? this.GroundY(obj) : obj.pos[1]; }

  /** 物件的包围盒：中心、半尺寸、朝向（弧度）。远景的椭球 / 山 / 树也按盒子算（选它用）。 */
  Shape(obj) {
    const yaw = (obj.yawDeg || 0) * DEG;
    const p = obj.params || {};
    const base = this.BaseY(obj);
    const x = obj.pos[0], z = obj.pos[2];
    switch (SCENE_ASSETS[obj.asset]?.kind) {
      case "box": { const [w, h, d] = obj.size; return { kind: "box", c: [x, base + h / 2, z], half: [w / 2, h / 2, d / 2], yaw }; }
      case "backdropBox": { const h = p.h || 3; return { kind: "box", c: [x, base + (p.lift || 0) + h / 2, z], half: [(p.w || 4) / 2, h / 2, (p.d || 4) / 2], yaw }; }
      case "backdropBlob": { const h = p.h || 8, rx = p.rx || 4, rz = p.rz || rx; return { kind: "sphere", c: [x, base + (p.lift || 0) + h / 2, z], half: [rx, h / 2, rz], yaw }; }
      case "backdropHill": { const h = p.h || 30, rx = p.rx || 200, rz = p.rz || rx; return { kind: "sphere", c: [x, base, z], half: [rx, h, rz], yaw }; }
      case "backdropTree": { const h = p.h || 10; return { kind: "cone", c: [x, base + h / 2, z], half: [h * 0.18, h / 2, h * 0.18], yaw }; }
      default: return { kind: "box", c: [x, base + 0.5, z], half: [0.5, 0.5, 0.5], yaw };
    }
  }

  Matrix(obj, out = new THREE.Matrix4()) {
    const s = this.Shape(obj);
    return out.compose(new THREE.Vector3(...s.c), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), s.yaw),
      new THREE.Vector3(s.half[0] * 2, s.half[1] * 2, s.half[2] * 2));
  }

  Visible(obj) {
    if (obj.hideOn && this.signals.has(obj.hideOn)) return false;
    if (obj.showOn && !this.signals.has(obj.showOn)) return false;
    if (obj.layer === "backdrop") return this.show.backdrop;
    if (obj.visual === false) return this.show.hidden;
    return true;
  }

  LayerKey(obj) {
    if (obj.layer === "backdrop") return `bd:${SCENE_ASSETS[obj.asset]?.kind}`;
    if (obj.visual === false) return "ghost";
    return `box:${obj.material}`;
  }

  MakeLayerMaterial(key) {
    if (key === "ghost") return new THREE.MeshBasicMaterial({ color: 0xd6604a, transparent: true, opacity: 0.22, depthWrite: false });
    if (key.startsWith("bd:")) return new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 });
    const material = new THREE.MeshStandardMaterial({ color: this.SemanticColor(SCENE_MATERIALS[key.slice(4)]?.semantic), roughness: 0.95 });
    ApplyPatches(material, [MakeWhiteboxGridPatch(E.grid)]);
    return material;
  }

  RebuildObjects() {
    for (const layer of this.layers) { this.world.remove(layer.mesh); layer.mesh.dispose(); layer.mesh.material.dispose(); }
    this.layers = [];
    this.where.clear();
    const groups = new Map();
    for (const obj of this.model.objects) {
      if (!this.Visible(obj)) continue;
      const key = this.LayerKey(obj);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(obj);
    }
    const matrix = new THREE.Matrix4(), color = new THREE.Color();
    for (const [key, list] of groups) {
      const kind = key.startsWith("bd:") ? key.slice(3) : "box";
      const geometry = kind === "backdropBlob" || kind === "backdropHill" ? this.geometry.sphere : kind === "backdropTree" ? this.geometry.cone : this.geometry.box;
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
        layer.ids.push(obj.id);
        this.where.set(obj.id, { layer, index: i });
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
    for (const id of ids) {
      const at = this.where.get(id);
      const obj = override?.get(id) || this.model.Find(id);
      if (!at || !obj) continue;
      at.layer.mesh.setMatrixAt(at.index, this.Matrix(obj, matrix));
      at.layer.mesh.instanceMatrix.needsUpdate = true;
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
  }

  // ------------------------------------------------------------------ 手柄

  BuildGizmo() {
    const gizmo = new THREE.Group();
    gizmo.name = "SceneEditor_Gizmo";
    gizmo.visible = false;
    const Basic = (color, opacity = 1) => new THREE.MeshBasicMaterial({ color, depthTest: false, depthWrite: false, transparent: true, opacity });
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
  PickObject(ray) {
    const o = ray.origin, d = ray.direction;
    let best = null, bestT = Infinity;
    for (const obj of this.model.objects) {
      if (!this.Visible(obj)) continue;
      const s = this.Shape(obj);
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

  /** 视线打到地面的点（场地内按高度图步进，场地外落在远景地面高度）。 */
  PickGround(ray, maxM = 4000) {
    const o = ray.origin, d = ray.direction, b = this.model.doc.bounds;
    let prev = 0;
    const Above = (t) => {
      const x = o.x + d.x * t, z = o.z + d.z * t;
      const g = Inside(b, x, z) ? this.sampler(x, z) : (this.model.doc.backdrop?.ground?.y ?? 0);
      return o.y + d.y * t - g;
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

  ApplyCamera() {
    this.camera.position.copy(this.cam.pos);
    this.camera.rotation.set(this.cam.pitch, this.cam.yaw, 0, "YXZ");
    this.camera.updateMatrixWorld(true);
  }

  Forward() {
    const { yaw, pitch } = this.cam;
    return new THREE.Vector3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
  }

  LookAt(target, distance, pitchDeg = -32) {
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

  JumpRegion(r) {
    const cx = (r.minX + r.maxX) / 2, cz = (r.minZ + r.maxZ) / 2;
    const span = Math.max(r.maxX - r.minX, r.maxZ - r.minZ);
    this.cam.yaw = 0;
    this.LookAt(new THREE.Vector3(cx, this.sampler(cx, cz), cz), span * 0.95, -58);
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
    if (!this.TypingInField()) {
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
    this.UpdateGizmo();
    this.renderer.render(this.scene, this.camera);
    this.UpdateHud();
    requestAnimationFrame((t) => this.Tick(t));
  }

  TypingInField() {
    const a = document.activeElement;
    return a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.tagName === "SELECT") && a.type !== "checkbox";
  }

  UpdateHud() {
    if ((this.hudFrame = (this.hudFrame || 0) + 1) % 6) return;
    const p = this.cam.pos, ground = Inside(this.model.doc.bounds, p.x, p.z) ? this.sampler(p.x, p.z) : 0;
    const sel = this.model.selection.size;
    $("seHud").textContent = `相机 x ${Fixed(p.x, 1)}  z ${Fixed(p.z, 1)}  离地 ${Fixed(p.y - ground, 1)} m  朝向 ${Fixed(this.cam.yaw / DEG, 0)}°`
      + (sel ? `\n选中 ${sel} 个` : "");
  }

  // ------------------------------------------------------------------ 鼠标与键盘

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

    const select = $("seScene");
    for (const id of SCENE_IDS) select.append(new Option(id, id));
    select.value = this.sceneId;
    select.addEventListener("change", () => {
      if (this.model?.dirty && !confirm("有没保存的改动，换场景就丢掉了，继续？")) { select.value = this.sceneId; return; }
      const url = new URL(location.href); url.searchParams.set("scene", select.value); location.assign(url.href);
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
    $("seTabAssets").addEventListener("click", () => this.Tab("assets"));
    $("seShowBackdrop").addEventListener("change", (e) => { this.show.backdrop = e.target.checked; this.RebuildObjects(); });
    $("seShowHidden").addEventListener("change", (e) => { this.show.hidden = e.target.checked; this.RebuildObjects(); });
    $("seBlockout").addEventListener("click", () => this.OpenInBlockout());
    const jumps = $("seJumps");
    const regions = BLOCKOUT_LEVELS.filter(l => l.scene?.kind === "scene").map(l => ({ label: l.short || l.key.replace(/^FirstLevel/, ""), region: l.scene.region }));
    for (const r of regions) { const b = El("button", "", r.label); b.title = "跳到这一段的场地"; b.addEventListener("click", () => this.JumpRegion(r.region)); jumps.append(b); }
    const all = El("button", "", "全景"); all.addEventListener("click", () => this.JumpRegion(this.model.doc.bounds)); jumps.append(all);
  }

  Tab(which) {
    $("seTabTree").classList.toggle("selected", which === "tree");
    $("seTabAssets").classList.toggle("selected", which === "assets");
    $("sePaneTree").hidden = which !== "tree";
    $("sePaneAssets").hidden = which !== "assets";
  }

  PointerDown(e) {
    this.canvas.focus();
    this.canvas.setPointerCapture(e.pointerId);
    this.down = { x: e.clientX, y: e.clientY, button: e.button, moved: false, ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey };
    if (e.button !== 0) return;
    const raycaster = this.Ray(e.clientX, e.clientY);
    const handle = this.PickHandle(raycaster);
    if (handle) { this.BeginDrag(handle, raycaster.ray); this.down.handled = true; return; }
    const hit = this.PickObject(raycaster.ray);
    this.down.hit = hit;
    if (hit && this.model.selection.has(hit.id) && !this.down.ctrl && !this.down.shift) this.down.bodyDrag = true;
  }

  PointerMove(e) {
    const down = this.down;
    if (!down) return;
    const dx = e.clientX - down.x, dy = e.clientY - down.y;
    if (!down.moved && Math.hypot(dx, dy) > E.dragPx) down.moved = true;
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
    if (this.drag) { this.DragTo(this.Ray(e.clientX, e.clientY).ray, e.ctrlKey || e.metaKey); return; }
    if (down.bodyDrag && down.moved) { this.BeginDrag({ plane: true }, this.Ray(down.x, down.y).ray); this.DragTo(this.Ray(e.clientX, e.clientY).ray, e.ctrlKey); }
  }

  PointerUp(e) {
    const down = this.down;
    this.down = null;
    if (this.canvas.hasPointerCapture(e.pointerId)) this.canvas.releasePointerCapture(e.pointerId);
    if (!down || down.button !== 0) return;
    if (this.drag) { this.EndDrag(); return; }
    if (down.handled || down.moved) return;
    if (down.hit) this.SelectIds([down.hit.id], { toggle: down.ctrl, add: down.shift });
    else if (!down.ctrl && !down.shift) this.SelectIds([]);
  }

  Wheel(e) {
    e.preventDefault();
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
    if (e.code === "Escape") { if (this.drag) this.CancelDrag(); else this.SelectIds([]); return; }
    if (e.code === "KeyF" && !ctrl) { this.Frame(); return; }
    if (!ctrl) this.keys.add(e.code);
  }

  // ------------------------------------------------------------------ 拖手柄

  BeginDrag(handle, ray) {
    const ids = [...this.model.selection];
    if (!ids.length) return;
    const pivot = this.Pivot();
    const start = new Map(ids.map(id => [id, JSON.parse(JSON.stringify(this.model.Find(id)))]));
    this.drag = { handle, ids, pivot, start, preview: new Map(start), delta: [0, 0, 0], yaw: 0 };
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
    d.preview = preview;
    this.UpdateInstances(d.ids, preview);
  }

  EndDrag() {
    const d = this.drag;
    this.drag = null;
    if (!d) return;
    if (d.handle.ring) { if (d.yaw) this.model.RotateBy(d.ids, d.yaw, d.ids.length > 1 ? { x: d.pivot.x, z: d.pivot.z } : null); }
    else if (d.delta.some(v => v !== 0)) this.model.MoveBy(d.ids, d.delta[0], d.delta[1], d.delta[2], { groundY: (obj) => this.GroundY(obj) });
    this.AfterEdit(d.ids);
  }

  CancelDrag() {
    const d = this.drag;
    this.drag = null;
    if (d) this.UpdateInstances(d.ids);
  }

  // ------------------------------------------------------------------ 改动

  SelectIds(ids, opts = {}) {
    this.model.Select(ids, opts);
    for (const id of this.model.selection) { const g = this.model.Find(id)?.group || "（未分组）"; this.open.add(g); }
    this.SyncSelectionLines();
    this.RenderTree();
    this.RenderInspector();
  }

  /** 改完以后刷新：ids 给了且只是挪位置 → 只改矩阵；否则整批重建。 */
  AfterEdit(ids = null, { structural = false } = {}) {
    if (structural || !ids) this.RebuildObjects();
    else this.UpdateInstances(ids);
    this.FillSignals();
    this.RenderTree();
    this.RenderInspector();
    this.UpdateDirty();
  }

  Undo() { const label = this.model.Undo(); if (label) { this.AfterEdit(null); this.Toast(`撤销：${label}`); } }
  Redo() { const label = this.model.Redo(); if (label) { this.AfterEdit(null); this.Toast(`重做：${label}`); } }

  DuplicateSelection() {
    const ids = [...this.model.selection];
    if (!ids.length) return;
    this.model.Duplicate(ids, [1, 0, 1]);
    this.AfterEdit(null, { structural: true });
  }

  DeleteSelection() {
    const ids = [...this.model.selection];
    if (!ids.length) return;
    this.model.Delete(ids);
    this.AfterEdit(null, { structural: true });
    this.Toast(`删了 ${ids.length} 个（Ctrl+Z 撤销）`);
  }

  ScreenCenterGround() {
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
    return this.PickGround(raycaster.ray, 2000) || this.cam.pos.clone().addScaledVector(this.Forward(), 20);
  }

  AddAsset(assetId, { material, size, group }) {
    const at = this.ScreenCenterGround();
    const asset = SCENE_ASSETS[assetId];
    this.model.Add(assetId, {
      pos: [at.x, null, at.z], material, size, group: group || undefined,
      ...(asset.layer ? { layer: asset.layer } : {}),
      ...(asset.sized ? {} : { params: assetId === "Backdrop/Tree" ? { h: 10 } : { h: 4, w: 4, d: 4, rx: 4, color: "#8a8370" } }),
    });
    this.AfterEdit(null, { structural: true });
    this.SelectIds([...this.model.selection]);
  }

  // ------------------------------------------------------------------ 信号

  FillSignals() {
    const list = this.model.Signals();
    const key = list.join("|");
    if (key === this.signalKey) return;
    this.signalKey = key;
    for (const s of [...this.signals]) if (!list.includes(s)) this.signals.delete(s);
    const box = $("seSignalList");
    box.textContent = "";
    const note = El("p", "seMuted", "勾上 = 这个信号已经发生（随它消失的藏起来、随它出现的显示）。");
    note.style.fontSize = "11px";
    box.append(note);
    for (const s of list) {
      const label = El("label");
      const input = El("input");
      input.type = "checkbox";
      input.checked = this.signals.has(s);
      input.addEventListener("change", () => { if (input.checked) this.signals.add(s); else this.signals.delete(s); this.RebuildObjects(); $("seSignalCount").textContent = this.signals.size ? `${this.signals.size}` : ""; });
      label.append(input, document.createTextNode(s));
      box.append(label);
    }
  }

  // ------------------------------------------------------------------ 层级

  RenderTree() {
    const tree = $("seTree");
    tree.textContent = "";
    const q = $("seSearch").value.trim().toLowerCase();
    const sel = this.model.selection;
    const Item = (obj) => {
      const b = El("button", `seItem${sel.has(obj.id) ? " selected" : ""}`);
      b.append(document.createTextNode(obj.id));
      b.append(El("small", "", obj.material ? obj.material.replace(/^Whitebox\//, "") : (SCENE_ASSETS[obj.asset]?.label || obj.asset)));
      b.title = `${obj.asset}${obj.hideOn ? ` · 随 ${obj.hideOn} 消失` : ""}${obj.showOn ? ` · 随 ${obj.showOn} 出现` : ""}`;
      b.addEventListener("click", (e) => this.SelectIds([obj.id], { toggle: e.ctrlKey || e.metaKey, add: e.shiftKey }));
      b.addEventListener("dblclick", () => this.Frame([obj.id]));
      return b;
    };
    if (q) {
      const hits = this.model.objects.filter(o => `${o.id} ${o.group || ""} ${o.asset} ${o.material || ""} ${o.meta?.prop || ""}`.toLowerCase().includes(q));
      $("seCount").textContent = `搜到 ${hits.length} 个`;
      for (const obj of hits.slice(0, E.searchLimit)) tree.append(Item(obj));
      if (hits.length > E.searchLimit) tree.append(El("div", "seMore", `还有 ${hits.length - E.searchLimit} 个，搜得再细一点`));
      return;
    }
    const groups = this.model.Groups();
    $("seCount").textContent = `${this.model.objects.length} 个物件 · ${groups.size} 组`;
    for (const [name, ids] of groups) {
      const group = El("div", `seGroup${this.open.has(name) ? " open" : ""}`);
      const head = El("button", "seGroupHead");
      head.append(El("span", "", name), El("small", "", String(ids.length)));
      head.addEventListener("click", () => { if (this.open.has(name)) this.open.delete(name); else this.open.add(name); this.RenderTree(); });
      group.append(head);
      if (this.open.has(name)) {
        const selected = ids.filter(id => sel.has(id));
        const shown = [...new Set([...selected, ...ids.slice(0, E.treeLimit)])];
        for (const id of shown) group.append(Item(this.model.Find(id)));
        if (ids.length > shown.length) group.append(El("div", "seMore", `还有 ${ids.length - shown.length} 个（用搜索找）`));
      }
      tree.append(group);
    }
  }

  // ------------------------------------------------------------------ 资产

  RenderAssets() {
    const box = $("seAssets");
    box.textContent = "";
    for (const [id, asset] of Object.entries(SCENE_ASSETS)) {
      const card = El("div", "seAsset");
      card.append(El("h3", "", asset.label), El("code", "", id), El("p", "", asset.note || ""));
      let material = null;
      const size = [];
      if (asset.sized) {
        const row = El("div", "seRow"); row.append(El("span", "", "材质"));
        material = El("select");
        for (const [mid, m] of Object.entries(SCENE_MATERIALS)) material.append(new Option(`${m.label}（${mid.replace(/^Whitebox\//, "")}）`, mid));
        row.append(material); card.append(row);
        const srow = El("div", "seRow"); srow.append(El("span", "", "尺寸 宽高深"));
        const triple = El("div", "seTriple");
        for (let i = 0; i < 3; i++) { const input = El("input"); input.type = "number"; input.step = "0.1"; input.min = "0.02"; input.value = "1"; size.push(input); triple.append(input); }
        srow.append(triple); card.append(srow);
      }
      const grow = El("div", "seRow"); grow.append(El("span", "", "分组"));
      const group = El("input"); group.type = "text"; group.placeholder = "不写 = 跟选中的那个同组";
      grow.append(group); card.append(grow);
      const add = El("button", "sePrimary", "放到画面中间");
      add.addEventListener("click", () => {
        const sel = this.model.Selected()[0];
        this.AddAsset(id, { material: material?.value, size: size.length ? size.map(i => Math.max(0.02, Number(i.value) || 1)) : undefined, group: group.value.trim() || sel?.group });
      });
      const row = El("div", "seButtons"); row.append(add); card.append(row);
      box.append(card);
    }
  }

  // ------------------------------------------------------------------ 检视

  RenderInspector() {
    const box = $("seInspector");
    box.textContent = "";
    const list = this.model.Selected();
    if (!list.length) { box.append(El("p", "seMuted", "在画面或层级里点一个物件（Ctrl 点多选、Shift 点加选）。")); return; }
    if (list.length > 1) { this.RenderMulti(box, list); return; }
    const obj = list[0], asset = SCENE_ASSETS[obj.asset] || {}, ids = [obj.id];
    const Row = (label, control) => { const row = El("div", "seRow"); row.append(El("span", "", label), control); box.append(row); return row; };
    const Num = (value, onChange, { step = 0.1, disabled = false, placeholder = "" } = {}) => {
      const input = El("input"); input.type = "number"; input.step = String(step);
      input.value = Number.isFinite(value) ? String(value) : ""; input.disabled = disabled; input.placeholder = placeholder;
      input.addEventListener("change", () => { const v = Number(input.value); if (Number.isFinite(v)) onChange(v); else input.classList.add("bad"); });
      return input;
    };
    const Text = (value, onChange, placeholder = "") => {
      const input = El("input"); input.type = "text"; input.value = value || ""; input.placeholder = placeholder;
      input.addEventListener("change", () => onChange(input.value.trim()));
      return input;
    };
    const err = El("div", "seError");

    box.append(El("h3", "", "物件"));
    const name = Text(obj.id, (v) => { try { this.model.Rename(obj.id, v); this.AfterEdit(null); } catch (error) { err.textContent = error.message; name.classList.add("bad"); } });
    Row("名字", name);
    box.append(err);
    Row("资产", El("span", "seId", `${obj.asset}${asset.label ? ` · ${asset.label}` : ""}`));
    if (asset.sized || obj.material) {
      const m = El("select");
      for (const [mid, mat] of Object.entries(SCENE_MATERIALS)) m.append(new Option(`${mat.label}（${mid.replace(/^Whitebox\//, "")}）`, mid));
      m.value = obj.material;
      m.addEventListener("change", () => { this.model.SetField(ids, "material", m.value, "改材质"); this.AfterEdit(null, { structural: true }); });
      Row("材质", m);
    }

    box.append(El("h3", "", "位置"));
    const grounded = obj.pos[1] === null;
    const pos = El("div", "seTriple");
    const SetPos = (i) => (v) => { const p = [...obj.pos]; p[i] = v; this.model.SetField(ids, "pos", p, "改位置"); this.AfterEdit(ids); };
    pos.append(Num(obj.pos[0], SetPos(0)), Num(obj.pos[1], SetPos(1), { disabled: grounded, placeholder: grounded ? Fixed(this.GroundY(obj)) : "" }), Num(obj.pos[2], SetPos(2)));
    Row("x  y  z", pos);
    const ground = El("label", "seCheck");
    const gin = El("input"); gin.type = "checkbox"; gin.checked = grounded;
    gin.addEventListener("change", () => { this.model.SetGrounded(ids, gin.checked, (o) => this.GroundY(o)); this.AfterEdit(ids); });
    ground.append(gin, document.createTextNode(" 落地（y 跟着地形走）"));
    Row("", ground);
    Row("朝向°", Num(obj.yawDeg || 0, (v) => { this.model.SetField(ids, "yawDeg", v, "改朝向"); this.AfterEdit(ids); }, { step: 1 }));
    if (asset.sized) {
      const size = El("div", "seTriple");
      const SetSize = (i) => (v) => { const s = [...obj.size]; s[i] = v; this.model.SetField(ids, "size", s, "改尺寸"); this.AfterEdit(ids); };
      size.append(Num(obj.size[0], SetSize(0)), Num(obj.size[1], SetSize(1)), Num(obj.size[2], SetSize(2)));
      Row("宽 高 深", size);
    }

    box.append(El("h3", "", "开关"));
    const flags = El("div", "seFlags");
    const Flag = (label, key, defaultOn) => {
      const l = El("label", "seCheck"); const input = El("input"); input.type = "checkbox";
      input.checked = defaultOn ? obj[key] !== false : obj[key] === true;
      input.addEventListener("change", () => {
        const value = defaultOn ? (input.checked ? undefined : false) : (input.checked ? true : undefined);
        this.model.SetField(ids, key, value, `改 ${label}`);
        this.AfterEdit(ids, { structural: key === "visual" });
      });
      l.append(input, document.createTextNode(` ${label}`)); flags.append(l);
    };
    if (obj.layer !== "backdrop") { Flag("挡人", "solid", true); Flag("看得见", "visual", true); Flag("不能翻", "noClimb", false); Flag("能站上去", "standOn", false); }
    box.append(flags);
    if (obj.layer !== "backdrop") {
      const tag = El("select");
      tag.append(new Option("（无）", ""), new Option("airWall 只挡玩家", "airWall"));
      if (obj.tag && obj.tag !== "airWall") tag.append(new Option(obj.tag, obj.tag));
      tag.value = obj.tag || "";
      tag.addEventListener("change", () => { this.model.SetField(ids, "tag", tag.value || undefined, "改标签"); this.AfterEdit(ids); });
      Row("标签", tag);
    }

    box.append(El("h3", "", "信号与分组"));
    const signals = this.model.Signals();
    const Listed = (input, values, listId) => {
      const dl = El("datalist"); dl.id = listId; for (const v of values) dl.append(new Option(v)); box.append(dl); input.setAttribute("list", listId); return input;
    };
    Row("出现于", Listed(Text(obj.showOn, (v) => { this.model.SetField(ids, "showOn", v || undefined, "改出现信号"); this.AfterEdit(null, { structural: true }); }, "信号到了才出现"), signals, "seSigA"));
    Row("消失于", Listed(Text(obj.hideOn, (v) => { this.model.SetField(ids, "hideOn", v || undefined, "改消失信号"); this.AfterEdit(null, { structural: true }); }, "信号到了就消失"), signals, "seSigB"));
    Row("分组", Listed(Text(obj.group, (v) => { this.model.SetField(ids, "group", v || undefined, "改分组"); this.AfterEdit(null); }), [...this.model.Groups().keys()], "seGroups"));

    for (const [key, label] of [["params", "参数"], ["meta", "附加"]]) {
      if (key === "params" && asset.sized && !obj.params) continue;
      box.append(El("h3", "", `${label}（JSON）`));
      const area = El("textarea");
      area.value = obj[key] ? JSON.stringify(obj[key], null, 1) : "";
      area.placeholder = key === "meta" ? "其余原样带过去的字段（prop、loophole……）" : "";
      area.addEventListener("change", () => {
        const text = area.value.trim();
        if (!text) { this.model.SetField(ids, key, undefined, `清空${label}`); this.AfterEdit(ids, { structural: true }); return; }
        try {
          const value = JSON.parse(text);
          if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("要是 JSON 对象");
          this.model.SetField(ids, key, value, `改${label}`); this.AfterEdit(ids, { structural: true });
        } catch (error) { area.classList.add("bad"); err.textContent = `${label}：${error.message}`; }
      });
      box.append(area);
    }
    this.InspectorButtons(box);
  }

  RenderMulti(box, list) {
    const ids = list.map(o => o.id);
    box.append(El("h3", "", `选中 ${list.length} 个`));
    box.append(El("p", "seMuted", ids.slice(0, 8).join("、") + (ids.length > 8 ? " ……" : "")));
    const Row = (label, control) => { const row = El("div", "seRow"); row.append(El("span", "", label), control); box.append(row); };
    const sized = list.filter(o => SCENE_ASSETS[o.asset]?.sized).map(o => o.id);
    if (sized.length) {
      const m = El("select");
      m.append(new Option("（不改）", ""));
      for (const [mid, mat] of Object.entries(SCENE_MATERIALS)) m.append(new Option(`${mat.label}（${mid.replace(/^Whitebox\//, "")}）`, mid));
      m.addEventListener("change", () => { if (m.value) { this.model.SetField(sized, "material", m.value, "改材质"); this.AfterEdit(null, { structural: true }); } });
      Row("材质", m);
    }
    const group = El("input"); group.type = "text"; group.placeholder = "一起改到这个分组";
    group.addEventListener("change", () => { this.model.SetField(ids, "group", group.value.trim() || undefined, "改分组"); this.AfterEdit(null); });
    Row("分组", group);
    const buttons = El("div", "seButtons");
    const on = El("button", "", "都落地"); on.addEventListener("click", () => { this.model.SetGrounded(ids, true); this.AfterEdit(ids); });
    const off = El("button", "", "都取消落地"); off.addEventListener("click", () => { this.model.SetGrounded(ids, false, (o) => this.GroundY(o)); this.AfterEdit(ids); });
    buttons.append(on, off);
    box.append(buttons);
    this.InspectorButtons(box);
  }

  InspectorButtons(box) {
    const row = El("div", "seButtons");
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
    node.textContent = dirty ? "有没保存的改动" : "已和盘上一致";
    node.classList.toggle("dirty", !!dirty);
    $("seUndo").disabled = !this.model?.undo.length;
    $("seRedo").disabled = !this.model?.redo.length;
    $("seSave").textContent = this.writable ? "保存" : "保存（下载）";
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
        const url = new URL(`./${SceneDir(this.sceneId)}/${SceneFileName(this.sceneId)}`, location.href);
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

  OpenInBlockout() {
    const at = this.ScreenCenterGround();
    const level = BLOCKOUT_LEVELS.find(l => l.scene?.kind === "scene" && Inside(l.scene.region, at.x, at.z));
    if (!level) { this.Toast("画面中心不在任何一段白盒关卡的场地里"); return; }
    const url = new URL("./index.html", location.href);
    url.searchParams.set("editor", "blockout");
    url.searchParams.set("level", level.key);
    url.searchParams.set("pose", [at.x.toFixed(2), at.z.toFixed(2), (this.cam.yaw / DEG).toFixed(1), "0", "stand"].join(","));
    window.open(url.href, "_blank");
  }

  // ------------------------------------------------------------------ 提示

  Status(text, error = false) { const s = $("seStatus"); s.textContent = text; s.classList.toggle("error", error); }

  Toast(text) {
    this.Status(text);
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.Status(`${this.model?.doc.title || ""} · ${this.writable ? "本机预览，能直接保存" : this.writeReason}`), 4000);
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
        layers: this.layers.map(l => ({ key: l.key, count: l.ids.length })), terrainStep: this.terrainStep,
        camera: { x: this.cam.pos.x, y: this.cam.pos.y, z: this.cam.pos.z, yawDeg: this.cam.yaw / DEG, pitchDeg: this.cam.pitch / DEG },
      }),
      Find: (id) => this.model.Find(id),
      Select: (ids) => this.SelectIds(ids),
      Frame: (ids) => this.Frame(ids),
      MoveBy: (dx, dy, dz) => { const ids = [...this.model.selection]; this.model.MoveBy(ids, dx, dy, dz, { groundY: (o) => this.GroundY(o) }); this.AfterEdit(ids); },
      RotateBy: (deg) => { const ids = [...this.model.selection]; this.model.RotateBy(ids, deg); this.AfterEdit(ids); },
      SetField: (key, value) => { this.model.SetField([...this.model.selection], key, value); this.AfterEdit(null, { structural: true }); },
      Add: (assetId, opts = {}) => { this.AddAsset(assetId, opts); return [...this.model.selection][0]; },
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
      Signals: (list) => { this.signals = new Set(list); this.RebuildObjects(); },
      Show: (opts) => { Object.assign(this.show, opts); this.RebuildObjects(); },
    };
  }
}

const app = new SceneEditorApp();
window.SceneEditor = app.Api();
app.Start().catch((error) => app.Fail(error));
