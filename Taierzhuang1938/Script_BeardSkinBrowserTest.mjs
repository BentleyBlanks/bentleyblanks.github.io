// The game beard must stay on the skinned face through idle and head turns, not merely inherit Head's transform.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { LaunchBrowser } from '../PrairieFire1937/Script_BrowserTestKit.mjs';
import { ServeRoot } from './Script_DevServer.mjs';

const root = path.resolve(import.meta.dirname, '..');
const server = process.env.HAIR_PREVIEW ? null : await ServeRoot(root, 0);
const base = process.env.HAIR_PREVIEW || `http://127.0.0.1:${server.address().port}`;
const browser = await LaunchBrowser({ extraArgs: ['--mute-audio'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const out = path.join(root, 'tmp', 'BeardSkin');
fs.mkdirSync(out, { recursive: true });
const errors = [], failedRequests = [], measurements = [];
page.on('pageerror', error => errors.push(String(error)));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
page.on('response', response => { if (response.status() >= 400) failedRequests.push(`${response.status()} ${response.url()}`); });
try {
  await page.goto(`${base}/Taierzhuang1938/Tool_MixamoAnimationPreview.html?who=luo`, { waitUntil: 'load', timeout: 180000 });
  await page.waitForFunction(() => window.__preview?.hair?.beardSkin && window.__preview?.action, null, { timeout: 180000 });
  for (const clip of ['Animation_Mixamo_Idle_V1.glb', 'Animation_Mixamo_LookingAround_V2.glb']) {
    await page.evaluate(file => window.__preview.SelectFile(file), clip);
    const duration = await page.evaluate(() => window.__preview.action.getClip().duration);
    for (const [frame, fraction] of [0, .25, .5, .75].entries()) {
      const result = await page.evaluate(time => {
        const preview = window.__preview, scrub = document.querySelector('#scrub');
        scrub.value = time;
        scrub.dispatchEvent(new Event('input', { bubbles: true }));
        preview.character.updateMatrixWorld(true);
        preview.hair.Update(0, preview.camera, preview.renderer);
        const face = preview.character.getObjectByName('SquadLeaderLuo');
        const stubble = preview.hair.meshes.stubble;
        const pos = stubble.geometry.attributes.position;
        const indices = stubble.geometry.attributes.aBoneIndices;
        const weights = stubble.geometry.attributes.aBoneWeights;
        const matrices = preview.hair.beardSkin.uniforms.uBeardBones.value;
        const V = face.position.constructor, beardPoints = [];
        const lo = new V(Infinity, Infinity, Infinity), hi = new V(-Infinity, -Infinity, -Infinity);
        for (let i = 0; i < pos.count; i++) {
          const bind = new V().fromBufferAttribute(pos, i), world = new V();
          for (let k = 0; k < 4; k++) world.addScaledVector(bind.clone().applyMatrix4(matrices[indices.getComponent(i, k)]), weights.getComponent(i, k));
          world.applyMatrix4(stubble.matrixWorld);
          beardPoints.push(world); lo.min(world); hi.max(world);
        }
        lo.addScalar(-.03); hi.addScalar(.03);
        const grid = new Map(), cell = .01;
        const floor = value => Math.floor(value / cell);
        const key = (x, y, z) => `${x},${y},${z}`;
        const facePos = face.geometry.attributes.position, faceNormal = face.geometry.attributes.normal;
        for (let i = 0; i < facePos.count; i++) {
          const bind = new V().fromBufferAttribute(facePos, i);
          const world = face.applyBoneTransform(i, bind.clone()).applyMatrix4(face.matrixWorld);
          if (world.x < lo.x || world.x > hi.x || world.y < lo.y || world.y > hi.y || world.z < lo.z || world.z > hi.z) continue;
          const tip = bind.clone().addScaledVector(new V().fromBufferAttribute(faceNormal, i), .001);
          const normal = face.applyBoneTransform(i, tip).applyMatrix4(face.matrixWorld).sub(world).normalize();
          const id = key(floor(world.x), floor(world.y), floor(world.z));
          if (!grid.has(id)) grid.set(id, []);
          grid.get(id).push({ world, normal });
        }
        const distances = [], clearances = [];
        for (const point of beardPoints) {
          const x = floor(point.x), y = floor(point.y), z = floor(point.z);
          let nearest = null, best = Infinity;
          for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) for (let dz = -2; dz <= 2; dz++)
            for (const candidate of grid.get(key(x + dx, y + dy, z + dz)) || []) {
              const distance = candidate.world.distanceToSquared(point);
              if (distance < best) { best = distance; nearest = candidate; }
            }
          if (nearest) {
            distances.push(Math.sqrt(best) * 1000);
            clearances.push(point.clone().sub(nearest.world).dot(nearest.normal) * 1000);
          }
        }
        distances.sort((a, b) => a - b); clearances.sort((a, b) => a - b);
        const percentile = (values, fraction) => values[Math.floor((values.length - 1) * fraction)];
        const head = preview.character.getObjectByName('Head');
        preview.orbit.target.copy(head.getWorldPosition(head.position.clone()));
        preview.orbit.target.y -= .055; preview.orbit.dist = .64; preview.orbit.yaw = 0; preview.orbit.pitch = .03;
        document.querySelector('#edRoot').style.display = 'none';
        return { time, samples: distances.length, vertices: beardPoints.length,
          distanceP95Mm: percentile(distances, .95), clearanceP05Mm: percentile(clearances, .05),
          clearanceP95Mm: percentile(clearances, .95) };
      }, duration * fraction);
      assert.equal(result.samples, result.vertices, `${clip} ${frame}: every beard vertex found its face`);
      assert.ok(result.distanceP95Mm < .8 && result.clearanceP05Mm > .15 && result.clearanceP95Mm < .8,
        `${clip} ${frame}: beard follows facial skin without crossing it (${JSON.stringify(result)})`);
      measurements.push({ clip, frame, ...result });
      if (frame === 1) {
        await page.waitForTimeout(150);
        await sharp(await page.screenshot()).resize({ width: 640, height: 640, fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 82 }).toFile(path.join(out, `${clip.replace('.glb', '')}.jpg`));
      }
    }
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(failedRequests, []);
  fs.writeFileSync(path.join(out, 'Data_BeardSkinReview.json'), `${JSON.stringify({ measurements, errors, failedRequests }, null, 2)}\n`);
  console.log('BeardSkinBrowserTest ok', measurements.map(row => `${row.clip}:${row.frame}=${row.distanceP95Mm.toFixed(2)}mm`).join(' '));
} finally {
  await browser.close();
  if (server) await new Promise(resolve => server.close(resolve));
}
