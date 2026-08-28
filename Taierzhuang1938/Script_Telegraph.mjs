// 《滕县 一九三八》发报 —— 终章「最后一封」阶段 4：玩家亲手把最后一封电报发出去。
//
// **纯规则，不许 import three。** 「发到第几组了、接头断没断、按这一下算不算数」
// 与画面无关，所以整条流程在纯 Node 里跑得完（回归口 `Script_TelegraphTest.mjs`）。
// 屏幕上那张报码纸在 `Script_Hud.SetTelegraph`，只读本层的脱敏快照。
//
// ── 这一段为什么不做成一段过场 ──────────────────────────────────────────────
// docs/Data_MissionRemake.md §7 阶段 4 与过场节都写死了同一条：
// **「玩家亲手发报」「玩家亲手发报不切三人称」**。整章的因果（普通人的故事
// 通过通信链汇入王铭章最后电报）压在玩家手指头上那几下 —— 交给过场演，
// 这一章就只剩看别人打字。所以本层从头到尾**不夺控制权**：
//   · 玩家可以中途走开去做别的事，进度**原样保留**（本层不认识位置，
//     够不够得着是 Script_Interact 的判据；走开只是按不到那个点而已）；
//   · 没有任何计时器会因为玩家没按而失败 —— 发报不是 QTE。
//
// ── 不搞真摩尔斯 ────────────────────────────────────────────────────────────
// 电键真要按谱敲，玩家就得先背一张码表。任务书的口径是「从简」：
// **按一下发一个码组**，一组四位（Data_MissionCh6 头注 ENGINE_REQUEST 1
// 与关内那条 system 提示「电键：按住发长码，点一下发短码。一组四位。」）。
// 节奏感全靠音效：按一下之后 `telegraphKey` 的三个变体按 `ditGapS` 连出
// 两到三声「嗒」，那几百毫秒里报码纸上那一组是「正在发」的状态。
// 三个变体**顺序轮播不随机**（Data_SfxSources 的 TelegraphKey 头注原话：
// 「不能靠随机挑（会连出两次同一条）」）。
//
// ── 中断与重连 ──────────────────────────────────────────────────────────────
// §7：「炮击致接头松脱、重新连接、完成最后一组」。所以断线是**脚本推的**，
// 不是掷骰子：`ForceDisconnect()` 由炮击那一拍调，或者由 `breakAfterGroup`
// 排在固定的第几组之后（Data_MissionCh6.EVENTS 的 WireBreak 明写
// 「断线要发生在第二组与最后一组之间，不能落在「发毕」以后」——
// 所以 `breakAfterGroup` 会被夹在 [1, total−1]）。
// 重连走 S1 交互框架的 **hold 手势**（`TelegraphReconnectInteraction`，1.2 s）：
// 松手进度退回去但不清零 —— 手抖一下不该从头再接一次。
//
// ── 音效 ────────────────────────────────────────────────────────────────────
// 两条 key（telegraphKey 三变体 / telegraphHum 一条 loop）由 A2 批登记在
// `Data_SfxSources`，**2026-08-29 集成批 INT3a 已经接线完毕**：合成配方补齐、
// 素材从 `manifest.pendingCues` 毕业进 `cues`，`audio.Play` 现在会真的出声。
// 备胎那条路（TELEGRAPH_SFX）保留不动 —— 它不是给「还没接线」用的，是给
// 「这一台机器上采样没载到 / 音频关掉了」用的：第一次播不响就换备胎并记住，
// 与 Script_AircraftStrafe 同一条写法。电键那条的备胎是 `grenadePin`，
// 这是 Data_MissionCh6 头注「现在拿 grenadePin 顶」定下的口径，不是随手挑的。
//
// ── 给集成批的 CH6 摆点示例（坐标照 Data_MissionCh6.CHAPTER.zones）──────────
//
//   import {
//     TelegraphSystem, MakeTelegraphHost,
//     TelegraphKeyInteraction, TelegraphReconnectInteraction,
//   } from "./Script_Telegraph.mjs";
//
//   // 电台桌摆在城内临时师部 C6_DivisionHq (-58, -55) 的屋里。
//   // 码组是**章节数据**，不是引擎数字：这五组由 C6 批填（不给就按种子出五组）。
//   telegraph.BeginTelegraph({
//     id: "ch6_lastwire", label: "最后一封",
//     groups: ["2429", "1560", "3016", "0022", "4837"],
//     position: { x: -54, y: 0, z: -58 },
//     breakAfterGroup: 2,                      // 炮击落在第二组与最后一组之间
//     OnGroup: (i) => hud.Hint(`第${i}组　对上了。`, 2.2),
//     OnDisconnect: () => story.Signal("WireBreak"),
//     OnComplete: () => story.Signal("WireSent"),   // 「发毕。」由 beats 说，不在这儿
//   });
//
//   // 两个交互点一次摆齐：能不能按由各自的 Enabled 判（断了才出现「接接头」）。
//   T.interact.Register(TelegraphKeyInteraction({
//     tag: "CH6_Zuihou", telegraph, position: { x: -54, y: 0, z: -58 },
//   }));
//   T.interact.Register(TelegraphReconnectInteraction({
//     tag: "CH6_Zuihou", telegraph, position: { x: -54.6, y: 0, z: -58.4 },
//   }));

import { Mulberry32, Clamp, Clamp01 } from "./Script_Noise.mjs";

/**
 * 五个状态。
 *   idle      没有在发报
 *   ready     等玩家按电键（报码纸挂着，玩家爱什么时候按什么时候按）
 *   sending   一组正在发出去（两到三声「嗒」的那几百毫秒）
 *   broken    接头松了 —— 按电键没用，先去把接头按回去
 *   done      全部码组发完
 */
export const TELEGRAPH_PHASES = Object.freeze(["idle", "ready", "sending", "broken", "done"]);

/**
 * 六个节拍（`OnBeat(beat, view)` 的第一个参数，也是 `signals` 表的键）。
 *   begin      开始发报
 *   first      **第一组**发完（CH6 EVENTS 的 KeySeated 挂这里）
 *   group      每一组发完（first 那一次两条都推）
 *   break      接头松脱（WireBreak）
 *   reconnect  接头接回去了
 *   complete   最后一组发完（WireSent）——「发毕。」由章节 beats 说，本层不说话
 */
export const TELEGRAPH_BEATS = Object.freeze(["begin", "first", "group", "break", "reconnect", "complete"]);

/**
 * 音效档案。每条两个名字：**先播 A2 批那条实录，播不响就退到现有最近的源**。
 *   telegraphKey ← grenadePin  Data_MissionCh6 头注定的口径（「现在拿 grenadePin 顶」）：
 *                              短、干、带一点金属余韵，是库里离黄铜电键最近的一条
 *   telegraphHum ← （无）      **没有可循环的合成电流声，宁可没有**：
 *                              拿别的音顶一条持续底噪，听感上是「屋里多了一台冰箱」
 *
 * `loopEveryS` 是底噪的重触发间隔：Script_Audio 的 `Play` 没有 loop 语义，
 * 所以按素材自己的长度（6.00 s）重触发，留一点重叠。
 */
export const TELEGRAPH_SFX = Object.freeze({
  key: { names: ["telegraphKey", "grenadePin"], volume: 0.75 },
  hum: { names: ["telegraphHum"], volume: 0.32, loopEveryS: 5.6 },
});

/**
 * 默认值。数值只在这里；文档写常量名不抄数（AGENTS 硬规矩 12）。
 *
 * digitsPerGroup   一组几位。四位是 §7 与关内那条 system 提示写死的。
 * groupCount       不给 groups 时按种子出几组。
 * ditsMin/ditsMax  按一下响几声「嗒」。**两到三声**：一声太像点鼠标，
 *                  四声以上玩家会以为自己按错了。逐组在这个区间里走
 *                  （确定性地走，不掷骰子 —— 见 DitsFor）。
 * ditGapS          两声「嗒」之间隔多久。0.16 s ≈ 每分钟 375 下，
 *                  一个熟手电报员的手速量级；再快就成了打字机。
 * groupCooldownS   一组发完到下一组能按之间的间隔。它同时是交互点的 cooldown ——
 *                  没有它，玩家按住 F 连点能在半秒里把整封电报发完。
 * reconnectS       重新接上接头要按多久（Data_MissionCh6 ENGINE_REQUEST 1 写的 1.2 s）。
 * humLoopEveryS    底噪重触发间隔。
 * breakAfterGroup  在第几组之后自动断一次（null = 不自动断，等脚本调）。
 *                  会被夹进 [1, total−1]：断在「发毕」以后就没有重连这一段戏了。
 */
export const TELEGRAPH_DEFAULTS = Object.freeze({
  digitsPerGroup: 4,
  groupCount: 5,
  ditsMin: 2,
  ditsMax: 3,
  ditGapS: 0.16,
  groupCooldownS: 0.42,
  reconnectS: 1.2,
  humLoopEveryS: 5.6,
  breakAfterGroup: null,
  label: "报码纸",
  keyLabel: "按电键发下一组",
  reconnectLabel: "按住接回接头",
});

/** 默认信号名，与 `Data_MissionCh6.EVENTS` 的 id 逐条对应。 */
export const TELEGRAPH_SIGNALS = Object.freeze({
  first: "KeySeated",
  break: "WireBreak",
  complete: "WireSent",
});

// ---------------------------------------------------------------------------
// 小工具（全是纯算术；本层一个 three 类型都不碰）
// ---------------------------------------------------------------------------

function Num(value, fallback) {
  const v = Number(value);
  return Number.isFinite(v) ? v : fallback;
}

/**
 * 没给码组时按种子出一串四位数码组。
 * **不是 Math.random**：同一个种子每次跑出同一封电报，出图与冒烟才比得了
 * （AGENTS 的确定性纪律）。真正的电文是章节数据，这里只是让引擎自己也跑得起来。
 */
function MakeGroups(count, digits, seed) {
  const rnd = Mulberry32(seed >>> 0);
  const out = [];
  for (let i = 0; i < count; i += 1) {
    let code = "";
    for (let d = 0; d < digits; d += 1) code += String(Math.floor(rnd() * 10));
    out.push(code);
  }
  return out;
}

// ---------------------------------------------------------------------------
// 系统
// ---------------------------------------------------------------------------

/**
 * host 是装配层注入的窄接口（同 CarrySystem / EmplacementSystem / 扫射航线的约定）。
 * 每一条都是可选的：全不给也跑得完整封电报（纯规则测试就是这么跑的）。
 *
 *   Time() -> number                 关内秒表（取证用）
 *   Play(name, opts) -> voice|null   放一条音效；返回假值 = 这条没响
 *   Stop(voice)                      掐掉一条还在响的（底噪收尾用；不给就让它自己响完）
 *   Hint(text, seconds)              HUD 一次性提示
 *   Say(who, text, seconds)          让人喊一句
 *   Signal(name)                     推一条 story 事件
 *   PlayerPos() -> {x,y,z}           取证用（玩家是不是还站在电台边上）
 */
export class TelegraphSystem {
  constructor(host = {}, opts = {}) {
    this.host = host;
    /** 当前这一封。null = 没有在发报。 */
    this.run = null;
    this.serial = 0;
    /** 三个「嗒」变体顺序轮播的游标（不随机 —— 见文件头）。 */
    this.ditCursor = 0;
    /** 音效解析结果：哪条 key 真的响过。一条只解析一次。 */
    this.sfxPick = new Map();
    this.humVoice = null;
    this.stats = {
      sessions: 0, completed: 0, aborted: 0,
      groups: 0, keys: 0, refused: 0, breaks: 0, reconnects: 0, dits: 0,
    };
    /** 最后一封走完的取证记录。 */
    this.lastRun = null;
    this.seed = Num(opts.seed, 19380317) >>> 0;
  }

  get Active() { return !!this.run && this.run.phase !== "done"; }
  get Phase() { return this.run ? this.run.phase : "idle"; }
  get Broken() { return !!this.run && this.run.phase === "broken"; }
  get Sending() { return !!this.run && this.run.phase === "sending"; }
  /**
   * 现在按电键算不算数。交互点的 Enabled 读它 —— 按不了就整条不出现，不给灰提示。
   *
   * **组间冷却也算「按不了」**：交互点自己那份 `cooldownS` 是在 Register 那一刻
   * 拷进去的，章节要是把 `groupCooldownS` 调大，两份冷却就对不上 ——
   * 表现成「提示亮着，按下去没反应」。以规则层这一份为准，那一份只当保险。
   */
  get CanKey() {
    return !!this.run && this.run.phase === "ready" && this.run.cooldownLeft <= 0;
  }
  get Sent() { return this.run ? this.run.sent : 0; }
  get Total() { return this.run ? this.run.groups.length : 0; }
  get Progress() { return this.Total ? this.Sent / this.Total : 0; }
  get Done() { return !!this.run && this.run.phase === "done"; }

  Time() { return Num(this.host.Time?.(), 0); }

  // -------------------------------------------------------------------------
  // 主 API
  // -------------------------------------------------------------------------

  /**
   * 开一封电报。
   *
   * @param {object} spec
   *   id / label        取证与 HUD 用
   *   groups            码组数组（章节数据）；不给就按 groupCount + 种子生成
   *   groupCount        不给 groups 时出几组
   *   position          电键在哪儿（取证与音效定位用；**判距离是交互层的事**）
   *   breakAfterGroup   在第几组之后自动断一次（夹进 [1, total−1]）
   *   ditGapS / groupCooldownS / reconnectS   见 TELEGRAPH_DEFAULTS
   *   signals           { first, break, reconnect, complete } → host.Signal(name)
   *   OnBegin / OnGroup(index, view) / OnDisconnect / OnReconnect / OnComplete(summary)
   *   OnBeat(beat, view)
   * @returns {string|null} 这一封的 id；开不起来返回 null
   */
  BeginTelegraph(spec = {}) {
    if (this.run && this.run.phase !== "done") { this.stats.refused += 1; return null; }
    const cfg = { ...TELEGRAPH_DEFAULTS, ...spec };
    const digits = Math.max(1, Math.round(Num(cfg.digitsPerGroup, TELEGRAPH_DEFAULTS.digitsPerGroup)));
    let groups = Array.isArray(cfg.groups) && cfg.groups.length
      ? cfg.groups.map((g) => String(g))
      : MakeGroups(
        Math.max(1, Math.round(Num(cfg.groupCount, TELEGRAPH_DEFAULTS.groupCount))),
        digits, this.seed + this.serial * 7919);
    if (!groups.length) { this.stats.refused += 1; return null; }

    this.serial += 1;
    const total = groups.length;
    // 断线夹在 [1, total−1]：断在第一组之前玩家还没上手，断在「发毕」以后
    // 就没有「我接！莫断！」那一段了（Data_MissionCh6.EVENTS 的 WireBreak 原话）。
    const rawBreak = cfg.breakAfterGroup;
    const breakAfterGroup = rawBreak == null || total < 2
      ? null : Clamp(Math.round(Number(rawBreak) || 0), 1, total - 1);

    this.run = {
      id: String(cfg.id ?? `wire${this.serial}`),
      label: String(cfg.label || TELEGRAPH_DEFAULTS.label),
      groups,
      total,
      sent: 0,
      phase: "ready",
      position: cfg.position ? { x: Num(cfg.position.x, 0), y: Num(cfg.position.y, 0), z: Num(cfg.position.z, 0) } : null,
      ditGapS: Math.max(0.02, Num(cfg.ditGapS, TELEGRAPH_DEFAULTS.ditGapS)),
      ditsMin: Math.max(1, Math.round(Num(cfg.ditsMin, TELEGRAPH_DEFAULTS.ditsMin))),
      ditsMax: Math.max(1, Math.round(Num(cfg.ditsMax, TELEGRAPH_DEFAULTS.ditsMax))),
      groupCooldownS: Math.max(0, Num(cfg.groupCooldownS, TELEGRAPH_DEFAULTS.groupCooldownS)),
      reconnectS: Math.max(0.1, Num(cfg.reconnectS, TELEGRAPH_DEFAULTS.reconnectS)),
      humLoopEveryS: Math.max(0.5, Num(cfg.humLoopEveryS, TELEGRAPH_DEFAULTS.humLoopEveryS)),
      keyLabel: String(cfg.keyLabel || TELEGRAPH_DEFAULTS.keyLabel),
      reconnectLabel: String(cfg.reconnectLabel || TELEGRAPH_DEFAULTS.reconnectLabel),
      breakAfterGroup,
      breakUsed: false,
      signals: { ...TELEGRAPH_SIGNALS, ...(cfg.signals || {}) },
      OnBegin: typeof cfg.OnBegin === "function" ? cfg.OnBegin : null,
      OnGroup: typeof cfg.OnGroup === "function" ? cfg.OnGroup : null,
      OnDisconnect: typeof cfg.OnDisconnect === "function" ? cfg.OnDisconnect : null,
      OnReconnect: typeof cfg.OnReconnect === "function" ? cfg.OnReconnect : null,
      OnComplete: typeof cfg.OnComplete === "function" ? cfg.OnComplete : null,
      OnBeat: typeof cfg.OnBeat === "function" ? cfg.OnBeat : null,
      // 运行态
      t: 0,
      sendLeft: 0, sendTotalS: 0,
      ditsLeft: 0, ditTimer: 0,
      cooldownLeft: 0,
      humLeft: 0,
      awayS: 0,
      beats: [],
      beganAt: this.Time(),
    };
    this.stats.sessions += 1;
    this.Beat("begin");
    this.PlayHum();
    return this.run.id;
  }

  /**
   * 玩家敲了一下电键 —— 发一个码组。
   *
   * **接头断着的时候按它不算数**（返回 false）：这一下不该「排队等接上再发」，
   * 玩家要先看见「按了没反应」，才会去找那个松掉的接头。
   * @returns {boolean} 这一下算不算数
   */
  Key(reason = "player") {
    const run = this.run;
    this.stats.keys += 1;
    if (!run || run.phase !== "ready") { this.stats.refused += 1; return false; }
    if (run.cooldownLeft > 0) { this.stats.refused += 1; return false; }
    const dits = this.DitsFor(run.sent);
    run.phase = "sending";
    run.ditsLeft = dits;
    run.ditTimer = 0;
    run.sendTotalS = Math.max(1e-3, (dits - 1) * run.ditGapS);
    run.sendLeft = run.sendTotalS;
    run.lastKeyReason = reason;
    // 第一声「嗒」在按下的**这一帧**就响。晚一帧的按键音手感上是「按下去慢半拍」
    // （Data_SfxSources 的 TelegraphKey 头注为这条钉死了 17 ms 的引头）。
    this.PlayDit();
    run.ditsLeft -= 1;
    return true;
  }

  /**
   * 一组响几声「嗒」。在 [ditsMin, ditsMax] 里**确定性地**走 ——
   * 不掷骰子（同一封电报重跑要出同一串声音），也不恒定（恒定就成了节拍器）。
   */
  DitsFor(index) {
    const run = this.run;
    const span = Math.max(1, run.ditsMax - run.ditsMin + 1);
    // 用码组本身的数字位当相位：内容不同，节奏就不同，而且可重放。
    const code = run.groups[index] || "";
    let sum = index * 3;
    for (let i = 0; i < code.length; i += 1) sum += code.charCodeAt(i);
    return run.ditsMin + (sum % span);
  }

  /**
   * 炮击把接头震松了。**脚本推的，不是掷骰子**（§7 阶段 4）。
   * 正在发的那一组**作废重来**：接头是在这一组发到一半的时候松的，
   * 半组电码对面收不到 —— 报码纸上那一组仍然是没勾的。
   * @returns {boolean} 断没断成（本来就断着 / 没在发报时返回 false）
   */
  ForceDisconnect(reason = "shell") {
    const run = this.run;
    if (!run || run.phase === "broken" || run.phase === "done") return false;
    run.phase = "broken";
    run.ditsLeft = 0;
    run.sendLeft = 0;
    run.cooldownLeft = 0;
    run.breakReason = reason;
    this.stats.breaks += 1;
    this.Beat("break");
    run.OnDisconnect?.(this.View());
    return true;
  }

  /**
   * 接头按回去了（`TelegraphReconnectInteraction` 的 hold 走满时调）。
   * @returns {boolean} 接上没有
   */
  Reconnect(reason = "player") {
    const run = this.run;
    if (!run || run.phase !== "broken") return false;
    run.phase = "ready";
    run.cooldownLeft = run.groupCooldownS;
    run.reconnectReason = reason;
    this.stats.reconnects += 1;
    this.Beat("reconnect");
    run.OnReconnect?.(this.View());
    return true;
  }

  /** 提前收掉（换关、剧情跳过）。不记 completed。 */
  Abort(reason = "abort") {
    if (!this.run || this.run.phase === "done") return false;
    this.stats.aborted += 1;
    this.Finish(reason, false);
    return true;
  }

  /** 换关 / 复活 / 出错时的兜底：不记 aborted，也不回调。 */
  Reset(reason = "reset") {
    if (this.run && this.run.phase !== "done") {
      this.run.OnComplete = null;
      this.run.OnBeat = null;
      this.Finish(reason, false);
    }
    this.run = null;
    this.StopHum();
    this.sfxPick.clear();
    this.ditCursor = 0;
    return true;
  }

  // -------------------------------------------------------------------------
  // 每帧
  // -------------------------------------------------------------------------

  /**
   * 推一帧。排在 `interact.Update` **之后**：那一层这一帧刚可能把一组发出去。
   *
   * `player` 是可选的，**只用来取证**（玩家是不是还站在电台边上）。
   * 走开了什么都不会发生 —— 进度原样保留，这正是 §7「不夺控制权」要的。
   */
  Update(dt, player = null) {
    const run = this.run;
    if (!run || run.phase === "done") return null;
    const step = Clamp(Num(dt, 0), 0, 0.1);
    run.t += step;

    if (run.cooldownLeft > 0) run.cooldownLeft = Math.max(0, run.cooldownLeft - step);
    this.StepHum(step);

    // 玩家走开了多久（取证；不影响任何判定）。
    if (player?.position && run.position) {
      const d = Math.hypot(player.position.x - run.position.x, player.position.z - run.position.z);
      run.awayS = d > 3.0 ? run.awayS + step : 0;
      run.atKey = d <= 3.0;
    }

    if (run.phase === "sending") {
      run.sendLeft = Math.max(0, run.sendLeft - step);
      run.ditTimer += step;
      while (run.ditsLeft > 0 && run.ditTimer >= run.ditGapS) {
        run.ditTimer -= run.ditGapS;
        run.ditsLeft -= 1;
        this.PlayDit();
      }
      if (run.sendLeft <= 0 && run.ditsLeft <= 0) this.CompleteGroup();
    }
    return this.View();
  }

  /** 一组真的发出去了：勾掉、推节拍、看要不要断线、看是不是最后一组。 */
  CompleteGroup() {
    const run = this.run;
    run.sent += 1;
    this.stats.groups += 1;
    run.phase = "ready";
    run.cooldownLeft = run.groupCooldownS;
    // first 与 group 两条都推：CH6 的 KeySeated 挂在**第一组**上，
    // 而章节侧那三条「第 N 组　对上了。」要的是每一组。
    if (run.sent === 1) this.Beat("first");
    this.Beat("group");
    run.OnGroup?.(run.sent, this.View());
    if (run.sent >= run.total) {
      this.Finish("done", true);
      return;
    }
    // 自动断线：**排在第几组之后是固定的**，不掷骰子。
    if (!run.breakUsed && run.breakAfterGroup !== null && run.sent >= run.breakAfterGroup) {
      run.breakUsed = true;
      this.ForceDisconnect("shell");
    }
  }

  /** 三条收尾路径（发完 / Abort / Reset）的共同出口。 */
  Finish(reason, completed) {
    const run = this.run;
    if (!run) return null;
    run.phase = "done";
    run.ditsLeft = 0;
    run.sendLeft = 0;
    this.StopHum();
    const summary = {
      id: run.id, reason, completed,
      seconds: run.t,
      sent: run.sent, total: run.total,
      breaks: run.breakUsed || !!run.breakReason,
      beats: run.beats.map((b) => b.name),
    };
    this.lastRun = summary;
    if (completed) {
      this.stats.completed += 1;
      this.Beat("complete");
      // 「发毕。」是章节 beats 的台词，本层一个字都不说 —— 只把事实交出去。
      run.OnComplete?.(summary);
    }
    return summary;
  }

  // -------------------------------------------------------------------------
  // 音效
  // -------------------------------------------------------------------------

  /** 一声「嗒」。三个变体顺序轮播，且**不做逐发变调**（A2 批的交付口径）。 */
  PlayDit() {
    this.stats.dits += 1;
    this.ditCursor = (this.ditCursor + 1) % 3;
    this.Sfx("key", {
      position: this.run?.position ? { ...this.run.position } : null,
      variant: this.ditCursor,
    });
  }

  PlayHum() {
    if (!this.run) return;
    this.run.humLeft = this.run.humLoopEveryS;
    this.humVoice = this.Sfx("hum", {
      position: this.run.position ? { ...this.run.position } : null,
    }) ? this.lastVoice : null;
  }

  /** 底噪：Play 没有 loop 语义，所以按素材长度重触发。 */
  StepHum(step) {
    const run = this.run;
    if (!run || run.phase === "done") return;
    run.humLeft -= step;
    if (run.humLeft > 0) return;
    this.PlayHum();
  }

  StopHum() {
    if (this.humVoice && typeof this.host.Stop === "function") this.host.Stop(this.humVoice);
    this.humVoice = null;
  }

  /**
   * 放一条本层的音效。A2 批那两条实录的同名配方合上之前 `Play` 会返回假值 ——
   * 那时退到备胎，并**把结果记下来**：一条 key 只解析一次，不会每次都白试一遍。
   */
  Sfx(key, opts = {}) {
    const spec = TELEGRAPH_SFX[key];
    this.lastVoice = null;
    if (!spec || typeof this.host.Play !== "function") return null;
    const picked = this.sfxPick.get(key);
    const names = picked ? [picked] : spec.names;
    for (const name of names) {
      const played = this.host.Play(name, { volume: spec.volume, ...opts });
      if (played) {
        this.sfxPick.set(key, name);
        this.lastVoice = played;
        return name;
      }
    }
    return null;
  }

  // -------------------------------------------------------------------------
  // 取证
  // -------------------------------------------------------------------------

  /**
   * 给 HUD 那张报码纸的脱敏快照。没有在发报就是 null。
   * 每一组带 `sent`（勾掉没有）与 `active`（正在发的那一组）。
   */
  View() {
    const run = this.run;
    if (!run || run.phase === "done") return null;
    return {
      id: run.id,
      label: run.label,
      phase: run.phase,
      broken: run.phase === "broken",
      sending: run.phase === "sending",
      sent: run.sent,
      total: run.total,
      t: run.sendTotalS > 0 && run.phase === "sending"
        ? Clamp01(1 - run.sendLeft / run.sendTotalS) : 0,
      cooldown: run.cooldownLeft,
      groups: run.groups.map((code, i) => ({
        i: i + 1, code,
        sent: i < run.sent,
        active: i === run.sent && run.phase === "sending",
      })),
      prompt: run.phase === "broken" ? run.reconnectLabel
        : run.phase === "sending" ? "发送中……"
          : run.keyLabel,
      atKey: run.atKey !== false,
      beats: run.beats.map((b) => b.name),
    };
  }

  /** 取证口（Debug.Telegraph / 冒烟断言读它）。 */
  State() {
    return {
      view: this.View(),
      phase: this.Phase,
      progress: this.Progress,
      awayS: this.run ? this.run.awayS : 0,
      stats: { ...this.stats },
      lastRun: this.lastRun ? { ...this.lastRun } : null,
      sfx: Object.fromEntries(this.sfxPick),
    };
  }

  /** 一个节拍：记进取证、推 story 信号、回调章节侧。三件事的顺序是固定的。 */
  Beat(name) {
    const run = this.run;
    if (!run) return;
    run.beats.push({ name, t: run.t, at: this.Time() });
    const signal = run.signals[name];
    if (signal) this.host.Signal?.(signal);
    run.OnBeat?.(name, this.View());
  }
}

// ===========================================================================
// 交互点预制
//
// 与 `Script_Interact` 末尾那八个救护预制同一条约定：**纯函数**，吃一份摆点参数，
// 吐一个可以直接 `interact.Register(spec)` 的对象。放在这里而不是放进
// Script_Interact，是为了不让交互框架反过来依赖发报这一个玩法系统。
//
// 两个点**一次摆齐**，能不能按由各自的 `Enabled` 判：
// 接头断着的时候电键那条整条不出现（不给一个按了没反应的灰提示），
// 接头那条只有断着的时候才出现。
// ===========================================================================

/**
 * 电键：按一下发一个码组。**tap 手势** —— 发报不是读条。
 * `once:false` + `cooldownS`：同一个点要按好几次，两次之间隔一个码组的冷却，
 * 不然按住 F 连点能在半秒里把整封电报发完。
 */
export function TelegraphKeyInteraction({
  id = "telegraphKey", position, Anchor, tag = null, telegraph,
  label, priority = 14, reachM, heightM, facingDot, OnComplete,
} = {}) {
  return {
    id, position, Anchor, tag, priority, reachM, heightM, facingDot,
    kind: "telegraph", gesture: "tap", seconds: 0,
    once: false,
    cooldownS: telegraph?.run?.groupCooldownS ?? TELEGRAPH_DEFAULTS.groupCooldownS,
    label: label ?? ((ctx) => {
      const view = telegraph?.View();
      return view ? `${TELEGRAPH_DEFAULTS.keyLabel}（${view.sent}/${view.total}）` : TELEGRAPH_DEFAULTS.keyLabel;
    }),
    Enabled: () => !!telegraph?.CanKey,
    OnComplete: (ctx) => {
      if (!telegraph?.Key("player")) return false;      // 这一下不算数：不计完成、不进冷却
      OnComplete?.(ctx);
      return true;
    },
  };
}

/**
 * 重新接上接头：**hold 手势**（Data_MissionCh6 ENGINE_REQUEST 1 的 1.2 s）。
 * 不用 confirm —— confirm 是给不可逆的决定留的（撕短褂、剪线）；
 * 手抖一下把接头按掉重来，是在惩罚玩家的手，不是在演炮击。
 */
export function TelegraphReconnectInteraction({
  id = "telegraphJoint", position, Anchor, tag = null, telegraph,
  seconds, label = TELEGRAPH_DEFAULTS.reconnectLabel,
  priority = 16, reachM, heightM, facingDot, OnComplete,
} = {}) {
  return {
    id, position, Anchor, tag, priority, reachM, heightM, facingDot,
    kind: "wire", gesture: "hold",
    seconds: Num(seconds, telegraph?.run?.reconnectS ?? TELEGRAPH_DEFAULTS.reconnectS),
    once: false,
    label,
    hint: "接头接回去了。接着发。",
    Enabled: () => !!telegraph?.Broken,
    OnComplete: (ctx) => {
      if (!telegraph?.Reconnect("player")) return false;
      OnComplete?.(ctx);
      return true;
    },
  };
}

// ===========================================================================
// 宿主适配器
//
// 把本层的纯数字翻给 `Script_Audio` 与 `Script_Hud`。**这里也不 import three**
// —— audio.Play 只读 `position.x/y/z`，给纯对象就行。
// 取的全是取值器：`story` 每关换一份，拷值出去会指到上一关。
// ===========================================================================

export function MakeTelegraphHost(deps = {}) {
  return {
    Time: () => deps.Time?.() ?? 0,
    // `variant` 是三个「嗒」变体的轮播游标。Script_Audio 的采样配方自己按
    // SAMPLE_CYCLE 轮播同名 cue 的多个文件，所以这里**只把它透传下去**，
    // 不在这一层挑文件 —— 挑文件是音频层的事。
    Play: (name, opts = {}) => deps.audio?.Play(name, opts) ?? null,
    Stop: (voice) => deps.audio?.StopVoice?.(voice),
    Hint: (text, seconds) => deps.hud?.Hint(text, seconds),
    Say: (who, text, seconds) => deps.hud?.Say(who, text, seconds),
    Signal: (name) => deps.Story?.()?.Signal(name),
    PlayerPos: () => {
      const player = deps.Player?.();
      return player ? { x: player.position.x, y: player.position.y, z: player.position.z } : null;
    },
  };
}

export default TelegraphSystem;
