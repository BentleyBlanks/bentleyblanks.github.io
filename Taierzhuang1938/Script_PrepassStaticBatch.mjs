// ===========================================================================
// Script_PrepassStaticBatch.mjs —— 深度法线预通道的静态合批
//
// 由头（2026-10-02 第一关 12 阶段 high，Frame Debugger 逐 draw 归账）：预通道每帧 375 个 draw，
// 其中白盒体块 40、壕沟面 37、工事 23、地形 20、壕沟土 9 …… 一百多个是一动不动的分区块。
// 这一趟所有不透明件共用**同一只覆盖材质**（Script_PostPrepass.MakeNormalDepthMaterial），
// 材质的差别在这里根本不存在，逐块提交只是在付每个 draw 的固定 CPU 开销（≈ 7 µs）。
// 做法照抄阴影趟那一份（Script_ShadowCasterBatch 头注）：
//   1. **只收真静态的**：普通不透明叶子 Mesh（非蒙皮 / 实例 / 批次），覆盖材质换得掉、没有镂空贴图、
//      不半透明、不在 skipNormalDepth / 距离上限 / 前景那几类里，矩阵行列式为正，自己没有别的逐 draw 钩子
//      （BuildSink 的破口裁切钩子 `userData.prepassDamageHook` 例外：整批一起开裁切与逐件开是同一回事），
//      且连续 settleFrames 帧矩阵、整条父链可见性、几何（position / normal / index 版本）、材质（对象、版本、
//      地形融合接收标记）都没变。
//   2. 收进去：合批里加一份只带 position + normal 的几何（同一份几何只加一次）+ 一个实例（矩阵 = matrixWorld），
//      按「破口裁切 × 地形融合接收」分组。**成员自己的任何属性都不改**。
//   3. **只在预通道那一刻换人**：PrepassPass.Render 里把合批打开、成员藏起，画完还原。阴影烘焙恰好发生在
//      同一次 renderer.render 里面（预通道是本帧第一次出画），所以 InstallPrepassStaticBatch 再包一层
//      `shadowMap.render`：烘之前把成员原样还回来，阴影趟看到的与没有本模块时一模一样。
//   4. 速度：合批走覆盖材质的「只有相机速度」那条路（批次网格不记逐实例历史），与静态成员自己画时同一个结果；
//      成员的逐物体速度历史由 PrepassPass 每帧照常刷新（NoteStaticMember），它一动、当帧被踢出来自己画，
//      第一帧就有上一帧矩阵可比 —— MotionVector 契约（docs/Data_MotionVectorContract.md）不受影响。
//   5. 逐帧对账：上面任何一项一变，当帧踢出合批，冷却 cooldownFrames 帧再考虑。
//
// 调用点：PrepassPass.Render 每帧 Update + BeginPrepass / EndPrepass；Script_Main 装包装、在 WarmLevel 里 Prime。
// 回归口：Script_PrepassStaticBatchTest（纯 Node）。
// ===========================================================================

import * as THREE from "three";
import { PREPASS_STATIC_BATCH } from "./Data_Tuning_Graphics.mjs";

const CANDIDATE = 0, MEMBER = 1, COOLDOWN = 2;
const DEFAULT_BEFORE_RENDER = THREE.Object3D.prototype.onBeforeRender;
const DEFAULT_AFTER_RENDER = THREE.Object3D.prototype.onAfterRender;

function Within(object, root) {
  for (let node = object; node; node = node.parent) if (node === root) return true;
  return false;
}

function UnderForeground(object) {
  for (let node = object; node; node = node.parent) if (node.userData?.foregroundPrepassRoot) return true;
  return false;
}

// 与 Script_World.Flush 里 BuildSink 静态件的钩子同一件事：只为这一 draw 打开覆盖材质的破口裁切。
function DamageOn(_renderer, _scene, _camera, _geometry, material) {
  const enabled = material?.userData?.damageObjectEnabled;
  if (enabled) enabled.value = 1;
}
function DamageOff(_renderer, _scene, _camera, _geometry, material) {
  const enabled = material?.userData?.damageObjectEnabled;
  if (enabled) enabled.value = 0;
}

/** 这只对象的形状能不能进合批（不看它此刻动不动）。 */
export function PrepassBatchable(object) {
  if (!object.isMesh || object.isSkinnedMesh || object.isInstancedMesh || object.isBatchedMesh) return false;
  if (object.children.length) return false;   // 预通道里要整只藏起来：只收叶子
  const data = object.userData;
  if (!data || data.prepassStaticBatch || data.noPrepassBatch || data.skipNormalDepth || data.foregroundPrepass) return false;
  if ((Number(data.normalDepthMaxDistance) || 0) > 0) return false;
  if ((object.layers.mask & 1) === 0) return false;
  const hooked = object.onBeforeRender !== DEFAULT_BEFORE_RENDER || object.onAfterRender !== DEFAULT_AFTER_RENDER;
  if (hooked && !data.prepassDamageHook) return false;
  const material = object.material;
  if (!material || Array.isArray(material) || !material.visible || material.allowOverride === false) return false;
  if (material.transparent || material.wireframe) return false;
  if (material.alphaTest > 0 && material.map) return false;
  const geometry = object.geometry;
  const position = geometry?.attributes?.position, normal = geometry?.attributes?.normal;
  if (!position || position.itemSize !== 3 || position.count === 0) return false;
  if (!normal || normal.itemSize !== 3 || normal.count !== position.count) return false;
  if (geometry.morphAttributes?.position?.length || geometry.morphAttributes?.normal?.length) return false;
  if (geometry.drawRange.start !== 0 || geometry.drawRange.count !== Infinity) return false;
  return true;
}

function CopyVec3(attribute, count) {
  const out = new Float32Array(count * 3);
  if (!attribute.isInterleavedBufferAttribute && !attribute.normalized && attribute.array instanceof Float32Array) {
    out.set(attribute.array.subarray(0, count * 3));
  } else {
    for (let i = 0; i < count; i += 1) {
      out[i * 3] = attribute.getX(i); out[i * 3 + 1] = attribute.getY(i); out[i * 3 + 2] = attribute.getZ(i);
    }
  }
  return out;
}

export class PrepassStaticBatch {
  /**
   * @param {THREE.Scene} scene
   * @param {object} [options.tuning] 默认 Data_Tuning_Graphics.PREPASS_STATIC_BATCH
   * @param {() => number} [options.now] 计时（测试可注入）
   */
  constructor(scene, { tuning = PREPASS_STATIC_BATCH, now = () => performance.now() } = {}) {
    this.scene = scene;
    this.tuning = tuning;
    this.enabled = tuning.enabled !== false;
    this.now = now;
    this.records = new Map();          // object -> rec
    this.groups = new Map();           // key -> group
    this.live = [];                    // 这一帧要在预通道里打开的组
    this.hiding = false;               // BeginPrepass 与 EndPrepass 之间：成员藏着
    this.frame = 0;
    this.nextScan = 0;
    this.root = new THREE.Group();
    this.root.name = "PrepassStaticBatch";
    this.root.matrixAutoUpdate = false;
    this.stats = { members: 0, candidates: 0, groups: 0, joins: 0, evictions: 0, scans: 0 };
    this._matrix = new THREE.Matrix4();
  }

  /** 关掉时立即全部还原（A/B 与排障用）。 */
  SetEnabled(enabled) {
    const want = enabled !== false;
    if (want === this.enabled) return;
    this.enabled = want;
    if (!want) this._DissolveAll();
    this.nextScan = 0;
  }

  /** 每次预通道出画前一次（场景矩阵已是本帧的）。 */
  Update() {
    const scene = this.scene;
    if (!scene) return;
    this.frame += 1;
    if (!this.enabled) { if (this.records.size) this._DissolveAll(); this.live.length = 0; return; }
    if (this.root.parent !== scene) scene.add(this.root);
    if (this.frame >= this.nextScan) this._Scan();
    const T = this.tuning;
    const deadline = this.now() + T.joinBudgetMs;
    let budgetLeft = true;
    for (const rec of this.records.values()) {
      const object = rec.object;
      const inScene = this._InScene(object);
      if (rec.state === MEMBER) {
        if (!inScene || object.children.length || this._Changed(rec)) {
          this._Evict(rec);
          if (!inScene && !this._Attached(object)) this.records.delete(object);
        }
        continue;
      }
      if (rec.state === COOLDOWN) {
        if (!inScene && !this._Attached(object)) { this.records.delete(object); continue; }
        if (!inScene || this._Changed(rec)) { this._Snapshot(rec); rec.until = Math.max(rec.until, this.frame + T.cooldownFrames); continue; }
        if (this.frame >= rec.until) { rec.state = CANDIDATE; rec.stable = 0; }
        continue;
      }
      if (!inScene || !PrepassBatchable(object) || this._Changed(rec)) {
        if (!this._Attached(object) || !PrepassBatchable(object)) { this.records.delete(object); continue; }
        this._Snapshot(rec);
        rec.stable = 0;
        continue;
      }
      rec.stable += 1;
      if (rec.stable >= T.settleFrames && budgetLeft) {
        this._Join(rec);
        if (this.now() > deadline) budgetLeft = false;
      }
    }
    this._CollectLive();
  }

  /**
   * 加载画面后面一次收满（Script_Main.WarmLevel 结账帧之前），理由与 ShadowCasterBatch.Prime 相同：
   * 按逐帧规矩收的话开局前一秒每帧都在收编、重传批次缓冲。
   * @param {THREE.Object3D} [options.exclude] 这棵子树里的不收（预热代理：马上就拆）
   * @returns {number} 这一趟收进去的个数
   */
  Prime({ exclude = null } = {}) {
    if (!this.enabled || !this.scene) return 0;
    if (this.root.parent !== this.scene) this.scene.add(this.root);
    this._Scan();
    let joined = 0;
    for (const rec of this.records.values()) {
      if (rec.state !== CANDIDATE) continue;
      const object = rec.object;
      if (!this._InScene(object) || !PrepassBatchable(object)) continue;
      if (exclude && Within(object, exclude)) continue;
      this._Snapshot(rec);
      this._Join(rec);
      if (rec.state === MEMBER) joined += 1;
    }
    this._CollectLive();
    return joined;
  }

  /**
   * 预通道 renderer.render 之前：合批打开、成员藏起。`noteStatic(object)` 给每个成员刷新逐物体速度历史
   * （PrepassPass.NoteStaticMember），它被踢出来那一帧才有上一帧矩阵可比。
   */
  BeginPrepass(noteStatic = null) {
    if (this.hiding) return;
    const live = this.live;
    if (!this.enabled || live.length === 0) return;
    for (let i = 0; i < live.length; i += 1) {
      const group = live[i];
      group.mesh.visible = true;
      const objects = group.objects;
      for (let k = 0; k < objects.length; k += 1) {
        objects[k].visible = false;
        if (noteStatic) noteStatic(objects[k]);
      }
    }
    this.hiding = true;
  }

  EndPrepass() {
    if (!this.hiding) return;
    this._SetMembersVisible(true);
    for (let i = 0; i < this.live.length; i += 1) this.live[i].mesh.visible = false;
    this.hiding = false;
  }

  /** 成员在 Update 里刚确认过整条父链可见，藏与还原只翻它自己这一位。 */
  _SetMembersVisible(visible) {
    const live = this.live;
    for (let i = 0; i < live.length; i += 1) {
      const objects = live[i].objects;
      for (let k = 0; k < objects.length; k += 1) objects[k].visible = visible;
    }
  }

  /** 整场景扫一遍，把新出现的静态候选登记下来。 */
  _Scan() {
    this.nextScan = this.frame + this.tuning.rescanFrames;
    this.stats.scans += 1;
    const Visit = (object, visible, foreground) => {
      if (object === this.root) return;
      const shown = visible && object.visible !== false;
      const front = foreground || !!object.userData?.foregroundPrepassRoot;
      if (shown && !front && !this.records.has(object) && PrepassBatchable(object)) {
        const rec = { object, state: CANDIDATE, stable: 0, until: 0, matrix: new Float64Array(16),
          geometry: null, positionVersion: 0, normalVersion: 0, indexVersion: 0, material: null, materialVersion: 0,
          terrainBlend: false, damage: false, group: null, instanceId: -1, geometryEntry: null, slot: -1 };
        this._Snapshot(rec);
        this.records.set(object, rec);
      }
      const children = object.children;
      for (let i = 0; i < children.length; i += 1) Visit(children[i], shown, front);
    };
    Visit(this.scene, true, false);
  }

  /** 整条父链都可见、并且接在本场景上。 */
  _InScene(object) {
    for (let node = object; node; node = node.parent) {
      if (node.visible === false) return false;
      if (node === this.scene) return true;
    }
    return false;
  }

  _Attached(object) {
    for (let node = object; node; node = node.parent) if (node === this.scene) return true;
    return false;
  }

  _Snapshot(rec) {
    const object = rec.object;
    const e = object.matrixWorld.elements;
    for (let i = 0; i < 16; i += 1) rec.matrix[i] = e[i];
    const geometry = object.geometry;
    rec.geometry = geometry;
    rec.positionVersion = geometry.attributes.position.version;
    rec.normalVersion = geometry.attributes.normal ? geometry.attributes.normal.version : -1;
    rec.indexVersion = geometry.index ? geometry.index.version : -1;
    const material = object.material;
    rec.material = material;
    rec.materialVersion = material?.version ?? 0;
    rec.terrainBlend = !!material?.userData?.terrainBlendReceiver;
    rec.damage = !!object.userData?.prepassDamageHook;
  }

  _Changed(rec) {
    const object = rec.object;
    const e = object.matrixWorld.elements, m = rec.matrix;
    for (let i = 0; i < 16; i += 1) if (e[i] !== m[i]) return true;
    const geometry = object.geometry;
    if (geometry !== rec.geometry) return true;
    if (geometry.attributes.position.version !== rec.positionVersion) return true;
    if ((geometry.attributes.normal ? geometry.attributes.normal.version : -1) !== rec.normalVersion) return true;
    if ((geometry.index ? geometry.index.version : -1) !== rec.indexVersion) return true;
    const material = object.material;
    if (material !== rec.material) return true;
    if ((material?.version ?? 0) !== rec.materialVersion) return true;
    if (!!material?.userData?.terrainBlendReceiver !== rec.terrainBlend) return true;
    if (!!object.userData?.prepassDamageHook !== rec.damage) return true;
    return false;
  }

  _Join(rec) {
    const object = rec.object;
    // 镜像件：三方逐件翻 frontFace，BatchedMesh 一整批只有一个 —— 不收。
    if (object.matrixWorld.determinant() <= 0) { rec.state = COOLDOWN; rec.until = Infinity; return; }
    const group = this._Group(rec);
    const entry = this._GeometryEntry(group, rec.geometry);
    if (!entry) { rec.state = COOLDOWN; rec.until = this.frame + this.tuning.cooldownFrames; return; }
    const mesh = group.mesh;
    if (mesh.instanceCount >= mesh.maxInstanceCount) {
      mesh.setInstanceCount(Math.max(mesh.maxInstanceCount * 2, this.tuning.minInstanceCapacity));
    }
    const instanceId = mesh.addInstance(entry.id);
    mesh.setMatrixAt(instanceId, this._matrix.fromArray(rec.matrix));
    entry.refs += 1;
    rec.slot = group.objects.length;
    group.objects.push(object);
    group.recs.push(rec);
    group.members = group.objects.length;
    rec.group = group;
    rec.geometryEntry = entry;
    rec.instanceId = instanceId;
    rec.state = MEMBER;
    this.stats.joins += 1;
  }

  _Evict(rec) {
    const group = rec.group;
    if (group && rec.instanceId >= 0) {
      group.mesh.deleteInstance(rec.instanceId);
      const last = group.objects.length - 1;
      if (rec.slot !== last) {
        group.objects[rec.slot] = group.objects[last];
        group.recs[rec.slot] = group.recs[last];
        group.recs[rec.slot].slot = rec.slot;
      }
      group.objects.pop();
      group.recs.pop();
      group.members = group.objects.length;
      const entry = rec.geometryEntry;
      if (entry) {
        entry.refs -= 1;
        if (entry.refs <= 0) {
          group.mesh.deleteGeometry(entry.id);
          group.geometries.delete(entry.source);
        }
      }
    }
    rec.group = null;
    rec.slot = -1;
    rec.geometryEntry = null;
    rec.instanceId = -1;
    rec.state = COOLDOWN;
    rec.until = this.frame + this.tuning.cooldownFrames;
    this._Snapshot(rec);
    this.stats.evictions += 1;
  }

  _DissolveAll() {
    if (this.hiding) this.EndPrepass();
    this.records.clear();
    for (const group of this.groups.values()) {
      group.mesh.removeFromParent();
      group.mesh.material.dispose();
      group.mesh.dispose();
    }
    this.groups.clear();
    this.live.length = 0;
    this.stats.members = this.stats.candidates = this.stats.groups = 0;
  }

  _GroupKey(rec) { return `${rec.damage ? 1 : 0}|${rec.terrainBlend ? 1 : 0}`; }

  /** 建组时按眼下登记在册的同组总量一次留够（同一份几何只算一次）。 */
  _Demand(key) {
    let instances = 0, vertices = 0, indices = 0;
    const seen = new Set();
    for (const rec of this.records.values()) {
      if (!rec.geometry || this._GroupKey(rec) !== key) continue;
      instances += 1;
      if (seen.has(rec.geometry)) continue;
      seen.add(rec.geometry);
      const count = rec.geometry.attributes.position?.count || 0;
      vertices += count;
      indices += rec.geometry.index ? rec.geometry.index.count : count;
    }
    return { instances, vertices, indices };
  }

  _Group(rec) {
    const key = this._GroupKey(rec);
    let group = this.groups.get(key);
    if (group) return group;
    const T = this.tuning;
    // 这只材质永远不出画：预通道里被覆盖材质换掉，平时整只藏着。它只带覆盖材质要读的两位
    // （地形融合接收标记；alphaTest 0 = 不走镂空）。
    const material = new THREE.MeshBasicMaterial();
    material.name = `PrepassStaticBatch_${key}`;
    if (rec.terrainBlend) material.userData.terrainBlendReceiver = true;
    const demand = this._Demand(key), reserve = T.reserveScale ?? 1;
    const mesh = new THREE.BatchedMesh(
      Math.max(T.minInstanceCapacity, Math.ceil(demand.instances * reserve)),
      Math.max(T.minVertexCapacity, Math.ceil(demand.vertices * reserve)),
      Math.max(T.minVertexCapacity * 2, Math.ceil(demand.indices * reserve)),
      material);
    mesh.name = `PrepassStaticBatch_${this.groups.size}`;
    mesh.userData.prepassStaticBatch = true;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.visible = false;
    mesh.frustumCulled = false;          // 整批不剔，逐成员剔（BatchedMesh.onBeforeRender）
    mesh.perObjectFrustumCulled = true;
    mesh.sortObjects = false;
    mesh.matrixAutoUpdate = false;
    if (rec.damage) {
      // BatchedMesh 自己的 onBeforeRender 做逐成员剔除，不能覆盖掉，接在它后面。
      const cull = THREE.BatchedMesh.prototype.onBeforeRender;
      mesh.onBeforeRender = function (renderer, scene, camera, geometry, overrideMaterial, drawGroup) {
        cull.call(this, renderer, scene, camera, geometry, overrideMaterial, drawGroup);
        DamageOn(renderer, scene, camera, geometry, overrideMaterial);
      };
      mesh.onAfterRender = DamageOff;
    }
    this.root.add(mesh);
    group = { key, mesh, members: 0, objects: [], recs: [], geometries: new Map() };
    this.groups.set(key, group);
    return group;
  }

  /** 同一份源几何在一组里只加一次（position + normal + 索引）。空间不够先整理再按两倍扩。 */
  _GeometryEntry(group, source) {
    const normal = source.attributes.normal;
    const version = `${source.attributes.position.version}|${normal.version}|${source.index ? source.index.version : -1}`;
    const cached = group.geometries.get(source);
    if (cached && cached.version === version) return cached;
    if (cached) return null;               // 同一份几何的旧版本还有人在用：等它们被踢完
    const position = source.attributes.position;
    const count = position.count;
    const indexCount = source.index ? source.index.count : count;
    const indices = count > 65535 ? new Uint32Array(indexCount) : new Uint16Array(indexCount);
    const sourceIndex = source.index;
    if (sourceIndex && !sourceIndex.isInterleavedBufferAttribute && sourceIndex.array.length >= indexCount) {
      indices.set(sourceIndex.array.subarray(0, indexCount));
    } else if (sourceIndex) {
      for (let i = 0; i < indexCount; i += 1) indices[i] = sourceIndex.getX(i);
    } else {
      for (let i = 0; i < indexCount; i += 1) indices[i] = i;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(CopyVec3(position, count), 3));
    geometry.setAttribute("normal", new THREE.BufferAttribute(CopyVec3(normal, count), 3));
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    const mesh = group.mesh;
    if (mesh.unusedVertexCount < count || mesh.unusedIndexCount < indexCount) {
      mesh.optimize();
      if (mesh.unusedVertexCount < count || mesh.unusedIndexCount < indexCount) {
        const usedVertices = mesh.geometry.attributes.position ? mesh.geometry.attributes.position.count - mesh.unusedVertexCount : 0;
        const usedIndices = mesh.geometry.index ? mesh.geometry.index.count - mesh.unusedIndexCount : 0;
        const vertices = Math.max(this.tuning.minVertexCapacity, (usedVertices + count) * 2);
        const indicesMax = Math.max(this.tuning.minVertexCapacity * 2, (usedIndices + indexCount) * 2);
        mesh.setGeometrySize(vertices, indicesMax);
      }
    }
    const id = mesh.addGeometry(geometry);
    geometry.dispose();
    const entry = { id, refs: 0, version, source };
    group.geometries.set(source, entry);
    return entry;
  }

  _CollectLive() {
    this.live.length = 0;
    for (const group of this.groups.values()) if (group.members > 0) this.live.push(group);
    let members = 0, candidates = 0;
    for (const rec of this.records.values()) { if (rec.state === MEMBER) members += 1; else if (rec.state === CANDIDATE) candidates += 1; }
    this.stats.members = members;
    this.stats.candidates = candidates;
    this.stats.groups = this.live.length;
  }

  Dispose() {
    this._DissolveAll();
    this.root.removeFromParent();
  }
}

/**
 * 包一层 `renderer.shadowMap.render`（装在阴影静态合批外面）：预通道把成员藏着的时候，烘阴影之前
 * 原样还回来、烘完再藏。不在预通道里（hiding = false）就是直通。重复调用幂等。
 */
export function InstallPrepassStaticBatch(renderer, batch) {
  const shadowMap = renderer?.shadowMap;
  if (!shadowMap || typeof shadowMap.render !== "function" || shadowMap.render.prepassStaticBatch) return false;
  const original = shadowMap.render;
  const wrapped = function PrepassStaticBatchShadowRender(lights, scene, camera) {
    if (!batch.hiding) return original.call(this, lights, scene, camera);
    batch._SetMembersVisible(true);
    try {
      return original.call(this, lights, scene, camera);
    } finally {
      batch._SetMembersVisible(false);
    }
  };
  wrapped.prepassStaticBatch = true;
  shadowMap.render = wrapped;
  return true;
}
