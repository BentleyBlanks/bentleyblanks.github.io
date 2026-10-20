// ===========================================================================
// Script_EditorBlockoutMapEditBrowserTest.mjs —— 全关总图「编辑布设」的浏览器闸门（docs/Data_EditorBlockout.md §4.4，2026-10-21）
//
// 跑法：node Taierzhuang1938/Script_EditorBlockoutMapEditBrowserTest.mjs
// 开 ?editor=blockout&level=FirstLevel0610&kf=08-1（无头、静音），全程用真鼠标 / 键盘：
//   1. 点图头「编辑布设」开关 → 工具栏、检查器出来；
//   2. 拖狗洞地标往东 40 px → 记一条地标挪动，挪动量 = 40 px / 比例（吸附到 0.1 m）、检查器认出是狗洞；
//   3. 拖当前关键帧的幺娃 → 记一条人的挪动（带关键帧 id 和配置路径）；
//   4. Shift + 拖空地框住老耿家灶屋 → 选中 ≥ 8 块，拖其中一块 → 每块挪动量一样；
//   5. 加标记：点工具 → 点图 → 检查器文字框有焦点，敲字（里面敲 M / . 不关图、不翻关键帧）→ 标记带字；
//   6. 画布上 Ctrl+Z 撤掉一步、Ctrl+Y 重做；方向键微调 0.1 m；
//   7. 「导出给 Agent」：剪贴板（给了权限）里那段文字末行能解析，条目数对得上；
//   8. 关掉开关：地图照旧（点关键帧能跳）；关图再开，改动还在；
//   9. 全程没有未捕获错误；Blockout/FirstLevel0610.json 与 .scene.json 前后逐字节相同（不存盘）。
// 截图存 _shots/EditorBlockoutMapEdit/（不提交）。
// ===========================================================================

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";
import { ParseLayoutEdit } from "./Script_EditorBlockoutLayoutEdit.mjs";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(projectDir, "..");
const shotDir = path.join(projectDir, "_shots", "EditorBlockoutMapEdit");
const configFile = path.join(projectDir, "Blockout", "FirstLevel0610.json");
const sceneFile = path.join(projectDir, "Blockout", "FirstLevel0610.scene.json");
await fs.mkdir(shotDir, { recursive: true });
const shots = !process.argv.includes("--no-shots");

const results = [];
function Check(name, ok, detail = "") {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? "  — " + detail : ""}`);
}
const configBefore = await fs.readFile(configFile);
const sceneBefore = await fs.readFile(sceneFile);

const server = await ServeRoot(rootDir, 0);
const port = server.address().port;
const browser = await LaunchBrowser();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: `http://127.0.0.1:${port}` }).catch(() => {});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(`PAGEERROR ${String(error).slice(0, 300)}`));
page.on("console", (message) => {
  if (message.type() !== "error") return;
  const url = message.location()?.url || "";
  if (/fonts\.(googleapis|gstatic)\.com/.test(url) || /__blockout/.test(url) || /__blockout/.test(message.text())) return;
  if (/\.previz\.json(\?|$)/.test(url) && /404/.test(message.text())) return;
  errors.push(`CONSOLE ${message.text().slice(0, 240)} @ ${url}`);
});

const LE = (fn, arg) => page.evaluate(fn, arg);
const Shot = async (name) => { if (shots) await page.screenshot({ path: path.join(shotDir, `${name}.png`) }); };
const Point = (x, z) => LE(([x, z]) => window.Tengxian.Debug.Blockout.LayoutEdit.ScreenPoint(x, z), [x, z]);
const Moves = () => LE(() => [...window.Tengxian.Debug.Blockout.LayoutEdit.Session().moves.values()].map(m => JSON.parse(JSON.stringify(m))));
const EditState = () => LE(() => window.Tengxian.Debug.Blockout.LayoutEdit.State());
async function Drag(from, to, { steps = 8, shift = false } = {}) {
  if (shift) await page.keyboard.down("Shift");
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) await page.mouse.move(from.x + (to.x - from.x) * i / steps, from.y + (to.y - from.y) * i / steps);
  await page.mouse.up();
  if (shift) await page.keyboard.up("Shift");
  await page.waitForTimeout(80);
}

try {
  await page.goto(`http://127.0.0.1:${port}/Taierzhuang1938/?editor=blockout&level=FirstLevel0610&kf=08-1&quality=whitebox&scale=small&audio=0`,
    { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => window.Tengxian?.state?.ready && window.Tengxian?.Debug?.Blockout?.State().ready
    && window.Tengxian.Debug.Blockout.Landmarks().length > 0, null, { timeout: 300000 });

  // 1. 开图、点开关
  await LE(() => window.Tengxian.Debug.Blockout.ToggleMap(true));
  await page.waitForTimeout(200);
  await page.click(".boEditToggle");
  await page.waitForTimeout(120);
  const ui = await LE(() => ({
    bar: !!document.querySelector(".boEditBar") && !document.querySelector(".boEditBar").hidden,
    insp: !!document.querySelector(".boEditInspector") && !document.querySelector(".boEditInspector").hidden,
    on: document.querySelector(".boEditToggle").classList.contains("on"),
    hint: document.querySelector(".boMapHint").textContent,
  }));
  Check("点「编辑布设」：开关亮、工具栏与检查器出来、提示换成编辑的", ui.bar && ui.insp && ui.on && /编辑布设/.test(ui.hint), JSON.stringify(ui));
  const ctx = await LE(() => window.Tengxian.Debug.Blockout.LayoutEdit.Context());
  Check("上下文：当前关键帧 08-1 的人、所有站位、地标都在", ctx.keyframeId === "08-1" && ctx.units.length >= 4 && ctx.stations.length >= 15 && ctx.landmarks.length >= 40,
    `人 ${ctx.units.length}，站位 ${ctx.stations.length}，地标 ${ctx.landmarks.length}`);

  // 2. 拖狗洞
  const dog = ctx.landmarks.find(l => l.id === "LmDogHole");
  const view = await LE(([x, z]) => window.Tengxian.Debug.Blockout.LayoutEdit.Focus(x, z, 12), [dog.x + 4, dog.z - 4]);
  const p0 = await Point(dog.x, dog.z);
  await Drag(p0, { x: p0.x + 40, y: p0.y });
  let moves = await Moves();
  const dm = moves.find(m => m.kind === "landmark" && m.id === "LmDogHole");
  const expectDx = Math.round(40 / view.pxPerM * 10) / 10;
  Check("拖狗洞往东 40 px：记一条地标挪动，挪动量吸附到 0.1 m，z 不变", dm && Math.abs((dm.to.x - dm.from.x) - expectDx) < 0.051 && dm.to.z === dm.from.z && dm.path.startsWith("landmarks["),
    dm ? `dx ${(dm.to.x - dm.from.x).toFixed(2)}（应 ${expectDx}），${dm.path}` : "没记上");
  const head = await LE(() => document.querySelector(".boEditInspector .boEditHead")?.textContent || "");
  Check("检查器认出选中的是狗洞", /狗洞/.test(head), head);
  await Shot("01_DogHole");

  // 3. 拖幺娃
  const yaowa = ctx.units.find(u => u.id === "Yaowa");
  await LE(([x, z]) => window.Tengxian.Debug.Blockout.LayoutEdit.Focus(x, z, 14), [yaowa.x, yaowa.z]);
  const y0 = await Point(yaowa.x, yaowa.z);
  await Drag(y0, { x: y0.x, y: y0.y + 28 });
  moves = await Moves();
  const um = moves.find(m => m.kind === "unit" && m.id === "Yaowa");
  Check("拖幺娃往南：记一条人的挪动，带关键帧 08-1 与配置路径", um && um.keyframeId === "08-1" && um.to.z > um.from.z + 1 && /^keyframes\[\d+\]\.units\[\d+\]$/.test(um.path),
    um ? `dz ${(um.to.z - um.from.z).toFixed(2)}，${um.path}` : "没记上");

  // 4. 框选灶屋，整组拖
  await LE(() => window.Tengxian.Debug.Blockout.LayoutEdit.Focus(86, 483, 14));
  const a = await Point(80.9, 479.0), b = await Point(91.1, 486.9);
  await Drag(a, b, { shift: true });
  const sel = (await EditState()).selection.filter(k => k.startsWith("block|"));
  Check("Shift + 拖空地框住灶屋：选中 ≥ 8 块（墙、顶、灶、缸）", sel.length >= 8, `${sel.length} 块：${sel.slice(0, 6).join(" ")}`);
  const k0 = await Point(82, 483);   // 西墙
  await Drag(k0, { x: k0.x + 42, y: k0.y - 14 });
  moves = await Moves();
  const kitchen = moves.filter(m => m.kind === "block" && m.id.startsWith("Kitchen"));
  const deltas = new Set(kitchen.map(m => `${(m.to.x - m.from.x).toFixed(2)},${(m.to.z - m.from.z).toFixed(2)}`));
  Check("拖其中一块：灶屋每块都挪了、挪动量一样", kitchen.length >= 8 && deltas.size === 1, `${kitchen.length} 块，挪动量 ${[...deltas].join(" / ")}`);
  await Shot("02_KitchenMoved");

  // 5. 加标记 + 敲字（敲 M 和 . 不关图、不翻关键帧）
  await page.click(".boEditBar .boEditTool:nth-of-type(2)");
  const mp = await Point(95, 476);
  await page.mouse.click(mp.x, mp.y);
  await page.waitForTimeout(100);
  const focused = await LE(() => document.activeElement?.classList.contains("boEditText"));
  await page.keyboard.type("Make it wider. 这里加一道矮墙");
  await page.waitForTimeout(100);
  const after = await LE(() => ({ open: window.Tengxian.Debug.Blockout.State().mapOpen ?? document.querySelector(".boMapOverlay").classList.contains("open"),
    overlay: document.querySelector(".boMapOverlay").classList.contains("open"), id: window.Tengxian.Debug.Blockout.State().id,
    text: window.Tengxian.Debug.Blockout.LayoutEdit.Session().markers.map(m => m.text) }));
  Check("加标记：点一下放下、文字框自动有焦点，敲字（含 M 和 .）不关图、不翻关键帧", focused && after.overlay && after.id === "08-1" && after.text[0] === "Make it wider. 这里加一道矮墙",
    JSON.stringify(after));
  // 点空地取消选择，焦点回画布
  const empty = await Point(110, 470);
  await page.mouse.click(empty.x, empty.y);
  await Shot("03_Marker");

  // 6. 撤销 / 重做 / 微调
  const before = (await Moves()).length + (await EditState()).markers;
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(50);
  const undone = await LE(() => window.Tengxian.Debug.Blockout.LayoutEdit.Session().markers.map(m => m.text).join("|"));
  await page.keyboard.press("Control+y");
  await page.waitForTimeout(50);
  const redone = (await Moves()).length + (await EditState()).markers;
  const redoneText = await LE(() => window.Tengxian.Debug.Blockout.LayoutEdit.Session().markers.map(m => m.text).join("|"));
  Check("画布上 Ctrl+Z 撤掉最后一步（标记里敲的字）、Ctrl+Y 重做回来", undone === "" && redone === before && redoneText === "Make it wider. 这里加一道矮墙", `撤后「${undone}」，重做后「${redoneText}」`);
  // 选狗洞，方向键往北 0.1
  const dogNow = (await Moves()).find(m => m.id === "LmDogHole").to;
  await LE(([x, z]) => window.Tengxian.Debug.Blockout.LayoutEdit.Focus(x, z, 12), [dogNow.x, dogNow.z]);
  const dp = await Point(dogNow.x, dogNow.z);
  await page.mouse.click(dp.x, dp.y);
  await page.keyboard.press("ArrowUp");
  await page.waitForTimeout(50);
  const dogAfter = (await Moves()).find(m => m.id === "LmDogHole").to;
  Check("方向键 ↑ 往北微调 0.1 m", Math.abs(dogAfter.z - (dogNow.z - 0.1)) < 1e-6 && dogAfter.x === dogNow.x, `${dogNow.z} → ${dogAfter.z}`);

  // 7. 导出
  await page.click(".boEditExport");
  await page.waitForTimeout(300);
  let text = await LE(() => navigator.clipboard.readText().catch(() => ""));
  if (!text) text = await LE(() => document.querySelector(".boCopyBox:not([hidden]) .boCopyText")?.value || "");
  const exp = ParseLayoutEdit(text);
  const nowMoves = await Moves();
  Check("「导出给 Agent」：剪贴板里的文字末行能解析，挪动 / 标记条数对得上", exp && exp.level === "FirstLevel0610" && exp.moves.length === nowMoves.length && exp.markers.length === 1
    && exp.moves.some(m => m.kind === "landmark" && m.id === "LmDogHole") && /体块 Kitchen/.test(text) && exp.scenePath.endsWith("Blockout/FirstLevel0610.scene.json"),
    exp ? `挪动 ${exp.moves.length}，标记 ${exp.markers.length}` : `没解析出来：${text.slice(0, 80)}`);
  if (text) await fs.writeFile(path.join(shotDir, "Export.txt"), text, "utf8");

  // 8. 关掉开关：地图照旧；关图再开，改动还在
  await page.click(".boEditToggle");
  await page.waitForTimeout(100);
  const off = await LE(() => ({ bar: document.querySelector(".boEditBar").hidden, hint: document.querySelector(".boMapHint").textContent }));
  // 找一个离当前站位 15 m 以上的关键帧（08-1…08-3 站在同一处），图对准它再点
  const far = ctx.stations.find(s => Math.hypot(s.x - 97.4, s.z - 384.3) > 15 && s.index > ctx.keyframeIndex);
  await LE(([x, z]) => window.Tengxian.Debug.Blockout.LayoutEdit.Focus(x, z, 3), [far.x, far.z]);
  const kfPoint = await LE((id) => window.Tengxian.Debug.Blockout.MapPoint(id), far.id);
  await page.mouse.click(kfPoint.x, kfPoint.y);
  await page.waitForTimeout(300);
  const jumped = await LE(() => window.Tengxian.Debug.Blockout.State().id);
  Check("关掉编辑：工具栏收起、提示复原、点关键帧照常跳", off.bar && !/编辑布设/.test(off.hint) && jumped === far.id, `${JSON.stringify(off)} → ${jumped}（应 ${far.id}）`);
  await LE(() => { window.Tengxian.Debug.Blockout.ToggleMap(false); window.Tengxian.Debug.Blockout.ToggleMap(true); });
  const kept = await EditState();
  Check("关图再开：改动还在（只在这一页里）", kept.moves === nowMoves.length && kept.markers === 1, JSON.stringify(kept));
  await LE(() => window.Tengxian.Debug.Blockout.LayoutEdit.SetActive(true));
  await LE(() => window.Tengxian.Debug.Blockout.LayoutEdit.Focus(88, 480, 6));
  await page.waitForTimeout(150);
  await Shot("04_Overview");
} catch (error) {
  Check("跑完没抛错", false, String(error?.stack || error).slice(0, 600));
} finally {
  Check("全程没有未捕获错误", errors.length === 0, errors.slice(0, 4).join(" | "));
  const configAfter = await fs.readFile(configFile), sceneAfter = await fs.readFile(sceneFile);
  Check("不存盘：配置与场景文件前后逐字节相同", configAfter.equals(configBefore) && sceneAfter.equals(sceneBefore));
  await browser.close().catch(() => {});
  server.close();
}

const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} 通过${shots ? `；截图 ${path.relative(rootDir, shotDir)}` : ""}`);
assert.equal(failed.length, 0, failed.map(f => f.name).join("；"));
