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
import { END_TUNING as END } from "./Data_Tuning_FirstLevelEnd.mjs";
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
    wake: Object.freeze({ kind: "fact", fact: "rifleRecovered" }),
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
    // 玩家先进灶屋（kitchenEntered）、再走到连屋这个半径里，他们才从东巷那扇门进来。
    // 实装：Script_FirstLevelVillageBlock.UpdateMeleeBeat。
    wake: Object.freeze({ kind: "playerWithinM", step: "Melee", radiusM: 26, fact: "kitchenEntered" }),
    note: "连屋里的四个人：村口那批醒的时候他们不跟着醒，玩家进了灶屋、走到连屋附近才出来",
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
    kind: "combat", step: "Support", source: "Update",
    text: "右侧破墙的封锁机枪已被压制或击败，无固定时长或击杀数",
  }),
  rifleWithdrawalResolved: Gate({
    kind: "scripted", step: "Support", source: "UpdateGuards",
    text: "第一批存活守军全部撤入安全位置，至少一人存活",
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
    kind: "proximity", step: "South", anchor: "village", radiusM: 9, source: "Update",
    note: "真走一段（取消了旧的黑屏转场），目标时长 45–75 秒；"
      + "半径要盖住 southWalk 的终点 (48,-20) —— 它离 village 锚点 7 m，"
      + "4 m 的门谁沿着路走到头都够不着，07 会永远停在那儿",
  }),
  mainStreetPointed: Gate({ kind: "voice", step: "South", cue: "VillagePointer", source: "VoiceDone" }),
  // --- Village -----------------------------------------------------------
  streetBlockSeen: Gate({
    kind: "proximity", step: "Village", anchor: "streetBlock", radiusM: 46, source: "Update",
    // 2026-09-20 演出打磨：原来是「离 (76.65,15) 22 m 以内」，而主街西侧
    // (StreetWestWallNorth) 与内院东墙 (CourtyardEast) 把 x=72 一线从 z=−22 封到 34 ——
    // 玩家得从北口钻进主街往南走十几米才够得着。Notion 08 的意思是队伍到村北口、
    // 往主街一看就知道过不去，所以改成「人站在主街北口这个 box 里、且到障碍有通视」。
    // 半径留 46 m（box 最远一角到锚点 45.3 m）当外圈兜底，真正判的是 area + sight。
    area: Object.freeze({ minX: 72.6, maxX: 81.4, minZ: -30, maxZ: -6 }),
    sight: Object.freeze({ anchor: "streetBlock", toM: 1.2 }),
    note: "站在主街北口（x 72.6–81.4、z −30…−6）望得见倒墙＋横车；东巷窗口有日军火力",
  }),
  littersInCover: Gate({
    kind: "column", step: "Village", source: "FirstLevelVillageBlock.UpdateVillage",
    text: "每一副活着的担架都停到 litterWait 的车位上，而且窗口与主街缺口两条射线都被 LitterHoldCover 切断",
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
    kind: "column", step: "Courtyard", source: "Update/VillageCourtyardCleared",
    requires: Object.freeze(["rearCoverDisengaged"]),
    text: "还活着的担架全部通过院门、在障碍南侧 streetRejoin 接回主街，且队尾掩护已经脱离",
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
    kind: "column", step: "Transfer", source: "FirstLevelTransferCart.UpdateTransfer",
    text: "第一处威胁解除后放开一批装载额度，这一批真的装满并且车真的开走了",
  }),
  alleyThreatResolved: Gate({
    kind: "combat", step: "Transfer", encounter: "transferAlley", source: "UpdateTransferThreats",
    text: "侧巷那一处威胁被清掉",
  }),
  zhouNext: Gate({
    kind: "column", step: "Transfer", source: "FirstLevelTransferCart.UpdateTransfer",
    text: "队列轮到老周：给他叫来一辆牛/马车，他被抬向装车位（离开原位 boardingWitnessM 以上）",
  }),
  escortGranted: Gate({ kind: "voice", step: "Transfer", cue: "EscortZhou", source: "VoiceDone" }),
  // --- CartRide ----------------------------------------------------------
  cartBoarded: Gate({
    kind: "interaction", step: "CartRide", interaction: "MissionCart", anchor: "cartBoard",
    source: "Register", text: "顺子坐上老周那辆牛/马车的车板（控制接管 cartRide，可环视）",
  }),
  zhouCartDeparted: Gate({
    kind: "scripted", step: "CartRide", source: "FirstLevelTransferCart.UpdateRide",
    text: "那辆车沿 cartRide 路线真实离开装载位置（cartDepartedM 以上）",
  }),
  cartTalkHeard: Gate({ kind: "voice", step: "CartRide", cue: "CartTalk", source: "VoiceDone" }),
  // --- AirFirst ----------------------------------------------------------
  firstAirPassComplete: Gate({
    kind: "scripted", step: "AirFirst", source: "UpdateAir",
    text: "日机第一趟扫射掠过桥头道路与车列",
  }),
  cartHalted: Gate({
    kind: "scripted", step: "AirFirst", source: "FirstLevelTransferCart.UpdateRide",
    text: "道路受损堵塞，车停在 cartHalt，控制权还给玩家",
  }),
  zhouUnloaded: Gate({
    kind: "scripted", step: "AirFirst", source: "FirstLevelTransferCart.UpdateUnload",
    text: "两个搬运的人走到车边，用 unloadSeconds 把老周从车板放回地面的担架上（有过程，不是瞬间）",
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
    kind: "scripted", step: "Regroup", source: "FirstLevelQuietMarch.UpdateRegroup",
    text: "缺人的担架真的等来了替补（民夫走过去接手，BearerShort/RequestBearer 那条路），"
      + "倒下的担架重新立起来，老周担架两端都有人；前置是 survivorsSheltered",
    requires: ["survivorsSheltered"],
  }),
  columnMoving: Gate({
    kind: "column", step: "Regroup", source: "FirstLevelQuietMarch.UpdateRegroup",
    text: "队首沿撤离线真的走出一个担架间距（不是进沟就算）",
    requires: ["litterRemanned"],
  }),
  // --- WallPath (15B) ----------------------------------------------------
  carryHandover: Gate({
    kind: "interaction", step: "WallPath", interaction: "MissionZhouCarry", anchor: "wallPathStart",
    source: "BeginCarry", text: "后抬手撒手之后顺子按 F 接过老周担架（CarrySwap）",
    requires: ["carrySwapOffered"],
  }),
  wallPathTraversed: Gate({
    kind: "proximity", step: "WallPath", anchor: "wallPathEnd", radiusM: 6, source: "Update",
    note: "靠院墙夹道那一段留了无对白行走（quietWalkObserved 取证），全程无敌人",
  }),
  stragglersTended: Gate({
    kind: "column", step: "WallPath", source: "FirstLevelQuietMarch.UpdateWallPath",
    text: "每个掉队的步行伤员身边都真的有人走到了（照应者跟到并排的距离内）",
  }),
  // --- ReceptionGate (15C) -----------------------------------------------
  gateChallenged: Gate({ kind: "voice", step: "ReceptionGate", cue: "GateChallenge", source: "VoiceDone" }),
  receptionAccepted: Gate({ kind: "voice", step: "ReceptionGate", cue: "ReceptionAccept", source: "VoiceDone" }),
  woundedEntering: Gate({
    kind: "column", step: "ReceptionGate", source: "FirstLevelReception.UpdateGate",
    text: "接收人员把位置说清楚（receptionAccepted）之后担架队才上入院路线；"
      + "全部幸存担架都在路上、而且已经有 " + END.woundedEnteringLitters + " 副真的进了院子",
    requires: ["receptionAccepted"],
  }),
  // --- Handover ----------------------------------------------------------
  thresholdCrossed: Gate({
    kind: "proximity", step: "Handover", point: MISSION_RECEPTION_SPACE.wardEntry, radiusM: 3, source: "Update",
    note: "过厢房门槛（会颠一下）——「脚……慢点」是老周最后一句话",
  }),
  zhouPlaced: Gate({
    kind: "interaction", step: "Handover", interaction: "MissionZhouPlace", anchor: "zhouDrop",
    source: "Register", text: "军医指了位置（placeOrderHeard）之后，玩家与前抬手一起把老周放下；放下就恢复持枪",
    requires: ["placeOrderHeard"],
  }),
  medicExamining: Gate({ kind: "voice", step: "Handover", cue: "MedicAsk", source: "VoiceDone" }),
  squadAssigned: Gate({ kind: "voice", step: "Handover", cue: "SquadAssign", source: "VoiceDone" }),
  // --- Death -------------------------------------------------------------
  deathSceneComplete: Gate({
    kind: "cutscene", step: "Death", source: "controls(death) + FirstLevelReception.UpdateDeath",
    text: "老周牺牲那一段演完（第一人称，不切尸体特写，ZhouDeath 七句放完），"
      + "而且接收处真的继续在工作：门外又抬进来一副担架、军医转过去救下一个、幺娃把覆盖物拉正。"
      + "老周死亡不判全关失败",
  }),
  // --- Bridge ------------------------------------------------------------
  bridgeOrdersHeard: Gate({
    kind: "voice", step: "BridgeOrders", cue: "BridgeOrders", source: "VoiceDone",
    note: "传令兵真人跑到接收处玩家跟前才起（bridgeRunnerArrived）",
  }),
  southBankReached: Gate({
    kind: "proximity", step: "BridgeCover", anchor: "bridgeCover", radiusM: 8, source: "Update",
    note: "南岸遮挡后的射位",
  }),
  bridgeFireBroken: Gate({
    kind: "combat", step: "BridgeCover", encounter: "bridgeNorth", member: "BridgeNorthGunner",
    source: "FirstLevelBridge.FireBroken",
    text: "北岸土坎的火力被打断：架在坎上那挺机枪必须哑，而且活着的人谁也够不到桥头与桥心。"
      + "不做多波守点，也不要求杀光（Notion：玩家不承担「杀光所有敌军」）",
  }),
  rearColumnCrossed: Gate({
    kind: "column", step: "BridgeCover", source: "FirstLevelBridge.UpdateColumn",
    text: "威胁解除后，还活着的回援尾队每一个都沿 bridgeCrossing 真的下了南桥头"
      + "（火力下停在北引道的那一段不算通过；中弹倒下的不拦着这一条）",
    requires: ["bridgeFireBroken"],
  }),
  blastZoneCleared: Gate({
    kind: "proximity", step: "BridgeWithdraw", anchor: "blastSafe", radiusM: 10, source: "Update",
    note: "玩家退到南岸掩护区；爆破区里还有己方时爆破继续等（blastHeldForFriendly）",
  }),
  bridgeDestroyed: Gate({
    kind: "scripted", step: "BridgeWithdraw", source: "FirstLevelBridge.UpdateWithdraw",
    text: "爆破由此前就在场的人员完成（demolitionCharged），爆破区 "
      + END.blastClearRadiusM + " m 内一个己方都没有才点火 —— 不是到点就炸的计时器。"
      + "玩家在安全距离看见桥被破坏：5 个完好件消失、3 个残骸件出现（信号 RailBridgeDestroyed，不可逆）",
    requires: ["blastZoneCleared", "demolitionCharged"],
  }),
  marchOrderHeard: Gate({ kind: "voice", step: "BridgeWithdraw", cue: "MarchToTengxian", source: "VoiceDone" }),
  // --- NightMarch --------------------------------------------------------
  nightTransitionComplete: Gate({
    kind: "scripted", step: "NightMarch", source: "Update/controls(nightTransition)",
    text: "先随队真的走完 marchOut 那一段（marchOutReached），行军脚步不停 → 淡出 → "
      + "字幕「1938年3月15日 夜｜滕县」→ 黑屏里换夜间天空并瞬移 → 淡入北门外行军队列",
    requires: ["marchOutReached"],
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

  // --- 08–14 的内部辅助事实（第二波 Mid 包，契约 §2「实现包可以增加内部辅助事实」）---
  houseChecked: Gate({
    kind: "scripted", step: "Village", source: "FirstLevelVillageBlock.UpdateVillage",
    text: "罗班长真的走到相邻房屋（灶屋北门内侧）查看过了 —— KitchenDetour 在这之后才喊",
  }),
  outsideWatched: Gate({
    kind: "scripted", step: "Village", source: "FirstLevelVillageBlock.UpdateVillage",
    text: "何有田退到主街这一侧的观察位（「外头我看着！」）",
  }),
  meleeBreachStarted: Gate({
    kind: "scripted", step: "Melee", source: "FirstLevelVillageBlock.UpdateMeleeBeat",
    text: "连屋那一组从东巷那扇门进来（玩家进了灶屋、走到连屋附近才放）",
  }),
  windowFireHolding: Gate({
    kind: "combat", step: "Melee", member: "VillageGunner", encounter: "village",
    source: "FirstLevelVillageBlock.UpdateMeleeBeat",
    text: "近战结束了，窗口那挺机枪还活着、射线仍然通到院门 —— WindowOrder 就是这时候喊的",
  }),
  rearCoverDisengaged: Gate({
    kind: "scripted", step: "Courtyard", source: "FirstLevelVillageBlock.UpdateCourtyard",
    text: "队尾掩护（刘文财）走过院门以南 rearCoverClearM，队尾脱离",
  }),
  transferSorted: Gate({
    kind: "column", step: "TransferApproach", source: "FirstLevelTransferCart.UpdateApproach",
    text: "分流真的发生了：躺着的进了装载区集结口袋，能走的跟着往前头去了",
  }),
  bridgeHeadSeen: Gate({
    kind: "scripted", step: "TransferApproach", source: "FirstLevelTransferCart.UpdateApproach",
    text: "玩家辨认桥头方向：对准路桥，或者已经走到车位那一排以南",
  }),
  villageRoadWatched: Gate({
    kind: "scripted", step: "TransferApproach", source: "FirstLevelTransferCart.UpdateApproach",
    text: "玩家辨认村路威胁：在接运区回头对着村路来路，或者追兵已经露头",
  }),
  transferPostsManned: Gate({
    kind: "scripted", step: "Transfer", source: "FirstLevelTransferCart.UpdateTransfer",
    text: "班里人上了低墙/墙角一线的射位（不站在伤员中间四面打）",
  }),
  escortRelieved: Gate({
    kind: "scripted", step: "Transfer", source: "FirstLevelTransferCart.UpdateTransfer",
    text: "何有田真的走过来接住顺子的射位 —— EscortZhou 在这之后才喊",
  }),
  luoAtHalt: Gate({
    kind: "scripted", step: "AirFirst", source: "FirstLevelTransferCart.UpdateAirGround",
    text: "罗班长从后方赶到停车处（「莫挤路上！能下沟的下沟！」）",
  }),
  ditchSheltered: Gate({
    kind: "scripted", step: "Rescue", source: "FirstLevelTransferCart.UpdateDitch",
    text: "老周进了沟内遮挡（离下沟口 ditchMouth 这个半径以内）",
  }),
  columnOffRoad: Gate({
    kind: "column", step: "Rescue", source: "FirstLevelTransferCart.UpdateDitch",
    text: "老周那一副担架与玩家都离开了桥头主车道（整队重新成形是 15A 的 columnMoving）",
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
  // --- 15–18 玩法包（End）的内部辅助事实（契约 §2 允许各包自己加）-------------
  survivorsSheltered: Gate({
    kind: "column", step: "Regroup", source: "FirstLevelQuietMarch.UpdateRegroup",
    text: "幸存者全部贴进撤离沟的遮挡里、此刻没有敌人能看见他们（litterRemanned 的前置）",
    requires: ["rescuePassageClear"],
  }),
  carrySwapOffered: Gate({
    kind: "scripted", step: "WallPath", source: "FirstLevelQuietMarch.UpdateWallPath",
    text: "后抬手体力不支撒手，担架停下等人接（CarrySwap 起在这一刻）",
  }),
  roadBumpCrossed: Gate({
    kind: "scripted", step: "WallPath", source: "FirstLevelQuietMarch.UpdateWallPath",
    text: "抬着老周走上夹道里那一处 0.22 m 的坎（WallPathBump，起 RoadBump）",
  }),
  quietWalkObserved: Gate({
    kind: "timer", step: "WallPath", source: "FirstLevelQuietMarch.UpdateWallPath",
    text: "夹道末段真的走了一整段无对白的路（取证用，不是过关条件）",
  }),
  placeOrderHeard: Gate({
    kind: "voice", step: "Handover", cue: "PlaceLitter", source: "FirstLevelReception.UpdateHandover",
    text: "老周过门槛的最后一句说完之后，军医才指位置（喊出口之后才允许按 F 放下担架）",
    requires: ["thresholdCrossed"],
  }),
  squadDispersed: Gate({
    kind: "scripted", step: "Handover", source: "FirstLevelReception.UpdateHandover",
    text: "分派完人真的走开／留下（文财问路、何有田跟班长看外头、幺娃留在担架边）",
  }),
  bridgeRunnerArrived: Gate({
    kind: "scripted", step: "BridgeOrders", source: "FirstLevelBridge.UpdateOrders",
    text: "传令兵真人跑到接收处玩家跟前（BridgeOrders 起在这一刻，不是进步骤就喊）",
  }),
  demolitionCharged: Gate({
    kind: "scripted", step: "BridgeWithdraw", source: "FirstLevelBridge.UpdateWithdraw",
    text: "桥头原本就在场的爆破人员把药装好了（顺子不参与）",
  }),
  blastHeldForFriendly: Gate({
    kind: "scripted", step: "BridgeWithdraw", source: "FirstLevelBridge.UpdateWithdraw",
    text: "爆破区里还有己方，爆破一直等（取证用：证明不是到点就炸的计时器）",
  }),
  blastFriendlyStuck: Gate({
    kind: "scripted", step: "BridgeWithdraw", source: "FirstLevelBridge.ClearBlastZone",
    text: "爆破区里有个自己人卡住不动了（已经喊他撤、也真的推过他）：玩家早已退到安全区，"
      + "记一条取证之后放行。玩家本人在区里则永远等",
  }),
  marchOutReached: Gate({
    kind: "proximity", step: "NightMarch", anchor: "marchOut", radiusM: END.marchOutArriveM,
    source: "FirstLevelNightGate.UpdateMarchOut",
    note: "爆破之后随队走完 marchOut 那一段，才起黑屏转场（不是进步骤就淡出）",
  }),
  nightUsherLeading: Gate({
    kind: "scripted", step: "NightMarch", source: "FirstLevelNightGate.UpdateNight",
    text: "带路军人喊完话，领着小队从回援队列里分出来往门洞走",
  }),

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

/**
 * 距离门可以再挂一个 `area` 矩形（08「队伍到村北口」那种「人要站在这一带」）。
 * 矩形写在表里，运行时只调这个函数 —— 坐标不散落在 Script_ 里。
 */
export function MissionGateInArea(point, area) {
  if (!area) return true;
  return point.x >= area.minX && point.x <= area.maxX
    && point.z >= area.minZ && point.z <= area.maxZ;
}

/** 事实门查表：精确条目优先，其次按家族前缀解析。找不到返回 null。 */
export function MissionFactGate(fact) {
  const exact = MISSION_FACT_GATES[fact];
  if (exact && exact.kind !== "proximityFamily") return { id: fact, gate: exact, index: null, key: null, point: null };
  return MissionGateFamily(fact);
}
