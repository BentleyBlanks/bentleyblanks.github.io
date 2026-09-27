// ===========================================================================
// Data_Tuning_FirstLevelMid.mjs —— 第一关公开阶段 8–14 的数值（2026.09.19 第二波 Mid 包）
//
// 分出单独一张表的理由见契约 §8：Front / Mid / End 三个包并行改同一关，数值挤在
// Data_Tuning_FirstLevel 里必冲突。入口 `Data_Tuning_FirstLevel.mjs` 再导出一次。
//
// 每一条都写出处：要么引既有表（R.*），要么写清它是从哪条几何量出来的。
// 玩家可见中文不进这里（文本表/台词表才是）。
// ===========================================================================
import { MISSION_TUNING as R } from "./Data_Tuning_FirstLevel.mjs";

export const MID_TUNING = Object.freeze({
  // -------------------------------------------------------------------------
  // 08 主街受阻
  // -------------------------------------------------------------------------
  // 担架停进遮挡：停车位以空间包的 MISSION_PLACEMENT.streetBlock.litterWait 三个点打底，
  // 多于三副时按行往北排（LitterHoldCover 在 z=-16.5，往北 (z 更小) 是空地）。
  // 行距比 litterSpacingM(3.4) 收一点：这是停着不是行进。
  litterHoldRowM: 2.6,
  litterHoldLateralM: 2.9,
  // 走到停车位这么近就算停好（担架队通行宽 1.25 m，半个身位）。
  litterHoldArrivalM: 0.62,
  // 判「真的在遮挡里」的射线高度：射手取站姿眼位、担架取躺着的高度。
  // 与 Threatens 的 eye 表同一套（站 1.35 / 跪 0.9 / 卧 0.35）。
  holdSightFromM: 1.35,
  holdSightToM: 0.9,
  // 罗班长查看相邻房屋：走到灶屋北门内侧这么近就算查看过。
  // 灶屋北墙 z=-16.5、门在 x≈58；落点用 MISSION_PLACEMENT.ambushSquadPosts[2]。
  houseCheckArrivalM: 1.5,
  // 进门前先到北门外正对门洞的这个点（门洞 x 56.1–59.9）。直接朝门内侧的掩护位走，
  // 从西边来的直线会斜穿灶屋西北角，人顶在西墙外 x≈51.3 来回蹭，进不了门。
  houseCheckDoorApproach: { x: 58, z: -18.6 },
  // 何有田「外头我看着」：退到主街这一侧的观察位。
  outsideWatchArrivalM: 1.8,

  // -------------------------------------------------------------------------
  // 09 灶屋—连屋近战
  // -------------------------------------------------------------------------
  // 醒了之后先站住这么久再压过来：一进屋四个人同时扑上来读不出「从连屋进来」。
  meleeBreachHoldS: 0.4,
  // 顺子的「滚你妈的」：真贴上白刃才喊。距离与 UpdateMelee 记 meleeEngaged 同一把尺
  //（R.ambushBindReachM 1.15 + 0.4 的半个身位）。
  meleeCurseReachM: R.ambushBindReachM + 0.4,
  // 「窗口火力仍封锁院口」的判定：窗口射手到院门的射线打不打得通。
  windowCoverTargetM: 1.1,

  // -------------------------------------------------------------------------
  // 10 打开内院，放行担架
  // -------------------------------------------------------------------------
  // 担架从 08 等待点回到后送线的接口 = courtyardBypass 的第一个点（灶屋北门外）。
  // 写坐标不写下标：改线不至于悄悄错位（找不到就退回路线头）。
  courtyardRejoinPoint: Object.freeze({ x: 58, z: -9 }),
  // 队尾掩护脱离：队尾那个人走过院门以南这么远算脱离。
  rearCoverClearM: 4.5,

  // -------------------------------------------------------------------------
  // 11 抵达桥头接运点
  // -------------------------------------------------------------------------
  // 四类人流里的「能走的伤员」：后送队本身 walkingWoundedCount=0（2026-09-16 用户砍的是
  // 随队护送编制），接运点现场这一批是本来就在那儿的人，归 11 自己摆。
  // 六个人三对，互相搀扶，站在装载区北缘等「走得动的跟前头」。
  walkingWoundedCount: 6,
  walkingWoundedPairM: 0.78,
  walkingWoundedOrigin: Object.freeze({ x: 62, z: 100 }),
  walkingWoundedSpacingM: 2.6,
  walkingWoundedMps: 1.1,
  // 分流之后他们往桥头走的落点（让开车位与担架道，走西半边）。
  walkingWoundedExit: Object.freeze({ x: 68, z: 132 }),
  walkingWoundedArrivalM: 1.2,
  // 牛车 / 马车：四个车位（MISSION_PLACEMENT.cartBays）与三辆过路车按下标分。
  // 差别只是白盒外形 —— 牛更矮更宽、带角；马更高更窄。
  oxBayIndices: Object.freeze([0, 2]),
  oxTrafficIndices: Object.freeze([1]),
  draft: Object.freeze({
    // 牲口根点（躯干中心）挂在车心前方多少米。Blender 模型按这个距离贴着车辕建
    //（_blender/Script_OxCartBake.py 的 TEAM_OFFSET_M，GLB 根节点 extras 里也带一份），
    // 两边对不上时 Script_DraftCartModel 加载即报错 —— 改这里必须重烘模型。
    teamOffsetM: 3.3,
    // 现有 muleBody 0.62 x 0.72 x 1.5、muleHead 0.25 x 0.56 x 0.44（Script_FirstLevelMissionView）。
    ox: Object.freeze({ bodyScale: Object.freeze([1.36, 0.86, 1.04]), headScale: Object.freeze([1.25, 0.8, 1.12]), headDrop: 0.22, horn: true }),
    horse: Object.freeze({ bodyScale: Object.freeze([0.84, 1.18, 1.06]), headScale: Object.freeze([0.86, 1.06, 1.0]), headDrop: -0.07, horn: false }),
  }),
  // 牛角：一对小盒，挂在头两侧前上方。**实例桶满了是静默截断**，容量按 7 车 x 2 只给。
  horn: Object.freeze({ lateralM: 0.19, riseM: 0.3, forwardM: 0.18, size: Object.freeze([0.07, 0.07, 0.34]), tiltRad: 0.5 }),
  hornCapacity: 16,
  // 辨认三样东西的朝向门（契约要求「用朝向/到位门，不要纯计时」）。
  // ±0.95 rad ≈ ±54°：横向视野的一半多一点，转过去就算看见了。
  identifyConeRad: 0.95,
  // 站在接运区这一带才算「在现场辨认」。A.transfer 就是那个墙角射位。
  identifyRangeM: 24,
  // 村路来路：担架队自己走下来的那一段（MISSION_ROUTES.village 的 (76,85)）。
  villageRoadMouth: Object.freeze({ x: 76, z: 85 }),
  // 桥头方向：路桥甲板中心（MISSION_SOUTH_BRIDGE.deck）。
  bridgeHeadPoint: Object.freeze({ x: 76, z: 153 }),
  // 走到车位那一排以南等于已经看见桥头路，不必再对准。
  bridgeHeadSouthZ: 122,
  // 分流算数：至少这么多副担架进了装载区的集结口袋，才算「躺着的先上车」真的开始。
  sortedLitterCount: 2,

  // -------------------------------------------------------------------------
  // 12 掩护装载与离开
  // -------------------------------------------------------------------------
  // 班里人的射位：低墙 / 墙角一线朝村路，不站在伤员中间。
  // TransferCorner (95,96,8x0.7) 与 TransferEastCover (98,104,0.75x11) 夹出来的那个角。
  defencePosts: Object.freeze([
    Object.freeze({ cast: "luo", x: 91.5, z: 99.4 }),
    Object.freeze({ cast: "heyoutian", x: 96.2, z: 107 }),
    Object.freeze({ cast: "liuwencai", x: 84, z: 106 }),
    Object.freeze({ cast: "yaowa", x: 79, z: 110 }),
  ]),
  defencePostArrivalM: 1.6,
  // 威胁还在时装载额度是 0：装载与出发被压住，不是「慢一点」。
  // 每解除一处放开 R.transferBatchLoads(2 = cartCapacity 2 x 2 车) 个名额。
  loadAllowancePerThreat: R.transferBatchLoads,
  // 何有田真的走过来接住射位才放顺子走（EscortZhou）。
  escortReliefM: 2.4,
  // 车刚动起来才说话（CartTalk）：离上车位这么远算动起来了。
  cartTalkAfterM: 1.6,
  // 坐在车板上的眼位：车板面（CartInstance 的 cart 体在 ground+1，板厚 0.38）加坐姿。
  cartSeatRiseM: 1.24,
  // 牛马车压过尸体（Script_CartCorpseBump）：车轮滚上尸体顶面 → 软弹簧 → 车身起伏、
  // 俯仰、侧倾；车上的担架、伤员、坐车的顺子眼位一起走。用户 2026-09-27：
  // 「碰到了尸体应该是会有碰撞/软软的上下起伏」。
  cartCorpseBump: Object.freeze({
    // 车轮几何量自 Model_WoodenEvacCart.glb：WheelLeft/Right 枢轴 x=±1.32、y=0.72
    //（= 轮半径，枢轴在车地面原点之上）、z=0.18；车辕前端的铁环在车前 4.02 m，
    // 系在牲口的牛轭 / 马套包上（_blender/Script_OxCartBake.py 的 SHAFT_EYE_Y），辕头取 -4.02。
    wheelHalfTrackM: 1.32,
    wheelRadiusM: 0.72,
    axleZ: 0.18,
    hitchZ: -4.02,
    // 沿车轮前后各探一个轮半径，步长 5 cm（躯干命中胶囊半径 0.12–0.16 m，步子要小于它）。
    probeStepM: 0.05,
    // 尸体是软的：轮子压下去一截，只按顶面高度的这一成抬车。
    softness: 0.7,
    // 抬升封顶：31 号尸堆叠了两层（顶面 0.5–0.6 m），整只轮子爬上去不像压过人。
    maxLiftM: 0.34,
    // 每只轮子一根弹簧：2.1 Hz、阻尼比 0.3 → 压上去之后还会软软地弹两下。
    springHz: 2.1,
    dampingRatio: 0.3,
    // 从尸体上掉回地面：地是硬的，只回弹这一成速度（木轮压回土路那一下）。
    groundRestitution: 0.2,
    // 积分子步（弹簧在 30 fps 下也稳）。
    maxSubstepS: 1 / 120,
    // 静态战场尸体（MISSION_AFTERMATH）开机烘成一张顶面高度格：原型局部先按 7 cm 取顶，
    // 摆到世界再落进 10 cm 的格子（源比格子密，旋转后不留洞）。
    localCellM: 0.07,
    fieldCellM: 0.10,
    // 战斗中倒下的人（AI 尸体、任务人群里的死者）按命中体胶囊现算，只看车周这么远。
    dynamicRangeM: 8,
    // 尸体刚倒下还会滑（StepCorpse 最多 8 s），每隔这么久或挪了 3 cm 就重取命中体。
    dynamicRefreshS: 0.5,
    dynamicMoveM: 0.03,
  }),

  // -------------------------------------------------------------------------
  // 13 日机空袭桥头道路与车列
  // -------------------------------------------------------------------------
  // 散开：离桥头路中线（x=76）这么近的人算「在路上」，要让开。
  scatterFromRoadM: 9,
  scatterMps: 2.1,
  scatterArrivalM: 1.2,
  // 让开以后停的地方至少离路中线这么远：路两侧残墙在 x 71 / x 80（transferEvac.walls），
  // 遮挡点都在墙外侧（西 x ≤ 69.5、东 x ≥ 82.5）。
  scatterCoverOffRoadM: 6.5,
  // 13 疏散 / 15A 撤退走固定通道（2026-09-27 白盒 C 区第二轮）。
  // 车路 x76 两侧砌了带缺口的残墙（Data_FirstLevelWhiteboxTransfer 按这张表砌），人不再
  // 「就地横着让开」「从哪儿都正西走到 x 60」，而是：
  //   · 疏散：走到同侧最近的路边遮挡点（残墙背后 / 房檐下 / 洼地里），路上先穿对应的墙缺口；
  //   · 撤退：从所在位置接到三条通道之一（北 z 111 分流口、中 z 120.8 追兵线、南 卸车点），
  //     经西墙缺口进下沟口 ditchMouth (54,114)，再接 evacuation。
  // 纯数据 + 下面两个纯函数（MidTransferScatterPlan / MidTransferRetreatJoin）；
  // 通道、遮挡路径与墙体的净空由 Script_FirstLevelMidTest 用担架走廊 + 两端搬运员胶囊扫。
  transferEvac: Object.freeze({
    roadX: 76,
    walls: Object.freeze({
      westX: 71, eastX: 80, thickM: 0.5,
      // [zStart, zEnd]。西墙 z 109.6–122 整段敞开：分流出口 z 111、分拣台、追兵线 z 120.5 都在这儿。
      // 西墙南段止于 z 130：卸车点 (72.6,135) 到沟口的斜向走廊要从它南头过。
      west: Object.freeze([[90.6, 94.8], [97.0, 101.4], [103.6, 108.4], [122.0, 125.8], [127.0, 130.0]]),
      // 东墙只到 z 104.2：以南是车位、上车位 (80,120)、发车与牛车驶离的斜线，不能砌墙；
      // 104.2–110 也空着 —— 14 救人时刘文才从射位 (84,106) 直奔沟口，斜线在 x 80 处 z≈107、
      // 在 x 71 处 z≈109.5（所以西墙北段止于 108.4）。脚本走位没有绕行，只会贴墙滑，撞墙角就卡死。
      // 95.6–99.6 的缺口让开低墙射位 → 侧巷口的视线（SpaceTest sideAlley「village wall」）。
      east: Object.freeze([[90.0, 95.6], [99.6, 104.2]]),
    }),
    // 东墙外侧的人撤退时先从最近的东缺口进车路（缺口中心 z；最后一个是墙南头以南）。
    eastGapZ: Object.freeze([97.6, 106.6]),
    // 遮挡点：path 是从车路一侧走过去的折线，最后一点是停的地方；同一遮挡点最多 slotsPerCover 人，
    // 按 slotSpreadM 沿墙错开（0、+1、-1 格）。
    slotSpreadM: 1.5,
    slotsPerCover: 3,
    covers: Object.freeze([
      Object.freeze({ id: "WestWallA", side: -1, path: Object.freeze([{ x: 71, z: 95.9 }, { x: 68.8, z: 95.9 }, { x: 68.8, z: 92.6 }]) }),
      Object.freeze({ id: "WestWallB", side: -1, path: Object.freeze([{ x: 71, z: 95.9 }, { x: 68.8, z: 95.9 }, { x: 68.8, z: 99.2 }]) }),
      Object.freeze({ id: "WestWallC", side: -1, path: Object.freeze([{ x: 71, z: 102.5 }, { x: 68.8, z: 102.5 }, { x: 68.8, z: 106.2 }]) }),
      Object.freeze({ id: "WestWallD", side: -1, path: Object.freeze([{ x: 71, z: 121.0 }, { x: 68.9, z: 121.0 }, { x: 68.9, z: 124.2 }]) }),
      Object.freeze({ id: "WestWallE", side: -1, path: Object.freeze([{ x: 71, z: 131.4 }, { x: 68.9, z: 131.4 }, { x: 68.9, z: 128.2 }]) }),
      Object.freeze({ id: "WestDip", side: -1, path: Object.freeze([{ x: 71, z: 131.4 }, { x: 66.2, z: 129.8 }]) }),
      Object.freeze({ id: "EastWallA", side: 1, path: Object.freeze([{ x: 80, z: 97.6 }, { x: 83, z: 97.6 }, { x: 83, z: 92.6 }]) }),
      Object.freeze({ id: "EastWallB", side: 1, path: Object.freeze([{ x: 80, z: 97.6 }, { x: 83, z: 97.6 }, { x: 83, z: 101.4 }]) }),
      Object.freeze({ id: "EastWallC", side: 1, path: Object.freeze([{ x: 83, z: 106.4 }]) }),
      Object.freeze({ id: "EastDipNorth", side: 1, path: Object.freeze([{ x: 86.8, z: 128.2 }]) }),
      Object.freeze({ id: "EastDipSouth", side: 1, path: Object.freeze([{ x: 90.8, z: 131.4 }]) }),
      Object.freeze({ id: "ShedEaves", side: 1, path: Object.freeze([{ x: 94.0, z: 131.4 }]) }),
    ]),
    // 撤退通道：gate 在西墙缺口的车路一侧；points 是缺口以西的折线（西墙外的人从 points[0] 接）；
    // 终点一律是下沟口。untilZ：按所在位置的 z 分给哪一条。
    lanes: Object.freeze([
      Object.freeze({ id: "North", untilZ: 116, gate: { x: 73.5, z: 111 }, points: Object.freeze([{ x: 60, z: 111 }]) }),
      // 西墙南段背后（x ≥ 67.5）的人先贴墙往北走到墙头 (68.9,121)，再横过去：斜着走会蹭到分拣台旁的物资堆。
      Object.freeze({ id: "Middle", untilZ: 124.5, gate: { x: 73.5, z: 120.8 }, points: Object.freeze([{ x: 61, z: 120.8 }, { x: 60, z: 114 }]),
        westEntry: Object.freeze({ minX: 66.8, via: Object.freeze({ x: 68.9, z: 121 }) }) }),
      // 棚下（x < 62）的人先顺着棚走到 (58.2,125.2) 再去下沟口：往 (64.6,125) 走会撞棚柱与物资堆，
      // 直接斜着去沟口会蹭砖房东北角。
      Object.freeze({ id: "South", untilZ: Infinity, gate: { x: 72.8, z: 133.4 }, points: Object.freeze([{ x: 64.6, z: 125 }]),
        westDirect: Object.freeze({ maxX: 62, via: Object.freeze({ x: 58.2, z: 125.2 }) }) }),
    ]),
    ditchMouth: Object.freeze({ x: 54, z: 114 }),
    // 北段车路的「路中」：贴西墙的人先横到这里。
    corridorX: 73.5,
    // 西墙敞口里的分拣台一带（担架凳 (65,119)/(68,119)、物资堆 (66,124)）。
    triageGap: Object.freeze({ minX: 68, minZ: 112, maxZ: 122 }),
  }),
  // 罗班长从后方赶到：跑到停车处这么近才喊「莫挤路上」。
  luoArriveM: 7,
  luoArriveMps: 3.4,
  // 卸人是有过程的：两个搬运的人先走到车边，再把担架从车板（1.2 m）放到地面。
  unloadBearerReachM: 1.6,
  unloadBearerMps: 2.2,
  unloadSeconds: 3.2,
  // 卸下来放在车西侧这么远（让开车道，靠西沟那一头）。
  unloadOffsetM: 3.4,

  // -------------------------------------------------------------------------
  // 14 第二轮扫射，转入西沟
  // -------------------------------------------------------------------------
  // 「进入沟内遮挡」的判定：离沟口锚点 A.ditch 这个半径之内。
  ditchShelterM: 8,
  // 「队伍离开主车道」：活着的担架离桥头路中线这么远。
  offRoadM: 8,
});

/** 08 担架停车位：空间包的三个点打底，多出来的按行往北排。 */
export function MidLitterHoldSlots(litterWait, count) {
  const base = litterWait.map((point) => ({ ...point }));
  return Array.from({ length: count }, (_, i) => {
    const row = Math.floor(i / base.length), anchor = base[i % base.length];
    return {
      x: anchor.x + (row % 2 ? MID_TUNING.litterHoldLateralM * 0.5 : 0),
      z: anchor.z - row * MID_TUNING.litterHoldRowM,
      yaw: anchor.yaw ?? 0,
    };
  });
}

/** 08 步行的人（民夫/替补）停在同一道遮挡后面，横着排开，不挡担架。 */
export function MidWalkerHoldSlots(litterWait, count) {
  const west = litterWait.reduce((best, point) => (point.x < best.x ? point : best), litterWait[0]);
  return Array.from({ length: count }, (_, i) => ({
    x: west.x - MID_TUNING.litterHoldLateralM - (i % 2) * 1.4,
    z: west.z - Math.floor(i / 2) * MID_TUNING.litterHoldRowM,
    yaw: 0,
  }));
}

/** 11 接运点现场的步行伤员：三对互相搀扶。 */
export function MidWalkingWounded() {
  const origin = MID_TUNING.walkingWoundedOrigin;
  return Array.from({ length: MID_TUNING.walkingWoundedCount }, (_, i) => {
    const pair = Math.floor(i / 2), side = i % 2 ? 1 : -1;
    return {
      id: `TransferWalker${i}`,
      x: origin.x + pair * MID_TUNING.walkingWoundedSpacingM + side * MID_TUNING.walkingWoundedPairM,
      z: origin.z + (pair % 2) * 1.4,
      yaw: Math.PI,
      pair,
      // 搀扶的那个走外侧（side=+1），被搀的在内侧。
      supporting: side > 0,
      sorted: false,
      visible: false,
    };
  });
}

/** 车位 / 过路车的牲口种类。下标不在表里的一律是马。 */
export function MidDraftKind(kind, index) {
  const list = kind === "bay" ? MID_TUNING.oxBayIndices : MID_TUNING.oxTrafficIndices;
  return list.includes(index) ? "ox" : "horse";
}

/**
 * 13 散开：给每个人挑同侧最近的路边遮挡点，返回 { cover, route }（route 最后一点是停的地方）。
 * 不在路上（离 x76 ≥ scatterFromRoadM）的给 null；force 时一律分配（11 的步行伤员）。
 * 已经站在墙外侧的人跳过车路一侧的那几个折点，直接走到遮挡点。
 */
export function MidTransferScatterPlan(points, { force = false } = {}) {
  const E = MID_TUNING.transferEvac, W = E.walls, load = new Map();
  return points.map((point) => {
    if (!force && Math.abs(point.x - E.roadX) >= MID_TUNING.scatterFromRoadM) return null;
    const side = point.x <= E.roadX ? -1 : 1;
    let best = null, bestCost = Infinity;
    for (const cover of E.covers) {
      if (cover.side !== side) continue;
      const hold = cover.path.at(-1);
      const used = load.get(cover.id) || 0;
      const cost = Math.abs(hold.z - point.z) + 0.3 * Math.abs(hold.x - point.x) + 4 * used
        + (used >= E.slotsPerCover ? 1e4 * used : 0);
      if (cost < bestCost) { bestCost = cost; best = cover; }
    }
    const k = load.get(best.id) || 0;
    load.set(best.id, k + 1);
    const slot = k % E.slotsPerCover, offset = (slot % 2 ? -1 : 1) * Math.ceil(slot / 2) * E.slotSpreadM;
    const outside = side < 0 ? point.x < W.westX : point.x > W.eastX;
    const route = best.path
      .filter((p, i) => i === best.path.length - 1 || !outside || (side < 0 ? p.x < W.westX : p.x > W.eastX))
      .map((p) => ({ x: p.x, z: p.z }));
    route[route.length - 1].z += offset;
    return { cover: best.id, route };
  });
}

/**
 * 15A 撤退：从 point 接到三条通道之一，返回从 point 之后到下沟口（含）的折线。
 * 调用方在前面补 point 本身、在后面接 evacuation 的剩余段。
 */
export function MidTransferRetreatJoin(point) {
  const E = MID_TUNING.transferEvac, W = E.walls, T = E.triageGap;
  const Lane = (z) => E.lanes.find((lane) => z < lane.untilZ);
  const out = [];
  // 西墙 z 109.6–122 那段敞口里、分拣台一带（x ≥ 68）的人按车路一侧算：从车路进通道口，
  // 斜着穿分拣台会撞上担架凳和物资堆。
  const inTriageGap = point.x >= T.minX && point.z > T.minZ && point.z < T.maxZ;
  if (point.x < W.westX && !inTriageGap) {
    // 已经在西墙外：直接接通道缺口以西那一段。棚下（x < westDirectMaxX）的直接去下沟口；
    // 西墙南段背后的先贴墙走到墙头，再横过去。
    const lane = Lane(point.z);
    if (lane.westDirect && point.x < lane.westDirect.maxX) out.push(lane.westDirect.via);
    else {
      if (lane.westEntry && point.x >= lane.westEntry.minX) out.push(lane.westEntry.via);
      out.push(...lane.points);
    }
  } else {
    let z = point.z;
    if (point.x > W.eastX && point.z < E.eastGapZ.at(-1)) {
      // 东墙外：先离墙站开，再从最近的东缺口钻进车路。
      const gap = E.eastGapZ.reduce((a, b) => (Math.abs(b - point.z) < Math.abs(a - point.z) ? b : a));
      if (point.x < W.eastX + 2.5) out.push({ x: W.eastX + 2.5, z: point.z });
      out.push({ x: W.eastX + 1.8, z: gap }, { x: W.eastX - 1.8, z: gap });
      z = gap;
    } else if (point.x < E.corridorX && point.z < E.eastGapZ.at(-1)) {
      // 北段车路里贴着西墙的人先横到路中间，再顺路往南，不贴墙蹭过去。
      out.push({ x: E.corridorX, z: point.z });
    }
    const lane = Lane(z);
    out.push(lane.gate, ...lane.points);
  }
  out.push(E.ditchMouth);
  return out.map((p) => ({ x: p.x, z: p.z }));
}

/**
 * 12 班里人上射位 / 何有田接替射位：从 from 走到 to 的折线（不含 from）。直线要是从车路两侧
 * 残墙的墙段中间穿过去，就改走最近的缺口（缺口两侧各一个折点，离墙 1.5 m），其余照直走。
 * 这些人由 squadRoutes 驱动，没有寻路，只会贴墙滑 —— 墙段中间正对着过去就会顶在墙上。
 */
export function MidTransferWalkRoute(from, to) {
  const W = MID_TUNING.transferEvac.walls, out = [];
  const Gaps = (segs) => {
    const sorted = [...segs].sort((a, b) => a[0] - b[0]);
    return [sorted[0][0] - 1.5, ...sorted.slice(1).map((seg, i) => (sorted[i][1] + seg[0]) / 2), sorted.at(-1)[1] + 1.5];
  };
  let a = { x: from.x, z: from.z };
  for (let guard = 0; guard < 4; guard++) {
    let hit = null;
    for (const [x, segs] of [[W.westX, W.west], [W.eastX, W.east]]) {
      if ((a.x - x) * (to.x - x) >= 0) continue;
      const t = (x - a.x) / (to.x - a.x), z = a.z + (to.z - a.z) * t;
      // 斜着擦过墙头也算：看这一段离每个墙段（连 0.9 m 余量）是否有交，不只看穿墙点。
      const length = Math.hypot(to.x - a.x, to.z - a.z), n = Math.ceil(length / .2);
      const near = segs.some(([z0, z1]) => {
        for (let i = 0; i <= n; i++) {
          const px = a.x + (to.x - a.x) * i / n, pz = a.z + (to.z - a.z) * i / n;
          if (Math.abs(px - x) < W.thickM / 2 + .9 && pz > z0 - .9 && pz < z1 + .9) return true;
        }
        return false;
      });
      if (!near) continue;
      if (!hit || t < hit.t) hit = { t, x, z, segs };
    }
    if (!hit) break;
    const gap = Gaps(hit.segs).reduce((best, g) => (Math.abs(g - hit.z) < Math.abs(best - hit.z) ? g : best));
    const side = Math.sign(to.x - a.x);
    out.push({ x: hit.x - side * 1.5, z: gap }, { x: hit.x + side * 1.5, z: gap });
    a = out.at(-1);
  }
  out.push({ x: to.x, z: to.z });
  return out;
}
