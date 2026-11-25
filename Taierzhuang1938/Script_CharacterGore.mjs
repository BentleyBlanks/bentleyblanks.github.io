// 断肢的**视觉 / 物理 / 声音层**：切身体、盖雕刻 PBR 解剖断面、烘肢块、弹飞钢盔、爆头碎块、挂刚体、喷血、染衣血渍、发声、回收。
//
// 规则（判定 / 顶点分类 / index 过滤 / 预算环）在 `Script_Dismemberment.mjs`（纯 Node），
// 数字全在 `Data_Tuning_Gore.mjs`。口径文档：docs/Data_Dismemberment.md §5–§7。
//
// 三条核心约束：
//   1) **身体只换 index，不动活人材质**：CPU 删除三角形后，主渲染 / customDepthMaterial 影子 /
//      depthNormal 预通道三路天然一致，绝不会出现断肢还在地上投影的穿帮。
//   2) **兼容旧卢沟桥骨架（characterRig）与 65 骨 XBot 精切测试模型（goreSkin）**：
//      有预切 `goreMeta.regionsBase64` 时跨断口丢弃数 = 0，断面盖按骨骼局部精确椭圆面贴合；
//      旧模型仍走 ClassifyVertices，自动升级使用雕刻 PBR 断面盖。
//   3) **对象池复用必须完整还原**：ReleaseSoldier 还原身体几何、武器、头发（HairGroom）、
//      受击命中体集合，并释放所有私有 index / 断面盖 / 肢块 / 钢盔 / 碎块。

import * as THREE from "three";
import { ManagedGLTFLoader as GLTFLoader } from "./Script_ModelImports.mjs";
import { ApplyPatches } from "./Script_MaterialPatches.mjs";
import { CHARACTER_LIGHT_PATCH } from "./Script_CharacterLight.mjs";
import { Mulberry32, HashString } from "./Script_Noise.mjs";
import { CloneShadedMaterial } from "./Script_Materials.mjs";
import {
  LIMBS, HELMET_CODE, STUMP_ASSETS_URL, HEAD_BURST_KINDS, STUMP_WETNESS,
  HELMET_LAUNCH, GIB_BURST, GORE_DECAL_SMEAR,
  BUDGET, DEFAULT_QUALITY, LAUNCH, LIMB_BODY, CAP, BLOOD, DEATH_PUSH_SCALE,
  PART_RETIRE, GORE_AUDIO,
} from "./Data_Tuning_Gore.mjs";
import {
  ClassifyVertices, FilterIndex, ResolveSever, LimbSubtree, GoreBudget,
  IsGoreEnabled, SetGoreEnabled, AccumulateLimbDamage, BlastLimbWeights,
} from "./Script_Dismemberment.mjs";

export { DEATH_PUSH_SCALE };

// --- 复用的临时量（每帧几十次调用，避免产生 GC 垃圾）-------------------------
const TMP_A = new THREE.Vector3();
const TMP_B = new THREE.Vector3();
const TMP_C = new THREE.Vector3();
const TMP_D = new THREE.Vector3();
const TMP_E = new THREE.Vector3();
const TMP_Q = new THREE.Quaternion();
const TMP_Q2 = new THREE.Quaternion();
const TMP_SCALE = new THREE.Vector3();
const TMP_M4 = new THREE.Matrix4();
const TMP_M4_B = new THREE.Matrix4();
const UP = new THREE.Vector3(0, 1, 0);
const RETIRE_MATRIX = new THREE.Matrix4();
const RETIRE_FRUSTUM = new THREE.Frustum();
const RETIRE_SPHERE = new THREE.Sphere();
const RETIRE_CAMERA_AT = new THREE.Vector3();

// ---------------------------------------------------------------------------
// 雕刻 PBR 解剖断面盖 & 碎块合集（BlenderMCP 烘出的 Model_GoreStumpCaps.glb）
// 未读完或加载失败时静默回退到程序化 CapGeometry，不阻塞启动与测试。
// ---------------------------------------------------------------------------
let stumpAssets = null;
let stumpAssetsPromise = null;

export function LoadStumpAssets() {
  if (stumpAssetsPromise) return stumpAssetsPromise;
  const loader = new GLTFLoader();
  stumpAssetsPromise = loader.loadAsync(STUMP_ASSETS_URL).then((gltf) => {
    const geometries = new Map();
    let material = null;
    gltf.scene.traverse((obj) => {
      if (!obj.isMesh || !obj.geometry) return;
      const key = obj.name;
      geometries.set(key, obj.geometry);
      if (!material && obj.material && !Array.isArray(obj.material)) {
        material = obj.material;
        material.side = THREE.DoubleSide;
        if (!material.userData.characterLight) {
          ApplyPatches(material, [CHARACTER_LIGHT_PATCH]);
          material.userData.characterLight = true;
        }
      }
    });
    if (geometries.size && material) {
      stumpAssets = { geometries, material };
    }
    return stumpAssets;
  }).catch((error) => {
    console.warn("[Gore] PBR stump assets load skipped, using procedural fallback:", error?.message || error);
    return null;
  });
  return stumpAssetsPromise;
}

// ---------------------------------------------------------------------------
// 程序化回退断面盖（单材质、顶点色）
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
  const lift = 0.02;
  for (let i = 0; i < segments; i += 1) {
    const a0 = (i / segments) * Math.PI * 2;
    const a1 = ((i + 1) / segments) * Math.PI * 2;
    const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
    Push(c0 * inner, lift, s0 * inner, 0, 1, 0, flesh);
    Push(c0 * outer, lift, s0 * outer, 0, 1, 0, flesh);
    Push(c1 * outer, lift, s1 * outer, 0, 1, 0, flesh);
    Push(c0 * inner, lift, s0 * inner, 0, 1, 0, flesh);
    Push(c1 * outer, lift, s1 * outer, 0, 1, 0, flesh);
    Push(c1 * inner, lift, s1 * inner, 0, 1, 0, flesh);
    Push(c0 * inner, lift, s0 * inner, c0, 0, s0, bone);
    Push(c1 * inner, lift, s1 * inner, c1, 0, s1, bone);
    Push(c1 * inner, lift + stub, s1 * inner, c1, 0, s1, bone);
    Push(c0 * inner, lift, s0 * inner, c0, 0, s0, bone);
    Push(c1 * inner, lift + stub, s1 * inner, c1, 0, s1, bone);
    Push(c0 * inner, lift + stub, s0 * inner, c0, 0, s0, bone);
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

/** 选一块雕刻 PBR 断面盖（或回退程序化几何）；每块盖子克隆轻量化材质句柄，支持湿血干涸粗糙度演变。 */
function CreateCapMesh(limbId, headBurst = false) {
  const spec = LIMBS[limbId];
  const meshName = (headBurst && spec?.burstCapMesh) || spec?.capMesh || null;
  if (stumpAssets && meshName && stumpAssets.geometries.has(meshName)) {
    const geom = stumpAssets.geometries.get(meshName);
    const mat = CloneShadedMaterial(stumpAssets.material);
    mat.side = THREE.DoubleSide;
    mat.roughness = STUMP_WETNESS.freshRoughness;
    const mesh = new THREE.Mesh(geom, mat);
    mesh.userData.goreOwnedMaterial = mat;
    mesh.userData.goreWetness = true;
    return mesh;
  }
  return new THREE.Mesh(CapGeometry(), CapMaterial());
}

function DisposeCapMesh(cap) {
  if (!cap) return;
  const mat = cap.userData?.goreOwnedMaterial;
  if (mat && mat !== capMaterial && mat !== stumpAssets?.material) {
    mat.dispose();
    cap.userData.goreOwnedMaterial = null;
  }
}

function DecodeBase64Bytes(b64) {
  if (!b64 || typeof b64 !== "string") return null;
  if (typeof atob === "function") {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
    return out;
  }
  if (typeof Buffer !== "undefined") return new Uint8Array(Buffer.from(b64, "base64"));
  return null;
}

// 肢块材质：人物材质的非蒙皮克隆（契约 11：CloneShadedMaterial）。
const partMaterials = new Map();

function PartMaterial(source) {
  if (!source) return null;
  const key = Array.isArray(source) ? source.map((m) => m.uuid).join("|") : source.uuid;
  let clone = partMaterials.get(key);
  if (!clone) {
    clone = CloneShadedMaterial(source);
    if (!Array.isArray(clone)) clone.name = `${source.name || "Gore"}#part`;
    partMaterials.set(key, clone);
    const Release = () => {
      if (partMaterials.get(key) !== clone) return;
      partMaterials.delete(key);
      for (const material of Array.isArray(clone) ? clone : [clone]) material.dispose();
    };
    for (const material of Array.isArray(source) ? source : [source])
      material.addEventListener("dispose", Release);
  }
  return clone;
}

function WarmGeometry(withColor) {
  const geometry = new THREE.BoxGeometry(0.12, 0.28, 0.12);
  geometry.deleteAttribute("tangent");
  if (withColor) {
    const count = geometry.attributes.position.count;
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(new Float32Array(count * 3).fill(1), 3));
  }
  return geometry;
}

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

function GoreRng(soldier) {
  if (!soldier) return Mulberry32(HashString("gore|anonymous"));
  if (typeof soldier.goreRnd !== "function") {
    soldier.goreRnd = Mulberry32(HashString(`gore|${soldier.id ?? 0}|${soldier.side || ""}`));
  }
  return soldier.goreRnd;
}

let partSerial = 0;

export class GoreSystem {
  constructor(host = {}) {
    this.host = host;
    this.records = new Map();       // soldier → GoreRecord
    this.hitHistory = new WeakMap();
    this.parts = [];                // 场上所有肢块（计入 budget）
    this.helmets = [];              // 弹飞的钢盔刚体
    this.gibs = [];                 // 爆头 / 近炸碎块与撕裂布片
    this.classifyCache = new Map(); // 源几何 uuid → Uint8Array
    this.force = null;
    this.budget = new GoreBudget(this.Tuning().maxParts);
    // 后台惰性预载雕刻 PBR 断面与碎块，不阻塞构造。
    if (typeof window !== "undefined") LoadStumpAssets();
  }

  PreloadAssets() { return LoadStumpAssets(); }

  get scene() { return this.host.Scene?.() || null; }
  get physics() { return this.host.Physics?.() || null; }
  get vfx() { return this.host.Vfx?.() || null; }
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

  SetForce(kind) {
    this.force = kind ? String(kind) : null;
    return this.force;
  }

  /** 解析一名士兵当前用于断肢的目标骨架（65 骨精切 XBotSkin 优先，否则回退旧 characterRig）。 */
  _TargetOf(soldier) {
    const actor = soldier?.actor;
    if (!actor) return null;
    const skin = actor.goreSkin;
    if (skin && skin.goreEnabled && skin.model) {
      return {
        isXBot: true,
        skin,
        rig: actor.characterRig || null,
        root: skin.model,
        scaleNode: skin.container,
        bones: skin.goreBones,
        rawBones: skin.bones,
        goreMeta: skin.goreMeta || null,
      };
    }
    const rig = actor.characterRig;
    if (rig && rig.root) {
      return {
        isXBot: false,
        skin: null,
        rig,
        root: rig.root,
        scaleNode: rig.root,
        bones: rig.bones,
        rawBones: null,
        goreMeta: null,
      };
    }
    return null;
  }

  // --- 判定 -----------------------------------------------------------------

  Resolve(soldier, hit = {}) {
    if (!IsGoreEnabled()) return null;
    const target = this._TargetOf(soldier);
    if (!target) return null;
    const force = this.force;
    let history = this.hitHistory.get(soldier);
    if (!history) { history = new Map(); this.hitHistory.set(soldier, history); }
    const accumulatedDamage = AccumulateLimbDamage(history, hit);
    const hitboxes = soldier.actor?.GetBoneHitboxes?.() || target.rig?.GetHitboxes?.() || [];
    const result = ResolveSever({
      ...hit,
      accumulatedDamage,
      corpse: soldier.alive === false,
      severed: soldier.gore?.limbs,
      limbWeights: hit.blastOrigin ? BlastLimbWeights(hit.blastOrigin, hitboxes) : undefined,
      kind: force || hit.kind,
      force: !!force,
      rng: GoreRng(soldier),
    });
    if (!result.limbs.length) return null;
    this.force = null;
    return {
      limbs: result.limbs,
      forceKill: result.forceKill,
      kind: result.kind,
      point: hit.point || null,
      falloff: hit.falloff,
      headBurst: !!hit.headBurst,
      reason: result.reason,
    };
  }

  // --- 执行 -----------------------------------------------------------------

  Sever(soldier, limbIds, options = {}) {
    if (!IsGoreEnabled()) return [];
    const target = this._TargetOf(soldier);
    const scene = this.scene;
    if (!target || !scene) return [];
    const record = this._RecordFor(soldier, target);
    if (!record) return [];

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

    record.root.updateWorldMatrix(true, false);
    record.root.updateMatrixWorld(true);
    for (const entry of record.meshes) entry.mesh.skeleton?.update();

    const kind = options.kind && LAUNCH[options.kind] ? options.kind : (options.kind || "bullet");
    const wantHeadBurst = fresh.includes("head") && (!!options.headBurst || HEAD_BURST_KINDS.includes(kind));
    // 爆头、斩首或近距离爆炸都会自动把九〇式钢盔弹飞！
    const shouldPopHelmet = record.hasHelmet && !record.helmetPopped
      && (fresh.includes("head") || (kind === "blast" && (options.falloff ?? 1) >= 0.72));

    // 若新切的是父段（如先切前臂、后鞭上臂），先摘除挂在不可见子关节上的旧断面与血源，避免浮空穿帮。
    for (const id of fresh) this._PruneChildStumps(record, id);

    for (const id of fresh) record.limbs.add(id);
    if (shouldPopHelmet) record.helmetPopped = true;
    const severedSet = new Set([...record.limbs].flatMap(LimbSubtree));
    if (record.skin) record.skin.severedHitboxes = severedSet;
    if (record.rig) record.rig.severedHitboxes = severedSet;

    this._RebuildBody(record);

    if (shouldPopHelmet) {
      this._SpawnHelmetBody(record, { ...options, kind: wantHeadBurst ? "blast" : kind });
    }

    for (const id of fresh) {
      const isHeadBurst = id === "head" && wantHeadBurst;
      if (isHeadBurst) {
        // 爆头碎裂：藏掉头发、不生成完整飞头，改为碎肉/骨片爆发 + 破碎颅底断面！
        this._HideHairForHeadBurst(record);
        this._SpawnHeadBurstGibs(record, options);
      } else {
        const part = this._SpawnPart(record, id, options);
        if (part && !part.disposed) {
          this._HandOffWeapon(record, id, part);
          if (id === "head") this._HandOffHair(record, part);
        }
      }
      this._SpawnStumpCap(record, id, { ...options, headBurst: isHeadBurst });
      this._SoakWoundBlood(record, id, options);
      if (!isHeadBurst) this._SpawnImpactGibs(record, id, kind, options);
    }

    soldier.gore = record;
    this._Splash(record, fresh, { ...options, kind, headBurst: wantHeadBurst });
    this._PlaySever(record, fresh, options);
    return fresh;
  }

  /** 独立弹飞九〇式钢盔（不切头部也能单独打飞或测试）。 */
  PopHelmet(soldier, options = {}) {
    if (!IsGoreEnabled()) return false;
    const target = this._TargetOf(soldier);
    const scene = this.scene;
    if (!target || !scene) return false;
    const record = this._RecordFor(soldier, target);
    if (!record || !record.hasHelmet || record.helmetPopped) return false;
    record.root.updateWorldMatrix(true, false);
    record.root.updateMatrixWorld(true);
    for (const entry of record.meshes) entry.mesh.skeleton?.update();
    record.helmetPopped = true;
    this._RebuildBody(record);
    this._SpawnHelmetBody(record, options);
    soldier.gore = record;
    return true;
  }

  _RecordFor(soldier, target) {
    let record = this.records.get(soldier);
    if (record) return record;
    const meshes = [];
    let hasHelmet = false;
    target.root.traverse((object) => {
      if (!object.isSkinnedMesh) return;
      const source = object.geometry;
      if (!source?.attributes?.skinIndex || !source.attributes.skinWeight) return;
      let vertexLimb = this.classifyCache.get(source.uuid);
      if (!vertexLimb) {
        const baked = target.goreMeta?.regionsBase64 ? DecodeBase64Bytes(target.goreMeta.regionsBase64) : null;
        if (baked && baked.length === source.attributes.position.count) {
          vertexLimb = baked;
        } else {
          const boneNames = (object.skeleton?.bones || []).map((bone) => bone?.name || "");
          vertexLimb = ClassifyVertices(boneNames, source.attributes.skinIndex,
            source.attributes.skinWeight, source.attributes.position.count);
        }
        this.classifyCache.set(source.uuid, vertexLimb);
      }
      if (!hasHelmet && vertexLimb.includes(HELMET_CODE)) hasHelmet = true;
      meshes.push({ mesh: object, source, vertexLimb, privateGeometry: null, parts: null, helmet: null, dropped: 0 });
    });
    if (!meshes.length) return null;
    record = {
      soldier,
      isXBot: target.isXBot,
      skin: target.skin,
      rig: target.rig,
      root: target.root,
      scaleNode: target.scaleNode,
      bones: target.bones,
      rawBones: target.rawBones,
      goreMeta: target.goreMeta,
      hasHelmet,
      helmetPopped: false,
      meshes,
      limbs: new Set(),
      caps: [],
      parts: [],
      sourceTriangles: meshes.reduce((sum, e) =>
        sum + ((e.source.index?.count || e.source.attributes.position.count) / 3), 0),
      bodyTriangles: 0,
      partTriangles: 0,
      limbTriangles: 0,
      dropped: 0,
      weaponDetached: false,
      weaponPart: null,
      hairHold: null,
    };
    record.bodyTriangles = record.sourceTriangles;
    this.records.set(soldier, record);
    return record;
  }

  _PruneChildStumps(record, parentLimbId) {
    const children = new Set(LimbSubtree(parentLimbId));
    children.delete(parentLimbId);
    if (!children.size) return;
    for (let i = record.caps.length - 1; i >= 0; i -= 1) {
      const entry = record.caps[i];
      if (!children.has(entry.limb)) continue;
      if (entry.spurt) this.vfx?.RemoveBloodSpurt?.(entry.spurt);
      if (entry.cap.parent) entry.cap.parent.remove(entry.cap);
      DisposeCapMesh(entry.cap);
      record.caps.splice(i, 1);
    }
  }

  /** 身体：共享属性 + 私有 index。属性数组零字节复制。 */
  _RebuildBody(record) {
    let bodyTriangles = 0, dropped = 0, limbTriangles = 0;
    const filterOpts = record.helmetPopped ? { stripHelmet: true } : null;
    for (const entry of record.meshes) {
      const source = entry.source;
      const result = FilterIndex(source.index ? source.index.array : null,
        entry.vertexLimb, record.limbs, filterOpts);
      entry.parts = result.parts;
      entry.helmet = result.helmet || null;
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
    record.limbTriangles = limbTriangles;
  }

  /** 关节的世界轴：优先取预切 cut normal，否则 joint → axisTo（头为 neck → head）。 */
  _JointAxis(record, limbId, out) {
    const cut = record.goreMeta?.cuts?.[limbId];
    if (cut && record.rawBones) {
      const b = record.rawBones.get(cut.stumpBone);
      if (b) {
        b.getWorldQuaternion(TMP_Q2);
        out.set(...cut.stump.normalLocal).applyQuaternion(TMP_Q2);
        if (out.lengthSq() > 1e-8) return out.normalize();
      }
    }
    const spec = LIMBS[limbId];
    const joint = record.bones?.[spec.joint];
    if (!joint) return out.copy(UP);
    joint.getWorldPosition(TMP_A);
    const target = spec.axisTo ? record.bones?.[spec.axisTo] : (record.bones?.neck || null);
    if (target) {
      target.getWorldPosition(TMP_B);
      if (spec.axisTo) out.copy(TMP_B).sub(TMP_A);
      else out.copy(TMP_A).sub(TMP_B);
      if (out.lengthSq() > 1e-8) return out.normalize();
    }
    return out.copy(UP);
  }

  /** 将断面盖精准贴合到预切骨局部椭圆面，或按旧口径沿关节轴缩放对齐。 */
  _PlaceCapOnBone(cap, record, limbId, bone, isPart, worldAxisFallback) {
    bone.matrixWorld.decompose(TMP_A, TMP_Q2, TMP_SCALE);
    const boneScale = (TMP_SCALE.x + TMP_SCALE.y + TMP_SCALE.z) / 3 || 1;
    const modelScale = record.scaleNode?.getWorldScale(TMP_B).y || 1;
    const cut = record.goreMeta?.cuts?.[limbId];
    if (cut) {
      const frame = isPart ? cut.part : cut.stump;
      cap.position.set(frame.offsetLocal[0], frame.offsetLocal[1], frame.offsetLocal[2]);
      const yAxis = TMP_C.set(frame.normalLocal[0], frame.normalLocal[1], frame.normalLocal[2]).normalize();
      const xAxis = TMP_D.set(frame.tangentULocal[0], frame.tangentULocal[1], frame.tangentULocal[2]);
      xAxis.addScaledVector(yAxis, -xAxis.dot(yAxis));
      if (xAxis.lengthSq() < 1e-8) xAxis.set(1, 0, 0);
      xAxis.normalize();
      const zAxis = TMP_E.crossVectors(xAxis, yAxis).normalize();
      TMP_M4.makeBasis(xAxis, yAxis, zAxis);
      cap.quaternion.setFromRotationMatrix(TMP_M4);
      const fitBoost = isPart ? 0.94 : 1.03;
      const axialScale = isPart ? 0.62 : 1.0;
      const avgR = 0.5 * (cut.radiusU + cut.radiusV);
      cap.scale.set(
        (cut.radiusU * fitBoost * modelScale) / boneScale,
        (avgR * axialScale * modelScale) / boneScale,
        (cut.radiusV * fitBoost * modelScale) / boneScale,
      );
      return;
    }
    const spec = LIMBS[limbId];
    const axisLocal = worldAxisFallback.clone().applyQuaternion(TMP_Q2.clone().invert()).normalize();
    if (isPart) axisLocal.negate();
    cap.position.set(0, 0, 0);
    cap.quaternion.setFromUnitVectors(UP, axisLocal);
    cap.scale.setScalar((spec.capRadius * modelScale) / boneScale);
  }

  _SpawnPart(record, limbId, options) {
    const spec = LIMBS[limbId];
    const cut = record.goreMeta?.cuts?.[limbId];
    const joint = (cut && record.rawBones?.get(cut.partBone)) || record.bones?.[spec.joint];
    const scene = this.scene;
    if (!joint || !scene) return null;

    joint.matrixWorld.decompose(TMP_A, TMP_Q, TMP_SCALE);
    const rigScale = record.scaleNode?.getWorldScale(TMP_B).y || 1;
    const jointPosition = TMP_A.clone();
    const jointQuaternion = TMP_Q.clone();
    const axis = this._JointAxis(record, limbId, new THREE.Vector3());

    const inverseJoint = new THREE.Matrix4().copy(joint.matrixWorld).invert();
    const pieces = [];
    for (const entry of record.meshes) {
      const indices = entry.parts?.get(limbId);
      if (!indices || !indices.length) continue;
      TMP_M4.copy(inverseJoint).multiply(entry.mesh.matrixWorld);
      const geometry = BakePartGeometry(entry.mesh, entry.source, indices, TMP_M4);
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
      object.castShadow = true;
      object.receiveShadow = true;
      object.frustumCulled = true;
      object.userData.characterPbrSurface = true;
    });
    root.position.copy(jointPosition);
    root.quaternion.copy(jointQuaternion);
    root.scale.copy(TMP_SCALE);
    scene.add(root);

    // 肢块断口面也盖雕刻 PBR 断面（法线朝向原身体一侧）
    const partCap = CreateCapMesh(limbId, false);
    partCap.name = `GoreCap_${limbId}_${serial}_part`;
    partCap.castShadow = true;
    this._PlaceCapOnBone(partCap, record, limbId, joint, true, axis);
    root.add(partCap);

    // --- 刚体 ---------------------------------------------------------------
    const soldier = record.soldier;
    const kind = options.kind && LAUNCH[options.kind] ? options.kind : "bullet";
    const launch = LAUNCH[kind];
    const rnd = GoreRng(soldier);
    const halfLength = spec.halfLength * rigScale;
    const radius = spec.capRadius * rigScale;
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
      centerToOrigin: new THREE.Vector3(0, -halfLength, 0),
      quaternionOffset: bodyQuaternion.clone().invert().multiply(jointQuaternion),
      age: 0,
      restTime: 0,
      resting: !body,
      landCount: 0,
      landAge: -Infinity,
      smearCount: 0,
      smearAge: -Infinity,
      spurt: 0,
      disposed: false,
      holdsWeapon: false,
      holdsHair: false,
    };
    this.parts.push(part);
    record.parts.push(part);
    record.partTriangles += pieces.reduce((sum, piece) => sum + piece.geometry.index.count / 3, 0);

    const vfx = this.vfx;
    if (vfx?.BloodSpurt) {
      part.spurt = vfx.BloodSpurt(partCap, null, { x: 0, y: 1, z: 0 }, {
        seconds: BLOOD.partSpurtSeconds, rate: BLOOD.partSpurtRate,
        spread: BLOOD.spurtSpread, speed: BLOOD.spurtSpeed, decals: 2,
      });
    }

    const evicted = this.budget.Acquire(part);
    if (evicted) this._DisposePart(evicted);
    return part;
  }

  /** 弹飞九〇式钢盔：从 Head 骨空间烘出独立 1,727 三角刚体，高弹跳、高自旋、落地金属声。 */
  _SpawnHelmetBody(record, options) {
    const scene = this.scene;
    const headBone = record.rawBones?.get("Head") || record.bones?.head;
    if (!scene || !headBone) return null;
    headBone.matrixWorld.decompose(TMP_A, TMP_Q, TMP_SCALE);
    const headPos = TMP_A.clone();
    const headQuat = TMP_Q.clone();
    const headScale = TMP_SCALE.clone();
    const inverseHead = new THREE.Matrix4().copy(headBone.matrixWorld).invert();
    const pieces = [];
    for (const entry of record.meshes) {
      const indices = entry.helmet;
      if (!indices || !indices.length) continue;
      TMP_M4.copy(inverseHead).multiply(entry.mesh.matrixWorld);
      const geometry = BakePartGeometry(entry.mesh, entry.source, indices, TMP_M4);
      if (geometry) pieces.push({ geometry, material: PartMaterial(entry.mesh.material) });
    }
    if (!pieces.length) return null;

    partSerial += 1;
    const serial = partSerial;
    const root = new THREE.Mesh(pieces[0].geometry, pieces[0].material);
    root.name = `GoreHelmet_${serial}`;
    root.castShadow = true;
    root.receiveShadow = true;
    root.position.copy(headPos);
    root.quaternion.copy(headQuat);
    root.scale.copy(headScale);
    scene.add(root);

    const rnd = GoreRng(record.soldier);
    const cfg = HELMET_LAUNCH;
    const rigScale = record.scaleNode?.getWorldScale(TMP_B).y || 1;
    const offsetLocal = record.goreMeta?.helmet?.offsetLocal || [0, 12, 0];
    const centerWorld = new THREE.Vector3(...offsetLocal).multiply(headScale).applyQuaternion(headQuat).add(headPos);
    const dir = options.direction && options.direction.lengthSq() > 1e-8
      ? TMP_B.copy(options.direction).normalize()
      : TMP_B.set((rnd() - 0.5) * 2, 0.4, (rnd() - 0.5) * 2).normalize();
    const boost = options.kind === "blast" ? 1.45 : 1.0;
    const speed = (cfg.speed[0] + (cfg.speed[1] - cfg.speed[0]) * rnd()) * boost;
    const velocity = new THREE.Vector3(
      dir.x * speed + (rnd() - 0.5) * 2.2,
      Math.max(2.2, dir.y * speed * 0.4 + cfg.up * boost),
      dir.z * speed + (rnd() - 0.5) * 2.2,
    );
    const angular = new THREE.Vector3(
      (rnd() * 2 - 1) * cfg.spin,
      (rnd() * 2 - 1) * cfg.spin,
      (rnd() * 2 - 1) * cfg.spin,
    );

    const radius = (record.goreMeta?.helmet?.radius || cfg.radius) * rigScale;
    let body = null;
    try {
      body = this.physics?.MakeLimbBody?.({
        position: centerWorld, quaternion: headQuat, velocity,
        angularVelocity: { x: angular.x, y: angular.y, z: angular.z },
        halfLength: radius * 0.45, radius: radius * 0.85, mass: cfg.mass,
        friction: cfg.friction, restitution: cfg.restitution,
        linearDamping: 0.16, angularDamping: 0.35,
      }) || null;
    } catch { body = null; }

    const centerToOrigin = headPos.clone().sub(centerWorld).applyQuaternion(headQuat.clone().invert());
    const helmet = {
      id: serial,
      soldier: record.soldier,
      root,
      pieces,
      body,
      radius: radius * 0.78,
      centerToOrigin,
      age: 0,
      restTime: 0,
      resting: !body,
      landCount: 0,
      landAge: -Infinity,
    };
    this.helmets.push(helmet);
    return helmet;
  }

  /** 斩首时把 HairGroom 移交给飞出去的头颅，防止头发悬空在空脖子上。 */
  _HandOffHair(record, part) {
    const hair = record.skin?.hair;
    if (!hair?.root || !hair.root.parent || record.hairHold) return false;
    record.hairHold = {
      hair,
      parent: hair.root.parent,
      position: hair.root.position.clone(),
      quaternion: hair.root.quaternion.clone(),
      scale: hair.root.scale.clone(),
      visible: hair.root.visible,
    };
    part.root.updateMatrixWorld(true);
    part.root.attach(hair.root);
    part.holdsHair = true;
    return true;
  }

  _HideHairForHeadBurst(record) {
    const hair = record.skin?.hair;
    if (!hair?.root || record.hairHold) return;
    record.hairHold = {
      hair,
      parent: hair.root.parent,
      position: hair.root.position.clone(),
      quaternion: hair.root.quaternion.clone(),
      scale: hair.root.scale.clone(),
      visible: hair.root.visible,
    };
    hair.root.visible = false;
  }

  _RestoreHair(record, visible = true) {
    const hold = record?.hairHold;
    if (!hold) return;
    const root = hold.hair?.root;
    if (root && hold.parent) {
      hold.parent.add(root);
      root.position.copy(hold.position);
      root.quaternion.copy(hold.quaternion);
      root.scale.copy(hold.scale);
      root.visible = visible ? hold.visible : false;
      root.updateMatrixWorld(true);
    }
    if (visible) record.hairHold = null;
  }

  _HandOffWeapon(record, limbId, part) {
    if (record.weaponDetached) return false;
    const actor = record.soldier?.actor;
    if (!actor?.weaponGroup || typeof actor.DetachWeaponForGore !== "function") return false;
    let rides = false;
    if (record.isXBot) {
      // 65 骨 XBot 持枪右手：切断右上臂或右前臂时，枪随右手一起飞出！
      rides = limbId === "upperArmR" || limbId === "forearmR";
    } else {
      const rig = record.rig;
      const joint = rig?.bones?.[LIMBS[limbId]?.joint];
      const mount = actor.riggedWeaponMount || rig?.Grip?.("weaponR") || null;
      if (joint && mount) {
        for (let node = mount; node; node = node.parent) {
          if (node === joint) { rides = true; break; }
        }
      }
    }
    if (!rides) return false;
    part.root.updateMatrixWorld(true);
    if (!actor.DetachWeaponForGore(part.root)) return false;
    part.holdsWeapon = true;
    record.weaponDetached = true;
    record.weaponPart = part;
    return true;
  }

  /** 身体侧残端断面盖 + 心跳脉冲动脉喷血源。 */
  _SpawnStumpCap(record, limbId, options) {
    const spec = LIMBS[limbId];
    const cut = record.goreMeta?.cuts?.[limbId];
    const joint = (cut && record.rawBones?.get(cut.stumpBone)) || record.bones?.[spec.joint];
    if (!joint) return null;
    const headBurst = !!options.headBurst;
    const axisWorld = this._JointAxis(record, limbId, new THREE.Vector3());
    const cap = CreateCapMesh(limbId, headBurst);
    cap.name = `GoreCap_${limbId}_${record.soldier.id ?? 0}`;
    cap.castShadow = true;
    this._PlaceCapOnBone(cap, record, limbId, joint, false, axisWorld);
    joint.add(cap);
    const entry = { cap, joint, limb: limbId, age: 0, spurt: 0 };
    record.caps.push(entry);

    const vfx = this.vfx;
    const tuning = this.Tuning();
    if (vfx?.BloodSpurt) {
      entry.spurt = vfx.BloodSpurt(cap, null, { x: 0, y: 1, z: 0 }, {
        arterial: true,
        seconds: headBurst ? tuning.spurtS * 1.25 : tuning.spurtS,
        rate: headBurst ? tuning.spurtRate * 1.35 : tuning.spurtRate,
        speed: headBurst ? [BLOOD.arterialSpeed[0] * 1.25, BLOOD.arterialSpeed[1] * 1.35] : BLOOD.arterialSpeed,
        decals: tuning.decalsPerSever,
      });
    }
    return cap;
  }

  /** 将断口边缘与衣袖/裤管/衣领浸染湿血（联动 CharacterWounds 服装血渍系统）。 */
  _SoakWoundBlood(record, limbId, options) {
    const wounds = record.skin?.wounds || record.soldier?.actor?.woundBlood;
    if (!wounds?.Add) return;
    const spec = LIMBS[limbId];
    const cut = record.goreMeta?.cuts?.[limbId];
    const bone = (cut && record.rawBones?.get(cut.stumpBone)) || record.bones?.[spec.joint];
    if (!bone) return;
    const point = new THREE.Vector3();
    if (cut) {
      point.set(...cut.stump.offsetLocal).applyMatrix4(bone.matrixWorld);
    } else {
      bone.getWorldPosition(point);
    }
    const dir = options.direction?.lengthSq?.() > 1e-8
      ? options.direction.clone().normalize()
      : this._JointAxis(record, limbId, new THREE.Vector3()).negate();
    const part = limbId === "head" ? "head" : "limb";
    wounds.Add({ part, shapeId: limbId, point, direction: dir, radiusM: 0.17 });
  }

  /** 爆头碎裂时喷射 8 块颅骨/血肉碎块。 */
  _SpawnHeadBurstGibs(record, options) {
    const headBone = record.rawBones?.get("Head") || record.bones?.head;
    if (!headBone) return;
    const at = headBone.getWorldPosition(new THREE.Vector3());
    at.y += 0.08;
    const dir = options.direction?.lengthSq?.() > 1e-8
      ? options.direction.clone().normalize()
      : new THREE.Vector3(0, 0.85, 0.3).normalize();
    this._SpawnGibBurst(record.soldier, at, dir, GIB_BURST.headBurstCount, { includeCloth: false, power: 1.35 });
  }

  /** 爆炸 / 重机枪 / 劈砍断肢时喷射适量血肉碎块与撕裂布条。 */
  _SpawnImpactGibs(record, limbId, kind, options) {
    const count = kind === "blast" ? GIB_BURST.blastCount
      : kind === "hmg" ? GIB_BURST.hmgCount
        : kind === "blade" ? GIB_BURST.bladeCount : 0;
    if (!count) return;
    const cut = record.goreMeta?.cuts?.[limbId];
    const bone = (cut && record.rawBones?.get(cut.stumpBone)) || record.bones?.[LIMBS[limbId].joint];
    if (!bone) return;
    const at = cut
      ? new THREE.Vector3(...cut.stump.offsetLocal).applyMatrix4(bone.matrixWorld)
      : bone.getWorldPosition(new THREE.Vector3());
    const dir = options.direction?.lengthSq?.() > 1e-8
      ? options.direction.clone().normalize()
      : this._JointAxis(record, limbId, new THREE.Vector3());
    this._SpawnGibBurst(record.soldier, at, dir, count, {
      includeCloth: limbId !== "head",
      power: kind === "blast" ? 1.25 : 0.85,
    });
  }

  _SpawnGibBurst(soldier, origin, direction, count, { includeCloth = true, power = 1 } = {}) {
    const scene = this.scene;
    if (!scene || !stumpAssets) return;
    const rnd = GoreRng(soldier);
    const gibNames = includeCloth
      ? ["Gib_ChunkA", "Gib_ChunkB", "Gib_ClothShred"]
      : ["Gib_ChunkA", "Gib_ChunkB"];
    for (let i = 0; i < count; i += 1) {
      const name = gibNames[Math.floor(rnd() * gibNames.length)];
      const geom = stumpAssets.geometries.get(name);
      if (!geom) continue;
      const mesh = new THREE.Mesh(geom, stumpAssets.material);
      mesh.name = `GoreGib_${++partSerial}`;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const sc = name === "Gib_ClothShred" ? (0.55 + rnd() * 0.45) : (0.30 + rnd() * 0.34);
      mesh.scale.setScalar(sc);
      mesh.position.copy(origin).add(new THREE.Vector3((rnd() - 0.5) * 0.08, (rnd() - 0.5) * 0.08, (rnd() - 0.5) * 0.08));
      mesh.rotation.set(rnd() * Math.PI * 2, rnd() * Math.PI * 2, rnd() * Math.PI * 2);
      scene.add(mesh);
      const spd = (GIB_BURST.speed[0] + (GIB_BURST.speed[1] - GIB_BURST.speed[0]) * rnd()) * power;
      const vel = new THREE.Vector3(
        direction.x * spd * 0.75 + (rnd() - 0.5) * spd * 0.9,
        Math.max(0.8, direction.y * spd * 0.45 + GIB_BURST.up * (0.55 + rnd() * 0.85) * power),
        direction.z * spd * 0.75 + (rnd() - 0.5) * spd * 0.9,
      );
      const ang = new THREE.Vector3(
        (rnd() * 2 - 1) * GIB_BURST.spin,
        (rnd() * 2 - 1) * GIB_BURST.spin,
        (rnd() * 2 - 1) * GIB_BURST.spin,
      );
      this.gibs.push({ mesh, velocity: vel, angular: ang, age: 0, resting: false, isCloth: name === "Gib_ClothShred", bounced: 0 });
      if (this.gibs.length > GIB_BURST.maxLive) {
        const old = this.gibs.shift();
        if (old?.mesh?.parent) old.mesh.parent.remove(old.mesh);
      }
    }
  }

  /** 断肢瞬间的血雾与武器专属飞溅（大刀横斩血弧 / 爆头喷泉 / 爆炸径向）。 */
  _Splash(record, limbIds, options) {
    const vfx = this.vfx;
    if (!vfx?.BloodBurst || !limbIds.length) return;
    const limb0 = limbIds[0];
    const cut = record.goreMeta?.cuts?.[limb0];
    const joint = (cut && record.rawBones?.get(cut.stumpBone)) || record.bones?.[LIMBS[limb0].joint];
    const direction = new THREE.Vector3();
    if (options.direction && options.direction.lengthSq() > 1e-8) direction.copy(options.direction).normalize();
    else this._JointAxis(record, limb0, direction);
    const at = new THREE.Vector3();
    if (options.point) at.copy(options.point);
    else if (cut && joint) at.set(...cut.stump.offsetLocal).applyMatrix4(joint.matrixWorld);
    else if (joint) joint.getWorldPosition(at);
    else return;

    const amount = BLOOD.burstAmount * Math.min(1.4, 0.85 + limbIds.length * 0.15) * (options.headBurst ? 1.35 : 1);
    vfx.BloodBurst(at, direction, amount);

    if (options.kind === "blade") {
      // 大刀挥砍血弧：沿横向挥刀平面扇出 4 股高速血雾/血滴，慢动作下极具斩击张力！
      const tangent = new THREE.Vector3(-direction.z, 0.15, direction.x);
      if (tangent.lengthSq() < 1e-6) tangent.set(1, 0.15, 0);
      tangent.normalize();
      for (const frac of [-0.65, -0.25, 0.25, 0.65]) {
        const arcDir = direction.clone().multiplyScalar(0.55).addScaledVector(tangent, frac).addScaledVector(UP, 0.22).normalize();
        vfx.BloodBurst(at, arcDir, BLOOD.burstAmount * 0.42);
      }
    } else if (options.headBurst) {
      // 爆头向上血柱雾团
      vfx.BloodBurst(at, UP.clone(), BLOOD.burstAmount * 0.95);
    }
  }

  _PlaySever(record, limbIds, options) {
    const audio = this.audio;
    if (!audio?.Play || !limbIds.length) return null;
    const at = new THREE.Vector3();
    if (options.point) at.copy(options.point);
    else {
      const joint = record.bones?.[LIMBS[limbIds[0]].joint];
      if (!joint) return null;
      joint.getWorldPosition(at);
    }
    const volume = Math.min(GORE_AUDIO.volumeMax,
      GORE_AUDIO.severVolume + (limbIds.length - 1) * GORE_AUDIO.volumePerLimb);
    try {
      return audio.Play("goreSever", { position: at, volume });
    } catch (error) {
      console.warn("[Gore] 断肢声没播出来：", error);
      return null;
    }
  }

  _PlayLand(part, fallSpeed, cue = "goreLimbLand") {
    if (!(fallSpeed >= GORE_AUDIO.landSpeedMinMs)) return null;
    if (part.landCount >= GORE_AUDIO.landMaxCount) return null;
    if (part.age - part.landAge < GORE_AUDIO.landCooldownS) return null;
    const audio = this.audio;
    part.landAge = part.age;
    part.landCount += 1;
    if (!audio?.Play) return null;
    const scale = Math.min(1, fallSpeed / (GORE_AUDIO.landSpeedMinMs * 2.5));
    try {
      return audio.Play(cue, {
        position: part.root.position.clone(),
        volume: GORE_AUDIO.landVolume * Math.max(0.5, scale),
      });
    } catch (error) {
      console.warn("[Gore] 落地声没播出来：", error);
      return null;
    }
  }

  _DepositBloodSmear(part, linvel) {
    const decals = this.vfx?.bloodEffects?.decals;
    if (!decals?.Add) return;
    if (part.smearCount >= GORE_DECAL_SMEAR.maxPerPart) return;
    if (part.age - part.smearAge < GORE_DECAL_SMEAR.cooldownS) return;
    const speed = Math.hypot(linvel.x, linvel.y, linvel.z);
    if (speed < GORE_DECAL_SMEAR.minSpeedMs) return;
    part.smearCount += 1;
    part.smearAge = part.age;
    const rnd = GoreRng(part.soldier);
    const radius = GORE_DECAL_SMEAR.size[0] + (GORE_DECAL_SMEAR.size[1] - GORE_DECAL_SMEAR.size[0]) * rnd();
    const groundY = this.physics?.GroundHeight?.(part.root.position.x, part.root.position.z) ?? 0;
    TMP_D.set(part.root.position.x, groundY + 0.008, part.root.position.z);
    decals.Add(TMP_D, UP, radius, {
      now: this.vfx.bloodEffects.time || 0,
      seed: rnd(),
      pool: part.smearCount === GORE_DECAL_SMEAR.maxPerPart,
      aspect: 1.35 + rnd() * 0.7,
      merge: false,
    });
  }

  // --- 每帧 -----------------------------------------------------------------

  Update(dt, camera) {
    const step = Number.isFinite(dt) ? Math.min(Math.max(dt, 0), 0.1) : 0;
    const tuning = this.Tuning();
    const physics = this.physics;

    // 1) 更新身体残端断面盖的湿血干涸粗糙度
    if (step > 0 && this.records.size) {
      for (const record of this.records.values()) {
        for (const entry of record.caps) {
          entry.age += step;
          const mat = entry.cap.userData?.goreOwnedMaterial;
          if (mat && entry.cap.userData?.goreWetness) {
            const f = Math.min(1, entry.age / STUMP_WETNESS.drySeconds);
            mat.roughness = STUMP_WETNESS.freshRoughness + (STUMP_WETNESS.dryRoughness - STUMP_WETNESS.freshRoughness) * f;
          }
        }
      }
    }

    // 2) 更新飞出肢块刚体
    let hasView = false;
    if (this.parts.length && camera?.isCamera) {
      camera.updateMatrixWorld();
      RETIRE_MATRIX.copy(camera.matrixWorld).invert().premultiply(camera.projectionMatrix);
      RETIRE_FRUSTUM.setFromProjectionMatrix(RETIRE_MATRIX);
      RETIRE_CAMERA_AT.setFromMatrixPosition(camera.matrixWorld);
      hasView = true;
    }
    for (let i = this.parts.length - 1; i >= 0; i -= 1) {
      const part = this.parts[i];
      part.age += step;
      const mat = part.cap?.userData?.goreOwnedMaterial;
      if (mat && part.cap?.userData?.goreWetness) {
        const f = Math.min(1, part.age / STUMP_WETNESS.drySeconds);
        mat.roughness = STUMP_WETNESS.freshRoughness + (STUMP_WETNESS.dryRoughness - STUMP_WETNESS.freshRoughness) * f;
      }
      if (part.age > tuning.partLifeS && this._MayRetire(part, hasView, tuning)) {
        this._DisposePart(part); continue;
      }
      if (!part.body) continue;
      const rotationNow = part.body.rotation();
      TMP_Q.set(rotationNow.x, rotationNow.y, rotationNow.z, rotationNow.w);
      const axis = TMP_A.copy(UP).applyQuaternion(TMP_Q);
      const axisUpY = Math.abs(axis.y);
      const lift = part.radius + axisUpY * Math.max(0, part.halfLength - part.radius);
      const preLinvel = part.body.linvel();
      const fallSpeed = -preLinvel.y;
      if (physics?.ClampToGround?.(part.body, step, { lift })) {
        this._PlayLand(part, fallSpeed, "goreLimbLand");
        this._DepositBloodSmear(part, preLinvel);
        const spin = part.body.angvel();
        const decay = Math.max(0, 1 - LIMB_BODY.groundSpinDrag * step);
        let wx = spin.x * decay, wy = spin.y * decay, wz = spin.z * decay;
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
        physics?.RemoveBody?.(part.body);
        part.body = null;
        part.resting = true;
      }
    }

    // 3) 更新弹飞钢盔刚体
    for (let i = this.helmets.length - 1; i >= 0; i -= 1) {
      const h = this.helmets[i];
      h.age += step;
      if (h.age > HELMET_LAUNCH.lifeS) {
        this._DisposeHelmet(h); continue;
      }
      if (!h.body) continue;
      const fallSpeed = -h.body.linvel().y;
      if (physics?.ClampToGround?.(h.body, step, { lift: h.radius })) {
        this._PlayLand(h, fallSpeed, "impactMetal");
        const spin = h.body.angvel();
        const decay = Math.max(0, 1 - 4.2 * step);
        h.body.setAngvel({ x: spin.x * decay, y: spin.y * decay, z: spin.z * decay }, true);
      }
      const tr = h.body.translation();
      const rot = h.body.rotation();
      TMP_Q.set(rot.x, rot.y, rot.z, rot.w);
      h.root.quaternion.copy(TMP_Q);
      TMP_A.copy(h.centerToOrigin).applyQuaternion(TMP_Q);
      h.root.position.set(tr.x + TMP_A.x, tr.y + TMP_A.y, tr.z + TMP_A.z);
      h.root.updateMatrixWorld(true);
      const lv = h.body.linvel(), av = h.body.angvel();
      const still = Math.hypot(lv.x, lv.y, lv.z) < 0.22 && Math.hypot(av.x, av.y, av.z) < 0.7;
      h.restTime = still ? h.restTime + step : 0;
      if (h.restTime >= 2.0) {
        physics?.RemoveBody?.(h.body);
        h.body = null;
        h.resting = true;
      }
    }

    // 4) 更新碎肉/骨片/布片弹道
    const grav = 14.5;
    for (let i = this.gibs.length - 1; i >= 0; i -= 1) {
      const g = this.gibs[i];
      g.age += step;
      if (g.age > GIB_BURST.lifeS) {
        if (g.mesh.parent) g.mesh.parent.remove(g.mesh);
        this.gibs.splice(i, 1);
        continue;
      }
      if (g.resting) continue;
      const drag = g.isCloth ? 2.8 : 0.35;
      g.velocity.multiplyScalar(Math.max(0, 1 - drag * step));
      g.velocity.y -= (g.isCloth ? grav * 0.42 : grav) * step;
      g.mesh.position.addScaledVector(g.velocity, step);
      g.mesh.rotation.x += g.angular.x * step;
      g.mesh.rotation.y += g.angular.y * step;
      g.mesh.rotation.z += g.angular.z * step;
      const groundY = (physics?.GroundHeight?.(g.mesh.position.x, g.mesh.position.z) ?? 0) + (g.isCloth ? 0.015 : 0.032);
      if (g.mesh.position.y <= groundY) {
        g.mesh.position.y = groundY;
        if (g.bounced === 0 && !g.isCloth && this.vfx?.bloodEffects?.decals?.Add) {
          TMP_D.set(g.mesh.position.x, groundY - 0.02, g.mesh.position.z);
          this.vfx.bloodEffects.decals.Add(TMP_D, UP, 0.13, {
            now: this.vfx.bloodEffects.time || 0, seed: (i * 0.37) % 1, pool: false, aspect: 1.2, merge: false,
          });
        }
        g.bounced += 1;
        g.velocity.y = Math.abs(g.velocity.y) * (g.isCloth ? 0.08 : 0.24);
        g.velocity.x *= 0.45;
        g.velocity.z *= 0.45;
        g.angular.multiplyScalar(0.32);
        if (g.velocity.lengthSq() < 0.08) {
          g.resting = true;
          if (g.isCloth) { g.mesh.rotation.x = 0; g.mesh.rotation.z = 0; }
        }
      }
    }

    if (this.budget.max !== tuning.maxParts) {
      for (const evicted of this.budget.SetMax(tuning.maxParts)) this._DisposePart(evicted);
    }
  }

  _MayRetire(part, hasView, tuning) {
    if (part.age > tuning.partLifeS * PART_RETIRE.hardLifeScale) return true;
    if (!hasView) return true;
    const at = part.root.position;
    if (at.distanceToSquared(RETIRE_CAMERA_AT) > PART_RETIRE.despawnDistanceM ** 2) return true;
    RETIRE_SPHERE.center.copy(at);
    RETIRE_SPHERE.radius = part.halfLength * 2 + part.radius;
    return !RETIRE_FRUSTUM.intersectsSphere(RETIRE_SPHERE);
  }

  // --- 释放 -----------------------------------------------------------------

  _DisposeHelmet(helmet) {
    if (!helmet) return;
    const idx = this.helmets.indexOf(helmet);
    if (idx >= 0) this.helmets.splice(idx, 1);
    if (helmet.body) this.physics?.RemoveBody?.(helmet.body);
    helmet.body = null;
    if (helmet.root.parent) helmet.root.parent.remove(helmet.root);
    for (const piece of helmet.pieces) piece.geometry.dispose();
  }

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
    if (part.holdsHair && record) {
      part.holdsHair = false;
      this._RestoreHair(record, false);
    }
    if (part.holdsWeapon) {
      part.holdsWeapon = false;
      part.soldier?.actor?.RestoreWeaponFromGore?.(false);
    }
    if (part.spurt) this.vfx?.RemoveBloodSpurt?.(part.spurt);
    if (part.body) this.physics?.RemoveBody?.(part.body);
    part.body = null;
    DisposeCapMesh(part.cap);
    if (part.root.parent) part.root.parent.remove(part.root);
    for (const piece of part.pieces) piece.geometry.dispose();
  }

  ReleaseSoldier(soldier) {
    this.hitHistory.delete(soldier);
    const record = this.records.get(soldier);
    if (!record) return false;
    for (const part of [...record.parts]) this._DisposePart(part);
    for (const h of [...this.helmets]) if (h.soldier === soldier) this._DisposeHelmet(h);
    this._RestoreHair(record, true);
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
      DisposeCapMesh(entry.cap);
    }
    record.caps.length = 0;
    for (const entry of record.meshes) {
      if (!entry.privateGeometry) continue;
      entry.mesh.geometry = entry.source;
      entry.privateGeometry.dispose();
      entry.privateGeometry = null;
    }
    record.limbs.clear();
    record.helmetPopped = false;
    if (record.skin) record.skin.severedHitboxes = null;
    if (record.rig) record.rig.severedHitboxes = null;
    this.records.delete(soldier);
    if (soldier) soldier.gore = null;
    return true;
  }

  ReleaseAll() {
    this.hitHistory = new WeakMap();
    for (const soldier of [...this.records.keys()]) this.ReleaseSoldier(soldier);
    for (const part of [...this.parts]) this._DisposePart(part);
    this.parts.length = 0;
    for (const h of [...this.helmets]) this._DisposeHelmet(h);
    this.helmets.length = 0;
    for (const g of this.gibs) if (g.mesh.parent) g.mesh.parent.remove(g.mesh);
    this.gibs.length = 0;
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
      landCount: part.landCount | 0,
    }));
    const severed = [];
    let caps = 0;
    for (const record of this.records.values()) {
      caps += record.caps.length;
      severed.push({
        soldierId: record.soldier?.id ?? null,
        limbs: [...record.limbs],
        helmetPopped: !!record.helmetPopped,
        sourceTriangles: record.sourceTriangles,
        bodyTriangles: record.bodyTriangles,
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
      helmets: this.helmets.length,
      gibs: this.gibs.length,
      pbrCapsReady: !!stumpAssets,
      severed,
      caps,
      budget: { max: tuning.maxParts, live: this.parts.length },
      spurts: this.vfx?.bloodSpurtCount ?? 0,
    };
  }
}

/**
 * 预计算骨骼蒙皮矩阵的快速烘培：把一段肢体顶点烘成 joint 局部静态几何并压紧 index。
 * 与 Three.js `mesh.applyBoneTransform(i, v)` 数学等价，但将每顶点 4 次骨骼矩阵乘法
 * 提升到骨骼数（65 根）级别，切 8,000 面高精 XBot 头部时 < 1.5 ms，彻底消除卡顿。
 */
function BakePartGeometry(mesh, source, indices, bakeMatrix) {
  const sourcePosition = source.attributes.position;
  const sourceNormal = source.attributes.normal || null;
  const sourceUv = source.attributes.uv || null;
  const sourceColor = source.attributes.color || null;
  const skinIndex = source.attributes.skinIndex;
  const skinWeight = source.attributes.skinWeight;
  const bones = mesh.skeleton?.bones || [];
  const inverses = mesh.skeleton?.boneInverses || [];

  // 预计算 T[b] = bakeMatrix * bindMatrixInverse * bone[b].matrixWorld * boneInverse[b] * bindMatrix
  const pre = TMP_M4_B.copy(bakeMatrix).multiply(mesh.bindMatrixInverse);
  const boneMats = new Array(bones.length);
  for (let b = 0; b < bones.length; b += 1) {
    const m = new THREE.Matrix4().multiplyMatrices(pre, bones[b].matrixWorld);
    m.multiply(inverses[b]).multiply(mesh.bindMatrix);
    boneMats[b] = m.elements;
  }

  const remap = new Map();
  const position = [], normal = [], uv = [], color = [], woundRest = [];
  const packed = new Uint32Array(indices.length);
  const woundSource = source.attributes.woundRestPosition || sourcePosition;

  for (let i = 0; i < indices.length; i += 1) {
    const original = indices[i];
    let mapped = remap.get(original);
    if (mapped === undefined) {
      mapped = remap.size;
      remap.set(original, mapped);
      const vx = sourcePosition.getX(original);
      const vy = sourcePosition.getY(original);
      const vz = sourcePosition.getZ(original);
      const nx = sourceNormal ? sourceNormal.getX(original) : 0;
      const ny = sourceNormal ? sourceNormal.getY(original) : 1;
      const nz = sourceNormal ? sourceNormal.getZ(original) : 0;

      let px = 0, py = 0, pz = 0;
      let rnx = 0, rny = 0, rnz = 0;
      for (let k = 0; k < 4; k += 1) {
        const w = skinWeight.getComponent(original, k);
        if (w <= 0) continue;
        const bi = skinIndex.getComponent(original, k) | 0;
        const e = boneMats[bi];
        if (!e) continue;
        px += w * (e[0] * vx + e[4] * vy + e[8] * vz + e[12]);
        py += w * (e[1] * vx + e[5] * vy + e[9] * vz + e[13]);
        pz += w * (e[2] * vx + e[6] * vy + e[10] * vz + e[14]);
        if (sourceNormal) {
          rnx += w * (e[0] * nx + e[4] * ny + e[8] * nz);
          rny += w * (e[1] * nx + e[5] * ny + e[9] * nz);
          rnz += w * (e[2] * nx + e[6] * ny + e[10] * nz);
        }
      }
      position.push(px, py, pz);
      if (woundSource) woundRest.push(woundSource.getX(original), woundSource.getY(original), woundSource.getZ(original));
      if (sourceNormal) {
        const nlen = Math.hypot(rnx, rny, rnz);
        if (nlen > 1e-8) normal.push(rnx / nlen, rny / nlen, rnz / nlen);
        else normal.push(0, 1, 0);
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
  if (woundRest.length) geometry.setAttribute("woundRestPosition", new THREE.Float32BufferAttribute(woundRest, 3));
  if (normal.length) geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normal, 3));
  if (uv.length) geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  if (color.length) geometry.setAttribute("color", new THREE.Float32BufferAttribute(color, 3));
  geometry.setIndex(new THREE.BufferAttribute(packed, 1));
  if (!normal.length) geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}
