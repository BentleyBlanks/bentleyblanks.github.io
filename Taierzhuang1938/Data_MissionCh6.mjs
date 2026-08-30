// Data_MissionCh6.mjs — 终章｜最后一封。规格：docs/Data_MissionRemake.md §7（正文）与 §10（契约）。
// 骨架由基建批建，**本文件的 beats／VOICE_LINES／EVENTS 由章节内容批 C6 填实**。
// 不许 import three，不许 Math.random。
//
// ---------------------------------------------------------------------------
// 场景基底：城内临时师部 → 西门大街 → 西关电灯厂
//
//   城内临时师部 (-58, -55) —— 王铭章师部原设城外电灯厂，接死守命令后迁入城内；
//        **城内具体哪一处无载**（Data_CutsceneLastWire 的 presumed 里已登记过一次）。
//        这里取城中那组最大的院落（Data_Tengxian.CITY_FEATURES.CentralCompound124，
//        94×54 m）作为临时师部的锚点，是推定，不是史实。
//   西关电灯厂 (-410, 69) —— Data_Tengxian.WEST_SUBURB.powerPlant，二十二米烟囱那一处。
//        「电灯厂在西城楼直瞄射程内」「王铭章刚到西关电灯厂附近遭扫射」是主流记载
//        （见 Script_Landmark_PowerPlant.mjs 头注的三条史实纪律）。
//
// 玩家在本章是**小秦**（通信兵）：报告东关、亲手发最后一封电报、随通信组转移。
// 编剧红线照旧：**不演王铭章举枪自尽**（理由见 Data_CutsceneWangMingzhang 的长注释：
// 自尽说不是电影编的，它是 1938 年 3 月 21 日中央社电讯的最早口径；本作取中弹一说，
// 依据是 1938 年 11 月墓志改口、张宣武回忆与 2009 年家属公开否认三层更晚更硬的史源）。
//
// spawn 沿用旧 L5 那个十字街口东侧的落脚点（BootTest 的 spawnRun 验过通行），
// 朝西正对师部与西门方向。
//
// ---------------------------------------------------------------------------
// 六阶段 → beats 的对位（§7 阶段号）
//
//   ① 前两封电报    zone:C6_DivisionHq 起的一串 delay：「前两封都发出去了」「援军还是没得
//                    消息」＋底稿可查看（draftReading）
//   ② 报告东关      小秦报东关线路／街区分割／后送队西移／建制瓦解；
//                    **参谋「罗班长那一组喃？」→ 小秦停一下「没得回应。」**
//                    —— 这是普通人的故事汇进通信链的那颗钉子，不许省
//   ③ 最后电报      王铭章四问 →「那就发」→ 参谋复诵，玩家明确听见
//                    「决以死拼，以报国家，以报知遇。」（与序章第五战区接纳闭环）
//   ④ 亲手发报      telegraph：发码组／报码纸确认／炮击致接头松脱→重连／「发毕。」「收起。」
//   ⑤ 通信组转移    cipherDisposal：密码本、底稿、呼号表；任务转向西关
//   ⑥ 西关殉国      电灯厂附近侧面机枪；小秦第二轮被击倒；groundPov 四要素
//
// ---------------------------------------------------------------------------
// ★ ENGINE_REQUEST（章节内容批只登记，由集成批统一实现；契约 §10.4）
//
//   1. `telegraph` —— 电键交互。要三件事：
//      · 发码组：按住＝长码、点一下＝短码，一组四位、按报码纸的组序推进；
//      · 报码纸确认：每发完一组在 HUD 上勾掉一组（不是纯演出，玩家要能对错）；
//      · 接头松脱：炮击时随机断一次，玩家要走到机器旁重新按住接头（长按 1.2 s）再继续。
//      现有缺口：Script_Input 没有「长按 + 短点」这一对输入语义；HUD 没有可勾选的组表。
//   2. `draftReading` —— 走近前两封电报底稿弹出可读面板（可复用第三关「读报纸」的交互）。
//      贴图 Texture/Tex_PaperEndingMap.png 那一批的纸品**尚未接进引擎**（见
//      Texture/PaperProps_README.md「交付边界」），底稿要么用现成纸片道具、要么等接线。
//   3. `cipherDisposal` —— 长按销毁密码本／底稿／呼号表（三件，任意顺序），带火与烟；
//      带不走的机器给一次「砸」的近战交互。销毁完才开西门大街的通路。
//   4. `groundPov` —— 小秦被击倒后**不切黑**：相机落到 0.30—0.35 m 眼高、保留 ±0.5 rad 转头、
//      听觉低通并压低音量，持续 4—6 s 后再黑出。现在的死亡流程是直接黑屏＋重开。
//   5. `epilogueMap` —— **已解决**（INT2）：`shot.mapCard` 由 Script_Cutscene 的
//      `_ApplyMapCard` 实现 —— 底图当背景、五处标注按归一化坐标叠成 DOM
//      （地名带圆点、部队标识带方框、南进箭头是一条带箭镞的细线）。
//      电流→车轮的交叉淡入走 INT1 的 `shot.sfx[].crossfade`。原始需求留档：
//      尾声地图卡。需要 shot 级的 `mapCard`：
//      底图 `Texture/Tex_PaperEndingMap.png`（1536×1024 横向、**一个字都没有**），
//      标注（滕县／临城／台儿庄／日军南进箭头／台儿庄附近的中国军队标识）由 DOM 层按
//      归一化坐标叠上去 —— 贴图那一批就是照这个口径出的，节点与箭头故意没画。
//      落地方式二选一：props 支持 `texture:` 字段（本文件的 CS_Ch6_Epilogue 已按这个写），
//      或者给 shot 加一个专用 mapCard 分支。没接线时它退化成一块纸色卡＋三行字幕，能播。
//   6. `midLevelCutscene` —— **已解决**（INT1 建钩子、INT2 挂上去）：
//      本章两场关中过场都接上了 —— CS_Ch6_LastWire 走 beat 级
//      `{ at:"event:WireConfirm", type:"cutscene", id }`，CS_Ch6_Xiguan 走
//      EVENTS.FlankMg 的 `cutscene:` 字段（摆点层推 Signal 时播）。
//      标了 dupOfCutscene 的那几条 beats 已按本条原来的交代删掉。原文留档：
//      Script_Main 只在关卡边界播 cutsceneIn／
//      cutsceneOut（1908/2043 行），关内没有任何触发口，只有取证用的 host.PlayCutscene(id)。
//      本章要在关内播两场（最后电报确认、西关殉国）。请加 beat 级
//      `{ at, type: "cutscene", id }` → host.PlayCutscene(id)。
//      **在它接上之前**：③④⑥ 的台词在 beats 里是全的（关内第一人称直接演），
//      CS_Ch6_LastWire / CS_Ch6_Xiguan 只能从预览入口看。接上之后请把下面 beats 里
//      标了 `dupOfCutscene` 的那几条删掉，免得同一段戏演两遍。
//   7. 音效缺口三条（Data_SfxSources.mjs 里没有）：
//      · 电键的「嗒」（现在拿 grenadePin 顶，最后一电那场也是这么顶的）；
//      · 发报机的电流底噪（尾声开头那一段「电流声」）；
//      · 电流声 → 序章车轮声的**交叉淡入**（尾声的收束动作，现在只能靠 carriageRattle 叠）。
//
// ---------------------------------------------------------------------------
// ★ 台词→语音：本章 32 条行在文件末尾的 VOICE_LINES（key 一律 ch6_<who>_<NN>）。
//   烘焙：node Taierzhuang1938/Script_VoiceBake.mjs --dry --chapter=6
//   复诵电文那一条（ch6_canmou_09）交付档写 normal，但提示词里要的是**郑重**：
//   逐字确认的职业口吻，不是朗诵腔 —— 见行上的 note 字段与 CAST_VOICE_PROMPTS.canmou。
// ---------------------------------------------------------------------------

export const CHAPTER = {
  id: "CH6_Zuihou",
  title: "终章 · 最后一封",
  // §7 明写「玩家＝小秦」。**这一条必须在章节数据里**：具名同伴的默认名册是
  // 从 beats 的 who 推出来的，而小秦在本章话最多 —— 不点名的话场上会有两个小秦，
  // 一个是你、一个站你旁边（INT1 时靠 Script_Companion 的过渡表挡着，INT2 删了那张表）。
  playerCast: "xiaoqin",
  place: "城内临时师部 → 西门大街 → 西关电灯厂",
  date: "一九三八年三月十七日 午后 — 黄昏",
  clock: "03-17 15:00 — 18:00",
  sky: "burningStreet",
  music: "exodus",
  // 终章：师部里只有两个有名字的人，**而且两个都是 combatant:false** ——
  // 按 beats 推名册会推出一张空表（推导只收战斗员），于是参谋与师长的每一句
  // 都从玩家脑门上发出来。这是必须显式点名的典型情形。
  // 小秦不进表：**玩家就是他**（playerCast）。
  roster: ["canmou", "wangmingzhang"],
  minutes: 10,
  pool: { start: 44, end: 12, label: "城里还站着的人", presumed: true },
  brief: [
    "普通人的故事通过通信链汇入王铭章最后电报。玩家＝小秦。",
    "前两封都发出去了，援军还是没有消息。",
    "结算不打歼敌数：只打守住时长、阵地易手次数、随你活着出城的人数。",
  ],
  objectives: [
    "进入临时师部",
    "向师部报告东关战况",
    "穿过西门里",
    "出西门瓮城",
    "沿西关大街向电灯厂",
    "到电灯厂附近 —— 侧面机枪突然开火",
  ],
  zones: [
    { id: "C6_DivisionHq", name: "城内临时师部", x: -58, z: -55, radius: 30 },
    { id: "C6_WestStreet", name: "西门里大街", x: -160, z: 0, radius: 24 },
    { id: "C6_GateInner", name: "西门里", x: -278, z: 0, radius: 20 },
    { id: "C6_Barbican", name: "西门瓮城", x: -322, z: 0, radius: 16 },
    { id: "C6_WestOuter", name: "西关大街", x: -380, z: 0, radius: 24 },
    { id: "C6_PowerPlant", name: "西关电灯厂", x: -410, z: 69, radius: 34 },
  ],
  tuning: {
    bounds: { minX: -480, maxX: 100, minZ: -190, maxZ: 150 },
    cameraFar: 460,
    spawn: { x: 62, z: 0, ry: Math.PI / 2 },
    ijaPressure: 1.2, ijaSpawn: ["west", "south"], ijaSupport: ["hmg", "artillery"],
    ijaForce: { lmgEvery: 13, hmgTeams: 1, engineers: false, armor: 0, motorTransport: "rearOnly" },
    ijaPool: 320,
    loadoutOverride: {
      primary: "HanYang", secondary: null, melee: "Dadao",
      throwables: { Grenade: 2 }, spareClips: 1,
      note: "通信兵的枪。两枚手榴弹，一个桥夹 —— 城里能发的电报比子弹多。",
    },
  },
  // =========================================================================
  // beats
  //
  // 触发式用 start / delay / event。**INT2 起 zone: 一条不剩**：六拍走位改挂
  // `event:`，判据里那一支 `c.zone === "..."` 与原来的 zone: 逐字等价，
  // 只是多了一条时刻兜底（理由见文件末尾 EVENTS 的头注：钉住不动时
  // 一条 zone 要吃 MAX_WAIT.zone = 95 s，六条就把终章十分钟的预算吃光）。
  // 关中过场那两场也在这条链上（`type:"cutscene"`）。
  // =========================================================================
  beats: [
    // ── 开场：进城内临时师部 ────────────────────────────────────────────
    { at: "start", type: "title", text: "最后一封", sub: "一九三八年三月十七日 午后　城内临时师部", tier: "主流" },
    { at: "delay:3.0", type: "objective", text: "进入临时师部" },
    { at: "delay:2.4", type: "env", text: "你是小秦。全城的线断了一整天，还通的只剩师部这一条。", tier: "虚构" },

    // ── 阶段 ①：前两封电报 ─────────────────────────────────────────────
    // at 从 `zone:` 改成 `event:`（INT2）：判据是「走进师部**或者**已经过了半分钟」。
    // 纯 zone 的问题不在正片而在回归 —— PlayTest 的剧本长跑把关卡钉住、玩家不动，
    // 六条 zone 各吃一次 MAX_WAIT.zone = 95 s，本章十分钟的预算被 570 s 吃光，
    // 表现成「终章剧本被吞了 11 条」。event 的兜底判据由本章 EVENTS 给。
    { at: "event:AtDivisionHq", type: "objective", text: "向师部报告东关战况" },
    { at: "event:AtDivisionHq", type: "line", who: "canmou", voice: "ch6_canmou_01", text: "前两封都发出去了。", tier: "虚构" },
    { at: "delay:2.6", type: "line", who: "canmou", voice: "ch6_canmou_02", text: "援军还是没得消息。", tier: "虚构" },
    { at: "delay:2.6", type: "system", text: "案上压着前两封的底稿 —— 走近可以看。" },
    // 底稿只给关键词。完整电文没有原件传世，进「史实注记」而不是进旁白。
    { at: "delay:3.2", type: "env", text: "底稿一：报敌情，请援。底稿二：再请援。落款是同一个人。", tier: "虚构" },
    { at: "delay:3.4", type: "narration", text: "十四日十七时，第五战区电令第二十军团调兵向滕县方向增援。", tier: "主流" },
    // 「等不到援军」只演城里的主观感受；不许在旁白或角色口中下「见死不救」的判决
    //（docs/Data_TengxianTimeline.md「处理建议（给编剧）」）。
    { at: "delay:3.4", type: "env", text: "师部这头等到的回话，一直是「不晓得」。", tier: "虚构" },

    // ── 阶段 ②：报告东关 ───────────────────────────────────────────────
    { at: "delay:3.0", type: "line", who: "canmou", voice: "ch6_canmou_03", text: "小秦，东关是个啥子情况？", tier: "虚构" },
    { at: "delay:2.6", type: "line", who: "xiaoqin", voice: "ch6_xiaoqin_01", text: "线全断了。东关那一段断在城墙根，我接不回来。", tier: "虚构" },
    { at: "delay:2.8", type: "line", who: "xiaoqin", voice: "ch6_xiaoqin_02", text: "街被切成一段一段的，人过不去。", tier: "虚构" },
    { at: "delay:2.6", type: "line", who: "xiaoqin", voice: "ch6_xiaoqin_03", text: "后送队往西转移了。", tier: "虚构" },
    { at: "delay:2.6", type: "line", who: "xiaoqin", voice: "ch6_xiaoqin_04", text: "建制大多散了。不同番号的人还在补位置。", tier: "虚构" },
    // ★ 这一问一答是本章的钉子：五关那一班人的线索，在这里汇进通信链，然后断掉。
    { at: "delay:2.8", type: "line", who: "canmou", voice: "ch6_canmou_04", text: "罗班长那一组喃？", tier: "虚构" },
    // 停顿靠这条 delay 拉出来（Story 层没有「停一拍」的语法）。
    { at: "delay:3.6", type: "line", who: "xiaoqin", voice: "ch6_xiaoqin_05", text: "……没得回应。", tier: "虚构" },
    { at: "delay:2.6", type: "line", who: "canmou", voice: "ch6_canmou_05", text: "记下。", tier: "虚构" },

    // ── 阶段 ③：最后电报（王铭章四问）──────────────────────────────────
    // INT2：midLevelCutscene 已经接上（Script_Story 的 `type:"cutscene"` beat →
    // 宿主 PlayMidCutscene）。按本文件原来的交代，从「电台还能发不？」到复诵那四条
    // **已经删掉**，换成下面那一条 cutscene beat —— 同一段戏不演两遍。
    { at: "delay:3.2", type: "line", who: "wangmingzhang", voice: "ch6_wangmingzhang_01", text: "东南还能联系几个营？", tier: "虚构" },
    { at: "delay:2.8", type: "line", who: "canmou", voice: "ch6_canmou_06", text: "两个营的线还通。人剩好多，报不上来。", tier: "虚构" },
    { at: "delay:2.8", type: "line", who: "wangmingzhang", voice: "ch6_wangmingzhang_02", text: "独立山方向还有枪声没得？", tier: "虚构" },
    { at: "delay:2.8", type: "line", who: "xiaoqin", voice: "ch6_xiaoqin_06", text: "早上还有。这阵听不到了。", tier: "虚构" },
    { at: "delay:2.8", type: "line", who: "wangmingzhang", voice: "ch6_wangmingzhang_03", text: "西关还能不能走担架？", tier: "虚构" },
    { at: "delay:2.8", type: "line", who: "canmou", voice: "ch6_canmou_07", text: "西门还开着。出了城就不晓得了。", tier: "虚构" },
    // ★ 关中过场（12.2 s）：参谋逐字复诵最后一封电文 → 王铭章追问「电台还能发不？」
    //   →「还能发。」→「那就发。」。**玩家必须明确听见的那一句**
    //   「决以死拼，以报国家，以报知遇。」在这一场里（Data_CutsceneCh6 的第 4 镜），
    //   所以关内不再重复；它是本章的转轴，下一段亲手敲电键才有分量。
    //   挂在 event:WireConfirm 上：真发生（玩家走到电台桌前、四问问完）由摆点层推，
    //   推不出来时吃本章 EVENTS 给的时刻兜底。
    { at: "event:WireConfirm", type: "objective", text: "发出最后一封电报" },
    { at: "event:WireConfirm", type: "cutscene", id: "CS_Ch6_LastWire" },
    { at: "delay:3.6", type: "narration", text: "长版落款「职王铭章叩铣」。「铣」为电报韵目代日，即十六日。", tier: "主流" },

    // ── 阶段 ④：玩家亲手发报（telegraph；不切三人称）──────────────────
    { at: "delay:3.2", type: "line", who: "canmou", voice: "ch6_canmou_10", text: "跟到报码纸念。一组一组来。", tier: "虚构" },
    { at: "delay:2.8", type: "system", text: "电键：按住发长码，点一下发短码。一组四位。" },
    { at: "delay:4.0", type: "system", text: "第一组　对上了。" },
    { at: "delay:4.0", type: "system", text: "第二组　对上了。" },
    { at: "delay:3.6", type: "shout", who: "canmou", voice: "ch6_canmou_11", text: "炮！接头松了！", tier: "虚构" },
    { at: "delay:2.4", type: "shout", who: "xiaoqin", voice: "ch6_xiaoqin_07", text: "我接！莫断！", tier: "虚构" },
    { at: "delay:3.0", type: "system", text: "接头接回去了。接着发。" },
    { at: "delay:4.2", type: "system", text: "最后一组　对上了。" },
    { at: "delay:2.6", type: "line", who: "xiaoqin", voice: "ch6_xiaoqin_08", text: "发毕。", tier: "虚构" },
    { at: "delay:2.4", type: "line", who: "wangmingzhang", voice: "ch6_wangmingzhang_06", text: "收起。", tier: "虚构" },

    // ── 阶段 ⑤：通信组转移（cipherDisposal）───────────────────────────
    { at: "event:HqShelled", type: "objective", text: "处理密码材料" },
    { at: "event:HqShelled", type: "env", text: "一发炮弹落在院墙外。屋顶的灰整片掉下来。", tier: "虚构" },
    { at: "delay:2.8", type: "line", who: "canmou", voice: "ch6_canmou_12", text: "密码本、底稿、呼号表 —— 烧。", tier: "虚构" },
    { at: "delay:2.8", type: "line", who: "canmou", voice: "ch6_canmou_13", text: "带不走的机器，砸了再走。", tier: "虚构" },
    { at: "delay:3.6", type: "line", who: "xiaoqin", voice: "ch6_xiaoqin_09", text: "烧完了。", tier: "虚构" },
    { at: "event:CipherDone", type: "objective", text: "随通信组沿西门大街向西转移" },
    { at: "delay:2.6", type: "line", who: "canmou", voice: "ch6_canmou_14", text: "跟到走，莫散。", tier: "虚构" },
    { at: "event:AtGateInner", type: "objective", text: "穿过西门里" },
    { at: "delay:2.8", type: "env", text: "西门里街一直通到城门洞。这条街是通视的 —— 城门楼上看得见你。", tier: "主流" },
    { at: "event:AtBarbican", type: "objective", text: "出西门瓮城" },
    { at: "delay:2.8", type: "env", text: "瓮城里挤着伤员、担架和往外走的人。没人说话。", tier: "虚构" },
    { at: "event:AtWestOuter", type: "objective", text: "沿西关大街向电灯厂" },
    { at: "delay:2.6", type: "line", who: "canmou", voice: "ch6_canmou_15", text: "师长在前头。跟上。", tier: "虚构" },

    // ── 阶段 ⑥：西关殉国（groundPov）──────────────────────────────────
    // INT2：从「机枪！侧面！」到地面视角四要素那六条 **已经删掉**，换成下面这一条
    // cutscene beat —— 本文件原来的交代就是这么写的（同一段戏不演两遍）。
    // 地面视角（groundPov：相机落到 0.30—0.35 m 眼高、保留转头、四要素）在
    // CS_Ch6_Xiguan 的第 4—6 镜里，比关内的 env 字幕说得清楚。
    { at: "event:FlankMg", type: "objective", text: "到电灯厂附近 —— 侧面机枪突然开火" },
    { at: "delay:2.6", type: "env", text: "电灯厂的烟囱就在前头。二十二米 —— 西城楼上一眼就看得见它。", tier: "主流" },
    { at: "delay:3.0", type: "cutscene", id: "CS_Ch6_Xiguan" },
    // 过场里没有的那一句 —— 它是**小秦自己的**收束，不是殉国那一场的镜头语言。
    { at: "delay:3.0", type: "env", text: "最后一封，是你亲手发出去的。", tier: "虚构" },

    { at: "end", type: "narration", text: "一九三八年三月十七日，王铭章在滕县殉国。最后一封电报已经发出去了。", tier: "主流" },
  ],
  cutsceneIn: null,
  cutsceneOut: "CS_Ch6_Epilogue",
  mechanics: {
    telegraph: true,          // 亲手发报：电键发码组、报码纸确认、接头松脱后重新连接
    draftReading: true,       // 前两封电报的底稿可靠近查看（完整内容进历史档案）
    cipherDisposal: true,     // 师部遭炮击：处理密码材料/重要文件/无法带走的设备
    groundPov: true,          // 西关殉国：小秦被击倒后的地面视角，不用慢动作、不虚构遗言
    epilogueMap: true,        // 尾声极简地图＋三行字幕，电流声渐变序章火车车轮声
  },
};

/**
 * 本章要的关内事件闸（登记表）。
 *
 * 为什么是一张表而不是直接写进 beats 的 `at`：判定表在 Script_Story.LEVEL_CUES，
 * 那是 F2/集成批的文件；在 CH6_Zuihou 那一项建起来之前，任何 `event:` 都只能靠
 * MAX_WAIT.event = 80 s 的兜底触发 —— 一条就能把整条台词链挂住 80 秒。
 *
 * 接线的做法：
 *   1. 在 Script_Story.LEVEL_CUES 里加 `CH6_Zuihou: { ... }`，把下面每条的
 *      `fallback` 抄成判定函数（玩法系统真做出来以后由它 Signal，时刻表只当兜底）；
 *   2. 把 beats 里 `anchorBeat` 指的那一条的 `at` 从 delay/zone 换成 `event:<id>`。
 *
 * 每条都写了 fallback：**没有兜底的事件闸等于把剧本交给玩法系统的心情**。
 */
export const EVENTS = [
  // ── 走位闸（INT2 新增四条 + 复用 CipherDone/FlankMg）───────────────────────
  // 本章原来把六拍走位挂在 `zone:` 上。正片里那样是对的（走到了就播），
  // 但 PlayTest 的剧本长跑**把关卡钉住、玩家不动**，六条 zone 各吃一次
  // MAX_WAIT.zone = 95 s —— 570 s，比本章十分钟的九成预算还多，
  // 于是终章的剧本每轮都剩十来条没播（「CH6 剩 11」那条红）。
  // 改挂 event 之后判据是「走进那个圈 **或者** 时刻到了」：正片行为一模一样
  //（zone 那一支立刻成立），回归里则永远不会空等一百秒。
  {
    id: "AtDivisionHq",
    when: "玩家走进城内临时师部（§7 阶段①的第一句在这一拍）",
    anchorBeat: "line/canmou/ch6_canmou_01（「前两封都发出去了。」）",
    fallback: "(c) => c.zone === \"C6_DivisionHq\" || c.levelTime > 30",
    note: "师部离出生点 130 m，走过去半分钟够了；兜底给得早，站着不动也不会冷场",
  },
  {
    id: "WireConfirm",
    when: "四问问完、参谋要开始复诵最后一封电文（关中过场 CS_Ch6_LastWire 的挂点）",
    anchorBeat: "cutscene/CS_Ch6_LastWire",
    fallback: "(c) => c.levelTime > 210",
    note: "整章的转轴。摆点层在玩家站到电台桌前、四问的最后一问说完时推；"
      + "**兜底只能给时刻** —— 它不对应任何一个路标",
  },
  {
    id: "AtGateInner",
    when: "玩家走进西门里（通视直街那一段）",
    anchorBeat: "objective「穿过西门里」",
    fallback: "(c) => c.zone === \"C6_GateInner\" || c.levelTime > 350",
  },
  {
    id: "AtBarbican",
    when: "玩家走进西门瓮城",
    anchorBeat: "objective「出西门瓮城」",
    fallback: "(c) => c.zone === \"C6_Barbican\" || c.levelTime > 372",
  },
  {
    id: "AtWestOuter",
    when: "玩家走上西关大街",
    anchorBeat: "objective「沿西关大街向电灯厂」",
    fallback: "(c) => c.zone === \"C6_WestOuter\" || c.levelTime > 394",
  },
  {
    id: "DraftsRead",
    when: "玩家看过前两封电报的底稿（draftReading，两张任意一张即可）",
    anchorBeat: "line/canmou/ch6_canmou_03（「小秦，东关是个啥子情况？」）",
    fallback: "(c) => c.levelTime > 70 || c.objectiveIndex >= 1",
    note: "看底稿是可选动作，兜底必须给得早，不然没看的人要干等",
  },
  {
    id: "ReportGiven",
    when: "小秦把东关四条报完（报告交互结束）",
    anchorBeat: "line/wangmingzhang/ch6_wangmingzhang_01（四问的第一问）",
    fallback: "(c) => c.levelTime > 150 || c.objectiveIndex >= 1",
    note: "王铭章要等报告完才开口问；提前问会把②③两段叠在一起",
  },
  {
    id: "KeySeated",
    when: "玩家在电键前完成第一组电码（telegraph 的第一组勾掉）",
    anchorBeat: "system「第一组　对上了。」",
    fallback: "(c) => c.levelTime > 230",
    note: "telegraph 做出来之前，system 那几条只能按 delay 走，玩家其实没在发报",
  },
  {
    id: "WireBreak",
    when: "炮击打断发报、接头松脱（telegraph 的断线事件）",
    anchorBeat: "shout/canmou/ch6_canmou_11（「炮！接头松了！」）",
    fallback: "(c) => c.levelTime > 280",
    note: "断线要发生在第二组与最后一组之间，不能落在「发毕」以后",
  },
  {
    id: "WireSent",
    when: "最后一组发完 —— 本章的转轴",
    anchorBeat: "line/xiaoqin/ch6_xiaoqin_08（「发毕。」）",
    fallback: "(c) => c.levelTime > 330",
    note: "在这之前不许开⑤的转移任务：电报没发出去就转移，整章的因果就散了",
  },
  {
    id: "HqShelled",
    when: "师部遭炮击（装配层第一发落在院内时 Signal）",
    anchorBeat: "env「一发炮弹落在院墙外。屋顶的灰整片掉下来。」",
    fallback: "(c) => c.levelTime > 360 || c.objectiveIndex >= 1",
    note: "cipherDisposal 的开关。烧密码材料是被炮打出来的，不是流程安排的",
  },
  {
    id: "CipherDone",
    when: "密码本、底稿、呼号表三件都处理完（cipherDisposal）",
    anchorBeat: "objective「随通信组沿西门大街向西转移」（「烧完了。」的下一拍）",
    fallback: "(c) => c.zone === \"C6_WestStreet\" || c.levelTime > 330",
    note: "三件全销毁才放行；没做完就走，通信组的纪律就白写了。"
      + "兜底把原来那条 c.objectiveIndex >= 1 撤了 —— 它在玩家刚走进师部时就成立，"
      + "会把转移任务提前到发报之前",
  },
  {
    id: "FlankMg",
    when: "抵电灯厂附近，侧面机枪开火（进 C6_PowerPlant 后由玩法层 Signal）",
    anchorBeat: "shout/canmou/ch6_canmou_16（「机枪！侧面！」）＋ CS_Ch6_Xiguan",
    fallback: "(c) => c.zone === 'C6_PowerPlant' || c.objectiveIndex >= 5 || c.levelTime > 416",
    cutscene: "CS_Ch6_Xiguan",
    note: "midLevelCutscene 的挂点：摆点层真推 Signal(\"FlankMg\") 时由 Script_Story 请求"
      + "宿主播 CS_Ch6_Xiguan（关内那条 cutscene beat 是同一场的另一条入口，"
      + "cutsceneFired 保证只播一次）。补了时刻兜底，理由同上面四条走位闸",
  },
];

// ===========================================================================
// 本章新增台词语音行（结构同 Data_Voice.mjs 现有行；key 形如 ch6_canmou_01）
//
// · who 只能取 STORY_CAST_IDS 里的 id，且必须与 key 中段一致（Data_Voice 逐条查）；
// · dur: 0 是必须写的占位，烘焙完由 Script_VoiceBake 把实测时长写回**本文件**；
// · file 不手写，由 key 推（写错的后果是静默 404 + 只剩字幕）。
//
// 交付档：战场急喊走 shout，其余走 normal。本章没有耳语段落，也没有惨叫
//（王铭章中弹那一下**不给人声**：§7 明写不虚构遗言，一声闷哼也是「遗言」的替身）。
// ===========================================================================
export const VOICE_LINES = [
  // ── 通信参谋 canmou ────────────────────────────────────────────────
  { key: "ch6_canmou_01", who: "canmou", delivery: "normal", dur: 1.69, text: "前两封都发出去了。" },
  { key: "ch6_canmou_02", who: "canmou", delivery: "normal", dur: 2.18, text: "援军还是没得消息。" },
  { key: "ch6_canmou_03", who: "canmou", delivery: "normal", dur: 3.08, text: "小秦，东关是个啥子情况？" },
  { key: "ch6_canmou_04", who: "canmou", delivery: "normal", dur: 0.96, text: "罗班长那一组喃？" },
  { key: "ch6_canmou_05", who: "canmou", delivery: "normal", dur: 0.50, text: "记下。" },
  { key: "ch6_canmou_06", who: "canmou", delivery: "normal", dur: 3.42, text: "两个营的线还通。人剩好多，报不上来。" },
  { key: "ch6_canmou_07", who: "canmou", delivery: "normal", dur: 4.14, text: "西门还开着。出了城就不晓得了。" },
  { key: "ch6_canmou_08", who: "canmou", delivery: "normal", dur: 0.70, text: "还能发。" },
  // ★ 复诵电文。交付档是 normal，但要的是**郑重**：一个字一个字确认过去的职业口吻，
  //   不许朗诵腔、不许悲壮、不许拖长音。字面按策划案，用字差异走字幕小字。
  {
    key: "ch6_canmou_09", who: "canmou", delivery: "normal", dur: 3.88,
    text: "决以死拼，以报国家，以报知遇。",
    note: "复诵最后电文。语气比常态再郑重一档：逐字确认、节奏均匀、情绪收在里面。不是朗诵，是核对。",
  },
  { key: "ch6_canmou_10", who: "canmou", delivery: "normal", dur: 3.02, text: "跟到报码纸念。一组一组来。" },
  { key: "ch6_canmou_11", who: "canmou", delivery: "shout", dur: 1.64, text: "炮！接头松了！" },
  { key: "ch6_canmou_12", who: "canmou", delivery: "normal", dur: 2.93, text: "密码本、底稿、呼号表 —— 烧。" },
  { key: "ch6_canmou_13", who: "canmou", delivery: "normal", dur: 2.31, text: "带不走的机器，砸了再走。" },
  { key: "ch6_canmou_14", who: "canmou", delivery: "normal", dur: 1.90, text: "跟到走，莫散。" },
  { key: "ch6_canmou_15", who: "canmou", delivery: "normal", dur: 1.85, text: "师长在前头。跟上。" },
  { key: "ch6_canmou_16", who: "canmou", delivery: "shout", dur: 1.47, text: "机枪！侧面！" },
  { key: "ch6_canmou_17", who: "canmou", delivery: "shout", dur: 2.01, text: "师长——！" },

  // ── 小秦 xiaoqin（玩家）────────────────────────────────────────────
  { key: "ch6_xiaoqin_01", who: "xiaoqin", delivery: "normal", dur: 4.21, text: "线全断了。东关那一段断在城墙根，我接不回来。" },
  { key: "ch6_xiaoqin_02", who: "xiaoqin", delivery: "normal", dur: 2.47, text: "街被切成一段一段的，人过不去。" },
  { key: "ch6_xiaoqin_03", who: "xiaoqin", delivery: "normal", dur: 1.80, text: "后送队往西转移了。" },
  { key: "ch6_xiaoqin_04", who: "xiaoqin", delivery: "normal", dur: 3.97, text: "建制大多散了。不同番号的人还在补位置。" },
  // 停顿在 beats 那条 delay 里，不写进音频：TTS 念省略号会自己加一口气，
  // 那口气比停顿本身还响。这一条要的是**平的**，答不出来才是重点。
  {
    key: "ch6_xiaoqin_05", who: "xiaoqin", delivery: "normal", dur: 0.96,
    text: "……没得回应。",
    note: "答不上来的那一句。开头留一点点迟疑就够，不要叹气、不要哽咽、不要加重。",
  },
  { key: "ch6_xiaoqin_06", who: "xiaoqin", delivery: "normal", dur: 2.51, text: "早上还有。这阵听不到了。" },
  { key: "ch6_xiaoqin_07", who: "xiaoqin", delivery: "shout", dur: 1.52, text: "我接！莫断！" },
  { key: "ch6_xiaoqin_08", who: "xiaoqin", delivery: "normal", dur: 0.44, text: "发毕。" },
  { key: "ch6_xiaoqin_09", who: "xiaoqin", delivery: "normal", dur: 0.67, text: "烧完了。" },

  // ── 王铭章 wangmingzhang（真实人物：只做史料里有的事）──────────────
  // 四问是策划案给的虚构台词，只问战况、不作事实断言；「那就发」「收起」同理。
  // 电文本体不放在他口中（原件未见公布），由参谋复诵 + 字幕并列版本差异。
  { key: "ch6_wangmingzhang_01", who: "wangmingzhang", delivery: "normal", dur: 2.49, text: "东南还能联系几个营？" },
  { key: "ch6_wangmingzhang_02", who: "wangmingzhang", delivery: "normal", dur: 3.31, text: "独立山方向还有枪声没得？" },
  { key: "ch6_wangmingzhang_03", who: "wangmingzhang", delivery: "normal", dur: 2.33, text: "西关还能不能走担架？" },
  { key: "ch6_wangmingzhang_04", who: "wangmingzhang", delivery: "normal", dur: 1.77, text: "电台还能发不？" },
  { key: "ch6_wangmingzhang_05", who: "wangmingzhang", delivery: "normal", dur: 0.63, text: "那就发。" },
  { key: "ch6_wangmingzhang_06", who: "wangmingzhang", delivery: "normal", dur: 0.51, text: "收起。" },
];
