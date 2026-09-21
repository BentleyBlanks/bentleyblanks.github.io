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

  // -------------------------------------------------------------------------
  // 13 日机空袭桥头道路与车列
  // -------------------------------------------------------------------------
  // 散开：离桥头路中线（x=76）这么远算离开道路。
  scatterFromRoadM: 9,
  scatterMps: 2.1,
  scatterArrivalM: 1.2,
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
