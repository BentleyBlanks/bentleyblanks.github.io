// Script_FirstLevelSpaceShots.mjs - engine captures of the 01-06 keyframes (docs/Data_FirstLevelSpace0106_20260923.md §7).
// Everything is shot at the game's own 55 deg vertical FOV (K5ads adds the x0.72 aim-down-sights view): the
// 09.23 review found the old 20/45/66/80 deg captures flattered K3/K5/K6. Cameras, yaw and pitch come from
// Script_FirstLevelSpaceProbe (the same table the tests assert on). People are whatever the stage places:
//   · K4/K4b/K4c are taken from the REAL mounted gun (stage 4: spawn on the seat, occupy MissionGun, turn).
//   · K3 keeps the AI's own stance (mostly prone). K3zoom is the same camera at 20 deg: an identification crop to
//     show where the guards lie, NOT a player view (the kneeling stance is the Front/Ai packages' part).
//   · K1/K2 have no 01 cast: the cameras are the 2026-09-25 storyboard marks (Data_OpeningStoryboards shunzi.witnessEye /
//     dragged); the people there are shot by Script_OpeningStoryboardShots in the real flow.
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
const FOV = 55, ADS = 0.72;
const cum = TP.map((_, i) => Probe.RouteLength(TP.slice(0, i + 1)));
// Hull yaw: faceTo target when the waypoint has one, otherwise the direction to the next waypoint. The model
// faces local -Z, so yaw = atan2(-dx, -dz) (same convention as FrontBattle.MoveTank).
const W = (id) => { const i = Rt.FrontTankIndex(id), w = TP[i], t = w.faceTo ? Rt.FRONT_SPACE.tankTargets[w.faceTo] : TP[Math.min(i + 1, TP.length - 1)];
  const u = w.turretTo ? Rt.FRONT_SPACE.tankTargets[w.turretTo] : t;
  return { x: w.x, z: w.z, s: cum[i], hullYaw: Math.atan2(-(t.x - w.x), -(t.z - w.z)), turretYaw: Math.atan2(-(u.x - w.x), -(u.z - w.z)) }; };
// [frame id, keyframe id, tank pose, groups hidden, options]
const PLAN = [
  { stage: 2, frames: [["K1", "K1"], ["K2", "K2"]] },
  { stage: 3, frames: [["K3", "K3"], ["K3zoom", "K3", null, null, { fov: 20 }], ["K10", "K10", null, ["approach"]], ["TOP", null]] },
  { stage: 4, mounted: [["K4", "K4"], ["K4b", "K4b"], ["K4c", "K4c"]],
    frames: [["K5", "K5", W("HullDown")], ["K5ads", "K5", W("HullDown"), null, { fov: FOV * ADS }], ["K6", "K6", W("BendExit")], ["K7", "K7", W("Pressure")]] },
  { stage: 5, frames: [["K8", "K8", W("Block")], ["K9", "K9", W("Block")]] },
  { stage: 6, frames: [["K11", "K11"]] },
];
const server = await ServeRoot(path.resolve(WT), 0);
const browser = await LaunchBrowser();
const log = [];
const PlaceTank = (page, t) => page.evaluate((t) => {
  const r = window.Tengxian.Debug.FirstLevelMissionRuntime(); if (!r?.tank) return;
  r.tank.present = true; r.tank.active = true; r.tank.x = t.x; r.tank.z = t.z; r.tank.roadProgress = t.s;
  r.tank.hullYaw = t.hullYaw; r.tank.turretYaw = t.turretYaw;
  // The sample-point editor pauses the mission, so push the pose into the view ourselves.
  r.view.tank.visible = true; r.view.SyncTank(r.tank);
}, t);
try {
  for (const { stage, frames, mounted = [] } of PLAN) {
    const todoMounted = mounted.filter(([k]) => !only || only.includes(k));
    const todo = frames.filter(([k]) => !only || only.includes(k));
    if (!todo.length && !todoMounted.length) continue;
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errors = []; page.on("pageerror", (e) => errors.push(String(e)));
    const url = `http://127.0.0.1:${server.address().port}/Taierzhuang1938/?whitebox=p012&shot=1&manual=1&missionStage=${stage}&quality=medium&scale=small`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 180000 });
    await page.waitForFunction(() => window.Tengxian?.state?.ready, null, { timeout: 300000 });
    await page.evaluate(() => window.Tengxian.StepFrames(120));
    // Mounted frames first (game camera, no editor): spawn on the seat, occupy the captured gun, turn to each target.
    for (const [k, kid] of todoMounted) {
      const kf = K[kid];
      const res = await page.evaluate(({ seat, yaw, pitch }) => {
        const g = window.Tengxian, r = g.Debug.FirstLevelMissionRuntime();
        if (!g.emplacement.View()) { g.player.Spawn(seat.x, seat.z, yaw); g.StepFrames(20, 1 / 60, false); g.Debug.Emplacement.Occupy(r.gunId); }
        g.player.yaw = yaw; g.player.pitch = pitch; g.StepFrames(30, 1 / 60, false); g.StepFrames(2, 1 / 60, true);
        const st = g.Debug.Emplacement.State();
        return { mounted: g.emplacement.View()?.id || null, playerYaw: +st.playerYaw.toFixed(3), atLimit: !!g.emplacement.View()?.atYawLimit, alive: g.player.alive };
      }, { seat: S.seat, yaw: kf.yawRad, pitch: kf.pitchRad });
      await page.screenshot({ path: path.join(out, `${k}.png`) });
      log.push({ k, stage, mounted: true, want: { yaw: kf.yawRad, pitch: kf.pitchRad }, res }); console.log(k, "stage", stage, "mounted", JSON.stringify(res));
    }
    if (todoMounted.length) await page.evaluate(() => { window.Tengxian.Debug.Emplacement.Vacate("shots"); window.Tengxian.StepFrames(10, 1 / 60, false); });
    if (todo.length) {
      const opened = await page.evaluate(() => window.Tengxian.Debug.OpenEditor("samplePoints"));
      log.push({ stage, opened, errors: [...errors] });
    }
    for (const [k, kid, tank, hide, opts = {}] of todo) {
      // K4/K10 are after the capture: hide the stage-3 nest defenders (the gunner stands 1 m in front of the seat).
      await page.evaluate(async ({ groups }) => {
        const r = window.Tengxian.Debug.FirstLevelMissionRuntime(), { MISSION_ENCOUNTERS: E } = await import("./Data_FirstLevelMission.mjs");
        for (const g of ["approach"]) for (const s of E[g]) { const a = r.enemies.get(s.id); if (a?.root) a.root.visible = !(groups || []).includes(g); }
      }, { groups: hide || null });
      const kf = kid ? K[kid] : null;
      const pose = !kf ? { id: k, x: 10, z: -150, y: 110, yaw: 0, pitch: -1.5, fov: 70 }
        : { id: k, x: kf.camera.x, z: kf.camera.z, y: kf.camera.y, yaw: kf.yawRad, pitch: kf.pitchRad, fov: opts.fov || FOV };
      if (tank) await PlaceTank(page, tank);
      const res = await page.evaluate((p) => { const ed = window.Tengxian.editor; const tool = ed.active; tool.host.SetViewmodelVisible?.(false);
        const r = tool.ApplyPose({ ...p, h: null, phase: null, far: null }); document.getElementById("edRoot")?.classList.add("off"); return r; }, pose);
      await page.evaluate(() => { window.Tengxian.editor.active.host.SetViewmodelVisible?.(false); window.Tengxian.StepFrames(30); });
      const state = await page.evaluate(() => { const r = window.Tengxian.Debug.FirstLevelMissionRuntime();
        return { tank: r?.tank ? { x: r.tank.x, z: r.tank.z, present: r.tank.present } : null,
          guards: (r.guards || []).map((g) => g.actor ? { id: g.actor.id, stance: g.actor.stance } : null) }; });
      await page.screenshot({ path: path.join(out, `${k}.png`) });
      log.push({ k, stage, pose, res, state }); console.log(k, "stage", stage, "fov", pose.fov, JSON.stringify(res), JSON.stringify(state.tank));
    }
    log.push({ stage, errorsEnd: errors });
    await page.close();
  }
} finally { fs.writeFileSync(path.join(out, "shots_log.json"), JSON.stringify(log, null, 1)); await browser.close(); await new Promise((r) => server.close(r)); }
