// 1938 bamboo field stretcher (竹竿布兜担架), baked by _blender/Script_StretcherBake.py.
//
// The GLB is one mesh in the litter's own frame: +Z toward the front bearer,
// head at -Z, pole centre-lines at x = ±0.29, y = 0.12, ending at z = ±1.075 —
// the same frame as P012_STRETCHER_GRIPS, so carry IK needs no offsets. Colour
// lives in COLOR_0; consumers use a white material with vertexColors. Boot
// waits for it next to the grenade; if it cannot be read, callers keep the
// procedural litter and the level still starts.

import * as THREE from "three";
import { GLTFLoader } from "./vendor/three/examples/jsm/loaders/GLTFLoader.js";

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
      for (let i = 0; i < rgba.count; i++) {
        rgb[i * 3] = rgba.getX(i); rgb[i * 3 + 1] = rgba.getY(i); rgb[i * 3 + 2] = rgba.getZ(i);
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
      console.warn(`[StretcherAsset] 读取失败，退回程序化担架：${String(error).slice(0, 180)}`);
      return null;
    });
  }
  return pending;
}

/** The loaded geometry (shared, do not mutate), or null before/without the GLB. */
export function StretcherAssetGeometry() {
  return geometry;
}
