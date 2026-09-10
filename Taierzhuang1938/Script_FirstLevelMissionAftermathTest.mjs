// Actual civilian bakes, spatial clearance, instance LOD and local visual evidence.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";
const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, "_shots/FirstLevelCivilianAftermath");
await fs.mkdir(out, { recursive: true });
const server = await ServeRoot(path.resolve(here, ".."), 0), browser = await LaunchBrowser();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } }), errors = [];
page.on("pageerror", e => errors.push(String(e)));
try {
  const base = process.env.MISSION_REVIEW_URL || `http://127.0.0.1:${server.address().port}`;
  await page.goto(`${base}/Taierzhuang1938/?whitebox=p012&shot=1&manual=1&quality=high&scale=small`, { timeout: 180000 });
  await page.waitForFunction(() => window.Tengxian?.state.ready, null, { timeout: 240000 });
  const report = await page.evaluate(async () => {
    const g = window.Tengxian, aftermath = g.Debug.FirstLevelMissionRuntime().view.aftermath;
    const { MISSION_CIVILIAN_AFTERMATH: bodies } = await import("./Data_FirstLevelMissionCivilianAftermath.mjs");
    const { Box3, Vector3 } = await import("three");
    const prototypes = [...aftermath.prototypes.values()].filter(p => p.key.startsWith("civilian"));
    const geometry = prototypes.map(p => {
      const bounds = new Box3();
      for (const part of p.parts) { part.tiers[0].computeBoundingBox(); bounds.union(part.tiers[0].boundingBox); }
      return { key: p.key, size: bounds.getSize(new Vector3()).toArray(), minY: bounds.min.y,
        triangles: p.parts.map(part => part.triangles).reduce((sum, a) => a.map((n, i) => n + sum[i]), [0, 0, 0]),
        members: p.members.length };
    });
    const clearance = [], grounding = [];
    for (const spec of bodies) {
      const instance = aftermath.instances.find(p => p.id === spec.id), vertices = [];
      for (const part of instance.prototype.parts) {
        const pos = part.tiers[0].attributes.position;
        for (let i = 0; i < pos.count; i++) {
          const p = new Vector3().fromBufferAttribute(pos, i).applyMatrix4(instance.matrix);
          vertices.push(p);
          const ground = g.battlefield.GroundHeight(p.x, p.z);
          if (p.y < ground - .1) grounding.push({ id: spec.id, penetration: ground - p.y });
        }
      }
      // Use the actual loaded collider OBBs, including props absent from layout.blocks.
      for (const p of vertices) for (const c of g.battlefield.colliders) {
        if (p.y < c.c[1] - c.h[1] || p.y > c.c[1] + c.h[1]) continue;
        const dx = p.x - c.c[0], dz = p.z - c.c[2], cos = Math.cos(c.ry || 0), sin = Math.sin(c.ry || 0);
        if (Math.abs(dx*cos-dz*sin) < c.h[0] && Math.abs(dx*sin+dz*cos) < c.h[2]) { clearance.push(spec.id); break; }
      }
    }
    return { count: bodies.length, actual: aftermath.instances.filter(p => p.side === "civilian").length,
      geometry, clearance: [...new Set(clearance)], grounding: grounding.slice(0, 12),
      civilianActors: g.ai.soldiers.filter(s => s.missionId?.startsWith("CivilianAftermath")).length };
  });
  await fs.writeFile(path.join(out, "Data_Verification.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
  for (const shot of [
    { id: "KitchenApproach", x: 59, z: -24, yaw: -.3, pitch: -.25 },
    { id: "KitchenWall", x: 48, z: -15, yaw: -2.5, pitch: -.32 },
    { id: "VillageCourtyard", x: 55, z: 27, yaw: .2, pitch: -.24 },
    { id: "VillageRear", x: 31, z: 77, yaw: -.4, pitch: -.2 },
    { id: "RearCourtyard", x: -88, z: 75, yaw: .55, pitch: -.22 },
    { id: "NorthFarm", x: -43, z: -172, yaw: .35, pitch: -.22 },
  ]) {
    await page.evaluate(shot => {
      const g = window.Tengxian;
      g.player.Spawn(shot.x, shot.z, shot.yaw); g.player.pitch = shot.pitch;
      g.StepFrames(8, 0, true);
    }, shot);
    await page.screenshot({ path: path.join(out, "Scene_" + shot.id + ".png") });
  }
  assert.equal(report.actual, report.count);
  assert.equal(report.geometry.length, 4, "both adult models keep separate pose prototypes");
  assert.ok(report.geometry.every(p => p.size[2] > 1.3 && p.size[1] < .36 && p.minY >= -.001), "real adult models settle flat without frozen falling limbs");
  assert.ok(report.geometry.every(p => p.triangles[2] < p.triangles[0] * .6), "distant civilian LOD reduces geometry");
  assert.deepEqual(report.clearance, [], "actual bodies must not intersect house walls or props");
  assert.deepEqual(report.grounding, [], "actual bodies must not sink into the terrain");
  assert.equal(report.civilianActors, 0, "environment casualties never join live combat or AI counts");
  const lifecycle = await page.evaluate(async () => {
    const g = window.Tengxian, old = g.Debug.FirstLevelMissionRuntime().view.aftermath;
    let disposed = 0;
    for (const p of old.prototypes.values()) for (const part of p.parts) part.tiers[0].addEventListener("dispose", () => disposed++);
    await g.Debug.FirstLevelJump(7);
    const next = g.Debug.FirstLevelMissionRuntime().view.aftermath;
    g.StepFrames(2, 0, true);
    return { oldDetached: !old.root.parent, disposed, count: next.instances.filter(p => p.side === "civilian").length };
  });
  assert.ok(lifecycle.oldDetached && lifecycle.disposed > 0 && lifecycle.count === report.count, "restart disposes old bakes and retains the same civilian placement");
  assert.deepEqual(errors, []);
  console.log("PASS civilian models, loaded collider clearance, grounding, LOD and restart; six local screenshots");
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
