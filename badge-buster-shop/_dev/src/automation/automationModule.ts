import { computeGameLayout } from '../shared/layout';
import type { GameContext, GameModule } from '../types/module.types';

export function createAutomationModule(): GameModule {
  let ctx: GameContext;

  function clearOne(): boolean {
    const layout = computeGameLayout(ctx.state, ctx.canvas.clientWidth, ctx.canvas.clientHeight);
    const phones = [...layout.phoneLayouts].sort((a, b) => b.customer.phone.badgeTotal - a.customer.phone.badgeTotal);
    for (const phone of phones) {
      const candidates = phone.icons.filter((icon) => icon.icon.badge > 0);
      if (candidates.length === 0) {
        continue;
      }
      const target = candidates[Math.floor(Math.random() * candidates.length)];
      ctx.bus.emit({
        type: 'BADGE_CLEARED',
        customerId: target.customerId,
        iconId: target.icon.id,
        amount: 1,
        x: target.badgeX,
        y: target.badgeY,
      });
      return true;
    }
    return false;
  }

  return {
    name: 'automation',
    init(context) {
      ctx = context;
    },
    update(dt) {
      const now = performance.now();
      const extra = now < ctx.state.effects.extraHandsUntil ? ctx.state.effects.extraHands : 0;
      const rate = ctx.state.derived.botRatePerSec + extra;
      if (rate <= 0) {
        return;
      }
      ctx.state.botAccumulator += (dt / 1000) * rate;
      let guard = 0;
      while (ctx.state.botAccumulator >= 1 && guard < 12) {
        if (!clearOne()) {
          ctx.state.botAccumulator = Math.min(ctx.state.botAccumulator, 1);
          break;
        }
        ctx.state.botAccumulator -= 1;
        guard += 1;
      }
    },
  };
}
