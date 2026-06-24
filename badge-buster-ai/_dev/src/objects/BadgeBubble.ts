import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { gsap } from 'gsap';
import { COLORS, FEEL } from '../config/theme';

// Red-dot badge (§2.5.3): red jelly bubble, idle bounce, swells with count.
export class BadgeBubble extends Container {
  private bg = new Graphics();
  private countLabel: Text;
  private idle?: gsap.core.Tween;

  constructor() {
    super();
    this.countLabel = new Text({
      text: '',
      style: new TextStyle({ fontFamily: 'Segoe UI, sans-serif', fontSize: 13, fontWeight: '800', fill: 0xffffff }),
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
    const r = 11 + Math.min(8, Math.log2(n + 1) * 1.6);
    this.bg.clear();
    this.bg.circle(0, 0, r + 2).fill({ color: COLORS.bad, alpha: 0.22 });
    this.bg.circle(0, 0, r).fill({ color: COLORS.bad });
    this.bg.circle(-r * 0.32, -r * 0.32, r * 0.32).fill({ color: 0xffffff, alpha: 0.4 });
    this.countLabel.text = n > 99 ? '99+' : String(n);
    this.hitArea = { contains: (x: number, y: number) => x * x + y * y <= (r + 4) * (r + 4) } as any;
  }

  private startIdle() {
    this.stopIdle();
    const period = FEEL.badgeBounceMin + Math.random() * (FEEL.badgeBounceMax - FEEL.badgeBounceMin);
    this.idle = gsap.to(this.scale, {
      x: 1.14,
      y: 0.9,
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
    gsap.fromTo(this.scale, { x: 1.4, y: 1.4 }, { x: 1, y: 1, duration: 0.3, ease: 'back.out(3)' });
  }

  destroy(options?: Parameters<Container['destroy']>[0]) {
    this.stopIdle();
    super.destroy(options);
  }
}
