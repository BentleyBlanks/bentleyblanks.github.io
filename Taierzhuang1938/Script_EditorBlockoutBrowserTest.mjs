// ===========================================================================
// Script_EditorBlockoutBrowserTest.mjs —— 白盒关卡编辑器（?editor=blockout）的浏览器闸门
//
// 跑法：node Taierzhuang1938/Script_EditorBlockoutBrowserTest.mjs
// 口径：docs/Data_EditorBlockout.md §10 第 4 行。
//
// 先在 node 里核几条纯规则（关卡注册表、phase 形状、高度网格与渲染格逐点一致、入口地址、
// 场景文件的水块、担架人数、射界扇近处淡出），再开一页游戏：
//   1. ?editor=blockout&level=FirstLevel&quality=whitebox&scale=small&audio=0 启动；
//      没有任务运行时、没有过场；关键帧数与配置一致；第一次烘纸面地图等加载画面收掉 1.5 s 之后；
//   2. GoTo 之后玩家位置误差 < 0.5 m；
//   3. 按键 , . Y M Esc；过渡途中被打断后标记用的是新关键帧的单位；
//      Next 过渡中单位位置连续变化（不瞬移）、导航栏显示「快进 ×n」，结束后到位；
//   4. 小地图与卡片像素非空；全关总图：滚轮一格只缩放一次、拖动平移、双击看全图、点关键帧跳过去且图不关；
//   5. 外部改配置（page.route 改响应，**不碰盘上的文件**）：轮询间隔 + 2 s 内同步、玩家不挪、
//      担架人数 0 / 1 / 倒地；player 改了才挪；文件半截 / 没了时保留已载入的配置、只报一次；
//   6. 存档的版本号：按读到的原始字节算 sha1 发出去，成功后用端点给的，409 时重读并提示再记一次，
//      没存成时机位不变（存档口用 page.route 假装，同样不写盘）；
//   7. 切到 SecondLevel 之后场景边界与地形都换了，再切回来；没有本机存档口时退化成本地草稿；
//   8. §10 视觉组截图（01-2、02-1、03-2、08-2、12-1、18-2）：近处的射界扇淡掉、远处的照常；
//   9. 全程没有未捕获错误；Blockout/FirstLevel.json 前后逐字节相同。截图存 _shots/EditorBlockout/。
//  10. 预演（§14，2026-10-18）：第一关没有预演文件时按钮不出现；page.route 注入一段最小的预演（不改盘上的数据）后：
//      播放中相机被接管、台词字幕出现、导航栏锁住、标记藏起；Seek 后单位位置等于 SamplePrevizActor（< 0.1 m）、
//      同一 t 两次取样一样；播完按 then 跳到下一个关键帧；中断（Esc）后相机、枪模、HUD 交还。
//      10-18 第二轮：倒地的人（state down、lie:"along"）被拖着走时一直躺着（dead、骨盆贴地、头朝朝向）、位置连续；
//      预演键 weapon 切换后演员手里的武器变了，交还驱动后换回关键帧那把。
// 顺带量：开机到就绪、第一次烘图的最长帧、03-2 上 120 帧的帧时、外部修改的同步耗时、切关耗时。
// ===========================================================================

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";
import {
  BLOCKOUT_LEVELS, BLOCKOUT_PHASES, BlockoutLevelIndex, HeightGridSampler, LayoutFromSceneDoc, DeriveFirstLevelBlockoutLayout,
} from "./Script_EditorBlockoutLevels.mjs";
import { NormalizeBlockout, PlanTransition, BLOCKOUT_LEVEL_KEYS } from "./Script_EditorBlockoutConfig.mjs";
import { CreateP012Terrain } from "./Data_FirstLevelP012Terrain.mjs";
import { BlockoutEntry } from "./Script_EditorBlockoutEntry.mjs";
import { BLOCKOUT_EDITOR } from "./Script_EditorBlockout.mjs";
import { LitterSlots, LitterPose, BLOCKOUT_PUPPETS } from "./Script_EditorBlockoutPuppets.mjs";
import { FanFade, BLOCKOUT_FAN } from "./Script_EditorBlockoutMarkers.mjs";
import { ParseBlockoutSnapshot } from "./Script_EditorBlockoutSnapshot.mjs";
import { NormalizeBlockoutPreviz, SamplePrevizActor, ValidateBlockoutPreviz } from "./Script_EditorBlockoutPrevizPlan.mjs";

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
const Sha1 = (data) => createHash("sha1").update(data).digest("hex");
const Near = (a, b, eps) => Math.abs(a - b) <= eps;

// ---------------------------------------------------------------------------
// 0) node 里的纯规则
console.log("--- node checks");
Check("关卡注册表 key 都在 BLOCKOUT_LEVEL_KEYS 里", BLOCKOUT_LEVELS.every(l => BLOCKOUT_LEVEL_KEYS.includes(l.key)));
Check("BlockoutLevelIndex 找不到 / 没写时回到新剧本 01–05", BLOCKOUT_LEVELS[BlockoutLevelIndex("Nope")].key === "FirstLevel0105" && BLOCKOUT_LEVELS[BlockoutLevelIndex(null)].key === "FirstLevel0105" && BlockoutLevelIndex("SecondLevel") === 1);
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
const sceneText = await fs.readFile(path.join(projectDir, "Blockout", "SecondLevel.scene.json"), "utf8");
{
  const doc = JSON.parse(sceneText);
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
  // 场景文件里的水块同第一关：盒子不画，只铺水面
  doc.blocks.push({ id: "TestWaterPond", x: doc.bounds.minX + 20, z: doc.bounds.minZ + 20, w: 6, d: 4, h: 0.4, semantic: "water" });
  const water = LayoutFromSceneDoc(doc).blocks.find(b => b.id === "TestWaterPond");
  Check("文件场景：水块标成 visual:false + blockoutWater（不画灰盒子）", water?.visual === false && water?.blockoutWater === true, JSON.stringify(water));
}
{
  const url = new URL(BlockoutEntry.Url("http://127.0.0.1:9/Taierzhuang1938/?whitebox=p012&missionStage=3&phase=2&quality=high&scale=small&audio=0"));
  Check("启动面板入口：跳到 ?editor=blockout&level=FirstLevel0105（新剧本），只保留画质 / 规模 / 音频", url.pathname === "/Taierzhuang1938/"
    && url.searchParams.get("editor") === "blockout" && url.searchParams.get("level") === "FirstLevel0105"
    && url.searchParams.get("quality") === "high" && url.searchParams.get("scale") === "small" && url.searchParams.get("audio") === "0"
    && !url.searchParams.has("whitebox") && !url.searchParams.has("missionStage") && !url.searchParams.has("phase"), url.search);
  Check("启动面板入口：已经在编辑器里时认得出", BlockoutEntry.Active("?editor=blockout&level=SecondLevel") && !BlockoutEntry.Active("?editor=tools"));
}
{
  const l = BLOCKOUT_PUPPETS.litter;
  const two = LitterPose({ bearers: 2 }), one = LitterPose({ bearers: 1 }), none = LitterPose({ bearers: 0 }), down = LitterPose({ bearers: 2, state: "down" });
  Check("担架人数（§3 bearers）：0 = 没人抬、平放地上；1 = 只剩前头一人、后头着地；2 = 两人抬；倒地 = 放地上",
    LitterSlots({ bearers: 0 }).length === 0 && LitterSlots({ bearers: 1 }).join() === "front" && LitterSlots({}).join() === "front,rear"
      && two.y === l.y && two.tilt === 0 && none.y === l.groundY && down.y === l.groundY && one.tilt > 0.1 && one.y < l.y && one.y > l.groundY,
    JSON.stringify({ two, one, none, down }));
}
Check("射界扇近处淡出：起点 6 m 内整片不画、10 m 外不淡、中间单调",
  FanFade(0) === 0 && FanFade(BLOCKOUT_FAN.fadeNearM) === 0 && FanFade(BLOCKOUT_FAN.fadeFarM) === 1 && FanFade(40) === 1
    && FanFade(7) < FanFade(9) && BLOCKOUT_FAN.fillAlpha <= 0.12,
  [0, 6, 7, 8, 9, 10].map(d => FanFade(d)).join(","));

const originalConfig = await fs.readFile(configPath);
const originalText = originalConfig.toString("utf8");
const originalRevision = Sha1(originalConfig);
const configDoc = NormalizeBlockout(JSON.parse(originalText));
const K = (id) => configDoc.keyframes.findIndex(k => k.id === id);
const ConfigText = (doc) => `${JSON.stringify(doc, null, 2)}\n`;
const CONFIG_RE = /\/Blockout\/FirstLevel\.json(\?|$)/;
// 契约 §10：外部改了配置 3 s 内同步（轮询 2 s + 读文件 + 重摆，实测约 2.0 s）。
const SYNC_BUDGET_MS = 3000;

// ---------------------------------------------------------------------------
// 浏览器
const server = await ServeRoot(rootDir, 0);
const port = server.address().port;
const browser = await LaunchBrowser();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
// 记下加载画面收掉的时刻（第一次烘纸面地图要排在它 1.5 s 之后）
await page.addInitScript(() => {
  document.addEventListener("DOMContentLoaded", () => {
    const boot = document.getElementById("boot");
    if (!boot) return;
    const Mark = () => { if (boot.classList.contains("gone") && window.__blockoutBootGoneAt == null) window.__blockoutBootGoneAt = performance.now(); };
    new MutationObserver(Mark).observe(boot, { attributes: true, attributeFilter: ["class"] });
    Mark();
  });
});
const errors = [];
let allowConfig404 = false;
page.on("pageerror", (error) => errors.push(`PAGEERROR ${String(error).slice(0, 300)}`));
page.on("console", (message) => {
  if (message.type() !== "error") return;
  const url = message.location()?.url || "";
  if (/fonts\.(googleapis|gstatic)\.com/.test(url)) return;
  // 存档口：ServeRoot 没有 /__blockout，问状态口拿到 404 正是要验的退化路径；409 / 400 是本测试故意回的。
  if (/__blockout/.test(url) || /__blockout/.test(message.text())) return;
  // 「文件暂时没了」那一段故意回 404
  if (allowConfig404 && CONFIG_RE.test(url)) return;
  // 这一关没有预演文件（§14.1：404 = 没有预演）
  if (/\.previz\.json(\?|$)/.test(url) && /404/.test(message.text())) return;
  errors.push(`CONSOLE ${message.text().slice(0, 240)} @ ${url}`);
});

const B = (fn, arg) => page.evaluate(fn, arg);
const State = () => B(() => window.Tengxian.Debug.Blockout.State());
const GoTo = async (id) => { await B((key) => window.Tengxian.Debug.Blockout.GoTo(key, { animate: false }), id); };
const PlayerPos = () => B(() => ({ x: window.Tengxian.player.position.x, z: window.Tengxian.player.position.z }));
async function WaitSync(predicate, arg, timeout = SYNC_BUDGET_MS) {
  const t0 = Date.now();
  try {
    await page.waitForFunction(predicate, arg, { timeout, polling: 50 });
    return { ok: true, ms: Date.now() - t0 };
  } catch (error) {
    return { ok: false, ms: Date.now() - t0 };
  }
}

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
  Check("读配置时按原始字节算出版本号（sha1，与盘上文件一致）", boot.state.revision === originalRevision, `${boot.state.revision} / ${originalRevision}`);
  {
    const pz = await B(() => ({ state: window.Tengxian.Debug.Blockout.Previz.State(), button: !document.querySelector(".boPrevizBtn")?.hidden }));
    Check("第一关没有预演文件：预演按钮不出现", !pz.state.present && !pz.button && pz.state.sequences.length === 0, JSON.stringify({ present: pz.state.present, button: pz.button }));
  }

  // 1b) 第一次烘纸面地图：加载画面收掉 1.5 s 之后才开始；量烘图期间的最长帧
  console.log("--- first map bake");
  metrics.bake = await page.evaluate(async () => {
    const Bl = window.Tengxian.Debug.Blockout;
    const frames = [];
    const t0 = performance.now();
    let last = t0;
    while (performance.now() - t0 < 15000) {
      await new Promise(r => requestAnimationFrame(r));
      const now = performance.now();
      frames.push([now, now - last]);
      last = now;
      const m = Bl.Stats().map;
      if (m.doneAt !== null && now > m.doneAt + 300) break;
    }
    const m = Bl.Stats().map;
    const during = frames.filter(([t]) => m.startedAt !== null && t >= m.startedAt && t <= (m.doneAt ?? Infinity) + 50).map(([, d]) => d);
    return { bootGoneAt: window.__blockoutBootGoneAt ?? null, startedAt: m.startedAt, doneAt: m.doneAt, levelKey: m.levelKey,
      maxFrameDuringMs: during.length ? Math.round(Math.max(...during) * 10) / 10 : null, framesDuring: during.length,
      workMs: m.stats?.workMs ?? null, slices: m.stats?.slices ?? null, maxStepMs: m.stats?.maxStepMs ?? null };
  });
  const bake = metrics.bake;
  Check("第一次烘纸面地图排在加载画面收掉 1.5 s 之后，并且烘完了",
    bake.doneAt !== null && bake.bootGoneAt !== null && bake.startedAt - bake.bootGoneAt >= BLOCKOUT_EDITOR.firstBakeDelayMs - 1 && bake.levelKey === "FirstLevel",
    JSON.stringify({ ...bake, delayAfterBootMs: bake.startedAt != null && bake.bootGoneAt != null ? Math.round(bake.startedAt - bake.bootGoneAt) : null }));

  // 2) GoTo 位置
  console.log("--- goto");
  for (const kf of configDoc.keyframes) {
    await GoTo(kf.id);
    await page.evaluate(() => window.Tengxian.StepFrames?.(2));
    const p = await page.evaluate(() => ({ x: window.Tengxian.player.position.x, z: window.Tengxian.player.position.z,
      state: window.Tengxian.Debug.Blockout.State() }));
    const error = Math.hypot(p.x - kf.player.x, p.z - kf.player.z);
    Check(`GoTo ${kf.id}：玩家位置误差 < 0.5 m、关键帧号对`, error < 0.5 && p.state.id === kf.id, `${error.toFixed(3)} m`);
  }

  // 3) 按键：, 上一个（直接到位）、. 下一个（带过渡）、Y 重播、M 全关总图、Esc 关图
  console.log("--- keys");
  const i31 = K("03-1"), i32 = K("03-2");
  await GoTo("03-2");
  await page.keyboard.press("Comma");
  const afterComma = await State();
  await page.keyboard.press("Period");
  const afterPeriod = await State();
  await page.waitForFunction(() => !window.Tengxian.Debug.Blockout.State().transitioning, null, { timeout: 30000 });
  await page.keyboard.press("KeyY");
  const afterY = await State();
  await page.waitForFunction(() => !window.Tengxian.Debug.Blockout.State().transitioning, null, { timeout: 30000 });
  const replayEnd = await B(() => window.Tengxian.Debug.Blockout.Units());
  const kf32 = configDoc.keyframes[i32];
  const replayOff = kf32.units.filter(u => { const f = replayEnd.find(v => v.id === u.id); return !f || Math.hypot(f.x - u.x, f.z - u.z) > 0.05; });
  Check("Y：从上一关键帧重播进入当前关键帧的过渡，播完到位", afterY.index === i32 && afterY.transitioning && replayOff.length === 0
    && replayEnd.length === kf32.units.length, `${replayEnd.length} 人，错位 ${replayOff.map(u => u.id).join(",")}`);
  await page.keyboard.press("KeyM");
  const afterM = await State();
  await page.keyboard.press("Escape");
  await page.waitForTimeout(100);
  const afterEsc = await State();
  Check("按键：「,」上一个直接到位，「.」下一个带过渡，M 开全关总图，Esc 关图",
    afterComma.index === i31 && !afterComma.transitioning && afterPeriod.index === i32 && afterPeriod.transitioning
      && afterM.mapOpen && !afterEsc.mapOpen,
    JSON.stringify({ comma: afterComma.index, period: [afterPeriod.index, afterPeriod.transitioning], m: afterM.mapOpen, esc: afterEsc.mapOpen }));

  // 3b) 过渡途中被打断（「.」之后马上「,」）：标记与俯视图用的必须是 03-1 的单位，不能被没播完的 03-2 盖掉
  await GoTo("03-1");
  await page.keyboard.press("Period");
  await page.waitForTimeout(300);
  const midTransition = (await State()).transitioning;
  await page.keyboard.press("Comma");
  await page.waitForTimeout(500);
  const interrupted = await B(() => ({ state: window.Tengxian.Debug.Blockout.State(), marked: window.Tengxian.Debug.Blockout.Marked() }));
  {
    const want = configDoc.keyframes[i31].units;
    const got = new Map(interrupted.marked.map(u => [u.id, u]));
    const wrong = want.filter(u => !got.has(u.id) || got.get(u.id).name !== (u.name || ""));
    Check("过渡途中跳走：标记用的是跳到的关键帧的单位（没播完的过渡不再盖回来）",
      midTransition && interrupted.state.index === i31 && !interrupted.state.transitioning && wrong.length === 0 && got.size === want.length,
      `标记 ${got.size} / ${want.length} 人，对不上 ${wrong.slice(0, 5).map(u => u.id).join(",")}`);
  }

  await GoTo("03-2");
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(shotDir, "FirstLevel_03-2.png") });
  // 帧时：120 帧（headless 不等垂直同步，读数偏乐观）
  metrics.frame = await page.evaluate(() => new Promise((resolve) => {
    const times = []; let last = null;
    const Tick = (t) => { if (last !== null) times.push(t - last); last = t; if (times.length >= 120) resolve({
      avgMs: Math.round(times.reduce((a, b) => a + b, 0) / times.length * 10) / 10, maxMs: Math.round(Math.max(...times) * 10) / 10 }); else requestAnimationFrame(Tick); };
    requestAnimationFrame(Tick);
  }));
  metrics.stats = await B(() => { const s = window.Tengxian.Debug.Blockout.Stats(); return { puppets: s.puppets, actors: s.actors, markers: s.markers, fans: s.fans.length }; });
  Check("03-2 演员都摆出来了（演员数 = 配置单位数）", metrics.stats.puppets === kf32.units.length,
    `${metrics.stats.puppets} / ${kf32.units.length}，人物 ${metrics.stats.actors}`);
  Check("03-2 3D 标记有几何、头顶有标签", metrics.stats.markers.tris > 50 && metrics.stats.markers.labels > 0, JSON.stringify(metrics.stats.markers));

  // 4) Next 过渡连续 + 导航栏「快进 ×n」（挑第一段要快进的过渡）
  console.log("--- next transition");
  let fastIndex = -1;
  for (let i = 0; i + 1 < configDoc.keyframes.length && fastIndex < 0; i++) {
    if (PlanTransition(configDoc.keyframes[i], configDoc.keyframes[i + 1]).playbackRate > 1.01) fastIndex = i;
  }
  await GoTo(configDoc.keyframes[fastIndex].id);
  await page.waitForTimeout(200);
  const transition = await page.evaluate(async () => {
    const Bl = window.Tengxian.Debug.Blockout;
    const root = document.querySelector("#blockoutRoot");
    const samples = [];
    let done = false;
    const promise = Bl.Next().then(() => { done = true; });
    const t0 = performance.now();
    while (!done && performance.now() - t0 < 20000) {
      samples.push({ t: performance.now() - t0, fast: root.textContent.includes("快进 ×"),
        units: Bl.Units().map(u => ({ id: u.id, x: u.x, z: u.z, visible: u.visible, moving: u.moving })) });
      await new Promise(r => requestAnimationFrame(r));
    }
    await promise;
    await new Promise(r => requestAnimationFrame(r));
    await new Promise(r => requestAnimationFrame(r));
    return { samples, done, state: Bl.State(), units: Bl.Units(), fastAfter: root.textContent.includes("快进 ×") };
  });
  const target = configDoc.keyframes[fastIndex + 1];
  let maxStep = 0, samplesMoving = 0;
  const movedIds = new Set();
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
    `${configDoc.keyframes[fastIndex].id}→${target.id}，采样 ${transition.samples.length} 帧，有移动 ${samplesMoving} 帧，单帧最大位移 ${maxStep.toFixed(2)} m，走动的人 ${movedIds.size}，计划 ${JSON.stringify(transition.state.lastPlan)}`);
  const fastShown = transition.samples.filter(s => s.fast).length;
  Check("Next：整段快进时导航栏显示「快进 ×n」，过渡完就收掉（不弹提示条）",
    transition.state.lastPlan.playbackRate > 1.01 && fastShown >= transition.samples.length * 0.8 && !transition.fastAfter,
    `${fastShown} / ${transition.samples.length} 帧显示，结束后 ${transition.fastAfter ? "还在" : "收了"}`);
  const finalById = new Map(transition.units.map(u => [u.id, u]));
  const misplaced = target.units.filter(u => { const f = finalById.get(u.id); return !f || Math.hypot(f.x - u.x, f.z - u.z) > 0.05; });
  Check("Next：结束后每个人都到位，只剩新关键帧的人", misplaced.length === 0 && transition.units.length === target.units.length,
    `${transition.units.length} 人，错位 ${misplaced.map(u => u.id).join(",")}`);
  await page.waitForTimeout(400);

  // 5) 小地图与卡片像素
  console.log("--- pixels");
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
    let card = null, area = 0;
    for (const el of document.querySelectorAll("#blockoutRoot *")) {
      if (!el.textContent.includes(what)) continue;
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.width < 600 && r.width * r.height > area) { card = el; area = r.width * r.height; }
    }
    const r = card?.getBoundingClientRect();
    return r ? { x: r.x, y: r.y, w: r.width, h: r.height, text: card.textContent.length } : null;
  }, target.what);
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

  // 全关总图：内容 + 鼠标（归地图模块：滚轮一格只缩放一次、拖动平移、双击看全图、点关键帧跳过去且图不关）
  console.log("--- full map");
  await B(() => window.Tengxian.Debug.Blockout.ToggleMap(true));
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
  {
    const v0 = await B(() => window.Tengxian.Debug.Blockout.MapView());
    // 打开时对准玩家附近（不是全图）：视图中心就是玩家脚下、比例比全图大
    const opened = await B(() => ({ p: { x: window.Tengxian.player.position.x, z: window.Tengxian.player.position.z }, b: window.Tengxian.battlefield.bounds }));
    const fitScaleUpper = Math.min(1e9, v0.pxPerM);
    Check("全关总图打开时对准玩家附近", Near(v0.cx, opened.p.x, 0.5) && Near(v0.cz, opened.p.z, 0.5),
      JSON.stringify({ v0, player: opened.p }));
    const rect = (await B(() => window.Tengxian.Debug.Blockout.MapPoint(0))).rect;
    const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.wheel(0, -100);
    await page.waitForTimeout(250);
    const v1 = await B(() => window.Tengxian.Debug.Blockout.MapView());
    const ratio = v1.pxPerM / v0.pxPerM, once = Math.exp(100 * 0.0016);
    Check("全关总图：滚轮一格只缩放一次（以光标为中心）", Near(ratio, once, 0.01), `倍率 ${ratio.toFixed(4)}，一次应为 ${once.toFixed(4)}`);
    const sx = rect.left + 36, sy = rect.top + 36;
    await page.mouse.move(sx, sy);
    await page.mouse.down();
    await page.mouse.move(sx + 120, sy + 80, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(250);
    const v2 = await B(() => window.Tengxian.Debug.Blockout.MapView());
    const dx = (v1.cx - v2.cx) * v1.pxPerM, dz = (v1.cz - v2.cz) * v1.pxPerM;
    Check("全关总图：拖动平移（拖多少像素，图跟着走多少）", Near(dx, 120, 4) && Near(dz, 80, 4) && v2.pxPerM === v1.pxPerM && v2.open,
      `平移 ${dx.toFixed(1)}, ${dz.toFixed(1)} px`);
    await page.mouse.dblclick(sx, sy);
    await page.waitForTimeout(250);
    const v3 = await B(() => window.Tengxian.Debug.Blockout.MapView());
    const levelCx = (opened.b.minX + opened.b.maxX) / 2, levelCz = (opened.b.minZ + opened.b.maxZ) / 2;
    Check("全关总图：双击回到全图（关卡中心、比例比打开时小）", Near(v3.cx, levelCx, 0.5) && Near(v3.cz, levelCz, 0.5) && v3.pxPerM < fitScaleUpper,
      JSON.stringify({ v0, v3, levelCx, levelCz }));
    // 点一个离别的点都远的关键帧点
    const points = await B((n) => { const out = []; for (let i = 0; i < n; i++) out.push(window.Tengxian.Debug.Blockout.MapPoint(i)); return out; }, configDoc.keyframes.length);
    const current = (await State()).index;
    const pick = points.find(p => p && p.index !== current && p.x > rect.left + 20 && p.x < rect.left + rect.width - 20 && p.y > rect.top + 20 && p.y < rect.top + rect.height - 20
      && points.every(q => !q || q.index === p.index || Math.hypot(q.x - p.x, q.y - p.y) >= 14));
    if (pick) {
      await page.mouse.click(pick.x, pick.y);
      await page.waitForTimeout(300);
    }
    const afterPick = await State();
    Check("全关总图：点关键帧点直接跳过去，图保持打开", !!pick && afterPick.index === pick.index && afterPick.mapOpen,
      JSON.stringify({ pick: pick ? configDoc.keyframes[pick.index].id : null, index: afterPick.index, open: afterPick.mapOpen }));
    // 图开着时鼠标不漏到后面的游戏（用户 10-13：「开地图以后后面的鼠标响应还在」）：
    // 导航栏两边那条也归遮罩；直接打在游戏画布上的按下 / 滚轮 / 移动不开枪、不抢锁、不换枪、不转头
    const leak = await B(() => {
      const T = window.Tengxian, view = document.getElementById("view");
      const Now = () => ({ yaw: T.player.yaw, pitch: T.player.pitch, slot: T.state.activeSlot, fire: T.Debug.FireCount?.() ?? 0, ads: !!T.player.ads });
      const before = Now();
      const nav = document.querySelector(".boNav").getBoundingClientRect(), y = nav.top + nav.height / 2;
      const Under = (x) => { const el = document.elementFromPoint(x, y); return el?.closest(".boMapOverlay") ? "overlay" : el?.id || el?.className || el?.tagName || null; };
      const beside = [Under(Math.max(2, nav.left - 10)), Under(Math.min(innerWidth - 2, nav.right + 10))];
      view.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0, clientX: 300, clientY: 300 }));
      view.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 2, clientX: 300, clientY: 300 }));
      document.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, movementX: 40, movementY: 10 }));
      view.dispatchEvent(new WheelEvent("wheel", { bubbles: true, deltaY: 120 }));
      const during = { ...Now(), locked: !!T.Debug.PointerLock?.().locked };
      view.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, button: 2 }));
      view.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, button: 0 }));
      return { before, during, beside, mapOpen: T.Debug.Blockout.State().mapOpen };
    });
    await page.waitForTimeout(300);
    const leakAfter = await B(() => ({ yaw: window.Tengxian.player.yaw, fire: window.Tengxian.Debug.FireCount?.() ?? 0, locked: !!window.Tengxian.Debug.PointerLock?.().locked }));
    Check("全关总图开着：导航栏两边归遮罩；画布上按下 / 滚轮 / 移动不开枪、不抢锁、不换枪、不转头",
      leak.beside.every(b => b === "overlay") && leak.mapOpen && !leak.during.locked && !leakAfter.locked
        && leak.during.slot === leak.before.slot && leak.during.yaw === leak.before.yaw && leak.during.pitch === leak.before.pitch
        && !leak.during.ads && leakAfter.fire === leak.before.fire && leakAfter.yaw === leak.before.yaw,
      JSON.stringify({ ...leak, leakAfter }));
  }
  await B(() => window.Tengxian.Debug.Blockout.ToggleMap(false));

  // 高级工具菜单栏「关卡」菜单：白盒关卡编辑器那一项打勾（当前项），点了不重载
  const launcher = await page.evaluate(async () => {
    const T = window.Tengxian;
    T.editor.TogglePanel(true);
    const button = document.querySelector('#edRoot .edMenuBar [data-editor="blockout"]');
    const before = location.href;
    const on = !!button?.classList.contains("on");
    button?.click();
    await new Promise(r => setTimeout(r, 300));
    const count = document.querySelectorAll("#edRoot .edMenuBar [data-editor]").length;
    const menu = button?.closest(".edMenu")?.querySelector(".edMenuTitle")?.textContent || null;
    T.editor.TogglePanel(false);
    return { exists: !!button, on, label: button?.querySelector(".edMenuLabel")?.textContent ?? button?.textContent, menu, stayed: location.href === before, count };
  });
  Check("高级工具菜单栏「关卡」菜单里有「白盒关卡编辑器」，当前项打勾、点了不重载",
    launcher.exists && launcher.on && launcher.stayed && launcher.label === "白盒关卡编辑器" && launcher.menu === "关卡", JSON.stringify(launcher));

  // 6) 外部改配置：用 page.route 改响应（盘上的文件一个字节都不动）
  console.log("--- external edit");
  const editId = "07-2", iEdit = K(editId);
  let served = originalText, servedStatus = 200;
  const ServeConfig = (route) => route.fulfill({ status: servedStatus, contentType: "application/json", body: served });
  await GoTo(editId);
  await page.waitForTimeout(300);
  const kfEdit = configDoc.keyframes[iEdit];
  const walked = await B((pose) => window.Tengxian.Debug.Blockout.PlacePlayer(pose),
    { x: kfEdit.player.x + 1.2, z: kfEdit.player.z + 0.8, yawDeg: kfEdit.player.yawDeg });
  const posBefore = await PlayerPos();
  const marker = `外部改写测试 ${Date.now() % 100000}`;
  const edited = JSON.parse(originalText);
  edited.keyframes[iEdit].what = marker;
  const litters = edited.keyframes[iEdit].units.filter(u => u.kind === "litter");
  litters[0].bearers = 0;
  litters[1].bearers = 1;
  litters[2].state = "down";
  served = ConfigText(edited);
  let syncBefore = (await State()).syncCount;
  await page.route(CONFIG_RE, ServeConfig);
  const sync1 = await WaitSync(({ before, text, i }) => {
    const Bl = window.Tengxian.Debug.Blockout;
    return Bl.State().syncCount > before && Bl.Config().keyframes[i].what === text && document.querySelector("#blockoutRoot").textContent.includes(text);
  }, { before: syncBefore, text: marker, i: iEdit });
  const afterSync = await State();
  const posAfter = await PlayerPos();
  metrics.sync = { ms: sync1.ms, resyncMs: afterSync.lastSyncMs != null ? Math.round(afterSync.lastSyncMs * 10) / 10 : null, budgetMs: SYNC_BUDGET_MS };
  Check(`外部改了配置，${SYNC_BUDGET_MS} ms 内同步：卡片换字、停在同一关键帧`, sync1.ok && afterSync.id === editId && afterSync.configState !== "error",
    `${sync1.ms} ms（重摆 ${metrics.sync.resyncMs} ms），${JSON.stringify({ id: afterSync.id, state: afterSync.configState })}`);
  Check("外部同步时玩家留在原地（这一关键帧的 player 没改）", Math.hypot(posAfter.x - posBefore.x, posAfter.z - posBefore.z) < 0.05,
    `挪了 ${Math.hypot(posAfter.x - posBefore.x, posAfter.z - posBefore.z).toFixed(3)} m（之前走到 ${JSON.stringify(walked)}）`);
  const litterLook = await page.evaluate((ids) => {
    const T = window.Tengxian, units = new Map(T.Debug.Blockout.Units().map(u => [u.id, u]));
    return ids.map(id => {
      const bed = T.scene.getObjectByName(`BlockoutPuppet_${id}`)?.userData.stretcher;
      return { id, actors: units.get(id)?.actors ?? null, y: bed ? Math.round(bed.position.y * 100) / 100 : null, tilt: bed ? Math.round(bed.rotation.x * 100) / 100 : null };
    });
  }, litters.slice(0, 4).map(u => u.id));
  {
    const [none, one, down, two] = litterLook;
    const l = BLOCKOUT_PUPPETS.litter;
    Check("担架：bearers 0 只有担架放地上、1 只有一人抬（后头着地）、倒地的两人倒着担架落地、缺省两人抬",
      none.actors === 0 && Near(none.y, l.groundY, 0.01) && one.actors === 1 && one.tilt > 0.1 && down.actors === 2 && Near(down.y, l.groundY, 0.01)
        && two.actors === 2 && Near(two.y, l.y, 0.01), JSON.stringify(litterLook));
  }
  // 这一关键帧的 player 改了 → 挪过去
  const edited2 = JSON.parse(served);
  edited2.keyframes[iEdit].player.x = kfEdit.player.x + 2.5;
  served = ConfigText(edited2);
  syncBefore = (await State()).syncCount;
  const sync2 = await WaitSync(({ before }) => window.Tengxian.Debug.Blockout.State().syncCount > before, { before: syncBefore });
  const posMoved = await PlayerPos();
  Check("外部改了这一关键帧的 player：玩家挪到新机位", sync2.ok && Math.hypot(posMoved.x - (kfEdit.player.x + 2.5), posMoved.z - kfEdit.player.z) < 0.5,
    `${sync2.ms} ms，离新机位 ${Math.hypot(posMoved.x - (kfEdit.player.x + 2.5), posMoved.z - kfEdit.player.z).toFixed(3)} m`);
  // 文件写了一半（坏 JSON）：保留已载入的配置，只报一次
  const posHold = await PlayerPos();
  let rejectedBefore = (await State()).syncRejected;
  served = `{ "schema": "tengxian-blockout/1", "level": "FirstLevel", "keyframes": [ {`;
  const bad = await WaitSync(({ before }) => window.Tengxian.Debug.Blockout.State().syncRejected > before, { before: rejectedBefore });
  const badState = await B((i) => ({ state: window.Tengxian.Debug.Blockout.State(), what: window.Tengxian.Debug.Blockout.Config().keyframes[i].what,
    count: window.Tengxian.Debug.Blockout.Config().keyframes.length, marked: window.Tengxian.Debug.Blockout.Marked().length }), iEdit);
  const posBad = await PlayerPos();
  await page.waitForTimeout(BLOCKOUT_EDITOR.pollS * 1000 + 600);
  const badAgain = await State();
  Check("文件写了一半（坏 JSON）：不换掉已载入的配置，红点报原因，同一份坏文件只报一次",
    bad.ok && badState.state.configState === "error" && badState.state.staleConfig && badState.count === configDoc.keyframes.length
      && badState.state.id === editId && badState.what === marker && badState.marked > 0 && Math.hypot(posBad.x - posHold.x, posBad.z - posHold.z) < 0.05
      && badAgain.syncRejected === badState.state.syncRejected,
    JSON.stringify({ ms: bad.ok ? bad.ms : null, message: badState.state.configMessage, count: badState.count, id: badState.state.id, rejected: [badState.state.syncRejected, badAgain.syncRejected] }));
  const refused = await B(() => window.Tengxian.Debug.Blockout.SavePose());
  Check("盘上配置坏着时「记下当前机位」不去盖它", refused.ok === false && /先修好/.test(refused.reason || ""), JSON.stringify(refused));
  // 文件暂时没了（404）：同样保留
  rejectedBefore = (await State()).syncRejected;
  allowConfig404 = true;
  servedStatus = 404;
  served = "";
  const gone = await WaitSync(({ before }) => window.Tengxian.Debug.Blockout.State().syncRejected > before, { before: rejectedBefore });
  const goneState = await B(() => ({ state: window.Tengxian.Debug.Blockout.State(), count: window.Tengxian.Debug.Blockout.Config().keyframes.length }));
  Check("文件暂时没了（404）：不换成空配置、不传送玩家", gone.ok && goneState.state.configState === "error" && goneState.count === configDoc.keyframes.length
    && goneState.state.id === editId, JSON.stringify({ ms: gone.ok ? gone.ms : null, message: goneState.state.configMessage }));
  // 恢复：撤掉改写，读回盘上的原文
  servedStatus = 200;
  await page.unroute(CONFIG_RE, ServeConfig);
  syncBefore = (await State()).syncCount;
  const back = await WaitSync(({ before, text, i }) => {
    const Bl = window.Tengxian.Debug.Blockout;
    return Bl.State().syncCount > before && Bl.State().configState === "ok" && Bl.Config().keyframes[i].what === text;
  }, { before: syncBefore, text: kfEdit.what, i: iEdit });
  allowConfig404 = false;
  const backState = await State();
  Check("撤掉改写后读回原文：配置复原、红点消掉、停在同一关键帧", back.ok && backState.id === editId && !backState.staleConfig
    && backState.revision === originalRevision, `${back.ms} ms`);

  // 7) 存档的版本号（存档口用 page.route 假装：只看发出去的 revision，不写盘）
  console.log("--- save revision");
  {
    const posts = [];
    let saveMode = "ok";
    let external = null;
    served = originalText;
    const ServeStatus = (route) => route.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify({ writable: true, root: "/mock", revisions: { FirstLevel: "status-revision-must-not-be-used", SecondLevel: null } }) });
    const ServeSave = (route) => {
      const body = JSON.parse(route.request().postData() || "{}");
      posts.push({ revision: body.revision, level: body.level, player: body.doc?.keyframes?.[iEdit]?.player || null });
      if (saveMode === "ok") {
        served = ConfigText(body.doc);
        return route.fulfill({ status: 200, contentType: "application/json",
          body: JSON.stringify({ ok: true, level: body.level, file: "Taierzhuang1938/Blockout/FirstLevel.json", revision: Sha1(served), warnings: [] }) });
      }
      if (saveMode === "conflict") {
        served = external;
        return route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ ok: false, error: "版本号对不上", revision: Sha1(external) }) });
      }
      return route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ ok: false, error: "配置不合规", details: ["keyframes[0].player.x 要是有限数字"] }) });
    };
    await page.route(CONFIG_RE, ServeConfig);
    await page.route(/\/__blockout\/status/, ServeStatus);
    await page.route(/\/__blockout\/save/, ServeSave);
    await B((pose) => window.Tengxian.Debug.Blockout.PlacePlayer(pose), { x: kfEdit.player.x + 0.9, z: kfEdit.player.z - 0.6, yawDeg: 20 });
    const first = await B(() => window.Tengxian.Debug.Blockout.SavePose());
    const afterFirst = await State();
    const second = await B(() => window.Tengxian.Debug.Blockout.SavePose());
    Check("保存带的是读配置时按原始字节算的版本号（不是状态口当下的）", first.ok && first.mode === "server" && posts[0]?.revision === originalRevision,
      JSON.stringify({ sent: posts[0]?.revision, want: originalRevision }));
    Check("保存成功后改用端点返回的版本号", second.ok && afterFirst.revision === Sha1(served) && posts[1]?.revision === afterFirst.revision,
      JSON.stringify({ kept: afterFirst.revision, sent: posts[1]?.revision }));
    // 409：在外面被改过 → 重读（人不挪）并请用户再记一次
    const ext = JSON.parse(served);
    ext.keyframes[iEdit].what = `外面又改了 ${Date.now() % 1000}`;
    external = ConfigText(ext);
    saveMode = "conflict";
    const posC = await B((pose) => window.Tengxian.Debug.Blockout.PlacePlayer(pose), { x: kfEdit.player.x - 1.1, z: kfEdit.player.z + 0.4, yawDeg: -40 });
    const conflict = await B(() => window.Tengxian.Debug.Blockout.SavePose());
    const afterConflict = await B((i) => ({ state: window.Tengxian.Debug.Blockout.State(), kf: window.Tengxian.Debug.Blockout.Config().keyframes[i],
      toast: [...document.querySelectorAll("#blockoutRoot *")].some(el => el.children.length === 0 && el.textContent.includes("再点一次")) }), iEdit);
    const posAfterConflict = await PlayerPos();
    Check("409：重读了外面改过的配置、人不挪、提示再记一次、机位没被写进去",
      conflict.conflict === true && afterConflict.kf.what === ext.keyframes[iEdit].what && afterConflict.state.revision === Sha1(external)
        && Math.hypot(posAfterConflict.x - posC.x, posAfterConflict.z - posC.z) < 0.05 && afterConflict.toast
        && Near(afterConflict.kf.player.x, ext.keyframes[iEdit].player.x, 1e-6) && Near(afterConflict.kf.player.z, ext.keyframes[iEdit].player.z, 1e-6),
      JSON.stringify({ conflict: conflict.conflict, what: afterConflict.kf.what, toast: afterConflict.toast, player: afterConflict.kf.player }));
    // 400：存档口不收 → 机位还原，卡片与地图不显示没存上的机位
    saveMode = "bad";
    const playerBefore = await B((i) => window.Tengxian.Debug.Blockout.Config().keyframes[i].player, iEdit);
    await B((pose) => window.Tengxian.Debug.Blockout.PlacePlayer(pose), { x: kfEdit.player.x + 2, z: kfEdit.player.z + 2, yawDeg: 90 });
    const rejected = await B(() => window.Tengxian.Debug.Blockout.SavePose());
    const playerAfter = await B((i) => window.Tengxian.Debug.Blockout.Config().keyframes[i].player, iEdit);
    Check("存档口拒绝（400）：机位还原，配置里还是原来的机位", rejected.ok === false && !rejected.conflict
      && JSON.stringify(playerAfter) === JSON.stringify(playerBefore), JSON.stringify({ reason: rejected.reason, before: playerBefore, after: playerAfter }));
    await page.unroute(/\/__blockout\/save/, ServeSave);
    await page.unroute(/\/__blockout\/status/, ServeStatus);
    await page.unroute(CONFIG_RE, ServeConfig);
    syncBefore = (await State()).syncCount;
    const restored = await WaitSync(({ before, text, i }) => {
      const Bl = window.Tengxian.Debug.Blockout;
      return Bl.State().syncCount > before && Bl.Config().keyframes[i].what === text;
    }, { before: syncBefore, text: kfEdit.what, i: iEdit });
    Check("撤掉假存档口后读回盘上的原文", restored.ok && (await State()).revision === originalRevision, `${restored.ms} ms`);
  }

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
  await B(() => window.Tengxian.Debug.Blockout.PlacePlayer({ x: -60, z: 84, yawDeg: 180, pitchDeg: -8 }));
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(shotDir, "FirstLevel_River.png") });

  // 8) §10 视觉组：近处的射界扇淡掉，远处的照常（截图人工看）
  console.log("--- visual set");
  metrics.visual = {};
  let fansTotal = 0;
  for (const id of ["01-2", "02-1", "03-2", "08-2", "12-1", "18-2"]) {
    await GoTo(id);
    await page.waitForTimeout(900);
    await page.screenshot({ path: path.join(shotDir, `Kf_${id}.png`) });
    const fan = await page.evaluate(() => {
      const T = window.Tengxian, Bl = T.Debug.Blockout;
      const cam = T.camera.getWorldPosition(new T.camera.position.constructor());
      const marked = new Map(Bl.Marked().map(u => [u.id, u]));
      const fans = Bl.Stats().fans;
      const near = fans.filter(f => { const u = marked.get(f.id); return u && Math.hypot(u.x - cam.x, u.z - cam.z) < 5.5; });
      const nearArcs = Bl.Marked().filter(u => u.arc && Math.hypot(u.x - cam.x, u.z - cam.z) < 5.5).length;
      return { fans: fans.length, arcs: Bl.Marked().filter(u => u.arc).length, maxAlpha: Math.max(0, ...fans.map(f => f.alpha)), near: near.map(f => f.id), nearArcs };
    });
    metrics.visual[id] = fan;
    fansTotal += fan.fans;
    Check(`视觉组 ${id}：射界扇起点 6 m 内不画、填充不透明度 ≤ ${BLOCKOUT_FAN.fillAlpha}`, fan.near.length === 0 && fan.maxAlpha <= BLOCKOUT_FAN.fillAlpha + 1e-6,
      JSON.stringify(fan));
  }
  Check("视觉组里远处单位的射界扇照常画", fansTotal > 0, `共 ${fansTotal} 片`);

  // 10) 预演（§14）：注入一段最小的预演（page.route，不碰盘上的数据）
  console.log("--- previz");
  {
    const voice = { schema: "tengxian-blockout-voice/1", level: "FirstLevel", scenes: [{ id: "PrevizTest", lines: [
      { id: "PrevizTest.01", who: "luo", speaker: "罗班长", subtitle: "跟紧，莫抬头。", durationS: 1.6 },
    ] }] };
    const previzDoc = {
      schema: "tengxian-blockout-previz/1", level: "FirstLevel", voice: "./Blockout/__PrevizTest.voice.json",
      sequences: [{
        keyframe: "03-1", title: "预演测试", then: "next", durationS: 4,
        camera: [{ t: 0, dur: 4, from: { x: -40, z: -98, h: 3 }, to: { x: -36, z: -98, h: 3 }, look: { actor: "luo", offset: [0, 1.2, 0] }, fov: 50 }],
        actors: [
          { id: "luo", keys: [{ t: 0.5, faceTo: "player" }, { t: 1.5, weapon: "Dadao" }, { t: 3, x: -28, z: -110, move: "run", path: [{ x: -29, z: -109 }] }] },
          { id: "PrevizExtra", spawn: { side: "nra", x: -33, z: -101, yawDeg: 0 }, keys: [{ t: 1, x: -33, z: -104, move: "walk" }] },
          // 倒地、顺着朝向躺的人被拖着往西走 4 m（walk 1.4 m/s：约 0.64 s 出发、3.5 s 到）
          { id: "PrevizBody", spawn: { side: "nra", x: -33, z: -100, yawDeg: 90, state: "down", lie: "along" }, keys: [{ t: 3.5, x: -37, z: -100, move: "walk" }] },
        ],
        lines: [{ t: 0.3, line: "PrevizTest.01", actor: "luo" }],
        events: [{ t: 2.5, type: "flash", dur: 0.3 }, { t: 2.6, type: "sfx", name: "rifleShot" }],
      }],
    };
    const previzCheck = ValidateBlockoutPreviz(previzDoc, { config: configDoc, voice });
    Check("测试用预演过校验", previzCheck.ok, previzCheck.errors.join("；"));
    await page.route(/\/Blockout\/FirstLevel\.previz\.json/, (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(previzDoc) }));
    await page.route(/\/Blockout\/__PrevizTest\.voice\.json/, (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(voice) }));
    await B(() => window.Tengxian.Debug.Blockout.Previz.Reload());
    await GoTo("03-1");
    await page.waitForTimeout(200);
    const ready = await B(() => ({ has: window.Tengxian.Debug.Blockout.Previz.Has("03-1"), hasOther: window.Tengxian.Debug.Blockout.Previz.Has("03-2"),
      button: !document.querySelector(".boPrevizBtn")?.hidden }));
    Check("注入预演后：03-1 有预演、卡片出现预演按钮；别的关键帧没有", ready.has && !ready.hasOther && ready.button, JSON.stringify(ready));
    // 播：相机接管、字幕、导航栏锁住、标记藏起
    await B(() => { window.__previzDone = null; window.Tengxian.Debug.Blockout.Previz.Play("03-1").then(v => { window.__previzDone = v; }); });
    await WaitSync(() => { const s = window.Tengxian.Debug.Blockout.Previz.State(); return s.playing && s.t > 0.6; }, null, 15000);
    const live = await B(() => {
      const T = window.Tengxian, Bl = T.Debug.Blockout, P = Bl.Previz, s = P.State();
      const pose = P.CameraPose(s.t), cam = T.camera.position, eye = T.player.position;
      return { s, pose, cam: { x: cam.x, y: cam.y, z: cam.z }, eye: { x: eye.x, z: eye.z },
        subDom: [...document.querySelectorAll(".boPrevizSub .boPrevizText")].map(e => e.textContent),
        navLocked: document.querySelector(".boNav")?.classList.contains("locked"), labels: getComputedStyle(document.querySelector(".blockoutLabels")).display,
        card: document.querySelector(".boCard")?.classList.contains("previz"), mouse: Bl.State().previz, hud: document.body.classList.contains("blockoutPreviz"),
        viewmodel: T.viewmodel?.root?.visible ?? null };
    });
    // 相机是这一帧开头按上一帧的 t 摆的：比位置只要在镜头轨上（x 在 -40…-36、高 3 m 左右、离玩家几米）
    Check("预演播放中相机被接管（在镜头轨上，不在玩家眼睛那里）", live.s.playing && live.cam.x >= -40.05 && live.cam.x <= -35.95 && Math.abs(live.cam.z + 98) < 0.05
      && Math.hypot(live.cam.x - live.eye.x, live.cam.z - live.eye.z) > 3, JSON.stringify({ cam: live.cam, pose: live.pose?.position, t: live.s.t }));
    Check("预演播放中台词字幕出现（说话人 · 字幕）", live.s.subtitles.includes("跟紧，莫抬头。") && live.subDom.includes("跟紧，莫抬头。"), JSON.stringify(live.subDom));
    Check("预演播放中：卡片换成预演进度、导航栏锁住、头顶标签藏起、枪模与 HUD 让开、鼠标归预演",
      live.card && live.navLocked && live.labels === "none" && live.hud && live.mouse && live.viewmodel === false, JSON.stringify({ card: live.card, nav: live.navLocked, labels: live.labels, hud: live.hud, mouse: live.mouse, vm: live.viewmodel }));
    const indexDuring = (await State()).index;
    await page.keyboard.press("Period");
    Check("预演播放中按 . 不翻关键帧", (await State()).index === indexDuring);
    // Seek：单位位置 = SamplePrevizActor；同一 t 两次一样
    const seq = NormalizeBlockoutPreviz(previzDoc).sequences[0];
    const kf31 = configDoc.keyframes[K("03-1")];
    const playerAt = await PlayerPos();
    const SeekAt = (t) => B(async (t) => {
      const Bl = window.Tengxian.Debug.Blockout;
      await Bl.Previz.Seek(t);
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const units = Object.fromEntries(Bl.Units().map(u => [u.id, { x: u.x, z: u.z, yawDeg: u.yawDeg, visible: u.visible }]));
      const cam = window.Tengxian.camera;
      return { units, cam: { x: cam.position.x, y: cam.position.y, z: cam.position.z, rx: cam.rotation.x, ry: cam.rotation.y, fov: cam.fov }, state: Bl.Previz.State() };
    }, t);
    const s1 = await SeekAt(2.6), s2 = await SeekAt(2.6);
    const resolve = (id) => (id === "player" ? playerAt : null);
    const wantLuo = SamplePrevizActor(seq.actors[0], 2.6, kf31.units.find(u => u.id === "luo"), { resolve });
    const wantExtra = SamplePrevizActor(seq.actors[1], 2.6, null);
    const errLuo = Math.hypot(s1.units.luo.x - wantLuo.x, s1.units.luo.z - wantLuo.z);
    const errExtra = Math.hypot(s1.units.PrevizExtra.x - wantExtra.x, s1.units.PrevizExtra.z - wantExtra.z);
    Check("Seek(2.6) 后单位位置（罗班长跑到半路）等于 SamplePrevizActor（< 0.1 m，含临时加的人）", errLuo < 0.1 && errExtra < 0.1 && s1.state.paused,
      JSON.stringify({ luo: s1.units.luo, wantLuo: { x: wantLuo.x, z: wantLuo.z }, extra: s1.units.PrevizExtra, wantExtra: { x: wantExtra.x, z: wantExtra.z } }));
    Check("同一 t 两次 Seek：相机与单位一样（确定性）", JSON.stringify(s1.cam) === JSON.stringify(s2.cam) && JSON.stringify(s1.units) === JSON.stringify(s2.units),
      JSON.stringify({ a: s1.cam, b: s2.cam }));
    await page.screenshot({ path: path.join(shotDir, "Previz_03-1_seek2.6.png") });
    // 倒地的人被拖：一口气按 0.25 s 取样（同一次 evaluate 里），一直躺着、位置连续、头朝朝向
    const bodyRows = await B(async () => {
      const Bl = window.Tengxian.Debug.Blockout, out = [];
      for (let t = 0.25; t <= 3.75; t += 0.25) {
        await Bl.Previz.Seek(t);
        const p = Bl.Probe("PrevizBody");
        out.push({ t, x: p.x, z: p.z, yawDeg: p.yawDeg, headYawDeg: p.headYawDeg, down: p.down, dead: p.dead, moving: p.moving, pelvis: p.pelvisAboveGround, currentId: p.currentId });
      }
      return out;
    });
    const wantBody = (t) => SamplePrevizActor(seq.actors[2], t, null);
    const Wrap = (d) => ((d + 540) % 360) - 180;
    let bodyBad = bodyRows.filter(r => !r.down || !r.dead || !(r.pelvis < 0.45) || Math.hypot(r.x - wantBody(r.t).x, r.z - wantBody(r.t).z) > 0.05
      || Math.abs(Wrap(r.headYawDeg - r.yawDeg)) > 12);
    for (let i = 1; i < bodyRows.length; i++) if (Math.hypot(bodyRows[i].x - bodyRows[i - 1].x, bodyRows[i].z - bodyRows[i - 1].z) > 1.4 * 0.25 + 0.05) bodyBad.push({ jump: bodyRows[i] });
    const bodyMoved = Math.hypot(bodyRows.at(-1).x - bodyRows[0].x, bodyRows.at(-1).z - bodyRows[0].z);
    Check("预演里倒地的人（lie:along）被拖着走：一直躺着（dead、骨盆 < 0.45 m、头朝朝向）、位置连续地平移（每 0.25 s ≤ 0.4 m，不瞬移）",
      bodyBad.length === 0 && bodyMoved > 3.5 && bodyRows.some(r => r.moving), JSON.stringify({ moved: bodyMoved, bad: bodyBad.slice(0, 3), sample: bodyRows[6] }));
    // 预演键 weapon：t 1.5 起罗班长手里换成大刀
    const weaponRows = await B(async () => {
      const Bl = window.Tengxian.Debug.Blockout, out = {};
      for (const t of [1.0, 2.0]) { await Bl.Previz.Seek(t); out[t] = Bl.Probe("luo").weapon; }
      return out;
    });
    const luoWeapon = kf31.units.find(u => u.id === "luo").weapon;
    Check("预演键 weapon 切换后演员手里的武器变了（1.0 s 关键帧那把 → 2.0 s 大刀）", weaponRows[1] === luoWeapon && weaponRows[2] === "Dadao", JSON.stringify({ ...weaponRows, luoWeapon }));
    // 播完：按 then 跳到下一个关键帧，相机交还
    await B(() => window.Tengxian.Debug.Blockout.Previz.Resume());
    await WaitSync(() => window.__previzDone !== null, null, 10000);
    await page.waitForTimeout(150);
    const after = await B(() => {
      const T = window.Tengxian, s = T.Debug.Blockout.State(), cam = T.camera.position, p = T.player.position;
      return { done: window.__previzDone, id: s.id, playing: T.Debug.Blockout.Previz.State().playing, units: T.Debug.Blockout.Units().map(u => u.id),
        camToEye: Math.hypot(cam.x - p.x, cam.z - p.z), hud: document.body.classList.contains("blockoutPreviz"), vm: T.viewmodel?.root?.visible ?? null,
        nav: document.querySelector(".boNav")?.classList.contains("locked") };
    });
    Check("播完按 then 跳到下一个关键帧（03-2），临时加的人回收，相机、枪模、HUD、导航栏交还",
      after.done === true && after.id === "03-2" && !after.playing && !after.units.includes("PrevizExtra") && !after.units.includes("PrevizBody") && after.camToEye < 0.3 && !after.hud && after.vm === true && !after.nav,
      JSON.stringify(after));
    {
      const luo32 = configDoc.keyframes[K("03-2")].units.find(u => u.id === "luo");
      const w = await B(() => window.Tengxian.Debug.Blockout.Probe("luo")?.weapon ?? null);
      Check("预演交还后罗班长手里换回关键帧那把", !luo32 || w === (luo32.weapon ?? null), JSON.stringify({ w, want: luo32?.weapon }));
    }
    // 中断：N 播、Esc 中断
    await GoTo("03-1");
    await page.waitForTimeout(150);
    await page.keyboard.press("KeyN");
    await WaitSync(() => window.Tengxian.Debug.Blockout.Previz.State().playing, null, 10000);
    await page.waitForTimeout(400);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(150);
    const stopped = await B(() => {
      const T = window.Tengxian, cam = T.camera.position, p = T.player.position;
      return { playing: T.Debug.Blockout.Previz.State().playing, id: T.Debug.Blockout.State().id, camToEye: Math.hypot(cam.x - p.x, cam.z - p.z),
        hud: document.body.classList.contains("blockoutPreviz"), labels: getComputedStyle(document.querySelector(".blockoutLabels")).display,
        units: T.Debug.Blockout.Units().map(u => u.id) };
    });
    Check("N 播、Esc 中断：停在 then 的关键帧，相机与界面交还，临时的人回收", !stopped.playing && stopped.id === "03-2" && stopped.camToEye < 0.3 && !stopped.hud
      && stopped.labels !== "none" && !stopped.units.includes("PrevizExtra"), JSON.stringify(stopped));
    // 蹲着的友军步枪兵是真蹲（KneelHold / CrouchIdle），不是友军步态的扛枪半蹲（AllyCrouchCarryStand，骨盆 0.66 m，看着像站着）
    const crouchKf = configDoc.keyframes.find(k => k.units.some(u => u.side === "nra" && u.kind === "soldier" && u.stance === "crouch" && u.state !== "down" && !u.aim));
    if (crouchKf) {
      const unit = crouchKf.units.find(u => u.side === "nra" && u.kind === "soldier" && u.stance === "crouch" && u.state !== "down" && !u.aim);
      await GoTo(crouchKf.id);
      await page.waitForTimeout(1200);
      const probe = await B((id) => window.Tengxian.Debug.Blockout.Probe(id), unit.id);
      Check(`蹲着的友军是真蹲（${crouchKf.id} ${unit.id}）`, probe && probe.currentId !== "AllyCrouchCarryStand" && probe.pelvisAboveGround < 0.55,
        JSON.stringify({ currentId: probe?.currentId, pelvis: probe?.pelvisAboveGround }));
    }
    await page.unroute(/\/Blockout\/FirstLevel\.previz\.json/);
    await page.unroute(/\/Blockout\/__PrevizTest\.voice\.json/);
  }

  // 4) 切关
  console.log("--- switch level");
  const firstBounds = await page.evaluate(() => ({ ...window.Tengxian.battlefield.bounds }));
  const switchStart = Date.now();
  await B(() => window.Tengxian.Debug.Blockout.SwitchLevel("SecondLevel"));
  metrics.switchMs = Date.now() - switchStart;
  const second = await page.evaluate(() => {
    const T = window.Tengxian, Bl = T.Debug.Blockout;
    const bf = T.battlefield;
    return { state: Bl.State(), bounds: { ...bf.bounds }, layoutId: bf.layout.id, groundAtCenter: bf.GroundHeight(555, -65),
      url: location.search, player: { x: T.player.position.x, z: T.player.position.z } };
  });
  const secondBackdrop = await B(() => window.Tengxian.Debug.Blockout.Stats().backdrop);
  Check("没写 backdrop 的关卡（第二关）不建远景层、远平面照旧 650（2026-10-20）", secondBackdrop.built === false && secondBackdrop.cameraFar === 650,
    JSON.stringify(secondBackdrop));
  Check("切到第二关：场景边界与地形都换了、地址栏改了", second.state.level === "SecondLevel" && second.layoutId === "BlockoutSecondLevel"
    && second.bounds.minX !== firstBounds.minX && /level=SecondLevel/.test(second.url) && second.groundAtCenter < -1,
  JSON.stringify({ bounds: second.bounds, layout: second.layoutId, gully: second.groundAtCenter.toFixed(2), url: second.url, ms: metrics.switchMs }));
  // 烘图走空闲回调，满负载的机器上 0.8 s 不一定排得到：等到烘完（上限 8 s）再判
  await WaitSync(() => {
    const map = window.Tengxian.Debug.Blockout.Stats().map;
    return map.levelKey === "SecondLevel" && map.doneAt !== null;
  }, null, 8000);
  const secondBake = await B(() => window.Tengxian.Debug.Blockout.Stats().map);
  Check("切关建完就烘这一关的纸面地图", secondBake.levelKey === "SecondLevel" && secondBake.doneAt !== null, JSON.stringify({ levelKey: secondBake.levelKey, doneAt: secondBake.doneAt }));
  await page.screenshot({ path: path.join(shotDir, "SecondLevel.png") });
  await B(() => window.Tengxian.Debug.Blockout.SwitchLevel("FirstLevel"));
  const back2 = await page.evaluate(() => ({ state: window.Tengxian.Debug.Blockout.State(), layoutId: window.Tengxian.battlefield.layout.id,
    bounds: { ...window.Tengxian.battlefield.bounds } }));
  Check("再切回第一关", back2.state.level === "FirstLevel" && back2.layoutId === "BlockoutFirstLevel" && back2.bounds.minX === firstBounds.minX
    && back2.state.count === configDoc.keyframes.length, JSON.stringify({ layout: back2.layoutId, count: back2.state.count }));
  await GoTo("03-1");
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(shotDir, "FirstLevel_03-1.png") });

  // 本地存档退化：ServeRoot 没有存档口，「记下当前机位」只能存本地草稿
  const save = await page.evaluate(async () => {
    const result = await window.Tengxian.Debug.Blockout.SavePose();
    let draft = null;
    try { draft = localStorage.getItem("tengxian1938_blockout_FirstLevel"); localStorage.removeItem("tengxian1938_blockout_FirstLevel"); } catch (error) { /* */ }
    return { mode: result.mode, ok: result.ok, reason: result.reason, draft: !!draft };
  });
  Check("没有本机存档口时「记下当前机位」退化成本地草稿并写明原因", save.mode === "local" && save.draft && !!save.reason, JSON.stringify(save));
  const persisted = await page.evaluate(() => { try { return localStorage.getItem("tengxian1938_debug_options_v1"); } catch (error) { return "?"; } });
  Check("无敌 / 无限弹药只在本会话生效，不写调试选项存档", persisted === null, String(persisted));

  // 「复制当前位置」（§4.2）：按钮 / P 键写剪贴板；写不进去弹出选好文字的框；「重现」链接原样打开回到同一机位
  console.log("--- copy snapshot");
  await GoTo("06-1");
  await B(() => window.Tengxian.Debug.Blockout.PlacePlayer({ x: -33.4, z: -96.2, yawDeg: -120, pitchDeg: -4, stance: "stand" }));
  await page.waitForTimeout(300);
  await B(() => { window.__copied = []; navigator.clipboard.writeText = async (text) => { window.__copied.push(text); }; });
  await page.click(".boCopy");
  await WaitSync(() => window.__copied.length >= 1, null, 3000);
  const copied = await B(() => ({ text: window.__copied[0] || "", player: { x: window.Tengxian.player.position.x, z: window.Tengxian.player.position.z,
    yawDeg: window.Tengxian.player.yaw * 180 / Math.PI } }));
  const snap = ParseBlockoutSnapshot(copied.text);
  Check("复制按钮把当前位置写进剪贴板：关卡、关键帧、玩家机位对得上，末行数据能解析回来",
    !!snap && snap.level === "FirstLevel" && snap.keyframe?.id === "06-1" && Math.abs(snap.player.x - copied.player.x) < 0.01
      && Math.abs(snap.player.z - copied.player.z) < 0.01 && Math.abs(snap.player.yawDeg - copied.player.yawDeg) < 0.06
      && /关键帧：06-1/.test(copied.text) && /重现这个机位：http/.test(copied.text) && ["block", "ground", "none"].includes(snap.aim.kind),
    copied.text.split("\n").slice(0, 9).join(" / ").slice(0, 400));
  await page.keyboard.press("KeyP");
  const viaKey = await WaitSync(() => window.__copied.length >= 2, null, 3000);
  Check("按 P 也能复制", viaKey.ok);
  // 低头看脚下：准星落在地面；对着一块有名字的墙：认得出是哪一块
  // 相机跟着玩家要等下一帧才转过去：摆完人等两帧再取快照
  const ground = await B(async () => {
    const Frames = (n) => new Promise(resolve => { let k = 0; const step = () => (++k >= n ? resolve() : requestAnimationFrame(step)); requestAnimationFrame(step); });
    const Bl = window.Tengxian.Debug.Blockout;
    const p = window.Tengxian.player.position;
    Bl.PlacePlayer({ x: p.x, z: p.z, yawDeg: -120, pitchDeg: -75, stance: "stand" });
    await Frames(2);
    return Bl.Snapshot().aim;
  });
  Check("低头时准星落点是地面、就在脚边", ground.kind === "ground" && ground.distM < 4, JSON.stringify(ground));
  const named = await B(async () => {
    const Frames = (n) => new Promise(resolve => { let k = 0; const step = () => (++k >= n ? resolve() : requestAnimationFrame(step)); requestAnimationFrame(step); });
    const T = window.Tengxian, Bl = T.Debug.Blockout;
    const tried = [];
    const blocks = T.battlefield.layout.blocks.filter(b => b.id && b.solid !== false && !b.ry && b.h >= 2.2 && b.w >= 2 && b.d >= 1 && b.tag !== "airWall" && !b.blockoutWater);
    for (const b of blocks.slice(0, 60)) {
      const x = b.x + b.w / 2 + 3, z = b.z;
      Bl.PlacePlayer({ x, z, yawDeg: 90, pitchDeg: 0, stance: "stand" });
      const p = T.player.position;
      if (Math.abs(p.x - x) > 0.05 || Math.abs(p.z - z) > 0.05) continue;
      await Frames(2);
      const aim = Bl.Snapshot().aim;
      tried.push(`${b.id}:${aim.id || aim.kind}`);
      if (aim.kind === "block" && aim.id === b.id) return { ok: true, id: b.id, distM: aim.distM, tried: tried.length };
    }
    return { ok: false, tried: tried.slice(0, 8) };
  });
  Check("准星对着体块时写得出体块 id（离墙 3 m 看过去）", named.ok && Math.abs(named.distM - 3) < 0.4, JSON.stringify(named));
  await GoTo("06-1");
  // 剪贴板两条路都被拒：弹出选好文字的框，Esc 收起；框里按 . 不翻关键帧
  await B(() => {
    navigator.clipboard.writeText = async () => { throw new DOMException("denied", "NotAllowedError"); };
    document.execCommand = () => false;
  });
  await page.click(".boCopy");
  await WaitSync(() => !!document.querySelector(".boCopyBox:not([hidden])"), null, 3000);
  const box = await B(() => {
    const area = document.querySelector(".boCopyBox:not([hidden]) .boCopyText");
    return { shown: !!area, focused: document.activeElement === area, selected: area ? area.selectionEnd - area.selectionStart : 0,
      length: area?.value.length || 0, hasData: /\n数据：\{/.test(area?.value || "") };
  });
  const indexBefore = (await State()).index;
  await page.keyboard.press("Period");
  const indexAfter = (await State()).index;
  await page.keyboard.press("Escape");
  const boxHidden = await B(() => !document.querySelector(".boCopyBox:not([hidden])"));
  Check("剪贴板写不进去时弹出选好文字的框，框里按 . 不翻关键帧，Esc 收起",
    box.shown && box.focused && box.selected === box.length && box.hasData && indexAfter === indexBefore && boxHidden,
    JSON.stringify({ ...box, indexBefore, indexAfter, boxHidden }));
  // 「重现」链接：重新打开页面，落在同一关键帧、同一机位，地址栏里的 pose 被收掉
  const reproduce = new URL(snap.reproduce);
  await page.goto(reproduce.toString(), { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => window.Tengxian?.state?.ready && window.Tengxian?.Debug?.Blockout?.State().ready, null, { timeout: 300000 });
  await page.waitForTimeout(300);
  const reopened = await B(() => ({ state: window.Tengxian.Debug.Blockout.State(), x: window.Tengxian.player.position.x, z: window.Tengxian.player.position.z,
    yawDeg: window.Tengxian.player.yaw * 180 / Math.PI, search: location.search }));
  Check("「重现」链接打开后回到同一关键帧与机位，地址栏不再带 pose",
    reopened.state.id === "06-1" && Math.hypot(reopened.x - snap.player.x, reopened.z - snap.player.z) < 0.3
      && Math.abs(reopened.yawDeg - snap.player.yawDeg) < 0.2 && !/pose=/.test(reopened.search),
    JSON.stringify({ id: reopened.state.id, x: reopened.x.toFixed(2), z: reopened.z.toFixed(2), yaw: reopened.yawDeg.toFixed(1), want: snap.player, search: reopened.search }));

  // 远景层（§2.2 backdrop，2026-10-20）：01–05 写了 backdrop —— 建出远景地面与体块、远平面拉到 backdrop.far、
  // 远景网格不进 battlefield（不碰撞、不进寻路）、玩家范围不变；远景里的树一起种进树的实例里
  console.log("--- backdrop (FirstLevel0105)");
  await B(() => window.Tengxian.Debug.Blockout.SwitchLevel("FirstLevel0105"));
  await WaitSync(() => window.Tengxian.Debug.Blockout.Stats().backdrop.built === true, null, 20000);
  const bd = await B(() => {
    const T = window.Tengxian, st = T.Debug.Blockout.Stats().backdrop, bf = T.battlefield;
    const fieldMeshes = new Set(bf.meshes || []);
    let inField = 0, meshes = 0;
    T.scene?.traverse?.((o) => { if (o.userData?.blockoutBackdrop) { meshes += 1; if (fieldMeshes.has(o)) inField += 1; } });
    return { st, inField, meshes, bounds: { ...bf.bounds }, layoutFar: bf.layout.cameraFar, trees: T.Debug.Blockout.Stats().trees,
      shapes: bf.layout.backdrop?.shapes?.filter((s) => s.kind === "tree").length ?? 0, blocks: bf.layout.blocks.length,
      treeBlocks: bf.layout.blocks.filter((b) => b.blockoutTree).length };
  });
  Check("01–05 远景层：地面 + 体块建出来、远平面 = backdrop.far、不进场地网格、玩家范围是场地边界",
    bd.st.built && bd.st.meshes >= 3 && bd.st.triangles > 10000 && bd.st.cameraFar === bd.st.far && bd.st.far >= 5000 && bd.inField === 0 && bd.meshes === bd.st.meshes
      && bd.bounds.minZ === -480 && bd.st.texture && bd.st.texture.width >= 1024,
    JSON.stringify({ meshes: bd.st.meshes, tris: bd.st.triangles, far: bd.st.cameraFar, inField: bd.inField, tex: bd.st.texture, bounds: bd.bounds, ms: bd.st.buildMs }));
  Check("01–05 远景层的树（村 A、田野上零星的树）和场地里的树一起种", bd.trees.count === bd.treeBlocks + bd.shapes && bd.shapes > 30,
    JSON.stringify({ trees: bd.trees, treeBlocks: bd.treeBlocks, backdropTrees: bd.shapes }));
  await page.screenshot({ path: path.join(shotDir, "FirstLevel0105_Backdrop.png") });

  // 三层新标记（§5.5，2026-10-20）：0610 的地标从场景文件读进来、狗洞地标在 09-2 的画面里有线框和标签；
  // 「地标」「站位」开关关掉后几何与标签真的没了；「标签」三档：全部 > 有名字的 > 关；选择记进 localStorage；右上六个开关
  console.log("--- landmarks / stations / label modes (FirstLevel0610)");
  await B(() => window.Tengxian.Debug.Blockout.SwitchLevel("FirstLevel0610"));
  await WaitSync(() => window.Tengxian.Debug.Blockout.State().ready && window.Tengxian.Debug.Blockout.State().level === "FirstLevel0610" && window.Tengxian.Debug.Blockout.Stats().landmarks > 0, null, 30000);
  await GoTo("09-2");
  // 09-2 的机位俯角 30°，狗洞的标签在画面上方外头：抬一点头看洞
  await B(() => { const Bl = window.Tengxian.Debug.Blockout; const kf = Bl.Config().keyframes.find(k => k.id === "09-2"); Bl.PlacePlayer({ ...kf.player, pitchDeg: -8 }); });
  await page.waitForTimeout(900);
  const lm = await B(() => {
    const Bl = window.Tengxian.Debug.Blockout;
    const list = Bl.Landmarks();
    const dog = list.find(l => l.name === "狗洞");
    return { count: list.length, kinds: [...new Set(list.map(l => l.kind))].sort(), dog, stats: Bl.Stats().markers, labels: Bl.Labels(), layers: Bl.State().layers,
      buttons: [...document.querySelectorAll(".boLayer")].map(b => b.dataset.layer) };
  });
  Check("0610 的地标从场景文件读进来（≥ 40 个、七种 kind 都有）、标记层画了它们", lm.count >= 40 && lm.kinds.length === 7 && lm.stats.landmarks === lm.count,
    JSON.stringify({ count: lm.count, kinds: lm.kinds, drawn: lm.stats.landmarks }));
  Check("09-2 画面里有狗洞地标：线框几何在、头顶挂着「狗洞」标签", !!lm.dog && lm.dog.kind === "hole" && lm.dog.w > 0 && lm.stats.lines > 100 && lm.labels.landmarks.includes("狗洞"),
    JSON.stringify({ dog: lm.dog, lines: lm.stats.lines, labels: lm.labels.landmarks }));
  Check("站位层：25 个关键帧的站位都画了，近处挂着「拍号 + 名字」的标签", lm.stats.stations === 25 && lm.labels.stations.length > 0 && lm.labels.stations.every(t => /^\d\d-\d /.test(t)),
    JSON.stringify({ stations: lm.stats.stations, labels: lm.labels.stations.slice(0, 4) }));
  Check("右上六个图层开关（射界 / 去向 / 标签 / 穿墙显示 / 地标 / 站位），缺省地标、站位开、标签 = 有名字的",
    lm.buttons.join() === "arcs,intents,labels,xray,landmarks,stations" && lm.layers.landmarks === true && lm.layers.stations === true && lm.layers.labels === "named", JSON.stringify({ buttons: lm.buttons, layers: lm.layers }));
  const toggles = await page.evaluate(async () => {
    const Bl = window.Tengxian.Debug.Blockout;
    const Frame = () => new Promise(r => setTimeout(r, 700));
    const out = {};
    document.querySelector('.boLayer[data-layer="landmarks"]').click(); await Frame();
    out.lmOff = { layer: Bl.State().layers.landmarks, drawn: Bl.Stats().markers.landmarks, labels: Bl.Labels().landmarks.length, dom: [...document.querySelectorAll(".blockoutLabel")].some(e => e.style.display !== "none" && e.dataset.layer === "landmarks") };
    document.querySelector('.boLayer[data-layer="landmarks"]').click(); await Frame();
    out.lmOn = { layer: Bl.State().layers.landmarks, drawn: Bl.Stats().markers.landmarks, labels: Bl.Labels().landmarks.length };
    document.querySelector('.boLayer[data-layer="stations"]').click(); await Frame();
    out.stOff = { layer: Bl.State().layers.stations, drawn: Bl.Stats().markers.stations, labels: Bl.Labels().stations.length };
    document.querySelector('.boLayer[data-layer="stations"]').click(); await Frame();
    out.stOn = { drawn: Bl.Stats().markers.stations };
    // 标签三档：点一下 → 全部（无名的人也有字），再点 → 关，再点 → 有名字的。09-2 画面里的人都有名字，换到 08-3 站着看主街（沟里 / 街上有无名的走着的伤员）
    await Bl.GoTo("08-3", { animate: false });
    const kf83 = Bl.Config().keyframes.find(k => k.id === "08-3");
    Bl.PlacePlayer({ ...kf83.player, stance: "stand", pitchDeg: -4 });
    await Frame(); await Frame();
    const named = Bl.Stats().markers.unitLabels;
    document.querySelector('.boLayer[data-layer="labels"]').click(); await Frame();
    out.all = { layer: Bl.State().layers.labels, unitLabels: Bl.Stats().markers.unitLabels, texts: Bl.Labels().units.filter(t => /^(国军|日军|百姓|伤员|担架)/.test(t)).slice(0, 5), cls: document.querySelector('.boLayer[data-layer="labels"]').className };
    document.querySelector('.boLayer[data-layer="labels"]').click(); await Frame();
    out.off = { layer: Bl.State().layers.labels, unitLabels: Bl.Stats().markers.unitLabels, cls: document.querySelector('.boLayer[data-layer="labels"]').className };
    document.querySelector('.boLayer[data-layer="labels"]').click(); await Frame();
    out.named = { layer: Bl.State().layers.labels, unitLabels: Bl.Stats().markers.unitLabels, before: named, texts: Bl.Labels().units.filter(t => /^(国军|日军|百姓|伤员|担架)/.test(t)) };
    out.stored = JSON.parse(localStorage.getItem("tengxian1938_blockout_layers") || "null");
    return out;
  });
  Check("「地标」关：线框与标签都没了；再开回来", toggles.lmOff.layer === false && toggles.lmOff.drawn === 0 && toggles.lmOff.labels === 0 && !toggles.lmOff.dom
    && toggles.lmOn.layer === true && toggles.lmOn.drawn === lm.count && toggles.lmOn.labels > 0, JSON.stringify({ off: toggles.lmOff, on: toggles.lmOn }));
  Check("「站位」关：站位几何与标签都没了；再开回来", toggles.stOff.layer === false && toggles.stOff.drawn === 0 && toggles.stOff.labels === 0 && toggles.stOn.drawn === 25, JSON.stringify(toggles.stOff));
  // 数标签个数不可靠：「全部」档的字更宽，避让时会挤掉几个；看的是有没有兜底文字
  Check("「标签」三档：全部时无名的人按身份写字（国军 / 伤员 …）、关时一个都没有、再点回有名字的（没有兜底文字）",
    toggles.all.layer === "all" && toggles.all.texts.length > 0 && /\ball\b/.test(toggles.all.cls)
      && toggles.off.layer === "off" && toggles.off.unitLabels === 0 && !/\bon\b/.test(toggles.off.cls) && toggles.named.layer === "named" && toggles.named.texts.length === 0 && toggles.named.unitLabels > 0,
    JSON.stringify({ all: toggles.all, off: { layer: toggles.off.layer, n: toggles.off.unitLabels }, named: toggles.named }));
  Check("开关的选择记进 localStorage（六个键）", toggles.stored && Object.keys(toggles.stored).sort().join() === "arcs,intents,labels,landmarks,stations,xray" && toggles.stored.labels === "named",
    JSON.stringify(toggles.stored));
  await page.screenshot({ path: path.join(shotDir, "FirstLevel0610_09-2_Landmarks.png") });

  Check("全程没有未捕获错误", errors.length === 0, errors.slice(0, 5).join(" | "));
} finally {
  const after = await fs.readFile(configPath);
  Check("Blockout/FirstLevel.json 没被测试改动（前后逐字节相同）", Buffer.compare(after, originalConfig) === 0);
  await browser.close();
  server.close();
}

console.log(`--- metrics ${JSON.stringify(metrics)}`);
const failed = results.filter(r => !r.ok);
console.log(`EditorBlockoutBrowserTest: ${results.length - failed.length}/${results.length} passed`);
assert.equal(failed.length, 0, failed.map(r => r.name).join("; "));
