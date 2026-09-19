// ===========================================================================
// Data_FirstLevelMissionGates.mjs —— 第一关《往南的路》的编排表（纯数据，零 three）
//
// 2026.09.19 重构（docs/Data_FirstLevelRebuild20260919Contract.md）：27 个内部步骤。
// 这一份是运行时与关卡编排工作台**共用的同一份口径**：
//
//   1. MISSION_STEP_SPAWNS         —— 进某个内部步骤时按表生成哪些遭遇组；
//   2. MISSION_ENCOUNTER_ACTIVATION—— 每个遭遇组怎么出现 / 什么时候解除待命或苏醒；
//   3. MISSION_VOICE_FACTS         —— 对白播完即记的事实（契约 §5）；
//   4. MISSION_FACT_GATES          —— 每一个事实是怎么判出来的（含 MISSION_STAGES
//                                     requirements 里的全部事实）。
//
// 规矩：
//   · 数值只引用既有表（R / OPENING / Sortie / FRONT_SHELLS…）。只有原先在运行时
//     里就是裸字面量、别处没有出处的半径，才在这里落成数字 —— 落下来之后**这里
//     就是唯一出处**，运行时通过 GateNear 反过来读它。
//   · 事实门只描述「怎么判」，附加条件（担架是否全部通过、控制接管是否演完之类）
//     留在运行时代码里；这里用 requires / note 说明，工作台照它讲人话。
//   · 本文件零副作用、零 three，Node 里 import 即可读。
//
// kind 的取值：
//   proximity        玩家到某个锚点/坐标一定距离内
//   proximityFamily  一串点，逐个记一条事实（approachShell0/1/2、bundleRoutePoint0…）
//   interior         玩家进入一个矩形内部
//   voice            某条对白播完
//   interaction      按住 F 完成某个交互点
//   combat           某组/某人被打掉或打退
//   column           担架队 / 车队的状态判定
//   cutscene         某段受控演出播完
//   scripted         运行时里一段专门的判定（source 写方法名）
//   timer            计时满足
// ===========================================================================
import { MISSION_TUNING as R } from "./Data_Tuning_FirstLevel.mjs";
import { OPENING } from "./Data_FirstLevelOpening.mjs";
import { FRONT_SORTIE as Sortie } from "./Data_FirstLevelFrontRoute.mjs";
import { FRONT_SHELLS } from "./Data_FirstLevelMissionFront.mjs";
import { MISSION_RECEPTION_SPACE } from "./Data_FirstLevelMissionTopology.mjs";

// ---------------------------------------------------------------------------
// 1. 步骤进入时按表生成的遭遇组
// ---------------------------------------------------------------------------
// 顺序 = Enter(stage) 里原先各 case 的 SpawnEncounter 调用顺序（生成是排队的）。
// 不进这张表的两类：
//   · front —— 由 UpdateFront 的 frontBattleStarted 与 Support 段的 frontReached 生成；
//   · transferAlley —— 由 UpdateTransferThreats 在第一处威胁解除后放出。
export const MISSION_STEP_SPAWNS = Object.freeze({
  Trapped: Object.freeze(["bunkerAssault"]),
  Support: Object.freeze(["approach", "tank", "village", "melee"]),
  MachineGun: Object.freeze(["machineGun", "tank"]),
  Tank: Object.freeze(["bundleApproach"]),
  Village: Object.freeze(["village", "melee"]),
  Courtyard: Object.freeze(["courtyard"]),
  Transfer: Object.freeze(["transfer"]),
  AirFirst: Object.freeze(["air"]),
  BridgeCover: Object.freeze(["bridgeNorth"]),
});

// ---------------------------------------------------------------------------
// 2. 遭遇组的出现 / 激活规则
// ---------------------------------------------------------------------------
// spawn.kind：
//   step     进某个内部步骤时（见 MISSION_STEP_SPAWNS）
//   fact     记下某个事实时
//   threat   转运区的第二处威胁就绪时（MISSION_TRANSFER_THREATS）
// standbyUntil：生成时是待命状态（不开火），记下这个事实才解除。
// dormant / wake：生成时整组装睡（scriptedNoncombatant），按 wake 醒。
export const MISSION_ENCOUNTER_ACTIVATION = Object.freeze({
  bunkerAssault: Object.freeze({
    spawn: Object.freeze({ kind: "step", step: "Trapped" }),
    dormant: true,
    wake: Object.freeze({ kind: "fact", fact: "doorSearchStarted" }),
    note: "门外行刑的两个人＋跟进的两个；受困段整段装睡（只演），日兵转向门内才醒",
  }),
  approach: Object.freeze({
    spawn: Object.freeze({ kind: "step", step: "Support" }),
    release: Object.freeze({ kind: "tacticNear" }),
    note: "生成即在位；每个人由 MISSION_TACTICS 的 near/nearM 放行（玩家走到那一段才动）",
  }),
  front: Object.freeze({
    spawn: Object.freeze({ kind: "fact", fact: "frontBattleStarted", step: "Support" }),
    standbyUntil: "frontBattleStarted",
    note: "UpdateFront 记 frontBattleStarted 时生成；Support 段走到 frontReached 也会补一次",
  }),
  machineGun: Object.freeze({
    spawn: Object.freeze({ kind: "step", step: "MachineGun" }),
    standbyUntil: "frontBattleStarted",
  }),
  tank: Object.freeze({
    spawn: Object.freeze({ kind: "step", step: "Support" }),
    standbyUntil: "frontBattleStarted",
    note: "Flank* 两个人生成即 scriptedNoncombatant，等编排放行",
  }),
  bundleApproach: Object.freeze({
    spawn: Object.freeze({ kind: "step", step: "Tank" }),
    note: "侧沟两处拐角与补给屋门口的守兵，全是 hold",
  }),
  village: Object.freeze({
    spawn: Object.freeze({ kind: "step", step: "Support" }),
    dormant: true,
    wake: Object.freeze({ kind: "playerWithinM", step: "Village", radiusM: 55 }),
    note: "提前生成、装睡；Village 步内玩家进 55 m 才醒（UpdateFront 开头那一段）",
  }),
  melee: Object.freeze({
    spawn: Object.freeze({ kind: "step", step: "Support" }),
    dormant: true,
    wake: Object.freeze({ kind: "playerWithinM", step: "Melee", radiusM: 26 }),
    note: "连屋里的四个人：村口那批醒的时候他们不跟着醒，玩家进灶屋以东才出来",
  }),
  courtyard: Object.freeze({ spawn: Object.freeze({ kind: "step", step: "Courtyard" }) }),
  transfer: Object.freeze({
    spawn: Object.freeze({ kind: "step", step: "Transfer" }),
    note: "第一处威胁：压向装载区",
  }),
  transferAlley: Object.freeze({
    spawn: Object.freeze({ kind: "threat", threat: "transferAlley", step: "Transfer" }),
    note: "第二处威胁：侧巷火力，第一处解除（loadingThreatResolved）之后才出现",
  }),
  air: Object.freeze({ spawn: Object.freeze({ kind: "step", step: "AirFirst" }) }),
  bridgeNorth: Object.freeze({
    spawn: Object.freeze({ kind: "step", step: "BridgeCover" }),
    note: "北岸土坎的火力，来自北侧外围战场；不在桥边凭空生成",
  }),
});

// ---------------------------------------------------------------------------
// 3. 对白播完即记的事实（契约 §5 的映射表，一字不改）
// ---------------------------------------------------------------------------
export const MISSION_VOICE_FACTS = Object.freeze({
  RescueCall: "rescueCallHeard",
  SupportOrder: "supportOrdersHeard",
  BundleOrder: "bundleOrderHeard",
  Volunteer: "volunteerHeard",
  BorrowLight: "lightShared",
  ZhouLift: "zhouOnLitter",
  SouthWhisper: "southWhisperHeard",
  VillagePointer: "mainStreetPointed",
  TransferSorting: "transferSortingHeard",
  VillageRoadThreat: "villageRoadThreatSeen",
  EscortZhou: "escortGranted",
  CartTalk: "cartTalkHeard",
  WestDitchOrder: "westDitchPointed",
  CarryZhou: "carryOrdersHeard",
  PicketHold: "picketHolding",
  ZhouCheck: "zhouChecked",
  Headcount: "headcountDone",
  GateChallenge: "gateChallenged",
  ReceptionAccept: "receptionAccepted",
  MedicAsk: "medicExamining",
  SquadAssign: "squadAssigned",
  BridgeOrders: "bridgeOrdersHeard",
  MarchToTengxian: "marchOrderHeard",
});

// ---------------------------------------------------------------------------
// 3b. 场景信号 ← 事实
//
// 契约 §3 把可见空间的换态口子冻结成几个大写信号名，`Data_FirstLevelMissionLayout`
// 的 scenario 状态与 gate 只认这些名字（`Script_FirstLevelWhiteboxField.SyncScenario`
// 每帧按信号同步）。任务这边记的是小写事实名，两边靠这张表接起来 ——
// 运行时不再各处手写 `OpenGate("BunkerCollapsed")`（那条从来就没生效过：
// `BunkerCollapsed` 是 scenario 信号，不是任何一块 gate 的 id）。
//
// 只写「名字不一样」的那几条；名字本来就一致的信号（`MissionBridgeDestroyed`
// `MissionCourtyardGateOpen`）由 `Signalled` 直接按事实名查。
// ---------------------------------------------------------------------------
export const MISSION_SCENARIO_SIGNALS = Object.freeze({
  BunkerCollapsed: "bunkerCollapsed",       // 01 近爆之后换成坍塌态掩蔽部
  RailBridgeDestroyed: "bridgeDestroyed",   // 18 炸桥：桥面 / 桁架 / 钢轨消失，残骸出现
  NightGateShown: "nightArrivalPlaced",     // 18 黑屏里瞬移之后才画北门夜景那一片
});

// ---------------------------------------------------------------------------
// 4. 事实门
// ---------------------------------------------------------------------------
const Gate = (entry) => Object.freeze(entry);
export const MISSION_FACT_GATES = Object.freeze({
  // --- Trapped -----------------------------------------------------------
  bunkerCollapsed: Gate({
    kind: "scripted", step: "Trapped", source: "FirstLevelOpening.UpdateBunker",
    text: "黑屏对白被近爆打断，掩蔽部塌下来把人压住（控制接管 trapped）",
  }),
  captivesKilled: Gate({
    kind: "scripted", step: "Trapped", source: "FirstLevelOpening.UpdateBunker",
    text: "透过前门低处破口看见门外两名失去抵抗能力的川军被刺杀",
  }),
  doorSearchStarted: Gate({
    kind: "scripted", step: "Trapped", source: "FirstLevelOpening.UpdateBunker",
    text: "门外的日兵转向门内，后侧同时响起清理坍塌物的声音",
  }),
  // --- BunkerRescue ------------------------------------------------------
  rescueCallHeard: Gate({ kind: "voice", step: "BunkerRescue", cue: "RescueCall", source: "VoiceDone" }),
  luoRescueComplete: Gate({
    kind: "cutscene", step: "BunkerRescue", source: "Update/controls(rescue)",
    text: "罗班长掀开木架、幺娃拉背包，把顺子拖出坍塌的掩蔽部那一段演完",
  }),
  rifleRecovered: Gate({
    kind: "interaction", step: "BunkerRescue", interaction: "MissionRifle", anchor: "bunkerDoor",
    source: "Register", text: "在掩蔽部门口把掉在地上的步枪捡起来",
  }),
  // --- RearTrench --------------------------------------------------------
  rearTrenchEntered: Gate({
    kind: "proximity", step: "RearTrench", anchor: "bunkerRear", radiusM: 5, source: "Update",
  }),
  cornerReached: Gate({
    kind: "proximity", step: "RearTrench", anchor: "rearCorner", radiusM: 5, source: "Update",
    note: "幺娃在折角检查顺子",
  }),
  collectionPointSeen: Gate({
    kind: "proximity", step: "RearTrench", anchor: "collection", radiusM: 14, source: "Update",
    note: "背坡伤员集结处：第一次看见担架、伤员与搬运人员",
  }),
  supportOrdersHeard: Gate({ kind: "voice", step: "RearTrench", cue: "SupportOrder", source: "VoiceDone" }),
  // --- Support -----------------------------------------------------------
  frontReached: Gate({
    kind: "proximity", step: "Support", anchor: "front", radiusM: OPENING.frontReachRadiusM,
    source: "Update",
  }),
  frontContact: Gate({
    kind: "combat", step: "Support", source: "Update",
    text: "到了前沿之后双方开过火（有敌人开枪，或者玩家打过枪）",
  }),
  frontRifleDefense: Gate({
    kind: "timer", step: "Support", seconds: R.frontRifleDefenseSeconds, source: "Update",
    text: "到前沿后用步枪顶住 frontRifleDefenseSeconds 秒，且期间开过枪",
  }),
  rifleWithdrawalResolved: Gate({
    kind: "scripted", step: "Support", source: "UpdateGuards",
    text: "头 rifleGuardCount 对守军要么撤回安全、要么阵亡",
  }),
  // --- MachineGun --------------------------------------------------------
  zhouGunWounded: Gate({
    kind: "scripted", step: "MachineGun", source: "FirstLevelOpening.UpdateZhou",
    text: "老周在机枪位上挨了那一发（负伤但没死），退出枪位",
  }),
  frontAttackRepelled: Gate({
    kind: "combat", step: "MachineGun", encounter: "machineGun", source: "UpdateFrontAttack",
    text: "machineGun 组全部阵亡或被打退（退到 retreatDistanceM 之外）",
  }),
  guardWithdrawalResolved: Gate({
    kind: "scripted", step: "MachineGun", source: "UpdateGuards",
    text: "八对守军全部撤回交通壕或阵亡",
  }),
  tankBlocksExit: Gate({
    kind: "scripted", step: "MachineGun", source: "UpdateTank",
    text: "战车压到沟口（tankStopZ 附近），把前沿的退路堵住",
  }),
  bundleOrderHeard: Gate({ kind: "voice", step: "MachineGun", cue: "BundleOrder", source: "VoiceDone" }),
  // --- Tank --------------------------------------------------------------
  bundleRouteTraversed: Gate({
    kind: "scripted", step: "Tank", source: "UpdateSortie",
    requires: Object.freeze(["bundleRoutePoint", "bundleCrawl"]),
    text: "侧沟线上每个检查点都走到、两段爬行段都趴着过了",
  }),
  bundleTaken: Gate({
    kind: "interaction", step: "Tank", interaction: "MissionBundle", anchor: "bundle",
    source: "Register", text: "在北边屋里领到集束手榴弹",
  }),
  tankImmobilized: Gate({
    kind: "scripted", step: "Tank", source: "OnBlast",
    text: "集束弹在履带判定半径内炸开，战车停住",
  }),
  lastGuardsWithdrawn: Gate({
    kind: "scripted", step: "Tank", source: "UpdateGuards",
    text: "最后一批守军真实撤入交通壕（返程不复活去程的敌人）",
  }),
  reliefInPosition: Gate({
    kind: "scripted", step: "Tank", source: "UpdateRelief",
    text: "接防人员沿交通壕进入前沿阵位",
  }),
  // --- Orders ------------------------------------------------------------
  ordersReached: Gate({ kind: "proximity", step: "Orders", anchor: "collection", radiusM: 5, source: "Update" }),
  volunteerHeard: Gate({ kind: "voice", step: "Orders", cue: "Volunteer", source: "VoiceDone" }),
  lightShared: Gate({ kind: "voice", step: "Orders", cue: "BorrowLight", source: "VoiceDone" }),
  zhouOnLitter: Gate({ kind: "voice", step: "Orders", cue: "ZhouLift", source: "VoiceDone" }),
  columnDeparted: Gate({
    kind: "column", step: "Orders", source: "Update",
    text: "后送队真实起行（担架队沿路线走出集结处）",
  }),
  // --- South -------------------------------------------------------------
  southWhisperHeard: Gate({ kind: "voice", step: "South", cue: "SouthWhisper", source: "VoiceDone" }),
  villageMouthReached: Gate({
    kind: "proximity", step: "South", anchor: "village", radiusM: 4, source: "Update",
    note: "真走一段（取消了旧的黑屏转场），目标时长 45–75 秒",
  }),
  mainStreetPointed: Gate({ kind: "voice", step: "South", cue: "VillagePointer", source: "VoiceDone" }),
  // --- Village -----------------------------------------------------------
  streetBlockSeen: Gate({
    kind: "proximity", step: "Village", anchor: "streetBlock", radiusM: 22, source: "Update",
    note: "主街被倒墙＋横车堵住，东巷窗口有日军火力",
  }),
  littersInCover: Gate({
    kind: "column", step: "Village", source: "Update",
    text: "担架队停进可靠遮挡（litterHold），不跟进未清空间",
  }),
  kitchenEntered: Gate({
    kind: "interior", step: "Village", box: "kitchenInterior", source: "Update",
    text: "玩家从右侧灶屋绕进去",
  }),
  // --- Melee -------------------------------------------------------------
  meleeResolved: Gate({
    kind: "combat", step: "Melee", encounter: "melee", source: "UpdateMelee",
    text: "从连屋出来的那一组处理完（提前击败就不会有固定僵持）",
  }),
  // --- Courtyard ---------------------------------------------------------
  villageGunSilent: Gate({
    kind: "combat", step: "Courtyard", member: "VillageGunner", encounter: "village",
    source: "Update", text: "窗口那挺机枪的射手阵亡",
  }),
  courtyardGateOpen: Gate({
    kind: "interaction", step: "Courtyard", interaction: "MissionGate", anchor: "gate",
    source: "Register", text: "院门打开（担架从这里过）",
  }),
  courtyardPassed: Gate({
    kind: "column", step: "Courtyard", source: "Update",
    text: "还活着的担架全部通过院门，在障碍南侧 streetRejoin 接回主街",
  }),
  // --- TransferApproach --------------------------------------------------
  transferApproachReached: Gate({
    kind: "proximity", step: "TransferApproach", anchor: "transfer", radiusM: 14, source: "Update",
  }),
  transferSortingHeard: Gate({ kind: "voice", step: "TransferApproach", cue: "TransferSorting", source: "VoiceDone" }),
  villageRoadThreatSeen: Gate({ kind: "voice", step: "TransferApproach", cue: "VillageRoadThreat", source: "VoiceDone" }),
  // --- Transfer ----------------------------------------------------------
  transferArrived: Gate({ kind: "proximity", step: "Transfer", anchor: "transfer", radiusM: 14, source: "Update" }),
  loadingThreatResolved: Gate({
    kind: "combat", step: "Transfer", encounter: "transfer", source: "UpdateTransferThreats",
    text: "压向装载区的那一处威胁被清掉",
  }),
  firstBatchLoaded: Gate({
    kind: "column", step: "Transfer", source: "Update",
    text: "第一处威胁解除后接运真实推进一批（装上第一车伤员）",
  }),
  alleyThreatResolved: Gate({
    kind: "combat", step: "Transfer", encounter: "transferAlley", source: "UpdateTransferThreats",
    text: "侧巷那一处威胁被清掉",
  }),
  zhouNext: Gate({
    kind: "column", step: "Transfer", source: "Update",
    text: "队列轮到老周，他被抬向装车位（离开原位 boardingWitnessM 以上）",
  }),
  escortGranted: Gate({ kind: "voice", step: "Transfer", cue: "EscortZhou", source: "VoiceDone" }),
  // --- CartRide ----------------------------------------------------------
  cartBoarded: Gate({
    kind: "interaction", step: "CartRide", interaction: "MissionCart", anchor: "cartBoard",
    source: "Register", text: "顺子上了老周那辆车（控制接管 cartRide，可环视）",
  }),
  zhouCartDeparted: Gate({
    kind: "scripted", step: "CartRide", source: "UpdateCart",
    text: "车沿 cartRide 路线真实离开装载位置",
  }),
  cartTalkHeard: Gate({ kind: "voice", step: "CartRide", cue: "CartTalk", source: "VoiceDone" }),
  // --- AirFirst ----------------------------------------------------------
  firstAirPassComplete: Gate({
    kind: "scripted", step: "AirFirst", source: "UpdateAir",
    text: "日机第一趟扫射掠过桥头道路与车列",
  }),
  cartHalted: Gate({
    kind: "scripted", step: "AirFirst", source: "UpdateCart",
    text: "道路受损堵塞，车停在 cartHalt",
  }),
  zhouUnloaded: Gate({
    kind: "scripted", step: "AirFirst", source: "UpdateCart",
    text: "老周被从车上卸回担架",
  }),
  westDitchPointed: Gate({ kind: "voice", step: "AirFirst", cue: "WestDitchOrder", source: "VoiceDone" }),
  // --- Carry -------------------------------------------------------------
  zhouCarried: Gate({
    kind: "interaction", step: "Carry", interaction: "MissionZhouCarry", anchor: "queue",
    source: "BeginCarry", text: "接过老周担架的后端",
  }),
  atDitchMouth: Gate({ kind: "proximity", step: "Carry", anchor: "ditchMouth", radiusM: 2, source: "UpdateCarry" }),
  carryOrdersHeard: Gate({ kind: "voice", step: "Carry", cue: "CarryZhou", source: "VoiceDone" }),
  // --- Dive --------------------------------------------------------------
  diveComplete: Gate({ kind: "cutscene", step: "Dive", source: "Update/controls(dive)", text: "扑进沟里那一段演完" }),
  // --- Rescue ------------------------------------------------------------
  zhouRecovered: Gate({
    kind: "scripted", step: "Rescue", source: "Update",
    text: "两个人都到位、通路安全，连续 rescueSeconds 秒把老周拖回担架",
  }),
  rescuePassageClear: Gate({
    kind: "scripted", step: "Rescue", source: "Update",
    text: "与 zhouRecovered 同时记：拖回来的那条通路当时没有威胁",
  }),
  // --- Regroup (15A) -----------------------------------------------------
  picketHolding: Gate({ kind: "voice", step: "Regroup", cue: "PicketHold", source: "VoiceDone" }),
  zhouChecked: Gate({ kind: "voice", step: "Regroup", cue: "ZhouCheck", source: "VoiceDone" }),
  headcountDone: Gate({ kind: "voice", step: "Regroup", cue: "Headcount", source: "VoiceDone" }),
  litterRemanned: Gate({
    kind: "scripted", step: "Regroup", source: "Update",
    text: "缺人的担架换上抬手，队伍重新成形",
  }),
  columnMoving: Gate({
    kind: "column", step: "Regroup", source: "Update",
    text: "收拢完成，队伍沿院墙夹道方向重新走起来",
  }),
  // --- WallPath (15B) ----------------------------------------------------
  carryHandover: Gate({
    kind: "interaction", step: "WallPath", interaction: "MissionZhouCarry", anchor: "wallPathStart",
    source: "BeginCarry", text: "顺子再次接过老周担架（CarrySwap）",
  }),
  wallPathTraversed: Gate({
    kind: "proximity", step: "WallPath", anchor: "wallPathEnd", radiusM: 6, source: "Update",
    note: "靠院墙夹道那一段留了无对白行走，全程无敌人",
  }),
  stragglersTended: Gate({
    kind: "column", step: "WallPath", source: "Update",
    text: "掉队的伤员被照应上，担架队跟到夹道尽头",
  }),
  // --- ReceptionGate (15C) -----------------------------------------------
  gateChallenged: Gate({ kind: "voice", step: "ReceptionGate", cue: "GateChallenge", source: "VoiceDone" }),
  receptionAccepted: Gate({ kind: "voice", step: "ReceptionGate", cue: "ReceptionAccept", source: "VoiceDone" }),
  woundedEntering: Gate({
    kind: "column", step: "ReceptionGate", source: "Update",
    text: "伤员实际进入接收院",
  }),
  // --- Handover ----------------------------------------------------------
  thresholdCrossed: Gate({
    kind: "proximity", step: "Handover", point: MISSION_RECEPTION_SPACE.wardEntry, radiusM: 3, source: "Update",
    note: "过厢房门槛（会颠一下）——「脚……慢点」是老周最后一句话",
  }),
  zhouPlaced: Gate({
    kind: "interaction", step: "Handover", interaction: "MissionZhouPlace", anchor: "zhouDrop",
    source: "Register", text: "把老周放到军医旁边（放下之后恢复持枪）",
  }),
  medicExamining: Gate({ kind: "voice", step: "Handover", cue: "MedicAsk", source: "VoiceDone" }),
  squadAssigned: Gate({ kind: "voice", step: "Handover", cue: "SquadAssign", source: "VoiceDone" }),
  // --- Death -------------------------------------------------------------
  deathSceneComplete: Gate({
    kind: "cutscene", step: "Death", source: "Update/controls(death)",
    text: "老周牺牲那一段演完（且 ZhouDeath 的对白放完）；第一人称，不切尸体特写",
  }),
  // --- Bridge ------------------------------------------------------------
  bridgeOrdersHeard: Gate({ kind: "voice", step: "BridgeOrders", cue: "BridgeOrders", source: "VoiceDone" }),
  southBankReached: Gate({
    kind: "proximity", step: "BridgeCover", anchor: "bridgeCover", radiusM: 8, source: "Update",
    note: "南岸遮挡后的射位",
  }),
  bridgeFireBroken: Gate({
    kind: "combat", step: "BridgeCover", encounter: "bridgeNorth", source: "Update",
    text: "北岸土坎的火力被打掉（不做多波守点）",
  }),
  rearColumnCrossed: Gate({
    kind: "column", step: "BridgeCover", source: "UpdateBridgeColumn",
    text: "威胁解除后回援尾队沿 bridgeCrossing 真实通过铁路桥",
  }),
  blastZoneCleared: Gate({
    kind: "proximity", step: "BridgeWithdraw", anchor: "blastSafe", radiusM: 10, source: "Update",
  }),
  bridgeDestroyed: Gate({
    kind: "scripted", step: "BridgeWithdraw", source: "UpdateBridgeBlast",
    text: "爆破由在场人员完成，玩家在安全距离看见桥被破坏（不可逆，信号 RailBridgeDestroyed）",
  }),
  marchOrderHeard: Gate({ kind: "voice", step: "BridgeWithdraw", cue: "MarchToTengxian", source: "VoiceDone" }),
  // --- NightMarch --------------------------------------------------------
  nightTransitionComplete: Gate({
    kind: "scripted", step: "NightMarch", source: "Update/controls(nightTransition)",
    text: "行军脚步 → 淡出 → 字幕 → 夜间天空 → 淡入北门外行军队列",
  }),
  northGateReached: Gate({
    kind: "proximity", step: "NightMarch", anchor: "northGate", radiusM: 6, source: "Update",
  }),
  gateEntered: Gate({
    kind: "proximity", step: "NightMarch", anchor: "gateInside", radiusM: 4, source: "Update",
  }),

  // -----------------------------------------------------------------------
  // 不在 requirements 里、但影响编排的触发
  // -----------------------------------------------------------------------
  frontBattleStarted: Gate({
    kind: "proximity", step: "Support", anchor: "front", radiusM: R.frontEngageDistanceM,
    source: "UpdateFront", note: "放出 front 组、解除 front/machineGun/tank 的待命",
  }),
  meleeEngaged: Gate({
    kind: "scripted", step: "Melee", source: "UpdateMelee",
    text: "连屋那一组真的贴上玩家（走共用白刃僵持）；玩家先手打掉就不会记",
  }),
  gunOccupied: Gate({
    kind: "interaction", step: "MachineGun", interaction: "MissionGun", anchor: "gun",
    source: "Register/OnOccupy", text: "玩家坐上机枪位（班里人同时散到 squadFrontPositions）",
  }),
  gunUsed: Gate({
    kind: "scripted", step: "MachineGun", source: "Update",
    text: "机枪打出过子弹（守军交替撤退的放行条件之一）",
  }),
  bundleDirectionsHeard: Gate({ kind: "voice", step: "Tank", cue: "BundleSupply", source: "VoiceDone" }),

  // --- 家族门（一串点，逐个记一条事实）-------------------------------------
  approachShell: Gate({
    kind: "proximityFamily", step: "Support", family: "approachShell",
    pointsFrom: "FRONT_SHELLS.trigger", points: FRONT_SHELLS.map((shell) => shell.trigger),
    radiusM: 10, source: "UpdateFront",
    text: "玩家走到交通壕沿线第 i 个炮击触发点附近，引一发榴弹（approachShell0/1/2）",
  }),
  bundleRoutePoint: Gate({
    kind: "proximityFamily", step: "Tank", family: "bundleRoutePoint",
    pointsFrom: "FRONT_SORTIE.route", points: Sortie.route, radiusM: Sortie.checkpointRadiusM,
    source: "UpdateSortie", text: "侧沟线上的第 i 个检查点（bundleRouteTraversed 的前提之一）",
  }),
  bundleCrawl: Gate({
    kind: "proximityFamily", step: "Tank", family: "bundleCrawl",
    pointsFrom: "FRONT_SORTIE.crawl", points: Sortie.crawl,
    keys: Sortie.crawl.map((crawl) => crawl.id), radiusM: Sortie.crawlRadiusM,
    source: "UpdateSortie", note: "还要求人是趴着的、而且身子确实在沟底",
    text: "趴着通过第 i 段矮顶爬行段（bundleRouteTraversed 的前提之一）",
  }),
});

// 家族门的所有条目（工作台与运行时都用它做前缀匹配）。
const FAMILY_GATES = Object.freeze(
  Object.entries(MISSION_FACT_GATES)
    .filter(([, gate]) => gate.kind === "proximityFamily")
    // 长前缀优先：避免 bundleCrawl / bundleRoutePoint 这类同前缀的互相吃掉。
    .sort((a, b) => b[0].length - a[0].length),
);

/**
 * 把一个家族事实（approachShell2、bundleRoutePoint7、bundleCrawlFirst…）解析成
 * `{ id, gate, index, key, point }`。不是家族事实就返回 null。
 */
export function MissionGateFamily(fact) {
  if (typeof fact !== "string") return null;
  for (const [id, gate] of FAMILY_GATES) {
    if (!fact.startsWith(id) || fact.length === id.length) continue;
    const suffix = fact.slice(id.length);
    const index = gate.keys ? gate.keys.indexOf(suffix) : /^\d+$/.test(suffix) ? Number(suffix) : -1;
    if (index < 0 || index >= gate.points.length) continue;
    return { id, gate, index, key: gate.keys ? suffix : String(index), point: gate.points[index] };
  }
  return null;
}

/** 事实门查表：精确条目优先，其次按家族前缀解析。找不到返回 null。 */
export function MissionFactGate(fact) {
  const exact = MISSION_FACT_GATES[fact];
  if (exact && exact.kind !== "proximityFamily") return { id: fact, gate: exact, index: null, key: null, point: null };
  return MissionGateFamily(fact);
}
