// Data_MissionCh4.mjs — 第四关｜东关之夜。规格：docs/Data_MissionRemake.md §5（正文）与 §10（契约）。
// 本文件由基建批建骨架、章节内容批填实。不许 import three，不许 Math.random。
//
// ---------------------------------------------------------------------------
// 场景基底：B 区集结院 ＋ 东关夜巷（旧 L3_Fanji 夜战切片为底）＋ A 区
//
//   B 区 · 东关临时集结院 (449, -175)  东关大街北段的一处普通民居院。
//        第五关玩家再次路过时它已坍塌（弹药箱烧黑、碎碗纸灰），无旁白也能认出。
//   A 区 · 城内主救护所   (214, -18)   与三关、五关**同一个院子**（口径见 Data_MissionCh3 头注）。
//   两个锚点都是三章共用的，**不许单独挪**；要挪就连同 CH3/CH5 的同名路标一起挪。
//
// spawn 沿用旧 L3 那个点：第二区纵向巷（生成器 x≈456 的明确车道）上，离寺院院墙
// 30 m 以上 —— 旧版曾把出生点压在寺院檐下，出图上是一条横贯全屏的黑带。
//
// 夜战：nightRaid 打开，日军火力优势削掉一半（张宣武回忆，标为回忆不是通则）。
// 照明弹是本章的招牌机制，熄灭后战场重新变暗。
//
// ---------------------------------------------------------------------------
// 十一阶段 → beats 的落点（§5 阶段号 ↔ 本文件）
//
//   ①  B 区集结 / 重新编组     zone:C4_Assembly 起的 delay 链（「三七二旅的」那组）
//   ②  九十秒休整             同上往下（刘文财话说一半／桃树／三个婆娘／再也不当兵）
//   ③  罗班长的半封回信       **口述四句在过场 CS_Ch4_UnfinishedLetter 里**；
//                             关内只留何有田「替我写两句」与电话打断（见下「过场位置」）
//   ④  黑暗接敌               zone:C4_DarkLane
//   ⑤  第一枚照明弹           zone:C4_FlareCross
//   ⑥  黑暗转移（口令报错）    ⑤ 之后的 delay 链
//   ⑦  第二枚照明弹与白刃战    zone:C4_NarrowLane
//   ⑧  罗班长救顺子           event:C4_LuoSaves（固定战场事件 4—6 秒，见 EVENTS）
//   ⑨  掩护罗班长撤离         zone:C4_CarryBack（顺子「莫松手！」，与一关松手直接反差）
//   ⑩  回到 A 区主救护所      zone:C4_AidStation（认得出门板／墙角／报纸／药箱）
//   ⑪  罗班长牺牲与顺子       ⑩ 之后的 delay 链，收在「枪给我。」
//
// ---------------------------------------------------------------------------
// 过场位置（§5 过场节：两段合计 ≤60 秒，夜战全程玩家控制）
//
//   CS_Ch4_UnfinishedLetter  25.0 s  口述四句 → 炮火加密 →「先收到。打完再写。」
//   CS_Ch4_AidStation        30.0 s  抬回 → 剪开军服 →「再包一道」→「没得脉了」→
//                                    新伤员抬入、军医转身 → 取信停在「等我回来……」
//   合计 55.0 s ≤ 60 s。
//
//   牺牲段策划案写明「无镜头特写、玩家可自由转视角」，所以**牺牲对话主体在 beats 里**
//   （顺子不接受 → 发火 → 新伤员进来停住 → 取信 → 「枪给我」），过场只覆盖上面两段。
//   两边**没有一句台词重复**：「没得脉了」只在过场，「不可能／你再看一哈」只在 beats。
//
// ---------------------------------------------------------------------------
// ENGINE_REQUEST（本章要的引擎能力；章节内容批不许改共享模块，集成批统一处理）
//
//   1. **关内过场挂点** —— **已解决**（INT1 建钩子、INT2 挂上去）
//      两场都改成关中过场：CS_Ch4_UnfinishedLetter 挂在九十秒休整之后
//      （罗班长「先把今晚熬过去。」的下一拍），CS_Ch4_AidStation 挂在玩家
//      抬着罗班长走进 A 区那一拍。挂点在
//      `Script_MissionSetpieces.SETPIECES.CH4_DongguanYe`，CHAPTER 的
//      cutsceneIn / cutsceneOut 都已置 null。下面这一段是当时的问题描述，留档：
//      引擎当时只有 `cutsceneIn`(beforeLevel) / `cutsceneOut`(afterLevel) 两个挂点。
//      按策划案：
//        · CS_Ch4_UnfinishedLetter 应在**九十秒休整之后**播（阶段③），现在只能挂
//          cutsceneIn，实际是进章即播 —— 顺序变成 ③①②，休整段的静被提前掐掉；
//        · CS_Ch4_AidStation 应在玩家抬着罗班长**走进 A 区时**播、播完恢复控制，
//          随后才是 beats 里顺子的失控对话；现在挂 cutsceneOut，实际是关末才播，
//          与 beats 的顺序颠倒（「没得脉了」落在「不可能」后面）。
//      要的东西：beat 支持 `type:"cutscene", cut:"CS_x"`，或 StoryDirector 暴露一个
//      宿主回调（Script_Main 已有 `Debug.PlayCutscene(id)`，只差从叙事层点它）。
//      落地前本文件按现有两个挂点写，能播、不报错，只是顺序如上。
//
//   2. **照明弹（mechanics.flares）**：升空—照亮—滞空—熄灭一个循环，
//      照亮期间**敌我同时暴露**（不是只照敌人）：己方与友军 AI 的可见距离一起抬，
//      屋顶敌人成为可打目标，熄灭后有数秒的暗适应（玩家与 AI 都认不出人）。
//      每关两枚由脚本投放（zone:C4_FlareCross 一枚、zone:C4_NarrowLane 一枚），
//      日方 `ija_gunso` 的「しょうめいだんをあげろ！」是它的口头信号。
//
//   3. **罗班长救顺子（EVENTS.C4_LuoSaves，固定战场事件 4—6 秒）**：炮弹击中侧墙 →
//      墙塌、玩家被冲击波击倒、武器脱手、视角贴地（第一人称，不切三人称）→
//      日军从烟尘里走近补刺 → 罗班长用通用近战动作撞开他、抓住领子把玩家往后拖 →
//      日军火力扫来、罗班长腹部中弹。**4—6 秒内必须把控制权还给玩家**。
//      事件期间玩家不许死（这一段是脚本，不是战斗）。
//
//   4. **carryLeader**：罗班长由 AI 拖/抬（幺娃 + 一名士兵），玩家只压制追兵；
//      抬的人被打倒时要有第二个人接手，**不许出现「担架落地卡住流程」**。
//
//   5. **letterDictation 与装弹并行**：口述那 25 秒里玩家的手上要有活（压桥夹）。
//      过场期间 InputRouter 只留 Look —— 所以要么给过场开一个「保留换弹键」的白名单，
//      要么等第 1 条落地后把口述改成关内定点演出。现在用 headLook + `stripperLoad`
//      音效凑（听得见自己在压弹，但按不动）。
//
//   6. **口令确认交互（mechanics.passwordChallenge）**：院门口与黑暗转移各一次。
//      门口是「对上口令才放行」的交互；夜巷那次是**友军报错口令**触发的短暂混乱
//      （EVENTS.C4_BadCountersign），几秒内友军互相指枪、罗班长喝止。
//      需要一个不伤人的「误瞄」状态，别真开友伤。
//
//   7. **信纸道具**：`Texture/Tex_PaperLetter.png` 已备好（半封家信，竖排四列，
//      第四列停在「等我回来……」）。过场里按 `props[].texture` 直接挂
//      （`./Texture/Tex_PaperLetter.png`，Script_Cutscene 已支持 spec.texture）。
//      **关内**还需要两处挂法：③ 压进衣襟前摊在弹药箱上的那张、⑪ 从衣襟取出的那张 ——
//      关内道具没有 texture 通道，要么进材质库加一条 `PaperLetter`，要么给
//      Data_Meshes 加一件带贴图的纸片道具。
//
//   8. **实录音（不走 TTS）**：按 docs/Data_AudioAssets.md「交付档」一节，
//      非语言的嗓音一律取真人录音，本章三处：
//        · 罗班长腹部中弹瞬间的**闷哼**（事件⑧，压住的、不是惨叫）；
//        · 窄巷白刃里中刀者的**短促痛呼**（⑦，有词的「幺娃——！」已走 shout 档 TTS）；
//        · A 区院内背景的**伤员痛呼床**（⑩⑪，低音量、不定位到具体人）。
//      这三条**不在本文件的 VOICE_LINES 里**（写进去会被 SeedAudio 拿去演，
//      「啊——」那一条的教训见 Data_Voice.hurt_scream），请音效批按 `sample:` 取素材。
//
//   9. **夜战曲缺位**：`music: null` 是评审结论（夜战旧曲整批未通过），
//      新候选选定前只有夜风、脚步与远处枪炮。别拿白天的 streetDistress 顶。
// ---------------------------------------------------------------------------

export const CHAPTER = {
  id: "CH4_DongguanYe",
  title: "第四关 · 东关之夜",
  place: "B 区东关集结院 → 东关夜巷 → 城内 A 区主救护所",
  date: "一九三八年三月十六日 夜 — 十七日 凌晨",
  clock: "03-16 20:00 — 03-17 02:00",
  sky: "night",
  // 夜战旧曲整批未通过评审；新候选选定前只留夜风、脚步与远处枪炮。
  music: null,
  // 四关：**幺娃必须在场** —— 阶段⑨抬罗班长的是他（「幺娃，抓稳！」），
  // 摆点层的 carryLeader 直接按 castId 找他的句柄，不在场就抬不起来。
  // 小秦（接电话、铺线）、赵德贵（门口口令）、军医（⑩⑪的抢救）同理。
  // 六个名额满了，**124 师伤兵这一章不点名**：他是「不同番号的人」的代表，
  // 台词非空间化反而对（§5 阶段①的重新编组本来就是一群没名字的人）。
  roster: ["luo", "yaowa", "heyoutian", "zhaodegui", "xiaoqin", "junyi"],
  minutes: 18,
  pool: { start: 140, end: 96, label: "城里还站着的人", presumed: true },
  brief: [
    "照明弹、火光与黑暗中的短距离巷战与白刃战。全员心理已经变了。",
    "不同番号在集结院里重新编组：会打机枪的去右边，会甩手榴弹的守院墙。",
    "东关夜战中日军用照明弹照亮街巷，敌我突然暴露并爆发近距离交火。这一段不许弱化。",
  ],
  objectives: [
    "在集结院分弹药、接电话、确认口令",
    "摸黑接敌 —— 看不到就听",
    "第一枚照明弹：贴墙，打屋顶",
    "窄巷白刃，跟住自己人",
    "掩护罗班长撤离，把人抬回城",
    "回到主救护所",
  ],
  zones: [
    // 挪到出生点北 47 m（同一条东关大街）：贴着出生点的话目标链开局就自己走一格。
    { id: "C4_Assembly", name: "B 区 · 东关集结院", x: 449, z: -175, radius: 24 },
    { id: "C4_DarkLane", name: "黑巷", x: 478, z: -89, radius: 22 },
    { id: "C4_FlareCross", name: "照明弹横巷", x: 449, z: -22, radius: 22 },
    { id: "C4_NarrowLane", name: "窄巷 · 白刃", x: 443, z: 121, radius: 22 },
    { id: "C4_CarryBack", name: "东门 · 抬回城", x: 296, z: -65, radius: 24 },
    { id: "C4_AidStation", name: "A 区 · 主救护所", x: 214, z: -18, radius: 30 },
  ],
  tuning: {
    bounds: { minX: 150, maxX: 600, minZ: -300, maxZ: 170 },
    spawn: { x: 456.6, z: -128, ry: Math.atan2(-48, -42.6) },
    // 夜里日军火力优势削掉一半 —— 全局唯一一次玩家在交换比上占便宜的时段
    ijaPressure: 0.85, ijaSpawn: ["east"], ijaSupport: ["hmg"],
    ijaForce: { lmgEvery: 13, hmgTeams: 1, engineers: true, armor: 0, motorTransport: "rearOnly" },
    ijaPool: 300,
    nightRaid: true,
    // 夜袭携行走 Data_Weapons.LOADOUTS 的具名条目（一支长枪、一支短枪、肩背大刀）。
    loadout: "L3_WhiteTowel",
  },
  beats: [
    { at: "start", type: "title", text: "东关之夜", sub: "一九三八年三月十六日 夜　东关", tier: "主流" },
    { at: "delay:3.0", type: "objective", text: "在集结院分弹药、接电话、确认口令" },

    // ── ① B 区集结院：按口径分弹药、送弹、回收阵亡者武器、接电话、门口确认口令 ──
    { at: "event:AtAssembly", type: "env", tier: "虚构",
      text: "院子里挤着三四个番号的人。有人在数弹药，有人把阵亡的枪一支支靠到墙根。" },
    { at: "delay:2.4", type: "line", who: "s124", voice: "ch4_s124_01", tier: "虚构", text: "三七二旅的。" },
    { at: "delay:2.0", type: "line", who: "heyoutian", voice: "ch4_heyoutian_01", tier: "虚构", text: "哪一团？" },
    { at: "delay:2.0", type: "line", who: "s124", voice: "ch4_s124_02", tier: "虚构", text: "团还在不在都晓不得。" },
    { at: "delay:2.4", type: "line", who: "luo", voice: "ch4_luo_01", tier: "虚构", text: "那就莫报了。" },
    { at: "delay:2.2", type: "shout", who: "luo", voice: "ch4_luo_02", tier: "虚构", text: "会打机枪的去右边。" },
    { at: "delay:2.2", type: "shout", who: "luo", voice: "ch4_luo_03", tier: "虚构", text: "会甩手榴弹的守院墙。" },
    { at: "delay:2.2", type: "shout", who: "luo", voice: "ch4_luo_04", tier: "虚构", text: "其余拿枪跟我。" },
    // 门口的口令：川军自己挑的两个地名（虚构，不当史料用）
    { at: "delay:2.6", type: "line", who: "zhaodegui", voice: "ch4_zhaodegui_01", tier: "虚构", text: "口令：长江。回令：泸州。" },
    { at: "delay:2.4", type: "line", who: "xiaoqin", voice: "ch4_xiaoqin_01", tier: "虚构", text: "线接通了。东街那头还有人。" },

    // ── ② 九十秒休整：低头喝粥、靠墙发呆、擦枪停手。想开玩笑没人接 ──────────
    { at: "delay:3.0", type: "env", tier: "虚构",
      text: "分完弹药，九十秒。有人靠着墙睡着，有人端着碗不动。" },
    { at: "delay:2.6", type: "line", who: "liuwencai", voice: "ch4_liuwencai_01", tier: "虚构", text: "这碗稀的，跟洗锅水一个样。" },
    { at: "delay:2.8", type: "env", tier: "虚构", text: "没人接他的话。何有田低着头，把碗端起来。" },
    { at: "delay:2.4", type: "line", who: "liuwencai", voice: "ch4_liuwencai_02", tier: "虚构", text: "今晚这一锅，分不到三十个人……" },
    { at: "delay:2.8", type: "env", tier: "虚构", text: "他没往下说 —— 昨天跟他抢这一锅的人，今天不在了。" },
    { at: "delay:2.6", type: "line", who: "yaowa", voice: "ch4_yaowa_01", tier: "虚构", text: "四川这阵是不是在下雨？" },
    { at: "delay:2.0", type: "line", who: "zhaodegui", voice: "ch4_zhaodegui_02", tier: "虚构", text: "该是。" },
    { at: "delay:2.4", type: "line", who: "zhaodegui", voice: "ch4_zhaodegui_03", tier: "虚构", text: "我屋头那面墙一到下雨就渗水。" },
    { at: "delay:2.4", type: "line", who: "yaowa", voice: "ch4_yaowa_02", tier: "虚构", text: "我妈一个人堵不住。" },
    { at: "delay:2.8", type: "line", who: "heyoutian", voice: "ch4_heyoutian_02", tier: "虚构", text: "我姐屋头那棵桃树，也该开了。" },
    { at: "delay:2.4", type: "line", who: "yaowa", voice: "ch4_yaowa_03", tier: "虚构", text: "不是三个婆娘等你？" },
    { at: "delay:2.0", type: "line", who: "heyoutian", voice: "ch4_heyoutian_03", tier: "虚构", text: "扯把子的。" },
    { at: "delay:2.0", type: "line", who: "heyoutian", voice: "ch4_heyoutian_04", tier: "虚构", text: "哪有三个。" },
    { at: "delay:2.4", type: "line", who: "heyoutian", voice: "ch4_heyoutian_05", tier: "虚构", text: "就我姐给我写过信。" },
    { at: "delay:2.6", type: "env", tier: "虚构", text: "说完他继续低头吃饭。没有人往下问。" },
    { at: "delay:2.6", type: "line", who: "s124", voice: "ch4_s124_03", tier: "虚构", text: "真回得去，我以后再也不当兵。" },
    { at: "delay:2.4", type: "env", tier: "虚构", text: "没有人笑他。" },
    { at: "delay:2.4", type: "line", who: "luo", voice: "ch4_luo_05", tier: "虚构", text: "先把今晚熬过去。" },

    // ── ③ 半封回信（口述四句在 CS_Ch4_UnfinishedLetter；这里是玩家边压桥夹边听的下半段）──
    { at: "delay:3.0", type: "env", tier: "虚构",
      text: "罗班长把那张写了四行的纸折好，压进衣襟。你手里还有半盒子弹要压进桥夹。" },
    { at: "delay:2.6", type: "line", who: "heyoutian", voice: "ch4_heyoutian_06", tier: "虚构", text: "顺子，等哈也替我写两句。" },
    { at: "delay:2.2", type: "line", who: "heyoutian", voice: "ch4_heyoutian_07", tier: "虚构", text: "就写我还活起。" },
    { at: "delay:2.2", type: "line", who: "heyoutian", voice: "ch4_heyoutian_08", tier: "虚构", text: "别写我吐了。" },
    { at: "delay:2.2", type: "line", who: "shunzi", voice: "ch4_shunzi_01", tier: "虚构", text: "你自己给你姐写。" },
    { at: "delay:2.4", type: "line", who: "heyoutian", voice: "ch4_heyoutian_09", tier: "虚构", text: "老子认不到恁多字。" },
    { at: "delay:2.6", type: "env", tier: "虚构", text: "炮声突然密起来。墙角的电话响了。" },
    { at: "delay:2.0", type: "shout", who: "xiaoqin", voice: "ch4_xiaoqin_02", tier: "虚构", text: "东街喊支援！" },
    { at: "delay:2.0", type: "shout", who: "luo", voice: "ch4_luo_06", tier: "虚构", text: "都起来！" },
    { at: "delay:2.0", type: "shout", who: "luo", voice: "ch4_luo_07", tier: "虚构", text: "跟到我，一个跟一个。" },

    // ── ④ 黑暗接敌（无照明弹）：靠脚步、拉栓声、日语口令、远处火光、屋顶轮廓 ──
    { at: "event:AtDarkLane", type: "objective", text: "摸黑接敌 —— 看不到就听" },
    { at: "delay:2.4", type: "line", who: "yaowa", voice: "ch4_yaowa_04", tier: "虚构", text: "黑得看得到个鸭儿。" },
    { at: "delay:2.2", type: "line", who: "luo", voice: "ch4_luo_08", tier: "虚构", text: "看不到就听。" },
    { at: "delay:2.2", type: "line", who: "luo", voice: "ch4_luo_09", tier: "虚构", text: "枪口莫对到自己人。" },
    { at: "delay:2.8", type: "env", tier: "虚构", text: "幺娃的声音发紧。远处一处民房在烧，屋顶的轮廓比天还黑。" },
    { at: "delay:2.4", type: "line", who: "liuwencai", voice: "ch4_liuwencai_03", tier: "虚构", text: "刚才过去几个人？" },
    { at: "delay:2.0", type: "line", who: "zhaodegui", voice: "ch4_zhaodegui_04", tier: "虚构", text: "莫数了。" },
    { at: "delay:2.6", type: "line", who: "ija_gunso", voice: "ch4_ija_gunso_01", tier: "虚构", text: "とまれ。おとをたてるな。" },
    { at: "delay:2.4", type: "env", tier: "虚构", text: "拉栓声。就在墙那头，听得出不止一个人。" },

    // ── ⑤ 第一枚照明弹：横巷突然照亮，敌我一起暴露 ────────────────────────
    { at: "event:AtFlareCross", type: "objective", text: "第一枚照明弹：贴墙，打屋顶" },
    { at: "delay:2.0", type: "shout", who: "yaowa", voice: "ch4_yaowa_05", tier: "虚构", text: "照明弹！" },
    { at: "delay:2.0", type: "shout", who: "luo", voice: "ch4_luo_10", tier: "虚构", text: "贴墙！" },
    { at: "delay:2.0", type: "shout", who: "yaowa", voice: "ch4_yaowa_06", tier: "虚构", text: "右边屋顶！" },
    { at: "delay:2.0", type: "shout", who: "heyoutian", voice: "ch4_heyoutian_10", tier: "虚构", text: "妈卖批，亮了！" },
    { at: "delay:2.2", type: "shout", who: "luo", voice: "ch4_luo_11", tier: "虚构", text: "打屋顶！莫站在亮处！" },
    { at: "delay:2.2", type: "shout", who: "ija_gunso", voice: "ch4_ija_gunso_02", tier: "虚构", text: "しょうめいだんをあげろ！" },
    { at: "delay:2.8", type: "env", tier: "虚构", text: "照明弹落下去，街上重新变黑。眼睛要过几秒才认得出人。" },

    // ── ⑥ 黑暗转移：按口令前进、靠枪口焰定位、防误伤；友军报错口令的短暂混乱 ──
    { at: "delay:2.4", type: "shout", who: "zhaodegui", voice: "ch4_zhaodegui_05", tier: "虚构", text: "口令！" },
    { at: "delay:2.0", type: "shout", who: "s124", voice: "ch4_s124_04", tier: "虚构", text: "……重庆！" },
    { at: "delay:2.0", type: "shout", who: "zhaodegui", voice: "ch4_zhaodegui_06", tier: "虚构", text: "不对！趴倒！" },
    { at: "delay:2.2", type: "shout", who: "heyoutian", voice: "ch4_heyoutian_11", tier: "虚构", text: "哪个自己人在乱打！" },
    { at: "delay:2.0", type: "shout", who: "s124", voice: "ch4_s124_05", tier: "虚构", text: "先报位置！" },
    { at: "delay:2.2", type: "shout", who: "luo", voice: "ch4_luo_12", tier: "虚构", text: "都闭嘴！左墙贴住！" },
    { at: "delay:2.6", type: "line", who: "xiaoqin", voice: "ch4_xiaoqin_03", tier: "虚构", text: "线在我手头，脚下莫踩。" },

    // ── ⑦ 第二枚照明弹与白刃战：窄巷敌我十余米 ──────────────────────────
    { at: "event:AtNarrowLane", type: "objective", text: "窄巷白刃，跟住自己人" },
    { at: "delay:2.0", type: "env", tier: "虚构", text: "第二枚照明弹。十几米外，两边都愣了半秒。" },
    { at: "delay:2.0", type: "shout", who: "luo", voice: "ch4_luo_13", tier: "虚构", text: "上刺刀！" },
    { at: "delay:2.0", type: "shout", who: "luo", voice: "ch4_luo_14", tier: "虚构", text: "跟住自己人！" },
    { at: "delay:2.0", type: "shout", who: "luo", voice: "ch4_luo_15", tier: "虚构", text: "莫让他们进后街！" },
    { at: "delay:2.0", type: "shout", who: "ija_gunso", voice: "ch4_ija_gunso_03", tier: "虚构", text: "にげるな！おしかえせ！" },
    { at: "delay:2.0", type: "shout", who: "yaowa", voice: "ch4_yaowa_07", tier: "虚构", text: "顺哥！左边！" },
    { at: "delay:2.0", type: "shout", who: "heyoutian", voice: "ch4_heyoutian_12", tier: "虚构", text: "狗日的小日本！" },
    // 中刀者只喊名字或骂日军 —— 纯痛呼走实录（ENGINE_REQUEST 8）
    { at: "delay:2.2", type: "shout", who: "shangbing", voice: "ch4_shangbing_01", tier: "虚构", text: "幺娃——！" },
    { at: "delay:2.2", type: "shout", who: "liuwencai", voice: "ch4_liuwencai_04", tier: "虚构", text: "还有几个？还有几个？" },
    { at: "delay:2.6", type: "env", tier: "虚构", text: "照明弹又灭了。谁是谁，只能靠喊。" },

    // ── ⑧ 罗班长救顺子（固定战场事件 4—6 秒，见 EVENTS.C4_LuoSaves）────────
    { at: "event:C4_LuoSaves", type: "env", tier: "虚构", text: "炮弹打在侧墙上。墙塌下来，你被掀翻，枪脱了手。" },
    { at: "delay:2.0", type: "shout", who: "ija_gunso", voice: "ch4_ija_gunso_04", tier: "虚构", text: "しとめろ！" },
    { at: "delay:2.0", type: "shout", who: "luo", voice: "ch4_luo_16", tier: "虚构", text: "起来！" },
    { at: "delay:2.4", type: "env", tier: "虚构", text: "罗班长撞开那个日本兵，抓住你的领子往后拖。" },
    { at: "delay:2.4", type: "env", tier: "虚构", text: "一梭子弹追过来。他闷哼一声，手没有松。" },
    { at: "delay:2.0", type: "shout", who: "shunzi", voice: "ch4_shunzi_02", tier: "虚构", text: "班长！" },
    { at: "delay:2.2", type: "line", who: "luo", voice: "ch4_luo_17", tier: "虚构", text: "……莫喊。" },

    // ── ⑨ 掩护罗班长撤离：拖/抬由 AI 执行，玩家压制。与一关「松手」直接反差 ──
    { at: "event:AtCarryBack", type: "objective", text: "掩护罗班长撤离，把人抬回城" },
    { at: "delay:2.0", type: "shout", who: "shunzi", voice: "ch4_shunzi_03", tier: "虚构", text: "莫松手！" },
    { at: "delay:2.0", type: "shout", who: "shunzi", voice: "ch4_shunzi_04", tier: "虚构", text: "把班长拖进去！" },
    { at: "delay:2.0", type: "shout", who: "shunzi", voice: "ch4_shunzi_05", tier: "虚构", text: "幺娃，抓稳！" },
    { at: "delay:2.0", type: "shout", who: "yaowa", voice: "ch4_yaowa_08", tier: "虚构", text: "抓到起了！顺哥！" },
    { at: "delay:2.0", type: "shout", who: "shunzi", voice: "ch4_shunzi_06", tier: "虚构", text: "哪个都不准松！" },
    { at: "delay:2.2", type: "shout", who: "heyoutian", voice: "ch4_heyoutian_13", tier: "虚构", text: "屋顶！还有一个在屋顶！" },
    { at: "delay:2.4", type: "line", who: "luo", voice: "ch4_luo_18", tier: "虚构", text: "狗日的……小日本。" },
    { at: "delay:2.2", type: "line", who: "shunzi", voice: "ch4_shunzi_07", tier: "虚构", text: "莫说话。" },
    { at: "delay:2.2", type: "shout", who: "liuwencai", voice: "ch4_liuwencai_05", tier: "虚构", text: "还有一条街！" },

    // ── ⑩ 回到 A 区主救护所：同一个院子，认得出门板、墙角、报纸、药箱 ────────
    { at: "event:AtAidStation", type: "objective", text: "回到主救护所" },
    { at: "delay:2.6", type: "env", tier: "虚构", text: "还是那个院子。门板还是那天拆的那几块，靠在墙根。" },
    { at: "delay:2.8", type: "env", tier: "虚构", text: "小秦接电话的墙角还在，墙上那张旧报纸也还在。药箱少了一半。" },
    { at: "delay:2.2", type: "shout", who: "yaowa", voice: "ch4_yaowa_09", tier: "虚构", text: "担架兵！这边！" },
    { at: "delay:2.2", type: "shout", who: "junyi", voice: "ch4_junyi_01", tier: "虚构", text: "放到那边！莫堵门！" },
    { at: "delay:2.2", type: "shout", who: "junyi", voice: "ch4_junyi_02", tier: "虚构", text: "纱布！哪个手上有纱布？" },
    { at: "delay:2.2", type: "line", who: "junyi", voice: "ch4_junyi_03", tier: "虚构", text: "按到起，莫松。" },
    { at: "delay:2.0", type: "line", who: "shunzi", voice: "ch4_shunzi_08", tier: "虚构", text: "按到起了。" },
    { at: "delay:2.4", type: "line", who: "junyi", voice: "ch4_junyi_04", tier: "虚构", text: "侧门那头莫让人挤进来。" },

    // ── ⑪ 罗班长牺牲与顺子的情绪（无镜头特写，玩家可自由转视角）──────────
    // 「没得脉了」在 CS_Ch4_AidStation 里，这里不重复；军医这一句是复查之前的最后一句。
    { at: "delay:3.0", type: "line", who: "junyi", voice: "ch4_junyi_05", tier: "虚构", text: "莫按了。" },
    { at: "delay:2.2", type: "line", who: "shunzi", voice: "ch4_shunzi_09", tier: "虚构", text: "不可能。" },
    { at: "delay:2.0", type: "shout", who: "shunzi", voice: "ch4_shunzi_10", tier: "虚构", text: "他一路都还在骂！" },
    { at: "delay:2.0", type: "shout", who: "shunzi", voice: "ch4_shunzi_11", tier: "虚构", text: "你再看一哈！" },
    { at: "delay:2.6", type: "env", tier: "虚构", text: "军医又摸了一次。还是摇头。" },
    { at: "delay:2.0", type: "shout", who: "shunzi", voice: "ch4_shunzi_12", tier: "虚构", text: "日你先人，你再看！" },
    { at: "delay:2.0", type: "shout", who: "shunzi", voice: "ch4_shunzi_13", tier: "虚构", text: "你莫乱说！" },
    { at: "delay:2.4", type: "line", who: "yaowa", voice: "ch4_yaowa_10", tier: "虚构", text: "顺哥……" },
    { at: "delay:3.0", type: "env", tier: "虚构", text: "你把那张纸从他衣襟里取出来。折过的地方还是热的。" },
    { at: "delay:2.6", type: "line", who: "shunzi", voice: "ch4_shunzi_14", tier: "虚构", text: "你不是说打完再写吗？" },
    { at: "delay:2.6", type: "env", tier: "虚构", text: "没有回应。院门外头有人在喊。" },
    { at: "delay:2.0", type: "shout", who: "paizhang", voice: "ch4_paizhang_01", tier: "虚构", text: "能拿枪的都到西街！" },
    { at: "delay:2.4", type: "line", who: "shunzi", voice: "ch4_shunzi_15", tier: "虚构", text: "枪给我。" },

    { at: "end", type: "narration", text: "那封回信最后一行停在「等我回来……」。他说打完再写。", tier: "虚构" },
  ],
  // 两场都改成**关中过场**（集成批 INT2 落地本文件 ENGINE_REQUEST 第 1 条）：
  //   · CS_Ch4_UnfinishedLetter 挂在**九十秒休整之后**（罗班长「先把今晚熬过去。」
  //     那一句的下一拍）。挂 cutsceneIn 的老做法是进章即播，顺序变成 ③①②，
  //     休整段那份静被提前掐掉；
  //   · CS_Ch4_AidStation 挂在**玩家抬着罗班长走进 A 区**那一拍，播完恢复控制，
  //     随后才是 beats 里顺子的失控对话。挂 cutsceneOut 的老做法是关末才播，
  //     「没得脉了」会落在「不可能」后面，因果整个颠倒。
  // 挂点在 Script_MissionSetpieces.SETPIECES.CH4_DongguanYe（onVoice / onZone）。
  cutsceneIn: null,
  cutsceneOut: null,
  mechanics: {
    flares: true,             // 照明弹：横巷突然照亮 → 熄灭后重新变暗（敌我一起暴露）
    darkNavigation: true,     // 靠脚步/拉栓声/日语口令/远处火光/屋顶轮廓判位
    friendlyFireRisk: true,   // 友军报错口令的短暂混乱：枪口莫对到自己人
    passwordChallenge: true,  // 口令确认交互：院门口一次、黑暗转移里报错一次
    bayonetNight: true,       // 第二枚照明弹与白刃战：熄灭后辨敌我、拾大刀
    squadRegroup: true,       // 不同番号重新编组（机枪 / 手榴弹 / 步枪三组）
    luoSavesShunzi: true,     // 固定战场事件 4—6 秒：墙塌、击倒、罗班长撞开敌人拖人、腹部中弹
    carryLeader: true,        // 掩护罗班长撤离：拖/抬由 AI 执行，玩家压制追兵（与一关松手反差）
    letterDictation: true,    // 罗班长的半封回信（玩家边压桥夹边听）
  },
};

/**
 * 本章的关内事件线（`beats[].at = "event:名字"` 用到的名字）。
 *
 * **判定表在 Script_Story.LEVEL_CUES**，那是共享模块，章节内容批不许改 ——
 * 所以这里登记「事件名 + 该在什么条件下算发生」，由集成批照抄进 LEVEL_CUES
 * （或由玩法系统批在真发生时 `story.Signal(name)`，推过的优先于时刻表）。
 *
 * 没接线之前的行为是**安全的**：`_EventReady` 返回 false，那一条 beat 走
 * MAX_WAIT.event = 80 s 的超时兜底照常播，只是时机不准，不会吞掉后面的剧本。
 */
export const EVENTS = [
  // ── 走位闸（集成批 INT2 新增）────────────────────────────────────────────
  // 本章原来把六拍走位挂在 `zone:` 上。正片里那样是对的（走到了就播），
  // 但 Script_PlayTest 的剧本长跑把关卡钉住、玩家不动，六条 zone 各吃一次
  // MAX_WAIT.zone = 95 s —— 570 s，把本章十八分钟的九成预算吃掉一多半，
  // 再加上两场关中过场就没有余量了。改挂 event 之后判据是
  //「走进那个圈 **或者** 时刻到了」：正片行为一模一样，回归里不会空等。
  { name: "AtAssembly", stage: "§5 阶段 1 · 进 B 区集结院",
    cue: '(c) => c.zone === "C4_Assembly" || c.levelTime > 20' },
  { name: "AtDarkLane", stage: "§5 阶段 4 · 黑暗接敌",
    cue: '(c) => c.zone === "C4_DarkLane" || c.levelTime > 195' },
  { name: "AtFlareCross", stage: "§5 阶段 5 · 照明弹横巷",
    cue: '(c) => c.zone === "C4_FlareCross" || c.levelTime > 245' },
  { name: "AtNarrowLane", stage: "§5 阶段 7 · 窄巷白刃",
    cue: '(c) => c.zone === "C4_NarrowLane" || c.levelTime > 305' },
  { name: "AtCarryBack", stage: "§5 阶段 9 · 掩护罗班长撤离",
    cue: '(c) => c.zone === "C4_CarryBack" || c.levelTime > 440' },
  { name: "AtAidStation", stage: "§5 阶段 10 · 回到 A 区主救护所",
    cue: '(c) => c.zone === "C4_AidStation" || c.levelTime > 570' },
  {
    name: "C4_LuoSaves",
    stage: "§5 阶段 8 · 罗班长救顺子",
    signal: "玩法系统批在固定事件脚本启动的那一帧 story.Signal(\"C4_LuoSaves\")",
    // INT2：`&&` 改成 `||` 并补时刻兜底。原式要求「在窄巷里**并且**过了
    // 五成八的时长」，两条都不成立时这一拍要等 80 s —— 而它是本关的转轴。
    cue: '(c) => c.zone === "C4_NarrowLane" || c.levelTime > 370',
    note: "炮弹击中侧墙 → 墙塌、玩家被击倒、武器脱手、贴地视角 → 日军走近补刺 → "
      + "罗班长撞开他、拖玩家离开 → 罗班长腹部中弹。全程 4—6 秒，随后立即还控制权。",
  },
  {
    name: "C4_BadCountersign",
    stage: "§5 阶段 6 · 黑暗转移里的口令报错",
    signal: "口令交互（mechanics.passwordChallenge）判定友军报错时 Signal",
    cue: '(c) => c.zone === "C4_FlareCross" || c.levelTime > 270',
    note: "友军报错口令 → 几秒的互相指枪与喊叫 → 罗班长喝止。**不许真开友伤**，"
      + "只做「误瞄」状态。现在这一段挂在 delay 链上，接线后可改挂 event。",
  },
  {
    name: "C4_FlareUp",
    stage: "§5 阶段 5 / 7 · 两枚照明弹",
    signal: "照明弹系统在每一枚升空时 Signal（同名可推两次，Story 只认第一次）",
    cue: '(c) => c.zone === "C4_FlareCross" || c.zone === "C4_NarrowLane" || c.levelTime > 250',
    note: "照亮期间敌我同时暴露；熄灭后有数秒暗适应。日方的「しょうめいだんをあげろ！」是口头信号。",
  },
];

// ---------------------------------------------------------------------------
// 本章语音行（结构见 Data_Voice.mjs 头注与 docs/Data_AudioAssets.md「章节剧情语音」）
//
//   key   ch4_<who>_<两位序号>，文件名由 Data_Voice.Normalize 推成 vo_<key>.mp3
//   dur   一律 0：烘焙后由 Script_VoiceBake 写回**本文件**
//   delivery
//     whisper —— 夜巷里压低声音的全部走这一档（比常态轻 6 dB，玩家靠音量差
//                听出「现在不能出声」）：④ 黑暗接敌整段、⑥ 小秦护线、
//                何有田说桃树与「替我写两句」那几句、⑪ 幺娃的「顺哥……」
//     weak    —— 罗班长中弹之后的三句
//     shout   —— 战场急喊（照明弹、白刃、掩护撤离、顺子的失控）
//     normal  —— 其余对白
//
// **闷哼、痛呼不在这张表里**：非语言的嗓音不走 TTS（ENGINE_REQUEST 8）。
// ---------------------------------------------------------------------------
export const VOICE_LINES = [
  // ── ① B 区集结院 ──────────────────────────────────────────────────────
  { key: "ch4_s124_01", who: "s124", delivery: "normal", dur: 1.05, text: "三七二旅的。" },
  { key: "ch4_heyoutian_01", who: "heyoutian", delivery: "normal", dur: 0.69, text: "哪一团？" },
  { key: "ch4_s124_02", who: "s124", delivery: "normal", dur: 2.41, text: "团还在不在都晓不得。" },
  { key: "ch4_luo_01", who: "luo", delivery: "normal", dur: 0.71, text: "那就莫报了。" },
  { key: "ch4_luo_02", who: "luo", delivery: "shout", dur: 1.94, text: "会打机枪的去右边。" },
  { key: "ch4_luo_03", who: "luo", delivery: "shout", dur: 2.80, text: "会甩手榴弹的守院墙。" },
  { key: "ch4_luo_04", who: "luo", delivery: "shout", dur: 1.16, text: "其余拿枪跟我。" },
  { key: "ch4_zhaodegui_01", who: "zhaodegui", delivery: "normal", dur: 3.75, text: "口令：长江。回令：泸州。" },
  { key: "ch4_xiaoqin_01", who: "xiaoqin", delivery: "normal", dur: 2.77, text: "线接通了。东街那头还有人。" },

  // ── ② 九十秒休整 ──────────────────────────────────────────────────────
  { key: "ch4_liuwencai_01", who: "liuwencai", delivery: "normal", dur: 2.48, text: "这碗稀的，跟洗锅水一个样。" },
  { key: "ch4_liuwencai_02", who: "liuwencai", delivery: "normal", dur: 2.84, text: "今晚这一锅，分不到三十个人……" },
  { key: "ch4_yaowa_01", who: "yaowa", delivery: "normal", dur: 2.28, text: "四川这阵是不是在下雨？" },
  { key: "ch4_zhaodegui_02", who: "zhaodegui", delivery: "normal", dur: 0.55, text: "该是。" },
  { key: "ch4_zhaodegui_03", who: "zhaodegui", delivery: "normal", dur: 3.12, text: "我屋头那面墙一到下雨就渗水。" },
  { key: "ch4_yaowa_02", who: "yaowa", delivery: "normal", dur: 1.18, text: "我妈一个人堵不住。" },
  // 「低声」——§5 原话如此，走 whisper 档
  { key: "ch4_heyoutian_02", who: "heyoutian", delivery: "whisper", dur: 4.31, text: "我姐屋头那棵桃树，也该开了。" },
  { key: "ch4_yaowa_03", who: "yaowa", delivery: "normal", dur: 1.97, text: "不是三个婆娘等你？" },
  { key: "ch4_heyoutian_03", who: "heyoutian", delivery: "normal", dur: 0.82, text: "扯把子的。" },
  { key: "ch4_heyoutian_04", who: "heyoutian", delivery: "normal", dur: 1.40, text: "哪有三个。" },
  { key: "ch4_heyoutian_05", who: "heyoutian", delivery: "normal", dur: 2.27, text: "就我姐给我写过信。" },
  { key: "ch4_s124_03", who: "s124", delivery: "normal", dur: 3.36, text: "真回得去，我以后再也不当兵。" },
  { key: "ch4_luo_05", who: "luo", delivery: "normal", dur: 1.23, text: "先把今晚熬过去。" },

  // ── ③ 半封回信（关内下半段；口述四句见过场那五条）──────────────────────
  { key: "ch4_heyoutian_06", who: "heyoutian", delivery: "whisper", dur: 4.01, text: "顺子，等哈也替我写两句。" },
  { key: "ch4_heyoutian_07", who: "heyoutian", delivery: "whisper", dur: 1.68, text: "就写我还活起。" },
  { key: "ch4_heyoutian_08", who: "heyoutian", delivery: "whisper", dur: 1.26, text: "别写我吐了。" },
  { key: "ch4_shunzi_01", who: "shunzi", delivery: "normal", dur: 0.82, text: "你自己给你姐写。" },
  { key: "ch4_heyoutian_09", who: "heyoutian", delivery: "normal", dur: 2.21, text: "老子认不到恁多字。" },
  { key: "ch4_xiaoqin_02", who: "xiaoqin", delivery: "shout", dur: 1.54, text: "东街喊支援！" },
  { key: "ch4_luo_06", who: "luo", delivery: "shout", dur: 0.37, text: "都起来！" },
  { key: "ch4_luo_07", who: "luo", delivery: "shout", dur: 2.07, text: "跟到我，一个跟一个。" },

  // ── ④ 黑暗接敌（整段 whisper）──────────────────────────────────────────
  { key: "ch4_yaowa_04", who: "yaowa", delivery: "whisper", dur: 2.73, text: "黑得看得到个鸭儿。" },
  { key: "ch4_luo_08", who: "luo", delivery: "whisper", dur: 0.78, text: "看不到就听。" },
  { key: "ch4_luo_09", who: "luo", delivery: "whisper", dur: 3.61, text: "枪口莫对到自己人。" },
  { key: "ch4_liuwencai_03", who: "liuwencai", delivery: "whisper", dur: 1.02, text: "刚才过去几个人？" },
  { key: "ch4_zhaodegui_04", who: "zhaodegui", delivery: "whisper", dur: 1.09, text: "莫数了。" },
  // 日方：text 必须是纯假名（汉字会被 seed-audio 当中文读）。汉字写法只作文档用：
  // 止まれ。音を立てるな。
  { key: "ch4_ija_gunso_01", who: "ija_gunso", delivery: "whisper", dur: 2.78, text: "とまれ。おとをたてるな。" },

  // ── ⑤ 第一枚照明弹 ────────────────────────────────────────────────────
  { key: "ch4_yaowa_05", who: "yaowa", delivery: "shout", dur: 0.70, text: "照明弹！" },
  { key: "ch4_luo_10", who: "luo", delivery: "shout", dur: 0.38, text: "贴墙！" },
  { key: "ch4_yaowa_06", who: "yaowa", delivery: "shout", dur: 0.83, text: "右边屋顶！" },
  { key: "ch4_heyoutian_10", who: "heyoutian", delivery: "shout", dur: 1.65, text: "妈卖批，亮了！" },
  { key: "ch4_luo_11", who: "luo", delivery: "shout", dur: 2.11, text: "打屋顶！莫站在亮处！" },
  // 照明弾を上げろ！
  { key: "ch4_ija_gunso_02", who: "ija_gunso", delivery: "shout", dur: 1.39, text: "しょうめいだんをあげろ！" },

  // ── ⑥ 黑暗转移 · 口令报错 ─────────────────────────────────────────────
  { key: "ch4_zhaodegui_05", who: "zhaodegui", delivery: "shout", dur: 0.42, text: "口令！" },
  { key: "ch4_s124_04", who: "s124", delivery: "shout", dur: 1.07, text: "……重庆！" },
  { key: "ch4_zhaodegui_06", who: "zhaodegui", delivery: "shout", dur: 1.17, text: "不对！趴倒！" },
  { key: "ch4_heyoutian_11", who: "heyoutian", delivery: "shout", dur: 2.03, text: "哪个自己人在乱打！" },
  { key: "ch4_s124_05", who: "s124", delivery: "shout", dur: 1.09, text: "先报位置！" },
  { key: "ch4_luo_12", who: "luo", delivery: "shout", dur: 1.44, text: "都闭嘴！左墙贴住！" },
  { key: "ch4_xiaoqin_03", who: "xiaoqin", delivery: "whisper", dur: 3.63, text: "线在我手头，脚下莫踩。" },

  // ── ⑦ 第二枚照明弹与白刃战 ────────────────────────────────────────────
  { key: "ch4_luo_13", who: "luo", delivery: "shout", dur: 0.60, text: "上刺刀！" },
  { key: "ch4_luo_14", who: "luo", delivery: "shout", dur: 1.13, text: "跟住自己人！" },
  { key: "ch4_luo_15", who: "luo", delivery: "shout", dur: 1.02, text: "莫让他们进后街！" },
  // 逃げるな！押し返せ！
  { key: "ch4_ija_gunso_03", who: "ija_gunso", delivery: "shout", dur: 2.49, text: "にげるな！おしかえせ！" },
  { key: "ch4_yaowa_07", who: "yaowa", delivery: "shout", dur: 1.21, text: "顺哥！左边！" },
  { key: "ch4_heyoutian_12", who: "heyoutian", delivery: "shout", dur: 1.17, text: "狗日的小日本！" },
  { key: "ch4_shangbing_01", who: "shangbing", delivery: "shout", dur: 0.68, text: "幺娃——！" },
  { key: "ch4_liuwencai_04", who: "liuwencai", delivery: "shout", dur: 1.58, text: "还有几个？还有几个？" },

  // ── ⑧ 罗班长救顺子 ────────────────────────────────────────────────────
  // 仕留めろ！
  { key: "ch4_ija_gunso_04", who: "ija_gunso", delivery: "shout", dur: 0.64, text: "しとめろ！" },
  { key: "ch4_luo_16", who: "luo", delivery: "shout", dur: 0.50, text: "起来！" },
  { key: "ch4_shunzi_02", who: "shunzi", delivery: "shout", dur: 0.31, text: "班长！" },
  // 中弹之后一律 weak（拉齐了就没救了，见 VOICE_DELIVERY_MIX 头注）
  { key: "ch4_luo_17", who: "luo", delivery: "weak", dur: 1.36, text: "……莫喊。" },

  // ── ⑨ 掩护罗班长撤离 ──────────────────────────────────────────────────
  { key: "ch4_shunzi_03", who: "shunzi", delivery: "shout", dur: 0.49, text: "莫松手！" },
  { key: "ch4_shunzi_04", who: "shunzi", delivery: "shout", dur: 1.67, text: "把班长拖进去！" },
  { key: "ch4_shunzi_05", who: "shunzi", delivery: "shout", dur: 1.68, text: "幺娃，抓稳！" },
  { key: "ch4_yaowa_08", who: "yaowa", delivery: "shout", dur: 1.45, text: "抓到起了！顺哥！" },
  { key: "ch4_shunzi_06", who: "shunzi", delivery: "shout", dur: 0.92, text: "哪个都不准松！" },
  { key: "ch4_heyoutian_13", who: "heyoutian", delivery: "shout", dur: 2.07, text: "屋顶！还有一个在屋顶！" },
  { key: "ch4_luo_18", who: "luo", delivery: "weak", dur: 2.53, text: "狗日的……小日本。" },
  { key: "ch4_shunzi_07", who: "shunzi", delivery: "normal", dur: 0.56, text: "莫说话。" },
  { key: "ch4_liuwencai_05", who: "liuwencai", delivery: "shout", dur: 0.99, text: "还有一条街！" },

  // ── ⑩ 回到 A 区主救护所 ───────────────────────────────────────────────
  { key: "ch4_yaowa_09", who: "yaowa", delivery: "shout", dur: 1.06, text: "担架兵！这边！" },
  { key: "ch4_junyi_01", who: "junyi", delivery: "shout", dur: 2.04, text: "放到那边！莫堵门！" },
  { key: "ch4_junyi_02", who: "junyi", delivery: "shout", dur: 1.76, text: "纱布！哪个手上有纱布？" },
  { key: "ch4_junyi_03", who: "junyi", delivery: "normal", dur: 1.40, text: "按到起，莫松。" },
  { key: "ch4_shunzi_08", who: "shunzi", delivery: "normal", dur: 0.36, text: "按到起了。" },
  { key: "ch4_junyi_04", who: "junyi", delivery: "normal", dur: 2.21, text: "侧门那头莫让人挤进来。" },

  // ── ⑪ 罗班长牺牲 ──────────────────────────────────────────────────────
  { key: "ch4_junyi_05", who: "junyi", delivery: "normal", dur: 0.64, text: "莫按了。" },
  { key: "ch4_shunzi_09", who: "shunzi", delivery: "normal", dur: 0.45, text: "不可能。" },
  { key: "ch4_shunzi_10", who: "shunzi", delivery: "shout", dur: 1.90, text: "他一路都还在骂！" },
  { key: "ch4_shunzi_11", who: "shunzi", delivery: "shout", dur: 0.73, text: "你再看一哈！" },
  { key: "ch4_shunzi_12", who: "shunzi", delivery: "shout", dur: 2.02, text: "日你先人，你再看！" },
  { key: "ch4_shunzi_13", who: "shunzi", delivery: "shout", dur: 0.87, text: "你莫乱说！" },
  { key: "ch4_yaowa_10", who: "yaowa", delivery: "whisper", dur: 0.70, text: "顺哥……" },
  { key: "ch4_shunzi_14", who: "shunzi", delivery: "normal", dur: 2.67, text: "你不是说打完再写吗？" },
  { key: "ch4_paizhang_01", who: "paizhang", delivery: "shout", dur: 1.86, text: "能拿枪的都到西街！" },
  { key: "ch4_shunzi_15", who: "shunzi", delivery: "normal", dur: 0.30, text: "枪给我。" },

  // ── 过场 1 · CS_Ch4_UnfinishedLetter（口述四句 + 收信）────────────────
  // 四句与 Texture/Tex_PaperLetter.png 上的四列逐字一致，改一个字就对不上贴图。
  { key: "ch4_luo_19", who: "luo", delivery: "normal", dur: 2.87, text: "娘的眼睛，请郎中再看一哈。" },
  { key: "ch4_luo_20", who: "luo", delivery: "normal", dur: 2.24, text: "欠王家的谷，等发饷再还。" },
  { key: "ch4_luo_21", who: "luo", delivery: "normal", dur: 2.45, text: "春妹的鞋莫做大了。" },
  { key: "ch4_luo_22", who: "luo", delivery: "normal", dur: 0.62, text: "等我回来……" },
  { key: "ch4_luo_23", who: "luo", delivery: "normal", dur: 1.84, text: "先收到。打完再写。" },

  // ── 过场 2 · CS_Ch4_AidStation ───────────────────────────────────────
  { key: "ch4_danjiayuan_01", who: "danjiayuan", delivery: "shout", dur: 1.57, text: "让一哈！让开！" },
  { key: "ch4_junyi_06", who: "junyi", delivery: "normal", dur: 1.90, text: "剪开。灯拿近点。" },
  { key: "ch4_shunzi_16", who: "shunzi", delivery: "normal", dur: 3.00, text: "再包一道。他刚才还在喘。" },
  { key: "ch4_junyi_07", who: "junyi", delivery: "normal", dur: 0.77, text: "没得脉了。" },
  { key: "ch4_danjiayuan_02", who: "danjiayuan", delivery: "shout", dur: 2.02, text: "这边还在出血！" },
];
