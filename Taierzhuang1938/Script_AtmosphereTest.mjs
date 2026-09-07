// ===========================================================================
// Script_AtmosphereTest.mjs —— 物理大气（Hillaire 2020）的看门狗（真浏览器）
//
// 查的是**数值不是观感**。这套东西的失败模式全部是"画面还在、只是不对"：
//   · 着色器编译失败 —— three 只在控制台留一行，那一趟什么都不画，
//     天穹会保持上一次 clear 的颜色（看着像"美术选了个纯色天"）；
//   · LUT 全黑 —— 天空是黑的、IBL 是黑的，很容易被当成"夜战预设"；
//   · uv 映射写反 —— 地平线出现一条缝、太阳周围一圈台阶；
//   · froxel 切片对错位 —— 贴脸就有雾，而"雾大"看着像美术意图。
// 所以每一条都读回像素或读回 LUT 纹素。
//
// ## 三个阈值分别在守什么（这一节决定了这份测试有没有用）
//   · **上半球余弦加权辐照度 ±15%** —— 这是硬闸。它正比于 PMREM 烘出来那张
//     IBL 的量级，也就是"整幅画有多亮"。用户唯一真正敏感的就是这一维
//     （历史事故：「画面为什么这么黑」）。
//   · **天顶 / 地平线 / 太阳侧各 ±40%** —— 软闸，只拦"整档跑飞"。
//     物理天空**必然**把能量从天顶挪到地平线（水平视线的光学厚度是竖直的
//     十几倍），而手调那张天是一条 pow 渐变、平得多。逼这三项也进 ±15%
//     等于把物理模型重新拟合成旧模型 —— 那正是这一轮要买掉的东西。
//     实测标定后最大偏差：地平线 +23%（testSceneDay / whiteboxDay）。
//   · **上半球均色 ΔE < 40** —— 守色相：IBL 的色相决定阴影侧是冷是暖。
//
// 断言清单：
//   1. 页面无控制台报错（着色器编译失败的唯一信号）
//   2. 四张 LUT 非空、有限、范围合理；透过率∈[0,1]，天顶方向 > 地平线方向，
//      且掠地平线偏红（瑞利 λ⁻⁴ 的直接证据）
//   3. 每预设新旧天空的辐照度 / 分组亮度 / 均色对照（标定表打印进输出）
//   4. night 在线性域比白天暗一个数量级以上，且有星
//   5. 70 m 透过率 ≥ 旧解析雾同距离的值（用户定论「先别动雾」的硬闸）
//   6. 大气透视：500 m 外透过率 < 1 且散射 > 0；10 m 处 ≈ 恒等
//   7. 六个大气调试视图都真的出画（**读回屏幕像素**，不看 uniform）
//   8. BakeEnvironment 之后 scene.environment 非空
//   9. 稳态不再编译新程序（LUT pass 不许每帧建材质）
//
// 用法：node Taierzhuang1938/Script_AtmosphereTest.mjs [--shot]
// 退出码即成败。
// ===========================================================================

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";

/**
 * `--shot` 出 A/B 对照图（新物理天空 vs `?skyLegacy=1` 的旧解析天空）。
 * 数值全绿不等于画面对：LUT 可以每一项都在范围内，而地平线上有一条缝。
 * 出图落 `_shots/Atmosphere/`（已 gitignore），人工对照后才算验收。
 */
const wantShots = process.argv.includes("--shot");

/** 上半球辐照度的容差（任务书口径：曝光后亮度均值 ±15%）。 */
const IRRADIANCE_TOLERANCE = 0.15;
/** 单方向的容差。见抬头「三个阈值分别在守什么」。 */
const DIRECTION_TOLERANCE = 0.40;
/** 上半球均色的 ΔE 上限（sRGB 域欧氏距离，不是 CIE ΔE2000）。 */
const DELTA_E_LIMIT = 40;

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
    const renderer = P.renderer;
    const gl = renderer.getContext();
    const { SKY_PRESETS, MakeSkyProbe, HalfToFloat } = await import("./Script_Sky.mjs");
    const { GetActiveAtmosphere, ATMOSPHERE_EARTH } = await import("./Script_Atmosphere.mjs");
    const out = { presets: [] };
    const atmosphere = GetActiveAtmosphere();
    out.hasAtmosphere = !!atmosphere;
    if (!atmosphere) return out;

    const ReadLut = (target) => {
      const raw = new Uint16Array(target.width * target.height * 4);
      renderer.readRenderTargetPixels(target, 0, 0, target.width, target.height, raw);
      const rgba = new Float32Array(raw.length);
      for (let i = 0; i < raw.length; i += 1) rgba[i] = HalfToFloat(raw[i]);
      return { width: target.width, height: target.height, rgba };
    };
    const Stats = (lut) => {
      let min = Infinity; let max = -Infinity; let sum = 0; let bad = 0;
      const n = lut.width * lut.height;
      for (let i = 0; i < n; i += 1) {
        for (let c = 0; c < 3; c += 1) {
          const v = lut.rgba[i * 4 + c];
          if (!Number.isFinite(v)) { bad += 1; continue; }
          min = Math.min(min, v); max = Math.max(max, v); sum += v;
        }
      }
      return { min, max, mean: sum / (n * 3), bad, texels: n };
    };
    const Texel = (lut, x, y) => {
      const i = ((y | 0) * lut.width + (x | 0)) * 4;
      return [lut.rgba[i], lut.rgba[i + 1], lut.rgba[i + 2], lut.rgba[i + 3]];
    };

    P.state.elapsed = 0;
    P.post.frame = 0;
    P.post.hasTaaHistory = false;
    P.post.hasPrev = false;
    P.StepFrames(6, 1 / 60);

    // --- 2) 四张 LUT --------------------------------------------------------
    const trans = ReadLut(atmosphere.transTarget);
    const multi = ReadLut(atmosphere.multiTarget);
    const skyView = ReadLut(atmosphere.skyViewTarget);
    const aerialLut = ReadLut(atmosphere.aerialTarget);
    out.luts = {
      trans: { ...Stats(trans), size: [trans.width, trans.height] },
      multi: { ...Stats(multi), size: [multi.width, multi.height] },
      skyView: { ...Stats(skyView), size: [skyView.width, skyView.height] },
      aerial: { ...Stats(aerialLut), size: [aerialLut.width, aerialLut.height] },
    };
    out.luts.trans.inRange = (() => {
      for (let i = 0; i < trans.width * trans.height; i += 1) {
        for (let c = 0; c < 3; c += 1) {
          const v = trans.rgba[i * 4 + c];
          if (!(v >= -1e-4 && v <= 1.0001)) return false;
        }
      }
      return true;
    })();
    // 透过率 LUT 按 (r, μ) 取样：这里是 GLSL 里 AtmoTransUv 的 JS 镜像。
    // **不能直接按纹素下标取**：u 是「到大气顶的距离」映射，不是天顶角，
    // 最右一列是掠地平线的 1132 km 光路，透过率本来就是 0。
    const BOTTOM = ATMOSPHERE_EARTH.bottomRadiusKm;
    const TOP = ATMOSPHERE_EARTH.topRadiusKm;
    const TransAt = (elevationDeg) => {
      const r = BOTTOM + ATMOSPHERE_EARTH.siteAltitudeKm;
      const mu = Math.sin(elevationDeg * Math.PI / 180);
      const H = Math.sqrt(TOP * TOP - BOTTOM * BOTTOM);
      const rho = Math.sqrt(Math.max(r * r - BOTTOM * BOTTOM, 0));
      const disc = r * r * (mu * mu - 1) + TOP * TOP;
      const d = Math.max(0, -r * mu + Math.sqrt(Math.max(disc, 0)));
      const u = Math.min(1, Math.max(0, (d - (TOP - r)) / Math.max(rho + H - (TOP - r), 1e-6)));
      const v = Math.min(1, Math.max(0, rho / H));
      return Texel(trans,
        Math.min(trans.width - 1, Math.round(u * trans.width - 0.5)),
        Math.min(trans.height - 1, Math.round(v * trans.height - 0.5)));
    };
    out.luts.trans.zenith = TransAt(90);
    out.luts.trans.low = TransAt(6);

    // --- 3) 逐预设：新旧天空对照 -------------------------------------------
    const probe = MakeSkyProbe(renderer, P.sky.uniforms, { width: 128, height: 64 });
    const ACES_IN = [[0.59719, 0.35458, 0.04823], [0.07600, 0.90834, 0.01566], [0.02840, 0.13383, 0.83777]];
    const ACES_OUT = [[1.60475, -0.53108, -0.07367], [-0.10208, 1.10813, -0.00605], [-0.00327, -0.07276, 1.07602]];
    const Mul3 = (m, v) => [0, 1, 2].map((i) => m[i][0] * v[0] + m[i][1] * v[1] + m[i][2] * v[2]);
    const Aces = (color) => {
      const v = Mul3(ACES_IN, color);
      const t = [0, 1, 2].map((i) => (v[i] * (v[i] + 0.0245786) - 0.000090537)
        / (v[i] * (0.983729 * v[i] + 0.4329510) + 0.238081));
      return Mul3(ACES_OUT, t).map((x) => Math.min(1, Math.max(0, x)));
    };
    const Srgb = (c) => c.map((x) => (x <= 0.0031308 ? x * 12.92
      : 1.055 * Math.pow(Math.max(x, 1e-5), 1 / 2.4) - 0.055) * 255);
    const Exposed = (color, exposure) => Srgb(Aces(color.map((c) => Math.max(c, 0) * exposure)));
    const Luma = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    const DeltaE = (a, b) => Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);

    /** 上半球余弦加权均值 ∝ 水平面接收到的天空辐照度（= IBL 的量级）。 */
    const HemisphereMean = (buffer) => {
      const sum = [0, 0, 0];
      let weightSum = 0;
      for (let y = 0; y < probe.height; y += 1) {
        const lat = ((y + 0.5) / probe.height - 0.5) * Math.PI;
        if (lat <= 0) continue;
        const weight = Math.cos(lat) * Math.sin(lat);
        for (let x = 0; x < probe.width; x += 1) {
          const i = (y * probe.width + x) * 3;
          sum[0] += buffer[i] * weight;
          sum[1] += buffer[i + 1] * weight;
          sum[2] += buffer[i + 2] * weight;
          weightSum += weight;
        }
      }
      return sum.map((v) => v / Math.max(weightSum, 1e-6));
    };

    const names = ["testSceneDay", "whiteboxDay", "editorClear", "dusk", "smokyDay",
      "chuchuanDay", "overcast", "burningStreet", "night", "dawn"];
    const enabledUniform = atmosphere.sampleUniforms.uAtmoEnabled;
    const enabledWas = enabledUniform.value;
    for (const name of names) {
      const preset = SKY_PRESETS[name];
      P.sky.Apply(name);
      P.lights.ApplyPreset(preset, P.sky.sunDirection);
      P.StepFrames(2, 1 / 60);
      const directions = [
        { id: "zenith", elevation: 88, azimuth: preset.sunAzimuth, group: "zenith" },
        { id: "horizonSun", elevation: 3, azimuth: preset.sunAzimuth, group: "horizon" },
        { id: "horizonOpp", elevation: 3, azimuth: preset.sunAzimuth + 180, group: "horizon" },
        { id: "horizonL", elevation: 3, azimuth: preset.sunAzimuth + 90, group: "horizon" },
        { id: "horizonR", elevation: 3, azimuth: preset.sunAzimuth - 90, group: "horizon" },
        { id: "sunSide30", elevation: Math.min(preset.sunElevation + 30, 85), azimuth: preset.sunAzimuth, group: "sunSide" },
      ];
      const Sweep = (enabled) => {
        enabledUniform.value = enabled;
        const buffer = probe.Render(0);
        return {
          dirs: directions.map((d) => probe.Sample(d.elevation, d.azimuth)),
          hemi: HemisphereMean(buffer),
        };
      };
      const physical = Sweep(1);
      const legacy = Sweep(0);
      enabledUniform.value = 1;

      // 星：只有含星的档才量（天穹本体那一趟才画星，sunDiskGain 必须为 1）
      let starPeak = 0;
      if (preset.stars > 0.01) {
        const withStars = probe.Render(1);
        let peak = 0; let base = 0; let count = 0;
        for (let y = probe.height >> 1; y < probe.height; y += 1) {
          for (let x = 0; x < probe.width; x += 1) {
            const i = (y * probe.width + x) * 3;
            const l = 0.2126 * withStars[i] + 0.7152 * withStars[i + 1] + 0.0722 * withStars[i + 2];
            peak = Math.max(peak, l); base += l; count += 1;
          }
        }
        starPeak = peak / Math.max(base / Math.max(count, 1), 1e-9);
      }

      const rows = directions.map((d, i) => {
        const newExposed = Exposed(physical.dirs[i], preset.exposure);
        const oldExposed = Exposed(legacy.dirs[i], preset.exposure);
        return {
          id: d.id, group: d.group,
          ratio: Luma(newExposed) / Math.max(Luma(oldExposed), 1e-3),
          newSrgb: newExposed.map((v) => Math.round(v)),
          oldSrgb: oldExposed.map((v) => Math.round(v)),
        };
      });
      const groupRatio = {};
      for (const g of ["zenith", "horizon", "sunSide"]) {
        const picked = rows.filter((r) => r.group === g);
        groupRatio[g] = picked.reduce((sum, r) => sum + r.ratio, 0) / picked.length;
      }
      const hemiNew = Exposed(physical.hemi, preset.exposure);
      const hemiOld = Exposed(legacy.hemi, preset.exposure);

      // --- 5/6) 大气透视：froxel 中心列 -----------------------------------
      const apLut = ReadLut(atmosphere.aerialTarget);
      const T = atmosphere.tier;
      const farM = atmosphere.aerialUniforms.uAtmoAerialFarM.value;
      const ApAt = (distance) => {
        const t = Math.sqrt(Math.min(1, Math.max(0, distance / farM)));
        const slice = Math.min(T.ap[2] - 1, Math.max(0, Math.round(t * T.ap[2] - 0.5)));
        return Texel(apLut, slice * T.ap[0] + (T.ap[0] >> 1), T.ap[1] >> 1);
      };
      const ap10 = ApAt(10);
      const ap70 = ApAt(70);
      const ap500 = ApAt(500);
      const fog = preset.fog || {};
      const LegacyFogT = (distance) => {
        if (!(fog.density > 0)) return 1;
        const fd = 1 - Math.exp(-distance * fog.density);
        const hFall = Math.exp(-Math.max(1.68, 0) / Math.max(fog.falloff ?? 18, 0.5));
        return 1 - Math.min(fd * hFall, fog.max ?? 0.94);
      };
      const aerialMode = atmosphere.aerialUniforms.uAtmoAerialMode.value;

      out.presets.push({
        name,
        exposure: preset.exposure,
        rows,
        groupRatio,
        hemi: {
          ratio: Luma(hemiNew) / Math.max(Luma(hemiOld), 1e-3),
          deltaE: DeltaE(hemiNew, hemiOld),
          newSrgb: hemiNew.map((v) => Math.round(v)),
          oldSrgb: hemiOld.map((v) => Math.round(v)),
          newLinear: physical.hemi.map((v) => Number(v.toFixed(5))),
        },
        starPeak,
        aerialMode,
        aerial: {
          t10: ap10[3], t70: ap70[3], t500: ap500[3],
          s10: ap10[0] + ap10[1] + ap10[2],
          s500: ap500[0] + ap500[1] + ap500[2],
        },
        // 出厂档（aerialMode = 0）里消光完全由美术雾决定，最终透过率与今天
        // **逐米相同**；这里同时报物理层自己的 70 m 透过率作为余量。
        fogT70Legacy: LegacyFogT(70),
        fogT70Shipped: aerialMode > 0.5 ? ap70[3] : LegacyFogT(70),
        physicalSun: P.sky.physicalSun,
        authoredSun: { colorHex: preset.lightColor, intensity: preset.lightIntensity },
      });
    }
    probe.Dispose();
    enabledUniform.value = enabledWas;

    // --- 6.5) 六个调试视图必须**读回像素**验证 ------------------------------
    // GLSL ES 3.00 保留字撞上的话 three 只在控制台留一行，那一趟什么都不画，
    // 屏幕上留着上一次 clear 的颜色 —— 「面板亮着、画面没变」是最难往着色器上想的
    // 一类 bug（Script_Post 的 FRAG_DEBUG_VIEW 用 sample 那次就是这么漏过去的）。
    const ReadScreen = () => {
      const w = gl.drawingBufferWidth;
      const h = gl.drawingBufferHeight;
      const pixels = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      let sum = 0;
      let min = 255;
      let max = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        const luma = 0.2126 * pixels[i] + 0.7152 * pixels[i + 1] + 0.0722 * pixels[i + 2];
        sum += luma; min = Math.min(min, luma); max = Math.max(max, luma);
      }
      const count = pixels.length / 4;
      return { mean: sum / count, min, max };
    };
    const viewWas = P.post.GetDebugView();
    out.debugViews = {};
    for (const view of ["atmoTransmittance", "atmoMultiScatter", "atmoSkyView",
      "atmoAerialLut", "aerialScatter", "aerialTransmittance"]) {
      P.post.SetDebugView(view);
      P.StepFrames(2, 1 / 60);
      // 「不可用」的暗红斜纹不能靠数像素认（透过率 LUT 本身就有一大片纯红区）——
      // 直接问 pass 自己这一帧判成了什么。
      const source = P.post._GetDebugSource();
      out.debugViews[view] = {
        ...ReadScreen(),
        unavailable: !!(source?.unavailable || (!source?.texture && !source?.material)),
      };
    }
    P.post.SetDebugView(viewWas);
    P.StepFrames(2, 1 / 60);

    // --- 7) IBL 还烘得出来 ---------------------------------------------------
    P.sky.Apply("smokyDay");
    P.lights.ApplyPreset(SKY_PRESETS.smokyDay, P.sky.sunDirection);
    const envTexture = P.sky.BakeEnvironment(P.scene);
    out.environment = { baked: !!envTexture, onScene: !!P.scene.environment };
    P.StepFrames(4, 1 / 60);

    // --- 8) 稳态不再编译新程序 ----------------------------------------------
    P.StepFrames(10, 1 / 60);
    const before = renderer.info.programs.length;
    P.StepFrames(60, 1 / 60);
    out.programs = { before, after: renderer.info.programs.length };
    out.glError = gl.getError();
    out.passOrder = P.post.passes.map((pass) => pass.name);
    return out;
  });
} catch (error) {
  problems.push(`THROW ${String(error).slice(0, 500)}`);
}

// --- A/B 出图（`--shot`）--------------------------------------------------
const shots = [];
const shotProblems = [];
if (wantShots && result) {
  const outDir = path.join(projectDir, "_shots", "Atmosphere");
  fs.mkdirSync(outDir, { recursive: true });
  const shotPage = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const Snap = async (name) => {
    const file = path.join(outDir, `${name}.png`);
    await shotPage.screenshot({ path: file });
    shots.push(file);
    console.log(`shot ${name.padEnd(34)} ${file}`);
  };
  try {
    // 五个时段的街景探针：新 vs 旧，同一机位同一帧序，可以逐像素比。
    for (const preset of ["dusk", "smokyDay", "burningStreet", "night", "dawn"]) {
      for (const [tag, legacy] of [["new", ""], ["legacy", "&skyLegacy=1"]]) {
        await shotPage.goto(
          `http://127.0.0.1:${port}/Taierzhuang1938/Probe.html?quality=high&preset=${preset}&scene=street&gi=0${legacy}`,
          { waitUntil: "load", timeout: 180000 });
        await shotPage.waitForFunction(() => window.Probe?.state?.ready, null, { timeout: 240000 });
        await shotPage.evaluate(() => {
          window.Probe.state.elapsed = 0;
          window.Probe.post.frame = 0;
          window.Probe.StepFrames(90, 1 / 60);
        });
        await shotPage.waitForTimeout(400);
        await Snap(`Probe_Street_${preset}_${tag}`);
      }
    }
    // 远景两张：正片第一关的户外切片（地形一路铺到 2.9 km），
    // 大气透视只有在这种视距上才看得出来 —— 探针街景只有 120 m。
    for (const [tag, legacy] of [["new", ""], ["legacy", "&skyLegacy=1"]]) {
      await shotPage.goto(
        `http://127.0.0.1:${port}/Taierzhuang1938/?shot=1&phase=1&quality=high&scale=medium${legacy}`,
        { waitUntil: "load", timeout: 300000 });
      await shotPage.waitForFunction(() => window.Taierzhuang?.state?.ready, null, { timeout: 420000 });
      for (const [id, yaw] of [["A", 0], ["B", Math.PI / 2]]) {
        await shotPage.evaluate((turn) => {
          const game = window.Taierzhuang;
          game.player.pitch = 0.02;
          game.player.yaw = turn;
          game.player.aimYaw = 0;
          game.player.aimPitch = 0;
          game.player.health = 100;
          game.player.bleeding = 0;
          if (game.ai) for (const soldier of game.ai.soldiers) soldier.coolUntil = 1e9;
          game.StepFrames(48);
        }, yaw);
        await shotPage.waitForTimeout(400);
        await Snap(`Aerial_CH1_${id}_${tag}`);
      }
    }
  } catch (error) {
    shotProblems.push(`SHOT ${String(error).slice(0, 300)}`);
  }
  await shotPage.close();
}

await browser.close();
server.close();

const checks = [];
function Check(name, ok, detail = "") { checks.push({ name, ok: !!ok, detail }); }

if (!result || !result.hasAtmosphere) {
  Check("页面取证成功且大气已登记", false, problems.join(" | ") || JSON.stringify(result));
} else {
  Check("帧图里有 atmosphere pass 且排在最前",
    result.passOrder[0] === "atmosphere", JSON.stringify(result.passOrder));

  const L = result.luts;
  for (const [key, label] of [["trans", "透过率"], ["multi", "多次散射"],
    ["skyView", "天空视图"], ["aerial", "大气透视"]]) {
    Check(`${label} LUT 非空且有限（${L[key].size.join("×")}）`,
      L[key].bad === 0 && Number.isFinite(L[key].max) && L[key].max > 1e-5,
      JSON.stringify(L[key]));
  }
  Check("透过率 LUT 全部落在 [0,1]", L.trans.inRange, JSON.stringify(L.trans.inRange));
  const zenithT = L.trans.zenith;
  const lowT = L.trans.low;
  Check("地面处天顶方向透过率 > 6° 仰角方向",
    zenithT[1] > lowT[1] * 1.2 && zenithT[1] > 0.5,
    `zenith=${zenithT.slice(0, 3).map((v) => v.toFixed(4))} low=${lowT.slice(0, 3).map((v) => v.toFixed(4))}`);
  Check("低仰角的透过率偏红（瑞利 λ⁻⁴ 的直接证据）",
    lowT[0] > lowT[2] * 1.5,
    `R=${lowT[0].toFixed(5)} G=${lowT[1].toFixed(5)} B=${lowT[2].toFixed(5)}`);

  console.log("\n预设标定表（曝光后 sRGB；ratio = 新/旧亮度比）");
  console.log("preset          辐照度比 ΔE   均色新/旧            天顶   地平线  太阳侧");
  for (const preset of result.presets) {
    console.log(`${preset.name.padEnd(15)} ${preset.hemi.ratio.toFixed(3).padStart(7)} `
      + `${preset.hemi.deltaE.toFixed(0).padStart(4)}   `
      + `${String(preset.hemi.newSrgb.join(",")).padEnd(12)} ${String(preset.hemi.oldSrgb.join(",")).padEnd(12)} `
      + `${preset.groupRatio.zenith.toFixed(3).padStart(5)}  ${preset.groupRatio.horizon.toFixed(3).padStart(6)}  `
      + `${preset.groupRatio.sunSide.toFixed(3).padStart(6)}`);
  }
  console.log("");

  const hemiOffenders = result.presets
    .filter((p) => Math.abs(p.hemi.ratio - 1) > IRRADIANCE_TOLERANCE)
    .map((p) => `${p.name}=${p.hemi.ratio.toFixed(3)}`);
  Check(`每预设上半球辐照度比在 ±${Math.round(IRRADIANCE_TOLERANCE * 100)}%（IBL 量级 = 画面明暗）`,
    hemiOffenders.length === 0, hemiOffenders.join(" "));
  const dirOffenders = [];
  for (const preset of result.presets) {
    for (const [group, ratio] of Object.entries(preset.groupRatio)) {
      if (Math.abs(ratio - 1) > DIRECTION_TOLERANCE) dirOffenders.push(`${preset.name}/${group}=${ratio.toFixed(3)}`);
    }
  }
  Check(`天顶 / 地平线 / 太阳侧亮度比在 ±${Math.round(DIRECTION_TOLERANCE * 100)}%`,
    dirOffenders.length === 0, dirOffenders.join(" "));
  const hueOffenders = result.presets.filter((p) => p.hemi.deltaE > DELTA_E_LIMIT)
    .map((p) => `${p.name}=ΔE${p.hemi.deltaE.toFixed(0)}`);
  Check(`上半球均色 ΔE < ${DELTA_E_LIMIT}`, hueOffenders.length === 0, hueOffenders.join(" "));

  const night = result.presets.find((p) => p.name === "night");
  const day = result.presets.find((p) => p.name === "smokyDay");
  const nightLinear = night ? 0.2126 * night.hemi.newLinear[0] + 0.7152 * night.hemi.newLinear[1]
    + 0.0722 * night.hemi.newLinear[2] : 0;
  const dayLinear = day ? 0.2126 * day.hemi.newLinear[0] + 0.7152 * day.hemi.newLinear[1]
    + 0.0722 * day.hemi.newLinear[2] : 1;
  // 夜战关的天在**线性域**比白天暗一个数量级以上（实测 1/27）；屏幕上它看着
  // 不算特别黑是因为那一档的 exposure 是 3.6 —— 那是美术意图，不归大气管。
  Check("night 的天在线性域比白天暗一个数量级以上",
    nightLinear > 0 && nightLinear < dayLinear / 20,
    `night=${nightLinear.toExponential(2)} smokyDay=${dayLinear.toExponential(2)} 比=1/${(dayLinear / Math.max(nightLinear, 1e-9)).toFixed(0)}`);
  Check("night 有星（半球峰值亮度 > 均值的 3 倍）",
    night && night.starPeak > 3, `starPeak=${night?.starPeak?.toFixed(2)}`);

  const fogOffenders = result.presets
    .filter((p) => p.fogT70Shipped < p.fogT70Legacy - 1e-4)
    .map((p) => `${p.name}: ${p.fogT70Shipped.toFixed(4)} < ${p.fogT70Legacy.toFixed(4)}`);
  Check("70 m 透过率 ≥ 旧解析雾（用户定论「先别动雾」）",
    fogOffenders.length === 0, fogOffenders.join(" | "));

  const apNear = result.presets.filter((p) => p.aerial.t10 < 0.97 || p.aerial.s10 > 0.5)
    .map((p) => `${p.name}: T=${p.aerial.t10.toFixed(4)} S=${p.aerial.s10.toFixed(3)}`);
  Check("大气透视在 10 m 处≈恒等", apNear.length === 0, apNear.join(" | "));
  const apFar = result.presets.filter((p) => !(p.aerial.t500 < 1 && p.aerial.s500 > 0))
    .map((p) => `${p.name}: T=${p.aerial.t500.toFixed(4)} S=${p.aerial.s500.toFixed(4)}`);
  Check("大气透视在 500 m 处透过率 < 1 且散射 > 0", apFar.length === 0, apFar.join(" | "));

  console.log("大气透视透过率（froxel 中心列）与物理平行光推荐值");
  console.log("preset          T@10m   T@70m   T@500m  旧雾T@70m | 物理光色/强度      现值");
  for (const p of result.presets) {
    const ps = p.physicalSun;
    console.log(`${p.name.padEnd(15)} ${p.aerial.t10.toFixed(4)}  ${p.aerial.t70.toFixed(4)}  `
      + `${p.aerial.t500.toFixed(4)}  ${p.fogT70Legacy.toFixed(4)}    | `
      + `#${(ps?.colorHex ?? 0).toString(16).padStart(6, "0")} ${(ps?.intensity ?? 0).toFixed(2).padStart(6)}    `
      + `#${p.authoredSun.colorHex.toString(16).padStart(6, "0")} ${p.authoredSun.intensity.toFixed(2)}`);
  }
  console.log("");

  const viewOffenders = [];
  for (const [view, shot] of Object.entries(result.debugViews || {})) {
    // 三条一起才算「这张图真的画出来了」：不是全黑、有对比（不是一块纯色）、
    // 而且 pass 自己没把它判成「不可用」。
    if (!(shot.mean > 3 && shot.max - shot.min > 12 && !shot.unavailable)) {
      viewOffenders.push(`${view}=${JSON.stringify({
        mean: Number(shot.mean.toFixed(1)), min: Number(shot.min.toFixed(1)),
        max: Number(shot.max.toFixed(1)), unavailable: shot.unavailable })}`);
    }
  }
  Check("六个大气调试视图都真的出画（读回像素）",
    Object.keys(result.debugViews || {}).length === 6 && viewOffenders.length === 0,
    viewOffenders.join(" | "));

  Check("BakeEnvironment 之后 scene.environment 非空",
    result.environment.baked && result.environment.onScene, JSON.stringify(result.environment));
  Check("60 帧内不再编译新程序",
    result.programs.after === result.programs.before, JSON.stringify(result.programs));
  Check("无 GL 错误", result.glError === 0, `glError=${result.glError}`);
  Check("页面无控制台报错", problems.length === 0, problems.slice(0, 4).join(" | "));
  if (wantShots) {
    Check(`A/B 出图完成（${shots.length} 张）`, shotProblems.length === 0 && shots.length >= 12,
      shotProblems.join(" | ") || `shots=${shots.length}`);
  }
}

for (const check of checks) {
  console.log(`${check.ok ? "ok  " : "FAIL"} ${check.name}${check.ok ? "" : `  ${check.detail}`}`);
}
const failed = checks.filter((check) => !check.ok);
console.log(failed.length ? `\n${failed.length} 条失败` : "\n物理大气契约全绿");
if (failed.length) process.exit(1);
