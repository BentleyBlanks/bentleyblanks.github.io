import { FRONT_SORTIE as Sortie } from "./Data_FirstLevelFrontRoute.mjs";
import { MISSION_TOPOLOGY_VERSION } from "./Data_FirstLevelMissionTopology.mjs";
import { FRONT_FIELD_MEN, FRONT_RESERVES, FRONT_MACHINE_GUN_ATTACK, FRONT_APPROACH_ENEMIES, APPROACH_TACTICS, FRONT_FLANK_GROUP, FRONT_OFFICER, FRONT_RESERVE_ENTRIES } from "./Data_FirstLevelMissionFront.mjs";
import { CHAPTER } from "./Data_MissionCh1.mjs";
import { MISSION_LAYOUT, MISSION_ANCHORS as A, MISSION_ROUTES, MISSION_PLACEMENT as P } from "./Data_FirstLevelMissionLayout.mjs";
export const MISSION_VERSION = MISSION_TOPOLOGY_VERSION;
import { MISSION_TUNING } from "./Data_Tuning_FirstLevel.mjs";
export { MISSION_TUNING } from "./Data_Tuning_FirstLevel.mjs";
// Both air passes. Ki-30 (Army Type 97 light bomber) entered combat in China in spring 1938; the Ki-43 flew
// only in 1939 and has no texture. The documented aircraft near Tengxian were Type 88 reconnaissance biplanes,
// for which there is no model yet. See docs/Data_AircraftAssets.md.
export const MISSION_AIRCRAFT_ID = "MitsubishiKi30";
const Stage = (id, objective, target, requirements, cue, extra = {}) =>
  Object.freeze({ id, objective, target, requirements, cue, ...extra });
// 内部步骤 27 个 + Complete（docs/Data_FirstLevelRebuild20260919Contract.md §1）。
// 公开阶段仍是 18 个，分组见 Data_FirstLevelMissionStages。
export const MISSION_STAGES = Object.freeze([
  Stage(
    "Trapped",
    "被压住了。稳住，别出声。",
    A.bunker,
    ["bunkerCollapsed", "captivesKilled", "doorSearchStarted"],
    "BunkerBanter",
  ),
  Stage(
    "BunkerRescue",
    "跟着班长出去，把枪捡起来。",
    A.bunkerDoor,
    ["rescueCallHeard", "luoRescueComplete", "rifleRecovered"],
    null,
  ),
  Stage(
    "RearTrench",
    "沿后交通壕撤到背坡集结处。",
    A.collection,
    ["rearTrenchEntered", "cornerReached", "collectionPointSeen", "supportOrdersHeard"],
    null,
  ),
  Stage(
    "Support",
    "跟随班长，夺取右侧机枪阵位。",
    A.front,
    ["frontReached", "rightNestCaptured", "frontContact", "frontRifleDefense", "rifleWithdrawalResolved", "zhouGunWounded", "tankPreviewed"],
    null,
  ),
  Stage(
    "MachineGun",
    "掩护后续守军，留意右前方道路。",
    A.gun,
    ["tankPositionPressured", "remainingGuardsGathered", "tankBlocksExit", "rightRearReached", "bundleOrderHeard"],
    null,
  ),
  Stage(
    "Tank",
    "沿后侧支沟取得集束弹，解除撤口封锁。",
    A.bundle,
    ["bundleRouteTraversed", "bundleTaken", "bundleReturned", "attackPositionReached", "tankImmobilized", "tankFireDisabled", "attackRetreated", "lastGuardsWithdrawn", "frontDisengaged", "reliefInPosition", "collectionReturned"],
    "BundleGo",
  ),
  Stage(
    "Orders",
    "回伤员集结处接令，带老周离开阵地。",
    A.collection,
    ["ordersReached", "volunteerHeard", "lightShared", "zhouOnLitter", "columnDeparted"],
    "Volunteer",
  ),
  Stage(
    "South",
    "护送伤员向南，抵达村口。",
    A.village,
    ["southWhisperHeard", "villageMouthReached", "mainStreetPointed"],
    "SouthWhisper",
  ),
  Stage(
    "Village",
    "主街堵死了。把担架停进遮挡，从右侧灶屋绕。",
    A.streetBlock,
    ["streetBlockSeen", "littersInCover", "kitchenEntered"],
    "StreetBlocked",
  ),
  Stage("Melee", "连屋里冲出来了！上刺刀。", A.melee, ["meleeResolved"], "MeleeRight"),
  Stage(
    "Courtyard",
    "清理窗口机枪，打开院门，掩护担架分批通过。",
    A.gate,
    ["villageGunSilent", "courtyardGateOpen", "courtyardPassed"],
    "CourtyardOpen",
  ),
  Stage(
    "TransferApproach",
    "沿主街前往桥头接运点。",
    A.transfer,
    ["transferApproachReached", "transferSortingHeard", "villageRoadThreatSeen"],
    "TransferSorting",
  ),
  Stage(
    "Transfer",
    "压住装载区与侧巷，掩护伤员上车。",
    A.transfer,
    ["transferArrived", "loadingThreatResolved", "firstBatchLoaded", "alleyThreatResolved", "zhouNext", "escortGranted"],
    "TransferDefense",
  ),
  Stage("CartRide", "上车，跟着老周。", A.cartHalt, ["cartBoarded", "zhouCartDeparted", "cartTalkHeard"], "CartTalk"),
  Stage(
    "AirFirst",
    "日机来袭！下车找掩体。",
    A.cartHalt,
    ["firstAirPassComplete", "cartHalted", "zhouUnloaded", "westDitchPointed"],
    "AircraftFirst",
  ),
  Stage("Carry", "接替老周担架后端，抬往西侧下沟口。", A.queue, ["zhouCarried", "atDitchMouth", "carryOrdersHeard"], "CarryZhou"),
  Stage("Dive", "下沟！", A.ditch, ["diveComplete"], "AircraftReturn"),
  Stage("Rescue", "拿枪断后，掩护幺娃把老周拖回担架。", A.ditch, ["zhouRecovered", "rescuePassageClear"], "RescueZhou"),
  Stage(
    "Regroup",
    "收拢队伍，清点人数。",
    A.retreatA,
    ["picketHolding", "zhouChecked", "headcountDone", "litterRemanned", "columnMoving"],
    "PicketHold",
  ),
  Stage(
    "WallPath",
    "沿院墙夹道继续南行。",
    A.wallPathEnd,
    ["carryHandover", "wallPathTraversed", "stragglersTended"],
    "CarrySwap",
  ),
  Stage(
    "ReceptionGate",
    "找到接收处，向院门守军报清来路。",
    A.receptionGate,
    ["gateChallenged", "receptionAccepted", "woundedEntering"],
    "GateChallenge",
  ),
  Stage(
    "Handover",
    "把老周抬进厢房，放到军医旁边。",
    A.zhouDrop,
    ["thresholdCrossed", "zhouPlaced", "medicExamining", "squadAssigned"],
    "Threshold",
  ),
  Stage("Death", "老周……", A.zhouDrop, ["deathSceneComplete"], "ZhouDeath"),
  Stage("BridgeOrders", "掩护回援分队通过铁路桥", A.bridgeCover, ["bridgeOrdersHeard"], "BridgeOrders"),
  Stage(
    "BridgeCover",
    "掩护回援分队通过铁路桥",
    A.bridgeCover,
    ["southBankReached", "bridgeFireBroken", "rearColumnCrossed"],
    "BridgeCover",
  ),
  Stage(
    "BridgeWithdraw",
    "退到安全距离，炸掉铁路桥。",
    A.blastSafe,
    ["blastZoneCleared", "bridgeDestroyed", "marchOrderHeard"],
    "BridgeWithdraw",
  ),
  Stage("NightMarch", "跟罗班长进滕城北门。", A.gateInside, ["nightTransitionComplete", "northGateReached", "gateEntered"], null),
  Stage("Complete", "第一关完成 · 往南的路", A.gateInside, [], null),
]);
export const MISSION_ENCOUNTERS = Object.freeze({
  // 01 掩蔽部门外的行刑组：两个动手的，随后跟进两个。玩家拾枪后可以打，但不是过关条件。
  // 起点取空间包的 MISSION_PLACEMENT.bunker.ijaStart（还在刺杀处以北 6 m，走进来才下刀）；
  // 下刀与转向门内的两组落点在 Script_FirstLevelOpening 里按 ijaKill / ijaDoor 走。
  // 2026-09-23 space rebuild (docs/Data_FirstLevelSpace0106_20260923.md §3). Contract §5.8 ids.
  // ijaA/ijaB come down the link sap from the lost east end to the kill spot outside the mouth;
  // ijaC stands at the fold F (fire step), ijaD at the junction J - both inside the K1 cone. `enter`
  // is the link-sap leg the Opening package walks them in on (start -> post), never used as a spawn.
  bunkerAssault: [
    // 说话角色的外观只在 Data_FirstLevelSpeakingCast 钉死（日兵甲 IJA06、日兵乙 IJA01、丙 IJA01、丁 IJA02，
    // 契约 §5.1 / v1.3）；这里只写 castId，不再另写 modelVariant。日兵甲的步枪不上刺刀（他用手持短刺刀割喉）。
    { id: "BunkerExecutionerA", role: "ijaA", ...P.bunker.ijaStart[0], castId: "ijaA", weapon: "Type38", bayonet: false },
    { id: "BunkerExecutionerB", role: "ijaB", ...P.bunker.ijaStart[1], castId: "ijaB", weapon: "Type38", bayonet: true },
    { id: "BunkerFollowA", role: "ijaC", ...A.bunkerFold, castId: "ijaC", weapon: "Type38", bayonet: true,
      enter: [{x:24.2,z:-130.6},{x:23.5,z:-130},A.bunkerFold] },
    { id: "BunkerFollowB", role: "ijaD", ...A.bunkerJunction, castId: "ijaD", weapon: "Type38", bayonet: true,
      enter: [{x:26.4,z:-133.4},{x:23.5,z:-130},A.bunkerFold,A.bunkerJunction] },
  ],
  // 01 background: the vanguard's forward elements pass J into the depth sap (out of sight south);
  // three distant NRA return fire from the rear corner and the support sap (never hit, fire points).
  bunkerBackdrop: [
    // They come down the upper link (the later attack branch) past the captured nest's rear
    // junction and the link sap, then turn south into the depth sap at J.
    ...[[36.4,-142.9],[39.4,-146],[39.7,-148.8],[40.6,-152],[41.5,-154.2],[43,-158]].map(([x,z],i)=>
      ({ id: `BunkerBackdropIja${i}`, side: "ija", role: "backdrop", x, z, weapon: i===3?"Type11":"Type38",
        route: [...(i>=2?[{x:39.8,z:-150}]:[]),...(i>=1?[{x:39.4,z:-144.2}]:[]),{x:35,z:-142.5},{x:29.7,z:-141.5},
          {x:27,z:-135.5},{x:23.5,z:-130},A.bunkerFold,A.bunkerJunction,{x:15.2,z:-118.5},{x:17.5,z:-111},{x:20.5,z:-102}],
        delayS: 2.2*i })),
    // side:"nra" members are friendly return fire (Ai package's backdrop mechanism spawns them on the
    // NRA side; the generic encounter spawner must never create this group - see its activation).
    { id: "BunkerBackdropNra0", side: "nra", role: "backdropNra", x: -5.6, z: -112, weapon: "HanYang", fireAt: A.bunkerJunction },
    { id: "BunkerBackdropNra1", side: "nra", role: "backdropNra", x: -9.4, z: -111.4, weapon: "HanYang", fireAt: A.bunkerFold },
    { id: "BunkerBackdropNra2", side: "nra", role: "backdropNra", x: -26.4, z: -124.4, weapon: "HanYang", fireAt: A.bunkerFold },
  ],
  // 02 pursuers: one base-of-fire man holds the fold F; three follow down the link sap to J and the
  // mouth (the player looks back and sees them on the spot he just left). None ever passes the bend M.
  bunkerPursuit: [
    // 1.35 m past the fold F along the sap (the fire step's far side): ijaC may still be standing on F itself.
    { id: "BunkerPursuitFold", role: "pursuitBase", x: 19.2, z: -126.5, weapon: "Type38", hold: true, faceTo: A.bunkerRear },
    { id: "BunkerPursuitA", role: "pursuit", x: 27, z: -135.5, weapon: "Type38", route: [{x:23.5,z:-130},A.bunkerFold,A.bunkerJunction], delayS: 3 },
    { id: "BunkerPursuitB", role: "pursuit", x: 29.7, z: -141.5, weapon: "Type38", route: [{x:23.5,z:-130},A.bunkerJunction,{x:6.8,z:-124.2}], delayS: 7 },
    { id: "BunkerPursuitC", role: "pursuit", x: 33, z: -143.2, weapon: "Type38", route: [{x:27,z:-135.5},A.bunkerFold,{x:9.6,z:-125.1}], delayS: 11 },
  ],
  approach: FRONT_APPROACH_ENEMIES,
  // The roster itself lives in Data_FirstLevelMissionFront: the assault lanes and the cover rows
  // are derived from it, and a list split across two files drifts.
  front: [...FRONT_FIELD_MEN,...FRONT_RESERVES],
  // 03 designated assault group (flank to the berm's east end) and its officer.
  frontFlank: FRONT_FLANK_GROUP,
  frontOfficer: [FRONT_OFFICER],
  // 04/05 reinforcements from out-of-sight entries (budget in FRONT_RESERVE_ENTRIES).
  frontReserve: FRONT_RESERVE_ENTRIES.flatMap((entry)=>entry.slots.map((slot,i)=>
    ({ id: `FrontReserve${entry.id}${i}`, role: "reserve", ...slot, entry: entry.id, stage: entry.slotStages[i] }))),
  machineGun: FRONT_MACHINE_GUN_ATTACK,
  bundleApproach: Sortie.enemies,
  // Escorts start with the tank in the plateau road cutting (hidden); FRONT_TANK_ESCORT_SLOTS are their block-point slots.
  tank: [{id:"TankEscortA",role:"escort",x:101,z:-208.5},{id:"TankEscortB",role:"escort",x:106.5,z:-210.5},
    {id:"TankEscortC",role:"escort",x:99,z:-212.5},{id:"TankEscortD",role:"escort",x:104,z:-215}],
  village: [
    { id: "VillageGunner", x: 43, z: 8, weapon: "Type11", hold: true },
    { id: "VillageCorner", x: 54, z: -12 },
    { id: "KitchenGuard", x: 58, z: -7 },
    { id: "RearWindow", x: 66, z: 16 },
    { id: "SideYard", x: 40, z: 27 },
  ],
  // 09：日军从与东巷相通的连屋出来，不再预埋伏击位（契约 §4）。玩家先手打掉就没有僵持。
  melee: [
    { id: "MeleeLead", x: 56.5, z: 13.5, weapon: "Type38", bayonet: true },
    { id: "MeleeSecond", x: 58, z: 14.4, weapon: "Type38", bayonet: true },
    { id: "MeleeThird", x: 54.5, z: 11, weapon: "Type38", bayonet: true },
    { id: "MeleeAlley", x: 66, z: 17, weapon: "Type38", bayonet: true },
  ],
  courtyard: [
    { id: "CourtyardPursuerA", x: 91, z: 24 },
    { id: "CourtyardPursuerB", x: 97, z: 21 },
    { id: "CourtyardPursuerC", x: 98, z: 29 },
  ],
  transfer: [
    { id: "TransferGunner", x: 113, z: 80, weapon: "Type11", hold: true },
    { id: "TransferRifleA", x: 111, z: 90 },
    { id: "TransferRifleB", x: 117, z: 97 },
    { id: "TransferRifleC", x: 119, z: 85 },
  ],
  // 12 的第二处威胁：装载区东南的侧巷（A.sideAlley 是巷子净空的中心，
  // 两道墙在 z 118/126）。机枪架在巷子深处朝西封住巷口，两个步枪手往巷口外压。
  transferAlley: [
    // 架在巷子中段而不是巷底：巷口净宽 7.3 m（z 118.35–125.65），从 x=107 望出去
    // 的射界在桥头路（x≈76）上摊成 z 109–135，正好罩住车列离开的那一段；
    // 再往东退（x≥106）射界就收得比路窄，机枪打不到出场的车。
    { id: "TransferAlleyGunner", x: A.sideAlley.x + 4, z: A.sideAlley.z, weapon: "Type11", hold: true },
    { id: "TransferAlleyA", x: A.sideAlley.x + 3, z: A.sideAlley.z - 1.5 },
    { id: "TransferAlleyB", x: A.sideAlley.x + 5, z: A.sideAlley.z + 1.8 },
  ],
  air: [
    { id: "AirPursuerA", x: 113, z: 89 },
    { id: "AirPursuerB", x: 108, z: 94 },
    { id: "AirPursuerC", x: 115, z: 100 },
    { id: "AirPursuerD", x: 106, z: 107 },
  ],
  // 18 北岸土坎的火力：来自北侧外围战场，不在桥边凭空生成。
  bridgeNorth: [
    { id: "BridgeNorthGunner", x: A.bridgeEnemy.x, z: A.bridgeEnemy.z, weapon: "Type11", hold: true },
    { id: "BridgeNorthA", x: A.bridgeEnemy.x - 6, z: A.bridgeEnemy.z + 3 },
    // 土坎（BridgeNorthRidgeEast，z≈132.2）在这一带是实心的：出生点要摆在坎**后面**
    // （北侧，z 更小），摆到 z+2 就是摆在土里。
    { id: "BridgeNorthB", x: A.bridgeEnemy.x + 7, z: A.bridgeEnemy.z - 3 },
    { id: "BridgeNorthC", x: A.bridgeEnemy.x + 2, z: A.bridgeEnemy.z - 5 },
  ],
});
// 12 只有两处威胁（契约 §2/§4）：先是压向装载区的 transfer，解除之后才是侧巷的 transferAlley。
// 每解除一处，接运真实推进一批。旧的四拍守波次（MISSION_TRANSFER_BEATS）已下线。
export const MISSION_TRANSFER_THREATS = Object.freeze([
  Object.freeze({ id: "transfer", after: null, resolved: "loadingThreatResolved", hint: "transferEast" }),
  Object.freeze({ id: "transferAlley", after: "loadingThreatResolved", resolved: "alleyThreatResolved", hint: "transferAlley" }),
]);
export const MISSION_PURSUIT_ROUTE=Object.freeze([
  {x:100,z:120.5},{x:74,z:120.5},{x:61,z:120.5},{x:60,z:114},...MISSION_ROUTES.evacuation,
]);
export const MISSION_GUIDANCE = Object.freeze({
  BunkerRescue:{label:'rescue'},
  RearTrench:{label:'rearTrench',route:'rearTrench'},
  Support:{label:'support',route:'support'},
  MachineGun:{label:'front'},Tank:{label:'bundle',route:'bundle'},
  Orders:{label:'orders',route:'collectionReturn'},
  South:{label:'south',route:'southWalk'},Village:{label:'village',route:'village'},
  Courtyard:{label:'gate',route:'courtyardBypass'},
  TransferApproach:{label:'transfer',route:'village'},Transfer:{label:'transfer'},
  CartRide:{label:'cart',route:'cartRide'},AirFirst:{label:'transfer'},
  Carry:{label:'carry'},Rescue:{label:'ditch'},
  Regroup:{label:'regroup'},WallPath:{label:'wallPath',route:'wallPath'},
  ReceptionGate:{label:'receptionGate'},Handover:{label:'place'},
  BridgeOrders:{label:'bridge',route:'toBridge'},BridgeCover:{label:'bridge'},
  BridgeWithdraw:{label:'withdraw',route:'bridgeWithdraw'},
  NightMarch:{label:'northGate',route:'nightMarch'},
});
// Front riflemen no longer use point tactics: they bound between FRONT_ASSAULT lines (runtime UpdateAssault).
const APPROACH_IDS = new Set(FRONT_APPROACH_ENEMIES.map((spec) => spec.id));
export const MISSION_TACTICS = Object.freeze({
  // APPROACH_TACTICS 里还带着旧开场那支 surface 突进队的条目（那一组随军列开场下线了），
  // 只取 approach 组真有的人 —— 不然战术表里会留下一批不属于任何组的孤儿。
  ...Object.fromEntries(Object.entries(APPROACH_TACTICS).filter(([id]) => APPROACH_IDS.has(id))),
  CourtyardPursuerA: { delay: 1, points: [{x:86,z:37},{x:62,z:40},{x:53,z:38}] },
  CourtyardPursuerB: { delay: 12, points: [{x:89,z:39},{x:66,z:43},{x:59,z:40}] },
  CourtyardPursuerC: { delay: 25, points: [{x:91,z:41},{x:70,z:44},{x:64,z:40}] },
  MeleeLead: { delay: 0, points: [{x:57,z:8},{x:58,z:3.5}] },
  MeleeSecond: { delay: 1.5, points: [{x:58.6,z:9},{x:59,z:4}] },
  MeleeThird: { delay: 3, points: [{x:55.5,z:7},{x:56,z:4}] },
  MeleeAlley: { delay: 5, points: [{x:62,z:17.5},{x:58,z:17},{x:58,z:13.5}] },
  TransferRifleA: { delay: 5, points: [{x:108,z:90},{x:102,z:91}] },
  TransferRifleB: { delay: 9, points: [{x:112,z:106},{x:104,z:112}] },
  TransferRifleC: { delay: 13, points: [{x:114,z:90},{x:107,z:94}] },
  // 出巷口（x≈96）往西压向车位与牛马车的出场道；让开四个车位的 3 x 5.8 m 车盒。
  TransferAlleyA: { delay: 0, points: [{x:99,z:121.5},{x:91,z:122.5}] },
  TransferAlleyB: { delay: 4, points: [{x:99,z:124},{x:90,z:131}] },
  AirPursuerA: { delay: 0, points: [{x:106,z:90},{x:102,z:92}] },
  AirPursuerB: { delay: 3, points: [{x:105,z:98},{x:104,z:111}] },
  AirPursuerC: { delay: 5, points: [{x:109,z:109},{x:100,z:114}] },
  AirPursuerD: { delay: 8, points: [{x:106,z:113},{x:99,z:115}] },
  BridgeNorthA: { delay: 2, points: [{x:-74,z:130},{x:-76,z:134}] },
  BridgeNorthB: { delay: 6, points: [{x:-72,z:126.5},{x:-74,z:130}] },
  BridgeNorthC: { delay: 10, points: [{x:-68,z:122},{x:-72,z:128}] },
});
export const FIRST_LEVEL_MISSION_PHASE = Object.freeze({
  id: "FirstLevelP012Whitebox",
  contentId: CHAPTER.id,
  sandbox: true,
  sandboxKey: "firstLevelP012Whitebox",
  chapter: true,
  artId: CHAPTER.id,
  date: "一九三八年三月",
  label: "第一关 · 往南的路",
  place: "滕县外围",
  sky: "testSceneDay",
  ambience: "smokyDay",
  music: null,
  minutes: 32,
  brief: [
    "炮火正向后延伸，日军先头兵紧跟而来。补弹，准备撤向后交通壕。",
    "WASD 移动 · Shift 冲刺 · C 蹲伏 · Z 卧倒 · F 交互 · V 大刀 · G 手榴弹 · H 集束手榴弹",
  ],
  metaText: ["第一关完整流程白盒", "Notion 2026.09.19", "人物动作简化"],
  level: CHAPTER,
  roster: ["luo", "yaowa", "heyoutian", "liuwencai"],
  playerCast: "shunzi",
  mechanics: { pinFinalZone: true },
  objectives: MISSION_STAGES.map((stage) => stage.objective),
  mechanic: "掩护伤员，完成当前任务。",
  hud: { objectiveMarkers: false, targetDistance: false },
  nraPool: 60,
  poolGain: 0,
  ijaPool: 60,
  ijaPressure: 0,
  ijaSpawn: CHAPTER.tuning.ijaSpawn,
  ijaSupport: [],
  ijaForce: CHAPTER.tuning.ijaForce,
  loadoutOverride: {
    primary: "HanYang",
    secondary: null,
    melee: "Dadao",
    throwables: { Grenade: 3, GrenadeBundle: 0 },
    spareClips: 12,
  },
  bounds: MISSION_LAYOUT.bounds,
  cameraFar: 650,
  zones: MISSION_STAGES.map((stage, index) => ({
    id: stage.id,
    name: stage.objective,
    ...stage.target,
    radius: 8,
    index,
  })),
  spawn: { ...A.bunker, ry: 0 },
  whitebox: {
    p012: true,
    fullMission: true,
    triggerAimBeforeRecoil: true,
    layout: MISSION_LAYOUT,
    anchors: A,
    routes: MISSION_ROUTES,
    friendlyLimit: 4,
    // Defenders and both finite front attacks must fit.
    actorCapacity:144,
    crowdCellM:MISSION_TUNING.frontCrowdCellM,
    // Real first-battle actors plus dormant village and NRA; casualties release capacity.
    actorPool: { ija: 48, nra: 40 },
    actualEventsOnly: true,
    storyBeats: [],
    // 军列那一项（trainColumn）随开场下线；arrivalGuideStart 仍被白盒场地读着。
    activities: { arrivalGuideStart: { x: -76, z: 71 } },
  },
});

export const FRONT_BATTLE_OBJECTIVES=Object.freeze({capture:"跟随班长，夺取右侧机枪阵位。",coverFirst:"掩护第一批守军撤入交通壕。",
    coverRest:"掩护后续守军，留意右前方道路。",rear:"跟随班长，退到阵位后墙。",
    supply:"沿后侧支沟取得集束弹。",return:"沿原支沟返回阵位后侧岔口。",attack:"跟随班长接近战车，解除撤口封锁。",
    retreat:"退回支沟遮挡，掩护剩余守军撤回。",disengage:"沿后交通壕撤离，随班长返回伤员集结处。"});
