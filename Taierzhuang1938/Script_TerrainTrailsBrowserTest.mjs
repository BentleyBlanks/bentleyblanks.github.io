// 地面脚印与痕迹的实机门禁（第一关真关卡、真 GLB 人物、真按 W）。口径 docs/Data_TerrainTrails.md §6。
//
//   node Taierzhuang1938/Script_TerrainTrailsBrowserTest.mjs [--quality=high] [--stage=7]
//
// 07（沿沟南行）：玩家在集结处按 W 走几秒 + 班组按任务自己走。查：
//   · 玩家按步距落印、左右交替，靶上读得到；班组的真实脚骨判出了落脚（rigs > 0）；
//   · 地形材质吃到了：同一帧开 / 关痕迹 pass，印子那块的像素真的变了（数像素，不看 visible 标志）；
//   · 所有程序链接、采样器 ≤ 16（砸坑变体腾出了 uCraterNormal）、无 GL 错误、无页面报错。
// 截图（只留本地）：_shots/TerrainTrails/ —— 回头看自己走过的路、调试视图 8（红坑深 绿泥边 蓝踩乱）。
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";

const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1] ?? fallback;
const QUALITY = arg("quality", "high"), STAGE = arg("stage", "7");
const here = path.dirname(fileURLToPath(import.meta.url)), output = path.join(here, "_shots", "TerrainTrails");
await fs.mkdir(output, { recursive: true });
const server = await ServeRoot(path.resolve(here, ".."), 0);
const browser = await LaunchBrowser(), page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on("pageerror", (error) => errors.push(String(error)));
page.on("console", (m) => {
  if (m.type() !== "error") return;
  if (/fonts\.(googleapis|gstatic)\.com/.test(m.location()?.url || "")) return;
  errors.push(m.text().slice(0, 300));
});
const receipt = {};
const Shot = async (name) => { await page.screenshot({ path: path.join(output, `${name}.png`) }); return name; };
try {
  await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/?whitebox=p012&shot=1&manual=1&missionStage=${STAGE}&quality=${QUALITY}&scale=small`,
    { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.waitForFunction(() => window.Tengxian?.state?.ready, null, { timeout: 300000 });
  await page.evaluate(() => { const g = window.Tengxian; g.player.debug.invincible = true; g.StepFrames(30, 1 / 60, false); });
  receipt.start = await page.evaluate(() => window.Tengxian.Debug.TerrainTrails.Describe());
  assert.ok(receipt.start.active, "第一关挂上了地面（AttachGround）：" + JSON.stringify(receipt.start));
  assert.equal(receipt.start.preset, QUALITY === "low" ? false : QUALITY, "画质档位的 terrainTrails");

  // 真按 W 走 4 s（班组同时按任务走）
  const start = await page.evaluate(() => { const p = window.Tengxian.player.position; return { x: p.x, z: p.z }; });
  await page.evaluate(() => window.Tengxian.Debug.Key("KeyW", true));
  await page.evaluate(() => window.Tengxian.StepFrames(240, 1 / 60, true));
  await page.evaluate(() => window.Tengxian.Debug.Key("KeyW", false));
  // 再让班组走一会儿（人物的落脚按渲染后的骨头判，必须渲染）
  await page.evaluate(() => window.Tengxian.StepFrames(360, 1 / 60, true));
  receipt.walk = await page.evaluate((start) => {
    const g = window.Tengxian, p = g.player.position, T = g.Debug.TerrainTrails;
    const d = T.Describe();
    const reads = [...d.recent, ...d.recentPlayer].map((r) => ({ ...r, texel: T.Read(r.x, r.z) }));
    return { moved: Math.hypot(p.x - start.x, p.z - start.z), describe: d, reads };
  }, start);
  const stats = receipt.walk.describe.stats;
  console.log(JSON.stringify({ moved: receipt.walk.moved, stats, pass: receipt.walk.describe.pass }, null, 1));
  assert.ok(receipt.walk.moved > 3, `玩家真的走了（${receipt.walk.moved.toFixed(2)} m）`);
  assert.ok(stats.player >= 3, `玩家落印（${stats.player}）`);
  assert.ok(stats.rigs > 0, `班组的真实脚骨判出落脚（${stats.rigs}）`);
  assert.ok(receipt.walk.describe.vehicles >= 1, "八九式登记成履带车辆（TrackVehicle）");
  const lit = receipt.walk.reads.filter((r) => r.texel && r.texel[0] + r.texel[2] > 40);
  assert.ok(lit.length >= Math.min(4, receipt.walk.reads.length), `最近的印在靶上读得到（${lit.length}/${receipt.walk.reads.length}）`);

  // 回头看走过的路：同一帧开 / 关痕迹 pass 数像素
  const view = await page.evaluate(() => {
    const g = window.Tengxian, d = g.Debug.TerrainTrails.Describe();
    const mine = d.recentPlayer;
    const last = mine.at(-1), first = mine[0];
    // 站到第一个印后面 1.2 m，顺着走过的路往前看（终点可能顶着墙）
    const dx = last.x - first.x, dz = last.z - first.z, n = Math.hypot(dx, dz) || 1;
    const px = first.x - dx / n * 1.2, pz = first.z - dz / n * 1.2;
    const P = g.Debug.FirstLevelMissionRuntime?.()?.Point?.({ x: px, z: pz }) || { x: px, y: g.battlefield.GroundHeight(px, pz), z: pz };
    g.player.position.set(P.x, P.y, P.z); g.player.body?.Teleport(P.x, P.y, P.z); g.player.velocity.set(0, 0, 0);
    g.player.yaw = Math.atan2(-dx / n, -dz / n); g.player.pitch = -0.55; g.player.SyncCamera?.(0);
    return { at: [P.x, P.z], prints: mine.length };
  });
  receipt.view = view;
  await page.evaluate(() => window.Tengxian.StepFrames(40, 1 / 60, true));
  await Shot(`Walk_${QUALITY}_on`);
  // 同一机位开 / 关痕迹 pass 各抓一帧（两边各推够帧让 TAA 历史收敛），比较「印子附近」与「全屏」的平均差：
  // 全屏里 TAA 抖动、烟尘、班组自己的脚印本来就有差（实测均差 3.5），自己脚印附近必须是它的两倍以上（数像素，不看 visible 标志）。
  const Capture = () => page.evaluate(() => {
    const g = window.Tengxian, gl = g.renderer.getContext(), w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    g.StepFrames(1, 0, true);
    const buf = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    const cam = g.camera, prints = g.Debug.TerrainTrails.Describe().recentPlayer.map((r) => {
      const p = cam.position.clone().set(r.x, g.battlefield.GroundHeight(r.x, r.z), r.z).project(cam);
      return [(p.x * 0.5 + 0.5) * w, (p.y * 0.5 + 0.5) * h, p.z];
    }).filter(([x, y, z]) => x > 8 && y > 8 && x < w - 8 && y < h - 8 && z < 1);
    return { w, h, data: Array.from(buf.filter((_, i) => i % 4 === 1)), prints };
  });
  const on = await Capture();
  await page.evaluate(() => { const g = window.Tengxian; g.post.preset.terrainTrails = false; g.StepFrames(40, 0, true); });
  await Shot(`Walk_${QUALITY}_off`);
  const off = await Capture();
  await page.evaluate((q) => { const g = window.Tengxian; g.post.preset.terrainTrails = q; g.StepFrames(40, 0, true); }, QUALITY);
  let all = 0, near = 0, nearN = 0;
  const radius = Math.round(on.h * 0.02);
  const mask = new Uint8Array(on.w * on.h);
  for (const [px, py] of on.prints) {
    for (let y = Math.max(0, Math.round(py) - radius); y <= Math.min(on.h - 1, Math.round(py) + radius); y++)
      for (let x = Math.max(0, Math.round(px) - radius); x <= Math.min(on.w - 1, Math.round(px) + radius); x++) mask[y * on.w + x] = 1;
  }
  for (let i = 0; i < on.data.length; i++) {
    const d = Math.abs(on.data[i] - off.data[i]);
    all += d;
    if (mask[i]) { near += d; nearN++; }
  }
  receipt.pixels = { prints: on.prints.length, nearMean: +(near / Math.max(1, nearN)).toFixed(2), allMean: +(all / on.data.length).toFixed(2) };
  console.log("pixels", JSON.stringify(receipt.pixels));
  assert.ok(on.prints.length >= 3, `画面里看得到至少 3 个自己的脚印（${on.prints.length}）`);
  assert.ok(receipt.pixels.nearMean > 4 && receipt.pixels.nearMean > 2 * receipt.pixels.allMean,
    `开 / 关痕迹：脚印附近的平均差 ${receipt.pixels.nearMean} 显著大于全屏 ${receipt.pixels.allMean}（印子真的画出来了）`);

  // 调试视图 8
  await page.evaluate(async () => {
    const { TERRAIN_DEBUG_UNIFORM } = await import("./Script_TerrainMaterial.mjs");
    TERRAIN_DEBUG_UNIFORM.value = 8; window.Tengxian.StepFrames(20, 0, true);
  });
  await Shot(`Walk_${QUALITY}_debug8`);
  await page.evaluate(async () => {
    const { TERRAIN_DEBUG_UNIFORM } = await import("./Script_TerrainMaterial.mjs");
    TERRAIN_DEBUG_UNIFORM.value = 0; window.Tengxian.StepFrames(2, 0, true);
  });

  // 程序与采样器
  receipt.programs = await page.evaluate(() => {
    const g = window.Tengxian, gl = g.renderer.getContext();
    const SAMPLERS = new Set([gl.SAMPLER_2D, gl.SAMPLER_3D, gl.SAMPLER_CUBE, gl.SAMPLER_2D_SHADOW, gl.SAMPLER_2D_ARRAY,
      gl.SAMPLER_2D_ARRAY_SHADOW, gl.SAMPLER_CUBE_SHADOW, gl.INT_SAMPLER_2D, gl.UNSIGNED_INT_SAMPLER_2D]);
    let worst = 0, worstKey = "", unlinked = 0, trail = 0;
    for (const entry of g.renderer.info.programs) {
      if (!gl.getProgramParameter(entry.program, gl.LINK_STATUS)) { unlinked++; continue; }
      let n = 0, hasTrail = false;
      for (let i = 0, c = gl.getProgramParameter(entry.program, gl.ACTIVE_UNIFORMS); i < c; i++) {
        const u = gl.getActiveUniform(entry.program, i);
        if (SAMPLERS.has(u.type)) n += u.size;
        if (u.name === "uTrailMap") hasTrail = true;
      }
      if (hasTrail) trail++;
      if (n > worst) { worst = n; worstKey = (entry.cacheKey || "").split(",").pop(); }
    }
    let err = 0;
    for (let i = 0; i < 16; i++) { const e = gl.getError(); if (!e) break; err = e; }
    return { worst, worstKey, unlinked, trail, glError: err };
  });
  console.log("programs", JSON.stringify(receipt.programs));
  assert.equal(receipt.programs.unlinked, 0, "所有程序链接");
  assert.ok(receipt.programs.worst <= 16, "采样器 ≤ 16");
  assert.ok(receipt.programs.trail > 0, "地形程序里采到了痕迹靶");
  assert.equal(receipt.programs.glError, 0, "无 GL 错误");
  assert.deepEqual(errors, [], "页面无报错");
  await fs.writeFile(path.join(output, `Receipt_${QUALITY}.json`), JSON.stringify(receipt, null, 1));
  console.log(`TerrainTrailsBrowserTest(${QUALITY}): 玩家 ${stats.player} 印、人物 ${stats.rigs} 印、膝 ${stats.knees}、拖痕 ${stats.drags}；`
    + `印处平均差 ${receipt.pixels.nearMean}（全屏 ${receipt.pixels.allMean}）；最挤程序 ${receipt.programs.worst} 采样器 → ${output}`);
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
