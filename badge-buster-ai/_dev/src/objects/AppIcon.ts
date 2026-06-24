import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { gsap } from 'gsap';
import { BadgeBubble } from './BadgeBubble';
import type { AppDef } from '../config/cards';

// Per-app tile tints so the phone reads like a real home screen, not a grid of
// identical gray squares.
const APP_TINT: Record<string, number> = {
  chat: 0x3aa66a,
  mail: 0x3d7ea6,
  shop: 0xe09a3a,
  cal: 0xd1574f,
  sys: 0x6b7382,
  news: 0xb06a3a,
  bank: 0x4f6dbf,
  food: 0xe0823a,
};

// App icon stuck to the phone screen (§2.5.3 小徽章). Owns its red badge.
export class AppIcon extends Container {
  readonly def: AppDef;
  readonly badge = new BadgeBubble();
  private tile = new Graphics();
  private pending = 0; // unprocessed badge units

  constructor(def: AppDef, size = 56) {
    super();
    this.def = def;
    const r = 15;
    const tint = APP_TINT[def.id] ?? 0x6b7382;
    const dark = mix(tint, 0x000000, 0.32);
    // glossy rounded app tile with a top-light gradient feel
    this.tile.roundRect(-size / 2, -size / 2 + 2, size, size, r).fill({ color: 0x000000, alpha: 0.3 }); // drop shadow
    this.tile.roundRect(-size / 2, -size / 2, size, size, r).fill({ color: dark });
    this.tile.roundRect(-size / 2, -size / 2, size, size * 0.5, r).fill({ color: tint, alpha: 0.95 });
    this.tile.roundRect(-size / 2, -size / 2 + size * 0.45, size, size * 0.55, r).fill({ color: dark, alpha: 0.55 });
    this.tile.roundRect(-size / 2 + 1, -size / 2 + 1, size - 2, size - 2, r - 1).stroke({ color: 0xffffff, width: 1, alpha: 0.18 });

    const emoji = new Text({
      text: def.emoji,
      style: new TextStyle({ fontFamily: 'Segoe UI Emoji', fontSize: 28 }),
    });
    emoji.anchor.set(0.5);
    emoji.y = -2;
    const name = new Text({
      text: def.name,
      style: new TextStyle({ fontFamily: 'PingFang SC, sans-serif', fontSize: 11, fontWeight: '600', fill: 0xcdd6e0 }),
    });
    name.anchor.set(0.5);
    name.y = size / 2 + 11;
    this.addChild(this.tile, emoji, name, this.badge);
    this.badge.position.set(size / 2 - 6, -size / 2 + 6);

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

// blend two packed RGB colors, t=0 → a, t=1 → b.
function mix(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff;
  const br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bl;
}
