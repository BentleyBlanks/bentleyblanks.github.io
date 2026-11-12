// 高级工具拆分（AdvancedTools/）真浏览器门禁。
//
// 查：
//   1. 控制中心 ControlCenter.html：19 张卡片、六组、各卡片链接对（独立窗口开各自页面、摄影棚开 Tool_Studio.html?tool=、游戏内的标「游戏内」）、
//      点一张摄影棚卡片真能开出独立工具宿主；
//   2. 独立工具宿主 Tool_Studio.html?tool=<id>：九个摄影棚类工具逐个开，工作窗 .edPanel.work 出现、没有 console.error / pageerror、
//      画布不是一片纯色；菜单栏只列这九个工具、可在页内切换、有「返回控制中心」；无 tool 参数时是空 Inspector；
//   3. 四个搬走的独立页面（场景编辑器 / 遭遇设计 / Mixamo 动作预览 / 贴图管理）在新地址能开、没有报错，
//      场景编辑器的 /__scene/status 存盘口状态照旧可读（走本机预览服时 writable 为布尔值）。
//
// 用法：node Taierzhuang1938/Script_AdvancedToolsBrowserTest.mjs [--only=actor,vfx] [--no-shots]

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";
import { TOOL_INFO } from "./Data_DevTools.mjs";
import { STUDIO_TOOL_IDS, WINDOW_TOOL_IDS, GAME_TOOL_IDS } from "./AdvancedTools/Data_AdvancedTools.mjs";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(projectDir, "..");
const shotDir = path.join(projectDir, "_shots", "AdvancedTools");
const shots = !process.argv.includes("--no-shots");
const onlyArg = process.argv.find((arg) => arg.startsWith("--only="));
const only = onlyArg ? new Set(onlyArg.slice("--only=".length).split(",")) : null;
const sharp = createRequire(import.meta.url)("sharp");
if (shots) await fs.mkdir(shotDir, { recursive: true });

let failed = 0;
function Check(name, ok, detail = "") {
  if (!ok) failed += 1;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? "  — " + detail : ""}`);
}

/** 截图里这块区域是不是一片纯色（画布空了）。→ 各通道标准差之和 */
async function Spread(buffer, region) {
  const stats = await sharp(buffer).extract(region).stats();
  return stats.channels.slice(0, 3).reduce((sum, channel) => sum + channel.stdev, 0);
}

const server = await ServeRoot(rootDir, 0);
const port = server.address().port;
const base = `http://127.0.0.1:${port}/Taierzhuang1938/AdvancedTools/`;
const browser = await LaunchBrowser({ extraArgs: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });

/** 开一页并收集错误。 */
async function OpenPage(url, { viewport = { width: 1280, height: 720 }, waitUntil = "load" } = {}) {
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on("pageerror", (error) => errors.push(`PAGEERROR ${String(error).slice(0, 240)}`));
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const location = message.location()?.url || "";
    if (/fonts\.(googleapis|gstatic)\.com/.test(location)) return;
    // 静态测试服没有贴图存盘口，贴图管理自己退回「在线浏览模式」（页面设计如此）
    if (/\/__textures\/status/.test(location)) return;
    errors.push(`CONSOLE ${message.text().slice(0, 200)} @ ${location}`);
  });
  await page.goto(url, { waitUntil, timeout: 120000 });
  return { page, errors };
}

try {
  // --- 1. 控制中心 -----------------------------------------------------------------
  if (!only || only.has("center")) {
    const { page, errors } = await OpenPage(`${base}ControlCenter.html`);
    await page.waitForFunction(() => document.querySelectorAll("[data-home-tool]").length >= 19, null, { timeout: 60000 });
    const info = await page.evaluate(() => ({
      title: document.title, brand: document.querySelector(".edMenuBrand")?.textContent,
      groups: [...document.querySelectorAll(".edHomeGroup")].map((group) => ({ id: group.dataset.group, label: group.querySelector(".edHomeGroupLabel")?.textContent })),
      cards: [...document.querySelectorAll("[data-home-tool]")].map((card) => ({
        id: card.dataset.homeTool, kind: card.dataset.kind, href: card.href, target: card.target,
        name: card.querySelector(".edHomeToolName")?.textContent, hint: card.querySelector(".edHomeToolHint")?.textContent,
        tag: card.querySelector(".edHomeTag")?.textContent,
      })),
    }));
    Check("控制中心标题 AdvancedTool ControlCenter", /^AdvancedTool ControlCenter/.test(info.title) && info.brand === "AdvancedTool ControlCenter", `${info.title} / ${info.brand}`);
    Check("六组：场景 / 关卡 / 角色 / 武器 / 特效与声音 / 资产", info.groups.map((group) => group.label).join(",") === "场景,关卡,角色,武器,特效与声音,资产", info.groups.map((group) => group.label).join(","));
    Check("19 张卡片", info.cards.length === 19, String(info.cards.length));
    const card = (id) => info.cards.find((entry) => entry.id === id);
    Check("文案取 TOOL_INFO 的 label / hint", info.cards.every((entry) => entry.name === TOOL_INFO[entry.id].label && entry.hint === TOOL_INFO[entry.id].hint));
    for (const id of WINDOW_TOOL_IDS) {
      const expected = new URL(TOOL_INFO[id].window.url, `http://127.0.0.1:${port}/Taierzhuang1938/`).href;
      Check(`${id} 卡片开自己的页面`, card(id).href === expected && card(id).target === TOOL_INFO[id].window.name, card(id).href);
    }
    for (const id of STUDIO_TOOL_IDS) Check(`${id} 卡片开 Tool_Studio.html?tool=${id}`, card(id).href === `${base}Tool_Studio.html?tool=${id}`, card(id).href);
    for (const id of GAME_TOOL_IDS) {
      Check(`${id} 卡片标「游戏内」并链到游戏现有入口`, card(id).tag === "游戏内"
        && card(id).href.startsWith(`http://127.0.0.1:${port}/Taierzhuang1938/index.html?editor=`), card(id).href);
    }
    Check("控制中心没有报错", errors.length === 0, errors.slice(0, 3).join(" | "));
    if (shots) await page.screenshot({ path: path.join(shotDir, "ControlCenter.png") });
    // 点一张摄影棚卡片：真开出工具宿主
    const popup = page.waitForEvent("popup", { timeout: 20000 });
    await page.click('[data-home-tool="actor"]');
    const studio = await popup;
    await studio.waitForFunction(() => window.ToolStudio?.ready && window.ToolStudio.activeId === "actor", null, { timeout: 180000 });
    Check("点「人物动作」卡片开出独立工具宿主并打开该工具", studio.url() === `${base}Tool_Studio.html?tool=actor`, studio.url());
    await studio.close();
    await page.close();
  }

  // --- 2. 独立工具宿主 -------------------------------------------------------------------
  for (const id of STUDIO_TOOL_IDS) {
    if (only && !only.has(id)) continue;
    const { page, errors } = await OpenPage(`${base}Tool_Studio.html?tool=${id}&quality=low&scale=small`, { waitUntil: "commit" });
    await page.waitForFunction(() => window.ToolStudio?.ready || document.getElementById("tsBootStep")?.textContent.startsWith("启动失败"), null, { timeout: 240000 });
    await page.waitForFunction((tool) => window.ToolStudio?.activeId === tool && document.querySelector(".edPanel.work"), id, { timeout: 60000 });
    await page.waitForTimeout(2500);
    const probe = await page.evaluate(() => ({
      work: document.querySelectorAll(".edPanel.work").length,
      entries: [...document.querySelectorAll(".edMenuItem")].map((item) => item.dataset.editor),
      status: document.querySelector(".edMenuStatus")?.textContent,
      back: document.querySelector('[data-action="control-center"]')?.textContent,
      canvas: !!document.getElementById("view")?.width,
    }));
    const buffer = await page.screenshot();
    const spread = await Spread(buffer, { left: 8, top: 60, width: 640, height: 600 });
    if (shots) await fs.writeFile(path.join(shotDir, `Studio_${id}.png`), buffer);
    Check(`${id}：工作窗 .edPanel.work 出现`, probe.work >= 1, `${probe.work}`);
    Check(`${id}：画布不是一片纯色`, spread > 12, `spread=${spread.toFixed(1)}`);
    Check(`${id}：没有 console.error / pageerror`, errors.length === 0, errors.slice(0, 3).join(" | "));
    if (id === STUDIO_TOOL_IDS[0]) {
      Check("菜单栏只列这九个工具、有「返回控制中心」", [...probe.entries].sort().join(",") === [...STUDIO_TOOL_IDS].sort().join(",") && probe.back === "返回控制中心", probe.entries.join(","));
      // 页内切换：一次只开一个
      await page.evaluate(() => window.ToolStudio.Open("weapon"));
      await page.waitForTimeout(800);
      const switched = await page.evaluate(() => ({ active: window.ToolStudio.activeId, work: document.querySelectorAll(".edPanel.work").length,
        on: [...document.querySelectorAll(".edMenuItem.on")].map((item) => item.dataset.editor) }));
      Check("页内切换工具：一次只开一个", switched.active === "weapon" && switched.on.join() === "weapon" && switched.work === 1, JSON.stringify(switched));
      await page.keyboard.press("Escape");
      const closed = await page.evaluate(() => ({ active: window.ToolStudio.activeId, work: document.querySelectorAll(".edPanel.work").length, empty: !document.getElementById("edInspectorEmpty")?.hidden }));
      Check("Esc 关掉当前工具回到空 Inspector", closed.active === null && closed.work === 0 && closed.empty, JSON.stringify(closed));
    }
    await page.close();
  }
  if (!only || only.has("empty")) {
    const { page, errors } = await OpenPage(`${base}Tool_Studio.html?quality=low&scale=small`, { waitUntil: "commit" });
    await page.waitForFunction(() => window.ToolStudio?.ready, null, { timeout: 240000 });
    const empty = await page.evaluate(() => ({ active: window.ToolStudio.activeId, visible: !document.getElementById("edInspectorEmpty")?.hidden,
      title: document.querySelector("#edInspectorEmpty .edTitle")?.textContent }));
    Check("无 tool 参数：空 Inspector 提示", empty.active === null && empty.visible && empty.title === "未选择工具", JSON.stringify(empty));
    Check("无 tool 参数没有报错", errors.length === 0, errors.slice(0, 3).join(" | "));
    await page.close();
  }

  // --- 3. 四个搬走的独立页面 ---------------------------------------------------------------
  const windows = [
    ["场景编辑器", "SceneEditor.html?scene=FirstLevelWhitebox", () => window.SceneEditor && document.getElementById("seCanvas")],
    ["遭遇设计", "Tool_LevelFlow.html?t=384", () => window.LevelFlow && document.getElementById("flowMap")],
    ["Mixamo 动作预览", "Tool_MixamoAnimationPreview.html?who=oldGeng", () => window.__preview?.action && document.getElementById("who")?.value === "oldGeng"],
    ["贴图管理", "TextureManager.html", () => document.querySelectorAll(".asset").length > 250 && document.querySelector("canvas")],
  ];
  for (const [label, rel, ready] of windows) {
    if (only && !only.has("pages")) continue;
    const { page, errors } = await OpenPage(`${base}${rel}`);
    await page.waitForFunction(ready, null, { timeout: 120000 });
    await page.waitForTimeout(1500);
    Check(`${label}：新地址能开、没有报错`, errors.length === 0, errors.slice(0, 3).join(" | "));
    if (label === "场景编辑器") {
      const status = await page.evaluate(async () => { const response = await fetch("/__scene/status", { cache: "no-store" }); return { ok: response.ok, body: await response.json() }; });
      Check("场景编辑器的 /__scene/status 存盘口状态可读", status.ok && typeof status.body.writable === "boolean", JSON.stringify(status.body).slice(0, 120));
      const state = await page.evaluate(() => window.SceneEditor.State());
      Check("场景编辑器读到了场景（物件数 > 0）", state.objects > 0, `${state.objects}`);
    }
    if (shots) await page.screenshot({ path: path.join(shotDir, `Page_${label.replace(/\W/g, "") || "page"}.png`) });
    await page.close();
  }
} finally {
  await browser.close();
  server.close();
}

console.log(failed ? `${failed} 项未过` : "高级工具拆分（浏览器）：全部通过");
process.exitCode = failed ? 1 : 0;
