// 战场远景床「A 底床 + B/C 偶尔叠加（巷道里换 E）」（2026-09-29）：调度规则 + 引擎接线。纯 Node，不开浏览器。
//
// 用户原话（2026-09-29）：「整体A长期存在，B和C交替的随机叠加出现；E在玩家进入巷道/半室内阶段再播放（作为替换偶尔的B和C）」。
//
// 用法：node Taierzhuang1938/Script_BattleBedLayersTest.mjs
//
// 两部分：
//   1. 调度器（Script_BattleBedLayers.BattleBedScheduler，纯规则，假时钟）：
//      配置自检与用户口径（A 底、B/C 交替、E 巷道、D 不用）、随机但可复现、B/C 严格交替、间隔 / 时长 / 淡入淡出落在数据表的范围里、
//      起播点装得进素材且不与上一段同素材的窗口重叠、进巷道后下一段是 E 且不再出 B/C、滞回（门口来回跳不抖、出得慢进得快）、
//      离开后回到 B/C 并接着交替、切档时正在播的一段不硬切（在自己的淡出时长里淡出，已在淡出的不动）、素材没解码好就不出声、
//      没有宿主时停表、节点不足时往后推、换宿主时接着播（Resume）、tick 大小不影响时间线、暂停回来不算过了很久。
//   2. 引擎接线（真 Script_Audio.AudioEngine + 假 AudioContext + 手动推进的时钟与计时器）：
//      叠加段挂在宿主层（battleFar）的组增益上、峰值 = 宿主层电平 × 数据表 gain、S 曲线淡入淡出、出声时 +2 节点放完归还、
//      战场强度 / ShapeFarBeds 改的是同一个组增益（叠加段自动跟着）、听者 zone 探针进出巷道换 E 与 B/C、
//      切档时新宿主接着播、Stop 时叠加段一起淡出并归还、没有 battleFar 层的预设里不起叠加、叠加素材没到不出声、
//      非 layered（legacy / 单选 / none）没有调度器、layer.overlay === false 的层不带。

import assert from "node:assert/strict";
import { BattleBedScheduler, ValidateBattleBedLayers } from "./Script_BattleBedLayers.mjs";
import { BATTLE_BED_LAYERS, BATTLE_BED_VARIANT } from "./Data_Tuning_Audio.mjs";

let failed = 0;
function Check(name, fn) {
  try { fn(); console.log(`ok   ${name}`); } catch (err) { failed += 1; console.log(`FAIL ${name}\n     ${String(err.stack || err.message || err).split("\n").slice(0, 6).join("\n     ")}`); }
}

const C = BATTLE_BED_LAYERS;
const ALL = new Map([["B", 40], ["C", 40], ["E", 40]]);
const TICK = 0.4;

/** 假时钟推进：每 TICK 秒问一次；返回全部 start / release 事件（带时刻）。zoneAt(t) 给听者所在区。 */
function Run(sched, { seconds, zoneAt = () => "open", available = ALL, hosts = () => 1, canStart = () => true, tick = TICK, from = 0 }) {
  const events = [];
  for (let t = from; t <= from + seconds + 1e-9; t += tick) {
    const out = sched.Step({ now: t, zone: zoneAt(t), hosts: hosts(t), available, canStart: canStart(t) });
    if (out.start) events.push({ t, type: "start", ...out.start });
    if (out.release) events.push({ t, type: "release", ...out.release });
    if (out.modeChanged) events.push({ t, type: "mode", mode: out.modeChanged });
  }
  return events;
}
const starts = (events) => events.filter((e) => e.type === "start");

// ---------------------------------------------------------------------------
// 1. 调度器
// ---------------------------------------------------------------------------
Check("数据表：自检通过；用户口径 = A 底、B/C 交替、E 巷道、D 不用；默认档 layered", () => {
  assert.deepEqual(ValidateBattleBedLayers(C), [], "配置自检");
  assert.equal(BATTLE_BED_VARIANT, "layered");
  assert.equal(C.base, "A");
  assert.deepEqual([...C.open], ["B", "C"]);
  assert.deepEqual([...C.enclosed], ["E"]);
  const used = new Set([C.base, ...C.open, ...C.enclosed]);
  assert.ok(!used.has("D"), "D 不用");
  assert.equal(used.size, 4);
  for (const zone of C.enclosedZones) assert.ok(["street", "courtyard", "interior"].includes(zone), `巷道 / 半室内之外的区 ${zone}`);
  assert.ok(!C.enclosedZones.includes("trench") && !C.enclosedZones.includes("dugout") && !C.enclosedZones.includes("open"), "壕沟 / 防炮洞 / 开阔不算");
  for (const key of ["B", "C", "E"]) assert.ok(C.gain[key] > 0 && C.gain[key] < 1, `${key} 叠加电平 ${C.gain[key]} 应在 (0, 1)（低于宿主层）`);
  assert.ok(C.gapS[0] >= 20 && C.durS[1] <= 20 && C.fadeS[0] >= 2 && C.fadeS[1] <= 4, "间隔 / 时长 / 淡入淡出在用户要的量级里");
});

Check("自检抓得住坏配置", () => {
  assert.ok(ValidateBattleBedLayers({ ...C, durS: [4, 6] }).some((p) => /没有平台/.test(p)));
  assert.ok(ValidateBattleBedLayers({ ...C, gapS: [60, 20] }).length);
  assert.ok(ValidateBattleBedLayers({ ...C, gain: { B: 0.5, C: 0.6 } }).some((p) => /gain 缺 E/.test(p)));
  assert.ok(ValidateBattleBedLayers({ ...C, firstKey: "E" }).some((p) => /firstKey/.test(p)));
});

Check("B 与 C 严格交替（从 B 起），间隔 / 时长 / 淡入淡出都在数据表范围里，起播点装得进素材", () => {
  const sched = new BattleBedScheduler(C);
  const ev = starts(Run(sched, { seconds: 3600 }));
  assert.ok(ev.length >= 40, `一小时只起了 ${ev.length} 段`);
  ev.forEach((e, i) => assert.equal(e.key, i % 2 === 0 ? "B" : "C", `第 ${i + 1} 段是 ${e.key}`));
  assert.ok(ev.every((e) => e.mode === "open"));
  const first = ev[0].t;
  assert.ok(first >= C.firstGapS[0] - 1e-6 && first <= C.firstGapS[1] + TICK + 1e-6, `第一段在 ${first.toFixed(1)} s`);
  for (let i = 0; i < ev.length; i += 1) {
    const e = ev[i];
    assert.ok(e.durS >= C.durS[0] - 1e-9 && e.durS <= C.durS[1] + 1e-9, `时长 ${e.durS}`);
    assert.ok(e.fadeInS >= C.fadeS[0] - 1e-9 && e.fadeInS <= C.fadeS[1] + 1e-9, `淡入 ${e.fadeInS}`);
    assert.ok(e.fadeOutS >= C.fadeS[0] - 1e-9 && e.fadeOutS <= C.fadeS[1] + 1e-9, `淡出 ${e.fadeOutS}`);
    assert.ok(e.fadeInS + e.fadeOutS + C.holdMinS <= e.durS + 1e-9, "有平台");
    assert.ok(e.offsetS >= 0 && e.offsetS + e.durS <= 40 - 0.1 + 1e-9, `窗口 ${e.offsetS}+${e.durS} 超出 40 s 素材`);
    assert.equal(e.gain, C.gain[e.key]);
    if (i) {
      const gap = e.t - (ev[i - 1].t + ev[i - 1].durS);
      assert.ok(gap >= C.gapS[0] - 1e-6 && gap <= C.gapS[1] + TICK + 1e-6, `第 ${i + 1} 段前静了 ${gap.toFixed(1)} s`);
    }
  }
  const dur = ev.reduce((s, e) => s + e.durS, 0);
  const duty = dur / 3600;
  assert.ok(duty > 0.15 && duty < 0.4, `一小时里有叠加的时间占 ${(duty * 100).toFixed(0)} %（应是「偶尔」）`);
  // 时长、间隔、起播点真的是随机的（不是常数）
  for (const pick of [(e) => e.durS, (e) => e.offsetS, (e) => e.fadeInS]) assert.ok(new Set(ev.map(pick).map((v) => v.toFixed(3))).size > ev.length * 0.8);
});

Check("随机但可复现：同种子同输入 = 同一条时间线；换种子就不同", () => {
  const a = starts(Run(new BattleBedScheduler(C), { seconds: 1200 }));
  const b = starts(Run(new BattleBedScheduler(C), { seconds: 1200 }));
  assert.deepEqual(a, b);
  const c = starts(Run(new BattleBedScheduler(C, { seed: "另一个种子" }), { seconds: 1200 }));
  assert.notDeepEqual(a.map((e) => [e.t, e.offsetS]), c.map((e) => [e.t, e.offsetS]));
  const s = new BattleBedScheduler(C); Run(s, { seconds: 500 });
  s.Reset();
  assert.deepEqual(starts(Run(s, { seconds: 1200 })), a, "Reset 之后回到开局");
});

Check("tick 大小不影响时间线：每段的键 / 起播点 / 时长 / 淡入淡出一致（起播时刻只差 tick 粒度）", () => {
  const fine = starts(Run(new BattleBedScheduler(C), { seconds: 1500, tick: 0.1 }));
  const coarse = starts(Run(new BattleBedScheduler(C), { seconds: 1500, tick: 0.5 }));
  const n = Math.min(fine.length, coarse.length);
  assert.ok(n >= 15);
  for (let i = 0; i < n; i += 1) {
    const f = fine[i], g = coarse[i];
    assert.deepEqual([f.key, f.offsetS, f.durS, f.fadeInS, f.fadeOutS], [g.key, g.offsetS, g.durS, g.fadeInS, g.fadeOutS], `第 ${i + 1} 段`);
    assert.ok(Math.abs(f.t - g.t) <= 0.5 + 0.1 + i * 0.6, `第 ${i + 1} 段起播时刻差 ${(f.t - g.t).toFixed(2)}`);
  }
});

Check("同一条素材上相邻两段的窗口尽量不重叠（不连着放同一截）", () => {
  const ev = starts(Run(new BattleBedScheduler(C), { seconds: 7200 }));
  const last = new Map();
  let overlapped = 0, total = 0;
  for (const e of ev) {
    const prev = last.get(e.key);
    if (prev) {
      total += 1;
      const overlap = Math.max(0, Math.min(e.offsetS + e.durS, prev[1]) - Math.max(e.offsetS, prev[0]));
      if (overlap / e.durS > 0.5) overlapped += 1;
    }
    last.set(e.key, [e.offsetS, e.offsetS + e.durS]);
  }
  assert.ok(total > 60);
  assert.ok(overlapped / total < 0.08, `${overlapped}/${total} 段与上一段同素材窗口重叠过半`);
});

Check("进巷道（street/courtyard/interior 任一，持续 4 s）后：下一段是 E，不再出 B / C；正在播的旧档那一段淡出不硬切", () => {
  for (const zone of C.enclosedZones) {
    const sched = new BattleBedScheduler(C);
    const enterAt = 200;
    const ev = Run(sched, { seconds: 600, zoneAt: (t) => (t >= enterAt ? zone : "open") });
    const s = starts(ev);
    const flip = ev.find((e) => e.type === "mode" && e.mode === "enclosed");
    assert.ok(flip && flip.t >= enterAt + C.enterHoldS - 1e-6 && flip.t <= enterAt + C.enterHoldS + TICK + 1e-6, `${zone}：切档在 ${flip?.t}`);
    const before = s.filter((e) => e.t < flip.t), after = s.filter((e) => e.t >= flip.t);
    assert.ok(before.length >= 2 && before.every((e) => e.key === "B" || e.key === "C"));
    assert.ok(after.length >= 3, `${zone}：进巷道后只起了 ${after.length} 段`);
    assert.ok(after.every((e) => e.key === "E" && e.mode === "enclosed"), `${zone}：巷道里出了 ${after.map((e) => e.key)}`);
  }
});

Check("切档时正在播的旧档一段：给出淡出（时长 = 它自己的淡出秒数），不硬切；已经在淡出的不动", () => {
  // 找一段 B / C 在 hold 中间的时刻切进巷道。
  const probe = new BattleBedScheduler(C);
  const first = starts(Run(probe, { seconds: 100 }))[0];
  const midAt = first.t + first.durS * 0.5;
  const sched = new BattleBedScheduler(C);
  const ev = Run(sched, { seconds: 100, zoneAt: (t) => (t >= midAt - C.enterHoldS ? "street" : "open") });
  const rel = ev.find((e) => e.type === "release");
  assert.ok(rel, "该有一次 release");
  assert.equal(rel.key, first.key);
  assert.equal(rel.fadeS, first.fadeOutS, "淡出时长 = 这一段自己的淡出秒数（不是硬切）");
  assert.ok(rel.fadeS >= C.fadeS[0], "淡出至少 2 s");
  const row = sched.Snapshot().timeline[0];
  assert.ok(row.released && row.endAt < first.t + first.durS - 0.5 && Math.abs(row.endAt - (row.releasedAt + first.fadeOutS)) < 1e-6);
  assert.ok(row.endAt > row.releasedAt, "还留着淡出的时间");
  // 已经在自己的淡出里再切：让它播完，不发 release。
  const late = new BattleBedScheduler(C);
  const tailAt = first.t + first.durS - first.fadeOutS * 0.5;
  const ev2 = Run(late, { seconds: 100, zoneAt: (t) => (t >= tailAt - C.enterHoldS ? "street" : "open") });
  assert.ok(!ev2.some((e) => e.type === "release" && e.key === first.key), "已经在淡出的那一段不该再被 release");
});

Check("滞回：在门口来回（每 2 s 换一次）不切档；进巷道 4 s、出巷道 8 s", () => {
  const flap = new BattleBedScheduler(C);
  const ev = Run(flap, { seconds: 1200, zoneAt: (t) => (Math.floor(t / 2) % 2 ? "street" : "open") });
  assert.ok(!ev.some((e) => e.type === "mode"), "每 2 s 一换不该切档");
  assert.ok(starts(ev).every((e) => e.key === "B" || e.key === "C"), "全程没进 E");
  // 巷子里有 6 s 的空档（穿过墙缺口）：不算出来
  const gap = new BattleBedScheduler(C);
  const ev2 = Run(gap, { seconds: 300, zoneAt: (t) => (t < 20 ? "open" : (t >= 100 && t < 106 ? "open" : "street")) });
  assert.equal(ev2.filter((e) => e.type === "mode").length, 1, "只进不出");
  // 出来：持续 open 8 s 才回
  const out = new BattleBedScheduler(C);
  const ev3 = Run(out, { seconds: 400, zoneAt: (t) => (t >= 10 && t < 200 ? "street" : "open") });
  const back = ev3.find((e) => e.type === "mode" && e.mode === "open");
  assert.ok(back && back.t >= 200 + C.exitHoldS - 1e-6 && back.t <= 200 + C.exitHoldS + TICK + 1e-6, `出巷道切回在 ${back?.t}`);
});

Check("离开巷道后回到 B / C，并接着交替（中间插了 E 不重排）", () => {
  const sched = new BattleBedScheduler(C);
  const ev = Run(sched, { seconds: 1800, zoneAt: (t) => (t >= 300 && t < 900 ? "courtyard" : "open") });
  const s = starts(ev);
  const seq = s.map((e) => e.key);
  assert.ok(seq.includes("E") && seq.filter((k) => k !== "E").length >= 6);
  const open = seq.filter((k) => k !== "E");
  open.forEach((k, i) => assert.equal(k, i % 2 === 0 ? "B" : "C", `B/C 序列第 ${i + 1} 个是 ${k}：${open.join("")}`));
  const lastE = s.findLast((e) => e.key === "E");
  assert.ok(s.some((e) => e.t > lastE.t && (e.key === "B" || e.key === "C")), "离开后又出 B / C");
  // E 之后接的不是刚播过的同一个：B/C 的下一个是「上一个 B/C 的另一条」
  const modeChanges = ev.filter((e) => e.type === "mode").map((e) => e.mode);
  assert.deepEqual(modeChanges, ["enclosed", "open"]);
});

Check("素材没解码好：不出声；同档别的键到了先用别的；E 没到不拿 B / C 顶", () => {
  const none = new BattleBedScheduler(C);
  assert.equal(starts(Run(none, { seconds: 600, available: new Map() })).length, 0, "一条都没有 = 一段都不起");
  assert.equal(none.stats.started, 0);
  // 只有 C：B 的轮次先放 C，下一个再看 B
  const onlyC = new BattleBedScheduler(C);
  const a = starts(Run(onlyC, { seconds: 400, available: new Map([["C", 40]]) }));
  assert.ok(a.length >= 4 && a.every((e) => e.key === "C"));
  // 后来 B 到了：轮到 B
  const later = new BattleBedScheduler(C);
  const got = starts(Run(later, { seconds: 300, available: new Map([["C", 40]]) }));
  const more = starts(Run(later, { seconds: 600, from: 300.4, available: ALL }));
  assert.ok(got.length >= 3 && more.length >= 4);
  assert.equal(more[0].key, "B", "C 放过之后轮到 B");
  // 巷道里 E 没到：不出（不拿 B / C 顶）
  const noE = new BattleBedScheduler(C);
  const ev = starts(Run(noE, { seconds: 300, zoneAt: () => "street", available: new Map([["B", 40], ["C", 40]]) }));
  assert.equal(ev.length, 0, "巷道里 E 没解码好就一直不出声");
  const arrive = starts(Run(noE, { seconds: 300, from: 300.4, zoneAt: () => "street", available: ALL }));
  assert.ok(arrive.length >= 3 && arrive.every((e) => e.key === "E"), "E 到了就出");
  assert.ok(arrive[0].t - 300.4 < 1.5, "到了下一拍就起（等了很久的这一段不再多等一个间隔）");
});

Check("没有宿主时停表（不计时、不起、不吃随机数）；宿主回来接着走", () => {
  const sched = new BattleBedScheduler(C);
  const ev = Run(sched, { seconds: 1000, hosts: (t) => (t < 5 ? 1 : 0) });
  assert.equal(starts(ev).length, 0, "没有宿主的 1000 s 里不该起");
  const reference = new BattleBedScheduler(C);
  const ref = starts(Run(reference, { seconds: 200 }))[0];
  const back = starts(Run(sched, { seconds: 200, from: 1000.4 }))[0];
  // 停表之前只走了 5 s，第一段还差 (firstGap − 5) s
  assert.ok(back.t - 1000.4 >= ref.t - 5 - TICK - 1e-6 && back.t - 1000.4 <= ref.t - 5 + TICK + 1e-6, `停表后第一段在 ${(back.t - 1000.4).toFixed(1)} s，无停表的参考 ${ref.t.toFixed(1)} s`);
  assert.equal(back.key, ref.key);
  assert.equal(back.offsetS, ref.offsetS, "随机流没被停表期间消耗");
});

Check("宿主中途没了（预设里没有 battleFar 层）：正在播的那一段随宿主结束，不在宿主回来时从半截接上；间隔从宿主回来后重新数", () => {
  const sched = new BattleBedScheduler(C);
  const s = starts(Run(new BattleBedScheduler(C), { seconds: 100 }))[0];
  const at = Math.ceil((s.t + 3) / TICK) * TICK;
  Run(sched, { seconds: at });
  assert.ok(sched.Resume(at), "在播的一段");
  const clockBefore = sched.clock;
  sched.Step({ now: at + TICK, zone: "open", hosts: 0, available: ALL });
  assert.equal(sched.active, null, "宿主没了，这一段也没了");
  assert.equal(sched.Resume(at + TICK), null, "宿主回来时不接");
  assert.equal(sched.clock, clockBefore, "停表：时钟不走");
  assert.ok(sched.nextAt >= clockBefore + C.gapS[0] - 1e-9 && sched.nextAt <= clockBefore + C.gapS[1] + 1e-9, "间隔从宿主回来后数");
  const back = starts(Run(sched, { seconds: 200, from: at + 2 * TICK }));
  assert.ok(back.length >= 1 && back[0].t - (at + 2 * TICK) >= C.gapS[0] - 1e-6, `宿主回来 ${(back[0].t - (at + 2 * TICK)).toFixed(1)} s 后才起下一段`);
});

Check("暂停 / 切后台回来那一拍不算「过了很久」：时钟一次最多前进 tickMaxS", () => {
  const sched = new BattleBedScheduler(C);
  sched.Step({ now: 0, hosts: 1, available: ALL });
  sched.Step({ now: 0.4, hosts: 1, available: ALL });
  const nextAt = sched.nextAt;
  const out = sched.Step({ now: 500.4, hosts: 1, available: ALL });
  assert.equal(out.start, null, "停了 500 s 回来不该立刻起（第一段还没到点）");
  assert.ok(sched.clock <= 0.4 + C.tickMaxS + 1e-9, `调度器时钟 ${sched.clock}`);
  assert.equal(sched.nextAt, nextAt);
});

Check("节点不足时往后推（canStart = false）：不起、不吃随机数，有余量的下一拍就起", () => {
  const sched = new BattleBedScheduler(C);
  const ref = starts(Run(new BattleBedScheduler(C), { seconds: 100 }))[0];
  const blocked = Run(sched, { seconds: ref.t + 30, canStart: () => false });
  assert.equal(starts(blocked).length, 0);
  assert.ok(sched.stats.deferred > 10);
  const ok = starts(Run(sched, { seconds: 5, from: ref.t + 30.4 }));
  assert.equal(ok.length, 1);
  assert.equal(ok[0].offsetS, ref.offsetS, "随机流没被推迟期间消耗");
});

Check("换宿主时接着播（Resume）：同一条素材、起播点顺着往下、剩多少放多少；剩得太少不接；没有在播的返回 null", () => {
  assert.equal(new BattleBedScheduler(C).Resume(0), null);
  const s = starts(Run(new BattleBedScheduler(C), { seconds: 100 }))[0];   // 探路：第一段什么时候起、什么样
  const Fresh = (until) => { const x = new BattleBedScheduler(C); Run(x, { seconds: until }); return x; };
  const at = Math.ceil((s.t + 6) / TICK) * TICK;
  const sched = Fresh(at);
  const r = sched.Resume(at);
  assert.ok(r && r.resumed && r.key === s.key, JSON.stringify(r));
  const played = at - s.t;
  assert.ok(Math.abs(r.offsetS - (s.offsetS + played)) < TICK + 1e-6, `接着放的起播点 ${r.offsetS} vs ${s.offsetS + played}`);
  assert.ok(Math.abs(r.durS - (s.durS - played)) < TICK + 1e-6);
  assert.ok(r.fadeInS >= 0.2 && r.fadeInS <= C.joinFadeS + 1e-9);
  assert.ok(r.fadeInS + r.fadeOutS <= r.durS, "淡入 + 淡出装得进剩下的时间");
  assert.ok(r.offsetS + r.durS <= 40 - 0.05, "接着放的窗口没出素材");
  assert.equal(r.gain, s.gain);
  const noMutate = JSON.stringify(sched.Snapshot());
  sched.Resume(at);
  assert.equal(JSON.stringify(sched.Snapshot()), noMutate, "Resume 不改状态");
  const nearEnd = Math.floor((s.t + s.durS - 1) / TICK) * TICK;
  assert.equal(Fresh(nearEnd).Resume(nearEnd), null, "只剩 1 s 不接");
});

Check("调参口：Configure 合并配置（把间隔压短），状态不重置", () => {
  const sched = new BattleBedScheduler(C);
  sched.Configure({ firstGapS: [1, 1.5], gapS: [2, 3], durS: [9, 10] });
  const ev = starts(Run(sched, { seconds: 120 }));
  assert.ok(ev.length >= 8 && ev[0].t <= 2.5);
  assert.throws(() => { C.gapS[0] = 1; }, TypeError, "数据表是冻结的（Configure 改的是调度器自己的副本）");
  assert.equal(C.gapS[0], 20);
});
// ---------------------------------------------------------------------------
// 2. 引擎接线：真 AudioEngine + 假 AudioContext + 手动推进的时钟与计时器
// ---------------------------------------------------------------------------
const { AudioEngine, AMBIENCE_PRESETS } = await import("./Script_Audio.mjs");

function FakeParam(initial = 0) {
  return {
    value: initial, events: [],
    setValueAtTime(v, t) { this.events.push(["set", v, t]); this.value = v; return this; },
    linearRampToValueAtTime(v, t) { this.events.push(["lin", v, t]); this.value = v; return this; },
    exponentialRampToValueAtTime(v, t) { this.events.push(["exp", v, t]); this.value = v; return this; },
    setTargetAtTime(v, t, k) { this.events.push(["target", v, t, k]); this.value = v; return this; },
    cancelScheduledValues(t) { this.events.push(["cancel", t]); return this; },
  };
}
function FakeNode(kind, extra = {}) {
  return { kind, out: null, connect(n) { this.out = n; return n; }, disconnect() { this.out = null; }, ...extra };
}

// LoopLayer / 引擎用全局 clearTimeout 收计时器；假计时器是 { fake: true } 的对象，其余交给真的。
const realClearTimeout = globalThis.clearTimeout;
globalThis.clearTimeout = (h) => { if (h && h.fake) { h.cancelled = true; return; } return realClearTimeout(h); };

/** 引擎账上的节点：循环层的播放头 ×2 + 组增益 + 低通（与 Script_FirstLevelAudioNodeBudgetTest 同一口径）。 */
const LayerNodes = (engine) => engine.ambLayers.reduce((n, l) => n + l.heads.size * 2 + (l.group ? 1 : 0) + (l.filter ? 1 : 0), 0);

function Harness({ zone = { v: "open" }, longSegments = false } = {}) {
  const timers = [];
  const ctx = {
    currentTime: 0,
    createGain() { return FakeNode("gain", { gain: FakeParam(1) }); },
    createBiquadFilter() { return FakeNode("filter", { frequency: FakeParam(350), Q: FakeParam(1), type: "" }); },
    createBufferSource() {
      return FakeNode("source", { started: null, stopped: false, buffer: null,
        start(at, offset, dur) { this.started = { at, offset, dur }; }, stop() { this.stopped = true; } });
    },
  };
  const engine = new AudioEngine({ enabled: false });
  engine.ctx = ctx;
  engine.ambienceBus = FakeNode("bus", { name: "ambience" });
  engine.sfxBus = FakeNode("bus", { name: "sfx" });
  engine.farGain = FakeNode("bus", { name: "far" });
  engine.ScheduleAmbienceEvent = () => {};                  // 撒播不在这里测（会去调 Play）
  let id = 0;
  engine.Later = (ms, fn) => {
    const t = { fake: true, id: ++id, at: ctx.currentTime * 1000 + ms, fn, cancelled: false };
    timers.push(t);
    engine.timers.add(t);
    return t;
  };
  for (const [name, seconds] of [["battleFar", 40], ["windPlain", 23], ["shellingFar", 17], ["dawnField", 29], ["fireFar", 11], ["trainInterior", 30]]) {
    engine.ambBuffers.set(name, { duration: seconds, name });
  }
  engine.bedOverlaySched = new BattleBedScheduler(C);
  if (longSegments) engine.ConfigureBedOverlay({ durS: [16, 20] });
  engine.SetProbes({ zone: () => zone.v });
  const live = () => timers.filter((t) => !t.cancelled);
  return {
    engine, ctx, zone, timers, live,
    Load(keys = ["B", "C", "E"]) { for (const k of keys) engine.bedOverlayBuffers.set(k, { duration: 40, name: k }); },
    /** 推进 seconds 秒：每 0.1 s 跑到点的计时器，每 0.4 s 心跳一次（与线上 AMB_TICK_MS 同）。 */
    Advance(seconds) {
      const end = ctx.currentTime + seconds;
      while (ctx.currentTime < end - 1e-9) {
        ctx.currentTime = Math.min(end, ctx.currentTime + 0.1);
        for (const t of live().filter((x) => x.at <= ctx.currentTime * 1000).sort((a, b) => a.at - b.at)) {
          if (t.cancelled) continue;
          t.cancelled = true; engine.timers.delete(t); t.fn();
        }
        if (Math.abs(ctx.currentTime / TICK - Math.round(ctx.currentTime / TICK)) < 1e-6) engine.TickBedOverlay();
      }
    },
    /** 推进到有叠加段在放为止（最多 maxS 秒），返回那一段。 */
    UntilOverlay(maxS = 90) {
      for (let t = 0; t < maxS; t += TICK) {
        const now = this.Overlays();
        if (now.length) return now[0];
        this.Advance(TICK);
      }
      return null;
    },
    Overlays() { return engine.ambLayers.flatMap((l) => [...l.heads].filter((x) => x.overlay).map((x) => ({ layer: l, head: x }))); },
    HostLayer() { return engine.ambLayers.find((l) => l.bed === "battleFar"); },
  };
}

Check("引擎：叠加段挂在宿主层组增益上、峰值 = 层电平 × gain、S 曲线淡入淡出、出声 +2 节点、放完归还、账面对得上", () => {
  const h = Harness();
  h.Load();
  h.engine.Ambience("firstLevelFront");
  const host = h.HostLayer();
  assert.ok(host && host.overlayHost && host.group, "battleFar 层是宿主");
  assert.equal(host.busName, "far");
  assert.equal(h.Overlays().length, 0, "开局不出声（叠加不出声时 0 个节点）");
  const o = h.UntilOverlay();
  assert.ok(o, "第一段该起了");
  assert.equal(o.head.overlay, "B", "第一段是 B");
  assert.equal(o.head.g.out, host.group, "g → 宿主层的组增益（同一条链）");
  assert.equal(o.head.src.out, o.head.g);
  assert.equal(host.group.out, h.engine.farGain, "宿主自己接远声组");
  assert.equal(h.engine.liveNodes, LayerNodes(h.engine), "叠加段起来之后账面对得上");
  const ev = o.head.g.gain.events;
  const peak = host.level * C.gain.B;
  const lin = ev.filter((e) => e[0] === "lin");
  assert.ok(Math.abs(Math.max(...lin.map((e) => e[1])) - peak) < 1e-9, `峰值 ≠ 宿主层电平 ${host.level} × ${C.gain.B}`);
  assert.ok(peak < host.level, "叠加低于宿主层");
  assert.equal(lin.length, 8, "淡入淡出各四段 S 曲线");
  assert.ok(ev[0][0] === "set" && ev[0][1] <= 1e-4 + 1e-12, "从地板起");
  const times = lin.map((e) => e[2]);
  assert.deepEqual([...times].sort((a, b) => a - b), times, "时间单调");
  assert.ok(Math.abs(lin[1][1] - (1e-4 + (peak - 1e-4) * 0.5)) < 1e-9, "淡入中点 = 峰值一半（smoothstep）");
  assert.ok(Math.abs(lin[7][1] - 1e-4) < 1e-12, "最后落回地板");
  const st = o.head.src.started;
  assert.ok(st.offset >= 0 && st.offset + st.dur <= 40 + 0.06, `窗口 ${st.offset}+${st.dur} 超出素材`);
  assert.equal(o.head.src.buffer.name, "B");
  // 拆一个叠加播放头 = 归还 2 个节点
  const n0 = h.engine.liveNodes;
  const h2 = Harness();
  h2.Load(); h2.engine.Ambience("firstLevelFront");
  const o2 = h2.UntilOverlay();
  const n1 = h2.engine.liveNodes;
  h2.HostLayer().Kill(o2.head);
  assert.equal(n1 - h2.engine.liveNodes, 2, "一段叠加 = 2 个节点");
  assert.ok(n0 > 0);
  // 放完：拆掉、归还、账面仍对得上
  h.Advance(C.durS[1] + 1);
  assert.equal(h.Overlays().length, 0, "放完拆掉");
  assert.ok(o.head.src.stopped);
  assert.equal(h.engine.liveNodes, LayerNodes(h.engine), "放完之后账面对得上");
  assert.ok(h.engine.stats.bedOverlaySegments >= 1);
});

Check("引擎：战场强度与 ShapeFarBeds 写在宿主层同一个组增益 / 低通上，叠加段自己的增益自动化不动", () => {
  const h = Harness();
  h.Load();
  h.engine.Ambience("firstLevelFront");                    // battle: true 的远声床，没有 cut
  const host = h.HostLayer();
  const o = h.UntilOverlay();
  const before = o.head.g.gain.events.length;
  h.engine.SetBattleIntensity(0);
  const low = host.group.gain.value;
  h.engine.SetBattleIntensity(1);
  assert.ok(host.group.gain.value > low + 0.3, `战场强度写在组增益：${low} → ${host.group.gain.value}`);
  h.engine.ShapeFarBeds({ level: 2, cut: 1, rampS: 0.5 });
  assert.ok(Math.abs(host.group.gain.value - host.levelScale * 2) < 1e-9, "调形写在同一个组增益上");
  assert.equal(o.head.g.gain.events.length, before, "叠加段自己的增益自动化一条没多");
  // 开场洞里那档：远声床带 cut 480，调形同时开低通
  const d = Harness();
  d.Load();
  d.engine.Ambience("firstLevelOpeningDugout");
  const dh = d.HostLayer();
  const od = d.UntilOverlay();
  assert.equal(dh.cut, 480);
  assert.equal(od.head.g.out, dh.group);
  assert.equal(dh.group.out, dh.filter, "叠加 → 宿主组增益 → 宿主的低通（洞里的 cut）→ 远声组");
  d.engine.ShapeFarBeds({ level: 2.6, cut: 3.2, rampS: 0.5 });
  assert.ok(Math.abs(dh.filter.frequency.value - 480 * 3.2) < 1e-6, "传令兵喊话时洞口打开：同一个低通被拉开");
  assert.ok(Math.abs(dh.group.gain.value - 2.6) < 1e-9);
});

Check("引擎：听者 zone 探针进巷道 → 下一段换 E（B/C 不再出）；离开回 B/C；正在播的旧档一段淡出而不是硬停", () => {
  const h = Harness({ longSegments: true });
  h.Load();
  h.engine.Ambience("firstLevelFront");
  const host = h.HostLayer();
  // 先在开阔地放一段 B，放着放着走进巷子
  const b = h.UntilOverlay();
  assert.equal(b.head.overlay, "B");
  h.Advance(1);
  h.zone.v = "street";
  h.Advance(C.enterHoldS + 1.2);
  assert.equal(h.engine.bedOverlaySched.mode, "enclosed");
  const events = b.head.g.gain.events;
  const cancel = events.findIndex((e) => e[0] === "cancel");
  assert.ok(b.head.releasing && cancel >= 0, "正在播的 B 被收尾");
  assert.ok(events.slice(cancel).some((e) => e[0] === "lin"), "收尾是斜坡淡出，不是 stop");
  assert.equal(b.head.src.stopped, false, "淡出期间没有被硬停");
  h.Advance(6);
  assert.ok(b.head.src.stopped, "淡完拆掉");
  assert.equal(h.engine.liveNodes, LayerNodes(h.engine));
  // 之后的段都是 E
  const seen = [];
  const orig = host.PlayOverlay.bind(host);
  host.PlayOverlay = (buf, seg) => { seen.push(seg.key); return orig(buf, seg); };
  h.Advance(400);
  assert.ok(seen.length >= 4 && seen.every((k) => k === "E"), `巷子里放了 ${seen}`);
  // 离开：8 s 后回 B / C
  h.zone.v = "open";
  h.Advance(C.exitHoldS + 1);
  assert.equal(h.engine.bedOverlaySched.mode, "open");
  seen.length = 0;
  h.Advance(400);
  assert.ok(seen.length >= 4 && seen.every((k) => k === "B" || k === "C"), `出来之后放了 ${seen}`);
});

Check("引擎：trench / dugout / open 不算巷道，courtyard / interior / street 算；没有探针 = 按开阔", () => {
  for (const [zone, want] of [["trench", "open"], ["dugout", "open"], ["open", "open"], ["courtyard", "enclosed"], ["interior", "enclosed"], ["street", "enclosed"]]) {
    const h = Harness({ zone: { v: zone } });
    h.Load();
    h.engine.Ambience("firstLevelFront");
    h.Advance(20);
    assert.equal(h.engine.bedOverlaySched.mode, want, `${zone} → ${h.engine.bedOverlaySched.mode}`);
  }
  const h = Harness();
  h.Load();
  h.engine.SetProbes({ zone: null });
  h.engine.Ambience("firstLevelFront");
  h.Advance(30);
  assert.equal(h.engine.bedOverlaySched.mode, "open");
  assert.equal(h.engine.bedOverlaySched.Snapshot().zoneIn, false);
});

Check("引擎：叠加素材没解码好不出声；解码好之后才出（B 的轮次先放先到的 C）", () => {
  const h = Harness();
  h.engine.Ambience("firstLevelFront");
  h.Advance(120);
  assert.equal(h.Overlays().length, 0);
  assert.equal(h.engine.stats.bedOverlaySegments, 0);
  h.Load(["C"]);
  h.Advance(C.gapS[1] + 30);
  assert.ok(h.engine.stats.bedOverlaySegments >= 1, "C 到了就出");
  assert.equal(h.engine.errorCount, 0);
  assert.ok(h.engine.BedOverlayState().scheduler.timeline.every((r) => r.key === "C"));
});

Check("引擎：换预设（硬切与交叉）时正在播的一段由新宿主接着播，旧宿主的那段随旧层收掉；停掉后节点归零、没有计时器留着", () => {
  for (const fadeS of [0, 1.6]) {
    const h = Harness({ longSegments: true });
    h.Load();
    h.engine.Ambience("firstLevelFront");
    const before = h.UntilOverlay();
    assert.ok(before);
    h.Advance(1);
    const oldLayer = h.HostLayer();
    const started = before.head.src.started;
    h.engine.Ambience("firstLevelSouth", { fadeS });
    const [after] = h.Overlays().filter((x) => x.layer !== oldLayer);
    assert.ok(after, `fadeS=${fadeS}：新宿主上该有接着播的一段`);
    assert.equal(after.head.overlay, before.head.overlay, "同一条素材");
    assert.ok(after.head.src.started.offset > started.offset + 0.5, "起播点顺着往下");
    assert.ok(after.head.src.started.offset + after.head.src.started.dur <= 40 + 0.06);
    assert.equal(after.head.g.out, after.layer.group);
    if (fadeS === 0) assert.equal(oldLayer.heads.size, 0, "硬切：旧层的播放头（含叠加段）全收");
    else {
      assert.ok([...oldLayer.heads].some((x) => x.overlay), "交叉：旧层的叠加段跟着旧层淡出");
      h.Advance(fadeS + 0.5);
      assert.equal(oldLayer.heads.size, 0, "淡完旧层的播放头全部回收");
    }
    h.Advance(C.durS[1] + 2);
    assert.equal(h.Overlays().length, 0, "接着播的一段放完也拆掉");
    assert.equal(h.engine.liveNodes, LayerNodes(h.engine), "账面对得上");
    h.engine.Ambience("silence");
    h.Advance(3);
    assert.equal(h.engine.liveNodes, 0, `fadeS=${fadeS}：全部停掉后节点归零，现在 ${h.engine.liveNodes}`);
    assert.equal(h.live().length, 0, `fadeS=${fadeS}：停掉后还有 ${h.live().length} 个计时器`);
  }
});

Check("引擎：没有 battleFar 层的预设里不起叠加、调度器停表；layer.overlay === false 的层不带", () => {
  const h = Harness();
  h.Load();
  h.engine.Ambience("trainInterior");
  h.Advance(200);
  assert.equal(h.Overlays().length, 0);
  assert.equal(h.engine.bedOverlaySched.Snapshot().clock, 0, "没有宿主时调度器一秒都没走");
  const saved = AMBIENCE_PRESETS.dusk.layers.find((l) => l.bed === "battleFar");
  const h2 = Harness();
  h2.Load();
  const layersBackup = AMBIENCE_PRESETS.dusk.layers;
  AMBIENCE_PRESETS.dusk.layers = [{ ...saved, overlay: false }];
  try {
    h2.engine.Ambience("dusk");
    assert.equal(h2.HostLayer().overlayHost, false);
    h2.Advance(200);
    assert.equal(h2.Overlays().length, 0);
  } finally { AMBIENCE_PRESETS.dusk.layers = layersBackup; }
});

Check("引擎：离节点预算上限不足 nodeReserve 个时叠加往后推；有余量之后才起", () => {
  const h = Harness();
  h.Load();
  h.engine.Ambience("firstLevelFront");
  h.engine.nodeBudget = h.engine.liveNodes + (C.nodeReserve - 1);
  h.Advance(C.firstGapS[1] + 30);
  assert.equal(h.engine.stats.bedOverlaySegments, 0, "离上限不足 nodeReserve 个：不起");
  assert.ok(h.engine.bedOverlaySched.stats.deferred > 0);
  h.engine.nodeBudget = 120;
  h.Advance(2);
  assert.equal(h.engine.stats.bedOverlaySegments, 1, "有余量之后起了");
});

Check("引擎：非 layered（没有调度器）不装宿主也不心跳；BedOverlayState / ConfigureBedOverlay 取证与调参接口", () => {
  const h = Harness();
  h.Load();
  h.engine.bedOverlaySched = null;
  h.engine.Ambience("firstLevelFront");
  assert.equal(h.HostLayer().overlayHost, false);
  h.Advance(120);
  assert.equal(h.Overlays().length, 0);
  assert.equal(h.engine.TickBedOverlay(), null);
  assert.equal(h.engine.ConfigureBedOverlay({ x: 1 }), null);
  assert.equal(h.engine.BedOverlayState().scheduler, null);
  const g = Harness();
  g.Load(["B"]);
  assert.deepEqual(g.engine.ConfigureBedOverlay({ firstGapS: [1, 1.5], gapS: [2, 3] }).firstGapS, [1, 1.5]);
  g.engine.Ambience("firstLevelFront");
  g.Advance(80);
  const st = g.engine.BedOverlayState();
  assert.deepEqual(st.loaded, ["B"]);
  assert.equal(st.hosts, 1);
  assert.ok(st.scheduler.timeline.length >= 4 && st.scheduler.timeline.every((r) => r.key === "B"));
  assert.equal(g.engine.errorCount, 0);
});

console.log(failed ? `\n${failed} 项失败` : "\n全部通过");
process.exit(failed ? 1 : 0);
