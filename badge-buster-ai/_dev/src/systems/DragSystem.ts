import { gsap } from 'gsap';
import type { Container, FederatedPointerEvent } from 'pixi.js';
import { FEEL } from '../config/theme';
import { InfoCard } from '../objects/InfoCard';
import type { SlotMouth } from '../objects/SlotMouth';
import type { GameContext } from '../game/context';

// Pointer dragging + snap-to-mouth (§2.5.5 拖拽倾斜/阴影/吸附, §A.7 吸附距离).
export class DragSystem {
  private active: InfoCard | null = null;
  private grabDX = 0;
  private grabDY = 0;
  private moved = 0;
  private hovered: SlotMouth | null = null;

  constructor(private ctx: GameContext) {}

  attach() {
    const stage = this.ctx.app.stage;
    stage.eventMode = 'static';
    stage.hitArea = this.ctx.app.screen;
    const cardLayer = this.ctx.layers.card;
    cardLayer.eventMode = 'static';
    cardLayer.on('pointerdown', this.onDown);
    stage.on('pointermove', this.onMove);
    stage.on('pointerup', this.onUp);
    stage.on('pointerupoutside', this.onUp);
  }

  private findCard(target: Container | null): InfoCard | null {
    let n: Container | null = target;
    while (n) {
      if (n instanceof InfoCard) return n;
      n = n.parent;
    }
    return null;
  }

  private onDown = (e: FederatedPointerEvent) => {
    const card = this.findCard(e.target as Container);
    if (!card || card.busy) return;
    this.active = card;
    this.moved = 0;
    const lp = this.ctx.layers.card.toLocal(e.global);
    this.grabDX = card.x - lp.x;
    this.grabDY = card.y - lp.y;
    card.cursor = 'grabbing';
    // lift: tilt + scale + raise to top of layer (§2.5.5)
    gsap.killTweensOf(card.scale);
    gsap.to(card.scale, { x: FEEL.dragLiftScale, y: FEEL.dragLiftScale, duration: 0.12, ease: 'power2.out' });
    gsap.to(card, { rotation: -0.05, duration: 0.12 });
    card.lift(true);
    this.ctx.layers.card.setChildIndex(card, this.ctx.layers.card.children.length - 1);
  };

  private onMove = (e: FederatedPointerEvent) => {
    if (!this.active) return;
    const lp = this.ctx.layers.card.toLocal(e.global);
    const nx = lp.x + this.grabDX;
    const ny = lp.y + this.grabDY;
    this.moved += Math.hypot(nx - this.active.x, ny - this.active.y);
    this.active.x = nx;
    this.active.y = ny;
    this.updateHover();
  };

  private nearestMouth(): { mouth: SlotMouth; dist: number } | null {
    if (!this.active) return null;
    const cardWorld = this.ctx.world.toLocal(this.active.getGlobalPosition());
    let best: { mouth: SlotMouth; dist: number } | null = null;
    for (const m of this.ctx.furnace.mouths) {
      const mw = this.ctx.world.toLocal(m.getGlobalPosition());
      const dx = Math.max(0, Math.abs(cardWorld.x - mw.x) - m.halfW);
      const dy = Math.max(0, Math.abs(cardWorld.y - mw.y) - m.halfH);
      const d = Math.hypot(dx, dy);
      if (!best || d < best.dist) best = { mouth: m, dist: d };
    }
    return best;
  }

  private updateHover() {
    const near = this.nearestMouth();
    const target = near && near.dist <= FEEL.snapDist ? near.mouth : null;
    if (target === this.hovered) return;
    this.hovered?.highlight(false);
    this.hovered = target;
    this.hovered?.highlight(true);
  }

  private onUp = () => {
    const card = this.active;
    if (!card) return;
    this.active = null;
    card.cursor = 'grab';
    card.lift(false);
    gsap.to(card, { rotation: (Math.random() - 0.5) * 0.16, duration: 0.2 });

    const drop = this.hovered;
    this.hovered?.highlight(false);
    this.hovered = null;

    if (drop) {
      gsap.killTweensOf(card.scale);
      this.ctx.digest.accept(card, drop);
      return;
    }
    // a near-tap with no drop = 偷看 (§6.4 预读偷看)
    if (this.moved < 8) {
      card.peek();
    }
    gsap.to(card.scale, { x: 1, y: 1, duration: 0.18, ease: 'back.out(2)' });
  };
}
