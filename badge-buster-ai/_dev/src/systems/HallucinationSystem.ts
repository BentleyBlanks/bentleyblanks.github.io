import { TIERS } from '../config/cards';
import { sel } from '../state/gameStore';
import type { InfoCard } from '../objects/InfoCard';
import type { GameContext } from '../game/context';

// Hallucination = the only negative resource, an open-odds bar (§6).
export class HallucinationSystem {
  constructor(private ctx: GameContext) {}

  tick(dt: number) {
    const s = this.ctx.store.getState();
    const backlog = this.ctx.spawner.cards.filter((c) => !c.busy).length;
    // rise: +0.3%/s per unprocessed card (§6.2); fall: passive decay (§6.2).
    const rise = 0.3 * backlog * dt;
    const fall = sel.decayPerSec(s) * dt;
    if (rise - fall !== 0) this.ctx.store.getState().bumpHallucination(rise - fall);
    // re-print each card's actual probability (§6.3 写在明面上).
    for (const c of this.ctx.spawner.cards) this.refreshCard(c);
  }

  /** single-card hallucination probability (§6.3 公式). */
  cardPct(card: InfoCard): number {
    const s = this.ctx.store.getState();
    const frag = TIERS[card.model.tier].fragility;
    return Math.min(75, s.hallucination * frag * (1 - sel.suppression(s)));
  }

  refreshCard(card: InfoCard) {
    card.setHalluPct(this.cardPct(card));
  }

  /** roll whether processing this card triggers a hallucination → 故障卡 (§6.5). */
  rollGlitch(card: InfoCard): boolean {
    return Math.random() * 100 < this.cardPct(card);
  }

  /** §6.2 手动误分类 一次性 +5%. */
  onMisclassify() {
    this.ctx.store.getState().bumpHallucination(5);
  }

  /** §6.2 分拣/纠正 1 张卡 −0.5%. */
  onCorrect() {
    this.ctx.store.getState().bumpHallucination(-0.5);
  }
}
