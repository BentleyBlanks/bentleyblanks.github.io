// 《滕县 一九三八》开机冒烟：真浏览器把整页跑起来，看它活不活。
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

// 性能红线。新城比台儿庄大得多（600×600 m 方城、11.5 m 高墙、四关在城里），
// 所以这两条从"看看而已"升级成**断言**：越线就是 FAIL，不许靠人去读日志发现。
const MAX_DRAW_CALLS = 1400;
const MAX_TRIANGLES = 3200000;

let failed = 0;
// 七关各启一次：每关换天光、换切片，是不同的 shader 分支组合与不同的几何量
for (const phase of [0, 1, 2, 3, 4, 5, 6]) {
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

      // 深度法线预通道的**天空判据**：w = 线性视深度，0 = 这一路没打到东西。
      // 事故：天空穹的 allowOverride = false 只保证"不被换材质"，它照样会用
      // 自己那套着色器画进这一趟，把不透明度 1.0 写成 w —— 整片天空于是变成
      // "一米外有实体"。后果是天空前的烟被软粒子整片抹掉（(1−186)/0.45 → 0）、
      // 大气透视也补不上，二百米外的黑烟柱在天上留下一个越长越大的黑洞。
      // 这里直接从靶上取证：只看 alpha 的半浮点位模式是不是 0，不必解码。
      const nd = T.post.targets.normalDepth;
      const raw = new Uint16Array(nd.width * nd.height * 4);
      T.renderer.readRenderTargetPixels(nd, 0, 0, nd.width, nd.height, raw);
      let skyTexels = 0, geoTexels = 0;
      for (let i = 3; i < raw.length; i += 4) {
        if (raw[i] === 0) skyTexels += 1; else geoTexels += 1;
      }

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
        level: T.Debug.Level ? T.Debug.Level().id : "?",
        skyTexels,
        geoTexels,
        // 粒子层接没接上预通道与当关的雾：这两条断了，远处的烟就没有大气透视
        vfxDepthValid: T.vfx.shared.uDepthValid.value,
        vfxFogDensity: T.vfx.shared.uFogDensity.value,
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
    // 性能红线（上界）。越线不是"慢一点"，是这一关在真机上不能玩
    if (health.drawCalls > MAX_DRAW_CALLS) {
      bad.push(`draw call 越线 ${health.drawCalls} > ${MAX_DRAW_CALLS}`);
    }
    if (health.triangles > MAX_TRIANGLES) {
      bad.push(`三角形越线 ${(health.triangles / 1e6).toFixed(2)}M > 3.20M`);
    }
    // 预通道的天空判据（见上面取证那一段）。天上看得见天的关，w = 0 的像素
    // 必须有一片；一个都没有就说明又有铺满屏幕的东西把自己写进预通道了。
    if (health.geoTexels === 0) bad.push("预通道是空的");
    if (health.skyTexels === 0) bad.push("预通道里没有 w=0 的天空像素（天空穹又混进预通道了？）");
    if (health.vfxDepthValid !== 1) bad.push("粒子层没接上预通道（远处的烟会没有大气透视）");
    if (!(health.vfxFogDensity > 0)) bad.push(`粒子层的雾没接上 density=${health.vfxFogDensity}`);
  }
  const ok = bad.length === 0;
  if (!ok) failed += 1;
  console.log(`${ok ? "ok  " : "FAIL"} phase=${phase} `
    + (health
      ? `${String(health.level).padEnd(14)} spread=${health.spread} tones=${health.tones} calls=${health.drawCalls} `
        + `tris=${(health.triangles / 1000).toFixed(0)}k programs=${health.programs} alive=${health.alive} `
        + `sky=${(health.skyTexels / (health.skyTexels + health.geoTexels) * 100).toFixed(0)}%`
      : "(no health)")
    + (bad.length ? `  << ${bad.join("; ")}` : ""));
  for (const p of problems.slice(0, 4)) console.log(`       ${p}`);
}

await browser.close();
server.close();
console.log(failed === 0 ? "\n开机冒烟全过。" : `\n开机冒烟失败：${failed} 关有问题。`);
process.exit(failed === 0 ? 0 : 1);
