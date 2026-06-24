import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { gsap } from 'gsap';
import { COLORS, FEEL } from '../config/theme';

// Red-dot badge (§2.5.3): a clean glossy red pill, gentle idle bob, swells with
// count. Earlier версия drew a fat white highlight + a hard squash, which at
// badge size read as two overlapping blobs — fixed here with a slim crescent
// sheen, a thin dark rim for legibility on light tiles, and a softer bob.
export class BadgeBubble extends Container {
  private bg = new Graphics();
  private countLabel: Text;
  private idle?: gsap.core.Tween;

  constructor() {
    super();
    this.countLabel = new Text({
      text: '',
      style: new TextStyle({ fontFamily: 'Segoe UI, sans-serif', fontSize: 12, fontWeight: '800', fill: 0xffffff }),
    });
    this.countLabel.anchor.set(0.5);
    this.addChild(this.bg, this.countLabel);
    this.eventMode = 'static';
    this.cursor = 'pointer';
    this.visible = false;
  }

  setCount(n: number) {
    if (n <= 0) {
      this.stopIdle();
      this.visible = false;
      return;
    }
    if (!this.visible) {
      this.visible = true;
      this.startIdle();
    }
    // swell with count (§2.5.3 数值越大气泡越膨胀).
    const r = 10 + Math.min(7, Math.log2(n + 1) * 1.5);
    this.bg.clear();
    // soft outer glow
    this.bg.circle(0, 0, r + 3).fill({ color: COLORS.bad, alpha: 0.18 });
    // dark rim so the dot reads on light app tiles, then the red body
    this.bg.circle(0, 0, r + 1).fill({ color: 0x5a160f });
    this.bg.circle(0, 0, r).fill({ color: COLORS.bad });
    // slim crescent sheen across the top — not a second disc
    this.bg.ellipse(0, -r * 0.38, r * 0.62, r * 0.26).fill({ color: 0xffffff, alpha: 0.32 });
    this.countLabel.text = n > 99 ? '99+' : String(n);
    this.hitArea = { contains: (x: number, y: number) => x * x + y * y <= (r + 4) * (r + 4) } as any;
  }

  private startIdle() {
    this.stopIdle();
    const period = FEEL.badgeBounceMin + Math.random() * (FEEL.badgeBounceMax - FEEL.badgeBounceMin);
    // gentle vertical bob instead of a stretchy squash
    this.idle = gsap.to(this, {
      y: this.y - 1.5,
      duration: period / 2,
      ease: 'sine.inOut',
      yoyo: true,
      repeat: -1,
    });
  }

  private stopIdle() {
    this.idle?.kill();
    this.idle = undefined;
    this.scale.set(1);
  }

  /** pop feedback when a unit is added. */
  pulse() {
    gsap.fromTo(this.scale, { x: 1.32, y: 1.32 }, { x: 1, y: 1, duration: 0.32, ease: 'back.out(2.6)' });
  }

  destroy(options?: Parameters<Container['destroy']>[0]) {
    this.stopIdle();
    super.destroy(options);
  }
}
