import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { gsap } from 'gsap';
import { COLORS } from '../config/theme';
import { SlotMouth } from './SlotMouth';
import type { SlotKind } from '../types';

// The AI 信息炼化炉 (§2.5.3). NOT a chat box — a glowing machine with four
// mouths that eats cards and spits out compute chips.
export class AIFurnace extends Container {
  readonly mouths: SlotMouth[] = [];
  readonly bodyW = 196;
  readonly bodyH = 470;
  private body = new Graphics();
  private core = new Graphics();
  private progress = new Graphics();
  private coreGlow = 0;
  private pipeT = 0;

  constructor() {
    super();
    const w = this.bodyW;
    const h = this.bodyH;
    this.body
      .roundRect(-w / 2, -h / 2, w, h, 26)
      .fill({ color: 0x121c33 })
      .stroke({ color: COLORS.line, width: 2 });
    this.body.roundRect(-w / 2 + 8, -h / 2 + 8, w - 16, h - 16, 20).stroke({ color: 0x2a3c63, width: 1 });

    const title = new Text({
      text: 'AI 信息炼化炉',
      style: new TextStyle({ fontFamily: 'PingFang SC, sans-serif', fontSize: 13, fontWeight: '800', fill: COLORS.acc, letterSpacing: 1 }),
    });
    title.anchor.set(0.5);
    title.y = -h / 2 + 22;

    this.addChild(this.body, title, this.core, this.progress);

    // four mouths down the left edge (facing the desk where cards land)
    const kinds: SlotKind[] = ['valid', 'invalid', 'risk', 'quarantine'];
    const top = -h / 2 + 70;
    const gap = (h - 150) / 3;
    kinds.forEach((k, i) => {
      const m = new SlotMouth(k);
      m.position.set(-w / 2 - 60, top + gap * i);
      this.addChild(m);
      this.mouths.push(m);
    });

    this.drawCore();
  }

  private drawCore() {
    this.core.clear();
    const cy = this.bodyH / 2 - 90;
    const a = 0.4 + this.coreGlow * 0.6;
    this.core.circle(0, cy, 34).fill({ color: COLORS.acc2, alpha: 0.15 + this.coreGlow * 0.25 });
    this.core.circle(0, cy, 22).fill({ color: COLORS.acc, alpha: a });
    this.core.circle(0, cy, 12).fill({ color: 0xffffff, alpha: 0.5 + this.coreGlow * 0.5 });
  }

  mouthByKind(kind: SlotKind): SlotMouth {
    return this.mouths.find((m) => m.kind === kind)!;
  }

  /** world position of the core, source of the compute chips. */
  coreWorldPos(): { x: number; y: number } {
    return this.toGlobal({ x: 0, y: this.bodyH / 2 - 90 } as any);
  }

  /** chew animation when a card is consumed (§2.5.5 炼化炉吞卡抖动). */
  chomp() {
    gsap.fromTo(this.body, { x: 0 }, { x: 0, duration: 0.1 });
    gsap.fromTo(this.scale, { x: 1.03, y: 0.97 }, { x: 1, y: 1, duration: 0.35, ease: 'elastic.out(1,0.4)' });
    gsap.fromTo(this, { coreGlow: 1 } as any, {
      coreGlow: 0,
      duration: 0.6,
      ease: 'power2.out',
      onUpdate: () => this.drawCore(),
    });
  }

  /** digestion progress ring at the core (0..1), 0 hides it. */
  showProgress(ratio: number) {
    this.progress.clear();
    if (ratio <= 0) return;
    const cy = this.bodyH / 2 - 90;
    this.progress.arc(0, cy, 40, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ratio).stroke({ color: COLORS.good, width: 4, cap: 'round' });
  }

  /** subtle idle pipe pulse, called each frame. */
  tickIdle(dt: number) {
    this.pipeT += dt;
  }
}
