// 《台儿庄：血战滕县》第一关整帧取证：车厢内 / 前沿开战（朝北）/ 前沿（朝东）三个固定机位，
// 默认画质 1920×1080，读 Script_Profiler 的 CPU 分桶、GPU 分段、GC 事件、draw call / 三角形，
// 并记录前沿日军 4 秒内的位移与开火，落 `_shots/FirstLevelFrame/Perf_<label>.json`。
//
// 用法：node Taierzhuang1938/Script_FirstLevelFrameProbe.mjs [--label=名字] [--quality=high|medium|low] [--frames=240]
// 这是取证口不是门禁：同机前后两次对照（见 docs/Data_FirstLevelRebuildAcceptance.md r13），GPU 段
// 逐次波动约 ±1 ms，比较时看 calls / tris / allocKbPerFrame 与 fps 的同向变化。
import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";
import { MISSION_ANCHORS as A } from "./Data_FirstLevelMissionLayout.mjs";
const project = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(project, "..");
const outDir = path.join(project, "_shots", "FirstLevelFrame");
await fs.mkdir(outDir, { recursive: true });
const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || "").split("=")[1] || d;
const label = arg("label", "probe"), quality = arg("quality", ""), frames = Number(arg("frames", "240"));
const server = await ServeRoot(root, 0);
const browser = await LaunchBrowser();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 300)));
page.on("console", (m) => { if (m.type() === "error" && !/fonts\./.test(m.location()?.url || "")) errors.push("CONSOLE " + m.text().slice(0, 300)); });
const t0 = Date.now();
let result = null;
try {
  const q = quality ? `&quality=${quality}` : "";
  await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/?whitebox=p012&shot=1&manual=1${q}`, { waitUntil: "domcontentloaded", timeout: 240000 });
  await page.waitForFunction(() => window.Tengxian?.state?.ready, null, { timeout: 300000 });
  const bootMs = Date.now() - t0;
  result = await page.evaluate(async ({ A, frames }) => {
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
  }, { A, frames });
  result.bootMs = bootMs;
} finally {
  await browser.close(); server.close();
}
const file = path.join(outDir, `Perf_${label}.json`);
await fs.writeFile(file, JSON.stringify({ result, errors }, null, 2));
const Line = (s) => `${s.name.padEnd(10)} wall=${s.wallMsPerFrame}ms fps=${s.summary.fps} cpu=${s.summary.cpuAvg}/${s.summary.cpuP95}/${s.summary.cpuMax} gpu=${s.summary.gpuTotal ? s.summary.gpuTotal.avg + "/" + s.summary.gpuTotal.max : "n/a"} calls=${s.render.calls} tris=${(s.render.triangles / 1e6).toFixed(2)}M actors=${s.actors.alive}/${s.actors.total} lod=${JSON.stringify(s.actors.lod)} scene=${s.actors.sceneObjects} skinned=${s.actors.skinned} meshes=${s.actors.meshes.n}(${s.actors.meshes.inst})`;
if (result) {
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
for (const e of errors) console.log(e);
console.log("saved", file);
