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

// 导入动作不能只按 clip 名字认。四类军人都借用同一套短名（例如每边都有
// `RifleIdle`），但实际曲线是按各自阵营的 canonical rig 烘进 GLB 的；把 NRA
// 曲线喂进 IJA，或把机枪兵姿态交给军官，都会让编辑器给出看似能播、实则错误的
// 预览。本表是人物动作编辑器的唯一适用性账本：新导入动作先标清对象，再开放给 UI。
//
// 【注意这张表管的是「谁能预览什么」，不是「运行时怎么取用」】十套 GLB 每一套
// 都仍带全部 16 条 clip（CharacterModelTest 逐个核对），所以军官在正片里照样
// 播得了 AdvanceFire。运行时的取用一律走下面的 POSE_CLIPS 语义表。
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

// 每方的五套来源模型不是五个等价的步兵皮肤：01—04 是普通士兵，05 是军官。
// 这张表既限制战场随机抽取，也给人物动作编辑器提供可逐个点选的真实名单；否则
// 「步兵」会不小心抽到军官，而编辑器只能靠 seed 碰运气，根本验不了四兵一官。
const SOLDIER_MODEL_VARIANTS = Object.freeze([0, 1, 2, 3]);
const OFFICER_MODEL_VARIANTS = Object.freeze([4]);
export const LUGOU_MODEL_VARIANTS_BY_KIND = Object.freeze({
  nra: SOLDIER_MODEL_VARIANTS,
  nraDare: SOLDIER_MODEL_VARIANTS,
  nraOfficer: OFFICER_MODEL_VARIANTS,
  ija: SOLDIER_MODEL_VARIANTS,
  ijaOfficer: OFFICER_MODEL_VARIANTS,
});

/** 当前身份可用的源模型序号（0-based；对应 Lugou{Faction}01—05）。 */
export function GetLugouCharacterVariantEntries(kind) {
  const profile = LUGOU_ANIMATION_PROFILE_BY_KIND[kind];
  const variants = LUGOU_MODEL_VARIANTS_BY_KIND[kind] || [];
  return variants.map((modelVariant) => Object.freeze({
    modelVariant,
    role: profile?.role || "soldier",
    modelNumber: modelVariant + 1,
    modelId: `${profile?.faction === "ija" ? "LugouIja" : "LugouNra"}${String(modelVariant + 1).padStart(2, "0")}`,
  }));
}

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

/**
 * 编辑器一打开该摆什么姿势。**按语义挑，不按名单顺序挑。**
 *
 * 名单第一条是 `LeanWallSitPeek`（坐在地上）—— 拿它当默认，人物编辑器一打开
 * 就是个坐在地上的人，验不了身高也验不了配枪。这里改成「先要站姿」：
 * 士兵取 POSE_CLIPS.standIdle（AdvanceFire，真站姿据枪），军官名单里没有它，
 * 顺位取 standReach（AttackCommand，站姿挥臂）；两条都不在名单里才落回第一条。
 * 语义来源仍是下面那张 POSE_CLIPS，绝不在这里按 clip 名字硬写。
 */
export function DefaultLugouAnimationId(kind) {
  const entries = GetLugouAnimationEntries(kind);
  if (!entries.length) return null;
  for (const pose of ["standIdle", "standReach", "run"]) {
    const clipId = POSE_CLIPS[pose];
    if (clipId && entries.some((entry) => entry.id === clipId)) return clipId;
  }
  return entries[0].id;
}

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
 *
 * ---------------------------------------------------------------------------
 * 【2026-08-29 合并 master 之后：上面那些数暂时**对不上**，而且不是这张表的错】
 *
 * 清单 v3 那批重烘（master 的 80fac555 / dddd54d9 / ebc9b03b）**把胯的位移轨道
 * 烘没了**。同一台探针在 v3 资产上量下来，十六条 clip 的胯高全是同一个数：
 *
 *   v1（本表依据）  StandFireCrouch 胯 0.02–0.15   AdvanceFire 胯 0.55–0.69
 *   v3（现在的资产）StandFireCrouch 胯 0.85–0.85   AdvanceFire 胯 0.85–0.85
 *                   —— 十六条**全部** 0.846，头最低的一条也有 1.06 m
 *
 * 直接证据在 GLB 里，不用进浏览器也能看：v1 的 `Bip002 Pelvis.position` 逐条
 * clip 都在动（StandFireCrouch 幅度 17.07，LeanWallSitPeek 1.17，AdvanceFire 14.63），
 * v3 里这条轨道**全零**；取而代之的 `GroundRoot.position` 十六条里只有 ProneFire
 * 一条非零。烘焙脚本那一步的贴地补偿是 `max(0.0, -currentGroundZ)` ——
 * 只会把陷进地里的帧往上顶，不会把人往下放，所以「胯被冻在站立高度」这件事
 * 反而让清单里的 maxGroundPenetrationMeters 审计**轻松通过**：
 * 它量的是「有没有陷进地里」，不是「姿势对不对」。
 *
 * 于是现在场上**没有任何一条 clip 能把人放到地上**：救护所里躺担架的四个伤员
 * 头高 1.06–1.13 m（该是 0.1–0.5），跪着的军医头高 1.08 m（该是 0.45–1.0）。
 *
 * **这张表没改、也不该改。** 语义映射本身仍然成立（v1 上逐条量过），
 * 缺的是资产里那条位移轨道 —— 运行时补不回来，只能重烘。把 CutscenePoseTest
 * 的高度带放宽来「修绿」等于把这道闸拆了：那等于承认「趴在担架上的人头可以
 * 在 1.1 m」。所以那条测试现在是红的，红得有据，等重烘。
 * ---------------------------------------------------------------------------
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

const MANIFEST_URL = "./Model/Character/Data_LugouCharacterManifest.json?v=3";
const ASSET_VERSION = "3";
// 完整蒙皮轮廓必须进入 NormalDepth；但远处占屏很小的头、手和零碎附件不值得
// 再为预通道提交一遍。每套模型三角最多的主分件始终保留，近景/编辑器则全部保留。
const NORMAL_DEPTH_DETAIL_MAX_DISTANCE = 4;
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
// 造成画面上打脸、规则却先返回 torso。头部的另一端必须取导出资产的
// Socket_HeadGear（头盔中心），不能取 Bip001 Head 旋转枢轴；否则 kneel 等动作下
// 头胶囊会退化成一小圈脖子，编辑器看起来像“头部碰撞没了”。
export const CHARACTER_HITBOX_PROFILE = Object.freeze([
  { id: "head", type: "capsule", a: "neck", b: "headGear", radius: 0.115, part: "head", priority: 3 },
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
    // 碰撞代理既可引用骨骼，也可引用已烘进 GLB 的稳定挂点。headGear 是头盔中心；
    // 它与 Head pivot 不同，前者才是可见头部的正确端点。
    this.hitboxNodes = { ...this.bones, headGear: this.sockets.headGear };
    this.hitboxes = CHARACTER_HITBOX_PROFILE.map((definition) => ({
      ...definition,
      center: new THREE.Vector3(),
      start: new THREE.Vector3(),
      end: new THREE.Vector3(),
    }));
    const skinnedParts = [];
    this.root.traverse((object) => {
      if (!object.isMesh) return;
      object.castShadow = true;
      object.receiveShadow = true;
      object.userData.actorOriginalCastShadow = true;
      if (object.isSkinnedMesh) {
        const triangles = (object.geometry.index?.count
          || object.geometry.attributes.position?.count || 0) / 3;
        skinnedParts.push({ object, triangles });
      }
    });
    const silhouettePart = skinnedParts.reduce((best, part) =>
      (!best || part.triangles > best.triangles ? part : best), null);
    for (const part of skinnedParts) {
      if (part !== silhouettePart) {
        part.object.userData.normalDepthMaxDistance = NORMAL_DEPTH_DETAIL_MAX_DISTANCE;
      }
    }
    // 出厂姿势按语义取，不按 clip 名取：`RifleIdle` 的名字写着「持枪待机」，
    // 里面却是单膝跪地（见 POSE_CLIPS 头注）。
    this.Play(POSE_CLIPS.standIdle, 0);
    // Stable idle phase: the five source models do not breathe in lockstep.
    // （这个相位以前还要在 Attach 里存下来再放回去，因为那时的贴地标定会临时
    // 拨动 mixer；离线贴地之后 Attach 不再碰时间轴，存不存都一样，就不存了。）
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
    //
    // 【2026-08-29 合并记录】这里曾经有一版「在站姿参考帧上量最低那只脚」的
    // 运行时标定（本分支加的，配一个 FLOOR_CALIBRATION_TIME 常数）。那是给
    // 清单 v1 那批**没有离线贴地**的 GLB 打的补丁；v3 重烘之后每一帧都对着
    // 变形后的网格审过贴地（清单里逐动作记 maxGroundPenetrationMeters ≤ 2 mm），
    // 再在运行时按脚踝骨补一次就是双重矫正，会把靴子埋进地里。整段删掉，
    // 只保留抵消父节点胯高这一项。CharacterModelTest 有一条反向断言看着它。
    this.root.position.set(0, -actor.body.position.y, 0);
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
        const boneA = this.hitboxNodes[shape.a];
        const boneB = this.hitboxNodes[shape.b];
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
  const allowed = LUGOU_MODEL_VARIANTS_BY_KIND[kind] || SOLDIER_MODEL_VARIANTS;
  const explicit = Number.isInteger(options.modelVariant) && allowed.includes(options.modelVariant)
    ? options.modelVariant : null;
  const index = options.protagonist && faction === "nra"
    ? 0
    : explicit !== null
      ? explicit
      : allowed[HashString(`${faction}:${options.seed ?? 0}:model`) % allowed.length];
  return new LugouCharacterRig(variants[index], {
    kind, targetHeight, seed: options.seed ?? 0, variantIndex: index,
  });
}
