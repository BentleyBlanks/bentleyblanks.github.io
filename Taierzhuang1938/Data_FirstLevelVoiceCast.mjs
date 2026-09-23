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
//   （选定哪条候选、指标与理由写在 Audio/FirstLevel/Data_FirstLevelVoiceCastManifest.json；
//    文件名固定为 Cast/AudioVoiceCast_<Who>.mp3，见 Script_SeedAudioCastBake.CastFile）
//
// 群演共用嗓子：runner / guard / relief / keeper / bearer / shouter 这类龙套在 Step 2 按
// 「同一场景里不撞嗓」共用 2–3 个群演定妆音（sharesWith 指向真正生成定妆音的那个 id）。
export const FIRST_LEVEL_VOICE_CAST = Object.freeze({
  shunzi: Object.freeze({
    faction: "nra", lang: "zh", projection: "normal", f0: [110, 175],
    persona: "二十出头的四川男兵，嗓音偏亮偏薄、鼻音轻，语速快，带点油滑的痞气；嘴硬、精明，爱挖苦人；害怕时说话急，但不是喜剧腔；和班长的低沉沙哑、川军的粗沙嗓明显不同",
    sample: "哎，你们晓得不，我屋头那条街，一到落雨天就全是泥巴，走一步陷半只脚。我老汉儿天天骂，说我这辈子就是个挑担子的命。挑就挑嘛，挑担子也比在这儿蹲起挨炮强噻。等哈回去，我先睡他个三天三夜，哪个喊我都不起来。",
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
  interpreter: Object.freeze({
    faction: "civil", lang: "zh-north", projection: "normal", f0: [110, 180],
    persona: "鲁南本地成年男性，北方官话（山东口音），对日兵点头哈腰、谄媚，对中国俘虏粗暴急促；说日语时带很重的北方口音；绝不说四川话",
    sample: "太君，您慢点走，这边地滑。哎，你们几个，看什么看，都给我站好了！太君问话呢，老老实实回答，有你们的好处。はい、はい、わかりました。太君说了，谁先说，谁就有饭吃。",
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
// 文本一字不改，取自 Data_Voice（中方口令）；只录运行时真会从这个人嘴里出来的那几条：
//   · squad  —— 班组 AI（Script_Ai）自己喊的：spot（非 event 的 4 条）、move_cover / move_flank、
//               warn_grenade、rally_shoot、hurt（hurt_hit / hurt_medic；hurt_down 是旁人喊阵亡者，
//               hurt_scream 是真人素材、不分人）、ammo（非 event 的 3 条）
//   · player —— 玩家（顺子）下令时喊的（Script_Ai.IssueOrder 的 ORDER_LINE）
// 声库键 `<key>@<who>`（SquadBarkKey）；Script_Audio.Bark 认出说话人后只在这个人的版本里挑，
// 没有本人版本的 TTS 句不说（真人素材句照常可选），一条本人版本都没有才退回公用声库。
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
/** [{ who, key, bank, file }]，按 SQUAD_BARK_CAST 的顺序。 */
export function SquadBarkEntries() {
  return Object.entries(SQUAD_BARK_CAST).flatMap(([who, set]) => SQUAD_BARK_KEYS[set].map((key) =>
    ({ who, key, bank: SquadBarkKey(key, who), file: SquadBarkFile(key, who) })));
}
