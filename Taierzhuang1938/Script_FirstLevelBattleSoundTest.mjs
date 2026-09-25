// Script_FirstLevelBattleSoundTest.mjs — 第一关 01–05 声景的纯 Node 门禁（2026-09-23）。
//
// 覆盖：远处交火生成器（01 立刻开始、两边来回、300 m 以外、声部上限、让位、对白少起、
// 07 以后回到旧声源）、场外近落弹（落点、避人、先见后闻、震屏跟声音、沟里落土、近爆后静默、
// 洞里闷）、防炮洞环境床切换（强制 / 按空间档带滞回）、接线层的壕沟/洞室判据与压制喘息心跳、
// 耳鸣两档数据、01–05 配乐让位与标点。
// 2026-09-24 审查后补：真 CameraShake 量轻震（45/75/140 m、沟里/洞里都要震得到）、
// 炮击每一条声音都进声部账（本层 ≤ maxVoices、与前线合计 ≤ 8，各跑 15 分钟量峰值）、
// 避开在场的战车、越得过沟沿的土柱、01 按洞里算落土、进步骤头一发不抽稀、
// 运行时每局换种子、配乐标点冷启动不误触发。
// 浏览器侧（真 AudioContext、混响六档、耳鸣节点）在 Script_AudioTest / Script_AudioWiringTest。
import assert from "node:assert/strict";
import { MISSION_BATTLE_SOUND as D } from "./Data_FirstLevelMissionBattleSound.mjs";
import { FirstLevelMissionBattleSound } from "./Script_FirstLevelMissionBattleSound.mjs";
import { BattleArtillery } from "./Script_BattleArtillery.mjs";
import { AudioWiring } from "./Script_AudioWiring.mjs";
import { TINNITUS, BATTLE_ARTILLERY, SUPPRESSION_BODY, TRENCH_ZONE } from "./Data_Tuning_Audio.mjs";
import { FirstLevelMusicState, FIRST_LEVEL_MUSIC_COMBAT } from "./Data_FirstLevelMissionMusic.mjs";
import { FirstLevelMissionMusic } from "./Script_FirstLevelMissionMusic.mjs";
import { CameraShake } from "./Script_CameraShake.mjs";

let passed = 0;
function Ok(name) { passed += 1; console.log(`ok  ${name}`); }

/** 假引擎：记下每一次 Play，声部按给定寿命自己结束。 */
function FakeAudio({ listener = { x: 0, y: 1.6, z: -150 }, life = 2.0, zone = "open" } = {}) {
  const a = {
    listenerPos: listener, battleIntensity: 0, pendingVoices: new Set(), ambiencePreset: "smokyDay",
    clock: 0, calls: [], ambience: [], zone, timers: [],
    Play(cue, o = {}) { const v = { cue }; a.calls.push({ t: a.clock, cue, ...o }); a.pendingVoices.add(v); a.timers.push([a.clock + life, v]); return v; },
    Ambience(p, o = {}) { a.ambiencePreset = p; a.ambience.push({ t: a.clock, p, ...o }); },
    ListenerZone() { return a.zone; },
    Tick(dt) { a.clock += dt; a.timers = a.timers.filter(([at, v]) => (at <= a.clock ? (a.pendingVoices.delete(v), false) : true)); },
  };
  return a;
}
function Run(sound, audio, stage, seconds, { dt = 1 / 30, speaking = false } = {}) {
  for (let t = 0; t < seconds; t += dt) { audio.Tick(dt); sound.Update(dt, stage, speaking); }
}
const Dist = (c, L) => Math.hypot(c.position.x - L.x, c.position.z - L.z);

// ---------------------------------------------------------------------------
// 1) 远处交火生成器
// ---------------------------------------------------------------------------
{
  const audio = FakeAudio();
  const sound = new FirstLevelMissionBattleSound(audio, null);
  Run(sound, audio, "Trapped", 1.3);
  const first = audio.calls.filter((c) => c.soundField);
  assert.ok(first.length > 0 && first[0].t <= D.front.firstWithinS + 0.05,
    `01 一进来 ${D.front.firstWithinS} s 内就有远处的枪炮声（实际第一声 ${first[0]?.t?.toFixed(2)} s）`);
  Ok(`01 首声 ${first[0].t.toFixed(2)} s（旧口径 24 s）`);
  Run(sound, audio, "Trapped", 60);
  const front = audio.calls.filter((c) => c.soundField);
  // 真实距离（Place 之前）记在 State().front.recent 里；摆位不超过 placeMaxM。
  assert.ok(front.every((c) => Dist(c, audio.listenerPos) <= D.front.placeMaxM + 1 && c.bus === "sfx"
    && c.airCut <= D.front.stages.Trapped.airCut), "01：全部隔着土、全部走 sfx（远声组）、摆位不出 1000 m 的 soundField");
  const recent = sound.frontRecent;
  assert.ok(recent.every((r) => r.distance >= 280), `远处前线都在 280 m 以外：最近 ${Math.min(...recent.map((r) => r.distance))} m`);
  Ok(`01 一分钟 ${front.length} 声，全部闷、全在 ${Math.min(...recent.map((r) => r.distance))} m 以外`);
}
{
  // 【2026-09-25】前线每一声都带 selfCapped（声部数由 maxVoices / sharedMaxVoices 自己管，引擎不再按「远 = 低优先级」
  // 套 0.62 天花板 —— 01 近爆后黑屏 2.6 s 里前线整段被那道天花板饿死）。引擎侧的天花板断言在 Script_AudioTest。
  // 统计口径：引擎拒收记进 front.refused，与自己的声部上限 front.skipped 分开，plays 只数真收下的。
  const audio = FakeAudio();
  let n = 0;
  const base = audio.Play;
  audio.Play = (cue, o = {}) => { const v = base(cue, o); n += 1; return o.soundField && n % 3 === 0 ? null : v; };
  const sound = new FirstLevelMissionBattleSound(audio, null, 0x19380925);
  Run(sound, audio, "Trapped", 90);
  const front = audio.calls.filter((c) => c.soundField && c.bus === "sfx");
  assert.ok(front.length > 20 && front.every((c) => c.selfCapped === true),
    `前线每一声都带 selfCapped：${front.filter((c) => c.selfCapped === true).length}/${front.length}`);
  const f = sound.State().front;
  const refusedLog = sound.frontRecent.filter((r) => !r.played).length;
  assert.ok(f.refused > 0 && f.plays + f.refused === front.length,
    `引擎拒收单独记账：排出 ${front.length} = 收下 ${f.plays} + 拒收 ${f.refused}（自己的上限另记 skipped ${f.skipped}）`);
  assert.ok(refusedLog > 0, "frontRecent 里拒收的那几声 played=false");
  Ok(`前线 ${front.length} 声全带 selfCapped；拒收 ${f.refused} 单独记账，plays ${f.plays} 只数收下的`);
}
{
  // 【2026-09-24 恢复】01 被压着时前线渐强（front.stages.Trapped.swell）。旧断言在 09-23 换声景时删了，
  // 用户拍板「恢复」。逐秒量 State().front.swell：从底单调爬到顶（顶 = stages.Trapped 的 intensity / gain），
  // 到顶后不回落；近爆事实一来 catchUpS 内补完；其它步骤恒为 1。
  const P = D.front.stages.Trapped, S = P.swell;
  assert.ok(S && S.riseS > 0 && S.intensityFrom < 1 && S.gainFrom < 1, "01 有渐强数据");
  const facts = new Set();
  const audio = FakeAudio();
  const sound = new FirstLevelMissionBattleSound(audio, { Has: (id) => facts.has(id) }, 0x19380924);
  const curve = [];
  for (let second = 1; second <= S.riseS + 40; second += 1) {
    Run(sound, audio, "Trapped", 1);
    const f = sound.State().front;
    curve.push({ t: f.stageTime, u: f.swell.u, intensity: P.intensity * f.swell.intensity, gain: P.gain * f.swell.gain });
  }
  for (let i = 1; i < curve.length; i += 1) {
    assert.ok(curve[i].intensity >= curve[i - 1].intensity - 1e-9 && curve[i].gain >= curve[i - 1].gain - 1e-9,
      `01 前线强度只升不降：${JSON.stringify(curve[i - 1])} → ${JSON.stringify(curve[i])}`);
  }
  const rising = curve.filter((c) => c.t < S.riseS - 0.5);
  for (let i = 1; i < rising.length; i += 1) {
    assert.ok(rising[i].intensity > rising[i - 1].intensity && rising[i].gain > rising[i - 1].gain,
      `到顶之前每一秒都在涨（${rising[i].t} s）`);
  }
  const first = curve[0], atPeak = curve.find((c) => c.t >= S.riseS - 1e-6), last = curve.at(-1);
  assert.ok(first.intensity < P.intensity * 0.5 && first.gain < P.gain * 0.35,
    `开头远而轻：强度 ${first.intensity.toFixed(3)}、音量 ${first.gain.toFixed(3)}`);
  assert.ok(Math.abs(atPeak.intensity - P.intensity) < 1e-9 && Math.abs(atPeak.gain - P.gain) < 1e-9,
    `${S.riseS} s 到顶：强度 ${atPeak.intensity}、音量 ${atPeak.gain}`);
  assert.ok(curve.filter((c) => c.t >= S.riseS).every((c) => c.intensity === P.intensity && c.gain === P.gain),
    "到顶之后整段 01 停在顶上，不回落");
  // 实际播出来的音量也跟着涨：每一声相对自己的 cueVolume，头 15 s 与到顶前后 15 s 比。
  const Norm = (a, b) => audio.calls.filter((c) => c.soundField && c.t >= a && c.t < b).map((c) => c.volume / D.front.cueVolume[c.cue]);
  const Mean = (xs) => xs.reduce((x, y) => x + y, 0) / Math.max(1, xs.length);
  const early = Norm(0, 15), late = Norm(S.riseS - 5, S.riseS + 10);
  assert.ok(early.length > 0 && late.length > 0 && Mean(late) > Mean(early) * 2,
    `播出来的前线由轻到响：头 15 s ${early.length} 声 均 ${Mean(early).toFixed(3)}，到顶前后 ${late.length} 声 均 ${Mean(late).toFixed(3)}`);
  // 由稀到密：单个种子里一个窗口只有四五场交火，看不出来；十六个种子平均。
  const Density = (a, b) => {
    let n = 0;
    for (let seed = 1; seed <= 16; seed += 1) {
      const ad = FakeAudio(), sd = new FirstLevelMissionBattleSound(ad, { Has: () => false }, seed);
      Run(sd, ad, "Trapped", b);
      n += ad.calls.filter((c) => c.soundField && c.t >= a && c.t < b).length;
    }
    return n / 16;
  };
  const sparse = Density(0, 20), dense = Density(S.riseS - 10, S.riseS + 10);
  assert.ok(dense > sparse * 1.2, `由稀到密（16 个种子平均）：头 20 s ${sparse.toFixed(1)} 声 → 到顶前后 20 s ${dense.toFixed(1)} 声`);
  // 【2026-09-24 审查补】频次那一半单独钉住：上面的密度对比只靠「首场往后摊 + 等待按涨幅缩短」
  // 也过得去（把 rate 上的 swell.intensity 倍率拿掉，16 种子仍是 26.4 → 37.6）。这里直接量每一场
  // 交火排下一场时用的频次：等待 = R(gapS) / (P.intensity × swell.intensity × 扇区权重) + 排队余量。
  {
    // 包住 StartExchange 之后的第一次 R（就是 gapS 那一抽）与紧跟着的 QueueSpanS，
    // 在排下的那一帧读 nextAt（下一帧的「按涨幅缩短」会再改它，所以只对照刚排下的那一刻）。
    const ag = FakeAudio(), sg = new FirstLevelMissionBattleSound(ag, { Has: () => false }, 0x5e11);
    const R1 = sg.R.bind(sg), Q1 = sg.QueueSpanS.bind(sg), X1 = sg.StartExchange.bind(sg);
    let armed2 = false, gap2 = null, pending = null;
    const got = [];
    sg.StartExchange = (sector) => { const r = X1(sector); armed2 = true; return r; };
    sg.R = (a, b) => { const v = R1(a, b); if (armed2) { gap2 = v; armed2 = false; } return v; };
    sg.QueueSpanS = (sector) => { const q = Q1(sector); pending = { sector, gap: gap2, q, now: sg.frontTime, intensity: sg.swellScale.intensity }; return q; };
    for (let t = 0; t < S.riseS + 10; t += 1 / 30) {
      ag.Tick(1 / 30);
      sg.Update(1 / 30, "Trapped", false);
      if (pending) { got.push({ ...pending, wait: pending.sector.nextAt - pending.now - pending.q }); pending = null; }
    }
    const earlyN = got.filter((g) => g.intensity < 0.7).length;
    assert.ok(got.length >= 10 && earlyN >= 3, `量到 ${got.length} 场交火（其中 ${earlyN} 场在渐强前段）`);
    for (let i = 0; i < got.length; i += 1) {
      const g = got[i], weight = (P.weights?.[g.sector.spec.id] ?? 1) * g.sector.spec.weight;
      const expected = g.gap / Math.max(0.05, P.intensity * g.intensity * weight);
      assert.ok(Math.abs(g.wait - expected) < 1e-6,
        `第 ${i + 1} 场（${g.now.toFixed(2)} s，渐强强度 ×${g.intensity.toFixed(3)}）排下一场的等待 ${g.wait.toFixed(3)} s，应为 ${expected.toFixed(3)} s`);
    }
    Ok(`01 渐强的频次：${got.length} 场交火排下一场的等待都按 P.intensity × 渐强倍率 × 权重算（渐强前段 ${earlyN} 场）`);
  }
  Ok(`01 渐强：强度 ${first.intensity.toFixed(2)}→${P.intensity}、音量 ${first.gain.toFixed(2)}→${P.gain}（${S.riseS} s 到顶）；`
    + `每声相对音量 ${Mean(early).toFixed(3)}→${Mean(late).toFixed(3)}，20 s 声数 ${sparse.toFixed(1)}→${dense.toFixed(1)}`);

  // 近爆来得比 riseS 早：catchUpS 内补到顶，补的过程也只升不降。
  const facts2 = new Set(), a2 = FakeAudio();
  const s2 = new FirstLevelMissionBattleSound(a2, { Has: (id) => facts2.has(id) }, 0x19380924);
  Run(s2, a2, "Trapped", 20);
  const before = s2.State().front.swell;
  facts2.add(S.peakFact);
  let prev = before.u, topAt = null;
  for (let t = 0; t < S.catchUpS + 1; t += 0.1) {
    Run(s2, a2, "Trapped", 0.1);
    const w = s2.State().front.swell;
    assert.ok(w.u >= prev - 1e-9, "补到顶的过程只升不降");
    prev = w.u;
    if (topAt === null && w.u >= 1) topAt = t + 0.1;
  }
  assert.ok(before.u < 0.5 && topAt !== null && topAt <= S.catchUpS + 0.15,
    `第 20 s 近爆（u ${before.u}）→ ${topAt?.toFixed(1)} s 补到顶（≤ ${S.catchUpS} s）`);
  // 从近爆之后进 01（调试入口 / 读档）：进步骤第一帧就在顶上，不再从底补 catchUpS 秒
  //（2026-09-24 审查：原断言等 catchUpS + 0.2 s 才看，测的是「2 s 内补满」，实际头两秒轻 7 dB 上下）。
  const a3 = FakeAudio(), s3 = new FirstLevelMissionBattleSound(a3, { Has: () => true }, 0x19380924);
  for (let t = 0; t < 5; t += 1 / 30) {
    a3.Tick(1 / 30);
    s3.Update(1 / 30, "Trapped", false);
    const w = s3.State().front.swell;
    assert.ok(w.u === 1 && w.intensity === 1 && w.gain === 1, `近爆已经发生过的 01：第 ${a3.clock.toFixed(2)} s 倍率 ${JSON.stringify(w)}，应一直是顶`);
  }
  // 播出来的也是顶上的音量：16 个种子，进步骤头 2 s（原来补到顶的那段）与 5–30 s 比。
  // 实测：现在 0.683 / 0.715 = 0.95；改之前从底补起是 0.341 / 0.712 = 0.48。
  const reentry = [], settled = [];
  for (let seed = 1; seed <= 16; seed += 1) {
    const ar = FakeAudio(), sr = new FirstLevelMissionBattleSound(ar, { Has: () => true }, seed);
    Run(sr, ar, "Trapped", 30);
    const Rel = (c) => c.volume / D.front.cueVolume[c.cue];
    reentry.push(...ar.calls.filter((c) => c.soundField && c.t < S.catchUpS).map(Rel));
    settled.push(...ar.calls.filter((c) => c.soundField && c.t >= 5).map(Rel));
  }
  assert.ok(reentry.length >= 10 && Mean(reentry) >= Mean(settled) * 0.8,
    `近爆后再进 01：头 ${S.catchUpS} s ${reentry.length} 声相对音量均 ${Mean(reentry).toFixed(3)}，5–30 s 均 ${Mean(settled).toFixed(3)}`);
  Ok(`01 渐强：近爆早到 ${topAt.toFixed(1)} s 补到顶；近爆后再进 01 第一帧就在顶上（头 ${S.catchUpS} s 相对音量 ${Mean(reentry).toFixed(3)} / 5–30 s ${Mean(settled).toFixed(3)}）`);

  // 其它步骤不受影响：进步骤第一帧起倍率就是 1；01 之后接 02 也是。
  for (const stage of Object.keys(D.front.stages).filter((id) => id !== "Trapped")) {
    assert.equal(D.front.stages[stage].swell, undefined, `${stage} 没有渐强数据`);
    const a4 = FakeAudio(), s4 = new FirstLevelMissionBattleSound(a4, null);
    Run(s4, a4, stage, 0.1);
    const w = s4.State().front.swell;
    assert.ok(w.intensity === 1 && w.gain === 1, `${stage} 一进来强度就是本档基线`);
  }
  Run(sound, audio, "BunkerRescue", 0.1);
  assert.ok(sound.State().front.swell.intensity === 1 && sound.State().front.swell.gain === 1, "01 之后接 02：02 用自己的基线");
  Ok("渐强只作用于 01，其余 01–06 步骤进来就是本档基线");
}
{
  const audio = FakeAudio();
  const sound = new FirstLevelMissionBattleSound(audio, null);
  Run(sound, audio, "Support", 120);
  const front = audio.calls.filter((c) => c.soundField);
  const cues = new Set(front.map((c) => c.cue));
  for (const cue of ["rifleNraFar", "rifleIjaFar", "zb26Far"]) assert.ok(cues.has(cue), `03 的远处交火里有 ${cue}`);
  assert.ok(cues.has("type92Far") || cues.has("type11Far"), "日军机枪在远处点射");
  assert.ok(cues.has("amb.cannonFar") || cues.has("launcherPop"), "远处有炮或掷弹筒");
  assert.ok(front.some((c) => c.burst >= 8), "日军机枪是长点射（≥ 8 发）");
  // 「一方开火、另一方还击」：同一扇区里相邻两段换了一边。
  const bySector = new Map();
  for (const r of sound.frontRecent.concat()) { if (!bySector.has(r.sector)) bySector.set(r.sector, []); bySector.get(r.sector).push(r); }
  const switched = sound.State().front.sectors.filter((s) => s.exchanges > 0).length;
  assert.ok(switched >= 4, `至少四个扇区打过（实际 ${switched}）`);
  const sides = new Set(sound.frontRecent.map((r) => r.side));
  assert.ok(sides.has("ija") && sides.has("nra"), "两边都在开火");
  // 方位真的分散：听者看过去的方位角至少跨 150°。
  const angles = front.map((c) => Math.atan2(c.position.x - audio.listenerPos.x, c.position.z - audio.listenerPos.z) * 180 / Math.PI);
  const span = Math.max(...angles) - Math.min(...angles);
  assert.ok(span > 150, `左右不同方向（方位跨度 ${span.toFixed(0)}°）`);
  Ok(`03 两分钟 ${front.length} 声，${cues.size} 种，方位跨 ${span.toFixed(0)}°，双方来回`);

  // 声部上限：同一时刻活着的前线声部 ≤ maxVoices。
  const live = new FakeAudio({ life: 30 });
  const s2 = new FirstLevelMissionBattleSound(live, null);
  let peak = 0;
  for (let t = 0; t < 60; t += 1 / 30) { live.Tick(1 / 30); s2.Update(1 / 30, "Support"); peak = Math.max(peak, s2.frontVoices.length); }
  assert.ok(peak <= D.front.maxVoices, `前线声部峰值 ${peak} ≤ ${D.front.maxVoices}`);
  assert.ok(s2.frontSkipped > 0, "声部满了跳过而不是硬挤");
  Ok(`声部上限 ${peak}/${D.front.maxVoices}（跳过 ${s2.frontSkipped} 条）`);
}
{
  // 让位：场上交火满强度时，远处这一层起得更稀、更轻；对白播放时也少起。
  const Count = (intensity, speaking) => {
    const audio = FakeAudio(); audio.battleIntensity = intensity;
    const sound = new FirstLevelMissionBattleSound(audio, null);
    Run(sound, audio, "MachineGun", 180, { speaking });
    const f = audio.calls.filter((c) => c.soundField);
    return { n: sound.frontExchanges, vol: f.reduce((s, c) => s + c.volume, 0) / Math.max(1, f.length) };
  };
  const calm = Count(0, false), hot = Count(1, false), talk = Count(0, true);
  assert.ok(hot.n < calm.n * 0.8 && hot.vol < calm.vol * 0.8,
    `屏幕上打得凶时远处让位：交火 ${calm.n}→${hot.n} 场，平均音量 ${calm.vol.toFixed(3)}→${hot.vol.toFixed(3)}`);
  assert.ok(talk.n < calm.n * 0.75, `对白期间少起新交火：${calm.n}→${talk.n}`);
  Ok(`让位：交火 ${calm.n}/${hot.n}/${talk.n} 场（静/激战/对白）`);
}
{
  // 07 以后回到旧的五个固定声源，一个都没多。
  const audio = FakeAudio();
  const sound = new FirstLevelMissionBattleSound(audio, null);
  Run(sound, audio, "Support", 20);
  assert.equal(audio.firstLevelSoundscape, true, "01–06：声景开关打开（壕沟/洞/压制身体反应）");
  const before = audio.calls.length;
  Run(sound, audio, "South", 60);
  assert.equal(audio.firstLevelSoundscape, false, "07：声景开关关上");
  const south = audio.calls.slice(before);
  const ids = new Set(D.sources.map((s) => s.cue));
  assert.ok(south.length > 5 && south.every((c) => ids.has(c.cue) && c.bus === "ambience"), "07：只剩旧的固定声源");
  assert.ok(south.every((c) => D.sources.some((s) => s.x === c.position.x && s.z === c.position.z)), "07：位置就是旧的五个点");
  assert.equal(sound.frontQueue.length, 0, "离开 01–06 时远处队列清空");
  Ok(`07 以后 ${south.length} 声全是旧声源`);
}

// ---------------------------------------------------------------------------
// 2) 场外近落弹
// ---------------------------------------------------------------------------
{
  const audio = FakeAudio({ zone: "trench" });
  const L = audio.listenerPos;
  const visuals = [], shakes = [];
  const soldiers = [{ alive: true, position: { x: 0, y: 0, z: -260 } }];
  const art = new BattleArtillery({
    audio, Ground: () => 0, Zone: () => audio.zone,
    Visual: (p) => visuals.push({ t: audio.clock, ...p }),
    Shake: (trauma, d) => shakes.push({ t: audio.clock, d, trauma }),
    Blocked: (p) => soldiers.some((s) => Math.hypot(s.position.x - p.x, s.position.z - p.z) < BATTLE_ARTILLERY.avoidSoldierM),
  }, 7);
  const profile = { perMin: 12, minM: 45, maxM: 120, firstAfterS: 0 };
  for (let t = 0; t < 120; t += 1 / 30) { audio.Tick(1 / 30); art.Update(1 / 30, profile, { zones: D.artillery.zones, stage: "Support" }); }
  assert.ok(art.shells >= 10, `两分钟落了 ${art.shells} 发`);
  assert.ok(visuals.every((v) => { const d = Math.hypot(v.x - L.x, v.z - L.z); return d >= 45 && d <= 120; }), "落点都在 45–120 m");
  assert.ok(visuals.every((v) => soldiers.every((s) => Math.hypot(s.position.x - v.x, s.position.z - v.z) >= BATTLE_ARTILLERY.avoidSoldierM)), "不落在人身边");
  assert.ok(visuals.every((v) => D.artillery.zones.some((z) => v.x >= z.xMin && v.x <= z.xMax && v.z >= z.zMin && v.z <= z.zMax)), "只落在划好的无人地带");
  // 先见后闻：震屏在画面之后 d/340 才到。
  const pairs = shakes.map((s, i) => ({ s, v: visuals[i] })).filter((p) => p.v);
  assert.ok(pairs.length && pairs.every(({ s, v }) => s.t - v.t >= Math.hypot(v.x - L.x, v.y - L.y, v.z - L.z) / 340 - 0.05),
    "震屏跟着声音到（画面之后 d/340）");
  const booms = audio.calls.filter((c) => (c.cue === "explosionMid" || c.cue === "explosionFar") && !(c.airCut <= 400));
  const thumps = audio.calls.filter((c) => c.cue === BATTLE_ARTILLERY.thumpCue && c.airCut <= 400 && c.delay > 0.022);
  assert.ok(booms.length === visuals.length && thumps.length === visuals.length,
    `每一发都有爆炸声与压到 400 Hz 以下、错开去重窗的低频层（${booms.length}/${thumps.length}/${visuals.length}）`);
  // 这里是每分钟 12 发的加压档（真实档 1–2.4 发/分钟，两发之间至少八秒多，互不重叠）：
  // 声部满了的附属层按账丢掉、记在 layersDropped；真实档每一发都有落土，见下一段。
  const debris = audio.calls.filter((c) => c.cue === "debrisFall").length;
  assert.ok(debris + art.layersDropped >= visuals.length && art.peakVoices <= BATTLE_ARTILLERY.maxVoices,
    `加压档：落土 ${debris} 条 + 满了丢掉 ${art.layersDropped} 条 ≥ ${visuals.length} 发，本层峰值 ${art.peakVoices} ≤ ${BATTLE_ARTILLERY.maxVoices}`);
  assert.ok(audio.calls.some((c) => c.cue === "shellIncoming"), "有一部分炮弹先听到啸声");
  Ok(`近落弹 ${art.shells} 发：落点、避人、先见后闻、低频层、沟壁落土、啸声`);

  // 真实档：每一发都有爆炸本体、低频层、沟壁落土，一条附属层都不丢。
  {
    const a4 = FakeAudio({ zone: "trench" }), vis4 = [];
    const art4 = new BattleArtillery({ audio: a4, Ground: () => 0, Zone: () => "trench",
      Visual: (p) => vis4.push(p), Shake() {}, Blocked: () => false }, 11);
    const P = { ...D.artillery.stages.RearTrench, firstAfterS: 0 };
    for (let t = 0; t < 900; t += 1 / 30) { a4.Tick(1 / 30); art4.Update(1 / 30, P, { zones: D.artillery.zones, stage: "RearTrench" }); }
    const n = vis4.length;
    assert.ok(n >= 20 && art4.layersDropped === 0
      && a4.calls.filter((c) => c.cue === "debrisFall").length >= n
      && a4.calls.filter((c) => c.cue === BATTLE_ARTILLERY.thumpCue && c.airCut <= 400).length === n,
    `真实档 15 分钟 ${n} 发：每一发都有低频层与沟壁落土，丢层 ${art4.layersDropped}`);
    Ok(`真实档 ${n} 发，附属层一条不丢`);
  }

  // 声部总账：各步骤 15 分钟，炮击 ≤ maxVoices、前线 ≤ maxVoices、合计 ≤ sharedMaxVoices。
  {
    const rows = [];
    for (const stage of ["Trapped", "BunkerRescue", "RearTrench", "Support", "MachineGun", "Tank"]) {
      const a5 = FakeAudio({ zone: "trench", life: 4 });
      const s5 = new FirstLevelMissionBattleSound(a5, null);
      let peakA = 0, peakF = 0, peakSum = 0;
      for (let t = 0; t < 900; t += 1 / 30) {
        a5.Tick(1 / 30); s5.Update(1 / 30, stage, false);
        const art = s5.artillery.voices.length, fr = s5.frontVoices.length;
        peakA = Math.max(peakA, art); peakF = Math.max(peakF, fr); peakSum = Math.max(peakSum, art + fr);
      }
      assert.ok(peakA <= BATTLE_ARTILLERY.maxVoices && peakF <= D.front.maxVoices && peakSum <= D.front.sharedMaxVoices,
        `${stage}：炮击峰值 ${peakA}/${BATTLE_ARTILLERY.maxVoices}、前线 ${peakF}/${D.front.maxVoices}、合计 ${peakSum}/${D.front.sharedMaxVoices}`);
      assert.ok(s5.artillery.shells > 0, `${stage}：15 分钟里落过炮弹`);
      rows.push(`${stage} ${peakA}+${peakF}→${peakSum}`);
    }
    // 场上打得凶：前线收到 maxVoicesHot。
    const a6 = FakeAudio({ life: 30 }); a6.battleIntensity = 1;
    const s6 = new FirstLevelMissionBattleSound(a6, null);
    let hot = 0;
    for (let t = 0; t < 120; t += 1 / 30) { a6.Tick(1 / 30); s6.Update(1 / 30, "Support"); hot = Math.max(hot, s6.frontVoices.length); }
    assert.ok(hot <= D.front.maxVoicesHot, `激战时前线声部 ${hot} ≤ ${D.front.maxVoicesHot}`);
    Ok(`声部总账（炮击+前线→合计）：${rows.join("，")}；激战前线 ${hot}`);
  }

  // 真 CameraShake：45 / 75 / 140 m、沟里与洞里，每一发都震得到，而且是轻震。
  {
    const rows = [];
    for (const zone of ["trench", "dugout"]) {
      for (const d of [45, 75, 140]) {
        const cam = new CameraShake();
        const a7 = FakeAudio({ zone });
        const art7 = new BattleArtillery({ audio: a7, Ground: () => 0, Zone: () => zone, Visual() {},
          Shake: (trauma) => cam.AddTrauma(trauma), Blocked: () => false }, 3);
        art7.Impact({ x: a7.listenerPos.x + d, y: 0, z: a7.listenerPos.z });
        let peak = 0, moved = 0;
        for (let t = 0; t < 1.5; t += 1 / 60) {
          art7.time += 1 / 60; art7.RunPending(); cam.Update(1 / 60);
          peak = Math.max(peak, cam.trauma); moved = Math.max(moved, Math.abs(cam.pitch) + Math.abs(cam.yaw));
        }
        assert.ok(peak > 0.1 && peak < 0.6 && moved > 0, `${zone} ${d} m：创伤 ${peak.toFixed(3)}（要 0.1–0.6 的轻震），镜头动了 ${moved.toExponential(1)} rad`);
        rows.push(`${zone}${d}m ${peak.toFixed(2)}`);
      }
    }
    Ok(`轻震：${rows.join(" / ")}`);
  }

  // 避开在场的战车；画面带一根越得过沟沿的土柱，到点撤源。
  {
    const a8 = FakeAudio({ zone: "trench", listener: { x: 60, y: 1.6, z: -150 } });
    const tank = { present: true, x: 110, z: -190 };
    const sources = [], removed = [], booms = [];
    const vfx = { Explosion: (p, o) => booms.push({ ...p, ...o }), SmokeSource: (p, o) => { sources.push({ ...p, ...o }); return sources.length; },
      RemoveSmokeSource: (h) => removed.push(h) };
    const s8 = new FirstLevelMissionBattleSound(a8, { tank, vfx, battlefield: { GroundHeight: () => 0 } }, 5);
    for (let t = 0; t < 900; t += 1 / 30) { a8.Tick(1 / 30); s8.Update(1 / 30, "MachineGun", false); }
    const near = booms.filter((b) => Math.hypot(b.x - tank.x, b.z - tank.z) < BATTLE_ARTILLERY.avoidVehicleM);
    assert.ok(booms.length >= 8 && near.length === 0, `战车在场：${booms.length} 发没有一发落在车 ${BATTLE_ARTILLERY.avoidVehicleM} m 内`);
    assert.ok(s8.ShellBlocked({ x: tank.x + 5, z: tank.z }) && !s8.ShellBlocked({ x: tank.x + 40, z: tank.z }), "避车半径生效");
    tank.present = false;
    assert.ok(!s8.ShellBlocked({ x: tank.x + 5, z: tank.z }), "战车没进场时不占地");
    const C = BATTLE_ARTILLERY.column;
    assert.ok(sources.length === booms.length && sources.every((c) => c.rise * c.life >= 10),
      `每一发都有土柱，升得到 ${(C.rise * C.life).toFixed(1)} m（越过 2 m 沟沿）`);
    assert.ok(removed.length >= sources.length - 1, `土柱到点撤源（${removed.length}/${sources.length}）`);
    assert.ok(booms.every((b) => b.radius >= BATTLE_ARTILLERY.vfxRadiusM && b.radius <= BATTLE_ARTILLERY.vfxRadiusMaxM),
      "远的那几发画面放大一点、有封顶");
    s8.Dispose();
    assert.equal(removed.length, sources.length, "销毁时土柱全撤");
    Ok(`避车 + 土柱：${booms.length} 发，土柱 ${sources.length} 根`);
  }

  // 01 整段在洞里：接线层判不成 dugout（旧布设判 courtyard）时，落土仍按洞顶算、震得更重。
  {
    const a9 = FakeAudio({ zone: "courtyard" });
    const s9 = new FirstLevelMissionBattleSound(a9, { Has: () => false, battlefield: { GroundHeight: () => 0 } });
    Run(s9, a9, "Trapped", 240);
    const dirt = a9.calls.filter((c) => c.cue === "debrisFall");
    assert.ok(dirt.length > 0 && dirt.every((c) => c.position.y > a9.listenerPos.y && c.airCut === BATTLE_ARTILLERY.dugoutDirtAirCutHz),
      `01：洞顶掉土 ${dirt.length} 次，都在头顶上`);
    assert.ok(s9.artillery.State().recent.every((e) => e.zone === "dugout"), "01 的每一发都按洞里算");
    Ok(`01 洞顶掉土 ${dirt.length} 次（接线层判 courtyard 也照掉）`);
  }

  // 进步骤那一刻起就一直在说话：头一发也不抽稀。
  {
    const firsts = [1, 2, 3, 4, 5, 6, 7, 8].map((seed) => {
      const a10 = FakeAudio({ zone: "trench" }), times = [];
      const art10 = new BattleArtillery({ audio: a10, Ground: () => 0, Zone: () => "trench",
        Visual: () => times.push(a10.clock), Shake() {}, Blocked: () => false }, seed);
      const P = { ...D.artillery.stages.Support, firstAfterS: D.artillery.firstAfterS, firstSpreadS: D.artillery.firstSpreadS };
      for (let t = 0; t < 12; t += 1 / 30) { a10.Tick(1 / 30); art10.Update(1 / 30, P, { zones: D.artillery.zones, stage: "Support", rateScale: D.artillery.speechRate }); }
      return times[0] ?? Infinity;
    });
    assert.ok(firsts.every((t) => t <= D.artillery.firstAfterS + D.artillery.firstSpreadS + 0.1),
      `说着话进步骤，头一发仍在 ${D.artillery.firstAfterS + D.artillery.firstSpreadS} s 内（${firsts.map((t) => t.toFixed(1)).join("/")}）`);
    Ok(`对白中进步骤：头一发 ${Math.max(...firsts).toFixed(1)} s 内`);
  }

  // 运行时（有宿主）每局换种子；夹具（无宿主）固定种子可复现。
  {
    const host = { battlefield: { GroundHeight: () => 0 } };
    const seeds = new Set([0, 1, 2, 3].map(() => new FirstLevelMissionBattleSound(FakeAudio(), host).seed));
    assert.ok(seeds.size >= 3, `四局四个种子（${seeds.size} 个不同）`);
    assert.equal(new FirstLevelMissionBattleSound(FakeAudio(), null).seed, new FirstLevelMissionBattleSound(FakeAudio(), null).seed, "夹具固定种子");
    Ok("种子：运行时每局另抽，夹具固定");
  }

  // 进步骤时正在说话：头一发不能被推到一分钟以后（2026-09-23 实机 01–05 五个 25 s 窗口一发没落）。
  // 对白只按 rateScale 抽稀到点的那一发；话一停，下一发按本档频次来。
  const Shells = (speakUntil, seconds, seed) => {
    const a3 = FakeAudio({ zone: "trench" }), times = [];
    const art3 = new BattleArtillery({ audio: a3, Ground: () => 0, Zone: () => "trench",
      Visual: () => times.push(a3.clock), Shake() {}, Blocked: () => false }, seed);
    const P = { ...D.artillery.stages.Support, firstAfterS: D.artillery.firstAfterS, firstSpreadS: D.artillery.firstSpreadS };
    for (let t = 0; t < seconds; t += 1 / 30) { a3.Tick(1 / 30);
      art3.Update(1 / 30, P, { zones: D.artillery.zones, stage: "Support", rateScale: a3.clock < speakUntil ? D.artillery.speechRate : 1 }); }
    return times;
  };
  const firstShots = [1, 2, 3, 4, 5, 6].map((seed) => Shells(0, 30, seed)[0]);
  assert.ok(firstShots.every((t) => t <= D.artillery.firstAfterS + D.artillery.firstSpreadS + 0.1),
    `不说话时进步骤 ${D.artillery.firstAfterS}–${D.artillery.firstAfterS + D.artillery.firstSpreadS} s 内先落一发（${firstShots.map((t) => t.toFixed(1)).join("/")}）`);
  const meanGap = 60 / D.artillery.stages.Support.perMin;
  const afterTalk = [1, 2, 3, 4, 5, 6].map((seed) => (Shells(40, 40 + meanGap * 2.3, seed).find((t) => t > 40) ?? Infinity) - 40);
  assert.ok(afterTalk.every((t) => t <= meanGap * 2.2 + 0.1), `说了 40 s 话、一停下来，下一发在本档最长间隔内（${afterTalk.map((t) => t.toFixed(1)).join("/")} s）`);
  const quietCount = Shells(0, 1200, 9).length, talkCount = Shells(1200, 1200, 9).length;
  assert.ok(talkCount < quietCount * 0.7 && talkCount > quietCount * 0.2, `对白期间抽稀：20 分钟 ${quietCount} → ${talkCount} 发`);
  Ok(`近落弹起落：头一发 ${Math.max(...firstShots).toFixed(1)} s 内，话停后 ${Math.max(...afterTalk).toFixed(1)} s 内，对白抽稀 ${quietCount}→${talkCount}`);

  // 01 近爆之后那 14 s 不落（黑屏与醒来留给剧本那一发）；01 的每一声都闷。
  const a2 = FakeAudio({ zone: "dugout" });
  let collapsed = false;
  const bs = new FirstLevelMissionBattleSound(a2, { Has: (id) => id === "bunkerCollapsed" && collapsed, battlefield: { GroundHeight: () => 0 } });
  bs.artillery.T = { ...BATTLE_ARTILLERY };
  Run(bs, a2, "Trapped", 200);
  const trappedShells = a2.calls.filter((c) => !c.soundField && /explosion/.test(c.cue));
  assert.ok(trappedShells.length > 0 && trappedShells.every((c) => c.airCut <= D.artillery.stages.Trapped.airCut), "01 的近落弹全部隔着土");
  collapsed = true;
  const mark = a2.calls.length, t0 = a2.clock;
  Run(bs, a2, "Trapped", D.artillery.stages.Trapped.quietAfter.seconds - 0.5);
  const inQuiet = a2.calls.slice(mark).filter((c) => !c.soundField && /explosion/.test(c.cue) && c.t > t0 + 0.8);
  assert.equal(inQuiet.length, 0, "01 近爆之后的静默窗里不落场外炮弹");
  Ok(`01：近落弹 ${trappedShells.length} 发全部闷，近爆后 ${D.artillery.stages.Trapped.quietAfter.seconds} s 静默`);
}

// ---------------------------------------------------------------------------
// 3) 防炮洞环境床
// ---------------------------------------------------------------------------
{
  const audio = FakeAudio({ zone: "open" });
  const sound = new FirstLevelMissionBattleSound(audio, null);
  Run(sound, audio, "Trapped", 0.2);
  assert.equal(audio.ambiencePreset, D.dugout.preset, "01 一进来就是防炮洞环境");
  assert.ok(audio.ambience[0].fadeS > 0, "切档带交叉淡");
  Run(sound, audio, "BunkerRescue", 0.5);
  assert.equal(audio.ambiencePreset, D.dugout.preset, "02 出洞前不切（滞回）");
  Run(sound, audio, "BunkerRescue", D.dugout.holdS + 0.2);
  assert.equal(audio.ambiencePreset, D.dugout.outside, "02 听者出了洞 → 前线环境");
  audio.zone = "dugout";
  Run(sound, audio, "RearTrench", D.dugout.holdS + 0.2);
  assert.equal(audio.ambiencePreset, D.dugout.preset, "钻回洞里 → 洞里环境");
  const n = audio.ambience.length;
  Run(sound, audio, "Support", 5);
  assert.equal(audio.ambience.length, n, "03 以后不再由这里切环境（交给运行时）");
  Ok(`防炮洞环境：切了 ${audio.ambience.length} 次，每次淡 ${D.dugout.fadeS} s`);
}

// ---------------------------------------------------------------------------
// 4) 接线层：壕沟 / 防炮洞判据，压制喘息与心跳
// ---------------------------------------------------------------------------
{
  // 一条东西向的沟：沟底 z ∈ [−1.7, 1.7]，坡宽 1.1，深 2.0 —— 与 TrenchPlan 交通壕断面同尺寸。
  const Smooth = (t) => { const x = Math.min(1, Math.max(0, t)); return x * x * (3 - 2 * x); };
  const trenchGround = (x, z) => -2 * (1 - Smooth((Math.abs(z) - 1.7) / 1.1));
  let roof = null;
  const bf = {
    GroundHeight: trenchGround,
    Raycast: (o, d, far) => (typeof roof === "function" ? roof(o, far) : roof),
    NearbyColliders: () => [],
  };
  const gate = { firstLevelSoundscape: true };
  const w = new AudioWiring({ battlefield: bf, audio: gate, player: null });
  const Z = (x, y, z) => { w.zoneCache.clear(); return w.Zone({ x, y, z }); };
  assert.equal(Z(0, -2 + 1.6, 0), "trench", "站在沟中线上 → trench");
  assert.equal(Z(0, -2 + 1.6, 1.4), "trench", "贴着一侧沟壁 → trench");
  assert.equal(Z(0, 1.6, 6), "open", "沟外平地 → open");
  assert.equal(Z(0, -2 + 60, 0), "open", "沟上空的飞机 → 不算沟里");
  // 洞：盖子低、宽，人陷在地下 → dugout；同一块盖子放在平地上的房子里 → interior。
  roof = { t: 0.5, box: { tag: "whiteboxWall", min: [-2, -0.2, -2], max: [2, 0.1, 2] } };
  assert.equal(Z(0, -2 + 0.9, 0), "dugout", "沟里低矮的顶 → dugout");
  roof = { t: 2.4, box: { tag: "roof", min: [-4, 3.5, -4], max: [4, 3.9, 4] } };
  const flat = new AudioWiring({ battlefield: { ...bf, GroundHeight: () => 0 }, audio: gate, player: null });
  flat.zoneCache.clear();
  assert.equal(flat.Zone({ x: 0, y: 1.0, z: 0 }), "interior", "平地上的屋顶 → interior（没被抢成 dugout）");
  const taggedRoof = { t: 3, box: { tag: "dugoutRoof", min: [-1, 2, -1], max: [1, 2.3, 1] } };
  roof = taggedRoof;
  assert.equal(Z(0, -1, 30), "dugout", "布设标了 dugoutRoof → 直接 dugout");
  // 头顶先撞上一根窄塌梁（1.0 × 1.6 m）、梁上面才是洞顶 —— Space 包新洞室里顺子躺的位置就是这样。
  const beam = { tag: "whiteboxWall", min: [-0.5, -1.3, -0.8], max: [0.5, -1.0, 0.8] };
  const lid = { tag: "whiteboxWall", min: [-2, 0.1, -2], max: [2, 0.6, 2] };
  const Stack = (layers) => (o, far) => {
    let best = null;
    for (const b of layers) {
      if (b.min[1] < o.y || o.x < b.min[0] || o.x > b.max[0] || o.z < b.min[2] || o.z > b.max[2]) continue;
      const t = b.min[1] - o.y;
      if (t <= far && (!best || t < best.t)) best = { t, box: b };
    }
    return best;
  };
  roof = Stack([beam, lid]);
  assert.equal(Z(0, -2 + 0.42, 0), "dugout", "窄梁挂在洞顶下面 → 看穿梁仍是 dugout");
  roof = Stack([beam]);
  assert.equal(Z(0, -2 + 0.42, 0), "trench", "沟上只横一根梁、上面是天 → 仍是 trench");
  roof = taggedRoof;
  // 任务侧开关关着（07 以后、其它关卡）：沟与洞都回到这一轮之前的四档。
  gate.firstLevelSoundscape = false;
  assert.equal(Z(0, -1, 30), "interior", "开关关着：dugoutRoof 退回 interior");
  roof = null;
  assert.equal(Z(0, -2 + 1.6, 0), "open", "开关关着：沟里仍判 open（07 以后行为不变）");
  gate.firstLevelSoundscape = true;
  const sink = w.TrenchSink({ x: 0, y: -0.4, z: 0 });
  assert.ok(sink.rise >= TRENCH_ZONE.minRiseM && sink.sunkDirs >= 4, `沟中线：两侧高出 ${sink.rise.toFixed(2)} m，${sink.sunkDirs} 个方向高`);
  Ok(`壕沟/洞室判据：沟中线高出 ${sink.rise.toFixed(2)} m → trench，低顶 → dugout，平地屋顶仍是 interior`);
}
{
  const plays = [];
  const audio = { firstLevelSoundscape: true, Play: (cue, o) => { plays.push({ t: clock, cue, ...o }); return { cue }; }, StopVoice() {}, SetBattleIntensity() {} };
  let clock = 0;
  const player = { Alive: true, health: 100, suppression: 0, stance: "stand", sprint: 0, heartbeatTimer: 0, position: { x: 0, y: 0, z: 0 } };
  const w = new AudioWiring({ audio, player, battlefield: null });
  const Step = (s, sup) => { for (let t = 0; t < s; t += 1 / 60) { clock += 1 / 60; w.time += 1 / 60; if (sup !== undefined) player.suppression = sup; w.SuppressionBody(1 / 60); w.BodyFoley(1 / 60); } };
  Step(2, 0);
  assert.equal(plays.filter((p) => p.cue === "heartbeat" || p.cue === "breathHeavy").length, 0, "没压制时不喘不跳");
  Step(6, 0.95);
  const pinned = plays.filter((p) => p.cue === "heartbeat");
  const gaps = pinned.slice(1).map((p, i) => p.t - pinned[i].t);
  const bpm = 60 / (gaps.slice(-4).reduce((a, b) => a + b, 0) / 4);
  assert.ok(plays.some((p) => p.cue === "breathHeavy"), "被压住时喘");
  assert.ok(bpm > 115 && bpm <= SUPPRESSION_BODY.heartBpmMax + 1, `被压住时心跳 ${bpm.toFixed(0)} bpm`);
  const loud = pinned.at(-1).volume;
  // 火力停了：不是立刻停，而是几秒里慢慢平下来。
  const cut = plays.length;
  Step(2.5, 0);
  const after = plays.slice(cut).filter((p) => p.cue === "heartbeat");
  assert.ok(after.length >= 2 && after.at(-1).volume < loud, `停火后心跳还在、在变轻（${after.length} 拍，${loud.toFixed(2)}→${after.at(-1)?.volume.toFixed(2)}）`);
  Step(12);
  const tail = plays.filter((p) => p.cue === "heartbeat" && p.t > clock - 3);
  assert.equal(tail.length, 0, "十几秒后完全平下来");
  // 濒死心跳在跳的时候让位。
  player.heartbeatTimer = 0.5; const n = plays.length;
  Step(3, 0.95);
  assert.equal(plays.slice(n).filter((p) => p.cue === "heartbeat").length, 0, "濒死心跳接管时不叠第二条");
  // 任务侧开关关着：压住了也不喘不跳（07 以后行为不变）。
  player.heartbeatTimer = 0; audio.firstLevelSoundscape = false; const m = plays.length;
  Step(6, 0.95);
  assert.equal(plays.slice(m).filter((p) => p.cue === "heartbeat" || p.cue === "breathHeavy").length, 0, "开关关着：压制不触发喘息心跳");
  assert.equal(w.stress, 0, "开关关着：压制包络清零");
  Ok(`压制：心跳 ${bpm.toFixed(0)} bpm，停火后慢落，濒死心跳时让位`);
}

// ---------------------------------------------------------------------------
// 5) 耳鸣两档、配乐让位
// ---------------------------------------------------------------------------
{
  for (const [name, P] of Object.entries({ combat: TINNITUS.combat, story: TINNITUS.story })) {
    const hz = P.recover.map((r) => r[1]), ts = P.recover.map((r) => r[0]);
    assert.ok(hz.every((h, i) => i === 0 || h > hz[i - 1]) && ts.every((t, i) => i === 0 || t > ts[i - 1]), `${name}：高频一段一段回来`);
    assert.equal(hz[0], P.lowHz); assert.equal(hz.at(-1), 20000);
    assert.ok(P.beatHz > 2 && P.beatHz < 12, `${name}：两条音拍出 ${P.beatHz} Hz 的起伏`);
  }
  assert.ok(TINNITUS.story.ringS > TINNITUS.combat.ringS * 3 && TINNITUS.story.recover.at(-1)[0] > TINNITUS.combat.recover.at(-1)[0] * 4,
    "剧情炮震（01 近爆、02 枪托）的恢复比战斗近爆长得多");
  assert.ok(1.1 >= TINNITUS.storyFromS && 0.45 < TINNITUS.storyFromS, "Deafen(1.1) 走剧情档，接线层的 0.45 走战斗档");
  Ok("耳鸣两档：双音拍频、分段恢复、剧情档长尾");
}
{
  const base = FirstLevelMusicState("MachineGun", { intensity: 0 }).scale;
  const hot = FirstLevelMusicState("MachineGun", { intensity: 1 }).scale;
  const sting = FirstLevelMusicState("MachineGun", { intensity: 1, stingerAgeS: 2 }).scale;
  const later = FirstLevelMusicState("MachineGun", { intensity: 1, stingerAgeS: 30 }).scale;
  assert.ok(hot < base * 0.6, `交火最凶时配乐退让：${base} → ${hot}`);
  assert.ok(sting > base, `战车露面/缺口重开时配乐给一个标点：${sting}`);
  assert.equal(later, hot, "标点过去之后回到让位");
  assert.equal(FirstLevelMusicState("Transfer", { intensity: 1 }).scale, 1, "07 以后的配乐不让位");
  const levels = [];
  const music = new FirstLevelMissionMusic({ ctx: { currentTime: 0 }, battleIntensity: 0.2, Music() {}, SetMusicLevel: (s) => levels.push(s) });
  let tank = false;
  music.Update("Tank", { has: (id) => tank && id === FIRST_LEVEL_MUSIC_COMBAT.stingers[0] });
  tank = true; music.Update("Tank", { has: (id) => tank && id === FIRST_LEVEL_MUSIC_COMBAT.stingers[0] });
  assert.ok(levels.at(-1) > 1, "战车露面那一刻配乐抬起来");
  // 冷启动：新建的配乐第一次看事实表时事实已经在（阶段跳转进 04、读档），不补标点。
  const cold = [];
  const music2 = new FirstLevelMissionMusic({ ctx: { currentTime: 50 }, battleIntensity: 1, Music() {}, SetMusicLevel: (s) => cold.push(s) });
  const has2 = (id) => id === FIRST_LEVEL_MUSIC_COMBAT.stingers[0];
  music2.Update("Tank", { has: has2 });
  music2.Update("Tank", { has: has2 });
  assert.ok(!(music2.current.scale > 1) && cold.every((s) => s <= 1), `冷启动时事实已在：不补标点（${music2.current.scale}）`);
  Ok(`配乐：静 ${base} / 激战 ${hot} / 标点 ${+sting.toFixed(3)}`);
}

console.log(`FirstLevelBattleSoundTest：${passed} 组通过`);
