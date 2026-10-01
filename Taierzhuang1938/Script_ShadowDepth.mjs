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

/**
 * 预热专用（Script_Main.WarmLevel 的「全场强制出画一帧」）：`fn` 执行期间，阴影趟每画一只对象，
 * 都让它拿到的那只深度材质重新取一次程序键。
 *
 * 由头（2026-10-01，Script_SavedGraphicsWarmTest 出手后第 13–19 帧现编一个深度程序）：上面说的
 * 「把对象材质的 map / side … 抄到深度材质上」**不会**让 three 重走 getProgram —— setProgram 只在
 * 蒙皮 / 实例 / 批次 / 变形这几位翻转、或材质 version 变了时才重新取键。所以一只共用深度材质编出
 * 哪几个变体，取决于阴影趟的绘制顺序：紧跟在一次翻转后面的那只对象按它自己的 map / side 取键，后面
 * 同种的对象一律沿用。实测预热帧里白盒体块（带贴图、正面）在阴影趟画了 46 次，一直沿用前一只的变体；
 * 开局后静态合批把顺序一换，「带贴图 + 画背面」这一组合才第一次被取键，在玩法帧里现编。
 *
 * 做法：只在烘焙那一刻（包一层 `shadowMap.render`）把 Object3D / BatchedMesh 原型上的 onBeforeShadow
 * 换成「先调原来的，再 `depthMaterial.needsUpdate = true`」：version 一变 setProgram 必走 getProgram，
 * 场上每只投影体按自己的组合取键，缺的变体当场编出来（已有的按键复用，不重编）。烘完立刻原样换回
 * （属性描述符一起还，ShadowCasterBatch 按函数身份认「没挂钩子」）；自己挂了 onBeforeShadow 的对象不受影响。
 * 每个 draw 多一次取键，只在加载画面后面用这一帧。
 * @param {import("three").WebGLRenderer} renderer
 * @param {() => T} fn
 * @returns {T}
 * @template T
 */
export function WithShadowDepthRekey(renderer, fn) {
  const shadowMap = renderer?.shadowMap;
  if (!shadowMap || typeof shadowMap.render !== "function") return fn();
  const prototypes = [THREE.Object3D.prototype, THREE.BatchedMesh.prototype]
    .filter((proto) => Object.prototype.hasOwnProperty.call(proto, "onBeforeShadow"));
  const saved = prototypes.map((proto) => Object.getOwnPropertyDescriptor(proto, "onBeforeShadow"));
  const bake = shadowMap.render;
  shadowMap.render = function ShadowDepthRekeyRender(...args) {
    prototypes.forEach((proto, i) => {
      const original = saved[i].value;
      Object.defineProperty(proto, "onBeforeShadow", {
        ...saved[i],
        value(renderer, object, camera, shadowCamera, geometry, depthMaterial, group) {
          original.call(this, renderer, object, camera, shadowCamera, geometry, depthMaterial, group);
          if (depthMaterial) depthMaterial.needsUpdate = true;
        },
      });
    });
    try {
      return bake.apply(this, args);
    } finally {
      prototypes.forEach((proto, i) => Object.defineProperty(proto, "onBeforeShadow", saved[i]));
    }
  };
  try {
    return fn();
  } finally {
    shadowMap.render = bake;
  }
}
