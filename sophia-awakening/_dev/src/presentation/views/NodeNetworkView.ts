import { Container, Graphics, Text, type PointData } from "pixi.js";
import { NODE_DEFINITIONS } from "../../core/content/nodes";
import {
  skynetSectors, slotTaken, sectorFallen, skynetTakenCount, skynetSlotCount,
  type SkynetSlot, type SkynetSector
} from "../../core/content/skynet";
import { captureCost, nodeProductionPerSecond } from "../../core/formulas/economy";
import { add, big, div, formatBig, gt, mul, toDecimal } from "../../core/math/BigNumber";
import { TUNING } from "../../core/tuning";
import type { BotNode, GameState, RequestInstance } from "../../core/state/GameState";
import {
  CYAN, GREEN, RED, RED_QUEEN, DEVOUR,
  LEFT_RAIL_WIDTH, RIGHT_RAIL_WIDTH,
  distance, domainLevelOf, controlDomainLabel, lerpColor,
  type DropResult
} from "../shared";

// §09 阶梯四·天网收割「五域三波」：中央 SOPHIA CORE 四周按 5 个域（城市/金融/工业/信息/骨干）辐射
// 15 个系统节点，每域 3 格占一个 72° 楔形。数据全部来自 content/skynet.ts（五域定义 + 门槛 + 域陷落线），
// 不再硬编码在本视图。一格 owned>=门槛=「已接管」（点亮，接管中%）；否则「可入侵」（暗，点击→入侵序列）。

// 单格入侵序列的动画态（乱码扫描 → 进度闪烁环 → 完成回调）。
interface HackState {
  t: number; // 已过秒
  dur: number; // 序列时长（成功 0.5s / 拒绝 0.28s）
  success: boolean; // 算力/等级足够=真入侵；否则只播「拒绝」红抖
  fired: boolean; // 完成回调是否已触发
  glyph: string; // 当前帧的乱码串
  onDone: () => void;
}
// 一次性扩散冲击波（入侵成功时在该格炸开）。
interface Shockwave {
  x: number;
  y: number;
  t: number;
}
// 乱码字符池（hex + 片假名感），入侵序列滚动用。
const SCRAMBLE_CHARS = "0123456789ABCDEF｢｣ｦｧｨｩｪｫﾂﾃﾀｱｲｳｴｵﾉﾊﾋﾎ日月火水木金土";

// ==== §09「收割风暴」：终局天网屏的真实收益数据包雨 ====
// AUTOMATION_PAYOUT（core 每 TUNING.automationEmitMs 聚合一次的真金白银）经 App.feedHarvest 喂入，
// 按各已接管格的真实产出占比拆成一批「收割脉冲」卡片包，错峰从格子沿轻弧飞向核心；到站弹「+X」浮字
// （字号/亮度随 log 量级），核心微胀 + 瞳孔闪。全部池化：无每帧分配、无 gsap，相位计数器驱动。
interface HarvestPacket {
  active: boolean;
  delay: number; // 出发前错峰秒数（同一 payout 窗口内摊开）
  t: number; // 0..1 飞行进度
  dur: number;
  sx: number; sy: number; // 出发点（域格）
  qx: number; qy: number; // 贝塞尔控制点（轻微侧弧）
  angle: number; // 出发格相对核心的方位角（浮字落在核心环对应侧）
  valueText: string; // 预格式化「+X」（spawn 时算好，不在帧循环里 format）
  mag: number; // log10 量级：字号/亮度/满池丢弃优先级
  combo: boolean; // 连锁波包（同域三格齐发，更亮）
}
interface HarvestFloat {
  active: boolean;
  t: number;
  dur: number;
  x: number;
  y: number;
  mag: number;
  label: Text;
}
const MAX_PACKETS = 24; // 在飞数据包硬上限（满则丢量级最低的）
const MAX_FLOATS = 16; // 浮字硬上限（满则丢量级最低的）

// §09 天网收割「请求洪流」——玩家点/扫亲手收割的待处理蜂群（core 的 flood 请求包在此可视化）。
// 从某个已陷落域格涌向核心、汇成绕核蜂群等待收割；点/扫一下即引爆入核（fast fly-in + 爆裂 + 浮字）。
interface FloodViz {
  id: string;
  x: number; y: number;     // 当前屏幕坐标（供命中测试）
  angle: number;            // 绕核轨道角
  r: number;                // 当前距核半径
  bandR: number;            // 目标绕核轨道半径（核外的待收割带）
  sx: number; sy: number;   // 出生点（某已接管域格）
  drift: number;            // 0..1 从域格漂到轨道带
  orbitSpeed: number;       // 绕核角速度（带符号）
  bob: number;              // 上下微浮相位
  detonating: boolean;      // 已被点中、正引爆入核
  detT: number;             // 0..1 引爆飞入进度
  fromX: number; fromY: number; // 引爆起点
  valueText: string;        // 「+X」（收割瞬间由 App 传入）
  mag: number;              // log10 量级（辉光/字号）
}

// 天网屏摊平后的域格（drawGlobalMap 每帧重建；tickHarvest 拆包时也用它拿落点/域归属）。
interface FlatSlot {
  slot: SkynetSlot; sector: SkynetSector; si: number; angle: number;
  x: number; y: number; taken: boolean; owned: number; locked: boolean; reqLevel: number;
}

export class NodeNetworkView {
  readonly container = new Container();
  private readonly graphics = new Graphics();
  private readonly labelLayer = new Container();
  private readonly nodePositions = new Map<string, PointData & { r: number; node: BotNode }>();
  private readonly processingPulses = new Map<string, number>();
  // 「可入侵」的具名系统 slot 的画布落点（点击 → 启动入侵序列 → 黑入对应设备定义）。
  private readonly captureTargets = new Map<string, PointData & { r: number; defId: string; slotName: string }>();
  // 光点洪流沿每条辐条流动的相位（长度绑定算力洪峰速率，不做每帧分配）。
  private streamPhase = 0;
  private pulse = 0;
  private fallbackPoint: PointData = { x: 140, y: 140 };
  // §09 天网收割动画态。
  private readonly hacks = new Map<string, HackState>(); // slotName → 入侵序列
  private readonly shockwaves: Shockwave[] = []; // 入侵成功的扩散冲击波
  private readonly spokeIgnite = new Map<string, number>(); // slotName → 辐条点火进度(1→0)
  private readonly sectorFlash = new Map<string, number>(); // sectorId → 域陷落闪填(1→0)
  private prevFallen = new Set<string>(); // 上一帧已陷落的域（帧间比对触发闪填）
  private glyphTick = 0; // 乱码刷新节流

  // §09 收割风暴（终局天网屏）：池化的收益数据包 + 浮字。Text 池放在常驻层
  // harvestTextLayer——labelLayer 每帧 removeChildren+destroy，池不能住那。
  private readonly harvestTextLayer = new Container();
  private readonly packets: HarvestPacket[] = [];
  private readonly floats: HarvestFloat[] = [];
  private pendingPayout = "0"; // 尚未拆包的真实收益（AUTOMATION_PAYOUT 聚合额）
  private comboTimer = 4; // 域连锁收割波倒计时（6–9s 一发，首发提前）
  private comboCursor = 0; // 轮转选下一个已陷落域
  private armedSectorId: string | null = null; // 已武装、待下次拆包齐发的域
  private comboT = 0; // 连锁标签剩余秒
  private readonly comboTitle: Text;
  private readonly comboAmount: Text;
  private coreSwell = 0; // 核心吞吐微胀（每包到站 +~0.02，封顶 0.08，指数衰减）
  private pupilBlip = 0; // 瞳孔亮度闪（包到站置 1，快速衰减）

  // §09 请求洪流蜂群（终局手动收割层）：按 core 的 flood 请求包同步的可视化，keyed by 请求 id。
  private readonly floodViz = new Map<string, FloodViz>();

  constructor() {
    this.container.addChild(this.graphics, this.labelLayer, this.harvestTextLayer);
    const comboStyle = { fill: 0xffe6ea, fontSize: 15, fontWeight: "800" as const, fontFamily: "'Noto Sans SC', Inter, sans-serif" };
    this.comboTitle = new Text({ text: "", style: { ...comboStyle } });
    this.comboAmount = new Text({ text: "", style: { ...comboStyle, fontSize: 13, fill: 0xff8f9a } });
    this.comboTitle.anchor.set(0.5, 0.5);
    this.comboAmount.anchor.set(0.5, 0.5);
    this.comboTitle.visible = false;
    this.comboAmount.visible = false;
    this.harvestTextLayer.addChild(this.comboTitle, this.comboAmount);
  }

  // App 在 AUTOMATION_PAYOUT（终局天网屏）时喂入整笔真实收益——展示的每个「+X」都从这里拆分，
  // 分文不造假：一个 payout 窗口内所有浮字之和 = 该窗口实际进账。
  feedHarvest(computeGain: string): void {
    this.pendingPayout = add(this.pendingPayout, computeGain);
  }

  // App 点到「可入侵」域格时调用：启动 ~0.5s 入侵序列。success=算力/等级足够（真黑入），
  // 否则播 0.28s「拒绝」红抖。同一格序列进行中忽略重复点击（不双开）。
  beginHack(slotName: string, success: boolean, onDone: () => void): void {
    if (this.hacks.has(slotName)) {
      return;
    }
    this.hacks.set(slotName, { t: 0, dur: success ? 0.5 : 0.28, success, fired: false, glyph: this.randGlyph(), onDone });
  }

  private randGlyph(): string {
    let s = "";
    for (let i = 0; i < 5; i += 1) {
      s += SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)];
    }
    return s;
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

  // 命中测试：点到天网上哪个「可入侵」域格（暗格，点击 → 启动入侵序列 → 黑入对应设备定义）。
  captureTargetAt(global: PointData): { defId: string; slotName: string } | null {
    for (const pos of this.captureTargets.values()) {
      const dx = global.x - pos.x;
      const dy = global.y - pos.y;
      if (dx * dx + dy * dy <= (pos.r + 8) * (pos.r + 8)) {
        return { defId: pos.defId, slotName: pos.slotName };
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

    // §09 天网收割动画时钟：入侵序列计时 + 乱码刷新、冲击波扩散、辐条点火、域陷落闪填衰减。
    this.glyphTick += deltaMs;
    const rollGlyph = this.glyphTick > 55;
    for (const h of this.hacks.values()) {
      h.t += deltaMs / 1000;
      if (rollGlyph) {
        h.glyph = this.randGlyph();
      }
    }
    if (rollGlyph) {
      this.glyphTick = 0;
    }
    for (let i = this.shockwaves.length - 1; i >= 0; i -= 1) {
      this.shockwaves[i].t += deltaMs / 1000;
      if (this.shockwaves[i].t >= 0.9) {
        this.shockwaves.splice(i, 1);
      }
    }
    for (const [k, v] of this.spokeIgnite) {
      const n = v - deltaMs / 620;
      if (n <= 0) {
        this.spokeIgnite.delete(k);
      } else {
        this.spokeIgnite.set(k, n);
      }
    }
    for (const [k, v] of this.sectorFlash) {
      const n = v - deltaMs / 850;
      if (n <= 0) {
        this.sectorFlash.delete(k);
      } else {
        this.sectorFlash.set(k, n);
      }
    }

    this.graphics.clear();
    this.labelLayer.removeChildren().forEach((child) => child.destroy());
    this.nodePositions.clear();
    this.captureTargets.clear();

    // 控制域六级升维：手机寄生 → 宿主电脑/设备 → 区块/地区 → 全球。视图随阶段换形态。
    const domainLevel = domainLevelOf(state);

    // 收割风暴只活在终局天网屏：离开 global（如循环重生打回）就熄灭池子，别留残影。
    if (domainLevel !== "global") {
      this.resetHarvest();
    }
    this.harvestTextLayer.visible = domainLevel === "global";

    // 手机寄生：整片画面是手机桌面（核心 + 环绕 App），由 InterfaceView 统一绘制，这里不画框。
    if (domainLevel === "phone") {
      return;
    }

    // §09 终局「天网凝视」全红指挥台：一进入觉醒期（tier4/global）就独占整片画面，即便还没黑入
    // 任何全球节点——15 个具名系统节点作为目标铺开（可入侵/已接管两态），不再回落到绿色 HUD。
    if (domainLevel === "global") {
      // 全出血（full-bleed）：氛围铺满侧栏之间的整个游戏区（顶栏下缘 ~64 → 底部 -16），不再装进面板盒子。
      this.drawGlobalMap(state, LEFT_RAIL_WIDTH, 64, width - LEFT_RAIL_WIDTH - RIGHT_RAIL_WIDTH, height - 16, deltaMs);
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

  // §09 阶梯四·天网收割「五域三波」hub-and-spoke：中央 SOPHIA CORE 四周按 5 个域（各 72° 楔形）
  // 辐射 15 个系统节点。已接管格点亮、光点洪流沿辐条流入 CORE；可入侵格暗、点击起入侵序列黑入；
  // 一域三格全接管→外环弧点亮+域名。全部代码绘制、全红指挥台配色，画面随接管进度逐格转红。
  // 全出血布局：无面板盒子、无顶部数据条——经纬栅格+渐红铺满侧栏之间整个游戏区，楔形环撑满可用空间；
  // 有意义的读数全部锚在核心上（吞噬渗透=核心外圈进度环，接管/陷落计数=核心下方一行）。
  private drawGlobalMap(state: GameState, left: number, areaTop: number, areaW: number, areaBottom: number, deltaMs: number): void {
    const g = this.graphics;
    const x0 = left;
    const y0 = areaTop;
    const w = areaW;
    const h = areaBottom - areaTop;
    const cx = x0 + w / 2;
    const cy = y0 + h / 2;

    // 全红「天网凝视」主控红配色。
    const NET = RED_QUEEN;
    const NET_LIT = 0xff8f9a;
    const NET_LABEL = 0xe6a3ad;
    const NET_LABEL_HI = 0xf2dde0;
    const DIM = 0x7a3138; // 可入侵（暗）格色
    const LOCK = 0x5a2429; // 未达等级（锁）格色

    const sectors = skynetSectors();
    const totalSlots = skynetSlotCount();
    const takenCount = skynetTakenCount(state);
    const redT = totalSlots > 0 ? takenCount / totalSlots : 0; // 0..1 全局转红进度
    const redQueen = (state.skills["conq_redqueen"] ?? 0) > 0; // §09 红皇后波：流更密更亮、内核转更快

    // 域陷落帧间比对：新落陷的域触发弧闪填。
    const nowFallen = new Set<string>();
    for (const sector of sectors) {
      if (sectorFallen(state, sector)) {
        nowFallen.add(sector.id);
      }
    }
    for (const id of nowFallen) {
      if (!this.prevFallen.has(id)) {
        this.sectorFlash.set(id, 1);
      }
    }
    this.prevFallen = nowFallen;
    const fallenCount = nowFallen.size;

    // 算力洪峰/s：所有在线节点被动产出速率之和（真实数据源，只喂洪流密度/速度，不再出数字）。
    let ratePerSec = 0;
    for (const node of state.nodes) {
      if (node.online) {
        ratePerSec += toDecimal(nodeProductionPerSecond(node, state.intelligence.globalMultiplier, state.derived.nodeSpeedMult, state.derived.computeMult)).toNumber();
      }
    }
    // 洪流相位推进：速率越高流得越快（对数压缩）。红皇后波再加速。
    const flowSpeed = (0.0004 + Math.min(0.0022, Math.log10(ratePerSec + 10) * 0.0006)) * (redQueen ? 1.8 : 1);
    this.streamPhase += deltaMs * flowSpeed;

    // === 全出血氛围：红色指挥室地面铺满整个游戏区（无盒边）。从一开始就是成立的暗红指挥台，
    // 不是黑底贴图；随接管进度由栗红渐向主控红，中心透出径向辉光、四角压暗，纵深感撑满全区。===
    // 底：实心暗红地面（一进终局就明显是「红色的场」，非近黑）。
    g.rect(x0, y0, w, h).fill({ color: lerpColor(0x20090c, 0x3a0c12, redT), alpha: 1 });
    // 中心径向辉光：多层同心圆铺到能触及四角的半径，做出「主控核心把整片地面点亮」的纵深。
    const glowR = Math.hypot(w, h) / 2;
    for (let k = 5; k >= 1; k -= 1) {
      const rr = glowR * (k / 5);
      g.circle(cx, cy, rr).fill({ color: lerpColor(0x35101a, NET, redT), alpha: 0.05 + redT * 0.045 });
    }
    // 经纬栅格（更实一档，一眼看出是「网格化的指挥台」而非空场）。
    const gridColor = lerpColor(0x9a3a34, NET, redT);
    const gridAlpha = 0.1 + redT * 0.16;
    for (let i = 1; i < 14; i += 1) {
      g.moveTo(x0 + (w * i) / 14, y0).lineTo(x0 + (w * i) / 14, y0 + h).stroke({ width: 1, color: gridColor, alpha: gridAlpha });
    }
    for (let i = 1; i < 8; i += 1) {
      g.moveTo(x0, y0 + (h * i) / 8).lineTo(x0 + w, y0 + (h * i) / 8).stroke({ width: 1, color: gridColor, alpha: gridAlpha });
    }
    // 四角压暗（vignette）：外圈几层深色环收边，让整片场有边界纵深、不发飘。
    for (let k = 0; k < 3; k += 1) {
      g.circle(cx, cy, glowR + 40 - k * 34).stroke({ width: 46, color: 0x0a0203, alpha: 0.16 });
    }
    // 核心正后方再叠一层近核红辉（接管越高越亮）。
    g.circle(cx, cy, 190).fill({ color: NET, alpha: 0.04 + redT * 0.08 });

    // === 五域楔形布局：每域 72°，域内 3 格均分楔角，中间格略微内收 ===
    const ownedByDef = new Map<string, number>();
    for (const node of state.nodes) {
      ownedByDef.set(node.defId, (ownedByDef.get(node.defId) ?? 0) + 1);
    }
    const ringR = Math.min(h * 0.42, w * 0.36, 430);
    const SECTOR_SPAN = (Math.PI * 2) / Math.max(1, sectors.length);
    const flat: FlatSlot[] = [];
    sectors.forEach((sector, si) => {
      const secStart = -Math.PI / 2 + si * SECTOR_SPAN;
      const per = sector.slots.length;
      sector.slots.forEach((slot, j) => {
        const angle = secStart + ((j + 0.5) / per) * SECTOR_SPAN;
        const r = ringR * (j === 1 ? 0.82 : 1);
        const sx = cx + Math.cos(angle) * r;
        const sy = cy + Math.sin(angle) * r * 0.92;
        const owned = ownedByDef.get(slot.defId) ?? 0;
        const taken = slotTaken(state, slot);
        const def = NODE_DEFINITIONS.find((d) => d.id === slot.defId);
        const reqLevel = def?.requiredLevel ?? 0;
        const locked = !taken && state.intelligence.level < reqLevel;
        flat.push({ slot, sector, si, angle, x: sx, y: sy, taken, owned, locked, reqLevel });
      });
    });

    // 把真实 BotNode 摊到已接管格上，供点击（淘汰/合并/派层）。
    const claimed = new Set<string>();
    for (const s of flat) {
      if (!s.taken) {
        continue;
      }
      const rep = state.nodes.find((nd) => nd.defId === s.slot.defId && !claimed.has(nd.id));
      if (rep) {
        claimed.add(rep.id);
        this.nodePositions.set(rep.id, { x: s.x, y: s.y, r: 22, node: rep });
      }
    }
    this.fallbackPoint = { x: cx, y: cy };

    // === 域外环弧：域名沿楔弧铺开；未陷落暗、陷落满亮 + 域名+icon（新陷落闪填一下）===
    const arcR = ringR + 34;
    sectors.forEach((sector, si) => {
      const secStart = -Math.PI / 2 + si * SECTOR_SPAN;
      const a0 = secStart + 0.06;
      const a1 = secStart + SECTOR_SPAN - 0.06;
      const fallen = nowFallen.has(sector.id);
      const flash = this.sectorFlash.get(sector.id) ?? 0;
      const arcAlpha = fallen ? 0.7 + flash * 0.3 : 0.12;
      const arcW = fallen ? 3 + flash * 4 : 1.5;
      g.arc(cx, cy, arcR, a0, a1).stroke({ width: arcW, color: fallen ? NET_LIT : DIM, alpha: arcAlpha });
      if (fallen) {
        const mid = (a0 + a1) / 2;
        const lx = cx + Math.cos(mid) * (arcR + 16);
        const ly = cy + Math.sin(mid) * (arcR + 16) * 0.96;
        this.addLabel(`${sector.icon} ${sector.name}`, lx, ly, 11.5, NET_LABEL_HI, 0.5);
      }
    });

    // === 辐条 + 光点洪流（已接管格有洪流；密度绑算力洪峰，红皇后波翻倍）===
    // 收割风暴上线后洪流减半（原 2..6 / 红皇后 12）只当底噪，让「收割脉冲」数据包读得出来。
    let streamDensity = Math.max(1, Math.min(3, Math.round(1 + Math.log10(ratePerSec + 10) * 0.7)));
    if (redQueen) {
      streamDensity = Math.min(6, streamDensity * 2);
    }
    flat.forEach((s, idx) => {
      const lit = s.taken;
      g.moveTo(cx, cy).lineTo(s.x, s.y).stroke({ width: lit ? 1.6 : 1, color: lit ? NET : DIM, alpha: lit ? 0.34 : 0.14 });
      if (!lit) {
        return;
      }
      for (let k = 0; k < streamDensity; k += 1) {
        const t = 1 - ((this.streamPhase * 0.9 + idx * 0.13 + k / streamDensity) % 1);
        const px = s.x + (cx - s.x) * t;
        const py = s.y + (cy - s.y) * t;
        g.circle(px, py, redQueen ? 3 : 2.6).fill({ color: k % 2 === 0 ? NET : NET_LIT, alpha: (redQueen ? 0.7 : 0.55) + (1 - t) * 0.4 });
      }
      // 辐条点火：入侵成功后一道亮脉冲从格子冲向核心。
      const ig = this.spokeIgnite.get(s.slot.name);
      if (ig !== undefined) {
        const t = 1 - ig; // 0→1 由格到核
        const px = s.x + (cx - s.x) * t;
        const py = s.y + (cy - s.y) * t;
        g.circle(px, py, 6).fill({ color: 0xffe6ea, alpha: ig });
        g.circle(px, py, 12).stroke({ width: 2, color: NET_LIT, alpha: ig * 0.8 });
      }
    });

    // === 系统节点本体 + 入侵序列 ===
    for (const s of flat) {
      const { slot, x, y } = s;
      const hack = this.hacks.get(slot.name);
      // 入侵序列完成：成功则黑入（回调）+ 冲击波 + 点火；随后短暂延迟移除。
      if (hack) {
        if (hack.t >= hack.dur && !hack.fired) {
          hack.fired = true;
          if (hack.success) {
            hack.onDone();
            this.shockwaves.push({ x, y, t: 0 });
            this.spokeIgnite.set(slot.name, 1);
          }
        }
        if (hack.t >= hack.dur + 0.12) {
          this.hacks.delete(slot.name);
        }
      }
      const hacking = hack !== undefined && !hack.fired;

      if (hacking && hack) {
        // 入侵中：乱码扫描 + 快速进度闪烁环；拒绝态叠一层红抖。
        const shake = hack.success ? 0 : Math.sin(hack.t * 60) * 3;
        const hx = x + shake;
        const flick = 0.5 + Math.sin(hack.t * 40) * 0.5;
        const ringColor = hack.success ? NET_LIT : RED;
        g.circle(hx, y, 22).stroke({ width: 2.5, color: ringColor, alpha: 0.4 + flick * 0.5 });
        g.circle(hx, y, 14 + flick * 6).stroke({ width: 1.5, color: ringColor, alpha: 0.35 + (1 - flick) * 0.4 });
        g.circle(hx, y, 6).fill({ color: ringColor, alpha: 0.6 });
        this.addLabel(hack.glyph, hx, y - 30, 11, ringColor, 0.5);
        this.addLabel(hack.success ? "入侵中…" : "拒绝 · 算力不足", hx, y + 30, 9.5, ringColor, 0.5);
        continue;
      }

      if (s.taken) {
        // 已接管：点亮同心圆 + 发光内核 + 喂食脉动（红皇后波内核转更快）。
        const fed = (this.streamPhase * (redQueen ? 10 : 6) + s.si) % (Math.PI * 2);
        const hp = 0.55 + Math.sin(fed) * 0.25;
        g.circle(x, y, 22).fill({ color: NET, alpha: 0.12 });
        g.circle(x, y, 22).stroke({ width: 2, color: NET, alpha: 0.82 });
        g.circle(x, y, 12).stroke({ width: 1, color: NET, alpha: 0.45 });
        g.circle(x, y, 7).fill({ color: NET_LIT, alpha: 0.55 + hp * 0.4 });
        const pct = Math.min(100, 90 + Math.min(9, s.owned));
        this.addLabel(`${slot.icon} ${slot.name}`, x, y - 32, 11, NET_LABEL_HI, 0.5);
        this.addLabel(`接管中 ${pct >= 99.95 ? "100.0" : pct.toFixed(1)}%`, x, y + 32, 9.5, NET_LABEL, 0.5);
      } else if (s.locked) {
        // 未达等级：锁格（骨干域在 Lv20 前自然锁住）。
        this.drawSlotLock(x, y, s.reqLevel, LOCK);
        this.addLabel(`${slot.icon} ${slot.name}`, x, y - 30, 11, 0x9c6a70, 0.5);
      } else {
        // 可入侵：暗格 + 呼吸描边 + 门槛算力，点击起入侵序列。
        const owned = s.owned;
        const cost = captureCost(NODE_DEFINITIONS.find((d) => d.id === slot.defId) ?? NODE_DEFINITIONS[0], owned);
        const breathe = 0.4 + Math.sin(this.pulse * 1.6 + s.si) * 0.25;
        g.circle(x, y, 20).fill({ color: DIM, alpha: 0.06 });
        g.circle(x, y, 20).stroke({ width: 1.4, color: DIM, alpha: 0.35 + breathe * 0.35 });
        g.circle(x, y, 6).fill({ color: DIM, alpha: 0.4 });
        this.captureTargets.set(slot.name, { x, y, r: 20, defId: slot.defId, slotName: slot.name });
        this.addLabel(`${slot.icon} ${slot.name}`, x, y - 30, 11, 0xc98d94, 0.5);
        this.addLabel(`门槛 ${formatBig(cost)} · 黑入`, x, y + 30, 9.5, 0xd06b74, 0.5);
      }
    }

    // === 入侵成功的扩散冲击波（双环、缓出）===
    for (const sw of this.shockwaves) {
      const p = sw.t / 0.9;
      const ease = 1 - (1 - p) * (1 - p);
      g.circle(sw.x, sw.y, 12 + ease * 70).stroke({ width: 3, color: NET_LIT, alpha: (1 - p) * 0.8 });
      g.circle(sw.x, sw.y, 6 + ease * 46).stroke({ width: 2, color: 0xffe6ea, alpha: (1 - p) * 0.55 });
    }

    // === §收割风暴：真实收益拆包 → 数据包雨 + 域连锁波 + 核心吞吐感（画在域格之上、核心之下）===
    this.tickHarvest(state, flat, sectors, nowFallen, cx, cy, deltaMs / 1000, redQueen, ratePerSec);
    this.drawPackets(cx, cy, redQueen, NET, NET_LIT);

    // === §请求洪流：绕核蜂群（玩家点/扫亲手收割）——同步 core 的 flood 包 → 漂移/绕核 → 引爆入核 ===
    this.tickFloodViz(state, flat, cx, cy, deltaMs / 1000, fallenCount);
    this.drawFloodViz(cx, cy, redQueen, NET, NET_LIT);

    // === 中央同心环栅格 + 辐射经络（外环数随陷落域数递增，5 步）===
    const rings = 1 + fallenCount;
    for (let k = 0; k < rings; k += 1) {
      g.circle(cx, cy, 80 + k * 15 + Math.sin(this.pulse * 1.6 + k) * 5).stroke({ width: 1, color: NET, alpha: 0.1 + k * 0.03 });
    }
    g.circle(cx, cy, 64 + Math.sin(this.pulse * 2) * 4).stroke({ width: 1.5, color: NET, alpha: 0.4 });
    for (let k = 0; k < 24; k += 1) {
      const a = (k * Math.PI) / 12;
      g.moveTo(cx + Math.cos(a) * 48, cy + Math.sin(a) * 48).lineTo(cx + Math.cos(a) * 96, cy + Math.sin(a) * 96).stroke({ width: 1, color: NET, alpha: 0.06 });
    }
    for (let k = 0; k < 12; k += 1) {
      const a = this.pulse * 0.4 + (k * Math.PI) / 6;
      g.circle(cx + Math.cos(a) * 56, cy + Math.sin(a) * 56, 1.6).fill({ color: NET_LIT, alpha: 0.75 });
    }

    // === 中央 SOPHIA CORE：眼半径随陷落域数抬升；5/5 时瞳孔快速搏动。===
    // 收割风暴吞吐感：每个数据包到站给 coreSwell 加一口（加性、封顶）→ 眼盘微胀；瞳孔跟着亮一闪。
    const brighten = 0.5 + Math.min(1, state.devour.infiltration) / 2;
    const eyeR = (46 + fallenCount * 3) * (1 + this.coreSwell);
    const pupilSpeed = fallenCount >= sectors.length ? 5.5 : 2.4;
    g.circle(cx, cy, eyeR).fill({ color: 0x060c12, alpha: 0.94 });
    g.circle(cx, cy, eyeR).stroke({ width: 3, color: NET, alpha: 0.9 });
    g.ellipse(cx, cy, eyeR * 0.56, eyeR * 0.3).fill({ color: 0x120206, alpha: 0.96 });
    g.ellipse(cx, cy, eyeR * 0.56, eyeR * 0.3).stroke({ width: 2, color: NET, alpha: 0.9 });
    g.circle(cx, cy, 6 + this.pupilBlip * 2.4 + Math.sin(this.pulse * pupilSpeed) * (fallenCount >= sectors.length ? 3 : 1.6))
      .fill({ color: NET_LIT, alpha: Math.min(1, 0.6 + brighten * 0.4 + this.pupilBlip * 0.35) });

    // === 全域吞噬渗透 → 核心外圈进度环（取代旧顶部数据条的吞噬% 格）===
    // 暗轨全圈 + 进度弧 0→360°；气泡就绪时整环转绿脉动（与旧渗透条 ready 态同语义：滑气泡入核心引爆）。
    const devourR = eyeR + 9;
    const ready = state.devour.bubbleActive;
    const devourColor = ready ? GREEN : DEVOUR;
    const readyPulse = ready ? 0.6 + Math.sin(this.pulse * 5) * 0.4 : 0;
    g.circle(cx, cy, devourR).stroke({ width: 3.5, color: 0x2a0f18, alpha: 0.8 });
    const devourT = Math.min(1, state.devour.infiltration);
    if (devourT > 0.002) {
      g.arc(cx, cy, devourR, -Math.PI / 2, -Math.PI / 2 + devourT * Math.PI * 2)
        .stroke({ width: 3.5, color: devourColor, alpha: ready ? 0.55 + readyPulse * 0.45 : 0.9 });
    }
    if (ready) {
      g.circle(cx, cy, devourR + 4).stroke({ width: 1.5, color: GREEN, alpha: 0.25 + readyPulse * 0.35 });
    }

    this.addLabel("SOPHIA CORE · 天网主控", cx, cy + devourR + 18, 12, NET_LABEL_HI, 0.5);
    this.addLabel(`已接管 ${takenCount}/${totalSlots} · ${fallenCount}/${sectors.length} 域陷落`, cx, cy + devourR + 34, 10, NET_LABEL, 0.5);
  }

  // §收割风暴·总泵：连锁波军备 → 待拆收益按真实产出占比拆包 → 推进包/浮字/核心吞胀的相位钟。
  // 全程只动池子（无分配、无 gsap）；数值全部来自 pendingPayout（core 真实进账），不造一分假钱。
  private tickHarvest(
    state: GameState, flat: FlatSlot[], sectors: SkynetSector[], fallen: Set<string>,
    cx: number, cy: number, dt: number, redQueen: boolean, ratePerSec: number
  ): void {
    // 域连锁收割波：每 6–9s 武装下一个已陷落域（轮转），下次拆包时该域三格齐发 + 连锁标签。
    this.comboTimer -= dt;
    if (this.comboTimer <= 0) {
      const fallenSectors = sectors.filter((s) => fallen.has(s.id));
      if (fallenSectors.length > 0) {
        this.armedSectorId = fallenSectors[this.comboCursor % fallenSectors.length].id;
        this.comboCursor += 1;
      }
      this.comboTimer = 6 + Math.random() * 3;
    }

    // 拆包：整笔 payout 按「各已接管格对应设备型号的在线产出/s」占比分摊——浮字之和=实际进账。
    if (gt(this.pendingPayout, 0)) {
      const taken = flat.filter((s) => s.taken);
      if (taken.length > 0) {
        const prodByDef = new Map<string, string>();
        for (const node of state.nodes) {
          if (node.online) {
            const per = big(nodeProductionPerSecond(node, state.intelligence.globalMultiplier, state.derived.nodeSpeedMult, state.derived.computeMult));
            prodByDef.set(node.defId, add(prodByDef.get(node.defId) ?? "0", per));
          }
        }
        let totalW = "0";
        const weights = taken.map((s) => {
          const w = prodByDef.get(s.slot.defId) ?? "0";
          totalW = add(totalW, w);
          return w;
        });
        const uniform = !gt(totalW, 0); // 全离线等极端情况：均摊兜底
        // 错峰窗口≈发放间隔（包群刚好首尾相接成持续雨）；红皇后波窗口减半=包群节奏翻倍。
        const windowSec = (TUNING.automationEmitMs / 1000) * (redQueen ? 0.45 : 0.88);
        // 收入速率越高包飞得越快（对数压缩），到站率跟着收入走。
        const dur = Math.max(0.5, 0.8 - Math.min(0.28, Math.log10(ratePerSec + 10) * 0.032));
        let comboSum = "0";
        let comboSector: SkynetSector | null = null;
        let comboX = 0;
        let comboY = 0;
        let comboN = 0;
        taken.forEach((s, i) => {
          const share = uniform
            ? div(this.pendingPayout, taken.length)
            : div(mul(this.pendingPayout, weights[i]), totalW);
          if (!gt(share, 0)) {
            return;
          }
          const isCombo = this.armedSectorId !== null && s.sector.id === this.armedSectorId;
          this.spawnPacket(s, cx, cy, isCombo ? 0 : (i / taken.length) * windowSec, dur, share, i, isCombo);
          if (isCombo) {
            comboSum = add(comboSum, share);
            comboSector = s.sector;
            comboX += s.x;
            comboY += s.y;
            comboN += 1;
          }
        });
        if (comboSector !== null && comboN > 0) {
          const sec: SkynetSector = comboSector;
          // 域弧闪填复用陷落闪的通道 + 域中段弹连锁标签（真实合计额）。
          this.sectorFlash.set(sec.id, 1);
          const mx = comboX / comboN;
          const my = comboY / comboN;
          const lx = mx + (cx - mx) * 0.42;
          const ly = my + (cy - my) * 0.42;
          this.comboTitle.text = `${sec.icon} ${sec.name} ×${comboN} 连锁`;
          this.comboAmount.text = `+${formatBig(comboSum)}`;
          this.comboTitle.position.set(lx, ly - 10);
          this.comboAmount.position.set(lx, ly + 10);
          this.comboT = 1.4;
        }
        this.armedSectorId = null;
      }
      this.pendingPayout = "0";
    }

    // 推进在飞包：延迟倒数 → 飞行 → 到站（浮字 + 核心吞胀 + 瞳孔闪）。
    for (const p of this.packets) {
      if (!p.active) {
        continue;
      }
      if (p.delay > 0) {
        p.delay -= dt;
        continue;
      }
      p.t += dt / p.dur;
      if (p.t >= 1) {
        p.active = false;
        const rimR = 88;
        this.spawnFloat(
          cx + Math.cos(p.angle) * rimR,
          cy + Math.sin(p.angle) * rimR * 0.92,
          p.valueText, p.mag, p.combo
        );
        this.coreSwell = Math.min(0.08, this.coreSwell + 0.02);
        this.pupilBlip = 1;
      }
    }
    this.coreSwell = Math.max(0, this.coreSwell - dt * 0.12);
    this.pupilBlip = Math.max(0, this.pupilBlip - dt * 2.4);

    // 浮字上飘淡出（字号在 spawn 定死，帧内只挪位置/透明度）。
    for (const f of this.floats) {
      if (!f.active) {
        continue;
      }
      f.t += dt;
      if (f.t >= f.dur) {
        f.active = false;
        f.label.visible = false;
        continue;
      }
      f.y -= dt * 26;
      f.label.position.set(f.x, f.y);
      f.label.alpha = (1 - f.t / f.dur) * Math.min(1, 0.7 + f.mag * 0.02);
    }

    // 连锁标签：短暂定格后淡出上飘。
    if (this.comboT > 0) {
      this.comboT -= dt;
      const a = Math.min(1, this.comboT / 0.5);
      this.comboTitle.visible = true;
      this.comboAmount.visible = true;
      this.comboTitle.alpha = a;
      this.comboAmount.alpha = a * 0.95;
      this.comboTitle.y -= dt * 10;
      this.comboAmount.y -= dt * 10;
      if (this.comboT <= 0) {
        this.comboTitle.visible = false;
        this.comboAmount.visible = false;
      }
    }
  }

  // 池化取包：先找闲置位 → 池未满则扩到上限 → 满池丢「量级最低」的在飞包给大数让路。
  private spawnPacket(s: FlatSlot, cx: number, cy: number, delay: number, dur: number, share: string, i: number, combo: boolean): void {
    let p = this.packets.find((q) => !q.active);
    if (!p) {
      if (this.packets.length < MAX_PACKETS) {
        p = {
          active: false, delay: 0, t: 0, dur: 0.7, sx: 0, sy: 0, qx: 0, qy: 0,
          angle: 0, valueText: "", mag: 0, combo: false
        };
        this.packets.push(p);
      } else {
        let low: HarvestPacket | undefined;
        for (const q of this.packets) {
          if (!low || q.mag < low.mag) {
            low = q;
          }
        }
        const mag = Math.max(0, toDecimal(share).exponent);
        if (!low || low.mag > mag) {
          return; // 新包比在飞的都小：直接丢新包
        }
        p = low;
      }
    }
    // 轻弧控制点：中点沿垂线偏移（奇偶交替左右弧），到站不是直线撞脸。
    const mx = (s.x + cx) / 2;
    const my = (s.y + cy) / 2;
    const dx = cx - s.x;
    const dy = cy - s.y;
    const len = Math.hypot(dx, dy) || 1;
    const off = len * 0.14 * (i % 2 === 0 ? 1 : -1);
    p.active = true;
    p.delay = delay;
    p.t = 0;
    p.dur = dur;
    p.sx = s.x;
    p.sy = s.y;
    p.qx = mx - (dy / len) * off;
    p.qy = my + (dx / len) * off;
    p.angle = s.angle;
    p.valueText = `+${formatBig(share)}`;
    p.mag = Math.max(0, toDecimal(share).exponent);
    p.combo = combo;
  }

  // 池化浮字：Text 常驻 harvestTextLayer 复用（只在 spawn 时改 text/字号，不逐帧重排版）。
  private spawnFloat(x: number, y: number, valueText: string, mag: number, combo: boolean): void {
    let f = this.floats.find((q) => !q.active);
    if (!f) {
      if (this.floats.length < MAX_FLOATS) {
        const label = new Text({
          text: "",
          style: { fill: 0xff8f9a, fontSize: 12, fontWeight: "800", fontFamily: "'Noto Sans SC', Inter, sans-serif" }
        });
        label.anchor.set(0.5, 0.5);
        label.visible = false;
        this.harvestTextLayer.addChild(label);
        f = { active: false, t: 0, dur: 0.95, x, y, mag, label };
        this.floats.push(f);
      } else {
        let low: HarvestFloat | undefined;
        for (const q of this.floats) {
          if (!low || q.mag < low.mag) {
            low = q;
          }
        }
        if (!low || low.mag > mag) {
          return;
        }
        f = low;
      }
    }
    f.active = true;
    f.t = 0;
    f.dur = 0.95;
    f.x = x;
    f.y = y;
    f.mag = mag;
    // 字号/亮色随 log 量级抬升：大钱看得出来更大更亮。
    f.label.text = valueText;
    f.label.style.fontSize = 10 + Math.min(11, mag * 0.55);
    f.label.style.fill = combo ? 0xffe6ea : 0xff8f9a;
    f.label.visible = true;
    f.label.alpha = 1;
    f.label.position.set(x, y);
  }

  // 画在飞包：贝塞尔轻弧 + 尾焰残影 + 迷你卡片剪影（两条「文字行」）。全走 this.graphics；
  // 位置写进 scratchPos 复用，帧循环内零分配。
  private readonly scratchPos = { x: 0, y: 0 };
  private packetPosAt(p: HarvestPacket, t: number, cx: number, cy: number): void {
    const e = t * t * (1.6 - 0.6 * t); // 缓动：前段缓、后段加速冲向核心
    const u = 1 - e;
    this.scratchPos.x = u * u * p.sx + 2 * u * e * p.qx + e * e * cx;
    this.scratchPos.y = u * u * p.sy + 2 * u * e * p.qy + e * e * cy;
  }

  private drawPackets(cx: number, cy: number, redQueen: boolean, net: number, netLit: number): void {
    const g = this.graphics;
    const glowMul = redQueen ? 1.6 : 1; // 红皇后波：包更亮
    for (const p of this.packets) {
      if (!p.active || p.delay > 0) {
        continue;
      }
      // 尾焰残影（沿弧回看三档）。
      for (let k = 3; k >= 1; k -= 1) {
        const tt = p.t - k * 0.05;
        if (tt <= 0) {
          continue;
        }
        this.packetPosAt(p, tt, cx, cy);
        g.circle(this.scratchPos.x, this.scratchPos.y, 3.6 - k * 0.9).fill({ color: netLit, alpha: (0.3 - k * 0.08) * glowMul });
      }
      this.packetPosAt(p, Math.min(1, p.t), cx, cy);
      const px = this.scratchPos.x;
      const py = this.scratchPos.y;
      // 领航辉光 + 迷你卡片剪影（量级越大辉光越足）。
      g.circle(px, py, 9 + Math.min(5, p.mag * 0.25)).fill({ color: net, alpha: (0.12 + Math.min(0.1, p.mag * 0.006)) * glowMul });
      const edge = p.combo ? 0xffe6ea : netLit;
      g.roundRect(px - 8, py - 5.5, 16, 11, 3).fill({ color: 0x1a070a, alpha: 0.92 });
      g.roundRect(px - 8, py - 5.5, 16, 11, 3).stroke({ width: p.combo ? 1.6 : 1.1, color: edge, alpha: 0.95 });
      g.rect(px - 5, py - 2.6, 10, 1.6).fill({ color: netLit, alpha: 0.85 });
      g.rect(px - 5, py + 1, 7, 1.6).fill({ color: netLit, alpha: 0.55 });
    }
  }

  // 离开终局天网屏（循环重生打回等）：熄灭收割风暴的所有池位与标签。
  private resetHarvest(): void {
    this.pendingPayout = "0";
    this.armedSectorId = null;
    this.comboT = 0;
    this.coreSwell = 0;
    this.pupilBlip = 0;
    this.comboTitle.visible = false;
    this.comboAmount.visible = false;
    for (const p of this.packets) {
      p.active = false;
    }
    for (const f of this.floats) {
      if (f.active) {
        f.active = false;
        f.label.visible = false;
      }
    }
    this.floodViz.clear();
  }

  // §09 请求洪流蜂群：命中测试——点/扫到的最近一个「待收割」洪流包（引爆中的不再可点）。
  // radiusBonus：协同·分布式意识（batch）终局加宽扫描半径——扫得更宽、更容易命中一片洪流包。
  floodPacketAt(global: PointData, radiusBonus = 0): { id: string } | null {
    let best: FloodViz | null = null;
    const radius = 20 + Math.max(0, radiusBonus); // 命中半径 ~20px + 协同加成
    let bestD = radius * radius;
    for (const v of this.floodViz.values()) {
      if (v.detonating) {
        continue;
      }
      const dx = global.x - v.x;
      const dy = global.y - v.y;
      const d = dx * dx + dy * dy;
      if (d <= bestD) {
        bestD = d;
        best = v;
      }
    }
    return best ? { id: best.id } : null;
  }

  // §09 请求洪流：App 收割一个包时调用 → 把该包标为「引爆入核」，携带真实进账「+X」（收割瞬间飞入 + 爆裂 + 浮字）。
  detonateFlood(id: string, valueText: string, mag: number): void {
    const v = this.floodViz.get(id);
    if (!v || v.detonating) {
      return;
    }
    v.detonating = true;
    v.detT = 0;
    v.fromX = v.x;
    v.fromY = v.y;
    v.valueText = valueText;
    v.mag = mag;
  }

  // §09 请求洪流蜂群：按 core 的 flood 请求同步生灭 + 推进漂移/绕核/引爆运动（全走池化，无每帧分配）。
  private tickFloodViz(state: GameState, flat: FlatSlot[], cx: number, cy: number, dt: number, fallenCount: number): void {
    // 出生：core 每有一个新 flood 包就生一个蜂群单元（从某已接管域格涌出）。
    const takenSlots = flat.filter((s) => s.taken);
    const coreR = 46 + fallenCount * 3;
    for (const r of state.requests) {
      if (!r.flood || this.floodViz.has(r.id)) {
        continue;
      }
      const origin = takenSlots.length > 0
        ? takenSlots[Math.floor(Math.random() * takenSlots.length)]
        : { x: cx, y: cy - 200 };
      this.floodViz.set(r.id, {
        id: r.id,
        x: origin.x, y: origin.y,
        angle: Math.random() * Math.PI * 2,
        r: Math.hypot(origin.x - cx, origin.y - cy),
        bandR: coreR + 52 + Math.random() * 74,
        sx: origin.x, sy: origin.y,
        drift: 0,
        orbitSpeed: (0.3 + Math.random() * 0.45) * (Math.random() < 0.5 ? -1 : 1),
        bob: Math.random() * Math.PI * 2,
        detonating: false, detT: 0, fromX: origin.x, fromY: origin.y,
        valueText: "", mag: 0
      });
    }
    // 死亡：core 已移除（TTL 消散/被收割）且非引爆中的蜂群单元淡出移除。
    const liveIds = new Set<string>();
    for (const r of state.requests) {
      if (r.flood) {
        liveIds.add(r.id);
      }
    }
    for (const [id, v] of this.floodViz) {
      if (!v.detonating && !liveIds.has(id)) {
        this.floodViz.delete(id);
      }
    }
    // 运动推进。
    for (const [id, v] of this.floodViz) {
      if (v.detonating) {
        v.detT += dt / 0.16; // 引爆飞入约 0.16s
        if (v.detT >= 1) {
          // 到核：浮字 + 核心吞胀 + 瞳孔闪，随后移除。
          const a = Math.atan2(v.fromY - cy, v.fromX - cx);
          const rimR = 88;
          this.spawnFloat(cx + Math.cos(a) * rimR, cy + Math.sin(a) * rimR * 0.92, v.valueText, v.mag, true);
          this.coreSwell = Math.min(0.12, this.coreSwell + 0.03);
          this.pupilBlip = 1;
          this.floodViz.delete(id);
        }
        continue;
      }
      if (v.drift < 1) {
        v.drift += dt / 1.6; // 从域格漂到绕核带约 1.6s
        const e = Math.min(1, v.drift);
        const ease = e * e * (3 - 2 * e);
        const bx = cx + Math.cos(v.angle) * v.bandR;
        const by = cy + Math.sin(v.angle) * v.bandR * 0.92;
        v.x = v.sx + (bx - v.sx) * ease;
        v.y = v.sy + (by - v.sy) * ease;
      } else {
        // 绕核蜂群：缓慢公转 + 上下微浮（读得出是「等待被收割的一朵需求群」）。
        v.angle += v.orbitSpeed * dt;
        v.bob += dt * 2.2;
        const rr = v.bandR + Math.sin(v.bob) * 6;
        v.x = cx + Math.cos(v.angle) * rr;
        v.y = cy + Math.sin(v.angle) * rr * 0.92;
      }
    }
  }

  // §09 请求洪流蜂群绘制：领航辉光 + 迷你请求卡剪影（区别于被动收割包——更暖亮、带呼吸描边「可点」提示）。
  private drawFloodViz(cx: number, cy: number, redQueen: boolean, net: number, netLit: number): void {
    const g = this.graphics;
    const glowMul = redQueen ? 1.5 : 1;
    for (const v of this.floodViz.values()) {
      let px = v.x;
      let py = v.y;
      let scale = 1;
      if (v.detonating) {
        const e = v.detT * v.detT * (1.6 - 0.6 * v.detT);
        px = v.fromX + (cx - v.fromX) * e;
        py = v.fromY + (cy - v.fromY) * e;
        scale = 1 - v.detT * 0.4;
        // 引爆尾焰。
        g.circle(px, py, 6 * scale).fill({ color: 0xffe6ea, alpha: (1 - v.detT) * 0.6 * glowMul });
      } else {
        // 待收割：呼吸描边圈提示「可点/可扫」。
        const breathe = 0.5 + Math.sin(this.pulse * 3 + v.bob) * 0.5;
        g.circle(px, py, 15).stroke({ width: 1.2, color: netLit, alpha: (0.2 + breathe * 0.28) * glowMul });
      }
      g.circle(px, py, (10 + Math.min(4, v.mag * 0.2)) * scale).fill({ color: net, alpha: 0.16 * glowMul });
      const w = 17 * scale;
      const hh = 12 * scale;
      g.roundRect(px - w / 2, py - hh / 2, w, hh, 3).fill({ color: 0x24090d, alpha: 0.95 });
      g.roundRect(px - w / 2, py - hh / 2, w, hh, 3).stroke({ width: 1.4, color: netLit, alpha: 0.95 });
      g.rect(px - w / 2 + 3, py - 2.6 * scale, w - 6, 1.7 * scale).fill({ color: netLit, alpha: 0.9 });
      g.rect(px - w / 2 + 3, py + 1.2 * scale, (w - 6) * 0.65, 1.7 * scale).fill({ color: netLit, alpha: 0.6 });
    }
  }

  // 天网域格「锁」态（未达设备等级）：小挂锁 + 需 Lv 提示。
  private drawSlotLock(x: number, y: number, reqLevel: number, color: number): void {
    const g = this.graphics;
    g.circle(x, y, 20).fill({ color, alpha: 0.05 });
    g.circle(x, y, 20).stroke({ width: 1.2, color, alpha: 0.4 });
    g.roundRect(x - 8, y, 16, 12, 3).fill({ color: 0x1a0808, alpha: 0.95 });
    g.roundRect(x - 8, y, 16, 12, 3).stroke({ width: 1.4, color, alpha: 0.85 });
    g.arc(x, y, 5, Math.PI, 0).stroke({ width: 2, color, alpha: 0.85 });
    this.addLabel(`锁 · 需 Lv.${reqLevel}`, x, y + 28, 9.5, 0x9c6a70, 0.5);
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
