// Real Mixamo preview: every configured character's baked groom follows the animated Head bone across poses.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";
import { XBOT_CHARACTERS } from "./Data_XBotCharacters.mjs";

// Browser-test probe. Match the close-fitting layers to their original body vertices in bind
// space once, then measure separation against those same vertices on the animated body.
async function MeasureGroomMotion() {
  const T = await import('three');
  const { character, hair, camera, renderer } = window.__preview;
  character.updateMatrixWorld(true);
  hair.Update(0, camera, renderer);
  const body = character.getObjectByProperty('isSkinnedMesh', true);
  const head = body.skeleton.bones.findIndex(b => b.name === 'Head');
  const bodyToHair = hair.root.matrix.clone().invert().multiply(body.skeleton.boneInverses[head]).multiply(body.bindMatrix);
  const delta = new T.Vector3(), rest = new T.Vector3(), sample = new T.Vector3(), actual = new T.Vector3();
  const bodyPosition = body.geometry.attributes.position, bodyNormal = body.geometry.attributes.normal;
  const cell = .002, grid = new Map();
  const key = (x, y, z) => `${x}/${y}/${z}`;
  for (let i = 0; i < bodyPosition.count; i++) {
    rest.fromBufferAttribute(bodyPosition, i).applyMatrix4(bodyToHair);
    const id = key(Math.floor(rest.x/cell), Math.floor(rest.y/cell), Math.floor(rest.z/cell));
    if (!grid.has(id)) grid.set(id, []);
    grid.get(id).push(i);
  }
  const origin = new T.Vector3(), normal = new T.Vector3(), candidateNormal = new T.Vector3();
  const measurements = {};
  for (const [part, skin] of [['scalp', hair.scalpSkin], ['stubble', hair.beardSkin]]) {
    const mesh = hair.meshes[part];
    if (!mesh) continue;
    const { position, aBoneWeights, aBoneIndices } = mesh.geometry.attributes;
    const distances = [], clearances = [];
    let rigidMinMm = Infinity;
    for (let i = 0; i < position.count; i++) {
      sample.fromBufferAttribute(position, i);
      normal.fromBufferAttribute(mesh.geometry.attributes.normal, i).normalize();
      // Bake offsets the actual source vertex along its normal. Un-offset before
      // matching so a close lip or overlapping UV seam cannot steal the match.
      origin.copy(sample).addScaledVector(normal, part === 'scalp' ? -.00015 : -.00035);
      const x = Math.floor(origin.x/cell), y = Math.floor(origin.y/cell), z = Math.floor(origin.z/cell);
      let best = Infinity, nearest = -1;
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
        for (const id of grid.get(key(x+dx, y+dy, z+dz)) || []) {
          rest.fromBufferAttribute(bodyPosition, id).applyMatrix4(bodyToHair);
          candidateNormal.fromBufferAttribute(bodyNormal, id).transformDirection(bodyToHair);
          const d = origin.distanceToSquared(rest) + normal.distanceToSquared(candidateNormal) * 1e-8;
          if (d < best) { best = d; nearest = id; }
        }
      }
      if (best > .001 ** 2) throw Error(`${part} vertex ${i} has no corresponding skin vertex (${Math.sqrt(best)} m)`);
      if (skin) {
        actual.set(0, 0, 0);
        for (let k = 0; k < 4; k++) {
          const matrix = skin.uniforms.uBeardBones.value[aBoneIndices.getComponent(i, k)];
          actual.addScaledVector(delta.copy(sample).applyMatrix4(matrix), aBoneWeights.getComponent(i, k));
        }
      } else actual.copy(sample);
      actual.applyMatrix4(mesh.matrixWorld);
      rest.fromBufferAttribute(bodyPosition, nearest);
      const world = body.applyBoneTransform(nearest, rest.clone()).applyMatrix4(body.matrixWorld);
      delta.fromBufferAttribute(bodyNormal, nearest).multiplyScalar(.001).add(rest);
      body.applyBoneTransform(nearest, delta).applyMatrix4(body.matrixWorld).sub(world).normalize();
      rigidMinMm = Math.min(rigidMinMm, rest.copy(sample).applyMatrix4(mesh.matrixWorld).sub(world).dot(delta) * 1000);
      actual.sub(world);
      clearances.push(actual.dot(delta)*1000);
      distances.push(actual.length()*1000);
    }
    distances.sort((a,b) => a-b); clearances.sort((a,b) => a-b);
    measurements[part] = { vertices: position.count, rigidMinMm, maxMm: distances.at(-1), p95Mm: distances[Math.floor(distances.length*.95)],
      minMm: clearances[0], p05Mm: clearances[Math.floor(clearances.length*.05)] };
  }
  return measurements;
}

const root = path.resolve(import.meta.dirname, "..");
const server = process.env.HAIR_PREVIEW ? null : await ServeRoot(root, 0);
const base = process.env.HAIR_PREVIEW || `http://127.0.0.1:${server.address().port}`;
const browser = await LaunchBrowser({ extraArgs: ["--mute-audio"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const errors = [], failures = [], observations = [];
const keys = Object.entries(XBOT_CHARACTERS).filter(([, def]) => def.groom).map(([key]) => key);
const styledBeards = new Set(JSON.parse(fs.readFileSync(path.join(root, 'Taierzhuang1938/Hair/Data_HairStyles.json'), 'utf8'))
  .gameGrooms.filter(entry => entry.beard).map(entry => entry.id));
const output = path.join(root, "tmp", "MixamoGroom");
fs.mkdirSync(output, { recursive: true });
page.on("pageerror", error => errors.push(String(error)));
page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
page.on("response", response => { if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`); });
try {
  await page.goto(`${base}/Taierzhuang1938/AdvancedTools/Tool_MixamoAnimationPreview.html?who=${keys[0]}`, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => window.__preview?.action && window.__preview.hair?.stats.lod !== "none", null, { timeout: 180000 });
  for (const key of [...keys, "xbot", keys[0]]) {
    await page.locator("#who").selectOption(key);
    await page.waitForFunction(expected => window.__preview?.character && document.querySelector("#who")?.value === expected &&
      (expected === "xbot" ? !window.__preview.hair : window.__preview.hair?.root.name === `Hair_${expected}`), key, { timeout: 180000 });
    await page.waitForTimeout(350);
    const observation = await page.evaluate(() => {
      const p = window.__preview, h = p.hair;
      return { key: document.querySelector("#who").value, action: p.action?.getClip().name,
        hair: h?.asset.id || null, lod: h?.stats.lod || null,
        visible: h ? Object.values(h.meshes).filter(mesh => mesh.visible).map(mesh => mesh.name) : [],
        parent: h?.root.parent?.name || null, beardBones: h?.beardSkin?.bones.map(bone => bone.name) || [] };
    });
    observations.push(observation);
    assert.ok(observation.action, `${key}: animation continues`);
    if (key === "xbot") assert.equal(observation.hair, null);
    else {
      assert.ok(observation.hair?.startsWith("Game_"), `${key}: game groom loaded`);
      assert.equal(observation.parent, "Head", `${key}: groom follows head bone`);
      assert.ok(observation.visible.some(name => /Hair(Strands|Cards|Shell)/.test(name)), `${key}: hair rendered`);
      if (key === 'nier') assert.ok(observation.visible.includes('HairBraid'), 'Nier: the reference braid stays visible with animated hair');
      if (styledBeards.has(observation.hair))
        assert.ok(observation.visible.some(name => /Hair(Beard|Stubble)/.test(name)), `${key}: beard rendered`);
      if (styledBeards.has(observation.hair))
        assert.ok(observation.beardBones.includes("Head"), `${key}: beard uses the animated facial bones`);
      if (!styledBeards.has(observation.hair))
        assert.ok(!observation.visible.some(name => /Hair(Beard|Stubble)/.test(name)), `${key}: clean-shaven character`);
      await page.evaluate(() => window.__preview.SelectFile("Animation_Mixamo_LookingAround_V2.glb"));
      await page.waitForFunction(() => window.__preview.current?.file === "Animation_Mixamo_LookingAround_V2.glb" && window.__preview.action);
      const duration = await page.evaluate(() => window.__preview.action.getClip().duration);
      const poses = [];
      for (const time of [duration * 0.1, duration * 0.6]) {
        poses.push(await page.evaluate(time => {
          const p = window.__preview, scrub = document.querySelector("#scrub");
          scrub.value = time; scrub.dispatchEvent(new Event("input", { bubbles: true }));
          p.character.updateMatrixWorld(true);
          const head = p.character.getObjectByName("Head"), hair = p.hair.root;
          const beard = p.hair.meshes.beardCards || p.hair.meshes.stubble;
          const headQ = head.getWorldQuaternion(head.quaternion.clone());
          const hairQ = hair.getWorldQuaternion(hair.quaternion.clone());
          const result = { headQ: headQ.toArray(), hairQ: hairQ.toArray(),
            headPos: head.getWorldPosition(head.position.clone()).toArray(),
            hairPos: hair.getWorldPosition(hair.position.clone()).toArray(),
            beardPos: beard?.getWorldPosition(beard.position.clone()).toArray() || null };
          return result;
        }, time));
      }
      const angularChange = (a, b) => 2 * Math.acos(Math.min(1, Math.abs(a.reduce((sum, v, i) => sum + v * b[i], 0))));
      assert.ok(angularChange(poses[0].headQ, poses[1].headQ) > 0.03, `${key}: head bone animates`);
      assert.ok(angularChange(poses[0].hairQ, poses[1].hairQ) > 0.03, `${key}: hair rotates with head`);
      assert.ok(Math.abs(angularChange(poses[0].headQ, poses[1].headQ) - angularChange(poses[0].hairQ, poses[1].hairQ)) < 0.001,
        `${key}: hair rotation matches head rotation`);
      if (poses[0].beardPos) assert.ok(Math.hypot(...poses[0].beardPos.map((v, i) => v - poses[1].beardPos[i])) > 0.002,
        `${key}: beard follows animated head`);
      observation.poses = poses;
      observation.motion = [];
      for (const file of ['Animation_Mixamo_NeutralIdle_V1.glb', 'Animation_Mixamo_Walking_V21.glb', 'Animation_Mixamo_UnarmedRunForward_V1.glb']) {
        await page.evaluate(file => window.__preview.SelectFile(file), file);
        for (const fraction of [.15, .5, .85]) {
          await page.evaluate(fraction => {
            const p = window.__preview, scrub = document.querySelector('#scrub');
            scrub.value = fraction * p.action.getClip().duration;
            scrub.dispatchEvent(new Event('input'));
          }, fraction);
          const layers = await page.evaluate(MeasureGroomMotion);
          for (const [part, metrics] of Object.entries(layers)) {
            assert.ok(metrics.minMm > .045 && metrics.maxMm < .65,
              `${key} ${file} ${fraction} ${part} crossed or detached from the skin: ${JSON.stringify(metrics)}`);
          }
          observation.motion.push({file, fraction, layers});
        }
      }
    }
    if (key !== "xbot" && observations.filter(o => o.key === key).length === 1) {
      await page.evaluate(() => {
        const p = window.__preview;
        const head = p.character.getObjectByName("Head");
        p.orbit.target.copy(head.getWorldPosition(head.position.clone()));
        p.orbit.target.y -= 0.05; p.orbit.dist = 1; p.orbit.yaw = 0; p.orbit.pitch = 0.06;
        document.querySelector("#edRoot").style.display = "none";
      });
      await page.waitForTimeout(250);
      await sharp(await page.screenshot()).resize({ width: 640, height: 640, fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 82 }).toFile(path.join(output, `${key}.jpg`));
      await page.evaluate(() => { document.querySelector("#edRoot").style.display = ""; window.__preview.orbit.dist = 5; window.__preview.orbit.target.set(0, .95, 0); });
    }
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(failures, []);
  fs.writeFileSync(path.join(output, "Data_MixamoGroomReview.json"), `${JSON.stringify({ observations, errors, failures }, null, 2)}\n`);
  console.log("MixamoGroomBrowserTest ok", observations.map(o => `${o.key}:${o.lod}:${o.visible.join("+")}`).join(" "));
} finally {
  await browser.close();
  if (server) await new Promise(resolve => server.close(resolve));
}
