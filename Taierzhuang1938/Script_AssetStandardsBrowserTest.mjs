// 资产规范与限制（AdvancedTools/Tool_AssetStandards.html）真浏览器门禁。
//
// 查：
//   1. 控制中心「资产规范与限制」卡片开出独立页面；旧地址 Tool_Studio.html?tool=assetStandards 转到新页；
//   2. 只读服务（静态测试服，/__assetStandards/status 报不可写）：分类导航与计数对得上规范、表头与实际面数（读构建产物）、
//      搜索 / 状态筛选、点行出推导与编辑表单、改原始面数即时重算合规、保存按钮禁用而「下载 JSON」可用；
//   3. 可写服务（真起 Script_LocalPreview，根目录是临时副本）：改一处 → Ctrl+S 写盘（盘上 = FormatAssetStandardsJson）、
//      别处改了文件且本页无修改时 2 s 内自动同步；
//   4. 全程没有 pageerror / console.error。截图只写 _shots/AssetStandards/（本地，不提交，长边 640）。
//
// 用法：node Taierzhuang1938/Script_AssetStandardsBrowserTest.mjs

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";
import { ASSET_STANDARDS_REPO_PATH, FormatAssetStandardsJson } from "./AssetPipeline/Script_AssetStandards.mjs";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(projectDir, "..");
const shotDir = path.join(projectDir, "_shots", "AssetStandards");
fs.mkdirSync(shotDir, { recursive: true });
const spec = JSON.parse(fs.readFileSync(path.join(rootDir, ASSET_STANDARDS_REPO_PATH), "utf8"));
const modelIndex = JSON.parse(fs.readFileSync(path.join(projectDir, "Model", "Data_ModelIndex.json"), "utf8"));
let failed = 0;
function Check(name, ok, detail = "") {
  if (!ok) failed += 1;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? "  — " + detail : ""}`);
}
const VIEWPORT = { width: 1600, height: 1000 };
const SHOT = { viewport: VIEWPORT, deviceScaleFactor: 640 / VIEWPORT.width };

const errors = [];
function Watch(page) {
  page.on("pageerror", (error) => errors.push(`pageerror ${error.message}`));
  page.on("console", (message) => {
    // 静态测试服没有 /__preview/ping，控制中心的后端新鲜度检查会 404（页面设计如此，忽略）。
    if (message.type() === "error" && !/fonts\.(googleapis|gstatic)|\/__preview\/ping/.test(message.location()?.url || "")) errors.push(`${message.text().slice(0, 160)} @ ${message.location()?.url || ""}`);
  });
}
const Ready = (page) => page.waitForFunction(() => window.AssetStandardsTool?.ready || window.AssetStandardsTool?.error, null, { timeout: 60000 });

function StartPreview(root) {
  return new Promise((resolve, reject) => {
    const port = 8300 + Math.floor(Math.random() * 600);
    const child = spawn(process.execPath, [path.join(rootDir, "scripts", "Script_LocalPreview.mjs"), `--root=${root}`, "--no-open", String(port)], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    const timer = setTimeout(() => { child.kill(); reject(new Error(`预览服没起来：${out}`)); }, 20000);
    child.stdout.on("data", (chunk) => {
      out += chunk.toString("utf8");
      const match = /http:\/\/127\.0\.0\.1:(\d+)\/__preview\//.exec(out);
      if (!match) return;
      clearTimeout(timer);
      resolve({ port: Number(match[1]), Stop: () => new Promise((done) => { if (child.exitCode !== null) done(); else { child.once("close", done); child.kill(); } }) });
    });
    child.stderr.on("data", (chunk) => { out += chunk.toString("utf8"); });
    child.on("error", (error) => { clearTimeout(timer); reject(error); });
  });
}

const server = await ServeRoot(rootDir, 0);
const base = `http://127.0.0.1:${server.address().port}/Taierzhuang1938/AdvancedTools/`;
const browser = await LaunchBrowser();
const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "tz-assetstd-browser-"));
let preview = null;
try {
  // --- 1. 入口 ---------------------------------------------------------------------------
  const center = await browser.newPage({ viewport: VIEWPORT });
  Watch(center);
  await center.goto(`${base}ControlCenter.html`);
  await center.waitForSelector('[data-home-tool="assetStandards"]', { timeout: 60000 });
  const card = await center.evaluate(() => {
    const link = document.querySelector('[data-home-tool="assetStandards"]');
    return { href: link.href, kind: link.dataset.kind, group: link.closest(".edHomeGroup")?.dataset.group };
  });
  Check("控制中心「资产规范与限制」是资产组的独立窗口卡片", card.kind === "window" && card.group === "assets"
    && card.href === `${base}Tool_AssetStandards.html`, JSON.stringify(card));
  const [popup] = await Promise.all([center.waitForEvent("popup"), center.click('[data-home-tool="assetStandards"]')]);
  Watch(popup);
  await Ready(popup);
  Check("点卡片开出独立页面", new URL(popup.url()).pathname.endsWith("/AdvancedTools/Tool_AssetStandards.html"), popup.url());
  await popup.close();
  await center.goto(`${base}Tool_Studio.html?tool=assetStandards`);
  await center.waitForURL(/Tool_AssetStandards\.html/, { timeout: 120000 });
  Check("旧地址 Tool_Studio.html?tool=assetStandards 转到独立页面", /\/AdvancedTools\/Tool_AssetStandards\.html/.test(center.url()), center.url());
  await center.close();

  // --- 2. 只读服务 ---------------------------------------------------------------------------
  const page = await browser.newPage(SHOT);
  Watch(page);
  await page.goto(`${base}Tool_AssetStandards.html`);
  await Ready(page);
  const overview = await page.evaluate(() => ({
    nav: [...document.querySelectorAll(".as-navItem")].map((item) => ({ view: item.dataset.view, count: item.querySelector(".count").textContent })),
    banner: document.getElementById("banner").hidden ? "" : document.getElementById("banner").textContent,
    save: document.getElementById("saveButton").disabled, state: document.getElementById("saveState").textContent,
    consumers: document.querySelectorAll(".as-consumer").length,
  }));
  const procedural = modelIndex.models.filter((model) => !spec.sourceAssets[model.name]).length;
  const expected = { firearm: 0, assembly: 0, melee: 0, vehicle: 0 };
  for (const record of Object.values(spec.sourceAssets)) expected[record.group] += 1;
  Object.assign(expected, { procedural: String(procedural), external: String(spec.externalGlb.length) });
  Check("导航：总览、全局规则与七个分类，计数对得上规范与构建产物",
    overview.nav.map((item) => item.view).join(",") === ["overview", "rules", ...spec.groups.map((group) => group.id)].join(",")
    && Object.entries(expected).every(([view, count]) => overview.nav.find((item) => item.view === view)?.count === String(count)), JSON.stringify(overview.nav));
  Check("静态服务退化为只读：保存禁用、提示下载", overview.save && /只读/.test(overview.state) && /下载 JSON/.test(overview.banner), `${overview.state} / ${overview.banner}`);
  Check("总览列出规范的使用方", overview.consumers === spec.consumers.length, String(overview.consumers));
  await page.screenshot({ path: path.join(shotDir, "AssetStandards_Overview.png") });

  await page.click('.as-navItem[data-view="firearm"]');
  const firearm = await page.evaluate(() => ({
    headers: [...document.querySelectorAll("#assetTable th")].map((th) => th.textContent),
    rows: [...document.querySelectorAll("#assetRows tr[data-id]")].map((tr) => ({ id: tr.dataset.id, cells: [...tr.children].map((td) => td.textContent) })),
  }));
  const zb26 = firearm.rows.find((row) => row.id === "Zb26");
  const zb26Built = modelIndex.models.find((model) => model.name === "Zb26").triangles;
  Check("枪械表：表头齐、行数同规范、实际面数读构建产物", ["原始面数", "实际面数", "限制 / 目标", "面数降幅", "预算占用", "状态"].every((label) => firearm.headers.includes(label))
    && firearm.headers.some((label) => /自带贴图/.test(label)) && firearm.rows.length === expected.firearm
    && zb26?.cells[3] === zb26Built.toLocaleString("en-US"), JSON.stringify(zb26));
  await page.fill("#assetSearch", "zb-26");
  const searched = await page.$$eval("#assetRows tr[data-id]", (rows) => rows.map((row) => row.dataset.id));
  Check("搜索按名称过滤", searched.join(",") === "Zb26", searched.join(","));
  await page.fill("#assetSearch", "");
  await page.click('#statusFilter [data-status="attention"]');
  const attention = await page.$$eval("#assetRows tr[data-id]", (rows) => rows.map((row) => row.dataset.id));
  const type92 = firearm.rows.find((row) => row.id === "Type92Hmg");
  Check("九二式有实测源面数与公开构建产物，补件状态进入合规列表",
    attention.length === 0 && type92?.cells.includes("原模保留 + 补件")
      && type92.cells[3] === modelIndex.models.find((model) => model.name === "Type92Hmg").triangles.toLocaleString("en-US"),
    JSON.stringify({ attention, type92 }));

  await page.click('.as-navItem[data-view="vehicle"]');
  await page.click('#assetRows tr[data-id="Type89Tank"]');
  const before = await page.evaluate(() => ({ status: document.getElementById("detailStatus").textContent, derive: document.getElementById("detailDerive").textContent,
    hash: location.hash }));
  Check("八九式原始拓扑保留，详情地址带深链", before.status === "原始拓扑保留" && /保留原始拓扑/.test(before.derive)
    && /view=vehicle/.test(before.hash) && /id=Type89Tank/.test(before.hash), JSON.stringify(before));
  await page.fill("#fieldSource", "90000");
  const after = await page.evaluate(() => ({
    status: document.getElementById("detailStatus").textContent, tone: document.getElementById("detailStatus").className,
    row: document.querySelector('#assetRows tr[data-id="Type89Tank"] .as-pill')?.textContent, nav: document.querySelector('.as-navItem[data-view="vehicle"] .as-dot').className,
    state: document.getElementById("saveState").textContent, title: document.title, save: document.getElementById("saveButton").disabled,
  }));
  Check("改原始面数即时重算：90,000 > 80,000 且降幅 > 5% → 偏离分类阈值（详情、表格、导航同步变红）",
    after.status === "偏离分类阈值" && /bad/.test(after.tone) && after.row === "偏离分类阈值" && /bad/.test(after.nav), JSON.stringify(after));
  Check("只读服务有修改时提示下载、保存仍禁用", /下载 JSON/.test(after.state) && after.save && after.title.startsWith("●"), after.state);
  await page.screenshot({ path: path.join(shotDir, "AssetStandards_VehicleEdit.png") });
  const [download] = await Promise.all([page.waitForEvent("download"), page.click("#downloadButton")]);
  const downloaded = JSON.parse(fs.readFileSync(await download.path(), "utf8"));
  Check("下载 JSON 带上本页修改", download.suggestedFilename() === "Data_AssetStandards.json" && downloaded.sourceAssets.Type89Tank.sourceTriangles === 90000);
  await page.click('.as-navItem[data-view="external"]');
  const external = await page.$$eval("#assetRows tr[data-id]", (rows) => rows.length);
  Check("外部 GLB 表逐件列出", external === spec.externalGlb.length, String(external));
  await page.screenshot({ path: path.join(shotDir, "AssetStandards_External.png") });
  await page.close();

  // --- 3. 可写服务 ---------------------------------------------------------------------------
  const tree = path.join(workDir, "tree");
  for (const dir of ["Taierzhuang1938/AdvancedTools", "Taierzhuang1938/AssetPipeline", "Taierzhuang1938/Model"]) fs.mkdirSync(path.join(tree, dir), { recursive: true });
  for (const file of ["Tool_AssetStandards.html", "Script_AssetStandardsTool.mjs", "Style_AssetStandards.css"]) fs.copyFileSync(path.join(projectDir, "AdvancedTools", file), path.join(tree, "Taierzhuang1938/AdvancedTools", file));
  fs.cpSync(path.join(projectDir, "AssetPipeline"), path.join(tree, "Taierzhuang1938/AssetPipeline"), { recursive: true });
  fs.copyFileSync(path.join(projectDir, "Model", "Data_ModelIndex.json"), path.join(tree, "Taierzhuang1938/Model/Data_ModelIndex.json"));
  fs.copyFileSync(path.join(projectDir, "Icon_TabSeal32.png"), path.join(tree, "Taierzhuang1938/Icon_TabSeal32.png"));
  fs.writeFileSync(path.join(tree, "index.html"), "<!doctype html><title>t</title>\n");
  const specFile = path.join(tree, ASSET_STANDARDS_REPO_PATH);
  preview = await StartPreview(tree);
  const live = await browser.newPage(SHOT);
  Watch(live);
  await live.goto(`http://127.0.0.1:${preview.port}/Taierzhuang1938/AdvancedTools/Tool_AssetStandards.html#view=rules`);
  await Ready(live);
  Check("本机预览服务下可写", await live.evaluate(() => window.AssetStandardsTool.writable && document.getElementById("saveState").textContent === "已与盘上一致"));
  await live.fill("#rule-sceneTriangles", "9100000");
  await live.keyboard.press("Control+s");
  await live.waitForFunction(() => document.getElementById("saveState").textContent === "已与盘上一致", null, { timeout: 10000 });
  const saved = JSON.parse(fs.readFileSync(specFile, "utf8"));
  Check("Ctrl+S 写盘：盘上是 FormatAssetStandardsJson 的样子、只改了那一个数", saved.sceneRenderLimits.triangles === 9100000
    && fs.readFileSync(specFile, "utf8") === FormatAssetStandardsJson(saved) && saved.externalGlb.length === spec.externalGlb.length);
  saved.triangleRules.weapon.limit = 31000;
  fs.writeFileSync(specFile, FormatAssetStandardsJson(saved));
  await live.waitForFunction(() => window.AssetStandardsTool.spec.triangleRules.weapon.limit === 31000, null, { timeout: 8000 }).catch(() => {});
  const synced = await live.evaluate(() => ({ limit: window.AssetStandardsTool.spec.triangleRules.weapon.limit, banner: document.getElementById("banner").textContent }));
  Check("别处改了文件、本页无修改：2 s 轮询自动同步", synced.limit === 31000 && /自动同步/.test(synced.banner), JSON.stringify(synced));
  await live.screenshot({ path: path.join(shotDir, "AssetStandards_Rules.png") });
  await live.close();
} finally {
  await browser.close();
  server.close();
  await preview?.Stop();
  fs.rmSync(workDir, { recursive: true, force: true });
}
Check("全程没有 pageerror / console.error", errors.length === 0, errors.join(" | "));
if (failed) { console.error(`\n资产规范配置器失败：${failed} 项。`); process.exit(1); }
console.log("\n资产规范配置器通过。");
