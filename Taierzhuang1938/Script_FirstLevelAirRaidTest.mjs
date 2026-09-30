// Script_FirstLevelAirRaidTest.mjs — 第一关 01–06 中远处日机轮番轰炸的纯 Node 门禁（2026-09-26；09-28 物理化）。
//
// 覆盖：起点（01 等到 FrontPass、02 以后进来就开始、07 以后不起新的一轮）、多轮次与间隔、
// 炸点在中远处（落区中心离听者 minM–maxM、每一颗离听者不少于弹型的 minListenerM）、
// 外弹道（带飞机速度离机、二次阻力积分：比真空多落一点时间、落在机身后十几二十米、越落越竖）、
// 投弹解算（长机那一串的中点落在瞄准点上、僚机晚一点投）、离场协调转弯与投弹后上浮、
// 声部（本层 ≤ maxVoices、与前线/炮击合计 ≤ sharedMaxVoices）、震屏（比例距离、地震波先到、一串合计封顶）、
// 避人避车（按弹型的 clearM）、03 横飞期间不起、对白期间推后、落区不压外圈土丘、销毁收干净。
// 弹道与落地尺度的单元测试在 Script_BombBallisticsTest；浏览器侧（真模型、真爆炸、真声音）走
// Script_FirstLevelAirRaidBrowserProbe 的实拍取证。
import assert from "node:assert/strict";
import { FIRST_LEVEL_AIR_RAID as R } from "./Data_FirstLevelAirRaid.mjs";
import { AERIAL_BOMBS, BOMB_PHYSICS } from "./Data_AerialBombs.mjs";
import { FirstLevelAirRaid } from "./Script_FirstLevelAirRaid.mjs";
import { FirstLevelMissionBattleSound } from "./Script_FirstLevelMissionBattleSound.mjs";
import { MISSION_BATTLE_SOUND as D } from "./Data_FirstLevelMissionBattleSound.mjs";
import { AIRCRAFT_ASSETS } from "./Data_AircraftAssets.mjs";
import { P012_HORIZON_BLOCKS } from "./Data_FirstLevelP012Horizon.mjs";
import { CameraShake } from "./Script_CameraShake.mjs";
import { DragK, DropTrajectory, TrajectoryAt } from "./Script_BombBallistics.mjs";

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
    Visual: (at, blast, d, column) => { log.visuals.push({ ...at, ...blast, d, column, t: audio.clock }); return column ? log.visuals.length : null; },
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
/** 立刻起一轮（跳过等待），返回这一轮的排程。 */
function WaveNow(raid, stage = "Support") {
  raid.Update(0, stage, { started: true });
  for (let i = 0; i < 20 && !raid.wave; i += 1) { raid.time = raid.nextAt; raid.Update(0, stage, { started: true }); }
  return raid.wave;
}

// ---------------------------------------------------------------------------
// 0) 数据：机型与弹型都在表里、落区都在外圈地面上且不压土丘、离 01–06 活动范围是中远处
// ---------------------------------------------------------------------------
{
  for (const [key, F] of Object.entries(R.formations)) {
    assert.ok(AIRCRAFT_ASSETS.some((a) => a.id === F.aircraft), `${key} 的机型 ${F.aircraft} 在 Data_AircraftAssets 里`);
    assert.ok(AERIAL_BOMBS[F.load.bomb], `${key} 的弹型 ${F.load.bomb} 在 Data_AerialBombs 里`);
    assert.ok(F.slots.length >= 2 && F.load.count >= 3, `${key} 至少两架、每架一串`);
    assert.ok(F.bankDeg > 0 && F.bankDeg <= 35, `${key} 离场坡度 ${F.bankDeg}° 是编队协调转弯的量级`);
  }
  assert.ok(Object.values(R.formations).some((F) => F.slots.length >= 9), "有九机中队");
  assert.ok(Object.values(R.formations).some((F) => AERIAL_BOMBS[F.load.bomb].chargeKg >= 80), "有重磅弹");
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
// 2) 十二分钟 04：多轮次、间隔、中远处、中队规模、声部、震屏封顶
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
  // 落区中心在 minM–maxM；每一颗离听者不少于它那一种弹的 minListenerM。
  for (const e of raid.events) assert.ok(e.d >= R.minM && e.d <= R.maxM, `落区中心 ${e.d} m`);
  for (const v of log.visuals) {
    const dl = Math.hypot(v.x - L.x, v.z - L.z);
    assert.ok(dl >= AERIAL_BOMBS[v.bomb].minListenerM - 1e-6, `${v.bomb} 离听者 ${dl.toFixed(0)} m ≥ ${AERIAL_BOMBS[v.bomb].minListenerM}`);
  }
  const dists = log.visuals.map((v) => Math.hypot(v.x - L.x, v.z - L.z));
  assert.equal(log.visuals.length, raid.bombsDropped, "离机的每一颗都落了地");
  // 编队：2–9 架，中队（6、9 架）都飞过；进场平飞在编队高度，投完弹上浮不超过 balloonM。
  const shown = log.formation.filter((f) => f.poses.length);
  const sizes = new Set(shown.map((f) => f.poses.length));
  assert.ok([...sizes].every((n) => n >= 2 && n <= 9) && sizes.has(9) && sizes.has(6), `编队规模 ${[...sizes].join("/")}`);
  const alts = Object.values(R.formations).map((F) => [F.altitudeM, F.balloonM]);
  assert.ok(shown.every((f) => alts.some(([a, b]) => f.poses[0].y >= a - 1e-6 && f.poses[0].y <= a + b + 1e-6)), "长机在编队高度（投弹后最多上浮 balloonM）");
  // 画面：一轮落得多就摊薄（budget < 1），弹型装药原样交给画面层。
  assert.ok(log.visuals.every((v) => v.budget > 0 && v.budget <= 1 && v.chargeKg === AERIAL_BOMBS[v.bomb].chargeKg), "画面拿到装药与摊薄系数");
  assert.ok(log.visuals.some((v) => v.bomb === "Bomb250kg" && v.radius > 20), "250 kg 级的画面半径过 20 m（立方根缩放）");
  // 声部。
  assert.ok(peakBusy <= R.audio.maxVoices, `本层同时 ${peakBusy} 条 ≤ ${R.audio.maxVoices}`);
  const booms = audio.calls.filter((c) => c.cue === R.audio.cue && !c.delay);
  assert.ok(booms.length >= raid.waves * 2 && booms.every((c) => c.soundField && c.bus === "sfx" && c.selfCapped),
    `爆炸 ${booms.length} 声（每轮至少两声），全走 soundField / sfx / selfCapped`);
  assert.ok(Math.max(...booms.map((c) => c.volume)) <= R.audio.volume * R.audio.volumeMaxGain + 1e-6, "重磅弹的音量加厚有封顶");
  assert.ok(audio.stops >= raid.waves - 1, "每一轮离场都收掉引擎声");
  // 震屏：每一串合计封顶，远处的炸弹不会震得像在脚下。
  assert.ok(log.shakes.length > 0 && peakTrauma <= R.shake.windowMax + R.shake.traumaNear + 1e-6,
    `创伤峰值 ${peakTrauma.toFixed(3)}（一串合计 ≤ ${R.shake.windowMax}）`);
  for (const s of log.shakes) {
    const win = log.shakes.filter((o) => o.t <= s.t && s.t - o.t < R.shake.windowS - 1e-6).reduce((n, o) => n + o.trauma, 0);
    assert.ok(win <= R.shake.windowMax + 1e-6, `${R.shake.windowS} s 窗口里 ${win.toFixed(3)} ≤ ${R.shake.windowMax}`);
  }
  // 震屏在落地之后：最早的一记是地震波（d / groundWaveMps），不会早于它。
  const firstImpact = log.visuals[0].t, firstShake = log.shakes[0].t;
  assert.ok(firstShake - firstImpact >= Math.min(...dists) / BOMB_PHYSICS.groundWaveMps - 0.05,
    `先见后震：落地 ${firstImpact.toFixed(2)} → 震 ${firstShake.toFixed(2)}`);
  // 常驻土柱：每架那一串的头一颗给一根，一轮不超过 maxColumns；到点撤源。
  const perWave = new Map();
  for (const v of log.visuals.filter((x) => x.column)) perWave.set(Math.round(v.t / 30), (perWave.get(Math.round(v.t / 30)) || 0) + 1);
  const columns = log.visuals.filter((v) => v.column).length;
  assert.ok(columns >= raid.waves * 2 && columns <= raid.waves * R.impact.maxColumns, `土柱 ${columns} 根 / ${raid.waves} 轮`);
  assert.ok(log.removed.length >= columns - R.impact.maxColumns, `土柱撤源 ${log.removed.length}/${columns}`);
  raid.Dispose();
  assert.equal(log.removed.length, columns, "销毁时土柱全撤");
  assert.equal(log.formation.at(-1).poses.length, 0, "销毁时编队收起");
  assert.equal(log.bombs.at(-1).list.length, 0, "销毁时炸弹收起");
  Ok(`十二分钟：${raid.waves} 轮、${raid.bombsDropped} 颗、爆炸 ${booms.length} 声，最近 ${Math.min(...dists).toFixed(0)} m，`
    + `编队 ${[...sizes].sort((a, b) => a - b).join("/")} 架，声部峰值 ${peakBusy}，创伤峰值 ${peakTrauma.toFixed(2)}`);
}

// ---------------------------------------------------------------------------
// 2b) 下落啸声：长机头一颗 + 离听者最近的一颗；终点对齐这颗的爆炸声到耳朵的时刻；那一颗的爆炸一定出声
// ---------------------------------------------------------------------------
{
  const W = R.audio.whistle;
  const dt = 1 / 30;
  let checked = 0, total = 0;
  for (const key of ["lightVic", "heavySquadron", "lightSquadron"]) {
    const audio = FakeAudio({ zone: "trench" });
    const { host } = RaidHost(audio);
    const raid = new FirstLevelAirRaid(host, 0x51ed);
    raid.waveIndex = R.order.indexOf(key);
    const wave = WaveNow(raid, "MachineGun");
    assert.equal(wave.key, key);
    const L = audio.listenerPos;
    const picked = wave.bombs.filter((b) => b.whistleAt != null);
    assert.ok(picked.length >= 1 && picked.length <= W.perWave, `${key}：${picked.length} 颗有啸声（≤ ${W.perWave}）`);
    assert.ok(picked.some((b) => b.lead), `${key}：长机头一颗有啸声`);
    const flat = (b) => Math.hypot(b.at.x - L.x, b.at.z - L.z);
    // 另一颗：与长机那颗落地隔得开的弹里离听者最近的。
    const lead = wave.bombs.find((b) => b.lead);
    const eligible = wave.bombs.filter((b) => !b.lead && Math.abs(b.tImpact - lead.tImpact) >= W.gapS);
    const other = picked.find((b) => !b.lead);
    if (eligible.length) assert.ok(other && flat(other) <= Math.min(...eligible.map(flat)) + 1e-6, `${key}：另一颗是离听者最近的（${other && flat(other).toFixed(0)} m）`);
    for (let i = 1; i < picked.length; i += 1) {
      assert.ok(Math.abs(picked[i].tImpact - picked[0].tImpact) >= W.gapS - 1e-6, `${key}：两声落地隔 ≥ ${W.gapS} s`);
    }
    const t0 = audio.clock;
    while (raid.wave) { audio.Tick(dt); raid.Update(dt, "MachineGun", { started: true }); }
    const calls = audio.calls.filter((c) => c.cue === W.cue);
    assert.equal(calls.length, picked.length, `${key}：啸声 ${calls.length} 条`);
    for (const b of picked) {
      const d = Math.hypot(b.at.x - L.x, b.at.y - L.y, b.at.z - L.z);
      const arrive = Math.min(d / BOMB_PHYSICS.soundMps, 1.4);
      const c = calls.find((x) => Math.abs(x.pitch - b.whistlePitch) < 1e-9);
      assert.ok(c, `${key}：这颗的啸声起了`);
      const start = c.t - t0;
      assert.ok(start >= b.whistleAt - 1e-6 && start < b.whistleAt + dt + 1e-6, `${key}：落地前 ${(b.tImpact - start).toFixed(2)} s 起播`);
      // 终点（变调后的剩余长度）落在这颗落地的那一帧上；两者都延迟同一个 d/340。
      const end = start + (W.durS - c.offset) / c.pitch;
      assert.ok(Math.abs(end - b.tImpact) < 1e-6, `${key}：啸声终点 ${end.toFixed(3)} = 落地 ${b.tImpact.toFixed(3)}`);
      assert.ok(Math.abs(c.delay - arrive) < 1e-9 && c.propagate === false, `${key}：按落点距离延迟 ${arrive.toFixed(2)} s`);
      const pd = Math.hypot(c.position.x - L.x, c.position.z - L.z);
      assert.ok(pd < flat(b) * (W.share + 0.01) && c.position.y > b.at.y + W.heightM - 1e-6, `${key}：摆在头顶这一侧（${pd.toFixed(0)} m）`);
      assert.ok(c.selfCapped && c.bus === "sfx" && c.sourceSizeM === W.sizeM, `${key}：走 sfx / selfCapped / 声源尺寸`);
      // 啸声硬停之后一定有爆炸：落地那一帧给了本体，而且走 priority。
      const boom = audio.calls.find((x) => x.cue === R.audio.cue && !x.delay && Math.abs(x.position.x - b.at.x) < 1e-6 && Math.abs(x.position.z - b.at.z) < 1e-6);
      assert.ok(boom && boom.priority, `${key}：有啸声的那一颗爆炸出声且保底`);
      checked += 1;
    }
    total += calls.length;
    assert.ok(raid.peakVoices <= R.audio.maxVoices, `${key}：本层声部峰值 ${raid.peakVoices} ≤ ${R.audio.maxVoices}`);
    assert.equal(raid.State().whistles, calls.length);
  }
  Ok(`下落啸声：三种编队共 ${total} 条，全部在爆炸声到耳朵的那一刻停住、那一颗必出爆炸声`);
}

// ---------------------------------------------------------------------------
// 3) 外弹道与投弹：从机腹离开、带飞机速度、二次阻力、落在对得上的那一点；长机那一串的中点在瞄准点上
// ---------------------------------------------------------------------------
for (const seed of [7, 8]) {
  const audio = FakeAudio();
  const { host } = RaidHost(audio);
  const raid = new FirstLevelAirRaid(host, seed);
  raid.waveIndex = seed === 7 ? 0 : 1;           // 一轮轻弹、一轮重弹
  const plan = WaveNow(raid);
  assert.ok(plan, "起了一轮");
  const F = R.formations[plan.key], spec = plan.spec, g = BOMB_PHYSICS.gravity;
  const traj = DropTrajectory(plan.speed, DragK(spec), F.altitudeM + 200, { vDown: R.bomb.ejectMps, stepS: 0.0025 });
  for (const b of plan.bombs) {
    const plane = raid.PlanePoint(plan, b.plane, b.tRelease);
    assert.ok(Math.hypot(plane.x - b.from.x, plane.y - R.bomb.bayDropM - b.from.y, plane.z - b.from.z) < 1e-6, "离机那一刻在弹舱下");
    const end = raid.BombPose(plan, b, b.tImpact);
    assert.ok(Math.hypot(end.x - b.at.x, end.y - b.at.y, end.z - b.at.z) < 1e-6, "落地那一刻就在炸点");
    // 一条独立的细步长积分：同一时刻的高度对得上（厘米级）。
    const mid = b.fallS * 0.6, ref = TrajectoryAt(traj, mid, {});
    assert.ok(Math.abs(raid.BombPose(plan, b, b.tRelease + mid).y - (b.from.y + ref.y)) < 0.02, "空中位置就是积分出来的航迹");
    let lastY = Infinity, lastPitch = -1, lastVs = Infinity;
    for (let u = 0; u <= 1.0001; u += 0.1) {
      const p = raid.BombPose(plan, b, b.tRelease + u * b.fallS);
      const r = TrajectoryAt(plan.traj, u * b.fallS, {});
      assert.ok(p.y <= lastY + 1e-9 && p.pathPitch >= lastPitch - 1e-9, "越落越低、越落越竖");
      assert.ok(r.vs <= lastVs + 1e-9, "水平速度被阻力一路吃掉");
      assert.ok(p.scale >= 1 && p.scale <= R.bomb.maxScale && p.lengthM === spec.lengthM, "真尺寸 + 远处补足像素的倍率");
      lastY = p.y; lastPitch = p.pathPitch; lastVs = r.vs;
    }
    // 真空里（带同样的向下弹射速度）落这么高要多久：t = (√(v0² + 2gh) − v0) / g。
    const drop = b.from.y - b.at.y, v0 = R.bomb.ejectMps, vacuum = (Math.sqrt(v0 * v0 + 2 * g * drop) - v0) / g;
    assert.ok(b.fallS > vacuum && b.fallS < vacuum * 1.03, `下落 ${b.fallS.toFixed(3)} s：比真空 ${vacuum.toFixed(3)} s 略长（阻力）`);
    // 落地时飞机在炸点前面：比真空里多出的那一截就是阻力（十几二十米），再加散布。
    const under = raid.PlanePoint(plan, b.plane, b.tImpact);
    const behind = (under.x - b.at.x) * plan.dir.x + (under.z - b.at.z) * plan.dir.z;
    const dragLag = plan.speed * b.fallS - TrajectoryAt(plan.traj, b.fallS, {}).s;
    assert.ok(dragLag > 5 && dragLag < 40, `阻力让炸弹落后 ${dragLag.toFixed(1)} m`);
    if (plan.turn && b.tImpact > plan.turn.start) continue;          // 已经转弯了，机身不在原航线上
    assert.ok(Math.abs(behind - dragLag) <= R.bomb.dispersionM[1] + 1e-6, `落点落后机身 ${behind.toFixed(1)} m（阻力 ${dragLag.toFixed(1)} + 散布）`);
  }
  // 投弹解算：长机那一串（地面平）的中点落在瞄准点上，误差只有散布。
  const lead = plan.bombs.filter((b) => b.plane === 0);
  const mx = lead.reduce((n, b) => n + b.at.x, 0) / lead.length, mz = lead.reduce((n, b) => n + b.at.z, 0) / lead.length;
  const miss = Math.hypot(mx - plan.center.x, mz - plan.center.z);
  assert.ok(miss <= Math.hypot(...R.bomb.dispersionM) + 1e-6, `长机那一串的中点离瞄准点 ${miss.toFixed(1)} m`);
  // 僚机看见长机投弹才按电门：每架的第一颗都不早于长机的第一颗 + dropLagS[0]。
  const leadFirst = Math.min(...lead.map((b) => b.tRelease));
  for (let j = 1; j < plan.slots.length; j += 1) {
    const first = Math.min(...plan.bombs.filter((b) => b.plane === j).map((b) => b.tRelease));
    assert.ok(first - leadFirst >= F.dropLagS[0] - 1e-9 && first - leadFirst <= F.dropLagS[1] + 1e-9, `僚机 ${j} 晚 ${(first - leadFirst).toFixed(2)} s 投`);
  }
  Ok(`外弹道（${plan.key} / ${spec.id}）：${plan.bombs.length} 颗，前冲 ${plan.aimRangeM.toFixed(0)} m、下落 ${plan.aimFallS.toFixed(2)} s，`
    + `长机串中点偏瞄准点 ${miss.toFixed(1)} m`);
}

// ---------------------------------------------------------------------------
// 4) 离场：投完弹上浮、压坡度协调转弯（角速度 g·tanφ / v）、往远离听者那一侧转
// ---------------------------------------------------------------------------
{
  const audio = FakeAudio();
  const { host } = RaidHost(audio);
  const raid = new FirstLevelAirRaid(host, 31);
  raid.waveIndex = 1;
  const plan = WaveNow(raid);
  const F = R.formations[plan.key];
  assert.ok(plan.turn, "有离场转弯");
  const lastRelease = Math.max(...plan.lastRelease);
  assert.ok(plan.turn.start > lastRelease, "最后一颗离机之后才转弯（炸弹不受转弯影响）");
  // 压满坡度之后，航向变化率 = g·tanφ / v。
  const t0 = plan.turn.start + 6, dt = 1;
  const a = raid.LeadTrack(plan, t0), b = raid.LeadTrack(plan, t0 + dt);
  const rate = Math.acos(Math.min(1, a.hx * b.hx + a.hz * b.hz)) / dt;
  const want = BOMB_PHYSICS.gravity * Math.tan(F.bankDeg * Math.PI / 180) / plan.speed;
  assert.ok(Math.abs(rate - want) < want * 0.03, `转弯角速度 ${(rate * 180 / Math.PI).toFixed(2)}°/s ≈ g·tanφ/v ${(want * 180 / Math.PI).toFixed(2)}°/s`);
  assert.ok(Math.abs(Math.abs(a.bank) - F.bankDeg * Math.PI / 180) < 1e-6, "坡度压到 bankDeg");
  // 往远离听者的一侧转：航向的右转/左转与压坡度的方向一致（右转 = 右翼压下 = bank < 0）。
  const cross = a.hx * b.hz - a.hz * b.hx;   // >0：顺时针（俯视，X 东 Z 南）= 向右
  assert.equal(Math.sign(cross), plan.turn.sign, "航向往 turn.sign 那一侧转");
  assert.equal(Math.sign(a.bank), -plan.turn.sign, "坡度压向转弯内侧");
  const L = audio.listenerPos;
  const lat = (L.x - plan.center.x) * plan.right.x + (L.z - plan.center.z) * plan.right.z;
  if (Math.abs(lat) >= 40) assert.equal(plan.turn.sign, lat > 0 ? -1 : 1, "往远离听者的那一侧转");
  // 投完弹上浮：长机最后一颗离机后几秒，高出 balloonM 的大半，且此刻在爬升。
  const before = raid.PlanePose(plan, 0, plan.lastRelease[0] - 0.1), after = raid.PlanePose(plan, 0, plan.lastRelease[0] + 1);
  const later = raid.PlanePoint(plan, 0, plan.lastRelease[0] + 4 * F.balloonS);
  assert.ok(before.climb === 0 && after.climb > 0, "投弹前平飞、投完弹抬头上浮");
  assert.ok(later.y - plan.altitude > F.balloonM * 0.9 && later.y - plan.altitude <= F.balloonM + 1e-9, `上浮 ${(later.y - plan.altitude).toFixed(2)} m`);
  Ok(`离场：${plan.key} 最后一颗离机后 ${(plan.turn.start - lastRelease).toFixed(1)} s 压 ${F.bankDeg}° 坡度，`
    + `半径 ${Math.round(plan.turn.radiusM)} m，上浮 ${F.balloonM} m`);
}

// ---------------------------------------------------------------------------
// 5) 避人避车（按弹型）、过顶、震屏的比例距离、03 横飞期间不起、对白推后、07 以后不起
// ---------------------------------------------------------------------------
{
  // 每一块落区里都站一个人：挑不到就推后，挑得到的炸点离人都在该弹型的 clearM 以外。
  const soldiers = R.zones.map((z) => ({ x: (z.xMin + z.xMax) / 2, z: (z.zMin + z.zMax) / 2 }));
  const audio = FakeAudio();
  const { host, log } = RaidHost(audio, {
    Blocked: (at, clearM) => soldiers.some((s) => Math.hypot(s.x - at.x, s.z - at.z) < clearM),
  });
  const raid = new FirstLevelAirRaid(host, 99);
  Run(raid, audio, "Tank", 400);
  assert.ok(raid.waves > 0, "有人站着也还挑得到落点");
  const close = log.visuals.filter((v) => soldiers.some((s) => Math.hypot(s.x - v.x, s.z - v.z) < AERIAL_BOMBS[v.bomb].clearM));
  assert.equal(close.length, 0, `${log.visuals.length} 颗没有一颗落在人 clearM 内`);
  Ok(`避人：${log.visuals.length} 颗全在各自的 clearM 以外（50 kg ${AERIAL_BOMBS.Bomb50kg.clearM} m / 250 kg ${AERIAL_BOMBS.Bomb250kg.clearM} m）`);
}
{
  // 过顶：听者在后方两块落区的北面时，有的轮次从头顶偏 missM 以内压过去，而且仍是从北边来。
  const audio = FakeAudio({ listener: { x: 20, y: 1.6, z: -150 } });
  const { host } = RaidHost(audio);
  const raid = new FirstLevelAirRaid(host, 0x1938);
  const overhead = [];
  for (let t = 0; t < 900; t += 1 / 30) {
    audio.Tick(1 / 30); raid.Update(1 / 30, "MachineGun", { started: true });
    const w = raid.wave;
    if (w?.overhead && !overhead.includes(w)) overhead.push(w);
  }
  assert.ok(overhead.length >= 2, `十五分钟里 ${overhead.length} 轮过顶`);
  const L = audio.listenerPos;
  for (const w of overhead) {
    const lat = Math.abs((L.x - w.center.x) * w.right.x + (L.z - w.center.z) * w.right.z);
    assert.ok(lat <= R.overhead.missM + 1, `过顶那一轮的航迹离听者横向 ${lat.toFixed(0)} m`);
    assert.ok(Math.acos(w.dir.z) <= R.overhead.maxFromNorthDeg * Math.PI / 180 + 1e-9, "过顶也是从北边来");
  }
  Ok(`过顶：${overhead.length} 轮从头顶 ${R.overhead.missM} m 以内压过去`);
}
{
  // 比例距离：同样 300 m，250 kg 级比 50 kg 级重；50 kg 级在 170 / 470 m 上与旧版口径一致。
  const raid = new FirstLevelAirRaid(RaidHost(FakeAudio()).host, 1);
  const c50 = Math.cbrt(AERIAL_BOMBS.Bomb50kg.chargeKg), c250 = Math.cbrt(AERIAL_BOMBS.Bomb250kg.chargeKg);
  assert.ok(raid.ShakeTrauma(300, "open", c250) > raid.ShakeTrauma(300, "open", c50) * 1.3, "重磅弹同距离震得更重");
  assert.ok(Math.abs(raid.ShakeTrauma(170, "open", c50) - R.shake.traumaNear) < 0.01, "50 kg 级 170 m ≈ traumaNear");
  assert.ok(Math.abs(raid.ShakeTrauma(470, "open", c50) - R.shake.traumaFar) < 0.01, "50 kg 级 470 m ≈ traumaFar");
  Ok("震屏按比例距离 d/∛W");
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
// 6) 挂进前线声景：01 等导演走到 FrontPass；与前线、炮击合计 ≤ sharedMaxVoices；落地走 vfx.BombBlast
// ---------------------------------------------------------------------------
{
  const audio = FakeAudio({ zone: "trench" });
  const beats = new Set();
  const formations = [], blasts = [], columns = [], shells = [];
  const aircraft = { manualPoses: new Map(), SetFormation: (k, p) => formations.push(p.length), SetBombs() {} };
  const vfx = { Explosion: (at, o) => shells.push(o),
    BombBlast: (at, o) => blasts.push({ ...at, ...o }),
    SmokeSource: (at, o) => (columns.push(o), columns.length), RemoveSmokeSource() {} };
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
  // 落地画面：每颗一次 BombBlast（装药、摊薄、弹着方向都带上），重磅弹的常驻土柱粗一圈。
  assert.equal(blasts.length, sound.airRaid.impacts, "每颗落地一次 BombBlast");
  assert.ok(!shells.some((o) => o.origin === "airRaid"), "有 BombBlast 就不退回 shell 档（shell 档只剩场外炮击）");
  assert.ok(blasts.every((b) => b.chargeKg > 0 && b.budget > 0 && b.budget <= 1 && Math.hypot(b.dirX, b.dirZ) > 0.99), "BombBlast 拿到装药、摊薄与弹着方向");
  const C = R.impact.column;
  assert.ok(columns.some((o) => o.sizeEnd > C.sizeEnd * 1.5), "250 kg 级的常驻土柱按 ∛W 放大");
  const st = sound.State();
  assert.ok(st.airRaid && st.airRaid.waves === sound.airRaid.waves, "State() 带空袭取证");
  sound.Dispose();
  assert.equal(formations.at(-1), 0, "销毁时编队收起");
  Ok(`接进前线声景：FrontPass 起、01–06 共 ${sound.airRaid.waves} 轮、每轮 ${perWave.toFixed(1)} 声，合计声部峰值 ${peak}，`
    + `BombBlast ${blasts.length} 次`);
}

console.log(`FirstLevelAirRaidTest：${passed} 组通过`);
