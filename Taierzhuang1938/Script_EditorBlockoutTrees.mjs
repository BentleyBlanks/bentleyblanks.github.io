// 白盒关卡编辑器里的树（docs/Data_EditorBlockout.md §5.7，2026-10-20）。
//
// 用户：白盒里的树也用现成的正式模型。布局里标了 blockoutTree 的块（第一关 treeModel 树干块、场景文件里的
// 细高 foliage 块，见 Script_EditorBlockoutLevels）只留碰撞、不画盒子（visual:false），这里在同一位置种一棵
// 游戏里那种枯树（Model_BreakableDeadTree.glb 的完整树身：Stump + Crown 的树皮，不要断口盖），高度按块的
// treeHeightM（缺省块高）÷ 模型原高 BREAKABLE_TREES.heightM 等比缩放，朝向按 id 散开。不会被炸断（编辑器不需要）。
// 一关一只 InstancedMesh；切关（battlefield.layout 换了）重种。组上标 whiteboxCharacter：白盒画质里保留贴图。

import * as THREE from "three";
import { ManagedGLTFLoader as GLTFLoader } from "./Script_ModelImports.mjs";
import { mergeGeometries } from "./vendor/three/examples/jsm/utils/BufferGeometryUtils.js";
import { AttachShadowDepth } from "./Script_ShadowDepth.mjs";
import { BREAKABLE_TREES } from "./Data_Tuning_BreakableTrees.mjs";

export const BLOCKOUT_TREES = Object.freeze({
  url: "./Model/Model_BreakableDeadTree.glb?v=20261009LosslessWebp",
  parts: ["Stump", "Crown"],
  capMaterial: "Material_FracturedWood",
  /** 根往地下埋这么深（同 Script_BreakableTrees）。 */
  sinkM: 0.09,
});

/** 布局里要种树的块 → [{ id, x, z, heightM }]。 */
export function BlockoutTreeSpots(layout) {
  return (layout?.blocks || []).filter(b => b?.blockoutTree).map(b => ({
    id: String(b.id || ""), x: b.x, z: b.z, heightM: Number.isFinite(b.treeHeightM) && b.treeHeightM > 0 ? b.treeHeightM : b.h,
  }));
}

function HashAngle(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 3600) / 3600 * Math.PI * 2;
}

let templatePromise = null;
/** 树身模板：一份合并好的几何 + 一份材质。→ Promise<{ geometry, material }> */
function LoadTreeTemplate() {
  if (!templatePromise) templatePromise = new GLTFLoader().loadAsync(BLOCKOUT_TREES.url).then((gltf) => {
    const source = gltf.scene;
    source.updateMatrixWorld(true);
    const geometries = [];
    let material = null;
    for (const name of BLOCKOUT_TREES.parts) {
      const branch = source.getObjectByName(name);
      if (!branch) throw new Error(`Tree GLB is missing ${name}`);
      branch.traverse((mesh) => {
        if (!mesh.isMesh || mesh.material?.name === BLOCKOUT_TREES.capMaterial) return;
        geometries.push(mesh.geometry.clone().applyMatrix4(mesh.matrixWorld));
        material ||= mesh.material;
      });
    }
    const geometry = geometries.length ? mergeGeometries(geometries, false) : null;
    if (!geometry || !material) throw new Error("Tree GLB has no bark geometry");
    geometry.computeBoundingSphere();
    return { geometry, material };
  }).catch((error) => { templatePromise = null; throw error; });
  return templatePromise;
}

export class BlockoutTrees {
  constructor({ scene, groundAt }) {
    this.groundAt = groundAt;
    this.root = new THREE.Group();
    this.root.name = "BlockoutTrees";
    this.root.userData.whiteboxCharacter = true;
    scene?.add(this.root);
    this.template = null;
    this.failed = false;
    this.layout = null;
    this.mesh = null;
    this.count = 0;
    LoadTreeTemplate().then((template) => { this.template = template; })
      .catch((error) => { this.failed = true; console.warn("[BlockoutTrees] tree model failed; trees stay hidden", error); });
  }

  /** 每帧调：布局换了（或模板刚下完）就重种。 */
  Sync(layout) {
    if (!this.template || layout === this.layout) return;
    this.layout = layout;
    this._Clear();
    const spots = BlockoutTreeSpots(layout);
    this.count = spots.length;
    if (!spots.length) return;
    const mesh = new THREE.InstancedMesh(this.template.geometry, this.template.material, spots.length);
    mesh.name = "BlockoutTrees_Instances";
    mesh.castShadow = true; mesh.receiveShadow = true;
    AttachShadowDepth(mesh);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    spots.forEach((spot, i) => {
      p.set(spot.x, this.groundAt(spot.x, spot.z) - BLOCKOUT_TREES.sinkM, spot.z);
      q.setFromAxisAngle(up, HashAngle(spot.id));
      s.setScalar(spot.heightM / BREAKABLE_TREES.heightM);
      mesh.setMatrixAt(i, m.compose(p, q, s));
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    this.root.add(mesh);
    this.mesh = mesh;
  }

  _Clear() {
    if (!this.mesh) return;
    this.mesh.removeFromParent();
    this.mesh.dispose();   // 只拆实例缓冲；几何与材质是模板的，留着下一关用
    this.mesh = null;
  }

  Stats() { return { ready: !!this.template, failed: this.failed, count: this.mesh ? this.count : 0 }; }

  Dispose() { this._Clear(); this.root.removeFromParent(); }
}
