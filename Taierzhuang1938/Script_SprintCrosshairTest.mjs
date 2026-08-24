// Dynamic-crosshair browser regression. Drives the real Shift+W and right-mouse paths.
//
// 这一版守的是**准心画的缝 = Player.SpreadDeg 的屏幕投影**：
// 上一版守的只是"跑起来比站着大 8 px"，而那两个数都是手感常数，
// 跑动时准心比真实散布窄了六成也照样过（2026-08-25 的返工就是从这里开始的）。

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
    const box = e.getBoundingClientRect();
    const reticle = T.Debug.Reticle();
    const armStyle = getComputedStyle(e.querySelector(".arm.left"));
    return {
      on: e.classList.contains("on"),
      sprint: e.classList.contains("sprint"),
      gap: parseFloat(e.style.getPropertyValue("--gap")),
      armPx: parseFloat(armStyle.width),
      centerX: box.left,
      centerY: box.top,
      hidden: e.getAttribute("aria-hidden"),
      label: e.getAttribute("aria-label"),
      arms: e.querySelectorAll(".arm").length,
      // 三个数必须一起读：真实散布、HUD 画出来的缝、按当前视场重算的应画值。
      spreadDeg: reticle.spreadDeg,
      drawn: reticle.gap,
      expected: reticle.expected,
    };
  };
  // 缝要追到稳态再读：SetCrosshair 是指数平滑的（张开 50 ms / 收拢 120 ms）。
  const settle = () => T.StepFrames(45);

  T.player.health = 100;
  T.player.spawnGrace = 99;
  for (const soldier of T.ai.soldiers) if (soldier.side === "ija") soldier.position.x += 500;
  settle();
  const idle = read();

  T.Debug.Key("ShiftLeft", true);
  T.Debug.Key("KeyW", true);
  T.StepFrames(90);
  const running = { ...read(), sprintValue: T.player.sprint };

  T.Debug.Key("ShiftLeft", false);
  T.Debug.Key("KeyW", false);
  settle();
  // 蹲下：散布按 STANCE 收到 0.66，准心必须跟着收。
  T.Debug.Key("KeyC");
  settle();
  const crouch = { ...read(), stance: T.player.stance };
  T.Debug.Key("KeyC");
  settle();

  document.dispatchEvent(new MouseEvent("mousedown", { button: 2, bubbles: true }));
  T.StepFrames(45);
  const ads = { ...read(), adsValue: T.player.ads };
  document.dispatchEvent(new MouseEvent("mouseup", { button: 2, bubbles: true }));
  settle();

  const difficulty = T.Debug.Tables().DIFFICULTY;
  difficulty.showCrosshair = false;
  T.StepFrames(2);
  const realistic = read();
  difficulty.showCrosshair = true;

  return { idle, running, crouch, ads, realistic };
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
// 站着不动的缝就是当时那支枪的腰射散布：汉阳造 3.0° 在 720p / 55° 上是 18.1 px。
// 上一版这里是 5.0 px —— 那才是"跑起来还这么准"的来源。
const tracks = (row) => Math.abs(row.gap - row.expected) < 0.6 && row.spreadDeg > 0;
const passed = report.idle.on && !report.idle.sprint && report.idle.arms === 4
  && tracks(report.idle) && report.idle.gap > 14 && report.idle.armPx >= 9
  && report.running.on && report.running.sprint && report.running.sprintValue > 0.95
  && tracks(report.running)
  && report.running.gap > report.idle.gap * 2.5
  && report.running.label === "冲刺扩散准心"
  && report.crouch.stance === "crouch" && report.crouch.gap < report.idle.gap * 0.8
  && Math.abs(report.idle.centerX - 640) < 0.1 && Math.abs(report.idle.centerY - 360) < 0.1
  && Math.abs(report.running.centerX - 640) < 0.1 && Math.abs(report.running.centerY - 360) < 0.1
  && !report.ads.on && report.ads.adsValue > 0.9
  && !report.realistic.on && errors.length === 0;
console.log(`${passed ? "ok  " : "FAIL"} 准心缝 = 真实散布：跑动撑开、蹲下收窄、开镜与写实档隐藏`);

await browser.close();
server.close();
process.exit(passed ? 0 : 1);
