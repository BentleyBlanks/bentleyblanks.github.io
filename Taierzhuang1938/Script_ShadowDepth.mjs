// ===========================================================================
// Script_ShadowDepth.mjs —— 阴影趟按对象种类各一份共用的深度材质
//
// 由头：three 的 `getDepthMaterial` 对没挂 `customDepthMaterial` 的对象一律返回
// 同一只 `_depthMaterial`。而 `setProgram` 是拿 `object.isSkinnedMesh` /
// `isInstancedMesh` / `isBatchedMesh` 去比材质上记着的那一位的：阴影趟里蒙皮件、
// 静态件、实例件、BatchedMesh 挨着提交，每换一次种类就整个重走 `getProgram`
// （建参数对象 + 拼缓存键）。车厢机位实测每帧 96 次，占 `getParameters` 总数 117 的八成。
//
// 给这三类各一份自己的深度材质，每份只被同一种对象用，那一位就不再翻。
// 普通 Mesh 不挂，继续吃 three 的 `_depthMaterial`（`BuildSink` 的可破坏静态件
// 另有 `library.StaticDepth()`，那一只同样只被普通 Mesh 用，不冲突）。
//
// **画面不变**：three 仍然在每次 draw 之前把对象自己材质的 map / alphaMap /
// alphaTest / side / displacementMap 抄到返回的那只深度材质上，抄的时机与内容
// 与今天一模一样，多只网格共用一份也是「最后写的赢」——那正是今天共用
// `_depthMaterial` 的行为。程序也不会变多：three 的 program 缓存按参数键找，
// 蒙皮 / 实例 / 批次这三份深度程序本来就已经各有一个，这里只是换个材质对象去引用它们。
//
// depthPacking 取默认值（与 three 的 `_depthMaterial` 一致）：阴影图是硬件深度
// 纹理，颜色附件没人读，这里只求与今天逐字节一致。
// ===========================================================================

import * as THREE from "three";

function MakeShared(name) {
  const material = new THREE.MeshDepthMaterial();
  material.name = name;
  return material;
}

const SKINNED_DEPTH = MakeShared("SharedSkinnedShadowDepth");
const INSTANCED_DEPTH = MakeShared("SharedInstancedShadowDepth");
const BATCHED_DEPTH = MakeShared("SharedBatchedShadowDepth");

/**
 * 这只对象该用哪一份共用深度材质；普通 Mesh 返回 null（交给 three 自己那只）。
 * @param {import("three").Object3D} object
 * @returns {THREE.MeshDepthMaterial|null}
 */
export function ShadowDepthFor(object) {
  if (!object || object.isMesh !== true) return null;
  if (object.isBatchedMesh) return BATCHED_DEPTH;
  if (object.isInstancedMesh) return INSTANCED_DEPTH;
  if (object.isSkinnedMesh) return SKINNED_DEPTH;
  return null;
}

/**
 * 给一只网格挂上共用深度材质。已经有自己那份的（可破坏静态件、视模自阴影）不动。
 * @returns {boolean} 这次挂上了没有
 */
export function AttachShadowDepth(object) {
  if (object?.customDepthMaterial !== undefined) return false;
  const material = ShadowDepthFor(object);
  if (!material) return false;
  object.customDepthMaterial = material;
  return true;
}

/**
 * 整棵子树挂一遍。建完一批桶 / 一具 rig 之后调一次，不进每帧的路。
 * @returns {number} 挂上了几只
 */
export function ApplyShadowDepth(root) {
  if (!root) return 0;
  let count = 0;
  root.traverse((object) => { if (AttachShadowDepth(object)) count += 1; });
  return count;
}
