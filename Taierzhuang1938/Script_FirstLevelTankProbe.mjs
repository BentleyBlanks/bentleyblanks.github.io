// Script_FirstLevelTankProbe.mjs —— 第一关战车专项探针（战车包 Step 2 · 2026-09-23）
//
//   node Taierzhuang1938/Script_FirstLevelTankProbe.mjs               # 03→06 真实输入跑一趟（开声音）+ 关键画面
//   node Taierzhuang1938/Script_FirstLevelTankProbe.mjs --no-photos   # 只跑数据
//   node Taierzhuang1938/Script_FirstLevelTankProbe.mjs --photos-only # 只拍关键画面（摆位，不跑战斗）
//   node Taierzhuang1938/Script_FirstLevelTankProbe.mjs --frame-ab    # 契约 §6：同页交替 A/B（大脑接管 vs 旧路径）量帧时间与音频节点
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
import { TANK, FRONT_TANK_BRAIN_PATH } from "./Data_Tuning_Tank.mjs";
import { LanePoint, YawTo } from "./Script_FirstLevelTankBrain.mjs";

const argv = process.argv;
const frameAb = argv.includes("--frame-ab");
const photos = !argv.includes("--no-photos") && !frameAb;
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
        t: Number(time.toFixed(2)), bt: tr.brain ? Number(tr.brain.time.toFixed(2)) : null, stage: R.flow.stage.id, present,
        tank: present ? { x: +t.x.toFixed(2), z: +t.z.toFixed(2), state: t.damageState, speed: +(t.speed || 0).toFixed(2),
          rpm: Math.round(t.rpm || 0), load: +(t.load || 0).toFixed(2), turretYaw: +(t.turretYaw || 0).toFixed(3), hullYaw: +(t.hullYaw || 0).toFixed(3),
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
      playerDistance: Round(shot.playerDistance ?? null), protectedMinM: Round(shot.protectedMinM ?? null), pulled: shot.pulled || 0, impact: shot.impact ? { x: Round(shot.impact.x, 1), z: Round(shot.impact.z, 1) } : null,
      // Past the aim it was fired at, along the line of fire (SafeShellAim's overshoot rule; only guarded while protected men exist).
      overshootM: shot.impact && shot.from && shot.protectedMinM != null ? Round((() => { const fx = shot.at.x - shot.from.x, fz = shot.at.z - shot.from.z, fd = Math.hypot(fx, fz) || 1;
        return ((shot.impact.x - shot.at.x) * fx + (shot.impact.z - shot.at.z) * fz) / fd; })(), 1) : null };
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
  // 玩家真在攻击支路上的那段时间里（离沟线 ≤ radiusM、领过集束弹、车还没哑）：他脚下那段沟被炮塔 / 车体机枪指着的占比，
  // 以及 ≥ 2 s 的安全窗口（公平：要有能冲的空当）。沟线与取点口径同运行时（FRONT_TANK_BRAIN_PATH.lanes + LanePoint）。
  const laneSpec = (FRONT_TANK_BRAIN_PATH.lanes || []).find((l) => l.id === "attackLane");
  const Aimed = (yaw, from, q) => Math.abs(Wrap(yaw - YawTo(from, q)));
  const onLane = laneSpec ? tankStage.map((s) => {
    const q = s.player?.alive ? LanePoint(laneSpec, s.player) : null;
    return q ? { t: s.t, threatened: Aimed(s.tank.turretYaw, s.tank, q) < 0.35 || Aimed(s.tank.hullYaw ?? s.tank.turretYaw, s.tank, q) < 0.45 } : null;
  }).filter(Boolean) : [];
  const onLaneThreat = { samples: onLane.length, seconds: Round(onLane.length * 0.1, 1),
    threatenedShare: Round(onLane.filter((s) => s.threatened).length / Math.max(1, onLane.length), 3),
    safeWindows: Windows(onLane, (s) => !s.threatened, 2).map(([a, b]) => [Round(a, 1), Round(b, 1)]) };
  const reactions = {};
  for (const r of tel.reactions || []) reactions[r.kind] = (reactions[r.kind] || 0) + 1;
  const stageAt = (t) => samples.find((x) => x.t >= t)?.stage ?? null;
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
      // A burst's t is the brain's own clock (it starts when the tank enters, in 03), not the mission clock the samples
      // keep: match on the brain time each sample records (relay r2 Front step 3 - matched on mission time, bursts landed
      // up to a stage early, 05's showed up in 03/04 and the "05: the hull MG fires" check read 0).
      byStage: Object.fromEntries(["Support", "MachineGun", "Tank"].map((st) => [st, bursts.filter((b) => {
        const s = samples.find((x) => x.bt != null && x.bt >= b.t); return s?.stage === st; }).length])),
      // Who each stage's bursts went at (target ids; a burst at the attack lane is a lane point id).
      targetsByStage: Object.fromEntries(["Support", "MachineGun", "Tank"].map((st) => [st, bursts.reduce((out, b) => {
        const s = samples.find((x) => x.bt != null && x.bt >= b.t); if (s?.stage === st) out[b.target ?? "-"] = (out[b.target ?? "-"] || 0) + 1; return out; }, {})])) },
    laneThreat,
    onLaneThreat,
    tankStageShots: { total: shots.filter((s) => s.stage === "Tank").length,
      byTarget: shots.filter((s) => s.stage === "Tank").reduce((o, s) => ({ ...o, [s.target]: (o[s.target] || 0) + 1 }), {}) },
    breaks: (log.breaks || []).map((b) => ({ ...b, t: Round(b.t), stage: b.stage ?? stageAt(b.t) })),
    entry: log.entry, luoFinish: log.luoFinish, frames: log.frames,
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
  options.tankProbe = true;
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
    // 05 压迫感（审查 2026-09-24）：攻击支路上真有威胁、也真有空当；主炮不再白打打不死的剧情人物；机枪在 05 开火。
    assert.ok(metrics.onLaneThreat.samples >= 30, `the probe spent time on the attack lane (${metrics.onLaneThreat.seconds} s)`);
    assert.ok(metrics.onLaneThreat.threatenedShare >= 0.25,
      `05: the tank covers the player's stretch of the attack lane ≥ 25% of the time (${metrics.onLaneThreat.threatenedShare})`);
    assert.ok(metrics.onLaneThreat.safeWindows.length >= 1 || metrics.onLaneThreat.threatenedShare < 1,
      "05: there is a ≥ 2 s window to move on the attack lane");
    const essentialShots = ["heyoutian", "luo", "liuwencai", "zhou"].reduce((n, id) => n + (metrics.tankStageShots.byTarget[id] || 0), 0);
    assert.ok(essentialShots <= 1, `05: main gun no longer wastes shells on script-essential companions (${JSON.stringify(metrics.tankStageShots.byTarget)})`);
    assert.ok(metrics.mg.byStage.Tank >= 1, `05: the hull MG fires (${metrics.mg.byStage.Tank} bursts)`);
    // Contract §2.9 at the real burst, not the aim point (09-24 Front: gap-zone shells hit the trench lip 5.8–8.6 m from
    // the waiting guards and one run lost the whole batch). 0.5 m slack for men moving during the ~0.3 s flight.
    const nearProtected = metrics.shots.filter((s) => s.protectedMinM != null && s.protectedMinM < TANK.gunner.protectClearM - 0.5);
    assert.deepEqual(nearProtected, [], `no main-gun burst lands within ${TANK.gunner.protectClearM} m of a protected man`);
    // 2026-09-25 Front review: gap shells sailed over the gap into our rear trench (−16, −140). None past its aim by more than overshootMaxM.
    const overshot = metrics.shots.filter((s) => s.overshootM != null && s.overshootM > TANK.gunner.overshootMaxM + 0.5);
    assert.deepEqual(overshot, [], `no main-gun burst lands more than ${TANK.gunner.overshootMaxM} m past its aim while protected men are about`);
    // 04：打掩体真把墙打掉一截（临时数据 RightNestFrontRest / RightNestNorthRuin）。
    assert.ok(metrics.breaks.some((b) => b.stage === "MachineGun"), `04: at least one cover segment is shot away (${JSON.stringify(metrics.breaks)})`);
    // 断履带以后还会打；第二颗扔上后甲板 = 炸发动机舱。
    const disabled = metrics.states.find((s) => s.state === "Disabled");
    assert.ok(/^engine|^turretRing/.test(disabled?.zone || ""), `second bundle on the engine deck disables through the engine (${disabled?.zone})`);
    console.log(`ok tank probe: ${metrics.shots.length} shots, ${metrics.mg.bursts} MG bursts, appearance at ${metrics.appearance.stage} ${metrics.appearance.distance} m (heard ${metrics.appearance.heardBeforeSeenS} s earlier)`);
  } catch (error) {
    // 卡住的诊断（审查 2026-09-24：05 取弹沟 (27,−120) 连续两次「三个 chunk 没挪窝」）：
    // 按键、躲雷、速度、姿态、周围 1.5 m 的实体与人、附近弹坑，先分清是物理挡住还是驾驶器逻辑。
    const stuck = await page.evaluate(() => {
      const g = window.Tengxian, p = g.player, r = g.Debug.FirstLevelMissionRuntime(), at = p.position;
      const near = (x, z, m) => Math.hypot(x - at.x, z - at.z) < m;
      const colliders = (g.battlefield.colliders || []).filter((b) => b?.c && b?.h && Math.abs(b.c[0] - at.x) < b.h[0] + b.h[2] + 1.5
        && Math.abs(b.c[2] - at.z) < b.h[0] + b.h[2] + 1.5).slice(0, 12)
        .map((b) => ({ id: b.id || null, tag: b.tag || null, c: b.c.map((v) => +v.toFixed(2)), h: b.h.map((v) => +v.toFixed(2)), ry: b.ry || 0 }));
      const people = g.ai.soldiers.filter((s) => s.alive && near(s.position.x, s.position.z, 2.5))
        .map((s) => ({ id: s.missionId || s.castId || s.id, side: s.side, x: +s.position.x.toFixed(2), z: +s.position.z.toFixed(2) }));
      return { position: at.toArray().map((v) => +v.toFixed(2)), velocity: p.velocity?.toArray?.().map((v) => +v.toFixed(2)) ?? null,
        stance: p.stance, onGround: p.onGround ?? null, health: p.health, bleeding: p.bleeding, bandages: p.bandages,
        keys: [...(g.Debug.KeysDown?.() || [])], evading: !!window.MissionInputDriver?.EvadeGrenade?.(), routeBot: window.routeBot
          ? { index: window.routeBot.index, target: window.routeBot.points?.[window.routeBot.index], stalled: window.routeBot.stalled } : null,
        ground: g.battlefield.GroundHeight(at.x, at.z), colliders, people,
        craters: (r.tank.impacts || []).filter((i) => near(i.x, i.z, 4)), breakables: r.tankRuntime?.breakables?.State?.() ?? null };
    }).catch((e) => ({ error: String(e) }));
    await fs.writeFile(path.join(output, "Data_TankProbeStuck.json"), JSON.stringify(stuck, null, 2)).catch(() => {});
    console.log("STUCK_DIAG", JSON.stringify(stuck).slice(0, 3000));
    await CaptureFailure(ctx);
    throw error;
  } finally {
    await CloseCampaign(ctx);
  }
}

/** 摆位拍关键画面：车按 Space 路点（FRONT_TANK_BRAIN_PATH）摆，玩家摆到对应位置、视线对准车、渲几帧、截图。 */
async function Photos() {
  const options = ParseCampaignArgs(["node", "x", "--campaign", "--stage-from=3", "--stage-to=6"]);
  options.suite = "FirstLevelTankProbe";
  const ctx = await OpenCampaign(options);
  const { page, output } = ctx;
  const W = FRONT_TANK_BRAIN_PATH.waypoints;
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
    // 驶出路弯（K6）：Space 路的 BendExit，从夺下的机枪座看（41 m，整车）。
    await Shot("DriveOut", { tankAt: index((w) => w.id === "BendExit"), player: { x: nest.x, z: nest.z + 1 }, look: 1.4, settleS: 0.3 });
    // 开炮尘环：Pressure 火力点从机枪座看是整车（31 m，炮口直视座位）。炮弹打在玩家身边 6 m 的土上。
    await Shot("CannonDust", { tankAt: index((w) => w.id === "Pressure"), player: { x: nest.x, z: nest.z + 1 }, look: 1.4, before: "fire" });
    await Shot("AttackSide", { tankAt: index((w) => w.kind === "block"), player: { x: FRONT_SORTIE.throw.x, z: FRONT_SORTIE.throw.z }, crouch: true, look: 1.2 });
    await Shot("Disabled", { tankAt: index((w) => w.kind === "block"), player: { x: FRONT_SORTIE.throw.x - 4, z: FRONT_SORTIE.throw.z + 3 }, look: 1.4, settleS: 4, before: "disable" });
    assert.deepEqual(ctx.errors, [], "no page errors while posing");
  } finally {
    await CloseCampaign(ctx);
  }
}

/**
 * 契约 §6 帧时间 / 音频节点：同一页里交替跑「大脑接管」(A) 与「旧的定时插值路径」(B，等同 brainEnabled=false)，
 * 每块 blockFrames 帧、交替 rounds 轮，量 StepFrames(1)+gl.finish() 的整帧耗时与 audio.liveNodes 峰值。
 * 两处：04 刚进来（车在火力点压阵位，≈ campaign 的 FirstBatchSafe 取样时刻）与 04 封口（车在封口点、区域目标换成缺口，
 * ≈ campaign 的 MachineGun 取样时刻）。开声音（menu=0）。只做记录，阈值断言在 §6（p95 ≤ 基线 ×1.2）。
 */
async function FrameAb() {
  const options = ParseCampaignArgs(["node", "x", "--campaign", "--stage-from=3", "--stage-to=6", "--audio"]);
  options.suite = "FirstLevelTankProbe";
  const ctx = await OpenCampaign(options);
  const { page, output } = ctx;
  const results = {};
  try {
    await Unlock(page);
    await page.evaluate(async () => { const g = window.Tengxian; await g.Debug.FirstLevelJump(4); g.player.TakeHit = () => {}; });
    const Measure = (label, rounds = 8, blockFrames = 30) => page.evaluate(({ rounds, blockFrames }) => {
      const g = window.Tengxian, R = g.Debug.FirstLevelMissionRuntime(), tr = R.tankRuntime, gl = g.renderer.getContext();
      const out = { A: [], B: [], nodesA: 0, nodesB: 0, tankMsA: [], stateA: null };
      const update = tr.Update.bind(tr);
      let tankMs = 0;
      tr.Update = (dt) => { const s = performance.now(); update(dt); tankMs = performance.now() - s; };
      for (let round = 0; round < rounds; round++) {
        for (const mode of round % 2 ? ["B", "A"] : ["A", "B"]) {
          R.tankRuntime = mode === "A" ? tr : null;
          if (mode === "B") tr.sound?.Stop();
          g.StepFrames(4, 1 / 60, true);   // 换路径的头几帧不算
          for (let i = 0; i < blockFrames; i++) {
            tankMs = 0;
            const start = performance.now(); g.StepFrames(1, 1 / 60, true); gl.finish();
            const ms = performance.now() - start;
            out[mode].push(ms);
            (out.frames ||= []).push({ mode, round, i, ms: +ms.toFixed(1), tankMs: mode === "A" ? +tankMs.toFixed(2) : null });
            if (mode === "A") out.tankMsA.push(tankMs);
            out["nodes" + mode] = Math.max(out["nodes" + mode], g.audio?.liveNodes ?? 0);
          }
        }
      }
      R.tankRuntime = tr; tr.Update = update;
      const Stats = (list) => { const s = [...list].sort((a, b) => a - b); return { n: s.length, p50: +s[Math.floor(s.length * 0.5)].toFixed(2),
        p95: +s[Math.floor(s.length * 0.95)].toFixed(2), mean: +(s.reduce((a, b) => a + b, 0) / s.length).toFixed(2) }; };
      // 最慢的 12 帧落在哪一块的第几帧（换路径的余波 vs 平稳段）。
      const slowest = [...out.frames].sort((a, b) => b.ms - a.ms).slice(0, 12);
      return { slowest, A: Stats(out.A), B: Stats(out.B), ratioP95: +(Stats(out.A).p95 / Stats(out.B).p95).toFixed(3),
        tankUpdateMsA: Stats(out.tankMsA), nodes: { A: out.nodesA, B: out.nodesB },
        tank: { state: R.tank.damageState, x: +R.tank.x.toFixed(1), z: +R.tank.z.toFixed(1), waypoint: R.tank.waypoint } };
    }, { rounds, blockFrames });
    // 04 刚进来：车走到火力点、开始压阵位。
    await page.evaluate(() => window.Tengxian.StepFrames(60 * 14, 1 / 60, false));
    results.MachineGunEntry = await Measure("MachineGunEntry");
    console.log("FRAME_AB MachineGunEntry", JSON.stringify(results.MachineGunEntry));
    // 04 封口：压住了阵位，车开到封口点，目标换成缺口。
    await page.evaluate(() => { const g = window.Tengxian, R = g.Debug.FirstLevelMissionRuntime();
      R.Record("tankPositionPressured", { probe: true }); g.StepFrames(60 * 16, 1 / 60, false); });
    results.MachineGunBlock = await Measure("MachineGunBlock");
    console.log("FRAME_AB MachineGunBlock", JSON.stringify(results.MachineGunBlock));
    await fs.writeFile(path.join(output, "Data_TankFrameAb.json"), JSON.stringify({ method: "same page, alternating A (brain) / B (legacy path) blocks of 30 frames × 8 rounds, StepFrames(1)+gl.finish(), audio on", results }, null, 2));
    assert.deepEqual(ctx.errors, [], "no page errors during the A/B");
  } finally {
    await CloseCampaign(ctx);
  }
}

if (frameAb) await FrameAb();
else {
  if (!photosOnly) await RunCampaign();
  if (photos || photosOnly) await Photos();
}
