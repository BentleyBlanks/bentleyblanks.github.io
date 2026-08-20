// 《滕县 一九三八》人物可见性回归：人数预算不得再藏活人，尸体不得在本关内消失。
//
// 用法：node Taierzhuang1938/Script_VisibilityTest.mjs
// 退出码即成败。

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
page.on("pageerror", (error) => errors.push(`PAGEERROR ${String(error).slice(0, 240)}`));
page.on("console", (message) => {
  if (message.type() !== "error") return;
  const url = message.location()?.url || "";
  if (/fonts\.(googleapis|gstatic)\.com/.test(url)) return;
  errors.push(`CONSOLE ${message.text().slice(0, 240)}`);
});

const results = [];
function Check(name, ok, detail = "") {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? `  — ${detail}` : ""}`);
}

try {
  await page.goto(`http://127.0.0.1:${port}/Taierzhuang1938/?shot=1&phase=2&quality=low&scale=small`,
    { waitUntil: "load", timeout: 120000 });
  await page.waitForFunction(() => window.Taierzhuang !== undefined, { timeout: 240000 });
  await page.evaluate(() => window.Taierzhuang.StepFrames(30));

  const visibility = await page.evaluate(() => {
    const T = window.Taierzhuang;
    const actors = T.ai.soldiers.filter((soldier) => soldier.actor).slice(0, 30);
    T.camera.position.set(0, 4, 0);
    T.camera.lookAt(0, 1, -80);
    T.camera.updateProjectionMatrix();
    for (let index = 0; index < actors.length; index += 1) {
      const soldier = actors[index];
      const column = index % 10;
      const row = Math.floor(index / 10);
      soldier.position.set((column - 4.5) * 2.3, 0, -35 - row * 16);
      soldier.actor.root.position.copy(soldier.position);
    }
    T.ai.CullActors(T.camera);
    return {
      arranged: actors.length,
      visible: actors.filter((soldier) => soldier.actor.root.visible).length,
      legacyBudgetPresent: Object.hasOwn(T.ai, "visibleBudget"),
    };
  });
  Check("视锥内超过旧 13 人上限仍全部显示",
    visibility.arranged > 13 && visibility.visible === visibility.arranged,
    `${visibility.visible}/${visibility.arranged}`);
  Check("运行时已没有人物可见名额", !visibility.legacyBudgetPresent);

  const corpses = await page.evaluate(() => {
    const T = window.Taierzhuang;
    const victims = T.ai.soldiers.filter((soldier) => soldier.alive && soldier.actor).slice(0, 30);
    for (const soldier of victims) soldier.Kill();
    // 旧逻辑在 Update 尾部会把超过 26 的最早尸体 Remove 掉。一帧就足以触发；
    // 多推四秒也覆盖尸体刚体落地并被回收后的稳定状态。
    T.StepFrames(5 * 60, 1 / 60, false);
    T.camera.position.set(0, 4, 0);
    T.camera.lookAt(0, 1, -80);
    T.camera.updateProjectionMatrix();
    T.ai.CullActors(T.camera);
    return {
      killed: victims.length,
      retained: victims.filter((soldier) => T.ai.soldiers.includes(soldier) && soldier.actor).length,
      visible: victims.filter((soldier) => soldier.actor?.root.visible).length,
      oldestSeconds: Math.max(0, ...victims.map((soldier) => soldier.deadTime)),
    };
  });
  Check("超过旧 26 具上限后尸体仍全部保留",
    corpses.killed > 26 && corpses.retained === corpses.killed,
    `${corpses.retained}/${corpses.killed}`);
  Check("尸体稳定落地后仍可见", corpses.visible === corpses.killed,
    `${corpses.visible}/${corpses.killed}，最老 ${corpses.oldestSeconds.toFixed(1)} s`);
  Check("整趟没有页面报错", errors.length === 0, errors.slice(0, 3).join(" | "));
} finally {
  await browser.close();
  server.close();
}

const failed = results.filter((result) => !result.ok);
console.log(`\n${results.length - failed.length}/${results.length} 通过`);
if (failed.length) {
  console.log("失败：\n  " + failed.map((result) => result.name).join("\n  "));
  process.exit(1);
}
