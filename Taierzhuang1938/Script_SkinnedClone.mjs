// ===========================================================================
// Script_SkinnedClone.mjs —— 克隆一具蒙皮模型，同一副骨架只留一份 Skeleton
//
// 由头：`SkeletonUtils.clone()` 是逐 SkinnedMesh 走的，每遇到一只就
// `skeleton.clone()` 一份。一具士兵按材质拆成七个分件，于是同一批 53 根骨头被
// 七份 Skeleton 各指一次。three 是按 Skeleton 算骨矩阵、按 Skeleton 传骨纹理的，
// 七份就是七遍同样的算和同样的上传。车厢机位实测：场上 185 只 SkinnedMesh 对着
// 只有 29 副真正不同的骨架，`Skeleton.update` 每帧实算 182 次、骨纹理每帧
// texSubImage2D 182 次共 1.49 MB、`Matrix4.toArray` 每帧 9734 次。
//
// 这里在克隆之后按「骨架根」（`bones[0]`）归并：同一组只留第一份 Skeleton，
// 其余的网格改 bind 到它，各自的 bindMatrix 原样保留。
//
// **合并前逐元素核对 boneInverses**：绑定姿势不同的两只网格共用一份骨矩阵会变形，
// 宁可不合并也不能合错。`Skeleton.clone()` 是把 boneInverses 数组整个按引用带过去的，
// 所以同一份 GLB 克隆出来的分件走的是第一条「同一个数组」的捷径。
//
// 骨骼历史（`Script_PostPrepass` 的上一帧骨矩阵）按 Skeleton 记，共用之后升一次、
// 快照一次就够，判据（`history.skeleton === object.skeleton`）不受影响：每只网格
// 在构造时绑定一次就不再换。
// ===========================================================================

import { clone as CloneSkeletonTree } from "./vendor/three/examples/jsm/utils/SkeletonUtils.js";

let mismatchWarned = false;

/** 两副 Skeleton 能不能共用一份骨矩阵：骨头逐个同一个对象，且 boneInverses 逐元素相同。 */
function SameBinding(a, b) {
  const boneCount = a.bones.length;
  if (boneCount !== b.bones.length) return false;
  for (let i = 0; i < boneCount; i += 1) if (a.bones[i] !== b.bones[i]) return false;
  const left = a.boneInverses, right = b.boneInverses;
  if (left === right) return true;
  if (!left || !right || left.length !== right.length) return false;
  for (let i = 0; i < left.length; i += 1) {
    const x = left[i]?.elements, y = right[i]?.elements;
    if (!x || !y) return false;
    for (let k = 0; k < 16; k += 1) if (x[k] !== y[k]) return false;
  }
  return true;
}

/**
 * 把一棵已经克隆好的模型树里指向同一副骨架的 Skeleton 合成一份。
 * @param {import("three").Object3D} root
 * @returns {number} 合并掉的 Skeleton 份数
 */
export function ShareSkeletons(root) {
  if (!root) return 0;
  const byArmature = new Map();   // bones[0] -> 留下的那份 Skeleton
  let shared = 0;
  root.traverse((object) => {
    const skeleton = object.isSkinnedMesh ? object.skeleton : null;
    const armature = skeleton?.bones?.[0];
    if (!armature) return;
    const kept = byArmature.get(armature);
    if (!kept) { byArmature.set(armature, skeleton); return; }
    if (kept === skeleton) return;
    if (!SameBinding(kept, skeleton)) {
      // 诊断，不是玩家可见文本：同一骨架根下出现了两套绑定姿势，只能各留各的。
      if (!mismatchWarned) {
        mismatchWarned = true;
        console.warn("[SkinnedClone] 同一骨架根下的 boneInverses 不一致，这些分件各自保留 Skeleton");
      }
      return;
    }
    object.bind(kept, object.bindMatrix);
    skeleton.dispose();
    shared += 1;
  });
  return shared;
}

/**
 * `SkeletonUtils.clone()` + 骨骼归并。所有进场景的蒙皮模型都走这一条。
 * @param {import("three").Object3D} source
 * @returns {import("three").Object3D}
 */
export function CloneSkinnedRig(source) {
  const root = CloneSkeletonTree(source);
  ShareSkeletons(root);
  return root;
}
