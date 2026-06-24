import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { APPS } from '../config/cards';
import { AppIcon } from './AppIcon';

// The phone lying on the desk (§2.5.2 中央偏左：实体手机). Holds the 8 app icons.
export class Phone extends Container {
  readonly icons: AppIcon[] = [];
  readonly screenW = 250;
  readonly screenH = 408;

  constructor() {
    super();
    const w = this.screenW + 30;
    const h = this.screenH + 58;

    // cast shadow on the desk
    const shadow = new Graphics();
    shadow.roundRect(-w / 2 + 6, -h / 2 + 16, w, h, 38).fill({ color: 0x000000, alpha: 0.32 });
    // titanium/charcoal body with a soft side-light
    const shell = new Graphics();
    shell.roundRect(-w / 2, -h / 2, w, h, 36).fill({ color: 0x2c2f36 });
    shell.roundRect(-w / 2, -h / 2, w, h * 0.5, 36).fill({ color: 0x3a3e47, alpha: 0.8 });
    shell.roundRect(-w / 2 + 3, -h / 2 + 3, w - 6, h - 6, 33).stroke({ color: 0x14161b, width: 2 });
    shell.roundRect(-w / 2 + 1, -h / 2 + 1, w - 2, h - 2, 35).stroke({ color: 0x55606e, width: 1, alpha: 0.6 });

    // dark wallpaper screen with a faint top-down gradient
    const screen = new Graphics();
    screen.roundRect(-this.screenW / 2, -this.screenH / 2, this.screenW, this.screenH, 20).fill({ color: 0x101622 });
    screen.roundRect(-this.screenW / 2, -this.screenH / 2, this.screenW, this.screenH * 0.55, 20).fill({ color: 0x16203a, alpha: 0.7 });
    screen.roundRect(-this.screenW / 2, -this.screenH / 2, this.screenW, this.screenH, 20).stroke({ color: 0x000000, width: 1.5, alpha: 0.6 });

    // dynamic-island notch
    const notch = new Graphics();
    notch.roundRect(-28, -this.screenH / 2 + 10, 56, 16, 8).fill({ color: 0x05070c });

    const title = new Text({
      text: '消息中心',
      style: new TextStyle({ fontFamily: 'PingFang SC, sans-serif', fontSize: 12, fontWeight: '600', fill: 0x8b97a8, letterSpacing: 3 }),
    });
    title.anchor.set(0.5);
    title.y = -this.screenH / 2 + 38;
    this.addChild(shadow, shell, screen, notch, title);

    // 4×2 grid of app icons
    const cols = 2;
    const cellW = this.screenW / cols;
    const cellH = 88;
    const top = -this.screenH / 2 + 78;
    APPS.forEach((def, i) => {
      const icon = new AppIcon(def);
      const col = i % cols;
      const row = Math.floor(i / cols);
      icon.position.set(-this.screenW / 2 + cellW * (col + 0.5), top + cellH * row + 30);
      this.addChild(icon);
      this.icons.push(icon);
    });
  }

  /** world-space position of an icon's badge (where cards spawn from). */
  badgeWorldPos(icon: AppIcon): { x: number; y: number } {
    return icon.badge.getGlobalPosition();
  }
}
