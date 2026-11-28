import * as THREE from "three";
import { WEAPONS } from "../Data_Weapons.mjs";
import { BAYONET_MESH_BY_WEAPON, MESHES, WEAPON_MESH_BY_ID } from "../Data_Meshes.mjs";
import { HANYANG_173R } from "../Data_HanYang173R.mjs";
import { TYPE38_511 } from "../Data_Type38_511.mjs";
import { OPTIONAL_VEHICLE_ASSETS, TYPE94_TANKETTE_ASSET } from "../Data_VehicleAssets.mjs";
import { ActorFactory } from "../Script_Actor.mjs";
import { InstantiateExternalProp } from "../Script_ExternalProps.mjs";
import { ConfigureHanYang173R, InstantiateHanYang173R, LoadHanYang173R } from "../Script_HanYang173R.mjs";
import { ConfigureType38_511, InstantiateType38_511, LoadType38_511 } from "../Script_Type38_511.mjs";
import { ApplyPatches, MakePatch, PatchesOf } from "../Script_MaterialPatches.mjs";
import { MaterialLibrary } from "../Script_Materials.mjs";
import { ClearMeshCache, LoadDocument } from "../Script_MeshLoad.mjs";
import { MeshUrl, WeaponMeshId } from "../Script_Meshes.mjs";
import { ManagedGLTFLoader } from "../Script_ModelImports.mjs";
import { Mulberry32 } from "../Script_Noise.mjs";
import { SetTextureImportRenderer } from "../Script_TextureImports.mjs";
import {
  CreateStandardCameraPost, BuildStandardPostOptions, ApplyEditorLiteCameraProfile,
} from "../Script_CameraProfile.mjs";
import {
  CreateGameEnvironmentLighting, DEFAULT_ENVIRONMENT_PRESET_NAME,
} from "../Script_EnvironmentProfile.mjs";
import { MarkNoPrepass } from "../Script_Post.mjs";
import { PBR_SETS } from "./Data_ToolStudioPbrSets.mjs";
import { WeaponMaterialPreview } from "./Script_WeaponMaterialPreview.mjs";
import { CreateInspectionSkyBackdrop } from "./Script_WeaponInspectionSky.mjs";

const GLB = {
  HanYang: { url: HANYANG_173R.url, Load: LoadHanYang173R, Configure: ConfigureHanYang173R, Instantiate: InstantiateHanYang173R },
  Type38_511: { url: TYPE38_511.url, Load: LoadType38_511, Configure: ConfigureType38_511, Instantiate: InstantiateType38_511 },
};

const VEHICLE_MODELS = [TYPE94_TANKETTE_ASSET, ...OPTIONAL_VEHICLE_ASSETS];
export const INSPECTION_MODELS = Object.freeze(Object.fromEntries([
  ...Object.entries(WEAPONS).filter(([, weapon]) => weapon.kind !== "vehicle"),
  ["Type30Hmg", {
    id: "Type30Hmg", kind: "hmg", side: "nra", name: "三十节式重机枪", emplaced: true,
    fullName: "三十节式重机枪",
    external: { url: "./Model/Type30Hmg/Model_Type30Hmg.glb?v=20261128steelFinish", textureAnisotropy: 16 },
  }],
  ...VEHICLE_MODELS.map((asset) => [asset.id, {
    id: asset.id, kind: "vehicle", side: "ija", name: asset.name ?? asset.label,
    fullName: asset.label, external: asset,
  }]),
]));

const PITCH_BY_ASSET = { OfficerSwordSet: -Math.PI / 2, MediumMortar: Math.PI * .34 };
const CHANNELS = Object.freeze({
  beauty: 0, normal: 1, tangent: 2, albedo: 3, roughness: 4, metallic: 5, ao: 6, reflection: 7, shadow: 8,
});
const SHADOW_MAP_SIZE = 2048;
const WEAPON_PBR_NAMES = new Set([
  "Steel", "WoodStock", "Type89Armor", "Type89Track", "GrenadePbr", "DadaoPbr",
  "LugouqiaoOfficerSword", "LugouqiaoType11AmmoBox", "LugouqiaoType11Body", "LugouqiaoType11BodyAlt", "LugouqiaoType11Fore",
]);

const INSPECTION_SHADOW_GLSL = /* glsl */`
  #if defined( USE_SHADOWMAP ) && defined( SHADOWMAP_TYPE_BASIC ) && NUM_DIR_LIGHT_SHADOWS > 0
    float InspectionShadowTap(sampler2D shadowMap, vec2 texel, vec2 mapSize, vec3 receiver, vec2 depthSlope) {
      vec2 uv = (clamp(texel, vec2(0.0), mapSize - 1.0) + 0.5) / mapSize;
      float reference = receiver.z + dot(depthSlope, uv - receiver.xy);
      return step(reference, texture2D(shadowMap, uv).r);
    }

    float InspectionShadow(sampler2D shadowMap, vec2 mapSize, float intensity, float bias, float radius, vec4 coord) {
      vec3 receiver = coord.xyz / coord.w;
      vec3 dx = dFdx(receiver);
      vec3 dy = dFdy(receiver);
      if (any(lessThan(receiver, vec3(0.0))) || any(greaterThan(receiver, vec3(1.0)))) return 1.0;
      float det = dx.x * dy.y - dx.y * dy.x;
      vec2 depthSlope = vec2(0.0);
      if (abs(det) > 1e-16) {
        depthSlope = clamp(vec2(dx.z * dy.y - dy.z * dx.y, dx.x * dy.z - dy.x * dx.z) / det, -16.0, 16.0);
      }
      receiver.z += bias;
      // Compare at each actual texel center. Interpolating the comparisons keeps edges soft
      // without comparing neighboring depths against the same point on a sloped surface.
      vec2 grid = receiver.xy * mapSize - 0.5;
      vec2 base = floor(grid);
      vec2 weight = fract(grid);
      float a = InspectionShadowTap(shadowMap, base, mapSize, receiver, depthSlope);
      float b = InspectionShadowTap(shadowMap, base + vec2(1.0, 0.0), mapSize, receiver, depthSlope);
      float c = InspectionShadowTap(shadowMap, base + vec2(0.0, 1.0), mapSize, receiver, depthSlope);
      float d = InspectionShadowTap(shadowMap, base + vec2(1.0, 1.0), mapSize, receiver, depthSlope);
      return mix(1.0, mix(mix(a, b, weight.x), mix(c, d, weight.x), weight.y), intensity);
    }
    // Keep the direct lighting and the Shadow channel on the same visibility calculation.
    #define getShadow InspectionShadow
  #endif
`;

function AttachInspectionChannels(material, channel) {
  const packedAo = material.userData.ormUniforms?.ao;
  // Use the nearest surface for shadow visibility on thin parts, including the unlit side.
  material.shadowSide ??= material.side;
  // A GLB can omit UVs or tangents. Constant zero attributes leave those parts neutral in Tangent.
  material.defaultAttributeValues = { ...material.defaultAttributeValues, uv: [0, 0], tangent: [0, 0, 0, 1] };
  const inspection = MakePatch({
    key: packedAo ? "inspectionChannels3Orm" : "inspectionChannels3",
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
      ["#include <shadowmap_pars_fragment>", INSPECTION_SHADOW_GLSL],
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
            // Lift the isolated daylight reflection enough to read matte surfaces.
            reflection *= 2.25;
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

function FitShadow(envLighting, center, extent) {
  const radius = Math.max(extent.length() * .55, .001);
  // The model and key light stay still during orbit, pan and zoom.
  envLighting.FitShadow(center, radius, { nearScale: 1, farScale: 3 });
}

function MountPosition(instance, name) {
  const node = instance.nodes.get(name);
  return node ? node.getWorldPosition(new THREE.Vector3()) : null;
}

function SelectionGeometry({ object, start, count }) {
  const { index } = object.geometry;
  const position = object.geometry.getAttribute("position");
  const vertices = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const vertex = index ? index.getX(start + i) : start + i;
    const offset = i * 3;
    vertices[offset] = position.getX(vertex);
    vertices[offset + 1] = position.getY(vertex);
    vertices[offset + 2] = position.getZ(vertex);
  }
  return new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(vertices, 3));
}

export class WeaponInspectionScene {
  constructor(canvas, onDraw) {
    this.canvas = canvas;
    this.onDraw = onDraw;
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera();
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, powerPreference: "high-performance" });
    this.renderer.shadowMap.type = THREE.BasicShadowMap;
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.post = CreateStandardCameraPost(this.renderer, { width: 2, height: 2, quality: "high" });
    SetTextureImportRenderer(this.renderer);
    this.library = new MaterialLibrary(this.renderer);
    this.factory = new ActorFactory(this.library, {view: {camera: this.camera, renderer: this.renderer}});
    this.documents = new Map();
    this.externalGlbs = new Map();
    this.configuredGlbs = new WeakSet();
    this.center = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.span = 1;
    this.zoom = 1;
    this.gridVisible = true;
    this.wireframe = false;
    this.meshMaterials = [];
    this.wireMaterial = new THREE.MeshBasicMaterial({ color: 0xccc4af, wireframe: true, toneMapped: false });
    this.selectionMaterial = new THREE.MeshBasicMaterial({
      color: 0xffc75e, opacity: .56, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2, toneMapped: false,
    });
    MarkNoPrepass(this.selectionMaterial);
    this.occludedMaterial = new THREE.MeshBasicMaterial({
      color: 0xffc75e, opacity: .3, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      depthFunc: THREE.GreaterDepth, wireframe: true, toneMapped: false,
    });
    MarkNoPrepass(this.occludedMaterial);
    this.pendingFrame = 0;
    this.channel = { value: CHANNELS.beauty };
    this.inspectionMaterials = new WeakSet();
    this.envLighting = CreateGameEnvironmentLighting(this.renderer, this.scene, {
      preset: DEFAULT_ENVIRONMENT_PRESET_NAME,
      skyMode: "cube",
      shadow: {
        mapSize: SHADOW_MAP_SIZE,
        // With equal depth and width spans, one texel covers curved surfaces' residual depth error.
        bias: -1 / SHADOW_MAP_SIZE,
        autoUpdate: false,
      },
    });
    this.environmentPresetName = this.envLighting.presetName;
    this.environmentPreset = this.envLighting.preset;
    this.sunDirection = this.envLighting.sunDirection;
    this.skyTarget = this.envLighting.skyTarget;
    this.skyBackdrop = CreateInspectionSkyBackdrop(this.skyTarget.texture);
    this.scene.add(this.skyBackdrop);
    this.keyLight = this.envLighting.sun;
    this.globalProbe = this.envLighting.globalProbe;
    this.ambientLight = this.envLighting.ambient;
    this.materialPreview = new WeaponMaterialPreview(this.envLighting);
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

  async LoadExternal(asset) {
    if (asset.catalogId) return InstantiateExternalProp(asset.catalogId, this.library);
    const { url } = asset;
    let pending = this.externalGlbs.get(url);
    if (!pending) {
      this.externalGlbLoader ??= new ManagedGLTFLoader();
      pending = this.externalGlbLoader.loadAsync(url).then((gltf) => {
        const anisotropy = Math.min(asset.textureAnisotropy ?? 1, this.library.anisotropy || 1);
        if (anisotropy > 1) {
          gltf.scene.traverse((object) => {
            if (!object.isMesh) return;
            for (const material of [].concat(object.material)) {
              for (const texture of Object.values(material)) {
                if (!texture?.isTexture || texture.anisotropy === anisotropy) continue;
                texture.anisotropy = anisotropy;
                texture.needsUpdate = true;
              }
            }
          });
        }
        return gltf;
      }).catch((error) => {
        this.externalGlbs.delete(url);
        throw error;
      });
      this.externalGlbs.set(url, pending);
    }
    return (await pending).scene.clone(true);
  }

  async Load(id, variant = 0) {
    const weapon = INSPECTION_MODELS[id];
    const external = weapon.external;
    const meshId = WeaponMeshId(id, variant);
    const glb = GLB[meshId];
    const bayonetId = weapon.bayonet && BAYONET_MESH_BY_WEAPON[id];
    this.loadingMaterials ??= LoadMaterials(this.library);
    const [textureFallbacks, glbAsset, , bladeAvailable, externalRoot] = await Promise.all([
      this.loadingMaterials,
      glb?.Load(),
      !glb && MESHES[meshId] ? this.LoadMesh(meshId) : null,
      bayonetId ? this.LoadMesh(bayonetId).then(() => true, () => false) : false,
      external ? this.LoadExternal(external) : null,
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
    if (external) {
      if (!externalRoot) throw new Error(`模型无法实例化：${id}`);
      // The external loaders own the shared geometry.
      body.add(externalRoot);
    } else if (glb) {
      if (!this.configuredGlbs.has(glbAsset)) {
        glb.Configure(glbAsset, this.library);
        this.configuredGlbs.add(glbAsset);
      }
      const instance = glb.Instantiate(glbAsset, { batch: true });
      if (!instance) throw new Error(`模型无法实例化：${id}`);
      AddInstance(body, instance);
      nodes = instance.nodes;
      muzzle = MountPosition(instance, "muzzle");
      grip = MountPosition(instance, "gripL");
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
    const glbUrl = external?.url ?? glb?.url;
    const file = glbUrl?.slice("./Model/".length).split("?")[0] ?? MESHES[meshId]?.file ?? "程序化模型";
    return {
      id, variant, glbAsset, group, body, pose, blade, muzzle, grip, nodes, size, file, triangles, ownedGeometry,
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
    this.firstPerson = null;
    this.SelectPart(null);
    this.materialPreview.Set(null, null);
    this.Release(this.model);
    this.model = model;
    this.meshMaterials = [];
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
        this.meshMaterials.push({
          object, shaded: object.material,
          wire: Array.isArray(object.material) ? object.material.map((material) => material && this.wireMaterial) : this.wireMaterial,
        });
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
      MarkNoPrepass(this.grid.material);
      this.grid.userData.skipNormalDepth = true;
      this.grid.visible = this.gridVisible;
      this.scene.add(this.grid);
      this.Fit();
    }
    this.post.NotifyCameraCut();
    this.RequestDraw();
  }

  Resize() {
    const { clientWidth: width, clientHeight: height } = this.canvas;
    if (!width || !height || (width === this.width && height === this.height)) return;
    this.width = width;
    this.height = height;
    this.renderer.setSize(width, height, false);
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.post.SetSize(Math.max(2, size.x), Math.max(2, size.y));
    if (this.model && this.zoom === 1) this.Fit();
    this.RequestDraw();
  }

  SetView(yaw, pitch) {
    this.yaw = yaw;
    this.pitch = pitch;
    this.Fit();
  }

  SetFirstPerson(preview) {
    this.firstPerson = preview;
    this.post.NotifyCameraCut();
    this.RequestDraw();
  }

  SetChannel(name) {
    const mode = CHANNELS[name];
    if (!Number.isInteger(mode) || mode === this.channel.value) return;
    this.channel.value = mode;
    this.post.NotifyCameraCut();
    this.RequestDraw();
  }

  SetWireframe(on) {
    this.wireframe = on;
    this.selectionMaterial.wireframe = on;
    this.renderer.shadowMap.enabled = !on;
    this.post.NotifyCameraCut();
    this.RequestDraw();
  }

  SelectPart(part) {
    if (this.selection) {
      this.selection.group.removeFromParent();
      this.selection.geometry.dispose();
      this.selection = null;
    }
    if (part?.count) {
      const geometry = SelectionGeometry(part);
      const group = new THREE.Group();
      group.userData.skipNormalDepth = true;
      const fill = new THREE.Mesh(geometry, this.selectionMaterial);
      const occluded = new THREE.Mesh(geometry, this.occludedMaterial);
      fill.userData.skipNormalDepth = true;
      occluded.userData.skipNormalDepth = true;
      fill.renderOrder = 3;
      occluded.renderOrder = 4;
      group.add(fill, occluded);
      part.object.add(group);
      this.selection = { group, geometry };
    }
    this.post.NotifyCameraCut();
    this.RequestDraw();
  }

  PreviewMaterial(material, canvas) {
    this.materialPreview.Set(material, canvas);
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
    FitShadow(this.envLighting, this.center, extent);
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
    if (this.materialPreview.pending || this.firstPerson) {
      const channel = this.channel.value;
      this.channel.value = CHANNELS.beauty;
      try {
        if (this.materialPreview.pending) this.materialPreview.Draw(this.renderer);
        this.firstPerson?.Draw(this.renderer, this.width, this.height, this.post);
      } finally { this.channel.value = channel; }
      if (this.firstPerson) {
        this.onDraw?.();
        return;
      }
    }
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
    this.skyBackdrop.visible = !this.wireframe && this.channel.value === CHANNELS.beauty;
    if (this.wireframe) {
      this.renderer.setRenderTarget(null);
      this.renderer.setClearColor(0x000000, 0);
      for (const { object, wire } of this.meshMaterials) object.material = wire;
      try { this.renderer.render(this.scene, camera); } finally {
        for (const { object, shaded } of this.meshMaterials) object.material = shaded;
      }
    } else if (this.channel.value !== CHANNELS.beauty) {
      // 诊断通道（法线/切线/底色/粗糙/金属/AO/反射/阴影）直接输出数值，不经标准后处理；
      // 反射通道单独启用 editorLite ACESFilmic 映射，用完还原线性态。
      this.renderer.setRenderTarget(null);
      this.renderer.setClearColor(0x000000, 0);
      const savedTone = this.renderer.toneMapping;
      const savedExp = this.renderer.toneMappingExposure;
      const savedSpace = this.renderer.outputColorSpace;
      try {
        if (this.channel.value === CHANNELS.reflection) ApplyEditorLiteCameraProfile(this.renderer);
        this.renderer.render(this.scene, camera);
      } finally {
        this.renderer.toneMapping = savedTone;
        this.renderer.toneMappingExposure = savedExp;
        this.renderer.outputColorSpace = savedSpace;
      }
    } else {
      this.post.Render(this.scene, camera, BuildStandardPostOptions({
        sunDirection: this.sunDirection,
        dt: 1 / 60,
        steadyView: true,
      }));
    }
    this.onDraw?.();
  }

  Dispose() {
    this.resizeObserver?.disconnect();
    this.skyBackdrop.geometry.dispose();
    this.skyBackdrop.material.dispose();
    this.envLighting?.Dispose();
    this.post?.Dispose();
    this.renderer?.dispose();
  }
}
