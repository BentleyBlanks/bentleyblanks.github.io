// 高级工具拆分（AdvancedTools/）真浏览器门禁。
//
// 查：
//   1. 控制中心 ControlCenter.html：六组、各卡片链接对（独立窗口开各自页面、摄影棚开 Tool_Studio.html?tool=、游戏内的标「游戏内」）、
//      点一张摄影棚卡片真能开出独立工具宿主；
//   2. 独立工具宿主 Tool_Studio.html?tool=<id>：摄影棚工具逐个开，工作窗 .edPanel.work 出现、没有 console.error / pageerror、
//      画布不是一片纯色；菜单栏只列摄影棚类工具、可在页内切换、有「返回控制中心」；无 tool 参数时是空 Inspector；
//   3. 独立页面在新地址可用，枪械检查台覆盖独立开窗、真实模型和只读交互。
//
// 用法：node Taierzhuang1938/Script_AdvancedToolsBrowserTest.mjs [--only=actor,vfx] [--no-shots]

import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";
import { CreateEncounterCodexHandler } from "../scripts/Script_EncounterCodexServer.mjs";
import { TOOL_INFO } from "./Data_DevTools.mjs";
import { WEAPONS } from "./Data_Weapons.mjs";
import { CAMERA_PROFILES } from "./Data_CameraProfile.mjs";
import { STUDIO_TOOL_IDS, WINDOW_TOOL_IDS, GAME_TOOL_IDS, STANDALONE_TOOLS } from "./AdvancedTools/Data_AdvancedTools.mjs";

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
const chatStorage = await fs.mkdtemp(path.join(os.tmpdir(), "AdvancedToolsChat-"));
const handleChat = CreateEncounterCodexHandler(chatStorage);
const serveFiles = server.listeners("request")[0];
server.removeAllListeners("request");
server.on("request", (request, response) => request.url.startsWith("/__encounter/codex/") ? handleChat(request, response) : serveFiles(request, response));
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
    // 静态测试服也没有 /__preview/ping：控制中心的后端新鲜度检查会 404（页面设计如此）
    if (/\/__preview\/ping/.test(location)) return;
    errors.push(`CONSOLE ${message.text().slice(0, 200)} @ ${location}`);
  });
  await page.goto(url, { waitUntil, timeout: 120000 });
  return { page, errors };
}

try {
  // --- 1. 控制中心 -----------------------------------------------------------------
  if (!only || only.has("center")) {
    const legacyUrl = new URL("../?editor=tools", base).href;
    const { page, errors } = await OpenPage(legacyUrl, { waitUntil: "commit" });
    await page.waitForURL(`${base}ControlCenter.html`);
    await page.waitForSelector("[data-home-tool]", { timeout: 60000 });
    Check("旧工具首页链接进入独立控制中心", page.url() === `${base}ControlCenter.html`, page.url());
    const info = await page.evaluate(() => ({
      title: document.title, brand: document.querySelector(".edMenuBrand")?.textContent,
      groups: [...document.querySelectorAll(".edHomeGroup")].map((group) => ({ id: group.dataset.group, label: group.querySelector(".edHomeGroupLabel")?.textContent })),
      cards: [...document.querySelectorAll("[data-home-tool]")].map((card) => ({
        id: card.dataset.homeTool, kind: card.dataset.kind, href: card.href, target: card.target, rel: card.rel,
        name: card.querySelector(".edHomeToolName")?.textContent, hint: card.querySelector(".edHomeToolHint")?.textContent,
        tag: card.querySelector(".edHomeTag")?.textContent,
      })),
    }));
    Check("控制中心标题 AdvancedTool ControlCenter", /^AdvancedTool ControlCenter/.test(info.title) && info.brand === "AdvancedTool ControlCenter", `${info.title} / ${info.brand}`);
    Check("六组：场景 / 关卡 / 角色 / 武器 / 特效与声音 / 资产", info.groups.map((group) => group.label).join(",") === "场景,关卡,角色,武器,特效与声音,资产", info.groups.map((group) => group.label).join(","));
    Check("22 张卡片，含音效音乐、角色制作管线、测试场景、小队 PCG 样条预览、构件库预览、资产规范与模型制作工作台", info.cards.length === 22
      && info.cards.some((entry) => entry.id === "audio" && entry.href === `${base}Tool_AudioPreview.html` && entry.target === "TengxianAudioPreview")
      && info.cards.some((entry) => entry.id === "testScenes" && entry.href.includes("TestScenes.html"))
      && info.cards.some((entry) => entry.id === "squadSplinePreview" && entry.href.includes("Tool_SquadSplinePreview.html"))
      && info.cards.some((entry) => entry.id === "assetStandards" && entry.href.includes("Tool_AssetStandards.html"))
      && info.cards.some((entry) => entry.id === "modelWorkbench" && entry.href.includes("Tool_ModelWorkbench.html"))
      && info.cards.some((entry) => entry.id === "characterWorkbench"
        && entry.href === `${base}Tool_CharacterWorkbench.html` && entry.target === "TengxianCharacterWorkbench")
      && info.cards.some((entry) => entry.id === "props" && entry.href.includes("Tool_PropLibrary.html"))
      && !info.cards.some((entry) => entry.id === "squadMarch"), String(info.cards.length));
    const card = (id) => info.cards.find((entry) => entry.id === id);
    Check("游戏工具文案取 TOOL_INFO 的 label / hint", info.cards.filter((entry) => !STANDALONE_TOOLS.some((tool) => tool.id === entry.id))
      .every((entry) => entry.name === TOOL_INFO[entry.id].label && entry.hint === TOOL_INFO[entry.id].hint));
    for (const id of WINDOW_TOOL_IDS) {
      const expected = new URL(TOOL_INFO[id].window.url, `http://127.0.0.1:${port}/Taierzhuang1938/`).href;
      Check(`${id} 卡片以新标签页开自己的页面`, card(id).href === expected && card(id).target === TOOL_INFO[id].window.name
        && card(id).tag === "↗ 新标签页" && !card(id).rel, card(id).href);
    }
    for (const id of STUDIO_TOOL_IDS) Check(`${id} 卡片开 Tool_Studio.html?tool=${id}`, card(id).href === `${base}Tool_Studio.html?tool=${id}` && !card(id).rel, card(id).href);
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
    const audioPopup = page.waitForEvent("popup", { timeout: 20000 });
    await page.click('[data-home-tool="audio"]');
    const audioWin = await audioPopup;
    await audioWin.waitForFunction(() => window.AudioPreview?.ready, null, { timeout: 60000 });
    Check("点「音效音乐」卡片开出 Tool_AudioPreview.html 独立试听页", audioWin.url() === `${base}Tool_AudioPreview.html`, audioWin.url());
    await audioWin.close();
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
      Check("菜单栏只列摄影棚工具、有「返回控制中心」", [...probe.entries].sort().join(",") === [...STUDIO_TOOL_IDS].sort().join(",") && probe.back === "返回控制中心", probe.entries.join(","));
      // 页内切换：一次只开一个
      const other = STUDIO_TOOL_IDS.find((tool) => tool !== id);
      await page.evaluate((tool) => window.ToolStudio.Open(tool), other);
      await page.waitForTimeout(800);
      const switched = await page.evaluate(() => ({ active: window.ToolStudio.activeId, work: document.querySelectorAll(".edPanel.work").length,
        on: [...document.querySelectorAll(".edMenuItem.on")].map((item) => item.dataset.editor) }));
      Check("页内切换工具：一次只开一个", switched.active === other && switched.on.join() === other && switched.work >= 1, JSON.stringify(switched));
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

  // 独立环境配置窗：目标切换、参数编辑、撤销与版本检查沿用共用面板。
  if (!only || only.has("environment")) {
    const { page, errors } = await OpenPage(`${base}../EnvironmentEditor.html`);
    await page.waitForFunction(() => window.EnvironmentWindow?.ready);
    const state = await page.evaluate(async () => {
      const ed = window.EnvironmentWindow.editor;
      ed.SetTab("preset");
      const id = ed.SelectedPresetId();
      const before = JSON.stringify(ed.PresetDoc(id));
      ed.SetParam(id, "Fog", "density", 0.012);
      const dirty = ed.dirty.has(`preset:${id}`);
      const changed = JSON.stringify(ed.PresetDoc(id)) !== before;
      ed.Undo();
      const restored = JSON.stringify(ed.PresetDoc(id)) === before;
      await ed.Reload({ discard: true });
      return { dirty, changed, restored, writable: ed.status.writable, cards: document.querySelectorAll(".envCard").length };
    });
    Check("环境窗口复用组件参数编辑、撤销与本机保存状态", state.dirty && state.changed && state.restored && state.cards > 0 && typeof state.writable === "boolean", JSON.stringify(state));
    await page.selectOption("#environmentTarget", "level/FirstLevelCampaign");
    await page.waitForFunction(() => window.EnvironmentWindow.editor.loadedKind === "level" && window.EnvironmentWindow.editor.loadedScene === "FirstLevelCampaign");
    await page.selectOption("#environmentTarget", "scene/FirstLevel");
    await page.waitForFunction(() => window.EnvironmentWindow.editor.loadedKind === "scene" && window.EnvironmentWindow.editor.loadedScene === "FirstLevel");
    Check("环境窗口可加载正片关卡与场景配置", true);
    Check("环境窗口没有错误", errors.length === 0, errors.join(" | "));
    if (shots) await page.screenshot({ path: path.join(shotDir, "EnvironmentWindow.png") });
    await page.close();
  }

  // --- 3. 独立页面 ----------------------------------------------------------------------
  if (!only || only.has("weapon")) {
    const vehicleIds = ["Type94Tankette", "Type89MediumTank"];
    const assetIds = [...Object.values(WEAPONS).filter((weapon) => weapon.kind !== "vehicle").map((weapon) => weapon.id), ...vehicleIds];
    const { page: center, errors } = await OpenPage(`${base}ControlCenter.html`, { viewport: { width: 1440, height: 900 } });
    const requests = [];
    center.context().on("request", (request) => requests.push({ url: request.url(), method: request.method() }));
    const link = center.locator('[data-home-tool="weapon"]');
    const [page] = await Promise.all([center.waitForEvent("popup"), link.click()]);
    page.on("pageerror", (error) => errors.push(String(error)));
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    const WaitModel = (id) => page.waitForFunction((key) => document.querySelector("#view").dataset.state === "ready"
      && window.WeaponInspection?.selected === key, id, { timeout: 60000 });
    const Inspect = async (id) => {
      await page.locator(`[data-model="${id}"]`).click();
      await WaitModel(id);
    };
    await WaitModel("ZhongZheng");
    const independent = await page.evaluate(() => ({
      name: window.name, opener: window.opener?.location.pathname, models: document.querySelectorAll("[data-model]").length,
      standalone: !window.ToolStudio && !window.Tengxian && !document.querySelector(".edMenuBar, .edPanel"),
      noWrites: !document.querySelector("form, input:not([type=search], #referenceFiles[type=file], #environmentLight[type=range]), [contenteditable]"),
    }));
    Check("控制中心启动有独立窗口名的只读枪械检查台",
      page.url() === `${base}Tool_WeaponInspection.html` && independent.name === TOOL_INFO.weapon.window.name
      && independent.opener?.endsWith("/ControlCenter.html") && independent.standalone && independent.noWrites
      && independent.models === assetIds.length, JSON.stringify(independent));
    const desktopWidth = await page.evaluate(() => {
      const sidebar = document.querySelector(".details").getBoundingClientRect();
      const stage = document.querySelector(".stage").getBoundingClientRect();
      return { sidebar: sidebar.width, inset: innerWidth - sidebar.right, gap: sidebar.left - stage.right };
    });
    Check("桌面检查栏利用可用宽度，栏间距和外边距紧凑",
      desktopWidth.sidebar >= 295 && desktopWidth.inset <= 16 && desktopWidth.gap <= 16, JSON.stringify(desktopWidth));
    const vehicleGroup = page.locator(".model-group").filter({ has: page.getByRole("heading", { name: "载具", exact: true }) });
    const listedVehicles = await vehicleGroup.locator("[data-model]").evaluateAll((rows) => rows.map((row) => row.dataset.model));
    Check("载具栏只列九四式和八九式乙型", listedVehicles.join(",") === vehicleIds.join(","), listedVehicles.join(","));
    const ReadPixels = () => page.evaluate(() => {
      const stage = window.WeaponInspection.scene;
      if (stage.post) {
        stage.post.frame = 0;
        stage.post.hasTaaHistory = false;
        stage.post.fxaaPass.grainClock = 0;
        stage.post.fxaaPass.grainFrame = 0;
      }
      stage.Draw();
      const copy = document.createElement("canvas");
      copy.width = stage.canvas.width;
      copy.height = stage.canvas.height;
      const ctx = copy.getContext("2d");
      ctx.drawImage(stage.canvas, 0, 0);
      const data = ctx.getImageData(0, 0, copy.width, copy.height).data;
      const useDepthMask = stage.channel.value === 0 && !stage.wireframe && !!stage.post?.targets?.normalDepth;
      let nd = null, ndW = 0, ndH = 0;
      if (useDepthMask) {
        const rt = stage.post.targets.normalDepth;
        ndW = rt.width; ndH = rt.height;
        nd = new Uint16Array(ndW * ndH * 4);
        stage.renderer.readRenderTargetPixels(rt, 0, 0, ndW, ndH, nd);
      }
      let minX = copy.width, maxX = 0, count = 0, min = 255, max = 0, chromatic = 0, hash = 0;
      let dark = 0, midtone = 0;
      const sample = [];
      for (let y = 0; y < copy.height; y++) {
        const sampleRow = (y & 7) === 0;
        for (let x = 0; x < copy.width; x++) {
          const i = (y * copy.width + x) * 4;
          const sampleCell = sampleRow && (x & 7) === 0;
          let inside = false;
          if (useDepthMask) {
            const sx = Math.min(ndW - 1, Math.floor(x * ndW / copy.width));
            const sy = Math.max(0, ndH - 1 - Math.floor(y * ndH / copy.height));
            inside = (nd[(sy * ndW + sx) * 4 + 3] & 0x7fff) !== 0;
          } else {
            inside = data[i + 3] >= 245;
          }
          if (!inside) {
            if (sampleCell) sample.push(-1, -1, -1);
            continue;
          }
          const r = data[i], g = data[i + 1], b = data[i + 2];
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x);
          min = Math.min(min, r);
          max = Math.max(max, r);
          if (r < 16) dark += 1;
          else if (r < 250) midtone += 1;
          if (r !== g || g !== b) chromatic += 1;
          hash = Math.imul(hash ^ ((r << 16) | (g << 8) | b), 16777619);
          if (sampleCell) sample.push(r, g, b);
          count += 1;
        }
      }
      return { count, left: minX / copy.width, right: maxX / copy.width, min, max, dark, midtone, chromatic, hash, sample,
        triangles: stage.model.triangles, quiet: stage.model.blade?.visible === false };
    });
    const MeanSampleDiff = (a, b) => {
      const n = Math.min(a.sample.length, b.sample.length);
      let sum = 0, compared = 0;
      for (let i = 0; i < n; i += 3) {
        if (a.sample[i] < 0 || b.sample[i] < 0) continue;
        sum += Math.abs(a.sample[i] - b.sample[i]) + Math.abs(a.sample[i + 1] - b.sample[i + 1]) + Math.abs(a.sample[i + 2] - b.sample[i + 2]);
        compared += 3;
      }
      return compared ? sum / compared : Infinity;
    };
    const pixels = await ReadPixels();
    Check("中正式真实模型在视口内居中且占主要宽度",
      pixels.count > 2500 && pixels.left > .03 && pixels.right < .97 && pixels.right - pixels.left > .60
      && pixels.triangles === 6703 && pixels.quiet,
      JSON.stringify({ count: pixels.count, left: pixels.left, right: pixels.right, triangles: pixels.triangles, quiet: pixels.quiet }));
    if (shots) await page.screenshot({ path: path.join(shotDir, "WeaponInspection.png") });

    const canvas = page.locator("#view");
    const fittedRect = await canvas.boundingBox();
    await canvas.hover({ position: { x: fittedRect.width * .375, y: fittedRect.height * .475 } });
    await page.mouse.wheel(0, -8000);
    await page.waitForFunction(() => window.WeaponInspection.scene.zoom > 1);
    const closeupPixels = await ReadPixels();
    const closeup = await page.locator("#viewScale").evaluate((scale) => {
      const { camera, height } = window.WeaponInspection.scene;
      return { label: scale.textContent, width: scale.getBoundingClientRect().width,
        projectedMillimeter: .001 * height / (camera.top - camera.bottom) };
    });
    Check("滚轮放大到 1 mm 比例尺时仍能绘制模型细节",
      closeup.label === "1 mm" && closeup.width >= 56 && Math.abs(closeup.width - closeup.projectedMillimeter) < 1
      && closeupPixels.count > 2500, JSON.stringify(closeup));
    if (shots) await page.locator(".stage").screenshot({ path: path.join(shotDir, "WeaponInspectionCloseup.png") });
    await canvas.press("Home");

    const channels = ["beauty", "normal", "tangent", "albedo", "roughness", "metallic", "ao", "reflection", "shadow"];
    const Channel = (id) => page.locator(`[data-channel="${id}"]`).click();
    const activeChannel = page.locator('.view-bar button[aria-pressed="true"]');
    Check("顶栏只保留渲染通道切换", (await page.locator(".view-bar button").evaluateAll((buttons) =>
      buttons.map((button) => button.dataset.channel))).join() === channels.join());

    await page.locator("#gridToggle").click();
    await Inspect("HanYang");
    const CameraState = () => page.evaluate(() => {
      const { yaw, pitch, zoom, center } = window.WeaponInspection.scene;
      return [yaw, pitch, zoom, ...center.toArray()];
    });
    const beforeChannels = await CameraState();
    const rendered = {};
    let channelSelection = true;
    for (const id of channels) {
      await Channel(id);
      rendered[id] = await ReadPixels();
      channelSelection &&= await activeChannel.count() === 1 && await activeChannel.getAttribute("data-channel") === id;
    }
    const views = Object.values(rendered);
    Check("汉阳造九个通道各自绘制模型并保持机位",
      channelSelection && views.every((view) => view.count > 2500 && Math.abs(view.count - rendered.beauty.count) <= rendered.beauty.count * 0.03)
      && new Set(views.map((view) => view.hash)).size === channels.length
      && (await CameraState()).join() === beforeChannels.join());
    Check("法线、切线、底色和反射保留色彩，粗糙度、金属度和阴影有真实灰阶",
      [rendered.normal, rendered.tangent, rendered.albedo, rendered.reflection].every((view) => view.chromatic > 1000)
      && [rendered.roughness, rendered.metallic, rendered.shadow].every((view) => view.chromatic === 0 && view.max - view.min > 10)
      && rendered.shadow.min < 128 && rendered.shadow.max === 255);
    await Channel("beauty");
    const restoredBeauty = await ReadPixels();
    Check("切回完整材质恢复同一画面", MeanSampleDiff(restoredBeauty, rendered.beauty) < 4,
      `diff=${MeanSampleDiff(restoredBeauty, rendered.beauty).toFixed(2)}`);
    const environmentLight = page.getByRole("slider", { name: "环境光" });
    const defaultLight = await environmentLight.inputValue();
    const SetEnvironment = (value) => environmentLight.evaluate((input, percent) => {
      input.value = percent;
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }, value);
    const MeanBrightness = ({ sample }) => {
      const values = sample.filter((value) => value >= 0);
      return values.reduce((sum, value) => sum + value, 0) / values.length;
    };
    await SetEnvironment("100");
    const originalLight = await ReadPixels();
    const lift = MeanBrightness(restoredBeauty) - MeanBrightness(originalLight);
    Check("默认环境补光提亮模型，滑杆同时更新材质球",
      defaultLight === "180" && lift > 8 && await environmentLight.getAttribute("aria-valuetext") === "100%"
      && await page.evaluate(() => {
        const stage = window.WeaponInspection.scene;
        return stage.materialPreview.scene.environmentIntensity === stage.scene.environmentIntensity;
      }), `显示亮度变化=${lift.toFixed(2)}`);
    await Channel("shadow");
    Check("环境光强度不改变主灯 Shadow 诊断", (await ReadPixels()).hash === rendered.shadow.hash);

    const SampleTimber = () => page.evaluate(async () => {
      const { Raycaster, Vector3 } = await import("three");
      const stage = window.WeaponInspection.scene;
      stage.Draw();
      const copy = document.createElement("canvas");
      copy.width = stage.canvas.width;
      copy.height = stage.canvas.height;
      const context = copy.getContext("2d");
      context.drawImage(stage.canvas, 0, 0);
      const pixels = context.getImageData(0, 0, copy.width, copy.height).data;
      const model = stage.model.body.children[0], meshes = [];
      model.traverse(object => { if (object.isMesh) meshes.push(object); });
      const ray = new Raycaster();
      return [
        ["MainWood_", -.045, .16],
        ["MainWood_", -.006, -.055],
        ["MainWood_", .022, -.43],
        ["UpperWood_", .045, -.40],
        ["FrontWood_", .023, -.75],
      ].map(([part, y, z]) => {
        const values = [];
        for (const dy of [-.002, 0, .002]) for (const dz of [-.012, -.006, 0, .006, .012]) {
          const point = model.localToWorld(new Vector3(0, y + dy, z + dz)).project(stage.camera);
          ray.setFromCamera(point, stage.camera);
          const hit = ray.intersectObjects(meshes, false)[0];
          if (!hit?.object.userData.hanYang173RPart?.startsWith(part)) continue;
          const x = Math.floor((.5 + .5 * point.x) * copy.width);
          const row = Math.floor((.5 - .5 * point.y) * copy.height);
          const offset = (row * copy.width + x) * 4;
          if (pixels[offset + 3] >= 250) values.push(pixels.slice(offset, offset + 3));
        }
        return [0, 1, 2].map(component => {
          const sorted = values.map(value => value[component]).sort((a, b) => a - b);
          return sorted.length >= 5 ? sorted[Math.floor(sorted.length / 2)] : null;
        });
      });
    });
    // The reference wood finish was calibrated in the original 100% studio light.
    const timber = { albedo: [], roughness: [], reflection: [] };
    for (const yaw of [0, Math.PI]) {
      await page.evaluate(angle => window.WeaponInspection.scene.SetView(angle, .10), yaw);
      for (const channel of Object.keys(timber)) {
        await Channel(channel);
        timber[channel].push(...await SampleTimber());
      }
    }
    const SpreadOf = (rows, index) => Math.max(...rows.map(row => row[index])) - Math.min(...rows.map(row => row[index]));
    Check("两侧五处木面的底色都在同一棕色范围",
      timber.albedo.every(([r, g, b]) => r >= 72 && r <= 94 && r > g && g > b)
      && [0, 1, 2].every(index => SpreadOf(timber.albedo, index) < 14), JSON.stringify(timber.albedo));
    Check("木面粗糙度接近，前木反射不过亮",
      timber.roughness.every(([r, g, b]) => r >= 105 && r <= 190 && r === g && g === b)
      && SpreadOf(timber.roughness, 0) < 24
      && timber.reflection.every(([r, g, b]) => r > 3 && g > 3 && b > 3 && Math.max(r, g, b) < 62)
      && SpreadOf(timber.reflection, 2) < 28, JSON.stringify([timber.roughness, timber.reflection]));
    await SetEnvironment(defaultLight);

    await Inspect("Dadao");
    await Channel("shadow");
    await page.evaluate(() => window.WeaponInspection.scene.SetView(0, .1));
    const litBlade = await ReadPixels();
    await page.evaluate(() => window.WeaponInspection.scene.SetView(Math.PI, .1));
    const shadowedBlade = await ReadPixels();
    Check("大刀正面保持受光和局部遮挡，背面没有密集阴影条纹",
      litBlade.count > 2500 && litBlade.dark > 10 && (litBlade.dark + litBlade.midtone) < litBlade.count * .06
      && shadowedBlade.count > 2500 && shadowedBlade.dark > shadowedBlade.count * .9,
      JSON.stringify({ lit: { count: litBlade.count, dark: litBlade.dark, midtone: litBlade.midtone },
        shadowed: { count: shadowedBlade.count, dark: shadowedBlade.dark } }));
    await page.evaluate(([yaw, pitch]) => window.WeaponInspection.scene.SetView(yaw, pitch), beforeChannels);
    await Channel("ao");
    await Inspect("ZhongZheng");
    const packedAo = await ReadPixels();
    Check("换模型保留 AO，汉阳造同时显示接触遮蔽与无遮挡区域",
      await activeChannel.getAttribute("data-channel") === "ao" && packedAo.chromatic === 0 && packedAo.max < 255
      && packedAo.count > 2500 && rendered.ao.chromatic === 0 && rendered.ao.min < 255 && rendered.ao.max === 255,
      JSON.stringify({ hanYang: [rendered.ao.min, rendered.ao.max], zhongZheng: [packedAo.min, packedAo.max] }));
    await Channel("beauty");
    await page.locator("#gridToggle").click();

    const rect = await canvas.boundingBox();
    const [beforeYaw, beforePitch, , ...fitCenter] = await CameraState();
    await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
    await page.mouse.down();
    await page.mouse.move(rect.x + rect.width / 2 + 65, rect.y + rect.height / 2 + 25, { steps: 4 });
    await page.mouse.up();
    await page.mouse.wheel(0, -230);
    await page.waitForFunction(() => window.WeaponInspection.scene.zoom > 1);
    const [yaw, pitch] = await CameraState();
    Check("拖动、滚轮改变实际相机", Math.abs(yaw - beforeYaw) > .1 && Math.abs(pitch - beforePitch) > .1);
    const beforePan = await page.evaluate(() => window.WeaponInspection.scene.center.toArray());
    await page.mouse.down({ button: "right" });
    await page.mouse.move(rect.x + rect.width / 2 + 103, rect.y + rect.height / 2 + 25, { steps: 3 });
    await page.mouse.up({ button: "right" });
    Check("右键拖动平移检视中心", await page.evaluate((before) => window.WeaponInspection.scene.center.toArray()
      .some((value, index) => Math.abs(value - before[index]) > .01), beforePan));
    await canvas.press("Home");
    const [, , resetZoom, ...resetCenter] = await CameraState();
    Check("Home 适配复位倍率和中心", resetZoom === 1 && resetCenter.every((value, index) => Math.abs(value - fitCenter[index]) < .001));
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
    const Touch = (type, points) => cdp.send("Input.dispatchTouchEvent", {
      type, touchPoints: points.map(([x, y], id) => ({ x, y, id })),
    });
    const Frames = () => page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
    const cx = rect.x + rect.width / 2;
    const cy = rect.y + rect.height / 2;
    const [touchYaw] = await CameraState();
    await Touch("touchStart", [[cx, cy]]);
    for (let i = 1; i <= 4; i++) await Touch("touchMove", [[cx + i * 15, cy + i * 5]]);
    await Touch("touchEnd", []);
    await Frames();
    Check("单指触摸拖动旋转", Math.abs((await CameraState())[0] - touchYaw) > .1);

    const midX = cx + 120;
    const probe = () => page.evaluate(([x, y, width, height]) => {
      const stage = window.WeaponInspection.scene;
      const e = stage.camera.matrixWorld.elements;
      const mpp = stage.span / (stage.zoom * stage.height);
      return { zoom: stage.zoom, probe: [0, 1, 2].map(i => stage.center.getComponent(i) + e[i] * x * mpp - e[4 + i] * y * mpp), width, height };
    }, [120, 0, rect.width, rect.height]);
    const Screen = (point) => page.evaluate(([px, py, pz]) => {
      const stage = window.WeaponInspection.scene;
      stage.camera.updateMatrixWorld();
      const v = stage.center.clone().set(px, py, pz).project(stage.camera);
      return [v.x, v.y];
    }, point);
    const { zoom: zoomBefore, probe: pinchPoint } = await probe();
    await Touch("touchStart", [[midX - 40, cy], [midX + 40, cy]]);
    for (let i = 1; i <= 8; i++) await Touch("touchMove", [[midX - 40 - i * 10, cy], [midX + 40 + i * 10, cy]]);
    await Touch("touchEnd", []);
    await Frames();
    const [zoomAfter] = [(await CameraState())[2]];
    const [ndcX, ndcY] = await Screen(pinchPoint);
    const screenX = rect.x + (ndcX + 1) / 2 * rect.width;
    const screenY = rect.y + (1 - ndcY) / 2 * rect.height;
    Check("双指捏合张开放大约三倍，捏合中点下的模型位置不动",
      zoomAfter / zoomBefore > 2.2 && Math.hypot(screenX - midX, screenY - cy) < 2,
      JSON.stringify({ zoomBefore, zoomAfter, screenX, screenY, midX, cy }));

    const centerBeforeTouchPan = await page.evaluate(() => window.WeaponInspection.scene.center.toArray());
    await Touch("touchStart", [[cx - 40, cy], [cx + 40, cy]]);
    for (let i = 1; i <= 4; i++) await Touch("touchMove", [[cx - 40 + i * 15, cy + i * 8], [cx + 40 + i * 15, cy + i * 8]]);
    await Touch("touchEnd", []);
    await Frames();
    Check("双指同向拖动平移检视中心", await page.evaluate((before) => window.WeaponInspection.scene.center.toArray()
      .some((value, index) => Math.abs(value - before[index]) > .001), centerBeforeTouchPan));

    await page.evaluate(() => { window.WeaponInspection.scene.renderer.getContext().finish(); });
    await Frames();
    await Touch("touchStart", [[cx, cy]]);
    await Touch("touchEnd", []);
    await Touch("touchStart", [[cx + 2, cy]]);
    await Touch("touchEnd", []);
    await Frames();
    const [, , tapZoom, ...tapCenter] = await CameraState();
    Check("双击适配复位倍率和中心", tapZoom === 1 && tapCenter.every((value, index) => Math.abs(value - fitCenter[index]) < .001),
      JSON.stringify({ tapZoom, tapCenter, fitCenter }));
    await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: false });
    await cdp.detach();
    await page.locator("#gridToggle").click();
    await page.locator("#mountToggle").click();
    await page.waitForFunction(() => !document.querySelector("#muzzleLabel").hidden && !document.querySelector("#gripLabel").hidden);
    await page.locator("#bayonetToggle").click();
    Check("网格、挂点、刺刀只切换预览状态", await page.evaluate(() => {
      const stage = window.WeaponInspection.scene;
      return !stage.grid.visible && stage.model.blade.visible && !document.querySelector("#muzzleLabel").hidden;
    }));

    await Inspect("HanYang");
    const meshPicker = page.getByRole("combobox", { name: "网格", exact: true });
    const materialPicker = page.getByRole("combobox", { name: "材质", exact: true });
    Check("检查器显示真实网格与贴图缩略图", await page.evaluate(() => {
      const inspector = document.querySelector("#modelInspector");
      const details = inspector.closest(".details");
      const count = window.WeaponInspection.scene.model.body.children[0].children.filter((child) => child.isMesh).length;
      return inspector.querySelector('[aria-label="网格"]').options.length === count
        && count === 13 && details.scrollWidth === details.clientWidth && inspector.querySelectorAll(".material-metrics dd").length === 3
        && inspector.querySelectorAll(".material-properties img").length >= 3
        && !!inspector.querySelector(".texture-metadata").textContent.match(/\d+ × \d+ · (sRGB|线性) · UV\d/);
    }));
    if (shots) await page.locator(".details").screenshot({ path: path.join(shotDir, "WeaponInspectorHierarchy.png") });
    const MaterialPixels = () => page.locator(".material-preview canvas").evaluate((canvas) => {
      const data = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
      let pixels = 0, hash = 0;
      for (let i = 3; i < data.length; i += 4) {
        if (!data[i]) continue;
        pixels++;
        hash = (Math.imul(hash, 31) + data[i - 3] * 3 + data[i - 2] * 5 + data[i - 1] * 7) | 0;
      }
      return { pixels, hash };
    });
    const originalModel = await ReadPixels();
    const originalMaterial = await MaterialPixels();
    const testBatch = await page.evaluate(() => {
      const meshes = window.WeaponInspection.scene.model.body.children[0].children.filter(object => object.isMesh);
      const index = meshes.findIndex((mesh, i) => i !== 0 && mesh.userData.hanYangPartRanges?.length > 1);
      return {index,part:meshes[index].userData.hanYangPartRanges[0].name,material:meshes[index].material.name};
    });
    await meshPicker.selectOption({ index: testBatch.index });
    const meshSlot = page.locator(".mesh-slot").first();
    Check("合并网格保留独立部件的可选区域", await meshSlot.locator("span").textContent() === testBatch.part);
    await meshSlot.click();
    Check("部件区域链接到共享材质", await materialPicker.locator("option:checked").textContent() === testBatch.material);
    const selectedPart = await page.evaluate(index => {
      const stage = window.WeaponInspection.scene;
      stage.Draw();
      const { group, geometry } = stage.selection;
      const mesh = stage.model.body.children[0].children.filter(object => object.isMesh)[index];
      const region = mesh.userData.hanYangPartRanges[0];
      return group.parent === mesh && geometry.attributes.position.count === region.count
        && region.count < mesh.geometry.index.count;
    },testBatch.index);
    const highlighted = await ReadPixels();
    const selectedMaterial = await MaterialPixels();
    Check("子网格点选只高亮对应几何，材质球随选择更新",
      selectedPart && highlighted.hash !== originalModel.hash && await meshSlot.getAttribute("aria-pressed") === "true"
      && originalMaterial.pixels > 4000 && selectedMaterial.pixels > 4000 && selectedMaterial.hash !== originalMaterial.hash);
    const wireframe = page.locator("#wireframeToggle");
    await wireframe.click();
    Check("线框显示模型拓扑，并保留子网格高亮", await wireframe.getAttribute("aria-pressed") === "true"
      && (await ReadPixels()).hash !== highlighted.hash
      && await page.evaluate(() => window.WeaponInspection.scene.selectionMaterial.wireframe));
    await wireframe.click();
    const afterWireframe = await ReadPixels();
    Check("关闭线框恢复选中的完整材质画面", MeanSampleDiff(afterWireframe, highlighted) < 4,
      `diff=${MeanSampleDiff(afterWireframe, highlighted).toFixed(2)}`);
    await meshSlot.click();
    const afterDeselect = await ReadPixels();
    Check("再次点选清除高亮", await meshSlot.getAttribute("aria-pressed") === "false" && MeanSampleDiff(afterDeselect, originalModel) < 4,
      `diff=${MeanSampleDiff(afterDeselect, originalModel).toFixed(2)}`);

    const split = page.getByRole("button", { name: "双视口" });
    const single = page.getByRole("button", { name: "单视口" });
    const beforeSplit = await CameraState();
    const originalWidth = await page.locator("#view").evaluate((view) => view.clientWidth);
    await split.click();
    Check("54 像素顶栏，桌面双视口左右对齐", await page.evaluate(() => {
      const header = document.querySelector(".tool-header").getBoundingClientRect();
      const ref = document.querySelector("#referenceView").getBoundingClientRect();
      const model = document.querySelector(".stage").getBoundingClientRect();
      return header.height === 54 && ref.right < model.left
        && ref.top === model.top && ref.bottom === model.bottom && Math.abs(ref.width - model.width) < 2;
    }));
    const images = await Promise.all([
      { name: "Concept.png", width: 1200, height: 640, background: "#a5835b" },
      { name: "Surface.png", width: 640, height: 1200, background: "#546779" },
    ].map(async ({ name, ...create }) => ({
      name, mimeType: "image/png", buffer: await sharp({ create: { ...create, channels: 3 } }).png().toBuffer(),
    })));
    await page.locator("#referenceFiles").setInputFiles(images);
    const reference = page.locator("#referenceView");
    const referenceImage = reference.locator("img");
    const imageWidth = () => referenceImage.evaluate((image) => image.getBoundingClientRect().width);
    await referenceImage.waitFor({ state: "visible" });
    const fitted = await imageWidth();
    await reference.hover();
    await page.mouse.wheel(0, -720);
    await page.waitForFunction((width) => document.querySelector("#referenceView img").getBoundingClientRect().width > width * 2, fitted);
    const zoomed = await imageWidth();
    await page.getByRole("button", { name: "Surface.png" }).click();
    await page.getByRole("button", { name: "Concept.png" }).click();
    await single.click();
    Check("回到单视口恢复显示宽度、保留 3D 朝向", await reference.isHidden()
      && await page.locator("#view").evaluate((view) => view.clientWidth) === originalWidth
      && (await CameraState()).slice(0, 3).join() === beforeSplit.slice(0, 3).join());
    await split.click();
    Check("多图导入并保留各自缩放", await page.locator("#referenceList button").count() === 2
      && await referenceImage.getAttribute("alt") === "Concept.png" && Math.abs(await imageWidth() - zoomed) < 1);
    await page.locator("#referenceFit").click();
    Check("原画可复位", Math.abs(await imageWidth() - fitted) < 1);
    await page.locator("#removeReference").click();
    Check("移除当前图后选中剩余原画", await referenceImage.getAttribute("alt") === "Surface.png");
    if (shots) await page.screenshot({ path: path.join(shotDir, "WeaponInspectionSplit.png") });
    await single.click();

    const firstPersonPreset = page.locator("#firstPersonPreset");
    const orbitPreset = page.locator("#orbitPreset");
    const WaitFirstPerson = (id) => page.waitForFunction((key) => window.WeaponInspection.scene.firstPerson?.viewmodel.weaponId === key
      && document.querySelector("#viewScale").hidden, id, { timeout: 60000 });
    Check("第一人称资源在启用预设前不加载", !requests.some(({ url }) => url.includes("/Script_WeaponInspectionFirstPerson.mjs")));
    await canvas.press("=");
    const orbitBeforeFirstPerson = await CameraState();
    await page.evaluate(() => localStorage.setItem("tengxian1938_graphics_v1", JSON.stringify({ fov: 67 })));
    await firstPersonPreset.click();
    await WaitFirstPerson("HanYang");
    const held = await page.evaluate(() => {
      const stage = window.WeaponInspection.scene;
      const { viewmodel, camera } = stage.firstPerson;
      const muzzle = viewmodel.rig.group.localToWorld(viewmodel.rig.muzzle.clone()).project(camera);
      return { fov: camera.fov, aspect: camera.aspect, forearms: viewmodel.riggedArms?.root.visible,
        muzzle: muzzle.toArray(), source: viewmodel.rigSource, cameraParent: viewmodel.root.parent === camera,
        environment: stage.firstPerson.scene.environmentIntensity === stage.scene.environmentIntensity };
    });
    Check("第一人称预设复用武器和双臂，按游戏 FOV 投影到 16:9 画面",
      held.fov === 67 && held.aspect === 16 / 9 && held.source === "model+riggedArms" && held.forearms && held.cameraParent && held.environment
      && held.muzzle[0] > .05 && held.muzzle.every((coordinate) => Math.abs(coordinate) < 1)
      && await page.locator("#firstPersonInfo").textContent() === "FOV 67° · 16:9", JSON.stringify(held));
    if (shots) await page.locator(".stage").screenshot({ path: path.join(shotDir, "WeaponInspectionFirstPerson.png") });
    await orbitPreset.click();
    await page.waitForFunction(() => !document.querySelector("#viewScale").hidden);
    Check("切回外观恢复原来的缩放、位置和通道",
      (await CameraState()).join() === orbitBeforeFirstPerson.join() && await activeChannel.getAttribute("data-channel") === "beauty"
      && await page.locator("#gridToggle").isEnabled());
    await firstPersonPreset.click();
    await WaitFirstPerson("HanYang");
    await Inspect("ServicePistol");
    await WaitFirstPerson("ServicePistol");
    await Inspect("Type94Tankette");
    Check("换手持枪械保留第一人称，换载具自动回到外观",
      await firstPersonPreset.isDisabled() && await orbitPreset.getAttribute("aria-pressed") === "true"
      && await page.evaluate(() => !window.WeaponInspection.scene.firstPerson));
    await page.evaluate(() => localStorage.removeItem("tengxian1938_graphics_v1"));

    const search = page.locator("#modelSearch");
    await search.fill("zb26");
    Check("可按编号搜索，过滤仅影响模型列表", await page.locator("[data-model]").count() === 1
      && await page.locator("[data-model]").getAttribute("data-model") === "Zb26");
    await Inspect("Zb26");
    Check("换模型后同步数据、隐藏不可用的刺刀预览", await page.locator("#modelName").textContent() === "捷克式"
      && await page.locator("#bayonetToggle").isHidden() && await page.locator("#bayonetToggle").getAttribute("aria-pressed") === "false");
    await search.fill("no-such-model");
    Check("搜索无结果有反馈且保留当前模型", await page.locator(".search-empty").isVisible() && await page.locator("#modelName").textContent() === "捷克式");
    await search.clear();

    const assets = await page.evaluate(async (ids) => {
      const tool = window.WeaponInspection;
      const { Box3 } = await import("three");
      const details = {};
      for (const id of ids) {
        const model = await tool.Select(id);
        if (!model) { details[id] = null; continue; }
        tool.scene.Draw();
        details[id] = {
          minY: new Box3().setFromObject(model.body, true).min.y,
          pitch: model.pose.rotation.x, span: model.size.toArray(),
          turret: !!(model.body.getObjectByName("TurretYaw") || model.body.getObjectByName("Node_TurretYaw")), triangles: model.triangles,
          file: model.file,
        };
      }
      return details;
    }, assetIds);
    Check("所有模型条目都能绘制", Object.values(assets).every((model) => model?.triangles > 0),
      Object.entries(assets).filter(([, model]) => !model?.triangles).map(([id]) => id).join(","));
    const { Type92Hmg, MediumMortar, OfficerSwordSet, Type94Tankette, Type89MediumTank, HanYang, Type38 } = assets;
    Check("架设武器按各自姿态落地，军刀横放，车辆保留炮塔，GLB 使用原模型",
      [Type92Hmg, MediumMortar, Type94Tankette, Type89MediumTank].every((model) => Math.abs(model?.minY) < .005)
      && Math.abs(Type92Hmg.pitch) < .001 && MediumMortar.pitch > 1 && MediumMortar.pitch < 1.15
      && MediumMortar.span[1] > MediumMortar.span[0] * .9 && OfficerSwordSet?.span[0] > OfficerSwordSet?.span[1] * 5
      && Type94Tankette?.turret && /Model_Type94Tankette\.glb$/.test(Type94Tankette.file)
      && Type89MediumTank?.turret && /Model_Type89MediumTank\.glb$/.test(Type89MediumTank.file)
      && /173R.*\.glb$/.test(HanYang?.file) && /511.*\.glb$/.test(Type38?.file));
    for (const id of vehicleIds) {
      await search.fill(id);
      await Inspect(id);
      if (shots) await page.screenshot({ path: path.join(shotDir, `WeaponInspection_${id}.png`) });
    }
    await search.clear();
    await page.setViewportSize({ width: 390, height: 844 });
    await Inspect("ZhongZheng");
    if (shots) await page.screenshot({ path: path.join(shotDir, "WeaponInspectionMobile.png") });
    Check("窄窗口视口和控制可达、没有横向溢出", await page.evaluate(() => {
      const details = document.querySelector(".details");
      return document.documentElement.scrollWidth <= innerWidth && details.scrollWidth === details.clientWidth
        && document.querySelector("#view").clientWidth > 280 && document.querySelector("#view").clientHeight > 220;
    }));
    await split.click();
    Check("窄窗口原画与模型上下排列，两个视口都可用", await page.evaluate(() => {
      const ref = document.querySelector("#referenceView").getBoundingClientRect();
      const model = document.querySelector(".stage").getBoundingClientRect();
      return document.documentElement.scrollWidth <= innerWidth
        && ref.bottom < model.top && ref.width === model.width && ref.height > 220 && model.height > 220;
    }));
    await single.click();
    await page.setViewportSize({ width: 280, height: 550 });
    Check("通道多行排列时保留可用视口", await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth
      && document.querySelector("#view").clientHeight > 220
      && [...document.querySelectorAll("[data-channel]")].every((button) => button.getBoundingClientRect().right <= innerWidth)));
    Check("枪械检查台只读资源，不启动游戏与摄影棚", requests.length > 0
      && requests.every(({ url, method }) => method === "GET" && !/Script_(Main|ToolStudioRenderBase)\.mjs|\/__scene\//.test(url)));
    Check("枪械窗口没有浏览器错误", errors.length === 0, errors.slice(0, 3).join(" | "));
    await Promise.all([page.waitForEvent("close"), page.locator("#controlCenter").click()]);
    Check("窗口内的控制中心入口返回原窗口", !center.isClosed() && center.url() === `${base}ControlCenter.html`);
    await center.close();

    const { page: legacy } = await OpenPage(`${base}Tool_Studio.html?tool=weapon`, { waitUntil: "commit" });
    await legacy.waitForURL(`${base}Tool_WeaponInspection.html`);
    Check("旧摄影棚链接直达枪械检查台", true);
    await legacy.close();
  }

  if (!only || only.has("firstPerson")) {
    const { page: legacyFp } = await OpenPage(`${base}Tool_Studio.html?tool=firstPerson&mode=bolt&weapon=HanYang`, { waitUntil: "commit" });
    await legacyFp.waitForURL((url) => url.pathname.endsWith("/AdvancedTools/Tool_FirstPersonInspection.html")
      && url.searchParams.get("mode") === "bolt" && url.searchParams.get("weapon") === "HanYang");
    Check("旧摄影棚链接保留参数直达第一人称持枪检查独立窗口", true);
    await legacyFp.close();

    const { page, errors } = await OpenPage(`${base}Tool_FirstPersonInspection.html?audio=0&quality=low&scale=small`);
    await page.waitForFunction(() => window.FirstPersonInspection?.ready, null, { timeout: 180000 });
    await page.evaluate(() => window.FirstPersonInspection.StepFrames(4));
    const snap = await page.evaluate(() => window.FirstPersonInspection.Snapshot());
    Check("第一人称检查独立窗口载入昼光靶场与汉阳造",
      snap.sky === "firstLevelBattleDay" && snap.weaponId === "HanYang" && snap.ammo === 5 && snap.mode === "range",
      JSON.stringify(snap));
    // 右键禁止弹出浏览器菜单并触发开镜
    const ctxPrevented = await page.evaluate(() => {
      const ev = new MouseEvent("contextmenu", { bubbles: true, cancelable: true, button: 2 });
      document.getElementById("view").dispatchEvent(ev);
      return ev.defaultPrevented;
    });
    Check("视口右键拦截浏览器菜单", ctxPrevented);
    // 校验空仓换弹走 openSkipS 实机路径
    await page.locator('[data-act="emptyReload"]').click();
    await page.evaluate(() => window.FirstPersonInspection.StepFrames(6));
    const reloadSnap = await page.evaluate(() => window.FirstPersonInspection.Snapshot());
    Check("空仓换弹与实机同源（空仓开膛触发 reload）", reloadSnap.action?.kind === "reload" && reloadSnap.ammo === 0, JSON.stringify(reloadSnap));
    // 校验 Agent 专用空白场景与默认晴天光照
    await page.locator('[data-scene="agentBlank"]').click();
    await page.evaluate(() => window.FirstPersonInspection.StepFrames(4));
    const blankCheck = await page.evaluate(() => ({
      snap: window.FirstPersonInspection.Snapshot(),
      rangeVisible: window.FirstPersonInspection.app.range.root.visible,
    }));
    Check("切入 Agent 空白场景自动隐藏靶场并默认切到晴天光照",
      blankCheck.snap.scene === "agentBlank" && blankCheck.snap.sky === "testSceneDay" && blankCheck.rangeVisible === false,
      JSON.stringify(blankCheck));
    await page.locator('[data-scene="range"]').click();
    await page.evaluate(() => window.FirstPersonInspection.StepFrames(2));
    const backRange = await page.evaluate(() => ({
      snap: window.FirstPersonInspection.Snapshot(),
      rangeVisible: window.FirstPersonInspection.app.range.root.visible,
    }));
    Check("切回靶场恢复靶场几何与默认昼光",
      backRange.snap.scene === "range" && backRange.snap.sky === "firstLevelBattleDay" && backRange.rangeVisible === true,
      JSON.stringify(backRange));
    Check("第一人称独立窗口没有浏览器错误", errors.length === 0, errors.slice(0, 3).join(" | "));
    await page.close();
  }

  // --- 3b. 特效预览 / 音效音乐独立窗口（2026-11-23 从工具宿主拆出；2026-11-28 特效台接入统一 CameraProfile.standard）---
  // 特效窗口复用统一后处理管线（Script_CameraProfile / Script_Post*，内部按帧图引用大气/光雾辅助模块），
  // 但仍不装游戏主入口、GI、材质库、世界、摄影棚宿主与正片关卡数据；声音窗口完全不装 three 或任何渲染/后处理模块。
  const VFX_FORBIDDEN = /\/Script_(Main|Materials|MaterialShading|World|ToolStudioRenderBase|TengxianCity|TengxianField)\.mjs|\/Data_(Battle|Tengxian|FirstLevelMissionLayout)\.mjs|\/__scene\//;
  const AUDIO_FORBIDDEN = /\/Script_(Main|Post\w*|CameraProfile|Light|Sky|Gi|Atmosphere|Materials|MaterialShading|World|ClusteredLights|ToolStudioRenderBase|TengxianCity|TengxianField)\.mjs|\/Data_(Battle|Tengxian|FirstLevelMissionLayout)\.mjs|\/__scene\//;
  if (!only || only.has("vfx")) {
    const { page: legacy } = await OpenPage(`${base}Tool_Studio.html?tool=vfx&effect=ExplosionGrenade`, { waitUntil: "commit" });
    await legacy.waitForURL((url) => url.pathname.endsWith("/AdvancedTools/Tool_VfxPreview.html") && url.searchParams.get("effect") === "ExplosionGrenade");
    Check("旧工具宿主链接带参数转到特效预览独立窗口", true);
    await legacy.close();

    const requests = [];
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(`PAGEERROR ${String(error).slice(0, 240)}`));
    page.on("console", (message) => { if (message.type() === "error") errors.push(`CONSOLE ${message.text().slice(0, 200)}`); });
    page.on("request", (request) => requests.push(request.url()));
    await page.goto(`${base}Tool_VfxPreview.html?effect=FireMedium&quality=low&manual=1`, { waitUntil: "load", timeout: 120000 });
    await page.waitForFunction(() => window.VfxPreview?.ready || !document.getElementById("vfxBootError")?.hidden, null, { timeout: 180000 });
    await page.evaluate(() => window.VfxPreview.StepFrames(120));
    const fire = await page.evaluate(() => {
      const v = window.VfxPreview, i = v.Inspect();
      return { effect: i.editor.effect, alive: i.editor.particles.entries.reduce((n, e) => n + e.particleCount, 0),
        lights: i.lights, env: i.environment, exposure: i.exposure, presets: v.environment.presetIds.length,
        looks: v.environment.Looks().map((look) => look.id), panel: !!document.querySelector('.edPanel.work [data-vfx-action="play"]'),
        sceneChildren: v.stage.scene.children.map((child) => child.type) };
    });
    Check("特效窗口：持续火焰在中性预览台里真实发射，火源点光亮着", fire.effect === "FireMedium" && fire.alive > 0 && fire.lights.fires > 0 && fire.lights.active > 0 && fire.panel,
      JSON.stringify({ alive: fire.alive, lights: fire.lights }));
    Check("特效窗口：昼夜来自项目环境预设（预设自带 looks）", fire.presets > 0 && fire.env.preset && fire.looks.length >= 2 && Number.isFinite(fire.env.hour),
      JSON.stringify({ env: fire.env, looks: fire.looks, presets: fire.presets }));
    const buffer = await page.screenshot();
    const spread = await Spread(buffer, { left: 40, top: 80, width: 900, height: 700 });
    Check("特效窗口：视口不是一片纯色", spread > 12, `spread=${spread.toFixed(1)}`);
    if (shots) await fs.writeFile(path.join(shotDir, "VfxPreview_FireMedium.png"), buffer);

    // 换昼夜：灯与天光取预设那一档的数值；后处理曝光锁定为标准 CameraProfile（昼夜不再改后处理）
    const looks = {};
    for (const look of fire.looks) {
      await page.locator("[data-vfx-environment]").selectOption(look);
      await page.evaluate(() => window.VfxPreview.StepFrames(2));
      looks[look] = await page.evaluate(() => {
        const v = window.VfxPreview;
        return { look: v.environment.lookId, sun: v.stage.lights.sun.intensity, wanted: v.environment.env.lightIntensity,
          exposure: v.stage.OutputExposure, profile: v.stage.post?.cameraProfileId, probe: v.stage.lights.globalProbe.intensity,
          wantedProbe: v.environment.env.shProbeIntensity, flareScale: v.stage.lights.flareSceneScale };
      });
    }
    Check("特效窗口：每一档的主光与天光等于环境预设拼出来的值，后处理曝光固化为标准 CameraProfile",
      Object.entries(looks).every(([id, s]) => s.look === id && Math.abs(s.sun - s.wanted) < 1e-6
        && Math.abs(s.exposure - CAMERA_PROFILES.standard.exposure) < 1e-6 && s.profile === CAMERA_PROFILES.standard.id
        && Math.abs(s.probe - s.wantedProbe) < 1e-6) && new Set(Object.values(looks).map((s) => s.sun)).size > 1, JSON.stringify(looks));
    const presetOptions = await page.locator("[data-vfx-env-preset] option").evaluateAll((options) => options.map((option) => option.value));
    if (presetOptions.length > 1) {
      await page.locator("[data-vfx-env-preset]").selectOption(presetOptions[1]);
      await page.waitForFunction((id) => window.VfxPreview.environment.presetId === id, presetOptions[1]);
      Check("特效窗口：可以换环境预设，昼夜选项跟着这份预设走", await page.evaluate(() => {
        const v = window.VfxPreview;
        const options = [...document.querySelectorAll("[data-vfx-environment] option")].map((option) => option.value);
        return options.join() === v.environment.Looks().map((look) => look.id).join() && options.includes(v.environment.lookId);
      }));
    }

    // 照明弹：进入时默认切到预设的「晚上」那一档，升空后有一盏带阴影的预览灯照着场地
    await page.evaluate(() => { window.VfxPreview.editor.SelectEffect("Illumination"); window.VfxPreview.StepFrames(330); });
    const flare = await page.evaluate(() => {
      const v = window.VfxPreview, i = v.Inspect();
      return { look: v.environment.lookId, flare: i.editor.flare, lights: i.lights, shadowLight: v.stage.lights.shadowLight.intensity,
        field: v.editor.flareField?.root.visible };
    });
    Check("特效窗口：照明弹默认用预设的「晚上」、点燃后照亮场地", flare.look === "night" && flare.field && flare.shadowLight > 0 && flare.lights.flareSceneScale === 1,
      JSON.stringify({ look: flare.look, shadow: flare.shadowLight, scale: flare.lights.flareSceneScale, phase: flare.flare?.flares?.[0]?.phase }));
    const flareShot = await page.screenshot();
    if (shots) await fs.writeFile(path.join(shotDir, "VfxPreview_IlluminationNight.png"), flareShot);
    Check("特效窗口：复用标准后处理，不加载游戏的灯光装置、天空、材质库与关卡", !requests.some((url) => VFX_FORBIDDEN.test(url)),
      requests.filter((url) => VFX_FORBIDDEN.test(url)).slice(0, 4).join(", "));
    Check("特效窗口：没有浏览器错误", errors.length === 0, errors.slice(0, 3).join(" | "));
    await page.close();
  }

  if (!only || only.has("audio")) {
    const { page: legacy } = await OpenPage(`${base}Tool_Studio.html?tool=audio&audio=0`, { waitUntil: "commit" });
    await legacy.waitForURL((url) => url.pathname.endsWith("/AdvancedTools/Tool_AudioPreview.html") && url.searchParams.get("audio") === "0");
    Check("旧工具宿主链接转到音效音乐独立窗口并保留参数", true, legacy.url());
    await legacy.close();

    const requests = [];
    const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(`PAGEERROR ${String(error).slice(0, 240)}`));
    page.on("console", (message) => { if (message.type() === "error") errors.push(`CONSOLE ${message.text().slice(0, 200)}`); });
    page.on("request", (request) => requests.push(request.url()));
    await page.goto(`${base}Tool_AudioPreview.html`, { waitUntil: "load", timeout: 120000 });
    await page.waitForFunction(() => window.AudioPreview?.ready, null, { timeout: 60000 });
    await page.mouse.click(40, 600);
    await page.locator(".edVolumeRange").fill("45");
    const volumeCheck = await page.evaluate(() => {
      const a = window.AudioPreview.audio;
      const saved = JSON.parse(localStorage.getItem("tengxian1938_tools_volume_v1") || "null");
      const playerSaved = localStorage.getItem("tengxian1938_audio_v1");
      return { masterVolume: a.masterVolume, toolsVolume: a.toolsVolume, saved, playerSaved };
    });
    await page.locator(".edVolumeRange").fill("100");
    await page.evaluate(() => localStorage.removeItem("tengxian1938_tools_volume_v1"));
    Check("音效窗口：顶栏音量条改写总音量并存入 tools_volume，不调 SetToolsVolume 也不碰玩家存档",
      Math.abs(volumeCheck.masterVolume - 0.45) < 1e-4 && volumeCheck.toolsVolume === null
      && Math.abs((volumeCheck.saved?.volume ?? -1) - 0.45) < 1e-4 && volumeCheck.playerSaved === null,
      JSON.stringify(volumeCheck));
    const audio = await page.evaluate(async () => {
      const { editor } = window.AudioPreview;
      const names = editor.Names();
      editor.PlayCurrent();
      editor.NewBlind();
      const { CATEGORIES } = await import("./AdvancedTools/Script_EditorAudio.mjs");
      const { SOUND_NAMES } = await import("./Script_Audio.mjs");
      const seen = new Set();
      for (const category of CATEGORIES.filter((c) => c !== "全部")) { editor.category = category; for (const name of editor.Names()) seen.add(name); }
      editor.category = "全部";
      return { count: names.length, blind: editor.blind?.options.length ?? 0, undescribed: SOUND_NAMES.filter((name) => !seen.has(name)),
        canvas: document.querySelectorAll("canvas").length, panel: !!document.querySelector(".edPanel.work [data-ambience]") };
    });
    Check("音效窗口：列出全部配方、盲听出四选一", audio.count >= 30 && audio.blind === 4 && audio.panel, JSON.stringify(audio));
    Check("音效窗口：每个配方都有分类与说明", audio.undescribed.length === 0, audio.undescribed.join(", "));
    await page.click('[data-ambience="night"]');
    await page.click('[data-music="tension"]');
    await page.waitForFunction(() => !!window.AudioPreview.audio.musicLayer && window.AudioPreview.audio.ambLayers.length + window.AudioPreview.audio.ambienceNodes.length > 0,
      null, { timeout: 60000 }).catch(() => {});
    const playing = await page.evaluate(() => {
      const a = window.AudioPreview.audio;
      return { paused: a.paused, ambience: a.ambiencePreset, ambienceLive: a.ambLayers.length + a.ambienceNodes.length, music: a.musicCue, musicLive: !!a.musicLayer };
    });
    Check("音效窗口：环境床与音乐能试听", !playing.paused && playing.ambience === "night" && playing.ambienceLive > 0 && playing.music === "tension" && playing.musicLive,
      JSON.stringify(playing));
    await page.click("[data-stop-ambience]");
    await page.click("[data-stop-music]");
    const stopped = await page.evaluate(() => {
      const a = window.AudioPreview.audio;
      return { ambience: a.ambiencePreset, music: a.musicCue, musicLive: !!a.musicLayer };
    });
    Check("音效窗口：环境与音乐各自都能停", stopped.ambience === "silence" && stopped.music === null && !stopped.musicLive, JSON.stringify(stopped));
    if (shots) await page.screenshot({ path: path.join(shotDir, "AudioPreview.png") });
    Check("音效窗口：不建渲染器、不加载 three 与任何渲染模块、不加载 Data_DevTools", audio.canvas === 0
      && !requests.some((url) => /\/vendor\/three\/|\/Script_(Vfx|Particle\w*|EditorStage|EditorMediaEntry)\.mjs|\/Data_DevTools\.mjs/.test(url) || AUDIO_FORBIDDEN.test(url)),
      requests.filter((url) => /\/vendor\/three\/|Script_(Vfx|Particle|EditorMediaEntry)|Data_DevTools/.test(url) || AUDIO_FORBIDDEN.test(url)).slice(0, 4).join(", "));
    Check("音效窗口：没有浏览器错误", errors.length === 0, errors.slice(0, 3).join(" | "));
    await page.close();
  }

  const windows = [
    ["场景编辑器", "SceneEditor.html?scene=FirstLevelWhitebox", () => window.SceneEditor && document.getElementById("seCanvas")],
    ["遭遇设计", "Tool_LevelFlow.html?t=384", () => window.LevelFlow && document.getElementById("flowMap")],
    ["Mixamo 动作预览", "Tool_MixamoAnimationPreview.html?who=oldGeng", () => window.__preview?.action && document.getElementById("who")?.value === "oldGeng"],
    ["动作衔接对比", "Tool_MotionCompare.html", () => window.MotionCompare?.ready && window.MotionCompare.state().aimOffsetLoaded],
    ["贴图管理", "TextureManager.html", () => document.querySelectorAll(".asset").length > 250 && document.querySelector("canvas")],
  ];
  for (const [label, rel, ready] of windows) {
    if (only && !only.has("pages")) continue;
    const { page, errors } = await OpenPage(`${base}${rel}`);
    await page.waitForFunction(ready, null, { timeout: 120000 });
    await page.waitForTimeout(1500);
    Check(`${label}：新地址能开、没有报错`, errors.length === 0, errors.slice(0, 3).join(" | "));
    if (label === "遭遇设计") {
      Check("遭遇设计会话接口已连接", await page.locator("#codexConnection").textContent() === "本机" && await page.locator("#codexProvider").inputValue() === "codex");
    }
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
  await fs.rm(chatStorage, { recursive: true, force: true });
}

console.log(failed ? `${failed} 项未过` : "高级工具拆分（浏览器）：全部通过");
process.exitCode = failed ? 1 : 0;
