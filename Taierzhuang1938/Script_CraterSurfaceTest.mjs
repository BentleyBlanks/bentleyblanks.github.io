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
    const view = field.deformation, debris = [...view.debris.tiles.values()].flatMap((tile) => tile.meshes);
    let tallestFragment = 0;
    for (const mesh of debris) {
      const positions = mesh.geometry.attributes.position;
      for (let i = 0; i < positions.count; i += 17) tallestFragment = Math.max(tallestFragment,
        positions.getY(i) - field.GroundHeight(positions.getX(i), positions.getZ(i)));
    }
    return { left: field.GroundHeight(2595, 2576), right: field.GroundHeight(2605, 2576), state: view.State(),
      tallestFragment, receivesShadows: debris.every((mesh) => mesh.castShadow && mesh.receiveShadow),
      textureSize: view.soilMaterial.map.image.width };
  });
  assert.ok(terrain.left < -2.3 && terrain.right < -2, "real repeated shells create deep physical pits");
  assert.ok(terrain.state.debris.stones > 0 && terrain.state.debris.fragments > 20, "existing rock models and small clods dress real impacts");
  assert.ok(terrain.state.debris.tiles <= terrain.state.debris.maxTiles, "fragment tile cache stays bounded");
  assert.ok(terrain.state.debris.fragments <= terrain.state.debris.tiles * terrain.state.debris.maxFragmentsPerTile, "per-tile debris stays bounded");
  assert.ok(terrain.tallestFragment > 0.02 && terrain.tallestFragment < 0.24, "repeated impacts re-ground boot-sized surface fragments");
  assert.ok(terrain.receivesShadows && terrain.textureSize === 1024, "authored crater material and shadowed geometry are in the actual scene");

  // Freezing the world does not freeze the picture: GTAO/SSIL and SSR carry
  // temporal history that advances one step per Render even with taa:false, so
  // reading one render per side compares two half-settled pictures. Same rule as
  // the batching gates (docs/Data_TechRenderPipeline.md): idle each side to the
  // fixed point first, then read. Measured on this scene and camera, 1080x675
  // half-float HDR, as changed pixels of 729000 / peak channel step:
  //
  //     idle draws   identical-config noise   crater decal   bullet decal
  //         1            1656 / 7                93 / 7      4096 / 29021
  //        20           32231 / 119            6226 / 14
  //        45            3800 / 11                0 / 0      4096 / 29021
  //        60             428 / 3                 0 / 0
  //        96               0 / 0                 0 / 0      4096 / 29021
  //
  // Partway is worse than not settling at all — the mid-transient is the loudest
  // part. At 96 both sides read byte-identical, so this compares exactly and
  // needs no tolerance. Settling both sides also matters for strictness, not
  // just quiet: history is mix(hist, cur, 0.1), so the first render after the
  // toggle carries only a tenth of any real difference.
  const SETTLE_DRAWS = 96;

  async function CompareDecals(eye, target, label) {
    const difference = await page.evaluate(({ eye, target, settle }) => {
      const t = window.Taierzhuang, decal = t.vfx.pools.decal.mesh;
      t.camera.position.set(...eye); t.camera.lookAt(...target); t.camera.updateMatrixWorld(true);
      // Freeze postprocess time and AO sampling. Compare the HDR scene itself,
      // before grain/TAA/UI, so only the switched decal layer can change pixels.
      const frame = t.post.frame, hdr = t.post.targets.hdr;
      const Draw = (visible) => {
        decal.visible = visible; t.post.frame = frame;
        t.post.Render(t.scene, t.camera, { taa: false, motionBlur: 0, grain: 0 });
      };
      const Sample = (visible) => {
        for (let i = 0; i < settle; i++) Draw(visible);
        const pixels = new Uint16Array(hdr.width * hdr.height * 4);
        t.renderer.readRenderTargetPixels(hdr, 0, 0, hdr.width, hdr.height, pixels);
        return pixels;
      };
      const Differences = (a, b) => {
        let changed = 0;
        for (let i = 0; i < a.length; i += 4) {
          if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2]) changed++;
        }
        return changed;
      };
      // Two settled reads of the same configuration are the noise floor; the
      // third switches the layer off from an equally settled start.
      const shown = Sample(true), again = Sample(true), hidden = Sample(false);
      const result = { changedPixels: Differences(again, hidden),
        noisePixels: Differences(shown, again), totalPixels: hdr.width * hdr.height };
      Draw(true);
      return result;
    }, { eye, target, settle: SETTLE_DRAWS });
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
  // Offset impacts exercise shallow, intersecting lips, unlike repeatedly
  // deepening one center. Read the actual production shader's coverage, without
  // lighting or soil texture hiding patches of untouched material inside it.
  const overlap = await page.evaluate(async () => {
    const THREE = await import("three"), t = window.Taierzhuang, view = t.combat.host.battlefield.deformation;
    t.Debug.Explosions.Reset();
    for (const [dx, dz, kind] of [[0, 0, "shell"], [3.8, 0, "shell"], [-3.7, -0.4, "shell"],
      [1.1, -3.8, "shell"], [-2.6, -4, "shell"], [0.6, 3.6, "shell"],
      [-2, 3, "grenade"], [-3, 2.4, "grenade"], [-2.5, 1.7, "grenade"]]) {
      const x = 2600 + dx, z = 2576 + dz;
      t.combat.Blast(t.player.position.clone().set(x, view.field.GroundHeight(x, z), z), 6, 0, kind);
    }
    t.StepFrames(600);
    const scene = new THREE.Scene(), material = view.material.clone();
    material.onBeforeCompile = (shader, renderer) => {
      view.material.onBeforeCompile(shader, renderer);
      shader.fragmentShader = shader.fragmentShader.replace(/\}\s*$/, `
        gl_FragColor = vec4(exposed, step(0.015, vTerrainWear),
          1.0 - step(0.00001, vTerrainWear + vTerrainBlast.y), 1.0);
      }`);
    };
    material.customProgramCacheKey = () => `${view.material.customProgramCacheKey()}|CoverageTest`;
    for (const mesh of view.tileMeshes.values()) scene.add(new THREE.Mesh(mesh.geometry, material));
    const camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 40);
    camera.up.set(0, 0, -1); camera.position.set(2600, 20, 2576); camera.lookAt(2600, 0, 2576);
    const target = new THREE.WebGLRenderTarget(1024, 1024), renderer = t.renderer;
    const oldTarget = renderer.getRenderTarget(), oldColor = renderer.getClearColor(new THREE.Color()), oldAlpha = renderer.getClearAlpha();
    try {
      renderer.setRenderTarget(target); renderer.setClearColor(0, 0); renderer.clear(); renderer.render(scene, camera);
      const pixels = new Uint8Array(1024 * 1024 * 4);
      renderer.readRenderTargetPixels(target, 0, 0, 1024, 1024, pixels);
      let disturbedPixels = 0, bareInteriorPixels = 0, untouchedPixels = 0, stainedUntouchedPixels = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        if (!pixels[i + 3]) continue;
        if (pixels[i + 1] > 250) { disturbedPixels++; if (pixels[i] < 250) bareInteriorPixels++; }
        if (pixels[i + 2] > 250) { untouchedPixels++; if (pixels[i] > 2) stainedUntouchedPixels++; }
      }
      return { disturbedPixels, bareInteriorPixels, untouchedPixels, stainedUntouchedPixels, impacts: view.model.impacts };
    } finally {
      renderer.setRenderTarget(oldTarget); renderer.setClearColor(oldColor, oldAlpha); target.dispose(); material.dispose();
    }
  });
  await CompareDecals([2600, 6, 2586], [2600, -0.3, 2575], "OverlappingLips");
  const reset = await page.evaluate(() => {
    const t = window.Taierzhuang, view = t.combat.host.battlefield.deformation;
    t.Debug.Explosions.Reset();
    return { fragments: view.debris.State().fragments, marks: view.blastPages.size,
      meshes: t.scene.children.filter((mesh) => mesh.userData.craterDebris).length };
  });
  assert.deepEqual(reset, { fragments: 0, marks: 0, meshes: 0 }, "reset releases all persistent soil marks and debris meshes");
  const report = { terrain, crater, bullet, overlap, reset, errors };
  fs.writeFileSync(path.join(out, "Data_Acceptance.json"), JSON.stringify(report, null, 2));
  assert.deepEqual(errors, [], "no browser/GLSL errors");
  assert.equal(crater.noisePixels, 0, `the temporal chain did not settle, so this says nothing about decals: ${JSON.stringify(crater)}`);
  assert.equal(bullet.noisePixels, 0, `the temporal chain did not settle, so this says nothing about decals: ${JSON.stringify(bullet)}`);
  assert.ok(crater.changedPixels <= 4, `persistent flat decals must not cut rings through crater walls: ${JSON.stringify(crater)}`);
  assert.ok(bullet.changedPixels > 20, `ordinary bullet marks remain visible: ${JSON.stringify(bullet)}`);
  assert.ok(overlap.impacts === 9 && overlap.disturbedPixels > 100000, "real offset shells and grenades exercise intersecting shallow lips");
  assert.equal(overlap.bareInteriorPixels, 0, `disturbed soil must stay continuous inside overlapping lips: ${JSON.stringify(overlap)}`);
  assert.ok(overlap.untouchedPixels > 100000 && overlap.stainedUntouchedPixels === 0, "coverage still fades completely to untouched ground outside the craters");
  console.log(`PASS CraterSurfaceTest: repeated shells ${crater.changedPixels} decal pixels; bullet impact ${bullet.changedPixels} visible pixels`);
} finally { await browser.close(); await new Promise((resolve) => server.close(resolve)); }
