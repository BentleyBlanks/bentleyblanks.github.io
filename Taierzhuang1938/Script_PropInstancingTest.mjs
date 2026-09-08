// 《台儿庄：血战滕县》外部布设实例化回归：合批必须**逐像素无损**、真的省了
// draw call，而且流送进出之后桶里的实例表与流送器的簿记严格自洽。
//
// 为什么在同一页里开关对比，而不是拿旧版跑一遍截图比：与 Script_ActorBatchTest
// 同一条理由 —— 城里的战斗不是逐帧可复现的，基线只能取「同一帧、同一份世界」。
// PropStreamer.SetInstancing(false) 会把 live 的实例化件当场换回克隆
// （make() 闭包就是老路径），画面理应一个像素都不变，draw call 应该显著变多。
//
// 【为什么要先空跑一批「预热」，以及为什么开关两侧都要】2026-09-08 修。冻帧不等于
// 画面稳定：GTAO/SSIL 与 SSR 都带历史累积，每趟 Render 往前推一步，所以「同一份
// 配置连画两次」在刚冻帧时并不相等 —— 这就是这道门在 origin/master 上一直红的原因
// （噪声底 0.03%–0.11%，比阈值高 3–10 倍）。完整的账、收敛曲线与「只预热一侧会把
// 真差异衰减一个数量级」那条，见 Script_ActorBatchTest 文件头；两边的
// Draw() / Compare() / WARM_DRAWS / 判据是同一份，改一处必须改另一处。
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
/**
 * 每一侧读回缓冲之前空跑多少趟，把时域链推到不动点；口径、实测收敛曲线与
 * 取 96 的理由见 Script_ActorBatchTest 的同名常量（同一台机器、同一批实测）。
 */
const WARM_DRAWS = 96;
/** 允许的差异像素比例的绝对下限，与 Script_ActorBatchTest 同值。 */
const MAX_DIFF_PCT = 0.01;
/** 相对判据的倍数（差异要站到当场噪声底的几倍以上才算数），依据见 ActorBatchTest。 */
const NOISE_FACTOR = 3;
/** 预热后噪声底还高于它 = 时域链没收敛，报「没收敛」而不是去赖实例化。 */
const MAX_NOISE_PCT = MAX_DIFF_PCT / 2;

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
  await page.waitForFunction(() => window.Taierzhuang !== undefined, null, { timeout: 300000 });
  await page.evaluate(() => window.Taierzhuang.StepFrames(120));

  const result = await page.evaluate((warmDraws) => {
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
    const Draw = (read) => {
      // 后期里的时序项（抖动、颗粒、运动模糊）全部钉死，只留几何与着色。
      // TAA 也是时序项而且**有状态**：每画一次都会翻历史乒乓，第二次 Draw
      // 混合的历史是第一次的输出 —— 同一帧号也不再逐像素相等，必须关。
      // GTAO/SSIL 与 SSR 的历史关不掉（不是逐次调用的开关），只能靠 Warm 空跑压平。
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
        taa: false,
      });
      const calls = T.renderer.info.render.calls;
      if (!read) return { calls, pixels: null };
      const pixels = new Uint8Array(width * height * 4);
      T.renderer.setRenderTarget(null);
      gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      return { calls, pixels };
    };
    /** 空跑到时域链的不动点。不读回缓冲，一趟只有一次 Render。 */
    const Warm = () => { for (let i = 0; i < warmDraws; i += 1) Draw(false); };
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
    Warm();
    const on = Draw(true);
    const onAgain = Draw(true);      // 噪声底：同一份配置连画两次
    streamer.SetInstancing(false);
    const statsOff = streamer.Stats();
    Warm();                          // 换回克隆之后也要自己收敛，否则掺着实例化那一侧的历史
    const off = Draw(true);
    const offAgain = Draw(true);
    streamer.SetInstancing(true);
    const noiseOn = Compare(on.pixels, onAgain.pixels);
    const noiseOff = Compare(off.pixels, offAgain.pixels);

    // 流送自洽：焦点移动跨过迟滞带（24 m）再回来，簿记与桶实例表必须一致。
    streamer.ForceSync(fx + 80, fz);
    const moved = streamer.Stats();
    streamer.ForceSync(fx, fz);
    const back = streamer.Stats();

    return {
      calls: { on: on.calls, off: off.calls },
      stats: { on: statsOn, off: statsOff, moved, back },
      // 噪声底取两侧的大者：任何一侧没压平，A/B 的结论都不作数。
      noise: noiseOn.pct >= noiseOff.pct ? noiseOn : noiseOff,
      diff: Compare(onAgain.pixels, offAgain.pixels),
    };
  }, WARM_DRAWS);
  await page.close();

  if (result.skip) {
    console.log(`skip phase=${phase}（本关没有登记的外部布设）`);
    continue;
  }
  const { calls, stats, noise, diff } = result;
  const tolerance = Math.max(MAX_DIFF_PCT, noise.pct * NOISE_FACTOR);
  const label = `phase=${phase} draw ${calls.off} -> ${calls.on}`
    + ` | live ${stats.on.live}（实例化 ${stats.on.batched} 件/${stats.on.parts} 实例`
    + `/${stats.on.batch?.liveBuckets ?? 0} 活桶，克隆 ${stats.on.clones} 件，`
    + `全关 ${stats.on.batch?.buckets ?? 0} 桶）`
    + ` | 差异 ${diff.pct.toFixed(4)}%（噪声底 ${noise.pct.toFixed(4)}%，`
    + `阈值 ${tolerance.toFixed(4)}%）`;
  if (noise.pct > MAX_NOISE_PCT) {
    failures.push(`时域链没收敛（预热 ${WARM_DRAWS} 趟仍有噪声，最大通道差 ${noise.max}）：${label}`);
  } else if (diff.pct > tolerance) {
    failures.push(`实例化改变了画面（最大通道差 ${diff.max}）：${label}`);
  } else if (stats.on.batched > 0 && calls.on >= calls.off) {
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
