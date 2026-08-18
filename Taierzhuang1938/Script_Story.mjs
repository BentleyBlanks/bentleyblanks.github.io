// 《血战台儿庄》叙事层：把 Data_Script.mjs 那本考据过的剧本派发进开放战场。
//
// 为什么需要这一层：剧本是照「线性关卡」写的，触发式是 zone:Rampart / wave:2 /
// event:MengDown 这类东西；而战场已经改成了 Easy Red 2 式的开放地图 + 占领点 + 战役阶段。
// 两套坐标系对不上，于是那 20 KB 台词一行都没进游戏 —— 数据在，玩不到，等于没做。
//
// 这一层只做翻译与调度，**不改一个字的台词**。史实与措辞是考据定下的
// （见 docs/Data_HistoryQuotes.md 的台词分级速查），这里没有资格动它。
//
// ── 核心机制：带超时兜底的顺序链 ──────────────────────────────────────────
// 剧本按作者写的顺序排成一条链，每条卡在自己的条件上；条件满足就播，然后轮到下一条。
// **每条都有 maxWait**：等超了就直接播。
// 这一条不是偷懒，是这套设计能不能用的关键 —— 开放战场里玩家完全可能永远不走进
// 清真寺、永远不打死那辆战车。没有兜底的话，链子会卡在那一条上，
// 后面整本剧本被静默吞掉，而且日志上什么都看不出来（最难查的一类 bug）。
// 有了兜底，最坏情况是「台词按时间流出来」，仍然是完整的一本。

import { LEVELS, CAST, MENU } from "./Data_Script.mjs";
import { HISTORY_NOTES, EPILOGUE_LINES, BATTLE_TIMELINE } from "./Data_History.mjs";

/**
 * 战役阶段 -> 剧本段落。
 * L4_LastFiveMinutes 一段横跨两个阶段：反攻信号之前属「三分之二」，之后属「全线反攻」，
 * 所以按 event:Signal 那条切开。
 */
const PHASE_SOURCE = {
  P1_Wall: [{ level: "L0_Wall" }],
  P2_Breach: [{ level: "L1_Breach" }],
  // L2_RoomWar 从清真寺守住那一刻切开：后半段是「断浮桥」，
  // 而断浮桥在史实上属于四月上旬背水死守那个语境，不属于三月二十八日的西北角危局。
  // 顺带也把 P3 那一段的长度压到它自己的时长装得下的量 ——
  // 一段四十条的剧本塞进五分钟，后半本永远轮不到播。
  P3_NorthWest: [{ level: "L2_RoomWar", until: "waveClear:5" }],
  P4_Raid: [{ level: "L3_WhiteTowel" }],
  P5_LastFive: [
    { level: "L2_RoomWar", from: "waveClear:5" },
    { level: "L4_LastFiveMinutes", until: "event:Signal" },
  ],
  P6_Counter: [
    { level: "L4_LastFiveMinutes", from: "event:Signal" },
    { level: "L5_Morning" },
  ],
};

/**
 * 触发式翻译表：线性关卡的 at -> 开放战场的条件。
 *
 * zone 一律映射到占领点 id（Data_Battle.OBJECTIVES），因为占领点是这张图上
 * 唯一「玩家会主动去、而且到了会知道自己到了」的地方。
 * wave:N / waveClear:N 映射到「第 N 次交火」—— 开放战场没有编排好的波次，
 * 但身边打起来这件事是有的，而且节奏上正好对得上原来的波次感。
 */
const ZONE_TO_OBJECTIVE = {
  Rampart: "NorthGate",
  Alley: "NorthEast",
  Courtyard: "WenchangPavilion",
  Mosque: "Mosque",
  Ruin: "Station",
  End: "SouthGate",
  Approach: "NorthWest",
  Posts: "NorthWest",
};

/** 原剧本里那些「关卡脚本才有」的事件，在开放战场里找一个语义最近的替身。 */
const EVENT_ALIAS = {
  FirstShell: "shelling",         // 第一次挨炮
  MengDown: "allyDown",           // 身边有人倒下
  FirstBreach: "closeFight",      // 第一次贴脸交火（原意是第一次凿墙）
  TankIn: "vehicleSeen",
  TankDead: "vehicleDead",
  TowelOn: "phaseStart",          // 夜袭阶段一开始就缠毛巾
  PoemRead: "afterTowel",
  Sneak: "zoneNorthWest",
  Alarm: "closeFight",
  LiuDown: "allyDown",
  QinDown: "allyDown",
  Signal: "counterattack",
};

const DEFAULT_MAX_WAIT = 9;
const MIN_GAP = 2.0;              // 两条台词之间的最小间隔，不然会叠成一团

function TranslateAt(at) {
  if (!at) return { kind: "after", seconds: 1.2, maxWait: 4 };
  if (at === "start") return { kind: "after", seconds: 1.2, maxWait: 4 };
  if (at === "end") return { kind: "after", seconds: 3.0, maxWait: 8 };
  if (at.startsWith("delay:")) {
    const s = parseFloat(at.slice(6)) || 2;
    return { kind: "after", seconds: s, maxWait: s + 3 };
  }
  if (at.startsWith("zone:")) {
    const zone = at.slice(5);
    // 走到某个占领点是玩家自己的事，多给一点耐心；但也不能无限等
    return { kind: "zone", objective: ZONE_TO_OBJECTIVE[zone] || null, maxWait: 15 };
  }
  if (at.startsWith("event:")) {
    return { kind: "event", event: EVENT_ALIAS[at.slice(6)] || at.slice(6), maxWait: DEFAULT_MAX_WAIT };
  }
  if (at.startsWith("waveClear:")) {
    return { kind: "fightEnd", n: parseInt(at.slice(10), 10) || 1, maxWait: DEFAULT_MAX_WAIT + 5 };
  }
  if (at.startsWith("wave:")) {
    return { kind: "fight", n: parseInt(at.slice(5), 10) || 1, maxWait: DEFAULT_MAX_WAIT };
  }
  if (at.startsWith("waveProgress:")) {
    return { kind: "fight", n: parseInt(at.split(":")[1], 10) || 1, maxWait: DEFAULT_MAX_WAIT };
  }
  if (at === "sentriesAlerted") return { kind: "event", event: "closeFight", maxWait: DEFAULT_MAX_WAIT };
  if (at === "vehicleDead") return { kind: "event", event: "vehicleDead", maxWait: DEFAULT_MAX_WAIT };
  if (at.startsWith("playerBreach")) return { kind: "event", event: "closeFight", maxWait: DEFAULT_MAX_WAIT };
  return { kind: "after", seconds: 4, maxWait: 10 };
}

/** 取一段剧本的 beats（可按某个 at 切开）。 */
function SliceBeats(levelId, { from, until } = {}) {
  const level = LEVELS.find((l) => l.id === levelId);
  if (!level) return [];
  let beats = level.beats;
  if (from) {
    const i = beats.findIndex((b) => b.at === from);
    if (i >= 0) beats = beats.slice(i);
  }
  if (until) {
    const i = beats.findIndex((b) => b.at === until);
    if (i >= 0) beats = beats.slice(0, i);
  }
  return beats.map((b) => ({ ...b, level: levelId }));
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
    this.phaseTime = 0;
    this.sinceLast = 99;
    this.beatWait = 0;
    this.fightCount = 0;
    this.fightEndCount = 0;
    this.inFight = false;
    this.fightCooldown = 0;
    this.pending = new Set();          // 本帧收到的事件
    this.fired = [];                   // 播过的 beats（测试断言看这个）
    this.objectiveText = null;
    this.phaseId = null;
    this.towelTime = -99;
  }

  /** 换阶段：装载这一段的剧本。 */
  BeginPhase(phaseId) {
    const sources = PHASE_SOURCE[phaseId] || [];
    this.queue = sources.flatMap((s) => SliceBeats(s.level, s));
    this.index = 0;
    this.phaseTime = 0;
    this.sinceLast = MIN_GAP;          // 开场不要立刻甩台词，让 brief 先说完
    this.beatWait = 0;
    this.fightCount = 0;
    this.fightEndCount = 0;
    this.inFight = false;
    this.pending.clear();
    this.phaseId = phaseId;
    this.pending.add("phaseStart");
    return this.queue.length;
  }

  /** 规则层派发事件。名字见 EVENT_ALIAS 的值。 */
  Signal(name) {
    if (!name) return;
    this.pending.add(name);
    if (name === "afterTowelSource") this.towelTime = this.phaseTime;
  }

  /** 交火状态：由 Main 每帧根据身边有没有在开枪的敌人喂进来。 */
  SetFighting(fighting) {
    if (fighting && !this.inFight && this.fightCooldown <= 0) {
      this.inFight = true;
      this.fightCount += 1;
      this.fightCooldown = 6;
      this.pending.add("closeFight");
    } else if (!fighting && this.inFight) {
      this.inFight = false;
      this.fightEndCount += 1;
    }
  }

  get FiredCount() { return this.fired.length; }
  get ObjectiveText() { return this.objectiveText; }
  /** 剩下多少条没播 —— 通关冒烟用它判断剧本有没有被吞掉。 */
  get Remaining() { return Math.max(0, this.queue.length - this.index); }

  Update(dt, ctx) {
    this.phaseTime += dt;
    this.sinceLast += dt;
    this.beatWait += dt;
    if (this.fightCooldown > 0) this.fightCooldown -= dt;

    // 一帧最多播一条：台词叠在一起谁都读不清
    if (this.index >= this.queue.length) { this.pending.clear(); return; }
    if (this.sinceLast < MIN_GAP) { this.pending.clear(); return; }

    const beat = this.queue[this.index];
    const cond = beat._cond || (beat._cond = TranslateAt(beat.at));
    let ready = false;

    switch (cond.kind) {
      case "after":
        ready = this.beatWait >= cond.seconds;
        break;
      case "zone":
        ready = !!(cond.objective && ctx.playerZone === cond.objective);
        break;
      case "event":
        ready = this.pending.has(cond.event);
        // afterTowel 是「缠上毛巾之后」，没有独立事件源，用阶段时间兜
        if (!ready && cond.event === "afterTowel") ready = this.phaseTime > 12;
        if (!ready && cond.event === "zoneNorthWest") ready = ctx.playerZone === "NorthWest";
        break;
      case "fight":
        ready = this.fightCount >= cond.n;
        break;
      case "fightEnd":
        ready = this.fightEndCount >= cond.n;
        break;
      default:
        ready = true;
    }

    // 超时兜底：等不到就直接播。没有这一条，链子会卡死并静默吞掉后面全部剧本。
    const timedOut = this.beatWait >= (cond.maxWait ?? DEFAULT_MAX_WAIT);
    if (!ready && !timedOut) { this.pending.clear(); return; }

    this.Play(beat, timedOut && !ready);
    this.index += 1;
    this.beatWait = 0;
    this.pending.clear();
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
        this.hud.Say(speaker, beat.text, 4.2);
        this.sinceLast = 0;
        break;
      case "shout":
        this.hud.Say(speaker, beat.text, 3.4, "shout");
        this.sinceLast = 0;
        if (this.audio) this.audio.Play("whistle", { volume: 0.35 });
        break;
      case "phone":
        // 总司令对师长的命令是从听筒里传出来的 —— 指挥层级不能演成面对面喊话
        this.hud.Say(`${speaker}（听筒）`, beat.text, 4.6);
        this.sinceLast = 0;
        break;
      case "narration":
        this.hud.Say(null, beat.text, 4.8);
        this.sinceLast = 0;
        break;
      case "hint":
        this.hud.Hint(beat.text, 5.5);
        break;
      case "note": {
        const note = HISTORY_NOTES[beat.note];
        if (note) this.hud.Note(note);
        break;
      }
      case "objective":
        this.objectiveText = beat.text;
        break;
      case "epilogue":
        this.hud.ShowEpilogue(EPILOGUE_LINES);
        this.sinceLast = 6;
        break;
      case "delay":
        this.sinceLast = 0;
        break;
      default:
        break;
    }
    this.fired.push({
      level: beat.level, type: beat.type, who: beat.who || null,
      text: beat.text || beat.note || "", byTimeout: !!byTimeout,
    });
  }

  /** 阶段开场的史实时间线一行（HUD 顶栏用）。 */
  static TimelineFor(phaseIndex) {
    return BATTLE_TIMELINE.filter((t) => t.level === phaseIndex);
  }

  static get Menu() { return MENU; }
}
