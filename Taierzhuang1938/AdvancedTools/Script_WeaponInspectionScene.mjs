import * as THREE from "three";
import { WEAPONS } from "../Data_Weapons.mjs";
import { BAYONET_MESH_BY_WEAPON, MESHES, WEAPON_MESH_BY_ID } from "../Data_Meshes.mjs";
import { HANYANG_173R } from "../Data_HanYang173R.mjs";
import { TYPE38_511 } from "../Data_Type38_511.mjs";
import { ActorFactory } from "../Script_Actor.mjs";
import { ConfigureHanYang173R, InstantiateHanYang173R, LoadHanYang173R } from "../Script_HanYang173R.mjs";
import { ConfigureType38_511, InstantiateType38_511, LoadType38_511 } from "../Script_Type38_511.mjs";
import { MaterialLibrary } from "../Script_Materials.mjs";
import { ClearMeshCache, LoadDocument } from "../Script_MeshLoad.mjs";
import { MeshUrl, WeaponMeshId } from "../Script_Meshes.mjs";
import { Mulberry32 } from "../Script_Noise.mjs";
import { SetTextureImportRenderer } from "../Script_TextureImports.mjs";
import { PBR_SETS } from "./Data_ToolStudioPbrSets.mjs";

const GLB = {
  HanYang: { url: HANYANG_173R.url, Load: LoadHanYang173R, Configure: ConfigureHanYang173R, Instantiate: InstantiateHanYang173R },
  Type38_511: { url: TYPE38_511.url, Load: LoadType38_511, Configure: ConfigureType38_511, Instantiate: InstantiateType38_511 },
};
const PITCH_BY_ASSET = { OfficerSwordSet: -Math.PI / 2, MediumMortar: Math.PI * .34 };
const WEAPON_PBR_NAMES = new Set([
  "Steel", "WoodStock", "Type89Armor", "Type89Track", "GrenadePbr", "DadaoPbr",
  "LugouqiaoOfficerSword", "LugouqiaoType11AmmoBox", "LugouqiaoType11Body", "LugouqiaoType11BodyAlt", "LugouqiaoType11Fore",
]);

async function LoadMaterials(library) {
  const sets = [
    ...PBR_SETS.filter((set) => WEAPON_PBR_NAMES.has(set.name)),
    ...new Set(Object.values(WEAPON_MESH_BY_ID).flatMap((id) => MESHES[id]?.pbrSets ?? [])),
  ];
  const baseRecipes = new Set(["ClothNra", "SteelHelmet", ...sets.map((set) => set.fallback).filter(Boolean)]);
  for await (const name of library.PrepareStepsAsync(baseRecipes)) { /* 材质库逐套烘焙。 */ }
  const settled = await Promise.allSettled(sets.map((set) => set.fallback
    ? library.LoadExternalBaseNormal(set.name, set.fallback, set)
    : library.LoadExternalSet(set.name, set)));
  const missing = sets.filter((_, i) => settled[i].status === "rejected").map((set) => set.name);
  for await (const name of library.PrepareStepsAsync(missing.filter((name) => !library.baked.has(name)))) { /* 使用原配方。 */ }
  return missing.length;
}

function CreateLighting(renderer, scene) {
  scene.add(new THREE.HemisphereLight(0xfff6e7, 0x9caebe, 1.25));
  for (const [color, intensity, x, y, z] of [
    [0xfff5e7, 2.4, -3, 5, 4], [0xd6eaff, 1.15, 3, 1, 3], [0xffffff, 1.75, 2, 3, -5],
  ]) {
    const light = new THREE.DirectionalLight(color, intensity);
    light.position.set(x, y, z);
    scene.add(light);
  }
  const room = new THREE.Scene();
  room.background = new THREE.Color(0x818990);
  for (const [x, y, z, color] of [
    [-4, 6, 4, 0xfff6e7], [3, 2, -5, 0xd6eaff],
  ]) {
    const card = new THREE.Mesh(new THREE.PlaneGeometry(7, 4), new THREE.MeshBasicMaterial({ color }));
    card.position.set(x, y, z);
    card.lookAt(0, 0, 0);
    room.add(card);
  }
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environment = pmrem.fromScene(room, 0.025);
  scene.environment = environment.texture;
  pmrem.dispose();
  for (const card of room.children) {
    card.geometry.dispose();
    card.material.dispose();
  }
}

function MountPosition(instance, name) {
  const node = instance.nodes.get(name);
  return node ? node.getWorldPosition(new THREE.Vector3()) : null;
}

export class WeaponInspectionScene {
  constructor(canvas, onDraw) {
    this.canvas = canvas;
    this.onDraw = onDraw;
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera();
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    SetTextureImportRenderer(this.renderer);
    this.library = new MaterialLibrary(this.renderer);
    this.factory = new ActorFactory(this.library);
    this.documents = new Map();
    this.configuredGlbs = new WeakSet();
    this.center = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.span = 1;
    this.zoom = 1;
    this.gridVisible = true;
    this.pendingFrame = 0;
    CreateLighting(this.renderer, this.scene);
    this.resizeObserver = new ResizeObserver(() => this.Resize());
    this.resizeObserver.observe(canvas);
  }

  async LoadMesh(id) {
    if (this.factory.meshDocs.has(id)) return;
    if (!this.documents.has(id)) {
      this.documents.set(id, LoadDocument(MeshUrl(id)).then((doc) => {
        if (!doc) throw new Error(`模型无法读取：${id}`);
        this.factory.meshDocs.set(id, doc);
      }).finally(() => this.documents.delete(id)));
    }
    await this.documents.get(id);
  }

  Retry() {
    ClearMeshCache();
    if (!this.materials) this.loadingMaterials = null;
  }

  async Load(id, variant = 0) {
    const weapon = WEAPONS[id];
    const meshId = WeaponMeshId(id, variant);
    const glb = GLB[meshId];
    const bayonetId = weapon.bayonet && BAYONET_MESH_BY_WEAPON[id];
    this.loadingMaterials ??= LoadMaterials(this.library);
    const [textureFallbacks, glbAsset, , bladeAvailable] = await Promise.all([
      this.loadingMaterials,
      glb?.Load(),
      !glb && MESHES[meshId] ? this.LoadMesh(meshId) : null,
      bayonetId ? this.LoadMesh(bayonetId).then(() => true, () => false) : false,
    ]);
    this.materials ??= this.factory.ActorMaterials("nra", Mulberry32(7));

    const group = new THREE.Group();
    const pose = new THREE.Group();
    const body = new THREE.Group();
    group.add(pose);
    pose.add(body);
    const ownedGeometry = new Set();
    const AddInstance = (parent, instance) => {
      parent.add(instance.root);
      instance.root.traverse((object) => { if (object.isMesh) ownedGeometry.add(object.geometry); });
    };
    let muzzle = null;
    let grip = null;
    let nodes = null;
    if (glb || weapon.kind === "vehicle") {
      if (glb && !this.configuredGlbs.has(glbAsset)) {
        glb.Configure(glbAsset, this.library);
        this.configuredGlbs.add(glbAsset);
      }
      // 车辆的炮塔在子节点，GLB 的材质随部件保留。
      const instance = glb ? glb.Instantiate(glbAsset, { batch: true }) : this.factory.ModelInstance(meshId, this.materials);
      if (!instance) throw new Error(`模型无法实例化：${id}`);
      AddInstance(body, instance);
      nodes = instance.nodes;
      if (glb) {
        muzzle = MountPosition(instance, "muzzle");
        grip = MountPosition(instance, "gripL");
      }
    } else {
      const built = this.factory.WeaponGeometry(id, variant, { includeBayonet: false });
      for (const [key, geometry] of built.geometries) {
        body.add(new THREE.Mesh(geometry, this.materials[key] || this.materials.steel));
      }
      if (weapon.kind !== "melee" && weapon.kind !== "throwable") {
        muzzle = built.muzzle;
        grip = built.gripFront;
      }
    }
    if (!body.children.length) throw new Error(`模型没有几何：${id}`);

    pose.rotation.x = PITCH_BY_ASSET[id] || 0;
    group.rotation.y = Math.PI / 2;
    group.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(body, true);
    const size = box.getSize(new THREE.Vector3());
    const grounded = weapon.kind === "vehicle" || weapon.emplaced || weapon.kind === "mortar";
    const lift = grounded ? 0 : Math.max(size.x, size.y, size.z) * .095;
    group.position.copy(box.getCenter(new THREE.Vector3())).multiplyScalar(-1);
    group.position.y = lift - box.min.y;

    let blade = null;
    if (bladeAvailable && muzzle) {
      const instance = this.factory.ModelInstance(bayonetId, this.materials);
      const socket = instance && MountPosition(instance, "socket");
      if (socket) {
        instance.root.position.copy(muzzle).sub(socket);
        instance.root.position.z += 0.012;
        blade = instance.root;
        blade.visible = false;
        AddInstance(pose, instance);
      } else if (instance) {
        instance.root.traverse((object) => { if (object.isMesh) object.geometry.dispose(); });
      }
    }
    let triangles = 0;
    body.traverseVisible((object) => {
      if (object.isMesh) triangles += (object.geometry.index?.count ?? object.geometry.attributes.position.count) / 3;
    });
    const file = glb?.url.slice("./Model/".length).split("?")[0] ?? MESHES[meshId]?.file ?? "程序化模型";
    return {
      group, body, pose, blade, muzzle, grip, nodes, size, file, triangles, ownedGeometry,
      textureFallback: textureFallbacks > 0,
      missingBlade: !!bayonetId && !blade,
    };
  }

  Release(model) {
    if (!model) return;
    model.group.removeFromParent();
    for (const geometry of model.ownedGeometry) geometry.dispose();
  }

  Show(model) {
    this.Release(this.model);
    this.model = model;
    if (this.grid) {
      this.grid.removeFromParent();
      this.grid.dispose();
      this.grid = null;
    }
    if (model) {
      this.scene.add(model.group);
      const max = Math.max(...model.size.toArray());
      const step = max < .4 ? .05 : max < 1.8 ? .1 : max < 3 ? .25 : .5;
      this.grid = new THREE.GridHelper(step * 24, 24, 0x728891, 0x83949c);
      this.grid.material.transparent = true;
      this.grid.material.opacity = .31;
      this.grid.visible = this.gridVisible;
      this.scene.add(this.grid);
      this.Fit();
    }
    this.RequestDraw();
  }

  Resize() {
    const { clientWidth: width, clientHeight: height } = this.canvas;
    if (!width || !height || (width === this.width && height === this.height)) return;
    this.width = width;
    this.height = height;
    this.renderer.setSize(width, height, false);
    if (this.model && this.zoom === 1) this.Fit();
    this.RequestDraw();
  }

  SetView(yaw, pitch) {
    this.yaw = yaw;
    this.pitch = pitch;
    this.Fit();
  }

  Direction() {
    const cos = Math.cos(this.pitch);
    return new THREE.Vector3(Math.sin(this.yaw) * cos, Math.sin(this.pitch), Math.cos(this.yaw) * cos);
  }

  Fit() {
    if (!this.model) return;
    const { body, blade } = this.model;
    this.model.group.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(body);
    if (blade?.visible) bounds.union(new THREE.Box3().setFromObject(blade));
    bounds.getCenter(this.center);
    const extent = bounds.getSize(new THREE.Vector3());
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const up = this.Direction().cross(right);
    const ProjectionExtent = (axis) => Math.abs(axis.x) * extent.x + Math.abs(axis.y) * extent.y + Math.abs(axis.z) * extent.z;
    const aspect = (this.width || 1) / (this.height || 1);
    this.span = Math.max(ProjectionExtent(right) / (aspect * .83), ProjectionExtent(up) / .69, extent.length() * .29);
    this.zoom = 1;
    this.RequestDraw();
  }

  RequestDraw() {
    if (this.pendingFrame) return;
    this.pendingFrame = requestAnimationFrame(() => {
      this.pendingFrame = 0;
      this.Draw();
    });
  }

  Draw() {
    if (!this.width || !this.height) return;
    const { camera } = this;
    const halfHeight = this.span / this.zoom / 2;
    const halfWidth = halfHeight * this.width / this.height;
    camera.left = -halfWidth;
    camera.right = halfWidth;
    camera.top = halfHeight;
    camera.bottom = -halfHeight;
    camera.near = .005;
    camera.far = 80;
    camera.position.copy(this.center).addScaledVector(this.Direction(), 15);
    camera.lookAt(this.center);
    camera.updateProjectionMatrix();
    this.renderer.render(this.scene, camera);
    this.onDraw?.();
  }
}
