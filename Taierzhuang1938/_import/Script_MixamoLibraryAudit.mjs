// 整个 Mixamo 动作库的逐帧审查（2026-11-02 起）：每条动作在 Tool_MixamoAnimationPreview.html 里照工具的挂法挂上
// 步枪 / 大刀 / 担架，逐帧（30 fps）量穿插与跳变。自制动作另有更细的 MixamoAuthored/Script_MixamoClipAudit.mjs。
//   node Taierzhuang1938/_import/Script_MixamoLibraryAudit.mjs [--out=<file.jsonl>] [--only=<文件名片段,…>] [--pages=3]
//                                                          [--rifle=ZhongZheng|Type38] [--include-dropped]
//                                                          [--override=<file.json>]
// --override：{ "<动作文件>": { 清单字段… } }，在页面里先改清单条目再量（试 rifleTrack / rifleAim 之类的参数，不动磁盘上的清单）。
// 每条输出一行 JSON（--out 写文件，否则打到标准输出），字段：
//   rifle.body     枪身网格点进人体多深（m），按骨头分：{ bone: { depth, frame, z } }，z 是那一点在枪身上的位置
//                  （枪的坐标：握把 = 0，枪口朝 -Z，> 0 是枪托那段）；手和手指不算（它们本来就握着枪）
//   rifle.snapDeg  枪相对右手一帧转了多少度（工具「枪管对准左手」那步一开一关就会一下拧过去），最大值与帧
//   rifle.popDeg   枪相对胯一帧的转角突刺（比前后几帧中位数大 3 倍以上且 > 8°），最大值与帧
//   rifle.leftOn   左手掌心离枪身轴线 ≤ 6 cm 的帧占比；leftNear 6–25 cm（够着了又没握上，最显眼）的帧占比
//   dadao.*        同上，大刀
//   stretcher.body 担架网格点进人体多深（按骨头分）
//   hands          手掌 / 指节进躯干、头、大腿小腿多深：{ Right: { depth, frame, part, bone }, Left: … }
//   forearms       前臂进躯干、头、腿多深
//   pops           骨头本地转角一帧突刺（比前后几帧中位数大 3 倍以上且 > 10°），按大小前 6 条；跑步落脚、出手甩腕这类
//                  真快的动作也会上榜，只作参考
//   glitches       抽搐：某一帧离前后两帧的中间姿势 > 12°（去了又回来的一帧；真快的动作这一帧落在中间附近），前 6 条
//   rifle.glitchDeg 同上，枪相对胯
//   seam           可循环的动作首尾姿势差（度，所有骨头里最大）
// 人体按 X Bot 蒙皮拟合：每根骨头一段椭圆截面的胶囊（截面半轴取挂在这根骨头上的顶点的第 85 百分位，偏瘦），
// 所以报的深度是保守的；近肩窝的枪托贴肩算正常接触，阈值见 Script_MixamoLibraryAuditReport.mjs。
import path from "node:path";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
const repo = path.resolve(import.meta.dirname, "..", "..");
const { LaunchBrowser } = await import(pathToFileURL(path.join(repo, "PrairieFire1937", "Script_BrowserTestKit.mjs")));
const { ServeRoot } = await import(pathToFileURL(path.join(repo, "Taierzhuang1938", "Script_DevServer.mjs")));

const flags = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith("--")).map((a) => { const [k, v] = a.slice(2).split("="); return [k, v ?? "1"]; }));
const manifest = JSON.parse(fs.readFileSync(path.join(repo, "Taierzhuang1938", "Animation", "Mixamo", "Data_MixamoLibrary.json"), "utf8"));
const only = flags.only ? flags.only.split(",") : null;
const files = manifest.clips.filter((c) => (flags["include-dropped"] || !c.dropped) && (!only || only.some((s) => c.file.includes(s)))).map((c) => c.file);
const pages = Math.max(1, Math.min(6, Number(flags.pages || 3)));
const out = flags.out ? fs.createWriteStream(flags.out) : null;

const server = await ServeRoot(repo, 0), browser = await LaunchBrowser();
const base = `http://127.0.0.1:${server.address().port}/Taierzhuang1938/Tool_MixamoAnimationPreview.html`;
let done = 0;
async function Worker(list) {
  const page = await browser.newPage({ viewport: { width: 320, height: 240 } });
  page.on("pageerror", (e) => console.error("[pageerror]", String(e)));
  await page.goto(base);
  await page.waitForFunction(() => window.__preview?.action && window.__preview.rifle, null, { timeout: 180000 });
  await page.evaluate(SetupInPage, { rifle: flags.rifle || "ZhongZheng" });
  if (flags.override) await page.evaluate((ov) => {
    for (const [f, fields] of Object.entries(ov)) Object.assign(window.__preview.manifest.clips.find((c) => c.file === f) || {}, fields);
  }, JSON.parse(fs.readFileSync(flags.override, "utf8")));
  for (const file of list) {
    let result;
    try { result = await page.evaluate(AuditInPage, file); } catch (error) { result = { file, error: String(error) }; }
    const line = JSON.stringify(result);
    if (out) out.write(line + "\n"); else console.log(line);
    done += 1;
    if (out && done % 20 === 0) console.error(`[audit] ${done}/${files.length}`);
  }
  await page.close();
}

// ---------------------------------------------------------------- in page
async function SetupInPage({ rifle }) {
  const P = window.__preview;
  // 选定的枪
  const sel = document.getElementById("rifle");
  if (sel.value !== rifle) { sel.value = rifle; sel.dispatchEvent(new Event("change")); }
  await new Promise((r) => { const t = setInterval(() => { if (P.rifle && P.stretcher && P.dadao) { clearInterval(t); r(); } }, 50); });
  const ch = P.character, V = P.camera.position.constructor, M4 = P.camera.matrixWorld.constructor;
  P.action.paused = true;
  // ---- 人体：每根骨头一段椭圆截面胶囊（骨头本地 +Y 指向子骨），按蒙皮顶点拟合
  const VOLUME_BONES = ["Hips", "Spine", "Spine1", "Spine2", "Neck", "Head", "LeftShoulder", "RightShoulder", "LeftArm", "RightArm",
    "LeftForeArm", "RightForeArm", "LeftUpLeg", "RightUpLeg", "LeftLeg", "RightLeg"];
  const samples = new Map(VOLUME_BONES.map((n) => [n, []]));
  const v = new V(), m = new M4();
  ch.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    const pos = o.geometry.attributes.position, si = o.geometry.attributes.skinIndex, sw = o.geometry.attributes.skinWeight;
    const bones = o.skeleton.bones;
    for (let i = 0; i < pos.count; i += 1) {
      let best = -1, bw = 0;
      for (let k = 0; k < 4; k += 1) { const w = sw.getComponent(i, k); if (w > bw) { bw = w; best = si.getComponent(i, k); } }
      if (bw < 0.6) continue;
      const name = bones[best].name;
      if (!samples.has(name)) continue;
      v.fromBufferAttribute(pos, i).applyMatrix4(o.bindMatrix).applyMatrix4(o.skeleton.boneInverses[best]);
      samples.get(name).push([v.x, v.y, v.z]);
    }
  });
  const Pct = (arr, p) => { const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
  const volumes = [];
  for (const [name, pts] of samples) {
    if (pts.length < 20) continue;
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]), zs = pts.map((p) => p[2]);
    const cx = Pct(xs, 0.5), cz = Pct(zs, 0.5);
    const rx = Pct(xs.map((x) => Math.abs(x - cx)), 0.85), rz = Pct(zs.map((z) => Math.abs(z - cz)), 0.85);
    volumes.push({ name, bone: ch.getObjectByName(name), cx, cz, rx, rz, y0: Pct(ys, 0.05), y1: Pct(ys, 0.95), inv: new M4(), scale: 1, center: new V(), radius: 0 });
  }
  // ---- 挂件上的点（挂件自己的坐标），体素抽稀
  function PropPoints(root, voxel) {
    root.updateMatrixWorld(true);
    const inv = new M4().copy(root.matrixWorld).invert(), seen = new Map();
    root.traverse((o) => {
      if (!o.isMesh || !o.geometry?.attributes?.position) return;
      const rel = new M4().multiplyMatrices(inv, o.matrixWorld), pos = o.geometry.attributes.position;
      for (let i = 0; i < pos.count; i += 1) {
        v.fromBufferAttribute(pos, i).applyMatrix4(rel);
        const key = `${Math.round(v.x / voxel)},${Math.round(v.y / voxel)},${Math.round(v.z / voxel)}`;
        if (!seen.has(key)) seen.set(key, [v.x, v.y, v.z]);
      }
    });
    return [...seen.values()];
  }
  const wasVisible = P.rifle.visible;
  P.rifle.visible = true;
  const st = P.stretcher;
  window.__audit = {
    volumes,
    rifle: PropPoints(P.rifle, 0.015), dadao: PropPoints(P.dadao, 0.015),
    // 担架只看靠近抬的这个人的那一截（两头各 1.1 m 内）
    stretcher: PropPoints(st, 0.03).filter((p) => Math.abs(Math.abs(p[2]) - 0.98) < 0.6),
  };
  P.rifle.visible = wasVisible;
  return { volumes: volumes.map((x) => x.name), rifle: window.__audit.rifle.length, dadao: window.__audit.dadao.length, stretcher: window.__audit.stretcher.length };
}

async function AuditInPage(file) {
  const P = window.__preview, A = window.__audit, ch = P.character;
  const V = P.camera.position.constructor, Q = ch.quaternion.constructor, M4 = P.camera.matrixWorld.constructor;
  await P.SelectFile(file);
  const entry = P.current, action = P.action, clip = action.getClip(), mixer = action.getMixer();
  action.paused = true;
  const fps = 30, n = Math.max(1, Math.round(clip.duration * fps));
  const B = (name) => ch.getObjectByName(name);
  const bones = []; ch.traverse((o) => { if (o.isBone && !/_End$/.test(o.name)) bones.push(o); });
  const hips = B("Hips");
  const FINGERS = ["Thumb", "Index", "Middle", "Ring", "Pinky"];
  const handPoints = Object.fromEntries(["Right", "Left"].map((s) => [s, [
    { b: B(`${s}Hand`), r: 0.025, part: "腕" },
    ...FINGERS.flatMap((f) => [1, 2, 3, 4].map((k) => ({ b: B(`${s}Hand${f}${k}`), r: k === 4 ? 0.006 : 0.01, part: `${f}${k}` }))).filter((x) => x.b),
  ]]));
  const HAND_TARGETS = new Set(["Hips", "Spine", "Spine1", "Spine2", "Neck", "Head", "LeftUpLeg", "RightUpLeg", "LeftLeg", "RightLeg"]);
  const p = new V(), tmp = new V(), q = new Q(), q2 = new Q(), sc = new V();
  function UpdateVolumes() {
    for (const vol of A.volumes) {
      vol.inv.copy(vol.bone.matrixWorld).invert();
      vol.scale = vol.bone.matrixWorld.getMaxScaleOnAxis();
      const mid = (vol.y0 + vol.y1) / 2;
      vol.center.set(vol.cx, mid, vol.cz).applyMatrix4(vol.bone.matrixWorld);
      vol.radius = (Math.hypot(Math.max(vol.rx, vol.rz), (vol.y1 - vol.y0) / 2) + Math.max(vol.rx, vol.rz)) * vol.scale;
    }
  }
  // 点（世界，带半径 r）进这段胶囊多深（m，> 0 在里面）
  function Depth(vol, world, r) {
    if (world.distanceTo(vol.center) > vol.radius + r) return -1;
    tmp.copy(world).applyMatrix4(vol.inv);
    const k = Math.min(vol.rx, vol.rz);
    const dy = tmp.y < vol.y0 ? vol.y0 - tmp.y : tmp.y > vol.y1 ? tmp.y - vol.y1 : 0;
    const e = Math.hypot((tmp.x - vol.cx) / vol.rx, (tmp.z - vol.cz) / vol.rz, dy / k);
    return (1 - e) * k * vol.scale + r;
  }
  const angle = (a, b) => 2 * Math.acos(Math.min(1, Math.abs(a.dot(b)))) * 180 / Math.PI;
  const frames = [];
  const propState = { rifle: [], dadao: [] };
  const deep = { rifle: {}, dadao: {}, stretcher: {}, hands: { Right: null, Left: null }, forearms: { Right: null, Left: null } };
  const Keep = (map, key, depth, frame, extra) => { if (depth > 0 && (!map[key] || depth > map[key].depth)) map[key] = { depth: +depth.toFixed(3), frame, ...extra }; };
  for (let i = 0; i <= n; i += 1) {
    action.time = Math.min(i / fps, clip.duration - 1e-4); mixer.update(0); P.Place();
    UpdateVolumes();
    const f = { q: bones.map((b) => b.quaternion.clone()) };
    // 手、前臂
    for (const s of ["Right", "Left"]) {
      for (const hp of handPoints[s]) {
        hp.b.getWorldPosition(p);
        for (const vol of A.volumes) {
          if (!HAND_TARGETS.has(vol.name)) continue;
          const d = Depth(vol, p, hp.r);
          if (d > 0 && (!deep.hands[s] || d > deep.hands[s].depth)) deep.hands[s] = { depth: +d.toFixed(3), frame: i, part: hp.part, bone: vol.name };
        }
      }
      const fore = B(`${s}ForeArm`).getWorldPosition(new V()), hand = B(`${s}Hand`).getWorldPosition(new V());
      for (const t of [0.35, 0.6, 0.85]) {
        p.copy(fore).lerp(hand, t);
        for (const vol of A.volumes) {
          if (!HAND_TARGETS.has(vol.name)) continue;
          const d = Depth(vol, p, 0.03);
          if (d > 0 && (!deep.forearms[s] || d > deep.forearms[s].depth)) deep.forearms[s] = { depth: +d.toFixed(3), frame: i, bone: vol.name, along: t };
        }
      }
    }
    // 挂件
    for (const [key, obj] of [["rifle", P.rifle], ["dadao", P.dadao], ["stretcher", P.stretcher]]) {
      if (!obj || !obj.visible) continue;
      obj.updateMatrixWorld(true);
      for (const pt of A[key]) {
        p.set(pt[0], pt[1], pt[2]).applyMatrix4(obj.matrixWorld);
        for (const vol of A.volumes) {
          if (key === "stretcher" && !/Leg|Hips|Spine/.test(vol.name)) continue;
          const d = Depth(vol, p, 0);
          if (d > 0) Keep(deep[key], vol.name, d, i, { z: +pt[2].toFixed(2) });
        }
      }
      if (key !== "stretcher") {
        obj.matrixWorld.decompose(tmp, q, sc);
        const handQ = B(key === "rifle" && entry.rifleHand === "L" ? "LeftHand" : "RightHand").getWorldQuaternion(new Q());
        const hipsQ = hips.getWorldQuaternion(new Q());
        // 左手掌心离枪身轴线（握把 → 枪口方向 1 m）多远
        const palmL = B("LeftHand").getWorldPosition(new V()).lerp(B("LeftHandMiddle1").getWorldPosition(new V()), 0.55);
        const origin = new V().setFromMatrixPosition(obj.matrixWorld), axis = new V(0, 0, key === "rifle" ? -1 : 1).applyQuaternion(q);
        const along = Math.max(0, Math.min(1, palmL.clone().sub(origin).dot(axis)));
        const off = palmL.distanceTo(origin.clone().addScaledVector(axis, along));
        propState[key][i] = { rel: handQ.invert().multiply(q.clone()), hip: hipsQ.invert().multiply(q.clone()), off, inHand: key !== "rifle" || (P.rifleMode || "hand") === "hand" };
      }
    }
    frames.push(f);
  }
  // 骨头突刺
  const turns = bones.map((_, bi) => frames.slice(1).map((f, i) => angle(f.q[bi], frames[i].q[bi])));
  const Spikes = (series, min) => {
    const res = [];
    series.forEach((d, i) => {
      const nb = [series[i - 2], series[i - 1], series[i + 1], series[i + 2]].filter((x) => x !== undefined).sort((a, b) => a - b);
      const ref = nb.length ? nb[Math.floor(nb.length / 2)] : 0;
      if (d > min && d > 3 * Math.max(ref, 1.5)) res.push({ frame: i + 1, deg: +d.toFixed(1), neighbours: +ref.toFixed(1) });
    });
    return res;
  };
  const pops = [];
  turns.forEach((tr, bi) => { for (const s of Spikes(tr, 10)) pops.push({ bone: bones[bi].name, ...s }); });
  pops.sort((a, b) => b.deg - a.deg);
  // 抽搐：这一帧离前后两帧的中间姿势多远（真快的动作这一帧落在中间附近；去了又回来的一帧才离得远）
  const mid = new Q(), glitches = [];
  bones.forEach((b, bi) => {
    for (let i = 1; i < frames.length - 1; i += 1) {
      mid.copy(frames[i - 1].q[bi]).slerp(frames[i + 1].q[bi], 0.5);
      const d = angle(frames[i].q[bi], mid);
      if (d > 12) glitches.push({ bone: b.name, frame: i, deg: +d.toFixed(1) });
    }
  });
  glitches.sort((a, b) => b.deg - a.deg);
  const result = { file, hold: entry.hold, prop: entry.prop || null, rifleHand: entry.rifleHand || null, loop: !!entry.loop, frames: n + 1, seconds: +clip.duration.toFixed(2),
    hands: deep.hands, forearms: deep.forearms, pops: pops.slice(0, 6), glitches: glitches.slice(0, 6) };
  for (const key of ["rifle", "dadao"]) {
    const st = propState[key].filter(Boolean);
    if (!st.length) continue;
    const idx = propState[key].map((x, i) => (x ? i : -1)).filter((i) => i >= 0);
    const snaps = [], hipTurns = [];
    for (let k = 1; k < idx.length; k += 1) {
      const a = propState[key][idx[k - 1]], b = propState[key][idx[k]];
      if (idx[k] - idx[k - 1] !== 1) { snaps.push(0); hipTurns.push(0); continue; }
      // 清单 rifleTrack 让枪背到背上 / 脱手的帧，相对手本来就该变，不算拧
      snaps.push(a.inHand && b.inHand ? angle(a.rel, b.rel) : 0); hipTurns.push(angle(a.hip, b.hip));
    }
    let snap = { deg: 0 }; snaps.forEach((d, k) => { if (d > snap.deg) snap = { deg: +d.toFixed(1), frame: idx[k + 1] }; });
    const popsP = Spikes(hipTurns, 8).map((s) => ({ ...s, frame: idx[s.frame] })).sort((a, b) => b.deg - a.deg);
    let glitch = { deg: 0 };
    for (let k = 1; k < idx.length - 1; k += 1) {
      if (idx[k + 1] - idx[k - 1] !== 2) continue;
      const a = propState[key][idx[k - 1]].hip, b = propState[key][idx[k]].hip, c = propState[key][idx[k + 1]].hip;
      const d = angle(b, a.clone().slerp(c, 0.5));
      if (d > glitch.deg) glitch = { deg: +d.toFixed(1), frame: idx[k] };
    }
    const held = st.filter((s) => s.inHand), on = held.filter((s) => s.off <= 0.06).length / Math.max(1, held.length), near = held.filter((s) => s.off > 0.06 && s.off <= 0.25).length / Math.max(1, held.length);
    result[key] = { shown: st.length, body: deep[key], snapDeg: snap, snapsOver4: snaps.filter((d) => d > 4).length, popDeg: popsP.slice(0, 3), glitchDeg: glitch, leftOn: +on.toFixed(2), leftNear: +near.toFixed(2) };
  }
  if (Object.keys(deep.stretcher).length || (entry.prop === "担架")) result.stretcher = { body: deep.stretcher };
  if (entry.loop) result.seam = +Math.max(...frames[0].q.map((x, i) => angle(x, frames.at(-1).q[i]))).toFixed(1);
  return result;
}

try {
  const chunks = Array.from({ length: pages }, () => []);
  files.forEach((f, i) => chunks[i % pages].push(f));
  await Promise.all(chunks.filter((c) => c.length).map(Worker));
} finally {
  await browser.close(); server.close();
  if (out) await new Promise((r) => out.end(r));
}
