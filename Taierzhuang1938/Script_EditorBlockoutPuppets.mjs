// 白盒关卡编辑器的独立演员（docs/Data_EditorBlockout.md §5.6）。
//
// 只看布设：演员**不进 ai.soldiers**（不吃子弹、不挡人、不进 AI），位置、朝向、姿态
// 全由关键帧数据决定。人用 actorFactory 造的正式人物（动作库、步态照旧），战车 / 担架 /
// 车 / 牲口是简单体块。关键帧之间的移动按 PlanTransition 的计划走（SampleTransition 取样），
// 整段太长时按 playbackRate 快进，人物动画用同一个倍率。
//
// 距离分级：60 m 外每 3 帧才推一次动画（累计 dt），影子只在 25 m 内开；一关同时最多
// 120 个人物，超出时远处的只留地环与标签（标记层照画），并报一次警告。
//
// 2026-10-18：
//   · 单位带 castId（§3）时用定妆身体（Data_FirstLevelSpeakingCast.SpeakingCastOptions：固定模型号 + 面部蒙皮，
//     种子按 castId 定、不从对象池拿），同一个人每一帧一个样子；没有 castId 照旧按 id 出种子。
//   · 战车按车身脚印（中心、四角、四边中点）里**最高**的地面放：原来只取中心一点，停在沟口时整辆车掉进沟底。
//   · 预演（§14）的外部驱动：Drive(id, 状态) 每帧摆位 / 姿态 / 动作片段（开场动作库）/ 可见；Spawn(unit) 临时加人；
//     ReleaseDrive() 交还（临时加的人回收，其余等总控 Apply 关键帧布设）。
//   · 蹲姿：NRA 步枪兵「蹲着待着」原来被友军步态换成 AllyCrouchCarryStand（扛枪半蹲，骨盆 0.66 m，看着像站着），
//     蹲 / 卧的人一律当戒备（missionCombatAlert），落到原生 KneelHold / CrouchIdle。
//   · 只在要它的关卡才下载的定妆模型（翻译的 NRA06，manifest loadOnDemand）：PrepareCasts(units) 先下完再造人，
//     否则出来的是方块占位人；翻译不拿枪、走「空手」步态（同开场导演的 unarmed）。
//   · 倒地（state:"down"）的人放在身体投影范围（中心 ± 0.9 m）里最低的地面上：斜坡上不再斜着悬在半空（宁可略埋进坡里）。
//   · 倒地的人移动（关键帧过渡、预演里拖单被 / 抬担架）时**只平移**：保持躺姿，不播走路、不起身（原来一「走动」就不算倒地，
//     会站起来走）。单位 / 预演键可选 lie:"along"：身体顺着朝向躺、头朝 yawDeg 的前方、骨盆落在单位位置上
//     （倒地姿态是按种子抽的死亡片段，头朝哪边不固定：落定后量一次头相对骨盆在人物本地的方向，再把整个人转过去）。
//     不写 lie = 原来的样子（身子横在朝向两侧，已有数据不变）。
//   · 武器：预演键 weapon（阶跃）调 actor.SetWeapon 换手里的家伙（大刀 Dadao 同开场 01–02 罗班长的挂法：SetWeapon("Dadao")
//     挂在右手武器挂点上，片段 LuoDadaoChopRear 驱动手）；没写过 = 造人时那把，交还驱动时换回去。关键帧之间武器换了
//     （都不是空手）就地 SetWeapon，不再整个重造。手里是近战家伙（大刀）、站着不动、没在播片段时摆原生白刃戒备
//     （meleeCombat Guard，同开场导演的 meleeGuard），不再端着大刀摆步枪据枪姿势。
//   · 2026-10-18 第三轮：预演键 throw（Script_EditorBlockoutPrevizPlan.PREVIZ_THROW）→ 播步兵投弹片段 GrenadeThrow（「背枪投弹」，
//     游戏里 BeginGrenadeThrow / AI 齐投同一个片段）：ForceClip 定住片段，片段时间按 drive.throw.seconds 直接设（Seek 确定），
//     手里的手榴弹由 Actor._UpdateInfantryProps 照游戏原样挂在片段的 grenade 挂点上、脱手帧后藏掉；飞出去的那颗由预演自己画。
//     骨架上没有这个片段 → 记进 missingClips，照原生动画。
//   · Probe 多给头 / 骨盆的世界高度（headY / pelvisY）、两脚的世界坐标（feet）与倒地片段（deathVariant），量桥下净空、被子范围用。
//
// 2026-10-19（白盒预演补齐，运行时包）：
//   · 百姓 / 小孩（kind civilian / child、side civ）默认换成**能放动作库片段的骨骼身体**：用 NRA 士兵的骨架身体（TengxianNra02，
//     预演额外动作库都烘在它上面、五具骨架骨名一致所以哪具都能播）、不拿武器、走空手步态，外观改成能一眼认出是老百姓：
//     军装布换成百姓的深蓝 / 黑 / 土布色（Create 的 uniformPalette 直接给十六进制色，Script_UniformColors 认数字）、
//     帽徽 / 腰间枪套 / 胸前那条带子藏掉（CIVILIAN_RIG_LOOK.hideMaterials，按材质名）。军帽本身与军装是同一个网格、同一张图集，
//     摘不掉——占位接受。child 照旧整体缩到 0.62。只在白盒编辑器里当占位（不进 Data_CharacterSelection、不影响游戏正片）。
//     旧的程序化 tzm 身体留作开关：单位 / 预演 spawn 写 `body: "procedural"`（§3）；缺省 `body: "rig"`（BLOCKOUT_PUPPETS.civilianBody）。
//   · 军官（nraOfficer / ijaOfficer）本来就是骨骼身体（NRA05 / IJA01），片段并进它们的骨架后照样能播，运行时不拦。
//   · Probe 再多给 body（"rig" / "procedural"）、rigged、两手的世界坐标（handR / handL）、mixerTime（量慢动作里动画是不是真慢了）。
//   · lie:"along" 摆法改成「头、骨盆、两脚」的包围框中心落在单位位置上、身体轴取骨盆→头 ±8° 里最窄的方向，倒地片段固定用
//     腿蜷得最窄的 DeathCollapseC（LIE_DEATH_VARIANT）；倒着的人换成 lie:"along" 时重造一次。冬瓜在 0.7 m 宽的单被上不再伸出一只脚。
//
// 2026-10-20（挂到车上，§3 / §5.6 ride）：
//   · 单位 / 预演键 ride = { on, x, z, y, yawDeg }：这个人（或担架）每帧的位姿 = 车（cart / tank / litter）当前位姿 ∘ 本地偏移，
//     不贴地、不走路（位置键不管用，Drive 时报一次警告），片段照播（坐、抖、趴）。车的位姿从车那个 puppet 自己的状态算
//     （_CarrierPose，不读它的 three 对象，所以先摆谁都一样）。挂着的担架平放（不按 LitterPose 抬 / 斜）。
//   · 车的尺寸实测写成 BLOCKOUT_CART_SEATS：车板顶 1.025 m（车板 0.55 厚、中心 0.75）、车尾在本地 z = +1.2；坐车尾的人
//     y = 车板顶 − 片段坐高 × 缩放（VilSitEdge 坐高 0.90，小孩 0.62 → 1.025 − 0.558 = 0.467）。Probe 多给 ride / seat。
//
// 2026-10-20（换正式模型，用户：白盒里的战车、飞机、树、牛车马车都直接用项目里已有的正式模型 + 动画）：
//   · 战车 = 游戏里那辆八九式（actorFactory.ModelInstance("Type89Tank")，材质照 MissionView.BuildTank 从 library 取，
//     开机就预读了）；炮塔转向射界扇的方向（unit.arc.yawDeg），车身摆法不变（脚印最高点）。
//   · 车 = 撤运牛车 / 驴车用的 Model_WoodenEvacCart + Model_WorkingOx / Model_WorkingHorse（Script_DraftCartModel，
//     带 Walk 动画，按走过的路程推：一个步幅一圈，不滑步，车轮跟着转）。牲口：unit.draft（"ox" / "horse"），
//     没写时名字带「牛」用牛、其余用马（驴车照游戏里老耿的车用马）；animal:false 不带牲口；车前 4 m 内另有一个 animal
//     单位（老耿的黑子）时车自己的牲口藏起来，不叠两匹。单独的 animal 单位 = 只有那匹马；倒地（state down）侧躺、不迈腿。
//   · 模型异步下载：下完之前照旧是体块，下完那一帧换掉（体块藏起，不删）；模型载不进来就一直是体块。
//     组上标 whiteboxCharacter：白盒画质里也保留贴图（同预演的飞机）。
//
// 2026-10-20（不打仗时不端枪，用户：下蹲、跑步、聊天这类大部分动作不会把枪拿在手上）：
//   · 拿步枪（BLOCKOUT_PUPPETS.slungWeapons）、此刻不戒备（aim 为假）的兵，国军日军一样：站着 / 走 / 跑换游戏里的
//     背枪步态（Script_RelaxedGait "slung"：RelaxedStand / RelaxedWalk / BackRifleRun，枪挂在背上）；蹲着不动、没在播片段时
//     播 PvCrouchRestRifle（单膝跪、枪竖在身前歇着，动作库下完才有，之前照原生蹲姿）。aim 为真照旧端枪（国军友军步态、
//     日军原生）；拿机枪 / 掷弹筒 / 大刀的、不戒备的日军步枪兵以外的人照旧。蹲着走、趴着、爬照旧端枪（没有空手的现成片段）。
//   · 预演片段：PvStandTalkLowRifle（右手提枪说话）换成同一套的背枪版 PvStandTalkSlung（PREVIZ_CLIP_REMAP）；
//     卧倒抱头 VilDuckProne 加进背枪表（Data_BlockoutPrevizClips.PREVIZ_WEAPON_SLUNG）。
//   · Probe 多给 gait（背枪步态的模式）、rifleInHand / rifleOnBack。
//
// 2026-10-21（担架也用正式资产，用户）：担架 = 全游戏同一副竹竿布兜担架（Script_StretcherAsset，Model_BambooStretcher.glb，
//   开机就读进来了；没读到时先画体块、读到了再换）。挂在担架组（bed）下面，所以抬着 / 一头着地 / 放地上 / 挂车上的高度与倾角
//   照旧由 LitterPose / ride 摆。资产自己的坐标：+Z 朝前头抬的人、竿心 y = 0.12、竿长 2.15 m；白盒的前头在本地 −Z，
//   所以转 180°，并往下挪 0.09 m 让竿心落在体块竿子原来的高度（担架组原点 + 0.03）。几何与材质全场共用一份，拆的时候不拆。
//   名字带「被」不带「担架」的 litter（01–05 两人拖的单被）不是担架：换成上传的五补丁单被（Script_EditorBlockoutBlanket，
//   Model_SingleBlanket.glb，宽 1.4 m、长 1.9 m），头端朝前（单位朝向，拽的人在这头），平铺贴地；被拖着走（moving）时
//   渐变到资产自带的拖拽姿势（头端两角抬到 0.7 m、两侧兜起、尾端贴地），停下渐变回平铺。
//
// 2026-10-21（倒地的人扶得起来）：关键帧里倒着（state down）的人，预演键写 state:"alive" 原来不起身 —— 倒地在 Actor 里是
//   一次性的（ragdollState 一置位就只摆倒地姿态，dead:false 撤不掉），只有播片段时被片段盖住才像站着。现在 _Pose 发现
//   「不倒地了、人却还倒着」就把这个人重造一遍（_Revive，同关键帧之间「从倒地站起来就重造」），同一帧强推一步站起来；
//   之后再写 state:"down" 就是新人从头倒（lie:"along" 照样用 LIE_DEATH_VARIANT 落定、重新量头的方向再摆）。
//   站着背枪的人倒下后不再背枪（倒地后步态层不推了，背枪标志停在站着时的值，枪竖着戳在背上）：拿回手里，倒地动作摆在身边。

import * as THREE from "three";
import { SampleTransition } from "./Script_EditorBlockoutConfig.mjs";
import { InstallAllyGait } from "./Script_AllyGait.mjs";
import { SetRelaxedGait, EnsureRelaxedGait, UpdateRelaxedGaitWeapon, RelaxedGaitShown } from "./Script_RelaxedGait.mjs";
import { FIRST_LEVEL_SPEAKING_CAST, SpeakingCastOptions } from "./Data_FirstLevelSpeakingCast.mjs";
import { LoadLugouCastModels } from "./Script_CharacterModel.mjs";
import { PREVIZ_WEAPON_HIDDEN } from "./Data_BlockoutPrevizClips.mjs";
import { LoadDraftCartAssets, CreateDraftCartInstance } from "./Script_DraftCartModel.mjs";
import { LoadStretcherAsset, StretcherAssetGeometry, CreateStretcherMaterial } from "./Script_StretcherAsset.mjs";
import { LoadBlockoutBlanket, CreateBlockoutBlanket } from "./Script_EditorBlockoutBlanket.mjs";

/** 不拿枪的定妆角色（开场导演 Spawn 时给 unarmed:true 的那几个）。 */
const UNARMED_CASTS = new Set(["interpreter"]);
/** 倒地的人身体投影的半长（米）：放在这个范围里最低的地面上。 */
const DOWN_REACH_M = 0.9;
/** 倒地动作在这么多秒内落定（Actor.Ragdoll 的时长 ≤ 0.8 s）：lie:"along" 的人造出来就直接摆成落定后的样子。 */
const LIE_SETTLE_S = 2;
const _lieV = new THREE.Vector3(), _lieP = new THREE.Vector3(), _lieM = new THREE.Matrix4();
/**
 * lie:"along" 的人倒地用哪段倒地片段（2026-10-18 第三轮）：四段倒地片段（Script_CharacterModel DEATH_COLLAPSE_CLIP_IDS）
 * 都是侧身蜷腿，两脚离身体轴（骨盆→头）的横向距离实测：C 0.41–0.44 m、B 0.48–0.53、D 0.55–0.59、A 0.56–0.59。
 * 躺在单被 / 担架（宽 0.7 m）上的人用最窄的 C，按种子抽到 A / D 会有一只脚伸出被子外。
 */
const LIE_DEATH_VARIANT = "DeathCollapseC";
/** 量躺姿时身体轴最多偏离「骨盆→头」多少度去找最窄的方向（BrowserTest 要求头朝向与朝向差 ≤ 12°）。 */
const LIE_FIT_MAX_DEG = 8;

export const BLOCKOUT_PUPPETS = Object.freeze({
  maxActors: 120,
  farAnimM: 60,
  farAnimEvery: 3,
  shadowM: 25,
  /** 趴着的人离镜头超过这么远就不做逐顶点防陷地（ProneGroundContact 量皮肤那一步，一人约 0.5 ms）；身体顺坡、手脚贴地照做。 */
  proneSkinFitM: 25,
  childScale: 0.62,
  /** 百姓 / 小孩的身体缺省："rig" = NRA 骨架占位身体（能放片段）；"procedural" = 旧的程序化 tzm 身体。单位字段 body 可覆盖。 */
  civilianBody: "rig",
  tank: { w: 2.18, d: 5.75, h: 1.2, turretW: 1.5, turretD: 1.7, turretH: 0.75, barrel: 1.6 },
  /**
   * 九四式轻装甲车（2026-10-24，单位 kind "tank" + shape "tankette"）：史料 3.36 × 1.62 × 1.63 m、2 人、1 挺机枪、没有炮。
   * 履带箱 0.5 高、车体 0.65、小机枪塔 0.48（偏右前），加起来 1.63；塔上一截机枪管 0.5 m，没有炮管。白盒下跟 tank 一样只是体块（不换正式模型）。
   */
  tankette: { w: 1.62, d: 3.36, trackH: 0.5, hullH: 0.65, turretW: 0.7, turretD: 0.8, turretH: 0.48, turretX: 0.33, turretZ: -0.55, mg: 0.5 },
  litter: { w: 0.7, d: 2.1, y: 0.78, groundY: 0.12, bearerGapM: 0.55,
    /** 正式担架模型在担架组里的摆法（文件头 2026-10-21）：转 180°（前头朝 −Z）、竿心落到组原点 + 0.03。 */
    modelYaw: Math.PI, modelY: 0.03 - 0.12 },
  cart: { w: 1.5, d: 2.4, h: 0.55, y: 0.75, wheel: 0.62 },
  animal: { w: 0.6, d: 1.7, h: 0.75, y: 0.95, head: 0.55 },
  /** 战车 / 车 / 牲口用正式模型（false = 全用体块）。 */
  models: true,
  tankModel: "Type89Tank",
  /** 车前这么远内另有 animal 单位时，车自己的牲口藏起来。 */
  hitchedAnimalM: 4,
  /** 倒地的牲口侧躺：绕身体纵轴转这么多、抬这么高（模型原点在蹄底）。 */
  animalDown: { rollRad: 1.45, liftM: 0.32 },
  /** 两帧之间挪超过这么远算瞬移（跳关键帧），不算走路，不推步子。 */
  teleportM: 3,
  /** 单被离地（防 z-fighting；布料模拟时质点自己离地 BLANKET_CLOTH.groundOffsetM，这个只管根）。 */
  blanketLiftM: 0.005,
  /**
   * 单被的布料（2026-10-21，_BlanketEnv）：拽被角的人站在被头这么远内才算；躺着的人骨盆在被子（资产空间）这个范围里才算躺在上面；
   * 两只手最多比被头（1.4 m）宽这么多倍（拖人片段的拳头在人外侧 0.26 m，两人各在中线旁 0.55 m → 拳头相距 1.62 m，
   * _import/Script_PrevizCareClips.py STAGES.blanketDrag 是按 1.6 m 宽的被子摆的）；手离被角静止位置超过 maxGripReachM 不算拽着；
   * 没人拽、被子却在走时两角贴地跟着走的位置（资产空间米 = 静止平铺的头角）。
   */
  blanketCloth: Object.freeze({ dragReachM: 3, riderHalfWidthM: 0.8, riderHalfLengthM: 1.2, headHalfWidthM: 0.7, headZ: 0.95,
    maxGripSpan: 1.04, maxGripReachM: 2.5, groundGrip: Object.freeze({ x: 0.7, y: 0, z: 0.95 }) }),
  /** 不戒备时背在背上的枪（步枪）；机枪 / 掷弹筒 / 手枪 / 大刀照旧。 */
  slungWeapons: ["HanYang", "Type38", "ZhongZheng"],
  /** 拿步枪、不戒备、蹲着不动、没在播片段的兵：播这段歇着的片段（单膝跪、枪竖在身前）。 */
  crouchRestClip: "PvCrouchRestRifle",
});

/** 预演片段换成同一套里不端枪的版本（2026-10-20）：右手提枪说话 → 背枪说话。 */
export const PREVIZ_CLIP_REMAP = Object.freeze({ PvStandTalkLowRifle: "PvStandTalkSlung" });

const DEG = Math.PI / 180;

/**
 * 驴车（kind:"cart"，_MakeBody）上能坐人的地方（车本地米：+x 右、−z 前；y 离车底下地面）。2026-10-20 从 BLOCKOUT_PUPPETS.cart 量出来：
 * 车板一整块 1.5 宽 × 2.4 长 × 0.55 厚，中心离地 0.75 → 车板顶 1.025 m、车板底 0.475 m；车尾板顶 = 车板顶（白盒车没另做尾板），
 * 车尾沿在本地 z = +1.2，车辕朝 −z。坐车尾的人 ride.y = SitRootY(车尾板顶, 片段坐高, 缩放)：VilSitEdge 坐高 0.90 m（根在屁股正下方的地上，
 * 坐沿在根上方 0.90 m），小孩 × 0.62 → 0.467。躺在车板上的担架 ride.y = litterY（担架布 0.1 厚、布底贴车板）。
 */
export const BLOCKOUT_CART_SEATS = Object.freeze((() => {
  const c = BLOCKOUT_PUPPETS.cart;
  const bedTopY = c.y + c.h / 2, bedBottomY = c.y - c.h / 2;
  return {
    w: c.w, d: c.d, bedTopY, bedBottomY, tailZ: c.d / 2,
    /** 车尾板：坐沿在车尾沿上（屁股在车板顶、腿垂在车外、背对车头 = yawDeg 180）。 */
    tail: Object.freeze({ x: 0, z: c.d / 2, y: bedTopY, yawDeg: 180 }),
    /** 车板中间（坐 / 趴在货上）。 */
    bed: Object.freeze({ x: 0, z: 0, y: bedTopY, yawDeg: 0 }),
    /** 担架平放在车板上时的 ride.y（担架组原点在布的中心，布 0.1 厚）。 */
    litterY: bedTopY + 0.05,
    /** VilSitEdge 这类坐沿片段的坐高（根 → 坐沿，米，缩放 1）。 */
    sitEdgeClipH: 0.9,
  };
})());

/** 坐在 seatY 高的沿上、片段坐高 clipSitH（缩放前）的人，根应当离车底下地面多高：seatY − clipSitH × scale。 */
export function SitRootY(seatY, clipSitH = BLOCKOUT_CART_SEATS.sitEdgeClipH, scale = 1) {
  return seatY - clipSitH * scale;
}

/**
 * ride 的本地偏移 → 世界位姿（纯函数）：carrier = { x, z, yawDeg, y（车底下地面；担架时是担架面） }。
 * → { x, z, y, yawDeg }（yawDeg 已 wrap）。本地 +x 右、−z 前，与 TankGroundY 的脚印旋转同式。
 */
export function RideWorldPose(carrier, ride) {
  const ry = carrier.yawDeg * DEG, c = Math.cos(ry), s = Math.sin(ry);
  const lx = ride.x || 0, lz = ride.z || 0;
  let yaw = carrier.yawDeg + (ride.yawDeg || 0);
  yaw = ((yaw + 180) % 360 + 360) % 360 - 180;
  return { x: carrier.x + lx * c + lz * s, z: carrier.z - lx * s + lz * c, y: carrier.y + (ride.y || 0), yawDeg: yaw };
}

/**
 * 百姓的骨骼占位身体长什么样（2026-10-19）：NRA 士兵骨架（modelVariant 1 = TengxianNra02，预演动作库烘在它上面）、
 * 军装布换成百姓色（按种子抽一种）、帽徽 / 腰间枪套 / 胸前带子按材质名藏掉。
 */
export const CIVILIAN_RIG_LOOK = Object.freeze({
  bodyKind: "nra",
  modelVariant: 1,
  cloth: Object.freeze([0x2a3147, 0x232326, 0x5b4b36, 0x3a4a5e]),   // 深蓝、黑、土布、靛青
  // 小孩固定深蓝（2026-10-23：1218 14-2 妮儿按种子抽到土布褐，近镜头里连军帽、红领章看着就是个兵；深蓝跟程序化百姓的蓝布衣一个色）
  childCloth: 0x2a3147,
  hideMaterials: Object.freeze(["Material #1721585500", "Material #29", "Material #1721585343"]),
});
export const BLOCKOUT_BODY_MODES = Object.freeze(["rig", "procedural"]);

/** 这个单位的百姓身体用哪种：单位 / spawn 的 body 字段 → 缺省 BLOCKOUT_PUPPETS.civilianBody。 */
export function CivilianBodyMode(unit) {
  return BLOCKOUT_BODY_MODES.includes(unit?.body) ? unit.body : BLOCKOUT_PUPPETS.civilianBody;
}

function ActorKind(unit) {
  // 定妆角色按定妆表的人物种类（翻译官穿 NRA06，阵营却是 ija）
  const cast = unit.castId && Object.hasOwn(FIRST_LEVEL_SPEAKING_CAST, unit.castId) ? FIRST_LEVEL_SPEAKING_CAST[unit.castId] : null;
  if (cast && unit.kind !== "officer") return cast.actorKind;
  if (unit.kind === "officer") return unit.side === "ija" ? "ijaOfficer" : "nraOfficer";
  if (unit.kind === "civilian" || unit.kind === "child" || unit.side === "civ") return "civilian";
  return unit.side === "ija" ? "ija" : "nra";
}

/** 担架上有几个人抬、各站哪头（§3 bearers，缺省 2；只剩一人时留前头）。 */
export function LitterSlots(unit) {
  const n = Number.isInteger(unit?.bearers) ? Math.max(0, Math.min(2, unit.bearers)) : 2;
  return n >= 2 ? ["front", "rear"] : n === 1 ? ["front"] : [];
}

/**
 * 担架怎么摆：抬着 → 杆在手的高度、放平；只剩前头一人 → 前头在手上、后头着地（斜着）；
 * 没人抬或抬的人倒了（state:"down"）→ 平放在地上。→ { y, tilt }（y 是担架面中心离地高度，tilt 绕 X 的弧度，前高为正）
 */
/** 这个 litter 单位其实是被子（01–05 两人拖的单被）：名字带「被」不带「担架」。 */
export function IsBlanketLitter(unit) {
  const name = unit?.name || "";
  return /被/.test(name) && !/担架/.test(name);
}

/**
 * 人身上的胶囊（世界坐标，给单被的布料用）：躯干两节、肩、头、两臂两节、胯、两腿两节；legsOnly 只要两腿。
 * 半径按身体缩放 k（小孩 0.62）。调用前 actor.root.updateMatrixWorld(true)。→ [{ a, b, r, press, carry }]
 */
export function BodyCapsules(rig, k = 1, { legsOnly = false, press = false, carry = null } = {}) {
  const b = rig.bones, out = [];
  const P = (bone) => bone ? new THREE.Vector3().setFromMatrixPosition(bone.matrixWorld) : null;
  const Cap = (a, c, r) => { if (a && c) out.push({ a, b: c, r: r * k, press, carry }); };
  const thighL = P(b.thighL), thighR = P(b.thighR), calfL = P(b.calfL), calfR = P(b.calfR), footL = P(b.footL), footR = P(b.footR);
  Cap(thighL, calfL, 0.075); Cap(thighR, calfR, 0.075); Cap(calfL, footL, 0.055); Cap(calfR, footR, 0.055);
  if (legsOnly) return out;
  const pelvis = P(b.pelvis), chest = P(b.chest), neck = P(b.neck), head = P(b.head);
  Cap(pelvis, chest, 0.12); Cap(chest, neck || head, 0.12); Cap(thighL, thighR, 0.1);
  if (neck && head) Cap(neck, head.clone().add(head.clone().sub(neck).normalize().multiplyScalar(0.12 * k)), 0.1);
  const armL = P(b.upperArmL), armR = P(b.upperArmR), foreL = P(b.forearmL), foreR = P(b.forearmR), handL = P(b.handL), handR = P(b.handR);
  Cap(armL, armR, 0.07); Cap(armL, foreL, 0.055); Cap(armR, foreR, 0.055); Cap(foreL, handL, 0.045); Cap(foreR, handR, 0.045);
  return out;
}

export function LitterPose(unit, down = unit?.state === "down") {
  const l = BLOCKOUT_PUPPETS.litter;
  const slots = LitterSlots(unit);
  if (down || slots.length === 0) return { y: l.groundY, tilt: 0 };
  if (slots.length === 1) {
    const half = (l.d + 0.9) / 2;
    const tilt = Math.asin(Math.min(0.9, (l.y - l.groundY) / (2 * half)));
    return { y: (l.y + l.groundY) / 2, tilt };
  }
  return { y: l.y, tilt: 0 };
}

/** 战车的外形（单位 shape）："tankette" = 九四式轻装甲车，其余 = 八九式。 */
export function TankShape(unit) { return unit?.shape === "tankette" ? "tankette" : "tank"; }

/** 战车脚印上取地面的几处（车身局部坐标，米）：中心、四角、四边中点。shape 见 TankShape。 */
export function TankFootprintPoints(shape = "tank") {
  const t = BLOCKOUT_PUPPETS[shape] || BLOCKOUT_PUPPETS.tank, hw = t.w / 2 + 0.08, hd = t.d / 2;
  const out = [];
  for (const lx of [-hw, 0, hw]) for (const lz of [-hd, 0, hd]) out.push([lx, lz]);
  return out;
}

/** 战车放在脚印里最高的地面上（车身不陷进沟里）。groundAt(x,z) → y。 */
export function TankGroundY(groundAt, x, z, yawDeg, shape = "tank") {
  const ry = yawDeg * DEG, c = Math.cos(ry), s = Math.sin(ry);
  let best = -Infinity;
  for (const [lx, lz] of TankFootprintPoints(shape)) best = Math.max(best, groundAt(x + lx * c + lz * s, z - lx * s + lz * c));
  return best;
}

const litter0 = (unit) => unit.kind === "litter";

function HashSeed(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) % 100000;
}

/** 体块用的一份材质（白盒画质下照例被换成灰网格；其它画质下是这几种颜色）。 */
function BlockMaterial(color) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.05 });
}

function Box(group, material, w, h, d, x, y, z) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true; mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

export class BlockoutPuppets {
  constructor({ scene, actorFactory, groundAt, library = null }) {
    this.scene = scene;
    this.actorFactory = actorFactory;
    this.library = library;
    this.draftAssets = null;
    this.draftLoading = null;
    this.blanketAsset = null;   // null 没读、Promise 在读、false 读失败、对象 = 读到了
    this.groundAt = groundAt;
    this.root = new THREE.Group();
    this.root.name = "BlockoutPuppets";
    scene.add(this.root);
    this.materials = {
      ija: BlockMaterial(0x6b4a3e), nra: BlockMaterial(0x4a5a66), civ: BlockMaterial(0x6d6a52),
      wood: BlockMaterial(0x7a6448), cloth: BlockMaterial(0xb7ad94), dark: BlockMaterial(0x333638),
    };
    this.puppets = new Map();
    this.plan = null;
    this.planTime = 0;
    this.frame = 0;
    this.elapsed = 0;
    this.warning = null;
    this.actorCount = 0;
    this.missingClips = new Set();
  }

  get transitioning() { return !!this.plan; }

  // -------------------------------------------------------------------------
  // 造 / 拆

  _MakeHuman(unit, slot, kind = ActorKind(unit), weapon = unit.weapon ?? null) {
    let actor = null;
    if (slot === "main" && UNARMED_CASTS.has(unit.castId)) weapon = null;
    // 定妆角色：固定模型号与面部蒙皮，种子也按 castId 定（同一个人每一帧一个样子）；不从对象池拿（池里的人身高脸型是预建时抽的）
    const cast = slot === "main" && unit.castId ? SpeakingCastOptions(unit.castId) : {};
    const seed = cast.castId ? HashSeed(`cast:${cast.castId}`) : HashSeed(`${unit.id}:${slot}`);
    // 百姓的骨骼占位身体（2026-10-19，文件头）：造一个空手的 NRA02，布换百姓色；body:"procedural" 还是旧的 tzm 身体
    const civilianRig = kind === "civilian" && CivilianBodyMode(unit) === "rig";
    const bodyKind = civilianRig ? CIVILIAN_RIG_LOOK.bodyKind : kind;
    const look = civilianRig ? { modelVariant: CIVILIAN_RIG_LOOK.modelVariant, noPool: true, weapon: null,
      uniformPalette: unit.kind === "child" ? CIVILIAN_RIG_LOOK.childCloth : CIVILIAN_RIG_LOOK.cloth[seed % CIVILIAN_RIG_LOOK.cloth.length] } : {};
    if (civilianRig) weapon = null;
    try {
      actor = this.actorFactory.Create(bodyKind, { seed, weapon, ...cast, ...(cast.castId ? { noPool: true } : {}), ...look });
    } catch (error) {
      console.warn("[BlockoutPuppets] actor create failed", unit.id, error);
      return null;
    }
    if (civilianRig) this._DressCivilian(actor);
    if (unit.kind === "child") actor.root.scale.setScalar(BLOCKOUT_PUPPETS.childScale);
    this.root.add(actor.root);
    // 步态安装器吃一个「假士兵」：只要 id / actor / position / yaw 与几个开关。
    const soldier = { id: `blockout:${unit.id}:${slot}`, actor, position: actor.root.position, yaw: 0, alive: true,
      side: unit.side, missionCombatAlert: !!unit.aim, castId: cast.castId || null };
    try {
      // 步态库是异步下载的：下不来就用缺省动作，不能留一条未处理的 rejection。
      if (!weapon && bodyKind !== "civilian") SetRelaxedGait(soldier, "unarmed");
      else if (!unit.aim && BLOCKOUT_PUPPETS.slungWeapons.includes(weapon)) SetRelaxedGait(soldier, "slung");
      else if (bodyKind === "nra" || bodyKind === "nraOfficer") InstallAllyGait(soldier)?.catch?.(() => {});
      else if (bodyKind === "ija") SetRelaxedGait(soldier, unit.aim ? null : "alert");
    } catch (error) { /* 同上 */ }
    return { actor, soldier, kind, bodyKind, slot, animDt: 0, castId: cast.castId || null, baseWeapon: actor.weaponId ?? weapon ?? null, lieLocal: null,
      body: actor.characterRig ? "rig" : "procedural" };
  }

  /** 百姓占位身体的外观：按材质名藏掉帽徽 / 枪套 / 胸前带子（军帽与军装同一网格，摘不掉）。布色在 Create 时就换了。 */
  _DressCivilian(actor) {
    const rig = actor.characterRig;
    if (!rig?.root) return;
    const hide = new Set(CIVILIAN_RIG_LOOK.hideMaterials);
    rig.root.traverse((object) => {
      if (!object.isMesh) return;
      const names = (Array.isArray(object.material) ? object.material : [object.material]).map(m => m?.name);
      if (names.length && names.every(n => hide.has(n))) { object.visible = false; object.userData.blockoutCivilianHidden = true; }
    });
  }

  _MakeBody(unit) {
    const m = this.materials, P = BLOCKOUT_PUPPETS;
    const group = new THREE.Group();
    group.name = `BlockoutPuppet_${unit.id}`;
    const side = unit.side === "ija" ? m.ija : unit.side === "civ" ? m.civ : m.nra;
    // 战车 / 车 / 牲口 / 担架的体块放进子组：正式模型到了就整组藏起来（_DressModel）。担架的子组在担架组（bed）里
    const boxes = new THREE.Group();
    boxes.name = "BlockoutBoxes";
    group.userData.boxes = boxes;
    if (unit.kind !== "litter") group.add(boxes);
    if (unit.kind === "tank" && TankShape(unit) === "tankette") {
      // 九四式轻装甲车（2026-10-24）：履带箱 + 矮车体 + 偏右前的小机枪塔 + 一截机枪管；没有炮管
      const t = P.tankette;
      Box(boxes, m.dark, t.w + 0.1, t.trackH, t.d * 0.98, 0, t.trackH / 2, 0);
      Box(boxes, side, t.w - 0.2, t.hullH, t.d * 0.92, 0, t.trackH + t.hullH / 2, 0.05);
      const turretY = t.trackH + t.hullH + t.turretH / 2;
      Box(boxes, side, t.turretW, t.turretH, t.turretD, t.turretX, turretY, t.turretZ);
      Box(boxes, m.dark, 0.07, 0.07, t.mg, t.turretX, turretY + 0.08, t.turretZ - t.turretD / 2 - t.mg / 2);
    } else if (unit.kind === "tank") {
      const t = P.tank;
      Box(boxes, side, t.w, t.h, t.d, 0, 0.35 + t.h / 2, 0);
      Box(boxes, m.dark, t.w + 0.16, 0.7, t.d * 0.96, 0, 0.35, 0);
      Box(boxes, side, t.turretW, t.turretH, t.turretD, 0, 0.35 + t.h + t.turretH / 2, 0.35);
      Box(boxes, m.dark, 0.14, 0.14, t.barrel, 0, 0.35 + t.h + t.turretH / 2, 0.35 - t.turretD / 2 - t.barrel / 2);
    } else if (unit.kind === "litter") {
      // 担架单独一个组：抬着 / 一头着地 / 放在地上 由 _Pose 摆高度与倾角（LitterPose）
      const l = P.litter;
      const bed = new THREE.Group();
      bed.name = "BlockoutStretcher";
      Box(boxes, m.cloth, l.w, 0.1, l.d, 0, 0, 0);
      Box(boxes, m.wood, 0.05, 0.05, l.d + 0.9, -l.w / 2, 0.03, 0);
      Box(boxes, m.wood, 0.05, 0.05, l.d + 0.9, l.w / 2, 0.03, 0);
      bed.add(boxes);
      group.add(bed);
      group.userData.stretcher = bed;
    } else if (unit.kind === "cart" || unit.kind === "animal") {
      if (unit.kind === "cart") {
        const c = P.cart;
        Box(boxes, m.wood, c.w, c.h, c.d, 0, c.y, 0);
        for (const sx of [-1, 1]) {
          const wheel = new THREE.Mesh(new THREE.CylinderGeometry(c.wheel / 2, c.wheel / 2, 0.08, 14), m.dark);
          wheel.rotation.z = Math.PI / 2; wheel.position.set(sx * (c.w / 2 + 0.06), c.wheel / 2, 0.2);
          wheel.castShadow = true; boxes.add(wheel);
        }
        Box(boxes, m.wood, 0.06, 0.06, 1.6, -0.35, c.y - 0.1, -c.d / 2 - 0.8);
        Box(boxes, m.wood, 0.06, 0.06, 1.6, 0.35, c.y - 0.1, -c.d / 2 - 0.8);
      }
      if (unit.kind === "animal" || unit.animal !== false) {
        const a = P.animal, z = unit.kind === "cart" ? -P.cart.d / 2 - 1.35 : 0;
        Box(boxes, m.civ, a.w, a.h, a.d, 0, a.y, z);
        Box(boxes, m.civ, 0.3, 0.45, a.head, 0, a.y + 0.35, z - a.d / 2 - 0.15);
        for (const [lx, lz] of [[-0.2, -0.6], [0.2, -0.6], [-0.2, 0.6], [0.2, 0.6]]) Box(boxes, m.civ, 0.12, a.y - a.h / 2, 0.12, lx, (a.y - a.h / 2) / 2, z + lz);
      }
    }
    this.root.add(group);
    return group;
  }

  _Create(unit, allowActors) {
    const puppet = { id: unit.id, unit, body: null, humans: [], x: unit.x, z: unit.z, yawDeg: unit.yawDeg, stance: unit.stance,
      moving: false, speedMps: 0, visible: true, down: unit.state === "down", noActor: false, stagger: HashSeed(unit.id) };
    if (["tank", "litter", "cart", "animal"].includes(unit.kind)) puppet.body = this._MakeBody(unit);
    this._MakeHumans(puppet, unit, allowActors);
    return puppet;
  }

  /** 造这个单位的人：担架按 bearers 造抬杆的，战车 / 车 / 牲口没有人，其余一个；名额不够 → noActor。 */
  _MakeHumans(puppet, unit, allowActors) {
    const bodyKinds = ["tank", "litter", "cart", "animal"];
    if (unit.kind === "litter") {
      // §3 bearers：2 = 前后两人抬；1 = 只剩前头一人（后端着地）；0 = 担架放在地上，没人抬
      const slots = LitterSlots(unit);
      if (slots.length && allowActors >= slots.length) {
        for (const slot of slots) {
          const human = this._MakeHuman({ ...unit, kind: "soldier", side: unit.side === "civ" ? "civ" : "nra", aim: false }, slot, unit.side === "civ" ? "civilian" : "nra", null);
          if (human) puppet.humans.push(human);
        }
      } else if (slots.length) puppet.noActor = true;
    } else if (!bodyKinds.includes(unit.kind)) {
      if (allowActors >= 1) {
        const human = this._MakeHuman(unit, "main");
        if (human) puppet.humans.push(human);
      } else puppet.noActor = true;
    }
    this.actorCount += puppet.humans.length;
  }

  _DisposeHumans(puppet) {
    for (const human of puppet.humans) {
      try { human.actor.Dispose(); } catch (error) { /* already gone */ }
    }
    this.actorCount -= puppet.humans.length;
    puppet.humans.length = 0;
  }

  /**
   * 2026-10-21：倒着的人被预演键扶起来（state "alive"）。倒地在 Actor 里是一次性的（ragdollState 一置位，Update 就只摆
   * 倒地姿态，dead:false 撤不掉；lieLocal / 倒地片段的选择也跟着这个人走），照关键帧那头（_Sync：从倒地站起来就重造）
   * 把人重造一遍；体块、位置、驱动都留着。之后再倒下就是一个新人从头倒（lie:"along" 照样重新量、重新摆）。
   */
  _Revive(puppet) {
    const count = puppet.humans.length;
    this._DisposeHumans(puppet);
    this._MakeHumans(puppet, puppet.unit, count);
  }

  _Destroy(puppet) {
    this._DisposeHumans(puppet);
    if (puppet.body) {
      // 正式模型：车 / 牲口的几何与骨架是共用的（CloneSkinnedRig），只停动画摘下来；战车是每辆现造的几何，照拆。材质都是共用的，不拆。
      const model = puppet.body.userData.model;
      if (model?.draft) model.draft.Dispose();
      else if (model?.stretcher) model.stretcher.removeFromParent();   // 几何与材质全场共用，不拆
      else if (model?.blanket) model.blanket.Dispose();               // 同上（骨架是克隆的，几何贴图共用）
      else if (model?.tank) model.tank.root.traverse(o => { if (o.isMesh) o.geometry.dispose(); });
      (puppet.body.userData.boxes || puppet.body).traverse(o => { if (o.isMesh) o.geometry.dispose(); });
      puppet.body.removeFromParent();
      puppet.body = null;
    }
  }

  /** 演员名额：按到相机的距离分，近的先给（超出上限的只留地环与标签）。 */
  _Budget(units, cameraPosition) {
    const need = u => (u.kind === "litter" ? LitterSlots(u).length : ["tank", "cart", "animal"].includes(u.kind) ? 0 : 1);
    const total = units.reduce((n, u) => n + need(u), 0);
    const allow = new Map();
    if (total <= BLOCKOUT_PUPPETS.maxActors) { for (const u of units) allow.set(u.id, need(u)); this.warning = null; return allow; }
    const cx = cameraPosition?.x ?? 0, cz = cameraPosition?.z ?? 0;
    let left = BLOCKOUT_PUPPETS.maxActors;
    for (const u of [...units].sort((a, b) => Math.hypot(a.x - cx, a.z - cz) - Math.hypot(b.x - cx, b.z - cz))) {
      const n = need(u);
      allow.set(u.id, n <= left ? n : 0);
      if (n <= left) left -= n;
    }
    this.warning = `这一帧有 ${total} 个人物，超过上限 ${BLOCKOUT_PUPPETS.maxActors}，远处的只画地环与标签`;
    console.warn(`[BlockoutPuppets] ${total} actors > ${BLOCKOUT_PUPPETS.maxActors}; far units keep markers only`);
    return allow;
  }

  /** 让场上的演员与 units 一一对应：同 id 复用；种类 / 阵营变了或从倒地站起来就重造。 */
  _Sync(units, cameraPosition) {
    const allow = this._Budget(units, cameraPosition);
    const keep = new Set();
    for (const unit of units) {
      keep.add(unit.id);
      let puppet = this.puppets.get(unit.id);
      const wantActors = allow.get(unit.id) ?? 0;
      const oldWeapon = puppet?.unit.weapon ?? null, newWeapon = unit.weapon ?? null;
      // 两把都不是空手：就地换（SetWeapon），不重造人；空手 ↔ 拿武器要换步态，照旧重造
      const swapInPlace = !!(oldWeapon && newWeapon && oldWeapon !== newWeapon);
      const stale = puppet && (puppet.unit.kind !== unit.kind || puppet.unit.side !== unit.side
        || (oldWeapon !== newWeapon && !swapInPlace) || (puppet.unit.castId ?? null) !== (unit.castId ?? null)
        || (unit.kind === "litter" && LitterSlots(puppet.unit).length !== LitterSlots(unit).length)
        || (puppet.down && unit.state !== "down")
        // 倒着的人换成 lie:"along"（02-2 → 02-3 冬瓜挪上被子）：重造，好按 LIE_DEATH_VARIANT 重新倒一次
        || (puppet.down && unit.state === "down" && unit.lie === "along" && (puppet.unit.lie ?? null) !== "along")
        // 百姓身体种类变了（rig ↔ procedural，2026-10-19）
        || CivilianBodyMode(puppet.unit) !== CivilianBodyMode(unit)
        || (puppet.noActor && wantActors > 0) || (!puppet.noActor && wantActors === 0 && puppet.humans.length > 0));
      if (stale) { this._Destroy(puppet); this.puppets.delete(unit.id); puppet = null; }
      if (!puppet) { puppet = this._Create(unit, wantActors); this.puppets.set(unit.id, puppet); }
      puppet.unit = unit;
      for (const human of puppet.humans) {
        if (human.slot === "main" && newWeapon && !UNARMED_CASTS.has(unit.castId)) human.baseWeapon = newWeapon;
        human.soldier.missionCombatAlert = !!unit.aim;
      }
    }
    for (const [id, puppet] of this.puppets) if (!keep.has(id) && !puppet.temp) { this._Destroy(puppet); this.puppets.delete(id); }
  }

  // -------------------------------------------------------------------------
  // 关键帧

  /** 直接到位（后退、跨多个、切关、首次载入）。 */
  Apply(units, cameraPosition = null) {
    this.plan = null;
    this.planTime = 0;
    this._Sync(units, cameraPosition);
    // 先把所有人的状态写好再摆（挂在车上的人要读车的状态，顺序不能影响结果）
    for (const unit of units) {
      Object.assign(this.puppets.get(unit.id), { x: unit.x, z: unit.z, yawDeg: unit.yawDeg, stance: unit.stance, moving: false, speedMps: 0, visible: true,
        down: unit.state === "down" });
    }
    for (const unit of units) this._Pose(this.puppets.get(unit.id), 0, true);
    this._StepBlankets(true);
  }

  /**
   * 从 fromUnits 过渡到 toUnits（plan 来自 PlanTransition(fromKf, toKf)）。
   * 先把两边出现过的单位都摆出来：只在新关键帧有的先藏着（appear 起步时才出现），
   * 只在旧关键帧有的照旧站在原处（vanish 结束时藏掉，过渡收尾再回收）。
   */
  Transition(plan, fromUnits, toUnits, cameraPosition = null) {
    const byId = new Map();
    for (const unit of fromUnits || []) byId.set(unit.id, unit);
    for (const unit of toUnits || []) byId.set(unit.id, unit);   // 新关键帧的数据优先（种类、名字、武器）
    this.toUnits = toUnits || [];
    this._Sync([...byId.values()], cameraPosition);
    this.plan = plan;
    this.planTime = 0;
    this._SamplePlan(true);
  }

  _SamplePlan(snap = false) {
    const states = SampleTransition(this.plan, this.planTime);
    for (const s of states) {
      const puppet = this.puppets.get(s.id);
      if (!puppet) continue;
      puppet.x = s.x; puppet.z = s.z; puppet.yawDeg = s.yawDeg; puppet.stance = s.stance;
      puppet.moving = s.moving; puppet.speedMps = s.speedMps; puppet.visible = s.visible;
    }
    // 状态全写完再摆（挂在车上的人读车的状态）
    if (snap) {
      for (const s of states) { const puppet = this.puppets.get(s.id); if (puppet) this._Pose(puppet, 0, true); }
      this._StepBlankets(true);
    }
  }

  _Finish() {
    const units = this.toUnits || [];
    this.plan = null;
    this.planTime = 0;
    this.toUnits = null;
    const keep = new Set(units.map(u => u.id));
    for (const [id, puppet] of this.puppets) if (!keep.has(id)) { this._Destroy(puppet); this.puppets.delete(id); }
    for (const unit of units) {
      const puppet = this.puppets.get(unit.id);
      if (!puppet) continue;
      puppet.unit = unit;
      Object.assign(puppet, { x: unit.x, z: unit.z, yawDeg: unit.yawDeg, stance: unit.stance, moving: false, speedMps: 0, visible: true,
        down: unit.state === "down" });
    }
  }

  // -------------------------------------------------------------------------
  // 每帧

  /** 把 puppet 的位姿写进体块与人物，并推动画（dt 已含 playbackRate）。 */
  _Pose(puppet, dt, force = false, cameraPosition = null) {
    const drive = puppet.drive;
    if (drive) {
      puppet.x = drive.x; puppet.z = drive.z; puppet.yawDeg = drive.yawDeg; puppet.stance = drive.stance;
      puppet.moving = !!drive.moving; puppet.speedMps = drive.speedMps || 0; puppet.visible = drive.visible !== false;
      puppet.down = drive.state === "down";
    }
    // 2026-10-21 不倒地了，人却还是倒着的（预演键把倒地的人扶起来）：重造（_Revive），这一帧就站起来（照造人时那样强推一步）
    if (!puppet.down && puppet.humans.some(h => h.actor.ragdollState)) { this._Revive(puppet); force = true; }
    // 2026-10-20 挂到车上（ride）：位姿 = 车当前位姿 ∘ 本地偏移，不贴地、不走路；位置键不管用
    const seat = this._Seat(puppet);
    puppet.seat = seat;
    if (seat) { puppet.x = seat.x; puppet.z = seat.z; puppet.yawDeg = seat.yawDeg; puppet.moving = false; puppet.speedMps = 0; }
    const y = seat ? seat.y : puppet.unit.kind === "tank" ? TankGroundY(this.groundAt, puppet.x, puppet.z, puppet.yawDeg, TankShape(puppet.unit)) : this.groundAt(puppet.x, puppet.z);
    const ry = puppet.yawDeg * DEG;
    if (puppet.body) {
      puppet.body.visible = puppet.visible;
      puppet.body.position.set(puppet.x, y, puppet.z);
      puppet.body.rotation.y = ry;
      const bed = puppet.body.userData.stretcher;
      if (bed) {
        // 挂在车上的担架平放（担架组原点 = 布中心）；地上 / 手上的照 LitterPose
        const pose = seat ? { y: 0, tilt: 0 } : LitterPose(puppet.unit, !!puppet.down);
        bed.position.y = pose.y;
        bed.rotation.x = pose.tilt;
      }
      if (BLOCKOUT_PUPPETS.models) this._PoseModel(puppet, dt, force);
    }
    const unit = puppet.unit;
    const fx = -Math.sin(ry), fz = -Math.cos(ry);
    const distance = cameraPosition ? Math.hypot(puppet.x - cameraPosition.x, puppet.z - cameraPosition.z) : 0;
    for (const human of puppet.humans) {
      const actor = human.actor;
      let x = puppet.x, z = puppet.z;
      if (unit.kind === "litter") {
        const offset = BLOCKOUT_PUPPETS.litter.d / 2 + BLOCKOUT_PUPPETS.litter.bearerGapM;
        const sign = human.slot === "front" ? 1 : -1;
        x += fx * offset * sign; z += fz * offset * sign;
      }
      actor.root.visible = puppet.visible;
      const lieAlong = this._LieAlong(puppet, human, drive);
      // 挂在车上：根放在车底下地面 + ride.y（不贴地）；否则倒地的取身体范围里最低的地面、站着的取脚下
      actor.root.position.set(x, seat ? seat.y : puppet.down && !litter0(unit) ? this.DownGround(x, z) : this.groundAt(x, z), z);
      actor.root.rotation.y = ry;
      human.soldier.yaw = ry;
      if (lieAlong && human.lieLocal) this._PlaceLying(human, x, z, ry);
      // 2026-10-19：顺着躺的人播躺姿片段（PvLieGrabSleeve）照样按头的方向摆；片段带 rootPath（PvClimbOutTrench）按它挪根
      const lieClip = this._LieClip(puppet, human, drive);
      if (lieClip && human.lieClip?.clip === drive.clip && human.lieClip.L) this._PlaceLying(human, x, z, ry, human.lieClip.L);
      if (!seat) this._ApplyRootPath(human, drive, ry);
      this._SyncWeapon(human, drive);
      const relaxed = this._SyncGait(human, drive ? !!drive.aim : !!unit.aim);
      if (human.soldier.relaxedGait) EnsureRelaxedGait(human.soldier);
      human.animDt += dt;
      const far = distance > BLOCKOUT_PUPPETS.farAnimM;
      if (!force && far && (this.frame + puppet.stagger) % BLOCKOUT_PUPPETS.farAnimEvery !== 0) continue;
      const step = force ? Math.max(human.animDt, 1 / 60) : human.animDt;
      human.animDt = 0;
      if (!puppet.visible) continue;
      // 倒地的人被拖 / 被抬着走：只平移，不播走路（moveSpeed 0、dead 照旧）
      const mps = puppet.moving && !(puppet.down && !litter0(unit)) ? puppet.speedMps : 0;
      const litter = unit.kind === "litter";
      const aim = drive ? !!drive.aim : !!unit.aim;
      const carryRole = litter ? human.slot : drive?.carryRole || null;
      // 要顺着躺的人还没倒下：倒地片段换成腿蜷得最窄的那段（LIE_DEATH_VARIANT），躺在被子 / 担架上不伸出去
      if (puppet.down && human.slot === "main" && !actor.ragdollState && (drive ? drive.lie : unit.lie) === "along") {
        const rig = actor.characterRig;
        if (rig?.deathClipById?.has?.(LIE_DEATH_VARIANT)) rig.deathVariantId = LIE_DEATH_VARIANT;
      }
      const throwing = this._ApplyThrow(human, drive, step);
      const clipState = throwing ? null : this._ApplyClip(human, this._RestDrive(puppet, human, drive, { relaxed, mps, carryRole, seat }), mps, step);
      // 友军步态（AllyGait）把「不戒备」的蹲着待着换成 AllyCrouchCarryStand（扛枪半蹲，骨盆离地 0.66 m，
      // 看着是站着的）：蹲 / 卧的人也当戒备，落到原生 KneelHold / CrouchIdle（骨盆 0.36–0.45 m）。
      human.soldier.missionCombatAlert = aim || (!carryRole && puppet.stance !== "stand");
      const state = {
        moveSpeed: mps / 3.6, moveSpeedMps: mps, locomotionTracked: true, elapsed: this.elapsed,
        aim: aim && !carryRole && !throwing ? 1 : 0,
        crouch: !carryRole && puppet.stance === "crouch" ? 1 : 0,
        prone: !carryRole && puppet.stance === "prone" ? 1 : 0,
        grounded: true, lookYaw: 0, lookPitch: 0, firing: false,
        proneSkinFit: !cameraPosition || distance < BLOCKOUT_PUPPETS.proneSkinFitM,
        dead: !!puppet.down && !drive?.clip,
        ...(carryRole ? { carryRole } : {}),
        ...(drive?.woundedWalk ? { woundedWalk: 1 } : {}),
        ...(drive?.talking ? { talking: 1 } : {}),
        ...(clipState?.bayonetFixed ? { bayonetFixed: true } : {}),
      };
      // 手里是大刀这类近战家伙、站着不动、没在播片段：摆原生白刃戒备（同开场导演的 meleeGuard），不按步枪据枪
      if (actor.weaponData?.kind === "melee" && !clipState && !throwing && !puppet.down && mps < 0.05 && !carryRole) {
        state.aim = 0;
        state.meleeCombat = { weapon: actor.weaponId, state: "idle", action: "Guard", clip: "DadaoGuard", normalized: this.elapsed % 1, t: this.elapsed, weight: 1 };
      }
      actor.Update(step, state);
      this._UpdateSlungRifle(human, relaxed);
      // 2026-10-19：趴着 / 躺着播的空手片段（抱捆爬、躺着攥袖子）手里、背上都不挂枪（背枪那把是竖着挂的，趴下会戳上天）
      if (drive?.clip && PREVIZ_WEAPON_HIDDEN.includes(drive.clip) && human.openingInstalled === true) {
        if (actor.weaponGroup) actor.weaponGroup.visible = false;
        const rig = actor.characterRig;
        if (rig?.openingSlungRifle) rig.openingSlungRifle.visible = false;
        if (rig?.relaxedGaitRifle) rig.relaxedGaitRifle.visible = false;
      }
      if (lieClip &&!(human.lieClip?.clip === drive.clip && human.lieClip.done)) {
        // 片段淡入期间每帧量一次头 / 骨盆 / 两脚，淡入完了缓存（同一片段之后不再量）
        const L = this._MeasureLie(human);
        const done = (actor.characterRig?.openingBlendState?.mix ?? 1) >= 0.99;
        human.lieClip = { clip: drive.clip, L, done };
        if (L) this._PlaceLying(human, x, z, ry, L);
      }
      if (lieAlong) {
        if (!actor.ragdollState) human.lieLocal = null;
        else if (!human.lieLocal) {
          // 造出来 / 刚倒下：直接落定，量一次头的方向，再按 lie 摆（以后每帧用缓存，不再量）
          if (actor.ragdollState.t < 1) actor.Update(LIE_SETTLE_S, state);
          human.lieLocal = this._MeasureLie(human);
          if (human.lieLocal) this._PlaceLying(human, x, z, ry);
        }
      }
      if (cameraPosition) actor.SetShadowEnabled(distance < BLOCKOUT_PUPPETS.shadowM);
    }
  }

  Update(dt, cameraPosition) {
    this.frame += 1;
    let rate = 1;
    if (this.plan) {
      rate = this.plan.playbackRate || 1;
      this.planTime += dt * rate;
      this._SamplePlan(false);
      if (this.planTime >= this.plan.durationS) this._Finish();
    }
    this.elapsed += dt * rate;
    for (const puppet of this.puppets.values()) this._Pose(puppet, dt * rate, false, cameraPosition);
    this._StepBlankets();
  }

  // -------------------------------------------------------------------------
  // 正式模型（2026-10-20，文件头）

  /** 车的牲口：unit.draft 优先，名字带「牛」用牛，其余用马。 */
  _DraftKind(unit) {
    if (unit.draft === "ox" || unit.draft === "horse") return unit.draft;
    return /牛/.test(unit.name || "") ? "ox" : "horse";
  }

  _LoadDraft() {
    if (this.draftLoading) return;
    this.draftLoading = LoadDraftCartAssets().then((assets) => { this.draftAssets = assets; })
      .catch((error) => { console.warn("[BlockoutPuppets] draft cart models failed; carts stay blocks", error); this.draftAssets = false; });
  }

  /** 体块换正式模型（只试一次；车与牲口要等模型下完）。→ userData.model = { tank, turret } | { draft, kind, … } | null */
  _DressModel(puppet) {
    const body = puppet.body, unit = puppet.unit;
    if (!body?.userData.boxes || body.userData.model !== undefined) return;
    let model = null;
    if (unit.kind === "tank" && TankShape(unit) === "tankette") {
      // 九四式轻装甲车没有正式模型（八九式那辆带炮，不对）：一直用体块
      body.userData.model = null;
      return;
    }
    if (unit.kind === "tank") {
      const library = this.library;
      if (!library?.Get) { body.userData.model = null; return; }
      const armor = library.Get("Type89Armor", { side: THREE.DoubleSide });
      const tank = this.actorFactory?.ModelInstance?.(BLOCKOUT_PUPPETS.tankModel,
        { type89Armor: armor, type89Barrel: armor, type89Track: library.Get("Type89Track", { side: THREE.DoubleSide }) }) || null;
      if (tank) {
        tank.root.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
        body.add(tank.root);
        model = { tank, turret: tank.nodes?.get?.("turret") || null };
      }
    } else if (unit.kind === "litter" && IsBlanketLitter(unit)) {
      // 01–05 的「单被」（拖着走的被子）：上传的五补丁单被，头端朝前（资产头端 +Z，这里前方是 −Z，转 180°）
      if (this.blanketAsset === null) {
        this.blanketAsset = LoadBlockoutBlanket().then((asset) => { this.blanketAsset = asset; })
          .catch((error) => { console.warn("[BlockoutPuppets] blanket model failed; blankets stay blocks", error); this.blanketAsset = false; });
      }
      if (this.blanketAsset instanceof Promise) return;
      if (this.blanketAsset) {
        const blanket = CreateBlockoutBlanket(this.blanketAsset);
        blanket.root.rotation.y = Math.PI;
        body.userData.stretcher.add(blanket.root);
        model = { blanket };
      }
    } else if (unit.kind === "litter") {
      const geometry = StretcherAssetGeometry();
      if (!geometry) {
        // 开机本来就读了；万一还没到（或读失败）就再要一次，到了的那一帧换，失败就一直是体块
        if (!this.stretcherLoading) this.stretcherLoading = LoadStretcherAsset().catch((error) => { console.warn("[BlockoutPuppets] stretcher model failed; litters stay blocks", error); this.stretcherFailed = true; });
        if (!this.stretcherFailed) return;
      } else {
        const L = BLOCKOUT_PUPPETS.litter;
        this.stretcherMaterial ||= CreateStretcherMaterial();
        const mesh = new THREE.Mesh(geometry, this.stretcherMaterial);
        mesh.name = "BlockoutBambooStretcher";
        mesh.rotation.y = L.modelYaw;
        mesh.position.y = L.modelY;
        mesh.castShadow = true; mesh.receiveShadow = true;
        body.userData.stretcher.add(mesh);
        model = { stretcher: mesh };
      }
    } else if (unit.kind === "cart" || unit.kind === "animal") {
      if (this.draftAssets === null) { this._LoadDraft(); return; }
      if (this.draftAssets) {
        const kind = unit.kind === "animal" ? "horse" : this._DraftKind(unit);
        const draft = CreateDraftCartInstance(this.draftAssets, kind);
        draft.cartRoot.position.set(0, 1, 0);   // 车模型里垫了 −1（车轴高的翻车枢轴）：车底贴着 body 的地面
        if (unit.kind === "animal") { draft.cartRoot.visible = false; draft.animalRoot.position.set(0, 0, 0); }
        else draft.animalRoot.position.set(0, 0, -draft.teamOffsetM);
        body.add(draft.root);
        model = { draft, kind, travelM: 0, last: null };
      }
    }
    body.userData.model = model;
    if (model) { body.userData.boxes.visible = false; body.userData.whiteboxCharacter = true; }
  }

  /** 每帧：炮塔对着射界扇；车轮、牲口按走过的路程迈步；倒地的牲口侧躺；车前另有牲口单位时藏自己的；被子拖着走时兜起来。 */
  _PoseModel(puppet, dt = 0, force = false) {
    this._DressModel(puppet);
    const model = puppet.body.userData.model;
    if (!model) return;
    if (model.blanket) {
      // 被子贴着担架组底下的地面（担架组被 LitterPose 抬到 groundY，这里抵回去，留 5 mm 防闪）
      const bed = puppet.body.userData.stretcher;
      model.blanket.root.position.y = -(bed?.position.y || 0) + BLOCKOUT_PUPPETS.blanketLiftM;
      if (!model.blanket.cloth) { model.blanket.SetDrag(puppet.moving ? 1 : 0, dt); return; }
      // 布料：所有人摆完之后再推（_StepBlankets，要读这一帧的手和身体）；这里只攒时间
      model.clothDt = (model.clothDt || 0) + dt;
      if (force && dt <= 0) model.clothReset = true;
      return;
    }
    const unit = puppet.unit;
    if (model.turret) {
      const arcYaw = Number.isFinite(unit.arc?.yawDeg) ? unit.arc.yawDeg : puppet.yawDeg;
      model.turret.rotation.y = (arcYaw - puppet.yawDeg) * DEG;
    }
    if (!model.draft) return;
    const P = BLOCKOUT_PUPPETS, draft = model.draft;
    const step = model.last ? Math.hypot(puppet.x - model.last.x, puppet.z - model.last.z) : 0;
    const walking = step > 1e-4 && step < P.teleportM && !puppet.down;
    if (walking) model.travelM += step;
    model.last = { x: puppet.x, z: puppet.z };
    draft.SetMotion(model.travelM, walking);
    if (unit.kind === "animal") {
      draft.animalRoot.rotation.z = puppet.down ? P.animalDown.rollRad : 0;
      draft.animalRoot.position.y = puppet.down ? P.animalDown.liftM : 0;
    } else {
      let hitched = unit.animal === false;
      if (!hitched) {
        const ry = puppet.yawDeg * DEG, hx = puppet.x - Math.sin(ry) * draft.teamOffsetM, hz = puppet.z - Math.cos(ry) * draft.teamOffsetM;
        for (const other of this.puppets.values()) {
          if (other.unit.kind === "animal" && other.visible && Math.hypot(other.x - hx, other.z - hz) < P.hitchedAnimalM) { hitched = true; break; }
        }
      }
      draft.animalRoot.visible = !hitched;
    }
  }

  // -------------------------------------------------------------------------
  // 单被的布料（2026-10-21，Script_BlanketCloth；文件头）

  /** 所有人摆完之后推被子的布料：reset = 重新铺平再空推（Apply / 关键帧跳转 / Seek 的第一步，确定性）。 */
  _StepBlankets(reset = false) {
    for (const puppet of this.puppets.values()) {
      const model = puppet.body?.userData.model, blanket = model?.blanket;
      if (!blanket?.cloth) continue;
      const dt = model.clothDt || 0;
      model.clothDt = 0;
      if (!puppet.visible) { model.clothReset = true; continue; }
      const env = this._BlanketEnv(puppet, blanket, dt);
      env.reset = reset || !!model.clothReset;
      model.clothReset = false;
      try { blanket.Simulate(dt, env); }
      catch (error) { console.warn("[BlockoutPuppets] blanket cloth failed; static poses", error); blanket.cloth = null; blanket.SetDrag(0); }
    }
  }

  /**
   * 这一帧被子的手、身体与地面。
   * 手：别的单位里此刻 carryRole "front"、看得见、站在被头 dragReachM 内的人，按他在被子的哪一侧拽哪个角，用那一侧更靠外的
   *   那只手（拖人片段 PvBlanketDragL/R 是外侧那只拳头攥着被角）的掌心（rig.grips）。只有一边有人拽（另一边是玩家 / 镜头）时，
   *   另一角取这只手在被子中线另一侧的镜像位置；都没人拽、被子却在走（松手后往掩体后一拽、关键帧过渡）时两角贴地跟着被子走
   *   （groundGrip：静止平铺时的头角，贴地），不悬空。两手比被头宽（片段按 1.6 m 宽的被子摆的拳头）时两边往里收到 maxGripSpan。
   * 身体：倒着、骨盆落在被子范围里的人（冬瓜）整身胶囊（压在身下的布跟着他走）；拽被角的人的两条腿（布从拳头垂下去别穿过小腿）。
   */
  _BlanketEnv(puppet, blanket, dt) {
    const B = BLOCKOUT_PUPPETS.blanketCloth;
    const head = blanket.AssetPoint(0, 0, B.headZ, new THREE.Vector3());
    const grips = { headL: null, headR: null }, gripAsset = { headL: null, headR: null };
    const colliders = [];
    for (const other of this.puppets.values()) {
      if (other === puppet || !other.visible || !other.humans.length) continue;
      const human = other.humans[0], actor = human.actor, rig = actor.characterRig;
      if (!rig?.bones || !actor.root.visible) continue;
      const role = other.drive ? other.drive.carryRole : other.unit.carryRole;
      if (role === "front" && !other.down) {
        if (Math.hypot(actor.root.position.x - head.x, actor.root.position.z - head.z) > B.dragReachM) continue;
        actor.root.updateMatrixWorld(true);
        const side = blanket.ToAsset(actor.root.position, new THREE.Vector3()).x >= 0 ? 1 : -1;
        const key = side > 0 ? "headL" : "headR";
        let best = null;
        for (const hand of [rig.grips?.weaponL || rig.bones.handL, rig.grips?.weaponR || rig.bones.handR]) {
          if (!hand) continue;
          const a = blanket.ToAsset(new THREE.Vector3().setFromMatrixPosition(hand.matrixWorld), new THREE.Vector3());
          if (!best || a.x * side > best.x * side) best = a;
        }
        // 手离这个被角的静止位置太远（人物模型还没跟上一次大跳、别处的人）不算
        if (best && Math.hypot(best.x - side * B.headHalfWidthM, best.y, best.z - B.headZ) > B.maxGripReachM) best = null;
        if (best && !gripAsset[key]) gripAsset[key] = best;
        colliders.push(...BodyCapsules(rig, actor.root.scale.x || 1, { legsOnly: true }));
      } else if (other.down) {
        actor.root.updateMatrixWorld(true);
        const pelvis = rig.bones.pelvis ? new THREE.Vector3().setFromMatrixPosition(rig.bones.pelvis.matrixWorld) : null;
        if (!pelvis) continue;
        const a = blanket.ToAsset(pelvis, new THREE.Vector3());
        if (Math.abs(a.x) > B.riderHalfWidthM || Math.abs(a.z) > B.riderHalfLengthM) continue;
        // 压在身下的布跟着他走：速度从骨盆这两帧的位移算
        const last = human.clothPelvis;
        const carry = last && dt > 0 && last.distanceTo(pelvis) < 1 ? [(pelvis.x - last.x) / dt, (pelvis.z - last.z) / dt] : [0, 0];
        (human.clothPelvis ||= new THREE.Vector3()).copy(pelvis);
        colliders.push(...BodyCapsules(rig, actor.root.scale.x || 1, { press: true, carry }));
      }
    }
    // 只有一边有人：另一边镜像（另一角是玩家镜头攥着）；都没人但被子在走：两角贴地跟着被子走。
    // 2026-10-23 dragSolo（被子单位 / 预演键）：只认真有手攥着的角，另一角不镜像、落地 —— 1218 14-2 顺子扑倒松了手、只剩妮儿攥着一个角在拽。
    const solo = puppet.drive && puppet.drive.dragSolo !== undefined ? !!puppet.drive.dragSolo : !!puppet.unit.dragSolo;
    if (solo) { /* 没手的角就空着 */ }
    else if (gripAsset.headL && !gripAsset.headR) gripAsset.headR = new THREE.Vector3(-gripAsset.headL.x, gripAsset.headL.y, gripAsset.headL.z);
    else if (gripAsset.headR && !gripAsset.headL) gripAsset.headL = new THREE.Vector3(-gripAsset.headR.x, gripAsset.headR.y, gripAsset.headR.z);
    else if (!gripAsset.headL && !gripAsset.headR && puppet.moving) {
      gripAsset.headL = new THREE.Vector3(B.groundGrip.x, B.groundGrip.y, B.groundGrip.z);
      gripAsset.headR = new THREE.Vector3(-B.groundGrip.x, B.groundGrip.y, B.groundGrip.z);
    }
    if (gripAsset.headL && gripAsset.headR) {
      const span = gripAsset.headL.distanceTo(gripAsset.headR), max = 2 * B.headHalfWidthM * B.maxGripSpan;
      if (span > max) {
        const mid = gripAsset.headL.clone().add(gripAsset.headR).multiplyScalar(0.5), k = max / span;
        gripAsset.headL.sub(mid).multiplyScalar(k).add(mid);
        gripAsset.headR.sub(mid).multiplyScalar(k).add(mid);
      }
    }
    for (const key of ["headL", "headR"]) if (gripAsset[key]) grips[key] = blanket.AssetPoint(gripAsset[key].x, gripAsset[key].y, gripAsset[key].z, new THREE.Vector3());
    return { groundAt: this.groundAt, grips, colliders };
  }

  // -------------------------------------------------------------------------
  // 挂到车上（§3 / §5.6 ride，2026-10-20）

  /** 这个 puppet 此刻挂在谁身上：预演驱动写了 ride 用它（null = 下车），否则用关键帧单位的。→ { on, x, z, y, yawDeg } | null */
  _RideOf(puppet) {
    const drive = puppet.drive;
    const r = drive && drive.ride !== undefined ? drive.ride : puppet.unit.ride;
    return r && typeof r.on === "string" && r.on && r.on !== puppet.id ? r : null;
  }

  /**
   * 车（cart / tank / litter）此刻的位姿，从它自己的状态算（驱动值优先；不读 three 对象，所以这一帧先摆谁都一样）。
   * y = 车底下地面（战车按脚印最高点）；担架当车时 y 是担架面中心。depth 防一层层挂（校验本来就不许）。→ { x, z, y, yawDeg } | null
   */
  _CarrierPose(id, depth = 0) {
    const carrier = this.puppets.get(id);
    if (!carrier || depth > 2) return null;
    const d = carrier.drive;
    const x = d ? d.x : carrier.x, z = d ? d.z : carrier.z, yawDeg = d ? d.yawDeg : carrier.yawDeg;
    const ride = this._RideOf(carrier);
    const above = ride ? this._CarrierPose(ride.on, depth + 1) : null;
    const pose = above ? RideWorldPose(above, ride) : { x, z, yawDeg, y: carrier.unit.kind === "tank" ? TankGroundY(this.groundAt, x, z, yawDeg, TankShape(carrier.unit)) : this.groundAt(x, z) };
    if (carrier.unit.kind === "litter") pose.y += above ? 0 : LitterPose(carrier.unit, d ? d.state === "down" : !!carrier.down).y;
    return pose;
  }

  /** 挂着时这个 puppet 的世界位姿（含 y）；没挂 / 车不在场 → null。 */
  _Seat(puppet) {
    const ride = this._RideOf(puppet);
    if (!ride) return null;
    const carrier = this._CarrierPose(ride.on);
    return carrier ? { ...RideWorldPose(carrier, ride), on: ride.on, carrierY: carrier.y } : null;
  }

  // -------------------------------------------------------------------------
  // 预演的外部驱动（§14.2）

  /**
   * 背枪步态（2026-10-20，文件头）：拿步枪、不戒备的人 "slung"；其余照旧（空手 "unarmed"、日军不戒备 "alert"、
   * 戒备的 null 交给原生 / 友军步态）。→ 这个人此刻是不是背枪的。
   */
  _SyncGait(human, aim) {
    const soldier = human.soldier, weapon = human.actor.weaponId ?? null;
    const relaxed = !aim && BLOCKOUT_PUPPETS.slungWeapons.includes(weapon);
    const mode = !weapon && human.bodyKind !== "civilian" ? "unarmed" : relaxed ? "slung"
      : human.bodyKind === "ija" && !aim ? "alert" : null;
    if ((soldier.relaxedGait || null) !== mode) SetRelaxedGait(soldier, mode);
    return relaxed;
  }

  /** 拿步枪、不戒备、蹲着不动、没在播片段：换成歇着的片段（BLOCKOUT_PUPPETS.crouchRestClip）；其余原样返回 drive。 */
  _RestDrive(puppet, human, drive, { relaxed, mps, carryRole, seat }) {
    if (!relaxed || drive?.clip || drive?.throw || human.slot !== "main" || puppet.stance !== "crouch" || mps > 0.05
      || puppet.down || carryRole || seat || !this.opening?.library) return drive;
    const clip = BLOCKOUT_PUPPETS.crouchRestClip;
    const duration = this.opening.api.OpeningClipMeta?.(clip)?.duration || 4;
    return { ...(drive || {}), clip, clipSeconds: (this.elapsed + puppet.stagger * 0.013) % duration };
  }

  /**
   * 背枪步态在用时把手里的枪挂到背上（RelaxedGait 的背枪挂点）；没在用（蹲、趴、播片段、投弹、戒备）时手里的枪拿回来。
   * 正在播开场动作库片段的人由动作层自己管（它每帧也调 UpdateRelaxedGaitWeapon）。
   */
  _UpdateSlungRifle(human, relaxed) {
    const soldier = human.soldier, actor = human.actor, rig = actor.characterRig;
    if (!rig || !actor.weaponGroup || soldier.openingStoryboardPose) return;
    if (!relaxed && !rig.relaxedGaitRifle?.visible) return;
    // 倒下了不背枪（2026-10-21）：倒地后 Actor 不再推步态层，relaxedGaitActive 停在站着时的值，枪会竖着戳在躺着的人背上；
    // 拿回手里，倒地动作照样把它摆在身边（同造出来就倒着的人）
    const onBack = relaxed && !actor.ragdollState && RelaxedGaitShown(soldier);
    UpdateRelaxedGaitWeapon(soldier, onBack);
    if (!onBack) actor.weaponGroup.visible = true;
  }

  /** 开场动作库的片段（clip / clipSeconds）：第一次要片段时才给这个人装那一层（库没下完前照原生动画）。 */
  _ApplyClip(human, drive, mps, dt = 0) {
    const soldier = human.soldier;
    const clip = PREVIZ_CLIP_REMAP[drive?.clip] ?? drive?.clip ?? null;
    if (clip && !human.openingInstalled && this.opening?.library) {
      try { this.opening.api.InstallOpeningStoryboardAnimation(soldier); human.openingInstalled = true; }
      catch (error) { console.warn("[BlockoutPuppets] opening layer install failed", error); human.openingInstalled = "failed"; }
    }
    if (human.openingInstalled !== true) return null;
    if (!clip) {
      soldier.openingStoryboardPose = null;
      soldier.openingStoryboardTravel = null;
      human.clipSeconds = null;
      return null;
    }
    const seconds = Math.max(0, drive.clipSeconds || 0);
    const meta = this.opening.api.OpeningClipMeta(clip) || {};
    const pose = { clip, seconds };
    // 预演键 clipRelease（片段秒数）：带停住段的片段到这一秒放开、接着放出口（撒尿系裤子、被咬甩手后仰）
    if (Number.isFinite(drive.clipRelease)) pose.holdUntil = drive.clipRelease;
    // 走着放的片段（manifest referenceSpeedMps，如 IjaWalkStabProne）：开场动作层按「走了多远」推它的身体时钟，
    // 而枪道具按 pose.seconds 取 —— 原地放时身体停在第一帧、枪跑到后面的帧，枪就脱手悬空。
    // 照开场导演的握法：身体时钟按片段秒数的增量喂（openingStoryboardTravel），枪交给双手（weaponHold）。
    let travel = mps > 0.05 ? mps : null;
    if (meta.referenceSpeedMps > 0) {
      const last = human.clipName === clip && Number.isFinite(human.clipSeconds) ? human.clipSeconds : seconds;
      const advance = Math.max(0, seconds - last);
      travel = dt > 1e-4 ? meta.referenceSpeedMps * advance / dt : 0;
      // 2026-10-19：原地循环的走 / 爬片段（拖被子、架伤员、抱捆爬、猫腰拽人）跟着人走：身体时钟按实际速度推
      // （播放速率 = 实际速度 / referenceSpeedMps，开场动作层自己换算），站住就停在那一帧，脚不滑。
      if (meta.loop === true) travel = mps > 0.05 ? mps : 0;
      pose.weaponHold = meta.weaponHold || "twoHand";
    }
    human.clipName = clip; human.clipSeconds = seconds;
    soldier.openingStoryboardPose = pose;
    // 走着放站姿片段：腿交给原生步态
    soldier.openingStoryboardTravel = travel;
    // 拿刺刀扎人的片段（contacts 里有 blade / stab）要上刺刀，开场导演造这个人时就给 bayonetFixed
    const bayonetFixed = (meta.contacts || []).some(c => c.limb === "blade" && c.action === "stab");
    return { bayonetFixed };
  }

  /**
   * 投弹（预演键 throw）：GrenadeThrow 片段按 drive.throw.seconds 定时间（这一步 mixer 再推 step 正好到那一秒）。
   * → 这一帧是不是在抡。只管主角本人。
   */
  _ApplyThrow(human, drive, step) {
    const th = human.slot === "main" ? drive?.throw : null;
    const actor = human.actor, rig = actor.characterRig;
    if (th && rig) {
      const clip = rig.clipById?.get?.("GrenadeThrow");
      if (!clip) { this.missingClips.add("GrenadeThrow"); return false; }
      if (rig.forcedClip !== "GrenadeThrow") {
        if (human.openingInstalled === true) { human.soldier.openingStoryboardPose = null; human.soldier.openingStoryboardTravel = null; }
        actor.PlayImportedAnimation("GrenadeThrow");
        human.throwing = true;
      }
      if (rig.currentAction && rig.currentId === "GrenadeThrow") {
        rig.currentAction.time = Math.max(0, Math.min(clip.duration, th.seconds - Math.max(0, step)));
      }
      return true;
    }
    if (human.throwing) { try { actor.ClearImportedAnimation(); } catch (error) { /* 已回收 */ } human.throwing = false; }
    return false;
  }

  /** 这个人此刻要不要按 lie:"along" 摆：倒地、不是担架上的抬杆人、没在播片段。 */
  _LieAlong(puppet, human, drive) {
    if (!puppet.down || puppet.unit.kind === "litter" || human.slot !== "main" || drive?.clip) return false;
    return (drive ? drive.lie : puppet.unit.lie) === "along";
  }

  /**
   * 量倒地姿态：头与骨盆在人物本地（root 系）的位置 → { a: 头相对骨盆的本地朝向（弧度，同 yaw 口径），px, pz: 骨盆本地 xz }。
   * 只在落定后量一次（之后姿态不变）。量不出来（没有骨骼）→ null，照原样摆。
   */
  _MeasureLie(human) {
    const actor = human.actor, rig = actor.characterRig;
    const head = rig?.bones?.head || actor.head, pelvis = rig?.bones?.pelvis || actor.hips;
    if (!head || !pelvis) return null;
    const points = [];
    try {
      actor.root.updateWorldMatrix(true, true);
      _lieM.copy(actor.root.matrixWorld).invert();
      head.getWorldPosition(_lieV).applyMatrix4(_lieM);
      pelvis.getWorldPosition(_lieP).applyMatrix4(_lieM);
      points.push([_lieV.x, _lieV.z], [_lieP.x, _lieP.z]);
      for (const name of ["footL", "footR"]) {
        const bone = rig?.bones?.[name];
        if (bone) { const v = bone.getWorldPosition(new THREE.Vector3()).applyMatrix4(_lieM); points.push([v.x, v.z]); }
      }
    } catch (error) { return null; }
    const vx = _lieV.x - _lieP.x, vz = _lieV.z - _lieP.z;
    if (Math.hypot(vx, vz) < 0.15) return null;
    // 2026-10-18 第三轮：不再把骨盆放在单位位置上，而是把「头、骨盆、两脚」的包围框中心放上去，
    // 身体轴在「骨盆→头」±LIE_FIT_MAX_DEG 里取横向最窄的方向（倒地片段都是侧身蜷腿，骨盆居中时脚伸出 0.7 m 宽的被子）。
    const a0 = Math.atan2(-vx, -vz);
    let best = null;
    for (let deg = -LIE_FIT_MAX_DEG; deg <= LIE_FIT_MAX_DEG; deg += 1) {
      const a = a0 + deg * DEG, fx = -Math.sin(a), fz = -Math.cos(a), sx = -fz, sz = fx;   // 前（头）与横向
      let fMin = Infinity, fMax = -Infinity, sMin = Infinity, sMax = -Infinity;
      for (const [x, z] of points) {
        const f = x * fx + z * fz, l = x * sx + z * sz;
        fMin = Math.min(fMin, f); fMax = Math.max(fMax, f); sMin = Math.min(sMin, l); sMax = Math.max(sMax, l);
      }
      const width = sMax - sMin + Math.abs(deg) * 1e-4;   // 一样窄时取偏得少的
      if (!best || width < best.width) {
        const f = (fMin + fMax) / 2, l = (sMin + sMax) / 2;
        best = { width, a, px: f * fx + l * sx, pz: f * fz + l * sz };
      }
    }
    return { a: best.a, px: best.px, pz: best.pz };
  }

  /** 2026-10-19：顺着躺（lie:"along"）的倒地的人正在播片段（躺姿片段，如 PvLieGrabSleeve）：按片段里身体的方向摆。 */
  _LieClip(puppet, human, drive) {
    if (!puppet.down || puppet.unit.kind === "litter" || human.slot !== "main" || !drive?.clip) return false;
    return drive.lie === "along" || (drive.lie === undefined && puppet.unit.lie === "along");
  }

  /**
   * 2026-10-19：原地播的翻沟片段（清单 rootPath.keys = [[t, 往前, 往上], …]，运行时米）：根顺着朝向往前、往上挪。
   * 片段按 1.4 m 深的沟写；往上的量按「片段末尾那一点的地面 − 起点地面」等比放大 / 缩小（沟深 2 m 就放大到 2 m）。
   * 预演在片段播完时把人用位置键挪到末尾那一点（Script_EditorBlockoutFirstLevel0105Previz ClimbOut）。
   */
  _ApplyRootPath(human, drive, ry) {
    const clip = drive?.clip;
    const keys = clip && this.opening?.api.OpeningClipMeta(clip)?.rootPath?.keys;
    if (!Array.isArray(keys) || keys.length < 2 || human.slot !== "main") return;
    const t = Math.max(0, drive.clipSeconds || 0);
    let i = 1;
    while (i < keys.length - 1 && keys[i][0] < t) i++;
    const a = keys[i - 1], b = keys[i], span = b[0] - a[0];
    const w = span > 1e-6 ? Math.max(0, Math.min(1, (t - a[0]) / span)) : 1, s = w * w * (3 - 2 * w);
    const fwd = a[1] + (b[1] - a[1]) * s, up = a[2] + (b[2] - a[2]) * s;
    const end = keys[keys.length - 1], fx = -Math.sin(ry), fz = -Math.cos(ry);
    const root = human.actor.root, x0 = root.position.x, z0 = root.position.z, y0 = root.position.y;
    const rise = this.groundAt(x0 + fx * end[1], z0 + fz * end[1]) - y0;
    const k = end[2] > 1e-3 && rise > 0.2 ? Math.max(0.5, Math.min(2.5, rise / end[2])) : 1;
    root.position.set(x0 + fx * fwd, y0 + up * k, z0 + fz * fwd);
  }

  /** lie:"along"：把人转到「头朝 ry 的前方」，身体（头、骨盆、两脚）的包围框中心落在 (x, z)。 */
  _PlaceLying(human, x, z, ry, L = human.lieLocal) {
    const actor = human.actor, k = actor.root.scale.x || 1;
    const r = ry - L.a, c = Math.cos(r), s = Math.sin(r);
    const ox = (L.px * c + L.pz * s) * k, oz = (-L.px * s + L.pz * c) * k;
    actor.root.position.x = x - ox;
    actor.root.position.z = z - oz;
    actor.root.rotation.y = r;
    human.soldier.yaw = r;
  }

  /** 手里的武器：预演键写过 weapon 用它，否则用造人时 / 关键帧给的那把（交还驱动后换回去）。只管主角本人，不管抬担架的。 */
  _SyncWeapon(human, drive) {
    if (human.slot !== "main") return;
    const want = drive && drive.weapon !== undefined ? drive.weapon : human.baseWeapon;
    if ((human.actor.weaponId ?? null) === (want ?? null)) return;
    try { human.actor.SetWeapon(want || null); }
    catch (error) { console.warn("[BlockoutPuppets] SetWeapon failed", want, error); human.baseWeapon = human.actor.weaponId ?? null; }
  }

  /** 倒地的人：身体投影范围（中心与前后左右 0.9 m）里最低的地面。 */
  DownGround(x, z) {
    const r = DOWN_REACH_M;
    return Math.min(this.groundAt(x, z), this.groundAt(x + r, z), this.groundAt(x - r, z), this.groundAt(x, z + r), this.groundAt(x, z - r));
  }

  /**
   * 要在本关下载的定妆模型（loadOnDemand：翻译的 NRA06）先下完：units 里带 castId 的人都算上。
   * 没下完就造人出来的是方块占位人。→ Promise（失败也 resolve，造出来照旧是占位）。
   */
  async PrepareCasts(units) {
    const library = this.actorFactory?.characterAssets;
    const specs = [...new Set((units || []).map(u => u?.castId).filter(id => id && Object.hasOwn(FIRST_LEVEL_SPEAKING_CAST, id)))]
      .map(id => FIRST_LEVEL_SPEAKING_CAST[id]);
    if (!library || !specs.length) return [];
    try { return await LoadLugouCastModels(library, specs); }
    catch (error) { console.warn("[BlockoutPuppets] cast model load failed", error); return []; }
  }

  /** 开场动作库（Script_OpeningStoryboardAnimation）：预演用到片段时由预演交进来 { api, library }。 */
  SetOpeningLibrary(opening) { this.opening = opening || null; }

  /** 按 id 取演员（预演找嘴、找头、找枪口用）。 */
  Get(id) { return this.puppets.get(id) || null; }

  /** 临时加一个人（预演 spawn，只活在这段预演里；ReleaseDrive 时回收）。 */
  Spawn(unit, cameraPosition = null) {
    let puppet = this.puppets.get(unit.id);
    if (puppet && !puppet.temp) return puppet;
    if (puppet) { this._Destroy(puppet); this.puppets.delete(unit.id); }
    const need = unit.kind === "litter" ? LitterSlots(unit).length : ["tank", "cart", "animal"].includes(unit.kind) ? 0 : 1;
    puppet = this._Create(unit, this.actorCount + need <= BLOCKOUT_PUPPETS.maxActors ? need : 0);
    puppet.temp = true;
    this.puppets.set(unit.id, puppet);
    this._Pose(puppet, 0, true, cameraPosition);
    return puppet;
  }

  /** 外部驱动这一帧的状态（SamplePrevizActor 的结果）；null = 不再驱动。 */
  Drive(id, state) {
    const puppet = this.puppets.get(id);
    if (!puppet) return false;
    puppet.drive = state || null;
    // 挂在车上时位置键不管用：报一次（校验那头也会警告）
    if (state?.ride && state.moving && !puppet.rideMoveWarned) {
      puppet.rideMoveWarned = true;
      console.warn(`[BlockoutPuppets] ${id} 挂在 ${state.ride.on} 上，预演里的位置键不管用（要下车先写 ride: null）`);
    }
    return true;
  }

  /** 预演结束：临时加的人回收，被驱动的人交还（位置由随后的 Apply 摆回关键帧布设）。 */
  ReleaseDrive() {
    for (const [id, puppet] of this.puppets) {
      if (puppet.temp) { this._Destroy(puppet); this.puppets.delete(id); continue; }
      puppet.drive = null;
      for (const human of puppet.humans) {
        if (human.openingInstalled === true) { human.soldier.openingStoryboardPose = null; human.soldier.openingStoryboardTravel = null; }
        if (human.throwing) { try { human.actor.ClearImportedAnimation(); } catch (error) { /* */ } human.throwing = false; }
        const facial = human.actor.characterRig?.facial;
        if (facial && human.facialBound) { facial.source = null; human.facialBound = false; }
      }
    }
  }

  /** 确定性取样（预演 Seek）：按当前驱动状态连推几步小 dt，让动作层 / 片段混合收敛到同一个姿态。 */
  Settle(steps = 10, dt = 0.05, cameraPosition = null) {
    for (let i = 0; i < steps; i++) {
      for (const puppet of this.puppets.values()) {
        for (const human of puppet.humans) human.animDt = 0;
        this._Pose(puppet, dt, true, cameraPosition);
      }
      // 被子：等人物收敛了（最后一步）再重新铺平、按那时的手空推（大跳之后头一两步人物模型还没跟上，手在上一个时刻的地方）；
      // 之前的步只攒时间不推
      if (i === steps - 1) this._StepBlankets(true);
    }
  }

  /** 取证：某个演员此刻的样子（播的动作、姿态、脚下高度、定妆身体、骨盆 / 头离地）。 */
  Probe(id) {
    const puppet = this.puppets.get(id);
    if (!puppet) return null;
    const human = puppet.humans[0];
    const rig = human?.actor.characterRig;
    const ground = puppet.unit.kind === "tank" ? TankGroundY(this.groundAt, puppet.x, puppet.z, puppet.yawDeg, TankShape(puppet.unit)) : this.groundAt(puppet.x, puppet.z);
    let pelvisY = null, headY = null, pelvisXZ = null, headXZ = null, handR = null, handL = null;
    const feet = [];
    try {
      human?.actor.root.updateWorldMatrix(true, true);
      if (rig?.bones?.pelvis) { const v = rig.bones.pelvis.getWorldPosition(new THREE.Vector3()); pelvisY = v.y; pelvisXZ = { x: v.x, z: v.z }; }
      if (rig?.bones?.head) { const v = rig.bones.head.getWorldPosition(new THREE.Vector3()); headY = v.y; headXZ = { x: v.x, z: v.z }; }
      for (const name of ["footL", "footR"]) {
        const bone = rig?.bones?.[name];
        if (bone) { const v = bone.getWorldPosition(new THREE.Vector3()); feet.push({ x: v.x, y: v.y, z: v.z }); }
      }
      // 两手的世界坐标（2026-10-19：量片段是不是真把手举起来 / 放下去了）
      if (rig?.bones?.handR) { const v = rig.bones.handR.getWorldPosition(new THREE.Vector3()); handR = { x: v.x, y: v.y, z: v.z }; }
      if (rig?.bones?.handL) { const v = rig.bones.handL.getWorldPosition(new THREE.Vector3()); handL = { x: v.x, y: v.y, z: v.z }; }
    } catch (error) { /* 取证不影响运行 */ }
    // 头相对骨盆的世界朝向（yaw 口径）：lie:"along" 时应当 ≈ yawDeg
    const headYawDeg = pelvisXZ && headXZ ? Math.atan2(-(headXZ.x - pelvisXZ.x), -(headXZ.z - pelvisXZ.z)) / DEG : null;
    return {
      id, kind: puppet.unit.kind, x: puppet.x, z: puppet.z, yawDeg: puppet.yawDeg, stance: puppet.stance, visible: puppet.visible,
      driven: !!puppet.drive, temp: !!puppet.temp, ground, centerGround: this.groundAt(puppet.x, puppet.z),
      bodyY: puppet.body ? puppet.body.position.y : null, actors: puppet.humans.length,
      clip: human?.soldier.openingStoryboardPose?.clip || null, currentId: rig?.currentId || null, modelId: rig?.modelId || null,
      castId: human?.castId || null, facial: !!rig?.facial, modelVariant: human?.actor.modelVariant ?? null,
      pelvisAboveGround: pelvisY !== null ? pelvisY - ground : null, headAboveGround: headY !== null ? headY - ground : null,
      down: !!puppet.down, lie: (puppet.drive ? puppet.drive.lie : puppet.unit.lie) || null, moving: !!puppet.moving,
      pelvis: pelvisXZ, head: headXZ, headYawDeg, rootYawDeg: human ? human.actor.root.rotation.y / DEG : null,
      weapon: human?.actor.weaponId ?? null, dead: !!human?.actor.ragdollState,
      headY, pelvisY, feet, throwing: !!human?.throwing, deathVariant: rig?.deathVariantId ?? null,
      grenadeVisible: !!human?.actor.grenadeGroup?.visible,
      throwClipS: rig?.clipById?.get?.("GrenadeThrow")?.duration ?? null,
      // 2026-10-19：身体种类、两手、动画时钟（慢动作取证）、开场动作层正在播的片段与进度
      body: human?.body ?? null, bodyKind: human?.bodyKind ?? null, rigged: !!rig, handR, handL,
      // 2026-10-20：背枪步态的模式、手里 / 背上有没有枪
      gait: human?.soldier.relaxedGait ?? null,
      rifleInHand: !!(human?.actor.weaponGroup?.visible && human.actor.weaponId),
      rifleOnBack: !!(rig?.relaxedGaitRifle?.visible || rig?.openingSlungRifle?.visible),
      mixerTime: rig?.mixer?.time ?? null,
      shownClip: rig?.openingStoryboardState?.clipId ?? null, shownClipSeconds: rig?.openingStoryboardState?.seconds ?? null,
      hiddenParts: rig ? (() => { let n = 0; rig.root.traverse(o => { if (o.userData?.blockoutCivilianHidden) n++; }); return n; })() : 0,
      // 2026-10-20：挂在车上 —— ride 写的是什么、这一帧算出来的座位（世界位姿 + 车底下地面）、根离车底下地面多高
      ride: (() => { const r = this._RideOf(puppet); return r ? { on: r.on, x: r.x ?? 0, z: r.z ?? 0, y: r.y ?? 0, yawDeg: r.yawDeg ?? 0 } : null; })(),
      seat: puppet.seat ? { ...puppet.seat } : null,
      rootY: human ? human.actor.root.position.y : (puppet.body ? puppet.body.position.y : null),
      // 2026-10-20：正式模型（"Type89Tank" / "ox" / "horse"；null = 还是体块）与车自己的牲口显不显示
      model: (() => { const m = puppet.body?.userData.model; return m?.tank ? BLOCKOUT_PUPPETS.tankModel : m?.stretcher ? "BambooStretcher" : m?.blanket ? "SingleBlanket" : m?.kind ?? null; })(),
      blanketDrag: puppet.body?.userData.model?.blanket ? +puppet.body.userData.model.blanket.drag.toFixed(3) : null,
      blanketDragSolo: puppet.body?.userData.model?.blanket ? (puppet.drive && puppet.drive.dragSolo !== undefined ? !!puppet.drive.dragSolo : !!puppet.unit.dragSolo) : null,
      // 2026-10-21：单被的布料（两角离手多远、最高点、最大拉长、贴地 / 被压住的点数，见 Script_EditorBlockoutBlanket Probe）
      blanketCloth: puppet.body?.userData.model?.blanket ? puppet.body.userData.model.blanket.Probe() : null,
      draftAnimalVisible: puppet.body?.userData.model?.draft ? puppet.body.userData.model.draft.animalRoot.visible : null,
      draftTravelM: puppet.body?.userData.model?.draft ? puppet.body.userData.model.travelM : null,
      rootAboveCarrierGround: puppet.seat && (human || puppet.body) ? (human ? human.actor.root.position.y : puppet.body.position.y) - puppet.seat.carrierY : null,
    };
  }

  /** 演员现场位置（标记层与俯视图读）。 */
  Live() {
    const out = [];
    for (const puppet of this.puppets.values()) {
      out.push({ id: puppet.id, x: puppet.x, z: puppet.z, yawDeg: puppet.yawDeg, moving: puppet.moving, visible: puppet.visible,
        stance: puppet.stance, actors: puppet.humans.length, noActor: puppet.noActor });
    }
    return out;
  }

  Dispose() {
    for (const puppet of this.puppets.values()) this._Destroy(puppet);
    this.puppets.clear();
    this.plan = null;
    this.root.removeFromParent();
    for (const material of Object.values(this.materials)) material.dispose();
    this.stretcherMaterial?.dispose();
  }
}
