import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { gsap } from 'gsap';
import { COLORS, SLOT_COLOR } from '../config/theme';
import { SLOT_LABEL } from '../config/cards';
import type { SlotKind } from '../types';

const MW = 116;
const MH = 64;

// One furnace mouth (§2 四区入口). Cards are dragged into these.
export class SlotMouth extends Container {
  readonly kind: SlotKind;
  private frame = new Graphics();
  private glow = new Graphics();
  private cntText: Text;
  private inside = 0;
  private lit = false;

  constructor(kind: SlotKind) {
    super();
    this.kind = kind;
    const color = SLOT_COLOR[kind];

    this.glow.roundRect(-MW / 2 - 4, -MH / 2 - 4, MW + 8, MH + 8, 14).fill({ color, alpha: 0.0001 });
    this.frame
      .roundRect(-MW / 2, -MH / 2, MW, MH, 12)
      .fill({ color: 0x0c1426, alpha: 0.85 })
      .stroke({ color, width: 2, alpha: 0.7 });
    // dark "throat" suggesting an opening
    this.frame.roundRect(-MW / 2 + 10, -MH / 2 + 8, MW - 20, MH - 16, 8).fill({ color: 0x05080f, alpha: 0.9 });

    const label = new Text({
      text: SLOT_LABEL[kind],
      style: new TextStyle({ fontFamily: 'PingFang SC, sans-serif', fontSize: 14, fontWeight: '800', fill: color }),
    });
    label.anchor.set(0.5);
    label.y = -2;

    this.cntText = new Text({
      text: '',
      style: new TextStyle({ fontFamily: 'Segoe UI, sans-serif', fontSize: 10, fill: COLORS.dim }),
    });
    this.cntText.anchor.set(0.5, 0);
    this.cntText.y = 12;

    this.addChild(this.glow, this.frame, label, this.cntText);
  }

  highlight(on: boolean) {
    if (this.lit === on) return;
    this.lit = on;
    gsap.killTweensOf(this.glow);
    gsap.killTweensOf(this.scale);
    gsap.to(this.glow, { alpha: on ? 0.5 : 0.0001, duration: 0.12 });
    gsap.to(this.scale, { x: on ? 1.06 : 1, y: on ? 1.06 : 1, duration: 0.14, ease: 'power2.out' });
  }

  /** local half-extent used for snap detection. */
  get halfW() {
    return MW / 2;
  }
  get halfH() {
    return MH / 2;
  }

  eat(correct: boolean) {
    this.inside++;
    this.cntText.text = `×${this.inside}`;
    gsap.fromTo(
      this.glow,
      { alpha: 0.7 },
      { alpha: 0.0001, duration: 0.4, ease: 'power2.out' },
    );
    gsap.fromTo(this.frame, { y: correct ? 0 : -6 }, { y: 0, duration: 0.3, ease: correct ? 'power2.out' : 'elastic.out(1,0.35)' });
    if (!correct) {
      // brief red reject flash regardless of mouth color
      this.frame.tint = COLORS.bad;
      gsap.to(this.frame, { duration: 0.3, onComplete: () => (this.frame.tint = 0xffffff) });
    }
  }
}
