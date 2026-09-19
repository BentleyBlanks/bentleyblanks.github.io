// 关中过场《空地上的三个人》（CS_MachineGunCaptives）的回归。
//   node Taierzhuang1938/Script_FirstLevelMachineGunCutsceneTest.mjs
//
// 2026.09.19 重构（契约 §2）：**04 机枪阶段不再由任务触发这一场** ——
// 「眼看着失去抵抗能力的人被杀」这个主题已经由 01 的掩蔽部门外承担。
// 过场的资产、台词、作者动作与文件全部保留，只是没有任务触发点了。
// 所以这一条分成两段：
//
//   A. 任务侧不触发。人真的走到枪位上、在那儿打完一整段、菜单跳到 04，
//      都不许播这一场，也不许记 captivesWitnessed。
//   B. 过场自身仍然完好。直接调 PlayMidCutscene 播一遍：真的起播、世界冻住、
//      作者动作落到骨头上、自然播完、控制权还回来、之后机枪照旧能用。
//
// 关键节拍的 720p 截图落在 _shots/MachineGunCutscene/（已 gitignore）。
//
// URL 不带 ?shot=1：出图模式会把 AudioEngine 整个关掉，而 B 段要验的正是
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
  const state = await page.evaluate(() => {
    const g = window.Tengxian, r = g.Debug.FirstLevelMissionRuntime();
    const attack = [...r.enemies.values()].filter((a) => a.missionEncounter === "machineGun");
    return {
      stage: r.flow.stage.id,
      witnessed: r.Has("captivesWitnessed"),
      gunUsed: r.Has("gunUsed"),
      cutscene: g.Debug.Cutscene(),
      missionControl: !!g.state.missionControl,
      health: g.player.health,
      alive: g.player.Alive,
      distanceToSeat: Math.hypot(g.player.position.x - 0, g.player.position.z + 127.4),
      playedIds: g.Debug.Cutscene().played.map((entry) => entry.id),
      attack: attack.map((a) => ({ id: a.missionId || a.id, alive: a.alive,
        x: +a.position.x.toFixed(3), z: +a.position.z.toFixed(3), shots: a.fireSequence || 0 })),
    };
  });
  receipts.push({ label, ...state });
  console.log(label, JSON.stringify({ stage: state.stage, witnessed: state.witnessed,
    playing: state.cutscene.playing, current: state.cutscene.current,
    health: state.health, d: +state.distanceToSeat.toFixed(2), attack: state.attack.length }));
  return state;
}

/** 夹具：把阶段摆到 04，前沿那一场当作打完（诊断夹具，不冒充正常通关）。 */
async function StageMachineGun(radius) {
  await page.evaluate(async (radius) => {
    const g = window.Tengxian;
    await g.Debug.FirstLevelJump(3);
    const r = g.Debug.FirstLevelMissionRuntime();
    const { MISSION_STAGES } = await import("./Data_FirstLevelMission.mjs");
    const { OPENING } = await import("./Data_FirstLevelOpening.mjs");
    r.flow.index = MISSION_STAGES.findIndex((s) => s.id === "Support");
    r.flow.Enter();
    r.Record("frontBattleStarted");
    r.SpawnEncounter("front");
    for (let i = 0; i < 100 && r.spawnQueue.length; i++) r.DrainSpawns();
    // 步枪阶段的敌人打完了才轮到机枪阶段：清掉他们，路上没人开枪。
    // 机枪进攻队**不动**，它是活的（B 段要用它验「过场期间世界是停的」）。
    for (const a of r.enemies.values())
      if (["front", "approach", "tank"].includes(a.missionEncounter)) a.TakeHit(1000, "torso", null);
    r.opening.zhou.TakeHit(50, "torso", null);
    r.PlaceActor(r.opening.zhou, OPENING.zhouRest);
    r.opening.UpdateZhou();
    for (const [i, a] of r.squad.entries()) { r.PlaceActor(a, OPENING.frontPosts[i]); r.squadRoutes.set(a.id, []); }
    r.flow.index = MISSION_STAGES.findIndex((s) => s.id === "MachineGun");
    r.flow.Enter();
    // 旧触发圈外：枪座正东（旧半径 + 3 m），面朝正西。
    const p = r.Point({ x: radius + 3, z: -127.4 });
    g.player.position.copy(p);
    g.player.body.Teleport(p.x, p.y, p.z);
    g.player.yaw = Math.PI / 2;
    g.player.pitch = 0;
    g.player.stance = "stand";
    g.player.SyncCamera(0);
  }, radius);
  await Step(2);
}

try {
  await page.goto(process.env.MISSION_TEST_URL
    || `http://127.0.0.1:${server.address().port}/Taierzhuang1938/?whitebox=p012&menu=0&manual=1&quality=low&scale=small`,
  { timeout: 180000 });
  await page.waitForFunction(() => window.Tengxian?.state?.ready, null, { timeout: 240000 });

  // =========================================================================
  // A. 任务侧不触发（契约 §2：主题由 01 承担，04 不再插这一场）
  // =========================================================================
  await StageMachineGun(MISSION_TUNING.captivesCutsceneRadiusM);
  const before = await Sample("OutsideOldTrigger");
  assert.equal(before.stage, "MachineGun", "夹具把阶段摆到了 04");
  assert.ok(before.distanceToSeat > MISSION_TUNING.captivesCutsceneRadiusM,
    `起步时人在旧触发圈外：${before.distanceToSeat.toFixed(2)} m`);
  assert.ok(before.attack.length > 0, "机枪进攻队是活的（不是被夹具杀光之后的空场）");
  await Render(2);
  await page.screenshot({ path: path.join(out, "Scene_BeforeSeat.png") });

  // 按住 W 一路走进枪位，再在那儿站满旧过场的整段时长（44 s）。
  await page.evaluate(() => window.Tengxian.Debug.Key("KeyW", true));
  for (let i = 0; i < 60; i += 1) {
    await Step(10);
    const d = await page.evaluate(() => Math.hypot(window.Tengxian.player.position.x,
      window.Tengxian.player.position.z + 127.4));
    if (d <= 1.2) break;
  }
  await page.evaluate(() => window.Tengxian.Debug.Key("KeyW", false));
  await Step(60 * 50);
  const walked = await Sample("WalkedOntoSeat");
  assert.ok(walked.distanceToSeat <= MISSION_TUNING.captivesCutsceneRadiusM,
    `人真的走进了旧触发圈：${walked.distanceToSeat.toFixed(2)} m`);
  assert.ok(!walked.cutscene.playing && !walked.playedIds.includes(CUT_ID),
    "04 不再由任务触发这一场：" + JSON.stringify(walked.playedIds));
  assert.ok(!walked.witnessed, "任务也不再记 captivesWitnessed");
  assert.ok(!walked.missionControl, "没有过场，控制权一直在玩家手里");
  await Render(2);
  await page.screenshot({ path: path.join(out, "Scene_NoCutsceneOnSeat.png") });

  // 菜单的「阶段跳转」带 midCutscenes 也不播（关中过场表里已经没有 04 这一条）。
  await page.evaluate(() => window.Tengxian.Debug.FirstLevelJump(4, { midCutscenes: true }));
  await Step(60 * 6);
  const jumped = await Sample("MenuJump04");
  assert.equal(jumped.stage, "MachineGun", "菜单跳到了 04");
  assert.ok(!jumped.cutscene.playing && !jumped.playedIds.includes(CUT_ID),
    "菜单跳到 04 同样不播这一场");
  console.log("ok A 段：04 不再触发《空地上的三个人》");

  // =========================================================================
  // B. 过场自身仍然完好（资产与文件保留，随时能直接播）
  // =========================================================================
  const registered = await page.evaluate((id) => {
    const g = window.Tengxian;
    return { mid: g.Debug.MidCutscenes ? g.Debug.MidCutscenes() : null, started: !!g.Debug.PlayMidCutscene(id) };
  }, CUT_ID);
  console.log("PlayMidCutscene", JSON.stringify(registered));
  assert.ok(registered.started, "过场仍然注册着，直接调得起来");
  await Step(6);
  const entered = await Sample("CutsceneStarted");
  assert.ok(entered.cutscene.playing && entered.cutscene.current === CUT_ID, "播的是这一场");
  await Render(2);
  await page.screenshot({ path: path.join(out, "Scene_CutsceneStart.png") });

  // 播放期间：玩家不掉血，机枪进攻队不推进也不开枪。
  await Step(240);
  const mid = await Sample("CutsceneMid");
  assert.ok(mid.cutscene.playing, "四秒之后还在播（过场没有被自己的第一帧收掉）");
  assert.equal(mid.health, entered.health, "过场期间玩家血量一点不掉");
  const moved = mid.attack.filter((a) => {
    const was = entered.attack.find((b) => b.id === a.id);
    return was && (Math.hypot(a.x - was.x, a.z - was.z) > 0.05 || a.shots > was.shots);
  });
  assert.deepEqual(moved, [], "机枪进攻队在过场期间一步不前、一枪不开");
  await Render(2);
  await page.screenshot({ path: path.join(out, "Scene_CutsceneMid.png") });

  // 作者动作真的在 p012 入口生效了（「visible≠看得见」：量骨头，不看旗标）。
  await Step(Math.round((17.0 - 4.0) * 60));
  const pose = await page.evaluate(() => {
    const g = window.Tengxian, out = {};
    for (const [id, entry] of g.cutscene.actors) {
      const a = entry.actor, rig = a.characterRig;
      if (!rig) continue;
      a.root.updateWorldMatrix(true, true);
      const Y = (role) => (rig.bones[role]
        ? +(rig.bones[role].matrixWorld.elements[13] - a.root.position.y).toFixed(3) : null);
      out[id] = { performClip: rig.cutscenePerformance?.state?.clipId || null,
        head: Y("head"), pelvis: Y("pelvis") };
    }
    return { time: g.Debug.Cutscene().time, actors: out };
  });
  receipts.push({ label: "AuthoredMotion", ...pose });
  console.log("AuthoredMotion", JSON.stringify(pose));
  const want = {
    captive_old: { clip: "CaptiveStruckDown", head: [0.15, 0.34] },
    captive_young: { clip: "CaptiveKneelPlead", head: [0.90, 1.10] },
    captive_third: { clip: "CaptiveKneelHandsHead", head: [0.90, 1.10] },
    ija_hei: { clip: "IjaBayonetGuard", head: [1.24, 1.49] },
  };
  for (const [id, expect] of Object.entries(want)) {
    const got = pose.actors[id];
    assert.ok(got, `过场里有 ${id}`);
    assert.equal(got.performClip, expect.clip,
      `${id} 在 p012 入口播的是作者动作 ${expect.clip}，不是 POSE_CLIPS 回退（实际 ${got.performClip}）`);
    assert.ok(got.head >= expect.head[0] && got.head <= expect.head[1],
      `${id} 头骨离脚下平面 ${got.head} m，要求 ${expect.head[0]}–${expect.head[1]}（动作真的改到了骨头上）`);
  }
  await Render(2);
  await page.screenshot({ path: path.join(out, "Scene_AuthoredMotion.png") });

  // 自然播完（不按 Esc）：这一场是 44 s，手动时钟推到底。
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
  assert.equal(after.playedIds.filter((id) => id === CUT_ID).length, 1, "整段只播了一次");
  await Render(4);
  await page.screenshot({ path: path.join(out, "Scene_AfterCutscene.png") });

  // 原流程仍可达：上枪、开火、gunUsed。
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
  console.log("PASS 04 不再触发《空地上的三个人》；过场自身直接播仍然完好（世界冻结、作者动作、还权、机枪可用）");
} finally {
  await fs.writeFile(path.join(out, "Data_MachineGunCutscene.json"),
    JSON.stringify({ receipts, errors }, null, 2));
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
