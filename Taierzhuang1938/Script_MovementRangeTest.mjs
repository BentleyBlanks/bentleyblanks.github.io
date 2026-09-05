// Real-input acceptance for the permanent movement lab. Screenshots stay in _shots/.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LaunchBrowser } from '../PrairieFire1937/Script_BrowserTestKit.mjs';
import { ServeRoot } from './Script_DevServer.mjs';
import { TRAVERSAL } from './Data_Traversal.mjs';
const dir = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(dir, '_shots', 'MovementRange'); mkdirSync(out, { recursive: true });
const server = await ServeRoot(path.resolve(dir, '..'), 0);
let browser;
const errors = [], evidence = {};
try {
  browser = await LaunchBrowser();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', error => errors.push(String(error)));
  const base = process.argv.find(a => a.startsWith('--url='))?.slice(6) || 'http://127.0.0.1:' + server.address().port;
  const entry = process.argv.find(a => a.startsWith('--entry='))?.slice(8) || '/Taierzhuang1938/';
  await page.goto(base + entry + '?movement=1&shot=1&manual=1&quality=medium&scale=small&audio=0', { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.Taierzhuang?.state.ready && window.Taierzhuang?.Debug.MovementRange, null, { timeout: 180000 });
  evidence.boot = await page.evaluate(async () => {
    const T = window.Taierzhuang; T.StepFrames(30, 1 / 60, false);
    const { MovementRangeSigns } = await import('./Script_MovementRangeField.mjs');
    const fixtures = T.Debug.MovementRange.Fixtures();
    const field = T.player.world;
    const fixtureBounds = fixtures.map(f => ({ id: f.id, exact: field.colliders.some(b =>
      Math.abs((b.min[0] + b.max[0]) / 2 - f.x) < 0.001 && Math.abs((b.min[2] + b.max[2]) / 2 - f.z) < 0.001
      && (f.kind === 'height' ? Math.abs(b.max[1] - f.h) < 0.001 : Math.abs(b.min[1] - f.clearance) < 0.001)) }));
    let signTriangles = 0, hasAtlas = false;
    T.scene.traverse(o => { if (o.material?.name === 'MovementRangeSigns') { signTriangles += (o.geometry.index?.count || o.geometry.attributes.position.count) / 3; hasAtlas ||= !!o.material.map?.image?.width; } });
    return { sky: T.sky.presetName, level: T.Debug.Level().id, pinned: T.state.pinned, soldiers: T.ai.soldiers.length,
      signs: MovementRangeSigns(), signTriangles, hasAtlas, fixtureBounds, external: T.Debug.MovementRange.State().environment.external,
      panel: getComputedStyle(document.querySelector('#movementRangePanel')).display !== 'none', start: T.Debug.MovementRange.State() };
  });
  assert.equal(evidence.boot.sky, 'testSceneDay'); assert.equal(evidence.boot.level, 'MovementRange'); assert.equal(evidence.boot.pinned, true);
  assert.equal(evidence.boot.soldiers, 0); assert.equal(evidence.boot.external.count, 0);
  assert.ok(evidence.boot.fixtureBounds.every(f => f.exact), 'visible fixture dimensions must match physical boxes');
  assert.ok(evidence.boot.signTriangles >= evidence.boot.signs.length * 2 && evidence.boot.hasAtlas && evidence.boot.panel);
  console.log('ok  Independent empty scene, all physical dimensions and readable ruler atlas');
  evidence.jumps = await page.evaluate(() => {
    const T = window.Taierzhuang, api = T.Debug.MovementRange;
    api.GoTo('RunJump'); T.StepFrames(40, 1 / 60, false); T.Debug.Key('Space'); T.StepFrames(75, 1 / 60, false);
    const standing = api.State().last;
    api.GoTo('RunJump'); T.StepFrames(40, 1 / 60, false);
    T.Debug.Key('KeyW', true); T.Debug.Key('ShiftLeft', true); T.StepFrames(120, 1 / 60, false);
    T.Debug.Key('Space'); T.StepFrames(45, 1 / 60, false);
    T.Debug.Key('KeyW', false); T.Debug.Key('ShiftLeft', false); T.StepFrames(10, 1 / 60, false);
    const running = api.State().last, best = api.State().best;
    return { standing, running, best };
  });
  const { standing, running } = evidence.jumps;
  assert.equal(standing.kind, 'jump'); assert.equal(running.kind, 'runJump');
  assert.ok(standing.riseM > 0.35 && standing.riseM < TRAVERSAL.jumpRiseMax);
  assert.ok(running.riseM > standing.riseM && running.riseM < TRAVERSAL.jumpRiseMax);
  assert.ok(running.distanceM > 2.5 && running.sameLevel && evidence.jumps.best.runJump.distanceM > 2.5);
  console.log('ok  Space jumps and sprint jumps measured separately: ' + JSON.stringify(evidence.jumps));
  evidence.vaults = await page.evaluate(() => {
    const T = window.Taierzhuang, api = T.Debug.MovementRange;
    const results = [];
    for (const id of ['Vault2', 'Vault5', 'Vault6']) {
      api.GoTo(id); T.StepFrames(35, 1 / 60, false); T.Debug.Key('KeyW', true); T.StepFrames(22, 1 / 60, false); T.Debug.Key('KeyW', false); T.StepFrames(15, 1 / 60, false);
      T.Debug.Key('Space'); T.StepFrames(130, 1 / 60, false); results.push({ id, last: api.State().last, position: T.player.position.toArray() });
    }
    return results;
  });
  assert.equal(evidence.vaults[0].last.kind, 'vault');
  assert.ok(Math.abs(evidence.vaults[0].last.obstacleHeightM - TRAVERSAL.vaultMax) < 0.05);
  assert.equal(evidence.vaults[1].last.kind, 'mantle');
  assert.ok(Math.abs(evidence.vaults[1].last.obstacleHeightM - TRAVERSAL.mantleMax) < 0.05);
  assert.equal(evidence.vaults[2].last.kind, 'jump', 'above-limit wall must refuse both traversal verbs');
  console.log('ok  Vault/mantle limit and over-limit blocker');
  evidence.stances = await page.evaluate(() => {
    const T = window.Taierzhuang, api = T.Debug.MovementRange, rows = [];
    for (const [id, key, frames] of [['Crouch1', null, 240], ['Crouch1', 'KeyC', 440], ['Prone1', 'KeyZ', 900]]) {
      api.GoTo(id); T.StepFrames(40, 1 / 60, false); if (key) T.Debug.Key(key); T.StepFrames(45, 1 / 60, false);
      const from = T.player.position.z; T.Debug.Key('KeyW', true); T.StepFrames(frames, 1 / 60, false); T.Debug.Key('KeyW', false);
      rows.push({ id, key, stance: T.player.stance, distanceM: from - T.player.position.z, speed: Math.hypot(T.player.velocity.x, T.player.velocity.z) });
    }
    api.GoTo('Prone'); T.StepFrames(35, 1 / 60, false); T.Debug.Key('KeyZ'); T.StepFrames(40, 1 / 60, false);
    const count = T.player.jump.count; T.Debug.Key('Space'); T.StepFrames(40, 1 / 60, false);
    return { rows, standUp: T.player.stance, noAccidentalJump: T.player.jump.count === count };
  });
  assert.ok(evidence.stances.rows[0].distanceM < 2, 'standing character is stopped by crouch tunnel');
  assert.ok(evidence.stances.rows[1].distanceM > 8, 'crouching movement passes the physical tunnel');
  assert.ok(evidence.stances.rows[2].distanceM > 8, 'prone movement passes the physical tunnel');
  assert.equal(evidence.stances.standUp, 'stand'); assert.ok(evidence.stances.noAccidentalJump);
  console.log('ok  Actual crouch/prone tunnel movement and stand-up without jumping');
  for (const id of ['Jump', 'RunJump', 'Vault', 'Crouch', 'Prone']) {
    await page.evaluate(id => { const T = window.Taierzhuang; T.Debug.MovementRange.GoTo(id); T.StepFrames(40); }, id);
    await page.screenshot({ path: path.join(out, id + '.png') });
  }
  await page.evaluate(() => {
    const T = window.Taierzhuang, x = 3194, y = 48, z = 3240;
    T.post.hasTaaHistory = false;
    for (let i = 0; i < 30; i++) {
      T.player.position.set(x, y - T.player.eyeHeight, z); T.player.body.Teleport(x, y - T.player.eyeHeight, z);
      T.player.velocity.set(0, 0, 0); T.player.yaw = 0;
      T.player.pitch = Math.atan2(-y, 55); T.player.aimYaw = 0; T.player.aimPitch = 0; T.StepFrames(1);
    }
  });
  await page.screenshot({ path: path.join(out, 'Overview.png') });
  evidence.reset = await page.evaluate(() => {
    const T = window.Taierzhuang, api = T.Debug.MovementRange;
    api.GoTo('Jump'); T.StepFrames(10, 1 / 60, false); T.Debug.Key('PageDown');
    const next = api.State().station;
    T.player.stamina = 0.1; T.Debug.Key('Home');
    const stamina = T.player.stamina;
    T.Debug.Key('Space'); T.StepFrames(5, 1 / 60, false); T.Debug.Key('Home'); T.StepFrames(45, 1 / 60, false);
    const aborted = !api.State().active;
    api.Clear(); T.StepFrames(200, 1 / 60, false);
    return { next, stamina, aborted, history: api.State().history.length, best: api.State().best,
      soldiers: T.ai.soldiers.length, panelCount: document.querySelectorAll('#movementRangePanel').length };
  });
  assert.equal(evidence.reset.next, 'RunJump'); assert.equal(evidence.reset.stamina, 1);
  assert.ok(evidence.reset.aborted); assert.equal(evidence.reset.history, 0); assert.deepEqual(evidence.reset.best, {});
  assert.equal(evidence.reset.soldiers, 0); assert.equal(evidence.reset.panelCount, 1);
  const menuPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  menuPage.on('pageerror', error => errors.push(String(error)));
  await menuPage.goto(base + entry + '?movement=1&manual=1&quality=medium&scale=small&audio=0', { waitUntil: 'load', timeout: 120000 });
  await menuPage.waitForFunction(() => window.Taierzhuang?.state.ready, null, { timeout: 180000 });
  assert.equal(await menuPage.locator('#bootStart').textContent(), '进入操作测试场');
  await menuPage.locator('#bootStart').click();
  await menuPage.evaluate(() => window.Taierzhuang.StepFrames(10));
  assert.ok(await menuPage.locator('#movementRangePanel').isVisible());
  await menuPage.keyboard.down('Alt');
  await menuPage.locator('[data-station="Crouch"]').click({ modifiers: ['Alt'] });
  await menuPage.keyboard.up('Alt');
  assert.equal(await menuPage.evaluate(() => window.Taierzhuang.Debug.MovementRange.State().station), 'Crouch');
  await menuPage.keyboard.press('Escape');
  assert.ok(await menuPage.locator('#menu [data-act="exitSandbox"]').isVisible());
  assert.equal(await menuPage.locator('#menu [data-act="exitSandbox"]').textContent().then(s => s.includes('退出操作测试场')), true);
  assert.equal(await menuPage.locator('#movementRangePanel').isVisible(), false);
  let exitUrl;
  await menuPage.route('**/*', async route => {
    if (route.request().isNavigationRequest()) { exitUrl = route.request().url(); await route.abort(); }
    else await route.continue();
  });
  await menuPage.locator('#menu [data-act="exitSandbox"]').click({ noWaitAfter: true });
  for (let i = 0; i < 20 && !exitUrl; i++) await menuPage.waitForTimeout(50);
  assert.ok(exitUrl && !new URL(exitUrl).searchParams.has('movement'));
  evidence.menu = { entry, exitUrl, panelClickable: true, pauseHidesPanel: true };
  await menuPage.close();
  assert.deepEqual(errors, []);
  console.log('MovementRangeTest PASS: rulers, input, limits, stance, reset and local screenshots');
} finally {
  writeFileSync(path.join(out, 'Data_Acceptance.json'), JSON.stringify({ ...evidence, errors }, null, 2));
  await browser?.close(); await new Promise(resolve => server.close(resolve));
}
