// 开发工具隔离闸门：保证「打包时剔除高级工具 / Debug工具」只需要换两个边界模块。
//
// 守三件事：
//   1. 边界模块与剔除版导出同一组名字（换进去不会缺符号）；
//   2. 剔除构建（Script_BuildBrowserBundle --strip-dev-tools）的游戏包与菜单包里
//      一个开发工具模块都没有 —— 有人绕过 Script_DevTools 直接 import 编辑器时，这里报出是谁拉进来的；
//      标题菜单包无论剔不剔都不许带编辑器；
//   3. --browser：真浏览器里跑剔除后的包，开机、设置三页照常可用，菜单里没有「Debug工具」「高级工具」。
//
// 用法：node Taierzhuang1938/Script_DevToolsIsolationTest.mjs [--browser]
// 口径见 docs/Data_EditorSuite.md「开发工具隔离与打包剔除」。

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BuildBrowserBundle, DEV_TOOL_STUBS } from "./Script_BuildBrowserBundle.mjs";

const projectDir = path.dirname(fileURLToPath(import.meta.url));

// 名字带 Editor 但随玩家设置一起发布的三个模块（设置页的类、控件工具箱、白盒画质那一栏）。
// 名字是历史遗留；它们只许 import 彼此与普通运行时模块，不许碰下面的开发模块。
const SHIPPED_EDITOR_MODULES = new Set(["Script_EditorSettings.mjs", "Script_EditorUi.mjs", "Script_EditorWhiteboxQuality.mjs"]);
const IsDevModule = (file) => {
  const name = path.basename(file);
  if (SHIPPED_EDITOR_MODULES.has(name)) return false;
  return /^Script_Editor/.test(name) || name === "Script_DevTools.mjs" || name === "Data_DevTools.mjs";
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
for (const [real, stub] of Object.entries(DEV_TOOL_STUBS)) {
  const a = await ExportNames(real), b = await ExportNames(stub);
  Check(`${stub} 与 ${real} 导出同一组名字`, a.length > 0 && JSON.stringify(a) === JSON.stringify(b), `${a.join(",")} / ${b.join(",")}`);
}
{
  const stub = await import("./Data_DevToolsStub.mjs"), real = await import("./Data_DevTools.mjs");
  Check("剔除版声明没有开发工具", stub.DEV_TOOLS_ENABLED === false && stub.DEBUG_TOOL_IDS.length === 0);
  Check("开发版登记了 Debug工具七项", real.DEV_TOOLS_ENABLED === true && real.DEBUG_TOOL_IDS.length === 7, real.DEBUG_TOOL_IDS.join(","));
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
Check("完整包含高级工具（剔除前提成立）", full.gameInputs.includes("Script_Editor.mjs"));
Check("完整包含设置宿主", full.gameInputs.includes("Script_SettingsHost.mjs"));
Check("标题菜单包从不带开发模块", DevInputs(full.menuInputs).filter((file) => file !== "Data_DevTools.mjs").length === 0,
  DevInputs(full.menuInputs).join(", "));
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
      const opened = await page.evaluate(() => ({ visible: !document.getElementById("settingsRoot")?.classList.contains("off"),
        title: document.querySelector("#settingsRoot .edTitle")?.textContent }));
      Check(`${fixture.name}：画面设置能打开`, opened.visible && !!opened.title, JSON.stringify(opened));
      await page.keyboard.press("Escape");
      Check(`${fixture.name}：Esc 关设置回到设置目录`, await page.evaluate(() => window.Tengxian.Debug.Menu().mode === "settings"
        && document.getElementById("settingsRoot").classList.contains("off")));
      await page.keyboard.press("Backquote");
      Check(`${fixture.name}：\` 不再打开任何工具`, await page.evaluate(() => !document.getElementById("edRoot") && !/editor=tools/.test(location.search)));
      Check(`${fixture.name}：没有页面错误`, errors.length === 0, errors.slice(0, 3).join(" | "));
      await page.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
}

console.log(failed ? `${failed} 项未过` : "开发工具隔离：全部通过");
process.exit(failed ? 1 : 0);
