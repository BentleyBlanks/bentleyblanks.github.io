import { INCOMING_BASE_INTERVAL_MS } from '../content/balance';
import { computeGameLayout, type IconLayout, type PhoneLayout } from '../shared/layout';
import type { AppIconDef } from '../types/content.types';
import type { GameEvent } from '../types/events.types';
import type { GameContext, GameModule } from '../types/module.types';
import type { CustomerRuntime, IconRuntime } from '../types/state.types';
import { saveState } from './persistence';

function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function iconDef(icon: IconRuntime, defs: AppIconDef[]): AppIconDef | undefined {
  return defs.find((def) => def.id === icon.appId);
}

function recalcPhone(customer: CustomerRuntime): number {
  const total = customer.phone.icons.reduce((sum, icon) => sum + icon.badge, 0);
  customer.phone.badgeTotal = total;
  return total;
}

function phoneWorkTotal(customer: CustomerRuntime): number {
  const phone = customer.phone;
  return (
    recalcPhone(customer) +
    Math.max(0, phone.adNotifications) +
    Math.ceil(Math.max(0, phone.junkMb) / 45) +
    Math.ceil(Math.max(0, phone.memoryLoad) / 10) +
    Math.max(0, phone.backgroundApps)
  );
}

function taskRects(phone: PhoneLayout): Array<{ kind: 'junk' | 'memory' | 'background'; x: number; y: number; w: number; h: number }> {
  const gap = Math.max(4, phone.screenH * 0.014);
  const cardH = Math.max(22, Math.min(38, phone.screenH * 0.105));
  const startY = phone.screenY + phone.screenH * (phone.customer.phone.system === 'android' ? 0.56 : 0.66);
  const rects: Array<{ kind: 'junk' | 'memory' | 'background'; x: number; y: number; w: number; h: number }> = [];
  const x = phone.screenX + phone.screenW * 0.07;
  const w = phone.screenW * 0.86;
  if (phone.customer.phone.system === 'android') {
    rects.push({ kind: 'junk', x, y: startY, w, h: cardH });
    rects.push({ kind: 'memory', x, y: startY + cardH + gap, w, h: cardH });
  }
  rects.push({ kind: 'background', x, y: startY + rects.length * (cardH + gap), w, h: cardH });
  return rects;
}

function pointInRect(point: { x: number; y: number }, rect: { x: number; y: number; w: number; h: number }): boolean {
  return point.x >= rect.x && point.x <= rect.x + rect.w && point.y >= rect.y && point.y <= rect.y + rect.h;
}

function findIconAt(ctx: GameContext, x: number, y: number, extraRadius: number): IconLayout | null {
  const layout = computeGameLayout(ctx.state, ctx.canvas.clientWidth, ctx.canvas.clientHeight);
  let best: { icon: IconLayout; d: number } | null = null;
  for (const phone of layout.phoneLayouts) {
    for (const icon of phone.icons) {
      if (icon.icon.badge <= 0) {
        continue;
      }
      const radius = icon.size * 0.62 + extraRadius;
      const d = distance({ x, y }, icon);
      if (d <= radius && (!best || d < best.d)) {
        best = { icon, d };
      }
    }
  }
  return best?.icon ?? null;
}

function iconsAlongPath(ctx: GameContext, path: { x: number; y: number }[]): IconLayout[] {
  const layout = computeGameLayout(ctx.state, ctx.canvas.clientWidth, ctx.canvas.clientHeight);
  const touched = new Map<string, IconLayout>();
  for (const phone of layout.phoneLayouts) {
    for (const icon of phone.icons) {
      if (icon.icon.badge <= 0) {
        continue;
      }
      const radius = icon.size * 0.68;
      if (path.some((point) => distance(point, icon) <= radius)) {
        touched.set(icon.icon.id, icon);
      }
    }
  }
  return [...touched.values()];
}

function emitClear(ctx: GameContext, icon: IconLayout, amount: number): void {
  ctx.bus.emit({
    type: 'BADGE_CLEARED',
    customerId: icon.customerId,
    iconId: icon.icon.id,
    amount,
    x: icon.badgeX,
    y: icon.badgeY,
  });
}

function taskReward(ctx: GameContext, customer: CustomerRuntime, kind: 'ad' | 'junk' | 'memory' | 'background', amount: number, x: number, y: number): void {
  const units = kind === 'junk' ? Math.max(1, Math.ceil(amount / 45)) : Math.max(1, amount);
  customer.clearedBadges += units;
  ctx.state.totalCleared += units;
  const xpMult = performance.now() < ctx.state.effects.tipBoostUntil ? ctx.state.effects.tipBoostMult : 1;
  ctx.bus.emit({ type: 'XP_GAINED', amount: units * ctx.state.derived.xpPerBadge * xpMult });
  ctx.bus.emit({ type: 'PHONE_TASK_CLEARED', customerId: customer.id, kind, amount, x, y });
  if (phoneWorkTotal(customer) <= 0 && !customer.phone.cleaned) {
    customer.phone.cleaned = true;
    ctx.bus.emit({ type: 'PHONE_CLEANED', customerId: customer.id });
  }
}

export function createCoreModule(): GameModule {
  let ctx: GameContext;
  let saveAccumulator = 0;

  function applyClear(event: Extract<GameEvent, { type: 'BADGE_CLEARED' }>): void {
    const customer = ctx.state.activeCustomers.find((item) => item.id === event.customerId);
    const icon = customer?.phone.icons.find((item) => item.id === event.iconId);
    if (!customer || !icon || icon.badge <= 0 || event.amount <= 0) {
      event.amount = 0;
      return;
    }

    const amount = Math.min(icon.badge, Math.max(1, Math.floor(event.amount)));
    icon.badge -= amount;
    customer.clearedBadges += amount;
    ctx.state.totalCleared += amount;
    event.amount = amount;

    const xpMult = performance.now() < ctx.state.effects.tipBoostUntil ? ctx.state.effects.tipBoostMult : 1;
    ctx.bus.emit({ type: 'XP_GAINED', amount: amount * ctx.state.derived.xpPerBadge * xpMult });

    if (phoneWorkTotal(customer) <= 0 && !customer.phone.cleaned) {
      customer.phone.cleaned = true;
      ctx.bus.emit({ type: 'PHONE_CLEANED', customerId: customer.id });
    }
  }

  function clearPhoneTask(phone: PhoneLayout, kind: 'junk' | 'memory' | 'background', x: number, y: number): boolean {
    const customer = phone.customer;
    if (kind === 'junk') {
      if (customer.phone.system !== 'android' || customer.phone.junkMb <= 0) return false;
      const amount = Math.min(customer.phone.junkMb, ctx.state.derived.junkClearMb);
      customer.phone.junkMb -= amount;
      taskReward(ctx, customer, 'junk', amount, x, y);
      return true;
    }
    if (kind === 'memory') {
      if (customer.phone.system !== 'android' || customer.phone.memoryLoad <= 0) return false;
      const amount = Math.min(customer.phone.memoryLoad, ctx.state.derived.memoryClearPower);
      customer.phone.memoryLoad -= amount;
      taskReward(ctx, customer, 'memory', amount, x, y);
      return true;
    }
    if (customer.phone.backgroundApps <= 0) return false;
    const amount = Math.min(customer.phone.backgroundApps, ctx.state.derived.backgroundClearPower);
    customer.phone.backgroundApps -= amount;
    taskReward(ctx, customer, 'background', amount, x, y);
    return true;
  }

  function clearNotificationShade(phone: PhoneLayout, x: number, y: number): boolean {
    const customer = phone.customer;
    if (customer.phone.adNotifications <= 0) {
      return false;
    }
    const amount = Math.min(customer.phone.adNotifications, ctx.state.derived.adClearPower);
    customer.phone.adNotifications -= amount;
    taskReward(ctx, customer, 'ad', amount, x, y);
    return true;
  }

  function handleTaskTap(event: Extract<GameEvent, { type: 'TAP' }>): boolean {
    const layout = computeGameLayout(ctx.state, ctx.canvas.clientWidth, ctx.canvas.clientHeight);
    for (const phone of layout.phoneLayouts) {
      for (const rect of taskRects(phone)) {
        if (pointInRect(event, rect) && clearPhoneTask(phone, rect.kind, event.x, event.y)) {
          return true;
        }
      }
    }
    return false;
  }

  function handleNotificationPull(path: { x: number; y: number }[]): boolean {
    const first = path[0];
    const last = path[path.length - 1];
    if (!first || !last || last.y - first.y < 46 || Math.abs(last.x - first.x) > Math.abs(last.y - first.y) * 0.85) {
      return false;
    }
    const layout = computeGameLayout(ctx.state, ctx.canvas.clientWidth, ctx.canvas.clientHeight);
    for (const phone of layout.phoneLayouts) {
      const startsInShade = first.x >= phone.screenX && first.x <= phone.screenX + phone.screenW && first.y >= phone.screenY && first.y <= phone.screenY + phone.screenH * 0.34;
      if (startsInShade && clearNotificationShade(phone, last.x, last.y)) {
        return true;
      }
    }
    return false;
  }

  function handleTap(event: Extract<GameEvent, { type: 'TAP' }>): void {
    const magnet = performance.now() < ctx.state.effects.magnetUntil ? 46 : 0;
    const hit = findIconAt(ctx, event.x, event.y, magnet);
    if (hit) {
      emitClear(ctx, hit, ctx.state.derived.clearPerHit);
      return;
    }
    if (handleTaskTap(event)) {
      return;
    }
  }

  function handleSwipe(event: Extract<GameEvent, { type: 'SWIPE' }>): void {
    if (handleNotificationPull(event.path)) {
      return;
    }
    if (!ctx.state.derived.swipeEnabled) {
      const last = event.path[event.path.length - 1];
      if (last) {
        handleTap({ type: 'TAP', x: last.x, y: last.y });
      }
      return;
    }
    for (const icon of iconsAlongPath(ctx, event.path)) {
      emitClear(ctx, icon, ctx.state.derived.clearPerHit);
    }
  }

  function addIncomingBadge(customer: CustomerRuntime): void {
    const candidates = customer.phone.icons.filter((icon) => {
      const def = iconDef(icon, ctx.content.icons);
      return def ? icon.badge < def.maxBadge : true;
    });
    if (candidates.length === 0) {
      return;
    }
    const icon = candidates[Math.floor(Math.random() * candidates.length)];
    icon.badge += 1;
    customer.phone.badgeTotal += 1;
  }

  function updateIncoming(dt: number): void {
    const now = performance.now();
    if (now < ctx.state.effects.freezeIncomingUntil) {
      return;
    }
    for (const customer of ctx.state.activeCustomers) {
      if (customer.phone.cleaned) {
        continue;
      }
      const interval = INCOMING_BASE_INTERVAL_MS / Math.max(0.2, customer.phone.incomingRateMult);
      customer.phone.incomingAccumulatorMs += dt;
      let guard = 0;
      while (customer.phone.incomingAccumulatorMs >= interval && guard < 8) {
        customer.phone.incomingAccumulatorMs -= interval;
        addIncomingBadge(customer);
        guard += 1;
      }
      customer.phone.notificationAccumulatorMs += dt;
      const notificationInterval = Math.max(2_800, 6_200 / Math.max(0.55, customer.phone.incomingRateMult));
      while (customer.phone.notificationAccumulatorMs >= notificationInterval && customer.phone.adNotifications < 5) {
        customer.phone.notificationAccumulatorMs -= notificationInterval;
        customer.phone.adNotifications += 1;
      }
      customer.phone.utilityAccumulatorMs += dt;
      if (customer.phone.utilityAccumulatorMs >= 4_800) {
        customer.phone.utilityAccumulatorMs = 0;
        customer.phone.backgroundApps = Math.min(8, customer.phone.backgroundApps + 1);
        if (customer.phone.system === 'android') {
          customer.phone.junkMb = Math.min(999, customer.phone.junkMb + 18 + Math.floor(ctx.state.level * 1.5));
          customer.phone.memoryLoad = Math.min(100, customer.phone.memoryLoad + 4);
        }
      }
    }
  }

  return {
    name: 'core',
    init(context) {
      ctx = context;
      ctx.bus.on('BADGE_CLEARED', applyClear);
      ctx.bus.on('TAP', handleTap);
      ctx.bus.on('SWIPE', handleSwipe);
    },
    update(dt) {
      ctx.state.lastTickAt = performance.now();
      updateIncoming(dt);
      saveAccumulator += dt;
      if (saveAccumulator >= 3_000) {
        saveAccumulator = 0;
        saveState(ctx.state);
      }
    },
  };
}
