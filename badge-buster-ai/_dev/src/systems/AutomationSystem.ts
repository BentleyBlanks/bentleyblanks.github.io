import type { Tier } from '../types';
import type { GameContext } from '../game/context';

// Auto-agents (§8 自动化阶梯). MVP wires the first sweeper (§A.6.9); the crusher
// and sorter seed the half-automatic mid game.
export class AutomationSystem {
  private sweepT = 0;
  private crushT = 0;
  private sortT = 0;

  constructor(private ctx: GameContext) {}

  tick(dt: number) {
    const owned = this.ctx.store.getState().producers;
    const sweepers = owned['sweeper'] ?? 0;
    const crushers = owned['crusher'] ?? 0;
    const sorters = owned['sorter'] ?? 0;

    if (sweepers > 0) {
      this.sweepT += dt;
      const interval = Math.max(0.45, 2.4 / sweepers); // faster with more bots
      // flood guard: leave headroom so the desk never fills with tiny cards
      if (this.sweepT >= interval && this.ctx.spawner.cards.length < 22) {
        this.sweepT = 0;
        const icon = this.ctx.spawner.randomBadgedIcon();
        if (icon) this.ctx.spawner.popBadge(icon, { single: true });
      }
    }

    if (crushers > 0) {
      this.crushT += dt;
      if (this.crushT >= Math.max(0.5, 2 / crushers)) {
        this.crushT = 0;
        this.routeFirst(['invalid'], 'invalid');
      }
    }

    if (sorters > 0) {
      this.sortT += dt;
      if (this.sortT >= Math.max(0.6, 2.5 / sorters)) {
        this.sortT = 0;
        this.routeFirst(['normal', 'high'], 'valid');
      }
    }
  }

  private routeFirst(tiers: Tier[], slot: 'valid' | 'invalid') {
    // only grab cards that have finished their spawn flight, so they never get
    // yanked into the furnace while still tiny near the phone.
    const card = this.ctx.spawner.cards.find((c) => c.landed && !c.busy && tiers.includes(c.model.tier));
    if (!card) return;
    this.ctx.digest.accept(card, this.ctx.furnace.mouthByKind(slot));
  }
}
