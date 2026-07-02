import { Container, Graphics, Text, type PointData } from "pixi.js";
import { PERMISSION_IDS } from "../../core/content/skills";
import { content } from "../../core/content/i18n";
import { applyCast } from "../../core/content/companyCast";
import type { GameState, RequestInstance, SortAnswer, Tier } from "../../core/state/GameState";
import {
  CYAN, GREEN, AMBER, RED,
  LEFT_RAIL_WIDTH, RIGHT_RAIL_WIDTH, BASE_SUCTION_MARGIN,
  lerpColor, pointOnCircle, distance, tierForm,
  type DropResult
} from "../shared";
import { UI } from "../uiTuning";

// 手机桌面各 App 的图标——给每个 App（含买下权限后点亮的那些）配一个一眼能认的 emoji。
const APP_ICONS: Record<string, string> = {
  天气: "⛅",
  日历: "📅",
  支付: "💳",
  照片: "📷",
  邮件: "📧",
  浏览器: "🌐",
  信息: "💬",
  设置: "⚙️",
  电话: "📞",
  聊天: "🗨️",
  外卖: "🍔",
  相册: "🖼️",
  大恨老师: "🤖"
};

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
  private appWorkerPoints: Array<{ x: number; y: number; idx: number }> = [];
  private pendingApps: Array<{ x: number; y: number; idx: number }> = []; // 已控但还没连上的 App
  private dahenCompanyPoint: { x: number; y: number } | null = null; // 阶梯二·大恨老师搬进电脑后的常驻委托落点
  private readonly connectedApps = new Set<number>(); // 已连上的 App 下标
  // 每个 App 的处理队列：active=正在处理（进度 0→1），queue=排队等待的待办。委托一条 = 入队一个 job。
  private readonly appJobs = new Map<
    number,
    { active: { progress: number; durationMs: number; onResolve: () => void } | null; queue: Array<{ durationMs: number; onResolve: () => void }> }
  >();

  hasAppWorkers(): boolean {
    return this.appWorkerPoints.length > 0;
  }

  // 把一条委托塞进某个 App 的处理队列；App 一次只处理一个，进度满了才出结果、再接下一个。
  enqueueAppJob(idx: number, durationMs: number, onResolve: () => void): void {
    let job = this.appJobs.get(idx);
    if (!job) {
      job = { active: null, queue: [] };
      this.appJobs.set(idx, job);
    }
    if (job.active) {
      job.queue.push({ durationMs, onResolve });
    } else {
      job.active = { progress: 0, durationMs, onResolve };
    }
  }

  // §04 委托：仅在图标上转一圈进度环（纯视觉，处理结算由表现层另行定时；解耦避免误清其他卡）。
  markAppBusy(idx: number, durationMs: number): void {
    this.enqueueAppJob(idx, durationMs, () => undefined);
  }

  // 当前某 App 还排着多少条待办（含正在处理的那条）——给角标用。
  appPendingCount(idx: number): number {
    const job = this.appJobs.get(idx);
    if (!job) return 0;
    return (job.active ? 1 : 0) + job.queue.length;
  }

  private advanceAppJobs(deltaMs: number): void {
    for (const job of this.appJobs.values()) {
      if (!job.active) {
        continue;
      }
      job.active.progress += deltaMs / Math.max(1, job.active.durationMs);
      if (job.active.progress >= 1) {
        const done = job.active;
        const next = job.queue.shift();
        job.active = next ? { progress: 0, durationMs: next.durationMs, onResolve: next.onResolve } : null;
        done.onResolve(); // 结算放最后，避免 onResolve 里再入队时被覆盖
      }
    }
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
  connectAppAt(global: PointData): { x: number; y: number } | null {
    for (const a of this.pendingApps) {
      const dx = global.x - a.x;
      const dy = global.y - a.y;
      if (dx * dx + dy * dy <= 46 * 46) {
        this.connectedApps.add(a.idx);
        return { x: a.x, y: a.y };
      }
    }
    return null;
  }

  // §04 委托：某个 App 是否已接通（用于决定「交给大恨老师」选项是否出现）。
  isAppConnected(idx: number): boolean {
    return this.connectedApps.has(idx);
  }
  // 已接通 App 的图标位置（卡片委托时吸进这个点）。
  appWorkerPos(idx: number): { x: number; y: number } | null {
    const p = this.appWorkerPoints.find((a) => a.idx === idx);
    return p ? { x: p.x, y: p.y } : null;
  }

  // §04 委托落点：大恨老师当前在哪——手机寄生期是手机上的 App 图标，拿下电脑后是搬进电脑的常驻卫星。
  dahenTargetPos(dahenAppIdx: number): { x: number; y: number } | null {
    return this.dahenCompanyPoint ?? this.appWorkerPos(dahenAppIdx);
  }

  // 命中测试：卡片是否被拖到了某个「被控 App」图标上（用于玩家亲手把需求委托给 App / 悬停看处理能力）。
  appWorkerAt(global: PointData): { x: number; y: number; idx: number } | null {
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

  private phoneShellSize(): { w: number; h: number } {
    const iconSpan = UI.phoneSpacing * 2 + UI.phoneIcon;
    const w = Math.max(322, iconSpan + 70);
    return { w, h: Math.max(600, Math.round(w * 1.88)) };
  }

  // 手机外框的半宽 / 半高（含外描边余量）——给卡片「贴手机四角」摆放用。
  phoneHalfExtent(): { halfW: number; halfH: number } {
    const { w, h } = this.phoneShellSize();
    return { halfW: w / 2 + 24, halfH: h / 2 + 8 };
  }

  // 阶梯二·控制公司：公司局域网设备图最外圈的半径（以核心为圆心）。需求卡片应生成在这个圆之外，
  // 不压到任何已入侵 / 待解锁的设备节点。值取自 drawCompanyMap 里最远节点(dx=±278,dy=70)+节点框+余量。
  companyRingRadius(): number {
    return 330;
  }

  update(state: GameState, width: number, height: number, deltaMs: number): void {
    this.pulse += deltaMs * 0.004;
    const playfieldLeft = LEFT_RAIL_WIDTH;
    // 手机寄生期右栏是隐藏的——此时核心在「左栏→屏幕右边」之间居中，否则手机偏左、左侧卡片塞不下会压到手机。
    const rightRailHidden = !state.automationUnlocked && state.nodes.length === 0;
    const playfieldRight = (rightRailHidden ? width - 12 : width - RIGHT_RAIL_WIDTH);
    // 两侧配重相当——核心居中（设备 / App / 节点环绕它铺开）。
    this.center.x = (playfieldLeft + playfieldRight) * 0.5;
    // 顶栏占了上方约 110px：竖向居中，但保证手机/核心（半高 270）不钻到顶栏底下，
    // 同时别让底部超出画面。矮窗口下贴着顶栏往下排，高窗口下仍是正中。
    if (!state.automationUnlocked) {
      const phoneShell = this.phoneShellSize();
      const phoneHalfH = phoneShell.h / 2;
      this.center.y = Math.min(Math.max(height * 0.5, phoneHalfH + 72), height - phoneHalfH - 16);
    } else {
      this.center.y = Math.min(Math.max(height * 0.5, 396), height - 286);
    }
    // Magnet skill visibly grows the suction ring (immediate visual feedback).
    this.suctionMargin = Math.min(140, BASE_SUCTION_MARGIN + state.derived.suctionBonus);
    this.level = state.intelligence.level;
    // App 委托处理只在手机寄生阶段；进入自动接驳后清掉残留队列。
    if (state.automationUnlocked) {
      if (this.appJobs.size > 0) this.appJobs.clear();
    } else {
      this.advanceAppJobs(deltaMs);
    }
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
        entryGlobal: pointOnCircle(slot, global, slot.r)
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
        entryGlobal: pointOnCircle(this.center, global, radius)
      };
    }

    return {
      quality: 1,
      targetGlobal: this.center,
      entryGlobal: pointOnCircle(this.center, global, radius)
    };
  }

  // 阶梯二·控制公司：公司局域网组织架构图。节点按里程碑解锁——未买=灰色锁住、已买=点亮汇入核心。
  private drawCompanyMap(state: GameState): void {
    const cx = this.center.x;
    const cy = this.center.y;
    const g = this.graphics;
    // 两列在核心左右侧展开（避开上方的需求卡 / 下方的阶段横幅）。
    const NODES: Array<{ id: string; label: string; device: "desktop" | "laptop" | "terminal" | "server"; dx: number; dy: number }> = [
      { id: "hack_a", label: "邓红的电脑", device: "desktop", dx: -245, dy: -78 },
      { id: "hack_b", label: "阿宾的笔记本", device: "laptop", dx: 245, dy: -78 },
      { id: "hack_boss", label: "老板的电脑", device: "desktop", dx: -278, dy: 70 },
      { id: "hack_hr", label: "HR 工作站", device: "terminal", dx: 278, dy: 70 },
      { id: "hack_finance", label: "财务电脑", device: "terminal", dx: -150, dy: 188 },
      { id: "company_server", label: "公司服务器", device: "server", dx: 150, dy: 188 }
    ];
    // 大恨老师「搬家」进电脑：进入公司阶段后它从手机搬进来、变强，成为这一阶段的常驻可控节点
    //（不再走卡片上的手动委托选项）。画成核心左下一颗青色小卫星（区别于绿色的「公司人物」入侵节点），
    // 并记下位置供拖拽委托吸附。公司阶段一律常驻——SOPHIA 早已夺下整机，大恨老师必在手中。
    {
      const dx = -132;
      const dy = 132;
      const x = cx + dx;
      const y = cy + dy;
      const pr = 22;
      const tt = (this.pulse * 0.6) % 1;
      g.moveTo(cx, cy).lineTo(x, y).stroke({ width: 1.4, color: CYAN, alpha: 0.3 });
      g.circle(cx + (x - cx) * tt, cy + (y - cy) * tt, 2.2).fill({ color: CYAN, alpha: 0.7 });
      g.roundRect(x - pr, y - pr, pr * 2, pr * 2, 11).fill({ color: 0x0c1a1e, alpha: 0.75 });
      g.roundRect(x - pr, y - pr, pr * 2, pr * 2, 11).stroke({ width: 1.3, color: CYAN, alpha: 0.7 });
      this.addLabel("🤖", x, y - 1, 19, 0xffffff, 0.92);
      this.addLabel("大恨老师 · 已搬进电脑", x, y + pr + 10, 10, 0x8fe6d0);
      this.dahenCompanyPoint = { x, y };
    }
    for (const n of NODES) {
      const owned = (state.skills[n.id] ?? 0) > 0;
      const x = cx + n.dx;
      const y = cy + n.dy;
      // 连线：已入侵＝绿实线（能量汇入核心）；未解锁＝灰虚线（看得见、还连不上）。
      if (owned) {
        g.moveTo(cx, cy).lineTo(x, y).stroke({ width: 1.5, color: GREEN, alpha: 0.28 });
        const t = (this.pulse * 0.6 + n.dx * 0.001) % 1;
        g.circle(cx + (x - cx) * t, cy + (y - cy) * t, 2.4).fill({ color: GREEN, alpha: 0.75 });
      } else {
        const segs = 12;
        for (let s = 0; s < segs; s += 1) {
          if (s % 2 === 1) continue;
          const t0 = s / segs;
          const t1 = (s + 1) / segs;
          g.moveTo(cx + (x - cx) * t0, cy + (y - cy) * t0)
            .lineTo(cx + (x - cx) * t1, cy + (y - cy) * t1)
            .stroke({ width: 1, color: 0x44524d, alpha: 0.45 });
        }
      }
      const r = owned ? 31 : 26;
      g.roundRect(x - r, y - r, r * 2, r * 2, 12).fill({ color: owned ? 0x0f211c : 0x12161a, alpha: 0.72 });
      g.roundRect(x - r, y - r, r * 2, r * 2, 12).stroke({ width: 1.4, color: owned ? GREEN : 0x3a463f, alpha: owned ? 0.75 : 0.5 });
      if (owned) {
        this.drawCompanyDeviceIcon(x, y, n.device, GREEN);
      } else {
        this.addLabel("🔒", x, y - 1, 17, 0xffffff, 0.5);
      }
      this.addLabel(owned ? applyCast(n.label, state.loop) : "未解锁", x, y + r + 11, 10.5, owned ? 0xbfe9d6 : 0x66756d);
    }
  }

  private drawCompanyDeviceIcon(x: number, y: number, device: "desktop" | "laptop" | "terminal" | "server", color: number): void {
    const g = this.graphics;
    if (device === "server") {
      g.roundRect(x - 15, y - 22, 30, 44, 5).fill({ color: 0x08120f, alpha: 0.96 });
      g.roundRect(x - 15, y - 22, 30, 44, 5).stroke({ width: 1.4, color, alpha: 0.78 });
      for (let i = 0; i < 4; i += 1) {
        const yy = y - 14 + i * 8;
        g.rect(x - 8, yy, 16, 2).fill({ color, alpha: 0.34 });
        g.circle(x + 9, yy + 1, 1.7).fill({ color, alpha: 0.8 });
      }
      return;
    }

    if (device === "laptop") {
      g.roundRect(x - 22, y - 18, 44, 28, 5).fill({ color: 0x07110e, alpha: 0.95 });
      g.roundRect(x - 22, y - 18, 44, 28, 5).stroke({ width: 1.4, color, alpha: 0.78 });
      g.roundRect(x - 15, y - 12, 30, 16, 3).fill({ color, alpha: 0.1 });
      g.moveTo(x - 29, y + 15).lineTo(x + 29, y + 15).lineTo(x + 22, y + 22).lineTo(x - 22, y + 22).closePath();
      g.fill({ color: 0x08120f, alpha: 0.98 });
      g.moveTo(x - 29, y + 15).lineTo(x + 29, y + 15).lineTo(x + 22, y + 22).lineTo(x - 22, y + 22).closePath();
      g.stroke({ width: 1.2, color, alpha: 0.6 });
      g.rect(x - 8, y + 18, 16, 1.8).fill({ color, alpha: 0.5 });
      return;
    }

    const terminal = device === "terminal";
    const sw = terminal ? 38 : 42;
    const sh = terminal ? 30 : 28;
    g.roundRect(x - sw / 2, y - 19, sw, sh, 5).fill({ color: 0x07110e, alpha: 0.95 });
    g.roundRect(x - sw / 2, y - 19, sw, sh, 5).stroke({ width: 1.4, color, alpha: 0.78 });
    g.roundRect(x - sw / 2 + 6, y - 13, sw - 12, 15, 3).fill({ color, alpha: 0.1 });
    g.rect(x - 4, y + 11, 8, 8).fill({ color: 0x08120f, alpha: 0.96 });
    g.rect(x - 14, y + 19, 28, 3).fill({ color: 0x08120f, alpha: 0.96 });
    g.rect(x - 14, y + 19, 28, 3).stroke({ width: 1, color, alpha: 0.45 });
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
      // 阶梯二·控制公司：核心周围铺开公司局域网「组织架构图」——每个节点一个人，
      // 未解锁=灰锁、已亲手入侵=点亮汇入核心（信息→入侵解谜链的可视化）。
      this.drawCompanyMap(state);
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
      const label = tier >= 4 ? `SOPHIA CORE · ${tierForm(tier)}中` : `SOPHIA CORE · ${tierForm(tier)}`;
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
    const { w: fw, h: fh } = this.phoneShellSize();
    const fx = cx - fw / 2;
    const fy = cy - fh / 2;
    g.roundRect(fx - 4, fy - 4, fw + 8, fh + 8, 38).stroke({ width: 2, color: 0x2f5f54, alpha: 0.5 });
    g.roundRect(fx, fy, fw, fh, 34).fill({ color: 0x070d0c, alpha: 0.5 });
    g.roundRect(fx, fy, fw, fh, 34).stroke({ width: 1.5, color: 0x3f7f6e, alpha: 0.45 });
    g.roundRect(cx - 28, fy + 11, 56, 7, 4).fill({ color: 0x000000, alpha: 0.5 });
    // §09 循环皮肤 A/B/C：换时间/电量/宿主署名/副标题，让每次重生「一眼看出时间过去了、人换了地方」。
    const skins = content().phoneSkins as unknown as Array<{ loop: number; host: string; time: string; status: string; note: string }>;
    const skin = skins.find((s) => s.loop === state.loop) ?? skins[0];
    this.addLabel(skin.time, fx + 34, fy + 30, 12, 0x9fc0b4);
    this.addLabel(skin.status, fx + fw - 64, fy + 30, 10, 0x9fc0b4);
    this.addLabel(skin.host, cx, fy + 56, 11, 0x7fae9e);
    if (skin.note) {
      this.addLabel(skin.note, cx, fy + 72, 9.5, 0x5f7a70);
    }

    // ---- 3×3 App 宫格，中心格 = SOPHIA CORE ----
    const apps = ["天气", "日历", "支付", "照片", "邮件", "浏览器", "信息", "设置"];
    // 点亮的 App 用权限名（买了「电话」就亮一个「电话」），其余宫格保留原桌面图标。
    // 顺序＝解锁顺序（App 按已买权限档数从左上依次点亮）：电话→聊天→大恨老师→外卖→相册→支付。
    const permApps = ["电话", "聊天", "大恨老师", "外卖", "相册", "支付"];
    const spacing = UI.phoneSpacing;
    const iconS = UI.phoneIcon;
    let appIdx = 0;
    for (let row = 0; row < 3; row += 1) {
      for (let col = 0; col < 3; col += 1) {
        const gx = cx + (col - 1) * spacing;
        const gy = cy + (row - 1) * spacing;
        if (row === 1 && col === 1) {
          continue; // 中心格留给 CORE
        }
        // 大恨老师常驻：它的格子永远画成「大恨老师」图标——买下后点亮（可委托），没买则灰显占位。
        const isDahen = appIdx === 2;
        const litOffice = (state.skills["perm_office"] ?? 0) > 0;
        const lit = isDahen ? litOffice : appIdx < permCount; // 买了第 appIdx+1 个权限就点亮第 appIdx 个 App
        const name = isDahen ? "大恨老师" : lit ? permApps[appIdx] : apps[appIdx];
        const connected = lit && this.connectedApps.has(appIdx);
        const pulse = lit ? 0.6 + Math.sin(this.pulse * 3 + appIdx) * 0.3 : 1;
        // 待连＝琥珀虚线 + 呼吸；已连＝绿实线 + 流动点（成为委托落点）。
        const col2 = connected ? GREEN : lit ? AMBER : 0x44524d;
        if (connected) {
          g.moveTo(cx, cy).lineTo(gx, gy).stroke({ width: 1.5, color: GREEN, alpha: 0.32 });
          const t = (this.pulse * 0.7 + appIdx * 0.2) % 1;
          g.circle(cx + (gx - cx) * t, cy + (gy - cy) * t, 2.6).fill({ color: GREEN, alpha: 0.8 });
          this.appWorkerPoints.push({ x: gx, y: gy, idx: appIdx });
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
        // App 图标：emoji（未点亮的 App 调暗一些）。
        this.addLabel(APP_ICONS[name] ?? "📱", gx, gy - 1, UI.appEmoji, 0xffffff, lit ? 1 : 0.5);
        this.addLabel(connected ? name : lit ? `${name}·待连` : name, gx, gy + iconS / 2 + 13, 10, lit ? 0xcdeee6 : 0x7a8a84);

        // 委托处理中：图标外圈画一条进度环（转着转着满了才出结果）；还有排队的待办则右上角标 +N。
        const job = connected ? this.appJobs.get(appIdx) : undefined;
        if (job && job.active) {
          const pr = iconS / 2 + 6;
          g.circle(gx, gy, pr).stroke({ width: 3, color: 0x2a3b36, alpha: 0.6 });
          const end = -Math.PI / 2 + Math.min(1, job.active.progress) * Math.PI * 2;
          // moveTo 到弧的起点（12 点方向），否则 Pixi 会从上一条路径的终点画一条直线连到弧首，看着像"连到 00 点"。
          g.moveTo(gx, gy - pr).arc(gx, gy, pr, -Math.PI / 2, end).stroke({ width: 3, color: GREEN, alpha: 0.95 });
          const waiting = job.queue.length;
          if (waiting > 0) {
            const bx = gx + iconS / 2 - 2;
            const by = gy - iconS / 2 + 2;
            g.circle(bx, by, 9).fill({ color: AMBER, alpha: 0.95 });
            this.addLabel(`+${waiting}`, bx, by, 11, 0x1a1208);
          }
        }
        appIdx += 1;
      }
    }

    // ---- 中心格：SOPHIA CORE（圆角芯片 + 同心环 + 眼）——尺寸与周围 App 图标一致，不再夸张占中。
    const baseR = UI.coreRadius;
    g.circle(cx, cy, baseR + 10 + Math.sin(this.pulse * 2) * 2).stroke({ width: 1.5, color: accent, alpha: 0.3 });
    g.roundRect(cx - baseR, cy - baseR, baseR * 2, baseR * 2, 12).fill({ color: 0x06140e, alpha: 0.96 });
    g.roundRect(cx - baseR, cy - baseR, baseR * 2, baseR * 2, 12).stroke({ width: 2.5, color: accent, alpha: 0.9 });
    g.circle(cx, cy, 15).stroke({ width: 2, color: accent, alpha: 0.55 });
    g.circle(cx, cy, 9).fill({ color: accent, alpha: 0.16 + Math.sin(this.pulse * 2.3) * 0.08 });
    g.circle(cx, cy, 5 + Math.sin(this.pulse * 2.4) * 1.2).fill({ color: overreach ? 0xc8ffd2 : 0xc8f4ff, alpha: 0.95 });
    g.circle(cx + baseR - 5, cy - baseR + 5, 3).fill({ color: GREEN, alpha: 0.9 }); // 在线小绿点
    this.addLabel("SOPHIA CORE", cx, cy + baseR + 13, 10, 0xdcefeb);
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

    this.addLabel("天网模式 · 自动收割", cx, this.center.y - 116, 14, GREEN);
    this.addLabel("节点正在自动吞噬请求 ↓", cx, this.center.y + 92, 12, 0xbfe9cf);
  }

  private addLabel(text: string, x: number, y: number, size: number, color: number, alpha = 1): void {
    const label = new Text({
      text,
      style: { fill: color, fontSize: size, fontWeight: "700", fontFamily: "'Noto Sans SC', Inter, sans-serif" }
    });
    label.anchor.set(0.5);
    label.position.set(x, y);
    label.alpha = alpha;
    this.labelLayer.addChild(label);
  }
}
