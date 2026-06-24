import { Container, Graphics } from 'pixi.js';
import { gsap } from 'gsap';
import { BUDGET, COLORS } from '../config/theme';

// Pooled particle emitter (§A.5 ParticleContainer 思路 / §A.8 对象池).
// Business logic never touches Graphics directly — it calls these methods.
export class ParticleSystem {
  private pool: Graphics[] = [];
  private live = 0;

  constructor(private layer: Container) {}

  private acquire(): Graphics {
    const g = this.pool.pop() ?? new Graphics();
    g.alpha = 1;
    g.scale.set(1);
    g.visible = true;
    this.layer.addChild(g);
    this.live++;
    return g;
  }

  private release(g: Graphics) {
    gsap.killTweensOf(g);
    g.clear();
    if (g.parent) g.parent.removeChild(g);
    this.live--;
    if (this.pool.length < 160) this.pool.push(g);
  }

  /** Red-dot burst (§2.5.5 点击红点时爆粒子). */
  burst(x: number, y: number, color: number = COLORS.bad, count = 16) {
    count = Math.min(count, BUDGET.settleParticles);
    for (let i = 0; i < count; i++) {
      const g = this.acquire();
      const r = 2 + Math.random() * 3;
      g.circle(0, 0, r).fill({ color, alpha: 0.95 });
      g.position.set(x, y);
      const ang = (Math.PI * 2 * i) / count + Math.random() * 0.6;
      const dist = 28 + Math.random() * 46;
      gsap.to(g, {
        x: x + Math.cos(ang) * dist,
        y: y + Math.sin(ang) * dist,
        alpha: 0,
        duration: 0.5 + Math.random() * 0.35,
        ease: 'power2.out',
        onComplete: () => this.release(g),
      });
    }
  }

  /** Glitch shards when a card is misclassified (§2.5.5 卡面短暂故障闪烁). */
  shards(x: number, y: number) {
    for (let i = 0; i < 10; i++) {
      const g = this.acquire();
      const c = Math.random() > 0.5 ? 0x00e6e6 : 0xff3b3b;
      g.rect(-3, -1, 6, 2).fill({ color: c, alpha: 0.9 });
      g.position.set(x, y);
      g.rotation = Math.random() * Math.PI;
      gsap.to(g, {
        x: x + (Math.random() - 0.5) * 90,
        y: y + (Math.random() - 0.5) * 90,
        alpha: 0,
        duration: 0.4 + Math.random() * 0.3,
        ease: 'power1.out',
        onComplete: () => this.release(g),
      });
    }
  }

  /** A compute chip flying from the furnace to the HUD (§2.5.3 算力晶片飞向资源条). */
  chip(fromX: number, fromY: number, toX: number, toY: number, onArrive?: () => void) {
    const g = this.acquire();
    g.moveTo(0, -6).lineTo(5, 0).lineTo(0, 6).lineTo(-5, 0).closePath().fill({ color: COLORS.acc, alpha: 0.95 });
    g.position.set(fromX, fromY);
    const cx = (fromX + toX) / 2 + (Math.random() - 0.5) * 120;
    const cy = Math.min(fromY, toY) - 60 - Math.random() * 40;
    const prox = { t: 0 };
    gsap.to(prox, {
      t: 1,
      duration: 0.55,
      ease: 'power1.in',
      onUpdate: () => {
        const t = prox.t;
        const mt = 1 - t;
        g.x = mt * mt * fromX + 2 * mt * t * cx + t * t * toX;
        g.y = mt * mt * fromY + 2 * mt * t * cy + t * t * toY;
        g.rotation += 0.3;
      },
      onComplete: () => {
        this.release(g);
        onArrive?.();
      },
    });
  }

  /** A folded-note parcel handed from the sorting station to the 宿主. */
  parcel(fromX: number, fromY: number, toX: number, toY: number, ok: boolean, onArrive?: () => void) {
    const g = this.acquire();
    const c = ok ? COLORS.paper0 : COLORS.bad;
    g.roundRect(-6, -5, 12, 10, 2).fill({ color: c, alpha: 0.95 }).stroke({ color: ok ? COLORS.brass : 0x7a1f18, width: 1 });
    g.position.set(fromX, fromY);
    const cx = (fromX + toX) / 2 + (Math.random() - 0.5) * 60;
    const cy = Math.min(fromY, toY) - 70 - Math.random() * 30;
    const prox = { t: 0 };
    gsap.to(prox, {
      t: 1,
      duration: 0.5,
      ease: 'power1.inOut',
      onUpdate: () => {
        const t = prox.t;
        const mt = 1 - t;
        g.x = mt * mt * fromX + 2 * mt * t * cx + t * t * toX;
        g.y = mt * mt * fromY + 2 * mt * t * cy + t * t * toY;
        g.rotation += 0.2;
      },
      onComplete: () => {
        this.release(g);
        onArrive?.();
      },
    });
  }

  get liveCount() {
    return this.live;
  }
}
