// ===========================================================================
// Script_EditorBlockoutBrowserTest.mjs —— 白盒关卡编辑器（?editor=blockout）的浏览器闸门
//
// 跑法：node Taierzhuang1938/Script_EditorBlockoutBrowserTest.mjs
// 口径：docs/Data_EditorBlockout.md §10 第 4 行。
//
// 先在 node 里核几条纯规则（关卡注册表、phase 形状、高度网格与渲染格逐点一致、入口地址），
// 再开一页游戏：
//   1. ?editor=blockout&level=FirstLevel&quality=whitebox&scale=small&audio=0 启动；
//      没有任务运行时、没有过场；关键帧数与配置一致；
//   2. GoTo 之后玩家位置误差 < 0.5 m；
//   3. Next 过渡中单位位置连续变化（不瞬移），结束后到位；
//   4. 切到 SecondLevel 之后场景边界与地形都换了，再切回来；
//   5. 小地图与卡片像素非空；
//   6. 配置文件被外部改写后 3 s 内同步（改的是本树的 Blockout/FirstLevel.json，finally 里逐字节还原）；
//   7. 全程没有未捕获错误；截图存 _shots/EditorBlockout/。
// 顺带量：开机到就绪的时间、03-2 关键帧上 120 帧的平均帧时、场上演员数。
// ===========================================================================

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";
import {
  BLOCKOUT_LEVELS, BLOCKOUT_PHASES, BlockoutLevelIndex, HeightGridSampler, LayoutFromSceneDoc, DeriveFirstLevelBlockoutLayout,
} from "./Script_EditorBlockoutLevels.mjs";
import { NormalizeBlockout, BLOCKOUT_LEVEL_KEYS } from "./Script_EditorBlockoutConfig.mjs";
import { CreateP012Terrain } from "./Data_FirstLevelP012Terrain.mjs";
import { BlockoutEntry } from "./Script_EditorBlockoutEntry.mjs";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(projectDir, "..");
const shotDir = path.join(projectDir, "_shots", "EditorBlockout");
const configPath = path.join(projectDir, "Blockout", "FirstLevel.json");
await fs.mkdir(shotDir, { recursive: true });

const results = [];
function Check(name, ok, detail = "") {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? "  — " + detail : ""}`);
}

// ---------------------------------------------------------------------------
// 0) node 里的纯规则
console.log("--- node checks");
Check("关卡注册表 key 都在 BLOCKOUT_LEVEL_KEYS 里", BLOCKOUT_LEVELS.every(l => BLOCKOUT_LEVEL_KEYS.includes(l.key)));
Check("BlockoutLevelIndex 找不到返回 0", BlockoutLevelIndex("Nope") === 0 && BlockoutLevelIndex("SecondLevel") === 1);
for (const phase of BLOCKOUT_PHASES) {
  const banned = ["contentId", "p012", "fullMission", "smokeColumns", "roster", "chapter"].filter(k => k in phase || k in (phase.whitebox || {}));
  Check(`${phase.id}：不带任务 / 故事 / 同伴字段`, banned.length === 0, banned.join(","));
  Check(`${phase.id}：sandbox、zones 与 objectives 同长、带 Prepare`, phase.sandbox === true && phase.zones.length >= 1
    && phase.zones.length === phase.objectives.length && typeof phase.blockout?.Prepare === "function" && phase.whitebox?.blockout === true);
}
{
  const layout = DeriveFirstLevelBlockoutLayout();
  const trees = layout.blocks.filter(b => b.blockoutTree), treeModels = layout.blocks.filter(b => b.treeModel);
  Check("第一关白盒布局：新 id、关掉贴图集 / 工事 / 铁路，树换成树干块，水块不画（另铺水面）",
    layout.id === "BlockoutFirstLevel" && !layout.fortifications && !layout.materialLooks && layout.railway === null
      && !layout.ground.terrainLayers && !layout.ground.pbr && trees.length > 0 && treeModels.length === 0
      && trees.every(b => b.solid === true && b.w === 0.5)
      && layout.blocks.filter(b => b.blockoutWater).every(b => b.visual === false), `树干 ${trees.length} 块`);
}
{
  const doc = JSON.parse(await fs.readFile(path.join(projectDir, "Blockout", "SecondLevel.scene.json"), "utf8"));
  const layout = LayoutFromSceneDoc(doc);
  const lattice = CreateP012Terrain(layout);
  let maxError = 0;
  for (let i = 0; i < 4000; i++) {
    const x = doc.bounds.minX + (i * 7.31) % (doc.bounds.maxX - doc.bounds.minX);
    const z = doc.bounds.minZ + (i * 13.7) % (doc.bounds.maxZ - doc.bounds.minZ);
    maxError = Math.max(maxError, Math.abs(lattice.SampleHeight(x, z) - layout.terrainSampler(x, z)));
  }
  Check("文件场景：高度网格采样与渲染格逐点一致（同一三角剖分）", maxError < 1e-4 && lattice.cellM === doc.terrain.cellM,
    `最大差 ${maxError.toExponential(2)} m，格距 ${lattice.cellM}`);
  const sampler = HeightGridSampler(doc.terrain);
  const blocksOk = layout.blocks.every(b => {
    const corners = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => {
      const c = Math.cos(b.ry), s = Math.sin(b.ry), lx = sx * b.w / 2, lz = sz * b.d / 2;
      return sampler(b.x + lx * c + lz * s, b.z - lx * s + lz * c);
    });
    return Math.abs(b.y - b.h / 2 - Math.min(sampler(b.x, b.z), ...corners)) < 1e-6;
  });
  Check("文件场景：块脚落在中心与四角中最低的地面上", blocksOk);
}
{
  const url = new URL(BlockoutEntry.Url("http://127.0.0.1:9/Taierzhuang1938/?whitebox=p012&missionStage=3&phase=2&quality=high&scale=small&audio=0"));
  Check("启动面板入口：跳到 ?editor=blockout&level=FirstLevel，只保留画质 / 规模 / 音频", url.pathname === "/Taierzhuang1938/"
    && url.searchParams.get("editor") === "blockout" && url.searchParams.get("level") === "FirstLevel"
    && url.searchParams.get("quality") === "high" && url.searchParams.get("scale") === "small" && url.searchParams.get("audio") === "0"
    && !url.searchParams.has("whitebox") && !url.searchParams.has("missionStage") && !url.searchParams.has("phase"), url.search);
  Check("启动面板入口：已经在编辑器里时认得出", BlockoutEntry.Active("?editor=blockout&level=SecondLevel") && !BlockoutEntry.Active("?editor=tools"));
}

const originalConfig = await fs.readFile(configPath);
const configDoc = NormalizeBlockout(JSON.parse(originalConfig.toString("utf8")));

// ---------------------------------------------------------------------------
// 浏览器
const server = await ServeRoot(rootDir, 0);
const port = server.address().port;
const browser = await LaunchBrowser();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (error) => errors.push(`PAGEERROR ${String(error).slice(0, 300)}`));
page.on("console", (message) => {
  if (message.type() !== "error") return;
  const url = message.location()?.url || "";
  if (/fonts\.(googleapis|gstatic)\.com/.test(url)) return;
  // 存档口：ServeRoot 没有 /__blockout，问状态口拿到 404 正是要验的退化路径。
  if (/__blockout/.test(url) || /__blockout/.test(message.text())) return;
  errors.push(`CONSOLE ${message.text().slice(0, 240)} @ ${url}`);
});

let configTouched = false;
const metrics = {};
try {
  console.log("--- boot");
  const bootStart = Date.now();
  await page.goto(`http://127.0.0.1:${port}/Taierzhuang1938/?editor=blockout&level=FirstLevel&quality=whitebox&scale=small&audio=0`,
    { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => window.Tengxian?.state?.ready && window.Tengxian?.Debug?.Blockout?.State().ready,
    null, { timeout: 300000 });
  metrics.bootMs = Date.now() - bootStart;
  const boot = await page.evaluate(() => {
    const T = window.Tengxian;
    return {
      state: T.Debug.Blockout.State(),
      missionRuntime: T.editor?.host?.game?.missionRuntime ?? null,
      cutscene: !!T.cutscene?.Playing,
      menu: !!T.menu,
      phase: T.state.phaseIndex,
      bodyClass: document.body.classList.contains("blockoutMode"),
      soldiers: T.ai?.soldiers?.length ?? -1,
      layoutId: T.battlefield?.layout?.id ?? null,
      running: !!T.state.running,
    };
  });
  Check("启动进第一关白盒，没有任务运行时、没有过场、没有主菜单", boot.missionRuntime === null && !boot.cutscene && !boot.menu
    && boot.layoutId === "BlockoutFirstLevel" && boot.bodyClass && boot.running, JSON.stringify({ ...boot, state: undefined }));
  Check("不撒兵（AI 场上 0 人）", boot.soldiers === 0, `ai.soldiers=${boot.soldiers}`);
  Check("关键帧数与配置一致", boot.state.count === configDoc.keyframes.length, `${boot.state.count} / ${configDoc.keyframes.length}`);
  Check("配置载入无错", boot.state.configState === "ok", boot.state.configMessage);

  // 2) GoTo 位置
  console.log("--- goto");
  const poses = [];
  for (const kf of configDoc.keyframes) {
    await page.evaluate((id) => window.Tengxian.Debug.Blockout.GoTo(id, { animate: false }), kf.id);
    await page.evaluate(() => window.Tengxian.StepFrames?.(2));
    const p = await page.evaluate(() => ({ x: window.Tengxian.player.position.x, z: window.Tengxian.player.position.z,
      yaw: window.Tengxian.player.yaw, state: window.Tengxian.Debug.Blockout.State() }));
    const error = Math.hypot(p.x - kf.player.x, p.z - kf.player.z);
    poses.push(`${kf.id}:${error.toFixed(2)}m`);
    Check(`GoTo ${kf.id}：玩家位置误差 < 0.5 m、关键帧号对`, error < 0.5 && p.state.id === kf.id, `${error.toFixed(3)} m`);
  }
  // 按键：, 上一个（直接到位）、. 下一个（带过渡）、M 全关总图、Esc 关图
  console.log("--- keys");
  await page.evaluate(() => window.Tengxian.Debug.Blockout.GoTo(1, { animate: false }));
  await page.keyboard.press("Comma");
  const afterComma = await page.evaluate(() => window.Tengxian.Debug.Blockout.State());
  await page.keyboard.press("Period");
  const afterPeriod = await page.evaluate(() => window.Tengxian.Debug.Blockout.State());
  await page.waitForFunction(() => !window.Tengxian.Debug.Blockout.State().transitioning, null, { timeout: 30000 });
  await page.keyboard.press("KeyY");
  const afterY = await page.evaluate(() => window.Tengxian.Debug.Blockout.State());
  await page.waitForFunction(() => !window.Tengxian.Debug.Blockout.State().transitioning, null, { timeout: 30000 });
  const replayEnd = await page.evaluate(() => window.Tengxian.Debug.Blockout.Units());
  const kf1 = configDoc.keyframes[1];
  const replayOff = kf1.units.filter(u => { const f = replayEnd.find(v => v.id === u.id); return !f || Math.hypot(f.x - u.x, f.z - u.z) > 0.05; });
  Check("Y：从上一关键帧重播进入当前关键帧的过渡，播完到位", afterY.index === 1 && afterY.transitioning && replayOff.length === 0
    && replayEnd.length === kf1.units.length, `${replayEnd.length} 人，错位 ${replayOff.map(u => u.id).join(",")}`);
  await page.keyboard.press("KeyM");
  const afterM = await page.evaluate(() => window.Tengxian.Debug.Blockout.State());
  await page.keyboard.press("Escape");
  await page.waitForTimeout(100);
  const afterEsc = await page.evaluate(() => window.Tengxian.Debug.Blockout.State());
  Check("按键：「,」上一个直接到位，「.」下一个带过渡，M 开全关总图，Esc 关图",
    afterComma.index === 0 && !afterComma.transitioning && afterPeriod.index === 1 && afterPeriod.transitioning
      && afterM.mapOpen && !afterEsc.mapOpen,
    JSON.stringify({ comma: afterComma.index, period: [afterPeriod.index, afterPeriod.transitioning], m: afterM.mapOpen, esc: afterEsc.mapOpen }));
  await page.evaluate(() => window.Tengxian.Debug.Blockout.GoTo(1, { animate: false }));
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(shotDir, "FirstLevel_03-2.png") });
  // 帧时：120 帧（headless 下 rAF 按 60 Hz 节拍走，读数含垂直同步等待）
  metrics.frame = await page.evaluate(() => new Promise((resolve) => {
    const times = []; let last = null;
    const Tick = (t) => { if (last !== null) times.push(t - last); last = t; if (times.length >= 120) resolve({
      avgMs: times.reduce((a, b) => a + b, 0) / times.length, maxMs: Math.max(...times) }); else requestAnimationFrame(Tick); };
    requestAnimationFrame(Tick);
  }));
  metrics.stats = await page.evaluate(() => window.Tengxian.Debug.Blockout.Stats());
  Check("03-2 演员都摆出来了（人物数 = 配置单位数）", metrics.stats.puppets === configDoc.keyframes[1].units.length,
    `${metrics.stats.puppets} / ${configDoc.keyframes[1].units.length}，人物 ${metrics.stats.actors}`);
  Check("03-2 3D 标记有几何、头顶有标签", metrics.stats.markers.tris > 50 && metrics.stats.markers.labels > 0, JSON.stringify(metrics.stats.markers));

  // 3) Next 过渡连续
  console.log("--- next transition");
  const transition = await page.evaluate(async () => {
    const B = window.Tengxian.Debug.Blockout;
    const samples = [];
    let done = false;
    const promise = B.Next().then(() => { done = true; });
    const t0 = performance.now();
    while (!done && performance.now() - t0 < 20000) {
      samples.push({ t: performance.now() - t0, units: B.Units().map(u => ({ id: u.id, x: u.x, z: u.z, visible: u.visible, moving: u.moving })) });
      await new Promise(r => requestAnimationFrame(r));
    }
    await promise;
    return { samples, done, state: B.State(), units: B.Units() };
  });
  const target = configDoc.keyframes[2];
  let maxStep = 0, movedIds = new Set(), samplesMoving = 0;
  for (let i = 1; i < transition.samples.length; i++) {
    const before = new Map(transition.samples[i - 1].units.map(u => [u.id, u]));
    let anyMoving = false;
    for (const u of transition.samples[i].units) {
      const prev = before.get(u.id);
      if (!prev || !u.visible || !prev.visible) continue;
      const step = Math.hypot(u.x - prev.x, u.z - prev.z);
      if (step > 1e-3) { movedIds.add(u.id); anyMoving = true; }
      maxStep = Math.max(maxStep, step);
    }
    if (anyMoving) samplesMoving++;
  }
  Check("Next：过渡在几十帧里连续走完（不瞬移）", transition.done && samplesMoving >= 10 && maxStep < 1.5,
    `采样 ${transition.samples.length} 帧，有移动 ${samplesMoving} 帧，单帧最大位移 ${maxStep.toFixed(2)} m，走动的人 ${movedIds.size}，计划 ${JSON.stringify(transition.state.lastPlan)}`);
  const finalById = new Map(transition.units.map(u => [u.id, u]));
  const misplaced = target.units.filter(u => { const f = finalById.get(u.id); return !f || Math.hypot(f.x - u.x, f.z - u.z) > 0.05; });
  Check("Next：结束后每个人都到位，只剩新关键帧的人", misplaced.length === 0 && transition.units.length === target.units.length,
    `${transition.units.length} 人，错位 ${misplaced.map(u => u.id).join(",")}`);
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(shotDir, "FirstLevel_03-3.png") });

  // 5) 小地图与卡片像素
  console.log("--- pixels");
  // 选择器只认「#blockoutRoot 里看得见的 canvas / 卡片」，不认占位界面的类名（C 包替换后照样能跑）。
  const mini = await page.evaluate(() => {
    const visible = [...document.querySelectorAll("#blockoutRoot canvas")].filter(c => c.clientWidth > 0 && c.clientHeight > 0);
    const canvas = visible.find(c => c.clientWidth >= 120 && c.clientWidth <= 360) || visible[0];
    const ctx = canvas.getContext("2d");
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const colors = new Set();
    let ink = 0;
    for (let i = 0; i < data.length; i += 4 * 7) {
      colors.add(`${data[i] >> 3},${data[i + 1] >> 3},${data[i + 2] >> 3}`);
      if (data[i] + data[i + 1] + data[i + 2] < 560) ink++;
    }
    return { colors: colors.size, ink, w: canvas.width, h: canvas.height };
  });
  Check("小地图有内容（纸色之外有块、单位、玩家）", mini.colors > 12 && mini.ink > 50, JSON.stringify(mini));
  const cardBox = await page.evaluate((what) => {
    // 卡片 = 含「此时」那句话、宽不过 600 px 的最大一块
    let card = null, area = 0;
    for (const el of document.querySelectorAll("#blockoutRoot *")) {
      if (!el.textContent.includes(what)) continue;
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.width < 600 && r.width * r.height > area) { card = el; area = r.width * r.height; }
    }
    const r = card?.getBoundingClientRect();
    return r ? { x: r.x, y: r.y, w: r.width, h: r.height, text: card.textContent.length } : null;
  }, configDoc.keyframes[2].what);
  let cardPixels = null;
  if (cardBox && cardBox.w > 10 && cardBox.h > 10) {
    const png = await page.screenshot({ clip: { x: cardBox.x, y: cardBox.y, width: cardBox.w, height: cardBox.h } });
    cardPixels = await page.evaluate(async (b64) => {
      const image = new Image();
      image.src = `data:image/png;base64,${b64}`;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.width; canvas.height = image.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(image, 0, 0);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let bright = 0;
      for (let i = 0; i < data.length; i += 4) if (data[i] + data[i + 1] + data[i + 2] > 360) bright++;
      return { bright, total: data.length / 4 };
    }, png.toString("base64"));
  }
  Check("卡片有字（亮像素）", !!cardPixels && cardPixels.bright > 200 && cardBox.text > 10, JSON.stringify({ cardBox, cardPixels }));

  // 全关总图
  await page.evaluate(() => window.Tengxian.Debug.Blockout.ToggleMap(true));
  await page.waitForTimeout(700);
  const full = await page.evaluate(() => {
    const canvases = [...document.querySelectorAll("#blockoutRoot canvas")].filter(c => c.clientWidth > 0 && c.clientHeight > 0);
    const canvas = canvases.sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight)[0];
    const data = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
    let ink = 0;
    for (let i = 0; i < data.length; i += 4 * 13) if (data[i] + data[i + 1] + data[i + 2] < 560) ink++;
    return { ink, open: window.Tengxian.Debug.Blockout.State().mapOpen, w: canvas.width };
  });
  Check("M：全关总图打开且有内容", full.open && full.ink > 200, JSON.stringify(full));
  await page.screenshot({ path: path.join(shotDir, "FirstLevel_FullMap.png") });
  await page.evaluate(() => window.Tengxian.Debug.Blockout.ToggleMap(false));

  // 启动面板：白盒关卡编辑器按钮显示为当前项，点了不重载
  const launcher = await page.evaluate(async () => {
    const T = window.Tengxian;
    T.editor.TogglePanel(true);
    const button = document.querySelector('.edPanel.launcher [data-editor="blockout"]');
    const before = location.href;
    const on = !!button?.classList.contains("on");
    button?.click();
    await new Promise(r => setTimeout(r, 300));
    const count = document.querySelectorAll(".edPanel.launcher [data-editor]").length;
    T.editor.TogglePanel(false);
    return { exists: !!button, on, label: button?.textContent, stayed: location.href === before, count };
  });
  Check("「设置 → 高级工具」面板的编辑器组里有「白盒关卡编辑器」，当前项高亮、点了不重载",
    launcher.exists && launcher.on && launcher.stayed && launcher.label === "白盒关卡编辑器", JSON.stringify(launcher));

  // 6) 外部改配置 → 3 s 内同步
  console.log("--- external edit");
  await page.evaluate(() => window.Tengxian.Debug.Blockout.GoTo("03-2", { animate: false }));
  const marker = `外部改写测试 ${Date.now() % 100000}`;
  const edited = JSON.parse(originalConfig.toString("utf8"));
  edited.keyframes[1].what = marker;
  const syncBefore = await page.evaluate(() => window.Tengxian.Debug.Blockout.State().syncCount);
  configTouched = true;
  await fs.writeFile(configPath, `${JSON.stringify(edited, null, 2)}\n`);
  const editAt = Date.now();
  let synced = false;
  try {
    await page.waitForFunction(({ before, text }) => {
      const B = window.Tengxian.Debug.Blockout;
      return B.State().syncCount > before && B.Config().keyframes[1].what === text
        && document.querySelector("#blockoutRoot").textContent.includes(text);
    }, { before: syncBefore, text: marker }, { timeout: 3000 });
    synced = true;
  } catch (error) { synced = false; }
  const syncMs = Date.now() - editAt;
  const afterSync = await page.evaluate(() => window.Tengxian.Debug.Blockout.State());
  Check("配置文件外部改写后 3 s 内同步（卡片换字、停在同一关键帧）", synced && afterSync.id === "03-2", `${syncMs} ms，${JSON.stringify({ id: afterSync.id, state: afterSync.configState })}`);
  await fs.writeFile(configPath, originalConfig);
  configTouched = false;
  await page.waitForFunction((before) => window.Tengxian.Debug.Blockout.State().syncCount > before + 0, syncBefore + 1, { timeout: 6000 }).catch(() => {});

  // 地形与水的样子（§6.3）：地面按高度上色 + 米格线，北沙河铺成水面
  const look = await page.evaluate(() => {
    const T = window.Tengxian, bf = T.battlefield;
    const grounds = bf.meshes.filter(m => m.name === "FirstLevelWhitebox_Ground");
    const material = grounds[0]?.material;
    const colors = grounds[0]?.geometry.getAttribute("color");
    let lo = 9, hi = -9;
    for (const mesh of grounds) {
      const attribute = mesh.geometry.getAttribute("color");
      if (!attribute) continue;
      for (let i = 0; i < attribute.count; i += 211) { const g = attribute.getY(i); lo = Math.min(lo, g); hi = Math.max(hi, g); }
    }
    const spread = colors ? hi - lo : 0;
    return { grounds: grounds.length, vertexColors: !!material?.vertexColors, colorSpread: spread,
      water: bf.waterMesh?.name || null, waterInScene: !!bf.waterMesh?.parent };
  });
  Check("地面按高度上色（顶点色有深浅）、北沙河铺成水面", look.grounds > 0 && look.vertexColors && look.colorSpread > 0.05
    && look.water === "BlockoutWater" && look.waterInScene, JSON.stringify(look));
  await page.evaluate(() => window.Tengxian.Debug.Blockout.PlacePlayer({ x: -60, z: 84, yawDeg: 180, pitchDeg: -8 }));
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(shotDir, "FirstLevel_River.png") });

  // 4) 切关
  console.log("--- switch level");
  const firstBounds = await page.evaluate(() => ({ ...window.Tengxian.battlefield.bounds }));
  const switchStart = Date.now();
  await page.evaluate(() => window.Tengxian.Debug.Blockout.SwitchLevel("SecondLevel"));
  metrics.switchMs = Date.now() - switchStart;
  const second = await page.evaluate(() => {
    const T = window.Tengxian, B = T.Debug.Blockout;
    const bf = T.battlefield;
    return { state: B.State(), bounds: { ...bf.bounds }, layoutId: bf.layout.id, groundAtCenter: bf.GroundHeight(555, -65),
      url: location.search, player: { x: T.player.position.x, z: T.player.position.z } };
  });
  Check("切到第二关：场景边界与地形都换了、地址栏改了", second.state.level === "SecondLevel" && second.layoutId === "BlockoutSecondLevel"
    && second.bounds.minX !== firstBounds.minX && /level=SecondLevel/.test(second.url) && second.groundAtCenter < -1,
  JSON.stringify({ bounds: second.bounds, layout: second.layoutId, gully: second.groundAtCenter.toFixed(2), url: second.url, ms: metrics.switchMs }));
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(shotDir, "SecondLevel.png") });
  await page.evaluate(() => window.Tengxian.Debug.Blockout.SwitchLevel("FirstLevel"));
  const back = await page.evaluate(() => ({ state: window.Tengxian.Debug.Blockout.State(), layoutId: window.Tengxian.battlefield.layout.id,
    bounds: { ...window.Tengxian.battlefield.bounds } }));
  Check("再切回第一关", back.state.level === "FirstLevel" && back.layoutId === "BlockoutFirstLevel" && back.bounds.minX === firstBounds.minX
    && back.state.count === configDoc.keyframes.length, JSON.stringify({ layout: back.layoutId, count: back.state.count }));
  await page.evaluate(() => window.Tengxian.Debug.Blockout.GoTo("03-1", { animate: false }));
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(shotDir, "FirstLevel_03-1.png") });

  // 7) 本地存档退化：ServeRoot 没有存档口，「记下当前机位」只能存本地草稿
  const save = await page.evaluate(async () => {
    const result = await window.Tengxian.Debug.Blockout.SavePose();
    let draft = null;
    try { draft = localStorage.getItem("tengxian1938_blockout_FirstLevel"); localStorage.removeItem("tengxian1938_blockout_FirstLevel"); } catch (error) { /* */ }
    return { mode: result.mode, ok: result.ok, reason: result.reason, draft: !!draft };
  });
  Check("没有本机存档口时「记下当前机位」退化成本地草稿并写明原因", save.mode === "local" && save.draft && !!save.reason, JSON.stringify(save));
  const persisted = await page.evaluate(() => { try { return localStorage.getItem("tengxian1938_debug_options_v1"); } catch (error) { return "?"; } });
  Check("无敌 / 无限弹药只在本会话生效，不写调试选项存档", persisted === null, String(persisted));

  Check("全程没有未捕获错误", errors.length === 0, errors.slice(0, 5).join(" | "));
} finally {
  if (configTouched) await fs.writeFile(configPath, originalConfig);
  const after = await fs.readFile(configPath);
  Check("Blockout/FirstLevel.json 逐字节还原", Buffer.compare(after, originalConfig) === 0);
  await browser.close();
  server.close();
}

console.log(`--- metrics ${JSON.stringify(metrics)}`);
const failed = results.filter(r => !r.ok);
console.log(`EditorBlockoutBrowserTest: ${results.length - failed.length}/${results.length} passed`);
assert.equal(failed.length, 0, failed.map(r => r.name).join("; "));
