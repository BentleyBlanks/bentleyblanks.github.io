// Actual cloth-range absorption UI and normal high-quality material evidence.
// Full viewport PNGs stay local; observation previews are <=640 px, JPEG 82.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { LaunchBrowser } from '../PrairieFire1937/Script_BrowserTestKit.mjs';
import { ServeRoot } from './Script_DevServer.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(here, '..', 'tmp', 'ClothBlood');
fs.mkdirSync(out, { recursive: true });
const server = process.env.CLOTH_PREVIEW ? null : await ServeRoot(path.resolve(here, '..'), 0);
const browser = await LaunchBrowser({ extraArgs: ['--mute-audio'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [], evidence = {};
page.on('pageerror', error => { errors.push(String(error)); console.error('PAGE ERROR', String(error)); });
page.on('console', message => { if (message.type() === 'error') { errors.push(message.text()); console.error(message.text().slice(0, 500)); } });
await page.addInitScript(() => {
  localStorage.setItem('tengxian1938_audio_v1', JSON.stringify({ master: 0 }));
  localStorage.setItem('tengxian1938_tools_volume_v1', JSON.stringify({ volume: 0, muted: true }));
  localStorage.setItem('tengxian1938_graphics_profile_v1', JSON.stringify('high'));
});
const State = () => page.evaluate(() => window.Taierzhuang.Debug.ClothRange.State());
const Item = (state, id = state.selected) => state.items.find(item => item.id === id);
const Blood = (state, id = state.selected) => Item(state, id).blood;
const Mass = state => state.front.pigmentMl + state.back.pigmentMl;
const Wet = state => state.front.wetMl + state.back.wetMl;
async function Select(id) {
  await page.locator(`[data-cloth-select="${id}"]`).click();
  assert.equal((await State()).selected, id);
}
async function Set(key, value) {
  const control = page.locator(`[data-blood-param="${key}"]`);
  await control.scrollIntoViewIfNeeded();
  await control.evaluate((input, value) => { input.value = String(value); input.dispatchEvent(new Event('input', { bubbles: true })); }, value);
  assert.equal(Blood(await State()).params[key], +await control.inputValue(), `${key}: UI and live model agree`);
}
async function DragParameter(key, target) {
  const control = page.locator(`[data-blood-param="${key}"]`); await control.scrollIntoViewIfNeeded();
  const range = await control.evaluate(input => ({ min: +input.min, max: +input.max, value: +input.value, step: +input.step }));
  const box = await control.boundingBox(); assert.ok(box && box.width > 80, `${key}: visible native range`);
  const At = value => box.x + 8 + (value - range.min) / (range.max - range.min) * (box.width - 16);
  await page.mouse.move(At(range.value), box.y + box.height / 2); await page.mouse.down();
  await page.mouse.move(At(target), box.y + box.height / 2, { steps: 12 }); await page.mouse.up();
  const value = Blood(await State()).params[key];
  assert.ok(Math.abs(value - target) <= range.step * 2 + 1e-7, `${key}: native mouse drag reaches ${target}; got ${value}`);
  assert.equal(value, +await control.inputValue(), `${key}: native slider updates the real simulation`); return value;
}
async function Action(name) { await page.locator(`[data-blood-action="${name}"]`).click(); }
async function Advance(seconds) {
  return page.evaluate(seconds => {
    const t = window.Taierzhuang; t.Debug.ClothRange.BloodAdvance(seconds); t.StepFrames(2, 1 / 60, true);
    return t.Debug.ClothRange.State();
  }, seconds);
}
async function Shot(name, camera = null) {
  await page.evaluate(camera => {
    const t = window.Taierzhuang, api = t.Debug.ClothRange;
    api.Wireframe(false); if (camera) api.Camera(camera); api.ShowPanel(false); t.StepFrames(5, 1 / 60, true);
  }, camera);
  const bytes = await page.screenshot();
  fs.writeFileSync(path.join(out, `Scene_${name}.png`), bytes);
  await sharp(bytes).resize({ width: 640, height: 640, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 82 }).toFile(path.join(out, `Scene_${name}_640.jpg`));
  await page.evaluate(() => window.Taierzhuang.Debug.ClothRange.ShowPanel(true));
}
async function RenderEvidence() {
  return page.evaluate(async () => {
    const { PatchesOf } = await import('./Script_MaterialPatches.mjs');
    const t = window.Taierzhuang, api = t.Debug.ClothRange, root = t.scene.getObjectByName(`ClothLab_${api.State().selected}`);
    const records = [], restore = [];
    root.traverse(mesh => {
      if (!mesh.isSkinnedMesh) return;
      const original = mesh.onBeforeRender;
      mesh.onBeforeRender = function(renderer, scene, camera, geometry, material, group) {
        original?.call(this, renderer, scene, camera, geometry, material, group);
        if (!material.isMeshStandardMaterial && !material.isMeshPhysicalMaterial) return;
        records.push({ mesh: mesh.name, material: material.name, map: !!material.map, normalMap: !!material.normalMap,
          transparent: material.transparent, wireframe: material.wireframe,
          patches: (PatchesOf(material) || []).map(patch => typeof patch.key === 'function' ? patch.key() : patch.key),
          attributes: Object.keys(geometry.attributes), skin: !!geometry.attributes.skinWeight });
      };
      restore.push(() => { mesh.onBeforeRender = original; });
    });
    try { t.StepFrames(3, 1 / 60, true); } finally { for (const fn of restore) fn(); }
    const gl = t.renderer.getContext(), maxUnits = gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS);
    const samplerTypes = new Set([gl.SAMPLER_2D, gl.SAMPLER_3D, gl.SAMPLER_CUBE, gl.SAMPLER_2D_SHADOW,
      gl.SAMPLER_2D_ARRAY, gl.SAMPLER_2D_ARRAY_SHADOW, gl.SAMPLER_CUBE_SHADOW, gl.INT_SAMPLER_2D,
      gl.INT_SAMPLER_3D, gl.INT_SAMPLER_CUBE, gl.INT_SAMPLER_2D_ARRAY, gl.UNSIGNED_INT_SAMPLER_2D,
      gl.UNSIGNED_INT_SAMPLER_3D, gl.UNSIGNED_INT_SAMPLER_CUBE, gl.UNSIGNED_INT_SAMPLER_2D_ARRAY]);
    const programs = t.renderer.info.programs.map(entry => {
      const linked = !!gl.getProgramParameter(entry.program, gl.LINK_STATUS), names = []; let samplers = 0;
      if (linked) for (let i = 0, n = gl.getProgramParameter(entry.program, gl.ACTIVE_UNIFORMS); i < n; i++) {
        const uniform = gl.getActiveUniform(entry.program, i);
        if (uniform && samplerTypes.has(uniform.type)) { samplers += uniform.size; names.push(uniform.name); }
      }
      return { id: entry.id, linked, samplers, names, blood: names.includes('uClothBloodSheet'),
        log: linked ? '' : gl.getProgramInfoLog(entry.program) };
    });
    return { records, graphics: t.GraphicsProfile.Inspect(), maxUnits, programs };
  });
}

try {
  const base = process.env.CLOTH_PREVIEW || `http://127.0.0.1:${server.address().port}`;
  await page.goto(`${base}/Taierzhuang1938/?cloth=1&shot=1&manual=1&scale=small`, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await page.waitForFunction(() => window.Taierzhuang?.state.ready && window.Taierzhuang.Debug.ClothRange?.State().ready,
    null, { timeout: 300000 });
  await page.evaluate(() => { const t = window.Taierzhuang; t.state.menu = false; t.Debug.ClothRange.Pause(true); t.StepFrames(3, 1 / 60, true); });
  evidence.boot = await State();
  for (const id of ['singleBlanket', 'towel', 'quilt']) assert.ok(Item(evidence.boot, id)?.blood, `${id}: integrated blood state exists`);
  for (const id of ['curtain', 'banner', 'muslin', 'silk', 'canvas', 'wool']) assert.ok(Item(evidence.boot, id), `${id}: original sample preserved`);
  assert.equal(await page.locator('[data-blood-param]').count(), 7, 'All seven absorption controls are exposed');
  console.log('PASS normal cloth route / preserved samples / blood controls');

  await Select('towel'); await Action('clear');
  const clean = await State();
  evidence.nativeReflect = await DragParameter('wetReflect', .32); await Set('wetReflect', .75);
  for (const [key, value] of [['diffusion', 1.7], ['permeation', .4], ['ageS', 120]]) {
    await Set(key, value); assert.equal(Blood(await State()).params[key], value);
  }
  await Set('diffusion', 1); await Set('permeation', 1); await Set('ageS', 0);
  await Set('amountMl', 16); await Action('inject'); const injected = await State();
  assert.ok(Math.abs(Mass(Blood(injected)) - 16) < 1e-6, 'Inject button delivers the configured dose');
  for (const item of clean.items.filter(item => item.id !== 'towel')) {
    assert.equal(Blood(injected, item.id).hash, item.blood.hash, `${item.id}: towel injection remains private`);
    assert.deepEqual(Item(injected, item.id).cfg, item.cfg, `${item.id}: original solver parameters remain unchanged`);
  }
  const paused = Blood(await State());
  await page.evaluate(() => window.Taierzhuang.StepFrames(30, 1 / 60, false));
  assert.equal(Blood(await State()).hash, paused.hash, 'Pause freezes absorption as well as cloth');
  for (let i = 0; i < 6; i++) {
    await page.locator('[data-cloth-action="step"]').click();
    await page.evaluate(() => window.Taierzhuang.StepFrames(1, 1 / 60, false));
  }
  assert.ok(Math.abs(Blood(await State()).timeS - paused.timeS - .1) < 1e-7,
    'Six cloth single steps advance exactly one 10 Hz blood step');
  await Set('feedMlS', 1.5); await Action('feed'); await Advance(8); await Action('stop');
  const stopped = Blood(await State()); await Advance(20); const spread = Blood(await State());
  assert.ok(stopped.injectedMl > 27 && stopped.injectedMl < 29, 'Continuous feed uses the selected rate');
  assert.ok(!spread.feeding && Math.abs(spread.injectedMl - stopped.injectedMl) < 1e-6, 'Stop supply adds no further blood');
  assert.ok(spread.front.areaM2 + spread.back.areaM2 > stopped.front.areaM2 + stopped.back.areaM2, 'Stopped blood keeps slowly wicking');
  evidence.controls = { injected: Blood(injected), stopped, spread };
  console.log('PASS live injection / continuous supply / stop / residual spread / pause and step / sample isolation');

  evidence.profiles = [];
  for (const id of ['singleBlanket', 'towel', 'quilt']) {
    await Select(id); await Action('clear');
    await page.evaluate(() => { const api = window.Taierzhuang.Debug.ClothRange; api.Set('wind', 0); api.Action('hang'); api.Pause(true); api.BloodSource({ u: .5, v: .5, side: 1 }); });
    await Set('amountMl', 24); await Set('drySeconds', 600); await Action('inject'); await Advance(30);
    const state = Blood(await State()); const render = await RenderEvidence();
    assert.equal(render.graphics.profile, 'high'); assert.equal(render.graphics.whitebox, false);
    assert.ok(render.records.length > 0 && render.records.some(row => row.map)
      && render.records.every(row => !row.transparent && !row.wireframe && row.skin),
    `${id}: actual normal textured opaque skinned cloth surfaces rendered (untextured binding is allowed): ${JSON.stringify(render.records)}`);
    assert.ok(render.records.some(row => row.patches.some(key => /blood/i.test(key))), `${id}: absorption patch is on the drawn material`);
    assert.ok(render.programs.every(program => program.linked && program.samplers <= render.maxUnits), `${id}: every linked material stays inside the actual sampler budget`);
    assert.ok(render.programs.some(program => program.blood), `${id}: GPU program really binds the absorption atlas`);
    evidence.profiles.push({ id, state, render });
    await Shot(`${id}_Front`, 'front'); await Shot(`${id}_Back`, 'back');
  }
  assert.ok(evidence.profiles[0].state.back.pigmentMl / Mass(evidence.profiles[0].state)
    > evidence.profiles[2].state.back.pigmentMl / Mass(evidence.profiles[2].state), 'Normal-material thin blanket has faster reverse penetration than quilt');
  console.log('PASS thin/towel/quilt normal materials / front and reverse evidence');

  await Select('towel'); await Action('clear'); await Set('drySeconds', 60); await Set('amountMl', 20); await Action('inject');
  const fresh = Blood(await State()); await Shot('TowelFresh', 'close'); await Advance(240);
  const dry = Blood(await State()); await Shot('TowelDry', 'close');
  assert.ok(Wet(dry) < Wet(fresh) * .25 && Math.abs(Mass(dry) - Mass(fresh)) < 1e-6, 'Drying removes wetness while retaining pigment');
  await Action('inject'); const rewet = Blood(await State());
  assert.ok(Wet(rewet) > Wet(dry) && Mass(rewet) > Mass(dry), 'New blood visibly re-wets an existing stain');
  evidence.age = { fresh, dry, rewet };

  const end = Blood(await State());
  await page.locator('[data-blood-time]').evaluate(input => { input.value = '10'; input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })); });
  assert.ok(Blood(await State()).timeS <= 10.1, 'Timeline control seeks backwards');
  await page.evaluate(timeS => window.Taierzhuang.Debug.ClothRange.BloodSeek(timeS), end.timeS);
  assert.equal(Blood(await State()).hash, end.hash, 'Timeline replay reproduces the exact field');
  await Action('clear'); const cleared = Blood(await State());
  assert.equal(Mass(cleared), 0); assert.equal(cleared.eventCount, 0); assert.equal(cleared.timeS, 0); assert.ok(!cleared.feeding);
  evidence.replay = { end, cleared };
  console.log('PASS drying / re-wetting / timeline replay / clear');

  const picked = await page.evaluate(async () => {
    const THREE = await import('three');
    const t = window.Taierzhuang, api = t.Debug.ClothRange;
    api.Action('hang'); api.Pause(true); api.Camera('front'); api.ShowPanel(false); t.state.running = true; t.state.menu = false;
    t.StepFrames(3, 1 / 60, true);
    let pick = null, best = Infinity;
    t.scene.getObjectByName('ClothLab_towel').traverse(mesh => {
      if (!mesh.isSkinnedMesh) return;
      mesh.updateWorldMatrix(true, false); mesh.skeleton.update();
      const rest = mesh.geometry.attributes.clothBloodRest, index = mesh.geometry.index;
      for (let i = 0; i < (index?.count ?? rest.count); i += 3) {
        const ids = [0, 1, 2].map(k => index ? index.getX(i + k) : i + k);
        if (ids.some(id => rest.getZ(id) < 0)) continue;
        const u = ids.reduce((sum, id) => sum + rest.getX(id), 0) / 3, v = ids.reduce((sum, id) => sum + rest.getY(id), 0) / 3;
        const d = (u - .35) ** 2 + (v - .65) ** 2;
        if (d >= best) continue;
        const point = new THREE.Vector3(), vertex = new THREE.Vector3();
        for (const id of ids) point.addScaledVector(mesh.getVertexPosition(id, vertex), 1 / 3);
        mesh.localToWorld(point); point.project(t.camera);
        const bounds = t.renderer.domElement.getBoundingClientRect();
        pick = { u, v, x: bounds.left + (point.x * .5 + .5) * bounds.width,
          y: bounds.top + (.5 - point.y * .5) * bounds.height }; best = d;
      }
    });
    return pick;
  });
  assert.ok(picked && picked.x > 0 && picked.x < 1440 && picked.y > 0 && picked.y < 900, 'Target cloth triangle projects inside the actual viewport');
  const beforeClick = Blood(await State());
  await page.keyboard.down('Shift'); await page.mouse.click(picked.x, picked.y); await page.keyboard.up('Shift');
  const clicked = await State();
  assert.equal(clicked.selected, 'towel');
  assert.ok(Math.abs(Item(clicked).bloodSource.u - picked.u) < .015 && Math.abs(Item(clicked).bloodSource.v - picked.v) < .015,
    `A real cloth click maps through the posed triangle to its stable rest coordinates: ${JSON.stringify({ picked, source: Item(clicked).bloodSource })}`);
  assert.ok(Math.abs(Blood(clicked).injectedMl - beforeClick.injectedMl - beforeClick.params.amountMl) < 1e-6,
    'Shift-click injects exactly one configured dose into the clicked surface');
  evidence.click = { picked, source: Item(clicked).bloodSource, blood: Blood(clicked) };
  await page.evaluate(() => window.Taierzhuang.Debug.ClothRange.ShowPanel(true));
  console.log('PASS real cloth hit / barycentric source / shift-click dose');

  evidence.bindings = await page.evaluate(async () => {
    const { PatchesOf } = await import('./Script_MaterialPatches.mjs');
    const t = window.Taierzhuang, state = t.Debug.ClothRange.State(), sheets = [], materials = [], restArrays = [], rows = [];
    for (const item of state.items) {
      const ownSheets = new Set(); let validRest = true;
      t.scene.getObjectByName(`ClothLab_${item.id}`).traverse(mesh => {
        if (!mesh.isSkinnedMesh) return;
        const rest = mesh.geometry.attributes.clothBloodRest;
        validRest &&= !!rest && rest.array !== mesh.geometry.attributes.position.array && rest.count === mesh.geometry.attributes.position.count;
        if (rest) restArrays.push(rest.array);
        for (const material of [mesh.material].flat()) {
          materials.push(material);
          const bloodPatch = PatchesOf(material).find(patch => String(patch.key).startsWith('cloth-blood-sheet'));
          if (!bloodPatch) continue;
          const uniforms = {}; bloodPatch.uniforms(uniforms); ownSheets.add(uniforms.uClothBloodSheet.value);
        }
      });
      sheets.push(...ownSheets); rows.push({ id: item.id, sheets: ownSheets.size, validRest });
    }
    return { rows, sheets: sheets.length, privateSheets: new Set(sheets).size,
      materials: materials.length, privateMaterials: new Set(materials).size,
      restArrays: restArrays.length, privateRestArrays: new Set(restArrays).size };
  });
  assert.ok(evidence.bindings.rows.every(row => row.sheets === 1 && row.validRest));
  assert.equal(evidence.bindings.sheets, evidence.bindings.privateSheets, 'Each sample has a private blood atlas');
  assert.equal(evidence.bindings.materials, evidence.bindings.privateMaterials, 'Patched material instances never cross sample boundaries');
  assert.equal(evidence.bindings.restArrays, evidence.bindings.privateRestArrays, 'Every rendered surface has private immutable blood coordinates');
  evidence.materialControls = await page.evaluate(() => {
    const t = window.Taierzhuang, api = t.Debug.ClothRange;
    api.Set('roughness', .43); api.Wireframe(true); const records = [];
    t.scene.getObjectByName('ClothLab_towel').traverse(mesh => {
      if (mesh.isSkinnedMesh) for (const material of [mesh.material].flat()) records.push({ roughness: material.roughness, wireframe: material.wireframe });
    });
    api.Wireframe(false); api.Set('roughness', 1); return records;
  });
  assert.ok(evidence.materialControls.length && evidence.materialControls.every(row => row.wireframe && row.roughness === .43),
    'Original material controls edit the actual blood-patched materials');

  await page.evaluate(() => {
    const t = window.Taierzhuang, api = t.Debug.ClothRange;
    api.Select('towel'); api.Action('hang'); api.Pause(true); api.BloodClear(); api.BloodSet('ageS', 0);
    // Track the raised half, not the crease which is legitimately held against
    // the floor in the folded pose. Both actions must move this painted patch.
    api.BloodSource({ u: .48, v: .78, side: 1 }); api.BloodInject({ amountMl: 40 }); api.BloodAdvance(15); api.Camera('front');
    t.StepFrames(3, 1 / 60, true);
  });
  evidence.attachment = await page.evaluate(async () => {
    const THREE = await import('three');
    const { ClothBlood } = await import('./Script_ClothBlood.mjs');
    const { ClothBloodModel } = await import('./Script_ClothBloodModel.mjs');
    const { CLOTH_LAB_SIM } = await import('./Data_Tuning_ClothRange.mjs');
    const t = window.Taierzhuang, api = t.Debug.ClothRange, root = t.scene.getObjectByName('ClothLab_towel');
    if (!t.state.running || t.state.menu) throw new Error('Cloth physics cannot advance while the host is stopped or in its menu');
    const meshes = []; root.traverse(mesh => { if (mesh.isSkinnedMesh) meshes.push(mesh); });
    let chosen = null, best = Infinity;
    for (const mesh of meshes) {
      const rest = mesh.geometry.attributes.clothBloodRest, index = mesh.geometry.index;
      for (let i = 0; i < (index?.count ?? rest.count); i += 3) {
        const ids = [0, 1, 2].map(k => index ? index.getX(i + k) : i + k);
        if (ids.some(id => rest.getZ(id) < 0)) continue;
        const u = ids.reduce((sum, id) => sum + rest.getX(id), 0) / 3, v = ids.reduce((sum, id) => sum + rest.getY(id), 0) / 3;
        const d = (u - .48) ** 2 + (v - .78) ** 2;
        if (d < best) { best = d; chosen = { mesh, ids }; }
      }
    }
    if (!chosen) throw new Error('No front triangle found');
    const saved = meshes.map(mesh => ({ mesh, rest: Float32Array.from(mesh.geometry.attributes.clothBloodRest.array),
      position: Float32Array.from(mesh.geometry.attributes.position.array) }));
    const { mesh, ids } = chosen, face = { a: ids[0], b: ids[1], c: ids[2] };
    const context = { records: [{ mesh }], Point: ClothBloodModel.prototype.Point };
    const SampleFace = () => {
      root.updateWorldMatrix(true, true); mesh.skeleton.update();
      const point = new THREE.Vector3(), vertex = new THREE.Vector3();
      ids.forEach((id, i) => point.addScaledVector(mesh.getVertexPosition(id, vertex), [.2, .3, .5][i]));
      mesh.localToWorld(point);
      return { world: point.toArray(), hit: ClothBlood.prototype.Hit.call(context, { object: mesh, face, point }) };
    };
    const AdvancePhysics = (count, render = false) => {
      const before = api.State().clock, requested = count;
      while (count > 0) {
        const n = Math.min(120, count); api.Step(n);
        t.StepFrames(Math.ceil(n / CLOTH_LAB_SIM.maxSteps), 1 / 60, render); count -= n;
      }
      const elapsed = api.State().clock - before;
      if (Math.abs(elapsed - requested * CLOTH_LAB_SIM.stepS) > 1e-7)
        throw new Error(`Requested ${requested} cloth steps but simulation clock advanced ${elapsed}`);
      return elapsed;
    };
    const Shape = () => {
      // Covariance's smallest eigenvalue measures RMS distance from the best-fit
      // plane. A translated/rotated flat cloth cannot pass this fold check.
      const points = [], center = [0, 0, 0]; let minY = Infinity, maxY = -Infinity;
      for (const mesh of meshes) {
        const rest = mesh.geometry.attributes.clothBloodRest, point = new THREE.Vector3(); mesh.skeleton.update();
        for (let i = 0; i < rest.count; i += 3) {
          if (rest.getZ(i) < 0) continue;
          mesh.getVertexPosition(i, point); mesh.localToWorld(point); const p = point.toArray(); points.push(p);
          for (let k = 0; k < 3; k++) center[k] += p[k]; minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]);
        }
      }
      center.forEach((value, i) => { center[i] = value / points.length; });
      const covariance = Array.from({ length: 3 }, () => [0, 0, 0]);
      for (const point of points) for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++)
        covariance[i][j] += (point[i] - center[i]) * (point[j] - center[j]) / points.length;
      for (let iteration = 0; iteration < 18; iteration++) {
        let p = 0, q = 1;
        for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) if (Math.abs(covariance[i][j]) > Math.abs(covariance[p][q])) { p = i; q = j; }
        if (Math.abs(covariance[p][q]) < 1e-12) break;
        const angle = .5 * Math.atan2(2 * covariance[p][q], covariance[q][q] - covariance[p][p]), c = Math.cos(angle), s = Math.sin(angle);
        const a = covariance[p][p], b = covariance[q][q], ab = covariance[p][q];
        covariance[p][p] = c * c * a - 2 * s * c * ab + s * s * b;
        covariance[q][q] = s * s * a + 2 * s * c * ab + c * c * b;
        covariance[p][q] = covariance[q][p] = 0;
        for (let k = 0; k < 3; k++) if (k !== p && k !== q) {
          const kp = covariance[k][p], kq = covariance[k][q];
          covariance[k][p] = covariance[p][k] = c * kp - s * kq;
          covariance[k][q] = covariance[q][k] = s * kp + c * kq;
        }
      }
      return { minY, maxY, spanY: maxY - minY, planeRmsM: Math.sqrt(Math.max(0, Math.min(...covariance.map((row, i) => row[i])))) };
    };
    const initial = SampleFace(), time = api.State().items.find(item => item.id === 'towel').blood.timeS;
    const bloodHash = api.State().items.find(item => item.id === 'towel').blood.hash;
    api.Action('lift'); const liftReset = SampleFace(), liftStartClock = api.State().clock;
    AdvancePhysics(120); SampleFace(); const movingBones = meshes.map(mesh => Float32Array.from(mesh.skeleton.boneMatrices)); AdvancePhysics(12, true);
    const lifted = { ...SampleFace(), shape: Shape(), clockDelta: api.State().clock - liftStartClock,
      pins: api.State().items.find(item => item.id === 'towel').pins }, pass = t.post.prepassPass;
    const motion = meshes.map((mesh, index) => {
      const skeleton = mesh.skeleton, image = skeleton.boneTexture?.image, history = pass._objectHistory.get(mesh);
      return { name: mesh.name, delta: Math.max(...skeleton.boneMatrices.map((value, i) => Math.abs(value - movingBones[index][i]))),
        packed: skeleton.boneTexture?.name === 'boneTextureWithPrev' && image.height === image.width * 2,
        drawn: history?.frame === pass._velocityFrame, upgraded: pass._upgraded.has(skeleton),
        skipped: !!mesh.userData.skipNormalDepth, foreground: !!mesh.userData.foregroundPrepass };
    });
    api.Action('fold'); const foldReset = SampleFace(), foldStartClock = api.State().clock; AdvancePhysics(180); t.StepFrames(3, 1 / 60, true);
    const folded = { ...SampleFace(), shape: Shape(), clockDelta: api.State().clock - foldStartClock,
      pins: api.State().items.find(item => item.id === 'towel').pins }; api.BloodSeek(time);
    return { initial, liftReset, foldReset, lifted, folded, motion, velocity: pass.velocityEnabled, bloodHash,
      afterHash: api.State().items.find(item => item.id === 'towel').blood.hash,
      unchanged: saved.every(({ mesh, rest, position }) => rest.every((value, i) => value === mesh.geometry.attributes.clothBloodRest.array[i])
        && position.every((value, i) => value === mesh.geometry.attributes.position.array[i])) };
  });
  const attachment = evidence.attachment;
  assert.ok(Math.abs(attachment.lifted.clockDelta - 2.2) < 1e-7 && Math.abs(attachment.folded.clockDelta - 3) < 1e-7,
    'Lift and fold advance exactly 132 and 180 real physics steps');
  assert.ok(attachment.lifted.shape.spanY > 1.2 && attachment.lifted.shape.planeRmsM > .015,
    `Lift visibly raises a curved cloth surface: ${JSON.stringify(attachment.lifted.shape)}`);
  assert.ok(attachment.folded.shape.spanY > .55 && attachment.folded.shape.planeRmsM > .025,
    `Fold has substantial height and cannot be explained by a rotated flat plane: ${JSON.stringify(attachment.folded.shape)}`);
  for (const [pose, reset, count] of [[attachment.lifted, attachment.liftReset, 2], [attachment.folded, attachment.foldReset, 4]]) {
    assert.equal(pose.pins.length, count); assert.ok(pose.pins.every(pin => pin.gapM < 1e-4), 'Held cloth corners reach their physical targets');
    assert.ok(Math.hypot(...pose.world.map((value, i) => value - reset.world[i])) > .05,
      'The tracked triangle moves through simulation after Action resets its pose');
  }
  assert.ok(attachment.unchanged && attachment.bloodHash === attachment.afterHash, 'Lifting and folding keep the same rest field and static source geometry');
  for (const pose of [attachment.lifted, attachment.folded]) {
    assert.ok(Math.hypot(...pose.world.map((value, i) => value - attachment.initial.world[i])) > .05, 'The actual cloth triangle moves in world space');
    assert.ok(Math.abs(pose.hit.u - attachment.initial.hit.u) < 1e-5 && Math.abs(pose.hit.v - attachment.initial.hit.v) < 1e-5
      && pose.hit.side === attachment.initial.hit.side, 'A moving/folded hit resolves to the same blood material coordinate');
  }
  assert.ok(attachment.velocity && attachment.motion.every(mesh => mesh.delta > 1e-5 && mesh.packed && mesh.drawn
    && mesh.upgraded && !mesh.skipped && !mesh.foreground), 'Stained near cloth participates in production skinned motion history');
  await Shot('TowelFolded');
  await page.evaluate(async () => {
    const { CLOTH_LAB_SIM } = await import('./Data_Tuning_ClothRange.mjs');
    const t = window.Taierzhuang, api = t.Debug.ClothRange, before = api.State().clock;
    api.Action('lift'); api.Step(120); t.StepFrames(Math.ceil(120 / CLOTH_LAB_SIM.maxSteps), 1 / 60, false);
    api.Step(12); t.StepFrames(Math.ceil(12 / CLOTH_LAB_SIM.maxSteps), 1 / 60, true);
    if (Math.abs(api.State().clock - before - 2.2) > 1e-7) throw new Error('Lift screenshot failed to advance the cloth');
  });
  await Shot('TowelLifted');
  console.log('PASS material/atlas isolation / original controls / lifting and folding attachment / high-quality motion history');

  assert.deepEqual(errors, [], `Browser errors: ${errors.join(' | ')}`);
  evidence.errors = errors;
  console.log(`ClothBloodBrowserTest: passed; evidence ${out}`);
} finally {
  fs.writeFileSync(path.join(out, 'Data_ClothBloodBrowserResults.json'), JSON.stringify({ ...evidence, errors }, null, 2));
  await browser.close(); if (server) await new Promise(resolve => server.close(resolve));
}
