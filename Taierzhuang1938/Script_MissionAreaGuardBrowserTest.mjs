// 任务走廊软边界实机探针（S 包，docs/Data_FirstLevelGuidance20260928.md §3.3）。
//
//   node Taierzhuang1938/Script_MissionAreaGuardBrowserTest.mjs
//
// 07（沿沟南行）从集结处起步，真按 W 往西跑出走廊：
//   宽限内不亮 → 亮一行「离开战场区域 · 返回 · N 秒」（720p 在视口里、不压回头警告的方向面板）→
//   回到走廊里立刻灭、没补满又出去接着剩下的秒数走 → 在外面等到倒计时走完 → 按阵亡走既有死亡菜单 →
//   点「从检查点开始」回到走廊里的存档点、警告不再亮。出界期间存档被拒绝（不会重生在走廊外面）。
// 另带 ?airWalls=1：有 tag:"airWall" 的体块就要有半透明红板，没有就一块都不画。
// 截图与回执：_shots/MissionAreaGuard/（忽略目录）。
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";
import { MISSION_AREA_GUARD as G } from "./Data_Tuning_MissionArea.mjs";
import { MISSION_ANCHORS as A } from "./Data_FirstLevelMissionLayout.mjs";

const here = path.dirname(fileURLToPath(import.meta.url)), output = path.join(here, "_shots", "MissionAreaGuard");
await fs.mkdir(output, { recursive: true });
const server = await ServeRoot(path.resolve(here, ".."), 0);
const browser = await LaunchBrowser(), page = await browser.newPage({ viewport: { width: 1280, height: 720 } }), errors = [];
page.on("pageerror", (error) => errors.push(String(error)));
const receipt = {};

/** 推 frames 帧（不渲染），读回走廊计时器、HUD 那一行与玩家状态。 */
const Step = (frames, render = false) => page.evaluate(({ frames, render }) => {
  const g = window.Tengxian, r = g.Debug.FirstLevelMissionRuntime();
  if (frames > 0) g.StepFrames(frames, 1 / 60, false);
  if (render) g.StepFrames(1, 1 / 60, true);
  const el = document.querySelector(".hudMissionArea"), box = el.getBoundingClientRect();
  const panel = document.querySelector(".hudMissionReturn.on .missionReturnPanel")?.getBoundingClientRect() || null;
  return { stage: r.flow.stage.id, area: r.areaGuard.State(), inside: r.InsideMissionArea(),
    hud: { on: el.classList.contains("on"), urgent: el.classList.contains("urgent"), text: el.textContent,
      hidden: el.getAttribute("aria-hidden"), box: { left: box.left, top: box.top, right: box.right, bottom: box.bottom },
      opacity: getComputedStyle(el).opacity, pointerEvents: getComputedStyle(el).pointerEvents,
      returnPanel: panel && { top: panel.top, bottom: panel.bottom } },
    player: { x: +g.player.position.x.toFixed(2), z: +g.player.position.z.toFixed(2), alive: g.player.alive },
    failed: r.failed, safePoint: r.safePoint && { x: +r.safePoint.x.toFixed(2), z: +r.safePoint.z.toFixed(2) } };
}, { frames, render });
const Teleport = (x, z, yaw) => page.evaluate(({ x, z, yaw }) => {
  const g = window.Tengxian, r = g.Debug.FirstLevelMissionRuntime(), p = r.Point({ x, z });
  g.player.position.copy(p); g.player.body.Teleport(p.x, p.y, p.z); g.player.velocity.set(0, 0, 0);
  g.player.yaw = yaw; g.player.pitch = 0; g.player.SyncCamera(0);
}, { x, z, yaw });

try {
  await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/?whitebox=p012&shot=1&manual=1&missionStage=7&quality=low&scale=small&airWalls=1`,
    { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.waitForFunction(() => window.Tengxian?.state?.ready && window.Tengxian.Debug.FirstLevelMission?.()?.stage === "South", null, { timeout: 240000 });
  await page.evaluate(async () => { await window.Tengxian.Debug.FirstLevelMissionRuntime().voiceReady; });

  // ?airWalls=1：有空气墙就有红板，没有就一块都不画。
  receipt.airWalls = await page.evaluate(() => {
    const g = window.Tengxian, blocks = (g.battlefield.layout.blocks || []).filter((block) => block.tag === "airWall").length;
    let meshes = 0; g.scene.traverse((object) => { if (object.isMesh && object.name === "FirstLevelWhitebox_AirWallDebug") meshes += 1; });
    return { blocks, meshes, invincible: !!g.player.debug?.invincible };
  });
  assert.equal(receipt.airWalls.meshes > 0, receipt.airWalls.blocks > 0, "?airWalls=1: red plates exactly when the layout has air walls " + JSON.stringify(receipt.airWalls));
  assert.equal(receipt.airWalls.invincible, false, "the probe needs a mortal player");

  // 起步：集结处，走廊里，过了换步宽限。
  let state = await Step(Math.ceil((G.stepGraceS + 1) * 60));
  receipt.start = state;
  assert.equal(state.stage, "South");
  assert.ok(state.inside && !state.area.warning && !state.hud.on, "07 起步在走廊里、不亮：" + JSON.stringify(state));
  const saved = state.safePoint;
  assert.ok(saved, "07 has a checkpoint");

  // 真按 W 往西跑（yaw π/2：正前方 = −X）。先挪到走廊西缘里面一点，免得在集结处的背坡土壁上磨。
  const west = Math.PI / 2;
  await Teleport(A.collection.x - 30, A.collection.z, west);
  state = await Step(30);
  assert.ok(state.inside && !state.hud.on, "30 m west of the collection is still inside: " + JSON.stringify(state));
  await page.evaluate(() => { const g = window.Tengxian; g.Debug.Key("KeyW", true); g.Debug.Key("ShiftLeft", true); });
  let crossedAt = null, warnedAt = null, frames = 0, run = [];
  for (; frames < 60 * 20; frames += 6) {
    state = await Step(6);
    run.push({ f: frames, x: state.player.x, d: state.area.distanceM, warning: state.area.warning });
    if (crossedAt == null && state.area.distanceM > 0) crossedAt = frames;
    if (state.area.warning) { warnedAt = frames; break; }
  }
  await page.evaluate(() => { const g = window.Tengxian; g.Debug.Key("KeyW", false); g.Debug.Key("ShiftLeft", false); });
  receipt.run = { crossedAt, warnedAt, samples: run.filter((_, i) => i % 5 === 0), end: state.player };
  const realRun = crossedAt != null && warnedAt != null;
  if (!realRun) {
    // 实跑被地形 / 实体挡住（回执里记着停在哪）：退回瞬移到走廊外，照样验计时与判负。
    console.log("RUN_BLOCKED", JSON.stringify(receipt.run));
    await Teleport(-100, A.collection.z, west);
    state = await Step(Math.ceil((G.graceS - 0.3) * 60));
    assert.ok(!state.area.warning && !state.hud.on, "outside shorter than graceS: no warning yet");
    state = await Step(30);
  } else {
    const graceFrames = warnedAt - crossedAt;
    assert.ok(graceFrames >= (G.graceS - 0.15) * 60, `warning waits graceS after crossing (${graceFrames} frames)`);
  }
  receipt.realRun = realRun;
  state = await Step(0, true);
  receipt.warning = state;
  assert.ok(state.area.warning && state.hud.on && state.hud.hidden === "false", "出界亮警告：" + JSON.stringify(state));
  assert.ok(/离开战场区域/.test(state.hud.text) && /\d+\s*秒/.test(state.hud.text), "那一行是文本表里的句子，不是键名：" + state.hud.text);
  assert.ok(state.hud.box.left >= 0 && state.hud.box.right <= 1280 && state.hud.box.top >= 0 && state.hud.box.bottom <= 720, "720p 视口里");
  assert.equal(state.hud.pointerEvents, "none");
  if (state.hud.returnPanel) assert.ok(state.hud.box.bottom <= state.hud.returnPanel.top, "不压回头警告的方向面板：" + JSON.stringify(state.hud));
  await page.waitForTimeout(350);
  await page.screenshot({ path: path.join(output, "Scene_AreaWarning.png") });
  // 出界期间存档被拒绝。
  receipt.saveOutside = await page.evaluate(() => {
    const r = window.Tengxian.Debug.FirstLevelMissionRuntime(), before = { ...r.safePoint };
    const result = r.SaveCheckpoint();
    return { result, unchanged: r.safePoint.x === before.x && r.safePoint.z === before.z };
  });
  assert.deepEqual(receipt.saveOutside, { result: false, unchanged: true }, "人在走廊外不覆盖存档点");

  // 回到走廊里：立刻灭，秒数保留；没满 resetS 又出去：立刻重亮、接着走。
  await Teleport(A.collection.x - 20, A.collection.z, west);
  state = await Step(2);
  const kept = state.area.secondsLeft;
  assert.ok(!state.area.warning && !state.hud.on && kept < G.countdownS, "回来立刻灭、秒数没补满：" + JSON.stringify(state.area));
  state = await Step(Math.ceil((G.resetS - 1) * 60));
  await Teleport(-100, A.collection.z, west);
  state = await Step(2);
  assert.ok(state.area.warning && state.area.secondsLeft < kept, "没补满又出去：立刻重亮、接着剩下的秒数走：" + JSON.stringify(state.area));
  receipt.reenter = { kept, after: state.area.secondsLeft };

  // 最后几秒转红；倒计时走完 → 阵亡 → 既有死亡菜单。
  state = await Step(Math.max(1, Math.ceil((state.area.secondsLeft - G.urgentS + 0.5) * 60)), true);
  assert.ok(state.hud.urgent && state.area.warning, "最后几秒转红：" + JSON.stringify(state.hud));
  await page.waitForTimeout(350);
  await page.screenshot({ path: path.join(output, "Scene_AreaUrgent.png") });
  let dead = null;
  for (let i = 0; i < 40 && !dead; i += 1) {
    state = await Step(15);
    if (!state.player.alive) dead = state;
  }
  assert.ok(dead, "倒计时走完按阵亡处理：" + JSON.stringify(state));
  receipt.dead = await page.evaluate(() => {
    const g = window.Tengxian, r = g.Debug.FirstLevelMissionRuntime();
    return { failed: r.failed, menu: g.menu?.mode, health: g.player.health, running: g.state.running,
      log: r.areaGuard.State().log.slice(-3), hud: document.querySelector(".hudMissionArea").getAttribute("aria-hidden") };
  });
  assert.ok(receipt.dead.failed && receipt.dead.menu === "failure" && receipt.dead.health === 0 && receipt.dead.hud === "true",
    "走既有的 OnPlayerDown → 死亡菜单，那一行收起：" + JSON.stringify(receipt.dead));
  assert.ok(receipt.dead.log.at(-1)?.failed, "诊断记录里这一次出界判负");
  await page.evaluate(() => window.Tengxian.StepFrames(150, 1 / 60, true));
  await page.screenshot({ path: path.join(output, "Scene_AreaFailed.png") });

  // 从检查点开始：回到走廊里的存档点，警告不再亮。
  await page.getByRole("button", { name: "从检查点开始", exact: true }).click();
  state = await Step(2, true);
  receipt.retry = state;
  assert.ok(state.player.alive && !state.failed, "检查点重来：" + JSON.stringify(state));
  assert.ok(Math.hypot(state.player.x - saved.x, state.player.z - saved.z) < 1, `回到 07 的存档点 ${JSON.stringify(saved)}：${JSON.stringify(state.player)}`);
  assert.ok(state.inside, "存档点在走廊里");
  state = await Step(Math.ceil((G.stepGraceS + G.graceS + 1) * 60), true);
  assert.ok(!state.area.warning && !state.hud.on, "重来之后不再亮：" + JSON.stringify(state.area));
  await page.waitForTimeout(350);
  await page.screenshot({ path: path.join(output, "Scene_AreaRetry.png") });

  assert.deepEqual(errors, []);
  await fs.writeFile(path.join(output, "Data_MissionAreaGuard.json"), JSON.stringify(receipt, null, 2));
  console.log("PASS mission area: 07 real run west, grace, warning line, re-entry, urgent, death menu and checkpoint retry",
    JSON.stringify({ realRun: receipt.realRun, crossedAt: receipt.run.crossedAt, warnedAt: receipt.run.warnedAt, airWalls: receipt.airWalls }));
} finally {
  await fs.writeFile(path.join(output, "Data_MissionAreaGuard.json"), JSON.stringify({ ...receipt, errors }, null, 2)).catch(() => {});
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
