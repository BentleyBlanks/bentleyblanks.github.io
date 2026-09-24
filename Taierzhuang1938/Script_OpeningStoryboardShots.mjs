// 01–02 storyboard shots (contract docs/Data_FirstLevelStoryboard0103Contract.md §5 and §7.2).
//
//   node Taierzhuang1938/Script_OpeningStoryboardShots.mjs [--shots=SB01,SB02] [--quality=high|medium|low]
//        [--size=1280x720] [--out=<dir>] [--hud] [--warm=6] [--tag=<suffix>] [--side-by-side=<storyboard dir>]
//        [--plan=<plan.json>] [--no-stop] [--no-judge]
//
// Plays 01 from its first frame in the real flow (no phase skips, no injected facts), and at each
// shot of OPENING_STORYBOARDS.storyboardShots (a phase + age, or a `when` expression over the director
// `s`, the mission runtime `r` and `window.Tengxian` `g`) renders `--warm` frames and takes the
// director's actual picture (first-person hands and post effects included). Next to each picture it
// writes the frame's facts (<id>.json): camera position / eye height / yaw / pitch / roll / fov, the
// director's Shot(), every actor near the camera (role, world position, yaw, clip, distance, head and
// feet on screen, jaw), the mission rifle, the hands, concussion and eye closure.
//
// Judging: each shot's `judge` (Data_OpeningStoryboards.storyboardShots) is checked against the dump --
// the part of the contract's picture criteria that the staging and the camera decide (who is where on
// screen, how far, pitch / roll / eye height, landmarks on screen, who must be out of the picture). A
// failed check, a missed shot or a page error exits 1. The rest of each criterion is looked at in the
// side-by-side picture: --side-by-side=<dir with Storyboard_*.png> writes <id>_SideBySide.png
// (storyboard | engine, same height, with the failed checks printed under it). The storyboard images are
// not in the repository (contract header: REL/附件/storyboard).
//
// --plan=<json> replaces the shot list (same fields) and may carry overrides for trying a composition
// (not for acceptance): camera {eye:[x,z],h,target:[x,y,z]|yawDeg,pitchDeg,rollDeg,fov}, actors
// {<role>:{x,z,yawDeg,clip,seconds,hide}}, rifle {x,z,yawDeg}, eyesOpen, freeze, boxes [...], eval "<js>",
// noShot. Output goes to Taierzhuang1938/_shots/OpeningStoryboards (not committed).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";
import { OPENING_STORYBOARDS as C } from "./Data_OpeningStoryboards.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const Arg = (key, fallback = null) => { const a = argv.find((x) => x.startsWith(`--${key}=`)); return a ? a.slice(key.length + 3) : fallback; };
const Has = (key) => argv.includes(`--${key}`);

/** One check: value inside [min, max] (either may be null). */
function Range(label, value, range) {
  const [min, max] = range;
  const ok = Number.isFinite(value) && (min == null || value >= min) && (max == null || value <= max);
  return { label, ok, value: Number.isFinite(value) ? Math.round(value * 1000) / 1000 : value, range };
}
const OnScreen = (p) => !!p?.front && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1;
/**
 * The automatic part of a shot's picture criteria. `dump` is what the page reported for the frame
 * (normalised screen coordinates: x left -> right, y top -> bottom). Returns [{label, ok, value, range}].
 */
export function JudgeShot(judge, dump) {
  const out = [];
  if (!judge) return out;
  const cam = dump.camera;
  const J = judge.camera || {};
  if (J.eyeM) out.push(Range("eye height (m)", cam.eyeAboveGround, J.eyeM));
  if (J.pitchDeg) out.push(Range("pitch (deg)", cam.pitchDeg, J.pitchDeg));
  if (J.rollDeg) out.push(Range("roll (deg)", cam.rollDeg, J.rollDeg));
  if (J.absRollDeg) out.push(Range("|roll| (deg)", Math.abs(cam.rollDeg), J.absRollDeg));
  if (J.yawDeg) out.push(Range("yaw (deg)", cam.yawDeg, J.yawDeg));
  if (judge.horizonY) out.push(Range("horizon y", dump.horizonY, judge.horizonY));
  if (judge.eyeClosure) out.push(Range("eye closure", dump.eyeClosure, judge.eyeClosure));
  for (const [role, want] of Object.entries(judge.actors || {})) {
    const a = dump.actors.find((row) => row.role === role);
    if (!a) { out.push({ label: `${role} present`, ok: false, value: "missing", range: null }); continue; }
    const shown = a.visible && !a.hidden && OnScreen(a.headPx);
    out.push({ label: `${role} head in frame`, ok: !!shown, value: a.headPx ? `${a.headPx.x},${a.headPx.y}` : null, range: null });
    if (want.x) out.push(Range(`${role} head x`, a.headPx?.x, want.x));
    if (want.y) out.push(Range(`${role} head y`, a.headPx?.y, want.y));
    if (want.distM) out.push(Range(`${role} distance (m)`, a.distM, want.distM));
    if (want.clip) out.push({ label: `${role} clip`, ok: want.clip.includes(a.clip), value: a.clip, range: want.clip });
    if (want.pelvisM) out.push(Range(`${role} pelvis height (m)`, a.pelvisY, want.pelvisM));
  }
  for (const role of judge.absent || []) {
    const a = dump.actors.find((row) => row.role === role);
    const inFrame = !!a && a.visible && !a.hidden && (OnScreen(a.headPx) || OnScreen(a.feetPx));
    out.push({ label: `${role} out of the picture`, ok: !inFrame, value: inFrame ? `${a.headPx?.x},${a.headPx?.y}` : "out", range: null });
  }
  for (const [name, want] of Object.entries(judge.points || {})) {
    const p = dump.points?.[name];
    if (want.x) out.push(Range(`${name} x`, p?.front ? p.x : NaN, want.x));
    if (want.y) out.push(Range(`${name} y`, p?.front ? p.y : NaN, want.y));
  }
  for (const group of judge.inFrameAtLeast || []) {
    const seen = dump.actors.filter((a) => group.roles.some((r) => a.role?.startsWith(r)) && a.visible && !a.hidden && OnScreen(a.headPx)
      && (!group.minDistM || a.distM >= group.minDistM)).length;
    out.push(Range(`${group.roles.join("/")} in frame${group.minDistM ? ` beyond ${group.minDistM} m` : ""}`, seen, [group.count, null]));
  }
  if (judge.rifleHidden) out.push({ label: "mission rifle hidden", ok: !dump.rifle?.visible, value: dump.rifle?.visible ?? null, range: null });
  return out;
}

async function Main() {
  const OUT = path.resolve(Arg("out", path.join(here, "_shots", "OpeningStoryboards")));
  const QUALITY = Arg("quality", "high");
  const [W, H] = Arg("size", "1280x720").split("x").map(Number);
  const WARM = Number(Arg("warm", 6));
  const TAG = Arg("tag", "");
  const SIDE = Arg("side-by-side");
  fs.mkdirSync(OUT, { recursive: true });
  let plan = Arg("plan") ? JSON.parse(fs.readFileSync(Arg("plan"), "utf8")) : C.storyboardShots.map((s) => ({ ...s }));
  if (Arg("shots")) { const want = Arg("shots").split(","); plan = plan.filter((s) => want.some((w) => s.id === w || s.id.startsWith(w + "_"))); }
  if (!plan.length) throw Error("no shots selected");

  const server = await ServeRoot(path.resolve(here, ".."), 0);
  const browser = await LaunchBrowser();
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  const errors = [];
  page.on("pageerror", (e) => { errors.push(String(e)); console.log("PAGEERROR", String(e)); });
  page.on("crash", () => { errors.push("page crashed"); console.log("PAGECRASH"); });
  const log = { quality: QUALITY, size: [W, H], started: new Date().toISOString(), shots: [], errors };
  const t0 = Date.now();
  let failed = 0;
  try {
    const url = `http://127.0.0.1:${server.address().port}/Taierzhuang1938/?whitebox=p012&shot=1&manual=1&quality=${QUALITY}&scale=small`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 180000 });
    await page.waitForFunction(() => window.Tengxian?.state?.ready, null, { timeout: 300000 });
    await page.waitForFunction(() => window.Tengxian.Debug.FirstLevelMissionRuntime()?.frontShow?.bunker?.ready, null, { timeout: 120000 });
    if (!Has("hud")) await page.addStyleTag({ content: "#hud{display:none!important}" });
    await page.evaluate(InstallHooks);
    for (const shot of plan) {
      const cond = shot.when || `s.phase===${JSON.stringify(shot.phase)}&&s.Age>=${Math.max(0, (shot.age ?? 0) - WARM / 60)}`;
      let status;
      for (let round = 0; round < 600; round++) {
        status = await page.evaluate(Advance, { cond, noStop: Has("no-stop") });
        if (status.hit || status.over) break;
      }
      if (!status.hit) { console.log("MISS", shot.id, JSON.stringify(status)); log.shots.push({ id: shot.id, miss: status }); failed++; continue; }
      if (shot.camera || shot.actors || shot.rifle || shot.eyesOpen) await page.evaluate((o) => { window.__sbShots.override = o; }, { camera: shot.camera, actors: shot.actors, rifle: shot.rifle, eyesOpen: shot.eyesOpen });
      else if (shot.resetOverride) await page.evaluate(() => { window.__sbShots.override = null; });
      if (shot.boxes || shot.clearBoxes) await page.evaluate(({ boxes, clear }) => window.__sbShots.AddBoxes(boxes, clear), { boxes: shot.boxes, clear: !!shot.clearBoxes });
      if (shot.eval) await page.evaluate(({ code }) => { const g = window.Tengxian, r = g.Debug.FirstLevelMissionRuntime(), s = r.frontShow.bunker; new Function("s", "r", "g", code)(s, r, g); }, { code: shot.eval });
      if (shot.noShot) { console.log("STEP", shot.id, JSON.stringify(status)); log.shots.push({ id: shot.id, step: status }); continue; }
      const dump = await page.evaluate(Dump, { warm: WARM, freeze: !!shot.freeze, points: shot.judge?.points || {} });
      const file = `${shot.id}${TAG ? "_" + TAG : ""}`;
      await page.screenshot({ path: path.join(OUT, file + ".png") });
      // A lost WebGL context (the GPU process died, e.g. under other browsers' load) leaves a blank picture.
      if (dump.contextLost) { errors.push(`${shot.id}: WebGL context lost`); console.log("CONTEXTLOST", shot.id); }
      const checks = Has("no-judge") ? [] : JudgeShot(shot.judge, dump);
      const bad = checks.filter((c) => !c.ok);
      if (bad.length) failed++;
      fs.writeFileSync(path.join(OUT, file + ".json"), JSON.stringify({ spec: shot, checks, ...dump }, null, 1));
      log.shots.push({ id: shot.id, file, phase: dump.phase, age: dump.age, camera: dump.camera, failed: bad.map((c) => c.label) });
      console.log(`${bad.length ? "FAIL" : "SHOT"} ${file} ${dump.phase} ${dump.age} s eye ${dump.camera.eyeAboveGround} m yaw ${dump.camera.yawDeg} pitch ${dump.camera.pitchDeg} roll ${dump.camera.rollDeg} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
      for (const c of checks) console.log(`   ${c.ok ? "ok  " : "FAIL"} ${c.label}: ${JSON.stringify(c.value)}${c.range ? " in " + JSON.stringify(c.range) : ""}`);
      if (SIDE && shot.storyboard) await SideBySide(browser, path.join(SIDE, shot.storyboard), path.join(OUT, file + ".png"),
        path.join(OUT, file + "_SideBySide.png"), `${shot.id} 分镜`, `实机 ${dump.phase} ${dump.age}s`, bad);
    }
  } finally {
    log.seconds = (Date.now() - t0) / 1000;
    fs.writeFileSync(path.join(OUT, `shots_log${TAG ? "_" + TAG : ""}.json`), JSON.stringify(log, null, 1));
    await browser.close();
    await new Promise((res) => server.close(res));
  }
  const taken = plan.filter((s) => !s.noShot).length;
  if (errors.length) { console.log(`page errors: ${errors.length}`); process.exitCode = 1; }
  if (failed) { console.log(`storyboard shots: ${failed} of ${taken} failed (${OUT})`); process.exitCode = 1; }
  else if (!errors.length) console.log(`ok storyboard shots: ${taken} shots judged (${OUT})`);
}

/** Page side: record the director's Shot() and allow overrides (camera through Shot, actors after Update). */
async function InstallHooks() {
  const g = window.Tengxian, r = g.Debug.FirstLevelMissionRuntime(), s = r.frontShow.bunker, T = await import("three");
  const cap = window.__sbShots = { T, override: null, lastShot: null, boxes: [] };
  const Actor = (role) => s.SpeakerActor(role) || s.cast[role] || null;
  cap.Actor = Actor;
  const shot = s.Shot.bind(s);
  s.Shot = function () {
    let out = shot();
    const o = cap.override?.camera;
    if (o) {
      const eye = { x: o.eye[0], z: o.eye[1] }, h = o.h ?? out.height;
      let target;
      if (o.target) target = new T.Vector3(...o.target);
      else {
        const y = (o.yawDeg ?? 0) * Math.PI / 180, p = (o.pitchDeg ?? 0) * Math.PI / 180, base = r.Point(eye, h);
        target = base.clone().add(new T.Vector3(-Math.sin(y) * Math.cos(p), Math.sin(p), -Math.cos(y) * Math.cos(p)));
      }
      out = { eye, height: h, target, roll: (o.rollDeg ?? 0) * Math.PI / 180, pitch: 0 };
    }
    cap.lastShot = { eye: out.eye, height: out.height, target: out.target ? [out.target.x, out.target.y, out.target.z] : null, roll: out.roll, pitch: out.pitch };
    return out;
  };
  const apply = s.ApplyCamera.bind(s);
  s.ApplyCamera = function () {
    if (cap.override?.camera) { this.presentedCamera = null; this.cameraFrom = null; this.previousViewPosition = null; this.previousViewQuaternion = null; }
    const done = apply();
    const fov = cap.override?.camera?.fov;
    if (done && fov) { const cam = r.player.camera; cam.fov = fov; cam.updateProjectionMatrix(); cam.updateMatrixWorld(true); }
    if (done && cap.override?.eyesOpen && r.opening) { r.opening.eyeClosure = 0; r.opening.blackout = 0; }
    return done;
  };
  const update = s.Update.bind(s);
  s.Update = function (dt) {
    update(dt);
    const o = cap.override;
    if (!o) return;
    for (const [role, spec] of Object.entries(o.actors || {})) {
      const a = Actor(role); if (!a) continue;
      if (spec.hide) { s.Hide(a); continue; }
      const key = role + JSON.stringify(spec), mark = { x: spec.x, z: spec.z, yaw: (spec.yawDeg ?? 0) * Math.PI / 180 };
      if (!(cap.placed ??= new Set()).has(key)) { cap.placed.add(key); s.Hide(a); a.openingStoryboardLast = null; s.Put(a, mark); }
      s.Show(a); s.Put(a, mark);
      if (spec.clip !== undefined) a.openingStoryboardPose = spec.clip ? { clip: spec.clip, seconds: spec.seconds ?? 0 } : null;
    }
    if (o.rifle) s.MoveRifle({ x: o.rifle.x, z: o.rifle.z, yaw: (o.rifle.yawDeg ?? 0) * Math.PI / 180 });
  };
  cap.AddBoxes = (list, clear) => {
    if (clear) { for (const m of cap.boxes) { m.removeFromParent(); m.geometry.dispose(); m.material.dispose(); } cap.boxes = []; }
    for (const b of list || []) {
      const m = new T.Mesh(new T.BoxGeometry(b.w, b.h, b.d), new T.MeshStandardMaterial({ color: b.color ?? 0x3a2a1c, roughness: .9 }));
      const gy = g.battlefield.GroundHeight(b.x, b.z);
      m.position.set(b.x, b.y ?? (gy + (b.yGround ?? 0) + b.h / 2), b.z); m.rotation.y = (b.yawDeg ?? 0) * Math.PI / 180;
      m.name = "StoryboardProbeBox_" + (b.id || cap.boxes.length); g.scene.add(m); cap.boxes.push(m);
    }
  };
}
/** Page side: step the real flow one frame at a time until the shot's condition holds (900 frames a call). */
function Advance({ cond, noStop }) {
  const g = window.Tengxian, r = g.Debug.FirstLevelMissionRuntime(), s = r.frontShow.bunker;
  const test = new Function("s", "r", "g", `return (${cond});`);
  for (let i = 0; i < 900; i++) {
    if (test(s, r, g)) return { hit: true, phase: s.phase, age: s.Age, stage: r.flow.stage.id, time: r.time };
    if (!noStop && (s.phase === "Released" || !["Trapped", "BunkerRescue"].includes(r.flow.stage.id))) return { hit: false, over: true, phase: s.phase, stage: r.flow.stage.id };
    g.StepFrames(1, 1 / 60, false);
  }
  return { hit: false, phase: s.phase, age: s.Age, stage: r.flow.stage.id, time: r.time };
}
/** Page side: render the warm frames and report the frame (normalised screen coordinates). */
function Dump({ warm, freeze, points }) {
  const g = window.Tengxian, r = g.Debug.FirstLevelMissionRuntime(), s = r.frontShow.bunker, { T, Actor } = window.__sbShots;
  for (let i = 0; i < warm; i++) g.StepFrames(1, freeze ? 1e-4 : 1 / 60, true);
  const cam = r.player.camera, R3 = (v) => Math.round(v * 1000) / 1000, D = (v) => Math.round(v * 1800 / Math.PI) / 10;
  const e = new T.Euler().setFromQuaternion(cam.quaternion, "YXZ");
  const Screen = (v) => { const p = v.clone().project(cam); return { x: R3((p.x + 1) / 2), y: R3((1 - p.y) / 2), front: p.z < 1 && p.z > -1 }; };
  const roles = new Map();
  for (const role of ["ijaA", "ijaB", "ijaC", "ijaD", "luo", "yaowa", "heyoutian", "liuwencai", "comrade", "runner", "shouter", "interpreter"]) { const a = Actor(role); if (a && !roles.has(a)) roles.set(a, role); }
  for (const [id, a] of Object.entries(s.cast)) if (!roles.has(a)) roles.set(a, id);
  for (const a of r.squad) if (!roles.has(a)) roles.set(a, a.castId || a.id);
  const actors = [];
  for (const a of new Set([...roles.keys(), ...r.enemies.values()])) {
    if (!a?.actor?.root) continue;
    const d = Math.hypot(a.position.x - cam.position.x, a.position.z - cam.position.z);
    if (d > 80) continue;
    const bones = a.actor.characterRig?.bones, head = bones?.head?.getWorldPosition(new T.Vector3()), pelvis = bones?.pelvis?.getWorldPosition(new T.Vector3());
    const feet = a.actor.root.position.clone();
    const jaw = a.actor.characterRig?.facial?.controls?.find((c) => c.name === "Face_Jaw");
    actors.push({ role: roles.get(a) || a.missionId || null, missionId: a.missionId || null, alive: a.alive,
      hidden: !!a.openingStoryboardHidden, visible: !!a.actor.root.visible && !!a.actor.root.parent, lod: a.renderLod || null,
      x: R3(a.position.x), z: R3(a.position.z), yawDeg: D(a.yaw), clip: a.openingStoryboardPose?.clip || null,
      clipS: a.openingStoryboardPose?.seconds != null ? R3(a.openingStoryboardPose.seconds) : null, distM: R3(d),
      pelvisY: pelvis ? R3(pelvis.y - feet.y) : null, headPx: head ? Screen(head) : null, feetPx: Screen(feet),
      jaw: jaw ? R3(jaw.bone.quaternion.angleTo(jaw.quaternion)) : null });
  }
  actors.sort((a, b) => a.distM - b.distM);
  const flat = new T.Vector3(-Math.sin(e.y), 0, -Math.cos(e.y)).multiplyScalar(300).add(cam.position);
  const pointsOut = {};
  for (const [name, p] of Object.entries(points)) if (p.at) pointsOut[name] = Screen(new T.Vector3(p.at[0], g.battlefield.GroundHeight(p.at[0], p.at[2]) + p.at[1], p.at[2]));
  const view = r.bunkerRifle?.view;
  const rifle = view ? { x: R3(view.position.x), z: R3(view.position.z), yawDeg: D(view.rotation.y), visible: view.visible, px: Screen(view.position) } : null;
  const hands = Object.fromEntries(Object.entries(s.firstPersonState?.hands || {}).map(([k, h]) => [k, { pose: h.pose, px: h.palm ? Screen(new T.Vector3(...h.palm)) : null }]));
  const op = r.opening;
  return {
    phase: s.phase, age: R3(s.Age), stage: r.flow.stage.id, time: R3(r.time),
    camera: { x: R3(cam.position.x), y: R3(cam.position.y), z: R3(cam.position.z),
      eyeAboveGround: R3(cam.position.y - g.battlefield.GroundHeight(cam.position.x, cam.position.z)),
      yawDeg: D(e.y), pitchDeg: D(e.x), rollDeg: D(e.z), fovV: cam.fov, aspect: R3(cam.aspect) },
    horizonY: Screen(flat).y, points: pointsOut,
    shot: window.__sbShots.lastShot, perception: s.perception ? { amount: R3(s.perception.amount), focus: R3(s.perception.focus) } : null,
    eyeClosure: op?.eyeClosure ?? null, bloodMask: s.bloodMask ?? null,
    flags: Object.fromEntries(Object.entries(s.flags).filter(([, v]) => typeof v === "number" || typeof v === "boolean").map(([k, v]) => [k, typeof v === "number" ? R3(v) : v])),
    actors, rifle, hands, contextLost: !!g.renderer?.getContext?.()?.isContextLost?.(),
  };
}
/** Storyboard | engine at one height, drawn in a blank page (no Python needed); failed checks listed below. */
async function SideBySide(browser, storyboardFile, shotFile, outFile, leftLabel, rightLabel, failed) {
  if (!fs.existsSync(storyboardFile)) { console.log("  (no storyboard image " + storyboardFile + ")"); return; }
  const Data = (f) => "data:image/png;base64," + fs.readFileSync(f).toString("base64");
  const page = await browser.newPage();
  try {
    await page.setContent("<canvas id=c></canvas>");
    const png = await page.evaluate(async ({ a, b, la, lb, notes }) => {
      const Load = (src) => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = src; });
      const [A, B] = await Promise.all([Load(a), Load(b)]);
      const h = 540, wa = Math.round(A.width * h / A.height), wb = Math.round(B.width * h / B.height), foot = notes.length ? 22 * notes.length + 10 : 0;
      const c = document.getElementById("c"); c.width = wa + wb + 6; c.height = h + foot;
      const x = c.getContext("2d"); x.fillStyle = "#141414"; x.fillRect(0, 0, c.width, c.height);
      x.drawImage(A, 0, 0, wa, h); x.drawImage(B, wa + 6, 0, wb, h);
      x.font = "18px 'Microsoft YaHei', sans-serif";
      for (const [label, left] of [[la, 0], [lb, wa + 6]]) { x.fillStyle = "#000"; x.fillRect(left, 0, x.measureText(label).width + 12, 26); x.fillStyle = "#fff"; x.fillText(label, left + 6, 19); }
      x.fillStyle = "#ff8a80"; notes.forEach((n, i) => x.fillText(n, 8, h + 24 + i * 22));
      return c.toDataURL("image/png");
    }, { a: Data(storyboardFile), b: Data(shotFile), la: leftLabel, lb: rightLabel,
      notes: failed.map((c) => `FAIL ${c.label}: ${JSON.stringify(c.value)}${c.range ? " in " + JSON.stringify(c.range) : ""}`) });
    fs.writeFileSync(outFile, Buffer.from(png.split(",")[1], "base64"));
    console.log("  side by side " + outFile);
  } finally { await page.close(); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await Main();
