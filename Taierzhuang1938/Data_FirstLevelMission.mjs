import { FRONT_SORTIE as Sortie } from "./Data_FirstLevelFrontRoute.mjs";
import { MISSION_TOPOLOGY_VERSION, MISSION_STAGE_ROUTES } from "./Data_FirstLevelMissionTopology.mjs";
import { FRONT_FIELD_MEN, FRONT_RESERVES, FRONT_MACHINE_GUN_ATTACK, FRONT_APPROACH_ENEMIES, APPROACH_TACTICS } from "./Data_FirstLevelMissionFront.mjs";
import { CHAPTER } from "./Data_MissionCh1.mjs";
import { MISSION_LAYOUT, MISSION_ANCHORS as A, MISSION_ROUTES } from "./Data_FirstLevelMissionLayout.mjs";
export const MISSION_VERSION = MISSION_TOPOLOGY_VERSION;
import { MISSION_TUNING } from "./Data_Tuning_FirstLevel.mjs";
export { MISSION_TUNING } from "./Data_Tuning_FirstLevel.mjs";
// Both air passes. Ki-30 (Army Type 97 light bomber) entered combat in China in spring 1938; the Ki-43 flew
// only in 1939 and has no texture. The documented aircraft near Tengxian were Type 88 reconnaissance biplanes,
// for which there is no model yet. See docs/Data_AircraftAssets.md.
export const MISSION_AIRCRAFT_ID = "MitsubishiKi30";
// 2026.09.19 契约路线还没并进 MISSION_ROUTES（等空间包建完沿线几何再并），
// 但骨架现在就要用它们带路。查表统一走这一张，运行时只认名字。
export const MISSION_GUIDE_ROUTES = Object.freeze({ ...MISSION_ROUTES, ...MISSION_STAGE_ROUTES });
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
    "沿交通壕支援前沿守军，掩护他们撤回。",
    A.front,
    ["frontReached", "frontContact", "frontRifleDefense", "rifleWithdrawalResolved"],
    null,
  ),
  Stage(
    "MachineGun",
    "接替老周的火力，击退前方日军。",
    A.gun,
    ["zhouGunWounded", "frontAttackRepelled", "guardWithdrawalResolved", "tankBlocksExit", "bundleOrderHeard"],
    "TakeOverGun",
  ),
  Stage(
    "Tank",
    "跟班长穿过侧沟领集束弹，炸断战车履带。",
    A.bundle,
    ["bundleRouteTraversed", "bundleTaken", "tankImmobilized", "lastGuardsWithdrawn", "reliefInPosition"],
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
  bunkerAssault: [
    { id: "BunkerExecutionerA", x: A.bunkerKilling.x - 1.6, z: A.bunkerKilling.z - 1.2, weapon: "Type38", bayonet: true },
    { id: "BunkerExecutionerB", x: A.bunkerKilling.x + 1.6, z: A.bunkerKilling.z - 1.2, weapon: "Type38", bayonet: true },
    { id: "BunkerFollowA", x: A.bunkerKilling.x - 3.2, z: A.bunkerKilling.z - 6, weapon: "Type38", bayonet: true },
    { id: "BunkerFollowB", x: A.bunkerKilling.x + 3.4, z: A.bunkerKilling.z - 7, weapon: "Type38", bayonet: true },
  ],
  approach: FRONT_APPROACH_ENEMIES,
  // The roster itself lives in Data_FirstLevelMissionFront: the assault lanes and the cover rows
  // are derived from it, and a list split across two files drifts.
  front: [...FRONT_FIELD_MEN,...FRONT_RESERVES],
  machineGun: FRONT_MACHINE_GUN_ATTACK,
  bundleApproach: Sortie.enemies,
  tank: [
    { id: "TankEscortA", x: 24, z: -145 },
    { id: "TankEscortB", x: 28, z: -152 },
    { id: "FlankA", x: 58, z: -139 },
    { id: "FlankB", x: 63, z: -144 },
  ],
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
  // 12 的第二处威胁：侧巷（A.sideAlley）。
  transferAlley: [
    { id: "TransferAlleyGunner", x: A.sideAlley.x + 2, z: A.sideAlley.z + 2, weapon: "Type11", hold: true },
    { id: "TransferAlleyA", x: A.sideAlley.x + 5, z: A.sideAlley.z - 4 },
    { id: "TransferAlleyB", x: A.sideAlley.x + 8, z: A.sideAlley.z + 6 },
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
    { id: "BridgeNorthB", x: A.bridgeEnemy.x + 7, z: A.bridgeEnemy.z + 2 },
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
  TransferAlleyA: { delay: 0, points: [{x:100,z:120},{x:94,z:118}] },
  TransferAlleyB: { delay: 4, points: [{x:104,z:130},{x:96,z:128}] },
  AirPursuerA: { delay: 0, points: [{x:106,z:90},{x:102,z:92}] },
  AirPursuerB: { delay: 3, points: [{x:105,z:98},{x:104,z:111}] },
  AirPursuerC: { delay: 5, points: [{x:109,z:109},{x:100,z:114}] },
  AirPursuerD: { delay: 8, points: [{x:106,z:113},{x:99,z:115}] },
  BridgeNorthA: { delay: 2, points: [{x:-74,z:130},{x:-76,z:134}] },
  BridgeNorthB: { delay: 6, points: [{x:-70,z:128},{x:-74,z:132}] },
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
    "掩蔽部被一发近失弹埋了。跟班长出去，支援前沿，再为伤员打开往南的路。",
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
    activities: {},
  },
});
