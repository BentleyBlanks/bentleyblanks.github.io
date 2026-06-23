import { BASE_ARRIVAL_INTERVAL_MS, clamp, upgradeCost, xpToNextLevel } from '../content/balance';
import type { UpgradeDef } from '../types/content.types';
import type { GameContext, GameModule } from '../types/module.types';

function upgradeLevel(ctx: GameContext, id: string): number {
  return ctx.state.upgrades[id] ?? 0;
}

function upgrade(ctx: GameContext, id: string): UpgradeDef | undefined {
  return ctx.content.upgrades.find((item) => item.id === id);
}

export function recalcDerived(ctx: GameContext): void {
  const clearLevel = upgradeLevel(ctx, 'up_clear');
  const valueLevel = upgradeLevel(ctx, 'up_value');
  const swipeLevel = upgradeLevel(ctx, 'up_swipe');
  const botCountLevel = upgradeLevel(ctx, 'up_botcount');
  const botSpeedLevel = upgradeLevel(ctx, 'up_botspeed');
  const payoutLevel = upgradeLevel(ctx, 'up_payout');
  const repMult = 0.7 + ctx.state.reputation * 0.12;
  const levelPressure = 1 + Math.max(0, ctx.state.level - 1) * 0.018;

  ctx.state.derived.clearPerHit = 1 + clearLevel;
  ctx.state.derived.xpPerBadge = Math.pow(1.15, valueLevel);
  ctx.state.derived.payoutMult = Math.pow(1.2, payoutLevel) * clamp(repMult, 0.55, 1.35);
  ctx.state.derived.swipeEnabled = swipeLevel > 0;
  ctx.state.derived.botCount = botCountLevel;
  ctx.state.derived.botRatePerSec = botCountLevel * 0.5 * Math.pow(1.2, botSpeedLevel);
  ctx.state.derived.arrivalIntervalMs = Math.max(2_400, Math.floor(BASE_ARRIVAL_INTERVAL_MS / (repMult * levelPressure)));
}

export function createEconomyModule(): GameModule {
  let ctx: GameContext;

  function handleXp(amount: number): void {
    ctx.state.xp += amount;
    let leveled = false;
    while (ctx.state.xp >= ctx.state.xpToNext) {
      ctx.state.xp -= ctx.state.xpToNext;
      ctx.state.level += 1;
      ctx.state.xpToNext = xpToNextLevel(ctx.state.level);
      leveled = true;
      ctx.bus.emit({ type: 'LEVEL_UP', level: ctx.state.level });
    }
    if (leveled) {
      recalcDerived(ctx);
    }
  }

  function buyUpgrade(id: string): void {
    const def = upgrade(ctx, id);
    if (!def) {
      return;
    }
    const owned = upgradeLevel(ctx, id);
    if (def.maxLevel > 0 && owned >= def.maxLevel) {
      return;
    }
    const cost = upgradeCost(def, owned);
    if (ctx.state.points < cost) {
      return;
    }
    ctx.state.points -= cost;
    ctx.state.upgrades[id] = owned + 1;
    recalcDerived(ctx);
    ctx.bus.emit({ type: 'UPGRADE_PURCHASED', id, newLevel: owned + 1 });
  }

  return {
    name: 'economy',
    init(context) {
      ctx = context;
      recalcDerived(ctx);
      ctx.bus.on('XP_GAINED', (event) => handleXp(event.amount));
      ctx.bus.on('PHONE_RETURNED', (event) => {
        ctx.state.points += event.payout;
      });
      ctx.bus.on('BUY_UPGRADE', (event) => buyUpgrade(event.id));
      ctx.bus.on('REPUTATION_CHANGED', () => recalcDerived(ctx));
    },
  };
}
