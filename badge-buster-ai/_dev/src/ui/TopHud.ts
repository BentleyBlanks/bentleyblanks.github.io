import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { gsap } from 'gsap';
import { COLORS, WORLD_W } from '../config/theme';
import { fmt } from '../util/format';
import { store } from '../state/gameStore';

const STAGE_NAMES = ['普通员工', '小组长', '部门主管', '高管', '创始人'];

// Top resource bar (§A.3 TopHudLayer): a brass desk nameplate showing 算力 /
// 幻觉风险 / 权限 / 宿主职级.
export class TopHud extends Container {
  private barW = WORLD_W - 24;
  private h = 60;
  private computeText: Text;
  private permText: Text;
  private stageText: Text;
  private haluFill = new Graphics();
  private haluLabel: Text;
  private computeIcon: Container;

  constructor() {
    super();
    this.position.set(12, 10);
    const bg = new Graphics();
    // brushed-brass plank with a darker base + bevel
    bg.roundRect(0, 3, this.barW, this.h, 14).fill({ color: 0x000000, alpha: 0.25 });
    bg.roundRect(0, 0, this.barW, this.h, 14).fill({ color: COLORS.wood1 });
    bg.roundRect(0, 0, this.barW, this.h, 14).stroke({ color: COLORS.brass, width: 2 });
    bg.roundRect(4, 4, this.barW - 8, this.h - 8, 11).stroke({ color: COLORS.brassDark, width: 1, alpha: 0.6 });
    this.addChild(bg);

    // brand
    const brand = new Text({
      text: '角标清道夫 AI',
      style: new TextStyle({ fontFamily: 'PingFang SC, sans-serif', fontSize: 15, fontWeight: '800', fill: COLORS.brassHi, letterSpacing: 0.5 }),
    });
    brand.position.set(18, this.h / 2 - 9);
    this.addChild(brand);

    // compute readout
    this.computeIcon = this.metric('⚡ 算力', 196, COLORS.amberHi);
    this.computeText = (this.computeIcon as any).valueText;
    // hallucination bar
    this.buildHalluBar(372);
    this.haluLabel = new Text({ text: '', style: this.smallStyle(0xe7cfa0) });
    this.haluLabel.position.set(372, 10);
    this.addChild(this.haluLabel);
    // permission
    const permWrap = this.metric('🔑 权限', 720, 0x8fe0d6);
    this.permText = (permWrap as any).valueText;
    // host stage pill — clarifies this is the HOST's job level, not the player's
    const stagePill = new Graphics();
    stagePill.roundRect(this.barW - 196, this.h / 2 - 15, 180, 30, 15).fill({ color: COLORS.brass });
    stagePill.roundRect(this.barW - 196, this.h / 2 - 15, 180, 30, 15).stroke({ color: COLORS.brassDark, width: 1.5 });
    this.addChild(stagePill);
    this.stageText = new Text({
      text: '',
      style: new TextStyle({ fontFamily: 'PingFang SC, sans-serif', fontSize: 13, fontWeight: '800', fill: 0x3a2a12 }),
    });
    this.stageText.anchor.set(0.5);
    this.stageText.position.set(this.barW - 106, this.h / 2);
    this.addChild(this.stageText);

    this.refresh();
  }

  private smallStyle(color: number) {
    return new TextStyle({ fontFamily: 'PingFang SC, sans-serif', fontSize: 11, fill: color });
  }

  private metric(label: string, x: number, color: number): Container {
    const wrap = new Container();
    wrap.position.set(x, 0);
    const lab = new Text({ text: label, style: this.smallStyle(0xcdb588) });
    lab.position.set(0, 10);
    const val = new Text({
      text: '0',
      style: new TextStyle({ fontFamily: 'Segoe UI, sans-serif', fontSize: 22, fontWeight: '800', fill: color }),
    });
    val.position.set(0, 25);
    wrap.addChild(lab, val);
    (wrap as any).valueText = val;
    this.addChild(wrap);
    return wrap;
  }

  private buildHalluBar(x: number) {
    const w = 300;
    const y = 28;
    const track = new Graphics();
    track.roundRect(x, y, w, 14, 7).fill({ color: 0x241606 }).stroke({ color: COLORS.brassDark, width: 1 });
    // 75% cap marker (§6.2 封顶)
    track.rect(x + w * 0.75, y - 2, 2, 18).fill({ color: COLORS.bad, alpha: 0.8 });
    this.addChild(track);
    this.haluFill.position.set(x, y);
    this.addChild(this.haluFill);
    const hint = new Text({
      text: '越高 → 卡片越可能被篡改成假消息',
      style: new TextStyle({ fontFamily: 'PingFang SC, sans-serif', fontSize: 9, fill: 0xb39a6e }),
    });
    hint.position.set(x, y + 16);
    this.addChild(hint);
    (this as any)._haluX = x;
    (this as any)._haluW = w;
  }

  private drawHalu(pct: number) {
    const w = (this as any)._haluW as number;
    this.haluFill.clear();
    const fw = Math.max(2, (w * pct) / 100);
    // green → amber → red as risk climbs
    const color = pct >= 50 ? COLORS.bad : pct >= 25 ? COLORS.warn : COLORS.good;
    this.haluFill.roundRect(0, 0, fw, 14, 7).fill({ color });
  }

  refresh() {
    const s = store.getState();
    this.computeText.text = fmt(s.compute);
    this.permText.text = `${s.permission}  ×${(1 + 0.02 * s.permission).toFixed(2)}`;
    this.stageText.text = `宿主 · ${STAGE_NAMES[s.stage - 1] ?? '员工'}`;
    this.drawHalu(s.hallucination);
    this.haluLabel.text = `🌀 幻觉风险  ${s.hallucination.toFixed(1)}%`;
  }

  pulseCompute() {
    gsap.killTweensOf(this.computeText.scale);
    gsap.fromTo(this.computeText.scale, { x: 1.25, y: 1.25 }, { x: 1, y: 1, duration: 0.25, ease: 'back.out(3)' });
  }

  /** global position of the compute readout (chip-flight target). */
  computeAnchor(): { x: number; y: number } {
    return this.computeText.getGlobalPosition();
  }
}
