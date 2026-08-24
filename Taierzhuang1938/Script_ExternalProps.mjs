// Downloaded, static dressing models for the Tengxian white-box.
//
// These are deliberately visual-only: collision, navigation and destruction
// stay owned by the procedural battlefield builders.  That keeps the existing
// historical building footprints and combat contracts deterministic while
// making a few close-range spaces feel less repeated.

import * as THREE from "three";
import { GLTFLoader } from "./vendor/three/examples/jsm/loaders/GLTFLoader.js";

const LOADER = new GLTFLoader();
const ASSETS = Object.freeze({
  house: { label: "乡村房屋", url: "./Model/Model_ChineseRuralHouse.glb?v=1", material: null },
  houseRow: { label: "民居排屋", url: "./Model/Model_AsianHouseRow.glb?v=1", material: null },
  housePair: { label: "民居双栋", url: "./Model/Model_AsianHousePair.glb?v=1", material: null },
  sandbag: { label: "沙袋", url: "./Model/Model_Sandbag.glb?v=1", material: null },
  cart: { label: "木制手推车", url: "./Model/Model_Handcart.glb?v=1", material: "WoodBeam" },
  fence: { label: "木栅栏", url: "./Model/Model_WoodFence.glb?v=1", material: "WoodBeam" },
  crate: { label: "木箱", url: "./Model/Model_WoodCrate.glb?v=1", material: "WoodDoor" },
  rubble: { label: "砖瓦堆", url: "./Model/Model_BrickRubble.glb?v=1", material: "GroundRubble" },
});

// Exact sites are a compact, intentional dressing pass rather than random
// scenery.  All positions are already world coordinates (X east, Z south).
const PLACEMENTS = Object.freeze({
  L0_Jiehe: [
    { asset: "fence", x: -88, z: -1362, ry: 0.14 },
    { asset: "fence", x: 76, z: -1336, ry: -0.22 },
    { asset: "rubble", x: -32, z: -1300, ry: 0.48, scale: 0.78 },
  ],
  L1_Beishahe: [
    { asset: "house", x: -1224, z: -164, ry: 0.04 },
    { asset: "houseRow", x: -1152, z: -208, ry: -0.1 },
    { asset: "sandbag", x: -1210, z: -140, ry: 0.35 },
    { asset: "cart", x: -1192, z: -121, ry: 0.22 },
    { asset: "crate", x: -1190, z: -119, ry: -0.15, scale: 0.96 },
    { asset: "fence", x: -1260, z: -104, ry: 0.05 },
    { asset: "rubble", x: -1170, z: -176, ry: -0.31, scale: 0.84 },
  ],
  L2_Dongguan: [
    { asset: "house", x: 462, z: -144, ry: 0.03 },
    { asset: "housePair", x: 428, z: -178, ry: 0.06 },
    { asset: "houseRow", x: 500, z: -60, ry: -0.12 },
    { asset: "cart", x: 485, z: -96, ry: -0.28, scale: 0.9 },
    { asset: "crate", x: 479, z: -94, ry: 0.18, scale: 0.92 },
    { asset: "rubble", x: 504, z: 18, ry: 0.46, scale: 1.05 },
  ],
  L3_Fanji: [
    { asset: "cart", x: 468, z: -54, ry: 0.16, scale: 0.86 },
    { asset: "crate", x: 471, z: -52, ry: -0.22, scale: 0.88 },
    { asset: "housePair", x: 508, z: -30, ry: -0.08 },
    { asset: "rubble", x: 516, z: 14, ry: 0.32, scale: 1.0 },
  ],
  L4_Chengqiang: [
    { asset: "rubble", x: 307, z: -67, ry: 0.52, scale: 1.18 },
    { asset: "crate", x: 260, z: -89, ry: -0.18, scale: 0.92 },
    { asset: "sandbag", x: 252, z: -80, ry: 0.42 },
    { asset: "sandbag", x: 257, z: -76, ry: -0.28, scale: 0.94 },
    { asset: "sandbag", x: 248, z: -85, ry: 0.88, scale: 0.9 },
  ],
  L5_Shizijie: [
    { asset: "cart", x: 112, z: -38, ry: 0.38, scale: 0.84 },
    { asset: "crate", x: 116, z: -36, ry: -0.22, scale: 0.86 },
    { asset: "houseRow", x: 84, z: -70, ry: 0.22 },
    { asset: "sandbag", x: 100, z: -52, ry: -0.4 },
    { asset: "rubble", x: -66, z: 44, ry: 0.18, scale: 0.92 },
  ],
  L6_Beimen: [
    { asset: "cart", x: -188, z: -128, ry: 0.18, scale: 0.82 },
    { asset: "crate", x: -184, z: -127, ry: -0.14, scale: 0.84 },
    { asset: "housePair", x: -224, z: -160, ry: 0.12 },
    { asset: "sandbag", x: -176, z: -118, ry: 0.55 },
    { asset: "rubble", x: -246, z: -36, ry: 0.41, scale: 0.96 },
  ],
});

const cache = new Map();
let liveRoot = null;

async function LoadAsset(id) {
  if (cache.has(id)) return cache.get(id);
  const spec = ASSETS[id];
  const pending = LOADER.loadAsync(spec.url).catch((error) => {
    console.warn(`[ExternalProps] ${id} 读取失败，跳过该布设：${String(error).slice(0, 180)}`);
    return null;
  });
  cache.set(id, pending);
  return pending;
}

function ApplyRuntimeMaterial(root, material) {
  if (!material) return;
  root.traverse((object) => {
    if (!object.isMesh) return;
    object.material = material;
  });
}

function CloneLoadedAsset(id, gltf, library) {
  if (!gltf) return null;
  const prop = gltf.scene.clone(true);
  const spec = ASSETS[id];
  ApplyRuntimeMaterial(prop, spec.material
    ? library.Get(spec.material, { roughness: 0.9, metalness: 0 }) : null);
  prop.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = true;
    object.receiveShadow = true;
    object.userData.skipNormalDepth = false;
  });
  return prop;
}

/** Dedicated editor catalog; runtime placement coordinates stay private below. */
export function ExternalPropCatalog() {
  return Object.entries(ASSETS).map(([id, spec]) => ({
    id, label: spec.label, url: spec.url, material: spec.material,
  }));
}

/** Clone one runtime prop for the component-library studio without placing it in a level. */
export async function InstantiateExternalProp(id, library) {
  if (!ASSETS[id]) return null;
  return CloneLoadedAsset(id, await LoadAsset(id), library);
}

/** Remove the previous level's visual-only props before its scene is disposed. */
export function ClearExternalProps() {
  if (!liveRoot) return;
  liveRoot.parent?.remove(liveRoot);
  liveRoot = null;
}

/**
 * Add the short list of downloaded props relevant to a built level.
 *
 * Models are cloned from one cached GLB each.  They never add collider boxes:
 * letting an imported decorative mesh silently alter AI paths would make the
 * deterministic map and the authored shell disagree.
 */
export async function AddExternalProps({ scene, library, phaseId, groundAt }) {
  ClearExternalProps();
  const placements = PLACEMENTS[phaseId] || [];
  if (!placements.length) return { count: 0, failed: [] };

  const ids = [...new Set(placements.map((entry) => entry.asset))];
  const loaded = await Promise.all(ids.map(async (id) => [id, await LoadAsset(id)]));
  const models = new Map(loaded);
  const root = new THREE.Group();
  root.name = `ExternalProps_${phaseId}`;
  root.userData.externalProps = true;
  const failed = [];
  let count = 0;

  for (const placement of placements) {
    const gltf = models.get(placement.asset);
    if (!gltf) { failed.push(placement.asset); continue; }
    const prop = CloneLoadedAsset(placement.asset, gltf, library);
    prop.name = `External_${placement.asset}_${count}`;
    prop.position.set(placement.x, groundAt(placement.x, placement.z), placement.z);
    prop.rotation.y = placement.ry || 0;
    prop.scale.setScalar(placement.scale || 1);
    root.add(prop);
    count += 1;
  }
  scene.add(root);
  liveRoot = root;
  return { count, failed };
}

export function ExternalPropCount(phaseId) {
  return (PLACEMENTS[phaseId] || []).length;
}
