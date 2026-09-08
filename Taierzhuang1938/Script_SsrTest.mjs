// ===========================================================================
// Script_SsrTest.mjs —— 屏幕空间反射的看门狗（真浏览器，render 域）
//
// 在探针页 `scene=materials` 上现摆一个受控场景：一块 roughness 0.10 的光滑
// 地板 + 一只强红色自发光立方体。地板上「本该映出立方体」的那一片像素，
// 在 SSR 靶里必须**真的是红的、置信度高**；把立方体挪出屏幕上方，同一片像素
// 的置信度必须掉到 0，而且红色不许被时域历史拖着不放（那就是拖影）。
//
// 每一条都读回像素（RGBA16F 按 Uint16 解半浮点），不看 uniform、不看 visible：
//   1. 帧图里有 ssr / ssrColor 两趟，材质补丁 key 带 ssr1
//   2. 光滑地板上映出立方体：红色主导 + 置信度 > 0.5
//   3. 立方体移出屏幕上方 → 那一片置信度 → 0，且红色在几帧内散掉（无拖影）
//   4. 屏幕边缘一列的置信度 = 0（屏幕外的信息本来就没有）
//   5. 把地板换成 roughness 0.95 → 整张 SSR 靶置信度 ≈ 0（超上限回退 PMREM）
//   6. 静止 32 帧逐帧差小于阈值（时域收敛，不是每帧重掷骰子）
//   7. 相机平移之后不留拖影（红色回到该在的地方，不在旧位置留一条）
//   8. 全靶无 NaN；60 帧内不再编译新程序；无 GL 错误
//
// 用法：node Taierzhuang1938/Script_SsrTest.mjs
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
    `http://127.0.0.1:${port}/Taierzhuang1938/Probe.html?quality=high&preset=smokyDay&scene=materials&gi=0`,
    { waitUntil: "load", timeout: 180000 },
  );
  await page.waitForFunction(() => window.Probe?.state?.ready, null, { timeout: 240000 });
  result = await page.evaluate(async () => {
    const P = window.Probe;
    const THREE = P.THREE;
    const post = P.post;
    const renderer = P.renderer;
    const gl = renderer.getContext();
    const out = { notes: [] };

    // --- 半浮点读回（RGBA16F 只能按 Uint16 拿原始位再解） -----------------
    const HalfToFloat = (bits) => {
      const sign = (bits >> 15) & 1 ? -1 : 1;
      const exponent = (bits >> 10) & 0x1f;
      const mantissa = bits & 0x3ff;
      if (exponent === 0) return sign * Math.pow(2, -14) * (mantissa / 1024);
      if (exponent === 31) return mantissa ? NaN : sign * Infinity;
      return sign * Math.pow(2, exponent - 15) * (1 + mantissa / 1024);
    };
    const ReadSsr = () => {
      const rt = post.targets.ssr;
      if (!rt) return null;
      const buffer = new Uint16Array(rt.width * rt.height * 4);
      renderer.readRenderTargetPixels(rt, 0, 0, rt.width, rt.height, buffer);
      return { width: rt.width, height: rt.height, buffer };
    };
    // 统计一片矩形区域（uv 空间，readPixels 的 y=0 在屏幕底边）
    const Stats = (shot, u0, v0, u1, v1) => {
      const x0 = Math.max(0, Math.floor(u0 * shot.width));
      const x1 = Math.min(shot.width, Math.ceil(u1 * shot.width));
      const y0 = Math.max(0, Math.floor(v0 * shot.height));
      const y1 = Math.min(shot.height, Math.ceil(v1 * shot.height));
      let count = 0;
      let redDominant = 0;
      let confSum = 0;
      let confMax = 0;
      let redSum = 0;
      let nan = 0;
      for (let y = y0; y < y1; y += 1) {
        for (let x = x0; x < x1; x += 1) {
          const i = (y * shot.width + x) * 4;
          const r = HalfToFloat(shot.buffer[i]);
          const g = HalfToFloat(shot.buffer[i + 1]);
          const b = HalfToFloat(shot.buffer[i + 2]);
          const a = HalfToFloat(shot.buffer[i + 3]);
          if (!Number.isFinite(r) || !Number.isFinite(g)
            || !Number.isFinite(b) || !Number.isFinite(a)) { nan += 1; continue; }
          count += 1;
          confSum += a;
          confMax = Math.max(confMax, a);
          redSum += r;
          if (a > 0.5 && r > 0.5 && r > g * 2.5 + 0.05 && r > b * 2.5 + 0.05) redDominant += 1;
        }
      }
      return {
        count, redDominant, nan,
        confMean: count ? confSum / count : 0,
        confMax, redMean: count ? redSum / count : 0,
      };
    };
    // 逐帧稳定度：绝对差没有意义（这块测试用的自发光立方体亮度可以随便定），
    // 要的是「变化量占信号量的比例」。随机 GGX + 时域累积的收敛残差本来就
    // 不是 0：当前帧权重 0.08，所以静止时每帧仍会动信号的百分之几。
    const StabilityRatio = (a, b) => {
      let diff = 0;
      let magnitude = 0;
      let confDiff = 0;
      for (let i = 0; i < a.buffer.length; i += 4) {
        const va = HalfToFloat(a.buffer[i]);
        const vb = HalfToFloat(b.buffer[i]);
        diff += Math.abs(va - vb);
        magnitude += Math.abs(va);
        confDiff += Math.abs(HalfToFloat(a.buffer[i + 3]) - HalfToFloat(b.buffer[i + 3]));
      }
      const n = a.buffer.length / 4;
      return { diff: diff / n, magnitude: magnitude / n, confDiff: confDiff / n };
    };

    // --- 0) 帧图与补丁登记 ------------------------------------------------
    out.passOrder = post.passes.map((pass) => pass.name);
    out.available = !!post.ssrPass.available;
    out.preset = {
      ssr: post.preset.ssr, scale: post.preset.ssrScale,
      steps: post.preset.ssrSteps, taps: post.preset.ssrResolveTaps,
    };
    const patches = await import("./Script_MaterialPatches.mjs");
    const probeMaterial = new THREE.MeshStandardMaterial();
    patches.ApplyPatches(probeMaterial, patches.IndirectLightingPatches({
      ssr: post.SsrUniforms,
    }));
    out.patchKey = probeMaterial.customProgramCacheKey();
    // 半透明材质不许挂 SSR 补丁（它要占 gl_FragColor.a，会改混合结果）
    const materials = await import("./Script_Materials.mjs");
    const clearMaterial = new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.4 });
    materials.InjectIndirectLighting(clearMaterial, { ssr: post.SsrUniforms });
    out.transparentPatchKey = clearMaterial.customProgramCacheKey();

    // --- 1) 摆受控场景：光滑地板 + 强红自发光立方体 ------------------------
    // 地板压在探针页原有的粗糙地面上方 2 cm（不共面，免 z-fighting）。
    const floorMaterial = P.library.Plain("SsrTestFloor", {
      color: 0x9aa0a8, roughness: 0.10, metalness: 0.9,
    });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0.02;
    floor.receiveShadow = true;
    P.scene.add(floor);

    const cubeMaterial = P.library.Plain("SsrTestCube", {
      color: 0x050505, roughness: 0.85, metalness: 0,
      emissive: 0xff0000, emissiveIntensity: 10,
    });
    const cube = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.4, 1.4), cubeMaterial);
    cube.position.set(0, 1.15, 0);
    P.scene.add(cube);

    // 机位：正对立方体，俯视地板 —— 立方体在画面上半，它的倒影在下半
    P.camera.position.set(0, 1.9, 5.2);
    P.camera.lookAt(0, 0.35, 0);
    P.state.elapsed = 0;
    post.frame = 0;
    post.hasTaaHistory = false;
    post.hasPrev = false;
    post.ssrPass.hasHistory = false;
    // 32 帧：TAA 的 Halton 周期是 8，SSR 时域权重 0.08（半衰约 9 帧），
    // 32 帧足够两者都收敛到「静止画面逐帧不动」。
    P.StepFrames(40, 1 / 60);
    const withCube = ReadSsr();
    out.hasTarget = !!withCube;
    if (!withCube) return out;
    out.size = [withCube.width, withCube.height];
    // 倒影落在画面下半（地板），横向取中间三分之一
    out.reflection = Stats(withCube, 0.33, 0.05, 0.67, 0.42);
    // 屏幕边缘：最左 2% 一列
    out.edge = Stats(withCube, 0.0, 0.0, 0.02, 1.0);

    // --- 2) 静止逐帧差 ----------------------------------------------------
    // **dt = 0 推帧**：天空动画、火光包络、粒子都不前进，只有帧序号（也就是
    // 随机序列与 TAA 抖动相位）在走。这样量到的才是 SSR 自己的时域残差，
    // 而不是「场景本来就在动」。dt=1/60 的话探针页的天空每帧都在变，测的是它。
    P.StepFrames(8, 0);
    const stillA = ReadSsr();
    P.StepFrames(1, 0);
    const stillB = ReadSsr();
    out.still = StabilityRatio(stillA, stillB);

    // --- 3) 立方体移出屏幕上方 → 置信度归零、红色散掉 ----------------------
    cube.position.set(0, 220, 0);
    P.StepFrames(12, 1 / 60);
    const noCube = ReadSsr();
    out.reflectionGone = Stats(noCube, 0.33, 0.05, 0.67, 0.42);

    // --- 4) 相机平移之后不留拖影 ------------------------------------------
    cube.position.set(0, 1.15, 0);
    P.StepFrames(24, 1 / 60);
    const beforePan = Stats(ReadSsr(), 0.33, 0.05, 0.67, 0.42);
    for (let i = 0; i < 10; i += 1) {
      P.camera.position.x += 0.22;                  // 每帧 22 cm，约 13 m/s
      P.camera.lookAt(P.camera.position.x, 0.35, 0);
      P.StepFrames(1, 1 / 60);
    }
    const panned = ReadSsr();
    // 相机整体右移、看向新中心：倒影仍在画面中央那一带，不该在原来的位置
    // 留一条红带。取画面**最右** 12%（平移过来的「新地」）作为拖影探针 ——
    // 那里从来没有过倒影，历史要是拖着走就会在这里显出来。
    out.panTrail = Stats(panned, 0.86, 0.05, 1.0, 0.42);
    out.panCenter = Stats(panned, 0.33, 0.05, 0.67, 0.42);
    out.beforePan = beforePan;

    // --- 5) 粗糙度超上限 → 整张靶置信度 ≈ 0 -------------------------------
    P.camera.position.set(0, 1.9, 5.2);
    P.camera.lookAt(0, 0.35, 0);
    P.StepFrames(16, 1 / 60);
    floor.material = P.library.Plain("SsrTestRoughFloor", {
      color: 0x9aa0a8, roughness: 0.95, metalness: 0.9,
    });
    // 粗糙度是从**上一帧**主靶 alpha 读的，所以换完材质要多滚几帧
    P.StepFrames(16, 1 / 60);
    const rough = ReadSsr();
    out.rough = Stats(rough, 0.33, 0.05, 0.67, 0.42);

    // --- 6) 稳态不再编译新程序 + 无 GL 错误 -------------------------------
    floor.material = floorMaterial;
    P.StepFrames(20, 1 / 60);
    const programsBefore = renderer.info.programs.length;
    P.StepFrames(60, 1 / 60);
    out.programs = { before: programsBefore, after: renderer.info.programs.length };

    // --- 7) 调试三视图都要真的出画（GLSL 保留字编译失败是静默的）----------
    const viewWas = post.GetDebugView();
    out.debugViews = {};
    for (const view of ["ssr", "ssrConfidence", "ssrHitDistance"]) {
      post.SetDebugView(view);
      P.StepFrames(2, 1 / 60);
      const w = gl.drawingBufferWidth;
      const h = gl.drawingBufferHeight;
      const pixels = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      let distinct = new Set();
      let nonBlack = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        const key = (pixels[i] << 16) | (pixels[i + 1] << 8) | pixels[i + 2];
        if (distinct.size < 64) distinct.add(key);
        if (pixels[i] + pixels[i + 1] + pixels[i + 2] > 12) nonBlack += 1;
      }
      out.debugViews[view] = { distinct: distinct.size, nonBlackRatio: nonBlack / (w * h) };
    }
    post.SetDebugView(viewWas);
    P.StepFrames(2, 1 / 60);

    // --- 8) 关掉之后：材质强度归零，自己追踪的消费方（水面）也断供 --------
    // 水面读的不是 targets.ssr 而是那一包追踪 uniform；SSR 这一趟不跑的话
    // Hi-Z 与场景色都停在上一次的内容上，水里会留一片几十帧前的倒影。
    post.SetSsrEnabled(false);
    P.StepFrames(3, 1 / 60);
    out.disabled = {
      strength: post.SsrUniforms.strength.value,
      hasColor: post.ssrPass.trace.uSsrHasColor.value,
    };
    post.SetSsrEnabled(true);
    P.StepFrames(6, 1 / 60);
    out.reenabled = {
      strength: post.SsrUniforms.strength.value,
      hasColor: post.ssrPass.trace.uSsrHasColor.value,
    };

    out.glError = gl.getError();
    P.scene.remove(floor);
    P.scene.remove(cube);
    return out;
  });
} catch (error) {
  problems.push(`THROW ${String(error).slice(0, 400)}`);
}

// --- 分档变体也要真的编得过 --------------------------------------------------
// 步数与解算抽样数是**编译期常量**（GLSL 的循环上限、TAP_OFFSETS 的数组长度），
// 所以 medium(32 步 / 0 抽样) 与 ultra(64 步 / 8 抽样) 是**另外两份着色器**。
// GLSL 编译失败 three 只在控制台留一行、那一趟什么都不画 —— 只测 high 等于
// 三份里只验了一份。这里各开一次探针页，读回 SSR 靶确认真的出了东西。
const variants = {};
for (const quality of ["medium", "ultra"]) {
  try {
    await page.goto(
      `http://127.0.0.1:${port}/Taierzhuang1938/Probe.html?quality=${quality}&preset=smokyDay&scene=materials&gi=0`,
      { waitUntil: "load", timeout: 180000 },
    );
    await page.waitForFunction(() => window.Probe?.state?.ready, null, { timeout: 240000 });
    variants[quality] = await page.evaluate(async () => {
      const P = window.Probe;
      const THREE = P.THREE;
      const post = P.post;
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40),
        P.library.Plain("SsrVariantFloor", { color: 0x9aa0a8, roughness: 0.10, metalness: 0.9 }));
      floor.rotation.x = -Math.PI / 2;
      floor.position.y = 0.02;
      P.scene.add(floor);
      const cube = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.4, 1.4),
        P.library.Plain("SsrVariantCube", {
          color: 0x050505, roughness: 0.85, metalness: 0,
          emissive: 0xff0000, emissiveIntensity: 10,
        }));
      cube.position.set(0, 1.15, 0);
      P.scene.add(cube);
      P.camera.position.set(0, 1.9, 5.2);
      P.camera.lookAt(0, 0.35, 0);
      P.StepFrames(40, 1 / 60);
      const rt = post.targets.ssr;
      if (!rt) return { available: post.ssrPass.available, hasTarget: false };
      const buffer = new Uint16Array(rt.width * rt.height * 4);
      P.renderer.readRenderTargetPixels(rt, 0, 0, rt.width, rt.height, buffer);
      const HalfToFloat = (bits) => {
        const sign = (bits >> 15) & 1 ? -1 : 1;
        const exponent = (bits >> 10) & 0x1f;
        const mantissa = bits & 0x3ff;
        if (exponent === 0) return sign * Math.pow(2, -14) * (mantissa / 1024);
        if (exponent === 31) return mantissa ? NaN : sign * Infinity;
        return sign * Math.pow(2, exponent - 15) * (1 + mantissa / 1024);
      };
      let confMax = 0;
      let redMax = 0;
      let nan = 0;
      for (let i = 0; i < buffer.length; i += 4) {
        const r = HalfToFloat(buffer[i]);
        const a = HalfToFloat(buffer[i + 3]);
        if (!Number.isFinite(r) || !Number.isFinite(a)) { nan += 1; continue; }
        confMax = Math.max(confMax, a);
        redMax = Math.max(redMax, r);
      }
      return {
        available: post.ssrPass.available, hasTarget: true,
        size: [rt.width, rt.height],
        steps: post.preset.ssrSteps, taps: post.preset.ssrResolveTaps, scale: post.preset.ssrScale,
        confMax, redMax, nan, glError: P.renderer.getContext().getError(),
      };
    });
  } catch (error) {
    problems.push(`VARIANT ${quality} ${String(error).slice(0, 200)}`);
  }
}

await browser.close();
server.close();

const checks = [];
function Check(name, ok, detail = "") {
  checks.push({ name, ok: !!ok, detail });
}

if (!result) {
  Check("页面取证成功", false, problems.join(" | "));
} else {
  Check("帧图里有 ssr（main 之前）与 ssrColor（TAA 之后）两趟",
    result.passOrder.indexOf("ssr") >= 0
    && result.passOrder.indexOf("ssr") < result.passOrder.indexOf("main")
    && result.passOrder.indexOf("ssrColor") > result.passOrder.indexOf("taa"),
    JSON.stringify(result.passOrder));
  Check("high 档 SSR 可用（半分辨率 48 步 4 抽样解算）",
    result.available && result.preset.ssr && result.preset.scale === 0.5
    && result.preset.steps === 48 && result.preset.taps === 4,
    JSON.stringify(result.preset));
  Check("不透明材质带 ssr1 补丁、半透明材质不带",
    result.patchKey.includes("ssr1") && !result.transparentPatchKey.includes("ssr1"),
    `opaque=${result.patchKey} transparent=${result.transparentPatchKey}`);
  Check("SSR 靶建起来了", result.hasTarget, JSON.stringify(result.size));
  Check("光滑地板映出强色立方体（红色主导 + 置信度 > 0.5）",
    result.reflection && result.reflection.redDominant > 40 && result.reflection.confMax > 0.5,
    JSON.stringify(result.reflection));
  Check("屏幕边缘一列置信度为 0",
    result.edge && result.edge.confMax < 0.02, JSON.stringify(result.edge));
  // 残差不是 0，也不该是 0：随机 GGX 每帧换一条射线，时域当前帧权重 0.08。
  // 剩下的这几个百分点集中在「倒影里那只立方体的轮廓线上」—— 半分辨率追踪
  // 的命中点在亚像素上抖，轮廓像素就在 0 与满亮度之间跳。置信度是纯几何量，
  // 它的逐帧变化必须比辐亮度小一个量级，所以两条一起断言。
  Check("静止 40 帧后逐帧差小于信号的 8%（时域已收敛）",
    result.still.diff / Math.max(result.still.magnitude, 1e-3) < 0.08,
    JSON.stringify({ ...result.still, ratio: result.still.diff / Math.max(result.still.magnitude, 1e-3) }));
  Check("静止时置信度逐帧几乎不动（< 0.03）",
    result.still.confDiff < 0.03, `confDiff=${result.still.confDiff}`);
  Check("立方体移出屏幕上方后倒影置信度归零、红色散掉",
    result.reflectionGone && result.reflectionGone.redDominant === 0
    && result.reflectionGone.redMean < Math.max(0.02, result.reflection.redMean * 0.12),
    JSON.stringify(result.reflectionGone));
  Check("相机平移后新进画面的区域没有拖影",
    result.panTrail && result.panTrail.redDominant === 0
    && result.panTrail.redMean < Math.max(0.02, result.beforePan.redMean * 0.25),
    JSON.stringify({ trail: result.panTrail, before: result.beforePan, center: result.panCenter }));
  Check("粗糙度 0.95 的地板不出 SSR（回退天空 PMREM）",
    result.rough && result.rough.confMax < 0.02, JSON.stringify(result.rough));
  Check("SSR 靶无 NaN",
    result.reflection.nan === 0 && result.edge.nan === 0 && result.rough.nan === 0,
    JSON.stringify({ a: result.reflection.nan, b: result.edge.nan, c: result.rough.nan }));
  Check("60 帧内不再编译新程序",
    result.programs.after === result.programs.before, JSON.stringify(result.programs));
  for (const view of ["ssr", "ssrConfidence", "ssrHitDistance"]) {
    const shot = result.debugViews?.[view];
    Check(`Debug Rendering「${view}」真的出画`,
      shot && shot.distinct > 3 && shot.nonBlackRatio > 0.05, JSON.stringify(shot));
  }
  Check("关掉 SSR：材质强度归零、水面那条追踪也断供",
    result.disabled && result.disabled.strength === 0 && result.disabled.hasColor === 0,
    JSON.stringify(result.disabled));
  Check("重新打开 SSR：两者都回来",
    result.reenabled && result.reenabled.strength > 0 && result.reenabled.hasColor === 1,
    JSON.stringify(result.reenabled));
  Check("无 GL 错误", result.glError === 0, `glError=${result.glError}`);
  for (const quality of ["medium", "ultra"]) {
    const v = variants[quality];
    Check(`${quality} 档的着色器变体真的出画（步数/抽样数是编译期常量）`,
      v && v.hasTarget && v.confMax > 0.5 && v.redMax > 0.5 && v.nan === 0 && v.glError === 0,
      JSON.stringify(v));
  }
  Check("页面无控制台报错", problems.length === 0, problems.slice(0, 4).join(" | "));
}

for (const check of checks) {
  console.log(`${check.ok ? "ok  " : "FAIL"} ${check.name}${check.ok ? "" : `  ${check.detail}`}`);
}
const failed = checks.filter((check) => !check.ok);
console.log(failed.length ? `\n${failed.length} 条失败` : "\nSSR 契约全绿");
if (failed.length) process.exit(1);
