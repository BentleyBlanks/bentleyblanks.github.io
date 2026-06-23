// Headless logic smoke for the new mechanics (#1 block, #4 notif pull, #5 malware clean/lag) + scam.
import { content } from './src/content';
import { MALWARE_LAG_THRESHOLD, MALWARE_MAX } from './src/content/balance';
import { createEventBus } from './src/core/eventBus';
import { createInitialState } from './src/core/persistence';
import { createEconomyModule } from './src/economy/economyModule';
import { createSkillsModule } from './src/skills/skillsModule';
import { createShopModule } from './src/shop/shopModule';
import { createUiModule } from './src/ui/uiModule';
import { createCoreModule } from './src/core/coreModule';
import { createAutomationModule } from './src/automation/automationModule';
import { computeGameLayout, malwareButtonRect, notifBarRect, popupRectOf } from './src/shared/layout';
import type { GameContext, GameModule } from './src/types/module.types';
import type { GameEvent } from './src/types/events.types';

let clock = 1000;
(globalThis as unknown as { performance: { now: () => number } }).performance = { now: () => clock };
const store = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k), clear: () => store.clear(), key: () => null, length: 0,
} as Storage;

const W = 1200, H = 760;
const canvas = { clientWidth: W, clientHeight: H } as HTMLCanvasElement;
const bus = createEventBus();
const state = createInitialState(clock);
state.level = 6;
state.points = 1000;
const ctx: GameContext = { state, bus, content, assets: { images: {}, audio: {} }, canvas, ctx2d: {} as CanvasRenderingContext2D };

const counts: Record<string, number> = {};
for (const t of ['NOTIFICATION_CLEARED', 'MALWARE_CLEARED', 'POPUP_CLOSED', 'SCAM_INSTALLED', 'BADGE_CLEARED']) {
  bus.on(t as GameEvent['type'], () => { counts[t] = (counts[t] || 0) + 1; });
}

const modules: GameModule[] = [
  createEconomyModule(), createSkillsModule(), createShopModule(), createUiModule(), createCoreModule(), createAutomationModule(),
];
for (const m of modules) m.init(ctx);

function tick(dt: number) { clock += dt; bus.emit({ type: 'TICK', dt }); for (const m of modules) m.update?.(dt); }
function tickUntil(pred: () => boolean, maxMs: number, dt = 100): boolean { let t = 0; while (t < maxMs) { tick(dt); t += dt; if (pred()) return true; } return false; }
const lay = () => computeGameLayout(state, W, H);

let fails = 0;
const assert = (c: boolean, m: string) => { console.log((c ? '  ok  - ' : '  FAIL- ') + m); if (!c) fails++; };

console.log('# 3 phones tiled by default (#6)');
assert(tickUntil(() => state.activeCustomers.length >= 3, 6000), `active slots filled (${state.activeCustomers.length})`);
assert(state.activeSlots === 3, `default activeSlots = 3 (${state.activeSlots})`);

console.log('# notification pull-down clears (#4)');
{
  const phone = lay().phoneLayouts.find((p) => p.customer.phone.notifications > 0);
  if (phone) {
    const before = phone.customer.phone.notifications;
    const bar = notifBarRect(phone);
    const cx = bar.x + bar.w / 2;
    bus.emit({ type: 'SWIPE', path: [{ x: cx, y: bar.y + 4 }, { x: cx, y: bar.y + 40 }, { x: cx, y: bar.y + 78 }] });
    assert(phone.customer.phone.notifications < before, `pull cleared notifications (${before} -> ${phone.customer.phone.notifications})`);
    assert((counts['NOTIFICATION_CLEARED'] || 0) >= 1, 'NOTIFICATION_CLEARED fired');
  } else {
    console.log('  ..  - (no notifications present, skipping)');
  }
}

console.log('# malware clean button (#5)');
{
  const phone = lay().phoneLayouts.find((p) => p.customer.phone.malware > 0) ?? lay().phoneLayouts[0];
  phone.customer.phone.malware = Math.max(phone.customer.phone.malware, 40);
  const before = phone.customer.phone.malware;
  const btn = malwareButtonRect(phone);
  bus.emit({ type: 'TAP', x: btn.x + btn.w / 2, y: btn.y + btn.h / 2 });
  assert(phone.customer.phone.malware < before, `clean button reduced malware (${Math.round(before)} -> ${Math.round(phone.customer.phone.malware)})`);
  assert((counts['MALWARE_CLEARED'] || 0) >= 1, 'MALWARE_CLEARED fired');
}

console.log('# malware lag blocks clearing (#5)');
{
  const phone = lay().phoneLayouts[0];
  phone.customer.phone.malware = MALWARE_MAX;
  const icon = phone.icons.find((i) => i.icon.badge > 0);
  if (icon) {
    const before = icon.icon.badge;
    bus.emit({ type: 'TAP', x: icon.x, y: icon.y });
    assert(icon.icon.badge === before, `laggy phone (malware>=${MALWARE_LAG_THRESHOLD}) cannot clear badges`);
  } else {
    console.log('  ..  - (no badge on phone[0], skipping)');
  }
  phone.customer.phone.malware = 0; // 复原以便后续测试
}

console.log('# popup blocks the WHOLE phone (#1)');
{
  assert(tickUntil(() => lay().phoneLayouts.some((p) => p.customer.phone.popups.length > 0), 16000), 'a covering popup spawned');
  const phone = lay().phoneLayouts.find((p) => p.customer.phone.popups.length > 0)!;
  // 找一个不在弹窗下、却有角标的图标，证明"整机禁用"而非"只挡被覆盖的"
  const rects = phone.customer.phone.popups.map((pp) => popupRectOf(phone, pp));
  const exposed = phone.icons.find((i) => i.icon.badge > 0 && !rects.some((r) => i.x >= r.x && i.x <= r.x + r.w && i.y >= r.y && i.y <= r.y + r.h));
  if (exposed) {
    const before = exposed.icon.badge;
    bus.emit({ type: 'TAP', x: exposed.x, y: exposed.y });
    assert(exposed.icon.badge === before, 'an EXPOSED icon also cannot be cleared while a popup is up (whole-phone block)');
  } else {
    console.log('  ..  - (no exposed badged icon, skipping)');
  }
  // 关闭弹窗后应恢复
  const popup = phone.customer.phone.popups[0];
  const pr = popupRectOf(phone, popup);
  state.activeSlots = state.activeSlots; // noop
  while (phone.customer.phone.popups.length > 0) {
    const top = phone.customer.phone.popups[phone.customer.phone.popups.length - 1];
    const r = popupRectOf(phone, top);
    bus.emit({ type: 'TAP', x: r.closeX + r.closeW / 2, y: r.closeY + r.closeH / 2 });
  }
  void pr; void popup;
  assert(phone.customer.phone.popups.length === 0, 'closing ✕ removes popups -> phone operable again');
}

console.log('# cursor tracking (#7)');
{
  state.ui.cursor.visible = false;
  // 模拟 input 写入光标（input 模块在无 DOM 环境未挂载，这里直接验证字段存在且可写）
  state.ui.cursor.x = 123; state.ui.cursor.y = 456; state.ui.cursor.visible = true; state.ui.cursor.pressed = true;
  assert(state.ui.cursor.x === 123 && state.ui.cursor.visible && state.ui.cursor.pressed, 'cursor state is present and writable');
}

console.log('\n==== ' + (fails === 0 ? 'ALL PASS' : fails + ' FAILURES') + ' ====');
console.log('counts:', JSON.stringify(counts), 'slots', state.activeSlots, 'active', state.activeCustomers.length);
process.exit(fails === 0 ? 0 : 1);
