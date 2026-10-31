// ===========================================================================
// Script_TimelineBrowserTest.mjs —— Timeline 过场面板的浏览器闸门（docs/Data_EditorSuite.md「Timeline 过场」）
//
// 跑法：node Taierzhuang1938/Script_TimelineBrowserTest.mjs
//
// 打开 ?editor=blockout&level=FirstLevel0105&timeline=FirstLevelOpening，钉住：
//   1. 面板开机就打开、四段子序列铺在主时间轴上、镜头 / 台词 / 事件格数与 Script_TimelinePlan 算的一致，导航栏让开；
//   2. 拖动走的是白盒编辑器那一个预演播放器：Seek(41.2) = 01-2 的第 7.5 s（预演播放器自己的 State 也这么说），
//      同一秒拖两次机位一样（确定性），拖回 01-1 也对；逐帧走 1/30 s；
//   3. 播放：时间往前走；跨段时 01-1 播完自动接 01-2；暂停停得住；面板上的播放键点得动；
//   4. 文件改了（agent 改 Timeline 文件）2 s 内重读；
//   5. 关掉面板：预演播放器还回本关自己的预演文件（Timeline 是拷贝，白盒编辑器那份没被换掉）；全程没有未捕获错误。
// 截图存 _shots/Timeline/（不提交）。
// ===========================================================================

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";
import { FindTimeline, TimelineLayout, TimelineTracks, VoiceLineTable, TIMELINE_LINE_FALLBACK_S } from "./Script_TimelinePlan.mjs";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(projectDir, "..");
const shotDir = path.join(projectDir, "_shots", "Timeline");
await fs.mkdir(shotDir, { recursive: true });

const results = [];
function Check(name, ok, detail = "") {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? "  — " + detail : ""}`);
}
const J = (v) => JSON.stringify(v);

const ID = "FirstLevelOpening";
const entry = FindTimeline(ID);
const docText = await fs.readFile(path.join(projectDir, entry.file), "utf8");
const doc = JSON.parse(docText);
const voice = JSON.parse(await fs.readFile(path.join(projectDir, doc.voice.replace(/^\.\//, "")), "utf8"));
const table = VoiceLineTable(voice);
const layout = TimelineLayout(doc, { lineDuration: (id) => table.get(id)?.durationS ?? TIMELINE_LINE_FALLBACK_S });
const tracks = TimelineTracks(doc, layout, { lineInfo: (id) => table.get(id) || null });

const server = await ServeRoot(rootDir, 0);
const port = server.address().port;
const browser = await LaunchBrowser();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (error) => errors.push(`PAGEERROR ${String(error).slice(0, 300)}`));
page.on("console", (message) => {
  if (message.type() !== "error") return;
  const url = message.location()?.url || "";
  if (/fonts\.(googleapis|gstatic)\.com/.test(url)) return;
  if (/__blockout/.test(url) || /__blockout/.test(message.text())) return;
  if (/\/Animation\/Previz\w+\/Data_Previz\w+Animation\.json/.test(url) && /404/.test(message.text())) return;
  errors.push(`CONSOLE ${message.text().slice(0, 240)} @ ${url}`);
});
const B = (fn, arg) => page.evaluate(fn, arg);
async function Wait(predicate, arg, timeout = 15000) {
  try { await page.waitForFunction(predicate, arg, { timeout, polling: 50 }); return true; } catch (error) { return false; }
}
const TL = (fn, arg) => B(async ([fn, arg]) => {
  const tl = window.Tengxian.Debug.Blockout.Timeline;
  const out = await tl[fn](arg);
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  return { tl: tl.State(), previz: window.Tengxian.Debug.Blockout.Previz.State() };
}, [fn, arg]);
const Shot = (name) => page.screenshot({ path: path.join(shotDir, name) });
const Near = (a, b, eps = 0.05) => Math.abs(a - b) <= eps;

try {
  console.log("--- boot");
  await page.goto(`http://127.0.0.1:${port}/Taierzhuang1938/?editor=blockout&level=${entry.level}&timeline=${ID}&scale=small`,
    { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => window.Tengxian?.state?.ready && window.Tengxian?.Debug?.Blockout?.State().ready, null, { timeout: 300000 });
  const opened = await Wait(() => { const s = window.Tengxian.Debug.Blockout.Timeline.State(); return s.open && !!s.segment && window.Tengxian.Debug.Blockout.Previz.State().playing; }, null, 180000);
  const ui = await B(() => {
    const root = document.querySelector(".boTimeline");
    const vis = (sel) => { const el = document.querySelector(sel); return !!el && getComputedStyle(el).display !== "none" && el.offsetParent !== null; };
    return {
      shown: !!root && !root.hidden && root.getBoundingClientRect().height > 100,
      segs: root?.querySelectorAll(".tlLane.seg .tlItem").length, shots: root?.querySelectorAll(".tlLane.shot .tlItem").length,
      lines: root?.querySelectorAll(".tlLane.line .tlItem").length, events: root?.querySelectorAll(".tlLane.event .tlItem").length,
      nav: vis(".boNav"), mini: vis(".boMini"), state: window.Tengxian.Debug.Blockout.Timeline.State(),
    };
  });
  Check("面板开机就打开，四段子序列与各轨格数对得上 Script_TimelinePlan", opened && ui.shown && ui.segs === layout.segments.length
    && ui.shots === tracks.shots.length && ui.lines === tracks.lines.length && ui.events === tracks.events.length,
    J({ opened, ...ui, state: undefined, want: { segs: layout.segments.length, shots: tracks.shots.length, lines: tracks.lines.length, events: tracks.events.length } }));
  Check("面板开着时导航栏与小地图让开", !ui.nav && !ui.mini, J({ nav: ui.nav, mini: ui.mini }));
  Check("时长 = 四段之和、核对无错", Near(ui.state.durationS, layout.durationS, 0.01) && ui.state.errors.length === 0,
    J({ durationS: ui.state.durationS, want: layout.durationS, errors: ui.state.errors }));

  console.log("--- seek");
  const seg2 = layout.segments[1];
  const at = seg2.start + 7.5;
  const s1 = await TL("Seek", at);
  Check("Seek 到 01-2 的第 7.5 s：面板与预演播放器读数一致、停住",
    s1.tl.segment?.keyframe === seg2.keyframe && Near(s1.tl.segment.local, 7.5) && s1.previz.keyframe === seg2.keyframe
      && Near(s1.previz.t, 7.5) && s1.previz.paused && !s1.tl.playing && Near(s1.tl.t, at),
    J({ tl: s1.tl.segment, t: s1.tl.t, previz: { kf: s1.previz.keyframe, t: s1.previz.t, paused: s1.previz.paused } }));
  await Shot("Timeline_Seek_01-2.png");
  const s2 = await TL("Seek", 10);
  const s3 = await TL("Seek", at);
  const cam = (s) => s.previz.camera?.position;
  Check("拖回 01-1 也对；同一秒拖两次机位一样（确定性求值）",
    s2.tl.segment?.keyframe === layout.segments[0].keyframe && Near(s2.previz.t, 10)
      && cam(s1) && cam(s3) && Near(cam(s1).x, cam(s3).x, 1e-3) && Near(cam(s1).y, cam(s3).y, 1e-3) && Near(cam(s1).z, cam(s3).z, 1e-3),
    J({ back: s2.tl.segment, a: cam(s1), b: cam(s3) }));
  const s4 = await TL("Step", 1);
  Check("逐帧走 1/30 s", Near(s4.tl.t - at, 1 / 30, 0.005), J({ dt: s4.tl.t - at }));
  const s5 = await TL("StepShot", 1);
  const nextShot = tracks.shots.find((s) => s.t0 > s4.tl.t + 1e-3);
  Check("下一镜跳到镜头轨的下一个切点", nextShot && Near(s5.tl.t, nextShot.t0, 0.01), J({ t: s5.tl.t, want: nextShot?.t0 }));

  console.log("--- play");
  const before = (await TL("Play")).tl;
  await page.waitForTimeout(1500);
  const playing = await B(() => window.Tengxian.Debug.Blockout.Timeline.State());
  Check("播放时时间往前走", playing.playing && playing.t > before.t + 0.3, J({ from: before.t, to: playing.t }));
  const paused = (await TL("Pause")).tl;
  await page.waitForTimeout(600);
  const still = await B(() => window.Tengxian.Debug.Blockout.Timeline.State());
  Check("暂停停得住", !paused.playing && Near(still.t, paused.t, 0.02), J({ paused: paused.t, later: still.t }));

  // 跨段：从 01-1 末尾前 0.6 s 播，01-1 播完自动接 01-2
  await TL("Seek", layout.segments[0].end - 0.6);
  await TL("Play");
  const crossed = await Wait((kf) => { const s = window.Tengxian.Debug.Blockout.Timeline.State(); return s.playing && s.segment?.keyframe === kf && s.segment.local > 0.2; }, seg2.keyframe, 90000);
  const cross = await B(() => window.Tengxian.Debug.Blockout.Timeline.State());
  Check("01-1 播完自动接 01-2 接着播", crossed, J({ seg: cross.segment, playing: cross.playing }));
  await TL("Pause");

  // 面板按钮点得动
  await page.click('.boTimeline .tlBtn[title^="播放"]');
  await page.waitForTimeout(800);
  const clicked = await B(() => window.Tengxian.Debug.Blockout.Timeline.State().playing);
  await page.click('.boTimeline .tlBtn[title^="播放"]');
  await page.waitForTimeout(300);
  const unclicked = await B(() => window.Tengxian.Debug.Blockout.Timeline.State().playing);
  Check("面板上的播放 / 暂停键点得动", clicked && !unclicked, J({ clicked, unclicked }));
  // 点轨道：跳到点的那一秒附近
  const box = await page.locator(".boTimeline .tlLanes").boundingBox();
  await page.mouse.click(box.x + box.width * 0.75, box.y + box.height - 6);
  await Wait((t) => Math.abs(window.Tengxian.Debug.Blockout.Timeline.State().t - t) < 6, layout.durationS * 0.75, 30000);
  const clickT = await B(() => window.Tengxian.Debug.Blockout.Timeline.State().t);
  Check("点轨道跳到那一秒（点在格子上跳到格子开头）", Math.abs(clickT - layout.durationS * 0.75) < 6, J({ t: clickT, want: layout.durationS * 0.75 }));
  await Shot("Timeline_ClickTrack.png");

  console.log("--- reload");
  const edited = { ...doc, title: "改过的标题" };
  await page.route(new RegExp(`/${entry.file.replace(/[./]/g, (c) => `\\${c}`)}`), (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(edited) }));
  const reloaded = await Wait(() => window.Tengxian.Debug.Blockout.Timeline.State().title === "改过的标题", null, 8000);
  Check("Timeline 文件改了 2 s 内重读", reloaded);
  await page.unroute(new RegExp(`/${entry.file.replace(/[./]/g, (c) => `\\${c}`)}`));

  console.log("--- close");
  const closed = await TL("Close");
  const fileSeqs = JSON.parse(await fs.readFile(path.join(projectDir, "Blockout", `${entry.level}.previz.json`), "utf8")).sequences.length;
  Check("关掉面板：预演播放器还回本关自己的预演文件（Timeline 是拷贝）",
    !closed.tl.open && !closed.previz.source && closed.previz.sequences.length === fileSeqs && !closed.previz.playing,
    J({ open: closed.tl.open, source: closed.previz.source, seqs: closed.previz.sequences.length, want: fileSeqs }));
  Check("全程没有未捕获错误", errors.length === 0, errors.slice(0, 5).join(" | "));
} finally {
  await browser.close();
  server.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`TimelineBrowserTest: ${results.length - failed.length}/${results.length} passed`);
assert.equal(failed.length, 0, failed.map((r) => r.name).join("; "));
