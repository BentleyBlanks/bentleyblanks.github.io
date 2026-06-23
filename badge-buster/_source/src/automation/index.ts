// automation —— 学徒机器人自动清角标（Agent 5）
// 拥有：botAccumulator。清除统一发 BADGE_CLEARED 由 core 落地。
import type { GameContext, GameModule } from '../types/module.types';
import { UPGRADES } from '../content';
import { computeLayout } from '../types/layout';

export function createAutomationModule(): GameModule {
  let ctx!: GameContext;

  function botSpeedMult(): number {
    const def = UPGRADES.find((u) => u.id === 'up_botspeed');
    const lvl = ctx.state.upgrades['up_botspeed'] ?? 0;
    return def ? def.effect(lvl) : 1;
  }

  return {
    name: 'automation',
    init(c) { ctx = c; },
    update(dt) {
      const now = ctx.now();
      const d = ctx.state.derived;
      const extraActive = now < ctx.state.effects.extraHandsUntil;
      const extraRate = extraActive ? ctx.state.effects.extraHands * 0.5 * botSpeedMult() : 0;
      const rate = d.botRatePerSec + extraRate;
      if (rate <= 0) { ctx.state.botAccumulator = 0; return; }

      ctx.state.botAccumulator += (rate * dt) / 1000;
      // 极端投入下 rate 可能很大：每帧最多处理 safety 次，并夹住累加器防止无界增长
      const SAFETY = 64;
      ctx.state.botAccumulator = Math.min(ctx.state.botAccumulator, SAFETY);
      let safety = SAFETY;
      while (ctx.state.botAccumulator >= 1 && safety-- > 0) {
        const layout = computeLayout(ctx.state);
        // 找有角标的工位
        const targets = ctx.state.activeCustomers
          .map((cc, si) => ({ cc, si }))
          .filter((t) => t.cc.phone.badgeTotal > 0);
        if (targets.length === 0) { ctx.state.botAccumulator = Math.min(ctx.state.botAccumulator, 1); break; }
        const { cc, si } = targets[Math.floor(Math.random() * targets.length)];
        const icon = cc.phone.icons.find((i) => i.badge > 0);
        if (!icon) { ctx.state.botAccumulator -= 1; continue; }
        const cell = layout.stations[si]?.cells.find((x) => x.col === icon.col && x.row === icon.row);
        ctx.bus.emit({
          type: 'BADGE_CLEARED', customerId: cc.id, iconId: icon.id, amount: 1,
          x: cell ? cell.rect.x + cell.rect.w / 2 : 0,
          y: cell ? cell.rect.y + cell.rect.h / 2 : 0,
        });
        ctx.state.botAccumulator -= 1;
      }
    },
  };
}
