// Render the real repeated-blast path, then isolate the persistent decal layer.
// A physical crater must look identical without that layer; a bullet impact must
// still visibly use it. This catches horizontal scorch slices through pit walls.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, "_shots", "CraterSurface");
fs.mkdirSync(out, { recursive: true });
const server = await ServeRoot(path.resolve(here, ".."), 0), browser = await LaunchBrowser();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
try {
  await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/?explosions=1&shot=1&manual=1&quality=medium&scale=small`, { timeout: 120000 });
  await page.waitForFunction(() => window.Taierzhuang?.state.ready, null, { timeout: 180000 });
  const terrain = await page.evaluate(() => {
    const t = window.Taierzhuang, field = t.combat.host.battlefield;
    t.StepFrames(180); t.Debug.Explosions.Reset();
    for (const [x, z, count] of [[2595, 2576, 12], [2605, 2576, 4]]) {
      for (let i = 0; i < count; i++) {
        t.combat.Blast(t.player.position.clone().set(x, field.GroundHeight(x, z), z), 6, 0, "shell");
      }
    }
    // Let all fire/dust/shockwaves expire. Only permanent surface detail remains.
    t.StepFrames(600);
    t.graphics.ssao = 0; t.StepFrames(1, 0);
    return { left: field.GroundHeight(2595, 2576), right: field.GroundHeight(2605, 2576), state: field.deformation.State() };
  });
  assert.ok(terrain.left < -2.3 && terrain.right < -2, "real repeated shells create deep physical pits");

  async function CompareDecals(eye, target, label) {
    const difference = await page.evaluate(({ eye, target }) => {
      const t = window.Taierzhuang, decal = t.vfx.pools.decal.mesh;
      t.camera.position.set(...eye); t.camera.lookAt(...target); t.camera.updateMatrixWorld(true);
      // Freeze postprocess time and AO sampling. Compare the HDR scene itself,
      // before grain/TAA/UI, so only the switched decal layer can change pixels.
      const frame = t.post.frame, hdr = t.post.targets.hdr;
      const Render = (visible) => {
        decal.visible = visible; t.post.frame = frame;
        t.post.Render(t.scene, t.camera, { taa: false, motionBlur: 0, grain: 0 });
        const pixels = new Uint16Array(hdr.width * hdr.height * 4);
        t.renderer.readRenderTargetPixels(hdr, 0, 0, hdr.width, hdr.height, pixels);
        return pixels;
      };
      Render(true); const before = Render(true), after = Render(false);
      let changedPixels = 0;
      for (let i = 0; i < before.length; i += 4) {
        if (before[i] !== after[i] || before[i + 1] !== after[i + 1] || before[i + 2] !== after[i + 2]) changedPixels++;
      }
      Render(true);
      return { changedPixels, totalPixels: hdr.width * hdr.height };
    }, { eye, target });
    await page.screenshot({ path: path.join(out, `Scene_${label}.png`) });
    return difference;
  }

  const crater = await CompareDecals([2600, 5.5, 2583], [2600, -0.5, 2576], "RepeatedShells");
  await page.evaluate(() => {
    const t = window.Taierzhuang;
    const at = t.player.position.clone().set(2600, 0, 2586), up = at.clone().set(0, 1, 0);
    t.vfx.Impact(at, up, "dirt"); t.StepFrames(180);
  });
  const bullet = await CompareDecals([2600, 1.4, 2587.5], [2600, 0, 2586], "BulletImpact");
  const report = { terrain, crater, bullet, errors };
  fs.writeFileSync(path.join(out, "Data_Acceptance.json"), JSON.stringify(report, null, 2));
  assert.deepEqual(errors, [], "no browser/GLSL errors");
  assert.ok(crater.changedPixels <= 4, `persistent flat decals must not cut rings through crater walls: ${JSON.stringify(crater)}`);
  assert.ok(bullet.changedPixels > 20, `ordinary bullet marks remain visible: ${JSON.stringify(bullet)}`);
  console.log(`PASS CraterSurfaceTest: repeated shells ${crater.changedPixels} decal pixels; bullet impact ${bullet.changedPixels} visible pixels`);
} finally { await browser.close(); await new Promise((resolve) => server.close(resolve)); }
