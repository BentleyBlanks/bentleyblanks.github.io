import * as THREE from "../TunnelBell1942/vendor/three/build/three.module.mjs";
import { GLTFLoader } from "../TunnelBell1942/vendor/three/examples/jsm/loaders/GLTFLoader.mjs";

const AssetKitUrl = "./Model_ReedSignalEnvironmentKit.glb?v=20260808z24";
const RequiredAssetNames = Object.freeze([
  "Asset_SchoolFacade",
  "Asset_WoodenHandcart",
  "Asset_CheckpointWatchtower",
  "Asset_WaterSluice",
  "Asset_CivilianSampan",
  "Asset_TunnelInteriorKit",
  "Asset_DistantVillageCluster",
  "Asset_SchoolCourtyardVista",
  "Asset_BlockadeVista",
  "Asset_TunnelShaftVista",
  "Asset_FerryRiverbankVista",
]);

let assetLoadPromise = null;
let assetTemplates = null;
let assetLoadError = null;

function PrepareTemplate(template) {
  template.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = true;
    object.receiveShadow = true;
    object.frustumCulled = true;
    if (object.material) {
      object.material.envMapIntensity = 0.38;
      object.material.needsUpdate = true;
    }
  });
  template.updateMatrixWorld(true);
  return template;
}

export async function LoadSceneAssetKit3D() {
  if (assetTemplates) return assetTemplates;
  if (assetLoadPromise) return assetLoadPromise;
  assetLoadPromise = new GLTFLoader().loadAsync(AssetKitUrl).then((gltf) => {
    const templates = new Map();
    for (const name of RequiredAssetNames) {
      const template = gltf.scene.getObjectByName(name);
      if (!template) throw new Error(`Blender asset kit is missing ${name}`);
      templates.set(name, PrepareTemplate(template));
    }
    assetTemplates = templates;
    return templates;
  }).catch((error) => {
    assetLoadError = error;
    assetLoadPromise = null;
    throw error;
  });
  return assetLoadPromise;
}

export function InstantiateSceneAsset3D(name, options = {}) {
  const template = assetTemplates?.get(name);
  if (!template) return null;
  const instance = template.clone(true);
  const position = options.position || [0, 0, 0];
  const rotation = options.rotation || [0, 0, 0];
  const scale = options.scale ?? 1;
  instance.name = `${name}_Instance`;
  instance.position.set(position[0], position[1], position[2]);
  instance.rotation.set(rotation[0], rotation[1], rotation[2]);
  if (Array.isArray(scale)) instance.scale.set(scale[0], scale[1], scale[2]);
  else instance.scale.setScalar(scale);
  instance.userData.blenderAsset = name;
  instance.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = options.castShadow !== false;
    object.receiveShadow = options.receiveShadow !== false;
    object.userData.blenderAssetMesh = true;
    if (options.materialTint !== undefined && object.material) {
      const sourceMaterials = Array.isArray(object.material) ? object.material : [object.material];
      const tint = new THREE.Color(options.materialTint);
      const amount = options.tintAmount ?? 0.5;
      const clonedMaterials = sourceMaterials.map((material) => {
        const cloned = material.clone();
        if (cloned.color) cloned.color.lerp(tint, amount);
        if (options.opacity !== undefined) {
          cloned.transparent = options.opacity < 1;
          cloned.opacity = options.opacity;
          cloned.depthWrite = options.opacity >= 1;
        }
        return cloned;
      });
      object.material = Array.isArray(object.material) ? clonedMaterials : clonedMaterials[0];
      object.userData.blenderAssetInstanceMaterial = true;
    }
  });
  instance.updateMatrixWorld(true);
  return instance;
}

export function GetSceneAssetStatus3D() {
  return Object.freeze({
    ready: Boolean(assetTemplates),
    count: assetTemplates?.size || 0,
    error: assetLoadError ? String(assetLoadError) : "",
    names: assetTemplates ? [...assetTemplates.keys()] : [],
  });
}

export function MeasureSceneAsset3D(instance) {
  if (!instance) return null;
  const bounds = new THREE.Box3().setFromObject(instance);
  const size = new THREE.Vector3();
  bounds.getSize(size);
  return { x: size.x, y: size.y, z: size.z };
}
