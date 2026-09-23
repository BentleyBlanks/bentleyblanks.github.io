// Script_FirstLevelBattleSoundTest.mjs — 第一关 01–05 声景的纯 Node 门禁（2026-09-23）。
//
// 覆盖：远处交火生成器（01 立刻开始、两边来回、300 m 以外、声部上限、让位、对白少起、
// 07 以后回到旧声源）、场外近落弹（落点、避人、先见后闻、震屏跟声音、沟里落土、近爆后静默、
// 洞里闷）、防炮洞环境床切换（强制 / 按空间档带滞回）、接线层的壕沟/洞室判据与压制喘息心跳、
// 耳鸣两档数据、01–05 配乐让位与标点。
// 浏览器侧（真 AudioContext、混响六档、耳鸣节点）在 Script_AudioTest / Script_AudioWiringTest。
import assert from "node:assert/strict";
import { MISSION_BATTLE_SOUND as D } from "./Data_FirstLevelMissionBattleSound.mjs";
import { FirstLevelMissionBattleSound } from "./Script_FirstLevelMissionBattleSound.mjs";
import { BattleArtillery } from "./Script_BattleArtillery.mjs";
import { AudioWiring } from "./Script_AudioWiring.mjs";
import { TINNITUS, BATTLE_ARTILLERY, SUPPRESSION_BODY, TRENCH_ZONE } from "./Data_Tuning_Audio.mjs";
import { FirstLevelMusicState, FIRST_LEVEL_MUSIC_COMBAT } from "./Data_FirstLevelMissionMusic.mjs";
import { FirstLevelMissionMusic } from "./Script_FirstLevelMissionMusic.mjs";

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
  const before = audio.calls.length;
  Run(sound, audio, "South", 60);
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
    Shake: (d, r) => shakes.push({ t: audio.clock, d, r }),
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
  assert.ok(audio.calls.filter((c) => c.cue === "debrisFall").length >= visuals.length, "沟里：每一发之后耳边沟壁落土");
  assert.ok(audio.calls.some((c) => c.cue === "shellIncoming"), "有一部分炮弹先听到啸声");
  Ok(`近落弹 ${art.shells} 发：落点、避人、先见后闻、低频层、沟壁落土、啸声`);

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
    Raycast: () => roof,
    NearbyColliders: () => [],
  };
  const w = new AudioWiring({ battlefield: bf, audio: null, player: null });
  const Z = (x, y, z) => { w.zoneCache.clear(); return w.Zone({ x, y, z }); };
  assert.equal(Z(0, -2 + 1.6, 0), "trench", "站在沟中线上 → trench");
  assert.equal(Z(0, -2 + 1.6, 1.4), "trench", "贴着一侧沟壁 → trench");
  assert.equal(Z(0, 1.6, 6), "open", "沟外平地 → open");
  assert.equal(Z(0, -2 + 60, 0), "open", "沟上空的飞机 → 不算沟里");
  // 洞：盖子低、宽，人陷在地下 → dugout；同一块盖子放在平地上的房子里 → interior。
  roof = { t: 0.5, box: { tag: "whiteboxWall", min: [-2, -0.2, -2], max: [2, 0.1, 2] } };
  assert.equal(Z(0, -2 + 0.9, 0), "dugout", "沟里低矮的顶 → dugout");
  roof = { t: 2.4, box: { tag: "roof", min: [-4, 3.5, -4], max: [4, 3.9, 4] } };
  const flat = new AudioWiring({ battlefield: { ...bf, GroundHeight: () => 0 }, audio: null, player: null });
  flat.zoneCache.clear();
  assert.equal(flat.Zone({ x: 0, y: 1.0, z: 0 }), "interior", "平地上的屋顶 → interior（没被抢成 dugout）");
  roof = { t: 3, box: { tag: "dugoutRoof", min: [-1, 2, -1], max: [1, 2.3, 1] } };
  assert.equal(Z(0, -1, 30), "dugout", "布设标了 dugoutRoof → 直接 dugout");
  roof = null;
  const sink = w.TrenchSink({ x: 0, y: -0.4, z: 0 });
  assert.ok(sink.rise >= TRENCH_ZONE.minRiseM && sink.sunkDirs >= 4, `沟中线：两侧高出 ${sink.rise.toFixed(2)} m，${sink.sunkDirs} 个方向高`);
  Ok(`壕沟/洞室判据：沟中线高出 ${sink.rise.toFixed(2)} m → trench，低顶 → dugout，平地屋顶仍是 interior`);
}
{
  const plays = [];
  const audio = { Play: (cue, o) => { plays.push({ t: clock, cue, ...o }); return { cue }; }, StopVoice() {}, SetBattleIntensity() {} };
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
  Ok(`配乐：静 ${base} / 激战 ${hot} / 标点 ${sting}`);
}

console.log(`FirstLevelBattleSoundTest：${passed} 组通过`);
