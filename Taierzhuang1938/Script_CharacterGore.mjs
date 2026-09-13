// 断肢的**视觉 / 物理 / 声音层**：切身体、盖断面、烘肢块、挂刚体、喷血、发声、回收。
//
// 规则（判定 / 顶点分类 / index 过滤 / 预算环）在 `Script_Dismemberment.mjs`（纯 Node），
// 数字全在 `Data_Tuning_Gore.mjs`。口径文档：docs/Data_Dismemberment.md §5–§7。
//
// 三条改之前先想清楚的约束：
//
//   1) **身体只换 index，不动材质**。活人身上一个新 program 都不许出现 ——
//      三角形删了，影子（customDepthMaterial）与深度法线预通道（overrideMaterial）
//      读的是同一份 index，天然一致；用 shader mask 的话残肢会继续投影。
//   2) **蒙皮顶点用 `mesh.applyBoneTransform(i, v)` 烘**，绝不能拿 matrixWorld 去乘：
//      SkinnedMesh 的 matrixWorld 与它的顶点没有关系（`skinnedmesh-ignores-matrixworld`
//      那条账：照它烘出来的人是 1.7 cm 的一粒）。
//   3) **对象池复用的 rig 必须还原**。身体几何是「共享属性 + 私有 index」，
//      ReleaseSoldier 要把 mesh.geometry 指回缓存的源件并 dispose 私有件；
//      漏了的话下一个从池子里出生的兵天生缺一条胳膊。

import * as THREE from "three";
import { Mulberry32, HashString } from "./Script_Noise.mjs";
import { CloneShadedMaterial } from "./Script_Materials.mjs";
import {
  LIMBS, BUDGET, DEFAULT_QUALITY, LAUNCH, LIMB_BODY, CAP, BLOOD, DEATH_PUSH_SCALE,
  PART_RETIRE, GORE_AUDIO,
} from "./Data_Tuning_Gore.mjs";
import {
  ClassifyVertices, FilterIndex, ResolveSever, LimbSubtree, GoreBudget,
  IsGoreEnabled, SetGoreEnabled, AccumulateLimbDamage, BlastLimbWeights,
} from "./Script_Dismemberment.mjs";

export { DEATH_PUSH_SCALE };

// --- 复用的临时量（每帧几十次调用，别在这儿制造垃圾）-------------------------
const TMP_V4 = new THREE.Vector4();
const TMP_A = new THREE.Vector3();
const TMP_B = new THREE.Vector3();
const TMP_C = new THREE.Vector3();
const TMP_Q = new THREE.Quaternion();
const TMP_Q2 = new THREE.Quaternion();
const TMP_SCALE = new THREE.Vector3();
const TMP_M4 = new THREE.Matrix4();
const TMP_M3 = new THREE.Matrix3();
const UP = new THREE.Vector3(0, 1, 0);
// 到寿命之后那道「玩家看不看得见」的闸用的（Update / _MayRetire，见 §5.2）。
const RETIRE_MATRIX = new THREE.Matrix4();
const RETIRE_FRUSTUM = new THREE.Frustum();
const RETIRE_SPHERE = new THREE.Sphere();
const RETIRE_CAMERA_AT = new THREE.Vector3();

// ---------------------------------------------------------------------------
// 断面盖：一片暗红肉环 + 中央一截骨茬。**一只材质、一次 draw**。
//
// 方案原稿写的是「flesh / bone 两只材质」，实装改成单只 vertexColors 材质：
// 两只材质 = 每个断面两次 draw，而一次断肢有两个断面（身体上的残端 + 肢块那头），
// 预算表 maxParts 16 时就是 64 次 draw 只为了画盖子。颜色写进顶点色之后
// 一个断面 1 draw、全局只有 1 个 program，§7 的预算账才对得上。
// ---------------------------------------------------------------------------
let capGeometry = null;
let capMaterial = null;

function CapGeometry() {
  if (capGeometry) return capGeometry;
  const segments = Math.max(6, CAP.segments | 0);
  const outer = CAP.ringOuter, inner = CAP.ringInner, stub = CAP.boneLength;
  const position = [], normal = [], color = [];
  const flesh = new THREE.Color(CAP.fleshColor).convertSRGBToLinear();
  const bone = new THREE.Color(CAP.boneColor).convertSRGBToLinear();
  const Push = (x, y, z, nx, ny, nz, c) => {
    position.push(x, y, z); normal.push(nx, ny, nz); color.push(c.r, c.g, c.b);
  };
  // 断面稍微抬起一点点：与被切开的身体表面共面会 z-fighting。
  const lift = 0.02;
  for (let i = 0; i < segments; i += 1) {
    const a0 = (i / segments) * Math.PI * 2;
    const a1 = ((i + 1) / segments) * Math.PI * 2;
    const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
    // 1) 肉环（inner→outer 的平面环，法线朝 +Y）
    Push(c0 * inner, lift, s0 * inner, 0, 1, 0, flesh);
    Push(c0 * outer, lift, s0 * outer, 0, 1, 0, flesh);
    Push(c1 * outer, lift, s1 * outer, 0, 1, 0, flesh);
    Push(c0 * inner, lift, s0 * inner, 0, 1, 0, flesh);
    Push(c1 * outer, lift, s1 * outer, 0, 1, 0, flesh);
    Push(c1 * inner, lift, s1 * inner, 0, 1, 0, flesh);
    // 2) 骨茬侧面（半径 inner 的小圆柱，法线朝外）
    Push(c0 * inner, lift, s0 * inner, c0, 0, s0, bone);
    Push(c1 * inner, lift, s1 * inner, c1, 0, s1, bone);
    Push(c1 * inner, lift + stub, s1 * inner, c1, 0, s1, bone);
    Push(c0 * inner, lift, s0 * inner, c0, 0, s0, bone);
    Push(c1 * inner, lift + stub, s1 * inner, c1, 0, s1, bone);
    Push(c0 * inner, lift + stub, s0 * inner, c0, 0, s0, bone);
    // 3) 骨茬顶盖
    Push(0, lift + stub, 0, 0, 1, 0, bone);
    Push(c0 * inner, lift + stub, s0 * inner, 0, 1, 0, bone);
    Push(c1 * inner, lift + stub, s1 * inner, 0, 1, 0, bone);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(position, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normal, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(color, 3));
  geometry.computeBoundingSphere();
  capGeometry = geometry;
  return capGeometry;
}

function CapMaterial() {
  if (capMaterial) return capMaterial;
  capMaterial = new THREE.MeshStandardMaterial({
    name: "GoreCap",
    vertexColors: true,
    roughness: CAP.fleshRoughness,
    metalness: 0,
    side: THREE.DoubleSide,
  });
  return capMaterial;
}

// 肢块材质：人物材质的**非蒙皮克隆**。同一份材质挂在 SkinnedMesh 与普通 Mesh 上
// 会让 three 每帧重算着色器参数（`three-shared-material-program-thrash` 那条账），
// 所以必须克隆；克隆只走 CloneShadedMaterial（契约 11：它按注册表重挂补丁）。
// 按源材质缓存，全场一份，预热一次（见 AddGoreWarmProxies）。
const partMaterials = new Map();

function PartMaterial(source) {
  if (!source) return null;
  const key = Array.isArray(source) ? source.map((m) => m.uuid).join("|") : source.uuid;
  let clone = partMaterials.get(key);
  if (!clone) {
    clone = CloneShadedMaterial(source);
    if (!Array.isArray(clone)) clone.name = `${source.name || "Gore"}#part`;
    partMaterials.set(key, clone);
  }
  return clone;
}

/** 预热代理用的几何：属性集合必须与运行时肢块一致，否则编出来的是另一个变体。 */
function WarmGeometry(withColor) {
  const geometry = new THREE.BoxGeometry(0.12, 0.28, 0.12);
  geometry.deleteAttribute("tangent");
  if (withColor) {
    const count = geometry.attributes.position.count;
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(new Float32Array(count * 3).fill(1), 3));
  }
  return geometry;
}

/**
 * 往着色器预热组里补肢块材质与断面材质的代理网格。
 *
 * 第一次断肢**不能在战斗里现编**（`taierzhuang-respawn-shader-stall` 那条账：
 * 人物 GLB 材质首见编译一冻就是几百毫秒）。这些代理与运行时用的是**同一批材质
 * 对象**（PartMaterial 有缓存），所以 WarmupShaders 编出来的就是将来要用的那份。
 *
 * @param {THREE.Object3D} group 预热组（Script_Main.WarmActorShaders 建的那个）
 * @param {Array} actors 预热用的临时 Actor
 * @returns {number} 摆进去的代理件数
 */
export function AddGoreWarmProxies(group, actors) {
  if (!group) return 0;
  const sources = new Map();
  for (const actor of actors || []) {
    const root = actor?.characterRig?.root;
    if (!root) continue;
    root.traverse((object) => {
      if (object.isSkinnedMesh && object.material && !Array.isArray(object.material)) {
        sources.set(object.material.uuid, object.material);
      }
    });
  }
  let placed = 0;
  for (const source of sources.values()) {
    const material = PartMaterial(source);
    if (!material) continue;
    const mesh = new THREE.Mesh(WarmGeometry(!!source.vertexColors), material);
    mesh.name = `GoreWarm_Part_${placed}`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.position.set((placed % 8) * 0.35 - 1.4, 0.5 + Math.floor(placed / 8) * 0.4, -3.2);
    group.add(mesh);
    placed += 1;
  }
  const cap = new THREE.Mesh(CapGeometry(), CapMaterial());
  cap.name = "GoreWarm_Cap";
  cap.scale.setScalar(0.08);
  cap.castShadow = true;
  cap.position.set(0, 0.9, -3.2);
  group.add(cap);
  return placed + 1;
}

// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 断肢自己的随机流。**不借 `soldier.rnd`**：那条流是 AI 的（射击误差、探头节拍、
// 反应延迟全从它抽），判定一次要消耗 8 个数，借它等于把整场战斗的 AI 行为序列
// 往后推 —— 2026-09-11 实测：第一关开场与 AiCombatBrowserTest 这类按固定序列回放
// 的验收，在有人被卸肢的那一帧之后玩家就死了，基线上却活着。按士兵 id 另开一条
// Mulberry32，同一个种子照样重放出同一次断肢，AI 那边一个数都不少。
// ---------------------------------------------------------------------------
function GoreRng(soldier) {
  if (!soldier) return Mulberry32(HashString("gore|anonymous"));
  if (typeof soldier.goreRnd !== "function") {
    soldier.goreRnd = Mulberry32(HashString(`gore|${soldier.id ?? 0}|${soldier.side || ""}`));
  }
  return soldier.goreRnd;
}

let partSerial = 0;

export class GoreSystem {
  /**
   * @param {object} host 取值器形式的宿主引用（physics 与 vfx 每换一关都是新的一份，
   *   写成普通属性的话这一层会一直指着上一关那具已经 Dispose 的物理世界）。
   *   { Scene(), Physics(), Vfx(), Quality() }
   */
  constructor(host = {}) {
    this.host = host;
    this.records = new Map();       // soldier → GoreRecord
    this.hitHistory = new WeakMap();
    this.parts = [];                // 场上所有肢块
    this.classifyCache = new Map(); // 源几何 uuid → Uint8Array（十套 GLB 各算一次）
    this.force = null;              // SetForce：下一发必断，并决定用哪条 LAUNCH
    this.budget = new GoreBudget(this.Tuning().maxParts);
  }

  get scene() { return this.host.Scene?.() || null; }
  get physics() { return this.host.Physics?.() || null; }
  get vfx() { return this.host.Vfx?.() || null; }
  // 音频与 vfx 同一条约定（取值器，不是普通属性）：AudioEngine 在出图模式下
  // 根本不建，换关也可能是另一份。拿不到就是没声音，本层绝不因此抛。
  get audio() { return this.host.Audio?.() || null; }
  get quality() {
    const name = this.host.Quality?.() || DEFAULT_QUALITY;
    return BUDGET[name] ? name : DEFAULT_QUALITY;
  }

  Tuning() { return BUDGET[this.quality] || BUDGET[DEFAULT_QUALITY]; }

  get enabled() { return IsGoreEnabled(); }

  SetEnabled(value) {
    SetGoreEnabled(value);
    if (!IsGoreEnabled()) this.ReleaseAll();
    return IsGoreEnabled();
  }

  /** 下一发命中无论骰子如何都断；kind 决定用哪条 LAUNCH。null 取消。 */
  SetForce(kind) {
    this.force = kind ? String(kind) : null;
    return this.force;
  }

  // --- 判定 -----------------------------------------------------------------

  /**
   * 这一下要不要卸肢。由 `Soldier.TakeHit` 调，返回 null 表示不断。
   * @param {object} soldier
   * @param {object} hit { part, shapeId, kind, weaponId, mode, damage, wouldDie, falloff, point }
   */
  Resolve(soldier, hit = {}) {
    if (!IsGoreEnabled()) return null;
    // 玩家本人永远不进本系统（第一人称）；`characterRig` 为空的角色
    //（程序化回退、百姓 tzm）静默跳过 —— 它们没有可切的蒙皮网格。
    const rig = soldier?.actor?.characterRig;
    if (!rig || !rig.root) return null;
    const force = this.force;
    let history = this.hitHistory.get(soldier);
    if (!history) { history = new Map(); this.hitHistory.set(soldier, history); }
    const accumulatedDamage = AccumulateLimbDamage(history, hit);
    const result = ResolveSever({
      ...hit,
      accumulatedDamage,
      severed: soldier.gore?.limbs,
      limbWeights: hit.blastOrigin ? BlastLimbWeights(hit.blastOrigin, rig.GetHitboxes()) : undefined,
      kind: force || hit.kind,
      force: !!force,
      rng: GoreRng(soldier),
    });
    if (!result.limbs.length) return null;
    this.force = null;                        // Force 只作用一发
    return {
      limbs: result.limbs,
      forceKill: result.forceKill,
      kind: result.kind,
      point: hit.point || null,
      reason: result.reason,
    };
  }

  // --- 执行 -----------------------------------------------------------------

  /**
   * 卸掉这几段肢体。由 `Soldier.Kill` 在 `actor.Ragdoll` 之后调。
   * @param {object} soldier
   * @param {string[]} limbIds
   * @param {{direction?:THREE.Vector3, kind?:string, point?:THREE.Vector3}} options
   * @returns {string[]} 真的卸掉的那几段
   */
  Sever(soldier, limbIds, options = {}) {
    if (!IsGoreEnabled()) return [];
    const rig = soldier?.actor?.characterRig;
    const scene = this.scene;
    if (!rig || !rig.root || !scene) return [];
    const record = this._RecordFor(soldier, rig);
    if (!record) return [];
    // 已经卸过的、或者已经跟着上游段一起飞走的，不再卸第二次。
    const fresh = [];
    for (const id of limbIds || []) {
      if (!LIMBS[id] || fresh.includes(id)) continue;
      if (record.limbs.has(id)) continue;
      let covered = false;
      for (const severed of record.limbs) {
        if (LimbSubtree(severed).includes(id)) { covered = true; break; }
      }
      if (!covered) fresh.push(id);
    }
    if (!fresh.length) return [];

    // 先把父链算到位，再强制刷一遍子树：**SkinnedMesh 的 bindMatrixInverse 只在
    // updateMatrixWorld 里刷新，updateWorldMatrix 不刷**（与 _GroundInfantryBlend
    // 同一条账）。applyBoneTransform 读的就是它，少这一句烘出来的姿势是上一帧的。
    rig.root.updateWorldMatrix(true, false);
    rig.root.updateMatrixWorld(true);
    for (const entry of record.meshes) entry.mesh.skeleton?.update();

    // 先重建身体（这一趟同时算出每一段肢体各自的 index），再按它烘肢块 ——
    // 两边用**同一次过滤**的结果，`身体减少的三角数 = 肢块三角数 + 丢弃数`
    // 这条守恒才成立（浏览器验收要读它）。属性数组不动，先切后烘没有区别。
    for (const id of fresh) record.limbs.add(id);
    rig.severedHitboxes = new Set([...record.limbs].flatMap(LimbSubtree));
    this._RebuildBody(record);
    for (const id of fresh) {
      const part = this._SpawnPart(record, id, options);
      // 卸掉的要是持枪那条胳膊，枪跟着这一段一起飞（手还攥着）。
      if (part && !part.disposed) this._HandOffWeapon(record, id, part);
    }
    for (const id of fresh) this._SpawnStumpCap(record, id, options);

    soldier.gore = record;
    this._Splash(record, fresh, options);
    this._PlaySever(record, fresh, options);
    return fresh;
  }

  _RecordFor(soldier, rig) {
    let record = this.records.get(soldier);
    if (record) return record;
    const meshes = [];
    rig.root.traverse((object) => {
      if (!object.isSkinnedMesh) return;
      const source = object.geometry;
      if (!source?.attributes?.skinIndex || !source.attributes.skinWeight) return;
      let vertexLimb = this.classifyCache.get(source.uuid);
      if (!vertexLimb) {
        const boneNames = (object.skeleton?.bones || []).map((bone) => bone?.name || "");
        vertexLimb = ClassifyVertices(boneNames, source.attributes.skinIndex,
          source.attributes.skinWeight, source.attributes.position.count);
        this.classifyCache.set(source.uuid, vertexLimb);
      }
      meshes.push({ mesh: object, source, vertexLimb, privateGeometry: null, parts: null, dropped: 0 });
    });
    if (!meshes.length) return null;
    record = {
      soldier, rig, meshes,
      limbs: new Set(),
      caps: [],
      parts: [],
      sourceTriangles: meshes.reduce((sum, e) =>
        sum + ((e.source.index?.count || e.source.attributes.position.count) / 3), 0),
      bodyTriangles: 0,
      partTriangles: 0,
      limbTriangles: 0,
      dropped: 0,
      // 手持武器有没有交给某段肢块。weaponDetached 一旦为真就不再清（一把枪只交一次，
      // 先卸前臂再卸上臂时不该把已经消失的枪又挪一遍）；weaponPart 是当前扛着它的那一段。
      weaponDetached: false,
      weaponPart: null,
    };
    record.bodyTriangles = record.sourceTriangles;
    this.records.set(soldier, record);
    return record;
  }

  /** 身体：共享属性 + 私有 index。属性数组一个字节都不复制。 */
  _RebuildBody(record) {
    let bodyTriangles = 0, dropped = 0, limbTriangles = 0;
    for (const entry of record.meshes) {
      const source = entry.source;
      const result = FilterIndex(source.index ? source.index.array : null,
        entry.vertexLimb, record.limbs);
      entry.parts = result.parts;
      entry.dropped = result.dropped;
      for (const indices of result.parts.values()) limbTriangles += indices.length / 3;
      if (!entry.privateGeometry) {
        const geometry = new THREE.BufferGeometry();
        for (const [name, attribute] of Object.entries(source.attributes)) {
          geometry.setAttribute(name, attribute);
        }
        geometry.morphAttributes = source.morphAttributes;
        geometry.morphTargetsRelative = source.morphTargetsRelative;
        if (!source.boundingSphere) source.computeBoundingSphere();
        // 包围球照抄源件：身体是它的子集，剔除行为与切之前完全一致，
        // 也省掉每次断肢重算几千顶点。
        geometry.boundingSphere = source.boundingSphere.clone();
        if (source.boundingBox) geometry.boundingBox = source.boundingBox.clone();
        entry.privateGeometry = geometry;
        entry.mesh.geometry = geometry;
      }
      entry.privateGeometry.setIndex(new THREE.BufferAttribute(result.body, 1));
      bodyTriangles += result.body.length / 3;
      dropped += result.dropped;
    }
    record.bodyTriangles = bodyTriangles;
    record.dropped = dropped;
    // 累计口径：被预算挤掉的肢块不减它（守恒断言比的是「切下去多少」，
    // 不是「场上还剩多少」）。live 那一份是 partTriangles。
    record.limbTriangles = limbTriangles;
  }

  /** 关节的世界轴：joint → axisTo；头没有第二个端点，用 neck→head。 */
  _JointAxis(rig, limbId, out) {
    const spec = LIMBS[limbId];
    const joint = rig.bones[spec.joint];
    if (!joint) return null;
    joint.getWorldPosition(TMP_A);
    const target = spec.axisTo ? rig.bones[spec.axisTo] : (rig.bones.neck || null);
    if (target) {
      target.getWorldPosition(TMP_B);
      if (spec.axisTo) out.copy(TMP_B).sub(TMP_A);
      else out.copy(TMP_A).sub(TMP_B);              // neck→head：头往上
      if (out.lengthSq() > 1e-8) return out.normalize();
    }
    return out.copy(UP);
  }

  _SpawnPart(record, limbId, options) {
    const rig = record.rig;
    const spec = LIMBS[limbId];
    const joint = rig.bones[spec.joint];
    const scene = this.scene;
    if (!joint || !scene) return null;

    joint.matrixWorld.decompose(TMP_A, TMP_Q, TMP_SCALE);
    // **两个缩放不是一回事，混了就是「胶囊只有两毫米」**：
    //   boneScale —— 关节的世界缩放，约 0.0089。这批 Max Biped 骨架内部是厘米单位，
    //     所以肢块几何（烘在关节局部系里）的坐标是几十，靠这个缩放还原成米。
    //   rigScale  —— rig 根节点的世界缩放，约 0.955（目标身高 / 资产身高）。
    //     `Data_Tuning_Gore` 与 `CHARACTER_HITBOX_PROFILE` 的半径/半长都是**世界米**，
    //     跟着它乘一次就是真实尺寸（GetHitboxes 用的也是这一个）。
    // 第一版两处都用了 boneScale：胶囊半径 0.0005 m、断面盖半径 0.0005 m，
    // 画面上一个像素都看不见，肢块却「落地」在离地半毫米处。
    const boneScale = (TMP_SCALE.x + TMP_SCALE.y + TMP_SCALE.z) / 3 || 1;
    const rigScale = rig.root.getWorldScale(TMP_B).y || 1;
    const jointPosition = TMP_A.clone();
    const jointQuaternion = TMP_Q.clone();
    const axis = this._JointAxis(rig, limbId, new THREE.Vector3());

    // 烘到 **joint 骨的局部系**：这样肢块的位姿就是「关节矩阵」，一句 decompose 搞定。
    const inverseJoint = new THREE.Matrix4().copy(joint.matrixWorld).invert();
    const pieces = [];
    for (const entry of record.meshes) {
      const indices = entry.parts?.get(limbId);
      if (!indices || !indices.length) continue;
      TMP_M4.copy(inverseJoint).multiply(entry.mesh.matrixWorld);
      TMP_M3.getNormalMatrix(TMP_M4);
      const geometry = BakePartGeometry(entry.mesh, entry.source, indices, TMP_M4, TMP_M3);
      if (geometry) pieces.push({ geometry, material: PartMaterial(entry.mesh.material) });
    }
    if (!pieces.length) return null;

    partSerial += 1;
    const serial = partSerial;
    const root = new THREE.Mesh(pieces[0].geometry, pieces[0].material);
    root.name = `GorePart_${limbId}_${serial}`;
    for (let i = 1; i < pieces.length; i += 1) {
      const child = new THREE.Mesh(pieces[i].geometry, pieces[i].material);
      child.name = `GorePart_${limbId}_${serial}_m${i}`;
      root.add(child);
    }
    root.traverse((object) => {
      if (!object.isMesh) return;
      // 肢块正常进预通道（**不要** MarkNoPrepass）：它是实体，SSAO / SSR / 雾都该认它。
      object.castShadow = true;
      object.receiveShadow = true;
      object.frustumCulled = true;
      object.userData.characterPbrSurface = true;
    });
    root.position.copy(jointPosition);
    root.quaternion.copy(jointQuaternion);
    root.scale.copy(TMP_SCALE);
    scene.add(root);

    // 断口那头也盖一个（肢块自己的断面）。方向与残端相反：肉环朝着身体那一侧。
    // 轴要换到 **joint 局部系** —— 肢块的几何就烘在那个系里，直接拿世界轴是错的。
    const axisLocal = axis.clone().applyQuaternion(jointQuaternion.clone().invert()).normalize();
    const partCap = new THREE.Mesh(CapGeometry(), CapMaterial());
    partCap.name = `GoreCap_${limbId}_${serial}_part`;
    partCap.castShadow = true;
    // 盖子的几何是**单位半径**，要的世界半径是 capRadius × rigScale；它挂在这只
    // scale = boneScale 的节点下面，所以局部缩放要把 boneScale 除掉。
    partCap.scale.setScalar(spec.capRadius * rigScale / boneScale);
    partCap.quaternion.setFromUnitVectors(UP, axisLocal.clone().negate());
    root.add(partCap);

    // --- 刚体 ---------------------------------------------------------------
    const soldier = record.soldier;
    const kind = options.kind && LAUNCH[options.kind] ? options.kind : "bullet";
    const launch = LAUNCH[kind];
    const rnd = GoreRng(soldier);
    // 刚体尺寸是**世界米**，跟 rigScale 走（骨骼内部的厘米单位与它无关）。
    const halfLength = spec.halfLength * rigScale;
    const radius = spec.capRadius * rigScale;
    // 胶囊沿局部 Y：把 Y 转到肢体轴上，刚体位姿就描述了这一段的真实朝向。
    const bodyQuaternion = new THREE.Quaternion().setFromUnitVectors(UP, axis);
    const bodyPosition = jointPosition.clone().addScaledVector(axis, halfLength);
    const direction = options.direction && options.direction.lengthSq() > 1e-8
      ? TMP_B.copy(options.direction).normalize()
      : TMP_B.copy(axis);
    const speed = launch.speed[0] + (launch.speed[1] - launch.speed[0]) * rnd();
    const velocity = new THREE.Vector3(
      direction.x * speed + (rnd() - 0.5) * speed * 0.35,
      direction.y * speed * 0.35 + launch.up,
      direction.z * speed + (rnd() - 0.5) * speed * 0.35);
    const spin = launch.spin;
    const angular = { x: (rnd() * 2 - 1) * spin, y: (rnd() * 2 - 1) * spin, z: (rnd() * 2 - 1) * spin };

    const physics = this.physics;
    let body = null;
    try {
      body = physics?.MakeLimbBody?.({
        position: bodyPosition, quaternion: bodyQuaternion, velocity, angularVelocity: angular,
        halfLength, radius, mass: spec.mass,
        friction: LIMB_BODY.friction, restitution: LIMB_BODY.restitution,
        linearDamping: LIMB_BODY.linearDamping, angularDamping: LIMB_BODY.angularDamping,
      }) || null;
    } catch (error) {
      console.warn("[Gore] 肢块刚体建失败，这一段只留网格：", error);
      body = null;
    }

    const part = {
      id: serial,
      limb: limbId,
      soldier,
      root,
      pieces,
      cap: partCap,
      body,
      radius,
      halfLength,
      // 刚体是胶囊中心 + 轴向 Y；网格原点在关节上，两者差一个固定的局部偏移。
      centerToOrigin: new THREE.Vector3(0, -halfLength, 0),
      quaternionOffset: bodyQuaternion.clone().invert().multiply(jointQuaternion),
      age: 0,
      restTime: 0,
      resting: !body,
      // 落地声用的两个账（见 Update 里那一段 / GORE_AUDIO）：响过几次、上一次在什么时候。
      landCount: 0,
      landAge: -Infinity,
      spurt: 0,
      disposed: false,
      // 这一段有没有扛着人物的手持武器（见 _HandOffWeapon）。
      holdsWeapon: false,
    };
    this.parts.push(part);
    record.parts.push(part);
    record.partTriangles += pieces.reduce((sum, piece) => sum + piece.geometry.index.count / 3, 0);

    // 肢块自己那头也淌血，但比断口弱得多。
    const vfx = this.vfx;
    if (vfx?.BloodSpurt) {
      part.spurt = vfx.BloodSpurt(partCap, null, { x: 0, y: 1, z: 0 }, {
        seconds: BLOOD.partSpurtSeconds, rate: BLOOD.partSpurtRate,
        spread: BLOOD.spurtSpread, speed: BLOOD.spurtSpeed, decals: 0,
      });
    }

    const evicted = this.budget.Acquire(part);
    if (evicted) this._DisposePart(evicted);
    return part;
  }

  /**
   * 卸掉的是**持枪那条胳膊**时，把手持武器交给这段肢块 —— 手攥着枪一起飞出去。
   *
   * 不做这一步的症状：手骨的三角形没了，但骨头还在动，步枪就悬在半空跟着一只
   * 看不见的手走（比缺一段胳膊显眼得多）。
   *
   * 判据是「这一段的关节骨是不是 `actor.riggedWeaponMount` 的祖先」：
   * 挂点挂在 `rig.Grip("weaponR")` 底下，所以 upperArmR 与 forearmR 都算，
   * 左臂（upperArmL / forearmL）不算 —— 右手仍握着枪。
   *
   * @returns {boolean} 真的交出去了没有
   */
  _HandOffWeapon(record, limbId, part) {
    if (record.weaponDetached) return false;              // 一把枪只交一次
    const actor = record.soldier?.actor;
    if (!actor?.weaponGroup || typeof actor.DetachWeaponForGore !== "function") return false;
    const rig = record.rig;
    const joint = rig.bones?.[LIMBS[limbId]?.joint];
    const mount = actor.riggedWeaponMount || rig.Grip?.("weaponR") || null;
    if (!joint || !mount) return false;
    let rides = false;
    for (let node = mount; node; node = node.parent) {
      if (node === joint) { rides = true; break; }
    }
    if (!rides) return false;
    // `attach` 保留世界变换，读的是 part.root.matrixWorld —— 位姿刚在 _SpawnPart 里
    // 写进 position/quaternion/scale，还没刷到矩阵上，少这一句枪会落在世界原点。
    part.root.updateMatrixWorld(true);
    if (!actor.DetachWeaponForGore(part.root)) return false;
    part.holdsWeapon = true;
    record.weaponDetached = true;
    record.weaponPart = part;
    return true;
  }

  /** 身体那一侧的残端断面：挂在关节骨上，跟着还在动的骨架走。 */
  _SpawnStumpCap(record, limbId, options) {
    const rig = record.rig;
    const spec = LIMBS[limbId];
    const joint = rig.bones[spec.joint];
    if (!joint) return null;
    const axisWorld = this._JointAxis(rig, limbId, new THREE.Vector3());
    // 世界轴换到骨的局部系（盖子是骨的子节点）。
    joint.getWorldQuaternion(TMP_Q2);
    const axisLocal = axisWorld.clone().applyQuaternion(TMP_Q2.invert()).normalize();
    const cap = new THREE.Mesh(CapGeometry(), CapMaterial());
    cap.name = `GoreCap_${limbId}_${record.soldier.id ?? 0}`;
    cap.castShadow = true;
    // 盖子挂在骨头上，而骨骼内部是厘米单位（世界缩放约 0.0089）：
    // 想要 capRadius × rigScale 米的世界半径，局部缩放得把骨骼那一档除掉。
    joint.matrixWorld.decompose(TMP_A, TMP_Q2, TMP_SCALE);
    const boneScale = (TMP_SCALE.x + TMP_SCALE.y + TMP_SCALE.z) / 3 || 1;
    const rigScale = rig.root.getWorldScale(TMP_B).y || 1;
    cap.scale.setScalar(spec.capRadius * rigScale / boneScale);
    cap.quaternion.setFromUnitVectors(UP, axisLocal);
    joint.add(cap);
    record.caps.push({ cap, joint, spurt: 0 });

    const vfx = this.vfx;
    const tuning = this.Tuning();
    if (vfx?.BloodSpurt) {
      const entry = record.caps[record.caps.length - 1];
      // 按心跳泵的动脉源（Script_BloodEffects.Pump）：一股一股射出去、压力越来越低，
      // 最后在断口底下淌成一摊。方向是盖子的 +Y = 肢体原来伸出去的方向，跟着倒地的骨头转。
      entry.spurt = vfx.BloodSpurt(cap, null, { x: 0, y: 1, z: 0 }, {
        arterial: true, seconds: tuning.spurtS, rate: tuning.spurtRate,
        speed: BLOOD.arterialSpeed, decals: tuning.decalsPerSever,
      });
    }
    return cap;
  }

  /** 断肢那一瞬间的一次性血雾。 */
  _Splash(record, limbIds, options) {
    const vfx = this.vfx;
    if (!vfx?.BloodBurst || !limbIds.length) return;
    const rig = record.rig;
    const joint = rig.bones[LIMBS[limbIds[0]].joint];
    // 这两只不能借模块级临时量：_JointAxis 内部就在写 TMP_A / TMP_B。
    const direction = new THREE.Vector3();
    if (options.direction && options.direction.lengthSq() > 1e-8) direction.copy(options.direction).normalize();
    else this._JointAxis(rig, limbIds[0], direction);
    const at = new THREE.Vector3();
    if (options.point) at.copy(options.point);
    else if (joint) joint.getWorldPosition(at);
    else return;
    // 一次卸多段（近炸）比一段更凶，但封顶 1.4 倍 —— 再往上就是一面红墙。
    vfx.BloodBurst(at, direction, BLOOD.burstAmount * Math.min(1.4, 0.85 + limbIds.length * 0.15));
  }

  /**
   * 断的那一声（`goreSever`）。
   *
   * **一次卸多段只发一条**：四条同时响是一团糊，而且 Play 的同帧去重窗（22 ms）
   * 本来也会把后面几条丢掉 —— 与其让引擎随机丢，不如在这里就只发一条，
   * 音量按段数抬一点点（GORE_AUDIO.volumePerLimb，封顶 volumeMax）。
   *
   * 位置与 `_Splash` 取同一个点（命中点，没有就取第一段的关节）——
   * 血雾在哪儿冒，声音就得在哪儿响。
   */
  _PlaySever(record, limbIds, options) {
    const audio = this.audio;
    if (!audio?.Play || !limbIds.length) return null;
    const at = new THREE.Vector3();
    if (options.point) at.copy(options.point);
    else {
      const joint = record.rig.bones[LIMBS[limbIds[0]].joint];
      if (!joint) return null;
      joint.getWorldPosition(at);
    }
    const volume = Math.min(GORE_AUDIO.volumeMax,
      GORE_AUDIO.severVolume + (limbIds.length - 1) * GORE_AUDIO.volumePerLimb);
    // 发声包一层：`Sever` 跑在 `Soldier.Kill` 的 try/catch 里面，从这儿抛出去
    // 会被记成「这一下没断」（severed 归 0、死亡推力少乘一档）—— 明明已经断了。
    // 声音是旁支的旁支，出什么事都不许改动死亡链的账。
    try {
      return audio.Play("goreSever", { position: at, volume });
    } catch (error) {
      console.warn("[Gore] 断肢声没播出来：", error);
      return null;
    }
  }

  /**
   * 肢块砸在地上那一记（`goreLimbLand`）。
   *
   * 三道闸，缺一条就是一串连响：
   *   · 速度 —— `ClampToGround` 在肢块**沿坡滑行**时每一帧都返回 true，
   *     而贴着地滑出去在现实里没有声音。低于 landSpeedMinMs 一律不发。
   *   · 冷却 —— 刚体落在斜面上会连着几帧被顶回地面（每次都带一点下落速度）。
   *   · 次数 —— 第一次是落地，第二次是弹一下；再往后是物理解算的抖动，不是事件。
   *
   * @param {object} part
   * @param {number} fallSpeed 撞地**之前**那一帧的下落速度（m/s，向下为正）
   */
  _PlayLand(part, fallSpeed) {
    if (!(fallSpeed >= GORE_AUDIO.landSpeedMinMs)) return null;
    if (part.landCount >= GORE_AUDIO.landMaxCount) return null;
    if (part.age - part.landAge < GORE_AUDIO.landCooldownS) return null;
    const audio = this.audio;
    part.landAge = part.age;
    part.landCount += 1;
    if (!audio?.Play) return null;
    // 弹起来那一记比落地轻：按速度折一下，但不低于一半（听得见才叫线索）。
    const scale = Math.min(1, fallSpeed / (GORE_AUDIO.landSpeedMinMs * 2.5));
    try {
      return audio.Play("goreLimbLand", {
        position: part.root.position.clone(),
        volume: GORE_AUDIO.landVolume * Math.max(0.5, scale),
      });
    } catch (error) {
      console.warn("[Gore] 肢块落地声没播出来：", error);
      return null;
    }
  }

  // --- 每帧 -----------------------------------------------------------------

  Update(dt, camera) {
    if (!this.parts.length) return;
    const step = Number.isFinite(dt) ? Math.min(Math.max(dt, 0), 0.1) : 0;
    const tuning = this.Tuning();
    const physics = this.physics;
    // 到寿命之后那道「玩家看不看得见」的闸，每帧只备一次料。
    // 视图矩阵自己从 matrixWorld 求，**不要用 camera.matrixWorldInverse** ——
    // 那个只在 renderer.render() 里更新（与 Script_Ai.CullActors 同一条账）。
    let hasView = false;
    if (camera?.isCamera) {
      camera.updateMatrixWorld();
      RETIRE_MATRIX.copy(camera.matrixWorld).invert().premultiply(camera.projectionMatrix);
      RETIRE_FRUSTUM.setFromProjectionMatrix(RETIRE_MATRIX);
      RETIRE_CAMERA_AT.setFromMatrixPosition(camera.matrixWorld);
      hasView = true;
    }
    for (let i = this.parts.length - 1; i >= 0; i -= 1) {
      const part = this.parts[i];
      part.age += step;
      if (part.age > tuning.partLifeS && this._MayRetire(part, hasView, tuning)) {
        this._DisposePart(part); continue;
      }
      if (!part.body) continue;
      // 解析地形不在物理世界里，落到土地上这一下要手写 —— 与尸体同一条路。
      // 它只管平动，所以贴到地面的那一帧再手动磨一下角速度：没有这一下，
      // 躺在地上的胳膊会自己转起来（Rapier 那边根本没有地面可以摩擦它）。
      //
      // 顶起来的高度按**此刻的姿态**算：ClampToGround 只认刚体中心那一个点，
      // 而胶囊沿局部 Y 有半长 —— 竖着落地时只顶 radius 的话，下半截整个插进土里
      //（实测 GorePart_calfR 沉 0.178 m，连着步枪的那一段更是只剩枪托露在外面）。
      // 中心到最低点 = radius + |Y 轴的竖直分量| × 半高。
      const rotationNow = part.body.rotation();
      TMP_Q.set(rotationNow.x, rotationNow.y, rotationNow.z, rotationNow.w);
      const axis = TMP_A.copy(UP).applyQuaternion(TMP_Q);
      const axisUpY = Math.abs(axis.y);
      const lift = part.radius + axisUpY * Math.max(0, part.halfLength - part.radius);
      // 落地声要的是**撞地之前**那一刻的下落速度：ClampToGround 就地把法向速度
      // 反弹/抹掉了，clamp 之后再读只剩切向那一点点，怎么摔都是「轻轻放下」。
      const fallSpeed = -part.body.linvel().y;
      if (physics?.ClampToGround?.(part.body, step, { lift })) {
        this._PlayLand(part, fallSpeed);
        const spin = part.body.angvel();
        const decay = Math.max(0, 1 - LIMB_BODY.groundSpinDrag * step);
        let wx = spin.x * decay, wy = spin.y * decay, wz = spin.z * decay;
        // 竖着落地的那一段要**倒下去**：解析地形给不了接触力矩，这里手写一记
        // 重力力矩。旋转轴 = 轴 × 上，方向按轴指上还是指下取号，躺平后自然归零。
        if (axisUpY > LIMB_BODY.groundTipDeadzone) {
          TMP_B.crossVectors(axis, UP);
          const tip = -Math.sign(axis.y) * LIMB_BODY.groundTipRate * axisUpY;
          wx += TMP_B.x * tip; wy += TMP_B.y * tip; wz += TMP_B.z * tip;
        }
        part.body.setAngvel({ x: wx, y: wy, z: wz }, true);
      }
      const translation = part.body.translation();
      const rotation = part.body.rotation();
      TMP_Q.set(rotation.x, rotation.y, rotation.z, rotation.w);
      part.root.quaternion.copy(TMP_Q).multiply(part.quaternionOffset);
      TMP_A.copy(part.centerToOrigin).applyQuaternion(TMP_Q);
      part.root.position.set(translation.x + TMP_A.x, translation.y + TMP_A.y, translation.z + TMP_A.z);
      part.root.updateMatrixWorld(true);
      const linear = part.body.linvel(), angular = part.body.angvel();
      const still = Math.hypot(linear.x, linear.y, linear.z) < LIMB_BODY.restLinear
        && Math.hypot(angular.x, angular.y, angular.z) < LIMB_BODY.restAngular;
      part.restTime = still ? part.restTime + step : 0;
      if (part.restTime >= tuning.restToStaticS) {
        // 停稳了就拆刚体只留网格：一段不动的胳膊没必要继续占一个动态体。
        physics?.RemoveBody?.(part.body);
        part.body = null;
        part.resting = true;
      }
    }
    // 预算随画质变（编辑器可以在关内改画质）。
    if (this.budget.max !== tuning.maxParts) {
      for (const evicted of this.budget.SetMax(tuning.maxParts)) this._DisposePart(evicted);
    }
  }

  /**
   * 到寿命之后**这一帧能不能真收**（§5.2）。
   *
   * 玩家正盯着的一段胳膊不许在眼前凭空消失：过了 `partLifeS` 只是取得回收资格，
   * 真收要等它落到视锥外、或离相机够远（`PART_RETIRE.despawnDistanceM`）。
   * 再给一条 `partLifeS × hardLifeScale` 的硬上限兜底 —— 不给的话玩家蹲在那儿
   * 一直看，这一片就永远占着预算与一次 draw。
   *
   * **预算挤出那条路不走这里**：`GoreBudget.Acquire` 的 evicted 仍然立即回收。
   */
  _MayRetire(part, hasView, tuning) {
    if (part.age > tuning.partLifeS * PART_RETIRE.hardLifeScale) return true;
    if (!hasView) return true;                       // 没有相机就按旧行为立刻收
    const at = part.root.position;                   // 肢块是场景直属子节点
    if (at.distanceToSquared(RETIRE_CAMERA_AT) > PART_RETIRE.despawnDistanceM ** 2) return true;
    RETIRE_SPHERE.center.copy(at);
    // 网格原点在**关节**上，肢体沿轴伸出去 2×halfLength；加上胶囊半径就是保守包围球。
    RETIRE_SPHERE.radius = part.halfLength * 2 + part.radius;
    return !RETIRE_FRUSTUM.intersectsSphere(RETIRE_SPHERE);
  }

  // --- 释放 -----------------------------------------------------------------

  _DisposePart(part) {
    if (!part || part.disposed) return;
    part.disposed = true;
    this.budget.Release(part);
    const index = this.parts.indexOf(part);
    if (index >= 0) this.parts.splice(index, 1);
    const record = this.records.get(part.soldier);
    if (record) {
      const j = record.parts.indexOf(part);
      if (j >= 0) record.parts.splice(j, 1);
      record.partTriangles = Math.max(0, record.partTriangles
        - part.pieces.reduce((sum, piece) => sum + piece.geometry.index.count / 3, 0));
      if (record.weaponPart === part) record.weaponPart = null;
    }
    if (part.holdsWeapon) {
      part.holdsWeapon = false;
      // 挂回原挂点、还原原局部变换，但**藏起来**：人已经死了，枪随这段胳膊一起
      // 消失，不能又浮回一只空手里。真正的还原（visible=true）在 ReleaseSoldier。
      part.soldier?.actor?.RestoreWeaponFromGore?.(false);
    }
    if (part.spurt) this.vfx?.RemoveBloodSpurt?.(part.spurt);
    if (part.body) this.physics?.RemoveBody?.(part.body);
    part.body = null;
    if (part.root.parent) part.root.parent.remove(part.root);
    // 几何是私有的（顶点是烘出来的），材质是全场共享的缓存件，别在这儿 dispose。
    for (const piece of part.pieces) piece.geometry.dispose();
  }

  /**
   * 把一名士兵身上的断肢全部收回并**还原身体几何**。
   * `AiDirector.Remove` 与换关都要调 —— 对象池里的 rig 会被下一个兵复用，
   * 不还原的话他天生缺一条胳膊。
   */
  ReleaseSoldier(soldier) {
    this.hitHistory.delete(soldier);
    const record = this.records.get(soldier);
    if (!record) return false;
    for (const part of [...record.parts]) this._DisposePart(part);
    // 手持武器交给过肢块的，这里必须挂回原处并**显示出来**：对象池里复用的 rig
    // 不许带着「枪不见了」的状态出生（_DisposePart 那一步只把它藏了起来）。
    if (record.weaponDetached) {
      const actor = record.soldier?.actor;
      actor?.RestoreWeaponFromGore?.(true);
      if (actor?.weaponGroup) actor.weaponGroup.visible = true;
      record.weaponDetached = false;
      record.weaponPart = null;
    }
    for (const entry of record.caps) {
      if (entry.spurt) this.vfx?.RemoveBloodSpurt?.(entry.spurt);
      if (entry.cap.parent) entry.cap.parent.remove(entry.cap);
    }
    record.caps.length = 0;
    for (const entry of record.meshes) {
      if (!entry.privateGeometry) continue;
      entry.mesh.geometry = entry.source;
      // 属性对象是与源件共享的，dispose 私有几何只会释放那条私有 index。
      entry.privateGeometry.dispose();
      entry.privateGeometry = null;
    }
    record.limbs.clear();
    record.rig.severedHitboxes = null;
    this.records.delete(soldier);
    if (soldier) soldier.gore = null;
    return true;
  }

  ReleaseAll() {
    this.hitHistory = new WeakMap();
    for (const soldier of [...this.records.keys()]) this.ReleaseSoldier(soldier);
    for (const part of [...this.parts]) this._DisposePart(part);
    this.parts.length = 0;
    this.budget.Clear();
    this.force = null;
  }

  Dispose() {
    this.ReleaseAll();
    this.classifyCache.clear();
  }

  // --- 取证 -----------------------------------------------------------------

  State() {
    const tuning = this.Tuning();
    const parts = this.parts.map((part) => ({
      id: part.id,
      limb: part.limb,
      soldierId: part.soldier?.id ?? null,
      at: [part.root.position.x, part.root.position.y, part.root.position.z],
      resting: !!part.resting,
      ageS: Math.round(part.age * 100) / 100,
      holdsWeapon: !!part.holdsWeapon,
      // 落地声响过几次（`_PlayLand` 的三道闸之后）。摆在这儿是给验收用的：
      // 「有没有响」在浏览器里只能靠 RequestedCount 数总数，落到**哪一段**上
      // 只有这一位说得清。
      landCount: part.landCount | 0,
    }));
    const severed = [];
    let caps = 0;
    for (const record of this.records.values()) {
      caps += record.caps.length;
      severed.push({
        soldierId: record.soldier?.id ?? null,
        limbs: [...record.limbs],
        sourceTriangles: record.sourceTriangles,
        bodyTriangles: record.bodyTriangles,
        // limbTriangles 是「切下去多少」（累计，不随预算淘汰变），
        // partTriangles 是「场上这具还剩多少肢块三角」。守恒断言用前者。
        limbTriangles: record.limbTriangles,
        partTriangles: record.partTriangles,
        dropped: record.dropped,
      });
    }
    return {
      enabled: IsGoreEnabled(),
      quality: this.quality,
      force: this.force,
      parts,
      severed,
      caps,
      budget: { max: tuning.maxParts, live: this.parts.length },
      spurts: this.vfx?.bloodSpurtCount ?? 0,
    };
  }
}

/**
 * 把一段肢体的顶点烘成静态几何（joint 局部系），并把 index 压紧。
 *
 * **必须走 applyBoneTransform**：SkinnedMesh 的顶点在 GPU 上才蒙皮，
 * matrixWorld 与它们没有关系。压紧 index 是为了让一段前臂只带自己那几百个顶点，
 * 而不是把整具人的六千顶点复制一份（maxParts 24 时那是几 MB 的白账）。
 */
function BakePartGeometry(mesh, source, indices, bakeMatrix, normalMatrix) {
  const sourcePosition = source.attributes.position;
  const sourceNormal = source.attributes.normal || null;
  const sourceUv = source.attributes.uv || null;
  const sourceColor = source.attributes.color || null;
  const remap = new Map();
  const position = [], normal = [], uv = [], color = [];
  const packed = new Uint32Array(indices.length);
  const point = TMP_C;
  for (let i = 0; i < indices.length; i += 1) {
    const original = indices[i];
    let mapped = remap.get(original);
    if (mapped === undefined) {
      mapped = remap.size;
      remap.set(original, mapped);
      TMP_V4.set(sourcePosition.getX(original), sourcePosition.getY(original),
        sourcePosition.getZ(original), 1);
      mesh.applyBoneTransform(original, TMP_V4);
      point.set(TMP_V4.x, TMP_V4.y, TMP_V4.z).applyMatrix4(bakeMatrix);
      position.push(point.x, point.y, point.z);
      if (sourceNormal) {
        TMP_V4.set(sourceNormal.getX(original), sourceNormal.getY(original),
          sourceNormal.getZ(original), 0);
        mesh.applyBoneTransform(original, TMP_V4);
        point.set(TMP_V4.x, TMP_V4.y, TMP_V4.z).applyMatrix3(normalMatrix);
        if (point.lengthSq() > 1e-12) point.normalize(); else point.set(0, 1, 0);
        normal.push(point.x, point.y, point.z);
      }
      if (sourceUv) uv.push(sourceUv.getX(original), sourceUv.getY(original));
      if (sourceColor) {
        color.push(sourceColor.getX(original), sourceColor.getY(original), sourceColor.getZ(original));
      }
    }
    packed[i] = mapped;
  }
  if (!position.length) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(position, 3));
  if (normal.length) geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normal, 3));
  if (uv.length) geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  if (color.length) geometry.setAttribute("color", new THREE.Float32BufferAttribute(color, 3));
  geometry.setIndex(new THREE.BufferAttribute(packed, 1));
  if (!normal.length) geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}
