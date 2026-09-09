// 《台儿庄：血战滕县》第一关整帧取证：车厢内 / 前沿开战（朝北）/ 前沿（朝东）三个固定机位，
// 读 Script_Profiler 的 CPU 分桶、GPU 分段、GC 事件、draw call / 三角形，
// 并记录前沿日军 4 秒内的位移与开火，落 `_shots/FirstLevelFrame/Perf_<label>.json`。
//
// 用法：node Taierzhuang1938/Script_FirstLevelFrameProbe.mjs [--label=名字] [--quality=high|medium|low] [--frames=240]
// 这是取证口不是门禁：同机前后两次对照（见 docs/Data_FirstLevelRebuildAcceptance.md r13），GPU 段
// 逐次波动约 ±1 ms，比较时看 calls / tris / allocKbPerFrame 与 fps 的同向变化。
//
// ## `--strict`：与 §13 分档表同口径的第一关三机位账（2026-09-08 加）
// 默认那条路（`--frames` 墙钟 + `profiler.Summary`）量的是**活的一段**：
// 里面混着开机着色器编译（post 桶单帧 1.3 s）与 AI/烟的抖动，平均值不能拿来
// 逐项比旋钮。`--strict` 换成 docs/Data_TechRenderPipeline.md §13.1 的那套口径：
//   · 视口默认 **3394×1348**（用户那台机器的实际窗口），画质默认 high；
//   · **dt = 0** 把世界钉住 —— 同一批的 draw 才真的相同；
//   · 一次 `TIME_ELAPSED` 罩 **21 帧**（7 的倍数，bakeOrder 一轮 7 帧），取多轮 **min**；
//   · 逐 pass GPU 中位数 + **逐 pass draw call / 三角形**（包 profiler 的 _StartSeg /
//     _EndSeg 记 renderer.info 增量，游戏代码一个字没改）+ 逐 pass CPU 提交；
//   · CPU 分桶取中位数（不是平均），把编译尖峰挡在外面。
//
//   --strict            打开上面这套
//   --width= --height=  视口（默认 3394×1348）
//   --rounds=5          每机位几批
//   --views=train,front,frontEast   只量其中几个机位
//   --ablate=<csv|all>  同页消融（graphics.xxx + ApplyGraphics()），见 ABLATIONS
//   --params=a=1&b=2    原样追加到 URL（例如 skyLegacy=1）
import path from "node:path";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";
import { MISSION_ANCHORS as A } from "./Data_FirstLevelMissionLayout.mjs";
const project = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(project, "..");
const outDir = path.join(project, "_shots", "FirstLevelFrame");
await fs.mkdir(outDir, { recursive: true });
const argv = process.argv.slice(2);
const arg = (k, d) => { const hit = argv.find((a) => a.startsWith(`--${k}=`)); return hit === undefined ? d : hit.slice(k.length + 3); };
const STRICT = argv.includes("--strict");
const label = arg("label", "probe"), frames = Number(arg("frames", "240"));
const quality = arg("quality", STRICT ? "high" : "");
const width = Number(arg("width", STRICT ? "3394" : "1920"));
const height = Number(arg("height", STRICT ? "1348" : "1080"));
const rounds = Number(arg("rounds", "5"));
const views = arg("views", "train,front,frontEast").split(",").filter(Boolean);
const ablate = arg("ablate", "");
const extraParams = arg("params", "");
// `--root=<abs>`：服务另一棵检出（量大修前基线树用；**不改那棵树**，页面代码从它取，
// 页面内的取证代码仍是本树注入的这一份，两棵树因此是同一把尺子）。
const serveRoot = arg("root") ? path.resolve(arg("root")) : root;
// `--cpuprofile`：CDP 的 JS 采样剖析器。submit 被什么吃掉，只有它能直接指名道姓。
const CPU_PROFILE = argv.includes("--cpuprofile");
// `--shot`：三机位定帧出图（性能改动的画面取证）。`--diff=a,b` 用浏览器解码两组图求差。
const SHOT = argv.includes("--shot");
// `--live`：不带 manual=1 跑真实 rAF，量自动降档阶梯真的落到第几级（StepFrames 不喂阶梯）。
const LIVE = argv.includes("--live");
// `--counts`：只数不计时。这台机器上常年有别的 agent 在跑浏览器测试，墙钟前后能差
// 一倍；而「一帧走了多少个节点、提交了多少次 draw」是确定的，两棵树可以直接比。
const COUNTS = argv.includes("--counts");
const liveSeconds = Number(arg("liveSeconds", "45"));
const DIFF = arg("diff", "");
const profileFrames = Number(arg("profileFrames", "240"));
// `--diff=labelA,labelB`：只比对已经出好的两组图，不起浏览器也不起服务。
if (DIFF) {
  const [labelA, labelB] = DIFF.split(",");
  for (const name of views) {
    const a = path.join(outDir, `Shot_${labelA}_${name}.png`);
    const b = path.join(outDir, `Shot_${labelB}_${name}.png`);
    if (!fsSync.existsSync(a) || !fsSync.existsSync(b)) { console.log(`${name}: missing ${fsSync.existsSync(a) ? b : a}`); continue; }
    console.log(`${name.padEnd(10)} ${JSON.stringify(DiffPng(a, b))}`);
  }
  process.exit(0);
}
const server = await ServeRoot(serveRoot, 0);
const browser = await LaunchBrowser();
const page = await browser.newPage({ viewport: { width, height } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 300)));
page.on("console", (m) => { if (m.type() === "error" && !/fonts\./.test(m.location()?.url || "")) errors.push("CONSOLE " + m.text().slice(0, 300)); });
const t0 = Date.now();
let result = null;
try {
  const q = quality ? `&quality=${quality}` : "";
  const extra = extraParams ? `&${extraParams}` : "";
  await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/?whitebox=p012&shot=1${LIVE ? "" : "&manual=1"}${q}${extra}`, { waitUntil: "domcontentloaded", timeout: 240000 });
  await page.waitForFunction(() => window.Tengxian?.state?.ready, null, { timeout: 300000 });
  const bootMs = Date.now() - t0;
  result = COUNTS
    ? await page.evaluate(CountProbe, { A, views })
    : LIVE
    ? await LiveAutoQuality(page, liveSeconds)
    : SHOT
    ? await ShotProbe(page, { A, views, label, outDir })
    : CPU_PROFILE
    ? await CpuProfile(page, { A, views, profileFrames })
    : STRICT
      ? await page.evaluate(StrictProbe, { A, rounds, views, ablate })
      : await page.evaluate(LegacyProbe, { A, frames });
  result.bootMs = bootMs;
} finally {
  await browser.close(); server.close();
}
const file = path.join(outDir, `Perf_${label}.json`);
await fs.writeFile(file, JSON.stringify({ result, errors }, null, 2));
if (result && COUNTS) console.log(JSON.stringify(result, null, 2));
else if (result && LIVE) console.log(JSON.stringify(result, null, 2));
else if (result && SHOT) console.log(JSON.stringify(result.files, null, 2));
else if (result && CPU_PROFILE) PrintCpuProfile(result);
else if (result && STRICT) PrintStrict(result); else if (result) PrintLegacy(result);
for (const e of errors) console.log(e);
console.log("saved", file);

/**
 * 每帧的**确定性工作量**：世界矩阵递归访问的节点数、场景遍历回调次数、draw 数。
 * 与墙钟无关，所以在有负载的机器上也能逐项比对两棵树。
 */
async function CountProbe({ A, views }) {
  const g = window.Tengxian;
  const THREE = await import("three");
  g.state.menu = false;
  const proto = THREE.Object3D.prototype;
  const counters = { updateWorldMatrix: 0, updateMatrixWorld: 0, traverse: 0, draw: 0 };
  const originalWorld = proto.updateWorldMatrix, originalMatrix = proto.updateMatrixWorld, originalTraverse = proto.traverse;
  const originalBuffer = g.renderer.renderBufferDirect;
  proto.updateWorldMatrix = function Counted(a, b) { counters.updateWorldMatrix += 1; return originalWorld.call(this, a, b); };
  proto.updateMatrixWorld = function Counted(force) { counters.updateMatrixWorld += 1; return originalMatrix.call(this, force); };
  proto.traverse = function Counted(fn) { counters.traverse += 1; return originalTraverse.call(this, fn); };
  g.renderer.renderBufferDirect = function Counted(...args) { counters.draw += 1; return originalBuffer.apply(this, args); };
  const Measure = (frames = 21) => {
    g.StepFrames(4, 0, true);
    for (const key in counters) counters[key] = 0;
    g.StepFrames(frames, 0, true);
    return Object.fromEntries(Object.entries(counters).map(([k, v]) => [k, Math.round(v / frames)]));
  };
  const out = { views: {} };
  for (const name of ["train", "front", "frontEast"]) {
    if (name === "front" || name === "frontEast") {
      if (name === "front") {
        const rt = g.Debug.FirstLevelMissionRuntime();
        for (const f of ["trainShelling", "trainStopped", "unloadOrdersHeard", "unloaded"]) rt.Record(f);
        g.StepFrames(2, 1 / 60, false);
        const p = g.player.position;
        p.set(A.gun.x, g.battlefield.GroundHeight(A.gun.x, A.gun.z) + 0.1, A.gun.z);
        g.player.body?.Teleport(p.x, p.y, p.z); g.player.yaw = 0; g.player.pitch = 0;
        g.StepFrames(302, 1 / 60, false);
      } else { g.player.yaw = -Math.PI / 2; g.StepFrames(5, 1 / 60, true); }
    }
    if (!views.includes(name)) continue;
    let objects = 0; g.scene.traverse(() => { objects += 1; });
    out.views[name] = { ...Measure(), sceneObjects: objects };
  }
  proto.updateWorldMatrix = originalWorld; proto.updateMatrixWorld = originalMatrix;
  proto.traverse = originalTraverse; g.renderer.renderBufferDirect = originalBuffer;
  return out;
}

/** 真实 rAF 下的自动降档阶梯（车厢内机位；`manual=1` 时阶梯根本不喂数据）。 */
async function LiveAutoQuality(page, seconds) {
  await page.evaluate(() => {
    const g = window.Tengxian;
    g.state.menu = false;
    // 自己挂一条 rAF 采样，不开 profiler —— 它的逐段 GPU 查询会改变要量的那个帧时间。
    window.__frameSpans = []; let last = 0;
    const Tick = (now) => { if (last) window.__frameSpans.push(now - last); last = now; requestAnimationFrame(Tick); };
    requestAnimationFrame(Tick);
  });
  await page.waitForTimeout(seconds * 1000);
  return page.evaluate(() => {
    const g = window.Tengxian, a = g.autoQuality;
    const spans = window.__frameSpans || [];
    const intervals = spans.slice(Math.floor(spans.length / 3)).filter((v) => v > 0 && v < 250).sort((x, y) => x - y);
    const csm = g.lights?.csm;
    return { autoQuality: a ? { enabled: a.enabled, step: a.step, steps: a.steps, scale: a.scale, ssr: a.ssr, contactShadows: a.contactShadows, nearShadowBake: a.nearShadowBake } : null,
      // 阶梯摘没摘掉第二张阴影烘焙，最终落在 CsmRig 上就是这两位（见 §6.8）
      shadowBake: csm ? { nearEveryFrame: csm.nearEveryFrame, allowed: csm.nearBakeAllowed, triangles: csm.bakeTriangles } : null,
      internal: [g.post.width, g.post.height], output: [g.post.outputWidth ?? g.post.width, g.post.outputHeight ?? g.post.height],
      renderScale: g.graphics.renderScale, ssrOn: g.post.preset ? g.post.ssrEnabled ?? null : null,
      hudFps: document.getElementById("fps")?.textContent ?? null,
      intervalMedian: intervals.length ? intervals[Math.floor(intervals.length / 2)] : null, samples: intervals.length };
  });
}

// ---------------------------------------------------------------------------
// 三机位定帧出图 + 逐像素比对（性能改动的「画面没变」取证）
// ---------------------------------------------------------------------------
async function ShotProbe(page, { A, views, label, outDir }) {
  const out = { views: {}, files: {} };
  for (const name of ["train", "front", "frontEast"]) {
    await page.evaluate(async ({ A, name }) => {
      const g = window.Tengxian;
      g.state.menu = false;
      if (name === "front" || name === "frontEast") {
        const rt = g.Debug.FirstLevelMissionRuntime();
        for (const f of ["trainShelling", "trainStopped", "unloadOrdersHeard", "unloaded"]) rt.Record(f);
        g.StepFrames(2, 1 / 60, false);
        const p = g.player.position;
        p.set(A.gun.x, g.battlefield.GroundHeight(A.gun.x, A.gun.z) + 0.1, A.gun.z);
        g.player.body?.Teleport(p.x, p.y, p.z); g.player.yaw = name === "frontEast" ? -Math.PI / 2 : 0; g.player.pitch = 0;
        g.StepFrames(302, 1 / 60, false);
      }
      // dt = 0 定帧：TAA 历史与自动曝光都收敛到同一个稳态，两棵树才可逐像素比。
      g.StepFrames(150, 0, true);
    }, { A, name });
    if (!views.includes(name)) continue;
    const file = path.join(outDir, `Shot_${label}_${name}.png`);
    await page.screenshot({ path: file });
    out.files[name] = file;
    out.views[name] = { file };
  }
  return out;
}

/**
 * 逐像素比对两张 PNG（Node 侧自解码：本仓不引图像库，zlib 已经在标准库里）。
 * 只认 Chromium 截图会产出的那两种：8 位 RGBA / RGB、非隔行。
 */
function DecodePng(buffer) {
  let offset = 8, width = 0, height = 0, colorType = 6, bitDepth = 8, interlace = 0;
  const chunks = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const body = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = body.readUInt32BE(0); height = body.readUInt32BE(4);
      bitDepth = body[8]; colorType = body[9]; interlace = body[12];
    } else if (type === "IDAT") chunks.push(body);
    else if (type === "IEND") break;
    offset += 12 + length;
  }
  if (bitDepth !== 8 || interlace !== 0 || (colorType !== 6 && colorType !== 2)) {
    throw new Error(`unsupported PNG bitDepth=${bitDepth} colorType=${colorType} interlace=${interlace}`);
  }
  const channels = colorType === 6 ? 4 : 3;
  const raw = zlib.inflateSync(Buffer.concat(chunks));
  const stride = width * channels;
  const out = Buffer.alloc(height * stride);
  let source = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = raw[source]; source += 1;
    const row = y * stride, previous = row - stride;
    for (let x = 0; x < stride; x += 1) {
      const value = raw[source + x];
      const a = x >= channels ? out[row + x - channels] : 0;
      const b = y > 0 ? out[previous + x] : 0;
      const c = x >= channels && y > 0 ? out[previous + x - channels] : 0;
      let result = value;
      if (filter === 1) result = value + a;
      else if (filter === 2) result = value + b;
      else if (filter === 3) result = value + ((a + b) >> 1);
      else if (filter === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        result = value + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
      }
      out[row + x] = result & 0xff;
    }
    source += stride;
  }
  return { width, height, channels, data: out };
}

function DiffPng(fileA, fileB) {
  const a = DecodePng(fsSync.readFileSync(fileA)), b = DecodePng(fsSync.readFileSync(fileB));
  if (a.width !== b.width || a.height !== b.height) return { error: "size", a: [a.width, a.height], b: [b.width, b.height] };
  let sum = 0, max = 0, over2 = 0, over8 = 0;
  const pixels = a.width * a.height;
  for (let i = 0; i < pixels; i += 1) {
    const ia = i * a.channels, ib = i * b.channels;
    const d = Math.max(Math.abs(a.data[ia] - b.data[ib]), Math.abs(a.data[ia + 1] - b.data[ib + 1]),
      Math.abs(a.data[ia + 2] - b.data[ib + 2]));
    sum += d; if (d > max) max = d; if (d > 2) over2 += 1; if (d > 8) over8 += 1;
  }
  // 差在画面的哪一块：8×8 粗网格的逐格平均差，用来分清「是枪」还是「是地面」。
  const GX = 8, GY = 6, grid = new Float64Array(GX * GY), cells = new Float64Array(GX * GY);
  for (let y = 0; y < a.height; y += 1) for (let x = 0; x < a.width; x += 1) {
    const i = y * a.width + x, ia = i * a.channels, ib = i * b.channels;
    const d = Math.max(Math.abs(a.data[ia] - b.data[ib]), Math.abs(a.data[ia + 1] - b.data[ib + 1]),
      Math.abs(a.data[ia + 2] - b.data[ib + 2]));
    const cell = Math.min(GY - 1, Math.floor(y / a.height * GY)) * GX + Math.min(GX - 1, Math.floor(x / a.width * GX));
    grid[cell] += d; cells[cell] += 1;
  }
  const rows = [];
  for (let gy = 0; gy < GY; gy += 1) {
    rows.push([...Array(GX)].map((_, gx) => (grid[gy * GX + gx] / cells[gy * GX + gx]).toFixed(2).padStart(6)).join(""));
  }
  return { pixels, meanAbs: Math.round(sum / pixels * 1000) / 1000, max,
    pctOver2: Math.round(over2 / pixels * 1e4) / 100, pctOver8: Math.round(over8 / pixels * 1e4) / 100, grid: rows };
}

// ---------------------------------------------------------------------------
// CDP JS 采样剖析：submit 那几十毫秒具体是谁在花
// ---------------------------------------------------------------------------
async function CpuProfile(page, { A, views, profileFrames }) {
  const SetupView = async (name) => page.evaluate(async ({ A, name }) => {
    const g = window.Tengxian;
    g.state.menu = false;
    if (name === "front" || name === "frontEast") {
      const rt = g.Debug.FirstLevelMissionRuntime();
      for (const f of ["trainShelling", "trainStopped", "unloadOrdersHeard", "unloaded"]) rt.Record(f);
      g.StepFrames(2, 1 / 60, false);
      const p = g.player.position;
      p.set(A.gun.x, g.battlefield.GroundHeight(A.gun.x, A.gun.z) + 0.1, A.gun.z);
      g.player.body?.Teleport(p.x, p.y, p.z); g.player.yaw = name === "frontEast" ? -Math.PI / 2 : 0; g.player.pitch = 0;
      g.StepFrames(302, 1 / 60, false);
    }
    g.StepFrames(30, 0, true);
  }, { A, name });

  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Profiler.enable");
  await cdp.send("Profiler.setSamplingInterval", { interval: 80 });
  const out = { views: {} };
  for (const name of ["train", "front", "frontEast"]) {
    await SetupView(name);
    if (!views.includes(name)) continue;
    await cdp.send("Profiler.start");
    const wall = await page.evaluate((n) => {
      const g = window.Tengxian, t = performance.now();
      g.StepFrames(n, 0, true);
      g.renderer.getContext().finish();
      return (performance.now() - t) / n;
    }, profileFrames);
    const { profile } = await cdp.send("Profiler.stop");
    out.views[name] = { wallMsPerFrame: Math.round(wall * 100) / 100, ...FoldProfile(profile, profileFrames) };
  }
  await cdp.send("Profiler.disable");
  return out;
}

/** 把 CDP 的采样树折成「自身时间」表（每帧 ms）。 */
function FoldProfile(profile, frameCount) {
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const self = new Map();
  const totalUs = (profile.endTime - profile.startTime);
  let samples = 0;
  const counts = new Map();
  for (const id of profile.samples) { counts.set(id, (counts.get(id) || 0) + 1); samples += 1; }
  for (const [id, count] of counts) {
    const node = byId.get(id); if (!node) continue;
    const f = node.callFrame;
    const file = (f.url || "").split("/").pop().split("?")[0];
    const key = `${f.functionName || "(anonymous)"} @ ${file}:${f.lineNumber + 1}`;
    self.set(key, (self.get(key) || 0) + count);
  }
  const msPerSample = samples ? (totalUs / 1000) / samples : 0;
  const rows = [...self.entries()].map(([key, count]) => ({ key, msPerFrame: Math.round(count * msPerSample / frameCount * 1000) / 1000 }))
    .sort((a, b) => b.msPerFrame - a.msPerFrame).slice(0, 40);
  return { profiledMsPerFrame: Math.round((totalUs / 1000) / frameCount * 100) / 100, samples, rows };
}

function PrintCpuProfile(result) {
  for (const [name, view] of Object.entries(result.views)) {
    console.log(`\n=== ${name} === wall=${view.wallMsPerFrame} ms/frame profiled=${view.profiledMsPerFrame} ms/frame samples=${view.samples}`);
    for (const row of view.rows) console.log(`  ${String(row.msPerFrame).padStart(7)}  ${row.key}`);
  }
}

// ---------------------------------------------------------------------------
// 严格口径（页面内）
// ---------------------------------------------------------------------------
async function StrictProbe({ A, rounds, views, ablate }) {
  const g = window.Tengxian, gl = g.renderer.getContext();
  const timer = gl.getExtension("EXT_disjoint_timer_query_webgl2");
  const debug = gl.getExtension("WEBGL_debug_renderer_info");
  const rendererName = debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  const info = g.renderer.info, prof = g.profiler;
  g.state.menu = false;
  const R = (v, n = 2) => Math.round(v * 10 ** n) / 10 ** n;
  const Median = (list) => { const s = [...list].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };

  // 一批 21 帧罩一个 TIME_ELAPSED（bakeOrder 一轮 7 帧，21 保证整数轮）。
  const BATCH = 21;
  const Batch = async (render = true) => {
    gl.finish();
    const query = timer ? gl.createQuery() : null;
    if (query) gl.beginQuery(timer.TIME_ELAPSED_EXT, query);
    info.autoReset = false; info.reset();
    const started = performance.now();
    g.StepFrames(BATCH, 0, render);
    const submitted = performance.now();
    if (query) gl.endQuery(timer.TIME_ELAPSED_EXT);
    gl.finish();
    const finished = performance.now();
    let gpuMs = null;
    if (query) {
      for (let retry = 0; retry < 40 && !gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE); retry += 1) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      if (gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE) && !gl.getParameter(timer.GPU_DISJOINT_EXT)) {
        gpuMs = gl.getQueryParameter(query, gl.QUERY_RESULT) / 1e6 / BATCH;
      }
      gl.deleteQuery(query);
    }
    info.autoReset = true;
    return { submitMs: (submitted - started) / BATCH, wallMs: (finished - started) / BATCH, gpuMs,
      calls: info.render.calls / BATCH, triangles: info.render.triangles / BATCH };
  };
  const Sample = async (render = true) => {
    g.StepFrames(8, 0, render);
    const rows = [];
    for (let i = 0; i < rounds; i += 1) rows.push(await Batch(render));
    const gpu = rows.map((r) => r.gpuMs).filter((v) => v != null);
    return { submitMs: R(Math.min(...rows.map((r) => r.submitMs))), wallMs: R(Math.min(...rows.map((r) => r.wallMs))),
      gpuMs: gpu.length ? R(Math.min(...gpu)) : null, gpuAll: gpu.map((v) => R(v)),
      calls: Math.round(Median(rows.map((r) => r.calls))), triangles: Math.round(Median(rows.map((r) => r.triangles))) };
  };

  // 逐 pass：GPU 中位数 + draw / 三角 / CPU 提交。包 profiler 的分段起止读
  // renderer.info 增量 —— 分段名与 GPU 计时用的是同一套栈，不会对不上号。
  const Passes = async (count = 84) => {
    const calls = Object.create(null), tris = Object.create(null);
    let mark = 0, markTri = 0;
    const startOrig = prof._StartSeg, endOrig = prof._EndSeg;
    prof._StartSeg = function Patched() { startOrig.call(this); mark = info.render.calls; markTri = info.render.triangles; };
    prof._EndSeg = function Patched() {
      const name = this._segName;
      if (name !== null) {
        calls[name] = (calls[name] || 0) + (info.render.calls - mark);
        tris[name] = (tris[name] || 0) + (info.render.triangles - markTri);
      }
      endOrig.call(this);
    };
    prof.Enable();
    for (let i = 0; i < count; i += 1) { g.StepFrames(1, 0, true); await new Promise((r) => setTimeout(r, 0)); }
    const history = prof.history.filter((row) => row.gpu);
    const gpuNames = new Set(), cpuNames = new Set();
    for (const row of history) { for (const k in row.gpu) gpuNames.add(k); for (const k in row.cpu) cpuNames.add(k); }
    const gpu = {}, gpuCpu = {}, cpu = {};
    for (const name of gpuNames) gpu[name] = R(Median(history.map((r) => r.gpu[name] || 0)), 3);
    for (const name of gpuNames) gpuCpu[name] = R(Median(history.map((r) => (r.gpuCpu || {})[name] || 0)), 3);
    for (const name of cpuNames) cpu[name] = R(Median(history.map((r) => r.cpu[name] || 0)), 3);
    const out = { frames: history.length, gpuTotal: R(Median(history.map((r) => r.gpuTotal || 0)), 3),
      cpuTotal: R(Median(history.map((r) => r.cpuMs)), 3), other: R(Median(history.map((r) => r.other || 0)), 3),
      gpu, gpuCpu, cpu,
      passCalls: Object.fromEntries(Object.entries(calls).map(([k, v]) => [k, R(v / count, 1)])),
      passTris: Object.fromEntries(Object.entries(tris).map(([k, v]) => [k, Math.round(v / count)])) };
    prof.Disable();
    prof._StartSeg = startOrig; prof._EndSeg = endOrig;
    return out;
  };

  // 「这一趟 draw 是谁提交的」：包 renderer.renderBufferDirect，按 pass 分段名 ×
  // 场景直属子树归账。draw call 受限时这张表决定往哪儿下刀。
  const DrawDump = async (count = 7) => {
    const cache = new WeakMap();
    const RootOf = (object) => {
      let node = object, guard = 0;
      while (node && node.parent && node.parent !== g.scene && guard < 64) { node = node.parent; guard += 1; }
      return String((node && (node.name || node.type)) || "(detached)").replace(/\d+/g, "*");
    };
    const tally = Object.create(null);
    const original = g.renderer.renderBufferDirect;
    g.renderer.renderBufferDirect = function Tallied(camera, scene, geometry, material, object, group) {
      let name = cache.get(object);
      if (name === undefined) { name = RootOf(object); cache.set(object, name); }
      const key = `${prof._segName || "misc"} | ${name}`;
      tally[key] = (tally[key] || 0) + 1;
      return original.call(this, camera, scene, geometry, material, object, group);
    };
    prof.Enable();
    for (let i = 0; i < count; i += 1) { g.StepFrames(1, 0, true); await new Promise((r) => setTimeout(r, 0)); }
    prof.Disable();
    g.renderer.renderBufferDirect = original;
    return Object.fromEntries(Object.entries(tally).map(([k, v]) => [k, R(v / count, 1)])
      .sort((a, b) => b[1] - a[1]).slice(0, 36));
  };

  // three 在 setProgram 里按 `materialProperties.skinning !== object.isSkinnedMesh`
  // （instancing 同理）判定要不要重走 getProgram。一份材质同时挂在蒙皮件与普通件上
  // 就会每帧来回顶，整场重算着色器参数（r13 那一轮 CloneShadedMaterial 修的正是它）。
  // 这张表是**计数**不是计时，不受同机负载影响。
  const MaterialAudit = () => {
    const rows = new Map();
    g.scene.traverse((object) => {
      if (!object.isMesh || !object.visible || !object.material) return;
      const list = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of list) {
        if (!material) continue;
        let row = rows.get(material);
        if (!row) { row = { name: material.name || material.type, skinned: 0, plain: 0, instanced: 0, single: 0 }; rows.set(material, row); }
        if (object.isSkinnedMesh) row.skinned += 1; else row.plain += 1;
        if (object.isInstancedMesh) row.instanced += 1; else row.single += 1;
      }
    });
    const mixed = [...rows.values()].filter((r) => (r.skinned > 0 && r.plain > 0) || (r.instanced > 0 && r.single > 0));
    return { materials: rows.size, mixedCount: mixed.length, mixed: mixed.slice(0, 12) };
  };

  const Actors = () => {
    const soldiers = g.ai.soldiers, lod = {};
    for (const s of soldiers) lod[s.renderLod || "none"] = (lod[s.renderLod || "none"] || 0) + 1;
    let objs = 0, skinned = 0, meshes = 0, inst = 0, skinnedVisible = 0, bones = 0;
    g.scene.traverse((o) => {
      objs += 1;
      if (o.isBone) bones += 1;
      if (o.isSkinnedMesh) { skinned += 1; if (o.visible && o.layers.mask & 1) skinnedVisible += 1; }
      if (o.isMesh) { meshes += 1; if (o.isInstancedMesh) inst += 1; }
    });
    return { total: soldiers.length, alive: soldiers.filter((s) => s.alive).length, lod,
      sceneObjects: objs, bones, skinned, skinnedVisible, meshes, instanced: inst,
      batch: g.actorBatch ? { ...g.actorBatch.stats } : null };
  };

  // 消融表：同页 graphics.xxx + ApplyGraphics()，每项量完立刻还原。
  const G = g.graphics;
  const Flip = (key, value) => ({ Apply: () => { const old = G[key]; G[key] = value; g.ApplyGraphics(); return () => { G[key] = old; g.ApplyGraphics(); }; } });
  const ABLATIONS = {
    noAtmosphere: Flip("atmosphere", false),          // ≡ ?skyLegacy=1
    noVolumetrics: Flip("volumetrics", false),
    noSsr: Flip("ssr", false),
    noGtao: { Apply: () => { const old = g.post.preset.ssao; g.post.preset.ssao = false; return () => { g.post.preset.ssao = old; }; } },
    noSsil: Flip("ssil", 0),
    noClusteredLights: Flip("clusteredLights", false),
    noContactShadows: Flip("contactShadows", false),
    noTaa: Flip("taa", false),
    noMotionBlur: Flip("motionBlur", 0),
    noBloom: Flip("bloom", 0),
    noLensFlare: Flip("lensFlare", 0),
    noFirstPersonShadow: Flip("firstPersonSelfShadow", false),
    noShadows: Flip("shadows", false),
    shadow1024: Flip("shadowSize", 1024),
    // 阴影排班退回「一帧一张」（见 Data_Tuning_Shadows 抬头「近级每帧烘」）。
    // 这一关默认是两张（第 0 级每帧 + 远级轮转），所以这一项量的就是那第二张的账。
    // 锁要一起钉死，否则实测反馈会在批次中途把它切回去。
    // **批长注意**：升档之后远级的轮转周期是 `cascades − 1`（= 2 帧），
    // 21 帧不再是整数轮；逐项比这一项时把 `--rounds` 拉大靠中位数压掉那半轮。
    oneShadowBakePerFrame: { Apply: () => {
      const csm = g.lights?.csm;
      if (!csm) return () => {};
      const was = csm.nearEveryFrame;
      const lock = csm.bakeModeLock;
      csm.nearEveryFrame = false;
      csm.bakeModeLock = Number.MAX_SAFE_INTEGER;
      return () => { csm.nearEveryFrame = was; csm.bakeModeLock = lock; };
    } },
    noPom: Flip("pom", false),
    noSkinSss: Flip("skinSss", false),
    // 诊断项：不是画质旋钮，用来把「人物那一份」从整帧里抠出来。
    // 只设 visible=false 没用 —— CullActors 每帧按 LOD 重写这一位，所以先把
    // 剔除函数换成空操作，再把整棵人物子树从场景里摘下来。
    hideActors: { Apply: () => {
      const original = g.ai.CullActors;
      g.ai.CullActors = function NoCull() {};
      const detached = [];
      for (const s of g.ai.soldiers) {
        const root = s.actor?.root;
        if (root?.parent) { detached.push([root, root.parent]); root.parent.remove(root); }
      }
      return () => { for (const [root, parent] of detached) parent.add(root); g.ai.CullActors = original; };
    } },
    batchOff: { Apply: () => { g.actorBatch?.SetEnabled(false); return () => g.actorBatch?.SetEnabled(true); } },
  };
  const wanted = ablate === "all" ? Object.keys(ABLATIONS) : ablate.split(",").filter((k) => ABLATIONS[k]);

  const SetupTrain = () => {};
  const SetupFront = () => {
    const rt = g.Debug.FirstLevelMissionRuntime();
    for (const f of ["trainShelling", "trainStopped", "unloadOrdersHeard", "unloaded"]) rt.Record(f);
    g.StepFrames(2, 1 / 60, false);
    const p = g.player.position;
    p.set(A.gun.x, g.battlefield.GroundHeight(A.gun.x, A.gun.z) + 0.1, A.gun.z);
    g.player.body?.Teleport(p.x, p.y, p.z); g.player.yaw = 0; g.player.pitch = 0;
    g.StepFrames(2, 1 / 60, false);
    g.StepFrames(300, 1 / 60, false);   // 5 s 战斗预热，让前沿真的打起来
  };
  const SetupFrontEast = () => { g.player.yaw = -Math.PI / 2; g.StepFrames(5, 1 / 60, true); };

  const out = { rendererName, timer: !!timer, viewport: [window.innerWidth, window.innerHeight],
    internal: [g.post.width, g.post.height], output: [g.post.outputWidth ?? g.post.width, g.post.outputHeight ?? g.post.height],
    quality: g.graphics?.quality ?? null, graphics: { ...g.graphics },
    autoQuality: g.autoQuality ? { enabled: g.autoQuality.enabled, step: g.autoQuality.step, scale: g.autoQuality.scale,
      ssr: g.autoQuality.ssr, contactShadows: g.autoQuality.contactShadows } : null,
    shadowPreset: g.lights?.csm ? { count: g.lights.csm.count, mapSize: g.lights.csm.mapSize,
      radii: g.lights.csm.radii.map((v) => R(v, 1)), bakeOrder: g.lights.csm.preset.bakeOrder } : null,
    views: {}, programs: 0, memory: null };

  const order = [["train", SetupTrain], ["front", SetupFront], ["frontEast", SetupFrontEast]];
  for (const [name, Setup] of order) {
    Setup();                                   // 机位必须按顺序建立（front 之后才有 frontEast）
    if (!views.includes(name)) continue;
    g.StepFrames(20, 0, true);
    const row = { baseline: await Sample(true), logicOnly: await Sample(false), actors: Actors(), materials: MaterialAudit() };
    row.passes = await Passes();
    row.draws = await DrawDump();
    row.ablations = {};
    // **交替 A/B**：这台机器上常年还跑着别的 agent 的浏览器测试，一条龙跑下来
    // 后面的项会整体比前面慢十几毫秒（第一版实测 baseline 从 19.7 漂到 45.9）。
    // 每一项都自带前后两次 baseline，只报**配对差**，绝对值只作参考。
    for (const key of wanted) {
      const before = await Sample(true);
      const Restore = ABLATIONS[key].Apply();
      g.StepFrames(20, 0, true);
      const off = await Sample(true);
      Restore();
      g.StepFrames(20, 0, true);
      const after = await Sample(true);
      const Pair = (field) => {
        const base = (before[field] + after[field]) / 2;
        return { off: off[field], base: R(base), delta: R(off[field] - base) };
      };
      row.ablations[key] = { gpu: Pair("gpuMs"), submit: Pair("submitMs"), calls: Pair("calls") };
    }
    out.views[name] = row;
  }
  out.programs = g.renderer.info.programs.length;
  out.memory = { ...g.renderer.info.memory };
  return out;
}

function PrintStrict(r) {
  console.log(`GPU ${r.rendererName} timer=${r.timer} boot=${(r.bootMs / 1000).toFixed(1)}s`);
  console.log(`viewport=${r.viewport.join("x")} internal=${r.internal.join("x")} output=${r.output.join("x")}`
    + ` programs=${r.programs} geo=${r.memory.geometries} tex=${r.memory.textures}`);
  console.log(`autoQuality=${JSON.stringify(r.autoQuality)} shadow=${JSON.stringify(r.shadowPreset)}`);
  for (const [name, row] of Object.entries(r.views)) {
    const b = row.baseline, l = row.logicOnly;
    console.log(`\n=== ${name} ===`);
    console.log(`  baseline  gpu=${b.gpuMs} submit=${b.submitMs} wall=${b.wallMs} calls=${b.calls}`
      + ` tris=${(b.triangles / 1e6).toFixed(2)}M gpuAll=[${b.gpuAll.join(", ")}]`);
    console.log(`  logicOnly gpu=${l.gpuMs} submit=${l.submitMs} wall=${l.wallMs}`);
    const a = row.actors;
    console.log(`  actors=${a.alive}/${a.total} lod=${JSON.stringify(a.lod)} scene=${a.sceneObjects}`
      + ` bones=${a.bones} skinned=${a.skinned}(vis ${a.skinnedVisible}) meshes=${a.meshes}(inst ${a.instanced})`
      + ` batch=${JSON.stringify(a.batch)}`);
    if (row.materials) console.log(`  materials=${row.materials.materials} mixedSkinInstance=${row.materials.mixedCount}`
      + ` ${JSON.stringify(row.materials.mixed)}`);
    const p = row.passes;
    console.log(`  passes(${p.frames}f) gpuTotal=${p.gpuTotal} cpuTotal=${p.cpuTotal} other=${p.other}`);
    for (const [k, v] of Object.entries(p.gpu).sort((x, y) => y[1] - x[1])) {
      console.log(`    ${k.padEnd(18)} gpu=${String(v).padEnd(7)} submit=${String(p.gpuCpu[k] ?? 0).padEnd(7)}`
        + ` draw=${String(p.passCalls[k] ?? 0).padEnd(7)} tris=${((p.passTris[k] || 0) / 1e6).toFixed(2)}M`);
    }
    console.log(`  cpu: ${Object.entries(p.cpu).sort((x, y) => y[1] - x[1]).map(([k, v]) => `${k}=${v}`).join(" ")}`);
    if (row.draws) {
      console.log("  draws by pass | subtree (per frame):");
      for (const [k, v] of Object.entries(row.draws)) console.log(`    ${String(v).padStart(7)}  ${k}`);
    }
    if (Object.keys(row.ablations || {}).length) {
      console.log("  ablations (配对 A/B：off vs 前后两次 baseline 的均值)：");
      for (const [k, v] of Object.entries(row.ablations)) {
        console.log(`    ${k.padEnd(20)} gpu ${String(v.gpu.off).padStart(6)} vs ${String(v.gpu.base).padStart(6)}`
          + ` Δ${String(v.gpu.delta).padStart(7)} | submit ${String(v.submit.off).padStart(6)} vs`
          + ` ${String(v.submit.base).padStart(6)} Δ${String(v.submit.delta).padStart(7)} | draw Δ${v.calls.delta}`);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 原有口径（活的一段：墙钟 + profiler.Summary）
// ---------------------------------------------------------------------------
async function LegacyProbe({ A, frames }) {
    const g = window.Tengxian, gl = g.renderer.getContext();
    const debug = gl.getExtension("WEBGL_debug_renderer_info");
    const rendererName = debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    g.state.menu = false;
    const profiler = g.profiler; profiler.Enable();
    const Round = (v) => Math.round(v * 100) / 100;
    const Pack = (s) => ({ fps: Round(s.fps), frameAvg: Round(s.frame.avg), frameP95: Round(s.frame.p95), frameMax: Round(s.frame.max),
      cpuAvg: Round(s.cpuTotal.avg), cpuP95: Round(s.cpuTotal.p95), cpuMax: Round(s.cpuTotal.max),
      cpu: Object.fromEntries(Object.entries(s.cpu).map(([k, v]) => [k, { avg: Round(v.avg), p95: Round(v.p95), max: Round(v.max) }]).sort((a, b) => b[1].avg - a[1].avg)),
      gpuTotal: s.gpuTotal ? { avg: Round(s.gpuTotal.avg), p95: Round(s.gpuTotal.p95), max: Round(s.gpuTotal.max) } : null,
      gpu: Object.fromEntries(Object.entries(s.gpu).map(([k, v]) => [k, { avg: Round(v.avg), max: Round(v.max) }]).sort((a, b) => b[1].avg - a[1].avg)),
      calls: s.calls, triangles: s.triangles, events: s.events, worst: s.worst ? { interval: Round(s.worst.interval), cpuMs: Round(s.worst.cpuMs), cpu: s.worst.cpu } : null });
    const Actors = () => {
      const soldiers = g.ai.soldiers;
      const lod = {};
      for (const s of soldiers) lod[s.renderLod || "none"] = (lod[s.renderLod || "none"] || 0) + 1;
      const inScene = soldiers.filter((s) => s.actor?.root?.parent).length;
      return { total: soldiers.length, alive: soldiers.filter((s) => s.alive).length, ija: soldiers.filter((s) => s.side === "ija" && s.alive).length,
        nra: soldiers.filter((s) => s.side === "nra" && s.alive).length, lod, inScene,
        sceneObjects: (() => { let n = 0; g.scene.traverse(() => n++); return n; })(),
        skinned: (() => { let n = 0; g.scene.traverse((o) => { if (o.isSkinnedMesh) n++; }); return n; })(),
        meshes: (() => { let n = 0, inst = 0; g.scene.traverse((o) => { if (o.isMesh) { n++; if (o.isInstancedMesh) inst++; } }); return { n, inst }; })() };
    };
    const Roots = () => g.scene.children.map((c) => { let meshes = 0, tris = 0, inst = 0, objs = 0; c.traverse((o) => { objs++; if (o.isMesh && o.visible) { meshes++; const geo = o.geometry; const n = (geo.index ? geo.index.count : geo.attributes.position?.count || 0) / 3; tris += n * (o.isInstancedMesh ? o.count : 1); if (o.isInstancedMesh) inst++; } }); return { name: c.name || c.type, objs, meshes, inst, tris: Math.round(tris) }; }).filter((r) => r.tris > 0 || r.objs > 20).sort((a, b) => b.tris - a.tris).slice(0, 40);
    const Sample = async (name) => {
      g.StepFrames(30, 1 / 60, true);
      const info = g.renderer.info; info.autoReset = false;
      const started = performance.now();
      for (let i = 0; i < frames; i++) { g.StepFrames(1, 1 / 60, true); if (i % 40 === 0) await new Promise((r) => setTimeout(r, 0)); }
      gl.finish();
      const wall = (performance.now() - started) / frames;
      info.reset(); g.StepFrames(1, 1 / 60, true);
      const render = { calls: info.render.calls, triangles: info.render.triangles, programs: info.programs.length, geometries: info.memory.geometries, textures: info.memory.textures };
      info.autoReset = true;
      await new Promise((r) => setTimeout(r, 50));
      const summary = Pack(profiler.Summary(600));
      return { name, wallMsPerFrame: Round(wall), render, summary, actors: Actors(), roots: Roots() };
    };
    const out = { rendererName, timer: profiler.timerAvailable, size: [g.post.width, g.post.height], quality: g.graphics?.quality ?? null, graphics: { ...g.graphics }, preset: { ...g.post.preset } };
    out.train = await Sample("train");
    // Force Support stage: record the facts the flow requires, let it advance, then teleport to the gun.
    const rt = g.Debug.FirstLevelMissionRuntime();
    for (const f of ["trainShelling", "trainStopped", "unloadOrdersHeard", "unloaded"]) rt.Record(f);
    g.StepFrames(2, 1 / 60, false);
    const stage0 = g.Debug.FirstLevelMission().stage;
    const p = g.player.position; p.set(A.gun.x, g.battlefield.GroundHeight(A.gun.x, A.gun.z) + 0.1, A.gun.z);
    g.player.body?.Teleport(p.x, p.y, p.z); g.player.yaw = 0; g.player.pitch = 0;
    g.StepFrames(2, 1 / 60, false);
    const enemiesBefore = [...rt.enemies].map(([id, a]) => ({ id, x: a.position.x, z: a.position.z, alive: a.alive, nc: !!a.scriptedNoncombatant }));
    g.StepFrames(300, 1 / 60, false); // 5 s battle warm-up
    const stage1 = g.Debug.FirstLevelMission().stage;
    out.front = await Sample("front");
    const enemiesAfter = [...rt.enemies].map(([id, a]) => ({ id, x: a.position.x, z: a.position.z, alive: a.alive, nc: !!a.scriptedNoncombatant, state: a.state, fire: a.lastFire, dist: Math.hypot(a.position.x - p.x, a.position.z - p.z) }));
    const moved = enemiesAfter.map((e) => { const b = enemiesBefore.find((x) => x.id === e.id); return { id: e.id, moved: b ? Math.round(Math.hypot(e.x - b.x, e.z - b.z) * 10) / 10 : null, alive: e.alive, nc: e.nc, state: e.state, dist: Math.round(e.dist), fired: e.fire > 0 }; });
    out.enemies = { stageBefore: stage0, stageAfter: stage1, count: moved.length, alive: moved.filter((e) => e.alive).length, movedOver2m: moved.filter((e) => e.moved > 2).length, fired: moved.filter((e) => e.fired).length, list: moved };
    // look sideways along the trench (east) to vary the view
    g.player.yaw = -Math.PI / 2; g.StepFrames(5, 1 / 60, true);
    out.frontEast = await Sample("frontEast");
    return out;
}

function PrintLegacy(result) {
  const Line = (s) => `${s.name.padEnd(10)} wall=${s.wallMsPerFrame}ms fps=${s.summary.fps} cpu=${s.summary.cpuAvg}/${s.summary.cpuP95}/${s.summary.cpuMax} gpu=${s.summary.gpuTotal ? s.summary.gpuTotal.avg + "/" + s.summary.gpuTotal.max : "n/a"} calls=${s.render.calls} tris=${(s.render.triangles / 1e6).toFixed(2)}M actors=${s.actors.alive}/${s.actors.total} lod=${JSON.stringify(s.actors.lod)} scene=${s.actors.sceneObjects} skinned=${s.actors.skinned} meshes=${s.actors.meshes.n}(${s.actors.meshes.inst})`;
  console.log(`GPU ${result.rendererName} timer=${result.timer} size=${result.size} boot=${(result.bootMs / 1000).toFixed(1)}s quality=${JSON.stringify(result.graphics)}`);
  for (const s of [result.train, result.front, result.frontEast]) {
    console.log(Line(s));
    console.log("   cpu:", Object.entries(s.summary.cpu).slice(0, 10).map(([k, v]) => `${k}=${v.avg}/${v.max}`).join(" "));
    console.log("   gpu:", Object.entries(s.summary.gpu).slice(0, 10).map(([k, v]) => `${k}=${v.avg}`).join(" "));
    console.log("   events:", JSON.stringify(s.summary.events), "worst:", JSON.stringify(s.summary.worst));
    console.log("   roots:", s.roots.slice(0, 14).map((r) => `${r.name}:${(r.tris / 1e3).toFixed(0)}k/${r.meshes}m/${r.objs}o`).join(" "));
  }
  console.log("enemies:", JSON.stringify({ ...result.enemies, list: undefined }));
  console.log("   list:", result.enemies.list.map((e) => `${e.id}:${e.moved}m${e.fired ? "*" : ""}${e.nc ? "(nc)" : ""}${e.alive ? "" : "(dead)"}@${e.dist}`).join(" "));
}
