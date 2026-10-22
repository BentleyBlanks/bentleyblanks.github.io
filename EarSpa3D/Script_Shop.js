// Persistent career economy. The physical scene supplies only confirmed harvest
// receipts; appraisal uses a frozen copy of the original deposits.
import { Clamp } from "./Script_Util.js?v=ear011-20260911";
import { CAREER_VERSION, TOOL_CATALOG, LAMP_LEVELS, TOOL_LIGHT, CareerToolId, CaptureWaxSources, ValueWax, AppraiseHarvest, UniqueWaxPieces, WaxSourceId } from './Data_Progression.mjs?v=ear050-career-care-20261022';
import { CustomerCase, CaseProgress } from './Data_CareCases.mjs?v=ear050-career-care-20261022';
const STORAGE_KEY = 'earspa3d.shop.v1';
const MAX_TOOL_LEVEL = 5, MAX_SHOP_LEVEL = 4;
const LegacyTools = ['scoop', 'tweezers', 'drops', 'feather'];
const NumberOr = (value, fallback = 0) => Number.isFinite(value) ? Math.max(0, value) : fallback;
const Copy = value => JSON.parse(JSON.stringify(value));
const FreshInventory = () => ({tools: ['scoop'], skins: {}, equipped: {}, lights: []});
export const CUSTOMER_TIERS = [
  {id: 'easy', name: '初访客人', minRep: 0, waxCount: [8, 12], impactedRatio: 0, wetRatio: .25, basePay: 18, patience: 1, blurb: '想先清理入口那片干垢。'},
  {id: 'normal', name: '常客', minRep: 12, waxCount: [12, 18], impactedRatio: .12, wetRatio: .35, basePay: 24, patience: 1, blurb: '熟门熟路，躺下就眯起眼。'},
  {id: 'tough', name: '老饕', minRep: 32, waxCount: [16, 24], impactedRatio: .25, wetRatio: .45, basePay: 32, patience: .95, blurb: '有些牢固附着，愿意耐心等你处理。'},
  {id: 'hard', name: '深部护理', minRep: 60, waxCount: [22, 30], impactedRatio: .42, wetRatio: .5, basePay: 44, patience: .9, blurb: '需要更清楚的照明与精细器具。'},
];
export const SHOP_LEVELS = [
  {level: 1, name: '街边小摊', cost: 0, moods: ['teaRoom'], customersPerDay: [1, 2], priceMul: 1, blurb: '一把耳勺，一盏手调台灯。'},
  {level: 2, name: '巷口小铺', cost: 160, moods: ['teaRoom', 'morning'], customersPerDay: [2, 3], priceMul: 1.15, blurb: '客人更愿意停一会儿。'},
  {level: 3, name: '临街雅间', cost: 420, moods: ['teaRoom', 'morning', 'rainNight'], customersPerDay: [2, 3], priceMul: 1.35, blurb: '有窗，有雨声，也有老主顾。'},
  {level: 4, name: '老字号采耳', cost: 900, moods: ['teaRoom', 'morning', 'rainNight', 'sleepy'], customersPerDay: [3, 4], priceMul: 1.6, blurb: '榻上铺了软褥。'},
];
export function ToolUpgradeCost(level) { return [0, 0, 45, 110, 230, 460][Clamp(level, 0, MAX_TOOL_LEVEL)] ?? 0; }
export function CreateShop({seed = 20260910, storage = null} = {}) {
  const store = storage || SafeStorage();
  const state = {day: 1, coins: 0, reputation: 0, shopLevel: 1, lampLevel: 1, toolLevels: {},
    totalEarned: 0, totalCustomers: 0, bestPayout: 0, collectionEarned: 0, inventory: FreshInventory(),
    collection: [], soldCollectionIds: [], settledCustomers: [], careerUnlockCount: 0,
    serviceSources: null, unlockedTools: null, todayCustomers: [], todayIndex: 0, mood: 'teaRoom', log: []};
  function Save() {
    try {
      const {unlockedTools, ...saved} = state;
      store.setItem(STORAGE_KEY, JSON.stringify({...saved, version: CAREER_VERSION}));
    } catch { /* Local progress remains available when storage is unavailable. */ }
  }
  function Load() {
    try {
      const raw = store.getItem(STORAGE_KEY); if (!raw) return false;
      const data = JSON.parse(raw); if (!data || typeof data !== 'object') return false;
      const legacy = (data.version || 1) < CAREER_VERSION;
      for (const key of ['coins', 'reputation', 'totalEarned', 'totalCustomers', 'bestPayout', 'collectionEarned']) state[key] = NumberOr(data[key]);
      state.day = Math.max(1, Math.floor(NumberOr(data.day, 1)));
      state.shopLevel = Clamp(NumberOr(data.shopLevel, 1), 1, MAX_SHOP_LEVEL);
      state.lampLevel = Clamp(NumberOr(data.lampLevel, legacy ? Math.min(3, state.shopLevel) : 1), 1, 3);
      state.toolLevels = data.toolLevels && typeof data.toolLevels === 'object' ? {...data.toolLevels} : {};
      const inventory = data.inventory && typeof data.inventory === 'object' ? data.inventory : {};
      // Legacy free equipment and every bought asset remain owned. New careers
      // receive only the spoon; migration never resets money or upgrades.
      state.inventory = {...FreshInventory(), ...inventory,
        tools: [...new Set(['scoop', ...(legacy ? LegacyTools : []), ...(Array.isArray(inventory.tools) ? inventory.tools : [])])],
        skins: inventory.skins || {}, equipped: inventory.equipped || {}, lights: Array.isArray(inventory.lights) ? inventory.lights.slice() : []};
      for (const [id, level] of Object.entries(state.toolLevels)) {
        const key = CareerToolId(id); if (TOOL_CATALOG[key] && level > 1 && !state.inventory.tools.includes(key)) state.inventory.tools.push(key);
      }
      state.careerUnlockCount = Math.max(NumberOr(data.careerUnlockCount), state.totalCustomers, legacy ? 6 : 0);
      state.mood = data.mood || 'teaRoom';
      state.todayCustomers = Array.isArray(data.todayCustomers) ? data.todayCustomers.map(customer => ({...customer})) : [];
      state.todayIndex = Math.min(state.todayCustomers.length, Math.floor(NumberOr(data.todayIndex)));
      state.settledCustomers = [...new Set(Array.isArray(data.settledCustomers) ? data.settledCustomers : [])];
      state.soldCollectionIds = [...new Set(Array.isArray(data.soldCollectionIds) ? data.soldCollectionIds : [])];
      const seen = new Set(state.soldCollectionIds);
      state.collection = (Array.isArray(data.collection) ? data.collection : []).filter(item => {
        if (!item?.id || seen.has(item.id) || !Number.isFinite(item.value) || item.value < 0) return false;
        seen.add(item.id); return true;
      }).map(item => ({...item}));
      state.serviceSources = data.serviceSources?.customerId && data.serviceSources?.sources ? data.serviceSources : null;
      state.log = Array.isArray(data.log) ? data.log.slice(0, 30) : [];
      Save(); return true;
    } catch { return false; }
  }
  function Reset() {
    Object.assign(state, {day: 1, coins: 0, reputation: 0, shopLevel: 1, lampLevel: 1, toolLevels: {},
      inventory: FreshInventory(), totalEarned: 0, totalCustomers: 0, bestPayout: 0, collectionEarned: 0,
      collection: [], soldCollectionIds: [], settledCustomers: [], careerUnlockCount: 0, serviceSources: null,
      todayCustomers: [], todayIndex: 0, mood: 'teaRoom', log: []}); Save();
  }
  const NAMES = ['老张', '小林', '阿May', '胖叔', '程姑娘', '出租车老李', '楼上的学生', '王阿姨', '夜班护士', '卖花的小陈', '棋摊赵爷', '隔壁理发师'];
  function TierForReputation(rep) { let best = CUSTOMER_TIERS[0]; for (const tier of CUSTOMER_TIERS) if (rep >= tier.minRep) best = tier; return best; }
  function OwnsTool(id) { return state.inventory.tools.includes(CareerToolId(id)); }
  function MakeCustomer(rng, index) {
    const tier = TierForReputation(state.reputation), fullKit = OwnsTool('drops') && OwnsTool('tweezers');
    const oily = fullKit && OwnsTool('feather') && (state.day + index) % 4 === 3;
    const choices = fullKit ? ['drySheet', 'softenedWax', 'deepBend'] : ['drySheet'];
    return {id: `d${state.day}c${index}`, tierId: tier.id, tierName: tier.name, name: rng.pick(NAMES),
      earType: oily ? 'oily' : 'mixed', caseId: oily ? null : choices[(state.day - 1 + index) % choices.length],
      blurb: tier.blurb, waxSeed: (state.day * 7919 + index * 104729 + seed) >>> 0,
      waxCount: rng.int(...tier.waxCount), impactedRatio: tier.impactedRatio, wetRatio: tier.wetRatio,
      basePay: tier.basePay, patience: tier.patience, done: false, paid: 0};
  }
  function StartDay(rng) {
    // Reloading may resume a customer; it must never regenerate paid IDs.
    if (state.todayCustomers.length && state.todayCustomers.every(customer => customer.done)) NextDay();
    const shop = SHOP_LEVELS[state.shopLevel - 1];
    if (!state.todayCustomers.length) {
      const generator = rng || FallbackRng(), count = generator.int(...shop.customersPerDay);
      state.todayCustomers = Array.from({length: count}, (_, index) => MakeCustomer(generator, index)); state.todayIndex = 0;
    } else if (CurrentCustomer()?.done || !CurrentCustomer()) AdvanceCustomer();
    if (!shop.moods.includes(state.mood)) state.mood = shop.moods[0];
    Save(); return {shop, customers: state.todayCustomers, mood: state.mood};
  }
  function CurrentCustomer() { return state.todayCustomers[state.todayIndex] || null; }
  function CustomerKey(customer = CurrentCustomer()) { return customer ? `${customer.id}@${customer.waxSeed}` : ''; }
  function HasNextCustomer() { return state.todayCustomers.some(customer => !customer.done); }
  function SkipCustomer() {
    const customer = CurrentCustomer(); if (!customer || customer.done) return false;
    customer.done = true; customer.paid = 0; customer.skipped = true; state.serviceSources = null; Save(); return true;
  }
  function AdvanceCustomer() { const index = state.todayCustomers.findIndex(customer => !customer.done); state.todayIndex = index < 0 ? state.todayCustomers.length : index; Save(); return CurrentCustomer(); }
  function RegisterServiceSources(items, options = {}) {
    const customer = CurrentCustomer(); if (options.practice || !customer || customer.done) return false;
    const customerId = CustomerKey(customer);
    if (state.serviceSources?.customerId === customerId) return false;
    const sources = CaptureWaxSources(items); if (!Object.keys(sources).length) return false;
    state.serviceSources = {customerId, sources}; Save(); return true;
  }
  function CurrentSources() { return state.serviceSources?.customerId === CustomerKey() ? state.serviceSources.sources : {}; }
  function AppraiseWax(piece) { return ValueWax(piece, CurrentSources()); }
  function FinishCustomer(summary = {}) {
    const customer = CurrentCustomer(), customerId = CustomerKey(customer);
    if (summary.practice || !customer || customer.done || state.settledCustomers.includes(customerId)) return null;
    const shop = SHOP_LEVELS[state.shopLevel - 1], sources = CurrentSources();
    const confirmedHarvest = UniqueWaxPieces(summary.harvest || []).filter(item => Object.hasOwn(sources, WaxSourceId(item)));
    const appraisals = AppraiseHarvest(confirmedHarvest, sources);
    const collectedMass = appraisals.reduce((sum, item) => sum + item.collectedMass, 0);
    const totalMass = Object.values(sources).reduce((sum, item) => sum + item.mass, 0);
    // Cleaning and comfort reward require confirmed material; an idle timer or
    // a claimed cleanliness value alone cannot generate revenue.
    const clean = totalMass > 0 ? Clamp(collectedMass / totalMass, 0, 1) : 0;
    const comfort = Clamp(summary.comfort01 ?? 0, 0, 1), relax = Clamp(summary.relax01 ?? 0, 0, 1);
    const painCount = Math.max(0, NumberOr(summary.painCount));
    const caseId = CustomerCase(customer, state.inventory.tools);
    const verifiedCase = CaseProgress(caseId, [], confirmedHarvest);
    const caseComplete = !!verifiedCase?.complete && collectedMass > 0;
    const serviceFactor = caseComplete ? 1 : clean;
    const labor = Math.round(customer.basePay * serviceFactor * shop.priceMul);
    const tip = painCount > 0 || collectedMass <= 0 ? 0 : Math.round(labor * .55 * comfort);
    const payout = labor + tip;
    const knownIds = new Set([...state.soldCollectionIds, ...state.collection.map(item => item.id)]), added = [];
    for (const appraisal of appraisals) {
      const id = `${customerId}/${appraisal.sourceId}`;
      if (knownIds.has(id)) continue;
      knownIds.add(id); added.push({...appraisal, id, customerId, customerName: customer.name, day: state.day});
    }
    state.collection.push(...added); state.coins += payout; state.totalEarned += payout;
    state.totalCustomers++; state.careerUnlockCount = Math.max(state.careerUnlockCount, state.totalCustomers);
    state.bestPayout = Math.max(state.bestPayout, payout);
    const repGain = collectedMass > 0 ? Math.round(serviceFactor * (painCount ? 1 : 2 + comfort * 2)) : 0;
    state.reputation = Math.max(0, state.reputation + repGain - Math.min(3, painCount));
    customer.done = true; customer.paid = payout; state.settledCustomers.push(customerId);
    const entry = {day: state.day, name: customer.name, tier: customer.tierName, payout, labor, tip, painCount,
      comboBonus: 0, perfectBonus: 0, caseBonus: 0, caseId, caseComplete,
      clean, comfort, relax, verdict: summary.verdict || '', harvest: appraisals.length,
      collectionAdded: added.length, collectionValue: added.reduce((sum, item) => sum + item.value, 0),
      collectionIds: added.map(item => item.id), collectedMass};
    state.log.unshift(entry); state.log.length = Math.min(30, state.log.length); Save(); return entry;
  }
  function SellCollection(id) {
    const index = state.collection.findIndex(item => item.id === id);
    if (index < 0 || state.soldCollectionIds.includes(id)) return {ok: false, reason: 'missing', payout: 0};
    const [item] = state.collection.splice(index, 1), payout = Math.max(0, Math.floor(item.value));
    state.soldCollectionIds.push(id); state.coins += payout; state.totalEarned += payout; state.collectionEarned += payout;
    Save(); return {ok: true, payout, count: 1, ids: [id]};
  }
  function SellAllCollection() {
    const ids = state.collection.map(item => item.id); let payout = 0, count = 0;
    for (const id of ids) { const result = SellCollection(id); payout += result.payout; count += result.ok ? 1 : 0; }
    return {ok: count > 0, payout, count, ids};
  }
  function NextDay() { state.day++; state.todayCustomers = []; state.todayIndex = 0; state.serviceSources = null; Save(); return state.day; }
  function ToolLevel(id) { const key = CareerToolId(id), specId = TOOL_CATALOG[key]?.id || id; return Clamp(state.toolLevels[specId] ?? state.toolLevels[key] ?? 1, 1, MAX_TOOL_LEVEL); }
  function ToolUpgradeOffer(id) {
    const level = ToolLevel(id), maxed = level >= MAX_TOOL_LEVEL, owned = OwnsTool(id), cost = maxed ? 0 : ToolUpgradeCost(level + 1);
    return {id, level, owned, maxed, cost, affordable: owned && !maxed && state.coins >= cost, next: maxed ? null : level + 1};
  }
  function UpgradeTool(id) {
    const offer = ToolUpgradeOffer(id);
    if (!offer.affordable) return {ok: false, reason: !offer.owned ? 'locked' : offer.maxed ? 'maxed' : 'poor', offer};
    state.coins -= offer.cost; state.toolLevels[TOOL_CATALOG[CareerToolId(id)]?.id || id] = offer.next; Save(); return {ok: true, level: offer.next, cost: offer.cost};
  }
  function ToolOffer(id) {
    const key = CareerToolId(id), item = TOOL_CATALOG[key]; if (!item) return null;
    const owned = OwnsTool(key), missing = item.requires.filter(required => !OwnsTool(required));
    const unlocked = state.careerUnlockCount >= item.visits && !missing.length;
    const requirement = missing.length ? '先添置' + missing.map(required => TOOL_CATALOG[required].name).join('、') : state.careerUnlockCount < item.visits ? `照顾 ${item.visits} 位客人后解锁` : '';
    return {...item, id: key, owned, unlocked, requirement, affordable: !owned && unlocked && state.coins >= item.cost};
  }
  function BuyTool(id) { const item = ToolOffer(id); if (!item?.affordable) return {ok: false, reason: item?.owned ? 'owned' : !item?.unlocked ? 'locked' : 'poor'}; state.coins -= item.cost; state.inventory.tools.push(item.id); Save(); return {ok: true, cost: item.cost}; }
  function LampOffer() { const next = state.lampLevel + 1, item = LAMP_LEVELS[next - 1], maxed = !item; return {level: state.lampLevel, next: maxed ? null : next, maxed, name: item?.name || LAMP_LEVELS[2].name, cost: item?.cost || 0, affordable: !maxed && state.coins >= item.cost}; }
  function UpgradeLamp() { const offer = LampOffer(); if (!offer.affordable) return {ok: false}; state.coins -= offer.cost; state.lampLevel = offer.next; Save(); return {ok: true, level: offer.next, cost: offer.cost}; }
  function ToolLightOffer(id) {
    const key = CareerToolId(id), eligible = TOOL_LIGHT.tools.includes(key), owned = state.inventory.lights.includes(key);
    const unlocked = eligible && OwnsTool(key) && ToolLevel(key) >= TOOL_LIGHT.minLevel;
    return {id: key, eligible, owned, unlocked, cost: TOOL_LIGHT.cost, minLevel: TOOL_LIGHT.minLevel, affordable: unlocked && !owned && state.coins >= TOOL_LIGHT.cost};
  }
  function BuyToolLight(id) { const offer = ToolLightOffer(id); if (!offer.affordable) return {ok: false}; state.coins -= offer.cost; state.inventory.lights.push(offer.id); Save(); return {ok: true, cost: offer.cost}; }
  function Lighting(id = 'scoop') { const lamp = LAMP_LEVELS[state.lampLevel - 1], mounted = OwnsTool(id) && state.inventory.lights.includes(CareerToolId(id)); return {level: lamp.level, intensity: lamp.intensity, mounted, label: mounted ? '器具随动灯 · ' + TOOL_CATALOG[CareerToolId(id)].name : lamp.name + ' · 手动调向'}; }
  function ShopOffer() { const next = state.shopLevel + 1, item = SHOP_LEVELS[next - 1]; return item ? {maxed: false, level: state.shopLevel, next, cost: item.cost, affordable: state.coins >= item.cost, name: item.name} : {maxed: true, level: state.shopLevel, cost: 0, affordable: false}; }
  function UpgradeShop() { const offer = ShopOffer(); if (!offer.affordable) return {ok: false, offer}; state.coins -= offer.cost; state.shopLevel = offer.next; Save(); return {ok: true, level: offer.next, cost: offer.cost, shop: SHOP_LEVELS[state.shopLevel - 1]}; }
  function LeveledSpec(spec) {
    if (!spec) return spec; const level = ToolLevel(spec.id); if (level <= 1) return spec;
    const t = level - 1, range = spec.idealSpeedRange;
    return {...spec, level, comfortGain: (spec.comfortGain ?? .2) * (1 + .14 * t), crackRisk: (spec.crackRisk ?? .4) * (1 - .11 * t), painRisk: (spec.painRisk ?? .3) * (1 - .1 * t), idealSpeedRange: range ? [range[0] * (1 - .06 * t), range[1] * (1 + .16 * t)] : range, efficiencyMul: 1 + .1 * t};
  }
  const skinCatalog = {walnut: {name: '胡桃木', cost: 28, color: '#704126'}, jade: {name: '白玉', cost: 45, color: '#dbe7cf'}};
  function SkinOffer(tool, id) { const skin = skinCatalog[id]; if (!skin) return null; const owned = (state.inventory.skins[tool] || []).includes(id); return {...skin, id, tool, owned, equipped: state.inventory.equipped[tool] === id, affordable: OwnsTool(tool) && (owned || state.coins >= skin.cost)}; }
  function BuySkin(tool, id) { const offer = SkinOffer(tool, id); if (!offer?.affordable) return {ok: false}; if (!offer.owned) {state.coins -= offer.cost; (state.inventory.skins[tool] ??= []).push(id);} state.inventory.equipped[tool] = id; Save(); return {ok: true}; }
  function EquipSkin(tool, id) { if (!OwnsTool(tool) || id !== 'classic' && !(state.inventory.skins[tool] || []).includes(id)) return false; state.inventory.equipped[tool] = id; Save(); return true; }
  function Snapshot() {
    const shop = SHOP_LEVELS[state.shopLevel - 1];
    return {day: state.day, inventory: Copy(state.inventory), coins: state.coins, reputation: state.reputation,
      shopLevel: state.shopLevel, shopName: shop.name, moods: shop.moods, priceMul: shop.priceMul,
      toolLevels: {...state.toolLevels}, lampLevel: state.lampLevel, lighting: Lighting(),
      collection: Copy(state.collection), collectionValue: state.collection.reduce((sum, item) => sum + item.value, 0), collectionEarned: state.collectionEarned,
      todayCustomers: state.todayCustomers.map(customer => ({...customer})), todayIndex: state.todayIndex, mood: state.mood,
      log: state.log.slice(0, 8), totalEarned: state.totalEarned, totalCustomers: state.totalCustomers, bestPayout: state.bestPayout,
      rarity: TierForReputation(state.reputation).name, maxToolLevel: MAX_TOOL_LEVEL, maxShopLevel: MAX_SHOP_LEVEL, version: CAREER_VERSION};
  }
  Load();
  return {state, Snapshot, Save, Load, Reset, StartDay, NextDay, CurrentCustomer, HasNextCustomer, AdvanceCustomer, SkipCustomer, FinishCustomer,
    RegisterServiceSources, AppraiseWax, SellCollection, SellAllCollection, ToolLevel, ToolUpgradeOffer, UpgradeTool,
    LampOffer, UpgradeLamp, ToolLightOffer, BuyToolLight, Lighting, ShopOffer, UpgradeShop, LeveledSpec,
    TierForReputation, ToolOffer, BuyTool, SkinOffer, BuySkin, EquipSkin, get coins() {return state.coins;}, get day() {return state.day;}};
}
function SafeStorage() {
  try { if (typeof localStorage !== 'undefined') {localStorage.setItem('earspa3d.probe', '1'); localStorage.removeItem('earspa3d.probe'); return localStorage;} } catch { /* Private mode. */ }
  const memory = new Map(); return {getItem: key => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value), removeItem: key => memory.delete(key)};
}
function FallbackRng() { return {int: (lo, hi) => Math.floor(lo + (hi - lo + 1) * .5), pick: list => list[0]}; }
export { MAX_TOOL_LEVEL, MAX_SHOP_LEVEL };
