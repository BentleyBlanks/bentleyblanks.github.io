// Data_MissionCh2.mjs — 第二关｜手榴弹雨。规格：docs/Data_MissionRemake.md §3（正文）与 §10（契约）。
// 本文件由基建批建骨架、章节内容批填实。不许 import three，不许 Math.random。
//
// ---------------------------------------------------------------------------
// 场景基底：东关外壕（旧 L2_Dongguan 那一片切片）
//
// 东关不是一堵坚固的墙，是一片可以被打穿的、家家有枪眼的院落迷宫 ——
// 日方自己的战后检讨：「对守军有利的不是城墙的高度与坚固，而是外城的存在
// 与环绕城墙的密集民房的存在。」寨墙高 2 m、顶宽 0.4 m（日方实测），一炮一个口。
//
// bounds / spawn 沿用旧 L2：spawn 在东门大街清路中央（x=446），2026-08-27 那次
// 「开局贴着院墙满屏是砖」的事故就是在这条线上修的，别再往东挪。
// ---------------------------------------------------------------------------
//
// ---------------------------------------------------------------------------
// 演出取舍（§3「过场动画」那一条的落地）
//
// **本关不设传统开场动画**，五个阶段全部是可控战斗，核心演出嵌在里面：
//   · 压枪口「莫打。／再近点。／稳到！」→「甩！」——罗班长四句用 whisper→shout
//     的递进走 delivery 档（ch2_luo_01..04），玩家一直握着枪，镜头不接管；
//   · 白刃战前只有一句口令（「上刺刀！」「认到人再下手！」），没有慢镜没有特写；
//   · 战后何有田墙角呕吐、幺娃「杀鸡」话头落空，也全在玩家能自由转视角的时候发生；
//   · 撤到后街之后的**清点**（罗班长连喊两个名字无人应 → 何有田抱铁锅出来）
//     同样是 beats，不是过场 —— 让玩家站在人堆里听那两声没人答应的点名。
// 关末只留一镜黑场收束（CS_Ch2_AfterBayonet，9 s）：旧阵地在炮击里塌掉、
// 班还在、名字少了两个。**不做**日军受挫的胜利镜头，不把局部击退包装成守住东关。
// ---------------------------------------------------------------------------
//
// ---------------------------------------------------------------------------
// EVENTS —— 本章 beats 用到的事件名（`at: "event:*"`）
//
//   BayonetDone   第一次白刃战打完（缺口内日军被清空）。用来接呕吐/「莫说了」那一组。
//                 2026-08-29 集成批 INT2：判据从 Script_Story 的补丁表
//                 （SUPPLEMENT_CUES）搬回本文件的 `export const EVENTS`
//                 —— 一个事件的名字与兜底判据从此只有一处，那一处就是这里。
//                 真发生（缺口内日军清空）时由 Script_MissionSetpieces 推
//                 `story.Signal("BayonetDone")`，推过的永远优先于兜底。
//
// 其余四个阶段一律挂在本章自己的 zones 上（zone:C2_*），不依赖任何未实现的信号。
// ---------------------------------------------------------------------------
//
// ---------------------------------------------------------------------------
// ENGINE_REQUEST —— 本章需要的引擎能力（契约 §10.4：内容批只登记，集成批统一实现）
//
// 1. grenadeRain（集中投弹 → 手榴弹雨）
//    要的是「玩家与背景守军**同时**投」。现在背景守军没有听导演口令齐投的接口，
//    玩家一个人甩出去只会是三颗手榴弹，不是史料里那场雨。
//    建议：规则层在罗班长「甩！」那一拍（beat.voice === "ch2_luo_04"，或装配层自己
//    Signal("GrenadeVolley")）对 C2_Ditch 半径内的友军 AI 下一次 throwAt，
//    起手同帧、落点在 0.3—0.8 s 内错开；投出去的弹与玩家的走同一套弹道与伤害。
//    数量口径见 brief：集中六七十人、连续二三百枚。
//
// 2. crateHauling（拖弹箱 / 受潮弹 / 拖走将被引爆的箱子）
//    弹药箱要成为可交互实体，三个状态：
//      ① 拖动：进搬运态（移速 ≈0.55、不能开枪、可主动放下），与第一关担架搬运
//         共用同一条输入闸最省事；
//      ② 受潮弹单独码：拖到指定点算完成，混进好弹堆里要有一次失败反馈；
//      ③ 将被引爆：掷弹筒命中后冒烟倒计时 4—6 s，拖出 6 m 算救下，否则连锁殉爆。
//    现在 mechanics.crateHauling 只有旗标没有实现，第一、第三阶段的玩家动作全落空。
//
// 3. 白刃 QTE 接入（引擎已有，缺的是正片触发点）
//    模块：Script_MeleeQte.MeleeQteDirector（BeginBlock / TryBeginExecution，
//    三套格挡 + 三套处决在 Data_MeleeQte.MELEE_BLOCK_PATTERNS / MELEE_EXECUTION_PATTERNS）。
//    正片接入方式：
//      · 触发点＝本章 zone:C2_BackStreet 的坍塌缺口段。日军进入 MELEE_QTE.blockReachM
//        (2.15 m) 且面朝玩家时由 AI 调 director.BeginBlock(attacker)；玩家反打走
//        TryBeginExecution（F），与训练场同一套输入与判定，不另写一份。
//      · 这是全作**第一次**白刃战：第一次 BeginBlock 前 HUD 要给一次按键提示
//        （之后不再提示）。
//      · 该段禁用训练场的 trainingResetS 自动复位（正片没有木桩，复位会把敌人变回站桩）。
//      · 缺口内日军清空时 story.Signal("BayonetDone")（见 ENGINE_REQUEST 4）。
//
// 4. LEVEL_CUES 缺 CH2_Shouliudan 表 —— **已解决**（INT2，2026-08-29）
//    本文件补了 `export const EVENTS`，Script_Story.BuildLevelCues 照它自动建表；
//    Script_Story 里那条 SUPPLEMENT_CUES 补丁同批删掉（判据只留一处）。
// ---------------------------------------------------------------------------

/**
 * 本章的关内事件线。字段口径见 docs/Data_MissionRemake.md §10.6：
 * 名字字段三选一（name / event / id）、兜底判据三选一（fallback / predicate / cue），
 * Script_Story.BuildLevelCues 一律认。
 *
 * 判据照的是本文件头注 ENGINE_REQUEST 4 那一行原文，一个字没改 ——
 * 它原来抄在 Script_Story.SUPPLEMENT_CUES 里，INT2 搬回来了。
 */
export const EVENTS = [
  {
    name: "BayonetDone", stage: 4,
    what: "第一次白刃战打完 —— 坍塌缺口内的日军被清空",
    signal: "Script_MeleeQte 的那一段结束、缺口半径内没有活着的日军时由摆点层推",
    fallback: "(c) => c.objectiveIndex >= 4 || c.levelTime > c.levelSeconds * 0.72",
  },
];

export const CHAPTER = {
  id: "CH2_Shouliudan",
  title: "第二关 · 手榴弹雨",
  place: "滕县东关 · 外壕、寨门、关厢院落、寺院地",
  date: "一九三八年三月十六日 十时三十分 — 十七时",
  clock: "03-16 10:30 — 17:00",
  sky: "smokyDay",
  music: "siege",
  // 二关：还是那五个人。这一关没有外来番号，也没有医护 ——
  // 东关外壕上就是这一个班在守（§3）。
  // 顺序同样照「首次开口的先后」（＝INT2 之前 RosterFromBeats 的输出逐字同序）。
  // 理由见 Data_MissionCh1 那张表上面的长注释：名册顺序 = ai.Spawn 的调用顺序，
  // 换个顺序就把这一关的 AI 决策整条重排。
  roster: ["zhaodegui", "yaowa", "liuwencai", "heyoutian", "luo"],
  minutes: 18,
  pool: { start: 208, end: 168, label: "城里还站着的人", presumed: true },
  brief: [
    "集中手榴弹 + 近距离防御 + 白刃战，阻止日军突破东关。",
    "史料：集中六七十人向壕沟内连续猛投二三百枚手榴弹。",
    "人物变化不用台词说，用战后状态表现 —— 何有田白刃战后在墙角呕吐。",
  ],
  objectives: [
    "把弹药箱拖到投掷点，分散摆开",
    "压住枪口，等他们进外壕再甩",
    "拖走要被引爆的弹药箱，清侧翼",
    "上刺刀 —— 后街街垒的缺口",
    "交替换防，退守寺院地",
  ],
  zones: [
    { id: "C2_ZhaiGate", name: "东寨门", x: 480, z: -65, radius: 20 },
    { id: "C2_Ditch", name: "外壕", x: 500, z: -65, radius: 22 },
    { id: "C2_Courtyard", name: "关厢院落", x: 462, z: -19, radius: 26 },
    { id: "C2_BackStreet", name: "后街街垒", x: 449, z: -180, radius: 22 },
    { id: "C2_Temple", name: "寺院地", x: 427, z: -465, radius: 26 },
  ],
  tuning: {
    // 寺院地按布防图在东北延伸框（z=-465），切片必须把完整东侧 13 框一起纳入。
    // 东界放到 700：外壕以东那一带远端农院与农具布设（Data_Dressing_EastSuburb
    // 的 EastFarmFar 一组，x 到 681.5）原来靠「城墙关」那片全城切片才建得出来，
    // 重制之后只剩本章离得最近 —— 不收进来它们就是一包没人建的数据
    //（Script_TownDressingTest 的城外覆盖那一条会红）。
    bounds: { minX: 250, maxX: 700, minZ: -520, maxZ: 420 },
    spawn: { x: 446, z: -65, ry: -Math.PI / 2 },
    ijaPressure: 1.5, ijaSpawn: ["east"], ijaSupport: ["launcher", "hmg", "artillery"],
    // 日军战详报：工兵逐间爆破民房打通墙体；没有战车或装甲车参加滕县攻城。
    ijaForce: { lmgEvery: 13, hmgTeams: 2, engineers: true, armor: 0, motorTransport: "rearOnly" },
    ijaPool: 420,
    loadoutOverride: {
      primary: "HanYang", secondary: null, melee: "Dadao",
      throwables: { Grenade: 6 }, spareClips: 4,
      note: "随身六枚；这一关的手榴弹从弹药箱里源源不断地拿（见 mechanics.grenadeRain）。",
    },
  },
  // beats 的排法：**一个阶段一簇**，簇内所有条写同一个 at ——
  // Script_Story 的 sameAsPrev 会让同 at 的后续条只等 0.25 s（仍受 MIN_GAP 2 s 与
  // 语音占麦的约束），这正是「这几句一起来」的意思。第一条负责等条件，
  // 后面的跟着它走，不用每条各等一遍 95 s 的兜底。
  beats: [
    // ── 阶段一｜炮火中布置手榴弹 ────────────────────────────────────────
    { at: "start", type: "title", text: "手榴弹雨", sub: "一九三八年三月十六日 十时三十分　东关", tier: "主流" },
    { at: "delay:2.5", type: "objective", text: "把弹药箱拖到投掷点，分散摆开" },
    { at: "delay:2.5", type: "env", text: "炮弹一直在外壕那边落。碎瓦掉在肩上，没有人抬头。" },

    { at: "zone:C2_ZhaiGate", type: "env", text: "弹药箱一口一口往投掷点拖。拖过去分开摆，不敢堆到一处。" },
    { at: "zone:C2_ZhaiGate", type: "shout", who: "zhaodegui", voice: "ch2_zhaodegui_01", text: "莫拿刺刀撬箱子！", tier: "虚构" },
    { at: "zone:C2_ZhaiGate", type: "line", who: "yaowa", voice: "ch2_yaowa_01", text: "不用刺刀啷个开？", tier: "虚构" },
    { at: "zone:C2_ZhaiGate", type: "line", who: "zhaodegui", voice: "ch2_zhaodegui_02", text: "你脑壳是摆设嗦？", tier: "虚构" },
    { at: "zone:C2_ZhaiGate", type: "line", who: "liuwencai", voice: "ch2_liuwencai_01", text: "哪个龟儿子又拿走两颗？", tier: "虚构" },
    { at: "zone:C2_ZhaiGate", type: "line", who: "heyoutian", voice: "ch2_heyoutian_01", text: "拿去试受潮没得。", tier: "虚构" },
    { at: "zone:C2_ZhaiGate", type: "line", who: "liuwencai", voice: "ch2_liuwencai_02", text: "你拿嘴试！", tier: "虚构" },
    // 功能口令（策划案给了动作没给字）：受潮弹单独放，是 crateHauling 的第二个状态。
    { at: "zone:C2_ZhaiGate", type: "shout", who: "zhaodegui", voice: "ch2_zhaodegui_03", text: "受潮的单独码一边！", tier: "虚构" },

    // 心理残留：飞机不攻击也照骂。一关日机扫射之后留下来的东西。
    { at: "delay:9", type: "env", text: "天上又有飞机的声音，顺着城墙往南去。" },
    { at: "delay:9", type: "shout", who: "yaowa", voice: "ch2_yaowa_02", text: "妈卖批，又来了？", tier: "虚构" },
    { at: "delay:9", type: "env", text: "飞机没有下来。也没有人笑他。" },

    // ── 阶段二｜集中投弹 ────────────────────────────────────────────────
    { at: "zone:C2_Ditch", type: "objective", text: "压住枪口，等他们进外壕再甩" },
    { at: "zone:C2_Ditch", type: "env", text: "外壕对面的坡上开始有人往下滑。一个，接着一片。" },
    // whisper → whisper → normal → shout：四句是一条递进，delivery 见 VOICE_LINES。
    { at: "zone:C2_Ditch", type: "line", who: "luo", voice: "ch2_luo_01", text: "莫打。", tier: "虚构" },
    { at: "zone:C2_Ditch", type: "line", who: "luo", voice: "ch2_luo_02", text: "再近点。", tier: "虚构" },
    { at: "zone:C2_Ditch", type: "line", who: "luo", voice: "ch2_luo_03", text: "稳到！", tier: "虚构" },
    { at: "zone:C2_Ditch", type: "shout", who: "luo", voice: "ch2_luo_04", text: "甩！", tier: "虚构" },
    { at: "zone:C2_Ditch", type: "env", text: "六七十个人一起甩。外壕里连着炸了半分钟，二三百枚。", tier: "主流" },

    // ── 阶段三｜敌军调整战术 ────────────────────────────────────────────
    { at: "zone:C2_Courtyard", type: "objective", text: "拖走要被引爆的弹药箱，清侧翼" },
    { at: "zone:C2_Courtyard", type: "env", text: "他们换了打法：重机枪压住墙头，掷弹筒专找弹药箱。" },
    // 交流变短：只剩方向、名词、动作。
    { at: "zone:C2_Courtyard", type: "shout", who: "yaowa", voice: "ch2_yaowa_03", text: "右边！", tier: "虚构" },
    { at: "zone:C2_Courtyard", type: "shout", who: "zhaodegui", voice: "ch2_zhaodegui_04", text: "箱子拖开！", tier: "虚构" },
    { at: "zone:C2_Courtyard", type: "shout", who: "liuwencai", voice: "ch2_liuwencai_03", text: "掷弹筒！", tier: "虚构" },
    { at: "zone:C2_Courtyard", type: "shout", who: "luo", voice: "ch2_luo_05", text: "趴下！", tier: "虚构" },
    { at: "zone:C2_Courtyard", type: "env", text: "工兵在壕上铺木板。第三块已经搭过来了。" },

    // ── 阶段四｜第一次白刃战 ────────────────────────────────────────────
    { at: "zone:C2_BackStreet", type: "objective", text: "上刺刀 —— 后街街垒的缺口" },
    { at: "zone:C2_BackStreet", type: "env", text: "寨墙塌了一段。人从缺口里翻进来，隔着一个院子。" },
    { at: "zone:C2_BackStreet", type: "shout", who: "luo", voice: "ch2_luo_06", text: "上刺刀！", tier: "虚构" },
    { at: "zone:C2_BackStreet", type: "shout", who: "luo", voice: "ch2_luo_07", text: "认到人再下手！", tier: "虚构" },

    // 战后：吹牛的那个人吐了。玩笑第一次接不下去（§0 全队情绪·二关）。
    { at: "event:BayonetDone", type: "env", text: "何有田在墙角吐了。吐完扶着墙，半天没起来。" },
    { at: "event:BayonetDone", type: "line", who: "yaowa", voice: "ch2_yaowa_04", text: "你不是说杀鬼子跟杀鸡一样？", tier: "虚构" },
    { at: "event:BayonetDone", type: "line", who: "heyoutian", voice: "ch2_heyoutian_02", text: "莫说了。", tier: "虚构" },
    { at: "event:BayonetDone", type: "env", text: "他擦了嘴。这回没有人接下去。" },

    // ── 阶段五｜交替换防 ────────────────────────────────────────────────
    { at: "zone:C2_Temple", type: "objective", text: "交替换防，退守寺院地" },
    { at: "zone:C2_Temple", type: "shout", who: "luo", voice: "ch2_luo_08", text: "第一组先撤！我们压到起！", tier: "虚构" },
    // 功能口令：拆枪机 —— 带不走的枪不能留给对面（策划案阶段五的动作，没给字）。
    { at: "zone:C2_Temple", type: "shout", who: "liuwencai", voice: "ch2_liuwencai_04", text: "枪机我拆了！带不走！", tier: "虚构" },
    { at: "zone:C2_Temple", type: "shout", who: "zhaodegui", voice: "ch2_zhaodegui_05", text: "手榴弹先转过去！", tier: "虚构" },
    { at: "zone:C2_Temple", type: "shout", who: "luo", voice: "ch2_luo_09", text: "撤到第二道街垒！", tier: "虚构" },

    // 清点：两个名字没有人答应。这一段是玩家站在人堆里听的，不是过场。
    { at: "delay:26", type: "env", text: "后街的枪声稀下来。罗班长开始点名。" },
    { at: "delay:26", type: "shout", who: "luo", voice: "ch2_luo_10", text: "李长贵！", tier: "虚构" },
    { at: "delay:26", type: "shout", who: "luo", voice: "ch2_luo_11", text: "胡万清！", tier: "虚构" },
    { at: "delay:26", type: "env", text: "没有人应。第二遍喊完，只剩炮声。" },
    { at: "delay:26", type: "env", text: "何有田抱着一口铁锅从侧巷绕出来。" },
    { at: "delay:26", type: "shout", who: "heyoutian", voice: "ch2_heyoutian_03", text: "老子还活起！", tier: "虚构" },
    { at: "delay:26", type: "line", who: "liuwencai", voice: "ch2_liuwencai_05", text: "锅比命还要紧嗦？", tier: "虚构" },
    { at: "delay:26", type: "line", who: "heyoutian", voice: "ch2_heyoutian_04", text: "总得吃饭。", tier: "虚构" },
    { at: "delay:26", type: "env", text: "没有人笑。很久都没有人再开口。" },

    { at: "end", type: "narration", text: "局部把他们压回去了。东关没有守住，只是还没有丢。", tier: "主流" },
  ],
  cutsceneIn: null,
  cutsceneOut: "CS_Ch2_AfterBayonet",
  mechanics: {
    grenadeRain: true,        // 集中投弹：玩家与背景守军同时投，成「手榴弹雨」
    crateHauling: true,       // 拖弹药箱、清瓦砾、受潮弹单独放、拖走将被引爆的箱子
    bayonetFirst: true,       // 第一次白刃战：突刺、枪托、推挡、体力管理、拾大刀
    meleeQte: true,           // 白刃走 Script_MeleeQte 的格挡/处决 QTE（见 ENGINE_REQUEST 3）
    coveredWithdrawal: true,  // 交替换防：掩护第一组撤离 → 拆枪机 → 撤到第二街垒
  },
};

// 章节剧情台词（docs/Data_AudioAssets.md「章节剧情语音」）。
// key = ch2_<who>_<NN>，按每个人在本章的**出场顺序**编号；file 由 Data_Voice 推导，别手写。
// dur: 0 是占位，烘完由 Script_VoiceBake 写回这一行。
export const VOICE_LINES = [
  // 阶段一｜撬箱子那组（粗粝，但笑声已经短而勉强）
  { key: "ch2_zhaodegui_01", who: "zhaodegui", delivery: "shout", dur: 2.02, text: "莫拿刺刀撬箱子！" },
  { key: "ch2_yaowa_01", who: "yaowa", delivery: "normal", dur: 1.52, text: "不用刺刀啷个开？" },
  { key: "ch2_zhaodegui_02", who: "zhaodegui", delivery: "normal", dur: 1.43, text: "你脑壳是摆设嗦？" },
  { key: "ch2_liuwencai_01", who: "liuwencai", delivery: "normal", dur: 2.04, text: "哪个龟儿子又拿走两颗？" },
  { key: "ch2_heyoutian_01", who: "heyoutian", delivery: "normal", dur: 2.03, text: "拿去试受潮没得。" },
  { key: "ch2_liuwencai_02", who: "liuwencai", delivery: "normal", dur: 0.97, text: "你拿嘴试！" },
  { key: "ch2_zhaodegui_03", who: "zhaodegui", delivery: "shout", dur: 2.03, text: "受潮的单独码一边！" },
  // 飞机声：心理残留，不是真的又来扫射
  { key: "ch2_yaowa_02", who: "yaowa", delivery: "shout", dur: 2.11, text: "妈卖批，又来了？" },

  // 阶段二｜压枪口。whisper → whisper → normal → shout，四句是一条递进，
  // 不许拉齐音量：玩家是靠音量差听出「现在还不能出声」的。
  { key: "ch2_luo_01", who: "luo", delivery: "whisper", dur: 0.55, text: "莫打。" },
  { key: "ch2_luo_02", who: "luo", delivery: "whisper", dur: 0.31, text: "再近点。" },
  { key: "ch2_luo_03", who: "luo", delivery: "normal", dur: 0.36, text: "稳到！" },
  { key: "ch2_luo_04", who: "luo", delivery: "shout", dur: 0.43, text: "甩！" },

  // 阶段三｜交流变短
  { key: "ch2_yaowa_03", who: "yaowa", delivery: "shout", dur: 0.67, text: "右边！" },
  { key: "ch2_zhaodegui_04", who: "zhaodegui", delivery: "shout", dur: 1.41, text: "箱子拖开！" },
  { key: "ch2_liuwencai_03", who: "liuwencai", delivery: "shout", dur: 1.21, text: "掷弹筒！" },
  { key: "ch2_luo_05", who: "luo", delivery: "shout", dur: 0.34, text: "趴下！" },

  // 阶段四｜白刃战前两句口令，战后三句
  { key: "ch2_luo_06", who: "luo", delivery: "shout", dur: 0.70, text: "上刺刀！" },
  { key: "ch2_luo_07", who: "luo", delivery: "shout", dur: 1.88, text: "认到人再下手！" },
  { key: "ch2_yaowa_04", who: "yaowa", delivery: "normal", dur: 3.64, text: "你不是说杀鬼子跟杀鸡一样？" },
  // 吐完，脱力。weak 档不许抬齐到常态响度。
  { key: "ch2_heyoutian_02", who: "heyoutian", delivery: "weak", dur: 1.05, text: "莫说了。" },

  // 阶段五｜交替换防与清点
  { key: "ch2_luo_08", who: "luo", delivery: "shout", dur: 1.78, text: "第一组先撤！我们压到起！" },
  { key: "ch2_liuwencai_04", who: "liuwencai", delivery: "shout", dur: 2.19, text: "枪机我拆了！带不走！" },
  { key: "ch2_zhaodegui_05", who: "zhaodegui", delivery: "shout", dur: 1.93, text: "手榴弹先转过去！" },
  { key: "ch2_luo_09", who: "luo", delivery: "shout", dur: 1.06, text: "撤到第二道街垒！" },
  // 点名的两个名字是虚构的无名者（城内约三千人里绝大多数没有留下名字）。
  { key: "ch2_luo_10", who: "luo", delivery: "shout", dur: 0.59, text: "李长贵！" },
  { key: "ch2_luo_11", who: "luo", delivery: "shout", dur: 0.58, text: "胡万清！" },
  { key: "ch2_heyoutian_03", who: "heyoutian", delivery: "shout", dur: 1.16, text: "老子还活起！" },
  { key: "ch2_liuwencai_05", who: "liuwencai", delivery: "normal", dur: 1.72, text: "锅比命还要紧嗦？" },
  { key: "ch2_heyoutian_04", who: "heyoutian", delivery: "normal", dur: 0.91, text: "总得吃饭。" },
];
