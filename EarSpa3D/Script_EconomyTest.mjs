import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {CaptureWaxSources} from './Data_Progression.mjs';
const util = await fs.readFile(new URL('./Script_Util.js', import.meta.url), 'utf8');
const utilUrl = 'data:text/javascript;base64,' + Buffer.from(util).toString('base64');
const source = (await fs.readFile(new URL('./Script_Shop.js', import.meta.url), 'utf8'))
  .replace(/from (["'])(\.\/[^"']+)\1/g, (_, quote, path) => 'from ' + JSON.stringify(path.startsWith('./Script_Util.js') ? utilUrl : new URL(path, import.meta.url).href));
const {MakeRng} = await import(utilUrl);
const {CreateShop} = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
function Storage(data) {let raw = data ? JSON.stringify(data) : null; return {getItem: () => raw, setItem: (key, value) => raw = value, removeItem: () => raw = null};}
let checks = 0;
const Check = (ok, message) => {assert.ok(ok, message); checks++;};
const Sources = () => [...Array.from({length: 9}, (_, id) => ({id, mass: .9, type: id === 8 ? 'wet' : 'dry', depth: id === 8 ? 14.6 : 4.4, fine: false, generation: 0, fragment: false})), ...Array.from({length: 12}, (_, id) => ({id: 'dust' + id, mass: .075, type: 'dry', depth: 4.8, fine: true}))];
function Begin(shop) {shop.StartDay(MakeRng(14)); shop.RegisterServiceSources(Sources());}
function Serve(shop, overrides = {}) {
  Begin(shop); const customer = shop.CurrentCustomer();
  const harvest = customer.caseId === 'softenedWax' ? [{id: 2, mass: .9}, {id: 3, mass: .9}] : [{id: customer.caseId === 'deepBend' ? 8 : 3, mass: .9}];
  return shop.FinishCustomer({cleanliness01: 1, comfort01: .85, relax01: .85, painCount: 0, harvest, caseResult: {id: customer.caseId, complete: true}, ...overrides});
}
const fresh = CreateShop({storage: Storage()});
Check(fresh.coins === 0 && fresh.Snapshot().inventory.tools.join(',') === 'scoop', 'new career starts with only the spoon and no gifted coins');
Check(fresh.Lighting().level === 1 && fresh.Lighting().intensity === 55 && !fresh.Lighting().mounted, 'new lamp is weak and fixed');
Check(!fresh.UpgradeTool('earForceps').ok && !fresh.BuyTool('suction').ok, 'unowned tools cannot be upgraded and advanced tools remain gated');
const storage = Storage({version: 1, day: 8, coins: 220, reputation: 12, toolLevels: {earForceps: 3}});
const shop = CreateShop({storage});
Check(shop.day === 8 && shop.coins === 220 && shop.ToolLevel('earForceps') === 3, 'legacy migration preserves money, day, reputation and tool upgrades');
Check(shop.Snapshot().inventory.tools.join(',') === 'scoop,tweezers,drops,feather', 'legacy migration preserves all previously free equipment');
Check(shop.BuyTool('brush').ok && shop.coins === 164, 'buying a tool deducts its actual catalog price');
Check(!shop.BuyTool('brush').ok && shop.coins === 164, 'duplicate purchase does not deduct money');
Check(shop.BuySkin('scoop', 'walnut').ok && shop.coins === 136, 'buying a skin deducts once');
Check(shop.BuySkin('scoop', 'walnut').ok && shop.coins === 136, 'equipping an owned skin is free');
Check(!shop.Snapshot().inventory.equipped.tweezers && !shop.EquipSkin('scoop', 'jade'), 'skins remain tool-specific and unowned skins cannot be equipped');
const restored = CreateShop({storage});
Check(restored.Snapshot().inventory.equipped.scoop === 'walnut' && restored.Snapshot().inventory.tools.includes('brush'), 'inventory and equipped skin survive reload');
const oldAssets = CreateShop({storage: Storage({version: 2, day: 9, coins: 800, inventory: {tools: ['scoop', 'suction'], skins: {scoop: ['jade']}, equipped: {scoop: 'jade'}}, toolLevels: {softBrush: 4}, shopLevel: 3})});
Check(oldAssets.Snapshot().inventory.tools.includes('suction') && oldAssets.Snapshot().inventory.tools.includes('brush') && oldAssets.ToolLevel('softBrush') === 4 && oldAssets.Snapshot().inventory.equipped.scoop === 'jade', 'all legacy purchases, upgrades and skins survive incomplete older inventory');
const poor = CreateShop({storage: Storage()});
Check(!poor.BuyTool('feather').ok && !poor.BuySkin('scoop', 'jade').ok && poor.coins === 0, 'insufficient balance never creates debt');
const happyShop = CreateShop({storage: Storage()}), hurtShop = CreateShop({storage: Storage()});
const happy = Serve(happyShop), hurt = Serve(hurtShop, {painCount: 1, comfort01: 1});
Check(happy.tip > 0 && hurt.tip === 0 && hurt.payout === hurt.labor, 'any pain removes the entire tip, even with later perfect comfort');
Check(happyShop.Snapshot().reputation > hurtShop.Snapshot().reputation, 'comfortable real service earns more reputation');
Check(happy.labor === 18 && Math.abs(happy.clean - .1) < 1e-8 && happy.caseComplete, 'completing the shallow request earns the base service fee while actual cleanliness stays ten percent');
Check(happy.comboBonus === 0 && happy.perfectBonus === 0 && happy.caseBonus === 0 && happy.payout === happy.labor + happy.tip, 'service payout contains only base fee and tip');
Check(happy.collectionAdded === 1 && happy.collectionValue === 5 && happyShop.Snapshot().collectionValue === 5 && happyShop.coins === happy.payout, 'confirmed collection stays pending and is not automatically paid');
const settledBalance = happyShop.coins;
Check(happyShop.FinishCustomer({harvest: Sources(), comfort01: 1}) === null && happyShop.coins === settledBalance, 'same customer cannot settle twice');
const idleShop = CreateShop({storage: Storage()});
const idle = Serve(idleShop, {harvest: [], comfort01: 1, cleanliness01: 1, bestCombo: 999, caseResult: {complete: true}});
Check(idle.payout === 0 && idle.collectionAdded === 0 && idle.clean === 0 && idleShop.Snapshot().reputation === 0, 'idle comfort, claimed clean, fake case and combo do not create coins or reputation');
const partialShop = CreateShop({storage: Storage()});
const partial = Serve(partialShop, {harvest: [{id: 0, mass: .9}], caseResult: {id: 'drySheet', complete: true}});
Check(!partial.caseComplete && partial.labor === 2 && partial.clean < .101, 'unrelated real cleaning pays only proportional labor; fake case completion cannot claim full fee');
const practiceShop = CreateShop({storage: Storage()}); Begin(practiceShop);
const beforePractice = JSON.stringify(practiceShop.Snapshot());
Check(practiceShop.FinishCustomer({practice: true, harvest: Sources(), comfort01: 1}) === null && JSON.stringify(practiceShop.Snapshot()) === beforePractice, 'practice never changes coins, inventory, collection, reputation or customer state');
const sourceLock = CreateShop({storage: Storage()}); Begin(sourceLock);
Check(!sourceLock.RegisterServiceSources([{id: 8, mass: .1, type: 'impacted', depth: 20}]) && sourceLock.AppraiseWax({id: 8, mass: .1, fragment: true}).integrity < .1, 'source snapshot cannot shrink or inflate difficulty after service begins');
const saleStorage = Storage(), saleShop = CreateShop({storage: saleStorage}); const saleReceipt = Serve(saleShop);
const savedCollection = saleShop.Snapshot().collection[0], reloadSale = CreateShop({storage: saleStorage});
Check(reloadSale.Snapshot().collection[0].id === savedCollection.id && reloadSale.coins === saleReceipt.payout, 'pending collection and customer payout survive reload');
const sale = reloadSale.SellCollection(savedCollection.id), saleBalance = reloadSale.coins;
Check(sale.ok && sale.payout === savedCollection.value && saleBalance === saleReceipt.payout + savedCollection.value, 'selling a collection credits exactly its saved value');
Check(!reloadSale.SellCollection(savedCollection.id).ok && reloadSale.coins === saleBalance, 'same collection cannot be sold twice');
const soldReload = CreateShop({storage: saleStorage});
Check(!soldReload.SellCollection(savedCollection.id).ok && soldReload.Snapshot().collection.length === 0 && soldReload.coins === saleBalance, 'sold status and money survive reload without replay');
soldReload.StartDay(MakeRng(14));
Check(soldReload.CurrentCustomer().id !== savedCollection.customerId.split('@')[0] && soldReload.coins === saleBalance, 'reopening the day does not replay a paid visit');
const duplicates = CreateShop({storage: Storage()});
const dup = Serve(duplicates, {harvest: [{id: 3, mass: .9}, {id: 3, mass: .9}, {id: '3.0', mass: .9}]});
Check(dup.collectionAdded === 1 && Math.abs(dup.collectedMass - .9) < 1e-8, 'duplicate and overlapping parent/child receipts do not inflate mass or inventory');
const lightingShop = CreateShop({storage: Storage({version: 3, coins: 1000, inventory: {tools: ['scoop'], skins: {}, equipped: {}, lights: []}})});
Check(!lightingShop.BuyToolLight('scoop').ok, 'basic spoon cannot buy a mounted lamp');
Check(lightingShop.UpgradeLamp().ok && lightingShop.Lighting().intensity === 95 && !lightingShop.Lighting().mounted, 'first lamp upgrade brightens the fixed lamp only');
Check(lightingShop.UpgradeLamp().ok && lightingShop.Lighting().intensity === 145 && !lightingShop.UpgradeLamp().ok, 'fixed lighting has three bounded levels');
Check(lightingShop.UpgradeTool('scoop').ok && lightingShop.UpgradeTool('earPickBamboo').ok && lightingShop.ToolLevel('scoop') === 3, 'short and legacy long tool IDs share one upgrade level');
Check(lightingShop.BuyToolLight('scoop').ok && lightingShop.Lighting('scoop').mounted && !lightingShop.Lighting('drops').mounted, 'mounted lamp follows only the purchased advanced instrument');
const lampCoins = lightingShop.coins;
Check(!lightingShop.BuyToolLight('scoop').ok && lightingShop.coins === lampCoins, 'mounted lamp cannot be purchased twice');
// Balanced conservative route: only one target per visit, modest comfort, and
// sell at the counter. Richer full-ear cleaning adds optional income.
const career = CreateShop({storage: Storage()}), milestones = [], plan = ['lamp', 'feather', 'brush', 'drops', 'tweezers', 'suction'];
for (let visit = 1; visit <= 30 && plan.length; visit++) {
  Serve(career); career.SellAllCollection();
  let buying = true;
  while (buying && plan.length) {
    const id = plan[0], result = id === 'lamp' ? career.UpgradeLamp() : career.BuyTool(id);
    buying = result.ok;
    if (buying) {milestones.push({visit, upgrade: id, remaining: career.coins}); plan.shift();}
  }
  career.AdvanceCustomer(); if (!career.HasNextCustomer()) career.NextDay();
}
Check(milestones[0].visit === 1 && milestones[0].upgrade === 'lamp', 'first successful service plus sale buys the first meaningful lamp upgrade');
Check(milestones.find(item => item.upgrade === 'feather').visit <= 3, 'the first new tool arrives within three conservative visits');
Check(!plan.length && career.Snapshot().inventory.tools.length === 6, 'six tools become affordable through ordinary play without gifts or grind exploits');
Check(career.coins >= 0, 'simulated progression never overspends');
console.log('PASS ' + checks + ' economy checks');
console.log('Conservative progression: ' + JSON.stringify(milestones));
