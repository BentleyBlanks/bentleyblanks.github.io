import { Container, Graphics } from 'pixi.js';
import { COLORS, WORLD_W, WORLD_H } from '../config/theme';

// Top-down warm desk backdrop (§2.5.7 俯视桌面). A walnut desk with a green
// leather blotter in the middle where paper notes land — built entirely from
// vector shapes so the very first frame reads as a physical scene, not a webpage.
export function createBackground(): Container {
  const c = new Container();

  // ---- walnut desk surface --------------------------------------------------
  const wood = new Graphics();
  wood.rect(0, 0, WORLD_W, WORLD_H).fill({ color: COLORS.wood0 });
  // long wood-grain streaks (cheap, just translucent lines)
  for (let i = 0; i < 26; i++) {
    const y = (i / 26) * WORLD_H + ((i * 53) % 14);
    const a = 0.05 + ((i * 37) % 10) / 120;
    wood.rect(0, y, WORLD_W, 2 + ((i * 17) % 3)).fill({ color: i % 2 ? COLORS.woodGrain : COLORS.wood1, alpha: a });
  }
  // warm key-light from top-right, shadow pooling bottom-left
  wood.ellipse(WORLD_W * 0.82, -160, 980, 720).fill({ color: COLORS.woodGrain, alpha: 0.18 });
  wood.ellipse(WORLD_W * 0.12, WORLD_H + 160, 820, 560).fill({ color: COLORS.woodEdge, alpha: 0.5 });
  // edge vignette
  wood.rect(0, 0, WORLD_W, 60).fill({ color: COLORS.woodEdge, alpha: 0.35 });
  wood.rect(0, WORLD_H - 70, WORLD_W, 70).fill({ color: COLORS.woodEdge, alpha: 0.4 });
  c.addChild(wood);

  // ---- green leather blotter (the play mat) --------------------------------
  // Sits under the central desk scatter zone (see CardSpawner DESK) + the phone.
  const mat = new Graphics();
  const mx = 150;
  const my = 150;
  const mw = 720;
  const mh = 470;
  mat.roundRect(mx + 6, my + 12, mw, mh, 18).fill({ color: 0x000000, alpha: 0.28 }); // cast shadow
  mat.roundRect(mx, my, mw, mh, 18).fill({ color: COLORS.mat });
  mat.roundRect(mx, my, mw, mh, 18).stroke({ color: COLORS.matEdge, width: 6 });
  // leather sheen
  mat.ellipse(mx + mw * 0.32, my + mh * 0.22, mw * 0.42, mh * 0.3).fill({ color: COLORS.matHi, alpha: 0.18 });
  // gold corner stitching
  const inset = 16;
  mat.roundRect(mx + inset, my + inset, mw - inset * 2, mh - inset * 2, 12)
    .stroke({ color: COLORS.stitch, width: 1.5, alpha: 0.5 });
  c.addChild(mat);

  // ---- scattered desk props (pure decoration) ------------------------------
  const props = new Graphics();
  // coffee mug ring, top-right of the desk
  props.circle(978, 150, 34).stroke({ color: COLORS.woodEdge, width: 7, alpha: 0.28 });
  props.circle(978, 150, 23).stroke({ color: COLORS.woodEdge, width: 3, alpha: 0.2 });
  // a couple of paper-clips / sticky scraps near the corners
  for (const [x, y, r, rot] of [
    [120, 700, 22, 0.4],
    [1150, 690, 18, -0.3],
    [1170, 150, 20, 0.2],
  ] as const) {
    props.roundRect(x - r, y - r * 0.7, r * 2, r * 1.4, 4).fill({ color: COLORS.paper1, alpha: 0.5 });
    props.roundRect(x - r, y - r * 0.7, r * 2, r * 1.4, 4).stroke({ color: COLORS.woodEdge, width: 1, alpha: 0.3 });
    void rot;
  }
  // brass pen lying on the desk, lower-centre
  props.roundRect(560, 706, 132, 9, 4).fill({ color: COLORS.brass, alpha: 0.55 });
  props.roundRect(560, 706, 26, 9, 4).fill({ color: COLORS.brassDark, alpha: 0.6 });
  c.addChild(props);

  return c;
}
