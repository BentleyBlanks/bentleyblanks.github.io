import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { gsap } from 'gsap';
import { COLORS } from '../config/theme';
import { TIERS } from '../config/cards';
import type { CardModel } from '../types';

const CARD_W = 158;
const CARD_H = 96;

// Info card = a paper scrap on the desk (§2.5.3 信息卡是纸片/便签). NOT a list row.
export class InfoCard extends Container {
  readonly model: CardModel;
  readonly w = CARD_W;
  readonly h = CARD_H;
  glitched = false;
  peeked = false;
  busy = false; // locked while digesting / animating into furnace

  private body = new Graphics();
  private shadow = new Graphics();
  private tierText: Text;
  private bodyText: Text;
  private glitchText: Text;
  private haluText: Text;
  private appEmoji: Text;
  private qmark: Container;
  private haluPct = 0;
  private glitchTween?: gsap.core.Tween;

  constructor(model: CardModel) {
    super();
    this.model = model;
    const def = TIERS[model.tier];

    this.shadow.roundRect(-CARD_W / 2 + 4, -CARD_H / 2 + 8, CARD_W, CARD_H, 12).fill({ color: 0x000000, alpha: 0.35 });

    this.appEmoji = new Text({ text: model.appEmoji, style: new TextStyle({ fontFamily: 'Segoe UI Emoji', fontSize: 15 }) });
    this.appEmoji.anchor.set(1, 0);
    this.appEmoji.position.set(CARD_W / 2 - 12, -CARD_H / 2 + 9);

    this.tierText = new Text({
      text: def.label,
      style: new TextStyle({ fontFamily: 'PingFang SC, sans-serif', fontSize: 11, fontWeight: '800', fill: def.color, letterSpacing: 1 }),
    });
    this.tierText.position.set(-CARD_W / 2 + 16, -CARD_H / 2 + 10);

    const bodyStyle = new TextStyle({
      fontFamily: 'PingFang SC, sans-serif',
      fontSize: 13,
      fill: 0xdfe7fb,
      wordWrap: true,
      wordWrapWidth: CARD_W - 28,
      lineHeight: 17,
    });
    this.bodyText = new Text({ text: model.text, style: bodyStyle });
    this.bodyText.position.set(-CARD_W / 2 + 14, -CARD_H / 2 + 30);
    // duplicated layer used only for the chromatic-glitch look (§6.5 故障闪烁).
    const glitchStyle = new TextStyle({
      fontFamily: 'PingFang SC, sans-serif',
      fontSize: 13,
      fill: 0xff3b3b,
      wordWrap: true,
      wordWrapWidth: CARD_W - 28,
      lineHeight: 17,
    });
    this.glitchText = new Text({ text: model.glitchText, style: glitchStyle });
    this.glitchText.position.copyFrom(this.bodyText.position);
    this.glitchText.visible = false;

    this.haluText = new Text({
      text: '',
      style: new TextStyle({ fontFamily: 'Segoe UI, sans-serif', fontSize: 10, fontWeight: '700', fill: COLORS.warn }),
    });
    this.haluText.anchor.set(0, 1);
    this.haluText.position.set(-CARD_W / 2 + 14, CARD_H / 2 - 8);

    this.qmark = this.buildQmark();
    this.qmark.position.set(CARD_W / 2 - 6, -CARD_H / 2 + 4);
    this.qmark.visible = false;

    this.addChild(this.shadow, this.body, this.tierText, this.appEmoji, this.bodyText, this.glitchText, this.haluText, this.qmark);
    this.redraw();

    this.eventMode = 'static';
    this.cursor = 'grab';
    this.hitArea = { contains: (x: number, y: number) => Math.abs(x) <= CARD_W / 2 && Math.abs(y) <= CARD_H / 2 } as any;
  }

  private buildQmark(): Container {
    const c = new Container();
    const g = new Graphics();
    g.circle(0, 0, 10).fill({ color: COLORS.bad }).stroke({ color: 0x05080f, width: 2 });
    const t = new Text({ text: '?', style: new TextStyle({ fontFamily: 'Segoe UI', fontSize: 13, fontWeight: '900', fill: 0xffffff }) });
    t.anchor.set(0.5);
    c.addChild(g, t);
    return c;
  }

  private redraw() {
    const def = TIERS[this.model.tier];
    this.body.clear();
    this.body
      .roundRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 12)
      .fill({ color: 0x1b2742 })
      .stroke({ color: this.glitched ? COLORS.bad : COLORS.line, width: this.glitched ? 1.5 : 1 });
    // tier color spine on the left edge
    this.body.roundRect(-CARD_W / 2, -CARD_H / 2, 5, CARD_H, 12).fill({ color: def.color });
  }

  setHalluPct(pct: number) {
    this.haluPct = pct;
    this.haluText.text = `幻觉 ${Math.round(pct)}%`;
    // brighter warning color as the risk climbs
    this.haluText.style.fill = pct >= 45 ? COLORS.bad : pct >= 20 ? COLORS.warn : COLORS.dim;
  }

  get displayedHalluPct() {
    return this.haluPct;
  }

  /** turn into a 故障卡 (§6.5): show hallucinated text + chromatic shake. */
  setGlitched(on: boolean) {
    if (this.glitched === on) return;
    this.glitched = on;
    this.redraw();
    this.qmark.visible = on;
    this.glitchText.visible = on;
    if (on) {
      this.bodyText.style.fill = 0x00e6e6;
      this.glitchText.x = this.bodyText.x - 2;
      this.glitchTween = gsap.to(this.glitchText, {
        x: this.bodyText.x + 2,
        duration: 0.05,
        ease: 'steps(2)',
        yoyo: true,
        repeat: -1,
      });
    } else {
      this.glitchTween?.kill();
      this.bodyText.style.fill = 0xdfe7fb;
      this.glitchText.x = this.bodyText.x;
    }
  }

  /** peek the card corner to reveal whether it is contaminated (§6.4 偷看). */
  peek() {
    if (this.peeked) return;
    this.peeked = true;
    gsap.fromTo(this, { rotation: -0.04 }, { rotation: 0, duration: 0.4, ease: 'elastic.out(1,0.4)' });
    this.qmark.visible = this.glitched;
  }

  lift(on: boolean) {
    gsap.to(this.shadow, { alpha: on ? 0.55 : 0.35, x: on ? 6 : 0, y: on ? 12 : 0, duration: 0.12 });
  }

  destroy(options?: Parameters<Container['destroy']>[0]) {
    this.glitchTween?.kill();
    gsap.killTweensOf(this);
    gsap.killTweensOf(this.scale);
    super.destroy(options);
  }
}
