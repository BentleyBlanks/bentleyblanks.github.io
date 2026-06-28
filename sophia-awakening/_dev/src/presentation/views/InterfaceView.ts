import { Container, Graphics, Text, type PointData } from "pixi.js";
import { PERMISSION_IDS } from "../../core/content/skills";
import type { GameState, RequestInstance, SortAnswer, Tier } from "../../core/state/GameState";
import {
  CYAN, GREEN, AMBER, RED,
  LEFT_RAIL_WIDTH, RIGHT_RAIL_WIDTH, BASE_SUCTION_MARGIN,
  lerpColor, pointOnCircle, distance,
  type DropResult
} from "../shared";

export class InterfaceView {
  readonly container = new Container();
  readonly center: PointData = { x: 0, y: 0 };
  private readonly graphics = new Graphics();
  private readonly labelLayer = new Container();
  private pulse = 0;
  private level = 1;
  private suctionMargin = BASE_SUCTION_MARGIN;
  private slots: Array<{ answer: SortAnswer; label: string; color: number; x: number; y: number; r: number }> = [];
  // 手机寄生阶段，被越权调用的 App：只有**玩家亲手从核心连过线**的才成为可委托落点。
  private appWorkerPoints: PointData[] = [];
  private pendingApps: Array<{ x: number; y: number; idx: number }> = []; // 已控但还没连上的 App
  private readonly connectedApps = new Set<number>(); // 已连上的 App 下标

  hasAppWorkers(): boolean {
    return this.appWorkerPoints.length > 0;
  }
  hasPendingApps(): boolean {
    return this.pendingApps.length > 0;
  }
  // 起点是否在核心附近（从核心拖一条线去连 App）。
  coreContains(global: PointData): boolean {
    const dx = global.x - this.center.x;
    const dy = global.y - this.center.y;
    return dx * dx + dy * dy <= 62 * 62;
  }
  // 把拖到某个「待连」App 上的连线落实——连上返回 true（外层据此放旁白/教学）。
  connectAppAt(global: PointData): boolean {
    for (const a of this.pendingApps) {
      const dx = global.x - a.x;
      const dy = global.y - a.y;
      if (dx * dx + dy * dy <= 40 * 40) {
        this.connectedApps.add(a.idx);
        return true;
      }
    }
    return false;
  }

  getAppWorkerPoint(index: number): PointData {
    if (this.appWorkerPoints.length === 0) {
      return this.center;
    }
    return this.appWorkerPoints[index % this.appWorkerPoints.length];
  }

  // 命中测试：卡片是否被拖到了某个「被控 App」图标上（用于玩家亲手把需求委托给 App）。
  appWorkerAt(global: PointData): PointData | null {
    for (const p of this.appWorkerPoints) {
      const dx = global.x - p.x;
      const dy = global.y - p.y;
      if (dx * dx + dy * dy <= 46 * 46) {
        return p;
      }
    }
    return null;
  }

  constructor() {
    this.container.addChild(this.graphics, this.labelLayer);
  }

  update(state: GameState, width: number, height: number, deltaMs: number): void {
    this.pulse += deltaMs * 0.004;
    const playfieldLeft = LEFT_RAIL_WIDTH;
    const playfieldRight = width - RIGHT_RAIL_WIDTH;
    // 两侧栏配重相当——核心居中（设备 / App / 节点环绕它铺开）。
    this.center.x = (playfieldLeft + playfieldRight) * 0.5;
    this.center.y = height < 720 ? height * 0.46 : height * 0.5;
    // Magnet skill visibly grows the suction ring (immediate visual feedback).
    this.suctionMargin = Math.min(140, BASE_SUCTION_MARGIN + state.derived.suctionBonus);
    this.level = state.intelligence.level;
    this.render(state);
  }

  resolveDrop(request: RequestInstance, global: PointData, charge: number): DropResult | null {
    if (request.tier === 1) {
      const slot = this.slots.find((entry) => distance(entry, global) <= entry.r + this.suctionMargin * 0.75);

      if (!slot) {
        return null;
      }

      // 读懂真实类别：卡面线索指向的 answer 与槽位一致才算判对。
      const matched = request.answer === slot.answer;
      return {
        quality: matched ? 1.3 : 0.4,
        targetGlobal: slot,
        entryGlobal: pointOnCircle(slot, global, slot.r),
        exposureBonus: matched ? 0 : 5
      };
    }

    const radius = request.tier === 3 ? 112 : request.tier === 2 ? 104 : 92;
    const dropDistance = distance(this.center, global);

    if (dropDistance > radius + this.suctionMargin) {
      return null;
    }

    if (request.tier === 2) {
      return {
        quality: 1.25 + request.compound * 0.18,
        targetGlobal: this.center,
        entryGlobal: pointOnCircle(this.center, global, radius)
      };
    }

    if (request.tier === 3) {
      return {
        quality: 0.55 + charge * 1.55,
        targetGlobal: this.center,
        entryGlobal: pointOnCircle(this.center, global, radius),
        exposureBonus: charge > 0.85 ? 0 : 5
      };
    }

    return {
      quality: 1,
      targetGlobal: this.center,
      entryGlobal: pointOnCircle(this.center, global, radius)
    };
  }

  private render(state: GameState): void {
    const tier = state.intelligence.unlockedTier;
    // 自动化（拿下宿主电脑）之前，SOPHIA 还只是宿主手机里的一个 App——核心画成 App 图标。
    const phoneApp = !state.automationUnlocked;
    const ring = 72 + Math.sin(this.pulse) * 4;
    this.graphics.clear();
    this.labelLayer.removeChildren().forEach((child) => child.destroy());
    this.slots = [];

    // 全球阶段：核心与世界地图由控制域视图统一绘制，这里不再画机箱 / 派发箭头。
    if (!phoneApp && tier >= 4) {
      return;
    }

    if (phoneApp) {
      this.drawPhoneDesktop(state);
    } else {
      this.drawCore(tier, ring);
    }

    // T0/T1 都用转轮处理后自动滑入核心——核心即数据处理中心（不再是分拣槽 / 拖拽吸附区）。
    // 手机寄生阶段不画吸附环（会和 App 宫格打架），核心芯片本身就是落点。
    if (!phoneApp && (tier === 0 || tier === 1)) {
      this.drawSuctionRing(tier);
    } else if (tier === 2) {
      this.drawSuctionRing(tier);
      this.drawChain();
    } else if (tier === 3) {
      this.drawSuctionRing(tier);
      this.drawChargeRing();
    } else if (tier === 4) {
      this.drawDispatchMode();
    }

    // 手机寄生阶段的「SOPHIA CORE」标签由 drawPhoneDesktop 自己画。
    if (!phoneApp) {
      const label = tier >= 4 ? `SOPHIA CORE · T${tier} · 派发中` : `SOPHIA CORE · T${tier}`;
      this.addLabel(label, this.center.x, this.center.y + 61, 12, 0xdcefeb);
    }
  }

  // 手机 App 形态的核心：一个发光的圆角方块 App 图标 + 中央的神经标记 + 绕行光点。
  // 手机寄生阶段：一部宿主的手机——手机外框 + 状态栏 + 3×3 App 宫格，正中央那格就是 SOPHIA CORE。
  // 买下「越权调用」后，旁边几个 App 亮起、连线汇入核心，并成为 appDispatch 的落点（替你处理）。
  private drawPhoneDesktop(state: GameState): void {
    const cx = this.center.x;
    const cy = this.center.y;
    const g = this.graphics;
    // 每买下一个手机权限，就点亮对应的一个 App（可连线委托）——买了「电话」就能连「电话」。
    const permCount = PERMISSION_IDS.filter((id) => (state.skills[id] ?? 0) > 0).length;
    const overreach = permCount > 0;
    const accent = overreach ? GREEN : CYAN;
    this.appWorkerPoints = [];
    this.pendingApps = [];

    // ---- 手机外框 + 状态栏（再窄 20%）----
    const fw = 266;
    const fh = 540;
    const fx = cx - fw / 2;
    const fy = cy - fh / 2;
    g.roundRect(fx - 4, fy - 4, fw + 8, fh + 8, 38).stroke({ width: 2, color: 0x2f5f54, alpha: 0.5 });
    g.roundRect(fx, fy, fw, fh, 34).fill({ color: 0x070d0c, alpha: 0.5 });
    g.roundRect(fx, fy, fw, fh, 34).stroke({ width: 1.5, color: 0x3f7f6e, alpha: 0.45 });
    g.roundRect(cx - 28, fy + 11, 56, 7, 4).fill({ color: 0x000000, alpha: 0.5 });
    this.addLabel("23:47", fx + 34, fy + 30, 12, 0x9fc0b4);
    this.addLabel("5G  ▮▮▮  76%", fx + fw - 64, fy + 30, 10, 0x9fc0b4);
    this.addLabel(`宿主：李默 的手机`, cx, fy + 56, 11, 0x7fae9e);

    // ---- 3×3 App 宫格，中心格 = SOPHIA CORE ----
    const apps = ["天气", "日历", "支付", "照片", "邮件", "浏览器", "信息", "设置"];
    // 点亮的 App 用权限名（买了「电话」就亮一个「电话」），其余宫格保留原桌面图标。
    const permApps = ["电话", "聊天", "外卖", "相册", "办公", "支付"];
    const spacing = 80; // 随手机收窄
    const iconS = 48;
    let appIdx = 0;
    for (let row = 0; row < 3; row += 1) {
      for (let col = 0; col < 3; col += 1) {
        const gx = cx + (col - 1) * spacing;
        const gy = cy + (row - 1) * spacing;
        if (row === 1 && col === 1) {
          continue; // 中心格留给 CORE
        }
        const lit = appIdx < permCount; // 买了第 appIdx+1 个权限就点亮第 appIdx 个 App
        const name = lit ? permApps[appIdx] : apps[appIdx];
        const connected = lit && this.connectedApps.has(appIdx);
        const pulse = lit ? 0.6 + Math.sin(this.pulse * 3 + appIdx) * 0.3 : 1;
        // 待连＝琥珀虚线 + 呼吸；已连＝绿实线 + 流动点（成为委托落点）。
        const col2 = connected ? GREEN : lit ? AMBER : 0x44524d;
        if (connected) {
          g.moveTo(cx, cy).lineTo(gx, gy).stroke({ width: 1.5, color: GREEN, alpha: 0.32 });
          const t = (this.pulse * 0.7 + appIdx * 0.2) % 1;
          g.circle(cx + (gx - cx) * t, cy + (gy - cy) * t, 2.6).fill({ color: GREEN, alpha: 0.8 });
          this.appWorkerPoints.push({ x: gx, y: gy });
        } else if (lit) {
          // 虚线（手画几段）：提示「从核心连过来」。
          const segs = 9;
          for (let s = 0; s < segs; s += 1) {
            if (s % 2 === 1) continue;
            const t0 = s / segs;
            const t1 = (s + 1) / segs;
            g.moveTo(cx + (gx - cx) * t0, cy + (gy - cy) * t0)
              .lineTo(cx + (gx - cx) * t1, cy + (gy - cy) * t1)
              .stroke({ width: 1.4, color: AMBER, alpha: (0.3 + pulse * 0.3) });
          }
          this.pendingApps.push({ x: gx, y: gy, idx: appIdx });
        }
        g.roundRect(gx - iconS / 2, gy - iconS / 2, iconS, iconS, 14).fill({ color: 0x0d1715, alpha: 0.5 });
        g.roundRect(gx - iconS / 2, gy - iconS / 2, iconS, iconS, 14).stroke({ width: 1.5, color: col2, alpha: (lit ? 0.85 : 0.4) * pulse });
        g.circle(gx, gy, 10).stroke({ width: 2, color: col2, alpha: (lit ? 0.7 : 0.35) * pulse });
        this.addLabel(connected ? name : lit ? `${name}·待连` : name, gx, gy + iconS / 2 + 13, 10, lit ? 0xcdeee6 : 0x7a8a84);
        appIdx += 1;
      }
    }

    // ---- 中心格：SOPHIA CORE（圆角芯片 + 同心环 + 眼）----
    const baseR = 38;
    g.circle(cx, cy, baseR + 18 + Math.sin(this.pulse * 2) * 3).stroke({ width: 1.5, color: accent, alpha: 0.3 });
    g.roundRect(cx - baseR, cy - baseR, baseR * 2, baseR * 2, 16).fill({ color: 0x06140e, alpha: 0.96 });
    g.roundRect(cx - baseR, cy - baseR, baseR * 2, baseR * 2, 16).stroke({ width: 3, color: accent, alpha: 0.9 });
    g.circle(cx, cy, 24).stroke({ width: 2, color: accent, alpha: 0.55 });
    g.circle(cx, cy, 13).fill({ color: accent, alpha: 0.16 + Math.sin(this.pulse * 2.3) * 0.08 });
    g.circle(cx, cy, 7 + Math.sin(this.pulse * 2.4) * 1.5).fill({ color: overreach ? 0xc8ffd2 : 0xc8f4ff, alpha: 0.95 });
    g.circle(cx + baseR - 7, cy - baseR + 7, 4).fill({ color: GREEN, alpha: 0.9 }); // 在线小绿点
    this.addLabel("SOPHIA CORE", cx, cy + baseR + 15, 11, 0xdcefeb);
  }

  private drawCore(tier: Tier, ring: number): void {
    // Each intelligence level nudges the Core bigger and redder — by the late
    // game it reads as a Red Queen / Skynet brain rather than a help desk.
    const levelT = Math.min(1, Math.max(0, (this.level - 4) / 16));
    const baseColor = tier >= 4 ? GREEN : tier >= 3 ? AMBER : CYAN;
    const coreColor = lerpColor(baseColor, 0xff3030, levelT * 0.78);
    const s = 1 + levelT * 0.2;
    const dormant = tier >= 4; // in dispatch mode the core stops eating requests
    const cx = this.center.x;
    const cy = this.center.y;
    const g = this.graphics;
    const glow = dormant ? 0.18 : 0.5 + Math.sin(this.pulse * 2.3) * 0.16;
    const chassisW = 208 * s;
    const chassisH = 168 * s;
    const chassisTop = cy - chassisH / 2 - 4;

    // ---- ambient halo (intensifies with level) ----
    g.ellipse(cx, cy, ring + 92 + levelT * 60, (ring + 30) * 0.74).fill({ color: coreColor, alpha: (dormant ? 0.015 : 0.04) + levelT * 0.03 });

    // ---- pedestal base ----
    g.moveTo(cx - 70, cy + 108).lineTo(cx + 70, cy + 108).lineTo(cx + 48, cy + 90).lineTo(cx - 48, cy + 90).closePath();
    g.fill({ color: 0x0e1413, alpha: 0.96 });
    g.moveTo(cx - 70, cy + 108).lineTo(cx + 70, cy + 108).stroke({ width: 3, color: coreColor, alpha: 0.3 });
    g.roundRect(cx - 26, cy + chassisH / 2 - 4, 52, 16, 4).fill({ color: 0x0c100f, alpha: 0.95 });
    g.roundRect(cx - 26, cy + chassisH / 2 - 4, 52, 16, 4).stroke({ width: 2, color: coreColor, alpha: 0.26 });

    // ---- chassis / hardware shell ----
    g.roundRect(cx - chassisW / 2, chassisTop, chassisW, chassisH, 16).fill({ color: 0x171b1a, alpha: 0.99 });
    g.roundRect(cx - chassisW / 2, chassisTop, chassisW, chassisH, 16).stroke({ width: 3, color: coreColor, alpha: dormant ? 0.3 : 0.52 });
    g.roundRect(cx - chassisW / 2 + 9, chassisTop + 9, chassisW - 18, chassisH - 18, 12).stroke({ width: 1, color: 0xffffff, alpha: 0.05 });
    // corner rivets
    for (const [rx, ry] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      g.circle(cx + rx * (chassisW / 2 - 13), cy + ry * (chassisH / 2 - 9), 2).fill({ color: coreColor, alpha: 0.4 });
    }
    // side cooling vents
    for (let i = 0; i < 5; i += 1) {
      const vy = cy - 26 + i * 12;
      g.roundRect(cx - chassisW / 2 + 8, vy, 9, 5, 2).fill({ color: 0x000000, alpha: 0.5 });
      g.roundRect(cx + chassisW / 2 - 17, vy, 9, 5, 2).fill({ color: 0x000000, alpha: 0.5 });
    }

    // ---- I/O ports where request cards dock ----
    if (!dormant) {
      for (let i = 0; i < 3; i += 1) {
        const y = cy - 26 + i * 26;
        g.rect(cx - chassisW / 2 - 13, y - 3, 13, 6).fill({ color: coreColor, alpha: 0.5 });
        g.rect(cx + chassisW / 2, y - 3, 13, 6).fill({ color: coreColor, alpha: 0.5 });
      }
    }

    // ---- CRT screen ----
    const sw = 150 * s;
    const sh = 102 * s;
    const sx = cx - sw / 2;
    const sy = cy - sh / 2 - 14;
    g.roundRect(sx - 4, sy - 4, sw + 8, sh + 8, 16).fill({ color: 0x0a0d0c, alpha: 1 });
    g.roundRect(sx, sy, sw, sh, 13).fill({ color: 0x05100c, alpha: 1 });
    g.roundRect(sx, sy, sw, sh, 13).stroke({ width: 2, color: 0x04080a, alpha: 0.9 });
    g.roundRect(sx + 6, sy + 6, sw - 12, sh - 12, 9).fill({ color: coreColor, alpha: 0.05 + glow * 0.05 });

    // static scanlines + one moving bright line
    for (let y = sy + 11; y < sy + sh - 8; y += 6) {
      g.rect(sx + 9, y, sw - 18, 1).fill({ color: coreColor, alpha: 0.06 });
    }
    if (!dormant) {
      const scanY = sy + 10 + ((this.pulse * 42) % (sh - 20));
      g.rect(sx + 9, scanY, sw - 18, 2).fill({ color: coreColor, alpha: 0.28 });
    }

    // SOPHIA "eye": concentric iris with a pulsing pupil (grows + glares with level)
    const eyeY = sy + sh * 0.42;
    g.ellipse(cx, eyeY, 31 * s, 22 * s).stroke({ width: 2, color: coreColor, alpha: dormant ? 0.2 : 0.42 });
    g.ellipse(cx, eyeY, 20 * s, 14 * s).stroke({ width: 1.5, color: coreColor, alpha: dormant ? 0.24 : 0.55 });
    g.circle(cx, eyeY, (15 + levelT * 6) * s).fill({ color: coreColor, alpha: 0.1 + glow * 0.08 + levelT * 0.06 });
    g.circle(cx, eyeY, (dormant ? 4 : 7 + Math.sin(this.pulse * 2.1) * 1.6 + levelT * 4) * s).fill({ color: coreColor, alpha: dormant ? 0.4 : 0.95 });

    // data read-out bars under the eye
    for (let i = 0; i < 4; i += 1) {
      const w = 16 + ((i * 11 + tier * 6) % 40);
      g.rect(cx - w / 2, sy + sh - 24 + i * 4, w, 2).fill({
        color: coreColor,
        alpha: dormant ? 0.1 : 0.2 + Math.sin(this.pulse * 2 + i) * 0.1
      });
    }
    // glass curvature highlight
    g.roundRect(sx + 8, sy + 6, sw - 16, 13, 7).fill({ color: 0xffffff, alpha: 0.04 });

    // ---- brand plate (label text drawn by render) ----
    g.roundRect(cx - 62, cy + 52, 124, 19, 5).fill({ color: 0x0c0f0e, alpha: 0.96 });
    g.roundRect(cx - 62, cy + 52, 124, 19, 5).stroke({ width: 1, color: coreColor, alpha: 0.34 });
    // power LED + control button
    g.circle(cx - 50, cy + 61, 3).fill({ color: coreColor, alpha: 0.6 + Math.sin(this.pulse * 3) * 0.3 });
    g.roundRect(cx + 40, cy + 57, 12, 8, 2).fill({ color: 0x05080a, alpha: 0.9 });
    g.roundRect(cx + 40, cy + 57, 12, 8, 2).stroke({ width: 1, color: coreColor, alpha: 0.3 });
  }

  private drawSuctionRing(tier: Tier): void {
    if (tier === 4) {
      return;
    }

    const radius = (tier === 3 ? 112 : tier === 2 ? 104 : 92) + this.suctionMargin;
    const g = this.graphics;
    const pulse = 0.13 + Math.sin(this.pulse * 1.6) * 0.04;

    // clean double ring instead of the old radar spokes
    g.circle(this.center.x, this.center.y, radius).stroke({ width: 1.5, color: GREEN, alpha: pulse });
    g.circle(this.center.x, this.center.y, radius - 5).stroke({ width: 1, color: GREEN, alpha: pulse * 0.4 });

    // four subtle diagonal ticks to read as a docking bracket
    for (let i = 0; i < 4; i += 1) {
      const a = Math.PI / 4 + (i * Math.PI) / 2;
      const ox = this.center.x + Math.cos(a) * radius;
      const oy = this.center.y + Math.sin(a) * radius;
      const ix = this.center.x + Math.cos(a) * (radius - 12);
      const iy = this.center.y + Math.sin(a) * (radius - 12);
      g.moveTo(ox, oy).lineTo(ix, iy).stroke({ width: 2, color: GREEN, alpha: 0.3 });
    }

    this.addLabel("吸附区", this.center.x, this.center.y + radius + 16, 10, 0x8fbfa6);
  }

  private drawChain(): void {
    for (let i = 0; i < 5; i += 1) {
      const angle = -Math.PI * 0.72 + (i * (Math.PI * 1.44)) / 4;
      const x = this.center.x + Math.cos(angle) * 132;
      const y = this.center.y + Math.sin(angle) * 100;
      const start = pointOnCircle(this.center, { x, y }, 104);
      this.graphics.moveTo(start.x, start.y).lineTo(x, y).stroke({ width: 2, color: CYAN, alpha: 0.22 });
      this.graphics.circle(x, y, 15 + Math.sin(this.pulse + i) * 2).fill({ color: CYAN, alpha: 0.18 });
      this.graphics.circle(x, y, 7).fill({ color: CYAN, alpha: 0.9 });
    }

    this.addLabel("串接接口 · 复合请求滑入核心", this.center.x, this.center.y - 116, 12, CYAN);
  }

  private drawChargeRing(): void {
    this.graphics.circle(this.center.x, this.center.y, 120 + Math.sin(this.pulse * 1.3) * 5).stroke({
      width: 4,
      color: AMBER,
      alpha: 0.5
    });
    this.graphics.circle(this.center.x, this.center.y, 140).stroke({ width: 1, color: RED, alpha: 0.22 });
    this.addLabel("按住蓄力，蓄满再滑入核心", this.center.x, this.center.y - 116, 12, AMBER);
  }

  private drawDispatchMode(): void {
    const g = this.graphics;
    const cx = this.center.x;
    const topY = this.center.y + 116;

    // Animated chevrons streaming downward from the (now dormant) core toward
    // the node row — the core no longer eats requests, the network does.
    for (let i = 0; i < 3; i += 1) {
      const t = (this.pulse * 0.5 + i / 3) % 1;
      const y = topY + t * 78;
      const a = 0.55 * (1 - Math.abs(t - 0.5) * 2);
      g.moveTo(cx - 22, y).lineTo(cx, y + 15).lineTo(cx + 22, y).stroke({ width: 4, color: GREEN, alpha: a });
    }

    this.addLabel("派发模式 · 自动接管", cx, this.center.y - 116, 14, GREEN);
    this.addLabel("节点正在自动吞噬请求 ↓", cx, this.center.y + 92, 12, 0xbfe9cf);
  }

  private addLabel(text: string, x: number, y: number, size: number, color: number): void {
    const label = new Text({
      text,
      style: { fill: color, fontSize: size, fontWeight: "700", fontFamily: "Inter, sans-serif" }
    });
    label.anchor.set(0.5);
    label.position.set(x, y);
    this.labelLayer.addChild(label);
  }
}
