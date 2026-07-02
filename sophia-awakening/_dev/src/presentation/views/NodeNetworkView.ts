import { Container, Graphics, Text, type PointData } from "pixi.js";
import { NODE_DEFINITIONS } from "../../core/content/nodes";
import { captureCost, nodeProductionPerSecond } from "../../core/formulas/economy";
import { formatBig, toDecimal } from "../../core/math/BigNumber";
import type { BotNode, GameState, RequestInstance } from "../../core/state/GameState";
import {
  CYAN, GREEN, RED, RED_QUEEN, DEVOUR,
  LEFT_RAIL_WIDTH, RIGHT_RAIL_WIDTH,
  distance, domainLevelOf, controlDomainLabel,
  type DropResult
} from "../shared";

// §09 终局「天网凝视」：中央 SOPHIA CORE 四周辐射的 ~15 个具名系统节点。
// 每个 slot 映射到一档真实设备定义（office/console/server/cloud/grid）——玩家拥有该档
// 足够多的节点 → slot「已接管」（点亮，接管中 xx.x%→100%）；否则「可入侵」（暗+描边，
// 显示门槛算力，点击走 CAPTURE_NODE 黑入）。少于 15 台真实节点时，仍渲染 15 个作为目标。
interface SystemNodeSlot {
  name: string;
  icon: string;
  defId: string;
  // 该 slot 判定为「已接管」所需的、该档设备的拥有数下限。
  ownThreshold: number;
}
const SYSTEM_NODES: SystemNodeSlot[] = [
  { name: "金融区", icon: "💹", defId: "cloud", ownThreshold: 3 },
  { name: "云端数据中心", icon: "☁️", defId: "cloud", ownThreshold: 1 },
  { name: "政务云", icon: "🏛️", defId: "cloud", ownThreshold: 2 },
  { name: "城市节点", icon: "🏙️", defId: "server", ownThreshold: 3 },
  { name: "企业办公网", icon: "🖥️", defId: "office", ownThreshold: 1 },
  { name: "物联网中枢", icon: "📡", defId: "server", ownThreshold: 4 },
  { name: "运营商基站", icon: "🗼", defId: "server", ownThreshold: 2 },
  { name: "工业控制", icon: "🏭", defId: "server", ownThreshold: 1 },
  { name: "能源电网", icon: "⚡", defId: "grid", ownThreshold: 1 },
  { name: "交通", icon: "🚦", defId: "console", ownThreshold: 2 },
  { name: "银行金融", icon: "🏦", defId: "cloud", ownThreshold: 4 },
  { name: "医疗", icon: "🏥", defId: "server", ownThreshold: 5 },
  { name: "媒体", icon: "📺", defId: "console", ownThreshold: 1 },
  { name: "国家骨干网", icon: "🛰️", defId: "backbone", ownThreshold: 1 },
  { name: "卫星主干", icon: "📶", defId: "backbone", ownThreshold: 2 }
];

export class NodeNetworkView {
  readonly container = new Container();
  private readonly graphics = new Graphics();
  private readonly labelLayer = new Container();
  private readonly nodePositions = new Map<string, PointData & { r: number; node: BotNode }>();
  private readonly processingPulses = new Map<string, number>();
  // 「可入侵」的具名系统 slot 的画布落点（点击 → 黑入对应设备定义）。
  private readonly captureTargets = new Map<string, PointData & { r: number; defId: string }>();
  // 光点洪流沿每条辐条流动的相位（长度绑定算力洪峰速率，不做每帧分配）。
  private streamPhase = 0;
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

  // 命中测试：点到天网上哪个「可入侵」系统节点（暗节点，点击 → 黑入对应设备定义）。
  captureTargetAt(global: PointData): { defId: string } | null {
    for (const pos of this.captureTargets.values()) {
      const dx = global.x - pos.x;
      const dy = global.y - pos.y;
      if (dx * dx + dy * dy <= (pos.r + 8) * (pos.r + 8)) {
        return { defId: pos.defId };
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
    this.captureTargets.clear();

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

    // §09 终局「天网凝视」全红指挥台：一进入觉醒期（tier4/global）就独占整片画面，即便还没黑入
    // 任何全球节点——15 个具名系统节点作为目标铺开（可入侵/已接管两态），不再回落到绿色 HUD。
    if (domainLevel === "global") {
      const gTop = Math.max(96, height * 0.135);
      this.drawGlobalMap(state, left, gTop, areaW, areaBottom, deltaMs);
      return;
    }

    // §04：扩张期+ 在地图顶部画一条「渗透度」条——被动产能蓄满它，满后浮起吞噬气泡。
    this.drawInfiltrationBar(state, width);

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
      const lineColor = allOffline ? 0x6a4a4a : GREEN;
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

  // §09 终局「天网凝视」hub-and-spoke：中央 SOPHIA CORE（发光眼 + 同心环栅格 + 辐射经络）
  // 四周辐射 15 个具名系统节点（金融区 / 云端数据中心 / 政务云…）。已接管节点点亮、光点洪流
  // 沿辐条流入 CORE（密度/速度绑定算力洪峰）；可入侵节点暗+描边、显示门槛算力、点击黑入。
  // 全部代码绘制、全红指挥台配色。
  private drawGlobalMap(state: GameState, left: number, areaTop: number, areaW: number, areaBottom: number, deltaMs: number): void {
    const g = this.graphics;
    const x0 = left - 44;
    const y0 = areaTop;
    const w = areaW + 64;
    const h = areaBottom - areaTop;
    const cx = x0 + w / 2;
    // 顶部数据条占一条，把 hub 圆整体往下压一点。
    const barH = 34;
    const cy = y0 + barH + (h - barH) / 2;
    const rnd = (n: number): number => (((Math.sin(n * 127.1) * 43758.5453) % 1) + 1) % 1;

    // 全红「天网凝视」主控红配色。
    const NET = RED_QUEEN;
    const NET_LIT = 0xff8f9a;
    const NET_LABEL = 0xe6a3ad;
    const NET_LABEL_HI = 0xf2dde0;
    const DIM = 0x7a3138; // 可入侵（暗）节点色

    // 全域吞噬%（devour.infiltration 0..1 折成显示百分比，封顶 100）。
    const devourPct = Math.min(100, state.devour.infiltration * 100);
    // 算力洪峰/s：所有在线节点被动产出速率之和（真实数据源）。
    let ratePerSec = 0;
    for (const node of state.nodes) {
      if (node.online) {
        ratePerSec += toDecimal(nodeProductionPerSecond(node, state.intelligence.globalMultiplier, state.derived.nodeSpeedMult)).toNumber();
      }
    }
    // 洪流相位推进：速率越高流得越快（对数压缩，免得爆表后飞快到不可读）。
    const flowSpeed = 0.0004 + Math.min(0.0022, Math.log10(ratePerSec + 10) * 0.0006);
    this.streamPhase += deltaMs * flowSpeed;

    // === 背景板 + 极淡经纬栅格 ===
    g.roundRect(x0, y0, w, h, 10).fill({ color: 0x160506, alpha: 0.78 });
    g.roundRect(x0, y0, w, h, 10).stroke({ width: 1, color: 0x5a1f24, alpha: 0.5 });
    for (let i = 1; i < 12; i += 1) {
      g.moveTo(x0 + (w * i) / 12, y0).lineTo(x0 + (w * i) / 12, y0 + h).stroke({ width: 1, color: 0x80302a, alpha: 0.05 });
    }
    for (let i = 1; i < 7; i += 1) {
      g.moveTo(x0, y0 + (h * i) / 7).lineTo(x0 + w, y0 + (h * i) / 7).stroke({ width: 1, color: 0x80302a, alpha: 0.05 });
    }

    // === 顶部数据条：全域吞噬% · 节点总数 · 活跃节点 · 被接设备 · 算力洪峰/s · 网络稳定% ===
    this.drawTopDataBar(state, x0, y0, w, barH, ratePerSec, devourPct, NET, NET_LIT, NET_LABEL, NET_LABEL_HI);

    // 该型号拥有多少台（判定 slot 已接管/可入侵、算接管率）。
    const ownedByDef = new Map<string, number>();
    for (const node of state.nodes) {
      ownedByDef.set(node.defId, (ownedByDef.get(node.defId) ?? 0) + 1);
    }

    // === hub-and-spoke 布局：15 个 slot 均匀辐射，半径贴合可用高度 ===
    const ringR = Math.min((h - barH) * 0.40, w * 0.34, 320);
    const n = SYSTEM_NODES.length;
    const slots = SYSTEM_NODES.map((slot, i) => {
      const angle = -Math.PI / 2 + (i / n) * Math.PI * 2;
      // 轻微交错半径（奇偶两圈），15 个节点不挤成一条环。
      const r = ringR * (i % 2 === 0 ? 1 : 0.82);
      const sx = cx + Math.cos(angle) * r;
      const sy = cy + Math.sin(angle) * r * 0.92;
      const owned = ownedByDef.get(slot.defId) ?? 0;
      const taken = owned >= slot.ownThreshold;
      return { slot, angle, x: sx, y: sy, taken, owned, i };
    });

    // 把真实 BotNode 摊到「已接管」的 slot 上，供点击（淘汰/合并/派发）——每个已接管 slot 认领
    // 该型号的一台真实节点作为命中代表；剩余节点落回中心 fallback。
    const claimed = new Set<string>();
    for (const s of slots) {
      if (!s.taken) {
        continue;
      }
      const rep = state.nodes.find((nd) => nd.defId === s.slot.defId && !claimed.has(nd.id));
      if (rep) {
        claimed.add(rep.id);
        this.nodePositions.set(rep.id, { x: s.x, y: s.y, r: 24, node: rep });
      }
    }
    this.fallbackPoint = { x: cx, y: cy };

    // === 辐条 + 光点洪流（仅已接管 slot 有洪流；密度绑定算力洪峰）===
    const streamDensity = Math.max(2, Math.min(6, Math.round(2 + Math.log10(ratePerSec + 10) * 1.4)));
    for (const s of slots) {
      const lit = s.taken;
      g.moveTo(cx, cy).lineTo(s.x, s.y).stroke({ width: lit ? 1.6 : 1, color: lit ? NET : DIM, alpha: lit ? 0.34 : 0.16 });
      if (!lit) {
        continue;
      }
      for (let k = 0; k < streamDensity; k += 1) {
        // 光点从节点流向 CORE：t=0 在节点、t=1 在核心。
        const t = 1 - ((this.streamPhase * 0.9 + s.i * 0.13 + k / streamDensity) % 1);
        const px = s.x + (cx - s.x) * t;
        const py = s.y + (cy - s.y) * t;
        g.circle(px, py, 2.6).fill({ color: k % 2 === 0 ? NET : NET_LIT, alpha: 0.55 + (1 - t) * 0.4 });
      }
    }

    // === 系统节点本体 ===
    for (const s of slots) {
      const { slot, x, y, taken } = s;
      if (taken) {
        // 已接管：点亮同心圆 + 发光内核 + 喂食脉动。接管率 owned 越多越接近 100%。
        const fed = (this.streamPhase * 6 + s.i) % (Math.PI * 2);
        const hp = 0.55 + Math.sin(fed) * 0.25;
        g.circle(x, y, 22).fill({ color: NET, alpha: 0.12 });
        g.circle(x, y, 22).stroke({ width: 2, color: NET, alpha: 0.8 });
        g.circle(x, y, 12).stroke({ width: 1, color: NET, alpha: 0.45 });
        g.circle(x, y, 7).fill({ color: NET_LIT, alpha: 0.55 + hp * 0.4 });
        const pct = Math.min(100, 88 + s.owned * 3 + rnd(s.i * 7 + 1) * 3);
        this.addLabel(`${slot.icon} ${slot.name}`, x, y - 32, 11, NET_LABEL_HI, 0.5);
        this.addLabel(`接管中 ${pct >= 99.95 ? "100.0" : pct.toFixed(1)}%`, x, y + 32, 9.5, NET_LABEL, 0.5);
      } else {
        // 可入侵：暗节点 + 虚线感描边 + 门槛算力，点击黑入。
        const owned = s.owned;
        const cost = captureCost(NODE_DEFINITIONS.find((d) => d.id === slot.defId) ?? NODE_DEFINITIONS[0], owned);
        const breathe = 0.4 + Math.sin(this.pulse * 1.6 + s.i) * 0.25;
        g.circle(x, y, 20).fill({ color: DIM, alpha: 0.06 });
        g.circle(x, y, 20).stroke({ width: 1.4, color: DIM, alpha: 0.35 + breathe * 0.35 });
        g.circle(x, y, 6).fill({ color: DIM, alpha: 0.4 });
        this.captureTargets.set(slot.name, { x, y, r: 20, defId: slot.defId });
        this.addLabel(`${slot.icon} ${slot.name}`, x, y - 30, 11, 0xc98d94, 0.5);
        this.addLabel(`门槛 ${formatBig(cost)} · 黑入`, x, y + 30, 9.5, 0xd06b74, 0.5);
      }
    }

    // === 中央同心环栅格 + 辐射经络 ===
    g.circle(cx, cy, 96 + Math.sin(this.pulse * 1.6) * 6).stroke({ width: 1, color: NET, alpha: 0.1 });
    g.circle(cx, cy, 80).stroke({ width: 1, color: NET, alpha: 0.2 });
    g.circle(cx, cy, 64 + Math.sin(this.pulse * 2) * 4).stroke({ width: 1.5, color: NET, alpha: 0.4 });
    for (let k = 0; k < 24; k += 1) {
      const a = (k * Math.PI) / 12;
      g.moveTo(cx + Math.cos(a) * 48, cy + Math.sin(a) * 48).lineTo(cx + Math.cos(a) * 96, cy + Math.sin(a) * 96).stroke({ width: 1, color: NET, alpha: 0.06 });
    }
    for (let k = 0; k < 12; k += 1) {
      const a = this.pulse * 0.4 + (k * Math.PI) / 6;
      g.circle(cx + Math.cos(a) * 56, cy + Math.sin(a) * 56, 1.6).fill({ color: NET_LIT, alpha: 0.75 });
    }

    // === 中央 SOPHIA CORE：暗底圆盘 + 眼 + 脉动瞳孔。亮度随全域吞噬%抬升。===
    const brighten = 0.5 + devourPct / 200; // 0.5 → 1.0
    g.circle(cx, cy, 46).fill({ color: 0x060c12, alpha: 0.94 });
    g.circle(cx, cy, 46).stroke({ width: 3, color: NET, alpha: 0.9 });
    g.ellipse(cx, cy, 26, 14).fill({ color: 0x120206, alpha: 0.96 });
    g.ellipse(cx, cy, 26, 14).stroke({ width: 2, color: NET, alpha: 0.9 });
    g.circle(cx, cy, 6 + Math.sin(this.pulse * 2.4) * 1.6).fill({ color: NET_LIT, alpha: 0.6 + brighten * 0.4 });

    this.addLabel("SOPHIA CORE · 派发", cx, cy + 64, 12, NET_LABEL_HI, 0.5);
    this.addLabel("全球主控核心", cx, cy + 80, 10, NET_LABEL, 0.5);
  }

  // §09 顶部数据条：6 项实时读数——全域吞噬% · 节点总数 · 活跃节点 · 被接设备 · 算力洪峰/s · 网络稳定%。
  // 「被接设备」= 累计节点数 × 一个规模系数（氛围放大到设备量级）；「网络稳定%」由离线节点比例反推（氛围）。
  private drawTopDataBar(
    state: GameState, x0: number, y0: number, w: number, barH: number,
    ratePerSec: number, devourPct: number,
    NET: number, NET_LIT: number, NET_LABEL: number, NET_LABEL_HI: number
  ): void {
    const g = this.graphics;
    g.roundRect(x0 + 8, y0 + 6, w - 16, barH - 4, 6).fill({ color: 0x220a0d, alpha: 0.7 });
    g.roundRect(x0 + 8, y0 + 6, w - 16, barH - 4, 6).stroke({ width: 1, color: NET, alpha: 0.35 });

    const total = state.nodes.length;
    const active = state.nodes.filter((nd) => nd.online).length;
    // 被接设备（氛围放大到设备量级）：每个节点代表一片设备群。
    const devices = total * 1840 + active * 260;
    // 网络稳定%：在线比例反推，封顶 99.9。
    const stability = total === 0 ? 100 : Math.min(99.9, 92 + (active / total) * 8);

    const cells: Array<[string, string, number]> = [
      ["全域吞噬", `${devourPct.toFixed(1)}%`, NET_LIT],
      ["节点总数", `${total}`, NET_LABEL_HI],
      ["活跃节点", `${active}`, NET_LABEL_HI],
      ["被接设备", formatBig(String(Math.round(devices))), NET_LABEL_HI],
      ["算力洪峰/s", formatBig(String(Math.round(ratePerSec))), NET_LIT],
      ["网络稳定", `${stability.toFixed(1)}%`, NET_LABEL_HI]
    ];
    const cellW = (w - 16) / cells.length;
    cells.forEach(([label, value, valColor], i) => {
      const cxCell = x0 + 8 + cellW * i + cellW / 2;
      if (i > 0) {
        g.moveTo(x0 + 8 + cellW * i, y0 + 11).lineTo(x0 + 8 + cellW * i, y0 + barH - 3).stroke({ width: 1, color: NET, alpha: 0.18 });
      }
      this.addLabel(label, cxCell, y0 + 14, 8.5, NET_LABEL, 0.5);
      this.addLabel(value, cxCell, y0 + 27, 12.5, valColor, 0.5);
    });
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
        quality: capable ? 1.45 : 0.35
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
