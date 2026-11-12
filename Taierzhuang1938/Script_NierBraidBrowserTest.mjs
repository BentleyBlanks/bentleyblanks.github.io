// The braid follows Nier's head, neck and back without entering the animated coat.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { LaunchBrowser } from '../PrairieFire1937/Script_BrowserTestKit.mjs';
import { ServeRoot } from './Script_DevServer.mjs';

const root = path.resolve(import.meta.dirname, '..');
const server = process.env.HAIR_PREVIEW ? null : await ServeRoot(root, 0);
const base = process.env.HAIR_PREVIEW || `http://127.0.0.1:${server.address().port}`;
const output = path.join(root, 'tmp/NierBraid'); fs.mkdirSync(output, { recursive: true });
const browser = await LaunchBrowser({ extraArgs: ['--mute-audio'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const errors = [], failedRequests = [], results = [];
page.on('pageerror', error => errors.push(String(error)));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
page.on('response', response => { if (response.status() >= 400) failedRequests.push(`${response.status()} ${response.url()}`); });
const clips = [
  'Animation_Mixamo_NeutralIdle_V1.glb', 'Animation_Mixamo_LookingAround_V2.glb',
  'Animation_Mixamo_Walking_V21.glb', 'Animation_Mixamo_UnarmedRunForward_V1.glb',
  'Animation_Mixamo_SittingIdle_V2.glb',
];
try {
  await page.goto(`${base}/Taierzhuang1938/AdvancedTools/Tool_MixamoAnimationPreview.html?who=nier`, { waitUntil: 'load', timeout: 180000 });
  await page.waitForFunction(() => window.__preview?.hair?.asset.id === 'Game_Nier' && window.__preview.hair.braidSkin && window.__preview.action,
    null, { timeout: 180000 });
  for (const file of clips) {
    await page.evaluate(async selected => { await window.__preview.SelectFile(selected); }, file);
    const duration = await page.evaluate(() => window.__preview.action.getClip().duration);
    for (const fraction of [.15, .5, .85]) {
      const result = await page.evaluate(async ({ duration, fraction }) => {
        const T = await import('three'), preview = window.__preview, scrub = document.querySelector('#scrub');
        scrub.value = duration * fraction; scrub.dispatchEvent(new Event('input', { bubbles: true }));
        preview.character.updateMatrixWorld(true); preview.hair.root.updateWorldMatrix(true, false);
        preview.hair.Update(0, preview.camera, preview.renderer);
        const body = preview.character.getObjectByProperty('isSkinnedMesh', true);
        const braid = preview.hair.meshes.braid, pos = braid.geometry.attributes.position;
        const indices = braid.geometry.attributes.aBoneIndices, weights = braid.geometry.attributes.aBoneWeights;
        const bones = preview.hair.braidSkin.uniforms.uBeardBones.value;
        const world = preview.hair.root.matrixWorld, inverse = world.clone().invert();
        const direction = new T.Vector3(0, 0, -1).transformDirection(world), ray = new T.Raycaster();
        const clearances = [];
        for (let strand = 0; strand < 3; strand++) for (let step = 20; step <= 96; step += 6) {
          const base = strand * 97 * 8 + step * 8;
          let local = null;
          for (let side = 0; side < 8; side++) {
            const id = base + side, rest = new T.Vector3().fromBufferAttribute(pos, id), vertex = new T.Vector3();
            for (let k = 0; k < 4; k++) vertex.addScaledVector(rest.clone().applyMatrix4(bones[indices.getComponent(id, k)]), weights.getComponent(id, k));
            if (!local || vertex.z < local.z) local = vertex;
          }
          const origin = local.clone().add(new T.Vector3(0, 0, .2)).applyMatrix4(world);
          ray.set(origin, direction);
          const hit = ray.intersectObject(body, false)[0];
          if (hit) clearances.push((local.z - hit.point.clone().applyMatrix4(inverse).z) * 1000);
        }
        const head = preview.character.getObjectByName('Head');
        preview.orbit.target.copy(head.getWorldPosition(head.position.clone()));
        preview.orbit.target.y -= .025; preview.orbit.dist = .62; preview.orbit.yaw = Math.PI * .75; preview.orbit.pitch = 0;
        document.querySelector('#edRoot').style.display = 'none';
        return { count: clearances.length, minMm: Math.min(...clearances), negative: clearances.filter(value => value < 0).length,
          bones: preview.hair.braidSkin.bones.map(bone => bone.name) };
      }, { duration, fraction });
      assert.ok(result.count >= 30, `${file} ${fraction}: enough braid-to-coat samples`);
      assert.deepEqual(result.bones, ['Head', 'Neck', 'Spine2', 'Spine1']);
      assert.ok(result.minMm > 3, `${file} ${fraction}: braid intersects the coat (${result.minMm.toFixed(2)} mm)`);
      assert.ok(result.minMm < 50, `${file} ${fraction}: braid floats too far from the coat (${result.minMm.toFixed(2)} mm)`);
      results.push({ file, fraction, ...result });
      if (fraction === .5 && /NeutralIdle|UnarmedRunForward|SittingIdle/.test(file)) {
        await page.waitForTimeout(120);
        const name = file.replace(/.*\//, '').replace('.glb', '');
        await sharp(await page.screenshot()).resize({ width: 640, height: 640, fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 82 }).toFile(path.join(output, `${name}.jpg`));
      }
    }
  }
  assert.deepEqual(errors, []); assert.deepEqual(failedRequests, []);
  fs.writeFileSync(path.join(output, 'Data_NierBraidReview.json'), `${JSON.stringify({ results, errors, failedRequests }, null, 2)}\n`);
  console.log('NierBraidBrowserTest ok', results.length, 'poses', `min ${Math.min(...results.map(row => row.minMm)).toFixed(2)} mm`);
} finally {
  await browser.close();
  if (server) await new Promise(resolve => server.close(resolve));
}
