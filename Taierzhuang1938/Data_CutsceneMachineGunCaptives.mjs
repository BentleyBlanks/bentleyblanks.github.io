// 关中过场《空地上的三个人》—— 第一关 04 机枪阶段，玩家刚上机枪位时播一次。
//
// **纯数据，不 import three**（跨系统契约 2）。分镜字段口径见 docs/Data_CutsceneRedo.md §1，
// 本场的来源、触发、配音清单与验证结果见 docs/Data_MachineGunCaptivesCutscene.md。
//
// ---------------------------------------------------------------------------
// 这一场为什么存在
//
// 04 阶段的任务是「击退前方日军，掩护守军撤回」。在此之前，玩家打死的日军是
// 靶子，日军打死的守军是数字。这一场把镜头交给**望远镜那一端**：北面开阔地上
// 三个退路被截断、举手投降的川军，跪在地上被羞辱，然后被刺刀杀掉。玩家坐在
// 机枪后面，看得见，够不着 —— 机枪的射程到得了那里，但过场期间他没有扳机。
//
// 尺度参照《血战台儿庄》：克制、不给脸、刺刀那一下用剪影 + 黑场，
// 不做血腥特写、不用慢镜头、不给音乐。杀人的过程**听得见，看不见**。
//
// ---------------------------------------------------------------------------
// 史实纪律（Data_TengxianScript 的编剧红线在这里的落点）
//
//   · 场上七个人全是无名者，全部 real:false。本场**不承载任何事实断言** ——
//     它不说「滕县战役中日军屠杀过战俘」，它说的是「这三个人今天死在这里」。
//     skipCard 把这条边界写在卡片上，不许在正片文本里升级成史料。
//   · 日方口语称中国军队「支那兵」是 1938 年日方文书与部队用语（Data_Voice 日方
//     那一批的头注），全场**只出现一次**，且只出现在羞辱句里，不进任何旁白。
//   · 禁「八格牙路」（抗日神剧头号标志，见 forbiddenLines）。
//   · 日方台词的录音文本必须是**纯假名**（seed-audio 从文本判断语言），汉字写法
//     只记在本文件末尾 VOICE_LINES 的 kanji 字段里；屏幕字幕是中文。
//   · 中方台词是四川话口语（莫/屋头/龟儿子/记到起），说话的是被抓壮丁的兵，
//     不是英雄，不喊口号。
//
// ---------------------------------------------------------------------------
// 空间：**就地演**，不建独立布景
//
//   standalone:false + setOrigin [0,0,0] —— 坐标就是第一关（?whitebox=p012）的
//   世界坐标。舞台在机枪座 (0,-127.4) 正北偏东约 38 m 的开阔地上，
//   x 5.4–9.6 / z −165…−172：这一段是**前沿掩体列之间的通视走廊**。
//   Data_FirstLevelMissionFront.FRONT_COVER 的四排掩体按 x 分列建在
//   [-2.6,2.6]（Center）与 [7.3,12.8]（CenterEast）等列里，列与列之间是空的；
//   守军的 GuardWaitingCover（z=-146.25）与 WithdrawCover（z=-150）也各留了豁口。
//   机位到这一片的视线**逐排核对过**（文档里有那张表），不是随手挑的一块地。
//
//   **演员的 y 是「离地多高」，不是世界高度**（groundSnap:true）：真实地面由
//   Script_Cutscene 的 groundAt 钩子问共享地形采样器（跨系统契约 5）。这一片实测
//   起伏在 ±0.12 m 内，但硬编码绝对 y 的话，地形一改就是一排悬空或陷地的人。
//
// ---------------------------------------------------------------------------
// 作者动作库（另一路交付，合入前会回退成普通姿态，这是预期）
//
//   state.perform:"<ClipId>" 从该关键帧起播一段作者动作；perform:null 回普通姿态；
//   未知 id 只 warn。**每一帧 perform 旁边都同时写了等效的普通姿态**
//   （kneel / prone / melee / dying），所以合入前这一场也能读懂：
//   跪着的人是跪着的、被打倒的人趴着、被捅的人瘫下去 —— 只是没有那几下动作。
//   合入后只需要按实际 clip 长度微调秒数，机位、走位、台词、音频都不用动。
//
//   外观按骨架钉死（modelVariant）：俘虏 NRA02(1)/NRA05(4)，日军 IJA01(0)/02(1)/03(2)，
//   全部取自 Data_CharacterSelection 的选模清单，ValidateCutscene 会核对。

/** 本场演出区的锚点（世界坐标）。机位与走位都从这里算，改一处不用改十处。 */
const STAGE = Object.freeze({
  // 机位：机枪座正北的壕沿上方，抬到 1.9 m。
  //
  // **为什么不是枪口那个高度**：机枪座在 z=-128 的浅坑里（地面 −0.81），架起来的
  // 枪口只有 0.64；而这一段战场上守军自己的土袋墙顶在 0.90（WithdrawCover，z=-150）
  // 到 1.08（GuardWaitingCover，z=-146.25）之间。从枪口那个高度拍过去，四十米外
  // 跪着和趴着的人会被自家的胸墙齐腰切掉 —— 实拍第一轮就是这么发现的。
  // 抬到 1.9 之后两道胸墙的**顶**落在视线下方：它们仍然横在画面下缘当前景，
  // 但不再挡住任何一个人。1.9 m 世界高 ≈ 这一片地面（约 −0.1）上方 2.0 m。
  //
  // 这不是「换了个地方看」：从真正的枪位（眼高约 0.89）望过去，这三个人正好落在
  // 两道墙的豁口里（z=-146.25 的 x∈(−1.05,4.05)、z=-150 的 x∈(3.9,5.1)），
  // 玩家坐在枪后面是看得见他们的上半身的，只是下半身被自家胸墙切掉。
  // 机位世界坐标为推定值，登记在 presumed 里。
  camera: [0.4, 1.9, -132.5],
});

/**
 * 站位。三名俘虏跪成一排面朝机枪位，动手的日军站在各自目标的**正后方偏一点**。
 *
 * 站位不是摆好看的，是按作者动作的**实测触及距离**反推的
 *（Animation/MachineGunCaptives/Data_MachineGunCaptivesAnimation.md 的实测列）：
 *   踢     IjaKickPrisoner      脚尖前伸 0.63 / 离地 0.63  → 跪着的人的胸口
 *   枪托砸 IjaRifleButtStrike   落点前伸 0.797 / 高 0.646  → 跪着的人的头肩
 *   下刺   IjaBayonetDownThrust 刺刀尖前伸 1.41 / 高 0.79  → 跪着的人的上半身
 * 三种打击的高度都落在**跪姿**的躯干带上（跪姿胯 0.45、头 0.98），所以**每一次
 * 看得见的打击，受击者都必须是跪着的**。趴着的人身子只有 0.2–0.35 m 高，
 * 1.41/0.79 的下刺对他在几何上就够不着 —— 老兵那一刀因此只放在黑场里（镜 5）。
 *
 * 俯视误差（打击点到受击者躯干轴）实测全部 ≤ 0.16 m，算法与数在文档 §2.1。
 * 通视也逐排核过：z=-146.25 与 z=-150 两道守军胸墙在 1.9 m 机位下完全让开，
 * z=-158（Stub）与 z=-164（Ridge）按 x 分列，人都在列与列之间的走廊里。
 * 往东超过 x≈9.6 会被 Ridge 那一列挡住小腿，别再往东挪。
 */
const SPOT = Object.freeze({
  // 三名俘虏，面朝机枪位（+Z），跪成一排，间距 1.4 m。
  captiveOld: [6.2, -169.4],
  captiveYoung: [7.6, -169.4],
  captiveThird: [9.0, -169.4],
  // 军曹站在行列西南侧督战：背对机位，镜 4 的前景。他不动手，所以不按触及距离摆，
  // 但要**让开踢那一下的视线** —— 第一轮实拍他离机位只有 33 m、又正好压在日兵的
  // 屏幕位上，整个踢腿被他的背挡掉了。往西挪到与日兵差 0.032 rad（一个人宽的两倍半）。
  gunso: [4.0, -165.6],
  // 日兵（羞辱者）：押解位 → 踢老兵 → 指着骂 → 黑场里补老兵一刀。
  heiGuard: [5.7, -171.3],
  heiKick: [5.7, -170.0],     // 到老兵躯干 0.78 m，踢的触及 0.63（差 0.15）
  heiThrust: [5.7, -170.75],  // 到老兵躯干 1.44 m，下刺触及 1.41（差 0.03）；这一刀在黑场里
  // 日兵乙：小兵背后。枪托砸要 0.8 m、下刺要 1.41 m，所以他砸完要**退半步**再刺。
  // 站在**侧后方**而不是正后方：正后方的话动作整个被受击者挡住 —— 第一轮实拍
  // 就是这样，抡枪托那一下只看得见举过头顶的半截枪。偏出去约 0.017 rad
  // （200 mm 画面上一个人宽 0.0132 rad），砸与刺的侧影才露得出来。
  bingGuard: [8.55, -171.2],
  bingButt: [8.35, -169.95],  // 到小兵躯干 0.93 m，砸的触及 0.797（差 0.13）
  bingThrust: [8.55, -170.6], // 到小兵躯干 1.53 m，下刺触及 1.41（差 0.12）
  // 日兵丁：第三个人正后方 1.49 m（差 0.08），一步不用挪。他只有一刀，而那一刀
  // 在黑场里（35.36 s），所以不需要像日兵乙那样为了露侧影偏出去 —— 再往东就撞上
  // Ridge 那一列（x 8.25–9.75）的遮挡边界了。
  ding: [9.5, -170.8],
});

/** 押解进场的出发点（北面十米外，七个人同一段位移，队形不散）。 */
const FROM = Object.freeze({
  captiveOld: [7.5, -179.4],
  captiveYoung: [8.9, -179.4],
  captiveThird: [10.3, -179.4],
  gunso: [5.3, -175.6],
  hei: [7.0, -181.3],
  bing: [9.85, -181.2],
  ding: [10.8, -180.8],
});

/** 收场时往北走出画的落点（镜 6）。 */
const EXIT = Object.freeze({
  gunso: [3.4, -170.4],
  hei: [5.2, -175.5],
  bing: [8.05, -175.3],
  ding: [8.3, -175.6],
});

/** 面朝 (dx,dz) 的 ry（docs/Data_CutsceneRedo.md §1.3：写反了人就背对着走）。 */
const Facing = (dx, dz) => Number(Math.atan2(-dx, -dz).toFixed(4));
/** 从 a 走到 b 的朝向。 */
const Toward = (a, b) => Facing(b[0] - a[0], b[1] - a[1]);
/** 走一段的 moveSpeed：轨道速度必须 = moveSpeed×4.2，否则 LintCutscene 报滑步。 */
const MarchSpeed = (a, b, seconds) =>
  Number((Math.hypot(b[0] - a[0], b[1] - a[1]) / seconds / 4.2).toFixed(3));
/** 俘虏一律面朝机枪位（+Z）：被打倒的 CaptiveStruckDown 是**向前扑**，所以打他的人
 *  站在他正后方，他就朝着机位倒下去，观众看得见脸朝下那一下。 */
const FACE_GUN = Facing(0, 1);

const MARCH_END = 7.4;

/**
 * 举着手被押过来的那一段（三名俘虏与四名日军共用）。
 *
 * 三帧不是两帧：**两帧之间数值是线性插值的**，只写首尾的话 moveSpeed 会在整段
 * 七秒里从 0.32 一路滑到 0，而轨道位移是匀速的 —— 腿越迈越慢、人却照样往前飘。
 * 倒数第二帧把 moveSpeed 按住，最后 0.35 s 才收到 0，那一下就是「站住」。
 * 押解这一段刻意**不给 perform**：作者动作库里的站姿 clip 套在走路上会滑步，
 * 举手要等站定（7.4 s，也就是「站住！」喊完的那一顿）才切进去。
 */
function MarchIn(from, to, state) {
  const ry = Toward(from, to);
  const speed = MarchSpeed(from, to, MARCH_END);
  const hold = MARCH_END - 0.35;
  const at = (k) => [from[0] + (to[0] - from[0]) * k, 0, from[1] + (to[1] - from[1]) * k];
  return [
    { t: 0.0, pos: [from[0], 0, from[1]], ry, state: { moveSpeed: speed, ...state } },
    { t: hold, pos: at(hold / MARCH_END), ry, state: { moveSpeed: speed, ...state } },
    { t: MARCH_END, pos: [to[0], 0, to[1]], ry, state: { moveSpeed: 0, ...state } },
  ];
}

/** 站着不动的一帧（日军：刺刀一直上着）。 */
const IjaHold = (t, spot, face, perform, extra = {}) => ({
  t, pos: [spot[0], 0, spot[1]], ry: Toward(spot, face),
  state: { moveSpeed: 0, bayonetFixed: true, perform, ...extra },
});
/** 俘虏站定不动的一帧。 */
const NraHold = (t, spot, perform, extra = {}) => ({
  t, pos: [spot[0], 0, spot[1]], ry: FACE_GUN,
  state: { moveSpeed: 0, perform, ...extra },
});

export const CS_MachineGunCaptives = {
  id: "CS_MachineGunCaptives",
  title: "空地上的三个人",
  seconds: 44,
  // 关中过场：由 Script_FirstLevelMissionRuntime 在玩家第一次进机枪点位时
  // 经宿主的 PlayMidCutscene 播一次。脚下就是第一关正在跑的那张场。
  trigger: "duringLevel:FirstLevelP012Whitebox",
  standalone: false,
  setOrigin: [0, 0, 0],
  // 演员的 pos[1] 是离地高度，真实地面问共享采样器要（见文件头「空间」一节）。
  groundSnap: true,
  // 出图时脚下要建的是第一关白盒那一张场（?whitebox=p012），不是 ?phase=N 的切片。
  shotWhitebox: "p012",
  // 天不换：沿用第一关自己的天光。过场自己再套一遍会重烘天空，开头闪一块黑盘。
  fadeIn: 0.6,
  why: "让玩家在机枪后面看见自己够不着的那一段：三个举手投降的川军，跪在四十米外的空地上挨打挨骂、被刺刀杀掉，而他此刻只能看着。",

  people: {
    captive_old: {
      name: "", short: "老兵", real: false,
      note: "被截断退路的川军老兵，虚构无名。全场只说一句，说的不是口号",
    },
    captive_young: {
      name: "", short: "小兵", real: false,
      note: "被截断退路的川军新兵，虚构无名。跪着讨命，提的是屋头的老娘",
    },
    // 第三个人（cast 里的 captive_third）全场无台词，不进人物表 —— 人物表只管
    // 「谁开口时屏幕左边写谁」，登记一个永远不出现的名字只会多一行。
    ija_hei: {
      name: "", short: "日兵", real: false,
      note: "日军一等兵。台词走日语分支（VoiceBake 的假名支），字幕给中文",
    },
  },

  presumed: [
    {
      id: "machineGunCaptivesScene",
      value: "04 机枪阶段的关中过场：三名被押的川军在阵前空地被日军处决",
      note: "本场七个人全是虚构无名者，**不对应任何一次有记载的事件**。它表现的是 1938 年 3 月滕县阵前的一种可能，不作为史料引用；台词、人数、时刻全部为虚构",
    },
    {
      id: "machineGunCaptivesStage",
      value: "演出区 x 5.4–9.6 / z −165…−172，机位 (0.4, 1.9, -132.5)",
      note: "演出区落点与机位世界坐标均为本实现推定。选点依据是掩体列之间的通视走廊与守军土袋墙的豁口（见 docs/Data_MachineGunCaptivesCutscene.md 的视线表），不是史料",
    },
  ],

  // ---------------------------------------------------------------------------
  // 演员
  //
  // 俘虏 weapon:null（缴了械）。日军 Type38 + state.bayonetFixed（三八式上刺刀，
  // Script_Actor 每帧读这一位，数据侧不需要引擎改动）。
  //
  // `state.perform` 是作者动作（Script_CutscenePerformance）。每一帧 perform 旁边
  // 仍然写着等效的普通姿态（kneel / prone / melee），**不是给回退用的** ——
  // CutsceneDirector.ActorHeadY 表演期间照样按 crouch/kneel/prone 估头高，
  // 自动转头与听者俯仰都靠它；写掉了跪着的人会被按站姿算，头点飘到一米四。
  // ---------------------------------------------------------------------------
  cast: [
    // ── 老兵（西端）：最后一个跪、跪得最慢 → 挨一脚扑倒 → 从地上顶回去一句 ───────
    //    他挨的那一刀在镜 5 的黑场里：下刺的刺刀尖在 0.79 m 高，
    //    而趴着的人躯干只有 0.2–0.35 m —— 给得见的镜头就是「刺了个空」。
    {
      id: "captive_old", kind: "nra", weapon: null, seed: "captiveOld", modelVariant: 4,
      track: [
        ...MarchIn(FROM.captiveOld, SPOT.captiveOld, {}),
        NraHold(7.4, SPOT.captiveOld, "CaptiveHandsUpStand", { lookPitch: -0.1 }),
        // 喝令跪下（10.5）之后另外两个 12.9 就跪了，他拖到 13.6 才跪 —— 挨那一脚
        // 的理由就在这半秒里，不用多一句台词。
        NraHold(13.4, SPOT.captiveOld, "CaptiveHandsUpStand", { kneel: 0, lookPitch: -0.1 }),
        NraHold(13.6, SPOT.captiveOld, "CaptiveKneelHandsHead", { kneel: 1, lookPitch: -0.25 }),
        // 14.2 起踢，接触帧在 +0.42 s：CaptiveStruckDown 正好从这一刻起播，
        // 跪姿 → 前扑撑手 → 1.6 s 末帧脸朝下趴稳（头 0.98 → 0.21）。
        NraHold(14.6, SPOT.captiveOld, "CaptiveKneelHandsHead", { kneel: 1, lookPitch: -0.25 }),
        NraHold(14.62, SPOT.captiveOld, "CaptiveStruckDown", { kneel: 0, prone: 1, lookPitch: -0.2 }),
        NraHold(44.0, SPOT.captiveOld, "CaptiveStruckDown", { prone: 1, lookPitch: -0.2 }),
      ],
    },

    // ── 小兵（中间）：跪下 → 求饶 → 挨一枪托闭嘴 → 镜 4 唯一一刀捅在他身上 ───────
    {
      id: "captive_young", kind: "nra", weapon: null, seed: "captiveYoung", modelVariant: 1,
      track: [
        ...MarchIn(FROM.captiveYoung, SPOT.captiveYoung, {}),
        NraHold(7.4, SPOT.captiveYoung, "CaptiveHandsUpStand", { lookPitch: -0.15 }),
        NraHold(12.7, SPOT.captiveYoung, "CaptiveHandsUpStand", { kneel: 0, lookPitch: -0.15 }),
        NraHold(12.9, SPOT.captiveYoung, "CaptiveKneelHandsHead", { kneel: 1, lookPitch: -0.25 }),
        // 看见老兵被踢翻，他改成求饶（抬头、双手前伸）。
        NraHold(15.4, SPOT.captiveYoung, "CaptiveKneelPlead", { kneel: 1, reach: 0.45, lookPitch: -0.1 }),
        // 28.45 挨枪托（枪托落点前 0.797 / 高 0.646，正是跪着的人的头肩）：
        // 手收回脑后、头低下去，不再出声。这里不换成趴姿 —— 后面那一刀要他跪着。
        NraHold(28.45, SPOT.captiveYoung, "CaptiveKneelHandsHead", { kneel: 1, reach: 0, lookPitch: -0.35 }),
        // 34.16 中刀（刺刀尖前 1.41 / 高 0.79，跪姿上半身）：CaptiveStabbedCollapse
        // 从跪姿起，2.0 s 后末帧趴稳（头 1.02 → 0.26）。这是全片唯一看得见的一刀。
        NraHold(34.16, SPOT.captiveYoung, "CaptiveStabbedCollapse", { kneel: 1, prone: 1, dying: 1, lookPitch: -0.3 }),
        NraHold(44.0, SPOT.captiveYoung, "CaptiveStabbedCollapse", { prone: 1, dying: 1, lookPitch: -0.3 }),
      ],
    },

    // ── 第三个（东端）：全程无台词，跪着不动，最后在黑场里挨一刀 ────────────────
    {
      id: "captive_third", kind: "nra", weapon: null, seed: "captiveThird", modelVariant: 1,
      track: [
        ...MarchIn(FROM.captiveThird, SPOT.captiveThird, {}),
        NraHold(7.4, SPOT.captiveThird, "CaptiveHandsUpStand", { lookPitch: -0.1 }),
        NraHold(12.7, SPOT.captiveThird, "CaptiveHandsUpStand", { kneel: 0, lookPitch: -0.1 }),
        NraHold(12.9, SPOT.captiveThird, "CaptiveKneelHandsHead", { kneel: 1, lookPitch: -0.3 }),
        NraHold(35.36, SPOT.captiveThird, "CaptiveStabbedCollapse", { kneel: 1, prone: 1, dying: 1, lookPitch: -0.3 }),
        NraHold(44.0, SPOT.captiveThird, "CaptiveStabbedCollapse", { prone: 1, dying: 1, lookPitch: -0.3 }),
      ],
    },

    // ── 军曹：领着队伍走到行列西南侧，转身督战；下令那一下抬手一指 ────────────
    {
      id: "ija_gunso", kind: "ija", weapon: "Type38", seed: "ijaGunso", modelVariant: 0,
      track: [
        ...MarchIn(FROM.gunso, SPOT.gunso, { bayonetFixed: true }),
        // 走过头再转身：转过来之后背对机位，我们看见的是他的背与右肩（镜 4 的前景）。
        IjaHold(9.4, SPOT.gunso, SPOT.captiveYoung, "IjaBayonetGuard", { lookPitch: -0.15 }),
        IjaHold(30.2, SPOT.gunso, SPOT.captiveYoung, "IjaBayonetGuard", { reach: 0, lookPitch: -0.15 }),
        // 30.4 下令：换成指点的那一条（右手提枪、左手指过去）。perform→perform
        // 是 0.12 s 交叉淡入，落在「处理掉」出口那一顿上。
        IjaHold(30.4, SPOT.gunso, SPOT.captiveYoung, "IjaTauntGesture", { reach: 0.5, lookPitch: -0.1 }),
        IjaHold(33.2, SPOT.gunso, SPOT.captiveYoung, "IjaBayonetGuard", { reach: 0, lookPitch: -0.15 }),
        // 收场（镜 6 的切镜帧 38.0）：转身往北走，不看结果。
        IjaHold(38.0, SPOT.gunso, SPOT.captiveYoung, null, { lookPitch: 0 }),
        { t: 38.0001, pos: [SPOT.gunso[0], 0, SPOT.gunso[1]], ry: Toward(SPOT.gunso, EXIT.gunso),
          state: { moveSpeed: MarchSpeed(SPOT.gunso, EXIT.gunso, 6.0), bayonetFixed: true, lookPitch: 0 } },
        { t: 44.0, pos: [EXIT.gunso[0], 0, EXIT.gunso[1]], ry: Toward(SPOT.gunso, EXIT.gunso),
          state: { moveSpeed: MarchSpeed(SPOT.gunso, EXIT.gunso, 6.0), bayonetFixed: true, lookPitch: 0 } },
      ],
    },

    // ── 日兵（羞辱者）：迈一步踢倒老兵 → 站在他旁边指着骂 → 黑场里补一刀 ────────
    //    一个人从头折磨到底，比四个人各来一下更像真的：这不是一套流程，是一个人。
    {
      id: "ija_hei", kind: "ija", weapon: "Type38", seed: "ijaHei", modelVariant: 1,
      track: [
        ...MarchIn(FROM.hei, SPOT.heiGuard, { bayonetFixed: true }),
        IjaHold(9.2, SPOT.heiGuard, SPOT.captiveOld, "IjaBayonetGuard", { lookPitch: -0.2 }),
        // 13.4→14.1 迈一步上去（1.30 m / 0.7 s = 1.86 m/s，moveSpeed 按它配，
        // 不配的话 LintCutscene 直接报滑步）。站定处到老兵躯干 0.78 m，
        // 踢的脚尖前伸 0.63 —— 差 0.15 m，落点正在他胸口。
        { t: 13.4, pos: [SPOT.heiGuard[0], 0, SPOT.heiGuard[1]], ry: Toward(SPOT.heiGuard, SPOT.heiKick),
          state: { moveSpeed: MarchSpeed(SPOT.heiGuard, SPOT.heiKick, 0.7), bayonetFixed: true, perform: null, lookPitch: -0.2 } },
        { t: 14.1, pos: [SPOT.heiKick[0], 0, SPOT.heiKick[1]], ry: Toward(SPOT.heiKick, SPOT.captiveOld),
          state: { moveSpeed: 0, bayonetFixed: true, lookPitch: -0.4 } },
        // 14.2 起踢（1.2 s，接触帧 +0.42 s = 14.62，与老兵的 CaptiveStruckDown 对齐）。
        IjaHold(14.2, SPOT.heiKick, SPOT.captiveOld, "IjaKickPrisoner", { melee: 0.7, lookPitch: -0.5 }),
        IjaHold(15.4, SPOT.heiKick, SPOT.captiveOld, "IjaBayonetGuard", { melee: 0, lookPitch: -0.45 }),
        // 镜 3：站在趴着的人旁边指着骂（循环）。
        IjaHold(19.8, SPOT.heiKick, SPOT.captiveOld, "IjaBayonetGuard", { reach: 0, lookPitch: -0.45 }),
        IjaHold(20.0, SPOT.heiKick, SPOT.captiveOld, "IjaTauntGesture", { reach: 0.5, lookPitch: -0.5 }),
        IjaHold(34.8, SPOT.heiKick, SPOT.captiveOld, "IjaTauntGesture", { reach: 0.5, lookPitch: -0.5 }),
        // 黑场里补老兵那一刀：先退半步到 1.44 m（下刺的触及 1.41），35.6 起刺，
        // 接触帧 36.36 —— 整段都在镜 5 的全黑里，趴着的人与 0.79 m 高的刺刀尖
        // 那点高度差因此永远不会被看见。
        { t: 34.9, pos: [SPOT.heiKick[0], 0, SPOT.heiKick[1]], ry: Toward(SPOT.heiKick, SPOT.heiThrust),
          state: { moveSpeed: MarchSpeed(SPOT.heiKick, SPOT.heiThrust, 0.5), bayonetFixed: true, perform: null, reach: 0, lookPitch: -0.3 } },
        { t: 35.4, pos: [SPOT.heiThrust[0], 0, SPOT.heiThrust[1]], ry: Toward(SPOT.heiThrust, SPOT.captiveOld),
          state: { moveSpeed: 0, bayonetFixed: true, lookPitch: -0.6 } },
        IjaHold(35.6, SPOT.heiThrust, SPOT.captiveOld, "IjaBayonetDownThrust", { melee: 0.9, lookPitch: -0.7 }),
        IjaHold(38.0, SPOT.heiThrust, SPOT.captiveOld, null, { melee: 0, lookPitch: 0 }),
        { t: 38.0001, pos: [SPOT.heiThrust[0], 0, SPOT.heiThrust[1]], ry: Toward(SPOT.heiThrust, EXIT.hei),
          state: { moveSpeed: MarchSpeed(SPOT.heiThrust, EXIT.hei, 6.0), bayonetFixed: true, lookPitch: 0 } },
        { t: 44.0, pos: [EXIT.hei[0], 0, EXIT.hei[1]], ry: Toward(SPOT.heiThrust, EXIT.hei),
          state: { moveSpeed: MarchSpeed(SPOT.heiThrust, EXIT.hei, 6.0), bayonetFixed: true, lookPitch: 0 } },
      ],
    },

    // ── 日兵乙：小兵背后。枪托砸要 0.8 m、下刺要 1.41 m，所以他砸完退半步再刺 ────
    {
      id: "ija_bing", kind: "ija", weapon: "Type38", seed: "ijaBing", modelVariant: 2,
      track: [
        ...MarchIn(FROM.bing, SPOT.bingGuard, { bayonetFixed: true }),
        IjaHold(9.0, SPOT.bingGuard, SPOT.captiveYoung, "IjaBayonetGuard", { lookPitch: -0.3 }),
        // 26.8→27.5 上前半步（1.05 m / 0.7 s）。站定处到小兵躯干 0.90 m，
        // 枪托落点前伸 0.797 —— 差 0.10 m，砸在他头肩上。
        { t: 26.8, pos: [SPOT.bingGuard[0], 0, SPOT.bingGuard[1]], ry: Toward(SPOT.bingGuard, SPOT.bingButt),
          state: { moveSpeed: MarchSpeed(SPOT.bingGuard, SPOT.bingButt, 0.7), bayonetFixed: true, perform: null, lookPitch: -0.3 } },
        { t: 27.5, pos: [SPOT.bingButt[0], 0, SPOT.bingButt[1]], ry: Toward(SPOT.bingButt, SPOT.captiveYoung),
          state: { moveSpeed: 0, bayonetFixed: true, lookPitch: -0.5 } },
        // 27.6 起砸（1.4 s：0.50 s 枪托抡过头顶、0.85 s 落点、1.40 s 收回持枪式）。
        // 接触帧 28.45 与小兵换成抱头的那一帧对齐。
        IjaHold(27.6, SPOT.bingButt, SPOT.captiveYoung, "IjaRifleButtStrike", { melee: 0.85, lookPitch: -0.6 }),
        IjaHold(29.0, SPOT.bingButt, SPOT.captiveYoung, "IjaBayonetGuard", { melee: 0, lookPitch: -0.45 }),
        // 32.4→33.0 退半步到 1.53 m（下刺触及 1.41）。
        { t: 32.4, pos: [SPOT.bingButt[0], 0, SPOT.bingButt[1]], ry: Toward(SPOT.bingButt, SPOT.bingThrust),
          state: { moveSpeed: MarchSpeed(SPOT.bingButt, SPOT.bingThrust, 0.6), bayonetFixed: true, perform: null, lookPitch: -0.4 } },
        { t: 33.0, pos: [SPOT.bingThrust[0], 0, SPOT.bingThrust[1]], ry: Toward(SPOT.bingThrust, SPOT.captiveYoung),
          state: { moveSpeed: 0, bayonetFixed: true, lookPitch: -0.6 } },
        // 33.4 起刺（1.6 s，刺入 0.76 s、保持到 1.06 s 再抽回）。接触帧 34.16 是
        // 这一场唯一看得见的一刀：镜 4 的黑场从 34.2 才开始收。
        IjaHold(33.4, SPOT.bingThrust, SPOT.captiveYoung, "IjaBayonetDownThrust", { melee: 0.9, lookPitch: -0.7 }),
        IjaHold(38.0, SPOT.bingThrust, SPOT.captiveYoung, null, { melee: 0, lookPitch: 0 }),
        { t: 38.0001, pos: [SPOT.bingThrust[0], 0, SPOT.bingThrust[1]], ry: Toward(SPOT.bingThrust, EXIT.bing),
          state: { moveSpeed: MarchSpeed(SPOT.bingThrust, EXIT.bing, 6.0), bayonetFixed: true, lookPitch: 0 } },
        { t: 44.0, pos: [EXIT.bing[0], 0, EXIT.bing[1]], ry: Toward(SPOT.bingThrust, EXIT.bing),
          state: { moveSpeed: MarchSpeed(SPOT.bingThrust, EXIT.bing, 6.0), bayonetFixed: true, lookPitch: 0 } },
      ],
    },

    // ── 日兵丁：第三个人背后 1.52 m（下刺触及 1.41），一步不用挪 ────────────────
    {
      id: "ija_ding", kind: "ija", weapon: "Type38", seed: "ijaDing", modelVariant: 0,
      track: [
        ...MarchIn(FROM.ding, SPOT.ding, { bayonetFixed: true }),
        IjaHold(9.0, SPOT.ding, SPOT.captiveThird, "IjaBayonetGuard", { lookPitch: -0.3 }),
        IjaHold(34.6, SPOT.ding, SPOT.captiveThird, "IjaBayonetGuard", { melee: 0, lookPitch: -0.3 }),
        // 34.6 起刺，接触帧 35.36 —— 已经在镜 5 的全黑里，只听得见。
        IjaHold(34.62, SPOT.ding, SPOT.captiveThird, "IjaBayonetDownThrust", { melee: 0.9, lookPitch: -0.7 }),
        IjaHold(38.0, SPOT.ding, SPOT.captiveThird, null, { melee: 0, lookPitch: 0 }),
        { t: 38.0001, pos: [SPOT.ding[0], 0, SPOT.ding[1]], ry: Toward(SPOT.ding, EXIT.ding),
          state: { moveSpeed: MarchSpeed(SPOT.ding, EXIT.ding, 6.0), bayonetFixed: true, lookPitch: 0 } },
        { t: 44.0, pos: [EXIT.ding[0], 0, EXIT.ding[1]], ry: Toward(SPOT.ding, EXIT.ding),
          state: { moveSpeed: MarchSpeed(SPOT.ding, EXIT.ding, 6.0), bayonetFixed: true, lookPitch: 0 } },
      ],
    },
  ],

  // ---------------------------------------------------------------------------
  // 分镜
  //
  // 机位全部钉在机枪座这一侧，靠焦距而不是走位改变距离感 —— 这一场的前提是
  // 「他只能看」。135 mm 是「看见了」，200 mm 是「看清楚了」，没有任何一镜
  // 走到空地上去。切镜点同时是几处 perform 的起点：普通姿态→作者动作是硬切，
  // 放在切镜帧上就看不出接缝（docs/Data_CutsceneRedo.md §1.3）。
  // ---------------------------------------------------------------------------
  shots: [
    {
      n: 1, seconds: 10, focalMm: 200,
      note: "机枪位长焦北望：三个举着手的人被四名日军押进空地。先从土坎上露出半身，走近才看全。7.4 s 站住，举手过头（CaptiveHandsUpStand，两手高出头骨 0.36）。罗班长在画外喊住玩家，不许开枪。",
      camera: {
        from: STAGE.camera,
        // 锚在第三名俘虏身上，机位不动、镜头跟着他往南来（不用逐秒反算坐标）。
        lookActor: "captive_third", look: [-1.7, 1.0, 0],
        shake: 0.03,
      },
      lines: [
        { at: 0.6, seconds: 4.6, who: "luo", tier: "虚构", off: true,
          voiceCue: "ch1_luo_28", text: "莫开枪！北边那几个是我们的人。" },
        { at: 5.6, seconds: 3.2, who: "ija_gunso", tier: "虚构",
          voiceCue: "ch1_ija_gunso_01", text: "站住！手举起来！" },
      ],
      sfx: [
        { at: 0.4, name: "explosionFar", volume: 0.16 },
        { at: 6.4, name: "footstepDirt", volume: 0.18 },
      ],
    },
    {
      n: 2, seconds: 10, focalMm: 200,
      note: "喝令跪下、抱头。两个 12.9 s 就跪了，老兵拖到 13.6 s；日兵上前一步，14.2 s 起脚，14.62 s 接触（脚尖前伸 0.63 / 高 0.63，正是跪着的人的胸口），老兵前扑趴倒。小兵改成跪着讨命。人物占画面高度约四成，不给脸的特写。",
      camera: {
        from: STAGE.camera,
        lookActor: "captive_young", look: [-1.0, 0.7, 0.2],
        shake: 0.035,
      },
      shakeAt: [{ at: 4.62, seconds: 0.5, amount: 0.22 }],
      lines: [
        { at: 0.5, seconds: 3.5, who: "ija_gunso", tier: "虚构",
          voiceCue: "ch1_ija_gunso_02", text: "跪下！手抱到脑壳上！" },
        { at: 5.4, seconds: 4.2, who: "captive_young", tier: "虚构",
          voiceCue: "ch1_captive_young_01", text: "莫杀我……我屋头还有老娘。" },
      ],
      sfx: [
        { at: 4.62, name: "impactFlesh", volume: 0.34 },
        { at: 5.1, name: "bodyFall", volume: 0.4 },
        { at: 8.2, name: "explosionFar", volume: 0.14 },
      ],
    },
    {
      n: 3, seconds: 10, focalMm: 200,
      note: "日兵站在趴着的老兵旁边指着骂（IjaTauntGesture）；老兵从地上顶回去一句；另一个日兵 27.6 s 把枪托翻过头顶，28.45 s 砸在跪着的小兵头肩上（落点前伸 0.797 / 高 0.646），小兵收手抱头、不再出声。刺刀这一镜就在枪上了，剪影里看得见那一截直线。",
      camera: {
        from: STAGE.camera,
        lookActor: "captive_old", look: [0.4, 0.85, -0.9],
        shake: 0.035,
      },
      shakeAt: [{ at: 8.45, seconds: 0.45, amount: 0.25 }],
      lines: [
        { at: 0.4, seconds: 3.4, who: "ija_hei", tier: "虚构",
          voiceCue: "ch1_ija_hei_01", text: "站起来啊，支那兵。" },
        { at: 3.8, seconds: 4.2, who: "captive_old", tier: "虚构",
          voiceCue: "ch1_captive_old_01", text: "龟儿子……你们也有屋头人。" },
        { at: 8.0, seconds: 2.0, who: "ija_hei", tier: "虚构",
          voiceCue: "ch1_ija_hei_02", text: "闭嘴！" },
      ],
      sfx: [
        { at: 8.45, name: "impactFlesh", volume: 0.38 },
        { at: 8.62, name: "impactDirt", volume: 0.2 },
      ],
    },
    {
      n: 4, seconds: 5, focalMm: 200,
      note: "军曹的背影在前景下令，跪着的人在他身后。日兵乙退半步到 1.53 m，33.4 s 起刺，34.16 s 刺刀尖进小兵上半身（前伸 1.41 / 高 0.79）——全片唯一看得见的一刀，也是唯一一个还跪着的受刀者。黑场从 4.2 s 起收，到本镜末（35.0 s）全黑。不给近景、不给血。",
      camera: {
        from: STAGE.camera,
        // 锚在军曹身上，看点偏到他右后方的行列：他占画面左半边，人在他身后。
        lookActor: "ija_gunso", look: [2.4, 1.0, -3.0],
        shake: 0.03,
      },
      // blackOutAt 是**从这一秒起线性收到本镜结束**（_ApplyBlack），不是「这一秒黑」。
      // 所以这一镜刻意只剩 0.8 s 可收：给到 8 秒的话黑得比杀人还慢，第一版实拍
      // 到 34.6 s 画面还是全亮的。剩下的黑由下一镜的 black:true 硬接。
      // 4.2 = 34.2 s：正好在 34.16 s 那一刀**之后**起收，接触那一帧还是全亮的。
      blackOutAt: 4.2,
      lines: [
        { at: 0.4, seconds: 3.4, who: "ija_gunso", tier: "虚构",
          voiceCue: "ch1_ija_gunso_03", text: "处理掉。一个不留。" },
      ],
      sfx: [
        { at: 4.16, name: "bayonetHit", volume: 0.42 },
        { at: 4.3, name: "impactFlesh", volume: 0.3 },
      ],
    },
    {
      n: 5, seconds: 3, focalMm: 200,
      note: "全黑。小兵倒地、第三人那一刀（35.36 s）、趴着的老兵那一刀（36.36 s）全在黑里只有声音 —— 下刺的刺刀尖在 0.79 m 高，趴着的人身子只有 0.2–0.35 m 高，那一刀在几何上本来就够不着，所以它只能在这儿。最后 1 s 什么声音都没有。",
      black: true,
      camera: {
        from: STAGE.camera,
        lookActor: "ija_gunso", look: [2.4, 1.0, -3.0],
      },
      sfx: [
        { at: 0.2, name: "bodyFall", volume: 0.36 },
        { at: 0.36, name: "bayonetHit", volume: 0.38 },
        { at: 0.52, name: "impactFlesh", volume: 0.26 },
        { at: 1.1, name: "bodyFall", volume: 0.34 },
        { at: 1.36, name: "bayonetHit", volume: 0.36 },
        { at: 1.9, name: "bodyFall", volume: 0.3 },
      ],
    },
    {
      n: 6, seconds: 6, focalMm: 135,
      note: "从黑里淡回机枪位这一侧的视角：空地上三个伏着的影子（两个是 CaptiveStabbedCollapse 的末帧，老兵是 CaptiveStruckDown 的末帧），日军往北走出画。机位一动不动，没有音乐。罗班长在画外说一句就完。",
      fadeIn: 1.0,
      camera: {
        from: STAGE.camera,
        look: [7.6, 0.35, -170.0],
        shake: 0.02,
      },
      lines: [
        { at: 1.0, seconds: 4.8, who: "luo", tier: "虚构", off: true,
          voiceCue: "ch1_luo_29", text: "顺子，记到起。今天这个，记到起。" },
      ],
      sfx: [
        { at: 0.3, name: "explosionFar", volume: 0.18 },
        { at: 2.6, name: "footstepDirt", volume: 0.14 },
      ],
    },
  ],

  // Esc 跳过时补出来的卡片：内容不许因为跳过而丢，边界也不许因为跳过而丢。
  skipCard: {
    title: "空地上的三个人",
    lines: [
      { tier: "虚构", text: "阵地正北四十米的空地上，三名退路被截断的川军举手投降。日军命他们跪下，打倒、骂过之后用刺刀杀害。" },
      { tier: "虚构", text: "机枪的射程到得了那里。看得见，够不着。" },
      { tier: "虚构", text: "本段为虚构情节，七个人全是无名者，不对应任何一次有记载的事件，也不作为史料引用。" },
    ],
  },

  // 神剧红线。另外两条（日方自称的敬语式番号、中方对日军的敬称）不写进这张表：
  // 它们本身就是不许出现的字，登记在表里等于把它们搬进了本场的字表。
  forbiddenLines: ["八格牙路"],
};

// ===========================================================================
// 本场配音
//
// 由 Data_Voice 并进总表（key = ch1_<who>_<NN>，与第一关同一条章节语音通道），
// 烘焙走 Script_VoiceBake（`--chapter=1` 或逐条点名），dur 由它写回这里。
//
// **日方三名角色的 text 必须是纯假名**：seed-audio 从文本本身判断语言，
// 写成汉字的「始末しろ」会被当中文念。汉字写法只留在 kanji 字段（文档用），
// 屏幕上的中文字幕在上面 shots[].lines[].text 里。
// ===========================================================================
export const VOICE_LINES = [
  // 罗班长：开头按住玩家的扳机，结尾一句。两句都在画外（off:true），
  // 场上那个真的罗班长在机位背后，不进过场 cast。
  { key: "ch1_luo_28", who: "luo", delivery: "shout", dur: 2.79, text: "莫开枪！北边那几个是我们的人。" },
  { key: "ch1_luo_29", who: "luo", delivery: "normal", dur: 4.29, text: "顺子，记到起。今天这个，记到起。" },

  // 川军俘虏：一个求饶，一个硬顶。都不是口号。
  { key: "ch1_captive_young_01", who: "captive_young", delivery: "weak", dur: 3.00, text: "莫杀我……我屋头还有老娘。" },
  { key: "ch1_captive_old_01", who: "captive_old", delivery: "weak", dur: 3.74, text: "龟儿子……你们也有屋头人。" },

  // 日军军曹（三句：喝止、喝令跪下、下令处决）。
  { key: "ch1_ija_gunso_01", who: "ija_gunso", delivery: "shout", dur: 1.59, side: "ija",
    kanji: "止まれ！手を上げろ！", cn: "站住！手举起来！", text: "とまれ！てをあげろ！" },
  { key: "ch1_ija_gunso_02", who: "ija_gunso", delivery: "shout", dur: 2.91, side: "ija",
    kanji: "跪け！手を頭の後ろへ！", cn: "跪下！手抱到脑壳上！", text: "ひざまずけ！てをあたまのうしろへ！" },
  { key: "ch1_ija_gunso_03", who: "ija_gunso", delivery: "normal", dur: 2.61, side: "ija",
    kanji: "始末しろ。一人も残すな。", cn: "处理掉。一个不留。", text: "しまつしろ。ひとりものこすな。" },

  // 日军一等兵（羞辱者）。「シナへい」是 1938 年日方口语对中国军队的称呼，
  // 全场只出现这一次，只在羞辱句里。
  { key: "ch1_ija_hei_01", who: "ija_hei", delivery: "shout", dur: 1.56, side: "ija",
    kanji: "立てよ、支那兵。", cn: "站起来啊，支那兵。", text: "たてよ、シナへい。" },
  { key: "ch1_ija_hei_02", who: "ija_hei", delivery: "shout", dur: 0.69, side: "ija",
    kanji: "黙れ！", cn: "闭嘴！", text: "だまれ！" },
];
