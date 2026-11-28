// 游戏内高级工具首页（?editor=tools&menu=0，Data_ToolsHome / Script_EditorHome）的浏览器回归：
//   1. 不建任何关卡：PHASES 只有 ToolsHome 那一片，工具首页显示、空 Inspector 不显示；
//   2. 摄影棚类工具在首页上直接开，Esc 回首页，枪械检查台打开独立窗口；
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
  for (const [name, width, height] of [["Desktop", 1280, 720], ["Mobile", 390, 844]]) {
    const page = await browser.newPage({ viewport: { width, height } }), errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 300)); });
    await page.goto(`${base}?editor=tools&menu=0&audio=0`, { waitUntil: "domcontentloaded", timeout: 180000 });
    await page.waitForFunction(() => window.Tengxian?.state?.ready && window.Tengxian?.editor?.panelOpen, null, { timeout: 300000 });
    const state = await page.evaluate(() => ({
      phases: window.Tengxian.editor.host.game.PHASES.map((p) => p.id),
      home: !document.querySelector("#edRoot .edHome").hidden,
      empty: !document.querySelector("#edRoot .edInspectorEmpty").hidden,
      cards: document.querySelectorAll("#edRoot .edHomeTool").length,
      hasAudio: !!document.querySelector('#edRoot .edHomeTool[data-home-tool="audio"]'),
      hasActor: !!document.querySelector('#edRoot .edHomeTool[data-home-tool="actor"]'),
      hasFacial: !!document.querySelector('#edRoot .edHomeTool[data-home-tool="facial"]'),
    }));
    assert.deepEqual(state.phases, ["ToolsHome"], "工具首页不建任何关卡");
    assert.ok(state.home && !state.empty && state.cards === 13 && !state.hasAudio && !state.hasActor && !state.hasFacial, JSON.stringify(state));
    const fits = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
    assert.ok(fits, "首页无横向滚动");
    await page.screenshot({ path: path.join(out, `Home${name}.png`) });

    if (name === "Desktop") {
      // 人物动作 / 人物面部已移至控制中心独立工具宿主，游戏内不再注册
      const removed = await page.evaluate(() => ({
        actor: window.Tengxian.editor.Open("actor"),
        facial: window.Tengxian.editor.Open("facial"),
        active: window.Tengxian.editor.ActiveId,
      }));
      assert.deepEqual(removed, { actor: null, facial: null, active: null }, "游戏宿主已彻底移出 actor 与 facial");

      const fpReady = page.waitForEvent("popup");
      await page.click('#edRoot .edHomeTool[data-home-tool="firstPerson"]');
      const fp = await fpReady;
      await fp.waitForURL(`${base}AdvancedTools/Tool_FirstPersonInspection.html`);
      assert.equal(await page.evaluate(() => window.Tengxian.editor.ActiveId), null, "游戏宿主未打开旧第一人称工作窗");
      await fp.close();

      const weaponReady = page.waitForEvent("popup");
      await page.click('#edRoot .edHomeTool[data-home-tool="weapon"]');
      const weapon = await weaponReady;
      await weapon.waitForURL(`${base}AdvancedTools/Tool_WeaponInspection.html`);
      assert.equal(await page.evaluate(() => window.Tengxian.editor.ActiveId), null, "游戏宿主未打开枪械工作窗");
      await weapon.close();

      // PCG 卡片打开独立验证宿主。
      const popupReady = page.waitForEvent("popup");
      await page.click('#edRoot .edHomeTool[data-home-tool="splines"]');
      const popup = await popupReady;
      assert.ok(/AdvancedTools\/Tool_Pcg\.html\?tool=splines/.test(popup.url()), popup.url());
      await popup.close();

      const environmentReady = page.waitForEvent("popup");
      await page.getByRole("button", { name: "Debug工具", exact: true }).click();
      await page.click('[data-debug-tool="environment"]');
      const environment = await environmentReady;
      await environment.waitForFunction(() => window.EnvironmentWindow?.ready, null, { timeout: 30000 });
      assert.ok(/EnvironmentEditor\.html/.test(environment.url()));
      await environment.close();
      await page.waitForFunction(() => !window.Tengxian.editor.DebugToolStates().find((entry) => entry.id === "environment").on);

      // 首页 Esc 回标题菜单。
      await page.keyboard.press("Escape");
      await page.waitForURL((url) => !url.searchParams.has("editor"), { timeout: 30000 });

    }
    assert.deepEqual(errors, [], `${name} 无浏览器错误`);
    await page.close();
    console.log(`[PASS] ${name}`);
  }
} finally { await browser.close(); server.close(); }
