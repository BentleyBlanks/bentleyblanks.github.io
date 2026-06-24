import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { gsap } from 'gsap';
import { COLORS } from '../config/theme';

export interface ChipConfig {
  emoji: string;
  name: string;
  accent: number;
  /** returns [costLabel, subLabel, affordable, maxed]. */
  read: () => { cost: string; sub: string; affordable: boolean; maxed: boolean };
  /** attempt purchase; return true on success. */
  buy: () => boolean;
}

const W = 152;
const H = 78;

// A buyable item rendered as a sticker/part (§2.5.1 按钮像贴纸). Used by both the
// shop drawer (producers) and the upgrade board (upgrades).
export class ItemChip extends Container {
  private bg = new Graphics();
  private subText: Text;
  private costText: Text;
  readonly w = W;
  readonly h = H;

  constructor(private cfg: ChipConfig) {
    super();
    const emoji = new Text({ text: cfg.emoji, style: new TextStyle({ fontFamily: 'Segoe UI Emoji', fontSize: 26 }) });
    emoji.anchor.set(0.5);
    emoji.position.set(24, 26);
    const name = new Text({
      text: cfg.name,
      style: new TextStyle({ fontFamily: 'PingFang SC, sans-serif', fontSize: 13, fontWeight: '800', fill: COLORS.ink }),
    });
    name.position.set(44, 12);
    this.subText = new Text({
      text: '',
      style: new TextStyle({ fontFamily: 'PingFang SC, sans-serif', fontSize: 9.5, fill: COLORS.dim, wordWrap: true, wordWrapWidth: W - 50, lineHeight: 12 }),
    });
    this.subText.position.set(44, 30);
    this.costText = new Text({
      text: '',
      style: new TextStyle({ fontFamily: 'Segoe UI, sans-serif', fontSize: 13, fontWeight: '800', fill: cfg.accent }),
    });
    this.costText.position.set(12, H - 24);

    this.addChild(this.bg, emoji, name, this.subText, this.costText);
    this.eventMode = 'static';
    this.cursor = 'pointer';
    this.hitArea = { contains: (x: number, y: number) => x >= 0 && x <= W && y >= 0 && y <= H } as any;
    this.on('pointertap', this.onTap);
    this.on('pointerover', () => gsap.to(this.scale, { x: 1.03, y: 1.03, duration: 0.1 }));
    this.on('pointerout', () => gsap.to(this.scale, { x: 1, y: 1, duration: 0.1 }));
    this.refresh();
  }

  private onTap = () => {
    const ok = this.cfg.buy();
    if (ok) {
      gsap.fromTo(this.scale, { x: 0.92, y: 0.92 }, { x: 1, y: 1, duration: 0.3, ease: 'back.out(3)' });
    } else {
      gsap.fromTo(this, { x: this.x - 4 }, { x: this.x, duration: 0.3, ease: 'elastic.out(1,0.35)' });
    }
    this.refresh();
  };

  refresh() {
    const r = this.cfg.read();
    this.subText.text = r.sub;
    this.costText.text = r.maxed ? '已满级' : `算力 ${r.cost}`;
    const accent = r.maxed ? COLORS.good : r.affordable ? this.cfg.accent : COLORS.dim;
    this.costText.style.fill = accent;
    this.bg.clear();
    this.bg
      .roundRect(0, 0, W, H, 12)
      .fill({ color: r.affordable || r.maxed ? COLORS.panel2 : 0x141d33 })
      .stroke({ color: accent, width: 1.5, alpha: r.affordable || r.maxed ? 0.8 : 0.4 });
    this.alpha = r.maxed ? 0.85 : r.affordable ? 1 : 0.7;
  }
}
