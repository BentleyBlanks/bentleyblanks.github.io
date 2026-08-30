// Data_MissionCh1.mjs — 第一关｜往南的路。规格：docs/Data_MissionRemake.md §2（正文）与 §10（契约）。
// 本文件由基建批建骨架、章节内容批填实。不许 import three，不许 Math.random。
//
// ---------------------------------------------------------------------------
// 场景基底：TengxianField（城外原野）
//
// 津浦路路基 + 路西村庄 + 南向大车路那一片内容由
// Script_TengxianOutfield.OUTFIELD_SCENES["CH1_NanLu"] 生成（河堤、土坎、散兵胸墙、
// 坟头、光秃乔木、麦田与田埂、村落、铁路路基）。**那张表按 levelId 取**，
// 所以本章 id 改了，那边的键也跟着改了 —— 两处要一起看。
//
// 借位：史料里的界河在城北约 20 km、北沙河约 8 km，本作把城外战场就近借位到
// 城外一公里内的原野上（既有做法，见 Script_TengxianOutfield 头注与 PRESUMED_OUTFIELD）。
// 「往南」在这片地上是 +Z 方向：路基阵地在北（z=-180），大车路一路向南（z→+130），
// 南路被截断之后折回西门（-330, 0）。
//
// bounds 与 spawn 沿用旧 L1_Beishahe 那一片（出生点通行已由 BootTest 的 spawnRun 验过）。
//
// ---------------------------------------------------------------------------
// 为什么是 **七** 个路标（骨架给的是六个）
//
// 换关的判据是「目标链走完」（Script_Main：objectiveIndex >= objectiveCount 就
// AdvanceLevel），而 AdvanceLevel 第一件事是 story.FlushTail() —— **FlushTail 会
// 跳过所有 line / shout**。也就是说：挂在**最后一个**路标上的对白，玩家一踏进圈
// 就被吞掉，一句都听不见。
//
// §0 的六个验收结果里有一条是「一关结尾伤员只说『后头抬高点，腿莫擦地』，顺子答
// 『晓得』」—— 那正好是全关最后两句对白。挂在最后一个路标上等于**验收项目本身
// 播不出来**。所以这里把「战术撤回」单独拆成一个路标 C1_Fallback：
//   · 阶段十（掩护担架后撤）挂在 C1_Fallback 上；
//   · 阶段十一（结尾那两句）走 C1_Fallback 之后的 delay 链，在**走回西门的路上**说完；
//   · 最后一个路标 C1_BackToWall 上只剩 objective 与 end 旁白 —— 这两类 FlushTail 照倒。
// 从 C1_Fallback 到 C1_BackToWall 有 195 m，结尾那一串 delay 合计约 30 s，跑过去
// 也要 45 s 以上，留了余量。
//
// 选点两条硬约束（都是实测逼出来的）：
//   · **离出生点远于自己的半径**：圈罩住出生点的话，目标链会在开局第一帧
//     自己推进一格（出图与开机冒烟会莫名其妙换到下一章）；
//   · **别把圈心压在津浦路路基的中心线（x=-480）上**：Player.Spawn 先问
//     physics.FindFreeSpot「这儿站得下人吗」，站不下就把人往外挪；
//     圈心落在路基里、圈又开得小，人就被挪到圈外，目标链一辈子推不动
//     （PlayTest「走进路标圈里目标链会推进」那条就是这么红的）。
//
// ---------------------------------------------------------------------------
// ENGINE_REQUEST —— 本关需要的引擎能力（契约 §10.4：内容批只登记，集成批统一实现）
//
// 编号后面的括号是**策划案的阶段号**（docs/Data_MissionRemake.md §2）。
// beats 里对应的触发式一律写成 `event:<名字>`，名字与下面 EVENTS 表逐条对应。
//
// 1. 节奏硬指标（阶段一）——「取得控制 20—30 秒出现敌情，1 分钟内开枪」
//    这一条不许交给 event 兜底：beats 里第一条敌情（ch1_luo_02「前头田坎有人影！」）
//    钉死在 delay 链上，落在关内约 21 s。**引擎侧要把第一名日军侦察兵的出现时刻
//    锁在关内 20—24 s、出现在玩家正前方 60—90 m 的田坎线上**，否则玩家听见喊话
//    却看不见人。第一次可射击窗口不得晚于关内 30 s。
//
// 2. escortColumn（阶段二、三）—— 武装后送队
//    队伍 = 2 副担架 + 4 名担架员 + 2 名持枪护卫 + 可行走伤兵若干 + 撤离百姓。
//    · 阶段二：交通壕后侧的木门要真的打开、两副担架抬出来，然后队列沿大车路南下；
//      **不许传送**（策划案原文），玩家跟着走。
//    · 队列速度要能被脚本压到玩家的搬运态速度（Script_Carry.CARRY_KINDS.stretcher
//      的 speedScale 0.42）以下，不然阶段七玩家抬着担架会被自己人甩掉。
//    · 百姓用现成的 civilian tzm 分身；妇孺老人必须在队里看得见 —— 阶段六「担架、
//      女人、娃儿都照打」是靠玩家**自己看见**成立的，不是靠台词。
//
// 3. ammoResupply（阶段一、三）—— 给机枪组补弹 / 搜废弃阵地补弹
//    阶段一的箱子是 Script_Carry 的 "ammoCrate"（Begin("ammoCrate")→送到机枪位）；
//    阶段三是废弃阵地上的静态补给点，交互一次补满桥夹。两处都要有玩家动作，
//    §0「所有低强度段落必须包含玩家动作」。
//
// 4. aircraftStrafe（阶段五、六、八）—— **两轮航线，第二轮转向人群**
//    这是本关的核心演出，三条航线必须分开：
//      ① 第一轮（阶段五）：沿铁路/大车路攻击**车辆**，不打队列。玩家可以开枪，
//         步枪威胁不到它 —— 命中判定要真的存在但不允许击落（否则玩家会以为是 bug）。
//         Signal("AircraftFirstPass")。
//      ② 转向（阶段六）：飞机拉起、**转弯、降高**，重新对准大车路上的人群。
//         转向那一刻起飞机必须在玩家的自由视角里看得见（§2「日机扫射必须在自由视角中
//         亲眼看见」，本关不设开场过场就是为了这个）。Signal("AircraftTurnCrowd")。
//         第二轮扫射的**弹线要追人群**：着弹点沿队列前进方向推进，不是固定扫一条直线。
//         白布担架 / 药箱 / 妇孺必须在弹线经过的画面里。
//      ③ 第三次进入攻击航线（阶段八）：只做一次，配合 stretcherRelease。
//    航线之间要有可听见的引擎声由远及近（Data_SfxSources 已有飞机声配方）。
//
// 5. stretcherCarry（阶段七）—— 接替担架
//    一名担架员中弹 → 罗班长喊「顺子，接后头！」→ 玩家按交互进入搬运态：
//    Script_Carry.CarrySystem.Begin("stretcher", { partner: <前端担架员>, canDrop: true })。
//    搬运态持续 **20—30 s**（策划案原文）：减速、不能用枪、可以左右看、可以主动放下。
//    进入搬运态时 Signal("StretcherHandoff") 之后的那一簇台词已经在 beats 里排好了。
//
// 6. stretcherRelease（阶段八）—— 顺子松手
//    飞机第三次进入航线时给提示【扑入路沟】（HUD 提示由引擎出，beats 里那条
//    type:"system" 只是没接线时的字幕兜底）。玩家执行躲避后：
//      · CarrySystem.ForceRelease("dive") —— **手是先松开的**，这是剧情要求，
//        不是玩家操作失误；顺子本能松手、护头、第一人称扑进沟（1—2 s，**不切三人称**）；
//      · 担架侧翻、伤员滑落，罗班长与士兵把伤员拖进沟（NPC 演出）；
//      · **不躲则被击倒并从数秒前重来** —— 需要一个「几秒前」的检查点，
//        不是整关重来，也不是常规 respawn（常规 respawn 会把玩家放到路标后方 24 m，
//        Script_Main 那段注释里写着，会把这一拍整个跳过去）。
//    躲避完成后立刻恢复战斗控制：地面日军同时接近。
//
// 7. LEVEL_CUES 缺 CH1_NanLu 表 —— **已解决**（INT1 + INT2）
//    INT1 把 LEVEL_CUES 改成由各章 `EVENTS` 自动构建，本章六条判据直接生效；
//    INT2 另补了五条**走位闸**（AtVillage / AtCulvert / AtSouthRoad / AtDitch /
//    AtFallback），把原来挂 `zone:` 的十条 beat 改挂 `event:`。
//    判据是「走进那个圈 **或者** 时刻到了」——正片行为一模一样，
//    而回归里一条 zone 不再吃 MAX_WAIT.zone = 95 s（五条就是 475 s）。
//    **开场那一段（21.8 s 出敌情、一分钟内开枪）仍然全走 delay，一条都没动。**
//    三条航线、后送队、接替担架、松手与倒带的摆点在
//    `Script_MissionSetpieces.SETPIECES.CH1_NanLu`。
//
// 8. 惨叫与纯痛呼**不写 TTS 行**
//    担架员中弹的那一声、伤员滑落时的痛呼、百姓的哭喊，全部走实录素材
//   （Data_Voice 里 hurt_scream 那条 `sample:` 的做法，见 docs/Data_AudioAssets.md）。
//    本文件的 VOICE_LINES 里只有成句的台词，一条非语言音都没有 —— 这是有意的。
// ---------------------------------------------------------------------------

/**
 * 本关的事件线（beats 里 `event:<name>` 用的名字）。
 *
 * 这张表是给集成批看的**契约**：signal 一栏写「谁在什么时刻推」，
 * fallback 一栏写「推不出来的时候 Script_Story.LEVEL_CUES 该怎么兜」。
 * 纯数据，不被运行时读取；照抄进 LEVEL_CUES 即可。
 */
export const EVENTS = [
  // ── 走位闸（集成批 INT2 新增）────────────────────────────────────────────
  // 本关的五拍走位原来挂在 `zone:` 上。正片里那样是对的（走到了就播），
  // 但 Script_PlayTest 的剧本长跑把关卡钉住、玩家不动，五条 zone 各吃一次
  // MAX_WAIT.zone = 95 s —— 475 s，本关二十分钟的九成预算只剩四十几秒余量，
  // 一次意外的重生就会把结尾那两句（§0 验收结果之二）挤到关外。
  // 改挂 event 之后判据是「走进那个圈 **或者** 时刻到了」：**正片行为一模一样**
  //（zone 那一支立刻成立），回归里则永远不会空等一百秒。
  //
  // ★ 开场那一段（关内 21.8 s 出敌情、一分钟内开枪）**仍然全走 delay**，
  //   一条都没有动 —— 那是验收指标，不许取决于玩家有没有走进某个圈。
  { name: "AtVillage", stage: 1, what: "退进村庄外围，靠田坎顶住",
    fallback: '(c) => c.zone === "C1_Village" || c.levelTime > 95' },
  { name: "AtCulvert", stage: 3, what: "跟随后送队过涵洞，沿大车路向南",
    fallback: '(c) => c.zone === "C1_Culvert" || c.levelTime > 215' },
  { name: "AtSouthRoad", stage: 4, what: "地面截击 —— 日军小股侧面接近",
    fallback: '(c) => c.zone === "C1_SouthRoad" || c.levelTime > 335' },
  { name: "AtDitch", stage: 5, what: "路沟与炮损民房；日机第一次掠过就在这一带",
    fallback: '(c) => c.zone === "C1_Ditch" || c.levelTime > 440' },
  { name: "AtFallback", stage: 10, what: "战术撤回 —— 掩护担架后撤，断住追兵",
    fallback: '(c) => c.zone === "C1_Fallback" || c.levelTime > 720' },
  {
    name: "EscortCall", stage: 2,
    what: "后方喊「缺两个护送伤兵的！」，交通壕后侧木门打开、两副担架抬出",
    signal: "外围阵地这一波打退（附近日军清空）且玩家回到交通壕一线时推",
    fallback: "(c) => c.objectiveIndex >= 2 || c.levelTime > c.levelSeconds * 0.16",
  },
  {
    name: "AircraftFirstPass", stage: 5,
    what: "日机第一次掠过，沿路攻击车辆；队伍加速，玩家开枪也打不下来",
    signal: "后送队进入路沟民房一带（C1_Ditch）之后由 aircraftStrafe 第一轮起飞时推",
    fallback: '(c) => c.zone === "C1_Ditch" || c.levelTime > c.levelSeconds * 0.46',
  },
  {
    name: "AircraftTurnCrowd", stage: 6,
    what: "日机拉起、转弯、降高，重新对准担架与百姓；第二轮弹线追人群",
    signal: "aircraftStrafe 第二轮进入航线、飞机已在玩家视野内时推",
    fallback: "(c) => c.levelTime > c.levelSeconds * 0.52",
  },
  {
    name: "StretcherHandoff", stage: 7,
    what: "一名担架员中弹，玩家接替担架后端进入搬运态",
    signal: "CarrySystem.Begin(\"stretcher\") 返回 true（真的抬起来了）那一帧推",
    fallback: "(c) => c.levelTime > c.levelSeconds * 0.60",
  },
  {
    name: "DiveCue", stage: 8,
    what: "日机第三次进入攻击航线，提示【扑入路沟】；躲避后强制松手、担架侧翻",
    signal: "搬运态满 20 s 且第三条航线就位时推（提示与 ForceRelease 同一拍）",
    fallback: "(c) => c.levelTime > c.levelSeconds * 0.66",
  },
  {
    name: "SouthCut", stage: 9,
    what: "飞机走后南侧连续枪声，日军占据道路出口 —— 南路被截断",
    signal: "南路出口的日军小组就位、玩家一次试探被打回来时推",
    fallback: "(c) => c.objectiveIndex >= 5 || c.levelTime > c.levelSeconds * 0.74",
  },
];

export const CHAPTER = {
  id: "CH1_NanLu",
  title: "第一关 · 往南的路",
  place: "滕县城外 · 津浦路路基、路西村庄、南向大车路",
  date: "一九三八年三月十四日 拂晓 — 午后",
  clock: "03-14 拂晓 — 午后",
  sky: "smokyDay",
  music: "fieldLament",
  // 本章在场的具名同伴（§8 人物速查 + §2 的场面需要）。**不写就由 beats 的 who 推**，
  // 推出来的名册对前两关刚好够用，但从三关起就不对了（军医、排长、参谋在场却
  // 不一定开口，而 combatant:false 的人一律推不出来）—— 所以七章一律显式点名。
  // 上限六个（Script_Companion.MAX_COMPANIONS），**从 nra 名额里出人**，
  // 撒兵自动少撒同样多，开机红线不受影响。
  //
  // 一关：整个班都在。担架员与伤员不进这张表 —— 他们由后送队
  //（Script_MissionSetpieces 的 EscortColumn）自己摆，重复点名会多出一份人。
  //
  // **顺序照「首次开口的先后」写，不许随手改。** 名册的顺序就是 ai.Spawn 的调用
  // 顺序，它决定这五个人拿到哪几个 soldier id、被编进哪个班组 —— 换一个顺序，
  // 场上每一枪打给谁就整条重排。这不是理论：INT2 第一版把赵德贵挪到末位，
  // Script_AiBehaviorTest「姿态没有阈值抽动」当场从 6 次变成 7 次（阈值是 6），
  // 而那条断言测的是**日军**单兵在十二秒里蹲起了几回。AI 决策是混沌的
  //（Script_ExternalProps 头注记过同一笔账），所以这张表写成与 INT2 之前
  // RosterFromBeats 推出来的**逐字同序**，本关的 AI 行为因此一帧都没变。
  roster: ["luo", "yaowa", "zhaodegui", "heyoutian", "liuwencai"],
  minutes: 20,
  pool: { start: 240, end: 208, label: "城里还站着的人", presumed: true },
  brief: [
    "取得控制二三十秒就有敌情，一分钟内开枪 —— 这是玩家的第一场仗。",
    "打完外围，无缝转入护送伤兵南下的差事：顺子自己抢的差事。",
    "日机认出白布担架、医护与撤离百姓之后仍主动转向扫射。这一段不许弱化。",
  ],
  objectives: [
    "守住路基，顶住正面试探",
    "退进村庄外围，靠田坎顶住",
    "跟随后送队过涵洞，沿大车路向南",
    "打退截路的日军小股",
    "日机转向伤员与百姓 —— 把人拖进路沟",
    "掩护担架后撤，断住追兵",
    "南路断了，把能走的带回城",
  ],
  zones: [
    { id: "C1_Railbed", name: "津浦路路基阵地", x: -466, z: -150, radius: 30 },
    // z 从骨架的 −95 挪到 −88：−95 时两圈的圆心距 55.1 m 小于半径之和 58 m，
    // 中间那条带上 playerZone 会一直报 C1_Railbed（find 取 zones 里第一个命中的），
    // 挂在 C1_Village 上的那两条只能等兜底。挪 7 m 之后 62.1 > 58，两圈脱开。
    { id: "C1_Village", name: "路西村庄外围", x: -470, z: -88, radius: 28 },
    { id: "C1_Culvert", name: "涵洞与田坎", x: -458, z: -30, radius: 26 },
    { id: "C1_SouthRoad", name: "南向大车路", x: -436, z: 30, radius: 28 },
    { id: "C1_Ditch", name: "路沟与炮损民房", x: -448, z: 130, radius: 28 },
    // 战术撤回的落脚点：路沟西口那道土坎。**不能与 C1_SouthRoad 的圈重叠** ——
    // playerZone 是按 zones 顺序 find 出来的第一个，重叠时后面那个永远轮不到，
    // 挂在它上面的 beats 会一路等到 95 s 的兜底。这里离 C1_SouthRoad 92 m、
    // 离 C1_Ditch 62 m，两边都比半径之和大。
    { id: "C1_Fallback", name: "路沟西口 · 掩护后撤", x: -500, z: 96, radius: 24 },
    { id: "C1_BackToWall", name: "带回城 · 西门外", x: -330, z: 0, radius: 26 },
  ],
  tuning: {
    bounds: { minX: -620, maxX: -230, minZ: -250, maxZ: 210 },
    spawn: { x: -480, z: -205, ry: Math.PI },
    // 白盒引导基建：宽视野里只放一条可读的窄走廊。地标、目标圈、空气墙和
    // 说明 HUD 共用这一份世界坐标，今后复制到别章只需换数据，不再改装配层。
    whitebox: {
      boundary: {
        points: [
          { x: -480, z: -218, halfWidth: 52 },
          { x: -466, z: -150, halfWidth: 54 },
          { x: -470, z: -88, halfWidth: 50 },
          { x: -458, z: -30, halfWidth: 46 },
          { x: -436, z: 30, halfWidth: 48 },
          { x: -448, z: 130, halfWidth: 50 },
          { x: -500, z: 96, halfWidth: 44 },
          { x: -420, z: 54, halfWidth: 48 },
          { x: -330, z: 0, halfWidth: 52 },
        ],
        warningMargin: 10,
        hardInset: 0.9,
        warningText: "前方不是任务方向。看路标，回到大车路与田坎之间。",
        hardText: "已离开本关可玩区域，正在返回战场。",
      },
      firstContact: {
        atS: 21.8,
        fullWaveAtS: 30,
        scout: { x: -458, z: -160, weapon: "Type38" },
        // 第一关不沿用全局 140—360 m 的纵深梯队：在 440 m 白盒里会把同班成员
        // 夹到几道田坎两侧。完整波也保持在可读的中距离，从村口两条通路压上来。
        wave: { minDistanceM: 58, maxDistanceM: 116, lateralSpanM: 48, deepShare: 0 },
      },
      annotations: [
        {
          id: "WbRailbed", objective: 0, fromObjective: 0, toObjective: 0,
          x: -466, z: -150, maxDistance: 130, kind: "combat", eyebrow: "白盒 01 · 首场接敌",
          title: "铁路路基阵地",
          detail: "20—30 秒后田坎出现侦察兵；这里教开枪、换弹、躲机枪。",
        },
        {
          id: "WbVillage", objective: 1, fromObjective: 0, toObjective: 1,
          x: -470, z: -88, maxDistance: 145, kind: "transition", eyebrow: "白盒 02 · 战斗转场",
          title: "路西村口",
          detail: "枪声暂歇，木门打开；后送队从这里加入，动线由守转为护送。",
        },
        {
          id: "WbCulvert", objective: 2, fromObjective: 1, toObjective: 2,
          x: -458, z: -30, maxDistance: 145, kind: "danger", eyebrow: "白盒 03 · 侧翼检查",
          title: "铁路涵洞与田坎",
          detail: "黑暗涵洞藏侦察兵；玩家持枪先查入口，再让担架队通过。",
        },
        {
          id: "WbSouthRoad", objective: 3, fromObjective: 2, toObjective: 3,
          x: -436, z: 30, maxDistance: 150, kind: "combat", eyebrow: "白盒 04 · 地面截击",
          title: "南向大车路转弯",
          detail: "侧面机枪封路；用破屋和土堆绕侧面，给后送队打开缺口。",
        },
        {
          id: "WbDitch", objective: 4, fromObjective: 3, toObjective: 4,
          x: -448, z: 130, maxDistance: 155, kind: "story", eyebrow: "白盒 05 · 日机扫射",
          title: "路沟与炮损民房",
          detail: "飞机先掠过铁路，随后转向白布担架和百姓；把人拖进路沟。",
        },
        {
          id: "WbFallback", objective: 5, fromObjective: 4, toObjective: 5,
          x: -500, z: 96, maxDistance: 145, kind: "route", eyebrow: "白盒 06 · 战术撤回",
          title: "路沟西口土坎",
          detail: "烟雾和路沟断住追兵；担架先撤，玩家回身压住路口。",
        },
        {
          id: "WbBackToWall", objective: 6, fromObjective: 5, toObjective: 6,
          x: -330, z: 0, maxDistance: 170, kind: "story", eyebrow: "白盒 07 · 关卡收束",
          title: "回城方向的最后阵位",
          detail: "伤员要求抬高后端；顺子重新握住担架，南路已经断了。",
        },
      ],
    },
    ijaPressure: 1.0, ijaSpawn: ["north"], ijaSupport: ["artillery", "hmg"],
    // 城外这一段没有工兵爆破，也没有战车：34 辆九四式在临城方向，不进本作。
    ijaForce: { lmgEvery: 13, hmgTeams: 1, engineers: false, armor: 0, motorTransport: "rearOnly" },
    ijaPool: 300,
    loadoutOverride: {
      primary: "HanYang", secondary: null, melee: "Dadao",
      throwables: { Grenade: 6 }, spareClips: 3,
      note: "兵站发的汉阳造，桥夹三个；木柄手榴弹六枚 —— 日方记川军各带手榴弹约六发。",
    },
  },
  // beats 的排法：**一个阶段一簇**，簇内所有条写同一个 at ——
  // Script_Story 的 sameAsPrev 会让同 at 的后续条只等 0.25 s（仍受 MIN_GAP 2 s 与
  // 语音占麦的约束），这正是「这几句一起来」的意思。第一条负责等条件，
  // 后面的跟着它走，不用每条各等一遍兜底。
  //
  // 开场那一段**故意全走 delay**：20—30 s 出敌情、1 分钟内开枪是硬指标，
  // 不能让它取决于玩家有没有走进某个圈，也不能等 event 的 80 s 兜底。
  beats: [
    // ── 阶段一｜外围阵地接敌（铁路路基 + 村庄外围）────────────────────────
    { at: "start", type: "title", text: "往南的路", sub: "一九三八年三月十四日　滕县城外", tier: "主流" },
    { at: "delay:2.4", type: "objective", text: "守住路基，顶住正面试探" },
    { at: "delay:4.6", type: "shout", who: "luo", voice: "ch1_luo_01", text: "枪上膛！", tier: "虚构" },
    { at: "delay:6.0", type: "line", who: "yaowa", voice: "ch1_yaowa_01", text: "班长，前头田坎上啥都没得。", tier: "虚构" },
    // ↓ 关内 21.8 s（0.8 + 2.4 + 4.6 + 6.0 + 8.0，delay 链是纯时间条件，算得准）：
    //   敌情。**这一条的时刻是验收指标**（§2 首句「取得控制 20—30 秒出现敌情」），
    //   别改成 event，也别把上面几条的 delay 调小把它挤到 20 s 以内。
    { at: "delay:8.0", type: "shout", who: "luo", voice: "ch1_luo_02", text: "前头田坎有人影！", tier: "虚构" },
    { at: "delay:8.0", type: "objective", text: "观察前方田地 —— 田坎上有人影" },
    // ↓ 关内约 27 s：第一次开枪的许可。「1 分钟内开枪」那一条靠它兜底
    //   （玩家看见侦察兵就可以自己先开，这一条只保证最晚不超过一分钟）。
    { at: "delay:3.2", type: "shout", who: "luo", voice: "ch1_luo_03", text: "莫等他走拢！打！", tier: "虚构" },

    // 日军展开：正面试探 / 远处轻机枪压制 / 掷弹筒 / 涵洞与田坎迂回
    { at: "delay:12.0", type: "shout", who: "zhaodegui", voice: "ch1_zhaodegui_01", text: "机枪！趴倒！莫抬头！", tier: "虚构" },
    { at: "delay:11.0", type: "shout", who: "luo", voice: "ch1_luo_04", text: "掷弹筒！听到响就换地方！", tier: "虚构" },
    // 搬弹短对话（策划案逐字）。玩家动作 = ammoResupply（见 ENGINE_REQUEST 3）。
    { at: "delay:10.0", type: "shout", who: "heyoutian", voice: "ch1_heyoutian_01", text: "顺子，帮老子抬弹药！", tier: "虚构" },
    { at: "delay:10.0", type: "line", who: "shunzi", voice: "ch1_shunzi_01", text: "你自己没得手嗦？", tier: "虚构" },
    { at: "delay:10.0", type: "shout", who: "luo", voice: "ch1_luo_05", text: "少扯！顺子，把箱子送过去！", tier: "虚构" },
    { at: "delay:9.0", type: "shout", who: "luo", voice: "ch1_luo_06", text: "涵洞那头有人摸过来！封起！", tier: "虚构" },

    { at: "event:AtVillage", type: "objective", text: "退进村庄外围，靠田坎顶住" },
    { at: "event:AtVillage", type: "shout", who: "luo", voice: "ch1_luo_07", text: "退到村口！靠田坎顶到起！", tier: "虚构" },
    // 刘文财的「数」：前期是算账，后期会变成压恐惧的方式（§8）。这里还只是算账。
    { at: "delay:12.0", type: "line", who: "liuwencai", voice: "ch1_liuwencai_01", text: "我这头就剩三个桥夹了。", tier: "虚构" },
    { at: "delay:8.0", type: "line", who: "heyoutian", voice: "ch1_heyoutian_02", text: "你数它做啥子？打完再数。", tier: "虚构" },

    // ── 阶段二｜无缝转入后送任务（不切黑）──────────────────────────────────
    { at: "event:EscortCall", type: "env", text: "枪声稀下来了。交通壕里在拖伤员，后头有人蹲着分子弹。" },
    { at: "event:EscortCall", type: "shout", who: "junguan", voice: "ch1_junguan_01", text: "缺两个护送伤兵的！", tier: "虚构" },
    // 顺子抢这个差事的**真实动机**在序章交代过（藏短褂、想在临城换衣裳走人）。
    // 这里一个字都不点破 —— §0：性格只由剧情节点表达。
    { at: "event:EscortCall", type: "shout", who: "shunzi", voice: "ch1_shunzi_02", text: "我去！", tier: "虚构" },
    { at: "event:EscortCall", type: "line", who: "heyoutian", voice: "ch1_heyoutian_03", text: "平时喊你搬子弹像要你命，送伤兵倒跑得快。", tier: "虚构" },
    { at: "event:EscortCall", type: "line", who: "shunzi", voice: "ch1_shunzi_03", text: "老子愿意救人，碍你啥子事？", tier: "虚构" },
    { at: "event:EscortCall", type: "line", who: "luo", voice: "ch1_luo_08", text: "送到南边接应点。", tier: "虚构" },
    { at: "event:EscortCall", type: "line", who: "luo", voice: "ch1_luo_09", text: "人交到手里再回来。", tier: "虚构" },
    { at: "event:EscortCall", type: "env", text: "交通壕后侧的木门推开，两副担架抬出来。" },
    { at: "event:EscortCall", type: "objective", text: "跟随后送队 —— 不要跑到队伍前头去" },

    // ── 阶段三｜武装后送（玩家持枪，不抬担架）──────────────────────────────
    { at: "event:AtCulvert", type: "objective", text: "跟随后送队过涵洞，沿大车路向南" },
    { at: "event:AtCulvert", type: "shout", who: "danjiayuan", voice: "ch1_danjiayuan_01", text: "担架起！后头跟到起！", tier: "虚构" },
    { at: "delay:13.0", type: "shout", who: "luo", voice: "ch1_luo_10", text: "先查涵洞。里头黑，看清楚再进。", tier: "虚构" },
    { at: "delay:15.0", type: "shout", who: "heyoutian", voice: "ch1_heyoutian_04", text: "后头有尾巴！那两个不是我们的人！", tier: "虚构" },
    { at: "delay:14.0", type: "line", who: "zhaodegui", voice: "ch1_zhaodegui_02", text: "那个阵地空了，弹药盒还在。去翻。", tier: "虚构" },

    // 最后一段轻松闲谈（策划案逐字）—— 全关最后一次有人开玩笑。
    // 日机扫射之后这种话就没有了（§0 全队情绪·一关）。
    { at: "delay:16.0", type: "line", who: "shangbing", voice: "ch1_shangbing_01", text: "临城还有好远？", tier: "虚构" },
    { at: "delay:16.0", type: "line", who: "danjiayuan", voice: "ch1_danjiayuan_02", text: "你莫问，抬得到就不远。", tier: "虚构" },
    { at: "delay:16.0", type: "line", who: "yaowa", voice: "ch1_yaowa_02", text: "山东这个馍馍啷个一点盐味都没得？", tier: "虚构" },
    { at: "delay:16.0", type: "line", who: "heyoutian", voice: "ch1_heyoutian_05", text: "饿两顿，你连泥巴都觉得香。", tier: "虚构" },
    { at: "delay:16.0", type: "line", who: "yaowa", voice: "ch1_yaowa_03", text: "吃个鸭儿，泥巴又不顶饿。", tier: "虚构" },

    // ── 阶段四｜地面截击 ──────────────────────────────────────────────────
    { at: "event:AtSouthRoad", type: "objective", text: "打退截路的日军小股" },
    { at: "event:AtSouthRoad", type: "shout", who: "luo", voice: "ch1_luo_11", text: "机枪！左手边那个土堆！", tier: "虚构" },
    { at: "event:AtSouthRoad", type: "shout", who: "danjiayuan", voice: "ch1_danjiayuan_03", text: "担架进屋头！进屋头！", tier: "虚构" },
    { at: "delay:11.0", type: "shout", who: "luo", voice: "ch1_luo_12", text: "绕破屋过去，从侧面掏他！", tier: "虚构" },
    { at: "delay:13.0", type: "shout", who: "yaowa", voice: "ch1_yaowa_04", text: "近路那两个我压到起！", tier: "虚构" },

    // ── 阶段五｜日机第一次掠过 ────────────────────────────────────────────
    { at: "event:AtDitch", type: "env", text: "路沟边上是几间炮损民房。担架歇在墙根，白布在风里翻。" },
    { at: "event:AircraftFirstPass", type: "shout", who: "yaowa", voice: "ch1_yaowa_05", text: "飞机！飞机来了！", tier: "虚构" },
    { at: "event:AircraftFirstPass", type: "shout", who: "luo", voice: "ch1_luo_13", text: "散开！莫挤到一堆！", tier: "虚构" },
    { at: "event:AircraftFirstPass", type: "line", who: "liuwencai", voice: "ch1_liuwencai_02", text: "它冲前头那几台车去的。", tier: "虚构" },
    { at: "event:AircraftFirstPass", type: "line", who: "zhaodegui", voice: "ch1_zhaodegui_03", text: "步枪够不到它。莫白费子弹。", tier: "虚构" },
    { at: "event:AircraftFirstPass", type: "shout", who: "danjiayuan", voice: "ch1_danjiayuan_04", text: "快走！趁它拉起来！", tier: "虚构" },

    // ── 阶段六｜日机主动转向伤员与百姓 ────────────────────────────────────
    // **§0 明确保留的三项创作性还原之一，不删除、不弱化、不自我辩解。**
    // 这一簇台词逐字照策划案，一个字都不许改；玩家必须在自由视角里亲眼看见
    // 「路上没有重武器、担架盖白布、医护带药箱、妇孺南撤，而飞机仍对准人群」。
    { at: "event:AircraftTurnCrowd", type: "objective", text: "日机转向伤员与百姓 —— 把人拖进路沟" },
    { at: "event:AircraftTurnCrowd", type: "env", text: "它拐回来了，压得很低。路上没有炮，没有车。担架盖着白布。" },
    { at: "event:AircraftTurnCrowd", type: "shout", who: "yaowa", voice: "ch1_yaowa_06", text: "日你先人！那是伤兵！", tier: "虚构" },
    { at: "event:AircraftTurnCrowd", type: "shout", who: "heyoutian", voice: "ch1_heyoutian_06", text: "妈卖批！白布都看到了还往下压！", tier: "虚构" },
    { at: "event:AircraftTurnCrowd", type: "shout", who: "heyoutian", voice: "ch1_heyoutian_07", text: "它就是冲人来的！", tier: "虚构" },
    { at: "event:AircraftTurnCrowd", type: "line", who: "shangbing", voice: "ch1_shangbing_02", text: "狗日的小日本……连躺起的人都不放过。", tier: "虚构" },
    { at: "event:AircraftTurnCrowd", type: "shout", who: "luo", voice: "ch1_luo_14", text: "畜生东西！", tier: "虚构" },
    { at: "event:AircraftTurnCrowd", type: "shout", who: "luo", voice: "ch1_luo_15", text: "担架、女人、娃儿都照打！", tier: "虚构" },
    { at: "event:AircraftTurnCrowd", type: "shout", who: "luo", voice: "ch1_luo_16", text: "先把人拖进沟！莫全挤在一条路上！", tier: "虚构" },
    // 称呼从这一拍起恶化：后面全关不再有一句「鬼子」，只有「畜生 / 狗日的小日本」。
    { at: "event:AircraftTurnCrowd", type: "env", text: "第二轮下来了。弹着点顺着路面往前赶，追着人跑。" },

    // ── 阶段七｜接替担架（搬运态 20—30 s）────────────────────────────────
    { at: "event:StretcherHandoff", type: "shout", who: "luo", voice: "ch1_luo_17", text: "顺子，接后头！", tier: "虚构" },
    // 担架员中弹那一声惨叫走实录素材，不写 TTS 行（ENGINE_REQUEST 8）。这里只留成句的。
    { at: "event:StretcherHandoff", type: "line", who: "danjiayuan", voice: "ch1_danjiayuan_05", text: "手……我这只手抬不起来了。", tier: "虚构" },
    { at: "event:StretcherHandoff", type: "system", text: "按住交互键 —— 接住担架后端", tier: "系统" },
    { at: "delay:12.0", type: "line", who: "yaowa", voice: "ch1_yaowa_07", text: "顺哥，慢点。他还在流血。", tier: "虚构" },
    { at: "delay:11.0", type: "line", who: "shangbing", voice: "ch1_shangbing_03", text: "……走你们的。莫管我。", tier: "虚构" },

    // ── 阶段八｜顺子松手 ──────────────────────────────────────────────────
    { at: "event:DiveCue", type: "shout", who: "luo", voice: "ch1_luo_18", text: "它又拉过来了！扑进沟！", tier: "虚构" },
    { at: "event:DiveCue", type: "system", text: "扑入路沟", tier: "系统" },
    // 「你的手是先松开的」—— 这不是玩家操作失误，是脚本强制的（ForceRelease）。
    // 顺子这个人物的整条弧线从这一下开始：一关松手 → 三关撕短褂 → 五关不走。
    { at: "event:DiveCue", type: "env", text: "担架侧翻，人滑到沟沿上。你的手是先松开的。" },
    // 沟内边打边吵（策划案逐字）。此后小队不再回到嬉皮笑脸。
    { at: "delay:4.5", type: "shout", who: "luo", voice: "ch1_luo_19", text: "你个龟儿！松手松得比撒尿还快！", tier: "虚构" },
    { at: "delay:4.5", type: "shout", who: "luo", voice: "ch1_luo_20", text: "那是个人，不是麻袋！", tier: "虚构" },
    { at: "delay:4.5", type: "shout", who: "shunzi", voice: "ch1_shunzi_04", text: "老子不松，一起死！", tier: "虚构" },
    { at: "delay:4.5", type: "shout", who: "luo", voice: "ch1_luo_21", text: "莫说批话！", tier: "虚构" },
    { at: "delay:4.5", type: "shout", who: "luo", voice: "ch1_luo_22", text: "你刚才连头都没回！", tier: "虚构" },
    { at: "delay:4.5", type: "shout", who: "yaowa", voice: "ch1_yaowa_08", text: "狗日的小日本！", tier: "虚构" },
    { at: "delay:4.5", type: "shout", who: "yaowa", voice: "ch1_yaowa_09", text: "有本事冲老子来，打伤兵算个啥子东西！", tier: "虚构" },

    // ── 阶段九｜南路被截断（逃跑计划第一次彻底失败）──────────────────────
    { at: "event:SouthCut", type: "env", text: "南边的枪声没有停。路口上有人，不是我们的人。" },
    { at: "event:SouthCut", type: "shout", who: "luo", voice: "ch1_luo_23", text: "南边过不去了。", tier: "虚构" },
    { at: "event:SouthCut", type: "shout", who: "luo", voice: "ch1_luo_24", text: "把人带回城！", tier: "虚构" },
    { at: "event:SouthCut", type: "line", who: "shunzi", voice: "ch1_shunzi_05", text: "往南都没得路了。", tier: "虚构" },
    // ↓ 策划案「过场动画」那一段短演出。做成 in-level beats 而不是过场：
    //   §2 原文要求「立即恢复控制，不停留在尸体上煽情」，§0 又规定「同一关内不切黑」；
    //   而 cutsceneOut 的 trigger 是 afterLevel，根本插不到这个位置。
    //   所以这两句站在沟里说，镜头一秒都不拿走。取舍理由也记在 Data_CutsceneCh1.mjs 头注。
    { at: "delay:6.0", type: "env", text: "枪声退远了。沟里只剩喘气声 —— 担架、药箱、几个抱娃的婆娘。" },
    { at: "delay:5.0", type: "line", who: "shunzi", voice: "ch1_shunzi_06", text: "他们连这个也打？", tier: "虚构" },
    { at: "delay:5.5", type: "line", who: "luo", voice: "ch1_luo_25", text: "路断了。把能走的带回城。", tier: "虚构" },

    // ── 阶段十｜战术撤回（返程无闲谈，只剩战术口令）──────────────────────
    { at: "event:AtFallback", type: "objective", text: "掩护担架后撤，断住追兵" },
    { at: "event:AtFallback", type: "shout", who: "luo", voice: "ch1_luo_26", text: "担架先过！", tier: "虚构" },
    { at: "delay:5.0", type: "shout", who: "yaowa", voice: "ch1_yaowa_10", text: "右边又上来了！", tier: "虚构" },
    { at: "delay:5.0", type: "shout", who: "heyoutian", voice: "ch1_heyoutian_08", text: "弹药！", tier: "虚构" },
    { at: "delay:5.0", type: "shout", who: "luo", voice: "ch1_luo_27", text: "莫把人落下！", tier: "虚构" },

    // ── 阶段十一｜结尾 ────────────────────────────────────────────────────
    // §0 六个验收结果之二：**删掉「还送不送」**。伤员只因疼痛说这一句，
    // 顺子答「晓得」并重新握住担架后端 —— 没有表态、没有感言、没有回头。
    // 这一簇必须在走到最后一个路标**之前**说完（见文件头「为什么是七个路标」）。
    { at: "delay:5.2", type: "objective", text: "南路断了，把能走的带回城" },
    { at: "delay:6.0", type: "env", text: "阵地入口就在前头。担架上那个人还活着，脸白得像纸，腿上还在渗血。" },
    { at: "delay:5.0", type: "line", who: "shangbing", voice: "ch1_shangbing_04", text: "后头抬高点……腿莫擦地。", tier: "虚构" },
    { at: "delay:4.0", type: "line", who: "shunzi", voice: "ch1_shunzi_07", text: "晓得。", tier: "虚构" },

    { at: "end", type: "narration", text: "往南的路断了。人没有送出去 —— 但担架上那个还活着。", tier: "虚构" },
  ],
  cutsceneIn: null,
  cutsceneOut: "CS_Ch1_RoadCut",
  mechanics: {
    aircraftStrafe: true,     // 两轮航线：先打车辆、再转向人群，弹线追人群（ENGINE_REQUEST 4）
    stretcherCarry: true,     // 接替担架：搬运态 20—30 s，减速、不能用枪、可主动放下
    stretcherRelease: true,   // 顺子松手：提示【扑入路沟】，不躲则击倒并从数秒前重来
    escortColumn: true,       // 武装后送队（2 担架 + 4 担架员 + 2 护卫 + 可行走伤兵 + 百姓）
    ammoResupply: true,       // 给机枪组补弹、搜废弃阵地补弹
  },
};

// 章节剧情台词（docs/Data_AudioAssets.md「章节剧情语音」）。
// key = ch1_<who>_<NN>，按每个人在本章的**出场顺序**编号；file 由 Data_Voice 推导，别手写。
// dur: 0 是占位，烘完由 Script_VoiceBake 写回这一行。
//
// delivery 只有三档在用：shout（战场急喊）/ normal（常态对白）/ weak（伤员、脱力）。
// **担架上的伤员一句都不许走 shout** —— 他是躺着的，拉齐音量就没有「躺着」这回事了。
// 惨叫与纯痛呼不在这张表里（ENGINE_REQUEST 8，走实录素材）。
export const VOICE_LINES = [
  // ── 罗班长（27 句）：口令 → 骂 → 命令。全关他一个人占四成台词，这是对的：
  //    §0 说顺子的性格靠剧情节点表达，不靠他自己解释，所以说话的是班长。
  { key: "ch1_luo_01", who: "luo", delivery: "shout", dur: 0.67, text: "枪上膛！" },
  { key: "ch1_luo_02", who: "luo", delivery: "shout", dur: 1.88, text: "前头田坎有人影！" },
  { key: "ch1_luo_03", who: "luo", delivery: "shout", dur: 1.99, text: "莫等他走拢！打！" },
  { key: "ch1_luo_04", who: "luo", delivery: "shout", dur: 2.31, text: "掷弹筒！听到响就换地方！" },
  { key: "ch1_luo_05", who: "luo", delivery: "shout", dur: 3.06, text: "少扯！顺子，把箱子送过去！" },
  { key: "ch1_luo_06", who: "luo", delivery: "shout", dur: 2.60, text: "涵洞那头有人摸过来！封起！" },
  { key: "ch1_luo_07", who: "luo", delivery: "shout", dur: 2.08, text: "退到村口！靠田坎顶到起！" },
  { key: "ch1_luo_08", who: "luo", delivery: "normal", dur: 1.11, text: "送到南边接应点。" },
  { key: "ch1_luo_09", who: "luo", delivery: "normal", dur: 1.45, text: "人交到手里再回来。" },
  { key: "ch1_luo_10", who: "luo", delivery: "shout", dur: 2.60, text: "先查涵洞。里头黑，看清楚再进。" },
  { key: "ch1_luo_11", who: "luo", delivery: "shout", dur: 2.48, text: "机枪！左手边那个土堆！" },
  { key: "ch1_luo_12", who: "luo", delivery: "shout", dur: 2.51, text: "绕破屋过去，从侧面掏他！" },
  { key: "ch1_luo_13", who: "luo", delivery: "shout", dur: 1.71, text: "散开！莫挤到一堆！" },
  // 阶段六这四句是全关情绪的转折点，录的时候不许收着。
  { key: "ch1_luo_14", who: "luo", delivery: "shout", dur: 0.63, text: "畜生东西！" },
  { key: "ch1_luo_15", who: "luo", delivery: "shout", dur: 2.11, text: "担架、女人、娃儿都照打！" },
  { key: "ch1_luo_16", who: "luo", delivery: "shout", dur: 3.72, text: "先把人拖进沟！莫全挤在一条路上！" },
  { key: "ch1_luo_17", who: "luo", delivery: "shout", dur: 1.87, text: "顺子，接后头！" },
  { key: "ch1_luo_18", who: "luo", delivery: "shout", dur: 2.53, text: "它又拉过来了！扑进沟！" },
  { key: "ch1_luo_19", who: "luo", delivery: "shout", dur: 3.35, text: "你个龟儿！松手松得比撒尿还快！" },
  { key: "ch1_luo_20", who: "luo", delivery: "shout", dur: 2.03, text: "那是个人，不是麻袋！" },
  { key: "ch1_luo_21", who: "luo", delivery: "shout", dur: 0.93, text: "莫说批话！" },
  { key: "ch1_luo_22", who: "luo", delivery: "shout", dur: 1.69, text: "你刚才连头都没回！" },
  { key: "ch1_luo_23", who: "luo", delivery: "shout", dur: 0.89, text: "南边过不去了。" },
  { key: "ch1_luo_24", who: "luo", delivery: "shout", dur: 0.87, text: "把人带回城！" },
  // 这一句是**查完路之后**平着说的，与上面两句急喊分开：短演出的落点在这里。
  { key: "ch1_luo_25", who: "luo", delivery: "normal", dur: 3.14, text: "路断了。把能走的带回城。" },
  { key: "ch1_luo_26", who: "luo", delivery: "shout", dur: 0.71, text: "担架先过！" },
  { key: "ch1_luo_27", who: "luo", delivery: "shout", dur: 0.92, text: "莫把人落下！" },

  // ── 顺子（7 句）：话最少的那个。全关只在被问到时开口，一次自辩、一次追问、一句「晓得」。
  { key: "ch1_shunzi_01", who: "shunzi", delivery: "normal", dur: 0.71, text: "你自己没得手嗦？" },
  { key: "ch1_shunzi_02", who: "shunzi", delivery: "shout", dur: 0.70, text: "我去！" },
  { key: "ch1_shunzi_03", who: "shunzi", delivery: "normal", dur: 2.33, text: "老子愿意救人，碍你啥子事？" },
  // 松手之后的自辩。他自己也知道站不住脚 —— 别录成理直气壮，录成被戳穿之后的硬顶。
  { key: "ch1_shunzi_04", who: "shunzi", delivery: "shout", dur: 1.85, text: "老子不松，一起死！" },
  { key: "ch1_shunzi_05", who: "shunzi", delivery: "normal", dur: 1.62, text: "往南都没得路了。" },
  { key: "ch1_shunzi_06", who: "shunzi", delivery: "normal", dur: 1.91, text: "他们连这个也打？" },
  // 全关最后一句。两个字，不带情绪，重新握住担架后端。**不许演。**
  { key: "ch1_shunzi_07", who: "shunzi", delivery: "normal", dur: 0.49, text: "晓得。" },

  // ── 幺娃（10 句）：前期「怕个鸭儿」的少年兵；日机扫射后是全队第一个失控大骂的。
  { key: "ch1_yaowa_01", who: "yaowa", delivery: "normal", dur: 3.06, text: "班长，前头田坎上啥都没得。" },
  { key: "ch1_yaowa_02", who: "yaowa", delivery: "normal", dur: 3.19, text: "山东这个馍馍啷个一点盐味都没得？" },
  { key: "ch1_yaowa_03", who: "yaowa", delivery: "normal", dur: 2.05, text: "吃个鸭儿，泥巴又不顶饿。" },
  { key: "ch1_yaowa_04", who: "yaowa", delivery: "shout", dur: 1.77, text: "近路那两个我压到起！" },
  { key: "ch1_yaowa_05", who: "yaowa", delivery: "shout", dur: 1.91, text: "飞机！飞机来了！" },
  // ↓ §0 六个验收结果之一的核心句：第一个骂出来的是十六七岁那个。
  { key: "ch1_yaowa_06", who: "yaowa", delivery: "shout", dur: 2.43, text: "日你先人！那是伤兵！" },
  { key: "ch1_yaowa_07", who: "yaowa", delivery: "normal", dur: 3.07, text: "顺哥，慢点。他还在流血。" },
  { key: "ch1_yaowa_08", who: "yaowa", delivery: "shout", dur: 1.08, text: "狗日的小日本！" },
  { key: "ch1_yaowa_09", who: "yaowa", delivery: "shout", dur: 3.47, text: "有本事冲老子来，打伤兵算个啥子东西！" },
  { key: "ch1_yaowa_10", who: "yaowa", delivery: "shout", dur: 1.19, text: "右边又上来了！" },

  // ── 何有田（8 句）：全班最爱说笑的那个。他的玩笑到阶段六为止，之后只剩两个字的口令。
  { key: "ch1_heyoutian_01", who: "heyoutian", delivery: "shout", dur: 1.90, text: "顺子，帮老子抬弹药！" },
  { key: "ch1_heyoutian_02", who: "heyoutian", delivery: "normal", dur: 3.01, text: "你数它做啥子？打完再数。" },
  { key: "ch1_heyoutian_03", who: "heyoutian", delivery: "normal", dur: 4.15, text: "平时喊你搬子弹像要你命，送伤兵倒跑得快。" },
  { key: "ch1_heyoutian_04", who: "heyoutian", delivery: "shout", dur: 3.40, text: "后头有尾巴！那两个不是我们的人！" },
  { key: "ch1_heyoutian_05", who: "heyoutian", delivery: "normal", dur: 3.20, text: "饿两顿，你连泥巴都觉得香。" },
  { key: "ch1_heyoutian_06", who: "heyoutian", delivery: "shout", dur: 3.30, text: "妈卖批！白布都看到了还往下压！" },
  { key: "ch1_heyoutian_07", who: "heyoutian", delivery: "shout", dur: 1.77, text: "它就是冲人来的！" },
  // 撤回段他只剩两个字 —— 这个落差就是「玩笑锐减」的听觉证据。
  { key: "ch1_heyoutian_08", who: "heyoutian", delivery: "shout", dur: 1.00, text: "弹药！" },

  // ── 赵德贵（3 句）：老成持重，管弹药纪律，说的都是「怎么活下来」的话。
  { key: "ch1_zhaodegui_01", who: "zhaodegui", delivery: "shout", dur: 1.99, text: "机枪！趴倒！莫抬头！" },
  { key: "ch1_zhaodegui_02", who: "zhaodegui", delivery: "normal", dur: 3.78, text: "那个阵地空了，弹药盒还在。去翻。" },
  { key: "ch1_zhaodegui_03", who: "zhaodegui", delivery: "normal", dur: 3.07, text: "步枪够不到它。莫白费子弹。" },

  // ── 刘文财（2 句）：什么都要数一遍。
  { key: "ch1_liuwencai_01", who: "liuwencai", delivery: "normal", dur: 1.19, text: "我这头就剩三个桥夹了。" },
  { key: "ch1_liuwencai_02", who: "liuwencai", delivery: "normal", dur: 1.73, text: "它冲前头那几台车去的。" },

  // ── 担架员（5 句）：说话夹在喘气里。最后一句是中弹之后的，走 weak。
  { key: "ch1_danjiayuan_01", who: "danjiayuan", delivery: "shout", dur: 2.76, text: "担架起！后头跟到起！" },
  { key: "ch1_danjiayuan_02", who: "danjiayuan", delivery: "normal", dur: 2.18, text: "你莫问，抬得到就不远。" },
  { key: "ch1_danjiayuan_03", who: "danjiayuan", delivery: "shout", dur: 2.23, text: "担架进屋头！进屋头！" },
  { key: "ch1_danjiayuan_04", who: "danjiayuan", delivery: "shout", dur: 1.92, text: "快走！趁它拉起来！" },
  { key: "ch1_danjiayuan_05", who: "danjiayuan", delivery: "weak", dur: 4.09, text: "手……我这只手抬不起来了。" },

  // ── 伤员（4 句，全部 weak）：躺在担架上的那个人。他是全关的量尺 ——
  //    开头问「临城还有好远」，结尾只关心「腿莫擦地」。中间他一直在。
  { key: "ch1_shangbing_01", who: "shangbing", delivery: "weak", dur: 2.25, text: "临城还有好远？" },
  { key: "ch1_shangbing_02", who: "shangbing", delivery: "weak", dur: 4.78, text: "狗日的小日本……连躺起的人都不放过。" },
  { key: "ch1_shangbing_03", who: "shangbing", delivery: "weak", dur: 3.10, text: "……走你们的。莫管我。" },
  // ↓ §0 六个验收结果之二：只有疼，没有「还送不送」。
  { key: "ch1_shangbing_04", who: "shangbing", delivery: "weak", dur: 3.67, text: "后头抬高点……腿莫擦地。" },

  // ── 后方军官（1 句）：喊话的人不露脸，用 junguan 这条音色（三十五上下、有穿透力、
  //    急而清楚、不表演式咆哮）。他只负责把差事喊出来，顺子接不接是顺子的事。
  { key: "ch1_junguan_01", who: "junguan", delivery: "shout", dur: 1.17, text: "缺两个护送伤兵的！" },
];
