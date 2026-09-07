// 《台儿庄：血战滕县》级联阴影的视觉取证：开/关对照出图。
//
// 不是回归测试（数值断言在 `Script_CsmTest.mjs`），是**给人看的证据**：
// 同一机位、同一帧序，只翻一个开关，两张图并排就能判「这一版比上一版好」。
// 所有抖动都由帧序驱动（不用 Math.random），所以两张图之间只有开关那一处差别。
//
// ## 为什么在探针页拍而不是正片
// 正片这一关的天光（smokyDay / dusk）是**烟尘天**：环境光压得很高、雾很厚，
// 街面上的太阳阴影本来就淡到几乎看不出（那是那一关的美术意图，不是阴影坏了 ——
// 见 Script_Sky 里 smokyDay 那一段关于「6—8:1 照片感」的账）。拿它当阴影证据
// 什么也证不了。探针页的 street 场景是本仓自己的渲染审查场（`Script_ShotTest`
// 的 Probe_Street* 那一组就在这儿拍），几何干净、影子明确，而且秒开。
//
// 出的图（默认落 `Taierzhuang1938/_shots/`，已 gitignore）：
//   Csm_Street_Cascades / Csm_Street_LegacyBox   —— 级联 vs 重构前那张 66 m 单框
//   Csm_Street_CascadeView                       —— 级联假彩色（覆盖到哪、过渡带在哪）
//   Csm_Street_PenumbraView                      —— PCSS 半影宽度（蓝硬、橙软）
//   Csm_Street_ContactOn / Csm_Street_ContactOff —— 物件贴地那一圈的接触阴影
//   Csm_Street_ContactView                       —— 接触阴影靶本尊
//
// 用法：node Taierzhuang1938/Script_CsmShot.mjs [输出目录] [--preset=dusk]

import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(projectDir, "..");
const args = process.argv.slice(2);
const outDir = path.resolve(args.find((a) => !a.startsWith("--")) || path.join(projectDir, "_shots"));
const preset = (args.find((a) => a.startsWith("--preset=")) || "--preset=dusk").slice(9);
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
  // TAA 要滚满 ≥8 帧才谈得上比对；一轮 bakeOrder 是 7 帧，24 帧两样都盖住了。
  await page.evaluate(() => window.Probe.StepFrames(24, 1 / 60));
  await page.waitForTimeout(200);
  const file = path.join(outDir, `${name}.png`);
  await page.screenshot({ path: file });
  const size = fs.statSync(file).size / 1024;
  console.log(`${problems.length ? "ERR " : "ok  "}${name.padEnd(28)} ${size.toFixed(0)}KB  ${file}`);
  if (problems.length) for (const p of problems.slice(0, 3)) console.log(`      ${p}`);
  problems.length = 0;
}

try {
  await page.goto(
    `http://127.0.0.1:${port}/Taierzhuang1938/Probe.html?quality=high&preset=${preset}&scene=street&gi=0`,
    { waitUntil: "load", timeout: 300000 },
  );
  await page.waitForFunction(() => window.Probe?.state?.ready, null, { timeout: 300000 });
  await page.evaluate(() => {
    const P = window.Probe;
    P.state.elapsed = 0;
    P.post.frame = 0;
    P.lights.NotifyCameraCut();
    P.StepFrames(60, 1 / 60);
  });

  await Shoot("Csm_Street_Cascades");

  // 重构前的等价装置：只留第 0 级、半径钉在 66 m、图开到 4096
  // （重构前就是这一套：一张 4096 铺 132 m = 3.2 cm/texel，66 m 外没有阴影）。
  await page.evaluate(() => {
    const csm = window.Probe.lights.csm;
    csm.__shotWas = {
      maxRadius: csm.preset.maxRadius.slice(),
      bakeOrder: csm.preset.bakeOrder.slice(),
      mapSize: csm.mapSize,
    };
    for (let i = 1; i < csm.count; i += 1) csm.lights[i].castShadow = false;
    csm.preset.maxRadius[0] = 66;
    csm.preset.bakeOrder = [0];
    csm.SetMapSize(4096);
    csm.ForceUpdate();
    window.Probe.StepFrames(8, 1 / 60);
  });
  await Shoot("Csm_Street_LegacyBox");

  await page.evaluate(() => {
    const csm = window.Probe.lights.csm;
    for (let i = 1; i < csm.count; i += 1) csm.lights[i].castShadow = true;
    csm.preset.maxRadius = csm.__shotWas.maxRadius;
    csm.preset.bakeOrder = csm.__shotWas.bakeOrder;
    csm.SetMapSize(csm.__shotWas.mapSize);
    csm.ForceUpdate();
    window.Probe.StepFrames(10, 1 / 60);
  });

  await page.evaluate(() => window.Probe.post.SetDebugView("csmCascade"));
  await Shoot("Csm_Street_CascadeView");
  await page.evaluate(() => window.Probe.post.SetDebugView("csmPenumbra"));
  await Shoot("Csm_Street_PenumbraView");
  await page.evaluate(() => window.Probe.post.SetDebugView("final"));

  // 接触阴影：补物件贴地那一圈（normalBias 把着色点推出地面造成的漏光）
  await Shoot("Csm_Street_ContactOn");
  await page.evaluate(() => { window.Probe.post.preset.contactShadows = false; });
  await Shoot("Csm_Street_ContactOff");
  await page.evaluate(() => {
    window.Probe.post.preset.contactShadows = true;
    window.Probe.StepFrames(4, 1 / 60);
    window.Probe.post.SetDebugView("contactShadow");
  });
  await Shoot("Csm_Street_ContactView");
  await page.evaluate(() => window.Probe.post.SetDebugView("final"));
} catch (error) {
  console.log(`THROW ${String(error).slice(0, 400)}`);
  process.exitCode = 1;
}

await browser.close();
server.close();
