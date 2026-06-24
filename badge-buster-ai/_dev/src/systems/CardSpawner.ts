import { gsap } from 'gsap';
import { FEEL, BUDGET, COLORS } from '../config/theme';
import { APPS, COPY } from '../config/cards';
import type { AppDef } from '../config/cards';
import { InfoCard } from '../objects/InfoCard';
import { AppIcon } from '../objects/AppIcon';
import type { CardModel, Tier } from '../types';
import type { GameContext } from '../game/context';

// Desk scatter zone where popped cards land (§2.5.2 中央桌面：信息卡散落区).
const DESK = { x0: 372, x1: 824, y0: 232, y1: 648 };

export class CardSpawner {
  readonly cards: InfoCard[] = [];
  private nextId = 1;
  private badgeTimer = 0;
  private badgeInterval = 2.2; // seconds between organic notifications

  constructor(private ctx: GameContext) {}

  /** organic red-dot accumulation over time (§2.5.2 会冒红点). */
  tick(dt: number) {
    this.badgeTimer += dt;
    if (this.badgeTimer >= this.badgeInterval) {
      this.badgeTimer = 0;
      this.organicBadge();
    }
  }

  private organicBadge() {
    const icons = this.ctx.phone.icons;
    // cap total visible badges (§A.8 同屏可交互红点 ≤ 20)
    const total = icons.reduce((a, i) => a + i.count, 0);
    if (total >= BUDGET.maxBadges) return;
    const icon = icons[Math.floor(Math.random() * icons.length)];
    icon.addBadge(1);
  }

  private rollTier(def: AppDef): Tier {
    const entries = Object.entries(def.weights) as [Tier, number][];
    const sum = entries.reduce((a, [, w]) => a + w, 0);
    let r = Math.random() * sum;
    for (const [t, w] of entries) {
      r -= w;
      if (r <= 0) return t;
    }
    return 'invalid';
  }

  private makeModel(def: AppDef): CardModel {
    const tier = this.rollTier(def);
    const pool = COPY[tier];
    const copy = pool[Math.floor(Math.random() * pool.length)];
    return {
      id: this.nextId++,
      tier,
      appId: def.id,
      appEmoji: def.emoji,
      text: copy.text,
      glitchText: copy.glitch,
      glitched: false,
      depthMul: 1,
      appMul: def.coef,
    };
  }

  /** Player (or auto-agent) bursts a badge → cards fly out (§A.6.3). */
  popBadge(icon: AppIcon): boolean {
    if (icon.count <= 0) return false;
    if (this.cards.length >= BUDGET.maxCards) return false;
    icon.popBadge(1);
    const from = this.ctx.phone.badgeWorldPos(icon);
    const local = this.ctx.layers.card.toLocal(from);
    this.ctx.particles.burst(local.x, local.y, COLORS.bad, FEEL.burstParticleMin + Math.floor(Math.random() * (FEEL.burstParticleMax - FEEL.burstParticleMin)));

    const def = APPS.find((a) => a.id === icon.def.id)!;
    const n = 1 + Math.floor(Math.random() * Math.min(3, BUDGET.maxCards - this.cards.length));
    for (let i = 0; i < n; i++) this.spawnCard(def, local.x, local.y);
    return true;
  }

  private spawnCard(def: AppDef, fromX: number, fromY: number) {
    const model = this.makeModel(def);
    const card = new InfoCard(model);
    card.position.set(fromX, fromY);
    card.scale.set(0.4);
    card.rotation = (Math.random() - 0.5) * 0.5;
    this.ctx.layers.card.addChild(card);
    this.cards.push(card);
    this.ctx.hallu.refreshCard(card);

    const tx = DESK.x0 + Math.random() * (DESK.x1 - DESK.x0);
    const ty = DESK.y0 + Math.random() * (DESK.y1 - DESK.y0);
    const dur = FEEL.cardFlyMin + Math.random() * (FEEL.cardFlyMax - FEEL.cardFlyMin);
    gsap.to(card.scale, { x: 1, y: 1, duration: dur * 0.6, ease: 'back.out(2)' });
    gsap.to(card, {
      x: tx,
      rotation: (Math.random() - 0.5) * 0.18,
      duration: dur,
      ease: 'power2.out',
    });
    // arc up then settle with a small bounce (§A.7 落桌弹跳 1–2 次)
    gsap.to(card, {
      y: ty,
      duration: dur,
      ease: 'bounce.out',
    });
  }

  remove(card: InfoCard) {
    const i = this.cards.indexOf(card);
    if (i >= 0) this.cards.splice(i, 1);
    if (!card.destroyed) card.destroy();
  }

  /** nearest app icon that currently has a badge (for the auto-sweeper). */
  randomBadgedIcon(): AppIcon | null {
    const withBadge = this.ctx.phone.icons.filter((i) => i.count > 0);
    if (!withBadge.length) return null;
    return withBadge[Math.floor(Math.random() * withBadge.length)];
  }
}
