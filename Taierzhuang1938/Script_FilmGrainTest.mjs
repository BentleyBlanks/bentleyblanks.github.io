// 全屏胶片颗粒回归（Composite 的 LensEffects 段，口径见 Data_Tuning_Camera.FILM_GRAIN）。
//
// 三层（第三层是设置：出厂值 / 越界钳制 / 存档回灌 / 旧存档兼容）：
//   1. 着色器层——受控 HDR 平色直接喂 Composite（同 Script_PostTest 的做法），回读 8 位输出量：
//      · 关（uGrain = 0）逐比特等于不跑这一段，同一花样重复渲染逐比特相同；
//      · 强度 = sRGB 域标准差：实测标准差落在 strength × 亮度响应 × 255 的 ±15% 内；
//      · 不改平均亮度（零均值）：中间调均值与无颗粒基线相差 < 0.8 级；
//      · 黑位不被抬（response 在纯黑处为 0）、高光处明显更弱；
//      · 「颗粒大小」改相关长度、不改强度（格子越大相邻像素越相关，标准差不变）；
//      · 种子换花样；low 档便宜路径是纯亮度噪声（通道完全相关），完整路径有彩色颗粒（相关系数 ≈ 1 − chroma）。
//   2. 接线层——走真实 post.Render(options)：强度、大小倍率、画质档位、按时钟换种子都从 options / preset 落到 uniform，
//      大小按输出靶高度等比缩放；`filmGrain` 在四档画质档里都有值。
//
// 用法：node Taierzhuang1938/Script_FilmGrainTest.mjs   退出码即成败。

import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";
import { QUALITY_PRESETS } from "./Data_Tuning_Graphics.mjs";
import { FILM_GRAIN } from "./Data_Tuning_Camera.mjs";

// --- 纯数据口径（不开浏览器）-------------------------------------------------
assert.deepEqual(Object.keys(QUALITY_PRESETS).sort(), ["high", "low", "medium", "ultra"]);
for (const [name, preset] of Object.entries(QUALITY_PRESETS)) {
  assert.ok(preset.filmGrain === 0 || preset.filmGrain === 1, `${name} 档给了 filmGrain 算法位（0/1）`);
}
assert.equal(QUALITY_PRESETS.low.filmGrain, 0, "low 档走便宜路径");
for (const name of ["medium", "high", "ultra"]) assert.equal(QUALITY_PRESETS[name].filmGrain, 1, `${name} 档走完整路径`);
assert.ok(FILM_GRAIN.strength > 0 && FILM_GRAIN.nightStrength >= FILM_GRAIN.strength, "夜战关不比白天淡");
assert.ok(FILM_GRAIN.sizeRange.min > 0 && FILM_GRAIN.sizeRange.min <= FILM_GRAIN.sizeRange.value
  && FILM_GRAIN.sizeRange.value <= FILM_GRAIN.sizeRange.max, "颗粒大小滑杆的出厂值在范围内");
assert.ok(FILM_GRAIN.chroma >= 0 && FILM_GRAIN.chroma <= 1 && FILM_GRAIN.rateHz > 0 && FILM_GRAIN.seedCount >= 2);
console.log("ok  颗粒数据口径：四档画质档都有 filmGrain，出厂值与滑杆范围自洽");

// --- 浏览器层 ----------------------------------------------------------------
const projectDir = path.dirname(fileURLToPath(import.meta.url));
const server = await ServeRoot(path.resolve(projectDir, ".."), 0);
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

let shader = null;
let wiring = null;
let settings = null;
try {
  await page.goto(
    `http://127.0.0.1:${port}/Taierzhuang1938/Probe.html?quality=high&preset=smokyDay&scene=materials&gi=0`,
    { waitUntil: "load", timeout: 120000 },
  );
  await page.waitForFunction(() => window.Probe?.state?.ready, null, { timeout: 180000 });
  const config = { grain: FILM_GRAIN, filmGrainTiers: Object.fromEntries(Object.entries(QUALITY_PRESETS).map(([k, v]) => [k, v.filmGrain])) };

  // ---- 1. 着色器层 ----
  shader = await page.evaluate(async (cfg) => {
    const THREE = await import("./vendor/three/build/three.module.js");
    const P = window.Probe;
    const post = P.post;
    const U = post.uniformsComposite;
    const MakePixel = (value) => {
      const texture = new THREE.DataTexture(new Uint8Array([value, value, value, 255]), 1, 1,
        THREE.RGBAFormat, THREE.UnsignedByteType);
      texture.colorSpace = THREE.NoColorSpace;
      texture.minFilter = THREE.NearestFilter;
      texture.magFilter = THREE.NearestFilter;
      texture.generateMipmaps = false;
      texture.needsUpdate = true;
      return texture;
    };
    const black = MakePixel(0);
    U.uBloom.value = black; U.uGod.value = black; U.uNormalDepth.value = black;
    U.uResolution.value.set(post.width, post.height);
    U.uExposure.value = 1; U.uBloomStrength.value = 0; U.uGodStrength.value = 0;
    U.uVignette.value = 0; U.uAberration.value = 0; U.uSaturation.value = 1; U.uContrast.value = 1.0;
    U.uLift.value.set(0, 0, 0); U.uGain.value.set(1, 1, 1);
    U.uSplitShadow.value = 0; U.uSplitHighlight.value = 0;
    U.uMotionScale.value = 0; U.uDamage.value = 0; U.uFade.value = 0;
    U.uDofStrength.value = 0; U.uFogDensity.value = 0; U.uDither.value = 0;
    U.uConcussion.value.set(0, 0, 0, 0); U.uEyeClosure.value = 0; U.uCheekCut.value.set(0, 0, 0);

    const ldr = post.targets.ldr;
    const pixelCount = ldr.width * ldr.height;
    const textures = new Map();
    const Render = (hdr, { grain = 0, px = 1, mode = 1, seed = 0, seedNext = seed + 1, blend = 0, chroma = cfg.grain.chroma, exposure = 1 } = {}) => {
      if (!textures.has(hdr)) textures.set(hdr, MakePixel(hdr));
      U.uHdr.value = textures.get(hdr);
      U.uExposure.value = exposure;
      U.uGrain.value = grain; U.uGrainPx.value = px; U.uGrainMode.value = mode;
      U.uGrainSeed.value = seed; U.uGrainSeedNext.value = seedNext; U.uGrainBlend.value = blend;
      U.uGrainChroma.value = chroma;
      U.uGrainResponse.value.set(cfg.grain.response.floor, cfg.grain.response.blackFade);
      post._Blit(post.matComposite, ldr);
      const bytes = new Uint8Array(pixelCount * 4);
      P.renderer.readRenderTargetPixels(ldr, 0, 0, ldr.width, ldr.height, bytes);
      return bytes;
    };
    const Channel = (bytes, c) => { const out = new Float64Array(pixelCount); for (let i = 0; i < pixelCount; i++) out[i] = bytes[i * 4 + c]; return out; };
    const Mean = (a) => { let s = 0; for (const v of a) s += v; return s / a.length; };
    const Std = (a, m = Mean(a)) => { let s = 0; for (const v of a) s += (v - m) * (v - m); return Math.sqrt(s / a.length); };
    // 相对基线的偏差场
    const Dev = (bytes, base, c) => { const a = Channel(bytes, c), b = Channel(base, c); const d = new Float64Array(pixelCount); for (let i = 0; i < pixelCount; i++) d[i] = a[i] - b[i]; return d; };
    const Corr = (a, b) => { const ma = Mean(a), mb = Mean(b); let sab = 0, saa = 0, sbb = 0; for (let i = 0; i < a.length; i++) { sab += (a[i] - ma) * (b[i] - mb); saa += (a[i] - ma) ** 2; sbb += (b[i] - mb) ** 2; } return sab / Math.sqrt(saa * sbb || 1); };
    const LagX = (a, w) => { const x = [], y = []; for (let r = 0; r < pixelCount / w; r++) for (let c = 0; c + 1 < w; c++) { x.push(a[r * w + c]); y.push(a[r * w + c + 1]); } return Corr(x, y); };
    const Same = (a, b) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; };
    const Luma01 = (bytes) => (0.2126 * bytes[0] + 0.7152 * bytes[1] + 0.0722 * bytes[2]) / 255;
    const Smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
    const Response = (y) => (cfg.grain.response.floor + (1 - cfg.grain.response.floor) * 4 * y * (1 - y))
      * Smooth(0, cfg.grain.response.blackFade, y);

    // 挑一个基线落在中间调（编码亮度 0.3–0.7）的 HDR 平色
    let midValue = null;
    for (const candidate of [24, 40, 60, 90, 128, 180]) {
      const y = Luma01(Render(candidate));
      if (y >= 0.3 && y <= 0.7) { midValue = candidate; break; }
    }
    const out = { midValue, w: ldr.width, h: ldr.height };
    if (midValue === null) return out;

    const strength = cfg.grain.strength;
    const base = Render(midValue);
    const y = Luma01(base);
    out.baseMidLuma = y;
    out.expectedStd = strength * Response(y) * 255;

    // 关：不跑这一段；同一花样重复渲染逐比特相同
    out.offIdentical = Same(base, Render(midValue, { grain: 0, px: 3, seed: 5 }));
    const g1 = Render(midValue, { grain: strength, px: 1.25, seed: 0 });
    out.sameSeedIdentical = Same(g1, Render(midValue, { grain: strength, px: 1.25, seed: 0 }));
    out.onChangesPixels = !Same(base, g1);

    // 强度与均值（完整路径，默认格子）
    const dG = Dev(g1, base, 1);
    out.std125 = Std(dG);
    out.meanShift = Math.abs(Mean(Channel(g1, 1)) - Mean(Channel(base, 1)));
    // 大小：相关长度变、强度不变
    const gSmall = Render(midValue, { grain: strength, px: 1, seed: 0 });      // ≤ 1 px：逐像素路径
    const gBig = Render(midValue, { grain: strength, px: 3, seed: 0 });
    const dSmall = Dev(gSmall, base, 1), dBig = Dev(gBig, base, 1);
    out.lag1 = { px1: LagX(dSmall, ldr.width), px125: LagX(dG, ldr.width), px3: LagX(dBig, ldr.width) };
    out.stdBig = Std(dBig);
    out.stdSmall = Std(dSmall);
    // 种子换花样；过渡中途（blend=0.5）强度不掉，且不等于两端任一张
    const gSeed = Render(midValue, { grain: strength, px: 1.25, seed: 1 });
    out.seedCorr = Corr(dG, Dev(gSeed, base, 1));
    out.seedDiffers = !Same(g1, gSeed);
    const gBlend = Render(midValue, { grain: strength, px: 1.25, seed: 0, seedNext: 1, blend: 0.5 });
    out.blendDiffers = !Same(g1, gBlend) && !Same(gSeed, gBlend);
    out.stdBlend = Std(Dev(gBlend, base, 1));
    // 通道相关：完整路径 ≈ 1 − chroma；便宜路径 = 纯亮度噪声
    out.rgCorrFull = Corr(Dev(g1, base, 0), Dev(g1, base, 1));
    const gCheap = Render(midValue, { grain: strength, px: 1.25, mode: 0, seed: 0 });
    out.rgCorrCheap = Corr(Dev(gCheap, base, 0), Dev(gCheap, base, 1));
    out.stdCheap = Std(Dev(gCheap, base, 1));
    // 管线的黑位（曝光 0 → 场景光全无，只剩分级 LUT 的 lift / 暗部着色，实测约 [8,5,25]，不是 0，设计如此）：
    // 颗粒压到很弱，4 倍强度下均值也不被零均值噪声的截断抬亮。
    const blackBase = Render(255, { exposure: 0 });
    const blackGrain = Render(255, { grain: strength, px: 1.25, seed: 3, exposure: 0 });
    const blackGrain4 = Render(255, { grain: strength * 4, px: 1.25, seed: 3, exposure: 0 });
    out.blackBase = Array.from(blackBase.slice(0, 3));
    out.blackLuma = Luma01(blackBase);
    out.blackStd = Std(Dev(blackGrain, blackBase, 1));
    out.blackMeanShift4x = Mean(Channel(blackGrain4, 1)) - Mean(Channel(blackBase, 1));
    // 近黑底（hdr = 0，实测 luma ≈ 0.07）：4 倍强度下均值仍不被抬
    const nearBlackBase = Render(0);
    const nearBlackGrain = Render(0, { grain: strength * 4, px: 1.25, seed: 3 });
    out.nearBlackLuma = Luma01(nearBlackBase);
    out.nearBlackMeanShift = Mean(Channel(nearBlackGrain, 1)) - Mean(Channel(nearBlackBase, 1));
    // 真高光（曝光 8 → ACES 饱和到近白）：颗粒明显更弱
    const hiBase = Render(255, { exposure: 8 });
    const hiGrain = Render(255, { grain: strength, px: 1.25, seed: 0, exposure: 8 });
    out.highlightLuma = Luma01(hiBase);
    out.highlightStd = Std(Dev(hiGrain, hiBase, 1));
    out.highlightMeanShift = Math.abs(Mean(Channel(hiGrain, 1)) - Mean(Channel(hiBase, 1)));
    // 夜战暗部（编码亮度 0.1 附近）：均值也不被抬
    let darkValue = null;
    for (const candidate of [2, 3, 4, 6, 8, 12]) {
      const yd = Luma01(Render(candidate));
      if (yd >= 0.04 && yd <= 0.16) { darkValue = candidate; break; }
    }
    out.darkValue = darkValue;
    if (darkValue !== null) {
      const darkBase = Render(darkValue), darkGrain = Render(darkValue, { grain: strength * 1.3, px: 1.25, seed: 2 });
      out.darkLuma = Luma01(darkBase);
      out.darkMeanShift = Mean(Channel(darkGrain, 1)) - Mean(Channel(darkBase, 1));
    }
    for (const t of textures.values()) t.dispose();
    black.dispose();
    out.glError = P.renderer.getContext().getError();
    return out;
  }, config);

  // ---- 2. 接线层：真实 post.Render(options) ----
  // 视口放大到 720p：180 高时 sizePx × 倍率 × h/1080 都 < 1，会被钳成 1，缩放断言就是空转。
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.waitForFunction(() => window.Probe.post.targets.ldr.height >= 720, null, { timeout: 60000 });
  wiring = await page.evaluate(async (cfg) => {
    const P = window.Probe;
    const post = P.post;
    const U = post.uniformsComposite;
    const pass = post.compositePass;
    const base = { taa: false, motionBlur: 0, vignette: 0, autoExposure: false, exposure: 1, fog: { density: 0 } };
    const out = { tiers: cfg.filmGrainTiers, presetFilmGrain: post.preset.filmGrain };
    const outputHeight = post.targets.ldr.height;

    post.Render(P.scene, P.camera, { ...base, grain: 0.05, grainSize: 2, dt: 0 });
    out.outputHeight = outputHeight;
    out.strength = U.uGrain.value;
    out.px = U.uGrainPx.value;
    out.expectedPx = Math.max(1, cfg.grain.sizePx * 2 * outputHeight / 1080);
    out.mode = U.uGrainMode.value;

    post.Render(P.scene, P.camera, { ...base, grain: 0, grainSize: 2, dt: 0 });
    out.offStrength = U.uGrain.value;

    // 大小倍率越界会被钳到滑杆范围；没给就是出厂值
    post.Render(P.scene, P.camera, { ...base, grain: 0.05, grainSize: 99, dt: 0 });
    out.pxClampHigh = U.uGrainPx.value;
    out.expectedClampHigh = Math.max(1, cfg.grain.sizePx * cfg.grain.sizeRange.max * outputHeight / 1080);
    post.Render(P.scene, P.camera, { ...base, grain: 0.05, dt: 0 });
    out.pxDefault = U.uGrainPx.value;
    out.expectedDefault = Math.max(1, cfg.grain.sizePx * cfg.grain.sizeRange.value * outputHeight / 1080);

    // 种子按时钟走：rateHz 次/秒，相邻种子平滑过渡；不是每帧硬切
    const seeds = [], blends = [];
    const t0 = pass.grainClock;
    for (let i = 0; i < 24; i++) {
      post.Render(P.scene, P.camera, { ...base, grain: 0.05, dt: 1 / 60 });
      seeds.push(U.uGrainSeed.value);
      blends.push(U.uGrainBlend.value);
    }
    out.seeds = seeds;
    out.blends = blends;
    out.clockAdvance = pass.grainClock - t0;
    out.seedRange = cfg.grain.seedCount;
    out.rateHz = cfg.grain.rateHz;
    // 画质档位：直接换 preset 位再渲染一帧
    const saved = post.preset.filmGrain;
    post.preset.filmGrain = 0; post.Render(P.scene, P.camera, { ...base, grain: 0.05, dt: 0 }); out.modeLow = U.uGrainMode.value;
    post.preset.filmGrain = 1; post.Render(P.scene, P.camera, { ...base, grain: 0.05, dt: 0 }); out.modeFull = U.uGrainMode.value;
    post.preset.filmGrain = saved;
    out.glError = P.renderer.getContext().getError();
    return out;
  }, config);

  // ---- 3. 设置层：出厂值、钳制、存档回灌、旧存档兼容（真实模块，不走面板 DOM）----
  settings = await page.evaluate(async () => {
    const { NormalizeGraphicsDetails, GraphicsDetailControls, LoadSavedGraphics } = await import("./Script_EditorSettings.mjs");
    const { CreateGameGraphics } = await import("./Script_Tuning_GameGraphics.mjs");
    const preset = { ...window.Probe.post.preset };
    const Make = () => CreateGameGraphics({ profile: "high", preset });
    const KEY = "tengxian1938_graphics_v1";
    const out = {};
    const g = Make();
    out.factory = { grain: g.grain, grainSize: g.grainSize };
    out.controls = GraphicsDetailControls({ preset }).grain.map((c) => ({ key: c.key, min: c.min, max: c.max, value: c.value }));
    g.grainSize = 99; NormalizeGraphicsDetails(g, { preset }); out.clampHigh = g.grainSize;
    g.grainSize = -3; NormalizeGraphicsDetails(g, { preset }); out.clampLow = g.grainSize;
    g.grainSize = NaN; NormalizeGraphicsDetails(g, { preset }); out.nan = g.grainSize;
    g.grainSize = 2.2; NormalizeGraphicsDetails(g, { preset }, true); out.reset = g.grainSize;
    try {
      localStorage.setItem(KEY, JSON.stringify({ grain: 0.4, grainSize: 1.7 }));
      const loaded = Make(); LoadSavedGraphics(loaded);
      out.loaded = { grain: loaded.grain, grainSize: loaded.grainSize };
      localStorage.setItem(KEY, JSON.stringify({ grain: 0.6 }));           // 旧存档：只有强度倍率
      const legacy = Make(); LoadSavedGraphics(legacy);
      out.legacy = { grain: legacy.grain, grainSize: legacy.grainSize };
    } finally { localStorage.removeItem(KEY); }
    return out;
  });
} catch (error) {
  problems.push(`THROW ${String(error).slice(0, 400)}`);
}

await browser.close();
server.close();

for (const problem of problems) console.log(`FAIL ${problem}`);
assert.equal(problems.length, 0, "页面无报错、无异常");
assert.ok(shader && wiring, "两层取证都有结果");
assert.notEqual(shader.midValue, null, "找到了落在中间调的 HDR 平色");
console.log("着色器层", JSON.stringify(shader));
console.log("接线层", JSON.stringify(wiring));

// 1. 着色器层
assert.equal(shader.glError, 0, "着色器编过、无 GL 错误");
assert.ok(shader.offIdentical, "uGrain = 0 时输出逐比特等于无颗粒（与格子大小、种子无关）");
assert.ok(shader.sameSeedIdentical, "同一花样重复渲染逐比特相同（确定性）");
assert.ok(shader.onChangesPixels && shader.std125 > 1, `打开颗粒确实改了像素（标准差 ${shader.std125.toFixed(2)} 级）`);
const near = (value, expected, tol, what) =>
  assert.ok(Math.abs(value - expected) <= expected * tol, `${what}：${value.toFixed(2)} 应在 ${expected.toFixed(2)} 的 ±${tol * 100}% 内`);
near(shader.std125, shader.expectedStd, 0.15, "强度 = sRGB 域标准差（默认格子，完整路径）");
near(shader.stdBig, shader.expectedStd, 0.15, "大格子（3 px）强度不变");
near(shader.stdSmall, shader.expectedStd, 0.15, "逐像素路径强度不变");
near(shader.stdCheap, shader.expectedStd, 0.15, "便宜路径强度不变");
assert.ok(shader.meanShift < 0.8, `不改中间调平均亮度（偏移 ${shader.meanShift.toFixed(2)} 级）`);
assert.ok(shader.lag1.px1 < 0.1 && shader.lag1.px1 > -0.1, `逐像素路径相邻像素不相关（${shader.lag1.px1.toFixed(2)}）`);
assert.ok(shader.lag1.px125 > shader.lag1.px1 + 0.1, `默认格子比逐像素更成团（${shader.lag1.px125.toFixed(2)}）`);
assert.ok(shader.lag1.px3 > 0.6 && shader.lag1.px3 > shader.lag1.px125 + 0.15, `格子越大越相关（3 px：${shader.lag1.px3.toFixed(2)}）`);
assert.ok(shader.seedDiffers && Math.abs(shader.seedCorr) < 0.1, `换种子是另一张花样（相关 ${shader.seedCorr.toFixed(3)}）`);
assert.ok(shader.blendDiffers, "相邻种子 blend=0.5 时不等于两端任一张");
near(shader.stdBlend, shader.expectedStd, 0.15, "过渡中途（blend=0.5）强度不掉");
assert.ok(shader.rgCorrCheap > 0.95, `便宜路径是纯亮度噪声（RG 相关 ${shader.rgCorrCheap.toFixed(3)}）`);
const expectedRg = 1 - FILM_GRAIN.chroma;
assert.ok(Math.abs(shader.rgCorrFull - expectedRg) < 0.12, `完整路径有彩色颗粒（RG 相关 ${shader.rgCorrFull.toFixed(3)} ≈ ${expectedRg}）`);
assert.ok(shader.blackLuma < 0.06, `曝光 0 取到管线黑位（${JSON.stringify(shader.blackBase)}，luma ${shader.blackLuma.toFixed(3)}）`);
assert.ok(shader.blackStd < shader.std125 * 0.4,
  `黑位处颗粒很弱（${shader.blackStd.toFixed(2)} < ${(shader.std125 * 0.4).toFixed(2)}，中间调 ${shader.std125.toFixed(2)}）`);
assert.ok(Math.abs(shader.blackMeanShift4x) < 0.8, `黑位 4 倍强度下均值不被抬（${shader.blackMeanShift4x.toFixed(2)} 级）`);
assert.ok(Math.abs(shader.nearBlackMeanShift) < 0.8,
  `近黑底（luma ${shader.nearBlackLuma.toFixed(2)}）4 倍强度下均值不被抬（${shader.nearBlackMeanShift.toFixed(2)} 级）`);
assert.ok(shader.highlightLuma > 0.95, `高光样本确实在近白（${shader.highlightLuma.toFixed(2)}）`);
assert.ok(shader.highlightStd < shader.std125 * 0.35,
  `高光处颗粒几乎消失（${shader.highlightStd.toFixed(2)} < ${(shader.std125 * 0.35).toFixed(2)}，中间调 ${shader.std125.toFixed(2)}）`);
assert.ok(shader.highlightMeanShift < 1.0, `高光均值不被拉低（${shader.highlightMeanShift.toFixed(2)} 级）`);
assert.notEqual(shader.darkValue, null, "找到了落在暗部的 HDR 平色");
assert.ok(shader.darkMeanShift < 1.0, `暗部均值不被抬亮（${shader.darkMeanShift.toFixed(2)} 级，夜战关用的更强档）`);

// 2. 接线层
assert.equal(wiring.glError, 0);
for (const name of ["low", "medium", "high", "ultra"]) assert.ok(wiring.tiers[name] === 0 || wiring.tiers[name] === 1);
assert.equal(wiring.strength, 0.05, "options.grain 落到 uGrain");
assert.equal(wiring.offStrength, 0, "options.grain = 0 → uGrain = 0（整段不执行）");
assert.ok(wiring.expectedPx > 1 && wiring.expectedClampHigh > wiring.expectedPx,
  `接线测试的靶够大，缩放断言不是空转（${wiring.outputHeight} 高：×2 → ${wiring.expectedPx.toFixed(2)} px，上限 → ${wiring.expectedClampHigh.toFixed(2)} px）`);
assert.ok(Math.abs(wiring.px - wiring.expectedPx) < 1e-6, `颗粒格大小 = 数据 × 倍率 × 输出靶高度 / 1080（${wiring.px} vs ${wiring.expectedPx}）`);
assert.ok(Math.abs(wiring.pxClampHigh - wiring.expectedClampHigh) < 1e-6, "倍率越界被钳到滑杆上限");
assert.ok(Math.abs(wiring.pxDefault - wiring.expectedDefault) < 1e-6, "没给倍率 = 出厂值");
assert.equal(wiring.mode, wiring.presetFilmGrain ? 1 : 0, "算法位取自当前画质档的 preset.filmGrain");
assert.equal(wiring.modeLow, 0); assert.equal(wiring.modeFull, 1);
assert.ok(Math.abs(wiring.clockAdvance - 24 / 60) < 1e-9, "颗粒时钟按 dt 累积");
const distinctSeeds = new Set(wiring.seeds).size;
const expectedAdvances = 24 * FILM_GRAIN.rateHz / 60;
assert.ok(distinctSeeds >= Math.max(2, Math.floor(expectedAdvances)) && distinctSeeds <= Math.ceil(expectedAdvances) + 1,
  `按 ${FILM_GRAIN.rateHz} Hz 换花样：24 帧 @60 fps 约换 ${expectedAdvances} 次，实际 ${distinctSeeds} 种种子（${wiring.seeds.join(",")}）`);
assert.ok(wiring.seeds.every((s, i) => i === 0 || s >= wiring.seeds[i - 1] || s < 4), "种子随时间单调推进（只在回绕处下降）");
assert.ok(wiring.seeds.every((s) => Number.isInteger(s) && s >= 0 && s < wiring.seedRange), "种子是 [0, seedCount) 的整数");
assert.ok(wiring.blends.every((b) => b >= 0 && b < 1), "blend 落在 [0, 1)");
assert.ok(wiring.blends.some((b, i) => i > 0 && Math.abs(b - wiring.blends[i - 1]) > 0.01), "blend 在种子持有期内持续推进（不是每帧硬切）");

// 3. 设置层
assert.ok(settings, "设置层有结果");
console.log("设置层", JSON.stringify(settings));
const sizeRange = FILM_GRAIN.sizeRange;
assert.deepEqual(settings.controls, [{ key: "grainSize", min: sizeRange.min, max: sizeRange.max, value: sizeRange.value }],
  "画质面板的「颗粒大小」控件取自 FILM_GRAIN.sizeRange");
assert.equal(settings.factory.grainSize, sizeRange.value, "graphics 表里 grainSize 的出厂值");
assert.equal(settings.factory.grain, 1, "「颗粒」强度倍率出厂 ×1");
assert.equal(settings.clampHigh, sizeRange.max, "存档里越界的大小被钳到上限");
assert.equal(settings.clampLow, sizeRange.min, "存档里越界的大小被钳到下限");
assert.equal(settings.nan, sizeRange.value, "存档里坏掉的大小回到出厂值");
assert.equal(settings.reset, sizeRange.value, "恢复出厂把大小放回出厂值");
assert.deepEqual(settings.loaded, { grain: 0.4, grainSize: 1.7 }, "存档里的强度与大小回灌到 graphics");
assert.deepEqual(settings.legacy, { grain: 0.6, grainSize: sizeRange.value }, "旧存档（只有强度倍率）照常读，大小取出厂值");

console.log("ok  全屏胶片颗粒：着色器层、接线层与设置层全部通过");
