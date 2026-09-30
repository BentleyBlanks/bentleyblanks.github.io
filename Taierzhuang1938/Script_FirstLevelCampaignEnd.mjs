// 第一关整关驾驶脚本 · 阶段 15–18（降压收拢 → 交接 → 老周死亡 → 浮桥与夜入滕城）。
// 归第二波 End 包；公共部分在 Script_FirstLevelCampaignKit.mjs。
//
// 2026.09.19 重构把 15 改成**无战斗**的降压段（收拢、换手抬运、找到接收处），
// 18 换成「接应回援尾队 → 奉令毁桥 → 夜入滕城」。旧驾驶脚本的撤退三连战
// （RetreatFirst/Wall/Yard）、接收院防御与从后门撤离整段已经对不上，全部删掉。
//
// 这一段全部走**正常输入**：走路、按 F 接担架、按 F 放担架、开枪压北岸土坎。
// 唯一的调试接口是段首的 JumpStage（只有 --stage-jumps 时才生效）。
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { MISSION_ANCHORS as A, MISSION_ROUTES } from "./Data_FirstLevelMissionLayout.mjs";
import { MISSION_STAGE_ROUTES, MISSION_RECEPTION_SPACE as Reception, RegroupGuideRoute } from "./Data_FirstLevelMissionTopology.mjs";
import { END_TUNING as E } from "./Data_Tuning_FirstLevelEnd.mjs";
import { MISSION_TUNING as R } from "./Data_Tuning_FirstLevel.mjs";
import { CampaignActions } from "./Script_FirstLevelCampaignKit.mjs";

/** 折线转成 Route 能吃的点串（去掉 yaw 之类的附加字段）。 */
const Points = route => route.map(point => ({ x: point.x, z: point.z }));
const Mission = page => page.evaluate(() => window.Tengxian.Debug.FirstLevelMission());

/**
 * 等某一条事实。**必须自己推帧**：整关驾驶跑在 `manual=1` 下，世界只有
 * `StepFrames` 推才走 —— 光 `page.waitForFunction` 轮询的话时间根本不动，
 * 等到天亮也等不来（第一次写成那样，18 卡在传令兵还没起步的那一帧）。
 */
async function WaitFact(page, factId, label, seconds = 120, { fight = false } = {}) {
  let facts = [];
  for (let chunk = 0; chunk < Math.ceil(seconds / 5); chunk += 1) {
    facts = await page.evaluate(({ factId, fight }) => {
      const g = window.Tengxian;
      for (let i = 0; i < 300; i += 1) {
        if (g.Debug.FirstLevelMission().facts.includes(factId)) break;
        const foe = fight ? window.MissionInputDriver?.Target(90) : null;
        if (foe) window.MissionInputDriver.Shoot(foe);
        else { g.Debug.Mouse(0, false); g.Debug.Mouse(2, false); }
        g.StepFrames(1, 1 / 60, false);
      }
      g.Debug.Mouse(0, false); g.Debug.Mouse(2, false);
      return g.Debug.FirstLevelMission().facts;
    }, { factId, fight });
    if (facts.includes(factId)) break;
  }
  assert.ok(facts.includes(factId), `${label}：等不到事实 ${factId}`);
  return facts;
}
/** 等受控演出（黑屏转场 / 死亡段）还回控制权。同样自己推帧。 */
async function WaitControl(page, label, seconds = 60) {
  for (let chunk = 0; chunk < Math.ceil(seconds / 5); chunk += 1) {
    const control = await page.evaluate(() => {
      const g = window.Tengxian;
      for (let i = 0; i < 300 && g.Debug.FirstLevelMission().control; i += 1) g.StepFrames(1, 1 / 60, false);
      return g.Debug.FirstLevelMission().control;
    });
    if (!control) return;
  }
  assert.fail(`${label}：受控演出没有还回控制权`);
}
/** 等一条现场对白实际播完；只推进世界，不伪造 finished 历史。 */
async function WaitVoiceFinished(page, cue, label, seconds = 60) {
  let voice = null;
  for (let chunk = 0; chunk < Math.ceil(seconds / 5); chunk += 1) {
    voice = await page.evaluate((cue) => {
      const g = window.Tengxian;
      for (let i = 0; i < 300; i += 1) {
        const state = g.Debug.FirstLevelMission().voice;
        if (state.finished.includes(cue)) return state;
        g.StepFrames(1, 1 / 60, false);
      }
      return g.Debug.FirstLevelMission().voice;
    }, cue);
    if (voice.finished.includes(cue)) return voice;
  }
  assert.fail(`${label}：对白 ${cue} 没有实际播完，现场 ${JSON.stringify(voice)}`);
}

// ---------------------------------------------------------------------------
// 18 对岸步坦部队（docs/Data_FirstLevelBridgeFarBank.md §7）：驾驶脚本的观测与断言工具
// ---------------------------------------------------------------------------
const FarBankState = page => page.evaluate(() => window.Tengxian.Debug.FirstLevelMission().end.farBank ?? null);
/**
 * 推帧到 `expr` 为真（fb = 对岸状态、m = 任务状态）。fight 时照常开火，射程放到 105 m：
 * 对岸机枪位离南岸射位约 90–100 m，默认 90 m 够不着。
 */
async function WaitUntil(page, label, expr, seconds, { fight = false } = {}) {
  // 基线树（没有对岸模块，A/B 帧耗时对照用同一份驾驶脚本）：这些等待整段跳过。
  if (!(await FarBankState(page))) { console.log("FARBANK_ABSENT", label); return; }
  let ok = false;
  for (let chunk = 0; chunk < Math.ceil(seconds / 5) && !ok; chunk += 1) {
    ok = await page.evaluate(({ expr, fight }) => {
      const g = window.Tengxian, test = new Function("fb", "m", `return ${expr};`);
      for (let i = 0; i < 300; i += 1) {
        const m = g.Debug.FirstLevelMission();
        if (test(m.end.farBank, m)) return true;
        const foe = fight ? window.MissionInputDriver?.Target(105) : null;
        if (foe) window.MissionInputDriver.Shoot(foe);
        else { g.Debug.Mouse(0, false); g.Debug.Mouse(2, false); }
        g.StepFrames(1, 1 / 60, false);
      }
      g.Debug.Mouse(0, false); g.Debug.Mouse(2, false);
      const m = g.Debug.FirstLevelMission();
      return test(m.end.farBank, m);
    }, { expr, fight });
    if (!ok) console.log("WAIT_DIAG", label, JSON.stringify(await page.evaluate(() => window.__farBankDiag?.() ?? null)));
  }
  assert.ok(ok, `${label}：等不到 ${expr}`);
}
/** 整趟里玩家掉血与开火的记录（每次 StepFrames 之后采样）：验收「玩家不会被隔河秒掉」与「BridgeCover 打得下来」。 */
async function InstallFarBankProbe(page) {
  await page.evaluate(() => {
    const g = window.Tengxian, p = g.player;
    if (window.__farBankProbe) return;
    const probe = window.__farBankProbe = {
      hp: { start: p.health, min: p.health, lost: 0, hits: 0, last: p.health, maxSuppression: 0, log: [] },
      shots: { fired: 0, soldier: 0, wall: 0, none: 0, farSoldier: 0, maxSoldierDistM: 0 }, last: g.state.playerShots,
    };
    // 卡住时的现场（WaitUntil 每 5 s 报一次）：尾队的进度与对岸单位的位置。
    window.__farBankDiag = () => {
      const m = g.Debug.FirstLevelMission();
      return { stage: m.stage, time: Number(m.time.toFixed(0)), hp: p.health, column: m.bridgeColumn.map((e) => `${e.id}:${e.progress}${e.crossed ? "X" : ""}${e.pinned ? "P" : ""}${e.alive ? "" : "dead"}`),
        vanguard: g.ai.soldiers.filter((s) => s.farBank && s.alive && (s.farBank === "shore" || s.farBank === "vanguard") && s.position.z > 92).map((s) => `${s.missionId}@${s.position.x.toFixed(1)},${s.position.z.toFixed(1)}`),
        facts: m.facts.filter((f) => /^(southBank|bridgeFire|rearColumn)/.test(f)) };
    };
    const step = g.StepFrames.bind(g);
    g.StepFrames = (...args) => {
      const result = step(...args);
      const h = p.health;
      if (h < probe.hp.last - 0.01) {
        probe.hp.hits += 1; probe.hp.lost += probe.hp.last - h;
        if (probe.hp.log.length < 40) probe.hp.log.push({ t: Number(g.Debug.FirstLevelMission().time.toFixed(1)), stage: g.Debug.FirstLevelMission().stage, lost: Number((probe.hp.last - h).toFixed(1)), hp: Number(h.toFixed(1)), stance: p.stance });
      }
      probe.hp.last = h; probe.hp.min = Math.min(probe.hp.min, h);
      probe.hp.maxSuppression = Math.max(probe.hp.maxSuppression, p.suppression || 0);
      if (g.state.playerShots > probe.last) {
        probe.last = g.state.playerShots;
        const shot = g.state.lastShot;
        probe.shots.fired += 1;
        if (shot) {
          probe.shots[shot.hitKind] = (probe.shots[shot.hitKind] || 0) + 1;
          if (shot.hitKind === "soldier") { probe.shots.maxSoldierDistM = Math.max(probe.shots.maxSoldierDistM, shot.dist || 0); if ((shot.dist || 0) > 70) probe.shots.farSoldier += 1; }
        }
      }
      return result;
    };
  });
}
const FarBankProbe = page => page.evaluate(() => JSON.parse(JSON.stringify(window.__farBankProbe ?? null)));
/** 连推 n 帧（带渲染与 gl.finish）取帧耗时中位数与 p95，另报 draw / 三角形（A/B 对照用，无对岸模块的基线树同样能跑）。 */
async function FrameTiming(page, label, frames = 24) {
  const timing = await page.evaluate((frames) => {
    const g = window.Tengxian, gl = g.renderer.getContext(), samples = [];
    for (let i = 0; i < frames + 4; i += 1) {
      const start = performance.now(); g.StepFrames(1, 1 / 60, true); gl.finish();
      if (i >= 4) samples.push(performance.now() - start);
    }
    samples.sort((a, b) => a - b);
    const rinfo = g.renderer.info, wasReset = rinfo.autoReset; rinfo.autoReset = false; rinfo.reset(); g.StepFrames(1, 1 / 60, true); const info = { calls: rinfo.render.calls, triangles: rinfo.render.triangles }; rinfo.autoReset = wasReset;
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    return { p50: Number(samples[Math.floor(samples.length / 2)].toFixed(2)), p95: Number(samples[Math.floor(samples.length * 0.95)].toFixed(2)),
      mean: Number(mean.toFixed(2)), drawCalls: info.calls, triangles: info.triangles };
  }, frames);
  console.log("FARBANK_FRAME", label, JSON.stringify(timing));
  return timing;
}
/** 只推世界，不动玩家（对照树与本树在同一个游戏时间点量帧耗时用）。 */
const StepSeconds = (page, seconds) => page.evaluate((seconds) => {
  const g = window.Tengxian;
  for (let i = 0; i < Math.round(seconds * 60); i += 1) g.StepFrames(1, 1 / 60, false);
}, seconds);
/** 玩家换个姿态原地看对岸拍一张（拍完姿态与视线原样还回去）。 */
async function CaptureLook(page, CaptureFocus, name, point, stance = null) {
  const before = stance ? await page.evaluate((s) => { const p = window.Tengxian.player, was = p.stance; p.SetStance(s); return was; }, stance) : null;
  await CaptureFocus(name, point);
  if (before) await page.evaluate((s) => window.Tengxian.player.SetStance(s), before);
}

/**
 * 阶段 15–18，走到 Complete。
 *
 * 分段起点：`--stage-from=15` 从降压段开始，`--stage-from=18` 只跑桥与夜入城。
 * 每一段用 `ctx.stageFrom <= n` 把门 —— 不这样的话 `--stage-from=18` 会先跳回 15，
 * 收尾那条「跳转回执 = [stageFrom..18]」的断言当场就红。
 */
export async function Drive(ctx) {
  const { page, output } = ctx;
  const { JumpStage, Capture, CaptureFocus, Route, Interact, InteractProbe, WaitStage } = CampaignActions(ctx);
  const from = ctx.stageFrom;

  if (from <= 15) await DriveRegroup(ctx, { JumpStage, Capture, CaptureFocus, Route, Interact, InteractProbe, WaitStage });
  if (from <= 16) await DriveHandover(ctx, { JumpStage, Capture, Route, Interact, InteractProbe, WaitStage });
  if (from <= 17) await DriveDeath(ctx, { JumpStage, Capture, WaitStage });
  await DriveBridge(ctx, { JumpStage, Capture, CaptureFocus, Route, WaitStage });

  await Capture("Complete");
  assert.equal(await page.evaluate(() => window.Tengxian.Debug.FirstLevelMission().stage), "Complete");
  void output;
}

/** 15A/15B/15C：收拢 → 换手抬运沿墙缓行 → 院门与入院。全程无敌人。 */
async function DriveRegroup(ctx, { JumpStage, Capture, CaptureFocus, Route, Interact, InteractProbe, WaitStage }) {
  const { page, output } = ctx;

  // --- 15A 沟口收拢：无战斗。队伍重新成形、队首走起来 ------------------------
  await JumpStage(15);
  await Route([{ x: A.ditch.x + 6, z: A.ditch.z }, { x: A.ditch.x, z: A.ditch.z }],
    "RegroupDitchMouth", { fight: true });
  {
    const shot = await Mission(page);
    assert.equal(shot.stage, "Regroup");
    // 警戒兵真的在车路方向站着（15A 的追兵由他们接住，玩家不进新一轮守波次）。
    const picket = shot.end.extras.filter(entry => /^Picket/.test(entry.id));
    assert.equal(picket.length, 3, "转运点的三个警戒兵是真人实体：" + JSON.stringify(picket));
    assert.ok(picket.every(entry => entry.x > A.retreatA.x), "他们站在收拢点与车路之间");
    await CaptureFocus("RegroupPicket", picket[0]);
  }
  // 顺子先拐到车边问一句「车还走得了不」——沿沟走（直线会横切沟壁）。
  // **这一步排在收拢之前**：赶车人在沟口，离收拢点 28 m；点名一完，litterRemanned /
  // columnMoving 紧跟着就齐，15A 几秒内换步，再回头就来不及了（实拍 2026-09-20）。
  await Route([{ x: 47, z: 114 }, { x: E.droverPost.x + 2.4, z: E.droverPost.z + 1.2 }],
    "RegroupDrover", { fight: true });
  // A continuous 14->15 run can still be playing ZhouCheck at this point.
  // Approaching the drover queues CartAbandon; remain here until the real voice
  // completes instead of treating an admitted, queued exchange as a missing cue.
  await WaitVoiceFinished(page, "CartAbandon", "15A 车边询问赶车人", 90);
  {
    const shot = await Mission(page);
    assert.ok(shot.voice.played.includes("CartAbandon"), "顺子走到车边真的问过赶车人");
  }
  // 跟着带路走到收拢点，再等对白（幺娃走到担架边检查、何有田挨个点人）。
  // 带路线到收拢点为止（RegroupGuideRoute），队伍就停在这儿，点名的 16 m 才凑得齐。
  const enemiesBefore = (await Mission(page)).enemies.length;
  await Route([{ x: 47, z: 114 }, ...Points(RegroupGuideRoute("Regroup").slice(1))],
    "RegroupRally", { fight: true });
  await WaitFact(page, "headcountDone", "15A 点名", 300, { fight: true });
  {
    const shot = await WaitStage("WallPath", 300, { fight: true });
    const facts = shot.mission.facts;
    for (const id of ["survivorsSheltered", "litterRemanned", "columnMoving", "picketHolding", "zhouChecked", "headcountDone"])
      assert.ok(facts.includes(id), `15A 缺事实 ${id}：${JSON.stringify(facts.slice(-12))}`);
    // 15A 全程不许冒出新的敌人（降压段无战斗）。
    assert.ok(shot.mission.enemies.length <= enemiesBefore,
      `降压段不许生成新敌人：${enemiesBefore} → ${shot.mission.enemies.length}`);
  }

  // --- 15B 换手抬运，沿墙缓行 ------------------------------------------------
  // 先沿撤离线从收拢点南下到夹道口（(32,134)→(50,150)→(56,165)→(56,184)→(56,207)）；
  // 直接连 wallPath 的第一点会横切整条沟。后抬手撑到 carrySwapProgressM 才撒手。
  await Route(Points(MISSION_ROUTES.evacuation.slice(2, 7)), "WallPathEnter", { fight: false });
  await WaitFact(page, "carrySwapOffered", "15B 换手", 180);
  {
    const zhou = await page.evaluate(() => {
      const litter = window.Tengxian.Debug.FirstLevelMission().column.litters.find(entry => entry.zhou);
      return { x: litter.x + Math.sin(litter.yaw) * 1.6, z: litter.z + Math.cos(litter.yaw) * 1.6 };
    });
    await Route([zhou], "WallPathSwapPickup");
    const probe = await InteractProbe("WallPathSwap");
    await Interact();
    assert.equal(await page.evaluate(() => window.Tengxian.carry.KindId), "stretcher",
      "顺子按 F 真的接过了老周担架后端：" + JSON.stringify(probe));
  }
  await Capture("WallPathCarry");
  // 过坎 → 幺娃说手抖。先走到静默段前 1 m，再排入一条真实的带路短命令；跨进
  // 静默段后编排会取消 guidance（不碰剧情对白），随后慢行满 14 m 到夹道尽头。
  const quietProbe = await page.evaluate(async ({ progress }) => {
    const g = window.Tengxian, r = g.Debug.FirstLevelMissionRuntime();
    const { EndRoutePoint } = await import("./Script_FirstLevelEndCast.mjs");
    const { MISSION_STAGE_ROUTES } = await import("./Data_FirstLevelMissionTopology.mjs");
    const point = EndRoutePoint(MISSION_STAGE_ROUTES.wallPath, progress);
    return { x: point.x, z: point.z };
  }, { progress: E.silenceFromProgressM - 1 });
  await Route([...Points(MISSION_STAGE_ROUTES.wallPath.slice(1, 3)), quietProbe], "WallPathBeforeQuiet");
  const guidance = ctx.options.quietGuidanceInterruptProbe
    ? await page.evaluate(() => {
      const g = window.Tengxian, r = g.Debug.FirstLevelMissionRuntime();
      for (let i = 0; i < 900 && r.voice.current; i += 1) g.StepFrames(1, 1 / 60, false);
      const cue = r.leaderGuide?.View()?.cue;
      return { cue, started: !!cue && r.voice.Guidance(cue) };
    })
    : await page.evaluate(() => {
      const r = window.Tengxian.Debug.FirstLevelMissionRuntime();
      return { cue: r.leaderGuide?.View()?.cue || null, started: false };
    });
  if (ctx.options.quietGuidanceInterruptProbe) {
    assert.ok(guidance.started && /^Guide/.test(guidance.cue),
      `静默段前要能排入一条合法带路短命令：${JSON.stringify(guidance)}`);
    console.log("QUIET_GUIDANCE_INTERRUPT", JSON.stringify(guidance));
  } else console.log("QUIET_GUIDANCE_OBSERVED", JSON.stringify(guidance));
  await Route(Points(MISSION_STAGE_ROUTES.wallPath.slice(3)), "WallPathToGate");
  {
    const shot = await Mission(page);
    for (const id of ["carryHandover", "roadBumpCrossed", "stragglersTended"])
      assert.ok(shot.facts.includes(id), `15B 缺事实 ${id}`);
    assert.ok(shot.voice.played.includes("RoadBump") && shot.voice.played.includes("HandsShake"),
      "过坎与手抖两段都真的说了");
    const quiet = shot.log.find(entry => entry.id === "quietWalkObserved");
    assert.ok(quiet && quiet.detail.distanceM >= E.silenceWalkM,
      `夹道末段要有一整段无对白行走，实际 ${JSON.stringify(quiet?.detail)}`);
    await fs.writeFile(path.join(output, "Data_QuietWalk.json"), JSON.stringify(quiet, null, 2));
  }

  // --- 15C 院门：先拦 → 确认身份 → 接收人员指位置 → 伤员真的往里走 ------------
  // 夹道最后一点就是院门，上面那条路线已经把人送到门口了，不再往回走。
  await WaitStage("ReceptionGate", 180);
  {
    const held = await page.evaluate(() => {
      const mission = window.Tengxian.Debug.FirstLevelMission();
      return { mode: mission.column.mode, challenged: mission.facts.includes("gateChallenged") };
    });
    assert.notEqual(held.mode, "reception", "身份没确认以前伤员不许往院里走");
    await Capture("ReceptionGateChallenge");
  }
  await WaitStage("Handover", 300);
  {
    const shot = await Mission(page);
    for (const id of ["gateChallenged", "receptionAccepted", "woundedEntering"])
      assert.ok(shot.facts.includes(id), `15C 缺事实 ${id}`);
    assert.ok(shot.voice.played.includes("WardGuide"), "刘文财在院里招呼担架跟他走");
  }

}

/** 16 完成交接：过门槛、军医指位置、放下担架、分派。 */
async function DriveHandover(ctx, { JumpStage, Capture, Route, Interact, InteractProbe, WaitStage }) {
  const { page } = ctx;
  await JumpStage(16);
  {
    // 跳进 16 时老周还在院门口那副担架上：走过去接手，抬进厢房。
    const carrying = await page.evaluate(() => window.Tengxian.carry.KindId === "stretcher");
    if (!carrying) {
      const pickup = await page.evaluate(() => {
        const litter = window.Tengxian.Debug.FirstLevelMission().column.litters.find(entry => entry.zhou);
        return { x: litter.x + Math.sin(litter.yaw) * 1.6, z: litter.z + Math.cos(litter.yaw) * 1.6 };
      });
      await Route([pickup], "HandoverPickup");
      await InteractProbe("HandoverPickup");
      await Interact();
    }
    assert.equal(await page.evaluate(() => window.Tengxian.carry.KindId), "stretcher");
  }
  // 厢房南门的门槛在 z=243：要往 z 更小的方向跨进去，落点是放置点本身。
  await Route([{ x: Reception.yardJunction.x, z: Reception.yardJunction.z },
    { x: Reception.wardExit.x, z: Reception.wardExit.z },
    { x: Reception.wardThreshold.x, z: Reception.wardThreshold.z + 1.5 },
    { x: A.zhouDrop.x, z: A.zhouDrop.z }], "HandoverThreshold");
  {
    let shot = await Mission(page);
    assert.ok(shot.facts.includes("thresholdCrossed"), "过了厢房门槛");
    await WaitVoiceFinished(page, "Threshold", "16 老周过门槛最后一句", 90);
    shot = await Mission(page);
    assert.ok(shot.voice.finished.includes("Threshold"), "「脚……慢点」已在现场实际播完");
    await Capture("HandoverThreshold");
  }
  // 军医先指位置（PlaceLitter），喊出口才允许按 F。
  await WaitFact(page, "placeOrderHeard", "16 军医指位置", 180);
  {
    const played = (await Mission(page)).voice.played;
    assert.ok(played.indexOf("Threshold") >= 0 && played.indexOf("Threshold") < played.indexOf("PlaceLitter"),
      `现场对白必须先 Threshold 后 PlaceLitter：${JSON.stringify(played)}`);
  }
  await Route([{ x: A.zhouDrop.x - 0.8, z: A.zhouDrop.z + 0.6 }], "HandoverPlace");
  const placeProbe = await InteractProbe("HandoverPlace");
  await Interact();
  {
    const shot = await Mission(page);
    assert.ok(shot.facts.includes("zhouPlaced"), "玩家与前抬手一起把老周放下了：" + JSON.stringify(placeProbe));
    assert.equal(shot.emptyHands, false, "放下担架之后恢复正常持枪");
    assert.equal(await page.evaluate(() => window.Tengxian.carry.Active), false);
    await Capture("HandoverPlaced");
  }
  await WaitStage("Death", 420);
  {
    const shot = await Mission(page);
    for (const id of ["medicExamining", "squadAssigned", "squadDispersed"])
      assert.ok(shot.facts.includes(id), `16 缺事实 ${id}`);
  }

}

/** 17 确认老周死亡：第一人称、不判失败、接收处继续工作。 */
async function DriveDeath(ctx, { JumpStage, Capture, WaitStage }) {
  const { page, output } = ctx;
  await JumpStage(17);
  // 死亡段是第一人称、不切尸体特写：在受控演出**还挂着**的时候留一张。
  const deathControl = await page.evaluate(() => {
    const g = window.Tengxian;
    for (let i = 0; i < 240 && !g.Debug.FirstLevelMission().control; i += 1) g.StepFrames(1, 1 / 60, false);
    const runtime = g.Debug.FirstLevelMissionRuntime();
    const observedAt = runtime.time, observedElapsed = runtime.controls?.time || 0;
    // JumpStage 或自然入场可能在本轮观察到 control 以前已经推进过若干帧；
    // controls.time 是受控段自己的实际时钟，用它反推起点，不能拿观察时刻冒充起点。
    const startedAt = observedAt - observedElapsed;
    for (let i = 0; i < 180 && g.Debug.FirstLevelMission().control; i += 1) g.StepFrames(1, 1 / 60, false);
    return { startedAt, observedAt, observedElapsed, previewAt: g.Debug.FirstLevelMission().time,
      control: g.Debug.FirstLevelMission().control };
  });
  assert.equal(deathControl.control, "death", "床边第一人称截图发生在 death 控制段内");
  await Capture("DeathFirstPerson");
  await WaitControl(page, "17 老周死亡段", R.deathSeconds + 10);
  Object.assign(deathControl, await page.evaluate(() => {
    const mission = window.Tengxian.Debug.FirstLevelMission();
    return { endedAt: mission.time, voiceFinished: mission.voice.finished.includes("ZhouDeath") };
  }));
  deathControl.durationS = deathControl.endedAt - deathControl.startedAt;
  assert.ok(deathControl.durationS >= R.deathSeconds - 1 / 30,
    `17 death 控制段要实际走满 ${R.deathSeconds}s，实际 ${deathControl.durationS.toFixed(3)}s`);
  assert.ok(deathControl.voiceFinished, "death 控制归还时 ZhouDeath 七句已经实际播完");
  await fs.writeFile(path.join(output, "Data_DeathControl.json"), JSON.stringify(deathControl, null, 2));
  await WaitStage("BridgeOrders", 420);
  {
    const shot = await Mission(page);
    assert.ok(shot.facts.includes("deathSceneComplete"), "死亡确认完成");
    assert.equal(shot.failed, false, "老周死亡不判全关失败");
    assert.ok(shot.voice.played.includes("NextLitter"), "门外又抬来伤员，接收处继续工作");
    assert.ok(shot.end.reception.death.treating, "军医转过去救下一个");
    const yaowa = await page.evaluate(() => {
      const actor = window.Tengxian.Debug.FirstLevelMissionRuntime().companion.Handle("yaowa");
      return { hideWeapon: !!actor?.missionHideWeapon, reach: actor?.missionReach || 0,
        noncombatant: !!actor?.scriptedNoncombatant, weaponVisible: actor?.actor?.weaponGroup?.visible !== false };
    });
    assert.deepEqual(yaowa, { hideWeapon: false, reach: 0, noncombatant: false, weaponVisible: true },
      "18 接令前要还回幺娃的步枪与正常战斗状态");
    await fs.writeFile(path.join(output, "Data_DeathScene.json"), JSON.stringify(shot.end.reception, null, 2));
    await Capture("NextLitter");
  }

}

/** 18 接应回援尾队、奉令毁桥、夜入滕城。 */
async function DriveBridge(ctx, { JumpStage, Capture, CaptureFocus, Route, WaitStage }) {
  const { page, output } = ctx;
  await JumpStage(18);
  await InstallFarBankProbe(page);
  const FAR_BANK_LOOK = { x: A.railBridge.x, z: 86, height: 1.4 };   // 对岸人堆的中心（岸线一带）
  {
    // 传令兵真人跑进接收处，跑到跟前才开口。
    const before = await Mission(page);
    assert.ok(!before.facts.includes("bridgeOrdersHeard"), "刚进 18 还没接到令");
    await WaitFact(page, "bridgeRunnerArrived", "18 传令兵跑到接收处", 180);
    const runner = (await Mission(page)).end.extras.find(entry => entry.id === "BridgeRunner");
    assert.ok(runner && runner.alive, "传令兵是真人实体");
    await CaptureFocus("BridgeRunner", runner);
    await WaitFact(page, "bridgeOrdersHeard", "18 接令", 180);
    assert.ok((await page.locator("#hud").innerText()).includes("浮桥"),
      "HUD 目标更新为「掩护回援分队通过浮桥」");
  }
  // 连续16/17可能仍站在床边；先经厢房南门，不能直接朝院墙后门穿过房墙。
  const insideWard = await page.evaluate(ward => {
    const position = window.Tengxian.player.position;
    return position.x > ward.minX && position.x < ward.maxX
      && position.z > ward.minZ && position.z < ward.maxZ;
  }, Reception.ward);
  if (insideWard) await Route(Points(MISSION_ROUTES.reception.slice(-2).reverse()), "WardToCourtyard");
  // 沿 toBridge 到南岸射位。
  await Route(Points(MISSION_STAGE_ROUTES.toBridge), "BridgeToCover", { fight: true });
  await WaitStage("BridgeCover", 120, { fight: true });
  {
    const shot = await Mission(page);
    assert.ok(shot.facts.includes("southBankReached"), "到了南岸遮挡后的射位");
    const column = shot.bridgeColumn;
    assert.equal(column.length, 6, "回援尾队是六个真人");
    // Notion 明说「有人可能中弹」：不要求一个不少，只要求这还是一支队伍。
    assert.ok(column.filter(entry => entry.alive).length >= 4,
      "北岸火力下尾队还成队：" + JSON.stringify(column.map(entry => entry.alive)));
    assert.ok(column.some(entry => entry.load === "mg") && column.filter(entry => entry.load === "mortar").length === 2,
      "尾队带着机枪与两人抬的迫击炮部件");
    assert.ok(column.every(entry => !entry.crossed), "火力没打断以前一个人都没过桥");
    // 拍尾队要给**世界坐标**。bridgeColumn 那张表只有 id/进度/死活，没有 x/z ——
    // 原来直接把它传给 CaptureFocus，视角被算成 NaN（口径见 Kit 里 CaptureFocus 的头注）。
    const lead = shot.end.extras.find(entry => entry.id === column[0].id);
    assert.ok(lead && Number.isFinite(lead.x), "尾队队首是真人实体，取得到世界坐标");
    await CaptureFocus("BridgeRearColumn", lead);
  }
  // 压住北岸土坎的火力（真开枪；不要求杀光）。
  await page.evaluate(() => { window.MissionInputDriver.blocked.clear(); });
  // 对岸大部队（2026-09-30）：BridgeCover 起就看得见 —— 第一拨（岸线 12 + 待命 10）陆续走到位，战车开进来。
  // 站在射位上一边打土坎一边等（fight），到位之后站 / 蹲各拍一张。
  await WaitUntil(page, "18 对岸第一拨到位", "fb.shore + fb.standby >= 20", 120, { fight: true });
  const fbCover = await FarBankState(page);
  if (fbCover) {
    const fb = fbCover;
    console.log("FARBANK_COVER", JSON.stringify({ shore: fb.shore, standby: fb.standby, real: fb.real, ija: fb.ijaCount, tier: fb.tier, dz: fb.dz, tanks: fb.tanks, ambient: fb.ambientActive }));
    assert.ok(fb.started && fb.shore + fb.standby >= 20, `BridgeCover 起对岸就有人：${JSON.stringify({ shore: fb.shore, standby: fb.standby })}`);
    assert.equal(fb.real, 0, "真 AI（8 个）BridgeWithdraw 才放出");
    assert.ok(fb.tanks.some(tank => tank.state !== "queued"), "战车已经开进来");
    assert.ok(fb.ijaCount <= fb.ijaCap, `同屏日军 ${fb.ijaCount} ≤ ${fb.ijaCap}`);
    await CaptureLook(page, CaptureFocus, "FarBankCoverStand", FAR_BANK_LOOK, "stand");
    await CaptureLook(page, CaptureFocus, "FarBankCoverCrouch", FAR_BANK_LOOK, "crouch");
  }
  await WaitUntil(page, "18 战车停到岸边", "fb.tanks.filter(t => t.state === 'posted').length >= 2", 90, { fight: true });
  // 站在射位上真开枪压住土坎（不要再走路线：Route 的 fight 循环一看见敌人就松开
  // 前进键，脚下不动就被判成「这条路走不通」）。打断之后尾队自己过桥。
  await WaitFact(page, "bridgeFireBroken", "18 打断北岸火力", 420, { fight: true });
  if (fbCover) {
    // 打断之后：前锋冲上桥北段追尾队，T3 进场。
    await WaitUntil(page, "18 前锋冲上桥", "fb.vanguard >= 1 || m.stage !== 'BridgeCover'", 60, { fight: true });
    const fb = await FarBankState(page);
    console.log("FARBANK_BROKEN", JSON.stringify({ vanguard: fb.vanguard, tanks: fb.tanks.map(t => t.id + ":" + t.state), mg: fb.mg }));
    await CaptureFocus("FarBankVanguard", { x: A.railBridge.x, z: 100, height: 1.2 });
  }
  await WaitUntil(page, "18 尾队过桥", "m.stage !== 'BridgeCover'", 300, { fight: true });
  await WaitStage("BridgeWithdraw", 420, { fight: true, cover: true });
  {
    const shot = await Mission(page);
    assert.ok(shot.facts.includes("bridgeFireBroken") && shot.facts.includes("rearColumnCrossed"),
      "威胁解除之后尾队真的通过了浮桥");
    const alive = shot.enemies.filter(actor => /^BridgeNorth/.test(actor.id) && actor.alive).length;
    console.log("BRIDGE_NORTH_ALIVE", alive, "（玩家不承担杀光所有敌军）");
    await Capture("BridgeCrossed");
  }
  // 退到南岸掩护区；爆破区里还有人的时候不许炸。
  // 退之前先报一次"现在能不能走"。这一段以前挂着「八方向试探 + 检查点恢复」两重兜底 ——
  // 实拍 2026-09-20 查清了：人走不动不是玩法（胶囊扫掠八个方向都是通的、自己人也没挡），
  // 是驾驶器自己把玩家的 yaw/pitch 写成了 NaN（CaptureFocus 收到一个没有 x/z 的状态对象），
  // 拍照那几帧 player.Update 把 velocity 也算成 NaN，从此谁也走不动。
  // 根因在 Kit 的 CaptureFocus（现在会翻红），兜底整段删掉：**真人玩家不会去点「继续检查点」**。
  console.log("WITHDRAW_START", JSON.stringify(await page.evaluate(() => {
    const g = window.Tengxian, p = g.player;
    return { running: g.state.running, control: g.state.missionControl, stance: p.stance,
      alive: p.alive, position: { ...p.position }, yaw: Number(p.yaw.toFixed(2)),
      velocity: { x: p.velocity.x, z: p.velocity.z },
      overlap: g.physics.Overlaps(p.position.x, p.position.y + 0.04, p.position.z, p.radius, 1.78),
      carry: g.carry.KindId, cutscene: g.state.cutscene, menu: g.state.menu,
      slot: g.state.activeSlot, busy: !!p.Busy, mounted: !!g.emplacement?.Mounted,
      meleeActive: !!g.meleeCombat?.Active, meleeBlocking: !!g.meleeCombat?.Blocking,
      crowd: g.ai.soldiers.filter(a => a.alive && Math.hypot(a.position.x - p.position.x, a.position.z - p.position.z) < 4)
        .map(a => ({ id: a.missionId || a.castId || a.id, side: a.side,
          d: Number(Math.hypot(a.position.x - p.position.x, a.position.z - p.position.z).toFixed(2)) })) };
  })));
  // NaN 会一路传染而且没有任何报错，所以在这儿钉一道闸：撤退起步时玩家的速度必须是数。
  {
    const finite = await page.evaluate(() => {
      const v = window.Tengxian.player.velocity;
      return Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
    });
    assert.ok(finite, "撤退起步时玩家速度必须是有限数（NaN 一旦混进来，八个方向都走不动）");
  }
  // 对岸：BridgeWithdraw 起真 AI 8 个与第二拨走到岸边、冲桥组起跑。玩家在射位上原地等 20 s（不蹲不打：这也是「站在
  // 射位上挨对岸火力」的实测，掉血记录在 probe 里），再量这一刻的帧耗时并拍站 / 蹲两张。基线树没有对岸，同样等 20 s。
  await StepSeconds(page, 20);
  const fbW = await FarBankState(page);
  if (fbW) {
    await WaitUntil(page, "18 真 AI 与第二拨到位", "fb.real >= 8 && fb.shore >= 16", 60);
    const fb = await FarBankState(page);
    console.log("FARBANK_WITHDRAW", JSON.stringify({ real: fb.real, shore: fb.shore, standby: fb.standby, rush: fb.rush, rushState: fb.rushState, rushUnits: fb.rushUnits, ija: fb.ijaCount, tier: fb.tier, tanks: fb.tanks, shells: fb.shells, mg: fb.mg }));
    assert.equal(fb.real, 8, "BridgeWithdraw 放出 8 个真 AI");
    assert.ok(fb.rushState?.started, "冲桥组起跑");
    assert.ok(fb.ijaCount <= fb.ijaCap, `同屏日军 ${fb.ijaCount} ≤ ${fb.ijaCap}（actorPool ija 预建 48）`);
    // 规模感（R2b，docs §10）：纯视觉人群 ≥ 200 个在场（不占 ija 池）；三辆战车都在位，桥面上那辆停在桥中孔（z 112…126）。
    console.log("FARBANK_CROWD_WITHDRAW", JSON.stringify(fb.crowd));
    assert.ok(fb.crowd && fb.crowd.onField >= 200 && fb.crowd.flags >= 10, `BridgeWithdraw 起视觉人群 ${fb.crowd?.onField} ≥ 200、旗 ${fb.crowd?.flags}`);
    assert.equal(fb.tanks.length, 3, "三辆傀儡战车");
    assert.ok(fb.tanks.filter(t => !/Bridge$/.test(t.id)).every(t => t.state === "posted"), `岸边两辆到位：${fb.tanks.map(t => t.id + ":" + t.state)}`);
    // 桥面上那辆：BridgeCover 全程等在桥头以北（不堵尾队过桥），BridgeWithdraw（尾队过完）后沿桥轴开上桥中孔的桥面。
    const bridgeTank = fb.tanks.find(t => /Bridge$/.test(t.id));
    assert.ok(bridgeTank && bridgeTank.z >= 72 && bridgeTank.z <= 79 && Math.abs(bridgeTank.x + 77) > 9, `岸边那辆停在北岸浮桥头东侧的空地上（x ${bridgeTank?.x}，z ${bridgeTank?.z}）`);
    await CaptureLook(page, CaptureFocus, "FarBankWithdrawStand", FAR_BANK_LOOK, "stand");
    await CaptureLook(page, CaptureFocus, "FarBankWithdrawCrouch", FAR_BANK_LOOK, "crouch");
  }
  await FrameTiming(page, "BridgeWithdrawSurge");

  // 撤是撤，不是边退边打：fight 会让 Route 一看见残敌就停下开枪，走不到掩护区。
  // 末段绕过 BlastSafeBank 那道 1.35 m 的土坎西头（(−69.5..−62.5, z≈197.5)），
  // 别贴着它的角走。
  await Route([...Points(MISSION_STAGE_ROUTES.bridgeWithdraw.slice(0, -1)),
    { x: -73, z: 201.5 }, { x: A.blastSafe.x, z: A.blastSafe.z }],
  "BridgeWithdrawToSafe", { fight: false });
  {
    const shot = await Mission(page);
    assert.ok(shot.facts.includes("blastZoneCleared"), "玩家退到了南岸掩护区");
    // 「爆破区里还有己方就一直等」这条规则由 Script_FirstLevelEndTest 逐条守着；
    // 实机这一趟只记录它这次等没等 —— 人撤得快的时候可以一次都不用等。
    const held = shot.log.find(entry => entry.id === "blastHeldForFriendly");
    console.log("BLAST_HELD", JSON.stringify(held?.detail ?? null));
  }
  // 爆破迟迟不炸的时候，必须说得出「**是谁**还在爆破区里」——
  // 光一句「等不到 bridgeDestroyed」查不出任何东西（那条规则本来就是「有人就一直等」）。
  {
    let held = null;
    for (let chunk = 0; chunk < 48 && !held?.fired; chunk += 1) {
      held = await page.evaluate(() => {
        const g = window.Tengxian, r = g.Debug.FirstLevelMissionRuntime();
        for (let i = 0; i < 300 && !r.flow.facts.has("bridgeDestroyed"); i += 1) g.StepFrames(1, 1 / 60, false);
        const inside = r.bridge.BlastZoneOccupant();
        return { fired: r.flow.facts.has("bridgeDestroyed"), blast: r.bridge.State().blast,
          inside: inside && { who: inside.who, distanceM: Number(inside.distance.toFixed(1)) } };
      });
      if (!held.fired) console.log("BLAST_WAIT", JSON.stringify(held));
    }
    assert.ok(held.fired, "18 爆破：等不到 bridgeDestroyed —— " + JSON.stringify(held));
  }
  await FrameTiming(page, "BridgeBlastFire", 12);
  await Capture("BridgeBlast");
  const fbBlast = await FarBankState(page);
  if (fbBlast) {
    // 起爆时桥上有正冲过来的日军（ReadyForBlast 等冲桥组到位才放行），被炸死抛起；跟着那一孔落河、落河后移除。
    console.log("FARBANK_BLAST", JSON.stringify({ blast: fbBlast.blast, rush: fbBlast.rushState, alive: fbBlast.alive, real: fbBlast.real }));
    console.log("FARBANK_RUSH_AT_BLAST", JSON.stringify({ rush: fbBlast.rushState, units: fbBlast.rushUnits }));
    assert.ok(fbBlast.rushState?.settled, `冲桥组放行了起爆器：${JSON.stringify(fbBlast.rushState)}`);
    await CaptureFocus("FarBankBlastBridge", { x: A.railBridge.x, z: A.railBridge.z, height: 1.5 });
    await StepSeconds(page, 3);
    const fb3 = await FarBankState(page);
    console.log("FARBANK_BLAST3S", JSON.stringify({ blast: fb3.blast, blastKilled: fb3.blastKilled, alive: fb3.alive, removed: fb3.removed, bank: fb3.bank }));
    assert.ok(fb3.blast?.done && fb3.blastKilled >= 3, `桥上的日军被炸死了 ${fb3.blastKilled} 个（冲桥组 6）`);
    await FrameTiming(page, "BridgeBlast+3s");
    await CaptureFocus("FarBankBlast3s", { x: A.railBridge.x, z: A.railBridge.z, height: 1.5 });
  }
  {
    const blast = await page.evaluate(() => {
      const g = window.Tengxian, mission = g.Debug.FirstLevelMission();
      const gates = g.Debug.FirstLevelWhitebox?.()?.gates;
      return {
        detail: mission.log.find(entry => entry.id === "bridgeDestroyed")?.detail,
        casualties: mission.ordinaryCasualties.length,
        squadAlive: g.ai.soldiers.filter(actor => actor.castId && actor.alive).length,
        walkable: !!gates,
      };
    });
    assert.ok(blast.squadAlive >= 3, "爆破不造成己方剧情伤亡");
    await fs.writeFile(path.join(output, "Data_BridgeBlast.json"), JSON.stringify(blast, null, 2));
    // 桥面真的不可走了：完好件的碰撞被撤掉，残骸出现。
    const gone = await page.evaluate(() => {
      const g = window.Tengxian;
      // gate.open：带 signal 的完好件 open = 已经消失（碰撞撤掉）；带 appearSignal 的断口空气墙 open = false 才是「在场」。
      const gates = g.battlefield.gates;
      const deck = ["PontoonBridgeDeck", "PontoonBridgeRailWest", "PontoonBridgeRailEast"].filter(id => !gates.get(id)?.open);
      const wreck = ["PontoonBridgeCutWallSouth", "PontoonBridgeCutWallNorth"].filter(id => gates.get(id) && !gates.get(id).open);
      const walkable = g.battlefield.walkableSurfaces.some(s => s.id === "PontoonBridgeDeck");
      return { deck: deck.length, wreck: wreck.length, walkable };
    });
    console.log("PONTOON_BRIDGE_AFTER_BLAST", JSON.stringify(gone));
    assert.equal(gone.deck, 0, "炸完被炸段桥面与两侧绳栏的碰撞一件不剩");
    assert.equal(gone.wreck, 2, "断口两端的空气墙出现了");
    assert.equal(gone.walkable, false, "被炸段桥面退出可走面");
  }
  await WaitFact(page, "marchOrderHeard", "18 往滕县", 180);
  if (fbBlast) {
    // 桥断之后对岸全停在岸边隔河射击：没有一个日军过南水线，起爆 14 s 后活着的人都在岸沿以北 0.5 m 之内。
    await WaitUntil(page, "18 桥断后对岸停在岸边", "fb.blast && fb.blastAgeS >= 21", 40);
    const fb = await FarBankState(page);
    console.log("FARBANK_HALTED", JSON.stringify({ alive: fb.alive, real: fb.real, scripted: fb.scripted, bank: fb.bank, shells: fb.shells, mg: fb.mg, tanks: fb.tanks, reinforced: fb.reinforced, ija: fb.ijaCount, tier: fb.tier }));
    assert.equal(fb.bank.southBank, 0, "桥断后（其实是整趟）没有一个日军过河");
    assert.equal(fb.bank.overNow, 0, "桥断 20 s 后对岸活着的人全在岸边");
    assert.ok(fb.bank.southMostZ <= 135, `整趟里对岸最靠南的日军 z ${fb.bank.southMostZ}（冲桥组最远到被炸段北半）`);
    assert.ok(fb.alive >= 16 && fb.real === 8, `桥断之后对岸仍有 ${fb.alive} 人，真 AI ${fb.real}`);
    assert.ok(fb.shells.fired >= 1 && fb.shells.minPlayerM >= 22 && fb.shells.minFriendlyM >= 10,
      `战车炮击了 ${fb.shells.fired} 发，落点离玩家最近 ${fb.shells.minPlayerM} m、离己方最近 ${fb.shells.minFriendlyM} m`);
    assert.ok(fb.mg.rounds > 0, "战车机枪打过曳光");
    // 规模感：桥断之后视觉人群全在位、没有人在被炸孔上；桥面上那辆战车已开到断口北侧（车头在 2 号墩 z 136 以北）。
    console.log("FARBANK_CROWD_HALTED", JSON.stringify(fb.crowd));
    assert.ok(fb.crowd.onField >= 280 && fb.crowd.holding >= 250, `桥断后视觉人群 ${fb.crowd.onField} 在场、${fb.crowd.holding} 在位`);
    const bridgeTank = fb.tanks.find(t => /Bridge$/.test(t.id));
    assert.ok(bridgeTank.z >= 72 && bridgeTank.z <= 79, `岸边那辆桥断后仍停在北岸浮桥头东侧（z ${bridgeTank.z}）`);
  }

  // --- 18 夜入滕城：先随队走完 marchOut，黑屏字幕，夜景，进北门 ---------------
  await WaitStage("NightMarch", 180, { fight: false });
  // 走到 marchOut 终点（marchOutReached）且脱离战场（retreatOutOfReach）编排就接管：黑屏一起、玩家交出控制权。
  // 驾驶器必须在这儿松手 —— 它要是攥着最后那个路点不放，黑屏里人被瞬移到
  // nightSpawn 之后，淡入一结束它就把人原路赶回 marchOut（实拍 2026-09-20）。
  // 2026-09-30：路线延到 113 m、翻岗子。分三段走，离北岸 ~120 m 与 ~160 m 处各回头看一眼对岸再拍。
  const march = Points(MISSION_STAGE_ROUTES.marchOut);
  await Route(march.slice(1, 2), "NightMarchOut120");
  {
    const fb = await FarBankState(page);
    if (fb) {
      console.log("FARBANK_RETREAT120", JSON.stringify({ dz: fb.dz, tier: fb.tier, alive: fb.alive, out: fb.out, shells: fb.shells.fired }));
      assert.ok(fb.tier === "mid" || fb.tier === "far", `离北岸 ${fb.dz} m 是 mid / far 档`);
      assert.equal(fb.out.recorded, false, "离北岸 120 m 还不算脱离战场");
    }
    await CaptureFocus("RetreatLook120", FAR_BANK_LOOK);
    await FrameTiming(page, "Retreat120");
  }
  await Route(march.slice(2, 4), "NightMarchOut160");
  {
    const fb = await FarBankState(page);
    if (fb) {
      console.log("FARBANK_RETREAT160", JSON.stringify({ dz: fb.dz, tier: fb.tier, alive: fb.alive, out: fb.out, shells: fb.shells.fired }));
      assert.ok(fb.tier === "far" || fb.tier === "out", `离北岸 ${fb.dz} m 是 far / out 档`);
      assert.equal(fb.out.recorded, false, "离北岸 160 m 还没翻过岗，不算脱离战场");
    }
    await CaptureFocus("RetreatLook160", FAR_BANK_LOOK);
  }
  await Route(march.slice(4), "NightMarchOut", { stopFact: "marchOutReached" });
  await WaitFact(page, "marchOutReached", "18 走完 marchOut", 180);
  {
    const fb = await FarBankState(page);
    if (fb) {
      console.log("FARBANK_OUT", JSON.stringify({ dz: fb.dz, tier: fb.tier, out: fb.out, alive: fb.alive }));
      assert.ok(fb.out.recorded && fb.out.dz >= 190, `黑屏是脱离战场之后：${JSON.stringify(fb.out)}`);
      assert.ok(fb.out.hidden, "翻过土岗之后眼位到对岸单位的视线被地形挡住");
      const facts = (await Mission(page)).facts;
      assert.ok(facts.includes("retreatOutOfReach") && facts.includes("marchOutReached"), "两条事实都记了");
    }
  }
  await Capture("NightFadeOut");
  await WaitFact(page, "nightArrivalPlaced", "18 黑屏里换夜景", 180);
  {
    const fb = await FarBankState(page);
    if (fb) {
      const left = await page.evaluate(() => window.Tengxian.ai.soldiers.filter(s => s.farBank && s.alive).length);
      assert.ok(fb.retired && fb.alive === 0 && left === 0, `黑屏里对岸全部收走：${JSON.stringify({ retired: fb.retired, alive: fb.alive, left })}`);
    }
  }
  {
    // 黑屏里那一下瞬移真的把**人**搬过去了（渲染位置与 Rapier 角色体同时过去）。
    const placed = await page.evaluate(() => {
      const g = window.Tengxian;
      return { position: { ...g.player.position }, body: g.player.body ? { ...g.player.body.position } : null };
    });
    console.log("NIGHT_ARRIVAL", JSON.stringify(placed));
    assert.ok(Math.hypot(placed.position.x - A.nightSpawn.x, placed.position.z - A.nightSpawn.z) < 3,
      `黑屏里玩家要真的被搬到 nightSpawn，实际 ${JSON.stringify(placed.position)}`);
    assert.ok(!placed.body || Math.hypot(placed.body.x - placed.position.x, placed.body.z - placed.position.z) < 0.5,
      `角色体要跟着渲染位置一起过去，实际 ${JSON.stringify(placed)}`);
  }
  // 淡出走完、字幕正挂着的那一帧（黑屏 1 / 4 / 1，这里在 hold 的开头）。
  await Capture("NightSubtitle");
  {
    const night = await page.evaluate(() => {
      const g = window.Tengxian, mission = g.Debug.FirstLevelMission();
      let lights = 0;
      g.scene.traverse(object => { if (object.isPointLight && /NightGateLight/.test(object.name)) lights += 1; });
      return { lights, player: { ...g.player.position }, nightGate: mission.end.nightGate,
        dressing: mission.end.dressing };
    });
    assert.ok(night.lights >= 5, `北门夜景要有火盆与门洞的点光，实际 ${night.lights}`);
    assert.ok(night.dressing.people >= 10, "夜景里真的有在走的队列、搬运的人和分配防区的人");
    await fs.writeFile(path.join(output, "Data_NightGate.json"), JSON.stringify(night, null, 2));
  }
  await WaitControl(page, "18 夜行军淡入", 120);
  await Capture("NightFadeIn");
  // 真实走到瓮城外的 approach 再拍：这张不能靠 debug 跳转或另一次瞬移伪造，
  // 它证明玩家在淡入后仍随队夜行，而且尚未进入北门。
  await Route(Points(MISSION_STAGE_ROUTES.nightMarch.slice(1, 2)), "NightMarchApproach");
  await Capture("NightMarchApproach");
  await Route(Points(MISSION_STAGE_ROUTES.nightMarch.slice(2)), "NightMarchToGate");
  {
    const shot = await Mission(page);
    assert.ok(shot.voice.played.includes("NorthGate"), "带路军人在门外招呼");
    assert.ok(shot.facts.includes("northGateReached"), "走到北门下");
  }
  await Capture("NightGateEntered");
  await WaitStage("Complete", 180);
  // 整趟 18 里玩家的掉血与开火记录（「玩家不会被隔河秒掉」「BridgeCover 打得下来」的实测）。
  const probe = await FarBankProbe(page);
  console.log("FARBANK_PROBE", JSON.stringify({ hp: { ...probe.hp, log: undefined }, hitLog: probe.hp.log, shots: probe.shots }));
  await fs.writeFile(path.join(output, "Data_FarBankProbe.json"), JSON.stringify(probe, null, 2));
  assert.ok(probe.hp.min >= 40, `整趟 18 玩家血量最低 ${probe.hp.min}（掉了 ${probe.hp.lost.toFixed(1)}，${probe.hp.hits} 次受伤），不许被隔河压得只剩半条命`);
}
