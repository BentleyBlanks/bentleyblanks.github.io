// 构件库预览（AdvancedTools/Tool_PropLibrary.html）真浏览器门禁。
//
// 查：
//   1. 控制中心「构件库预览」卡片开出独立页面；游戏的高级工具菜单与工具宿主里没有它（Tool_Studio.html?tool=props 转到新页）；
//   2. 目录：tzm + 外部 GLB（特效、2026-11-25 清掉的程序化构件 / 建筑饰件 tzm / 无人用的 GLB 都不在），外部 GLB 按物体品类并入同一套类别，
//      筛选 / 搜索 / 键盘换项；
//   3. 读数：tzm 战车与外部 GLB 真建出来、尺寸与面数显示、来源正确；
//   4. 八九式中战车的可动件演示能开；全程没有 pageerror / console.error，画布不是一片纯色。
// 截图只写 _shots/PropLibrary/（本地，不提交）。
//
// 用法：node Taierzhuang1938/Script_PropLibraryBrowserTest.mjs

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const shotDir = path.join(projectDir, "_shots", "PropLibrary");
fs.mkdirSync(shotDir, { recursive: true });
let failed = 0;
function Check(name, ok, detail = "") {
  if (!ok) failed += 1;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? "  — " + detail : ""}`);
}

const server = await ServeRoot(path.resolve(projectDir, ".."), 0);
const base = `http://127.0.0.1:${server.address().port}/Taierzhuang1938/AdvancedTools/`;
const browser = await LaunchBrowser();
const errors = [];
function Watch(page) {
  page.on("pageerror", (error) => errors.push(`pageerror ${error.message}`));
  page.on("console", (message) => {
    // 静态测试服没有 /__preview/ping，控制中心的后端新鲜度检查会 404（页面设计如此，忽略）。
    if (message.type() === "error" && !/fonts\.(googleapis|gstatic)|\/__preview\/ping/.test(message.location()?.url || "")) errors.push(`${message.text().slice(0, 160)} @ ${message.location()?.url || ""}`);
  });
}

try {
  // --- 1. 入口 ---------------------------------------------------------------------------
  const center = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  Watch(center);
  await center.goto(`${base}ControlCenter.html`);
  await center.waitForSelector('[data-home-tool="props"]', { timeout: 60000 });
  const card = await center.evaluate(() => {
    const link = document.querySelector('[data-home-tool="props"]');
    const group = link.closest(".edHomeGroup");
    return { href: link.href, kind: link.dataset.kind, tag: link.querySelector(".edHomeTag")?.textContent,
      group: group?.dataset.group, first: group?.querySelector("[data-home-tool]") === link };
  });
  Check("控制中心「构件库预览」是资产组第一张新标签页卡片", card.kind === "window" && card.tag === "↗ 新标签页"
    && card.group === "assets" && card.first && card.href === `${base}Tool_PropLibrary.html`, JSON.stringify(card));
  const [page] = await Promise.all([center.waitForEvent("popup"), center.click('[data-home-tool="props"]')]);
  Watch(page);
  await page.setViewportSize({ width: 1600, height: 1000 });
  const Ready = () => page.waitForFunction(() => window.PropLibrary?.ready
    && document.getElementById("view").dataset.state === "ready", null, { timeout: 180000 });
  await Ready();
  Check("点卡片开出独立页面并载入默认构件", new URL(page.url()).pathname.endsWith("/AdvancedTools/Tool_PropLibrary.html"), page.url());

  const studio = await browser.newPage();
  await studio.goto(`${base}Tool_Studio.html?tool=props`);
  await studio.waitForURL(/Tool_PropLibrary\.html/, { timeout: 30000 });
  Check("旧地址 Tool_Studio.html?tool=props 转到独立页面", /\/AdvancedTools\/Tool_PropLibrary\.html/.test(studio.url()), studio.url());
  await studio.close();
  const { TOOL_INFO, TOOL_MENUS } = await import("./Data_DevTools.mjs");
  Check("游戏的高级工具清单里没有构件库预览", !TOOL_INFO.props && !TOOL_MENUS.some((menu) => menu.items.includes("props")));

  // --- 2. 目录 ---------------------------------------------------------------------------
  const catalog = await page.evaluate(() => {
    const { entries, categories } = window.PropLibrary;
    return {
      total: entries.length, categories,
      sources: Object.fromEntries(["glb", "tzm", "proc"].map((id) => [id, entries.filter((entry) => entry.source === id).length])),
      retired: ["Tree", "Compound", "Hq", "Model_Dougong", "Model_WindowLattice", "External_tengxianShopFacade", "External_battlefieldRock", "External_wardDressingBundle"]
        .filter((id) => entries.some((entry) => entry.id === id)),
      effects: entries.filter((entry) => entry.effect).length,
      rows: document.querySelectorAll("[data-prop]").length,
      external: Object.fromEntries(["External_cart", "External_house", "External_battlefieldBarbedWire01", "External_deadTreeTrunk01", "External_wardMedicineCabinet"]
        .map((id) => [id, entries.find((entry) => entry.id === id)?.cat])),
      listHeight: document.getElementById("propList").getBoundingClientRect().height,
    };
  });
  Check("目录只收 tzm 与外部 GLB，特效与已清理条目不在", catalog.effects === 0 && catalog.sources.glb > 100 && catalog.sources.tzm > 10
    && catalog.sources.proc === 0 && catalog.retired.length === 0 && catalog.rows === catalog.total, JSON.stringify({ ...catalog.sources, retired: catalog.retired }));
  Check("外部 GLB 按物体品类并入同一套类别，接收院陈设也能在列表里找到",
    !catalog.categories.includes("外部道具") && catalog.external.External_cart === "院落小件" && catalog.external.External_house === "建筑"
      && catalog.external.External_battlefieldBarbedWire01 === "工事" && catalog.external.External_deadTreeTrunk01 === "景观"
      && catalog.categories.includes(catalog.external.External_wardMedicineCabinet), JSON.stringify(catalog.external));
  Check("列表占满左栏（1600×1000 下高于 500 px）", catalog.listHeight > 500, `${Math.round(catalog.listHeight)} px`);

  await page.fill("#propSearch", "手推车");
  const searched = await page.evaluate(() => window.PropLibrary.visible);
  Check("搜索按名称筛选", searched.length > 0 && searched.includes("External_cart"), searched.join(","));
  await page.fill("#propSearch", "");
  await page.locator("#sourceFilter .filter-chip").filter({ hasText: "TZM" }).click();
  const tzmOnly = await page.evaluate(() => window.PropLibrary.visible.every((id) => window.PropLibrary.entries.find((entry) => entry.id === id).source === "tzm"));
  Check("来源筛选只留 TZM", tzmOnly);
  await page.locator("#sourceFilter .filter-chip").filter({ hasText: "全部" }).click();
  await page.evaluate(() => window.PropLibrary.Select(window.PropLibrary.visible[0]));
  await Ready();
  await page.focus("#propList");
  await page.keyboard.press("ArrowDown");
  await Ready();
  const stepped = await page.evaluate(() => ({ selected: window.PropLibrary.selected, second: window.PropLibrary.visible[1],
    index: document.getElementById("stepIndex").textContent, url: location.search }));
  Check("列表里 ↓ 换到下一项，地址栏记住选择", stepped.selected === stepped.second && stepped.index.startsWith("2 / ")
    && stepped.url.includes(`id=${stepped.second}`), JSON.stringify(stepped));

  // --- 3. 读数 ---------------------------------------------------------------------------
  const Inspect = async (id) => {
    await page.evaluate((key) => window.PropLibrary.Select(key), id);
    await Ready();
    await page.evaluate(() => window.PropLibrary.stage.Settle());
    return page.evaluate(() => {
      const stage = window.PropLibrary.stage, model = stage.model;
      const base = [], normal = [], sides = [];
      model.root.traverse((node) => {
        for (const material of [node.material].flat()) {
          if (!material) continue;
          const baseSrc = material.map?.image?.currentSrc || material.map?.image?.src;
          const normalSrc = material.normalMap?.image?.currentSrc || material.normalMap?.image?.src;
          if (baseSrc) base.push(baseSrc);
          if (normalSrc) normal.push(normalSrc);
          sides.push(material.side);
        }
      });
      return {
        id: model.entry.id, meshes: model.meshes, triangles: model.triangles,
        size: model.size.toArray(), base, normal, sides, file: model.entry.file,
        shown: ["sizeX", "sizeY", "sizeZ", "propTriangles", "propMeshes"].map((key) => document.getElementById(key).textContent),
        glError: stage.renderer.getContext().getError(),
      };
    });
  };
  const tank = await Inspect("Model_Type97ChiHa");
  Check("tzm 战车真建出来并显示尺寸与面数", tank.meshes > 0 && tank.triangles > 0 && tank.size.every((value) => value > 0.5)
    && tank.shown.every((text) => text !== "—") && tank.file.includes("Model_Type97ChiHa.tzm.json"), JSON.stringify({ ...tank, base: undefined, normal: undefined, sides: undefined }));
  const cart = await Inspect("External_cart");
  Check("外部 GLB 载入并给出来源文件", cart.meshes > 0 && cart.file.includes("Model_Handcart.glb") && cart.glError === 0, cart.file);
  const pixels = await page.locator("#view").screenshot();
  const { default: sharp } = await import("sharp");
  const stats = await sharp(pixels).stats();
  Check("画布不是一片纯色", stats.channels.some((channel) => channel.stdev > 8), stats.channels.map((channel) => channel.stdev.toFixed(1)).join("/"));
  await page.screenshot({ path: path.join(shotDir, "PropLibrary_Cart.png") });

  // --- 4. 战车演示 ------------------------------------------------------------------------
  await page.evaluate(() => window.PropLibrary.Select("External_type89MediumTank"));
  await Ready();
  await page.waitForFunction(() => window.PropLibrary.vehicle?.mode === "all", null, { timeout: 60000 });
  await page.waitForTimeout(600);
  const demo = await page.evaluate(() => ({ time: window.PropLibrary.vehicle.time, visible: !document.getElementById("vehicleSection").hidden }));
  Check("八九式中战车可动件演示在跑", demo.visible && demo.time > 0.1, JSON.stringify(demo));
  await page.locator('[data-demo="stopped"]').click();
  await page.screenshot({ path: path.join(shotDir, "PropLibrary_Type89.png") });

  Check("全程没有 pageerror / console.error", errors.length === 0, errors.slice(0, 4).join(" | "));
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
console.log(failed ? `FAIL PropLibraryBrowserTest: ${failed} 项` : "PASS PropLibraryBrowserTest");
process.exit(failed ? 1 : 0);
