// 卢沟桥来源的十名第三人称士兵：GLB 资产、动画播放器、骨骼挂点与分部位命中体。
//
// 旧的程序化 Actor 仍负责移动/死亡状态机与编辑器的驱动量，但军人可见部分只从
// 这里实例化。每名士兵稳定抽取本阵营五个模型之一；第一人称过场主角固定 Nra01。

import * as THREE from "three";
import { GLTFLoader } from "./vendor/three/examples/jsm/loaders/GLTFLoader.js";
import { clone as CloneSkeleton } from "./vendor/three/examples/jsm/utils/SkeletonUtils.js";
import { RaycastCapsule, RaycastSphere } from "./Script_CharacterHitboxMath.mjs";

export const LUGOU_ANIMATION_IDS = Object.freeze([
  "LeanWallSitPeek", "RifleIdle", "RifleIdleAlt", "RifleRun",
  "CrouchFire", "CrouchFireAlt", "CrouchIdle", "MachineGunFire",
  "EmplacementIdle", "AttackCommand", "ProneFire", "StandFireCrouch",
  "StandFireCrouchAlt", "AdvanceKneelFire", "AdvanceFire", "PistolFire",
]);

export const LUGOU_ANIMATION_LABELS = Object.freeze({
  LeanWallSitPeek: "靠墙坐姿探视",
  RifleIdle: "持枪待机",
  RifleIdleAlt: "持枪待机（二）",
  RifleRun: "持枪跑步",
  CrouchFire: "蹲姿射击",
  CrouchFireAlt: "蹲姿射击（二）",
  CrouchIdle: "蹲姿静态",
  MachineGunFire: "机枪射击",
  EmplacementIdle: "机炮静姿",
  AttackCommand: "进攻指令",
  ProneFire: "匍匐射击",
  StandFireCrouch: "起身射击下蹲",
  StandFireCrouchAlt: "起身射击下蹲（二）",
  AdvanceKneelFire: "上前蹲射",
  AdvanceFire: "上前射击",
  PistolFire: "手枪射击",
});

// 导入动作不能只按 clip 名字认。四类军人都借用同一套短名（例如每边都有
// `RifleIdle`），但实际曲线是按各自阵营的 canonical rig 烘进 GLB 的；把 NRA
// 曲线喂进 IJA，或把机枪兵姿态交给军官，都会让编辑器给出看似能播、实则错误的
// 预览。本表是人物动作编辑器的唯一适用性账本：新导入动作先标清对象，再开放给 UI。
const SOLDIER_ACTION_IDS = Object.freeze([
  "LeanWallSitPeek", "RifleIdle", "RifleIdleAlt", "RifleRun",
  "CrouchFire", "CrouchFireAlt", "CrouchIdle", "MachineGunFire",
  "EmplacementIdle", "ProneFire", "StandFireCrouch", "StandFireCrouchAlt",
  "AdvanceKneelFire", "AdvanceFire",
]);
const OFFICER_ACTION_IDS = Object.freeze([
  "LeanWallSitPeek", "RifleIdle", "RifleIdleAlt", "CrouchIdle",
  "AttackCommand", "PistolFire",
]);

export const LUGOU_ANIMATION_PROFILE_BY_KIND = Object.freeze({
  nra: Object.freeze({ faction: "nra", role: "soldier", label: "国军士兵", clipIds: SOLDIER_ACTION_IDS }),
  nraDare: Object.freeze({ faction: "nra", role: "soldier", label: "国军敢死队", clipIds: SOLDIER_ACTION_IDS }),
  nraOfficer: Object.freeze({ faction: "nra", role: "officer", label: "国军军官", clipIds: OFFICER_ACTION_IDS }),
  ija: Object.freeze({ faction: "ija", role: "soldier", label: "日军士兵", clipIds: SOLDIER_ACTION_IDS }),
  ijaOfficer: Object.freeze({ faction: "ija", role: "officer", label: "日军军官", clipIds: OFFICER_ACTION_IDS }),
});

/** 当前角色可预览的导入动作；条目始终保留阵营与身份，供 UI 标注和校验。 */
export function GetLugouAnimationEntries(kind) {
  const profile = LUGOU_ANIMATION_PROFILE_BY_KIND[kind];
  if (!profile) return [];
  return profile.clipIds.map((clipId) => Object.freeze({
    id: clipId,
    clipId,
    faction: profile.faction,
    role: profile.role,
    targetLabel: profile.label,
    name: LUGOU_ANIMATION_LABELS[clipId] || clipId,
  }));
}

/** 入口防线：即使旧 UI 或脚本直接传 clipId，也不允许越过角色适用范围。 */
export function IsLugouAnimationAllowed(kind, clipId) {
  const profile = LUGOU_ANIMATION_PROFILE_BY_KIND[kind];
  return !!profile && profile.clipIds.includes(clipId);
}

export function DefaultLugouAnimationId(kind) {
  return GetLugouAnimationEntries(kind)[0]?.id || null;
}

const MANIFEST_URL = "./Model/Character/Data_LugouCharacterManifest.json?v=3";
const ASSET_VERSION = "3";
const LOADER = new GLTFLoader();
let loadPromise = null;

function NormalizeName(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function HashString(value) {
  let hash = 2166136261 >>> 0;
  const text = String(value);
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function FindNode(root, name) {
  const wanted = NormalizeName(name);
  let found = null;
  root.traverse((object) => {
    if (!found && NormalizeName(object.name) === wanted) found = object;
  });
  return found;
}

function FactionForKind(kind) {
  if (String(kind).startsWith("ija")) return "ija";
  if (String(kind).startsWith("nra")) return "nra";
  return null;
}

function VersionedUrl(url) {
  return `${url}${url.includes("?") ? "&" : "?"}v=${ASSET_VERSION}`;
}

async function LoadAsset(record) {
  try {
    const gltf = await LOADER.loadAsync(VersionedUrl(record.url));
    return { record, gltf, error: null };
  } catch (error) {
    console.warn(`[CharacterModel] ${record.id} 读取失败：${String(error).slice(0, 180)}`);
    return { record, gltf: null, error: String(error) };
  }
}

export async function LoadLugouCharacterAssets() {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    try {
      const response = await fetch(MANIFEST_URL, { cache: "no-store" });
      if (!response.ok) throw new Error(`manifest HTTP ${response.status}`);
      const manifest = await response.json();
      const loaded = await Promise.all((manifest.models || []).map(LoadAsset));
      const byFaction = { nra: [], ija: [] };
      for (const asset of loaded) {
        if (asset.gltf && byFaction[asset.record.faction]) byFaction[asset.record.faction].push(asset);
      }
      for (const list of Object.values(byFaction)) list.sort((a, b) => a.record.id.localeCompare(b.record.id));
      return {
        manifest,
        byFaction,
        report: {
          requested: loaded.length,
          loaded: loaded.filter((asset) => asset.gltf).length,
          missing: loaded.filter((asset) => !asset.gltf).map((asset) => asset.record.id),
          animations: LUGOU_ANIMATION_IDS.length,
          ready: true,
        },
      };
    } catch (error) {
      console.warn(`[CharacterModel] 角色清单读取失败，军人暂退回程序化模型：${String(error).slice(0, 180)}`);
      return {
        manifest: null,
        byFaction: { nra: [], ija: [] },
        report: { requested: 10, loaded: 0, missing: ["manifest"], animations: 0, ready: true },
      };
    }
  })();
  return loadPromise;
}

// 按 3A 人物碰撞的配置方式写成“部位代理表”：所有尺寸是资产的局部米制，端点
// 只认语义骨骼，运行时再跟随每个模型、每条动画的骨架变换。头不再是一颗挂在
// Head pivot 上的孤球——Max Biped 的 Head pivot 靠近颈根，孤球会吞到胸胶囊里，
// 造成画面上打脸、规则却先返回 torso。现在头是 neck→head 的短胶囊，胸到颈根
// 也独立成一段，二者只在颈部交界，面颅范围不会被躯干覆盖。
export const CHARACTER_HITBOX_PROFILE = Object.freeze([
  { id: "head", type: "capsule", a: "neck", b: "head", radius: 0.115, part: "head", priority: 3 },
  { id: "upperTorso", type: "capsule", a: "chest", b: "neck", radius: 0.135, part: "torso", priority: 1 },
  { id: "lowerTorso", type: "capsule", a: "pelvis", b: "chest", radius: 0.19, part: "torso", priority: 1 },
  { id: "upperArmL", type: "capsule", a: "upperArmL", b: "forearmL", radius: 0.075, part: "limb", priority: 0 },
  { id: "forearmL", type: "capsule", a: "forearmL", b: "handL", radius: 0.060, part: "limb", priority: 0 },
  { id: "upperArmR", type: "capsule", a: "upperArmR", b: "forearmR", radius: 0.075, part: "limb", priority: 0 },
  { id: "forearmR", type: "capsule", a: "forearmR", b: "handR", radius: 0.060, part: "limb", priority: 0 },
  { id: "thighL", type: "capsule", a: "thighL", b: "calfL", radius: 0.10, part: "limb", priority: 0 },
  { id: "calfL", type: "capsule", a: "calfL", b: "footL", radius: 0.075, part: "limb", priority: 0 },
  { id: "thighR", type: "capsule", a: "thighR", b: "calfR", radius: 0.10, part: "limb", priority: 0 },
  { id: "calfR", type: "capsule", a: "calfR", b: "footR", radius: 0.075, part: "limb", priority: 0 },
]);

const WORLD_SCALE = new THREE.Vector3();

/** One independently animated, skeleton-cloned soldier. */
export class LugouCharacterRig {
  constructor(asset, { kind, targetHeight, seed, variantIndex }) {
    this.asset = asset;
    this.kind = kind;
    this.variantIndex = variantIndex;
    this.modelId = asset.record.id;
    this.root = CloneSkeleton(asset.gltf.scene);
    this.root.name = `Rigged_${this.modelId}`;
    this.root.userData.skipNormalDepth = true;
    this.actor = null;
    this.forcedClip = null;
    this.currentId = null;
    this.currentAction = null;
    this.headVisible = true;
    this.disposed = false;

    const sourceHeight = Number(asset.record.bounds?.size?.[2]) || Number(targetHeight) || 1.68;
    this.modelScale = (Number(targetHeight) || sourceHeight) / sourceHeight;
    this.root.scale.setScalar(this.modelScale);

    this.clipById = new Map();
    for (const clip of asset.gltf.animations || []) {
      const normalized = NormalizeName(clip.name);
      // Exact names first: `CrouchFireAlt` contains `CrouchFire`, so a first-substring
      // match silently collapsed every Alt clip onto its shorter sibling.
      const id = LUGOU_ANIMATION_IDS.find((candidate) => normalized === NormalizeName(candidate))
        || [...LUGOU_ANIMATION_IDS]
          .sort((a, b) => b.length - a.length)
          .find((candidate) => normalized.includes(NormalizeName(candidate)));
      if (id && !this.clipById.has(id)) this.clipById.set(id, clip);
    }
    this.mixer = new THREE.AnimationMixer(this.root);
    this.bones = {};
    for (const [role, boneName] of Object.entries(asset.record.boneRoles || {})) {
      const bone = FindNode(this.root, boneName);
      if (bone) this.bones[role] = bone;
    }
    this.sockets = {
      weaponR: FindNode(this.root, "Socket_WeaponR") || this.bones.handR || null,
      weaponL: FindNode(this.root, "Socket_WeaponL") || this.bones.handL || null,
      backBlade: FindNode(this.root, "Socket_BackBlade") || this.bones.chest || null,
      headGear: FindNode(this.root, "Socket_HeadGear") || this.bones.head || null,
    };
    this.hitboxes = CHARACTER_HITBOX_PROFILE.map((definition) => ({
      ...definition,
      center: new THREE.Vector3(),
      start: new THREE.Vector3(),
      end: new THREE.Vector3(),
    }));
    this.root.traverse((object) => {
      if (!object.isMesh) return;
      object.castShadow = true;
      object.receiveShadow = true;
      object.userData.actorOriginalCastShadow = true;
    });
    this.Play("RifleIdle", 0);
    // Stable idle phase: the five source models do not breathe in lockstep.
    this.mixer.setTime((HashString(`${seed}|phase`) % 1000) / 1000);
  }

  Attach(actor) {
    this.actor = actor;
    actor.body.add(this.root);
    // The offline bake recentres the complete skinned model and grounds every
    // animation frame against the actual deformed mesh.  A Biped Foot node is an
    // ankle pivot, not a sole marker; aligning that bone to Y=0 buried both boots.
    // The rig is parented below Actor.body, whose pivot is deliberately at hip
    // height for ragdoll rotation.  Cancel that parent translation so the GLB's
    // audited ground origin still coincides with Actor.root; do not infer another
    // offset from an ankle-height foot bone.
    this.root.position.set(0, -actor.body.position.y, 0);
    actor.root.updateWorldMatrix(true, true);
    return this;
  }

  Play(id, fadeSeconds = 0.12) {
    const clip = this.clipById.get(id) || this.clipById.get("RifleIdle") || this.clipById.values().next().value;
    if (!clip || this.currentId === id) return this;
    const next = this.mixer.clipAction(clip);
    next.enabled = true;
    next.reset().setLoop(THREE.LoopRepeat, Infinity).play();
    if (this.currentAction && fadeSeconds > 0) this.currentAction.crossFadeTo(next, fadeSeconds, true);
    else if (this.currentAction) this.currentAction.stop();
    this.currentAction = next;
    this.currentId = id;
    return this;
  }

  ForceClip(id) {
    this.forcedClip = LUGOU_ANIMATION_IDS.includes(id) ? id : null;
    if (this.forcedClip) this.Play(this.forcedClip, 0.08);
    return this;
  }

  _ActionForState(state) {
    if (this.forcedClip) return this.forcedClip;
    const weaponId = this.actor?.weaponId || "";
    const lifePose = state.lifePose && typeof state.lifePose === "object" ? state.lifePose : state;
    if ((lifePose.sit || 0) > 0.35 || (lifePose.watch || 0) > 0.35) return "LeanWallSitPeek";
    if ((lifePose.cleanRifle || 0) > 0.35 || (lifePose.checkAmmo || 0) > 0.35) return "EmplacementIdle";
    if (state.throwing > 0.08 || state.melee > 0.08 || state.binoculars > 0.08 || state.reach > 0.08) {
      return "AttackCommand";
    }
    if (state.prone > 0.45) return "ProneFire";
    if (state.firing) {
      if (weaponId === "Mauser96") return "PistolFire";
      if (this.actor?.weaponData?.rpm) return "MachineGunFire";
      if (state.crouch > 0.35) return "CrouchFire";
      return "AdvanceFire";
    }
    if (state.crouch > 0.35 || state.kneel > 0.35) return "CrouchIdle";
    if ((state.moveSpeed || 0) > 0.10) return "RifleRun";
    const alternate = HashString(`${this.actor?.seed || this.modelId}|idle`) & 1;
    return alternate ? "RifleIdleAlt" : "RifleIdle";
  }

  Update(dt, state = {}) {
    if (this.disposed) return;
    this.Play(this._ActionForState(state));
    this.mixer.update(Math.max(0, dt));
    // First-person cutscenes place the camera at the eye socket.  The source is
    // one combined SkinnedMesh, so there is no detachable head object; collapse
    // the head bone after mixer evaluation instead.  Doing it before mixer.update
    // would be overwritten by the clip's sampled scale track on the same frame.
    if (!this.headVisible && this.bones.head) this.bones.head.scale.setScalar(0.001);
  }

  SetHeadVisible(visible) {
    const head = this.bones.head;
    this.headVisible = !!visible;
    if (head) head.scale.setScalar(this.headVisible ? 1 : 0.001);
    return this;
  }

  Socket(role) {
    return this.sockets[role] || null;
  }

  GetHitboxes() {
    this.root.updateWorldMatrix(true, true);
    // 判定半径要随 **实际渲染根节点** 缩放。旧实现拿 Actor 的名义身高除以
    // 1.68；但十个 GLB 的源身高不同，且 root 已按各自 sourceHeight 缩过一次，
    // 这会让同一套代理和看见的模型差到数厘米。世界缩放同时覆盖 cutscene 父节点。
    const scale = this.root.getWorldScale(WORLD_SCALE).y || 1;
    const active = [];
    for (const shape of this.hitboxes) {
      shape.worldRadius = shape.radius * scale;
      if (shape.type === "sphere") {
        const bone = this.bones[shape.role];
        if (!bone) continue;
        bone.getWorldPosition(shape.center);
      } else {
        const boneA = this.bones[shape.a];
        const boneB = this.bones[shape.b];
        if (!boneA || !boneB) continue;
        boneA.getWorldPosition(shape.start);
        boneB.getWorldPosition(shape.end);
      }
      active.push(shape);
    }
    return active;
  }

  Raycast(origin, direction, maxDistance) {
    let best = null;
    for (const shape of this.GetHitboxes()) {
      let distance;
      if (shape.type === "sphere") {
        distance = RaycastSphere(origin, direction, shape.center, shape.worldRadius);
      } else {
        distance = RaycastCapsule(origin, direction, shape.start, shape.end, shape.worldRadius);
      }
      if (distance !== null && distance <= maxDistance && (!best
          || distance < best.t - 1e-6
          || (Math.abs(distance - best.t) <= 1e-6 && (shape.priority || 0) > (best.shape.priority || 0)))) {
        best = { t: distance, part: shape.part, shape };
      }
    }
    return best;
  }

  Dispose() {
    if (this.disposed) return;
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.root);
    if (this.root.parent) this.root.parent.remove(this.root);
    this.disposed = true;
  }
}

export function CreateLugouCharacterRig(library, kind, options = {}, targetHeight = 1.68) {
  const faction = FactionForKind(kind);
  if (!faction) return null;
  const variants = library?.byFaction?.[faction] || [];
  if (!variants.length) return null;
  const explicit = Number.isInteger(options.modelVariant) ? options.modelVariant : null;
  const index = options.protagonist && faction === "nra"
    ? 0
    : explicit !== null
      ? ((explicit % variants.length) + variants.length) % variants.length
      : HashString(`${faction}:${options.seed ?? 0}:model`) % variants.length;
  return new LugouCharacterRig(variants[index], {
    kind, targetHeight, seed: options.seed ?? 0, variantIndex: index,
  });
}
