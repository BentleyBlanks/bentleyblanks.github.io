// ===========================================================================
// Script_PostFrameGraphTest.mjs —— 渲染帧图地基的看门狗（真浏览器，render 域）
//
// 2026-09 帧图重构之后，八个并行子系统（CSM / GTAO / SSR / 体积雾 / 大气 /
// 曝光 / TAAU / 簇状光）全部按这里断言的契约接入。**这些断言不是「跑通了」，
// 是「接口还在」** —— 谁把它们改红了，就是把别人的地基抽了。
//
// 每一条都读回像素或读回真实对象，不看 visible 标记：
//   1. pass 列表顺序（帧图本身）
//   2. 预通道是 MRT：RT0 有几何、RT1 存在、DepthTexture 挂着
//   3. 相机静止时速度靶≈0（读回调试视图的像素，不是读 uniform）
//   4. 相机右移时中心像素速度符号正确
//   5. HZB 每级 max 单调（半浮点读回解码）
//   6. SunShadowVisibility 调试图有黑有白（公共阴影接口的最小验证）
//   7. 材质补丁 cache key 三态互异（少了它两种档位共用同一份编译缓存）
//   8. 60 帧内 renderer.info.programs 不增长（没有每帧重编译）
//
// 用法：node Taierzhuang1938/Script_PostFrameGraphTest.mjs
// 退出码即成败。
// ===========================================================================

import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(projectDir, "..");
const server = await ServeRoot(rootDir, 0);
const port = server.address().port;
const browser = await LaunchBrowser();
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });

const problems = [];
page.on("pageerror", (error) => problems.push(`PAGEERROR ${String(error).slice(0, 240)}`));
page.on("console", (message) => {
  if (message.type() !== "error") return;
  const url = message.location()?.url || "";
  if (/fonts\.(googleapis|gstatic)\.com/.test(url)) return;
  problems.push(`CONSOLE ${message.text().slice(0, 240)}`);
});

let result = null;
try {
  await page.goto(
    `http://127.0.0.1:${port}/Taierzhuang1938/Probe.html?quality=high&preset=smokyDay&scene=street&gi=0`,
    { waitUntil: "load", timeout: 180000 },
  );
  await page.waitForFunction(() => window.Probe?.state?.ready, null, { timeout: 240000 });
  result = await page.evaluate(async () => {
    const P = window.Probe;
    const post = P.post;
    const renderer = P.renderer;
    const gl = renderer.getContext();
    const out = {};

    // --- 1) 帧图顺序 ------------------------------------------------------
    out.passOrder = post.passes.map((pass) => pass.name);

    // --- 2) 预通道 MRT ----------------------------------------------------
    P.state.elapsed = 0;
    P.post.frame = 0;
    P.post.hasTaaHistory = false;
    P.post.hasPrev = false;
    P.StepFrames(8, 1 / 60);
    const target = post.targets.normalDepth;
    out.mrt = {
      attachments: target.textures.length,
      velocityTexture: !!post.VelocityTexture,
      velocityIsSecond: post.VelocityTexture === target.textures[1],
      depthTexture: !!post.SceneDepthTexture,
      normalDepthIsFirst: post.NormalDepthTexture === target.textures[0],
    };
    // RT0 真的有几何：中心一块的线性视深必须 > 0（半浮点按 Uint16 读回解码）
    const HalfToFloat = (bits) => {
      const sign = (bits >> 15) & 1 ? -1 : 1;
      const exponent = (bits >> 10) & 0x1f;
      const mantissa = bits & 0x3ff;
      if (exponent === 0) return sign * Math.pow(2, -14) * (mantissa / 1024);
      if (exponent === 31) return mantissa ? NaN : sign * Infinity;
      return sign * Math.pow(2, exponent - 15) * (1 + mantissa / 1024);
    };
    const ndPixels = new Uint16Array(16 * 16 * 4);
    renderer.readRenderTargetPixels(target,
      Math.floor(target.width / 2) - 8, Math.floor(target.height / 2) - 8, 16, 16, ndPixels);
    let ndMaxDepth = 0;
    let ndNormalNonZero = 0;
    for (let i = 0; i < 16 * 16; i += 1) {
      ndMaxDepth = Math.max(ndMaxDepth, HalfToFloat(ndPixels[i * 4 + 3]));
      if (Math.abs(HalfToFloat(ndPixels[i * 4 + 2])) > 0.01) ndNormalNonZero += 1;
    }
    out.mrt.maxViewDepth = ndMaxDepth;
    out.mrt.normalNonZero = ndNormalNonZero;

    // --- 展示 pass 一律读回屏幕像素（不读回就等于没验） -------------------
    const ReadScreen = () => {
      const w = gl.drawingBufferWidth;
      const h = gl.drawingBufferHeight;
      const pixels = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      return { w, h, pixels };
    };
    const CenterPixel = (shot) => {
      const i = ((shot.h >> 1) * shot.w + (shot.w >> 1)) * 4;
      return [shot.pixels[i], shot.pixels[i + 1], shot.pixels[i + 2]];
    };
    // 画面正中央在这一机位上正好是地平线（相机 y=1.68 平视 y=1.6），**是天空**，
    // 而天空整只 skipNormalDepth 藏出预通道，速度靶那里留的是 clear 值 0。
    // 所以速度取证一律取画面下四分之一（readPixels 的 y=0 是屏幕底边）= 街面。
    const GroundBandMeanR = (shot) => {
      let sum = 0;
      let count = 0;
      for (let y = 0; y < shot.h >> 2; y += 1) {
        for (let x = 0; x < shot.w; x += 4) {
          sum += shot.pixels[(y * shot.w + x) * 4];
          count += 1;
        }
      }
      return sum / count;
    };

    // --- 3) 相机静止：速度≈0（编码 0.5 → 128） ---------------------------
    const viewWas = post.GetDebugView();
    post.SetDebugView("velocity");
    P.StepFrames(3, 1 / 60);
    const still = ReadScreen();
    let stillOff = 0;
    let stillMax = 0;
    for (let i = 0; i < still.pixels.length; i += 4) {
      const dx = Math.abs(still.pixels[i] - 128);
      const dy = Math.abs(still.pixels[i + 1] - 128);
      stillMax = Math.max(stillMax, dx, dy);
      if (dx > 2 || dy > 2) stillOff += 1;
    }
    out.velocityStill = {
      offPixels: stillOff, total: still.pixels.length / 4, maxDelta: stillMax,
      groundMeanR: GroundBandMeanR(still), center: CenterPixel(still),
    };

    // --- 4) 相机右移：中心像素速度 x 为负（画面向左走） -------------------
    const camX = P.camera.position.x;
    P.StepFrames(1, 1 / 60);              // 让上一帧矩阵与当前对齐
    P.camera.position.x = camX + 0.35;    // 一帧走 35 cm，远大于半浮点噪声
    P.StepFrames(1, 1 / 60);
    const moved = ReadScreen();
    const movedGround = GroundBandMeanR(moved);
    P.camera.position.x = camX;
    // 相机右移 = 世界在屏幕上左移 = 本帧 uv 比上一帧小 = 速度 x 为负 = 编码值 < 128。
    out.velocityPan = {
      groundMeanR: movedGround, center: CenterPixel(moved),
      xNegative: movedGround < out.velocityStill.groundMeanR - 8,
    };
    post.SetDebugView(viewWas);
    P.StepFrames(2, 1 / 60);

    // --- 5) HZB 每级 max 单调 --------------------------------------------
    const hzb = post.Hzb;
    const levels = [];
    if (hzb) {
      for (let i = 0; i < post.prepassPass.hzbLevels.length; i += 1) {
        const rt = post.prepassPass.hzbLevels[i];
        const buffer = new Uint16Array(rt.width * rt.height * 4);
        renderer.readRenderTargetPixels(rt, 0, 0, rt.width, rt.height, buffer);
        let max = -Infinity;
        let min = Infinity;
        for (let p = 0; p < rt.width * rt.height; p += 1) {
          const value = HalfToFloat(buffer[p * 4]);
          if (value > max) max = value;
          if (value < min) min = value;
        }
        levels.push({ size: [rt.width, rt.height], min, max });
      }
    }
    out.hzb = {
      present: !!hzb, mipCount: hzb ? hzb.mipCount : 0,
      hasSource: !!hzb?.source, levels,
      // max-reduce：每一级覆盖同一片屏幕，全局最大值只能持平（floor 折半时
      // 可能丢掉最后一列/行，允许 0.5% 的松动），全局最小值只能升不能降。
      monotone: levels.every((level, i) => i === 0
        || (level.max <= levels[i - 1].max * 1.005 && level.min >= levels[i - 1].min * 0.995)),
      positive: levels.every((level) => level.min > 0 && Number.isFinite(level.max)),
    };

    // --- 6) SunShadow 采样接口的最小验证 ---------------------------------
    post.SetDebugView("sunShadow");
    P.StepFrames(2, 1 / 60);
    const shadowShot = ReadScreen();
    let greyDark = 0;
    let greyBright = 0;
    for (let i = 0; i < shadowShot.pixels.length; i += 4) {
      const r = shadowShot.pixels[i];
      const g = shadowShot.pixels[i + 1];
      const b = shadowShot.pixels[i + 2];
      if (r !== g || g !== b) continue;      // 天空是深蓝底，不算数
      if (r < 90) greyDark += 1;
      if (r > 220) greyBright += 1;
    }
    out.sunShadow = {
      dark: greyDark, bright: greyBright,
      hasBoth: greyDark > 50 && greyBright > 50,
      center: CenterPixel(shadowShot),
    };
    post.SetDebugView(viewWas);
    P.StepFrames(2, 1 / 60);

    // --- 7) 材质补丁 cache key 三态互异 -----------------------------------
    const patches = await import("./Script_MaterialPatches.mjs");
    const THREE = await import("./vendor/three/build/three.module.js");
    const gi = P.library.gi;
    const ssao = { map: { value: null }, resolution: { value: new THREE.Vector2(1, 1) }, strength: { value: 1 } };
    const MakeKey = (options) => {
      const material = new THREE.MeshStandardMaterial();
      patches.ApplyPatches(material, patches.IndirectLightingPatches(options));
      return material.customProgramCacheKey();
    };
    const samplingWas = gi.sampling;
    gi.sampling = false;
    const keyDebugOnly = MakeKey({ ssao, gi });
    gi.sampling = true;
    const keySampling = MakeKey({ ssao, gi });
    gi.sampling = samplingWas;
    const keyNoGi = MakeKey({ ssao });
    out.cacheKeys = {
      noGi: keyNoGi, debugOnly: keyDebugOnly, sampling: keySampling,
      distinct: new Set([keyNoGi, keyDebugOnly, keySampling]).size === 3,
      // 同一份材质在运行时翻转 sampling 必须换 key（否则撞缓存拿到旧程序）
      liveFlip: (() => {
        const material = new THREE.MeshStandardMaterial();
        patches.ApplyPatches(material, patches.IndirectLightingPatches({ ssao, gi }));
        gi.sampling = false;
        const a = material.customProgramCacheKey();
        gi.sampling = true;
        const b = material.customProgramCacheKey();
        gi.sampling = samplingWas;
        return a !== b;
      })(),
    };

    // --- 7.5) MRT 的硬约束：一输出的外来材质必须藏出预通道 ----------------
    // WebGL2 里「enabled 的 draw buffer 没有对应的片元输出」= INVALID_OPERATION，
    // 那一次 draw 整个被丢掉。allowOverride=false 的东西（天空穹/水面/粒子/烟/
    // 编辑器线框）用的是自己的一输出材质，所以必须整只藏出这一趟。
    while (gl.getError() !== 0) { /* 先把之前读回像素攒下的清干净 */ }
    const foreignGeometry = new THREE.BufferGeometry();
    foreignGeometry.setAttribute("position", new THREE.BufferAttribute(
      new Float32Array([0, 1, -3, 1, 2, -3, 1, 2, -3, 2, 1, -3]), 3));
    const foreignMaterial = new THREE.LineBasicMaterial({ color: 0xff0000 });
    foreignMaterial.allowOverride = false;                 // = MarkNoPrepass 的效果
    const foreignLine = new THREE.LineSegments(foreignGeometry, foreignMaterial);
    foreignLine.frustumCulled = false;
    P.scene.add(foreignLine);
    P.StepFrames(3, 1 / 60);
    const foreignSkipped = post.prepassPass._CollectSkipped(P.scene, P.camera).includes(foreignLine);
    out.foreignMaterial = { skipped: foreignSkipped, glError: gl.getError() };
    P.scene.remove(foreignLine);
    foreignGeometry.dispose();
    foreignMaterial.dispose();
    P.StepFrames(2, 1 / 60);

    // --- 8) 稳态不再编译新程序 -------------------------------------------
    P.StepFrames(10, 1 / 60);
    const programsBefore = renderer.info.programs.length;
    P.StepFrames(60, 1 / 60);
    out.programs = { before: programsBefore, after: renderer.info.programs.length };
    out.glError = gl.getError();
    return out;
  });
} catch (error) {
  problems.push(`THROW ${String(error).slice(0, 400)}`);
}

await browser.close();
server.close();

// 2026-09 SSR 落地插了两行：`ssr`（min-Hi-Z + 追踪 + 解算 + 时域，必须在 main
// 之前 —— 材质那一趟要采它的靶）与 `ssrColor`（TAA 解算后的 HDR 降成带 mip 的
// 「上一帧场景色」，供下一帧取色）。物理大气的 `atmosphere`（刷天空视图 / 大气透视 LUT）
// 排在最前：天穹与材质都要采它。
const EXPECTED_ORDER = ["atmosphere", "prepass", "hzb", "ssr", "ssao", "main", "wireframe", "debugOverlay",
  "taa", "ssrColor", "godPrepare", "bloom", "god", "composite", "fxaa"];

const checks = [];
function Check(name, ok, detail = "") {
  checks.push({ name, ok: !!ok, detail });
}

if (!result) {
  Check("页面取证成功", false, problems.join(" | "));
} else {
  Check("帧图 pass 顺序未变",
    JSON.stringify(result.passOrder) === JSON.stringify(EXPECTED_ORDER),
    JSON.stringify(result.passOrder));
  Check("预通道是 MRT（RT0 法线深度 + RT1 速度 + DepthTexture）",
    result.mrt.attachments === 2 && result.mrt.velocityTexture && result.mrt.velocityIsSecond
    && result.mrt.depthTexture && result.mrt.normalDepthIsFirst,
    JSON.stringify(result.mrt));
  Check("RT0 有真几何（中心块视深 > 0、法线非零）",
    result.mrt.maxViewDepth > 0.1 && result.mrt.normalNonZero > 0,
    `depth=${result.mrt.maxViewDepth} normals=${result.mrt.normalNonZero}`);
  Check("相机静止时速度靶≈0",
    result.velocityStill.offPixels / result.velocityStill.total < 0.01
    && result.velocityStill.maxDelta <= 8
    && Math.abs(result.velocityStill.groundMeanR - 128) < 2,
    JSON.stringify(result.velocityStill));
  Check("相机右移时街面像素速度 x 为负",
    result.velocityPan.xNegative, JSON.stringify(result.velocityPan));
  Check("HZB 建起来了且每级 max 单调",
    result.hzb.present && result.hzb.mipCount >= 3 && result.hzb.hasSource
    && result.hzb.monotone && result.hzb.positive,
    JSON.stringify({ ...result.hzb, levels: result.hzb.levels.slice(0, 3) }));
  Check("SunShadow 采样调试图有黑有白",
    result.sunShadow.hasBoth, JSON.stringify(result.sunShadow));
  Check("材质补丁 cache key 三态互异且运行时翻转会换 key",
    result.cacheKeys.distinct && result.cacheKeys.liveFlip,
    JSON.stringify(result.cacheKeys));
  Check("外来一输出材质被藏出 MRT 预通道且不刷 GL 错误",
    result.foreignMaterial.skipped && result.foreignMaterial.glError === 0,
    JSON.stringify(result.foreignMaterial));
  Check("60 帧内不再编译新程序",
    result.programs.after === result.programs.before, JSON.stringify(result.programs));
  Check("无 GL 错误", result.glError === 0, `glError=${result.glError}`);
  Check("页面无控制台报错", problems.length === 0, problems.slice(0, 4).join(" | "));
}

for (const check of checks) {
  console.log(`${check.ok ? "ok  " : "FAIL"} ${check.name}${check.ok ? "" : `  ${check.detail}`}`);
}
const failed = checks.filter((check) => !check.ok);
console.log(failed.length ? `\n${failed.length} 条失败` : "\n帧图契约全绿");
if (failed.length) process.exit(1);
