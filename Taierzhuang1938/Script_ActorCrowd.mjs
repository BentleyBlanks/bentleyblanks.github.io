// 《滕县 一九三八》远景人群：把「看得见的人」和「画得起的人」拆成两层。
//
// 为什么非有不可（这是"看不到日军"那条 bug 的后一半）：
// 一个 Actor 是十几二十个网格、四十几个 draw call，所以 Script_Ai 只给最近的
// 13 个发名额。第一轮把名额从"按距离"改成"先过视锥、敌人优先"之后，日军终于
// 画出来了，但**最远的一个也只到 69—86 m** —— 玩家的原话是"起码要翻五倍"。
// 十字街那一关的机制本身就是一条 305 m 的通视走廊，八十米的人墙等于把机制砍了。
//
// 当前硬红线已提高到 5000 draw calls / 600 万三角面，但远景合批仍是必需的等价 LOD；
// 它在保持全部人物与尸体可见时使用，不能重新引入人数名额。这里的做法：
//
//   1) 每个 kind 烘一份「端着枪站着」和一份「已经倒地」的静态姿势，
//      按材质桶合并成几块几何；军人是蒙皮 GLB，那一份必须走 BakeSkinnedPose ——
//      **别按 matrixWorld 去变换蒙皮网格**，那条路会把人缩成 1.7 cm 的一粒，
//      画面上只剩一支飘在半空的步枪（2026-09-02 的那张实拍就是它），
//      账记在 BakeSkinnedPose 的头注上；
//   2) 每块几何配一个 InstancedMesh，容量给到全场兵力；
//   3) 每帧把"在视锥里、投影尺寸已经读不出关节动作"的人写进实例矩阵。
//
// 代价是远景的人**不做动作**（静态姿势 + 朝向；活人的卧倒仍用整体翻转）。这一条
// 能成立的前提是
// 距离门槛：60 m 上一个人在 900 px 高的屏幕上只有 26 px，200 m 上 8 px，
// 400 m 上 4 px —— 那个尺寸下动作是看不出来的，能不能看见**一个人形**才是全部。
// 门槛以内一律走精细 Actor，别拿静态姿势去糊近处的人。
//
// 开销：所有远景的人加起来是「材质桶数 × kind 数」个 draw call（实测 ~20），
// 与人数无关。相比之下 13 个精细 Actor 就要一千八百个。

import * as THREE from "three";
import { MergeGeometries } from "./Script_Geo.mjs";

/**
 * 单一 kind 的实例上限。尸体现在保留到本关结束，最大日军票池是 480；
 * 512 覆盖整关活人 + 尸体，避免长局里第 129 个远景尸体又消失。
 */
const CROWD_CAPACITY = 512;

/**
 * 烘焙姿势。aim 给 0.35 而不是 0：完全不端枪的话胳膊垂在身侧，
 * 远景剪影是一根竖棍，看不出是个持枪的兵。0.35 大致是"枪斜端在胸前"。
 */
const BAKE_STATE = { aim: 0.35, moveSpeed: 0, crouch: 0, prone: 0 };
const BAKE_STEPS = 6;      // 姿势是弹簧驱动的，推几帧让它收敛到稳态再烘
const DEAD_BAKE_STATE = { dead: true, dying: 1 };
const DEAD_BAKE_STEPS = 54; // 倒地动画 0.8 s；多推 0.1 s，确保烘的是完全定格帧

/**
 * 蒙皮网格的静态化：按**当前骨骼姿势**把顶点烘进网格自己的局部空间。
 *
 * 【这是"远景日军只剩一支飘着的枪"的病根，改这个文件之前先读完这一段】
 * SkinnedMesh 的顶点**不走自己的 matrixWorld**：three 在 updateMatrixWorld 里把
 * bindMatrixInverse 设成 inverse(matrixWorld)，着色器里再乘回 matrixWorld，两下
 * 正好抵消 —— 画出来的位置完全由骨骼给。军人 GLB 是 Max Biped 出的，网格节点上
 * 挂着一层 0.01 的物体缩放，运行时被这条抵消规则吃掉，所以看起来一切正常。
 *
 * 可远景层原来是 `geometry.clone().applyMatrix4(inverse(root)·mesh.matrixWorld)` ——
 * 它把那层 0.01 当了真：1.76 m 的人被缩成 1.7 cm 的一粒，四十六米外一个像素都不到。
 * 而挂在手部插槽上的步枪是普通 Mesh（插槽里已经补偿过缩放，世界缩放是 1），
 * 照常画出来。于是 46 m 外的每个人都只剩一支悬在半空的三八式。
 *
 * applyBoneTransform 的返回值末尾乘过 bindMatrixInverse，已经落在**网格自己的
 * 局部空间**，所以外面那条 inverse(root)·matrixWorld 原样保留即可，别再补偿一次。
 * 法线用 w=0 的 Vector4 走同一条链路（平移项被 w 吃掉，只剩线性部分），
 * 不必另外拼一遍混合矩阵，也不能改用 computeVertexNormals —— 那会把 GLB 里
 * 烘死的硬边全抹平。
 */
function BakeSkinnedPose(mesh) {
  const geometry = mesh.geometry.clone();
  const position = geometry.attributes.position;
  const normal = geometry.attributes.normal;
  if (!geometry.attributes.skinIndex || !geometry.attributes.skinWeight) return geometry;
  const vector = new THREE.Vector4();
  for (let i = 0; i < position.count; i += 1) {
    vector.set(position.getX(i), position.getY(i), position.getZ(i), 1);
    mesh.applyBoneTransform(i, vector);
    position.setXYZ(i, vector.x, vector.y, vector.z);
    if (!normal) continue;
    vector.set(normal.getX(i), normal.getY(i), normal.getZ(i), 0);
    mesh.applyBoneTransform(i, vector);
    const length = Math.hypot(vector.x, vector.y, vector.z) || 1;
    normal.setXYZ(i, vector.x / length, vector.y / length, vector.z / length);
  }
  position.needsUpdate = true;
  if (normal) normal.needsUpdate = true;
  // 姿势已经烘死，蒙皮属性只是白占显存（远景层是 InstancedMesh，不会再蒙皮）。
  geometry.deleteAttribute("skinIndex");
  geometry.deleteAttribute("skinWeight");
  return geometry;
}

export class ActorCrowd {
  /**
   * @param {THREE.Scene} scene
   * @param {import("./Script_Actor.mjs").ActorFactory} factory 已经 PreloadMeshes 过的工厂
   */
  constructor(scene, factory, { capacity = CROWD_CAPACITY } = {}) {
    this.scene = scene;
    this.factory = factory;
    this.capacity = Math.max(8, capacity | 0);
    // `${kind}:standing|dead` -> { meshes, count, dead, skinnedParts, bounds, bodyBounds }
    this.kinds = new Map();
    this.disposed = false;
    this._matrix = new THREE.Matrix4();
    this._pos = new THREE.Vector3();
    this._quat = new THREE.Quaternion();
    this._euler = new THREE.Euler(0, 0, 0, "YXZ");
    this._scale = new THREE.Vector3(1, 1, 1);
  }

  /**
   * 烘一个 kind 的远景模型：造一个真 Actor、摆好姿势、把每个网格按材质分桶，
   * 各自变换到 root 局部空间再合并。
   *
   * 几何一律 **clone 之后**再交给 MergeGeometries —— 它会 dispose 掉入参，
   * 而这些几何是 ActorFactory 按 kind 缓存、全场 Actor 共用的一份。
   *
   * 军人是蒙皮 GLB，那一份必须先过 BakeSkinnedPose（原因见它的头注：直接按
   * matrixWorld 变换会把人缩成 1.7 cm）；百姓/兜底的程序化分件是刚体，照旧。
   */
  _Bake(kind, dead = false) {
    const actor = this.factory.Create(kind, { seed: 4213 });
    const steps = dead ? DEAD_BAKE_STEPS : BAKE_STEPS;
    const state = dead ? DEAD_BAKE_STATE : BAKE_STATE;
    for (let i = 0; i < steps; i += 1) actor.Update(1 / 60, state);
    actor.root.updateMatrixWorld(true);
    // root 的 matrixWorld 里带着 ±4% 的身高随机缩放，求逆把它一并除掉：
    // 烘出来的是"标准身高"的模型，个体差交给实例矩阵。
    const inverse = new THREE.Matrix4().copy(actor.root.matrixWorld).invert();
    const local = new THREE.Matrix4();
    const byMaterial = new Map();
    // 取证用：整具与「人体那一部分」各自的包围盒。远景层退化成一支枪的时候，
    // 整具包围盒仍有枪撑着（0.6 m 见方）看不出问题，人体那一份会塌成一粒。
    const bounds = new THREE.Box3();
    const bodyBounds = new THREE.Box3();
    let skinnedParts = 0;
    actor.root.traverse((object) => {
      if (!object.isMesh || !object.geometry || !object.material || !object.visible) return;
      const skinned = object.isSkinnedMesh === true;
      const geometry = skinned ? BakeSkinnedPose(object) : object.geometry.clone();
      local.multiplyMatrices(inverse, object.matrixWorld);
      geometry.applyMatrix4(local);
      geometry.computeBoundingBox();
      bounds.union(geometry.boundingBox);
      if (skinned) { skinnedParts += 1; bodyBounds.union(geometry.boundingBox); }
      let list = byMaterial.get(object.material);
      if (!list) { list = []; byMaterial.set(object.material, list); }
      list.push(geometry);
    });
    actor.Dispose();

    const meshes = [];
    for (const [material, list] of byMaterial) {
      const mesh = new THREE.InstancedMesh(MergeGeometries(list), material, this.capacity);
      mesh.name = `Crowd_${kind}_${dead ? "Dead" : "Standing"}`;
      // 自己做视锥剔除（Script_Ai 那边逐人判），而且实例散布在全场，
      // 用一个包围球去剔整批人只会在转身时整批闪掉
      mesh.frustumCulled = false;
      // 远景的人不投影：四百米外的影子一个像素都看不见，而阴影 pass 要多花一遍
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.count = 0;
      this.scene.add(mesh);
      meshes.push(mesh);
    }
    return { meshes, count: 0, dead, skinnedParts, bounds, bodyBounds };
  }

  _Kind(kind, dead = false) {
    const standingKey = `${kind}:standing`;
    const deadKey = `${kind}:dead`;
    // 两个姿态成对烘焙。若等到第一具远景尸体出现才临时造 Actor、合并几何，
    // 修掉每帧慢路径以后反而会留下一次明显的死亡瞬间卡顿。
    if (!this.kinds.has(standingKey)) {
      this.kinds.set(standingKey, this._Bake(kind, false));
      this.kinds.set(deadKey, this._Bake(kind, true));
    }
    return this.kinds.get(dead ? deadKey : standingKey);
  }

  /** 每帧开始：把计数清零。 */
  Begin() {
    for (const entry of this.kinds.values()) entry.count = 0;
  }

  /**
   * 放一个远景的人。
   * @param {string} kind    nra / nraDare / ija
   * @param {THREE.Vector3} position 脚底位置
   * @param {number} yaw     朝向（弧度）
   * @param {number} scale   身高比例（1 = 标准）
   * @param {number} prone   活人姿态：0 站 / 1 卧
   * @param {boolean} dead   使用预烘焙的倒地姿态
   */
  Push(kind, position, yaw, scale = 1, prone = 0, dead = false) {
    if (this.disposed) return;
    const entry = this._Kind(kind, dead);
    const index = entry.count;
    if (index >= this.capacity) return;
    // 卧倒：绕 X 转 −80° 再把身子放到接近地面。远景上只需要"横过来的一条"，
    // 真去解卧姿骨骼没有意义（200 m 上人只有 8 px 高）。
    const lie = dead ? 0 : Math.min(1, Math.max(0, prone));
    this._euler.set(-lie * 1.4, yaw, 0);
    this._quat.setFromEuler(this._euler);
    this._pos.set(position.x, position.y + lie * 0.28 * scale, position.z);
    this._scale.setScalar(scale);
    this._matrix.compose(this._pos, this._quat, this._scale);
    for (const mesh of entry.meshes) mesh.setMatrixAt(index, this._matrix);
    entry.count = index + 1;
  }

  /** 每帧结束：把计数与脏标记交给渲染器。 */
  End() {
    for (const entry of this.kinds.values()) {
      for (const mesh of entry.meshes) {
        mesh.count = entry.count;
        mesh.instanceMatrix.needsUpdate = true;
      }
    }
  }

  /** 本帧一共放了多少个远景的人（取证用）。 */
  get Count() {
    let n = 0;
    for (const entry of this.kinds.values()) n += entry.count;
    return n;
  }

  /** 本帧使用预烘焙倒地姿态的实例数（性能／可见性回归取证用）。 */
  get DeadCount() {
    let n = 0;
    for (const entry of this.kinds.values()) if (entry.dead) n += entry.count;
    return n;
  }

  /**
   * 烘焙尺寸取证口。**这是"46 m 外只剩一支枪"那条回归的闸门** ——
   * 逐人 renderLod 计数、实例数、可见性标记全都拦不住它：人照样被推进实例表，
   * 只是那具身体被缩成一粒。所以断言必须落在 body 的实际尺寸上（米）。
   *
   * @param {string[]} kinds 要现场烘出来量的身份；不传就只报已经烘过的。
   */
  BakeReport(kinds = []) {
    for (const kind of kinds) this._Kind(kind, false);
    const out = {};
    for (const [key, entry] of this.kinds) {
      const size = new THREE.Vector3();
      const bodySize = new THREE.Vector3();
      if (!entry.bounds.isEmpty()) entry.bounds.getSize(size);
      if (!entry.bodyBounds.isEmpty()) entry.bodyBounds.getSize(bodySize);
      out[key] = {
        dead: entry.dead,
        meshes: entry.meshes.length,
        skinnedParts: entry.skinnedParts,
        size: [size.x, size.y, size.z],
        bodySize: [bodySize.x, bodySize.y, bodySize.z],
        // 站姿看高度、倒地看长度，统一取最长边，一条阈值同时管住两种姿势。
        bodySpan: Math.max(bodySize.x, bodySize.y, bodySize.z),
      };
    }
    return out;
  }

  Dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const entry of this.kinds.values()) {
      for (const mesh of entry.meshes) {
        if (mesh.parent) mesh.parent.remove(mesh);
        mesh.geometry.dispose();      // 材质是工厂缓存的共用件，**不能** dispose
      }
    }
    this.kinds.clear();
  }
}
