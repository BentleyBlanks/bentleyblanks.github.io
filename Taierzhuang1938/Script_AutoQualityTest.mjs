// ===========================================================================
// Script_AutoQualityTest.mjs —— 自动降档的回归口（纯 Node，毫秒级）
//
// 覆盖 docs/Data_TechRenderPipeline.md §13「自动降档」的五条口径：
//   ① 阶梯映射单调：级数越大内部分辨率倍率越小，且从不越过 floor；
//   ② 降档：中位数 >20 ms **持续 2 s** 才降，1.9 s 不降；
//   ③ 冷却：降档后锁 30 s，期间既不再降也不升；
//   ④ 升档更保守：<13 ms 要持续 8 s；死区（13–20 ms）里两个计时器都清零，
//      所以在临界点上来回抖的帧时间**不会**把阶梯抖上抖下；
//   ⑤ 韧性：窗口没满不决策、>250 ms 的加载/切后台帧不进窗口也不清计时器、
//      关掉开关收回第 0 级、阶梯到底/到顶不再产生事件。
// ===========================================================================

import assert from "node:assert/strict";
import { AutoQuality, AutoQualityKnobs } from "./Script_AutoQuality.mjs";
import { AUTO_QUALITY } from "./Data_Tuning_Graphics.mjs";

const C = AUTO_QUALITY;

// --- ① 阶梯映射 -----------------------------------------------------------
{
  assert.ok(C.ladder.length >= 3, "阶梯至少三级才谈得上「降一级」");
  let previous = Infinity;
  for (let step = 0; step < C.ladder.length; step += 1) {
    const knobs = AutoQualityKnobs(step);
    assert.equal(knobs.step, step);
    assert.ok(knobs.scale <= previous, `第 ${step} 级的倍率不得高于上一级`);
    assert.ok(knobs.scale >= C.floor, `第 ${step} 级的倍率不得低于 floor=${C.floor}`);
    previous = knobs.scale;
  }
  assert.equal(AutoQualityKnobs(0).scale, 1, "第 0 级 = 出厂配置，倍率必须正好是 1");
  assert.equal(AutoQualityKnobs(0).ssr, true);
  assert.equal(AutoQualityKnobs(0).contactShadows, true);
  // 钳位：越界一律夹回阶梯里，不抛也不返回 undefined
  assert.equal(AutoQualityKnobs(-5).step, 0);
  assert.equal(AutoQualityKnobs(999).step, C.ladder.length - 1);
  // 最深一级必须真的省下东西，否则这条阶梯没有兜底能力
  const bottom = AutoQualityKnobs(C.ladder.length - 1);
  assert.ok(bottom.scale < 1 && (!bottom.ssr || !bottom.contactShadows),
    "阶梯最深一级必须同时收内部分辨率与至少一项屏幕空间效果");
}

/** 按固定帧间隔推 `ms` 毫秒，收集期间发生的级数变化。 */
function Run(auto, intervalMs, ms, state) {
  const events = [];
  const end = state.t + ms;
  while (state.t < end) {
    state.t += intervalMs;
    const change = auto.Frame(state.t);
    if (change) events.push(change);
  }
  return events;
}

// --- ② 降档要「持续」，不是一帧超标就降 -----------------------------------
{
  const auto = new AutoQuality();
  const state = { t: 1000 };
  // 先把窗口喂满（第一帧没有「上一帧」，所以要 window+1 次调用才攒够 window
  // 个间隔），窗口没满时不许有任何决策
  const warm = [];
  for (let i = 0; i <= C.window; i += 1) {
    state.t += 25;
    const change = auto.Frame(state.t);
    if (change) warm.push(change);
  }
  assert.equal(warm.length, 0, "窗口没喂满就不许决策");
  assert.equal(auto.Median(), 25, "窗口喂满之后中位数就是喂进去的那个间隔");
  // 从窗口满的那一帧起算 2 秒；1.9 秒时还不许降
  const early = Run(auto, 25, 1900, state);
  assert.equal(early.length, 0, "持续 1.9 s 还不到 2 s，不许降档");
  const late = Run(auto, 25, 200, state);
  assert.equal(late.length, 1, "满 2 s 降一级");
  assert.equal(late[0].direction, "down");
  assert.equal(late[0].from, 0);
  assert.equal(late[0].to, 1);
  assert.ok(late[0].medianMs >= C.downMedianMs);
  assert.equal(auto.step, 1);
}

// --- ③ 降档之后锁 30 秒 ---------------------------------------------------
{
  const auto = new AutoQuality();
  const state = { t: 0 };
  const warm = Run(auto, 25, (C.window + 2) * 25, state);   // 只喂满窗口
  assert.equal(warm.length, 0, "刚喂满窗口时还没攒够 2 s");
  const first = Run(auto, 25, C.downSustainMs + 200, state);
  assert.equal(first.length, 1, "第一次降级");
  assert.equal(auto.Summary().locked, true, "降级之后进入冷却");
  // 冷却期内一直很慢也不许再降
  const during = Run(auto, 25, C.lockMs - 500, state);
  assert.equal(during.length, 0, `冷却 ${C.lockMs} ms 内不许再降档`);
  assert.equal(auto.step, 1);
  // 锁一过、再攒满 2 s，才降第二级
  const after = Run(auto, 25, 500 + C.downSustainMs + 100, state);
  assert.equal(after.length, 1, "锁过期之后可以降第二级");
  assert.equal(after[0].to, 2);
  // 冷却期内即使一路很快也不许升
  const fastLocked = Run(auto, 8, 1000, state);
  assert.equal(fastLocked.length, 0, "冷却期内也不许升档");
}

// --- ④ 升档更保守 + 死区不抖 ---------------------------------------------
{
  const auto = new AutoQuality();
  auto.Reset(3);
  const state = { t: 0 };
  // 先跑过锁（这一台没降过，没有锁），喂满窗口 + 攒 7 秒还不许升
  Run(auto, 8, (C.window + 2) * 8, state);
  assert.equal(auto.Median(), 8);
  const early = Run(auto, 8, C.upSustainMs - 1000, state);
  assert.equal(early.length, 0, `不到 ${C.upSustainMs} ms 不许升档`);
  const late = Run(auto, 8, 1100, state);
  assert.equal(late.length, 1, "满 8 s 升一级");
  assert.equal(late[0].direction, "up");
  assert.equal(late[0].to, 2);
  assert.equal(auto.Summary().locked, false, "升档不上锁：升错了两秒后就能降回来");

  // 死区：16 ms（13 与 20 之间）无论跑多久都不动
  const dead = new AutoQuality();
  const s2 = { t: 0 };
  Run(dead, 16, (C.window + 2) * 16 + 60000, s2);
  assert.equal(dead.step, 0, "死区里不许升也不许降");

  // 临界机器：三秒 22 ms、三秒 11 ms 交替（正是「在临界点来回抖」那台）。
  // 允许它一路降到底，但**churn 必须被锁住**：任何一次降档之后至少 30 s 内
  // 不许再有第二次决策，两次决策之间也不许短于一个 sustain 窗口。
  const jitter = new AutoQuality();
  const s3 = { t: 0 };
  const total = 6 * 60 * 1000;
  while (s3.t < total) {
    const slow = Math.floor(s3.t / 3000) % 2 === 0;
    s3.t += slow ? 22 : 11;
    jitter.Frame(s3.t);
  }
  for (let i = 1; i < jitter.log.length; i += 1) {
    const previous = jitter.log[i - 1];
    const gap = jitter.log[i].atMs - previous.atMs;
    const floor = previous.direction === "down" ? C.lockMs : C.downSustainMs;
    assert.ok(gap >= floor,
      `第 ${i} 次决策距上一次只有 ${gap.toFixed(0)} ms，不足 ${floor} ms`);
  }
  assert.ok(jitter.log.length <= Math.ceil(total / C.lockMs),
    `六分钟临界抖动里的决策次数 ${jitter.log.length} 超过锁能允许的上限`);
  assert.ok(jitter.log.filter((e) => e.direction === "up").length === 0,
    "中位数 22 ms 的机器不该在这条曲线上升档");
}

// --- ⑤ 韧性 ---------------------------------------------------------------
{
  // 加载卡顿那一帧（>250 ms）不进窗口，也不清升档计时器
  const auto = new AutoQuality();
  auto.Reset(2);                        // 先假设已经降过两级，才有得升
  const state = { t: 0 };
  Run(auto, 8, (C.window + 2) * 8, state);
  Run(auto, 8, C.upSustainMs - 400, state);
  state.t += 900;                       // 一帧 900 ms 的加载卡顿
  assert.equal(auto.Frame(state.t), null, "加载卡顿那一帧本身不产生决策");
  assert.equal(auto.Median(), 8, "超长帧不进窗口，中位数不受污染");
  const resumed = Run(auto, 8, 500, state);
  assert.equal(resumed.length, 1, "加载卡顿不清升档计时器，恢复后照常升档");

  // 阶梯到底不再产生事件（但也不抛）
  const bottom = new AutoQuality();
  bottom.Reset(C.ladder.length - 1);
  const s2 = { t: 0 };
  Run(bottom, 40, (C.window + 2) * 40 + 120000, s2);
  assert.equal(bottom.step, C.ladder.length - 1, "已经在最深一级，继续慢也不动");
  assert.equal(bottom.log.length, 0, "到底之后不记空事件");

  // 阶梯到顶同理
  const top = new AutoQuality();
  const s3 = { t: 0 };
  Run(top, 6, (C.window + 2) * 6 + 120000, s3);
  assert.equal(top.step, 0);
  assert.equal(top.log.length, 0);

  // 关掉开关：立刻收回第 0 级，之后再慢也不动
  const off = new AutoQuality();
  const s4 = { t: 0 };
  Run(off, 25, (C.window + 2) * 25 + C.downSustainMs + 200, s4);
  assert.equal(off.step, 1, "先降一级");
  assert.equal(off.SetEnabled(false), true, "关掉开关时返回 true 表示旋钮要还原");
  assert.equal(off.step, 0, "关掉之后收回第 0 级");
  Run(off, 40, 120000, s4);
  assert.equal(off.step, 0, "关着就不许再动");
  assert.equal(off.SetEnabled(true), false, "重新打开不需要立刻改旋钮");

  // 出厂就是开的（docs §13：出厂开、面板可关）
  assert.equal(new AutoQuality().enabled, true, "自动降档出厂开");
  assert.equal(C.enabled, true);

  // Summary 是面板与剖析器共用的那一行，字段齐全
  const summary = new AutoQuality().Summary();
  for (const key of ["enabled", "step", "steps", "scale", "ssr",
    "contactShadows", "medianMs", "locked", "lockRemainMs", "events"]) {
    assert.ok(key in summary, `Summary 缺字段 ${key}`);
  }
}

// --- 纯规则层：一个 three / DOM 依赖都不许有 ------------------------------
{
  const source = await import("node:fs")
    .then((fs) => fs.readFileSync(new URL("./Script_AutoQuality.mjs", import.meta.url), "utf8"));
  assert.ok(!/from\s+["']three["']/.test(source), "自动降档是纯规则层，不许 import three");
  // 注释里出现 performance.now() 是在解释口径，所以只扫**去掉注释之后**的正文。
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.ok(!/(^|[^.\w])document\s*\./.test(code), "规则层不许碰 DOM");
  assert.ok(!/(^|[^.\w])window\s*\./.test(code), "规则层不许碰 window");
  assert.ok(!/performance\s*\.\s*now/.test(code), "时间一律由调用方传进来");
  assert.ok(!/requestAnimationFrame/.test(code), "规则层不许自己驱动帧");
}

console.log("PASS AutoQualityTest: ladder mapping, sustained downgrade, 30 s lock,"
  + " conservative upgrade, dead-zone anti-oscillation, hitch resilience, panel toggle");
