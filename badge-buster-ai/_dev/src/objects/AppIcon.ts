import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { gsap } from 'gsap';
import { COLORS } from '../config/theme';
import { BadgeBubble } from './BadgeBubble';
import type { AppDef } from '../config/cards';

// App icon stuck to the phone screen (§2.5.3 小徽章). Owns its red badge.
export class AppIcon extends Container {
  readonly def: AppDef;
  readonly badge = new BadgeBubble();
  private tile = new Graphics();
  private pending = 0; // unprocessed badge units

  constructor(def: AppDef, size = 58) {
    super();
    this.def = def;
    const r = 14;
    this.tile
      .roundRect(-size / 2, -size / 2, size, size, r)
      .fill({ color: COLORS.panel2 })
      .stroke({ color: COLORS.line, width: 1.5 });
    const emoji = new Text({
      text: def.emoji,
      style: new TextStyle({ fontFamily: 'Segoe UI Emoji', fontSize: 30 }),
    });
    emoji.anchor.set(0.5);
    emoji.y = -4;
    const name = new Text({
      text: def.name,
      style: new TextStyle({ fontFamily: 'PingFang SC, sans-serif', fontSize: 11, fill: COLORS.muted }),
    });
    name.anchor.set(0.5);
    name.y = size / 2 - 8;
    this.addChild(this.tile, emoji, name, this.badge);
    this.badge.position.set(size / 2 - 8, -size / 2 + 8);

    // whole icon is the click target for bursting its badge (§A.6.3)
    this.eventMode = 'static';
    this.cursor = 'pointer';
    const half = size / 2 + 6;
    this.hitArea = { contains: (x: number, y: number) => Math.abs(x) <= half && Math.abs(y) <= half } as any;
  }

  get count() {
    return this.pending;
  }

  addBadge(n = 1) {
    this.pending += n;
    this.badge.setCount(this.pending);
    this.badge.pulse();
    // subtle icon shake when a notification lands (§2.5.5 App 图标抖动).
    gsap.fromTo(this.tile, { x: -2 }, { x: 0, duration: 0.25, ease: 'elastic.out(1,0.4)' });
  }

  /** consume up to `n` units, return how many were actually popped. */
  popBadge(n = 1): number {
    const taken = Math.min(this.pending, n);
    this.pending -= taken;
    this.badge.setCount(this.pending);
    return taken;
  }
}
