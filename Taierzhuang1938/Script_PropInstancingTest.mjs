// 《滕县 一九三八》外部布设实例化回归：合批必须**逐像素无损**、真的省了
// draw call，而且流送进出之后桶里的实例表与流送器的簿记严格自洽。
//
// 为什么在同一页里开关对比，而不是拿旧版跑一遍截图比：与 Script_ActorBatchTest
// 同一条理由 —— 城里的战斗不是逐帧可复现的，基线只能取「同一帧、同一份世界」。
// PropStreamer.SetInstancing(false) 会把 live 的实例化件当场换回克隆
// （make() 闭包就是老路径），画面理应一个像素都不变，draw call 应该显著变多。
//
// 用法：node Taierzhuang1938/Script_PropInstancingTest.mjs
//       PHASES=4 node Taierzhuang1938/Script_PropInstancingTest.mjs
// 退出码即成败。
//
// 【draw call 断言的边界】on < off 是对默认三关（2/4/5）的契约。六·北门的
// 开机机位是「贴脸看墙」：克隆老路逐网格剔除几乎不提交，静态实例表赢不了它
// （实测 674 → 688，量化取舍见 Script_PropBatch 文件头），手动 PHASES=6 会红 ——
// 那不是回归，是已知的、发生在低压机位上的 2% 让步。

import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(projectDir, "..");
// 2=二·东关（关厢摆位），4=四·城墙（yOffset 贴墙件 + 缺口件），5=五·十字街
// （城内每户布设最密的一关）。
const PHASES = (process.env.PHASES || "2,4,5").split(",");
/** 允许的差异像素比例，与 Script_ActorBatchTest 同值（渲染器噪声底 < 0.001%）。 */
const MAX_DIFF_PCT = 0.01;

const server = await ServeRoot(rootDir, 0);
const port = server.address().port;
const browser = await LaunchBrowser();
const failures = [];
const errors = [];

const Consistent = (s) => s
  && s.clones + s.batched === s.live
  && s.live <= s.registered
  && (!s.batch || (s.batch.instances === s.parts && s.batch.overflow === 0));

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
  await page.waitForFunction(() => window.Taierzhuang !== undefined, { timeout: 300000 });
  await page.evaluate(() => window.Taierzhuang.StepFrames(120));

  const result = await page.evaluate(() => {
    const T = window.Taierzhuang;
    const streamer = T.battlefield?.externalStreamer;
    if (!streamer || !streamer.Stats().registered) return { skip: true };
    // 冻住玩法：rAF 那条主循环还在跑，不冻的话两次读到的不是同一帧世界。
    T.state.running = false;
    T.state.menu = false;
    const fx = T.camera.position.x, fz = T.camera.position.z;
    streamer.ForceSync(fx, fz);
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
    const statsOn = streamer.Stats();
    const on = Draw();
    const onAgain = Draw();          // 噪声底：同一份配置连画两次
    streamer.SetInstancing(false);
    const statsOff = streamer.Stats();
    const off = Draw();
    streamer.SetInstancing(true);

    // 流送自洽：焦点移动跨过迟滞带（24 m）再回来，簿记与桶实例表必须一致。
    streamer.ForceSync(fx + 80, fz);
    const moved = streamer.Stats();
    streamer.ForceSync(fx, fz);
    const back = streamer.Stats();

    return {
      calls: { on: on.calls, off: off.calls },
      stats: { on: statsOn, off: statsOff, moved, back },
      noise: Compare(on.pixels, onAgain.pixels),
      diff: Compare(onAgain.pixels, off.pixels),
    };
  });
  await page.close();

  if (result.skip) {
    console.log(`skip phase=${phase}（本关没有登记的外部布设）`);
    continue;
  }
  const { calls, stats, noise, diff } = result;
  const label = `phase=${phase} draw ${calls.off} -> ${calls.on}`
    + ` | live ${stats.on.live}（实例化 ${stats.on.batched} 件/${stats.on.parts} 实例`
    + `/${stats.on.batch?.liveBuckets ?? 0} 活桶，克隆 ${stats.on.clones} 件，`
    + `全关 ${stats.on.batch?.buckets ?? 0} 桶）`
    + ` | 差异 ${diff.pct.toFixed(4)}%（噪声底 ${noise.pct.toFixed(4)}%）`;
  if (diff.pct > MAX_DIFF_PCT) failures.push(`实例化改变了画面：${label}`);
  else if (stats.on.batched > 0 && calls.on >= calls.off) {
    failures.push(`实例化没省下提交：${label}`);
  } else if (stats.on.live > 0 && stats.on.batched === 0) {
    // live 全是克隆 = 实例化路径整体没接上（个别回退件是正常的，全军覆没不是）。
    failures.push(`没有任何件走实例化路径：${label}`);
  } else if (stats.on.live === 0) {
    // 一·西关这类关：摆位离出生点七百米，流送半径内一件都没有。开关对比
    // 仍然要求画面与提交都一致（什么都没画的两条路必须同样什么都不画）。
    if (calls.on !== calls.off) failures.push(`live=0 时开关不等价：${label}`);
    else console.log(`ok   ${label}（live=0，摆位都在流送半径外）`);
  } else if (stats.off.batched !== 0) {
    failures.push(`SetInstancing(false) 后仍有实例化件：${label}`);
  } else if (![stats.on, stats.moved, stats.back].every(Consistent)) {
    failures.push(`流送簿记与桶实例表不自洽：${label}`
      + ` | moved live=${stats.moved.live} batched=${stats.moved.batched}`
      + ` parts=${stats.moved.parts} instances=${stats.moved.batch?.instances}`
      + ` overflow=${stats.moved.batch?.overflow}`
      + ` | back live=${stats.back.live} instances=${stats.back.batch?.instances}`);
  } else {
    console.log(`ok   ${label}`);
  }
}

if (errors.length) failures.push(`页面报错：${errors.slice(0, 3).join(" / ")}`);

await browser.close();
server.close();

if (failures.length) {
  console.error("\n外部布设实例化回归失败：");
  for (const line of failures) console.error(`  ${line}`);
  process.exit(1);
}
console.log("\n外部布设实例化：逐像素无损、提交量确实降下来了、流送自洽。");
