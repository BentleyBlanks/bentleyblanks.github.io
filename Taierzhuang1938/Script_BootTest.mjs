// 《血战台儿庄》开机冒烟：真浏览器把整页跑起来，看它活不活。
//
// 存在的理由：视觉迭代每一轮都在动 shader 与姿态代码，而 shader 编译失败
// three 是**静默吞掉**的（GL 1282 不抛异常），页面照样跑、画面直接没了。
// 光看 node --check 完全测不出来。所以每轮改完必须跑这一遍。
//
// 用法：node Taierzhuang1938/Script_BootTest.mjs
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

const problems = [];
page.on("pageerror", (error) => problems.push(`PAGEERROR ${String(error).slice(0, 300)}`));
page.on("console", (message) => {
  if (message.type() !== "error") return;
  const url = message.location()?.url || "";
  if (/fonts\.(googleapis|gstatic)\.com/.test(url)) return;   // 外部字体拉不下来不算事故
  problems.push(`CONSOLE ${message.text().slice(0, 300)}`);
});

let failed = 0;
// 六个阶段各启一次：每个阶段换天光、换预设，是不同的 shader 分支组合
for (const phase of [0, 1, 2, 3, 4, 5]) {
  problems.length = 0;
  const url = `http://127.0.0.1:${port}/Taierzhuang1938/?shot=1&phase=${phase}&quality=high&scale=small`;
  let health = null;
  try {
    await page.goto(url, { waitUntil: "load", timeout: 120000 });
    await page.waitForFunction(() => window.Taierzhuang !== undefined, { timeout: 180000 });
    await page.evaluate(() => window.Taierzhuang.StepFrames(120));
    await page.waitForTimeout(600);
    health = await page.evaluate(() => {
      const T = window.Taierzhuang;
      const gl = T.renderer.getContext();
      const glError = gl.getError();
      // renderer.info.render 每次 renderer.render() 都会重置，而一帧里有十几个
      // pass。不关掉 autoReset 的话，读到的永远只是最后那一块全屏四边形 = 1。
      T.renderer.info.autoReset = false;
      T.renderer.info.reset();
      // 不开 preserveDrawingBuffer，取样必须与渲染在同一个任务里。
      // 走 StepFrames(1) 而不是自己调 post.Render：曝光/雾/泛光/去饱和全在 Frame()
      // 里按当关的天光预设装配，这里再抄一份必然抄漏。抄漏的代价不是"少一点效果"——
      // 夜战预设 exposure 是 3.6，被写死成 0.5 时整帧读出来就是纯黑，
      // 探针报"画面近乎纯色"，测的是测试自己写错的曝光，不是画面。
      T.StepFrames(1);
      const probe = document.createElement("canvas");
      probe.width = 64; probe.height = 36;
      const ctx = probe.getContext("2d");
      ctx.drawImage(T.renderer.domElement, 0, 0, 64, 36);
      const data = ctx.getImageData(0, 0, 64, 36).data;
      let min = 255, max = 0;
      const tones = new Set();
      for (let i = 0; i < data.length; i += 4) {
        const v = (data[i] + data[i + 1] + data[i + 2]) / 3;
        if (v < min) min = v;
        if (v > max) max = v;
        tones.add(Math.round(v / 8));
      }
      return {
        glError,
        spread: max - min,
        tones: tones.size,
        programs: T.renderer.info.programs.length,
        geometries: T.renderer.info.memory.geometries,
        soldiers: T.ai ? T.ai.soldiers.length : -1,
        alive: T.ai ? T.ai.aliveCount : -1,
        drawCalls: T.renderer.info.render.calls,
        triangles: T.renderer.info.render.triangles,
      };
    });
    await page.evaluate(() => { window.Taierzhuang.renderer.info.autoReset = true; });
  } catch (error) {
    problems.push(`THROW ${String(error).slice(0, 200)}`);
  }

  const bad = [];
  if (problems.length) bad.push(`${problems.length} 个报错`);
  if (!health) bad.push("没拿到健康数据");
  else {
    if (health.glError !== 0) bad.push(`GL 错误 ${health.glError}`);
    // 画面不是纯色：黑屏、只剩天空、只剩雾，三种事故都表现为 spread 极小
    if (health.spread < 8) bad.push(`画面近乎纯色 spread=${health.spread}`);
    // 夜战本来就只有很窄的一段动态，阀值得分档
    const toneFloor = (phase === 3 || phase === 5) ? 5 : 12;
    if (health.tones < toneFloor) bad.push(`色调档位太少 tones=${health.tones}`);
    if (health.drawCalls < 12) bad.push(`几乎没画东西 calls=${health.drawCalls}`);
    if (health.triangles < 50000) bad.push(`三角形太少 tris=${health.triangles}`);
  }
  const ok = bad.length === 0;
  if (!ok) failed += 1;
  console.log(`${ok ? "ok  " : "FAIL"} phase=${phase} `
    + (health
      ? `spread=${health.spread} tones=${health.tones} calls=${health.drawCalls} `
        + `tris=${(health.triangles / 1000).toFixed(0)}k programs=${health.programs} alive=${health.alive}`
      : "(no health)")
    + (bad.length ? `  << ${bad.join("; ")}` : ""));
  for (const p of problems.slice(0, 4)) console.log(`       ${p}`);
}

await browser.close();
server.close();
console.log(failed === 0 ? "\n开机冒烟全过。" : `\n开机冒烟失败：${failed} 个阶段有问题。`);
process.exit(failed === 0 ? 0 : 1);
