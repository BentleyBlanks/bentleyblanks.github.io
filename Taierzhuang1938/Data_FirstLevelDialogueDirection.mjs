// 第一关 01–06 对白导演表（纯数据；契约 docs/Data_FirstLevel0105Refactor20260923Contract.md §5.5）。
// 01–02 按 2026-10-11 Notion 稿重写（契约 docs/Data_OpeningRedraft20261011Contract.md §3：新场景、等导演事件的句子、日兵甲冷静口径）。
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
//      masterDb        整段母带按字数加权求目标电平时，这一句不用 projection 档的电平、改用这个值（dBFS，有声段 RMS；
//                      不进提示词）。只给「要演成压低的声音、电平还得再低一截」的非词人声用（2026-10-12 CaptiveWoundTwist）
//      maxSeconds      切出来的片段最长几秒（含两头留白），超了算硬错误、整段重抽（不进提示词）
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
  // —— 2026-10-11 Notion 稿 01（契约 docs/Data_OpeningRedraft20261011Contract.md §3）。
  // 黑场数数：渐亮前，只有远炮与近落土。幺娃数炮是在估炮，不是害怕；罗班长没回头。
  BunkerCount: Scene(true, "黑场里，前沿交通壕侧壁的小防炮洞，又矮又窄挤着六个人。远处一声炮，隔几秒又一声。幺娃抱着枪蹲在顺子旁边、离他不到一米，压着嗓子小声数炮；罗班长站在两米外的洞口，背对洞里看前沟，没回头", {
    "01": P("low", 0.4, { delivery: "压着嗓子小声数，跟着远处的炮一个数一个数往外挤，数到「九」拖住，像在等下一声" }),
    "02": P("low", 0.35, { pauseBeforeS: 1, context: "炮弹落下，洞顶簌簌掉土", delivery: "还是小声，平平地下判断：是在估炮的间隔，不是害怕；「比刚才慢」说得笃定" }),
    "03": P("normal", 0.3, { pauseBeforeS: 0.6, context: "站在洞口背对着洞里看前沟，没回头", delivery: "低沉沙哑，平平一句，不回头、不加重，像在说天气" }),
  }),
  // 渐亮后补弹打趣。07 等近处落弹（导演发 nearShell）后才开口；10 在 09 之后沿用录音间隔。
  BunkerBanter: Scene(true, "炮击间隙，前沿交通壕侧壁的防炮洞里，又矮又窄。顺子靠洞壁坐着往弹夹里压子弹，幺娃抱着枪蹲在他旁边，冬瓜靠着对面土壁捏着半块冷大饼小口啃，何有田蜷在最里头、钢盔扣在脸上睡觉，刘文财蹲在洞口弹药箱旁分子弹；彼此相距一两米，压着嗓子说话、带笑，是苦中作乐的斗嘴，不是表演", {
    "01": P("normal", 0.45, { context: "数出一夹，隔着两个人丢过去", delivery: "认真计较，说得清清楚楚，像在发口粮；「多的没得」压一下，不商量" }),
    "02": P("normal", 0.65, { context: "桥夹落在腿上，拿起来看", delivery: "江湖油子的腔调，先嫌弃地反问，「妈卖批」顺嘴骂出来，后半句挖苦，尾音上挑" }),
    "03": P("normal", 0.55, { delivery: "不让步，回嘴快，认真里带一点冲，不是开玩笑" }),
    "04": P("normal", 0.45, { context: "捏着半块冷大饼小口啃，瞥见幺娃的眼睛一直跟着饼走", delivery: "带笑地损人，嘴里还嚼着饼，懒洋洋的" }),
    "05": P("low", 0.45, { pauseBeforeS: 1, context: "接住丢过来的一角饼塞进嘴里，两口没了", delivery: "嘴里还嚼着，小声，有点不好意思又忍不住地问" }),
    "06": P("normal", 0.5, { delivery: "「有个锤子」带笑地堵回去，后半句护食，懒洋洋地把饼揣好" }),
    "07": P("normal", 0.65, { after: "event:nearShell", offsetS: 1.6, pauseBeforeS: 1.2, context: "近处落了一发，土从洞顶泼进衣领，几个人缩着脖子等第二下，没有第二下；他伸手往领子里掏土",
      delivery: "江湖油子的腔调，先一声带鼻音的狠骂，再带笑自嘲，尾音上挑拖长，有劲儿不淡" }),
    "08": P("normal", 0.5, { delivery: "接话快，嘴贫，带笑" }),
    "09": P("normal", 0.6, { delivery: "笑骂一样甩回去，又冲又痞，不是真生气" }),
    "10": P("low", 0.35, { pauseBeforeS: 0.8, context: "最里头的钢盔底下传出声音，人没动", delivery: "闷在钢盔底下，含糊、带着睡意，粗嗓子嘟囔着问" }),
    "11": P("normal", 0.4, { delivery: "平平地答，清楚" }),
    "12": P("low", 0.4, { delivery: "还闷在钢盔底下，含糊、不耐烦地嘟囔，说完翻个身接着睡" }),
  }),
  // 冬瓜倒散子弹（导演发 pour）后开口；07 是笑出声扯到肩膀，笑在句子里演。
  BunkerLedger: Scene(true, "还是那个防炮洞。冬瓜靠在对面土壁，左肩缠着发黑的绷带，用好的那只手往顺子脚边倒了一把散子弹，两人隔着一米多；冬瓜要顺子帮他压子弹，两人斗嘴记账，压着嗓子、带笑，冬瓜最后笑出声扯到了伤口", {
    "01": P("normal", 0.45, { after: "event:pour", offsetS: 0.2, context: "往顺子脚边倒了一把散子弹", delivery: "随口使唤，理直气壮；后半句「膀子抬不起来」带点卖惨的笑" }),
    "02": P("normal", 0.6, { delivery: "江湖油子做买卖的腔调，眼皮都不抬就开价，干脆、带痞气" }),
    "03": P("normal", 0.55, { delivery: "笑骂，「日你先人」不是真骂，后半句挖苦他钻钱眼" }),
    "04": P("normal", 0.6, { delivery: "慢条斯理地算账，像账房先生翻账本，得意" }),
    "05": P("normal", 0.4, { delivery: "满不在乎地打发他" }),
    "06": P("normal", 0.7, { delivery: "江湖油子的腔调，挖苦里带火气，一句比一句冲，「见过个锤子」说完自己先笑了" }),
    "07": P("normal", 0.6, { context: "笑出声，扯到了左肩的伤", delivery: "先笑出声，笑到一半扯到肩膀，「嘶——」是笑到一半倒抽的一口冷气，接着咬着牙低声骂「狗日的」，骂完还带着笑意" }),
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
  // 撤离时冬瓜要弹夹：01 等他扶墙伸手（exitReach），02 等顺子把两夹丢出去（clipsThrown）后他接一夹、捡一夹的工夫。
  BunkerExit: Scene(true, "班长下令往后沟撤，洞里的人往洞口挤，外面炮声紧。冬瓜扶着南壁站起来朝顺子伸手要弹夹，两人隔一米多；顺子丢过去两夹，冬瓜接住一夹、另一夹掉地上弯腰捡起，往洞口挤，头也不回地回嘴", {
    "01": P("normal", 0.6, { after: "event:exitReach", offsetS: 0, context: "扶着土壁站起来，冲顺子伸手", delivery: "急，压着嗓子喊过来，催他快丢" }),
    "02": P("normal", 0.65, { after: "event:clipsThrown", offsetS: 1, context: "两夹丢过去，看他接一夹、捡一夹往洞口挤", delivery: "江湖油子的腔调，冲着他背影提醒这笔账，带笑，尾音上挑" }),
    "03": P("normal", 0.55, { context: "往洞口挤，头也不回", delivery: "头也不回地丢回一句，笑骂，「龟儿子」带着亲热" }),
  }),
  // 被爆炸截断：句尾约 0.35 s 处硬掐（原文「炮弹！趴下——！（被爆炸截断）」），截断那一刻发 BunkerBlast。
  BunkerIncoming: Scene(true, "洞外交通沟里一个兵听见炮弹啸声逼近，隔着十来米朝防炮洞拼命示警", {
    "01": P("shout", 1, { spatial: "offscreen", cutAtS: -0.35, cutEvent: "BunkerBlast", stopOn: "event:Blast",
      delivery: "拼命的急喊，拉长破音" }),
  }),
  // 醒来时：先头分队清沟（取代 09.23 的 BunkerSearch）。丙在折角背对着喊，乙沿沟底扎尸报数；两人都是干活的口气，不慌不吼。
  // 01 等折角那边手榴弹炸过（grenadeBlast），丙跟着烟探一眼再退回来才喊；03 / 04 / 07 各等乙那一刀（stab7 / stab8 / stab9）。
  BunkerSweep: Scene(true, "炮声越过头顶往后沟去了。塌了的防炮洞外的前沟里，一支日军先头分队刚跳下沟：丙贴在东边折角，背对着沟里；乙端着上了刺刀的枪沿沟底从东往西走，每经过一具趴着的川军就往背上扎一刀，拔出来脚下不停。两人相隔十来米、背对着说话，是干活的口气，不慌、不吼", {
    "01": P("shout", 0.45, { after: "event:grenadeBlast", offsetS: 2.4, context: "手榴弹在折角那边炸过，他跟着烟探过去看了一眼，退回折角守住", delivery: "老兵报告，背对着沟里朝后一喊，低而稳、短，干脆，不拔高" }),
    "02": P("normal", 0.35, { pauseBeforeS: 1.5, context: "守着折角没回头，背对着乙问", delivery: "背对着随口一问，像问今天干了几趟活，平" }),
    "03": P("normal", 0.45, { after: "event:stab7", offsetS: 0.3, context: "刚往一具尸体背上扎了一刀拔出来，脚下不停", delivery: "粗人，不耐烦地报数，闷沉，边干活边说" }),
    "04": P("normal", 0.45, { after: "event:stab8", offsetS: 0.3, context: "又扎了一具", delivery: "接着报，更不耐烦" }),
    "05": P("normal", 0.45, { delivery: "背对着，有点得意地报自己的数" }),
    "06": P("normal", 0.55, { delivery: "粗声粗气地损他，鼻子里带一声嗤笑，笑在句子里演" }),
    "07": P("low", 0.5, { after: "event:stab9", offsetS: 0.6, context: "扎到第三具那人还叫了一声在泥里乱抓，他踩住背又扎一刀、拧了一下才拔出来", delivery: "顿了一下，低声、带点喘，平平地报出这个数" }),
  }),
  // 2026-09-26 用户追加：炮击刚过，日兵甲乙走进前沟、发现被埋的川军伤兵，日兵乙朝东边连接支沟喊翻译；
  // 翻译在二十米外沟那头应声、一路小跑过来（导演在 InterpreterCall.02 开口时让翻译起跑）。两句沿用录音间隔。
  // 2026-10-11 稿里这两句排在 CaptiveDragged.01 与 .02 之间（场景与录音不变）。
  InterpreterCall: Scene(true, "炮击刚过，前沿交通壕的前沟里。日兵甲、日兵乙沿前沟走进来，在塌土边发现一个被半埋的川军伤兵；日兵乙站在伤兵旁边，扭头朝东边二十米外的连接支沟口扯着嗓子喊翻译；翻译（给日军传话的汉奸）在支沟那头听见，立刻应声，一边往这边小跑一边喊回来", {
    "01": P("shout", 0.85, { context: "刚跑到这里、胸口还在起伏，低头瞥了一眼土里的伤兵，扭头朝二十米外的支沟口喊", delivery: "扯着嗓子，粗野不耐烦，但明显还在大喘气、话被喘息打断；「つうやく」叫两遍，一声比一声急，最后一句是呵斥", effort: { before: "停下脚步，大口喘气" } }),
    "02": P("shout", 0.8, { context: "在支沟那头听见日本兵叫他，立刻应声，边小跑边喊回来", delivery: "奴才式的急切谄媚，一连两声「はい」抢着应，赔着小心、生怕慢了；跑动中带喘；日语带很重的中国北方口音",
      pauseBeforeS: 0.5, effort: { before: "小跑中急喘一口" } }),
  }),
  // —— 2026-10-11 稿：日兵甲按用户口径改成冷静的老兵分队长（话短、不吼不嘲弄，intensity ≤ 0.5，没有狂笑），用「这个」指人；
  // 09-26/09-27 那套「癫狂狂笑」作废。疯劲只给乙（粗人、不耐烦、笑着奚落）和翻译（连珠炮、一句利诱一句威胁，VoiceSync §0.12）。
  // 冬瓜在被拖出、被审问、被拧伤口、被扎后嚎的四场用重伤状态的定妆音（voices，VoiceSync §0.11）。
  // 01 等甲抬手拦住乙（haltB）；03 等按跪（kneeled）；05 等乙拉开枪机（boltOpen）。InterpreterCall 两句在 01 与 02 之间由导演插播。
  CaptiveDragged: Scene(true, "前沟里洞口外的塌土边，离顺子两三米。炮弹刚在洞口炸过，冬瓜被半埋在塌土里咳；日兵甲是冷静的老兵分队长，拦住正要扎下去的乙，叫人把他拖出来；甲揪领、乙架胳膊把冬瓜拔出来按跪在沟壁下。冬瓜满脸满嘴是血，左肩的伤一扯就疼，嗓子被硝烟和土呛哑，喘得厉害，但对日本兵只有愤怒和恨；甲话短、不吼，乙是粗人", {
    "01": P("normal", 0.35, { after: "event:haltB", offsetS: 0.2, context: "抬手拦住乙的刺刀，低头看塌土里咳嗽的人", delivery: "冷静、话短、不吼，像在交代一件杂事，低而平" }),
    // 02 等甲乙把他拔出来按跪那一刻（Dir01 发 dragLanded，2026-10-11 集成补充）：InterpreterCall 两句插在 01 与 02 之间，按录音间隔会叠上。
    "02": P("shout", 0.9, { after: "event:dragLanded", offsetS: 0.3, context: "被从土里拔出来，疼得眼前发黑，认出是日本兵", delivery: "嘶哑、发抖、带着嘴里的血沫，疼得每个字都在抖；刻骨的恨从牙缝里挤出来，两个词之间疼得吸一口气，第二个词更狠；绝不求饶，字要听得出来",
      effort: { before: "疼得一声压不住的闷哼" } }),
    "03": P("low", 0.3, { after: "event:kneeled", offsetS: 0.2, context: "把人按在沟壁下", delivery: "两个字，平平地，低声，不吼" }),
    "04": P("shout", 0.9, { pauseBeforeS: 0.8, context: "被按着跪下，扯到了伤处", delivery: "咬着牙一字一顿地骂，中间疼得断一下再接着骂，嘶哑带血，恨到发抖，不哭、不哀求；字要听得出来" }),
    "05": P("normal", 0.55, { after: "event:boltOpen", offsetS: 0.4, pauseBeforeS: 1, context: "从泥里捡起他那支汉阳造，拉开枪机看了一眼", delivery: "笑着说，嗤笑从鼻子里喷出来，粗野地看不起，笑在句子里演，不单独笑" }),
  }, { voices: { comrade: "comradeWounded" } }),
  // 04 在乙拧伤口（woundPress）后 0.8 s：翻译趁他疼压上去。tempo（切句时不变调压快，VoiceSync §0.12）：录出来 03 / 04 是 4.9 / 3.6 字/秒，
  // 压 1.15 / 1.2 到 5.6 / 4.3（旧录音 4.5 / 3.3 的 1.25 倍上下）。CaptiveWoundTwist 是那一下卡在喉咙里的叫声（另一场）。
  CaptiveInterrogation: Scene(true, "前沟沟壁下，冬瓜被按跪着，满脸是血、左肩枪伤、喘得厉害；翻译空着手蹲在他面前一两米内逼问，日兵甲站着，冷静、话短、不吼，用「这个」指人；日兵乙在旁边。翻译是给日军卖命的汉奸：转向日兵时点头哈腰、谄媚讨好，转回俘虏立刻变脸；这场审问里翻译不拖腔，对俘虏说中文时语速很快，像连珠炮，一句给条活路、一句一个死字。冬瓜伤得很重，每句都喘、都疼，嗓子嘶哑带血，但对汉奸只有厌恶和恨", {
    "01": P("normal", 0.35, { context: "站着打量跪着的人，转头对翻译", delivery: "冷静，一句一顿，每个短句之间停一下，话短、平、不吼；最后一个词是下令" }),
    "02": P("normal", 0.65, { pauseBeforeS: 0.4, context: "冲日兵哈着腰", delivery: "马上应，又怕又巴结，奴才式的急切谄媚；单独一声" }),
    "03": P("normal", 0.85, { pauseBeforeS: 0.4, context: "转回脸蹲到冬瓜面前，脸几乎贴上去", delivery: "一变脸，语速很快，不拖腔，像连珠炮：前半句恶狠狠地逼问两个问题，紧接着压低一点、假惺惺地许他活命，诱惑里透着狞笑", tempo: 1.15 }),
    "04": P("shout", 0.95, { after: "event:woundPress", offsetS: 0.8, pauseBeforeS: 1.2, context: "乙把拇指摁进冬瓜肩上的枪伤往里拧，冬瓜整个人弓起来", delivery: "趁他疼，凶狠地吼，连珠炮似的，不拖腔；后半句咬着牙阴狠地砸下去", tempo: 1.2 }),
    "05": P("low", 0.85, { pauseBeforeS: 0.8, context: "疼得直喘，慢慢抬起满是血的脸，盯着凑过来的汉奸", delivery: "嘶哑、喘着、带血沫；「滚」从牙缝里挤出来，喘一口，「狗汉奸」压着满腔厌恶冷冷地吐出去，像往他脸上啐" }),
    "06": P("normal", 0.7, { context: "换一副假惺惺的软腔凑近", delivery: "压低了、像递一根救命稻草，语速仍快、不拖腔，句尾像被打断一样收住" }),
    "07": P("shout", 0.9, { pauseBeforeS: 0.5, context: "拼力抬起头，冲着眼前卖国的翻译", delivery: "嘶哑带血，疼得发抖，一字一顿，恨和鄙夷压过了疼，后半句更狠；绝不哀求，字要听得出来" }),
    "08": P("low", 0.3, { pauseBeforeS: 0.6, context: "看了一眼翻译", delivery: "冷静地问，低而平，话短，不吼" }),
    "09": P("normal", 0.6, { context: "赶紧转身冲日兵哈腰", delivery: "告状的谄媚奴才腔，赔着小心，急着撇清自己" }),
  }, { voices: { comrade: "comradeWounded" } }),
  // 无字幕：乙拧伤口（woundPress）那一下，冬瓜卡在喉咙里的叫声。
  // 2026-10-12 R2-Voice 重录：10-11 那条量出来是放声喊（峰值 −1.6 dBFS、有声段 −19.5 dBFS 比 CaptiveHowl 还响 1.6 dB、
  // 谐波比 6.0 dB 低于嚎的 8.3 dB、基频 333 Hz、整条 3.1 s）。改成闭着嘴从喉咙里挤的闷哼：提示词压低、强度降到 0.7、一秒以内；
  // 电平按 masterDb 拉到 −27.5（比嚎低 6 dB 以上），片段超 1.2 s 算硬错误重抽。
  CaptiveWoundTwist: Scene(true, "前沟沟壁下，冬瓜被按跪着，日兵乙弯腰把拇指摁进他左肩的枪伤往里拧；他整个人弓起来、头往后仰，叫声卡在喉咙里，咬着牙不肯喊出来", {
    "01": P("low", 0.7, { after: "event:woundPress", offsetS: 0, masterDb: -27.5, maxSeconds: 1.2,
      delivery: "不是在说话、也不是喊：牙关咬紧、嘴闭着，剧痛的叫声闷在喉咙里出不来，只从喉咙和鼻子里挤出两下短促发抖的闷哼，第二下更短、又硬咽回去；不张嘴、不放声、不哭、不求饶；整条一秒左右，不超过一秒" }),
  }, { voices: { comrade: "comradeWounded" } }),
  // 练刺刀 → 割喉。甲冷静地教新兵干活；03 等反手耳光（recruitSlapped）、04 等丁扎完两刀站着喘（recruitPant）、05 等揪发提起（hairLifted）、
  // 06 下刀那一刻（cutStart，offsetS 0：边下刀边嘟囔，低声，说完发 taunted）、07 等刺刀卡回枪口（bayonetFixed）、08 等丁点头（recruitNod）。
  BayonetPractice: Scene(true, "前沟沟壁下。冬瓜被按跪着，离顺子两米多。日兵甲是冷静的老兵分队长，回头望了一眼后沟，身后沟沿上歪把子一下一下点射；他话短、冷静、不吼不嘲弄，像在教新兵干活。新兵丁很年轻，端着枪吓得不敢动；乙换岗去了十来米外的岔口，在那边笑", {
    "01": P("normal", 0.3, { context: "回头望了一眼后沟", delivery: "平平地，两句都短，像在看表，不急不吼" }),
    "02": P("normal", 0.35, { pauseBeforeS: 1, context: "朝岔口偏了下头，叫守岔口的新兵", delivery: "冷静，一句一顿：叫人、叫他过来、叫他上刺刀；短促平稳，不吼" }),
    "03": P("low", 0.4, { after: "event:recruitSlapped", offsetS: 0.3, context: "反手扇了新兵一记耳光", delivery: "一个字，低、冷、平，不吼" }),
    "04": P("low", 0.35, { after: "event:recruitPant", offsetS: 0.5, context: "新兵扎了两刀，人没死，在泥里一声接一声地嚎", delivery: "冷冷地，嫌麻烦，低声说给新兵听，不吼" }),
    "05": P("low", 0.35, { after: "event:hairLifted", offsetS: 0.2, context: "揪着头发把人提起来，膝盖顶住后腰往后扳", delivery: "对新兵说的，两个字，低而平，像教人" }),
    "06": P("low", 0.3, { after: "event:cutStart", offsetS: 0, context: "边下刀边随口嘟囔", delivery: "嘴里随口嘟囔，很低，几乎是自言自语，像在说一头牲口；不嘲弄、不笑、不加重",
      emit: [{ id: "taunted", at: "end" }] }),
    "07": P("normal", 0.35, { after: "event:bayonetFixed", offsetS: 0.4, context: "刺刀「咔」地卡回枪口，转头对新兵", delivery: "平平地教人，两句都短，最后半句压给新兵，不吼" }),
    // 08 / RescueInterrogation.05：乙在 12 m 外的岔口喊，挂在他头上、按远喊补 +3 dB（同 BunkerRunnerCall.02，2026-10-11 集成补充）。
    "08": P("shout", 0.7, { after: "event:recruitNod", offsetS: 0.4, spatial: "head", gainDb: 3, context: "十来米外的岔口那边，看着脸色发白的新兵", delivery: "先笑出声，笑着隔老远朝新兵喊，粗野地奚落；笑在句子里演，不单独笑" }),
    "09": P("normal", 0.35, { pauseBeforeS: 0.6, delivery: "平平地下令，两个词，短，不吼" }),
  }),
  // 无字幕：丁退开三步、喊着冲上去。是硬着头皮逼出来的喊，不是战吼。
  RecruitCharge: Scene(true, "前沟沟壁下，十八九岁的日本新兵退开三步，端着上了刺刀的枪，被老兵逼着冲向跪着的俘虏", {
    "01": P("shout", 0.9, { delivery: "不是战吼：硬着头皮逼出来的一声喊，嗓子发紧、怕，喊到一半劈了、带颤，一秒左右，不喊字" }),
  }),
  // 无字幕：冬瓜被扎两刀后蜷在泥里一声接一声地嚎，≥ 4 s，导演循环播放；割喉（throatCut）时掐断。
  CaptiveHowl: Scene(true, "前沟泥里，冬瓜肩膀和肚子各挨了一刺刀，没死，蜷成一团侧躺在泥里", {
    "01": P("shout", 0.95, { stopOn: "event:throatCut", delivery: "不是在说话：嗓子里一声接一声地嚎，每声一秒左右、中间抽一口气，连着嚎四五声，一直不停、不减弱；嘶哑、带血、疼到失控，不喊字、不是哭腔、不求饶；整段四到六秒" }),
  }, { voices: { comrade: "comradeWounded" } }),
  // 甲补刀到洞口，军靴碾顺子的手（bootGrind）之后才开口。
  ShunziFound: Scene(true, "塌了的防炮洞口。日兵甲是冷静的老兵分队长，端着枪、刺刀尖朝下，停在趴着装死的顺子身边，军靴踩住他伸在泥里的手、鞋跟一碾，顺子的手指抽了一下；他低头看着，对身后的人说", {
    "01": P("low", 0.35, { after: "event:bootGrind", offsetS: 0.8, delivery: "冷静，低而平，三截都短：先是看出来的陈述，再交代留着，最后一个词是下令；不兴奋、不笑、不吼" }),
  }),
  // 02 原地审问（整场重录）。tempo：录出来 03 / 04 是 3.7 / 4.4 字/秒，压 1.3 / 1.2 到 4.8 / 5.3（旧录音 4.3 / 4.1；03 压到 1.3 的上限仍只到 1.1 倍）。
  //甲冷静；乙不耐烦；翻译连珠炮、一句利诱一句威胁（VoiceSync §0.12）。06 等丁划脸（cheekCut）。
  RescueInterrogation: Scene(true, "坍塌的防炮洞口，顺子被塌顶木压着趴在泥里。日兵甲是冷静的老兵分队长，蹲在他头边揪着头发把头提起来扇耳光；翻译蹲在顺子面前一米内逼问，日兵乙站在旁边催。甲话短、不吼；乙是粗人、不耐烦；翻译是给日军卖命的汉奸：对日本兵点头哈腰，对顺子凶狠、带着狞笑；这场审问里翻译不拖腔，对顺子说中文时语速很快，像连珠炮，一句利诱、一句威胁", {
    "01": P("normal", 0.4, { context: "揪着顺子的头发把头提起来，对翻译", delivery: "冷静，话短，下令，不吼、不笑" }),
    "02": P("normal", 0.65, { pauseBeforeS: 0.3, context: "冲日兵哈着腰", delivery: "马上应，又怕又巴结，奴才式的急切谄媚" }),
    "03": P("normal", 0.85, { pauseBeforeS: 0.4, context: "蹲下来拍顺子的脸", delivery: "「醒醒」两个字清清楚楚、凶狠；语速很快，不拖腔：紧接着逼问两句，再压低一点、假惺惺地许他活命还给饭吃，诱惑里透着狞笑", tempo: 1.3 }),
    "04": P("shout", 0.95, { pauseBeforeS: 0.8, context: "顺子不答，挨了第二记耳光", delivery: "不耐烦，翻脸，语速很快、连珠炮，不拖腔；拿刚才被割喉的那个川军吓他，最后一句咬着牙阴狠地砸下去，带狞笑", tempo: 1.2 }),
    "05": P("shout", 0.75, { spatial: "head", gainDb: 3, delivery: "粗人，不耐烦地粗声催一句" }),
    "06": P("shout", 0.9, { after: "event:cheekCut", offsetS: 0.6, pauseBeforeS: 0.8, context: "新兵用刀尖在顺子脸上划开一道口子之后", delivery: "「说话」两个字凶狠地吼出来、咬得清清楚楚，狐假虎威" }),
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

  // —— 03–06：cue id 与台词不变（2026-10-12 03–11 重构新加 / 改字的几场见各自头注，录音 Voice 包第三波补）。
  // 03 观察口（契约 §3.1）：支沟里的观察口，班长站上射击台，伸臂指着前头土坎后趴着的守军、再指缺口；顺子刚赶到他身后两三米。
  FrontObservation: Scene(true, "支沟观察口的射击台上，罗班长半蹲着伸臂指向前头四五十米土坎背坡里趴着的守军，顺子刚从沟里赶到他身后两三米；前面枪声密，两人隔着两步要喊着说", {
    "01": P("shout", 0.75, { context: "伸臂指着背坡里趴着的那几个人", delivery: "喊给顺子听，先问一句「看到没得」再压下去说，语速不快，每个字都要清楚" }),
    "02": P("shout", 0.8, { pauseBeforeS: 0.6, context: "手臂转过去指缺口那段塌浅的沟", delivery: "短促、咬字重，「过一个打一个」一字一顿" }),
  }),
  FrontBlockade: Scene(true, `${FRONT}。老周趴在机枪后面腿上缠着绷带，冲刚赶到的罗班长喊；罗班长回完老周，转头叮嘱身边的顺子`, {
    "01": P("shout", 0.85, { delivery: "腿伤疼，吃力地吼" }), "02": P("shout", 0.75), "03": P("normal", 0.7, { delivery: "转头压给顺子" }),
  }),
  // 03 第一批过缺口：刘文财蹲在沟口看着人一个个跑过来数数。
  FirstBatchCount: Scene(true, "支沟口，刘文财蹲在沟沿后面看着第一批守军一个接一个跑过缺口进沟，边看边数", {
    "01": P("shout", 0.7, { delivery: "数人，「一个」「三个」之间有真的等人跑过来的停顿，数到「五个」松一口气地喊出来" }),
  }),
  // 03 战车起步之后、第一批撤完时：守军慌着喊，班长压住他。
  TankSpotted: Scene(true, `${FRONT}。路那头传来发动机和履带声，土坎后一个守军认出是战车慌着喊；罗班长在阵位里隔着二三十米回喊，先顾眼前`, {
    "01": P("shout", 0.9, { spatial: "head", context: "听见履带声，往路那头看", delivery: "慌，先是不敢信地迟疑半句「战车……」，再扯着嗓子喊出来" }),
    "02": P("shout", 0.8, { delivery: "硬、短，把人拽回眼前的事" }),
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
  // 2026-10-12 改字：何有田喊两遍「战车」，罗班长先把火力引到跟车的。
  TankRoadContact: Scene(true, `${FRONT}。何有田先看见路上开出来的日军战车，喊罗班长；罗班长隔着几米回喊`, {
    "01": P("shout", 0.9, { delivery: "吃惊的急喊，「战车」连喊两遍，第二遍更响" }), "02": P("shout", 0.8, { delivery: "命令在前，提醒在后，不换气" }),
  }),
  // 2026-10-12 并成一句。
  TankArmor: Scene(true, `${FRONT}。顺子的子弹打在战车钢板上直冒火花、叮当乱响，罗班长在他旁边几米吼他别浪费子弹`, {
    "01": P("shout", 0.85, { delivery: "又急又气，前半句骂、后半句是命令，一口气" }),
  }),
  TankTerror: Scene(true, `${FRONT}。战车的机枪扫过来，罗班长冲站起来的人吼`, { "01": P("shout", 1) }),
  // 04 缺口里倒下一个：刘文财在沟口数剩下的人。
  GapGuardDown: Scene(true, "支沟口，刘文财刚看着一个守军冲缺口被车上机枪打倒在口子正中，隔了一拍低声数剩下的人", {
    "01": P("low", 0.6, { delivery: "前面一个停顿是看着人倒下，后面「还剩两个」平平地、压着说出来，不煽情" }),
  }),
  // 2026-10-12 改写（契约 §3.2）：守军报的是先前抱着集束弹从支沟摸过去没回来的弟兄；罗班长看车、看沟、停一拍再分工。
  BundleOrder: Scene(true, `${FRONT}。阵位后墙下的岔口，一名退下来的守军喊着报告先前有个弟兄抱着集束弹从支沟摸过去了没回来；罗班长看了一眼路上的战车、再看支沟，停了一拍才分派人手，顺子在他身边问了一句`, {
    "01": P("shout", 0.8, { delivery: "喘着报告，「外头……」先顿一下，后面一口气说完，带着慌" }),
    "02": P("shout", 0.75, { pauseBeforeS: 1.4, context: "看了一眼路上的车、再看支沟，停了一拍", delivery: "想定了，两道命令分别压给两个人" }),
    "03": P("normal", 0.7, { delivery: "转头对身边的顺子，短" }),
    "04": P("normal", 0.7, { delivery: "嘴上发怵却硬撑着，江湖油子的腔调，语气冲，尾音上挑" }), "05": P("normal", 0.75, { delivery: "不耐烦地打断" }),
  }),
  // 2026-10-12 改字：不再提屋，只说贴着沟走。
  BundleGo: Scene(true, `${FRONT}。何有田在机枪位顶着，催罗班长快走；罗班长带顺子下沟`, {
    "01": P("shout", 0.8), "02": P("normal", 0.7, { delivery: "两个短命令，「贴到走」压低" }),
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
  // 05 捡弹点（契约 §3.3）：支沟中段，先前那个弟兄倒在沟里，两捆弹在他身边；罗班长先一步到，低头看了一眼。
  BundleFound: Scene(true, "攻击支沟中段，一个川军弟兄趴在沟底不动了，两捆集束弹在他手边的泥里；罗班长跑到他跟前停了半步，顺子跟在后面一两米", {
    "01": P("low", 0.55, { context: "低头看着沟底的人，停了半步", delivery: "压着嗓子，前面的停顿是认出人来，三个字说得很轻" }),
    "02": P("shout", 0.8, { pauseBeforeS: 0.5, context: "一抬头，指着他手边的弹", delivery: "立刻收住情绪，短促的命令，两个短句" }),
  }),
  // 2026-10-12 改写：跑动中两句，不再一问一答。
  BundleBrief: Scene(true, "捡起集束弹沿支沟往沟口跑，罗班长在顺子前面一两米，边跑边回头交代怎么炸战车", {
    "01": P("normal", 0.75, { delivery: "回头压给顺子，喘着，两个短句" }), "02": P("normal", 0.75, { delivery: "喘着，说得急，一口气交代完" }),
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
