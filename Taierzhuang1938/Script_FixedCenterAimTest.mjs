// Standard-FPS aiming regression: HUD, ballistic direction and settled iron sights share screen center.

import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";
import { WeaponShelved } from "./Data_Weapons.mjs";

// 手枪暂时停用（Data_Weapons.SHELVED_WEAPONS），停用期间不量它的机械瞄具。
const FIREARMS = ["ZhongZheng", "HanYang", "Type38", "Zb26", "ServicePistol"].filter((id) => !WeaponShelved(id));
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

const report = await page.evaluate((firearms) => {
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
}, FIREARMS);

// Reproduce stationary close-wall firing through the production trigger and
// ballistic marcher; aim-vector-only checks cannot detect a displaced origin.
await page.goto(`http://127.0.0.1:${port}/Taierzhuang1938/?shot=1&weapons=1&manual=1&quality=medium&scale=small`,
  { waitUntil: "load", timeout: 120000 });
await page.waitForFunction(() => window.Taierzhuang?.state?.ready, null, { timeout: 180000 });
report.wall = await page.evaluate(() => {
  const T = window.Taierzhuang, range = T.Debug.WeaponRange;
  range.GoTo("table", "ZhongZheng"); T.StepFrames(12); T.Debug.Key("KeyF");
  T.StepFrames(120, 1 / 60, false); range.SetAmmoMode("infinite");
  T.player.Spawn(2354, 2460, Math.PI / 2);
  T.Debug.Mouse(2, false); T.StepFrames(120, 1 / 60, false);
  const samples = [];
  for (let i = 0; i < 80; i += 1) {
    T.player.yaw = Math.PI / 2; T.player.pitch = 0;
    T.player.aimYaw = 0; T.player.aimPitch = 0;
    T.StepFrames(2, 1 / 60, false);
    const eye = T.player.EyePosition.clone();
    const before = T.state.playerShots;
    T.Debug.Fire();
    const shot = range.LastShot();
    if (T.state.playerShots !== before + 1) throw new Error("Wall trigger did not fire");
    const radius = Math.tan(shot.spreadRad / 2) * (eye.x - shot.end[0]);
    samples.push({ x: (shot.end[2] - eye.z) / radius,
      y: (shot.end[1] - eye.y) / radius, wall: shot.hitKind === "wall",
      originError: Math.hypot(...shot.from.map((v, j) => v - eye.toArray()[j])),
      triggerError: Math.hypot(...shot.aimDirection.map((v, j) => v - shot.aimAtTrigger[j])) });
    T.StepFrames(150 + i % 11, 1 / 60, false);
  }
  T.player.yaw = Math.PI / 2; T.player.pitch = 0; T.StepFrames(30);
  const meanX = samples.reduce((sum, row) => sum + row.x, 0) / samples.length;
  const meanY = samples.reduce((sum, row) => sum + row.y, 0) / samples.length;
  const left = samples.filter((row) => row.x < 0).length;
  return { count: samples.length, meanX, meanY, left, right: samples.length - left,
    valid: samples.every((row) => row.wall && row.originError < 1e-6 && row.triggerError < 1e-6
      && Math.hypot(row.x, row.y) < 1.03) };
});

const screenshotPath = path.join(os.tmpdir(), "TaierzhuangFixedCenterAds.png");
await page.screenshot({ path: screenshotPath });
console.log(JSON.stringify({ ...report, screenshotPath, errors }, null, 2));

const sightRows = Object.values(report.sights);
const passed = report.wall.valid && Math.abs(report.wall.meanX) < 0.2
  && Math.abs(report.wall.meanY) < 0.2 && report.wall.left > 20 && report.wall.right > 20
  && Math.abs(report.center.crosshairX - 640) < 0.1
  && Math.abs(report.center.crosshairY - 360) < 0.1
  && report.center.freeAimDeg === 0
  && Math.abs(report.center.aimYaw) < 1e-6 && Math.abs(report.center.aimPitch) < 1e-6
  && report.center.directionErrorDeg < 0.0001
  && sightRows.length === FIREARMS.length
  && sightRows.every((row) => row.ads > 0.99 && !row.crosshairVisible
    && row.configuredOffsetMm < 0.001 && row.rear.error < 1.5 && row.axis.error < 1.5)
  && errors.length === 0;
console.log(`${passed ? "ok  " : "FAIL"} 固定中心准心、弹道与 ${FIREARMS.length} 支枪机械瞄具共轴`);

await browser.close();
server.close();
process.exit(passed ? 0 : 1);
