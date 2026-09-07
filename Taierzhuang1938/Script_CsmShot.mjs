// 《台儿庄：血战滕县》级联阴影的视觉取证：开/关对照出图。
//
// 不是回归测试（数值断言在 `Script_CsmTest.mjs`），是**给人看的证据**：
// 同一机位、同一帧序，只翻一个开关，两张图并排就能判「这一版比上一版好」。
// 所有抖动都由帧序驱动（不用 Math.random），所以两张图之间只有开关那一处差别。
//
// 出的图（默认落 `Taierzhuang1938/_shots/`，已 gitignore）：
//   Csm_City_Cascades / Csm_City_LegacyBox   —— 级联 vs 重构前那张 66 m 单框
//   Csm_City_CascadeView                     —— 级联假彩色（看覆盖到哪、过渡带在哪）
//   Csm_Ground_ContactOn / Csm_Ground_ContactOff —— 沙袋/木箱贴地处的接触阴影
//   Csm_Ground_ContactView                   —— 接触阴影靶本尊
//
// 用法：node Taierzhuang1938/Script_CsmShot.mjs [输出目录]

import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(projectDir, "..");
const args = process.argv.slice(2);
const outDir = path.resolve(args.find((a) => !a.startsWith("--")) || path.join(projectDir, "_shots"));
fs.mkdirSync(outDir, { recursive: true });

const server = await ServeRoot(rootDir, 0);
const port = server.address().port;
const browser = await LaunchBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

const problems = [];
page.on("pageerror", (error) => problems.push(`PAGEERROR ${String(error).slice(0, 200)}`));
page.on("console", (message) => {
  if (message.type() === "error") problems.push(`CONSOLE ${message.text().slice(0, 200)}`);
});

async function Shoot(name) {
  await page.evaluate(() => window.Taierzhuang.StepFrames(40));
  await page.waitForTimeout(260);
  const file = path.join(outDir, `${name}.png`);
  await page.screenshot({ path: file });
  const size = fs.statSync(file).size / 1024;
  console.log(`${problems.length ? "ERR " : "ok  "}${name.padEnd(26)} ${size.toFixed(0)}KB  ${file}`);
  if (problems.length) for (const p of problems.slice(0, 3)) console.log(`      ${p}`);
  problems.length = 0;
}

try {
  // 全城俯瞰那一片：近处街面 + 中景院墙 + 远处城墙，一张图里三个距离都有。
  await page.goto(`http://127.0.0.1:${port}/Taierzhuang1938/index.html?shot=1&phase=overview&quality=high&scale=medium`,
    { waitUntil: "load", timeout: 300000 });
  await page.waitForFunction(() => window.Taierzhuang?.state?.ready, null, { timeout: 300000 });
  await page.evaluate(() => window.Taierzhuang.StepFrames(240));
  await page.waitForTimeout(700);

  // --- 城里：级联 vs 重构前那张 66 m 单框 ------------------------------
  // 用 Data_SamplePoints 里那条「十字街口西望通视走廊」——它一张图里同时有
  // 眼前的街面、中景的院墙和一路到西门的远景，近/中/远三个距离一次看全。
  await page.evaluate(() => {
    const T = window.Taierzhuang;
    if (T.ai) for (const s of T.ai.soldiers) { s.coolUntil = 1e9; s.fireTimer = 0; }
    T.Debug.SamplePoint("Street_Crossroad");
    T.StepFrames(20);
  });
  await Shoot("Csm_City_Cascades");

  await page.evaluate(() => {
    const T = window.Taierzhuang;
    const csm = T.lights.csm;
    // 重构前的等价装置：只留第 0 级、半径钉在 66 m、图开到 4096
    // （重构前就是这一套：一张 4096 铺 132 m = 3.2 cm/texel，66 m 外没有阴影）。
    csm.__shotWas = {
      maxRadius: csm.preset.maxRadius.slice(),
      mapSize: csm.mapSize,
      bakeOrder: csm.preset.bakeOrder.slice(),
    };
    for (let i = 1; i < csm.count; i += 1) csm.lights[i].castShadow = false;
    csm.preset.maxRadius[0] = 66;
    csm.preset.bakeOrder = [0];
    csm.SetMapSize(4096);
    csm.ForceUpdate();
    T.StepFrames(6);
  });
  await Shoot("Csm_City_LegacyBox");

  await page.evaluate(() => {
    const T = window.Taierzhuang;
    const csm = T.lights.csm;
    for (let i = 1; i < csm.count; i += 1) csm.lights[i].castShadow = true;
    csm.preset.maxRadius = csm.__shotWas.maxRadius;
    csm.preset.bakeOrder = csm.__shotWas.bakeOrder;
    csm.SetMapSize(csm.__shotWas.mapSize);
    csm.ForceUpdate();
    T.StepFrames(6);
  });

  await page.evaluate(() => window.Taierzhuang.post.SetDebugView("csmCascade"));
  await Shoot("Csm_City_CascadeView");
  await page.evaluate(() => window.Taierzhuang.post.SetDebugView("final"));

  // --- 地面：接触阴影开/关 ---------------------------------------------
  // 低头看脚下的沙袋与木箱：normalBias 把着色点推出地面，箱底那一圈本来永远
  // 「晒得到太阳」，接触阴影补的就是那一圈。
  await page.evaluate(() => {
    const T = window.Taierzhuang;
    T.Debug.SamplePoint("Street_YamenFront");
    // 低头：接触阴影补的是物件贴地那一圈，视线要压到街面上
    T.camera.rotation.x -= 0.34;
    T.StepFrames(20);
  });
  await Shoot("Csm_Ground_ContactOn");

  await page.evaluate(() => {
    const T = window.Taierzhuang;
    T.post.preset.contactShadows = false;
    T.StepFrames(6);
  });
  await Shoot("Csm_Ground_ContactOff");

  await page.evaluate(() => {
    const T = window.Taierzhuang;
    T.post.preset.contactShadows = true;
    T.StepFrames(6);
    T.post.SetDebugView("contactShadow");
  });
  await Shoot("Csm_Ground_ContactView");
  await page.evaluate(() => window.Taierzhuang.post.SetDebugView("final"));
} catch (error) {
  console.log(`THROW ${String(error).slice(0, 400)}`);
  process.exitCode = 1;
}

await browser.close();
server.close();
