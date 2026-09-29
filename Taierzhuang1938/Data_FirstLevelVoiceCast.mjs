// 第一关 01–06 定妆表（纯数据，node 与浏览器都能读；不 import three）。
//
// 「定妆音」＝每个开口角色一条 15–25 s 的干声独白，内容是贴合人物的**非剧情**台词。
// 之后这个角色的每一句剧情干声都把它作为 SeedAudio 的参考音（references / @音频1）送进去，
// 同一个人从头到尾是同一个嗓子。选哪条候选由 Script_SeedAudioCastBake.mjs 按客观指标
// 打分、人工（集成负责人或用户）可以改选；选定写在 cast 字段并附理由。
//
// 字段：
//   （显示名只在 Data_FirstLevelMissionDialogue.MISSION_VOICE_CAST 里，这里不重复）
//   faction     "nra" 川军 / "ija" 日军 / "civil" 翻译
//   lang        定妆音与台词的主语言："zh"（四川话）/ "zh-north"（鲁南北方官话）/ "ja"
//   persona     人设（沿用 MISSION_VOICE_CAST 的描述，按 09.23 新稿补齐）
//   sample      定妆音念的内容（非剧情）；日语一律纯假名，汉字会被当中文念
//   sampleRef   日语的稿面写法（汉字），只给转写字错率当参照
//   f0          正常说话时基频中位数的合理区间（Hz），候选落在区间外不选
//   projection  默认音量档：shout / normal / low / breath（逐句可在导演表里覆盖）
//   voiceOf     可选：同一个人另一种身体/情绪状态的定妆音。生成时把 voiceOf 的定妆音作参考送进去，
//               只换状态不换嗓子；导演表 scene.voices 指定哪几场用它（Script_SeedAudioFirstLevelBake.SceneVoice）
//   maxGapS     可选：定妆候选按逐字时间把长于它的字间空当剪短（Script_SeedAudioCastBake.ShortenGaps）
//   （选定哪条候选、指标与理由写在 Audio/FirstLevel/Data_FirstLevelVoiceCastManifest.json；
//    文件名固定为 Cast/AudioVoiceCast_<Who>.mp3，见 Script_SeedAudioCastBake.CastFile）
//
// 群演共用嗓子：runner / guard / relief / keeper / bearer / shouter 这类龙套在 Step 2 按
// 「同一场景里不撞嗓」共用 2–3 个群演定妆音（sharesWith 指向真正生成定妆音的那个 id）。
export const FIRST_LEVEL_VOICE_CAST = Object.freeze({
  shunzi: Object.freeze({
    // 2026-09-30 用户：顺子「语气淡淡的」，不像他的人设，至少要像四川重庆闯江湖、跑生意的人的口音。
    // 原因：定妆音的表演说明缺省是「情绪平稳」，独白又是家常絮叨，参考音本身就是淡的，整场对白照着它演。
    // 现在人设改成跑码头做小买卖的江湖油子（重庆腔：语速快、腔调冲、抑扬顿挫、尾音上挑），定妆音写自己的表演说明
    // （sampleDelivery）、独白换成吆喝、讲价、吹自己闯码头、挖苦人的口吻；同时 Data_FirstLevelDialogueDirection
    // 里顺子每句的强度与表演说明、MISSION_VOICE_CAST 的顺子描述一并改了。
    faction: "nra", lang: "zh", projection: "normal", f0: [110, 185],
    // baseFile：2026-09-29 之前的定妆音（F0 150 Hz、家常絮叨的状态），只当音色参考，重录只换劲头不换嗓子。
    baseFile: "Cast/AudioVoiceCastBase_Shunzi20260929.mp3",
    persona: "二十出头的四川男兵，重庆一带口音，出身是跑码头、走货帮、做小买卖的江湖油子，见过世面，嘴皮子利索；"
      + "成年男人的中低音，胸腔发声，带点烟酒熏出来的沙哑，音高不高、不是少年音、不尖不细，气足，嗓门大，语速快，腔调冲，说话像在码头上吆喝讲价，抑扬顿挫、爱拖长音，咬字脆；"
      + "爱挖苦人，笑骂随口，「老子」「龟儿子」「哈儿」「硬是」不离嘴；嘴硬、精明、有火气、有江湖人的痞气和得意劲儿；"
      + "害怕时说话更急更快，但不是喜剧腔；压着嗓子说话时也不是平读、不淡，每句都带着劲儿和情绪；和班长的低沉沙哑、川军的粗沙嗓明显不同",
    sample: "你们莫小看老子哈，老子十六岁就跟到船帮跑滩，朝天门到宜昌，哪个码头老子没踩过？三教九流、袍哥舵把子，见得多了。"
      + "做生意嘛，嘴巴要溜，眼睛要毒，价钱哪个想哄老子，门都没得。这场仗打完，老子还回去跑船，硬是要把买卖做大，到时候你们哪个龟儿子来，茶钱都算老子的。",
    sampleDelivery: "跑码头的江湖油子那种劲头：语速快、嗓门大、腔调冲，像在码头上讲价又吹牛，抑扬顿挫，爱拖长音，"
      + "带着痞气和得意，中间夹着笑骂和挖苦，咬字脆；情绪饱满、有精气神，不要平平淡淡地念；用成年男人低沉的胸腔音说话，音高压低，劲头全靠节奏、重音和拖腔，绝不拔高嗓子、不要尖细、不要少年音，也不要喊破嗓子，不要耳语",
  }),
  yaowa: Object.freeze({
    faction: "nra", lang: "zh", projection: "normal", f0: [150, 240],
    persona: "十八岁四川新兵，嗓子清亮年轻，嘴快、爱接话，受到惊吓会结巴、重复；不能沉稳播音",
    sample: "顺哥，你看嘛，我这个水壶又漏了，一路走过来裤子都打湿完了。我妈说出门在外要照顾好自己，哪个晓得连个水壶都照顾不好。你莫笑嘛，你那个鞋底子还不是穿了个洞洞，走起路来啪嗒啪嗒的，老远就听到了。",
  }),
  comrade: Object.freeze({
    faction: "nra", lang: "zh", projection: "normal", f0: [105, 170],
    persona: "二十七八岁四川男兵，肩膀挂彩、缠着渗血的布；豁达嘴硬爱开玩笑，嗓子偏沙，扯到伤口时会吸一口气；和幺娃、顺子明显不是同一个声音",
    sample: "这点伤算啥子嘛，擦破点皮皮。老子在屋头挑粪都比这个累。等打完仗，老子回去开个茶铺，门口摆两根板凳，一碗盖碗茶，天天听你们这些龟儿子吹牛。哪个吹得最凶，茶钱就算哪个的。",
  }),
  // 2026-09-29 用户：被审问的川军「完全听不出是一个刚被炮炸了、浑身是伤流着血的人，也听不出愤怒厌恶仇恨」。
  // 原因之一是参考音：他的定妆音是打趣时的轻松独白，整段生成照着它的状态演。这里给同一个人录一条重伤状态的
  // 定妆音（voiceOf：生成时把 comrade 的定妆音作 @音频1 送进去，保住同一个嗓子），被拖出、被审问两场
  // （导演表 voices）用它当参考、用它的人设；防炮洞里打趣照旧用 comrade。不是台词里的说话人。
  comradeWounded: Object.freeze({
    // maxGapS：演出来满是喘和痛哼（第一次生成 37.7 s，开口前哼了 6.8 s），参考音只收 29.5 s；
    // 定妆脚本把字间长于 0.8 s 的喘气空当从中间剪短，最后吼的几句才进得了参考。
    faction: "nra", lang: "zh", projection: "shout", f0: [95, 200], voiceOf: "comrade", maxGapS: 0.8,
    persona: "就是洞口那个二十七八岁的四川男兵，同一个嗓子；此刻刚被炮弹近炸震伤、埋进土里又被日本兵拖出来当俘虏，"
      + "满脸满嘴是血，胸口和肩膀的伤一动就疼，嗓子被硝烟和土呛得嘶哑；喘得厉害，说几个字就要疼得吸一口气，声音发抖、带血沫的湿音和压不住的痛哼；"
      + "可是对日本侵略者和汉奸的愤怒、厌恶、仇恨压过了疼：咬着牙、从牙缝里往外挤，恨到发抖，绝不哭、不求饶",
    sample: "狗日的……炮弹落下来，把老子埋了半截……腿动不得了，嘴巴里头全是血……"
      + "你们这些强盗，跑到我们的地方来杀人放火……老子恨不得一口一口咬死你们……"
      + "来噻！有本事就过来！老子就算是爬，也要爬过去跟你们拼了！",
    sampleDelivery: "重伤的状态：每说几个字就疼得吸一口气、喘一下，声音嘶哑发抖，带着血沫的湿音和压不住的痛哼，中间咬牙停顿；"
      + "但字字都是愤怒、厌恶和刻骨的仇恨，从牙缝里挤出来，越说越狠，最后两句用尽力气吼出来；不是哭腔、不求饶，"
      + "吼的时候也不要喊破成噪声，每个字都要听得出来",
  }),
  luo: Object.freeze({
    faction: "nra", lang: "zh", projection: "normal", f0: [85, 150],
    persona: "三十多岁四川班长，低沉沙哑有力量，说话短、硬，吼命令不用播音腔；关心弟兄但从不说软话",
    sample: "都给老子听到起，枪栓拉好，子弹压满，水壶灌满。哪个龟儿子走路还拖拖拉拉的，等哈莫怪老子不客气。何有田，你那双草鞋又烂了？回去找后头换一双。莫叫，老子晓得路远，走到了再歇。",
  }),
  heyoutian: Object.freeze({
    faction: "nra", lang: "zh", projection: "normal", f0: [95, 160],
    persona: "二十多岁四川男兵，粗嗓门，生活化挖苦，战斗时短促直接；持大刀",
    sample: "文财，你那几颗子弹数了八遍了，再数也数不出一颗来。我跟你说，打仗靠的是这把刀，枪子儿打完了还有它。莫看它锈，砍起来一样响。你要是怕，就跟到我屁股后头，老子给你开路。",
  }),
  liuwencai: Object.freeze({
    faction: "nra", lang: "zh", projection: "normal", f0: [115, 185],
    persona: "二十多岁四川男兵，较细的干嗓，认真计较弹药，报数清楚；枪法好",
    sample: "一、二、三……还剩四十一发。我跟你讲，这个数要记清楚，一发都不能乱打。上回在河边，就是有人乱放枪，打到后头一颗都没得了。看准了再打，打一发算一发，这个是规矩。",
  }),
  zhou: Object.freeze({
    faction: "nra", lang: "zh", projection: "normal", f0: [90, 155],
    persona: "三十多岁四川老兵，机枪手，腿伤疼痛；初期还嘴硬，重伤后气弱短句；烟瘾大",
    sample: "这挺机枪跟了我三年，比婆娘还亲。枪管烫了就歇一哈，莫硬打，打红了要弯。你们这些娃娃不懂，一梭子出去要点射，嗒嗒、嗒嗒，这样才打得准。哎，哪个身上还有烟？借一根嘛。",
  }),
  runner: Object.freeze({
    faction: "nra", lang: "zh", projection: "shout", f0: [120, 200],
    persona: "年轻四川男兵，奔跑后气喘，话几乎和喘气挤在一起，但命令说清楚",
    sample: "报告！团部命令，各连天黑以前把伤员送到后头去，弹药到二营那边领，一个班一箱，多的莫要。路上莫走大路，大路上有飞机。听清楚没得？我还要去下一个连，走了！",
  }),
  shouter: Object.freeze({
    faction: "nra", lang: "zh", projection: "shout", f0: [110, 190],
    persona: "四川成年男兵，在洞外沟里，隔着炮声拼命示警，声音拉长破音",
    sample: "喂！前头的！把头埋下去！听到没得？莫探出来！那边有冷枪，刚才已经伤了两个了！等炮停了再动！都趴好！",
    // 2026-09-23：两条候选一条与罗班长撞嗓（0.78）、一条基频 356 Hz 低频只占 3%（像女声/童声），都不用；
    // 他只在 BunkerIncoming 喊一句、不和传令兵同场，共用传令兵的嗓子（少抽卡）。
    sharesWith: "runner",
  }),
  guard: Object.freeze({
    faction: "nra", lang: "zh", projection: "shout", f0: [110, 185],
    persona: "四川前沿守军，刚从前沿跑回来，气喘，隔着枪声喊话要让人听清",
    sample: "东边那个口子还守到起，机枪还在响！我们排就剩这几个人了，弹药也不多了。连长喊我们顶到天黑，天黑以后有人来换。你们是哪个连的？后头还有好多人？",
  }),
  relief: Object.freeze({
    faction: "nra", lang: "zh", projection: "normal", f0: [105, 175],
    persona: "四川成年军人，从后交通壕赶来接防，喘着气简短交接",
    sample: "这段沟归我们了，你们往后撤。机枪位在哪点？弹药留一半给我们。伤员先走，能走的扶到走。快点，莫在这儿耽搁。",
    sharesWith: "guard",
  }),
  keeper: Object.freeze({
    faction: "nra", lang: "zh", projection: "normal", f0: [95, 160],
    persona: "守弹药屋的四川老兵，嗓子哑，交代东西干脆",
    sample: "这几箱是手榴弹，那边是子弹，莫搞混了。拿的时候轻点，箱子底下有潮气。要好多拿好多，拿完了跟我说一声，我好记账。",
    // 2026-09-23：两条候选与罗班长的音色余弦都在 0.84 以上，而他唯一的场景 BundleSupply 就是跟罗班长对话；
    // 共用担架员的嗓子（与罗班长 0.57，两人不同场）。
    sharesWith: "bearer",
  }),
  bearer: Object.freeze({
    faction: "nra", lang: "zh", projection: "normal", f0: [100, 170],
    persona: "四川成年男性，劳累喘气，抬担架时短促报路，例行公事的大嗓门",
    sample: "前头有坑，脚底下看到点。一、二，起！稳到，莫晃。这个伤员腿断了，抬平点。歇一哈，歇一哈，手麻了。好，再走。",
  }),
  // 2026-09-26 用户：「翻译的语气太温柔了，至少也是个汉奸语气、恶狠狠变态的语气」——人设改成明确的汉奸腔，
  // 定妆音重烘（定妆台词前半对日本兵谄媚、后半对俘虏阴狠，两副面孔都录进参考音里）。
  // f0 区间随人设上调：定妆是演出来的谄媚尖嗓与冷笑，不是平稳说话，两条候选中位数 216 / 225 Hz，
  // 但 p10 150–167 Hz、低频占比 0.17–0.32（与旧选定的 0.29 同档），仍是成年男声，不是女声 / 童声。
  interpreter: Object.freeze({
    faction: "civil", lang: "zh-north", projection: "normal", f0: [110, 230],
    persona: "鲁南本地三十多岁的男人，给日军当翻译的汉奸，北方官话（山东口音），嗓子偏尖、油滑、带鼻音；"
      + "对日本兵点头哈腰、谄媚讨好，「是！是！」带着奴才的急切；对中国俘虏恶狠狠、阴阳怪气、狐假虎威，"
      + "爱拖长腔、冷笑、狞笑，透着变态的得意劲儿；说日语时带很重的北方口音；绝不说四川话",
    sample: "哎哟太君，您辛苦，您辛苦，这点小事哪用得着您动手，交给我，保管给您办得妥妥当当的。はい、はい、わかりました！"
      + "……嘿嘿，你们几个，都听见了吧？还瞪眼？再瞪一个我瞧瞧。太君心善，我可不心善。谁先开口谁有饭吃，谁嘴硬——嘿，我让他知道知道厉害。",
    // 定妆的表演说明（缺省是「情绪平稳」那一句；汉奸的两副面孔要进参考音，所以单独写）。
    sampleDelivery: "前半对着日本兵点头哈腰、赔着笑，又急又谄媚，一口一个是；后半转脸对着中国俘虏，嗓子一沉，"
      + "阴阳怪气地拖着长腔，带着冷笑和狞笑威胁，得意又狠毒；不要喊破嗓子，也不要耳语，语速自然",
  }),
  ijaA: Object.freeze({
    faction: "ija", lang: "ja", projection: "shout", f0: [95, 165],
    persona: "1938年日本陆军步兵上等兵，成年男性，日语母语，短促粗暴、居高临下，吼命令时喉音重；只说日语",
    sample: "おい、しょねんへい！じゅうをきれいにしておけ！あしたのあさははやいぞ。みずをくんでこい。なにをぐずぐずしている、はやくしろ！はんちょうどのがおよびだ。さっさといけ！",
    sampleRef: "おい、初年兵！銃をきれいにしておけ！明日の朝は早いぞ。水を汲んでこい。何をぐずぐずしている、早くしろ！班長殿がお呼びだ。さっさと行け！",
  }),
  ijaB: Object.freeze({
    faction: "ija", lang: "ja", projection: "shout", f0: [85, 150],
    persona: "1938年日本陆军步兵，成年男性，日语母语，比甲更闷更沉的嗓子，粗野不耐烦；只说日语",
    sample: "うるさい、だまってあるけ。このみちはどろだらけだ。くつがだめになる。おい、たばこをもっていないか。いっぽんよこせ。なんだ、そのかおは。",
    sampleRef: "うるさい、黙って歩け。この道は泥だらけだ。靴が駄目になる。おい、煙草を持っていないか。一本よこせ。なんだ、その顔は。",
  }),
  ijaC: Object.freeze({
    faction: "ija", lang: "ja", projection: "shout", f0: [110, 185],
    persona: "1938年日本陆军步兵，二十出头的成年男性，嗓音比甲年轻、偏亮、响，但仍是有胸腔共鸣的成年男声，不是尖细的嗓子；在前沟边跑边喊；只说日语",
    sample: "こっちだ、こっちだ！みんなついてこい！ここはあんぜんだ。もっとまえへいくぞ。たまをわすれるな！おくれるな！",
    sampleRef: "こっちだ、こっちだ！みんなついてこい！ここは安全だ。もっと前へ行くぞ。弾を忘れるな！遅れるな！",
    sharesWith: null,
  }),
  ijaD: Object.freeze({
    faction: "ija", lang: "ja", projection: "shout", f0: [100, 175],
    persona: "1938年日本陆军步兵，中等嗓音，警觉，短促催促；只说日语",
    sample: "まて、そこになにかいる。よくみろ。だれもいないか。よし、すすめ。あしもとにきをつけろ。とまるな、はやく！",
    sampleRef: "待て、そこに何かいる。よく見ろ。誰もいないか。よし、進め。足元に気をつけろ。止まるな、早く！",
  }),
});

/** 所有 01–06 定妆角色 id（含共用嗓子的龙套）。 */
export const FIRST_LEVEL_VOICE_CAST_IDS = Object.freeze(Object.keys(FIRST_LEVEL_VOICE_CAST));

/** 实际生成定妆音的那个角色（龙套 sharesWith 时取被共用的一方）。 */
export function CastVoiceOwner(who) {
  const entry = FIRST_LEVEL_VOICE_CAST[who];
  return entry?.sharesWith || who;
}

/** 定妆音 / 逐句干声提示词的公共口径：干声、近讲、不许环境与音效。 */
export const DRY_VOICE_RULE = "录音棚近讲干声，单声道，只有这一个人的声音：没有任何环境声、战场声、脚步、枪炮、爆炸、音效、音乐、混响和其他人声，开头和结尾不留长空白。";

/** 每个语言口径的一句硬规矩。 */
export const VOICE_LANG_RULE = Object.freeze({
  zh: "必须讲地道四川话，用四川方言的语调、声调与发音，不是普通话加几个四川词。",
  "zh-north": "必须讲鲁南一带的北方官话（山东口音），绝不说四川话；说日语时带很重的中国北方口音。",
  ja: "日语母语者，只说给出的日语，用日语发音，不说中文。",
});

// ---------------------------------------------------------------------------
// 班组战斗短句（自主喊话）用各人自己的嗓子（2026-09-24）
// ---------------------------------------------------------------------------
// Data_Voice 的中方战斗口令是「谁喊都行」的一套公用嗓子；01–06 里罗班长、幺娃、何有田、刘文才、老周与
// 玩家顺子都有定妆音，同一个人刚在对白里是这个嗓子、一开枪喊话就换成别人，听得出来。这里给他们每人
// 录一份自己的版本：同一个人的全部短句**一次请求**念完（带本人定妆音作参考），按句切开、逐句齐平
// 到战斗口令的同一档电平（喊话彼此独立，音量只该由距离与遮挡决定）。
//
// 文本一字不改，取自 Data_Voice（中方口令）；只装运行时真会从这个人嘴里出来的那几条：
//   · squad  —— 班组 AI（Script_Ai）自己喊的：spot_enemy、move_cover、rally_charge、warn_grenade、
//               hurt_hit（hurt_scream 是真人素材、不分人）、ammo_reload
//   · player —— 玩家（顺子）下令时喊的（Script_Ai.IssueOrder 的 ORDER_LINE）
// 声库键 `<key>@<who>`（SquadBarkKey）；Script_Audio.Bark 认出说话人后只在这个人的版本里挑，
// 没有本人版本的 TTS 句不说（真人素材句照常可选），一条本人版本都没有才退回公用声库。
//
// **SQUAD_BARK_KEYS 是录音稿，不是运行时清单。** 2026-09-27 撤下了一批听着像任务提示的口令（Data_Voice 头注），
// 但每人的本人版本是全部短句一次念完再切开的：撤句不重录，录音稿原样保留（提示词哈希才对得上那条录音），
// 撤下的句子记在 SQUAD_BARK_RETIRED，运行时、清单与 Barks/ 目录只认 SquadBarkEntries()（录音稿减去撤下的）。
// 哪天整人重录，把撤下的键从 SQUAD_SET / player 与下面两张表里一起删掉即可。
const SQUAD_SET = Object.freeze(["spot_east", "spot_enemy", "spot_gap", "spot_wall", "move_cover", "move_flank", "move_go", "rally_charge", "warn_down",
  "warn_grenade", "rally_shoot", "hurt_hit", "hurt_medic", "ammo_ask", "ammo_out", "ammo_reload"]);
/** 战车预兆喊话（Data_Tuning_Tank.barkCues 点名的中方 key）：只有罗班长喊，所以只录进他那一套。 */
export const LEADER_TANK_BARK_KEYS = Object.freeze(["tank_turret", "tank_window", "tank_track"]);
export const SQUAD_BARK_KEYS = Object.freeze({
  squad: SQUAD_SET,
  // 罗班长 = 班组那一套 + 03–05 战车预兆三句（2026-09-24 Front 包）。一人一次请求照旧：他的全部短句在同一条录音里念完。
  leader: Object.freeze([...SQUAD_SET, ...LEADER_TANK_BARK_KEYS]),
  player: Object.freeze(["rally_follow", "move_go", "rally_charge", "rally_hold", "move_flank", "move_cover", "rally_shoot"]),
});
/** 2026-09-27 撤下、但还在录音稿里的键（按套）。squad / leader 里的 rally_shoot、move_go 只是 AI 不再喊，玩家下令照旧用。 */
const SQUAD_RETIRED = Object.freeze(["spot_east", "spot_gap", "spot_wall", "move_flank", "move_go", "warn_down", "rally_shoot",
  "hurt_medic", "ammo_ask", "ammo_out"]);
export const SQUAD_BARK_RETIRED = Object.freeze({ squad: SQUAD_RETIRED, leader: SQUAD_RETIRED, player: Object.freeze(["move_flank"]) });
/** 撤下且已从 Data_Voice 删掉的句子原文：只给录音稿重建提示词用（Script_SeedAudioSquadBarkBake.BarkPrompt）。 */
export const SQUAD_BARK_RETIRED_TEXT = Object.freeze({
  spot_east: "东边！东边有鬼子！", spot_gap: "缺口！鬼子钻进来了！", spot_wall: "墙上！鬼子爬上墙了！",
  move_flank: "左手边！绕过去！", warn_down: "趴倒！趴倒！", hurt_medic: "担架兵！这头有人挂彩！",
  ammo_ask: "桥夹！哪个匀我一个！", ammo_out: "子弹！我莫得子弹了！",
});
/** 这一套运行时真用的键 = 录音稿减去撤下的。 */
export const SquadBarkLive = (set) => SQUAD_BARK_KEYS[set].filter((key) => !SQUAD_BARK_RETIRED[set]?.includes(key));
/** 谁录哪一套。老周只在 01–03（开场分镜认得他的那几段）能被认出来，之后退回公用声库。 */
export const SQUAD_BARK_CAST = Object.freeze({
  luo: "leader", yaowa: "squad", heyoutian: "squad", liuwencai: "squad", zhou: "squad", shunzi: "player",
});
/**
 * 本人版本只在 01–06（MISSION_STAGES 从 Trapped 到 Orders）认人。07 以后的班组喊话仍走公用声库、照旧叠变调，
 * 这一轮不改后半关的行为（契约 §2.3 只管 01–06 的 cue；FirstLevelVoiceTest 第 11 节核对这张表与关卡步骤表一致）。
 */
export const SQUAD_BARK_STAGES = Object.freeze(["Trapped", "BunkerRescue", "RearTrench", "Support", "MachineGun", "Tank", "Orders"]);
export const SquadBarkKey = (key, who) => `${key}@${who}`;
const Pascal = (text) => String(text).split("_").map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join("");
/** 相对 Audio/FirstLevel/ 的文件名。 */
export const SquadBarkFile = (key, who) => `Barks/AudioVoice_FirstLevelBark${Pascal(who)}${Pascal(key)}.mp3`;
/** 运行时装的本人版本：[{ who, key, bank, file }]，按 SQUAD_BARK_CAST 的顺序。 */
export function SquadBarkEntries() {
  return Object.entries(SQUAD_BARK_CAST).flatMap(([who, set]) => SquadBarkLive(set).map((key) =>
    ({ who, key, bank: SquadBarkKey(key, who), file: SquadBarkFile(key, who) })));
}
/** 这个人录音稿里的全部句子（含撤下的，按录音顺序）：只给烘焙脚本重建提示词、切整条录音用。 */
export function SquadBarkScript(who) {
  return SQUAD_BARK_KEYS[SQUAD_BARK_CAST[who]].map((key) => ({ who, key, bank: SquadBarkKey(key, who), file: SquadBarkFile(key, who) }));
}
