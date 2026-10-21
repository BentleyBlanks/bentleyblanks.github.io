import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {IsMenuStartup, SandboxUrl} from './Data_StartupRouting.mjs';
import {BuildBrowserBundle} from './Script_BuildBrowserBundle.mjs';
import {ServeRoot} from './Script_DevServer.mjs';
import {LaunchBrowser} from '../PrairieFire1937/Script_BrowserTestKit.mjs';

for (const query of ['', 'quality=high', 'menuPreview=3&menuPreviewUi=0', 'audio=0']) assert.ok(IsMenuStartup(new URLSearchParams(query)), query);
for (const query of ['whitebox=p012', 'range=1', 'impacts=1', 'reactions=1', 'shot=1', 'phase=0', 'poseTest=1', 'editor=fullScene', 'preview=CS_Chuchuan', 'menu=0']) assert.ok(!IsMenuStartup(new URLSearchParams(query)), query);
const target = new URL(SandboxUrl('https://example.test/?menuPreview=3&editor=fullScene&quality=high', 'firstLevelP012Whitebox'));
assert.equal(target.search, '?quality=high&whitebox=p012');
const bundle = await BuildBrowserBundle(), root = path.resolve(import.meta.dirname, '..');
assert.ok(!bundle.menuInputs.some(name => /Script_(Main|Physics|Actor|FirstLevelMissionRuntime|Cutscene|Editor)\.mjs/.test(name)), 'menu graph excludes gameplay and editor runtimes');
const server = await ServeRoot(root, 0); let browser;
const out = path.join(import.meta.dirname, '_shots/MenuStartup'); await fs.mkdir(out, {recursive: true});
try {
  for (const deployed of [false, true]) {
    browser = await LaunchBrowser();
    const page = await browser.newPage({viewport: {width: 1280, height: 720}}), requests = [], errors = [];
    page.on('request', request => requests.push(request.url())); page.on('pageerror', error => errors.push(String(error)));
    if (deployed) {
      await page.route('**/Taierzhuang1938/?*', route => route.fulfill({contentType: 'text/html', body: bundle.html}));
      for (const file of bundle.files) await page.route('**/' + file.name + '?*', route => route.fulfill({contentType: 'text/javascript', body: file.code}));
    }
    const started = performance.now();
    await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/?quality=high`, {waitUntil: 'commit'});
    await page.waitForFunction(() => window.Tengxian?.state.ready && window.Tengxian?.menu.open, null, {timeout: 90000});
    const readyMs = performance.now() - started;
    const snapshot = await page.evaluate(() => {
      const g = window.Tengxian;
      return {state: g.state, room: g.Debug.CommandRoom(), actors: !!g.actorFactory, physics: !!g.physics,
        battlefield: !!g.battlefield, viewmodel: !!g.viewmodel, animation: g.state.levelWarm,
        particles: g.MenuParticles?.Modules().renderers,
        bytes: performance.getEntriesByType('resource').reduce((n, e) => n + e.decodedBodySize, 0)};
    });
    assert.ok(snapshot.room.ready && snapshot.state.standaloneMenu);
    assert.ok(snapshot.particles?.includes('windowMote'), 'standalone menu exposes the shared particle API');
    assert.ok(!snapshot.actors && !snapshot.physics && !snapshot.battlefield && !snapshot.viewmodel && !snapshot.animation);
    // The model, paper artwork, fonts and optional boot paper are the entire title payload.
    const forbidden = requests.filter(url => /\/(Animation|Audio)\/|\/vendor\/rapier\/|\/(Script_Main|Script_BrowserBundle|Script_Physics)\.mjs|\/Model\/(?!Model_CommandRoom\.glb)/.test(url));
    assert.deepEqual(forbidden, [], 'menu must never download game models, audio, animations or physics');
    assert.ok(snapshot.bytes < 35 * 1024 * 1024, 'uncompressed title payload has a full-resource budget');
    await page.screenshot({path: path.join(out, `Scene_${deployed ? 'Bundle' : 'Source'}.png`)});
    await CheckMenuResponse(page);
    await page.click('[data-act="settings"]'); await page.click('[data-setting="sound"]');
    await page.locator('#audio-master').fill('64');
    await page.getByRole('button', {name: '返回', exact: true}).click();
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('tengxian1938_audio_v1')).master), .64);
    assert.ok(!requests.some(url => /\/Audio\//.test(url)), 'menu settings/preview do not fetch gameplay sound packs');
    await page.route('**/*whitebox=p012*', route => route.fulfill({contentType: 'text/html', body: '<title>Campaign navigation</title>'}));
    await page.click('[data-act="start"]'); await page.waitForURL(url => url.searchParams.get('whitebox') === 'p012');
    await page.goBack({waitUntil: 'commit'});
    await page.waitForFunction(() => window.Tengxian?.state.ready && window.Tengxian.menu.open, null, {timeout: 90000});
    const frames = await page.evaluate(() => window.Tengxian.Debug.CommandRoom().frames);
    await page.waitForFunction(before => window.Tengxian.Debug.CommandRoom().frames > before, frames);
    assert.deepEqual(errors, []);
    await fs.writeFile(path.join(out, `Data_${deployed ? 'Bundle' : 'Source'}.json`), JSON.stringify({readyMs, snapshot, requests, errors}, null, 2));
    console.log(`PASS MenuStartup ${deployed ? 'bundle' : 'source'}: ${(readyMs / 1000).toFixed(2)}s, ${(snapshot.bytes / 1048576).toFixed(2)} MiB; no gameplay initialization; sound settings and campaign navigation work`);
    await page.close();
    await browser.close(); browser = null;
  }
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }

async function CheckMenuResponse(page) {
  await page.locator('[data-act="levels"]').hover();
  assert.equal(await page.locator('[data-act="levels"]').evaluate(el => getComputedStyle(el).transitionDuration), '0s');
  await page.click('[data-act="levels"]');
  await page.waitForFunction(() => Tengxian.menu.mode === 'levels' && !Tengxian.menu.pageAnimation);
  assert.ok(await page.getByRole('button', {name: '测试场景', exact: true}).isVisible());
  const response = await page.evaluate(() => {
    const m = Tengxian.menu;
    m.SelectLevel(0);
    const image = m.el.brief.querySelector('img');
    const copyTop = m.el.brief.querySelector('.mnMissionCopy').getBoundingClientRect().top;
    m.SelectLevel(0);
    const sameImage = image === m.el.brief.querySelector('img');
    m.SelectLevel(1);
    const copyShift = Math.abs(copyTop - m.briefLeaving.querySelector('.mnMissionCopy').getBoundingClientRect().top);
    const immediate = m.levelEls[1].getAttribute('aria-current') === 'true';
    const fade = m.briefAnimations.map(a => a.effect.getTiming().duration);
    m.SelectLevel(2); m.SelectLevel(0);
    const cachedImage = image === m.el.brief.querySelector('img');
    return {sameImage, immediate, cachedImage, fade, copyShift,
      actions: m.el.brief.querySelectorAll('.mnMissionStart').length,
      snapshots: m.el.brief.querySelectorAll('.mnBriefLeaving').length};
  });
  assert.ok(response.sameImage && response.immediate && response.cachedImage, 'hover commits immediately and reuses decoded images');
  assert.ok(response.fade.length > 1 && response.fade.every(ms => ms === 150));
  assert.equal(response.actions, 1); assert.equal(response.snapshots, 1);
  assert.ok(response.copyShift < 1, 'outgoing text retains its layout during the crossfade');
  await page.waitForFunction(() => !document.querySelector('.mnBriefLeaving'));
  await page.getByRole('button', {name: '测试场景', exact: true}).click();
  assert.equal(await page.locator('.mnSandboxLevel:visible').count(), 8);
  const routes = await page.evaluate(() => {
    const m = Tengxian.menu, play = m.host.PlaySandbox, keys = [];
    m.host.PlaySandbox = key => keys.push(key);
    try { for (let i = m.campaign.length; i < m.entries.length; i++) m.levelEls[i].click(); }
    finally { m.host.PlaySandbox = play; }
    return keys;
  });
  assert.deepEqual(routes, ['movement', 'weapons', 'range', 'explosions', 'melee', 'gore', 'impacts', 'reactions']);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.mnChapterLevel:visible').count(), 6);
  for (const viewport of [{width:390,height:844}, {width:844,height:390}]) {
    await page.setViewportSize(viewport);
    const layout = await page.locator('.mnTrainingToggle').evaluate(el => {
      const r=el.getBoundingClientRect();
      return {fits:r.x>=0 && r.right<=innerWidth && r.top>=0 && r.bottom<=innerHeight, height:r.height};
    });
    assert.ok(layout.fits && layout.height>=44, 'test scenes remain visible on phone and short screens');
  }
  await page.setViewportSize({width:1280,height:720});
  await page.emulateMedia({reducedMotion:'reduce'});
  assert.ok(await page.evaluate(() => {
    const m=Tengxian.menu; m.SelectLevel(1); m.Navigate('title');
    return m.mode==='title' && !m.pageAnimation && !document.querySelector('.mnBriefLeaving');
  }));
  await page.emulateMedia({reducedMotion:'no-preference'});
  assert.ok(await page.evaluate(() => {
    const m=Tengxian.menu; m.Navigate('levels'); m.Navigate('title');
    return m.mode==='title' && !m.pendingMode && !m.pageAnimation;
  }), 'a quick return cancels pending navigation');
}
