// 全屏胶片颗粒回归（CAS 后最终送屏；口径见 Data_Tuning_Camera.FILM_GRAIN）。
//
// 三层（第三层是设置：出厂值 / 越界钳制 / 存档回灌 / 旧存档兼容）：
//   1. 着色器层——受控 HDR 平色直接喂 Composite（同 Script_PostTest 的做法），回读 8 位输出量：
//      · 关（uGrain = 0）逐比特等于不跑这一段，同一花样重复渲染逐比特相同；
//      · 强度 = sRGB 域标准差：实测标准差落在 strength × 亮度响应 × 255 的 ±15% 内；
//      · 不改平均亮度（零均值）：中间调均值与无颗粒基线相差 < 0.8 级；
//      · 黑位不被抬（response 在纯黑处为 0）、浅灰与高光沿二次肩部压净；
//      · 「颗粒大小」改相关长度、不改强度（格子越大相邻像素越相关，标准差不变）；
//      · 花样确定、对标 COD IW8 / UE5 逐帧素数周期离散换片（零跨帧蠕动）、出厂纯单色银盐且支持可选染料色度。
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
for (const name of ["low", "medium", "high", "ultra"]) assert.equal(QUALITY_PRESETS[name].filmGrain, 1, `${name} 档走统一标准胶片颗粒路径`);
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
    const display = ldr.clone();
    const final = post.uniformsFxaa;
    final.uSource.value = ldr.texture;
    final.uSharpen.value = 0; final.uFxaa.value = 0;
    const pixelCount = ldr.width * ldr.height;
    const textures = new Map();
    const Render = (hdr, { grain = 0, px = 1, mode = 1, seed = 0, seedNext = seed + 1, blend = 0, chroma = cfg.grain.chroma, exposure = 1 } = {}) => {
      if (!textures.has(hdr)) textures.set(hdr, MakePixel(hdr));
      U.uHdr.value = textures.get(hdr);
      U.uExposure.value = exposure;
      final.uGrain.value = grain; final.uGrainPx.value = px; final.uGrainMode.value = mode;
      final.uGrainSeed.value = seed; final.uGrainSeedNext.value = seedNext; final.uGrainBlend.value = blend;
      final.uGrainChroma.value = chroma;
      post._Blit(post.matComposite, ldr);
      post._Blit(post.matFxaa, display);
      const bytes = new Uint8Array(pixelCount * 4);
      P.renderer.readRenderTargetPixels(display, 0, 0, display.width, display.height, bytes);
      return bytes;
    };
    const Channel = (bytes, c) => { const out = new Float64Array(pixelCount); for (let i = 0; i < pixelCount; i++) out[i] = bytes[i * 4 + c]; return out; };
    const Mean = (a) => { let s = 0; for (const v of a) s += v; return s / a.length; };
    const Std = (a, m = Mean(a)) => { let s = 0; for (const v of a) s += (v - m) * (v - m); return Math.sqrt(s / a.length); };
    // 相对基线的偏差场
    const Dev = (bytes, base, c) => { const a = Channel(bytes, c), b = Channel(base, c); const d = new Float64Array(pixelCount); for (let i = 0; i < pixelCount; i++) d[i] = a[i] - b[i]; return d; };
    const Corr = (a, b) => { const ma = Mean(a), mb = Mean(b); let sab = 0, saa = 0, sbb = 0; for (let i = 0; i < a.length; i++) { sab += (a[i] - ma) * (b[i] - mb); saa += (a[i] - ma) ** 2; sbb += (b[i] - mb) ** 2; } return sab / Math.sqrt(saa * sbb || 1); };
    const Lag = (field, width, dx, dy) => {
      const source = [], neighbor = [];
      for (let row = 0; row + dy < field.length / width; row++) for (let col = 0; col + dx < width; col++) {
        const index = row * width + col;
        source.push(field[index]); neighbor.push(field[index + dy * width + dx]);
      }
      return Corr(source, neighbor);
    };
    const Same = (a, b) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; };
    const Luma01 = (bytes) => (0.2126 * bytes[0] + 0.7152 * bytes[1] + 0.0722 * bytes[2]) / 255;
    const Smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
    const Response = (value) => {
      const toe = Smooth(0.015, cfg.grain.response.toeEnd, value);
      const hi = 1 - Smooth(cfg.grain.response.shoulderStart, 0.88, value);
      return toe * hi * hi;
    };
    // 8×8 块均值的标准差与逐像素标准差之比：衡量是否混入低频大泥斑（旧版 3.7px 云斑约 0.35+，柔化 35mm 银盐应 < 0.28）。
    const BlotchRatio = (field, width, height, std) => {
      const blocks = [];
      for (let by = 0; by + 8 <= height; by += 8) for (let bx = 0; bx + 8 <= width; bx += 8) {
        let sum = 0;
        for (let dy = 0; dy < 8; dy++) for (let dx = 0; dx < 8; dx++) sum += field[(by + dy) * width + (bx + dx)];
        blocks.push(sum / 64);
      }
      return Std(blocks) / Math.max(std, 1e-6);
    };

    // 挑一个基线落在下中间调（编码亮度 0.22–0.42，对应胶片乳剂响应甜点区）的 HDR 平色，
    // 另挑一个浅灰墙面（0.52–0.72）验证二次摄影肩部压净浅灰平墙。
    let midValue = null;
    let lightWallValue = null;
    for (const candidate of [12, 18, 24, 32, 40, 60, 90, 128, 180]) {
      const y = Luma01(Render(candidate));
      if (midValue === null && y >= 0.22 && y <= 0.42) midValue = candidate;
      if (lightWallValue === null && y >= 0.52 && y <= 0.72) lightWallValue = candidate;
    }
    const out = { midValue, lightWallValue, w: ldr.width, h: ldr.height };
    if (midValue === null) return out;

    const strength = cfg.grain.strength;
    // 用标定强度（≥0.015）避开 8 位量化误差（1/√12 ≈ 0.29 级）去验 ±15% 方差精度，
    // 同时用真实出厂 strength 验 COD 微妙细腻的送屏幅度。
    const calStrength = Math.max(strength, 0.015);
    const base = Render(midValue);
    const y = Luma01(base);
    out.baseMidLuma = y;
    out.expectedStd = calStrength * Response(y) * 255;
    out.expectedDefaultStd = strength * Response(y) * 255;

    // 关：不跑这一段；同一花样重复渲染逐比特相同
    out.offIdentical = Same(base, Render(midValue, { grain: 0, px: 3, seed: 5 }));
    const gDefault = Render(midValue, { grain: strength, px: cfg.grain.sizePx, seed: 0 });
    out.sameSeedIdentical = Same(gDefault, Render(midValue, { grain: strength, px: cfg.grain.sizePx, seed: 0 }));
    out.onChangesPixels = !Same(base, gDefault);
    out.stdDefault = Std(Dev(gDefault, base, 1));
    if (lightWallValue !== null) {
      const wallBase = Render(lightWallValue);
      const wallGrain = Render(lightWallValue, { grain: strength, px: cfg.grain.sizePx, seed: 0 });
      out.lightWallLuma = Luma01(wallBase);
      out.lightWallStd = Std(Dev(wallGrain, wallBase, 1));
    }

    // 强度与均值（完整路径，默认格子，标定强度）
    const g1 = Render(midValue, { grain: calStrength, px: cfg.grain.sizePx, seed: 0 });
    const dG = Dev(g1, base, 1);
    out.std125 = Std(dG);
    out.meanShift = Math.abs(Mean(Channel(g1, 1)) - Mean(Channel(base, 1)));
    // 大小：相关长度变、强度不变（1 px / 1.6 px / 3 px 单调递进）
    const gSmall = Render(midValue, { grain: calStrength, px: 1, seed: 0 });
    const gMed = Render(midValue, { grain: calStrength, px: 1.6, seed: 0 });
    const gBig = Render(midValue, { grain: calStrength, px: 3, seed: 0 });
    const dSmall = Dev(gSmall, base, 1), dMed = Dev(gMed, base, 1), dBig = Dev(gBig, base, 1);
    out.lag1 = { px1: Lag(dSmall, ldr.width, 1, 0), pxDefault: Lag(dG, ldr.width, 1, 0), px16: Lag(dMed, ldr.width, 1, 0), px3: Lag(dBig, ldr.width, 1, 0) };
    out.verticalLag = Lag(dBig, ldr.width, 0, 1);
    out.plateTail = Lag(dBig, ldr.width, 3, 0);
    out.stdBig = Std(dBig);
    out.stdSmall = Std(dSmall);
    // 种子换花样；过渡中途（blend=0.5）强度不掉，且不等于两端任一张
    const gSeed = Render(midValue, { grain: calStrength, px: cfg.grain.sizePx, seed: 1 });
    out.seedCorr = Corr(dG, Dev(gSeed, base, 1));
    out.seedDiffers = !Same(g1, gSeed);
    const gBlend = Render(midValue, { grain: calStrength, px: cfg.grain.sizePx, seed: 0, seedNext: 1, blend: 0.5 });
    out.blendDiffers = !Same(g1, gBlend) && !Same(gSeed, gBlend);
    out.stdBlend = Std(Dev(gBlend, base, 1));
    // 通道相关：COD 出厂 chroma=0 为纯单色银盐；显式给 chroma=0.15 时激活可控三层染料色度。
    out.rgCorrFull = Corr(Dev(g1, base, 0), Dev(g1, base, 1));
    const gChroma = Render(midValue, { grain: calStrength, px: cfg.grain.sizePx, seed: 0, chroma: 0.15 });
    out.rgCorrChroma = Corr(Dev(gChroma, base, 0), Dev(gChroma, base, 1));
    const gCheap = Render(midValue, { grain: calStrength, px: cfg.grain.sizePx, mode: 0, seed: 0 });
    out.rgCorrCheap = Corr(Dev(gCheap, base, 0), Dev(gCheap, base, 1));
    out.stdCheap = Std(Dev(gCheap, base, 1));
    const savedSharpen = final.uSharpen.value, savedFxaa = final.uFxaa.value;
    const flat = MakePixel(110);
    final.uSource.value = flat; final.uGrainMode.value = 1;
    const ReadFinal = () => {
      post._Blit(post.matFxaa, display);
      const pixels = new Uint8Array(pixelCount * 4);
      P.renderer.readRenderTargetPixels(display, 0, 0, display.width, display.height, pixels);
      return pixels;
    };
    const unsharpened = ReadFinal();
    final.uSharpen.value = 1; final.uFxaa.value = 1;
    const sharpened = ReadFinal();
    out.aaMaxDelta = sharpened.reduce((worst, value, index) => Math.max(worst, Math.abs(value - unsharpened[index])), 0);
    out.aaCorrelation = Corr(Channel(sharpened, 1), Channel(unsharpened, 1));
    final.uSource.value = ldr.texture; flat.dispose();
    final.uSharpen.value = savedSharpen; final.uFxaa.value = savedFxaa;
    out.blotch8x8Ratio = BlotchRatio(dG, ldr.width, ldr.height, out.std125);
    // 管线的黑位（曝光 0 → 场景光全无，只剩分级 LUT 的 lift / 暗部着色，实测约 [8,5,25]，不是 0，设计如此）：
    // 颗粒压到很弱，4 倍强度下均值也不被零均值噪声的截断抬亮。
    const blackBase = Render(255, { exposure: 0 });
    const blackGrain = Render(255, { grain: calStrength, px: cfg.grain.sizePx, seed: 3, exposure: 0 });
    const blackGrain4 = Render(255, { grain: calStrength * 4, px: cfg.grain.sizePx, seed: 3, exposure: 0 });
    out.blackBase = Array.from(blackBase.slice(0, 3));
    out.blackLuma = Luma01(blackBase);
    out.blackStd = Std(Dev(blackGrain, blackBase, 1));
    out.blackMeanShift4x = Mean(Channel(blackGrain4, 1)) - Mean(Channel(blackBase, 1));
    // 近黑底（hdr = 0，实测 luma ≈ 0.07）：4 倍强度下均值仍不被抬
    const nearBlackBase = Render(0);
    const nearBlackGrain = Render(0, { grain: calStrength * 4, px: cfg.grain.sizePx, seed: 3 });
    out.nearBlackLuma = Luma01(nearBlackBase);
    out.nearBlackMeanShift = Mean(Channel(nearBlackGrain, 1)) - Mean(Channel(nearBlackBase, 1));
    // 真高光（曝光 8 → ACES 饱和到近白）：颗粒几乎完全消失
    const hiBase = Render(255, { exposure: 8 });
    const hiGrain = Render(255, { grain: calStrength, px: cfg.grain.sizePx, seed: 0, exposure: 8 });
    out.highlightLuma = Luma01(hiBase);
    out.highlightStd = Std(Dev(hiGrain, hiBase, 1));
    out.highlightMeanShift = Math.abs(Mean(Channel(hiGrain, 1)) - Mean(Channel(hiBase, 1)));
    // 夜战暗部（编码亮度 0.1 附近）：均值也不被抬，且显式色度在暗部仍被压弱
    let darkValue = null;
    for (const candidate of [2, 3, 4, 6, 8, 12]) {
      const yd = Luma01(Render(candidate));
      if (yd >= 0.04 && yd <= 0.16) { darkValue = candidate; break; }
    }
    out.darkValue = darkValue;
    if (darkValue !== null) {
      const darkBase = Render(darkValue), darkGrain = Render(darkValue, { grain: calStrength * 1.3, px: cfg.grain.sizePx, seed: 2, chroma: 0.15 });
      out.darkLuma = Luma01(darkBase);
      out.darkMeanShift = Mean(Channel(darkGrain, 1)) - Mean(Channel(darkBase, 1));
      out.darkStd = Std(Dev(darkGrain, darkBase, 1));
      out.rgCorrDarkChroma = Corr(Dev(darkGrain, darkBase, 0), Dev(darkGrain, darkBase, 1));
    }
    for (const t of textures.values()) t.dispose();
    black.dispose(); display.dispose();
    out.glError = P.renderer.getContext().getError();
    return out;
  }, config);

  // ---- 2. 接线层：真实 post.Render(options) ----
  // 视口放大到 720p，另用半尺寸输入验证颗粒依然跟随画布。
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.waitForFunction(() => window.Probe.post.targets.ldr.height >= 720, null, { timeout: 60000 });
  wiring = await page.evaluate(async (cfg) => {
    const P = window.Probe;
    const post = P.post;
    const U = post.uniformsFxaa;
    const pass = post.fxaaPass;
    const base = { taa: false, motionBlur: 0, vignette: 0, autoExposure: false, exposure: 1, fog: { density: 0 } };
    const out = { tiers: cfg.filmGrainTiers, presetFilmGrain: post.preset.filmGrain };
    const outputHeight = P.renderer.domElement.height;

    const resScale = Math.sqrt(outputHeight / 1080);
    post.Render(P.scene, P.camera, { ...base, grain: 0.05, grainSize: 2, dt: 0 });
    out.outputHeight = outputHeight;
    out.strength = U.uGrain.value;
    out.px = U.uGrainPx.value;
    out.expectedPx = Math.max(0.75, cfg.grain.sizePx * 2 * resScale);
    out.mode = U.uGrainMode.value;

    post.Render(P.scene, P.camera, { ...base, grain: 0, grainSize: 2, dt: 0 });
    out.offStrength = U.uGrain.value;

    // 大小倍率越界会被钳到滑杆范围；没给就是出厂值
    post.Render(P.scene, P.camera, { ...base, grain: 0.05, grainSize: 99, dt: 0 });
    out.pxClampHigh = U.uGrainPx.value;
    out.expectedClampHigh = Math.max(0.75, cfg.grain.sizePx * cfg.grain.sizeRange.max * resScale);
    post.Render(P.scene, P.camera, { ...base, grain: 0.05, dt: 0 });
    out.pxDefault = U.uGrainPx.value;
    out.expectedDefault = Math.max(0.75, cfg.grain.sizePx * cfg.grain.sizeRange.value * resScale);

    // 对标 COD IW8 / UE5：每帧步进 1 格素数周期、零跨帧混合（uGrainBlend = 0）；dt=0 时冻结种子保证确定性。
    const seeds = [], blends = [];
    const t0 = pass.grainClock;
    post.Render(P.scene, P.camera, { ...base, grain: 0.05, dt: 0 });
    const holdSeedA = U.uGrainSeed.value;
    post.Render(P.scene, P.camera, { ...base, grain: 0.05, dt: 0 });
    out.holdStable = U.uGrainSeed.value === holdSeedA;
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
    post.SetSize(640, 360);
    post.Render(P.scene, P.camera, { ...base, grain: 0.05, grainSize: 2, dt: 0 });
    out.halfSourceHeight = post.targets.ldr.height;
    out.halfSourcePx = U.uGrainPx.value;
    out.glError = P.renderer.getContext().getError();
    return out;
  }, config);

  // ---- 3. 设置层：CameraProfile 固化后颗粒不再进玩家画质面板与存档 ----
  settings = await page.evaluate(async () => {
    const { GraphicsDetailControls, LoadSavedGraphics } = await import("./Script_PlayerSettings.mjs");
    const { CreateGameGraphics } = await import("./Script_Tuning_GameGraphics.mjs");
    const preset = { ...window.Probe.post.preset };
    const Make = () => CreateGameGraphics({ profile: "high", preset });
    const KEY = "tengxian1938_graphics_v1";
    const out = {};
    const g = Make();
    out.hasGrainKey = "grain" in g || "grainSize" in g;
    out.controls = GraphicsDetailControls({ preset }).grain || [];
    try {
      localStorage.setItem(KEY, JSON.stringify({ grain: 0.4, grainSize: 1.7, fov: 68 }));
      const loaded = Make(); LoadSavedGraphics(loaded);
      out.loaded = { hasGrain: "grain" in loaded, hasGrainSize: "grainSize" in loaded, fov: loaded.fov };
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
assert.ok(shader.aaMaxDelta <= 1 && shader.aaCorrelation > .999, "平色开启 AA/CAS 只允许一次 8 位舍入，不得改变颗粒形状");
assert.ok(shader.offIdentical, "uGrain = 0 时输出逐比特等于无颗粒（与格子大小、种子无关）");
assert.ok(shader.sameSeedIdentical, "同一花样重复渲染逐比特相同（确定性）");
assert.ok(shader.onChangesPixels && shader.stdDefault >= 0.45 && shader.stdDefault <= 2.2,
  `出厂 COD 档确实改了像素且保持细腻克制（标准差 ${shader.stdDefault.toFixed(2)} 级，期望约 ${shader.expectedDefaultStd.toFixed(2)} 级）`);
if (shader.lightWallValue !== null) {
  assert.ok(shader.lightWallStd < shader.stdDefault * 0.72 && shader.lightWallStd < 1.0,
    `浅灰墙面（luma ${shader.lightWallLuma.toFixed(2)}）经二次摄影肩部压净（std ${shader.lightWallStd.toFixed(2)} < ${Math.min(1.0, shader.stdDefault * 0.72).toFixed(2)}）`);
}
const near = (value, expected, tol, what) =>
  assert.ok(Math.abs(value - expected) <= expected * tol, `${what}：${value.toFixed(2)} 应在 ${expected.toFixed(2)} 的 ±${tol * 100}% 内`);
near(shader.std125, shader.expectedStd, 0.15, "强度 = sRGB 域标准差（默认格子，完整路径）");
near(shader.stdBig, shader.expectedStd, 0.15, "大格子（3 px）强度不变");
near(shader.stdSmall, shader.expectedStd, 0.15, "逐像素路径强度不变");
near(shader.stdCheap, shader.expectedStd, 0.15, "便宜路径强度不变");
assert.ok(shader.meanShift < 0.8, `不改中间调平均亮度（偏移 ${shader.meanShift.toFixed(2)} 级）`);
assert.ok(shader.lag1.pxDefault > 0.08 && shader.lag1.pxDefault < 0.30, `出厂颗粒（${FILM_GRAIN.sizePx} px）细腻微晶，不发粗不糊成片（${shader.lag1.pxDefault.toFixed(3)}）`);
assert.ok(Math.abs(shader.lag1.px3 - shader.verticalLag) < 0.05, "横竖相关长度一致，没有轴向条纹");
assert.ok(shader.blotch8x8Ratio < 0.16, `高通乳剂彻底压住 >4 px 低频脏斑（8×8 块均值比 ${shader.blotch8x8Ratio.toFixed(3)} < 0.16）`);
assert.ok(shader.lag1.px16 > shader.lag1.px1 + 0.12, `放大滑杆后相关长度明显增大（1.6 px：${shader.lag1.px16.toFixed(2)} vs 1 px：${shader.lag1.px1.toFixed(2)}）`);
assert.ok(shader.lag1.px3 > 0.65 && shader.lag1.px3 > shader.lag1.px16 + 0.15, `格子越大越相关（3 px：${shader.lag1.px3.toFixed(2)}）`);
assert.ok(shader.seedDiffers && Math.abs(shader.seedCorr) < 0.1, `换种子是另一张花样（相关 ${shader.seedCorr.toFixed(3)}）`);
assert.ok(shader.blendDiffers, "相邻种子 blend=0.5 时不等于两端任一张");
near(shader.stdBlend, shader.expectedStd, 0.15, "过渡中途（blend=0.5）强度不掉");
assert.ok(shader.rgCorrCheap > 0.99, `便宜路径是纯亮度噪声（RG 相关 ${shader.rgCorrCheap.toFixed(3)}）`);
assert.ok(shader.rgCorrFull > 0.99, `COD 出厂 chroma=0 完整档也是纯单色银盐无彩噪（RG 相关 ${shader.rgCorrFull.toFixed(3)}）`);
assert.ok(shader.rgCorrChroma > 0.94 && shader.rgCorrChroma < 0.992,
  `显式色度 chroma=0.15 时以亮度为主且带可控三层染料色度（RG 相关 ${shader.rgCorrChroma.toFixed(3)}）`);
assert.ok(shader.blackLuma < 0.06, `曝光 0 取到管线黑位（${JSON.stringify(shader.blackBase)}，luma ${shader.blackLuma.toFixed(3)}）`);
assert.ok(shader.blackStd < shader.std125 * 0.4,
  `黑位处颗粒很弱（${shader.blackStd.toFixed(2)} < ${(shader.std125 * 0.4).toFixed(2)}，中间调 ${shader.std125.toFixed(2)}）`);
assert.ok(Math.abs(shader.blackMeanShift4x) < 0.8, `黑位 4 倍强度下均值不被抬（${shader.blackMeanShift4x.toFixed(2)} 级）`);
assert.ok(Math.abs(shader.nearBlackMeanShift) < 0.8,
  `近黑底（luma ${shader.nearBlackLuma.toFixed(2)}）4 倍强度下均值不被抬（${shader.nearBlackMeanShift.toFixed(2)} 级）`);
assert.ok(shader.highlightLuma > 0.95, `高光样本确实在近白（${shader.highlightLuma.toFixed(2)}）`);
assert.ok(shader.highlightStd < shader.std125 * 0.15,
  `高光处颗粒几乎消失（${shader.highlightStd.toFixed(2)} < ${(shader.std125 * 0.15).toFixed(2)}，中间调 ${shader.std125.toFixed(2)}）`);
assert.ok(shader.highlightMeanShift < 1.0, `高光均值不被拉低（${shader.highlightMeanShift.toFixed(2)} 级）`);
assert.notEqual(shader.darkValue, null, "找到了落在暗部的 HDR 平色");
assert.ok(shader.darkMeanShift < 1.0, `暗部均值不被抬亮（${shader.darkMeanShift.toFixed(2)} 级，夜战关用的更强档）`);
assert.ok(shader.darkStd > 0.5 && shader.rgCorrDarkChroma > shader.rgCorrChroma,
  `暗部保留银盐颗粒且自动压弱色度（std ${shader.darkStd.toFixed(2)}，暗部 RG 相关 ${shader.rgCorrDarkChroma.toFixed(3)} > 中间调 ${shader.rgCorrChroma.toFixed(3)}）`);

// 2. 接线层
assert.equal(wiring.glError, 0);
for (const name of ["low", "medium", "high", "ultra"]) assert.ok(wiring.tiers[name] === 0 || wiring.tiers[name] === 1);
assert.equal(wiring.strength, 0.05, "options.grain 落到 uGrain");
assert.equal(wiring.offStrength, 0, "options.grain = 0 → uGrain = 0（整段不执行）");
assert.ok(wiring.expectedPx > 1 && wiring.expectedClampHigh > wiring.expectedPx,
  `接线测试的靶够大，缩放断言不是空转（${wiring.outputHeight} 高：×2 → ${wiring.expectedPx.toFixed(2)} px，上限 → ${wiring.expectedClampHigh.toFixed(2)} px）`);
assert.ok(Math.abs(wiring.px - wiring.expectedPx) < 1e-6, `颗粒格大小 = 数据 × 倍率 × √(输出靶高 / 1080)（${wiring.px} vs ${wiring.expectedPx}）`);
assert.ok(Math.abs(wiring.pxClampHigh - wiring.expectedClampHigh) < 1e-6, "倍率越界被钳到滑杆上限");
assert.ok(Math.abs(wiring.pxDefault - wiring.expectedDefault) < 1e-6, "没给倍率 = 出厂值");
assert.equal(wiring.mode, wiring.presetFilmGrain ? 1 : 0, "算法位取自当前画质档的 preset.filmGrain");
assert.ok(wiring.halfSourceHeight < wiring.outputHeight && wiring.halfSourcePx === wiring.px, "内部渲染降到半分辨率不改变屏幕颗粒大小");
assert.equal(wiring.modeLow, 0); assert.equal(wiring.modeFull, 1);
assert.ok(wiring.holdStable, "dt=0 时种子冻结不前进（暂停/截图确定性）");
assert.ok(Math.abs(wiring.clockAdvance - 24 / 60) < 1e-9, "颗粒时钟按 dt 累积");
const distinctSeeds = new Set(wiring.seeds).size;
assert.equal(distinctSeeds, 24, `对标 COD IW8 / UE5 逐帧素数周期步进：24 帧应走过 24 种独立种子（实际 ${distinctSeeds}：${wiring.seeds.join(",")}）`);
assert.ok(wiring.seeds.every((s, i) => i === 0 || s === (wiring.seeds[i - 1] + 1) % wiring.seedRange),
  "每帧严格 +1 模 seedCount 推进，无拍频滞留");
assert.ok(wiring.seeds.every((s) => Number.isInteger(s) && s >= 0 && s < wiring.seedRange), "种子是 [0, seedCount) 的整数");
assert.ok(wiring.blends.every((b) => b === 0), "零跨帧混合（uGrainBlend 恒为 0，消除 8–16 Hz 闪动蠕动）");

// 3. 设置层（CameraProfile 固化：颗粒不再暴露给玩家，旧存档自动忽略）
assert.ok(settings, "设置层有结果");
console.log("设置层", JSON.stringify(settings));
assert.equal(settings.hasGrainKey, false, "CreateGameGraphics 不再暴露 grain / grainSize");
assert.deepEqual(settings.controls, [], "画质面板不再暴露颗粒控件");
assert.deepEqual(settings.loaded, { hasGrain: false, hasGrainSize: false, fov: 68 }, "旧存档里的 grain/grainSize 被忽略，允许键照常恢复");

console.log("ok  全屏胶片颗粒：着色器层、接线层与设置层全部通过");
