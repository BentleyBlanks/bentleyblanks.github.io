import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { gsap } from 'gsap';
import { COLORS, SLOT_COLOR } from '../config/theme';
import { SLOT_LABEL } from '../config/cards';
import type { SlotKind } from '../types';

const MW = 150;
const MH = 70;

// Plain-language hint of what belongs in each tray (helps new players sort).
const SLOT_HINT: Record<SlotKind, string> = {
  valid: '普通 · 高价值',
  invalid: '已读 · 垃圾',
  risk: '老板 · 银行 · 警告',
  quarantine: '中奖 · 钓鱼 · 诈骗',
};

// One sorting tray (§2 四区入口). Cards are dragged into these. Rendered as a
// brass-rimmed paper inbox with a colored label plate + a hint of its contents.
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

    this.glow.roundRect(-MW / 2 - 5, -MH / 2 - 5, MW + 10, MH + 10, 14).fill({ color, alpha: 0.0001 });

    // tray: paper bed inside a brass frame, with a dark slot opening at the back
    this.frame.roundRect(-MW / 2 + 4, -MH / 2 + 8, MW, MH, 12).fill({ color: 0x000000, alpha: 0.28 }); // shadow
    this.frame.roundRect(-MW / 2, -MH / 2, MW, MH, 12).fill({ color: COLORS.paper0 });
    this.frame.roundRect(-MW / 2, -MH / 2, MW, MH, 12).stroke({ color: COLORS.brass, width: 3 });
    this.frame.roundRect(-MW / 2 + 6, -MH / 2 + 5, MW - 12, 14, 6).fill({ color: 0x2c2114, alpha: 0.55 }); // back slot lip
    // colored label plate
    this.frame.roundRect(-MW / 2 + 10, MH / 2 - 30, MW - 20, 22, 7).fill({ color, alpha: 0.16 });
    this.frame.roundRect(-MW / 2 + 10, MH / 2 - 30, 6, 22, 3).fill({ color });

    const label = new Text({
      text: SLOT_LABEL[kind],
      style: new TextStyle({ fontFamily: 'PingFang SC, sans-serif', fontSize: 15, fontWeight: '800', fill: color }),
    });
    label.anchor.set(0, 0.5);
    label.position.set(-MW / 2 + 22, MH / 2 - 19);

    const hint = new Text({
      text: SLOT_HINT[kind],
      style: new TextStyle({ fontFamily: 'PingFang SC, sans-serif', fontSize: 10, fill: COLORS.muted }),
    });
    hint.anchor.set(0.5, 0);
    hint.position.set(0, -MH / 2 + 24);

    this.cntText = new Text({
      text: '',
      style: new TextStyle({ fontFamily: 'Segoe UI, sans-serif', fontSize: 11, fontWeight: '700', fill: COLORS.inkSoft }),
    });
    this.cntText.anchor.set(1, 0.5);
    this.cntText.position.set(MW / 2 - 14, MH / 2 - 19);

    this.addChild(this.glow, this.frame, label, hint, this.cntText);
  }

  highlight(on: boolean) {
    if (this.lit === on) return;
    this.lit = on;
    gsap.killTweensOf(this.glow);
    gsap.killTweensOf(this.scale);
    gsap.to(this.glow, { alpha: on ? 0.45 : 0.0001, duration: 0.12 });
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
    gsap.fromTo(this.glow, { alpha: 0.7 }, { alpha: 0.0001, duration: 0.4, ease: 'power2.out' });
    gsap.fromTo(this.frame, { y: correct ? 0 : -6 }, { y: 0, duration: 0.3, ease: correct ? 'power2.out' : 'elastic.out(1,0.35)' });
    if (!correct) {
      // brief red reject flash regardless of tray color
      this.frame.tint = COLORS.bad;
      gsap.to(this.frame, { duration: 0.3, onComplete: () => (this.frame.tint = 0xffffff) });
    }
  }
}
