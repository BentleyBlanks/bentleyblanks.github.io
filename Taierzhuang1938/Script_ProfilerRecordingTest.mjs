// 剖析器「录制与回放」的纯 Node 回归（不起浏览器，毫秒级）。
//
// 用假 renderer 手推帧，断的是**录制口径**，不断真实毫秒数：
//   1. 逐实例时间轴：每一对 B/E 一条样本（同名多次各是各的）、深度对、名字表对，
//      调用次数进 cpuCalls，GPU 分段逐段记了 draw；
//   2. Pause 冻住缓冲（推帧不进账）、Resume 的第一帧标 gap 且不进帧率与尖峰；
//   3. SummaryRange 单帧 / 一段与 Summary 同一口径；FindSpike 找得到手造的尖峰；
//   4. ExportRecording → JSON → ImportRecording 往返后汇总不变，导入即停录，
//      接着录会先清掉导入的帧；缓冲缩小从最老的一头丢；
//   5. 显示层：调用次数列、单帧时间轴文本；命令行 --print=<录制> --frame / --range 能读。
//
// 用法：node Taierzhuang1938/Script_ProfilerRecordingTest.mjs

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { FrameProfiler, RECORDING_FORMAT, IsLiveFrame, SummarizeFrames } from "./Script_Profiler.mjs";
import { CpuRows, FormatSnapshot, FormatFrameTimeline, DecodeSamples } from "./Script_ProfilerReport.mjs";

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

// --- 关 ---
profiler.Disable();
const length = profiler.history.length;
StepFrame();
Check("Disable 后不再记帧、原型还原", !profiler.recording && profiler.history.length === length
  && proto.updateMatrixWorld.name !== "ProfiledUpdateMatrixWorld");

process.exit(failed ? 1 : 0);
