// Dedicated firearm whitebox acceptance. Inputs use the production event routes;
// Debug.WeaponRange only positions fixtures and returns inspectable evidence.
// --shot also saves one scene/table/far-target view and every firearm's ADS view.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";
import { WEAPONS } from "./Data_Weapons.mjs";
import { WEAPON_RANGE_TARGETS, WEAPON_RANGE_FIRING_ORIGIN, WEAPON_RANGE_VIEWS } from "./Data_WeaponRange.mjs";

// --smoke runs one representative firearm without full-magazine, repeated death or menu reload checks.
// --only=HanYang,Mauser96 selects weapons; catalog completeness is always checked against the full table.
const projectDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(projectDir, "..");
const shotDir = path.join(projectDir, "_shots", "WeaponRange");
const allFirearms = Object.values(WEAPONS).filter((weapon) => weapon.ammo && weapon.magazine > 0);
const smoke = process.argv.includes("--smoke");
const only = process.argv.find((argument) => argument.startsWith("--only="))?.slice(7).split(",");
if (only?.some((id) => !allFirearms.some((weapon) => weapon.id === id))) throw new Error(`Unknown firearm in --only=${only}`);
const firearms = only ? allFirearms.filter((weapon) => only.includes(weapon.id))
  : smoke ? allFirearms.filter((weapon) => weapon.id === "HanYang") : allFirearms;
const progressKey = "tengxian1938_progress_v2";
const progressSeed = JSON.stringify({ cleared: ["CH0_Chuchuan"], furthest: 1 });
const checks = [];
const errors = [];
const evidence = {};
let browser;
const server = await ServeRoot(rootDir, 0);
function Check(name, ok, detail = null) {
  checks.push({ name, ok: !!ok, detail });
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail === null ? "" : ` — ${JSON.stringify(detail)}`}`);
}
try {
  browser = await LaunchBrowser();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(String(error.stack || error)));
  page.on("console", (message) => {
    if (message.type() === "error" && !/fonts\.(googleapis|gstatic)\.com/.test(message.location()?.url || "")) errors.push(message.text());
  });
  await page.addInitScript(({ key, value }) => {
    if (localStorage.getItem(key) === null) localStorage.setItem(key, value);
  }, { key: progressKey, value: progressSeed });
  await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/?shot=1&weapons=1&manual=1&quality=medium&scale=small`, { waitUntil: "load", timeout: 120000 });
  await page.waitForFunction(() => window.Taierzhuang?.state?.ready, null, { timeout: 180000 });
  evidence.boot = await page.evaluate(async () => {
    const game = window.Taierzhuang;
    const range = game.Debug.WeaponRange;
    const { WeaponRangeSigns } = await import("./Script_WeaponRangeField.mjs");
    const signs = WeaponRangeSigns();
    let signTriangles = 0;
    let signAtlas = false;
    game.scene.traverse((object) => {
      if (object.material?.name !== "WeaponRangeSigns" || !object.geometry) return;
      signTriangles += (object.geometry.index?.count || object.geometry.attributes.position.count) / 3;
      signAtlas ||= !!object.material.map?.image?.width && !!object.material.map?.image?.height;
    });
    game.StepFrames(30);
    return {
      api: ["State", "Targets", "Weapons", "GoTo", "AimAt", "Pickup", "Reset", "SetMoving", "SetAmmoMode", "LastShot"].every((name) => typeof range?.[name] === "function"),
      level: game.Debug.Level().id, pinned: game.state.pinned, state: range?.State(), cameraFar: game.camera.far,
      signCount: signs.length, signTriangles, signAtlas,
      targets: range?.Targets(), weapons: range?.Weapons(),
      soldiers: game.ai.soldiers.map((soldier) => ({ id: soldier.id, side: soldier.side, dummy: soldier.dummy })),
      hudVisible: !!document.getElementById("weaponRangePanel") && getComputedStyle(document.getElementById("weaponRangePanel")).display !== "none",
    };
  });
  const boot = evidence.boot;
  Check("Dedicated pinned WeaponRange scene and complete debugging contract", boot.level === "WeaponRange" && boot.pinned && boot.api, { level: boot.level, pinned: boot.pinned, api: boot.api });
  Check("Dedicated HUD remains visible in screenshot mode", boot.hudVisible);
  Check("All table and target labels have real batched atlas geometry", boot.signCount === allFirearms.length + WEAPON_RANGE_TARGETS.length + 2 && boot.signTriangles === boot.signCount * 2 && boot.signAtlas, { count: boot.signCount, triangles: boot.signTriangles, atlas: boot.signAtlas });
  Check("Camera far plane includes the farthest targets", boot.cameraFar > Math.max(...WEAPON_RANGE_TARGETS.map((target) => target.distanceM)) + 20, boot.cameraFar);
  Check("Every firearm comes from the production WEAPONS catalog", JSON.stringify(boot.weapons.map((weapon) => weapon.id).sort()) === JSON.stringify(allFirearms.map((weapon) => weapon.id).sort()));
  Check("Table magazine and ammunition definitions match production", allFirearms.every((weapon) => {
    const actual = boot.weapons.find((entry) => entry.id === weapon.id);
    return actual?.magazine === weapon.magazine && actual?.ammo === weapon.ammo;
  }), boot.weapons);
  Check("Target cast is exactly forty live Japanese dummies", boot.targets.length === 40 && boot.soldiers.length === 40 && boot.soldiers.every((soldier) => soldier.side === "ija" && soldier.dummy) && boot.targets.every((target) => target.alive && target.health === 100));

  Check("Each of the twenty distances has one stationary and one moving target", new Set(WEAPON_RANGE_TARGETS.map((target) => target.distanceM)).size === 20 && WEAPON_RANGE_TARGETS.every((spec) => {
    const actual = boot.targets.find((target) => target.id === spec.id);
    return actual?.distanceM === spec.distanceM && actual?.moving === spec.moving;
  }));
  evidence.renderHealth = await page.evaluate(() => {
    const game = window.Taierzhuang;
    game.Debug.WeaponRange.GoTo("firing"); game.Debug.Mouse(2, false);
    game.StepFrames(120, 1 / 60, false); game.post.hasTaaHistory = false; game.StepFrames(24);
    const source = document.getElementById("view");
    const canvas = document.createElement("canvas");
    canvas.width = source.width; canvas.height = Math.floor(source.height / 2);
    const context = canvas.getContext("2d");
    context.drawImage(source, 0, source.height / 2, source.width, source.height / 2, 0, 0, canvas.width, canvas.height);
    const rgba = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let nearWhite = 0, nearBlack = 0, sum = 0, squares = 0;
    const pixels = rgba.length / 4;
    for (let index = 0; index < rgba.length; index += 4) {
      const luma = rgba[index] * 0.2126 + rgba[index + 1] * 0.7152 + rgba[index + 2] * 0.0722;
      sum += luma; squares += luma * luma;
      if (luma >= 235) nearWhite += 1;
      if (luma <= 12) nearBlack += 1;
    }
    const mean = sum / pixels;
    return { region: "lower half of the actual canvas at firing origin; DOM HUD excluded", pixels,
      nearWhiteRatio: nearWhite / pixels, nearBlackRatio: nearBlack / pixels, meanLuma: mean,
      standardDeviation: Math.sqrt(Math.max(0, squares / pixels - mean * mean)) };
  });
  // The rejected fog-white Far image measured 46.95% near-white and mean luma
  // 224.86 even with its dark DOM HUD included. A clean fixed-origin canvas must
  // remain below these failure levels and contain a visibly varied ground image.
  Check("Actual firing-line canvas retains contrast without fog-white or black output", evidence.renderHealth.nearWhiteRatio < 0.40 && evidence.renderHealth.meanLuma < 218 && evidence.renderHealth.nearBlackRatio < 0.50 && evidence.renderHealth.standardDeviation > 8, evidence.renderHealth);
  evidence.panel = await page.evaluate(() => {
    const game = window.Taierzhuang, range = game.Debug.WeaponRange;
    const initial = range.State();
    document.getElementById("weaponRangeMotion").click(); const frozen = range.State().moving;
    document.getElementById("weaponRangeMotion").click(); const resumed = range.State().moving;
    document.getElementById("weaponRangeAmmo").click(); const reload = range.State().ammoMode;
    document.getElementById("weaponRangeAmmo").click(); const infinite = range.State().ammoMode;
    document.getElementById("weaponRangeReset").click(); const resets = range.State().stats.resets;
    game.Debug.Key("F6"); const hotkeyFrozen = range.State().moving; game.Debug.Key("F6");
    game.Debug.Key("F7"); const hotkeyReload = range.State().ammoMode; game.Debug.Key("F7");
    const resetBefore = range.State().stats.resets; game.Debug.Key("F8"); const hotkeyReset = range.State().stats.resets === resetBefore + 1;
    return { frozen, resumed, reload, infinite, resetAdvanced: resets === initial.stats.resets + 1, hotkeyFrozen, hotkeyReload, hotkeyReset, status: document.getElementById("weaponRangeStatus").textContent };
  });
  Check("HUD buttons and shortcuts control motion, ammunition and reset", evidence.panel.frozen === false && evidence.panel.resumed === true && evidence.panel.reload === "reload" && evidence.panel.infinite === "infinite" && evidence.panel.resetAdvanced && evidence.panel.hotkeyFrozen === false && evidence.panel.hotkeyReload === "reload" && evidence.panel.hotkeyReset && evidence.panel.status.includes("∞"), evidence.panel);
  evidence.walk = await page.evaluate(() => {
    const game = window.Taierzhuang;
    game.Debug.WeaponRange.GoTo("firing"); game.StepFrames(5);
    const before = game.player.position.toArray();
    game.Debug.Key("KeyW", true); game.StepFrames(60, 1 / 60, false);
    game.Debug.Key("KeyW", false); game.StepFrames(20, 1 / 60, false);
    const after = game.player.position.toArray();
    game.Debug.WeaponRange.GoTo("firing");
    return { before, after };
  });
  Check("W moves the real player along the open shooting lane", evidence.walk.before[2] - evidence.walk.after[2] > 1 && Math.abs(evidence.walk.after[1]) < 0.05, evidence.walk);
  evidence.remotePickup = await page.evaluate((ids) => {
    const game = window.Taierzhuang, range = game.Debug.WeaponRange;
    range.GoTo("firing"); game.StepFrames(10);
    const before = game.Debug.Slots().weapon;
    const requested = ids.find((id) => id !== before);
    const response = range.Pickup(requested);
    game.Debug.Key("KeyF"); game.StepFrames(10);
    return { before, requested, response, after: game.Debug.Slots().weapon };
  }, allFirearms.map((weapon) => weapon.id));
  Check("A distant table cannot be picked up through either debug or F", evidence.remotePickup.after === evidence.remotePickup.before, evidence.remotePickup);

  // Real F pickup, RMB ADS, trigger pulls beyond a full magazine, and R action.
  evidence.firearms = [];
  for (const weapon of firearms) {
    const report = await page.evaluate((spec) => {
      const game = window.Taierzhuang, debug = game.Debug, range = debug.WeaponRange;
      debug.Mouse(2, false);
      range.SetAmmoMode("infinite");
      range.GoTo("table", spec.id);
      game.StepFrames(12);
      const pickupsBefore = range.State().stats.pickups;
      debug.Key("KeyF");
      const pickedUp = range.State().stats.pickups - pickupsBefore;
      game.StepFrames(100, 1 / 60, false);
      const picked = debug.Slots();
      range.GoTo("firing");
      game.StepFrames(15);
      const hipFov = game.camera.fov;
      debug.Mouse(2, true);
      game.StepFrames(90);
      const ads = { amount: game.player.ads, bipod: game.player.bipod, fov: game.camera.fov, hipFov, hasSight: !!game.viewmodel.rig?.sight, source: game.viewmodel.rig?.source };
      const shotsBefore = game.state.playerShots;
      const ammoBefore = game.state.ammo;
      const attempts = spec.smoke ? 2 : spec.magazine + 2;
      const cooldownFrames = Math.ceil(Math.max(spec.fireIntervalS || 0, spec.boltTimeS || 0, 0.3) * 60) + 12;
      for (let shot = 0; shot < attempts; shot += 1) {
        debug.Fire();
        game.StepFrames(cooldownFrames, 1 / 60, false);
      }
      const firing = { expected: attempts, actual: game.state.playerShots - shotsBefore, ammoBefore, ammoAfter: game.state.ammo, last: range.LastShot() };
      debug.Mouse(2, false);
      game.StepFrames(90, 1 / 60, false);
      if (!spec.smoke) debug.Key("KeyR");
      game.StepFrames(1);
      const reloadAction = game.viewmodel.action?.kind || game.viewmodel.action?.type || null;
      game.StepFrames(spec.smoke ? 1 : Math.ceil((spec.reloadTimeS + 1) * 60), 1 / 60, false);
      const reload = { action: reloadAction, ammo: game.state.ammo, complete: !game.viewmodel.IsBusy() };
      return { id: spec.id, picked, pickedUp, ads, firing, reload };
    }, { ...weapon, smoke });
    evidence.firearms.push(report);
    Check(`${weapon.id}: F picks up the actual table gun and equips its viewmodel`, report.picked.weapon === weapon.id && report.picked.viewmodel === weapon.id && report.pickedUp === 1, { ...report.picked, pickups: report.pickedUp });
    Check(`${weapon.id}: RMB raises the sight and narrows the field of view`, report.ads.amount > 0.9 && report.ads.bipod === false && report.ads.hipFov > report.ads.fov + 2 && report.ads.hasSight && report.ads.source === "model", report.ads);
    Check(`${weapon.id}: ${smoke ? "two real trigger pulls fire" : "infinite ammunition still fires beyond its magazine"}`, report.firing.actual === report.firing.expected && report.firing.ammoAfter === report.firing.ammoBefore && report.firing.last?.weapon === weapon.id, report.firing);
    if (!smoke) Check(`${weapon.id}: R plays and completes a real reload`, report.reload.action === "reload" && report.reload.complete && report.reload.ammo === weapon.magazine, report.reload);
  }

  if (!smoke) {
  evidence.reload = await page.evaluate((spec) => {
    const game = window.Taierzhuang, debug = game.Debug, range = debug.WeaponRange;
    range.GoTo("table", spec.id); game.StepFrames(10); debug.Key("KeyF"); game.StepFrames(100, 1 / 60, false);
    range.GoTo("firing"); range.SetAmmoMode("reload");
    const initial = game.state.ammo;
    const cooldown = Math.ceil(Math.max(spec.fireIntervalS, spec.boltTimeS || 0, 0.3) * 60) + 12;
    const before = game.state.playerShots;
    for (let i = 0; i < initial; i += 1) { debug.Fire(); game.StepFrames(cooldown, 1 / 60, false); }
    const empty = game.state.ammo, fired = game.state.playerShots - before;
    debug.Key("KeyR"); game.StepFrames(1);
    const action = game.viewmodel.action?.kind || game.viewmodel.action?.type || null;
    game.StepFrames(spec.smoke ? 1 : Math.ceil((spec.reloadTimeS + 1) * 60), 1 / 60, false);
    const filled = game.state.ammo;
    const lastBefore = game.state.playerShots; debug.Fire();
    return { initial, empty, fired, action, filled, afterReloadFired: game.state.playerShots > lastBefore };
  }, allFirearms.find((weapon) => weapon.id === "Mauser96") || allFirearms[0]);
  Check("Reload mode consumes a complete magazine, reloads with R, and fires again", evidence.reload.initial > 0 && evidence.reload.empty === 0 && evidence.reload.fired === evidence.reload.initial && evidence.reload.action === "reload" && evidence.reload.filled === evidence.reload.initial && evidence.reload.afterReloadFired, evidence.reload);

  }
  evidence.motion = await page.evaluate(() => {
    const game = window.Taierzhuang, range = game.Debug.WeaponRange;
    range.Reset(); range.GoTo("firing"); range.SetMoving(true); game.StepFrames(5);
    function Snapshot() {
      return range.Targets().map((target) => {
        const soldier = game.ai.soldiers.find((entry) => entry.id === target.soldierId);
        const root = soldier?.actor?.root;
        const body = soldier?.body?.body?.translation();
        const torso = soldier?.actor?.GetBoneHitboxes().find((shape) => shape.part === "torso");
        const center = torso ? torso.start.clone().add(torso.end).multiplyScalar(0.5) : null;
        return { ...target,
          actual: soldier?.position.toArray(), actor: root?.position.toArray(),
          body: body ? [body.x, body.y, body.z] : null,
          torso: center?.toArray(),
        };
      });
    }
    const initial = Snapshot(); game.StepFrames(120, 1 / 60, false);
    const moved = Snapshot(); range.SetMoving(false); const frozen = Snapshot();
    game.StepFrames(120, 1 / 60, false); const still = Snapshot();
    range.SetMoving(true); game.StepFrames(90, 1 / 60, false); const resumed = Snapshot();
    return { initial, moved, frozen, still, resumed };
  });
  const motion = evidence.motion;
  const Distance = (a, b) => !a || !b ? Infinity : Math.hypot(...a.map((value, index) => value - b[index]));
  Check("Moving dummies move while stationary dummies stay at their marks", motion.initial.every((target, index) => target.moving ? Distance(target.actual, motion.moved[index].actual) > 0.01 : Distance(target.actual, motion.moved[index].actual) < 0.001));
  Check("Freeze stops all target translation and resume restarts moving targets", motion.frozen.every((target, index) => Distance(target.actual, motion.still[index].actual) < 0.001) && motion.still.filter((target) => target.moving).every((target) => Distance(target.actual, motion.resumed.find((entry) => entry.id === target.id).actual) > 0.01));
  Check("Live actors and Rapier bodies remain synchronized with target positions", [motion.initial, motion.moved, motion.still, motion.resumed].flat().every((target) => Distance(target.actual, target.actor) < 0.001 && Distance(target.actual, target.body) < 0.001));
  Check("Target distances remain measured from the firing origin while moving", [motion.initial, motion.moved, motion.still, motion.resumed].flat().every((target) => target.actual && Math.abs(Math.hypot(target.actual[0] - WEAPON_RANGE_FIRING_ORIGIN.x, target.actual[2] - WEAPON_RANGE_FIRING_ORIGIN.z) - target.distanceM) < 0.001));
  Check("Live skeletal torso hitboxes travel with the moving actors", [motion.initial, motion.moved, motion.still, motion.resumed].flat().every((target) => target.torso && Math.hypot(target.torso[0] - target.actual[0], target.torso[2] - target.actual[2]) < 1.2 && target.torso[1] > target.actual[1] && target.torso[1] < target.actual[1] + 2.5));

  evidence.ballistics = await page.evaluate((spec) => {
    const game = window.Taierzhuang, debug = game.Debug, range = debug.WeaponRange;
    range.Reset(); range.SetMoving(false); range.SetAmmoMode("infinite");
    range.GoTo("table", spec.id); game.StepFrames(10); debug.Key("KeyF"); game.StepFrames(100, 1 / 60, false);
    range.GoTo("firing"); debug.Mouse(2, true); game.StepFrames(90);
    const targets = range.Targets().filter((target) => !target.moving).sort((a, b) => a.distance - b.distance);
    const reports = [];
    const chosenTargets = spec.smoke ? [targets[0]] : [targets[0], targets.at(-1), range.Targets().filter((target) => target.moving).sort((a, b) => a.distance - b.distance)[0]];
    for (const chosen of chosenTargets) {
      range.SetMoving(chosen.moving);
      const shots = [];
      for (let attempt = 0; attempt < (spec.smoke ? 8 : 32); attempt += 1) {
        range.AimAt(chosen.id); game.StepFrames(2);
        const before = game.state.playerShots;
        const healthBefore = range.Targets().find((entry) => entry.id === chosen.id).health;
        debug.Fire();
        const last = range.LastShot();
        const target = range.Targets().find((entry) => entry.id === chosen.id);
        shots.push({ fired: game.state.playerShots > before, last, healthBefore, health: target.health, alive: target.alive });
        game.StepFrames(Math.ceil(Math.max(spec.fireIntervalS, spec.boltTimeS || 0) * 60) + 20, 1 / 60, false);
        if (last?.hitKind === "soldier" && last?.targetId === chosen.id && (target.health < 100 || !target.alive)) break;
      }
      reports.push({ id: chosen.id, distance: chosen.distance, shots });
    }
    debug.Mouse(2, false);
    // Kill and respawn repeatedly through real ballistic damage; never call Kill/TakeHit.
    range.SetMoving(false);
    const victim = targets[0];
    const counts = [];
    for (let round = 0; round < (spec.smoke ? 0 : 3); round += 1) {
      debug.Mouse(2, true); game.StepFrames(80, 1 / 60, false);
      let killed = false;
      for (let attempt = 0; attempt < 12; attempt += 1) {
        range.AimAt(victim.id); game.StepFrames(2); debug.Fire();
        killed = !range.Targets().find((target) => target.id === victim.id).alive;
        game.StepFrames(Math.ceil(spec.fireIntervalS * 60) + 20, 1 / 60, false);
        if (killed) break;
      }
      debug.Mouse(2, false);
      game.StepFrames(Math.ceil((range.State().respawnS + 3) * 60), 1 / 60, false);
      counts.push({ killed, count: game.ai.soldiers.length, target: range.Targets().find((target) => target.id === victim.id), stats: range.State().stats });
    }
    return { reports, counts, state: range.State() };
  }, { ...(smoke ? firearms[0] : allFirearms.find((weapon) => weapon.id === "ZhongZheng") || allFirearms[0]), smoke });
  for (const report of evidence.ballistics.reports) {
    Check(`Real ballistic hit and damage at ${report.distance} m`, report.shots.some((shot) => shot.fired && shot.last?.targetId === report.id && shot.last?.hitKind === "soldier" && shot.last.dist > report.distance * 0.8 && (!shot.alive || shot.health < 100)), report);
  }
  Check("Hit receipt damage matches the real target health change", evidence.ballistics.reports.every((report) => report.shots.filter((shot) => shot.fired && shot.last?.targetId === report.id).every((shot) => Math.abs(shot.last.damage - (shot.healthBefore - Math.max(0, shot.health))) < 0.001)));
  if (!smoke) Check("Repeated lethal hits respawn healthy targets without accumulating soldiers", evidence.ballistics.counts.every((round) => round.killed && round.count === 40 && round.target.alive && round.target.health === 100), evidence.ballistics.counts);
  evidence.reset = await page.evaluate(() => {
    const game = window.Taierzhuang, range = game.Debug.WeaponRange;
    const state = range.Reset();
    return { state, soldiers: game.ai.soldiers.length };
  });
  Check("Reset restores every target and clears shooting totals", evidence.reset.soldiers === 40 && evidence.reset.state.targets.every((target) => target.alive && target.health === 100) && evidence.reset.state.stats.shots === 0 && evidence.reset.state.stats.hits === 0 && evidence.reset.state.stats.killed === 0, evidence.reset.state.stats);
  evidence.explicitAdvance = await page.evaluate(async ({ key, value }) => {
    const game = window.Taierzhuang;
    const before = { phase: game.state.phaseIndex, running: game.state.running };
    await game.AdvanceLevel({ cutscenes: false });
    return { before, after: { phase: game.state.phaseIndex, running: game.state.running }, progressUntouched: localStorage.getItem(key) === value };
  }, { key: progressKey, value: progressSeed });
  Check("Even explicit AdvanceLevel leaves campaign progress and range state unchanged", evidence.explicitAdvance.progressUntouched && evidence.explicitAdvance.before.phase === evidence.explicitAdvance.after.phase && evidence.explicitAdvance.before.running === evidence.explicitAdvance.after.running, evidence.explicitAdvance);
  if (process.argv.includes("--shot")) {
    mkdirSync(shotDir, { recursive: true });
    evidence.screenshots = [];
    for (const view of WEAPON_RANGE_VIEWS) {
      const camera = await page.evaluate((spec) => {
        const game = window.Taierzhuang;
        game.Debug.Mouse(2, false); game.StepFrames(120, 1 / 60, false);
        game.player.Spawn(spec.x, spec.z, 0);
        game.post.hasTaaHistory = false;
        // An elevated inspection viewpoint is a screenshot fixture, not flight.
        // Replant it before each rendered frame, so gravity cannot alter the view
        // while the temporal buffers converge. The data owns every coordinate.
        for (let frame = 0; frame < 36; frame += 1) {
          const y = spec.y - game.player.eyeHeight;
          game.player.position.set(spec.x, y, spec.z);
          game.player.body.Teleport(spec.x, y, spec.z);
          game.player.velocity.set(0, 0, 0);
          const dx = spec.lookX - spec.x, dz = spec.lookZ - spec.z;
          game.player.yaw = Math.atan2(-dx, -dz);
          game.player.pitch = Math.atan2(spec.lookY - spec.y, Math.hypot(dx, dz));
          game.player.aimYaw = 0; game.player.aimPitch = 0;
          game.StepFrames(1);
        }
        return { id: spec.id, position: game.camera.position.toArray(), pitch: game.camera.rotation.x, yaw: game.camera.rotation.y };
      }, view);
      evidence.screenshots.push(camera);
      await page.screenshot({ path: path.join(shotDir, `Scene_${view.id}.png`) });
    }
    for (const weapon of firearms) {
      const ads = await page.evaluate((id) => {
        const game = window.Taierzhuang, debug = game.Debug, range = debug.WeaponRange;
        debug.Mouse(2, false); game.StepFrames(120, 1 / 60, false);
        range.GoTo("table", id); game.StepFrames(12); debug.Key("KeyF"); game.StepFrames(120, 1 / 60, false);
        range.GoTo("firing"); debug.Mouse(2, true); game.StepFrames(420, 1 / 60, false);
        const target = range.Targets().filter((entry) => !entry.moving).sort((a, b) => a.distance - b.distance)[0];
        range.AimAt(target.id); game.StepFrames(120, 1 / 60, false);
        game.post.hasTaaHistory = false; game.StepFrames(24);
        return { id, playerAds: game.player.ads, springAds: game.viewmodel.adsSpring.value, camera: game.camera.position.toArray(), fov: game.camera.fov };
      }, weapon.id);
      evidence.screenshots.push(ads);
      Check(`${weapon.id}: screenshot ADS pose has converged`, ads.playerAds > 0.99 && ads.springAds > 0.99, ads);
      await page.screenshot({ path: path.join(shotDir, `Scene_Ads_${weapon.id}.png`) });
    }
    await page.evaluate(() => {
      const game = window.Taierzhuang, range = game.Debug.WeaponRange;
      game.Debug.Mouse(2, false); game.StepFrames(120, 1 / 60, false); range.GoTo("table", "ZhongZheng"); game.StepFrames(12); game.Debug.Key("KeyF"); game.StepFrames(120, 1 / 60, false);
      range.GoTo("firing"); game.Debug.Mouse(2, true); game.StepFrames(420, 1 / 60, false);
      const target = range.Targets().filter((entry) => !entry.moving).sort((a, b) => b.distance - a.distance)[0]; range.AimAt(target.id); game.StepFrames(120, 1 / 60, false);
      game.post.hasTaaHistory = false; game.StepFrames(24);
    });
    await page.screenshot({ path: path.join(shotDir, "Scene_FarTarget.png") });
  }
  Check("Main campaign progress remains unchanged", await page.evaluate(({ key, value }) => localStorage.getItem(key) === value, { key: progressKey, value: progressSeed }));
  if (!smoke) {
  // A real, manually stepped player page keeps menu and boot behavior enabled.
  // Exit navigation is captured before loading another full battlefield.
  const menuPage = await page.context().newPage();
  menuPage.on("pageerror", (error) => errors.push(String(error.stack || error)));
  await menuPage.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/?weapons=1&manual=1&quality=medium&scale=small`, { waitUntil: "load", timeout: 120000 });
  await menuPage.waitForFunction(() => window.Taierzhuang?.state?.ready, null, { timeout: 180000 });
  await menuPage.click("#bootStart");
  await menuPage.evaluate(() => window.Taierzhuang.StepFrames(30));
  const panelBefore = await menuPage.evaluate(() => ({ moving: window.Taierzhuang.Debug.WeaponRange.State().moving, shots: window.Taierzhuang.state.playerShots }));
  await menuPage.keyboard.down("Alt");
  await menuPage.locator("#weaponRangeMotion").click({ modifiers: ["Alt"] });
  const panelAfter = await menuPage.evaluate(() => ({ moving: window.Taierzhuang.Debug.WeaponRange.State().moving, shots: window.Taierzhuang.state.playerShots, pointer: window.Taierzhuang.Debug.PointerLock() }));
  await menuPage.keyboard.up("Alt");
  Check("Holding Alt lets the player click the real panel without firing", panelBefore.moving !== panelAfter.moving && panelBefore.shots === panelAfter.shots && panelAfter.pointer.mouseFree === true, { before: panelBefore, after: panelAfter });
  await menuPage.keyboard.press("Escape");
  await menuPage.waitForSelector('#menu .mnItem[data-act="exitSandbox"]', { state: "visible" });
  evidence.menu = await menuPage.evaluate(() => ({
    exitLabel: document.querySelector('#menu .mnItem[data-act="exitSandbox"]').textContent,
    actions: Array.from(document.querySelectorAll("#menu .mnItem")).map((element) => element.dataset.act),
  }));
  // Sandbox pause offers an exit, while MenuTest covers the five title-menu scene entries.
  Check("Sandbox pause names its exit correctly without unusable chapter links", /枪械/.test(evidence.menu.exitLabel) && evidence.menu.actions.includes("exitSandbox") && !evidence.menu.actions.includes("levels") && !evidence.menu.actions.includes("title"), evidence.menu);
  let exitUrl = null;
  await menuPage.route("**/*", async (route) => {
    if (route.request().isNavigationRequest()) { exitUrl = route.request().url(); await route.abort(); }
    else await route.continue();
  });
  await menuPage.locator('#menu .mnItem[data-act="exitSandbox"]').click({ noWaitAfter: true });
  for (let attempt = 0; attempt < 20 && !exitUrl; attempt += 1) await menuPage.waitForTimeout(50);
  Check("Exit requests a clean main-menu URL", !!exitUrl && !new URL(exitUrl).searchParams.has("weapons") && !new URL(exitUrl).searchParams.has("range") && !new URL(exitUrl).searchParams.has("melee"), exitUrl);
  Check("Menu entry and exit preserve campaign progress", await page.evaluate(({ key, value }) => localStorage.getItem(key) === value, { key: progressKey, value: progressSeed }));
  await menuPage.close();
  }
  Check("No browser errors", errors.length === 0, errors);
} catch (error) {
  Check("Acceptance script completed", false, String(error?.stack || error));
} finally {
  mkdirSync(shotDir, { recursive: true });
  writeFileSync(path.join(shotDir, "Data_Acceptance.json"), JSON.stringify({ checks, evidence, errors }, null, 2));
  if (browser) await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
process.exitCode = checks.every((entry) => entry.ok) ? 0 : 1;
