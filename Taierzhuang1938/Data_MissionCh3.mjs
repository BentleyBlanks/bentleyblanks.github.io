// Data_MissionCh3.mjs — 第三关｜救护所。规格：docs/Data_MissionRemake.md §4（正文）与 §10（契约）。
// 本文件由基建批建骨架、章节内容批填实。不许 import three，不许 Math.random。
//
// ---------------------------------------------------------------------------
// 三个功能院落的坐标（§0「三个功能院落」的工程落点）
//
//   A 区 · 城内主救护所   (214, -30)   —— 第二区公所那一片大院（Data_Tengxian
//        的 CITY_FEATURES.EastDistrictOffice，50×74 m，城内东部最大的一组院落）
//        的北门一侧。三关、四关末、五关开头是**同一个院子**，三章共用这一个锚点，
//        谁都不许各写一份坐标。
//   B 区 · 东关临时集结院 (449, -140) —— 东关大街北段，见 Data_MissionCh4。
//   C 区 · 前沿救护点     (462, -19)  —— 东关失守街区里的小型战场救护点（本章主战场）。
//
// 之所以取第二区公所而不是书院小学/滕文中学（策划案原话是「学校/大药铺院落」）：
// 那两处在城西南 z≈220—238，第五关那条「A 区 → 西街长街 → 西关城门」的走线就要
// 把切片往南拉一百多米，而 A 区还得同时够得着东关（三关、四关都从东边回来）。
// 第二区公所在东门大街与十字街之间，三章的切片都装得下它。
// **这是可以改的选点**：内容批要换成学校，连同 CH4/CH5 的同名路标一起挪。
// —— 本轮（内容批 C3）没有挪它，锚点原样保留。
//
// 场景基底：城内 A 区院落 ＋ 东关失守街区（C 区）。切片横跨城墙东段与东关，
// spawn 沿用旧 L4 那个东门大街上的落脚点（BootTest 的 spawnRun 验过通行）。
// ---------------------------------------------------------------------------
//
// ===========================================================================
// ENGINE_REQUEST（契约 §10.4：内容批不许改共享模块，缺口在这里登记，集成批统一处理）
// ===========================================================================
//
// 下面七条是本章 beats 与两段固定演出**已经按它们写好了**的引擎缺口。没有它们，
// 台词与目标链照常能跑（Story 层不依赖任何一条），但玩家的手上是空的 ——
// 而 §0 的硬规矩是「所有低强度段落必须包含玩家动作」。
//
// ER-1 executionScene · 声音先行段（§4 阶段 7 → 阶段 8）
//   走进 C3_ForwardAid 半径 45 m 时：**先掐掉交火声**（前沿的枪声床整层淡出 1.5 s），
//   再起一条循环：间隔 9—14 s 的**单发**步枪声（rifleIja，远场混响），中间垫
//   拖动声与屋内咳嗽。玩家看不见任何东西，只能听。这一段的长度由玩家自己走多快决定，
//   不设时限。
//   · **短促惨叫走实录素材，不许交给 SeedAudio。** 理由与 hurt_scream 同
//     （docs/Data_AudioAssets.md「交付档」节：非语言嗓音 TTS 做不像，模型默认音色偏女声）。
//     本章因此**没有**给惨叫留 VOICE_LINES 行 —— 它不是台词，是环境音，
//     请在 Data_SfxSources.mjs 里按 hurt_scream 的写法登记一条更短、更闷的
//     免版税男声痛呼（建议 ≤0.7 s，掐尾，别用完整的一声「啊——」），
//     cue 名建议 execScream，由 ER-1 的循环以低概率、低音量、**永远在墙后**触发。
//   · 确认处决（玩家到达破墙观察位并看见院内）→ Signal("ExecutionConfirmed")
//     → 播 CS_Ch3_BreakWall（14.8 s，见 Data_CutsceneCh3.mjs），播完立即恢复控制。
//   · 处决段全程**不许**给玩家「击杀提示/得分」一类反馈；院内的日军在过场结束前
//     不许发现玩家（否则「确认即可开火」这条主动权就从玩家手上拿走了）。
//
// ER-2 tearShirt · 撕短褂止血（§4 阶段 10）
//   背包道具：`civilianShirt`（民用短褂）。**从序章 CH0 就在背包里**（顺子藏的那件），
//   本章之前不可用、不可丢、不进 HUD；到阶段 10 才亮出来。
//   · 大出血伤员触发【寻找可用布料】：场上刻意**搜不到**绷带（这是设计，不是缺内容）；
//   · 交互【撕开背包中的民用短褂】= 长按 1.4 s，中途松手取消、可重来；
//   · 完成后 civilianShirt 从背包**永久移除**（不可回收、不给替代品），
//     Signal("ShirtTorn")，卫生兵接手包扎。
//   · 逃跑计划的第二次失败是靠这个道具消失表达的，不靠台词 —— 别加「感言」。
//
// ER-3 leafletFire · 传单入火、火焰封路（§4 阶段 11）
//   地面可拾取物 `leaflet`（「放下武器，可保生命」），在 C 区院内与失守街区遍地都是。
//   · 交互【把传单丢进炉火】= 长按 0.8 s，只在 C3_Firebreak 的炉子/油料堆旁可用；
//   · 完成 → Signal("LeafletBurned") → 播 CS_Ch3_LeafletFire（4.8 s，全程无台词）；
//   · 过场结束后**那条路真的封死**：油料带成为一段 8—10 m 的持续火墙（≥90 s），
//     追兵改走另一侧院门。火墙对玩家同样有伤害 —— 它是封路，不是单向道具。
//
// ER-4 phoneLine · 沿线前进 / 查断点 / 剪线（§4 阶段 6、12）
//   一条从 A 区拉到 C 区的**可跟随电话线**（样条，贴墙根与地面）：
//   · HUD 只给方向不给箭头，线本身就是路标；
//   · 小秦是可保护的 NPC：他停下查断点时进入 3—6 s 的不可移动状态，玩家要压住街口；
//   · 撤回时的【剪断线路】= 短按交互，Signal("LineCut")。线被剪断后这一段不再可跟随。
//
// ER-5 doorPlankStretcher · 拆门板做担架（§4 阶段 1）
//   A 区院内的门板是可交互的：长按 1.0 s 拆下一块 → 变成一副担架 → 交给担架队。
//   需要三块（数量可调）。**这是第四关、第五关认得出这个院子的物证**
//   （§5 阶段 10「认得出第三关拆的门板」），拆下来的门框缺口要留在场景状态里。
//
// ER-6 carryWounded · 搜幸存者 / 能走的交给幺娃（§4 阶段 9）
//   突入救护点后：屋内散布 4—6 名幸存者，两种处置 ——
//   · 「能走的」：交互一次即跟随幺娃走（不占玩家手）；
//   · 「不能走的」：需要担架队过来，玩家为担架队开路（不进搬运态，本章顺子持枪）。
//   搜完最后一个 → Signal("AssaultCleared")。
//
// ER-7 报纸（§4 阶段 4）· 可靠近读标题
//   A 区墙边一张南京暴行旧报纸，靠近出【读】提示，读完只显示标题一行，
//   完整内容进历史档案（Data_History）。不做全文阅读界面，不做过场。
//
// ---------------------------------------------------------------------------
// 两段固定演出的位置（§4 过场节：固定演出合计 ≤20 秒）
//
//   CS_Ch3_BreakWall  14.8 s —— 阶段 8，由 ExecutionConfirmed 触发（关内演出）
//   CS_Ch3_LeafletFire 4.8 s —— 阶段 11，由 LeafletBurned 触发（关内演出）
//   合计 19.6 s ≤ 20 s。
//
// **cutsceneOut 改成了 null**（骨架里原本挂着 CS_Ch3_LeafletFire）。理由：
// 传单入火是第 11 阶段、在撤回 A 区**之前**发生的（火焰封的是撤退路线上的追兵）；
// 挂成关末过场就会在第 12 阶段之后才播，因果顺序整个反过来。两段都改成关内触发，
// 需要 ER-1 与 ER-3 的 Signal 接线 —— 没接线时它们只在选章的「测试场景」组可预览。
// ---------------------------------------------------------------------------

/**
 * 本章要用到的 `event:` 触发名与判定条件（契约 §10.3 / Script_Story.LEVEL_CUES）。
 *
 * **beats 里一条都没有直接用 `event:`** —— LEVEL_CUES 现在还没有 CH3_Jiuhusuo 这个键，
 * 用了就是每条各等 80 s 的兜底，整条剧本链会被推到关卡后半段（Data_MissionCh1 骨架
 * 头注里记了这个坑）。所以本章的链子只用 start / delay / zone / end，
 * 这张表是**给 F2 批照抄进 LEVEL_CUES 的施工单**：接线之后，`moveBeats` 里点名的
 * 那几条可以把 at 从 delay/zone 换成 event，节奏会准得多。
 *
 * predicate 一栏是可直接粘进 LEVEL_CUES 的兜底式（真发生时由装配层 Signal 覆盖，
 * 「真发生过的事永远比时刻表准」）。
 */
export const EVENTS = [
  {
    event: "PhoneDead",
    what: "前沿救护点失去回应（§4 阶段 5）。小秦那两句与军官的命令挂在这上面。",
    signal: "装配层在 A 区三件杂活（药箱/门板/电话线）做完任一件、且玩家在 C3_AidStation 内停留 ≥60 s 时推。",
    predicate: "(c) => c.objectiveIndex >= 1 || c.levelTime > c.levelSeconds * 0.22",
    moveBeats: ["ch3_xiaoqin_02", "ch3_xiaoqin_03", "ch3_junguan_01", "ch3_junguan_02"],
  },
  {
    event: "ExecutionAudible",
    what: "交火声消失、间隔单发枪声起（§4 阶段 7、ER-1）。这是声音先行段的开始。",
    signal: "玩家进入 C3_ForwardAid 半径 45 m。",
    predicate: "(c) => c.zone === \"C3_LostBlock\" && c.levelTime > c.levelSeconds * 0.44",
    moveBeats: ["ch3_heyoutian_04", "ch3_ija_gunso_01"],
  },
  {
    event: "ExecutionConfirmed",
    what: "玩家在破墙观察位看清院内正在发生什么（§4 阶段 8）。→ 播 CS_Ch3_BreakWall。",
    signal: "玩家进入破墙观察位（C3_ForwardAid 内的固定点）且视线穿过缺口。",
    predicate: "(c) => c.zone === \"C3_ForwardAid\"",
    moveBeats: ["ch3_yaowa_07", "ch3_yaowa_08", "ch3_heyoutian_05", "ch3_luo_12"],
    cutscene: "CS_Ch3_BreakWall",
  },
  {
    event: "AssaultCleared",
    what: "行刑日军被歼、屋内搜完（§4 阶段 9、ER-6）。撕短褂那一段接在它后面。",
    signal: "最后一名幸存者被处置完。",
    predicate: "(c) => c.objectiveIndex >= 4",
    moveBeats: ["ch3_junyi_06"],
  },
  {
    event: "ShirtTorn",
    what: "民用短褂被撕开、背包道具消失（§4 阶段 10、ER-2）。",
    signal: "长按交互完成。",
    predicate: "(c) => c.objectiveIndex >= 4 && c.levelTime > c.levelSeconds * 0.68",
    moveBeats: ["ch3_heyoutian_08", "ch3_shunzi_05", "ch3_shunzi_06"],
  },
  {
    event: "LeafletBurned",
    what: "传单投入炉火、油料被引燃、一条追击路线被封（§4 阶段 11、ER-3）。→ 播 CS_Ch3_LeafletFire。",
    signal: "长按交互完成。",
    predicate: "(c) => c.zone === \"C3_Firebreak\"",
    moveBeats: ["ch3_yaowa_10", "ch3_yaowa_11"],
    cutscene: "CS_Ch3_LeafletFire",
  },
  {
    event: "LineCut",
    what: "小秦剪断无法回收的那一段电话线（§4 阶段 12、ER-4）。",
    signal: "短按交互完成。",
    predicate: "(c) => c.objectiveIndex >= 5",
    moveBeats: ["ch3_xiaoqin_05"],
  },
];

export const CHAPTER = {
  id: "CH3_Jiuhusuo",
  title: "第三关 · 救护所",
  place: "城内 A 区主救护所 → 东关失守街区 · C 区前沿救护点",
  date: "一九三八年三月十六日 十七时 — 二十时",
  clock: "03-16 17:00 — 20:00",
  sky: "smokyDay",
  music: "streetDistress",
  minutes: 18,
  pool: { start: 168, end: 140, label: "城里还站着的人", presumed: true },
  brief: [
    "在持续有玩家任务的前提下，第一次真正谈家、死亡、为什么来。",
    "前沿救护点失联 —— 电话线还通，不是我们这边断的。",
    "日军突入前沿救护点后对失去战斗能力的伤兵与救护人员实施系统处决。这一段不许弱化。",
  ],
  objectives: [
    "在主救护所搬药箱、拆门板、接电话线",
    "从东门侧门出城，沿电话线前进",
    "穿过失守街区，绕开机枪",
    "确认前沿救护点里正在发生什么，然后开火",
    "撕开短褂止血，把传单投进炉火封路",
    "撤回主救护所",
  ],
  zones: [
    { id: "C3_AidStation", name: "A 区 · 主救护所", x: 214, z: -30, radius: 30 },
    { id: "C3_EastGateOut", name: "东门 · 侧门", x: 296, z: -65, radius: 24 },
    { id: "C3_LostBlock", name: "东关失守街区", x: 449, z: -110, radius: 24 },
    { id: "C3_ForwardAid", name: "C 区 · 前沿救护点", x: 462, z: -19, radius: 26 },
    { id: "C3_Firebreak", name: "炉火封路", x: 480, z: -65, radius: 20 },
    // 同一个院子的第二次出场（环境已变：伤员大增、绷带血水满地）。
    // 坐标与 C3_AidStation 相同、id 不同 —— 目标链要玩家真的走回去。
    { id: "C3_AidReturn", name: "撤回 A 区 · 主救护所", x: 214, z: -30, radius: 30 },
  ],
  tuning: {
    bounds: { minX: 140, maxX: 600, minZ: -260, maxZ: 220 },
    spawn: { x: 276, z: -65, ry: Math.PI / 2 },
    ijaPressure: 1.3, ijaSpawn: ["east"], ijaSupport: ["hmg", "launcher"],
    ijaForce: { lmgEvery: 13, hmgTeams: 2, engineers: true, armor: 0, motorTransport: "rearOnly" },
    ijaPool: 380,
    loadoutOverride: {
      primary: "HanYang", secondary: null, melee: "Dadao",
      throwables: { Grenade: 5 }, spareClips: 3,
      note: "从东关退下来补的：五枚手榴弹，三个桥夹。",
    },
  },
  // ── beats 的排法 ─────────────────────────────────────────────────────────
  // 触发式只用 start / delay / zone / end（原因见上面 EVENTS 的头注）。
  // **连着写同一个 at 的是一组**：Script_Story.BeginLevel 会给同组第二条起标
  // sameAsPrev，只等 0.25 s（仍受 MIN_GAP 2 s 与语音占位闸约束），
  // 一段对话因此是「第一句等条件，后面几句自己接上」。相邻两组的 at 字符串
  // 必须不同，不然两段戏会连成一段没有停顿的话。
  //
  // 台词逐字取自 docs/Data_MissionRemake.md §4，只在策划案没有给词、
  // 而§4 用叙述交代了的地方（刘文财牙痛、绷带用完、街口阻击、剪线）补了短句，
  // 那几条按 §8 人物速查的口径写，标 tier: "虚构"。
  beats: [
    { at: "start", type: "title", text: "救护所", sub: "一九三八年三月十六日 十七时　城内", tier: "主流" },
    { at: "delay:3.0", type: "objective", text: "在主救护所搬药箱、拆门板、接电话线" },

    // ── 阶段 1｜回到 A 区主救护所（有序）─────────────────────────────────
    { at: "zone:C3_AidStation", type: "env", text: "院子还有秩序。能走的靠右排，门板拆下来当担架，电话线顺墙头拉进来。", tier: "虚构" },
    { at: "zone:C3_AidStation", type: "shout", who: "junyi", voice: "ch3_junyi_01", text: "能走的靠右边！" },
    { at: "zone:C3_AidStation", type: "shout", who: "junyi", voice: "ch3_junyi_02", text: "先压住出血！" },
    { at: "zone:C3_AidStation", type: "shout", who: "junyi", voice: "ch3_junyi_03", text: "这个抬进去！" },
    { at: "zone:C3_AidStation", type: "shout", who: "junyi", voice: "ch3_junyi_04", text: "没得担架了，拆门板！" },
    { at: "zone:C3_AidStation", type: "shout", who: "junyi", voice: "ch3_junyi_05", text: "莫堵门！" },

    // 军医只处理战伤（§4 阶段 1 的括号：刘文财牙痛没人理）。
    { at: "delay:5.0", type: "line", who: "liuwencai", voice: "ch3_liuwencai_01", text: "军医，我这颗牙痛了三天了。", tier: "虚构" },
    { at: "delay:5.0", type: "env", text: "军医端着盘子从他跟前过去，没有停。", tier: "虚构" },

    // ── 阶段 2｜休整中的情绪变化 · 被抓来当兵 ────────────────────────────
    { at: "delay:9.0", type: "line", who: "yaowa", voice: "ch3_yaowa_01", text: "顺哥，你真是遭绳子捆来的？" },
    { at: "delay:9.0", type: "line", who: "shunzi", voice: "ch3_shunzi_01", text: "赶场路上。" },
    { at: "delay:9.0", type: "line", who: "shunzi", voice: "ch3_shunzi_02", text: "保长带四个人，一根绳子，老子就成国军了。" },
    { at: "delay:9.0", type: "line", who: "heyoutian", voice: "ch3_heyoutian_01", text: "老子跟你们不一样，老子是自己来的。" },
    { at: "delay:9.0", type: "line", who: "liuwencai", voice: "ch3_liuwencai_02", text: "自己来吃饭的。" },
    { at: "delay:9.0", type: "line", who: "heyoutian", voice: "ch3_heyoutian_02", text: "吃饭不算自己来嗦？" },
    { at: "delay:9.0", type: "env", text: "没得人接他的话。", tier: "虚构" },

    // ── 阶段 2｜想家 ──────────────────────────────────────────────────────
    { at: "delay:11.0", type: "line", who: "yaowa", voice: "ch3_yaowa_02", text: "四川这阵是不是在下雨？" },
    { at: "delay:11.0", type: "line", who: "zhaodegui", voice: "ch3_zhaodegui_01", text: "该是。" },
    { at: "delay:11.0", type: "line", who: "zhaodegui", voice: "ch3_zhaodegui_02", text: "屋头这个时候，房檐一晚上都在滴水。" },
    { at: "delay:11.0", type: "line", who: "yaowa", voice: "ch3_yaowa_03", text: "我妈最烦屋头漏雨。" },
    { at: "delay:11.0", type: "line", who: "shunzi", voice: "ch3_shunzi_03", text: "那你回去补。" },
    { at: "delay:11.0", type: "line", who: "yaowa", voice: "ch3_yaowa_04", text: "回得去再说嘛。" },
    { at: "delay:11.0", type: "env", text: "没有人接话。院子里只剩剪刀和铁盆碰响的声音。", tier: "虚构" },

    // ── 阶段 2｜死在山东 ─────────────────────────────────────────────────
    { at: "delay:8.0", type: "line", who: "s124", voice: "ch3_s124_01", text: "我屋头只晓得我出了川。" },
    { at: "delay:8.0", type: "line", who: "s124", voice: "ch3_s124_02", text: "真死在这儿，连埋哪儿都不晓得。" },
    { at: "delay:8.0", type: "line", who: "luo", voice: "ch3_luo_01", text: "莫急到给自己找坟。" },
    { at: "delay:8.0", type: "line", who: "luo", voice: "ch3_luo_02", text: "还能拿枪就先活今天。" },

    // ── 阶段 3｜第五战区与川军处境 ───────────────────────────────────────
    // 口径红线：这一段不许变成长官宣传。所以它由伤兵的一句挑衅开头、
    // 由小秦墙角骂踩线的现实工作打断收尾（§4 阶段 3 原话）。
    { at: "delay:10.0", type: "line", who: "s124", voice: "ch3_s124_03", text: "你们就是前头两个战区都不要的那批川军？" },
    { at: "delay:10.0", type: "line", who: "heyoutian", voice: "ch3_heyoutian_03", text: "你妈——" },
    { at: "delay:10.0", type: "line", who: "luo", voice: "ch3_luo_03", text: "是。" },
    { at: "delay:10.0", type: "line", who: "luo", voice: "ch3_luo_04", text: "一战区不要，二战区也不要。" },
    { at: "delay:10.0", type: "line", who: "luo", voice: "ch3_luo_05", text: "第五战区肯发枪给我们。" },
    { at: "delay:10.0", type: "line", who: "luo", voice: "ch3_luo_06", text: "人家要的不是我们磕头。" },
    { at: "delay:10.0", type: "line", who: "luo", voice: "ch3_luo_07", text: "是要我们把这段路顶住。" },
    { at: "delay:10.0", type: "line", who: "shunzi", voice: "ch3_shunzi_04", text: "也是因为缺人。" },
    { at: "delay:10.0", type: "line", who: "luo", voice: "ch3_luo_08", text: "哪个长官不缺人？" },
    { at: "delay:10.0", type: "line", who: "luo", voice: "ch3_luo_09", text: "有的喊你滚，有的把枪给你。" },
    { at: "delay:10.0", type: "line", who: "luo", voice: "ch3_luo_10", text: "枪拿到了，就莫打得比草人还撇。" },
    { at: "delay:10.0", type: "shout", who: "xiaoqin", voice: "ch3_xiaoqin_01", text: "哪个龟儿子又踩电话线！" },

    // ── 阶段 4｜报纸（ER-7：可靠近读标题）───────────────────────────────
    { at: "delay:9.5", type: "env", text: "墙边贴着一张从南边带下来的旧报纸。纸角卷了，字还认得出。", tier: "主流" },
    { at: "delay:9.5", type: "line", who: "yaowa", voice: "ch3_yaowa_05", text: "报纸写的是真的喃？" },
    { at: "delay:9.5", type: "line", who: "shangbing", voice: "ch3_shangbing_01", text: "缴了枪的也遭拉走了。" },
    { at: "delay:9.5", type: "env", text: "何有田没有接话，只朝门外看了一眼。", tier: "虚构" },

    // ── 阶段 5｜前沿救护点失联（不切黑，侧门直接出发）───────────────────
    { at: "delay:7.0", type: "line", who: "xiaoqin", voice: "ch3_xiaoqin_02", text: "前头救护点没声音。" },
    { at: "delay:7.0", type: "line", who: "xiaoqin", voice: "ch3_xiaoqin_03", text: "最后一段线路还通，不是我们这边断的。" },
    { at: "delay:7.0", type: "line", who: "junguan", voice: "ch3_junguan_01", text: "里面还有走不了的伤兵。" },
    { at: "delay:7.0", type: "shout", who: "junguan", voice: "ch3_junguan_02", text: "去把活的带回来！" },

    { at: "zone:C3_EastGateOut", type: "objective", text: "从东门侧门出城，沿电话线前进" },

    // ── 阶段 6｜穿过失守街区（沿电话线、绕开机枪、屋顶观察）─────────────
    { at: "zone:C3_LostBlock", type: "objective", text: "穿过失守街区，绕开机枪" },
    { at: "zone:C3_LostBlock", type: "env", text: "地上散着投降传单：「放下武器，可保生命」。", tier: "主流" },
    { at: "zone:C3_LostBlock", type: "line", who: "yaowa", voice: "ch3_yaowa_06", text: "飞机连担架都照打，还保哪个的命。" },
    { at: "zone:C3_LostBlock", type: "line", who: "luo", voice: "ch3_luo_11", text: "莫踩出声音。" },
    { at: "zone:C3_LostBlock", type: "line", who: "xiaoqin", voice: "ch3_xiaoqin_04", text: "线在这头还是通的。", tier: "虚构" },

    // ── 阶段 7｜处决声音（ER-1 的声音先行段：只有耳朵，没有画面）────────
    { at: "delay:14.0", type: "env", text: "交火声停了。", tier: "虚构" },
    { at: "delay:14.0", type: "env", text: "隔很久一声枪。再隔很久，又是一声。", tier: "主流" },
    { at: "delay:14.0", type: "env", text: "屋里有东西被拖过地面。有人在咳。有一声很短的叫，断在半中间。", tier: "主流" },
    { at: "delay:14.0", type: "line", who: "heyoutian", voice: "ch3_heyoutian_04", text: "他们在里头做啥子？" },
    { at: "delay:14.0", type: "env", text: "没有人回答他。", tier: "虚构" },
    // 墙那边的日语口令。text 是字幕（中文），voice 点的是纯假名那一条。
    { at: "delay:14.0", type: "shout", who: "ija_gunso", voice: "ch3_ija_gunso_01", text: "站不起来的，到墙边去。" },

    // ── 阶段 8｜确认系统处决（沿墙找到观察位 → CS_Ch3_BreakWall）────────
    { at: "zone:C3_ForwardAid", type: "objective", text: "确认前沿救护点里正在发生什么，然后开火" },
    { at: "zone:C3_ForwardAid", type: "env", text: "破墙外面：白布担架、翻倒的药箱、墙根下一排躺着的人，地上是拖过去的痕迹。", tier: "主流" },
    { at: "zone:C3_ForwardAid", type: "line", who: "yaowa", voice: "ch3_yaowa_07", text: "这些人都没枪了……" },
    { at: "zone:C3_ForwardAid", type: "shout", who: "yaowa", voice: "ch3_yaowa_08", text: "日你先人！这些人都躺起了！" },
    { at: "zone:C3_ForwardAid", type: "line", who: "heyoutian", voice: "ch3_heyoutian_05", text: "妈卖批……这帮畜生。" },
    { at: "zone:C3_ForwardAid", type: "line", who: "luo", voice: "ch3_luo_12", text: "左边两个，屋门三个。" },
    // ↑ 这一条之后由 ExecutionConfirmed 播 CS_Ch3_BreakWall（罗班长「左右分开。」→
    //   「开火！里头活的带出来！」），播完立即恢复控制，下面这一组接着来。

    // ── 阶段 9｜突入救护点 ───────────────────────────────────────────────
    { at: "delay:5.0", type: "shout", who: "luo", voice: "ch3_luo_15", text: "一个都莫放过去！" },
    { at: "delay:5.0", type: "shout", who: "yaowa", voice: "ch3_yaowa_09", text: "这边还有活的！" },
    { at: "delay:5.0", type: "shout", who: "luo", voice: "ch3_luo_16", text: "先救人！" },
    { at: "delay:5.0", type: "shout", who: "liuwencai", voice: "ch3_liuwencai_03", text: "屋后又上来了！" },
    { at: "delay:5.0", type: "shout", who: "heyoutian", voice: "ch3_heyoutian_06", text: "狗日的小日本，莫让他们进屋！" },
    { at: "delay:5.0", type: "line", who: "heyoutian", voice: "ch3_heyoutian_07", text: "畜生。" },
    { at: "delay:5.0", type: "shout", who: "luo", voice: "ch3_luo_17", text: "能走的交给幺娃！", tier: "虚构" },

    // ── 阶段 10｜顺子毁掉逃跑衣服（ER-2）────────────────────────────────
    { at: "delay:12.0", type: "shout", who: "junyi", voice: "ch3_junyi_06", text: "绷带没得了！按到起！", tier: "虚构" },
    { at: "delay:12.0", type: "system", text: "寻找可用布料 —— 绷带用完了。" },
    { at: "delay:12.0", type: "system", text: "长按：撕开背包里那件民用短褂。" },
    { at: "delay:12.0", type: "line", who: "heyoutian", voice: "ch3_heyoutian_08", text: "这不是你留到临城换的衣裳？" },
    { at: "delay:12.0", type: "line", who: "shunzi", voice: "ch3_shunzi_05", text: "按稳。" },
    { at: "delay:12.0", type: "line", who: "shunzi", voice: "ch3_shunzi_06", text: "莫让他再流了。" },
    { at: "delay:12.0", type: "env", text: "顺子没有再说别的。", tier: "虚构" },

    // ── 阶段 11｜传单入火（ER-3 → CS_Ch3_LeafletFire，全程无台词）───────
    { at: "zone:C3_Firebreak", type: "objective", text: "撕开短褂止血，把传单投进炉火封路" },
    { at: "zone:C3_Firebreak", type: "system", text: "长按：把传单丢进炉火。" },
    // 火起来之后幺娃那两句 —— 台词在过场外面说，过场里一个字都没有。
    { at: "delay:7.0", type: "line", who: "yaowa", voice: "ch3_yaowa_10", text: "保命……" },
    { at: "delay:7.0", type: "line", who: "yaowa", voice: "ch3_yaowa_11", text: "保个鸭儿的命。" },

    // ── 阶段 12｜撤回主救护所（院内已变，开头闲谈的人大多沉默）──────────
    { at: "zone:C3_AidReturn", type: "objective", text: "撤回主救护所" },
    { at: "zone:C3_AidReturn", type: "shout", who: "luo", voice: "ch3_luo_18", text: "街口顶一哈，等担架过去。", tier: "虚构" },
    { at: "zone:C3_AidReturn", type: "line", who: "xiaoqin", voice: "ch3_xiaoqin_05", text: "这段线回收不了，我剪了。", tier: "虚构" },

    { at: "delay:9.0", type: "env", text: "院子还是那个院子。门板拆完了，地上是绷带和血水。", tier: "虚构" },
    { at: "delay:9.0", type: "line", who: "liuwencai", voice: "ch3_liuwencai_04", text: "还有几副担架？" },
    { at: "delay:9.0", type: "env", text: "没有人答他。", tier: "虚构" },

    { at: "end", type: "narration", text: "开头还在打趣的那几个人，回来以后大多不说话了。", tier: "虚构" },
  ],
  cutsceneIn: null,
  // 见上面「两段固定演出的位置」：两段都改成关内触发，关末不再挂过场。
  cutsceneOut: null,
  mechanics: {
    executionScene: true,     // 破墙外确认系统处决（只演一次正在发生的，其余用尸体/声音）
    tearShirt: true,          // 【撕开背包中的民用短褂】长按 —— 逃跑衣服毁在这里
    leafletFire: true,        // 拾传单 → 投入炉火 → 火焰封住一条追击路线
    phoneLine: true,          // 沿电话线前进、保护小秦查断点、剪断无法回收的线路
    doorPlankStretcher: true, // 拆门板做担架
    carryWounded: true,       // 搜幸存者、能走的交给幺娃、为担架队开路
  },
};

// ===========================================================================
// 本章语音行（格式见 Data_Voice.mjs 的「章节剧情台词的拼接」一节）
//
//   key   ch3_<who>_<两位序号>，文件名由 Normalize 按 key 推（vo_ch3_xxx_NN.mp3）
//   dur   一律写 0：烘焙完由 Script_VoiceBake 把实测时长写回**本文件**
//   delivery  normal / shout / whisper / weak（音量与 atempo 分档，VOICE_DELIVERY_MIX）
//
// 交付档的两条口径：
//   · **侦察段一律 whisper**（阶段 6 沿电话线摸过失守街区、阶段 7 听处决声音、
//     阶段 8 破墙外确认的前几句）。耳语必须比常态轻 6 dB —— 玩家是靠音量差
//     听出「现在不能出声」的，拉齐了就是「压低声音地大喊」。
//   · **短促惨叫不在这张表里**。非语言嗓音 TTS 做不像（hurt_scream 的教训），
//     走实录素材，登记在文件头 ER-1。
//
// 日方（ija_gunso）：**text 必须是纯假名，一个汉字都不能有** —— seed-audio 从文本
// 本身判断语言，写成汉字的「番号を言え」会被当中文读。汉字写法记在 kanji 字段只作
// 文档用；cn 是中文含义，字幕用的那一句写在 beats/过场的 text 里（可以更短）。
// 红线：不做无意义辱骂堆叠、不用「バカヤロー」。「支那兵」是 1938 年日方作战文书与
// 部队口语对中国军队的通称，属史实用语，全章只用一次（逼问那一句）。
// ===========================================================================
export const VOICE_LINES = [
  // ── 阶段 1｜A 区医疗语音（军医只处理战伤）──────────────────────────────
  { key: "ch3_junyi_01", who: "junyi", delivery: "shout", dur: 1.89, text: "能走的靠右边！" },
  { key: "ch3_junyi_02", who: "junyi", delivery: "shout", dur: 1.03, text: "先压住出血！" },
  { key: "ch3_junyi_03", who: "junyi", delivery: "shout", dur: 0.69, text: "这个抬进去！" },
  { key: "ch3_junyi_04", who: "junyi", delivery: "shout", dur: 2.07, text: "没得担架了，拆门板！" },
  { key: "ch3_junyi_05", who: "junyi", delivery: "shout", dur: 1.13, text: "莫堵门！" },
  { key: "ch3_liuwencai_01", who: "liuwencai", delivery: "normal", dur: 2.34, text: "军医，我这颗牙痛了三天了。" },

  // ── 阶段 2｜被抓来当兵 ───────────────────────────────────────────────
  { key: "ch3_yaowa_01", who: "yaowa", delivery: "normal", dur: 2.81, text: "顺哥，你真是遭绳子捆来的？" },
  { key: "ch3_shunzi_01", who: "shunzi", delivery: "normal", dur: 0.67, text: "赶场路上。" },
  { key: "ch3_shunzi_02", who: "shunzi", delivery: "normal", dur: 4.10, text: "保长带四个人，一根绳子，老子就成国军了。" },
  { key: "ch3_heyoutian_01", who: "heyoutian", delivery: "normal", dur: 3.08, text: "老子跟你们不一样，老子是自己来的。" },
  { key: "ch3_liuwencai_02", who: "liuwencai", delivery: "normal", dur: 1.14, text: "自己来吃饭的。" },
  { key: "ch3_heyoutian_02", who: "heyoutian", delivery: "normal", dur: 2.58, text: "吃饭不算自己来嗦？" },

  // ── 阶段 2｜想家 ─────────────────────────────────────────────────────
  { key: "ch3_yaowa_02", who: "yaowa", delivery: "normal", dur: 2.96, text: "四川这阵是不是在下雨？" },
  { key: "ch3_zhaodegui_01", who: "zhaodegui", delivery: "normal", dur: 0.51, text: "该是。" },
  { key: "ch3_zhaodegui_02", who: "zhaodegui", delivery: "normal", dur: 3.72, text: "屋头这个时候，房檐一晚上都在滴水。" },
  { key: "ch3_yaowa_03", who: "yaowa", delivery: "normal", dur: 2.16, text: "我妈最烦屋头漏雨。" },
  { key: "ch3_shunzi_03", who: "shunzi", delivery: "normal", dur: 0.53, text: "那你回去补。" },
  { key: "ch3_yaowa_04", who: "yaowa", delivery: "normal", dur: 1.17, text: "回得去再说嘛。" },

  // ── 阶段 2｜死在山东（伤兵气力不足，走 weak 档）──────────────────────
  { key: "ch3_s124_01", who: "s124", delivery: "weak", dur: 3.02, text: "我屋头只晓得我出了川。" },
  { key: "ch3_s124_02", who: "s124", delivery: "weak", dur: 3.41, text: "真死在这儿，连埋哪儿都不晓得。" },
  { key: "ch3_luo_01", who: "luo", delivery: "normal", dur: 1.88, text: "莫急到给自己找坟。" },
  { key: "ch3_luo_02", who: "luo", delivery: "normal", dur: 2.54, text: "还能拿枪就先活今天。" },

  // ── 阶段 3｜第五战区与川军处境 ───────────────────────────────────────
  { key: "ch3_s124_03", who: "s124", delivery: "normal", dur: 0.04, text: "你们就是前头两个战区都不要的那批川军？" },
  { key: "ch3_heyoutian_03", who: "heyoutian", delivery: "normal", dur: 1.02, text: "你妈——" },
  { key: "ch3_luo_03", who: "luo", delivery: "normal", dur: 0.61, text: "是。" },
  { key: "ch3_luo_04", who: "luo", delivery: "normal", dur: 2.76, text: "一战区不要，二战区也不要。" },
  { key: "ch3_luo_05", who: "luo", delivery: "normal", dur: 2.19, text: "第五战区肯发枪给我们。" },
  { key: "ch3_luo_06", who: "luo", delivery: "normal", dur: 0.26, text: "人家要的不是我们磕头。" },
  { key: "ch3_luo_07", who: "luo", delivery: "normal", dur: 3.16, text: "是要我们把这段路顶住。" },
  { key: "ch3_shunzi_04", who: "shunzi", delivery: "normal", dur: 0.70, text: "也是因为缺人。" },
  { key: "ch3_luo_08", who: "luo", delivery: "normal", dur: 0.91, text: "哪个长官不缺人？" },
  { key: "ch3_luo_09", who: "luo", delivery: "normal", dur: 2.63, text: "有的喊你滚，有的把枪给你。" },
  { key: "ch3_luo_10", who: "luo", delivery: "normal", dur: 3.57, text: "枪拿到了，就莫打得比草人还撇。" },
  { key: "ch3_xiaoqin_01", who: "xiaoqin", delivery: "shout", dur: 2.36, text: "哪个龟儿子又踩电话线！" },

  // ── 阶段 4｜报纸 ─────────────────────────────────────────────────────
  { key: "ch3_yaowa_05", who: "yaowa", delivery: "normal", dur: 2.18, text: "报纸写的是真的喃？" },
  { key: "ch3_shangbing_01", who: "shangbing", delivery: "weak", dur: 2.74, text: "缴了枪的也遭拉走了。" },

  // ── 阶段 5｜前沿救护点失联 ───────────────────────────────────────────
  { key: "ch3_xiaoqin_02", who: "xiaoqin", delivery: "normal", dur: 2.08, text: "前头救护点没声音。" },
  { key: "ch3_xiaoqin_03", who: "xiaoqin", delivery: "normal", dur: 3.13, text: "最后一段线路还通，不是我们这边断的。" },
  { key: "ch3_junguan_01", who: "junguan", delivery: "normal", dur: 3.32, text: "里面还有走不了的伤兵。" },
  { key: "ch3_junguan_02", who: "junguan", delivery: "shout", dur: 1.13, text: "去把活的带回来！" },

  // ── 阶段 6—8｜侦察段：一律 whisper ──────────────────────────────────
  { key: "ch3_yaowa_06", who: "yaowa", delivery: "whisper", dur: 4.62, text: "飞机连担架都照打，还保哪个的命。" },
  { key: "ch3_luo_11", who: "luo", delivery: "whisper", dur: 2.12, text: "莫踩出声音。" },
  { key: "ch3_xiaoqin_04", who: "xiaoqin", delivery: "whisper", dur: 1.87, text: "线在这头还是通的。" },
  { key: "ch3_heyoutian_04", who: "heyoutian", delivery: "whisper", dur: 1.05, text: "他们在里头做啥子？" },
  { key: "ch3_yaowa_07", who: "yaowa", delivery: "whisper", dur: 1.73, text: "这些人都没枪了……" },
  // 这一条是幺娃第一次压不住 —— 从耳语跳到吼，情绪转折就落在这个音量差上。
  { key: "ch3_yaowa_08", who: "yaowa", delivery: "shout", dur: 2.68, text: "日你先人！这些人都躺起了！" },
  { key: "ch3_heyoutian_05", who: "heyoutian", delivery: "whisper", dur: 3.58, text: "妈卖批……这帮畜生。" },
  { key: "ch3_luo_12", who: "luo", delivery: "whisper", dur: 1.68, text: "左边两个，屋门三个。" },

  // ── 过场 CS_Ch3_BreakWall 里的两句（罗班长）────────────────────────────
  { key: "ch3_luo_13", who: "luo", delivery: "whisper", dur: 0.93, text: "左右分开。" },
  { key: "ch3_luo_14", who: "luo", delivery: "shout", dur: 1.97, text: "开火！里头活的带出来！" },

  // ── 阶段 9｜突入救护点 ───────────────────────────────────────────────
  { key: "ch3_luo_15", who: "luo", delivery: "shout", dur: 0.94, text: "一个都莫放过去！" },
  { key: "ch3_yaowa_09", who: "yaowa", delivery: "shout", dur: 1.57, text: "这边还有活的！" },
  { key: "ch3_luo_16", who: "luo", delivery: "shout", dur: 1.03, text: "先救人！" },
  { key: "ch3_liuwencai_03", who: "liuwencai", delivery: "shout", dur: 1.09, text: "屋后又上来了！" },
  { key: "ch3_heyoutian_06", who: "heyoutian", delivery: "shout", dur: 2.59, text: "狗日的小日本，莫让他们进屋！" },
  // 何有田击倒日军之后只咬牙骂这两个字：脏话越重，话越少（§8）。不喊，压着说。
  { key: "ch3_heyoutian_07", who: "heyoutian", delivery: "normal", dur: 1.13, text: "畜生。" },
  { key: "ch3_luo_17", who: "luo", delivery: "shout", dur: 1.99, text: "能走的交给幺娃！" },

  // ── 阶段 10｜撕短褂止血（无变化感言，两句都是干活的话）────────────────
  { key: "ch3_junyi_06", who: "junyi", delivery: "shout", dur: 1.64, text: "绷带没得了！按到起！" },
  { key: "ch3_heyoutian_08", who: "heyoutian", delivery: "normal", dur: 2.94, text: "这不是你留到临城换的衣裳？" },
  { key: "ch3_shunzi_05", who: "shunzi", delivery: "normal", dur: 0.30, text: "按稳。" },
  { key: "ch3_shunzi_06", who: "shunzi", delivery: "normal", dur: 2.21, text: "莫让他再流了。" },

  // ── 阶段 11｜传单入火之后（过场里没有台词，两句在过场外面说）───────────
  { key: "ch3_yaowa_10", who: "yaowa", delivery: "normal", dur: 1.62, text: "保命……" },
  { key: "ch3_yaowa_11", who: "yaowa", delivery: "normal", dur: 1.70, text: "保个鸭儿的命。" },

  // ── 阶段 12｜撤回 A 区 ───────────────────────────────────────────────
  { key: "ch3_luo_18", who: "luo", delivery: "shout", dur: 2.43, text: "街口顶一哈，等担架过去。" },
  { key: "ch3_xiaoqin_05", who: "xiaoqin", delivery: "normal", dur: 1.89, text: "这段线回收不了，我剪了。" },
  // 刘文财后期用数数控制恐惧（§8）：不再说「亏本」，改成数还剩多少。
  { key: "ch3_liuwencai_04", who: "liuwencai", delivery: "normal", dur: 0.96, text: "还有几副担架？" },

  // ── 日方军曹（纯假名；kanji/cn 只作文档）─────────────────────────────
  // 01 是墙那边传过来的口令（阶段 7，玩家只闻其声）；02—04 在 CS_Ch3_BreakWall 里。
  // 逼问番号那两句就是 03 与 04：一句带史实通称的逼问，一句四个音节的追问，
  // 之后是刺刀。不堆辱骂 —— 批判力度由队友台词与画面里的白布、药箱、拖痕完成。
  {
    key: "ch3_ija_gunso_01", who: "ija_gunso", delivery: "shout", dur: 2.06,
    text: "たてぬものはかべぎわへ。", kanji: "立てぬ者は壁際へ。", cn: "站不起来的，到墙边去。",
  },
  {
    key: "ch3_ija_gunso_02", who: "ija_gunso", delivery: "shout", dur: 1.27,
    text: "ひきずりだせ。", kanji: "引きずり出せ。", cn: "拖出来。",
  },
  {
    key: "ch3_ija_gunso_03", who: "ija_gunso", delivery: "normal", dur: 3.75,
    text: "しなへいだな。ばんごうをいえ。", kanji: "支那兵だな。番号を言え。", cn: "是支那兵吧。报出番号。",
  },
  {
    key: "ch3_ija_gunso_04", who: "ija_gunso", delivery: "normal", dur: 0.63,
    text: "こたえぬか。", kanji: "答えぬか。", cn: "不答吗。",
  },
];
