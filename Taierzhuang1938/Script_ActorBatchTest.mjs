// 《滕县 一九三八》人物合批回归：合批必须是**逐像素无损**的，而且真的省了 draw call。
//
// 为什么在同一页里开关对比，而不是拿旧版跑一遍截图比：
//   城里的战斗不是逐帧可复现的（同样推 180 帧，两次跑出来的画面差 27% 的像素）。
//   所以基线只能取「同一帧、同一份世界」——推完帧把玩法冻住（state.running=false），
//   同一份场景开着合批读一次 backbuffer，关掉合批再读一次，两张图直接比。
//   readPixels 读的是渲染完当场的后缓冲，绕开截图/合成器那一层的抖动。
//
// 用法：node Taierzhuang1938/Script_ActorBatchTest.mjs
// 退出码即成败。

import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(projectDir, "..");
const PHASES = (process.env.PHASES || "1,2,5").split(",");
/** 允许的差异像素比例。渲染器自己的噪声底（同一份配置连画两次）实测 < 0.001%。 */
const MAX_DIFF_PCT = 0.01;

const server = await ServeRoot(rootDir, 0);
const port = server.address().port;
const browser = await LaunchBrowser();
const failures = [];
const errors = [];

for (const phase of PHASES) {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  page.on("pageerror", (error) => errors.push(`p${phase} PAGEERROR ${String(error).slice(0, 200)}`));
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const url = message.location()?.url || "";
    if (/fonts\.(googleapis|gstatic)\.com/.test(url)) return;
    errors.push(`p${phase} CONSOLE ${message.text().slice(0, 200)}`);
  });
  await page.goto(`http://127.0.0.1:${port}/Taierzhuang1938/?shot=1&phase=${phase}`,
    { waitUntil: "load", timeout: 120000 });
  await page.waitForFunction(() => window.Taierzhuang !== undefined, null, { timeout: 300000 });
  await page.evaluate(() => window.Taierzhuang.StepFrames(200));

  const result = await page.evaluate(() => {
    const T = window.Taierzhuang;
    // 冻住玩法：rAF 那条主循环还在跑，不冻的话两次读到的不是同一帧世界。
    T.state.running = false;
    T.state.menu = false;
    const gl = T.renderer.getContext();
    const width = gl.drawingBufferWidth;
    const height = gl.drawingBufferHeight;
    const Draw = () => {
      // 后期里的时序项（抖动、颗粒、运动模糊）全部钉死，只留几何与着色。
      T.post.frame = 1000;
      T.scene.updateMatrixWorld();
      T.actorBatch.Update(T.camera);
      T.renderer.shadowMap.needsUpdate = true;
      T.renderer.info.autoReset = false;
      T.renderer.info.reset();
      T.post.Render(T.scene, T.camera, {
        sunDirection: T.sky.sunDirection, exposure: 0.5, bloom: 0.6, godStrength: 0.3,
        saturation: 1, contrast: 1, grain: 0, vignette: 0.42, damage: 0,
        motionBlur: 0, dofStrength: 0, dofFocus: 1.5, dofRange: 2.8, dofMaxPx: 11,
      });
      const pixels = new Uint8Array(width * height * 4);
      T.renderer.setRenderTarget(null);
      gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      return { pixels, calls: T.renderer.info.render.calls };
    };
    const Compare = (a, b) => {
      let count = 0;
      let max = 0;
      for (let i = 0; i < a.length; i += 4) {
        let d = 0;
        for (let c = 0; c < 3; c += 1) d = Math.max(d, Math.abs(a[i + c] - b[i + c]));
        if (d > 2) count += 1;
        if (d > max) max = d;
      }
      return { pct: (count / (a.length / 4)) * 100, max };
    };
    const on = Draw();
    const onAgain = Draw();          // 噪声底：同一份配置连画两次
    T.actorBatch.SetEnabled(false);
    const off = Draw();
    T.actorBatch.SetEnabled(true);
    return {
      calls: { on: on.calls, off: off.calls },
      stats: { ...T.actorBatch.stats },
      noise: Compare(on.pixels, onAgain.pixels),
      diff: Compare(onAgain.pixels, off.pixels),
    };
  });
  await page.close();

  const { calls, stats, noise, diff } = result;
  const label = `phase=${phase} draw ${calls.off} -> ${calls.on}`
    + ` | 实例 ${stats.instances}（${stats.actors} 人 / ${stats.batches} 批）`
    + ` | 差异 ${diff.pct.toFixed(4)}%（噪声底 ${noise.pct.toFixed(4)}%）`;
  if (diff.pct > MAX_DIFF_PCT) failures.push(`合批改变了画面：${label}`);
  else if (stats.instances > 0 && calls.on >= calls.off) failures.push(`合批没省下提交：${label}`);
  else console.log(`ok   ${label}`);
}

if (errors.length) failures.push(`页面报错：${errors.slice(0, 3).join(" / ")}`);

await browser.close();
server.close();

if (failures.length) {
  console.error("\n人物合批回归失败：");
  for (const line of failures) console.error(`  ${line}`);
  process.exit(1);
}
console.log("\n人物合批：逐像素无损，提交量确实降下来了。");
