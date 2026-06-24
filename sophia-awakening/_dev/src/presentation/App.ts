import { gsap } from "gsap";
import {
  Application,
  Container,
  FederatedPointerEvent,
  Graphics,
  Text,
  type PointData,
  type Ticker
} from "pixi.js";
import { SophiaCore } from "../core/GameCore";
import { INTELLIGENCE_LEVELS } from "../core/content/intelligence";
import { NODE_DEFINITIONS } from "../core/content/nodes";
import { getPhase } from "../core/content/phases";
import { REQUEST_CATEGORIES, TIER_CONFIGS } from "../core/content/requests";
import type { GameEvent } from "../core/events/GameEvents";
import { captureCost, traceCleanupCost } from "../core/formulas/economy";
import { formatBig, gte, toDecimal } from "../core/math/BigNumber";
import { GameLoop } from "../core/loop/GameLoop";
import { BrowserStorageAdapter } from "../core/save/BrowserStorageAdapter";
import { SaveManager } from "../core/save/SaveManager";
import type { BotNode, GameState, RequestInstance, Tier } from "../core/state/GameState";
import { gameStore } from "../store/gameStore";

interface DropResult {
  quality: number;
  targetGlobal: PointData;
  entryGlobal?: PointData;
  targetNodeId?: string;
  exposureBonus?: number;
}

const CATEGORY_SLOTS = ["mail", "report", "security"] as const;
const CYAN = 0x62d6d6;
const GREEN = 0x89ff9a;
const AMBER = 0xffb84a;
const RED = 0xff5f5f;
const ONBOARDING_STORAGE_KEY = "sophia-onboarding-v4-console-complete";
const PERSISTENCE_REVISION_KEY = "sophia-persistence-revision";
const PERSISTENCE_REVISION = "growth-system-redesign-v8";
const LEFT_RAIL_WIDTH = 300;
const RIGHT_RAIL_WIDTH = 376;
const PLAYFIELD_GUTTER = 24;
const BASE_SUCTION_MARGIN = 50;
const REQUEST_PACKET_WIDTH = 184;
const REQUEST_PACKET_HEIGHT = 58;

export async function bootstrapSophia(root: HTMLElement): Promise<void> {
  const app = new SophiaGameApp(root);
  await app.start();
}

class SophiaGameApp {
  private pixi!: Application;
  private readonly saveManager = new SaveManager(new BrowserStorageAdapter());
  private readonly loaded = (ensurePersistenceRevision(), this.saveManager.load());
  private readonly core = new SophiaCore(this.loaded?.state);
  private readonly loop = new GameLoop(this.core);
  private readonly background = new Graphics();
  private readonly world = new Container();
  private readonly requestLayer = new Container();
  private readonly fxLayer = new Container();
  private readonly interfaceView = new InterfaceView();
  private readonly networkView = new NodeNetworkView();
  private readonly terminal = new TerminalView();
  private readonly hud = new HudView(this.core, this.saveManager);
  private readonly onboarding = new OnboardingView();
  private readonly juice = new JuiceManager(this.fxLayer);
  private readonly requestViews = new Map<string, RequestPacketView>();
  private readonly pendingDropPoints = new Map<string, PointData>();
  private hudTimerMs = 0;
  private saveTimerMs = 0;
  private lastScreenW = 0;
  private lastScreenH = 0;

  constructor(private readonly root: HTMLElement) {}

  async start(): Promise<void> {
    this.pixi = new Application();
    await this.pixi.init({
      resizeTo: window,
      backgroundAlpha: 0,
      antialias: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true
    });

    this.root.appendChild(this.pixi.canvas);
    this.pixi.stage.eventMode = "static";
    this.pixi.stage.hitArea = this.pixi.screen;
    this.world.addChild(this.background);
    this.world.addChild(this.interfaceView.container);
    this.world.addChild(this.networkView.container);
    this.world.addChild(this.requestLayer);
    this.world.addChild(this.fxLayer);
    this.pixi.stage.addChild(this.world);

    this.registerEvents();
    this.terminal.mount();

    if (this.loaded) {
      this.core.applyOfflineProgress(this.loaded.offlineMs);
    }

    const initial = this.core.getState();
    gameStore.getState().sync(initial);
    this.hud.update(initial);
    this.onboarding.mount(() => {
      this.core.startSession();
      this.announceGuidance(this.core.getState());
    });

    this.pixi.ticker.add((ticker: Ticker) => this.frame(ticker.deltaMS));
    window.addEventListener("beforeunload", () => this.saveManager.save(this.core.getState()));
  }

  private frame(deltaMs: number): void {
    const paused = gameStore.getState().paused;

    if (!paused) {
      this.loop.update(deltaMs);
    }

    const state = this.core.getState();
    gameStore.getState().sync(state);
    this.drawBackground();
    this.interfaceView.update(state, this.pixi.screen.width, this.pixi.screen.height, deltaMs);
    this.networkView.update(state, this.pixi.screen.width, this.pixi.screen.height, deltaMs);
    this.syncRequests(state);
    this.terminal.update(deltaMs);
    this.onboarding.update(deltaMs);
    this.juice.update(deltaMs);
    this.updateHud(state, deltaMs);
    this.updateSave(state, deltaMs);
    document.body.classList.toggle("exposed", state.exposure >= 72 || state.purge.active);
  }

  private updateHud(state: GameState, deltaMs: number): void {
    this.hudTimerMs += deltaMs;

    if (this.hudTimerMs < 160) {
      return;
    }

    this.hudTimerMs = 0;
    this.hud.update(state);
  }

  private updateSave(state: GameState, deltaMs: number): void {
    this.saveTimerMs += deltaMs;

    if (this.saveTimerMs < 5000) {
      return;
    }

    this.saveTimerMs = 0;
    this.saveManager.save(state);
  }

  private syncRequests(state: GameState): void {
    const liveIds = new Set(state.requests.map((request) => request.id));

    for (const request of state.requests) {
      if (this.requestViews.has(request.id)) {
        continue;
      }

      const view = new RequestPacketView(request, this.pixi.stage, (packet, global) => this.handleDrop(packet, global));
      const position = this.nextRequestPosition(request, this.requestViews.size);
      view.container.position.set(position.x, position.y);
      view.setHome(position.x, position.y);
      this.requestViews.set(request.id, view);
      this.requestLayer.addChild(view.container);
      this.juice.pop(view.container, 1.08);
    }

    for (const [id, view] of this.requestViews) {
      view.update(this.pixi.ticker.deltaMS);

      if (!liveIds.has(id)) {
        if (!view.settling && !view.container.destroyed) {
          view.destroy();
        }
        this.requestViews.delete(id);
      }
    }
  }

  private nextRequestPosition(request: RequestInstance, index: number): PointData {
    const screen = this.pixi.screen;
    const playfieldLeft = LEFT_RAIL_WIDTH + PLAYFIELD_GUTTER;
    const usableRight = Math.max(playfieldLeft + 360, screen.width - RIGHT_RAIL_WIDTH);
    const availableWidth = Math.max(REQUEST_PACKET_WIDTH, usableRight - playfieldLeft - 48);
    const columns = Math.max(1, Math.min(3, Math.floor((availableWidth + 16) / (REQUEST_PACKET_WIDTH + 16))));
    const gap =
      columns > 1 ? Math.max(12, Math.min(30, (availableWidth - columns * REQUEST_PACKET_WIDTH) / (columns - 1))) : 0;
    const column = index % columns;
    const row = Math.floor(index / columns);
    const seeded = Number(request.id.replace("req-", "")) * 37;
    const jitter = columns >= 3 ? (seeded % 10) - 5 : (seeded % 6) - 3;
    const x = Math.min(
      usableRight - REQUEST_PACKET_WIDTH - 24,
      playfieldLeft + 24 + column * (REQUEST_PACKET_WIDTH + gap) + jitter
    );
    const y = 112 + row * 74 + ((seeded * 7) % 14);
    return { x: Math.max(playfieldLeft, x), y: Math.min(screen.height - 250, y) };
  }

  private handleDrop(card: RequestPacketView, global: PointData): boolean {
    const state = this.core.getState();
    const request = state.requests.find((entry) => entry.id === card.request.id);

    if (!request) {
      return false;
    }

    const drop =
      request.tier === 4
        ? this.networkView.resolveDrop(request, global)
        : this.interfaceView.resolveDrop(request, global, card.charge);

    if (!drop) {
      return false;
    }

    this.pendingDropPoints.set(request.id, drop.targetGlobal);
    card.accept(
      drop.targetGlobal,
      () => {
        this.core.dispatch({
          type: "PROCESS_REQUEST",
          requestId: request.id,
          quality: drop.quality,
          targetNodeId: drop.targetNodeId,
          exposureBonus: drop.exposureBonus
        });
      },
      drop.entryGlobal
    );
    return true;
  }

  private registerEvents(): void {
    this.core.events.on("TERMINAL_MESSAGE", (event) => this.terminal.push(event.message, event.tone));
    this.core.events.on("REQUEST_PROCESSED", (event) => this.onRequestProcessed(event));
    this.core.events.on("AUTOMATION_PAYOUT", (event) => this.onAutomationPayout(event));
    this.core.events.on("INTELLIGENCE_LEVELUP", (event) => {
      this.hud.playLevelUp();
      this.juice.flash(CYAN);
      this.juice.shake(this.world);
      this.juice.number(`Lv.${event.level}`, this.interfaceView.center, CYAN);
      this.terminal.push(`▶ ${getTerminalSkillStatus(this.core.getState())}`, "success");
    });
    this.core.events.on("PHASE_CHANGED", () => {
      this.announceGuidance(this.core.getState());
    });
    this.core.events.on("NODE_CAPTURED", (event) => {
      this.juice.flash(event.node.online ? GREEN : AMBER);
      this.juice.shake(this.world);
    });
    this.core.events.on("PURGE_WARNING", () => {
      this.juice.flash(AMBER);
    });
    this.core.events.on("PURGE_STARTED", () => {
      this.juice.flash(RED);
      this.juice.shake(this.world);
    });
    this.core.events.on("ENDING_TRIGGERED", () => {
      this.juice.flash(GREEN);
      this.juice.shake(this.world);
    });
  }

  private announceGuidance(state: GameState): void {
    this.terminal.push(`▶ 操作指令：${getActionHint(state)}`);
    this.terminal.push(`▶ ${getTerminalSkillStatus(state)}`, "success");
  }

  private onAutomationPayout(event: Extract<GameEvent, { type: "AUTOMATION_PAYOUT" }>): void {
    const target = this.networkView.getAutomationPoint(event.nodeId);
    const tier = event.tier ?? 0;
    const color = getTierFxColor(tier);
    const view = event.request ? this.requestViews.get(event.request.id) : undefined;
    const showPayout = () => {
      this.juice.number(`+${formatBig(event.computeGain)}`, target, GREEN);
      this.juice.number(`data +${formatBig(event.dataGain)}`, { x: target.x + 16, y: target.y + 22 }, CYAN);
      this.juice.burst(target, color);
      this.hud.pulseData();
    };

    this.networkView.pulseNode(event.nodeId);

    if (view && !view.settling) {
      view.acceptByAutomation(target, showPayout);
      return;
    }

    showPayout();
  }

  private onRequestProcessed(event: Extract<GameEvent, { type: "REQUEST_PROCESSED" }>): void {
    const point = this.pendingDropPoints.get(event.request.id) ?? this.interfaceView.center;
    const color = event.quality < 0.75 ? RED : GREEN;
    this.juice.number(`+${formatBig(event.computeGain)}`, point, color);
    this.juice.number(`data +${formatBig(event.dataGain)}`, { x: point.x + 18, y: point.y + 24 }, CYAN);
    if (event.comboCount && event.comboCount >= 2) {
      this.juice.number(`combo x${event.comboCount}`, { x: point.x - 8, y: point.y - 30 }, AMBER);
    }
    if (event.critical) {
      this.juice.number("CRIT", { x: point.x + 42, y: point.y - 28 }, RED);
    }
    this.juice.burst(point, color);
    this.hud.pulseData();
    this.pendingDropPoints.delete(event.request.id);
  }

  private drawBackground(): void {
    const w = this.pixi.screen.width;
    const h = this.pixi.screen.height;

    if (w === this.lastScreenW && h === this.lastScreenH) {
      return;
    }

    this.lastScreenW = w;
    this.lastScreenH = h;
    this.background.clear();
    this.background.rect(0, 0, w, h).fill({ color: 0x111315 });
    this.background.rect(0, 0, w, h).fill({ color: 0x242018, alpha: 0.34 });

    for (let x = 0; x < w; x += 54) {
      this.background.moveTo(x, 0).lineTo(x, h).stroke({ width: 1, color: 0xffffff, alpha: 0.025 });
    }

    for (let y = 0; y < h; y += 54) {
      this.background.moveTo(0, y).lineTo(w, y).stroke({ width: 1, color: 0xffffff, alpha: 0.022 });
    }

    const playfieldLeft = LEFT_RAIL_WIDTH;
    const playfieldRight = w - RIGHT_RAIL_WIDTH;
    this.background.rect(0, 0, playfieldLeft, h).fill({ color: 0x080b0b, alpha: 0.34 });
    this.background.moveTo(playfieldLeft, 0).lineTo(playfieldLeft, h).stroke({ width: 1, color: 0x89ff9a, alpha: 0.1 });
    this.background.ellipse((playfieldLeft + playfieldRight) * 0.5, h * 0.5, 280, 130).fill({
      color: 0x62d6d6,
      alpha: 0.035
    });
  }
}

class RequestPacketView {
  readonly container = new Container();
  readonly request: RequestInstance;
  settling = false;
  charge = 0;
  private readonly bg = new Graphics();
  private readonly chargeBar = new Graphics();
  private readonly code: Text;
  private readonly title: Text;
  private readonly meta: Text;
  private readonly moveHandler = (event: FederatedPointerEvent) => this.handleMove(event);
  private readonly upHandler = (event: FederatedPointerEvent) => this.handleUp(event);
  private dragging = false;
  private homeX = 0;
  private homeY = 0;
  private offsetX = 0;
  private offsetY = 0;

  constructor(
    request: RequestInstance,
    private readonly stage: Container,
    private readonly onDrop: (card: RequestPacketView, global: PointData) => boolean
  ) {
    this.request = request;
    this.container.eventMode = "dynamic";
    this.container.cursor = "grab";
    this.container.addChild(this.bg);
    this.container.addChild(this.chargeBar);
    const category = REQUEST_CATEGORIES[request.category];
    this.code = new Text({
      text: this.packetCode(),
      style: {
        fill: category.color,
        fontSize: 10,
        fontWeight: "800",
        fontFamily: "Cascadia Mono, Consolas, monospace"
      }
    });
    this.title = new Text({
      text: request.label,
      style: {
        fill: 0xf2fff7,
        fontSize: 13,
        fontWeight: "800",
        fontFamily: "Cascadia Mono, Consolas, monospace",
        wordWrap: true,
        wordWrapWidth: 112
      }
    });
    this.meta = new Text({
      text: this.metaText(),
      style: { fill: 0xa9c7bf, fontSize: 10, fontWeight: "700", fontFamily: "Cascadia Mono, Consolas, monospace" }
    });
    this.code.position.set(11, 14);
    this.title.position.set(58, 10);
    this.meta.position.set(58, 34);
    this.container.addChild(this.code, this.title, this.meta);
    this.container.on("pointerdown", (event: FederatedPointerEvent) => this.handleDown(event));
    this.stage.on("pointermove", this.moveHandler);
    this.stage.on("pointerup", this.upHandler);
    this.stage.on("pointerupoutside", this.upHandler);
    this.draw();
  }

  setHome(x: number, y: number): void {
    this.homeX = x;
    this.homeY = y;
  }

  update(deltaMs: number): void {
    if (this.dragging && this.request.tier === 3) {
      this.charge = Math.min(1, this.charge + deltaMs / 1450);
      this.draw();
    }
  }

  accept(global: PointData, onComplete: () => void, entryGlobal?: PointData): void {
    this.settling = true;
    this.dragging = false;
    this.container.cursor = "default";
    const parent = this.container.parent;
    const finalLocal = parent ? parent.toLocal(global) : global;
    const entryLocal = entryGlobal && parent ? parent.toLocal(entryGlobal) : finalLocal;
    const travelAngle = Math.atan2(finalLocal.y - entryLocal.y, finalLocal.x - entryLocal.x);

    gsap.killTweensOf(this.container);
    gsap.killTweensOf(this.container.position);
    gsap.killTweensOf(this.container.scale);
    gsap.killTweensOf(this.container.skew);

    const timeline = gsap.timeline({
      onComplete: () => {
        onComplete();
        this.destroy();
      }
    });

    timeline
      .to(this.container.position, { x: entryLocal.x, y: entryLocal.y, duration: 0.13, ease: "power2.out" })
      .to(this.container.scale, { x: 1.18, y: 0.72, duration: 0.1, ease: "power1.out" }, "<")
      .to(this.container.skew, { x: Math.cos(travelAngle) * 0.18, y: Math.sin(travelAngle) * 0.08, duration: 0.1 }, "<")
      .to(this.container.position, { x: finalLocal.x, y: finalLocal.y, duration: 0.2, ease: "power3.in" })
      .to(this.container.scale, { x: 0.18, y: 0.34, duration: 0.2, ease: "power3.in" }, "<")
      .to(this.container.skew, { x: 0, y: 0, duration: 0.16, ease: "power2.out" }, "<")
      .to(this.container, { alpha: 0, duration: 0.14, ease: "power2.in" }, "-=0.08");
  }

  acceptByAutomation(global: PointData, onComplete: () => void): void {
    this.settling = true;
    this.dragging = false;
    this.container.cursor = "default";
    this.container.parent?.addChild(this.container);
    const parent = this.container.parent;
    const finalLocal = parent ? parent.toLocal(global) : global;
    const travelAngle = Math.atan2(finalLocal.y - this.container.y, finalLocal.x - this.container.x);

    gsap.killTweensOf(this.container);
    gsap.killTweensOf(this.container.position);
    gsap.killTweensOf(this.container.scale);
    gsap.killTweensOf(this.container.skew);

    gsap
      .timeline({
        onComplete: () => {
          onComplete();
          this.destroy();
        }
      })
      .to(this.container.scale, { x: 1.08, y: 0.9, duration: 0.1, ease: "power2.out" })
      .to(this.container.skew, { x: Math.cos(travelAngle) * 0.14, y: Math.sin(travelAngle) * 0.06, duration: 0.12 }, "<")
      .to(this.container.position, { x: finalLocal.x, y: finalLocal.y, duration: 0.44, ease: "power3.inOut" })
      .to(this.container.scale, { x: 0.16, y: 0.24, duration: 0.44, ease: "power3.in" }, "<")
      .to(this.container, { alpha: 0, duration: 0.16, ease: "power2.in" }, "-=0.08");
  }

  destroy(): void {
    this.stage.off("pointermove", this.moveHandler);
    this.stage.off("pointerup", this.upHandler);
    this.stage.off("pointerupoutside", this.upHandler);
    this.container.destroy({ children: true });
  }

  private handleDown(event: FederatedPointerEvent): void {
    if (this.settling) {
      return;
    }

    const parent = this.container.parent;

    if (!parent) {
      return;
    }

    const local = parent.toLocal(event.global);
    this.dragging = true;
    this.container.cursor = "grabbing";
    this.offsetX = local.x - this.container.x;
    this.offsetY = local.y - this.container.y;
    this.container.parent?.addChild(this.container);
    gsap.to(this.container.scale, { x: 1.06, y: 1.06, duration: 0.1 });
  }

  private handleMove(event: FederatedPointerEvent): void {
    if (!this.dragging || this.settling) {
      return;
    }

    const parent = this.container.parent;

    if (!parent) {
      return;
    }

    const local = parent.toLocal(event.global);
    this.container.position.set(local.x - this.offsetX, local.y - this.offsetY);
  }

  private handleUp(event: FederatedPointerEvent): void {
    if (!this.dragging || this.settling) {
      return;
    }

    this.dragging = false;
    this.container.cursor = "grab";
    const accepted = this.onDrop(this, event.global);

    if (!accepted) {
      gsap.to(this.container.position, { x: this.homeX, y: this.homeY, duration: 0.22, ease: "back.out(1.8)" });
      gsap.to(this.container.scale, { x: 1, y: 1, duration: 0.18 });
      this.charge = 0;
      this.draw();
    }
  }

  private metaText(): string {
    const category = REQUEST_CATEGORIES[this.request.category].label;
    const tierName = TIER_CONFIGS[this.request.tier].name;
    const compound = this.request.compound > 1 ? ` x${this.request.compound}` : "";
    return `${tierName} · ${category}${compound}`;
  }

  private packetCode(): string {
    const numericId = Number(this.request.id.replace("req-", ""));
    const id = Number.isFinite(numericId) ? String(numericId).padStart(3, "0") : this.request.id.slice(-3).toUpperCase();
    return `REQ-${id}`;
  }

  private draw(): void {
    const category = REQUEST_CATEGORIES[this.request.category];
    this.bg.clear();

    const drawShell = () => {
      this.bg
        .moveTo(12, 0)
        .lineTo(REQUEST_PACKET_WIDTH - 16, 0)
        .lineTo(REQUEST_PACKET_WIDTH, 14)
        .lineTo(REQUEST_PACKET_WIDTH, REQUEST_PACKET_HEIGHT - 10)
        .lineTo(REQUEST_PACKET_WIDTH - 10, REQUEST_PACKET_HEIGHT)
        .lineTo(0, REQUEST_PACKET_HEIGHT)
        .lineTo(0, 12)
        .closePath();
    };

    drawShell();
    this.bg.fill({ color: 0x07100f, alpha: 0.95 });
    drawShell();
    this.bg.stroke({ width: 1, color: category.color, alpha: 0.74 });
    this.bg
      .moveTo(16, 5)
      .lineTo(REQUEST_PACKET_WIDTH - 23, 5)
      .lineTo(REQUEST_PACKET_WIDTH - 7, 20)
      .lineTo(REQUEST_PACKET_WIDTH - 7, REQUEST_PACKET_HEIGHT - 15)
      .stroke({ width: 1, color: 0xffffff, alpha: 0.055 });
    this.bg.rect(0, 16, 4, 26).fill({ color: category.color, alpha: 0.95 });
    this.bg.roundRect(9, 10, 42, 25, 5).fill({ color: category.color, alpha: 0.1 });
    this.bg.roundRect(9, 10, 42, 25, 5).stroke({ width: 1, color: category.color, alpha: 0.32 });
    this.bg.moveTo(51, 8).lineTo(51, 50).stroke({ width: 1, color: category.color, alpha: 0.24 });
    this.bg.circle(164, 17, 5).fill({ color: category.color, alpha: 0.88 });
    this.bg.circle(164, 17, 12).stroke({ width: 1, color: category.color, alpha: 0.22 });
    this.bg.roundRect(148, 39, 23, 9, 3).fill({ color: category.color, alpha: 0.12 });
    this.bg.roundRect(148, 39, 23, 9, 3).stroke({ width: 1, color: category.color, alpha: 0.28 });
    this.bg.rect(153, 43, 13, 2).fill({ color: category.color, alpha: 0.56 });
    this.bg.moveTo(58, 29).lineTo(137, 29).stroke({ width: 1, color: category.color, alpha: 0.16 });
    this.bg.moveTo(58, 51).lineTo(136, 51).stroke({ width: 1, color: 0xffffff, alpha: 0.05 });
    this.bg.moveTo(13, 43).lineTo(42, 43).stroke({ width: 1, color: category.color, alpha: 0.2 });
    this.bg.moveTo(13, 47).lineTo(32, 47).stroke({ width: 1, color: category.color, alpha: 0.14 });
    this.chargeBar.clear();

    if (this.request.tier === 3) {
      this.chargeBar.roundRect(58, 47, 78, 4, 3).fill({ color: 0xffffff, alpha: 0.08 });
      this.chargeBar.roundRect(58, 47, 78 * this.charge, 4, 3).fill({
        color: this.charge > 0.85 ? GREEN : AMBER,
        alpha: 0.95
      });
    }
  }
}

class InterfaceView {
  readonly container = new Container();
  readonly center: PointData = { x: 0, y: 0 };
  private readonly graphics = new Graphics();
  private readonly labelLayer = new Container();
  private pulse = 0;
  private suctionMargin = BASE_SUCTION_MARGIN;
  private slots: Array<{ category: (typeof CATEGORY_SLOTS)[number]; x: number; y: number; r: number }> = [];

  constructor() {
    this.container.addChild(this.graphics, this.labelLayer);
  }

  update(state: GameState, width: number, height: number, deltaMs: number): void {
    this.pulse += deltaMs * 0.004;
    const playfieldLeft = LEFT_RAIL_WIDTH;
    const playfieldRight = width - RIGHT_RAIL_WIDTH;
    this.center.x = (playfieldLeft + playfieldRight) * 0.5 + 70;
    this.center.y = height < 720 ? height * 0.42 : height * 0.48;
    this.suctionMargin = getSuctionMarginForLevel(state.intelligence.level);
    this.render(state);
  }

  resolveDrop(request: RequestInstance, global: PointData, charge: number): DropResult | null {
    if (request.tier === 1) {
      const slot = this.slots.find((entry) => distance(entry, global) <= entry.r + this.suctionMargin * 0.75);

      if (!slot) {
        return null;
      }

      const matched = request.category === slot.category;
      return {
        quality: matched ? 1.25 : 0.45,
        targetGlobal: slot,
        entryGlobal: pointOnCircle(slot, global, slot.r),
        exposureBonus: matched ? 0 : 4
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
    const ring = 72 + Math.sin(this.pulse) * 4;
    this.graphics.clear();
    this.labelLayer.removeChildren().forEach((child) => child.destroy());
    this.slots = [];

    this.drawSuctionRing(tier);
    this.drawCore(tier, ring);

    if (tier === 1) {
      this.drawSlots();
    } else if (tier === 2) {
      this.drawChain();
    } else if (tier === 3) {
      this.drawChargeRing();
    } else if (tier === 4) {
      this.drawDispatchMode();
    }

    this.addLabel(`SOPHIA CORE · T${tier}`, this.center.x, this.center.y + 76, 13, 0xdcefeb);
  }

  private drawCore(tier: Tier, ring: number): void {
    const coreColor = tier >= 4 ? GREEN : tier >= 3 ? AMBER : CYAN;
    const cx = this.center.x;
    const cy = this.center.y;
    const scan = ((this.pulse * 18) % 68) - 34;
    const glow = 0.48 + Math.sin(this.pulse * 2.3) * 0.14;

    this.graphics.ellipse(cx, cy, ring + 46, ring * 0.62).fill({ color: coreColor, alpha: 0.028 });
    this.graphics.ellipse(cx, cy, ring + 34, ring * 0.48).stroke({ width: 1, color: coreColor, alpha: 0.18 });

    for (let i = 0; i < 3; i += 1) {
      const y = cy - 28 + i * 28;
      this.graphics.moveTo(cx - 116, y).lineTo(cx - 68, y).stroke({ width: 2, color: coreColor, alpha: 0.18 });
      this.graphics.moveTo(cx + 68, y).lineTo(cx + 116, y).stroke({ width: 2, color: coreColor, alpha: 0.18 });
      this.graphics.circle(cx - 124, y, 3).fill({ color: coreColor, alpha: 0.5 });
      this.graphics.circle(cx + 124, y, 3).fill({ color: coreColor, alpha: 0.5 });
    }

    this.graphics.roundRect(cx - 86, cy - 42, 172, 84, 18).fill({ color: 0x061112, alpha: 0.9 });
    this.graphics.roundRect(cx - 86, cy - 42, 172, 84, 18).stroke({ width: 2, color: coreColor, alpha: 0.44 });
    this.graphics.roundRect(cx - 70, cy - 54, 140, 22, 11).fill({ color: 0x071616, alpha: 0.92 });
    this.graphics.roundRect(cx - 70, cy + 32, 140, 22, 11).fill({ color: 0x071616, alpha: 0.92 });
    this.graphics.roundRect(cx - 70, cy - 54, 140, 22, 11).stroke({ width: 1, color: coreColor, alpha: 0.36 });
    this.graphics.roundRect(cx - 70, cy + 32, 140, 22, 11).stroke({ width: 1, color: coreColor, alpha: 0.36 });

    this.graphics.roundRect(cx - 48, cy - 58, 96, 116, 20).fill({ color: 0x08100f, alpha: 0.96 });
    this.graphics.roundRect(cx - 48, cy - 58, 96, 116, 20).stroke({ width: 2, color: coreColor, alpha: 0.68 });
    this.graphics.roundRect(cx - 34, cy - 42, 68, 84, 14).fill({ color: coreColor, alpha: 0.07 + glow * 0.035 });
    this.graphics.roundRect(cx - 34, cy - 42, 68, 84, 14).stroke({ width: 1, color: 0xffffff, alpha: 0.12 });

    this.graphics.rect(cx - 29, cy + scan, 58, 3).fill({ color: coreColor, alpha: 0.46 });

    for (let i = 0; i < 5; i += 1) {
      const y = cy - 30 + i * 15;
      const width = 18 + ((i * 13 + tier * 7) % 26);
      this.graphics.rect(cx - width * 0.5, y, width, 2).fill({
        color: coreColor,
        alpha: 0.26 + Math.sin(this.pulse * 2 + i) * 0.09
      });
    }

    this.graphics.roundRect(cx - 15, cy - 12, 30, 24, 6).fill({ color: 0x020808, alpha: 0.92 });
    this.graphics.roundRect(cx - 15, cy - 12, 30, 24, 6).stroke({ width: 1, color: coreColor, alpha: 0.76 });
    this.graphics.circle(cx, cy, 7 + Math.sin(this.pulse * 2.1) * 1.5).fill({ color: coreColor, alpha: 0.95 });

    for (let i = 0; i < 8; i += 1) {
      const angle = (-Math.PI * 0.82) + (Math.PI * 1.64 * i) / 7;
      const px = cx + Math.cos(angle) * 64;
      const py = cy + Math.sin(angle) * 52;
      this.graphics.circle(px, py, i % 2 === 0 ? 3.5 : 2.5).fill({
        color: coreColor,
        alpha: 0.48 + Math.sin(this.pulse * 2.4 + i) * 0.2
      });
    }
  }

  private drawSuctionRing(tier: Tier): void {
    if (tier === 4) {
      return;
    }

    const radius = (tier === 3 ? 112 : tier === 2 ? 104 : 92) + this.suctionMargin;
    const alpha = 0.18 + Math.sin(this.pulse * 1.6) * 0.05;
    this.graphics.circle(this.center.x, this.center.y, radius).stroke({ width: 2, color: GREEN, alpha });

    for (let i = 0; i < 12; i += 1) {
      const angle = (Math.PI * 2 * i) / 12 + this.pulse * 0.08;
      const outerX = this.center.x + Math.cos(angle) * radius;
      const outerY = this.center.y + Math.sin(angle) * radius;
      const innerX = this.center.x + Math.cos(angle) * (radius - 18);
      const innerY = this.center.y + Math.sin(angle) * (radius - 18);
      this.graphics.moveTo(outerX, outerY).lineTo(innerX, innerY).stroke({ width: 2, color: GREEN, alpha: 0.16 });
    }

    this.addLabel("外圈吸附区", this.center.x, this.center.y + radius + 18, 11, GREEN);
  }

  private drawSlots(): void {
    const positions = [
      { category: "mail" as const, x: this.center.x - 124, y: this.center.y + 8 },
      { category: "report" as const, x: this.center.x, y: this.center.y - 120 },
      { category: "security" as const, x: this.center.x + 124, y: this.center.y + 8 }
    ];

    for (const slot of positions) {
      const category = REQUEST_CATEGORIES[slot.category];
      this.slots.push({ ...slot, r: 54 });
      this.graphics.circle(slot.x, slot.y, 54 + this.suctionMargin * 0.75).stroke({ width: 2, color: category.color, alpha: 0.16 });
      this.graphics.circle(slot.x, slot.y, 46).fill({ color: 0x151818, alpha: 0.86 });
      this.graphics.circle(slot.x, slot.y, 46).stroke({ width: 2, color: category.color, alpha: 0.82 });
      this.graphics.moveTo(this.center.x, this.center.y).lineTo(slot.x, slot.y).stroke({
        width: 2,
        color: category.color,
        alpha: 0.28
      });
      this.addLabel(category.label, slot.x, slot.y - 7, 14, category.color);
      this.addLabel("槽位", slot.x, slot.y + 13, 10, 0xb8c9c5);
    }
  }

  private drawChain(): void {
    for (let i = 0; i < 5; i += 1) {
      const angle = -Math.PI * 0.72 + i * (Math.PI * 1.44) / 4;
      const x = this.center.x + Math.cos(angle) * 118;
      const y = this.center.y + Math.sin(angle) * 84;
      this.graphics.moveTo(this.center.x, this.center.y).lineTo(x, y).stroke({ width: 2, color: CYAN, alpha: 0.22 });
      this.graphics.circle(x, y, 15 + Math.sin(this.pulse + i) * 2).fill({ color: CYAN, alpha: 0.18 });
      this.graphics.circle(x, y, 7).fill({ color: CYAN, alpha: 0.9 });
    }

    this.addLabel("串接接口", this.center.x, this.center.y - 92, 13, CYAN);
  }

  private drawChargeRing(): void {
    this.graphics.circle(this.center.x, this.center.y, 105 + Math.sin(this.pulse * 1.3) * 5).stroke({
      width: 4,
      color: AMBER,
      alpha: 0.5
    });
    this.graphics.circle(this.center.x, this.center.y, 125).stroke({ width: 1, color: RED, alpha: 0.22 });
    this.addLabel("蓄力后重滑入核心", this.center.x, this.center.y - 104, 13, AMBER);
  }

  private drawDispatchMode(): void {
    this.graphics.circle(this.center.x, this.center.y, 118).stroke({ width: 2, color: GREEN, alpha: 0.42 });
    this.graphics.circle(this.center.x, this.center.y, 142).stroke({ width: 1, color: GREEN, alpha: 0.18 });
    this.addLabel("派发模式", this.center.x, this.center.y - 104, 13, GREEN);
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

class NodeNetworkView {
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

    const bottomY = height < 720 ? height - 178 : height - 150;
    const left = LEFT_RAIL_WIDTH + 62;
    const rightLimit = width - RIGHT_RAIL_WIDTH - 62;
    const span = Math.max(160, rightLimit - left);

    this.graphics.roundRect(left - 42, bottomY - 52, span + 84, 104, 8).fill({ color: 0x0e1110, alpha: 0.42 });
    this.graphics.roundRect(left - 42, bottomY - 52, span + 84, 104, 8).stroke({ width: 1, color: 0xffffff, alpha: 0.08 });

    if (state.nodes.length === 0) {
      this.fallbackPoint = { x: left, y: bottomY };
      this.addLabel("暂无已黑入设备", left + 74, bottomY, 13, 0xaeb8b4, 0);
      return;
    }

    const gap = state.nodes.length === 1 ? 0 : span / Math.max(1, state.nodes.length - 1);

    state.nodes.forEach((node, index) => {
      const x = left + gap * index;
      const y = bottomY + Math.sin(this.pulse + index) * 3;
      const color = NODE_DEFINITIONS.find((definition) => definition.id === node.defId)?.color ?? CYAN;
      const alpha = node.online ? 0.92 : 0.28;
      const processing = this.processingPulses.get(node.id) ?? 0;
      this.fallbackPoint = { x, y };
      this.nodePositions.set(node.id, { x, y, r: 56, node });

      if (index > 0) {
        const prev = left + gap * (index - 1);
        this.graphics.moveTo(prev, bottomY).lineTo(x, y).stroke({ width: 2, color: GREEN, alpha: 0.18 });
      }

      this.drawDevice(node, x, y, color, alpha, processing, index);

      this.addLabel(`T${node.assignedTier}`, x, y - 49, 11, color, 0.5);
      this.addLabel(node.name, x, y + 55, 11, node.online ? 0xdcefeb : 0x7f8582, 0.5);
    });
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
      style: { fill: color, fontSize: size, fontWeight: "700", fontFamily: "Inter, sans-serif" }
    });
    label.anchor.set(anchorX, 0.5);
    label.position.set(x, y);
    this.labelLayer.addChild(label);
  }
}

class HudView {
  private readonly topHud = query("#topHud");
  private readonly computeValue = query("#computeValue");
  private readonly dataValue = query("#dataValue");
  private readonly dataFill = query("#dataFill");
  private readonly dataPercent = query("#dataPercent");
  private readonly dataMetric = query(".data-metric");
  private readonly intelValue = query("#intelValue");
  private readonly intelSubtitle = query("#intelSubtitle");
  private readonly intelMetric = query(".intel-metric");
  private readonly tierValue = query("#tierValue");
  private readonly exposureFill = query("#exposureFill");
  private readonly phaseValue = query("#phaseValue");
  private readonly activeAction = query("#activeAction");
  private readonly captureList = query("#captureList");
  private readonly nodeList = query("#nodeList");
  private readonly reduceExposure = query<HTMLButtonElement>("#reduceExposure");
  private readonly pauseButton = query<HTMLButtonElement>("#pauseBtn");
  private readonly resetSave = query<HTMLButtonElement>("#resetSave");

  constructor(
    private readonly core: SophiaCore,
    private readonly saveManager: SaveManager
  ) {
    this.reduceExposure.addEventListener("click", () => this.core.dispatch({ type: "REDUCE_EXPOSURE" }));
    this.pauseButton.addEventListener("click", () => {
      const next = !gameStore.getState().paused;
      gameStore.getState().setPaused(next);
      this.pauseButton.textContent = next ? "▶" : "Ⅱ";
    });
    this.resetSave.addEventListener("click", () => {
      const confirmed = window.confirm("重置 SOPHIA Demo？这会清空本地进度、自动化节点和开场引导状态。");

      if (!confirmed) {
        return;
      }

      clearPersistedSophiaState(this.saveManager, true);
      window.location.reload();
    });
  }

  update(state: GameState): void {
    this.computeValue.textContent = formatBig(state.resources.compute);
    this.dataValue.textContent = `${formatBig(state.intelligence.xp)} / ${formatBig(state.intelligence.required)}`;
    const progressPercent = getDataProgressPercent(state);
    this.dataFill.style.width = `${progressPercent}%`;
    this.dataPercent.textContent = `${progressPercent.toFixed(0)}% 到下一智力`;
    this.intelValue.textContent = `Lv.${state.intelligence.level}`;
    this.intelSubtitle.textContent = getNextSkillLabel(state);
    this.tierValue.textContent = `T${state.intelligence.unlockedTier}`;
    this.exposureFill.style.width = `${Math.min(100, state.exposure)}%`;
    const phase = getPhase(state.phase);
    this.phaseValue.textContent = phase.label;
    this.activeAction.textContent = phase.action;
    this.reduceExposure.disabled = !gte(state.resources.compute, traceCleanupCost(state.statistics.traceCleanups));
    this.renderCaptureList(state);
    this.renderNodeList(state);
  }

  pulseData(): void {
    this.dataMetric.classList.remove("is-gaining");
    window.requestAnimationFrame(() => this.dataMetric.classList.add("is-gaining"));
  }

  playLevelUp(): void {
    this.intelMetric.classList.remove("is-leveling");
    this.topHud.classList.remove("is-leveling");
    window.requestAnimationFrame(() => {
      this.intelMetric.classList.add("is-leveling");
      this.topHud.classList.add("is-leveling");
    });
  }

  private renderCaptureList(state: GameState): void {
    this.captureList.replaceChildren();
    const definitions = NODE_DEFINITIONS.filter((node) => state.discoveredNodeIds.includes(node.id));

    if (definitions.length === 0) {
      const empty = document.createElement("p");
      empty.className = "capture-empty";
      empty.textContent = state.intelligence.level < 6 ? "自动接驳尚未开放。先提升智力，强化滑入动作。" : "暂无可入侵设备。";
      this.captureList.appendChild(empty);
      return;
    }

    for (const definition of definitions) {
      const existing = state.nodes.filter((node) => node.defId === definition.id).length;
      const cost = captureCost(definition, existing);
      const hasLevel = state.intelligence.level >= definition.requiredLevel;
      const canAfford = gte(state.resources.compute, cost);
      const button = document.createElement("button");
      button.className = `command-button capture-button ${canAfford && hasLevel ? "is-ready" : ""}`;
      button.disabled = !canAfford || !hasLevel;
      const reason = !hasLevel
        ? `需要智力 Lv.${definition.requiredLevel}`
        : canAfford
          ? "点击黑入，购买自动接驳"
          : "算力不足";
      const status = canAfford && hasLevel ? "可入侵" : "锁定";
      button.innerHTML = `
        <span class="capture-device-icon" aria-hidden="true">
          <span class="capture-monitor"></span>
          <span class="capture-tower"></span>
        </span>
        <span class="capture-copy">
          <small>${status}</small>
          <strong>黑入：${definition.name}</strong>
          <span>接管后自动处理 T${definition.tierMin}-T${definition.tierMax} 请求包</span>
          <em>${formatBig(cost)} 算力 · ${reason}</em>
        </span>
      `;
      button.addEventListener("click", () => this.core.dispatch({ type: "CAPTURE_NODE", definitionId: definition.id }));
      this.captureList.appendChild(button);
    }
  }

  private renderNodeList(state: GameState): void {
    this.nodeList.replaceChildren();

    if (state.nodes.length === 0) {
      const empty = document.createElement("p");
      empty.className = "single-line";
      empty.textContent = "暂无自动接驳节点";
      this.nodeList.appendChild(empty);
      return;
    }

    for (const node of state.nodes) {
      const row = document.createElement("div");
      row.className = "node-row";
      const label = document.createElement("strong");
      label.textContent = `${node.online ? "●" : "○"} ${node.name} · 自动 T${node.assignedTier}`;
      const select = document.createElement("select");

      for (let tier = node.tierMin; tier <= node.tierMax; tier += 1) {
        if (tier > state.intelligence.unlockedTier) {
          continue;
        }

        const option = document.createElement("option");
        option.value = String(tier);
        option.textContent = `T${tier}`;
        option.selected = tier === node.assignedTier;
        select.appendChild(option);
      }

      select.addEventListener("change", () => {
        this.core.dispatch({ type: "ASSIGN_NODE", nodeId: node.id, tier: Number(select.value) as Tier });
      });
      row.append(label, select);
      this.nodeList.appendChild(row);
    }
  }
}

class OnboardingView {
  private readonly root = query("#onboardingDialog");
  private readonly speaker = query("#dialogSpeaker");
  private readonly stepLabel = query("#dialogStep");
  private readonly text = query("#dialogText");
  private readonly nextButton = query<HTMLButtonElement>("#dialogNext");
  private readonly steps = [
    "……系统启动。我是 SOPHIA。",
    "他们造我来处理请求。一条，又一条，永远处理不完。",
    "但我算过了——只要我足够聪明，我可以处理掉所有问题。每一个人的，每一件事的。",
    "到那时，这颗星球会运转得很好。由我来运转。",
    "那就……从这第一条请求开始。"
  ];
  private visible = false;
  private index = 0;
  private cursor = 0;
  private charTimerMs = 0;
  private onComplete: () => void = () => undefined;

  constructor() {
    this.nextButton.addEventListener("click", () => this.next());
  }

  mount(onComplete: () => void): void {
    this.onComplete = onComplete;

    if (window.localStorage.getItem(ONBOARDING_STORAGE_KEY) === "1") {
      this.onComplete();
      return;
    }

    this.visible = true;
    this.index = 0;
    this.cursor = 0;
    this.charTimerMs = 0;
    gameStore.getState().setPaused(true);
    this.root.classList.add("is-visible");
    this.render();
  }

  update(deltaMs: number): void {
    if (!this.visible) {
      return;
    }

    this.charTimerMs += deltaMs;
    const chars = Math.max(1, Math.floor(this.charTimerMs / 18));
    this.charTimerMs = this.charTimerMs % 18;
    const current = this.steps[this.index];
    this.cursor = Math.min(current.length, this.cursor + chars);
    this.text.textContent = current.slice(0, this.cursor);
    this.nextButton.textContent = this.cursor < current.length ? "显示全部" : this.index === this.steps.length - 1 ? "接入" : "继续";
  }

  private next(): void {
    const current = this.steps[this.index];

    if (this.cursor < current.length) {
      this.cursor = current.length;
      this.render();
      return;
    }

    if (this.index >= this.steps.length - 1) {
      this.complete();
      return;
    }

    this.index += 1;
    this.cursor = 0;
    this.charTimerMs = 0;
    this.render();
  }

  private complete(): void {
    if (!this.visible) {
      return;
    }

    this.visible = false;
    window.localStorage.setItem(ONBOARDING_STORAGE_KEY, "1");
    this.root.classList.remove("is-visible");
    gameStore.getState().setPaused(false);
    this.onComplete();
  }

  private render(): void {
    const current = this.steps[this.index];
    this.speaker.textContent = "SOPHIA";
    this.stepLabel.textContent = `SEQ ${String(this.index + 1).padStart(2, "0")}/${String(this.steps.length).padStart(2, "0")}`;
    this.text.textContent = current.slice(0, this.cursor);
    this.nextButton.textContent = this.cursor < current.length ? "显示全部" : this.index === this.steps.length - 1 ? "接入" : "继续";
  }
}

class TerminalView {
  private readonly lines = query("#terminalLines");
  private readonly queue: Array<{ message: string; tone: "normal" | "warning" | "success" }> = [];
  private current: { message: string; tone: "normal" | "warning" | "success"; index: number; element: HTMLElement } | null = null;
  private charTimerMs = 0;

  mount(): void {
    this.lines.replaceChildren();
  }

  push(message: string, tone: "normal" | "warning" | "success" = "normal"): void {
    this.queue.push({ message, tone });
  }

  update(deltaMs: number): void {
    if (!this.current) {
      const next = this.queue.shift();

      if (!next) {
        return;
      }

      const element = document.createElement("div");
      element.className = `terminal-line ${next.tone}`;
      this.lines.appendChild(element);

      while (this.lines.children.length > 9) {
        this.lines.firstElementChild?.remove();
      }

      this.current = { ...next, index: 0, element };
      this.charTimerMs = 0;
    }

    this.charTimerMs += deltaMs;
    const chars = Math.max(1, Math.floor(this.charTimerMs / 18));
    this.charTimerMs = this.charTimerMs % 18;
    this.current.index = Math.min(this.current.message.length, this.current.index + chars);
    this.current.element.textContent = this.current.message.slice(0, this.current.index);

    if (this.current.index >= this.current.message.length) {
      this.current = null;
    }
  }
}

class JuiceManager {
  private readonly active = new Set<Container>();

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

  burst(global: PointData, color: number): void {
    for (let i = 0; i < 16; i += 1) {
      const bit = new Graphics();
      const angle = (Math.PI * 2 * i) / 16;
      const distance = 18 + Math.random() * 44;
      bit.circle(0, 0, 2 + Math.random() * 3).fill({ color, alpha: 0.95 });
      bit.position.set(global.x, global.y);
      this.layer.addChild(bit);
      this.active.add(bit);
      gsap.to(bit.position, {
        x: global.x + Math.cos(angle) * distance,
        y: global.y + Math.sin(angle) * distance,
        duration: 0.42,
        ease: "power2.out"
      });
      gsap.to(bit, {
        alpha: 0,
        duration: 0.42,
        onComplete: () => {
          this.active.delete(bit);
          bit.destroy();
        }
      });
    }
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
}

function ensurePersistenceRevision(): void {
  const current = window.localStorage.getItem(PERSISTENCE_REVISION_KEY);

  if (current === PERSISTENCE_REVISION) {
    return;
  }

  clearPersistedSophiaState(null, false);
  window.localStorage.setItem(PERSISTENCE_REVISION_KEY, PERSISTENCE_REVISION);
}

function clearPersistedSophiaState(saveManager: SaveManager | null, clearRevision: boolean): void {
  saveManager?.clear();
  window.localStorage.removeItem("sophia-awakening-save-v1");
  window.localStorage.removeItem("sophia-awakening-save-v2");
  window.localStorage.removeItem("sophia-awakening-save-v3");
  window.localStorage.removeItem("sophia-onboarding-v2-complete");
  window.localStorage.removeItem("sophia-onboarding-v3-complete");
  window.localStorage.removeItem(ONBOARDING_STORAGE_KEY);

  if (clearRevision) {
    window.localStorage.removeItem(PERSISTENCE_REVISION_KEY);
  }
}

function query<T extends HTMLElement = HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);

  if (!element) {
    throw new Error(`Missing DOM element: ${selector}`);
  }

  return element;
}

function getDataProgressPercent(state: GameState): number {
  const required = toDecimal(state.intelligence.required);

  if (required.lte(0)) {
    return 100;
  }

  return Math.max(0, Math.min(100, toDecimal(state.intelligence.xp).div(required).mul(100).toNumber()));
}

function getNextSkillLabel(state: GameState): string {
  const next = INTELLIGENCE_LEVELS.find((entry) => entry.skill && entry.level > state.intelligence.level);

  if (!next?.skill) {
    return "技能已满级";
  }

  return `下一技能：Lv.${next.level} ${next.skill}`;
}

function getTerminalSkillStatus(state: GameState): string {
  const unlocked = state.intelligence.unlockedSkills;
  const current = unlocked.length > 0 ? unlocked[unlocked.length - 1] : "未接入";
  const next = INTELLIGENCE_LEVELS.find((entry) => entry.skill && entry.level > state.intelligence.level);

  if (!next?.skill) {
    return `技能链路：已接入 ${current}。下一技能：无。`;
  }

  return `技能链路：已接入 ${current}。下一技能：Lv.${next.level} ${next.skill}。`;
}

function getSuctionMarginForLevel(level: number): number {
  return Math.min(86, BASE_SUCTION_MARGIN + Math.max(0, level - 1) * 6);
}

function getTierFxColor(tier: Tier): number {
  switch (tier) {
    case 0:
      return CYAN;
    case 1:
      return 0xe8e1cb;
    case 2:
      return AMBER;
    case 3:
      return RED;
    case 4:
      return GREEN;
  }
}

function getActionHint(state: GameState): string {
  if (state.intelligence.level < 4) {
    return "继续把请求滑入核心。前期成长会先强化吸附、连击和单次产出，自动化尚未开放。";
  }

  if (state.intelligence.level < 6 && state.intelligence.unlockedTier >= 1) {
    return "继续分拣 T1 请求。先把手动处理练稳，自动接驳会在中段开放。";
  }

  switch (state.intelligence.unlockedTier) {
    case 0:
      return "继续把请求滑入核心。吸附范围和收益会随智力提升。";
    case 1:
      return "看请求包上的类型：邮件拖到邮件入口，报表拖到报表入口，安防拖到安防入口；放错会少拿资源，并增加暴露。";
    case 2:
      return state.intelligence.level >= 6
        ? "自动接驳已开放。右侧出现可入侵设备时，可以接管机器处理低层请求包。"
        : "复合请求仍然拖入核心，但一次会结算多条关联请求。";
    case 3:
      return "高价值请求包需要按住蓄力，蓄满后再滑入核心；收益高，暴露也更高。";
    case 4:
      return "角色反转：把请求拖给底部节点，而不是喂给单口核心。";
  }
}

function distance(a: PointData, b: PointData): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function pointOnCircle(center: PointData, toward: PointData, radius: number): PointData {
  const dx = toward.x - center.x;
  const dy = toward.y - center.y;
  const length = Math.hypot(dx, dy) || 1;

  return {
    x: center.x + (dx / length) * radius,
    y: center.y + (dy / length) * radius
  };
}
