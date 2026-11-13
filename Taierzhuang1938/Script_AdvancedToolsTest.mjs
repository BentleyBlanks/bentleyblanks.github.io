// 高级工具拆分（AdvancedTools/）纯 Node 门禁。
//
// 查：
//   1. 目录表 Data_AdvancedTools 与 Data_DevTools 对得上：split 的 13 项 = 独立窗口 4 + 摄影棚 9，其余 6 项留游戏里；
//   2. 搬走的页面都在 AdvancedTools/，旧位置不留跳转壳；
//   3. 四个独立窗口入口类（搬家后 import.meta.url 的基准变了）解析出的仍是 AdvancedTools/<页面>；
//   4. 控制中心卡片：19 张、六组、地址与「游戏内」标注都对；
//   5. 启动器：--dry-run 的计划、--shortcut-dir 生成的 .lnk（目标 node、参数本脚本、工作目录仓库根）、
//      没有预览服时真起一份（端口以输出为准）并能 ping 出本仓库根目录。
//
// 用法：node Taierzhuang1938/Script_AdvancedToolsTest.mjs

import fs from "node:fs";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { spawn, execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import http from "node:http";
import { once } from "node:events";
import { PreviewRuntimeRevision } from "../scripts/Script_LocalPreviewRuntime.mjs";
import { TOOL_INFO, TOOL_MENUS } from "./Data_DevTools.mjs";
import { STUDIO_TOOL_IDS, WINDOW_TOOL_IDS, GAME_TOOL_IDS, StudioToolUrl } from "./AdvancedTools/Data_AdvancedTools.mjs";
import { ControlCenterCards, CONTROL_CENTER_TITLE } from "./AdvancedTools/Script_ControlCenter.mjs";
import { REPO_ROOT, SHORTCUT_NAME, CONTROL_CENTER_PATH, ControlCenterUrl, ServesThisRepo } from "./AdvancedTools/Script_ControlCenterLaunch.mjs";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const toolsDir = path.join(projectDir, "AdvancedTools");
const launcher = path.join(toolsDir, "Script_ControlCenterLaunch.mjs");
let failed = 0;
function Check(name, ok, detail = "") {
  if (!ok) failed += 1;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? "  — " + detail : ""}`);
}
const Same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

// --- 1. 目录表 -------------------------------------------------------------------
const menuIds = TOOL_MENUS.flatMap((menu) => menu.items);
const splitIds = Object.keys(TOOL_INFO).filter((id) => TOOL_INFO[id].split);
Check("split 条目共 13 项", splitIds.length === 13, splitIds.join(","));
Check("独立窗口 + 摄影棚 = split 的全部", Same([...STUDIO_TOOL_IDS, ...WINDOW_TOOL_IDS], splitIds));
Check("独立窗口 = split 且带 window 的条目", Same(WINDOW_TOOL_IDS, splitIds.filter((id) => TOOL_INFO[id].window)));
Check("留在游戏里的 = 没有 split 的菜单条目", Same(GAME_TOOL_IDS, menuIds.filter((id) => !TOOL_INFO[id].split)));
Check("菜单 19 项且三类互不重叠", menuIds.length === 19 && new Set([...STUDIO_TOOL_IDS, ...WINDOW_TOOL_IDS, ...GAME_TOOL_IDS]).size === 19);

// --- 2. 搬家 ---------------------------------------------------------------------
const pages = ["SceneEditor.html", "Tool_LevelFlow.html", "Tool_MixamoAnimationPreview.html", "TextureManager.html", "Tool_Studio.html", "ControlCenter.html"];
Check("页面都在 AdvancedTools/", pages.every((page) => fs.existsSync(path.join(toolsDir, page))));
Check("旧位置不留跳转壳", pages.slice(0, 4).every((page) => !fs.existsSync(path.join(projectDir, page))));
Check("九个摄影棚编辑器与四个入口类都在 AdvancedTools/", ["Actor", "Facial", "SquadMarch", "Weapon", "FirstPerson", "Vfx", "Audio", "PropLibrary", "AssetStandards",
  "SceneEntry", "LevelFlow", "MixamoPreview", "Textures"].every((name) => fs.existsSync(path.join(toolsDir, `Script_Editor${name}.mjs`))
  && !fs.existsSync(path.join(projectDir, `Script_Editor${name}.mjs`))));

// --- 3. 入口类：窗口地址 ----------------------------------------------------------
{
  const opened = [];
  globalThis.window = { open: (url, name, features) => { opened.push({ url: String(url), name, features }); return { closed: false, focus() {} }; } };
  const entries = [
    ["sceneEditor", "Script_EditorSceneEntry.mjs", "SceneEditorEntry", "SceneEditor.html"],
    ["levelFlow", "Script_EditorLevelFlow.mjs", "LevelFlowEntry", "Tool_LevelFlow.html"],
    ["mixamoPreview", "Script_EditorMixamoPreview.mjs", "MixamoPreviewEditor", "Tool_MixamoAnimationPreview.html"],
    ["textures", "Script_EditorTextures.mjs", "TextureEditor", "TextureManager.html"],
  ];
  for (const [id, file, name, page] of entries) {
    const module = await import(pathToFileURL(path.join(toolsDir, file)).href);
    module[name].win = null;
    module[name].Open();
    const url = new URL(opened.at(-1).url);
    Check(`${id} 入口类打开的是 AdvancedTools/${page}`,
      url.pathname.endsWith(`/Taierzhuang1938/AdvancedTools/${page}`) && fs.existsSync(path.join(toolsDir, page)), url.pathname);
    Check(`${id} 窗口名与尺寸沿用 TOOL_INFO`, opened.at(-1).name === TOOL_INFO[id].window.name && opened.at(-1).features === TOOL_INFO[id].window.features);
  }
  delete globalThis.window;
}

// --- 4. 控制中心卡片 ----------------------------------------------------------------
{
  const page = "http://127.0.0.1:9/Taierzhuang1938/AdvancedTools/ControlCenter.html";
  const cards = ControlCenterCards(page);
  Check("标题是 AdvancedTool ControlCenter", CONTROL_CENTER_TITLE === "AdvancedTool ControlCenter");
  Check("卡片 19 张、六组、顺序同 TOOL_MENUS", cards.length === 19 && new Set(cards.map((card) => card.group)).size === 6
    && JSON.stringify(cards.map((card) => card.id)) === JSON.stringify(menuIds));
  Check("文案取 TOOL_INFO 的 label / hint", cards.every((card) => card.label === TOOL_INFO[card.id].label && card.hint === TOOL_INFO[card.id].hint));
  for (const id of WINDOW_TOOL_IDS) {
    const card = cards.find((entry) => entry.id === id);
    const expected = new URL(TOOL_INFO[id].window.url, "http://127.0.0.1:9/Taierzhuang1938/").href;
    Check(`${id} 卡片开自己的页面（${card.target}）`, card.kind === "window" && card.href === expected && card.features === TOOL_INFO[id].window.features, card.href);
  }
  for (const id of STUDIO_TOOL_IDS) {
    const card = cards.find((entry) => entry.id === id);
    Check(`${id} 卡片开 Tool_Studio.html?tool=${id}`, card.kind === "studio"
      && card.href === new URL(StudioToolUrl(id), page).href && card.href.endsWith(`/AdvancedTools/Tool_Studio.html?tool=${id}`), card.href);
  }
  const game = (id) => cards.find((entry) => entry.id === id);
  for (const id of GAME_TOOL_IDS) {
    Check(`${id} 卡片标「游戏内」并链到游戏首页`, game(id).kind === "game"
      && game(id).href.startsWith("http://127.0.0.1:9/Taierzhuang1938/index.html?editor="), game(id).href);
  }
  Check("blockout / timeline / environment 用入口类的 Url()", /editor=blockout/.test(game("blockout").href)
    && /editor=blockout/.test(game("timeline").href) && /env=1/.test(game("environment").href));
  Check("其余游戏内工具走 ?editor=tools&tool=", ["splines", "propPcg", "fpMotion"].every((id) => game(id).href.endsWith(`/index.html?editor=tools&tool=${id}`)));
}

// --- 5. 启动器 ----------------------------------------------------------------------
const Run = (args) => execFileSync(process.execPath, [launcher, ...args], { encoding: "utf8", cwd: os.tmpdir() });
{
  const plan = Run(["--dry-run", "8191"]);
  Check("--dry-run 打印计划、不真起服", /\[dry-run\]/.test(plan) && plan.includes(ControlCenterUrl(8191)), plan.split(/\r?\n/)[0]);
  Check("控制中心地址与仓库根", CONTROL_CENTER_PATH === "/Taierzhuang1938/AdvancedTools/ControlCenter.html" && REPO_ROOT === path.resolve(projectDir, ".."));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ControlCenterShortcut-"));
  try {
    const output = Run([`--shortcut-dir=${dir}`]);
    const files = fs.readdirSync(dir);
    if (process.platform === "win32") {
      const link = path.join(dir, `${SHORTCUT_NAME}.lnk`);
      Check("--shortcut-dir 在目标目录建 .lnk", files.includes(`${SHORTCUT_NAME}.lnk`), output.trim().split("\n")[0]);
      const info = execFileSync("powershell", ["-NoProfile", "-Command",
        "$s=(New-Object -ComObject WScript.Shell).CreateShortcut($env:LINK_PATH);'T='+$s.TargetPath;'A='+$s.Arguments;'W='+$s.WorkingDirectory;'I='+$s.IconLocation"],
        { encoding: "utf8", env: { ...process.env, LINK_PATH: link } });
      const field = (key) => new RegExp(`^${key}=(.*)$`, "m").exec(info)?.[1]?.trim();
      Check("快捷方式目标是 node", path.resolve(field("T")) === path.resolve(process.execPath), field("T"));
      Check("快捷方式参数是本脚本", field("A") === `"${launcher}"`, field("A"));
      Check("快捷方式工作目录是仓库根", path.resolve(field("W")) === REPO_ROOT, field("W"));
      const iconSource=path.join(REPO_ROOT,"scripts","Icons","Icon_ControlCenter.ico");
      const iconHash=createHash("sha256").update(fs.readFileSync(iconSource)).digest("hex").slice(0,16);
      const iconPath=field("I").replace(/,0$/,"");
      Check("快捷方式使用控制中心专属版本图标",path.basename(iconPath)===`Icon_ControlCenter_${iconHash}.ico`&&fs.existsSync(iconPath),field("I"));
      Check("图标资源与源文件一致",fs.readFileSync(iconPath).equals(fs.readFileSync(iconSource)));
      const linkBytes=fs.readFileSync(link);
      Check("图标引用不依赖用户环境变量",(linkBytes.readUInt32LE(20)&0x4000)===0);
    } else {
      Check("--shortcut-dir 在目标目录建启动文件", files.length === 1 && files[0].startsWith(SHORTCUT_NAME), files.join(","));
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }

  let advertisedRevision;
  const oldPreview = http.createServer((request, response) => {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ app: "BlanksLocalPreview", root: REPO_ROOT, runtimeRevision: advertisedRevision }));
  });
  oldPreview.listen(0, "127.0.0.1"); await once(oldPreview, "listening");
  const oldPort = oldPreview.address().port;
  Check("同目录的旧服务需要更新", !(await ServesThisRepo(oldPort)));
  advertisedRevision = PreviewRuntimeRevision(REPO_ROOT);
  Check("同目录同运行时可以复用", await ServesThisRepo(oldPort));
  advertisedRevision = "older-runtime";
  Check("同目录不同运行时需要更新", !(await ServesThisRepo(oldPort)));
  // Simulate a running pre-chat server at the launcher's preferred port.
  const child = spawn(process.execPath, [launcher, String(oldPort), "--no-open"], { cwd: os.tmpdir(), stdio: ["ignore", "pipe", "inherit"], windowsHide: true });
  let text = "";
  child.stdout.on("data", (chunk) => { text += chunk; });
  const deadline = Date.now() + 30000;
  let port = null;
  while (Date.now() < deadline && !port) {
    await new Promise((resolve) => setTimeout(resolve, 300));
    port = Number(/控制中心：http:\/\/127\.0\.0\.1:(\d+)\//.exec(text)?.[1]) || null;
  }
  try {
    Check("没有服务时启动器起一份预览服并报出控制中心地址", !!port, text.trim().split("\n").at(-2) || text);
    if (port) {
      Check("启动器为当前版本选取新端口", port !== oldPort);
      const ping = await (await fetch(`http://127.0.0.1:${port}/__preview/ping`)).json();
      Check("新起的服务服的正是本仓库", path.resolve(ping.root) === REPO_ROOT, ping.root);
      Check("新起的服务具有当前运行时版本", ping.runtimeRevision === PreviewRuntimeRevision(REPO_ROOT));
      Check("控制中心连接的预览具有 Codex 会话接口", (await fetch(`http://127.0.0.1:${port}/__encounter/codex/sessions`)).ok);
      Check("静态文件入口保护会话私有目录", (await fetch(`http://127.0.0.1:${port}/tmp/EncounterCodex/`)).status === 403);
      Check("静态入口限制在当前仓库内", (await fetch(`http://127.0.0.1:${port}/%2e%2e%2f${path.basename(REPO_ROOT)}Leak/Example.txt`)).status === 403);
      const page = await fetch(ControlCenterUrl(port));
      Check("控制中心页能取到", page.ok && /AdvancedTool ControlCenter/.test(await page.text()));
    }
  } finally {
    if (process.platform === "win32") {
      try { execFileSync("taskkill", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore", windowsHide: true }); } catch { /* Already stopped. */ }
    } else child.kill();
    await new Promise((resolve) => (child.exitCode !== null ? resolve() : child.once("exit", resolve)));
    oldPreview.closeAllConnections(); await new Promise(resolve => oldPreview.close(resolve));
  }
}

console.log(failed ? `${failed} 项未过` : "高级工具拆分：全部通过");
process.exitCode = failed ? 1 : 0;
