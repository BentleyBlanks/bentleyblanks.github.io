// 《地道里的光》渲染健康检查：真实浏览器逐章启动，读 GL 错误码 + 页面异常 + 画面非纯色。
// 运行：node TunnelLight1943/Script_RenderHealthTest.mjs [截图输出目录]
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(projectDir, "..");
const shotsDir = process.argv[2] ? path.resolve(process.argv[2]) : null;
if (shotsDir) fs.mkdirSync(shotsDir, { recursive: true });

const server = await ServeRoot(rootDir, 0);
const port = server.address().port;
const browser = await LaunchBrowser();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });

const errors = [];
page.on("pageerror", (error) => errors.push(`PAGEERROR ${String(error).slice(0, 200)}`));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(`CONSOLE ${message.text().slice(0, 200)}`);
});

let failed = 0;
for (let chapter = 1; chapter <= 8; chapter += 1) {
  errors.length = 0;
  await page.goto(`http://127.0.0.1:${port}/TunnelLight1943/?chapter=${chapter}&fast=1`, { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction(() => window.TunnelLight !== undefined, { timeout: 60000 });
  // 过章节卡，推进若干帧（进入实际场景渲染）
  await page.evaluate(() => {
    window.TunnelLight.StepFrames(40, { advance: true });
    window.TunnelLight.StepFrames(200, { advance: true });
  });
  // 过场镜头也要走一遍：正反打/插入特写是另一套代码路径。
  // 关键：StepFrames 只推进逻辑，渲染发生在 rAF —— 必须让浏览器真的渲染若干帧，
  // 否则那条路径上的报错测不出来（FRAME_IDLE 未定义就是这么漏过去的）。
  await page.evaluate(() => {
    window.TunnelLight.JumpToChapter(window.TunnelLight.state.chapterIndex);
    for (let i = 0; i < 300; i += 1) {
      if (window.TunnelLight.state?.phase === "playing") break;
      window.TunnelLight.StepFrames(1, { advance: true });
    }
  });
  for (let line = 0; line < 12; line += 1) {
    await page.evaluate(() => window.TunnelLight.StepFrames(18, {}));
    await page.waitForTimeout(220);          // 让 rAF 真渲染这一构图
    await page.evaluate(() => window.TunnelLight.StepFrames(1, { advance: true }));
    await page.waitForTimeout(120);
  }
  await page.waitForTimeout(900);

  const health = await page.evaluate(() => {
    const tl = window.TunnelLight;
    const gl = tl.renderer.getContext();
    const glError = gl.getError();
    const canvas = tl.renderer.domElement;
    tl.world.Render(); // 不开 preserveDrawingBuffer，取样必须与渲染同一个任务
    const probe = document.createElement("canvas");
    probe.width = 64; probe.height = 36;
    const ctx = probe.getContext("2d");
    ctx.drawImage(canvas, 0, 0, 64, 36);
    const data = ctx.getImageData(0, 0, 64, 36).data;
    let min = 255, max = 0;
    for (let i = 0; i < data.length; i += 4) {
      const v = (data[i] + data[i + 1] + data[i + 2]) / 3;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    return {
      glError,
      spread: max - min,
      chapterIndex: tl.state?.chapterIndex,
      phase: tl.state?.phase,
      beat: tl.state ? (tl.state.beatIndex ?? -1) : -1,
    };
  });

  const problems = [];
  if (health.glError !== 0) problems.push(`GL 错误码 ${health.glError}`);
  if (health.chapterIndex !== chapter - 1) problems.push(`章节错位：期望 ${chapter - 1} 实际 ${health.chapterIndex}`);
  if (health.spread < 8) problems.push(`画面近乎纯色（明度差 ${health.spread}）`);
  if (errors.length) problems.push(errors.join(" | "));

  if (shotsDir) {
    await page.screenshot({ path: path.join(shotsDir, `chapter${chapter}.png`) });
  }
  if (problems.length) {
    failed += 1;
    console.error(`✗ 第${chapter}章: ${problems.join("；")}`);
  } else {
    console.log(`✓ 第${chapter}章 渲染正常（明度差 ${health.spread}，beat=${health.beat}）`);
  }
}

await browser.close();
server.close();
if (failed) {
  console.error(`渲染健康检查失败：${failed} 章`);
  process.exit(1);
}
console.log("渲染健康检查全部通过 ✓");
