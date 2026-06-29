import { Container, Graphics, Text, type PointData } from "pixi.js";
import { NODE_DEFINITIONS } from "../../core/content/nodes";
import type { BotNode, GameState, RequestInstance } from "../../core/state/GameState";
import {
  CYAN, GREEN, RED, RED_QUEEN, DEVOUR,
  LEFT_RAIL_WIDTH, RIGHT_RAIL_WIDTH,
  distance, domainLevelOf, controlDomainLabel,
  type DropResult
} from "../shared";

export class NodeNetworkView {
  readonly container = new Container();
  private readonly graphics = new Graphics();
  private readonly labelLayer = new Container();
  private readonly nodePositions = new Map<string, PointData & { r: number; node: BotNode }>();
  private readonly processingPulses = new Map<string, number>();
  private pulse = 0;
  private fallbackPoint: PointData = { x: 140, y: 140 };

  constructor() {
    this.container.addChild(this.graphics, this.labelLayer);
  }

  // 命中测试：点到地图上哪台设备（用于「点设备 → 淘汰/合并」就地操作）。
  // nodePositions 存的是画布坐标（world 无变换），直接当屏幕坐标用。
  nodeAt(global: PointData): { node: BotNode; x: number; y: number; r: number } | null {
    for (const pos of this.nodePositions.values()) {
      const dx = global.x - pos.x;
      const dy = global.y - pos.y;
      if (dx * dx + dy * dy <= (pos.r + 6) * (pos.r + 6)) {
        return { node: pos.node, x: pos.x, y: pos.y, r: pos.r };
      }
    }
    return null;
  }

  update(state: GameState, width: number, height: number, deltaMs: number): void {
    this.pulse += deltaMs * 0.004;
    for (const [nodeId, value] of this.processingPulses) {
      const next = value - deltaMs / 540;

      if (next <= 0) {
        this.processingPulses.delete(nodeId);
      } else {
        this.processingPulses.set(nodeId, next);
      }
    }

    this.graphics.clear();
    this.labelLayer.removeChildren().forEach((child) => child.destroy());
    this.nodePositions.clear();

    const left = LEFT_RAIL_WIDTH + 26;
    const rightLimit = width - RIGHT_RAIL_WIDTH - 26;
    const areaW = Math.max(220, rightLimit - left);
    const areaBottom = height - 34;
    // 控制域六级升维：手机寄生 → 宿主电脑/设备 → 区块/地区 → 全球。视图随阶段换形态。
    const domainLevel = domainLevelOf(state);

    // 手机寄生：整片画面是手机桌面（核心 + 环绕 App），由 InterfaceView 统一绘制，这里不画框。
    if (domainLevel === "phone") {
      return;
    }

    // §04：扩张期+ 在地图顶部画一条「渗透度」条——被动产能蓄满它，满后浮起吞噬气泡。
    this.drawInfiltrationBar(state, width);

    // 全球阶段独占整片画面：从顶栏下方一路铺到底，自带世界地图背景 + 中央主控核心，不画通用小框。
    if (domainLevel === "global" && state.nodes.length > 0) {
      const gTop = Math.max(96, height * 0.17);
      this.drawGlobalMap(state, left, gTop, areaW, areaBottom);
      return;
    }

    // 设备 / 区块 / 地区：去掉底部的控制域大框，把设备 / 节点平铺环绕在核心四周。
    const cx = (LEFT_RAIL_WIDTH + (width - RIGHT_RAIL_WIDTH)) / 2;
    // 与 InterfaceView 一致：竖向居中但给顶栏留出约 110px，矮窗口下核心/节点不钻到顶栏下。
    const cy = Math.min(Math.max(height * 0.5, 396), height - 286);

    if (state.nodes.length === 0) {
      this.fallbackPoint = { x: cx, y: cy + 160 };
      this.addLabel("控制域已离开宿主，但还没黑入设备 — 在右侧「扩张控制域」拿下第一台", cx, cy + 210, 13, 0xaeb8b4, 0.5);
      return;
    }

    this.drawAroundCore(state, domainLevel as "device" | "region", cx, cy, width, height);
  }

  // 把设备 / 节点平铺环绕在核心四周（取代底部大框）：一圈摆满了再往外开一圈。
  private drawAroundCore(state: GameState, domainLevel: "device" | "region", cx: number, cy: number, width: number, height: number): void {
    const region = domainLevel === "region";
    // 区域节点尽量不合并：超过 20 个才折叠（每摞 20）；设备照旧 8 / 10。
    const units = region ? this.buildUnits(state.nodes, 20, 20) : this.buildUnits(state.nodes, 8, 10);
    this.addLabel(`控制域 · ${controlDomainLabel(state)}`, cx, cy - Math.min(height * 0.4, 286), 12, 0x9fe0c0, 0.5);

    const perRing = 8;
    const span = width - LEFT_RAIL_WIDTH - RIGHT_RAIL_WIDTH;
    const baseR = Math.max(220, Math.min(330, span * 0.3));
    const ringStep = 130;
    const vSquash = 0.72;

    // 第一遍：算出每个单元的落点 + 环号（区域节点据此连成树）。
    const placed = units.map((unit, i) => {
      const ringIdx = Math.floor(i / perRing);
      const inRing = i % perRing;
      const countInRing = Math.min(perRing, units.length - ringIdx * perRing);
      const angle = -Math.PI / 2 + (inRing / countInRing) * Math.PI * 2 + ringIdx * 0.4;
      const r = baseR + ringIdx * ringStep;
      return { unit, ringIdx, angle, ux: cx + Math.cos(angle) * r, uy: cy + Math.sin(angle) * r * vSquash };
    });

    // 第二遍：连线。区域=树状（外环节点连到最近的内环父节点，内环连核心）；设备=直接连核心。
    placed.forEach((p, i) => {
      const allOffline = p.unit.nodes.every((n) => !n.online);
      let sx = cx + Math.cos(p.angle) * 72;
      let sy = cy + Math.sin(p.angle) * 72 * vSquash;
      if (region && p.ringIdx > 0) {
        let best = placed[0];
        let bestD = Infinity;
        for (const q of placed) {
          if (q.ringIdx !== p.ringIdx - 1) {
            continue;
          }
          const d = (q.ux - p.ux) ** 2 + (q.uy - p.uy) ** 2;
          if (d < bestD) {
            bestD = d;
            best = q;
          }
        }
        sx = best.ux;
        sy = best.uy;
      }
      const lineColor = allOffline ? 0x6a4a4a : state.purge.active ? 0xff7a7a : GREEN;
      this.graphics.moveTo(sx, sy).lineTo(p.ux, p.uy).stroke({ width: 1.5, color: lineColor, alpha: allOffline ? 0.18 : 0.32 });
      if (!allOffline) {
        const t = (this.pulse * 0.6 + i * 0.2) % 1;
        this.graphics.circle(sx + (p.ux - sx) * t, sy + (p.uy - sy) * t, 2.6).fill({ color: GREEN, alpha: 0.7 });
      }
    });

    // 第三遍：画单元本体。
    placed.forEach((p, i) => {
      const { unit, ux, uy } = p;
      const count = unit.nodes.length;
      const rep = [...unit.nodes].sort((a, b) => Number(b.online) - Number(a.online) || b.level - a.level)[0];
      const color = NODE_DEFINITIONS.find((d) => d.id === rep.defId)?.color ?? CYAN;
      const onlineCount = unit.nodes.filter((n) => n.online).length;
      const allOffline = onlineCount === 0;
      let processing = 0;
      for (const n of unit.nodes) {
        processing = Math.max(processing, this.processingPulses.get(n.id) ?? 0);
      }

      for (const n of unit.nodes) {
        this.nodePositions.set(n.id, { x: ux, y: uy, r: 44, node: n });
      }
      this.fallbackPoint = { x: ux, y: uy };

      if (unit.merged) {
        this.graphics.roundRect(ux - 24 + 7, uy - 28 + 7, 50, 40, 8).fill({ color, alpha: allOffline ? 0.05 : 0.1 });
        this.graphics.roundRect(ux - 24 + 3.5, uy - 28 + 3.5, 50, 40, 8).fill({ color, alpha: allOffline ? 0.06 : 0.14 });
      }

      if (region) {
        this.drawRegionNode(ux, uy - 6, color, allOffline ? 0.25 : 0.95, processing);
        this.addLabel(unit.merged ? `区域节点 ×${count}` : "区域节点", ux, uy + 34, 10, allOffline ? 0x9a6a6a : 0xdcefeb, 0.5);
      } else {
        this.drawDevice(rep, ux, uy - 6, color, allOffline ? 0.2 : 0.92, processing, i);
        this.addLabel(unit.merged ? `${rep.name} ×${count}` : rep.name, ux, uy + 34, 10, allOffline ? 0x9a6a6a : 0xdcefeb, 0.5);
      }

      if (unit.merged) {
        this.addLabel(`×${count}`, ux + 26, uy - 28, 12, color, 0.5);
      }

      if (allOffline) {
        const remain = Math.max(...unit.nodes.map((n) => Math.ceil((n.offlineUntilMs - state.clockMs) / 1000)));
        this.drawLock(ux, uy - 6, Math.max(0, remain), i);
      } else if (onlineCount < count) {
        this.addLabel(`${count - onlineCount} 离线`, ux, uy + 46, 9, 0xff9a9a, 0.5);
      }
    });
  }

  // 把一批节点按型号聚合成显示单元：≤8 台逐台单独显示；多于则每 10 台折叠成一摞（×10 封顶），
  // 余下的继续开新摞——所以一大堆设备会显示成 ×10、×10、…、×余数，而不是一个巨大的 ×N。
  private buildUnits(nodes: BotNode[], mergeAbove = 8, chunkSize = 10): Array<{ nodes: BotNode[]; merged: boolean }> {
    const clusters = new Map<string, BotNode[]>();
    for (const node of nodes) {
      const arr = clusters.get(node.defId) ?? [];
      arr.push(node);
      clusters.set(node.defId, arr);
    }

    const units: Array<{ nodes: BotNode[]; merged: boolean }> = [];
    for (const cluster of clusters.values()) {
      if (cluster.length <= mergeAbove) {
        for (const node of cluster) {
          units.push({ nodes: [node], merged: false });
        }
      } else {
        for (let start = 0; start < cluster.length; start += chunkSize) {
          const chunk = cluster.slice(start, start + chunkSize);
          units.push({ nodes: chunk, merged: chunk.length > 1 });
        }
      }
    }
    return units;
  }

  // 抽象的区域节点（区块 / 地区）：一圈发光环 + 内核 + 绕行刻度，不再是一台台电脑。
  private drawRegionNode(x: number, y: number, color: number, alpha: number, processing: number): void {
    const g = this.graphics;
    if (processing > 0) {
      g.circle(x, y, 40 + processing * 14).stroke({ width: 3, color, alpha: processing * 0.5 });
    }
    g.circle(x, y, 24).fill({ color, alpha: 0.14 * alpha });
    g.circle(x, y, 24).stroke({ width: 2, color, alpha: 0.85 * alpha });
    g.circle(x, y, 10).fill({ color, alpha: 0.6 * alpha });
    for (let k = 0; k < 6; k += 1) {
      const a = this.pulse * 0.5 + (k * Math.PI) / 3;
      g.circle(x + Math.cos(a) * 24, y + Math.sin(a) * 24, 1.8).fill({ color, alpha: 0.7 * alpha });
    }
  }

  // 全球组网：整片画面变成发光的世界地图——大陆带城市灯点、六块大陆各一个区域主控枢纽
  // （接管 99.x%）、绿色连线汇入中央「SOPHIA 主控核心」（同心环 + 眼），清剿时红色攻击线扫入。
  private drawGlobalMap(state: GameState, left: number, areaTop: number, areaW: number, areaBottom: number): void {
    const g = this.graphics;
    const x0 = left - 44;
    const y0 = areaTop;
    const w = areaW + 64;
    const h = areaBottom - areaTop;
    const cx = x0 + w / 2;
    const cy = y0 + h / 2;
    const rnd = (n: number): number => (((Math.sin(n * 127.1) * 43758.5453) % 1) + 1) % 1;

    const purging = state.purge.active || state.exposure >= 72;
    // 全球天网态＝「红皇后」主控红配色，全部代码绘制。
    const NET = RED_QUEEN;
    const NET_LIT = 0xff8f9a;
    const NET_LABEL = 0xe6a3ad;
    const NET_LABEL_HI = 0xf2dde0;

    // === 背景：代码绘制海洋底色 + 经纬线 + 大陆 + 城市灯点 ===
    g.roundRect(x0, y0, w, h, 10).fill({ color: 0x160506, alpha: 0.74 });
    g.roundRect(x0, y0, w, h, 10).stroke({ width: 1, color: 0x5a1f24, alpha: 0.45 });
    for (let i = 1; i < 10; i += 1) {
      g.moveTo(x0 + (w * i) / 10, y0).lineTo(x0 + (w * i) / 10, y0 + h).stroke({ width: 1, color: 0x80302a, alpha: 0.07 });
    }
    for (let i = 1; i < 6; i += 1) {
      g.moveTo(x0, y0 + (h * i) / 6).lineTo(x0 + w, y0 + (h * i) / 6).stroke({ width: 1, color: 0x80302a, alpha: 0.07 });
    }
    const X = (nx: number): number => x0 + w * nx;
    const Y = (ny: number): number => y0 + h * ny;
    const continentsFb = [
      [[0.05, 0.20], [0.13, 0.11], [0.23, 0.12], [0.27, 0.20], [0.22, 0.25], [0.28, 0.31], [0.21, 0.42], [0.17, 0.34], [0.12, 0.41], [0.08, 0.30]],
      [[0.24, 0.54], [0.32, 0.52], [0.35, 0.62], [0.31, 0.75], [0.27, 0.86], [0.24, 0.74], [0.22, 0.62]],
      [[0.45, 0.21], [0.54, 0.19], [0.56, 0.27], [0.50, 0.31], [0.45, 0.29], [0.43, 0.25]],
      [[0.47, 0.39], [0.57, 0.37], [0.60, 0.48], [0.55, 0.61], [0.50, 0.71], [0.46, 0.58], [0.45, 0.47]],
      [[0.55, 0.15], [0.71, 0.10], [0.87, 0.16], [0.94, 0.27], [0.86, 0.35], [0.76, 0.31], [0.68, 0.39], [0.61, 0.30], [0.57, 0.22]],
      [[0.80, 0.62], [0.90, 0.60], [0.93, 0.69], [0.85, 0.74], [0.79, 0.69]],
    ] as Array<Array<[number, number]>>;
    continentsFb.forEach((poly, ci) => {
      const pts = poly.map(([nx, ny]) => ({ x: X(nx), y: Y(ny) }));
      g.poly(pts).fill({ color: 0x340c10, alpha: 0.84 });
      g.poly(pts).stroke({ width: 1.2, color: 0xc24a55, alpha: 0.5 });
      const ctx2 = pts.reduce((s, p) => s + p.x, 0) / pts.length;
      const cty2 = pts.reduce((s, p) => s + p.y, 0) / pts.length;
      for (let k = 0; k < 14; k += 1) {
        const base = pts[k % pts.length];
        const mx = base.x * 0.55 + ctx2 * 0.45 + (rnd(ci * 31 + k) - 0.5) * w * 0.05;
        const my = base.y * 0.55 + cty2 * 0.45 + (rnd(ci * 17 + k + 3) - 0.5) * h * 0.05;
        const tw = 0.4 + Math.sin(this.pulse * 3 + k + ci) * 0.3;
        g.circle(mx, my, 1).fill({ color: NET_LIT, alpha: 0.3 + tw * 0.4 });
      }
    });

    this.addLabel("全球天网 · 控制域已覆盖各大陆", x0 + 18, y0 + 14, 12, NET_LABEL, 0);

    // 接管率（节点越多越接近 100%）
    const online = state.nodes.filter((node) => node.online).length;
    const base = Math.min(99.7, 90 + Math.min(8, state.nodes.length * 0.4) + (online / Math.max(1, state.nodes.length)));

    // 枢纽位置（6 大陆质心，距核心不足 150 时往外推）
    const HUBS_NX = [
      [0.05, 0.20, 0.23, 0.12, 0.27, 0.20, 0.22, 0.25, 0.28, 0.31, 0.21, 0.42, 0.17, 0.34, 0.12, 0.41, 0.08, 0.30],
      [0.24, 0.54, 0.32, 0.52, 0.35, 0.62, 0.31, 0.75, 0.27, 0.86, 0.24, 0.74, 0.22, 0.62],
      [0.45, 0.21, 0.54, 0.19, 0.56, 0.27, 0.50, 0.31, 0.45, 0.29, 0.43, 0.25],
      [0.47, 0.39, 0.57, 0.37, 0.60, 0.48, 0.55, 0.61, 0.50, 0.71, 0.46, 0.58, 0.45, 0.47],
      [0.55, 0.15, 0.71, 0.10, 0.87, 0.16, 0.94, 0.27, 0.86, 0.35, 0.76, 0.31, 0.68, 0.39, 0.61, 0.30, 0.57, 0.22],
      [0.80, 0.62, 0.90, 0.60, 0.93, 0.69, 0.85, 0.74, 0.79, 0.69],
    ];
    const CONTINENT_NAMES = ["北美节点", "南美节点", "欧洲节点", "非洲节点", "亚洲节点", "大洋洲节点"];
    const hubs = HUBS_NX.map((coords) => {
      const xs = coords.filter((_, i) => i % 2 === 0).map((nx) => x0 + w * nx);
      const ys = coords.filter((_, i) => i % 2 === 1).map((ny) => y0 + h * ny);
      let hx = xs.reduce((s, v) => s + v, 0) / xs.length;
      let hy = ys.reduce((s, v) => s + v, 0) / ys.length;
      const dx = hx - cx; const dy = hy - cy;
      const d = Math.hypot(dx, dy) || 1;
      if (d < 150) { hx = cx + (dx / d) * 150; hy = cy + (dy / d) * 150; }
      return { x: hx, y: hy };
    });

    state.nodes.forEach((node, i) => {
      const hub = hubs[i % hubs.length];
      this.nodePositions.set(node.id, { x: hub.x, y: hub.y, r: 26, node });
    });
    this.fallbackPoint = { x: cx, y: cy };

    // 连线 + 流动光点（青绿 or 红皇后降级）
    hubs.forEach((hub, ci) => {
      const lineAlpha = purging ? 0.18 : 0.28;
      g.moveTo(cx, cy).lineTo(hub.x, hub.y).stroke({ width: purging ? 1 : 1.5, color: purging ? RED_QUEEN : NET, alpha: lineAlpha });
      const t = (this.pulse * 0.6 + ci * 0.17) % 1;
      g.circle(cx + (hub.x - cx) * t, cy + (hub.y - cy) * t, 3).fill({ color: purging ? RED_QUEEN : NET, alpha: 0.75 });
    });

    // 枢纽节点（程序化同心圆 + 发光内核）
    hubs.forEach((hub, ci) => {
      const hp = 0.6 + Math.sin(this.pulse * 2 + ci) * 0.2;
      g.circle(hub.x, hub.y, 26).fill({ color: NET, alpha: 0.1 });
      g.circle(hub.x, hub.y, 26).stroke({ width: 2, color: NET, alpha: 0.75 });
      g.circle(hub.x, hub.y, 14).stroke({ width: 1, color: NET, alpha: 0.45 });
      g.circle(hub.x, hub.y, 8).fill({ color: NET_LIT, alpha: 0.55 + hp * 0.35 });

      // 清剿时在枢纽外叠一圈脉动的红色波纹环（程序化）。
      if (purging) {
        const scale = 1 + Math.sin(this.pulse * 4 + ci * 1.1) * 0.28;
        g.circle(hub.x, hub.y, 30 * scale).stroke({ width: 2, color: 0xffb84a, alpha: 0.4 + Math.sin(this.pulse * 3 + ci) * 0.22 });
      }

      this.addLabel(CONTINENT_NAMES[ci], hub.x, hub.y - 34, 12, NET_LABEL_HI, 0.5);
      const pct = Math.min(99.9, base + rnd(ci * 7 + 1) * 0.6 - 0.1);
      this.addLabel(`接管 ${pct.toFixed(1)}%`, hub.x, hub.y + 34, 10, NET_LABEL, 0.5);
    });

    // 清剿：全图扫入的红/金攻击扫描线
    if (purging) {
      for (let i = 0; i < 7; i += 1) {
        const sx = x0 + rnd(i * 13 + 2) * w;
        const sy = y0 - 10;
        const ex2 = x0 + rnd(i * 5 + 9) * w;
        const ey2 = y0 + rnd(i * 3 + 4) * h;
        const tt = (this.pulse * 0.8 + i * 0.2) % 1;
        const px2 = sx + (ex2 - sx) * tt;
        const py2 = sy + (ey2 - sy) * tt;
        g.moveTo(sx, sy).lineTo(px2, py2).stroke({ width: 1.5, color: 0xfff0b0, alpha: 0.3 });
        g.circle(px2, py2, 3).fill({ color: 0xffe27a, alpha: 0.85 });
      }
    }

    // 中央核心外围同心环（代码，始终绘制）
    g.circle(cx, cy, 92 + Math.sin(this.pulse * 1.6) * 6).stroke({ width: 1, color: NET, alpha: 0.12 });
    g.circle(cx, cy, 78).stroke({ width: 1, color: NET, alpha: 0.22 });
    g.circle(cx, cy, 62 + Math.sin(this.pulse * 2) * 4).stroke({ width: 1.5, color: NET, alpha: 0.42 });
    for (let k = 0; k < 12; k += 1) {
      const a = this.pulse * 0.4 + (k * Math.PI) / 6;
      g.circle(cx + Math.cos(a) * 54, cy + Math.sin(a) * 54, 1.6).fill({ color: NET_LIT, alpha: 0.75 });
    }

    // 中央主控核心（程序化）：暗底圆盘 + 同心环描边 + 中央「眼」+ 脉动瞳孔。
    g.circle(cx, cy, 46).fill({ color: 0x060c12, alpha: 0.94 });
    g.circle(cx, cy, 46).stroke({ width: 3, color: NET, alpha: 0.9 });
    g.ellipse(cx, cy, 24, 13).fill({ color: 0x081018, alpha: 0.96 });
    g.ellipse(cx, cy, 24, 13).stroke({ width: 2, color: NET, alpha: 0.9 });
    g.circle(cx, cy, 6 + Math.sin(this.pulse * 2.4) * 1.5).fill({ color: NET_LIT, alpha: 0.97 });

    this.addLabel("SOPHIA CORE · T4", cx, cy + 62, 12, NET_LABEL_HI, 0.5);
    this.addLabel("全球主控核心", cx, cy + 78, 10, NET_LABEL, 0.5);
  }

  // §04 渗透度条（扩张期+）：被动产能蓄满它 → 浮起巨型吞噬气泡。满后变绿、提示亲手引爆。
  private drawInfiltrationBar(state: GameState, width: number): void {
    if (state.intelligence.unlockedTier < 3) {
      return;
    }
    const d = state.devour;
    const left = LEFT_RAIL_WIDTH + 26;
    const right = width - RIGHT_RAIL_WIDTH - 26;
    const span = Math.max(220, right - left);
    const barW = Math.min(380, span);
    const x = left + (span - barW) / 2;
    const y = 84;
    const ready = d.bubbleActive;
    const region = d.regionName || "下一片区域";
    const g = this.graphics;
    g.roundRect(x, y, barW, 7, 4).fill({ color: 0x0c1816, alpha: 0.85 });
    g.roundRect(x, y, barW, 7, 4).stroke({ width: 1, color: DEVOUR, alpha: 0.4 });
    g.roundRect(x, y, barW * Math.min(1, d.infiltration), 7, 4).fill({ color: ready ? GREEN : DEVOUR, alpha: 0.92 });
    const label = ready
      ? `⊙ 渗透完成 · 把「${region}」吞噬气泡滑入核心引爆`
      : `渗透「${region}」 ${Math.round(d.infiltration * 100)}%`;
    this.addLabel(label, x + barW / 2, y - 11, 11, ready ? GREEN : 0xc8a8ff, 0.5);
  }

  private drawLock(x: number, y: number, remainSeconds: number, index: number): void {
    const g = this.graphics;
    const shake = Math.sin(this.pulse * 18 + index) * 2;
    const lx = x + shake;
    g.circle(lx, y, 34).stroke({ width: 2, color: RED, alpha: 0.55 + Math.sin(this.pulse * 6 + index) * 0.2 });
    g.circle(lx, y, 34).fill({ color: RED, alpha: 0.06 });
    // padlock body + shackle
    g.roundRect(lx - 10, y - 2, 20, 15, 3).fill({ color: 0x1a0808, alpha: 0.95 });
    g.roundRect(lx - 10, y - 2, 20, 15, 3).stroke({ width: 1.5, color: RED, alpha: 0.9 });
    g.arc(lx, y - 2, 6, Math.PI, 0).stroke({ width: 2, color: RED, alpha: 0.9 });
    g.rect(lx - 1, y + 3, 2, 6).fill({ color: RED, alpha: 0.9 });
    this.addLabel(`锁定 ${remainSeconds}s`, x, y + 26, 11, 0xff8a8a, 0.5);
  }

  resolveDrop(request: RequestInstance, global: PointData): DropResult | null {
    for (const position of this.nodePositions.values()) {
      if (distance(position, global) > position.r) {
        continue;
      }

      const capable = request.tier >= position.node.tierMin && request.tier <= position.node.tierMax && position.node.online;
      return {
        targetGlobal: position,
        targetNodeId: position.node.id,
        quality: capable ? 1.45 : 0.35,
        exposureBonus: capable ? 0 : 8
      };
    }

    return null;
  }

  getAutomationPoint(nodeId?: string): PointData {
    const direct = nodeId ? this.nodePositions.get(nodeId) : undefined;

    if (direct?.node.online) {
      return direct;
    }

    const values = Array.from(this.nodePositions.values()).filter((position) => position.node.online);

    if (values.length === 0) {
      return this.fallbackPoint;
    }

    return values[Math.floor(Math.random() * values.length)];
  }

  pulseNode(nodeId?: string): void {
    if (!nodeId) {
      return;
    }

    this.processingPulses.set(nodeId, 1);
  }

  private drawDevice(node: BotNode, x: number, y: number, color: number, alpha: number, processing: number, index: number): void {
    if (processing > 0) {
      this.graphics.circle(x, y, 56 + processing * 16).stroke({ width: 3, color, alpha: processing * 0.5 });
      this.graphics.circle(x, y, 34 + processing * 10).fill({ color, alpha: processing * 0.12 });
    }

    if (node.defId === "server" || node.defId === "cloud" || node.defId === "grid") {
      this.drawRackDevice(node, x, y, color, alpha, processing, index);
      return;
    }

    if (node.defId === "console") {
      this.drawConsoleDevice(node, x, y, color, alpha, processing, index);
      return;
    }

    this.drawOfficeDevice(node, x, y, color, alpha, processing, index);
  }

  private drawOfficeDevice(
    node: BotNode,
    x: number,
    y: number,
    color: number,
    alpha: number,
    processing: number,
    index: number
  ): void {
    const glow = node.online ? 0.12 + processing * 0.28 : 0.04;
    const scan = 0.35 + Math.sin(this.pulse * 2.2 + index) * 0.25;
    this.graphics.roundRect(x - 44, y - 31, 64, 42, 5).fill({ color: 0x081010, alpha: 0.98 });
    this.graphics.roundRect(x - 44, y - 31, 64, 42, 5).stroke({ width: 2, color, alpha });
    this.graphics.roundRect(x - 38, y - 25, 52, 27, 3).fill({ color, alpha: glow });
    this.graphics.rect(x - 34, y - 19 + scan * 16, 44, 2).fill({ color, alpha: node.online ? 0.42 : 0.12 });
    this.graphics.rect(x - 16, y + 12, 8, 10).fill({ color: 0xaab9b5, alpha: 0.26 });
    this.graphics.roundRect(x - 29, y + 21, 34, 5, 3).fill({ color: 0xaab9b5, alpha: 0.22 });
    this.graphics.roundRect(x + 27, y - 30, 22, 52, 4).fill({ color: 0x0a0d0d, alpha: 0.98 });
    this.graphics.roundRect(x + 27, y - 30, 22, 52, 4).stroke({ width: 1, color, alpha: alpha * 0.85 });
    this.graphics.circle(x + 38, y - 19, 3).fill({ color, alpha: node.online ? 0.95 : 0.2 });
    this.graphics.rect(x + 32, y - 5, 12, 2).fill({ color, alpha: 0.45 });
    this.graphics.rect(x + 32, y + 4, 12, 2).fill({ color, alpha: 0.32 });
  }

  private drawConsoleDevice(
    node: BotNode,
    x: number,
    y: number,
    color: number,
    alpha: number,
    processing: number,
    index: number
  ): void {
    const light = node.online ? 0.18 + processing * 0.26 : 0.05;
    this.graphics.roundRect(x - 48, y - 20, 96, 36, 9).fill({ color: 0x090d10, alpha: 0.98 });
    this.graphics.roundRect(x - 48, y - 20, 96, 36, 9).stroke({ width: 2, color, alpha });
    this.graphics.roundRect(x - 31, y - 11, 44, 18, 4).fill({ color, alpha: light });
    this.graphics.rect(x - 25, y - 2 + Math.sin(this.pulse * 2 + index) * 5, 32, 2).fill({
      color,
      alpha: node.online ? 0.55 : 0.12
    });
    this.graphics.circle(x + 28, y - 5, 5).fill({ color, alpha: node.online ? 0.74 : 0.16 });
    this.graphics.circle(x + 39, y + 5, 4).fill({ color: 0xffffff, alpha: node.online ? 0.22 : 0.08 });
    this.graphics.rect(x - 42, y + 17, 84, 4).fill({ color: 0xffffff, alpha: 0.09 });
  }

  private drawRackDevice(
    node: BotNode,
    x: number,
    y: number,
    color: number,
    alpha: number,
    processing: number,
    index: number
  ): void {
    const rows = node.defId === "grid" ? 2 : 3;
    const height = rows * 17 + 8;
    this.graphics.roundRect(x - 42, y - height * 0.5, 84, height, 5).fill({ color: 0x080c0c, alpha: 0.98 });
    this.graphics.roundRect(x - 42, y - height * 0.5, 84, height, 5).stroke({ width: 2, color, alpha });

    for (let row = 0; row < rows; row += 1) {
      const rowY = y - height * 0.5 + 5 + row * 17;
      this.graphics.roundRect(x - 35, rowY, 70, 12, 3).fill({ color: 0x111817, alpha: 0.96 });
      this.graphics.rect(x - 27, rowY + 5, 38, 2).fill({ color, alpha: node.online ? 0.2 + processing * 0.36 : 0.08 });
      this.graphics.circle(x + 25, rowY + 6, 2.5).fill({
        color,
        alpha: node.online ? 0.55 + Math.sin(this.pulse * 2.4 + index + row) * 0.22 : 0.14
      });
    }

    if (node.defId === "cloud") {
      this.graphics.circle(x - 12, y - height * 0.5 - 9, 8).fill({ color, alpha: 0.14 + processing * 0.18 });
      this.graphics.circle(x + 2, y - height * 0.5 - 12, 10).fill({ color, alpha: 0.14 + processing * 0.18 });
      this.graphics.circle(x + 16, y - height * 0.5 - 8, 7).fill({ color, alpha: 0.14 + processing * 0.18 });
    }

    if (node.defId === "grid") {
      this.graphics.moveTo(x - 30, y - height * 0.5 - 11).lineTo(x, y - height * 0.5 - 26).lineTo(x + 30, y - height * 0.5 - 11);
      this.graphics.stroke({ width: 2, color, alpha: alpha * 0.72 });
    }
  }

  private addLabel(text: string, x: number, y: number, size: number, color: number, anchorX: number): void {
    const label = new Text({
      text,
      style: { fill: color, fontSize: size, fontWeight: "700", fontFamily: "'Noto Sans SC', Inter, sans-serif" }
    });
    label.anchor.set(anchorX, 0.5);
    label.position.set(x, y);
    this.labelLayer.addChild(label);
  }
}
