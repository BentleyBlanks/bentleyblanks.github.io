// 第一关 01–06 对白导演时间轴（纯数据；契约 docs/Data_FirstLevel0105Refactor20260923Contract.md §5.5）。
//
// 每句一条逐句干声（Audio/FirstLevel/Lines/…），播放器 Script_DialoguePlayer 按这里排时间：
//
//   after     "prev"          上一句**结束**后 offsetS 秒开口（offsetS < 0 = 压住上一句的尾音，允许重叠）
//             "start"         场景开始后 offsetS 秒（第一句的默认）
//             "event:<name>"  等到导演发出这个事件（handle.Signal(name) 或 voice.Signal）再过 offsetS 秒
//             "gate"          等 PlayScene 传进来的 gate(lineId) 返回 true 再过 offsetS 秒
//   offsetS   秒；打趣接话 0.15–0.5，动作空当按原文的动作估，抢话可以是负数
//   projection  shout / normal / low / breath —— 决定这一句干声母带的目标电平（Data 里的 PROJECTION_DB）
//   intensity 0–1，写进提示词的情绪强度（0.2 虚弱、0.5 平常、0.9 拼命）
//   spatial   "self"（第一人称顺子，居中干声）/ "head"（挂在说话人头上）/ "offscreen"（视线外的人，
//             解析不到位置时按非定位播放，电平再降 PROJECTION_OFFSCREEN_DB）
//   cutAtS    这句在第几秒被硬截断（被爆炸打断的那种）；负数 = 距句尾多少秒。截断那一刻发 cutEvent
//   stopOn    "event:<name>"：导演发这个事件时立即掐掉这句（比 cutAtS 早到就以它为准）
//   emit      [{ id, at: "start"|"end"|秒 }]：播放器在这一刻发具名事件（给玩法包对动作）
//   context / delivery   逐句表演提示（写进 SeedAudio 提示词，不进字幕）
//
// 缺省：after "prev"、offsetS 0.3、intensity 0.5、projection 取定妆表的角色默认、spatial 顺子 self 其余 head。
// 场景级：priority（true = 对白窗口内自主喊话让路，01–06 剧情对白一律 true）、duck（侧链压低量，缺省用
// DIALOGUE_DUCK）。

import { FIRST_LEVEL_VOICE_CAST } from "./Data_FirstLevelVoiceCast.mjs";

/** 逐句干声母带目标：有声段 RMS（dBFS）。喊比平常响 3 dB、低声比平常轻 4 dB、气声再轻 4 dB。 */
export const PROJECTION_DB = Object.freeze({ shout: -16, normal: -19, low: -23, breath: -27 });
/** 真峰值上限（dBTP）与首尾保留的静音（秒）。 */
export const LINE_MASTER = Object.freeze({ ceilingDb: -1, padS: 0.06, padMinS: 0.04, padMaxS: 0.08 });
export const PROJECTION_OFFSCREEN_DB = -4;

/**
 * 对白窗口内的侧链：环境床与音乐压 −6 dB、远声组（远处战斗）压 −3 dB；SFX 不压。
 * attackS / releaseS 是起落时间常数；holdS 是最后一句结束后多久才放回来（两句之间的空当不抽泵）。
 */
export const DIALOGUE_DUCK = Object.freeze({ ambienceDb: -6, farDb: -3, attackS: 0.08, releaseS: 0.45, holdS: 0.6 });

const D = (after, offsetS, projection, intensity, more = {}) => Object.freeze({ after, offsetS, projection, intensity, ...more });
const Scene = (priority, lines, more = {}) => Object.freeze({ priority, lines: Object.freeze(lines), ...more });

export const FIRST_LEVEL_DIALOGUE_DIRECTION = Object.freeze({
  // —— 01 炮击间隙：坟头土打趣。一边干活一边接话，节奏快；三处原文动作留出空当。
  BunkerBanter: Scene(true, {
    "01": D("start", 0.4, "low", 0.45, { context: "炮击间隙，几块土掉进衣领，伸手往外掏", delivery: "压着嗓子骂一句，带点自嘲" }),
    "02": D("prev", 0.25, "normal", 0.5, { context: "蹲在旁边压子弹", delivery: "接话快，嘴贫，带笑" }),
    "03": D("prev", 0.2, "low", 0.4, { delivery: "一个字，懒得理他" }),
    "04": D("prev", 0.9, "normal", 0.5, { context: "肩膀挂彩靠在洞口，听笑了", delivery: "带笑的嘴硬，扯到伤口顿一下" }),
    "05": D("prev", 0.2, "normal", 0.5, { delivery: "抬杠，尾音往上挑" }),
    "06": D("prev", 0.3, "normal", 0.55, { delivery: "认真起来的嘴硬" }),
    "07": D("prev", 0.35, "low", 0.4, { delivery: "低头装弹，随口一句" }),
    "08": D("prev", 0.2, "normal", 0.5, { delivery: "得意" }),
    "09": D("prev", 0.15, "normal", 0.55, { delivery: "马上拆台，憋着笑" }),
    "10": D("prev", 0.8, "normal", 0.45, { context: "低头看了一眼自己的肩膀", delivery: "满不在乎地损人" }),
    "11": D("prev", 0.25, "low", 0.45, { delivery: "阴阳怪气" }),
    "12": D("prev", 0.3, "normal", 0.5, { delivery: "一本正经地发狠" }),
    "13": D("prev", 0.2, "normal", 0.5, { delivery: "好奇地追问" }),
    "14": D("prev", 0.6, "normal", 0.55, { context: "拍了拍自己的枪", delivery: "得意，嘴角带笑，说完就停", emit: [{ id: "BanterPatRifle", at: "start" }] }),
  }),
  BunkerOrders: Scene(true, {
    "01": D("start", 0, "shout", 0.85, { context: "跑到洞口扶住木撑", delivery: "话几乎和喘气挤在一起" }),
    "02": D("prev", 0.35, "shout", 0.8, { context: "朝前沟看了一眼，立即回身", delivery: "短促有力的命令，不拖音" }),
  }),
  // 被爆炸截断：句尾约 0.35 s 处硬掐（原文「炮弹！趴下——！（被爆炸截断）」），截断那一刻发 BunkerBlast。
  BunkerIncoming: Scene(true, {
    "01": D("start", 0, "shout", 1, { spatial: "offscreen", cutAtS: -0.35, cutEvent: "BunkerBlast", stopOn: "event:Blast",
      context: "洞外沟里，炮弹啸声逼近", delivery: "拼命的急喊，拉长破音" }),
  }),
  // 醒来时：前沟日兵边跑边喊；丁的「止まるな！」压住丙的尾音。
  BunkerSearch: Scene(true, {
    "01": D("start", 0, "shout", 0.8, { spatial: "offscreen", context: "沿前沟往前跑", delivery: "边跑边喊，不停下来" }),
    "02": D("prev", -0.3, "shout", 0.8, { spatial: "offscreen", delivery: "从后面压上来催" }),
  }),
  CaptiveDragged: Scene(true, {
    "01": D("start", 0, "low", 0.3, { context: "被两名日兵从松土里拽出来，头歪着，神志不清", delivery: "含糊、虚弱的骂，中间断气" }),
    "02": D("prev", 0.25, "shout", 0.8, { context: "抓住后领猛地一提", delivery: "短促粗暴" }),
    "03": D("prev", 1.6, "low", 0.35, { context: "胳膊被扯到伤处，猛吸一口气", delivery: "从牙缝里挤出来，一字一顿" }),
    "04": D("prev", 1.4, "shout", 0.8, { spatial: "offscreen", context: "前方枪声又起", delivery: "远处的急喊" }),
  }),
  CaptiveInterrogation: Scene(true, {
    "01": D("start", 0, "shout", 0.75, { context: "抓着俘虏，转头冲翻译吼", delivery: "居高临下" }),
    "02": D("prev", 0.1, "normal", 0.6, { delivery: "马上应，点头哈腰" }),
    "03": D("prev", 0.6, "normal", 0.6, { context: "凑到俘虏面前", delivery: "急躁粗暴" }),
    "04": D("prev", 1.1, "breath", 0.25, { context: "眼神涣散，慢半拍才转过脸", delivery: "含糊的一声" }),
    "05": D("prev", 0.2, "shout", 0.75, { delivery: "拔高嗓门吼" }),
    "06": D("prev", -0.25, "shout", 0.85, { delivery: "不耐烦，压着翻译的话骂进来" }),
    "07": D("prev", 1.0, "low", 0.35, { context: "喘了两口气", delivery: "虚弱但清楚，中间停一下" }),
    "08": D("prev", 0.5, "shout", 0.8, { context: "皱眉扯住衣领", delivery: "逼问" }),
    "09": D("prev", 0.2, "normal", 0.65, { delivery: "慌，谄媚地回报" }),
    "10": D("prev", 0.9, "low", 0.4, { context: "抬了一下头", delivery: "喘着，一字一顿地骂" }),
    "11": D("prev", 1.6, "low", 0.4, { context: "缓了一口气，嘴角带血", delivery: "平静的最后一句", emit: [{ id: "CaptiveLastWord", at: "end" }] }),
  }),
  // 割喉之后：导演在刀划过那一刻发 ThroatCut。
  CaptiveTaunt: Scene(true, {
    "01": D("event:ThroatCut", 0.7, "shout", 0.8, { context: "仍抓着俘虏的头发", delivery: "嘲弄" }),
    "02": D("prev", 0.3, "shout", 0.85, { delivery: "更狠的嘲弄" }),
    "03": D("prev", 0.5, "low", 0.5, { context: "在旁边冷笑", delivery: "冷笑着骂一句" }),
    "04": D("prev", 1.5, "shout", 0.8, { spatial: "offscreen", context: "前方远处", delivery: "远处的催促" }),
  }),
  ShunziFound: Scene(true, {
    "01": D("start", 0, "low", 0.5, { context: "拨开断木，俯到洞口", delivery: "压低的冷笑，慢，不喊" }),
  }),
  RescueInterrogation: Scene(true, {
    "01": D("start", 0, "shout", 0.7, { context: "抓住顺子前襟把他拽起来", delivery: "命令翻译" }),
    "02": D("prev", 0.1, "normal", 0.6, { delivery: "马上应" }),
    "03": D("prev", 0.7, "normal", 0.65, { context: "蹲下来", delivery: "急躁" }),
    "04": D("prev", 1.6, "normal", 0.7, { context: "顺子头垂着不答", delivery: "更急" }),
    "05": D("prev", 0.4, "shout", 0.8, { context: "朝顺子踢了一脚", delivery: "不耐烦" }),
    // 「说话！」要等导演：顺子抬眼越过翻译的肩膀看见班长之后（gate）。
    "06": D("gate", 0, "shout", 0.8, { context: "一把抓住顺子的衣领", delivery: "吼" }),
  }),
  RescueFlee: Scene(true, {
    "01": D("start", 0, "shout", 0.95, { context: "踉跄着退开", delivery: "惊叫，破音" }),
  }),
  RescueCheck: Scene(true, {
    "01": D("start", 0, "low", 0.6, { context: "蹲到顺子跟前", delivery: "喘着气，低声但很硬" }),
  }),
  CollectionMeet: Scene(true, {
    "01": D("start", 0, "shout", 0.7, { context: "从侧后赶来", delivery: "又惊又急" }),
    "02": D("prev", 0.4, "low", 0.4, { delivery: "喘着，简短" }),
    "03": D("prev", 0.9, "shout", 0.6, { context: "把幺娃往土壁边拨开，让伤员先过", delivery: "催" }),
  }),
  SupportOrder: Scene(true, {
    "01": D("start", 0, "shout", 0.8, { context: "从支沟跑来，扶住沟壁喘气", delivery: "气喘，喊给人听清" }),
    "02": D("prev", 0.15, "normal", 0.7, { delivery: "问得极短" }),
    "03": D("prev", 0.1, "shout", 0.75, { delivery: "喘着" }),
    "04": D("prev", 0.9, "shout", 0.75, { context: "看向支沟，抬手指过去", delivery: "两道命令，后半句压给顺子" }),
    "05": D("prev", 0.7, "low", 0.45, { context: "看了一眼往后撤的人", delivery: "不情愿" }),
    "06": D("prev", 0.2, "normal", 0.7, { delivery: "不容商量" }),
  }),

  // —— 03–06：cue id 与台词不变，改成逐句干声；时间按战斗语境（命令紧接）。
  FrontBlockade: Scene(true, { "01": D("start", 0, "shout", 0.85), "02": D("prev", 0.25, "shout", 0.75), "03": D("prev", 0.35, "normal", 0.7) }),
  FrontApproach: Scene(true, { "01": D("start", 0, "low", 0.7), "02": D("gate", 0, "shout", 0.75) }),
  FrontAttack: Scene(true, { "01": D("start", 0, "shout", 0.85) }),
  FrontWithdraw: Scene(true, { "01": D("start", 0, "shout", 0.9) }),
  TakeOverGun: Scene(true, { "01": D("start", 0, "shout", 0.8), "02": D("prev", 0.2, "shout", 0.7), "03": D("prev", 0.15, "shout", 0.75) }),
  TankRoadContact: Scene(true, { "01": D("start", 0, "shout", 0.9), "02": D("prev", 0.2, "shout", 0.8) }),
  TankTerror: Scene(true, { "01": D("start", 0, "shout", 1) }),
  BundleOrder: Scene(true, { "01": D("start", 0, "shout", 0.8), "02": D("prev", 0.3, "shout", 0.75), "03": D("prev", 0.25, "normal", 0.7),
    "04": D("prev", 0.3, "normal", 0.6), "05": D("prev", 0.1, "normal", 0.75) }),
  BundleGo: Scene(true, { "01": D("start", 0, "shout", 0.8), "02": D("prev", 0.25, "normal", 0.7) }),
  BundleProne: Scene(true, { "01": D("start", 0, "low", 0.75), "02": D("gate", 0, "low", 0.8) }),
  BundleSupply: Scene(true, { "01": D("start", 0, "normal", 0.6), "02": D("prev", 0.25, "normal", 0.7) }),
  BundleReturnCall: Scene(true, { "01": D("start", 0, "shout", 0.85, { spatial: "offscreen" }), "02": D("prev", 0.3, "shout", 0.75) }),
  BundleAttack: Scene(true, { "01": D("start", 0, "low", 0.7), "02": D("gate", 0, "low", 0.75) }),
  BundleRetreat: Scene(true, { "01": D("start", 0, "shout", 0.9) }),
  TankStopped: Scene(true, { "01": D("start", 0, "shout", 0.85), "02": D("prev", 0.2, "shout", 0.8), "03": D("prev", 0.3, "shout", 0.75) }),
  FrontRelief: Scene(true, { "01": D("start", 0, "shout", 0.7), "02": D("prev", 0.3, "shout", 0.65), "03": D("prev", 0.25, "shout", 0.7) }),
  // 06 集结处：说话慢下来；BorrowLight 两处动作空当原样保留（事件名沿用）。
  Volunteer: Scene(true, { "01": D("start", 0, "shout", 0.7), "02": D("prev", 0.3, "normal", 0.6), "03": D("prev", 0.2, "normal", 0.6),
    "04": D("prev", 0.5, "normal", 0.55), "05": D("prev", 0.3, "normal", 0.65) }),
  BorrowLight: Scene(true, {
    "01": D("start", 0, "normal", 0.4), "02": D("prev", 0.5, "low", 0.4), "03": D("prev", 0.4, "normal", 0.4),
    "04": D("prev", 0.35, "low", 0.4),
    "05": D("prev", 0.6, "low", 0.35, { emit: [{ id: "BorrowLightMatchesPocketed", at: "end" }] }),
    "06": D("prev", 2.0, "low", 0.35, { emit: [{ id: "BorrowLightCigaretteOffered", at: "end" }] }),
    "07": D("prev", 3.0, "normal", 0.4), "08": D("prev", 0.4, "low", 0.4), "09": D("prev", 0.6, "low", 0.35),
  }),
  ZhouLift: Scene(true, { "01": D("start", 0, "shout", 0.6), "02": D("prev", 0.35, "low", 0.35), "03": D("prev", 0.2, "shout", 0.6),
    "04": D("prev", 0.5, "breath", 0.3) }),
});

/** 逐句 id：`<Scene>.<NN>`（两位序号，从 01 起）。 */
export const LineId = (sceneId, index) => `${sceneId}.${String(index + 1).padStart(2, "0")}`;

/** 一句的导演参数（缺省：after prev / 0.3 s / 角色默认档；顺子 self）。 */
export function LineDirection(cue, index) {
  const line = cue.lines[index];
  const authored = FIRST_LEVEL_DIALOGUE_DIRECTION[cue.id]?.lines?.[String(index + 1).padStart(2, "0")] || {};
  return Object.freeze({
    after: index ? "prev" : "start", offsetS: index ? 0.3 : 0, intensity: 0.5,
    projection: FIRST_LEVEL_VOICE_CAST[line.who]?.projection || "normal",
    spatial: line.who === "shunzi" ? "self" : "head",
    ...authored,
  });
}
