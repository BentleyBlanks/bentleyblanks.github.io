// ===========================================================================
// Script_AtmosphereCalibrate.mjs —— 物理大气的每预设标定（真浏览器，真 GPU）
//
// 干什么：把 Hillaire 的物理天空**对齐到今天那套美术化解析天空**的曝光后亮度，
// 再把标定出来的几个数（mie / rayleigh / sunIrradiance / skyTint / skyFloor /
// aerialGain）写回 `SKY_PRESETS`。
//
// 为什么必须在浏览器里做：新旧两条天空是同一个着色器里的 uniform 分支
// （`SkyRadiance` 的 `uAtmoEnabled`），而且新的那条要读四张 GPU 上的 LUT。
// 在 Node 里照着算式重写一份 JS 近似，标定出来的是那份近似，不是屏幕上的天。
//
// ## 拟合怎么做的（一条关键观察省掉了 99% 的 GPU 往返）
// 天穹的最终辐射亮度对 `skyTint` 与 `skyFloor` 是**仿射**的：
//
//     sky = A · (LUT · tint + floor) + B
//
// 其中 A、B 是美术层（战场烟尘带、高空烟、地面反照）那几次 `mix()` 的系数与常数，
// 与 tint/floor 无关。所以每个 (mie, rayleigh) 组合只要探三次
// （tint=0/floor=0、tint=1/floor=0、tint=0/floor=1）就能把 A·LUT、A、B 全解出来，
// 之后整段拟合在 JS 里跑，零 GPU 往返。
//
// 于是流程是：
//   1. 关掉物理档，读旧天空在六个方向（天顶 / 四方位地平线 / 太阳侧 30°）的
//      线性辐射亮度当目标；
//   2. 网格搜 (Mie 倍率, 瑞利倍率) —— 这两个是仅有的**形状**参数：
//      Mie 管「天有多白、地平线相对天顶抬多少」，瑞利管「天顶有多蓝」；
//   3. 每个组合下先用线性最小二乘解出每通道的 (tint, floor)，
//      再在**曝光后**的域里做一维细化（ACES 是压缩曲线，线性域最优不等于曝光后最优）；
//   4. 打分 = {天顶 / 地平线四向均值 / 太阳侧} 三组曝光后亮度比的最大对数误差。
//      地平线四个方位算**一组**，否则拟合会为了地平线（六选四）牺牲天顶。
//
// 大气透视另标一个 `aerialGain`：物理散射色的**亮度**对齐今天的
// `fog.sky/fog.ground` 混色，色相留给物理。不这么做的话远景会整体亮一档或暗一档，
// 而用户对画面明暗极其敏感（历史事故：「画面为什么这么黑」）。
//
// 用法：
//   node Taierzhuang1938/Script_AtmosphereCalibrate.mjs             # 全部预设
//   node Taierzhuang1938/Script_AtmosphereCalibrate.mjs dusk dawn   # 只标这两档
//   node Taierzhuang1938/Script_AtmosphereCalibrate.mjs --coarse    # 粗网格（快）
// 输出是可以直接抄进 SKY_PRESETS 的 `atmosphere: {...}` 片段 + 一张误差表。
// **脚本不改源码**：改哪一档、抄不抄，人来定。
// ===========================================================================

import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";

const args = process.argv.slice(2);
const coarse = args.includes("--coarse");
const only = args.filter((a) => !a.startsWith("--"));

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(projectDir, "..");
const server = await ServeRoot(rootDir, 0);
const port = server.address().port;
const browser = await LaunchBrowser();
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });

const problems = [];
page.on("pageerror", (error) => problems.push(`PAGEERROR ${String(error).slice(0, 240)}`));
page.on("console", (message) => {
  if (message.type() === "error") problems.push(`CONSOLE ${message.text().slice(0, 240)}`);
});

let report = null;
try {
  await page.goto(
    `http://127.0.0.1:${port}/Taierzhuang1938/Probe.html?quality=high&preset=smokyDay&scene=street&gi=0`,
    { waitUntil: "load", timeout: 180000 },
  );
  await page.waitForFunction(() => window.Probe?.state?.ready, null, { timeout: 240000 });
  report = await page.evaluate(async ({ only: wanted, coarse: fast }) => {
    const P = window.Probe;
    const renderer = P.renderer;
    const { SKY_PRESETS, MakeSkyProbe, HalfToFloat } = await import("./Script_Sky.mjs");
    const { GetActiveAtmosphere, MakeAtmospherePreset } = await import("./Script_Atmosphere.mjs");
    const atmosphere = GetActiveAtmosphere();
    const probe = MakeSkyProbe(renderer, P.sky.uniforms, { width: 128, height: 64 });
    const U = atmosphere.sampleUniforms;

    const NAMES = ["testSceneDay", "whiteboxDay", "editorClear", "dusk", "smokyDay",
      "chuchuanDay", "overcast", "burningStreet", "night", "dawn"];
    const names = wanted.length ? NAMES.filter((n) => wanted.includes(n)) : NAMES;

    const MIE_GRID = fast ? [1.5, 3, 6, 12, 24] : [0.6, 1.0, 1.6, 2.4, 3.6, 5.4, 8, 12, 18, 26];
    const RAY_GRID = fast ? [0.7, 1.0, 1.3] : [0.7, 0.9, 1.1, 1.5, 2.0];
    // 地面反照是第三个形状参数：亮地面把光反回大气、经多次散射抬高**天顶**，
    // 于是天顶/地平线的比值被压平 —— 而手调的那几张天恰恰都是平的。
    // 鲁南三四月是干燥的黄土与麦茬地，0.2—0.55 都在实测范围内。
    const ALBEDO_GRID = fast ? [0.3] : [0.2, 0.35, 0.55];

    // --- 曝光后亮度（与 Script_PostComposite 同一条曲线）--------------------
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

    const Directions = (preset) => [
      { id: "zenith", elevation: 88, azimuth: preset.sunAzimuth, group: "zenith" },
      { id: "horizonSun", elevation: 3, azimuth: preset.sunAzimuth, group: "horizon" },
      { id: "horizonOpp", elevation: 3, azimuth: preset.sunAzimuth + 180, group: "horizon" },
      { id: "horizonL", elevation: 3, azimuth: preset.sunAzimuth + 90, group: "horizon" },
      { id: "horizonR", elevation: 3, azimuth: preset.sunAzimuth - 90, group: "horizon" },
      { id: "sunSide30", elevation: Math.min(preset.sunElevation + 30, 85), azimuth: preset.sunAzimuth, group: "sunSide" },
    ];

    /**
     * 探针读一趟（不含太阳盘）。tint/floor 是**采样端** uniform，不用重算 LUT。
     * 除了六个方向，另外算一份**上半球余弦加权均值** —— 它正比于水平面接收到的
     * 天空辐照度，也就是 PMREM 烘出来的那张 IBL 的量级。
     * 「画面整体明暗」由它决定，六个方向只决定"哪儿亮哪儿暗"。
     */
    const ProbeAll = (directions, tint, floor) => {
      U.uAtmoSkyTint.value.set(tint[0], tint[1], tint[2]);
      U.uAtmoSkyFloor.value.set(floor[0], floor[1], floor[2]);
      const buffer = probe.Render(0);
      const hemi = [0, 0, 0];
      let weightSum = 0;
      for (let y = 0; y < probe.height; y += 1) {
        const lat = ((y + 0.5) / probe.height - 0.5) * Math.PI;
        if (lat <= 0) continue;
        // dω = cos(lat)·dlat·dlon；水平面的余弦因子是 sin(lat)
        const weight = Math.cos(lat) * Math.sin(lat);
        for (let x = 0; x < probe.width; x += 1) {
          const i = (y * probe.width + x) * 3;
          hemi[0] += buffer[i] * weight;
          hemi[1] += buffer[i + 1] * weight;
          hemi[2] += buffer[i + 2] * weight;
          weightSum += weight;
        }
      }
      const dirs = directions.map((d) => probe.Sample(d.elevation, d.azimuth));
      return [...dirs, hemi.map((v) => v / Math.max(weightSum, 1e-6))];
    };

    const results = [];
    for (const name of names) {
      const preset = SKY_PRESETS[name];
      const base = MakeAtmospherePreset(preset.atmosphere);
      const directions = Directions(preset);
      P.sky.Apply(name);

      // --- 目标：旧解析天空 ----------------------------------------------
      U.uAtmoEnabled.value = 0;
      const target = ProbeAll(directions, [1, 1, 1], [0, 0, 0]);
      const targetExposed = target.map((c) => Exposed(c, preset.exposure));
      U.uAtmoEnabled.value = 1;
      // 六个方向 + 一条「上半球辐照度」。后者进 rows 的最后一格，编号 6。
      const HEMI = directions.length;

      const groups = ["irradiance", "zenith", "horizon", "sunSide"];
      const GroupIndex = Object.fromEntries(groups.map((g) => [g,
        g === "irradiance" ? [HEMI]
          : directions.map((d, i) => (d.group === g ? i : -1)).filter((i) => i >= 0)]));
      // 上半球辐照度是**主项**：它决定 PMREM 烘出来的 IBL 有多亮，
      // 也就是"画面整体明暗"——用户唯一真正敏感的那一维。
      // 天顶/地平线/太阳侧是次项：物理天空本来就会把能量从天顶挪到地平线，
      // 那正是这一轮买来的"结构"，逼它们逐项相等等于把物理模型退回旧模型。
      const GROUP_WEIGHT = { irradiance: 1.0, zenith: 0.45, horizon: 0.45, sunSide: 0.45 };
      /**
       * 打分。三项，权重是刻意拉开的：
       *   · 分组**亮度**比 —— 主项。任务书的硬指标，也是用户唯一敏感的那一维。
       *   · 色相 —— 次项（0.3 权）。物理天空本来就该比手调的更蓝、更有梯度，
       *     逼它逐通道等于旧值等于把物理模型退化成旧模型。
       *   · Mie 先验 —— 弱项（0.12 权）。不加的话拟合永远把 Mie 顶到网格上限：
       *     手调的天本来就偏平偏白，而"把天刷白"是 Mie 最省力的做法。
       *     每档的先验就是预设里写的那个 mie（晴＝低、硝烟＝高、阴天＝极高）。
       */
      const Score = (values, mie) => {
        let luminance = 0;
        let weighted = 0;
        const detail = {};
        for (const g of groups) {
          const idx = GroupIndex[g];
          const newL = idx.reduce((sum, i) => sum + Luma(Exposed(values[i], preset.exposure)), 0) / idx.length;
          const oldL = idx.reduce((sum, i) => sum + Luma(targetExposed[i]), 0) / idx.length;
          const err = Math.abs(Math.log(Math.max(newL, 1e-3) / Math.max(oldL, 1e-3)));
          detail[g] = { ratio: newL / Math.max(oldL, 1e-3), err };
          luminance = Math.max(luminance, err);
          weighted += GROUP_WEIGHT[g] * err;
        }
        let hue = 0;
        for (let i = 0; i < directions.length; i += 1) {
          const a = Exposed(values[i], preset.exposure);
          const b = targetExposed[i];
          const la = Math.max(Luma(a), 1);
          const lb = Math.max(Luma(b), 1);
          for (let c = 0; c < 3; c += 1) {
            hue += Math.abs(Math.log(Math.max(a[c] / la, 0.02) / Math.max(b[c] / lb, 0.02)));
          }
        }
        hue /= directions.length * 3;
        const prior = Math.abs(Math.log(mie / Math.max(base.mie, 0.1)));
        return { total: weighted + 0.25 * hue + 0.05 * prior, worst: luminance, hue, detail };
      };
      // 夜档的气辉底噪是物理模型给不出来的（气辉 + 星光），只有它开这个口子；
      // 白天档 floor 一律锁 0 —— 加性常数会把散射梯度整片冲平，
      // 而"天空有结构"正是这一轮要买的东西。
      // skyFloor：加在 LUT 采样上的常数。物理含义分两种 ——
      // 夜档是气辉 + 星光（模型本来就不含），白天档是"手调的天本来就比物理的平"
      // 的那一份补偿。**上限压在上半球均值的 25%**：再多就是把散射梯度冲平，
      // 而"天空有结构"正是这一轮要买的东西。
      const floorCap = 0.25;

      let best = null;
      for (const mie of MIE_GRID) {
        for (const rayleigh of RAY_GRID) {
        for (const groundAlbedo of ALBEDO_GRID) {
          atmosphere.ApplyPreset(MakeAtmospherePreset({ ...base, mie, rayleigh, groundAlbedo, sunIrradiance: 1 }),
            { sunDirection: P.sky.sunDirection, fog: preset.fog });
          const m0 = ProbeAll(directions, [0, 0, 0], [0, 0, 0]);            // B
          const m1 = ProbeAll(directions, [1, 1, 1], [0, 0, 0]);            // B + A·LUT
          const mf = ProbeAll(directions, [0, 0, 0], [1, 1, 1]);            // B + A
          const Model = (tint, floor) => m0.map((row, i) => [0, 1, 2].map((c) =>
            m0[i][c] + (m1[i][c] - m0[i][c]) * tint[c] + (mf[i][c] - m0[i][c]) * floor[c]));

          // 每通道一维最小二乘（floor 锁住时是良态的），再把色偏钳进一条窄带：
          // 允许 ±55% 的通道增益去保住"这一档该是暖的/冷的"，再多就是拿 tint
          // 把物理天空重新画成旧天空。
          const raw = [1, 1, 1];
          for (let c = 0; c < 3; c += 1) {
            let saa = 0;
            let say = 0;
            for (let i = 0; i < m0.length; i += 1) {
              const a = m1[i][c] - m0[i][c];
              saa += a * a;
              say += a * (target[i][c] - m0[i][c]);
            }
            raw[c] = saa > 1e-12 ? Math.max(say / saa, 1e-3) : 1;
          }
          const rawLevel = Math.cbrt(Math.max(raw[0] * raw[1] * raw[2], 1e-12));
          const shape = raw.map((r) => Math.min(Math.max(r / rawLevel, 0.55), 1.8));

          let localBest = null;
          for (let ai = 0; ai <= 16; ai += 1) {
            const a = rawLevel * 0.55 * Math.pow(1.09, ai);
            for (let bi = 0; bi <= 5; bi += 1) {
              const tint = shape.map((t) => t * a);
              // floor 上限 = 「本组合下上半球均值 × floorCap」，逐通道
              const floor = [0, 1, 2].map((c) =>
                (m1[HEMI][c] - m0[HEMI][c]) * a * floorCap * (bi / 5));
              const values = Model(tint, floor);
              const scored = Score(values, mie);
              if (!localBest || scored.total < localBest.total) {
                localBest = { ...scored, tint, floor, values };
              }
            }
          }
          if (!best || localBest.total < best.total) best = { ...localBest, mie, rayleigh, groundAlbedo };
        }
        }
      }

      // --- 定稿：把 tint 的量级折进 sunIrradiance（保留物理量纲的可读性）---
      const level = Math.cbrt(Math.max(best.tint[0] * best.tint[1] * best.tint[2], 1e-12));
      const sunIrradiance = level;   // 上面全部是按 sunIrradiance = 1 测的
      const skyTint = best.tint.map((t) => t / level);
      atmosphere.ApplyPreset(MakeAtmospherePreset({
        ...base, mie: best.mie, rayleigh: best.rayleigh, groundAlbedo: best.groundAlbedo,
        sunIrradiance, skyTint, skyFloor: best.floor, aerialGain: 1,
      }), { sunDirection: P.sky.sunDirection, fog: preset.fog });
      P.StepFrames(2, 1 / 60);

      // --- 大气透视：物理散射色的亮度对齐今天的雾色 -----------------------
      const lut = atmosphere.aerialTarget;
      const raw = new Uint16Array(lut.width * lut.height * 4);
      renderer.readRenderTargetPixels(lut, 0, 0, lut.width, lut.height, raw);
      const T = atmosphere.tier;
      const farM = atmosphere.aerialUniforms.uAtmoAerialFarM.value;
      const slice = Math.min(T.ap[2] - 1,
        Math.max(0, Math.round(Math.sqrt(300 / farM) * T.ap[2] - 0.5)));
      const idx = ((T.ap[1] >> 1) * lut.width + slice * T.ap[0] + (T.ap[0] >> 1)) * 4;
      const scatter = [0, 1, 2].map((c) => HalfToFloat(raw[idx + c]));
      const transmittance = HalfToFloat(raw[idx + 3]);
      const physicalFog = scatter.map((s) => s / Math.max(1 - transmittance, 1e-4));
      const fog = preset.fog || {};
      const authored = [0, 1, 2].map((c) => {
        const g = (fog.ground || [0.4, 0.4, 0.4])[c];
        const s = (fog.sky || [0.7, 0.7, 0.7])[c];
        return g + (s - g) * 0.35;
      });
      const aerialGain = Luma(authored) / Math.max(Luma(physicalFog), 1e-5);

      results.push({
        name, mie: best.mie, rayleigh: best.rayleigh, groundAlbedo: best.groundAlbedo,
        sunIrradiance, skyTint,
        skyFloor: best.floor, aerialGain, score: best.worst, detail: best.detail,
        perDir: directions.map((d, i) => ({
          id: d.id,
          newSrgb: Exposed(best.values[i], preset.exposure).map((v) => Math.round(v)),
          oldSrgb: targetExposed[i].map((v) => Math.round(v)),
        })),
        physicalFog, authoredFog: authored, transmittance300: transmittance,
      });
    }

    probe.Dispose();
    U.uAtmoEnabled.value = 1;
    P.sky.Apply("smokyDay");
    return { results };
  }, { only, coarse });
} catch (error) {
  problems.push(`THROW ${String(error).slice(0, 500)}`);
}

await browser.close();
server.close();

if (!report) {
  console.error("标定失败：", problems.join(" | "));
  process.exit(1);
}

const Round = (value, digits = 3) => Number(value.toFixed(digits));

console.log("\n=== 分组曝光后亮度比（1.00 = 与旧天空一致）===");
console.log("preset          mie   ray   alb   辐照度  zenith  horizon  sunSide  worst%");
for (const r of report.results) {
  console.log(`${r.name.padEnd(15)} ${String(r.mie).padStart(4)}  ${String(r.rayleigh).padStart(4)}  `
    + `${String(r.groundAlbedo).padStart(4)}  `
    + `${r.detail.irradiance.ratio.toFixed(3).padStart(6)}  `
    + `${r.detail.zenith.ratio.toFixed(3).padStart(6)}  ${r.detail.horizon.ratio.toFixed(3).padStart(7)}  `
    + `${r.detail.sunSide.ratio.toFixed(3).padStart(7)}  ${((Math.exp(r.score) - 1) * 100).toFixed(1).padStart(6)}`);
}

console.log("\n=== 逐方向曝光后 sRGB（新 / 旧）===");
for (const r of report.results) {
  console.log(`${r.name}`);
  for (const d of r.perDir) {
    console.log(`   ${d.id.padEnd(12)} ${String(d.newSrgb.join(",")).padEnd(16)} ${d.oldSrgb.join(",")}`);
  }
}

console.log("\n=== 大气透视雾色（300 m 水平视线，线性）===");
console.log("preset          物理散射色                今天的雾色                aerialGain  T@300m");
for (const r of report.results) {
  console.log(`${r.name.padEnd(15)} ${r.physicalFog.map((v) => v.toFixed(3)).join(",").padEnd(25)} `
    + `${r.authoredFog.map((v) => v.toFixed(3)).join(",").padEnd(25)} `
    + `${r.aerialGain.toFixed(3).padStart(10)}  ${r.transmittance300.toFixed(4)}`);
}

console.log("\n=== 抄进 SKY_PRESETS 的片段 ===");
for (const r of report.results) {
  const floor = r.skyFloor.some((v) => v > 1e-4)
    ? `, skyFloor: [${r.skyFloor.map((v) => Round(v, 4)).join(", ")}]` : "";
  console.log(`// ${r.name}  最大分组误差 ${((Math.exp(r.score) - 1) * 100).toFixed(1)}%`);
  console.log(`atmosphere: { mie: ${Round(r.mie, 2)}, rayleigh: ${Round(r.rayleigh, 2)}, `
    + `groundAlbedo: ${Round(r.groundAlbedo, 2)}, sunIrradiance: ${Round(r.sunIrradiance, 2)}, `
    + `skyTint: [${r.skyTint.map((v) => Round(v, 3)).join(", ")}]${floor}, `
    + `aerialGain: ${Round(r.aerialGain, 3)} },`);
}
if (problems.length) console.log("\n页面告警：", problems.slice(0, 6).join(" | "));
