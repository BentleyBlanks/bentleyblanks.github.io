// Notion: 空间、流程拓扑图 / 2026.09.14. X east, Z south, metres.
// The sketch fixes adjacency and direction, not a surveyed metric scale.
export const MISSION_TOPOLOGY_VERSION = "first-level-20260914-front-sortie-r3";
export const MISSION_REAR_ANCHORS = Object.freeze({
  ditchMouth: {x:53,z:114}, ditch: {x:39,z:116},
  retreatA: {x:32,z:140}, retreatB: {x:56,z:184}, retreatC: {x:9,z:220},
  reception: {x:-6,z:231}, zhouPickup: {x:-14,z:247}, zhouDrop: {x:-25,z:242},
  finalCover: {x:-35,z:247}, rearExit: {x:-44,z:244}, end: {x:-61,z:192},
});
const A=MISSION_REAR_ANCHORS;
export const MISSION_REAR_ROUTES = Object.freeze({
  evacuation: [
    {x:54,z:114}, A.ditch, A.retreatA, {x:50,z:150}, {x:56,z:165},
    A.retreatB, {x:56,z:207}, {x:26,z:215}, A.retreatC, {x:9,z:240}, {x:-13,z:240},
  ],
  reception: [{x:-13,z:240},{x:-13,z:249},{x:-26,z:249},{x:-26,z:241}],
  exit: [
    {x:-26,z:241},{x:-26,z:247},A.finalCover,{x:-38,z:244},A.rearExit,
    {x:-49,z:229},{x:-62,z:220},{x:-62,z:212},A.end,
  ],
});
export const MISSION_RECEPTION_SPACE = Object.freeze({
  bounds: {minX:-41,maxX:1,minZ:218,maxZ:252},
  ward: {minX:-32,maxX:-20,minZ:225,maxZ:243},
  litterOrigin: {x:-30,z:229}, walkerOrigin: {x:-37,z:244.2},
  entry: {x:-13,z:240}, wardEntry: {x:-26,z:240},
  wardExit: {x:-26,z:247}, yardJunction: {x:-13,z:249},
  deathView: {x:-26,z:243.6},
});
export const MISSION_REARGUARD_POCKETS = Object.freeze([
  {id:"RetreatFirst",anchor:A.retreatA,route:MISSION_REAR_ROUTES.evacuation.slice(0,4)},
  {id:"RetreatWall",anchor:A.retreatB,route:MISSION_REAR_ROUTES.evacuation.slice(3,7)},
  {id:"RetreatYard",anchor:A.retreatC,route:MISSION_REAR_ROUTES.evacuation.slice(6)},
]);
// Notion 2026.09.19（docs/Data_FirstLevelRebuild20260919Contract.md §3）：新四区拓扑新增的锚点与路线。
// 名字是各实现包之间的契约，不许改；坐标归空间包校准。北沙河沿 z≈153 东西贯穿，
// 路桥在 x=76（桥头接运点），铁路桥在 x=-77（18 接应回援尾队）。
export const MISSION_STAGE_ANCHORS = Object.freeze({
  // A 前沿：被炸塌的掩蔽部（门朝北）、门外刺杀处、后壁破口、后交通壕折角、背坡伤员集结处
  bunker: {x:-35,z:-126}, bunkerDoor: {x:-35,z:-133}, bunkerKilling: {x:-35,z:-141},
  bunkerRear: {x:-35,z:-120}, rearCorner: {x:-27,z:-110}, collection: {x:-36,z:-104},
  // B 村落：主街障碍（倒墙＋横车）、担架等待遮挡、东巷窗口、障碍南侧接回主街
  streetBlock: {x:64,z:9}, litterHold: {x:50,z:-24}, eastAlley: {x:82,z:6}, streetRejoin: {x:70,z:44},
  // C 桥头接运：老周那辆车的车位、空袭时车列停住的位置、侧巷火力
  cartBoard: {x:86,z:123}, cartHalt: {x:76,z:142}, sideAlley: {x:103,z:124},
  // D 桥南：靠院墙小路两端、接收院院门
  wallPathStart: {x:56,z:207}, wallPathEnd: {x:12,z:216}, receptionGate: {x:2,z:240},
  // 18 北沙河铁路桥：桥心、两端、南岸射位、北岸土坎、爆破安全区、淡出前的行军终点
  railBridge: {x:-77,z:153}, bridgeNorthEnd: {x:-77,z:136}, bridgeSouthEnd: {x:-77,z:170},
  bridgeCover: {x:-70,z:176}, bridgeEnemy: {x:-66,z:124}, blastSafe: {x:-66,z:200}, marchOut: {x:-62,z:232},
  // 关尾夜景（白天不可见）：淡入点、北门外、门洞、门内终点
  nightSpawn: {x:-160,z:292}, northGateApproach: {x:-160,z:318}, northGate: {x:-160,z:340}, gateInside: {x:-160,z:352},
});
const S=MISSION_STAGE_ANCHORS;
export const MISSION_STAGE_ROUTES = Object.freeze({
  rearTrench: [S.bunkerRear,{x:-35,z:-114},S.rearCorner,{x:-27,z:-104},{x:-8,z:-104},{x:-8,z:-112},{x:6,z:-124}],
  collectionReturn: [{x:6,z:-124},{x:-8,z:-112},{x:-8,z:-104},{x:-27,z:-104},S.collection],
  southWalk: [S.collection,{x:-24,z:-92},{x:-8,z:-78},{x:-24,z:-60},{x:-24,z:-18},{x:0,z:0},{x:24,z:-20},{x:48,z:-20}],
  courtyardBypass: [{x:58,z:-9},{x:58,z:8},{x:58,z:18},{x:53,z:24},{x:53,z:34},{x:62,z:40},S.streetRejoin],
  cartRide: [S.cartBoard,{x:80,z:132},{x:76,z:136},S.cartHalt],
  wallPath: [S.wallPathStart,{x:26,z:215},S.wallPathEnd,{x:9,z:240},S.receptionGate],
  toBridge: [{x:-44,z:244},{x:-49,z:229},{x:-62,z:212},S.blastSafe,S.bridgeCover],
  bridgeCrossing: [{x:-77,z:118},S.bridgeNorthEnd,S.bridgeSouthEnd,{x:-72,z:190},S.marchOut],
  bridgeWithdraw: [S.bridgeCover,{x:-68,z:188},S.blastSafe],
  marchOut: [S.blastSafe,{x:-64,z:216},S.marchOut],
  nightMarch: [S.nightSpawn,S.northGateApproach,S.northGate,S.gateInside],
});
export const MISSION_SOUTH_BRIDGE = Object.freeze({
  deck: {x:76,z:153,w:8,d:7},
  // Visible collapsed abutment blocks the former road after the actual bomb hit.
  wreck: {id:"MissionBridgeWreck",x:76,z:153,w:8.8,h:4.4,d:2.8,y:.45,
    semantic:"earthDark",appearSignal:"MissionBridgeDestroyed",signal:"MissionBridgeRepaired"},
});
