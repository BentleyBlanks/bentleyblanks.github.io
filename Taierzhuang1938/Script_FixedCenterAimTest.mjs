// Standard-FPS aiming regression: HUD, ballistic direction and settled iron sights share screen center.

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
await page.waitForFunction(() => window.Taierzhuang?.state?.ready, null, { timeout: 180000 });

const report = await page.evaluate(() => {
  const T = window.Taierzhuang;
  T.player.health = 100;
  T.player.spawnGrace = 99;
  for (const soldier of T.ai.soldiers) if (soldier.side === "ija") soldier.position.x += 500;

  // Stationary mouse input used to accumulate inside the free-aim cone. It must now rotate the camera.
  T.player.yaw = 0;
  T.player.pitch = 0;
  T.player.aimYaw = 0;
  T.player.aimPitch = 0;
  T.input.lookX += 40;
  T.input.lookY += -20;
  T.StepFrames(1);
  const view = T.player.ViewDirection();
  const aim = T.player.AimDirection();
  const crosshair = document.querySelector(".hudCrosshair").getBoundingClientRect();
  const center = {
    crosshairX: crosshair.left,
    crosshairY: crosshair.top,
    yaw: T.player.yaw,
    pitch: T.player.pitch,
    aimYaw: T.player.aimYaw,
    aimPitch: T.player.aimPitch,
    directionErrorDeg: Math.acos(Math.min(1, Math.max(-1, view.dot(aim)))) * 180 / Math.PI,
    freeAimDeg: T.Debug.Difficulty().freeAimDeg,
  };

  document.dispatchEvent(new MouseEvent("mousedown", { button: 2, bubbles: true }));
  const firearms = ["ZhongZheng", "HanYang", "Type38", "Zb26", "Mauser96"];
  const sights = {};
  for (const id of firearms) {
    T.player.aimYaw = 0;
    T.player.aimPitch = 0;
    T.viewmodel.Equip(id);
    T.StepFrames(240);
    T.camera.updateMatrixWorld(true);
    const vm = T.viewmodel;
    const rear = vm.rig.sight.clone();
    const axis = vm.rig.sight.clone();
    axis.z -= 0.40;
    vm.rig.group.localToWorld(rear);
    vm.rig.group.localToWorld(axis);
    rear.project(T.camera);
    axis.project(T.camera);
    const toPixels = (p) => ({
      x: p.x * innerWidth * 0.5,
      y: p.y * innerHeight * 0.5,
      error: Math.hypot(p.x * innerWidth * 0.5, p.y * innerHeight * 0.5),
    });
    sights[id] = {
      rear: toPixels(rear),
      axis: toPixels(axis),
      ads: T.player.ads,
      crosshairVisible: document.querySelector(".hudCrosshair").classList.contains("on"),
      configuredOffsetMm: Math.hypot(vm.adsOffset.x, vm.adsOffset.y) * 1000,
    };
  }
  return { center, sights };
});

const screenshotPath = path.join(os.tmpdir(), "TaierzhuangFixedCenterAds.png");
await page.screenshot({ path: screenshotPath });
console.log(JSON.stringify({ ...report, screenshotPath, errors }, null, 2));

const sightRows = Object.values(report.sights);
const passed = Math.abs(report.center.crosshairX - 640) < 0.1
  && Math.abs(report.center.crosshairY - 360) < 0.1
  && report.center.freeAimDeg === 0
  && Math.abs(report.center.aimYaw) < 1e-6 && Math.abs(report.center.aimPitch) < 1e-6
  && report.center.directionErrorDeg < 0.0001
  && sightRows.length === 5
  && sightRows.every((row) => row.ads > 0.99 && !row.crosshairVisible
    && row.configuredOffsetMm < 0.001 && row.rear.error < 1.5 && row.axis.error < 1.5)
  && errors.length === 0;
console.log(`${passed ? "ok  " : "FAIL"} 固定中心准心、弹道与五支枪机械瞄具共轴`);

await browser.close();
server.close();
process.exit(passed ? 0 : 1);
