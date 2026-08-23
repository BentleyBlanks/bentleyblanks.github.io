// ===========================================================================
// Script_TestRunner.mjs —— 台儿庄白盒的测试分级入口
//
// 22 个测试不该每次全跑，也不该靠人肉记“改了 X 要跑哪几个”。
// 这里按爆炸半径分三档，一次说清：
//
//   Tier 0（每次改动必跑）: BootTest + PlayTest + 两个纯 Node 测试。
//       PlayTest 是真浏览器端到端通关（输入→开火→AI→目标点→阵亡→过关），
//       跨模块回归由它兜底——不管你在哪个模块改的代码。
//   Tier 1（按领域触发，--domain=…）: 只在深碰某子系统时加跑深度探针。
//       共享底座（高度图/物理）的领域串着下游一起跑；叶子系统（音频/语音/
//       编辑器）碰了才跑。
//   Tier 2（低频人工）: 出图与性能红线，对机器敏感、要人看，不进常规回归。
//
// 用法：
//   node Taierzhuang1938/Script_TestRunner.mjs                 # = --tier=0
//   node Taierzhuang1938/Script_TestRunner.mjs --tier=2        # 低频审查类
//   node Taierzhuang1938/Script_TestRunner.mjs --domain=terrain # 领域专项
//   node Taierzhuang1938/Script_TestRunner.mjs --only=PlayTest  # 单挑一个
//   node Taierzhuang1938/Script_TestRunner.mjs --list           # 列出全部分级
//
// 输出纪律：子进程输出默认只留失败尾巴（省 token），--verbose 才透传全程。
// 分级依据详见 docs/Data_TestTiers.md。worktree 里直接 node 本脚本，
// 不要经 npm run（npm 会把 cwd 挪回主仓库，测的是另一棵树）。
// ===========================================================================

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DirHere = path.dirname(fileURLToPath(import.meta.url));

const TestDefs = {
  BootTest: { file: "Script_BootTest.mjs", desc: "七关开机冒烟 + draw call/triangles 红线" },
  PlayTest: { file: "Script_PlayTest.mjs", desc: "真浏览器端到端通关，15 组断言，跨模块安全网" },
  HudPromptTest: { file: "Script_HudPromptTest.mjs", desc: "HUD 提示规则（纯 Node，秒级）" },
  RiggedModelTest: { file: "Script_RiggedModelTest.mjs", desc: ".tzm.json 绑定模型数据（纯 Node，秒级）" },
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
  SprintCrosshairTest: { file: "Script_SprintCrosshairTest.mjs", desc: "冲刺动态准星（真 Shift+W 路径）" },
  SprintViewmodelTest: { file: "Script_SprintViewmodelTest.mjs", desc: "冲刺第一人称持械视觉回归" },
  HudPromptBrowserTest: { file: "Script_HudPromptBrowserTest.mjs", desc: "HUD 提示真浏览器交互" },
  JieheTerrainTest: { file: "Script_JieheTerrainTest.mjs", desc: "界河高度图采样与贴地" },
  HeightmapVerify: { file: "Script_HeightmapCli.mjs", args: ["verify"], desc: "SRTM 高度数据完整性（需先 download 过）" },
  AudioTest: { file: "Script_AudioTest.mjs", desc: "音频资产与烘焙管线" },
  VoiceTest: { file: "Script_VoiceTest.mjs", desc: "语音资产与降级链" },
  MenuTest: { file: "Script_MenuTest.mjs", desc: "主菜单接线 29 条" },
  BootPropTest: { file: "Script_BootPropTest.mjs", desc: "开机陈设道具计数" },
  EditorTest: { file: "Script_EditorTest.mjs", desc: "编辑器套件（phase=5 十字街）44+ 项" },
  DestructionEditorTest: { file: "Script_DestructionEditorTest.mjs", desc: "可破坏预览编辑器：真实七关 + 承重白名单" },
  ActorBatchTest: { file: "Script_ActorBatchTest.mjs", desc: "人物合批：逐像素无损 + 真省 draw call" },
  ActorPoseTest: { file: "Script_ActorPoseTest.mjs", desc: "车厢生活动作模块冒烟（Chromium 加载本地模块）" },
  GiTest: { file: "Script_GiTest.mjs", desc: "全局光照开关对照" },
  PerformanceTest: { file: "Script_PerformanceTest.mjs", desc: "帧率/负载实测（对机器敏感）" },
  FrameProfileTest: { file: "Script_FrameProfileTest.mjs", desc: "整帧 CPU/GPU 剖析消融（对机器敏感）" },
  GodRaysPerformanceTest: { file: "Script_GodRaysPerformanceTest.mjs", desc: "体积光方向性性能回归（对机器敏感）" },
  DeathViewTest: { file: "Script_DeathViewTest.mjs", desc: "阵亡镜头出图（人工审）" },
  ShotTest: { file: "Script_ShotTest.mjs", args: ["_shots"], desc: "逐关逐机位实拍出图（人工审）" },
};

const Tier0 = ["BootTest", "PlayTest", "HudPromptTest", "RiggedModelTest", "FractureBakeTest", "CutsceneControlTest"];
const Tier2 = ["ShotTest", "GiTest", "PerformanceTest", "DeathViewTest", "FrameProfileTest", "GodRaysPerformanceTest"];

const Domains = {
  terrain: {
    label: "高度图/地形（共享底座，下游成串跑）",
    tests: ["HeightmapVerify", "JieheTerrainTest", "PhysicsTest", "JumpTest", "DestructionTest"],
  },
  physics: {
    label: "物理/移动/破坏（共享底座，下游成串跑）",
    tests: ["PhysicsTest", "JumpTest", "DestructionTest", "FractureBakeTest"],
  },
  combat: {
    label: "武器/伤害/枪感/瞄准（共享底座，碰弹道或输入要跑全串）",
    tests: ["DamageTest", "GunFeelTest", "FixedCenterAimTest", "ReticleCalibrationTest", "SprintCrosshairTest", "SprintViewmodelTest"],
  },
  ai: { label: "AI 与战场内容预算", tests: ["AiBehaviorTest", "VisibilityTest"] },
  hud: { label: "HUD/交互提示", tests: ["HudPromptTest", "HudPromptBrowserTest"] },
  audio: { label: "音效/音乐/环境声", tests: ["AudioTest"] },
  voice: { label: "语音", tests: ["VoiceTest"] },
  menu: { label: "主菜单/开机陈设", tests: ["MenuTest", "BootPropTest"] },
  editor: { label: "场景编辑器/可破坏编辑器", tests: ["EditorTest", "DestructionEditorTest"] },
  cutscene: { label: "过场/车厢生活动作", tests: ["CutsceneControlTest", "ActorPoseTest"] },
  render: {
    label: "渲染/GI/视觉审查（ActorBatch 是产品契约，其余人工审）",
    tests: ["GiTest", "ActorBatchTest", "DeathViewTest", "ShotTest"],
  },
  perf: { label: "性能红线实测", tests: ["PerformanceTest", "FrameProfileTest", "GodRaysPerformanceTest"] },
};

function ParseArgs(argv) {
  const opts = { tier: null, domains: [], only: [], list: false, verbose: false, failFast: false };
  for (const raw of argv) {
    const arg = raw.replace(/^--/, "");
    const eq = arg.indexOf("=");
    const key = eq === -1 ? arg : arg.slice(0, eq);
    const val = eq === -1 ? "" : arg.slice(eq + 1);
    if (key === "list") opts.list = true;
    else if (key === "verbose") opts.verbose = true;
    else if (key === "fail-fast") opts.failFast = true;
    else if (key === "tier") opts.tier = Number(val);
    else if (key === "domain") opts.domains.push(...val.split(",").filter(Boolean));
    else if (key === "only") opts.only.push(...val.split(",").filter(Boolean));
    else throw new Error(`未知参数：${raw}`);
  }
  return opts;
}

function ResolveSelection(opts) {
  let names = [];
  if (opts.only.length) names = opts.only;
  else if (opts.tier === 0 || (opts.tier === null && !opts.domains.length)) names = Tier0.slice();
  else if (opts.tier === 2) names = Tier2.slice();
  else if (opts.tier !== null) throw new Error(`未知 tier=${opts.tier}（可用：0、2；领域用 --domain=…）`);
  for (const d of opts.domains) {
    if (!Domains[d]) throw new Error(`未知 domain=${d}（用 --list 查）`);
    names.push(...Domains[d].tests);
  }
  const seen = new Set();
  return names.filter((n) => (seen.has(n) ? false : (seen.add(n), true)));
}

function RunOne(name, def, verbose) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const child = spawn(process.execPath, [path.join(DirHere, def.file), ...(def.args ?? [])], {
      cwd: DirHere,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    const chunks = [];
    const collect = (chunk) => {
      chunks.push(chunk);
      if (verbose) process.stdout.write(chunk);
    };
    child.stdout.on("data", collect);
    child.stderr.on("data", collect);
    child.on("close", (code) => resolve({
      name, code, ms: Date.now() - startedAt,
      text: Buffer.concat(chunks).toString("utf8"),
    }));
    child.on("error", (err) => resolve({
      name, code: -1, ms: Date.now() - startedAt,
      text: `spawn 失败：${err.message}\n`,
    }));
  });
}

function Tail(text, lines = 60) {
  const all = text.split(/\r?\n/);
  const cut = all.slice(-lines);
  return (all.length > lines ? `……（前 ${all.length - lines} 行略，--verbose 看全程）\n` : "") + cut.join("\n");
}

async function main() {
  const opts = ParseArgs(process.argv.slice(2));
  if (opts.list) {
    console.log("Tier 0（每次改动必跑）：");
    for (const n of Tier0) console.log(`  ${n.padEnd(20)} ${TestDefs[n].desc}`);
    console.log("Tier 2（低频人工审查）：");
    for (const n of Tier2) console.log(`  ${n.padEnd(20)} ${TestDefs[n].desc}`);
    console.log("领域（--domain=名字）：");
    for (const [key, dom] of Object.entries(Domains)) {
      console.log(`  ${key.padEnd(10)} ${dom.label}`);
      for (const n of dom.tests) console.log(`    ${n.padEnd(18)} ${TestDefs[n].desc}`);
    }
    console.log("其余单项（--only=名字）：");
    for (const n of Object.keys(TestDefs).filter((k) => !Tier0.includes(k) && !Tier2.includes(k))) {
      console.log(`  ${n.padEnd(20)} ${TestDefs[n].desc}`);
    }
    return;
  }

  const selection = ResolveSelection(opts);
  for (const n of selection) {
    if (!TestDefs[n]) throw new Error(`未知测试名：${n}（用 --list 查）`);
  }
  console.log(`[runner] 共 ${selection.length} 个：${selection.join(", ")}`);

  const results = [];
  for (const name of selection) {
    process.stdout.write(`[runner] ▶ ${name} …\n`);
    const result = await RunOne(name, TestDefs[name], opts.verbose);
    results.push(result);
    const secs = (result.ms / 1000).toFixed(1);
    if (result.code === 0) console.log(`[PASS] ${name} (${secs}s)`);
    else {
      console.log(`[FAIL] ${name} (${secs}s, exit ${result.code})\n${Tail(result.text)}`);
      if (opts.failFast) break;
    }
  }

  const failed = results.filter((r) => r.code !== 0);
  const totalSecs = (results.reduce((s, r) => s + r.ms, 0) / 1000).toFixed(1);
  console.log(`[runner] ${results.length - failed.length}/${results.length} 通过，共 ${totalSecs}s`);
  if (failed.length) {
    console.log(`[runner] 未通过：${failed.map((r) => r.name).join(", ")}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(`[runner] ${err.message}`);
  process.exit(2);
});
