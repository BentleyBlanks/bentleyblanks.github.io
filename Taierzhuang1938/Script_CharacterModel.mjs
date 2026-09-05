// 卢沟桥来源的十名第三人称士兵：GLB 资产、动画播放器、骨骼挂点与分部位命中体。
//
// 旧的程序化 Actor 仍负责移动/死亡状态机与编辑器的驱动量，但军人可见部分只从
// 这里实例化。每名士兵稳定抽取本阵营五个模型之一；第一人称过场主角固定 Nra01。

import * as THREE from "three";
import { InfantryAnimationController, INFANTRY_ANIMATION_IDS, INFANTRY_ANIMATION_LABELS, INFANTRY_ONCE_IDS } from "./Script_InfantryAnimation.mjs";
import { MeleeAnimationPlayer } from "./Script_MeleeAnimation.mjs";
import { GLTFLoader } from "./vendor/three/examples/jsm/loaders/GLTFLoader.js";
import { clone as CloneSkeleton } from "./vendor/three/examples/jsm/utils/SkeletonUtils.js";
import { RaycastCapsule, RaycastEllipsoid, RaycastSphere } from "./Script_CharacterHitboxMath.mjs";

export const LUGOU_ANIMATION_IDS = Object.freeze([
  "LeanWallSitPeek", "RifleIdle", "RifleIdleAlt", "RifleRun",
  "CrouchFire", "CrouchFireAlt", "CrouchIdle", "MachineGunFire",
  "EmplacementIdle", "AttackCommand", "ProneFire", "StandFireCrouch",
  "StandFireCrouchAlt", "AdvanceKneelFire", "AdvanceFire", "PistolFire",
  // 视频转骨骼（AI 生成实拍 → RTMW3D → _import/Script_MocapRetargetClips.mjs）：
  // 这三条不来自卢沟桥源 FBX，名实一致，不需要语义纠偏。
  "CarryStretcherFront", "CarryStretcherRear", "WoundedLimp",
]);

// 标签按**实测**写，不按源文件名写：见下面 POSE_CLIPS 的头注，源 FBX 的名字
// 与里面的动作对不上号。名字是资产契约（清单 / 烘焙脚本 / 编辑器三处同名），
// 不改；改的是这里对人说的那句话。带「★」的三条是名实不符、量出来纠正过的。
export const LUGOU_ANIMATION_LABELS = Object.freeze({
  LeanWallSitPeek: "坐地探视",
  RifleIdle: "★单膝跪地据枪（源名写作「持枪待机」，实为跪姿）",
  RifleIdleAlt: "★单膝跪地据枪（二）",
  RifleRun: "持枪跑步",
  CrouchFire: "单膝跪姿射击（已校正异常前倾）",
  CrouchFireAlt: "单膝跪姿射击（二，已校正异常前倾）",
  CrouchIdle: "单膝跪姿待机（已校正异常前倾）",
  MachineGunFire: "机枪射击",
  EmplacementIdle: "机炮静姿",
  AttackCommand: "进攻指令（站姿挥臂）",
  ProneFire: "★站姿甩臂过肩（源名写作「匍匐射击」，实为站姿）",
  StandFireCrouch: "★匍匐据枪（源名写作「起身射击下蹲」，实为卧姿）",
  StandFireCrouchAlt: "起身射击下蹲",
  AdvanceKneelFire: "上前蹲射",
  AdvanceFire: "站姿据枪 / 上前射击",
  PistolFire: "手枪射击",
  CarryStretcherFront: "抬担架行走·前位（视频转骨骼）",
  CarryStretcherRear: "抬担架行走·后位（视频转骨骼）",
  WoundedLimp: "伤员跛行（视频转骨骼）",
  ...INFANTRY_ANIMATION_LABELS,
});

// 源 `CrouchIdle` 是一条 5.37 s 的静态坏定格：骨盆到头的轴前倾约 59.4°，
// 双臂垂到地面，枪也随手腕拖在脚边。它不是可用的待机循环。保留原 clip 在 GLB
// 与清单里供源资产审计，但正式播放改走同阵营、同骨架的 `RifleIdle`：同样是单膝
// 跪姿，躯干前倾约 17.6°，双手与枪的关系也完整。别直接删二进制里的原轨道；
// CharacterModelTest 仍要逐条核对 10 套模型 × 16 条源动作。
export const LUGOU_PLAYBACK_CLIP_ALIASES = Object.freeze({
  CrouchIdle: "RifleIdle",
  // 两条蹲射与待机有相同的异常前倾；只修待机会在每次开火时又弯腰垂枪。
  // 共用同骨架的低姿据枪，逐发后坐仍由 Actor 的 fireSequence 驱动。
  CrouchFire: "RifleIdle",
  CrouchFireAlt: "RifleIdleAlt",
});

export function ResolveLugouPlaybackClipId(id) {
  return LUGOU_PLAYBACK_CLIP_ALIASES[id] || id;
}

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
  "CarryStretcherFront", "CarryStretcherRear", "WoundedLimp",
  ...INFANTRY_ANIMATION_IDS,
]);
const IMPORTED_ANIMATION_IDS = [...LUGOU_ANIMATION_IDS, ...INFANTRY_ANIMATION_IDS];
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
    playbackClipId: ResolveLugouPlaybackClipId(clipId),
    corrected: ResolveLugouPlaybackClipId(clipId) !== clipId,
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
 * 下面这些数是实机量的骨骼世界坐标（演员脚下平面记作 0；探针是 nra / seed 41938，
 * 抽到 Nra01、整体缩放 0.898。2026-08-29 补回骨盆位移轨道之后重量了一遍）：
 *
 *   StandFireCrouch   头 0.37–0.51  胯 0.16–0.28  手 0.27–0.48  → **趴着据枪**（真匍匐）
 *   ProneFire         头 1.36       胯 0.82–0.83  手 1.48–1.50  → 站着把手臂甩过肩
 *   RifleIdle / Alt   头 0.86       胯 0.31                     → 单膝跪地据枪
 *   AdvanceFire       头 1.18–1.38  胯 0.69–0.80                → **站姿据枪**（真站着）
 *   AttackCommand     头 1.27–1.34  胯 0.70–0.76                → 站着挥臂指挥
 *   CrouchIdle        头 0.79       胯 0.54                     → 跪蹲俯身
 *   CrouchFire        头 0.76       胯 0.51                     → 蹲姿据枪
 *   LeanWallSitPeek   头 0.66–0.67  胯 0.13–0.14                → 坐在地上
 *   RifleRun          头 1.20–1.26  胯 0.63–0.69                → 持枪跑步
 *
 * 回归口在 Script_CutscenePoseTest.mjs：它按这张表逐条量高度，
 * 换一批动作资产（或重烘）把姿态换了位置，那条测试会先红。
 *
 * ---------------------------------------------------------------------------
 * 【2026-08-29：v3 那批重烘曾经把胯的位移轨道烘丢了 —— 已修，记住是怎么漏的】
 *
 * 清单 v3 的重烘（master 的 dddd54d9 / 80fac555）在 Biped 根骨上方插了一根不蒙皮的
 * `GroundRoot`，把就地化与贴地整体搬到那根骨头上；结果**根骨自己的位移轨道没进
 * GLB**：十六条 clip 的胯高全是同一个数 0.846，头最低的一条也有 1.06 m，
 * 救护所里躺担架的伤员和跪着的军医一屋子人全站着。大腿、锁骨这些非根骨的位移
 * 轨道都还在，丢的只有根骨那一条。
 *
 * 它为什么没被拦住：烘焙侧的贴地补偿是 `max(0, -groundZ)`，**只抬不放**。
 * 人悬在空中永远不会陷进地里，于是清单里 `maxGroundPenetrationMeters ≤ 2 mm`
 * 那条审计轻松通过 —— 它量的是「有没有陷进地里」，不是「姿势对不对」。
 *
 * 修法：源 `.max`/`.bip` 与中间 FBX 都不在机器上，重跑 3ds Max 桥这条路不通；
 * 轨道本身还在仓库里（v1 的 3d1f879b），由 `_import/Script_RestoreLugouPelvisTracks.mjs`
 * 搬回并逐 clip 对回接触深度。**这张表一个字没改**，语义映射本来就是对的。
 * 现在守门的换成了「逐 clip 量骨盆高度、十六条不许挤成一个数」，
 * 而且是 Script_CharacterModelTest 直接读 GLB 量，不再看烘焙自报的数。
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
  // 视频转骨骼一批（2026-09-02 起），名实一致：担架员按前/后位各一条走循环，
  // 伤员跛行给后送队里「能走的轻伤员」。
  carryFront: "CarryStretcherFront",
  carryRear: "CarryStretcherRear",
  woundedWalk: "WoundedLimp",
});

export const LUGOU_POSE_CLIPS = POSE_CLIPS;

/**
 * 把资产的正面接到引擎的正面上 —— 这两条约定差整整 180°。
 *
 * 【两条约定】本项目全线按「**Actor 正面 = 局部 −Z**」写：AI 的
 * `targetYaw = atan2(-dx, -dz)`（Script_Ai）、过场的 ry 口径（Data_Cutscene* 每
 * 张表头上都抄了一遍）、靶场的「ry=0 正对靶道（朝 −Z）」（Data_Range）、程序化
 * 人体的帽檐与帽徽也都摆在 −Z 那一面（Script_Actor.BuildHead）。而这十套 GLB 走
 * 的是 glTF 自己的资产约定 —— **正面朝 +Z**（实测：脚尖、髋骨左右、锁骨全指着
 * +Z，十套模型十九条 clip 一致）。两条都不算错，但一份工程里只能有一条。
 *
 * 【不补这一刀会看见什么】蒙皮模型 2026-08-25 接进来时没人补，于是每个军人都
 * **背对着自己的朝向**：AI 已经转身面向玩家（yaw 是对的），枪口火与曳光按 yaw
 * 从胸口射出，玩家看见的却是后脑勺和背包 —— 「射击朝向和模型朝向错位」说的就是
 * 这个；纵队行军是倒着走的；中弹倒地按 `body.rotation.x` 绕胯翻，前扑变成后仰；
 * 过场里注明「背对镜头看地图」的参谋反而正对镜头。
 *
 * 【为什么修在运行时而不是重烘十个 GLB】清单与离线审计量的全是 Y（骨盆高度、
 * 贴地余量、接触深度），与 yaw 无关，改朝向对它们一个数都不动；而这里是运行时
 * 唯一一处把资产坐标系接到 Actor 契约上的地方，改一行、十套一起对。真到了重烘
 * 把资产正面改成 −Z 的那天，Script_CharacterModelTest 里那条「实测资产朝向 ==
 * 这个补偿角」的断言会先红，提醒把这一行一起删掉。
 */
const MODEL_FORWARD_YAW = Math.PI;

// v4 = 2026-08-29 补回骨盆位移轨道的那批 GLB；v5 = 2026-09-02 视频转骨骼三条
// 新 clip（CarryStretcherFront/Rear、WoundedLimp）。十套模型的二进制都变了，
// 戳不跟着走就会「新壳配旧芯」：清单是新的，浏览器缓存里的 GLB 还是旧的那批。
// NRA eye maps and shoulder silhouettes: keep the manifest and GLBs on one revision.
const MANIFEST_URL = "./Model/Character/Data_LugouCharacterManifest.json?v=202609061026";
const ASSET_VERSION = "202609061026";
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
    let infantry = null;
    if (!record.id.endsWith("05")) {
      try {
        infantry = await LOADER.loadAsync(`./Model/Character/Animation_${record.id}Infantry.glb?v=202609060201`);
      } catch (error) { console.warn("[InfantryAnimation] optional library unavailable", record.id, String(error)); }
    }
    return { record, gltf, infantry, error: null };
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
// 只认语义骨骼，运行时再跟随每个模型、每条动画的骨架变换。
//
// 头部必须用跟随 Head 旋转的独立球，不能拿导出的 Socket_HeadGear 当球心或胶囊
// 端点。Blender 的 BONE-parent 零位空物体落在**骨尾**；这批 Max Biped 的 Head
// 骨尾沿脸部前下方伸出，不在头盔中心。旧版 neck→Socket_HeadGear 胶囊因此压在
// 颈部与下颌，颅顶约十几厘米完全没有命中体。BuildHeadHitCenter 用同一根骨的
// 长度当尺，在 Head 的局部“向上 / 向前”轴上重建真正的颅腔中心。
export const CHARACTER_HITBOX_PROFILE = Object.freeze([
  { id: "head", type: "sphere", role: "headCenter", radius: 0.15, nraWidthScale: 0.8,
    part: "head", priority: 3 },
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
const WORLD_QUATERNION = new THREE.Quaternion();

/**
 * Runtime cranial centre carried by the animated Head bone.
 *
 * `Socket_HeadGear` is still useful as a scale reference: its local distance from Head is
 * the authored head-bone length on every one of the ten models.  Its *direction* is not a
 * cranial direction, though—the Biped bone tail points through the face.  In the exported
 * Head frame +X is anatomical up and +Y is forward.  Ratios were measured against vertices
 * whose dominant skin weight is Head across all ten shipped GLBs, so the same proxy covers
 * caps, helmets and bare heads without baking a second per-model collision manifest.
 */
function BuildHeadHitCenter(head, headGear) {
  if (!head) return null;
  const authoredLength = headGear && headGear !== head && headGear.parent === head
    ? headGear.position.length() : 0;
  if (!(authoredLength > 1e-6)) return head;
  const center = new THREE.Object3D();
  center.name = "RuntimeHitbox_HeadCenter";
  center.position.set(authoredLength * 0.52, authoredLength * 0.14, 0);
  head.add(center);
  return center;
}

/**
 * Build the grip point carried by the authored fingers, not by Blender's BONE-parent tail.
 *
 * A zero-location object parented to a Blender bone exports at that bone's tail.  Max Biped
 * hand tails do not point into the palm: on the Lugou rigs they sit 8-10 cm away from the
 * four finger roots.  The old Socket_WeaponL/R empties therefore preserved animation, but
 * described empty air beside it.  Finger1..4 are the four knuckles and are direct children
 * of the hand on every source rig; their centroid is the stable, animated palm grip.
 */
function BuildHandGrip(hand, side, fallback) {
  if (!hand) return fallback || null;
  const suffixes = new Set([1, 2, 3, 4].map((index) => `${side}finger${index}`));
  const knuckles = hand.children.filter((child) => child.isBone
    && [...suffixes].some((suffix) => NormalizeName(child.name).endsWith(suffix)));
  if (knuckles.length !== 4) return fallback || hand;
  const grip = new THREE.Object3D();
  grip.name = `RuntimeGrip_Weapon${side === "r" ? "R" : "L"}`;
  for (const knuckle of knuckles) grip.position.add(knuckle.position);
  grip.position.multiplyScalar(1 / knuckles.length);
  grip.userData.gripSource = "fingerRootCentroid";
  hand.add(grip);
  return grip;
}

/** One independently animated, skeleton-cloned soldier. */
export class LugouCharacterRig {
  constructor(asset, { kind, targetHeight, seed, variantIndex, materialLibrary = null }) {
    this.asset = asset;
    this.kind = kind;
    this.variantIndex = variantIndex;
    this.modelId = asset.record.id;
    this.root = CloneSkeleton(asset.gltf.scene);
    this.root.name = `Rigged_${this.modelId}`;
    this.actor = null;
    this.forcedClip = null;
    this.currentId = null;
    this.currentPlaybackId = null;
    this.currentAction = null;
    this.headVisible = true;
    this.disposed = false;

    const sourceHeight = Number(asset.record.bounds?.size?.[2]) || Number(targetHeight) || 1.68;
    this.modelScale = (Number(targetHeight) || sourceHeight) / sourceHeight;
    this.root.scale.setScalar(this.modelScale);
    // 资产正面 +Z → Actor 契约的正面 −Z。写在 root 上（不是 Attach 里）：挂点、
    // 命中体、远景合批烘焙都读世界矩阵，转了 root 它们自己就跟着对；Attach 只补
    // 一个 Y 位移，绕 Y 转不影响它。见上面 MODEL_FORWARD_YAW 的头注。
    this.root.rotation.y = MODEL_FORWARD_YAW;

    this.infantryProps = {};
    for (const role of ["Rifle", "Grenade"]) {
      const source = asset.infantry?.scene.getObjectByName(`Infantry${role}`);
      if (source) {
        const helper = source.clone(false);
        this.root.add(helper); this.infantryProps[role.toLowerCase()] = helper;
      }
    }
    this.infantry = new InfantryAnimationController(this);
    this.clipById = new Map();
    for (const clip of [...(asset.gltf.animations || []), ...(asset.infantry?.animations || [])]) {
      const normalized = NormalizeName(clip.name);
      // Exact names first: `CrouchFireAlt` contains `CrouchFire`, so a first-substring
      // match silently collapsed every Alt clip onto its shorter sibling.
      const id = IMPORTED_ANIMATION_IDS.find((candidate) => normalized === NormalizeName(candidate))
        || [...IMPORTED_ANIMATION_IDS]
          .sort((a, b) => b.length - a.length)
          .find((candidate) => normalized.includes(NormalizeName(candidate)));
      if (id && !this.clipById.has(id)) this.clipById.set(id, clip);
    }
    this.mixer = new THREE.AnimationMixer(this.root);
    this.infantryPropTracks = new Map((asset.infantry?.animations || []).map(clip => [clip.name,
      clip.tracks.filter(track => /^Infantry(Rifle|Grenade)\./.test(track.name)).map(track => ({
        role: track.name.startsWith("InfantryRifle") ? "rifle" : "grenade",
        property: track.name.split(".").at(-1), sample: track.createInterpolant(),
      }))]));
    this.infantryPropWeight = 0;
    this.bones = {};
    for (const [role, boneName] of Object.entries(asset.record.boneRoles || {})) {
      const bone = FindNode(this.root, boneName);
      if (bone) this.bones[role] = bone;
    }
    // Rigid carried equipment is parented to its authored bone in the GLB.
    this.sockets = {
      weaponR: FindNode(this.root, "Socket_WeaponR") || this.bones.handR || null,
      weaponL: FindNode(this.root, "Socket_WeaponL") || this.bones.handL || null,
      backBlade: FindNode(this.root, "Socket_BackBlade") || this.bones.chest || null,
      headGear: FindNode(this.root, "Socket_HeadGear") || this.bones.head || null,
    };
    this.grips = {
      weaponR: BuildHandGrip(this.bones.handR, "r", this.sockets.weaponR),
      weaponL: BuildHandGrip(this.bones.handL, "l", this.sockets.weaponL),
    };
    // Socket_HeadGear 是骨尾，不是头盔中心；只拿它的长度作尺，方向由 Head 自己给。
    const headCenter = BuildHeadHitCenter(this.bones.head, this.sockets.headGear);
    this.hitboxNodes = { ...this.bones, headCenter };
    this.meleeAnimation = new MeleeAnimationPlayer(this.root, kind);
    this.hitboxes = CHARACTER_HITBOX_PROFILE.map((definition) => {
      const isNraHead = definition.id === "head" && String(kind).startsWith("nra");
      return {
        ...definition,
        type: isNraHead ? "ellipsoid" : definition.type,
        localRadii: isNraHead ? new THREE.Vector3(
          definition.radius,
          definition.radius,
          definition.radius * definition.nraWidthScale,
        ) : null,
        worldRadii: new THREE.Vector3(),
        worldAxes: {
          x: new THREE.Vector3(),
          y: new THREE.Vector3(),
          z: new THREE.Vector3(),
        },
        center: new THREE.Vector3(),
        start: new THREE.Vector3(),
        end: new THREE.Vector3(),
      };
    });
    const skinnedParts = [];
    this.infantryGroundProbes = [];
    this.root.traverse((object) => {
      if (!object.isMesh) return;
      // 枪械稍后才会挂进骨骼插槽；保留这个边界标记，让诊断与测试只审计
      // GLB 人体表面，不能把本来就该有金属度的武器误判为人物材质回归。
      object.userData.characterPbrSurface = true;
      // GLB 材质不能绕过主材质库：glTF 缺省 metalness=1 会把军装/皮肤渲成黑金属，
      // 且没注入的材质在 Debug Rendering 的 BaseColor/粗糙度/金属度/阴影/光照
      // 视图里仍画最终颜色。十套角色材质由加载器缓存共享，ConfigureExternalPbr
      // 内部幂等，只会给同一材质挂一次统一 shader 钩子。
      materialLibrary?.ConfigureExternalPbr?.(object.material, {
        metalness: 0,
        minRoughness: 0.58,
      });
      object.castShadow = true;
      object.receiveShadow = true;
      object.userData.actorOriginalCastShadow = true;
      if (object.isSkinnedMesh) {
        const indices = object.geometry.attributes.skinIndex, weights = object.geometry.attributes.skinWeight;
        const vertices = [];
        for (let i = 0; i < indices.count; i++) {
          let influence = 0;
          for (let k = 0; k < 4; k++) {
            const bone = object.skeleton.bones[indices.getComponent(i, k)];
            if (/Thigh|Calf|Foot|Toe/.test(bone?.name || "")) influence += weights.getComponent(i, k);
          }
          if (influence > .5) vertices.push(i);
        }
        this.infantryGroundProbes.push({ mesh: object, vertices });
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
    // 运行时标定（本分支加的，配一个 FLOOR_CALIBRATION_TIME 常数）。Biped 的 Foot
    // 是**脚踝枢轴**不是鞋底，把它对到 Y=0 等于把每个人往下压约 0.115 m，靴子直接
    // 埋进地里；而离线烘焙已经逐帧对着变形后的网格摆好了每条 clip 的接触面
    // （清单逐动作记 pelvisHeightMeters / maxGroundPenetrationMeters），运行时再按
    // 脚踝补一次就是双重矫正。整段删掉，只保留抵消父节点胯高这一项。
    // CharacterModelTest 有一条反向断言看着它。
    this.root.position.set(0, -actor.body.position.y, 0);
    actor.root.updateWorldMatrix(true, true);
    return this;
  }

  Play(id, fadeSeconds = 0.12) {
    const playbackId = ResolveLugouPlaybackClipId(id);
    const clip = this.clipById.get(playbackId)
      || this.clipById.get(POSE_CLIPS.standIdle)
      || this.clipById.values().next().value;
    if (!clip) return this;
    // 蹲姿待机/开火共用一个有效 clip，不能把同一个 AnimationAction 与自己交叉淡入。
    if (this.currentAction?.isScheduled() && this.currentPlaybackId === playbackId) {
      this.currentId = id; return this;
    }
    const next = this.mixer.clipAction(clip);
    next.enabled = true;
    const once = INFANTRY_ONCE_IDS.includes(playbackId);
    next.reset().setEffectiveWeight(1).setEffectiveTimeScale(1);
    next.clampWhenFinished = once;
    next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity).play();
    if ((playbackId === "KneelToStand" && this.currentId === "StandToKneel")
        || (playbackId === "StandToKneel" && this.currentId === "KneelToStand")) {
      next.time = (1 - this.currentAction.time / this.currentAction.getClip().duration) * clip.duration;
    }
    if (this.currentAction && fadeSeconds > 0) this.currentAction.crossFadeTo(next, fadeSeconds, false);
    else if (this.currentAction) this.currentAction.stop();
    this.currentAction = next;
    this.currentId = id;
    this.currentPlaybackId = playbackId;
    return this;
  }

  ForceClip(id) {
    const forced = IMPORTED_ANIMATION_IDS.includes(id) ? id : null;
    if (forced === this.forcedClip) return this;
    this.forcedClip = forced;
    this.infantry.Cancel();
    if (this.forcedClip) {
      if (this.currentId === id && INFANTRY_ONCE_IDS.includes(id)) {
        this.currentAction?.stop(); this.currentAction = null;
      }
      this.Play(this.forcedClip, 0.08);
    }
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
    // 抬担架决定整具骨架（双手都钉在杆上），排在开火/姿态之前：担架员不开火、
    // 不卧倒 —— 中弹走的是 Actor 的死亡链，不经过这里。停着不放手，原地踏步
    // 比松手立正好看（担架还在两人手里）。
    if (state.carryRole === "front") return POSE_CLIPS.carryFront;
    if (state.carryRole === "rear") return POSE_CLIPS.carryRear;
    const prone = (state.prone || 0) > 0.45;
    const low = !prone && ((state.crouch || 0) > 0.35 || (state.kneel || 0) > 0.35);
    const infantryAllowed = this.CanPlayInfantry() && !state.meleeCombat
      && !(state.melee > .08 || state.binoculars > .08 || state.reach > .08)
      && !(state.woundedWalk > .5) && !state.dead && !this.actor?.ragdollState && state.grounded !== false;
    if (!prone && infantryAllowed) {
      const selected = this.infantry.Select(low, (state.moveSpeed || 0) > .10);
      if (selected) return selected;
    } else this.infantry.Cancel();
    if (state.firing) {
      if (this.actor?.weaponData?.kind === "pistol") return POSE_CLIPS.pistolFire;
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
    // 轻伤员：走动时跛行；站定回普通站姿（跛行是步态素材，原地播像踏步）。
    if ((state.woundedWalk || 0) > 0.5 && (state.moveSpeed || 0) > 0.10) return POSE_CLIPS.woundedWalk;
    if ((state.moveSpeed || 0) > 0.10) return POSE_CLIPS.run;
    return POSE_CLIPS.standIdle;
  }

  CanPlayInfantry() {
    return !!this.asset.infantry && ["ZhongZheng", "Type38", "HanYang"].includes(this.actor?.weaponId);
  }

  _SampleInfantryProps() {
    let total = 0;
    for (const id of INFANTRY_ANIMATION_IDS) {
      const clip = this.clipById.get(id);
      const action = clip && this.mixer.existingAction(clip);
      const weight = action?.isScheduled() ? action.getEffectiveWeight() : 0;
      if (!(weight > 0)) continue;
      const alpha = weight / (total + weight);
      for (const track of this.infantryPropTracks.get(id) || []) {
        const helper = this.infantryProps[track.role], value = track.sample.evaluate(action.time);
        if (track.property === "quaternion") {
          WORLD_QUATERNION.fromArray(value);
          if (!total) helper.quaternion.copy(WORLD_QUATERNION);
          else helper.quaternion.slerp(WORLD_QUATERNION, alpha);
        } else {
          WORLD_SCALE.fromArray(value);
          if (!total) helper[track.property].copy(WORLD_SCALE);
          else helper[track.property].lerp(WORLD_SCALE, alpha);
        }
      }
      total += weight;
    }
    this.infantryPropWeight = Math.min(1, total);
  }

  _GroundInfantryBlend(state) {
    if (state.dead || this.actor?.ragdollState || state.meleeCombat) return;
    const weight = this.currentAction.getEffectiveWeight();
    const standing = this.CanPlayInfantry() && this.currentId === POSE_CLIPS.standIdle && weight >= .99999;
    if (standing) {
      const curve = this.asset.infantry.scene.userData.infantryStandFloor;
      if (!curve) return;
      const at = this.currentAction.time * curve.fps, lo = Math.min(Math.floor(at), curve.values.length - 1);
      const hi = Math.min(lo + 1, curve.values.length - 1);
      const floor = curve.values[lo] + (curve.values[hi] - curve.values[lo]) * (at - lo);
      this.infantryFloorOffset = Math.max(0, .003 - floor) * this.modelScale;
      this.root.position.y += this.infantryFloorOffset;
      return;
    }
    if (!(this.infantryPropWeight > 0) || weight >= .99999) return;
    this.root.updateWorldMatrix(true, true);
    // SkinnedMesh refreshes bindMatrixInverse in updateMatrixWorld, not updateWorldMatrix.
    // CPU contact sampling must use this frame's bind inverse, just as the renderer does.
    this.root.updateMatrixWorld(true);
    const inverse = new THREE.Matrix4().copy(this.root.matrixWorld).invert();
    const point = new THREE.Vector3(), transform = new THREE.Matrix4();
    let floor = Infinity;
    for (const { mesh, vertices } of this.infantryGroundProbes) {
      mesh.skeleton.update(); transform.multiplyMatrices(inverse, mesh.matrixWorld);
      for (const index of vertices) {
        mesh.getVertexPosition(index, point).applyMatrix4(transform);
        floor = Math.min(floor, point.y);
      }
    }
    // Local-rotation crossfades can intersect the floor although both baked clips are grounded.
    // Correct only those few blended frames, against visible leg surfaces, never ankle pivots.
    this.infantryFloorOffset = Math.max(0, .003 - floor) * this.modelScale;
    this.root.position.y += this.infantryFloorOffset;
  }

  Update(dt, state = {}) {
    if (this.disposed) return;
    this.root.position.y -= this.infantryFloorOffset || 0;
    this.infantryFloorOffset = 0;
    this.meleeAnimation?.Restore();
    this.infantry.BeginFrame(state);
    const previousId = this.currentId, previousTime = this.currentAction?.time || 0;
    const nextId = this._ActionForState(state);
    this.Play(nextId);
    if (nextId === "RifleCrouchAdvance" && !this.forcedClip) {
      const speed = Number.isFinite(state.moveSpeedMps) ? state.moveSpeedMps : (state.moveSpeed || 0) * 3.6;
      const sourceSpeed = this.kind.startsWith("ija") ? .23864468053263868 : .2554529916490837;
      this.root.updateWorldMatrix(true, false);
      const scale = this.root.getWorldScale(WORLD_SCALE).y;
      this.currentAction.setEffectiveTimeScale(Math.max(0, speed) / (sourceSpeed * scale));
    }
    this.mixer.update(Math.max(0, dt));
    // Missing prop tracks in the legacy clips must not fade a rifle towards the scene origin.
    // Sample the authored prop poses at normalized weights; Actor blends with its live hand grip.
    this._SampleInfantryProps();
    this.infantry.AfterUpdate(previousId, previousTime);
    this.meleeAnimation?.Apply(state.meleeCombat);
    this._GroundInfantryBlend(state);
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

  Grip(role) {
    return this.grips[role] || this.Socket(role);
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
      if (shape.type === "sphere" || shape.type === "ellipsoid") {
        const node = this.hitboxNodes[shape.role];
        if (!node) continue;
        node.getWorldPosition(shape.center);
        if (shape.type === "ellipsoid") {
          shape.worldRadii.copy(shape.localRadii).multiplyScalar(scale);
          node.getWorldQuaternion(WORLD_QUATERNION);
          shape.worldAxes.x.set(1, 0, 0).applyQuaternion(WORLD_QUATERNION);
          shape.worldAxes.y.set(0, 1, 0).applyQuaternion(WORLD_QUATERNION);
          shape.worldAxes.z.set(0, 0, 1).applyQuaternion(WORLD_QUATERNION);
        }
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
      if (shape.type === "ellipsoid") {
        distance = RaycastEllipsoid(origin, direction, shape.center, shape.worldRadii, shape.worldAxes);
      } else if (shape.type === "sphere") {
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

export function CreateLugouCharacterRig(
  library, kind, options = {}, targetHeight = 1.68, materialLibrary = null,
) {
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
    kind, targetHeight, seed: options.seed ?? 0, variantIndex: index, materialLibrary,
  });
}
