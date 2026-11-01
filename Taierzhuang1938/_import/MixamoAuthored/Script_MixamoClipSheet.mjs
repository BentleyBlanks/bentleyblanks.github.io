// Claude 自制动作的审核工具（2026-11-01 起，审 Animation_Claude_*.glb；见 Data_MixamoLibraryCurate.mjs 的 AUTHORED）。
//   node Taierzhuang1938/_import/MixamoAuthored/Script_MixamoClipSheet.mjs <clip.glb> <out.png> [times...] [--target=hips|hands|chest|head|feet] [--dist=1.6] [--views=front,right,left,top,rear,back]
// Contact sheet of one clip in Tool_MixamoAnimationPreview.html (rifle / grenade / dadao attached as in the tool).
// times: seconds, or fractions like 0.25f (of clip duration). Default: 8 evenly spaced.
// Prints JSON: duration, per-time right-palm / left-palm world positions, rifle knob distances if a rifle is shown.
import path from "node:path";
import { pathToFileURL } from "node:url";
const repo = path.resolve(import.meta.dirname, "..", "..", "..");
const { LaunchBrowser } = await import(pathToFileURL(path.join(repo, "PrairieFire1937", "Script_BrowserTestKit.mjs")));
const { ServeRoot } = await import(pathToFileURL(path.join(repo, "Taierzhuang1938", "Script_DevServer.mjs")));

const args = process.argv.slice(2);
const flags = Object.fromEntries(args.filter((a) => a.startsWith("--")).map((a) => a.slice(2).split("=")));
const [clip, outPng, ...timeArgs] = args.filter((a) => !a.startsWith("--"));
const views = (flags.views || "front,side,top").split(",");
// Views relative to the character: yaw offset from its facing (0 = in front of it), pitch.
const VIEW = { front: [0.35, 0.12], side: [-Math.PI / 2, 0.1], right: [-Math.PI / 2, 0.1], left: [Math.PI / 2, 0.1], top: [-0.5, 1.15], back: [Math.PI, 0.2], rear: [Math.PI - 0.5, 0.35] };
const dist = Number(flags.dist || 1.6);

const server = await ServeRoot(repo, 0), browser = await LaunchBrowser();
const base = `http://127.0.0.1:${server.address().port}/Taierzhuang1938/Tool_MixamoAnimationPreview.html`;
try {
  const page = await browser.newPage({ viewport: { width: 900, height: 900 } });
  const errors = []; page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${base}#${encodeURIComponent(clip)}`);
  await page.waitForFunction((f) => window.__preview?.action && decodeURIComponent(location.hash).includes(f.split(".")[0]) && document.getElementById("clipTitle").textContent !== "—", clip, { timeout: 120000 });
  await page.waitForTimeout(800);
  await page.evaluate(({ rifle, grenade }) => {
    document.getElementById("edRoot").style.display = "none";
    for (const [id, v] of [["rifle", rifle], ["grenade", grenade]]) {
      if (v === undefined) continue;
      const el = document.getElementById(id); el.value = v; el.dispatchEvent(new Event("change"));
    }
    document.getElementById("follow").checked = true;
  }, { rifle: flags.rifle, grenade: flags.grenade });
  await page.waitForTimeout(800);
  const duration = await page.evaluate(() => window.__preview.action.getClip().duration);
  const times = (timeArgs.length ? timeArgs : Array.from({ length: 8 }, (_, i) => `${(i / 7).toFixed(3)}f`))
    .map((t) => (t.endsWith("f") ? Number(t.slice(0, -1)) * duration * 0.999 : Number(t)));
  const shots = [], samples = [];
  for (const t of times) {
    const sample = await page.evaluate(async ({ t, target }) => {
      const P = window.__preview, a = P.action;
      a.paused = true; a.time = t; a.getMixer().update(0);
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const V = P.camera.position.constructor, ch = P.character;
      const bone = (n) => ch.getObjectByName(n).getWorldPosition(new V());
      const palm = (s) => bone(`${s}Hand`).lerp(bone(`${s}HandMiddle1`), 0.55);
      const focus = target === "hips" ? bone("Hips") : target === "feet" ? bone("Hips").setY(0.3)
        : target === "hands" ? palm("Right").lerp(palm("Left"), 0.5) : target === "head" ? bone("Head") : bone("Spine2").lerp(palm("Right"), 0.4);
      const lat = bone("LeftUpLeg").sub(bone("RightUpLeg")); lat.y = 0; lat.normalize();
      const fwd = new V().crossVectors(lat, new V(0, 1, 0)).normalize();
      const out = { t: +t.toFixed(3), R: palm("Right").toArray().map((v) => +v.toFixed(3)), L: palm("Left").toArray().map((v) => +v.toFixed(3)), focus: focus.toArray(), facing: Math.atan2(fwd.x, fwd.z) };
      return out;
    }, { t, target: flags.target || "chest" });
    samples.push(sample);
    for (const view of views) {
      await page.evaluate(({ focus, yaw, pitch, dist }) => {
        const o = window.__preview.orbit;
        o.yaw = yaw; o.pitch = pitch; o.dist = dist;
        o.target.set(focus[0], focus[1], focus[2]); o.pan.set(0, 0, 0);
        document.getElementById("follow").checked = false;
      }, { focus: sample.focus, yaw: sample.facing + VIEW[view][0], pitch: VIEW[view][1], dist });
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      shots.push({ t: sample.t, view, png: (await page.screenshot({ type: "png" })).toString("base64") });
    }
  }
  const sheet = await browser.newPage({ viewport: { width: 300 * views.length, height: 300 * times.length } });
  await sheet.setContent(`<body style="margin:0;background:#111;display:grid;grid-template-columns:repeat(${views.length},300px)">${shots.map((s) =>
    `<div style="position:relative;width:300px;height:300px"><img src="data:image/png;base64,${s.png}" style="width:300px;height:300px"><span style="position:absolute;left:6px;top:4px;color:#ffd;font:13px monospace;text-shadow:0 0 3px #000">t=${s.t}s ${s.view}</span></div>`).join("")}</body>`);
  await sheet.screenshot({ path: outPng, fullPage: true });
  console.log(JSON.stringify({ clip, duration: +duration.toFixed(3), samples: samples.map(({ focus, facing, ...s }) => s), errors }));
} finally { await browser.close(); server.close(); }
