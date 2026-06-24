import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { gsap } from 'gsap';
import { COLORS, WORLD_W } from '../config/theme';
import { fmt } from '../util/format';
import { store } from '../state/gameStore';

const STAGE_NAMES = ['普通员工', '小组长', '部门主管', '高管', '创始人'];

// Top resource bar (§A.3 TopHudLayer): 算力 / 幻觉 / 权限 / 宿主阶段.
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
    bg.roundRect(0, 0, this.barW, this.h, 14).fill({ color: COLORS.panel2 }).stroke({ color: COLORS.line, width: 1.5 });
    this.addChild(bg);

    // brand
    const brand = new Text({
      text: '角标清道夫 AI',
      style: new TextStyle({ fontFamily: 'PingFang SC, sans-serif', fontSize: 15, fontWeight: '800', fill: COLORS.ink, letterSpacing: 0.5 }),
    });
    brand.position.set(18, this.h / 2 - 9);
    this.addChild(brand);

    // compute readout
    this.computeIcon = this.metric('⚡ 算力', 196, COLORS.acc);
    this.computeText = (this.computeIcon as any).valueText;
    // hallucination bar
    this.buildHalluBar(372);
    this.haluLabel = new Text({ text: '', style: this.smallStyle(COLORS.warn) });
    this.haluLabel.position.set(372, 10);
    this.addChild(this.haluLabel);
    // permission
    const permWrap = this.metric('🔑 权限', 720, COLORS.acc2);
    this.permText = (permWrap as any).valueText;
    // stage pill
    const stagePill = new Graphics();
    stagePill.roundRect(this.barW - 168, this.h / 2 - 15, 152, 30, 15).fill({ color: COLORS.acc });
    this.addChild(stagePill);
    this.stageText = new Text({
      text: '',
      style: new TextStyle({ fontFamily: 'PingFang SC, sans-serif', fontSize: 13, fontWeight: '800', fill: COLORS.bg0 }),
    });
    this.stageText.anchor.set(0.5);
    this.stageText.position.set(this.barW - 92, this.h / 2);
    this.addChild(this.stageText);

    this.refresh();
  }

  private smallStyle(color: number) {
    return new TextStyle({ fontFamily: 'PingFang SC, sans-serif', fontSize: 11, fill: color });
  }

  private metric(label: string, x: number, color: number): Container {
    const wrap = new Container();
    wrap.position.set(x, 0);
    const lab = new Text({ text: label, style: this.smallStyle(COLORS.muted) });
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
    track.roundRect(x, y, w, 14, 7).fill({ color: 0x0a1124 }).stroke({ color: COLORS.line, width: 1 });
    // 75% cap marker (§6.2 封顶)
    track.rect(x + w * 0.75, y - 2, 2, 18).fill({ color: COLORS.bad, alpha: 0.7 });
    this.addChild(track);
    this.haluFill.position.set(x, y);
    this.addChild(this.haluFill);
    (this as any)._haluX = x;
    (this as any)._haluW = w;
  }

  private drawHalu(pct: number) {
    const w = (this as any)._haluW as number;
    this.haluFill.clear();
    const fw = Math.max(2, (w * pct) / 100);
    // green → yellow → red gradient feel via discrete color
    const color = pct >= 50 ? COLORS.bad : pct >= 25 ? COLORS.warn : COLORS.good;
    this.haluFill.roundRect(0, 0, fw, 14, 7).fill({ color });
  }

  refresh() {
    const s = store.getState();
    this.computeText.text = fmt(s.compute);
    this.permText.text = `${s.permission}  ×${(1 + 0.02 * s.permission).toFixed(2)}`;
    this.stageText.text = `S${s.stage}·${STAGE_NAMES[s.stage - 1] ?? '宿主'}`;
    this.drawHalu(s.hallucination);
    this.haluLabel.text = `🌀 幻觉概率  ${s.hallucination.toFixed(1)}%`;
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
