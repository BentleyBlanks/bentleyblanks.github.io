import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { gsap } from 'gsap';
import { COLORS } from '../config/theme';
import { SlotMouth } from './SlotMouth';
import type { SlotKind } from '../types';

// The 信息分拣台 (formerly “炼化炉”). NOT a chat box and NOT a furnace — it's a
// physical sorting cabinet: drop a note into the right tray and it's tidied into
// 算力, then pushed out the brass 转交口 to the 宿主 (see Host). The class name is
// kept as AIFurnace to avoid churning every import; the *fiction* is a sorter.
export class AIFurnace extends Container {
  readonly mouths: SlotMouth[] = [];
  readonly bodyW = 210;
  readonly bodyH = 430;
  private body = new Graphics();
  private core = new Graphics();
  private progress = new Graphics();
  private coreGlow = 0;
  private pipeT = 0;

  constructor() {
    super();
    const w = this.bodyW;
    const h = this.bodyH;
    // walnut cabinet with a brass face plate
    this.body.roundRect(-w / 2 + 6, -h / 2 + 12, w, h, 22).fill({ color: 0x000000, alpha: 0.3 }); // shadow
    this.body.roundRect(-w / 2, -h / 2, w, h, 22).fill({ color: COLORS.wood1 });
    this.body.roundRect(-w / 2, -h / 2, w, h * 0.4, 22).fill({ color: COLORS.woodGrain, alpha: 0.35 });
    this.body.roundRect(-w / 2 + 8, -h / 2 + 8, w - 16, h - 16, 18).stroke({ color: COLORS.brass, width: 2.5 });
    this.body.roundRect(-w / 2 + 8, -h / 2 + 8, w - 16, h - 16, 18).stroke({ color: COLORS.brassDark, width: 1, alpha: 0.6 });

    // brass nameplate
    const plate = new Graphics();
    plate.roundRect(-70, -h / 2 + 14, 140, 30, 8).fill({ color: COLORS.brass });
    plate.roundRect(-70, -h / 2 + 14, 140, 30, 8).stroke({ color: COLORS.brassDark, width: 1.5 });
    const title = new Text({
      text: '信息分拣台',
      style: new TextStyle({ fontFamily: 'PingFang SC, sans-serif', fontSize: 14, fontWeight: '800', fill: 0x3a2a12, letterSpacing: 1 }),
    });
    title.anchor.set(0.5);
    title.y = -h / 2 + 29;
    const sub = new Text({
      text: '分对 → 转交宿主',
      style: new TextStyle({ fontFamily: 'PingFang SC, sans-serif', fontSize: 11, fill: COLORS.brassHi, letterSpacing: 1 }),
    });
    sub.anchor.set(0.5);
    sub.y = -h / 2 + 52;

    this.addChild(this.body, plate, title, sub, this.core, this.progress);

    // 转交口 label near the out-chute
    const outLabel = new Text({
      text: '转交口',
      style: new TextStyle({ fontFamily: 'PingFang SC, sans-serif', fontSize: 10, fill: COLORS.brassHi, letterSpacing: 2 }),
    });
    outLabel.anchor.set(0.5);
    outLabel.y = this.bodyH / 2 - 52;
    this.addChild(outLabel);

    // four trays down the left edge (facing the desk where cards land)
    const kinds: SlotKind[] = ['valid', 'invalid', 'risk', 'quarantine'];
    const top = -h / 2 + 96;
    const gap = (h - 200) / 3;
    kinds.forEach((k, i) => {
      const m = new SlotMouth(k);
      m.position.set(-w / 2 - 78, top + gap * i);
      this.addChild(m);
      this.mouths.push(m);
    });

    this.drawCore();
  }

  private drawCore() {
    this.core.clear();
    const cy = this.bodyH / 2 - 84;
    const a = 0.45 + this.coreGlow * 0.55;
    // brass out-chute ring with an amber glow that flares when it pushes a parcel
    this.core.circle(0, cy, 34).fill({ color: COLORS.amber, alpha: 0.12 + this.coreGlow * 0.3 });
    this.core.circle(0, cy, 24).fill({ color: COLORS.brassDark });
    this.core.circle(0, cy, 24).stroke({ color: COLORS.brass, width: 3 });
    this.core.circle(0, cy, 14).fill({ color: COLORS.amber, alpha: a });
    this.core.circle(0, cy, 7).fill({ color: COLORS.amberHi, alpha: 0.6 + this.coreGlow * 0.4 });
  }

  mouthByKind(kind: SlotKind): SlotMouth {
    return this.mouths.find((m) => m.kind === kind)!;
  }

  /** world position of the out-chute, source of the compute chips. */
  coreWorldPos(): { x: number; y: number } {
    return this.toGlobal({ x: 0, y: this.bodyH / 2 - 84 } as any);
  }

  /** chew animation when a card is consumed (§2.5.5 吞卡抖动). */
  chomp() {
    gsap.fromTo(this.scale, { x: 1.03, y: 0.97 }, { x: 1, y: 1, duration: 0.35, ease: 'elastic.out(1,0.4)' });
    gsap.fromTo(this, { coreGlow: 1 } as any, {
      coreGlow: 0,
      duration: 0.6,
      ease: 'power2.out',
      onUpdate: () => this.drawCore(),
    });
  }

  /** digestion progress ring at the out-chute (0..1), 0 hides it. */
  showProgress(ratio: number) {
    this.progress.clear();
    if (ratio <= 0) return;
    const cy = this.bodyH / 2 - 84;
    this.progress.arc(0, cy, 40, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ratio).stroke({ color: COLORS.good, width: 4, cap: 'round' });
  }

  /** subtle idle pulse, called each frame. */
  tickIdle(dt: number) {
    this.pipeT += dt;
  }
}
