import { Container, Text, TextStyle } from 'pixi.js';
import { gsap } from 'gsap';
import { BUDGET, COLORS } from '../config/theme';

// Pooled floating numbers / labels (§A.3 FloatingTextLayer, §A.8 池).
export class FloatingText {
  private pool: Text[] = [];
  private live = 0;

  constructor(private layer: Container) {}

  private style(size: number, color: number): TextStyle {
    return new TextStyle({
      fontFamily: 'PingFang SC, Microsoft YaHei, Segoe UI, sans-serif',
      fontSize: size,
      fontWeight: '800',
      fill: color,
      stroke: { color: 0x05080f, width: 4 },
    });
  }

  /** Pop a number/label that drifts up then fades (§2.5.5 算力数字弹出). */
  pop(x: number, y: number, label: string, color: number = COLORS.acc, size = 22) {
    if (this.live >= BUDGET.maxFloatText) return;
    const t = this.pool.pop() ?? new Text({ text: '', style: this.style(size, color) });
    t.text = label;
    t.style = this.style(size, color);
    t.anchor.set(0.5);
    t.position.set(x, y);
    t.alpha = 1;
    t.scale.set(0.6);
    this.layer.addChild(t);
    this.live++;
    gsap.timeline()
      .to(t.scale, { x: 1, y: 1, duration: 0.18, ease: 'back.out(2.5)' })
      .to(t, { y: y - 46, duration: 0.7, ease: 'power1.out' }, 0)
      .to(t, { alpha: 0, duration: 0.3, ease: 'power1.in', delay: 0.45 }, 0)
      .call(() => {
        if (t.parent) t.parent.removeChild(t);
        this.live--;
        if (this.pool.length < 40) this.pool.push(t);
      });
  }
}
