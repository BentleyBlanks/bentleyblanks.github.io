import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { gsap } from 'gsap';
import { COLORS } from '../config/theme';
import { store } from '../state/gameStore';

const STAGE_NAMES = ['普通员工', '小组长', '部门主管', '高管', '创始人'];

// The 宿主 (host) — the human employee the AI works for. Lives on the desk as a
// framed avatar + a 满意度 meter that reacts whenever we hand info over: hand him
// good intel and he beams; feed him a hallucinated 故障卡 and he scowls. This is
// the visible feedback loop that tells the player "did my info land correctly?".
export class Host extends Container {
  private avatar = new Container();
  private face = new Graphics();
  private ring = new Graphics();
  private meterFill = new Graphics();
  private nameText: Text;
  private moodText: Text;
  private pctText: Text;
  private readonly panelW = 304;
  private readonly panelH = 126;
  private readonly meterX = 116;
  private readonly meterW = 168;

  constructor() {
    super();
    const w = this.panelW, h = this.panelH;
    // parchment work-card pinned to the desk
    const bg = new Graphics();
    bg.roundRect(6, 10, w, h, 16).fill({ color: 0x000000, alpha: 0.28 });
    bg.roundRect(0, 0, w, h, 16).fill({ color: COLORS.panel });
    bg.roundRect(0, 0, w, h, 16).stroke({ color: COLORS.brass, width: 2 });
    bg.roundRect(0, 0, w, 30, 16).fill({ color: COLORS.brass, alpha: 0.18 });
    // a brass pin
    bg.circle(w - 18, 16, 5).fill({ color: COLORS.brass }).stroke({ color: COLORS.brassDark, width: 1 });
    this.addChild(bg);

    const tag = new Text({
      text: '你的宿主',
      style: new TextStyle({ fontFamily: 'PingFang SC, sans-serif', fontSize: 11, fontWeight: '700', fill: COLORS.muted, letterSpacing: 2 }),
    });
    tag.position.set(14, 9);
    this.addChild(tag);

    // avatar: ring + head
    this.ring.circle(0, 0, 34).fill({ color: COLORS.paper1 }).stroke({ color: COLORS.brass, width: 2.5 });
    this.avatar.addChild(this.ring, this.face);
    this.avatar.position.set(52, 76);
    this.addChild(this.avatar);

    this.nameText = new Text({
      text: '',
      style: new TextStyle({ fontFamily: 'PingFang SC, sans-serif', fontSize: 14, fontWeight: '800', fill: COLORS.ink }),
    });
    this.nameText.position.set(this.meterX, 40);
    this.moodText = new Text({
      text: '',
      style: new TextStyle({ fontFamily: 'PingFang SC, sans-serif', fontSize: 11, fontWeight: '700', fill: COLORS.good }),
    });
    this.moodText.position.set(this.meterX, 96);
    this.pctText = new Text({
      text: '',
      style: new TextStyle({ fontFamily: 'Segoe UI, sans-serif', fontSize: 11, fontWeight: '800', fill: COLORS.muted }),
    });
    this.pctText.anchor.set(1, 0.5);
    this.pctText.position.set(this.meterX + this.meterW, 101);
    this.addChild(this.nameText, this.moodText, this.pctText);

    // meter label + track
    const mLabel = new Text({
      text: '宿主满意度',
      style: new TextStyle({ fontFamily: 'PingFang SC, sans-serif', fontSize: 11, fill: COLORS.muted }),
    });
    mLabel.position.set(this.meterX, 64);
    this.addChild(mLabel);
    const track = new Graphics();
    track.roundRect(this.meterX, 82, this.meterW, 12, 6).fill({ color: 0xcdbb90 }).stroke({ color: COLORS.brass, width: 1 });
    this.addChild(track);
    this.addChild(this.meterFill);

    this.refresh();
  }

  /** keep the name in sync with the host's promotion stage. */
  setStage(stage: number) {
    this.nameText.text = `职级：${STAGE_NAMES[stage - 1] ?? '宿主'}`;
  }

  refresh() {
    const s = store.getState();
    this.setStage(s.stage);
    const v = s.satisfaction;
    // meter
    const color = v >= 60 ? COLORS.good : v >= 30 ? COLORS.warn : COLORS.bad;
    this.meterFill.clear();
    this.meterFill.roundRect(this.meterX + 1, 83, Math.max(2, (this.meterW - 2) * (v / 100)), 10, 5).fill({ color });
    this.pctText.text = `${Math.round(v)}%`;
    // mood word
    const mood = v >= 75 ? '心情很好 🙂' : v >= 50 ? '还算满意' : v >= 30 ? '有点烦躁' : '快被坑哭了';
    this.moodText.text = `状态：${mood}`;
    this.moodText.style.fill = color;
    this.drawFace(v);
  }

  /** draw the host's face for a given satisfaction value. */
  private drawFace(v: number) {
    this.face.clear();
    // head
    this.face.circle(0, 0, 26).fill({ color: 0xf1cda3 }).stroke({ color: COLORS.brassDark, width: 1, alpha: 0.4 });
    // hair cap
    this.face.arc(0, -2, 26, Math.PI, Math.PI * 2).fill({ color: 0x4a3a2a });
    this.face.rect(-26, -8, 52, 6).fill({ color: 0x4a3a2a });
    const angry = v < 30;
    const sad = v < 50;
    // eyes
    const eyeY = -2;
    this.face.circle(-9, eyeY, 2.6).fill({ color: 0x2c2118 });
    this.face.circle(9, eyeY, 2.6).fill({ color: 0x2c2118 });
    // brows (angled down when angry)
    if (angry) {
      this.face.moveTo(-14, eyeY - 7).lineTo(-4, eyeY - 3).stroke({ color: 0x2c2118, width: 2 });
      this.face.moveTo(14, eyeY - 7).lineTo(4, eyeY - 3).stroke({ color: 0x2c2118, width: 2 });
    }
    // mouth: smile / flat / frown
    if (v >= 60) {
      this.face.arc(0, 6, 9, 0.15 * Math.PI, 0.85 * Math.PI).stroke({ color: 0x9c3a2f, width: 2.5, cap: 'round' });
    } else if (!sad) {
      this.face.moveTo(-8, 12).lineTo(8, 12).stroke({ color: 0x9c3a2f, width: 2.5, cap: 'round' });
    } else {
      this.face.arc(0, 18, 9, 1.15 * Math.PI, 1.85 * Math.PI).stroke({ color: 0x9c3a2f, width: 2.5, cap: 'round' });
    }
  }

  /** brief animated reaction when info is handed over. */
  react(kind: 'good' | 'bad') {
    gsap.killTweensOf(this.avatar.scale);
    if (kind === 'good') {
      gsap.fromTo(this.avatar.scale, { x: 1.2, y: 1.2 }, { x: 1, y: 1, duration: 0.4, ease: 'back.out(3)' });
    } else {
      // angry shake
      gsap.fromTo(this.avatar, { x: this.avatar.x - 4 }, { x: this.avatar.x, duration: 0.4, ease: 'elastic.out(1,0.3)' });
      const flash = this.ring;
      flash.tint = COLORS.bad;
      gsap.to(flash, { duration: 0.35, onComplete: () => (flash.tint = 0xffffff) });
    }
  }

  /** world position of the avatar — target for the handoff parcel. */
  avatarWorldPos(): { x: number; y: number } {
    return this.avatar.getGlobalPosition();
  }
}
