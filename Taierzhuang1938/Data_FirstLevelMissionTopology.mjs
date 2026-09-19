// Notion: 空间、流程拓扑图 / 2026.09.19 采用稿（docs/Data_FirstLevelRebuild20260919Contract.md §3）。
// X east, Z south, metres. The sketch fixes adjacency and direction; the metres below are the
// whitebox calibration the space package owns. Key names are the cross-package contract.
export const MISSION_TOPOLOGY_VERSION = "first-level-20260919-four-zones-r1";
export const MISSION_REAR_ANCHORS = Object.freeze({
  ditchMouth: {x:53,z:114}, ditch: {x:39,z:116},
  // retreatA (=15A 收拢点) moved 6 m north of its old z=140: the North Sha He channel now
  // cuts z 138.8-167.2, and a rally point on the river bank is a rally point in a ditch wall.
  // retreatC (=15B 夹道的南出口) 跟着夹道走：15B 的「靠院墙小路」就是撤离线本身
  // 的最后一段，不是旁边另修一条（旁边修一条必然横穿撤离线）。
  retreatA: {x:32,z:134}, retreatB: {x:56,z:184}, retreatC: {x:16,z:222},
  reception: {x:-6,z:231}, zhouPickup: {x:-14,z:247}, zhouDrop: {x:-25,z:242},
  finalCover: {x:-35,z:247}, rearExit: {x:-44,z:244}, end: {x:-61,z:192},
});
const A=MISSION_REAR_ANCHORS;
export const MISSION_REAR_ROUTES = Object.freeze({
  // 尾段（index 6 起）就是 15B：沟在 (56,207) 到头，接上靠院墙的夹道 ——
  // 一段向西、一个左拐、一段向南。院墙/矮墙在 Data_FirstLevelMissionLayout。
  evacuation: [
    {x:54,z:114}, A.ditch, A.retreatA, {x:50,z:150}, {x:56,z:165},
    A.retreatB, {x:56,z:207}, {x:36,z:211}, {x:16,z:211}, A.retreatC,
    {x:9,z:233}, {x:9,z:240}, {x:-13,z:240},
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
  // 16 的门槛就在厢房南门（z=243）那一道。高度在 Data_FirstLevelMissionLayout 建，
  // 这里只登记它在哪扇门上 ——「脚……慢点」是过这道坎。
  wardThreshold: {x:-26,z:243},
});

// ---------------------------------------------------------------------------
// 北沙河（2026.09.19 契约 §3）
// ---------------------------------------------------------------------------
/**
 * 东西贯穿的河槽，替掉旧的那行「54<x<99 就把地面压到 -1.8」硬编码。
 * 断面：`floorHalfW` 半宽的平槽底，两侧各 `bankRun` 米爬回自然地面 ——
 * 河面总宽 2*(floorHalfW+bankRun) = 28.4 m，在契约要的 24–34 m 之间。
 *
 * smoothstep 的最大斜率是平均值的 1.5 倍：depth/bankRun = 4.2/3.2 的坡在中段到
 * 1.97（63°），越过 Rapier 角色的 52° 爬坡上限（Script_Physics 第 148 行），
 * 所以河槽处处不可随处横穿。
 *
 * `fords` 把断面在局部换成浅滩：同一条公式，按 x 距离在两套参数之间插值。
 * 西沟（WestEvacuation）就在 x≈51 过河 —— 1.05 m 深、坡 9°，人下得去上得来；
 * 牛马车根本没有走这里的路线（cartRide 全程在河北岸）。
 * 两座桥（路桥 x=76、铁路桥 x=-77）不改地形，桥面自己跨过去。
 */
export const MISSION_NORTH_RIVER = Object.freeze({
  id: "NorthShaHe",
  z: 153,
  depth: 4.2, floorHalfW: 11, bankRun: 3.2,
  fords: Object.freeze([
    // 浅滩中心放在 x=47 而不是过河点 x=51.2：evacuation 是斜着下河的
    //（(32,134)→(50,150)→(56,165)），下坡那一段人在 x 41–50，中心偏东就会让
    //  西侧的下坡踩在 4.2 m 的正坡上。
    Object.freeze({ id: "WestDitchFord", x: 47, halfW: 8, blend: 5,
      depth: 1.05, floorHalfW: 5, bankRun: 7 }),
  ]),
  // 允许横穿的位置（测试用）：浅滩与两座桥。半宽按各自的通行面给。
  crossings: Object.freeze([
    // 浅滩中心 x=47，halfW 13 = 断面插值带的全宽（x 34..60）：出了这一段断面就是
    // 整深 4.2 的正槽。
    Object.freeze({ id: "WestDitchFord", x: 47, halfW: 13 }),
    Object.freeze({ id: "TemporaryBridge", x: 76, halfW: 5 }),
    Object.freeze({ id: "RailBridge", x: -77, halfW: 4 }),
  ]),
});

/** 断面参数按 x 插值（浅滩把参数拉向自己那一套）。纯函数，地形与测试共用。 */
export function RiverProfileAt(x, river = MISSION_NORTH_RIVER) {
  let depth = river.depth, floorHalfW = river.floorHalfW, bankRun = river.bankRun;
  for (const ford of river.fords) {
    const raw = (Math.abs(x - ford.x) - ford.halfW) / ford.blend;
    const t = raw <= 0 ? 1 : raw >= 1 ? 0 : 1 - raw * raw * (3 - 2 * raw);
    if (t <= 0) continue;
    depth += (ford.depth - depth) * t;
    floorHalfW += (ford.floorHalfW - floorHalfW) * t;
    bankRun += (ford.bankRun - bankRun) * t;
  }
  return { depth, floorHalfW, bankRun };
}
/** 河槽在 (x,z) 的下切深度（相对自然地面）。槽外是 0。 */
export function RiverCutAt(x, z, river = MISSION_NORTH_RIVER) {
  const p = RiverProfileAt(x, river);
  const raw = (Math.abs(z - river.z) - p.floorHalfW) / p.bankRun;
  if (raw >= 1) return 0;
  const t = raw <= 0 ? 0 : raw * raw * (3 - 2 * raw);
  return p.depth * (1 - t);
}

// ---------------------------------------------------------------------------
// 桥
// ---------------------------------------------------------------------------
export const MISSION_SOUTH_BRIDGE = Object.freeze({
  // 路桥：河槽变宽之后甲板要真跨过去（旧的 8x7 只够跨那条排水沟）。
  deck: {x:76,z:153,w:8,d:32},
  deckY: 0.13, deckH: 0.25,
  pierRows: Object.freeze([72.8, 79.2]),
  pierZ: Object.freeze([142, 147, 159, 164]),
  // Visible collapsed abutment blocks the former road after the actual bomb hit.
  wreck: {id:"MissionBridgeWreck",x:76,z:153,w:8.8,h:4.4,d:6,y:.45,
    semantic:"earthDark",appearSignal:"MissionBridgeDestroyed",signal:"MissionBridgeRepaired"},
});

/**
 * 北沙河铁路桥（18）。桥台/桥面/桁架全是白盒体块；桥面进 walkableSurfaces。
 * 道砟与轨在 `gapZ` 之间断开（弧长由 Data_FirstLevelMissionLayout 换算），桥面上另摆
 * 两段直轨 —— 不断开的话轨顶跟着 crown 一路栽进河槽里（crown 被 clampHi 钉在
 * 本地地面 +0.18）。
 * 完好件用 `signal:"RailBridgeDestroyed"`（信号到了就消失，桥面同时退出可走面），
 * 残骸件用 `appearSignal:"RailBridgeDestroyed"`（信号到之前根本不存在）。
 */
export const MISSION_RAIL_BRIDGE = Object.freeze({
  x: -77, z: 153,
  deckHalfD: 18,            // 桥面 z 135..171，跨过 138.8..167.2 的河口
  deckW: 5.4, deckTopY: 0.66, deckH: 0.55,
  gapZ: Object.freeze([137, 169]),   // 道砟/枕木/钢轨在这一段断开
  trussOffsetX: 2.95, trussW: 0.5, trussH: 2.4,
  railGaugeHalf: 0.7175,
  abutmentZ: Object.freeze([140.5, 165.5]), abutmentW: 7, abutmentD: 3,
  signal: "RailBridgeDestroyed",
});

// ---------------------------------------------------------------------------
// 四区锚点与路线（名字冻结，坐标归空间包）
// ---------------------------------------------------------------------------
export const MISSION_STAGE_ANCHORS = Object.freeze({
  // A 前沿：被炸塌的掩蔽部（门朝北）、门外刺杀处、后壁破口、背坡土坎的缺口、伤员集结处
  // bunkerDoor 落在门外 1.5 m 而不是门框那一格：锚点要站得住人（「不被体块埋」）。
  bunker: {x:-40,z:-124}, bunkerDoor: {x:-40,z:-134.5},
  // 行刑处挪到门外约 3 m（2026-09-20 实拍：原来的 -142 离受困位 18 m，
  // 从破口看过去人只有几个像素，「看清」这条通过条件根本读不出来）。
  // 现在受困位 (-40,-124) 到这里 13.5 m，仍在契约 §3 的 8–12 m 视距带外缘。
  bunkerKilling: {x:-40,z:-137.5},
  bunkerRear: {x:-40,z:-119}, rearCorner: {x:-42,z:-113}, collection: {x:-37,z:-101},
  // B 村落：主街障碍北侧、担架等待遮挡、东巷、障碍南侧接回主街
  streetBlock: {x:76.65,z:15}, litterHold: {x:66,z:-20}, eastAlley: {x:88,z:11},
  streetRejoin: {x:77,z:34},
  // C 桥头接运：老周那辆车**旁边**的上车位（车位中心 (88,113) 让给车本身 ——
  //   牛车碰撞盒 3 m 宽，锚点摆在车位中心就等于摆在车肚子里）、空袭时车列停住的位置、侧巷火力
  // sideAlley 在装载区**东南**（2026.09.19 第二波挪回来的）：Notion 说第二处威胁
  //   是「村东突入部队沿既有东巷追出」，巷口朝西正对车位与牛马车的出场道。
  //   坐标是巷子净空的中心，两道墙在 z 118/126（Data_FirstLevelMissionLayout 的 SideAlley*）。
  cartBoard: {x:85.6,z:113}, cartHalt: {x:76,z:135}, sideAlley: {x:103,z:122},
  // D 桥南：靠院墙夹道两端、接收院院门
  wallPathStart: {x:56,z:207}, wallPathEnd: {x:16,z:220}, receptionGate: {x:2,z:240},
  // 18 北沙河铁路桥：桥心、两端、南岸射位、北岸土坎、爆破安全区、淡出前的行军终点
  railBridge: {x:-77,z:153}, bridgeNorthEnd: {x:-77,z:136}, bridgeSouthEnd: {x:-77,z:170},
  bridgeCover: {x:-81,z:179.4}, bridgeEnemy: {x:-68,z:130.5}, blastSafe: {x:-66,z:201},
  marchOut: {x:-62,z:232},
  // 关尾夜景（白天不可见）：淡入点、瓮城外、门洞、门内终点
  nightSpawn: {x:-160,z:292}, northGateApproach: {x:-160,z:318},
  northGate: {x:-160,z:340}, gateInside: {x:-160,z:352},
});
const S=MISSION_STAGE_ANCHORS;
export const MISSION_STAGE_ROUTES = Object.freeze({
  // 02：后壁破口 → 背坡土坎的缺口（折角）→ 途经伤员集结处 → 接回前沿交通壕
  // 接回 FrontCommunication 走 (-14,-104)→(-8,-112) 这一折：直接沿 x=-8 北上会
  // 压在 TrenchBoundFrontLeft 的护墙上（沟里那对错身掩体）。
  rearTrench: [S.bunkerRear,{x:-42,z:-116},S.rearCorner,{x:-40,z:-106},S.collection,
    {x:-26,z:-100},{x:-14,z:-104},{x:-8,z:-112},{x:6,z:-124}],
  // 05→06：炸停战车之后原路退回集结处
  collectionReturn: [{x:30,z:-117},{x:25,z:-110},{x:15,z:-111},{x:6,z:-124},
    {x:-8,z:-112},{x:-14,z:-104},{x:-26,z:-100},S.collection],
  // 07：沿沟南行，终点是村北口。2026.09.19 第二波把 188 m 收到 135 m ——
  // 契约要的是 45–75 秒，旧线按行军配速要两分多钟，多出来的全在两个大折返上：
  // 旧线先西折到 (-8,-78) 再折回 x=-24 直下 42 m，最后从 (0,0) 往**北**倒回
  // (24,-20) 才转东。新线保持「沿 FrontCommunication 的沟身南下、战斗声渐远」
  // 的走法（-16 那两段仍在沟里），把折返换成一条连续的东南斜线。
  // 135.4 m：2.2 m/s 行军 62 s、2.6 m/s 52 s，都落在 45–75 s 里（配速归 Front 包）。
  southWalk: [S.collection,{x:-26,z:-92},{x:-16,z:-76},{x:-16,z:-52},{x:-6,z:-32},
    {x:12,z:-24},{x:30,z:-23},{x:48,z:-20}],
  // 10：灶屋—连屋—内院—短巷，绕过主街障碍，在障碍南侧接回主街
  courtyardBypass: [{x:58,z:-9},{x:58,z:8},{x:58,z:18},{x:53,z:24},{x:53,z:34},
    {x:53,z:39},{x:66,z:39},{x:74,z:39},S.streetRejoin],
  // 12：牛车从车位沿桥头路北上，停在路桥以北
  cartRide: [S.cartBoard,{x:82,z:113},{x:79,z:118},{x:77,z:127},S.cartHalt],
  // 15B：靠院墙夹道（向西一段 → 左拐 → 向南一段），与撤离线同一条走廊
  wallPath: [S.wallPathStart,{x:36,z:211},{x:16,z:211},S.wallPathEnd,
    {x:12,z:230},{x:6,z:237},S.receptionGate],
  // 18：接收处 → 爆破安全区 → 南岸射位
  toBridge: [{x:-41,z:244},{x:-49,z:236},{x:-58,z:222},{x:-66,z:210},S.blastSafe,
    {x:-74,z:199},{x:-78,z:190},S.bridgeCover],
  // 回援尾队：北岸 → 桥面 → 南岸 → 继续南下
  bridgeCrossing: [{x:-77,z:120},S.bridgeNorthEnd,S.bridgeSouthEnd,{x:-76,z:182},
    {x:-72,z:192},S.marchOut],
  bridgeWithdraw: [S.bridgeCover,{x:-78,z:188},{x:-72,z:197},S.blastSafe],
  marchOut: [S.blastSafe,{x:-64,z:216},S.marchOut],
  nightMarch: [S.nightSpawn,S.northGateApproach,S.northGate,S.gateInside],
});

/**
 * 阶段 15（降压段）三个内部步骤各自的折线走廊。
 *
 * 这张表原来是撤退三连战的三个后卫口袋（`RetreatFirst` / `RetreatWall` /
 * `RetreatYard`）；2026.09.19 起 15 没有战斗了（契约 §2），留下来的作用只剩两个：
 * 15A 的带路路线，以及「回头警告」跟着实际折线走 —— 撤离线在 (56,207) 连着两个
 * 直角，按东西坐标找最近点会把人指向沟壁另一侧。
 *
 * `onEvacuation` 是这一段起点在撤离线上的那个顶点（15C 的夹道出口已经离开撤离线
 * 拐进接收院院门，所以它没有）。
 */
export const MISSION_REGROUP_CORRIDORS = Object.freeze([
  {id:"Regroup",route:MISSION_REAR_ROUTES.evacuation.slice(0,4),onEvacuation:A.retreatA},
  {id:"WallPath",route:MISSION_STAGE_ROUTES.wallPath,onEvacuation:S.wallPathStart},
  {id:"ReceptionGate",route:MISSION_STAGE_ROUTES.wallPath.slice(-3),onEvacuation:null},
]);
export const MissionRegroupCorridor=(id)=>MISSION_REGROUP_CORRIDORS.find(entry=>entry.id===id);
/**
 * **带路**用的那一段：走廊只到 `onEvacuation`（这一步的落脚点）为止。
 *
 * 走廊本身是给回头警告画「行动路线」用的，可以比这一步走得远；带路不行 ——
 * 把队伍带出落脚点，凑在一起才发生的事（15A 的点名要三个人都在 16 m 内）就永远不发生。
 * 没有 `onEvacuation` 的那一段（15C 拐进院门）整条都是带路线。
 */
export const RegroupGuideRoute=(id)=>{
  const corridor=MissionRegroupCorridor(id);
  if(!corridor?.onEvacuation)return corridor?.route;
  const index=corridor.route.findIndex(point=>point.x===corridor.onEvacuation.x&&point.z===corridor.onEvacuation.z);
  return index>=0?corridor.route.slice(0,index+1):corridor.route;
};
