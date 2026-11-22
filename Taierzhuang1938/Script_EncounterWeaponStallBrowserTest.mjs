import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const server = process.env.ENCOUNTER_TEST_BASE ? null : await ServeRoot(root, 0);
const base = process.env.ENCOUNTER_TEST_BASE || `http://127.0.0.1:${server.address().port}`;
const browser = await LaunchBrowser();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem("tengxian1938_audio_v1", JSON.stringify({ master: 0 }));
    localStorage.setItem("tengxian1938_tools_volume_v1", JSON.stringify({ volume: 0, muted: true }));
  });
  await page.goto(`${base}/Taierzhuang1938/AdvancedTools/Tool_LevelFlow.html?beat=05b`);
  await page.waitForFunction(() => window.LevelFlow);
  let firstHost;
  for (const run of ["cold", "restart"]) {
    await page.locator("#playGame").click();
    await page.waitForFunction(() => {
      const game = document.querySelector(".lfPlayHost iframe")?.contentWindow.Tengxian;
      return game?.state.running && game.Debug.EncounterPlay.State().ready;
    }, null, { timeout: 180000 });
    await page.locator(".lfPlayLoading").waitFor({ state: "hidden" });
    const frame = page.frames().find(frame => frame.url().includes("encounterPlay=1"));
    const result = await frame.evaluate(async () => {
      const game = Tengxian, vm = game.viewmodel, gl = game.renderer.getContext();
      const terrain = game.battlefield.meshes.filter(mesh => mesh.userData.deformableTerrain);
      const terrainBatched = terrain.some(mesh => game.prepassStaticBatch.records.has(mesh)
        || game.shadowCasterBatch.records.has(mesh));
      const castMapSizes = [];
      game.scene.traverse(object => {
        const material = object.material;
        if (/^M_(Donggua|Nier|HeYoutian|OldGeng|Yaowa)$/.test(material?.name)) {
          for (const texture of [material.map, material.normalMap, material.roughnessMap]) {
            if (texture?.image) castMapSizes.push(Math.max(texture.image.width, texture.image.height));
          }
        }
      });
      const buffers = new Set();
      function Track(geometry) {
        for (const attribute of [geometry.index, ...Object.values(geometry.attributes)]) {
          if (attribute) buffers.add(attribute.array);
        }
      }
      for (const prop of [vm.flash, vm.packetProp, vm.usedPacketProp]) {
        prop.traverse(mesh => { if (mesh.isMesh) Track(mesh.geometry); });
      }
      for (const [key, geometries] of vm.reloadRoundGeometries) {
        if (key.startsWith(vm.clipProp.userData.profile + ":")) Object.values(geometries).forEach(Track);
      }
      const uploads = [], timings = [], kinds = new Set();
      const bufferData = gl.bufferData;
      gl.bufferData = function(target, data, ...args) {
        if (buffers.has(data)) uploads.push(data.byteLength);
        return bufferData.call(this, target, data, ...args);
      };
      game.Debug.SetDebugOption("invincible", true);
      const initial = { ammo: game.state.ammo, clips: game.state.clips };
      async function Action(kind, input) {
        let seen = false, peakMs = 0, last = performance.now();
        input();
        for (let i = 0; i < 900; i++) {
          await new Promise(requestAnimationFrame);
          const now = performance.now();
          peakMs = Math.max(peakMs, now - last);
          last = now;
          for (const slot of vm.debris) if (slot.alive > 0) kinds.add(slot.mesh.userData.debrisKind);
          if (vm.action?.kind === kind) seen = true;
          else if (seen) { timings.push({ kind, peakMs }); return; }
        }
        throw new Error(`Did not finish ${kind}`);
      }
      try {
        game.Debug.Mouse(2, true);
        for (let i = 0; i < 20; i++) await new Promise(requestAnimationFrame);
        await Action("bolt", () => game.Debug.Fire());
        game.Debug.Mouse(2, false);
        const afterShot = game.state.ammo;
        await Action("reload", () => game.Debug.Key("KeyR"));
        const afterPartial = game.state.ammo;
        // Start one round from empty; shooting that round still opens the bolt
        // through the normal action, then R plays the open-bolt reload.
        game.state.ammo = 1;
        await Action("bolt", () => game.Debug.Fire());
        const empty = game.state.ammo, heldOpen = vm.boltOpen;
        await Action("reload", () => game.Debug.Key("KeyR"));
        return { host: game.Debug.EncounterPlay.State().hostId, initial, afterShot, afterPartial,
          empty, heldOpen, finalAmmo: game.state.ammo, clips: game.state.clips, terrain: terrain.length,
          terrainBatched, maxCastMapSize: Math.max(...castMapSizes), uploads, timings, debris: [...kinds], quality: game.graphics.profile };
      } finally {
        gl.bufferData = bufferData;
      }
    });
    assert.equal(result.quality, "high");
    assert.equal(result.maxCastMapSize, 2048, "The local cast draws from gameplay-sized textures");
    assert.ok(result.terrain > 0 && !result.terrainBatched, "Depth and shadow must reuse the original terrain tiles");
    assert.deepEqual(result.uploads, [], "The first bolt and reload must reuse GPU buffers for action props");
    assert.equal(result.afterShot, result.initial.ammo - 1);
    assert.equal(result.afterPartial, result.initial.ammo);
    assert.ok(result.empty === 0 && result.heldOpen);
    assert.equal(result.finalAmmo, result.initial.ammo);
    assert.equal(result.clips, result.initial.clips - 2);
    assert.ok(result.debris.includes("shell") && result.debris.includes("cartridge"));
    assert.ok(result.timings.every(action => action.peakMs < 1000),
      `A weapon action froze the ${run} Play viewport for a second: ${JSON.stringify(result.timings)}`);
    if (firstHost) assert.equal(result.host, firstHost);
    firstHost = result.host;
    console.log(run, JSON.stringify(result));
    await page.locator("#stopGame").click();
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  if (server) await new Promise(resolve => server.close(resolve));
}
