import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {IsMenuStartup, SandboxUrl} from './Data_StartupRouting.mjs';
import {BuildBrowserBundle} from './Script_BuildBrowserBundle.mjs';
import {ServeRoot} from './Script_DevServer.mjs';
import {LaunchBrowser} from '../PrairieFire1937/Script_BrowserTestKit.mjs';
import {SANDBOX_RANGE_KEYS} from './Data_SandboxRanges.mjs';

for (const query of ['', 'quality=high', 'menuPreview=3&menuPreviewUi=0', 'audio=0']) assert.ok(IsMenuStartup(new URLSearchParams(query)), query);
for (const query of ['whitebox=p012', ...SANDBOX_RANGE_KEYS.map(key => `${key}=1`), 'shot=1', 'phase=0', 'poseTest=1', 'editor=vfx', 'menu=0']) assert.ok(!IsMenuStartup(new URLSearchParams(query)), query);
const target = new URL(SandboxUrl('https://example.test/?menuPreview=3&editor=vfx&quality=high', 'firstLevelP012Whitebox'));
assert.equal(target.search, '?quality=high&whitebox=p012');
assert.equal(new URL(SandboxUrl('https://example.test/?reactions=1&quality=high', 'cloth')).search, '?quality=high&cloth=1');
assert.equal(new URL(SandboxUrl('https://example.test/?cloth=1&quality=high', 'range')).search, '?quality=high&range=1');
assert.equal(new URL(SandboxUrl('https://example.test/?cloth=1&quality=high', 'hair')).search, '?quality=high&hair=1');
const bundle = await BuildBrowserBundle(), root = path.resolve(import.meta.dirname, '..');
assert.ok(!bundle.menuInputs.some(name => /Script_(Main|Physics|Actor|FirstLevelMissionRuntime|Cutscene|Editor)\.mjs/.test(name)), 'menu graph excludes gameplay and editor runtimes');
const server = await ServeRoot(root, 0); let browser;
const out = path.join(import.meta.dirname, '_shots/MenuStartup'); await fs.mkdir(out, {recursive: true});
try {
  for (const deployed of [false, true]) {
    browser = await LaunchBrowser({extraArgs: ['--mute-audio']});
    const page = await browser.newPage({viewport: {width: 1280, height: 720}}), requests = [], errors = [];
    await page.addInitScript(() => {
      localStorage.setItem('tengxian1938_audio_v1', JSON.stringify({master: 0}));
      localStorage.setItem('tengxian1938_tools_volume_v1', JSON.stringify({volume: 0, muted: true}));
    });
    page.on('request', request => requests.push(request.url())); page.on('pageerror', error => errors.push(String(error)));
    if (deployed) {
      await page.route('**/Taierzhuang1938/?*', route => route.fulfill({contentType: 'text/html', body: bundle.html}));
      for (const file of bundle.files) await page.route('**/' + file.name + '?*', route => route.fulfill({contentType: 'text/javascript', body: file.code}));
    }
    const started = performance.now();
    await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/`, {waitUntil: 'commit'});
    await page.waitForFunction(() => window.Tengxian?.state.ready && window.Tengxian?.menu.open, null, {timeout: 90000});
    const readyMs = performance.now() - started;
    const snapshot = await page.evaluate(() => {
      const g = window.Tengxian;
      return {profile: g.GraphicsProfile.Inspect().profile, state: g.state, room: g.Debug.CommandRoom(), actors: !!g.actorFactory, physics: !!g.physics,
        battlefield: !!g.battlefield, viewmodel: !!g.viewmodel, animation: g.state.levelWarm,
        particles: g.MenuParticles?.Modules().renderers,
        bytes: performance.getEntriesByType('resource').reduce((n, e) => n + e.decodedBodySize, 0)};
    });
    assert.ok(snapshot.room.ready && snapshot.state.standaloneMenu);
    assert.equal(snapshot.profile, "high", "fresh player menu uses normal presentation");
    assert.ok(snapshot.particles?.includes('windowMote'), 'standalone menu exposes the shared particle API');
    assert.ok(!snapshot.actors && !snapshot.physics && !snapshot.battlefield && !snapshot.viewmodel && !snapshot.animation);
    // The model, paper artwork, fonts and optional boot paper are the entire title payload.
    const forbidden = requests.filter(url => /\/(Animation|Audio)\/|\/vendor\/rapier\/|\/(Script_Main|Script_BrowserBundle|Script_Physics)\.mjs|\/Model\/(?!Model_CommandRoom\.glb)/.test(url));
    assert.deepEqual(forbidden, [], 'menu must never download game models, audio, animations or physics');
    assert.ok(snapshot.bytes < 35 * 1024 * 1024, 'uncompressed title payload has a full-resource budget');
    await page.screenshot({path: path.join(out, `Scene_${deployed ? 'Bundle' : 'Source'}.png`)});
    await CheckMenuResponse(page, deployed);
    await page.click('[data-act="settings"]'); await CheckGraphicsPage(page);
    await page.click('[data-setting="sound"]');
    await page.locator('#audio-master').fill('64');
    await page.locator('.mnSettingsDetailBody .audioAction', {hasText: '返回'}).click();
    assert.equal(await page.evaluate(() => document.activeElement?.dataset.setting), 'sound', 'sound page back returns focus to the settings list');
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => window.Tengxian.menu.mode), 'title');
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

// 画面页整理（常用 + 折叠分组）只改组织，不许少选项：期望清单是整理前页面的全部控件。
async function CheckGraphicsPage(page) {
  const GRAPHICS_TOGGLES = ["阴影", "第一人称自阴影", "自阴影软化", "第一人称：眼睛处取阳光", "第一人称：本地反射", "第一人称：武器补光", "接触阴影", "实时全局光照", "簇状多光源", "英雄光阴影", "物理大气", "视差遮蔽 POM", "POM 自阴影", "细节法线", "微阴影", "地平线镜面遮蔽", "皮肤预积分散射", "TAA（时域抗锯齿）", "屏幕空间反射", "froxel 体积雾", "屏幕空间体积光（体积雾关时才生效）", "自动曝光", "3D LUT 分级", "泛光 Karis 平均", "断肢表现"];
  const GRAPHICS_SLIDERS = ["渲染分辨率", "深度偏移", "法线偏移", "阴影距离", "阴影强度", "间接光强度", "采样偏移", "反射遮蔽", "光照历史权重", "遮挡历史权重", "烟霾倍率", "视差深度", "细节法线", "微阴影", "地平线遮蔽", "皮肤散射", "当前帧权重", "抖动幅度", "锐化强度", "反射强度", "环境光遮蔽", "泛光", "体积光", "运动模糊", "颗粒", "暗角", "曝光补偿", "镜头光晕", "镜头脏污", "输出抖动", "视野角度"];
  const GRAPHICS_CHIPS = [["默认", "512", "1k", "2k", "4k"], ["ACES", "AgX"]];
  const GRAPHICS_COMMON = ['渲染分辨率', '阴影', '阴影分辨率（每级）', '视野角度', '曝光补偿', '断肢表现'];
  const GRAPHICS_GROUPS = ['shadow', 'fplight', 'gi', 'cluster', 'atmo', 'material', 'aa', 'post', 'camera'];
  const sorted = list => [...list].sort();
  const report = await page.evaluate(() => {
    const root = document.querySelector(".mnSettingsDetailBody .edPanel.gfxSettings");
    const label = (el) => (el.querySelector(".gfxSwitchLabel")?.textContent ?? el.textContent).trim();
    return {
      toggles: [...root.querySelectorAll(".edBtn:not(.danger):not(.gfxAction)")].map(label),
      sliders: [...root.querySelectorAll(".edRow")].map((r) => r.firstElementChild.textContent.trim()),
      chips: [...root.querySelectorAll(".edChips")].map((c) => [...c.querySelectorAll(".edChip")].map((x) => x.textContent.trim())),
      common: [...root.querySelectorAll(".gfxCommon > .gfxRow")].map((r) => r.dataset.gfxName),
      groups: [...root.querySelectorAll(".gfxGroup")].map((d) => [d.dataset.group, d.open]),
    };
  });
  assert.deepEqual(sorted(report.toggles), sorted(GRAPHICS_TOGGLES), 'graphics page keeps every toggle');
  assert.deepEqual(sorted(report.sliders), sorted(GRAPHICS_SLIDERS), 'graphics page keeps every slider');
  assert.deepEqual(sorted(report.chips.map(chips => chips.join('|'))), sorted(GRAPHICS_CHIPS.map(chips => chips.join('|'))), 'graphics page keeps every chip option');
  assert.deepEqual(report.common, GRAPHICS_COMMON, 'common block lists the everyday options');
  assert.deepEqual(report.groups.map(([id]) => id), GRAPHICS_GROUPS, 'nine folding groups');
  assert.ok(report.groups.every(([, open]) => !open), 'groups start collapsed');
  await page.locator('.gfxGroup[data-group="shadow"] summary').click();
  await page.locator('.gfxFooter .danger').click();
  assert.equal(await page.locator('.gfxGroup[data-group="shadow"]').evaluate(el => el.open), true, 'expanded group stays open after reset');
  await page.locator('.gfxGroup[data-group="shadow"] summary').click();
  await page.locator('.gfxCommon .gfxRow[data-gfx-name="曝光补偿"]').hover();
  assert.equal(await page.locator('.gfxDetail h2').textContent(), '曝光补偿', 'hovering a row retitles the side panel');
}

async function CheckMenuResponse(page, deployed) {
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
  assert.equal(await page.locator('.mnSandboxLevel:visible').count(), SANDBOX_RANGE_KEYS.length);
  const hairEntry = page.getByRole('button', {name: /头发胡子测试场/});
  await hairEntry.scrollIntoViewIfNeeded();
  await hairEntry.hover();
  await page.waitForFunction(() => Tengxian.menu.entries[Tengxian.menu.selected]?.sandboxKey === 'hair' && !document.querySelector('.mnBriefLeaving'));
  assert.ok(await hairEntry.isVisible(), 'hair lab is discoverable in the visible test-scene menu');
  await page.screenshot({path: path.join(out, `Scene_TestScenes_${deployed ? 'Bundle' : 'Source'}.png`)});
  const routes = await page.evaluate(() => {
    const m = Tengxian.menu, play = m.host.PlaySandbox, keys = [];
    m.host.PlaySandbox = key => keys.push(key);
    try { for (let i = m.campaign.length; i < m.entries.length; i++) m.levelEls[i].click(); }
    finally { m.host.PlaySandbox = play; }
    return keys;
  });
  assert.deepEqual(routes, SANDBOX_RANGE_KEYS, 'every registered test scene has a working visible menu route');
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
  await page.click('[data-act="levels"]');
  await page.waitForFunction(() => Tengxian.menu.mode === 'levels' && !Tengxian.menu.pageAnimation && !Tengxian.menu.pendingMode);
  await page.getByRole('button', {name: '测试场景', exact: true}).click();
  await page.route('**/*hair=1*', route => route.fulfill({contentType: 'text/html', body: '<title>Hair lab navigation</title>'}));
  await page.getByRole('button', {name: /头发胡子测试场/}).click();
  await page.waitForURL(url => url.searchParams.get('hair') === '1');
  await page.goBack({waitUntil: 'commit'});
  await page.waitForFunction(() => window.Tengxian?.state.ready && window.Tengxian.menu.open, null, {timeout: 90000});
  await page.evaluate(() => Tengxian.menu.Show('title'));
}
