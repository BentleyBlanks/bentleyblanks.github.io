// 《台儿庄：血战滕县》性能剖析命令行：起一次浏览器、摆好机位、开剖析器、跑一段，
// 然后把**和编辑器面板一模一样的那几张表**打到终端上。
//
// 面板是边玩边看用的，命令行是「在会话里把数字贴出来」用的：两边读的是同一份
// `profiler.Summary()`，排版走同一个 Script_ProfilerReport，所以不会出现
// 「面板说 12 ms、脚本说 9 ms」这种谁也说服不了谁的局面。
//
// ## 用法
//   node Taierzhuang1938/Script_ProfileCli.mjs --view=bunker --frames=300 --label=bunker_after
//   node Taierzhuang1938/Script_ProfileCli.mjs --view=front --live --seconds=8
//   node Taierzhuang1938/Script_ProfileCli.mjs --stage=14 --view=front --cpuprofile
//   node Taierzhuang1938/Script_ProfileCli.mjs --print=Taierzhuang1938/_shots/Profile/Profile_x.json
//   node Taierzhuang1938/Script_ProfileCli.mjs --view=front --live --seconds=8 --record --label=front
//   node Taierzhuang1938/Script_ProfileCli.mjs --print=Taierzhuang1938/_shots/Profile/Profile_front.rec.json --frame=worst
//
//   --view=bunker|front|frontEast|x,y,z,yaw,pitch  机位（三个预设与 Script_FirstLevelFrameProbe 共用）
//   --stage=<编号或 id>    第一关阶段跳转（docs/Data_FirstLevelStageJump.md 的 missionStage）
//   --url=a=1&b=2          原样追加到 `?whitebox=p012` 后面
//   --frames=300           StepFrames（dt=1/60），每帧让出一个 event-loop turn 收 GPU 查询
//   --live --seconds=5     不用 StepFrames，跑真实 rAF
//   --quality=high --width=3394 --height=1348    用户那台机器的窗口与画质
//   --label=名字 --json=路径                      落盘（默认 _shots/Profile/Profile_<label>.json）
//   --print=路径           只读回一份 JSON 打表，不起浏览器（面板的「导出快照 JSON」也能读）
//   --record               另存整条逐帧录制 Profile_<label>.rec.json（面板「加载录制」能读回来逐帧翻）
//   --frame=<帧号|worst>   与 --print=<录制文件> 连用：只看这一帧的表 + 时间轴（最长的 B/E 实例与 GPU 分段）
//   --range=<a-b>          与 --print=<录制文件> 连用：只汇总帧号 a 到 b（面板「拖选一段」同一口径）
//   --cpuprofile           CDP 采样剖析，另打「自身耗时前 40」
//
// ## 读数注意
// `--frames` 那条路每帧要让出一次 event-loop（否则 GPU 计时查询永远收不回来），
// 所以**整帧间隔不是真帧率**；要看帧率用 `--live`。主线程分桶、提交量、GPU 逐 pass
// 三张表两条路都可信。这台机器上常年有别的 agent 在跑浏览器，墙钟数字会偏大。

import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";
import { MISSION_ANCHORS, PoseView, ParseCustomView, FoldProfile } from "./Script_FrameProbeViews.mjs";
import { FormatSnapshot, FormatFrameTimeline } from "./Script_ProfilerReport.mjs";
import { RECORDING_FORMAT, FramesFromRecording, SummarizeFrames } from "./Script_Profiler.mjs";

const project = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(project, "..");
const argv = process.argv.slice(2);
const Arg = (key, fallback) => {
  const hit = argv.find((item) => item.startsWith(`--${key}=`));
  return hit === undefined ? fallback : hit.slice(key.length + 3);
};

const PRINT = Arg("print", "");
if (PRINT) {
  const snapshot = JSON.parse(await fs.readFile(path.resolve(PRINT), "utf8"));
  if (snapshot.format === RECORDING_FORMAT) { PrintRecording(snapshot); process.exit(0); }
  console.log(FormatSnapshot(snapshot));
  if (snapshot.cpuProfile) PrintCpuProfile(snapshot.cpuProfile);
  process.exit(0);
}

const label = Arg("label", "profile");
const viewArg = Arg("view", "bunker");
const stage = Arg("stage", "");
const extra = Arg("url", "");
const frames = Number(Arg("frames", "300"));
const LIVE = argv.includes("--live");
const seconds = Number(Arg("seconds", "5"));
const quality = Arg("quality", "high");
const width = Number(Arg("width", "3394"));
const height = Number(Arg("height", "1348"));
const CPU_PROFILE = argv.includes("--cpuprofile");
const RECORD = argv.includes("--record");
const custom = ["bunker", "front", "frontEast"].includes(viewArg) ? null : ParseCustomView(viewArg);
if (!custom && !["bunker", "front", "frontEast"].includes(viewArg)) {
  console.error(`--view 只认 bunker / front / frontEast 或 "x,y,z,yaw,pitch"，收到：${viewArg}`);
  process.exit(2);
}
const outDir = path.join(project, "_shots", "Profile");
const jsonPath = path.resolve(Arg("json", path.join(outDir, `Profile_${label}.json`)));
const recordPath = jsonPath.replace(/\.json$/i, "") + ".rec.json";

await fs.mkdir(path.dirname(jsonPath), { recursive: true });
// ServeRoot(root, 0) 自己会避开 Chromium 拒连的受限端口（见它的 UNSAFE_PORTS 表），
// 所以这里不再重开一次；真抽到了它会重抽。
const server = await ServeRoot(root, 0);
const port = server.address().port;
const browser = await LaunchBrowser();
const page = await browser.newPage({ viewport: { width, height } });
const errors = [];
page.on("pageerror", (error) => errors.push(`PAGEERROR ${String(error).slice(0, 300)}`));
page.on("console", (message) => {
  if (message.type() !== "error") return;
  if (/fonts\.(googleapis|gstatic)\.com/.test(message.location()?.url || "")) return;
  errors.push(`CONSOLE ${message.text().slice(0, 300)}`);
});

const query = [
  "whitebox=p012",
  "shot=1",
  LIVE ? "" : "manual=1",
  quality ? `quality=${quality}` : "",
  stage ? `missionStage=${stage}` : "",
  extra,
].filter(Boolean).join("&");
const url = `http://127.0.0.1:${port}/Taierzhuang1938/?${query}`;

let snapshot = null;
const bootStart = Date.now();
try {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 240000 });
  await page.waitForFunction(() => window.Tengxian?.state?.ready, null, { timeout: 300000 });
  const bootMs = Date.now() - bootStart;
  await page.evaluate(PoseView, { A: MISSION_ANCHORS, name: viewArg, custom, settleFrames: 30, settleDt: 1 / 60 });
  const meta = await page.evaluate(() => {
    const g = window.Tengxian;
    const gl = g.renderer.getContext();
    const debug = gl.getExtension("WEBGL_debug_renderer_info");
    return {
      rendererName: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
      canvas: `${g.renderer.domElement.width}x${g.renderer.domElement.height}`,
      postTarget: `${g.post.width}x${g.post.height} · ${g.post.quality}`,
      viewport: [window.innerWidth, window.innerHeight],
    };
  });
  let cpuProfile = null;
  let cdp = null;
  if (CPU_PROFILE) {
    cdp = await page.context().newCDPSession(page);
    await cdp.send("Profiler.enable");
    await cdp.send("Profiler.setSamplingInterval", { interval: 80 });
    await cdp.send("Profiler.start");
  }
  const run = LIVE
    ? await page.evaluate(RunLive, { seconds, record: RECORD })
    : await page.evaluate(RunFrames, { frames, record: RECORD });
  if (cdp) {
    const { profile } = await cdp.send("Profiler.stop");
    cpuProfile = FoldProfile(profile, LIVE ? Math.max(1, run.summary.frames) : frames);
    await cdp.send("Profiler.disable");
  }
  snapshot = {
    label,
    when: new Date().toISOString(),
    view: viewArg,
    mode: LIVE ? `live ${seconds}s` : `StepFrames ${frames}`,
    url,
    bootMs,
    wallMsPerFrame: run.wallMs && run.summary.frames ? run.wallMs / run.summary.frames : null,
    ...meta,
    census: run.census,
    summary: run.summary,
    cpuProfile,
    errors,
  };
  if (run.recording) {
    await fs.writeFile(recordPath, JSON.stringify({ ...run.recording, label, view: viewArg, mode: snapshot.mode, ...meta }));
  }
} finally {
  await browser.close();
  server.close();
}

await fs.writeFile(jsonPath, JSON.stringify(snapshot, (key, value) =>
  (typeof value === "number" ? Math.round(value * 1000) / 1000 : value), 2));
console.log(FormatSnapshot(snapshot));
console.log("");
console.log(`机位 ${snapshot.view} ｜ ${snapshot.mode} ｜ 开机 ${(snapshot.bootMs / 1000).toFixed(1)} s`
  + (snapshot.wallMsPerFrame ? ` ｜ 墙钟 ${snapshot.wallMsPerFrame.toFixed(2)} ms/帧（含让出 event-loop）` : ""));
if (snapshot.cpuProfile) PrintCpuProfile(snapshot.cpuProfile);
for (const error of errors) console.log(error);
console.log(`saved ${jsonPath}`);
if (RECORD) console.log(`saved ${recordPath}（逐帧录制：--print=<它> --frame=worst 看单帧时间轴，或面板「加载录制」）`);
process.exit(errors.length ? 1 : 0);

// ---------------------------------------------------------------------------
// 页面内（传给 page.evaluate，只能用自己的参数）
// ---------------------------------------------------------------------------

/** StepFrames 推 N 帧；每帧让出一个 event-loop turn，GPU 的 TIME_ELAPSED 才收得回来。 */
async function RunFrames({ frames, record }) {
  const g = window.Tengxian;
  g.state.menu = false;
  const prof = g.profiler;
  prof.Enable();
  const started = performance.now();
  for (let i = 0; i < frames; i += 1) {
    g.StepFrames(1, 1 / 60, true);
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  const wallMs = performance.now() - started;
  // 再空转十几轮把还在飞的查询收回来（结果要过几个 event-loop turn 才可读）
  for (let i = 0; i < 16; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    g.StepFrames(1, 1 / 60, true);
  }
  const summary = prof.Summary(3600);
  const census = prof.Census(g.scene);
  const recording = record ? prof.ExportRecording() : null;
  prof.Disable();
  return { summary, census, wallMs, recording };
}

/** 真实 rAF：帧率与「浏览器侧」那一行只有这条路可信。 */
async function RunLive({ seconds, record }) {
  const g = window.Tengxian;
  g.state.menu = false;
  const prof = g.profiler;
  prof.Enable();
  await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
  const summary = prof.Summary(seconds);
  const census = prof.Census(g.scene);
  const recording = record ? prof.ExportRecording() : null;
  prof.Disable();
  return { summary, census, wallMs: seconds * 1000, recording };
}

// ---------------------------------------------------------------------------
// Node 侧排版
// ---------------------------------------------------------------------------

/**
 * 读回一份逐帧录制：默认汇总整条；--range=a-b 只汇总这一段；--frame=<帧号|worst> 只看一帧，
 * 另打这一帧的时间轴（面板选中一帧看到的就是这些）。
 */
function PrintRecording(data) {
  const frames = FramesFromRecording(data);
  const flags = { timerAvailable: !!data.timerAvailable, loafAvailable: !!data.loafAvailable };
  const frameArg = Arg("frame", "");
  const rangeArg = Arg("range", "");
  let rows = frames;
  let record = null;
  if (frameArg) {
    if (frameArg === "worst") {
      record = SummarizeFrames(frames, { ...flags, buckets: false }).worst;
    } else {
      record = frames.find((row) => row.id === Number(frameArg)) || null;
    }
    if (!record) {
      const ids = frames.length ? `#${frames[0].id}–#${frames[frames.length - 1].id}` : "（空）";
      console.error(`录制里没有这一帧：--frame=${frameArg}；录制帧号范围 ${ids}`);
      process.exit(2);
    }
    rows = [record];
  } else if (rangeArg) {
    const match = /^(\d+)\s*-\s*(\d+)$/.exec(rangeArg);
    if (!match) { console.error(`--range 写成 a-b（帧号），收到：${rangeArg}`); process.exit(2); }
    const lo = Math.min(Number(match[1]), Number(match[2]));
    const hi = Math.max(Number(match[1]), Number(match[2]));
    rows = frames.filter((row) => row.id >= lo && row.id <= hi);
  }
  const summary = SummarizeFrames(rows, flags);
  console.log(FormatSnapshot({
    label: `${data.label || "录制"}${record ? ` · 第 #${record.id} 帧` : (rangeArg ? ` · 帧 ${rangeArg}` : "")}`,
    rendererName: data.rendererName, canvas: data.canvas, postTarget: data.postTarget, when: data.when,
    summary,
  }));
  if (record) {
    console.log("");
    console.log(FormatFrameTimeline(record, data.names || [], { top: Number(Arg("top", "25")) }));
  } else {
    console.log("");
    console.log(`录制共 ${frames.length} 帧（#${frames[0]?.id ?? "—"}–#${frames[frames.length - 1]?.id ?? "—"}）；`
      + "加 --frame=<帧号|worst> 看单帧时间轴，--range=a-b 只汇总一段。");
  }
}

function PrintCpuProfile(cpuProfile) {
  console.log("");
  console.log(`JS 采样剖析（自身耗时前 ${cpuProfile.rows.length}，ms/帧；`
    + `被采样区段 ${cpuProfile.profiledMsPerFrame} ms/帧，样本 ${cpuProfile.samples}）`);
  for (const row of cpuProfile.rows) {
    console.log(`  ${String(row.msPerFrame).padStart(7)}  ${row.key}`);
  }
}
