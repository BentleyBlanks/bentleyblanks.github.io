import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {LaunchBrowser} from '../PrairieFire1937/Script_BrowserTestKit.mjs';
import {ServeRoot} from './Script_DevServer.mjs';
import {WEAPON_RANGE_STARTUP} from './Data_WeaponRange.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const url = process.argv.find(value => value.startsWith('--url='))?.slice(6);
const output = path.join(root, 'tmp', 'WeaponRangeStartup');
await fs.mkdir(output, {recursive: true});
const server = url ? null : await ServeRoot(root, 0);
const browser = await LaunchBrowser();
const requests = [], errors = [];
const progress = setInterval(() => console.log('Weapon range startup verification running'), 30000);
try {
  const page = await browser.newPage({viewport: {width: 1280, height: 720}});
  page.on('request', request => requests.push(request.url()));
  page.on('pageerror', error => errors.push(String(error)));
  page.on('console', message => {
    if (message.type() === 'error' && !/fonts\.(googleapis|gstatic)/.test(message.location()?.url || '')) errors.push(message.text());
  });
  await page.addInitScript(() => {
    performance.setResourceTimingBufferSize(10000);
    localStorage.setItem('tengxian1938_audio_v1', JSON.stringify({master: 0}));
    localStorage.setItem('tengxian1938_tools_volume_v1', JSON.stringify({volume: 0, muted: true}));
    // Reproduce the existing player's global whitebox save, not just an empty profile.
    localStorage.setItem('tengxian1938_graphics_profile_v1', JSON.stringify('whitebox'));
  });
  const started = performance.now();
  await page.goto(url || `http://127.0.0.1:${server.address().port}/Taierzhuang1938/?weapons=1`, {waitUntil: 'domcontentloaded'});
  await page.waitForFunction(() => window.Tengxian?.state.ready, null, {timeout: 240000});
  const readyMs = performance.now() - started;
  const before = await page.evaluate(() => ({
    profile: Tengxian.GraphicsProfile.Inspect().profile,
    resources: performance.getEntriesByType('resource').map(r => ({url: r.name, bytes: r.encodedBodySize, duration: r.duration})),
    mesh: Tengxian.actorFactory.meshReport,
    models: [...Tengxian.actorFactory.meshDocs.keys()],
    targets: Tengxian.Debug.WeaponRange.Targets().length,
  }));
  assert.equal(before.profile, 'high');
  assert.equal(before.targets, 40);
  assert.deepEqual(before.mesh.missing, []);
  assert.deepEqual(before.mesh.textureFailures, []);
  assert.equal(before.mesh.characters.loaded, before.mesh.characters.requested);
  assert.ok(!before.models.some(id => /Type89Tank|Type95HaGo|Type97ChiHa|Civilian/.test(id)));
  await page.click('#bootStart');
  await page.waitForFunction(() => Tengxian.audio.sfxReady, null, {timeout: 120000});
  const audio = await page.evaluate(() => ({samples: [...Tengxian.audio.sampleCues],
    errors: Tengxian.audio.sfxErrors, attempts: Tengxian.audio.packAttempts,
    manifest: Object.keys(Tengxian.audio.sfxManifest.cues), policy: Tengxian.audio.assetPolicy}));
  assert.deepEqual(audio.errors, []);
  for (const cue of WEAPON_RANGE_STARTUP.audio.sfx) {
    assert.ok(audio.manifest.includes(cue), `sound exists: ${cue}`);
    assert.ok(audio.samples.includes(cue), `sound decoded after entry: ${cue}`);
  }
  assert.equal(audio.attempts.voice, 0);
  assert.equal(audio.attempts.amb, 0);
  assert.equal(audio.attempts.music, 0);
  // Wait beyond entry so an unconditional background/Unlock path cannot evade the gate.
  await page.waitForTimeout(2000);
  const forbidden = requests.filter(value => /Model_Mitsubishi|Model_BambooStretcher|Model_Cigarette|Model_Type(?:89Tank|95HaGo|97ChiHa)|\/Audio\/(?:Amb|Music|Voice)\/|Texture_(?:Gate|CityWall|Carriage)/.test(value));
  assert.deepEqual(forbidden, []);
  assert.deepEqual(errors, []);
  assert.equal(await page.evaluate(() => Tengxian.renderer.getContext().getError()), 0);
  await page.screenshot({path: path.join(output, url ? 'Scene_Published.png' : 'Scene_Source.png')});
  const report = {url: page.url(), readyMs, bytesAtReady: before.resources.reduce((n, r) => n + r.bytes, 0),
    requestsAtReady: before.resources.length, before, audio, requests, errors};
  await fs.writeFile(path.join(output, url ? 'Data_Published.json' : 'Data_Source.json'), JSON.stringify(report, null, 2));
  console.log(`PASS weapon startup: ${Math.round(readyMs)} ms, ${before.resources.length} resources, normal profile, 40 targets, ${audio.samples.length} decoded sounds; no campaign assets before/after entry`);
} finally {
  clearInterval(progress);
  await browser.close();
  if (server) await new Promise(resolve => server.close(resolve));
}
