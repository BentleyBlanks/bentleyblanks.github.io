// 运行时性能剖析器（Script_Profiler + Script_EditorProfiler）的接线回归。
//
// 断的是**接线与还原**，不断具体毫秒数（headless 是 SwiftShader，数字没有意义）：
//   1. 叠加层开 = profiler.Enable：CPU 桶有数、renderer.info 改手动、阴影 render 被包；
//   2. GPU 分段查询（机器支持 EXT_disjoint_timer_query_webgl2 时）几帧后能收到
//      prepass / main / composite 的段耗时；
//   3. 叠加层关 = 全部钩子还原（info.autoReset、shadowMap.render、post.profiler），
//      并且不再记录新帧。
//
// 用法：node Taierzhuang1938/Script_ProfilerTest.mjs

import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(projectDir, "..");
const server = await ServeRoot(rootDir, 0);
const port = server.address().port;
const browser = await LaunchBrowser();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });

const errors = [];
page.on("pageerror", (error) => errors.push(`PAGEERROR ${String(error).slice(0, 240)}`));
page.on("console", (message) => {
  if (message.type() !== "error") return;
  const url = message.location()?.url || "";
  if (/fonts\.(googleapis|gstatic)\.com/.test(url)) return;
  errors.push(`CONSOLE ${message.text().slice(0, 240)}`);
});

let result = null;
try {
  await page.goto(`http://127.0.0.1:${port}/Taierzhuang1938/?shot=1&phase=2&quality=high&scale=small`,
    { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => window.Taierzhuang !== undefined
    && window.Taierzhuang.state.ready, null, { timeout: 300000 });
  result = await page.evaluate(async () => {
    const T = window.Taierzhuang;
    const checks = [];
    const Check = (name, ok, detail = "") => checks.push({ name, ok: !!ok, detail: String(detail) });

    Check("剖析器存在且默认休眠", T.profiler && !T.profiler.on);

    // --- 开 ---
    T.editor.Toggle("profiler");
    Check("叠加层已登记", T.editor.overlays.has("profiler"));
    Check("Enable 生效", T.profiler.on);
    Check("renderer.info 改为手动清零", T.renderer.info.autoReset === false);
    Check("阴影 render 已被包", T.renderer.shadowMap.render.name === "ProfiledShadowRender");
    Check("post 已接上剖析器", T.post.profiler === T.profiler);

    T.StepFrames(30);
    const history = T.profiler.history;
    Check("30 帧后有记录", history.length >= 30, `len=${history.length}`);
    const lastRecord = history[history.length - 1];
    Check("整帧 CPU 有数", lastRecord && lastRecord.cpuMs > 0, `cpuMs=${lastRecord?.cpuMs}`);
    // 接线断言看 key 是否进了累计器：headless 的 performance.now 只有 0.1 ms 粒度，
    // player 这类微秒级的桶单帧常记成 0，按「有数」断会抽风。
    for (const bucket of ["input", "player", "viewmodel", "ai", "physics", "vfx",
      "combat", "story", "hud", "matrix", "actorBatch", "post"]) {
      Check(`CPU 桶 ${bucket} 已接线`, bucket in T.profiler.cpu);
    }
    for (const bucket of ["ai", "post"]) {
      Check(`CPU 桶 ${bucket} 有数`, lastRecord.cpu[bucket] > 0,
        `${bucket}=${lastRecord.cpu[bucket]}`);
    }
    Check("draw call 计到整帧总量", lastRecord.calls > 50, `calls=${lastRecord.calls}`);

    // --- GPU 段结果（需要让出 event loop 几个来回才可读）---
    const timerAvailable = T.profiler.timerAvailable;
    let gpuRecord = null;
    if (timerAvailable) {
      for (let retry = 0; retry < 30 && !gpuRecord; retry += 1) {
        await new Promise((resolve) => setTimeout(resolve, 0));
        T.StepFrames(2);
        gpuRecord = T.profiler.history.findLast?.((row) => row.gpu)
          || [...T.profiler.history].reverse().find((row) => row.gpu);
      }
      Check("GPU 段结果到达", !!gpuRecord);
      if (gpuRecord) {
        for (const pass of ["prepass", "main", "composite", "fxaa"]) {
          Check(`GPU 段 ${pass} 有数`, gpuRecord.gpu[pass] >= 0
            && gpuRecord.gpu[pass] !== undefined, `${pass}=${gpuRecord.gpu[pass]}`);
        }
        Check("GPU 合计为正", gpuRecord.gpuTotal > 0, `total=${gpuRecord.gpuTotal}`);
      }
    }
    const summary = T.profiler.Summary(30);
    Check("Summary 聚合可用", summary.frames > 0 && summary.cpu.post
      && summary.cpu.post.avg > 0, `frames=${summary.frames}`);

    // --- 关：钩子必须一件不剩地还原 ---
    T.editor.Toggle("profiler");
    Check("Disable 生效", !T.profiler.on);
    Check("renderer.info 还原自动清零", T.renderer.info.autoReset === true);
    Check("阴影 render 已还原", T.renderer.shadowMap.render.name !== "ProfiledShadowRender");
    Check("post 已摘下剖析器", T.post.profiler === null);
    const lengthBefore = T.profiler.history.length;
    T.StepFrames(5);
    Check("关掉后不再记帧", T.profiler.history.length === lengthBefore);

    return { checks, timerAvailable };
  });
} finally {
  await browser.close();
  server.close();
}

let failed = 0;
if (result) {
  console.log(`GPU 计时扩展：${result.timerAvailable ? "可用" : "不可用（跳过 GPU 段断言）"}`);
  for (const check of result.checks) {
    if (!check.ok) failed += 1;
    console.log(`${check.ok ? "PASS" : "FAIL"} ${check.name}${check.detail ? ` (${check.detail})` : ""}`);
  }
}
for (const error of errors) console.log(error);
process.exit(failed || errors.length || !result ? 1 : 0);
