// 《滕县 一九三八》整帧 CPU / GPU 剖析。
//
// 固定用玩家问题里的 3394×1348 / high，在最重的东关分别消融 GI、SSAO、阴影、
// 强制 4×MSAA 与内部渲染分辨率。GPU 时间来自 EXT_disjoint_timer_query_webgl2，
// CPU submit 是主线程把一帧提交给驱动所花的时间，wall 是提交后 gl.finish 的总墙钟。
//
// 用法：node Taierzhuang1938/Script_FrameProfileTest.mjs

import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(projectDir, "..");
const server = await ServeRoot(rootDir, 0);
const port = server.address().port;
const browser = await LaunchBrowser();
const page = await browser.newPage({ viewport: { width: 3394, height: 1348 } });

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
  await page.waitForFunction(() => window.Taierzhuang !== undefined, { timeout: 300000 });
  result = await page.evaluate(async () => {
    const T = window.Taierzhuang;
    const gl = T.renderer.getContext();
    const timer = gl.getExtension("EXT_disjoint_timer_query_webgl2");
    const debug = gl.getExtension("WEBGL_debug_renderer_info");
    const rendererName = debug
      ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)
      : gl.getParameter(gl.RENDERER);
    T.StepFrames(90);
    gl.finish();
    // 停掉页面自己的 rAF；StepFrames 仍可直接驱动。否则等待 timer query 的那个
    // event-loop turn 会偷偷多画一帧，把 calls / triangles 记成双份。
    T.state.running = false;
    T.state.menu = false;

    const Median = (values) => {
      const sorted = [...values].sort((a, b) => a - b);
      return sorted[Math.floor(sorted.length / 2)];
    };

    const One = async (render = true) => {
      gl.finish();
      const query = timer ? gl.createQuery() : null;
      if (query) gl.beginQuery(timer.TIME_ELAPSED_EXT, query);
      T.renderer.info.autoReset = false;
      T.renderer.info.reset();
      const started = performance.now();
      T.StepFrames(1, 1 / 60, render);
      const submitted = performance.now();
      if (query) gl.endQuery(timer.TIME_ELAPSED_EXT);
      gl.finish();
      const finished = performance.now();
      let gpuMs = null;
      if (query) {
        // ANGLE/D3D11 即使 gl.finish 已返回，也会到下一个 event-loop turn 才把
        // QUERY_RESULT_AVAILABLE 从 false 翻过来；直接读会把真实 GPU 时间误报成 n/a。
        for (let retry = 0; retry < 20
          && !gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE); retry += 1) {
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
        const available = gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE);
        const disjoint = gl.getParameter(timer.GPU_DISJOINT_EXT);
        if (available && !disjoint) gpuMs = gl.getQueryParameter(query, gl.QUERY_RESULT) / 1e6;
        gl.deleteQuery(query);
      }
      const sample = {
        submitMs: submitted - started,
        wallMs: finished - started,
        gpuMs,
        calls: T.renderer.info.render.calls,
        triangles: T.renderer.info.render.triangles,
      };
      T.renderer.info.autoReset = true;
      return sample;
    };

    const Sample = async (label, render = true) => {
      T.StepFrames(5, 1 / 60, render);
      const rows = [];
      for (let i = 0; i < 7; i += 1) rows.push(await One(render));
      return {
        label,
        submitMs: Median(rows.map((row) => row.submitMs)),
        wallMs: Median(rows.map((row) => row.wallMs)),
        gpuMs: rows[0].gpuMs == null ? null : Median(rows.map((row) => row.gpuMs)),
        calls: Median(rows.map((row) => row.calls)),
        triangles: Median(rows.map((row) => row.triangles)),
        size: [T.post.width, T.post.height],
      };
    };

    // 主线程分项：包住现有公开对象的方法，不改游戏代码。post 是 GPU 提交大项，
    // scene matrix / actor batch / AI / GI 是它外面的 CPU 固定开销。
    const cpuTimes = { ai: 0, gi: 0, sceneMatrix: 0, actorBatch: 0, post: 0 };
    const restores = [];
    const Wrap = (object, key, bucket) => {
      if (!object || typeof object[key] !== "function") return;
      const original = object[key];
      object[key] = function ProfiledMethod(...args) {
        const started = performance.now();
        try { return original.apply(this, args); }
        finally { cpuTimes[bucket] += performance.now() - started; }
      };
      restores.push(() => { object[key] = original; });
    };
    Wrap(T.ai, "Update", "ai");
    Wrap(T.gi, "Update", "gi");
    Wrap(T.scene, "updateMatrixWorld", "sceneMatrix");
    Wrap(T.actorBatch, "Update", "actorBatch");
    Wrap(T.post, "Render", "post");
    const breakdownStarted = performance.now();
    for (let frame = 0; frame < 90; frame += 1) T.StepFrames(1);
    gl.finish();
    const breakdownTotal = performance.now() - breakdownStarted;
    for (const Restore of restores) Restore();

    const rows = [];
    rows.push(await Sample("baseline"));

    if (T.gi) T.gi.enabled = false;
    rows.push(await Sample("no GI"));
    if (T.gi) T.gi.enabled = true;

    const oldSsao = T.post.preset.ssao;
    T.post.preset.ssao = false;
    rows.push(await Sample("no SSAO"));
    T.post.preset.ssao = oldSsao;

    const oldMsaa = T.post.preset.msaa;
    T.post.preset.msaa = 4;
    T.post.SetSize(3394, 1348);
    rows.push(await Sample("forced 4x MSAA"));
    T.post.preset.msaa = oldMsaa;
    T.post.SetSize(3394, 1348);

    T.post.SetSize(Math.round(3394 * 0.7), Math.round(1348 * 0.7));
    rows.push(await Sample("70% scale"));
    T.post.SetSize(3394, 1348);

    // 真正的纯玩法主线程：不出画、GI 也关掉，避免它的五个 GL pass 混进来。
    if (T.gi) T.gi.enabled = false;
    rows.push(await Sample("logic only", false));

    // “经常顿一下”还可能来自探针体每跨 4 m 滚动一格。按 0.25 m 模拟移动，
    // 既覆盖普通帧也覆盖跨格帧，单列最大值，别让中位数把尖峰藏掉。
    const giScrollMs = [];
    if (T.gi) {
      T.gi.enabled = true;
      const focus = T.camera.position.clone();
      for (let step = 0; step < 96; step += 1) {
        focus.x += 0.25;
        const started = performance.now();
        T.gi.Scroll(focus);
        giScrollMs.push(performance.now() - started);
      }
    }

    return {
      rendererName,
      timerAvailable: !!timer,
      rows,
      cpuBreakdown: {
        total: breakdownTotal / 90,
        ai: cpuTimes.ai / 90,
        gi: cpuTimes.gi / 90,
        sceneMatrix: cpuTimes.sceneMatrix / 90,
        actorBatch: cpuTimes.actorBatch / 90,
        post: cpuTimes.post / 90,
      },
      giScroll: giScrollMs.length ? {
        median: Median(giScrollMs),
        p95: [...giScrollMs].sort((a, b) => a - b)[Math.floor(giScrollMs.length * 0.95)],
        max: Math.max(...giScrollMs),
      } : null,
      programs: T.renderer.info.programs.length,
      memory: { ...T.renderer.info.memory },
    };
  });
} finally {
  await browser.close();
  server.close();
}

if (result) {
  console.log(`GPU ${result.rendererName}`);
  console.log(`timer=${result.timerAvailable} programs=${result.programs}`
    + ` geometries=${result.memory.geometries} textures=${result.memory.textures}`);
  for (const row of result.rows) {
    const gpu = row.gpuMs == null ? "n/a" : `${row.gpuMs.toFixed(2)} ms`;
    console.log(`${row.label.padEnd(12)} ${row.size.join("x").padEnd(10)}`
      + ` submit=${row.submitMs.toFixed(2)} ms gpu=${gpu.padEnd(10)} wall=${row.wallMs.toFixed(2)} ms`
      + ` calls=${row.calls.toFixed(0)} tris=${(row.triangles / 1e6).toFixed(2)}M`);
  }
  const c = result.cpuBreakdown;
  console.log(`CPU breakdown total=${c.total.toFixed(2)} ai=${c.ai.toFixed(2)}`
    + ` gi=${c.gi.toFixed(2)} matrix=${c.sceneMatrix.toFixed(2)}`
    + ` batch=${c.actorBatch.toFixed(2)} post=${c.post.toFixed(2)} ms/frame`);
  if (result.giScroll) console.log(`GI scroll median=${result.giScroll.median.toFixed(3)}`
    + ` p95=${result.giScroll.p95.toFixed(3)} max=${result.giScroll.max.toFixed(3)} ms`);
}
for (const error of errors) console.log(error);
process.exit(errors.length || !result ? 1 : 0);
