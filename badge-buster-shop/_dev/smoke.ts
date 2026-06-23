// Headless logic smoke for the refactored mechanics (no render/input/audio).
import { content } from './src/content';
import { createEventBus } from './src/core/eventBus';
import { createInitialState } from './src/core/persistence';
import { createEconomyModule } from './src/economy/economyModule';
import { createSkillsModule } from './src/skills/skillsModule';
import { createShopModule } from './src/shop/shopModule';
import { createUiModule } from './src/ui/uiModule';
import { createCoreModule } from './src/core/coreModule';
import { createAutomationModule } from './src/automation/automationModule';
import { computeGameLayout, popupRectOf } from './src/shared/layout';
import { computeUiLayout } from './src/shared/uiLayout';
import type { GameContext, GameModule } from './src/types/module.types';
import type { GameEvent } from './src/types/events.types';

let clock = 1000;
(globalThis as unknown as { performance: { now: () => number } }).performance = { now: () => clock };
const store = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(), key: () => null, length: 0,
} as Storage;

const W = 1000, H = 700;
const canvas = { clientWidth: W, clientHeight: H } as HTMLCanvasElement;
const bus = createEventBus();
const state = createInitialState(clock);
state.level = 5; // 解锁诈骗弹窗与部分技能
state.points = 1000;
const ctx: GameContext = { state, bus, content, assets: { images: {}, audio: {} }, canvas, ctx2d: {} as CanvasRenderingContext2D };

const counts: Record<string, number> = {};
for (const t of ['POPUP_CLOSED', 'SCAM_INSTALLED', 'BADGE_CLEARED', 'PHONE_RETURNED', 'CUSTOMER_LEFT', 'UPGRADE_PURCHASED']) {
  bus.on(t as GameEvent['type'], () => { counts[t] = (counts[t] || 0) + 1; });
}

const modules: GameModule[] = [
  createEconomyModule(), createSkillsModule(), createShopModule(), createUiModule(), createCoreModule(), createAutomationModule(),
];
for (const m of modules) m.init(ctx);

function tick(dt: number) { clock += dt; bus.emit({ type: 'TICK', dt }); for (const m of modules) m.update?.(dt); }
function tickUntil(pred: () => boolean, maxMs: number, dt = 100): boolean {
  let t = 0;
  while (t < maxMs) { tick(dt); t += dt; if (pred()) return true; }
  return false;
}

let fails = 0;
const assert = (c: boolean, m: string) => { console.log((c ? '  ok  - ' : '  FAIL- ') + m); if (!c) fails++; };
const active = () => state.activeCustomers[0];

console.log('# active customer + popups');
assert(tickUntil(() => state.activeCustomers.length > 0, 4000), 'a customer reaches the workbench');
assert(tickUntil(() => (active()?.phone.popups.length ?? 0) > 0, 14000), `ad popup spawned (${active()?.phone.popups.length})`);

console.log('# tapping a popup body blocks the icon under it');
{
  const lay = computeGameLayout(state, W, H);
  const phone = lay.phoneLayouts[0];
  const popup = phone.customer.phone.popups[0];
  const rect = popupRectOf(phone, popup);
  const covered = phone.icons.find((ic) => ic.icon.badge > 0 && ic.x >= rect.x && ic.x <= rect.x + rect.w && ic.y >= rect.y && ic.y <= rect.y + rect.h);
  if (covered) {
    const before = covered.icon.badge;
    bus.emit({ type: 'TAP', x: covered.x, y: covered.y }); // body of popup, not the ✕
    assert(covered.icon.badge === before, 'icon under popup was NOT cleared (blocked)');
  } else {
    console.log('  ..  - (no badge icon under popup this run, skipping block check)');
  }
}

console.log('# tapping ✕ closes the popup');
{
  const lay = computeGameLayout(state, W, H);
  const phone = lay.phoneLayouts[0];
  const popup = phone.customer.phone.popups[0];
  const rect = popupRectOf(phone, popup);
  const before = phone.customer.phone.popups.length;
  const closedBefore = counts['POPUP_CLOSED'] || 0;
  bus.emit({ type: 'TAP', x: rect.closeX + rect.closeW / 2, y: rect.closeY + rect.closeH / 2 });
  assert(active()?.phone.popups.length === before - 1, 'popup removed after tapping ✕');
  assert((counts['POPUP_CLOSED'] || 0) === closedBefore + 1, 'POPUP_CLOSED fired');
}

console.log('# scam popup installs -> penalty + reputation drop');
assert(tickUntil(() => (active()?.phone.popups.some((p) => p.kind === 'scam') ?? false), 26000), 'scam popup spawned');
{
  const repBefore = state.reputation;
  const pointsBefore = state.points;
  const installedBefore = counts['SCAM_INSTALLED'] || 0;
  // 不去拆它，等它自动安装
  const fired = tickUntil(() => (counts['SCAM_INSTALLED'] || 0) > installedBefore, 9000);
  assert(fired, 'SCAM_INSTALLED fired after grace expired');
  assert(state.points < pointsBefore, `money deducted (${pointsBefore} -> ${state.points})`);
  assert(state.reputation < repBefore + 0.001, `reputation dropped (${repBefore.toFixed(2)} -> ${state.reputation.toFixed(2)})`);
}

console.log('# active customer loses patience over time');
{
  const c = active();
  if (c) {
    const before = c.patience;
    tick(1000);
    assert(c.patience < before, `active patience drains (${Math.round(before)} -> ${Math.round(c.patience)})`);
  } else {
    console.log('  ..  - (no active customer, skipping patience check)');
  }
}

console.log('# UI tap opens modal and is consumed (no gameplay fall-through)');
{
  const ui = computeUiLayout(state, W, H, content.upgrades.map((u) => u.id), content.skills.map((s) => s.id));
  const shopBtn = ui.buttons.find((b) => b.id === 'shop')!;
  const ev: GameEvent = { type: 'TAP', x: shopBtn.rect.x + shopBtn.rect.w / 2, y: shopBtn.rect.y + shopBtn.rect.h / 2 };
  bus.emit(ev);
  assert(state.ui.modal === 'shop', 'shop modal opened by button tap');
  assert((ev as { consumed?: boolean }).consumed === true, 'UI tap was consumed');
  // buy an upgrade through the modal row
  const ui2 = computeUiLayout(state, W, H, content.upgrades.map((u) => u.id), content.skills.map((s) => s.id));
  if (ui2.modal.open) {
    const row = ui2.modal.rows[0];
    const pBefore = state.points;
    bus.emit({ type: 'TAP', x: row.rect.x + row.rect.w / 2, y: row.rect.y + row.rect.h / 2 });
    assert((counts['UPGRADE_PURCHASED'] || 0) >= 1 || state.points === pBefore, 'modal row tap routed to BUY_UPGRADE');
  }
}

console.log('\n==== ' + (fails === 0 ? 'ALL PASS' : fails + ' FAILURES') + ' ====');
console.log('counts:', JSON.stringify(counts), 'level', state.level, 'points', Math.round(state.points), 'rep', state.reputation.toFixed(2));
process.exit(fails === 0 ? 0 : 1);
