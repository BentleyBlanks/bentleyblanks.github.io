// Authored pre-1938 Chinese stick-grenade exterior; legacy filename retained.
//
// The Blender bake normalises its long axis to local Z, keeps the explosive
// head at -Z, and centres the geometry at the origin. Those are the same
// coordinates as the old procedural hand prop and projectile shell, so first-
// person animation and Rapier rotation need no special-case offsets. If the
// GLB cannot be read, callers keep the procedural grenade and battle still boots.

import { GLTFLoader } from "./vendor/three/examples/jsm/loaders/GLTFLoader.js";

const URL = "./Model/Model_Type24Grenade.glb?v=grenade20260906";
const loader = new GLTFLoader();
let pending = null;

export function LoadGrenadeAsset() {
  if (!pending) {
    pending = loader.loadAsync(URL).then((gltf) => {
      const root = gltf.scene;
      root.name = "Type24GrenadeAsset";
      root.traverse((object) => {
        if (!object.isMesh) return;
        object.frustumCulled = false;
        object.castShadow = false;
        object.receiveShadow = false;
      });
      return root;
    }).catch((error) => {
      console.warn(`[GrenadeAsset] 读取失败，退回程序化木柄弹：${String(error).slice(0, 180)}`);
      return null;
    });
  }
  return pending;
}

/** Clone the prepared model without sharing first-person material flags. */
export function CloneGrenadeAsset(asset, { firstPerson = false } = {}) {
  if (!asset) return null;
  const clone = asset.clone(true);
  if (!firstPerson) return clone;
  const materials = new Map();
  const cloneMaterial = (source) => {
    if (!source) return source;
    if (!materials.has(source)) materials.set(source, source.clone());
    return materials.get(source);
  };
  clone.traverse((object) => {
    if (!object.isMesh) return;
    object.material = Array.isArray(object.material)
      ? object.material.map(cloneMaterial) : cloneMaterial(object.material);
    // 第一人称树里的外来 GLB：由 Script_Viewmodel 在 markForegroundPrepass 那一趟
    // 统一接进材质库（ConfigureExternalPbr）与前景预通道口径。这里只留标记 ——
    // 这个函数拿不到 MaterialLibrary，而预通道归属由 MarkForegroundPrepass 决定，
    // 不再自己写 skipNormalDepth（写了就等于永远缺席 Debug Rendering 的 GBuffer 组）。
    object.userData.firstPersonExternalGlb = true;
  });
  return clone;
}
