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

import { LEVELS, CAST, MENU, CREDITS, FindLevel } from "./Data_TengxianScript.mjs";

/**
 * 关内事件线：`event:名字` 什么时候算发生了。
 *
 * 为什么放在叙事层而不是装配层：这些条件全是**叙事上的时刻**
 *（「天亮了」「塔被占了」「西门楼丢了」），不是战斗规则。
 * 装配层只负责每帧递一份运行时上下文（走到第几个路标、关内多少秒、
 * 身边打起来没有），由这里判定叙事时刻到没到。
 *
 * 装配层仍可以用 Signal(name) 主动推一条（例如第一发炮弹真落下来时推 FirstBarrage），
 * 推过的优先 —— 真发生过的事永远比时刻表准。
 *
 * ctx: { zone, objectiveIndex, objectiveCount, levelTime, levelSeconds, pool }
 */
const LEVEL_CUES = {
  L0_Jiehe: {
    // 第一轮炮击：装配层在第一发落弹时会 Signal 一次；这里给一个时刻兜底
    FirstBarrage: (c) => c.levelTime > 55 || c.objectiveIndex >= 1,
  },
  L1_Beishahe: {
    // 收容第 127 师 757 团残部：走到第二线阵地并把「挖」那一段做完
    Regroup: (c) => c.objectiveIndex >= 1,
    // 十五日十三时界河正面被突破
    JieheFall: (c) => c.objectiveIndex >= 2 || c.levelTime > c.levelSeconds * 0.38,
  },
  L2_Dongguan: {
    // 寺院地：日方要图称之为「敌之有力据点」
    TempleHold: (c) => c.zone === "Temple" || c.objectiveIndex >= 2,
    // 十七时的第六次攻势 —— 这一次守不住
    BreachLost: (c) => c.objectiveIndex >= 3 || c.levelTime > c.levelSeconds * 0.86,
  },
  L3_Fanji: {
    GateRetaken: (c) => c.zone === "GateRetake" || c.objectiveIndex >= 2,
    // 二十一时王铭章决心放弃城外阵地
    Order2100: (c) => c.objectiveIndex >= 3 || c.levelTime > c.levelSeconds * 0.62,
  },
  L4_Chengqiang: {
    // 三月十七日十时，日军观测班占领城东龙泉塔。落弹从这一刻起跟着你走。
    TowerTaken: (c) => c.levelTime > 240 || c.objectiveIndex >= 1,
    // 十四时南城墙被重炮轰开大缺口
    SouthBreach: (c) => c.objectiveIndex >= 2,
    MoveToSouth: (c) => c.objectiveIndex >= 2,
  },
  L5_Shizijie: {
    // 十七时日军夺取西城门楼，占领后即向十字街口扫射
    WestTowerLost: (c) => c.objectiveIndex >= 2 || c.levelTime > c.levelSeconds * 0.42,
    EscortHQ: (c) => c.objectiveIndex >= 3,
  },
  L6_Beimen: {
    // 这一关开局武器栏就是空的
    NoAmmo: (c) => c.objectiveIndex >= 1 || c.levelTime > 20,
    Out: (c) => c.objectiveIndex >= 3,
  },
};

/**
 * 各类触发式等不到时的兜底上限（秒）。
 * zone 给得最宽 —— 走到某个路标是玩家自己的事；event 次之；
 * delay/start 本来就是时间条件，兜底等于它自己。
 */
const MAX_WAIT = { after: 0, zone: 95, event: 80, fight: 70, fightEnd: 85, end: 1e9 };
const MIN_GAP = 2.0;              // 两条台词之间的最小间隔，不然会叠成一团

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
  }

  /** 换关：装载这一关的全部 beats。 */
  BeginLevel(levelId) {
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
    this.objectiveText = level ? level.objective : null;
    return this.queue.length;
  }

  /** 规则层主动推一条事件（真发生过的事优先于时刻表）。 */
  Signal(name) {
    if (name) this.pushed.add(name);
  }

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

  /** 关卡收尾：把还没播的收场旁白一次性倒出来，别让它跟着关卡一起消失。 */
  FlushTail(limit = 4) {
    let n = 0;
    while (this.index < this.queue.length && n < limit) {
      const beat = this.queue[this.index];
      // 只倒 narration / objective / system 这几类；没触发的对话硬塞出来会很怪
      if (beat.type === "line" || beat.type === "shout") { this.index += 1; continue; }
      this.Play(beat, true);
      this.index += 1;
      n += 1;
    }
    return n;
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
      case "narration":
        this.hud.Say(null, beat.text, 4.8);
        this.sinceLast = 0;
        break;
      // env：环境描写。没有说话的人，语气也不是旁白点评，走同一条字幕但更长一点
      case "env":
        this.hud.Say(null, beat.text, 5.4);
        this.sinceLast = 0;
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
      default:
        break;
    }
    this.fired.push({
      level: beat.level, type: beat.type, who: beat.who || null,
      at: beat.at || null, tier: beat.tier || null,
      text: beat.text || "", byTimeout: !!byTimeout,
    });
  }

  /** 关表（选章用）。 */
  static get Levels() { return LEVELS; }
  static get Menu() { return MENU; }
  static get Credits() { return CREDITS; }
}

export default StoryDirector;
