import * as THREE from "three";
import { WEAPONS } from "../Data_Weapons.mjs";
import { BAYONET_MESH_BY_WEAPON, MESHES, WEAPON_MESH_BY_ID } from "../Data_Meshes.mjs";
import { HANYANG_173R } from "../Data_HanYang173R.mjs";
import { TYPE38_511 } from "../Data_Type38_511.mjs";
import { ActorFactory } from "../Script_Actor.mjs";
import { ConfigureHanYang173R, InstantiateHanYang173R, LoadHanYang173R } from "../Script_HanYang173R.mjs";
import { ConfigureType38_511, InstantiateType38_511, LoadType38_511 } from "../Script_Type38_511.mjs";
import { ApplyPatches, MakePatch, PatchesOf } from "../Script_MaterialPatches.mjs";
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
const CHANNELS = Object.freeze({
  beauty: 0, normal: 1, tangent: 2, albedo: 3, roughness: 4, metallic: 5, ao: 6, reflection: 7, shadow: 8,
});
const KEY_LIGHT_DIRECTION = new THREE.Vector3(-3, 5, 4).normalize();
const SHADOW_MAP_SIZE = 2048;
const WEAPON_PBR_NAMES = new Set([
  "Steel", "WoodStock", "Type89Armor", "Type89Track", "GrenadePbr", "DadaoPbr",
  "LugouqiaoOfficerSword", "LugouqiaoType11AmmoBox", "LugouqiaoType11Body", "LugouqiaoType11BodyAlt", "LugouqiaoType11Fore",
]);

function AttachInspectionChannels(material, channel) {
  const packedAo = material.userData.ormUniforms?.ao;
  // A GLB can omit UVs or tangents. Constant zero attributes leave those parts neutral in Tangent.
  material.defaultAttributeValues = { ...material.defaultAttributeValues, uv: [0, 0], tangent: [0, 0, 0, 1] };
  const inspection = MakePatch({
    key: packedAo ? "inspectionChannels1Orm" : "inspectionChannels1",
    defines: { USE_UV: "" },
    uniforms: (uniforms) => { uniforms.uInspectionChannel = channel; },
    vertex: [
      ["#include <common>", /* glsl */`
        #ifndef USE_TANGENT
          attribute vec4 tangent;
          varying vec3 vInspectionTangent;
        #endif`],
      ["#include <defaultnormal_vertex>", /* glsl */`
        #ifndef USE_TANGENT
          vInspectionTangent = mat3(modelViewMatrix) * tangent.xyz;
        #endif`],
    ],
    fragment: [
      ["#include <common>", /* glsl */`
        uniform int uInspectionChannel;
        #ifndef USE_TANGENT
          varying vec3 vInspectionTangent;
        #endif`],
      // Read the finished PBR inputs and light terms. Color channels use the display transfer,
      // while vector and scalar channels write their numeric values straight to the screen.
      ["#include <colorspace_fragment>", /* glsl */`
        switch (uInspectionChannel) {
          case ${CHANNELS.normal}:
            gl_FragColor.rgb = normal * 0.5 + 0.5;
            break;
          case ${CHANNELS.tangent}: {
            #if defined( USE_NORMALMAP_TANGENTSPACE ) || defined( USE_CLEARCOAT_NORMALMAP ) || defined( USE_ANISOTROPY )
              vec3 tangentDirection = tbn[0];
            #else
              #ifdef USE_TANGENT
                vec3 authoredTangent = vTangent;
              #else
                vec3 authoredTangent = vInspectionTangent;
              #endif
              // The U axis of the same derivative frame used by three's normal map shader.
              vec3 uvTangent = cross(dFdy(-vViewPosition), nonPerturbedNormal) * dFdx(vUv.x)
                + cross(nonPerturbedNormal, dFdx(-vViewPosition)) * dFdy(vUv.x);
              vec3 tangentDirection = dot(authoredTangent, authoredTangent) > 0.0 ? authoredTangent : uvTangent;
              #ifdef DOUBLE_SIDED
                tangentDirection *= faceDirection;
              #endif
            #endif
            float lengthSquared = dot(tangentDirection, tangentDirection);
            if (lengthSquared > 0.0) tangentDirection *= inversesqrt(lengthSquared);
            gl_FragColor.rgb = tangentDirection * 0.5 + 0.5;
            break;
          }
          case ${CHANNELS.albedo}:
            gl_FragColor.rgb = linearToOutputTexel(vec4(diffuseColor.rgb, 1.0)).rgb;
            break;
          case ${CHANNELS.roughness}:
            gl_FragColor.rgb = vec3(saturate(roughnessFactor));
            break;
          case ${CHANNELS.metallic}:
            gl_FragColor.rgb = vec3(saturate(metalnessFactor));
            break;
          case ${CHANNELS.ao}:
            #ifdef USE_AOMAP
              gl_FragColor.rgb = vec3(saturate(ambientOcclusion));
            #else
              gl_FragColor.rgb = vec3(saturate(${packedAo ? "gMaterialAo" : "1.0"}));
            #endif
            break;
          case ${CHANNELS.reflection}: {
            vec3 reflection = reflectedLight.indirectSpecular;
            #ifdef USE_SHEEN
              reflection += sheenSpecularIndirect;
            #endif
            #ifdef USE_CLEARCOAT
              reflection = reflection * (1.0 - material.clearcoat * Fcc) + material.clearcoat * clearcoatSpecularIndirect;
            #endif
            // Lift the isolated specular term for inspection of matte surfaces.
            reflection *= 6.0;
            #ifdef TONE_MAPPING
              reflection = toneMapping(reflection);
            #endif
            gl_FragColor.rgb = linearToOutputTexel(vec4(reflection, 1.0)).rgb;
            break;
          }
          case ${CHANNELS.shadow}:
            gl_FragColor.rgb = vec3(1.0);
            #if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
              if (receiveShadow) {
                DirectionalLightShadow keyShadow = directionalLightShadows[0];
                gl_FragColor.rgb = vec3(getShadow(directionalShadowMap[0], keyShadow.shadowMapSize,
                  keyShadow.shadowIntensity, keyShadow.shadowBias, keyShadow.shadowRadius, vDirectionalShadowCoord[0]));
              }
            #endif
            break;
        }`],
    ],
  });
  ApplyPatches(material, [...(PatchesOf(material) || []), inspection]);
  material.needsUpdate = true;
}

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
  const key = new THREE.DirectionalLight(0xfff5e7, 2.4);
  key.position.copy(KEY_LIGHT_DIRECTION);
  key.castShadow = true;
  key.shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
  key.shadow.autoUpdate = false;
  key.shadow.bias = -2 / SHADOW_MAP_SIZE;
  key.shadow.radius = .65;
  scene.add(key, key.target);
  for (const [color, intensity, x, y, z] of [
    [0xd6eaff, 1.15, 3, 1, 3], [0xffffff, 1.75, 2, 3, -5],
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
  return key;
}

function FitShadow(key, center, extent) {
  const radius = Math.max(extent.length() * .55, .001);
  key.target.position.copy(center);
  key.position.copy(center).addScaledVector(KEY_LIGHT_DIRECTION, 2 * radius);
  const { shadow } = key;
  const camera = shadow.camera;
  camera.left = camera.bottom = -radius;
  camera.right = camera.top = radius;
  camera.near = radius;
  camera.far = 3 * radius;
  camera.updateProjectionMatrix();
  shadow.normalBias = 2 * radius / SHADOW_MAP_SIZE;
  // The model and key light stay still during orbit, pan and zoom.
  shadow.needsUpdate = true;
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
    this.channel = { value: CHANNELS.beauty };
    this.inspectionMaterials = new WeakSet();
    this.keyLight = CreateLighting(this.renderer, this.scene);
    this.renderer.shadowMap.enabled = true;
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
        const mesh = new THREE.Mesh(geometry, this.materials[key] || this.materials.steel);
        mesh.name = key;
        body.add(mesh);
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
      // These runtime materials belong to the standalone page. Keep their textures and factors intact.
      model.group.traverse((object) => {
        if (!object.isMesh) return;
        object.castShadow = object.receiveShadow = true;
        for (const material of [object.material].flat()) {
          if (!material?.isMeshStandardMaterial || this.inspectionMaterials.has(material)) continue;
          AttachInspectionChannels(material, this.channel);
          this.inspectionMaterials.add(material);
        }
      });
      this.scene.add(model.group);
      const max = Math.max(...model.size.toArray());
      const step = max < .4 ? .05 : max < 1.8 ? .1 : max < 3 ? .25 : .5;
      this.grid = new THREE.GridHelper(step * 24, 24, 0xc2b99d, 0xaaa694);
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

  SetChannel(name) {
    const mode = CHANNELS[name];
    if (!Number.isInteger(mode) || mode === this.channel.value) return;
    this.channel.value = mode;
    this.RequestDraw();
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
    FitShadow(this.keyLight, this.center, extent);
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
