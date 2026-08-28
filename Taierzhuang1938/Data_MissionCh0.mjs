// Data_MissionCh0.mjs — 序章｜出川。规格：docs/Data_MissionRemake.md §1（正文）与 §10（契约）。
// 本文件由基建批建骨架、序章内容批填实。不许 import three，不许 Math.random。
//
// ---------------------------------------------------------------------------
// 本章的形态：**过场承载章（cutsceneOnly）**
//
// 序章不建自己的战场切片：进 CH0 即播 cutsceneIn（车厢序章），播完由装配层
// 自动 AdvanceLevel 进 CH1。所以 EnterLevel 对本章**不 BuildField、不撒兵、
// 不 Respawn**（见 Script_Main.EnterLevel 里 phase.cutsceneOnly 那一支）。
//
// 但**开机直跳**（?phase=0、BootTest、出图）仍然要有一片地皮才起得来引擎
// （玩家胶囊、物理、导航、AI 都挂在 battlefield 上）。所以本章借 CH1 的切片：
//   tuning.fieldFrom = "CH1_NanLu"
// BuildField 会用这个 id 去查 OUTFIELD_SCENES / 外部布设 / tzm 饰件三张表，
// 于是「序章那一片」与「第一关那一片」逐个网格相同 —— 不会多生成一座城，
// 也不会出现「序章是一张空地皮」。zones 只作 HUD 与 LOD 焦点用。
//
// 车厢本身是过场自带的 standalone 布景（setOrigin 远离城心），底下铺的是哪片
// 地皮它不关心 —— 这也是能借片的原因。
//
// 2026-08-28 内容批（C0）已把 CS_Chuchuan 重做成策划案 §1 的三阶段版本：
// 车厢闲谈 → 兵站与第五战区补给 → 顺子的计划 → 收骰子/枪上膛 → 短切黑地点卡。
// 全长 166.5 s（九镜），其中**固定镜头「必要演出」41.5 s ≤ 45 s**（读家信 30.0 +
// 列车减速开门 7.0 + 黑场地点卡 4.5）；其余六镜相机钉在顺子的座位上不动，
// 只给基准视轴，玩家自己转头。本文件的流程接线一个字没动。
// ---------------------------------------------------------------------------
//
// ENGINE_REQUEST: ambientMotion 需要减速段（现在只有 from/axis/speed/stopAt，
//   到点硬停）。序章「列车减速进兵站」那一刻，窗外近景 7.2 m/s、月台 1.65 m/s
//   在同一帧归零 —— 用在 CS_Chuchuan 镜 3（阶段 2 的进站）。建议加
//   `decelSeconds`（到 stopAt 前多少秒开始线性减速）即可，不必做曲线。
// ENGINE_REQUEST: 切镜时 headLook 幅度需要过渡（例如 shot.headLook.blendIn 秒）。
//   序章镜 1（自由，yaw ±2.09）切镜 2（固定演出，yaw ±0.70）时，玩家若正把头
//   转在边缘，视角会被瞬间拽回四十度。用在序章全部「自由段落 → 固定演出」的接缝，
//   一共四处（镜 1→2、2→3、5→6、6→7）。
// ENGINE_REQUEST: 过场 sfx 需要 fadeIn/fadeOut（或两条 cue 的 crossfade）。
//   策划案序章收口写的是「火车声渐变近距离炮声」，现在只能把 trainBrake 与
//   explosionFar/amb.cannonFar 前后叠着放，听感是「切」不是「渐变」。用在镜 9。
//
// INTEGRATION: Script_VoiceTest.mjs 的三条序章断言钉在**旧** CS_Chuchuan 上
//   （`dialogueCount === 18`、shot.n===6 的八句动员、PROLOGUE_EXPECTED 那 11 个
//   prologue_* cue）。新序章是 31 句 / 六镜有台词 / 全部走 ch0_* 章节语音通道，
//   那三条必然翻红；Data_Voice.mjs 里 11 条 prologue_* 行也随之成为孤儿（资产还在，
//   没人再引用）。两处都不在 C0 的文件所有权内（§10.4：Script_VoiceTest 归 F2、
//   Tier0 测试口径归 F1），留给集成批统一改口径。
//
// 兵员池曲线（全七章，逐章递减，登记在 Data_TengxianScript.PRESUMED_STAGING）：
//   序章 240→240（**不耗**）→ 一 240→208 → 二 208→168 → 三 168→140
//   → 四 140→96 → 五 96→44 → 终 44→12
// 序章不耗是刻意的：还没到滕县，「城里还站着的人」这个数在序章里只是先亮个相。

export const CHAPTER = {
  id: "CH0_Chuchuan",
  title: "序章 · 出川",
  place: "军列车厢 → 兵站月台",
  date: "一九三八年三月 · 军列南下",
  clock: "军列南下途中",
  sky: "chuchuanDay",
  // 车厢里没有音乐，只有车轮与人声（环境档见下面的 ambience）。
  music: null,
  // 天空档名与环境音档名不同名时用这一条显式指定（Script_Main 读 ambience ?? sky）。
  ambience: "trainInterior",
  minutes: 3,
  pool: { start: 240, end: 240, label: "城里还站着的人", presumed: true },
  brief: [
    "第二十二集团军是川军。军服式样不一，草鞋，步枪型号杂乱，三分之一以上没有枪。",
    "前头两个战区都不肯收；第五战区肯接，还给了枪弹。",
    "顺子背包底藏着一件民用短褂 —— 他打算借后送伤兵的差事走人。",
  ],
  objectives: [
    "在车厢里等命令",
    "透过车门看兵站补给",
    "枪上膛 —— 前头是滕县",
  ],
  zones: [
    // 三个路标只当 HUD 去向与 LOD 焦点用（本章不建切片、不走路），坐标取 CH1 那片
    // 原野上津浦路路基一线，保证它们落在借来的切片里、也落在可通行地面上。
    // 离出生点都在 40 m 以上：路标圈套住出生点的话，目标链会在开局第一帧
    // 自己推进（进而触发换关结算），出图与开机冒烟会莫名其妙地换到下一章。
    { id: "C0_Carriage", name: "军列车厢", x: -478, z: -140, radius: 24 },
    { id: "C0_Depot", name: "兵站月台", x: -466, z: -95, radius: 24 },
    { id: "C0_Door", name: "车门", x: -452, z: -55, radius: 24 },
  ],
  tuning: {
    // 借 CH1 的切片（见文件头）。bounds 必须与 CH1 一致，否则借来的内容会被裁掉半边。
    bounds: { minX: -620, maxX: -230, minZ: -250, maxZ: 210 },
    fieldFrom: "CH1_NanLu",
    cutsceneOnly: true,
    spawn: { x: -480, z: -205, ry: Math.PI },
    // 车上没有仗打。撒兵那一条在 cutsceneOnly 下根本不会被调到，这里写 0 是为了
    // 万一有人拿 ?phase=0 直跳进来调试时也不会凭空冒出一条战线。
    ijaPressure: 0, ijaSpawn: [], ijaSupport: [],
    ijaForce: { lmgEvery: 13, hmgTeams: 0, engineers: false, armor: 0, motorTransport: "rearOnly" },
    ijaPool: 0,
    loadoutOverride: {
      primary: null, secondary: null, melee: null,
      throwables: {}, spareClips: 0,
      note: "枪弹要到兵站才发。车上只有一条布袋、一双草鞋，和背包底那件短褂。",
    },
  },
  // 骨架级 beats：title 卡 + 三条阶段提示 + 关末一条。
  //
  // **本章的对白一句都不在 beats 里**，全部在过场 CS_Chuchuan 的 shots[].lines 上
  // （§1 那三十一句：空间语音五句、读家信与四句对话、兵站军官三句、何有田与罗班长
  // 四句、顺子与幺娃七句、口令四句）。cutsceneOnly 章的 beats 不承担对白 ——
  // 进章即播过场、播完自动 AdvanceLevel，这几条 beat 只是过场之后那一两秒的兜底，
  // 所以也不配 voice（voice 是给 line/shout 型 beat 用的，见契约 §10.3）。
  // 触发式只用 start/delay —— 本章不走路，zone: 永远等不到。
  beats: [
    { at: "start", type: "title", text: "出川", sub: "一九三八年三月　军列南下", tier: "主流" },
    { at: "delay:4.0", type: "objective", text: "在车厢里等命令" },
    { at: "delay:6.0", type: "objective", text: "透过车门看兵站补给" },
    { at: "delay:6.0", type: "objective", text: "枪上膛 —— 前头是滕县" },
    { at: "end", type: "narration", text: "军列到站。前头是滕县。", tier: "主流" },
  ],
  cutsceneIn: "CS_Chuchuan",
  cutsceneOut: null,
  // 本章特有机制（声明式；引擎侧由后续系统批实现，这里只留接口）
  mechanics: {
    cutsceneOnly: true,       // 过场承载章：播完自动进下一章
    freeLookCarriage: true,   // 车厢主体保持第一人称可转动视角，不做长镜头特写
    hiddenShirt: true,        // 背包底那件民用短褂（三关撕掉它）
  },
};

// ---------------------------------------------------------------------------
// 本章台词语音行（结构见 docs/Data_AudioAssets.md「章节剧情语音」）。
//
// 与过场 CS_Chuchuan 的 shots[].lines 是**一一对应**的：那边每一句写 voiceCue，
// 这边写行本体。key 形如 ch0_<who>_<两位序号>，序号按**每个人自己的出场顺序**排，
// 不是全章流水号 —— 序号乱了不会报错，只会让后面补录的人对不上是哪一句。
// 文件名不写：Data_Voice.Normalize 会按 key 推成 vo_ch0_xxx_NN.mp3（手写必错）。
// dur: 0 是必须留的占位，烘焙完由 Script_VoiceBake 把实测时长写回这一行。
//
// delivery 四档的分配口径（§10.3 + Data_Voice.VOICE_DELIVERY_MIX）：
//   · shout —— 罗班长隔着一节车厢喊的（骂切腊肉的、喝令放回、三句下车口令），
//     以及兵站军官对着一车人训话那句。**「你还笑？／人家拿话臊你」不是喊**：
//     那是他走回来站在何有田面前说的，喊出来就变成训斥，味道全丢。
//   · whisper —— 顺子跟幺娃咬耳朵那一整段（含幺娃的两句回话）、何有田那句「小声」
//     的牢骚，以及顺子最后那句「老子没打算死在山东」。耳语档要比常态**轻 6 dB**，
//     玩家是靠音量差听出「这话不能让班长听见」的。
//   · normal —— 其余。读家信那四句尤其不许抬：那是两个人凑在一起说的话。
//   · weak —— 序章一句都没有（没人负伤）。
// ---------------------------------------------------------------------------
export const VOICE_LINES = [
  // ── 镜 1｜车厢闲谈：赌骰子与切腊肉（§1 阶段 1 的空间语音）──────────────────
  { key: "ch0_liuwencai_01", who: "liuwencai", delivery: "normal", dur: 2.54, text: "哪个拿老子的子弹押骰子了？" },
  { key: "ch0_heyoutian_01", who: "heyoutian", delivery: "normal", dur: 2.98, text: "你那几颗烂子弹值个锤子。" },
  { key: "ch0_luo_01", who: "luo", delivery: "shout", dur: 3.19, text: "哪个龟儿子拿刺刀切腊肉？" },
  { key: "ch0_yaowa_01", who: "yaowa", delivery: "normal", dur: 2.17, text: "擦干净就是了嘛。" },
  { key: "ch0_luo_02", who: "luo", delivery: "shout", dur: 2.76, text: "等哈捅鬼子，先给人家抹盐嗦？" },

  // ── 镜 2｜读家信＋四句对话（过场规格 1、2）──────────────────────────────
  // 前两句是顺子替罗班长念信上的字（班长不识字），所以是**念**不是说 ——
  // 提示词里给「照着纸念、断句偏平」的口气，不要演。
  { key: "ch0_shunzi_01", who: "shunzi", delivery: "normal", dur: 2.41, text: "……春妹会喊爹了。" },
  { key: "ch0_shunzi_02", who: "shunzi", delivery: "normal", dur: 3.36, text: "娘的眼睛越发不好，穿针都要人帮。" },
  { key: "ch0_shunzi_03", who: "shunzi", delivery: "normal", dur: 3.74, text: "屋头恁多事等你，还跑出来打啥子仗？" },
  { key: "ch0_luo_03", who: "luo", delivery: "normal", dur: 2.02, text: "不打，人家早晚打到屋门口。" },
  { key: "ch0_shunzi_04", who: "shunzi", delivery: "normal", dur: 2.56, text: "山东离屋门口还远得很。" },
  { key: "ch0_luo_04", who: "luo", delivery: "normal", dur: 2.27, text: "南京以前也觉得远。" },

  // ── 镜 4｜兵站与第五战区补给（§1 阶段 2）────────────────────────────────
  { key: "ch0_luo_05", who: "luo", delivery: "shout", dur: 1.94, text: "放回去！莫拿老百姓的东西！" },
  { key: "ch0_junguan_01", who: "junguan", delivery: "normal", dur: 2.07, text: "前头两个战区都不肯收我们。" },
  { key: "ch0_junguan_02", who: "junguan", delivery: "normal", dur: 2.36, text: "第五战区肯接，还给了枪弹。" },
  { key: "ch0_junguan_03", who: "junguan", delivery: "shout", dur: 4.17, text: "到了前头，哪个再乱拿老百姓东西，老子先收拾哪个！" },

  // ── 镜 5｜何有田小声＋罗班长三句 ──────────────────────────────────────
  { key: "ch0_heyoutian_02", who: "heyoutian", delivery: "whisper", dur: 5.60, text: "听说李长官讲，我们再撇也比草人强。" },
  { key: "ch0_luo_06", who: "luo", delivery: "normal", dur: 0.77, text: "你还笑？" },
  { key: "ch0_luo_07", who: "luo", delivery: "normal", dur: 0.98, text: "人家拿话臊你。" },
  { key: "ch0_luo_08", who: "luo", delivery: "normal", dur: 2.59, text: "枪发到你手头，就打个兵样出来。" },

  // ── 镜 7｜顺子的计划（§1 阶段 3，全段耳语）──────────────────────────────
  { key: "ch0_shunzi_05", who: "shunzi", delivery: "whisper", dur: 3.22, text: "前头若喊送伤兵，老子就去。" },
  { key: "ch0_shunzi_06", who: "shunzi", delivery: "whisper", dur: 3.78, text: "送到临城，找个地方把衣裳一换。" },
  { key: "ch0_shunzi_07", who: "shunzi", delivery: "whisper", dur: 3.37, text: "枪一丢，哪个认得到我？" },
  { key: "ch0_yaowa_02", who: "yaowa", delivery: "whisper", dur: 2.25, text: "那不就是逃兵？" },
  { key: "ch0_shunzi_08", who: "shunzi", delivery: "whisper", dur: 4.28, text: "我是遭抓来的，又不是自己来送命的。" },
  { key: "ch0_yaowa_03", who: "yaowa", delivery: "whisper", dur: 2.31, text: "罗班长晓得不？" },
  { key: "ch0_shunzi_09", who: "shunzi", delivery: "whisper", dur: 2.21, text: "你敢说，老子先把你丢下车。" },

  // ── 镜 8｜远处炮声与口令 ──────────────────────────────────────────────
  // 顺子三句弧线的第一句（§6）：序章「老子没打算死在山东」→ 一关「老子不松，
  // 一起死」→ 五关「老子今天不走了」。三句必须是同一个人同一种硬气，
  // 所以这一句仍走耳语档（说给幺娃听的），不是宣言。
  { key: "ch0_shunzi_10", who: "shunzi", delivery: "whisper", dur: 1.06, text: "老子没打算死在山东。" },
  { key: "ch0_luo_09", who: "luo", delivery: "shout", dur: 0.62, text: "收骰子！" },
  { key: "ch0_luo_10", who: "luo", delivery: "shout", dur: 0.68, text: "枪上膛！" },
  { key: "ch0_luo_11", who: "luo", delivery: "shout", dur: 2.77, text: "下车以后莫给老子跑散了！" },
  { key: "ch0_junguan_04", who: "junguan", delivery: "shout", dur: 1.73, text: "下车！按班站好！" },
];
