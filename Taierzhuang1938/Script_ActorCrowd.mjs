// 《滕县 一九三八》远景人群：把「看得见的人」和「画得起的人」拆成两层。
//
// 为什么非有不可（这是"看不到日军"那条 bug 的后一半）：
// 一个 Actor 是十几二十个网格、四十几个 draw call，所以 Script_Ai 只给最近的
// 13 个发名额。第一轮把名额从"按距离"改成"先过视锥、敌人优先"之后，日军终于
// 画出来了，但**最远的一个也只到 69—86 m** —— 玩家的原话是"起码要翻五倍"。
// 十字街那一关的机制本身就是一条 305 m 的通视走廊，八十米的人墙等于把机制砍了。
//
// 直接把名额从 13 抬到 60 是不行的：那是两千多个 draw call，红线在 1400 上下。
// 唯一的出路是把远处的人**合批**。这里的做法：
//
//   1) 每个 kind 烘一份「端着枪站着」的静态姿势，按材质桶合并成几块几何；
//   2) 每块几何配一个 InstancedMesh，容量给到全场兵力；
//   3) 每帧把"在视锥里、但没拿到精细名额"的人写进实例矩阵。
//
// 代价是远景的人**不做动作**（静态姿势 + 朝向 + 卧倒翻转）。这一条能成立的前提是
// 距离门槛：60 m 上一个人在 900 px 高的屏幕上只有 26 px，200 m 上 8 px，
// 400 m 上 4 px —— 那个尺寸下动作是看不出来的，能不能看见**一个人形**才是全部。
// 门槛以内一律走精细 Actor，别拿静态姿势去糊近处的人。
//
// 开销：所有远景的人加起来是「材质桶数 × kind 数」个 draw call（实测 ~20），
// 与人数无关。相比之下 13 个精细 Actor 就要一千八百个。

import * as THREE from "three";
import { MergeGeometries } from "./Script_Geo.mjs";

/** 实例上限。全场兵力（maxAlive + 尸体）撑死七八十，128 留足余量。 */
const CROWD_CAPACITY = 128;

/**
 * 烘焙姿势。aim 给 0.35 而不是 0：完全不端枪的话胳膊垂在身侧，
 * 远景剪影是一根竖棍，看不出是个持枪的兵。0.35 大致是"枪斜端在胸前"。
 */
const BAKE_STATE = { aim: 0.35, moveSpeed: 0, crouch: 0, prone: 0 };
const BAKE_STEPS = 6;      // 姿势是弹簧驱动的，推几帧让它收敛到稳态再烘

export class ActorCrowd {
  /**
   * @param {THREE.Scene} scene
   * @param {import("./Script_Actor.mjs").ActorFactory} factory 已经 PreloadMeshes 过的工厂
   */
  constructor(scene, factory, { capacity = CROWD_CAPACITY } = {}) {
    this.scene = scene;
    this.factory = factory;
    this.capacity = Math.max(8, capacity | 0);
    this.kinds = new Map();          // kind -> { meshes: InstancedMesh[], count }
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
   */
  _Bake(kind) {
    const actor = this.factory.Create(kind, { seed: 4213 });
    for (let i = 0; i < BAKE_STEPS; i += 1) actor.Update(1 / 60, BAKE_STATE);
    actor.root.updateMatrixWorld(true);
    // root 的 matrixWorld 里带着 ±4% 的身高随机缩放，求逆把它一并除掉：
    // 烘出来的是"标准身高"的模型，个体差交给实例矩阵。
    const inverse = new THREE.Matrix4().copy(actor.root.matrixWorld).invert();
    const local = new THREE.Matrix4();
    const byMaterial = new Map();
    actor.root.traverse((object) => {
      if (!object.isMesh || !object.geometry || !object.material || !object.visible) return;
      const geometry = object.geometry.clone();
      local.multiplyMatrices(inverse, object.matrixWorld);
      geometry.applyMatrix4(local);
      let list = byMaterial.get(object.material);
      if (!list) { list = []; byMaterial.set(object.material, list); }
      list.push(geometry);
    });
    actor.Dispose();

    const meshes = [];
    for (const [material, list] of byMaterial) {
      const mesh = new THREE.InstancedMesh(MergeGeometries(list), material, this.capacity);
      mesh.name = `Crowd_${kind}`;
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
    return { meshes, count: 0 };
  }

  _Kind(kind) {
    let entry = this.kinds.get(kind);
    if (!entry) {
      entry = this._Bake(kind);
      this.kinds.set(kind, entry);
    }
    return entry;
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
   * @param {number} prone   0 站 / 1 卧
   */
  Push(kind, position, yaw, scale = 1, prone = 0) {
    if (this.disposed) return;
    const entry = this._Kind(kind);
    const index = entry.count;
    if (index >= this.capacity) return;
    // 卧倒：绕 X 转 −80° 再把身子放到接近地面。远景上只需要"横过来的一条"，
    // 真去解卧姿骨骼没有意义（200 m 上人只有 8 px 高）。
    const lie = Math.min(1, Math.max(0, prone));
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
