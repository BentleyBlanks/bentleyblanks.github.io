// 大刀握法审查（2026-11-05 起）：Tool_MixamoAnimationPreview.html 里挂大刀的动作，按工具自己的挂法（window.__preview.Place()）
// 逐帧量人物蒙皮的手掌 / 手指离 Model_Dadao 刀柄多远、陷进去多深。Script_MixamoClipFix.py 的 grip（手指贴刀柄）改前改后都用它量，
// Script_MixamoClipFixRecords.mjs 的 --grip-before / --grip-after 读它的输出。
//   node Taierzhuang1938/_import/MixamoFixes/Script_DadaoGripAudit.mjs [--only=Idle_V1,Slash_V1] [--step=1] [--out=<file.jsonl>]
//                                                                    [--clip-dir=<相对 Taierzhuang1938/ 的目录>] [--who=luo] [--frames=<file.json>]
// --clip-dir：量别的目录里的同名 GLB（Blender 试烘 --out 的产物），挂法照工具；--who：换人物（键见 Data_XBotCharacters.mjs）；
// --frames：逐帧原始数写成 JSON。每条动作输出一行 JSON：{ file, who, frames, grip: { Right, Left } }。
// 刀的实体（刀坐标、米，按 Model_Dadao.tzm.json 顶点逐段量的）：两块的并集
//   刀柄  圆角矩形截面：x ±0.0097、y -0.0215…0.0205、圆角半径 0.006，z 0.000…0.205（截面不是椭圆：y ±15 mm 处仍宽 ±9.5 mm）
//   护手  yz 平面里的椭圆板：中心 (y 0.0045, z -0.0275)、半轴 y 0.0485 / z 0.020，x 厚 ±0.0086
// 柄尾铁环（z 0.21…0.27，细环）不算：搭在环上的手指记成离刀柄尾端的距离。
// 每只手的握点（刀柄轴线该过的那一点）直接问工具：__preview.DadaoGripPoint(side)（世界坐标，跟工具挂刀用的同一个算法）。
//   右手一直算握着；左手握点离刀柄轴线 < 0.0275 m、z 在 -0.015…0.27 之间的帧算握着（onFrac = 握着的帧占比）。
//   顶点按主权重（≥ 0.5）分到手掌（<Side>Hand）和各指三节（<Finger>1–3，4 号指尖骨并进第 3 节），只看握着的帧：
//   palmPenMm         手掌顶点陷进刀里最深（mm）
//   fingerPenMm       每根手指三节里陷进最深（mm，所有握着的帧的最大值）；fingerPenP95Mm 同上取第 95 百分位
//   fingerGapMedMm    每根手指三节里离刀面最近的那个距离（陷进去记 0），所有握着的帧取中位数（mm）：≈ 0 = 贴着
import path from "node:path";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
const repo = path.resolve(import.meta.dirname, "..", "..", "..");
const { LaunchBrowser } = await import(pathToFileURL(path.join(repo, "PrairieFire1937", "Script_BrowserTestKit.mjs")));
const { ServeRoot } = await import(pathToFileURL(path.join(repo, "Taierzhuang1938", "Script_DevServer.mjs")));
const flags = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith("--")).map((a) => { const [k, v] = a.slice(2).split("="); return [k, v ?? "1"]; }));
const manifest = JSON.parse(fs.readFileSync(path.join(repo, "Taierzhuang1938", "Animation", "Mixamo", "Data_MixamoLibrary.json"), "utf8"));
let files = manifest.clips.filter((c) => c.prop === "大刀" && !c.dropped).map((c) => c.file);
if (flags.only) files = files.filter((f) => flags.only.split(",").some((s) => f.includes(s)));
const step = Number(flags.step || 1), who = flags.who || "xbot";

const server = await ServeRoot(repo, 0), browser = await LaunchBrowser();
const base = `http://127.0.0.1:${server.address().port}/Taierzhuang1938/Tool_MixamoAnimationPreview.html`;
const out = flags.out ? fs.createWriteStream(flags.out) : null, raw = [];
try {
  const page = await browser.newPage({ viewport: { width: 320, height: 240 } });
  page.on("pageerror", (e) => console.error("[pageerror]", String(e)));
  await page.goto(who === "xbot" ? base : `${base}?who=${who}`);
  await page.waitForFunction(() => window.__preview?.action && window.__preview.dadao, null, { timeout: 180000 });
  for (const file of files) {
    const r = await page.evaluate(Measure, { file, step, clipDir: flags["clip-dir"] || null });
    raw.push(r);
    const line = JSON.stringify({ file, who, frames: r.frames.length, grip: Summarize(r) });
    if (out) out.write(line + "\n");
    console.log(line);
  }
} finally { await browser.close(); server.close(); out?.end(); }
if (flags.frames) fs.writeFileSync(flags.frames, JSON.stringify(raw, null, 1));

function Summarize(r) {
  const o = {};
  const mm = (x) => +(x * 1000).toFixed(1);
  const pct = (arr, p) => { const a = [...arr].sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(p * a.length))]; };
  for (const s of ["Right", "Left"]) {
    const on = r.frames.filter((f) => f[s].on);
    const h = { onFrac: +(on.length / r.frames.length).toFixed(2) };
    if (on.length) {
      h.palmPenMm = mm(Math.max(...on.map((f) => f[s].pen.palm ?? 0)));
      h.fingerPenMm = {}; h.fingerPenP95Mm = {}; h.fingerGapMedMm = {};
      for (const fg of ["Thumb", "Index", "Middle", "Ring", "Pinky"]) {
        const pen = on.map((f) => Math.max(0, ...[1, 2, 3].map((k) => f[s].pen[fg + k] ?? 0)));
        const gap = on.map((f) => Math.min(...[1, 2, 3].map((k) => f[s].gap[fg + k] ?? 1)));
        h.fingerPenMm[fg] = mm(Math.max(...pen)); h.fingerPenP95Mm[fg] = mm(pct(pen, 0.95)); h.fingerGapMedMm[fg] = mm(pct(gap, 0.5));
      }
    }
    o[s] = h;
  }
  return o;
}

async function Measure({ file, step, clipDir }) {
  const P = window.__preview, ch = P.character;
  const V = P.camera.position.constructor, M4 = P.camera.matrixWorld.constructor;
  if (clipDir) {
    // 量别的目录里的同名 GLB：临时把清单条目的 file 指过去，挂法照工具
    const entry = P.manifest.clips.find((c) => c.file === file);
    entry.file = `../../${clipDir}/${file}`;
  }
  await P.SelectFile(clipDir ? `../../${clipDir}/${file}` : file);
  const action = P.action, clip = action.getClip(), mixer = action.getMixer();
  action.paused = true;
  const HANDLE = { hx: 0.0097, hy: 0.0210, cy: -0.0005, rc: 0.006, z0: 0.0, z1: 0.205 };
  const GUARD = { hx: 0.0086, ay: 0.0485, cy: 0.0045, az: 0.020, cz: -0.0275 };
  const N = 96, cosT = [], sinT = [];
  for (let i = 0; i < N; i++) { cosT.push(Math.cos(2 * Math.PI * i / N)); sinT.push(Math.sin(2 * Math.PI * i / N)); }
  // 平面上到椭圆 (u/a)² + (v/b)² = 1 的有符号距离（> 0 在外面）
  function Ellipse(u, v, a, b) {
    let best = Infinity, bi = 0;
    for (let i = 0; i < N; i++) { const du = u - a * cosT[i], dv = v - b * sinT[i], d = du * du + dv * dv; if (d < best) { best = d; bi = i; } }
    let lo = (bi - 1) * 2 * Math.PI / N, hi = (bi + 1) * 2 * Math.PI / N;
    const f = (t) => (u - a * Math.cos(t)) ** 2 + (v - b * Math.sin(t)) ** 2;
    for (let it = 0; it < 20; it++) { const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3; if (f(m1) < f(m2)) hi = m2; else lo = m1; }
    return Math.sqrt(f((lo + hi) / 2)) * (((u / a) ** 2 + (v / b) ** 2 < 1) ? -1 : 1);
  }
  // 截面距离 d2 与沿挤出方向的距离 dl 合成实体的有符号距离
  const Extrude = (d2, dl) => (d2 < 0 && dl < 0 ? Math.max(d2, dl) : Math.hypot(Math.max(d2, 0), Math.max(dl, 0)));
  // 刀柄：圆角矩形截面沿 z 挤出
  function HandleSd(x, y, z) {
    const E = HANDLE, qx = Math.abs(x) - (E.hx - E.rc), qy = Math.abs(y - E.cy) - (E.hy - E.rc);
    const d2 = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - E.rc;
    return Extrude(d2, Math.max(E.z0 - z, z - E.z1));
  }
  // 护手：yz 平面里的椭圆板，沿 x 厚 ±hx
  const GuardSd = (x, y, z) => Extrude(Ellipse(y - GUARD.cy, z - GUARD.cz, GUARD.ay, GUARD.az), Math.abs(x) - GUARD.hx);
  const Sd = (x, y, z) => Math.min(HandleSd(x, y, z), GuardSd(x, y, z));
  const FINGERS = ["Thumb", "Index", "Middle", "Ring", "Pinky"];
  const partOf = {};
  for (const s of ["Right", "Left"]) {
    partOf[`${s}Hand`] = [s, "palm"];
    for (const f of FINGERS) for (const k of [1, 2, 3, 4]) partOf[`${s}Hand${f}${k}`] = [s, f + Math.min(k, 3)];
  }
  const meshes = [];
  ch.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    const si = o.geometry.attributes.skinIndex, sw = o.geometry.attributes.skinWeight, idx = [];
    for (let i = 0; i < si.count; i++) {
      let best = -1, bw = 0;
      for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); if (w > bw) { bw = w; best = si.getComponent(i, k); } }
      const part = partOf[o.skeleton.bones[best]?.name];
      if (part && bw >= 0.5) idx.push([i, part]);
    }
    meshes.push({ o, idx });
  });
  const B = (n) => ch.getObjectByName(n), v = new V(), inv = new M4();
  const fps = 30, n = Math.max(1, Math.round(clip.duration * fps)), frames = [];
  for (let i = 0; i <= n; i += step) {
    action.time = Math.min(i / fps, clip.duration - 1e-4); mixer.update(0); P.Place();
    ch.updateMatrixWorld(true); P.dadao.updateMatrixWorld(true);
    inv.copy(P.dadao.matrixWorld).invert();
    const f = { i };
    for (const s of ["Right", "Left"]) {
      if (typeof P.DadaoGripPoint !== "function") throw new Error("工具没有导出 __preview.DadaoGripPoint(side)");
      const palm = P.DadaoGripPoint(s).applyMatrix4(inv);
      const radial = Math.hypot(palm.x, palm.y - HANDLE.cy);
      f[s] = { radial, z: palm.z, on: s === "Right" || (radial < 0.0275 && palm.z > -0.015 && palm.z < 0.27), pen: {}, gap: {} };
    }
    for (const { o, idx } of meshes) {
      for (const [vi, [s, part]] of idx) {
        o.getVertexPosition(vi, v); v.applyMatrix4(o.matrixWorld).applyMatrix4(inv);
        if (Math.abs(v.x) > 0.08 || Math.abs(v.y) > 0.1 || v.z < -0.08 || v.z > 0.3) continue;
        const d = Sd(v.x, v.y, v.z);
        const F = f[s];
        if (d < 0) F.pen[part] = Math.max(F.pen[part] ?? 0, -d);
        if (part !== "palm") F.gap[part] = Math.min(F.gap[part] ?? 1, Math.max(0, d));
      }
    }
    for (const s of ["Right", "Left"]) {
      for (const k of Object.keys(f[s].pen)) f[s].pen[k] = +f[s].pen[k].toFixed(4);
      for (const k of Object.keys(f[s].gap)) f[s].gap[k] = +f[s].gap[k].toFixed(4);
      f[s].radial = +f[s].radial.toFixed(4); f[s].z = +f[s].z.toFixed(4);
    }
    frames.push(f);
  }
  return { file, frames };
}
