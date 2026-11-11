// Run through Script_TestRunner: it owns the machine-wide browser slot.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LaunchBrowser } from '../PrairieFire1937/Script_BrowserTestKit.mjs';
import { ServeRoot } from './Script_DevServer.mjs';
import { XBOT_CHARACTERS } from './Data_XBotCharacters.mjs';
import { HAIR_RANGE_ROWS } from './Data_HairRange.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, 'tmp', 'HairLab', 'Verified');
fs.mkdirSync(out, { recursive: true });
const server = process.env.HAIR_PREVIEW ? null : await ServeRoot(path.dirname(here), 0);
const base = process.env.HAIR_PREVIEW || `http://127.0.0.1:${server.address().port}`;
const browser = await LaunchBrowser({ extraArgs: ['--mute-audio'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [], failedRequests = [], result = { viewport: [1280, 720], base };
// These six are instantiated by the sampled whitebox keyframes; the full cast is covered in MixamoGroomBrowserTest.
const keyframeKeys = ['ijaJia', 'heYoutian', 'luo', 'shunzi', 'ijaA', 'ijaYi'];
page.on('pageerror', (error) => errors.push(String(error)));
page.on('console', (message) => { if (message.type() === 'error' && !message.text().includes('HairInjectedFailure')) errors.push(message.text()); });
page.on('response', (response) => {
  if (response.status() < 400) return;
  const failure = `${response.status()} ${response.url()}`;
  failedRequests.push(failure);
  console.error(`[hair] resource request failed: ${failure}`);
});
await page.addInitScript(() => {
  localStorage.setItem('tengxian1938_audio_v1', JSON.stringify({ master: 0 }));
  localStorage.setItem('tengxian1938_tools_volume_v1', JSON.stringify({ volume: 0, muted: true }));
});
const Step = (n = 18) => page.evaluate((n) => window.Taierzhuang.StepFrames(n, 1 / 60, true), n);
const State = () => page.evaluate(() => window.Taierzhuang.Debug.HairRange.State());
const Shot = async (name) => { await Step(); await page.screenshot({ path: path.join(out, `${name}.png`) }); };
try {
  console.log('--- Hair lab: real high-quality page, controls and 720p views');
  await page.goto(`${base}/Taierzhuang1938/?hair=1&quality=high&shot=1&manual=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.Taierzhuang?.state.ready && (window.Taierzhuang.Debug.HairRange?.State().ready || window.Taierzhuang.Debug.HairRange?.State().error), null, { timeout: 400000, polling: 1000 });
  result.lab = await State();
  assert.equal(result.lab.error, null);
  assert.equal(result.lab.stations.length, HAIR_RANGE_ROWS.reduce((sum,row)=>sum+row.items.length,0));
  assert.equal(result.lab.stations.filter(station=>station.row==='newCast').length,9);
  assert.equal(result.lab.loaded, result.lab.total);
  await Shot('LabPanel');
  await page.evaluate(() => window.Taierzhuang.Debug.HairRange.ShowPanel(false));
  for (const view of ['overview', 'compareShort', 'compareLong']) {
    await page.evaluate((view) => window.Taierzhuang.Debug.HairRange.Camera(view), view);
    await Shot(view);
  }
  for (const [index, name] of [[7, 'Shunzi'], [8, 'Luo'], [9, 'HeYoutian'], [10, 'SoldierA'], [11, 'Jia'], [12, 'Yi'], [17, 'LongStraight'], [18, 'LongWavy'], [23, 'LongBeard']]) {
    await page.evaluate((index) => window.Taierzhuang.Debug.HairRange.Focus(index, 'front'), index);
    await Shot(name);
  }
  result.newCast = {};
  for (const [index,station] of result.lab.stations.entries()) {
    if (station.row !== 'newCast') continue;
    const tiers = {};
    await page.evaluate(index=>Taierzhuang.Debug.HairRange.Focus(index,'front'),index);
    for (const lod of ['strands','cards','shell']) {
      await page.evaluate(lod=>Taierzhuang.Debug.HairRange.Lod(lod),lod);await Step(24);
      tiers[lod]=(await State()).stations[index];
      assert.equal(tiers[lod].lod,lod,`${station.groom}: ${lod} tier is actually selected`);
      assert.ok(tiers[lod].triangles>0,`${station.groom}: ${lod} has active geometry`);
      await page.screenshot({path:path.join(out,`${station.groom}_${lod}.png`)});
    }
    result.newCast[station.groom]=tiers;
  }
  await page.evaluate(()=>Taierzhuang.Debug.HairRange.Lod('auto'));
  await page.evaluate(() => { const a = window.Taierzhuang.Debug.HairRange; a.ShowPanel(true); a.Focus(9, 'front'); });
  await page.locator('[data-toggle="hair"]').click(); await Step();
  const hairHidden = await page.evaluate(() => {
    const root = window.Taierzhuang.scene.getObjectByName('Hair_cast_HeYoutian_Cast');
    return Object.fromEntries(root.children.map((o) => [o.name, o.visible]));
  });
  assert.equal(hairHidden.HairStrands, false);
  assert.equal(hairHidden.HairBeardCards, true, 'hair and beard switches must be independent');
  await page.locator('[data-toggle="hair"]').click();
  await page.locator('[data-toggle="beard"]').click(); await Step();
  assert.equal(await page.evaluate(() => window.Taierzhuang.scene.getObjectByName('Hair_cast_HeYoutian_Cast').getObjectByName('HairBeardCards').visible), false);
  await page.locator('[data-toggle="beard"]').click();
  await page.locator('[data-fold="appearance"] summary').click();
  const clump = page.locator('[data-param="clump"]'); await clump.scrollIntoViewIfNeeded();
  const initialClump = +await clump.inputValue();
  await clump.focus(); await clump.press('Home'); await clump.press('ArrowRight');
  assert.equal(+await clump.inputValue(), 0.01, 'native slider keyboard input reaches groom');
  await page.evaluate((value) => window.Taierzhuang.Debug.HairRange.Set('clump', value), initialClump);
  await page.evaluate(() => window.Taierzhuang.Debug.HairRange.ShowPanel(false));

  for (const [index,name] of [[6,'LongStraightShellCrown'],[18,'LongWavyCrown']]) {
    await page.evaluate(index=>{const api=Taierzhuang.Debug.HairRange;api.Focus(index,'top');api.Lod('shell');},index);
    await Shot(name);
  }
  await page.evaluate(()=>Taierzhuang.Debug.HairRange.Lod('auto'));
  console.log('--- Hair lab: forced tiers, automatic distance transitions and costs');
  result.cost = await page.evaluate(() => {
    const t = window.Taierzhuang, a = t.Debug.HairRange;
    const heads = t.scene.getObjectByName('HairRangeSpecimens').children;
    heads.forEach((head, i) => { head.visible = i === 9; });
    a.Focus(9, 'front');
    const costs = {};
    for (const mode of ['strands', 'cards', 'shell']) {
      a.Lod(mode); t.StepFrames(20, 1 / 60, true);
      const mesh = heads[9].getObjectByName({ strands: 'HairStrands', cards: 'HairCards', shell: 'HairShell' }[mode]);
      const original = mesh.onBeforeRender; let draws = 0;
      mesh.onBeforeRender = function (...args) { original.apply(this, args); if (!args[4].userData.hairPrepass) draws++; };
      const times = [], beforeFrame = t.renderer.info.render.frame;
      try {
        for (let i = 0; i < 12; i++) { const start = performance.now(); t.StepFrames(1, 1 / 60, true); t.renderer.getContext().finish(); times.push(performance.now() - start); }
      } finally { mesh.onBeforeRender = original; }
      if (draws < 12) throw new Error(`${mode}: measured frames must draw the selected hair (${draws}/12)`);
      times.sort((x, y) => x - y);
      costs[mode] = { ...a.State().stations[9], mainDraws: draws, renderPasses: t.renderer.info.render.frame - beforeFrame, p50Ms: +times[6].toFixed(2), p95Ms: +times[11].toFixed(2) };
    }
    heads.forEach((head) => { head.visible = true; }); a.Lod('auto'); a.Camera('walk');
    const lods = new Set();
    for (let i = 0; i < 48; i++) { t.StepFrames(1, 0.15, true); lods.add(a.State().stations[3].lod); }
    a.Camera('overview'); return { costs, automaticLods: [...lods], canvas: [t.renderer.domElement.width, t.renderer.domElement.height], internal: [t.post.width, t.post.height], quality: t.post.quality, renderer: t.renderer.getContext().getParameter(t.renderer.getContext().RENDERER) };
  });
  assert.ok(result.cost.costs.strands.triangles > result.cost.costs.cards.triangles);
  assert.ok(result.cost.costs.cards.triangles > result.cost.costs.shell.triangles);
  assert.ok(['strands', 'cards', 'shell'].every((mode) => result.cost.automaticLods.includes(mode)), 'distance walk reaches all three automatic tiers');

  if (!process.env.HAIR_PERF_ONLY) {
  console.log('--- Game characters: actual blockout/play consumer and head/cap fit');
  await page.goto(`${base}/Taierzhuang1938/?editor=blockout&level=FirstLevel0105&quality=high&shot=1&manual=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.Taierzhuang?.Debug?.Blockout?.XBot?.().ready, null, { timeout: 400000, polling: 1000 });
  result.characters = {};
  for (let keyframe = 0; keyframe < 24; keyframe++) {
    await page.evaluate((index) => { window.Taierzhuang.Debug.Blockout.GoTo(index); window.Taierzhuang.StepFrames(4, 1 / 60, true); }, keyframe);
    const found = await page.evaluate((keys) => {
      const out = {};
      window.Taierzhuang.scene.traverse((o) => {
        if (!keys.some((key) => o.name === `Hair_${key}`)) return;
        for (let p = o; p; p = p.parent) if (!p.visible) return;
        let parent = o; while (parent && !parent.userData.xbotSkin) parent = parent.parent;
        const skin = parent?.userData.xbotSkin;
        if (skin) out[skin.kit.key] = { bone: o.parent.name, ...skin.hair.stats, matrix: o.matrixWorld.toArray() };
      }); return out;
    }, keyframeKeys);
    for (const key of Object.keys(found)) {
      if (result.characters[key]) continue;
      result.characters[key] = { keyframe, ...found[key] };
      assert.equal(found[key].bone, 'Head');
      for (const view of ['front', 'side', 'back', 'far']) {
        await page.evaluate(async ({ key, view }) => {
          const T = await import('three'), t = window.Taierzhuang;
          let root = null;
          t.scene.traverse((o) => { if (root || o.name !== `Hair_${key}`) return; for (let p = o; p; p = p.parent) if (!p.visible) return; root = o; });
          root.updateWorldMatrix(true, false);
          const at = new T.Vector3(0, 0.19, 0).applyMatrix4(root.matrixWorld);
          const dir = new T.Vector3(view === 'side' ? 1 : 0, 0, view === 'back' ? 1 : view === 'side' ? 0 : -1).transformDirection(root.matrixWorld);
          const eye = at.clone().addScaledVector(dir, view === 'far' ? 6 : 0.66); eye.y += view === 'far' ? 0.7 : 0.02;
          const d = at.clone().sub(eye), pose = { x: eye.x, y: eye.y, z: eye.z, yawDeg: Math.atan2(-d.x, -d.z) * 180 / Math.PI, pitchDeg: Math.atan2(d.y, Math.hypot(d.x, d.z)) * 180 / Math.PI };
          t.Debug.Blockout.Fly(true, pose); t.Debug.Blockout.FlyPose(pose);
          t.StepFrames(1, 0, true);
          let parent = root; while (parent && !parent.userData.xbotSkin) parent = parent.parent;
          parent?.userData.xbotSkin.hair.Update(1, t.camera, t.renderer);
        }, { key, view });
        await page.evaluate(() => window.Taierzhuang.StepFrames(24, 0, true));
        await page.screenshot({ path: path.join(out, `Game_${key}_${view}.png`) });
      }
    }
    if (Object.keys(result.characters).length === keyframeKeys.length) break;
  }
  // Shunzi is the player: this level creates his third-person actor in the
  // drag sequence, rather than in ordinary keyframe unit lists.
  if (keyframeKeys.includes('shunzi') && !result.characters.shunzi) {
    await page.evaluate(() => {
      window.__hairPrevizError = null;
      // Play resolves when the sequence ends; this manual-clock test seeks
      // after startup and stops it itself.
      void window.Taierzhuang.Debug.Blockout.Previz.Play('02-4').catch((error) => { window.__hairPrevizError = String(error); });
    });
    await page.waitForFunction(() => {
      if (window.__hairPrevizError) throw new Error(window.__hairPrevizError);
      return window.Taierzhuang.Debug.Blockout.Previz.State().playing;
    }, null, { timeout: 180000, polling: 200 });
    await page.evaluate(() => window.Taierzhuang.Debug.Blockout.Previz.Seek(3));
    await Step(3);
    result.characters.shunzi = await page.evaluate(() => {
      const t = window.Taierzhuang, root = t.scene.getObjectByName('Hair_shunzi');
      if (!root) return null;
      let parent = root; while (parent && !parent.userData.xbotSkin) parent = parent.parent;
      const skin = parent?.userData.xbotSkin;
      return { sequence: '02-4', bone: root.parent.name, ...skin.hair.stats, matrix: root.matrixWorld.toArray(), camera: t.Debug.Blockout.Previz.State().camera };
    });
    assert.ok(result.characters.shunzi, 'the real drag sequence creates Shunzi with his groom');
    assert.equal(result.characters.shunzi.bone, 'Head');
    await page.screenshot({ path: path.join(out, 'Game_shunzi_timeline.png') });
    await page.evaluate(() => window.Taierzhuang.Debug.Blockout.Previz.Stop());
    await Step(2);
  }
  assert.deepEqual(Object.keys(result.characters).sort(), keyframeKeys.slice().sort());

  const started = await page.evaluate(() => window.Taierzhuang.Debug.Blockout.Play.Start({ from: '02-4', to: '02-4', settings: { invincible: true, infiniteAmmo: true, previz: false } }));
  assert.ok(started, 'start actual AI play in the formal scene');
  await Step(90);
  result.play = await page.evaluate(() => ({
    scene: window.Taierzhuang.Debug.Blockout.Play.Scene(),
    state: window.Taierzhuang.Debug.Blockout.Play.State(),
    hair: window.Taierzhuang.ai.soldiers.filter((s) => s.alive && s.xbotSkin).map((s) => ({ id: s.blockoutPlayId, kit: s.xbotSkin.kit.key, bone: s.xbotSkin.hair?.root.parent.name, hair: s.xbotSkin.hair?.stats })),
  }));
  assert.equal(result.play.scene.variant, 'play');
  assert.equal(result.play.scene.style, 'formal');
  const configuredAi = result.play.hair.filter((s) => XBOT_CHARACTERS[s.kit]?.groom);
  assert.ok(configuredAi.length > 0 && configuredAi.every((s) => s.bone === 'Head' && s.hair),
    'actual AI soldiers with configured grooms wear their hair and beard');
  assert.ok(result.play.hair.filter((s) => !XBOT_CHARACTERS[s.kit]?.groom).every((s) => !s.hair),
    'unconfigured character variants keep their authored appearance');
  const shadowSafety = await page.evaluate(() => {
    const t = window.Taierzhuang, skins = t.ai.soldiers.filter((s) => s.alive && s.xbotSkin).map((s) => s.xbotSkin);
    for (const skin of skins) { skin.Sync({ exact: true, shadow: false }, 0); skin.Sync({ exact: true, shadow: true }, 0); }
    return skins.every((skin) => !skin.hair || Object.values(skin.hair.meshes).every((mesh) => !mesh.castShadow));
  });
  assert.ok(shadowSafety, 'body shadow toggles must preserve the custom hair shadow policy');
  await page.screenshot({ path: path.join(out, 'FormalPlay.png') });
  await page.evaluate(() => window.Taierzhuang.Debug.Blockout.Play.Stop());
  await page.evaluate(() => window.Taierzhuang.Debug.Blockout.Play.Close());
  await Step(3);
  assert.equal(await page.evaluate(() => window.Taierzhuang.ai.soldiers.filter((s) => s.xbotSkin).length), 0, 'ending play releases spawned hair instances');

  console.log('--- Hair GPU contract: RT1, shared-instance survival and async exit');
  const importMap = fs.readFileSync(path.join(here, 'index.html'), 'utf8').match(/<script type="importmap">[\s\S]*?<\/script>/)[0];
  await page.route('**/__HairFixture', (route) => route.fulfill({ contentType: 'text/html', body: `<!doctype html>${importMap}<body style="margin:0"><canvas></canvas>` }));
  await page.goto(`${base}/Taierzhuang1938/__HairFixture`);
  result.gpu = await page.evaluate(async () => {
    const T = await import('three');
    const { HairGroom, LoadHairGroom, LoadHairAtlas, DisposeHairGroomAsset } = await import('./Script_HairGroom.mjs');
    const { HairRange } = await import('./Script_HairRange.mjs');
    const { ManagedGLTFLoader } = await import('./Script_ModelImports.mjs');
    const { PrepassPass } = await import('./Script_PostPrepass.mjs');
    const { MakeRenderTarget, MakeFullscreenMaterial } = await import('./Script_PostCommon.mjs');
    const Check = (ok, message) => { if (!ok) throw new Error(message); };
    const renderer = new T.WebGLRenderer({ canvas: document.querySelector('canvas') }); renderer.setSize(320, 240);
    const scene = new T.Scene(), camera = new T.PerspectiveCamera(50, 4 / 3, 0.01, 10);
    camera.position.set(0, 0.22, -0.55); camera.lookAt(0, 0.22, 0); camera.updateMatrixWorld();
    const asset = await LoadHairGroom('./Hair/Grooms/Groom_HeYoutian_Cast.bin');
    const atlas = await LoadHairAtlas('./Hair/Textures/Texture_HairCardAtlas.png');
    const groom = new HairGroom(asset, { atlas, lod: 'strands' }); scene.add(groom.root);
    const referenceAtlas = groom.meshes.stubble.material.uniforms.uReferenceMask.value;
    Check(groom.meshes.scalp.material.uniforms.uReferenceMask.value === referenceAtlas, 'scalp and facial hair share the original-reference atlas');
    let referenceAtlasDisposals = 0;
    referenceAtlas.addEventListener('dispose', () => referenceAtlasDisposals++);
    const beardLuminance = groom.meshes.stubble.material.uniforms.uReferenceBeardLuminance.value;
    let luminanceDisposals = 0;
    beardLuminance.addEventListener('dispose', () => luminanceDisposals++);
    const pass = new PrepassPass({ preset: { velocity: true, hzb: false }, hdrCapable: true, hdrType: T.HalfFloatType, targets: {} }); pass.Resize(320, 240);
    const target = MakeRenderTarget(320, 240, { type: T.HalfFloatType });
    const copy = MakeFullscreenMaterial('uniform sampler2D uV;uniform sampler2D uD;varying vec2 vUv;void main(){gl_FragColor=vec4(texture2D(uV,vUv).xy,texture2D(uD,vUv).w,1.);}', { uV: { value: null }, uD: { value: null } });
    const readScene = new T.Scene(), quad = new T.Mesh(new T.PlaneGeometry(2, 2), copy); readScene.add(quad);
    const prev = new T.Matrix4(), vp = new T.Matrix4(), pixels = new Uint16Array(320 * 240 * 4);
    let frame = 0;
    const Draw = () => {
      camera.updateMatrixWorld(); scene.updateMatrixWorld(true); groom.Update(1 / 60, camera, renderer);
      vp.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      pass.Render({ renderer, scene, camera, viewProjection: vp, prevViewProjection: prev, hasPrev: frame++ > 0 });
      copy.uniforms.uV.value = pass.velocityTexture; copy.uniforms.uD.value = pass.normalDepthTexture;
      renderer.setRenderTarget(target); renderer.render(readScene, new T.Camera()); renderer.readRenderTargetPixels(target, 0, 0, 320, 240, pixels);
      prev.copy(vp); pass._SnapshotSkeletons();
      let count = 0, sum = 0, max = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        const z = T.DataUtils.fromHalfFloat(pixels[i + 2]); if (!(z > 0)) continue;
        const x = T.DataUtils.fromHalfFloat(pixels[i]) * 320; Check(Number.isFinite(x) && Number.isFinite(z), 'finite MRT pixels'); count++; sum += x; max = Math.max(max, Math.abs(x));
      } return { count, meanX: sum / Math.max(1, count), maxX: max };
    };
    Draw(); const still = Draw(); Check(still.count > 50 && still.maxX < 0.03, 'stationary hair has visible depth and zero velocity');
    groom.root.position.x += 0.008; const moved = Draw(); Check(Math.abs(moved.meanX) > 1, 'head motion produces real RT1 velocity');
    groom.root.rotation.y += 0.08; const rotated = Draw(); Check(rotated.maxX > 0.1, 'head rotation produces real RT1 velocity');
    groom.root.position.x += 0.008; camera.position.x += 0.008; const tracking = Draw(); Check(Math.abs(tracking.meanX) < 0.05, 'camera tracking cancels head motion');
    groom.root.visible = false; const hidden = Draw(); Check(hidden.count === 0, 'hidden root has no prepass pixels');
    groom.root.position.x += 0.04; groom.root.visible = true; const reappear = Draw(); Check(reappear.maxX < 0.05, 'reappearing hair has no stale object motion');
    const modes = {};
    for (const mode of ['cards', 'shell']) { groom.SetLod(mode); for (let i = 0; i < 18; i++) Draw(); modes[mode] = Draw(); Check(modes[mode].count > 50, `${mode} has actual MRT depth`); }
    const coverage = {};
    for (const mode of ['strands', 'cards']) {
      groom.SetLod(mode); for (let i = 0; i < 18; i++) Draw();
      const expected = new Uint8Array(320 * 240); let covered = 0;
      for (let i = 0; i < expected.length; i++) { expected[i] = T.DataUtils.fromHalfFloat(pixels[i * 4 + 2]) > 0 ? 1 : 0; covered += expected[i]; }
      for (const name of ['scalp', 'stubble']) if (groom.meshes[name]) groom.meshes[name].visible = false;
      renderer.setRenderTarget(target); renderer.setClearColor(0, 0); renderer.clear(); renderer.render(scene, camera);
      renderer.readRenderTargetPixels(target, 0, 0, 320, 240, pixels);
      let mismatches = 0;
      for (let i = 0; i < expected.length; i++) if (expected[i] !== (T.DataUtils.fromHalfFloat(pixels[i * 4 + 3]) > 0.5 ? 1 : 0)) mismatches++;
      coverage[mode] = { covered, mismatches };
      Check(mismatches <= Math.max(2, covered * 0.002), `${mode} colour/prepass alpha coverage agrees (${mismatches}/${covered})`);
    }
    const qualityCaps = {};
    camera.position.z = -0.28; camera.lookAt(0, 0.22, 0);
    groom.SetLod('auto');
    for (const mode of ['shell', 'cards', 'strands']) { groom.maxLod = mode; for (let i = 0; i < 18; i++) Draw(); qualityCaps[mode] = groom.stats.lod; Check(groom.stats.lod === mode, `close-up quality cap ${mode}`); }
    const sibling = new HairGroom(asset, { atlas, lod: 'cards' }); scene.add(sibling.root); sibling.Update(1, camera, renderer);
    renderer.setRenderTarget(null); renderer.render(scene, camera);
    let geoDisposals = 0; for (const g of groom.ownGeometries) g.addEventListener('dispose', () => geoDisposals++);
    groom.Dispose(); groom.Dispose(); Check(geoDisposals === 1, 'instance geometry released exactly once');
    const before = renderer.info.memory.geometries;
    renderer.render(scene, camera); Check(renderer.info.render.calls > 0 && !asset.disposed, 'sibling survives instance disposal');
    sibling.Dispose(); DisposeHairGroomAsset(asset); atlas.dispose();
    Check(referenceAtlasDisposals === 1, 'shared original-reference atlas released exactly once with its owner');
    Check(luminanceDisposals === 1, 'shared beard luminance atlas released exactly once with its owner');
    renderer.render(scene, camera); const after = renderer.info.memory.geometries;
    Check(after < before, 'GPU geometries fall after hair asset release');
    const original = ManagedGLTFLoader.prototype.loadAsync, resources = new Set(), disposed = new Set();
    let enter, release; const entered = new Promise((r) => { enter = r; }), gate = new Promise((r) => { release = r; });
    ManagedGLTFLoader.prototype.loadAsync = async function (...args) {
      const gltf = await original.apply(this, args);
      gltf.scene.traverse((o) => { if (o.isMesh) { resources.add(o.geometry); for (const m of [o.material].flat()) { resources.add(m); for (const v of Object.values(m)) if (v?.isTexture) resources.add(v); } } });
      for (const resource of resources) if (!resource.__hairWatched) { resource.__hairWatched = true; resource.addEventListener('dispose', () => disposed.add(resource)); }
      enter(); await gate; return gltf;
    };
    const host = { renderer, scene, camera, canvas: renderer.domElement, post: { NotifyCameraCut() {} } };
    let range;
    try {
      range = new HairRange(host); await entered; range.Dispose(); release(); await range.loading;
      Check(resources.size > 0 && disposed.size === resources.size, 'all head geometry/material/texture resources finishing after exit are released');
      Check(range.heads.size === 0 && range.assets.size === 0 && range.root.children.length === 0 && !document.querySelector('#hair-range-panel'), 'async exit leaves no assets, objects or DOM');
    } finally { release(); ManagedGLTFLoader.prototype.loadAsync = original; range?.Dispose(); }
    pass.Dispose(); target.dispose(); quad.geometry.dispose(); copy.dispose(); renderer.dispose();
    return { still, moved, rotated, tracking, hidden, reappear, modes, coverage, qualityCaps, memory: { before, after }, referenceAtlasDisposals, luminanceDisposals, lateResources: resources.size, releasedLateResources: disposed.size };
  });
  }
  result.failedRequests = failedRequests; result.errors = errors;
  fs.writeFileSync(path.join(out, process.env.HAIR_PERF_ONLY ? 'Data_HairPerformance.json' : 'Data_HairVerification.json'), JSON.stringify(result, null, 2));
  assert.deepEqual(failedRequests, []);
  assert.deepEqual(errors, [], 'no page or shader errors');
  console.log(JSON.stringify({ costs: result.cost, gpu: result.gpu, characters: Object.keys(result.characters || {}), output: out }, null, 2));
  console.log(process.env.HAIR_PERF_ONLY ? '[hair] measured draw cost passed' : '[hair] lab, character integration, motion and lifetime passed');
} finally { await browser.close(); server?.close(); }
