// 卢沟桥来源的十名第三人称士兵：GLB 资产、动画播放器、骨骼挂点与分部位命中体。
//
// 旧的程序化 Actor 仍负责移动/死亡状态机与编辑器的驱动量，但军人可见部分只从
// 这里实例化。每名士兵稳定抽取本阵营五个模型之一；第一人称过场主角固定 Nra01。

import * as THREE from "three";
import { GLTFLoader } from "./vendor/three/examples/jsm/loaders/GLTFLoader.js";
import { clone as CloneSkeleton } from "./vendor/three/examples/jsm/utils/SkeletonUtils.js";

export const LUGOU_ANIMATION_IDS = Object.freeze([
  "LeanWallSitPeek", "RifleIdle", "RifleIdleAlt", "RifleRun",
  "CrouchFire", "CrouchFireAlt", "CrouchIdle", "MachineGunFire",
  "EmplacementIdle", "AttackCommand", "ProneFire", "StandFireCrouch",
  "StandFireCrouchAlt", "AdvanceKneelFire", "AdvanceFire", "PistolFire",
]);

// 标签按**实测**写，不按源文件名写：见下面 POSE_CLIPS 的头注，源 FBX 的名字
// 与里面的动作对不上号。名字是资产契约（清单 / 烘焙脚本 / 编辑器三处同名），
// 不改；改的是这里对人说的那句话。带「★」的三条是名实不符、量出来纠正过的。
export const LUGOU_ANIMATION_LABELS = Object.freeze({
  LeanWallSitPeek: "坐地探视",
  RifleIdle: "★单膝跪地据枪（源名写作「持枪待机」，实为跪姿）",
  RifleIdleAlt: "★单膝跪地据枪（二）",
  RifleRun: "持枪跑步",
  CrouchFire: "蹲姿射击",
  CrouchFireAlt: "蹲姿射击（二）",
  CrouchIdle: "跪蹲俯身",
  MachineGunFire: "机枪射击",
  EmplacementIdle: "机炮静姿",
  AttackCommand: "进攻指令（站姿挥臂）",
  ProneFire: "★站姿甩臂过肩（源名写作「匍匐射击」，实为站姿）",
  StandFireCrouch: "★匍匐据枪（源名写作「起身射击下蹲」，实为卧姿）",
  StandFireCrouchAlt: "起身射击下蹲",
  AdvanceKneelFire: "上前蹲射",
  AdvanceFire: "站姿据枪 / 上前射击",
  PistolFire: "手枪射击",
});

/**
 * 姿态 → 导入 clip。**取用一律走这张表，不许在别处按名字硬写 clip id。**
 *
 * 【为什么要这张表】源 FBX 的文件名是按印象起的，与里面的动作对不上号；
 * 运行时按名字挑 clip，于是「卧倒」挑到一段站姿、「站着待机」挑到一段跪姿。
 * 下面这些数是实机量的骨骼世界坐标（演员脚下平面记作 0，模型 1.65 m）：
 *
 *   StandFireCrouch   头 0.22–0.38  胯 0.02–0.15  手 0.18–0.36  → **趴着据枪**（真匍匐）
 *   ProneFire         头 1.15–1.32  胯 0.58–0.74  手 1.6–1.76   → 站着把手臂甩过肩
 *   RifleIdle / Alt   头 0.72–0.78  胯 0.17–0.19                → 单膝跪地据枪
 *   AdvanceFire       头 1.09–1.29  胯 0.55–0.69                → **站姿据枪**（真站着）
 *   AttackCommand     头 1.15–1.28  胯 0.58–0.67                → 站着挥臂指挥
 *   CrouchIdle        头 0.65       胯 0.41                     → 跪蹲俯身
 *   CrouchFire        头 0.62       胯 0.37                     → 蹲姿据枪
 *   LeanWallSitPeek   头 0.52       胯 0.00                     → 坐在地上
 *
 * 回归口在 Script_CutscenePoseTest.mjs：它按这张表逐条量高度，
 * 换一批动作资产（或重烘）把姿态换了位置，那条测试会先红。
 */
const POSE_CLIPS = Object.freeze({
  sit: "LeanWallSitPeek",
  tend: "EmplacementIdle",
  proneFire: "StandFireCrouch",
  crouchFire: "CrouchFire",
  crouchIdle: "CrouchIdle",
  pistolFire: "PistolFire",
  machineGunFire: "MachineGunFire",
  standFire: "AdvanceFire",
  standIdle: "AdvanceFire",
  standReach: "AttackCommand",
  run: "RifleRun",
});

export const LUGOU_POSE_CLIPS = POSE_CLIPS;

/**
 * 地面标定取样时刻：站姿据枪那一段前 1 s 还在跨步，1.4 s 之后两只脚才踩实。
 * Attach 拿这一帧量「最低那只脚离演员地平面多少」，量完把相位放回去。
 */
const FLOOR_CALIBRATION_TIME = 1.6;

const MANIFEST_URL = "./Model/Character/Data_LugouCharacterManifest.json?v=1";
const ASSET_VERSION = "1";
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

const HITBOX_DEFS = Object.freeze([
  { type: "sphere", role: "head", radius: 0.14, part: "head" },
  { type: "capsule", a: "pelvis", b: "chest", radius: 0.20, part: "torso" },
  { type: "capsule", a: "chest", b: "neck", radius: 0.15, part: "torso" },
  { type: "capsule", a: "upperArmL", b: "forearmL", radius: 0.085, part: "limb" },
  { type: "capsule", a: "forearmL", b: "handL", radius: 0.070, part: "limb" },
  { type: "capsule", a: "upperArmR", b: "forearmR", radius: 0.085, part: "limb" },
  { type: "capsule", a: "forearmR", b: "handR", radius: 0.070, part: "limb" },
  { type: "capsule", a: "thighL", b: "calfL", radius: 0.105, part: "limb" },
  { type: "capsule", a: "calfL", b: "footL", radius: 0.085, part: "limb" },
  { type: "capsule", a: "thighR", b: "calfR", radius: 0.105, part: "limb" },
  { type: "capsule", a: "calfR", b: "footR", radius: 0.085, part: "limb" },
]);

const RAY = new THREE.Ray();
const RAY_POINT = new THREE.Vector3();
const SEGMENT_POINT = new THREE.Vector3();
const SPHERE = new THREE.Sphere();
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
    this.hitboxes = HITBOX_DEFS.map((definition) => ({
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
    this.Play(POSE_CLIPS.standIdle, 0);
    // Stable idle phase: the five source models do not breathe in lockstep.
    this.idlePhaseSeconds = (HashString(`${seed}|phase`) % 1000) / 1000;
    this.mixer.setTime(this.idlePhaseSeconds);
  }

  Attach(actor) {
    this.actor = actor;
    actor.body.add(this.root);
    // Max Biped scenes store each soldier at its original five-person lineup offset,
    // and the FBX armature object also carries a small vertical pivot offset.  The
    // mesh bake recentres the bind-pose vertices, but glTF skinning still exposes
    // those armature transforms through the bones.  Align by the animated skeleton
    // itself: pelvis on actor X/Z, lowest idle foot on the actor's ground plane.
    // 【2026-08-29 修正】原注释写的「每个 clip 的胯位移都固定」是错的：实测胯高
    // 在 clip 之间差 0.6 m 以上（匍匐 0.12、站姿据枪 0.69）。所以这一次标定必须
    // 在**指定的站姿参考帧**上量，不能在「构造时碰巧停在哪一帧」上量 —— 否则
    // 同一个人换个 seed（相位不同）就落在不同的地平面上。各姿态自己的胯高由
    // clip 负责，脚一律在 clip 内落到同一个平面，这一项常数补偿因而仍然成立。
    this.root.position.set(0, 0, 0);
    const phase = this.mixer.time;
    this.mixer.setTime(FLOOR_CALIBRATION_TIME);
    actor.root.updateWorldMatrix(true, true);
    const pelvis = this.bones.pelvis?.getWorldPosition(new THREE.Vector3()) || null;
    const footL = this.bones.footL?.getWorldPosition(new THREE.Vector3()) || null;
    const footR = this.bones.footR?.getWorldPosition(new THREE.Vector3()) || null;
    const Local = (point) => (point ? actor.root.worldToLocal(point.clone()) : null);
    const pelvisLocal = Local(pelvis);
    const feet = [Local(footL), Local(footR)].filter(Boolean);
    const floorY = feet.length ? Math.min(...feet.map((point) => point.y)) : 0;
    this.root.position.set(
      -(pelvisLocal?.x || 0),
      -floorY,
      -(pelvisLocal?.z || 0),
    );
    this.mixer.setTime(phase);
    actor.root.updateWorldMatrix(true, true);
    return this;
  }

  Play(id, fadeSeconds = 0.12) {
    const clip = this.clipById.get(id)
      || this.clipById.get(POSE_CLIPS.standIdle)
      || this.clipById.values().next().value;
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

  /**
   * 状态 → clip。**优先级是身体先，手势后**：
   *   躺 ＞ 跪/蹲 ＞ 手上的活（伸手/投弹/白刃/望远镜）＞ 走跑 ＞ 站着待着。
   *
   * 【为什么这个次序是硬的】手势那一档只有站姿素材。原来它排在 prone/crouch
   * 前面，于是「跪着给伤员包扎」「躺在门板上」的人只要带一点 reach 就被换成
   * 站姿挥臂 —— 救护所里三个 prone:1 的伤员全站起来举着手。姿态决定骨架，
   * 手势只能在**姿态允许的范围内**表达；没有对应姿态的手势素材时，宁可不做
   * 手势，也不许把人拉站起来。
   */
  _ActionForState(state) {
    if (this.forcedClip) return this.forcedClip;
    const weaponId = this.actor?.weaponId || "";
    const lifePose = state.lifePose && typeof state.lifePose === "object" ? state.lifePose : state;
    if ((lifePose.sit || 0) > 0.35 || (lifePose.watch || 0) > 0.35) return POSE_CLIPS.sit;
    if ((lifePose.cleanRifle || 0) > 0.35 || (lifePose.checkAmmo || 0) > 0.35) return POSE_CLIPS.tend;
    const prone = (state.prone || 0) > 0.45;
    const low = !prone && ((state.crouch || 0) > 0.35 || (state.kneel || 0) > 0.35);
    if (state.firing) {
      if (weaponId === "Mauser96") return POSE_CLIPS.pistolFire;
      // 机枪手无论卧倒还是蹲着都走机枪那一段（它自带的就是低姿），
      // 这一条比姿态优先 —— 换成匍匐据枪，手里那挺枪就飞了。
      if (this.actor?.weaponData?.rpm) return POSE_CLIPS.machineGunFire;
      if (prone) return POSE_CLIPS.proneFire;
      if (low) return POSE_CLIPS.crouchFire;
      return POSE_CLIPS.standFire;
    }
    if (prone) return POSE_CLIPS.proneFire;
    if (low) return POSE_CLIPS.crouchIdle;
    if (state.throwing > 0.08 || state.melee > 0.08 || state.binoculars > 0.08 || state.reach > 0.08) {
      return POSE_CLIPS.standReach;
    }
    if ((state.moveSpeed || 0) > 0.10) return POSE_CLIPS.run;
    return POSE_CLIPS.standIdle;
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
    const scale = this.actor?.height ? this.actor.height / 1.68
      : this.root.getWorldScale(WORLD_SCALE).y || 1;
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
    RAY.set(origin, direction);
    let best = null;
    for (const shape of this.GetHitboxes()) {
      let distance = null;
      if (shape.type === "sphere") {
        SPHERE.set(shape.center, shape.worldRadius);
        const point = RAY.intersectSphere(SPHERE, RAY_POINT);
        if (point) distance = point.distanceTo(origin);
      } else {
        const distanceSq = RAY.distanceSqToSegment(shape.start, shape.end, RAY_POINT, SEGMENT_POINT);
        if (distanceSq <= shape.worldRadius * shape.worldRadius) {
          distance = Math.max(0, RAY_POINT.distanceTo(origin)
            - Math.sqrt(Math.max(0, shape.worldRadius * shape.worldRadius - distanceSq)));
        }
      }
      if (distance !== null && distance <= maxDistance && (!best || distance < best.t)) {
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
