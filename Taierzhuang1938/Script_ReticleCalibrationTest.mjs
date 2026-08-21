// 枪械放大准心校准专项：真实 ADS FOV、弹道中心、像素拖拽与退出还原。
// 用法：node Taierzhuang1938/Script_ReticleCalibrationTest.mjs

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
page.on("console", (message) => {
  if (message.type() === "error" && !/fonts\.(googleapis|gstatic)\.com/.test(message.location()?.url || "")) {
    errors.push(message.text());
  }
});

let failed = 0;
function Check(name, ok, detail = "") {
  if (!ok) failed += 1;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

try {
  await page.goto(`http://127.0.0.1:${port}/Taierzhuang1938/?quality=medium&scale=small&phase=5&menu=0`,
    { waitUntil: "load", timeout: 120000 });
  await page.waitForFunction(() => window.Taierzhuang !== undefined, { timeout: 240000 });
  await page.click("#bootStart");
  const result = await page.evaluate(() => {
    const T = window.Taierzhuang;
    const original = { fov: T.camera.fov, weapon: T.viewmodel.weaponId };
    const editor = T.editor.Open("weapon");
    editor.SetWeapon("Zb26");
    editor.EnterCalibration();
    T.StepFrames(18);
    const opened = {
      fov: T.camera.fov,
      marker: document.querySelector(".edCross")?.classList.contains("calibration"),
      label: document.querySelector(".edCross span")?.textContent,
    };
    editor.SetCalibration(0, 0);
    editor.OnDrag(8, -4, 0); // 720p 画布 → 900p 基准倍率 1.25
    T.StepFrames(4);
    const adjusted = {
      offset: T.viewmodel.GetIronSightOffsetPixels(),
      output: editor.calibrationOutput.value,
    };
    editor.SetMode("bench");
    const hidden = !document.querySelector(".edCross")?.classList.contains("on");
    T.editor.Close();
    const restored = { fov: T.camera.fov, weapon: T.viewmodel.weaponId };
    return { original, opened, adjusted, hidden, restored };
  });

  Check("ZB26 校准使用 55° × 0.80 的真实放大视野",
    Math.abs(result.opened.fov - 44) < 0.01, `${result.opened.fov}°`);
  Check("红十字明确标出真实弹道中心",
    result.opened.marker && result.opened.label === "真实弹道");
  Check("拖拽按 900p 基准换算并实时输出配置",
    result.adjusted.offset.x === 10 && result.adjusted.offset.y === 5
      && result.adjusted.output.includes("Zb26: { x: 10, y: 5 }"),
    JSON.stringify(result.adjusted));
  Check("离开第一人称后标记收起", result.hidden);
  Check("退出编辑器后 FOV 与玩家枪械还原",
    result.restored.fov === result.original.fov && result.restored.weapon === result.original.weapon,
    JSON.stringify({ before: result.original, after: result.restored }));
  Check("页面无运行时错误", errors.length === 0, errors.slice(0, 2).join(" | "));
} finally {
  await browser.close();
  server.close();
}

if (failed) {
  console.error(`\n准心校准专项失败：${failed} 项。`);
  process.exit(1);
}
console.log("\n准心校准专项全过。");
