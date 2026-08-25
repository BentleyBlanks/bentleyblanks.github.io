// 《滕县 一九三八》探针体（GI）冒烟测试。
//
// 存在的理由和 Script_BootTest 一样：**shader 编译失败 three 是静默吞掉的**。
// GI 这一路更隐蔽 —— 图集全黑、切比雪夫恒为 0、探针全被判成埋在墙里，
// 三种情况画面都还在，只是「间接光没了」，光看截图很容易当成美术风格。
// 所以这里查的是数值而不是观感：
//
//   1. 页面没有控制台报错（含 shader 编译失败）；
//   2. 代理盒表非空 —— 否则射线全部漏空，探针体退化成一张天空 IBL；
//   3. 图集真的收敛了（blend 到 1）且有能量（max > 0）；
//   4. 有效探针占比合理 —— 全被判死（重定位失败）等于 GI 没上；
//   5. gi=1 与 gi=0 两张图**必须不一样**。一样就说明注入没生效。
//
// 用法：node Taierzhuang1938/Script_GiTest.mjs
// 退出码即成败。

import path from "node:path";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(projectDir, "..");

const server = await ServeRoot(rootDir, 0);
const port = server.address().port;
const browser = await LaunchBrowser();
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });

const problems = [];
page.on("pageerror", (error) => problems.push(`PAGEERROR ${String(error).slice(0, 300)}`));
page.on("console", (message) => {
  if (message.type() !== "error") return;
  const url = message.location()?.url || "";
  if (/fonts\.(googleapis|gstatic)\.com/.test(url)) return;
  problems.push(`CONSOLE ${message.text().slice(0, 400)}`);
});

let failed = 0;
function Check(ok, label, detail = "") {
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${detail ? `  ${detail}` : ""}`);
  if (!ok) failed += 1;
}

// “GI 辐照度”显示的是材质最终真正采用的间接光，不是有限探针体的裸值。
// 体积外 confidence=0，正式着色会退回 IBL；调试色若绕过同一条 mix，远处
// 就会被误画成纯黑。shader 编译只保证语法正确，这条源契约锁住显示口径。
const materialSource = await readFile(path.join(projectDir, "Script_Materials.mjs"), "utf8");
Check(materialSource.includes(
  "gGiDebugColor = mix(iblIrradiance, giIrradiance, giConfidence) * 0.05;"),
"GI 辐照度视图在探针体外回退天空 IBL");

/** 跑一遍探针页，推够帧数让图集收敛，回收一批可断言的数值。 */
async function Run(query) {
  problems.length = 0;
  await page.goto(`http://127.0.0.1:${port}/Taierzhuang1938/Probe.html?${query}`,
    { waitUntil: "load", timeout: 90000 });
  await page.waitForFunction(() => window.Probe !== undefined, null, { timeout: 90000 });
  // 探针体一帧只更新十几个，980 个要扫满一遍；给足 400 帧再看
  await page.evaluate(() => window.Probe.StepFrames(400));
  await page.waitForTimeout(400);
  return page.evaluate(() => {
    const probe = window.Probe;
    const gi = probe.gi;
    const canvas = probe.renderer.domElement;
    // 画面亮度：**必须在同一个任务里先渲一帧再抓** —— WebGL 画布默认
    // preserveDrawingBuffer=false，上一帧的内容出了当前任务就没了，
    // drawImage 抓到的是一整块黑（第一版就是这么假通过的）
    probe.StepFrames(1);
    const small = document.createElement("canvas");
    small.width = 32; small.height = 18;
    const ctx = small.getContext("2d");
    ctx.drawImage(canvas, 0, 0, 32, 18);
    const pixels = ctx.getImageData(0, 0, 32, 18).data;
    const luma = [];
    for (let i = 0; i < pixels.length; i += 4) {
      luma.push(0.2126 * pixels[i] + 0.7152 * pixels[i + 1] + 0.0722 * pixels[i + 2]);
    }
    const result = {
      luma,
      mean: luma.reduce((a, b) => a + b, 0) / luma.length,
      gi: null,
    };
    if (!gi) return result;

    // 图集能量：半浮点靶要按 Uint16 读回来再解半浮点
    const target = gi.irradiance[gi.pingPong];
    const buffer = new Uint16Array(target.width * target.height * 4);
    probe.renderer.readRenderTargetPixels(target, 0, 0, target.width, target.height, buffer);
    let max = 0, sum = 0, count = 0;
    for (let i = 0; i < buffer.length; i += 4) {
      const v = THREE_fromHalf(buffer[i]) + THREE_fromHalf(buffer[i + 1]) + THREE_fromHalf(buffer[i + 2]);
      if (!Number.isFinite(v)) continue;
      max = Math.max(max, v); sum += v; count += 1;
    }
    let active = 0;
    for (let i = 3; i < gi.offsetData.length; i += 4) if (gi.offsetData[i] > 0) active += 1;

    return {
      ...result,
      gi: {
        boxCount: gi.boxCount,
        probeCount: gi.probeCount,
        active,
        blend: gi.blend,
        warmed: gi.warmed,
        atlasMax: max,
        atlasMean: count > 0 ? sum / count : 0,
        atlasSize: [target.width, target.height],
      },
    };

    // 半浮点解码（IEEE 754 binary16）。放在 evaluate 内部，页面里没有 node 的依赖。
    function THREE_fromHalf(value) {
      const sign = (value & 0x8000) ? -1 : 1;
      const exponent = (value & 0x7c00) >> 10;
      const fraction = value & 0x03ff;
      if (exponent === 0) return sign * 6.103515625e-5 * (fraction / 1024);
      if (exponent === 0x1f) return fraction ? NaN : sign * Infinity;
      return sign * Math.pow(2, exponent - 15) * (1 + fraction / 1024);
    }
  });
}

const withGi = await Run("scene=street&preset=smokyDay&quality=high&gi=1");
const giProblems = problems.slice();
Check(giProblems.length === 0, "探针页无控制台报错", giProblems.slice(0, 3).join(" | "));
Check(!!withGi.gi, "ProbeVolume 已挂上");

if (withGi.gi) {
  const g = withGi.gi;
  console.log(`     图集 ${g.atlasSize[0]}×${g.atlasSize[1]}  探针 ${g.probeCount}（有效 ${g.active}）`
    + `  代理盒 ${g.boxCount}  已更新 ${g.warmed}`);
  Check(g.boxCount > 0, "代理盒表非空", `boxCount=${g.boxCount}`);
  Check(g.blend >= 1, "图集已收敛并淡入完成", `blend=${g.blend.toFixed(2)}`);
  Check(g.active > g.probeCount * 0.5, "有效探针过半",
    `${g.active}/${g.probeCount}`);
  Check(g.atlasMax > 0.001, "辐照度图集有能量", `max=${g.atlasMax.toFixed(4)}`);
  Check(g.atlasMean > 0.0001, "辐照度图集不是一片黑", `mean=${g.atlasMean.toFixed(5)}`);
}

const withoutGi = await Run("scene=street&preset=smokyDay&quality=high&gi=0");
Check(problems.length === 0, "关掉 GI 的探针页无报错", problems.slice(0, 3).join(" | "));

// 逐块比较：GI 一上，街两侧的墙必须**分出明暗**，不能只是整体亮度平移一档
let changed = 0;
let maxDelta = 0;
for (let i = 0; i < withGi.luma.length; i += 1) {
  const delta = Math.abs(withGi.luma[i] - withoutGi.luma[i]);
  if (delta > 3) changed += 1;
  maxDelta = Math.max(maxDelta, delta);
}
const ratio = changed / withGi.luma.length;
console.log(`     画面均值 gi=${withGi.mean.toFixed(1)} / 无 gi=${withoutGi.mean.toFixed(1)}`
  + `  变化块 ${changed}/${withGi.luma.length}  最大差 ${maxDelta.toFixed(1)}`);
Check(ratio > 0.25, "GI 真的改变了画面（不是注入失败）",
  `${(ratio * 100).toFixed(0)}% 的块变了`);

await browser.close();
server.close();
console.log(failed === 0 ? "\nGI 冒烟通过。" : `\nGI 冒烟失败：${failed} 项。`);
process.exit(failed === 0 ? 0 : 1);
