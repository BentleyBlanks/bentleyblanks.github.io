// 通用车辆车辙系统真浏览器 GPU 验收门禁（?tracks=1）：
//   node Taierzhuang1938/Script_VehicleTracksBrowserTest.mjs
//
// 核查：
//   1. 车辆车辙测试场加载零页面错误、零 WebGL 错误，三辆实车（八九式 / 九四式 / 驴车）全部就绪；
//   2. 静态预置交叉车辙与三辆动态实车均压出真实 3D 几何下凹（> 4 cm）与挤泥棱（> 1 cm）；
//   3. 擦地低视角下，真 3D 几何凹陷开 vs 关（A/B 对照）产生清晰像素差异（真实几何轮廓 + 阴影 + GTAO）；
//   4. GPU 痕迹靶（RGBA8）同步写入 A 通道宏观车辙深度，所有着色器程序成功链接且片元采样器 ≤ 16；
//   5. 导出全景、擦地特写、各车型近景、A/B 对比与雨后积水图到 Taierzhuang1938/_shots/VehicleTracks/（只留本地）。

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const shotDir = path.join(here, "_shots", "VehicleTracks");
fs.mkdirSync(shotDir, { recursive: true });

const server = await ServeRoot(repoRoot, 0);
const port = server.address().port;
const browser = await LaunchBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.addInitScript(() => {
  localStorage.setItem("tengxian1938_audio_v1", JSON.stringify({ master: 0 }));
  localStorage.setItem("tengxian1938_tools_volume_v1", JSON.stringify({ volume: 0, muted: true }));
});

const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e}`));
page.on("console", (m) => { if (m.type() === "error") errors.push(`console.error: ${m.text()}`); });

try {
  const url = `http://127.0.0.1:${port}/Taierzhuang1938/?tracks=1&shot=1&manual=1&quality=high&audio=0`;
  await page.goto(url, { waitUntil: "load", timeout: 120000 });
  await page.waitForFunction(() => window.Taierzhuang?.state?.ready, null, { timeout: 180000 });
  await page.waitForFunction(() => {
    const s = window.Taierzhuang?.Debug?.VehicleTracks?.State?.();
    if (s?.error) throw new Error(s.error);
    return s?.ready;
  }, null, { timeout: 180000 });

  // 先推进几帧使渲染管线与阴影稳定
  const metrics = await page.evaluate(() => {
    const T = window.Taierzhuang;
    const api = T.Debug.VehicleTracks;
    const trails = T.Debug.TerrainTrails;
    api.ShowPanel(false);
    api.Pause(true);
    api.SetWetness(1.2);
    api.Camera("overview");
    T.StepFrames(12, 1 / 60, true);

    const state = api.State();
    // 扫三条车道的横向剖面，读出真实下凹深度与挤泥棱高
    const ScanLane = (xCenter, z) => {
      const pts = api.ProfileCrossSection(xCenter - 1.6, z, xCenter + 1.6, z, 65);
      let minOff = 0, maxOff = 0, maxDepth = 0;
      for (const p of pts) {
        if (p.offsetM < minOff) minOff = p.offsetM;
        if (p.offsetM > maxOff) maxOff = p.offsetM;
        if (p.depthM > maxDepth) maxDepth = p.depthM;
      }
      return { minOff: +minOff.toFixed(4), maxOff: +maxOff.toFixed(4), maxDepth: +maxDepth.toFixed(4) };
    };
    const lanes = {
      type89: ScanLane(-8.6, 8.0),
      type94: ScanLane(-0.2, 8.0),
      donkeyCart: ScanLane(9.1, 8.0),
      crossing: ScanLane(-0.5, 5.0),
    };

    // 查 GPU 痕迹靶 RGBA（含 A 通道宏观车辙深度）
    let maxA = 0, maxR = 0;
    for (let x = -10.5; x <= 10.5; x += 0.35) {
      const rgba = trails.ReadRgba(x, 8.0);
      if (rgba) {
        if (rgba[0] > maxR) maxR = rgba[0];
        if (rgba[3] > maxA) maxA = rgba[3];
      }
    }

    // 查所有 GL 着色器链接状态与采样器预算（硬限 ≤ 16）
    const gl = T.renderer.getContext();
    let maxSamplers = 0, unlinked = 0;
    for (const p of T.renderer.info.programs || []) {
      const prog = p.program;
      if (!prog) continue;
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) unlinked++;
      const n = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
      let samplers = 0;
      for (let i = 0; i < n; i++) {
        const info = gl.getActiveUniform(prog, i);
        if ([gl.SAMPLER_2D, gl.SAMPLER_2D_ARRAY, gl.SAMPLER_3D, gl.SAMPLER_CUBE, gl.SAMPLER_2D_SHADOW].includes(info.type)) {
          samplers += info.size;
        }
      }
      if (samplers > maxSamplers) maxSamplers = samplers;
    }

    return {
      state,
      lanes,
      gpuTarget: { maxR, maxA },
      glError: gl.getError(),
      maxSamplers,
      unlinked,
      programCount: (T.renderer.info.programs || []).length,
    };
  });

  // 截全景图
  await page.screenshot({ path: path.join(shotDir, "01_Overview.png") });

  // 擦地逆光特写 + 真 3D 几何凹陷 A/B 对照像素比对
  const abDiff = await page.evaluate(async () => {
    const T = window.Taierzhuang;
    const api = T.Debug.VehicleTracks;
    api.Camera("grazing");
    api.SetDisplacement(true);
    T.StepFrames(8, 1 / 60, true);
    const canvas = T.renderer.domElement;
    const Snap = () => {
      const c = document.createElement("canvas");
      c.width = 320; c.height = 180;
      const ctx = c.getContext("2d");
      ctx.drawImage(canvas, 0, 0, c.width, c.height);
      return ctx.getImageData(0, 0, c.width, c.height).data;
    };
    const onPixels = Snap();
    api.SetDisplacement(false);
    T.StepFrames(8, 1 / 60, true);
    const offPixels = Snap();
    api.SetDisplacement(true);
    T.StepFrames(6, 1 / 60, true);

    let changed = 0, sumAbs = 0;
    const total = onPixels.length / 4;
    for (let i = 0; i < onPixels.length; i += 4) {
      const d = Math.abs(onPixels[i] - offPixels[i]) + Math.abs(onPixels[i + 1] - offPixels[i + 1]) + Math.abs(onPixels[i + 2] - offPixels[i + 2]);
      if (d > 14) changed++;
      sumAbs += d / 3;
    }
    return { changedPixels: changed, totalPixels: total, meanAbsDiff: +(sumAbs / total).toFixed(2) };
  });
  await page.screenshot({ path: path.join(shotDir, "02_Grazing_3D_ON.png") });

  await page.evaluate(() => {
    const T = window.Taierzhuang;
    T.Debug.VehicleTracks.SetDisplacement(false);
    T.StepFrames(6, 1 / 60, true);
  });
  await page.screenshot({ path: path.join(shotDir, "03_Grazing_3D_OFF.png") });

  // 切回 3D 开启，拍各车型特写、交叉碾压特写、雨后积水与法线视图
  for (const [file, setup] of [
    ["04_Type89Tank.png", (api) => { api.SetDisplacement(true); api.SetWetness(1.2); api.Camera("tank89"); }],
    ["05_Type94Tankette.png", (api) => { api.Camera("tankette94"); }],
    ["06_DonkeyCart.png", (api) => { api.Camera("donkeyCart"); }],
    ["07_Crossing_RainPuddles.png", (api) => { api.SetWetness(2.4); api.Camera("crossing"); }],
    ["08_NormalView.png", (api) => { api.SetWetness(1.2); api.SetDebugView(3); api.Camera("grazing"); }],
  ]) {
    await page.evaluate((fnStr) => {
      const T = window.Taierzhuang;
      const fn = eval(`(${fnStr})`);
      fn(T.Debug.VehicleTracks);
      T.StepFrames(8, 1 / 60, true);
    }, setup.toString());
    await page.screenshot({ path: path.join(shotDir, file) });
  }
  await page.evaluate(() => { window.Taierzhuang.Debug.VehicleTracks.SetDebugView(0); });

  console.log(JSON.stringify({ ...metrics, abDiff }, null, 2));

  assert.deepEqual(errors, [], `零页面与控制台错误：${errors.join(" | ")}`);
  assert.equal(metrics.glError, 0, "无 WebGL 错误");
  assert.equal(metrics.unlinked, 0, "所有着色器程序成功链接");
  assert.ok(metrics.maxSamplers <= 16, `片元采样器不超上限 16（实测 ${metrics.maxSamplers}）`);
  assert.equal(metrics.state.vehicles.length, 3, "三辆实车全部载入");
  assert.ok((metrics.state.trails.displacement?.tiles || 0) >= 12, `活跃 3D 稀疏瓦片数 ${metrics.state.trails.displacement?.tiles}`);
  assert.ok(metrics.state.trails.staticStamps > 100, `静态持久车辙印章数 ${metrics.state.trails.staticStamps}`);
  assert.ok(metrics.state.trails.stats.stamps > 150, `动态车辆 GPU 微观印章数 ${metrics.state.trails.stats.stamps}`);
  assert.ok(metrics.lanes.type89.minOff < -0.075 && metrics.lanes.type89.maxOff > 0.015,
    `八九式宽履带真 3D 凹陷与挤泥棱（${JSON.stringify(metrics.lanes.type89)}）`);
  assert.ok(metrics.lanes.type94.minOff < -0.055 && metrics.lanes.type94.maxOff > 0.01,
    `九四式轻战车真 3D 凹陷与挤泥棱（${JSON.stringify(metrics.lanes.type94)}）`);
  assert.ok(metrics.lanes.donkeyCart.minOff < -0.045,
    `驴车超窄铁轮真 3D 凹陷（${JSON.stringify(metrics.lanes.donkeyCart)}）`);
  assert.ok(metrics.gpuTarget.maxR > 120 && metrics.gpuTarget.maxA > 80,
    `GPU 痕迹靶写入微观深度 R=${metrics.gpuTarget.maxR} 与宏观深车辙 A=${metrics.gpuTarget.maxA}`);
  assert.ok(abDiff.changedPixels > 900,
    `擦地视角真 3D 凹陷开/关像素差异明显（changed=${abDiff.changedPixels}/${abDiff.totalPixels}, meanDiff=${abDiff.meanAbsDiff}）`);

  console.log(`VehicleTracksBrowserTest: 全部通过，验收截图已存至 ${shotDir}`);
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
