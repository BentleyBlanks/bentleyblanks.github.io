// Script_FirstLevelTankProbe.mjs —— 第一关战车专项探针（战车包 Step 2 · 2026-09-23）
//
//   node Taierzhuang1938/Script_FirstLevelTankProbe.mjs               # 03→06 真实输入跑一趟（开声音）+ 关键画面
//   node Taierzhuang1938/Script_FirstLevelTankProbe.mjs --no-photos   # 只跑数据
//   node Taierzhuang1938/Script_FirstLevelTankProbe.mjs --photos-only # 只拍关键画面（摆位，不跑战斗）
//
// 记下（_shots/FirstLevelTankProbe/Data_TankProbe.json）：
//   · 露面：玩家第一次看见炮塔的时刻 / 阶段 / 距离；那一刻玩家在不在车的视线里；引擎声比露面早多少秒响起；
//   · 每发主炮：目标、种类（警告弹 / HE / 轰掩体…）、瞄准停顿、手摇停到开炮的间隔（预兆）、落点、离玩家多远；
//   · 机枪点射分布（按阶段 / 种类，首次接触「走进来」那串零伤害有几发）；
//   · 05 攻击路线（Data_FirstLevelFrontRoute.FRONT_SORTIE.attackRoute）上的威胁窗口：炮塔 / 车体机枪指着它的时间占比、
//     ≥ 2 s 的安全窗口；
//   · 反应次数、毁伤状态序列；
//   · 声音：常驻循环数（契约 §6 ≤ 3）、各层有效电平、引擎先闻其声的距离与电平、熄火后循环归零。
// 关键画面（_shots/FirstLevelTankProbe/Scene_*.png，摆位拍，逐张人看）：露面剪影、驶出路弯、开炮尘环、
// 攻击位看车侧后、熄火冒烟。
//
// 浏览器测试：直接 node 跑（不经 TestRunner 全局锁时也能跑）。开声音 = menu=0（出图模式 shot=1 不建 AudioContext）。
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { ParseCampaignArgs, OpenCampaign, CloseCampaign, CaptureFailure, InstallInputDriver } from "./Script_FirstLevelCampaignKit.mjs";
import { Drive as DriveFront } from "./Script_FirstLevelCampaignFront.mjs";
import { FRONT_SORTIE } from "./Data_FirstLevelFrontRoute.mjs";
import { TANK, TANK_TEMP_PATH } from "./Data_Tuning_Tank.mjs";

const argv = process.argv;
const photos = !argv.includes("--no-photos");
const photosOnly = argv.includes("--photos-only");
const Wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const Round = (v, n = 2) => (Number.isFinite(v) ? Number(v.toFixed(n)) : v);

async function Unlock(page) {
  const visible = await page.evaluate(() => { const b = document.querySelector("#bootStart"); return !!b && b.offsetParent !== null; });
  if (visible) await page.locator("#bootStart").click();
  else { await page.mouse.click(640, 360); await page.evaluate(() => window.Tengxian.audio.Unlock()); }
  await page.waitForFunction(() => window.Tengxian.audio.ctx?.state === "running", null, { timeout: 15000 });
  await page.waitForFunction(() => window.Tengxian.audio.sfxReady, null, { timeout: 60000 });
}

/** 页面里：挂在战车接线层的 Update 上，按游戏时间 10 Hz 采样。 */
async function InstallSampler(page, lane) {
  await page.evaluate(async (lane) => {
    const g = window.Tengxian, R = g.Debug.FirstLevelMissionRuntime(), tr = R.tankRuntime;
    const { YawTo } = await import("./Script_FirstLevelTankBrain.mjs");
    const probe = window.tankProbe = { samples: [], nextAt: -1 };
    const original = tr.Update.bind(tr);
    tr.Update = (dt) => {
      original(dt);
      const time = R.time;
      if (time < probe.nextAt) return;
      probe.nextAt = time + 0.1;
      const t = R.tank, p = g.player, a = g.audio, s = tr.sound?.State();
      const present = !!t.present;
      let seen = null, hull = null;
      if (present && p?.Alive) {
        seen = !R.BlocksSight(p.EyePosition.clone(), R.Point(t, 2.2), R.view.tankCollider);
        hull = !R.BlocksSight(p.EyePosition.clone(), R.Point(t, 1.0), R.view.tankCollider);
      }
      const aimed = present ? lane.map((q) => Math.abs(Math.atan2(Math.sin((t.turretYaw ?? 0) - YawTo(t, q)), Math.cos((t.turretYaw ?? 0) - YawTo(t, q))))) : null;
      const hullAimed = present ? lane.map((q) => Math.abs(Math.atan2(Math.sin((t.hullYaw ?? 0) - YawTo(t, q)), Math.cos((t.hullYaw ?? 0) - YawTo(t, q))))) : null;
      probe.samples.push({
        t: Number(time.toFixed(2)), stage: R.flow.stage.id, present,
        tank: present ? { x: +t.x.toFixed(2), z: +t.z.toFixed(2), state: t.damageState, speed: +(t.speed || 0).toFixed(2),
          rpm: Math.round(t.rpm || 0), load: +(t.load || 0).toFixed(2), turretYaw: +(t.turretYaw || 0).toFixed(3),
          cranking: !!t.cranking, phase: t.gunPhase || null, target: t.target || null } : null,
        player: p ? { x: +p.position.x.toFixed(2), z: +p.position.z.toFixed(2), alive: p.Alive, health: Math.round(p.health) } : null,
        seen, hull, aimed, hullAimed,
        audio: s ? { live: s.liveLoops, engine: s.loops.tankEngine?.effectiveGain ?? 0, engineOcc: s.loops.tankEngine?.occ ?? 0,
          tracks: s.loops.tankTracks?.effectiveGain ?? 0, turret: s.loops.tankTurret?.effectiveGain ?? 0,
          distance: s.loops.tankEngine?.distance ?? null, layers: s.last?.engine?.gains?.map((v) => +v.toFixed(3)) ?? null,
          crank: s.last?.turret?.gains?.[0] ?? 0, offstage: !!s.last?.offstage } : null,
        nodes: a?.liveNodes ?? 0,
        // 参照：同一距离上一发日军步枪本体的电平（混音表 × 距离），拿来比「车声站多高」。
        rifleRef: present || s ? +(a?.GunReportLevelAt?.("rifleIja", s?.loops.tankEngine?.distance ?? 0) ?? 0).toFixed(4) : null,
      });
      if (probe.samples.length > 20000) probe.samples.shift();
    };
  }, lane);
}

function Windows(samples, flag, minS = 0) {
  const out = [];
  let start = null;
  for (let i = 0; i < samples.length; i += 1) {
    if (flag(samples[i])) { if (start == null) start = samples[i].t; }
    else if (start != null) { if (samples[i].t - start >= minS) out.push([start, samples[i].t]); start = null; }
  }
  if (start != null && samples.at(-1).t - start >= minS) out.push([start, samples.at(-1).t]);
  return out;
}

function Metrics(samples, debug) {
  const log = debug.log, tel = debug.telemetry || {};
  const firstEngine = samples.find((s) => s.audio && s.audio.engine > 0);
  const appeared = log.appearedAt;
  const atAppear = appeared ? samples.find((s) => s.t >= appeared.t) : null;
  const shots = log.shots.map((shot) => {
    const before = samples.filter((s) => s.t <= shot.t && s.t >= shot.t - 12 && s.tank);
    const lastCrank = [...before].reverse().find((s) => s.tank.cranking);
    const sample = before.at(-1);
    return { t: Round(shot.t), stage: sample?.stage, kind: shot.kind, target: shot.target, warning: shot.warning,
      layS: Round(shot.layS), crankStopToFireS: lastCrank ? Round(shot.t - lastCrank.t) : null,
      playerDistance: Round(shot.playerDistance ?? null), impact: shot.impact ? { x: Round(shot.impact.x, 1), z: Round(shot.impact.z, 1) } : null };
  });
  const bursts = tel.bursts || [];
  const byKind = {};
  for (const b of bursts) byKind[b.kind] = (byKind[b.kind] || 0) + 1;
  const tankStage = samples.filter((s) => s.stage === "Tank" && s.tank && s.tank.state !== "Disabled");
  const lane = FRONT_SORTIE.attackRoute;
  const laneThreat = lane.map((q, i) => {
    const threatened = (s) => (s.aimed[i] < 0.35) || (s.hullAimed[i] < 0.45);
    const covered = tankStage.filter(threatened).length / Math.max(1, tankStage.length);
    return { point: q, threatenedShare: Round(covered, 3), safeWindows: Windows(tankStage, (s) => !threatened(s), 2).map(([a, b]) => [Round(a, 1), Round(b, 1)]) };
  });
  const reactions = {};
  for (const r of tel.reactions || []) reactions[r.kind] = (reactions[r.kind] || 0) + 1;
  const disabledAt = log.states.find((s) => s.state === "Disabled")?.t ?? null;
  const afterDisable = disabledAt == null ? [] : samples.filter((s) => s.t > disabledAt + 3 && s.audio);
  const audioSamples = samples.filter((s) => s.audio);
  const byStage = {};
  for (const s of audioSamples) {
    const e = byStage[s.stage] ||= { n: 0, engine: 0, rifleRef: 0, maxLive: 0, nodesMax: 0 };
    e.n += 1; e.engine += s.audio.engine; e.rifleRef += s.rifleRef || 0; e.maxLive = Math.max(e.maxLive, s.audio.live); e.nodesMax = Math.max(e.nodesMax, s.nodes);
  }
  for (const e of Object.values(byStage)) { e.engine = Round(e.engine / e.n, 4); e.rifleRef = Round(e.rifleRef / e.n, 4); }
  return {
    appearance: appeared ? { ...appeared, t: Round(appeared.t), distance: Round(appeared.distance, 1),
      playerExposedToTank: atAppear ? !!atAppear.seen : null, hullVisible: atAppear ? !!atAppear.hull : null,
      engineAudibleSinceT: firstEngine ? firstEngine.t : null,
      heardBeforeSeenS: firstEngine ? Round(appeared.t - firstEngine.t, 1) : null,
      engineGainAtAppear: atAppear?.audio?.engine ?? null,
      firstShotAfterAppearS: shots.length ? Round(shots[0].t - appeared.t, 1) : null } : null,
    shots,
    telegraph: { shots: shots.length, minLayS: Math.min(...shots.map((s) => s.layS ?? 99)),
      withCrankStopBefore: shots.filter((s) => s.crankStopToFireS != null).length,
      minCrankStopToFireS: Math.min(...shots.filter((s) => s.crankStopToFireS != null).map((s) => s.crankStopToFireS)) },
    mg: { bursts: bursts.length, byKind, walkInShots: log.walkInShots, mgShots: log.mgShots,
      byStage: Object.fromEntries(["Support", "MachineGun", "Tank"].map((st) => [st, bursts.filter((b) => {
        const s = samples.find((x) => x.t >= b.t); return s?.stage === st; }).length])) },
    laneThreat,
    reactions,
    states: log.states.map((s) => ({ ...s, t: Round(s.t) })),
    audio: { maxLiveLoops: Math.max(0, ...audioSamples.map((s) => s.audio.live)), byStage,
      loopsAfterDisable: afterDisable.length ? Math.max(...afterDisable.map((s) => s.audio.live)) : null,
      final: debug.audio },
  };
}

async function RunCampaign() {
  const options = ParseCampaignArgs(["node", "x", "--campaign", "--stage-from=3", "--stage-to=6", "--audio", "--probe-front-gun"]);
  options.suite = "FirstLevelTankProbe";
  const ctx = await OpenCampaign(options);
  const { page, output } = ctx;
  try {
    await Unlock(page);
    await InstallSampler(page, FRONT_SORTIE.attackRoute);
    await InstallInputDriver(ctx);
    await DriveFront(ctx);
    const data = await page.evaluate(() => ({
      samples: window.tankProbe.samples,
      debug: window.Tengxian.Debug.FirstLevelMission().tankBrain,
      stage: window.Tengxian.Debug.FirstLevelMission().stage,
    }));
    const metrics = Metrics(data.samples, data.debug);
    await fs.writeFile(path.join(output, "Data_TankProbe.json"), JSON.stringify({ metrics, samples: data.samples }, null, 1));
    console.log(JSON.stringify({ ...metrics, shots: metrics.shots.length, states: metrics.states }, null, 1).slice(0, 6000));
    assert.deepEqual(ctx.errors, [], "no page errors");
    assert.ok(metrics.appearance, "the tank appeared to the player");
    assert.ok(metrics.appearance.heardBeforeSeenS > 0, `engine heard before the turret is seen (${metrics.appearance.heardBeforeSeenS} s)`);
    assert.ok(metrics.audio.maxLiveLoops <= 3, `contract §6: ≤ 3 resident tank loops (max ${metrics.audio.maxLiveLoops})`);
    assert.ok(metrics.shots.length >= 2 && metrics.telegraph.minLayS >= TANK.gunner.layMinS - 0.05,
      `every main-gun shot has the 1.2–1.8 s lay pause (${metrics.shots.length} shots, min ${metrics.telegraph.minLayS} s)`);
    assert.ok(metrics.states.some((s) => s.state === "MobilityKill") && metrics.states.some((s) => s.state === "Disabled"),
      "two-stage damage: MobilityKill then Disabled");
    assert.ok(metrics.audio.loopsAfterDisable === 0, "no tank loop keeps running after the engine dies");
    console.log(`ok tank probe: ${metrics.shots.length} shots, ${metrics.mg.bursts} MG bursts, appearance at ${metrics.appearance.stage} ${metrics.appearance.distance} m (heard ${metrics.appearance.heardBeforeSeenS} s earlier)`);
  } catch (error) {
    await CaptureFailure(ctx);
    throw error;
  } finally {
    await CloseCampaign(ctx);
  }
}

/** 摆位拍关键画面：车按临时路点摆，玩家摆到对应位置、视线对准车、渲几帧、截图。 */
async function Photos() {
  const options = ParseCampaignArgs(["node", "x", "--campaign", "--stage-from=3", "--stage-to=6"]);
  options.suite = "FirstLevelTankProbe";
  const ctx = await OpenCampaign(options);
  const { page, output } = ctx;
  const W = TANK_TEMP_PATH.waypoints;
  const index = (pred) => W.findIndex(pred);
  const Shot = async (name, { tankAt, player, crouch = false, look = 1.6, settleS = 1.2, before = null }) => {
    await page.evaluate(({ tankAt, player, crouch, look, settleS, before }) => {
      const g = window.Tengxian, R = g.Debug.FirstLevelMissionRuntime(), tr = R.tankRuntime;
      g.player.TakeHit = () => {};
      R.Record("rightNestCaptured");
      tr.EnsureBrain(R.flow.stage.id);
      if (tankAt != null) tr.brain.PlaceAt(tankAt);
      const y = g.battlefield.GroundHeight(player.x, player.z);
      g.player.position.set(player.x, y, player.z);
      if (g.player.SetStance) g.player.SetStance(crouch ? "crouch" : "stand");
      if (before === "disable") tr.brain.ForceDisable("probePhoto");
      g.StepFrames(Math.round(settleS * 60), 1 / 60, false);
      if (before === "fire") {
        const t = R.tank, at = { x: player.x + 6, y: y + 0.5, z: player.z + 3 };
        tr.Fire({ weapon: "main", at, kind: "HE", damage: 0, radius: 0.5, target: "probe" });
      }
      const t = R.tank, p = g.player.position, eye = g.player.EyePosition;
      g.player.yaw = Math.atan2(p.x - t.x, p.z - t.z);
      g.player.pitch = Math.atan2(g.battlefield.GroundHeight(t.x, t.z) + look - eye.y, Math.hypot(p.x - t.x, p.z - t.z));
      g.StepFrames(before === "fire" ? 18 : 3, 1 / 60, true);   // 开炮后 0.3 s：炮口焰还在、尘环已经起来
    }, { tankAt, player, crouch, look, settleS, before });
    await page.screenshot({ path: path.join(output, `Scene_Tank${name}.png`) });
    console.log("photo", name);
  };
  try {
    const nest = FRONT_SORTIE.nest;
    await Shot("Preview", { tankAt: index((w) => w.preview), player: { x: nest.x, z: nest.z + 1 }, look: 2.0 });
    // 驶出路弯：阵位里看路弯被北面残墙挡住，从阵位东侧的沟沿看（约 30 m）。
    await Shot("DriveOut", { tankAt: index((w) => Math.abs(w.x - 62.8) < 0.01), player: { x: 42, z: -150 }, look: 1.4, settleS: 0.3 });
    // 开炮尘环：阵位里看火力点只露炮塔（hull-down），炮口下的尘环被墙挡着；从东侧沟沿斜看（约 17 m）才拍得到
    //「一炮掀起一圈土」。炮弹打在玩家身边 6 m 的土上。
    await Shot("CannonDust", { tankAt: index((w) => w.kind === "firePoint"), player: { x: 41, z: -148 }, look: 1.4, before: "fire" });
    await Shot("AttackSide", { tankAt: index((w) => w.kind === "block"), player: { x: FRONT_SORTIE.throw.x, z: FRONT_SORTIE.throw.z }, crouch: true, look: 1.2 });
    await Shot("Disabled", { tankAt: index((w) => w.kind === "block"), player: { x: FRONT_SORTIE.throw.x - 4, z: FRONT_SORTIE.throw.z + 3 }, look: 1.4, settleS: 4, before: "disable" });
    assert.deepEqual(ctx.errors, [], "no page errors while posing");
  } finally {
    await CloseCampaign(ctx);
  }
}

if (!photosOnly) await RunCampaign();
if (photos || photosOnly) await Photos();
