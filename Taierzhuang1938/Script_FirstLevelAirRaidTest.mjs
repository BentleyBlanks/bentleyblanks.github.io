// Script_FirstLevelAirRaidTest.mjs — 第一关 01–06 中远处日机轮番轰炸的纯 Node 门禁（2026-09-26）。
//
// 覆盖：起点（01 等到 FrontPass、02 以后进来就开始、07 以后不起新的一轮）、多轮次与间隔、
// 炸点在中远处（离听者 minM–maxM 的落区、每一颗都不贴脸）、炸弹落在机腹下方（航迹连续、落点对得上）、
// 声部（本层 ≤ maxVoices、与前线/炮击合计 ≤ sharedMaxVoices）、震屏一串合计封顶、避人避车、
// 03 横飞期间不起、对白期间推后、落区不压外圈土丘、销毁收干净。
// 浏览器侧（真模型、真爆炸、真声音）走 Script_FirstLevelAirRaidBrowserProbe 的实拍取证。
import assert from "node:assert/strict";
import { FIRST_LEVEL_AIR_RAID as R } from "./Data_FirstLevelAirRaid.mjs";
import { FirstLevelAirRaid } from "./Script_FirstLevelAirRaid.mjs";
import { FirstLevelMissionBattleSound } from "./Script_FirstLevelMissionBattleSound.mjs";
import { MISSION_BATTLE_SOUND as D } from "./Data_FirstLevelMissionBattleSound.mjs";
import { AIRCRAFT_ASSETS } from "./Data_AircraftAssets.mjs";
import { P012_HORIZON_BLOCKS } from "./Data_FirstLevelP012Horizon.mjs";
import { CameraShake } from "./Script_CameraShake.mjs";

let passed = 0;
function Ok(name) { passed += 1; console.log(`ok  ${name}`); }

function FakeAudio({ listener = { x: 20, y: 1.6, z: -150 }, life = 2.0, zone = "open" } = {}) {
  const a = {
    listenerPos: listener, battleIntensity: 0, pendingVoices: new Set(), ambiencePreset: "smokyDay",
    clock: 0, calls: [], moves: 0, stops: 0, zone, timers: [],
    Play(cue, o = {}) {
      const v = { cue }; a.calls.push({ t: a.clock, cue, ...o }); a.pendingVoices.add(v);
      if (cue !== "planeDrone") a.timers.push([a.clock + life, v]);
      return v;
    },
    MoveVoice() { a.moves += 1; return true; },
    StopVoice(v) { a.stops += 1; a.pendingVoices.delete(v); return true; },
    Ambience() {}, ListenerZone() { return a.zone; },
    Tick(dt) { a.clock += dt; a.timers = a.timers.filter(([at, v]) => (at <= a.clock ? (a.pendingVoices.delete(v), false) : true)); },
  };
  return a;
}

/** 一个只看空袭的宿主：记下编队、炸弹、画面、震屏。 */
function RaidHost(audio, extra = {}) {
  const log = { formation: [], bombs: [], visuals: [], removed: [], shakes: [] };
  const host = {
    audio, Ground: () => 0,
    Visual: (at, radius, d, column) => { log.visuals.push({ ...at, radius, d, column, t: audio.clock }); return column ? log.visuals.length : null; },
    RemoveVisual: (h) => log.removed.push(h),
    Shake: (trauma) => log.shakes.push({ t: audio.clock, trauma }),
    Formation: (poses) => log.formation.push({ t: audio.clock, poses: poses.map((p) => ({ ...p })) }),
    Bombs: (list) => log.bombs.push({ t: audio.clock, list: list.map((b) => ({ ...b })) }),
    ...extra,
  };
  return { host, log };
}
function Run(raid, audio, stage, seconds, ctx = {}, dt = 1 / 30) {
  for (let t = 0; t < seconds; t += dt) { audio.Tick(dt); raid.Update(dt, stage, { started: true, ...ctx }); }
}

// ---------------------------------------------------------------------------
// 0) 数据：机型都在资产表里、落区都在外圈地面上且不压土丘、离 01–06 活动范围是中远处
// ---------------------------------------------------------------------------
{
  for (const [key, F] of Object.entries(R.formations)) {
    assert.ok(AIRCRAFT_ASSETS.some((a) => a.id === F.aircraft), `${key} 的机型 ${F.aircraft} 在 Data_AircraftAssets 里`);
    assert.ok(F.slots.length >= 2 && F.bombs >= 3, `${key} 至少两架、每架一串`);
  }
  assert.ok(R.order.every((k) => R.formations[k]), "轮换顺序里的编队都有定义");
  const hills = P012_HORIZON_BLOCKS.filter((b) => /Base$/.test(b.id));
  assert.ok(hills.length >= 10, "外圈土丘体块读到了");
  for (const z of R.zones) {
    for (const h of hills) {
      const overlap = z.xMin < h.x + h.w / 2 && z.xMax > h.x - h.w / 2 && z.zMin < h.z + h.d / 2 && z.zMax > h.z - h.d / 2;
      assert.ok(!overlap, `落区 ${z.id} 不压土丘 ${h.id}`);
    }
    // 01–06 玩家活动范围的四角与中心：落区中心离它们都是中远处。
    const cx = (z.xMin + z.xMax) / 2, cz = (z.zMin + z.zMax) / 2;
    for (const p of [{ x: -40, z: -220 }, { x: 70, z: -220 }, { x: -40, z: -30 }, { x: 70, z: -30 }, { x: 15, z: -125 }]) {
      const d = Math.hypot(cx - p.x, cz - p.z);
      assert.ok(d >= 120 && d <= 520, `落区 ${z.id} 中心离 (${p.x}, ${p.z}) ${d.toFixed(0)} m：中远处`);
    }
    const n = Math.hypot(z.from.x, z.from.z);
    assert.ok(z.from.z < 0 && n > 0.5, `落区 ${z.id} 的日机从北面（日军一侧）来`);
  }
  Ok(`数据：${Object.keys(R.formations).length} 种编队、${R.zones.length} 块落区，不压外圈 ${hills.length} 座土丘`);
}

// ---------------------------------------------------------------------------
// 1) 起点：01 没走到 FrontPass 不起；走到了 firstAfterS 内起第一轮
// ---------------------------------------------------------------------------
{
  const audio = FakeAudio();
  const { host } = RaidHost(audio);
  const raid = new FirstLevelAirRaid(host, 11);
  for (let t = 0; t < 60; t += 1 / 30) { audio.Tick(1 / 30); raid.Update(1 / 30, "Trapped", { started: false }); }
  assert.equal(raid.waves, 0, "01 先头兵没经过洞口之前，一轮都没有");
  let firstAt = null;
  for (let t = 0; t < 20; t += 1 / 30) {
    audio.Tick(1 / 30); raid.Update(1 / 30, "Trapped", { started: true });
    if (raid.waves && firstAt === null) firstAt = t;
  }
  assert.ok(firstAt !== null && firstAt <= R.firstAfterS + 0.1, `FrontPass 之后 ${firstAt?.toFixed(2)} s 起第一轮（≤ ${R.firstAfterS} s）`);
  const drone = audio.calls.find((c) => c.cue === R.audio.droneCue);
  assert.ok(drone && drone.airCut === R.stages.Trapped.airCut, "01 洞里：引擎声一起就是闷的");
  Ok(`起点：FrontPass 前 0 轮，之后 ${firstAt.toFixed(2)} s 进场`);
}

// ---------------------------------------------------------------------------
// 2) 十二分钟 04：多轮次、间隔、中远处、落在机腹下方、声部、震屏封顶
// ---------------------------------------------------------------------------
{
  const audio = FakeAudio({ zone: "trench" });
  const cam = new CameraShake();
  const { host, log } = RaidHost(audio, { Shake: (trauma) => { cam.AddTrauma(trauma); log.shakes.push({ t: audio.clock, trauma }); } });
  const raid = new FirstLevelAirRaid(host, 0x1938);
  let peakBusy = 0, peakTrauma = 0;
  const waveLog = [];
  let wasActive = false;
  for (let t = 0; t < 720; t += 1 / 30) {
    audio.Tick(1 / 30); raid.Update(1 / 30, "MachineGun", { started: true }); cam.Update(1 / 30);
    peakBusy = Math.max(peakBusy, raid.Active()); peakTrauma = Math.max(peakTrauma, cam.trauma);
    if (!!raid.wave !== wasActive) { waveLog.push({ t: audio.clock, on: !!raid.wave }); wasActive = !!raid.wave; }
  }
  const L = audio.listenerPos;
  assert.ok(raid.waves >= 9 && raid.waves <= 14, `十二分钟 ${raid.waves} 轮（多轮次，不是连成一片）`);
  // 同一时刻只有一轮在天上；两轮之间隔 gapS。
  for (let i = 1; i + 1 < waveLog.length; i += 2) {
    const gap = waveLog[i + 1].t - waveLog[i].t;
    assert.ok(gap >= R.gapS[0] - 0.05 && gap <= R.gapS[1] + 0.05, `第 ${(i + 1) / 2} 轮离场到下一轮进场 ${gap.toFixed(1)} s`);
  }
  // 每一轮的落区中心在 minM–maxM；每一颗离听者不少于 minM − 一串的半长。
  for (const e of raid.events) assert.ok(e.d >= R.minM && e.d <= R.maxM, `落区中心 ${e.d} m`);
  const dists = log.visuals.map((v) => Math.hypot(v.x - L.x, v.z - L.z));
  assert.ok(Math.min(...dists) >= R.minM - 110, `最近的一颗 ${Math.min(...dists).toFixed(0)} m（中远处，不贴脸）`);
  assert.equal(log.visuals.length, raid.bombsDropped, "离机的每一颗都落了地");
  // 编队：一轮 2–3 架；飞在规定高度；机头就是航向。
  const shown = log.formation.filter((f) => f.poses.length);
  assert.ok(shown.length > 0 && shown.every((f) => f.poses.length >= 2 && f.poses.length <= 3), "编队 2–3 架");
  const alts = new Set(Object.values(R.formations).map((F) => F.altitudeM));
  assert.ok(shown.every((f) => [...alts].some((a) => Math.abs(f.poses[0].y - a) < 1)), "长机在编队高度平飞");
  // 声部。
  assert.ok(peakBusy <= R.audio.maxVoices, `本层同时 ${peakBusy} 条 ≤ ${R.audio.maxVoices}`);
  const booms = audio.calls.filter((c) => c.cue === R.audio.cue && !c.delay);
  assert.ok(booms.length >= raid.waves * 2 && booms.every((c) => c.soundField && c.bus === "sfx" && c.selfCapped),
    `爆炸 ${booms.length} 声（每轮至少两声），全走 soundField / sfx / selfCapped`);
  assert.ok(audio.stops >= raid.waves - 1, "每一轮离场都收掉引擎声");
  // 震屏：每一串合计封顶，远处的炸弹不会震得像在脚下。
  assert.ok(log.shakes.length > 0 && peakTrauma <= R.shake.windowMax + R.shake.traumaNear + 1e-6,
    `创伤峰值 ${peakTrauma.toFixed(3)}（一串合计 ≤ ${R.shake.windowMax}）`);
  for (const s of log.shakes) {
    const win = log.shakes.filter((o) => o.t <= s.t && s.t - o.t < R.shake.windowS - 1e-6).reduce((n, o) => n + o.trauma, 0);
    assert.ok(win <= R.shake.windowMax + 1e-6, `${R.shake.windowS} s 窗口里 ${win.toFixed(3)} ≤ ${R.shake.windowMax}`);
  }
  // 震屏跟声音到：第一记晚于第一颗落地 minM/340 以上。
  const firstImpact = log.visuals[0].t, firstShake = log.shakes[0].t;
  assert.ok(firstShake - firstImpact >= R.minM / 340 - 0.6, `先见后震：落地 ${firstImpact.toFixed(2)} → 震 ${firstShake.toFixed(2)}`);
  // 土柱：每 columnEvery 颗一根（每架那一串的头一颗一定有），到点撤源。
  const columns = log.visuals.filter((v) => v.column).length;
  assert.ok(columns >= log.visuals.length / R.impact.columnEvery - raid.waves * 3 && columns < log.visuals.length,
    `土柱 ${columns} 根 / ${log.visuals.length} 颗`);
  assert.ok(log.removed.length >= columns - 12, `土柱撤源 ${log.removed.length}/${columns}`);
  raid.Dispose();
  assert.equal(log.removed.length, columns, "销毁时土柱全撤");
  assert.equal(log.formation.at(-1).poses.length, 0, "销毁时编队收起");
  assert.equal(log.bombs.at(-1).list.length, 0, "销毁时炸弹收起");
  Ok(`十二分钟：${raid.waves} 轮、${raid.bombsDropped} 颗、爆炸 ${booms.length} 声，最近 ${Math.min(...dists).toFixed(0)} m，`
    + `声部峰值 ${peakBusy}，创伤峰值 ${peakTrauma.toFixed(2)}`);
}

// ---------------------------------------------------------------------------
// 3) 炸弹：从机腹离开、自由落体、落在对得上的那一点
// ---------------------------------------------------------------------------
{
  const audio = FakeAudio();
  const { host } = RaidHost(audio);
  const raid = new FirstLevelAirRaid(host, 7);
  raid.Update(0, "Support", { started: true });
  raid.time = raid.nextAt; raid.Update(0, "Support", { started: true });
  const plan = raid.wave;
  assert.ok(plan, "起了一轮");
  for (const b of plan.bombs) {
    const plane = raid.PlanePoint(plan, b.plane, b.tRelease);
    assert.ok(Math.hypot(plane.x - b.from.x, plane.y - b.from.y, plane.z - b.from.z) < 1e-6, "离机那一刻在机腹下");
    const end = raid.BombPose(plan, b, b.tImpact);
    assert.ok(Math.hypot(end.x - b.at.x, end.y - b.at.y, end.z - b.at.z) < 1e-6, "落地那一刻就在炸点");
    let lastY = Infinity, lastPitch = -1;
    for (let u = 0; u <= 1; u += 0.1) {
      const p = raid.BombPose(plan, b, b.tRelease + u * b.fallS);
      assert.ok(p.y <= lastY + 1e-9 && p.pitch >= lastPitch - 1e-9, "越落越低、越落越竖");
      lastY = p.y; lastPitch = p.pitch;
    }
    const under = raid.PlanePoint(plan, b.plane, b.tImpact);
    const behind = (under.x - b.at.x) * plan.dir.x + (under.z - b.at.z) * plan.dir.z;
    assert.ok(Math.abs(behind - R.bomb.trailM) <= R.bomb.jitterM * 1.5 + 1e-6, `落点落后机身 ${behind.toFixed(1)} m（空气阻力）`);
    assert.ok(Math.abs(b.fallS - Math.sqrt(2 * (b.from.y - b.at.y) / R.bomb.gravity)) < 1e-6, "下落时间 = √(2h/g)");
  }
  Ok(`炸弹：${plan.bombs.length} 颗航迹连续，落点在机腹下方后 ${R.bomb.trailM} m`);
}

// ---------------------------------------------------------------------------
// 4) 避人避车、03 横飞期间不起、对白推后、07 以后不起、已在天上的那一轮飞完
// ---------------------------------------------------------------------------
{
  // 每一块落区里都站一个人：挑不到就推后，挑得到的炸点离人都在 bombClearM 以外。
  const soldiers = R.zones.map((z) => ({ x: (z.xMin + z.xMax) / 2, z: (z.zMin + z.zMax) / 2 }));
  const audio = FakeAudio();
  const { host, log } = RaidHost(audio, {
    Blocked: (at, clearM) => soldiers.some((s) => Math.hypot(s.x - at.x, s.z - at.z) < clearM),
  });
  const raid = new FirstLevelAirRaid(host, 99);
  Run(raid, audio, "Tank", 400);
  assert.ok(raid.waves > 0, "有人站着也还挑得到落点");
  const close = log.visuals.filter((v) => soldiers.some((s) => Math.hypot(s.x - v.x, s.z - v.z) < R.bombClearM));
  assert.equal(close.length, 0, `${log.visuals.length} 颗没有一颗落在人 ${R.bombClearM} m 内`);
  Ok(`避人：${log.visuals.length} 颗全在 ${R.bombClearM} m 以外`);
}
{
  const audio = FakeAudio();
  const { host } = RaidHost(audio);
  const raid = new FirstLevelAirRaid(host, 5);
  Run(raid, audio, "Support", 30, { scripted: true });
  assert.equal(raid.waves, 0, "03 进来 holdS 内、横飞期间不起");
  Run(raid, audio, "Support", R.stages.Support.holdS + 2 - 30, { scripted: true });
  assert.equal(raid.waves, 0, "横飞还在天上：不起");
  Run(raid, audio, "Support", 2, { scripted: false });
  assert.equal(raid.waves, 1, "横飞走完就起");
  Ok(`03：holdS ${R.stages.Support.holdS} s 与横飞期间不起新的一轮`);
}
{
  const audio = FakeAudio();
  const { host } = RaidHost(audio);
  const raid = new FirstLevelAirRaid(host, 6);
  Run(raid, audio, "MachineGun", R.firstAfterS + R.speechDeferS - 1, { speaking: true });
  assert.equal(raid.waves, 0, "正在说话：往后推");
  Run(raid, audio, "MachineGun", 2.5, { speaking: true });
  assert.equal(raid.waves, 1, `推满 ${R.speechDeferS} s 就不再等`);
  Ok(`对白：最多推后 ${R.speechDeferS} s`);
}
{
  const audio = FakeAudio();
  const { host, log } = RaidHost(audio);
  const raid = new FirstLevelAirRaid(host, 8);
  Run(raid, audio, "Orders", R.firstAfterS + 1);
  assert.equal(raid.waves, 1, "06 起了一轮");
  Run(raid, audio, "South", 300);
  assert.equal(raid.waves, 1, "07 以后不起新的一轮");
  assert.equal(raid.wave, null, "天上那一轮照常飞完");
  assert.equal(log.visuals.length, raid.bombsDropped, "那一轮的炸弹都落了地");
  Ok("07 以后：不起新的一轮，已在天上的飞完");
}

// ---------------------------------------------------------------------------
// 5) 挂进前线声景：01 等导演走到 FrontPass；与前线、炮击合计 ≤ sharedMaxVoices
// ---------------------------------------------------------------------------
{
  const audio = FakeAudio({ zone: "trench" });
  const beats = new Set();
  const formations = [];
  const aircraft = { manualPoses: new Map(), SetFormation: (k, p) => formations.push(p.length), SetBombs() {} };
  const vfx = { Explosion() {}, SmokeSource: () => 1, RemoveSmokeSource() {} };
  const sound = new FirstLevelMissionBattleSound(audio, { frontShow: { bunker: { beats } }, aircraft, vfx,
    battlefield: { GroundHeight: () => 0 }, Has: () => true }, 3);
  for (let t = 0; t < 40; t += 1 / 30) { audio.Tick(1 / 30); sound.Update(1 / 30, "Trapped", false); }
  assert.equal(sound.airRaid.waves, 0, "01：导演还没走到 FrontPass，不起");
  beats.add("FrontPass");
  for (let t = 0; t < 10; t += 1 / 30) { audio.Tick(1 / 30); sound.Update(1 / 30, "Trapped", false); }
  assert.equal(sound.airRaid.waves, 1, "FrontPass 一到就进场");
  assert.ok(formations.some((n) => n >= 2), "编队交给了 aircraft.SetFormation");
  let peak = 0;
  for (const stage of ["BunkerRescue", "RearTrench", "Support", "MachineGun", "Tank", "Orders"]) {
    for (let t = 0; t < 150; t += 1 / 30) {
      audio.Tick(1 / 30); sound.Update(1 / 30, stage, false);
      // 真在响的：前线 + 炮击 + 空袭（空袭的落弹留位只是账面，不是声部）。
      peak = Math.max(peak, sound.frontVoices.length + sound.artillery.voices.length + sound.airRaid.Active());
    }
  }
  assert.ok(peak <= D.front.sharedMaxVoices, `前线 + 炮击 + 空袭合计峰值 ${peak} ≤ ${D.front.sharedMaxVoices}`);
  assert.ok(sound.airRaid.waves >= 10, `01–06 连着走下来 ${sound.airRaid.waves} 轮`);
  // 与前线床同台时，一串落地也要响成一片：落弹留位让前线让出，每轮至少三声（低频层 + 爆炸）。
  const perWave = sound.airRaid.sounds / sound.airRaid.waves;
  assert.ok(perWave >= 3, `与前线同台每轮 ${perWave.toFixed(1)} 声（落弹留位生效）`);
  const st = sound.State();
  assert.ok(st.airRaid && st.airRaid.waves === sound.airRaid.waves, "State() 带空袭取证");
  sound.Dispose();
  assert.equal(formations.at(-1), 0, "销毁时编队收起");
  Ok(`接进前线声景：FrontPass 起、01–06 共 ${sound.airRaid.waves} 轮、每轮 ${perWave.toFixed(1)} 声，合计声部峰值 ${peak}`);
}

console.log(`FirstLevelAirRaidTest：${passed} 组通过`);
