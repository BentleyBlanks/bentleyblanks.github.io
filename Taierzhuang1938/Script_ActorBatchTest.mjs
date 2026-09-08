// 《台儿庄：血战滕县》人物合批回归：合批必须是**逐像素无损**的，而且真的省了 draw call。
//
// 为什么在同一页里开关对比，而不是拿旧版跑一遍截图比：
//   城里的战斗不是逐帧可复现的（同样推 180 帧，两次跑出来的画面差 27% 的像素）。
//   所以基线只能取「同一帧、同一份世界」——推完帧把玩法冻住（state.running=false），
//   同一份场景开着合批读一次 backbuffer，关掉合批再读一次，两张图直接比。
//   readPixels 读的是渲染完当场的后缓冲，绕开截图/合成器那一层的抖动。
//
// 【为什么要先空跑一批「预热」】2026-09-08 修。冻帧并不等于画面稳定：帧图里
//   GTAO/SSIL 与 SSR 都带历史累积，每一趟 Render 都会往前推一步历史
//   （GTAO 的 temporalAlpha = 0.10，一趟只收 10%）。所以「同一份配置连画两次」
//   在刚冻帧时**并不相等** —— 那就是这道门在 origin/master 上一直红的原因：
//   噪声底涨到 0.03%–0.11%，比阈值高 3–10 倍，好几关的差异比噪声底还小却照样判红。
//   相机不动、`post.frame` 钉死之后，历史是一个收敛的不动点，空跑够趟数就压平；
//   预热趟数与实测数据见 WARM_DRAWS。
//
// 【预热要放在开关的两侧】只在读 on 之前预热是不够的。历史是 `mix(hist, cur, 0.1)`，
//   切到 off 之后第一趟画面里只掺得进 10% 的真实差异 —— 旧写法在这一点上是**偏松**的，
//   会把真差异衰减一个数量级。两侧各自预热到自己的不动点，比出来的才是真差异。
//
// 【不用去对齐级联阴影的烘焙相位】这条曾经是首要嫌疑，实际不是：`CsmRig.Update`
//   挂在玩法循环上，冻帧之后不再被调，逐级的 `shadow.needsUpdate` 也已被上一趟
//   真实帧消掉，所以整个 evaluate 里级联的矩阵与图都是冻住的。Draw() 里那句
//   `renderer.shadowMap.needsUpdate = true` 只是让 three 进一次阴影循环、逐灯全部跳过，
//   既不改状态也不产生差异（`ScheduleShadowUpdate` 接管之后它就是历史遗留了）。
//
// 【本关的合批断言可能是空的】`Script_ActorBatch` 按设计整人跳过蒙皮 GLB
//   （见该模块文件头），唯一不带 GLB 骨骼的人物是 `Actor.isChild`（百姓的
//   childBoy / childGirl，只在 P012 开场人流的名册里）。2026-09-08 实测：
//   phase=1/2/3/4/5/6 与 ?whitebox=p012（推到 1200 帧）的在册人物**全是蒙皮 GLB**
//   （程序化 0），所以 `stats.instances` 恒为 0，开关合批连一个网格都不挪，
//   `draw` 与画面天然相等 —— 也就是说这几关跑的是一次「配置跟自己比」。
//   这个事实必须在输出里说出来，不能让它安静地绿着：逐关末尾会标注、
//   全轮结束还会再汇总一次。要把这半条断言填实，得先让程序化人物真的上场
//   （挑一个孩子在场的时机，或者由测试自己造几个），那是另一件事。
//
// 【与 Script_PropInstancingTest 是同一份 Draw/Compare/预热】那道门是外部布设的
//   同款 A/B。两边的 Draw()、Compare()、WARM_DRAWS 与判据必须保持一致，改一处就
//   得改另一处（噪声底那条注释当初就是只改了一边才过期的）。
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
/**
 * 每一侧读回缓冲之前空跑多少趟，把时域链推到不动点。空跑不读 readPixels，
 * 一趟只有一次 Render。
 *
 * 实测收敛曲线（RTX 4070 SUPER / ANGLE-D3D11 / 无头 Edge 152 / 960×540，
 * 本门 phase=1/2/5 与 PropInstancingTest 的 phase=2/4/5，取六关的区间）：
 *
 *     预热   0 趟 → 噪声底 0.037%–0.106%（最大通道差 8–15）
 *           20 趟 → 0.007%–0.020%
 *           30 趟 → 0.004%–0.010%
 *           45 趟 → 0.0002%–0.0006%（最大通道差 3）
 *           60 趟 → 0.0000%（最大通道差 ≤2，已在 Compare 的 d>2 判据之下）
 *           90 趟 → 0.0000%，最大通道差 0（两张图逐字节相等）
 *
 * 取 96：比「逐字节相等」的实测拐点（90）多一轮余量。开关两侧各预热一次、
 * 各读回两次，实测每关约多花 4 秒（本门 65 s → 77 s），两道门六关合计约 25 秒。
 *
 * 预热到位之后这两道门的实测残差：本门三关全 0.0000%（开关根本没挪网格，见下），
 * PropInstancingTest 是 0.0000% / 0.0000% / 0.0006%（phase=5 的 3 个像素连着两轮
 * 都在，是实例化与克隆两条路真实的一点差，远在 MAX_DIFF_PCT 之下）——
 * 绝对下限那一条因此不是摆设，别把它删了只留相对判据。
 */
const WARM_DRAWS = 96;
/** 允许的差异像素比例的绝对下限。 */
const MAX_DIFF_PCT = 0.01;
/**
 * 相对判据的倍数：差异要站到**当场量出来的**噪声底的 k 倍以上才算「改变了画面」。
 * k 的来处：噪声没压平时（预热 0 趟），六关的「差异 ÷ 噪声底」实测是
 * 0.87 / 1.12 / 1.05 / 1.08 / 1.02 / 0.92 —— 纯噪声的比值就贴着 1.0。
 * 取 3 是在这个分布上留三倍余量，同时又远低于「真差异」应有的量级
 * （合批要是真错了，错的是整片人物像素，不是千分之几）。
 */
const NOISE_FACTOR = 3;
/**
 * 预热之后噪声底还高于它，就说明时域链没收敛 —— 那时任何 A/B 结论都不成立，
 * 报「没收敛」而不是去赖合批。实测预热后是 0.0000%，这里放在阈值的一半上。
 */
const MAX_NOISE_PCT = MAX_DIFF_PCT / 2;

const server = await ServeRoot(rootDir, 0);
const port = server.address().port;
const browser = await LaunchBrowser();
const failures = [];
const errors = [];
let batchedPhases = 0;

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

  const result = await page.evaluate((warmDraws) => {
    const T = window.Taierzhuang;
    // 冻住玩法：rAF 那条主循环还在跑，不冻的话两次读到的不是同一帧世界。
    T.state.running = false;
    T.state.menu = false;
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
    Warm();
    const on = Draw(true);
    const onAgain = Draw(true);      // 噪声底：同一份配置连画两次
    T.actorBatch.SetEnabled(false);
    Warm();                          // 关掉之后也要自己收敛，否则 off 里掺着 on 的历史
    const off = Draw(true);
    const offAgain = Draw(true);
    T.actorBatch.SetEnabled(true);
    const noiseOn = Compare(on.pixels, onAgain.pixels);
    const noiseOff = Compare(off.pixels, offAgain.pixels);
    return {
      calls: { on: on.calls, off: off.calls },
      stats: { ...T.actorBatch.stats },
      // 噪声底取两侧的大者：任何一侧没压平，A/B 的结论都不作数。
      noise: noiseOn.pct >= noiseOff.pct ? noiseOn : noiseOff,
      diff: Compare(onAgain.pixels, offAgain.pixels),
    };
  }, WARM_DRAWS);
  await page.close();

  const { calls, stats, noise, diff } = result;
  const tolerance = Math.max(MAX_DIFF_PCT, noise.pct * NOISE_FACTOR);
  const label = `phase=${phase} draw ${calls.off} -> ${calls.on}`
    + ` | 实例 ${stats.instances}（${stats.actors} 人 / ${stats.batches} 批）`
    + ` | 差异 ${diff.pct.toFixed(4)}%（噪声底 ${noise.pct.toFixed(4)}%，`
    + `阈值 ${tolerance.toFixed(4)}%）`;
  if (stats.instances > 0) batchedPhases += 1;
  if (noise.pct > MAX_NOISE_PCT) {
    failures.push(`时域链没收敛（预热 ${WARM_DRAWS} 趟仍有噪声，最大通道差 ${noise.max}）：${label}`);
  } else if (diff.pct > tolerance) {
    failures.push(`合批改变了画面（最大通道差 ${diff.max}）：${label}`);
  } else if (stats.instances > 0 && calls.on >= calls.off) {
    failures.push(`合批没省下提交：${label}`);
  } else if (stats.instances === 0) {
    console.log(`ok   ${label}  ← 本关没有可合批的人物（全是蒙皮 GLB），提交量断言是空的`);
  } else {
    console.log(`ok   ${label}`);
  }
}

if (errors.length) failures.push(`页面报错：${errors.slice(0, 3).join(" / ")}`);

await browser.close();
server.close();

if (failures.length) {
  console.error("\n人物合批回归失败：");
  for (const line of failures) console.error(`  ${line}`);
  process.exit(1);
}
if (!batchedPhases) {
  // 不判红：合批层没坏，只是当下的正片里没有它的活。但这一轮确实什么都没验到，
  // 说出来，别让一条绿线冒充覆盖率。要真验提交量，得先有程序化人物出场
  // （见文件头「本关的合批断言可能是空的」）。
  console.log(`\n注意：${PHASES.length} 关全部 实例=0 —— 这一轮开关合批连一个网格都没挪，`
    + `比的是「配置跟自己比」。逐像素无损与提交量两条断言这一轮都是空的。`);
} else {
  console.log("\n人物合批：逐像素无损，提交量确实降下来了。");
}
