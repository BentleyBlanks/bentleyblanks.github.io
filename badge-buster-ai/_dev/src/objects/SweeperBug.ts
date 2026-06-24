import { Container, Text, TextStyle } from 'pixi.js';
import { gsap } from 'gsap';

export interface CrawlBounds {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

// A visible 收到清扫虫: a little bug that crawls around the phone screen and
// physically poke-pops red dots. Gives the auto-sweeper a body so the player
// can see WHO is auto-clearing the badges (answering "卡片怎么自己蹦出来了").
export class SweeperBug extends Container {
  busy = false;
  private bodyT: Text;
  private idleTween?: gsap.core.Tween;
  private idleDelay?: gsap.core.Tween;

  constructor(private bounds: CrawlBounds) {
    super();
    this.bodyT = new Text({ text: '🐛', style: new TextStyle({ fontFamily: 'Segoe UI Emoji', fontSize: 19 }) });
    this.bodyT.anchor.set(0.5);
    this.addChild(this.bodyT);
    // perpetual little wiggle so it always looks alive
    gsap.to(this.bodyT, { rotation: 0.22, duration: 0.22, ease: 'sine.inOut', yoyo: true, repeat: -1 });
    this.position.set(this.rand(bounds.x0, bounds.x1), this.rand(bounds.y0, bounds.y1));
    this.scheduleIdle();
  }

  private rand(a: number, b: number) {
    return a + Math.random() * (b - a);
  }

  private faceTowards(x: number) {
    this.bodyT.scale.x = x < this.x ? -1 : 1;
  }

  private dist(x: number, y: number) {
    return Math.hypot(x - this.x, y - this.y);
  }

  /** wander to a random spot, then pause and wander again. */
  private scheduleIdle() {
    if (this.busy) return;
    const tx = this.rand(this.bounds.x0, this.bounds.x1);
    const ty = this.rand(this.bounds.y0, this.bounds.y1);
    this.faceTowards(tx);
    this.idleTween = gsap.to(this, {
      x: tx,
      y: ty,
      duration: Math.max(0.9, this.dist(tx, ty) / 60),
      ease: 'sine.inOut',
      onComplete: () => {
        this.idleDelay = gsap.delayedCall(0.4 + Math.random() * 1.4, () => this.scheduleIdle());
      },
    });
  }

  /** interrupt idle and crawl quickly to a target, poke, then resume wandering. */
  sweep(tx: number, ty: number, onArrive: () => void) {
    this.busy = true;
    this.idleTween?.kill();
    this.idleDelay?.kill();
    gsap.killTweensOf(this);
    this.faceTowards(tx);
    gsap.to(this, {
      x: tx,
      y: ty,
      duration: Math.max(0.22, this.dist(tx, ty) / 240),
      ease: 'power2.in',
      onComplete: () => {
        this.poke();
        onArrive();
        this.busy = false;
        this.scheduleIdle();
      },
    });
  }

  private poke() {
    gsap.fromTo(this.bodyT.scale, { x: this.bodyT.scale.x * 1.4, y: 1.4 }, { x: this.bodyT.scale.x < 0 ? -1 : 1, y: 1, duration: 0.3, ease: 'back.out(3)' });
  }

  destroy(options?: Parameters<Container['destroy']>[0]) {
    this.idleTween?.kill();
    this.idleDelay?.kill();
    gsap.killTweensOf(this);
    gsap.killTweensOf(this.bodyT);
    gsap.killTweensOf(this.bodyT.scale);
    super.destroy(options);
  }
}
