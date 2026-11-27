// 高级工具拆分（AdvancedTools/）纯 Node 门禁。
//
// 查：
//   1. 目录表 Data_AdvancedTools 与 Data_DevTools 对账，分别检查独立窗口、摄影棚、游戏内入口；
//   2. 搬走的页面都在 AdvancedTools/，旧位置不留跳转壳；
//   3. 独立窗口入口类解析出的仍是 AdvancedTools/<页面>；
//   4. 控制中心卡片：六组、地址与「游戏内」标注都对；
//   5. 启动器：--dry-run 的计划、--shortcut-dir 生成的 .lnk（目标 node、参数本脚本、工作目录仓库根）、
//      没有预览服时真起一份（端口以输出为准）并能 ping 出本仓库根目录。
//
// 用法：node Taierzhuang1938/Script_AdvancedToolsTest.mjs

import fs from "node:fs";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { spawn, execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";
import http from "node:http";
import { once } from "node:events";
import { PreviewRuntimeRevision } from "../scripts/Script_LocalPreviewRuntime.mjs";
import { TOOL_INFO, TOOL_MENUS } from "./Data_DevTools.mjs";
import { SANDBOX_RANGE_KEYS } from "./Data_SandboxRanges.mjs";
import { LocalControlCenterUrl } from "./Data_StartupRouting.mjs";
import { STUDIO_TOOL_IDS, WINDOW_TOOL_IDS, GAME_TOOL_IDS, STANDALONE_TOOLS, StudioToolUrl } from "./AdvancedTools/Data_AdvancedTools.mjs";
import { ControlCenterCards, CONTROL_CENTER_TITLE } from "./AdvancedTools/Script_ControlCenter.mjs";
import { REPO_ROOT, SHORTCUT_NAME, CONTROL_CENTER_PATH, ControlCenterUrl, PREVIEW_SCRIPT, ServesThisRepo } from "./AdvancedTools/Script_ControlCenterLaunch.mjs";
import { TestSceneCards, TEST_SCENES_TITLE } from "./AdvancedTools/Script_TestScenes.mjs";
import { CheckTestSceneCovers, CoverUrlFor } from "./AdvancedTools/Script_CaptureTestSceneCovers.mjs";
import {
  SHORTCUT_NAME as TEST_SCENES_SHORTCUT_NAME, TEST_SCENES_PATH, TestScenesUrl,
} from "./AdvancedTools/Script_TestScenesLaunch.mjs";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const toolsDir = path.join(projectDir, "AdvancedTools");
const launcher = path.join(toolsDir, "Script_ControlCenterLaunch.mjs");
let failed = 0;
function Check(name, ok, detail = "") {
  if (!ok) failed += 1;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? "  — " + detail : ""}`);
}
const Same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

const gameHref = "http://127.0.0.1:8080/Taierzhuang1938/index.html";
const controlCenter = LocalControlCenterUrl(gameHref, new URLSearchParams("editor=tools&audio=0"));
Check("旧工具首页地址跳转并保留通用参数", controlCenter?.href === `${ControlCenterUrl(8080)}?audio=0`);
const gameQueries = ["tool=actor", "menu=0", "phase=0", "whitebox=p012", "shot=1", "poseTest=1",
  ...SANDBOX_RANGE_KEYS.map((key) => `${key}=1`)];
Check("具名工具、游戏宿主、关卡和测试场仍走游戏入口", gameQueries.every((query) =>
  LocalControlCenterUrl(gameHref, new URLSearchParams(`editor=tools&${query}`)) === null));

// --- 1. 目录表 -------------------------------------------------------------------
const menuIds = TOOL_MENUS.flatMap((menu) => menu.items);
const splitIds = Object.keys(TOOL_INFO).filter((id) => TOOL_INFO[id].split);
Check("split 条目共 13 项", splitIds.length === 13, splitIds.join(","));
Check("独立窗口 + 摄影棚 = split 的全部", Same([...STUDIO_TOOL_IDS, ...WINDOW_TOOL_IDS], splitIds));
Check("独立窗口 = split 且带 window 的条目", Same(WINDOW_TOOL_IDS, splitIds.filter((id) => TOOL_INFO[id].window)));
Check("留在游戏里的 = 没有 split 的菜单条目", Same(GAME_TOOL_IDS, menuIds.filter((id) => !TOOL_INFO[id].split)));
Check("菜单 15 项且三类互不重叠", menuIds.length === 15 && new Set([...STUDIO_TOOL_IDS, ...WINDOW_TOOL_IDS, ...GAME_TOOL_IDS]).size === 15);
Check("只在控制中心的独立工具不进游戏清单与拆分边界", STANDALONE_TOOLS.every((tool) => !TOOL_INFO[tool.id] && !menuIds.includes(tool.id)
  && ![...STUDIO_TOOL_IDS, ...WINDOW_TOOL_IDS, ...GAME_TOOL_IDS].includes(tool.id))
  && !/PropLibrary|AssetStandards|AudioPreview/.test(fs.readFileSync(path.join(projectDir, "Script_DevToolsSplit.mjs"), "utf8"))
  && !/PropLibrary|PlaceableCatalog|AssetStandards|AssetPipeline|EditorAudio|AudioPreview/.test(fs.readFileSync(path.join(projectDir, "index.html"), "utf8")));

// --- 2. 搬家 ---------------------------------------------------------------------
const pages = ["SceneEditor.html", "Tool_LevelFlow.html", "Tool_MixamoAnimationPreview.html", "Tool_MotionCompare.html", "Tool_MotionWorkbench.html",
  "TextureManager.html", "Tool_WeaponInspection.html", "Tool_FirstPersonInspection.html", "Tool_Studio.html", "ControlCenter.html", "TestScenes.html", "Tool_PropLibrary.html", "Tool_AssetStandards.html", "Tool_SquadSplinePreview.html"];
Check("页面都在 AdvancedTools/", pages.every((page) => fs.existsSync(path.join(toolsDir, page))));
Check("旧位置不留跳转壳", pages.slice(0, 6).every((page) => !fs.existsSync(path.join(projectDir, page))));
Check("摄影棚编辑器与独立窗口入口都在 AdvancedTools/", ["Actor", "Facial", "FirstPerson", "FirstPersonEntry", "Vfx", "Audio",
  "SceneEntry", "LevelFlow", "MixamoPreview", "MotionCompare", "MotionWorkbench", "Textures", "WeaponEntry"].every((name) => fs.existsSync(path.join(toolsDir, `Script_Editor${name}.mjs`))
  && !fs.existsSync(path.join(projectDir, `Script_Editor${name}.mjs`))));
Check("旧枪械工作窗已移除", !fs.existsSync(path.join(toolsDir, "Script_EditorWeapon.mjs")));
Check("游戏内构件库编辑器已移除，独立页面代码在 AdvancedTools/", !fs.existsSync(path.join(toolsDir, "Script_EditorPropLibrary.mjs"))
  && ["Script_PropLibrary.mjs", "Script_PropLibraryStage.mjs", "Style_PropLibrary.css", "Script_PlaceableCatalog.mjs"].every((file) => fs.existsSync(path.join(toolsDir, file))));
Check("资产规范的工具宿主编辑器已移除，独立配置器代码在 AdvancedTools/、规范在 AssetPipeline/", !fs.existsSync(path.join(toolsDir, "Script_EditorAssetStandards.mjs"))
  && ["Script_AssetStandardsTool.mjs", "Style_AssetStandards.css"].every((file) => fs.existsSync(path.join(toolsDir, file)))
  && fs.existsSync(path.join(projectDir, "AssetPipeline", "Data_AssetStandards.json")));

Check("PCG 验证界面迁入独立工具目录", ["Splines", "PropPcg"].every((id) => fs.existsSync(path.join(toolsDir, `Script_Editor${id}.mjs`)) && !fs.existsSync(path.join(projectDir, `Script_Editor${id}.mjs`))));
Check("持枪移动观察工具与专用测试已删除", ["Script_EditorFirstPersonMotion.mjs", "Script_EditorFirstPersonMotionBrowserTest.mjs"].every((file) => !fs.existsSync(path.join(projectDir, file))));

// --- 3. 入口类：窗口地址 ----------------------------------------------------------
{
  const opened = [];
  globalThis.window = { open: (url, name, features) => { opened.push({ url: String(url), name, features }); return { closed: false, focus() {} }; } };
  const entries = [
    ["sceneEditor", "Script_EditorSceneEntry.mjs", "SceneEditorEntry", "SceneEditor.html"],
    ["levelFlow", "Script_EditorLevelFlow.mjs", "LevelFlowEntry", "Tool_LevelFlow.html"],
    ["mixamoPreview", "Script_EditorMixamoPreview.mjs", "MixamoPreviewEditor", "Tool_MixamoAnimationPreview.html"],
    ["motionCompare", "Script_EditorMotionCompare.mjs", "MotionCompareEditor", "Tool_MotionCompare.html"],
    ["motionWorkbench", "Script_EditorMotionWorkbench.mjs", "MotionWorkbenchEditor", "Tool_MotionWorkbench.html"],
    ["weapon", "Script_EditorWeaponEntry.mjs", "WeaponInspectionEntry", "Tool_WeaponInspection.html"],
    ["firstPerson", "Script_EditorFirstPersonEntry.mjs", "FirstPersonInspectionEntry", "Tool_FirstPersonInspection.html"],
    ["textures", "Script_EditorTextures.mjs", "TextureEditor", "TextureManager.html"],
    ["splines", "Script_EditorPcgEntry.mjs", "SplineEntry", "Tool_Pcg.html"],
    ["propPcg", "Script_EditorPcgEntry.mjs", "PropPcgEntry", "Tool_Pcg.html"],
    ["vfx", "Script_EditorMediaEntry.mjs", "VfxPreviewEntry", "Tool_VfxPreview.html"],
  ];
  for (const [id, file, name, page] of entries) {
    const module = await import(pathToFileURL(path.join(toolsDir, file)).href);
    module[name].win = null;
    module[name].Open();
    const url = new URL(opened.at(-1).url);
    Check(`${id} 入口类打开的是 AdvancedTools/${page}`,
      url.pathname.endsWith(`/Taierzhuang1938/AdvancedTools/${page}`) && fs.existsSync(path.join(toolsDir, page)), url.pathname);
    Check(`${id} 以普通标签页打开（沿用目标名、不传 popup features）`,
      opened.at(-1).name === TOOL_INFO[id].window.name && !opened.at(-1).features && !TOOL_INFO[id].window.features);
  }
  const mediaEntry = await import(pathToFileURL(path.join(toolsDir, "Script_EditorMediaEntry.mjs")).href);
  Check("Script_EditorMediaEntry 不再导出 AudioPreviewEntry", !("AudioPreviewEntry" in mediaEntry));
  delete globalThis.window;
}

// --- 3b. 特效 / 声音独立窗口：不依赖游戏的灯光、后处理、天空与关卡 -----------------------
// 两个页面入口的静态模块图里不许出现这些模块（2026-11-23 用户：特效、音乐、构件本就该与灯光、后处理解耦）。
// 特效系统本身（Script_Vfx 与粒子 / 照明弹模块）是要预览的对象，照旧共用。
{
  // 关卡布局 / 地形 / 路线数据也不许进来（声音的配方表 Data_FirstLevelMissionMusic、…BattleSound 是音频数据，可以）。
  const FORBIDDEN = /^(Script_(Main|Post\w*|Light|Sky|Gi|Atmosphere|Materials|MaterialShading|MaterialPatches|World|ClusteredLights|TengxianCity|TengxianField|Editor|ToolStudioRenderBase|FirstLevelWhitebox\w*|FirstLevelMission(Terrain|Topology)?)|Data_(Battle|Tengxian|FirstLevelMission|FirstLevelMission(Layout|Terrain|Topology|Trenches|TrenchCover|Fortifications|Front)|FirstLevelWhiteboxTerrain\w*|FirstLevelDistantSmoke))\.mjs$/;
  const Closure = (entry) => {
    const seen = new Set();
    const Walk = (file) => {
      if (seen.has(file)) return;
      seen.add(file);
      const source = fs.readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
      for (const match of source.matchAll(/(?:import|export)\s[^;'"]*?from\s*['"](\.{1,2}\/[^'"]+)['"]/g)) Walk(path.resolve(path.dirname(file), match[1].split("?")[0]));
    };
    Walk(path.join(toolsDir, entry));
    return [...seen].map((file) => path.basename(file));
  };
  // 构件库预览是只读可视化：不装游戏主程序、编辑器宿主与工具宿主渲染底座。外部道具加载器（Script_ExternalProps → TengxianCity
  // → Water → Post…）会把后处理 / 天空等模块静态带进来，但页面只建自己的轻量棚灯，不实例化它们（Script_PropLibraryStage）。
  {
    const modules = Closure("Script_PropLibrary.mjs");
    const bad = modules.filter((name) => /^Script_(Main|Editor|EditorStage|EditorUi|DevTools\w*|ToolStudio\w*|FrameModes)\.mjs$/.test(name));
    Check(`Tool_PropLibrary.html 的模块图不含游戏主程序 / 编辑器宿主 / 工具宿主（${modules.length} 个模块）`, bad.length === 0, bad.join(", "));
    const stage = fs.readFileSync(path.join(toolsDir, "Script_PropLibraryStage.mjs"), "utf8");
    Check("构件库三维台不建游戏的后处理、天空与灯光组", !/new (PostPipeline|SkyDome|LightRig|ProbeVolume|VfxSystem|AudioEngine)\b/.test(stage));
  }
  for (const [entry, page] of [["Script_AudioPreview.mjs", "Tool_AudioPreview.html"], ["Script_VfxPreview.mjs", "Tool_VfxPreview.html"]]) {
    const modules = Closure(entry);
    const bad = modules.filter((name) => FORBIDDEN.test(name));
    Check(`${page} 的模块图不含游戏灯光 / 后处理 / 天空 / 材质库 / 关卡（${modules.length} 个模块）`, bad.length === 0, bad.join(", "));
    Check(`${page} 页面存在并只登记 three`, fs.existsSync(path.join(toolsDir, page))
      && /"imports":\s*\{\s*"three":/.test(fs.readFileSync(path.join(toolsDir, page), "utf8")));
  }
  const audioModules = Closure("Script_AudioPreview.mjs");
  const audioScene = audioModules.filter((name) => /^Script_(Vfx|Particle\w*|EditorStage)\.mjs$/.test(name));
  Check("音效音乐窗口不装渲染：模块图里没有特效、粒子与摄影棚", audioScene.length === 0, audioScene.join(","));
  Check("音效音乐窗口与游戏清单解耦：不引入 Data_DevTools / MediaEntry 且不调 SetToolsVolume",
    !audioModules.includes("Data_DevTools.mjs") && !audioModules.includes("Script_EditorMediaEntry.mjs")
    && !/SetToolsVolume|toolsVolume/.test(fs.readFileSync(path.join(toolsDir, "Script_AudioPreview.mjs"), "utf8"))
    && !/SetToolsVolume|toolsVolume/.test(fs.readFileSync(path.join(toolsDir, "Script_ToolWindowShell.mjs"), "utf8")),
    audioModules.join(","));
  const studio = fs.readFileSync(path.join(toolsDir, "Script_ToolStudio.mjs"), "utf8");
  Check("工具宿主不再装特效 / 声音编辑器，旧地址转到独立窗口", !/Script_Editor(Vfx|Audio)\.mjs/.test(studio) && /vfx: \[/.test(studio) && /audio: \[/.test(studio));
  const vfxEditor = fs.readFileSync(path.join(toolsDir, "Script_EditorVfx.mjs"), "utf8");
  Check("特效编辑器的昼夜在独立窗口里取环境预设（host.previewEnvironment），不再引第一关撒点数据",
    /host\.previewEnvironment/.test(vfxEditor) && !/Data_FirstLevelDistantSmoke/.test(vfxEditor));
}

// --- 4. 控制中心卡片 ----------------------------------------------------------------
{
  const page = "http://127.0.0.1:9/Taierzhuang1938/AdvancedTools/ControlCenter.html";
  const cards = ControlCenterCards(page);
  Check("标题是 AdvancedTool ControlCenter", CONTROL_CENTER_TITLE === "AdvancedTool ControlCenter");
  const standaloneIds = STANDALONE_TOOLS.map((tool) => tool.id);
  const gameMenuCards = cards.filter((card) => !standaloneIds.includes(card.id));
  Check("卡片 22 张、六组、游戏工具顺序同 TOOL_MENUS", cards.length === 22 && new Set(cards.map((card) => card.group)).size === 6
    && JSON.stringify(gameMenuCards.map((card) => card.id)) === JSON.stringify(menuIds));
  Check("游戏工具文案取 TOOL_INFO 的 label / hint", gameMenuCards.every((card) => card.label === TOOL_INFO[card.id].label && card.hint === TOOL_INFO[card.id].hint));
  Check("测试场景启动器是控制中心关卡组的独立窗口卡片", cards.some((card) => card.id === "testScenes" && card.group === "level"
    && card.kind === "window" && new URL(card.href).pathname.endsWith("/AdvancedTools/TestScenes.html")));
  Check("小队 PCG 样条预览是控制中心关卡组的独立窗口卡片", cards.some((card) => card.id === "squadSplinePreview" && card.group === "level"
    && card.kind === "window" && new URL(card.href).pathname.endsWith("/AdvancedTools/Tool_SquadSplinePreview.html")));
  Check("模型制作工作台是控制中心的独立资产工具", cards.some((card) => card.id === "modelWorkbench" && card.group === "assets"
    && card.kind === "window" && new URL(card.href).pathname.endsWith("/AdvancedTools/Tool_ModelWorkbench.html")));
  Check("角色制作管线是控制中心角色组的独立工具", cards.some((card) => card.id === "characterWorkbench"
    && card.group === "character" && card.kind === "window" && card.target === "TengxianCharacterWorkbench"
    && card.href === new URL("./Tool_CharacterWorkbench.html", page).href));
  const media = cards.filter((card) => card.group === "media").map((card) => card.id);
  Check("音效音乐只在控制中心的特效与声音组作为独立窗口卡片（紧跟特效预览后），不在游戏工具菜单",
    media.join(",") === "vfx,audio" && !TOOL_INFO.audio && !menuIds.includes("audio")
    && cards.some((card) => card.id === "audio" && card.group === "media" && card.kind === "window"
      && card.target === "TengxianAudioPreview"
      && new URL(card.href).pathname.endsWith("/AdvancedTools/Tool_AudioPreview.html")),
    media.join(","));
  const assets = cards.filter((card) => card.group === "assets").map((card) => card.id);
  Check("构件库预览、资产规范是控制中心资产组前两张独立窗口卡片", assets[0] === "props" && assets[1] === "assetStandards" && assets.at(-1) === "modelWorkbench"
    && cards.some((card) => card.id === "props" && card.kind === "window" && card.target === "TengxianPropLibrary"
      && new URL(card.href).pathname.endsWith("/AdvancedTools/Tool_PropLibrary.html"))
    && cards.some((card) => card.id === "assetStandards" && card.kind === "window" && card.target === "TengxianAssetStandards"
      && new URL(card.href).pathname.endsWith("/AdvancedTools/Tool_AssetStandards.html")), assets.join(","));
  Check("所有独立工具都不配置 popup features（以普通标签页打开）",
    STANDALONE_TOOLS.every((tool) => !tool.window.features)
    && WINDOW_TOOL_IDS.every((id) => !TOOL_INFO[id].window.features)
    && cards.every((card) => !card.features));
  for (const id of WINDOW_TOOL_IDS) {
    const card = cards.find((entry) => entry.id === id);
    const expected = new URL(TOOL_INFO[id].window.url, "http://127.0.0.1:9/Taierzhuang1938/").href;
    Check(`${id} 卡片开自己的页面（${card.target}）`, card.kind === "window" && card.href === expected && !card.features, card.href);
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
  Check("blockout / timeline 用入口类的 Url()", /editor=blockout/.test(game("blockout").href)
    && /editor=blockout/.test(game("timeline").href));
}

// --- 4b. 测试场景启动页与启动器 -------------------------------------------------------
{
  const tsPage = "http://127.0.0.1:9/Taierzhuang1938/AdvancedTools/TestScenes.html";
  const tsCards = TestSceneCards(tsPage);
  const functional = tsCards.filter((card) => card.group === "functional");
  Check("测试场景页标题正确", TEST_SCENES_TITLE === "测试场景");
  Check("测试场景页只保留 11 个独立功能测试场且均有进入、场景编辑器链接与实机封面", tsCards.length === 11 && functional.length === 11
    && functional.every((card) => card.sceneId && card.runHref.includes(`?${card.id}=1`)
      && card.editHref.includes(`/AdvancedTools/SceneEditor.html?scene=${card.sceneId}`)
      && card.cover === CoverUrlFor(card.id)),
    functional.map((c) => `${c.id}->${c.sceneId}`).join(","));
  const coversCheck = CheckTestSceneCovers();
  Check("11 个功能测试场实机 WebP 封面均齐备且合法（Script_CaptureTestSceneCovers --check）",
    coversCheck.ok && coversCheck.items.length === 11,
    coversCheck.ok ? `${coversCheck.items.length} 张` : JSON.stringify(coversCheck));
  const tsLauncher = path.join(toolsDir, "Script_TestScenesLaunch.mjs");
  const tsPlan = execFileSync(process.execPath, [tsLauncher, "--dry-run", "8193"], { encoding: "utf8", cwd: os.tmpdir() });
  Check("测试场景入口 --dry-run 打印计划", /\[dry-run\]/.test(tsPlan) && tsPlan.includes(TestScenesUrl(8193))
    && TEST_SCENES_PATH === "/Taierzhuang1938/AdvancedTools/TestScenes.html");
  const tsDir = fs.mkdtempSync(path.join(os.tmpdir(), "TestScenesShortcut-"));
  try {
    execFileSync(process.execPath, [tsLauncher, `--shortcut-dir=${tsDir}`], { encoding: "utf8", cwd: os.tmpdir() });
    const tsFiles = fs.readdirSync(tsDir);
    if (process.platform === "win32") {
      Check("测试场景入口 --shortcut-dir 建中文 .lnk", tsFiles.includes(`${TEST_SCENES_SHORTCUT_NAME}.lnk`), tsFiles.join(","));
    } else {
      Check("测试场景入口 --shortcut-dir 建启动文件", tsFiles.length === 1);
    }
  } finally { fs.rmSync(tsDir, { recursive: true, force: true }); }
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
      const characterOpen = new URL("/__character-workbench/open", ControlCenterUrl(port));
      Check("角色制作启动只接受本机同源 POST",
        (await fetch(characterOpen)).status === 405
        && (await fetch(characterOpen, { method: "POST" })).status === 403
        && (await fetch(characterOpen, { method: "POST", headers: { Origin: "https://example.com" } })).status === 403);
    }
  } finally {
    if (process.platform === "win32") {
      try { execFileSync("taskkill", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore", windowsHide: true }); } catch { /* Already stopped. */ }
    } else child.kill();
    await new Promise((resolve) => (child.exitCode !== null ? resolve() : child.once("exit", resolve)));
    oldPreview.closeAllConnections(); await new Promise(resolve => oldPreview.close(resolve));
  }

  // Simulate a stale same-repo preview server that supports graceful /__preview/shutdown:
  // launcher should replace it in place and reclaim the exact same pinned port.
  let shutdownRoot = null;
  const replaceable = http.createServer(async (request, response) => {
    if (request.url === "/__preview/shutdown" && request.method === "POST") {
      const chunks = [];
      for await (const c of request) chunks.push(c);
      shutdownRoot = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}").root || null;
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ stopping: true }));
      replaceable.closeAllConnections();
      replaceable.close();
      return;
    }
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ app: "BlanksLocalPreview", root: REPO_ROOT, runtimeRevision: "older-runtime", canShutdown: true }));
  });
  replaceable.listen(0, "127.0.0.1"); await once(replaceable, "listening");
  const pinnedPort = replaceable.address().port;
  const child2 = spawn(process.execPath, [launcher, String(pinnedPort), "--no-open"], { cwd: os.tmpdir(), stdio: ["ignore", "pipe", "inherit"], windowsHide: true });
  let text2 = "";
  child2.stdout.on("data", (chunk) => { text2 += chunk; });
  const deadline2 = Date.now() + 30000;
  let port2 = null;
  while (Date.now() < deadline2 && !port2) {
    await new Promise((resolve) => setTimeout(resolve, 300));
    port2 = Number(/控制中心：http:\/\/127\.0\.0\.1:(\d+)\//.exec(text2)?.[1]) || null;
  }
  try {
    Check("同目录旧服务支持平滑停服时在原端口原地升级", port2 === pinnedPort && path.resolve(shutdownRoot || "") === REPO_ROOT, `pinned=${pinnedPort}, got=${port2}`);
  } finally {
    if (process.platform === "win32") {
      try { execFileSync("taskkill", ["/pid", String(child2.pid), "/t", "/f"], { stdio: "ignore", windowsHide: true }); } catch { /* Already stopped. */ }
    } else child2.kill();
    await new Promise((resolve) => (child2.exitCode !== null ? resolve() : child2.once("exit", resolve)));
    if (replaceable.listening) { replaceable.closeAllConnections(); await new Promise(resolve => replaceable.close(resolve)); }
  }
}

// --- 6. 两个桌面入口共用已运行的服务，占用时不另开端口 ---------------------------
{
  const revision = PreviewRuntimeRevision(REPO_ROOT);
  const sameRoot = http.createServer((request, response) => {
    response.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({
      app: "BlanksLocalPreview", root: REPO_ROOT, runtimeRevision: revision,
    }));
  });
  const otherRoot = http.createServer((request, response) => {
    response.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({
      app: "BlanksLocalPreview", root: os.tmpdir(), runtimeRevision: revision,
    }));
  });
  const Close = (server) => {
    server.closeAllConnections();
    return new Promise((resolve) => server.close(resolve));
  };
  sameRoot.listen(0, "127.0.0.1");
  await once(sameRoot, "listening");
  const existingPort = sameRoot.address().port;
  const preferredPort = existingPort - 1;
  try {
    otherRoot.listen(preferredPort, "127.0.0.1");
    await once(otherRoot, "listening");
    const RunDesktop = (script, args) => promisify(execFile)(process.execPath, [script, ...args, "--no-open"], {
      encoding: "utf8", env: { ...process.env, PREVIEW_PORT: String(preferredPort) }, timeout: 8000,
    });
    const [index, tools] = await Promise.all([
      RunDesktop(PREVIEW_SCRIPT, ["--desktop"]),
      RunDesktop(launcher, []),
    ]);
    Check("桌面预览复用同检出的相邻端口", index.stdout.includes(`:${existingPort}/__preview/`), index.stdout.trim());
    Check("控制中心复用同一相邻端口", tools.stdout.includes(ControlCenterUrl(existingPort)), tools.stdout.trim());
    await Close(sameRoot);
    const refused = await RunDesktop(PREVIEW_SCRIPT, ["--desktop"]).catch((error) => error);
    Check("另一检出占据首选端口时桌面入口提示占用，不递增端口",
      refused.code === 1 && refused.stderr.includes(`:${preferredPort} 已被占用`), refused.stderr?.trim());
  } finally {
    if (sameRoot.listening) await Close(sameRoot);
    if (otherRoot.listening) await Close(otherRoot);
  }
}

console.log(failed ? `${failed} 项未过` : "高级工具拆分：全部通过");
process.exitCode = failed ? 1 : 0;
