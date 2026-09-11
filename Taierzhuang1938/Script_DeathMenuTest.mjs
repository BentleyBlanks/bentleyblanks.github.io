// Real lethal-hit and input fixtures; this is not a full campaign playthrough.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";
const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, "_shots", "DeathMenu");
await fs.mkdir(out, { recursive: true });
const baseArg = process.argv.find(arg => arg.startsWith("--base="))?.slice(7);
const server = baseArg ? null : await ServeRoot(path.resolve(here, ".."), 0);
const base = baseArg || `http://127.0.0.1:${server.address().port}`;
const browser = await LaunchBrowser();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const errors = [];
page.on("pageerror", error => errors.push(String(error)));
try {
  await page.goto(`${base}/Taierzhuang1938/?whitebox=p012&shot=1&manual=1&quality=medium&scale=small`, { timeout: 120000 });
  await page.waitForFunction(() => window.Tengxian?.state?.ready && window.Tengxian?.Debug?.FirstLevelMission?.(), null, { timeout: 180000 });
  const setup = await page.evaluate(async () => {
    const g = window.Tengxian;
    const { FirstLevelMissionRuntime } = await import("./Script_FirstLevelMissionRuntime.mjs");
    const original = FirstLevelMissionRuntime.prototype.State;
    FirstLevelMissionRuntime.prototype.State = function () { window.deathRuntime = this; return original.call(this); };
    g.Debug.FirstLevelMission();
    FirstLevelMissionRuntime.prototype.State = original;
    const r = window.deathRuntime;
    await r.voiceReady;
    g.StepFrames(2);
    r.SaveCheckpoint();
    window.deathSafe = { ...r.safePoint };
    // Move away from the saved location and use a control segment to reproduce
    // the former ContinueCheckpoint -> OnPlayerDown -> retryPoint bug.
    g.player.position.x += 3;
    g.player.SyncCamera(0);
    r.controls = { kind: "fixture", time: 0, seconds: 999 };
    g.player.spawnGrace = 0;
    g.player.TakeHit(10000, "torso");
    g.StepFrames(1, 1 / 60, true);
    window.DeathWorld = () => JSON.stringify({ time: g.state.elapsed, ai: g.ai.time,
      positions: g.ai.soldiers.map(a => a.position.toArray()), flow: r.flow.State(),
      ammo: g.state.ammo, clips: g.state.clips, grenades: g.state.grenades, pool: g.state.nraPool });
    window.deathWorld = window.DeathWorld();
    return { mode: g.menu.mode, running: g.state.running, alive: g.player.Alive,
      title: g.menu.el.titleMain.textContent, items: g.menu.items.map(item => item.id),
      pauseClass: g.menu.root.classList.contains("pause"), camera: g.camera.position.toArray() };
  });
  assert.equal(setup.mode, "failure");
  assert.equal(setup.title, "你已阵亡");
  assert.equal(setup.running, false);
  assert.equal(setup.alive, false);
  assert.equal(setup.pauseClass, false);
  assert.deepEqual(setup.items, ["continueCheckpoint", "restartSandbox", "exitSandbox"]);
  assert.ok(await page.locator(".mnPauseObjective").isHidden(), "pause-only objective stays out of death screen");
  await page.keyboard.press("Escape");
  const frozen = await page.evaluate(() => {
    const g = window.Tengxian;
    g.Debug.MenuAct("resume");
    g.Debug.MenuAct("debug");
    g.StepFrames(180, 1 / 60, false);
    g.StepFrames(1, 1 / 60, true);
    return { unchanged: window.deathWorld === window.DeathWorld(), mode: g.menu.mode,
      running: g.state.running, camera: g.camera.position.toArray(),
      hudHidden: document.querySelector("#hud").style.display === "none", gunHidden: !g.viewmodel.root.visible };
  });
  assert.ok(frozen.unchanged, "death freezes mission, AI, supplies and gameplay time");
  assert.equal(frozen.mode, "failure");
  assert.equal(frozen.running, false);
  assert.ok(frozen.camera[1] < setup.camera[1] - .5, "death camera falls independently of the frozen world");
  assert.ok(frozen.hudHidden && frozen.gunHidden);
  await page.waitForFunction(() => document.getAnimations().every(animation => animation.playState !== "running"));
  await page.screenshot({ path: path.join(out, "Scene_DeathDesktop.png") });
  for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport);
    await page.evaluate(() => window.Tengxian.StepFrames(1, 1 / 60, true));
    const bounds = await page.locator('[data-act="continueCheckpoint"]').boundingBox();
    assert.ok(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= viewport.width && bounds.y + bounds.height <= viewport.height);
    await page.screenshot({ path: path.join(out, `Scene_Death${viewport.width}.png`) });
  }
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.getByRole("button", { name: "从检查点开始", exact: true }).click();
  const restored = await page.evaluate(() => {
    const g = window.Tengxian, r = window.deathRuntime, point = window.deathSafe;
    const z = point.trainZ == null ? point.z : point.trainZ + g.battlefield.trainOffsetM;
    return { alive: g.player.Alive, health: g.player.health, failed: r.failed, running: g.state.running,
      closed: !g.menu.open, deathClass: g.menu.root.classList.contains("failure"),
      distance: Math.hypot(g.player.position.x - point.x, g.player.position.z - z),
      preserved: window.deathWorld === window.DeathWorld(), gun: g.viewmodel.root.visible };
  });
  assert.ok(restored.alive && restored.health === 100 && !restored.failed && restored.running && restored.closed && !restored.deathClass);
  assert.ok(restored.distance < .1 && restored.preserved && restored.gun, JSON.stringify(restored));
  await page.evaluate(() => window.Tengxian.Debug.Pause());
  assert.equal(await page.locator(".mnTitleMain").textContent(), "游戏暂停");
  assert.ok(await page.locator(".mnPauseObjective").isVisible(), "pause still displays the mission objective");
  await page.keyboard.press("Escape");
  assert.ok(await page.evaluate(() => window.Tengxian.state.running && !window.Tengxian.menu.open));
  await page.evaluate(() => {
    const g = window.Tengxian;
    g.player.spawnGrace = 0; g.player.TakeHit(10000, "torso"); g.StepFrames(1);
  });
  await page.keyboard.press("Enter");
  assert.ok(await page.evaluate(() => window.Tengxian.player.Alive && window.Tengxian.state.running && !window.Tengxian.menu.open));
  const unavailable = await page.evaluate(() => {
    const g = window.Tengxian, r = window.deathRuntime;
    g.player.spawnGrace = 0; g.player.TakeHit(10000, "torso"); r.safePoint = null; g.StepFrames(1);
    const result = { disabled: g.menu.itemEls[0].disabled, title: g.menu.el.titleMain.textContent };
    g.Debug.MenuAct("continueCheckpoint");
    result.stillDead = !g.player.Alive && r.failed && !g.state.running;
    return result;
  });
  assert.ok(unavailable.disabled && unavailable.stillDead, JSON.stringify(unavailable));
  assert.equal(unavailable.title, "你已阵亡");
  const companionFailure = await page.evaluate(async () => {
    const g=window.Tengxian;
    await g.Debug.FirstLevelJump(1);
    const r=g.Debug.FirstLevelMissionRuntime();
    g.Debug.SetDebugOption("invincible",true);
    g.StepFrames(2,1/60,true);
    r.squad.find(actor=>actor.castId==="luo").Kill();
    r.opening.Update(1/60);
    g.StepFrames(1,1/60,true);
    return {alive:g.player.Alive,health:g.player.health,failed:r.failed,
      title:g.menu.el.titleMain.textContent,subtitle:g.menu.el.titleSub.textContent,
      items:g.menu.items.map(item=>item.id)};
  });
  assert.ok(companionFailure.alive && companionFailure.health===100 && companionFailure.failed);
  assert.equal(companionFailure.title,"任务失败","a living invincible player is never reported as killed by a squadmate's death");
  assert.ok(companionFailure.subtitle.includes("罗"));
  assert.deepEqual(companionFailure.items,["restartSandbox","exitSandbox"]);
  await page.waitForFunction(() => document.getAnimations().every(animation => animation.playState !== "running"));
  await page.screenshot({path:path.join(out,"Scene_CompanionFailure.png")});
  assert.deepEqual(errors, []);
  await fs.writeFile(path.join(out, "Data_DeathMenu.json"), JSON.stringify({ setup, frozen, restored, unavailable, companionFailure, errors }, null, 2));
  console.log("DeathMenuTest PASS: independent death state, frozen world, falling camera, mouse/Enter checkpoint recovery, pause regression and missing checkpoint");
} finally {
  await browser.close();
  if (server) await new Promise(resolve => server.close(resolve));
}
