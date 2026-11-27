// 构件库预览（Tool_PropLibrary.html）的三维台：只读可视化，不装游戏的后处理、天空、灯光组、人物与特效。
//
// 自己建一套轻量渲染：WebGLRenderer + 三盏棚灯 + 小房间 PMREM 反射 + 投影接收地面 + 自适应米格。
// 构件本身仍走正片同一套实例化（InstantiateExternalProp / InstantiateModel）
// 与同一份材质库配方（MaterialLibrary + 外部 PBR 清单），所以看到的几何与材质就是场景里摆出来的那一份；
// 这里不写关卡、不写地形，也不推进碰撞盒。
//
// 页面要有 <base href="../">：游戏模块里按游戏根写的 "./Model/…" "./Texture/…" 相对路径照旧能用。

import * as THREE from "three";
import { MaterialLibrary } from "../Script_Materials.mjs";
import { RECIPES } from "../Script_TexBake.mjs";
import { SetTextureImportRenderer } from "../Script_TextureImports.mjs";
import { LoadDocument } from "../Script_MeshLoad.mjs";
import { MeshUrl } from "../Script_Meshes.mjs";
import { InstantiateExternalProp } from "../Script_ExternalProps.mjs";
import { CreateStandardCameraPost, BuildStandardPostOptions } from "../Script_CameraProfile.mjs";
import { MarkNoPrepass } from "../Script_Post.mjs";
import { BuildPlaceableVisual } from "./Script_PlaceableCatalog.mjs";
import { PBR_SETS } from "./Data_ToolStudioPbrSets.mjs";

const KEY_LIGHT_DIRECTION = new THREE.Vector3(-3, 5, 4).normalize();
const STUDIO_EXPOSURE_COMPENSATION = 2.3;
const SHADOW_MAP_SIZE = 2048;
const PBR_LANES = 8;
const PERSON_HEIGHT = 1.7;
const GRID_STEPS = [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10];

/** 视角预设：[yaw, pitch]（弧度）。 */
export const VIEWS = Object.freeze({
  perspective: [-0.62, 0.36], front: [0, 0.02], side: [-Math.PI / 2, 0.02], top: [0, Math.PI / 2 - 0.001],
});

/** 镜头预设：竖直 FOV（度）。 */
export const LENSES = Object.freeze({ wide: 58, normal: 38, tele: 20 });

const NextFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));

function CreateLighting(renderer, scene) {
  scene.add(new THREE.HemisphereLight(0xfff6e7, 0x8e9aa4, 1.15 * STUDIO_EXPOSURE_COMPENSATION));
  const key = new THREE.DirectionalLight(0xfff3e0, 2.5 * STUDIO_EXPOSURE_COMPENSATION);
  key.castShadow = true;
  key.shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
  key.shadow.autoUpdate = false;
  key.shadow.bias = -2 / SHADOW_MAP_SIZE;
  key.shadow.radius = 0.8;
  // 第一帧就要有阴影图：投影接收地面在没有构件时也会采样它，没建过的阴影图会被当成普通纹理绑上去。
  key.shadow.needsUpdate = true;
  scene.add(key, key.target);
  for (const [color, intensity, x, y, z] of [
    [0xd6eaff, 1.05 * STUDIO_EXPOSURE_COMPENSATION, 3, 1.2, 3],
    [0xffffff, 1.5 * STUDIO_EXPOSURE_COMPENSATION, 2, 3, -5],
  ]) {
    const light = new THREE.DirectionalLight(color, intensity);
    light.position.set(x, y, z);
    scene.add(light);
  }
  const room = new THREE.Scene();
  room.background = new THREE.Color(0x7d858b);
  for (const [x, y, z, color] of [[-4, 6, 4, 0xfff6e7], [3, 2, -5, 0xd6eaff]]) {
    const card = new THREE.Mesh(new THREE.PlaneGeometry(7, 4), new THREE.MeshBasicMaterial({ color }));
    card.position.set(x, y, z);
    card.lookAt(0, 0, 0);
    room.add(card);
  }
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(room, 0.025).texture;
  scene.environmentIntensity = STUDIO_EXPOSURE_COMPENSATION;
  pmrem.dispose();
  for (const card of room.children) { card.geometry.dispose(); card.material.dispose(); }
  return key;
}

function CountTriangles(root) {
  let meshes = 0, triangles = 0;
  root.traverse((node) => {
    if (!node.isMesh || !node.geometry) return;
    meshes += 1;
    const geometry = node.geometry;
    const perInstance = (geometry.index?.count ?? geometry.attributes.position?.count ?? 0) / 3;
    triangles += perInstance * (node.isInstancedMesh ? node.count : 1);
  });
  return { meshes, triangles: Math.round(triangles) };
}

export class PropLibraryStage {
  constructor(canvas, onDraw = null) {
    this.canvas = canvas;
    this.onDraw = onDraw;
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: false, antialias: false, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    SetTextureImportRenderer(this.renderer);
    this.post = CreateStandardCameraPost(this.renderer, { width: 2, height: 2, quality: "high" });
    this.library = new MaterialLibrary(this.renderer);
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x464a46);
    this.camera = new THREE.PerspectiveCamera(LENSES.normal, 1, 0.05, 500);
    this.keyLight = CreateLighting(this.renderer, this.scene);

    const groundMat = new THREE.ShadowMaterial({ opacity: 0.32 });
    MarkNoPrepass(groundMat);
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), groundMat);
    this.ground.userData.skipNormalDepth = true;
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);
    this.grid = null;
    this.gridVisible = true;
    this.person = new THREE.Mesh(new THREE.CapsuleGeometry(0.21, PERSON_HEIGHT - 0.42, 6, 14),
      new THREE.MeshStandardMaterial({ color: 0x8d8f86, roughness: 0.85, metalness: 0 }));
    this.person.castShadow = true;
    this.person.visible = false;
    this.personVisible = false;
    this.scene.add(this.person);

    this.modelDocs = new Map();
    this.model = null;
    this.center = new THREE.Vector3();
    this.radius = 1;
    this.yaw = VIEWS.perspective[0];
    this.pitch = VIEWS.perspective[1];
    this.dist = 4;
    this.pendingFrame = 0;
    this.tick = null;
    this.lastTick = 0;
    this.resizeObserver = new ResizeObserver(() => this.Resize());
    this.resizeObserver.observe(canvas);
  }

  /**
   * 材质库：先烘不被外部 PBR 顶替的配方，再读外部 PBR 套（读不到的退回同名程序化配方），
   * 口径同 Script_ToolStudioRenderBase / Script_Main.Boot。onStep(label, progress 0–1)。
   */
  async Prepare(onStep = () => {}) {
    const overridden = new Set(PBR_SETS.map((set) => set.name));
    for (const set of PBR_SETS) if (set.fallback) overridden.delete(set.fallback);
    const names = Object.keys(RECIPES).filter((name) => !overridden.has(name));
    const total = names.length + this.library.PendingShadingSteps();
    let baked = 0;
    for await (const name of this.library.PrepareStepsAsync(names)) {
      baked += 1;
      onStep(`烘焙材质 ${baked}/${total} · ${name}`, 0.7 * baked / total);
    }
    const queue = [...PBR_SETS];
    let loaded = 0;
    const missing = [];
    const RunLane = async () => {
      for (let set = queue.shift(); set; set = queue.shift()) {
        try {
          if (set.fallback) await this.library.LoadExternalBaseNormal(set.name, set.fallback, set);
          else await this.library.LoadExternalSet(set.name, set);
        } catch (error) {
          missing.push(set.name);
          for await (const step of this.library.PrepareStepsAsync([set.name])) void step;
        }
        loaded += 1;
        onStep(`读取 PBR 材质 ${loaded}/${PBR_SETS.length}`, 0.7 + 0.3 * loaded / PBR_SETS.length);
      }
    };
    await Promise.all(Array.from({ length: PBR_LANES }, RunLane));
    this.missingPbr = missing;
    return missing;
  }

  /** 建一个目录条目的可见节点。返回值交给 Show；页面换了选择时用 Release 丢掉。 */
  async Build(entry) {
    const root = new THREE.Group();
    root.name = `PropLibrary_${entry.id}`;
    const owned = [];
    if (entry.external) {
      const instance = await InstantiateExternalProp(entry.external, this.library);
      if (!instance) throw new Error(`外部模型无法实例化：${entry.external}`);
      root.add(instance);
    } else {
      if (!this.modelDocs.has(entry.model)) {
        const doc = await LoadDocument(MeshUrl(entry.model));
        if (!doc) throw new Error(`模型无法读取：${entry.model}`);
        this.modelDocs.set(entry.model, doc);
      }
      const item = { x: 0, z: 0, ry: 0, ...(entry.defaults || {}) };
      const built = BuildPlaceableVisual(root, entry, item, { library: this.library, modelDocs: this.modelDocs });
      if (!built.loaded) throw new Error(`${entry.name} 没有建出来`);
    }
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root);
    if (box.isEmpty()) throw new Error(`${entry.name} 没有几何`);
    const center = box.getCenter(new THREE.Vector3());
    root.position.set(-center.x, -box.min.y, -center.z);
    root.updateMatrixWorld(true);
    const size = box.getSize(new THREE.Vector3());
    return { entry, root, owned, size, ...CountTriangles(root) };
  }

  Release(model) {
    if (!model) return;
    model.root.removeFromParent();
    for (const geometry of model.owned) geometry.dispose();
  }

  Show(model) {
    this.Release(this.model);
    this.model = model;
    if (model) {
      model.root.traverse((node) => {
        if (node.isMesh) node.castShadow = node.receiveShadow = true;
      });
      this.scene.add(model.root);
      this.RebuildGrid(model.size);
      this.Fit();
    }
    this.RequestDraw();
  }

  RebuildGrid(size) {
    if (this.grid) { this.grid.removeFromParent(); this.grid.dispose(); }
    const span = Math.max(size.x, size.z, size.y * 0.6, 0.2);
    const step = GRID_STEPS.find((value) => value * 12 >= span) ?? GRID_STEPS.at(-1);
    this.gridStep = step;
    this.grid = new THREE.GridHelper(step * 32, 32, 0xc9bf9f, 0xa7a390);
    this.grid.material.transparent = true;
    this.grid.material.opacity = 0.28;
    this.grid.material.depthWrite = false;
    MarkNoPrepass(this.grid.material);
    this.grid.userData.skipNormalDepth = true;
    this.grid.visible = this.gridVisible;
    this.grid.position.y = 0.0005;
    this.scene.add(this.grid);
    this.ground.scale.set(step * 32, step * 32, 1);
    this.person.position.set(size.x / 2 + Math.max(0.5, size.x * 0.08) + 0.21, PERSON_HEIGHT / 2, 0);
  }

  SetGridVisible(on) {
    this.gridVisible = on;
    if (this.grid) this.grid.visible = on;
    this.RequestDraw();
  }

  SetPersonVisible(on) {
    this.personVisible = on;
    this.person.visible = on;
    this.Fit();
  }

  SetView(name) {
    const view = VIEWS[name];
    if (!view) return;
    [this.yaw, this.pitch] = view;
    this.Fit();
  }

  SetLens(name) {
    const fov = LENSES[name];
    if (!fov) return;
    this.camera.fov = fov;
    this.Fit();
  }

  /** 按当前视角与镜头把整件（含人高参照）放进画面。 */
  Fit() {
    if (!this.model) return;
    const box = new THREE.Box3().setFromObject(this.model.root);
    if (this.personVisible) box.expandByObject(this.person);
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    this.center.copy(sphere.center);
    this.radius = Math.max(sphere.radius, 0.05);
    const aspect = (this.width || 1) / (this.height || 1);
    const vertical = THREE.MathUtils.degToRad(this.camera.fov) / 2;
    const horizontal = Math.atan(Math.tan(vertical) * aspect);
    this.dist = this.radius / Math.sin(Math.min(vertical, horizontal)) * 1.06;
    this.FitShadow(box);
    this.RequestDraw();
  }

  FitShadow(box) {
    const radius = Math.max(box.getSize(new THREE.Vector3()).length() * 0.6, 0.05);
    const key = this.keyLight;
    key.target.position.copy(this.center);
    key.position.copy(this.center).addScaledVector(KEY_LIGHT_DIRECTION, 2 * radius);
    const camera = key.shadow.camera;
    camera.left = camera.bottom = -radius;
    camera.right = camera.top = radius;
    camera.near = radius * 0.5;
    camera.far = radius * 3.5;
    camera.updateProjectionMatrix();
    key.shadow.normalBias = 2 * radius / SHADOW_MAP_SIZE;
    key.shadow.needsUpdate = true;
  }

  Orbit(dx, dy) {
    this.yaw -= dx * 0.008;
    const limit = Math.PI / 2 - 0.001;
    this.pitch = Math.max(-0.2, Math.min(limit, this.pitch + dy * 0.008));
    this.RequestDraw();
  }

  Pan(dx, dy) {
    const perPixel = 2 * this.dist * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2) / (this.height || 1);
    const axis = new THREE.Vector3();
    this.center.addScaledVector(axis.setFromMatrixColumn(this.camera.matrixWorld, 0), -dx * perPixel);
    this.center.addScaledVector(axis.setFromMatrixColumn(this.camera.matrixWorld, 1), dy * perPixel);
    this.RequestDraw();
  }

  Zoom(factor) {
    this.dist = Math.max(this.radius * 0.25, Math.min(this.radius * 30, this.dist / factor));
    this.RequestDraw();
  }

  /** 每帧回调（战车可动件演示用）；传 null 停止连续出画。 */
  SetTick(tick) {
    this.tick = tick;
    this.lastTick = performance.now();
    this.RequestDraw();
  }

  Resize() {
    const { clientWidth: width, clientHeight: height } = this.canvas;
    if (!width || !height || (width === this.width && height === this.height)) return;
    this.width = width;
    this.height = height;
    this.renderer.setSize(width, height, false);
    const buf = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.post.SetSize(Math.max(2, buf.x), Math.max(2, buf.y));
    this.camera.aspect = width / height;
    this.Fit();
    this.RequestDraw();
  }

  RequestDraw() {
    if (this.pendingFrame) return;
    this.pendingFrame = requestAnimationFrame((now) => {
      this.pendingFrame = 0;
      if (this.tick) {
        this.tick(Math.max(0, Math.min(0.1, (now - this.lastTick) / 1000)));
        this.lastTick = now;
        this.RequestDraw();
      }
      this.Draw();
    });
  }

  Draw() {
    if (!this.width || !this.height) return;
    const camera = this.camera;
    const cos = Math.cos(this.pitch);
    camera.position.set(
      this.center.x + Math.sin(this.yaw) * cos * this.dist,
      this.center.y + Math.sin(this.pitch) * this.dist,
      this.center.z + Math.cos(this.yaw) * cos * this.dist);
    camera.near = Math.max(0.01, this.dist - this.radius * 4) * 0.25;
    camera.far = this.dist + this.radius * 40;
    camera.lookAt(this.center);
    camera.updateProjectionMatrix();
    this.post.Render(this.scene, camera, BuildStandardPostOptions({
      sunDirection: KEY_LIGHT_DIRECTION,
      dt: 1 / 60,
      steadyView: true,
    }));
    this.onDraw?.();
  }

  /** 等两帧，让排队的出画真的落到画布上（测试与出图用）。 */
  async Settle() {
    this.RequestDraw();
    await NextFrame();
    await NextFrame();
  }
}
