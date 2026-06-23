// Headless smoke test of the simulation loop (no DOM/canvas/audio).
import { createEventBus } from './src/bus';
import { createInitialState, createCoreModule } from './src/core';
import { createEconomyModule } from './src/economy';
import { createShopModule } from './src/shop';
import { createSkillsModule } from './src/skills';
import { createAutomationModule } from './src/automation';
import { ICONS, UPGRADES, SKILLS, CUSTOMERS, ASSET_MANIFEST } from './src/content';
import { computeLayout } from './src/types/layout';
import type { GameContext, GameModule } from './src/types/module.types';
import type { GameEvent } from './src/types/events.types';

let clock = 1000;
const now = () => clock;

const store = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  key: () => null,
  length: 0,
} as Storage;

// capture handler errors (bus swallows them via console.error)
let handlerErrors = 0;
const realErr = console.error;
console.error = (...a: unknown[]) => { handlerErrors++; realErr('[handler-error]', ...a); };

const bus = createEventBus();
const state = createInitialState(now());
const ctx: GameContext = {
  state, bus,
  content: { icons: ICONS, upgrades: UPGRADES, skills: SKILLS, customers: CUSTOMERS },
  assets: ASSET_MANIFEST,
  canvas: {} as HTMLCanvasElement,
  ctx2d: {} as CanvasRenderingContext2D,
  uiRoot: {} as HTMLElement,
  now,
};

const counts: Record<string, number> = {};
const track = ['BADGE_CLEARED', 'PHONE_CLEANED', 'PHONE_RETURNED', 'CUSTOMER_ARRIVED',
  'CUSTOMER_LEFT', 'LEVEL_UP', 'UPGRADE_PURCHASED', 'SKILL_UNLOCKED', 'SKILL_USED', 'REPUTATION_CHANGED'];
for (const t of track) bus.on(t as GameEvent['type'], () => { counts[t] = (counts[t] || 0) + 1; });

const modules: GameModule[] = [
  createCoreModule(), createEconomyModule(), createShopModule(),
  createSkillsModule(), createAutomationModule(),
];
for (const m of modules) m.init(ctx);

function tick(ms: number) { clock += ms; bus.emit({ type: 'TICK', dt: ms }); for (const m of modules) m.update?.(ms); }

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) console.log('  ok  -', msg);
  else { console.log('  FAIL-', msg); failures++; }
}

function tapAllActive() {
  const lay = computeLayout(state);
  state.activeCustomers.forEach((c, si) => {
    for (const icon of [...c.phone.icons]) {
      if (icon.badge <= 0) continue;
      const cell = lay.stations[si]?.cells.find((cc) => cc.col === icon.col && cc.row === icon.row);
      if (cell) bus.emit({ type: 'TAP', x: cell.rect.x + cell.rect.w / 2, y: cell.rect.y + cell.rect.h / 2 });
    }
  });
}

console.log('# 1 init/spawn');
assert(state.activeCustomers.length === 1, 'one active customer after init');
const firstId = state.activeCustomers[0]?.id;
assert((state.activeCustomers[0]?.phone.badgeTotal ?? 0) > 0, `phone has badges (${state.activeCustomers[0]?.phone.badgeTotal})`);

console.log('# 2 tap clears + full settle');
let guard = 0;
while (state.activeCustomers.some((c) => c.id === firstId) && guard++ < 400) { tapAllActive(); tick(16); }
assert((counts['PHONE_CLEANED'] || 0) >= 1, 'PHONE_CLEANED fired');
assert((counts['PHONE_RETURNED'] || 0) >= 1, 'PHONE_RETURNED fired');
assert(state.points > 0, `points earned (${state.points})`);
assert(state.xp > 0 || state.level > 1, `xp gained (xp=${state.xp.toFixed(1)}, lvl=${state.level})`);

console.log('# 3 arrivals over time');
for (let i = 0; i < 2500; i++) { tapAllActive(); tick(16); }
assert((counts['CUSTOMER_ARRIVED'] || 0) >= 2, `more arrivals (${counts['CUSTOMER_ARRIVED']})`);

console.log('# 4 economy/upgrades + derived');
state.points = 1_000_000;
bus.emit({ type: 'BUY_UPGRADE', id: 'up_clear' });
assert((state.upgrades['up_clear'] || 0) === 1, 'bought up_clear');
assert(state.derived.clearPerHit === 2, `clearPerHit=2 (${state.derived.clearPerHit})`);
bus.emit({ type: 'BUY_UPGRADE', id: 'up_botcount' });
assert(state.derived.botCount >= 1, `bot hired (${state.derived.botCount})`);
bus.emit({ type: 'BUY_UPGRADE', id: 'up_slot' });
assert(state.activeSlots >= 2, `activeSlots>=2 (${state.activeSlots})`);
bus.emit({ type: 'BUY_UPGRADE', id: 'up_swipe' });
assert(state.derived.swipeEnabled === true, 'swipe enabled');

console.log('# 5 bots auto-clear (no taps)');
const before = counts['BADGE_CLEARED'] || 0;
for (let i = 0; i < 800; i++) { tick(16); }
assert((counts['BADGE_CLEARED'] || 0) > before, `bots cleared (${(counts['BADGE_CLEARED'] || 0) - before} clears)`);

console.log('# 6 level-up unlocks skills');
bus.emit({ type: 'BADGE_CLEARED', customerId: 'synthetic', iconId: 'none', amount: 30000, x: 0, y: 0 });
assert(state.level >= 18, `reached level ${state.level}`);
assert((counts['SKILL_UNLOCKED'] || 0) >= 6, `skills unlocked (${counts['SKILL_UNLOCKED']})`);
assert(state.skills['skill_magnet']?.unlocked === true, 'magnet unlocked');

console.log('# 7 use skill (clear active phone) + cooldown gate');
// ensure an active customer with badges
let g2 = 0;
while (!state.activeCustomers.some((c) => c.phone.badgeTotal > 0) && g2++ < 300) tick(16);
const usedBefore = counts['SKILL_USED'] || 0;
bus.emit({ type: 'USE_SKILL', id: 'skill_clearphone' });
assert((counts['SKILL_USED'] || 0) === usedBefore + 1, 'skill fired once');
bus.emit({ type: 'USE_SKILL', id: 'skill_clearphone' }); // immediate re-use blocked by cooldown
assert((counts['SKILL_USED'] || 0) === usedBefore + 1, 'cooldown blocks immediate re-use');

console.log('# 8 reputation reacted');
assert((counts['REPUTATION_CHANGED'] || 0) >= 1, `reputation changed (${counts['REPUTATION_CHANGED']})`);

console.log('# 9 no handler errors, no NaN');
assert(handlerErrors === 0, `zero handler errors (${handlerErrors})`);
const nan = [state.points, state.xp, state.xpToNext, state.reputation, state.derived.payoutMult, state.derived.arrivalIntervalMs].some((v) => Number.isNaN(v) || !Number.isFinite(v));
assert(!nan, 'no NaN/Infinity in key numbers');

console.log('\n==== ' + (failures === 0 ? 'ALL PASS' : failures + ' FAILURES') + ' ====');
console.log('event counts:', JSON.stringify(counts));
console.log('final: level=' + state.level, 'points=' + Math.round(state.points), 'rep=' + state.reputation.toFixed(2), 'totalCleared=' + state.totalCleared, 'active=' + state.activeCustomers.length, 'queue=' + state.queue.length);
process.exit(failures === 0 ? 0 : 1);
