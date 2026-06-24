import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { COLORS } from '../config/theme';
import { APPS } from '../config/cards';
import { AppIcon } from './AppIcon';

// The phone lying on the desk (§2.5.2 中央偏左：实体手机). Holds the 8 app icons.
export class Phone extends Container {
  readonly icons: AppIcon[] = [];
  readonly screenW = 248;
  readonly screenH = 410;

  constructor() {
    super();
    const w = this.screenW + 28;
    const h = this.screenH + 56;
    // body shell
    const shell = new Graphics();
    shell
      .roundRect(-w / 2, -h / 2, w, h, 34)
      .fill({ color: 0x0a1020 })
      .stroke({ color: COLORS.line, width: 2 });
    shell.roundRect(-w / 2 + 5, -h / 2 + 5, w - 10, h - 10, 30).stroke({ color: 0x223150, width: 1 });
    // screen
    const screen = new Graphics();
    screen
      .roundRect(-this.screenW / 2, -this.screenH / 2, this.screenW, this.screenH, 18)
      .fill({ color: COLORS.desk0 })
      .stroke({ color: 0x2c3f66, width: 1 });
    // notch + soft glow
    const notch = new Graphics();
    notch.roundRect(-26, -this.screenH / 2 - 6, 52, 16, 8).fill({ color: 0x05080f });
    const title = new Text({
      text: '消息中心',
      style: new TextStyle({ fontFamily: 'PingFang SC, sans-serif', fontSize: 12, fill: COLORS.dim, letterSpacing: 4 }),
    });
    title.anchor.set(0.5);
    title.y = -this.screenH / 2 + 18;
    this.addChild(shell, screen, notch, title);

    // 4×2 grid of app icons
    const cols = 2;
    const cellW = this.screenW / cols;
    const cellH = 86;
    const top = -this.screenH / 2 + 50;
    APPS.forEach((def, i) => {
      const icon = new AppIcon(def);
      const col = i % cols;
      const row = Math.floor(i / cols);
      icon.position.set(-this.screenW / 2 + cellW * (col + 0.5), top + cellH * row + 34);
      this.addChild(icon);
      this.icons.push(icon);
    });
  }

  /** world-space position of an icon's badge (where cards spawn from). */
  badgeWorldPos(icon: AppIcon): { x: number; y: number } {
    return icon.badge.getGlobalPosition();
  }
}
