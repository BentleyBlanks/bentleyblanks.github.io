// 运行时性能剖析器（Script_Profiler + Script_ProfilerReport + Script_EditorProfiler）
// 的接线回归。
//
// 断的是**接线与还原**，不断具体毫秒数（headless 是 SwiftShader，数字没有意义）：
//   1. 叠加层开 = profiler.Enable：CPU 桶有数、renderer.info 改手动、阴影 render 被包、
//      Object3D 的矩阵/遍历方法被包；
//   2. 子桶接线：`ai/act`、`ai/act/anim`、`story/*` 这些带斜杠的 key 真的进了累计器；
//      阴影按级联拆成 `shadow/c0`…；每个 GPU 段记了 draw call 与三角数；
//      每帧记了新编译的着色器程序数；
//   3. GPU 分段查询（机器支持 EXT_disjoint_timer_query_webgl2 时）几帧后能收到
//      prepass / main / composite 的段耗时；
//   4. 叠加层关 = 全部钩子还原（info.autoReset、shadowMap.render、post.profiler、
//      Object3D 原型、LoAF 观察者），并且不再记录新帧。
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
    const THREE = await import("three");
    const proto = THREE.Object3D.prototype;
    const checks = [];
    const Check = (name, ok, detail = "") => checks.push({ name, ok: !!ok, detail: String(detail) });

    Check("剖析器存在且默认休眠", T.profiler && !T.profiler.on);
    Check("休眠时 Object3D 原型是干净的", proto.updateMatrixWorld.name !== "ProfiledUpdateMatrixWorld");

    // --- 开 ---
    T.editor.Toggle("profiler");
    Check("叠加层已登记", T.editor.overlays.has("profiler"));
    Check("Enable 生效", T.profiler.on);
    Check("renderer.info 改为手动清零", T.renderer.info.autoReset === false);
    Check("阴影 render 已被包", T.renderer.shadowMap.render.name === "ProfiledShadowRender");
    Check("post 已接上剖析器", T.post.profiler === T.profiler);
    Check("updateMatrixWorld 已被包", proto.updateMatrixWorld.name === "ProfiledUpdateMatrixWorld");
    Check("updateWorldMatrix 已被包", proto.updateWorldMatrix.name === "ProfiledUpdateWorldMatrix");
    Check("traverse 已被包", proto.traverse.name === "ProfiledTraverse");

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
    // 子桶：带斜杠的 key 存的是整条路径，分层只发生在显示层。
    for (const bucket of ["ai/think", "ai/act", "ai/act/anim", "ai/cull", "ai/grenade",
      "story/objectives", "story/narrative", "frameSetup"]) {
      Check(`CPU 子桶 ${bucket} 已接线`, bucket in T.profiler.cpu);
    }
    Check("父桶含子桶（ai ≥ ai/act）", (lastRecord.cpu.ai || 0) >= (lastRecord.cpu["ai/act"] || 0),
      `ai=${lastRecord.cpu.ai} act=${lastRecord.cpu["ai/act"]}`);
    Check("draw call 计到整帧总量", lastRecord.calls > 50, `calls=${lastRecord.calls}`);

    // --- 逐段提交量 / 阴影级联 / 矩阵访问 / 着色器编译 ---
    const gpuCpu = lastRecord.gpuCpu || {};
    Check("阴影段出现", "shadow" in gpuCpu, Object.keys(gpuCpu).filter((k) => k.startsWith("shadow")).join(","));
    const cascades = T.lights?.csm?.count ?? 0;
    if (cascades > 1) {
      Check("阴影按级联拆段（shadow/c0）", "shadow/c0" in gpuCpu, `cascades=${cascades}`);
    }
    Check("main 段记了 draw call", (lastRecord.gpuCalls?.main || 0) > 0,
      `main=${lastRecord.gpuCalls?.main}`);
    Check("main 段记了三角形", (lastRecord.gpuTris?.main || 0) > 0,
      `main=${lastRecord.gpuTris?.main}`);
    Check("矩阵访问按桶计数", (lastRecord.cpuVisits?.matrix || 0) > 0,
      `matrix=${lastRecord.cpuVisits?.matrix}`);
    Check("每帧记了新编译的着色器程序数", typeof lastRecord.newPrograms === "number",
      `newPrograms=${lastRecord.newPrograms}`);
    Check("场景节点普查可用", (T.profiler.Census(T.scene)?.total.objects || 0) > 0,
      `objects=${T.profiler.Census(T.scene)?.total.objects}`);

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
    Check("Summary 给出浏览器侧那一行", !!summary.browser);
    Check("Summary 给出逐段 draw", !!summary.gpuCalls && Object.keys(summary.gpuCalls).length > 0);
    Check("Summary 给出逐桶矩阵访问", !!summary.cpuVisits && Object.keys(summary.cpuVisits).length > 0);
    Check("Summary 事件里有新编译程序数", typeof summary.events.newPrograms === "number");

    // 显示层：两张表按汇总里实际出现的 key 排，不再有写死的名单。
    const report = await import("./Script_ProfilerReport.mjs");
    const cpuRows = report.CpuRows(summary);
    const gpuRows = report.GpuRows(summary);
    Check("CPU 表排出了子桶行", cpuRows.some((row) => row.key === "ai/act" && row.depth === 1),
      cpuRows.map((row) => row.key).join(","));
    Check("CPU 表有父桶的自身行", cpuRows.some((row) => row.selfRow && row.key.startsWith("ai")));
    Check("CPU 表把逐 pass 提交 CPU 挂在 post 底下", cpuRows.some((row) => row.key === "post/main"));
    Check("GPU 表用英文原名", gpuRows.some((row) => row.key === "main" && row.label === "main"));
    Check("文本排版可用", report.FormatSnapshot({ label: "test", summary }).includes("CPU · 主线程"));

    // --- 关：钩子必须一件不剩地还原 ---
    T.editor.Toggle("profiler");
    Check("Disable 生效", !T.profiler.on);
    Check("renderer.info 还原自动清零", T.renderer.info.autoReset === true);
    Check("阴影 render 已还原", T.renderer.shadowMap.render.name !== "ProfiledShadowRender");
    Check("post 已摘下剖析器", T.post.profiler === null);
    Check("updateMatrixWorld 已还原", proto.updateMatrixWorld.name !== "ProfiledUpdateMatrixWorld");
    Check("updateWorldMatrix 已还原", proto.updateWorldMatrix.name !== "ProfiledUpdateWorldMatrix");
    Check("traverse 已还原", proto.traverse.name !== "ProfiledTraverse");
    Check("LoAF 观察者已断开", T.profiler._loafObserver === null);
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
