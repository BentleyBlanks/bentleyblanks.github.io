// Real shots, shared-light contention, bounded decay and GPU gun-surface response.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "Taierzhuang1938/_shots/MuzzleFlash");
fs.mkdirSync(out, { recursive: true });
const server = await ServeRoot(root, 0), browser = await LaunchBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [], results = [];
page.on("pageerror", e => errors.push(String(e)));
page.on("console", m => { if (m.type() === "error") errors.push(m.text().slice(0, 300)); });
try {
  for (const quality of ["high", "low"]) {
    const base = process.env.MUZZLE_PREVIEW_URL || `http://127.0.0.1:${server.address().port}`;
    await page.goto(`${base}/Taierzhuang1938/?shot=1&weapons=1&manual=1&quality=${quality}&scale=small`, { waitUntil: "load", timeout: 120000 });
    await page.waitForFunction(() => window.Taierzhuang?.state?.ready, null, { timeout: 240000 });
    await page.waitForFunction(() => window.Taierzhuang.viewmodel.materials.flash.map.image?.width > 0);
    for (const id of ["HanYang", "Type38"]) {
      for (const ads of [false, true]) {
        const key = `${quality}_${id}_${ads ? "Ads" : "Hip"}`;
        await page.evaluate(({ id, ads }) => {
          const T = window.Taierzhuang, range = T.Debug.WeaponRange;
          const Step = n => T.StepFrames(n, 1 / 60, false);
          T.Debug.Mouse(0, false); T.Debug.Mouse(2, false);
          range.GoTo("table", id); Step(120); T.StepFrames(2);
          if (T.Debug.Slots().weapon !== id && !range.Pickup(id)) throw new Error(`Pickup rejected: ${id}`);
          Step(150);
          range.GoTo("firing"); range.SetAmmoMode("infinite");
          T.Debug.Mouse(2, ads); Step(120);
          if (T.Debug.Slots().weapon !== id) throw new Error(`Pickup failed: ${id}`);
          T.StepFrames(3);
        }, { id, ads });
        const shot = await page.evaluate(() => {
          const T = window.Taierzhuang, before = T.state.playerShots;
          T.Debug.Fire();
          const pos = T.lights.muzzle.position.clone();
          T.vfx.MuzzleFlash(pos.clone().addScalar(10), T.player.AimDirection());
          const protectedPosition = T.lights.muzzle.position.distanceTo(pos);
          T.StepFrames(1, 1 / 240);
          return { fired: T.state.playerShots - before, protectedPosition,
            visible: T.viewmodel.flash.visible, intensity: T.lights.muzzle.intensity };
        });
        assert.equal(shot.fired, 1, `${key}: real shot`);
        assert.equal(shot.protectedPosition, 0, `${key}: NPC cannot steal active player light`);
        assert(shot.visible && shot.intensity > 0, `${key}: flame and light present`);
        await page.screenshot({ path: path.join(out, `${key}_Fire.png`) });
        // Freeze the real pose; hide effects/world/arms and compare the actual gun
        // PBR materials with just the muzzle light toggled. No emissive flame pixels
        // can contribute to this measurement. Exercise low and clustered paths.
        const response = await page.evaluate(async () => {
          const T = window.Taierzhuang, vm = T.viewmodel, L = T.lights;
          const THREE = await import("three");
          const hidden = [], materials = [];
          const Hide = o => { hidden.push([o, o.visible]); o.visible = false; };
          for (const child of T.scene.children) if (child !== T.camera && !child.isLight) Hide(child);
          const gunMeshes = new Set();
          vm.rig.group.traverse(o => { if (o.isMesh && o !== vm.flash.children[0]) gunMeshes.add(o); });
          T.camera.traverse(o => { if (o.isMesh && !gunMeshes.has(o)) Hide(o); });
          const originalBackground = T.scene.background;
          T.scene.background = new THREE.Color(0);
          const target = new THREE.WebGLRenderTarget(1280, 720);
          const originalTarget = T.renderer.getRenderTarget(), intensity = L.muzzle.intensity;
          const pixels = () => {
            L.UpdateClusters(T.camera, 1280, 720);
            T.renderer.setRenderTarget(target); T.renderer.render(T.scene, T.camera);
            const data = new Uint8Array(1280 * 720 * 4);
            T.renderer.readRenderTargetPixels(target, 0, 0, 1280, 720, data);
            return data;
          };
          try {
            L.muzzle.intensity = 0; L._FeedClusters([]); const dark = pixels();
            L.muzzle.intensity = intensity; L._FeedClusters([]); const lit = pixels();
            vm.flash.children[0].visible = true;
            const flame = pixels(); vm.flash.children[0].visible = false;
            let changed = 0, gain = 0, pbr = 0, flamePixels = 0;
            for (const mesh of gunMeshes) {
              const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
              if (list.every(m => m.isMeshStandardMaterial)) pbr++;
              materials.push([mesh, mesh.material]);
              mesh.material = new THREE.MeshBasicMaterial({ color: 0xffffff });
            }
            const mask = pixels();
            for (let i = 0; i < lit.length; i += 4) {
              if (mask[i] < 200) {
                if (flame[i] + flame[i + 1] + flame[i + 2] - lit[i] - lit[i + 1] - lit[i + 2] > 15) flamePixels++;
                continue;
              }
              const delta = (lit[i] - dark[i]) + (lit[i + 1] - dark[i + 1]) + (lit[i + 2] - dark[i + 2]);
              if (delta > 12) { changed++; gain += delta / 3; }
            }
            return { changed, averageGain: gain / Math.max(changed, 1), pbr, flamePixels };
          } finally {
            for (const [mesh, material] of materials) { mesh.material.dispose(); mesh.material = material; }
            for (const [o, visible] of hidden) o.visible = visible;
            T.scene.background = originalBackground;
            L.muzzle.intensity = intensity; L._FeedClusters([]);
            T.renderer.setRenderTarget(originalTarget); target.dispose();
          }
        });
        assert(response.pbr > 0 && response.changed > 40, `${key}: gun must receive real light: ${JSON.stringify(response)}`);
        assert(response.flamePixels > 10, `${key}: flame must be visible beyond the gun silhouette: ${JSON.stringify(response)}`);
        const ended = await page.evaluate(() => {
          const T = window.Taierzhuang;
          T.StepFrames(8, 1 / 60);
          return { flame: T.viewmodel.flash.visible, intensity: T.lights.muzzle.intensity };
        });
        assert.equal(ended.flame, false, `${key}: flame expires`);
        assert.equal(ended.intensity, 0, `${key}: light expires`);
        await page.screenshot({ path: path.join(out, `${key}_After.png`) });
        results.push({ key, shot, response, ended });
        console.log(`PASS ${key}: ${response.changed} gun pixels lit, mean gain ${response.averageGain.toFixed(1)}/255`);
      }
    }
  }
  assert.deepEqual(errors, [], "Browser errors");
  fs.writeFileSync(path.join(out, "Data_MuzzleFlashReport.json"), JSON.stringify(results, null, 2));
} finally { await browser.close(); server.close(); }
