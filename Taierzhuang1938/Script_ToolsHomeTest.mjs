// 高级工具首页（?editor=tools 不带关卡，Data_ToolsHome / Script_EditorHome）的浏览器回归：
//   1. 不建任何关卡：PHASES 只有 ToolsHome 那一片，工具首页显示、空 Inspector 不显示；
//   2. 摄影棚类工具（枪械）在首页上直接开，Esc 回首页；
//   3. 场景类工具弹「载入哪一关」，选一关后整页换到 ?phase=N&editor=tools&tool=<id>；
//   4. 首页上 Esc 回独立标题菜单（URL 去掉 editor）。
// 用法：node Taierzhuang1938/Script_ToolsHomeTest.mjs   截图在 _shots/ToolsHome/
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";

const root = path.resolve(import.meta.dirname, "..");
const out = path.join(import.meta.dirname, "_shots", "ToolsHome");
await fs.mkdir(out, { recursive: true });
const server = await ServeRoot(root, 0), browser = await LaunchBrowser();
const base = `http://127.0.0.1:${server.address().port}/Taierzhuang1938/`;
try {
  for (const [name, width, height] of [["Desktop", 1600, 900], ["Mobile", 390, 844]]) {
    const page = await browser.newPage({ viewport: { width, height } }), errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 300)); });
    await page.goto(`${base}?editor=tools&audio=0`, { waitUntil: "domcontentloaded", timeout: 180000 });
    await page.waitForFunction(() => window.Tengxian?.state?.ready && window.Tengxian?.editor?.panelOpen, null, { timeout: 300000 });
    const state = await page.evaluate(() => ({
      phases: window.Tengxian.editor.host.game.PHASES.map((p) => p.id),
      home: !document.querySelector("#edRoot .edHome").hidden,
      empty: !document.querySelector("#edRoot .edInspectorEmpty").hidden,
      cards: document.querySelectorAll("#edRoot .edHomeTool").length,
    }));
    assert.deepEqual(state.phases, ["ToolsHome"], "工具首页不建任何关卡");
    assert.ok(state.home && !state.empty && state.cards > 15, JSON.stringify(state));
    const fits = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
    assert.ok(fits, "首页无横向滚动");
    await page.screenshot({ path: path.join(out, `Home${name}.png`) });

    if (name === "Desktop") {
      // 摄影棚工具直接开；Esc 回首页
      await page.click('#edRoot .edHomeTool[data-home-tool="weapon"]');
      await page.waitForSelector("#edRoot .edPanel.work");
      assert.equal(await page.evaluate(() => window.Tengxian.editor.ActiveId), "weapon");
      assert.equal(await page.locator("#edRoot .edHome").isHidden(), true);
      await page.evaluate(() => window.Tengxian.StepFrames?.(5));
      await page.screenshot({ path: path.join(out, "WeaponFromHome.png") });
      await page.keyboard.press("Escape");
      assert.equal(await page.evaluate(() => window.Tengxian.editor.ActiveId), null);
      assert.equal(await page.locator("#edRoot .edHome").isVisible(), true, "Esc 先回首页");

      // 场景类工具：先选关卡（菜单栏里点也一样），Esc 只收单子
      await page.click('#edRoot .edHomeTool[data-home-tool="splines"]');
      await page.waitForSelector("#edRoot .edHomeSheet:not([hidden])");
      const choices = await page.locator("#edRoot .edHomeChoice").count();
      assert.equal(choices, 7, "场景样条PCG列出七章");
      await page.screenshot({ path: path.join(out, "LevelSheet.png") });
      await page.keyboard.press("Escape");
      assert.equal(await page.locator("#edRoot .edHomeSheet").isHidden(), true);
      assert.equal(await page.evaluate(() => window.Tengxian.editor.panelOpen), true, "Esc 收单子不退出");
      await page.click('#edRoot .edMenu[data-menu="scene"] > .edMenuTitle');
      await page.click('#edRoot [data-editor="splines"].edMenuItem');
      await page.waitForSelector("#edRoot .edHomeSheet:not([hidden])");
      // 只核对跳转地址，不真的建那一关
      await page.route("**/*tool=splines*", (route) => route.fulfill({ contentType: "text/html", body: "<title>nav fixture</title>" }));
      await page.locator("#edRoot .edHomeChoice").nth(1).click();
      await page.waitForURL((url) => url.searchParams.get("tool") === "splines");
      const target = new URL(page.url());
      assert.equal(target.searchParams.get("phase"), "1");
      assert.equal(target.searchParams.get("editor"), "tools");
      await page.unroute("**/*tool=splines*");

      // 首页 Esc = 回标题菜单
      await page.goto(`${base}?editor=tools&audio=0`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => window.Tengxian?.editor?.panelOpen, null, { timeout: 300000 });
      await page.keyboard.press("Escape");
      await page.waitForURL((url) => !url.searchParams.has("editor"), { timeout: 30000 });
    }
    assert.deepEqual(errors, [], `${name} 无浏览器错误`);
    await page.close();
    console.log(`[PASS] ${name}`);
  }
} finally { await browser.close(); server.close(); }
