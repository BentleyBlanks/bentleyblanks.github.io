// Dynamic-crosshair browser regression. Drives the real Shift+W and right-mouse paths.

import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(projectDir, "..");
const server = await ServeRoot(rootDir, 0);
const port = server.address().port;
const browser = await LaunchBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on("pageerror", (error) => errors.push(String(error)));
page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });

await page.goto(`http://127.0.0.1:${port}/Taierzhuang1938/?shot=1&phase=2&quality=medium&scale=small`,
  { waitUntil: "load", timeout: 120000 });
await page.waitForFunction(() => window.Taierzhuang?.state?.ready, { timeout: 180000 });

const report = await page.evaluate(() => {
  const T = window.Taierzhuang;
  const read = () => {
    const e = document.querySelector(".hudCrosshair");
    return {
      on: e.classList.contains("on"),
      sprint: e.classList.contains("sprint"),
      gap: parseFloat(e.style.getPropertyValue("--gap")),
      centerX: e.getBoundingClientRect().left,
      centerY: e.getBoundingClientRect().top,
      hidden: e.getAttribute("aria-hidden"),
      label: e.getAttribute("aria-label"),
      arms: e.querySelectorAll(".arm").length,
    };
  };

  T.player.health = 100;
  T.player.spawnGrace = 99;
  for (const soldier of T.ai.soldiers) if (soldier.side === "ija") soldier.position.x += 500;
  T.StepFrames(5);
  const idle = read();

  T.Debug.Key("ShiftLeft", true);
  T.Debug.Key("KeyW", true);
  T.StepFrames(90);
  const running = { ...read(), sprintValue: T.player.sprint };

  T.Debug.Key("ShiftLeft", false);
  T.Debug.Key("KeyW", false);
  document.dispatchEvent(new MouseEvent("mousedown", { button: 2, bubbles: true }));
  T.StepFrames(45);
  const ads = { ...read(), adsValue: T.player.ads };
  document.dispatchEvent(new MouseEvent("mouseup", { button: 2, bubbles: true }));

  const difficulty = T.Debug.Tables().DIFFICULTY;
  difficulty.showCrosshair = false;
  T.StepFrames(2);
  const realistic = read();
  difficulty.showCrosshair = true;

  return { idle, running, ads, realistic };
});

const screenshotPath = path.join(os.tmpdir(), "TaierzhuangSprintCrosshair.png");
// Return to the requested sprint state for the visual artifact.
await page.evaluate(() => {
  const T = window.Taierzhuang;
  T.Debug.Key("ShiftLeft", true);
  T.Debug.Key("KeyW", true);
  T.StepFrames(90);
});
await page.screenshot({ path: screenshotPath });

console.log(JSON.stringify({ ...report, screenshotPath, errors }, null, 2));
const passed = report.idle.on && !report.idle.sprint && report.idle.arms === 4
  && report.running.on && report.running.sprint && report.running.sprintValue > 0.95
  && report.running.gap >= report.idle.gap + 8
  && report.running.label === "冲刺扩散准心"
  && Math.abs(report.idle.centerX - 640) < 0.1 && Math.abs(report.idle.centerY - 360) < 0.1
  && Math.abs(report.running.centerX - 640) < 0.1 && Math.abs(report.running.centerY - 360) < 0.1
  && !report.ads.on && report.ads.adsValue > 0.9
  && !report.realistic.on && errors.length === 0;
console.log(`${passed ? "ok  " : "FAIL"} 跑动保留扩散准心，开镜与写实档隐藏`);

await browser.close();
server.close();
process.exit(passed ? 0 : 1);
