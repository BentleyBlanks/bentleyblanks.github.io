// 《台儿庄：血战滕县》Frame Debugger 命令行：起一次无头浏览器、摆好机位、捕获一帧，
// 把 agent 查渲染 bug 要的东西落到 `_shots/FrameDebug/<label>/`，并在终端打一张 Pass 树。
//
// 窗口（编辑器 → 渲染调试 → Frame Debugger）给人看；这里与它读同一份捕获、同一套命名与
// 分组。页面内接口是 `Tengxian.FrameDebug`（Script_FrameDebugAgent），本脚本只是包一层。
//
// ## 用法
//   node Taierzhuang1938/Script_FrameDebugCli.mjs --view=front --label=front
//   node Taierzhuang1938/Script_FrameDebugCli.mjs --stage=4 --find=terrain --event=#285 --textures
//   node Taierzhuang1938/Script_FrameDebugCli.mjs --view=bunker --pixel=640,360 --pixel=100,80@#300
//   node Taierzhuang1938/Script_FrameDebugCli.mjs --view=front --pass-images
//   node Taierzhuang1938/Script_FrameDebugCli.mjs --js="return fd.Events({ pass: 'main', minGpuMs: 0.1 })"
//
//   --view=bunker|front|frontEast|x,y,z,yaw,pitch  机位（与 Script_ProfileCli / FirstLevelFrameProbe 共用）
//   --stage=<编号或 id>    第一关阶段跳转（missionStage）
//   --url=a=1&b=2          原样追加到 `?whitebox=p012` 后面
//   --quality=high --width=1600 --height=900
//   --base=http://127.0.0.1:8080   用已开着的预览服务（默认本脚本自己起一个服务本树）
//   --label=名字           输出目录名（默认 capture）
//
//   事件编号：纯数字是 0 起的 index（与 API 一致）；`#285` 是窗口里显示的编号（= index 284）。
//   --find=文字            模糊筛事件并打印（可重复）
//   --event=<编号>         落 event_<index>.json + .png（可重复）；加 --textures 再落该 DC 读到的每张 2D 纹理
//   --pixel=x,y[@编号]     像素历史（图像坐标，左上 0,0；默认截至最后一个事件、附件 0）→ pixel_x_y.json
//   --pass-images          每个顶层 Pass 结束时的画面 → pass_<序号>_<名字>.png
//   --js=<代码>            页面里执行 `async (fd, g) => { 代码 }`，fd = Tengxian.FrameDebug，打印返回的 JSON
//   --js-file=<路径>       同上，代码从文件读
//
// 总会落：summary.json（Pass 树 + 耗时）、events.json（全部事件行）、final.png（最后一个事件后的画面）。

import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";
import { MISSION_ANCHORS, PoseView, ParseCustomView, VIEW_NAMES } from "./Script_FrameProbeViews.mjs";

const project = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(project, "..");
const argv = process.argv.slice(2);
const Arg = (key, fallback) => { const hit = argv.find((item) => item.startsWith(`--${key}=`)); return hit === undefined ? fallback : hit.slice(key.length + 3); };
const Args = (key) => argv.filter((item) => item.startsWith(`--${key}=`)).map((item) => item.slice(key.length + 3));
if (argv.includes("--help")) { console.log((await fs.readFile(fileURLToPath(import.meta.url), "utf8")).split("\n").filter((line) => line.startsWith("//")).join("\n")); process.exit(0); }

const label = Arg("label", "capture");
const viewArg = Arg("view", "bunker");
const custom = VIEW_NAMES.includes(viewArg) ? null : ParseCustomView(viewArg);
if (!custom && !VIEW_NAMES.includes(viewArg)) { console.error(`--view 只认 ${VIEW_NAMES.join(" / ")} 或 "x,y,z,yaw,pitch"，收到：${viewArg}`); process.exit(2); }
const stage = Arg("stage", ""), extra = Arg("url", ""), quality = Arg("quality", "high");
const width = Number(Arg("width", "1600")), height = Number(Arg("height", "900"));
const ParseIndex = (text) => { const value = String(text).trim(); const number = Number(value.replace(/^#/, "")); if (!Number.isInteger(number)) throw new Error(`事件编号不对：${text}`); return value.startsWith("#") ? number - 1 : number; };
const events = Args("event").map(ParseIndex);
const pixels = Args("pixel").map((text) => { const [xy, at] = text.split("@"); const [x, y] = xy.split(",").map(Number); return { x, y, event: at == null ? null : ParseIndex(at) }; });
const finds = Args("find");
let script = Arg("js", "");
if (Arg("js-file", "")) script = await fs.readFile(path.resolve(Arg("js-file")), "utf8");
const outDir = path.join(project, "_shots", "FrameDebug", label);
await fs.mkdir(outDir, { recursive: true });

const server = Arg("base", "") ? null : await ServeRoot(root, 0);
const base = Arg("base", "") || `http://127.0.0.1:${server.address().port}`;
const browser = await LaunchBrowser();
const page = await browser.newPage({ viewport: { width, height } });
const errors = [];
page.on("pageerror", (error) => errors.push(`PAGEERROR ${String(error).slice(0, 300)}`));
page.on("console", (message) => {
  if (message.type() !== "error" || /fonts\.(googleapis|gstatic)\.com/.test(message.location()?.url || "")) return;
  errors.push(`CONSOLE ${message.text().slice(0, 300)}`);
});
const query = ["whitebox=p012", "shot=1", "manual=1", quality ? `quality=${quality}` : "", stage ? `missionStage=${stage}` : "", extra].filter(Boolean).join("&");
const url = `${base}/Taierzhuang1938/?${query}`;
const Save = (name, value) => fs.writeFile(path.join(outDir, name), typeof value === "string" ? value : JSON.stringify(value, null, 2));
const SavePng = (name, image) => fs.writeFile(path.join(outDir, name), Buffer.from(image.png.split(",")[1], "base64"));
const Ms = (value) => value == null ? "     —" : value.toFixed(3).padStart(7);
const FD = (method, ...args) => page.evaluate(({ method, args }) => window.Tengxian.FrameDebug[method](...args), { method, args });

let exitCode = 0;
try {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 240000 });
  await page.waitForFunction(() => window.Tengxian?.state?.ready, null, { timeout: 300000 });
  await page.evaluate(PoseView, { A: MISSION_ANCHORS, name: viewArg, custom, settleFrames: 30, settleDt: 1 / 60 });
  const summary = await page.evaluate(() => window.Tengxian.FrameDebug.Capture());
  await Save("summary.json", { label, url, view: viewArg, ...summary });
  await Save("events.json", (await FD("Events", { limit: 1e9 })).rows);
  await SavePng("final.png", await FD("Image", summary.events - 1, { width: 2048 }));

  console.log(`帧 #${summary.id} · ${summary.size.join("×")} · ${summary.draws} DC / ${summary.events} 事件 · CPU ${summary.cpuMs} ms · GPU ${summary.gpuMs ?? "—"} ms (${summary.gpuStatus})`);
  console.log("\n  GPU ms   CPU ms    DC  事件区间        Pass / 分组（* = 捕获器归并）");
  for (const pass of summary.passes) {
    console.log(`${Ms(pass.gpuMs)}  ${Ms(pass.cpuMs)}  ${String(pass.draws).padStart(4)}  ${`#${pass.events[0] + 1}–#${pass.events[1] + 1}`.padEnd(14)}  ${"  ".repeat(pass.depth)}${pass.path.split("/").at(-1)}${pass.synthetic ? "*" : ""}`);
  }
  const PrintRows = (rows) => { for (const row of rows) console.log(`${Ms(row.gpuMs)}  ${Ms(row.cpuMs)}  #${String(row.index + 1).padEnd(5)} ${row.kind} ${row.label}  [${row.path}${row.material ? ` · ${row.material}` : ""}]`); };
  console.log("\n最耗 GPU 的 DC：");
  PrintRows(summary.topGpu);

  for (const text of finds) {
    const result = await FD("Events", { text, limit: 40 });
    console.log(`\n--find=${text}：${result.count} 条${result.count > 40 ? "（只列前 40）" : ""}`);
    PrintRows(result.rows);
  }
  if (argv.includes("--pass-images")) {
    const top = summary.passes.filter((pass) => pass.depth === 0);
    for (const [i, pass] of top.entries()) await SavePng(`pass_${String(i).padStart(2, "0")}_${pass.path.replace(/[^\w.-]+/g, "_")}.png`, await FD("Image", pass.events[1], { width: 1024 }));
    console.log(`\n已落 ${top.length} 张 Pass 结束画面`);
  }
  for (const index of events) {
    const detail = await FD("Event", index, {});
    await Save(`event_${index}.json`, detail);
    const attachment = detail.renderTarget.attachments.findIndex((item) => !item.stencil);
    if (attachment >= 0) await SavePng(`event_${index}.png`, await FD("Image", index, { attachment, width: 2048 }));
    console.log(`\n#${index + 1} ${detail.kind} ${detail.label} · ${detail.path} → ${detail.renderTarget.name} · ${detail.api}`);
    console.log(`  ${Object.entries(detail.state).map(([key, value]) => `${key} ${value}`).join(" | ")}`);
    if (argv.includes("--textures")) for (const texture of detail.textures || []) {
      if (!texture.previewable) continue;
      await SavePng(`event_${index}_tex${texture.binding}_${texture.uniform.replace(/[^\w]+/g, "_")}.png`, await FD("Image", index, { texture: texture.binding, width: 1024 }));
    }
  }
  for (const pixel of pixels) {
    const history = await FD("PixelHistory", pixel.x, pixel.y, pixel.event == null ? {} : { event: pixel.event });
    await Save(`pixel_${pixel.x}_${pixel.y}${pixel.event == null ? "" : `_at${pixel.event}`}.json`, history);
    const Value = (value) => `(${value.map((v) => Number(v.toFixed(4))).join(", ")})`;
    console.log(`\n像素 (${pixel.x}, ${pixel.y}) · ${history.target}/${history.attachment} ${history.format} · 起始 ${Value(history.initial)} → 最终 ${Value(history.final)} · ${history.writes} 次改写`);
    for (const item of history.history.filter((row) => row.changed)) console.log(`  #${String(item.index + 1).padEnd(5)} ${item.kind} ${item.label} [${item.path}] → ${Value(item.value)}`);
  }
  if (script) {
    const result = await page.evaluate(async (code) => {
      const Run = new Function("fd", "g", `return (async () => { ${code} })();`);
      return Run(window.Tengxian.FrameDebug, window.Tengxian);
    }, script);
    await Save("js.json", result ?? null);
    console.log(`\n--js 结果：\n${JSON.stringify(result, null, 2)}`);
  }
  await FD("Release");
} catch (error) {
  console.error(String(error?.stack || error)); exitCode = 1;
} finally {
  await browser.close();
  server?.close();
}
for (const error of errors) console.log(error);
console.log(`\n输出：${outDir}`);
process.exit(exitCode || (errors.length ? 1 : 0));
