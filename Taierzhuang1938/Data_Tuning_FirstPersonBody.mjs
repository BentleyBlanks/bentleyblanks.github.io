// 第一人称自己身体（Script_FirstPersonBody）的下半身：原地转身死区、踩步节奏、脚锁地与腿 IK 的数值表。
// 纯数据、零 three 依赖；规划器 Script_FirstPersonGait 与身体 Script_FirstPersonBody 只读这张表。
//
// 口径（2026-10-22，对标 3A 第一人称全身：UE5 Lyra 的 Turn In Place / Orientation Warping /
// Distance Matching / Foot Locking + 两节骨骼 IK）：
//   · 上身（Spine1、Spine2）始终对准视线；腿和胯有自己的朝向 lowerYaw。站着转视角时 lowerYaw 不动，
//     偏差超过 idleDeadzoneDeg 才开始转胯，脚一步一步挪过去（turn in place）。
//   · 走路时脚的落点按走过的距离排（相位随距离推进，不随时间），着地的脚在世界里锁死不动，
//     腿用 IK 接到锁住的脚上。所以动画快慢永远和实际走速一致，脚不会在地上滑。
//   · 速度 → 每秒步数、着地时长占比的表来自人体步态常识：快走 1.3 m/s 约 1.9 步/秒、
//     小跑 3 m/s 约 2.7 步/秒、冲刺 5 m/s 以上约 3.2 步/秒；着地占比走 ~0.6、跑 ~0.3（有腾空）。
export const FIRST_PERSON_BODY = Object.freeze({
  // 原地：视线与胯的偏差超过它才转胯（度）；转到剩 idleSettleDeg 以内算转完。
  idleDeadzoneDeg: 50,
  idleSettleDeg: 4,
  // 转胯的追随速率（1/s，指数追）和最低角速度（度/秒，保证大角度时不拖太久）。
  idleTurnRate: 6,
  idleTurnMinDegS: 110,
  // 原地转胯最快多少度/秒（2026-10-28）：脚一步一步挪得过来的速度；视线转得更快时胯被上身最大拧角拖着走，
  // 多出来的那部分由「脚尖偏角上限」让着地的脚跟着胯原地拧过去（见 footTwistLimitDeg）。
  idleTurnMaxDegS: 260,
  // 上身最多拧多少度（超过就拖着胯一起转），两节脊柱各分一半。
  maxTwistDeg: 85,
  twistSpine1: 0.45,
  twistSpine2: 0.55,
  // 走动：胯朝向追视线的速率（1/s）；横移 / 斜走时胯往移动方向偏，最多 orientWarpDeg（Orientation Warping，正横移时最大）。
  // 正横移时胯偏 40° → 步子与胯差 50°，腿的左右次序沿移动方向量，不会卡住后脚（2026-10-28）。
  // 移动方向过了正横移再多 orientWarpHysteresisDeg 度才从「胯正前对着走」切到「胯正后对着走」（反过来同理）。
  movingTurnRate: 9,
  orientWarpDeg: 40,
  orientWarpHysteresisDeg: 20,
  // 算不算在走（m/s）：高于 startMps 开始迈步，低于 stopMps 停步（回差）。
  startMps: 0.3,
  stopMps: 0.15,
  // 速度平滑（1/s）；一帧挪动超过 teleportM 当成瞬移，脚直接重新落在脚位上。
  velocityRate: 14,
  teleportM: 1.5,
  // 速度（m/s）→ 每秒步数；速度（m/s）→ 着地时长占一个步态周期的比例。
  // 着地距离 = 速度 × 着地时长：3.05 m/s 约 0.73 m、5.25 m/s 约 0.84 m（实测人跑步 0.7–0.9 m），腿够得着。
  cadence: [[0, 1.4], [1.3, 1.9], [3.05, 2.75], [5.25, 3.25]],
  stanceFraction: [[0, 0.62], [1.6, 0.56], [3.05, 0.33], [5.25, 0.26]],
  // 抬脚高度（米）：走 / 跑 / 蹲；原地挪步另算。
  liftWalkM: 0.09,
  liftRunM: 0.15,
  liftCrouchM: 0.07,
  // 落脚点比「着地中点在胯下」的比例：1 = 前后对称（前脚够多远、后脚就蹬多远，两头都靠降胯 / 踮脚够着）。
  leadScale: 1,
  // 脚落点离胯下最远多少米（再远腿够不着）。
  maxLeadM: 0.45,
  // 走动中锁住的脚离脚位（胯下）超过它（米）就提前迈出去（急起步、急转弯时的补步）。
  // 降胯到底再踮脚跟，腿最远够到胯下约 0.55 m；留一点余量。
  maxStanceStretchM: 0.5,
  // 三维腿长判据留的余量（米）：胯高取的是上一帧的，坡上一帧差几厘米，贴着腿长极限判会漏一帧把脚拽动。
  reachMarginM: 0.03,
  // 原地挪步：脚离脚位多远 / 脚尖偏多少度就挪；转身中门槛更低。
  settleDistM: 0.16,
  settleYawDeg: 30,
  turningDistM: 0.07,
  turningYawDeg: 14,
  settleSwingS: 0.3,
  // 转身中的挪步更快（秒），一只脚落地后另一只隔多久能抬（秒）。
  turningSwingS: 0.2,
  turningMinPlantS: 0.04,
  settleLiftM: 0.055,
  // 一只脚落地后至少站多久另一只才能抬（原地挪步时），秒。
  settleMinPlantS: 0.09,
  // 停步时还在空中的那只脚至少用多快落下（每秒走完摆动的几分之一）。
  finishMinRate: 3,
  // 腾空（跳、掉落）多久后脚离地（秒）；腾空时脚收在脚位上方多高（米）。
  airborneDelayS: 0.08,
  airTuckM: 0.14,
  // 地面跟随：脚下地面高度相对玩家脚下最多差多少米（再多当成站在箱子 / 屋顶上，不跟）。
  groundFollowM: 0.35,
  // 腿 IK：伸直到腿长的多少（留一点弯）；够不着时最多降胯多少米、降胯的回弹速率（1/s）。
  reachFraction: 0.985,
  maxPelvisDropM: 0.16,
  pelvisRecoverRate: 8,
  // 够不着的后脚：最多踮起多高（米，绕脚尖抬脚跟），脚长（踝到脚尖，米）。
  maxHeelLiftM: 0.09,
  footLengthM: 0.15,
  // 膝盖朝脚尖方向外撇多少（度），两脚尖各外八多少度。
  kneeOutDeg: 8,
  toeOutDeg: 6,
  // 防内八 / 撇脚 / 两腿拧在一起（2026-10-28，用户：视角转快了会内八、撇脚，甚至两个腿转在一起）：
  // 着地的脚尖与胯朝向最多差这么多度。胯转得比脚挪得快时，超出的部分让着地的脚绕胯中心跟着拧（人快速转身时
  // 就是踮着前脚掌碾过去的），脚尖不会被甩到朝里 / 朝外，两只脚的左右次序也不会倒。
  footTwistLimitDeg: 35,
  // 两只脚在胯的左右方向上至少隔多远（米，踝到踝）：着地的脚被挤得更近就推开；摆动的脚绕着支撑腿走，不从它身上穿过去。
  minFootGapM: 0.13,
  // 走动中两只脚都着地时，推开最快多少米/秒（横移急换向时脚的前后次序要对调，限速后不瞬移，等下一步迈开）。
  plantedSeparateMps: 0.5,
});
