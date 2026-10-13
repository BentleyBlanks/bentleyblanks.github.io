// 剖析器「录制与回放」的纯 Node 回归（不起浏览器，毫秒级）。
//
// 用假 renderer 手推帧，断的是**录制口径**，不断真实毫秒数：
//   1. 逐实例时间轴：每一对 B/E 一条样本（同名多次各是各的）、深度对、名字表对，
//      调用次数进 cpuCalls，GPU 分段逐段记了 draw；
//   2. Pause 冻住缓冲（推帧不进账）、Resume 的第一帧标 gap 且不进帧率与尖峰；
//   3. SummaryRange 单帧 / 一段与 Summary 同一口径；FindSpike 找得到手造的尖峰；
//   4. ExportRecording → JSON → ImportRecording 往返后汇总不变，导入即停录，
//      接着录会先清掉导入的帧；缓冲缩小从最老的一头丢；
//   5. 显示层：调用次数列、单帧时间轴文本；命令行 --print=<录制> --frame / --range 能读；
//   6. 第四版：帧状态过滤、阶段/事件标记、计数器、stat unit 结论、刷新率与卡顿、1 版录制推断、
//      JS 采样按桶归属、draw 清单分组、命令行 --all-frames。
//
// 用法：node Taierzhuang1938/Script_ProfilerRecordingTest.mjs

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { FrameProfiler, RECORDING_FORMAT, IsLiveFrame, IsActiveFrame, SummarizeFrames, EstimateVsyncMs } from "./Script_Profiler.mjs";
import { CpuRows, FormatSnapshot, FormatFrameTimeline, DecodeSamples } from "./Script_ProfilerReport.mjs";
import { FoldTrace } from "./Script_ProfilerSampler.mjs";

const project = path.dirname(fileURLToPath(import.meta.url));
let failed = 0;
const Check = (name, ok, detail = "") => {
  if (!ok) failed += 1;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` (${detail})` : ""}`);
};

function FakeRenderer() {
  const info = {
    autoReset: true,
    render: { calls: 0, triangles: 0 },
    programs: [],
    reset() { this.render.calls = 0; this.render.triangles = 0; },
  };
  return {
    info,
    shadowMap: { enabled: true, render() {} },
    getContext: () => ({ getExtension: () => null, deleteQuery() {} }),
  };
}

/** 真的占一点主线程时间，让样本时长不是 0。 */
function Busy(ms) {
  const until = performance.now() + ms;
  let x = 0;
  while (performance.now() < until) x += 1;
  return x;
}

const renderer = FakeRenderer();
const proto = { updateMatrixWorld() {}, updateWorldMatrix() {}, traverse() {} };
const profiler = new FrameProfiler(renderer, { object3D: proto });
let clock = 1000;

/** 一帧：ai（三个兵各一次 ai/act）+ post（GPU 帧里一个 main 段）。 */
function StepFrame(intervalMs = 16.7) {
  clock += intervalMs;
  profiler.BeginFrame(clock);
  profiler.B("ai");
  for (let i = 0; i < 3; i += 1) {
    profiler.B("ai/act");
    Busy(0.05);
    profiler.E("ai/act");
  }
  profiler.E("ai");
  profiler.B("post");
  profiler.GpuFrameStart();
  profiler.GpuPush("main");
  renderer.info.render.calls += 5;
  renderer.info.render.triangles += 1200;
  Busy(0.05);
  profiler.GpuPop();
  profiler.GpuFrameEnd();
  profiler.E("post");
  profiler.EndFrame();
}

profiler.Enable();
Check("Enable 后在录", profiler.on && profiler.recording);
for (let i = 0; i < 20; i += 1) StepFrame(i === 9 ? 60 : 16.7);
const history = profiler.history;
Check("推 20 帧记 20 条", history.length === 20, `len=${history.length}`);

// --- 1. 逐实例时间轴 ---
const record = history[5];
const samples = DecodeSamples(record, profiler.names);
const acts = samples.filter((row) => row.key === "ai/act");
const ai = samples.find((row) => row.key === "ai");
Check("同名多次各记一条样本（ai/act ×3）", acts.length === 3, `acts=${acts.length}`);
Check("样本深度对（ai=0，ai/act=1）", ai && ai.depth === 0 && acts.every((row) => row.depth === 1),
  samples.map((row) => `${row.key}@${row.depth}`).join(","));
Check("子样本落在父样本区间里", ai && acts.every((row) => row.start >= ai.start - 1e-3
  && row.start + row.duration <= ai.start + ai.duration + 1e-3));
Check("样本时长为正", acts.every((row) => row.duration > 0));
Check("调用次数进了 cpuCalls", record.cpuCalls && record.cpuCalls["ai/act"] === 3 && record.cpuCalls.ai === 1,
  JSON.stringify(record.cpuCalls));
Check("样本是 typed array（B/E 里不分配）", record.samples instanceof Float32Array);
const segNames = [];
for (let i = 0; i < (record.gpuSegs?.length || 0); i += 5) segNames.push(profiler.names[record.gpuSegs[i]]);
Check("GPU 分段逐段记录（misc/main/misc）", segNames.includes("main") && segNames.includes("misc"), segNames.join(","));
const mainSeg = record.gpuSegs ? [...Array(record.gpuSegs.length / 5).keys()]
  .map((slot) => record.gpuSegs.subarray(slot * 5, slot * 5 + 5))
  .find((seg) => profiler.names[seg[0]] === "main") : null;
Check("GPU 分段记了 draw 与三角", mainSeg && mainSeg[3] === 5 && mainSeg[4] === 1200,
  mainSeg ? `draw=${mainSeg[3]} tris=${mainSeg[4]}` : "无 main 段");

// --- 3. 按帧号汇总 / 尖峰 ---
const single = profiler.SummaryRange(record.id);
Check("SummaryRange 单帧只有一帧", single.frames === 1 && single.firstId === record.id && single.lastId === record.id);
Check("单帧的桶数等于记录本身", Math.abs(single.cpu.ai.avg - record.cpu.ai) < 1e-9 && single.cpu.ai.max === single.cpu.ai.avg);
Check("单帧汇总带调用次数", single.cpuCalls["ai/act"]?.avg === 3);
const range = profiler.SummaryRange(history[2].id, history[6].id);
Check("SummaryRange 一段帧数对", range.frames === 5, `frames=${range.frames}`);
const spike = profiler.FindSpike(-1, 1);
Check("FindSpike 找到手造的 60 ms 尖峰", spike === 9, `index=${spike} interval=${history[spike]?.interval}`);
Check("往后没有第二个尖峰", profiler.FindSpike(spike, 1) === -1);
Check("最差帧就是尖峰那一帧", profiler.Summary(60).worst?.id === history[9].id);

// --- 2. 暂停 / 继续 ---
profiler.Pause();
const revision = profiler.revision;
for (let i = 0; i < 5; i += 1) StepFrame();
Check("暂停后推帧不进账", profiler.history.length === 20 && profiler.revision === revision,
  `len=${profiler.history.length}`);
Check("暂停时钩子还在", profiler.on && proto.updateMatrixWorld.name === "ProfiledUpdateMatrixWorld");
profiler.Resume();
StepFrame(5000);
StepFrame();
const gapRow = profiler.history[20];
Check("继续录制的第一帧标 gap", gapRow && gapRow.gap === true && !IsLiveFrame(gapRow));
Check("gap 帧后面的帧照常是活帧", IsLiveFrame(profiler.history[21]));
Check("gap 帧不算尖峰", profiler.FindSpike(19, 1) === -1);

// --- 4. 存读往返 ---
const exported = profiler.ExportRecording({ label: "unit" });
const json = JSON.stringify(exported);
const parsed = JSON.parse(json);
Check("录制文件带格式名与名字表", parsed.format === RECORDING_FORMAT && parsed.names.includes("ai/act"));
const replay = new FrameProfiler(null);
const imported = replay.ImportRecording(parsed, "unit.json");
Check("导入帧数一致", imported === profiler.history.length, `${imported} vs ${profiler.history.length}`);
const before = profiler.SummaryRange(history[3].id, history[8].id);
const after = replay.SummaryRange(history[3].id, history[8].id);
Check("往返后汇总一致（三位小数内）", Math.abs(before.cpu.ai.avg - after.cpu.ai.avg) < 2e-3
  && before.frames === after.frames, `${before.cpu.ai.avg} vs ${after.cpu.ai.avg}`);
Check("往返后样本还是 typed array", replay.history[5].samples instanceof Float32Array);
Check("往返后 gap 标记还在", replay.history[20].gap === true);
Check("导入记下来源", replay.source && replay.source.label === "unit.json");

profiler.ImportRecording(parsed, "again");
Check("在录的剖析器导入即停录", profiler.on && !profiler.recording);
profiler.Resume();
Check("接着录先清掉导入的帧", profiler.history.length === 0 && profiler.source === null);

// 缓冲缩小 / 环形淘汰
profiler.SetHistoryMax(10);
Check("缓冲帧数有下限", profiler.historyMax === 60, `historyMax=${profiler.historyMax}`);
for (let i = 0; i < 70; i += 1) StepFrame();
Check("满了从最老的一头丢", profiler.history.length === 60 && profiler.IndexOfId(profiler.frameId - 60) < 0
  && profiler.IndexOfId(profiler.frameId) === 59);

// --- 5. 显示层与命令行 ---
const summary = profiler.Summary(60);
const cpuRows = CpuRows(summary);
Check("CPU 表行带调用次数", cpuRows.find((row) => row.key === "ai/act")?.calls === 3);
Check("文本表有「调用/帧」列", FormatSnapshot({ label: "unit", summary }).includes("调用/帧"));
const timeline = FormatFrameTimeline(profiler.history[10], profiler.names);
Check("单帧时间轴文本列出实例与 GPU 段", timeline.includes("ai/act") && timeline.includes("GPU 分段"), timeline.split("\n")[0]);
Check("SummarizeFrames 空数组不炸", SummarizeFrames([]).frames === 0);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "profiler-rec-"));
const file = path.join(tmp, "Profile_unit.rec.json");
fs.writeFileSync(file, JSON.stringify(profiler.ExportRecording({ label: "unit" })));
const cli = path.join(project, "Script_ProfileCli.mjs");
const firstId = profiler.history[0].id;
const worstRun = spawnSync(process.execPath, [cli, `--print=${file}`, "--frame=worst"], { encoding: "utf8" });
Check("命令行 --frame=worst 读录制", worstRun.status === 0 && worstRun.stdout.includes("时间轴 · 第 #"),
  `code=${worstRun.status} ${worstRun.stderr.slice(0, 200)}`);
const rangeRun = spawnSync(process.execPath, [cli, `--print=${file}`, `--range=${firstId}-${firstId + 4}`], { encoding: "utf8" });
Check("命令行 --range 只汇总那一段", rangeRun.status === 0 && rangeRun.stdout.includes(`帧号 #${firstId}–#${firstId + 4}`),
  `code=${rangeRun.status} ${rangeRun.stderr.slice(0, 200)}`);
const missRun = spawnSync(process.execPath, [cli, `--print=${file}`, "--frame=1"], { encoding: "utf8" });
Check("命令行要一帧不在录制里时报错退出", missRun.status === 2);
fs.rmSync(tmp, { recursive: true, force: true });

// --- 6. 第四版：帧状态 / 阶段 / 计数器 / 事件 / stat unit / 卡顿 / 旧录制推断 / 采样归属 ---
profiler.Clear();
let counterValue = 0;
profiler.AddCounter("unit.value", () => (counterValue += 1), { label: "单元计数", group: "测试" });
profiler.AddCounter("unit.broken", () => { throw new Error("坏计数器"); }, { label: "坏的" });
profiler.SetFrameContext("play", "MachineGun");
for (let i = 0; i < 12; i += 1) StepFrame(10);
profiler.SetFrameContext("paused", "MachineGun");
for (let i = 0; i < 6; i += 1) StepFrame(10);
profiler.SetFrameContext("play", "Tank");
profiler.Mark("explosion", "grenade");
for (let i = 0; i < 12; i += 1) StepFrame(i === 5 ? 120 : 10);
const v4 = profiler.Summary(60);
Check("帧状态记进每一帧", profiler.history.some((row) => row.state === "paused") && profiler.history.some((row) => row.state === "play"));
Check("汇总只算游戏中的帧（暂停帧排除）", v4.excluded === 6 && v4.states.paused === 6 && v4.frames === 24,
  `frames=${v4.frames} excluded=${v4.excluded} states=${JSON.stringify(v4.states)}`);
Check("阶段一变自动打 stage 标记", v4.marks.some((mark) => mark.kind === "stage" && mark.label === "Tank"),
  JSON.stringify(v4.marks));
Check("Mark 进了事件表", v4.marks.some((mark) => mark.kind === "explosion" && mark.label === "grenade"));
Check("阶段序列", v4.stages.join(",") === "MachineGun,Tank", v4.stages.join(","));
const ctrRows = profiler.history.filter((row) => row.ctr);
Check("计数器隔 COUNTER_EVERY 帧取一次", ctrRows.length >= 4 && ctrRows.length <= 6, `ctr 帧=${ctrRows.length}`);
Check("坏计数器记 NaN、不拖垮整帧", ctrRows.every((row) => Number.isNaN(row.ctr[1])));
Check("计数器汇总有 avg/min/max", v4.counters.some((row) => row.name === "单元计数" && row.max > row.min),
  JSON.stringify(v4.counters));
Check("stat unit：渲染提交 = post 桶", Math.abs(v4.unit.draw.avg - v4.cpu.post.avg) < 1e-6,
  `draw=${v4.unit.draw.avg} post=${v4.cpu.post.avg}`);
Check("stat unit 给出结论（没有 GPU 读数时在 CPU 两边里选）", ["game", "draw"].includes(v4.unit.bottleneck), v4.unit.bottleneck);
Check("100 Hz 的帧间隔估出 10 ms 周期", Math.abs(v4.hitch.vsyncMs - 10) < 1e-6, `vsync=${v4.hitch.vsyncMs}`);
Check("120 ms 的那一帧记一次 ≥100 ms 卡顿", v4.hitch.major === 1, JSON.stringify(v4.hitch));
Check("掉 vsync 计数（120 ms = 掉 11 个）", v4.hitch.missedVsync >= 11, `missed=${v4.hitch.missedVsync}`);
Check("60 Hz 间隔估出 16.7 ms", Math.abs(EstimateVsyncMs(Array.from({ length: 60 }, (_, i) => (i % 5 ? 16.7 : 33.3))) - 1000 / 60) < 0.01);
Check("目标帧率覆盖预算线", SummarizeFrames(profiler.history, { targetFps: 60 }).hitch.budgetMs === 1000 / 60);
const report = await import("./Script_ProfilerReport.mjs");
Check("结论句子", report.UnitLine(v4).startsWith("卡在 CPU"), report.UnitLine(v4));
Check("卡顿句子", report.HitchLine(v4).includes("100 Hz"), report.HitchLine(v4));
Check("帧状态句子", report.StateLine(v4).includes("暂停 6"), report.StateLine(v4));
Check("文本快照有「结论（stat unit）」段", FormatSnapshot({ label: "v4", summary: v4 }).includes("结论（stat unit）"));
// v2 录制往返：state / stage / ctr / marks / 计数器名表
const v2 = JSON.parse(JSON.stringify(profiler.ExportRecording({ label: "v2" })));
Check("录制版本 2、带计数器名表", v2.version === 2 && v2.counters[0].label === "单元计数");
const replay2 = new FrameProfiler(null);
replay2.ImportRecording(v2, "v2.json");
const after2 = replay2.Summary(60);
Check("v2 往返后状态过滤与计数器一致", after2.excluded === 6 && after2.counters.some((row) => row.name === "单元计数"),
  `excluded=${after2.excluded}`);
// 1 版录制没有 state：主线程没干活、一个桶都没有的帧推断为暂停
const v1Frames = [
  ...Array.from({ length: 10 }, (_, i) => ({ id: i + 1, t: i * 10, interval: 10, cpuMs: 0, cpu: {}, other: 0 })),
  ...Array.from({ length: 10 }, (_, i) => ({ id: i + 11, t: 100 + i * 40, interval: 40, cpuMs: 30, cpu: { post: 20, ai: 8 }, other: 2 })),
];
const v1 = SummarizeFrames(v1Frames);
Check("旧录制：空转帧推断为暂停并排除", v1.excluded === 10 && v1.frames === 10 && v1.unit.bottleneck === "draw",
  `excluded=${v1.excluded} bottleneck=${v1.unit.bottleneck}`);
Check("旧录制：IsActiveFrame 对空转帧为假", !IsActiveFrame(v1Frames[0]) && IsActiveFrame(v1Frames[15]));
// JS 采样的按桶归属：样本时刻落进哪一帧、哪一条 B/E
const sampleNames = ["ai", "ai/act", "post"];
const fakeFrames = [{ id: 1, t0: 1000, cpuMs: 20,
  samples: Float32Array.from([0, 0, 0, 8, 1, 1, 1, 5, 2, 0, 10, 9]) }];
const trace = {
  resources: ["http://x/Taierzhuang1938/Script_Ai.mjs?v=1", "http://x/three.module.js"],
  frames: [{ name: "Act", resourceId: 0, line: 10 }, { name: "projectObject", resourceId: 1, line: 20 }, { name: "Update", resourceId: 0, line: 5 }],
  stacks: [{ frameId: 2 }, { frameId: 0, parentId: 0 }, { frameId: 1 }],
  samples: [
    { timestamp: 1002, stackId: 1 },   // ai/act 里（深度 1 赢过 ai）
    { timestamp: 1007, stackId: 0 },   // ai 自身
    { timestamp: 1012, stackId: 2 },   // post
    { timestamp: 1025 },               // 帧外、非 JS
  ],
};
const folded = FoldTrace(trace, { frames: fakeFrames, names: sampleNames });
const bucketOf = (key) => folded.buckets.find((bucket) => bucket.key === key);
Check("采样归属：ai/act 最深的那一条赢", bucketOf("ai/act")?.samples === 1 && bucketOf("ai")?.samples === 1
  && bucketOf("post")?.samples === 1, JSON.stringify(folded.buckets.map((b) => [b.key, b.samples])));
Check("采样：自身耗时表头是 Act/Update/projectObject", folded.self.length === 3 && folded.total.some((row) => row.name === "Update" && row.samples === 2));
Check("采样：非 JS 样本单独计数", folded.idleSamples === 1);
Check("采样文本可排", report.FormatSampler(folded).includes("按桶归属"));
// 逐 draw 清单分组
const draws = [
  { pass: "main", top: "A", material: "m1", materialType: "MeshStandardMaterial", materialId: 1, tris: 10, instances: 1, us: 20, matSwitch: true },
  { pass: "main", top: "A", material: "m1", materialType: "MeshStandardMaterial", materialId: 1, tris: 10, instances: 1, us: 5, matSwitch: false },
  { pass: "prepass", top: "B", material: "m2", materialType: "ShaderMaterial", materialId: 2, tris: 5, instances: 3, us: 4, matSwitch: true },
];
const byTop = report.GroupDraws(draws, "top");
Check("draw 清单按子树分组", byTop[0].key === "A" && byTop[0].draws === 2 && byTop[0].materials === 1 && byTop[0].matSwitches === 1);
Check("draw 清单文本可排", report.FormatDrawCapture({ id: 7, draws }).includes("顶层子树"));
// 命令行读 v2 录制：结论段与「排除暂停帧」
const tmp2 = fs.mkdtempSync(path.join(os.tmpdir(), "profiler-v2-"));
const file2 = path.join(tmp2, "Profile_v2.rec.json");
fs.writeFileSync(file2, JSON.stringify(v2));
const v2Run = spawnSync(process.execPath, [cli, `--print=${file2}`], { encoding: "utf8" });
Check("命令行读 v2 录制打出结论与帧状态", v2Run.status === 0 && v2Run.stdout.includes("结论（stat unit）")
  && v2Run.stdout.includes("排除 6 帧"), `code=${v2Run.status} ${v2Run.stderr.slice(0, 200)}`);
const allRun = spawnSync(process.execPath, [cli, `--print=${file2}`, "--all-frames"], { encoding: "utf8" });
Check("--all-frames 连暂停帧一起算", allRun.status === 0 && allRun.stdout.includes("全部 30 帧"), allRun.stdout.split("\n").find((l) => l.includes("帧：")) || "");
fs.rmSync(tmp2, { recursive: true, force: true });

// --- 关 ---
profiler.Disable();
const length = profiler.history.length;
StepFrame();
Check("Disable 后不再记帧、原型还原", !profiler.recording && profiler.history.length === length
  && proto.updateMatrixWorld.name !== "ProfiledUpdateMatrixWorld");

process.exit(failed ? 1 : 0);
