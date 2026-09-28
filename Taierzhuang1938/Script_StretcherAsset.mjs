// 1938 bamboo field stretcher (竹竿布兜担架), baked by _blender/Script_StretcherBake.py.
//
// The GLB is one mesh in the litter's own frame: +Z toward the front bearer,
// head at -Z, pole centre-lines at x = ±0.29, y = 0.12, ending at z = ±1.075 —
// the same frame as P012_STRETCHER_GRIPS, so carry IK needs no offsets. Colour
// lives in COLOR_0 (CreateStretcherMaterial). It is the game's only stretcher:
// boot waits for it next to the grenade and fails loudly if it cannot be read —
// there is no procedural stand-in to fall back to.

import * as THREE from "three";
import { GLTFLoader } from "./vendor/three/examples/jsm/loaders/GLTFLoader.js";
import { STRETCHER_COLOR_GRADE as GRADE } from "./Data_Tuning_Materials.mjs";

const URL = "./Model/Model_BambooStretcher.glb?v=stretcher20260927";
const loader = new GLTFLoader();
let pending = null;

let geometry = null;

export function LoadStretcherAsset() {
  if (!pending) {
    pending = loader.loadAsync(URL).then((gltf) => {
      let mesh = null;
      gltf.scene.traverse((object) => { if (!mesh && object.isMesh) mesh = object; });
      if (!mesh?.geometry?.attributes?.color) throw new Error("stretcher GLB has no vertex colours");
      mesh.updateWorldMatrix(true, false);
      const source = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
      // COLOR_0 arrives as normalized RGBA; alpha is always 1, and an RGBA
      // colour attribute would switch the material into its vertex-alpha variant.
      const rgba = source.attributes.color;
      const rgb = new Float32Array(rgba.count * 3);
      // 竹竿 / 布兜去饱和成旧竹的灰黄（Data_Tuning_Materials.STRETCHER_COLOR_GRADE）。
      for (let i = 0; i < rgba.count; i++) {
        const r = rgba.getX(i), g = rgba.getY(i), b = rgba.getZ(i);
        const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        rgb[i * 3] = (luma + (r - luma) * GRADE.saturation) * GRADE.gain * GRADE.tint[0];
        rgb[i * 3 + 1] = (luma + (g - luma) * GRADE.saturation) * GRADE.gain * GRADE.tint[1];
        rgb[i * 3 + 2] = (luma + (b - luma) * GRADE.saturation) * GRADE.gain * GRADE.tint[2];
      }
      source.setAttribute("color", new THREE.BufferAttribute(rgb, 3));
      for (const name of Object.keys(source.attributes))
        if (!["position", "normal", "color"].includes(name)) source.deleteAttribute(name);
      source.name = "BambooStretcher";
      source.computeBoundingBox();
      source.computeBoundingSphere();
      geometry = source;
      return geometry;
    }).catch((error) => {
      pending = null;
      throw new Error(`[StretcherAsset] 担架模型读取失败：${String(error).slice(0, 180)}`);
    });
  }
  return pending;
}

/** The loaded geometry (shared, do not mutate), or null before the GLB has arrived. */
export function StretcherAssetGeometry() {
  return geometry;
}

/** A private copy of the stretcher geometry in the grip frame. Boot must have loaded it. */
export function CreateStretcherGeometry() {
  if (!geometry) throw new Error("[StretcherAsset] 担架模型还没加载：先 await LoadStretcherAsset()");
  return geometry.clone();
}

/** The material every stretcher draws with: white, tinted by the baked vertex colours. */
export function CreateStretcherMaterial(options = {}) {
  return new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.92, metalness: 0, ...options });
}
