// 04 机枪点位的关中过场《空地上的三个人》专项回归。
//   node Taierzhuang1938/Script_FirstLevelMachineGunCutsceneTest.mjs
//
// 守五件事（每一件漏了都只在真玩到那一秒才看得见，而且都是静默的）：
//   1. **玩家自己走进枪位才播**：夹具把阶段摆到 04 并把人放在圈外，接下来是真的
//      按住 W 走过去的。不许用「摆到座位上」冒充触发。
//   2. **只播一次**：事实 captivesWitnessed 记住了；检查点存取、重新走进圈里、
//      甚至 flow 快照往返之后都不再播第二遍。
//   3. **播的时候世界是停的**：玩家血量一点不掉，机枪进攻队一步不前、一枪不开。
//      这一条不是靠「把敌人杀光」蒙过去的 —— 那一队是活的，只是被过场冻住。
//   4. **播完权还回来**：控制权、指针锁状态、阶段与目标都回到原样。
//   5. **原流程仍可达**：还权之后按 F 上枪、开火，gunUsed 照旧记得上。
//
// 关键节拍的 720p 截图落在 _shots/MachineGunCutscene/（已 gitignore）。
//
// URL 不带 ?shot=1：出图模式会把 AudioEngine 整个关掉，而这一场要验的正是
// 「过场真的接上了」。manual=1 仍然接管时钟，rAF 不会在两次断言之间偷推帧。
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";
import { MISSION_TUNING } from "./Data_Tuning_FirstLevel.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, "_shots/MachineGunCutscene");
const CUT_ID = "CS_MachineGunCaptives";
const SEAT = { x: 0, z: -127.4 };
await fs.mkdir(out, { recursive: true });
const server = await ServeRoot(path.resolve(here, ".."), 0);
const browser = await LaunchBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
const receipts = [];
page.on("pageerror", (error) => errors.push(String(error)));

const Step = (frames) => page.evaluate((n) => window.Tengxian.StepFrames(n, 1 / 60, false), frames);
const Render = (frames) => page.evaluate((n) => window.Tengxian.StepFrames(n, 1 / 60, true), frames);

async function Sample(label) {
  const state = await page.evaluate((cutId) => {
    const g = window.Tengxian, r = g.Debug.FirstLevelMissionRuntime();
    const attack = [...r.enemies.values()].filter((a) => a.missionEncounter === "machineGun");
    return {
      stage: r.flow.stage.id,
      witnessed: r.Has("captivesWitnessed"),
      gunUsed: r.Has("gunUsed"),
      cutscene: g.Debug.Cutscene(),
      running: g.state.running,
      missionControl: !!g.state.missionControl,
      health: g.player.health,
      alive: g.player.Alive,
      distanceToSeat: Math.hypot(g.player.position.x - 0, g.player.position.z + 127.4),
      playedIds: g.Debug.Cutscene().played.map((entry) => entry.id),
      attack: attack.map((a) => ({ id: a.missionId || a.id, alive: a.alive,
        x: +a.position.x.toFixed(3), z: +a.position.z.toFixed(3), shots: a.fireSequence || 0 })),
    };
  }, CUT_ID);
  receipts.push({ label, ...state });
  console.log(label, JSON.stringify({ stage: state.stage, witnessed: state.witnessed,
    playing: state.cutscene.playing, current: state.cutscene.current,
    health: state.health, d: +state.distanceToSeat.toFixed(2), attack: state.attack.length }));
  return state;
}

try {
  await page.goto(process.env.MISSION_TEST_URL
    || `http://127.0.0.1:${server.address().port}/Taierzhuang1938/?whitebox=p012&menu=0&manual=1&quality=low&scale=small`,
  { timeout: 180000 });
  await page.waitForFunction(() => window.Tengxian?.state?.ready, null, { timeout: 240000 });

  // --- 夹具：摆到 04，人放在圈外 -------------------------------------------
  // 与 Script_FirstLevelMachineGunTest 同一套阶段摆法（那一条是诊断夹具，不冒充
  // 正常通关）。差别只有一个：**人不放到座位上**，放在枪位正东七米，
  // 让下面那一段真的用 W 走过去。
  await page.evaluate(async () => {
    const g = window.Tengxian;
    await g.Debug.FirstLevelJump(3);
    const r = g.Debug.FirstLevelMissionRuntime();
    const { MISSION_STAGES } = await import("./Data_FirstLevelMission.mjs");
    const { OPENING } = await import("./Data_FirstLevelOpening.mjs");
    for (const [id, a] of r.enemies) if (a.missionEncounter === "intrusion") { r.ai.Remove(a); r.enemies.delete(id); }
    r.flow.index = MISSION_STAGES.findIndex((s) => s.id === "Support");
    r.flow.Enter();
    r.Record("frontBattleStarted");
    r.SpawnEncounter("front");
    for (let i = 0; i < 100 && r.spawnQueue.length; i++) r.DrainSpawns();
    // 步枪阶段的敌人打完了才轮到机枪阶段：清掉他们，路上没人开枪，
    // 下面那一段走位才是在验触发而不是在验运气。机枪进攻队**不动**，它是活的。
    for (const a of r.enemies.values()) if (["front", "approach", "tank"].includes(a.missionEncounter)) a.TakeHit(1000, "torso", null);
    r.opening.zhou.TakeHit(50, "torso", null);
    r.PlaceActor(r.opening.zhou, OPENING.zhouRest);
    r.opening.UpdateZhou();
    for (const [i, a] of r.squad.entries()) { r.PlaceActor(a, OPENING.frontPosts[i]); r.squadRoutes.set(a.id, []); }
    r.flow.index = MISSION_STAGES.findIndex((s) => s.id === "MachineGun");
    r.flow.Enter();
    // 圈外：枪座正东 7 m，面朝正西（yaw=+π/2 时视线是 −X）。
    const p = r.Point({ x: 7, z: -127.4 });
    g.player.position.copy(p);
    g.player.body.Teleport(p.x, p.y, p.z);
    g.player.yaw = Math.PI / 2;
    g.player.pitch = 0;
    g.player.stance = "stand";
    g.player.SyncCamera(0);
  });
  await Step(2);
  const before = await Sample("OutsideTrigger");
  assert.equal(before.stage, "MachineGun", "夹具把阶段摆到了 04");
  assert.ok(before.distanceToSeat > MISSION_TUNING.captivesCutsceneRadiusM,
    `起步时人在触发圈外：${before.distanceToSeat.toFixed(2)} m > ${MISSION_TUNING.captivesCutsceneRadiusM} m`);
  assert.ok(!before.witnessed && !before.cutscene.playing, "还没走到枪位时不许播");
  assert.ok(before.attack.length > 0, "机枪进攻队是活的（不是被夹具杀光之后的空场）");
  await Render(2);
  await page.screenshot({ path: path.join(out, "Scene_BeforeTrigger.png") });

  // --- 正常输入走进枪位 -----------------------------------------------------
  let started = null;
  await page.evaluate(() => window.Tengxian.Debug.Key("KeyW", true));
  for (let i = 0; i < 40 && !started; i += 1) {
    await Step(10);
    const now = await page.evaluate(() => {
      const g = window.Tengxian, r = g.Debug.FirstLevelMissionRuntime();
      return { playing: g.Debug.Cutscene().playing, current: g.Debug.Cutscene().current,
        witnessed: r.Has("captivesWitnessed"),
        d: Math.hypot(g.player.position.x, g.player.position.z + 127.4) };
    });
    if (now.playing || now.witnessed) started = now;
  }
  await page.evaluate(() => window.Tengxian.Debug.Key("KeyW", false));
  assert.ok(started, "按住 W 走进枪位后过场真的起播了");
  assert.equal(started.current, CUT_ID, `播的是这一场：${started.current}`);
  assert.ok(started.d <= MISSION_TUNING.captivesCutsceneRadiusM + 0.6,
    `触发发生在枪位那一圈里：${started.d.toFixed(2)} m`);
  const entered = await Sample("CutsceneStarted");
  assert.ok(!entered.running || entered.cutscene.playing, "过场期间导演在跑");
  await Render(2);
  await page.screenshot({ path: path.join(out, "Scene_CutsceneStart.png") });

  // --- 播放期间：玩家不掉血，机枪进攻队不推进也不开枪 -----------------------
  await Step(240);
  const mid = await Sample("CutsceneMid");
  assert.ok(mid.cutscene.playing, "四秒之后还在播（过场没有被自己的第一帧收掉）");
  assert.equal(mid.health, entered.health, "过场期间玩家血量一点不掉");
  const frozen = mid.attack.filter((a) => {
    const was = entered.attack.find((b) => b.id === a.id);
    return was && (Math.hypot(a.x - was.x, a.z - was.z) > 0.05 || a.shots > was.shots);
  });
  assert.deepEqual(frozen, [], "机枪进攻队在过场期间一步不前、一枪不开");
  await Render(2);
  await page.screenshot({ path: path.join(out, "Scene_CutsceneMid.png") });

  // --- 自然播完（不按 Esc）：这一场是 44 s，手动时钟推到底 -------------------
  let finished = false;
  for (let i = 0; i < 40 && !finished; i += 1) {
    await Step(120);
    finished = !(await page.evaluate(() => window.Tengxian.Debug.Cutscene().playing));
  }
  assert.ok(finished, "过场自然播完，没有卡在最后一镜");
  await Step(12);
  const after = await Sample("CutsceneDone");
  assert.equal(after.cutscene.current, null, "播完之后导演放开了镜头");
  assert.ok(!after.missionControl, "播完之后控制权还给玩家");
  assert.ok(after.alive && after.health === entered.health, "整段过场没有伤到玩家");
  assert.equal(after.stage, "MachineGun", "播完仍在 04 阶段");
  assert.ok(after.witnessed, "事实记上了");
  assert.equal(after.playedIds.filter((id) => id === CUT_ID).length, 1, "整段只播了一次");
  await Render(4);
  await page.screenshot({ path: path.join(out, "Scene_AfterCutscene.png") });

  // --- 走出去再走回来：不许重播 --------------------------------------------
  await page.evaluate(() => {
    const g = window.Tengxian, r = g.Debug.FirstLevelMissionRuntime();
    const p = r.Point({ x: 9, z: -127.4 });
    g.player.position.copy(p);
    g.player.body.Teleport(p.x, p.y, p.z);
    g.player.SyncCamera(0);
  });
  await Step(30);
  await page.evaluate(() => window.Tengxian.Debug.Key("KeyW", true));
  await Step(180);
  await page.evaluate(() => window.Tengxian.Debug.Key("KeyW", false));
  const again = await Sample("WalkedInAgain");
  assert.ok(!again.cutscene.playing, "第二次走进枪位不再播");
  assert.equal(again.playedIds.filter((id) => id === CUT_ID).length, 1, "整局只播过一次");

  // --- 检查点存取与 flow 快照往返：事实要活下来 -----------------------------
  const checkpoint = await page.evaluate(() => {
    const r = window.Tengxian.Debug.FirstLevelMissionRuntime();
    const snapshot = r.flow.Snapshot();
    const inSnapshot = snapshot.facts.includes("captivesWitnessed");
    r.SaveCheckpoint();
    const continued = r.ContinueCheckpoint();
    r.flow.Restore(snapshot);
    return { inSnapshot, continued, afterRestore: r.Has("captivesWitnessed"), stage: r.flow.stage.id };
  });
  assert.ok(checkpoint.inSnapshot, "事实进了检查点快照（死亡回退不会重播）");
  assert.ok(checkpoint.continued, "检查点恢复本身是成功的");
  assert.ok(checkpoint.afterRestore, "快照往返之后事实还在");
  assert.equal(checkpoint.stage, "MachineGun", "快照往返之后仍在 04");
  await Step(120);
  const resumed = await Sample("AfterCheckpoint");
  assert.ok(!resumed.cutscene.playing, "检查点恢复之后不重播");
  assert.equal(resumed.playedIds.filter((id) => id === CUT_ID).length, 1, "检查点恢复之后仍然只播过一次");

  // --- 原流程仍可达：上枪、开火、gunUsed ------------------------------------
  await page.evaluate(() => {
    const g = window.Tengxian, r = g.Debug.FirstLevelMissionRuntime();
    const p = r.Point({ x: 0, z: -127.4 });
    g.player.position.copy(p);
    g.player.body.Teleport(p.x, p.y, p.z);
    g.player.yaw = 0; g.player.pitch = 0; g.player.stance = "crouch";
    g.player.SyncCamera(0);
  });
  await Step(10);
  await page.evaluate(() => {
    const g = window.Tengxian;
    g.Debug.Key("KeyF", true); g.StepFrames(45, 1 / 60, false); g.Debug.Key("KeyF", false);
    g.Debug.Mouse(0, true);
  });
  await Step(120);
  await page.evaluate(() => window.Tengxian.Debug.Mouse(0, false));
  const firing = await page.evaluate(() => {
    const g = window.Tengxian, r = g.Debug.FirstLevelMissionRuntime();
    return { mounted: g.emplacement.Mounted, shots: g.emplacement.stats.shots, used: r.Has("gunUsed") };
  });
  assert.ok(firing.shots > 0 && firing.used,
    "过场之后机枪照旧能接、能打，gunUsed 照旧记得上：" + JSON.stringify(firing));
  receipts.push({ label: "GunStillUsable", ...firing });
  await Render(4);
  await page.screenshot({ path: path.join(out, "Scene_GunAfterCutscene.png") });

  assert.deepEqual(errors, []);
  console.log("PASS 机枪点位关中过场：正常输入触发、只播一次、期间世界冻结、还权后原流程可达");
} finally {
  await fs.writeFile(path.join(out, "Data_MachineGunCutscene.json"),
    JSON.stringify({ receipts, errors }, null, 2));
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
