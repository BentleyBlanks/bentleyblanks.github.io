// 《台儿庄：血战滕县》自动降档（纯规则层，零 three 依赖 —— 契约 2）。
//
// docs/Data_TechRenderPipeline.md §13「自动降档」那一段的落地：
//   · 滑动窗口统计最近 `window` 帧的 `performance.now()` 帧间隔；
//   · 中位数 > `downMedianMs` 连续 `downSustainMs` 就**降一级**；
//   · 中位数 < `upMedianMs` 连续 `upSustainMs` 才**升一级**（升档更保守）；
//   · **每次降级之后锁 `lockMs`**，期间既不降也不升 —— 没有这条锁，
//     临界点上的机器会在两级之间每两秒抖一次，而每次抖动本身都要重建靶。
//
// ## 它调什么、不调什么
// 只调**运行时旋钮**：内部分辨率倍率、SSR、接触阴影（见 `AUTO_QUALITY.ladder`）。
// 不整档切换 —— 换档要重编译全场材质（POM / SSIL / 簇状光都是编译期开关），
// 在已经掉帧的时候再送一次几百毫秒的编译卡顿只会更糟。
// 也不动曝光 / 雾 / 阴影总闸：那几样一动画面明暗就漂了（历史事故「画面为什么这么黑」）。
//
// ## `scale` 是倍率不是绝对值
// 玩家在画质面板拉过的「渲染分辨率」仍然是他拉的那个数；这里给的是**乘在上面**
// 的一个 ≤ 1 的倍率。两者分开之后，自动降档与手动设置不会互相覆盖，
// 「恢复出厂」也不需要知道自动降档当前在第几级。
//
// ## 纯规则层
// 不 import three、不读 DOM、不读 `performance` —— 时间一律由调用方传进来。
// 所以 `Script_AutoQualityTest.mjs` 可以直接喂一串帧时间序列断言决策。

import { AUTO_QUALITY } from "./Data_Tuning_Graphics.mjs";

const Clamp = (value, low, high) => Math.min(high, Math.max(low, value));

/**
 * 第 `step` 级对应的旋钮。纯函数，测试直接调。
 * @param {number} step 阶梯级数（会自己钳进 ladder 范围）
 * @param {object} [config] 覆盖 AUTO_QUALITY（测试用）
 * @returns {{step:number, scale:number, ssr:boolean, contactShadows:boolean}}
 */
export function AutoQualityKnobs(step, config = AUTO_QUALITY) {
  const ladder = config.ladder;
  const index = Clamp(Math.round(step) || 0, 0, ladder.length - 1);
  const rung = ladder[index];
  return {
    step: index,
    scale: rung.scale,
    ssr: rung.ssr !== false,
    contactShadows: rung.contactShadows !== false,
  };
}

/**
 * 帧时间滑动窗口 + 阶梯决策。
 *
 * 用法（`Script_Main` 的 Frame 循环）：
 * ```js
 * const change = autoQuality.Frame(now);
 * if (change) ApplyGraphics();          // 旋钮从 autoQuality.scale / .ssr / … 读
 * ```
 */
export class AutoQuality {
  /**
   * @param {object} [options]
   * @param {object} [options.config] 覆盖 `AUTO_QUALITY`（测试用）
   * @param {boolean} [options.enabled] 出厂值来自 config.enabled
   */
  constructor({ config = AUTO_QUALITY, enabled = null } = {}) {
    this.config = config;
    this.enabled = enabled === null ? config.enabled !== false : !!enabled;
    this.step = 0;
    this._intervals = new Float64Array(config.window);
    this._count = 0;
    this._cursor = 0;
    this._sorted = new Float64Array(config.window);
    this._lastNow = null;
    this._slowSinceMs = null;   // 中位数持续高于门槛的起点
    this._fastSinceMs = null;   // 持续低于门槛的起点
    this._lockUntilMs = null;   // 降级之后的冷却终点
    this._now = 0;
    /** 决策历史（面板与测试取证用，最多留 32 条）。 */
    this.log = [];
  }

  /** 当前级的三个旋钮。`ApplyGraphics` 直接读这三个。 */
  get scale() { return AutoQualityKnobs(this.step, this.config).scale; }

  get ssr() { return AutoQualityKnobs(this.step, this.config).ssr; }

  get contactShadows() { return AutoQualityKnobs(this.step, this.config).contactShadows; }

  /** 面板关掉它时把阶梯收回第 0 级（否则玩家关了开关画面还留在降过的分辨率上）。 */
  SetEnabled(on) {
    const next = !!on;
    if (next === this.enabled) return false;
    this.enabled = next;
    if (!next && this.step !== 0) { this.Reset(0); return true; }
    this.Reset(this.step);
    return false;
  }

  /** 清窗口与计时器；`step` 给了就同时跳到那一级（换关 / 恢复出厂用）。 */
  Reset(step = this.step) {
    this.step = Clamp(Math.round(step) || 0, 0, this.config.ladder.length - 1);
    this._count = 0;
    this._cursor = 0;
    this._lastNow = null;
    this._slowSinceMs = null;
    this._fastSinceMs = null;
    this._lockUntilMs = null;
  }

  /** 窗口里的帧间隔中位数（毫秒）；窗口没满返回 null。 */
  Median() {
    const n = this._count;
    if (n < this._intervals.length) return null;
    const sorted = this._sorted;
    sorted.set(this._intervals);
    sorted.sort();
    return sorted[n >> 1];
  }

  /**
   * 推一帧。
   * @param {number} nowMs 本帧的时间戳（`performance.now()`）
   * @returns {null|{direction:string, from:number, to:number, medianMs:number, atMs:number}}
   *          有级数变化时返回这一条，否则 null。
   */
  Frame(nowMs) {
    this._now = nowMs;
    const previous = this._lastNow;
    this._lastNow = nowMs;
    if (!this.enabled) return null;
    if (previous === null) return null;
    const interval = nowMs - previous;
    // 切后台 / 加载卡顿那一帧不是「跑不动」，不进窗口也不清计时器
    // （清了的话每一次加载都会把刚攒够的 8 秒升档条件抹掉）。
    if (!(interval > 0) || interval > this.config.maxIntervalMs) return null;
    this._intervals[this._cursor] = interval;
    this._cursor = (this._cursor + 1) % this._intervals.length;
    if (this._count < this._intervals.length) this._count += 1;

    const median = this.Median();
    if (median === null) return null;

    const C = this.config;
    const locked = this._lockUntilMs !== null && nowMs < this._lockUntilMs;
    if (locked) { this._slowSinceMs = null; this._fastSinceMs = null; return null; }
    this._lockUntilMs = null;

    if (median > C.downMedianMs) {
      this._fastSinceMs = null;
      if (this._slowSinceMs === null) this._slowSinceMs = nowMs;
      else if (nowMs - this._slowSinceMs >= C.downSustainMs) {
        return this._Change(1, median, nowMs);
      }
    } else if (median < C.upMedianMs) {
      this._slowSinceMs = null;
      if (this._fastSinceMs === null) this._fastSinceMs = nowMs;
      else if (nowMs - this._fastSinceMs >= C.upSustainMs) {
        return this._Change(-1, median, nowMs);
      }
    } else {
      // 两条门槛之间的死区：既不算跑不动也不算有余量，两个计时器都清。
      this._slowSinceMs = null;
      this._fastSinceMs = null;
    }
    return null;
  }

  _Change(delta, median, nowMs) {
    const last = this.config.ladder.length - 1;
    const next = Clamp(this.step + delta, 0, last);
    this._slowSinceMs = null;
    this._fastSinceMs = null;
    if (next === this.step) return null;   // 已经在阶梯尽头，不记事件
    const from = this.step;
    this.step = next;
    // 降级之后锁 30 s；升级也重新攒时间（清了两个计时器），但不上锁 ——
    // 升错了 2 秒之后就能降回来，比「升上去锁住半分钟」安全。
    if (delta > 0) this._lockUntilMs = nowMs + this.config.lockMs;
    const event = {
      direction: delta > 0 ? "down" : "up",
      from,
      to: next,
      medianMs: +median.toFixed(2),
      atMs: nowMs,
    };
    this.log.push(event);
    if (this.log.length > 32) this.log.shift();
    return event;
  }

  /** 面板/剖析器的一行状态。 */
  Summary() {
    const knobs = AutoQualityKnobs(this.step, this.config);
    return {
      enabled: this.enabled,
      step: this.step,
      steps: this.config.ladder.length,
      scale: knobs.scale,
      ssr: knobs.ssr,
      contactShadows: knobs.contactShadows,
      medianMs: this.Median(),
      locked: this._lockUntilMs !== null && this._now < this._lockUntilMs,
      lockRemainMs: this._lockUntilMs === null
        ? 0 : Math.max(0, this._lockUntilMs - this._now),
      events: this.log.length,
    };
  }
}

export default AutoQuality;
