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
import { MISSION_BATTLE_SOUND as D, OPENING_AMBIENCE_PRESETS } from "./Data_FirstLevelMissionBattleSound.mjs";
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
    clock: 0, calls: [], ambience: [], zone, timers: [], ducks: [], shapes: [],
    Play(cue, o = {}) { const v = { cue }; a.calls.push({ t: a.clock, cue, ...o }); a.pendingVoices.add(v); a.timers.push([a.clock + life, v]); return v; },
    Ambience(p, o = {}) { a.ambiencePreset = p; a.ambience.push({ t: a.clock, p, ...o }); },
    ListenerZone() { return a.zone; },
    Duck(seconds, amount) { a.ducks.push({ t: a.clock, seconds, amount }); },
    ShapeFarBeds(shape) { a.shapes.push({ t: a.clock, ...shape }); return 2; },
    Tick(dt) { a.clock += dt; a.timers = a.timers.filter(([at, v]) => (at <= a.clock ? (a.pendingVoices.delete(v), false) : true)); },
  };
  return a;
}
function Run(sound, audio, stage, seconds, { dt = 1 / 30, speaking = false } = {}) {
  for (let t = 0; t < seconds; t += dt) { audio.Tick(dt); sound.Update(dt, stage, speaking); }
}
const Dist = (c, L) => Math.hypot(c.position.x - L.x, c.position.z - L.z);
/**
 * 假宿主：任务事实 + 开场导演（只读相位与 beats）+ 地面。director = true 给一个停在 Banter 的导演（01 的显现兜底走导演相位；
 * 卡住的保险是 stuckS，比测试跑的时间长），false 没有导演（兜底走 stageS）。
 */
function FakeHost({ facts = new Set(), director = true, soldiers = [] } = {}) {
  const bunker = { phase: "Banter", beats: new Set(["Banter"]) };
  return { facts, bunker, Has: (id) => facts.has(id), ai: { soldiers }, battlefield: { GroundHeight: () => 0 },
    ...(director ? { frontShow: { bunker } } : {}),
    Phase(name) { bunker.phase = name; bunker.beats.add(name); } };
}

// ---------------------------------------------------------------------------
// 1) 远处交火生成器
// ---------------------------------------------------------------------------
{
  // 显现之前（导演停在 Banter、传令兵还没开口）的 01：一分钟里全部隔着土、远、走远声组。显现之后的样子见「01 显现」那一节。
  const audio = FakeAudio();
  const sound = new FirstLevelMissionBattleSound(audio, FakeHost(), 0x19380923);
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
  // 【2026-09-27】前线每一声都带 yieldFirst（预算紧时对更近的新声无条件让位）；别的调用方不带
  //（空袭炸弹也是 selfCapped soundField，原来按这两个标推断会被当成头号受害者）。
  assert.ok(front.every((c) => c.yieldFirst === true), "前线每一声都带 yieldFirst");
  assert.ok(audio.calls.filter((c) => !front.includes(c)).every((c) => !c.yieldFirst), "前线以外的声不带 yieldFirst");
  const f = sound.State().front;
  const refusedLog = sound.frontRecent.filter((r) => !r.played).length;
  assert.ok(f.refused > 0 && f.plays + f.refused === front.length,
    `引擎拒收单独记账：排出 ${front.length} = 收下 ${f.plays} + 拒收 ${f.refused}（自己的上限另记 skipped ${f.skipped}）`);
  assert.ok(refusedLog > 0, "frontRecent 里拒收的那几声 played=false");
  Ok(`前线 ${front.length} 声全带 selfCapped；拒收 ${f.refused} 单独记账，plays ${f.plays} 只数收下的`);
}
{
  // 【2026-09-29】01 的前线跟着剧情走（用户：「传令兵说话的那一刻，外围的战场的声音就应该要显现了」）。
  // 旧的计时渐强（09-24 恢复的那一条：进 01 起 50 s 到顶，与剧情节点无关）换成三段：
  //   显现前（洞里战斗间隙）：稀、低、闷；传令兵开口（任务事实 runnerCallHeard）：1–3 s 内低通打开、交火翻倍、
  //   中距离圈起、床拉开、一段设计好的序列；之后 buildS 秒推到顶，近爆事实来了 catchUpS 内补完。
  // 逐项量 State().front.reveal / swell 与 Play 出来的每一声。浏览器里的电平、频谱与录音见 docs/Data_AudioWiring.md 3d。
  const P = D.front.stages.Trapped, S = P.swell, R = P.reveal;
  assert.ok(S && R && R.fact === "runnerCallHeard" && R.riseS >= 1 && R.riseS <= 3, "01 有渐强与显现数据，显现在 1–3 s 里完成");
  const Rel = (c) => c.volume / D.front.cueVolume[c.cue];
  const Mean = (xs) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
  const Db = (x) => 20 * Math.log10(x);
  const Front = (audio, a, b) => audio.calls.filter((c) => c.soundField && c.t >= a && c.t < b);
  const Make = (seed = 0x19380929, opts = {}) => {
    const facts = opts.facts || new Set(), host = FakeHost({ facts, director: opts.director !== false });
    const audio = FakeAudio({ zone: "dugout" });
    return { facts, host, audio, sound: new FirstLevelMissionBattleSound(audio, host, seed) };
  };

  // ① 显现之前：lull。
  const { facts, host, audio, sound } = Make();
  Run(sound, audio, "Trapped", 30);
  {
    const f = sound.State().front;
    assert.ok(f.reveal.source === null && f.reveal.open === 0 && f.reveal.beats === 0, `显现前没有显现：${JSON.stringify(f.reveal)}`);
    assert.ok(f.swell.u <= R.lullU + 1e-9, `显现前 u 只爬到 lullU ${R.lullU}：${f.swell.u}`);
    assert.equal(f.reveal.cutHz, P.airCut, "显现前低通就是「隔着土」");
    assert.ok(Front(audio, 0, 1e9).every((c) => c.airCut <= P.airCut), "显现前每一声都闷");
    assert.equal(audio.ducks.length, 0, "显现前不动配乐");
    assert.equal(audio.shapes.length, 0, "显现前不动远声组的床");
    assert.ok(sound.State().front.sectors.filter((s) => /^Mid/.test(s.id)).every((s) => s.exchanges === 0), "显现前中距离圈不起");
  }
  const lullGain = sound.State().front.swell.gain * P.gain, lullIntensity = sound.State().front.swell.intensity * P.intensity;

  // ② 传令兵开口：事实一记，序列排进队列，配乐让一下，床拉开。
  const t0 = audio.clock;
  facts.add(R.fact);
  Run(sound, audio, "Trapped", 0.1);
  {
    const f = sound.State().front;
    assert.ok(f.reveal.source === "fact" && f.reveal.beats >= 5, `事实一到就显现：${JSON.stringify(f.reveal)}`);
    assert.ok(audio.ducks.length === 1 && audio.ducks[0].seconds === R.musicDuck.seconds && audio.ducks[0].amount === R.musicDuck.amount,
      "显现那一刻配乐让一下（Duck 一次）");
    assert.deepEqual(audio.shapes.map((x) => [x.level, x.cut, x.rampS]), [[R.beds.level, R.beds.cut, R.riseS]], "远声组的床在 riseS 里拉开");
  }
  let prevOpen = -1;
  for (let t = 0; t < R.riseS + 0.3; t += 0.1) {
    Run(sound, audio, "Trapped", 0.1);
    const o = sound.State().front.reveal.open;
    assert.ok(o >= prevOpen - 1e-9, "open 只升不降");
    prevOpen = o;
  }
  assert.equal(sound.State().front.reveal.open, 1, `${R.riseS} s 之后完全打开`);
  Run(sound, audio, "Trapped", R.holdS + 0.5);
  // 序列（头 4.5 s）：机枪一梭、步枪连成片、日军炮口 + 落点、一发近落弹（啸声 + 爆炸），全部低通开到 cut.open。
  {
    const seq = audio.calls.filter((c) => c.t >= t0 && c.t < t0 + R.holdS + 0.6);
    const sf = seq.filter((c) => c.soundField);
    const mg = sf.filter((c) => c.cue === "type92Far" && c.burst >= 8);
    const answer = sf.filter((c) => c.cue === "zb26Far" && c.burst >= 3);
    const rifles = sf.filter((c) => c.cue === "rifleNraFar" || c.cue === "rifleIjaFar");
    const crackle = R.beats.find((b) => b.kind === "crackle");
    assert.ok(mg.length >= 1 && answer.length >= 1, `序列有日军九二式一梭与我方捷克式回击：${mg.length}/${answer.length}`);
    assert.ok(rifles.length >= crackle.shots * 0.7, `步枪噼啪连成片：${rifles.length}/${crackle.shots} 发`);
    assert.ok(sf.some((c) => c.cue === "amb.cannonFar") && sf.some((c) => c.cue === "explosionFar"), "日军炮口一声，炮弹落在我方一线");
    const shell = seq.filter((c) => !c.soundField && c.cue === "shellIncoming");
    assert.ok(shell.length === 1 && seq.some((c) => !c.soundField && /^explosion(Mid|Far)$/.test(c.cue) && c.airCut > 900),
      "序列里一发场外近落弹：先有啸声，爆炸的低通也打开了");
    // 啸声摆在「听者 → 落点」连线上（incomingShare），不在 100 m 外的落点上空。
    const L = audio.listenerPos, wd = Math.hypot(shell[0].position.x - L.x, shell[0].position.z - L.z);
    assert.ok(wd < 80, `啸声摆在头顶一侧（离听者 ${wd.toFixed(0)} m），不是落点上空`);
    assert.ok(sound.artillery.State().scripted === 1 && sound.State().front.reveal.shells === 1, "近落弹是剧本点名的一发");
    assert.ok(sf.every((c) => c.selfCapped === true && c.yieldFirst === true), "序列的声也走前线的声部账（selfCapped / yieldFirst）");
    const scripted = [...mg, ...answer, ...rifles];
    assert.ok(scripted.every((c) => c.airCut <= R.cut.open + 1) && scripted.some((c) => c.airCut === R.cut.open),
      `序列的低通开到 ${R.cut.open} Hz`);
    // 比显现前响得多：序列每一声相对自己 cueVolume 的平均 vs 显现前那一分钟。
    const before = Front(audio, 0, t0).map(Rel);
    assert.ok(Mean(rifles.map(Rel)) >= Mean(before) * 1.6,
      `序列的步枪比显现前响 ≥ 4 dB（另有低通打开、更近的距离，远声组整体的台阶见浏览器实测）：${Db(Mean(rifles.map(Rel)) / Mean(before)).toFixed(1)} dB`);
    // 声部：序列最多同时 scriptedMaxVoices 条前线声，合计不过共享账。
    assert.ok(sound.frontPeakShared <= D.front.sharedMaxVoices, `序列期间前线 + 落土 + 炮击合计峰值 ${sound.frontPeakShared} ≤ ${D.front.sharedMaxVoices}`);
  }
  // 显现完成后（open = 1，u 从 lull 爬到 revealU）：音量台阶、频次翻倍、随机交火的低通、中距离圈。
  {
    const f = sound.State().front;
    const after = f.swell.gain * P.gain, afterIntensity = f.swell.intensity * P.intensity;
    assert.ok(Db(after / lullGain) >= 8, `显现前后音量台阶 ${Db(after / lullGain).toFixed(1)} dB（≥ 8）`);
    assert.ok(afterIntensity >= lullIntensity * 1.6, `交火频次 ×${(afterIntensity / lullIntensity).toFixed(2)}（≥ 1.6）`);
    assert.equal(f.reveal.cutHz, R.cut.open, "显现之后随机交火的低通是 cut.open");
  }
  Run(sound, audio, "Trapped", 24);
  {
    const mids = sound.State().front.sectors.filter((s) => /^Mid/.test(s.id));
    assert.ok(mids.length === 2 && mids.every((s) => s.exchanges > 0 && s.plays > 0), `中距离两圈都起了：${JSON.stringify(mids)}`);
    const midCfg = D.front.sectors.filter((s) => s.ring === "mid"), L = audio.listenerPos;
    for (const s of midCfg) for (const side of ["nra", "ija"]) {
      const d = Math.hypot(s[side].x - L.x, s[side].z - L.z);
      assert.ok(d >= 150 && d <= 320, `${s.id}.${side} 离 01 听者 ${d.toFixed(0)} m（中距离 150–320 m）`);
    }
    assert.ok(sound.frontRecent.filter((r) => /^Mid/.test(r.sector)).every((r) => r.distance >= 120 && r.distance <= 360), "中距离圈的实际落点在 120–360 m");
    const roof = audio.calls.filter((c) => c.cue === D.front.roofDirt.cue && c.t >= t0 && Math.hypot(c.position.x - L.x, c.position.z - L.z) < 1);
    assert.ok(roof.length >= 1 && roof.every((c) => c.position.y > L.y), `前线的炮落下来洞顶掉土 ${roof.length} 次，都在头顶上`);
  }
  Ok(`01 显现：事实一记 ${R.riseS} s 打开，序列（机枪 / 噼啪 / 炮 / 近落弹）、音量台阶 ≥ 8 dB、频次 ×1.6、中距离圈、低通 ${P.airCut}→${R.cut.open} Hz、配乐让一下、床拉开`);

  // ③ 往近爆推高：u 单调不降，近爆事实一到 catchUpS 内补到 1，低通在 afterBlastS 秒里滑回 afterBlast。
  // 新起一局：显现后 10 s 时近爆（这时 u 还在 revealU 与 1 之间；buildS 26 s 才推到顶）。
  const g3 = Make(0x19380930), sound3 = g3.sound, audio3 = g3.audio, facts3 = g3.facts;
  Run(sound3, audio3, "Trapped", 20);
  facts3.add(R.fact);
  Run(sound3, audio3, "Trapped", 10);
  const uBefore = sound3.State().front.swell.u;
  assert.ok(uBefore >= R.revealU - 1e-9 && uBefore < 1, `显现后 u 在 revealU ${R.revealU} 与 1 之间：${uBefore}`);
  facts3.add(S.peakFact);
  let prevU = uBefore, topAt = null;
  for (let t = 0; t < S.catchUpS + 1; t += 0.1) {
    Run(sound3, audio3, "Trapped", 0.1);
    const u = sound3.State().front.swell.u;
    assert.ok(u >= prevU - 1e-9, "补到顶的过程只升不降");
    prevU = u;
    if (topAt === null && u >= 1) topAt = t + 0.1;
  }
  assert.ok(topAt !== null && topAt <= S.catchUpS + 0.15, `近爆 → ${topAt?.toFixed(1)} s 补到顶（≤ ${S.catchUpS} s）`);
  Run(sound3, audio3, "Trapped", R.cut.afterBlastS + 0.5);
  {
    const f = sound3.State().front, m = audio3.calls.length;
    assert.ok(Math.abs(f.reveal.cutHz - R.cut.afterBlast) <= 1, `近爆之后低通滑回 ${R.cut.afterBlast} Hz：${f.reveal.cutHz}`);
    assert.ok(f.swell.gain === 1 && f.swell.intensity === 1, "近爆之后停在顶上，不回落");
    Run(sound3, audio3, "Trapped", 20);
    assert.ok(audio3.calls.slice(m).filter((c) => c.sound3Field).every((c) => c.airCut <= R.cut.afterBlast + 1), "近爆之后每一声的低通都在 afterBlast 以下");
  }
  Ok(`01 近爆：${topAt.toFixed(1)} s 补到顶，低通 ${R.cut.open}→${R.cut.afterBlast} Hz，之后不回落`);

  // ④ 接 02：床收回预设原样，02 用自己的基线、中距离圈不再起。
  const midPlays = () => sound.State().front.sectors.filter((s) => /^Mid/.test(s.id)).reduce((n, s) => n + s.plays, 0);
  const midBefore = midPlays();
  Run(sound, audio, "BunkerRescue", 30);
  assert.deepEqual([audio.shapes.at(-1).level, audio.shapes.at(-1).cut, audio.shapes.at(-1).rampS], [1, 1, R.beds.releaseS], "01 → 02：床在 releaseS 里收回");
  assert.ok(sound.State().front.swell.intensity === 1 && sound.State().front.swell.gain === 1, "02 用自己的基线");
  assert.equal(midPlays(), midBefore, "02 里中距离圈不起");
  Ok("01 → 02：远声组的床收回预设原样，中距离圈不再起");
}
{
  // 触发的几条路：事实 / 导演相位兜底 / 没有导演的时间兜底 / 导演卡住的保险 / 近爆先到 / 进来时已显现。
  const P = D.front.stages.Trapped, R = P.reveal, S = P.swell;
  const Src = (sound) => sound.State().front.reveal;
  // 兜底一：导演相位进了 Orders 之后 afterS 秒。
  {
    const { host, audio, sound } = { host: FakeHost(), audio: FakeAudio({ zone: "dugout" }) };
    const s = new FirstLevelMissionBattleSound(audio, host, 1);
    Run(s, audio, "Trapped", 25);
    assert.equal(Src(s).source, null, "导演还在 Banter：不显现");
    host.Phase("Orders");
    Run(s, audio, "Trapped", R.fallback.afterS - 0.3);
    assert.equal(Src(s).source, null, `Orders 之后 ${R.fallback.afterS} s 之内还不显现`);
    Run(s, audio, "Trapped", 0.6);
    assert.equal(Src(s).source, "phase", `Orders 之后 ${R.fallback.afterS} s：兜底显现`);
    assert.ok(Src(s).beats > 0 && audio.ducks.length === 1, "兜底显现也演序列、也让配乐");
  }
  // 兜底二：没有导演（夹具）进 01 后 stageS 秒；有导演但卡住时 stuckS 秒。
  {
    const host = FakeHost({ director: false }), audio = FakeAudio({ zone: "dugout" });
    const s = new FirstLevelMissionBattleSound(audio, host, 2);
    Run(s, audio, "Trapped", R.fallback.stageS - 1);
    assert.equal(Src(s).source, null);
    Run(s, audio, "Trapped", 2);
    assert.equal(Src(s).source, "time", `没有导演：进 01 后 ${R.fallback.stageS} s 兜底`);
    const host2 = FakeHost(), audio2 = FakeAudio({ zone: "dugout" });
    const s2 = new FirstLevelMissionBattleSound(audio2, host2, 2);
    Run(s2, audio2, "Trapped", R.fallback.stageS + 5);
    assert.equal(Src(s2).source, null, "有导演时不按 stageS 显现（导演的节奏可能比它长）");
    Run(s2, audio2, "Trapped", R.fallback.stuckS - R.fallback.stageS - 5 + 1);
    assert.equal(Src(s2).source, "time", `导演卡住：${R.fallback.stuckS} s 保险`);
  }
  // 近爆事实先到（导演走得快 / 调试入口）：不演序列，直接显现。
  {
    const facts = new Set(), host = FakeHost({ facts }), audio = FakeAudio({ zone: "dugout" });
    const s = new FirstLevelMissionBattleSound(audio, host, 3);
    Run(s, audio, "Trapped", 20);
    facts.add(S.peakFact);
    Run(s, audio, "Trapped", 0.2);
    assert.ok(Src(s).source === "peak" && Src(s).beats === 0 && audio.ducks.length === 0 && Src(s).open >= 0.99, `近爆先到：直接显现（${JSON.stringify(Src(s))}）`);
  }
  // 进来时事实已经在（跳阶段进 Orders 以后导演会补记）：第一帧就是「已显现」，不演序列。
  {
    const facts = new Set([R.fact]), host = FakeHost({ facts }), audio = FakeAudio({ zone: "dugout" });
    const s = new FirstLevelMissionBattleSound(audio, host, 4);
    Run(s, audio, "Trapped", 0.1);
    const r = Src(s), w = s.State().front.swell;
    assert.ok(r.source === "enter" && r.beats === 0 && audio.ducks.length === 0 && r.open >= 0.99 && w.u >= R.revealU - 1e-9,
      `进来时已显现：${JSON.stringify(r)} u ${w.u}`);
    assert.ok(audio.shapes.length === 1 && audio.shapes[0].level === R.beds.level, "床直接拉开");
  }
  // 检查点重来：近爆 / 传令兵的事实被删掉，前线回到显现之前，床收回；事实若仍留着，等它被删了再认。
  {
    const facts = new Set(), host = FakeHost({ facts }), audio = FakeAudio({ zone: "dugout" });
    const s = new FirstLevelMissionBattleSound(audio, host, 5);
    Run(s, audio, "Trapped", 10);
    facts.add(R.fact);
    Run(s, audio, "Trapped", 8);
    assert.ok(Src(s).source === "fact" && Src(s).open === 1);
    facts.delete(R.fact);
    host.bunker.beats.delete("Orders");
    Run(s, audio, "Trapped", 0.2);
    assert.ok(Src(s).source === null && Src(s).open === 0 && s.State().front.swell.u < 0.05, `事实被删：回到显现之前 ${JSON.stringify(Src(s))}`);
    assert.deepEqual([audio.shapes.at(-1).level, audio.shapes.at(-1).cut], [1, 1], "床收回");
    facts.add(R.fact);
    Run(s, audio, "Trapped", 0.2);
    assert.equal(Src(s).source, "fact", "再记一次事实又显现（序列重演）");
    assert.ok(audio.ducks.length === 2, "序列重演时配乐再让一下");
    // 事实留着不删（近爆的事实被删了）：重来后不立刻显现。
    facts.add(S.peakFact);
    Run(s, audio, "Trapped", 3);
    facts.delete(S.peakFact);
    Run(s, audio, "Trapped", 0.2);
    assert.equal(Src(s).source, null, "近爆事实被删 = 整拍重来");
    Run(s, audio, "Trapped", 2);
    assert.equal(Src(s).source, null, "传令兵的事实还留着（没被删）：不立刻再显现");
    facts.delete(R.fact);
    Run(s, audio, "Trapped", 0.2);
    facts.add(R.fact);
    Run(s, audio, "Trapped", 0.2);
    assert.equal(Src(s).source, "fact", "被删过再记：认");
  }
  Ok("01 显现的触发：事实 / 导演相位 / 时间 / 卡住保险 / 近爆先到 / 进来已显现 / 检查点重来");
}
{
  // 显现与说话（传令兵那句、BunkerOrders 的台词）：序列里的大件让一句话过去再响（最多 deferS 秒）、回击跟在机枪一梭后面、
  // 新起的前线声压低 dipDb、远声组的床压到 speechScale 倍并在话停后放回；显现之前不动（lull 本来就轻）。
  const P = D.front.stages.Trapped, R = P.reveal, SP = R.speech;
  const Run2 = (sound, audio, seconds, speaking) => Run(sound, audio, "Trapped", seconds, { speaking });
  const Big = (audio) => audio.calls.find((c) => c.soundField && c.cue === "type92Far" && c.burst >= 8 && c.position.x > 100);
  // ① 一直说着话：机枪一梭等 deferS 秒后照响，回击跟在它后面 gap 秒。
  {
    const facts = new Set(), host = FakeHost({ facts }), audio = FakeAudio({ zone: "dugout" });
    const s = new FirstLevelMissionBattleSound(audio, host, 0x5e11);
    Run2(s, audio, 20, false);
    const t0 = audio.clock;
    facts.add(R.fact);
    Run2(s, audio, SP.deferS - 0.4, true);
    const early = audio.calls.filter((c) => c.t >= t0 && c.soundField && c.cue === "type92Far" && c.burst >= 8 && c.position.x > 200 && c.position.x < 300);
    assert.equal(early.length, 0, `一直说着话：机枪一梭在 deferS ${SP.deferS} s 之前不响`);
    assert.equal(audio.calls.filter((c) => c.t >= t0 && !c.soundField && c.cue === "shellIncoming").length, 0, "近落弹的啸声也等着");
    Run2(s, audio, 1.2, true);
    const mg = audio.calls.find((c) => c.t >= t0 && c.soundField && c.cue === "type92Far" && c.burst >= 8 && c.position.x > 200 && c.position.x < 300);
    assert.ok(mg && mg.t - t0 <= SP.deferS + 0.2, `说了 ${SP.deferS} s 还没停：照响（${mg ? (mg.t - t0).toFixed(2) : "没响"} s）`);
    Run2(s, audio, 3, true);
    const reply = audio.calls.find((c) => c.t >= t0 && c.soundField && c.cue === "zb26Far" && c.burst >= 3 && c.t > mg.t);
    assert.ok(reply && reply.t - mg.t >= R.beats.find((b) => b.after === "mg").gap - 0.1, `回击跟在机枪一梭后面 ≥ ${R.beats.find((b) => b.after === "mg").gap} s：${reply ? (reply.t - mg.t).toFixed(2) : "没响"} s`);
  }
  // ② 话在 deferS 内停了：大件在话停（+ holdS）之后马上响。
  {
    const facts = new Set(), host = FakeHost({ facts }), audio = FakeAudio({ zone: "dugout" });
    const s = new FirstLevelMissionBattleSound(audio, host, 0x5e12);
    Run2(s, audio, 20, false);
    const t0 = audio.clock;
    facts.add(R.fact);
    Run2(s, audio, 1.0, true);
    Run2(s, audio, 3, false);
    const mg = audio.calls.find((c) => c.t >= t0 && c.soundField && c.cue === "type92Far" && c.burst >= 8 && c.position.x > 200 && c.position.x < 300);
    assert.ok(mg && mg.t - t0 >= 1.0 + SP.holdS - 0.1 && mg.t - t0 <= 1.0 + SP.holdS + 0.5, `话停之后（+ ${SP.holdS} s）机枪一梭响：${mg ? (mg.t - t0).toFixed(2) : "没响"} s`);
  }
  // ③ 床跟着说话让：说话时压到 speechScale 倍，话停后（+ holdS）放回；显现之前说话不动床。
  {
    const facts = new Set(), host = FakeHost({ facts }), audio = FakeAudio({ zone: "dugout" });
    const s = new FirstLevelMissionBattleSound(audio, host, 0x5e13);
    Run2(s, audio, 10, true);
    assert.equal(audio.shapes.length, 0, "显现之前说话不动床");
    facts.add(R.fact);
    Run2(s, audio, 0.3, true);
    Run2(s, audio, 2, true);
    const last = () => audio.shapes.at(-1);
    assert.ok(Math.abs(last().level - R.beds.level * R.beds.speechScale) < 1e-9, `说话时床 ×${R.beds.level * R.beds.speechScale}：${JSON.stringify(last())}`);
    Run2(s, audio, SP.holdS + 0.5, false);
    assert.ok(Math.abs(last().level - R.beds.level) < 1e-9 && last().cut === R.beds.cut, `话停之后床放回 ×${R.beds.level}：${JSON.stringify(last())}`);
  }
  // ④ 新起的前线声说话时压低 dipDb：同一个种子、同一段，说话与不说话每一声相对音量的均值之比。
  {
    const Mean = (xs) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
    const rel = (speaking) => {
      const out = [];
      for (let seed = 1; seed <= 8; seed += 1) {
        const facts = new Set([R.fact]), host = FakeHost({ facts }), audio = FakeAudio({ zone: "dugout" });
        const s = new FirstLevelMissionBattleSound(audio, host, seed);
        Run2(s, audio, 30, speaking);
        out.push(...audio.calls.filter((c) => c.soundField && c.t > 12).map((c) => c.volume / D.front.cueVolume[c.cue]));
      }
      return Mean(out);
    };
    const talk = rel(true), quiet = rel(false);
    const db = 20 * Math.log10(talk / quiet);
    assert.ok(db < SP.dipDb * 0.6 && db > SP.dipDb * 1.6, `说话时每一声轻 ${db.toFixed(1)} dB（数据 ${SP.dipDb} dB）`);
  }
  // ⑤ 回声：显现之后（open ≥ fromOpen）有；显现之前没有。回声比原声轻 gainDb、更闷、在另一个方位、晚 delayS。
  {
    const E = D.front.echo;
    const facts = new Set(), host = FakeHost({ facts }), audio = FakeAudio({ zone: "dugout" });
    const s = new FirstLevelMissionBattleSound(audio, host, 0x5e14);
    Run(s, audio, "Trapped", 40);
    assert.equal(s.State().front.echoes, 0, "显现之前没有回声");
    facts.add(R.fact);
    Run(s, audio, "Trapped", 40);
    const n = s.State().front.echoes;
    assert.ok(n >= 3, `显现之后有回声：${n} 条`);
    assert.ok(Object.keys(E.chance).every((cue) => D.front.cueVolume[cue] != null), "回声的 cue 都在 cueVolume 表里");
    // 一条回声的几何：从一场固定的爆炸算出来。
    const s2 = new FirstLevelMissionBattleSound(FakeAudio({ zone: "dugout" }), FakeHost({ facts: new Set([R.fact]) }), 7);
    s2.frontTime = 100;
    s2.rng = () => 0.1;   // chance 判定通过，逆时针转，延迟取小端
    s2.MaybeEcho({ cue: "explosionFar", sector: "X", side: "impact", pos: { x: 300, z: -126 }, gainDb: 0 });
    const echo = s2.frontQueue.at(-1), L = s2.audio.listenerPos;
    const d1 = Math.hypot(300 - L.x, -126 - L.z), d2 = Math.hypot(echo.pos.x - L.x, echo.pos.z - L.z);
    const a1 = Math.atan2(300 - L.x, -126 - L.z), a2 = Math.atan2(echo.pos.x - L.x, echo.pos.z - L.z);
    let turn = Math.abs((a2 - a1) * 180 / Math.PI); if (turn > 180) turn = 360 - turn;
    assert.ok(echo && echo.echo && echo.gainDb === E.gainDb && echo.at >= 100 + E.delayS[0] && echo.at <= 100 + E.delayS[1] + 1e-9
      && Math.abs(d2 / d1 - E.distanceScale) < 1e-6 && turn >= E.turnDeg[0] - 1e-6 && turn <= E.turnDeg[1] + 1e-6,
    `回声几何：${JSON.stringify({ gain: echo?.gainDb, delay: echo && +(echo.at - 100).toFixed(2), dist: +(d2 / d1).toFixed(2), turn: +turn.toFixed(1) })}`);
  }
  Ok("01 显现与说话：大件让一句话（最多 deferS）、回击跟在后面、新起的声压低、床跟着让并放回；回声：显现后有、几何对");
}
{
  // 由稀到密：16 个种子平均，显现前 20 s 的前线声数 vs 显现完成（序列过后）20 s 的声数。
  const R = D.front.stages.Trapped.reveal;
  let lull = 0, open = 0;
  for (let seed = 1; seed <= 16; seed += 1) {
    const facts = new Set(), host = FakeHost({ facts }), audio = FakeAudio({ zone: "dugout" });
    const s = new FirstLevelMissionBattleSound(audio, host, seed);
    Run(s, audio, "Trapped", 30);
    const t0 = audio.clock;
    facts.add(R.fact);
    Run(s, audio, "Trapped", 40);
    lull += audio.calls.filter((c) => c.soundField && c.t >= 10 && c.t < 30).length;
    open += audio.calls.filter((c) => c.soundField && c.t >= t0 + R.holdS + 1 && c.t < t0 + R.holdS + 21).length;
  }
  assert.ok(open > lull * 1.6, `由稀到密（16 个种子平均）：显现前 20 s ${(lull / 16).toFixed(1)} 声 → 显现后 20 s ${(open / 16).toFixed(1)} 声`);
  // 其它步骤不受影响：没有渐强、没有显现，进步骤第一帧起倍率就是 1；01 之后接 02 也是。
  for (const stage of Object.keys(D.front.stages).filter((id) => id !== "Trapped")) {
    assert.equal(D.front.stages[stage].swell, undefined, `${stage} 没有渐强数据`);
    assert.equal(D.front.stages[stage].reveal, undefined, `${stage} 没有显现数据`);
    const a4 = FakeAudio(), s4 = new FirstLevelMissionBattleSound(a4, null);
    Run(s4, a4, stage, 0.1);
    const w = s4.State().front.swell;
    assert.ok(w.intensity === 1 && w.gain === 1, `${stage} 一进来强度就是本档基线`);
  }
  Ok(`01 由稀到密：显现前 20 s ${(lull / 16).toFixed(1)} 声 → 显现后 ${(open / 16).toFixed(1)} 声；其余 01–06 步骤进来就是本档基线`);
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
  // 【2026-09-26】开场过场（02 BunkerRescue）按步骤覆盖 speechRate：台词占大半时间，远处只少起一两成。
  // 同一套计数，只换步骤；前线与场外炮击两边都读步骤上的 speechRate。
  const CountAt = (stage, speaking) => {
    const audio = FakeAudio({ zone: "trench" });
    const sound = new FirstLevelMissionBattleSound(audio, { battlefield: { GroundHeight: () => 0 } }, 0x19380926);
    Run(sound, audio, stage, 600, { speaking });
    return { n: sound.frontExchanges, shells: sound.artillery.shells };
  };
  const P2 = D.front.stages.BunkerRescue, A2 = D.artillery.stages.BunkerRescue;
  assert.ok(P2.speechRate > D.front.speechRate && A2.speechRate > D.artillery.speechRate, "02 的对白抽稀比全局轻");
  const oCalm = CountAt("BunkerRescue", false), oTalk = CountAt("BunkerRescue", true);
  assert.ok(oTalk.n >= oCalm.n * (P2.speechRate - 0.15),
    `开场对白期间前线只少起一点：${oCalm.n}→${oTalk.n} 场（speechRate ${P2.speechRate}）`);
  assert.ok(oTalk.shells >= oCalm.shells * (A2.speechRate - 0.2),
    `开场对白期间场外炮击只抽稀一点：${oCalm.shells}→${oTalk.shells} 发（speechRate ${A2.speechRate}）`);
  Ok(`开场按步骤覆盖对白抽稀：前线 ${oCalm.n}→${oTalk.n} 场、炮击 ${oCalm.shells}→${oTalk.shells} 发`);
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
  // 2026-09-27 起走远声组（bus "far"），不再归环境推子（默认 10 %）管。
  assert.ok(south.length > 5 && south.every((c) => ids.has(c.cue) && c.bus === "far"), "07：只剩旧的固定声源（走远声组）");
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
    // 【2026-09-26】01 落点下限 75→55 m 之后，75 m 以内那几发另有碎土雨（dirtRainAirCutHz，落在耳朵以下、
    // 朝爆点那一侧），与洞顶掉土分开数：洞顶那一条仍必须每次都在头顶上。
    const allDirt = a9.calls.filter((c) => c.cue === "debrisFall");
    const rain = allDirt.filter((c) => c.airCut === BATTLE_ARTILLERY.dirtRainAirCutHz);
    const dirt = allDirt.filter((c) => !rain.includes(c));
    assert.ok(dirt.length > 0 && dirt.every((c) => c.position.y > a9.listenerPos.y && c.airCut === BATTLE_ARTILLERY.dugoutDirtAirCutHz),
      `01：洞顶掉土 ${dirt.length} 次，都在头顶上`);
    assert.ok(rain.every((c) => c.position.y < a9.listenerPos.y), "01：碎土雨落在耳朵以下");
    assert.ok(s9.artillery.State().recent.every((e) => e.zone === "dugout"), "01 的每一发都按洞里算");
    Ok(`01 洞顶掉土 ${dirt.length} 次（接线层判 courtyard 也照掉），近处碎土雨 ${rain.length} 次`);
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
  // 显现之前（没有导演的夹具：进 01 后 stageS 秒）用 lull 的低通，之后按 open 滑到 open.airCut；每一声都还是隔着土的（不高于 open.airCut）。
  const AT = D.artillery.stages.Trapped, revealS = D.front.stages.Trapped.reveal.fallback.stageS;
  assert.ok(trappedShells.length > 0 && trappedShells.every((c) => c.airCut <= AT.open.airCut), "01 的近落弹全部隔着土");
  const lullShells = trappedShells.filter((c) => c.t < revealS - 1);
  assert.ok(lullShells.length > 0 && lullShells.every((c) => c.airCut <= AT.lull.airCut), `显现之前 ${lullShells.length} 发近落弹的低通不高于 ${AT.lull.airCut} Hz`);
  collapsed = true;
  const mark = a2.calls.length, t0 = a2.clock;
  Run(bs, a2, "Trapped", D.artillery.stages.Trapped.quietAfter.seconds - 0.5);
  const inQuiet = a2.calls.slice(mark).filter((c) => !c.soundField && /explosion/.test(c.cue) && c.t > t0 + 0.8);
  assert.equal(inQuiet.length, 0, "01 近爆之后的静默窗里不落场外炮弹");
  Ok(`01：近落弹 ${trappedShells.length} 发全部闷，近爆后 ${D.artillery.stages.Trapped.quietAfter.seconds} s 静默`);
  // 【2026-09-26】开场两步的炮击按整份预算进门（selfCapped，与前线同一个口径）；03 起不标，行为不变。
  const shellCues = /^(explosionMid|explosionFar|shellIncoming|debrisFall)$/;
  assert.ok(trappedShells.length > 0 && a2.calls.filter((c) => !c.soundField && shellCues.test(c.cue)).every((c) => c.selfCapped === true),
    "01 的场外炮击每一声都带 selfCapped");
  const a3s = FakeAudio({ zone: "trench" });
  const bs3 = new FirstLevelMissionBattleSound(a3s, { Has: () => false, battlefield: { GroundHeight: () => 0 } });
  Run(bs3, a3s, "Support", 120);
  const supportShells = a3s.calls.filter((c) => !c.soundField && shellCues.test(c.cue));
  assert.ok(supportShells.length > 0 && supportShells.every((c) => !c.selfCapped), "03 的场外炮击不带 selfCapped（不变）");
  Ok(`开场炮击按整份预算进门，03 不变（${supportShells.length} 声）`);
}

// ---------------------------------------------------------------------------
// 3) 防炮洞环境床
// ---------------------------------------------------------------------------
{
  const audio = FakeAudio({ zone: "open" });
  const sound = new FirstLevelMissionBattleSound(audio, null);
  // 【2026-09-26】开场两步（01/02）换成 dugout.presets 里那一对（远处战场床走远声组），03 起回到原来两档。
  const opening = D.dugout.presets;
  assert.ok(opening.Trapped && opening.BunkerRescue && !opening.RearTrench, "只有开场两步换预设");
  Run(sound, audio, "Trapped", 0.2);
  assert.equal(audio.ambiencePreset, opening.Trapped.preset, "01 一进来就是防炮洞环境（开场那一档）");
  assert.ok(audio.ambience[0].fadeS > 0, "切档带交叉淡");
  Run(sound, audio, "BunkerRescue", 0.5);
  assert.equal(audio.ambiencePreset, opening.BunkerRescue.preset, "02 出洞前不切（滞回）");
  Run(sound, audio, "BunkerRescue", D.dugout.holdS + 0.2);
  assert.equal(audio.ambiencePreset, opening.BunkerRescue.outside, "02 听者出了洞 → 前线环境（开场那一档）");
  // 开场两档：远处战场那两层（shellingFar / battleFar）走远声组、不随战场强度压低；其余层仍走环境总线。
  for (const name of [opening.Trapped.preset, opening.Trapped.outside]) {
    const cfg = OPENING_AMBIENCE_PRESETS[name];
    assert.ok(cfg, `${name} 在 OPENING_AMBIENCE_PRESETS 里`);
    const battle = cfg.layers.filter((l) => l.bed === "shellingFar" || l.bed === "battleFar");
    assert.ok(battle.length === 2 && battle.every((l) => l.bus === "far" && !l.battle && l.cut > 0),
      `${name}：远处战场两层走远声组、带低通、不带 battle`);
    assert.ok(cfg.layers.filter((l) => !battle.includes(l)).every((l) => !l.bus), `${name}：风仍走环境总线`);
    assert.ok(cfg.layers.length <= 3, `${name}：层数不比原档多`);
  }
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
