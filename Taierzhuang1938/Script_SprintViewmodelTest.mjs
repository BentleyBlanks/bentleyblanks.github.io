// First-person sprint visual regression. Drives the same Shift+W input path as a player
// and captures the Dadao frame that previously filled the screen with the imported arm mesh.

import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(projectDir, "..");
// arms=rig：导入整臂现在是可选路径（默认旧手模，见 Script_Main 的 RIGGED_ARMS），
// 而这条测试量的正是导入整臂在冲刺姿态下的近裁面回退。
const server = await ServeRoot(rootDir, 0);
const port = server.address().port;
const browser = await LaunchBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on("pageerror", (error) => errors.push(String(error)));
page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });

await page.goto(`http://127.0.0.1:${port}/Taierzhuang1938/?shot=1&phase=2&quality=medium&scale=small&arms=rig`,
  { waitUntil: "load", timeout: 120000 });
await page.waitForFunction(() => window.Taierzhuang?.state?.ready, null, { timeout: 180000 });
const report = await page.evaluate(() => {
  const T = window.Taierzhuang;
  T.player.health = 100;
  T.player.spawnGrace = 99;
  for (const soldier of T.ai.soldiers) if (soldier.side === "ija") soldier.position.x += 500;
  T.viewmodel.Equip("Dadao");
  T.Debug.Key("ShiftLeft", true);
  T.Debug.Key("KeyW", true);
  T.StepFrames(90);
  const rigged = T.viewmodel.riggedArms;
  const data = {
    sprint: T.player.sprint,
    spring: T.viewmodel.sprintSpring.value,
    weapon: T.viewmodel.weaponId,
    riggedVisible: rigged?.root?.visible,
    legacyVisible: rigged?.legacyMeshes?.filter((mesh) => mesh.visible).length || 0,
    fallback: rigged?.sprintFallback,
  };
  return data;
});

const screenshotPath = path.join(os.tmpdir(), "TaierzhuangSprintViewmodel.png");
await page.screenshot({ path: screenshotPath });
const recovery = await page.evaluate(() => {
  const T = window.Taierzhuang;
  T.Debug.Key("ShiftLeft", false);
  T.Debug.Key("KeyW", false);
  T.StepFrames(90);
  const rigged = T.viewmodel.riggedArms;
  return {
    fallback: rigged?.sprintFallback,
    riggedVisible: rigged?.root?.visible,
    legacyVisible: rigged?.legacyMeshes?.filter((mesh) => mesh.visible).length || 0,
  };
});
console.log(JSON.stringify({ ...report, recovery, screenshotPath, errors }, null, 2));

const passed = report.sprint > 0.95 && report.spring > 0.95
  && report.weapon === "Dadao" && report.riggedVisible === false
  && report.fallback === true && report.legacyVisible > 0
  && recovery.fallback === false && recovery.riggedVisible === true
  && recovery.legacyVisible === 0 && errors.length === 0;
console.log(`${passed ? "ok  " : "FAIL"} 大刀 Shift+W 冲刺切到近裁面安全手模`);

await browser.close();
server.close();
process.exit(passed ? 0 : 1);
