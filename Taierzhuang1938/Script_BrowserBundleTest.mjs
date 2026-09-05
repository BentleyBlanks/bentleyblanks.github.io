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
assert.ok(result.html.includes('Script_BrowserBundle.mjs?v=' + result.version));
assert.ok((result.html.match(/rel="modulepreload"/g) || []).length <= 12);
const root = path.resolve(import.meta.dirname, '..');
const server = await ServeRoot(root, 0);
const browser = await LaunchBrowser();
const outputDir = path.join(os.tmpdir(), 'WhiteboxBootFix');
await fs.mkdir(outputDir, {recursive:true});
try {
  for (const fixture of [{name:'Whitebox',query:'whitebox=p012'}, {name:'MainMenu',query:''}]) {
    const page = await browser.newPage({viewport:{width:1280,height:800}});
    const errors = [], modules = new Set(), failedSets = [];
    page.on('console', message => { const match = message.text().match(/外部 PBR「(\w+)」/); if (match) failedSets.push(match[1]); });
    if (fixture.name === 'Whitebox') {
      // The reported DadaoPbr crash needs a real image timeout; carriage failures must be safe too.
      await page.route('**/Texture_DadaoBase.webp*', () => {});
      await page.route(/Texture_Carriage(?:BenchWood|FloorSteel|CeilingSteel)Base\.webp/, route => route.fulfill({status:404,body:'missing test texture'}));
    }
    page.on('pageerror', error => errors.push(String(error)));
    page.on('request', request => { if (/\.m?js(?:\?|$)/.test(request.url())) modules.add(new URL(request.url()).pathname); });
    await page.route('**/Taierzhuang1938/?*', route => route.fulfill({contentType:'text/html',body:result.html}));
    let releaseBundle;
    const bundleGate = fixture.name === 'Whitebox' ? new Promise(resolve => {releaseBundle=resolve;}) : Promise.resolve();
    await page.route('**/Script_BrowserBundle.mjs?*', async route => { await bundleGate; await route.fulfill({contentType:'text/javascript',body:result.code}); });
    const started = Date.now();
    await page.goto('http://127.0.0.1:' + server.address().port + '/Taierzhuang1938/?' + fixture.query + '&quality=low&scale=small', {waitUntil:'commit',timeout:60000});
    if (releaseBundle) {
      try {
        await page.waitForFunction(() => document.getElementById('bootStep')?.textContent.startsWith('加载较慢：'), null, {timeout:40000});
        assert.equal(await page.locator('#bootRetry').count(), 1, 'slow downloads offer an optional retry without reporting failure');
      } finally { releaseBundle(); }
    }
    await page.waitForFunction(() => window.Tengxian?.state?.ready || document.getElementById('bootStep')?.textContent.startsWith('启动失败：'), null, {timeout:180000});
    assert.equal(await page.evaluate(() => window.Tengxian?.state?.ready), true, await page.locator('#bootStep').textContent());
    if (fixture.name === 'Whitebox') {
      const expectedFallbacks = ['DadaoPbr','CarriageBenchWood','CarriageFloorSteel','CarriageCeilingSteel'];
      assert.deepEqual(failedSets.sort(), [...expectedFallbacks].sort(), 'only the four interrupted texture sets use fallback materials');
      assert.ok(await page.evaluate(names => names.every(name => { const material=window.Tengxian.library.Get(name); return material.map && material.normalMap && material.roughnessMap; }), expectedFallbacks), 'each fallback supplies a usable complete PBR material');
      assert.equal(await page.locator('#bootRetry').count(), 0, 'normal boot clears the slow-download notice');
      assert.ok(await page.locator('#bootStart').isEnabled());
      await page.locator('#bootStart').click();
      await page.waitForFunction(() => window.Tengxian.state.running && document.getElementById('boot').classList.contains('gone'), null, {timeout:10000});
      const before = await page.evaluate(() => window.Tengxian.Debug.P012().elapsed);
      await page.waitForFunction(before => window.Tengxian.Debug.P012().elapsed > before, before, {timeout:10000});
      assert.ok(await page.evaluate(() => !!window.Tengxian.Debug.P012Scene().stageZero));
    } else {
      assert.equal(await page.evaluate(() => window.Tengxian.Debug.Menu().open), true);
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
