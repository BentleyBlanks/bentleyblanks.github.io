// 《滕县 一九三八》体积光方向性性能回归。
//
// 用户截图是 3394×1348 超宽画面。旧版环境浮尘朝太阳时会从稀薄状态突然
// 变成覆盖全屏的前向散射层；径向模糊本身还有 848×337×24 步×2 纹理采样的
// 潜在预算风险。这个测试用同尺寸比较正对/背向太阳，并锁死便宜 fallback 的结构。
//
// 用法：node Taierzhuang1938/Script_GodRaysPerformanceTest.mjs

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
  await page.goto(`http://127.0.0.1:${port}/Taierzhuang1938/?shot=1&phase=0&quality=high&scale=small`,
    { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => window.Taierzhuang !== undefined, { timeout: 300000 });
  result = await page.evaluate(() => {
    const T = window.Taierzhuang;
    T.StepFrames(30);
    const direction = T.sky.sunDirection.clone().normalize();
    const sunPitch = Math.asin(direction.y);
    const sunYaw = Math.atan2(-direction.x, -direction.z);
    const gl = T.renderer.getContext();

    const Orient = (toward) => {
      T.player.yaw = toward ? sunYaw : sunYaw + Math.PI;
      T.player.pitch = toward ? sunPitch : -sunPitch;
      T.player.aimYaw = 0;
      T.player.aimPitch = 0;
    };
    const Sample = (toward, godrays) => {
      T.post.preset.godrays = godrays;
      Orient(toward);
      T.StepFrames(3);
      gl.finish();
      const samples = [];
      for (let batch = 0; batch < 3; batch += 1) {
        const started = performance.now();
        for (let frame = 0; frame < 4; frame += 1) {
          T.StepFrames(1);
          gl.finish();
        }
        samples.push((performance.now() - started) / 4);
      }
      samples.sort((a, b) => a - b);
      const projectionDistance = Math.min(600, T.camera.far * 0.9);
      const ndc = direction.clone().multiplyScalar(projectionDistance)
        .add(T.camera.position).project(T.camera);
      const forward = T.camera.getWorldDirection(new T.camera.position.constructor());
      return {
        ms: samples[1], strength: T.post.uniformsComposite.uGodStrength.value,
        ndc: [ndc.x, ndc.y, ndc.z], facing: forward.dot(direction),
      };
    };
    // 先跑一遍两个 shader 分支做预热，不把首次编译算进成稳态帧时。
    Sample(true, true);
    Sample(true, false);
    return {
      towardGod: Sample(true, true),
      towardNoGod: Sample(true, false),
      awayGod: Sample(false, true),
      godSize: [T.post.targets.god.width, T.post.targets.god.height],
      brightSize: [T.post.targets.bright.width, T.post.targets.bright.height],
      fixedFallback: T.post.matGod.fragmentShader.includes("TapRay(ray, 0.90")
        && !T.post.matGod.fragmentShader.includes("const int STEPS"),
      godReadsFullDepth: T.post.matGod.fragmentShader.includes("uNormalDepth"),
      brightPacksSky: T.post.matBright.fragmentShader.includes("uPackSky")
        && T.post.matBright.fragmentShader.includes("gl_FragColor = vec4(c * contrib, sky)"),
      dustHasDirectionalScattering: T.vfx.dust.material.fragmentShader.includes("backlit")
        || T.vfx.dust.material.fragmentShader.includes("1.7 *"),
    };
  });
} finally {
  await browser.close();
  server.close();
}

if (result) {
  const extra = result.towardGod.ms - result.towardNoGod.ms;
  console.log(`god=${result.godSize.join("x")} bright=${result.brightSize.join("x")}`);
  console.log(`toward+god ${result.towardGod.ms.toFixed(1)} ms strength=${result.towardGod.strength.toFixed(3)}`
    + ` facing=${result.towardGod.facing.toFixed(3)} ndc=${result.towardGod.ndc.map((v) => v.toFixed(2)).join(",")}`);
  console.log(`toward-god ${result.towardNoGod.ms.toFixed(1)} ms strength=${result.towardNoGod.strength.toFixed(3)}`);
  console.log(`away+god   ${result.awayGod.ms.toFixed(1)} ms strength=${result.awayGod.strength.toFixed(3)}`);
  console.log(`god extra  ${extra.toFixed(1)} ms`);
}
for (const error of errors) console.log(error);
const failures = [];
if (result) {
  const godPixels = result.godSize[0] * result.godSize[1];
  if (godPixels > 96000) failures.push(`太阳拖影靶超预算 ${godPixels} > 96000 px`);
  if (!result.fixedFallback) failures.push("未使用固定 tap 方向 blur fallback");
  if (result.godReadsFullDepth) failures.push("太阳拖影仍在每个 tap 采全分辨率深度");
  if (!result.brightPacksSky) failures.push("亮部 alpha 未携带天空遮挡");
  if (result.dustHasDirectionalScattering) failures.push("环境浮尘仍含朝太阳爆发的方向散射");
  if (!(result.towardGod.strength > 0)) failures.push("正对太阳时 fallback 没有真正启用");
  if (result.towardNoGod.strength !== 0) failures.push("关闭体积光后仍有强度");
  if (result.awayGod.strength !== 0) failures.push("背向太阳时仍在跑 fallback");
}
for (const failure of failures) console.log(`FAIL ${failure}`);
process.exit(errors.length || failures.length || !result ? 1 : 0);
