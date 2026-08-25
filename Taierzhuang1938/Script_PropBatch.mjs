// 《滕县 一九三八》外部布设道具合批：流送半径内的布设不再逐件克隆 Group，
// 而是收进「每资产 × 每材质一只 InstancedMesh」。
//
// 【为什么有这一层，2026-08-26】全城 1331 件布设 + 按关摆位走的是
// `asset.shell.clone(true)`，每件 1—17 个子网格，每个子网格每帧 3 次提交
// （MRT 预通道 + 主场景 + 阴影）。流送半径内同时 live 50—160 件，
// 约占一帧 200—700 个 draw call —— 与人物合批（Script_ActorBatch）修掉的
// 是同一类病：三角形不是瓶颈，three 在 JS 侧逐网格提交的固定开销才是。
//
// 与 ActorBatcher 的三点不同（这里都更简单）：
//   · 矩阵是**静态**的：摆位是写死的常量，spawn 之后不再动 ——
//     StaticDrawUsage，实例表只在流送进出时整桶重写一次；
//   · 不按 castShadow / skipNormalDepth 拆桶：布设一律
//     castShadow = receiveShadow = true、skipNormalDepth = false
//     （与 CloneLoadedAsset 给克隆定的完全一致），所以 key 只有 几何id|材质id；
//   · 容量按本关注册数**一次预留**：live ≤ registered 恒成立，转身/流送
//     永远不触发 GPU buffer 重建（ActorBatch.mjs:216-217 踩过这坑）。
//
// 【剔除的取舍 —— 150 m 分区拆桶试过，量完不要】每桶 frustumCulled = true，
// 包围球在每次整桶重写后按**当前 live 实例**重算
// （InstancedMesh.computeBoundingSphere 只看 count 内的矩阵）。live 集被流送
// 半径钉死在焦点附近，所以这只球通常**罩着相机** —— 整桶剔除在关内基本不命中，
// 它兜的是「焦点在关卡边缘、live 集整体偏向一侧」的情形。
// 按摆位坐标 150 m 分区拆桶（BuildSink.SetSector 的思路）两版都实测过
// （PropInstancingTest 同帧开关，七关开机机位，off→on）：
//     不拆：p0 537→520  p2 776→764  p3 524→494  p4 1325→1306  p5 1043→963  p6 674→688
//     拆分：p0 537→533  p2 776→761  p3 524→510  p4 1325→1305  p5 1043→1006  p6 674→678
// 拆分把桶的球钉进瓦片、背后的瓦片剔得掉，但布设的资产多样性高（live 集里
// 平均一桶只有 1—2 个实例），拆分主要在**碎桶**：十字街的收益从 −80 掉到 −37。
// 而不拆唯一的回归是六·北门这类「贴脸看墙」机位 +14（克隆老路逐网格剔除，
// 视野收窄时几乎不提交；静态实例表做不到 —— 要赢它得逐帧按视锥重写实例表，
// 那是 ActorBatch 的动态路线，与这里「矩阵静态、只在流送变化时重写」的
// 设计相抵）。+14 发生在全帧 674 的富余机位上，−80 发生在 1043 的高压机位上，
// 所以**不拆**。
//
// 谁在用：Script_ExternalProps.AddExternalProps 建桶并把 {bucket, matrix}
// 交给 PropStreamer 登记；spawn/despawn 只是把 part 加进/移出桶的 live 集
// 并标脏，每帧末 Flush() 一次性重写脏桶（live 只有几十件，微秒级）。

import * as THREE from "three";

export class PropBatcher {
  /** @param {THREE.Object3D} root 批次网格挂在这个组下（ExternalProps 的 liveRoot） */
  constructor(root) {
    this.root = root;
    this.buckets = new Map();   // `${geometry.id}|${material.id}` -> bucket
    this.overflow = 0;          // 必须恒为 0：容量按登记数一次预留，超了是接线 bug
  }

  /**
   * 取（或建）一个桶。几何是按资产合并后缓存的共享对象、材质是
   * MaterialLibrary / GLB 源里的共享实例 —— id 相同即是同一桶。
   */
  BucketFor(geometry, material) {
    const key = `${geometry.id}|${material.id}`;
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = {
        key, geometry, material,
        mesh: null, capacity: 0,
        live: new Set(),          // Set<part>，part = { bucket, matrix }
        dirty: false,
      };
      this.buckets.set(key, bucket);
    }
    return bucket;
  }

  /** 登记期把容量一次算够（AddExternalProps 每登记一件调一次）。 */
  Reserve(bucket, n = 1) {
    bucket.capacity += n;
  }

  /**
   * 登记完毕后把所有桶的 InstancedMesh 一次建齐（count = 0 的桶被空包围球
   * 剔掉，不产生提交）。不等第一次 spawn 才建，省掉进城路上的 buffer 分配。
   */
  Finalize() {
    for (const bucket of this.buckets.values()) {
      if (bucket.capacity > 0) this._EnsureMesh(bucket);
    }
  }

  Spawn(part) {
    part.bucket.live.add(part);
    part.bucket.dirty = true;
  }

  Despawn(part) {
    if (part.bucket.live.delete(part)) part.bucket.dirty = true;
  }

  /**
   * 每帧末（PropStreamer.Update 的尾巴）：只重写脏桶。
   * 不做逐槽位增量管理 —— live 是几十件的量级，整桶重写一次是微秒级，
   * 换来的是「实例表 = live 集」这个不变量不需要任何簿记就成立。
   */
  Flush() {
    for (const bucket of this.buckets.values()) {
      if (!bucket.dirty) continue;
      bucket.dirty = false;
      const mesh = this._EnsureMesh(bucket);
      const array = mesh.instanceMatrix.array;
      let index = 0;
      for (const part of bucket.live) {
        if (index >= mesh.instanceMatrix.count) { this.overflow += 1; break; }
        array.set(part.matrix.elements, index * 16);
        index += 1;
      }
      mesh.count = index;
      mesh.instanceMatrix.needsUpdate = true;
      // 包围球按当前 live 实例重算：live 集被流送半径钉死在焦点附近，
      // 这只球就是整桶剔除的依据（见文件头【剔除的取舍】）。
      mesh.computeBoundingSphere();
    }
  }

  Stats() {
    let instances = 0;
    let liveBuckets = 0;
    for (const bucket of this.buckets.values()) {
      if (!bucket.live.size) continue;
      liveBuckets += 1;
      instances += bucket.live.size;
    }
    return { buckets: this.buckets.size, liveBuckets, instances, overflow: this.overflow };
  }

  /** 换关：批次网格摘下并释放实例缓冲；几何/材质是共享缓存，不 dispose。 */
  Dispose() {
    for (const bucket of this.buckets.values()) {
      if (bucket.mesh) {
        bucket.mesh.parent?.remove(bucket.mesh);
        bucket.mesh.dispose();
        bucket.mesh = null;
      }
      bucket.live.clear();
    }
    this.buckets.clear();
  }

  _EnsureMesh(bucket) {
    if (bucket.mesh) return bucket.mesh;
    const capacity = Math.max(1, bucket.capacity, bucket.live.size);
    const mesh = new THREE.InstancedMesh(bucket.geometry, bucket.material, capacity);
    mesh.name = `PropBatch_${bucket.key}`;
    mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    // 与 CloneLoadedAsset 给每个克隆子网格定的口径一致（所以不必进桶 key）。
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = true;
    mesh.count = 0;
    this.root.add(mesh);
    bucket.mesh = mesh;
    return mesh;
  }
}
