// Headless logic smoke for the roguelike layer (#1 single start, #2 offer, #3 golden, #4 soul, #5 cosmic).
import { content } from './src/content';
import { createEventBus } from './src/core/eventBus';
import { createInitialState } from './src/core/persistence';
import { createEconomyModule } from './src/economy/economyModule';
import { createSkillsModule } from './src/skills/skillsModule';
import { createShopModule } from './src/shop/shopModule';
import { createUiModule } from './src/ui/uiModule';
import { createCoreModule } from './src/core/coreModule';
import { createAutomationModule } from './src/automation/automationModule';
import { computeGameLayout, popupAcceptRect, popupRectOf } from './src/shared/layout';
import type { GameContext, GameModule } from './src/types/module.types';
import type { GameEvent } from './src/types/events.types';
import type { CustomerRuntime, PhonePopup } from './src/types/state.types';

let clock = 1000;
(globalThis as unknown as { performance: { now: () => number } }).performance = { now: () => clock };
const store = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k), clear: () => store.clear(), key: () => null, length: 0,
} as Storage;

const realRandom = Math.random;
const setRandom = (v: number) => { Math.random = () => v; };
const restoreRandom = () => { Math.random = realRandom; };

const W = 1200, H = 760;
const canvas = { clientWidth: W, clientHeight: H } as HTMLCanvasElement;
const bus = createEventBus();
const state = createInitialState(clock);
state.level = 6;
state.points = 1000;
const ctx: GameContext = { state, bus, content, assets: { images: {}, audio: {} }, canvas, ctx2d: {} as CanvasRenderingContext2D };

const risk: Record<string, number> = {};
bus.on('RISK_EVENT', (e) => { risk[(e as Extract<GameEvent, { type: 'RISK_EVENT' }>).kind] = (risk[(e as Extract<GameEvent, { type: 'RISK_EVENT' }>).kind] || 0) + 1; });
let skillUnlocks = 0;
bus.on('SKILL_UNLOCKED', () => { skillUnlocks += 1; });

const modules: GameModule[] = [
  createEconomyModule(), createSkillsModule(), createShopModule(), createUiModule(), createCoreModule(), createAutomationModule(),
];
for (const m of modules) m.init(ctx);

function tick(dt: number) { clock += dt; bus.emit({ type: 'TICK', dt }); for (const m of modules) m.update?.(dt); }
function getActive(): CustomerRuntime {
  let g = 0;
  while (state.activeCustomers.length === 0 && g++ < 200) tick(100);
  return state.activeCustomers[0];
}
const phoneLayout = (id: string) => computeGameLayout(state, W, H).phoneLayouts.find((p) => p.customer.id === id)!;

let fails = 0;
const assert = (c: boolean, m: string) => { console.log((c ? '  ok  - ' : '  FAIL- ') + m); if (!c) fails++; };

console.log('# 1 starts with a single phone (#1)');
assert(state.activeSlots === 1, `default activeSlots = 1 (${state.activeSlots})`);
assert(state.activeCustomers.length === 1, `one phone on the bench at open (${state.activeCustomers.length})`);

console.log('# golden phone break -> fine + taken away (#3)');
{
  const c = getActive();
  c.phone.variant = 'golden';
  c.phone.tier = 5;
  let icon = c.phone.icons.find((i) => i.badge > 0);
  if (!icon) { c.phone.icons[0].badge = 3; c.phone.badgeTotal = 3; icon = c.phone.icons[0]; }
  state.points = 1000;
  setRandom(0); // 强制碎裂 + 命中
  bus.emit({ type: 'BADGE_CLEARED', customerId: c.id, iconId: icon.id, amount: 1, x: 0, y: 0 });
  restoreRandom();
  assert((risk['golden_break'] || 0) >= 1, 'RISK_EVENT golden_break fired');
  assert(state.points < 1000, `fine deducted (1000 -> ${state.points})`);
  assert(!state.activeCustomers.some((x) => x.id === c.id), 'golden customer taken away');
}

console.log('# cosmic transformer -> bankrupt (cash to 0) (#5)');
{
  const c = getActive();
  c.phone.variant = 'cosmic';
  c.phone.transformMs = 50;
  state.points = 500;
  tick(120); // 倒计时归零 → 变形砸店
  assert((risk['transformer'] || 0) >= 1, 'RISK_EVENT transformer fired');
  assert(state.points === 0, `cash wiped to 0 (was 500 -> ${state.points})`);
  assert(state.level === 6, 'level preserved through bankruptcy');
  assert(!state.activeCustomers.some((x) => x.id === c.id), 'cosmic customer removed');
}

console.log('# blind-box offer: accept -> win pays out (#2)');
{
  const c = getActive();
  c.phone.tier = 4;
  const popup: PhonePopup = { id: 'off1', kind: 'offer', fx: 0.12, fy: 0.3, fw: 0.7, fh: 0.32, closeFx: 0.82, closeFy: 0.07, closeFw: 0.15, closeFh: 0.28, bornAt: 0, installAt: Number.POSITIVE_INFINITY, title: 't', body: 'b', accent: '#8E7CF6' };
  c.phone.popups.push(popup);
  state.points = 200;
  const pl = phoneLayout(c.id);
  const acc = popupAcceptRect(popupRectOf(pl, popup));
  setRandom(0); // 0 < OFFER_WIN_CHANCE -> win
  bus.emit({ type: 'TAP', x: acc.x + acc.w / 2, y: acc.y + acc.h / 2 });
  restoreRandom();
  assert((risk['offer_win'] || 0) >= 1, 'RISK_EVENT offer_win fired');
  assert(state.points > 200, `offer win paid out (200 -> ${state.points})`);
  assert(!c.phone.popups.some((p) => p.id === 'off1'), 'offer popup consumed');
}

console.log('# blind-box offer: accept -> fail wipes data + fine (#2)');
{
  const c = getActive();
  c.phone.tier = 4;
  const popup: PhonePopup = { id: 'off2', kind: 'offer', fx: 0.12, fy: 0.3, fw: 0.7, fh: 0.32, closeFx: 0.82, closeFy: 0.07, closeFw: 0.15, closeFh: 0.28, bornAt: 0, installAt: Number.POSITIVE_INFINITY, title: 't', body: 'b', accent: '#8E7CF6' };
  c.phone.popups.push(popup);
  state.points = 500;
  const acc = popupAcceptRect(popupRectOf(phoneLayout(c.id), popup));
  setRandom(0.99); // 0.99 > win chance -> fail
  bus.emit({ type: 'TAP', x: acc.x + acc.w / 2, y: acc.y + acc.h / 2 });
  restoreRandom();
  assert((risk['offer_fail'] || 0) >= 1, 'RISK_EVENT offer_fail fired');
  assert(state.points < 500, `offer fail charged a fine (500 -> ${state.points})`);
  assert(!state.activeCustomers.some((x) => x.id === c.id), 'data-wiped customer left');
}

console.log('# soul phone grants a rare skill on return (#4)');
{
  const c = getActive();
  c.phone.variant = 'soul';
  const before = skillUnlocks;
  setRandom(0); // 0 < SOUL_SKILL_CHANCE -> grant
  bus.emit({ type: 'PHONE_CLEANED', customerId: c.id });
  restoreRandom();
  assert((risk['soul_skill'] || 0) >= 1, 'RISK_EVENT soul_skill fired');
  assert(skillUnlocks > before, 'a skill was granted (SKILL_UNLOCKED)');
}

console.log('\n==== ' + (fails === 0 ? 'ALL PASS' : fails + ' FAILURES') + ' ====');
console.log('risk:', JSON.stringify(risk), 'skillUnlocks', skillUnlocks);
process.exit(fails === 0 ? 0 : 1);
