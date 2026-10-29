// ===========================================================================
// Script_ShadowCasterBatch.mjs —— 阴影趟静态投影体合批
//
// 由头（2026-09-27 第一关普查）：阴影两级每帧 180–260 个 draw，其中 27–68% 是一动不动的
// 静态网格（白盒块、战壕面、地形块、布设、工事）。帧被 CPU 提交卡住，每个 draw 都有
// 固定的 JS 开销。级联框跟着视线走（瞄准晃 1° 就变），按级联框缓存深度只在镜头完全
// 静止时命中，所以这里不做时间上的缓存：把静态投影体收进 three 的 BatchedMesh ——
//   · 每个成员照样用阴影相机逐个视锥剔除（BatchedMesh.onBeforeShadow）；大几何按局部网格
//     分成保守小块，每个原三角只归一块，画面内外的判断更细，原始三角与世界坐标都不变；
//     再按法线主轴归块，以缓存的三角平面区间跳过原生 side 本来就会剔掉的整块面；
//   · 整批一次 multi-draw 提交，draw 数从几十掉到「深度材质 × 正反面」那几组。
//
// 怎么做到「零画面变化、零过期影子」：
//   1. **只收真静态的**：普通 Mesh（非蒙皮 / 实例 / 批次）、castShadow、没有镂空贴图 /
//      位移 / 裁切面、没有自定义 onBeforeShadow、矩阵行列式为正（镜像件的绕序要逐件翻，
//      BatchedMesh 做不到），且**连续 settleFrames 帧**矩阵、整条父链可见性、几何（对象与
//      position / index 版本）、材质（对象与版本、side、shadowSide）、customDepthMaterial 都没变。
//   2. **收进去**：合批里加只带位置的几何（同一源几何的分块多人共用只加一次）+ 每块一个实例
//      （矩阵 = matrixWorld）；分块只重排完整三角并紧凑复制其顶点，不切三角、不改坐标。
//      **成员自己的任何属性都不改**（castShadow 也不动：Actor.SetShadowEnabled
//      会记原值、弹坑地形块会照抄源网格的 castShadow，改了就会被记错 / 抄错）。
//   3. **只在烘阴影那一刻换人**：`shadowMap.render` 期间把合批网格打开、把成员藏起来，烘完立刻
//      原样还原（与 Script_ShadowSkip 同一个做法；这段时间里没有游戏代码在跑）。主场景 / 预通道
//      永远看不到合批网格、看到的成员与它们的主人设的一模一样。成员必须是叶子（藏父节点会连
//      带藏掉子节点的影子）。three 的阴影趟按**主相机**图层判断，所以不能用图层来分。
//   4. **逐帧对账**：成员的上述任何一项一变、castShadow 被关、被藏、长出子节点、被摘出场景，
//      当帧踢出合批（删掉它那个实例），冷却 cooldownFrames 帧再考虑。所以任何时刻每个静态
//      投影体要么在一份和它完全一致的合批里，要么自己在投影。
//   5. 深度材质：成员自带 customDepthMaterial（BuildSink 可破坏静态件的破口裁切那只）的，
//      合批用它的**克隆**（CloneShadedMaterial：同一份破口 uniform，补丁已处理 USE_BATCHING）；
//      没有的，合批挂 Script_ShadowDepth 的共用批次深度材质。克隆是为了不让同一只材质在
//      普通 Mesh 与 BatchedMesh 之间翻种类（getProgram 风暴，见 Script_ShadowDepth 头注）。
//
// 调用点：Script_Main.RenderScene 在 scene.updateMatrixWorld 之后 Update 一次；
// InstallShadowCasterBatch 包 `renderer.shadowMap.render`（装在 ShadowSkip 外面一层）。
// 回归口：Script_ShadowCasterBatchTest（纯 Node）；实机看 shadow 段 draw 与逐像素阴影图。
// ===========================================================================

import * as THREE from "three";
import { AttachShadowDepth } from "./Script_ShadowDepth.mjs";
import { STATIC_CASTER_BATCH } from "./Data_Tuning_Shadows.mjs";

const CANDIDATE = 0, MEMBER = 1, COOLDOWN = 2;

function Within(object, root) {
  for (let node = object; node; node = node.parent) if (node === root) return true;
  return false;
}
const DEFAULT_BEFORE_SHADOW = THREE.Object3D.prototype.onBeforeShadow;
const DEFAULT_AFTER_SHADOW = THREE.Object3D.prototype.onAfterShadow;
const DEFAULT_BATCH_BEFORE_SHADOW = THREE.BatchedMesh.prototype.onBeforeShadow;
const AttributeVersion = (attribute) => attribute?.isInterleavedBufferAttribute ? attribute.data.version : attribute?.version;

/** 每块的所有有向三角平面在局部块心附近的区间；退化三角保守地令整块不做面向剔除。 */
function FacingBounds(geometry) {
  const position = geometry.attributes.position, indices = geometry.index.array;
  const box = new THREE.Box3().setFromBufferAttribute(position), center = box.getCenter(new THREE.Vector3());
  const min = [Infinity, Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity, -Infinity];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), normal = new THREE.Vector3();
  for (let i = 0; i < indices.length; i += 3) {
    a.fromBufferAttribute(position, indices[i]); b.fromBufferAttribute(position, indices[i + 1]); c.fromBufferAttribute(position, indices[i + 2]);
    b.sub(a); c.sub(a); normal.crossVectors(b, c);
    const area = normal.length();
    if (!(area > 1e-12)) return null;
    normal.multiplyScalar(1 / area); a.sub(center);
    const values = [normal.x, normal.y, normal.z, -normal.dot(a)];
    for (let axis = 0; axis < 4; axis += 1) { min[axis] = Math.min(min[axis], values[axis]); max[axis] = Math.max(max[axis], values[axis]); }
  }
  return { center, min, max };
}

/** 区间包含该块每个平面的精确符号；近边、混合面与浮点误差区都不剔除。 */
function FacingCulled(bounds, light, perspective, side) {
  if (!bounds || side === THREE.DoubleSide) return false;
  const x = light.x - (perspective ? bounds.center.x : 0), y = light.y - (perspective ? bounds.center.y : 0), z = light.z - (perspective ? bounds.center.z : 0);
  const { min, max } = bounds;
  const low = x * (x < 0 ? max[0] : min[0]) + y * (y < 0 ? max[1] : min[1]) + z * (z < 0 ? max[2] : min[2]) + (perspective ? min[3] : 0);
  const high = x * (x < 0 ? min[0] : max[0]) + y * (y < 0 ? min[1] : max[1]) + z * (z < 0 ? min[2] : max[2]) + (perspective ? max[3] : 0);
  // CPU 用 Float64 求界、GPU 用 Float32 逐步乘矩阵。留出相对 1e-4 的保守区，不能把近切线面排掉。
  const epsilon = 1e-4 * (1 + Math.abs(x) + Math.abs(y) + Math.abs(z));
  return side === THREE.FrontSide ? high < -epsilon : side === THREE.BackSide ? low > epsilon : false;
}

/** 这只对象的形状能不能进合批（不看它此刻动不动）。 */
function Batchable(object) {
  if (!object.isMesh || object.isSkinnedMesh || object.isInstancedMesh || object.isBatchedMesh) return false;
  if (object.children.length) return false;   // 烘焙时要整只藏起来：只收叶子
  if (object.userData?.shadowCasterBatch || object.userData?.noShadowBatch) return false;
  const material = object.material;
  if (!material || Array.isArray(material) || !material.visible || material.wireframe) return false;
  if (material.alphaTest > 0 && (material.map || material.alphaMap)) return false;
  if (material.alphaToCoverage) return false;
  if (material.displacementMap && material.displacementScale !== 0) return false;
  if (material.clipShadows && material.clippingPlanes?.length) return false;
  if (object.onBeforeShadow !== DEFAULT_BEFORE_SHADOW || object.onAfterShadow !== DEFAULT_AFTER_SHADOW) return false;
  const geometry = object.geometry;
  const position = geometry?.attributes?.position;
  if (!position || position.itemSize !== 3 || position.count === 0) return false;
  if (geometry.morphAttributes?.position?.length) return false;
  if (geometry.drawRange.start !== 0 || geometry.drawRange.count !== Infinity) return false;
  const depth = object.customDepthMaterial;
  if (depth !== undefined && (!depth || !depth.isMaterial)) return false;
  return true;
}

export class ShadowCasterBatch {
  /**
   * @param {THREE.Scene} scene
   * @param {object} [options]
   * @param {(m: THREE.Material) => THREE.Material} [options.cloneDepthMaterial] 克隆成员自带的深度材质
   * @param {object} [options.tuning] 默认 Data_Tuning_Shadows.STATIC_CASTER_BATCH
   * @param {() => number} [options.now] 计时（测试可注入）
   */
  constructor(scene, { cloneDepthMaterial = (m) => m.clone(), tuning = STATIC_CASTER_BATCH, now = () => performance.now() } = {}) {
    this.scene = scene;
    this.tuning = tuning;
    this.enabled = tuning.enabled !== false;
    /** 取证用：只在烘焙那一刻绕过合批（成员照旧自己投影），批次与登记原样保留。同页 A/B 每帧可切。 */
    this.bypass = false;
    this.cloneDepthMaterial = cloneDepthMaterial;
    this.now = now;
    this.records = new Map();          // object -> rec
    this.groups = new Map();           // key -> group
    this.geometryCache = new WeakMap(); // source -> 只构建一次的局部分块（进关 Prime 预留容量时就做好）
    this.depthClones = new Map();      // 成员的深度材质 -> 合批用的克隆
    // 批次版深度程序预热过的深度材质（WarmProxy 登记；"shared" 代表共用批次深度）。
    // 没预热过的一律不收 —— 收进来就会在游戏中途现编一个程序（实测一帧 ~100 ms）。
    this.warmedDepth = new Set();
    this.live = [];                    // 这一帧要在阴影趟里打开的组（BatchedMesh + 它的成员）
    this._hidden = [];                 // 烘焙期间自己藏掉的成员
    this.frame = 0;
    this.nextScan = 0;
    this.root = new THREE.Group();
    this.root.name = "ShadowCasterBatch";
    // **不许**标 skipNormalDepth：阴影烘焙发生在预通道那次 renderer.render 里面，预通道会在整个调用
    // 期间把 skipNormalDepth 的对象藏起来 —— 标了的话合批在烘焙时是隐藏的，一个深度都写不进去
    // （2026-09-27 逐纹素对比抓到的）。合批网格平时本来就 visible = false，预通道看不到它。
    this.root.matrixAutoUpdate = false;
    this.stats = { members: 0, candidates: 0, groups: 0, joins: 0, evictions: 0, scans: 0 };
    this._matrix = new THREE.Matrix4();
    this._shadowLight = new THREE.Vector3();
  }

  /** 关掉时立即全部还原（A/B 与排障用）。 */
  SetEnabled(enabled) {
    const want = enabled !== false;
    if (want === this.enabled) return;
    this.enabled = want;
    if (!want) this._DissolveAll();
    this.nextScan = 0;
  }

  /**
   * 每帧一次，排在 scene.updateMatrixWorld 之后、本帧第一次 renderer.render（阴影烘焙在那里）之前。
   */
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
        if (!inScene || !object.castShadow || object.children.length || this._Changed(rec)) {
          this._Evict(rec);
          if (!inScene && !this._Attached(object)) this.records.delete(object);
          continue;
        }
      } else if (rec.state === COOLDOWN) {
        if (!inScene && !this._Attached(object)) { this.records.delete(object); continue; }
        if (!inScene || this._Changed(rec)) { this._Snapshot(rec); rec.until = Math.max(rec.until, this.frame + T.cooldownFrames); continue; }
        if (this.frame >= rec.until) { rec.state = CANDIDATE; rec.stable = 0; }
      } else {
        if (!inScene || !object.castShadow || !Batchable(object) || this._Changed(rec)) {
          if (!this._Attached(object) || !object.castShadow || !Batchable(object)) { this.records.delete(object); continue; }
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
    }
    this._CollectLive();
  }

  /**
   * 加载画面后面一次收满（Script_Main.WarmLevel 结账帧之前）。静止判定（settleFrames）与逐帧预算
   * （joinBudgetMs）是给玩法中途才挂进场景的东西用的；进关那一刻按老规矩要先等半秒、再每帧收一点，
   * 开局前一秒每帧都在收编、重传批次缓冲（2026-10-02 实测 12 阶段 high 前 60 帧里 23 帧 35 ms）。
   * 开局才动的东西照旧在第一次变化时被踢回单独投影。前提：场景矩阵是新的、批次版深度已预热（WarmProxy）。
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
      if (!this._InScene(object) || !object.castShadow || !Batchable(object)) continue;
      if (exclude && Within(object, exclude)) continue;
      this._Snapshot(rec);
      this._Join(rec);
      if (rec.state === MEMBER) joined += 1;
    }
    this._CollectLive();
    return joined;
  }

  /** 这一帧阴影趟里要打开的批次 + 统计。 */
  _CollectLive() {
    this.live.length = 0;
    for (const group of this.groups.values()) if (group.members > 0) this.live.push(group);
    let members = 0, candidates = 0;
    for (const rec of this.records.values()) { if (rec.state === MEMBER) members += 1; else if (rec.state === CANDIDATE) candidates += 1; }
    this.stats.members = members;
    this.stats.candidates = candidates;
    this.stats.groups = this.live.length;
  }

  /** 整场景扫一遍，把新出现的静态投影体登记成候选。 */
  _Scan() {
    this.nextScan = this.frame + this.tuning.rescanFrames;
    this.stats.scans += 1;
    const scene = this.scene;
    const Visit = (object, visible) => {
      if (object === this.root) return;
      const shown = visible && object.visible !== false;
      if (shown && !this.records.has(object) && object.castShadow && Batchable(object) && this._DepthWarmed(object)) {
        const rec = { object, state: CANDIDATE, stable: 0, until: 0, matrix: new Float64Array(16),
          geometry: null, position: null, index: null, positionVersion: 0, indexVersion: 0, material: null, materialVersion: 0,
          side: 0, shadowSide: null, depth: undefined, group: null, instanceId: -1, instanceIds: [], geometryEntry: null, slot: -1 };
        this._Snapshot(rec);
        this.records.set(object, rec);
      }
      const children = object.children;
      for (let i = 0; i < children.length; i += 1) Visit(children[i], shown);
    };
    Visit(scene, true);
  }

  /** 这只对象的深度程序有没有预热过（批次版）。 */
  _DepthWarmed(object) {
    const depth = object.customDepthMaterial;
    return this.warmedDepth.has(depth === undefined ? "shared" : depth);
  }

  /** 整条父链都可见、并且接在本场景上。 */
  _InScene(object) {
    for (let node = object; node; node = node.parent) {
      if (node.visible === false) return false;
      if (node === this.scene) return true;
    }
    return false;
  }

  /** 父链能走到本场景（不管可见性）。 */
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
    rec.position = geometry.attributes.position;
    rec.index = geometry.index;
    rec.positionVersion = AttributeVersion(geometry.attributes.position);
    rec.indexVersion = geometry.index ? AttributeVersion(geometry.index) : -1;
    const material = object.material;
    rec.material = material;
    rec.materialVersion = material?.version ?? 0;
    rec.side = material?.side ?? THREE.FrontSide;
    rec.shadowSide = material?.shadowSide ?? null;
    rec.depth = object.customDepthMaterial;
  }

  _Changed(rec) {
    const object = rec.object;
    const e = object.matrixWorld.elements, m = rec.matrix;
    for (let i = 0; i < 16; i += 1) if (e[i] !== m[i]) return true;
    const geometry = object.geometry;
    if (geometry !== rec.geometry) return true;
    if (geometry.attributes.position !== rec.position || geometry.index !== rec.index) return true;
    if (AttributeVersion(geometry.attributes.position) !== rec.positionVersion) return true;
    if ((geometry.index ? AttributeVersion(geometry.index) : -1) !== rec.indexVersion) return true;
    const material = object.material;
    if (material !== rec.material) return true;
    if ((material?.version ?? 0) !== rec.materialVersion) return true;
    if ((material?.side ?? THREE.FrontSide) !== rec.side || (material?.shadowSide ?? null) !== rec.shadowSide) return true;
    if (object.customDepthMaterial !== rec.depth) return true;
    return false;
  }

  _Join(rec) {
    const object = rec.object;
    // 镜像件：三角绕序要逐件翻，BatchedMesh 一整批只有一个 frontFace —— 不收。
    if (object.matrixWorld.determinant() <= 0) { rec.state = COOLDOWN; rec.until = Infinity; return; }
    const group = this._Group(rec);
    const entry = this._GeometryEntry(group, rec.geometry);
    if (!entry) { rec.state = COOLDOWN; rec.until = this.frame + this.tuning.cooldownFrames; return; }
    const mesh = group.mesh;
    const neededInstances = mesh.instanceCount + entry.ids.length;
    if (neededInstances > mesh.maxInstanceCount) {
      mesh.setInstanceCount(Math.max(mesh.maxInstanceCount * 2, neededInstances, this.tuning.minInstanceCapacity));
    }
    this._matrix.fromArray(rec.matrix);
    rec.instanceIds = entry.ids.map((id) => {
      const instanceId = mesh.addInstance(id);
      mesh.setMatrixAt(instanceId, this._matrix);
      return instanceId;
    });
    entry.refs += 1;
    rec.slot = group.objects.length;
    group.objects.push(object);
    group.recs.push(rec);
    group.members = group.objects.length;
    rec.group = group;
    rec.geometryEntry = entry;
    rec.instanceId = rec.instanceIds[0]; // 保留单块诊断入口；源成员仍只登记一次
    // 实例纹理真实存的是 Float32；用同一份舍入后的矩阵求局部光源，避免 CPU 用另一份变换判面向。
    const storedMatrix = new THREE.Matrix4().fromArray(new Float32Array(rec.matrix));
    rec.inverse = storedMatrix.clone().invert();
    const linear = [0, 1, 2, 4, 5, 6, 8, 9, 10];
    const scale = Math.max(...linear.map((i) => Math.abs(storedMatrix.elements[i])));
    const inverseScale = Math.max(...linear.map((i) => Math.abs(rec.inverse.elements[i])));
    rec.facingSafe = storedMatrix.determinant() > 0 && scale * inverseScale < 1e4;
    rec.state = MEMBER;
    this.stats.joins += 1;
  }

  _Evict(rec) {
    const group = rec.group;
    if (group && rec.instanceId >= 0) {
      for (const instanceId of rec.instanceIds) group.mesh.deleteInstance(instanceId);
      // 从成员表里换尾删除，被换过来的那一个更新自己的位置号
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
          for (const id of entry.ids) group.mesh.deleteGeometry(id);
          group.geometries.delete(entry.source);
        }
      }
    }
    rec.group = null;
    rec.slot = -1;
    rec.geometryEntry = null;
    rec.instanceId = -1;
    rec.instanceIds = [];
    rec.state = COOLDOWN;
    rec.until = this.frame + this.tuning.cooldownFrames;
    this._Snapshot(rec);
    this.stats.evictions += 1;
  }

  _DissolveAll() {
    this.records.clear();
    for (const group of this.groups.values()) {
      group.mesh.removeFromParent();
      group.mesh.dispose();
    }
    this.groups.clear();
    this.live.length = 0;
  }

  /** 分组键：「深度材质 × side × shadowSide」。 */
  _GroupKey(rec) {
    return `${rec.depth ? rec.depth.uuid : "shared"}|${rec.side}|${rec.shadowSide}`;
  }

  /**
   * 这一组眼下登记在册的全部投影体要多少实例 / 顶点 / 索引（同一份几何只算一次）。
   * 建组时按它一次留够：游戏中途扩容（setGeometrySize / setInstanceCount）与整理
   * （optimize）都是整批拷贝再整块重传，2026-09-28 战车段录到一帧 199 ms。
   */
  _Demand(key) {
    let instances = 0, vertices = 0, indices = 0;
    const seen = new Set();
    for (const rec of this.records.values()) {
      if (!rec.geometry || this._GroupKey(rec) !== key) continue;
      const geometry = this._Geometry(rec.geometry);
      instances += geometry.parts.length;
      if (seen.has(rec.geometry)) continue;
      seen.add(rec.geometry);
      vertices += geometry.vertices;
      indices += geometry.indices;
    }
    return { instances, vertices, indices };
  }

  /** 按「深度材质 × side × shadowSide」分组，每组一只 BatchedMesh。 */
  _Group(rec) {
    const key = this._GroupKey(rec);
    let group = this.groups.get(key);
    if (group) return group;
    const T = this.tuning;
    const material = new THREE.MeshBasicMaterial({ side: rec.side, colorWrite: false, depthWrite: false });
    material.shadowSide = rec.shadowSide;
    material.name = `ShadowCasterBatch_${key}`;
    const demand = this._Demand(key), reserve = T.reserveScale ?? 1;
    const mesh = new THREE.BatchedMesh(
      Math.max(T.minInstanceCapacity, Math.ceil(demand.instances * reserve)),
      Math.max(T.minVertexCapacity, Math.ceil(demand.vertices * reserve)),
      Math.max(T.minVertexCapacity * 2, Math.ceil(demand.indices * reserve)),
      material);
    mesh.name = `ShadowCasterBatch_${this.groups.size}`;
    mesh.userData.shadowCasterBatch = true;
    mesh.castShadow = true;
    mesh.receiveShadow = false;
    mesh.visible = false;
    mesh.frustumCulled = false;          // 整批不剔，逐成员剔（onBeforeShadow）
    mesh.perObjectFrustumCulled = true;
    mesh.sortObjects = false;            // 深度趟不需要排序
    mesh.matrixAutoUpdate = false;
    mesh.onBeforeShadow = (renderer, object, camera, shadowCamera, geometry, depthMaterial, renderGroup) => {
      const hidden = [];
      try {
        if (this.tuning.localFacingCull !== false && depthMaterial.side !== THREE.DoubleSide) {
          const perspective = !shadowCamera.isOrthographicCamera;
          for (const member of group.recs) {
            if (!member.facingSafe) continue; // 极端缩放/近奇异矩阵保守保留，不能据不可靠逆矩阵判面向
            const light = this._shadowLight;
            if (perspective) light.setFromMatrixPosition(shadowCamera.matrixWorld).applyMatrix4(member.inverse);
            else light.set(0, 0, 1).transformDirection(shadowCamera.matrixWorld).transformDirection(member.inverse);
            const bounds = member.geometryEntry.prepared.facing;
            for (let i = 0; i < bounds.length; i += 1) {
              const instanceId = member.instanceIds[i];
              if (FacingCulled(bounds[i], light, perspective, depthMaterial.side) && mesh.getVisibleAt(instanceId)) {
                mesh.setVisibleAt(instanceId, false); hidden.push(instanceId);
              }
            }
          }
        }
        DEFAULT_BATCH_BEFORE_SHADOW.call(mesh, renderer, object, camera, shadowCamera, geometry, depthMaterial, renderGroup);
      } finally {
        // 原生 onBeforeShadow 已生成本次 multi-draw 清单；马上还原实例可见性，下一盏灯重新判。
        for (const instanceId of hidden) mesh.setVisibleAt(instanceId, true);
      }
    };
    if (rec.depth) {
      let clone = this.depthClones.get(rec.depth);
      if (!clone) { clone = this.cloneDepthMaterial(rec.depth); this.depthClones.set(rec.depth, clone); }
      mesh.customDepthMaterial = clone;
    } else {
      AttachShadowDepth(mesh);
    }
    this.root.add(mesh);
    group = { key, mesh, members: 0, objects: [], recs: [], geometries: new Map() };
    this.groups.set(key, group);
    return group;
  }

  /**
   * 源几何按局部网格归整三角：一块的包围球只罩该块完整三角，跨格三角也不裁切，所以剔除仍保守。
   * 所有 Float32 坐标逐值复制，世界矩阵照用源对象；自定义深度里的世界坐标破口与正反面不变。
   * 缓存跨组 / 踢出重收复用，Prime 的 _Demand 先造好并按实际顶点重复量预留整组容量。
   */
  _Geometry(source) {
    const position = source.attributes.position;
    const sourceIndex = source.index;
    const chunkSize = this.tuning.localChunkSize ?? 48;
    const minTriangles = this.tuning.localChunkMinTriangles ?? 1024;
    const facingCull = this.tuning.localFacingCull !== false;
    const version = `${AttributeVersion(position)}|${sourceIndex ? AttributeVersion(sourceIndex) : -1}|${chunkSize}|${minTriangles}|${facingCull}`;
    const cached = this.geometryCache.get(source);
    if (cached && cached.version === version && cached.position === position && cached.index === sourceIndex) return cached;
    const count = position.count;
    const positions = new Float32Array(count * 3);
    if (!position.isInterleavedBufferAttribute && !position.normalized && position.array instanceof Float32Array) {
      positions.set(position.array.subarray(0, count * 3));
    } else {
      for (let i = 0; i < count; i += 1) {
        positions[i * 3] = position.getX(i); positions[i * 3 + 1] = position.getY(i); positions[i * 3 + 2] = position.getZ(i);
      }
    }
    const indexCount = source.index ? source.index.count : count;
    const indices = count > 65535 ? new Uint32Array(indexCount) : new Uint16Array(indexCount);
    // 整块拷（值都 < count，Uint32 → Uint16 不会截断）；逐个 getX 在一块 8192 三角的地形上要毫秒级。
    if (sourceIndex && !sourceIndex.isInterleavedBufferAttribute && sourceIndex.array.length >= indexCount) {
      indices.set(sourceIndex.array.subarray(0, indexCount));
    } else if (sourceIndex) {
      for (let i = 0; i < indexCount; i += 1) indices[i] = sourceIndex.getX(i);
    } else {
      for (let i = 0; i < indexCount; i += 1) indices[i] = i;
    }
    const Make = (points, elements) => {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(points, 3));
      geometry.setIndex(new THREE.BufferAttribute(elements, 1));
      return geometry;
    };
    let parts = null;
    let large = false;
    if (chunkSize > 0 && indexCount / 3 >= minTriangles && indexCount % 3 === 0) {
      let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
      for (let i = 0; i < positions.length && !large; i += 3) {
        minX = Math.min(minX, positions[i]); maxX = Math.max(maxX, positions[i]);
        minY = Math.min(minY, positions[i + 1]); maxY = Math.max(maxY, positions[i + 1]);
        minZ = Math.min(minZ, positions[i + 2]); maxZ = Math.max(maxZ, positions[i + 2]);
        large = maxX - minX > chunkSize || maxY - minY > chunkSize || maxZ - minZ > chunkSize;
      }
    }
    if (large) {
      const cells = new Map();
      // 按三角重心分格，不向边界两边重复登记。细长/跨格三角完整保留在所属块的包围体里。
      for (let i = 0; i < indexCount; i += 3) {
        const a = indices[i] * 3, b = indices[i + 1] * 3, c = indices[i + 2] * 3;
        const x = Math.floor((positions[a] + positions[b] + positions[c]) / (3 * chunkSize));
        const y = Math.floor((positions[a + 1] + positions[b + 1] + positions[c + 1]) / (3 * chunkSize));
        const z = Math.floor((positions[a + 2] + positions[b + 2] + positions[c + 2]) / (3 * chunkSize));
        let facing = 0;
        if (facingCull) {
          const abX = positions[b] - positions[a], abY = positions[b + 1] - positions[a + 1], abZ = positions[b + 2] - positions[a + 2];
          const acX = positions[c] - positions[a], acY = positions[c + 1] - positions[a + 1], acZ = positions[c + 2] - positions[a + 2];
          const nx = abY * acZ - abZ * acY, ny = abZ * acX - abX * acZ, nz = abX * acY - abY * acX;
          const axis = Math.abs(nx) >= Math.abs(ny) && Math.abs(nx) >= Math.abs(nz) ? 0 : Math.abs(ny) >= Math.abs(nz) ? 1 : 2;
          const component = axis === 0 ? nx : axis === 1 ? ny : nz;
          facing = 1 + axis * 2 + (component < 0 ? 1 : 0);
        }
        const key = `${x}|${y}|${z}|${facing}`;
        let cell = cells.get(key);
        if (!cell) { cell = []; cells.set(key, cell); }
        cell.push(i);
      }
      if (cells.size > 1) {
        parts = [];
        for (const triangles of cells.values()) {
          const remap = new Map(), vertexIds = [], elements = [];
          for (const triangle of triangles) for (let corner = 0; corner < 3; corner += 1) {
            const original = indices[triangle + corner];
            let compact = remap.get(original);
            if (compact === undefined) { compact = vertexIds.length; remap.set(original, compact); vertexIds.push(original); }
            elements.push(compact);
          }
          const points = new Float32Array(vertexIds.length * 3);
          for (let i = 0; i < vertexIds.length; i += 1) {
            const start = vertexIds[i] * 3;
            points[i * 3] = positions[start]; points[i * 3 + 1] = positions[start + 1]; points[i * 3 + 2] = positions[start + 2];
          }
          const IndexArray = vertexIds.length > 65535 ? Uint32Array : Uint16Array;
          parts.push(Make(points, new IndexArray(elements)));
        }
      }
    }
    if (!parts) parts = [Make(positions, indices)];
    const result = { version, position, index: sourceIndex, parts, facing: parts.map(FacingBounds),
      vertices: parts.reduce((total, part) => total + part.attributes.position.count, 0), indices: indexCount };
    this.geometryCache.set(source, result);
    return result;
  }

  /** 同一份源几何的全部局部块在一组里只加一次。空间不够先整理再按两倍扩。 */
  _GeometryEntry(group, source) {
    const prepared = this._Geometry(source);
    const cached = group.geometries.get(source);
    if (cached && cached.prepared === prepared) return cached;
    if (cached) return null;               // 同一份几何的旧版本还有人在用：等它们被踢完
    const count = prepared.vertices, indexCount = prepared.indices;
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
    const ids = prepared.parts.map((part) => mesh.addGeometry(part));
    const entry = { id: ids[0], ids, refs: 0, prepared, version: prepared.version, source };
    group.geometries.set(source, entry);
    return entry;
  }

  /**
   * 进关预热（Script_Main.WarmLevel）：批次版深度程序只有真跑阴影趟才编（renderer.compile
   * 不碰 customDepthMaterial），第一次收满成员的那一帧会现编。这里给「共用批次深度」、传进来的
   * 深度材质（BuildSink 静态件那只）以及**场上现有可合批网格用到的每一只自定义深度材质**各造一只
   * 一实例的小 BatchedMesh，跟 WarmLevel 的其它代理件一起真画几帧。克隆登记进 depthClones，
   * 真合批直接复用同一只；登记进 warmedDepth 的才会被收（见 _DepthWarmed）。
   * @param {THREE.Material[]} depthMaterials
   */
  WarmProxy(depthMaterials = []) {
    const wanted = new Set(depthMaterials.filter((m) => m?.isMaterial));
    this.scene?.traverse((object) => {
      if (object !== this.root && Batchable(object) && object.customDepthMaterial?.isMaterial) wanted.add(object.customDepthMaterial);
    });
    const group = new THREE.Group();
    group.name = "ShadowCasterBatchWarmProxy";
    const box = new THREE.BoxGeometry(0.2, 0.2, 0.2);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", box.getAttribute("position"));
    geometry.setIndex(box.getIndex());
    // 三种面各一只：three 的深度程序按 flipSided / doubleSided 分变体（正面件的阴影画背面 =
    // flipSided、双面件 = doubleSided、背面件两者都不是），只预热一种的话另两种开局现编。
    const Make = (depth, side) => {
      const material = new THREE.MeshBasicMaterial({ side, colorWrite: false, depthWrite: false });
      const mesh = new THREE.BatchedMesh(1, geometry.attributes.position.count, geometry.index.count, material);
      mesh.addInstance(mesh.addGeometry(geometry));
      mesh.castShadow = true;
      mesh.frustumCulled = false;
      mesh.perObjectFrustumCulled = false;
      if (depth) {
        let clone = this.depthClones.get(depth);
        if (!clone) { clone = this.cloneDepthMaterial(depth); this.depthClones.set(depth, clone); }
        mesh.customDepthMaterial = clone;
      } else {
        AttachShadowDepth(mesh);
      }
      group.add(mesh);
    };
    const sides = [THREE.FrontSide, THREE.BackSide, THREE.DoubleSide];
    for (const side of sides) Make(null, side);
    this.warmedDepth.add("shared");
    for (const depth of wanted) { for (const side of sides) Make(depth, side); this.warmedDepth.add(depth); }
    box.dispose();
    return group;
  }

  /** 预热完收掉代理：只释放它自己的纹理与几何，深度克隆留给真合批。 */
  DisposeWarmProxy(group) {
    if (!group) return;
    group.removeFromParent();
    group.traverse((object) => {
      if (!object.isBatchedMesh) return;
      object.material.dispose();
      object.dispose();
    });
  }

  Dispose() {
    this._DissolveAll();
    for (const clone of this.depthClones.values()) clone.dispose();
    this.depthClones.clear();
    this.geometryCache = new WeakMap();
    this.root.removeFromParent();
  }
}

/**
 * 包一层 `renderer.shadowMap.render`：烘之前打开合批网格、藏起它收进去的成员，烘完原样还原
 * （只还原自己藏的）。三方自己的早退条件照抄（那种帧一次 visible 都不翻）。重复调用幂等。
 */
export function InstallShadowCasterBatch(renderer, batch) {
  const shadowMap = renderer?.shadowMap;
  if (!shadowMap || typeof shadowMap.render !== "function" || shadowMap.render.shadowCasterBatch) return false;
  const original = shadowMap.render;
  const wrapped = function ShadowCasterBatchRender(lights, scene, camera) {
    const live = batch.live;
    if (!batch.enabled || batch.bypass || live.length === 0 || shadowMap.enabled === false || !lights || lights.length === 0
      || (shadowMap.autoUpdate === false && shadowMap.needsUpdate === false)) {
      return original.call(this, lights, scene, camera);
    }
    const hidden = batch._hidden;
    hidden.length = 0;
    for (let i = 0; i < live.length; i += 1) {
      const group = live[i];
      group.mesh.visible = true;
      const objects = group.objects;
      for (let k = 0; k < objects.length; k += 1) {
        const object = objects[k];
        if (object.visible) { object.visible = false; hidden.push(object); }
      }
    }
    try {
      return original.call(this, lights, scene, camera);
    } finally {
      for (let i = 0; i < hidden.length; i += 1) hidden[i].visible = true;
      hidden.length = 0;
      for (let i = 0; i < live.length; i += 1) live[i].mesh.visible = false;
    }
  };
  wrapped.shadowCasterBatch = true;
  shadowMap.render = wrapped;
  return true;
}
