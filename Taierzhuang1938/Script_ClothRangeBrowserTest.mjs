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
import { CLOTH_LAB_ASSETS, CLOTH_LAB_PRESETS, CLOTH_LAB_CONTROLS, CLOTH_LAB_SIM } from './Data_Tuning_ClothRange.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const sampleIds = CLOTH_LAB_ASSETS.map(spec => spec.id);
const materialSampleIds = ['muslin', 'silk', 'canvas', 'wool'];
const out = path.resolve(here, '..', 'tmp', 'ClothRange');
fs.mkdirSync(out, { recursive: true });
const server = process.env.CLOTH_PREVIEW ? null : await ServeRoot(path.resolve(here, '..'), 0);
const browser = await LaunchBrowser({ extraArgs: ['--mute-audio'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [], result = {}, sourceRequests = new Map();
page.on('request', request => {
  const file = /\/Model\/ClothLab\/(Model_[^/?]+\.glb)/.exec(request.url())?.[1];
  if (file && request.method() === 'GET') sourceRequests.set(file, (sourceRequests.get(file) || 0) + 1);
});
page.on('pageerror', error => { errors.push(String(error)); console.log('PAGE ERROR', String(error)); });
page.on('console', message => { if (message.type() === 'error') { errors.push(message.text()); console.log('CONSOLE ERROR', message.text().slice(0, 300)); } });
// 旧存档里残留的 "whitebox" 画质与白盒配置（2026-10-31 起没有白盒档）：当没存，回默认档；旧键原样留着、不迁移
const savedProfile = JSON.stringify('whitebox');
const savedWhitebox = JSON.stringify({ schema: 2, assetTextures: false, grid: true, gridSize: 2, surfaceColor: '#909397' });
await page.addInitScript(({ savedProfile, savedWhitebox }) => {
  localStorage.setItem('tengxian1938_audio_v1', JSON.stringify({ master: 0 }));
  localStorage.setItem('tengxian1938_tools_volume_v1', JSON.stringify({ volume: 0, muted: true }));
  localStorage.setItem('tengxian1938_graphics_profile_v1', savedProfile);
  localStorage.setItem('tengxian1938_whitebox_v1', savedWhitebox);
}, { savedProfile, savedWhitebox });
const State = () => page.evaluate(() => window.Taierzhuang.Debug.ClothRange.State());
const Item = (state, id) => state.items.find(item => item.id === id);
async function Advance(count, render = false) {
  return page.evaluate(({ count, render, maxSteps }) => {
    const t = window.Taierzhuang, api = t.Debug.ClothRange;
    let remaining = count;
    while (remaining > 0) {
      const n = Math.min(120, remaining); api.Step(n);
      t.StepFrames(Math.ceil(n / maxSteps), 1 / 60, render); remaining -= n;
    }
    return api.State();
  }, { count, render, maxSteps: CLOTH_LAB_SIM.maxSteps });
}
const Detail = () => page.evaluate(() => {
  const t = window.Taierzhuang, state = t.Debug.ClothRange.State();
  return { ...state, geometry: state.items.map(item => {
    let low = Infinity, high = -Infinity;
    t.scene.getObjectByName(`ClothLab_${item.id}`).traverse(object => {
      if (!object.isSkinnedMesh) return;
      const p = object.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) { low = Math.min(low, p.getY(i)); high = Math.max(high, p.getY(i)); }
    });
    return { id: item.id, spanY: high - low };
  }) };
});
async function Drag(key, target) {
  const locator = page.locator(`[data-cloth-param="${key}"]`);
  await locator.scrollIntoViewIfNeeded();
  const control = await locator.evaluate(input => ({ min: +input.min, max: +input.max, value: +input.value, step: +input.step }));
  const box = await locator.boundingBox(); assert.ok(box && box.width > 80, `${key}: visible native range`);
  const inset = 8, span = box.width - inset * 2;
  const At = value => box.x + inset + (value - control.min) / (control.max - control.min) * span;
  const before = await Detail();
  await page.mouse.move(At(control.value), box.y + box.height / 2); await page.mouse.down();
  await page.mouse.move(At(target), box.y + box.height / 2, { steps: 16 }); await page.mouse.up();
  const after = await Detail(), id = after.selected;
  assert.equal(id, before.selected);
  assert.ok(Math.abs(Item(after, id).cfg[key] - target) <= control.step * 2 + 1e-8,
    `${id} ${key}: real mouse drag reaches ${target}; got ${Item(after, id).cfg[key]}`);
  const value = await locator.inputValue(); assert.equal(+value, Item(after, id).cfg[key], `${id} ${key}: range and solver configuration agree`);
  for (const other of before.items.filter(item => item.id !== id)) {
    assert.deepEqual(Item(after, other.id).cfg, other.cfg, `${id} ${key}: ${other.id} parameters stay private`);
    if (before.paused) assert.equal(Item(after, other.id).poseChecksum, other.poseChecksum, `${id} ${key}: paused ${other.id} pose is unchanged`);
  }
  (result.nativeEdits ||= []).push({ id, key, target, value: +value, before, after });
  return { before, after };
}
async function DrawMaterials(wireframe) {
  return page.evaluate(wireframe => {
    const t = window.Taierzhuang, api = t.Debug.ClothRange, records = [], restore = [];
    api.Pause(true); api.Wireframe(wireframe);
    t.scene.getObjectByName('ClothRangeSamples').traverse(object => {
      if (!object.isSkinnedMesh) return;
      const original = object.onBeforeRender;
      object.onBeforeRender = function (renderer, scene, camera, geometry, material, group) {
        original?.call(this, renderer, scene, camera, geometry, material, group);
        if (material.isMeshStandardMaterial || material.isMeshPhysicalMaterial)
          records.push({ object: object.name, material: material.name, wireframe: !!material.wireframe, map: !!material.map,
            sample: material.userData?.clothSampleKind || null });
      };
      restore.push(() => { object.onBeforeRender = original; });
    });
    try { t.StepFrames(2, 1 / 60, true); }
    finally { for (const fn of restore) fn(); }
    return records;
  }, wireframe);
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

let releaseBanner = null, bannerRouteFinished = null, bannerRouteStarted = false;
const routeErrors = [];
try {
  const base = process.env.CLOTH_PREVIEW || `http://127.0.0.1:${server.address().port}`;
  const bannerGate = new Promise(resolve => { releaseBanner = resolve; });
  let finishBannerRoute;
  bannerRouteFinished = new Promise(resolve => { finishBannerRoute = resolve; });
  const bannerPattern = '**/Model/ClothLab/Model_SichuanBanner.glb*';
  await page.route(bannerPattern, async route => {
    bannerRouteStarted = true;
    try { await bannerGate; await route.continue(); }
    catch (error) { routeErrors.push(String(error.stack || error)); }
    finally { finishBannerRoute(); }
  }, { times: 1 });
  await page.goto(`${base}/Taierzhuang1938/?cloth=1&shot=1&manual=1&scale=small`, { waitUntil: 'domcontentloaded', timeout: 180000 });
  console.log('BOOT cloth page loaded; awaiting lab host with final asset held');
  await page.waitForFunction(() => window.Taierzhuang?.state.ready && window.Taierzhuang.Debug.ClothRange, null, { timeout: 300000 });
  await page.locator('[data-cloth-select="banner"]').click();
  assert.equal((await State()).selected, 'banner');
  assert.equal((await State()).ready, false, 'Last GLB remains delayed while a user selects the banner');
  assert.ok(bannerRouteStarted, 'The last cloth GLB was actually intercepted');
  releaseBanner(); await bannerRouteFinished;
  assert.deepEqual(routeErrors, [], `Delayed asset route failed: ${routeErrors.join(' | ')}`);
  console.log('BOOT loading-time banner selection recorded; final asset released');
  await page.waitForFunction(() => {
    const state = window.Taierzhuang.Debug.ClothRange.State(); return state.ready || state.error;
  }, null, { timeout: 180000 });
  result.boot = await page.evaluate(() => {
    const t = window.Taierzhuang, api = t.Debug.ClothRange;
    t.state.menu = false; api.Pause(true); t.StepFrames(3, 1 / 60, true);
    return { level: t.Debug.Level().id, state: api.State(), graphics: t.GraphicsProfile.Inspect(), camera: t.camera.position.toArray(),
      savedProfile: localStorage.getItem('tengxian1938_graphics_profile_v1'), savedWhitebox: localStorage.getItem('tengxian1938_whitebox_v1'),
      panel: { visible: !document.getElementById('cloth-range-panel')?.hidden,
        title: document.querySelector('#cloth-range-panel h2')?.textContent,
        samples: document.querySelectorAll('[data-cloth-select]').length,
        controls: document.querySelectorAll('[data-cloth-param]').length,
        presets: document.querySelectorAll('[data-cloth-preset] option:not([disabled])').length },
      audio: JSON.parse(localStorage.getItem('tengxian1938_audio_v1')).master };
  });
  assert.equal(result.boot.level, 'ClothRange');
  assert.equal(result.boot.graphics.profile, 'high', 'Bare cloth URL uses original materials; a legacy saved whitebox profile falls back to the default tier');
  assert.equal(result.boot.graphics.whitebox, undefined, 'Inspect() has no whitebox field any more');
  assert.equal(result.boot.savedProfile, savedProfile); assert.equal(result.boot.savedWhitebox, savedWhitebox);
  assert.equal(result.boot.state.selected, 'banner');
  assert.ok(result.boot.camera[0] > 2, 'Completing the final GLB preserves the selected banner camera');
  Healthy(result.boot.state, 'boot');
  assert.deepEqual(result.boot.state.items.map(item => item.id), CLOTH_LAB_ASSETS.map(item => item.id));
  assert.ok(result.boot.state.items.every(item => item.points === 216 && item.skinnedCount > 0 && item.materialCount >= 3));
  assert.equal(result.boot.panel.samples, sampleIds.length); assert.equal(result.boot.panel.controls, CLOTH_LAB_CONTROLS.length);
  assert.equal(result.boot.panel.presets, Object.keys(CLOTH_LAB_PRESETS).length);
  assert.ok(result.boot.panel.visible && result.boot.panel.title.includes('布料')); assert.equal(result.boot.audio, 0);
  const expectedMeshes = result.boot.state.items.reduce((sum, item) => sum + item.skinnedCount, 0);
  result.sourceRequests = Object.fromEntries(sourceRequests);
  assert.equal(sourceRequests.get('Model_SichuanBanner.glb'), 1, 'One banner source request serves the flag and four material samples');
  assert.equal(sourceRequests.size, 3, 'Seven samples load only three source GLBs');
  result.instances = await page.evaluate(({ specs, sampleIds }) => {
    const t = window.Taierzhuang, state = t.Debug.ClothRange.State();
    const allGeometry = [], allPositions = [], allMaterials = [], allSkeletons = [], sampleTextures = [], rows = [];
    const bannerMaps = new Set();
    t.scene.getObjectByName('ClothLab_banner').traverse(object => {
      if (object.isMesh) for (const m of [object.material].flat()) if (m.map) bannerMaps.add(m.map);
    });
    for (const spec of specs) {
      const root = t.scene.getObjectByName(`ClothLab_${spec.id}`), materials = [], skeletons = new Set();
      root.traverse(object => {
        if (!object.isSkinnedMesh) return;
        allGeometry.push(object.geometry); allPositions.push(object.geometry.attributes.position.array);
        skeletons.add(object.skeleton); materials.push(...[object.material].flat());
      });
      allSkeletons.push(...skeletons); allMaterials.push(...materials);
      const ownTextures = new Set(materials.flatMap(material => [material.map, material.normalMap, material.roughnessMap]).filter(Boolean));
      const sample = sampleIds.includes(spec.id);
      if (sample) sampleTextures.push(...ownTextures);
      rows.push({ id: spec.id, root: root.position.toArray(), skeletons: skeletons.size,
        cfgRoughness: state.items.find(item => item.id === spec.id).cfg.roughness,
        materials: materials.map(material => ({ name: material.name, kind: material.userData.clothSampleKind ?? null,
          roughness: material.roughness, sheen: material.sheen ?? 0, anisotropy: material.anisotropy ?? 0,
          map: !!material.map, ownImage: !!material.map?.isDataTexture, inheritedBannerMap: bannerMaps.has(material.map),
          baseColorSpace: material.map?.colorSpace, normalColorSpace: material.normalMap?.colorSpace,
          roughnessColorSpace: material.roughnessMap?.colorSpace })),
        textures: ownTextures.size });
    }
    return { rows, geometryCount: allGeometry.length, privateGeometry: new Set(allGeometry).size,
      privatePositions: new Set(allPositions).size, materialCount: allMaterials.length, privateMaterials: new Set(allMaterials).size,
      privateSkeletons: new Set(allSkeletons).size, sampleTextureCount: sampleTextures.length, privateSampleTextures: new Set(sampleTextures).size };
  }, { specs: CLOTH_LAB_ASSETS, sampleIds: materialSampleIds });
  assert.equal(result.instances.geometryCount, expectedMeshes);
  assert.equal(result.instances.privateGeometry, expectedMeshes); assert.equal(result.instances.privatePositions, expectedMeshes);
  assert.equal(result.instances.privateMaterials, result.instances.materialCount);
  assert.equal(result.instances.privateSkeletons, sampleIds.length);
  assert.equal(result.instances.privateSampleTextures, materialSampleIds.length * 3);
  assert.equal(result.instances.sampleTextureCount, materialSampleIds.length * 3);
  for (const id of materialSampleIds) {
    const row = result.instances.rows.find(item => item.id === id), spec = CLOTH_LAB_ASSETS.find(item => item.id === id);
    assert.ok(Math.abs(row.root[0] - spec.x) < 1e-6 && Math.abs(row.root[2] - spec.z) < 1e-6, `${id}: actual mesh uses the second-row position`);
    assert.ok(row.skeletons === 1 && row.textures === 3 && row.materials.length === 3);
    assert.ok(row.materials.every(material => material.kind === id && material.map && material.ownImage && !material.inheritedBannerMap
      && material.baseColorSpace === 'srgb' && material.normalColorSpace === '' && material.roughnessColorSpace === ''
      && Math.abs(material.roughness - row.cfgRoughness) < 1e-8), `${id}: original sample maps, color spaces and current roughness reach all surfaces`);
  }
  assert.ok(result.instances.rows.find(row => row.id === 'silk').materials.every(material => material.anisotropy > .5));
  assert.ok(result.instances.rows.find(row => row.id === 'wool').materials.every(material => material.sheen > .7));
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
  for (const id of sampleIds.filter(id => id !== 'curtain')) assert.deepEqual(Item(afterEdit, id).cfg, Item(beforeEdit, id).cfg, `${id} is isolated from curtain edits`);
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
  result.tangentFrames = await page.evaluate(ids => {
    const t = window.Taierzhuang, api = t.Debug.ClothRange, reports = [];
    for (const id of ids) {
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
  }, sampleIds);
  assert.ok(result.tangentFrames.length === expectedMeshes && result.tangentFrames.every(row => row.maxDot < .003 && row.minLength > .999), JSON.stringify(result.tangentFrames));
  console.log('PASS UI selection / parameter bounds / five profiles / private shell thickness');

  await page.evaluate(() => window.Taierzhuang.Debug.ClothRange.ShowPanel(false));
  const solidDraw = await DrawMaterials(false), solidImage = await page.screenshot();
  const wireDraw = await DrawMaterials(true), wireImage = await page.screenshot();
  for (const [name, bytes] of [['Solid', solidImage], ['Wire', wireImage]]) {
    fs.writeFileSync(path.join(out, `Scene_Wireframe${name}.png`), bytes);
    await sharp(bytes).resize({ width: 640, height: 640, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 82 })
      .toFile(path.join(out, `Scene_Wireframe${name}_640.jpg`));
  }
  assert.ok(solidDraw.length >= expectedMeshes && solidDraw.every(row => !row.wireframe && !row.material.startsWith('Whitebox_')));
  assert.ok(solidDraw.filter(row => row.map).length >= sampleIds.length * 2, 'The actual main draw uses every cloth sample map');
  assert.ok(materialSampleIds.every(id => solidDraw.some(row => row.sample === id && row.map)), 'All four procedural material types reach the real main draw');
  assert.ok(wireDraw.length >= expectedMeshes && wireDraw.every(row => row.wireframe), 'Every actual cloth draw switches to wireframe');
  const solidPixels = await sharp(solidImage).resize({ width: 320 }).removeAlpha().raw().toBuffer();
  const wirePixels = await sharp(wireImage).resize({ width: 320 }).removeAlpha().raw().toBuffer();
  assert.equal(solidPixels.length, wirePixels.length);
  let changedPixels = 0;
  for (let i = 0; i < solidPixels.length; i += 3)
    if (Math.abs(solidPixels[i] - wirePixels[i]) + Math.abs(solidPixels[i + 1] - wirePixels[i + 1]) + Math.abs(solidPixels[i + 2] - wirePixels[i + 2]) > 60) changedPixels++;
  result.wireframe = { solidDraw, wireDraw, changedFraction: changedPixels / (solidPixels.length / 3) };
  const fullSolid = await sharp(solidImage).removeAlpha().raw().toBuffer(), fullWire = await sharp(wireImage).removeAlpha().raw().toBuffer();
  let fullChanged = 0;
  for (let i = 0; i < fullSolid.length; i += 3)
    if (Math.abs(fullSolid[i] - fullWire[i]) + Math.abs(fullSolid[i + 1] - fullWire[i + 1]) + Math.abs(fullSolid[i + 2] - fullWire[i + 2]) > 60) fullChanged++;
  result.wireframe.fullChangedFraction = fullChanged / (fullSolid.length / 3);
  console.log('WIRE PIXELS', JSON.stringify({ preview: result.wireframe.changedFraction, full: result.wireframe.fullChangedFraction }));
  assert.ok(result.wireframe.changedFraction > .005, `Wireframe changes visible pixels: ${result.wireframe.changedFraction}`);
  await Shot('Wireframe'); await DrawMaterials(false);
  await page.evaluate(() => window.Taierzhuang.Debug.ClothRange.ShowPanel(true));
  console.log('PASS actual textured draw / wireframe material switch / visible pixel change');

  result.nativeSamples = [];
  for (const id of sampleIds) {
    await page.locator(`[data-cloth-select="${id}"]`).click();
    await page.evaluate(id => {
      const api = window.Taierzhuang.Debug.ClothRange;
      api.Preset(id); api.Action(id === 'quilt' ? 'drape' : 'hang'); api.Pause(true);
    }, id);
    assert.match(await page.locator('[data-cloth-playback]').innerText(), /暂停/, `${id}: inherited pause is explicit`);
    const pauseButton = page.locator('[data-cloth-action="pause"]'); await pauseButton.scrollIntoViewIfNeeded();
    const pauseBox = await pauseButton.boundingBox(), firstControl = await page.locator('[data-cloth-param]').first().boundingBox();
    assert.ok(pauseBox && firstControl && pauseBox.y < firstControl.y, `${id}: playback controls appear above the parameters`);
    await Drag('wind', 0); const calm = await Advance(120);
    await Drag('wind', 6.5); const windy = await Advance(120); Healthy(windy, `${id} native wind`);
    if (id !== 'quilt') assert.notEqual(Item(windy, id).poseChecksum, Item(calm, id).poseChecksum, `${id}: native wind edit changes the hanging pose`);
    const thick = await Drag('thickness', .09);
    const Span = state => state.geometry.find(row => row.id === id).spanY;
    const thicknessRatio = Item(thick.after, id).cfg.thickness / Item(thick.before, id).cfg.thickness;
    assert.ok(Math.abs(Span(thick.after) / Span(thick.before) - thicknessRatio) < 1e-5, `${id}: native thickness changes this sample's real shell`);
    const stiff = await Drag('bend', .5);
    assert.equal(Item(stiff.after, id).poseChecksum, Item(stiff.before, id).poseChecksum, `${id}: stiffness editing respects pause`);
    assert.equal(stiff.after.paused, true);
    if (materialSampleIds.includes(id)) {
      const smooth = await Drag('roughness', .25);
      const renderedRoughness = await page.evaluate(id => {
        const values = [];
        window.Taierzhuang.scene.getObjectByName(`ClothLab_${id}`).traverse(object => {
          if (object.isSkinnedMesh) for (const material of [object.material].flat()) values.push(material.roughness);
        });
        return values;
      }, id);
      assert.ok(renderedRoughness.length === 3 && renderedRoughness.every(value => Math.abs(value - Item(smooth.after, id).cfg.roughness) < 1e-8),
        `${id}: native roughness slider updates all private cloth materials`);
    }
    await page.locator('[data-cloth-action="preview"]').click();
    const started = await State(); assert.equal(started.paused, false, `${id}: preview automatically continues the simulation`);
    assert.equal(Item(started, id).cfg.bend, Item(stiff.after, id).cfg.bend, `${id}: preview keeps edited parameters`);
    await page.evaluate(() => window.Taierzhuang.StepFrames(90, 1 / 60, false));
    const played = await State(); Healthy(played, `${id} parameter preview`);
    assert.ok(played.clock > started.clock);
    assert.notEqual(Item(played, id).poseChecksum, Item(started, id).poseChecksum, `${id}: preview visibly exercises the edited sample`);
    result.nativeSamples.push({ id, calm, windy, started, played });
    await page.evaluate(id => {
      const api = window.Taierzhuang.Debug.ClothRange;
      api.Pause(true); api.Preset(id); api.Action(id === 'quilt' ? 'drape' : 'hang');
    }, id);
  }
  console.log('PASS real mouse sliders for all samples / private configs and paused poses / visible preview action');

  result.slide = [];
  const CenterX = () => page.evaluate(() => {
    const t = window.Taierzhuang, id = t.Debug.ClothRange.State().selected;
    let sum = 0, count = 0;
    t.scene.getObjectByName(`ClothLab_${id}`).traverse(object => {
      if (!object.isBone || object.name === 'Blanket_Root') return;
      sum += object.getWorldPosition(object.position.clone()).x; count++;
    });
    return sum / count;
  });
  for (const id of sampleIds) {
    await page.locator(`[data-cloth-select="${id}"]`).click();
    await page.evaluate(id => {
      const api = window.Taierzhuang.Debug.ClothRange;
      api.Preset(id); api.Pause(true); api.Set('wind', 0); api.Set('airDamping', .2);
    }, id);
    const distances = [];
    for (const friction of [0, 1.5]) {
      await page.evaluate(friction => window.Taierzhuang.Debug.ClothRange.Set('groundFriction', friction), friction);
      await page.locator('[data-cloth-action="slide"]').click();
      const startX = await CenterX(); const state = await Advance(60); Healthy(state, `${id} slide ${friction}`);
      const distance = Math.abs(await CenterX() - startX);
      assert.equal(Item(state, id).pins.length, 0, `${id}: floor slide releases all header pins`);
      distances.push({ friction, distance, state });
    }
    assert.ok(distances[0].distance > .25 && distances[1].distance < distances[0].distance * .55,
      `${id}: visible floor-slide friction comparison ${JSON.stringify(distances.map(row => ({ friction: row.friction, distance: row.distance })))}`);
    result.slide.push({ id, distances });
    if (id !== 'quilt') {
      await page.locator('[data-cloth-action="hang"]').click();
      assert.equal(Item(await Advance(1), id).pins.length, 12, `${id}: hang restores the header attachments`);
    }
    await page.evaluate(id => {
      const api = window.Taierzhuang.Debug.ClothRange;
      api.Preset(id); api.Action(id === 'quilt' ? 'drape' : 'hang');
    }, id);
  }
  await page.locator('[data-cloth-select="quilt"]').click();
  console.log('PASS all-sample floor slide / low versus high friction / restore hanging');

  await page.evaluate(ids => {
    const api = window.Taierzhuang.Debug.ClothRange; api.Pause(true);
    ids.forEach((id, index) => { api.Select(id); api.Set('bend', .1 + index * .07); api.Set('wind', 6.5); });
  }, materialSampleIds);
  const beforeCompare = await State();
  await page.locator('[data-cloth-action="compare"]').click();
  const compared = await State();
  assert.equal(compared.selected, 'muslin'); assert.equal(compared.paused, false);
  for (const old of beforeCompare.items.filter(item => !materialSampleIds.includes(item.id))) {
    const after = Item(compared, old.id);
    assert.deepEqual(after.cfg, old.cfg, `${old.id}: comparison does not overwrite the original sample's parameters`);
    assert.equal(after.poseChecksum, old.poseChecksum, `${old.id}: comparison does not reset the original sample's pose`);
    assert.equal(after.action, old.action);
  }
  for (const id of materialSampleIds) {
    const before = Item(beforeCompare, id), after = Item(compared, id);
    assert.equal(after.action, 'hang'); assert.equal(after.pins.length, 12);
    assert.equal(after.cfg.wind, CLOTH_LAB_SIM.comparisonWindMps);
    assert.deepEqual({ ...after.cfg, wind: before.cfg.wind }, before.cfg, `${id}: comparison preserves every user parameter except common wind`);
  }
  await page.evaluate(() => window.Taierzhuang.StepFrames(90, 1 / 60, false));
  const comparisonPlayed = await State(); Healthy(comparisonPlayed, 'same-wind material comparison');
  for (const id of materialSampleIds) assert.notEqual(Item(comparisonPlayed, id).poseChecksum, Item(compared, id).poseChecksum, `${id}: common wind drives the actual cloth`);
  const response = await page.evaluate(specs => specs.map(spec => {
    let sum = 0, count = 0;
    window.Taierzhuang.scene.getObjectByName(`ClothLab_${spec.id}`).traverse(object => {
      if (!object.isBone || object.name === 'Blanket_Root') return;
      sum += object.getWorldPosition(object.position.clone()).z - spec.z; count++;
    });
    return { id: spec.id, meanWindDeflectionM: sum / count };
  }), CLOTH_LAB_ASSETS.filter(spec => spec.sample));
  assert.ok(response.every(row => Number.isFinite(row.meanWindDeflectionM))
    && new Set(response.map(row => Math.round(row.meanWindDeflectionM * 100))).size >= 3,
    `Different fabrics visibly respond differently to the same wind: ${JSON.stringify(response)}`);
  await page.evaluate(() => window.Taierzhuang.Debug.ClothRange.Pause(true));
  result.comparison = { before: beforeCompare, after: compared, played: comparisonPlayed, response };
  await Shot('MaterialSamplesCompare');
  await page.evaluate(ids => {
    const api = window.Taierzhuang.Debug.ClothRange;
    for (const id of ids) { api.Select(id); api.Preset(id); api.Action('hang'); }
    api.Select('quilt');
  }, materialSampleIds);
  console.log('PASS four private material samples / same-wind comparison / original samples preserved');

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
  assert.equal(result.export.value.scope, 'ClothRangeOnly'); assert.equal(result.export.value.items.length, sampleIds.length);
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
  await page.goto(`${base}/Taierzhuang1938/?cloth=1&scale=small`, { timeout: 180000 });
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
  result.normalProfile = await page.evaluate(() => ({ profile: window.Taierzhuang.GraphicsProfile.Inspect().profile,
    storedProfile: localStorage.getItem('tengxian1938_graphics_profile_v1'), storedWhitebox: localStorage.getItem('tengxian1938_whitebox_v1') }));
  assert.equal(result.normalProfile.profile, 'high');
  assert.equal(result.normalProfile.storedProfile, savedProfile); assert.equal(result.normalProfile.storedWhitebox, savedWhitebox);
  console.log('PASS normal boot / rAF / pointer orbit / real-time pause / Esc resume');

  // `?quality=whitebox` is just an unknown value now: default tier, original materials, wireframe toggles live.
  await page.goto(`${base}/Taierzhuang1938/?cloth=1&quality=whitebox&shot=1&manual=1&scale=small`, { timeout: 180000 });
  await page.waitForFunction(() => window.Taierzhuang?.state.ready && window.Taierzhuang.Debug.ClothRange?.State().ready,
    null, { timeout: 300000 });
  const explicitProfile = await page.evaluate(() => {
    const t = window.Taierzhuang; t.state.menu = false; t.Debug.ClothRange.Pause(true);
    return t.GraphicsProfile.Inspect().profile;
  });
  assert.equal(explicitProfile, 'high');
  const whiteSolid = await DrawMaterials(false), whiteWire = await DrawMaterials(true), whiteBack = await DrawMaterials(false);
  assert.ok(whiteSolid.length >= expectedMeshes && whiteSolid.every(row => !row.material.startsWith('Whitebox_') && !row.wireframe));
  assert.ok(whiteWire.length >= expectedMeshes && whiteWire.every(row => !row.material.startsWith('Whitebox_') && row.wireframe),
    'Original materials follow the live wireframe toggle');
  assert.ok(whiteBack.length >= expectedMeshes && whiteBack.every(row => !row.wireframe));
  result.unknownQualityValue = { profile: explicitProfile, solid: whiteSolid, wire: whiteWire, restored: whiteBack };
  console.log('PASS unknown quality=whitebox falls back to default / draw wireframe on and off');
  assert.deepEqual(errors, [], `Console errors: ${errors.join(' | ')}`);
  console.log('ClothRangeBrowserTest: all passed');
} catch (error) {
  result.failure = String(error.stack || error);
  throw error;
} finally {
  releaseBanner?.();
  if (bannerRouteStarted) await bannerRouteFinished;
  result.routeErrors = routeErrors;
  result.errors = errors;
  fs.writeFileSync(path.join(out, 'Test_Result.json'), JSON.stringify(result, null, 2));
  await browser.close().catch(error => { console.error('Browser cleanup failed:', String(error)); });
  server?.close();
}
