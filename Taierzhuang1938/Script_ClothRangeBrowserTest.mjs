// Production high-quality cloth lab: live UI controls, independent instances,
// real poses, contacts and automatic skinned motion history. All audio is muted.
// Full-size evidence stays in ignored tmp; model-facing previews are <=640 px.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { LaunchBrowser } from '../PrairieFire1937/Script_BrowserTestKit.mjs';
import { ServeRoot } from './Script_DevServer.mjs';
import { CLOTH_LAB_ASSETS, CLOTH_LAB_PRESETS, CLOTH_LAB_CONTROLS } from './Data_Tuning_ClothRange.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(here, '..', 'tmp', 'ClothRange');
fs.mkdirSync(out, { recursive: true });
const server = process.env.CLOTH_PREVIEW ? null : await ServeRoot(path.resolve(here, '..'), 0);
const browser = await LaunchBrowser({ extraArgs: ['--mute-audio'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [], result = {};
page.on('pageerror', error => { errors.push(String(error)); console.log('PAGE ERROR', String(error)); });
page.on('console', message => { if (message.type() === 'error') { errors.push(message.text()); console.log('CONSOLE ERROR', message.text().slice(0, 300)); } });
await page.addInitScript(() => {
  localStorage.setItem('tengxian1938_audio_v1', JSON.stringify({ master: 0 }));
  localStorage.setItem('tengxian1938_tools_volume_v1', JSON.stringify({ volume: 0, muted: true }));
});
const State = () => page.evaluate(() => window.Taierzhuang.Debug.ClothRange.State());
const Item = (state, id) => state.items.find(item => item.id === id);
async function Advance(count, render = false) {
  return page.evaluate(({ count, render }) => {
    const t = window.Taierzhuang, api = t.Debug.ClothRange;
    let remaining = count;
    while (remaining > 0) {
      const n = Math.min(120, remaining); api.Step(n);
      t.StepFrames(Math.ceil(n / 4), 1 / 60, render); remaining -= n;
    }
    return api.State();
  }, { count, render });
}
async function Shot(name) {
  await page.evaluate(() => window.Taierzhuang.StepFrames(2, 1 / 60, true));
  const bytes = await page.screenshot();
  fs.writeFileSync(path.join(out, `Scene_${name}.png`), bytes);
  await sharp(bytes).resize({ width: 640, height: 640, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 82 }).toFile(path.join(out, `Scene_${name}_640.jpg`));
}
function Healthy(state, label) {
  assert.ok(state.ready && !state.error, `${label}: ${state.error}`);
  for (const item of state.items) {
    assert.ok(item.finite && Number.isFinite(item.poseChecksum), `${label} ${item.id}: finite cloth`);
    assert.ok(item.stats.lowM >= -1e-4 && item.stats.maxStretch < 1.8, `${label} ${item.id}: contact/stretch ${JSON.stringify(item.stats)}`);
    assert.ok(item.pins.every(pin => Number.isFinite(pin.gapM)), `${label} ${item.id}: finite pin distances`);
  }
}

try {
  const base = process.env.CLOTH_PREVIEW || `http://127.0.0.1:${server.address().port}`;
  await page.goto(`${base}/Taierzhuang1938/?cloth=1&shot=1&manual=1&quality=high&scale=small`, { timeout: 180000 });
  await page.waitForFunction(() => window.Taierzhuang?.state.ready && window.Taierzhuang.Debug.ClothRange, null, { timeout: 300000 });
  await page.waitForFunction(() => {
    const state = window.Taierzhuang.Debug.ClothRange.State(); return state.ready || state.error;
  }, null, { timeout: 180000 });
  result.boot = await page.evaluate(() => {
    const t = window.Taierzhuang, api = t.Debug.ClothRange;
    t.state.menu = false; api.Pause(true); t.StepFrames(3, 1 / 60, true);
    return { level: t.Debug.Level().id, state: api.State(),
      panel: { visible: !document.getElementById('cloth-range-panel')?.hidden,
        title: document.querySelector('#cloth-range-panel h2')?.textContent,
        samples: document.querySelectorAll('[data-cloth-select]').length,
        controls: document.querySelectorAll('[data-cloth-param]').length,
        presets: document.querySelectorAll('[data-cloth-preset] option:not([disabled])').length },
      audio: JSON.parse(localStorage.getItem('tengxian1938_audio_v1')).master };
  });
  assert.equal(result.boot.level, 'ClothRange');
  Healthy(result.boot.state, 'boot');
  assert.deepEqual(result.boot.state.items.map(item => item.id), CLOTH_LAB_ASSETS.map(item => item.id));
  assert.ok(result.boot.state.items.every(item => item.points === 216 && item.skinnedCount > 0 && item.materialCount >= 3));
  assert.equal(result.boot.panel.samples, 3); assert.equal(result.boot.panel.controls, CLOTH_LAB_CONTROLS.length);
  assert.equal(result.boot.panel.presets, Object.keys(CLOTH_LAB_PRESETS).length);
  assert.ok(result.boot.panel.visible && result.boot.panel.title.includes('布料')); assert.equal(result.boot.audio, 0);
  console.log('PASS cloth scene / panel / embedded skinned assets');

  const stopped = await State();
  await page.evaluate(() => window.Taierzhuang.StepFrames(30, 1 / 60, false));
  const still = await State();
  assert.equal(still.clock, stopped.clock);
  assert.deepEqual(still.items.map(item => item.poseChecksum), stopped.items.map(item => item.poseChecksum), 'Pause freezes every cloth instance');
  result.singleStep = await Advance(1);
  assert.ok(result.singleStep.paused && Math.abs(result.singleStep.clock - still.clock - 1 / 60) < 1e-6, 'Step advances exactly one fixed simulation frame');
  console.log('PASS pause / deterministic single step');

  // Operate actual UI elements for selection, range editing and presets.
  await page.locator('[data-cloth-select="curtain"]').click();
  const beforeEdit = await State();
  await page.locator('[data-cloth-param="bend"]').evaluate(input => { input.value = '.22'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  const afterEdit = await State();
  assert.equal(afterEdit.selected, 'curtain'); assert.equal(Item(afterEdit, 'curtain').cfg.bend, .22);
  assert.equal(Item(afterEdit, 'curtain').preset, 'custom');
  for (const id of ['quilt', 'banner']) assert.deepEqual(Item(afterEdit, id).cfg, Item(beforeEdit, id).cfg, `${id} is isolated from curtain edits`);
  result.bounds = await page.evaluate(() => {
    const api = window.Taierzhuang.Debug.ClothRange;
    return { low: api.Set('density', -5), high: api.Set('density', 50), nan: api.Set('density', NaN), unknown: api.Set('missing', 1), state: api.State() };
  });
  const density = CLOTH_LAB_CONTROLS.find(control => control.key === 'density');
  assert.equal(result.bounds.low, density.min); assert.equal(result.bounds.high, density.max);
  assert.equal(result.bounds.nan, false); assert.equal(result.bounds.unknown, false);
  await page.locator('[data-cloth-preset]').selectOption('curtain');
  assert.deepEqual(Item(await State(), 'curtain').cfg, CLOTH_LAB_PRESETS.curtain);
  await page.locator('[data-cloth-select="quilt"]').click();
  for (const [id, cfg] of Object.entries(CLOTH_LAB_PRESETS)) {
    await page.locator('[data-cloth-preset]').selectOption(id);
    assert.deepEqual(Item(await State(), 'quilt').cfg, cfg, `Visible preset ${id} applies its full private profile`);
  }
  await page.locator('[data-cloth-preset]').selectOption('quilt');
  result.thickness = await page.evaluate(() => {
    const t = window.Taierzhuang, api = t.Debug.ClothRange;
    const span = () => { let low = Infinity, high = -Infinity;
      t.scene.getObjectByName('ClothLab_quilt').traverse(object => { if (!object.isSkinnedMesh) return;
        const p = object.geometry.attributes.position; for (let i = 0; i < p.count; i++) { low = Math.min(low, p.getY(i)); high = Math.max(high, p.getY(i)); } });
      return high - low; };
    const a = span(); api.Set('thickness', .04); const b = span(); api.Preset('quilt'); return { a, b, restored: span() };
  });
  assert.ok(Math.abs(result.thickness.b / result.thickness.a - .5) < 1e-5, 'Thickness control changes real shell geometry');
  assert.ok(Math.abs(result.thickness.restored - result.thickness.a) < 1e-6);
  result.tangentFrames = await page.evaluate(() => {
    const t = window.Taierzhuang, api = t.Debug.ClothRange, reports = [];
    for (const id of ['quilt', 'curtain', 'banner']) {
      api.Select(id); api.Set('thickness', .12);
      t.scene.getObjectByName(`ClothLab_${id}`).traverse(object => {
        if (!object.isSkinnedMesh) return;
        const { normal, tangent } = object.geometry.attributes;
        let maxDot = 0, minLength = Infinity;
        for (let i = 0; i < normal.count; i++) {
          maxDot = Math.max(maxDot, Math.abs(normal.getX(i) * tangent.getX(i) + normal.getY(i) * tangent.getY(i) + normal.getZ(i) * tangent.getZ(i)));
          minLength = Math.min(minLength, Math.hypot(tangent.getX(i), tangent.getY(i), tangent.getZ(i)));
        }
        reports.push({ id, material: object.material.name, maxDot, minLength });
      });
      api.Preset(id);
    }
    api.Select('quilt'); return reports;
  });
  assert.ok(result.tangentFrames.length === 9 && result.tangentFrames.every(row => row.maxDot < .003 && row.minLength > .999), JSON.stringify(result.tangentFrames));
  console.log('PASS UI selection / parameter bounds / five profiles / private shell thickness');

  await page.evaluate(() => { const api = window.Taierzhuang.Debug.ClothRange; api.Action('drape'); api.Reset(); });
  result.drape = await Advance(180); Healthy(result.drape, 'drape');
  assert.equal(Item(result.drape, 'quilt').pins.length, 0);
  assert.ok(Item(result.drape, 'quilt').stats.topM > .35, 'Quilt is supported above the body proxy');
  await Shot('QuiltDrape');
  await page.locator('[data-cloth-action="lift"]').click();
  result.lift = await Advance(180); Healthy(result.lift, 'lift');
  assert.equal(Item(result.lift, 'quilt').pins.length, 2);
  assert.ok(Item(result.lift, 'quilt').pins.every(pin => pin.gapM < 1e-4), 'Both quilt corners reach the grips');
  assert.notEqual(Item(result.lift, 'quilt').poseChecksum, Item(result.drape, 'quilt').poseChecksum);
  await page.locator('[data-cloth-action="drop"]').click();
  result.drop = await Advance(240); Healthy(result.drop, 'drop');
  assert.equal(Item(result.drop, 'quilt').pins.length, 0);
  assert.ok(Item(result.drop, 'quilt').stats.topM < .25, 'Released quilt settles back onto the floor');
  console.log('PASS quilt body drape / grip / release');

  await page.locator('[data-cloth-select="curtain"]').click();
  await page.evaluate(() => { const api = window.Taierzhuang.Debug.ClothRange; api.Preset('curtain'); api.Set('wind', 0); api.Reset(); });
  const curtainRest = await Advance(120);
  await page.locator('[data-cloth-action="push"]').click();
  result.push = await Advance(72); Healthy(result.push, 'curtain push');
  assert.notEqual(Item(result.push, 'curtain').poseChecksum, Item(curtainRest, 'curtain').poseChecksum, 'Real contact displaces the curtain');
  assert.equal(Item(result.push, 'curtain').pins.length, 12);
  assert.ok(Item(result.push, 'curtain').pins.every(pin => pin.gapM < 1e-4));
  await Shot('CurtainPush');
  await Advance(180);
  const Replay = async () => {
    await page.evaluate(() => window.Taierzhuang.Debug.ClothRange.Reset());
    return Item(await Advance(120), 'curtain').poseChecksum;
  };
  assert.equal(await Replay(), await Replay(), 'Calm reset and equal fixed steps reproduce the same cloth pose');
  console.log('PASS curtain contact / 12 header pins / reproducible reset');

  await page.locator('[data-cloth-select="banner"]').click();
  await page.evaluate(() => { const api = window.Taierzhuang.Debug.ClothRange; api.Set('wind', 0); api.Reset(); });
  const bannerRest = await Advance(120);
  await page.locator('[data-cloth-action="gust"]').click();
  result.gust = await Advance(60); Healthy(result.gust, 'banner gust');
  assert.notEqual(Item(result.gust, 'banner').poseChecksum, Item(bannerRest, 'banner').poseChecksum);
  assert.equal(Item(result.gust, 'banner').cfg.wind, 0, 'Temporary gust does not overwrite the wind setting');
  assert.ok(Item(result.gust, 'banner').pins.length === 12 && Item(result.gust, 'banner').pins.every(pin => pin.gapM < 1e-4));
  await Shot('BannerGust');
  console.log('PASS banner gust / pin attachment');

  // Actual visible imported meshes must be included in the production high-
  // quality prepass. The independent MotionVectorContractTest checks RT1 pixels;
  // this asset test checks that these meshes actually reach that implementation.
  result.motion = await page.evaluate(() => {
    const t = window.Taierzhuang, api = t.Debug.ClothRange;
    api.Set('wind', 4); api.Pause(false); t.StepFrames(4, 1 / 60, true);
    const cloth = t.scene.getObjectByName('ClothLab_banner'), meshes = [];
    cloth.traverse(object => { if (object.isSkinnedMesh) meshes.push(object); });
    const before = meshes.map(mesh => Array.from(mesh.skeleton.boneMatrices));
    t.StepFrames(12, 1 / 60, true); api.Pause(true);
    const pass = t.post.prepassPass;
    return { velocityEnabled: pass.velocityEnabled, meshes: meshes.map((mesh, index) => {
      const skeleton = mesh.skeleton, image = skeleton.boneTexture?.image, history = pass._objectHistory.get(mesh);
      const delta = Math.max(...skeleton.boneMatrices.map((value, i) => Math.abs(value - before[index][i])));
      return { name: mesh.name, delta, packed: skeleton.boneTexture?.name === 'boneTextureWithPrev'
        && image.height === image.width * 2 && skeleton.userData.prevBoneOffset > 0,
        upgraded: pass._upgraded.has(skeleton), drawn: history?.frame === pass._velocityFrame,
        sameSkeleton: history?.skeleton === skeleton, foreground: !!mesh.userData.foregroundPrepass,
        skipped: !!mesh.userData.skipNormalDepth };
    }) };
  });
  assert.ok(result.motion.velocityEnabled && result.motion.meshes.length > 0);
  assert.ok(result.motion.meshes.every(mesh => mesh.delta > 1e-5 && mesh.packed && mesh.upgraded && mesh.drawn
    && mesh.sameSkeleton && !mesh.foreground && !mesh.skipped), JSON.stringify(result.motion));
  console.log('PASS actual high-quality skinned meshes update the production motion history');

  result.export = await page.evaluate(() => {
    const api = window.Taierzhuang.Debug.ClothRange, value = api.Export();
    const snapshot = structuredClone(value), before = api.State(); value.items[0].parameters.bend = 99;
    return { value: snapshot, isolated: api.State().items[0].cfg.bend === before.items[0].cfg.bend };
  });
  assert.equal(result.export.value.scope, 'ClothRangeOnly'); assert.equal(result.export.value.items.length, 3);
  assert.ok(result.export.isolated, 'Export contains detached values');
  await page.evaluate(() => { const api = window.Taierzhuang.Debug.ClothRange; api.Select('quilt'); api.Preset('quilt'); api.Action('drape'); });
  await Advance(180);
  const cameraBefore = await page.evaluate(() => window.Taierzhuang.camera.position.toArray());
  await page.evaluate(() => window.Taierzhuang.Debug.ClothRange.Camera('overview'));
  const cameraAfter = await page.evaluate(() => window.Taierzhuang.camera.position.toArray());
  assert.ok(cameraAfter.every(Number.isFinite) && cameraAfter.some((value, i) => Math.abs(value - cameraBefore[i]) > .5));
  await page.locator('#cloth-range-toggle').click();
  assert.equal(await page.locator('#cloth-range-panel').isVisible(), false);
  await page.locator('#cloth-range-toggle').click();
  assert.equal(await page.locator('#cloth-range-panel').isVisible(), true);
  await Shot('Overview');
  result.final = await State(); Healthy(result.final, 'final');
  // Exercise the actual boot button and rAF path as well as the deterministic probe.
  await page.goto(`${base}/Taierzhuang1938/?cloth=1&quality=high&scale=small`, { timeout: 180000 });
  await page.waitForFunction(() => window.Taierzhuang?.state.ready && window.Taierzhuang.Debug.ClothRange?.State().ready, null, { timeout: 300000 });
  await page.locator('#bootStart').click();
  await page.waitForFunction(() => window.Taierzhuang.state.running && window.Taierzhuang.Debug.ClothRange.State().clock > .2, null, { timeout: 30000 });
  const orbitBefore = await page.evaluate(() => window.Taierzhuang.camera.position.toArray());
  await page.mouse.move(1050, 450); await page.mouse.down(); await page.mouse.move(1140, 490, { steps: 8 }); await page.mouse.up();
  const orbitAfter = await page.evaluate(() => window.Taierzhuang.camera.position.toArray());
  assert.ok(orbitAfter.some((value, i) => Math.abs(value - orbitBefore[i]) > .1), 'Normal pointer drag orbits the camera without pointer lock');
  assert.equal(await page.evaluate(() => document.pointerLockElement), null);
  await page.locator('[data-cloth-action="pause"]').click();
  const realPaused = await State();
  await page.evaluate(async () => { for (let i = 0; i < 5; i++) await new Promise(resolve => requestAnimationFrame(resolve)); });
  assert.equal((await State()).clock, realPaused.clock, 'Real-time pause freezes the simulation');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.Taierzhuang.menu.open && window.Taierzhuang.menu.mode === 'pause' && !window.Taierzhuang.state.running, null, { timeout: 10000 });
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !window.Taierzhuang.menu.open && window.Taierzhuang.state.running, null, { timeout: 10000 });
  await page.locator('[data-cloth-action="pause"]').click();
  await page.waitForFunction(clock => window.Taierzhuang.Debug.ClothRange.State().clock > clock, realPaused.clock, { timeout: 10000 });
  result.normal = await State(); Healthy(result.normal, 'normal entry');
  console.log('PASS normal boot / rAF / pointer orbit / real-time pause / Esc resume');
  assert.deepEqual(errors, [], `Console errors: ${errors.join(' | ')}`);
  console.log('ClothRangeBrowserTest: all passed');
} finally {
  result.errors = errors;
  fs.writeFileSync(path.join(out, 'Test_Result.json'), JSON.stringify(result, null, 2));
  await browser.close();
  server?.close();
}
