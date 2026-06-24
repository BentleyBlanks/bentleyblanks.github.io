import { gsap } from 'gsap';
import { FEEL, COLORS } from '../config/theme';
import { TIERS } from '../config/cards';
import { sel } from '../state/gameStore';
import { fmt } from '../util/format';
import type { InfoCard } from '../objects/InfoCard';
import type { SlotMouth } from '../objects/SlotMouth';
import type { GameContext } from '../game/context';

interface Job {
  remaining: number;
  total: number;
  payout: number;
  glitched: boolean;
}

// Furnace digestion + payout (§3 单卡产出, §5 全局公式).
export class DigestSystem {
  private jobs: Job[] = [];

  constructor(private ctx: GameContext) {}

  /** Resolve a card dropped into a mouth (§A.6.6/6.7). Returns nothing. */
  accept(card: InfoCard, mouth: SlotMouth) {
    if (card.busy) return;
    card.busy = true;
    const def = TIERS[card.model.tier];
    const correct = mouth.kind === def.correctSlot;

    // pull from the live list immediately so it stops counting as backlog
    this.ctx.spawner.remove(card);

    const s = this.ctx.store.getState();
    const base = def.base * card.model.appMul * card.model.depthMul;
    const globalMul = sel.yieldMul(s) * sel.permMul(s) * sel.haluDiscount(s) * sel.stageMul(s);

    let payout = 0;
    let glitched = false;

    if (!correct) {
      // §3 分错只给该层 30% 算力 + §6.2 误分类 +5%
      payout = base * 0.3 * globalMul;
      this.ctx.hallu.onMisclassify();
      glitched = true;
    } else {
      // correct routing — but processing may still trigger a hallucination (§6.5)
      glitched = this.ctx.hallu.rollGlitch(card);
      payout = base * (glitched ? 0.4 : 1) * globalMul;
      this.ctx.hallu.onCorrect();
      if (!glitched) {
        // §4 权限：only-up passive counter, trickles from clean high-tier work
        this.ctx.store.getState().addPermission(def.base >= 25 ? 1 : 0);
      } else {
        this.ctx.store.getState().bumpHallucination(2); // §6.7 漏判小挫折
      }
    }

    this.ctx.store.getState().markProcessed();
    this.animateIntoMouth(card, mouth, correct, glitched);

    const digestTime = (def.digest <= 0 ? 0.5 : def.digest) / sel.throughputMul(s);
    this.jobs.push({ remaining: digestTime, total: digestTime, payout, glitched });
  }

  private animateIntoMouth(card: InfoCard, mouth: SlotMouth, correct: boolean, glitched: boolean) {
    mouth.eat(correct);
    this.ctx.furnace.chomp();
    if (glitched) {
      card.setGlitched(true);
      const p = card.getGlobalPosition();
      const lp = this.ctx.layers.particle.toLocal(p);
      this.ctx.particles.shards(lp.x, lp.y);
    }
    const mouthWorld = mouth.getGlobalPosition();
    const target = this.ctx.layers.card.toLocal(mouthWorld);
    gsap.killTweensOf(card);
    gsap.killTweensOf(card.scale);
    gsap.to(card, { x: target.x, y: target.y, rotation: 0, duration: FEEL.furnaceEat, ease: 'power2.in' });
    gsap.to(card.scale, {
      x: 0.1,
      y: 0.1,
      duration: FEEL.furnaceEat,
      ease: 'power2.in',
      onComplete: () => {
        if (!card.destroyed) card.destroy();
      },
    });
  }

  tick(dt: number) {
    if (!this.jobs.length) {
      this.ctx.furnace.showProgress(0);
      return;
    }
    let sumRatio = 0;
    for (const job of this.jobs) {
      job.remaining -= dt;
      sumRatio += 1 - Math.max(0, job.remaining) / job.total;
    }
    this.ctx.furnace.showProgress(sumRatio / this.jobs.length);

    const done = this.jobs.filter((j) => j.remaining <= 0);
    if (done.length) {
      this.jobs = this.jobs.filter((j) => j.remaining > 0);
      for (const j of done) this.payout(j);
    }
  }

  private payout(job: Job) {
    const amount = Math.max(0, Math.round(job.payout));
    if (amount <= 0 && !job.glitched) return;
    this.ctx.store.getState().addCompute(amount);

    const core = this.ctx.furnace.coreWorldPos();
    const fl = this.ctx.layers.floating.toLocal(core);
    this.ctx.floatText.pop(fl.x, fl.y - 10, `+${fmt(amount)}`, job.glitched ? COLORS.bad : COLORS.acc, 22);

    // a few compute chips fly to the HUD readout (§2.5.3)
    const hud = this.ctx.computeAnchor();
    const target = this.ctx.layers.particle.toLocal(hud);
    const src = this.ctx.layers.particle.toLocal(core);
    const chips = Math.min(4, 1 + Math.floor(amount / 8));
    for (let i = 0; i < chips; i++) {
      gsap.delayedCall(i * 0.05, () => this.ctx.particles.chip(src.x, src.y, target.x, target.y, () => this.ctx.hud.pulseCompute()));
    }
  }
}
