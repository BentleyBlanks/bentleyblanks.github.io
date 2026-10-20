// Real shots, shared-light contention, bounded decay and GPU gun-surface response.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";
import { WEAPONS } from "./Data_Weapons.mjs";
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
    for (const id of ["HanYang", "Type38", "Zb26", "Type92Hmg"]) {
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
        if(ads&&["Zb26","Type92Hmg"].includes(id)) {
          const sustained=await page.evaluate(async()=>{
            const T=window.Taierzhuang,THREE=await import("three"),pool=T.vfx.pools.smoke;
            const before=T.state.playerShots;let peakSmoke=0,peakTotalSmoke=0;
            T.Debug.Mouse(0,true);
            for(let i=0;i<240;i++) {
              T.StepFrames(1,1/60,false);
              peakTotalSmoke=Math.max(peakTotalSmoke,pool.system.particles.length);
              peakSmoke=Math.max(peakSmoke,pool.system.particles.filter(p=>p.packed?.firearmSmoke).length);
            }
            T.Debug.Mouse(0,false);T.StepFrames(2,1/60,true);
            const target=new THREE.WebGLRenderTarget(1280,720),previous=T.renderer.getRenderTarget();
            const smokeVisible=pool.mesh.visible;
            const Pixels=()=>{
              T.renderer.setRenderTarget(target);T.renderer.clear();T.renderer.render(T.scene,T.camera);
              const bytes=new Uint8Array(128*128*4);
              T.renderer.readRenderTargetPixels(target,576,296,128,128,bytes);return bytes;
            };
            try {
              const smoky=Pixels();pool.mesh.visible=false;const clear=Pixels();
              let difference=0,severe=0;
              for(let i=0;i<smoky.length;i+=4) {
                const delta=(Math.abs(smoky[i]-clear[i])+Math.abs(smoky[i+1]-clear[i+1])+Math.abs(smoky[i+2]-clear[i+2]))/3;
                difference+=delta;if(delta>64)severe++;
              }
              return {shots:T.state.playerShots-before,peakSmoke,peakTotalSmoke,profile:T.viewmodel.flashProfile.id,
                meanAimDifference:difference/(128*128),severeAimFraction:severe/(128*128)};
            } finally {pool.mesh.visible=smokeVisible;T.renderer.setRenderTarget(previous);target.dispose();}
          });
          const expectedShots=4/WEAPONS[id].fireIntervalS;
          assert(Math.abs(sustained.shots-expectedShots)<=1,
            `${key}: sustained real automatic fire at its authored cadence: ${JSON.stringify(sustained)}`);
          assert.equal(sustained.profile,id==="Zb26"?"lmg":"hmg",`${key}: gun-specific discharge recipe`);
          assert(sustained.peakSmoke>0&&sustained.peakSmoke<32,`${key}: bounded muzzle smoke population: ${JSON.stringify(sustained)}`);
          assert(sustained.meanAimDifference<15&&sustained.severeAimFraction<.03,
            `${key}: smoke preserves the aiming region: ${JSON.stringify(sustained)}`);
          await page.screenshot({path:path.join(out,`${key}_Sustained.png`)});
          results.push({key:`${key}_Sustained`,...sustained});
          console.log(`PASS ${key} sustained: ${sustained.shots} shots, ${sustained.peakSmoke} smoke particles, aim delta ${sustained.meanAimDifference.toFixed(2)}/255`);
        }
      }
    }
    if (quality !== "high") continue;
    // 2026-10-20: the trigger shot lands inside Frame(), before the viewmodel and the
    // lights step. The frame drawn right after it must carry the full flash and light
    // at any frame rate (it was 39% at 60 fps and nothing at all below 28 fps), and
    // every shot rolls its own flash (COD view flash: random cells, roll, size, count).
    const pulse = await page.evaluate(() => {
      const T = window.Taierzhuang, vm = T.viewmodel, range = T.Debug.WeaponRange;
      const Step = (n, dt = 1 / 60) => T.StepFrames(n, dt, false);
      T.Debug.Mouse(0, false); T.Debug.Mouse(2, false);
      range.GoTo("table", "HanYang"); Step(120); T.StepFrames(2);
      if (T.Debug.Slots().weapon !== "HanYang" && !range.Pickup("HanYang")) throw new Error("Pickup rejected: HanYang");
      Step(150); range.GoTo("firing"); range.SetAmmoMode("infinite"); Step(120);
      const rows = [], shapes = new Set();
      for (const fps of [20, 30, 60, 20, 30, 60]) {
        Step(Math.round(fps * 2.2), 1 / fps);
        const before = T.state.playerShots;
        T.Debug.Mouse(0, true); Step(1, 1 / fps); T.Debug.Mouse(0, false);
        const color = vm.flashGeometry.attributes.color.array, shot = vm.flashShot;
        rows.push({ fps, fired: T.state.playerShots - before, visible: vm.flash.visible,
          front: color[3] / vm.flashProfile.frontCover, light: T.lights.muzzle.intensity / Math.max(1e-6, T.lights.muzzleBase) });
        shapes.add(JSON.stringify([shot.front.map((s) => [s.cell, s.roll.toFixed(3), s.size.toFixed(4)]), shot.tongue.map((s) => s.cell)]));
      }
      return { rows, shapes: shapes.size };
    });
    for (const row of pulse.rows) {
      assert.equal(row.fired, 1, `${row.fps} fps: real trigger shot`);
      assert(row.visible && row.front > 0.99, `${row.fps} fps: first drawn frame carries the full flash: ${JSON.stringify(row)}`);
      assert(row.light > 0.99, `${row.fps} fps: first drawn frame carries the full muzzle light: ${JSON.stringify(row)}`);
    }
    assert.equal(pulse.shapes, pulse.rows.length, `every shot rolls its own flash: ${JSON.stringify(pulse)}`);
    results.push({ key: "FirstDrawnFrame", ...pulse });
    console.log(`PASS first drawn frame: full flash and light at 20/30/60 fps, ${pulse.shapes} distinct flashes`);
  }
  assert.deepEqual(errors, [], "Browser errors");
  fs.writeFileSync(path.join(out, "Data_MuzzleFlashReport.json"), JSON.stringify(results, null, 2));
} finally { await browser.close(); server.close(); }
