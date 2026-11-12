// 开发工具隔离闸门：保证「打包时剔除高级工具 / Debug工具」只需要换两个边界模块。
//
// 守三件事：
//   1. 边界模块与剔除版导出同一组名字（换进去不会缺符号）；
//   2. 剔除构建（Script_BuildBrowserBundle --strip-dev-tools）的游戏包与菜单包里
//      一个开发工具模块都没有 —— 有人绕过 Script_DevTools 直接 import 编辑器时，这里报出是谁拉进来的；
//      标题菜单包无论剔不剔都不许带编辑器；
//   3. --browser：真浏览器里跑剔除后的包，开机、设置三页照常可用，菜单里没有「Debug工具」「高级工具」；
//   4. 已拆进 AdvancedTools/ 的 13 个工具（docs/Data_EditorSuite.md「AdvancedTool ControlCenter 与独立工具宿主」）：
//      拆分边界两对（Script_DevToolsSplit / Data_DevToolsSplit）与各自的剔除版导出同一组名字；
//      游戏目录里的非测试代码除 Script_DevToolsSplit 外不许 import ./AdvancedTools/（方向只许 AdvancedTools → 游戏）；
//      线上发布构建（--deploy）始终把这一对换成剔除版，发布副本不含 AdvancedTools/、index.html 的 import map 不残留它的条目，
//      --browser 里跑这一档：菜单（标题菜单设置 → 高级工具 与游戏内高级工具菜单栏）里这 13 项消失、留在游戏里的工具照旧。
//
// 用法：node Taierzhuang1938/Script_DevToolsIsolationTest.mjs [--browser]
// 口径见 docs/Data_EditorSuite.md「开发工具隔离与打包剔除」。

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BuildBrowserBundle, DEV_TOOL_STUBS, SPLIT_TOOL_STUBS } from "./Script_BuildBrowserBundle.mjs";
import { Prune, StripAdvancedToolsImports, PUBLISH_EXCLUDE } from "../scripts/Script_PublishPrune.mjs";
import { IsPublishedSource } from "../scripts/Script_PublishScope.mjs";
import { TOOL_INFO } from "./Data_DevTools.mjs";

const projectDir = path.dirname(fileURLToPath(import.meta.url));

// 名字带 Editor 但随玩家设置一起发布的两个模块（设置页的类、控件工具箱）。
// 名字是历史遗留；它们只许 import 彼此与普通运行时模块，不许碰下面的开发模块。
const SHIPPED_EDITOR_MODULES = new Set(["Script_EditorSettings.mjs", "Script_EditorUi.mjs"]);
const DEV_BOUNDARY = new Set(["Script_DevTools.mjs", "Data_DevTools.mjs", "Script_DevToolsSplit.mjs", "Data_DevToolsSplit.mjs"]);
const SPLIT_IDS = Object.keys(TOOL_INFO).filter((id) => TOOL_INFO[id].split);
const IsDevModule = (file) => {
  const name = path.basename(file);
  if (SHIPPED_EDITOR_MODULES.has(name)) return false;
  return /^Script_Editor/.test(name) || DEV_BOUNDARY.has(name);
};

let failed = 0;
function Check(name, ok, detail = "") {
  if (!ok) failed += 1;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? "  — " + detail : ""}`);
}

// --- 1. 导出对账 --------------------------------------------------------------
async function ExportNames(file) {
  const text = await fs.readFile(path.join(projectDir, file), "utf8");
  const names = new Set();
  for (const match of text.matchAll(/^export\s+(?:async\s+)?(?:const|let|function|class)\s+([A-Za-z_$][\w$]*)/gm)) names.add(match[1]);
  for (const match of text.matchAll(/^export\s*\{([^}]*)\}/gm)) {
    for (const part of match[1].split(",")) {
      const name = part.trim().split(/\s+as\s+/).pop();
      if (name) names.add(name);
    }
  }
  if (/^export\s+default\b/m.test(text)) names.add("default");
  return [...names].sort();
}
for (const [real, stub] of Object.entries({ ...DEV_TOOL_STUBS, ...SPLIT_TOOL_STUBS })) {
  const a = await ExportNames(real), b = await ExportNames(stub);
  Check(`${stub} 与 ${real} 导出同一组名字`, a.length > 0 && JSON.stringify(a) === JSON.stringify(b), `${a.join(",")} / ${b.join(",")}`);
}
{
  const stub = await import("./Data_DevToolsStub.mjs"), real = await import("./Data_DevTools.mjs");
  Check("剔除版声明没有开发工具", stub.DEV_TOOLS_ENABLED === false && stub.DEBUG_TOOL_IDS.length === 0);
  Check("开发版登记了 Debug工具七项", real.DEV_TOOLS_ENABLED === true && real.DEBUG_TOOL_IDS.length === 7, real.DEBUG_TOOL_IDS.join(","));
}
{
  const stub = await import("./Data_DevToolsSplitStub.mjs"), real = await import("./Data_DevToolsSplit.mjs");
  Check("拆分边界：剔除版声明拆出去的工具不在，开发版在", stub.SPLIT_TOOLS_AVAILABLE === false && real.SPLIT_TOOLS_AVAILABLE === true);
  const stubClasses = await import("./Script_DevToolsSplitStub.mjs"), realClasses = await import("./Script_DevToolsSplit.mjs");
  Check("拆分边界：剔除版是空数组", Array.isArray(stubClasses.SPLIT_TOOL_CLASSES) && stubClasses.SPLIT_TOOL_CLASSES.length === 0);
  Check("拆分边界：开发版 13 个类与 TOOL_INFO 里 split 的条目一一对应",
    JSON.stringify(realClasses.SPLIT_TOOL_CLASSES.map((Editor) => Editor.id).sort()) === JSON.stringify([...SPLIT_IDS].sort()), SPLIT_IDS.join(","));
}

// --- 1b. 方向规则：游戏不 import AdvancedTools/（唯一例外 Script_DevToolsSplit） ------------------
{
  const offenders = [];
  const SKIP_DIRS = new Set(["AdvancedTools", "node_modules", "_shots", "_import", "_blender", "vendor"]);
  async function Walk(dir) {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { if (!SKIP_DIRS.has(entry.name)) await Walk(full); continue; }
      if (!/\.(mjs|js)$/.test(entry.name) || /Test\.(mjs|js)$/.test(entry.name)) continue;
      if (entry.name === "Script_DevToolsSplit.mjs") continue;
      const text = await fs.readFile(full, "utf8");
      if (/(?:from|import\s*\()\s*["'][^"']*AdvancedTools\//.test(text)) offenders.push(path.relative(projectDir, full));
    }
  }
  await Walk(projectDir);
  Check("游戏目录的非测试代码除 Script_DevToolsSplit 外不 import AdvancedTools/", offenders.length === 0, offenders.join(", "));
  const split = await fs.readFile(path.join(projectDir, "Script_DevToolsSplit.mjs"), "utf8");
  Check("Script_DevToolsSplit 只 import ./AdvancedTools/ 里的工具类", [...split.matchAll(/^import .* from "([^"]+)";/gm)].every((match) => match[1].startsWith("./AdvancedTools/")));
}

// --- 2. 构建对账 --------------------------------------------------------------
function DevInputs(inputs) { return inputs.filter(IsDevModule); }
/** 从 metafile 找出是谁 import 了某个开发模块（报错时给人看的）。 */
function Importers(metafile, target) {
  return Object.entries(metafile.inputs)
    .filter(([, input]) => input.imports.some((entry) => path.basename(entry.path) === path.basename(target)))
    .map(([file]) => file);
}

const full = await BuildBrowserBundle(projectDir);
const stripped = await BuildBrowserBundle(projectDir, { stripDevTools: true });
const deploy = await BuildBrowserBundle(projectDir, { stripSplitTools: true });
Check("完整包含高级工具（剔除前提成立）", full.gameInputs.includes("Script_Editor.mjs"));
Check("完整包含设置宿主", full.gameInputs.includes("Script_SettingsHost.mjs"));
Check("标题菜单包从不带开发模块", DevInputs(full.menuInputs).filter((file) => !["Data_DevTools.mjs", "Data_DevToolsSplit.mjs"].includes(file)).length === 0,
  DevInputs(full.menuInputs).join(", "));
Check("完整包含拆分进 AdvancedTools/ 的工具（拆分前提成立）", full.gameInputs.includes("AdvancedTools/Script_EditorActor.mjs") && full.gameInputs.includes("Script_DevToolsSplit.mjs"));
Check("标题菜单包从不带 AdvancedTools/ 里的模块", !full.menuInputs.some((file) => file.startsWith("AdvancedTools/")));
{
  const leaked = DevInputs(stripped.gameInputs);
  let detail = leaked.join(", ");
  if (leaked.length) {
    const { build } = await import("esbuild");
    const probe = await build({ absWorkingDir: projectDir, entryPoints: ["Script_Main.mjs"], bundle: true, format: "esm",
      platform: "browser", write: false, metafile: true, external: ["three", "./vendor/*"], logLevel: "silent",
      plugins: [{ name: "strip", setup(builder) {
        builder.onResolve({ filter: /^\.\/(?:Script|Data)_DevTools\.mjs$/ }, (args) => ({ path: path.join(projectDir, DEV_TOOL_STUBS[args.path]) }));
      } }] });
    detail = leaked.map((file) => `${file} ← ${Importers(probe.metafile, file).join(" / ")}`).join("; ");
  }
  Check("剔除后的游戏包不含任何开发模块", leaked.length === 0, detail);
}
// 游戏宿主只经 Script_DevTools 进来（菜单的「有没有开发工具」看 editor 是否为 null）；标题菜单只经 Data_DevTools。
Check("剔除后游戏包换进了 Script_DevToolsStub", stripped.gameInputs.includes("Script_DevToolsStub.mjs"));
Check("剔除后菜单包换进了 Data_DevToolsStub", stripped.menuInputs.includes("Data_DevToolsStub.mjs"));
Check("剔除后的菜单包不含开发模块", DevInputs(stripped.menuInputs).length === 0, DevInputs(stripped.menuInputs).join(", "));
Check("剔除后玩家设置仍在包里", ["Script_SettingsHost.mjs", "Script_EditorSettings.mjs"].every((file) => stripped.gameInputs.includes(file)));
// 线上发布构建（--deploy）：只剔拆分边界，留在游戏里的工具照旧在包里。
Check("发布构建的游戏包换进了 Script_DevToolsSplitStub、不含 AdvancedTools/", deploy.gameInputs.includes("Script_DevToolsSplitStub.mjs")
  && !deploy.gameInputs.includes("Script_DevToolsSplit.mjs") && !deploy.gameInputs.some((file) => file.startsWith("AdvancedTools/")),
  deploy.gameInputs.filter((file) => file.startsWith("AdvancedTools/")).join(", "));
Check("发布构建的菜单包换进了 Data_DevToolsSplitStub、不含 AdvancedTools/", deploy.menuInputs.includes("Data_DevToolsSplitStub.mjs")
  && !deploy.menuInputs.includes("Data_DevToolsSplit.mjs") && !deploy.menuInputs.some((file) => file.startsWith("AdvancedTools/")));
Check("发布构建里留在游戏里的工具仍在（Script_Editor、第一人称持枪移动检查、白盒入口）",
  ["Script_Editor.mjs", "Script_EditorFirstPersonMotion.mjs", "Script_EditorBlockoutEntry.mjs"].every((file) => deploy.gameInputs.includes(file)));
Check("发布构建比完整包小", deploy.gameInputs.length < full.gameInputs.length, `${full.gameInputs.length} → ${deploy.gameInputs.length} 个模块`);
{
  // 发布副本：目录整个不在、import map 不残留指向它的条目、范围白名单也不放行
  const staging = await fs.mkdtemp(path.join(os.tmpdir(), "DevToolsSplitPublish-"));
  try {
    await fs.mkdir(path.join(staging, "Taierzhuang1938/AdvancedTools"), { recursive: true });
    await fs.writeFile(path.join(staging, "Taierzhuang1938/AdvancedTools/ControlCenter.html"), "x");
    await fs.copyFile(path.join(projectDir, "index.html"), path.join(staging, "Taierzhuang1938/index.html"));
    const MapOf = (html) => JSON.parse(/<script type="importmap">([\s\S]*?)<\/script>/.exec(html)[1]).imports;
    const before = MapOf(await fs.readFile(path.join(staging, "Taierzhuang1938/index.html"), "utf8"));
    Prune(staging);
    const after = MapOf(await fs.readFile(path.join(staging, "Taierzhuang1938/index.html"), "utf8"));
    const removed = Object.keys(before).filter((key) => key.includes("AdvancedTools/")).length;
    Check("发布副本不含 AdvancedTools/ 目录", await fs.stat(path.join(staging, "Taierzhuang1938/AdvancedTools")).then(() => false, () => true));
    Check("发布副本的 import map 不残留指向 AdvancedTools/ 的条目", removed >= 25 && !/AdvancedTools/.test(JSON.stringify(after))
      && Object.keys(after).length === Object.keys(before).length - removed, `摘掉 ${removed} 条`);
    Check("发布副本的 import map 仍登记这对边界模块（由打包换成剔除版）", "./Script_DevToolsSplit.mjs" in after && "./Data_DevToolsSplit.mjs" in after);
    Check("重复摘取是空操作", StripAdvancedToolsImports(staging) === 0);
  } finally { await fs.rm(staging, { recursive: true, force: true }); }
  Check("发布清单与范围白名单都不放行 AdvancedTools/", PUBLISH_EXCLUDE.some((entry) => entry.path === "Taierzhuang1938/AdvancedTools/")
    && !IsPublishedSource("Taierzhuang1938/AdvancedTools/ControlCenter.html") && IsPublishedSource("Taierzhuang1938/index.html"));
}
const saved = Buffer.byteLength(full.code) - Buffer.byteLength(stripped.code);
Check("剔除让游戏包明显变小", saved > 200 * 1024, `${(saved / 1024).toFixed(0)} KB（${full.gameInputs.length} → ${stripped.gameInputs.length} 个模块）`);

// --- 3. 实机：剔除后的包照常开机、设置可用 --------------------------------------
if (process.argv.includes("--browser")) {
  const { LaunchBrowser } = await import("../PrairieFire1937/Script_BrowserTestKit.mjs");
  const { ServeRoot } = await import("./Script_DevServer.mjs");
  const server = await ServeRoot(path.resolve(projectDir, ".."), 0);
  const browser = await LaunchBrowser();
  try {
    for (const fixture of [{ name: "TitleMenu", query: "" }, { name: "Game", query: "whitebox=p012" }]) {
      const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
      const errors = [];
      page.on("pageerror", (error) => errors.push(String(error)));
      await page.route("**/Taierzhuang1938/?*", (route) => route.fulfill({ contentType: "text/html", body: stripped.html }));
      for (const file of stripped.files) {
        await page.route(`**/${file.name}?*`, (route) => route.fulfill({ contentType: "text/javascript", body: file.code }));
      }
      await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/?${fixture.query}&quality=low&scale=small`,
        { waitUntil: "commit", timeout: 60000 });
      await page.waitForFunction(() => window.Tengxian?.state?.ready || document.getElementById("bootStep")?.textContent.startsWith("启动失败："),
        null, { timeout: 240000 });
      const boot = await page.evaluate(() => ({ ready: !!window.Tengxian.state?.ready, devRoot: !!document.getElementById("edRoot"),
        editor: window.Tengxian.editor ?? null }));
      Check(`${fixture.name}：剔除后开机就绪、没有开发工具层`, boot.ready && !boot.devRoot && !boot.editor, JSON.stringify(boot));
      if (fixture.name === "Game") {
        // 白盒开机停在「开始」页：开打之后 Esc 暂停，从暂停菜单进设置（玩家真实的路）。
        await page.locator("#bootStart").click();
        await page.waitForFunction(() => window.Tengxian.state.running, null, { timeout: 20000 });
        await page.evaluate(() => window.Tengxian.Debug.Pause());
      } else {
        await page.waitForFunction(() => window.Tengxian.Debug.Menu().open, null, { timeout: 60000 });
      }
      await page.evaluate(() => window.Tengxian.Debug.MenuAct("settings"));
      const entries = await page.evaluate(() => [...document.querySelectorAll("[data-setting]")].map((el) => el.dataset.setting));
      Check(`${fixture.name}：设置目录只剩玩家设置与调试选项`, entries.join(",") === "graphics,sound,controls,debug", entries.join(","));
      await page.click('[data-setting="graphics"]');
      const opened = await page.evaluate(() => ({ embedded: !!document.querySelector(".mnSettingsDetailBody .edPanel.work"),
        floating: !document.getElementById("settingsRoot")?.classList.contains("off"),
        head: document.querySelector(".mnSettingsDetailHead")?.textContent,
        title: document.querySelector(".mnSettingsDetailBody .edTitle")?.textContent }));
      Check(`${fixture.name}：画面设置在右栏里打开`, opened.embedded && !opened.floating && opened.head === "画面" && !!opened.title, JSON.stringify(opened));
      await page.keyboard.press("Escape");
      Check(`${fixture.name}：Esc 退出设置并收起嵌入的设置页`, await page.evaluate(() => window.Tengxian.Debug.Menu().mode !== "settings"
        && window.Tengxian.Debug.Editor().settings === null && document.getElementById("settingsRoot").classList.contains("off")));
      await page.keyboard.press("Backquote");
      Check(`${fixture.name}：\` 不再打开任何工具`, await page.evaluate(() => !document.getElementById("edRoot") && !/editor=tools/.test(location.search)));
      Check(`${fixture.name}：没有页面错误`, errors.length === 0, errors.slice(0, 3).join(" | "));
      await page.close();
    }
    // 线上发布构建（--deploy 那一档）：只剔拆分边界，高级工具菜单里已拆出去的 13 项消失、留在游戏里的工具照旧。
    for (const fixture of [{ name: "TitleMenu", query: "" }, { name: "Game", query: "whitebox=p012" }]) {
      const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
      const errors = [];
      page.on("pageerror", (error) => errors.push(String(error)));
      await page.route("**/Taierzhuang1938/?*", (route) => route.fulfill({ contentType: "text/html", body: deploy.html }));
      for (const file of deploy.files) {
        await page.route(`**/${file.name}?*`, (route) => route.fulfill({ contentType: "text/javascript", body: file.code }));
      }
      await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/?${fixture.query}&quality=low&scale=small`,
        { waitUntil: "commit", timeout: 60000 });
      await page.waitForFunction(() => window.Tengxian?.state?.ready || document.getElementById("bootStep")?.textContent.startsWith("启动失败："),
        null, { timeout: 240000 });
      const KEPT = ["environment", "splines", "propPcg", "blockout", "timeline", "fpMotion"];
      if (fixture.name === "Game") {
        await page.click("#bootStart");
        await page.waitForFunction(() => window.Tengxian.state.running, null, { timeout: 20000 });
        const bar = await page.evaluate(() => ({ ids: [...document.querySelectorAll("#edRoot .edMenuItem[data-editor]")].map((item) => item.dataset.editor),
          groups: [...document.querySelectorAll("#edRoot .edMenu[data-menu]")].map((menu) => menu.dataset.menu), editor: !!window.Tengxian.editor }));
        Check("发布构建：游戏内高级工具菜单栏里这 13 项消失、留在游戏里的 6 项照旧",
          bar.editor && SPLIT_IDS.every((id) => !bar.ids.includes(id)) && KEPT.every((id) => bar.ids.includes(id)), bar.ids.join(","));
        Check("发布构建：整组拆空的「特效与声音」不再列", !bar.groups.includes("media") && bar.groups.includes("scene"), bar.groups.join(","));
        const opened = await page.evaluate(() => { const result = window.Tengxian.editor.Open("actor"); return { active: window.Tengxian.editor.ActiveId, result: result === null }; });
        Check("发布构建：直接 Open 已拆出的工具 id 不抛错、也不会打开", opened.result && opened.active === null);
        await page.evaluate(() => window.Tengxian.Debug.Pause());
      } else {
        await page.waitForFunction(() => window.Tengxian.Debug.Menu().open, null, { timeout: 60000 });
      }
      await page.evaluate(() => window.Tengxian.Debug.MenuAct("settings"));
      await page.click('[data-setting="tools"]');
      const rows = await page.evaluate(() => [...document.querySelectorAll(".mnToolItem")].map((row) => row.dataset.toolId));
      Check(`发布构建 ${fixture.name}：设置 → 高级工具里这 13 项消失、留在游戏里的 6 项照旧`,
        SPLIT_IDS.every((id) => !rows.includes(id)) && ["environment", "splines", "propPcg", "blockout", "timeline", "fpMotion"].every((id) => rows.includes(id)), rows.join(","));
      Check(`发布构建 ${fixture.name}：没有页面错误`, errors.length === 0, errors.slice(0, 3).join(" | "));
      await page.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
}

console.log(failed ? `${failed} 项未过` : "开发工具隔离：全部通过");
process.exit(failed ? 1 : 0);
