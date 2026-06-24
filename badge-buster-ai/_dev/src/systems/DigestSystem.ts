import { gsap } from 'gsap';
import { FEEL, COLORS } from '../config/theme';
import { TIERS } from '../config/cards';
import { sel } from '../state/gameStore';
import { fmt } from '../util/format';
import { toastOnce } from '../ui/Toast';
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
    // stop any in-flight spawn timeline so its onComplete can't fight the eat anim
    card.spawnTl?.kill();
    card.spawnTl = null;
    const def = TIERS[card.model.tier];
    const correct = mouth.kind === def.correctSlot;

    // pull from the live list immediately so it stops counting as backlog
    this.ctx.spawner.remove(card);

    const s = this.ctx.store.getState();
    const base = def.base * card.model.appMul * card.model.depthMul;
    const globalMul =
      sel.yieldMul(s) * sel.permMul(s) * sel.haluDiscount(s) * sel.stageMul(s) * sel.satisfactionMul(s);

    let payout = 0;
    let glitched = false;

    if (!correct) {
      // §3 分错只给该层 30% 算力 + §6.2 误分类 +5%
      payout = base * 0.3 * globalMul;
      this.ctx.hallu.onMisclassify();
      glitched = true;
      // handed the host the wrong tray → he's annoyed
      this.ctx.store.getState().bumpSatisfaction(-8);
      this.ctx.host.react('bad');
      toastOnce(
        'misclass',
        '分错托盘了！',
        '这张卡进了错的托盘，<b>宿主满意度下降</b>，幻觉风险也会上升。拿不准时先<b>点一下卡片偷看</b>再分。',
      );
    } else {
      // correct routing — but processing may still trigger a hallucination (§6.5)
      glitched = this.ctx.hallu.rollGlitch(card);
      payout = base * (glitched ? 0.4 : 1) * globalMul;
      this.ctx.hallu.onCorrect();
      if (!glitched) {
        // §4 权限：only-up passive counter, trickles from clean high-tier work
        this.ctx.store.getState().addPermission(def.base >= 25 ? 1 : 0);
        // good info delivered → host happier (high-value intel pleases him more)
        this.ctx.store.getState().bumpSatisfaction(def.base >= 25 ? 6 : 3);
        this.ctx.host.react('good');
      } else {
        this.ctx.store.getState().bumpHallucination(2); // §6.7 漏判小挫折
        this.ctx.store.getState().bumpSatisfaction(-4);
        this.ctx.host.react('bad');
        toastOnce(
          'glitch',
          '⚠️ 幻觉发作了',
          '幻觉风险太高时，卡片内容会被<b>篡改成假消息</b>（看那张抖动变红的卡）。把假信息转交给宿主＝坑了他。<b>买“事实核查/信息加固”能压住幻觉。</b>',
        );
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

    const src = this.ctx.layers.particle.toLocal(core);

    // hand the tidied note over to the 宿主 — the visible "info delivered" beat
    const hostPos = this.ctx.layers.particle.toLocal(this.ctx.host.avatarWorldPos());
    this.ctx.particles.parcel(src.x, src.y, hostPos.x, hostPos.y, !job.glitched);

    // a few compute chips fly to the HUD readout (§2.5.3)
    const hud = this.ctx.computeAnchor();
    const target = this.ctx.layers.particle.toLocal(hud);
    const chips = Math.min(4, 1 + Math.floor(amount / 8));
    for (let i = 0; i < chips; i++) {
      gsap.delayedCall(i * 0.05, () => this.ctx.particles.chip(src.x, src.y, target.x, target.y, () => this.ctx.hud.pulseCompute()));
    }
  }
}
