// Script_FirstLevelAudioNodeBudgetTest.mjs — 第一关 01–06 音频同时活跃节点的门（2026-09-25，契约 §6「音频节点」）。
//
// 实时推帧（游戏时间跟着 AudioContext 时钟走，每轮让出主线程，与真玩家一致），每 0.1 s 记一次账：
//   1. 账面对得上：engine.liveNodes = 在账 voice 的节点 + 循环层（环境床/配乐）的节点 + 旧环境回退节点，
//      差值必须恒为 0 —— 差了就是有人多还或少还（「预算怎么用不完」/「越跑越少」那一类）；
//   2. 没有过期未收：pendingVoices 里没有一条已经过了回收点 0.35 s 还挂着（ReleaseVoice 的
//      计时器与 SetListener 里的按帧清账两条路都失手才会有）。回收点认 releaseAt；没有 releaseAt 的
//      voice 退回它自己的「起播时刻 + 可听时长 + 0.22 s」（v.t + v.life + 0.22，每条 Voice 都有）——
//      releaseAt 是 2026-09-25 的修复才加的字段，只认它的话，把 ReleaseVoice 改回旧写法或整个回退
//      按帧清账，这条都不会红（审查拿基线 0b13201 跑过：原来的门在基线上全绿）。「过了多久」按**最近一次 SetListener**
//      时的音频时钟算，不按取样那一刻：按帧清账就在 SetListener 里，它之后到期的本来就要等下一帧；
//      机器忙时两次 evaluate 之间主线程能卡住半秒，拿取样时刻量出来的是这段卡顿，不是漏收
//     （2026-09-25 复跑时 05 就这样红过一次：2 条在上一帧之后才到期）；
//   3. 峰值不破顶：每段实时推帧的 liveNodes 峰值 ≤ PEAK_CEILING（见下）；
//   4. 契约 §6 的构成：战车常驻 loop ≤ 3 条、剧情语音同时 ≤ 3 路、前线 + 场外炮击 ≤ 8 条
//      （后一条按生成器自己的声部账数 —— 它按每一声的可听时长数，不按引擎回收时刻，
//        引擎那边一条远处的枪要连混响尾巴与传播延迟一起挂五六秒，拿它数会数出十几条）；
//   5. 离开阶段收得走：跳到 06 之后 6 s，战车的三条 loop 必须已经没了；每段开头 8 s 之后，
//      正在淡出的循环层必须已经拆掉（换环境床的交叉不许留尾巴）；
//   6. 同步推帧也不虚高：一个 evaluate 同步推 600 帧（战役驱动器与 TankProbe 帧耗时 A/B 的推法），
//      推完账面仍 ≤ PEAK_CEILING、且没有过期未收（同上，含没有 releaseAt 的） —— 「整关验收 553–583」
//      就是这种推法下计时器不回调、放完的 voice 全挂在账上量出来的。**真正卡住回归的是这一条的
//      「过期未收」**：基线代码同步推 600 帧峰值只到 138–142，碰不到 150。
//   7. 覆盖够：每段实际推到的游戏秒 ≥ COVERAGE_MIN × 计划（见 PLAN 上面的说明）。
//
// PEAK_CEILING = 150：引擎的进门预算 NODE_BUDGET 120 不变；priority 的天花板是 120 × 1.15 = 138，
// 再留一条 priority 声（12 个节点）的余量。**这是护栏不是预算**：它只拦得住绕过预算闸的节点
//（循环层、耳鸣这类自管节点）把总账顶破，拦不住「预算本身用得多」—— 基线与 HEAD 的实时峰值都在
// 107–138 之间。能看出回归的是账面差 0、过期未收与同步推帧推完的读数。实测峰值见 docs/Data_AudioEngine.md §7.5。
//
// 用法：node Taierzhuang1938/Script_FirstLevelAudioNodeBudgetTest.mjs
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const { LaunchBrowser } = await import(pathToFileURL(path.resolve(HERE, "../PrairieFire1937/Script_BrowserTestKit.mjs")).href);
const { ServeRoot } = await import(pathToFileURL(path.resolve(HERE, "Script_DevServer.mjs")).href);

const PEAK_CEILING = 150;
const OVERDUE_S = 0.35;
const TANK_LOOPS = ["tankEngine", "tankTracks", "tankTurret"];
// 实时推的段：01 从开机起 70 s（含近爆 → 黑屏 → 醒来），02 跳进来 25 s（后沟集合；02 开头的枪托那一下
// 要从开机实时跑约 151 s 才到，FirstLevelJump(2) 会跳过它 —— 枪托那一下的耳鸣见 Step 3 的实时取样，
// 这道门不覆盖），03 30 s，04、05 各 45 s（战车露面、打车），06 20 s（战车收场）。
// seconds 是**游戏秒**：机器忙时游戏时间追不上音频时钟，就按游戏秒推满为止（音频时钟另设 WALL_FACTOR 倍的上限），
// 推完不足 COVERAGE_MIN 就报「覆盖不足」而不是绿（2026-09-25 审查：原来按音频时钟截断，04 只推到 25 游戏秒也照绿）。
const PLAN = [
  { jump: null, seconds: 70, label: "01" },
  { jump: 2, seconds: 25, label: "02" },
  { jump: 3, seconds: 30, label: "03" },
  { jump: 4, seconds: 45, label: "04" },
  { jump: 5, seconds: 45, label: "05" },
  { jump: 6, seconds: 20, label: "06" },
];
const WALL_FACTOR = 3;
const COVERAGE_MIN = 0.9;

let failed = 0;
const Fail = (msg) => { console.log(`FAIL ${msg}`); failed += 1; };
const Ok = (msg) => console.log(`ok   ${msg}`);

const server = await ServeRoot(path.resolve(HERE, ".."), 0);
const browser = await LaunchBrowser();
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 300)));
try {
  await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/?whitebox=p012&menu=0&manual=1&quality=low&scale=small`,
    { waitUntil: "domcontentloaded", timeout: 240000 });
  await page.waitForFunction(() => window.Tengxian?.state?.ready, null, { timeout: 300000 });
  await page.mouse.click(480, 270).catch(() => {});
  await page.locator("#bootStart").click();
  await page.waitForFunction(() => window.Tengxian.audio.ctx?.state === "running", null, { timeout: 60000 });

  // ---- 探针：循环层登记、Play 打标（剧情语音）、按 cue 记饿死 ----
  await page.evaluate(() => {
    const a = window.Tengxian.audio;
    const P = window.__budgetProbe = { layers: new Set(), starvedByCue: {}, listenerAt: null };
    // 记下每一帧 SetListener（按帧清账所在处）进门时的音频时钟，过期未收以它为准（见文件头第 2 条）。
    const setListener = a.SetListener;
    a.SetListener = function (...x) { P.listenerAt = a.ctx.currentTime; return setListener.apply(this, x); };
    const PatchLayer = (proto) => {
      if (!proto || proto.__budgetProbed) return;
      proto.__budgetProbed = true;
      const start = proto.Start;
      proto.Start = function (...x) { P.layers.add(this); return start.apply(this, x); };
    };
    for (const l of [...(a.ambLayers || []), a.musicLayer]) if (l) { P.layers.add(l); PatchLayer(Object.getPrototypeOf(l)); }
    const ambience = a.Ambience;
    a.Ambience = function (...x) {
      const r = ambience.apply(this, x);
      for (const l of a.ambLayers || []) { P.layers.add(l); PatchLayer(Object.getPrototypeOf(l)); }
      return r;
    };
    const play = a.Play;
    a.Play = function (name, o = {}) {
      const starved = a.drops.starved;
      const v = play.call(this, name, o);
      if (v) v.__story = !!o.storySpeech;
      else if (a.drops.starved > starved) P.starvedByCue[name] = (P.starvedByCue[name] || 0) + 1;
      return v;
    };
  });

  // 回收点：releaseAt；没有就退回 v.t + v.life + 0.22（见文件头第 2 条）。页面里两处共用，挂在探针上。
  await page.evaluate(() => {
    window.__budgetProbe.DueAt = (v) => (v.releaseAt != null ? v.releaseAt
      : (Number.isFinite(v.t) && Number.isFinite(v.life) ? v.t + v.life + 0.22 : null));
  });

  const Sample = () => page.evaluate(({ OVERDUE_S, TANK_LOOPS }) => {
    const g = window.Tengxian, a = g.audio, P = window.__budgetProbe, now = a.ctx.currentTime, ref = P.listenerAt ?? now;
    const FrontShared = () => { const b = g.Debug.FirstLevelMissionRuntime?.()?.battleSound;
      return b ? (b.frontVoices?.length || 0) + (b.artillery?.voices?.length || 0) : 0; };
    const seen = new Set();
    let fromVoices = 0, overdue = 0, tank = 0, story = 0;
    const overdueNames = [];
    for (const set of [a.activeVoices, a.pendingVoices]) for (const v of set || []) {
      if (seen.has(v)) continue;
      seen.add(v);
      const due = a.pendingVoices.has(v) ? P.DueAt(v) : null;
      if (due != null && ref - due > OVERDUE_S) { overdue += 1; overdueNames.push(v.name || "?"); }
      if (v.reclaimed || !v.nodes || !v.nodes.length) continue;
      fromVoices += v.nodes.length;
      if (TANK_LOOPS.includes(v.name)) tank += 1;
      if (v.__story) story += 1;
    }
    let fromLayers = 0, fading = 0;
    for (const l of P.layers) {
      const n = (l.heads?.size || 0) * 2 + (l.group ? 1 : 0) + (l.filter ? 1 : 0);
      if (!n) { if (l.stopped) P.layers.delete(l); continue; }
      fromLayers += n;
      if (l.stopped) fading += 1;
    }
    const fallback = a.ambienceNodes?.length || 0;
    return { t: now, stage: g.Debug.FirstLevelMissionRuntime?.()?.flow?.stage?.id ?? null, live: a.liveNodes,
      drift: a.liveNodes - (fromVoices + fromLayers + fallback), overdue, overdueNames: overdueNames.slice(0, 4), gap: now - ref,
      tank, story, shared: FrontShared(), fading, loops: fromLayers };
  }, { OVERDUE_S, TANK_LOOPS });

  const report = [];
  const worst = { drift: [], overdue: [] };
  let sync = null;
  for (const seg of PLAN) {
    if (seg.jump != null) {
      const j = await page.evaluate(async (n) => { try { await window.Tengxian.Debug.FirstLevelJump(n); return null; } catch (e) { return String(e).slice(0, 300); } }, seg.jump);
      if (j) { Fail(`跳到 ${seg.jump} 失败：${j}`); continue; }
    }
    const start = await page.evaluate(() => window.Tengxian.audio.ctx.currentTime);
    const samples = [];
    let gameT = 0, lastSample = -1;
    while (gameT < seg.seconds) {
      const t = await page.evaluate(() => window.Tengxian.audio.ctx.currentTime) - start;
      if (t >= seg.seconds * WALL_FACTOR) break;
      // 落后多少就用可变 dt 追（每帧 dt ≤ 50 ms，每轮最多 3 帧）：游戏时间 ≈ 音频时钟，计时器照常回调。
      gameT += await page.evaluate((lag) => {
        const g = window.Tengxian;
        g.player.health = 1e9;
        let left = lag, used = 0, n = 0;
        while (left >= 1 / 60 && n < 3) { const dt = Math.min(left, 0.05); g.StepFrames(1, dt, false); left -= dt; used += dt; n += 1; }
        return used;
      }, t - gameT);
      if (t - lastSample >= 0.1) { lastSample = t; samples.push({ ...(await Sample()), rel: t }); }
      await new Promise((res) => setTimeout(res, 4));
    }
    const peak = samples.reduce((m, s) => (s.live > m.live ? s : m), samples[0] || { live: 0 });
    const settled = samples.filter((s) => s.rel >= 8);
    const row = { seg: seg.label, n: samples.length, gapMax: Math.max(0, ...samples.map((s) => s.gap)), game: +gameT.toFixed(1), peak: peak.live, peakStage: peak.stage,
      p95: [...samples.map((s) => s.live)].sort((x, y) => x - y)[Math.floor(samples.length * 0.95)] ?? 0,
      tankMax: Math.max(0, ...samples.map((s) => s.tank)), storyMax: Math.max(0, ...samples.map((s) => s.story)),
      sharedMax: Math.max(0, ...samples.map((s) => s.shared)), fadingAfter8s: Math.max(0, ...settled.map((s) => s.fading)) };
    report.push(row);
    if (row.game < COVERAGE_MIN * seg.seconds) Fail(`${seg.label} 覆盖不足：只推到 ${row.game} 游戏秒（计划 ${seg.seconds}，音频时钟已走 ${WALL_FACTOR} 倍）`);
    for (const s of samples) {
      if (s.drift !== 0) worst.drift.push(`${seg.label}@${s.rel.toFixed(1)}s drift ${s.drift}`);
      if (s.overdue) worst.overdue.push(`${seg.label}@${s.rel.toFixed(1)}s ${s.overdue} 条（${s.overdueNames.join(",")}，距上一帧 ${s.gap.toFixed(2)} s）`);
    }
    if (peak.live > PEAK_CEILING) Fail(`${seg.label} 实时 liveNodes 峰值 ${peak.live} > ${PEAK_CEILING}（阶段 ${peak.stage}）`);
    if (row.tankMax > 3) Fail(`${seg.label} 战车常驻 loop 同时 ${row.tankMax} 条 > 3`);
    if (row.storyMax > 3) Fail(`${seg.label} 剧情语音同时 ${row.storyMax} 路 > 3`);
    if (row.sharedMax > 8) Fail(`${seg.label} 前线 + 场外炮击同时 ${row.sharedMax} 条 > 8`);
    if (row.fadingAfter8s > 0) Fail(`${seg.label} 开头 8 s 之后还有 ${row.fadingAfter8s} 个淡出中的循环层没拆`);
    // 同步推帧放在 05（打车，最满的一段）实时推完之后：一个 evaluate 推 600 帧（10 s 游戏时间），推完就量。
    if (seg.label === "05") {
      sync = await page.evaluate(({ OVERDUE_S }) => {
        const g = window.Tengxian, a = g.audio;
        const wall = performance.now();
        let peak = 0;
        for (let i = 0; i < 600; i += 1) { g.player.health = 1e9; g.StepFrames(1, 1 / 60, false); peak = Math.max(peak, a.liveNodes); }
        const P = window.__budgetProbe, ref = P.listenerAt ?? a.ctx.currentTime;
        let overdue = 0;
        for (const v of a.pendingVoices) { const due = P.DueAt(v); if (due != null && ref - due > OVERDUE_S) overdue += 1; }
        return { wallS: +((performance.now() - wall) / 1000).toFixed(1), peak, end: a.liveNodes, overdue, swept: a.stats.sweptVoices || 0 };
      }, { OVERDUE_S });
    }
    if (seg.label === "06") {
      const late = samples.filter((s) => s.rel >= 6 && s.tank > 0);
      if (late.length) Fail(`离开 05 之后 6 s 战车 loop 还挂着（${late.length} 次取样，最晚 ${late.at(-1).rel.toFixed(1)} s）`);
    }
  }
  if (worst.drift.length) Fail(`账面对不上 ${worst.drift.length} 次：${worst.drift.slice(0, 5).join("；")}`);
  if (worst.overdue.length) Fail(`过期未收 ${worst.overdue.length} 次：${worst.overdue.slice(0, 5).join("；")}`);
  if (!sync) Fail("同步推帧那一段没跑到");
  else if (sync.peak > PEAK_CEILING || sync.overdue) Fail(`同步推 600 帧：liveNodes 峰值 ${sync.peak}、过期未收 ${sync.overdue} 条（${JSON.stringify(sync)}）`);

  const starved = await page.evaluate(() => Object.entries(window.__budgetProbe.starvedByCue).sort((x, y) => y[1] - x[1]).slice(0, 8));
  console.log("段      取样  游戏秒  峰值  p95  战车loop  剧情语音  前线+炮击  淡出层  取样距上一帧最久(s)");
  for (const r of report) console.log(`${r.seg.padEnd(6)} ${String(r.n).padStart(5)} ${String(r.game).padStart(7)} ${String(r.peak).padStart(5)} ${String(r.p95).padStart(4)} ${String(r.tankMax).padStart(9)} ${String(r.storyMax).padStart(9)} ${String(r.sharedMax).padStart(5)} ${String(r.fadingAfter8s).padStart(7)} ${r.gapMax.toFixed(2).padStart(9)}`);
  if (sync) console.log(`同步推 600 帧（${sync.wallS} s 墙钟）：峰值 ${sync.peak}、推完 ${sync.end}、过期未收 ${sync.overdue} 条、按帧清账累计 ${sync.swept} 条`);
  console.log(`被预算闸饿死最多的 cue：${starved.map(([c, n]) => `${c} ${n}`).join("，") || "无"}`);
  if (errors.length) Fail(`页面报错：${errors.slice(0, 3).join(" | ")}`);
  if (!failed) Ok(`01–06 音频节点：实时峰值 ${Math.max(...report.map((r) => r.peak))} ≤ ${PEAK_CEILING}、账面差 0、无过期未收、`
    + `离开 05 后战车 loop 收走、同步推帧峰值 ${sync?.peak}、推完 ${sync?.end}`);
} catch (err) {
  Fail(String(err?.stack || err).slice(0, 800));
} finally {
  await browser.close();
  server.close();
}
console.log(failed ? `\n音频节点预算门失败 ${failed} 项。` : "\n音频节点预算门全过。");
process.exit(failed ? 1 : 0);
