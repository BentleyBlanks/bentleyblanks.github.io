// Data_MissionCh5.mjs — 第五关｜城墙没有了。规格：docs/Data_MissionRemake.md §6（正文）与 §10（契约）。
// 本文件由基建批建骨架、章节内容批填实。不许 import three，不许 Math.random。
//
// ---------------------------------------------------------------------------
// 场景基底：A 区废墟 → 西街长街 → 西关城门
//
//   A 区 · 城内主救护所 (214, -30) —— 与三关、四关**同一个院子**（口径见
//        Data_MissionCh3 头注），这一次是废墟：一侧房屋坍塌、罗班长遗体盖白布、
//        电话断线、药箱大多空、门板担架仍在、熟人缺席。
//   西街长街 = 西门大街那条 z=0 的通视直街（城内唯一一条从城心一眼望到西城门楼的走廊）。
//   西关城门 = 怀古门 (-305, 0)，1938 年唯一的活口。
//
// **本章的验收结果之一**（§0 第 5 条）：玩家必须明确知道顺子真的有生路 ——
// 军令（不用再回来）＋ 打开的西关城门 ＋ 城外道路后送队 ＋ HUD 任务【撤出滕县】
// ＋ 玩家真的走到城门内侧。之后顺子才主动转身。所以目标链里
// C5_GateOut（城门外）与 C5_ReturnGun（返回机枪位）**两条都要有**，缺一条这件事就不成立。
//
// bounds 比旧 L5 往西多让 45 m：西关城门外那一段（-330）要在切片里，
// 否则玩家「走到门口」时门外是空地皮。cameraFar 沿用旧 L5 的 400。
// ---------------------------------------------------------------------------
//
// ===========================================================================
// 2026-08-28 章节内容批（C5）：十二阶段 beats ＋ 台词 ＋ 语音行
// ===========================================================================
//
// 阶段与 beats 的对应（§6 阶段号 → 本文件 beats 里的分段注释）：
//   ①A 区废墟清晨 ②明确撤离命令 ③穿过旧场景 ④全军情绪 ⑤分段护送战
//   ⑥最后一个火力点 ⑦生路三重确认 ⑧身后火力停止 ⑨返回机枪位
//   ⑩最后防守三层 ⑪最终白刃战 ⑫视角接替三段
//
// **顺子三句弧线**在本章兑现最后一句：
//   序章「老子没打算死在山东。」→ 一关「老子不松，一起死。」→ 五关「老子今天不走了」
//   （ch5_shunzi_18「老子今天不走了——来啊！」，§0 验收结果第 6 条那四连吼的末句）。
//
// 触发式为什么几乎只用 zone/delay：`event:` 的判定表在 Script_Story.LEVEL_CUES，
// 那张表里还没有 CH5 的条目（F2/集成批的活）。没接线的 event 只能靠 80 s 兜底触发，
// 五条就是五分钟的静默 —— 所以本章的节拍先挂在**今天就成立**的 zone 与 delay 上，
// 要挂的事件名登记在下面的 EVENTS 里，接线之后再按注释改挂。
//
// ---------------------------------------------------------------------------
// ENGINE_REQUEST（契约 §10.4：内容批只登记，不改共享模块）
// ---------------------------------------------------------------------------
//
//  1. **emplacedGun** —— 接管固定机枪位。需要：交互接管/离位、过热条（连续压制会卡）、
//     掷弹筒目标优先提示、两侧院门作为可封锁的射界。用在阶段⑥与⑩①。
//  2. **gunJam** —— 机枪卡壳/弹尽后强制回落到步枪＋手榴弹（不是「机枪没子弹了」的提示，
//     是**这挺枪从此不能用**）。用在阶段⑩②，台词 ch5_shunzi_12/13 与它同拍。
//  3. **escortConvoy** —— 担架分段通过：担架队按段推进，段与段之间等玩家把路口清干净；
//     担架被打中会落地（阶段⑧的「担架落地、伤员痛呼」就是这条的现成表现）。
//  4. **escapeOffered** —— 生路的三重确认要的是工程事实，不是台词：
//     ①西关城门**真的打开**（门洞可通行、不是贴图）；②城门外那段路真的可见
//     （bounds 已往西让到 -370，就是为了这一眼）；③任务点 C5_GateOut 在**城外**。
//     三条缺一条，§0 验收结果第 5 条就不成立。
//  5. **turnBack** —— 顺子折返那一拍的两件事：
//     (a) 机枪声停下之后，任务文字**先保留【撤出滕县 —— 通过西关】数秒**再更新成
//         【返回最后火力点】（玩家要有几秒钟是「还可以走」的状态，不能瞬切）；
//     (b) 过场 CS_Ch5_TurnBack（8.5 s）在这一拍**关中播放**，不是关末 ——
//         引擎目前只有 cutsceneIn/cutsceneOut 两个钩子，所以本章多给了一个
//         `cutsceneMid` 字段等着接线（见 CHAPTER.cutsceneMid）。播完恢复完全控制。
//  6. **lastBayonet** —— 最终白刃战：两侧夹击、体力不回满、活动空间逐步缩小，
//     唯一判定是【坚持到最后一副担架离开视野】。**工程闸**：C5_ReturnGun 是目标链
//     最后一个路标，走到就 objectiveIndex ≥ objectiveCount，Script_Main 会立刻换关 ——
//     阶段⑩⑪⑫会被整段吃掉。这一段必须用 `state.pinned` 钉住关卡，直到最后一副担架
//     离开视野判定成立才放行。
//  7. **povChain** —— 视角接替三段（124 师副射手 → 前沿电话兵 → 小秦）的控制权交接：
//     每一段都是**玩家控制**（打机枪、穿院落递报告、敲听筒），段与段之间不切黑，
//     用声音衔接。三段的字幕由 system beat 报出（「视角接替：…」）。
//     这三段仍在**本关之内**（第 6 条那道 pin 要一直钉到小秦喊完「听到回话！」），
//     放行之后才轮到关末过场 CS_Ch5_PovChain，它的最后一句声音直接接进终章。
//  8. **实录（不走 TTS）** —— 顺子中弹倒地后的怒吼与喘息是非语言嗓音，
//     SeedAudio 做不像（docs/Data_AudioAssets.md「交付档」节的明令）：这一条不写进
//     VOICE_LINES，走免版税实录 `sample:{item,path,credit,maxDur}`，由音频批补。
//     有词的四连吼相反 —— 那是台词，照常走 shout 档 TTS。
//  9. **远处那一声「杀！」** —— 阶段⑩③末尾（ch5_s124_03）：它必须听着**在远处**。
//     宿主的 locate(who) 请把它定位到街那头（几十米外）而不是玩家脸上；
//     人声剔除半径会把它降级成非空间化播放，这条不许被距离闸丢掉 ——
//     「还有人在打」是这一拍唯一的安慰。（为什么不留空字幕：没有语音的 shout
//     会被 Script_Story 补一声哨子当替身，正好盖在四连吼后面。）
// 10. **dressingEcho（布设请求）** —— §6 阶段③要求路过第二/三/四关的旧场景，但
//     B 区集结院 (449,-140) 与东关外壕都在本章切片 (maxX 285) 之外。折中：A 区→十字街口
//     这一段路边院落请摆上同一组母题 —— 塌掉的投弹街垒、**烧黑的弹药箱**、纸灰、碎碗；
//     三条 env beat 点的就是它们，摆件不到位这三条就成了空话。
// 11. **PlayTest 待改一行** —— Script_PlayTest.mjs 断言「第五章打完自动接 CS_Ch5_TurnBack」。
//     按 §6 过场规格，关末播的是**视角接替**（CS_Ch5_PovChain），转身那一场改在关中播，
//     所以 cutsceneOut 已改。那一行断言的期望值请由集成批一并改成 CS_Ch5_PovChain。
// ---------------------------------------------------------------------------

/**
 * 本章要用的叙事事件（`at: "event:<id>"`）登记表。
 *
 * 现在**还没有一条 beat 挂在 event 上** —— 判定表（Script_Story.LEVEL_CUES）里没有
 * CH5 的条目，挂上去只会靠 80 s 兜底触发。接线的做法二选一：
 *   · 规则层在事实发生的那一刻 `story.Signal("<id>")`（推过的优先，最准）；
 *   · 或在 LEVEL_CUES.CH5_Chengqiang 里按 objectiveIndex/levelTime 写判据。
 * 接好之后，把 `nowAt` 那一条 beat 的 at 换成 `event:<id>` 即可，台词一个字不用动。
 */
export const EVENTS = [
  { id: "EvacOrder", when: "负伤排长下完「不用再回来」，任务文字变【护送后送队撤出滕县】那一刻",
    nowAt: "delay（跟在排长第三句后面）", mechanic: "escapeOffered" },
  { id: "CookOnGun", when: "炊事兵被拉上机枪位、原射手交代完三句", nowAt: "delay（十字街口那组之后）", mechanic: null },
  { id: "GunNestTaken", when: "玩家接管最后一个火力点的机枪", nowAt: "zone:C5_GunNest + delay", mechanic: "emplacedGun" },
  { id: "LastLitterPassed", when: "最后一副担架通过火力点，排长喊「够了！」", nowAt: "delay", mechanic: "escortConvoy" },
  { id: "EscapeSeen", when: "玩家站到城门内侧、门外道路与后送队都在视野里", nowAt: "zone:C5_GateInner", mechanic: "escapeOffered" },
  { id: "MgSilent", when: "身后的机枪停了（射手位没人了）", nowAt: "zone:C5_GateOut", mechanic: "turnBack" },
  { id: "TurnedBack", when: "顺子决定折返，任务更新【返回最后火力点】", nowAt: "delay（顺子「老子回去压住！」之后）", mechanic: "turnBack" },
  { id: "GunJam", when: "机枪卡壳/弹尽，改步枪＋手榴弹", nowAt: "delay（重占机枪位之后）", mechanic: "gunJam" },
  { id: "LastFriendDown", when: "最后一名友军中弹倒下，两个方向的日军进街", nowAt: "delay", mechanic: "lastBayonet" },
  { id: "BayonetFixed", when: "顺子装上刺刀、四连吼开始", nowAt: "delay", mechanic: "lastBayonet" },
  { id: "ShunziDown", when: "顺子中弹/被刺倒地（不切黑）", nowAt: "delay", mechanic: "povChain" },
  { id: "PovGunner", when: "视角接替①：124 师机枪副射手", nowAt: "delay", mechanic: "povChain" },
  { id: "PovLineman", when: "视角接替②：前沿电话兵", nowAt: "delay", mechanic: "povChain" },
  { id: "PovXiaoqin", when: "视角接替③：通信兵小秦（接终章）", nowAt: "delay", mechanic: "povChain" },
];

export const CHAPTER = {
  id: "CH5_Chengqiang",
  title: "第五关 · 城墙没有了",
  place: "城内 A 区废墟 → 十字街口 → 西街长街 → 西关城门",
  date: "一九三八年三月十七日 清晨 — 午后",
  clock: "03-17 06:00 — 15:00",
  sky: "dawn",
  music: "wallPressure",
  minutes: 20,
  pool: { start: 96, end: 44, label: "城里还站着的人", presumed: true },
  brief: [
    "建制消失，岗位不断有人补上：炊事兵被临时拉上机枪位，原射手只来得及交代两句。",
    "负伤排长下的是明确军令：出了西关，跟他们一起往临城方向走，不用再回来。",
    "玩家真正看见生路之后，顺子才主动放弃它。",
  ],
  objectives: [
    "在废墟里醒来，领撤离命令",
    "护送后送队穿过十字街口",
    "带队进西街长街",
    "接过最后一个火力点的机枪，掩护最后一副担架",
    "撤到西关城门内侧",
    "撤出滕县 —— 通过西关",
    "返回最后火力点",
  ],
  zones: [
    { id: "C5_AidRuin", name: "A 区废墟 · 清晨", x: 214, z: -30, radius: 30 },
    { id: "C5_Crossroad", name: "十字街口", x: 0, z: 0, radius: 20 },
    { id: "C5_WestStreet", name: "西街长街", x: -160, z: 0, radius: 24 },
    { id: "C5_GunNest", name: "最后一个火力点", x: -230, z: 0, radius: 20 },
    { id: "C5_GateInner", name: "西关城门内侧", x: -278, z: 0, radius: 20 },
    { id: "C5_GateOut", name: "西关城门外 · 生路", x: -330, z: 0, radius: 26 },
    { id: "C5_ReturnGun", name: "返回最后火力点", x: -215, z: 0, radius: 20 },
  ],
  tuning: {
    bounds: { minX: -370, maxX: 285, minZ: -190, maxZ: 140 },
    // 西门、十字街口与西门大街共用 z=0 的直瞄轴；远平面收到 400 m 就够。
    cameraFar: 400,
    spawn: { x: 240, z: -65, ry: Math.PI / 2 },
    ijaPressure: 1.9, ijaSpawn: ["west", "south"], ijaSupport: ["hmg", "launcher"],
    ijaForce: { lmgEvery: 13, hmgTeams: 2, engineers: true, armor: 0, motorTransport: "rearOnly" },
    ijaPool: 460,
    // 西城门楼上那挺沿街扫射的重机枪（史料：3/17 17 时日军夺西城门楼后向十字街口扫射）。
    corridorGun: { x: -300, z: 0, y: 13.0, note: "西城门楼到十字街口是一条通视的直街" },
    // 打到这儿，子弹得从倒下的人身上取。
    loadout: "L4_LastFiveMinutes",
  },
  beats: [
    { at: "start", type: "title", text: "城墙没有了", sub: "一九三八年三月十七日 清晨　城内", tier: "主流" },
    { at: "delay:3.0", type: "objective", text: "在废墟里醒来，领撤离命令" },

    // ── ① A 区废墟清晨 ────────────────────────────────────────────────────
    // 同一个院子的第三次出场：三关有序、四关挤满、五关塌了一半。熟人缺席是靠
    // 「问一个人在哪儿，回答的是个不认识的卫生兵」表现的，不靠旁白说。
    { at: "delay:2.4", type: "env", text: "墙塌了半边。药箱是空的。电话线断在门框上。", tier: "环境" },
    { at: "delay:3.4", type: "env", text: "靠墙那副门板担架上盖着白布。没有人去掀。", tier: "环境" },
    { at: "delay:3.4", type: "line", who: "shunzi", text: "幺娃喃？", voice: "ch5_shunzi_01", tier: "虚构" },
    { at: "delay:2.6", type: "line", who: "junyi", text: "在后送队那边。", voice: "ch5_junyi_01", tier: "虚构" },

    // ── ② 明确撤离命令 ───────────────────────────────────────────────────
    // 军令必须是**明确的、可复述的**：去哪儿、跟谁走、要不要回来。三句缺一句，
    // 玩家就会把后面的折返读成「他本来也没得选」。
    { at: "delay:3.2", type: "line", who: "paizhang", text: "你跟后送队去西街口。", voice: "ch5_paizhang_01", tier: "虚构" },
    { at: "delay:2.8", type: "line", who: "paizhang", text: "出了西关，跟他们一起往临城方向走。", voice: "ch5_paizhang_02", tier: "虚构" },
    { at: "delay:3.0", type: "line", who: "paizhang", text: "不用再回来。", voice: "ch5_paizhang_03", tier: "虚构" },
    // 任务文字口径：这一刻起 HUD 上写的是「护送后送队撤出滕县」（§6 阶段②）
    { at: "delay:0.8", type: "objective", text: "护送后送队撤出滕县" },
    { at: "delay:2.6", type: "line", who: "shunzi", text: "出了城就不用回来了？", voice: "ch5_shunzi_02", tier: "虚构" },
    { at: "delay:2.4", type: "line", who: "paizhang", text: "不用。", voice: "ch5_paizhang_04", tier: "虚构" },
    { at: "delay:2.6", type: "line", who: "paizhang", text: "能出去就算你命大。", voice: "ch5_paizhang_05", tier: "虚构" },

    // ── ③ 穿过旧场景（无旁白）─────────────────────────────────────────────
    // 三条 env 只报**看见的东西**，不解释这是第几关来过的地方 —— 认出来是玩家的事。
    // 摆件见头注 ENGINE_REQUEST 第 10 条（dressingEcho）。
    { at: "delay:9.0", type: "env", text: "街垒塌了。投掷位上还堆着手榴弹箱的碎木。", tier: "环境" },
    { at: "delay:8.0", type: "env", text: "烧黑的弹药箱盖上压着纸灰，风一吹就散。", tier: "环境" },
    { at: "delay:7.0", type: "env", text: "碎碗。半只搪瓷缸。院墙塌了一半。", tier: "环境" },

    // ── ④ 全军情绪：只剩口令 ──────────────────────────────────────────────
    // 五关的班组不再闲聊（§0 全队情绪表）：报位置、报弹药、喊伤员、补位。
    { at: "zone:C5_Crossroad", type: "objective", text: "护送后送队穿过十字街口" },
    { at: "delay:1.6", type: "shout", who: "danjiayuan", text: "哪边还能走？", voice: "ch5_danjiayuan_01", tier: "虚构" },
    { at: "delay:2.4", type: "shout", who: "danjiayuan", text: "这副担架先过！", voice: "ch5_danjiayuan_02", tier: "虚构" },
    { at: "delay:2.4", type: "shout", who: "liuwencai", text: "机枪还有多少弹？", voice: "ch5_liuwencai_01", tier: "虚构" },
    { at: "delay:2.4", type: "shout", who: "paizhang", text: "哪个会打机枪？", voice: "ch5_paizhang_06", tier: "虚构" },
    { at: "delay:2.2", type: "shout", who: "paizhang", text: "不会就学！", voice: "ch5_paizhang_07", tier: "虚构" },
    // 建制消失、岗位不断有人补上：炊事兵上机枪位，原射手只来得及交代三句。
    // 交代的人给赵德贵（§8：老成持重、管弹药纪律）——五关里他最后一次开口就是这三句。
    { at: "delay:2.6", type: "env", text: "炊事兵把饭挑子靠在墙根，趴到机枪后头。", tier: "环境" },
    { at: "delay:2.6", type: "line", who: "zhaodegui", text: "枪托抵稳。", voice: "ch5_zhaodegui_01", tier: "虚构" },
    { at: "delay:2.2", type: "line", who: "zhaodegui", text: "短点射。", voice: "ch5_zhaodegui_02", tier: "虚构" },
    { at: "delay:2.2", type: "line", who: "zhaodegui", text: "莫一直压。", voice: "ch5_zhaodegui_03", tier: "虚构" },
    { at: "delay:2.6", type: "shout", who: "s124", text: "屋顶有人！", voice: "ch5_s124_01", tier: "虚构" },
    { at: "delay:2.4", type: "shout", who: "junyi", text: "伤兵先走！", voice: "ch5_junyi_02", tier: "虚构" },

    // ── ⑤ 分段护送战 ─────────────────────────────────────────────────────
    { at: "zone:C5_WestStreet", type: "objective", text: "带队进西街长街" },
    { at: "delay:2.6", type: "system", text: "护送段：清院墙、掩护担架过路口、帮机枪组重新架枪。", tier: "系统" },
    { at: "delay:3.4", type: "env", text: "街尽头是亮的。城门开着，门外是大路和麦地。", tier: "环境" },

    // ── ⑥ 最后一个火力点 ─────────────────────────────────────────────────
    { at: "zone:C5_GunNest", type: "objective", text: "接过最后一个火力点的机枪，掩护最后一副担架" },
    { at: "delay:1.6", type: "env", text: "掩护长街的那挺机枪停了。射手还趴在枪身上。", tier: "环境" },
    { at: "delay:2.6", type: "shout", who: "paizhang", text: "打一梭！", voice: "ch5_paizhang_08", tier: "虚构" },
    { at: "delay:2.2", type: "shout", who: "paizhang", text: "最后一副担架过去就撤！", voice: "ch5_paizhang_09", tier: "虚构" },
    { at: "delay:2.6", type: "shout", who: "paizhang", text: "撤下来以后直接出西关！", voice: "ch5_paizhang_10", tier: "虚构" },
    { at: "delay:3.0", type: "system", text: "接管机枪：控住过热，先打掷弹筒，封住两侧院门。", tier: "系统" },
    // 差事完了 —— 这是「你可以走」的第一重确认（军令）
    { at: "delay:14.0", type: "shout", who: "paizhang", text: "够了！", voice: "ch5_paizhang_11", tier: "虚构" },
    { at: "delay:2.2", type: "shout", who: "paizhang", text: "你的差事完了！", voice: "ch5_paizhang_12", tier: "虚构" },
    { at: "delay:2.4", type: "shout", who: "paizhang", text: "跟队伍出城！", voice: "ch5_paizhang_13", tier: "虚构" },
    { at: "delay:0.8", type: "objective", text: "撤出滕县" },

    // ── ⑦ 生路三重确认 ───────────────────────────────────────────────────
    // ①军令（上面排长那三句 + 这里的喊话）②画面（门开着、城外的路、离城的队伍）
    // ③HUD 任务文字。三条都到位，玩家才会把后面的折返读成**选择**而不是剧情安排。
    { at: "zone:C5_GateInner", type: "objective", text: "撤到西关城门内侧" },
    { at: "delay:1.4", type: "shout", who: "paizhang", text: "伤员出城！", voice: "ch5_paizhang_14", tier: "虚构" },
    { at: "delay:2.2", type: "shout", who: "junyi", text: "过了门就往南走！", voice: "ch5_junyi_03", tier: "虚构" },
    { at: "delay:2.2", type: "shout", who: "danjiayuan", text: "莫停！", voice: "ch5_danjiayuan_03", tier: "虚构" },
    { at: "delay:2.6", type: "env", text: "门洞外面是大路、麦地、天。抬伤员的队伍正往南去。", tier: "环境" },
    { at: "delay:2.0", type: "objective", text: "撤出滕县 —— 通过西关" },

    // ── ⑧ 身后的火力停止 ─────────────────────────────────────────────────
    // 玩家此刻站在城门口（C5_GateOut 在城外）：门在前面，路在外面，任务写着撤出滕县。
    // 任务文字要**再保留几秒**才更新（ENGINE_REQUEST turnBack (a)）。
    { at: "zone:C5_GateOut", type: "env", text: "身后的机枪停了。长街上只剩脚步和喊声。", tier: "环境" },
    { at: "delay:1.6", type: "shout", who: "yaowa", text: "顺哥！", voice: "ch5_yaowa_01", tier: "虚构" },
    { at: "delay:1.8", type: "shout", who: "yaowa", text: "机枪停了！", voice: "ch5_yaowa_02", tier: "虚构" },
    { at: "delay:1.8", type: "shout", who: "yaowa", text: "他们追上来了！", voice: "ch5_yaowa_03", tier: "虚构" },
    { at: "delay:2.2", type: "env", text: "街那头担架落了地，伤员在叫。日军的枪声进了长街。", tier: "环境" },
    { at: "delay:2.4", type: "shout", who: "shunzi", text: "幺娃！", voice: "ch5_shunzi_04", tier: "虚构" },
    { at: "delay:1.8", type: "shout", who: "shunzi", text: "把人抬稳！", voice: "ch5_shunzi_05", tier: "虚构" },
    { at: "delay:2.4", type: "line", who: "yaowa", text: "你啷个又回来了？", voice: "ch5_yaowa_04", tier: "虚构" },
    { at: "delay:2.2", type: "shout", who: "shunzi", text: "你们走！", voice: "ch5_shunzi_06", tier: "虚构" },
    { at: "delay:1.8", type: "shout", who: "shunzi", text: "老子回去压住！", voice: "ch5_shunzi_07", tier: "虚构" },
    // ★ CS_Ch5_TurnBack（8.5 s）在这一拍关中播放 —— 见 cutsceneMid 与 ENGINE_REQUEST 5(b)。
    { at: "delay:0.8", type: "objective", text: "返回最后火力点" },

    // ── ⑨ 返回机枪位 ─────────────────────────────────────────────────────
    { at: "delay:4.0", type: "env", text: "边退边打。担架队在身后，一段一段往城门挪。", tier: "环境" },
    { at: "zone:C5_ReturnGun", type: "system", text: "重占机枪位。掩护还在挪的担架队。", tier: "系统" },

    // ── ⑩ 最后防守（三层）────────────────────────────────────────────────
    // ①机枪压制
    { at: "delay:2.4", type: "shout", who: "shunzi", text: "走！", voice: "ch5_shunzi_08", tier: "虚构" },
    { at: "delay:1.8", type: "shout", who: "shunzi", text: "莫停！", voice: "ch5_shunzi_09", tier: "虚构" },
    { at: "delay:2.0", type: "shout", who: "shunzi", text: "伤员先出城！", voice: "ch5_shunzi_10", tier: "虚构" },
    { at: "delay:2.2", type: "shout", who: "shunzi", text: "幺娃，莫回头！", voice: "ch5_shunzi_11", tier: "虚构" },
    // ②机枪失效（gunJam）：拉枪机、骂、改步枪＋手榴弹
    { at: "delay:8.0", type: "system", text: "机枪卡壳，弹也快完了。改步枪和手榴弹。", tier: "系统" },
    { at: "delay:1.2", type: "shout", who: "shunzi", text: "妈卖批！", voice: "ch5_shunzi_12", tier: "虚构" },
    { at: "delay:1.6", type: "shout", who: "shunzi", text: "早不卡晚不卡！", voice: "ch5_shunzi_13", tier: "虚构" },
    // ③敌军逼近：最后一名友军倒下 → 先朝后送队喊，再对日军吼
    { at: "delay:7.0", type: "env", text: "两个方向都进来了。最后一个还站着的人倒在院门口。", tier: "环境" },
    { at: "delay:2.2", type: "shout", who: "shunzi", text: "走！", voice: "ch5_shunzi_08", tier: "虚构" },
    { at: "delay:1.8", type: "shout", who: "shunzi", text: "哪个都莫回头！", voice: "ch5_shunzi_14", tier: "虚构" },
    { at: "delay:2.0", type: "env", text: "刺刀卡进枪口座。", tier: "环境" },
    // ★ §0 验收结果第 6 条：这四句一个字都不许改、不许调顺序、四句全是 shout 档。
    { at: "delay:1.6", type: "shout", who: "shunzi", text: "狗日的小日本！", voice: "ch5_shunzi_15", tier: "虚构" },
    { at: "delay:1.6", type: "shout", who: "shunzi", text: "后头都是伤兵！", voice: "ch5_shunzi_16", tier: "虚构" },
    { at: "delay:1.8", type: "shout", who: "shunzi", text: "你们一个都莫想过去！", voice: "ch5_shunzi_17", tier: "虚构" },
    { at: "delay:1.8", type: "shout", who: "shunzi", text: "老子今天不走了——来啊！", voice: "ch5_shunzi_18", tier: "虚构" },
    // 远处中国士兵回应的那一声。给了 who/voice 而不是留空 —— Script_Story 对**没有语音的
    // shout** 会补一声哨子当替身（`audio.Play("whistle")`），在这一拍等于给最后的怒吼
    // 盖一层噪音。定位交给宿主：这一声要在远处响（ENGINE_REQUEST 9）。
    { at: "delay:1.4", type: "shout", who: "s124", text: "杀！", voice: "ch5_s124_03", tier: "虚构" },

    // ── ⑪ 最终白刃战 ─────────────────────────────────────────────────────
    // 守不住整条街。唯一目标是把最后一副担架送出视野 —— 不是打赢。
    { at: "delay:1.2", type: "objective", text: "坚持到最后一副担架离开视野" },
    { at: "delay:2.2", type: "system", text: "体力不会回满。能退的地方越来越少。", tier: "系统" },
    // 中弹倒地：无完整遗言，只有怒吼与喘息（走实录，见 ENGINE_REQUEST 8）
    { at: "delay:24.0", type: "narration", text: "后送队消失在西关方向。落地的时候，远处还有中国军队的枪声。", tier: "虚构" },

    // ── ⑫ 视角接替（三段）────────────────────────────────────────────────
    // 岗位继续有人补上：番号早就混在一起了。三段都保持玩家控制（povChain）。
    { at: "delay:3.0", type: "system", text: "视角接替：一二四师机枪副射手。", tier: "系统" },
    { at: "delay:2.2", type: "line", who: "canmou", text: "你会不会打？", voice: "ch5_canmou_01", tier: "虚构" },
    { at: "delay:2.4", type: "line", who: "s124", text: "看过两回。", voice: "ch5_s124_02", tier: "虚构" },
    { at: "delay:10.0", type: "system", text: "视角接替：前沿电话兵。", tier: "系统" },
    { at: "delay:3.0", type: "env", text: "炊事兵拿枪，医护兵搬弹，参谋守街。番号早混在一起了。", tier: "环境" },
    { at: "delay:3.4", type: "line", who: "xiaoqin", text: "东关？东关回话。", voice: "ch5_xiaoqin_01", tier: "虚构" },
    { at: "delay:3.0", type: "system", text: "视角接替：通信兵小秦。", tier: "系统" },
    { at: "delay:2.2", type: "line", who: "xiaoqin", text: "东关？", voice: "ch5_xiaoqin_02", tier: "虚构" },
    { at: "delay:2.2", type: "shout", who: "xiaoqin", text: "听到回话！", voice: "ch5_xiaoqin_03", tier: "虚构" },
    { at: "end", type: "narration", text: "东关没有回话。把最后的情况记下来，转身进师部。", tier: "虚构" },
  ],
  cutsceneIn: null,
  // 关末播的是**视角接替**（§6 过场 2）：顺子倒下不切黑 → 担架离开街道 → 124 师伤兵
  // → 电话兵中弹、听筒落地，「东关？东关回话。」的声音直接衔接终章。
  cutsceneOut: "CS_Ch5_PovChain",
  // 关**中**播的转身（§6 过场 1，8.5 s）。引擎还没有这个钩子 —— 见 ENGINE_REQUEST 5(b)；
  // 在接线之前它只是数据，Data_TengxianScript 不读这个字段。
  cutsceneMid: "CS_Ch5_TurnBack",
  mechanics: {
    emplacedGun: true,        // 接管机枪位：控过热、优先打掷弹筒、封两侧院门
    gunJam: true,             // 机枪失效：卡壳/弹尽 → 改步枪 + 手榴弹
    escortConvoy: true,       // 分段护送战：掩护担架过路口、帮机枪组重新架枪
    escapeOffered: true,      // 三重确认生路：军令 + 打开的城门与城外道路 + HUD 任务
    turnBack: true,           // 身后火力停止 → 顺子主动折返（任务更新【返回最后火力点】）
    lastBayonet: true,        // 最终白刃战：两侧夹击、体力不回满、活动空间缩小
    povChain: true,           // 视角接替三段：机枪副射手 → 电话兵 → 小秦
  },
};

// ===========================================================================
// 本章语音行（格式：docs/Data_AudioAssets.md「章节剧情语音」；拼表与体检在 Data_Voice）
//
//   · key = ch5_<who>_<两位序号>，who 必须与 key 中段一致且在 STORY_CAST_IDS 里；
//   · dur: 0 是**必须写的占位**，烘完由 Script_VoiceBake 把实测时长写回这一行；
//   · delivery：normal 常态 / shout 战场急喊 / weak 负伤脱力（whisper 本章用不上）。
//
// 不在这张表里的那一处声音：**顺子倒地后的怒吼与喘息** —— 非语言嗓音，
// SeedAudio 做不像，走免版税实录 sample，登记在头注 ENGINE_REQUEST 第 8 条。
// 有词的四连吼相反，它们是台词，照常走 shout 档 TTS。
// ===========================================================================

export const VOICE_LINES = [
  // --- 顺子（玩家）：18 条。四连吼（15—18）是 §0 验收结果第 6 条，全 shout ---
  { key: "ch5_shunzi_01", who: "shunzi", delivery: "normal", dur: 0.49, text: "幺娃喃？" },
  { key: "ch5_shunzi_02", who: "shunzi", delivery: "normal", dur: 2.52, text: "出了城就不用回来了？" },
  { key: "ch5_shunzi_03", who: "shunzi", delivery: "normal", dur: 1.50, text: "我晓得。你们走。" },
  { key: "ch5_shunzi_04", who: "shunzi", delivery: "shout", dur: 0.49, text: "幺娃！" },
  { key: "ch5_shunzi_05", who: "shunzi", delivery: "shout", dur: 0.63, text: "把人抬稳！" },
  { key: "ch5_shunzi_06", who: "shunzi", delivery: "shout", dur: 0.46, text: "你们走！" },
  { key: "ch5_shunzi_07", who: "shunzi", delivery: "shout", dur: 1.80, text: "老子回去压住！" },
  { key: "ch5_shunzi_08", who: "shunzi", delivery: "shout", dur: 0.21, text: "走！" },
  { key: "ch5_shunzi_09", who: "shunzi", delivery: "shout", dur: 0.58, text: "莫停！" },
  { key: "ch5_shunzi_10", who: "shunzi", delivery: "shout", dur: 1.69, text: "伤员先出城！" },
  { key: "ch5_shunzi_11", who: "shunzi", delivery: "shout", dur: 1.56, text: "幺娃，莫回头！" },
  { key: "ch5_shunzi_12", who: "shunzi", delivery: "shout", dur: 0.82, text: "妈卖批！" },
  { key: "ch5_shunzi_13", who: "shunzi", delivery: "shout", dur: 1.40, text: "早不卡晚不卡！" },
  { key: "ch5_shunzi_14", who: "shunzi", delivery: "shout", dur: 0.82, text: "哪个都莫回头！" },
  { key: "ch5_shunzi_15", who: "shunzi", delivery: "shout", dur: 1.41, text: "狗日的小日本！" },
  { key: "ch5_shunzi_16", who: "shunzi", delivery: "shout", dur: 1.52, text: "后头都是伤兵！" },
  { key: "ch5_shunzi_17", who: "shunzi", delivery: "shout", dur: 2.14, text: "你们一个都莫想过去！" },
  { key: "ch5_shunzi_18", who: "shunzi", delivery: "shout", dur: 1.93, text: "老子今天不走了——来啊！" },

  // --- 幺娃：五关只问一句「你啷个又回来了？」，不再说「怕个鸭儿」（§8）---
  { key: "ch5_yaowa_01", who: "yaowa", delivery: "shout", dur: 0.52, text: "顺哥！" },
  { key: "ch5_yaowa_02", who: "yaowa", delivery: "shout", dur: 0.75, text: "机枪停了！" },
  { key: "ch5_yaowa_03", who: "yaowa", delivery: "shout", dur: 1.09, text: "他们追上来了！" },
  { key: "ch5_yaowa_04", who: "yaowa", delivery: "normal", dur: 2.13, text: "你啷个又回来了？" },
  { key: "ch5_yaowa_05", who: "yaowa", delivery: "shout", dur: 2.20, text: "顺哥！最后一副都过了！" },

  // --- 负伤排长：军令三句（01—03）是「生路」的第一重确认，语气不许含糊 ---
  { key: "ch5_paizhang_01", who: "paizhang", delivery: "normal", dur: 2.33, text: "你跟后送队去西街口。" },
  { key: "ch5_paizhang_02", who: "paizhang", delivery: "normal", dur: 4.36, text: "出了西关，跟他们一起往临城方向走。" },
  { key: "ch5_paizhang_03", who: "paizhang", delivery: "normal", dur: 0.83, text: "不用再回来。" },
  { key: "ch5_paizhang_04", who: "paizhang", delivery: "normal", dur: 0.23, text: "不用。" },
  { key: "ch5_paizhang_05", who: "paizhang", delivery: "normal", dur: 1.95, text: "能出去就算你命大。" },
  { key: "ch5_paizhang_06", who: "paizhang", delivery: "shout", dur: 0.89, text: "哪个会打机枪？" },
  { key: "ch5_paizhang_07", who: "paizhang", delivery: "shout", dur: 0.63, text: "不会就学！" },
  { key: "ch5_paizhang_08", who: "paizhang", delivery: "shout", dur: 1.30, text: "打一梭！" },
  { key: "ch5_paizhang_09", who: "paizhang", delivery: "shout", dur: 2.54, text: "最后一副担架过去就撤！" },
  { key: "ch5_paizhang_10", who: "paizhang", delivery: "shout", dur: 2.58, text: "撤下来以后直接出西关！" },
  { key: "ch5_paizhang_11", who: "paizhang", delivery: "shout", dur: 0.58, text: "够了！" },
  { key: "ch5_paizhang_12", who: "paizhang", delivery: "shout", dur: 1.49, text: "你的差事完了！" },
  { key: "ch5_paizhang_13", who: "paizhang", delivery: "shout", dur: 0.66, text: "跟队伍出城！" },
  { key: "ch5_paizhang_14", who: "paizhang", delivery: "shout", dur: 0.65, text: "伤员出城！" },

  // --- 军医/卫生兵：回答「幺娃喃？」的是个不认识的人（熟人缺席） ---
  { key: "ch5_junyi_01", who: "junyi", delivery: "normal", dur: 0.85, text: "在后送队那边。" },
  { key: "ch5_junyi_02", who: "junyi", delivery: "shout", dur: 0.72, text: "伤兵先走！" },
  { key: "ch5_junyi_03", who: "junyi", delivery: "shout", dur: 2.35, text: "过了门就往南走！" },

  // --- 担架员：说话夹在喘气里 ---
  { key: "ch5_danjiayuan_01", who: "danjiayuan", delivery: "shout", dur: 0.81, text: "哪边还能走？" },
  { key: "ch5_danjiayuan_02", who: "danjiayuan", delivery: "shout", dur: 1.05, text: "这副担架先过！" },
  { key: "ch5_danjiayuan_03", who: "danjiayuan", delivery: "shout", dur: 0.61, text: "莫停！" },

  // --- 刘文财：数数变成控制恐惧的方式（§8），五关只剩这一句 ---
  { key: "ch5_liuwencai_01", who: "liuwencai", delivery: "shout", dur: 0.85, text: "机枪还有多少弹？" },

  // --- 赵德贵：原射手交代给炊事兵的三句。短、干、不解释 ---
  { key: "ch5_zhaodegui_01", who: "zhaodegui", delivery: "normal", dur: 1.10, text: "枪托抵稳。" },
  { key: "ch5_zhaodegui_02", who: "zhaodegui", delivery: "normal", dur: 0.88, text: "短点射。" },
  { key: "ch5_zhaodegui_03", who: "zhaodegui", delivery: "normal", dur: 1.19, text: "莫一直压。" },

  // --- 124 师伤兵：五关末视角①的机枪副射手（§8）。「看过两回」走 weak（气力不足）---
  { key: "ch5_s124_01", who: "s124", delivery: "shout", dur: 0.65, text: "屋顶有人！" },
  { key: "ch5_s124_02", who: "s124", delivery: "weak", dur: 0.80, text: "看过两回。" },
  // 顺子吼完之后，街那头回的那一声（定位见 ENGINE_REQUEST 9）
  { key: "ch5_s124_03", who: "s124", delivery: "shout", dur: 0.60, text: "杀！" },

  // --- 通信参谋：守街的参谋顺口问一句（§6 阶段⑫「参谋守街」）---
  { key: "ch5_canmou_01", who: "canmou", delivery: "normal", dur: 0.95, text: "你会不会打？" },

  // --- 小秦：01 是听筒里传出来的那一句（过场 CS_Ch5_PovChain 用同一条 key，
  //     声音直接衔接终章）；02/03 是他自己敲听筒时的两句 ---
  { key: "ch5_xiaoqin_01", who: "xiaoqin", delivery: "normal", dur: 1.92, text: "东关？东关回话。" },
  { key: "ch5_xiaoqin_02", who: "xiaoqin", delivery: "normal", dur: 0.57, text: "东关？" },
  { key: "ch5_xiaoqin_03", who: "xiaoqin", delivery: "shout", dur: 0.68, text: "听到回话！" },
];
