// ===========================================================================
// Data_Tuning_FirstLevelEnd.mjs —— 第一关公开阶段 15–18 的数值与摆位（纯数据，零 three）
//
// 契约 docs/Data_FirstLevelRebuild20260919Contract.md §8 允许 End 包把自己这一段的
// 数值另立一张表，避免三个玩法包并行时挤在同一个 Data_Tuning_FirstLevel 里。
// `Data_Tuning_FirstLevel.mjs` 末尾 re-export 本表，入口仍是那一个。
//
// 规矩（同根表）：每个数字写清出处 —— 要么引既有表，要么写清是量出来的、
// 还是按哪一条 Notion 要求定的。玩家可见中文不进这里（那在 Data_Text_FirstLevel）。
//
// 坐标系：X 东、Z 南、米。yaw 是弧度，朝向 = (−sin yaw, −cos yaw)
//（与 MISSION_PLACEMENT 同一口径：yaw=π 朝 +Z 南）。
// ===========================================================================
import { MISSION_STAGE_ANCHORS as S, MISSION_STAGE_ROUTES as Stage, MISSION_RECEPTION_SPACE as Reception }
  from "./Data_FirstLevelMissionTopology.mjs";

const EAST = -Math.PI / 2;   // 朝 +X
const WEST = Math.PI / 2;    // 朝 −X
const NORTH = 0;             // 朝 −Z
const SOUTH = Math.PI;       // 朝 +Z

export const END_TUNING = Object.freeze({
  // -------------------------------------------------------------------------
  // 15A Regroup —— 沟口收拢（无战斗）
  // -------------------------------------------------------------------------
  // 警戒兵的射位：车路方向。撤离线在 (54,114) 拐进沟，追兵沿 MISSION_PURSUIT_ROUTE
  // 从 (74,120.5) 压过来 —— 三个人摆在沟口以东 4–12 m 的路肩上，正对来向。
  // 三点都在 Data_FirstLevelMissionLayout 的体块之外（净空探针实测，2026-09-20）。
  picketPosts: Object.freeze([
    Object.freeze({ x: 62, z: 110, yaw: EAST }),
    Object.freeze({ x: 64, z: 114, yaw: EAST }),
    Object.freeze({ x: 58, z: 107, yaw: EAST }),
  ]),
  // 赶车人与他丢下的那辆车：沟口北侧的路边（「前头全堵了。人先走，车别管了」）。
  droverPost: Object.freeze({ x: 50, z: 112.4, yaw: EAST }),
  droverCart: Object.freeze({ x: 52.6, z: 110.2, yaw: SOUTH }),
  // 「幸存者进入沟内遮挡」：离撤离线折线这么近就算在沟里（沟底宽下限 3.24 m，
  // 见 docs/Data_TrenchSpline.md；取一半再放 0.9 m 的排队余量）。
  ditchShelterM: 2.5,
  // 幺娃检查老周：他得真的走到担架边才起 ZhouCheck（担架半长 0.78 + 一臂）。
  zhouCheckReachM: 1.9,
  zhouCheckApproachMps: 1.8,
  // 何有田点人：被点到的三个人都要在这个半径里（沟里一小段，喊得到、看得见）。
  headcountReachM: 16,
  // 点名时说话的人转过去对着何有田（Line 事件驱动），转头速度。
  headcountTurnRadPerS: 3.2,
  // 顺子问赶车人：走到这么近才起 CartAbandon。
  cartAbandonReachM: 5,
  // 队首真的走起来了：领头担架沿撤离线走出一个担架间距（R.litterSpacingM 3.4）。
  columnMovingM: 3.4,

  // -------------------------------------------------------------------------
  // 15B WallPath —— 换手抬运，沿墙缓行
  // -------------------------------------------------------------------------
  // 后抬手脱力的位置：沿 MISSION_STAGE_ROUTES.wallPath 的里程。夹道全长 74.4 m
  //（(56,207)→…→(2,240)，Script_FirstLevelSpaceTest 量的），12 m 让玩家先走进夹道、
  // 听见近处枪火消失，再喊换人。
  carrySwapProgressM: 12,
  // 过坎：夹道里那一处 0.22 m 的坎（Data_FirstLevelMissionLayout 的 WallPathBump，
  // 体块中心 (24,211.25)，w 1.2 × d 2.8）。抬着担架走进这个半径就起 RoadBump。
  roadBump: Object.freeze({ x: 24, z: 211.25 }),
  roadBumpReachM: 2.4,
  // 幺娃看见顺子的手：过坎之后再走这么远（夹道左拐前后），起 HandsShake。
  handsShakeAfterBumpM: 6,
  // 无对白行走：夹道最后这一段不许起任何 cue（左拐之后到院门前）。
  // 74.4 m 的夹道按抬担架 1.4 m/s 走完约 53 s；46 m 之后还剩 28 m，
  // 够走满 14 s 的静默。
  silenceFromProgressM: 46,
  silenceSeconds: 14,
  // 掉队的步行伤员：位置读 MISSION_PLACEMENT.wallPath.stragglers，但那三点落在
  // 南侧矮墙（WallPathLowWall，z 212.65–213.35）上 —— 投影回夹道中线再用。
  stragglerWalkMps: 0.95,
  stragglerTendReachM: 1.7,
  tenderApproachMps: 2,
  stragglerLateralM: 0.85,

  // -------------------------------------------------------------------------
  // 15C ReceptionGate —— 桥南临时接收处
  // -------------------------------------------------------------------------
  // 院门守军：MISSION_PLACEMENT.receptionYard.gateGuard 两点在门洞两侧。
  // 盘问时其中一个横到门洞中线上拦住（门洞净宽 4 m，东墙在 x=2）。
  gateBlock: Object.freeze({ x: 2.7, z: 240, yaw: EAST }),
  gateChallengeReachM: 9,
  // 拦住的时候担架队压在院门以东这么远排队（不许直接涌进门）。
  gateQueuePadM: 6,
  gateGuardMps: 1.7,
  // 接收人员从院里出来迎（MISSION_PLACEMENT.receptionYard.receiver 是他的常位）。
  receiverMeet: Object.freeze({ x: -1.4, z: 240, yaw: EAST }),
  receiverMps: 1.8,
  receiverReachM: 7,
  // 「伤员开始实际入院」：全部幸存担架都上了入院路线，且至少这么多副真的进了院子。
  // 2 副 = 老周之外先进去的那两副（R.litterCount 7 里的头两副）。
  woundedEnteringLitters: 2,

  // -------------------------------------------------------------------------
  // 16 Handover —— 完成交接
  // -------------------------------------------------------------------------
  // 军医：常位是 MISSION_PLACEMENT.receptionYard.surgeon (−27.4,241.2)，在厢房里。
  // 放置点是**锚点** A.zhouDrop (−25,242)（不是 receptionYard.zhouPlaced，那一点是
  // 空间包给布景用的）。「这副放这里」时他站到放置点西北角指位置，
  // 放下之后挪到担架西侧 1.65 m 处看伤 —— 这个距离必须 ≤ surgeonReachM。
  surgeonPoint: Object.freeze({ x: -27.1, z: 240.6, yaw: EAST }),
  surgeonExamine: Object.freeze({ x: -26.6, z: 241.6, yaw: EAST }),
  surgeonMps: 1.7,
  // 「走到担架边了没有」的判据。军医站位离放置点 1.65 m，走位的到达余量 0.5 m，
  // 所以判据要盖住 1.65+0.5 —— 取 2.4（一臂 + 半步）。
  surgeonReachM: 2.4,
  // 过门槛担架歪一下：WardThreshold 在 (−26,243)，0.15 m 高。
  thresholdTiltRad: 0.14,
  thresholdTiltS: 1.2,
  // 「这副放这里」要在玩家抬着担架走到放置点附近才喊（喊完才允许按 F 放下）。
  placeOrderReachM: 5,
  // 分派：三个人真的按吩咐动。文财出院门问路、何有田跟罗班长到门外看外头、幺娃留下。
  squadAssign: Object.freeze({
    liuwencai: Object.freeze([{ x: -26, z: 246.6 }, { x: -14, z: 248 }, { x: -12.6, z: 243.4 }]),
    heyoutian: Object.freeze([{ x: -26, z: 246.2 }, { x: -18, z: 247.6 }]),
    luo: Object.freeze([{ x: -25, z: 246.8 }, { x: -17, z: 248.4 }]),
  }),
  squadAssignMps: 1.9,

  // -------------------------------------------------------------------------
  // 17 Death —— 确认老周死亡
  // -------------------------------------------------------------------------
  // 老周死后门外又抬进来一副担架（MISSION_PLACEMENT.receptionYard.nextLitterEntry）。
  nextLitterRoute: Object.freeze([
    Object.freeze({ x: -13, z: 243.4 }), Object.freeze({ x: -20, z: 246.4 }),
    Object.freeze({ x: -26, z: 246 }), Object.freeze({ x: -26.4, z: 241.8 }),
    Object.freeze({ x: -28.4, z: 237.6 }),
  ]),
  nextLitterMps: 1.25,
  // 军医转去救下一人：新担架走到这个半径他就过去。
  nextLitterReachM: 2.6,
  // 幺娃把覆盖物拉正：蹲在老周身边这么久（纯演出，不是闸）。
  coverStraightenS: 2.6,
  // 何有田经过门边看一眼又转向外面。
  heDoorLook: Object.freeze([{ x: -26, z: 244.6 }, { x: -26, z: 246.8 }, { x: -21, z: 247.4 }]),

  // -------------------------------------------------------------------------
  // 18 BridgeOrders / BridgeCover / BridgeWithdraw
  // -------------------------------------------------------------------------
  // 传令兵真人跑进接收处：从院门外一路跑到厢房门口。
  runnerSpawn: Object.freeze({ x: 10, z: 236.4, yaw: WEST }),
  runnerRoute: Object.freeze([
    Object.freeze({ x: 6, z: 238 }), Object.freeze({ x: -2, z: 240 }),
    Object.freeze({ x: -13, z: 240 }), Object.freeze({ x: -13, z: 247.4 }),
    Object.freeze({ x: -24, z: 247.4 }), Object.freeze({ x: -25.4, z: 244.6 }),
  ]),
  runnerMps: 4.2,
  runnerArriveM: 2.6,
  // 回援尾队：六个人（R.bridgeColumnCount）沿 MISSION_STAGE_ROUTES.bridgeCrossing
  // 过桥。速度 R.bridgeColumnSpeedMps 1.9、间距 R.bridgeColumnSpacingM 3.4。
  // 火力压制时压在北引道上：bridgeCrossing 起点 (−77,120) 到北桥头 (−77,136) 共 16 m，
  // 停在离桥头 3 m 的地方（不冲上桥面，也不缩回图外）。
  rearColumnHoldM: 13,
  // 压制下伏倒的姿态保持时间（AI SetStance 的 hold；反复刷新）。
  rearColumnProneHoldS: 1.5,
  // 尾队带的东西：0 号扛机枪、1/2 号两人抬迫击炮部件，其余步枪。白盒小件。
  rearColumnLoads: Object.freeze(["mg", "mortar", "mortar", "rifle", "rifle", "rifle"]),
  // 尾队真的过完桥：离 bridgeCrossing 末点这么近就算下了桥往南走了。
  rearColumnClearM: 2,
  // 桥头军官与爆破人员（MISSION_PLACEMENT.bridge.officer / .demolition）。
  // demolition[1] (−74.2,171.4) 落在 RailBridgeDeck 上 —— 那正是南桥台，站得住。
  demolitionSetS: 6,
  // 撤出折线都要从 BridgeSouthCoverWest(x −87..−78) 与 BridgeSouthCoverEast(x −69..−60)
  // 之间那个 9 m 宽的口子走。西边那位原来的第一个点 (−80,178) **埋在西侧那道 1.47 m 的
  // 掩体墙里**：他顶着墙走不到，停在离桥心 24 m 的爆破区里，桥只能靠
  // blastFriendlyStuck 兜底晚二十秒才炸（实拍 2026-09-20）。改成先往东挪到口子上。
  // 折线净空由 Script_FirstLevelSpaceTest 守着。
  demolitionPullback: Object.freeze([
    Object.freeze([{ x: -76, z: 176 }, { x: -74, z: 190 }, { x: -70.5, z: 200 }]),
    Object.freeze([{ x: -73, z: 178.5 }, { x: -71.5, z: 190 }, { x: -72.5, z: 200 }]),
  ]),
  officerPullback: Object.freeze([{ x: -71.5, z: 182 }, { x: -71, z: 194 }, { x: -74.5, z: 200 }]),
  demolitionMps: 3.4,
  // 爆破安全：炸之前这个半径里不许有任何己方（玩家、班里人、军官、爆破手、尾队）。
  // R.bridgeBlastRadiusM 是特效半径 12 m；安全判据取 30 m（blastSafe 离桥心 48 m）。
  blastClearRadiusM: 30,
  // 卡住的 NPC 不许把整关钉死：他连着这么久一步没挪、而且玩家早已退到安全区，
  // 就记一条 blastFriendlyStuck 取证并放行。**玩家在区里永远等**，这一条只对 NPC。
  blastStuckS: 20,

  // -------------------------------------------------------------------------
  // 18 NightMarch —— 夜入滕城北门
  // -------------------------------------------------------------------------
  // 爆破之后先随队走一段（MISSION_STAGE_ROUTES.marchOut，blastSafe→marchOut 约 35 m），
  // 走到头画面才淡出。行军脚步在这一段一直响。
  marchOutArriveM: 8,
  // 夜景火盆/马灯的点光。night 预设曝光低，没有点光的白盒糊成一团
  //（Data_CutsceneBeimenBreakout 文件头）。火盆体块在 MISSION_PLACEMENT.night.braziers，
  // 0.8 × 0.7 × 0.8、盆口约在地面 +0.7。**不投影**：一帧只烘一张阴影。
  brazierLight: Object.freeze({ color: 0xff9a4c, intensity: 26, distanceM: 22, decay: 1, riseM: 0.9, flickerHz: 5.3, flicker: 0.28 }),
  // 门洞里那一盏：进门前后能读出门洞的深度。
  gateLight: Object.freeze({ x: -160, z: 337.5, riseM: 3.2, color: 0xffc07a, intensity: 46, distanceM: 30, decay: 1 }),
  // 夜里队列往北门走的速度与间距。
  nightColumnMps: 1.35,
  nightColumnSpacingM: 4.2,
  // 带路军人在门外喊话的触发半径。
  northGateCueM: 20,
  // 搬弹药的人来回走的一小段（MISSION_PLACEMENT.night.carriers 是他们的取货位）。
  nightCarrierLegM: 5,
  nightCarrierMps: 1.1,
});

/** 15–18 用到的现成路线（避免各模块各写一份切片）。 */
export const END_ROUTES = Object.freeze({
  wallPath: Stage.wallPath,
  toBridge: Stage.toBridge,
  bridgeCrossing: Stage.bridgeCrossing,
  bridgeWithdraw: Stage.bridgeWithdraw,
  marchOut: Stage.marchOut,
  nightMarch: Stage.nightMarch,
  wardEntry: Reception.wardEntry,
  railBridge: Object.freeze({ x: S.railBridge.x, z: S.railBridge.z }),
});

export { NORTH as END_FACE_NORTH, SOUTH as END_FACE_SOUTH, EAST as END_FACE_EAST, WEST as END_FACE_WEST };
