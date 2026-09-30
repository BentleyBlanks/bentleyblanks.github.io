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
  // 顺子的「滚你妈的」：真贴上白刃才喊。距离与 UpdateMelee 记 meleeEngaged 同一把尺
  //（R.ambushBindReachM 1.15 + 0.4 的半个身位）。
  meleeCurseReachM: R.ambushBindReachM + 0.4,
  // 「窗口火力仍封锁院口」的判定：窗口射手到院门的射线打不打得通。
  windowCoverTargetM: 1.1,
  // 进门遭伏击（2026-09-28 用户：照 COD5 的万岁冲锋做一次性按键 QTE）。
  // 编排在 Script_FirstLevelKitchenAmbush，副作用在 Script_FirstLevelVillageBlock。
  kitchenAmbush: Object.freeze({
    // 藏身点：灶屋与连屋之间那条带顶的过道（Whitebox 的 KitchenLinkWest/East 两头封死，
    // x 52.3–63.7、z −1.2–0.2，1.4 m 宽）西段。灶屋南门洞只有 x 57–59 两米宽，
    // 从灶屋里任何一点看过去他都被南墙挡住；玩家一跨进门洞，他就在**右手**边四米
    // （往南走时右手是西）—— 罗班长那句录好的「右手！」对得上。
    hide: Object.freeze({ x: 54, z: -0.5 }),
    // 面朝东（门洞那头）等着：前向 (-sin yaw, -cos yaw) = (+1, 0)。
    hideYaw: -Math.PI / 2,
    // 触发：玩家真的跨进了这条过道（灶屋南墙 z −1.8…−1.2 的墙厚里不算：站在门框里往西看
    // 被门框挡着，看不见扑过来的人；再往里 0.2 m 一扭头就是整条过道）；或者从东巷／内院绕进了连屋
    //（MISSION_PLACEMENT.roomInterior 那一块）—— 他从过道北口那扇门扑出来。
    // 不用「离藏身点多远」：灶屋里好几处离他不到五米，隔着墙就扑是穿墙。
    triggers: Object.freeze([
      Object.freeze({ minX: 52.3, maxX: 63.7, minZ: -1.0, maxZ: 0.7 }),
      Object.freeze({ minX: 52.6, maxX: 63.4, minZ: 1, maxZ: 15 }),
    ]),
    // 过道两头的门洞都在 x=58（灶屋南门、连屋北门各两米宽）。人在过道里、目标在过道外时
    // 先冲到门洞口这一点再拐：直线过去会顶在墙上（过道只有 1.4 m 宽，南北墙都是实的）。
    doorX: 58,
    linkZ: Object.freeze({ min: -1.25, max: 0.25 }),
    // 从墙根跨出来、嚎那一声「突撃！」的停顿；这之后才冲。
    emergeS: 0.22,
    // 冲锋速度。过道口 (58,−1.0) 到藏身点 4.0 m，扣掉撞上距离，从露头到撞上约 0.7 s ——
    // 反应快的人来得及转身开一枪（提前击败，不进 QTE），大多数人来不及。
    lungeMps: 6.2,
    // 追着人跑也追不上（玩家往回退、从连屋深处触发）：冲了这么久还没够着，这一拍作罢，
    // 他转成普通白刃兵（不隔着几米把人「撞」翻）。
    lungeMaxS: 1.4,
    // 撞上的距离：这么近就算撞翻了。共用 Pressure 姿势按 1 m 上下做（MeleeCombat.NpcThink 压到 1.05 m）。
    tackleReachM: 1.25,
    // 撞翻那一下掉的血（kind "qte"，不乘白刃倍率；控制锁里要真的掉血）。
    tackleDamage: 8,
    // 倒地（MELEE_RULES.knockdownS 0.65 s）走完、看清刀举起来了才给键。
    promptDelayS: 0.85,
    // 一次性按键窗口。COD5 的万岁冲锋在一秒半上下；这里多给一点，因为提示环要从屏幕中央找。
    windowS: 1.8,
    // 反刺那一下：走共用白刃伤害链（血、击杀回执），必死。
    counterDamage: 200,
    // 漏掉了：刀捅进去。共用倒地失败伤害在控制锁的保护里被吞掉，这一刀单独算，
    // 「体验」档受伤倍率 0.8 下也要一刀致命（400 × 0.8 = 320）。
    failDamage: 400,
    // 按上之后至少在地上多待这么久再起身（共用结算 0.6 s + 起身 1.05 s 本来就更长，这里是下限）。
    counterHoldS: 0.6,
    // 撞翻时镜头转向他的脸用多久（与倒地同时走，不是先转头再倒）。
    lookSeconds: 0.3,
    // 反刺之后视线从他脸上转回平视远处用多久：共用结算 0.6 s + 起身 1.05 s，与起身一起走完。
    levelGazeS: 1.65,
    // 头骨取不到时退回脚底往上这么高。
    lookHeightM: 1.45,
    // 控制锁上限：整拍最长 0.22 + 1.4 + 0.85 + 1.8 + 0.6 + 1.05 ≈ 6 s，给足余量；到点前一定会被拍表收掉。
    lockMaxS: 14,
    // 倒地那几拍把第一人称的枪和手整体挪开（Viewmodel.SetScriptedHandOffset），不然正好挡住他的脸。
    // 09-16 旧伏击实拍定下的数（docs/Data_FirstLevelRoomAmbush.md §4.3），这一拍重新实拍过。
    grappleHandM: Object.freeze({ x: 0.03, y: -0.28, z: -0.38 }),
    // 死在这一拍里、检查点重来：从灶屋正中那间（北门进来的第一间）起，面朝南。
    retryPoint: Object.freeze({ x: 58, z: -6, yaw: Math.PI }),
    // 重来之后那一行提示挂多久（「倒地被压住时看准了按 F」—— COD5 死在万岁冲锋下也给这一句）。
    retryHintS: 5,
    // 起身之后剩下三个人从东巷那扇门错峰压进来（秒）。按 MISSION_ENCOUNTERS.melee 里除领头外的顺序。
    releaseDelaysS: Object.freeze([0.4, 1.2, 2.0]),
  }),

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
  // 班里人的射位（2026-09-27 掩护装载重做，docs/Data_FirstLevelTransferCover20260927.md）：
  // 守来时路 —— 全在村口低墙（z≈84）背后一线，朝北对着门楼与主街，不站在伤员中间。
  // 顺子在 A.transferWall（低墙射口 67.5,86）；罗班长在他右手、紧挨路口西砖垛；刘文财在
  // 左手、低墙西头（西巷绕过来的人钻西北残屋，他先看见）；何有田在右翼低墙东段，东巷口
  // 就在他正前方（「右边有人！」）。幺娃不上墙，跟着担架在装载区（14 他从这里奔沟口救人）。
  // face：没有目标时脸朝哪儿（watchYaw），不写就不管。
  // 都在墙南侧：13/14 罗班长直奔停车处、幺娃刘文财直奔沟口都是直线（MidTest 量着），
  // 墙北侧的射位会让这几条直线穿墙。
  defencePosts: Object.freeze([
    Object.freeze({ cast: "luo", x: 71.2, z: 85.75, face: Object.freeze({ x: 77.2, z: 70.5 }) }),
    Object.freeze({ cast: "heyoutian", x: 88.8, z: 85.6, face: Object.freeze({ x: 94.5, z: 70 }) }),
    Object.freeze({ cast: "liuwencai", x: 60.6, z: 85.6, face: Object.freeze({ x: 62, z: 74 }) }),
    Object.freeze({ cast: "yaowa", x: 79, z: 110 }),
  ]),
  defencePostArrivalM: 1.6,
  // 装载区受不受压的判定点（运行时 Threatens 的点）：村路进场院那一段排队道。
  // 门楼北侧那挺机枪顺着车路往里扫的就是这里（29.5 m，在 passageRangeM 36 以内）。
  loadingThreatPoint: Object.freeze({ x: 76.5, z: 96 }),
  // 村口低墙一线（低墙 + 两头残墙 + 路口砖垛）：12 班里人走射位时直线要是从墙身穿过去，
  // 改走路口（MidTransferWalkRoute）。runs 是墙身的 x 区间，gapX 是路口中线。
  villageWall: Object.freeze({ z: 84.05, thickM: .9, runs: Object.freeze([[55.4, 73.85], [78.7, 97.6]]), gapX: 76.2 }),
  // 场院东头那道沙袋墙角 TransferCorner（x 91–99、z 96）：从 A.transfer 一带往北去低墙东段的人
  // 绕它的西头走（gapX 在墙头以西 1.6 m）。
  yardCorner: Object.freeze({ z: 96, thickM: .7, runs: Object.freeze([[91, 99]]), gapX: 89.4 }),
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
  // 让开以后停的地方至少离路中线这么远：路两侧的墙在 x 71 / x 80（transferEvac.walls）。
  // 2026-09-30：原值 6.5（遮挡点都在墙外侧，西 x ≤ 69.5、东 x ≥ 82.5）改 2.5 —— 两道高墙夹路之后，
  // 概念图 13_3 的人是「贴墙根蹲下」，西墙根遮挡点（WestFoot* x 72.6）离路中线 3.4 m，
  // 在牛车车道（车盒半宽 1.5）以外；担架停到离遮挡点 ≤ 0.6 m 处（实测 73.2 → 离路中线 2.8 m）。原意「让出车道」不变。
  scatterCoverOffRoadM: 2.5,
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
      // 2026-09-30（12–18 白盒 C2 包，第二轮）：夹道改成两道连续的长墙（概念 13_3「两道长墙夹着一条车路」）。
      // `*Low` 仍是带缺口的 1.6–2.7 m 残墙（Data_FirstLevelWhiteboxTransfer 循环里逐段砌，z < 104 一带）；
      // `*Tall` 是连续高墙，口子一律做成带门垛的门洞：
      //   · 西墙（x 71，青砖 3.7 m 带压顶壁柱）z 103.6–129.6，只在 z 108.0–112.95 留一个 4.95 m 的门洞 ——
      //     北撤退通道 (73.5,111) → (60,111)、幺娃 (79,110) 直奔沟口的斜线（x 71 处 z≈111.3）、刘文才从东侧 (84,106)
      //     一带直奔沟口的斜线（x 71 处 z≈109.5；14 救人靠 MoveActor 直线走，没有寻路）都从这里过；
      //     z 129.6 的南端不动（卸车点 (72.6,135) 到沟口的斜向走廊）。
      //   · 东墙（x 81.7，夯土 3 m）z 117.85–136.4；它北头的门垛（z 117.85–118.75）与低墙端 z 104.2 之间是一个
      //     13.65 m 的院门式开口：cartRide 的第一段 (85.6,113) → (82,113) → (79,118) 从这里进路（TransferTest 按车盒
      //     2.5 x 2.9 加 1.25 / 1.45 余量扫，净宽 ≥ 6.1 m 才过得去），bay 车去上车位 (80,120) 的 approachRoute 也走它，
      //     幺娃 (79,110) / 刘文才直奔沟口的斜线也从它北头出去。
      // 东高墙不能再往北（试过 z 108.6–111.35 的一段）：12 的侧巷机枪 B（MISSION_TACTICS 的 transferAlley 最后一个折点
      // (94.3,67.15)）要能打到上车位一带（TransferTest「B covers departing carts」：射线穿 x 81.7 处 z≈107–110.4），
      // 那一段墙会把它的射线挡掉；装载区的人群口袋 (82,100)、(82,106)（MissionCrowd）离 x 81.7 也太近。
      // 门洞上方一律不封顶 —— 车路上方开天（TransferTest 8 m 净空）。
      thickTallM: 0.7,
      eastTallX: 81.7,
      eastThickTallM: 0.75,
      westLow: Object.freeze([[90.6, 94.8], [97.0, 101.4]]),
      westTall: Object.freeze([[103.6, 108.0], [112.95, 129.6]]),
      eastLow: Object.freeze([[90.0, 95.6], [99.6, 104.2]]),
      eastTall: Object.freeze([[117.85, 136.4]]),
      // 门洞（门垛内皮之间的净宽），文档与测试用。
      westDoor: Object.freeze([108.0, 112.95]),
      eastGate: Object.freeze([104.2, 117.85]),
      west: Object.freeze([[90.6, 94.8], [97.0, 101.4], [103.6, 108.0], [112.95, 129.6]]),
      east: Object.freeze([[90.0, 95.6], [99.6, 104.2]]),
    }),
    // 东墙外侧的人撤退时先从最近的东缺口进车路（缺口中心 z；最后一个是墙南头以南）。
    // 97.6 低墙缺口；106.4 是低墙 (104.2) 与东高墙 (108.6) 之间的门洞；114.6 是东高墙的院门式开口。
    eastGapZ: Object.freeze([97.6, 106.4, 114.6]),
    // z 在它北边、x > eastX 的人在低墙 / 门洞外侧，要先走缺口；东高墙那一段另按 eastTallX 判（behindEastTall）。
    eastNorthZ: 106.6,
    // 遮挡点：path 是从车路一侧走过去的折线，最后一点是停的地方；同一遮挡点最多 slotsPerCover 人，
    // 按 slotSpreadM 沿墙错开（0、+1、-1 格）。
    slotSpreadM: 1.5,
    slotsPerCover: 3,
    covers: Object.freeze([
      Object.freeze({ id: "WestWallA", side: -1, path: Object.freeze([{ x: 71, z: 95.9 }, { x: 68.8, z: 95.9 }, { x: 68.8, z: 92.6 }]) }),
      Object.freeze({ id: "WestWallB", side: -1, path: Object.freeze([{ x: 71, z: 95.9 }, { x: 68.8, z: 95.9 }, { x: 68.8, z: 99.2 }]) }),
      Object.freeze({ id: "WestWallC", side: -1, path: Object.freeze([{ x: 71, z: 102.5 }, { x: 68.8, z: 102.5 }, { x: 68.8, z: 106.2 }]) }),
      // 2026-09-30：夹道高墙（z 118.5–130 / 125.6–136.4）之后，人不再绕到墙外去躲，而是「贴墙根蹲下」——
      // 概念图 13_3 就是这样（墙根码着麻袋、人贴着墙散开）。西墙根是一条 0.75 m 深的路沟（地形表
      // RoadSideDitchWest，13_4 的低位机位在里头），沟里两个遮挡点离路中线 3.4 m；东侧高墙后面仍是洼地与草棚（口子在 z 122.5）。
      // 在车道（cartRide 车盒半宽 1.5）以外；scatterCoverOffRoadM 相应从 6.5 改 2.5。东墙根不做遮挡点：担架的前后搬运员（±1.3 m）贴着墙放不下。
      Object.freeze({ id: "WestFootA", side: -1, path: Object.freeze([{ x: 73.6, z: 115.6 }, { x: 72.6, z: 118.0 }, { x: 72.6, z: 120.0 }]) }),
      Object.freeze({ id: "WestFootB", side: -1, path: Object.freeze([{ x: 73.6, z: 133.0 }, { x: 72.6, z: 131.4 }, { x: 72.6, z: 129.6 }]) }),
      Object.freeze({ id: "WestWallE", side: -1, path: Object.freeze([{ x: 71, z: 131.4 }, { x: 68.9, z: 131.4 }, { x: 68.9, z: 128.2 }]) }),
      Object.freeze({ id: "WestDip", side: -1, path: Object.freeze([{ x: 71, z: 131.4 }, { x: 66.2, z: 129.8 }]) }),
      Object.freeze({ id: "EastWallA", side: 1, path: Object.freeze([{ x: 80, z: 97.6 }, { x: 83, z: 97.6 }, { x: 83, z: 92.6 }]) }),
      Object.freeze({ id: "EastWallB", side: 1, path: Object.freeze([{ x: 80, z: 97.6 }, { x: 83, z: 97.6 }, { x: 83, z: 101.4 }]) }),
      Object.freeze({ id: "EastWallC", side: 1, path: Object.freeze([{ x: 83, z: 106.4 }]) }),
      // 东高墙外的洼地与草棚：从东高墙的院门式开口（z 111.35–117.85）绕过去。
      Object.freeze({ id: "EastDipNorth", side: 1, path: Object.freeze([{ x: 80.5, z: 114.6 }, { x: 85.5, z: 116.5 }, { x: 86.8, z: 124 }, { x: 86.8, z: 128.2 }]) }),
      Object.freeze({ id: "EastDipSouth", side: 1, path: Object.freeze([{ x: 80.5, z: 114.6 }, { x: 85.5, z: 116.5 }, { x: 90.8, z: 124 }, { x: 90.8, z: 131.4 }]) }),
      Object.freeze({ id: "ShedEaves", side: 1, path: Object.freeze([{ x: 80.5, z: 114.6 }, { x: 85.5, z: 116.5 }, { x: 94.0, z: 124 }, { x: 94.0, z: 131.4 }]) }),
    ]),
    // 撤退通道：gate 在西墙缺口的车路一侧；points 是缺口以西的折线（西墙外的人从 points[0] 接）；
    // 终点一律是下沟口。untilZ：按所在位置的 z 分给哪一条；roadUntilZ：车路一侧的人按它分（缺省同 untilZ）。
    lanes: Object.freeze([
      // 西高墙（z 118.5–130）之后 z 120.8 的中通道口没了：车路一侧 z < 124.5 的人一律走北通道口。
      Object.freeze({ id: "North", untilZ: 116, roadUntilZ: 124.5, gate: { x: 73.5, z: 111 }, points: Object.freeze([{ x: 60, z: 111 }]) }),
      // 西墙南段背后（x ≥ 67.5）的人先贴墙往北走到墙头 (68.9,121)，再横过去：斜着走会蹭到分拣台旁的物资堆。
      // westOnly：墙后的人才走这条；它的 gate 在西高墙里，车路一侧的人不用。
      Object.freeze({ id: "Middle", untilZ: 124.5, westOnly: true, gate: { x: 73.5, z: 120.8 }, points: Object.freeze([{ x: 61, z: 120.8 }, { x: 60, z: 114 }]),
        westEntry: Object.freeze({ minX: 66.8, via: Object.freeze({ x: 68.9, z: 121 }) }) }),
      // 棚下（x < 62）的人先顺着棚走到 (58.2,125.2) 再去下沟口：往 (64.6,125) 走会撞棚柱与物资堆，
      // 直接斜着去沟口会蹭砖房东北角。
      Object.freeze({ id: "South", untilZ: Infinity, gate: { x: 72.8, z: 133.4 }, points: Object.freeze([{ x: 64.6, z: 125 }]),
        westDirect: Object.freeze({ maxX: 62, via: Object.freeze({ x: 58.2, z: 125.2 }) }) }),
    ]),
    ditchMouth: Object.freeze({ x: 54, z: 114 }),
    // 北段车路的「路中」：贴西墙的人先横到这里。
    corridorX: 73.5,
    // 原来西墙 z 109.6–122 的敞口里 x ≥ 68 的人按车路一侧算。2026-09-30 第二轮：西墙从 z 103.6 起连续、只剩 z 108.0–112.95 的门洞，墙后的人都按墙外算（minZ = maxZ = 0：关掉）。
    triageGap: Object.freeze({ minX: 68, minZ: 0, maxZ: 0 }),
  }),
  // 2026-09-30（12–18 白盒 C2 包）：桥头路上的停滞车列与残车（概念 13_3「一串停滞的车列」、13_1「车队」、
  // 13_4「侧翻的马车」、14_1 沟口的大车）。原来 13 空袭时路上一辆车都没有（装好的车 12 里就开过桥走了，
  // 没装的停在 x 88–94 的车位上，从路上看不见）。这几辆是布景车：真牛 / 真马与真车模型
  // （Script_DraftCartModel），车板上码一层麻袋（View 的 cartSack 桶），不动、不载人、不参与 12 的装载与 13 的翻车。
  // 路上放不下别的：西半路是墙脚沟与撤退 / 散开的口子，东半路是 cartRide 的车身（x 75.5–80.5 @ z 118–127），
  // 北半路是分拣与后送队的路。所以停滞车放在这几处，都不压任何一条通道（MidTest 逐条量）：
  //   · B、C：桥面上的两辆（甲板 x 72–80，z 137–169），像先过桥、堵在桥上的车；桥被炸（MissionBridgeDestroyed）
  //     或进入 14 就撤掉。B 靠西、C 靠东，西侧留 1.1 m 的空隙。
  //   · E：停车处 cartHalt (76,135) 的替身。真实流程里顺子坐的那辆车（cartRide）就停在那里，E 只在没有
  //     cartRide 的时候（阶段跳转直接进 13，出图用）替它站着，进 14 或车真的开来就撤掉（standIn）。
  //   · W：西高墙墙脚路沟里的一辆侧翻残车（13_4），车板上的麻袋撒在沟里；空袭一起就在（AirFirst 起），
  //     留在原地。它占 z 122.4–128.3，两个墙根遮挡点（WestFootA z 120、WestFootB z 129.6）在它两头。
  //   · D：沟口北侧路边一辆（14_1 概念右边那辆大车），朝西，停在沟口北沿抛土之外。
  // 车盒与碰撞盒用 View 的 SyncCartCollider（3 × 5.8 m），与其他牛马车一样是实心。
  // 字段：from = 从哪一步起出现（缺省 visibleFrom）、until = 到哪一步（不含）撤掉、onBridge = 桥炸了就撤、
  // standIn = 有 cartRide 就撤、overturned = 侧翻残车。
  transferConvoy: Object.freeze({
    carts: Object.freeze([
      Object.freeze({ id: "ConvoyCartB", x: 74.4, z: 146.0, yaw: Math.PI, draft: "horse", cargo: "sacks", onBridge: true }),
      Object.freeze({ id: "ConvoyCartC", x: 78.0, z: 156.0, yaw: Math.PI, draft: "ox", cargo: "sacks", onBridge: true }),
      Object.freeze({ id: "ConvoyCartD", x: 40.5, z: 108.3, yaw: Math.PI / 2, draft: "horse", cargo: "sacks" }),
      Object.freeze({ id: "ConvoyCartE", x: 76, z: 135, yaw: Math.PI, draft: "ox", cargo: "sacks", from: "AirFirst", until: "Carry", standIn: true }),
      // E2 / E3：同一个替身，排在 E 后面（cartRide 的路线上：x 79 → 77 @ z 118 → 127），车头朝南，一辆接一辆排在夹道里
      // （2026-09-30 第二轮，13_3 要看见 >= 3 辆）。真流程里顺子那辆车走这条线，替身随 cartRide 一起撤。
      Object.freeze({ id: "ConvoyCartE2", x: 77.2, z: 126.4, yaw: Math.PI, draft: "horse", cargo: "sacks", from: "AirFirst", until: "Carry", standIn: true }),
      Object.freeze({ id: "ConvoyCartE3", x: 78.9, z: 119.0, yaw: Math.PI, draft: "ox", cargo: "sacks", from: "AirFirst", until: "Carry", standIn: true }),
      Object.freeze({ id: "ConvoyWreck", x: 73.3, z: 125.8, yaw: 0.2, draft: "horse", cargo: "spilled", overturned: true, sinkM: 0.55, from: "AirFirst" }),
    ]),
    // 从这一步起出现；onBridge 的车到 bridgeGoneFrom 这一步（含）撤掉，AirFirst 里则等 MissionBridgeDestroyed。
    visibleFrom: "TransferApproach",
    bridgeGoneFrom: "Carry",
    // 这一步起牲口不在了（13 的空袭里跑掉，车留在路上）。
    abandonedFrom: "Carry",
    // 车板上的麻袋：局部坐标（x 横向、z 沿车、层高），车板顶面在 ground + 1.12（Script_OxCartBake：DeckPlank 顶 1.12 m）。
    sacks: Object.freeze({
      deckTopM: 1.12,
      size: Object.freeze({ w: 0.68, h: 0.4, d: 0.8 }),
      layers: Object.freeze([
        Object.freeze({ xs: [-0.72, 0, 0.72], zs: [-1.2, -0.4, 0.4, 1.2] }),
        Object.freeze({ xs: [-0.36, 0.36], zs: [-0.8, 0, 0.8] }),
      ]),
      // 侧翻残车旁撒在地上的麻袋：[车局部 x, 车局部 z, 绕竖轴转角, 前倾, 侧倾]（贴地）。
      spilled: Object.freeze([
        [-1.9, -1.4, .3, 0.10, 0.5], [-2.6, -0.2, -.4, 0.0, 0.2], [-1.6, 0.9, .9, 0.2, -0.3],
        [-3.1, -1.7, 1.4, -0.1, 0.4], [-2.2, 2.0, -1.0, 0.3, 0.1], [1.9, 2.6, .6, 0.0, 0.6], [2.8, 0.4, -.2, 0.1, 0.3],
      ]),
    }),
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
    const behindEastTall = point.x > W.eastTallX + W.eastThickTallM / 2
      && W.eastTall.some(([z0, z1]) => point.z > z0 - 1 && point.z < z1 + 1);
    if ((point.x > W.eastX && point.z < E.eastNorthZ) || behindEastTall) {
      // 东墙外：先离墙站开，再从最近的东缺口 / 门洞钻进车路（东高墙后面的从院门式开口出来）。
      const wallX = behindEastTall ? W.eastTallX : W.eastX;
      const gap = E.eastGapZ.reduce((a, b) => (Math.abs(b - point.z) < Math.abs(a - point.z) ? b : a));
      if (point.x < wallX + 2.5) out.push({ x: wallX + 2.5, z: point.z });
      out.push({ x: wallX + 1.8, z: gap }, { x: wallX - 1.8, z: gap });
      z = gap;
    } else if (point.x < E.corridorX && point.z < E.eastNorthZ) {
      // 北段车路里贴着西墙的人先横到路中间，再顺路往南，不贴墙蹭过去。
      out.push({ x: E.corridorX, z: point.z });
    }
    // 车路一侧的人不走 westOnly 的通道（它的口子在西高墙里）。
    const lane = E.lanes.find((entry) => !entry.westOnly && z < (entry.roadUntilZ ?? entry.untilZ));
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
export function MidTransferWalkRoute(from, to, { minGapM = 0 } = {}) {
  const W = MID_TUNING.transferEvac.walls, out = [];
  // minGapM：墙段之间比它窄的缺口不当路走。14 救人的人是 AI 身体 + MoveActor 直线，2.2 m 宽的缺口（z 101.4–103.6）
  // 实测过不去（人卡在缺口里不动），只认门洞。默认 0 = 所有缺口都算（12 班里人上射位）。
  const Gaps = (segs) => {
    const sorted = [...segs].sort((a, b) => a[0] - b[0]);
    const between = sorted.slice(1).filter((seg, i) => seg[0] - sorted[i][1] >= minGapM).map((seg) => {
      const previous = sorted[sorted.indexOf(seg) - 1];
      return (previous[1] + seg[0]) / 2;
    });
    return [sorted[0][0] - 1.5, ...between, sorted.at(-1)[1] + 1.5];
  };
  let a = { x: from.x, z: from.z };
  // 东西向的横墙：村口低墙（12 的守线，z≈84）与场院东头的沙袋墙角 TransferCorner（z 96）。
  // 直线从墙这边到墙那边、穿墙点又落在墙身（连 0.9 m 余量）上，就绕到 gapX（路口 / 墙头外）
  // 过去，墙两侧各 1.5 m 一个折点。
  const ZWalls = [MID_TUNING.villageWall, MID_TUNING.yardCorner];
  for (let guard = 0; guard < 4; guard++) {
    let hit = null;
    for (const V of ZWalls) {
      if ((a.z - V.z) * (to.z - V.z) >= 0) continue;
      const t = (V.z - a.z) / (to.z - a.z), x = a.x + (to.x - a.x) * t;
      if (!V.runs.some(([x0, x1]) => x > x0 - .9 && x < x1 + .9)) continue;
      if (!hit || t < hit.t) hit = { t, wall: V };
    }
    for (const [x, segs] of [[W.westX, W.west], [W.eastX, W.east], [W.eastTallX, W.eastTall]]) {
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
    if (hit.wall) {
      const side = Math.sign(to.z - a.z);
      out.push({ x: hit.wall.gapX, z: hit.wall.z - side * 1.5 }, { x: hit.wall.gapX, z: hit.wall.z + side * 1.5 });
      a = out.at(-1);
      continue;
    }
    const gap = Gaps(hit.segs).reduce((best, g) => (Math.abs(g - hit.z) < Math.abs(best - hit.z) ? g : best));
    const side = Math.sign(to.x - a.x);
    out.push({ x: hit.x - side * 1.5, z: gap }, { x: hit.x + side * 1.5, z: gap });
    a = out.at(-1);
  }
  out.push({ x: to.x, z: to.z });
  return out;
}
