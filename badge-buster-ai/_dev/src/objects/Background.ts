import { Container, Graphics } from 'pixi.js';
import { COLORS, WORLD_W, WORLD_H } from '../config/theme';

// Top-down desk backdrop (§2.5.7 俯视桌面). Faked gradient + soft props so the
// first frame already reads as a scene, not a web page.
export function createBackground(): Container {
  const c = new Container();
  const base = new Graphics();
  base.rect(0, 0, WORLD_W, WORLD_H).fill({ color: COLORS.desk1 });
  // layered glows to fake a vertical gradient + corner light
  base.rect(0, 0, WORLD_W, WORLD_H).fill({ color: COLORS.desk0, alpha: 0.6 });
  base.ellipse(WORLD_W * 0.74, -120, 900, 620).fill({ color: COLORS.bg1, alpha: 0.35 });
  base.ellipse(WORLD_W * 0.2, WORLD_H + 120, 700, 480).fill({ color: 0x0a1326, alpha: 0.5 });
  c.addChild(base);

  // faint desk props (coffee ring, scattered paper shadows) — pure decoration
  const props = new Graphics();
  props.circle(960, 150, 34).stroke({ color: 0x2a3a5e, width: 6, alpha: 0.25 });
  props.circle(960, 150, 22).stroke({ color: 0x2a3a5e, width: 3, alpha: 0.18 });
  for (const [x, y, r] of [
    [120, 700, 26],
    [700, 720, 30],
    [560, 120, 18],
    [840, 660, 22],
  ] as const) {
    props.roundRect(x - r, y - r, r * 2, r * 1.4, 6).fill({ color: 0x101a30, alpha: 0.5 });
  }
  c.addChild(props);
  return c;
}
