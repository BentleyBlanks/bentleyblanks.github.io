// 《地道战 · 钟声》—— 全部叙事文本。
//
// 纯数据文件：不 import 任何东西，必须能在纯 Node 里跑。
//
// 语域（AGENTS.md §4.1，改过一次，别改回去）：形式仍是《勇敢的心》的漫画气泡 +
// 象形符号，但**声音必须是电影《地道战》的**——集体的、明确的、带教学腔的。
// 早期版本按 VH 的极端克制写（24 字硬上限、全作 1 条旁白、44 条里 12 条纯图标），
// 结果把电影的声音过滤干净了。现在 118 条气泡，地道里口令此起彼伏。
//
// 总量：AGENTS.md §4.1 写的是 80–115，这里是 118，**故意超的 3 条，理由在下面**。
// 那个上限本来就是被同一种情况顶上去过一次的（110→115：第一幕补两条身份戏，
// 「没有这两条，玩家从头到尾不知道自己是谁」）。这次是第二幕：关卡侧刚把这一幕
// 从"进了地道就再也不遇人"改成三个兵摸下来，而这个转折原先一句台词都没有。
// a2_boot1/2/3 是那个转折的声音，a2_brief3 是不教就一定踩的规则（引完不许就地藏）。
// 都是承重的，不是色彩。请契约持有人把上限抬到 118。
// （冒烟测试只断言下限 ≥80，所以这 3 条不会把它打红。）
//
// 论点（AGENTS.md §0.1）：地道要「能藏、能打、能防」。
// **论点靠演示，不靠宣告**——总结句一个字都不许进台词。
//
// 字数预算按 kind 分档：beat ≤24 / call ≤20 / brief ≤44 / narrate ≤40。
// 纯图标 panel（text:""）仍是最有力的工具，比例压在 15% 以下。

export const SAVE_KEY = "tunnelbell1942_v1";

/**
 * 漫画气泡。id 前缀就是挂载语义，方便 Data_Levels.mjs 认领：
 *   aN_open / aN_close   幕首幕尾（CHAPTERS.opening / closing）
 *   aN_pM                主线节拍，已经挂在现有 trigger 上，位置别乱动
 *   aN_briefM            教学腔战术说明（林霞/高传宝/汤丙会讲设施怎么用）
 *   aN_callM             小组口令与呼应，配 signal 玩法：玩家传令，下一组才动作
 *   aN_tangM             汤丙会的戏（含跟他同场的山田台词）
 *   aN_bellM / aN_narrM  钟声母题 / 旁白
 *   aN_cs_<场次>_pM      过场台词（AGENTS.md §3.1），按过场分组，节奏比平时慢
 */
export const PANELS = {
  // ══════════════════════ 第 1 幕 · 钟声 ══════════════════════
  // 钟第一次响：示警。高老忠拿命换的。

  // —— 开场的因果顺序：地方 → 人 → 规矩 → 不对劲 → 威胁。 ——
  // 这四条走 CHAPTERS[0].opening，在玩家接手之前放完；
  // 敌人（a1_cs_open）必须挪到"狗不叫了"之后才准出现，不然玩家不知道自己是谁、
  // 也不知道那口钟是干什么的，看敲钟只觉得"这人在敲个铁片"。

  // 1 地方与时间。大远景横摇过整条街，一个活物都没有。
  a1_open: {
    speaker: "",
    text: "一九四二年冬，冀中平原。高家庄一条街，四十来户人家，都睡熟了。",
    mood: "narrate",
    kind: "narrate",
    icons: ["village", "quiet"],
    portrait: null,
  },
  // 2 你是谁——不用旁白介绍。让村里人先叫出他的名字。
  a1_night1: {
    speaker: "王大娘",
    text: "老忠叔？是你不？",
    mood: "talk",
    kind: "beat",
    icons: ["lantern", "village"],
    portrait: "villager",
  },
  // 3 他替她把门闩插上了，然后接着走。夜里替全村守着这件事，一句都不用解释。
  a1_night2: {
    speaker: "高老忠",
    text: "我。闩插上了。睡你的。",
    mood: "talk",
    kind: "beat",
    icons: ["quiet", "village"],
    portrait: "laozhong",
  },
  // 4 规矩。由他每天夜里的那个抬头动作带出来——
  // 钟必须在威胁出现之前就有意义，a1_p11 才不是一声响。
  a1_narr1: {
    speaker: "",
    text: "走到街口他总要抬头看一眼——老槐树上那口钟。一气儿连着敲，就是鬼子进村。",
    mood: "narrate",
    kind: "narrate",
    icons: ["bell", "up"],
    portrait: null,
  },

  // —— 过场 a1_cs_open：山田带队夜里摸进村（Data_Levels 已排好走位）——
  // p1 远景：睡死的村子 + 靴子进来 → p2 近景（viewHeight 6.0）：那道命令
  //   → p3 拉大远景（13.0）：队列无声散开。命令夹在"静"和"散开"中间。
  a1_cs_open_p1: {
    speaker: "",
    text: "",
    mood: "silent",
    kind: "beat",
    icons: ["village", "quiet"],
    portrait: null,
  },
  // 电影原话，一字不改。不是段子——是一道不许开枪的命令：
  // 开枪会惊了全村，人就跑进地道了；不开枪，才能把人堵在屋里。
  // mood 必须是 talk 不是 shout：压着嗓子说的，比喊出来的可怕。
  a1_cs_open_p2: {
    speaker: "山田",
    text: "悄悄地进村，打枪的不要。",
    mood: "talk",
    kind: "call",
    icons: ["quiet", "rifle"],
    portrait: "yamada",
  },
  // 汤丙会把这道命令翻译成它真正的意思，配着队列散开的大远景。
  // 玩家笑到一半会停下来——这是这条梗唯一不翻车的解法。
  a1_cs_open_p3: {
    speaker: "汤丙会",
    text: "打枪就跑了。堵屋里才逮得住。",
    mood: "talk",
    kind: "beat",
    icons: ["village", "boot"],
    portrait: "tangbinghui",
  },
  // p4 过场收尾：队列散进黑地里，一句话都没有。那道命令夹在两片静中间。
  a1_cs_open_p4: {
    speaker: "",
    text: "",
    mood: "silent",
    kind: "beat",
    icons: ["boot", "quiet"],
    portrait: null,
  },

  // 5 不对劲。全幕的转折点，用他自己的半句话，不用旁白。
  a1_p1: {
    speaker: "高老忠",
    text: "……狗今儿个不叫。",
    mood: "talk",
    kind: "beat",
    icons: ["quiet", "eye"],
    portrait: "laozhong",
  },
  // 挂在 a1_t_corpse。不评论、不煽情、不给数值。只看一眼。
  a1_p2: {
    speaker: "高老忠",
    text: "",
    mood: "silent",
    kind: "beat",
    icons: ["cross", "quiet"],
    portrait: "laozhong",
  },
  a1_p3: {
    speaker: "高老忠",
    text: "墙根底下没影子。",
    mood: "talk",
    kind: "beat",
    icons: ["quiet", "eye"],
    portrait: "laozhong",
  },
  a1_p4: {
    speaker: "王大娘",
    text: "老忠叔？这么早就……",
    mood: "talk",
    kind: "beat",
    icons: ["lantern", "eye"],
    portrait: "villager",
  },
  a1_p5: {
    speaker: "高老忠",
    text: "",
    mood: "silent",
    kind: "beat",
    icons: ["eye", "boot"],
    portrait: "laozhong",
  },
  a1_p6: {
    speaker: "高老忠",
    text: "有狗。别站起来。",
    mood: "talk",
    kind: "beat",
    icons: ["quiet", "down"],
    portrait: "laozhong",
  },
  a1_p7: {
    speaker: "山田",
    text: "这家的灶还热着。",
    mood: "talk",
    kind: "beat",
    icons: ["fire", "eye"],
    portrait: "yamada",
  },
  a1_p8: {
    speaker: "高老忠",
    text: "",
    mood: "silent",
    kind: "beat",
    icons: ["bell", "up"],
    portrait: "laozhong",
  },
  a1_p9: {
    speaker: "高老忠",
    text: "树底下有人。",
    mood: "think",
    kind: "beat",
    icons: ["clock", "boot"],
    portrait: "laozhong",
  },
  a1_p10: {
    speaker: "山田",
    text: "挨家搜。有地窖。",
    mood: "talk",
    kind: "call",
    icons: ["tunnel", "rifle"],
    portrait: "yamada",
  },

  // —— 过场 a1_cs_bell：高老忠上树敲钟。全作最重的仪式点 ——
  // p4 树底下（还没上去）：手扶上钟的那一下，只给一个钟的图标；
  //   跟 a1_close 是同一个构图，首尾扣上。
  a1_cs_bell_p1: {
    speaker: "高老忠",
    text: "",
    mood: "silent",
    kind: "beat",
    icons: ["bell"],
    portrait: "laozhong",
  },
  // 钟第一次响。他这一嗓子把全村喊活了，也把自己喊没了。（挂在 a1_pr_bell）
  a1_p11: {
    speaker: "高老忠",
    text: "鬼子进村啦——！下地道——！",
    mood: "shout",
    kind: "call",
    icons: ["bell", "village"],
    portrait: "laozhong",
  },
  // p6 山田只是把他找出来。剩下的不演——a1_close 用缺席来说。
  a1_cs_bell_p2: {
    speaker: "山田",
    text: "树上。",
    mood: "talk",
    kind: "beat",
    icons: ["up", "rifle"],
    portrait: "yamada",
  },
  a1_p12: {
    speaker: "林霞",
    text: "下地道！跟紧了！",
    mood: "shout",
    kind: "call",
    icons: ["down", "tunnel"],
    portrait: "linxia",
  },

  // —— 汤丙会：伪军队长。可怕的地方在于他是本乡人，他叫得出名字 ——
  a1_brief1: {
    speaker: "汤丙会",
    text: "太君，高家庄我熟。这村家家有地窖，窖底下多半有洞，一直通到村外。",
    mood: "talk",
    kind: "brief",
    icons: ["tunnel", "village"],
    portrait: "tangbinghui",
  },
  a1_tang1: {
    speaker: "汤丙会",
    text: "四爷！是我，丙会！开门！",
    mood: "shout",
    kind: "call",
    icons: ["village", "boot"],
    portrait: "tangbinghui",
  },
  a1_tang2: {
    speaker: "汤丙会",
    text: "我不出这个头，我娘吃啥。",
    mood: "talk",
    kind: "beat",
    icons: ["grain", "heart"],
    portrait: "tangbinghui",
  },
  // 山田用他，也防着他：探地道口，让他先下。
  a1_tang3: {
    speaker: "山田",
    text: "汤队长，你走前头。",
    mood: "talk",
    kind: "call",
    icons: ["boot", "tunnel"],
    portrait: "yamada",
  },
  a1_tang4: {
    speaker: "汤丙会",
    text: "……是。",
    mood: "talk",
    kind: "beat",
    icons: ["quiet"],
    portrait: "tangbinghui",
  },
  // 敌人知道钟要紧——所以高老忠这一路是在抢时间，不是在散步。
  a1_brief2: {
    speaker: "汤丙会",
    text: "那口钟一响，全村就没人了。得先把老槐树底下占了。",
    mood: "talk",
    kind: "brief",
    icons: ["bell", "clock"],
    portrait: "tangbinghui",
  },

  // —— 高老忠敲门叫人：坚壁清野是这么教出来的，不是写在史料里的 ——
  a1_beat1: {
    speaker: "高老忠",
    text: "下窖。东西甭拿。",
    mood: "talk",
    kind: "call",
    icons: ["down", "quiet"],
    portrait: "laozhong",
  },
  a1_beat2: {
    speaker: "王大娘",
    text: "锅还坐着火呢。",
    mood: "talk",
    kind: "beat",
    icons: ["fire", "grain"],
    portrait: "villager",
  },
  a1_brief3: {
    speaker: "高老忠",
    text: "灶抹上灰，缸底朝上。粮不能露头。人下去了，口子从里头封。",
    mood: "talk",
    kind: "brief",
    icons: ["fire", "grain"],
    portrait: "laozhong",
  },
  a1_beat3: {
    speaker: "栓柱",
    text: "俺的小狗还在院里。",
    mood: "talk",
    kind: "beat",
    icons: ["child", "quiet"],
    portrait: "villager",
  },

  // —— 钟响之后，全村的应答。这是"一个村子"第一次出声 ——
  // 敲窗根的暗号传出去以后，一条街的回话。全作第一次"传口令"。
  a1_call1: {
    speaker: "老栓",
    text: "东头下窖了没有——",
    mood: "shout",
    kind: "call",
    icons: ["down", "village"],
    portrait: "villager",
  },
  a1_call2: {
    speaker: "二嫂",
    text: "东头下完了——！",
    mood: "shout",
    kind: "call",
    icons: ["down", "village"],
    portrait: "villager",
  },
  a1_call3: {
    speaker: "秋兰",
    text: "西院还有俩娃！等一等！",
    mood: "shout",
    kind: "call",
    icons: ["child", "run"],
    portrait: "villager",
  },
  a1_call4: {
    speaker: "林霞",
    text: "都从碾道口下！别挤！",
    mood: "shout",
    kind: "call",
    icons: ["down", "tunnel"],
    portrait: "linxia",
  },

  // 全作最重的一条。钟还在晃，树底下没人。不给褒奖，不给结论。（受保护，别动）
  a1_close: {
    speaker: "",
    text: "",
    mood: "silent",
    kind: "beat",
    icons: ["bell"],
    portrait: null,
  },

  // ══════════════════════ 第 2 幕 · 翻口 ══════════════════════
  // 钟第二次响：集合。这一幕是"藏"和"防"的教学课，也是"能打"的伏笔。
  // aN_pM 按 Data_Levels 现有 trigger 的 objective 逐条对位改写过。

  a2_open: {
    speaker: "林霞",
    text: "别等了。走。",
    mood: "talk",
    kind: "beat",
    icons: ["up", "tunnel"],
    portrait: "linxia",
  },

  // —— 过场 a2_cs_open：地道里第一次听见地面的钟（钟第二响：集合）——
  // 两条台词一共 14 个字，把第一幕的账结了，一个"死"字没有。
  // p2 那句问话**没有人回答**——镜头拉开、过场结束。空着比答上更狠。
  a2_cs_open_p1: {
    speaker: "林霞",
    text: "三慢……两快。是集合。",
    mood: "talk",
    kind: "beat",
    icons: ["bell", "clock"],
    portrait: "linxia",
  },
  a2_cs_open_p2: {
    speaker: "高传宝",
    text: "谁敲的？",
    mood: "talk",
    kind: "beat",
    icons: ["bell", "eye"],
    portrait: "chuanbao",
  },
  // 她没说"高老忠没下来"。她说了一句别的。这就是回答。
  a2_cs_open_p3: {
    speaker: "林霞",
    text: "民兵队接上了。",
    mood: "talk",
    kind: "beat",
    icons: ["village", "bell"],
    portrait: "linxia",
  },

  a2_p1: {
    speaker: "林霞",
    text: "跟着灯走。灯灭了就摸墙。",
    mood: "talk",
    kind: "beat",
    icons: ["lantern", "tunnel"],
    portrait: "linxia",
  },
  // 矮洞：猫腰这个招牌姿态得有人把道理讲明白
  a2_p2: {
    speaker: "林霞",
    text: "这段是矮洞，专挑一人高的地方挖矮。猫下腰过，背别蹭顶——土掉下来有响。",
    mood: "talk",
    kind: "brief",
    icons: ["down", "tunnel"],
    portrait: "linxia",
  },
  a2_p3: {
    speaker: "林霞",
    text: "灯提低些。举高了，人还没到，影子先出去了。",
    mood: "talk",
    kind: "brief",
    icons: ["lantern", "quiet"],
    portrait: "linxia",
  },
  // 三通之一：高低相通。顺手把"上头一层能打"埋进去。
  a2_p4: {
    speaker: "林霞",
    text: "这是竖井。高低相通——下头一层藏人，上头一层打人，两层不能只有一个口。",
    mood: "talk",
    kind: "brief",
    icons: ["up", "tunnel"],
    portrait: "linxia",
  },
  a2_p5: {
    speaker: "高传宝",
    text: "记住了。上头这层能打。",
    mood: "talk",
    kind: "beat",
    icons: ["up", "rifle"],
    portrait: "chuanbao",
  },
  // 翻口：本幕标题，必须讲透
  a2_p6: {
    speaker: "林霞",
    text: "翻口在头顶，看着是死顶板。底下一顶就开，人过去再落回来——追的人只看见土。",
    mood: "talk",
    kind: "brief",
    icons: ["up", "tunnel"],
    portrait: "linxia",
  },
  a2_p7: {
    speaker: "林霞",
    text: "通气孔往上通到灶膛。孔底下别站人——刺刀顺着孔捅，光也顺着孔漏。",
    mood: "talk",
    kind: "brief",
    icons: ["fire", "up"],
    portrait: "linxia",
  },
  a2_p8: {
    speaker: "四爷",
    text: "粮埋西窖了。你们先走。",
    mood: "talk",
    kind: "beat",
    icons: ["grain", "down"],
    portrait: "villager",
  },
  a2_p9: {
    speaker: "高传宝",
    text: "还差俩。谁也不许先上。",
    mood: "talk",
    kind: "beat",
    icons: ["village", "quiet"],
    portrait: "chuanbao",
  },
  // 三通之二：街道相通
  a2_p10: {
    speaker: "林霞",
    text: "街道相通，说的就是这一段。两边院子在街底下接上，人不用露头就能过街。",
    mood: "talk",
    kind: "brief",
    icons: ["tunnel", "village"],
    portrait: "linxia",
  },
  // 三通之三：内外相通
  a2_p11: {
    speaker: "林霞",
    text: "枯井底下这个口，通到村外苇子地。内外相通——村里守不住的时候，人从这儿出去。",
    mood: "talk",
    kind: "brief",
    icons: ["up", "water"],
    portrait: "linxia",
  },
  a2_p12: {
    speaker: "林霞",
    text: "人齐了。",
    mood: "talk",
    kind: "beat",
    icons: ["village"],
    portrait: "linxia",
  },

  // —— 地道原来是安全的，现在不是了 ——
  // 这一幕原本进了地道就再也不遇人（整幕零次敌人接触），"藏"因此没有代价。
  // 关卡侧现在让三个兵摸下来（a2_e_inside / a2_e_pit / a2_e_deep，全部 spawn 门控），
  // 这三条就是那三下的声音。共同的记号是 boot ——
  // **军靴在第二幕的图标表里原先只出现过一次**（a2_tang4，还是在地面上）。
  // 现在它下来了。
  //
  // 三条都跟同一个触发器上已有的台词接着说，不是各说各的：
  //   a2_p6（林霞刚讲完"追的人只看见土"）→ a2_boot1（土底下已经站着人了）
  //   a2_p8（四爷"你们先走"）           → a2_boot2（西院已经走不了了）
  //   a2_p9（高传宝"谁也不许先上"）      → a2_boot3（等下去的代价是这个）
  a2_boot1: {
    speaker: "高传宝",
    text: "有人下来了。……不是自己人。",
    mood: "talk",
    kind: "beat",
    icons: ["boot", "down"],
    portrait: "chuanbao",
  },
  // 不说"鬼子来了"。说"不是自己人"——分自己人和外人，是这一夜全部的判断依据，
  // a2_brief2「喊话的不一定是自己人」和第三幕汤丙会喊话那场都吊在这四个字上。
  a2_boot2: {
    speaker: "林霞",
    text: "西院的口叫他们扒开了。守闸的就在底下。",
    mood: "talk",
    kind: "beat",
    icons: ["boot", "tunnel"],
    portrait: "linxia",
  },
  // 后半句是给玩家的坐标：spawn 出来的 a2_e_pit 守在干线上，而玩家这会儿在上层。
  a2_boot3: {
    speaker: "林霞",
    text: "东头也下来了。枯井那条道上堵着人。",
    mood: "talk",
    kind: "beat",
    icons: ["quiet", "boot"],
    portrait: "linxia",
  },

  // —— 过场 a2_cs_meet：暗室点人头。这一幕的仪式 ——
  // p3 他先招呼（六个人跟着这句话一个一个走进灯圈）→ p4 六个名字念出声
  //   → p5 娃答的那一声"到"。这一段的重量全在"数"这个动作上。
  a2_cs_meet_p1: {
    speaker: "高传宝",
    text: "都过来。让俺看看。",
    mood: "talk",
    kind: "beat",
    icons: ["lantern", "village"],
    portrait: "chuanbao",
  },
  a2_cs_meet_p2: {
    speaker: "高传宝",
    text: "王大娘、四爷、二嫂、老栓、秋兰、栓柱。",
    mood: "talk",
    kind: "beat",
    icons: ["lantern", "village"],
    portrait: "chuanbao",
  },
  // 娃答的这一声"到"，比什么都响。
  a2_cs_meet_p3: {
    speaker: "栓柱",
    text: "到。",
    mood: "talk",
    kind: "beat",
    icons: ["child"],
    portrait: "villager",
  },
  // 暗室里点完人头。这六个字第三幕结尾要原样再说一遍。（受保护，别动）
  a2_close: {
    speaker: "高传宝",
    text: "六个。都在。",
    mood: "talk",
    kind: "beat",
    icons: ["lantern", "village"],
    portrait: "chuanbao",
  },

  a2_brief1: {
    speaker: "高传宝",
    text: "卡口就是把道掐细，一次只过一个人。堵上一块石头，后头的就跟不上来。",
    mood: "talk",
    kind: "brief",
    icons: ["tunnel", "down"],
    portrait: "chuanbao",
  },
  // 钟点口令。最后半句是第三幕汤丙会喊话那场的钥匙。
  a2_brief2: {
    speaker: "林霞",
    text: "三慢两快是集合，一气儿连着敲是进村了。听钟点，别听人喊——喊话的不一定是自己人。",
    mood: "talk",
    kind: "brief",
    icons: ["bell", "quiet"],
    portrait: "linxia",
  },
  // 挂在引点 a2_pr_lure_s2（干线 46）。**这条是硬需求，不是氛围。**
  // 玩法上有一条反直觉的规则：被引过来的兵进的是 search 状态
  // （Script_Rules:4077 `else if (e.lured) next = "search"`），而 search 状态的兵
  // 会把人从掩体里揪出来（UpdateHiding，FLUSH_OUT_REACH = 1.5 米，警觉直接抬到 0.92）。
  // 于是"敲一下 → 就地钻进炕洞 → 等他走过去"是**跑不通的**：他从 55–61 走到 46，
  // 正好从 48.5 的炕洞和 52.5 的被褥堆身上碾过去。正确形状是「引完换层跑掉」。
  // 不教，玩家一定踩。
  //
  // 但语域是电影不是 tooltip，所以不写"请勿在引诱后原地躲藏"，
  // 写高传宝的反问口气：他是来搜的，你还敢趴在他要搜的地方？
  // 那两样掩体也点名——炕洞、被褥堆就是玩家眼前这两个道具，说的是他看得见的东西。
  a2_brief3: {
    speaker: "高传宝",
    text: "敲一下，他就朝这边来。他是来搜的——炕洞、被褥堆，挨个挑。敲完换一层走，别在这层猫着。",
    mood: "talk",
    kind: "brief",
    icons: ["eye", "up"],
    portrait: "chuanbao",
  },
  // 挂在老砖窑的窑壁 a2_pr_dig_s3e（上层 99.8）。
  // "两头对着挖、中间碰头"既是史实里的挖法，也是关卡的实际形状：
  // a2_dig_s3e（99.8→105）和 a2_dig_s4w（118→109）两段都掏开才通得过窑膛。
  // 后半句是《地道战》真正难的那件事——土往哪儿倒。
  // icons 跟 a2_beat4（山田"这块地的土是新的"）故意用同一对：
  // 她在这儿讲的道理，山田隔几十米就当场兑现一次。
  a2_brief4: {
    speaker: "林霞",
    text: "两头对着挖，中间碰头——这头掏开，那头也得掏。土填回窑坑，摊在地上就是招牌。",
    mood: "talk",
    kind: "brief",
    icons: ["dig", "eye"],
    portrait: "linxia",
  },

  // —— 各小组的口令与呼应：把"一个人在地道里"变成"一个村子在地道里" ——
  a2_call1: {
    speaker: "高传宝",
    text: "各小组注意——报数！",
    mood: "shout",
    kind: "call",
    icons: ["village", "tunnel"],
    portrait: "chuanbao",
  },
  a2_call2: {
    speaker: "老栓",
    text: "东头三口，人齐了！",
    mood: "shout",
    kind: "call",
    icons: ["village", "down"],
    portrait: "villager",
  },
  a2_call3: {
    speaker: "林霞",
    text: "碾道口封上没有——",
    mood: "shout",
    kind: "call",
    icons: ["tunnel", "quiet"],
    portrait: "linxia",
  },
  a2_call4: {
    speaker: "王大娘",
    text: "封上了——！",
    mood: "shout",
    kind: "call",
    icons: ["tunnel", "down"],
    portrait: "villager",
  },
  // 挂在 a2_t_flood（干线 84–88）：水从西院灌下来。
  // 喊的是老栓——他就蹲在正上头的西院支道（86.5, -3.8），这一嗓子是从头顶下来的。
  // 后半句不是氛围：上层从 84 一直通到 138，整段灌水段和守闸的都能不碰。
  // 一条喊出来的口令同时是一条路线提示，这是电影里那些喊话本来的功能。
  a2_call5: {
    speaker: "老栓",
    text: "西院放水了——！都往高处走——！",
    mood: "shout",
    kind: "call",
    icons: ["water", "run"],
    portrait: "villager",
  },

  // —— 汤丙会在地面上喊话。他叫得出名字，这比刺刀难对付 ——
  a2_tang1: {
    speaker: "汤丙会",
    text: "四爷——是我，丙会——出来吧——",
    mood: "shout",
    kind: "call",
    icons: ["up", "village"],
    portrait: "tangbinghui",
  },
  a2_tang2: {
    speaker: "四爷",
    text: "……那是丙会。他爹跟俺一块打过井。",
    mood: "talk",
    kind: "beat",
    icons: ["water", "quiet"],
    portrait: "villager",
  },
  a2_tang3: {
    speaker: "林霞",
    text: "别应。",
    mood: "talk",
    kind: "beat",
    icons: ["quiet"],
    portrait: "linxia",
  },
  a2_tang4: {
    speaker: "山田",
    text: "他们听你的。你再喊。",
    mood: "talk",
    kind: "call",
    icons: ["boot", "up"],
    portrait: "yamada",
  },

  // —— 情感节拍 ——
  // 孩子怕黑。不写形容词，只给图标。
  a2_beat1: {
    speaker: "栓柱",
    text: "",
    mood: "silent",
    kind: "beat",
    icons: ["child", "quiet"],
    portrait: "villager",
  },
  // 马灯递过去。全幕最暖的一下，只用五个字。
  a2_beat2: {
    speaker: "王大娘",
    text: "娃，你拿着。",
    mood: "talk",
    kind: "beat",
    icons: ["lantern", "child"],
    portrait: "villager",
  },
  a2_beat3: {
    speaker: "高传宝",
    text: "四爷，搭俺肩上。",
    mood: "talk",
    kind: "beat",
    icons: ["up", "heart"],
    portrait: "chuanbao",
  },
  a2_beat4: {
    speaker: "山田",
    text: "这块地的土是新的。",
    mood: "talk",
    kind: "beat",
    icons: ["dig", "eye"],
    portrait: "yamada",
  },
  // 想出去打。为第三幕做铺垫——但这一幕的答案是"人还没齐"。
  a2_beat5: {
    speaker: "高传宝",
    text: "上头就仨。俺摸上去。",
    mood: "talk",
    kind: "beat",
    icons: ["up", "rifle"],
    portrait: "chuanbao",
  },
  a2_beat6: {
    speaker: "林霞",
    text: "人还没齐。",
    mood: "talk",
    kind: "beat",
    icons: ["village", "quiet"],
    portrait: "linxia",
  },

  // ══════════════════════ 第 3 幕 · 转移 ══════════════════════
  // 钟第三次响：动手。先把人送出去（藏），再把敌人关进街里打（打），
  // 全程靠封口、引水、拉雷、开枪眼（防）。玩家没有攻击键——扣扳机的是全村。

  // —— 过场 a3_cs_open：汤丙会指认地道口 / 山田下令灌烟 ——
  // 走位就是层级：汤丙会走过去指，山田站着不动只把头转过来，所以山田在过场里不说话。
  // p2 他报的那个数字，紧接着就变成了 a3_open 的命令。背叛在这里是可计算的。
  a3_cs_open_p1: {
    speaker: "汤丙会",
    text: "太君，这儿。碾盘底下。",
    mood: "talk",
    kind: "beat",
    icons: ["dig", "tunnel"],
    portrait: "tangbinghui",
  },
  a3_cs_open_p2: {
    speaker: "汤丙会",
    text: "……三个口。都在这条街上。",
    mood: "talk",
    kind: "beat",
    icons: ["tunnel", "quiet"],
    portrait: "tangbinghui",
  },
  // p3 镜头拉到地表 + 地道的大剖面（viewHeight 15.0），看烟往下灌。不用配字。
  a3_cs_open_p3: {
    speaker: "",
    text: "",
    mood: "silent",
    kind: "beat",
    icons: ["gas", "tunnel"],
    portrait: null,
  },
  a3_open: {
    speaker: "山田",
    text: "放烟。三个口一起放。",
    mood: "talk",
    kind: "call",
    icons: ["gas", "tunnel"],
    portrait: "yamada",
  },

  a3_p1: {
    speaker: "林霞",
    text: "捂住嘴，别喊！",
    mood: "shout",
    kind: "call",
    icons: ["gas", "quiet"],
    portrait: "linxia",
  },
  a3_p2: {
    speaker: "高传宝",
    text: "上粮窖！那儿有木塞子！",
    mood: "shout",
    kind: "call",
    icons: ["up", "grain"],
    portrait: "chuanbao",
  },
  a3_p3: {
    speaker: "四爷",
    text: "俺来堵。你带娃走。",
    mood: "talk",
    kind: "beat",
    icons: ["child", "run"],
    portrait: "villager",
  },
  a3_p4: {
    speaker: "高传宝",
    text: "封卡口！木塞塞死！",
    mood: "shout",
    kind: "call",
    icons: ["tunnel", "down"],
    portrait: "chuanbao",
  },
  a3_p5: {
    speaker: "山田",
    text: "烟往哪走，道就往哪走。",
    mood: "talk",
    kind: "beat",
    icons: ["gas", "tunnel"],
    portrait: "yamada",
  },
  // 防：灌水反制。史料不再是收藏品，是当场要用的东西。
  a3_p6: {
    speaker: "林霞",
    text: "水道的闸在井台上。把水引进他们灌烟的那个口——水一进去，烟就压回去了。",
    mood: "talk",
    kind: "brief",
    icons: ["water", "gas"],
    portrait: "linxia",
  },
  // 挂在 a3_t_street（地表 86–90.5）。干线在 70 塌了，他不得不从碾盘底下上到街面——
  // 这一拍要的是**他站在自己村的街上，街上有岗**。无字，因为这件事他没什么可说的；
  // 该去哪儿（驴槽底下那个口）由 reveal 和目标行去说，不用图标再讲一遍。
  //
  // 图标从 eye+boot 改成 boot+quiet。只换图标，没加词。两条理由：
  //   · eye+boot 跟三十米外的 a3_p9（eye+boot+rifle）几乎重样，而那两条都是高传宝的
  //     无字一拍，挨这么近会互相削弱。a3_p9 是全作主题的落点（看见 → 是个兵 → 打得着，
  //     然后他没开枪），该让路的是这条。**eye 让给 a3_p9**：那里的"看见"是
  //     透过枪眼看见，是一个具体动作；这里的"看见"只是他的视角，本来就不必画。
  //   · boot+quiet 跟 a1_cs_open_p4（第一幕开场，队列无声散进黑地里）是同一对。
  //     那是有意的，别当成撞车改掉：同样的靴子、同样的没有声音，隔了两幕，
  //     这回站在街上的是他。两条都无字，是一副对子的上下联。
  a3_p7: {
    speaker: "高传宝",
    text: "",
    mood: "silent",
    kind: "beat",
    icons: ["boot", "quiet"],
    portrait: "chuanbao",
  },
  a3_p8: {
    speaker: "",
    text: "",
    mood: "silent",
    kind: "beat",
    icons: ["water", "down"],
    portrait: null,
  },
  // 挂在 a3_t_loophole：枪眼(121,-8)外头一个巡逻兵背对着他。
  // 图标顺序就是一句话：看见 → 是个兵 → 打得着。他一个字都没说。
  a3_p9: {
    speaker: "高传宝",
    text: "",
    mood: "think",
    kind: "beat",
    icons: ["eye", "boot", "rifle"],
    portrait: "chuanbao",
  },
  // 他没开枪。这会儿身后是六个人，不是一个机会。
  a3_p10: {
    speaker: "高传宝",
    text: "灯捻小。跟紧俺。",
    mood: "talk",
    kind: "beat",
    icons: ["lantern", "quiet"],
    portrait: "chuanbao",
  },
  a3_p11: {
    speaker: "高传宝",
    text: "老栓，二嫂，都在。",
    mood: "talk",
    kind: "beat",
    icons: ["village", "lantern"],
    portrait: "chuanbao",
  },
  // 摸黑走：认通气孔漏下来的光。导航教学，也是本幕最安静的一段。
  a3_p12: {
    speaker: "林霞",
    text: "把灯放下。摸黑走，认通气孔漏下来的光——一个孔一个院子，数着孔就知道到哪了。",
    mood: "talk",
    kind: "brief",
    icons: ["lantern", "up"],
    portrait: "linxia",
  },
  a3_p13: {
    speaker: "林霞",
    text: "黑风口。上头是苇子地。",
    mood: "talk",
    kind: "beat",
    icons: ["up", "village"],
    portrait: "linxia",
  },
  // 出口竖井底下：别出声 / 娃 / 先上去 —— 老人孩子先走。
  a3_p14: {
    speaker: "",
    text: "",
    mood: "silent",
    kind: "beat",
    icons: ["quiet", "child", "up"],
    portrait: null,
  },

  a3_brief3: {
    speaker: "林霞",
    text: "毒烟怕湿。把布浸透了捂上，干布不顶用。孔用木塞加湿土封死。",
    mood: "talk",
    kind: "brief",
    icons: ["gas", "water"],
    portrait: "linxia",
  },

  // —— 汤丙会喊话：a2_brief2「喊话的不一定是自己人」在这里兑现 ——
  a3_tang1: {
    speaker: "汤丙会",
    text: "乡亲们！出来吧！皇军不杀人——",
    mood: "shout",
    kind: "call",
    icons: ["up", "village"],
    portrait: "tangbinghui",
  },
  a3_tang2: {
    speaker: "栓柱",
    text: "那是丙会叔。",
    mood: "talk",
    kind: "beat",
    icons: ["child", "eye"],
    portrait: "villager",
  },
  // 全作最重要的一次"不动"。他们信的是钟点，不是嗓子。
  a3_tang3: {
    speaker: "林霞",
    text: "别动。钟没响。",
    mood: "talk",
    kind: "beat",
    icons: ["bell", "quiet"],
    portrait: "linxia",
  },

  // —— 反击段：人先出去，然后回头把敌人关在街里 ——
  a3_beat1: {
    speaker: "高传宝",
    text: "你们上。俺回去一趟。",
    mood: "talk",
    kind: "beat",
    icons: ["up", "run"],
    portrait: "chuanbao",
  },
  a3_brief1: {
    speaker: "林霞",
    text: "三快一慢，是动手。各小组听见钟点才动——不听钟点乱打，人就散了。",
    mood: "talk",
    kind: "brief",
    icons: ["bell", "village"],
    portrait: "linxia",
  },

  // 把高老忠死在上头的那口钟，交到高传宝手里。三个字。（过场之前挂）
  a3_cs_strike_p1: {
    speaker: "林霞",
    text: "敲吧。",
    mood: "talk",
    kind: "beat",
    icons: ["bell", "up"],
    portrait: "linxia",
  },
  a3_call1: {
    speaker: "高传宝",
    text: "各小组注意——各小组注意——",
    mood: "shout",
    kind: "call",
    icons: ["village", "tunnel"],
    portrait: "chuanbao",
  },
  a3_call2: {
    speaker: "高传宝",
    text: "东头地雷，准备好了没有——",
    mood: "shout",
    kind: "call",
    icons: ["dig", "fire"],
    portrait: "chuanbao",
  },
  a3_call3: {
    speaker: "老栓",
    text: "东头准备好了——！",
    mood: "shout",
    kind: "call",
    icons: ["dig", "fire"],
    portrait: "villager",
  },
  a3_call4: {
    speaker: "高传宝",
    text: "西头枪眼，开！",
    mood: "shout",
    kind: "call",
    icons: ["rifle", "eye"],
    portrait: "chuanbao",
  },
  a3_call5: {
    speaker: "二嫂",
    text: "西头开了——！",
    mood: "shout",
    kind: "call",
    icons: ["rifle", "village"],
    portrait: "villager",
  },
  a3_call6: {
    speaker: "林霞",
    text: "碾道翻口封上！别叫他们退回街上！",
    mood: "shout",
    kind: "call",
    icons: ["tunnel", "down"],
    portrait: "linxia",
  },
  // 回话的是老栓——王大娘、四爷、栓柱、秋兰这会儿在苇子地上头，
  // 跟着传宝回村的只有能动弹的两个。act3 的 elder 名额也只有一个。
  a3_call7: {
    speaker: "老栓",
    text: "封上了——！他们退不回去了！",
    mood: "shout",
    kind: "call",
    icons: ["tunnel", "down"],
    portrait: "villager",
  },
  // 山田到最后也是清醒的——只是已经站在街心了。
  a3_beat2: {
    speaker: "山田",
    text: "别退到街心。街心有雷。",
    mood: "shout",
    kind: "call",
    icons: ["fire", "boot"],
    portrait: "yamada",
  },
  // —— 过场 a3_cs_strike：反击得手（钟第三响）——
  // 镜头不跟玩家，它去看那些他传过口令的地方。
  // p5 地道里发信号（sfx alarm）→ p6 拉到地表大远景（16.0），汤丙会在街上走
  //   → p7 玩家自己走向黑风口。玩家从头到尾没有攻击键，扣扳机的是全村。
  a3_bell1: {
    speaker: "高传宝",
    text: "三快一慢——动手！",
    mood: "shout",
    kind: "call",
    icons: ["bell", "fire"],
    portrait: "chuanbao",
  },
  a3_tang4: {
    speaker: "汤丙会",
    text: "……高传宝！是我啊！",
    mood: "shout",
    kind: "call",
    icons: ["village", "quiet"],
    portrait: "tangbinghui",
  },
  // 不回答。不处决，不快意，不给玩家一个爽点——他只是转身往出口走。
  a3_tang5: {
    speaker: "高传宝",
    text: "",
    mood: "silent",
    kind: "beat",
    icons: ["quiet", "village"],
    portrait: "chuanbao",
  },
  // 打完的第一件事不是看战果，是回去数人。
  a3_cs_strike_p2: {
    speaker: "高传宝",
    text: "回黑风口。",
    mood: "talk",
    kind: "beat",
    icons: ["run", "up"],
    portrait: "chuanbao",
  },
  // 打赢了这件事，用旁白平平地说完；最后一句留给数人头。
  a3_narr1: {
    speaker: "",
    text: "天亮的时候，街上没有人走动了。苇子地里有六个人在等。",
    mood: "narrate",
    kind: "narrate",
    icons: ["village", "clock"],
    portrait: null,
  },
  // 跟 a2_close 一字不差。落点在"人还在"，不在"打赢了"。（受保护，别动）
  a3_close: {
    speaker: "高传宝",
    text: "六个。都在。",
    mood: "talk",
    kind: "beat",
    icons: ["village", "child"],
    portrait: "chuanbao",
  },
};

/**
 * 三幕。
 * openingCutscene 走 AGENTS.md §3.1 的过场，opening/closing 是过场之外的气泡。
 * epilogue 三条连起来是一条线：钟 → 数人头 → 还是六个。
 */
export const CHAPTERS = [
  {
    id: "act1",
    index: 1,
    title: "钟声",
    subtitle: "一九四二年 · 冀中 · 高家庄",
    openingCutscene: "a1_cs_open",
    opening: ["a1_open", "a1_night1", "a1_night2", "a1_narr1"],
    closing: ["a1_close"],
    epilogue: "那口钟响了三下。人没下来。",
  },
  {
    id: "act2",
    index: 2,
    title: "翻口",
    subtitle: "同一夜 · 高家庄地下",
    openingCutscene: "a2_cs_open",
    opening: ["a2_open"],
    closing: ["a2_close"],
    epilogue: "地底下数人头。少一个都不走。",
  },
  {
    id: "act3",
    index: 3,
    title: "转移",
    subtitle: "天亮以前 · 黑风口",
    openingCutscene: "a3_cs_open",
    opening: [],
    closing: ["a3_narr1", "a3_close"],
    epilogue: "街上静下来了。苇子地里，还是六个。",
  },
];

/**
 * 史料注解。玩家在关卡里"读"到。
 * 这些内容现在同时由 aN_briefM 在剧情里当场讲一遍——CODEX 是复习，不是唯一出处。
 */
export const CODEX = [
  {
    id: "codex_santong",
    title: "地道三通",
    body:
      "地道要三通：高低相通、内外相通、街道相通，还要能藏、能打、能防。" +
      "一条道只有一个口就是死路；堵了一处，人还能从别处走。",
  },
  {
    id: "codex_fanko",
    title: "翻口",
    body:
      "翻口是地道里特意做出的假死头。看着已经到头，其实侧壁或顶上另留一口，" +
      "翻过去接着走。敌人顺道追到这里，只见一堵土墙。",
  },
  {
    id: "codex_qiangyan",
    title: "枪眼与地堡",
    body:
      "枪眼多开在墙根、碾盘、井壁和灶台上，孔小、位低、朝外一线，只照住一段街。" +
      "地堡设在街口高处，下面与地道相连，打完退回地下。",
  },
  {
    id: "codex_tonghuo",
    title: "通气孔与防毒",
    body:
      "通气孔从地道通到地面，出口藏在灶膛、烟囱、枯井或坟头里。" +
      "敌人放毒烟时，先用浸透的湿布捂口鼻，再拿木塞和湿土把孔封死，另开一处出气。",
  },
  {
    id: "codex_shuidao",
    title: "水道与灌水反制",
    body:
      "地道多与水井、水沟相接。敌人往洞里灌水，就把水引进旧井、枯窖或村外水沟，" +
      "水存不住。反过来引水进洞，也能把毒烟压回去。",
  },
  {
    id: "codex_zhuanyi",
    title: "坚壁清野与转移",
    body:
      "报警之后先藏东西再藏人：粮食入窖、牲口牵远、锅灶抹灰。" +
      "人分批下地道，老人孩子先走，最后一个下去的负责封口。",
  },
];
