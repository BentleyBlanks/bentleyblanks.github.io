// ===========================================================================
// Script_EditorBlockoutPrevizRuntimeBrowserTest.mjs —— 白盒预演运行时补齐（2026-10-19）的浏览器闸门
//
// 跑法：node Taierzhuang1938/Script_EditorBlockoutPrevizRuntimeBrowserTest.mjs
// 口径：docs/Data_EditorBlockout.md §5.6（百姓的骨骼占位身体）、§14.1 aircraft / slowmo、§14.2。
//
// 在 FirstLevel0610 的 06-2 上注入一段预演（page.route，不碰盘上的数据），钉住：
//   1. 百姓（Geng）、小孩（Nier）、国军 / 日军军官（spawn）都能播预演动作库的片段：Probe 报 shownClip、姿态真的变了
//      （蹲下片段骨盆比站着低、举手片段手比没片段时高）；body:"procedural" 的百姓还是旧的程序化身体（开关有效）；
//   2. 飞机：模型载进来、Seek 到航线中段飞机在相机视锥里、位置等于 SamplePrevizAircraft；扫射段里简易特效画出土点；
//   3. 慢动作：窗口里 State().timeScale ≈ rate、墙上跑 0.9 s 预演只走约 0.3 倍、人物动画时钟也按同样倍率走；窗口外是 1；
//   4. 播完 / 中断：飞机克隆还回机队、引擎声停、State().aircraft 清空；全程没有未捕获错误。
//   5. 2026-10-20 挂到车上（ride）：一辆 spawn 的驴车走起来，坐车尾的小孩（VilSitEdge）与车板上的担架跟着走、位置 = 车位姿 ∘ 本地偏移、
//      小孩骨盆高度落在车尾板顶（车底下地面 + 1.025）±0.1 m、不播走路；
//   6. 2026-10-20 url 音效：babyCry 的文件（测试用 page.route 喂一段生成的 WAV，不依赖代理 S 的产物）解码进声库并真的放出一条 voice；
//      cellarSob 的文件 404 → 只警告一次、记进 missingSfx，预演照播。这一趟因此**不带 audio=0**（要音频上下文）。
// 截图存 _shots/EditorBlockoutPrevizRuntime/（不提交）。
// ===========================================================================

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";
import { NormalizeBlockout } from "./Script_EditorBlockoutConfig.mjs";
import { NormalizeBlockoutPreviz, ValidateBlockoutPreviz, SamplePrevizAircraft, PrevizTimeScale } from "./Script_EditorBlockoutPrevizPlan.mjs";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(projectDir, "..");
const shotDir = path.join(projectDir, "_shots", "EditorBlockoutPrevizRuntime");
await fs.mkdir(shotDir, { recursive: true });

const results = [];
function Check(name, ok, detail = "") {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? "  — " + detail : ""}`);
}
const J = (v) => JSON.stringify(v);

const LEVEL = "FirstLevel0610", KF = "06-2";
// 驴车座位（Script_EditorBlockoutPuppets.BLOCKOUT_CART_SEATS，这里不 import three 模块，照抄数字并在下面核对 Probe）：
// 车板顶 1.025 m；坐车尾的小孩根离车底下地面 = 1.025 − VilSitEdge 坐高 0.90 × 0.62 = 0.467；担架平放车板上 = 1.025 + 0.05
const CART_BED_TOP = 1.025, SIT_CLIP_H = 0.9, CHILD_SCALE = 0.62;
const RIDE_KID_Y = +(CART_BED_TOP - SIT_CLIP_H * CHILD_SCALE).toFixed(3);
const CART_LITTER_Y = CART_BED_TOP + 0.05;
/** 测试用的一段 0.4 s、22.05 kHz 单声道 400 Hz 正弦 WAV（给 babyCry 的 url 顶上，不依赖代理 S 的产物）。 */
function TestWav() {
  const rate = 22050, n = Math.round(rate * 0.4);
  const buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write("WAVE", 8); buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write("data", 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(Math.sin(i / rate * 400 * 2 * Math.PI) * 12000 * Math.min(1, (n - i) / (rate * 0.05))), 44 + i * 2);
  return buf;
}
const config = NormalizeBlockout(JSON.parse(await fs.readFile(path.join(projectDir, "Blockout", `${LEVEL}.json`), "utf8")));
const kf = config.keyframes.find(k => k.id === KF);
assert.ok(kf, `${LEVEL} 里要有关键帧 ${KF}`);
assert.ok(kf.units.some(u => u.id === "Geng" && u.kind === "civilian") && kf.units.some(u => u.id === "Nier" && u.kind === "child"), "06-2 要有老耿（civilian）与妮儿（child）");

// 注入的预演：百姓 / 小孩 / 军官放片段，一架 Ki-30 由北往南掠过并扫射一段，7–8.5 s 慢动作 0.3 倍
const previzDoc = {
  schema: "tengxian-blockout-previz/1", level: LEVEL,
  sequences: [{
    keyframe: KF, title: "运行时补齐测试", then: "stay", durationS: 20,
    // 老耿、妮儿在干沟沟底（地面约 −0.8），岸上（+2.15）往下看被沟沿挡住：机位跟着演员锚放进沟里
    camera: [
      { t: 0, dur: 3, from: { actor: "Geng", offset: [2.6, 1.4, -2.2] }, look: { actor: "Geng", offset: [0, 0.9, 0] }, fov: 50 },
      { t: 3, dur: 3, from: { actor: "OfficerN", offset: [-1.2, 1.5, 3.2] }, look: { actor: "OfficerN", offset: [-1.0, 0.8, 0] }, fov: 55 },
      { t: 6, dur: 8, from: { x: 52, z: 162, h: 2.0 }, look: { aircraft: "Ki30A" }, fov: 60 },
      // 14 s 起看驴车：坐车尾的小孩与车板上的担架跟着车走
      { t: 14, dur: 6, from: { actor: "TestCart", offset: [3.4, 2.0, 3.2] }, look: { actor: "TestCart", offset: [0, 1.0, 0.6] }, fov: 50 },
    ],
    actors: [
      { id: "Geng", keys: [{ t: 0, clip: "PvStandPointL" }, { t: 4, clip: "PvCrouchCountFingers" }, { t: 9, clip: null }] },
      { id: "Nier", keys: [{ t: 0, clip: "PvProneBeckonL" }, { t: 9, clip: null }] },
      { id: "OfficerN", spawn: { side: "nra", kind: "officer", x: 50, z: 160, yawDeg: 180 }, keys: [{ t: 0, clip: "PvStandPointL" }, { t: 4, clip: "PvCrouchCountFingers" }, { t: 9, clip: null }] },
      { id: "OfficerJ", spawn: { side: "ija", kind: "officer", x: 48, z: 160, yawDeg: 180 }, keys: [{ t: 0, clip: "PvStandPointL" }, { t: 4, clip: "PvCrouchCountFingers" }, { t: 9, clip: null }] },
      { id: "ProcGeng", spawn: { side: "civ", kind: "civilian", body: "procedural", x: 46, z: 160, yawDeg: 180 }, keys: [{ t: 0, clip: "PvStandPointL" }] },
      { id: "Walker", spawn: { side: "nra", kind: "soldier", x: 44, z: 166, yawDeg: 0 }, keys: [{ t: 16, x: 44, z: 146, move: "walk" }] },
      // clipRelease：带停住段的片段到这一秒放开、接着放出口；不写就一直在停住段里循环
      { id: "PinRel", spawn: { side: "ija", kind: "soldier", x: 42, z: 160, yawDeg: 180 }, keys: [{ t: 12, clip: "VilIjaPinBayonet", clipHold: true, clipRelease: 2 }] },
      { id: "PinHold", spawn: { side: "ija", kind: "soldier", x: 40, z: 160, yawDeg: 180 }, keys: [{ t: 12, clip: "VilIjaPinBayonet", clipHold: true }] },
      // 2026-10-20 挂到车上：驴车朝北走 12 m（19 s 到，walk 1.4 → 约 10.4 s 出发）；小孩坐车尾（本地 z +1.2 = 车尾沿，背对车头），担架平放车板上
      { id: "TestCart", spawn: { side: "civ", kind: "cart", x: 38, z: 172, yawDeg: 0 }, keys: [{ t: 19, x: 38, z: 160, move: "walk" }] },
      { id: "Kid", spawn: { side: "civ", kind: "child", x: 38, z: 173.5, yawDeg: 180, ride: { on: "TestCart", x: 0, z: 1.2, y: RIDE_KID_Y, yawDeg: 180 } }, keys: [{ t: 0, clip: "VilSitEdge" }] },
      { id: "TestLitter", spawn: { side: "nra", kind: "litter", bearers: 0, x: 38, z: 171, ride: { on: "TestCart", x: 0, z: -0.2, y: CART_LITTER_Y } }, keys: [] },
    ],
    aircraft: [{
      id: "Ki30A", model: "MitsubishiKi30",
      path: [{ t: 6, x: 60, h: 120, z: -150 }, { t: 12, x: 58, h: 60, z: 150 }, { t: 18, x: 50, h: 95, z: 450 }],
      strafe: [{ t0: 10, t1: 11.5, from: { x: 60, z: 120 }, to: { x: 60, z: 175 } }],
      sound: { drone: true, diveT: 9 },
    }],
    slowmo: [{ t: 7, dur: 1.5, rate: 0.3, fade: 0.25 }],
    lines: [],
    // url 音效：babyCry 的文件由 page.route 喂 WAV；cellarSob 的文件 404（放两次，只该警告一次）
    events: [
      { t: 2.0, type: "sfx", name: "babyCry", x: 50, z: 158 },
      { t: 2.2, type: "sfx", name: "cellarSob", x: 50, z: 158 },
      { t: 2.4, type: "sfx", name: "cellarSob", x: 50, z: 158, volume: 0.5 },
    ],
  }],
};
const check = ValidateBlockoutPreviz(previzDoc, { config });
Check("注入的预演过校验", check.ok, check.errors.join("；"));
const seq = NormalizeBlockoutPreviz(previzDoc).sequences[0];

// ---------------------------------------------------------------------------
const server = await ServeRoot(rootDir, 0);
const port = server.address().port;
const browser = await LaunchBrowser();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
const sfxWarnings = [];
page.on("pageerror", (error) => errors.push(`PAGEERROR ${String(error).slice(0, 300)}`));
page.on("console", (message) => {
  if (message.type() === "warning" && /音效文件读不到/.test(message.text())) sfxWarnings.push(message.text());
  if (message.type() !== "error") return;
  const url = message.location()?.url || "";
  if (/fonts\.(googleapis|gstatic)\.com/.test(url)) return;
  if (/__blockout/.test(url) || /__blockout/.test(message.text())) return;
  // 还没烘出来的预演动作库（Data_BlockoutPrevizClips 名单里的，如 PrevizCombat）：清单 404 是预期的，运行时只警告一次
  if (/\/Animation\/Previz\w+\/Data_Previz\w+Animation\.json/.test(url) && /404/.test(message.text())) return;
  // 测试故意让 cellarSob 的文件 404
  if (/\/Audio\/BlockoutPreviz\//.test(url) && /404/.test(message.text())) return;
  errors.push(`CONSOLE ${message.text().slice(0, 240)} @ ${url}`);
});
// url 音效：babyCry 喂一段生成的 WAV（decodeAudioData 认内容不认后缀）；cellarSob 404
await page.route(/\/Audio\/BlockoutPreviz\/Sfx_BabyCry\.mp3/, (route) => route.fulfill({ status: 200, contentType: "audio/wav", body: TestWav() }));
await page.route(/\/Audio\/BlockoutPreviz\/Sfx_CellarSob\.mp3/, (route) => route.fulfill({ status: 404, contentType: "text/plain", body: "not yet" }));
const B = (fn, arg) => page.evaluate(fn, arg);
async function Wait(predicate, arg, timeout = 15000) {
  try { await page.waitForFunction(predicate, arg, { timeout, polling: 50 }); return true; } catch (error) { return false; }
}
const Seek = (t) => B(async (t) => {
  const Bl = window.Tengxian.Debug.Blockout;
  const s = await Bl.Previz.Seek(t);
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  return s;
}, t);
const Probe = (id) => B((id) => window.Tengxian.Debug.Blockout.Probe(id), id);
const Shot = (name) => page.screenshot({ path: path.join(shotDir, name) });

try {
  console.log("--- boot");
  // 2026-10-20 起不带 audio=0：url 音效要音频上下文（浏览器本身 --mute-audio 静音）
  await page.goto(`http://127.0.0.1:${port}/Taierzhuang1938/?editor=blockout&level=${LEVEL}&kf=${KF}&quality=whitebox&scale=small`,
    { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => window.Tengxian?.state?.ready && window.Tengxian?.Debug?.Blockout?.State().ready, null, { timeout: 300000 });
  await page.route(new RegExp(`/Blockout/${LEVEL}\\.previz\\.json`), (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(previzDoc) }));
  await B(() => window.Tengxian.Debug.Blockout.Previz.Reload());
  const has = await Wait((id) => window.Tengxian.Debug.Blockout.Previz.Has(id), KF, 10000);
  Check("注入预演后 06-2 有预演", has);

  // 开播（Prepare 会等动作库下完）
  await B(() => { window.__previzDone = null; window.Tengxian.Debug.Blockout.Previz.Play().then(v => { window.__previzDone = v; }); });
  const playing = await Wait(() => window.Tengxian.Debug.Blockout.Previz.State().playing, null, 120000);
  Check("预演开播（动作库与飞机模型都准备好了）", playing);

  // 1) 百姓 / 小孩 / 军官的片段
  console.log("--- clips on civilians / officers");
  const s15 = await Seek(1.5);
  const at15 = {};
  for (const id of ["Geng", "Nier", "OfficerN", "OfficerJ", "ProcGeng", "Luo"]) at15[id] = await Probe(id);
  await Shot("Clips_t1.5.png");
  const s55 = await Seek(5.5);
  const at55 = {};
  for (const id of ["Geng", "Nier", "OfficerN", "OfficerJ"]) at55[id] = await Probe(id);
  await Shot("Clips_t5.5.png");
  await Seek(9.5);
  const at95 = {};
  for (const id of ["Geng", "Nier", "OfficerN", "OfficerJ"]) at95[id] = await Probe(id);
  const Brief = (p) => p && ({ body: p.body, model: p.modelId, clip: p.shownClip, pelvis: +p.pelvisAboveGround?.toFixed(2), handL: p.handL ? +(p.handL.y - p.pelvisY).toFixed(2) : null, hidden: p.hiddenParts });
  const geng = at15.Geng;
  Check("老耿（civilian）是骨骼占位身体：NRA02 骨架、帽徽 / 枪套 / 带子藏掉、布换了色",
    geng?.body === "rig" && geng.rigged && geng.modelId === "TengxianNra02" && geng.hiddenParts >= 2 && geng.weapon === null, J(Brief(geng)));
  Check("老耿 1.5 s 在播 PvStandPointL（举手指）：手比站着没片段时高 ≥ 0.25 m",
    geng?.shownClip === "PvStandPointL" && at95.Geng?.shownClip == null && (geng.handL.y - geng.pelvisY) - (at95.Geng.handL.y - at95.Geng.pelvisY) >= 0.25,
    J({ clip: Brief(geng), native: Brief(at95.Geng) }));
  Check("老耿 5.5 s 在播 PvCrouchCountFingers（蹲着数手指）：骨盆比站着低 ≥ 0.25 m",
    at55.Geng?.shownClip === "PvCrouchCountFingers" && at95.Geng.pelvisAboveGround - at55.Geng.pelvisAboveGround >= 0.25, J({ crouch: Brief(at55.Geng), native: Brief(at95.Geng) }));
  const nier = at15.Nier;
  // 06-2 的妮儿本来是蹲着的（stance crouch），比骨盆：趴着 < 0.3 m，比头：没片段时（蹲着）头比趴着高 ≥ 0.15 m
  Check("妮儿（child，缩 0.62）在播 PvProneBeckonL（趴着招手）：骨盆离地 < 0.3 m、没片段时头抬回来",
    nier?.body === "rig" && nier.shownClip === "PvProneBeckonL" && nier.pelvisAboveGround < 0.3 && at95.Nier.headAboveGround > nier.headAboveGround + 0.15,
    J({ prone: { ...Brief(nier), head: +nier?.headAboveGround?.toFixed(2) }, native: { ...Brief(at95.Nier), head: +at95.Nier?.headAboveGround?.toFixed(2) } }));
  for (const [id, label] of [["OfficerN", "国军军官"], ["OfficerJ", "日军军官"]]) {
    const a = at15[id], b = at55[id], c = at95[id];
    Check(`${label}能播片段：1.5 s PvStandPointL、5.5 s PvCrouchCountFingers 骨盆低 ≥ 0.25 m、9.5 s 回原生`,
      a?.shownClip === "PvStandPointL" && b?.shownClip === "PvCrouchCountFingers" && c?.shownClip == null && c.pelvisAboveGround - b.pelvisAboveGround >= 0.25 && a.rigged,
      J({ a: Brief(a), b: Brief(b), c: Brief(c) }));
  }
  const proc = at15.ProcGeng;
  Check("body:\"procedural\" 的百姓还是旧的程序化身体（开关有效）：没有骨架、不播片段", proc && proc.body === "procedural" && !proc.rigged && proc.shownClip == null, J(Brief(proc)));
  const missing = s55.missingClips.filter(c => /Pv(StandPointL|CrouchCountFingers|ProneBeckonL)/.test(c));
  Check("这几段片段没有一具骨架缺（missingClips 里没有它们）", missing.length === 0, J(missing));

  // 2) 飞机
  console.log("--- aircraft");
  const s9 = await Seek(9);
  const air9 = await B(() => {
    const T = window.Tengxian, Bl = T.Debug.Blockout, s = Bl.Previz.State();
    const plane = s.aircraft[0];
    const cam = T.camera;
    let ndc = null;
    if (plane) {
      const V = cam.position.constructor;   // THREE.Vector3（页面不另挂 THREE）
      cam.updateMatrixWorld(true);
      const v = new V(plane.x, plane.y, plane.z).project(cam);
      ndc = { x: +v.x.toFixed(3), y: +v.y.toFixed(3), z: +v.z.toFixed(3) };
    }
    const group = T.scene.getObjectByName("BlockoutPrevizAircraft");
    // 航点的 h 按航点自己脚下的地面换世界高：把三处地面带回来给 node 侧算 want
    const grounds = [[60, -150], [58, 150], [50, 450]].map(([x, z]) => [x, z, Bl.StandAt(x, z)]);
    return { plane, ndc, missingModels: s.missingModels, children: group ? group.children.filter(c => c.visible).length : -1, grounds,
      cam: { x: +cam.position.x.toFixed(2), y: +cam.position.y.toFixed(2), z: +cam.position.z.toFixed(2) } };
  });
  const groundAt = (x, z) => air9.grounds.find(g => Math.abs(g[0] - x) < 1e-6 && Math.abs(g[1] - z) < 1e-6)?.[2] ?? 0;
  const want9 = SamplePrevizAircraft(seq.aircraft[0], 9, { groundAt });
  Check("Seek(9) 飞机载进来、可见、位置等于 SamplePrevizAircraft（xz < 0.5 m、高 = 航点脚下地面 + h）",
    air9.plane?.loaded && air9.plane.visible && air9.children === 1 && air9.missingModels.length === 0
      && Math.hypot(air9.plane.x - want9.x, air9.plane.z - want9.z) < 0.5 && Math.abs(air9.plane.y - want9.y) < 0.5, J({ got: air9.plane, want: { x: want9.x, y: want9.y, z: want9.z } }));
  // 镜头 look 的就是飞机锚：飞机正在画面中央（NDC 0,0），深度在 (0, 1]
  Check("Seek(9) 飞机在相机视锥里、正对画面中央（镜头 look 飞机锚）", air9.ndc && Math.abs(air9.ndc.x) < 0.05 && Math.abs(air9.ndc.y) < 0.05 && air9.ndc.z > 0 && air9.ndc.z <= 1.0001, J({ ndc: air9.ndc, cam: air9.cam, plane: air9.plane }));
  await Shot("Aircraft_t9.png");
  const s105 = await Seek(10.5);
  Check("Seek(10.5) 扫射段里简易特效画出土点（白盒特效关 → 由预演画）", s105.fx && s105.fx.blastsDrawn && s105.fx.blasts >= 3, J(s105.fx));
  await Shot("Strafe_t10.5.png");
  const s19 = await Seek(19);
  Check("Seek(19) 过了最后一个航点飞机不可见", s19.aircraft[0] && !s19.aircraft[0].visible, J(s19.aircraft));

  // 3) 慢动作
  console.log("--- slow motion");
  const Run = async (t, ms) => B(async ({ t, ms }) => {
    const Bl = window.Tengxian.Debug.Blockout, P = Bl.Previz;
    await P.Seek(t);
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const s0 = P.State(), l0 = Bl.Probe("Luo"), w0 = Bl.Probe("Walker"), wall0 = performance.now();
    P.Resume();
    await new Promise(r => setTimeout(r, ms));
    const s1 = P.State(), l1 = Bl.Probe("Luo"), w1 = Bl.Probe("Walker"), wall1 = performance.now();
    await P.Seek(s1.t);   // 停住
    return { dt: s1.t - s0.t, wall: (wall1 - wall0) / 1000, scale: s1.timeScale, mixer: l1.mixerTime - l0.mixerTime, walked: Math.hypot(w1.x - w0.x, w1.z - w0.z), wallT: s1.wallT - s0.wallT };
  }, { t, ms });
  const normal = await Run(3.0, 900);
  const slow = await Run(7.6, 900);
  const scaleAt = PrevizTimeScale(seq, 7.8);
  Check("慢动作窗口里 State().timeScale = 0.3、窗口外 = 1", Math.abs(slow.scale - scaleAt) < 1e-6 && Math.abs(normal.scale - 1) < 1e-6, J({ slow: slow.scale, normal: normal.scale, want: scaleAt }));
  const ratioT = (slow.dt / slow.wall) / (normal.dt / normal.wall);
  Check("墙上同样跑 0.9 s，慢动作里预演时间只走约 0.3 倍（±0.12）", Math.abs(ratioT - 0.3) < 0.12 && normal.dt / normal.wall > 0.7, J({ normal, slow, ratioT: +ratioT.toFixed(3) }));
  const ratioMixer = slow.mixer / Math.max(1e-6, normal.mixer);
  Check("慢动作里人物动画时钟（Luo 的 mixer）也按约 0.3 倍走（±0.15）", slow.mixer > 0 && Math.abs(ratioMixer - 0.3) < 0.15, J({ normal: normal.mixer, slow: slow.mixer, ratio: +ratioMixer.toFixed(3) }));
  const ratioWalk = slow.walked / Math.max(1e-6, normal.walked);
  Check("慢动作里走着的人每秒墙上时间走的路也只有约 0.3 倍（±0.15）", normal.walked > 0.5 && Math.abs(ratioWalk - 0.3) < 0.15, J({ normal: normal.walked, slow: slow.walked, ratio: +ratioWalk.toFixed(3) }));
  await Seek(7.6);
  await Shot("Slowmo_t7.6.png");

  // 5) 挂到车上：车走起来，坐车尾的小孩与车板上的担架跟着走
  console.log("--- ride on cart");
  const RideAt = async (t) => { const s = await Seek(t); return { t: s.t, cart: await Probe("TestCart"), kid: await Probe("Kid"), litter: await Probe("TestLitter") }; };
  const r0 = await RideAt(12.5), r1 = await RideAt(17.5);
  await Shot("Ride_t17.5.png");
  const Expect = (cart, ride) => {   // 车位姿 ∘ 本地偏移（+x 右、−z 前；yaw 0 = 朝北）
    const ry = cart.yawDeg * Math.PI / 180, c = Math.cos(ry), s = Math.sin(ry);
    return { x: cart.x + ride.x * c + ride.z * s, z: cart.z - ride.x * s + ride.z * c };
  };
  const RideBrief = (r) => ({ t: r.t, cart: { x: +r.cart?.x.toFixed(2), z: +r.cart?.z.toFixed(2), yaw: r.cart?.yawDeg, bodyY: +r.cart?.bodyY?.toFixed(3) },
    kid: r.kid && { x: +r.kid.x.toFixed(2), z: +r.kid.z.toFixed(2), yaw: +r.kid.yawDeg.toFixed(1), clip: r.kid.shownClip, moving: r.kid.moving, pelvisY: +r.kid.pelvisY?.toFixed(3), rootAbove: +r.kid.rootAboveCarrierGround?.toFixed(3), seat: r.kid.seat && +r.kid.seat.carrierY.toFixed(3) },
    litter: r.litter && { x: +r.litter.x.toFixed(2), z: +r.litter.z.toFixed(2), rootAbove: +r.litter.rootAboveCarrierGround?.toFixed(3) } });
  Check("驴车真走了（12.5 → 17.5 s 往北 ≥ 4 m，车头朝北）", r0.cart && r1.cart && r0.cart.z - r1.cart.z >= 4 && Math.abs(r1.cart.yawDeg) < 1e-6, J({ r0: RideBrief(r0), r1: RideBrief(r1) }));
  const kidRide = { x: 0, z: 1.2, y: RIDE_KID_Y, yawDeg: 180 };
  const kidErr = [r0, r1].map(r => { const e = Expect(r.cart, kidRide); return Math.hypot(r.kid.x - e.x, r.kid.z - e.z); });
  Check("坐车尾的小孩两个时刻都跟着车：位置 = 车位姿 ∘ (0, +1.2)（误差 < 0.05 m）、朝向 = 车头 + 180、没在走路、Probe 报 ride / seat",
    kidErr.every(e => e < 0.05) && [r0, r1].every(r => Math.abs(Math.abs(r.kid.yawDeg) - 180) < 1e-3 && !r.kid.moving && r.kid.ride?.on === "TestCart" && r.kid.seat?.on === "TestCart"),
    J({ kidErr: kidErr.map(e => +e.toFixed(3)), r0: RideBrief(r0), r1: RideBrief(r1) }));
  Check("小孩的根离车底下地面 = ride.y（0.467）、车体块贴着车底下地面（bodyY = seat.carrierY）",
    [r0, r1].every(r => Math.abs(r.kid.rootAboveCarrierGround - RIDE_KID_Y) < 1e-3 && Math.abs(r.cart.bodyY - r.kid.seat.carrierY) < 1e-6), J({ r0: RideBrief(r0), r1: RideBrief(r1) }));
  Check("小孩在播 VilSitEdge、骨盆高度落在车尾板顶（车底下地面 + 1.025）±0.1 m（两个时刻）",
    [r0, r1].every(r => r.kid.shownClip === "VilSitEdge" && Math.abs(r.kid.pelvisY - (r.kid.seat.carrierY + CART_BED_TOP)) <= 0.1),
    J([r0, r1].map(r => ({ t: r.t, clip: r.kid.shownClip, pelvisAboveBed: +(r.kid.pelvisY - (r.kid.seat.carrierY + CART_BED_TOP)).toFixed(3) }))));
  const litErr = [r0, r1].map(r => { const e = Expect(r.cart, { x: 0, z: -0.2 }); return Math.hypot(r.litter.x - e.x, r.litter.z - e.z); });
  Check("担架挂在车板上跟着走：位置 = 车位姿 ∘ (0, −0.2)、担架组离车底下地面 = 1.075", litErr.every(e => e < 0.05) && [r0, r1].every(r => Math.abs(r.litter.rootAboveCarrierGround - CART_LITTER_Y) < 1e-3),
    J({ litErr: litErr.map(e => +e.toFixed(3)), r0: RideBrief(r0), r1: RideBrief(r1) }));

  // 6) url 音效：babyCry 装进声库并真的放出一条 voice；cellarSob 404 只警告一次
  console.log("--- url sfx");
  const sfx0 = await B(() => window.Tengxian.Debug.Blockout.Previz.State());
  Check("开播时 babyCry 的文件已解码进声库、cellarSob 记为读不到（missingSfx 带 url）、音频上下文在",
    sfx0.urlSfx?.loaded.includes("babyCry") && sfx0.urlSfx.failed.includes("cellarSob") && sfx0.missingSfx.filter(m => m.startsWith("cellarSob→")).length === 1 && !!sfx0.audioState,
    J({ urlSfx: sfx0.urlSfx, missingSfx: sfx0.missingSfx, audioState: sfx0.audioState }));
  const sfx1 = await B(async () => {
    const P = window.Tengxian.Debug.Blockout.Previz;
    await P.Seek(1.8);
    const before = P.State().urlSfx.played;
    P.Resume();
    await new Promise(r => setTimeout(r, 900));
    const s = P.State();
    await P.Seek(s.t);
    return { before, after: s.urlSfx.played, t: s.t, missingSfx: s.missingSfx, audioState: s.audioState };
  });
  Check("从 1.8 s 播过 2.0 s：babyCry 真的放出一条 voice（urlSfx.played +1）；cellarSob 两次都跳过、missingSfx 仍只有一条",
    sfx1.after === sfx1.before + 1 && sfx1.t > 2.4 && sfx1.missingSfx.filter(m => m.startsWith("cellarSob→")).length === 1, J(sfx1));
  Check("读不到的音效文件整趟只警告一次", sfxWarnings.length === 1, J(sfxWarnings));

  // 4) 中断：飞机还回去
  console.log("--- clipRelease");
  await Seek(14.6);
  const rel = await Probe("PinRel"), hold = await Probe("PinHold");
  Check("clipRelease 2：片段播到 2.6 s 时已经放开停住段、在放出口（显示秒数≈2.6），不写的那个还在停住段里循环（≈0.6）",
    rel?.shownClip === "VilIjaPinBayonet" && Math.abs(rel.shownClipSeconds - 2.6) < 0.08 && hold?.shownClip === "VilIjaPinBayonet" && Math.abs(hold.shownClipSeconds - 0.6) < 0.08,
    J({ rel: [rel?.shownClip, rel?.shownClipSeconds], hold: [hold?.shownClip, hold?.shownClipSeconds] }));

  console.log("--- stop");
  await B(() => window.Tengxian.Debug.Blockout.Previz.Stop());
  await page.waitForTimeout(200);
  const after = await B(() => {
    const T = window.Tengxian, group = T.scene.getObjectByName("BlockoutPrevizAircraft");
    const pool = T.aircraft?.clonePool?.get("MitsubishiKi30")?.length ?? 0;
    return { playing: T.Debug.Blockout.Previz.State().playing, aircraft: T.Debug.Blockout.Previz.State().aircraft, children: group ? group.children.length : -1, pool, id: T.Debug.Blockout.State().id };
  });
  Check("中断后飞机克隆还回机队的池子、组里没东西、State().aircraft 清空、留在 06-2（then stay）",
    !after.playing && after.aircraft.length === 0 && after.children === 0 && after.pool >= 1 && after.id === KF, J(after));
  Check("全程没有未捕获错误", errors.length === 0, errors.slice(0, 5).join(" | "));
} finally {
  await browser.close();
  server.close();
}

const failed = results.filter(r => !r.ok);
console.log(`EditorBlockoutPrevizRuntimeBrowserTest: ${results.length - failed.length}/${results.length} passed`);
assert.equal(failed.length, 0, failed.map(r => r.name).join("; "));
