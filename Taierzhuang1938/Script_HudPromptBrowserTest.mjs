import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(projectDir, "..");
const server = await ServeRoot(rootDir, 0);
const browser = await LaunchBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on("pageerror", (error) => errors.push(String(error)));

try {
  const port = server.address().port;
  await page.goto(
    `http://127.0.0.1:${port}/Taierzhuang1938/?phase=3&quality=low&scale=small&menu=0`,
    { waitUntil: "load", timeout: 120000 },
  );
  await page.waitForFunction(() => window.Taierzhuang !== undefined, { timeout: 180000 });

  const controls = await page.evaluate(() => {
    const T = window.Taierzhuang;
    T.editor.Open("controls");
    return {
      active: T.editor.ActiveId,
      rows: document.querySelectorAll(".edControlRow").length,
      text: document.querySelector(".edPanel.work")?.textContent || "",
    };
  });
  assert.equal(controls.active, "controls");
  assert.ok(controls.rows >= 16);
  assert.match(controls.text, /拾枪、换枪/);
  assert.match(controls.text, /包扎止血/);
  assert.match(controls.text, /M显示 \/ 隐藏战场地图/);

  const mapToggle = await page.evaluate(() => {
    const T = window.Taierzhuang;
    T.editor.TogglePanel(false);
    const minimap = document.querySelector(".hudMinimap");
    const snapshot = () => ({
      on: minimap.classList.contains("on"),
      display: getComputedStyle(minimap).display,
      ariaHidden: minimap.getAttribute("aria-hidden"),
    });
    const initial = snapshot();
    T.Debug.Key("KeyM");
    T.StepFrames(1, 1 / 60, false);
    const shown = snapshot();
    T.Debug.Key("KeyM");
    const hiddenAgain = snapshot();
    return { initial, shown, hiddenAgain };
  });
  assert.deepEqual(mapToggle.initial, { on: false, display: "none", ariaHidden: "true" });
  assert.deepEqual(mapToggle.shown, { on: true, display: "block", ariaHidden: "false" });
  assert.deepEqual(mapToggle.hiddenAgain, { on: false, display: "none", ariaHidden: "true" });

  const prompts = await page.evaluate(() => {
    const T = window.Taierzhuang;
    T.editor.TogglePanel(false);
    T.state.spawnAccumulator = -1e6;
    for (const soldier of T.ai.soldiers) {
      soldier.position.set(T.player.position.x + 300, soldier.position.y, T.player.position.z + 300);
    }
    T.player.health = 100;
    T.player.alive = true;
    T.player.bleeding = 0.4;
    T.player.bandages = 1;
    T.state.slots.primary = "HanYang";
    T.state.slots.secondary = "Mauser96";
    T.StepFrames(12);
    return {
      prompts: T.Debug.Prompts(),
      rows: [...document.querySelectorAll(".hudAction")].map((row) => row.textContent),
      on: document.querySelector(".hudActions")?.classList.contains("on"),
    };
  });
  assert.deepEqual(prompts.prompts.map((prompt) => prompt.kind), ["bandage", "switchWeapon"]);
  assert.equal(prompts.on, true);
  assert.ok(prompts.rows.some((row) => row.includes("包扎止血")));

  const weaponPrompts = await page.evaluate(() => {
    const T = window.Taierzhuang;
    const victim = T.ai.soldiers.find((soldier) => soldier.alive) || T.ai.soldiers[0];
    if (!victim) return null;
    victim.weaponId = "Type38";
    victim.position.set(T.player.position.x + 1, T.player.position.y, T.player.position.z);
    if (victim.alive) victim.Kill();
    if (!victim.drop) victim.drop = { weaponId: "Type38", clips: 0, taken: false };
    victim.drop.weaponId = "Type38";
    victim.drop.taken = false;
    T.StepFrames(12);
    const swap = T.Debug.Prompts();
    T.state.slots.primary = null;
    T.StepFrames(12);
    const pickup = T.Debug.Prompts();
    return { swap, pickup };
  });
  assert.ok(weaponPrompts);
  assert.ok(weaponPrompts.swap.some((prompt) => prompt.keys === "F" && /^换上 /.test(prompt.label)));
  assert.ok(weaponPrompts.pickup.some((prompt) => prompt.keys === "F" && /^拾起 /.test(prompt.label)));

  const cleared = await page.evaluate(() => {
    const T = window.Taierzhuang;
    T.player.bleeding = 0;
    T.player.bandages = 0;
    T.state.slots.secondary = null;
    for (const soldier of T.ai.soldiers) {
      if (!soldier.alive && soldier.drop) soldier.drop.taken = true;
    }
    T.StepFrames(12);
    return { prompts: T.Debug.Prompts(), on: document.querySelector(".hudActions")?.classList.contains("on") };
  });
  assert.deepEqual(cleared.prompts, []);
  assert.equal(cleared.on, false);
  assert.deepEqual(errors, []);
  console.log("ok  操作面板与情境 HUD 浏览器验证通过");
} finally {
  await browser.close();
  server.close();
}
