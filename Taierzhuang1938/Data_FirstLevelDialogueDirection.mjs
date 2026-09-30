// 第一关 01–06 对白导演表（纯数据；契约 docs/Data_FirstLevel0105Refactor20260923Contract.md §5.5）。
//
// 2026-09-23 起按用户口径「同一段对白尽量一次生成」：**一个场景 = 一次 SeedAudio 请求 = 一条整段录音**，
// 再按句切成 Audio/FirstLevel/Lines/…，每句从说话人自己的位置播放（docs/Data_FirstLevelVoiceSync20260919.md §0）。
// 所以这张表有两种用途：
//
//   1. 写进整段提示词的表演说明（不念出来）：
//      scene.context   这场戏在哪、谁对谁、彼此多远
//      context         这一句此刻在发生什么          delivery   怎么说
//      projection      shout / normal / low / breath（音量档，提示词用词 + 整段母带目标电平的加权）
//      intensity       0–1 情绪强度
//      effort          { before?, after? } 这一句前 / 后的非台词人声（笑、喘、闷哼、吸气……），一起演进整段；
//                      切句时这段声音归这一句（before 归到句首、after 归到句尾）
//      pauseBeforeS    提示词里请演员在这句之前停多久（动作空当由模型演出来，播放时沿用录音里的间隔）
//      tempo           切句时把这一片不变调压快多少倍（atempo，1–1.35；不进提示词）。模型演不到要的语速时用，
//                      只压这一句、整段录音不动；清单 lines[id].tempo 记下，逐字时间跟着缩
//
//   2. 播放时的**少量覆盖**。缺省一律沿用整段录音里的原始间隔（清单 lines[id].gapBeforeS，模型一次演出来的
//      轮替节奏），只有稿里要等动作、被打断、压尾音的地方才写：
//      after     "prev"          上一句结束后 offsetS 秒开口（offsetS < 0 = 压住上一句尾音）
//                "start"         场景开始后 offsetS 秒
//                "event:<name>"  等导演发这个事件（handle.Signal / voice.Signal）再过 offsetS 秒
//                "gate"          等 PlayScene 的 gate(lineId) 返回 true 再过 offsetS 秒
//      offsetS   缺省 null = 沿用录音间隔；写了数字就以它为准
//      spatial   "self"（第一人称顺子，居中干声）/ "head"（挂在说话人头上）/ "offscreen"（视线外的人，
//                解析不到位置时按非定位播放，电平再降 PROJECTION_OFFSCREEN_DB）
//      cutAtS    这句在第几秒被硬截断；负数 = 距句尾多少秒。截断那一刻发 cutEvent
//      stopOn    "event:<name>"：导演发这个事件时立即掐掉这句
//      gainDb    缺省 0：叠在距离衰减之上的混音增益（dB，−12…+12）。只给「远处喊、要让人听清」的句子（2026-09-29 传令兵远喊）与战场显现后压着嗓子、会被盖住的句子（BunkerOrders .02/.04）
//      emit      [{ id, at: "start"|"end"|秒 }]：播放器在这一刻发具名事件（给玩法包对动作）
//
// 场景级：priority（true = 对白窗口内自主喊话让路，01–06 剧情对白一律 true）；
//         voices（可选）{ 说话人: 定妆表 id }：这一场里这个人用另一条定妆音（同一个嗓子的另一种状态，
//         定妆表 voiceOf）当参考、用它的人设写提示词；只影响生成，不影响谁说、从哪播。

import { FIRST_LEVEL_VOICE_CAST } from "./Data_FirstLevelVoiceCast.mjs";

/** 音量档的有声段 RMS（dBFS）。整段母带的目标 = 本场各句按字数加权的平均档位（整段只拉一次电平）。 */
export const PROJECTION_DB = Object.freeze({ shout: -16, normal: -19, low: -23, breath: -27 });
/** 真峰值上限（dBTP）与切句时句首句尾保留的静音（秒）；两句贴得比 2×padS 还紧时在能量最低点切、各 10 ms 淡入淡出。 */
export const LINE_MASTER = Object.freeze({ ceilingDb: -1, padS: 0.06, padMinS: 0.04, padMaxS: 0.08, crossfadeS: 0.01 });
export const PROJECTION_OFFSCREEN_DB = -4;
/**
 * 剧情语音同时最多几路（契约 §6 音频节点预算：剧情语音同时 ≤ 3 路）。计的是真在出声的句子：
 * 各场景正在响的逐句声源 + 旧整段单槽。满了再开口时，最早开口的那句淡出让位（播放器 stats.budgetCuts 记账）。
 */
export const MAX_LIVE_DIALOGUE_LINES = 3;
/** 让位的那句淡出多久（秒）。 */
export const BUDGET_FADE_S = 0.12;
/** 录音间隔缺失（还没烘出整段）时的兜底间隔。 */
export const FALLBACK_GAP_S = 0.3;

/**
 * 对白窗口内的侧链：环境床与音乐压 −6 dB、远声组（远处战斗）压 −3 dB；SFX 不压。
 * attackS / releaseS 是起落时间常数；holdS 是最后一句结束后多久才放回来（两句之间的空当不抽泵）。
 */
export const DIALOGUE_DUCK = Object.freeze({ ambienceDb: -6, farDb: -3, attackS: 0.08, releaseS: 0.45, holdS: 0.6 });

/** 一句的表演（projection, intensity）+ 其余字段。 */
const P = (projection, intensity, more = {}) => Object.freeze({ projection, intensity, ...more });
const Scene = (priority, context, lines, more = {}) => Object.freeze({ priority, context, lines: Object.freeze(lines), ...more });

const FRONT = "前沿机枪位后面的土墙与交通沟里，枪声很密，几个人相距两三米，要喊着说才听得清";

export const FIRST_LEVEL_DIALOGUE_DIRECTION = Object.freeze({
  // —— 01 炮击间隙：坟头土打趣。一边干活一边接话，节奏快。
  BunkerBanter: Scene(true, "前沿交通壕侧壁的小防炮洞里，炮击间隙。顺子、幺娃挤在洞里一边往弹夹里压子弹一边斗嘴，肩膀挂彩的川军靠在洞口，三个人相距一两米，彼此看得见，压着嗓子说话、带笑，是苦中作乐的打趣，不是表演", {
    "01": P("low", 0.65, { context: "几块土掉进衣领，伸手往外掏", delivery: "江湖油子的腔调，压着嗓子骂一句，先是一声带鼻音的狠骂，再带笑自嘲，尾音上挑拖长，有劲儿不淡" }),
    "02": P("normal", 0.5, { context: "蹲在旁边压子弹", delivery: "接话快，嘴贫，带笑" }),
    "03": P("normal", 0.6, { delivery: "一个字，又冲又痞，笑骂一样甩出去，不是冷淡" }),
    "04": P("normal", 0.5, { context: "靠在洞口，听笑了", delivery: "带笑的嘴硬", effort: { before: "先短短笑一声" } }),
    "05": P("normal", 0.5, { delivery: "抬杠，尾音往上挑" }),
    "06": P("normal", 0.55, { delivery: "认真起来的嘴硬" }),
    "07": P("normal", 0.6, { delivery: "低头装弹，江湖油子的腔调，过来人的口气，挖苦里带点老练，语调有起伏" }),
    "08": P("normal", 0.5, { delivery: "得意" }),
    "09": P("normal", 0.55, { delivery: "马上拆台，憋着笑" }),
    "10": P("normal", 0.45, { context: "低头看了一眼自己的肩膀", delivery: "满不在乎地损人", pauseBeforeS: 0.6 }),
    "11": P("normal", 0.6, { delivery: "江湖油子的腔调，阴阳怪气、带笑损人，尾音往上挑" }),
    "12": P("normal", 0.5, { delivery: "一本正经地发狠" }),
    "13": P("normal", 0.5, { delivery: "好奇地追问" }),
    "14": P("normal", 0.55, { context: "拍了拍自己的枪", delivery: "得意，嘴角带笑", pauseBeforeS: 0.4,
      effort: { after: "说完几个人一起短促地笑了一声，马上收住" }, emit: [{ id: "BanterPatRifle", at: "start" }] }),
  }),
  // 2026-09-29 用户追加：传令兵老远就喊，玩家坐在洞里听得见；喊的只是称呼，报告（BunkerOrders.01）要跑到洞口外才说。
  // 01 从传令兵开跑、离洞口二十多米时起（导演：Orders 开始后 runnerCall.afterS）；02 等他跑近（导演的 gate：离听者 runnerCall.secondWithinM 以内，
  // 一开门就喊：offsetS 0，不沿用录音里那一秒停顿）。两句都是 spatial:"head"：声音挂在他跑动中的头上，随距离衰减、隔着壕壁与土闷一点，但要清楚可辨。
  BunkerRunnerCall: Scene(true, "后交通壕里，一个传令兵正沿壕沟拼命往前沿的防炮洞跑，离洞口还有二三十米，要让洞里的班长隔着壕壁和土听见，所以用尽全力扯着嗓子喊；他边跑边喊，喘得厉害，喊的只有班长的称呼，每个字都听得清", {
    // gainDb：实机量（无头浏览器实时跑，逐句直达声，壕壁遮挡上限 0.5）：不补时 01（22→15 m）比 BunkerOrders.01（5.3 m）低 15.6 dB（RMS）/17.4 dB（峰值），
    // 02（12→7 m）低 6.2 dB；补 01 +9 dB、02 +3 dB，使远喊清楚可闻（不比报告低过 12 dB），又仍比近处的话轻。
    "01": P("shout", 0.85, { gainDb: 9, context: "刚拐进后交通壕，离洞口二十多米，一边全力奔跑一边喊", delivery: "成年男人洪亮的嗓门，用胸腔喊，不要尖细拔高；边跑边扯着嗓子拉长音喊人，气息被脚步震得一顿一顿；只有称呼，没有别的话" }),
    "02": P("shout", 0.9, { after: "gate", offsetS: 0, pauseBeforeS: 1, gainDb: 3, context: "又跑近了一大截，还在跑，快到了", delivery: "更急更响，还是成年男人洪亮的嗓门，不要尖细拔高；只喊称呼，短促有力，带喘" }),
  }),
  // 2026-09-27 用户追加 02–04：班长不是一听就下令，先压着嗓子盘算，幺娃慌着问一句，班长再想一句，05 才回身下令。
  BunkerOrders: Scene(true, "传令兵跑到防炮洞口扶住木撑，冲洞里的班长喊；班长跪在洞口一两米外朝前沟看，听完没有马上下令：先压着嗓子自己盘算，幺娃在洞里紧张地问了一句，班长盯着前沟又低声想了一句，这才回身朝洞里下令", {
    "01": P("shout", 0.85, { context: "刚跑到洞口", delivery: "话几乎和喘气挤在一起", effort: { before: "急喘两下" } }),
    // .02 / .04 gainDb +7（2026-09-29 集成验收）：这两句是压着嗓子盘算，整段一次母带后片段 RMS −33.4 / −33.3 dBFS，
    // 比 .01 / .05（−17）低 16 dB。传令兵远喊起外面的仗「显现」之后（Data_FirstLevelMissionBattleSound 的 reveal），
    // 实机量这两句在听者处 −35.7 / −35.1 dBFS，远声组 250 Hz–4 kHz −42 / −40，余量只剩 6.6 / 4.8 dB，六七成的块被盖住。
    // 补 7 dB 后与幺娃那句低声问（.03，−26.9）同一档，仍是这一场最轻的两句，表演的压嗓音色不变。
    // 2026-09-30 对白改用人声近场曲线（Data_Tuning_Audio.STORY_SPEECH.worldRefM 1.5 m）：班长跪在 4.1 m 外降 4.0 dB、
    // 幺娃在 1.8 m 只降 0.6 dB，原来那一档差出 2.2 dB（外加传令兵显现后的余量），所以 +7 → +9 保住上面这条口径。
    "02": P("normal", 0.5, { gainDb: 9, context: "跪在洞口朝前沟看，没有回头", delivery: "自言自语地盘算，声音压着但实在、洞里的人都听得清，不是耳语气声；中间停一下", pauseBeforeS: 0.8 }),
    "03": P("normal", 0.6, { context: "抱着枪坐在洞里，盯着班长的背", delivery: "压着嗓子，心里发慌，有点结巴", pauseBeforeS: 0.5 }),
    "04": P("normal", 0.6, { gainDb: 9, context: "还是盯着前沟，没回头", delivery: "边想边说，声音沉、实在、听得清，不是耳语，不拖；最后半句下了决心，语气一沉", pauseBeforeS: 0.5 }),
    "05": P("shout", 0.8, { context: "一撑地站起来，回身朝洞里", delivery: "短促有力的命令，不拖音", pauseBeforeS: 0.3 }),
  }),
  // 被爆炸截断：句尾约 0.35 s 处硬掐（原文「炮弹！趴下——！（被爆炸截断）」），截断那一刻发 BunkerBlast。
  BunkerIncoming: Scene(true, "洞外交通沟里一个兵听见炮弹啸声逼近，隔着十来米朝防炮洞拼命示警", {
    "01": P("shout", 1, { spatial: "offscreen", cutAtS: -0.35, cutEvent: "BunkerBlast", stopOn: "event:Blast",
      delivery: "拼命的急喊，拉长破音" }),
  }),
  // 醒来时：前沟日兵边跑边喊；丁的「止まるな！」压住丙的尾音。
  BunkerSearch: Scene(true, "塌了的防炮洞外，两名日兵刚强攻破这段阵地，一路狂奔沿前沟往前冲，一前一后隔着几米边跑边喊，气还完全没喘匀", {
    "01": P("shout", 0.8, { spatial: "offscreen", delivery: "刚一路冲杀过来，上气不接下气，边跑边喊，每个词都被喘气挤断", effort: { before: "急促粗重的喘息" } }),
    "02": P("shout", 0.8, { spatial: "offscreen", delivery: "从后面压上来催，嗓子喘得发哑，话几乎和喘气挤在一起", offsetS: -0.3, effort: { after: "跑动中一口粗重的喘息" } }),
  }),
  // 2026-09-26 用户口径：日军审问「太温柔」，要变态、癫狂、发了疯一样。台词原文不动（Notion 稿），只改表演：
  // 杀红了眼的狂笑、贴脸嘶吼、情绪失控地忽高忽低；翻译被这股疯劲逼着，对俘虏也凶到发狠。
  // CaptiveDragged 不在其列：三次整段生成都在川军的含糊怒骂上出硬错误，保留原录音（日兵只有 0.6 s 的「立て！」）。
  // 2026-09-26 用户追加：炮击刚过，日兵甲乙走进前沟、发现被埋的川军伤兵，日兵乙朝东边连接支沟喊翻译；
  // 翻译在二十米外沟那头应声、一路小跑过来（导演在 InterpreterCall.02 开口时让翻译起跑）。两句沿用录音间隔。
  InterpreterCall: Scene(true, "炮击刚过，前沿交通壕的前沟里。日兵甲、日兵乙沿前沟走进来，在塌土边发现一个被半埋的川军伤兵；日兵乙站在伤兵旁边，扭头朝东边二十米外的连接支沟口扯着嗓子喊翻译；翻译（给日军传话的汉奸）在支沟那头听见，立刻应声，一边往这边小跑一边喊回来", {
    "01": P("shout", 0.85, { context: "刚跑到这里、胸口还在起伏，低头瞥了一眼土里的伤兵，扭头朝二十米外的支沟口喊", delivery: "扯着嗓子，粗野不耐烦，但明显还在大喘气、话被喘息打断；「つうやく」叫两遍，一声比一声急，最后一句是呵斥", effort: { before: "停下脚步，大口喘气" } }),
    "02": P("shout", 0.8, { context: "在支沟那头听见日本兵叫他，立刻应声，边小跑边喊回来", delivery: "奴才式的急切谄媚，一连两声「はい」抢着应，赔着小心、生怕慢了；跑动中带喘；日语带很重的中国北方口音",
      pauseBeforeS: 0.5, effort: { before: "小跑中急喘一口" } }),
  }),
  // 2026-09-29 用户：川军「完全听不出是一个刚被炮炸了、浑身是伤流着血的人，也听不出愤怒厌恶仇恨」。
  // 被拖出、被审问两场：川军换重伤状态的定妆音（voices），每句先写身体（喘、疼、血、哑）再写恨。
  CaptiveDragged: Scene(true, "炮弹刚在洞口炸过。两名日兵把被炮弹震伤、半埋在松土里的川军伤兵拽出来，贴身拉扯；他满脸满嘴是血，胸口和肩膀的伤一扯就疼，嗓子被硝烟和土呛哑，喘得厉害，可一认出是日本兵就恨得咬牙切齿；另一名日兵在前面十几米外喊", {
    "01": P("shout", 1, { context: "被日兵从土里拽出，疼得眼前发黑，睁眼认出是日本兵", delivery: "嘶哑、发抖、带着嘴里的血沫，疼得每个字都在抖；刻骨的仇恨和厌恶从牙缝里挤出来，两个词之间疼得吸一口气，第二个词更狠；受伤也绝不求饶；字要听得出来", effort: { before: "疼得一声压不住的闷哼，接着猛吸一口带血的气" } }),
    "02": P("shout", 0.8, { context: "抓住后领猛地一提", delivery: "短促粗暴" }),
    "03": P("shout", 1, { context: "被提起来扯到了伤处，疼得身子一弓", delivery: "用尽力气咬着牙骂出来，恨到发抖，声音嘶哑带血；中间疼得断一下再接着骂，不哭、不哀求；字要听得出来", pauseBeforeS: 1.2, effort: { before: "疼得倒抽一口气、闷哼一声" } }),
    "04": P("shout", 0.8, { spatial: "offscreen", context: "前方枪声又起", delivery: "远处的急喊", pauseBeforeS: 1 }),
  }, { voices: { comrade: "comradeWounded" } }),
  // 翻译（2026-09-26 用户：「至少也是个汉奸语气、恶狠狠变态的语气」）：对发了疯的日兵点头哈腰、谄媚讨好（又怕又巴结）；
  // 一转回俘虏立刻变脸，恶狠狠、阴阳怪气、带冷笑狞笑、狐假虎威。日兵各句沿用同日「癫狂」口径（上面那条）。
  // 2026-09-29 用户：「翻译的声音音调还可以，但语速太慢了，我们审问起码再快1.25x这样，而且完全也听不出威胁感，
  // 或者可以饶他一命的这种好处诱惑」。慢的根子是原来写的「拖着长腔」（人设也写了爱拖长腔，人设进了 InterpreterCall/
  // RescueFlee 的提示词，不动它，由两场审问的 scene.context 盖过去）：翻译的中文逼问改成连珠炮，问句→利诱→威胁一口气压上去。
  CaptiveInterrogation: Scene(true, "交通壕里，两名日兵把刚被炮弹炸伤、满脸满嘴是血、喘着粗气的川军俘虏按在沟壁上审问，翻译蹲在俘虏面前传话，几个人挤在一两米之内。俘虏伤得很重，每句话都在喘、都在疼，嗓子嘶哑带血，但对日本兵和汉奸只有愤怒、厌恶和仇恨。审问的日兵像发了疯的变态：杀红了眼，喘着粗气，狂笑着贴脸嘶吼，情绪忽高忽低，笑着笑着突然暴怒。翻译是给日军卖命的汉奸：转向日本兵时点头哈腰、谄媚讨好，转回俘虏时立刻变脸，恶狠狠、阴阳怪气、狐假虎威；这场审问里翻译不拖腔，对俘虏说中文时语速很快，像连珠炮一样一口气逼上去，先逼问、再假惺惺地许他活命、最后拿死吓他", {
    "01": P("shout", 1, { context: "揪着俘虏的头发往沟壁上撞，转头冲翻译狂吼", delivery: "发了疯一样的癫狂嘶吼，嗓音嘶哑，尾音带神经质的颤笑；不是居高临下地下命令，是失控的疯子", effort: { before: "喉咙里先挤出一串兴奋的怪笑" } }),
    // 02/03 前各留一口气、03 不再单独写句前冷笑（冷笑放进句尾）：日兵的怪笑、「はい」、翻译的冷笑挤在一起时
    // SeedAudio 的逐字时间戳塌成几十毫秒、静音切法也对不上（2026-09-27 五次生成都在这里连成一片）。
    "02": P("normal", 0.7, { context: "被发了疯的日兵吼得一哆嗦，等他吼完才冲他哈着腰", delivery: "马上应，又怕又巴结，奴才式的急切谄媚，赔着笑；单独一声，不和日兵的话连在一起", pauseBeforeS: 0.4 }),
    "03": P("normal", 0.85, { context: "转回脸凑到俘虏面前，脸几乎贴上去", delivery: "一变脸，语速很快，不拖腔：前半句恶狠狠地逼问，紧接着压低一点、假惺惺地许他活路，像在递一根救命稻草，诱惑里透着狞笑；句尾从鼻子里哼出一声冷笑", pauseBeforeS: 0.5  }),
    "04": P("low", 0.9, { context: "被按在沟壁上疼得直喘，慢慢抬起满是血的脸，认出凑过来的是替日军传话的汉奸", delivery: "嘶哑、喘着、带血沫；故意装没听清，拖着鄙夷反问，把厌恶和恨压在嗓子里冷冷地挤出来，像看一条狗", pauseBeforeS: 0.9, effort: { before: "两口带痛的粗喘" } }),
    "05": P("shout", 0.95, { context: "俘虏装傻，他一把揪住俘虏的衣领", delivery: "凶狠地吼，语速很快、连珠炮似的，不拖腔不停顿；问完马上翻脸威胁，最后半句咬着牙阴狠地砸下去，带着狞笑，得意又毒" , tempo: 1.05 }),
    "06": P("shout", 1, { delivery: "等不及，压着翻译的话疯狗一样扑进来狂吼，越吼越失控，嗓音嘶哑发颤", offsetS: -0.25, effort: { after: "吼完呼哧呼哧喘粗气，喉咙里咯咯怪笑" } }),
    "07": P("shout", 1, { context: "被日兵吼着，还是拼力抬起头，冲着眼前卖国的翻译", delivery: "「滚」是恨到极点、疼得发抖、从牙缝里迸出来的，嘶哑带血；喘一口气，「二鬼子」压着满腔厌恶和仇恨狠狠吐出去，像往他脸上啐；绝不哀求", pauseBeforeS: 0.8, effort: { before: "疼得发抖的粗喘，压着怒火" } }),
    "08": P("shout", 1, { context: "猛地揪住衣领把人提起来，脸贴着脸", delivery: "先阴森森地笑着压低，下一瞬间暴怒狂吼，情绪像疯子一样失控", effort: { before: "神经质地短笑两声" } }),
    "09": P("normal", 0.75, { context: "赶紧转身冲日本兵哈腰", delivery: "告状的谄媚奴才腔，急着表功撇清自己，点头哈腰，带点委屈地数落俘虏" }),
    "10": P("shout", 1, { context: "被揪着衣领提起来，满嘴是血，疼得直喘，仍盯着日兵和翻译", delivery: "嘶哑、带血、喘着，一字一顿地骂，每一顿都是咬着牙的仇恨；中间疼得喘一口再接着骂，后半句更狠，恨和厌恶压过了疼", pauseBeforeS: 0.7, effort: { before: "带血沫的一口喘气" } }),
    "11": P("shout", 1, { context: "知道自己会死，喘着，把最后一口气顶上来，直视敌人", delivery: "先疼得吸一口气，再把全身剩下的力气和刻骨的仇恨、鄙夷一起吼出去；嗓子嘶哑带血，收尾硬而狠，绝不是平静交代遗言", pauseBeforeS: 1.2, effort: { before: "猛吸一口带血的气" }, emit: [{ id: "CaptiveLastWord", at: "end" }] }),
  }, { voices: { comrade: "comradeWounded" } }),
  // 割喉之后：导演在刀划过那一刻发 ThroatCut。
  CaptiveTaunt: Scene(true, "日兵刚割了俘虏的喉，满手是血，兴奋得发了狂，抓着尸体的头发一边摇晃一边狂笑嘲弄；另一名日兵在旁边一两米跟着阴冷地怪笑；远处十几米外有日兵催促往前", {
    // 2026-09-27（用户：「一割马上就嚣张的说了那些台词」）：割中后 0.1 s 就开口（原 0.7 s）；录音不动。
    "01": P("shout", 1, { after: "event:ThroatCut", offsetS: 0.1, context: "抓着尸体的头发来回摇晃", delivery: "变态地狂笑着嘲弄，声音因兴奋而发颤、忽高忽低，像在玩弄猎物", effort: { before: "一阵停不下来的歇斯底里狂笑" } }),
    "02": P("shout", 1, { delivery: "贴着死人的脸狂吼，笑着吼、吼着笑，癫狂失控", effort: { after: "咯咯的怪笑" } }),
    "03": P("low", 0.8, { delivery: "阴冷变态，慢慢吐出，带着享受杀戮的满足", effort: { before: "喉咙深处一串低沉黏腻的怪笑" } }),
    "04": P("shout", 0.8, { spatial: "offscreen", context: "前方远处", delivery: "远处的催促", pauseBeforeS: 1.2 }),
  }),
  ShunziFound: Scene(true, "日兵拨开断木，俯到塌了的洞口，发现里面还有一个活人，像发现猎物一样兴奋得发狂", {
    "01": P("low", 0.85, { delivery: "变态的兴奋：压着嗓子、拖长了音，一字一字笑着说，笑声里透着疯劲，不喊", effort: { before: "憋不住地嘿嘿怪笑" } }),
  }),
  // 翻译各句 2026-09-29 同上：连珠炮、利诱与威胁。提示词写了快，模型实际只快到旧录音的 1.05–1.29 倍，
  // 所以切句时再不变调压快（tempo）：两场翻译的中文逼问都落在旧录音语速的 1.30–1.36 倍（按逐字时间戳量念字那一段；
  // CaptiveInterrogation.03 合并川军重伤腔重录后本身就到 1.36 倍，不再压）。
  RescueInterrogation: Scene(true, "日兵把顺子从洞里拽出来按在地上，翻译蹲下来审问，另一名日兵在旁边催，几个人都在两米之内。日兵杀红了眼、像发了疯一样狂笑狂吼；翻译是给日军卖命的汉奸：对日本兵点头哈腰，对顺子凶狠、带着狞笑；这场审问里翻译不拖腔，对顺子说中文时语速很快，像连珠炮一样一口气逼上去，先逼问、再假惺惺地许他活命、最后拿死吓他", {
    "01": P("shout", 1, { context: "揪住顺子前襟把他拽起来", delivery: "兴奋又癫狂地冲翻译狂吼，嗓音嘶哑发颤，像个疯子", effort: { after: "一串疯癫的狂笑" } }),
    "02": P("normal", 0.7, { context: "日兵还在狂笑，他冲日兵哈着腰", delivery: "马上应，又怕又巴结，奴才式的急切谄媚" }),
    // 03 不再单独写句前冷笑、05 不再写句后怪笑（2026-09-29）：两次生成里冷笑把「醒醒」挤进「はい」那一片，
    // 日兵乙踹完的怪笑把最后一句「说话！」整句吞掉（同 CaptiveInterrogation 09-27 的教训：笑放进句子里演）。
    "03": P("normal", 0.85, { context: "蹲下来拍顺子的脸", delivery: "「醒醒」两个字清清楚楚、凶狠带狞笑；语速很快，不拖腔：紧接着逼问，再压低一点、假惺惺地许他活命还给饭吃，像在递一根救命稻草，诱惑里透着狞笑", pauseBeforeS: 0.4 , tempo: 1.24 }),
    "04": P("shout", 0.95, { context: "顺子头垂着不答，揪着头发来回晃", delivery: "不耐烦，翻脸，语速很快、连珠炮似的，不拖腔；最后半句咬着牙阴狠地砸下去，拿刚被割喉的那个川军吓他，带着狞笑", pauseBeforeS: 0.8 , tempo: 1.08 }),
    "05": P("shout", 1, { context: "朝顺子狠狠踹了一脚", delivery: "失控地疯狂狂吼，像要把人活活踢死，吼完喘着粗气" }),
    // 「说话！」要等导演：顺子抬眼越过翻译的肩膀看见班长之后（gate）。
    "06": P("shout", 0.9, { after: "gate", offsetS: 0, context: "一把揪住顺子的衣领往上提", delivery: "「说话」两个字凶狠地吼出来、咬得清清楚楚，狐假虎威", pauseBeforeS: 0.5 }),
  }),
  RescueFlee: Scene(true, "翻译（汉奸）看见同伴被大刀砍倒，吓破了胆，踉跄着往前沟逃，边逃边朝日兵喊", {
    "01": P("shout", 0.95, { delivery: "吓破胆的惊叫，嗓子尖得破音，慌不择路" }),
  }),
  // 2026-09-30 用户：「直接玩家自己往前用力一声腾挪就出来就行」。不是台词，是挣出来那一下的用力声。
  RescueHeave: Scene(true, "顺子下半身被塌下来的房梁压着趴在泥里，战友刚把房梁撬起一点，他咬紧牙两手撑地，要一口气把自己从梁底下挣出来", {
    "01": P("shout", 0.9, { spatial: "self", delivery: "不是在说话：咬着牙憋足一口气往前猛一挣，从喉咙里迸出一声短促有力的用力闷吼，紧接着一口粗重的喘气；不喊字、不拖长" }),
  }),
  RescueCheck: Scene(true, "罗班长刚把顺子拖到塌土后面，蹲到他跟前，脸对脸不到一米", {
    "01": P("low", 0.6, { delivery: "喘着气，低声但很硬，是在确认不是在安慰" }),
  }),
  CollectionMeet: Scene(true, "后交通壕的伤员集结处，幺娃从侧后赶到顺子身边，罗班长在旁边一两米指挥伤员通过", {
    "01": P("shout", 0.7, { delivery: "又惊又急" }),
    "02": P("normal", 0.6, { context: "抹了一把嘴角", delivery: "喘着，但嘴硬有劲，江湖油子的腔调，不是虚弱，简短" }),
    "03": P("shout", 0.6, { context: "把幺娃往土壁边拨开，让伤员先过", delivery: "催", pauseBeforeS: 0.6 }),
  }),
  SupportOrder: Scene(true, "后交通壕支沟口，一名撤回的守军扶着沟壁向罗班长报告，顺子在罗班长身边，三个人相距一两米，远处枪声不断", {
    "01": P("shout", 0.8, { context: "从支沟跑来，扶住沟壁", delivery: "气喘，喊给人听清", effort: { before: "急喘一口" } }),
    "02": P("normal", 0.7, { delivery: "问得极短" }),
    "03": P("shout", 0.75, { delivery: "喘着" }),
    "04": P("shout", 0.75, { context: "看向支沟，抬手指过去", delivery: "两道命令，后半句压给顺子", pauseBeforeS: 0.6 }),
    "05": P("normal", 0.65, { context: "看了一眼往后撤的人", delivery: "不情愿，江湖油子的腔调，又冲又疑，尾音上挑" }),
    "06": P("normal", 0.7, { delivery: "不容商量" }),
  }),

  // —— 03–06：cue id 与台词不变。
  FrontBlockade: Scene(true, `${FRONT}。老周趴在机枪后面腿上缠着绷带，冲刚赶到的罗班长喊；罗班长回完老周，转头叮嘱身边的顺子`, {
    "01": P("shout", 0.85, { delivery: "腿伤疼，吃力地吼" }), "02": P("shout", 0.75), "03": P("normal", 0.7, { delivery: "转头压给顺子" }),
  }),
  FrontApproach: Scene(true, `${FRONT}。罗班长带着顺子贴墙往前摸，先压低声音提醒，等口子被火力压住再喊冲`, {
    "01": P("low", 0.7), "02": P("shout", 0.75, { after: "gate", offsetS: 0 }),
  }),
  FrontAttack: Scene(true, `${FRONT}。罗班长指着土坎前面的一伙日军喊`, { "01": P("shout", 0.85) }),
  FrontWithdraw: Scene(true, `${FRONT}。罗班长冲前面守军喊让他们撤下来`, { "01": P("shout", 0.9) }),
  TakeOverGun: Scene(true, `${FRONT}。罗班长安排何有田接机枪、幺娃扶老周下去；老周腿伤不肯走，罗班长压着他下`, {
    "01": P("shout", 0.8), "02": P("shout", 0.7, { delivery: "腿疼，急" }), "03": P("shout", 0.75),
  }),
  // 2026-09-27 用户追加（TankHeard / TankArmor / BundleWhy / BundleBrief）：战车怎么回事、为什么要集束弹、往哪扔。
  TankHeard: Scene(true, `${FRONT}。第一批守军刚撤下来，路那头传来发动机和履带声、残墙后闪过车影；顺子在夺下的机枪位上问，罗班长在他旁边两三米，认出是战车，压着他先顾眼前`, {
    "01": P("normal", 0.7, { delivery: "竖着耳朵，心里发毛，江湖油子的腔调，嗓门带劲，语速偏快" }), "02": P("shout", 0.75, { delivery: "先认出来是什么，再把人拽回眼前的事" }),
  }),
  TankRoadContact: Scene(true, `${FRONT}。何有田先看见路上开出来的日军战车，喊罗班长；罗班长隔着几米回喊`, {
    "01": P("shout", 0.9, { delivery: "吃惊的急喊" }), "02": P("shout", 0.8),
  }),
  TankArmor: Scene(true, `${FRONT}。顺子的子弹打在战车钢板上直冒火花、叮当乱响，罗班长在他旁边几米吼他别浪费子弹`, {
    "01": P("shout", 0.85, { delivery: "又急又气" }), "02": P("shout", 0.8, { delivery: "短促的命令" }),
  }),
  TankTerror: Scene(true, `${FRONT}。战车的机枪扫过来，罗班长冲站起来的人吼`, { "01": P("shout", 1) }),
  BundleOrder: Scene(true, `${FRONT}。一名守军喊着报告旧弹药屋里还有集束手榴弹，罗班长分派人手，顺子在他身边问了一句`, {
    "01": P("shout", 0.8), "02": P("shout", 0.75), "03": P("normal", 0.7, { delivery: "转头对身边的顺子" }),
    "04": P("normal", 0.7, { delivery: "嘴上发怵却硬撑着，江湖油子的腔调，语气冲，尾音上挑" }), "05": P("normal", 0.75, { delivery: "不耐烦地打断" }),
  }),
  BundleGo: Scene(true, `${FRONT}。何有田在机枪位顶着，催罗班长快走；罗班长带顺子下沟`, {
    "01": P("shout", 0.8), "02": P("normal", 0.7),
  }),
  BundleProne: Scene(true, "交通沟里贴着土坡低身移动，罗班长在顺子前面一两米，压着嗓子提醒，看见岔口有人再急促报警", {
    "01": P("low", 0.75), "02": P("low", 0.8, { after: "gate", offsetS: 0 }),
  }),
  BundleWhy: Scene(true, "交通沟里往旧弹药屋跑最后一段，刚打完岔口下沟的日兵；顺子跟在罗班长身后一两米，边跑边问，罗班长头也不回边跑边答，两人都喘", {
    "01": P("normal", 0.7, { delivery: "喘着问，心里没底，江湖油子的腔调，带质疑，咬字脆，尾音上挑" }), "02": P("normal", 0.7, { delivery: "喘着，一句一顿，说得笃定" }),
    "03": P("normal", 0.65, { delivery: "喘着追问，江湖油子的腔调，又急又冲" }), "04": P("normal", 0.6, { delivery: "喘着，理所当然" }),
  }),
  BundleSupply: Scene(true, "旧弹药屋门口，守屋的老兵指着里面的箱子，罗班长接过来就催顺子往回走", {
    "01": P("normal", 0.6), "02": P("normal", 0.7),
  }),
  BundleBrief: Scene(true, "拿到集束弹沿原交通沟往回跑，罗班长在顺子前面一两米，边跑边回头交代怎么炸战车；顺子喘着问一句，罗班长答得短", {
    "01": P("normal", 0.7, { delivery: "回头压给顺子，要他记住" }), "02": P("normal", 0.7, { delivery: "喘着，一字一顿" }),
    "03": P("normal", 0.75, { delivery: "喘着，说得急，一口气交代完" }), "04": P("normal", 0.65, { delivery: "喘着，有点佩服，江湖油子的腔调，尾音上挑" }),
    "05": P("normal", 0.6, { delivery: "喘着，轻描淡写，不想多说" }),
  }),
  BundleReturnCall: Scene(true, "何有田在二三十米外的机枪位上隔着枪声喊，罗班长在沟里回喊，再叮嘱身边的顺子", {
    "01": P("shout", 0.85, { spatial: "offscreen" }), "02": P("shout", 0.75),
  }),
  BundleAttack: Scene(true, "交通沟尽头贴近战车，罗班长压着嗓子指路，然后把集束弹交给顺子", {
    "01": P("low", 0.7), "02": P("low", 0.75, { after: "gate", offsetS: 0 }),
  }),
  BundleRetreat: Scene(true, "集束弹要炸了，罗班长冲顺子喊", { "01": P("shout", 0.9) }),
  TankStopped: Scene(true, `${FRONT}。战车被炸停，何有田先喊，罗班长冲前面的人喊撤，刘文财在沟口接着喊`, {
    "01": P("shout", 0.85), "02": P("shout", 0.8), "03": P("shout", 0.75),
  }),
  FrontRelief: Scene(true, `${FRONT}。刘文财报告最后一批人过了，从后沟赶来接防的兵喘着交接，罗班长招呼自己人往回走`, {
    "01": P("shout", 0.7), "02": P("shout", 0.65, { delivery: "喘着气" }), "03": P("shout", 0.7),
  }),
  // 06 集结处：说话慢下来；BorrowLight 两处动作空当原样保留（事件名沿用）。
  Volunteer: Scene(true, "背坡伤员集结处，传令兵跑过来传令，气还没匀；罗班长问得干脆；顺子那句是主动争取，说得比平时快半拍、还想显得随口；罗班长不接他的茬，直接排人。几个人站在一起，相距一两米", {
    "01": P("shout", 0.7), "02": P("normal", 0.6), "03": P("normal", 0.6),
    "04": P("normal", 0.7, { delivery: "主动争取，江湖油子的腔调，抢着说、语速快、还要显得随口" }), "05": P("normal", 0.65),
  }),
  BorrowLight: Scene(true, "背坡伤员集结处，老周靠在土壁边等担架，嘴里叼着一根没点着的纸烟，腿伤让他动一下就抽气；顺子蹲在他旁边一米。两人是刚混个脸熟的陌生人，互相占便宜、都不肯吃亏，语气是懒洋洋的斗嘴，不是温情；最后一句轻描淡写地认栽", {
    "01": P("normal", 0.4), "02": P("normal", 0.6, { delivery: "江湖油子的腔调，讨价还价的口气，尾音上挑，懒洋洋里带着不肯吃亏的劲儿" }), "03": P("normal", 0.4, { delivery: "叼着烟，含混" }),
    "04": P("normal", 0.6, { delivery: "江湖油子的腔调，理直气壮地耍赖，带笑，咬字脆" }),
    "05": P("low", 0.35, { emit: [{ id: "BorrowLightMatchesPocketed", at: "end" }] }),
    // 两处动作空当：第五句后顺子把火柴往兜里一收（约 2 s）、第六句后老周摸出烟包递一根过去（约 3 s）。
    "06": P("low", 0.5, { delivery: "江湖油子的腔调，半是占便宜半是让步，压着嗓子但有笑意", offsetS: 2.0, emit: [{ id: "BorrowLightCigaretteOffered", at: "end" }] }),
    "07": P("normal", 0.4, { offsetS: 3.0 }), "08": P("normal", 0.6, { delivery: "江湖油子的腔调，故意挑理，带笑，尾音上挑" }), "09": P("low", 0.35),
  }),
  ZhouLift: Scene(true, "担架员走到老周跟前催他上担架，例行公事的大嗓门；老周含着刚点着的烟，含混、赖着不肯动，最后一句是嘟囔给自己听的", {
    "01": P("shout", 0.6), "02": P("low", 0.35, { delivery: "含着烟，含混" }), "03": P("shout", 0.6),
    "04": P("breath", 0.3, { delivery: "嘟囔" }),
  }),
});

/** 逐句 id：`<Scene>.<NN>`（两位序号，从 01 起）。 */
export const LineId = (sceneId, index) => `${sceneId}.${String(index + 1).padStart(2, "0")}`;

/**
 * 一句的导演参数。缺省：after prev（首句 start）、offsetS null（= 沿用录音间隔，播放时由清单填）、
 * intensity 0.5、projection 取定妆表的角色默认、spatial 顺子 self 其余 head。
 */
export function LineDirection(cue, index) {
  const line = cue.lines[index];
  const authored = FIRST_LEVEL_DIALOGUE_DIRECTION[cue.id]?.lines?.[String(index + 1).padStart(2, "0")] || {};
  return Object.freeze({
    after: index ? "prev" : "start", offsetS: index ? null : 0, intensity: 0.5,
    projection: FIRST_LEVEL_VOICE_CAST[line.who]?.projection || "normal",
    spatial: line.who === "shunzi" ? "self" : "head",
    ...authored,
  });
}

/** 播放用的间隔：导演写了 offsetS 就用它，否则沿用整段录音里的原始间隔（缺录音时兜底 FALLBACK_GAP_S）。 */
export function PlaybackOffset(direction, recordedGapS) {
  if (direction.offsetS != null) return direction.offsetS;
  return Number.isFinite(recordedGapS) ? recordedGapS : FALLBACK_GAP_S;
}
