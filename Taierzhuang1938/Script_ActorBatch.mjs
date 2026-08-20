// 《滕县 一九三八》人物合批：把所有人物的分件网格按「几何 × 材质」收成 InstancedMesh。
//
// 为什么非做不可（实测数字，phase=2 城里，1280×720）：
//   城里同时站着 69 个人，每个人是 24—33 个分件网格（一根骨头下按材质分桶合并过，
//   见 Script_Actor 开头第 2 条）。这些网格合起来只有 15 万个三角形，却要占
//   **一帧 1408 个 draw call**（全场 1680 的 84%）—— 深度法线预通道一遍、主场景
//   一遍、阴影一遍。三角形早就不是瓶颈了，瓶颈是 three 在 JS 侧为每一次提交
//   做的那点固定开销（renderBufferDirect / setProgram / uniform 上传）。
//   RTX 4070 上 gl.finish() 不等任何东西：整帧是**纯 CPU 卡在提交上**。
//
// 为什么能无损：
//   · 全场 69 个人只用 69 份几何（几何按 kind 缓存）与 29 份材质（材质按个体着色后
//     也进缓存）—— 同一份「几何+材质」的分件在不同人身上是**同一个对象**，
//     实例化之后画出来的顶点与像素完全一样，差别只在提交次数。
//   · 每个分件的实例矩阵就是它自己的 matrixWorld（骨骼算完之后那一份），
//     所以姿态、身高缩放、武器缩放一个都不丢。
//   · 原网格不删、不改 visible（游戏逻辑还在读它），只是挪到一个没有相机也没有灯
//     去看的图层上（BATCH_LAYER）—— 于是它不进主渲染、不进阴影，但 matrixWorld
//     照旧每帧算，合批读的就是那一份。
//
// 三条边界，改之前先读：
//   1) **castShadow 是逐分件的语义、逐批次的现实**。Actor.SetShadowEnabled 会按距离
//      关掉中景人物的投影，所以每个批次拆成「投影」与「不投影」两只 InstancedMesh，
//      每帧按分件当下的 castShadow 分流。
//   2) **skipNormalDepth 同理**。日军那套 GLB 分段网格整体不进深度法线预通道
//      （Script_RiggedModel 标的），所以它进 key，批次自己带上这个 userData，
//      Post._CollectSkipped 照旧生效。
//   3) **InstancedMesh 不做逐实例剔除**，所以这里自己按人剔一次：人物包围球在相机
//      视锥里、**或者**离相机近到能往画面里投影子（阴影框半宽 62 m，取 120 m 冗余），
//      才写进实例表。这是原来逐网格剔除结果的超集 —— 多写的那些在屏幕外，
//      光栅化阶段一个像素都不落。
import * as THREE from "three";

/** 原网格挪去的图层：相机与灯的 layers 掩码都只有第 0 位，挪过去就等于不提交。 */
const BATCH_LAYER = 30;
/** 人物包围球半径（米）。人高 1.8 m，倒地/挥枪时分件最远也在根节点 1.5 m 内。 */
const ACTOR_RADIUS = 3;
/** 超出视锥但仍可能往画面里投影子的距离（米）。阴影框半宽 62 m，这里留一倍冗余。 */
const SHADOW_RELEVANT = 120;
/** 批次容量的最小值：别为了多一个人就重建一次 InstancedMesh。 */
const MIN_CAPACITY = 16;

export class ActorBatcher {
  /** @param {THREE.Scene} scene */
  constructor(scene) {
    this.scene = scene;
    this.enabled = true;
    this.records = new Map();     // actor -> { revision, entries }
    this.groups = new Map();      // key -> group
    this.frustum = new THREE.Frustum();
    this.viewProjection = new THREE.Matrix4();
    this.sphere = new THREE.Sphere(new THREE.Vector3(), ACTOR_RADIUS);
    this.cameraPosition = new THREE.Vector3();
    this.stats = { actors: 0, instances: 0, batches: 0 };
  }

  /**
   * 开关。关掉时把原网格放回第 0 层、批次清零 —— 画面回到「一个分件一个 draw call」
   * 的老路子。视觉回归就靠它在**同一帧**上开关对比（跨进程重跑对不齐：
   * 城里的战斗不是逐帧可复现的）。
   */
  SetEnabled(on) {
    const next = !!on;
    if (this.enabled === next) return this;
    this.enabled = next;
    for (const record of this.records.values()) {
      for (const entry of record.entries) entry.mesh.layers.set(next ? BATCH_LAYER : 0);
    }
    if (!next) {
      for (const group of this.groups.values()) {
        group.count.cast = 0; group.count.plain = 0;
        for (const kind of ["cast", "plain"]) if (group.meshes[kind]) group.meshes[kind].count = 0;
      }
    }
    return this;
  }

  /** 登记一个人物。重复登记是安全的（会按 partsRevision 重扫）。 */
  Add(actor) {
    if (!actor || !actor.root) return;
    if (!this.records.has(actor)) this.records.set(actor, { revision: -1, entries: [] });
    this._Scan(actor);
  }

  /** 摘掉一个人物：原网格放回第 0 层，实例表下一帧自然不再写它。 */
  Remove(actor) {
    const record = this.records.get(actor);
    if (!record) return;
    for (const entry of record.entries) entry.mesh.layers.set(0);
    this.records.delete(actor);
  }

  /** 换关：全摘干净，批次网格一并从场景上拿掉。 */
  Clear() {
    for (const actor of [...this.records.keys()]) this.Remove(actor);
    for (const group of this.groups.values()) {
      for (const kind of ["cast", "plain"]) {
        const mesh = group.meshes[kind];
        if (!mesh) continue;
        if (mesh.parent) mesh.parent.remove(mesh);
        mesh.dispose();
      }
    }
    this.groups.clear();
  }

  /**
   * 每帧一次，**排在 scene.updateMatrixWorld() 之后、出画之前**。
   * 顺序反了实例矩阵就落后一帧，表现为人物比自己的枪口火慢半拍。
   */
  Update(camera) {
    if (!this.enabled) return;
    for (const group of this.groups.values()) { group.count.cast = 0; group.count.plain = 0; }

    this.viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.viewProjection);
    this.cameraPosition.setFromMatrixPosition(camera.matrixWorld);

    let instances = 0;
    let actors = 0;
    for (const [actor, record] of this.records) {
      if (actor.disposed) { this.Remove(actor); continue; }
      if (record.revision !== (actor.partsRevision | 0)) this._Scan(actor);
      const root = actor.root;
      if (!root.visible || !root.parent) continue;
      this.sphere.center.setFromMatrixPosition(root.matrixWorld);
      const relevant = this.frustum.intersectsSphere(this.sphere)
        || this.sphere.center.distanceToSquared(this.cameraPosition) < SHADOW_RELEVANT * SHADOW_RELEVANT;
      if (!relevant) continue;
      actors += 1;
      for (const entry of record.entries) {
        const mesh = entry.mesh;
        if (!mesh.visible || !mesh.parent) continue;
        let hidden = false;
        for (const ancestor of entry.chain) { if (!ancestor.visible) { hidden = true; break; } }
        if (hidden) continue;
        const group = entry.group;
        const kind = mesh.castShadow ? "cast" : "plain";
        const index = group.count[kind];
        const buffer = this._EnsureBuffer(group, kind, index + 1);
        buffer.set(mesh.matrixWorld.elements, index * 16);
        group.count[kind] = index + 1;
        instances += 1;
      }
    }

    let batches = 0;
    for (const group of this.groups.values()) {
      for (const kind of ["cast", "plain"]) {
        const count = group.count[kind];
        const mesh = group.meshes[kind];
        if (!count) { if (mesh) mesh.count = 0; continue; }
        const target = this._EnsureMesh(group, kind, count);
        target.instanceMatrix.array.set(group.buffer[kind].subarray(0, count * 16));
        target.instanceMatrix.needsUpdate = true;
        target.count = count;
        batches += 1;
      }
    }
    this.stats.actors = actors;
    this.stats.instances = instances;
    this.stats.batches = batches;
  }

  // -------------------------------------------------------------------------

  _Scan(actor) {
    const record = this.records.get(actor);
    if (!record) return;
    for (const entry of record.entries) entry.mesh.layers.set(0);
    record.entries.length = 0;
    record.revision = actor.partsRevision | 0;
    const root = actor.root;
    root.traverse((object) => {
      if (!object.isMesh || object.isInstancedMesh || object.isSkinnedMesh) return;
      if (!object.geometry || !object.material || Array.isArray(object.material)) return;
      const skip = object.userData.skipNormalDepth === true;
      const key = `${object.geometry.id}|${object.material.id}|${skip ? 1 : 0}`;
      let group = this.groups.get(key);
      if (!group) {
        group = {
          key, skip, geometry: object.geometry, material: object.material,
          meshes: { cast: null, plain: null },
          buffer: { cast: new Float32Array(MIN_CAPACITY * 16), plain: new Float32Array(MIN_CAPACITY * 16) },
          count: { cast: 0, plain: 0 },
        };
        this.groups.set(key, group);
      }
      const chain = [];
      for (let node = object.parent; node && node !== root; node = node.parent) chain.push(node);
      chain.push(root);
      record.entries.push({ mesh: object, group, chain });
      if (this.enabled) object.layers.set(BATCH_LAYER);
    });
  }

  _EnsureBuffer(group, kind, need) {
    const buffer = group.buffer[kind];
    if (buffer.length >= need * 16) return buffer;
    const grown = new Float32Array(Math.max(need, (buffer.length / 16) * 2) * 16);
    grown.set(buffer);
    group.buffer[kind] = grown;
    return grown;
  }

  _EnsureMesh(group, kind, need) {
    const existing = group.meshes[kind];
    if (existing && existing.instanceMatrix.count >= need) return existing;
    if (existing) {
      if (existing.parent) existing.parent.remove(existing);
      existing.dispose();
    }
    const capacity = Math.max(MIN_CAPACITY, need, existing ? existing.instanceMatrix.count * 2 : 0);
    const mesh = new THREE.InstancedMesh(group.geometry, group.material, capacity);
    mesh.name = `ActorBatch_${group.key}_${kind}`;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.castShadow = kind === "cast";
    mesh.receiveShadow = true;
    // 实例是全场人物，包围盒每帧都在动；逐实例剔除已经在 Update 里按人做过了。
    mesh.frustumCulled = false;
    mesh.matrixAutoUpdate = false;
    mesh.matrixWorldAutoUpdate = false;
    if (group.skip) mesh.userData.skipNormalDepth = true;
    mesh.count = 0;
    this.scene.add(mesh);
    group.meshes[kind] = mesh;
    return mesh;
  }
}
