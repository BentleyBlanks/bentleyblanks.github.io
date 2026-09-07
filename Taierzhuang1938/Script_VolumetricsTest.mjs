// ===========================================================================
// Script_VolumetricsTest.mjs —— froxel 体积雾 / 体积光的看门狗（真浏览器，render 域）
//
// 分两截：
//   A. **纯 Node 的能见度对账**（不开浏览器，秒级）
//      逐时段预设把「今天的解析雾」与「froxel 介质」在 70 m 处的透过率各算一遍，
//      断言后者不低于前者。这是历史定论「先别动雾」的成文化：
//      七十米外能不能看见敌人由雾决定，体积雾只许让它变好。
//   B. **真浏览器取证**（Probe 页，四个时段各开一次）
//      每一条都读回像素或读回真实缓冲，不看 uniform、不看 visible 标记：
//        1. 图集非空、无 NaN、透过率沿深度单调递减、累积散射单调递增
//        2. legacyTransmittance：apply 输出的透过率与解析雾**逐像素相同**
//           （这就是「70 m 不变差」的经验版，而且覆盖画面里的每一个距离）
//        3. 太阳阴影真的在切光柱：castShadow 开/关 A/B，被挡住的 froxel 散射显著更低
//        4. 静止 32 帧后逐帧差极小（时域重投影收敛）
//        5. 相机平移后无拖影块（与「清历史重算」的参考帧比）
//        6. apply 输出 a∈[0,1]、rgb 非负；天空像素 = 最远切片
//        7. 局部点光（night）与火源热烟 / AddFogVolume（burningStreet）真的进了雾
//        8. 四个调试视图都出画（GLSL 保留字踩雷时它们会整片纯黑，读回像素才验得到）
//        9. 关掉当帧退回解析雾、稳态不再编译新程序、无 GL 错误
//
// 用法：node Taierzhuang1938/Script_VolumetricsTest.mjs
// 退出码即成败。
// ===========================================================================

import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";
import { SKY_PRESETS } from "./Script_Sky.mjs";
import {
  VOLUMETRIC_GRIDS, MakeVolumetricParams, AnalyticTransmittance, FroxelTransmittance,
  HenyeyGreenstein, VISIBILITY_REFERENCE,
} from "./Data_Tuning_Volumetrics.mjs";

const checks = [];
function Check(name, ok, detail = "") {
  checks.push({ name, ok: !!ok, detail });
}

// ---------------------------------------------------------------------------
// A. 纯 Node：能见度对账 + 数据表自洽
// ---------------------------------------------------------------------------
{
  const rows = [];
  let violations = 0;
  let compared = 0;
  for (const [name, preset] of Object.entries(SKY_PRESETS)) {
    if (!preset.fog) continue;
    const params = MakeVolumetricParams(name, preset.fog);
    for (const height of VISIBILITY_REFERENCE.heights) {
      const analytic = AnalyticTransmittance(params, VISIBILITY_REFERENCE.distance, height);
      const froxel = FroxelTransmittance(params, VISIBILITY_REFERENCE.distance, height);
      compared += 1;
      if (froxel < analytic - 1e-9) {
        violations += 1;
        rows.push(`${name}@${height}m 解析 ${analytic.toFixed(4)} > froxel ${froxel.toFixed(4)}`);
      }
    }
  }
  Check(`每个预设在 ${VISIBILITY_REFERENCE.distance} m 处的透过率不低于解析雾（${compared} 组）`,
    violations === 0 && compared >= 24, rows.slice(0, 6).join(" | "));

  const gridBad = Object.entries(VOLUMETRIC_GRIDS)
    .filter(([, grid]) => grid && grid.tiles[0] * grid.tiles[1] < grid.z)
    .map(([key, grid]) => `${key}: ${grid.tiles[0]}×${grid.tiles[1]} < ${grid.z}`);
  Check("froxel 图集的 tile 数装得下所有切片", gridBad.length === 0, gridBad.join(" | "));

  // 相函数归一化：uPhase.y = (1-g)²/(1+g) 之后峰值必须精确为 1，
  // 否则「正对太阳时与今天的 sunGain 峰值相同」这条校准就不成立。
  const peakBad = [0, 0.1, 0.3, 0.45, 0.58, 0.8].filter((g) => {
    const peak = HenyeyGreenstein(1, g) * ((1 - g) * (1 - g)) / (1 + g);
    return Math.abs(peak - 1) > 1e-6;
  });
  Check("HG 相函数按峰值归一（uPhase.y 的口径）", peakBad.length === 0, `g=${peakBad.join(",")}`);
}

// ---------------------------------------------------------------------------
// B. 真浏览器
// ---------------------------------------------------------------------------
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

/**
 * 页面里跑的公共前奏：钉死时序 + 半浮点读回。跨进程可复现全靠它
 * （`Script_ShotTest` 那条路有 waitForTimeout 里的自由 rAF，判不了数值）。
 */
const PRELUDE = `
  const P = window.Probe;
  const post = P.post;
  const vp = post.volumetricsPass;
  const gl = P.renderer.getContext();
  const tuning = await import("./Data_Tuning_Volumetrics.mjs");
  const skyModule = await import("./Script_Sky.mjs");
  P.state.elapsed = 0; post.frame = 0; post.hasTaaHistory = false; post.hasPrev = false;
  vp.hasHistory = false;
  const HalfToFloat = (bits) => {
    const sign = (bits >> 15) & 1 ? -1 : 1;
    const exponent = (bits >> 10) & 0x1f;
    const mantissa = bits & 0x3ff;
    if (exponent === 0) return sign * Math.pow(2, -14) * (mantissa / 1024);
    if (exponent === 31) return mantissa ? NaN : sign * Infinity;
    return sign * Math.pow(2, exponent - 15) * (1 + mantissa / 1024);
  };
  const ReadRt = (rt) => {
    const buffer = new Uint16Array(rt.width * rt.height * 4);
    P.renderer.readRenderTargetPixels(rt, 0, 0, rt.width, rt.height, buffer);
    const out = new Float32Array(rt.width * rt.height * 4);
    for (let i = 0; i < out.length; i += 1) out[i] = HalfToFloat(buffer[i]);
    return out;
  };
  const ReadScreen = () => {
    const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    const pixels = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    return { w, h, pixels };
  };
  /**
   * 单帧注入（丢掉历史）。**A/B 对照必须钉死帧序**：froxel 的 xy/z 抖动与噪声漂移
   * 都由 post.frame 驱动，不钉的话两次注入是两批不同的抽样，量到的差别里
   * 九成是抖动噪声而不是被测的那一项（第一版就栽在这儿：关掉阴影反而有 10%
   * 的 froxel 变亮了）。
   */
  const InjectAt = (frame) => {
    vp.hasHistory = false;
    post.frame = frame;
    P.StepFrames(1, 1 / 60);
    return ReadRt(vp.currentVolume);
  };
  const InjectOnce = () => InjectAt(post.frame);
`;

async function OpenProbe(preset) {
  problems.length = 0;
  await page.goto(
    `http://127.0.0.1:${port}/Taierzhuang1938/Probe.html?quality=high&preset=${preset}&scene=street&gi=0`,
    { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => window.Probe?.state?.ready, null, { timeout: 240000 });
}

async function Run(body) {
  return page.evaluate(`(async () => {\n${PRELUDE}\n${body}\n})()`);
}

// --- B1: smokyDay —— 结构、单调、校准、稳定、天空、调试视图 -------------------
let smoky = null;
try {
  await OpenProbe("smokyDay");
  smoky = await Run(`
    const out = {};
    // 风速归零：这一节要量「时域重投影收不收敛」，不是量烟走得快不快。
    const windWas = tuning.VOLUMETRIC_PRESETS.smokyDay.noiseWind;
    tuning.VOLUMETRIC_PRESETS.smokyDay.noiseWind = [0, 0, 0];
    P.StepFrames(48, 1 / 60);

    const grid = vp.grid;
    const atlas = vp.atlasSize;
    out.grid = grid;
    out.atlas = atlas;
    out.fogSource = post.uniformsComposite.uFogSource.value;
    out.shadowEnabled = vp.uniformsInject.uSunShadowEnabled.value;
    out.historyWeight = vp.uniformsInject.uHistoryWeight.value;

    // --- 1) 图集非空 / 无 NaN / 沿深度单调 --------------------------------
    const inject = ReadRt(vp.currentVolume);
    const integrated = ReadRt(vp.integrated);
    let nan = 0, injectNonZero = 0, sigmaMax = 0;
    for (let i = 0; i < inject.length; i += 4) {
      if (!Number.isFinite(inject[i] + inject[i + 1] + inject[i + 2] + inject[i + 3])) nan += 1;
      if (inject[i] + inject[i + 1] + inject[i + 2] > 1e-6) injectNonZero += 1;
      if (inject[i + 3] > sigmaMax) sigmaMax = inject[i + 3];
    }
    out.inject = { nan, nonZeroFrac: injectNonZero / (inject.length / 4), sigmaMax };

    const Cell = (buffer, cx, cy, k) => {
      const tx = k % grid.tiles[0];
      const ty = Math.floor(k / grid.tiles[0]);
      const i = ((ty * grid.y + cy) * atlas[0] + (tx * grid.x + cx)) * 4;
      return [buffer[i], buffer[i + 1], buffer[i + 2], buffer[i + 3]];
    };
    let monotoneBad = 0, integratedNan = 0, columns = 0, scatterBad = 0;
    for (let cy = 4; cy < grid.y; cy += 11) {
      for (let cx = 4; cx < grid.x; cx += 13) {
        columns += 1;
        let prevT = 1.0001, prevScatter = -1e-6;
        for (let k = 0; k < grid.z; k += 1) {
          const c = Cell(integrated, cx, cy, k);
          if (!Number.isFinite(c[0] + c[1] + c[2] + c[3])) integratedNan += 1;
          if (c[3] > prevT + 1e-4) monotoneBad += 1;
          if (c[0] + c[1] + c[2] < prevScatter - 1e-4) scatterBad += 1;
          prevT = c[3];
          prevScatter = c[0] + c[1] + c[2];
        }
      }
    }
    out.integrated = { nan: integratedNan, columns, monotoneBad, scatterBad };

    // --- 2) legacyTransmittance：apply 的透过率与解析雾逐像素相同 ----------
    const applyBuf = ReadRt(vp.fogScatter);
    const normalDepth = ReadRt(post.targets.normalDepth);
    const w = vp.fogScatter.width, h = vp.fogScatter.height;
    const fog = skyModule.SKY_PRESETS.smokyDay.fog;
    const invView = P.camera.matrixWorld.elements;
    const psY = 1 / Math.tan(P.camera.fov * 0.5 * Math.PI / 180);
    const psX = psY / P.camera.aspect;
    let worst = 0, worstAt = null, checked = 0, foggier = 0;
    let alphaBad = 0, negativeRgb = 0, sumAbs = 0;
    for (let y = 2; y < h; y += 3) {
      for (let x = 2; x < w; x += 3) {
        const i = (y * w + x) * 4;
        const alpha = applyBuf[i + 3];
        if (!(alpha >= -1e-4 && alpha <= 1.0001)) alphaBad += 1;
        if (applyBuf[i] < -1e-4 || applyBuf[i + 1] < -1e-4 || applyBuf[i + 2] < -1e-4) negativeRgb += 1;
        const depth = normalDepth[i + 3];
        if (depth <= 0.05) continue;
        const vx = ((x + 0.5) / w * 2 - 1) / psX * depth;
        const vy = ((y + 0.5) / h * 2 - 1) / psY * depth;
        const vz = -depth;
        const worldY = invView[1] * vx + invView[5] * vy + invView[9] * vz + invView[13];
        const hFall = Math.exp(-Math.max(worldY - (fog.base || 0), 0) / Math.max(fog.falloff, 0.5));
        const analytic = 1 - Math.min((1 - Math.exp(-depth * fog.density)) * hFall, fog.max);
        const delta = alpha - analytic;
        checked += 1;
        sumAbs += Math.abs(delta);
        if (delta < -0.02) foggier += 1;
        if (Math.abs(delta) > Math.abs(worst)) { worst = delta; worstAt = [x, y, depth, worldY]; }
      }
    }
    out.calibration = { checked, worst, worstAt, meanAbs: sumAbs / Math.max(checked, 1),
      foggier, alphaBad, negativeRgb };

    // --- 3) 深度 0 的像素 -------------------------------------------------
    // 出厂 skyScale = 0：这一桶（天空 / 粒子 / 水面等 skipNormalDepth 的东西）
    // 与今天逐比特相同 —— 一点雾都不吃。理由见 Data_Tuning_Volumetrics 的 skyScale。
    // 但「取最远切片」那条路本身是实装的，所以把 skyScale 顶到 1 再验一遍：
    // 只关掉出厂开关不等于那段代码是对的。
    const SkyStats = () => {
      const buf = ReadRt(vp.fogScatter);
      let checked = 0, worst = 0;
      for (let y = 2; y < h; y += 5) {
        for (let x = 4; x < w; x += 17) {
          const i = (y * w + x) * 4;
          if (normalDepth[i + 3] > 0.0) continue;
          const cx = Math.min(grid.x - 1, Math.floor((x + 0.5) / w * grid.x));
          const cy = Math.min(grid.y - 1, Math.floor((y + 0.5) / h * grid.y));
          const far = Cell(ReadRt(vp.integrated), cx, cy, grid.z - 1);
          checked += 1;
          worst = Math.max(worst, Math.abs(buf[i + 3] - far[3]));
        }
      }
      return { checked, worst };
    };
    let skyShipped = 0, skyShippedChecked = 0;
    for (let y = 2; y < h; y += 5) {
      for (let x = 4; x < w; x += 17) {
        const i = (y * w + x) * 4;
        if (normalDepth[i + 3] > 0.0) continue;
        skyShippedChecked += 1;
        skyShipped = Math.max(skyShipped, Math.abs(applyBuf[i + 3] - 1));
      }
    }
    const skyScaleWas = tuning.VOLUMETRIC_PRESETS.smokyDay.skyScale;
    tuning.VOLUMETRIC_PRESETS.smokyDay.skyScale = 1;
    P.StepFrames(4, 1 / 60);
    const skyFull = SkyStats();
    tuning.VOLUMETRIC_PRESETS.smokyDay.skyScale = skyScaleWas;
    P.StepFrames(4, 1 / 60);
    out.sky = {
      shippedChecked: skyShippedChecked, shippedWorstDelta: skyShipped,
      fullChecked: skyFull.checked, fullWorst: skyFull.worst,
    };

    // --- 4) 静止 32 帧后逐帧差 -------------------------------------------
    P.StepFrames(32, 1 / 60);
    const before = ReadRt(vp.fogScatter);
    P.StepFrames(1, 1 / 60);
    const after = ReadRt(vp.fogScatter);
    let diff = 0, magnitude = 0, maxDiff = 0;
    for (let i = 0; i < before.length; i += 1) {
      const d = Math.abs(after[i] - before[i]);
      diff += d;
      magnitude += Math.abs(before[i]);
      if (d > maxDiff) maxDiff = d;
    }
    out.stability = { relative: diff / Math.max(magnitude, 1e-6), maxDiff };

    // --- 5) 相机平移之后没有拖影块 ---------------------------------------
    const camX = P.camera.position.x;
    P.camera.position.x = camX + 2.4;
    P.StepFrames(8, 1 / 60);
    const ghosted = ReadRt(vp.fogScatter);
    vp.hasHistory = false;                       // 清历史 = 没有重投影的参考帧
    P.StepFrames(16, 1 / 60);
    const reference = ReadRt(vp.fogScatter);
    let ghostDiff = 0, ghostMag = 0;
    for (let i = 0; i < ghosted.length; i += 1) {
      ghostDiff += Math.abs(ghosted[i] - reference[i]);
      ghostMag += Math.abs(reference[i]);
    }
    out.ghost = { relative: ghostDiff / Math.max(ghostMag, 1e-6) };
    P.camera.position.x = camX;
    P.StepFrames(20, 1 / 60);

    // --- 6) 四个调试视图都出画 -------------------------------------------
    const views = {};
    const viewWas = post.GetDebugView();
    const viewIds = ["volumetricDensity", "volumetricScatter",
      "volumetricTransmittance", "volumetricReproject"];
    for (const view of viewIds) {
      post.SetDebugView(view);
      P.StepFrames(2, 1 / 60);
      const shot = ReadScreen();
      let sum = 0;
      const distinct = new Set();
      for (let i = 0; i < shot.pixels.length; i += 4) {
        sum += shot.pixels[i] + shot.pixels[i + 1] + shot.pixels[i + 2];
        if (distinct.size < 64) {
          distinct.add(shot.pixels[i] * 65536 + shot.pixels[i + 1] * 256 + shot.pixels[i + 2]);
        }
      }
      views[view] = { mean: sum / (shot.pixels.length / 4 * 3), distinct: distinct.size };
    }
    post.SetDebugView(viewWas);
    P.StepFrames(2, 1 / 60);
    out.views = views;

    // --- 7) 开关消融：关掉体积雾，Composite 当帧退回解析雾 ------------------
    post.preset.volumetrics = false;
    P.StepFrames(2, 1 / 60);
    out.offFogSource = post.uniformsComposite.uFogSource.value;
    post.preset.volumetrics = true;
    P.StepFrames(6, 1 / 60);
    out.onFogSource = post.uniformsComposite.uFogSource.value;

    // --- 8) 稳态不再编译新程序 -------------------------------------------
    P.StepFrames(10, 1 / 60);
    const programsBefore = P.renderer.info.programs.length;
    P.StepFrames(60, 1 / 60);
    out.programs = { before: programsBefore, after: P.renderer.info.programs.length };
    out.glError = gl.getError();

    tuning.VOLUMETRIC_PRESETS.smokyDay.noiseWind = windWas;
    return out;
  `);
} catch (error) {
  problems.push(`THROW smokyDay ${String(error).slice(0, 400)}`);
}

if (!smoky) {
  Check("smokyDay 取证成功", false, problems.slice(0, 3).join(" | "));
} else {
  Check("froxel 网格按 high 档建起来了（图集非空、σ_t 有量、无 NaN）",
    !!smoky.grid && smoky.atlas[0] > 0 && smoky.inject.nan === 0
    && smoky.inject.nonZeroFrac > 0.5 && smoky.inject.sigmaMax > 1e-4,
    JSON.stringify({ grid: smoky.grid, atlas: smoky.atlas, inject: smoky.inject }));
  Check("积分图集无 NaN、透过率沿深度单调递减、累积散射单调递增",
    smoky.integrated.nan === 0 && smoky.integrated.columns > 20
    && smoky.integrated.monotoneBad === 0 && smoky.integrated.scatterBad === 0,
    JSON.stringify(smoky.integrated));
  Check("Composite 真的接上了体积雾（uFogSource = 1）",
    smoky.fogSource === 1, `uFogSource=${smoky.fogSource}`);
  Check("太阳阴影公共接口在工作（uSunShadowEnabled = 1）",
    smoky.shadowEnabled === 1, `enabled=${smoky.shadowEnabled}`);
  Check("apply 输出 a∈[0,1]、rgb 非负",
    smoky.calibration.alphaBad === 0 && smoky.calibration.negativeRgb === 0,
    JSON.stringify({ alphaBad: smoky.calibration.alphaBad,
      negativeRgb: smoky.calibration.negativeRgb }));
  // 这一条是「70 m 不变差」的经验版，而且覆盖画面里的每一个距离：
  // legacyTransmittance 下体积雾的透过率与解析雾同式，只许被局部雾体压低。
  Check("legacyTransmittance：逐像素透过率不低于解析雾（且量级相同）",
    smoky.calibration.checked > 5000 && smoky.calibration.foggier === 0
    && smoky.calibration.meanAbs < 0.01,
    JSON.stringify(smoky.calibration));
  // 出厂：深度 0 那一桶（天空 / 粒子 / 水面）一点雾都不吃 —— 与今天逐比特相同。
  // 这一条同时看住「体积雾没有偷偷去动粒子和水面」。
  Check("出厂 skyScale = 0：深度 0 的像素透过率恒为 1（与今天相同）",
    smoky.sky.shippedChecked > 20 && smoky.sky.shippedWorstDelta < 0.005,
    JSON.stringify(smoky.sky));
  // 把 skyScale 顶到 1 再验「取最远切片」那条路本身是对的（只关掉开关不算验过）。
  Check("skyScale = 1 时天空像素的雾量 = 最远切片",
    smoky.sky.fullChecked > 20 && smoky.sky.fullWorst < 0.02, JSON.stringify(smoky.sky));
  Check("静止 32 帧后逐帧差极小（时域重投影收敛）",
    smoky.stability.relative < 0.02, JSON.stringify(smoky.stability));
  Check("相机平移 2.4 m 后没有拖影块（与清历史的参考帧比）",
    smoky.ghost.relative < 0.15, JSON.stringify(smoky.ghost));
  const viewBad = Object.entries(smoky.views || {})
    .filter(([, view]) => !(view.mean > 3 && view.distinct > 8))
    .map(([key, view]) => `${key}:${JSON.stringify(view)}`);
  Check("四个体积雾调试视图都出画（不是纯黑 / 不是单色）",
    viewBad.length === 0, viewBad.join(" | "));
  Check("关掉体积雾当帧退回解析雾，再打开又接回来",
    smoky.offFogSource === 0 && smoky.onFogSource === 1,
    `off=${smoky.offFogSource} on=${smoky.onFogSource}`);
  Check("60 帧内不再编译新程序",
    smoky.programs.after === smoky.programs.before, JSON.stringify(smoky.programs));
  Check("无 GL 错误", smoky.glError === 0, `glError=${smoky.glError}`);
  Check("smokyDay 页面无控制台报错", problems.length === 0, problems.slice(0, 3).join(" | "));
}

// --- B2: dawn —— 太阳阴影真的在切光柱（castShadow 开/关 A/B） ---------------
let dawn = null;
try {
  await OpenProbe("dawn");
  dawn = await Run(`
    // 站进街巷深处（z = −20 两侧都是房子），镜头顺街往南、略偏向太阳那一侧。
    // 两件事都要：**有遮挡物**（Probe 的房子只铺在 z ∈ [−6, −66]，站在 z = 6
    // 朝东看是一片空地，一颗 froxel 都挡不住 —— 第一版就是这么量出 0.03% 的），
    // 以及**一点逆光分量**（HG 前向散射峰在 cosTheta = 1，正侧向时太阳项只占两成）。
    P.camera.position.set(0.4, 1.68, -20);
    P.camera.lookAt(6, 3.2, -48);
    P.StepFrames(30, 1 / 60);
    const withShadow = InjectAt(4000);
    // A/B 只翻 uSunShadowEnabled，**不动 castShadow**：后者会让 SyncShadowUniforms
    // 把 uSunShadowMap 置 null，而 null 的 sampler2DShadow 在 ANGLE-D3D11 上
    // 是 1282 INVALID_OPERATION，整趟 draw 被丢掉 —— 量到的就不是「没有阴影」
    // 而是「什么都没画」。注销登记之后 Sync 就不会再改我这一份。
    P.lights.UnregisterShadowUniforms(vp.uniformsInject);
    vp.uniformsInject.uSunShadowEnabled.value = 0;
    const withoutShadow = InjectAt(4000);          // 同一帧序 = 同一批抽样
    const fallbackUsed = vp.uniformsInject.uSunShadowMap.value === (vp.shadowFallback?.depthTexture);
    P.lights.RegisterShadowUniforms(vp.uniformsInject);
    P.lights.SyncShadowUniforms();
    P.StepFrames(4, 1 / 60);

    let sumOn = 0, sumOff = 0, counted = 0, shadowed = 0, brighter = 0;
    let minRatio = 9;
    for (let i = 0; i < withShadow.length; i += 4) {
      const on = withShadow[i] + withShadow[i + 1] + withShadow[i + 2];
      const off = withoutShadow[i] + withoutShadow[i + 1] + withoutShadow[i + 2];
      if (off <= 1e-6) continue;
      counted += 1;
      sumOn += on; sumOff += off;
      const ratio = on / off;
      // 帧序钉死之后两次抽样完全相同，阴影只能拿走光 —— 1.002 是半浮点量化的余量
      if (ratio > 1.002) brighter += 1;
      if (ratio < 0.9) shadowed += 1;
      if (ratio < minRatio) minRatio = ratio;
    }

    // 阴影图整个不可用（开机头几帧 / 画质面板关掉阴影）时仍要出雾：
    // uSunShadowMap 为 null 会被驱动丢掉整趟 draw，兜底靶就是为这条留的。
    P.lights.UnregisterShadowUniforms(vp.uniformsInject);
    vp.uniformsInject.uSunShadowMap.value = null;
    vp.uniformsInject.uSunShadowEnabled.value = 0;
    const noMap = InjectAt(4100);
    let noMapMax = 0;
    for (let i = 0; i < noMap.length; i += 4) {
      const s = noMap[i] + noMap[i + 1] + noMap[i + 2];
      if (s > noMapMax) noMapMax = s;
    }
    const noMapError = gl.getError();
    P.lights.RegisterShadowUniforms(vp.uniformsInject);
    P.lights.SyncShadowUniforms();
    P.StepFrames(4, 1 / 60);

    return {
      counted, meanOn: sumOn / counted, meanOff: sumOff / counted,
      shadowedCount: shadowed, shadowedFrac: shadowed / counted,
      brighter, minRatio, fallbackUsed, noMapMax, noMapError,
      enabled: vp.uniformsInject.uSunShadowEnabled.value,
    };
  `);
} catch (error) {
  problems.push(`THROW dawn ${String(error).slice(0, 400)}`);
}

if (!dawn) {
  Check("dawn 取证成功", false, problems.slice(0, 3).join(" | "));
} else {
  // 「显著低于」的口径：正侧向看时太阳项只占总散射的两成上下（环境项是各向同性的
  // 雾色），所以一颗**完全**被挡住的 froxel 的比值下界大约是 0.75–0.80，不是 0。
  // 因此断言三件事：存在一批真被压暗的（数量级不是个位数）、最深的那一颗压到 0.85
  // 以下（= 太阳项被整份拿掉）、整体均值确实降了。
  Check("SunShadowVisibility 为 0 的 froxel 散射显著低于为 1 的（街巷内机位）",
    dawn.counted > 10000 && dawn.meanOn < dawn.meanOff
    && dawn.shadowedCount > 2000 && dawn.minRatio < 0.85,
    JSON.stringify(dawn));
  // 帧序钉死之后两次注入是同一批抽样，阴影只能拿走光。这一条同时看住
  // 「A/B 有没有被抖动噪声污染」—— 第一版没钉帧序时它是 10%。
  Check("阴影只拿走光、不凭空加光",
    dawn.brighter / Math.max(dawn.counted, 1) < 0.001,
    JSON.stringify({ brighter: dawn.brighter, counted: dawn.counted }));
  // 这一条是 2026-09 实测事故的回归口：uSunShadowMap 为 null 时 three 绑的是它内部
  // 那张从没上传过的 emptyShadowTexture，ANGLE-D3D11 给 1282 并把整趟 draw 丢掉，
  // 症状是「开机头几帧 / 关掉阴影之后雾整个消失」。
  Check("阴影图不可用时仍照常出雾（1×1 兜底深度靶，不刷 GL 错误）",
    dawn.noMapMax > 1e-6 && dawn.noMapError === 0 && dawn.fallbackUsed === false,
    JSON.stringify({ noMapMax: dawn.noMapMax, noMapError: dawn.noMapError,
      fallbackUsed: dawn.fallbackUsed }));
}

// --- B3: night —— 局部点光（火 / 照明弹）进雾 --------------------------------
let night = null;
try {
  await OpenProbe("night");
  night = await Run(`
    P.StepFrames(40, 1 / 60);
    const slots = Array.from(vp.uniformsInject.uLightPos.value)
      .filter((v, i) => i % 4 === 3 && v > 0).length;
    const withLights = InjectAt(5000);
    // 关掉局部光那一项：直接改 uniform 会被下一帧的 _UpdateParams 冲掉，
    // 所以改数据表里的那一位，走与正式路径同一条链。
    const nightPreset = tuning.VOLUMETRIC_PRESETS.night;
    const pointWas = nightPreset.pointScale;
    nightPreset.pointScale = 0;
    const withoutLights = InjectAt(5000);          // 同一帧序 = 同一批抽样
    nightPreset.pointScale = pointWas;
    P.StepFrames(4, 1 / 60);

    let lit = 0, counted = 0, sumOn = 0, sumOff = 0, maxGain = 0;
    for (let i = 0; i < withLights.length; i += 4) {
      const on = withLights[i] + withLights[i + 1] + withLights[i + 2];
      const off = withoutLights[i] + withoutLights[i + 1] + withoutLights[i + 2];
      counted += 1; sumOn += on; sumOff += off;
      if (on > off * 1.25 + 1e-7) lit += 1;
      if (off > 1e-7 && on / off > maxGain) maxGain = on / off;
    }
    return { slots, counted, litFrac: lit / counted,
      meanOn: sumOn / counted, meanOff: sumOff / counted, maxGain };
  `);
} catch (error) {
  problems.push(`THROW night ${String(error).slice(0, 400)}`);
}

if (!night) {
  Check("night 取证成功", false, problems.slice(0, 3).join(" | "));
} else {
  Check("局部点光（LightRig 火源池）真的照亮了雾",
    night.slots >= 1 && night.litFrac > 0.001 && night.maxGain > 1.5
    && night.meanOn > night.meanOff,
    JSON.stringify(night));
}

// --- B4: burningStreet —— 火源热烟 + AddFogVolume ---------------------------
let burning = null;
try {
  await OpenProbe("burningStreet");
  burning = await Run(`
    P.StepFrames(40, 1 / 60);
    const autoVolumes = Array.from(vp.fogVolumes.values()).filter((v) => v.auto).length;
    const withSmoke = InjectAt(6000);
    const preset = tuning.VOLUMETRIC_PRESETS.burningStreet;
    const fireWas = preset.fireSmoke;
    preset.fireSmoke = 0;
    const withoutSmoke = InjectAt(6000);           // 同一帧序 = 同一批抽样
    preset.fireSmoke = fireWas;

    // 手动加一块很浓的球形雾体：验 AddFogVolume 的接口，也验「烟幕该挡还是挡」
    const handle = vp.AddFogVolume({
      position: { x: P.camera.position.x, y: 1.5, z: P.camera.position.z - 12 },
      size: 6, density: 0.9, falloff: 1.4,
    });
    vp.hasHistory = false;
    P.StepFrames(3, 1 / 60);
    const applyWithWall = ReadRt(vp.fogScatter);
    vp.RemoveFogVolume(handle);
    vp.hasHistory = false;
    P.StepFrames(3, 1 / 60);
    const applyClear = ReadRt(vp.fogScatter);

    let thicker = 0, counted = 0, maxSigmaGain = 0;
    for (let i = 3; i < withSmoke.length; i += 4) {
      counted += 1;
      if (withSmoke[i] > withoutSmoke[i] * 1.2 + 1e-6) thicker += 1;
      if (withoutSmoke[i] > 1e-6 && withSmoke[i] / withoutSmoke[i] > maxSigmaGain) {
        maxSigmaGain = withSmoke[i] / withoutSmoke[i];
      }
    }
    const w = vp.fogScatter.width, h = vp.fogScatter.height;
    let sumWall = 0, sumClear = 0, n = 0;
    for (let y = Math.floor(h * 0.35); y < h * 0.65; y += 2) {
      for (let x = Math.floor(w * 0.35); x < w * 0.65; x += 2) {
        const i = (y * w + x) * 4 + 3;
        sumWall += applyWithWall[i]; sumClear += applyClear[i]; n += 1;
      }
    }
    return { autoVolumes, counted, thickerFrac: thicker / counted, maxSigmaGain,
      wallT: sumWall / n, clearT: sumClear / n };
  `);
} catch (error) {
  problems.push(`THROW burningStreet ${String(error).slice(0, 400)}`);
}

if (!burning) {
  Check("burningStreet 取证成功", false, problems.slice(0, 3).join(" | "));
} else {
  Check("火源自动挂的热烟真的加了密度",
    burning.autoVolumes >= 1 && burning.thickerFrac > 0.0005 && burning.maxSigmaGain > 1.5,
    JSON.stringify({ autoVolumes: burning.autoVolumes, thickerFrac: burning.thickerFrac,
      maxSigmaGain: burning.maxSigmaGain }));
  Check("AddFogVolume 的烟幕挡得住视线（局部雾体是允许降能见度的那一类）",
    burning.wallT < burning.clearT * 0.75,
    JSON.stringify({ wallT: burning.wallT, clearT: burning.clearT }));
}

await browser.close();
server.close();

for (const check of checks) {
  console.log(`${check.ok ? "ok  " : "FAIL"} ${check.name}${check.ok ? "" : `  ${check.detail}`}`);
}
const failed = checks.filter((check) => !check.ok);
console.log(failed.length ? `\n${failed.length} 条失败` : "\n体积雾契约全绿");
if (failed.length) process.exit(1);
