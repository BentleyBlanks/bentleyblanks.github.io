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
//      emit      [{ id, at: "start"|"end"|秒 }]：播放器在这一刻发具名事件（给玩法包对动作）
//
// 场景级：priority（true = 对白窗口内自主喊话让路，01–06 剧情对白一律 true）。

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
const Scene = (priority, context, lines) => Object.freeze({ priority, context, lines: Object.freeze(lines) });

const FRONT = "前沿机枪位后面的土墙与交通沟里，枪声很密，几个人相距两三米，要喊着说才听得清";

export const FIRST_LEVEL_DIALOGUE_DIRECTION = Object.freeze({
  // —— 01 炮击间隙：坟头土打趣。一边干活一边接话，节奏快。
  BunkerBanter: Scene(true, "前沿交通壕侧壁的小防炮洞里，炮击间隙。顺子、幺娃挤在洞里一边往弹夹里压子弹一边斗嘴，肩膀挂彩的川军靠在洞口，三个人相距一两米，彼此看得见，压着嗓子说话、带笑，是苦中作乐的打趣，不是表演", {
    "01": P("low", 0.45, { context: "几块土掉进衣领，伸手往外掏", delivery: "压着嗓子骂一句，带点自嘲" }),
    "02": P("normal", 0.5, { context: "蹲在旁边压子弹", delivery: "接话快，嘴贫，带笑" }),
    "03": P("low", 0.4, { delivery: "一个字，懒得理他" }),
    "04": P("normal", 0.5, { context: "靠在洞口，听笑了", delivery: "带笑的嘴硬", effort: { before: "先短短笑一声" } }),
    "05": P("normal", 0.5, { delivery: "抬杠，尾音往上挑" }),
    "06": P("normal", 0.55, { delivery: "认真起来的嘴硬" }),
    "07": P("low", 0.4, { delivery: "低头装弹，随口一句" }),
    "08": P("normal", 0.5, { delivery: "得意" }),
    "09": P("normal", 0.55, { delivery: "马上拆台，憋着笑" }),
    "10": P("normal", 0.45, { context: "低头看了一眼自己的肩膀", delivery: "满不在乎地损人", pauseBeforeS: 0.6 }),
    "11": P("low", 0.45, { delivery: "阴阳怪气" }),
    "12": P("normal", 0.5, { delivery: "一本正经地发狠" }),
    "13": P("normal", 0.5, { delivery: "好奇地追问" }),
    "14": P("normal", 0.55, { context: "拍了拍自己的枪", delivery: "得意，嘴角带笑", pauseBeforeS: 0.4,
      effort: { after: "说完几个人一起短促地笑了一声，马上收住" }, emit: [{ id: "BanterPatRifle", at: "start" }] }),
  }),
  BunkerOrders: Scene(true, "传令兵跑到防炮洞口扶住木撑，冲洞里的班长喊；班长在洞里一两米外，听完立刻回身下令", {
    "01": P("shout", 0.85, { context: "刚跑到洞口", delivery: "话几乎和喘气挤在一起", effort: { before: "急喘两下" } }),
    "02": P("shout", 0.8, { context: "朝前沟看了一眼，立即回身", delivery: "短促有力的命令，不拖音" }),
  }),
  // 被爆炸截断：句尾约 0.35 s 处硬掐（原文「炮弹！趴下——！（被爆炸截断）」），截断那一刻发 BunkerBlast。
  BunkerIncoming: Scene(true, "洞外交通沟里一个兵听见炮弹啸声逼近，隔着十来米朝防炮洞拼命示警", {
    "01": P("shout", 1, { spatial: "offscreen", cutAtS: -0.35, cutEvent: "BunkerBlast", stopOn: "event:Blast",
      delivery: "拼命的急喊，拉长破音" }),
  }),
  // 醒来时：前沟日兵边跑边喊；丁的「止まるな！」压住丙的尾音。
  BunkerSearch: Scene(true, "塌了的防炮洞外，两名日兵沿前沟往前跑，一前一后隔着几米边跑边喊", {
    "01": P("shout", 0.8, { spatial: "offscreen", delivery: "边跑边喊，不停下来" }),
    "02": P("shout", 0.8, { spatial: "offscreen", delivery: "从后面压上来催", offsetS: -0.3 }),
  }),
  CaptiveDragged: Scene(true, "两名日兵把被炸得神志不清的受伤川军从松土里拽出来，贴身拉扯；另一名日兵在前面十几米外喊", {
    "01": P("shout", 0.95, { context: "重伤被日兵从土里拽出，疼得喘气，认出敌人后怒火猛冲上来", delivery: "极度愤怒、厌恶，嫉恶如仇，咬牙把骂声狠狠砸向日本侵略者；四川口音，字字清楚，受伤也绝不求饶", effort: { before: "疼得闷哼，紧接着猛吸气怒骂" } }),
    "02": P("shout", 0.8, { context: "抓住后领猛地一提", delivery: "短促粗暴" }),
    "03": P("shout", 0.95, { context: "胳膊被扯到伤处，痛楚激起更强的反抗", delivery: "咬紧牙关又迸出怒骂，痛恨侵略者，狠而有力；不哭、不哀求、不软弱含糊", pauseBeforeS: 1.2, effort: { before: "忍痛猛吸一口气" } }),
    "04": P("shout", 0.8, { spatial: "offscreen", context: "前方枪声又起", delivery: "远处的急喊", pauseBeforeS: 1 }),
  }),
  CaptiveInterrogation: Scene(true, "交通壕里，日兵抓着受伤的川军俘虏按在沟壁上审问，翻译蹲在俘虏面前传话，几个人挤在一两米之内", {
    "01": P("shout", 0.75, { context: "抓着俘虏，转头冲翻译吼", delivery: "居高临下" }),
    "02": P("normal", 0.6, { delivery: "马上应，点头哈腰" }),
    "03": P("normal", 0.6, { context: "凑到俘虏面前", delivery: "急躁粗暴" }),
    "04": P("normal", 0.85, { context: "抬眼认出替日军传话的汉奸，怒目逼视他", delivery: "带着强烈鄙夷和憎恶，从牙缝里冷硬地吐出，不是神志不清的呢喃", pauseBeforeS: 0.9 }),
    "05": P("shout", 0.75, { delivery: "拔高嗓门吼" }),
    "06": P("shout", 0.85, { delivery: "不耐烦，压着翻译的话骂进来", offsetS: -0.25 }),
    "07": P("shout", 1, { context: "被压着仍拼力抬头，怒斥眼前卖国的翻译", delivery: "极度愤怒厌恶，嫉恶如仇，四川话骂得短促、凶狠、字字带刺；中间咬牙停一下再爆发，绝不哀求", pauseBeforeS: 0.8, effort: { before: "两口压着怒火的粗喘" } }),
    "08": P("shout", 0.8, { context: "皱眉扯住衣领", delivery: "逼问" }),
    "09": P("normal", 0.65, { delivery: "慌，谄媚地回报" }),
    "10": P("shout", 1, { context: "满嘴血仍抬头怒视日兵和翻译", delivery: "带着痛恨和蔑视一字一顿怒骂，重音锋利，喘息之间也不泄气；坚决抵抗到底", pauseBeforeS: 0.7 }),
    "11": P("shout", 1, { context: "知道自己会死，仍直视敌人，把最后一口气顶上来", delivery: "决绝、愤怒、鄙夷，把对汉奸和日本侵略者的刻骨仇恨砸进最后一句；咬牙爆发，收尾硬而狠，绝不是平静交代遗言", pauseBeforeS: 1.2, emit: [{ id: "CaptiveLastWord", at: "end" }] }),
  }),
  // 割喉之后：导演在刀划过那一刻发 ThroatCut。
  CaptiveTaunt: Scene(true, "日兵刚割了俘虏的喉，还抓着他的头发嘲弄，另一名日兵在旁边一两米冷笑；远处十几米外有日兵催促往前", {
    "01": P("shout", 0.8, { after: "event:ThroatCut", offsetS: 0.7, context: "仍抓着俘虏的头发", delivery: "嘲弄" }),
    "02": P("shout", 0.85, { delivery: "更狠的嘲弄" }),
    "03": P("low", 0.5, { delivery: "冷笑着骂一句", effort: { before: "鼻子里冷笑一声" } }),
    "04": P("shout", 0.8, { spatial: "offscreen", context: "前方远处", delivery: "远处的催促", pauseBeforeS: 1.2 }),
  }),
  ShunziFound: Scene(true, "日兵拨开断木，俯到塌了的洞口，发现里面还有一个活人", {
    "01": P("low", 0.5, { delivery: "压低的冷笑，慢，不喊" }),
  }),
  RescueInterrogation: Scene(true, "日兵把顺子从洞里拽出来按在地上，翻译蹲下来审问，另一名日兵在旁边催，几个人都在两米之内", {
    "01": P("shout", 0.7, { context: "抓住顺子前襟把他拽起来", delivery: "命令翻译" }),
    "02": P("normal", 0.6, { delivery: "马上应" }),
    "03": P("normal", 0.65, { context: "蹲下来", delivery: "急躁" }),
    "04": P("normal", 0.7, { context: "顺子头垂着不答", delivery: "更急", pauseBeforeS: 1.2 }),
    "05": P("shout", 0.8, { context: "朝顺子踢了一脚", delivery: "不耐烦" }),
    // 「说话！」要等导演：顺子抬眼越过翻译的肩膀看见班长之后（gate）。
    "06": P("shout", 0.8, { after: "gate", offsetS: 0, context: "一把抓住顺子的衣领", delivery: "吼" }),
  }),
  RescueFlee: Scene(true, "翻译看见同伴被大刀砍倒，踉跄着往前沟逃", {
    "01": P("shout", 0.95, { delivery: "惊叫，破音" }),
  }),
  RescueCheck: Scene(true, "罗班长刚把顺子拖到塌土后面，蹲到他跟前，脸对脸不到一米", {
    "01": P("low", 0.6, { delivery: "喘着气，低声但很硬，是在确认不是在安慰" }),
  }),
  CollectionMeet: Scene(true, "后交通壕的伤员集结处，幺娃从侧后赶到顺子身边，罗班长在旁边一两米指挥伤员通过", {
    "01": P("shout", 0.7, { delivery: "又惊又急" }),
    "02": P("low", 0.4, { context: "抹了一把嘴角", delivery: "喘着，简短" }),
    "03": P("shout", 0.6, { context: "把幺娃往土壁边拨开，让伤员先过", delivery: "催", pauseBeforeS: 0.6 }),
  }),
  SupportOrder: Scene(true, "后交通壕支沟口，一名撤回的守军扶着沟壁向罗班长报告，顺子在罗班长身边，三个人相距一两米，远处枪声不断", {
    "01": P("shout", 0.8, { context: "从支沟跑来，扶住沟壁", delivery: "气喘，喊给人听清", effort: { before: "急喘一口" } }),
    "02": P("normal", 0.7, { delivery: "问得极短" }),
    "03": P("shout", 0.75, { delivery: "喘着" }),
    "04": P("shout", 0.75, { context: "看向支沟，抬手指过去", delivery: "两道命令，后半句压给顺子", pauseBeforeS: 0.6 }),
    "05": P("low", 0.45, { context: "看了一眼往后撤的人", delivery: "不情愿" }),
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
  TankRoadContact: Scene(true, `${FRONT}。何有田先看见路上开出来的日军战车，喊罗班长；罗班长隔着几米回喊`, {
    "01": P("shout", 0.9, { delivery: "吃惊的急喊" }), "02": P("shout", 0.8),
  }),
  TankTerror: Scene(true, `${FRONT}。战车的机枪扫过来，罗班长冲站起来的人吼`, { "01": P("shout", 1) }),
  BundleOrder: Scene(true, `${FRONT}。一名守军喊着报告旧弹药屋里还有集束手榴弹，罗班长分派人手，顺子在他身边问了一句`, {
    "01": P("shout", 0.8), "02": P("shout", 0.75), "03": P("normal", 0.7, { delivery: "转头对身边的顺子" }),
    "04": P("normal", 0.6, { delivery: "有点发怵" }), "05": P("normal", 0.75, { delivery: "不耐烦地打断" }),
  }),
  BundleGo: Scene(true, `${FRONT}。何有田在机枪位顶着，催罗班长快走；罗班长带顺子下沟`, {
    "01": P("shout", 0.8), "02": P("normal", 0.7),
  }),
  BundleProne: Scene(true, "交通沟里贴着土坡低身移动，罗班长在顺子前面一两米，压着嗓子提醒，看见岔口有人再急促报警", {
    "01": P("low", 0.75), "02": P("low", 0.8, { after: "gate", offsetS: 0 }),
  }),
  BundleSupply: Scene(true, "旧弹药屋门口，守屋的老兵指着里面的箱子，罗班长接过来就催顺子往回走", {
    "01": P("normal", 0.6), "02": P("normal", 0.7),
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
    "04": P("normal", 0.55), "05": P("normal", 0.65),
  }),
  BorrowLight: Scene(true, "背坡伤员集结处，老周靠在土壁边等担架，嘴里叼着一根没点着的纸烟，腿伤让他动一下就抽气；顺子蹲在他旁边一米。两人是刚混个脸熟的陌生人，互相占便宜、都不肯吃亏，语气是懒洋洋的斗嘴，不是温情；最后一句轻描淡写地认栽", {
    "01": P("normal", 0.4), "02": P("low", 0.4), "03": P("normal", 0.4, { delivery: "叼着烟，含混" }),
    "04": P("low", 0.4),
    "05": P("low", 0.35, { emit: [{ id: "BorrowLightMatchesPocketed", at: "end" }] }),
    // 两处动作空当：第五句后顺子把火柴往兜里一收（约 2 s）、第六句后老周摸出烟包递一根过去（约 3 s）。
    "06": P("low", 0.35, { offsetS: 2.0, emit: [{ id: "BorrowLightCigaretteOffered", at: "end" }] }),
    "07": P("normal", 0.4, { offsetS: 3.0 }), "08": P("low", 0.4), "09": P("low", 0.35),
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
