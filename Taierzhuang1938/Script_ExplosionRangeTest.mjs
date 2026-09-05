// Real scene/input/physics acceptance. Uses the repository browser kit and writes
// repeatable screenshots for the required visual review, never native pointer lock.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";
import { EXPLOSION_GRENADES, EXPLOSION_VEHICLES, EXPLOSION_BARRAGE, EXPLOSION_AIRSTRIKE } from "./Data_ExplosionRange.mjs";
const here = path.dirname(fileURLToPath(import.meta.url)), out = path.join(here, "_shots", "ExplosionRange");
fs.mkdirSync(out, { recursive: true });
const server = await ServeRoot(path.resolve(here, ".."), 0), browser = await LaunchBrowser();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [], result = {};
page.on("pageerror", (e) => { errors.push(String(e)); console.log("PAGE ERROR", String(e)); });
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
try {
  await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/?explosions=1&shot=1&manual=1&quality=medium&scale=small`, { timeout: 120000 });
  await page.waitForFunction(() => window.Taierzhuang?.state.ready, null, { timeout: 180000 });
  console.log("SCENE ready");
  result.boot = await page.evaluate(() => {
    const t = window.Taierzhuang; t.StepFrames(250);
    return { level: t.Debug.Level().id, pinned: t.state.pinned, snapshot: t.Debug.Explosions.State(),
      models: t.scene.children.filter((c) => c.name.startsWith("ExplosionVehicle_")).map((m) => ({ name: m.name, x: m.position.x, z: m.position.z })),
      ground: t.scene.children.filter((c) => c.userData.deformableTerrain).length };
  });
  assert.equal(result.boot.level, "ExplosionRange"); assert.equal(result.boot.models.length, EXPLOSION_VEHICLES.length);
  assert.ok(result.boot.pinned && result.boot.ground > 0);
  assert.equal(await page.evaluate(() => window.Taierzhuang.scene.children.filter((m) =>
    m.material?.isMeshBasicMaterial && /^Static_ExplosionStations/.test(m.name) && m.castShadow).length), 0,
  "instruction boards do not cast bands over crater inspection surfaces");
  assert.deepEqual(result.boot.snapshot.visibleAircraft, [], "no uncalled aircraft in the test scene");
  await page.screenshot({ path: path.join(out, "Scene_Overview.png") });
  result.pickups = [];
  for (const grenade of EXPLOSION_GRENADES) {
    const sample = await page.evaluate((id) => {
      const t = window.Taierzhuang; t.Debug.Explosions.GoTo(id); t.StepFrames(4);
      const before = { grenades: t.state.grenades, bundles: t.state.bundles }, prompt = t.interact.Query(t.player)?.label;
      t.Debug.Key("KeyF"); t.StepFrames(30);
      return { before, after: { grenades: t.state.grenades, bundles: t.state.bundles }, prompt, pickups: t.Debug.Explosions.State().pickups };
    }, grenade.id);
    const field = grenade.id === "GrenadeBundle" ? "bundles" : "grenades";
    assert.equal(sample.after[field], sample.before[field] + 1, `${grenade.id}: F grants real inventory`);
    result.pickups.push(sample);
  }
  await page.screenshot({ path: path.join(out, "Scene_GrenadeTable.png") });
  console.log("PASS tabletop inventory");
  result.throws = [];
  for (const [id, key] of [["Grenade", "KeyG"], ["GrenadeBundle", "KeyH"]]) {
    const sample = await page.evaluate(({ id, key }) => {
      const t = window.Taierzhuang, field = t.combat.host.battlefield;
      t.Debug.Explosions.Reset(); t.player.Spawn(2600, 2590, 0); t.player.pitch = 0;
      const before = id === "Grenade" ? t.state.grenades : t.state.bundles;
      t.Debug.Key(key, true); t.StepFrames(30); t.Debug.Key(key, false); t.StepFrames(1);
      const launched = t.combat.projectiles.some((p) => p.kind === id);
      t.StepFrames(285);
      return { before, after: id === "Grenade" ? t.state.grenades : t.state.bundles, launched, terrain: field.deformation.State() };
    }, { id, key });
    assert.ok(sample.launched && sample.terrain.lastImpact?.id === id, `${id}: real throw detonates into soil`);
    assert.equal(sample.after, sample.before - 1);
    result.throws.push(sample);
  }
  assert.ok(result.throws[1].terrain.lastImpact.depth > result.throws[0].terrain.lastImpact.depth);
  console.log("PASS G/H throws / differentiated physical craters");
  result.vehicles = [];
  for (const vehicle of EXPLOSION_VEHICLES) {
    const sample = await page.evaluate((id) => {
      const t = window.Taierzhuang; t.Debug.Explosions.GoTo(id); t.StepFrames(10);
      const prompt = t.interact.Query(t.player)?.label;
      t.Debug.Key("KeyF"); t.StepFrames(12);
      const flight = t.Debug.Explosions.State(); t.StepFrames(70);
      return { prompt, flight, after: t.Debug.Explosions.State() };
    }, vehicle.id);
    assert.equal(sample.after.shots[vehicle.id], 1, `${vehicle.id}: one press / one shell`);
    assert.ok(sample.flight.shells.some((s) => s.kind === vehicle.explosive), "shell really flies");
    assert.ok(sample.after.terrain.impacts > 0, "shell actually excavates ground");
    result.vehicles.push(sample);
  }
  console.log("PASS vehicle shells / impact");
  result.shellVisual = await page.evaluate(() => {
    const t = window.Taierzhuang; t.Debug.Explosions.Reset();
    const from = t.player.position.clone().set(2600, 2, 2608), target = from.clone().set(2600, 0, 2578);
    const shell = t.combat.FireShell(from, target, { flight: 0.85, radius: 0.1, damage: 0 });
    const initial = shell.visual.core.quaternion.clone();
    t.combat.StepShells(0.35);
    const positions = shell.visual.trail.geometry.attributes.position;
    const head = Array.from(positions.array.slice(0, 3)), tail = Array.from(positions.array.slice(-3));
    const trace = [];
    const span = shell.visual.span;
    for (let i = 0; i < positions.count; i += 2) {
      const time = shell.age - span * i / (positions.count - 2);
      const expected = from.clone().addScaledVector(shell.initialVelocity, time);
      expected.y -= 19.6 * time * time * 0.5;
      trace.push(Math.hypot(positions.getX(i) - expected.x, positions.getY(i) - expected.y, positions.getZ(i) - expected.z));
    }
    t.player.Spawn(2604, 2600, 0);
    const delta = shell.position.clone().sub(t.player.position).add({x:0, y:-1.6, z:0});
    t.player.yaw = Math.atan2(-delta.x, -delta.z); t.player.pitch = Math.atan2(delta.y, Math.hypot(delta.x, delta.z));
    t.StepFrames(24, 0);
    return { head, tail, position: shell.position.toArray(), trace,
      length: Math.hypot(...head.map((v,i) => v - tail[i])),
      skipDepth: shell.visual.core.userData.skipNormalDepth && shell.visual.trail.userData.skipNormalDepth,
      initialAligned: Math.abs(initial.w) < 1 && shell.visual.core.scale.x < 0.1 };
  });
  assert.ok(result.shellVisual.trace.every((error) => error < 0.0005), "ribbon follows actual past ballistic positions");
  // 0.35 s at ~36 m/s: the ribbon must show the whole flight so far, not a 5 m stub.
  assert.ok(result.shellVisual.length > 10 && result.shellVisual.length < 14 && result.shellVisual.skipDepth, "trail length " + result.shellVisual.length);
  await page.screenshot({ path: path.join(out, "Scene_ShellTrail.png") });
  result.wallImpact = await page.evaluate(() => {
    const t = window.Taierzhuang; t.Debug.Explosions.Reset();
    const from = t.player.position.clone().set(2648, 1.2, 2600), target = from.clone().set(2660, 1.2, 2600);
    let impact = null, count = 0;
    const shell = t.combat.FireShell(from, target, { flight: 0.3, radius: 0.1, damage: 0,
      OnImpact: (p) => { impact = p.toArray(); count++; } });
    t.combat.StepShells(0.3);
    const fading = t.combat.shellVisuals.fading.length;
    t.combat.StepShells(0.2);
    return { impact, count, position: shell.position.toArray(), age: shell.age, fading,
      remaining: t.scene.children.filter((m) => /^ShellVisual_/.test(m.name)).length };
  });
  assert.ok(result.wallImpact.impact && Math.abs(result.wallImpact.impact[0] - 2654) < 0.05, "actual boundary wall intercepts shell");
  assert.deepEqual(result.wallImpact.position, result.wallImpact.impact, "visual head stops at swept impact instead of jumping through wall");
  assert.ok(result.wallImpact.age < 0.3 && result.wallImpact.count === 1 && result.wallImpact.fading === 1 && result.wallImpact.remaining === 0);
  result.airMiss = await page.evaluate(() => {
    const t = window.Taierzhuang; t.Debug.Explosions.Reset(); let impacts = 0;
    const from = t.player.position.clone().set(2600, 100, 2600);
    t.combat.FireShell(from, from.clone().setY(150), { flight: 0.1, radius: 0.1, damage: 0, OnImpact: () => impacts++ });
    t.combat.StepShells(3.2); t.combat.StepShells(0.2);
    return { impacts, active: t.combat.shells.length, terrain: t.Debug.Explosions.State().terrain.impacts };
  });
  assert.deepEqual(result.airMiss, { impacts: 0, active: 0, terrain: 0 }, "timeout never creates a disconnected ground explosion");
  console.log("PASS curved shell trail / swept wall impact / fading cleanup / airborne timeout");
  result.return = await page.evaluate(() => {
    const t = window.Taierzhuang; t.Debug.Explosions.GoTo("return"); t.StepFrames(10);
    t.Debug.Key("KeyF"); t.StepFrames(83);
    const p = t.combat.ReturnCandidate();
    if (!p) return { candidate: false, grenades: t.combat.projectiles.map((g) => ({ at: g.position.toArray(), fuse: g.fuse })), player: t.player.position.toArray() };
    const before = { fuse: p.fuse, inventory: t.state.grenades };
    t.Debug.Key("KeyF"); const claimed = p.returning; t.StepFrames(30);
    const after = { fuse: p.fuse, inventory: t.state.grenades, returned: p.returned, owner: p.owner, attached: !!p.body };
    t.StepFrames(210);
    return { candidate: true, claimed, before, after, expired: !t.combat.projectiles.includes(p), count: t.combat.returnCount };
  });
  assert.ok(result.return.candidate, JSON.stringify(result.return));
  assert.ok(result.return.claimed && result.return.after.returned && result.return.after.attached && result.return.expired);
  assert.equal(result.return.after.inventory, result.return.before.inventory, "return does not mint inventory");
  assert.ok(result.return.after.fuse < result.return.before.fuse - 0.45, "return never resets the live fuse");
  console.log("PASS real F grenade return / continuing fuse");
  await page.evaluate(() => {
    const t = window.Taierzhuang; t.Debug.Explosions.GoTo("barrage"); t.StepFrames(5); t.Debug.Key("KeyF");
    t.player.Spawn(2603, 2690, 0); t.player.pitch = 0.5; t.StepFrames(88);
  });
  await page.screenshot({ path: path.join(out, "Scene_IncomingShells.png") });
  result.barrage = await page.evaluate(() => {
    const t = window.Taierzhuang; t.StepFrames(440); return t.Debug.Explosions.State();
  });
  assert.equal(result.barrage.launches.length, EXPLOSION_BARRAGE.count);
  assert.ok(result.barrage.launches.every((s) => Math.hypot(s.center.x - s.target.x, s.center.z - s.target.z) <= EXPLOSION_BARRAGE.radiusM + 1e-6));
  assert.equal(result.barrage.terrain.meshes, result.barrage.terrain.colliderTiles);
  console.log("PASS 16m barrage / visible shells / matching mesh-collider tiles");
  result.airstrike = await page.evaluate(() => {
    const t = window.Taierzhuang; t.Debug.Explosions.GoTo("airstrike"); t.StepFrames(10); t.Debug.Key("KeyF");
    t.player.Spawn(2636, 2690, 0); t.player.pitch = 0.45; t.StepFrames(250);
    return t.Debug.Explosions.State();
  });
  assert.ok(result.airstrike.airstrike && result.airstrike.visibleAircraft.length === 1, "F summons one actual bomber");
  assert.equal(result.airstrike.airDrops.length, EXPLOSION_AIRSTRIKE.count);
  assert.ok(result.airstrike.airDrops.every((d) => d.from[1] > 20 && d.radius <= EXPLOSION_AIRSTRIKE.radiusM));
  await page.screenshot({ path: path.join(out, "Scene_Airstrike.png") });
  result.departure = await page.evaluate(() => {
    const t = window.Taierzhuang; t.StepFrames(720); return t.Debug.Explosions.State();
  });
  assert.equal(result.departure.airstrike, null); assert.deepEqual(result.departure.visibleAircraft, []);
  assert.ok(result.departure.airDrops.every((d) => d.impact), "dropped projectiles actually impact before the bomber leaves");
  console.log("PASS aircraft call-in / random nearby drops / departure / no idle flight");

  result.cancel = await page.evaluate(() => {
    const t = window.Taierzhuang;
    t.Debug.Explosions.GoTo("barrage"); t.StepFrames(10); t.Debug.Key("KeyF"); t.StepFrames(25);
    t.Debug.Explosions.GoTo("airstrike"); t.StepFrames(10); t.Debug.Key("KeyF"); t.StepFrames(25);
    const before = t.Debug.Explosions.State();
    t.Debug.Explosions.GoTo("reset"); t.StepFrames(10); t.Debug.Key("KeyF");
    const immediate = { ...t.Debug.Explosions.State(), visuals: t.scene.children.filter((m) => /^ShellVisual_/.test(m.name)).length,
      particles: Object.values(t.vfx.pools).reduce((sum, pool) => sum + pool.geometry.instanceCount, 0) };
    t.StepFrames(950);
    return { before, immediate, later: t.Debug.Explosions.State() };
  });
  assert.ok(result.cancel.before.barrage && result.cancel.before.airstrike && result.cancel.before.shells.length > 0);
  assert.ok(!result.cancel.immediate.barrage && !result.cancel.immediate.airstrike && !result.cancel.immediate.shells.length);
  assert.equal(result.cancel.immediate.visuals, 0); assert.equal(result.cancel.immediate.particles, 0);
  assert.equal(result.cancel.later.terrain.impacts, 0); assert.deepEqual(result.cancel.later.visibleAircraft, []);
  console.log("PASS F reset cancels active barrage/raid, trails and warning particles with no delayed impacts");

  result.traversal = await page.evaluate(() => {
    const t = window.Taierzhuang, field = t.combat.host.battlefield, physics = t.player.physics;
    t.Debug.Explosions.Reset(); t.player.health = 100; t.player.alive = true;
    const x = 2600, z = 2614, initialNav = t.ai.ctx.nav.revisions;
    for (let i = 0; i < 12; i++) {
      const at = t.player.position.clone().set(x, field.GroundHeight(x, z), z);
      t.combat.Blast(at, 1, 0, "shell");
    }
    const depth = field.BaseGroundHeight(x, z) - field.GroundHeight(x, z);
    physics.Step(1 / 60);
    const ray = physics.Raycast({ x, y: 8, z }, { x: 0, y: -1, z: 0 }, 20, { terrain: true });
    const physicalRay = physics.world.castRayAndGetNormal(physics._ray, 20, true);
    return { depth, rayY: 8 - ray.t, physicalY: physicalRay ? 8 - physicalRay.timeOfImpact : null,
      physicalTerrain: !!physics.recordByHandle.get(physicalRay?.collider.handle)?.terrain,
      height: field.GroundHeight(x, z), navBefore: initialNav, navAfter: t.ai.ctx.nav.revisions };
  });
  assert.ok(result.traversal.depth > 2.3); assert.ok(Math.abs(result.traversal.rayY - result.traversal.height) < 0.05);
  assert.ok(result.traversal.physicalTerrain && Math.abs(result.traversal.physicalY - result.traversal.height) < 0.02, "real Rapier terrain surface matches mesh/height");
  assert.equal(result.traversal.navBefore, result.traversal.navAfter);
  result.npc = await page.evaluate(() => {
    const t = window.Taierzhuang;
    const id = t.Debug.Explosions.State().patrols[0].id;
    const s = t.ai.soldiers.find((soldier) => soldier.id === id);
    s.position.set(2590, 0, 2614); s.body.Teleport(2590, 0, 2614);
    s.goal.set(2610, 0, 2614); s.state = "advance"; s.stance = 0; s.velocityY = 0;
    let minY = 0, maxStuck = 0, pathRequests = 0, maxX = s.position.x, exited = false;
    const nav = t.ai.ctx.nav, steer = nav.Steer;
    nav.Steer = function (...args) { pathRequests++; return steer.apply(this, args); };
    try {
      for (let i = 0; i < 620; i++) {
        t.StepFrames(1); minY = Math.min(minY, s.position.y); maxStuck = Math.max(maxStuck, s.stuckTime); maxX = Math.max(maxX, s.position.x);
        // Stop on the actual far-lip crossing: the patrol can then turn around
        // and re-enter before an arbitrary final frame, depending on prior laps.
        if (minY < -1.8 && s.position.x > 2607 && s.position.y > -0.2) { exited = true; break; }
      }
    } finally { nav.Steer = steer; }
    return { minY, maxStuck, pathRequests, maxX, exited, goal: s.goal.toArray(), final: s.position.toArray(), alive: s.alive, navigation: nav.revisions };
  });
  assert.ok(result.npc.pathRequests > 0 && result.npc.alive, "real NPC navigation and locomotion active");
  assert.ok(result.npc.exited && result.npc.minY < -1.8 && result.npc.final[0] > 2607 && result.npc.final[1] > -0.2,
    `NPC crosses and climbs out of maximum-depth crater: ${JSON.stringify(result.npc)}`);
  result.walk = await page.evaluate(() => {
    const t = window.Taierzhuang, field = t.combat.host.battlefield;
    t.player.Spawn(2600, 2622, 0); t.player.pitch = -0.35;
    let minY = 0, blocked = 0;
    t.Debug.Key("KeyW", true);
    for (let i = 0; i < 400; i++) { t.StepFrames(1); minY = Math.min(minY, t.player.position.y); }
    t.Debug.Key("KeyW", false);
    return { minY, final: t.player.position.toArray(), grounded: t.player.grounded, blocked, terrain: field.deformation.State() };
  });
  assert.ok(result.walk.minY < -1.8, "player physically enters crater");
  assert.ok(result.walk.final[2] < 2608 && result.walk.final[1] > -0.2, "player exits opposite lip without getting stuck");
  console.log("PASS depth cap / player and NPC enter and exit crater / navigation stable");
  await page.evaluate(() => { const t = window.Taierzhuang; t.player.Spawn(2600, 2618, 0); t.player.pitch = -0.5; t.StepFrames(4); });
  await page.screenshot({ path: path.join(out, "Scene_StackedCrater.png") });
  result.rim = await page.evaluate(async () => {
    const t = window.Taierzhuang, field = t.combat.host.battlefield, view = field.deformation;
    const { Raycaster, Vector3 } = await import("three");
    let best = null;
    for (const mesh of view.tileMeshes.values()) {
      const p = mesh.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) if (!best || p.getY(i) > best.y) best = new Vector3(p.getX(i), p.getY(i), p.getZ(i));
    }
    const origin = best.clone().setY(8), down = new Vector3(0, -1, 0);
    t.scene.updateMatrixWorld(true);
    const visual = new Raycaster(origin, down, 0, 20).intersectObjects([...view.tileMeshes.values()], false)[0];
    const hit = t.player.physics.Raycast(origin, down, 20, { terrain: true });
    const height = field.GroundHeight(best.x, best.z);
    return { height, visual: visual?.point.y, physical: 8 - hit.t };
  });
  assert.ok(result.rim.height > 0.08 && Math.abs(result.rim.height - result.rim.visual) < 0.005
    && Math.abs(result.rim.height - result.rim.physical) < 0.005, "raised soil is real in rendering and collision");
  result.restoreBodies = await page.evaluate(() => {
    const t = window.Taierzhuang, field = t.combat.host.battlefield;
    const s = t.ai.soldiers.find((soldier) => soldier.id === t.Debug.Explosions.State().patrols[0].id);
    const y = field.GroundHeight(2600, 2614);
    t.player.position.set(2600, y, 2614); t.player.body.Teleport(2600, y, 2614);
    s.position.set(2600, y, 2614); s.body.Teleport(2600, y, 2614);
    t.Debug.Explosions.Reset();
    return { before: y, player: t.player.position.y, npc: s.position.y };
  });
  assert.ok(result.restoreBodies.before < -2 && result.restoreBodies.player === 0 && result.restoreBodies.npc === 0,
    "reset immediately brings people inside a pit back above restored ground");
  result.reset = await page.evaluate(() => {
    const t = window.Taierzhuang; t.Debug.Explosions.GoTo("reset"); t.StepFrames(10); t.Debug.Key("KeyF"); t.StepFrames(10);
    return t.Debug.Explosions.State();
  });
  assert.equal(result.reset.terrain.meshes, 0); assert.equal(result.reset.terrain.colliderTiles, 0);
  assert.equal(result.reset.shells.length, 0);
  result.common = [];
  for (const query of ["phase=3", "jiehe=1"]) {
    await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/?${query}&shot=1&manual=1&quality=medium&scale=small`, { timeout: 120000 });
    await page.waitForFunction(() => window.Taierzhuang?.state.ready, null, { timeout: 180000 });
    const sample = await page.evaluate(async (query) => {
      const t = window.Taierzhuang, field = t.combat.host.battlefield, view = field.deformation;
      const { Raycaster, Vector3 } = await import("three");
      for (const soldier of [...t.ai.soldiers]) t.ai.Remove(soldier);
      const bounds = field.bounds, candidates = [];
      // Test the real road ribbon in a normal chapter, then real DEM terrain.
      if (query === "phase=3") for (const source of view.overlaySources.filter((m) => /DirtRoad/.test(m.name))) {
        const pos = source.geometry.attributes.position, index = source.geometry.index;
        for (let i = 0; i < (index?.count || pos.count); i += 3) {
          const points = [0, 1, 2].map((j) => new Vector3().fromBufferAttribute(pos, index ? index.getX(i + j) : i + j).applyMatrix4(source.matrixWorld));
          const point = points[0].clone().add(points[1]).add(points[2]).divideScalar(3);
          if (Math.abs(point.y - field.BaseGroundHeight(point.x, point.z)) < 0.2) candidates.push(point);
        }
      } else for (let z = bounds.minZ + 16; z < bounds.maxZ - 16; z += 12) for (let x = bounds.minX + 16; x < bounds.maxX - 16; x += 12) {
        if (Math.abs(field.BaseGroundHeight(x + 3, z) - field.BaseGroundHeight(x - 3, z)) > 0.08) candidates.push(new Vector3(x, 0, z));
      }
      const point = candidates.find((p) => p.x > bounds.minX + 10 && p.x < bounds.maxX - 10 && p.z > bounds.minZ + 10 && p.z < bounds.maxZ - 10
        && [[0, 0], [2, 0], [-2, 0], [0, 2], [0, -2]].every(([dx, dz]) => view.CanDeform(p.x + dx, p.z + dz)));
      if (!point) return { query, error: "No suitable soil test point", sources: view.sources.map((m) => m.name), overlays: view.overlaySources.map((m) => m.name) };
      t.player.Spawn(point.x, point.z + 6, 0); t.player.pitch = -0.6; t.StepFrames(60);
      const timings = [];
      for (let i = 0; i < 3; i++) {
        point.y = field.GroundHeight(point.x, point.z);
        const start = performance.now(); t.combat.Blast(point, 0.1, 0, "shell"); timings.push(performance.now() - start);
      }
      const height = field.GroundHeight(point.x, point.z), origin = new Vector3(point.x, height + 10, point.z), down = new Vector3(0, -1, 0);
      const ray = new Raycaster(origin, down, 0, 20), meshes = [...view.sources, ...view.tileMeshes.values(), ...view.overlaySources, ...[...view.overlayTiles.values()].flat()];
      t.scene.updateMatrixWorld(true);
      const visible = ray.intersectObjects(meshes, false)[0], physical = t.player.physics.Raycast(origin, down, 20, { terrain: true });
      t.StepFrames(4);
      return { query, point: point.toArray(), depth: field.BaseGroundHeight(point.x, point.z) - height, height,
        visualHeight: visible?.point.y, visibleMesh: visible?.object.name, physicalHeight: origin.y - physical.t,
        terrain: view.State(), timings };
    }, query);
    result.common.push(sample);
    assert.ok(!sample.error && sample.depth > 0.4, JSON.stringify(sample));
    assert.ok(Math.abs(sample.physicalHeight - sample.height) < 0.04, "common field collision follows crater");
    assert.ok(Math.abs(sample.visualHeight - sample.height) < 0.04, `no old terrain/road floating across the pit: ${JSON.stringify(sample)}`);
    if (query === "phase=3") assert.ok(sample.terrain.overlays > 0, "production road surface retessellates with the crater");
    await page.screenshot({ path: path.join(out, query === "phase=3" ? "Scene_ChapterRoadCrater.png" : "Scene_JieheCrater.png") });
    console.log(`PASS common terrain ${query}: depth=${sample.depth.toFixed(2)}, updateMs=${sample.timings.map((ms) => ms.toFixed(1)).join("/")}`);
  }
  assert.deepEqual(errors, []);
  console.log("PASS ExplosionRangeTest");
} finally {
  fs.writeFileSync(path.join(out, "Data_Acceptance.json"), JSON.stringify({ result, errors }, null, 2));
  await browser.close(); await new Promise((resolve) => server.close(resolve));
}
