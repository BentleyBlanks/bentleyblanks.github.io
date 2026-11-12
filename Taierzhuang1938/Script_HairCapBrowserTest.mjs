// Actual Mixamo idle rendering: the cap must meet Luo's short hair without a visible bald strip.
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
const output = path.join(root, 'tmp', 'HairCap');
fs.mkdirSync(output, { recursive: true });
const errors = [], failedRequests = [], measurements = [];
page.on('pageerror', error => errors.push(String(error)));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
page.on('response', response => { if (response.status() >= 400) failedRequests.push(`${response.status()} ${response.url()}`); });

function SkinFraction(data, info, [x0, x1, y0, y1]) {
  let skin = 0, count = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const offset = (y * info.width + x) * info.channels;
    const r = data[offset], g = data[offset + 1], b = data[offset + 2];
    if (r > 75 && r > g * 1.17 && g > b * 1.08 && r - b > 20) skin++;
    count++;
  }
  return skin / count;
}
try {
  await page.goto(`${base}/Taierzhuang1938/AdvancedTools/Tool_MixamoAnimationPreview.html?who=luo`, { waitUntil: 'load', timeout: 180000 });
  await page.waitForFunction(() => window.__preview?.hair?.asset.id === 'Game_SquadLeaderLuo' && window.__preview?.action, null, { timeout: 180000 });
  await page.evaluate(() => window.__preview.SelectFile('Animation_Mixamo_Idle_V1.glb'));
  for (const [view, yaw, region, ceiling] of [
    ['right', Math.PI / 2, [330, 390, 65, 115], .45],
    ['back', Math.PI, [255, 385, 98, 122], .06],
  ]) {
    await page.evaluate(yaw => {
      const preview = window.__preview, scrub = document.querySelector('#scrub');
      scrub.value = 0; scrub.dispatchEvent(new Event('input', { bubbles: true }));
      preview.character.updateMatrixWorld(true);
      preview.hair.SetLod('strands'); preview.hair.Update(1, preview.camera, preview.renderer);
      const head = preview.character.getObjectByName('Head');
      preview.orbit.target.copy(head.getWorldPosition(head.position.clone()));
      preview.orbit.target.y -= .025; preview.orbit.dist = .62; preview.orbit.yaw = yaw; preview.orbit.pitch = 0;
      document.querySelector('#edRoot').style.display = 'none';
    }, yaw);
    await page.waitForTimeout(200);
    const file = path.join(output, `Luo_${view}.jpg`);
    await sharp(await page.screenshot()).resize({ width: 640, height: 640, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 82 }).toFile(file);
    const { data, info } = await sharp(file).raw().toBuffer({ resolveWithObject: true });
    const skinFraction = SkinFraction(data, info, region);
    measurements.push({ view, skinFraction, ceiling, region });
    assert.ok(skinFraction < ceiling, `${view} cap seam exposes too much bald skin (${skinFraction.toFixed(3)} >= ${ceiling})`);
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(failedRequests, []);
  fs.writeFileSync(path.join(output, 'Data_HairCapReview.json'), `${JSON.stringify({ measurements, errors, failedRequests }, null, 2)}\n`);
  console.log('HairCapBrowserTest ok', measurements.map(row => `${row.view}:${row.skinFraction.toFixed(3)}`).join(' '));
} finally {
  await browser.close();
  if (server) await new Promise(resolve => server.close(resolve));
}
