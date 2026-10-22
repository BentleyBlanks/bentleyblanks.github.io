import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url)), root = path.dirname(here);
const common = path.resolve(root, execFileSync('git', ['rev-parse', '--git-common-dir'], {cwd: root, encoding: 'utf8'}).trim());
const require = createRequire(path.join(path.dirname(common), 'package.json')), {chromium} = require('playwright-core');
const url = process.argv.find(argument => argument.startsWith('--url='))?.slice(6);
assert.ok(url, 'Pass --url= for this worktree');
const browser = await chromium.launch({executablePath: process.env.EARSPA_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true, args: ['--mute-audio']});
const page = await browser.newPage({viewport: {width: 1280, height: 720}});
const out = path.join(here, '_dev'); await fs.mkdir(out, {recursive: true});
const report = {checks: [], errors: [], viewport: {width: 1280, height: 720}, evidence: 'Settlement uses explicitly controlled harvest fixtures. Every sale, purchase, equipment upgrade and tab change uses real UI clicks. This test does not claim physical extraction coverage; combine it with Script_AssistedPlayTest.mjs.'};
const Check = (ok, label) => {assert.ok(ok, label); report.checks.push(label);};
const Probe = () => page.evaluate(() => __EarSpaProbe());
const Step = n => page.evaluate(n => __EarSpaDebug.StepFrames(n), n);
const Shot = name => page.screenshot({path: path.join(out, 'Shot_CareerShop' + name + '.png')});
page.on('pageerror', error => report.errors.push(error.message));
page.on('console', message => {if (message.type() === 'error') report.errors.push(message.text());});
page.on('response', response => {if (response.status() >= 400) report.errors.push(response.status() + ' ' + response.url());});
await page.addInitScript(() => {localStorage.setItem('earspa3d.calm.settings', JSON.stringify({master: 0, sfx: 0, bgm: 0, muted: true, haptics: false}));});
async function Ready() {
  await page.waitForFunction(() => window.__EarSpaDebug && __EarSpaProbe().viewReady, null, {timeout: 90000});
  await page.evaluate(() => {window.requestAnimationFrame = () => 0;});
  await page.locator('#ear-start').click(); await Step(150);
}
async function OpenShop(tab) {await page.locator('#shop-open').click(); await page.locator('[data-shop-tab="' + tab + '"]').click();}
try {
  await page.goto(url + (url.includes('?') ? '&' : '?') + 'debug=1'); await Ready();
  let p = await Probe(); report.version = p.version;
  Check(p.shop.coins === 0 && p.shop.inventory.tools.join(',') === 'scoop', 'fresh career shows only the basic spoon with zero starting money');
  Check(p.rendering.lampEquipment.intensity === 55 && !p.rendering.lampEquipment.mounted, 'fresh scene consumes the fixed weak lamp configuration');
  // The single dry-sheet receipt is a settlement fixture, not a claimed physical extraction.
  const first = await page.evaluate(() => {
    const {shop, view} = __EarSpaDebug; shop.RegisterServiceSources(view.Targets());
    const c = view.Targets().find(piece => piece.id === 3);
    return shop.FinishCustomer({harvest: [{...c, fragment: false, generation: 0}], comfort01: .85, painCount: 0, caseResult: {id: 'drySheet', complete: true}});
  });
  Check(first.labor === 18 && first.tip === 8 && first.collectionValue === 5, 'controlled first case yields separate base fee, comfort tip and pending collection');
  await OpenShop('collection');
  Check(await page.locator('[data-sell-collection]').count() === 1, 'saved unsold collection appears as a sellable card');
  await Shot('FirstCollection');
  const itemId = (await Probe()).shop.collection[0].id;
  await page.locator('[data-sell-collection]').click(); p = await Probe();
  Check(p.shop.coins === 31 && p.shop.collection.length === 0, 'real sell button credits exactly five coins and removes the collection');
  await page.locator('[data-shop-tab="lighting"]').click();
  await page.locator('[data-upgrade-lamp]').click(); p = await Step(1);
  Check(p.shop.coins === 3 && p.shop.lampLevel === 2 && p.rendering.lampEquipment.intensity === 95 && !p.rendering.lampEquipment.mounted, 'real lamp purchase spends 28 and updates actual fixed lamp equipment');
  await Shot('LampUpgrade');
  await page.locator('#shop-close').click(); await page.reload(); await Ready(); p = await Probe();
  Check(p.shop.coins === 3 && p.shop.lampLevel === 2 && p.shop.collection.length === 0 && p.shop.totalCustomers === 1, 'refresh restores money, lamp and sold status without paying the customer again');
  Check(!(await page.evaluate(id => __EarSpaDebug.shop.SellCollection(id), itemId)).ok, 'sold collection ID cannot be sold again after a real page reload');
  // Earn the remaining test budget through the public settlement interface using
  // registered original source data. No direct balance or inventory mutations.
  const fixture = await page.evaluate(() => {
    const {shop, view} = __EarSpaDebug;
    const sources = view.Targets().map(piece => ({id: piece.id, mass: piece.mass, type: piece.type, depth: piece.depth, fine: piece.fine, form: piece.form, fragment: false, generation: 0}));
    const receipts = [];
    for (let visit = 0; visit < 12; visit++) {
      shop.StartDay(); shop.RegisterServiceSources(sources);
      receipts.push(shop.FinishCustomer({harvest: sources, comfort01: .9, painCount: 0}));
      shop.AdvanceCustomer();
    }
    return {count: receipts.length, earned: receipts.reduce((sum, receipt) => sum + receipt.payout, 0)};
  });
  Check(fixture.count === 12 && fixture.earned > 0, 'controlled settlement fixtures produce a reviewable earned test budget');
  await OpenShop('collection'); p = await Probe();
  Check(p.shop.collection.some(item => item.grade === 5 && item.sparkle), 'highest-grade native intact pieces are represented in the collection counter');
  await Shot('CollectionGrades');
  const collectionValue = p.shop.collectionValue, beforeSale = p.shop.coins;
  await page.locator('[data-sell-all]').click(); p = await Probe();
  Check(p.shop.coins === beforeSale + collectionValue && p.shop.collection.length === 0, 'real sell-all button pays the exact aggregate pending value');
  Check(await page.locator('[data-sell-all]').isDisabled(), 'empty cabinet prevents repeated sell-all');
  await page.locator('[data-shop-tab="tools"]').click();
  for (const id of ['feather', 'brush', 'drops', 'tweezers', 'suction']) {
    await page.locator('[data-select-tool="' + id + '"]').click();
    Check(await page.locator('[data-purchase="' + id + '"]').isEnabled(), 'earned career unlocks the ' + id + ' purchase');
    await page.locator('[data-purchase="' + id + '"]').click();
    Check((await Probe()).shop.inventory.tools.includes(id), 'real purchase adds ' + id + ' to owned equipment');
  }
  await page.locator('[data-select-tool="scoop"]').click();
  await page.locator('[data-upgrade="earPickBamboo"]').click();
  await page.locator('[data-upgrade="earPickBamboo"]').click();
  Check((await Probe()).shop.toolLevels.earPickBamboo === 3, 'two real upgrade clicks advance the spoon to the mounted-lamp prerequisite');
  await page.locator('[data-shop-tab="lighting"]').click();
  await page.locator('[data-upgrade-lamp]').click();
  await page.locator('[data-tool-light="scoop"]').click(); p = await Step(1);
  Check(p.shop.lampLevel === 3 && p.rendering.lampEquipment.intensity === 145 && p.rendering.lampEquipment.mounted, 'real purchases unlock the brightest fixed lamp and the current advanced spoon mounted lamp');
  await Shot('AdvancedLighting');
  await page.locator('#shop-close').click();
  await page.locator('[data-tool="tweezers"]').click(); p = await Step(1);
  Check(!p.rendering.lampEquipment.mounted, 'changing to an instrument without a purchased lamp restores fixed lighting');
  await page.locator('[data-tool="scoop"]').click(); p = await Step(1);
  Check(p.rendering.lampEquipment.mounted, 'returning to the equipped advanced spoon re-enables its mounted lamp');
  const saved = p.shop;
  await page.reload(); await Ready(); p = await Probe();
  Check(p.shop.coins === saved.coins && p.shop.inventory.tools.length === 6 && p.shop.inventory.lights.includes('scoop') && p.shop.toolLevels.earPickBamboo === 3 && p.shop.lampLevel === 3, 'refresh preserves all bought tools, upgrades, lamp equipment and exact remaining balance');
  Check(p.rendering.lampEquipment.mounted, 'the persisted mounted lamp is applied to the restored default spoon');
  Check(report.errors.length === 0, 'no page, shader, network or asset errors during shop flow');
  report.final = {coins: p.shop.coins, visits: p.shop.totalCustomers, inventory: p.shop.inventory, lampLevel: p.shop.lampLevel};
  console.log('PASS ' + report.checks.length + ' career shop browser checks');
} finally {
  await fs.writeFile(path.join(out, 'Report_CareerShopPlay.json'), JSON.stringify(report, null, 2));
  await browser.close();
}
