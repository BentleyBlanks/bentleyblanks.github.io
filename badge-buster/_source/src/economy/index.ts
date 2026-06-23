// economy —— 经济与升级（Agent 4）
// 拥有：xp/xpToNext/level/points/upgrades/derived.*。
import type { GameContext, GameModule } from '../types/module.types';
import type { GameState } from '../types/state.types';
import { UPGRADES, Balance } from '../content';

function lvl(state: GameState, id: string): number {
  return state.upgrades[id] ?? 0;
}

function upEffect(state: GameState, id: string): number {
  const def = UPGRADES.find((u) => u.id === id);
  if (!def) return 0;
  return def.effect(lvl(state, id));
}

export function recomputeDerived(state: GameState) {
  const d = state.derived;
  d.clearPerHit = 1 + lvl(state, 'up_clear');
  d.xpPerBadge = 1 * upEffect(state, 'up_value');          // 1.15^lvl
  d.swipeEnabled = lvl(state, 'up_swipe') > 0;
  d.botCount = lvl(state, 'up_botcount');
  d.botRatePerSec = d.botCount * 0.5 * upEffect(state, 'up_botspeed'); // *1.2^lvl
  d.payoutMult = upEffect(state, 'up_payout') * Balance.reputationPayoutFactor(state.reputation);
  d.arrivalIntervalMs = Balance.arrivalIntervalMs(state.reputation, state.level);
}

export function createEconomyModule(): GameModule {
  let ctx!: GameContext;

  function grantXp(rawAmount: number) {
    const now = ctx.now();
    const tip = now < ctx.state.effects.tipBoostUntil ? ctx.state.effects.tipBoostMult : 1;
    const gain = rawAmount * ctx.state.derived.xpPerBadge * tip;
    ctx.state.xp += gain;
    ctx.bus.emit({ type: 'XP_GAINED', amount: gain });
    while (ctx.state.xp >= ctx.state.xpToNext) {
      ctx.state.xp -= ctx.state.xpToNext;
      ctx.state.level += 1;
      ctx.state.xpToNext = Balance.xpToNext(ctx.state.level);
      ctx.bus.emit({ type: 'LEVEL_UP', level: ctx.state.level });
    }
  }

  function buyUpgrade(id: string) {
    const def = UPGRADES.find((u) => u.id === id);
    if (!def) return;
    const owned = lvl(ctx.state, id);
    if (def.maxLevel > 0 && owned >= def.maxLevel) return;
    const cost = Balance.upgradeCost(def.baseCost, def.costGrowth, owned);
    if (ctx.state.points < cost) return;
    ctx.state.points -= cost;
    ctx.state.upgrades[id] = owned + 1;
    recomputeDerived(ctx.state);
    ctx.bus.emit({ type: 'UPGRADE_PURCHASED', id, newLevel: owned + 1 });
  }

  return {
    name: 'economy',
    init(c) {
      ctx = c;
      recomputeDerived(ctx.state);
      ctx.bus.on('BADGE_CLEARED', (e) => grantXp(e.amount));
      ctx.bus.on('PHONE_RETURNED', (e) => { ctx.state.points += e.payout; });
      ctx.bus.on('BUY_UPGRADE', (e) => buyUpgrade(e.id));
      ctx.bus.on('LEVEL_UP', () => recomputeDerived(ctx.state));
      ctx.bus.on('REPUTATION_CHANGED', () => recomputeDerived(ctx.state));
    },
  };
}
