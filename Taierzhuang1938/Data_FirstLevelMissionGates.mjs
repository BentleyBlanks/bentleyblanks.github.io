// ===========================================================================
// Data_FirstLevelMissionGates.mjs —— 第一关《往南的路》的编排表（纯数据，零 three）
//
// 这一份把原先散在 Script_FirstLevelMissionRuntime 里的三样东西提出来，成为
// 运行时与关卡编排工作台**共用的同一份口径**：
//
//   1. MISSION_STEP_SPAWNS         —— 进某个内部步骤时按表生成哪些遭遇组；
//   2. MISSION_ENCOUNTER_ACTIVATION—— 每个遭遇组怎么出现 / 什么时候解除待命或苏醒；
//   3. MISSION_VOICE_FACTS         —— 对白播完即记的事实；
//   4. MISSION_FACT_GATES          —— 每一个事实是怎么判出来的（含 MISSION_STAGES
//                                     requirements 里的全部事实）。
//
// 规矩：
//   · 数值只引用既有表（R / OPENING / Sortie / FRONT_SHELLS…）。只有原先在运行时
//     里就是裸字面量、别处没有出处的半径，才在这里落成数字 —— 落下来之后**这里
//     就是唯一出处**，运行时通过 GateNear 反过来读它。
//   · 事实门只描述「怎么判」，附加条件（担架是否全部通过、是否已下车之类）留在
//     运行时代码里；这里用 requires / note 说明，工作台照它讲人话。
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

// ---------------------------------------------------------------------------
// 1. 步骤进入时按表生成的遭遇组
// ---------------------------------------------------------------------------
// 顺序 = 原先 Enter(stage) 各 case 里 SpawnEncounter 的调用顺序（生成是排队的，
// 顺序决定它们进 spawnQueue 的先后）。
// 不进这张表的两类：
//   · front —— 由 UpdateFront 的 frontBattleStarted 与 Support 段的 frontReached 生成；
//   · transfer 四拍 —— 由 UpdateTransferBeats 按 MISSION_TRANSFER_BEATS 的拍子生成
//     （transfer 这一组本身在进 Transfer 步时就生成，所以它在表里）。
export const MISSION_STEP_SPAWNS = Object.freeze({
  Support: Object.freeze(["approach", "tank", "village", "melee"]),
  MachineGun: Object.freeze(["machineGun", "tank"]),
  Tank: Object.freeze(["bundleApproach"]),
  Village: Object.freeze(["village", "melee"]),
  Courtyard: Object.freeze(["courtyard"]),
  Transfer: Object.freeze(["transfer"]),
  AirFirst: Object.freeze(["air"]),
  RetreatFirst: Object.freeze(["retreat"]),
  RetreatWall: Object.freeze(["retreatWall"]),
  RetreatYard: Object.freeze(["retreatYard"]),
  Reception: Object.freeze(["reception"]),
  Death: Object.freeze(["final"]),
});

// ---------------------------------------------------------------------------
// 2. 遭遇组的出现 / 激活规则
// ---------------------------------------------------------------------------
// spawn.kind：
//   step     进某个内部步骤时（见 MISSION_STEP_SPAWNS）
//   fact     记下某个事实时
//   beat     转运区的某一拍就绪时（MISSION_TRANSFER_BEATS）
//   opening  由 Script_FirstLevelOpening 在它自己的那一段里生成
// standbyUntil：生成时是待命状态（不开火），记下这个事实才解除。
// dormant / wake：生成时整组装睡（scriptedNoncombatant），按 wake 醒。
export const MISSION_ENCOUNTER_ACTIVATION = Object.freeze({
  surface: Object.freeze({
    spawn: Object.freeze({ kind: "opening", step: "Unloading" }),
    note: "开局炮击后由 FirstLevelOpening 生成（车站地面上的那一批）",
  }),
  intrusion: Object.freeze({
    spawn: Object.freeze({ kind: "opening", step: "TrenchEntry" }),
    note: "从 FlankBreachSap 的缺口进侧沟",
  }),
  shelterPursuit: Object.freeze({
    spawn: Object.freeze({ kind: "opening", step: "Shelter" }),
    note: "进掩蔽处时生成，沿交通壕压下来",
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
    wake: Object.freeze({ kind: "fact", fact: "ambushTriggered" }),
    note: "屋内伏击的四个人：村口那批醒的时候他们不跟着醒，要等顺子真的进屋",
  }),
  courtyard: Object.freeze({ spawn: Object.freeze({ kind: "step", step: "Courtyard" }) }),
  // 四拍都在 Transfer 这一步里，由 UpdateTransferBeats 按 MISSION_TRANSFER_BEATS 放出；
  // 第一拍（transfer）的窗口是 0 秒，所以它等价于「进 Transfer 步就生成」。
  transfer: Object.freeze({ spawn: Object.freeze({ kind: "beat", beat: "transfer", step: "Transfer" }) }),
  transferFlank: Object.freeze({ spawn: Object.freeze({ kind: "beat", beat: "transferFlank", step: "Transfer" }) }),
  transferLast: Object.freeze({ spawn: Object.freeze({ kind: "beat", beat: "transferLast", step: "Transfer" }) }),
  transferRear: Object.freeze({ spawn: Object.freeze({ kind: "beat", beat: "transferRear", step: "Transfer" }) }),
  air: Object.freeze({ spawn: Object.freeze({ kind: "step", step: "AirFirst" }) }),
  retreat: Object.freeze({ spawn: Object.freeze({ kind: "step", step: "RetreatFirst" }) }),
  retreatWall: Object.freeze({ spawn: Object.freeze({ kind: "step", step: "RetreatWall" }) }),
  retreatYard: Object.freeze({ spawn: Object.freeze({ kind: "step", step: "RetreatYard" }) }),
  reception: Object.freeze({ spawn: Object.freeze({ kind: "step", step: "Reception" }) }),
  final: Object.freeze({ spawn: Object.freeze({ kind: "step", step: "Death" }) }),
});

// ---------------------------------------------------------------------------
// 3. 对白播完即记的事实
// ---------------------------------------------------------------------------
// 只收原先 VoiceDone 里那一串「简单 if」。带额外副作用的（TrainRescue、
// AircraftDiveOrder、TrainNearShell…）在 VoiceEvent 里，不进这张表。
export const MISSION_VOICE_FACTS = Object.freeze({
  TrainBriefing: "trainShelling",
  WreckExit: "unloadOrdersHeard",
  EscapeWhisper: "escapeWhisperHeard",
  SupportOrder: "supportOrdersHeard",
  AircraftFirst: "firstAirOrdersHeard",
  CarryZhou: "carryOrdersHeard",
  FinalExit: "finalExitHeard",
  Volunteer: "volunteerHeard",
  ZhouLift: "zhouOnLitter",
  BundleSupplyDirections: "bundleDirectionsHeard",
  SouthHope: "southHopeHeard",
  FollowVehicle: "followVehicleHeard",
  TransferHope: "transferHopeHeard",
});

// ---------------------------------------------------------------------------
// 4. 事实门
// ---------------------------------------------------------------------------
const Gate = (entry) => Object.freeze(entry);
export const MISSION_FACT_GATES = Object.freeze({
  // --- Train -------------------------------------------------------------
  trainShelling: Gate({ kind: "voice", step: "Train", cue: "TrainBriefing", source: "VoiceDone" }),
  // --- Unloading ---------------------------------------------------------
  trainStopped: Gate({
    kind: "scripted", step: "Unloading", source: "Update/MissionTrainMotion",
    text: "军列按 MissionTrainMotion 停稳（同时开三扇车门）",
  }),
  trainDerailed: Gate({
    kind: "scripted", step: "Unloading", source: "FirstLevelOpening.Update/Derail",
    text: "近失弹把那节车厢掀翻（炮击演出推到 t=1）",
  }),
  luoRescueComplete: Gate({
    kind: "cutscene", step: "Unloading", source: "Update/controls(rescue)",
    text: "罗班长把顺子从车厢残骸里拖出来那一段演完",
  }),
  unloadOrdersHeard: Gate({ kind: "voice", step: "Unloading", cue: "WreckExit", source: "VoiceDone" }),
  unloaded: Gate({
    kind: "proximity", step: "Unloading", anchor: "unload", radiusM: 6,
    requires: Object.freeze(["trainStopped"]), source: "Update",
    note: "且人已经不在车厢里（TrainContains 为假）",
  }),
  // --- TrenchEntry -------------------------------------------------------
  trenchEntered: Gate({
    kind: "proximity", step: "TrenchEntry", point: OPENING.trenchEntry, radiusM: 5,
    source: "FirstLevelOpening.Update",
    note: "同一个沟口外面还有一圈更大的（8 m）只用来起 TrenchContact 那句台词，不记事实，留在代码里",
  }),
  trenchCleared: Gate({
    kind: "combat", step: "TrenchEntry", encounter: "intrusion",
    source: "FirstLevelOpening.Update", text: "从缺口进沟的那一组全部阵亡",
  }),
  shelterReached: Gate({
    kind: "proximity", step: "TrenchEntry", point: OPENING.shelter, radiusM: OPENING.shelterRadiusM,
    requires: Object.freeze(["trenchCleared"]), source: "FirstLevelOpening.Update",
    note: "且折角是被掩护住的（ShelterProtected）。Shelter 步里那句 ShelterAid 喘息台词"
      + "判「人还在折角圈里」时复用的也是这一条门（同点同半径）",
  }),
  // --- Shelter -----------------------------------------------------------
  shelterCornerHeld: Gate({
    kind: "combat", step: "Shelter", encounter: "shelterPursuit",
    source: "FirstLevelOpening.Update", text: "压到折角的那一组全部阵亡",
  }),
  escapeWhisperHeard: Gate({ kind: "voice", step: "Shelter", cue: "EscapeWhisper", source: "VoiceDone" }),
  woundedSeen: Gate({
    kind: "scripted", step: "Shelter", source: "FirstLevelOpening.Update",
    text: "顺子看见从前面抬下来的伤兵（视线不被挡，距离在 shelterWitnessM 内）",
  }),
  supportOrdersHeard: Gate({ kind: "voice", step: "Shelter", cue: "SupportOrder", source: "VoiceDone" }),
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
  zhouGunWounded: Gate({
    kind: "scripted", step: "Support", source: "FirstLevelOpening.UpdateZhou",
    text: "老周在机枪位上挨了那一发（负伤但没死）",
  }),
  // --- MachineGun --------------------------------------------------------
  frontAttackRepelled: Gate({
    kind: "combat", step: "MachineGun", encounter: "machineGun", source: "UpdateFrontAttack",
    text: "machineGun 组全部阵亡或被打退（退到 retreatDistanceM 之外）",
  }),
  guardWithdrawalResolved: Gate({
    kind: "scripted", step: "MachineGun", source: "UpdateGuards",
    text: "八对守军全部撤回交通壕或阵亡",
  }),
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
  // --- Orders ------------------------------------------------------------
  ordersReached: Gate({ kind: "proximity", step: "Orders", anchor: "orders", radiusM: 5, source: "Update" }),
  volunteerHeard: Gate({ kind: "voice", step: "Orders", cue: "Volunteer", source: "VoiceDone" }),
  zhouOnLitter: Gate({ kind: "voice", step: "Orders", cue: "ZhouLift", source: "VoiceDone" }),
  // --- South -------------------------------------------------------------
  southTransitionComplete: Gate({
    kind: "cutscene", step: "South", source: "Update/controls(southTransition)",
    text: "「向南」那段黑屏转场放完",
  }),
  southTraversed: Gate({
    kind: "proximity", step: "South", anchor: "village", radiusM: 3, source: "Update",
    note: "黑屏转场结束的那一帧判一次（人已经被放到村口）",
  }),
  // --- Village -----------------------------------------------------------
  innerCourtReached: Gate({
    kind: "proximity", step: "Village", anchor: "melee", radiusM: R.meleeTriggerRadiusM,
    requires: Object.freeze(["kitchenTraversed"]), source: "Update",
  }),
  // --- Melee -------------------------------------------------------------
  meleeResolved: Gate({
    kind: "scripted", step: "Melee", source: "FirstLevelAmbush.Resolve",
    text: "屋内伏击那四个人处理完（挣脱刺刀之后清场）",
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
    text: "还活着的担架全部通过院门",
  }),
  // --- TransferApproach --------------------------------------------------
  transferApproachReached: Gate({
    kind: "proximity", step: "TransferApproach", anchor: "transfer", radiusM: 14, source: "Update",
  }),
  transferHopeHeard: Gate({ kind: "voice", step: "TransferApproach", cue: "TransferHope", source: "VoiceDone" }),
  // --- Transfer ----------------------------------------------------------
  transferArrived: Gate({ kind: "proximity", step: "Transfer", anchor: "transfer", radiusM: 14, source: "Update" }),
  vehiclesDeparted: Gate({
    kind: "column", step: "Transfer", source: "Update/column.TransferReady",
    text: "车辆分批全部出发",
  }),
  transferAttacksResolved: Gate({
    kind: "combat", step: "Transfer", source: "UpdateTransferBeats",
    text: "转运区四拍攻击全部清掉",
  }),
  zhouNext: Gate({
    kind: "column", step: "Transfer", source: "Update",
    text: "队列轮到老周，他被抬向装车位（离开原位 boardingWitnessM 以上）",
  }),
  followVehicleHeard: Gate({ kind: "voice", step: "Transfer", cue: "FollowVehicle", source: "VoiceDone" }),
  // --- AirFirst ----------------------------------------------------------
  firstAirPassComplete: Gate({
    kind: "scripted", step: "AirFirst", source: "UpdateAir",
    text: "日机第一趟扫射掠过",
  }),
  firstAirOrdersHeard: Gate({ kind: "voice", step: "AirFirst", cue: "AircraftFirst", source: "VoiceDone" }),
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
  // --- Retreat -----------------------------------------------------------
  retreatFirstPassed: Gate({
    kind: "proximity", step: "RetreatFirst", anchor: "retreatA", radiusM: 20, source: "Update",
    note: "还要求剩下的担架全部越过这一段的放行进度",
  }),
  retreatWallPassed: Gate({
    kind: "proximity", step: "RetreatWall", anchor: "retreatB", radiusM: 20, source: "Update",
    note: "同上：担架先过，玩家再进圈",
  }),
  retreatYardPassed: Gate({
    kind: "proximity", step: "RetreatYard", anchor: "retreatC", radiusM: 20, source: "Update",
    note: "这一段的圈心是**最后一副担架**（活点），不是锚点；还要求玩家在路线上的进度跟上",
  }),
  receptionPassed: Gate({
    kind: "proximity", step: "Reception", anchor: "reception", radiusM: 24, source: "Update",
    note: "还要求剩下的担架全部被接收院收下",
  }),
  // --- FinalCarry / Death ------------------------------------------------
  zhouPlaced: Gate({
    kind: "interaction", step: "FinalCarry", interaction: "MissionZhouPlace", anchor: "zhouDrop",
    source: "Register", text: "把老周放到卫生兵旁边",
  }),
  deathSceneComplete: Gate({
    kind: "cutscene", step: "Death", source: "Update/controls(death)",
    text: "老周牺牲那一段演完（且 ZhouDeath 的对白放完）",
  }),
  // --- FinalDefense ------------------------------------------------------
  rearLaneClear: Gate({
    kind: "combat", step: "FinalDefense", anchor: "rearExit", source: "Update",
    text: "后门外那条巷子没有威胁（Threatens 为假）",
  }),
  medicsEscaped: Gate({
    kind: "column", step: "FinalDefense", source: "Update",
    text: "卫生兵与剩下的担架全部撤出或已通过后门",
  }),
  // --- Exit --------------------------------------------------------------
  playerAtHandoff: Gate({ kind: "proximity", step: "Exit", anchor: "end", radiusM: 5, source: "Update" }),
  finalExitHeard: Gate({ kind: "voice", step: "Exit", cue: "FinalExit", source: "VoiceDone" }),

  // -----------------------------------------------------------------------
  // 不在 requirements 里、但影响编排的触发
  // -----------------------------------------------------------------------
  frontBattleStarted: Gate({
    kind: "proximity", step: "Support", anchor: "front", radiusM: R.frontEngageDistanceM,
    source: "UpdateFront", note: "放出 front 组、解除 front/machineGun/tank 的待命",
  }),
  kitchenTraversed: Gate({
    kind: "interior", step: "Village", box: "kitchenInterior", source: "Update",
    text: "玩家从右侧灶屋穿过去（innerCourtReached 的前提）",
  }),
  ambushTriggered: Gate({
    kind: "scripted", step: "Melee", source: "FirstLevelAmbush.Trigger",
    text: "屋内伏击打响（melee 组从装睡里醒过来）",
  }),
  gunOccupied: Gate({
    kind: "interaction", step: "MachineGun", interaction: "MissionGun", anchor: "gun",
    source: "Register/OnOccupy", text: "玩家坐上机枪位（班里人同时散到 squadFrontPositions）",
  }),
  gunUsed: Gate({
    kind: "scripted", step: "MachineGun", source: "Update",
    text: "机枪打出过子弹（守军交替撤退的放行条件之一）",
  }),
  captivesWitnessed: Gate({
    kind: "proximity", step: "MachineGun", point: OPENING.zhouGunSeat, radiusM: R.captivesCutsceneRadiusM,
    source: "UpdateCaptivesCutscene",
    note: "04 机枪点位那段关中过场的触发圈；运行时用的是它自己的 GUN_SEAT 常量（与机枪座共用同一个坐标）",
  }),
  bundleDirectionsHeard: Gate({ kind: "voice", step: "Tank", cue: "BundleSupplyDirections", source: "VoiceDone" }),
  southHopeHeard: Gate({ kind: "voice", step: "South", cue: "SouthHope", source: "VoiceDone" }),

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
