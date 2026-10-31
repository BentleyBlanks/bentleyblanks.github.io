// Local high-quality inspection; start Script_LocalPreview.mjs 8098 --no-open first.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
const root = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(root, "_shots/WardProps"); fs.mkdirSync(out, { recursive: true });
const port = Number(process.argv.find(a => a.startsWith("--port="))?.split("=")[1] || 8098);
const only = process.argv.find(a => a.startsWith("--only="))?.slice(7).split(",");
const browser = await LaunchBrowser();
const errors = [], report = { quality: "high", errors, shots: [] };
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on("pageerror", e => errors.push(String(e)));
  page.on("response", r => { if (r.status() >= 400 && /WardProps/.test(r.url())) errors.push(`${r.status()} ${r.url()}`); });
  await page.goto(`http://127.0.0.1:${port}/Taierzhuang1938/?whitebox=p012&quality=high&manual=1&shot=1&missionStage=16`, { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.waitForFunction(() => window.Tengxian?.state?.ready, null, { timeout: 300000 });
  report.assets = await page.evaluate(() => {
    const g = window.Tengxian;
    g.StepFrames(120); g.Debug.OpenEditor("shotCamera");
    const stats = g.battlefield.propDressingStats;
    const materials = new Map();
    g.scene.traverse(o => {
      for (const m of (Array.isArray(o.material) ? o.material : [o.material])) if (m?.name?.startsWith("Ward"))
        materials.set(m.name, { name: m.name, color: m.color.toArray(), map: !!m.map, normal: !!m.normalMap });
    });
    return { placements: stats.placements.filter(p => p.asset.startsWith("ward")), missing: stats.missing, materials: [...materials.values()] };
  });
  assert.equal(report.assets.placements.length, 17);
  assert.deepEqual(report.assets.missing, []);
  assert.ok(report.assets.materials.some(m => m.name === "WardTimber" && m.map && m.normal));
  for (const [id, eye, look] of [
    ["WardOverview", [-26, 1.7, 241.6], [-26, 1.15, 225.7]],
    ["WardCabinet", [-27.3, 1.62, 229.2], [-26, 1.06, 225.6]],
    ["WardShelf", [-20.4, 1.65, 228.0], [-21.9, 1.04, 225.6]],
    ["WardMedicineTable", [-30.4, 1.42, 240.0], [-32.15, 1.00, 238.62]],
    ["WardBasin", [-28.95, 1.32, 239.8], [-29.9, .84, 238.85]],
  ]) {
    if (only && !only.includes(id)) continue;
    const dx = look[0] - eye[0], dz = look[2] - eye[2], dy = look[1] - eye[1];
    const pose = { id, x: eye[0], y: eye[1], z: eye[2], yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(dy, Math.hypot(dx, dz)), fov: 55, phase: null, far: null };
    await page.evaluate(p => {
      const g = window.Tengxian, tool = g.editor.active;
      tool.host.SetViewmodelVisible?.(false); tool.ApplyPose(p);
      document.getElementById("edRoot")?.classList.add("off"); g.StepFrames(30);
    }, pose);
    await page.screenshot({ path: path.join(out, `${id}.png`) });
    report.shots.push({ id, eye, look }); console.log("shot", id);
  }
  assert.deepEqual(errors, []);
  console.log(`WardPropsShots PASS: 17 replacements, authored materials, ${report.shots.length} high-quality scene views`);
} finally {
  fs.writeFileSync(path.join(out, "Data_Review.json"), JSON.stringify(report, null, 2));
  await browser.close();
}
