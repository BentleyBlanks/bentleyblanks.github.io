import { INCOMING_BASE_INTERVAL_MS } from '../content/balance';
import { computeGameLayout, type IconLayout } from '../shared/layout';
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

    if (recalcPhone(customer) <= 0 && !customer.phone.cleaned) {
      customer.phone.cleaned = true;
      ctx.bus.emit({ type: 'PHONE_CLEANED', customerId: customer.id });
    }
  }

  function handleTap(event: Extract<GameEvent, { type: 'TAP' }>): void {
    const magnet = performance.now() < ctx.state.effects.magnetUntil ? 46 : 0;
    const hit = findIconAt(ctx, event.x, event.y, magnet);
    if (hit) {
      emitClear(ctx, hit, ctx.state.derived.clearPerHit);
    }
  }

  function handleSwipe(event: Extract<GameEvent, { type: 'SWIPE' }>): void {
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
