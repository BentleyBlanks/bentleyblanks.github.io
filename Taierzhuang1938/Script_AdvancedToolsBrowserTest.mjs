// 高级工具拆分（AdvancedTools/）真浏览器门禁。
//
// 查：
//   1. 控制中心 ControlCenter.html：18 张卡片、六组、各卡片链接对（独立窗口开各自页面、摄影棚开 Tool_Studio.html?tool=、游戏内的标「游戏内」）、
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
    errors.push(`CONSOLE ${message.text().slice(0, 200)} @ ${location}`);
  });
  await page.goto(url, { waitUntil, timeout: 120000 });
  return { page, errors };
}

try {
  // --- 1. 控制中心 -----------------------------------------------------------------
  if (!only || only.has("center")) {
    const { page, errors } = await OpenPage(`${base}ControlCenter.html`);
    await page.waitForSelector("[data-home-tool]", { timeout: 60000 });
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
    Check("18 张卡片，含模型制作工作台，小队行进入口已删除", info.cards.length === 18
      && info.cards.some((entry) => entry.id === "modelWorkbench" && entry.href.includes("Tool_ModelWorkbench.html"))
      && !info.cards.some((entry) => entry.id === "squadMarch"), String(info.cards.length));
    const card = (id) => info.cards.find((entry) => entry.id === id);
    Check("游戏工具文案取 TOOL_INFO 的 label / hint", info.cards.filter((entry) => entry.id !== "modelWorkbench")
      .every((entry) => entry.name === TOOL_INFO[entry.id].label && entry.hint === TOOL_INFO[entry.id].hint));
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
      Check("菜单栏只列摄影棚工具、有「返回控制中心」", [...probe.entries].sort().join(",") === [...STUDIO_TOOL_IDS].sort().join(",") && probe.back === "返回控制中心", probe.entries.join(","));
      // 页内切换：一次只开一个
      await page.evaluate(() => window.ToolStudio.Open("vfx"));
      await page.waitForTimeout(800);
      const switched = await page.evaluate(() => ({ active: window.ToolStudio.activeId, work: document.querySelectorAll(".edPanel.work").length,
        on: [...document.querySelectorAll(".edMenuItem.on")].map((item) => item.dataset.editor) }));
      Check("页内切换工具：一次只开一个", switched.active === "vfx" && switched.on.join() === "vfx" && switched.work === 1, JSON.stringify(switched));
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
      noWrites: !document.querySelector("form, input:not([type=search]), [contenteditable]"),
    }));
    Check("控制中心启动有独立窗口名的只读枪械检查台",
      page.url() === `${base}Tool_WeaponInspection.html` && independent.name === TOOL_INFO.weapon.window.name
      && independent.opener?.endsWith("/ControlCenter.html") && independent.standalone && independent.noWrites
      && independent.models === Object.keys(WEAPONS).length, JSON.stringify(independent));
    const ReadPixels = () => page.evaluate(() => {
      const stage = window.WeaponInspection.scene;
      stage.Draw();
      const copy = document.createElement("canvas");
      copy.width = stage.canvas.width;
      copy.height = stage.canvas.height;
      const ctx = copy.getContext("2d");
      ctx.drawImage(stage.canvas, 0, 0);
      const data = ctx.getImageData(0, 0, copy.width, copy.height).data;
      let minX = copy.width, maxX = 0, count = 0, min = 255, max = 0, chromatic = 0, hash = 0;
      for (let i = 3; i < data.length; i += 4) {
        if (data[i] < 245) continue;
        const x = ((i - 3) / 4) % copy.width;
        const r = data[i - 3], g = data[i - 2], b = data[i - 1];
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        min = Math.min(min, r);
        max = Math.max(max, r);
        if (r !== g || g !== b) chromatic += 1;
        hash = Math.imul(hash ^ ((r << 16) | (g << 8) | b), 16777619);
        count += 1;
      }
      return { count, left: minX / copy.width, right: maxX / copy.width, min, max, chromatic, hash,
        triangles: stage.model.triangles, quiet: stage.model.blade?.visible === false };
    });
    const pixels = await ReadPixels();
    Check("中正式真实模型在视口内居中且占主要宽度",
      pixels.count > 2500 && pixels.left > .03 && pixels.right < .97 && pixels.right - pixels.left > .60
      && pixels.triangles === 6703 && pixels.quiet, JSON.stringify(pixels));
    if (shots) await page.screenshot({ path: path.join(shotDir, "WeaponInspection.png") });

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
      channelSelection && views.every((view) => view.count > 2500 && view.count === rendered.beauty.count)
      && new Set(views.map((view) => view.hash)).size === channels.length
      && (await CameraState()).join() === beforeChannels.join());
    Check("法线、切线、底色和反射保留色彩，粗糙度、金属度和阴影有真实灰阶",
      [rendered.normal, rendered.tangent, rendered.albedo, rendered.reflection].every((view) => view.chromatic > 1000)
      && [rendered.roughness, rendered.metallic, rendered.shadow].every((view) => view.chromatic === 0 && view.max - view.min > 10)
      && rendered.shadow.min < 128 && rendered.shadow.max === 255);
    await Channel("beauty");
    Check("切回完整材质恢复同一画面", (await ReadPixels()).hash === rendered.beauty.hash);
    await Channel("ao");
    await Inspect("ZhongZheng");
    const packedAo = await ReadPixels();
    Check("换模型保留通道，AO 分别读取打包贴图与无遮蔽默认值",
      await activeChannel.getAttribute("data-channel") === "ao" && packedAo.chromatic === 0 && packedAo.max < 255
      && packedAo.count > 2500 && rendered.ao.min === 255);
    await Channel("beauty");
    await page.locator("#gridToggle").click();

    const canvas = page.locator("#view");
    const rect = await canvas.boundingBox();
    const [beforeYaw, beforePitch] = await CameraState();
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
    Check("Home 适配复位倍率和中心", resetZoom === 1 && resetCenter.every((value, index) => Math.abs(value - beforePan[index]) < .001));
    await page.locator("#gridToggle").click();
    await page.locator("#mountToggle").click();
    await page.waitForFunction(() => !document.querySelector("#muzzleLabel").hidden && !document.querySelector("#gripLabel").hidden);
    await page.locator("#bayonetToggle").click();
    Check("网格、挂点、刺刀只切换预览状态", await page.evaluate(() => {
      const stage = window.WeaponInspection.scene;
      return !stage.grid.visible && stage.model.blade.visible && !document.querySelector("#muzzleLabel").hidden;
    }));

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
          pitch: model.pose.rotation.x, span: model.size.toArray(), turret: !!model.nodes?.get("turret"), triangles: model.triangles,
          file: model.file,
        };
      }
      return details;
    }, Object.keys(WEAPONS));
    Check("所有模型条目都能绘制", Object.values(assets).every((model) => model?.triangles > 0),
      Object.entries(assets).filter(([, model]) => !model?.triangles).map(([id]) => id).join(","));
    const { Type92Hmg, MediumMortar, OfficerSwordSet, Type89Tank, HanYang, Type38 } = assets;
    Check("架设武器按各自姿态落地，军刀横放，车辆保留炮塔，GLB 使用原模型",
      [Type92Hmg, MediumMortar, Type89Tank].every((model) => Math.abs(model?.minY) < .005)
      && Math.abs(Type92Hmg.pitch) < .001 && MediumMortar.pitch > 1 && MediumMortar.pitch < 1.15
      && MediumMortar.span[1] > MediumMortar.span[0] * .9 && OfficerSwordSet?.span[0] > OfficerSwordSet?.span[1] * 5
      && Type89Tank.turret && /173R.*\.glb$/.test(HanYang?.file) && /511.*\.glb$/.test(Type38?.file));
    await page.setViewportSize({ width: 390, height: 844 });
    await Inspect("ZhongZheng");
    if (shots) await page.screenshot({ path: path.join(shotDir, "WeaponInspectionMobile.png") });
    Check("窄窗口视口和控制可达、没有横向溢出", await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth
      && document.querySelector("#view").clientWidth > 280 && document.querySelector("#view").clientHeight > 220));
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
    Check("第一人称独立窗口没有浏览器错误", errors.length === 0, errors.slice(0, 3).join(" | "));
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
      Check("遭遇设计会话接口已连接", await page.locator("#codexConnection").textContent() === "本机 Codex CLI");
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
