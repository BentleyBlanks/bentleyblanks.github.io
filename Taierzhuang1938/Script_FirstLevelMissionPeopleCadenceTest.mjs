// 任务人物（MissionPeople）姿势解算的节奏：画面外 8 Hz、画面外且超出阴影距离的 1 Hz，
// 回到视野 / 走近那一帧立刻补算（2026-10-14 offscreenFarM / offscreenFarAnimationS）。
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";
import { MISSION_ANCHORS, PoseView } from "./Script_FrameProbeViews.mjs";
const here = path.dirname(fileURLToPath(import.meta.url));
const server = await ServeRoot(path.resolve(here, ".."), 0), browser = await LaunchBrowser();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } }), errors = [];
page.on("pageerror", e => errors.push(String(e)));
try {
  const base = process.env.MISSION_REVIEW_URL || `http://127.0.0.1:${server.address().port}`;
  await page.goto(`${base}/Taierzhuang1938/?whitebox=p012&shot=1&manual=1&quality=high&scale=small&missionStage=4`, { timeout: 180000 });
  await page.waitForFunction(() => window.Tengxian?.state.ready, null, { timeout: 240000 });
  await page.evaluate(PoseView, { A: MISSION_ANCHORS, name: "front", custom: null, settleFrames: 10, settleDt: 1 / 60 });
  const report = await page.evaluate(async () => {
    const g = window.Tengxian, runtime = g.Debug.FirstLevelMissionRuntime(), people = runtime.view.people;
    const { MISSION_PEOPLE_TUNING: C } = await import("./Data_Tuning_FirstLevel.mjs");
    g.state.menu = false;
    // 数每个人每次 Person 调用是不是真的解了姿势（lastPoseAt 变了）。
    const solves = new Map(), original = people.Person;
    people.Person = function (id, ...rest) {
      const before = this.people.get(id)?.lastPoseAt, result = original.call(this, id, ...rest);
      if (this.people.get(id)?.lastPoseAt !== before) solves.set(id, (solves.get(id) || 0) + 1);
      return result;
    };
    const Run = (seconds) => { solves.clear(); g.StepFrames(Math.round(seconds * 60), 1 / 60, true); return new Map(solves); };
    const Away = (entry) => Math.hypot(entry.actor.root.position.x - g.player.position.x, entry.actor.root.position.z - g.player.position.z);
    const FaceTo = (entry) => {
      const dx = entry.actor.root.position.x - g.player.position.x, dz = entry.actor.root.position.z - g.player.position.z;
      g.player.yaw = Math.atan2(-dx, -dz); g.player.pitch = 0;
    };
    g.StepFrames(30, 1 / 60, true);
    const alive = [...people.people.entries()].filter(([, entry]) => !entry.dead);
    const far = alive.filter(([, entry]) => entry.offscreen && Away(entry) > C.offscreenFarM);
    const farIds = far.map(([id]) => id);
    // 1. 身后很远的人：1 Hz。
    const behind = Run(4);
    const farSolves = farIds.map(id => behind.get(id) || 0);
    // 2. 转过去看他：同一帧补算，且不再算画面外。
    const [targetId, target] = far[0] || [];
    FaceTo(target);
    const before = target.lastPoseAt;
    g.StepFrames(1, 1 / 60, true);
    const returned = { offscreen: target.offscreen, solvedThisFrame: target.lastPoseAt !== before && target.lastPoseAt === people.time };
    // 3. 走近到画面外的 offscreenFarM 以内：8 Hz（站在他身后 8 m，背对着他）。
    const p = target.actor.root.position;
    g.player.Spawn(p.x + 6, p.z + 6, Math.atan2(-6, -6));   // 朝向 (+x, +z)，他在 (-x, -z) 方向的身后
    g.StepFrames(20, 1 / 60, true);
    const nearOff = Away(target), nearOffscreen = target.offscreen;
    const close = Run(2);
    people.Person = original;
    return { tuning: { m: C.offscreenFarM, far: C.offscreenFarAnimationS, off: C.offscreenAnimationS }, farIds: farIds.length, farSolves, targetId, returned,
      nearOff, nearOffscreen, nearSolves: close.get(targetId) || 0 };
  });
  console.log(JSON.stringify(report));
  assert.ok(report.farIds >= 4, "front-line view has several people far behind the camera (collection point, convoy)");
  assert.ok(report.farSolves.every(n => n <= 6), `far off-screen people pose at ~1 Hz (4 s window): ${report.farSolves}`);
  assert.ok(report.returned.solvedThisFrame && !report.returned.offscreen, "turning toward a far person re-poses him on the same frame");
  assert.ok(report.nearOffscreen && report.nearOff < report.tuning.m, "fixture: the person is off-screen but within the far-cadence distance");
  assert.ok(report.nearSolves >= 10, `off-screen people inside ${report.tuning.m} m keep the 8 Hz cadence (got ${report.nearSolves} in 2 s)`);
  assert.deepEqual(errors, []);
  console.log("PASS MissionPeople pose cadence: far off-screen 1 Hz, same-frame catch-up on return, near off-screen 8 Hz");
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
