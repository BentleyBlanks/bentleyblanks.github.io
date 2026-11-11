// 近爆眩晕的规则层（纯 Node）：stun 窗（Script_BlastExposure）与时间包络 / 通道（Script_BlastStun）。
// 浏览器那一半（真炸、后期合成的色差、拖影 pass、ldr 指向）在 Script_BlastFeedbackTest.mjs。
// 用法：node Taierzhuang1938/Script_BlastStunTest.mjs
import assert from "node:assert/strict";
import { BlastExposure, ChargeKgFor } from "./Script_BlastExposure.mjs";
import { BlastStun } from "./Script_BlastStun.mjs";
import { BLAST_STUN, BLAST_EXPOSURE } from "./Data_Tuning_BlastReaction.mjs";

let groups = 0;
const Group = (name, fn) => { fn(); groups += 1; console.log(`ok  ${name}`); };
const Exposure = (id, d, opts = {}) => BlastExposure({ distanceM: d, chargeKg: ChargeKgFor(id, 6.5), ...opts });
const Stun = (id, d, opts) => Exposure(id, d, opts).stun;
const Run = (stun, seconds, dt = 1 / 60, each = null) => {
  const n = Math.round(seconds / dt);
  for (let i = 0; i < n; i += 1) { stun.Update(dt); each?.(stun, (i + 1) * dt); }
};
/** 一发炸完，返回 { peak, peakAt, tLow }：峰值 level、到峰时刻、level 降到 0.02 的时刻（均从冲击到人那一刻算）。 */
const Envelope = (exposure) => {
  const stun = new BlastStun();
  stun.Blast(exposure);
  const t0 = -exposure.arrivalS;
  let peak = 0, peakAt = 0, tLow = Infinity;
  Run(stun, 30 + exposure.arrivalS, 1 / 60, (s, t) => {
    const u = t + t0;
    if (s.level > peak) { peak = s.level; peakAt = u; }
    if (u > peakAt && s.level < 0.02 && tLow === Infinity) tLow = u;
  });
  return { peak, peakAt, tLow, stun };
};

Group("stun 窗：近 > 远，20 m 起、25 m 及以外为零，遮挡更弱，大装药更强", () => {
  const d2 = Stun("Grenade", 2), d5 = Stun("Grenade", 5), d12 = Stun("Grenade", 12);
  assert.ok(d2 > d5 && d5 > d12 && d12 > 0, `手榴弹 2/5/12 m：${d2} ${d5} ${d12}`);
  assert.ok(d2 > 0.9, `2 m 近满：${d2}`);
  assert.ok(Math.abs(d5 - 0.54) < 0.12, `5 m 约 0.54：${d5}`);
  assert.ok(Stun("Grenade", 20) > 0 && Stun("Grenade", 20) < 0.08, "20 m 刚出闸");
  for (const d of [25, 35, 60, 150]) assert.equal(Stun("Grenade", d), 0, `${d} m 为零`);
  assert.ok(Stun("Grenade", 8, { occluded: true }) < Stun("Grenade", 8), "遮挡更弱");
  assert.ok(Stun("Shell150", 12) > Stun("Grenade", 12), "150 毫米榴弹同距离比手榴弹强");
  assert.equal(BLAST_EXPOSURE.windows.stun.length, 3);
  assert.ok(Exposure("Grenade", 20).any, "any 或上 stun");
  assert.equal(Exposure("Grenade", 500).any, false);
});

Group("包络：到达前为零、attack 后达峰、强的比弱的久、最终归零", () => {
  const stun = new BlastStun();
  const e = Exposure("Grenade", 3);
  assert.ok(e.arrivalS > 0);
  stun.Blast(e);
  assert.ok(stun.Active);
  stun.Update(e.arrivalS * 0.5);
  assert.equal(stun.level, 0, "冲击波还在路上");
  const near = Envelope(Exposure("Grenade", 3)), mid = Envelope(Exposure("Grenade", 12));
  assert.ok(near.peak > 0.6, `3 m 峰值 ${near.peak}`);
  assert.ok(mid.peak > 0 && mid.peak < 0.3, `12 m 峰值 ${mid.peak}`);
  assert.ok(near.peakAt - 0 < BLAST_STUN.attackS + BLAST_STUN.holdMinS + 0.2, `峰在 attack 之后不久 ${near.peakAt}`);
  assert.ok(near.tLow > mid.tLow, `强的持续更久 ${near.tLow} vs ${mid.tLow}`);
  assert.ok(near.tLow < 30, "会降到 0.02");
  for (const env of [near, mid]) {
    assert.equal(env.stun.Active, false, "最终不再 Active");
    const s = env.stun.State();
    assert.deepEqual([s.level, s.chroma, s.trailTauS, s.double, s.haze.amount, s.haze.focus, s.audio, s.roll, s.pitch, s.yaw], new Array(10).fill(0));
  }
  const weak = new BlastStun();
  assert.equal(weak.Blast({ stun: BLAST_STUN.minStrength * 0.5, arrivalS: 0 }), null, "低于 minStrength 忽略");
  assert.equal(weak.Blast(null), null);
  assert.equal(weak.Active, false);
});

Group("连发叠加：不小于单发、不超过 1、事件数有上限", () => {
  const single = new BlastStun(); single.Blast({ stun: 0.5, arrivalS: 0 });
  const multi = new BlastStun();
  for (let i = 0; i < 3; i += 1) multi.Blast({ stun: 0.5, arrivalS: 0 });
  Run(single, 0.5); Run(multi, 0.5);
  assert.ok(multi.level >= single.level, `${multi.level} >= ${single.level}`);
  assert.ok(multi.level <= 1);
  const flood = new BlastStun();
  for (let i = 0; i < 20; i += 1) flood.Blast({ stun: 1, arrivalS: 0 });
  Run(flood, 0.5);
  assert.ok(flood.level <= 1 && flood.events.length <= BLAST_STUN.maxEvents);
});

Group("calm：相机三轴恒 0，色散仍在；非 calm 时慢晃确定且有幅度", () => {
  const run = (calm) => {
    const s = new BlastStun(); s.calm = calm; s.Blast({ stun: 1, arrivalS: 0 });
    let maxAbs = 0, chroma = 0;
    const trace = [];
    Run(s, 3, 1 / 60, (x) => {
      maxAbs = Math.max(maxAbs, Math.abs(x.roll), Math.abs(x.pitch), Math.abs(x.yaw));
      chroma = Math.max(chroma, x.chroma);
      trace.push(x.roll);
    });
    return { maxAbs, chroma, trace };
  };
  const calm = run(true), lively = run(false), again = run(false);
  assert.equal(calm.maxAbs, 0);
  assert.ok(calm.chroma > 0);
  assert.ok(lively.maxAbs > 0.003 && lively.maxAbs <= BLAST_STUN.sway.rollRad + 1e-9, `${lively.maxAbs}`);
  assert.deepEqual(lively.trace, again.trace, "确定性：同样的输入同样的晃");
});

Group("Reset 清零；各通道随强度单调", () => {
  const s = new BlastStun(); s.Blast({ stun: 0.9, arrivalS: 0 }); Run(s, 0.4);
  assert.ok(s.Active && s.level > 0);
  s.Reset();
  assert.equal(s.Active, false);
  assert.equal(s.level, 0); assert.equal(s.chroma, 0); assert.equal(s.audio, 0);
  const at = (v) => { const x = new BlastStun(); x.Blast({ stun: v, arrivalS: 0 }); Run(x, 0.45); return x.State(); };
  const lows = [0.1, 0.3, 0.6, 1].map(at);
  for (const key of ["level", "chroma", "trailTauS", "double", "audio"]) {
    for (let i = 1; i < lows.length; i += 1) assert.ok(lows[i][key] > lows[i - 1][key], `${key} 单调`);
  }
  for (let i = 1; i < lows.length; i += 1) {
    assert.ok(lows[i].haze.amount > lows[i - 1].haze.amount && lows[i].haze.focus > lows[i - 1].haze.focus, "haze 单调");
  }
  const full = lows[3];
  assert.ok(Math.abs(full.chroma - BLAST_STUN.chroma.max) < 1e-9);
  assert.ok(full.audio <= BLAST_STUN.audio.max + 1e-9 && full.double <= 1 && full.haze.amount <= 1);
  assert.equal(at(0.02).level, 0, "低于 minStrength 不起");
  assert.equal(new BlastStun().State().trailTauS, 0);
});

console.log(`PASS BlastStun: ${groups} groups`);
