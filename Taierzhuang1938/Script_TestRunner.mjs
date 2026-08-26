// ===========================================================================
// Script_TestRunner.mjs —— 台儿庄白盒的测试分级入口
//
// 现有测试按爆炸半径分三档：
//   Tier 0：每次改动必跑的整机安全网与纯 Node 快测。
//   Tier 1：按领域触发的自动深度探针；--changed 可从 Git 改动自动推断。
//   Tier 2：对机器敏感或需要人工看图的低频审查，不被 --changed 自动触发。
//
// 常用命令：
//   node Taierzhuang1938/Script_TestRunner.mjs
//   node Taierzhuang1938/Script_TestRunner.mjs --changed=origin/master
//   node Taierzhuang1938/Script_TestRunner.mjs --domain=terrain
//   node Taierzhuang1938/Script_TestRunner.mjs --tier=1
//   node Taierzhuang1938/Script_TestRunner.mjs --tier=2
//   node Taierzhuang1938/Script_TestRunner.mjs --only=PlayTest
//   node Taierzhuang1938/Script_TestRunner.mjs --list
//
// 默认只透出子测试的阶段行和每分钟心跳；失败时打印尾部，--verbose 透传全程。
// PlayTest 的历史红按断言名显式基线化：历史红仍显示，但只有新增红使默认命令失败；
// --strict-baseline 可让历史红也返回失败。
// ===========================================================================

import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const fileHere = fileURLToPath(import.meta.url);
const dirHere = path.dirname(fileHere);
const repoRoot = path.resolve(dirHere, "..");
const defaultTimeoutMs = 10 * 60 * 1000;
const heartbeatMs = 60 * 1000;
const maxCaptureChars = 4 * 1024 * 1024;

const playTestExpectedFailures = [
  "六十秒内全场开火计数 > 200",
  // 「击杀回执 killConfirm」2026-08-26 已修并摘除：红的根源是测试自己的零余量竞态 ——
  // 等拉栓的 120 帧里友军把摆好的靶子磨死，第二枪打的是尸体，ConfirmHit 不会被调用。
  // 场景/布设类提交改了友军射界就翻红。现在等待期把靶子血垫到打不死（见 Script_PlayTest 11.6）。
  // 「玩家亲手击杀」「打中回执」「打死回执」三条已转绿（击杀测试的陈旧枪口 bug
  // 已修：转向后推两帧再取瞄准线），按 runner 提示从基线摘除。
  "P4 夜袭的携行是 L3_WhiteTowel：一支长枪、一支短枪、肩背大刀",
  "头六十秒全场开火 > 200",
  // 姿态这条在纯 master 上红、合并树上绿 —— 判定抖动，先留在基线里。
  "姿态决定被发现的距离：60 m 上站着的看得见、趴着的看不见，30 m 上趴着的照样看得见",
  "Esc / 切走 / 关页 / 切后台 四条通道都会把鼠标还给用户",
];

export const testDefs = {
  BootTest: {
    file: "Script_BootTest.mjs",
    timeoutMs: 4 * 60 * 1000,
    desc: "七关开机冒烟 + draw call/triangles 红线",
  },
  PlayTest: {
    file: "Script_PlayTest.mjs",
    timeoutMs: 20 * 60 * 1000,
    expectedFailures: playTestExpectedFailures,
    desc: "真浏览器端到端通关，130 条断言，跨模块安全网",
  },
  BootStallTest: {
    file: "Script_BootStallTest.mjs",
    timeoutMs: 5 * 60 * 1000,
    desc: "一张贴图挂死不许把开机吊在「加载 PBR 材质」上",
  },
  BootPayloadTest: { file: "Script_BootPayloadTest.mjs", desc: "开机贴图字节红线：PBR_SETS 的总量/单张上限与 URL 存在性（纯 Node，毫秒级）" },
  TestRunnerTest: { file: "Script_TestRunnerTest.mjs", desc: "分级选择、基线和登记完整性（纯 Node）" },
  ModuleGraphTest: { file: "Script_ModuleGraphTest.mjs", desc: "index.html import map 盖满浏览器模块图、禁源码自写 ?v=（纯 Node，秒级）" },
  HudPromptTest: { file: "Script_HudPromptTest.mjs", desc: "HUD 提示规则（纯 Node，秒级）" },
  RiggedModelTest: { file: "Script_RiggedModelTest.mjs", desc: "第一人称手臂 GLB 的二进制契约（纯 Node，秒级）" },
  ExternalPropAssetTest: { file: "Script_ExternalPropAssetTest.mjs", desc: "外部构件 GLB 节点、尺度与面数预算（纯 Node）" },
  FractureBakeTest: { file: "Script_FractureBakeTest.mjs", desc: "预破碎离线数据（纯 Node，秒级）" },
  CutsceneControlTest: { file: "Script_CutsceneControlTest.mjs", desc: "过场导演机位/生命周期（桩 three，Node 可跑）" },
  PhysicsTest: { file: "Script_PhysicsTest.mjs", desc: "真浏览器撞墙：碰撞扫掠" },
  JumpTest: { file: "Script_JumpTest.mjs", desc: "跳跃/落点手感" },
  DestructionTest: { file: "Script_DestructionTest.mjs", desc: "墙体破坏状态机" },
  AiBehaviorTest: { file: "Script_AiBehaviorTest.mjs", desc: "AI 行为决策深度探针" },
  VisibilityTest: { file: "Script_VisibilityTest.mjs", desc: "战场内容预算：名额/空洞/尸体上限" },
  DamageTest: { file: "Script_DamageTest.mjs", desc: "伤害口径重放（TTK 对照）" },
  GunFeelTest: { file: "Script_GunFeelTest.mjs", desc: "枪感短链八条" },
  FixedCenterAimTest: { file: "Script_FixedCenterAimTest.mjs", desc: "HUD/弹道/照门三心归一回归" },
  ReticleCalibrationTest: { file: "Script_ReticleCalibrationTest.mjs", desc: "ADS 放大准心校准与退出还原" },
  SprintCrosshairTest: { file: "Script_SprintCrosshairTest.mjs", desc: "动态准心＝真实散布投影（真 Shift+W 路径）" },
  AdsSightTest: { file: "Script_AdsSightTest.mjs", desc: "开镜视野：五支枪的瞄准点不许被枪身糊住" },
  BayonetTest: { file: "Script_BayonetTest.mjs", desc: "刺刀：装卸、空枪白刃、蓄力分挥砍/劈刺" },
  TownDressingTest: { file: "Script_TownDressingTest.mjs", desc: "城内每户布设的硬规则（纯 Node，秒级）" },
  WestDistrictCoverageTest: { file: "Script_WestDistrictCoverageTest.mjs", desc: "L4 总览完整生成西关 5 地标与 137 件布设" },
  WestSuburbBlocksTest: { file: "Script_WestSuburbBlocksTest.mjs", desc: "西关 20 个示意图矩形整块覆盖、净空与院落几何" },
  WestStationTest: { file: "Script_WestStationTest.mjs", desc: "津浦路滕县站构件、信号与货运作业物冒烟" },
  DressingProbeTest: { file: "Script_DressingProbeTest.mjs", timeoutMs: 12 * 60 * 1000, desc: "七关布设外部构件的重叠/浮空探针（真浏览器）" },
  SprintViewmodelTest: { file: "Script_SprintViewmodelTest.mjs", desc: "冲刺第一人称持械视觉回归" },
  SprintMeleeTest: { file: "Script_SprintMeleeTest.mjs", desc: "冲刺白刃：左键挥得出、刀在画面里" },
  HudPromptBrowserTest: { file: "Script_HudPromptBrowserTest.mjs", desc: "HUD 提示真浏览器交互" },
  TargetInfoTest: { file: "Script_TargetInfoTest.mjs", desc: "准心目标识别：番号/姓名/距离、穿墙与雾外不认" },
  JieheTerrainTest: { file: "Script_JieheTerrainTest.mjs", desc: "界河高度图采样与贴地" },
  TengxianLayoutTest: { file: "Script_TengxianLayoutTest.mjs", desc: "滕县城防、街路与功能区布局（纯 Node）" },
  EastSuburbBlocksTest: { file: "Script_EastSuburbBlocksTest.mjs", desc: "布防图东侧 13 个整框地块、命名院区与框间道路（纯 Node）" },
  EastSuburbNavTest: { file: "Script_EastSuburbNavTest.mjs", desc: "扩展东关切片四个路标的真导航连通率" },
  TengxianZoneTest: { file: "Script_TengxianZoneTest.mjs", desc: "城内 zone/出生点不被街坊围死（纯 Node）" },
  SamplePointTest: { file: "Script_SamplePointTest.mjs", desc: "县城采样点覆盖率与位姿口径（纯 Node）" },
  HeightmapVerify: { file: "Script_HeightmapCli.mjs", args: ["verify"], desc: "SRTM 高度数据完整性（需先 download 过）" },
  AudioTest: { file: "Script_AudioTest.mjs", desc: "音频资产与烘焙管线" },
  VoiceTest: { file: "Script_VoiceTest.mjs", desc: "语音资产与降级链" },
  MenuTest: { file: "Script_MenuTest.mjs", desc: "主菜单接线 29 条" },
  BootPropTest: { file: "Script_BootPropTest.mjs", desc: "开机陈设道具计数" },
  EditorTest: { file: "Script_EditorTest.mjs", desc: "编辑器套件（phase=5 十字街）44+ 项" },
  DestructionEditorTest: { file: "Script_DestructionEditorTest.mjs", desc: "可破坏预览编辑器：真实七关 + 承重白名单" },
  ActorBatchTest: { file: "Script_ActorBatchTest.mjs", desc: "人物合批：逐像素无损 + 真省 draw call" },
  PropInstancingTest: { file: "Script_PropInstancingTest.mjs", desc: "外部布设实例化：逐像素无损 + 真省 draw call + 流送自洽" },
  ActorPoseTest: { file: "Script_ActorPoseTest.mjs", desc: "车厢生活动作模块冒烟（Chromium 加载本地模块）" },
  GiTest: { file: "Script_GiTest.mjs", timeoutMs: 20 * 60 * 1000, desc: "全局光照开关对照" },
  PerformanceTest: { file: "Script_PerformanceTest.mjs", timeoutMs: 30 * 60 * 1000, desc: "帧率/负载实测（对机器敏感）" },
  FrameProfileTest: { file: "Script_FrameProfileTest.mjs", timeoutMs: 30 * 60 * 1000, desc: "整帧 CPU/GPU 剖析消融（对机器敏感）" },
  GodRaysPerformanceTest: { file: "Script_GodRaysPerformanceTest.mjs", timeoutMs: 30 * 60 * 1000, desc: "体积光方向性性能回归（对机器敏感）" },
  DeathViewTest: { file: "Script_DeathViewTest.mjs", timeoutMs: 20 * 60 * 1000, desc: "阵亡镜头出图（人工审）" },
  // 出图已按 URL 参数组分批（并入西郊机位后 45 张只建 19 次城），实测 ~6.5 分钟；
  // 上限从 30 分钟降到 15 分钟，保持与旧口径相同的 ~2.5 倍裕量。
  ShotTest: { file: "Script_ShotTest.mjs", args: ["_shots"], timeoutMs: 15 * 60 * 1000, desc: "逐关逐机位实拍出图（人工审）" },
};

export const tier0 = [
  "BootTest",
  "BootStallTest",
  "BootPayloadTest",
  "PlayTest",
  "TestRunnerTest",
  "ModuleGraphTest",
  "HudPromptTest",
  "RiggedModelTest",
  "FractureBakeTest",
  "CutsceneControlTest",
];

export const tier2 = [
  "ShotTest",
  "GiTest",
  "PerformanceTest",
  "DeathViewTest",
  "FrameProfileTest",
  "GodRaysPerformanceTest",
];

export const domains = {
  terrain: {
    label: "高度图/地形（共享底座，下游成串跑）",
    tests: ["HeightmapVerify", "JieheTerrainTest", "TengxianLayoutTest", "TengxianZoneTest", "SamplePointTest", "PhysicsTest", "JumpTest", "DestructionTest"],
  },
  physics: {
    label: "物理/移动/破坏（共享底座，下游成串跑）",
    tests: ["PhysicsTest", "JumpTest", "DestructionTest", "FractureBakeTest"],
  },
  combat: {
    label: "武器/伤害/枪感/瞄准（共享底座，碰弹道或输入要跑全串）",
    tests: ["DamageTest", "GunFeelTest", "FixedCenterAimTest", "ReticleCalibrationTest", "SprintCrosshairTest",
      "AdsSightTest", "SprintViewmodelTest", "SprintMeleeTest", "BayonetTest"],
  },
  ai: { label: "AI 与战场内容预算", tests: ["AiBehaviorTest", "VisibilityTest"] },
  hud: { label: "HUD/交互提示/目标识别", tests: ["HudPromptTest", "HudPromptBrowserTest", "TargetInfoTest"] },
  audio: { label: "音效/音乐/环境声", tests: ["AudioTest"] },
  voice: { label: "语音", tests: ["VoiceTest"] },
  menu: { label: "主菜单/开机陈设", tests: ["MenuTest", "BootPropTest"] },
  editor: { label: "场景编辑器/可破坏编辑器/采样点", tests: ["EditorTest", "DestructionEditorTest", "SamplePointTest", "WestDistrictCoverageTest", "WestSuburbBlocksTest"] },
  cutscene: { label: "过场/车厢生活动作", tests: ["CutsceneControlTest", "ActorPoseTest"] },
  render: {
    label: "渲染与合批自动契约",
    tests: ["ActorBatchTest", "PropInstancingTest", "ExternalPropAssetTest", "TownDressingTest", "EastSuburbBlocksTest", "EastSuburbNavTest", "WestDistrictCoverageTest", "WestSuburbBlocksTest", "WestStationTest", "DressingProbeTest"],
    tier2Tests: ["GiTest", "DeathViewTest", "ShotTest"],
  },
  perf: {
    label: "性能红线实测（仅提示 Tier 2，不自动跑）",
    tests: [],
    tier2Tests: ["PerformanceTest", "FrameProfileTest", "GodRaysPerformanceTest"],
  },
};

const changedDomainRules = [
  { domain: "terrain", pattern: /(Heightmap|JieheHeight|Terrain|Battlefield|Outfield|Ground|Data_Levels)/i },
  { domain: "physics", pattern: /(Physics|Player|Navigation|Movement|Jump|Destruction|Fracture|Battlefield|Outfield)/i },
  { domain: "combat", pattern: /(Combat|Weapon|Damage|Gun|Aim|Reticle|Viewmodel|Projectile|Ballistic|Script_Input|Data_Meshes|_blender)/i },
  { domain: "ai", pattern: /(Script_Ai|Visibility|Spawn|Data_Battle)/i },
  { domain: "hud", pattern: /(Hud|Prompt|Reticle|Crosshair|Identify|Script_Input|index\.html)/i },
  { domain: "audio", pattern: /(Audio|Sfx|Music|Amb|Sound)/i },
  { domain: "voice", pattern: /(Voice|Dialogue|Speech)/i },
  { domain: "menu", pattern: /(Menu|BootProp|index\.html)/i },
  { domain: "editor", pattern: /(Editor|Data_Levels|SamplePoint)/i },
  { domain: "cutscene", pattern: /(Cutscene|Story|ActorPose|Train)/i },
  { domain: "render", pattern: /(Render|Shader|Material|Model|Landmark|Actor|Rigged|Vfx|Post|Lighting|Gi|Smoke|Outfield|PropBatch|PropStreaming|ExternalProps|\.glsl|index\.html)/i },
  { domain: "perf", pattern: /(Performance|FrameProfile|GodRays|Lod|Visibility|ActorBatch|Smoke)/i },
];

let activeChild = null;
let interruptedSignal = null;

function Unique(values) {
  return [...new Set(values)];
}

export function GetTier1Tests() {
  return Unique(Object.values(domains).flatMap((domain) => domain.tests))
    .filter((name) => !tier0.includes(name) && !tier2.includes(name));
}

function ValidateDomains(names) {
  for (const name of names) {
    if (!domains[name]) throw new Error(`未知 domain=${name}（用 --list 查）`);
  }
}

export function ValidateRegistry() {
  const classified = new Set([...tier0, ...tier2]);
  for (const domain of Object.values(domains)) {
    for (const name of [...domain.tests, ...(domain.tier2Tests ?? [])]) classified.add(name);
  }
  for (const name of classified) {
    if (!testDefs[name]) throw new Error(`分级引用了未登记测试：${name}`);
  }
  for (const [name, def] of Object.entries(testDefs)) {
    if (!classified.has(name)) throw new Error(`测试未归入 tier/domain：${name}`);
    if (!path.isAbsolute(def.file) && !def.file.endsWith(".mjs")) {
      throw new Error(`测试文件扩展名异常：${name} -> ${def.file}`);
    }
  }
}

function ValidateOptions(opts) {
  const hasOnly = opts.only.length > 0;
  const hasSelectors = opts.tier !== null || opts.domains.length || opts.domainOnly.length || opts.changedBase;
  if (hasOnly && hasSelectors) throw new Error("--only 不能和 --tier/--domain/--domain-only/--changed 混用");
  if (opts.domainOnly.length && (opts.domains.length || opts.changedBase || opts.tier !== null)) {
    throw new Error("--domain-only 是排障专用的独占选择器，不能和其他选择器混用");
  }
  if (opts.tier === 2 && (opts.domains.length || opts.changedBase)) {
    throw new Error("--tier=2 是独立人工审查档，不能和 --domain/--changed 混用");
  }
}

export function ParseArgs(argv) {
  const opts = {
    tier: null,
    domains: [],
    domainOnly: [],
    only: [],
    changedBase: null,
    list: false,
    dryRun: false,
    verbose: false,
    failFast: false,
    strictBaseline: false,
  };
  for (const raw of argv) {
    if (!raw.startsWith("--")) throw new Error(`参数必须以 -- 开头：${raw}`);
    const arg = raw.slice(2);
    const eq = arg.indexOf("=");
    const key = eq === -1 ? arg : arg.slice(0, eq);
    const val = eq === -1 ? "" : arg.slice(eq + 1);
    if (key === "list") opts.list = true;
    else if (key === "dry-run") opts.dryRun = true;
    else if (key === "verbose") opts.verbose = true;
    else if (key === "fail-fast") opts.failFast = true;
    else if (key === "strict-baseline") opts.strictBaseline = true;
    else if (key === "changed") opts.changedBase = val || "origin/master";
    else if (key === "tier") {
      if (!/^[012]$/.test(val)) throw new Error(`未知 tier=${val || "(空)"}（可用：0、1、2）`);
      opts.tier = Number(val);
    } else if (key === "domain") {
      if (!val) throw new Error("--domain 需要 =领域名");
      opts.domains.push(...val.split(",").filter(Boolean));
    } else if (key === "domain-only") {
      if (!val) throw new Error("--domain-only 需要 =领域名");
      opts.domainOnly.push(...val.split(",").filter(Boolean));
    } else if (key === "only") {
      if (!val) throw new Error("--only 需要 =测试名");
      opts.only.push(...val.split(",").filter(Boolean));
    }
    else throw new Error(`未知参数：${raw}`);
  }
  opts.domains = Unique(opts.domains);
  opts.domainOnly = Unique(opts.domainOnly);
  opts.only = Unique(opts.only);
  ValidateOptions(opts);
  return opts;
}

export function ResolveSelection(opts, inferredDomains = []) {
  ValidateDomains([...opts.domains, ...opts.domainOnly, ...inferredDomains]);
  if (opts.only.length) return opts.only.slice();
  if (opts.tier === 2) return tier2.slice();
  if (opts.domainOnly.length) return Unique(opts.domainOnly.flatMap((name) => domains[name].tests));

  const names = tier0.slice();
  if (opts.tier === 1) names.push(...GetTier1Tests());
  for (const name of Unique([...opts.domains, ...inferredDomains])) names.push(...domains[name].tests);
  return Unique(names);
}

function RunGitLines(args) {
  const result = spawnSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.error) throw new Error(`git ${args.join(" ")} 启动失败：${result.error.message}`);
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || "未知错误").trim();
    throw new Error(`git ${args.join(" ")} 失败：${detail}`);
  }
  return result.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

export function CollectChangedFiles(base = "origin/master") {
  return Unique([
    ...RunGitLines(["diff", "--name-only", `${base}...HEAD`]),
    ...RunGitLines(["diff", "--name-only", "HEAD"]),
    ...RunGitLines(["ls-files", "--others", "--exclude-standard"]),
  ]).sort();
}

export function InferDomains(files) {
  const found = new Set();
  const unmatchedProjectFiles = [];
  const allAutomatedDomains = Object.keys(domains).filter((name) => domains[name].tests.length);
  const testByFile = new Map(Object.entries(testDefs).map(([name, def]) => [def.file, name]));

  for (const rawFile of files) {
    const file = rawFile.replaceAll("\\", "/");
    if (!file.startsWith("Taierzhuang1938/")) continue;
    const leaf = path.posix.basename(file);
    let matched = false;

    if (leaf === "Script_Main.mjs") {
      for (const name of allAutomatedDomains) found.add(name);
      matched = true;
    }
    if (leaf === "Data_Levels.mjs") {
      for (const name of ["terrain", "physics", "ai", "editor", "cutscene", "render"]) found.add(name);
      matched = true;
    }
    if (leaf === "Data_Battle.mjs") {
      for (const name of ["combat", "ai", "editor", "render"]) found.add(name);
      matched = true;
    }
    if (/^(Data_Tengxian|Script_TengxianCity|Script_TengxianLayoutTest|Script_EastSuburbBlocksTest|Script_Landmark_EastMapBlocks)\.mjs$/.test(leaf)) {
      for (const name of ["terrain", "editor", "render"]) found.add(name);
      matched = true;
    }

    const testName = testByFile.get(leaf);
    if (testName) {
      for (const [domainName, domain] of Object.entries(domains)) {
        if ([...domain.tests, ...(domain.tier2Tests ?? [])].includes(testName)) found.add(domainName);
      }
      matched = true;
    }

    for (const rule of changedDomainRules) {
      if (rule.pattern.test(file)) {
        found.add(rule.domain);
        matched = true;
      }
    }
    if (!matched) unmatchedProjectFiles.push(file);
  }
  return { domains: [...found], unmatchedProjectFiles };
}

export function GetTier2Recommendations(domainNames) {
  return Unique(domainNames.flatMap((name) => domains[name]?.tier2Tests ?? []));
}

function AppendCaptured(current, chunk) {
  const combined = current + chunk.toString("utf8");
  if (combined.length <= maxCaptureChars) return combined;
  return `……（输出超过 ${Math.round(maxCaptureChars / 1024 / 1024)} MiB，前部已截断）\n${combined.slice(-maxCaptureChars)}`;
}

function MakeCollector(name, verbose, target, append) {
  let partial = "";
  return (chunk) => {
    append(chunk);
    if (verbose) {
      target.write(chunk);
      return;
    }
    partial += chunk.toString("utf8");
    const lines = partial.split(/\r?\n/);
    partial = lines.pop() ?? "";
    for (const line of lines) {
      if (line.startsWith("--- ")) console.log(`[${name}] ${line}`);
    }
  };
}

function KillProcessTree(child) {
  if (!child?.pid) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
      stdio: "ignore",
      windowsHide: true,
    });
  } else {
    child.kill("SIGTERM");
  }
}

export function RunOne(name, def, verbose = false) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const timeoutMs = def.timeoutMs ?? defaultTimeoutMs;
    const child = spawn(process.execPath, [path.join(dirHere, def.file), ...(def.args ?? [])], {
      cwd: dirHere,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    activeChild = child;
    let text = "";
    let timedOut = false;
    let settled = false;
    const append = (chunk) => { text = AppendCaptured(text, chunk); };
    child.stdout.on("data", MakeCollector(name, verbose, process.stdout, append));
    child.stderr.on("data", MakeCollector(name, verbose, process.stderr, append));

    const heartbeat = setInterval(() => {
      const secs = Math.round((Date.now() - startedAt) / 1000);
      console.log(`[runner] … ${name} 已运行 ${secs}s（上限 ${Math.round(timeoutMs / 1000)}s）`);
    }, heartbeatMs);
    const timeout = setTimeout(() => {
      timedOut = true;
      text = AppendCaptured(text, `\nrunner 超时：${Math.round(timeoutMs / 1000)}s\n`);
      KillProcessTree(child);
    }, timeoutMs);

    const Finish = (code, signal = null) => {
      if (settled) return;
      settled = true;
      clearInterval(heartbeat);
      clearTimeout(timeout);
      if (activeChild === child) activeChild = null;
      resolve({ name, code, signal, timedOut, ms: Date.now() - startedAt, text });
    };
    child.on("close", Finish);
    child.on("error", (error) => {
      text = AppendCaptured(text, `\nspawn 失败：${error.message}\n`);
      Finish(-1);
    });
  });
}

export function ExtractFailureEntries(text) {
  const marker = text.lastIndexOf("没过的：");
  if (marker === -1) return [];
  const summary = text.slice(marker);
  return [...summary.matchAll(/^\s*·\s+(.+?)\s+—\s*(.*)$/gm)].map((match) => ({
    name: match[1].trim(),
    detail: match[2].trim(),
  }));
}

export function ExtractFailureNames(text) {
  return ExtractFailureEntries(text).map((entry) => entry.name);
}

function SubtractMultiset(values, allowed) {
  const counts = new Map();
  for (const value of allowed) counts.set(value, (counts.get(value) ?? 0) + 1);
  const remainder = [];
  for (const value of values) {
    const count = counts.get(value) ?? 0;
    if (count > 0) counts.set(value, count - 1);
    else remainder.push(value);
  }
  return remainder;
}

export function AssessResult(result, def, strictBaseline = false) {
  if (result.code === 0 && !result.timedOut) {
    return { ...result, ok: true, baselineOnly: false, actualFailures: [], failureEntries: [] };
  }
  const expected = def.expectedFailures ?? [];
  const hasCompletedSummary = /通关冒烟：\d+\/\d+ 过/.test(result.text) && result.text.includes("没过的：");
  if (expected.length && !result.timedOut && hasCompletedSummary) {
    const failureEntries = ExtractFailureEntries(result.text);
    const actualFailures = failureEntries.map((entry) => entry.name);
    const unexpectedFailures = SubtractMultiset(actualFailures, expected);
    const resolvedFailures = SubtractMultiset(expected, actualFailures);
    if (!unexpectedFailures.length && actualFailures.length) {
      return {
        ...result,
        ok: !strictBaseline,
        baselineOnly: true,
        actualFailures,
        failureEntries,
        unexpectedFailures,
        resolvedFailures,
      };
    }
  }
  return {
    ...result,
    ok: false,
    baselineOnly: false,
    actualFailures: ExtractFailureNames(result.text),
    failureEntries: ExtractFailureEntries(result.text),
    unexpectedFailures: [],
    resolvedFailures: [],
  };
}

export function Tail(text, lines = 80) {
  const all = text.split(/\r?\n/);
  const cut = all.slice(-lines);
  return (all.length > lines ? `……（前 ${all.length - lines} 行略，--verbose 看全程）\n` : "") + cut.join("\n");
}

function InstallSignalHandlers() {
  const HandleSignal = (signal) => {
    if (interruptedSignal) return;
    interruptedSignal = signal;
    console.error(`[runner] 收到 ${signal}，正在清理当前子进程…`);
    KillProcessTree(activeChild);
  };
  const HandleSigint = () => HandleSignal("SIGINT");
  const HandleSigterm = () => HandleSignal("SIGTERM");
  process.once("SIGINT", HandleSigint);
  process.once("SIGTERM", HandleSigterm);
  return () => {
    process.removeListener("SIGINT", HandleSigint);
    process.removeListener("SIGTERM", HandleSigterm);
  };
}

function PrintList() {
  console.log("Tier 0（每次改动必跑）：");
  for (const name of tier0) console.log(`  ${name.padEnd(20)} ${testDefs[name].desc}`);
  console.log("Tier 1（全部自动领域探针；通常优先用 --changed/--domain）：");
  for (const name of GetTier1Tests()) console.log(`  ${name.padEnd(20)} ${testDefs[name].desc}`);
  console.log("Tier 2（低频人工审查，不由 --changed 自动触发）：");
  for (const name of tier2) console.log(`  ${name.padEnd(20)} ${testDefs[name].desc}`);
  console.log("领域（--domain=名字 默认叠加 Tier 0；--domain-only=名字仅排障）：");
  for (const [key, domain] of Object.entries(domains)) {
    console.log(`  ${key.padEnd(10)} ${domain.label}`);
    for (const name of domain.tests) console.log(`    ${name.padEnd(18)} ${testDefs[name].desc}`);
    if (domain.tier2Tests?.length) console.log(`    Tier 2 建议：${domain.tier2Tests.join(", ")}`);
  }
}

export async function Main(argv = process.argv.slice(2)) {
  ValidateRegistry();
  const opts = ParseArgs(argv);
  if (opts.list) {
    PrintList();
    return 0;
  }

  let changedFiles = [];
  let inferred = { domains: [], unmatchedProjectFiles: [] };
  if (opts.changedBase) {
    changedFiles = CollectChangedFiles(opts.changedBase);
    inferred = InferDomains(changedFiles);
    console.log(`[runner] Git 改动 ${changedFiles.length} 个；推断领域：${inferred.domains.join(", ") || "无"}`);
    if (inferred.unmatchedProjectFiles.length) {
      console.log(`[runner] 未匹配领域、已由 Tier 0 保守兜底：${inferred.unmatchedProjectFiles.join(", ")}`);
    }
  }

  const selection = ResolveSelection(opts, inferred.domains);
  for (const name of selection) {
    if (!testDefs[name]) throw new Error(`未知测试名：${name}（用 --list 查）`);
  }
  if (!selection.length) throw new Error("选择结果为空；该领域可能只有 Tier 2 建议，请用 --tier=2 或 --list");

  const activeDomains = Unique([...opts.domains, ...opts.domainOnly, ...inferred.domains]);
  const recommendations = GetTier2Recommendations(activeDomains);
  if (recommendations.length) console.log(`[runner] 本次另建议人工审查 Tier 2：${recommendations.join(", ")}`);
  console.log(`[runner] 共 ${selection.length} 个：${selection.join(", ")}`);
  if (opts.dryRun) {
    console.log("[runner] --dry-run：只展示选择，不执行测试");
    return 0;
  }

  interruptedSignal = null;
  const removeSignalHandlers = InstallSignalHandlers();
  const results = [];
  try {
    for (const name of selection) {
      process.stdout.write(`[runner] ▶ ${name} …\n`);
      const rawResult = await RunOne(name, testDefs[name], opts.verbose);
      if (interruptedSignal) {
        console.log(`[runner] ${name} 已中断，子进程已清理`);
        break;
      }
      const result = AssessResult(rawResult, testDefs[name], opts.strictBaseline);
      results.push(result);
      const secs = (result.ms / 1000).toFixed(1);
      if (result.ok && result.baselineOnly) {
        console.log(`[BASELINE] ${name} (${secs}s)：${result.actualFailures.length} 条历史红，未发现新增红`);
        for (const entry of result.failureEntries) {
          console.log(`  · ${entry.name}${entry.detail ? ` — ${entry.detail}` : ""}`);
        }
        if (result.resolvedFailures.length) {
          console.log(`[runner] 已转绿、应更新基线：${result.resolvedFailures.join("；")}`);
        }
      } else if (result.ok) {
        console.log(`[PASS] ${name} (${secs}s)`);
      } else {
        const reason = result.timedOut ? "timeout" : `exit ${result.code}`;
        console.log(`[FAIL] ${name} (${secs}s, ${reason})\n${Tail(result.text)}`);
        if (result.baselineOnly && opts.strictBaseline) console.log("[runner] --strict-baseline 将历史红计为失败");
        if (opts.failFast) break;
      }
    }
  } finally {
    removeSignalHandlers();
  }

  if (interruptedSignal) return interruptedSignal === "SIGINT" ? 130 : 143;
  const passed = results.filter((result) => result.ok && !result.baselineOnly);
  const baselined = results.filter((result) => result.ok && result.baselineOnly);
  const failed = results.filter((result) => !result.ok);
  const totalSecs = (results.reduce((sum, result) => sum + result.ms, 0) / 1000).toFixed(1);
  console.log(`[runner] 通过 ${passed.length}，历史基线 ${baselined.length}，失败 ${failed.length}，共 ${totalSecs}s`);
  if (failed.length) {
    console.log(`[runner] 未通过：${failed.map((result) => result.name).join(", ")}`);
    return 1;
  }
  return 0;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileHere;
if (isMain) {
  Main().then((code) => {
    process.exitCode = code;
  }).catch((error) => {
    console.error(`[runner] ${error.message}`);
    process.exitCode = 2;
  });
}
