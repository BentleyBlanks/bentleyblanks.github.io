// ===========================================================================
// Script_EnvironmentBrowserTest.mjs —— 组件式环境系统与环境编辑器的浏览器闸门（docs/Data_Environment.md §9）
//
// 跑法：node Taierzhuang1938/Script_EnvironmentBrowserTest.mjs [--no-formal]
//
// 打开 ?editor=blockout&level=FirstLevel0105&env=1（白盒场景 FirstLevelWhitebox），钉住完整流程：
//   1. 场景的环境接上了：兜底区域、八种组件全由它提供、12:00 拼出来的环境参数 = firstLevelBattleDay，面板开机就打开；
//   2. 外面（agent）改了区域文件：2 s 内面板重读（时钟不动）；
//   3. 昼夜：时间条「黄昏」按钮拨到 18:00；12 / 18 / 20 / 22 点画面确实变了，夜比白天暗，20 点的亮度不超过 18 与 22 点；
//   4. 配置区域 + 添加组件：新建盒子区域、在面板里「＋ 添加组件」搜「雾」加上、改浓度；观察点钉进区域 → 雾的来源换成这个区域、
//      从当时的实际值过渡（时长 = blendS），过渡中时钟照走；走出去按 blendS 退回；
//   5. 撤销 / 重做（面板里 Ctrl+Z / Ctrl+Y）；拖区域手柄改尺寸（算一步撤销）；
//   6. 昼夜时间轴：开、选参数展开、整列复制 22:00 粘到 02:00；
//   7. 保存：预设先存（新文件 revision null）、区域文件后存（带读文件时的 sha1），存的内容过校验；409 时挂冲突横幅；
//   8. 临时覆盖（Debug.ApplySky）变成最高优先级的一层，撤掉后回到区域 + 时钟；
//   9. 一拍几点：关键帧写的 time（测试里注入 02-1 黄昏 / 02E-1 20 点 / 03-1 22 点）跳过去就拨钟、后面的帧沿用、顺着走一帧按过渡往前拨；
//      面板「写进这一拍」写进关键帧；角色光照夜里亮、白天关，X Bot 替身也挂着那段补丁；
//  10. 切到正式场景（试玩用的 FirstLevel）：读的是它自己的兜底区域与预设；
//  11. 正片第一关（?whitebox=p012，--no-campaign 跳过）：读 Environment/Level_FirstLevelCampaign.json（复用 EnvPreset_FirstLevel），
//      12:00 = 它原来的天；高级工具 → 场景 → 环境开的是游戏内面板，「这一拍」是任务步骤，写进区域文件的 stages 并存盘；
//      全程没有未捕获错误。
// 存盘口在页面里拦截（page.route），不写仓库文件。截图存 _shots/Environment/（不提交）。
// ===========================================================================

import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";
import { ValidateEnvPreset, ValidateSceneEnv, FormatEnvJson } from "./Script_EnvPreset.mjs";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(projectDir, "..");
const shotDir = path.join(projectDir, "_shots", "Environment");
await fs.mkdir(shotDir, { recursive: true });
const campaignOnly = process.argv.includes("--campaign-only");
const withFormal = !process.argv.includes("--no-formal");
const withCampaign = !process.argv.includes("--no-campaign");

const results = [];
function Check(name, ok, detail = "") {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? "  — " + detail : ""}`);
}
const J = (v) => JSON.stringify(v);
const Sha1 = (text) => createHash("sha1").update(text, "utf8").digest("hex");

// --- 假存盘口：版本号从盘上的真文件算；保存只记下来、更新版本号，不落盘 ---
const revisions = { presets: {}, scenes: {} };
for (const name of await fs.readdir(path.join(projectDir, "Environment"))) {
  const m = /^EnvPreset_(\w+)\.json$/.exec(name);
  if (m) revisions.presets[m[1]] = Sha1(await fs.readFile(path.join(projectDir, "Environment", name), "utf8"));
}
for (const scene of ["FirstLevelWhitebox", "FirstLevel"]) {
  revisions.scenes[scene] = Sha1(await fs.readFile(path.join(projectDir, "Scenes", scene, `Environment_${scene}.json`), "utf8"));
}
revisions.levels = { FirstLevelCampaign: Sha1(await fs.readFile(path.join(projectDir, "Environment", "Level_FirstLevelCampaign.json"), "utf8")) };
// 第 9 步：给 01–05 的三个关键帧注入「这一拍几点」（不改盘上的配置）
const config0105 = JSON.parse(await fs.readFile(path.join(projectDir, "Blockout", "FirstLevel0105.json"), "utf8"));
const BEAT_TIMES = { "02-1": { look: "dusk" }, "02E-1": { hour: 20 }, "03-1": { hour: 22 } };
for (const kf of config0105.keyframes) if (BEAT_TIMES[kf.id]) kf.time = BEAT_TIMES[kf.id];
const config0105Text = `${JSON.stringify(config0105, null, 2)}\n`;
const saves = [];
let conflictNext = false;
/** 假盘：存过的预设 / 区域文件按存的内容回给页面（真盘上没有，面板之后重读时要读得到）。 */
const mockDisk = new Map();
let agentRevision = null;   // 第 2 步 agent 改过的区域文件的版本号（面板读到的就是它）

const server = await ServeRoot(rootDir, 0);
const port = server.address().port;
const browser = await LaunchBrowser();
const errors = [];
const Table = (kind) => (kind === "preset" ? revisions.presets : kind === "level" ? revisions.levels : revisions.scenes);
const DiskPath = (kind, id) => (kind === "preset" ? `Environment/EnvPreset_${id}.json` : kind === "level" ? `Environment/Level_${id}.json` : `Scenes/${id}/Environment_${id}.json`);
/** 两个页面（白盒编辑器、正片第一关）共用：错误收集、假存盘口、假盘。 */
async function InstallEnvironment(pg) {
  pg.on("pageerror", (error) => errors.push(`PAGEERROR ${String(error).slice(0, 300)}`));
  pg.on("console", (message) => {
    if (message.type() !== "error") return;
    const url = message.location()?.url || "";
    if (/fonts\.(googleapis|gstatic)\.com/.test(url) || /__blockout|__scene/.test(url + message.text())) return;
    if (/\/Animation\/Previz\w+\/Data_Previz\w+Animation\.json/.test(url) && /404/.test(message.text())) return;
    if (/\.previz\.json|\.play\.json/.test(url) && /404/.test(message.text())) return;
    if (/__environment\/save/.test(url) && /409/.test(message.text())) return;   // 第 7 步故意造的冲突
    errors.push(`CONSOLE ${message.text().slice(0, 240)} @ ${url}`);
  });
  await pg.route("**/__environment/status", (route) => route.fulfill({ json: { writable: true, root: rootDir, presets: revisions.presets, scenes: revisions.scenes, levels: revisions.levels } }));
  await pg.route("**/__environment/save", async (route) => {
    const body = route.request().postDataJSON();
    saves.push(body);
    const current = Table(body.kind)[body.id] ?? null;
    if (conflictNext || body.revision !== current) {
      conflictNext = false;
      return route.fulfill({ status: 409, json: { ok: false, error: "版本号对不上", revision: current } });
    }
    const text = FormatEnvJson(body.doc);
    const revision = Sha1(text);
    Table(body.kind)[body.id] = revision;
    mockDisk.set(DiskPath(body.kind, body.id), text);
    return route.fulfill({ json: { ok: true, kind: body.kind, id: body.id, file: `Taierzhuang1938/${DiskPath(body.kind, body.id)}`, revision, warnings: [] } });
  });
  await pg.route(/\/Taierzhuang1938\/(Environment\/(EnvPreset|Level)_\w+\.json|Scenes\/\w+\/Environment_\w+\.json)(\?.*)?$/, (route) => {
    const rel = /\/Taierzhuang1938\/([^?]+)/.exec(route.request().url())[1];
    return mockDisk.has(rel) ? route.fulfill({ status: 200, contentType: "application/json", body: mockDisk.get(rel) }) : route.continue();
  });
}
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await InstallEnvironment(page);
await page.route(/\/Taierzhuang1938\/Blockout\/FirstLevel0105\.json(\?.*)?$/, (route) => route.fulfill({ status: 200, contentType: "application/json", body: config0105Text }));

const B = (fn, arg) => page.evaluate(fn, arg);
async function Wait(predicate, arg, timeout = 15000) {
  try { await page.waitForFunction(predicate, arg, { timeout, polling: 100 }); return true; } catch { return false; }
}
const Frames = (n = 3) => B((n) => new Promise((resolve) => { let k = 0; const step = () => (++k >= n ? resolve() : requestAnimationFrame(step)); requestAnimationFrame(step); }), n);
/** 放开鼠标（同真人按 Esc）：锁着时白盒界面是 inert 的，点不到面板、拖不了手柄。 */
async function Unlock() { await B(() => window.Tengxian.Debug.ReleasePointerLock?.()); await Frames(2); }
const Shot = (name, clip) => page.screenshot({ path: path.join(shotDir, name), ...(clip ? { clip } : {}) });
/** 画面某一块的平均亮度（0–255）：截图交回页面里解码再数像素。 */
async function Luma(clip) {
  const png = await page.screenshot({ clip });
  return B(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.width; c.height = img.height;
    const g = c.getContext("2d");
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let sum = 0, n = 0;
    for (let i = 0; i < d.length; i += 16) { sum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; n += 1; }
    return sum / n;
  }, png.toString("base64"));
}
const VIEW = { x: 420, y: 120, width: 380, height: 560 };   // 卡片与环境面板之间的那块画面

try {
  if (!campaignOnly) {
  console.log("--- boot");
  await page.goto(`http://127.0.0.1:${port}/Taierzhuang1938/?editor=blockout&level=FirstLevel0105&env=1&scale=small`, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => window.Tengxian?.state?.ready && window.Tengxian?.Debug?.Blockout?.State().ready, null, { timeout: 300000 });
  await B(() => window.Tengxian.Debug.Blockout.Environment.Open());
  const opened = await Wait(() => { const s = window.Tengxian.Debug.Blockout.Environment.State(); return s.open && s.scene === "FirstLevelWhitebox"; }, null, 60000);
  const boot = await B(async () => {
    const L = window.Tengxian.Debug.Lighting;
    const { SKY_PRESETS } = await import("./Script_Sky.mjs");
    const day = SKY_PRESETS.firstLevelBattleDay;
    const out = L.Output();
    const fields = ["sunElevation", "sunAzimuth", "lightColor", "lightIntensity", "exposure", "envIntensity", "saturation", "contrast"];
    const same = fields.every((f) => Math.abs(out[f] - day[f]) < 1e-9) && JSON.stringify(out.fog.sky) === JSON.stringify(day.fog.sky) && out.fog.density === day.fog.density;
    const s = L.State();
    return { active: s.active, scene: s.sceneId, hour: s.clock.hour, profile: s.profile, sources: L.Sources().map((x) => x.id),
      allFallback: Object.values(s.components).every((c) => c.source?.id === "Fallback"), same, panel: !!document.querySelector(".boRoot .envPanel:not([hidden])") };
  });
  Check("环境面板开机就打开、读的是白盒场景", opened && boot.panel, J({ opened, panel: boot.panel }));
  Check("场景环境接上：兜底区域提供全部八种组件", boot.active && boot.scene === "FirstLevelWhitebox" && boot.allFallback && J(boot.sources) === J(["Fallback"]), J(boot));
  Check("12:00 拼出来的环境参数 = firstLevelBattleDay（白盒原来的天）", boot.hour === 12 && boot.same && boot.profile === "firstLevelBattleDay", J(boot));

  // 2) agent 改了区域文件
  console.log("--- external sync");
  const sceneDoc = JSON.parse(await fs.readFile(path.join(projectDir, "Scenes/FirstLevelWhitebox/Environment_FirstLevelWhitebox.json"), "utf8"));
  sceneDoc.volumes.push({ id: "AgentProbe", name: "agent 加的球", shape: "sphere", priority: 5, blendS: 1, mode: "partial", preset: "FirstLevelWhitebox", center: [0, 0, -400], radius: 6 });
  const agentSceneText = FormatEnvJson(sceneDoc);
  mockDisk.set("Scenes/FirstLevelWhitebox/Environment_FirstLevelWhitebox.json", agentSceneText);
  revisions.scenes.FirstLevelWhitebox = Sha1(agentSceneText);
  agentRevision = Sha1(agentSceneText);
  const synced = await Wait(() => window.Tengxian.Debug.Blockout.Environment.Scene()?.volumes.some((v) => v.id === "AgentProbe"), null, 8000);
  const afterSync = await B(() => ({ hour: window.Tengxian.Debug.Lighting.State().clock.hour, dirty: window.Tengxian.Debug.Blockout.Environment.State().dirty }));
  Check("外面改了区域文件：2 s 内重读，时钟不动、没有脏标记", synced && afterSync.hour === 12 && !afterSync.dirty.length, J(afterSync));

  // 3) 昼夜
  console.log("--- day cycle");
  await B(() => {
    const blk = window.Tengxian.Debug.Blockout;
    blk.SetLayers({ labels: false, arcs: false, intents: false, landmarks: false, stations: false });
    blk.Fly(true, { x: 60, y: 22, z: 150, yawDeg: 55, pitchDeg: -8 });
  });
  await Frames(20);
  const lum = {};
  for (const hour of [12, 18, 20, 22]) {
    await B((h) => window.Tengxian.Debug.Lighting.SetHour(h), hour);
    await Frames(12);
    await page.waitForTimeout(700);   // 反射贴图限频重烘（0.5 s）
    await Frames(4);
    lum[hour] = await Luma(VIEW);
    await Shot(`Hour${String(hour).padStart(2, "0")}.png`);
  }
  Check("昼夜拨时间画面真的变了（白天 / 黄昏 / 晚上三张不一样）", Math.abs(lum[12] - lum[18]) > 3 && Math.abs(lum[18] - lum[22]) > 3, J(lum));
  Check("晚上比白天暗", lum[22] < lum[12] * 0.75, J(lum));
  Check("20 点（黄昏 → 夜）不比两头都亮", lum[20] <= Math.max(lum[18], lum[22]) + 4, J(lum));
  await Unlock();
  await page.click(".envLook[data-look='dusk']");
  await Frames(3);
  const duskHour = await B(() => window.Tengxian.Debug.Lighting.State().clock.hour);
  Check("时间条「黄昏」按钮拨到 18:00", duskHour === 18, `hour ${duskHour}`);
  await B(() => window.Tengxian.Debug.Lighting.SetHour(12));
  await Frames(6);

  // 4) 区域 + 添加组件 + 过渡
  console.log("--- volume + component + transition");
  const vol = await B(() => {
    const E = window.Tengxian.Debug.Blockout.Environment;
    const id = E.AddVolume("box", { center: [40, 4, 100], size: [20, 12, 20] });
    E.SetTab("volume");
    return { id, preset: E.Scene().volumes.find((v) => v.id === id).preset, state: E.State() };
  });
  Check("新建盒子区域（Volume1）：引用一份新预设、选中它", vol.id === "Volume1" && vol.state.selectedVolume === vol.id && vol.state.dirty.includes("scene") && vol.state.dirty.includes(`preset:${vol.preset}`), J(vol));
  await Unlock();
  await page.click(".envPage-volume .envAdd");
  await page.fill(".envPage-volume .envAddMenu .envSearch", "雾");
  await page.keyboard.press("Enter");
  await Frames(3);
  const added = await B((pid) => {
    const preset = window.Tengxian.Debug.Blockout.Environment.Preset(pid);
    return { types: Object.keys(preset.components), card: !!document.querySelector(".envPage-volume .envCard[data-type='Fog']") };
  }, vol.preset);
  Check("面板里「＋ 添加组件」搜「雾」加上（卡片出现）", J(added.types) === J(["Fog"]) && added.card, J(added));
  // 卡片里的数值框改浓度（commit）
  await page.fill(".envPage-volume .envCard[data-type='Fog'] .envParam[data-param='Fog.density'] .envNum", "0.03");
  await page.press(".envPage-volume .envCard[data-type='Fog'] .envParam[data-param='Fog.density'] .envNum", "Enter");
  await Frames(3);
  const density = await B((pid) => window.Tengxian.Debug.Blockout.Environment.Preset(pid).components.Fog.params.density, vol.preset);
  Check("卡片数值框改浓度写进预设", density === 0.03, `density ${density}`);
  const before = await B(() => ({ fog: window.Tengxian.Debug.Lighting.Values("Fog").density, src: window.Tengxian.Debug.Lighting.State().components.Fog.source.id }));
  await B(() => { const L = window.Tengxian.Debug.Lighting; L.Observer("pinned", { x: 40, y: 4, z: 100 }); L.Play(1); });
  await page.waitForTimeout(600);
  const mid = await B(() => { const L = window.Tengxian.Debug.Lighting; return { fog: L.Values("Fog").density, t: L.State().components.Fog.transition, src: L.State().components.Fog.source.id, sun: L.State().components.Sun.source.id, hour: L.State().clock.hour }; });
  Check("观察点进区域：雾的来源换成区域，主光仍来自兜底", mid.src === vol.id && mid.sun === "Fallback", J(mid));
  Check("从当时的实际值过渡（进行中）", mid.t > 0 && mid.t < 1 && mid.fog > before.fog && mid.fog < 0.03, J({ before, mid }));
  Check("过渡中时钟照走", mid.hour > 12, `hour ${mid.hour}`);
  // 过渡按游戏帧的 dt 走（无头浏览器帧率低、dt 有上限，墙上时间会比 2 s 长）：等它走完
  await Wait(() => window.Tengxian.Debug.Lighting.State().components.Fog.transition === 1, null, 20000);
  const settled = await B(() => { const L = window.Tengxian.Debug.Lighting; return { fog: L.Values("Fog").density, t: L.State().components.Fog.transition }; });
  Check("过渡走完（blendS 2 s）落到区域的值", settled.t === 1 && Math.abs(settled.fog - 0.03) < 1e-9, J(settled));
  await B(() => { const L = window.Tengxian.Debug.Lighting; L.Pause(); L.SetHour(12); L.Observer("pinned", { x: 400, y: 0, z: 400 }); });
  await page.waitForTimeout(700);
  const leaving = await B(() => window.Tengxian.Debug.Lighting.State().components.Fog);
  Check("走出区域按 blendS 退回兜底", leaving.source.id === "Fallback" && leaving.transition < 1, J(leaving));
  await Wait(() => window.Tengxian.Debug.Lighting.State().components.Fog.transition === 1, null, 20000);
  await B(() => window.Tengxian.Debug.Lighting.Observer("camera"));

  // 5) 撤销 / 重做 + 拖手柄
  console.log("--- undo / gizmo");
  const histBefore = await B(() => window.Tengxian.Debug.Blockout.Environment.State().history);
  await Unlock();
  await page.click(".envPanel .envTitle");
  await page.keyboard.press("Control+KeyZ");
  await Frames(2);
  const undone = await B((pid) => window.Tengxian.Debug.Blockout.Environment.Preset(pid).components.Fog?.params?.density, vol.preset);
  await page.keyboard.press("Control+KeyY");
  await Frames(2);
  const redone = await B((pid) => window.Tengxian.Debug.Blockout.Environment.Preset(pid).components.Fog?.params?.density, vol.preset);
  Check("Ctrl+Z 撤掉改浓度、Ctrl+Y 重做", undone !== 0.03 && redone === 0.03, J({ undone, redone, histBefore }));
  await B((id) => {
    const blk = window.Tengxian.Debug.Blockout, E = blk.Environment;
    E.SelectVolume(id); E.FlyTo(id);
    blk.FlyPose({ x: 35 });
  }, vol.id);
  await Frames(10);
  await Unlock();
  // 拖左边那个面（x-）：右边的 x+ 常被环境面板挡住
  const handle = await B(() => {
    const h = window.Tengxian.Debug.Blockout.Environment.Gizmo.HandleScreen("x-");
    return h ? { ...h, under: document.elementFromPoint(h.x, h.y)?.id || document.elementFromPoint(h.x, h.y)?.className || null } : null;
  });
  const gizmo = await B(() => ({ ...window.Tengxian.Debug.Blockout.Environment.Gizmo.State(), objects: window.Tengxian.Debug.Blockout.Environment.Gizmo.Objects() }));
  const boxObj = gizmo.objects.find((o) => o.id === vol.id);
  Check("选中的盒子画出来（琥珀色填充）、有 7 个手柄", gizmo.visible && boxObj?.visible && boxObj.fill?.opacity > 0.2 && gizmo.handles.length === 7, J({ handles: gizmo.handles, box: boxObj }));
  await Shot("Gizmo.png");
  let dragged = null;
  if (handle?.visible && handle.under === "view") {
    const sizeBefore = await B((id) => window.Tengxian.Debug.Blockout.Environment.Scene().volumes.find((v) => v.id === id).size[0], vol.id);
    const hist0 = await B(() => window.Tengxian.Debug.Blockout.Environment.State().history);
    await page.mouse.move(handle.x, handle.y);
    await page.mouse.down();
    for (let i = 1; i <= 8; i += 1) { await page.mouse.move(handle.x - i * 12, handle.y); await Frames(1); }
    await page.mouse.up();
    await Frames(2);
    dragged = await B((id) => ({ size: window.Tengxian.Debug.Blockout.Environment.Scene().volumes.find((v) => v.id === id).size[0], hist: window.Tengxian.Debug.Blockout.Environment.State().history, locked: document.pointerLockElement !== null }), vol.id);
    Check("拖 x- 手柄改宽度（整次拖动算一步撤销、不抢指针锁）", dragged.size > sizeBefore + 0.5 && dragged.hist === hist0 + 1 && !dragged.locked, J({ sizeBefore, ...dragged, hist0 }));
    await Shot("GizmoDragged.png");
  } else Check("拖 x- 手柄改宽度", false, `手柄不在画面上 ${J(handle)}`);

  // 6) 时间轴
  console.log("--- timeline");
  const tl = await B(() => {
    const E = window.Tengxian.Debug.Blockout.Environment;
    E.SelectPreset("FirstLevelWhitebox");
    E.SetTab("preset");
    const T = E.Timeline;
    T.Open({ presetId: "FirstLevelWhitebox", type: "Sun", key: "intensity" });
    E.SetHour(22);
    T.CopyColumn();
    E.SetHour(2);
    const keysBefore = E.Preset("FirstLevelWhitebox").components.Fog.params.density.keys.length;
    T.PasteColumn();
    const keysAfter = E.Preset("FirstLevelWhitebox").components.Fog.params.density.keys.length;
    T.SetInterp("linear");
    const interp = E.Preset("FirstLevelWhitebox").components.Sun.params.intensity.interp;
    return { state: T.State(), keysBefore, keysAfter, interp };
  });
  await Frames(4);
  const tlDom = await B(() => ({ open: !!document.querySelector(".boRoot .envTimeline:not([hidden])"), lanes: document.querySelectorAll(".envTlLane").length, openLane: !!document.querySelector(".envTlLane.open") }));
  Check("昼夜时间轴打开、按组件列出关键帧参数、选中的那一行展开", tl.state.open && tlDom.open && tlDom.lanes > 10 && tlDom.openLane && tl.state.selected === "Sun.intensity", J({ ...tlDom, rows: tl.state.rows.length }));
  Check("整列复制 22:00 粘到 02:00（插了一帧）", tl.keysAfter === tl.keysBefore + 1, J({ before: tl.keysBefore, after: tl.keysAfter }));
  Check("时间轴改选中那一行的插值（主光强度 → 线性）", tl.interp === "linear", tl.interp);
  await Shot("Timeline.png");

  // 7) 保存
  console.log("--- save");
  await Unlock();
  await page.click(".envPanel .envBtn.primary");
  await Wait(() => !window.Tengxian.Debug.Blockout.Environment.State().dirty.length, null, 8000);
  const saved = saves.map((s) => ({ kind: s.kind, id: s.id, revision: s.revision }));
  const presetSave = saves.find((s) => s.kind === "preset" && s.id === vol.preset);
  const sceneSave = saves.find((s) => s.kind === "scene");
  Check("保存：新预设按新文件存（revision null）、排在区域文件前面", presetSave?.revision === null && saves.indexOf(presetSave) < saves.indexOf(sceneSave), J(saved));
  Check("保存：区域文件带读文件时的版本号", sceneSave?.revision === agentRevision, J(saved));
  Check("存的内容过校验", saves.every((s) => (s.kind === "preset" ? ValidateEnvPreset(s.doc).ok : ValidateSceneEnv(s.doc).ok)), "");
  Check("保存后没有脏标记", (await B(() => window.Tengxian.Debug.Blockout.Environment.State().dirty)).length === 0, "");
  await B(() => window.Tengxian.Debug.Blockout.Environment.SetParam("FirstLevelWhitebox", "Grade", "bloom", 0.2));
  conflictNext = true;
  const conflict = await B(async () => { const E = window.Tengxian.Debug.Blockout.Environment; const r = await E.Save(); return { r, state: E.State(), banner: document.querySelector(".envStatus")?.textContent || "" }; });
  Check("409：不当成存好了，挂冲突横幅（重新读取 / 先不管）", conflict.r.ok === false && !!conflict.state.conflict && conflict.state.dirty.length > 0 && /改过/.test(conflict.banner) && /重新读取/.test(conflict.banner), J({ r: conflict.r, banner: conflict.banner }));

  // 8) 临时覆盖
  console.log("--- override");
  const ov = await B(async () => {
    const L = window.Tengxian.Debug.Lighting;
    window.Tengxian.Debug.ApplySky("firstLevelNight");
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const during = { profile: L.State().profile, src: L.State().components.Sun.source?.kind, top: L.Sources()[0].kind };
    return during;
  });
  Check("旧换天接口变成最高优先级的临时覆盖", ov.profile === "firstLevelNight" && ov.src === "override" && ov.top === "override", J(ov));
  await Unlock();
  await page.click(".envTab:nth-child(1)");
  await Frames(3);
  const released = await B(async () => {
    const L = window.Tengxian.Debug.Lighting;
    const btn = [...document.querySelectorAll(".envSrcRow .envBtn")].find((b) => b.textContent === "撤掉");
    btn?.click();
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    return { clicked: !!btn, src: L.State().components.Sun.source?.id, profile: L.State().profile };
  });
  Check("总览里「撤掉」临时覆盖，回到兜底区域", released.clicked && released.src === "Fallback", J(released));
  await Shot("Overview.png");

  // 9) 一拍几点 + 角色光照
  console.log("--- beat time + character light");
  const beat = await B(async () => {
    const blk = window.Tengxian.Debug.Blockout, L = window.Tengxian.Debug.Lighting, E = blk.Environment;
    const at = async (id, options) => { await blk.GoTo(id, options); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); return { hour: L.State().clock.hour, beat: E.Beat() }; };
    const r = {};
    r.first = await at("01-1");
    r.dusk = await at("02-1");
    r.inherit = await at("02-4");
    r.night = await at("03-1");
    r.charNight = L.CharacterLight();
    r.back = await at("01-2");
    r.charDay = L.CharacterLight();
    await at("02-7");
    blk.GoTo("02E-1", { animate: true });   // 不等：Promise 在关键帧过渡走完才 resolve，那时钟早拨到了
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    r.rampStart = { hour: L.State().clock.hour, tween: !!L.State().tween };
    return r;
  });
  // 往前拨按每帧 dt 走（机器忙时 dt 被夹住，墙钟上会慢于 blendS）：等它拨完
  const rampEnd = await page.waitForFunction(() => { const s = window.Tengxian.Debug.Lighting.State(); return s.tween ? null : s.clock.hour; }, null, { timeout: 30000, polling: 100 })
    .then((h) => h.jsonValue()).catch(() => null);
  Check("这一拍几点：第一次写之前的帧用区域文件默认时刻（12）", beat.first.hour === 12 && beat.first.beat?.from === null, J(beat.first));
  Check("跳到写了黄昏的关键帧拨到 18 点", beat.dusk.hour === 18 && beat.dusk.beat.from === "02-1", J(beat.dusk));
  Check("后面没写的帧沿用前面的（02-4 沿用 02-1）", beat.inherit.hour === 18 && beat.inherit.beat.from === "02-1", J(beat.inherit));
  Check("写 hour 的帧拨到那个钟点（03-1 = 22 点）", beat.night.hour === 22, J(beat.night));
  Check("往回跳回到默认时刻", beat.back.hour === 12, J(beat.back));
  Check("顺着往下一帧走（带过渡）按过渡往前拨（02-7 的 18 点 → 02E-1 的 20 点）", beat.rampStart.tween && beat.rampStart.hour < 20 && Math.abs(rampEnd - 20) < 1e-6, J({ ...beat.rampStart, rampEnd }));
  Check("角色光照：晚上冷色补光 + 轮廓光，人物（X Bot 替身）材质挂着补丁", beat.charNight.fill > 0.1 && beat.charNight.rim > 0.25 && beat.charNight.patched > 0, J(beat.charNight));
  Check("角色光照：白天关掉（两路 0）", beat.charDay.fill === 0 && beat.charDay.rim === 0, J(beat.charDay));
  await B(() => window.Tengxian.Debug.Blockout.GoTo("03-1"));
  await Frames(8);
  await page.waitForTimeout(700);
  await Shot("BeatNight.png");
  const written = await B(async () => {
    const blk = window.Tengxian.Debug.Blockout, E = blk.Environment, L = window.Tengxian.Debug.Lighting;
    await blk.GoTo("01-3");
    L.SetHour(9);
    await E.WriteBeat({ hour: 9 });
    return { kf: blk.Config().keyframes.find((k) => k.id === "01-3").time, beat: E.Beat(), text: document.querySelector(".envBeat")?.textContent || "" };
  });
  Check("面板「写进这一拍」写进当前关键帧（这里没有存盘口：存成本地草稿）", written.kf?.hour === 9 && written.beat.from === "01-3" && /写在这一拍/.test(written.text), J(written));

  // 10) 正式场景
  if (withFormal) {
    console.log("--- formal scene");
    await B(() => window.Tengxian.Debug.Blockout.Environment.Reload(true));
    await B(() => window.Tengxian.Debug.Blockout.Play.UseScene("play"));
    const formal = await Wait(() => window.Tengxian.Debug.Lighting.State().sceneId === "FirstLevel" && window.Tengxian.Debug.Blockout.State().ready, null, 240000);
    await Wait(() => window.Tengxian.Debug.Blockout.Environment.State().scene === "FirstLevel", null, 20000);
    const f = await B(() => {
      const L = window.Tengxian.Debug.Lighting;
      return { scene: L.State().sceneId, sources: L.Sources().map((s) => `${s.id}:${s.presetId}`), looks: L.State().looks.map((l) => l.id), panel: window.Tengxian.Debug.Blockout.Environment.State().scene };
    });
    Check("正式场景读自己的兜底区域与预设（白天 / 黄昏 / 晚上）", formal && f.scene === "FirstLevel" && J(f.sources) === J(["Fallback:FirstLevel"]) && J(f.looks) === J(["day", "dusk", "night"]) && f.panel === "FirstLevel", J(f));
    await B(() => window.Tengxian.Debug.Lighting.SetLook("dusk"));
    await Frames(10);
    await page.waitForTimeout(700);
    await Shot("FormalDusk.png");
  }

  }
  // 11) 正片第一关
  if (withCampaign) {
    console.log("--- campaign (?whitebox=p012)");
    const game = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await InstallEnvironment(game);
    const G = (fn, arg) => game.evaluate(fn, arg);
    await game.goto(`http://127.0.0.1:${port}/Taierzhuang1938/?whitebox=p012&quality=low&scale=small`, { waitUntil: "load", timeout: 180000 });
    await game.waitForFunction(() => window.Tengxian?.state?.ready, null, { timeout: 480000, polling: 500 });
    const c = await G(async () => {
      const L = window.Tengxian.Debug.Lighting;
      const { SKY_PRESETS } = await import("./Script_Sky.mjs");
      const day = SKY_PRESETS.firstLevelBattleDay, out = L.Output(), s = L.State();
      const fields = ["sunElevation", "sunAzimuth", "lightColor", "lightIntensity", "exposure", "envIntensity", "saturation", "contrast"];
      return { active: s.active, kind: s.kind, scene: s.sceneId, profile: s.profile, sources: L.Sources().map((x) => `${x.id}:${x.presetId}`),
        same: fields.every((f) => Math.abs(out[f] - day[f]) < 1e-9) && out.fog.density === day.fog.density, char: L.CharacterLight() };
    });
    Check("正片第一关读 Environment/Level_FirstLevelCampaign.json，兜底复用 EnvPreset_FirstLevel", c.active && c.kind === "level" && c.scene === "FirstLevelCampaign" && J(c.sources) === J(["Fallback:FirstLevel"]), J(c));
    Check("正片第一关 12:00 = 它原来的天（firstLevelBattleDay），角色光照关着", c.same && c.profile === "firstLevelBattleDay" && c.char.fill === 0 && c.char.rim === 0, J({ same: c.same, profile: c.profile, char: c.char }));
    await game.context().route("**/__environment/status", (route) => route.fulfill({ json: { writable: true, root: rootDir, presets: revisions.presets, scenes: revisions.scenes, levels: revisions.levels } }));
    await game.context().route("**/__environment/save", async (route) => {
      const body = route.request().postDataJSON(); saves.push(body);
      const current = Table(body.kind)[body.id] ?? null;
      if (body.revision !== current) return route.fulfill({ status: 409, json: { ok: false, error: "版本号对不上", revision: current } });
      const text = FormatEnvJson(body.doc), revision = Sha1(text);
      Table(body.kind)[body.id] = revision; mockDisk.set(DiskPath(body.kind, body.id), text);
      return route.fulfill({ json: { ok: true, file: DiskPath(body.kind, body.id), revision } });
    });
    const popupReady = game.waitForEvent("popup");
    await G(() => window.Tengxian.editor.ToggleDebugTool("environment"));
    const popup = await popupReady;
    await popup.setViewportSize({ width: 1280, height: 720 });
    popup.on("pageerror", (error) => errors.push(String(error)));
    await popup.waitForFunction(() => window.EnvironmentWindow?.ready, null, { timeout: 30000 });
    const panel = await popup.evaluate(() => ({ kind: window.EnvironmentWindow.editor.loadedKind,
      scene: window.EnvironmentWindow.editor.loadedScene, beat: document.querySelector(".envBeat")?.textContent }));
    Check("Debug工具环境窗口连接正片关卡，并显示当前任务步骤", panel.kind === "level" && panel.scene === "FirstLevelCampaign" && /任务步骤/.test(panel.beat), J(panel));
    await G(() => window.Tengxian.Debug.ReleasePointerLock?.());
    await G(() => window.Tengxian.Debug.Lighting.SetHour(18));
    await popup.waitForTimeout(300);
    await popup.click(".envBeatRow .envBtn:not([disabled])");
    await popup.waitForTimeout(300);
    const savesBefore = saves.length;
    await popup.click(".envBtn.primary");
    await popup.waitForTimeout(1500);
    const levelSave = saves.slice(savesBefore).find((s) => s.kind === "level");
    const step = await G(() => { const m = window.Tengxian.Debug.FirstLevelMission(); return m?.phase?.id ?? m?.step ?? null; });
    Check("「写进这一拍」写进区域文件的 stages（黄昏），保存走 kind: level、带读文件时的版本号", !!levelSave && levelSave.id === "FirstLevelCampaign"
      && Object.values(levelSave.doc.stages || {}).some((spec) => spec.look === "dusk") && levelSave.revision === Sha1(await fs.readFile(path.join(projectDir, "Environment", "Level_FirstLevelCampaign.json"), "utf8")),
      J({ step, stages: levelSave?.doc.stages, revision: levelSave?.revision }));
    await popup.screenshot({ path: path.join(shotDir, "CampaignPanel.png") });
    await popup.close();
    await game.waitForFunction(() => !window.Tengxian.editor.DebugToolStates().find((entry) => entry.id === "environment").on, null, { timeout: 5000 });
    Check("关闭环境窗口后 Debug 开关复位", await G(() => !window.Tengxian.editor.DebugToolStates().find((entry) => entry.id === "environment").on));
    await game.close();
  }
  Check("全程没有未捕获错误", errors.length === 0, errors.slice(0, 5).join(" | "));
} catch (error) {
  Check("没有抛错", false, String(error?.stack || error).slice(0, 600));
} finally {
  await browser.close();
  server.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\nEnvironmentBrowserTest：${results.length - failed.length}/${results.length} 通过；截图 ${path.relative(rootDir, shotDir)}`);
process.exit(failed.length ? 1 : 0);
