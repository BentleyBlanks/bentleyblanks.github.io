// 《滕县 一九三八》叙事层：把 Data_TengxianScript.LEVELS 那本考据过的剧本
// 按关派发进正片。
//
// 与上一版（台儿庄）最大的不同：**这里不再有翻译层。**
//
// 上一版之所以有一张 TranslateAt 表（zone:Rampart → 占领点 NorthGate、
// wave:2 → "第 2 次交火"…），是因为剧本按线性关卡写，而战场被改成了开放地图 +
// 占领点。两套坐标系对不上，只好硬翻。现在关卡真的是线性的了，
// 剧本的 at 语义（start / delay / zone / event / wave / waveClear / end）
// 就是运行时的语义，一一对应，中间不需要任何猜测 —— 那张翻译表整个删掉。
//
// 这一层**不改一个字的台词**。史实与措辞是考据定下的（每条 beat 自带 tier 与
// source），这里没有资格动它。
//
// ── 保留下来的一条：带超时兜底的顺序链 ──────────────────────────────────
// 剧本按作者写的顺序排成一条链，每条卡在自己的条件上；条件满足就播，然后轮到下一条。
// **每条都有 maxWait**：等超了就直接播。
// 线性关卡里这条比开放战场更必要而不是更不必要 —— 玩家完全可能绕开某个路标、
// 或者一路顺风从没被打退过一次波次。没有兜底的话链子会卡在那一条上，
// 后面整本剧本被静默吞掉，日志上什么都看不出来（最难查的一类 bug）。
// 兜底触发的那一条会记 byTimeout: true，通关冒烟看这个比例。

// ── beat.voice：台词的语音通道（2026-08-28 任务流程重制）─────────────────────
// 一条 beat 可以带 `voice: "ch3_yaowa_07"`，指名要播哪一条录好的台词。
// 这一层**只管在正确的时刻报出 key 与说话人**；「那个人现在站在哪儿」是装配层
// 才知道的事（Story 手里没有场景、没有演员表位置），所以播放走注入的回调：
//   story.AttachVoice(({ key, who, position }) => audio.PlayStoryVoice(key, { position }))
// 没接线、或者那一条还没烘出音频时，回调返回 null，这里就当纯字幕处理 ——
// **绝不因此中断剧本**：台词先写、音频后烘是常态，不是错误。
import { VoiceDurOf } from "./Data_Voice.mjs";

import { LEVELS, CAST, MENU, CREDITS, FindLevel, CHAPTER_EVENTS } from "./Data_TengxianScript.mjs";

// ===========================================================================
// 关内事件线：`event:名字` 什么时候算发生了
// ===========================================================================
//
// 为什么判定放在叙事层而不是装配层：这些条件全是**叙事上的时刻**
//（「后送队出发了」「白刃战打完了」「电报发毕了」），不是战斗规则。
// 装配层只负责每帧递一份运行时上下文（走到第几个路标、关内多少秒、
// 身边打起来没有），由这里判定叙事时刻到没到。
//
// 装配层仍可以用 Signal(name) 主动推一条（照明弹真升空时推 C4_FlareUp、
// CarrySystem.Begin("stretcher") 成功那一帧推 StretcherHandoff），
// **推过的优先** —— 真发生过的事永远比时刻表准。这条既有路径一个字没动。
//
// ── 2026-08-28 集成批 INT1：这张表改成从章节数据**自动构建** ────────────────
// 旧版把七章的判据手抄在这里，于是每加一条事件都要改两个文件，而且七章里
// 只有 L* 那一版的键（旧关表已删）—— 新章的 `event:` 一条都命不中，全靠
// MAX_WAIT.event = 80 s 的超时兜底，后半关的台词会整体被推到关末被 FlushTail 吞掉。
//
// 现在改成：每个 Data_MissionChX.mjs 自己导出 `EVENTS`，这里照它建表。
// 七章的 EVENTS 是三批人分别写的，字段名不统一（这是事实，不是疏忽）：
//   C1  { name, stage, what, signal, fallback }        兜底式在 fallback
//   C3  { event, what, signal, predicate, moveBeats, cutscene }
//   C4  { name, stage, signal, cue, note }             兜底式在 cue
//   C5  { id, when, nowAt, mechanic }                  **没有兜底式**
//   C6  { id, when, anchorBeat, fallback, note }
//   C2  没有 EVENTS 导出（只有文件头注释里的一条 BayonetDone）
// 所以这里做两件事：① 三个名字字段（name/event/id）与三个判据字段
//（fallback/predicate/cue）一律认；② 判据缺位时按事件在表里的次序**均匀铺开**
// 到关卡时长上（第 i 条 / 共 n 条 → levelTime > levelSeconds×(i+1)/(n+1)）。
// 均匀兜底不是"准"，是"不会把整条链挂死"——真发生时由 Signal 覆盖。
//
// ctx: { zone, objectiveIndex, objectiveCount, levelTime, levelSeconds, pool }

/** 判据里认得的运行时字段。写别的名字一律解析失败，退回均匀兜底。 */
export const CUE_FIELDS = new Set([
  "zone", "objectiveIndex", "objectiveCount", "levelTime", "levelSeconds", "pool",
]);

/** 章节侧登记事件名用过的三个字段名（哪个有算哪个）。 */
const EVENT_NAME_KEYS = ["name", "event", "id"];
/** 章节侧登记兜底判据用过的三个字段名。 */
const EVENT_PREDICATE_KEYS = ["fallback", "predicate", "cue"];

/**
 * 把章节数据里那一行**字符串**判据解析成函数。
 *
 * **不用 eval / new Function。** 两个理由：
 *   · 章节数据是内容批写的纯数据，让它变成可执行代码等于把数据层的笔误
 *     升级成运行时注入面；
 *   · `new Function` 在带 CSP 的页面上会直接抛，而这条路是**开机链**上的 ——
 *     判据解析失败不该让整局起不来。
 *
 * 支持的文法（覆盖七章现有的每一条，故意不多）：
 *   expr    := and ( "||" and )*
 *   and     := cmp ( "&&" cmp )*
 *   cmp     := c.<字段> <op> <操作数>
 *   op      := >= | <= | === | !== | == | != | > | <
 *   操作数   := 数字 | 字符串 | c.<字段> [ "*" 数字 ]
 * 解析不了就返回 null（调用方退回均匀兜底并把这一条记进 CUE_BUILD_REPORT）。
 */
export function ParsePredicate(source) {
  if (typeof source === "function") return source;
  if (typeof source !== "string" || !source.trim()) return null;
  let body = source.trim();
  const arrow = body.indexOf("=>");
  if (arrow >= 0) body = body.slice(arrow + 2).trim();
  // 箭头右边不许再有括号：本文法没有分组，出现括号说明是没见过的写法，交给兜底。
  if (/[()]/.test(body)) return null;

  const Operand = (text) => {
    const raw = text.trim();
    if (!raw) return null;
    if (/^-?\d+(\.\d+)?$/.test(raw)) { const n = Number(raw); return () => n; }
    const quoted = raw.match(/^(["'])(.*)\1$/);
    if (quoted) { const s = quoted[2]; return () => s; }
    const scaled = raw.match(/^c\.([A-Za-z]+)\s*\*\s*(-?\d+(?:\.\d+)?)$/);
    if (scaled && CUE_FIELDS.has(scaled[1])) {
      const key = scaled[1], k = Number(scaled[2]);
      return (c) => Number(c[key]) * k;
    }
    const plain = raw.match(/^c\.([A-Za-z]+)$/);
    if (plain && CUE_FIELDS.has(plain[1])) { const key = plain[1]; return (c) => c[key]; }
    return null;
  };

  const OPS = {
    ">=": (a, b) => a >= b, "<=": (a, b) => a <= b,
    "===": (a, b) => a === b, "!==": (a, b) => a !== b,
    "==": (a, b) => a === b, "!=": (a, b) => a !== b,
    ">": (a, b) => a > b, "<": (a, b) => a < b,
  };
  const Compare = (text) => {
    // 长的先试，不然 ">=" 会被 ">" 抢走
    for (const op of ["===", "!==", ">=", "<=", "==", "!=", ">", "<"]) {
      const at = text.indexOf(op);
      if (at < 0) continue;
      const left = Operand(text.slice(0, at));
      const right = Operand(text.slice(at + op.length));
      if (!left || !right) return null;
      const fn = OPS[op];
      return (c) => fn(left(c), right(c));
    }
    return null;
  };

  const ors = body.split("||");
  const terms = [];
  for (const orPart of ors) {
    const ands = orPart.split("&&").map(Compare);
    if (ands.some((f) => !f)) return null;
    terms.push(ands.length === 1 ? ands[0] : (c) => ands.every((f) => f(c)));
  }
  if (!terms.length) return null;
  return terms.length === 1 ? terms[0] : (c) => terms.some((f) => f(c));
}

/**
 * 章节没有导出 EVENTS、或导出的那条没有兜底式时，这里补。
 *
 * **只填空，不覆盖**：章节自己写了判据的一律以章节为准。
 *
 * ── 2026-08-29 集成批 INT2：这张表现在是空的 ────────────────────────────────
 * 唯一那条补丁（CH2 的 BayonetDone）已经搬回 `Data_MissionCh2.mjs` 自己的
 * `export const EVENTS`。INT1 时把它写在这里是因为「集成批不许改内容批的文件」；
 * INT2 那道闸解除了，判据就该回到它描述的那一章去 ——
 * 一个事件的名字与兜底判据分居两个文件，第二天就会分叉。
 *
 * **机制本身留着**：将来再出现「章节还没来得及登记」的空窗时，
 * 往这里填一条比改七个章节文件安全（它只填空、不覆盖）。
 */
const SUPPLEMENT_CUES = {};

/** 关卡钉住时放行换关用的信号名。章节数据里写 mechanics.pinFinalZone 才生效。 */
export const CHAPTER_RELEASE_SIGNAL = "ChapterRelease";
/** `CHAPTER.cutsceneMid` 写成字符串时默认挂的信号名（写成对象可以自己指定 signal）。 */
export const MID_CUTSCENE_SIGNAL = "ChapterMidCutscene";

/**
 * 按七章的 EVENTS 建判定表。
 *
 * @param {Array} chapters CHAPTER_EVENTS（Data_TengxianScript 汇总的
 *   `[{ levelId, events, cutsceneMid }]`）
 * @returns {{cues:object, cutscenes:object, report:Array}}
 *   cues       levelId → { 事件名: (ctx)=>boolean }
 *   cutscenes  levelId → { 事件名: 过场 id }（Signal 到这一条时请求宿主播过场）
 *   report     每条事件的来源与判据成色，给测试与排障看
 */
export function BuildLevelCues(chapters = CHAPTER_EVENTS) {
  const cues = {};
  const cutscenes = {};
  const report = [];
  for (const chapter of chapters || []) {
    const levelId = chapter && chapter.levelId;
    if (!levelId) continue;
    const events = Array.isArray(chapter.events) ? chapter.events : [];
    const table = cues[levelId] || (cues[levelId] = {});
    const cutTable = cutscenes[levelId] || (cutscenes[levelId] = {});
    events.forEach((entry, index) => {
      if (!entry) return;
      let name = null;
      for (const key of EVENT_NAME_KEYS) {
        if (typeof entry[key] === "string" && entry[key]) { name = entry[key]; break; }
      }
      if (!name) return;
      let source = null;
      for (const key of EVENT_PREDICATE_KEYS) {
        if (entry[key] !== undefined && entry[key] !== null) { source = entry[key]; break; }
      }
      const parsed = ParsePredicate(source);
      // 均匀铺开：第 i 条（共 n 条）落在关卡时长的 (i+1)/(n+1) 处。
      const share = (index + 1) / (events.length + 1);
      const spread = (c) => c.levelTime > c.levelSeconds * share;
      table[name] = parsed || spread;
      if (typeof entry.cutscene === "string" && entry.cutscene) cutTable[name] = entry.cutscene;
      report.push({
        levelId, name, index,
        kind: parsed ? "declared" : (source ? "unparsed" : "spread"),
        share: parsed ? null : +share.toFixed(3),
        source: typeof source === "string" ? source : null,
        cutscene: cutTable[name] || null,
      });
    });
    // 章节没导出 / 漏登记的补丁（只填空）
    for (const [name, test] of Object.entries(SUPPLEMENT_CUES[levelId] || {})) {
      if (table[name]) continue;
      table[name] = test;
      report.push({ levelId, name, index: -1, kind: "supplement", share: null, source: null, cutscene: null });
    }
    // CHAPTER.cutsceneMid：关**中**播的过场。字符串形式挂在默认信号上，
    // 对象形式可以自己指定挂哪一条信号（CH5 的转身该挂 TurnedBack）。
    const mid = chapter.cutsceneMid;
    if (mid) {
      const id = typeof mid === "string" ? mid : mid.id;
      const signal = (typeof mid === "object" && mid.signal) || MID_CUTSCENE_SIGNAL;
      if (id) {
        cutTable[signal] = id;
        if (!table[signal]) {
          // cutsceneMid 挂的那条信号**不给时刻兜底**：关中过场必须由事实推
          //（真转身了才播），时刻表推出来的转身会在玩家还在城门口时抢镜头。
          table[signal] = () => false;
        }
        report.push({ levelId, name: signal, index: -1, kind: "cutsceneMid", share: null, source: null, cutscene: id });
      }
    }
  }
  return { cues, cutscenes, report };
}

const BUILT = BuildLevelCues();
/** 七章的事件判定表（由各章 EVENTS 自动构建，见上）。 */
export const LEVEL_CUES = BUILT.cues;
/** 事件名 → 关中过场 id。Signal 到这一条时请求宿主播（见 StoryDirector.Signal）。 */
export const SIGNAL_CUTSCENES = BUILT.cutscenes;
/** 构建报告：哪些事件有章节自己的判据、哪些吃了均匀兜底。测试与排障读它。 */
export const CUE_BUILD_REPORT = BUILT.report;

/**
 * 各类触发式等不到时的兜底上限（秒）。
 * zone 给得最宽 —— 走到某个路标是玩家自己的事；event 次之；
 * delay/start 本来就是时间条件，兜底等于它自己。
 */
const MAX_WAIT = { after: 0, zone: 95, event: 80, fight: 70, fightEnd: 85, end: 1e9 };
const MIN_GAP = 2.0;              // 两条台词之间的最小间隔，不然会叠成一团
// 带语音的那一条要**占住话筒直到自己说完**：字幕的默认停留（3.4—5.4 s）跟音频
// 长度没有关系，按默认间隔放行下一条，长句子会被下一句从中间打断。
// 上限 8 s 是保险丝：真有一条 20 s 的连续场景（序章动员那种）也不至于把整条
// 剧本链卡在那儿 —— 超时兜底虽然照常在走，但那要等到 MAX_WAIT。
const VOICE_HOLD_MAX = 8.0;
const VOICE_HOLD_TAIL = 0.35;     // 说完之后再留一点，别话音未落就下一句
// 字幕跟着语音走：有音频时字幕至少陪到人说完（取长者）。
// 反过来不成立 —— 音频短不代表字幕可以更短，字幕有自己的可读下限。
const SUBTITLE_TAIL = 0.6;
const SUBTITLE_MAX = 9.0;

/** 把一条 beat 的 at 解析成运行时条件。**没有翻译，只有解析。** */
function ParseAt(at) {
  if (!at || at === "start") return { kind: "after", seconds: 0.8 };
  if (at === "end") return { kind: "end" };
  if (at.startsWith("delay:")) return { kind: "after", seconds: parseFloat(at.slice(6)) || 2 };
  if (at.startsWith("zone:")) return { kind: "zone", zone: at.slice(5) };
  if (at.startsWith("event:")) return { kind: "event", event: at.slice(6) };
  if (at.startsWith("waveClear:")) return { kind: "fightEnd", n: parseInt(at.slice(10), 10) || 1 };
  if (at.startsWith("wave:")) return { kind: "fight", n: parseInt(at.slice(5), 10) || 1 };
  return { kind: "after", seconds: 3 };
}

export class StoryDirector {
  /**
   * @param {object} host { hud, audio }
   */
  constructor(host) {
    this.hud = host.hud;
    this.audio = host.audio || null;
    this.queue = [];
    this.index = 0;
    this.levelId = null;
    this.levelTime = 0;
    this.sinceLast = MIN_GAP;
    this.beatWait = 0;
    this.fightCount = 0;
    this.fightEndCount = 0;
    this.inFight = false;
    this.fightCooldown = 0;
    this.pushed = new Set();       // 装配层主动推过的事件（推过就一直算数）
    this.cued = new Set();         // 时刻表判定已发生的事件
    this.fired = [];               // 播过的 beats（测试断言看这个）
    this.objectiveText = null;
    // --- 语音通道（可选，没接线就是纯字幕）---
    this.voicePlay = null;         // ({key, who, position}) => {duration}|number|null
    this.voiceLocate = null;       // (who) => {x,y,z}|null，宿主用来定位说话人
    this.voiceStop = null;         // () => void，换关时掐掉上一句
    this.voiceLog = [];            // 取证：每条 voiced beat 到底播没播出来
    // --- 关中过场（可选，没接线就是「跳过这一拍，剧本照走」）---
    this.cutscenePlay = null;      // (id) => Promise|any|null，宿主播一场并交还控制权
    this.cutsceneHold = false;     // 宿主正在播 —— 这期间不推剧本
    this.cutsceneFired = new Set();// 本关已经播过的关中过场（同一场只播一次）
    this.cutsceneLog = [];         // 取证：请求过哪几场、播没播出来
    this.signalCutscenes = null;   // 本关的 事件名 → 过场 id
    this.flushLog = null;          // 上一次 FlushTail 倒了什么、跳过了什么
  }

  /**
   * 接上语音通道。宿主给一个「把这条 key 播出来」的回调，Story 只负责报时机。
   *
   * 为什么是注入而不是 Story 自己拿 audio 去播：**定位说话人不是叙事层的事。**
   * 「幺娃现在在哪儿」要问演员表 / AI / 过场轨道，那些全在装配层手里；
   * Story 一旦自己去找人，就得把半个装配层拖进这个纯规则模块。
   *
   * @param {Function|object} play `({ key, who, position }) => {duration}|number|null`；
   *   也可以传 `{ play, locate }`，其中 `locate(who)` 返回说话人世界坐标。
   *   传 null 解绑（换关、进过场时把话筒收回来）。
   */
  AttachVoice(play, locate = null) {
    if (play && typeof play === "object" && typeof play.play === "function") {
      this.voicePlay = play.play;
      this.voiceLocate = typeof play.locate === "function" ? play.locate : null;
      // stop 只在对象形式里给：换关时要把上一关还在响的那句掐掉，
      // 否则新关的第一句会和旧关的最后一句叠在一起（切黑期间尤其明显）。
      this.voiceStop = typeof play.stop === "function" ? play.stop : null;
      return true;
    }
    this.voicePlay = typeof play === "function" ? play : null;
    this.voiceLocate = typeof locate === "function" ? locate : null;
    this.voiceStop = null;
    return !!this.voicePlay;
  }

  /**
   * 播一条 beat 的语音，返回它的时长（秒）；没有语音就返回 0。
   *
   * 三种「没有」都返回 0 且不报错，因为它们都是**正常状态**：
   * beat 没写 voice、宿主没接线、那条还没烘出音频。
   */
  _Speak(beat) {
    if (!beat.voice || !this.voicePlay) return 0;
    let position = null;
    if (this.voiceLocate) {
      try { position = this.voiceLocate(beat.who) || null; } catch { position = null; }
    }
    let result = null;
    try {
      result = this.voicePlay({ key: beat.voice, who: beat.who || null, position });
    } catch (err) {
      // 宿主那边炸了不该把剧本一起带走：吞掉，留痕，继续演。
      this.voiceLog.push({ key: beat.voice, played: false, error: String(err && err.message || err) });
      return 0;
    }
    if (!result) { this.voiceLog.push({ key: beat.voice, played: false }); return 0; }
    // 宿主可以回 {duration}、回秒数、或者只回个 true（那就查表兜底）。
    const dur = typeof result === "number" ? result
      : (typeof result.duration === "number" ? result.duration : VoiceDurOf(beat.voice));
    this.voiceLog.push({ key: beat.voice, played: true, dur });
    return dur > 0 ? dur : 0;
  }

  /**
   * 接上关中过场通道。宿主给一个「把这一场播出来」的回调，Story 只负责报时机。
   *
   * 与 AttachVoice 同一条理由：**「相机、控制权、指针锁归谁」不是叙事层的事。**
   * 宿主那边是 Script_Main 的 RunCutscene —— 它会夺走控制权、掐掉战斗输入、
   * 播完再还回来；Esc 跳过与字幕补卡由 CutsceneDirector 自己管，与关首过场同一条路。
   *
   * @param {Function} play `(id) => Promise|any|null`。返回 Promise 时剧本推进
   *   会等它 resolve；返回别的（测试桩）就当同步播完。返回 null = 没这场，
   *   记一笔然后**继续演**（不许因为少一场过场把剧本卡死）。
   */
  AttachCutscene(play) {
    this.cutscenePlay = typeof play === "function" ? play : null;
    return !!this.cutscenePlay;
  }

  /** 请求宿主播一场关中过场。返回「有没有真的交出去」。 */
  _RunCutscene(id, source) {
    if (!id) return false;
    if (this.cutsceneFired.has(id)) return false;
    this.cutsceneFired.add(id);
    const entry = { id, source, at: +this.levelTime.toFixed(2), played: false };
    this.cutsceneLog.push(entry);
    if (!this.cutscenePlay) return false;
    let result = null;
    this.cutsceneHold = true;
    try {
      result = this.cutscenePlay(id);
    } catch (err) {
      this.cutsceneHold = false;
      entry.error = String((err && err.message) || err);
      return false;
    }
    if (result === null || result === undefined || result === false) {
      // 宿主说「没这场」：别把剧本挂在一场不存在的过场上。
      this.cutsceneHold = false;
      return false;
    }
    entry.played = true;
    if (typeof result.then === "function") {
      const release = () => { this.cutsceneHold = false; };
      result.then(release, release);
    } else {
      this.cutsceneHold = false;
    }
    return true;
  }

  /** 换关：装载这一关的全部 beats。 */
  BeginLevel(levelId) {
    // 上一关最后一句可能还在响：切黑两秒之后它会盖在新关第一句上面。
    if (this.voiceStop) { try { this.voiceStop(); } catch { /* 宿主的事，别带崩剧本 */ } }
    this.voiceLog = [];
    const level = FindLevel(levelId);
    this.levelId = levelId;
    // sameAsPrev：连着几条写同一个 at 的，作者的意思是「这几句一起来」。
    // 不标出来的话每一条都要各等一遍自己的兜底 —— 实测 L0 那 12 条里有 6 条
    // 是成对的同 at，各等 95 s 的结果是一关跑到头也播不完（冒烟里表现为
    // 「剧本被吞了」，而其实只是排在后面）。标出来之后同组的第二条只等 0.25 s。
    this.queue = level
      ? level.beats.map((b, i) => ({
        ...b, level: levelId,
        sameAsPrev: i > 0 && b.at === level.beats[i - 1].at,
      }))
      : [];
    this.index = 0;
    this.levelTime = 0;
    this.sinceLast = MIN_GAP;      // 开场不要立刻甩台词，让 brief 先说完
    this.beatWait = 0;
    this.fightCount = 0;
    this.fightEndCount = 0;
    this.inFight = false;
    this.fightCooldown = 0;
    this.pushed.clear();
    this.cued.clear();
    this.cutsceneFired.clear();
    this.cutsceneLog = [];
    this.cutsceneHold = false;
    this.flushLog = null;
    this.signalCutscenes = SIGNAL_CUTSCENES[levelId] || null;
    this.objectiveText = level ? level.objective : null;
    return this.queue.length;
  }

  /**
   * 规则层主动推一条事件（真发生过的事优先于时刻表）。
   *
   * 顺带负责**信号 → 关中过场**：本关的 SIGNAL_CUTSCENES 里登记过这个名字的，
   * 推到就请求宿主播那一场。这是 `{type:"cutscene"}` beat 的等价入口 ——
   * 玩法系统只知道「事情发生了」，不该也去关心「这一拍要不要播过场」。
   */
  Signal(name) {
    if (!name) return false;
    this.pushed.add(name);
    const id = this.signalCutscenes && this.signalCutscenes[name];
    if (id) return this._RunCutscene(id, `signal:${name}`);
    return false;
  }

  /** 这个事件到此刻算不算已经发生过（推过的或时刻表判过的）。装配层的钉关放行读它。 */
  Signalled(name) {
    return !!name && (this.pushed.has(name) || this.cued.has(name));
  }

  /** 本关请求过的关中过场（取证：请求了几场、播出来几场）。 */
  get MidCutscenes() { return this.cutsceneLog.slice(); }
  /** 宿主正在播关中过场 —— 这期间剧本不推进。 */
  get CutsceneHold() { return this.cutsceneHold; }

  /** 交火状态：装配层每帧按身边有没有在开枪的敌人喂进来。 */
  SetFighting(fighting) {
    if (fighting && !this.inFight && this.fightCooldown <= 0) {
      this.inFight = true;
      this.fightCount += 1;
      this.fightCooldown = 6;
    } else if (!fighting && this.inFight) {
      this.inFight = false;
      this.fightEndCount += 1;
    }
  }

  get FiredCount() { return this.fired.length; }
  /** 这一关有多少条台词真的有人声（接线自检看它，别看「有没有报错」）。 */
  get VoicedCount() { return this.voiceLog.filter((v) => v.played).length; }
  /** 点了名却没播出来的 key（未烘焙 / 没接线 / 宿主抛异常）。降级是正常的，但要看得见。 */
  get VoiceMisses() { return this.voiceLog.filter((v) => !v.played).map((v) => v.key); }
  get ObjectiveText() { return this.objectiveText; }
  /** 剩下多少条没播 —— 通关冒烟用它判断剧本有没有被吞掉。 */
  get Remaining() { return Math.max(0, this.queue.length - this.index); }
  /** 兜底触发的比例。高了说明关卡节奏与剧本对不上，不是 bug 但要看。 */
  get TimeoutRatio() {
    if (!this.fired.length) return 0;
    return this.fired.filter((f) => f.byTimeout).length / this.fired.length;
  }

  /** 某个事件此刻算不算发生了。 */
  _EventReady(name, ctx) {
    if (this.pushed.has(name)) return true;
    if (this.cued.has(name)) return true;
    const table = LEVEL_CUES[this.levelId];
    const test = table && table[name];
    if (test && test(ctx)) { this.cued.add(name); return true; }
    return false;
  }

  Update(dt, ctx = {}) {
    // 关中过场期间**整条剧本停摆**：关内时钟、间隔、等待一律不走。
    // 不停的话八秒的转身过场里会攒下三四条「到点了」的 beat，播完一口气全甩出来。
    // （装配层的 Frame 在过场分支里本来就 return 了，这一道是给别的宿主与测试的保险。）
    if (this.cutsceneHold) return;
    this.levelTime += dt;
    this.sinceLast += dt;
    this.beatWait += dt;
    if (this.fightCooldown > 0) this.fightCooldown -= dt;

    if (this.index >= this.queue.length) return;
    // 一帧最多播一条：台词叠在一起谁都读不清
    if (this.sinceLast < MIN_GAP) return;

    const full = {
      zone: ctx.zone ?? null,
      objectiveIndex: ctx.objectiveIndex ?? 0,
      objectiveCount: ctx.objectiveCount ?? 1,
      levelTime: this.levelTime,
      levelSeconds: ctx.levelSeconds ?? 600,
      pool: ctx.pool ?? 0,
    };

    const beat = this.queue[this.index];
    const cond = beat._cond
      || (beat._cond = beat.sameAsPrev ? { kind: "after", seconds: 0.25 } : ParseAt(beat.at));
    let ready = false;

    switch (cond.kind) {
      case "after": ready = this.beatWait >= cond.seconds; break;
      case "zone": ready = full.zone === cond.zone; break;
      case "event": ready = this._EventReady(cond.event, full); break;
      case "fight": ready = this.fightCount >= cond.n; break;
      case "fightEnd": ready = this.fightEndCount >= cond.n; break;
      // 收场那一条只在关卡真的要结束时播：目标链走完，或者时间到了九成
      case "end":
        ready = full.objectiveIndex >= full.objectiveCount
          || this.levelTime >= full.levelSeconds * 0.9;
        break;
      default: ready = true;
    }

    // 超时兜底：等不到就直接播。没有这一条，链子会卡死并静默吞掉后面全部剧本。
    const limit = MAX_WAIT[cond.kind] ?? 60;
    const timedOut = limit > 0 && this.beatWait >= limit;
    if (!ready && !timedOut) return;

    this.Play(beat, timedOut && !ready);
    this.index += 1;
    this.beatWait = 0;
  }

  /**
   * 关卡收尾：把还没播的收场旁白一次性倒出来，别让它跟着关卡一起消失。
   *
   * **既有口径不变**：只倒 narration / objective / system / env / title 这几类，
   * 没触发的对话（line/shout）硬塞出来会很怪，照旧跳过。
   *
   * 改的是两件与「吞对白」有关的事（Data_MissionCh1 头注记着这笔账）：
   *   1. **扫描范围有上限**。原来的 while 只数「倒出来几条」，跳过的对话不计数 ——
   *      于是关末还剩三十句没播时，它会一路把三十句全部静默跳过去只为凑够四条旁白。
   *      现在跳过的也计进预算（scanLimit = limit × 8），扫完就停：**没走到的
   *      beat 留在队列里**，而不是被悄悄标成「播过了」。
   *   2. **留痕**。倒了哪几条、跳了哪几条记在 this.flushLog 里；
   *      「验收项目本身播不出来」这类事故只能从这儿看出来，画面上是静默的。
   *
   * 关中钉住（mechanics.pinFinalZone）的那一段与这条无关 —— 钉着的时候
   * AdvanceLevel 根本不会被调到，尾巴上那几十条会在关内按 delay 链正常播完。
   */
  FlushTail(limit = 4) {
    let n = 0;
    let scanned = 0;
    const scanLimit = Math.max(limit, limit * 8);
    const played = [];
    const dropped = [];
    while (this.index < this.queue.length && n < limit && scanned < scanLimit) {
      const beat = this.queue[this.index];
      scanned += 1;
      if (beat.type === "line" || beat.type === "shout") {
        dropped.push({ type: beat.type, who: beat.who || null, text: beat.text || "" });
        this.index += 1;
        continue;
      }
      // 关中过场不许在关末补播：镜头这时候要交给关末过场，两场叠在一起谁都看不成。
      if (beat.type === "cutscene") { this.index += 1; continue; }
      this.Play(beat, true);
      played.push({ type: beat.type, text: beat.text || "" });
      this.index += 1;
      n += 1;
    }
    this.flushLog = { played, dropped, scanned, remaining: this.Remaining };
    return n;
  }

  /**
   * 说一句：先把语音放出去，再按「字幕默认时长」与「音频时长」取长者显示。
   *
   * 两个时间是两件事，不能混：
   *   · 字幕停留 —— 读得完就行，有自己的下限；
   *   · 话筒占用（sinceLast）—— 说完之前不放行下一条，否则长句会被下一句打断。
   * 没有语音时这个函数与改造前逐字等价（默认时长、MIN_GAP 照旧）。
   */
  _Speech(speaker, beat, seconds, variant = "") {
    const dur = this._Speak(beat);
    const shown = dur > 0 ? Math.min(SUBTITLE_MAX, Math.max(seconds, dur + SUBTITLE_TAIL)) : seconds;
    this.hud.Say(speaker, beat.text, shown, variant);
    // sinceLast 是**倒扣**的：置成负数就等于让下一条多等这么久
    //（Update 里的闸是 sinceLast < MIN_GAP 就不放行）。
    const hold = dur > 0 ? Math.min(VOICE_HOLD_MAX, dur + VOICE_HOLD_TAIL) : 0;
    this.sinceLast = hold > MIN_GAP ? MIN_GAP - hold : 0;
    return dur;
  }

  Play(beat, byTimeout) {
    const who = beat.who ? CAST[beat.who] : null;
    const speaker = who ? (who.short || who.name) : null;
    switch (beat.type) {
      case "title":
        this.hud.Title(beat.text, beat.sub || "");
        this.sinceLast = 0;
        break;
      case "line":
        this._Speech(speaker, beat, 4.2);
        break;
      case "shout": {
        const spoken = this._Speech(speaker, beat, 3.4, "shout");
        // 哨子是「没有配音时的喊话替身」。真有人声了还叠一声哨，
        // 等于在台词上盖一层噪音 —— 有语音就不吹。
        if (this.audio && !spoken) this.audio.Play("whistle", { volume: 0.35 });
        break;
      }
      case "narration":
        this._Speech(null, beat, 4.8);
        break;
      // env：环境描写。没有说话的人，语气也不是旁白点评，走同一条字幕但更长一点
      case "env":
        this._Speech(null, beat, 5.4);
        break;
      // system：机制播报（「城里还站着的人 ＋132」「弹药：无。」）。
      // 走字幕而不是 Hint —— 这几条是**剧本里的一句**，通关冒烟要在 spoken 里找到它。
      case "system":
        this.hud.Say(null, beat.text, 3.6, "system");
        this.sinceLast = 0;
        break;
      // 临时关掉：剧情层级的底部一次性提示（"主武器是手榴弹。子弹要省，命更要省"等
      // 共 19 条，分散在 Data_TengxianScript.mjs / Data_Script.mjs 里）。机制反馈
      // （按 R 压弹 / 没有手榴弹了 等）走 hud.Hint 另一条调用，保留显示；这里只
      // 抑制剧本教学提示，画面太满。fired 仍照常记录，PlayTest 不会受影响。
      case "hint":
        // this.hud.Hint(beat.text, 5.5);
        break;
      case "objective":
        this.objectiveText = beat.text;
        break;
      // cutscene：**关中**过场。`{ at, type:"cutscene", id:"CS_x" }`。
      // 派发到它时请求宿主播那一场 —— 宿主负责夺控制权、掐战斗输入、播完还回来；
      // Esc 跳过与字幕补卡的语义与关首过场完全一致（同一个 CutsceneDirector）。
      // 没接线 / 没这场时只记一笔，剧本照走：少一场过场不该把一关卡死。
      case "cutscene":
        this._RunCutscene(beat.id || beat.cutscene || beat.text, `beat:${beat.at || "?"}`);
        this.sinceLast = 0;
        break;
      default:
        break;
    }
    this.fired.push({
      level: beat.level, type: beat.type, who: beat.who || null,
      at: beat.at || null, tier: beat.tier || null, voice: beat.voice || null,
      id: beat.id || null,
      text: beat.text || "", byTimeout: !!byTimeout,
    });
  }

  /** 关表（选章用）。 */
  static get Levels() { return LEVELS; }
  static get Menu() { return MENU; }
  static get Credits() { return CREDITS; }
}

export default StoryDirector;
