// Browser integration test for the four shared Kimodo death candidates.
// Usage: node Taierzhuang1938/Script_DeathCollapseTest.mjs

import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const server = await ServeRoot(path.resolve(projectDir, ".."), 0);
const browser = await LaunchBrowser();
let page;
try {
  page = await browser.newPage({ viewport: { width: 640, height: 360 } });
  const origin = `http://127.0.0.1:${server.address().port}`;
  // Give setContent a same-origin document URL; an about:blank origin blocks
  // module imports before the in-page try/catch can report the failure.
  await page.goto(`${origin}/Taierzhuang1938/AGENTS.md`, { waitUntil: "load" });
  await page.setContent(`<!doctype html><base href="${origin}/Taierzhuang1938/">
    <script type="importmap">{"imports":{"three":"./vendor/three/build/three.module.js"}}</script>
    <script type="module">
      import * as THREE from "three";
      import {
        DEATH_COLLAPSE_CLIP_IDS, SelectDeathCollapseClipId,
        LoadLugouCharacterAssets, CreateLugouCharacterRig,
      } from "./Script_CharacterModel.mjs";
      try {
        const library = await LoadLugouCharacterAssets();
        const seeds = new Map();
        for (let seed = 0; seed < 1000 && seeds.size < DEATH_COLLAPSE_CLIP_IDS.length; seed += 1) {
          const id = SelectDeathCollapseClipId(seed);
          if (!seeds.has(id)) seeds.set(id, seed);
        }
        const rows = [];
        for (const kind of ["nra", "ija"]) for (const id of DEATH_COLLAPSE_CLIP_IDS) {
          const seed = seeds.get(id);
          const root = new THREE.Group(), body = new THREE.Group();
          body.position.y = 0.92; root.add(body);
          const rig = CreateLugouCharacterRig(library, kind, {
            seed, modelVariant: kind === "nra" ? 1 : 0,
          }, 1.68);
          const actor = { root, body, ragdollState: { forward: 1 }, weaponId: null };
          rig.Attach(actor);
          const duration = rig.BeginDeathPose();
          rig.PoseDeath(0);
          const start = rig.bones.pelvis.getWorldPosition(new THREE.Vector3());
          body.position.set(0, rig.attachBodyY, 0); body.quaternion.identity();
          rig.PoseDeath(1);
          const end = rig.bones.pelvis.getWorldPosition(new THREE.Vector3());
          const head = rig.bones.head.getWorldPosition(new THREE.Vector3());
          body.position.set(0, rig.attachBodyY, 0); body.quaternion.identity();
          rig.PoseDeath(1);
          const repeatedEnd = rig.bones.pelvis.getWorldPosition(new THREE.Vector3());
          root.updateMatrixWorld(true);
          let skinFloor = Infinity, legFloor = Infinity, torsoFloor = Infinity;
          rig.root.traverse(mesh => {
            if (!mesh.isMesh || !mesh.visible || !mesh.userData.characterPbrSurface) return;
            mesh.skeleton?.update();
            const point = new THREE.Vector3(), indices = mesh.geometry.index;
            const count = indices?.count ?? mesh.geometry.attributes.position.count;
            for (let offset = 0; offset < count; offset += 1) {
              const index = indices ? indices.getX(offset) : offset;
              mesh.getVertexPosition(index, point).applyMatrix4(mesh.matrixWorld);
              skinFloor = Math.min(skinFloor, point.y);
              if (!mesh.isSkinnedMesh) continue;
              const bones = mesh.geometry.attributes.skinIndex, weights = mesh.geometry.attributes.skinWeight;
              let dominant = 0;
              for (let k = 1; k < 4; k += 1) {
                if (weights.getComponent(index, k) > weights.getComponent(index, dominant)) dominant = k;
              }
              const name = mesh.skeleton.bones[bones.getComponent(index, dominant)].name;
              if (/Calf|Thigh/.test(name)) legFloor = Math.min(legFloor, point.y);
              if (/Pelvis|Spine/.test(name)) torsoFloor = Math.min(torsoFloor, point.y);
            }
          });
          rows.push({
            kind, id, selected: rig.deathVariantId, clips: rig.deathClipById.size,
            action: rig.deathClipState?.clip?.name, duration,
            pelvisDrop: start.y - end.y,
            repeatedDelta: repeatedEnd.distanceTo(end),
            floorLift: rig.deathFloorLift,
            skinFloor, legFloor, torsoFloor,
            signature: [end.x, end.y, end.z, head.x, head.y, head.z]
              .map(value => value.toFixed(2)).join(","),
          });
          rig.Dispose();
        }
        window.result = { rows, ids: [...DEATH_COLLAPSE_CLIP_IDS] };
      } catch (error) {
        window.failure = error?.stack || String(error);
      }
    </script>`);
  await page.waitForFunction(() => window.result || window.failure, null, { timeout: 300000 });
  const { result, failure } = await page.evaluate(() => ({ result: window.result, failure: window.failure }));
  assert.equal(failure, undefined, failure);
  assert.deepEqual(result.ids, ["DeathCollapseA", "DeathCollapseB", "DeathCollapseC", "DeathCollapseD"]);
  assert.equal(result.rows.length, 8, "four candidates are usable by both factions");
  for (const row of result.rows) {
    assert.equal(row.selected, row.id, `${row.kind}/${row.id} stable selection`);
    assert.equal(row.clips, 4, `${row.kind} loaded all four candidates`);
    assert.match(row.action, new RegExp(`${row.kind === "nra" ? "Nra" : "Ija"}_${row.id}_V1$`));
    assert.ok(row.duration >= 1.65 && row.duration <= 2.0, `${row.kind}/${row.id} gameplay duration`);
    assert.ok(row.pelvisDrop > 0.45, `${row.kind}/${row.id} reaches a collapsed pelvis height`);
    assert.ok(row.repeatedDelta < 1e-5,
      `${row.kind}/${row.id} terminal pose changed on a corpse tick: ${row.repeatedDelta}`);
    assert.ok(Number.isFinite(row.floorLift), `${row.kind}/${row.id} final visible skin is grounded`);
    assert.ok(Math.abs(row.skinFloor - .008) < .003, `${row.kind}/${row.id} visible skin floor ${row.skinFloor}`);
    assert.ok(row.legFloor < .12 && row.torsoFloor < .12,
      `${row.kind}/${row.id} support is not whole-body: legs=${row.legFloor}, torso=${row.torsoFloor}`);
  }
  for (const kind of ["nra", "ija"]) {
    assert.equal(new Set(result.rows.filter(row => row.kind === kind).map(row => row.signature)).size, 4,
      `${kind} candidates retain four distinct terminal poses`);
  }
  console.log("DeathCollapseTest OK — four seeded Kimodo candidates play once on NRA and IJA rigs");
} finally {
  if (page) await page.close();
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
