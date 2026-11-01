// 白盒编辑器（预演 + 试玩）里人物换成 Mixamo X Bot 时的动作对照表（2026-11-01）。纯数据，无 three。
//
// 预演键里写的片段（clip）按 XBOT_PREVIZ_CLIPS 找 X Bot 的动作；没写片段时人物是原生状态（站 / 走 / 跑 / 蹲 / 趴 / 倒地…），
// 按 XBOT_NATIVE 选。三种写法：
//   { file }               直接播 Animation/Mixamo 里那条 Mixamo / 自制动作（file 是库里的文件名）
//   { file, mirror: true } 那条动作左右镜像（右手比划 → 左手），由 _import/Script_XBotDeriveClips.mjs 烘到 Derived/
//   { retarget: true }     Mixamo 里没有对应的：把预演片段库里士兵骨架的原动作换算到 X Bot（同一个脚本烘到 Derived/）
//
// 什么时候算「Mixamo 有对应」（用户 11-01：能在 Mixamo 找到的全用 Mixamo，没有的转过去）：
//   动作本身对得上、手里拿的对得上（端枪 / 空手）、姿势高低对得上。下面几类就算 Mixamo 有长得像的也走换算，
//   因为换了会穿帮：两个人一直接触的（架伤员、拖人、背人、按住人），手里一直攥着东西的（被角、担架杆、捆），
//   坐地 / 躺地的（Mixamo 的坐大多是坐椅子，高度不对），片段自己带位移的（rootMotion：扑倒、翻沟、跳进沟、被掀飞），
//   以及草稿里只算勉强对得上的。来源与逐条理由见 docs/Data_EditorBlockout.md §18。
//
// 换算出来的动作人还是那个人：隐藏的原身体照旧播原片段，X Bot 的骨头照它换算，所以躺担架 / 拖被子 / 两人配合的
// 测量都还对；X Bot 胳膊比士兵长约 14%，手里的东西（被角、担架杆）会差几厘米。

const M = (name, extra = {}) => Object.freeze({ file: `Animation_Mixamo_${name}.glb`, ...extra });
const C = (name, extra = {}) => Object.freeze({ file: `Animation_Claude_${name}.glb`, ...extra });
const MIRROR = (name) => M(name, { mirror: true });
const RETARGET = Object.freeze({ retarget: true });

export const XBOT_PREVIZ_CLIPS = Object.freeze({
  // —— Mixamo / 自制有对应 ——
  PvCrouchRestRifle: M("RifleKneelIdle_V1"),
  PvCrouchTalkRifle: M("RifleKneelIdle_V1"),
  PvStandTalkSlung: M("Talking_V2"),
  PvStandTalkLowRifle: M("Talking_V2"),
  ShotCollapse: M("RifleDeath_V1"),
  PvStandPointL: M("PointingForward_V1"),
  PvCrouchPointL: MIRROR("KneelingPointing_V1"),
  PvStandWaveOnL: MIRROR("Waving_V3"),
  DuckBlast: M("Ducking_V1"),
  VilPanicRun: M("FastRun_V1", { speedMps: 3.4 }),
  VilIjaShoutPoint: M("Charge_V1"),
  VilIjaGateSmash: M("RiflePunch_V1"),
  VilIjaBayonetThrust: M("BayonetStab_V1"),
  BayonetClearWood: M("BayonetStab_V1"),
  PvIjaButtStrikeFace: M("RiflePunch_V1"),
  IjaGrenadeKnockThrow: C("Type91GrenadeThrow"),
  VilIjaHelmetGrenadeLob: C("Type91GrenadeThrow"),
  IjaProneLmgOnCorpse: M("ProneFiringRifle_V1"),
  IjaLmgGunnerShotOnGun: M("ProneDeath_V1"),
  CareMedicBandage: C("BandageKneel"),
  CaptiveKneelMud: M("KneelingIdle_V1"),

  // —— 换算：Mixamo 没有对应 ——
  VilDuckProne: RETARGET, PvStandBeckonL: RETARGET, VilCowerWhimper: RETARGET, PvKneelDig: RETARGET,
  PvStandHaltL: RETARGET, PvIjaLauncherFire: RETARGET, PvIjaLauncherLoad: RETARGET, YaowaSitLoad: RETARGET,
  PvLegHitKneelClutch: RETARGET, LiuDivideAmmoToss: RETARGET, PvSitGrabHand: RETARGET, PvIjaSignalSplit: RETARGET,
  IjaStompStabTwist: RETARGET, IjaHeaveCorpseLip: RETARGET, IjaCrouchHairHold: RETARGET, PvKneelPullBlanket: RETARGET,
  PvKneelHaulBody: RETARGET, PvLieGrabSleeve: RETARGET, PvCaptiveButtHit: RETARGET, PvIjaBayonetRaiseThreat: RETARGET,
  PvIjaCrouchHairLift: RETARGET, IjaFoundLook: RETARGET, IjaSlapForehand: RETARGET, IjaSlapBackhand: RETARGET,
  IjaSlapRecruit: RETARGET, InterpreterGrabCollar: RETARGET, PvProneBeckonL: RETARGET, VilClingHem: RETARGET,
  VilIjaBayonetLiftFling: RETARGET, VilUnboltDoor: RETARGET, VilBiteWrist: RETARGET, VilHugLegs: RETARGET,
  PvIjaLungeParriedFall: RETARGET,
  // 两个人一直接触 / 手里一直攥着东西
  PvSupportedHop: RETARGET, PvSupportWalkL: RETARGET, PvSupportWalkR: RETARGET, VilNraCarryOnBack: RETARGET,
  VilRideOnBack: RETARGET, PvBlanketDragR: RETARGET, PvBlanketDragL: RETARGET, PvCrouchGripLitter: RETARGET,
  CareMedicPress: RETARGET, CareLieWrithe: RETARGET, CareLieTreated: RETARGET, PullComrade: RETARGET,
  VilIjaDragByArm: RETARGET, VilDraggedByArm: RETARGET, IjaDragCollarFromDirt: RETARGET, CaptiveDraggedFromDirt: RETARGET,
  CaptiveCurledPulledUp: RETARGET, VilReachPinned: RETARGET, VilNraYankBack: RETARGET, PvCrouchRunPullBehind: RETARGET,
  PvCrawlCarryBundle: RETARGET, VilKneelCrawlToPit: RETARGET, VilIjaPinBayonet: RETARGET, LuoHandRifle: RETARGET,
  // 坐地 / 躺地
  WoundedSitRifleIdle: RETARGET, PvSitRestRifle: RETARGET, PvSitStuffPack: RETARGET, PvSitOfferArm: RETARGET,
  VilSitEdge: RETARGET, HeHelmetSleepSitUp: RETARGET,
  // 片段自己带位移
  PvStandToProneDive: RETARGET, PvClimbOutTrench: RETARGET, VilIjaClimbWall: RETARGET, VilHandsUpClimbOut: RETARGET,
  BlastSlamBuried: RETARGET, IjaDropInPoint: RETARGET, IjaDropInKneel: RETARGET, IjaDropInStand: RETARGET,
  IjaWalkStabProne: RETARGET, PvBlastThrownBack: RETARGET, LuoDadaoChopRear: RETARGET, VilIjaShoulderCharge: RETARGET,
  VilCrawlHole: RETARGET, CaptiveStabbedCurl: RETARGET, IjaRecruitChargeThrust: RETARGET, IjaShotStaggerAway: RETARGET,
  IjaGrenadeBitePin: RETARGET, IjaParriedChoppedFall: RETARGET, InterpreterFlee: RETARGET, InterpreterShotStagger: RETARGET,
  PvShoulderShove: RETARGET,
  // 草稿里只算勉强对得上
  VilCrouchHold: RETARGET, MessengerReport: RETARGET, PvCrouchCountFingers: RETARGET, InterpreterCrouchAsk: RETARGET,
  CreepDadao: RETARGET, LiuBoxUpGo: RETARGET, PvStandShakeHead: RETARGET, IjaRecruitSlapped: RETARGET,
  VilStabbedFall: RETARGET, LuoKneelCheck: RETARGET, HeLiftTimber: RETARGET, DadaoAmbush: RETARGET,
  PvBlanketReleaseTurn: RETARGET,
});

/**
 * 原生状态 → X Bot 动作。键是 Script_EditorBlockoutXBot.NativeKey() 拼出来的：姿势（stand / crouch / prone）× 动作
 * （idle / walk / run / crawl）× 手里（rifle = 端着枪，empty = 空手或枪背在背上）× 是否据枪（aim）。
 * speedMps：原地循环动作的标称速度（X Bot 原尺寸），播放速率 = 实际速度 ÷（标称 × 身高缩放），脚不滑。
 */
export const XBOT_NATIVE = Object.freeze({
  standIdleRifle: M("RifleIdle_V2"),
  standIdleRifleAim: M("RifleAimingIdle_V1"),
  standIdleEmpty: M("NeutralIdle_V1"),
  standWalkRifle: M("RifleWalk_V1", { speedMps: 1.3 }),
  standWalkRifleAim: M("WalkWithRifle_V1", { speedMps: 1.3 }),
  standWalkEmpty: M("Walking_V21", { speedMps: 1.35 }),
  standRunRifle: M("RifleRun_V2", { speedMps: 3.6 }),
  standRunRifleAim: M("RifleRun_V2", { speedMps: 3.6 }),
  standRunEmpty: M("UnarmedRunForward_V1", { speedMps: 3.4 }),
  crouchIdleRifle: M("RifleKneelIdle_V1"),
  crouchIdleRifleAim: M("RifleKneelIdle_V1"),
  crouchIdleEmpty: M("KneelingIdle_V1"),
  crouchWalkRifle: M("RifleCrouchWalk_V1", { speedMps: 0.9 }),
  crouchWalkRifleAim: M("RifleCrouchWalk_V1", { speedMps: 0.9 }),
  crouchWalkEmpty: M("CrouchedWalking_V2", { speedMps: 1.0 }),
  crouchRunRifle: M("CrouchedRun_V1", { speedMps: 2.6 }),
  crouchRunRifleAim: M("CrouchedRun_V1", { speedMps: 2.6 }),
  crouchRunEmpty: M("CrouchedWalking_V2", { speedMps: 1.0 }),
  proneIdleRifle: M("ProneIdle_V1"),
  proneIdleRifleAim: M("ProneIdle_V1"),
  proneIdleEmpty: M("ProneIdle_V1"),
  proneCrawlRifle: M("ProneForward_V1", { speedMps: 0.35 }),
  proneCrawlRifleAim: M("ProneForward_V1", { speedMps: 0.35 }),
  proneCrawlEmpty: M("LowCrawl_V1", { speedMps: 0.5 }),
  carryFront: C("StretcherFrontWalk", { speedMps: 0.97 }),
  carryRear: C("StretcherRearWalk", { speedMps: 1.07 }),
  woundedWalk: M("InjuredWalk_V1", { speedMps: 0.8 }),
  talking: M("Talking_V2"),
  // 投弹：国军木柄弹（拧盖拽火绳），日军九一式（拔销磕钢盔）
  grenadeNra: C("StickGrenadeStand"),
  grenadeIja: C("Type91GrenadeThrow"),
  // 开枪（试玩里的日军）
  fireStand: M("FiringRifle_V1"),
  fireCrouch: M("FireRifle_V1"),
  fireProne: M("ProneFiringRifle_V1"),
});

/** 倒地：原身体抽到的倒地片段（DeathCollapseA–D）→ Mixamo 倒地动作，播完停在最后一帧。 */
export const XBOT_DEATHS = Object.freeze({
  DeathCollapseA: M("StandingReactDeathRight_V1"),
  DeathCollapseB: M("Dying_V3"),
  DeathCollapseC: M("FallingBackDeath_V1"),
  DeathCollapseD: M("StandingReactDeathForward_V1"),
});

/**
 * X Bot 配色（表面 / 关节两种材质，Beta_Surface / Beta_Joints）。
 * 普通人按阵营一种素色（用户 11-01：普通兵、普通百姓各一种普通颜色）：国军灰蓝、日军土黄、百姓灰褐。
 */
export const XBOT_LOOKS = Object.freeze({
  nra: Object.freeze({ surface: 0x5e6a74, joints: 0x262b30 }),
  ija: Object.freeze({ surface: 0x8a7b52, joints: 0x3a3424 }),
  civilian: Object.freeze({ surface: 0x6e655a, joints: 0x2a2724 }),
});

/**
 * 有名字、有戏的人各一种好认的颜色（用户 11-01）：色相拉开、比素色饱和，关节一律深色，远处一眼分得出谁是谁。
 * 认人按单位的定妆角色 castId（Data_FirstLevelSpeakingCast），没有 castId 的按单位 id（顺子、老耿、妮儿）。
 * 审问那场的日军甲乙丙丁只有代号，照普通日军。
 */
export const XBOT_CHARACTER_LOOKS = Object.freeze({
  shunzi: Object.freeze({ name: "顺子", surface: 0xe6e0cf, joints: 0x2b2b2b }),
  luo: Object.freeze({ name: "罗班长", surface: 0xb8352c, joints: 0x2b1614 }),
  comrade: Object.freeze({ name: "冬瓜", surface: 0xd9822b, joints: 0x2e1d0c }),
  yaowa: Object.freeze({ name: "幺娃", surface: 0xd6c03a, joints: 0x2c2810 }),
  liuwencai: Object.freeze({ name: "刘文财", surface: 0x4f9a3c, joints: 0x14240f }),
  heyoutian: Object.freeze({ name: "何有田", surface: 0x2f9c9a, joints: 0x0f2423 }),
  runner: Object.freeze({ name: "传令兵", surface: 0x4a8fd6, joints: 0x122236 }),
  frontOfficer: Object.freeze({ name: "七二七团连长", surface: 0x7b4fb8, joints: 0x1f1430 }),
  interpreter: Object.freeze({ name: "翻译", surface: 0xc04f8f, joints: 0x301424 }),
  geng: Object.freeze({ name: "老耿", surface: 0x8b5a2b, joints: 0x24170b }),
  nier: Object.freeze({ name: "妮儿", surface: 0xf0a3bb, joints: 0x3a2229 }),
});

/** 没有 castId 的有名字角色：单位 id → XBOT_CHARACTER_LOOKS 的键。 */
export const XBOT_CHARACTER_UNITS = Object.freeze({ Shunzi: "shunzi", Geng: "geng", Nier: "nier" });
