import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { gsap } from 'gsap';
import { COLORS } from '../config/theme';
import { TIERS } from '../config/cards';
import type { CardModel } from '../types';

const CARD_W = 178;
const CARD_H = 114;

// Info card = a cream paper note on the desk (§2.5.3 信息卡是纸片/便签). NOT a list
// row. A colored tier tab clipped to the top, ink body text, a dog-eared corner.
export class InfoCard extends Container {
  readonly model: CardModel;
  readonly w = CARD_W;
  readonly h = CARD_H;
  glitched = false;
  peeked = false;
  busy = false; // locked while digesting / animating into furnace
  landed = false; // false until the spawn flight finishes (auto-agents wait for this)
  spawnTl: gsap.core.Timeline | null = null; // spawn-flight timeline; killed on interaction

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

    this.shadow.roundRect(-CARD_W / 2 + 4, -CARD_H / 2 + 9, CARD_W, CARD_H, 10).fill({ color: 0x000000, alpha: 0.32 });

    this.appEmoji = new Text({ text: model.appEmoji, style: new TextStyle({ fontFamily: 'Segoe UI Emoji', fontSize: 16 }) });
    this.appEmoji.anchor.set(1, 0.5);
    this.appEmoji.position.set(CARD_W / 2 - 12, -CARD_H / 2 + 15);

    this.tierText = new Text({
      text: def.label,
      style: new TextStyle({ fontFamily: 'PingFang SC, sans-serif', fontSize: 12, fontWeight: '800', fill: 0xffffff, letterSpacing: 1 }),
    });
    this.tierText.anchor.set(0, 0.5);
    this.tierText.position.set(-CARD_W / 2 + 14, -CARD_H / 2 + 15);

    const bodyStyle = new TextStyle({
      fontFamily: 'PingFang SC, sans-serif',
      fontSize: 15,
      fill: COLORS.ink,
      wordWrap: true,
      wordWrapWidth: CARD_W - 28,
      lineHeight: 20,
    });
    this.bodyText = new Text({ text: model.text, style: bodyStyle });
    this.bodyText.position.set(-CARD_W / 2 + 14, -CARD_H / 2 + 36);
    // duplicated layer used only for the chromatic-glitch look (§6.5 故障闪烁).
    const glitchStyle = new TextStyle({
      fontFamily: 'PingFang SC, sans-serif',
      fontSize: 15,
      fill: 0xd14b42,
      wordWrap: true,
      wordWrapWidth: CARD_W - 28,
      lineHeight: 20,
    });
    this.glitchText = new Text({ text: model.glitchText, style: glitchStyle });
    this.glitchText.position.copyFrom(this.bodyText.position);
    this.glitchText.visible = false;

    this.haluText = new Text({
      text: '',
      style: new TextStyle({ fontFamily: 'Segoe UI, sans-serif', fontSize: 11, fontWeight: '700', fill: COLORS.warn }),
    });
    this.haluText.anchor.set(0, 1);
    this.haluText.position.set(-CARD_W / 2 + 14, CARD_H / 2 - 8);

    this.qmark = this.buildQmark();
    this.qmark.position.set(CARD_W / 2 - 8, -CARD_H / 2 + 2);
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
    g.circle(0, 0, 10).fill({ color: COLORS.bad }).stroke({ color: 0xfff3da, width: 2 });
    const t = new Text({ text: '?', style: new TextStyle({ fontFamily: 'Segoe UI', fontSize: 13, fontWeight: '900', fill: 0xffffff }) });
    t.anchor.set(0.5);
    c.addChild(g, t);
    return c;
  }

  private redraw() {
    const def = TIERS[this.model.tier];
    const tabH = 26;
    this.body.clear();
    // paper body (slightly darker lower half = subtle paper curl)
    this.body.roundRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 10).fill({ color: COLORS.paper0 });
    this.body.roundRect(-CARD_W / 2, 0, CARD_W, CARD_H / 2, 10).fill({ color: COLORS.paper1, alpha: 0.45 });
    // ruled line under the header
    this.body.moveTo(-CARD_W / 2 + 12, -CARD_H / 2 + tabH + 4).lineTo(CARD_W / 2 - 12, -CARD_H / 2 + tabH + 4)
      .stroke({ color: COLORS.paperLine, width: 1 });
    // colored tier tab across the top
    this.body.roundRect(-CARD_W / 2, -CARD_H / 2, CARD_W, tabH, 10).fill({ color: def.color });
    this.body.rect(-CARD_W / 2, -CARD_H / 2 + tabH - 8, CARD_W, 8).fill({ color: def.color });
    // outline — reddens when glitched
    this.body.roundRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 10)
      .stroke({ color: this.glitched ? COLORS.bad : COLORS.paperLine, width: this.glitched ? 2 : 1.5 });
    // dog-eared bottom-right corner
    const cx = CARD_W / 2, cy = CARD_H / 2, e = 16;
    this.body.poly([cx - e, cy, cx, cy, cx, cy - e]).fill({ color: COLORS.paper1 });
    this.body.poly([cx - e, cy, cx, cy - e, cx - e + 1, cy - e + 1]).stroke({ color: COLORS.paperLine, width: 1 });
  }

  setHalluPct(pct: number) {
    this.haluPct = pct;
    this.haluText.text = `幻觉风险 ${Math.round(pct)}%`;
    // brighter warning color as the risk climbs
    this.haluText.style.fill = pct >= 45 ? COLORS.bad : pct >= 20 ? COLORS.warn : COLORS.inkSoft;
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
      this.bodyText.style.fill = 0xb83a32;
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
      this.bodyText.style.fill = COLORS.ink;
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
    gsap.to(this.shadow, { alpha: on ? 0.5 : 0.32, x: on ? 7 : 0, y: on ? 14 : 0, duration: 0.12 });
  }

  destroy(options?: Parameters<Container['destroy']>[0]) {
    this.glitchTween?.kill();
    gsap.killTweensOf(this);
    gsap.killTweensOf(this.scale);
    super.destroy(options);
  }
}
