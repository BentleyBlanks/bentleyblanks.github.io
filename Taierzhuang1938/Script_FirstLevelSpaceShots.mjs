// Script_FirstLevelSpaceShots.mjs - engine captures of the 01-06 keyframes K1-K11 (free camera through the sample-point editor ApplyPose).
// Cameras, yaw and pitch come from Script_FirstLevelSpaceProbe (the same table the tests assert on).
// Usage: node Taierzhuang1938/Script_FirstLevelSpaceShots.mjs [--only=K1,K3] ; writes Taierzhuang1938/_shots/Space0106/<K>.png + shots_log.json
import fs from "node:fs"; import path from "node:path"; import { pathToFileURL, fileURLToPath } from "node:url";
const WT = fileURLToPath(new URL("../", import.meta.url)).replace(/\\/g, "/");
const { LaunchBrowser } = await import(pathToFileURL(WT + "PrairieFire1937/Script_BrowserTestKit.mjs").href);
const { ServeRoot } = await import(pathToFileURL(WT + "Taierzhuang1938/Script_DevServer.mjs").href);
const Probe = await import(pathToFileURL(WT + "Taierzhuang1938/Script_FirstLevelSpaceProbe.mjs").href);
const Rt = await import(pathToFileURL(WT + "Taierzhuang1938/Data_FirstLevelFrontRoute.mjs").href);
const out = WT + "Taierzhuang1938/_shots/Space0106/"; fs.mkdirSync(out, { recursive: true });
const only = process.argv.find((a) => a.startsWith("--only="))?.slice(7).split(",") || null;
const K = Object.fromEntries(Probe.ProbeKeyframes().map((k) => [k.id, k]));
const TP = Rt.FRONT_TANK_PATH, S = Rt.FRONT_SORTIE;
const cum = TP.map((_, i) => Probe.RouteLength(TP.slice(0, i + 1)));
// Hull yaw: faceTo target when the waypoint has one, otherwise the direction to the next waypoint. The model
// faces local -Z, so yaw = atan2(-dx, -dz) (same convention as FrontBattle.MoveTank).
const W = (id) => { const i = Rt.FrontTankIndex(id), w = TP[i], t = w.faceTo ? Rt.FRONT_SPACE.tankTargets[w.faceTo] : TP[Math.min(i + 1, TP.length - 1)];
  const u = w.turretTo ? Rt.FRONT_SPACE.tankTargets[w.turretTo] : t;
  return { x: w.x, z: w.z, s: cum[i], hullYaw: Math.atan2(-(t.x - w.x), -(t.z - w.z)), turretYaw: Math.atan2(-(u.x - w.x), -(u.z - w.z)) }; };
// Which mission stage each frame is shot in (people and tank as that stage places them), and an optional tank pose.
const PLAN = [
  { stage: 2, frames: [["K1", null], ["K2", null]] },
  { stage: 3, frames: [["K3", null], ["K4", null], ["K10", null], ["TOP", null]] },
  { stage: 4, frames: [["K5", W("HullDown")], ["K6", W("BendExit")], ["K7", W("Pressure")]] },
  { stage: 5, frames: [["K8", W("Block")], ["K9", W("Block")]] },
  { stage: 6, frames: [["K11", null]] },
];
const server = await ServeRoot(path.resolve(WT), 0);
const browser = await LaunchBrowser();
const log = [];
try {
  for (const { stage, frames } of PLAN) {
    const todo = frames.filter(([k]) => !only || only.includes(k));
    if (!todo.length) continue;
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errors = []; page.on("pageerror", (e) => errors.push(String(e)));
    const url = `http://127.0.0.1:${server.address().port}/Taierzhuang1938/?whitebox=p012&shot=1&manual=1&missionStage=${stage}&quality=medium&scale=small`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 180000 });
    await page.waitForFunction(() => window.Tengxian?.state?.ready, null, { timeout: 300000 });
    await page.evaluate(() => window.Tengxian.StepFrames(120));
    const opened = await page.evaluate(() => window.Tengxian.Debug.OpenEditor("samplePoints"));
    log.push({ stage, opened, errors: [...errors] });
    for (const [k, tank] of todo) {
      const kf = K[k];
      const pose = k === "TOP" ? { id: k, x: 10, z: -150, y: 110, yaw: 0, pitch: -1.5, fov: 70 }
        : { id: k, x: kf.camera.x, z: kf.camera.z, y: kf.camera.y, yaw: kf.yawRad, pitch: kf.pitchRad, fov: k === "K5" ? 20 : k === "K6" ? 45 : k === "K3" ? 80 : 66 };
      if (tank) await page.evaluate((t) => {
        const r = window.Tengxian.Debug.FirstLevelMissionRuntime(); if (!r?.tank) return;
        r.tank.present = true; r.tank.active = true; r.tank.x = t.x; r.tank.z = t.z; r.tank.roadProgress = t.s;
        r.tank.hullYaw = t.hullYaw; r.tank.turretYaw = t.turretYaw;
        // The sample-point editor pauses the mission, so push the pose into the view ourselves.
        r.view.tank.visible = true; r.view.SyncTank(r.tank);
      }, tank);
      const res = await page.evaluate((p) => { const ed = window.Tengxian.editor; const tool = ed.active; tool.host.SetViewmodelVisible?.(false);
        const r = tool.ApplyPose({ ...p, h: null, phase: null, far: null }); document.getElementById("edRoot")?.classList.add("off"); return r; }, pose);
      await page.evaluate(() => { window.Tengxian.editor.active.host.SetViewmodelVisible?.(false); window.Tengxian.StepFrames(30); });
      const tankNow = await page.evaluate(() => { const r = window.Tengxian.Debug.FirstLevelMissionRuntime(); return r?.tank ? { x: r.tank.x, z: r.tank.z, present: r.tank.present, view: r.view.tank.position.toArray().map((v) => +v.toFixed(2)) } : null; });
      await page.screenshot({ path: path.join(out, `${k}.png`) });
      log.push({ k, stage, pose, res, tankNow }); console.log(k, "stage", stage, JSON.stringify(res), JSON.stringify(tankNow));
    }
    log.push({ stage, errorsEnd: errors });
    await page.close();
  }
} finally { fs.writeFileSync(path.join(out, "shots_log.json"), JSON.stringify(log, null, 1)); await browser.close(); await new Promise((r) => server.close(r)); }
