// 白盒关卡编辑器里的单被（2026-10-21，用户：拖着冬瓜的被子用上传的正式资产）。
//
// 资产：Model/Model_SingleBlanket.glb（五补丁薄土布单被，docs/Data_SingleBlanket.md）：一只蒙皮网格 + 217 骨，
// 宽 1.4 m（±X）、长 1.9 m（头端 +Z、尾端 −Z），静止姿势平铺在 y = 0、面朝 +Y；贴图内嵌，双面、alpha 裁切。
// 五条动作里这里只用两条单帧静态姿势：Blanket_Flat（平铺）与 Blanket_DragPose（头端两角抬到 0.70 m、向里收、
// 肩部上托、两侧兜起、尾端贴地 —— 两个人拽着头端拖人的样子）。静态片段 glTF 时长 0，不交给 AnimationMixer
// （0 时长循环会除零），读每条轨道的第一帧，按权重在两者之间插值直接写骨头。
// 每一副被子各克隆一份骨架（CloneSkinnedRig，几何与贴图共用）。

import * as THREE from "three";
import { ManagedGLTFLoader as GLTFLoader } from "./Script_ModelImports.mjs";
import { CloneSkinnedRig } from "./Script_SkinnedClone.mjs";

export const BLOCKOUT_BLANKET = Object.freeze({
  url: "./Model/Model_SingleBlanket.glb?v=20261020SingleBlanketRig217",
  flatClip: "Blanket_Flat",
  dragClip: "Blanket_DragPose",
  /** 平铺 ↔ 拖拽的过渡快慢（每秒趋近的比例，指数平滑）。 */
  blendRate: 5,
});

let pending = null;

/** 读一次 GLB，把两条静态姿势拆成「骨名 → 位置 / 朝向」。→ Promise<{ scene, poses: { flat, drag } }> */
export function LoadBlockoutBlanket() {
  if (!pending) pending = new GLTFLoader().loadAsync(BLOCKOUT_BLANKET.url).then((gltf) => {
    const Pose = (name) => {
      const clip = gltf.animations.find(c => c.name === name);
      if (!clip) throw new Error(`单被缺动作 ${name}`);
      const pose = new Map();
      for (const track of clip.tracks) {
        const dot = track.name.lastIndexOf(".");
        const bone = track.name.slice(0, dot), prop = track.name.slice(dot + 1);
        if (prop !== "position" && prop !== "quaternion") continue;
        const entry = pose.get(bone) || {};
        entry[prop] = Array.from(track.values.slice(0, prop === "position" ? 3 : 4));
        pose.set(bone, entry);
      }
      return pose;
    };
    return { scene: gltf.scene, poses: { flat: Pose(BLOCKOUT_BLANKET.flatClip), drag: Pose(BLOCKOUT_BLANKET.dragClip) } };
  }).catch((error) => { pending = null; throw error; });
  return pending;
}

const _pa = new THREE.Vector3(), _pb = new THREE.Vector3(), _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion();

/**
 * 一副被子。root 原点 = 被子中心、平铺时贴在 y = 0，头端 +Z。
 * → { root, SetDrag(target, dt), drag, Dispose() }；SetDrag 的 target 0 = 平铺、1 = 拖拽，dt 秒（0 = 直接到位）。
 */
export function CreateBlockoutBlanket(asset) {
  const root = CloneSkinnedRig(asset.scene);
  root.name = "BlockoutSingleBlanket";
  root.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = true; object.receiveShadow = true;
    // 蒙皮网格的剔除球按第一次剔除时的姿势算、之后不更新（拖拽姿势头角抬高 0.7 m）：被子就几副，不剔
    object.frustumCulled = false;
  });
  // 某条姿势里没写的骨头取它的静止变换（导出时去掉了与静止相同的常量轨道也不怕）
  const bones = [];
  for (const name of new Set([...asset.poses.flat.keys(), ...asset.poses.drag.keys()])) {
    const bone = root.getObjectByName(name);
    if (!bone) continue;
    const rest = { position: bone.position.toArray(), quaternion: bone.quaternion.toArray() };
    const flat = { ...rest, ...asset.poses.flat.get(name) }, drag = { ...rest, ...asset.poses.drag.get(name) };
    bones.push({ bone, flat, drag });
  }
  const inst = {
    root, drag: -1,
    SetDrag(target, dt = 0) {
      const t = Math.min(1, Math.max(0, target));
      const next = this.drag < 0 || dt <= 0 ? t : this.drag + (t - this.drag) * (1 - Math.exp(-dt * BLOCKOUT_BLANKET.blendRate));
      if (Math.abs(next - this.drag) < 1e-4 && this.drag >= 0) return;
      this.drag = Math.abs(next - t) < 1e-3 ? t : next;
      const w = this.drag;
      for (const { bone, flat, drag } of bones) {
        if (flat.position && drag.position) bone.position.copy(_pa.fromArray(flat.position).lerp(_pb.fromArray(drag.position), w));
        if (flat.quaternion && drag.quaternion) bone.quaternion.copy(_qa.fromArray(flat.quaternion).slerp(_qb.fromArray(drag.quaternion), w));
      }
    },
    Dispose() { root.removeFromParent(); },
  };
  inst.SetDrag(0);
  return inst;
}
