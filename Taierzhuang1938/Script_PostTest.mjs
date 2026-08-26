// 后处理暗部保真回归：用受控 HDR 灰阶直接喂 Composite，防止对比度分级
// 又在线性域把有信息的暗部硬裁成纯黑。
// 附带 TAA 基本盘：high 档 taa 必须在跑（历史滚起来）、抖动矩阵帧末必须还原、
// 解算输出不许是全黑/NaN 靶 —— 这三条断言分别对着"TAA 静默没跑"、
// "抖动泄漏进太阳投影与运动模糊"、"历史被 NaN 污染"三种最难肉眼定位的坏法。
//
// 用法：node Taierzhuang1938/Script_PostTest.mjs
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
const page = await browser.newPage({ viewport: { width: 320, height: 180 } });

const problems = [];
page.on("pageerror", (error) => problems.push(`PAGEERROR ${String(error).slice(0, 240)}`));
page.on("console", (message) => {
  if (message.type() !== "error") return;
  const url = message.location()?.url || "";
  if (/fonts\.(googleapis|gstatic)\.com/.test(url)) return;
  problems.push(`CONSOLE ${message.text().slice(0, 240)}`);
});

let result = null;
let taa = null;
try {
  await page.goto(
    `http://127.0.0.1:${port}/Taierzhuang1938/Probe.html?quality=high&preset=smokyDay&scene=materials&gi=0`,
    { waitUntil: "load", timeout: 120000 },
  );
  await page.waitForFunction(() => window.Probe?.state?.ready, null, { timeout: 180000 });
  // TAA 基本盘要先测：后面的暗部测试会劫持 composite 的 uniforms，
  // 虽然下一真帧会自愈，但在同一次取证里别赌顺序。
  taa = await page.evaluate(() => {
    const P = window.Probe;
    const post = P.post;
    // 滚超过一个 Halton 周期（8 帧），历史真的在乒乓里转起来
    P.StepFrames(12);
    const e = P.camera.projectionMatrix.elements;
    const rgba = new Uint8Array(4);
    P.renderer.readRenderTargetPixels(post.targets.ldr,
      Math.floor(post.width / 2), Math.floor(post.height / 2), 1, 1, rgba);
    return {
      presetOn: !!post.preset.taa,
      historyRolling: !!post.hasTaaHistory && !!post.targets.taaA && !!post.targets.taaB,
      // 帧末抖动必须还原：对称视锥这两项精确为 0，残留就是泄漏
      projClean: e[8] === 0 && e[9] === 0,
      fxaaOff: post.uniformsFxaa.uFxaa.value === 0,
      // 中心像素非纯黑：TAA→composite 整条链在出画（NaN 污染/全黑靶都过不了）
      center: Array.from(rgba),
      glError: P.renderer.getContext().getError(),
    };
  });
  result = await page.evaluate(async () => {
    const THREE = await import("./vendor/three/build/three.module.js");
    const P = window.Probe;
    const post = P.post;
    const U = post.uniformsComposite;
    const MakePixel = (value) => {
      const texture = new THREE.DataTexture(
        new Uint8Array([value, value, value, 255]), 1, 1,
        THREE.RGBAFormat, THREE.UnsignedByteType,
      );
      texture.colorSpace = THREE.NoColorSpace;
      texture.minFilter = THREE.NearestFilter;
      texture.magFilter = THREE.NearestFilter;
      texture.generateMipmaps = false;
      texture.needsUpdate = true;
      return texture;
    };

    // 8/255 是有真实信息的低线性 HDR 值。旧的线性域 contrast=1.10 会先减
    // 0.05，把它连同 ACES 后的全部暗部直接裁成 0；感知域分级应保留为可见灰。
    const dark = MakePixel(8);
    const black = MakePixel(0);
    U.uHdr.value = dark;
    U.uBloom.value = black;
    U.uGod.value = black;
    U.uNormalDepth.value = black;
    U.uResolution.value.set(post.width, post.height);
    U.uExposure.value = 1;
    U.uBloomStrength.value = 0;
    U.uGodStrength.value = 0;
    U.uVignette.value = 0;
    U.uAberration.value = 0;
    U.uGrain.value = 0;
    U.uSaturation.value = 1;
    U.uContrast.value = 1.10;
    U.uLift.value.set(0, 0, 0);
    U.uGain.value.set(1, 1, 1);
    U.uSplitShadow.value = 0;
    U.uSplitHighlight.value = 0;
    U.uMotionScale.value = 0;
    U.uDamage.value = 0;
    U.uFade.value = 0;
    U.uDofStrength.value = 0;
    U.uFogDensity.value = 0;
    post._Blit(post.matComposite, post.targets.ldr);

    const rgba = new Uint8Array(4);
    P.renderer.readRenderTargetPixels(post.targets.ldr,
      Math.floor(post.width / 2), Math.floor(post.height / 2), 1, 1, rgba);
    const glError = P.renderer.getContext().getError();
    dark.dispose();
    black.dispose();
    return { rgba: Array.from(rgba), glError };
  });
} catch (error) {
  problems.push(`THROW ${String(error).slice(0, 240)}`);
}

await browser.close();
server.close();

// 这组输入在正确链路上应落在约 8/255；旧线性域对比会精确落到 0。
// 阈值留两级量化裕量，既抓黑裁切，也不把驱动间的舍入差当回归。
const visibleShadow = result && Math.min(...result.rgba.slice(0, 3)) >= 6;
const ok = problems.length === 0 && result?.glError === 0 && visibleShadow;
console.log(`${ok ? "ok  " : "FAIL"} Composite 感知域对比保留暗部`, result || "无结果");
const taaOk = taa && taa.presetOn && taa.historyRolling && taa.projClean
  && taa.fxaaOff && taa.glError === 0 && Math.max(...taa.center.slice(0, 3)) > 0;
console.log(`${taaOk ? "ok  " : "FAIL"} TAA 历史滚动 + 抖动还原 + 出画非黑`, taa || "无结果");
for (const problem of problems) console.log(`FAIL ${problem}`);
if (!ok || !taaOk) process.exit(1);
