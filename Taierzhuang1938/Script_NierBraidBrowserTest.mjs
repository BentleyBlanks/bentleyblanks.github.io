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
        const end = duration * fraction, dt = 1 / 60;
        for (let frame = 24; frame >= 0; frame--) {
          scrub.value = Math.max(0, end - frame * dt);
          scrub.dispatchEvent(new Event('input', { bubbles: true }));
          preview.character.updateMatrixWorld(true);
          preview.hair.Update(frame === 24 ? 0 : dt, preview.camera, preview.renderer);
        }
        const body = preview.character.getObjectByProperty('isSkinnedMesh', true);
        body.computeBoundingSphere(); // skinned raycast broad phase for this sampled pose
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
          let hit = ray.intersectObject(body, false)[0];
          if (hit) {
            clearances.push((local.z - hit.point.clone().applyMatrix4(inverse).z) * 1000);
          } else {
            // With a turned or seated character the head-facing ray can pass
            // beside the torso. Probe toward the animated coat at this ring.
            const back = new T.Vector3();
            for (let k = 0; k < 4; k++) {
              const joint = indices.getComponent(base, k);
              const matrix = preview.hair.braidSkin.bones[joint].matrixWorld.clone().multiply(preview.hair.braidSkin.attach[joint]);
              back.addScaledVector(new T.Vector3(0, 0, 1).transformDirection(matrix), weights.getComponent(base, k));
            }
            const point = local.clone().applyMatrix4(world);
            back.normalize(); ray.set(point.clone().addScaledVector(back, .2), back.clone().negate());
            hit = ray.intersectObject(body, false)[0];
            if (hit) clearances.push(point.sub(hit.point).dot(back) * 1000);
          }
        }
        const head = preview.character.getObjectByName('Head');
        preview.orbit.target.copy(head.getWorldPosition(head.position.clone()));
        preview.orbit.target.y -= .025; preview.orbit.dist = .62; preview.orbit.yaw = Math.PI * .75; preview.orbit.pitch = 0;
        document.querySelector('#edRoot').style.display = 'none';
        return { count: clearances.length, minMm: Math.min(...clearances), negative: clearances.filter(value => value < 0).length,
          bones: preview.hair.braidSkin.bones.map(bone => bone.name) };
      }, { duration, fraction });
      assert.ok(result.count >= 30, `${file} ${fraction}: enough braid-to-coat samples (${JSON.stringify(result)})`);
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
  // Translate and turn the same paused character, then stop. Compare the
  // actual drawn tip ring with the rigid pose at three different frame rates.
  const motion = await page.evaluate(async () => {
    const T = await import('three'), {character, hair, camera, renderer} = window.__preview;
    const dynamics = hair.braidDynamics, skin = hair.braidSkin, rest = dynamics.rest.at(-1);
    const start = character.position.clone(), yaw = character.rotation.y;
    const offset = new T.Vector3(), sample = new T.Vector3();
    const result = [];
    for (const fps of [30, 60, 120]) {
      character.position.copy(start); character.rotation.y = yaw;
      const update = dt => { character.updateMatrixWorld(true); hair.Update(dt, camera, renderer); };
      const tipOffset = () => {
        const rigid = sample.copy(dynamics.goals.at(-1));
        return offset.copy(rest).applyMatrix4(skin.uniforms.uBeardBones.value[3]).applyMatrix4(hair.root.matrixWorld).sub(rigid);
      };
      update(.5); // discontinuous seek
      for (let frame = 0; frame < fps; frame++) update(1 / fps);
      const neutral = tipOffset().clone();
      let maxLag = 0, afterStop = 0, maxStretch = 0, rootError = 0;
      for (let frame = 0; frame < fps * 3; frame++) {
        const t = Math.min((frame + 1) / fps, .5);
        character.position.x = start.x + t * .9;
        character.rotation.y = yaw + t * .8;
        update(1 / fps);
        const lag = tipOffset().distanceTo(neutral);
        if (frame < fps * .5) maxLag = Math.max(maxLag, lag);
        if (frame === Math.floor(fps * .5)) afterStop = lag;
        for (let i = 1; i < dynamics.positions.length; i++) {
          maxStretch = Math.max(maxStretch, Math.abs(dynamics.positions[i].distanceTo(dynamics.positions[i-1])
            - dynamics.rest[i].clone().applyMatrix4(hair.root.matrixWorld).distanceTo(dynamics.rest[i-1].clone().applyMatrix4(hair.root.matrixWorld))));
        }
        rootError = Math.max(rootError, dynamics.positions[0].distanceTo(dynamics.goals[0]));
      }
      const settled = tipOffset().clone();
      for (let frame = 0; frame < fps; frame++) update(1 / fps);
      const residual = settled.distanceTo(tipOffset());
      character.position.x += 4;
      update(1 / fps);
      result.push({fps, maxLag, afterStop, maxStretch, rootError, residual, teleportError:tipOffset().length(),
        settled: settled.toArray()});
    }
    character.position.copy(start); character.rotation.y = yaw; character.updateMatrixWorld(true); hair.Update(0,camera,renderer);
    return result;
  });
  for (const sample of motion) {
    assert.ok(sample.maxLag > .008 && sample.afterStop > .005, `tip has visible inertia across start and stop: ${JSON.stringify(sample)}`);
    assert.ok(sample.rootError < 1e-6 && sample.maxStretch < .001, 'root remains pinned and links keep their lengths');
    assert.ok(sample.residual < .0005 && sample.teleportError < .00001, 'motion settles and teleports reset the chain');
    assert.ok(Math.abs(sample.maxLag - motion[0].maxLag) < .006, 'comparable tip swing at 30, 60 and 120 FPS');
  }
  assert.deepEqual(errors, []); assert.deepEqual(failedRequests, []);
  fs.writeFileSync(path.join(output, 'Data_NierBraidReview.json'), `${JSON.stringify({ results, motion, errors, failedRequests }, null, 2)}\n`);
  console.log('NierBraidBrowserTest ok', results.length, 'poses', `min ${Math.min(...results.map(row => row.minMm)).toFixed(2)} mm`);
} finally {
  await browser.close();
  if (server) await new Promise(resolve => server.close(resolve));
}
