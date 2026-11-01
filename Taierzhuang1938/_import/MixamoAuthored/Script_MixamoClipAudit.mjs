// Claude 自制动作的审核工具（2026-11-01 起，审 Animation_Claude_*.glb；见 Data_MixamoLibraryCurate.mjs 的 AUTHORED）。
//   node Taierzhuang1938/_import/MixamoAuthored/Script_MixamoClipAudit.mjs <Name> [<Name> ...]
// Independent audit of authored clips (my own numbers, not the authors').
// Samples every frame of Animation_Claude_<Name>.glb on the X Bot in Tool_MixamoAnimationPreview.html and reports:
//   pops        per-bone local rotation change per frame that is a spike against its neighbours (top 6)
//   maxTurn     largest per-frame local rotation per bone group (deg/frame)
//   wrist       max bend between forearm and hand direction, per side (deg) + frame
//   elbowMin    smallest elbow interior angle per side (deg)
//   kneeMin     smallest knee interior angle per side
//   torsoHit    min clearance palm -> torso capsule (Hips..Spine2, r=0.12 m); negative = inside
//   headHit     min clearance palm -> head sphere (r=0.11 m)
//   ground      lowest bone head (excluding *_End / toes) height
//   slide       max horizontal speed of a planted foot (foot height < 0.13 m), m/s
//   seam        first vs last frame max bone angle diff (deg) and palm gap (cm)
//   baseStart / baseEnd   max bone angle diff to the base clip's first / last frame (deg)
import path from "node:path";
import { pathToFileURL } from "node:url";
import fs from "node:fs";
const repo = path.resolve(import.meta.dirname, "..", "..", "..");
const { LaunchBrowser } = await import(pathToFileURL(path.join(repo, "PrairieFire1937", "Script_BrowserTestKit.mjs")));
const { ServeRoot } = await import(pathToFileURL(path.join(repo, "Taierzhuang1938", "Script_DevServer.mjs")));
const names = process.argv.slice(2);
const server = await ServeRoot(repo, 0), browser = await LaunchBrowser();
const base = `http://127.0.0.1:${server.address().port}/Taierzhuang1938/Tool_MixamoAnimationPreview.html`;
try {
  const page = await browser.newPage({ viewport: { width: 600, height: 400 } });
  await page.goto(base);
  await page.waitForFunction(() => window.__preview?.action, null, { timeout: 120000 });
  for (const name of names) {
    const meta = JSON.parse(fs.readFileSync(`${repo}/Taierzhuang1938/tmp/Mixamo/Authored/${name}.meta.json`, "utf8"));
    const result = await page.evaluate(async ({ name, baseFile }) => {
      const { GLTFLoader } = await import("./vendor/three/examples/jsm/loaders/GLTFLoader.js");
      const P = window.__preview, ch = P.character, Mixer = P.action.getMixer().constructor;
      const V = P.camera.position.constructor, Q = ch.quaternion.constructor;
      P.action.stop();
      const L = new GLTFLoader();
      const clip = (await L.loadAsync(`./tmp/Mixamo/Glb/Animation_Claude_${name}.glb`)).animations[0];
      const baseClip = (await L.loadAsync(`./tmp/Mixamo/Glb/${baseFile}.glb`)).animations[0];
      const bones = []; ch.traverse((o) => { if (o.isBone && !/_End$/.test(o.name)) bones.push(o); });
      const B = (n) => ch.getObjectByName(n);
      const W = (n) => B(n).getWorldPosition(new V());
      const palm = (s) => W(`${s}Hand`).lerp(W(`${s}HandMiddle1`), 0.55);
      function Pose(c, t) {
        const mx = new Mixer(ch), a = mx.clipAction(c); a.play(); mx.setTime(t); ch.updateMatrixWorld(true);
        const q = bones.map((b) => b.quaternion.clone());
        a.stop(); mx.uncacheRoot(ch);
        return q;
      }
      const angle = (a, b) => 2 * Math.acos(Math.min(1, Math.abs(a.dot(b)))) * 180 / Math.PI;
      const poseDiff = (p, q) => Math.max(...p.map((x, i) => angle(x, q[i])));
      const fps = 30, n = Math.round(clip.duration * fps);
      const mx = new Mixer(ch), act = mx.clipAction(clip); act.play();
      const frames = [];
      for (let i = 0; i <= n; i++) {
        mx.setTime(Math.min(i / fps, clip.duration - 1e-4)); ch.updateMatrixWorld(true);
        const f = { q: bones.map((b) => b.quaternion.clone()) };
        for (const s of ["Right", "Left"]) {
          const arm = W(`${s}Arm`), fore = W(`${s}ForeArm`), hand = W(`${s}Hand`), mid = W(`${s}HandMiddle1`);
          const u = fore.clone().sub(arm).normalize(), v = hand.clone().sub(fore).normalize(), w = mid.clone().sub(hand).normalize();
          f[s + "Elbow"] = 180 - u.angleTo(v) * 180 / Math.PI;
          f[s + "Wrist"] = v.angleTo(w) * 180 / Math.PI;
          f[s + "Palm"] = palm(s);
          const up = W(`${s}UpLeg`), knee = W(`${s}Leg`), foot = W(`${s}Foot`);
          f[s + "Knee"] = 180 - knee.clone().sub(up).normalize().angleTo(foot.clone().sub(knee).normalize()) * 180 / Math.PI;
          f[s + "Foot"] = foot; f[s + "Toe"] = W(`${s}ToeBase`);
        }
        f.hips = W("Hips"); f.spine2 = W("Spine2"); f.head = W("Head").lerp(W("HeadTop_End"), 0.5);
        f.low = Math.min(...bones.filter((b) => !/Toe|Foot/.test(b.name)).map((b) => b.getWorldPosition(new V()).y));
        frames.push(f);
      }
      act.stop(); mx.uncacheRoot(ch);
      const segDist = (p, a, b) => { const ab = b.clone().sub(a), t = Math.max(0, Math.min(1, p.clone().sub(a).dot(ab) / ab.lengthSq())); return p.distanceTo(a.clone().addScaledVector(ab, t)); };
      // per-bone per-frame turn
      const turns = bones.map((_, bi) => frames.slice(1).map((f, i) => angle(f.q[bi], frames[i].q[bi])));
      const pops = [];
      turns.forEach((tr, bi) => tr.forEach((d, i) => {
        const nb = [tr[i - 2], tr[i - 1], tr[i + 1], tr[i + 2]].filter((x) => x !== undefined).sort((a, b) => a - b);
        const ref = nb.length ? nb[Math.floor(nb.length / 2)] : 0;
        if (d > 8 && d > 3 * Math.max(ref, 1.5)) pops.push({ bone: bones[bi].name, frame: i + 2, deg: +d.toFixed(1), neighbours: +ref.toFixed(1) });
      }));
      pops.sort((a, b) => b.deg - a.deg);
      const groups = { spine: /Spine|Neck|Head|Hips/, rightArm: /^Right(Shoulder|Arm|ForeArm|Hand)$/, leftArm: /^Left(Shoulder|Arm|ForeArm|Hand)$/, rightFingers: /^RightHand.+/, leftFingers: /^LeftHand.+/, legs: /UpLeg|Leg$|Foot|Toe/ };
      const maxTurn = {};
      for (const [g, re] of Object.entries(groups)) {
        let best = { deg: 0 };
        turns.forEach((tr, bi) => { if (re.test(bones[bi].name)) tr.forEach((d, i) => { if (d > best.deg) best = { deg: +d.toFixed(1), bone: bones[bi].name, frame: i + 2 }; }); });
        maxTurn[g] = best;
      }
      const ext = (key, fn) => { let best = null; frames.forEach((f, i) => { const v = fn(f); if (best === null || v < best.v) best = { v: +v.toFixed(3), frame: i + 1 }; }); return best; };
      const out = { name, frames: frames.length, seconds: +clip.duration.toFixed(2), pops: pops.slice(0, 6), maxTurn };
      for (const s of ["Right", "Left"]) {
        out[s + "WristMax"] = (() => { const b = ext(0, (f) => -f[s + "Wrist"]); return { deg: -b.v, frame: b.frame }; })();
        out[s + "ElbowMin"] = ext(0, (f) => f[s + "Elbow"]);
        out[s + "KneeMin"] = ext(0, (f) => f[s + "Knee"]);
        out[s + "TorsoClear"] = ext(0, (f) => segDist(f[s + "Palm"], f.hips, f.spine2) - 0.12);
        out[s + "HeadClear"] = ext(0, (f) => f[s + "Palm"].distanceTo(f.head) - 0.11);
        let slide = { v: 0 };
        frames.forEach((f, i) => { if (!i) return; const a = frames[i - 1][s + "Foot"], b = f[s + "Foot"]; if (Math.min(a.y, b.y) < 0.13) { const v = Math.hypot(b.x - a.x, b.z - a.z) * 30; if (v > slide.v) slide = { v: +v.toFixed(2), frame: i + 1 }; } });
        out[s + "PlantedSlide"] = slide;
      }
      out.groundLow = ext(0, (f) => f.low);
      out.seam = { deg: +poseDiff(frames[0].q, frames.at(-1).q).toFixed(1), palmCm: +(frames[0].RightPalm.distanceTo(frames.at(-1).RightPalm) * 100).toFixed(1) };
      out.baseStart = +poseDiff(frames[0].q, Pose(baseClip, 0)).toFixed(1);
      out.baseEndVsBaseFirst = +poseDiff(frames.at(-1).q, Pose(baseClip, 0)).toFixed(1);
      out.baseEndVsBaseLast = +poseDiff(frames.at(-1).q, Pose(baseClip, baseClip.duration - 1e-4)).toFixed(1);
      return out;
    }, { name, baseFile: meta.base });
    console.log(JSON.stringify(result));
  }
} finally { await browser.close(); server.close(); }
