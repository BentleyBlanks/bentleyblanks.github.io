// Exercise the exact Pages payload, including the ordinary whitebox Start button.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {BuildBrowserBundle} from './Script_BuildBrowserBundle.mjs';
import {LaunchBrowser} from '../PrairieFire1937/Script_BrowserTestKit.mjs';
import {ServeRoot} from './Script_DevServer.mjs';

const result = await BuildBrowserBundle();
assert.ok(result.inputs > 150, 'bundle contains the complete first-party graph');
assert.ok(result.externalImports.every(entry => entry.path === 'three' || entry.path.startsWith('./vendor/')), 'no first-party import waterfall remains');
assert.ok(!result.html.includes('Object.values(map.imports)'), 'production never preloads the source graph');
assert.ok(result.files.find(file => file.name === 'Script_EntryBrowserBundle.mjs').code.includes('Script_BrowserBundle.mjs?v=' + result.version));
assert.ok((result.html.match(/rel="modulepreload"/g) || []).length <= 12);
const root = path.resolve(import.meta.dirname, '..');
const server = await ServeRoot(root, 0);
const browser = await LaunchBrowser();
const outputDir = path.join(os.tmpdir(), 'WhiteboxBootFix');
await fs.mkdir(outputDir, {recursive:true});
try {
  const fixtureName = process.argv.find(value => value.startsWith('--fixture='))?.slice('--fixture='.length);
  const fixtures = [{name:'Whitebox',query:'whitebox=p012'}, {name:'MainMenu',query:''}, {name:'MissingCharacters',query:'whitebox=p012'}]
    .filter(fixture => !fixtureName || fixture.name === fixtureName);
  assert.ok(fixtures.length, 'unknown bundle fixture');
  for (const fixture of fixtures) {
    const page = await browser.newPage({viewport:{width:1280,height:720}});
    const errors = [], modules = new Set(), failedSets = [];
    page.on('console', message => { const match = message.text().match(/外部 PBR「(\w+)」/); if (match) failedSets.push(match[1]); });
    if (fixture.name === 'Whitebox') {
      // The reported DadaoPbr crash needs a real image timeout; encounter startup PBR failures must be safe too.
      await page.route('**/Texture_DadaoBase.webp*', () => {});
      await page.route(/Texture_(?:HandcartWood|WoodCrate|Type89Armor)Base\.webp/, route => route.fulfill({status:404,body:'missing test texture'}));
    }
    if (fixture.name === 'MissingCharacters') {
      await page.route(/Model_(?:HeYoutian|Yaowa|JapaneseSoldierJia)[.]glb/,
        route => route.fulfill({status:503,body:'interrupted character download'}));
      await page.addInitScript(() => {
        window.bundleFixtureErrors=[];
        window.addEventListener('error',event=>window.bundleFixtureErrors.push(event.message));
      });
    }
    page.on('pageerror', error => errors.push(String(error)));
    page.on('request', request => { if (/\.m?js(?:\?|$)/.test(request.url())) modules.add(new URL(request.url()).pathname); });
    await page.route('**/Taierzhuang1938/?*', route => route.fulfill({contentType:'text/html',body:result.html}));
    let releaseBundle;
    const bundleGate = fixture.name === 'Whitebox' ? new Promise(resolve => {releaseBundle=resolve;}) : Promise.resolve();
    await page.route('**/Script_BrowserBundle.mjs?*', async route => { await bundleGate; await route.fulfill({contentType:'text/javascript',body:result.code}); });
    for (const file of result.files.filter(file => file.name !== result.bundleName))
      await page.route('**/' + file.name + '?*', route => route.fulfill({contentType:'text/javascript',body:file.code}));
    const started = Date.now();
    await page.goto('http://127.0.0.1:' + server.address().port + '/Taierzhuang1938/?' + fixture.query + '&quality=low&scale=small', {waitUntil:'commit',timeout:60000});
    if (releaseBundle) {
      try {
        await page.waitForFunction(() => document.getElementById('bootStep')?.textContent.startsWith('加载较慢：'), null, {timeout:40000});
        assert.equal(await page.locator('#bootRetry').count(), 1, 'slow downloads offer an optional retry without reporting failure');
      } finally { releaseBundle(); }
    }
    try {
      await page.waitForFunction(() => window.Tengxian?.state?.ready || document.getElementById('bootStep')?.textContent.startsWith('启动失败：'), null, {timeout:180000});
    } catch (error) {
      console.log('BOOT FAILURE', fixture.name, await page.locator('#bootStep').textContent(), errors);
      throw error;
    }
    assert.equal(await page.evaluate(() => window.Tengxian?.state?.ready), true, await page.locator('#bootStep').textContent());
    if (fixture.name === 'Whitebox') {
      const expectedFallbacks = ['DadaoPbr','HandcartWood','WoodCrate','Type89Armor'];
      assert.deepEqual(failedSets.sort(), [...expectedFallbacks].sort(), 'only the four interrupted texture sets use fallback materials');
      assert.ok(await page.evaluate(names => names.every(name => { const material=window.Tengxian.library.Get(name); return material.map && material.normalMap && material.roughnessMap; }), expectedFallbacks), 'each fallback supplies a usable complete PBR material');
      assert.equal(await page.locator('#bootRetry').count(), 0, 'normal boot clears the slow-download notice');
      assert.ok(await page.locator('#bootStart').isEnabled());
      await page.locator('#bootStart').click();
      await page.waitForFunction(() => window.Tengxian.state.running && document.getElementById('boot').classList.contains('gone'), null, {timeout:10000});
      await page.waitForFunction(() => {
        const m = window.Tengxian.Debug.FirstLevelMission();
        return m && m.opening && m.time > 0.05;
      }, null, {timeout:30000});
      const opening = await page.evaluate(() => window.Tengxian.Debug.FirstLevelMission());
      assert.equal(opening.variant, 'L1_BeishaheMerged', 'formal level 1 defaults to the merged Beishahe encounter variant');
      assert.equal(opening.stage, '01');
      assert.equal(opening.opening, true);
      await page.evaluate(() => window.Tengxian.Debug.EncounterPlay.SkipOpening());
      await page.waitForFunction(() => {
        const m = window.Tengxian.Debug.FirstLevelMission();
        return m && !m.opening && m.beat === '02g' && m.alive > 0;
      }, null, {timeout:15000});
    } else if (fixture.name === 'MissingCharacters') {
      // Partial character GLB failures must not block formal level 1 boot, opening playback, or 02g combat.
      const bootMission = await page.evaluate(() => window.Tengxian.Debug.FirstLevelMission());
      assert.equal(bootMission.variant, 'L1_BeishaheMerged');
      assert.equal(bootMission.pendingOpening, true);
      await page.locator('#bootStart').click();
      await page.waitForFunction(() => window.Tengxian.state.running && document.getElementById('boot').classList.contains('gone'), null, {timeout:10000});
      await page.waitForFunction(() => window.bundleFixtureErrors.length || (window.Tengxian.Debug.FirstLevelMission()?.opening && window.Tengxian.Debug.FirstLevelMission()?.time > 0.05), null, {timeout:30000});
      assert.deepEqual(await page.evaluate(() => window.bundleFixtureErrors), [], 'opening timeline runs cleanly with missing character GLBs');
      await page.evaluate(() => window.Tengxian.Debug.EncounterPlay.SkipOpening());
      await page.waitForFunction(() => {
        const m = window.Tengxian.Debug.FirstLevelMission();
        return m && !m.opening && m.beat === '02g' && m.alive > 0;
      }, null, {timeout:15000});
      const combat = await page.evaluate(() => {
        const g = window.Tengxian, m = g.Debug.FirstLevelMission();
        const luo = m.actors.find(a => a.id === 'luo');
        const he = m.actors.find(a => a.id === 'he');
        const enemy = m.actors.find(a => a.id === 'opening4');
        const finite = m.actors.every(a => a.position.every(Number.isFinite));
        return { beat: m.beat, alive: m.alive, luo, he, enemy, finite, errors: window.bundleFixtureErrors };
      });
      await fs.writeFile(path.join(outputDir, 'MissingCharacters.json'), JSON.stringify(combat, null, 2));
      assert.deepEqual(combat.errors, [], 'missing character downloads must not crash 02g combat');
      assert.equal(combat.beat, '02g');
      assert.ok(combat.finite && combat.alive >= 4, 'squad and opening enemy remain live with finite transforms');
      assert.equal(combat.luo?.model, 'luo', 'surviving character GLB keeps its formal cast appearance');
      assert.ok(combat.he?.alive && combat.enemy?.alive, 'failed character GLB actors fall back and stay alive');
    } else {
      await page.waitForFunction(()=>window.Tengxian?.Debug?.Menu?.().open,null,{timeout:60000});
      assert.equal(await page.evaluate(() => window.Tengxian.Debug.Menu().open), true);
      await page.evaluate(()=>window.Tengxian.Debug.MenuAct("settings"));
      await page.locator('[data-setting="debug"]').click();
      assert.equal(await page.locator("#firstLevelStageSelect option").count(),13);
      await page.selectOption("#firstLevelStageSelect","08");
      await page.locator('[data-action="firstLevelJump"]').click();
      await page.waitForFunction(()=>window.Tengxian?.state?.running&&!window.Tengxian.state.advancing&&window.Tengxian.Debug.FirstLevelMission()?.stage==="08",null,{timeout:180000});
      const jumped = await page.evaluate(() => window.Tengxian.Debug.FirstLevelMission());
      assert.equal(jumped.variant, 'L1_BeishaheMerged');
      assert.equal(jumped.opening, false);
      assert.equal(jumped.beat, '08a');
    }
    assert.deepEqual(errors, []);
    assert.ok(![...modules].some(url => url.endsWith('/Script_Main.mjs')), 'source entry is not also loaded');
    assert.ok(modules.size <= 20, 'startup remains below 20 distinct script requests: ' + modules.size);
    await page.screenshot({path:path.join(outputDir,fixture.name+'.png')});
    console.log('PASS',fixture.name,JSON.stringify({seconds:(Date.now()-started)/1000,scriptRequests:modules.size,version:result.version,outputDir}));
    await page.close();
  }
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
