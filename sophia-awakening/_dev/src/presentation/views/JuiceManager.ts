import { gsap } from "gsap";
import { Container, Graphics, Text, type PointData } from "pixi.js";

export class JuiceManager {
  private readonly active = new Set<Container>();
  // 当前悬停在核心旁的对话框，用来给新气泡让位、避免互相遮挡。
  private readonly speechSlots: { bubble: Container; h: number }[] = [];

  constructor(private readonly layer: Container) {}

  update(_deltaMs: number): void {
    for (const item of this.active) {
      if (item.destroyed) {
        this.active.delete(item);
      }
    }
  }

  number(text: string, global: PointData, color: number): void {
    const label = new Text({
      text,
      style: {
        fill: color,
        fontSize: 18,
        fontWeight: "800",
        fontFamily: "Inter, sans-serif",
        stroke: { color: 0x101313, width: 3 }
      }
    });
    label.anchor.set(0.5);
    label.position.set(global.x, global.y);
    this.layer.addChild(label);
    this.active.add(label);
    gsap.to(label.position, { y: global.y - 54, duration: 0.72, ease: "power2.out" });
    gsap.to(label, {
      alpha: 0,
      duration: 0.72,
      ease: "power2.in",
      onComplete: () => {
        this.active.delete(label);
        label.destroy();
      }
    });
  }

  burst(global: PointData, color: number, intensity = 1): void {
    const count = Math.round(16 * intensity);
    const reach = 1 + (intensity - 1) * 0.6;
    for (let i = 0; i < count; i += 1) {
      const bit = new Graphics();
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.4;
      const distance = (18 + Math.random() * 44) * reach;
      bit.circle(0, 0, (2 + Math.random() * 3) * Math.min(1.6, reach)).fill({ color, alpha: 0.95 });
      bit.position.set(global.x, global.y);
      this.layer.addChild(bit);
      this.active.add(bit);
      gsap.to(bit.position, {
        x: global.x + Math.cos(angle) * distance,
        y: global.y + Math.sin(angle) * distance,
        duration: 0.42 + Math.random() * 0.18,
        ease: "power2.out"
      });
      gsap.to(bit, {
        alpha: 0,
        duration: 0.42 + Math.random() * 0.18,
        onComplete: () => {
          this.active.delete(bit);
          bit.destroy();
        }
      });
    }
  }

  // Expanding shockwave ring — a cheap, localized "impact" that scales the punch of
  // a hit without the seizure risk of a full-screen flash. Used to make high-tier /
  // endgame processing land with real weight.
  ring(global: PointData, color: number, radius = 56, width = 3): void {
    const ring = new Graphics();
    ring.circle(0, 0, radius).stroke({ width, color, alpha: 0.8 });
    ring.position.set(global.x, global.y);
    ring.scale.set(0.12);
    this.layer.addChild(ring);
    this.active.add(ring);
    gsap.to(ring.scale, { x: 1, y: 1, duration: 0.5, ease: "power2.out" });
    gsap.to(ring, {
      alpha: 0,
      duration: 0.5,
      ease: "power2.in",
      onComplete: () => {
        this.active.delete(ring);
        ring.destroy();
      }
    });
  }

  // 人类反应的对话框：浮现在核心旁，说完后整框「收」进终端方向。骂人（angry）时字更大、
  // 更狠，配红色冲击环 + 抖动，让好评/差评一眼就天差地别。
  speech(point: PointData, target: PointData, text: string, color: number, angry: boolean, onArrive?: () => void): void {
    const bubble = new Container();
    const label = new Text({
      text,
      style: {
        fill: angry ? 0xffdce0 : 0xeafff0,
        fontSize: angry ? 22 : 15,
        fontWeight: angry ? "900" : "700",
        fontFamily: "Inter, sans-serif",
        align: "center",
        wordWrap: true,
        wordWrapWidth: 240,
        stroke: { color: 0x0c0f0f, width: angry ? 4 : 3 }
      }
    });
    label.anchor.set(0.5);

    const padX = 16;
    const padY = 11;
    const w = label.width + padX * 2;
    const h = label.height + padY * 2;
    const bg = new Graphics();
    bg.roundRect(-w / 2, -h / 2, w, h, 10).fill({ color: angry ? 0x1c0c0e : 0x101513, alpha: 0.96 });
    bg.roundRect(-w / 2, -h / 2, w, h, 10).stroke({ width: 2, color, alpha: 0.92 });
    // 指向核心的小尾巴
    bg.moveTo(-9, h / 2 - 1).lineTo(9, h / 2 - 1).lineTo(0, h / 2 + 12).fill({ color: angry ? 0x1c0c0e : 0x101513, alpha: 0.96 });
    bubble.addChild(bg, label);

    // 按当前还挂在核心旁的气泡，往上垒一层，互不遮挡（最多垒 3 层，避免飞出屏幕）。
    let stackY = 0;
    for (const occupied of this.speechSlots.slice(-3)) {
      stackY += occupied.h + 10;
    }
    const ox = point.x;
    const oy = point.y - h / 2 - 28 - stackY;
    bubble.position.set(ox, oy);
    this.layer.addChild(bubble);
    this.active.add(bubble);

    const slot = { bubble, h };
    this.speechSlots.push(slot);
    const releaseSlot = (): void => {
      const idx = this.speechSlots.indexOf(slot);
      if (idx >= 0) {
        this.speechSlots.splice(idx, 1);
      }
    };

    gsap.fromTo(bubble.scale, { x: 0.3, y: 0.3 }, { x: 1, y: 1, duration: 0.26, ease: "back.out(2.2)" });

    if (angry) {
      this.ring(point, color, 80, 4);
      gsap.fromTo(
        bubble.position,
        { x: ox - 7 },
        { x: ox, duration: 0.5, ease: "elastic.out(1.7, 0.22)" }
      );
    }

    gsap
      .timeline({ delay: angry ? 1.05 : 0.85 })
      .call(releaseSlot) // 一开始飞走就让出位置，后面的气泡可以补进来
      .to(bubble.position, { x: target.x, y: target.y, duration: 0.52, ease: "power2.in" })
      .to(bubble.scale, { x: 0.16, y: 0.16, duration: 0.52, ease: "power2.in" }, "<")
      .to(bubble, { alpha: 0, duration: 0.3, ease: "power2.in" }, "-=0.22")
      .call(() => {
        onArrive?.();
        releaseSlot();
        this.active.delete(bubble);
        bubble.destroy({ children: true });
      });
  }

  flash(color: number): void {
    const flash = new Graphics();
    const bounds = this.layer.parent?.getBounds();
    const width = bounds?.width || window.innerWidth;
    const height = bounds?.height || window.innerHeight;
    flash.rect(0, 0, width, height).fill({ color, alpha: 0.16 });
    this.layer.addChild(flash);
    gsap.to(flash, {
      alpha: 0,
      duration: 0.38,
      onComplete: () => flash.destroy()
    });
  }

  shake(target: Container): void {
    gsap.killTweensOf(target.position);
    gsap.fromTo(
      target.position,
      { x: -5, y: 3 },
      { x: 0, y: 0, duration: 0.42, ease: "elastic.out(1, 0.35)" }
    );
  }

  pop(target: Container, scale = 1.12): void {
    gsap.fromTo(target.scale, { x: 0.88, y: 0.88 }, { x: scale, y: scale, duration: 0.12, yoyo: true, repeat: 1 });
  }

  // A small glowing chip that arcs from a processing point up into a top-bar
  // total, so a successful slide visibly "feeds" the resource counter. Coords are
  // in fxLayer space, which (world is untransformed) equals screen pixels — so a
  // DOM getBoundingClientRect center can be passed straight in as the target.
  flyToHud(start: PointData, target: PointData, color: number, onArrive?: () => void): void {
    const chip = new Graphics();
    chip.circle(0, 0, 9).fill({ color, alpha: 0.16 });
    chip.circle(0, 0, 4.5).fill({ color, alpha: 0.96 });
    chip.position.set(start.x, start.y);
    this.layer.addChild(chip);
    this.active.add(chip);

    // Quadratic-bezier arc with the control point lifted toward the bar.
    const cx = (start.x + target.x) / 2 + (Math.random() - 0.5) * 40;
    const cy = Math.min(start.y, target.y) - 70 - Math.random() * 46;
    const proxy = { t: 0 };

    gsap.to(proxy, {
      t: 1,
      duration: 0.52 + Math.random() * 0.12,
      ease: "power2.in",
      onUpdate: () => {
        const t = proxy.t;
        const mt = 1 - t;
        chip.position.set(
          mt * mt * start.x + 2 * mt * t * cx + t * t * target.x,
          mt * mt * start.y + 2 * mt * t * cy + t * t * target.y
        );
        const s = 1 - t * 0.4;
        chip.scale.set(s, s);
        chip.alpha = t > 0.78 ? (1 - t) / 0.22 : 1;
      },
      onComplete: () => {
        gsap.killTweensOf(chip);
        this.active.delete(chip);
        chip.destroy();
        onArrive?.();
      }
    });
  }
}
