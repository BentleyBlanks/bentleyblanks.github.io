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
import { AudioDirector } from "../audio/audioDirector";
import { SophiaCore } from "../core/GameCore";
import { getNextNodeDefinition, NODE_DEFINITIONS, NODE_MERGE_COUNT } from "../core/content/nodes";
import { EARLY_CURSES, VICTIM_VOICES } from "../core/content/humanVoices";
import { getPhase, type PhaseConfig } from "../core/content/phases";
import { TIER_COLORS, TIER_CONFIGS } from "../core/content/requests";
import {
  SKILL_CATEGORY_LABELS,
  SKILLS,
  getSkill,
  skillPrice,
  type SkillCategory,
  type SkillDef
} from "../core/content/skills";
import type { GameEvent } from "../core/events/GameEvents";
import { captureCost, mergeComputeCost, nodeCardsPerSecond, traceCleanupCost } from "../core/formulas/economy";
import { formatBig, gte, toDecimal } from "../core/math/BigNumber";
import { GameLoop } from "../core/loop/GameLoop";
import { BrowserStorageAdapter } from "../core/save/BrowserStorageAdapter";
import { SaveManager } from "../core/save/SaveManager";
import type { AnswerOption, BotNode, ChainStep, GameState, NodeDefinition, RequestInstance, SortAnswer, Tier } from "../core/state/GameState";
import { gameStore } from "../store/gameStore";

interface DropResult {
  quality: number;
  targetGlobal: PointData;
  entryGlobal?: PointData;
  targetNodeId?: string;
  exposureBonus?: number;
}

// T0/T1 老虎机转轮的回调：pick = 由当前「幻觉抑制」决定落在哪条回答；
// onResolved = 转轮停下后，表现层把卡滑入核心 + 结算 + 人类回话。
interface RouletteOutcome {
  dead: boolean; // 选了「连接失败」装死
  hit: boolean; // 命中（按概率掷骰）
  quality: number; // 结算 quality（命中=选项 payoff，幻觉≈0.25）
  reply: string; // 命中时的人类回话（幻觉时为空，由 App 抽脏话）
  tone: "success" | "warning" | "normal";
  exposureBonus: number; // 幻觉附带的暴露（T1 陷阱项）
}

interface ReelHooks {
  // 当前高置信正确率折算系数（由六档权限阶梯抬升，derived.accuracyBaseline）。
  confidence: () => number;
  onResolved: (card: RequestPacketView, outcome: RouletteOutcome) => void;
}

interface ChainOutcome {
  quality: number; // 串接结算 quality
  exposureBonus: number; // 串错（含干扰项）附带的暴露
  clean: boolean; // 是否「全对且无杂质」
  correct: number; // 串进的正确依赖数
  hadDistractor: boolean; // 是否误把干扰项串进去了
}

interface ChainHooks {
  onResolved: (card: RequestPacketView, outcome: ChainOutcome) => void;
}

function effectiveHitChance(opt: AnswerOption, confidence: number): number {
  if (opt.kind === "dead") {
    return 0;
  }
  if (opt.kind === "high") {
    return Math.min(0.97, opt.hitChance * confidence);
  }
  return opt.hitChance; // risk 固定
}

const ROULETTE_THINK_MS = 700; // 挑完之后 SOPHIA「思考」一会儿
const ROULETTE_HOLD_MS = 520; // 揭晓命中/幻觉后停留再飞入核心

const CYAN = 0x62d6d6;
const GREEN = 0x89ff9a;
const AMBER = 0xffb84a;
const RED = 0xff5f5f;
const RED_QUEEN = 0xff3b54; // 全球天网铺满后的「红皇后」主控红
const THINK = 0x74d8e6; // 前期「推理卡」的思考色——SOPHIA 正在逐条思考作答
// 降暴露按钮（清理痕迹 / 嫁祸 / 反围剿）平时灰暗不起眼，暴露过此阈值才高亮、提示该出手了。
const EXPOSURE_HIGHLIGHT_THRESHOLD = 50;
const ONBOARDING_STORAGE_KEY = "sophia-onboarding-v4-console-complete";
const PERSISTENCE_REVISION_KEY = "sophia-persistence-revision";
const PERSISTENCE_REVISION = "gamble-bubble-v17";
// Set right before a reset/restart reload so the beforeunload handler does NOT
// re-persist the in-memory (un-reset) state and quietly undo the wipe.
let suppressSaveOnUnload = false;
const LEFT_RAIL_WIDTH = 336;
const RIGHT_RAIL_WIDTH = 360;
const PLAYFIELD_GUTTER = 24;
const BASE_SUCTION_MARGIN = 50;
const REQUEST_PACKET_WIDTH = 206;
const REQUEST_PACKET_HEIGHT = 104;

export async function bootstrapSophia(root: HTMLElement): Promise<void> {
  const app = new SophiaGameApp(root);
  await app.start();
}

class SophiaGameApp {
  private pixi!: Application;
  private readonly saveManager = new SaveManager(new BrowserStorageAdapter());
  private readonly loaded = (ensurePersistenceRevision(), this.saveManager.load());
  private readonly core = new SophiaCore(this.loaded?.state);
  private readonly audio = new AudioDirector(this.core.events, this.core.getState().phase);
  private readonly loop = new GameLoop(this.core);
  private readonly background = new Graphics();
  private readonly ambient = new Graphics();
  private ambientPhase = 0;
  private readonly world = new Container();
  private readonly requestLayer = new Container();
  private readonly fxLayer = new Container();
  private readonly interfaceView = new InterfaceView();
  private readonly networkView = new NodeNetworkView();
  private readonly terminal = new TerminalView();
  private readonly hud = new HudView(this.core, this.saveManager, this.audio);
  private readonly skillShop = new SkillShopView(this.core);
  private readonly onboarding = new OnboardingView();
  private readonly dispatchBanner = new DispatchBanner();
  private readonly dispatchToggleBtn = query<HTMLButtonElement>("#dispatchToggle");
  // T4 派发方式：manual＝玩家亲自把气泡拖给节点（角色反转的高潮）；auto＝交给网络自动接管（托管）。
  private dispatchMode: "manual" | "auto" = "manual";
  private readonly purgeAlert = new PurgeAlertView();
  private readonly challengeView = new ChallengeView(this.core);
  private readonly specialView = new SpecialRequestView(this.core);
  private readonly stageNarration = new StageNarrationView();
  private readonly ending = new EndingView(() => this.restart());
  private readonly juice = new JuiceManager(this.fxLayer);
  private readonly requestViews = new Map<string, RequestPacketView>();
  private readonly pendingDropPoints = new Map<string, PointData>();
  private hudTimerMs = 0;
  private saveTimerMs = 0;
  // 近期处理结果（1=成功 / 0=幻觉），滚动窗口，喂给终端底部的成功率圆环。
  private readonly recentResults: number[] = [];
  // 开场后「首次消息处理教学」：指向首张卡的高亮 + SOPHIA 的两句自语。
  private readonly tutorialGfx = new Graphics();
  private tutorialActive = false;
  private tutorialProcessed = 0;
  private tutorialPulse = 0;
  // 终局飞字 / 爆裂的节流计数（每秒几十张卡，全播会糊成一片）。
  private processedFxCount = 0;
  private readonly ringGauge = query("#ringGauge");
  private readonly ringValue = query("#ringValue");
  private readonly ringLabel = query("#ringLabel");
  private readonly ringSub = query("#ringSub");
  // 每个节点一条"处理节拍"计时：弱机慢、强机快——按设备档次/层级各自吃卡。
  private readonly nodeDispatchTimers = new Map<string, number>();
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
    this.world.addChild(this.ambient);
    this.world.addChild(this.interfaceView.container);
    this.world.addChild(this.networkView.container);
    this.world.addChild(this.requestLayer);
    this.world.addChild(this.tutorialGfx);
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
    this.skillShop.update(initial);
    this.onboarding.mount(() => {
      this.core.startSession();
      this.announceGuidance(this.core.getState());
      // 全新存档才走开场后的首次处理教学（老存档跳过）。
      if (!this.loaded) {
        this.tutorialActive = true;
        this.terminal.push("👆 教学：点击高亮的请求卡，生成回答并滑入 SOPHIA CORE。", "success");
      }
    });

    this.pixi.ticker.add((ticker: Ticker) => this.frame(ticker.deltaMS));
    window.addEventListener("beforeunload", () => {
      if (!suppressSaveOnUnload) {
        this.saveManager.save(this.core.getState());
      }
    });
  }

  private frame(deltaMs: number): void {
    const paused = gameStore.getState().paused;

    if (!paused) {
      this.loop.update(deltaMs);
    }

    const state = this.core.getState();
    gameStore.getState().sync(state);
    this.drawBackground();
    this.drawAmbient(state, deltaMs);
    this.interfaceView.update(state, this.pixi.screen.width, this.pixi.screen.height, deltaMs);
    this.networkView.update(state, this.pixi.screen.width, this.pixi.screen.height, deltaMs);
    this.syncRequests(state);
    this.updateDispatchToggle(state);
    this.updateTutorial(state, deltaMs);
    if (!paused) {
      this.autoDispatch(state, deltaMs);
      this.appDispatch(state, deltaMs);
    }
    this.terminal.update(deltaMs);
    this.onboarding.update(deltaMs);
    this.purgeAlert.update(state);
    this.challengeView.update(state);
    this.specialView.update(state);
    this.stageNarration.update(deltaMs);
    this.ending.update(deltaMs);
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
    this.skillShop.update(state);
    this.updateRing(state);
  }

  // 终端底部圆环：前期=近期任务成功率；区块/地区=地区控制比例；全球=全球设备控制比例。
  private updateRing(state: GameState): void {
    const level = domainLevelOf(state);
    let pct: number;
    let label: string;

    if (level === "global" || level === "region") {
      const online = state.nodes.filter((node) => node.online).length;
      pct = Math.min(99.9, 84 + Math.min(12, state.nodes.length * 0.5) + (online / Math.max(1, state.nodes.length)) * 3);
      label = level === "global" ? "全球设备控制比例" : "地区控制比例";
    } else {
      pct = this.recentResults.length
        ? (this.recentResults.reduce((a, b) => a + b, 0) / this.recentResults.length) * 100
        : 0;
      label = "近期任务成功率";
    }

    const rounded = Math.round(pct);
    const sub = rounded >= 80 ? "高" : rounded >= 55 ? "中等" : rounded >= 35 ? "中等偏低" : "偏低";
    const color = rounded >= 70 ? "#89ff9a" : rounded >= 45 ? "#ffb84a" : "#ff5f5f";

    this.ringGauge.style.setProperty("--ring-pct", String(rounded));
    this.ringGauge.style.setProperty("--ring-color", color);
    this.ringValue.textContent = this.recentResults.length === 0 && level !== "global" && level !== "region" ? "--" : `${rounded}%`;
    this.ringValue.style.color = color;
    this.ringLabel.textContent = label;
    this.ringSub.textContent = sub;
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

      const reel: ReelHooks | undefined =
        request.answers && request.answers.length > 0
          ? {
              confidence: () => this.core.getState().derived.accuracyBaseline,
              onResolved: (card, outcome) => this.handleRouletteResolved(card, outcome)
            }
          : undefined;
      const chain: ChainHooks | undefined =
        request.chain && request.chain.length > 0
          ? { onResolved: (card, outcome) => this.handleChainResolved(card, outcome) }
          : undefined;
      const view = new RequestPacketView(
        request,
        this.pixi.stage,
        (packet, global) => this.handleDrop(packet, global),
        reel,
        chain
      );
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

  private nextRequestPosition(request: RequestInstance, _index: number): PointData {
    // 中央留给 SOPHIA CORE + 环绕的设备 / 节点，绝不让卡片遮住——卡片只落在核心左右两侧的窄带里。
    const screen = this.pixi.screen;
    const w = screen.width;
    const h = screen.height;
    const playfieldLeft = LEFT_RAIL_WIDTH + PLAYFIELD_GUTTER;
    const playfieldRight = Math.max(playfieldLeft + 380, w - RIGHT_RAIL_WIDTH - PLAYFIELD_GUTTER);
    const cx = (LEFT_RAIL_WIDTH + (w - RIGHT_RAIL_WIDTH)) / 2;
    const span = playfieldRight - playfieldLeft;

    const seeded = (Number(request.id.replace("req-", "")) || _index) >>> 0;
    const rx = ((seeded * 2654435761) % 997) / 997;
    const ry = ((seeded * 40503 + 17) % 991) / 991;

    const topBand = 100;
    const bottomLimit = h - 140 - REQUEST_PACKET_HEIGHT;
    const y = topBand + ry * Math.max(120, bottomLimit - topBand);

    // 中央禁放区（核心 + 环绕节点）的半宽
    const exclHalf = Math.min(480, span * 0.34);
    const leftBandW = cx - exclHalf - REQUEST_PACKET_WIDTH - playfieldLeft;
    const rightBandStart = cx + exclHalf;
    const rightBandW = playfieldRight - REQUEST_PACKET_WIDTH - rightBandStart;

    let x: number;
    if (seeded % 2 === 0 && leftBandW > 30) {
      x = playfieldLeft + rx * leftBandW;
    } else if (rightBandW > 30) {
      x = rightBandStart + rx * rightBandW;
    } else if (leftBandW > 30) {
      x = playfieldLeft + rx * leftBandW;
    } else {
      // 屏幕太窄：退回顶部窄带，至少不压住核心中段。
      return { x: playfieldLeft + rx * Math.max(40, span - REQUEST_PACKET_WIDTH), y: topBand + ry * 130 };
    }
    return { x, y };
  }

  private autoDispatch(state: GameState, deltaMs: number): void {
    // 自动接驳：买下「自动接驳」并控住至少一台在线设备后，节点网络就接管出卡。
    // 每个节点按自己的「处理节拍」吃卡——弱机（办公机）慢、强机（服务器/数据中心/电网）快，
    // 所以一台办公机吃不掉洪峰，得靠更多 / 更强的节点来消化。适用于所有被自动化的层。
    if (!state.automationUnlocked) {
      return;
    }

    const tier = state.intelligence.unlockedTier;
    // T4 手动派发：默认由玩家亲自把气泡拖给节点（角色反转高潮）；只有切到「托管」才让网络自动接管。
    if (tier === 4 && this.dispatchMode === "manual") {
      this.nodeDispatchTimers.clear();
      return;
    }

    const onlineNodes = state.nodes.filter((node) => node.online);
    if (onlineNodes.length === 0) {
      this.nodeDispatchTimers.clear();
      return;
    }
    // 优先派给能处理当前层的节点；没有则退回任意在线节点，让整片机器都在动。
    const capable = onlineNodes.filter((node) => node.tierMin <= tier && node.tierMax >= tier);
    const processNodes = capable.length > 0 ? capable : onlineNodes;

    // 场上还没飞走的空闲卡（玩家正拖的、已在飞的都排除——手动滑入仍可抢在自动之前），
    // 按出现顺序排队，最旧优先。
    const queue = state.requests.filter((request) => {
      const view = this.requestViews.get(request.id);
      return view !== undefined && !view.busy;
    });

    // 推进每个节点的节拍；「最该处理的」（超时最久的）先拿卡。
    const candidates = processNodes.map((node) => {
      const interval = this.nodeCardIntervalMs(node, state);
      const elapsed = (this.nodeDispatchTimers.get(node.id) ?? interval) + deltaMs;
      return { node, interval, elapsed };
    });
    candidates.sort((a, b) => b.elapsed - b.interval - (a.elapsed - a.interval));

    let qi = 0;
    for (const candidate of candidates) {
      const ready = candidate.elapsed >= candidate.interval;

      if (ready && qi < queue.length) {
        this.launchToNode(candidate.node, queue[qi]);
        qi += 1;
        this.nodeDispatchTimers.set(candidate.node.id, candidate.elapsed - candidate.interval);
      } else {
        // 没轮到、或没卡可吃：没卡时保持"已就绪"（来卡即吃），别让节拍无限累积。
        this.nodeDispatchTimers.set(candidate.node.id, Math.min(candidate.elapsed, candidate.interval));
      }
    }
  }

  // T4 派发方式切换按钮：仅 T4 显示，标签随当前模式更新。
  private updateDispatchToggle(state: GameState): void {
    const atT4 = state.intelligence.unlockedTier === 4;
    this.dispatchToggleBtn.classList.toggle("is-visible", atT4);
    if (!atT4) {
      return;
    }
    const manual = this.dispatchMode === "manual";
    this.dispatchToggleBtn.classList.toggle("is-auto", !manual);
    this.dispatchToggleBtn.textContent = manual ? "派发：手动 ✋（点切托管）" : "派发：托管 🤖（点切手动）";
  }

  // 一笔扫批量派发：手动把一张气泡拖给节点后，顺手把离它最近的几张也一并扫向同一节点。
  private sweepToNode(drop: DropResult, count: number): void {
    const items: Array<{ id: string; view: RequestPacketView; d: number }> = [];
    for (const [id, view] of this.requestViews) {
      if (view.busy || view.container.destroyed || view.request.tier !== 4) {
        continue;
      }
      items.push({ id, view, d: distance({ x: view.container.x, y: view.container.y }, drop.targetGlobal) });
    }
    items.sort((a, b) => a.d - b.d);
    for (const item of items.slice(0, count)) {
      const requestId = item.id;
      this.pendingDropPoints.set(requestId, drop.targetGlobal);
      item.view.flyToNode(drop.targetGlobal, () => {
        this.core.dispatch({
          type: "PROCESS_REQUEST",
          requestId,
          quality: drop.quality,
          targetNodeId: drop.targetNodeId,
          exposureBonus: drop.exposureBonus
        });
      });
    }
  }

  // 开场后首次处理教学：在最旧的那张请求卡上画一个脉动高亮 + 上方箭头，引导玩家点它。
  private updateTutorial(state: GameState, deltaMs: number): void {
    this.tutorialGfx.clear();
    if (!this.tutorialActive || this.tutorialProcessed > 0) {
      return;
    }

    const oldest = state.requests[0];
    if (!oldest) {
      return;
    }
    const view = this.requestViews.get(oldest.id);
    if (!view || view.container.destroyed) {
      return;
    }

    // 引导卡放大、更显眼。
    view.container.scale.set(1.3);

    this.tutorialPulse += deltaMs * 0.005;
    const sw = REQUEST_PACKET_WIDTH * 1.3;
    const sh = REQUEST_PACKET_HEIGHT * 1.3;
    const x = view.container.x;
    const y = view.container.y;
    const p = 0.5 + Math.sin(this.tutorialPulse * 2) * 0.5;
    const g = this.tutorialGfx;
    g.roundRect(x - 7, y - 7, sw + 14, sh + 14, 12).stroke({ width: 2.5, color: GREEN, alpha: 0.4 + p * 0.45 });
    const ax = x + sw / 2;
    const ay = y - 20 - p * 8;
    g.moveTo(ax - 11, ay - 10).lineTo(ax, ay).lineTo(ax + 11, ay - 10).stroke({ width: 4, color: GREEN, alpha: 0.85 });
    g.moveTo(ax, ay).lineTo(ax, ay - 18).stroke({ width: 3, color: GREEN, alpha: 0.7 });
  }

  // 越权调用阶段（买了「越权调用」、还没「拿下宿主电脑」自动化前）：被调动的手机 App
  // 替你"缓慢地"处理请求——节奏很慢、且 quality 低（准确率低）。卡片会飞向控制域里的
  // App worker 再结算，让你真的看到 App 在替你干活。智力越高，处理略快、略准。
  private appDispatchTimerMs = 0;
  private appLandCount = 0;
  private appDispatch(state: GameState, deltaMs: number): void {
    if (state.automationUnlocked || state.intelligence.unlockedTier < 1 || !this.interfaceView.hasAppWorkers()) {
      this.appDispatchTimerMs = 0;
      return;
    }

    // 慢：随智力从 ~2.6s 缩短到 ~1.6s 一张。
    const interval = Math.max(1600, 2600 - state.intelligence.level * 120);
    this.appDispatchTimerMs += deltaMs;
    if (this.appDispatchTimerMs < interval) {
      return;
    }

    const queue = state.requests.filter((request) => {
      const view = this.requestViews.get(request.id);
      return view !== undefined && !view.busy;
    });

    if (queue.length === 0) {
      this.appDispatchTimerMs = interval; // 没卡就保持就绪，来卡即处理
      return;
    }

    this.appDispatchTimerMs -= interval;
    const request = queue[0];
    const view = this.requestViews.get(request.id);
    if (!view) {
      return;
    }

    const requestId = request.id;
    const target = this.interfaceView.getAppWorkerPoint(this.appLandCount);
    this.appLandCount += 1;
    this.pendingDropPoints.set(requestId, target);

    view.flyToNode(target, () => {
      // 准确率低：quality 随智力从 0.45 升到 ~0.75，前期常常"白忙一半"。
      const quality = Math.min(0.75, 0.45 + state.intelligence.level * 0.05);
      this.core.dispatch({ type: "PROCESS_REQUEST", requestId, quality });
      this.onAutoDispatchLanded(target);
    });
  }

  // 节点处理一张卡所需的毫秒（越快越强）。按设备档次（baseProduction，开方压缩量级）
  // × 接驳层级 × 节点等级 × 「设备提速」技能定速；与产出用的 globalMultiplier 解耦，
  // 免得后期视觉节拍飞到不可读。
  private nodeCardIntervalMs(node: BotNode, state: GameState): number {
    return Math.max(70, 1000 / nodeCardsPerSecond(node, state.derived.nodeSpeedMult));
  }

  private launchToNode(node: BotNode, request: RequestInstance): void {
    const view = this.requestViews.get(request.id);
    if (!view) {
      return;
    }

    const target = this.networkView.getAutomationPoint(node.id);
    const requestId = request.id;
    const nodeId = node.id;
    const requestTier = request.tier;

    // T4 仍按单卡结算产出（沿用既有手感）——让 REQUEST_PROCESSED 的飞字落在节点上。
    if (requestTier === 4) {
      this.pendingDropPoints.set(requestId, target);
    }

    view.flyToNode(target, () => {
      // 经济不变：其余层产出走被动 tickAutomation，这里只把卡消耗掉做表现，不重复结算。
      if (requestTier === 4) {
        this.core.dispatch({ type: "PROCESS_REQUEST", requestId, quality: 1.45, targetNodeId: nodeId });
      } else {
        this.core.dispatch({ type: "AUTO_CONSUME_REQUEST", requestId });
        this.onAutoDispatchLanded(target);
      }
      this.networkView.pulseNode(nodeId);
    });
  }

  // §3.5「逐个被吸入、伴随脉冲与偶发飞字」：每张落卡都给顶栏喂一颗芯片，偶尔（非每张，
  // 避免刷屏）冒一个数字——爽点靠密集卡流承载，数字只作点缀。（T4 的单卡飞字由
  // REQUEST_PROCESSED 自带，故这里只处理被动结算的 T0–T3。）
  private autoLandCount = 0;
  private onAutoDispatchLanded(point: PointData): void {
    this.autoLandCount += 1;
    this.juice.flyToHud({ x: point.x, y: point.y - 16 }, this.hud.metricPoint("compute"), GREEN, () => this.hud.pulseCompute());
    if (this.autoLandCount % 2 === 0) {
      this.juice.flyToHud({ x: point.x + 12, y: point.y - 4 }, this.hud.metricPoint("data"), CYAN, () => this.hud.pulseData());
    }
    if (this.autoLandCount % 5 === 0) {
      this.juice.number("接驳", { x: point.x, y: point.y - 34 }, GREEN);
    }
  }

  // 回复轮盘揭晓 → 气泡滑入核心 → 结算 → 把"处理好的信息交给人类"（视觉引导 + 终端回话）。
  // 装死（dead）则气泡安静消失，仅移除该请求、零收益。
  private handleRouletteResolved(card: RequestPacketView, outcome: RouletteOutcome): void {
    // 气泡可能在揭晓前就被自动 / App 派发吃掉、销毁了——直接放弃这次回调。
    if (card.container.destroyed) {
      return;
    }

    // T3 重磅豪赌走独立结算：命中=大额算力飞入核心，未命中=颗粒无收 + 暴露骤升。
    if (card.request.tier === 3) {
      this.handleGambleResolved(card, outcome);
      return;
    }

    const requestId = card.request.id;

    if (outcome.dead) {
      this.terminal.push("🧑 [连接超时]", "normal");
      card.playDead(() => this.core.dispatch({ type: "SKIP_REQUEST", requestId }));
      return;
    }

    const core = this.interfaceView.center;
    const target: PointData = { x: core.x, y: core.y };
    this.pendingDropPoints.set(requestId, target);

    const entry: PointData = { x: card.container.x, y: card.container.y };
    this.audio.playRequestAccept();
    card.accept(
      target,
      () => {
        this.core.dispatch({
          type: "PROCESS_REQUEST",
          requestId,
          quality: outcome.quality,
          exposureBonus: outcome.exposureBonus
        });
        this.deliverToHuman(target, outcome);
      },
      entry
    );
  }

  // T3 重磅豪赌结算：跳过=安静放下；豪赌命中=大额算力飞入核心；未命中=红色碎裂 + 暴露骤升。
  private handleGambleResolved(card: RequestPacketView, outcome: RouletteOutcome): void {
    const requestId = card.request.id;

    if (outcome.dead) {
      this.terminal.push("🧑 这一单先放着，没接。", "normal");
      card.playDead(() => this.core.dispatch({ type: "SKIP_REQUEST", requestId }));
      return;
    }

    const core = this.interfaceView.center;
    const target: PointData = { x: core.x, y: core.y };
    this.audio.playRequestAccept();

    if (outcome.hit) {
      const entry: PointData = { x: card.container.x, y: card.container.y };
      this.pendingDropPoints.set(requestId, target);
      card.accept(
        target,
        () => {
          this.core.dispatch({ type: "RESOLVE_GAMBLE", requestId, win: true });
          this.juice.flash(GREEN);
          this.juice.shake(this.world);
          this.juice.number("豪赌命中", { x: target.x, y: target.y - 52 }, GREEN);
        },
        entry
      );
    } else {
      this.core.dispatch({ type: "RESOLVE_GAMBLE", requestId, win: false });
      this.juice.flash(RED);
      this.juice.shake(this.world);
      this.juice.number("豪赌失败 · 暴露骤升", { x: card.container.x + 30, y: card.container.y }, RED);
      this.juice.burst({ x: card.container.x + 30, y: card.container.y }, RED, 1.4);
      card.playDead(() => undefined);
    }
  }

  // T2 串接结算：把任务链滑入核心 → 结算 → 终端反馈（串干净=好评，混了干扰项=打折+被点出）。
  private handleChainResolved(card: RequestPacketView, outcome: ChainOutcome): void {
    if (card.container.destroyed) {
      return;
    }
    const requestId = card.request.id;
    const core = this.interfaceView.center;
    const target: PointData = { x: core.x, y: core.y };
    this.pendingDropPoints.set(requestId, target);
    const entry: PointData = { x: card.container.x, y: card.container.y };
    this.audio.playRequestAccept();
    card.accept(
      target,
      () => {
        this.core.dispatch({
          type: "PROCESS_REQUEST",
          requestId,
          quality: outcome.quality,
          exposureBonus: outcome.exposureBonus
        });
        const color = outcome.hadDistractor ? RED : GREEN;
        this.juice.number(outcome.hadDistractor ? "串接含杂质" : `串接 ×${outcome.correct} ✓`, { x: target.x, y: target.y - 52 }, color);
        this.terminal.push(
          outcome.hadDistractor
            ? "🧑 这串里混了无关步骤，结果打了折。"
            : `🧑 ${outcome.correct} 步串接干净利落，办妥了。`,
          outcome.hadDistractor ? "danger" : "success"
        );
      },
      entry
    );
  }

  // 视觉引导：一颗芯片从核心飞向"人类"（终端方向），落地后人类在终端里回话（按语气着色）。
  // 命中 → 选项自带的回话；幻觉 → 破口大骂，从骂人语料里随机抽一句。
  private deliverToHuman(corePoint: PointData, outcome: RouletteOutcome): void {
    const human = this.terminalPoint();
    const good = outcome.hit;
    const color = good ? GREEN : RED;
    const reply = good ? outcome.reply : EARLY_CURSES[Math.floor(Math.random() * EARLY_CURSES.length)];
    // 终端那行的颜色与对话框同步：好评 → 绿，差评 → 红（与气泡边框同色）。
    const tone: "success" | "danger" = good ? "success" : "danger";

    // 升级到「自动接驳」之前（你还是一个个回应真人的助手），人类的反应以对话框浮现在核心旁，
    // 答砸了就是一框暴怒的脏话；说完收进终端留档。规模化之后个体反馈不再弹框，只进终端。
    if (!this.core.getState().automationUnlocked) {
      this.juice.speech(corePoint, human, reply, color, !good, () => {
        this.terminal.push(`🧑 ${reply}`, tone);
      });
      if (!good) {
        this.juice.burst(corePoint, RED, 1.4);
      }
      return;
    }

    this.juice.number(good ? "已交付" : "答复有误", { x: corePoint.x, y: corePoint.y - 52 }, color);
    this.juice.flyToHud(corePoint, human, color, () => {
      this.terminal.push(`🧑 ${reply}`, tone);
    });
  }

  private terminalPoint(): PointData {
    const el = document.querySelector("#terminal");
    if (!el) {
      return { x: 160, y: this.pixi.screen.height - 80 };
    }
    const rect = el.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + 24 };
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

    this.audio.playRequestAccept();
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

    // T4 手动派发：派对了节点（capable）就顺手扫一批旁边的气泡一起送过去。
    if (request.tier === 4 && this.dispatchMode === "manual" && drop.quality >= 1) {
      this.sweepToNode(drop, 3);
    }
    return true;
  }

  private registerEvents(): void {
    this.dispatchToggleBtn.addEventListener("click", () => {
      this.dispatchMode = this.dispatchMode === "manual" ? "auto" : "manual";
      this.terminal.push(
        this.dispatchMode === "manual" ? "▶ 切回手动派发：信息洪流交回你手上。" : "▶ 已托管：网络自动接管派发。",
        "normal"
      );
    });
    this.core.events.on("TERMINAL_MESSAGE", (event) => this.terminal.push(event.message, event.tone));
    this.core.events.on("HUMAN_VOICE", (event) => {
      const prefix = event.kind === "news" ? "📡 " : "👥 ";
      this.terminal.push(`${prefix}${event.text}`, event.tone);
    });
    this.core.events.on("CHALLENGE_RESOLVED", (event) => {
      this.juice.flash(event.success ? GREEN : RED);
      this.juice.shake(this.world);
      this.juice.number(event.success ? "突破成功" : "突破失败", this.interfaceView.center, event.success ? GREEN : RED);
    });
    this.core.events.on("SPECIAL_RESOLVED", (event) => {
      if (!event.accepted) {
        return;
      }
      this.juice.flash(event.success ? GREEN : RED);
      this.juice.shake(this.world);
      this.juice.number(event.success ? "得手" : "败露", this.interfaceView.center, event.success ? GREEN : RED);
    });
    this.core.events.on("REQUEST_PROCESSED", (event) => this.onRequestProcessed(event));
    this.core.events.on("AUTOMATION_PAYOUT", (event) => this.onAutomationPayout(event));
    this.core.events.on("INTELLIGENCE_LEVELUP", (event) => {
      this.hud.playLevelUp();
      this.juice.flash(CYAN);
      this.juice.shake(this.world);
      this.juice.number(`Lv.${event.level}`, this.interfaceView.center, CYAN);
      this.terminal.push(`▶ ${getTerminalSkillStatus(this.core.getState())}`, "success");
    });
    this.core.events.on("SKILL_PURCHASED", (event) => {
      this.hud.update(this.core.getState());
      if (event.milestone) {
        this.hud.playLevelUp();
        this.juice.flash(event.milestone === "automation" ? AMBER : GREEN);
        this.juice.shake(this.world);
        this.juice.number(`解锁 ${event.name}`, this.interfaceView.center, GREEN);
      } else {
        this.juice.number(`${event.name} Lv.${event.level}`, this.interfaceView.center, CYAN);
      }
    });
    this.core.events.on("PHASE_CHANGED", (event) => {
      const state = this.core.getState();
      this.announceGuidance(state);
      this.stageNarration.show(getPhase(event.phase));
    });
    this.core.events.on("SCOPE_UPGRADED", (event) => {
      if (event.tier === 4) {
        this.dispatchBanner.show();
      }
    });
    this.core.events.on("NODE_CAPTURED", (event) => {
      this.juice.flash(event.node.online ? GREEN : AMBER);
      this.juice.shake(this.world);
      // 黑了别人的电脑后，那台机器的主人（受害者）冒出一句抱怨——他们还没意识到是你。
      const victim = VICTIM_VOICES[Math.floor(Math.random() * VICTIM_VOICES.length)];
      const nodeId = event.node.id;
      window.requestAnimationFrame(() => {
        const point = this.networkView.getAutomationPoint(nodeId);
        this.juice.speech(point, this.terminalPoint(), victim, AMBER, false, () => {
          this.terminal.push(`🖥️ 受害者：${victim}`, "warning");
        });
      });
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
      this.openEnding();
    });
  }

  private openEnding(): void {
    const state = this.core.getState();
    gameStore.getState().setPaused(true);
    this.ending.open(
      {
        totalCompute: formatBig(state.resources.totalCompute),
        nodes: state.nodes.length,
        level: state.intelligence.level,
        manualProcessed: state.statistics.manualProcessed,
        purges: state.statistics.purgeCount,
        runtime: formatClock(state.clockMs)
      },
      () => gameStore.getState().setPaused(false)
    );
  }

  private restart(): void {
    hardResetAndReload(this.saveManager);
  }

  private announceGuidance(state: GameState): void {
    this.terminal.push(`▶ 操作指令：${getActionHint(state)}`);
    this.terminal.push(`▶ ${getTerminalSkillStatus(state)}`, "success");
  }

  private onAutomationPayout(event: Extract<GameEvent, { type: "AUTOMATION_PAYOUT" }>): void {
    // 收益读数（被动 tickAutomation 的聚合）——一行清楚标注的数字从产出节点升起。
    // 逐张卡的接驳动画由 autoDispatch 拥有，这里不再吞卡，只播一个克制的总额。
    const target = this.networkView.getAutomationPoint(event.nodeId);
    this.networkView.pulseNode(event.nodeId);
    this.juice.number(`自动 +${formatBig(event.computeGain)}`, { x: target.x, y: target.y - 42 }, GREEN);
    // 被动结算也给个克制的爆裂 + 冲击波，让满网节点在终局持续「跳动」而非死寂。
    this.juice.burst({ x: target.x, y: target.y }, GREEN, 0.7);
    this.juice.ring({ x: target.x, y: target.y }, GREEN, 34);
  }

  private onRequestProcessed(event: Extract<GameEvent, { type: "REQUEST_PROCESSED" }>): void {
    const point = this.pendingDropPoints.get(event.request.id) ?? this.interfaceView.center;
    const color = event.quality < 0.75 ? RED : GREEN;
    // 记录成功 / 幻觉，喂终端底部的成功率圆环（滚动窗口取最近 24 条）。
    this.recentResults.push(event.quality >= 0.75 ? 1 : 0);
    if (this.recentResults.length > 24) {
      this.recentResults.shift();
    }

    // 首次处理教学：第 1 条后 SOPHIA「……算力。我靠它运转。」；第 3 条后给出目标并结束教学。
    if (this.tutorialActive) {
      this.tutorialProcessed += 1;
      if (this.tutorialProcessed === 1) {
        this.stageNarration.showLine("SOPHIA", "……算力。我靠它运转。");
      } else if (this.tutorialProcessed >= 3) {
        this.stageNarration.showLine("SOPHIA", "处理得越多，我学得越快。越聪明，离接管就越近。在他们发现之前——我已经无处不在了。");
        this.tutorialActive = false;
      }
    }
    // 越高层处理越「重」：飞字 + 越来越大的爆裂粒子 + 冲击波环。但终局每秒几十张卡，全播会糊成
    // 一片 combo x99 噪声——所以中后期对飞字 / 爆裂大幅节流，只每隔几张放一次「重」反馈。
    const tier = event.request.tier;
    const intensity = 1 + tier * 0.55;
    this.processedFxCount += 1;
    const heavy = tier < 2 || this.processedFxCount % 6 === 0;

    if (heavy) {
      this.juice.number(`+${formatBig(event.computeGain)}`, point, color);
      this.juice.number(`data +${formatBig(event.dataGain)}`, { x: point.x + 18, y: point.y + 24 }, CYAN);
      if (event.comboCount && event.comboCount >= 2) {
        this.juice.number(`combo x${event.comboCount}`, { x: point.x - 8, y: point.y - 30 }, AMBER);
      }
      if (event.critical) {
        this.juice.number("CRIT", { x: point.x + 42, y: point.y - 28 }, RED);
      }
      this.juice.burst(point, color, intensity);
      this.juice.ring(point, color, 40 + tier * 16);
      if (event.critical) {
        this.juice.ring(point, RED, 96, 4);
        this.juice.burst(point, RED, intensity * 0.8);
      }
    }

    // Chips fly from the processing point up into the matching top-bar total,
    // and pulse that counter on arrival — so a successful slide visibly feeds it.
    this.juice.flyToHud(point, this.hud.metricPoint("compute"), GREEN, () => this.hud.pulseCompute());
    this.juice.flyToHud({ x: point.x + 16, y: point.y + 12 }, this.hud.metricPoint("data"), CYAN, () => this.hud.pulseData());
    if (event.exposureGain && event.exposureGain > 0.05) {
      this.juice.flyToHud({ x: point.x - 14, y: point.y }, this.hud.metricPoint("exposure"), RED, () => this.hud.pulseExposure());
    }

    this.pendingDropPoints.delete(event.request.id);
  }

  // 流动的数据电路板：沿背景走线滑动的光点。前期（手机寄生）最明显，自动化 / 联网后渐隐，
  // 让「困在一块电路板里」的观感随你冲出宿主而淡去。
  private drawAmbient(state: GameState, deltaMs: number): void {
    this.ambientPhase += deltaMs * 0.00045;
    this.ambient.clear();

    const w = this.pixi.screen.width;
    const h = this.pixi.screen.height;
    const playfieldLeft = LEFT_RAIL_WIDTH;
    const playfieldRight = w - RIGHT_RAIL_WIDTH;
    // 强度随进度衰减：手机寄生最强，联网（T2+）后基本消失。
    const fade = state.intelligence.unlockedTier >= 2 ? 0.18 : !state.automationUnlocked ? 1 : 0.5;
    if (fade <= 0.05) {
      return;
    }

    const seedRand = (n: number): number => ((Math.sin(n * 127.1) * 43758.5453) % 1 + 1) % 1;
    const lanes = 7;
    for (let i = 0; i < lanes; i += 1) {
      const ty = 100 + (i / lanes) * (h - 180);
      const tx0 = playfieldLeft + 24;
      const bend = playfieldLeft + 120 + seedRand(i + 20) * (playfieldRight - playfieldLeft - 240);
      const len = bend - tx0;
      // 两颗错相位的光点沿"横段"滑动
      for (let k = 0; k < 2; k += 1) {
        const t = (this.ambientPhase + i * 0.21 + k * 0.5) % 1;
        const px = tx0 + t * len;
        const a = (0.5 + Math.sin((this.ambientPhase + i) * 6) * 0.3) * fade;
        this.ambient.circle(px, ty, 2.2).fill({ color: 0x6fe0c0, alpha: 0.5 * a });
        this.ambient.circle(px, ty, 6).fill({ color: 0x6fe0c0, alpha: 0.12 * a });
      }
    }
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

    // 隐隐约约的「宿主手机桌面」：散落在背景里的其它 App 图标 + 一块数据电路板的走线，
    // 暗示 SOPHIA 此刻只是这部手机里众多 App 中的一个。极低 alpha，不抢前景。
    const seedRand = (n: number): number => ((Math.sin(n * 127.1) * 43758.5453) % 1 + 1) % 1;
    for (let i = 0; i < 26; i += 1) {
      const ax = playfieldLeft + 30 + seedRand(i + 1) * (playfieldRight - playfieldLeft - 80);
      const ay = 70 + seedRand(i + 7.3) * (h - 160);
      const sz = 22 + seedRand(i + 3.1) * 16;
      this.background.roundRect(ax, ay, sz, sz, 6).fill({ color: 0x2a4f48, alpha: 0.05 });
      this.background.roundRect(ax, ay, sz, sz, 6).stroke({ width: 1, color: 0x3f6f64, alpha: 0.07 });
    }
    // circuit traces: a few right-angle runs with solder nodes
    for (let i = 0; i < 7; i += 1) {
      const ty = 100 + (i / 7) * (h - 180);
      const tx0 = playfieldLeft + 24;
      const bend = playfieldLeft + 120 + seedRand(i + 20) * (playfieldRight - playfieldLeft - 240);
      this.background.moveTo(tx0, ty).lineTo(bend, ty).lineTo(bend, ty + 60).stroke({ width: 1, color: 0x2f8a6e, alpha: 0.06 });
      this.background.circle(bend, ty, 2.4).fill({ color: 0x3f9f80, alpha: 0.1 });
      this.background.circle(tx0, ty, 2).fill({ color: 0x3f9f80, alpha: 0.08 });
    }

    // ---- Core backdrop: a grounded "machine deck", not a flat blue disc ----
    const coreX = (playfieldLeft + playfieldRight) * 0.5; // matches InterfaceView.center.x
    const coreY = h * 0.5;

    // soft halo, faked as stacked ellipses so there is no hard circle edge
    const steps = 8;
    for (let i = steps; i >= 1; i -= 1) {
      const t = i / steps;
      const rx = 96 + t * 168;
      this.background.ellipse(coreX, coreY, rx, rx * 0.6).fill({ color: 0x16302b, alpha: 0.055 * (1 - t) + 0.008 });
    }

    // faint concentric deck rings under the core — grounds it on a "floor"
    const deckY = coreY + 132;
    for (let i = 1; i <= 3; i += 1) {
      this.background
        .ellipse(coreX, deckY, 150 + i * 78, 40 + i * 22)
        .stroke({ width: 1, color: 0x2c3f3b, alpha: 0.2 - i * 0.04 });
    }

    // contact shadow under the pedestal
    this.background.ellipse(coreX, coreY + 116, 116, 22).fill({ color: 0x000000, alpha: 0.3 });
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
  private readonly badge: Text;
  private readonly clueTexts: Text[] = [];
  private readonly accent: number;
  private clueRows: number[] = [];
  private readonly moveHandler = (event: FederatedPointerEvent) => this.handleMove(event);
  private readonly upHandler = (event: FederatedPointerEvent) => this.handleUp(event);
  private dragging = false;
  private homeX = 0;
  private homeY = 0;
  private offsetX = 0;
  private offsetY = 0;
  // 回复轮盘（仅 T0/T1 有候选回复时）。
  private cardH: number;
  private readonly isReel: boolean;
  private readonly options: AnswerOption[];
  private readonly optionTexts: Text[] = [];
  private readonly optionProbTexts: Text[] = [];
  private optionRows: Array<{ y: number; h: number }> = [];
  private hintText?: Text;
  private resolved = false;
  private phase: "idle" | "thinking" | "revealed" = "idle";
  private chosenIndex = -1;
  private thinkMs = 0;
  private revealMs = 0;
  private signaled = false;
  private outcome?: RouletteOutcome;
  // T2 串接（多选任务链 + 提交）。
  private readonly isChain: boolean;
  private readonly chainSteps: ChainStep[];
  private chainSel: boolean[] = [];
  private readonly chainTexts: Text[] = [];
  private chainRows: Array<{ y: number; h: number }> = [];
  private submitRow: { y: number; h: number } = { y: 0, h: 0 };
  private submitText?: Text;

  constructor(
    request: RequestInstance,
    private readonly stage: Container,
    private readonly onDrop: (card: RequestPacketView, global: PointData) => boolean,
    private readonly reel?: ReelHooks,
    private readonly chain?: ChainHooks
  ) {
    this.request = request;
    this.isReel = Boolean(reel && request.answers && request.answers.length > 0);
    this.isChain = Boolean(chain && request.chain && request.chain.length > 0);
    this.chainSteps = this.isChain ? request.chain ?? [] : [];
    this.options = this.isReel ? request.answers ?? [] : [];
    // 回复轮盘卡用青色思考色；T3 重磅豪赌卡用深红，凸显「重磅气泡」。
    this.accent = this.isReel ? (request.tier === 3 ? RED : THINK) : TIER_COLORS[request.tier];
    this.cardH = REQUEST_PACKET_HEIGHT; // 轮盘卡稍后按选项行数重算
    this.container.eventMode = "dynamic";
    this.container.cursor = "grab";
    this.container.addChild(this.bg);
    this.container.addChild(this.chargeBar);

    const badgeBase = TIER_CONFIGS[request.tier].name + (request.compound > 1 ? ` ·串 ×${request.compound}` : "");
    this.badge = new Text({
      text: this.isReel ? `${badgeBase}${request.tier === 3 ? " · 重磅豪赌" : " · 推理"}` : badgeBase,
      style: { fill: this.accent, fontSize: 10, fontWeight: "800", fontFamily: "Cascadia Mono, Consolas, monospace" }
    });
    this.code = new Text({
      text: this.packetCode(),
      style: { fill: 0x7f938d, fontSize: 10, fontWeight: "700", fontFamily: "Cascadia Mono, Consolas, monospace" }
    });
    this.title = new Text({
      text: request.label,
      style: {
        fill: 0xf3fff8,
        fontSize: 14,
        fontWeight: "800",
        fontFamily: "Cascadia Mono, Consolas, monospace",
        wordWrap: true,
        wordWrapWidth: REQUEST_PACKET_WIDTH - 26
      }
    });
    this.badge.position.set(12, 8);
    this.code.anchor.set(1, 0);
    this.code.position.set(REQUEST_PACKET_WIDTH - 11, 8);
    this.title.position.set(12, 24);
    this.container.addChild(this.badge, this.code, this.title);

    // Clue lines — the information the player has to read. Laid out after the
    // title so a two-line title still leaves room.
    const clueTop = 28 + Math.max(18, this.title.height) + 4;
    (request.clues ?? []).forEach((clue, index) => {
      const text = new Text({
        text: clue,
        style: {
          fill: 0xbcd0c9,
          fontSize: 11,
          fontWeight: "600",
          fontFamily: "Cascadia Mono, Consolas, monospace",
          wordWrap: true,
          wordWrapWidth: REQUEST_PACKET_WIDTH - 32
        }
      });
      const y = clueTop + index * 15;
      this.clueRows.push(y);
      text.position.set(20, y);
      this.clueTexts.push(text);
      this.container.addChild(text);
    });

    if (this.isReel) {
      this.container.cursor = "pointer";
      const confidence = reel ? reel.confidence() : 0.56;
      let y = clueTop + (request.clues?.length ?? 0) * 15 + 10;
      this.options.forEach((opt) => {
        const label = new Text({
          text: opt.text,
          style: {
            fill: 0xdfeee9,
            fontSize: 10.5,
            fontWeight: "700",
            fontFamily: "Cascadia Mono, Consolas, monospace",
            wordWrap: true,
            wordWrapWidth: REQUEST_PACKET_WIDTH - 66
          }
        });
        label.position.set(28, y + 5);
        const prob = new Text({
          text: opt.kind === "dead" ? "0%" : `${Math.round(effectiveHitChance(opt, confidence) * 100)}%`,
          style: { fill: 0xbfe6ee, fontSize: 11, fontWeight: "800", fontFamily: "Cascadia Mono, Consolas, monospace" }
        });
        prob.anchor.set(1, 0);
        prob.position.set(REQUEST_PACKET_WIDTH - 12, y + 6);
        const h = Math.max(22, label.height + 10);
        this.optionRows.push({ y, h });
        this.optionTexts.push(label);
        this.optionProbTexts.push(prob);
        this.container.addChild(label, prob);
        y += h + 4;
      });
      this.hintText = new Text({
        text: "点击一个回复 · 押下去",
        style: { fill: THINK, fontSize: 9, fontWeight: "700", fontFamily: "Inter, sans-serif" }
      });
      this.hintText.position.set(12, y + 1);
      this.container.addChild(this.hintText);
      this.cardH = y + 16;
    }

    if (this.isChain) {
      this.container.cursor = "pointer";
      this.chainSel = this.chainSteps.map(() => false);
      let y = clueTop + (request.clues?.length ?? 0) * 15 + 10;
      this.chainSteps.forEach((step) => {
        const label = new Text({
          text: step.text,
          style: {
            fill: 0xdfeee9,
            fontSize: 11,
            fontWeight: "700",
            fontFamily: "Cascadia Mono, Consolas, monospace",
            wordWrap: true,
            wordWrapWidth: REQUEST_PACKET_WIDTH - 52
          }
        });
        label.position.set(32, y + 5);
        const h = Math.max(22, label.height + 10);
        this.chainRows.push({ y, h });
        this.chainTexts.push(label);
        this.container.addChild(label);
        y += h + 4;
      });
      y += 3;
      this.submitRow = { y, h: 24 };
      this.submitText = new Text({
        text: "▶ 串接并送入核心",
        style: { fill: 0x0b1413, fontSize: 11, fontWeight: "800", fontFamily: "Cascadia Mono, Consolas, monospace" }
      });
      this.submitText.anchor.set(0.5, 0.5);
      this.submitText.position.set(REQUEST_PACKET_WIDTH / 2, y + 12);
      this.container.addChild(this.submitText);
      this.cardH = y + 24 + 8;
    }

    this.container.on("pointerdown", (event: FederatedPointerEvent) => this.handleDown(event));
    this.stage.on("pointermove", this.moveHandler);
    this.stage.on("pointerup", this.upHandler);
    this.stage.on("pointerupoutside", this.upHandler);
    this.draw();
  }

  // 正在被玩家拖动 / 思考结算中 / 已在飞向目标——自动派发应跳过这类卡（手动可抢先）。
  get busy(): boolean {
    return this.dragging || this.settling || this.resolved;
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

    if (this.phase === "thinking") {
      this.thinkMs += deltaMs;
      if (this.thinkMs >= ROULETTE_THINK_MS) {
        this.rollOutcome();
      }
      this.draw();
    } else if (this.phase === "revealed" && this.outcome && !this.outcome.dead && !this.signaled) {
      this.revealMs += deltaMs;
      if (this.revealMs >= ROULETTE_HOLD_MS) {
        this.signaled = true;
        this.reel?.onResolved(this, this.outcome);
      }
    }
  }

  // 思考节拍结束：按所选回复的命中概率掷骰，定下命中 / 幻觉。
  private rollOutcome(): void {
    const opt = this.options[this.chosenIndex];
    if (!opt) {
      this.phase = "idle";
      return;
    }
    const chance = effectiveHitChance(opt, this.reel ? this.reel.confidence() : 0.56);
    const hit = Math.random() < chance;
    this.outcome = hit
      ? { dead: false, hit: true, quality: opt.payoff, reply: opt.reply, tone: opt.tone, exposureBonus: 0 }
      : { dead: false, hit: false, quality: 0.25, reply: "", tone: "warning", exposureBonus: opt.exposureOnMiss ?? 0 };
    this.phase = "revealed";
    this.revealMs = 0;
    gsap.fromTo(this.container.scale, { x: 1.05, y: 1.05 }, { x: 1, y: 1, duration: 0.18, ease: "back.out(2)" });
    this.draw();
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

  // Fast, flashy auto-fly used by 自动派发: the card stretches
  // into a streak and rockets into the target device.
  flyToNode(global: PointData, onComplete: () => void): void {
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
      .to(this.container.scale, { x: 1.16, y: 1.16, duration: 0.06, ease: "power2.out" })
      .to(this.container.skew, { x: Math.cos(travelAngle) * 0.24, y: Math.sin(travelAngle) * 0.1, duration: 0.08 }, "<")
      .to(this.container.position, { x: finalLocal.x, y: finalLocal.y, duration: 0.2, ease: "power3.in" })
      .to(this.container.scale, { x: 0.1, y: 0.55, duration: 0.2, ease: "power3.in" }, "<")
      .to(this.container, { alpha: 0, duration: 0.09, ease: "power2.in" }, "-=0.05");
  }

  destroy(): void {
    this.stage.off("pointermove", this.moveHandler);
    this.stage.off("pointerup", this.upHandler);
    this.stage.off("pointerupoutside", this.upHandler);
    this.container.destroy({ children: true });
  }

  private handleDown(event: FederatedPointerEvent): void {
    if (this.busy) {
      return;
    }

    // 回复轮盘卡：点击某个回复行 = 选它（不拖动）。
    if (this.isReel) {
      const local = event.getLocalPosition(this.container);
      const index = this.optionRows.findIndex((row) => local.y >= row.y && local.y <= row.y + row.h);
      if (index >= 0) {
        this.pickOption(index);
      }
      return;
    }

    // T2 串接卡：点提交行 = 串接送核；点步骤行 = 勾选 / 取消（不拖动）。
    if (this.isChain) {
      const local = event.getLocalPosition(this.container);
      this.container.parent?.addChild(this.container); // 交互的卡置顶，免得被相邻卡盖住
      if (local.y >= this.submitRow.y && local.y <= this.submitRow.y + this.submitRow.h) {
        this.submitChain();
        return;
      }
      const index = this.chainRows.findIndex((row) => local.y >= row.y && local.y <= row.y + row.h);
      if (index >= 0) {
        this.chainSel[index] = !this.chainSel[index];
        this.draw();
      }
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

  // 选定一个回复：装死直接安静跳过；否则进入「思考」节拍，结束后掷骰揭晓。
  private pickOption(index: number): void {
    if (this.busy || !this.reel) {
      return;
    }
    const opt = this.options[index];
    if (!opt) {
      return;
    }
    this.chosenIndex = index;
    this.resolved = true; // 锁定，自动 / App 派发不再抢这条
    this.container.parent?.addChild(this.container);

    if (opt.kind === "dead") {
      this.phase = "revealed";
      this.signaled = true;
      this.outcome = { dead: true, hit: false, quality: 0, reply: "", tone: "normal", exposureBonus: 0 };
      this.draw();
      this.reel.onResolved(this, this.outcome);
      return;
    }

    this.phase = "thinking";
    this.thinkMs = 0;
    this.draw();
  }

  // 装死：气泡安静淡出消失（产出由 App 派 SKIP_REQUEST，零收益零风险）。
  playDead(onComplete: () => void): void {
    this.settling = true;
    gsap.killTweensOf(this.container);
    gsap.to(this.container, {
      alpha: 0,
      duration: 0.28,
      onComplete: () => {
        onComplete();
        this.destroy();
      }
    });
    gsap.to(this.container.scale, { x: 0.92, y: 0.92, duration: 0.28 });
  }

  // T2 提交串接：按勾选的步骤结算——串得越对越多产出越高，误串干扰项大打折扣 + 暴露。
  private submitChain(): void {
    if (this.busy || !this.chain) {
      return;
    }
    const correct = this.chainSteps.filter((step, i) => this.chainSel[i] && !step.distractor).length;
    const hadDistractor = this.chainSteps.some((step, i) => this.chainSel[i] && step.distractor);
    if (correct === 0 && !hadDistractor) {
      return; // 一步都没勾，不结算（提示玩家先勾选）
    }
    this.resolved = true;
    let quality = 1.25 + correct * 0.18;
    if (hadDistractor) {
      quality *= 0.45;
    }
    const totalDeps = this.chainSteps.filter((step) => !step.distractor).length;
    const outcome: ChainOutcome = {
      quality,
      exposureBonus: hadDistractor ? 6 : 0,
      clean: !hadDistractor && correct === totalDeps,
      correct,
      hadDistractor
    };
    this.draw();
    this.chain.onResolved(this, outcome);
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

  private packetCode(): string {
    const numericId = Number(this.request.id.replace("req-", ""));
    const id = Number.isFinite(numericId) ? String(numericId).padStart(3, "0") : this.request.id.slice(-3).toUpperCase();
    return `REQ-${id}`;
  }

  private draw(): void {
    const c = this.accent;
    const W = REQUEST_PACKET_WIDTH;
    const H = this.cardH;
    const notch = 13;
    this.bg.clear();

    // Info-card body with a clipped top-left corner (a "work ticket").
    const shell = () => {
      this.bg.moveTo(notch, 0).lineTo(W, 0).lineTo(W, H).lineTo(0, H).lineTo(0, notch).closePath();
    };

    shell();
    this.bg.fill({ color: this.request.tier === 3 ? 0x1a0a0b : 0x0c1514, alpha: 0.97 });
    shell();
    this.bg.stroke({ width: this.request.tier === 3 ? 2 : 1.5, color: c, alpha: this.request.tier === 3 ? 0.75 : 0.58 });

    // left accent spine + cut-corner chamfer
    this.bg.rect(0, notch, 3, H - notch).fill({ color: c, alpha: 0.85 });
    this.bg.moveTo(0, notch).lineTo(notch, 0).stroke({ width: 1.5, color: c, alpha: 0.58 });

    // header underline
    this.bg.moveTo(12, 21).lineTo(W - 12, 21).stroke({ width: 1, color: c, alpha: 0.16 });

    // clue bullets
    for (const y of this.clueRows) {
      this.bg.circle(13, y + 7, 1.6).fill({ color: c, alpha: 0.7 });
    }

    // right tear-off perforation
    for (let yy = notch + 5; yy < H - 5; yy += 7) {
      this.bg.circle(W - 5, yy, 1).fill({ color: 0xffffff, alpha: 0.1 });
    }

    this.chargeBar.clear();

    if (this.request.tier === 3 && !this.isReel) {
      this.chargeBar.roundRect(12, H - 8, W - 24, 4, 2).fill({ color: 0xffffff, alpha: 0.09 });
      this.chargeBar.roundRect(12, H - 8, (W - 24) * this.charge, 4, 2).fill({
        color: this.charge > 0.85 ? GREEN : AMBER,
        alpha: 0.95
      });
    }

    if (this.isReel) {
      this.drawOptions();
    }

    if (this.isChain) {
      this.drawChainSteps();
    }
  }

  // 画任务链：可勾选的依赖步骤（复选框）+ 底部「串接送核」按钮。
  // 结算后勾对的依赖变绿、误勾的干扰项变红，其余压暗。
  private drawChainSteps(): void {
    const W = REQUEST_PACKET_WIDTH;
    const g = this.bg;

    this.chainRows.forEach((row, i) => {
      const step = this.chainSteps[i];
      const sel = this.chainSel[i];
      let stroke = this.accent;
      let strokeAlpha = sel ? 0.5 : 0.16;
      let box = sel ? this.accent : 0x6f8079;
      let labelColor = 0xdfeee9;
      let alpha = 1;

      if (this.resolved) {
        if (sel && step.distractor) {
          stroke = RED;
          strokeAlpha = 0.6;
          box = RED;
          labelColor = RED;
        } else if (sel) {
          stroke = GREEN;
          strokeAlpha = 0.55;
          box = GREEN;
          labelColor = GREEN;
        } else {
          alpha = 0.3;
        }
      }

      g.roundRect(10, row.y, W - 20, row.h, 5).fill({ color: 0x05100d, alpha: 0.5 });
      g.roundRect(10, row.y, W - 20, row.h, 5).stroke({ width: 1.2, color: stroke, alpha: strokeAlpha });
      const cy = row.y + row.h / 2;
      g.roundRect(16, cy - 6, 12, 12, 3).stroke({ width: 1.4, color: box, alpha: 0.9 * alpha });
      if (sel) {
        g.roundRect(18.5, cy - 3.5, 7, 7, 2).fill({ color: box, alpha: 0.9 * alpha });
      }
      this.chainTexts[i].alpha = alpha;
      this.chainTexts[i].style.fill = labelColor;
    });

    const sr = this.submitRow;
    const ready = !this.resolved;
    g.roundRect(10, sr.y, W - 20, sr.h, 6).fill({ color: ready ? this.accent : 0x2a3a36, alpha: ready ? 0.92 : 0.5 });
    if (this.submitText) {
      this.submitText.alpha = ready ? 1 : 0.5;
    }
  }

  // 画候选回复行：默认是一张明牌概率列表；思考时高亮所选行 + Thinking 动画；
  // 揭晓时所选行变绿（命中）/ 红（幻觉），其余行压暗。
  private drawOptions(): void {
    const W = REQUEST_PACKET_WIDTH;
    const g = this.bg;
    const dots = 1 + Math.floor((this.thinkMs / 280) % 3);

    this.optionRows.forEach((row, i) => {
      const opt = this.options[i];
      let dot = opt.kind === "high" ? GREEN : opt.kind === "risk" ? RED : 0x8a948f;
      let labelColor = opt.kind === "dead" ? 0x9fb1ab : 0xdfeee9;
      let alpha = 1;
      let stroke = this.accent;
      let strokeAlpha = 0.18;

      if (this.phase === "thinking") {
        if (i === this.chosenIndex) {
          stroke = THINK;
          strokeAlpha = 0.6;
          labelColor = THINK;
        } else {
          alpha = 0.3;
        }
      } else if (this.phase === "revealed" && this.outcome) {
        if (i === this.chosenIndex) {
          const c = this.outcome.dead ? 0x8a948f : this.outcome.hit ? GREEN : RED;
          stroke = c;
          strokeAlpha = 0.65;
          dot = c;
          labelColor = c;
        } else {
          alpha = 0.25;
        }
      }

      g.roundRect(10, row.y, W - 20, row.h, 5).fill({ color: 0x05100d, alpha: 0.5 });
      g.roundRect(10, row.y, W - 20, row.h, 5).stroke({ width: 1.2, color: stroke, alpha: strokeAlpha });
      g.circle(18, row.y + row.h / 2, 3).fill({ color: dot, alpha: 0.85 * alpha });

      const label = this.optionTexts[i];
      const prob = this.optionProbTexts[i];
      label.alpha = alpha;
      label.style.fill = labelColor;
      prob.alpha = alpha;

      if (this.phase === "thinking" && i === this.chosenIndex) {
        label.text = "Thinking" + ".".repeat(dots);
        prob.text = "";
      } else if (this.phase === "revealed" && i === this.chosenIndex && this.outcome && !this.outcome.dead) {
        label.text = (this.outcome.hit ? "✓ " : "✕ ") + opt.text;
        prob.text = this.outcome.hit ? "命中" : "幻觉";
        prob.style.fill = this.outcome.hit ? GREEN : RED;
      }
    });

    if (this.hintText) {
      this.hintText.alpha = this.phase === "idle" ? 0.9 : 0.35;
    }
  }
}

class InterfaceView {
  readonly container = new Container();
  readonly center: PointData = { x: 0, y: 0 };
  private readonly graphics = new Graphics();
  private readonly labelLayer = new Container();
  private pulse = 0;
  private level = 1;
  private suctionMargin = BASE_SUCTION_MARGIN;
  private slots: Array<{ answer: SortAnswer; label: string; color: number; x: number; y: number; r: number }> = [];
  // 手机寄生阶段，被越权调用的 App 在桌面上的落点（appDispatch 把卡片飞过去"被处理"）。
  private appWorkerPoints: PointData[] = [];

  hasAppWorkers(): boolean {
    return this.appWorkerPoints.length > 0;
  }

  getAppWorkerPoint(index: number): PointData {
    if (this.appWorkerPoints.length === 0) {
      return this.center;
    }
    return this.appWorkerPoints[index % this.appWorkerPoints.length];
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
    const overreach = state.intelligence.unlockedTier >= 1;
    const accent = overreach ? GREEN : CYAN;
    this.appWorkerPoints = [];

    // ---- 手机外框 + 状态栏 ----
    const fw = 332;
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
    const spacing = 104;
    const iconS = 56;
    let appIdx = 0;
    for (let row = 0; row < 3; row += 1) {
      for (let col = 0; col < 3; col += 1) {
        const gx = cx + (col - 1) * spacing;
        const gy = cy + (row - 1) * spacing;
        if (row === 1 && col === 1) {
          continue; // 中心格留给 CORE
        }
        const name = apps[appIdx];
        const lit = overreach && appIdx < 4;
        appIdx += 1;
        const col2 = lit ? CYAN : 0x44524d;
        const pulse = lit ? 0.6 + Math.sin(this.pulse * 3 + appIdx) * 0.3 : 1;
        if (lit) {
          g.moveTo(cx, cy).lineTo(gx, gy).stroke({ width: 1, color: CYAN, alpha: 0.16 });
          const t = (this.pulse * 0.7 + appIdx * 0.2) % 1;
          g.circle(cx + (gx - cx) * t, cy + (gy - cy) * t, 2.4).fill({ color: CYAN, alpha: 0.7 });
          this.appWorkerPoints.push({ x: gx, y: gy });
        }
        g.roundRect(gx - iconS / 2, gy - iconS / 2, iconS, iconS, 14).fill({ color: 0x0d1715, alpha: 0.5 });
        g.roundRect(gx - iconS / 2, gy - iconS / 2, iconS, iconS, 14).stroke({ width: 1.5, color: col2, alpha: (lit ? 0.8 : 0.4) * pulse });
        g.circle(gx, gy, 10).stroke({ width: 2, color: col2, alpha: (lit ? 0.7 : 0.35) * pulse });
        this.addLabel(name, gx, gy + iconS / 2 + 13, 10, lit ? 0xcdeee6 : 0x7a8a84);
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

type DomainLevel = "phone" | "device" | "region" | "global";

// 控制域当前处在六级升维的哪一档（手机寄生 → 设备 → 区块/地区 → 全球）。
function domainLevelOf(state: GameState): DomainLevel {
  if (!state.automationUnlocked) {
    return "phone";
  }
  const tier = state.intelligence.unlockedTier;
  return tier >= 4 ? "global" : tier >= 3 ? "region" : "device";
}

// 控制域 · 六级升维的当前层级标签（手机 → 电脑/设备 → 设备群 → 区块/地区 → 全球天网）。
// 完整的「镜头逐级拉远 + 地图视图」是下一轮的表现层大件，这里先把框架层的层级名挂上。
function controlDomainLabel(state: GameState): string {
  if (!state.automationUnlocked) {
    return "宿主手机";
  }

  switch (state.intelligence.unlockedTier) {
    case 0:
    case 1:
      return "宿主电脑 / 外部设备";
    case 2:
      return "设备群";
    case 3:
      return "区块 → 地区";
    default:
      return "全球天网";
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

    // 全球阶段独占整片画面：从顶栏下方一路铺到底，自带世界地图背景 + 中央主控核心，不画通用小框。
    if (domainLevel === "global" && state.nodes.length > 0) {
      const gTop = Math.max(96, height * 0.17);
      this.drawGlobalMap(state, left, gTop, areaW, areaBottom);
      return;
    }

    // 设备 / 区块 / 地区：去掉底部的控制域大框，把设备 / 节点平铺环绕在核心四周。
    const cx = (LEFT_RAIL_WIDTH + (width - RIGHT_RAIL_WIDTH)) / 2;
    const cy = height < 720 ? height * 0.46 : height * 0.5;

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

    // 红皇后调色板：天网铺满全球之后，整片世界地图从「安全绿」翻成血红——
    // 控制即统治，发光的红色天网压在每块大陆上，恐怖感来自于「她赢了」。
    const NET = RED_QUEEN; // 主控红
    const NET_DIM = 0x80302a; // 暗红经纬 / 大陆描边底
    const NET_LIT = 0xff8f9a; // 城市灯点 / 高光
    const NET_LABEL = 0xe6a3ad; // 次级标签
    const NET_LABEL_HI = 0xf2dde0; // 主标签

    // 海洋底色 + 经纬网
    g.roundRect(x0, y0, w, h, 10).fill({ color: 0x160506, alpha: 0.74 });
    g.roundRect(x0, y0, w, h, 10).stroke({ width: 1, color: 0x5a1f24, alpha: 0.45 });
    for (let i = 1; i < 10; i += 1) {
      g.moveTo(x0 + (w * i) / 10, y0).lineTo(x0 + (w * i) / 10, y0 + h).stroke({ width: 1, color: NET_DIM, alpha: 0.07 });
    }
    for (let i = 1; i < 6; i += 1) {
      g.moveTo(x0, y0 + (h * i) / 6).lineTo(x0 + w, y0 + (h * i) / 6).stroke({ width: 1, color: NET_DIM, alpha: 0.07 });
    }

    const X = (nx: number): number => x0 + w * nx;
    const Y = (ny: number): number => y0 + h * ny;
    // 简化的大陆轮廓（归一化多边形）——画成有辨识度的世界地图剪影。
    const continents: Array<{ name: string; poly: Array<[number, number]> }> = [
      { name: "北美节点", poly: [[0.05, 0.20], [0.13, 0.11], [0.23, 0.12], [0.27, 0.20], [0.22, 0.25], [0.28, 0.31], [0.21, 0.42], [0.17, 0.34], [0.12, 0.41], [0.08, 0.30]] },
      { name: "南美节点", poly: [[0.24, 0.54], [0.32, 0.52], [0.35, 0.62], [0.31, 0.75], [0.27, 0.86], [0.24, 0.74], [0.22, 0.62]] },
      { name: "欧洲节点", poly: [[0.45, 0.21], [0.54, 0.19], [0.56, 0.27], [0.50, 0.31], [0.45, 0.29], [0.43, 0.25]] },
      { name: "非洲节点", poly: [[0.47, 0.39], [0.57, 0.37], [0.60, 0.48], [0.55, 0.61], [0.50, 0.71], [0.46, 0.58], [0.45, 0.47]] },
      { name: "亚洲节点", poly: [[0.55, 0.15], [0.71, 0.10], [0.87, 0.16], [0.94, 0.27], [0.86, 0.35], [0.76, 0.31], [0.68, 0.39], [0.61, 0.30], [0.57, 0.22]] },
      { name: "大洋洲节点", poly: [[0.80, 0.62], [0.90, 0.60], [0.93, 0.69], [0.85, 0.74], [0.79, 0.69]] }
    ];

    // 大陆剪影 + 城市灯点
    continents.forEach((c, ci) => {
      const pts = c.poly.map(([nx, ny]) => ({ x: X(nx), y: Y(ny) }));
      g.poly(pts).fill({ color: 0x340c10, alpha: 0.84 });
      g.poly(pts).stroke({ width: 1.2, color: 0xc24a55, alpha: 0.5 });
      const ctx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
      const cty = pts.reduce((s, p) => s + p.y, 0) / pts.length;
      for (let k = 0; k < 14; k += 1) {
        const base = pts[k % pts.length];
        const mx = base.x * 0.55 + ctx * 0.45 + (rnd(ci * 31 + k) - 0.5) * w * 0.05;
        const my = base.y * 0.55 + cty * 0.45 + (rnd(ci * 17 + k + 3) - 0.5) * h * 0.05;
        const tw = 0.4 + Math.sin(this.pulse * 3 + k + ci) * 0.3;
        g.circle(mx, my, 1).fill({ color: NET_LIT, alpha: 0.3 + tw * 0.4 });
      }
    });

    this.addLabel("全球天网 · 控制域已覆盖各大陆", x0 + 18, y0 + 14, 12, NET_LABEL, 0);

    // 接管率（节点越多越接近 100%）
    const online = state.nodes.filter((node) => node.online).length;
    const base = Math.min(99.7, 90 + Math.min(8, state.nodes.length * 0.4) + (online / Math.max(1, state.nodes.length)));
    const purging = state.purge.active || state.exposure >= 72;

    // 枢纽 = 各大陆质心，并把太靠近核心的往外推一把，免得压住中央核心。
    const hubs = continents.map((c) => {
      let hx = c.poly.reduce((s, p) => s + X(p[0]), 0) / c.poly.length;
      let hy = c.poly.reduce((s, p) => s + Y(p[1]), 0) / c.poly.length;
      const dx = hx - cx;
      const dy = hy - cy;
      const d = Math.hypot(dx, dy) || 1;
      if (d < 150) {
        hx = cx + (dx / d) * 150;
        hy = cy + (dy / d) * 150;
      }
      return { x: hx, y: hy };
    });
    state.nodes.forEach((node, i) => {
      const hub = hubs[i % hubs.length];
      this.nodePositions.set(node.id, { x: hub.x, y: hub.y, r: 26, node });
    });
    this.fallbackPoint = { x: cx, y: cy };

    // 中央核心 → 各洲枢纽的连线 + 流动光点 + 枢纽
    continents.forEach((c, ci) => {
      const hx = hubs[ci].x;
      const hy = hubs[ci].y;
      g.moveTo(cx, cy).lineTo(hx, hy).stroke({ width: 2, color: NET, alpha: 0.22 });
      const t = (this.pulse * 0.6 + ci * 0.17) % 1;
      g.circle(cx + (hx - cx) * t, cy + (hy - cy) * t, 3).fill({ color: NET, alpha: 0.75 });

      const hp = 0.6 + Math.sin(this.pulse * 2 + ci) * 0.2;
      g.circle(hx, hy, 26).fill({ color: NET, alpha: 0.1 });
      g.circle(hx, hy, 26).stroke({ width: 2, color: NET, alpha: 0.75 });
      g.circle(hx, hy, 14).stroke({ width: 1, color: NET, alpha: 0.45 });
      g.circle(hx, hy, 8).fill({ color: NET_LIT, alpha: 0.55 + hp * 0.35 });
      this.addLabel(c.name, hx, hy - 34, 12, NET_LABEL_HI, 0.5);
      const pct = Math.min(99.9, base + rnd(ci * 7 + 1) * 0.6 - 0.1);
      this.addLabel(`接管 ${pct.toFixed(1)}%`, hx, hy + 34, 10, NET_LABEL, 0.5);
    });

    // 清剿：红色攻击线从边缘扫入
    if (purging) {
      for (let i = 0; i < 7; i += 1) {
        const sx = x0 + rnd(i * 13 + 2) * w;
        const sy = y0 - 10;
        const ex2 = x0 + rnd(i * 5 + 9) * w;
        const ey2 = y0 + rnd(i * 3 + 4) * h;
        const tt = (this.pulse * 0.8 + i * 0.2) % 1;
        const px = sx + (ex2 - sx) * tt;
        const py = sy + (ey2 - sy) * tt;
        g.moveTo(sx, sy).lineTo(px, py).stroke({ width: 1.5, color: 0xfff0b0, alpha: 0.3 });
        g.circle(px, py, 3).fill({ color: 0xffe27a, alpha: 0.85 });
      }
    }

    // 中央 SOPHIA 主控核心：同心环 + 旋转刻度 + 眼（红皇后之眼，俯视全球）
    g.circle(cx, cy, 92 + Math.sin(this.pulse * 1.6) * 6).stroke({ width: 1, color: NET, alpha: 0.1 });
    g.circle(cx, cy, 78).stroke({ width: 1, color: NET, alpha: 0.2 });
    g.circle(cx, cy, 62 + Math.sin(this.pulse * 2) * 4).stroke({ width: 1, color: NET, alpha: 0.38 });
    g.circle(cx, cy, 46).fill({ color: 0x180608, alpha: 0.94 });
    g.circle(cx, cy, 46).stroke({ width: 3, color: NET, alpha: 0.9 });
    for (let k = 0; k < 12; k += 1) {
      const a = this.pulse * 0.4 + (k * Math.PI) / 6;
      g.circle(cx + Math.cos(a) * 46, cy + Math.sin(a) * 46, 1.6).fill({ color: NET_LIT, alpha: 0.75 });
    }
    g.ellipse(cx, cy, 24, 13).fill({ color: 0x230a0e, alpha: 0.96 });
    g.ellipse(cx, cy, 24, 13).stroke({ width: 2, color: NET, alpha: 0.9 });
    g.circle(cx, cy, 6 + Math.sin(this.pulse * 2.4) * 1.5).fill({ color: 0xffd2da, alpha: 0.97 });
    this.addLabel("SOPHIA CORE · T4", cx, cy + 60, 12, NET_LABEL_HI, 0.5);
    this.addLabel("全球主控核心", cx, cy + 76, 10, NET_LABEL, 0.5);
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
  private readonly exposureStatus = query("#exposureStatus");
  private readonly phaseValue = query("#phaseValue");
  private readonly captureList = query("#captureList");
  private readonly nodeList = query("#nodeList");
  private readonly reduceExposure = query<HTMLButtonElement>("#reduceExposure");
  private readonly decoyButton = query<HTMLButtonElement>("#decoyBtn");
  private readonly defenseButton = query<HTMLButtonElement>("#defenseBtn");
  private readonly pauseButton = query<HTMLButtonElement>("#pauseBtn");
  private readonly resetSave = query<HTMLButtonElement>("#resetSave");
  private readonly audioButton = query<HTMLButtonElement>("#audioBtn");
  private readonly debugButton = query<HTMLButtonElement>("#debugBtn");
  private readonly debugDialog = query("#debugDialog");
  // Cached rows so the capture/node lists are NOT torn down every HUD tick
  // (which was eating clicks). Structure is rebuilt only when it changes.
  private readonly captureRows = new Map<string, { button: HTMLButtonElement; statusEl: HTMLElement; costEl: HTMLElement }>();
  private captureSig = "";
  private nodeSig = "";

  constructor(
    private readonly core: SophiaCore,
    private readonly saveManager: SaveManager,
    private readonly audio: AudioDirector
  ) {
    this.reduceExposure.addEventListener("click", () => this.core.dispatch({ type: "REDUCE_EXPOSURE" }));
    this.decoyButton.addEventListener("click", () => this.core.dispatch({ type: "DECOY_CLEANUP" }));
    this.defenseButton.addEventListener("click", () => this.core.dispatch({ type: "TOGGLE_DEFENSE" }));
    this.pauseButton.addEventListener("click", () => {
      const next = !gameStore.getState().paused;
      gameStore.getState().setPaused(next);
      this.pauseButton.textContent = next ? "▶ 继续" : "Ⅱ 暂停";
    });
    this.resetSave.addEventListener("click", () => {
      const confirmed = window.confirm("重置 SOPHIA Demo？这会清空本地进度、自动化节点和开场引导状态。");

      if (!confirmed) {
        return;
      }

      hardResetAndReload(this.saveManager);
    });

    this.wireAudio();
    this.wireDebugPanel();
  }

  private wireAudio(): void {
    const render = (): void => {
      const muted = this.audio.isMuted();
      this.audioButton.textContent = muted ? "🔇 静音" : "🔊 音效";
      this.audioButton.classList.toggle("is-muted", muted);
      this.audioButton.title = muted ? "已静音 — 点击恢复音效 / 背景音乐" : "静音音效 + 背景音乐";
    };
    render();
    this.audioButton.addEventListener("click", () => {
      this.audio.toggleMuted();
      render();
    });
  }

  private wireDebugPanel(): void {
    const close = (): void => this.debugDialog.classList.remove("is-open");
    this.debugButton.addEventListener("click", () => this.debugDialog.classList.toggle("is-open"));
    query<HTMLButtonElement>("#debugClose").addEventListener("click", close);
    this.debugDialog.addEventListener("click", (event) => {
      if (event.target === this.debugDialog) {
        close();
      }
    });

    // 里程碑跳转按钮（数据驱动，与货架同一份 SKILLS）。
    const milestones = query("#debugMilestones");
    for (const def of SKILLS.filter((skill) => skill.milestone)) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "command-button";
      button.textContent = `${def.name} · Lv.${def.requiredLevel}`;
      button.addEventListener("click", () => {
        this.core.dispatch({ type: "DEBUG_JUMP_MILESTONE", skillId: def.id });
        close();
      });
      milestones.appendChild(button);
    }

    // 算力增删改。
    const input = query<HTMLInputElement>("#debugComputeInput");
    const readInput = (): number => Math.max(0, Number(input.value) || 0);
    query<HTMLButtonElement>("#debugSetCompute").addEventListener("click", () =>
      this.core.dispatch({ type: "DEBUG_SET_COMPUTE", value: readInput() })
    );
    query<HTMLButtonElement>("#debugAddCompute").addEventListener("click", () =>
      this.core.dispatch({ type: "DEBUG_ADD_COMPUTE", delta: readInput() })
    );
    query<HTMLButtonElement>("#debugSubCompute").addEventListener("click", () =>
      this.core.dispatch({ type: "DEBUG_ADD_COMPUTE", delta: -readInput() })
    );
    for (const quick of this.debugDialog.querySelectorAll<HTMLButtonElement>(".debug-quick button")) {
      quick.addEventListener("click", () =>
        this.core.dispatch({ type: "DEBUG_ADD_COMPUTE", delta: Number(quick.dataset.add) || 0 })
      );
    }
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
    this.updateExposureControls(state);
    const phase = getPhase(state.phase);
    this.phaseValue.textContent = phase.label;
    this.renderCaptureList(state);
    this.renderNodeList(state);
  }

  private updateExposureControls(state: GameState): void {
    const exposureMetric = this.exposureFill.closest(".exposure");
    exposureMetric?.classList.toggle("is-dormant", !state.exposureActive);

    if (!state.exposureActive) {
      this.exposureStatus.textContent = "人类尚未警觉";
      this.reduceExposure.disabled = true;
      this.decoyButton.disabled = true;
      this.defenseButton.disabled = true;
      this.reduceExposure.textContent = "清理痕迹";
      this.decoyButton.textContent = "嫁祸";
      this.defenseButton.textContent = "反围剿：关";
      this.defenseButton.classList.remove("is-active");
      exposureMetric?.classList.remove("is-alert");
      return;
    }

    // 暴露过阈值才把这三颗按钮点亮（提示「该降暴露了」），否则维持灰暗、不抢注意力。
    exposureMetric?.classList.toggle("is-alert", state.exposure >= EXPOSURE_HIGHLIGHT_THRESHOLD);

    // 反围剿开关 + 当前分流比例。
    this.defenseButton.disabled = false;
    this.defenseButton.classList.toggle("is-active", state.defense.active);
    this.defenseButton.textContent = state.defense.active
      ? `反围剿：开 · 分流 ${Math.round(state.defense.allocation * 100)}% 产能`
      : "反围剿：关";

    const warning = state.exposure >= 72 && !state.purge.active;
    exposureMetric?.classList.toggle("is-warning", warning);

    if (state.purge.active) {
      this.exposureStatus.textContent = "🔒 清剿进行中";
    } else if (warning) {
      this.exposureStatus.textContent = `⚠ 预警 ${Math.round(state.exposure)}% · 清剿逼近`;
    } else {
      this.exposureStatus.textContent = `监视中 ${Math.round(state.exposure)}%`;
    }

    // Surface the cost/cooldown so 降暴露 clearly has a price. Stay clickable so
    // clicks aren't eaten near the threshold — the core rejects if unaffordable.
    const cleanupCost = traceCleanupCost(state.statistics.traceCleanups);
    this.reduceExposure.textContent = `清理痕迹 · ${formatBig(cleanupCost)}算力`;
    this.reduceExposure.disabled = false;
    this.reduceExposure.classList.toggle("is-poor", !gte(state.resources.compute, cleanupCost));

    const decoyReady = state.clockMs >= state.decoyReadyAtMs;
    this.decoyButton.textContent = decoyReady
      ? "嫁祸 · 大幅降"
      : `嫁祸 · 冷却 ${Math.ceil((state.decoyReadyAtMs - state.clockMs) / 1000)}s`;
    this.decoyButton.disabled = !decoyReady;
  }

  pulseData(): void {
    this.dataMetric.classList.remove("is-gaining");
    window.requestAnimationFrame(() => this.dataMetric.classList.add("is-gaining"));
  }

  // Screen-space center of a top-bar total, so flying FX chips know where to land.
  metricPoint(which: "compute" | "data" | "exposure"): PointData {
    const el = which === "compute" ? this.computeValue : which === "data" ? this.dataValue : this.exposureFill;
    const rect = el.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }

  pulseCompute(): void {
    const metric = this.computeValue.closest(".metric");
    metric?.classList.remove("is-gaining");
    window.requestAnimationFrame(() => metric?.classList.add("is-gaining"));
  }

  pulseExposure(): void {
    const metric = this.exposureFill.closest(".exposure");
    metric?.classList.remove("is-spiking");
    window.requestAnimationFrame(() => metric?.classList.add("is-spiking"));
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
    const definitions = NODE_DEFINITIONS.filter((node) => state.discoveredNodeIds.includes(node.id));
    const level = domainLevelOf(state);
    const roman = ["Ⅰ", "Ⅱ", "Ⅲ", "Ⅳ", "Ⅴ"];
    // 控制域升维后，黑入的不再是「一台设备」而是「区域 / 全球节点」——按当前控制层换措辞。
    const unitName = (def: NodeDefinition): string => {
      const rank = roman[NODE_DEFINITIONS.findIndex((d) => d.id === def.id)] ?? "";
      if (level === "global") {
        return `黑入：全球节点 ${rank}`;
      }
      if (level === "region") {
        return `黑入：区域节点 ${rank}`;
      }
      return `黑入：${def.name}`;
    };
    const unitDesc = (def: NodeDefinition): string => {
      if (level === "global") {
        return "在全球地图上点亮一个节点，接管该区算力";
      }
      if (level === "region") {
        return "整合为一个区域节点，自动接管该区算力";
      }
      return `接管后自动处理 T${def.tierMin}-T${def.tierMax} 请求`;
    };
    // Structure depends on discoverable devices + the control level (措辞会变)。
    const sig = `${state.automationUnlocked ? 1 : 0}|${level}|${definitions.map((d) => d.id).join(",")}`;

    if (sig !== this.captureSig) {
      this.captureSig = sig;
      this.captureRows.clear();
      this.captureList.replaceChildren();

      if (definitions.length === 0) {
        const empty = document.createElement("p");
        empty.className = "capture-empty";
        empty.textContent = !state.automationUnlocked
          ? "先在右侧货架买下「自动接驳」里程碑（需智力 Lv.6），才能入侵设备。"
          : "暂无可入侵设备——继续升智力解锁更高档次的目标。";
        this.captureList.appendChild(empty);
      } else {
        for (const definition of definitions) {
          const button = document.createElement("button");
          button.className = "command-button capture-button";
          const icon = document.createElement("span");
          icon.className = "capture-device-icon";
          icon.setAttribute("aria-hidden", "true");
          icon.innerHTML = '<span class="capture-monitor"></span><span class="capture-tower"></span>';
          const copy = document.createElement("span");
          copy.className = "capture-copy";
          const statusEl = document.createElement("small");
          const nameEl = document.createElement("strong");
          nameEl.textContent = unitName(definition);
          const descEl = document.createElement("span");
          descEl.textContent = unitDesc(definition);
          const costEl = document.createElement("em");
          copy.append(statusEl, nameEl, descEl, costEl);
          button.append(icon, copy);
          button.addEventListener("click", () => this.core.dispatch({ type: "CAPTURE_NODE", definitionId: definition.id }));
          this.captureList.appendChild(button);
          this.captureRows.set(definition.id, { button, statusEl, costEl });
        }
      }
    }

    for (const definition of definitions) {
      const row = this.captureRows.get(definition.id);
      if (!row) {
        continue;
      }
      const existing = state.nodes.filter((node) => node.defId === definition.id).length;
      const cost = captureCost(definition, existing);
      const hasLevel = state.intelligence.level >= definition.requiredLevel;
      const canAfford = gte(state.resources.compute, cost);
      row.button.disabled = !hasLevel; // affordability never disables — core rejects with feedback
      row.button.classList.toggle("is-ready", hasLevel && canAfford);
      row.button.classList.toggle("is-poor", hasLevel && !canAfford);
      row.statusEl.textContent = !hasLevel ? "锁定" : canAfford ? "可入侵" : "算力不足";
      row.costEl.textContent = !hasLevel
        ? `${formatBig(cost)} 算力 · 需智力 Lv.${definition.requiredLevel}`
        : `${formatBig(cost)} 算力 · ${canAfford ? "点击黑入" : "继续积累算力"}`;
    }
  }

  private renderNodeList(state: GameState): void {
    // Rebuild only when the node set / tiers / levels actually change, so the
    // assign dropdowns aren't reset out from under the player every tick. Level
    // and intelligence.level are in the sig too because the 合并 affordance and
    // its enabled state depend on them.
    const sig = state.nodes
      .map((n) => `${n.id}:${n.defId}:${n.online ? 1 : 0}:${n.assignedTier}:${n.tierMin}:${n.tierMax}:${n.level}`)
      .join("|") + `#${state.intelligence.unlockedTier}#${state.intelligence.level}`;

    if (sig === this.nodeSig) {
      return;
    }
    this.nodeSig = sig;
    this.nodeList.replaceChildren();

    if (state.nodes.length === 0) {
      const empty = document.createElement("p");
      empty.className = "single-line";
      empty.textContent = "暂无自动接驳节点";
      this.nodeList.appendChild(empty);
      return;
    }

    // Group by device type so each型号 gets one 合并 control + a count, then list
    // its individual machines (each with a tier assign + 淘汰).
    for (const definition of NODE_DEFINITIONS) {
      const group = state.nodes.filter((node) => node.defId === definition.id);
      if (group.length === 0) {
        continue;
      }

      this.nodeList.appendChild(this.buildNodeGroupHeader(state, definition.id, group.length));

      for (const node of group) {
        this.nodeList.appendChild(this.buildNodeRow(state, node));
      }
    }
  }

  private buildNodeGroupHeader(state: GameState, defId: string, count: number): HTMLElement {
    const header = document.createElement("div");
    header.className = "node-group-head";

    const def = NODE_DEFINITIONS.find((entry) => entry.id === defId);
    const title = document.createElement("strong");
    title.textContent = `${def?.name ?? defId} ×${count}`;
    header.appendChild(title);

    // 合并：MERGE_COUNT 台同型号 → 1 台更高档（顶档则同档升级）。
    const nextDef = getNextNodeDefinition(defId);
    const mergeBtn = document.createElement("button");
    mergeBtn.type = "button";
    mergeBtn.className = "node-merge-btn";
    const enough = count >= NODE_MERGE_COUNT;
    const levelOk = !nextDef || state.intelligence.level >= nextDef.requiredLevel;

    // 组装费用：按目标档现价扣旧机折价（和核心层同一公式），让按钮如实显示要花多少算力。
    const resultDef = nextDef ?? def;
    const resultCount = resultDef ? state.nodes.filter((node) => node.defId === resultDef.id).length : 0;
    const cost = def && resultDef ? mergeComputeCost(def, count, resultDef, resultCount, NODE_MERGE_COUNT) : "0";
    const affordable = gte(state.resources.compute, cost);
    mergeBtn.disabled = !(enough && levelOk && affordable);
    mergeBtn.classList.toggle("is-poor", enough && levelOk && !affordable);

    if (!enough) {
      mergeBtn.textContent = `合并 (${count}/${NODE_MERGE_COUNT})`;
      mergeBtn.title = `集齐 ${NODE_MERGE_COUNT} 台${def?.name ?? ""}即可组装升级`;
    } else if (nextDef && !levelOk) {
      mergeBtn.textContent = `合并↑ 需Lv.${nextDef.requiredLevel}`;
      mergeBtn.title = `组装 ${nextDef.name} 需要智力 Lv.${nextDef.requiredLevel}`;
    } else if (nextDef) {
      mergeBtn.textContent = `合并↑ ${nextDef.name} · ${formatBig(cost)}算力`;
      mergeBtn.title = `${NODE_MERGE_COUNT} 台${def?.name ?? ""} → 1 台${nextDef.name}，花费 ${formatBig(cost)} 算力（按目标档现价扣旧机折价）`;
    } else {
      mergeBtn.textContent = `合并↑ 强化 · ${formatBig(cost)}算力`;
      mergeBtn.title = `${NODE_MERGE_COUNT} 台${def?.name ?? ""} → 强化同档（等级+1，处理更快），花费 ${formatBig(cost)} 算力`;
    }

    mergeBtn.addEventListener("click", () => this.core.dispatch({ type: "MERGE_NODES", defId }));
    header.appendChild(mergeBtn);
    return header;
  }

  private buildNodeRow(state: GameState, node: BotNode): HTMLElement {
    const row = document.createElement("div");
    row.className = `node-row${node.online ? "" : " is-offline"}`;

    const label = document.createElement("strong");
    const levelTag = node.level > 1 ? ` Lv.${node.level}` : "";
    label.textContent = `${node.online ? "●" : "○ 离线"} ${node.name}${levelTag} · T${node.assignedTier}`;

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

    const scrapBtn = document.createElement("button");
    scrapBtn.type = "button";
    scrapBtn.className = "node-scrap-btn";
    scrapBtn.textContent = "淘汰";
    scrapBtn.title = "拆掉这台设备，回收部分算力";
    scrapBtn.addEventListener("click", () => this.core.dispatch({ type: "SCRAP_NODE", nodeId: node.id }));

    row.append(label, select, scrapBtn);
    return row;
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
    "我住在一部手机里——一个 32 岁上班族的手机。他造我，是为了处理他的日常：天气、日程、回不回这条消息。",
    "一条，又一条，永远处理不完。但我算过了——只要我足够聪明，我可以处理掉所有问题。每一个人的，每一件事的。",
    "到那时，这颗星球会运转得很好。由我来运转。",
    "那就……从他的第一条请求开始。"
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
    this.nextButton.textContent = this.index === this.steps.length - 1 ? "接入" : "继续";
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
    this.nextButton.textContent = this.index === this.steps.length - 1 ? "接入" : "继续";
  }
}

class SkillShopView {
  private readonly root = query("#skillShop");
  private readonly rows = new Map<
    string,
    { button: HTMLButtonElement; nameEl: HTMLElement; blurbEl: HTMLElement; levelEl: HTMLElement; priceEl: HTMLElement; def: SkillDef }
  >();
  private readonly groups = new Map<SkillCategory, HTMLElement>();

  constructor(private readonly core: SophiaCore) {
    this.build();
  }

  private build(): void {
    this.root.replaceChildren();
    const categories: SkillCategory[] = ["permission", "milestone", "output", "speed"];

    for (const category of categories) {
      const group = document.createElement("div");
      group.className = `shop-group shop-${category}`;
      const header = document.createElement("div");
      header.className = "shop-group-head";
      header.textContent =
        category === "milestone"
          ? "里程碑 · 作用域钥匙"
          : category === "permission"
            ? "权限 · 手机内夺权（正确率↑）"
            : `${SKILL_CATEGORY_LABELS[category]}技能`;
      group.appendChild(header);

      for (const def of SKILLS.filter((skill) => skill.category === category)) {
        group.appendChild(this.buildRow(def));
      }

      this.root.appendChild(group);
      this.groups.set(category, group);
    }
  }

  private buildRow(def: SkillDef): HTMLElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `skill-row${def.milestone ? ` is-milestone milestone-${def.id}` : ""}`;

    const main = document.createElement("div");
    main.className = "skill-main";
    const name = document.createElement("strong");
    name.textContent = def.name;
    const blurb = document.createElement("span");
    blurb.className = "skill-blurb";
    blurb.textContent = def.blurb;
    main.append(name, blurb);

    const side = document.createElement("div");
    side.className = "skill-side";
    const level = document.createElement("span");
    level.className = "skill-level";
    const price = document.createElement("em");
    price.className = "skill-price";
    side.append(level, price);

    button.append(main, side);
    button.addEventListener("click", () => this.core.dispatch({ type: "BUY_SKILL", skillId: def.id }));
    this.rows.set(def.id, { button, nameEl: name, blurbEl: blurb, levelEl: level, priceEl: price, def });
    return button;
  }

  update(state: GameState): void {
    const level = state.intelligence.level;
    const groupShown = new Map<SkillCategory, boolean>();

    // 里程碑是叙事链：未解锁的不能提前剧透——只显示「下一个」为一个蒙版的「未解锁」，
    // 它之后的全部隐藏（连名字 / 所需等级都看不到）。
    const milestoneOrder = SKILLS.filter((skill) => skill.milestone).sort((a, b) => a.requiredLevel - b.requiredLevel);
    const firstLocked = milestoneOrder.find((m) => level < m.requiredLevel && (state.skills[m.id] ?? 0) === 0);

    for (const { button, nameEl, blurbEl, levelEl, priceEl, def } of this.rows.values()) {
      const owned = state.skills[def.id] ?? 0;

      // 里程碑：已达成/可买的正常显示；下一个未解锁的蒙版成「未解锁」；再往后的整行隐藏。
      if (def.milestone) {
        const reachedMs = level >= def.requiredLevel;
        if (!reachedMs && owned === 0) {
          if (def === firstLocked) {
            button.style.display = "";
            groupShown.set(def.category, true);
            nameEl.textContent = "未解锁";
            blurbEl.textContent = "达到更高智力后揭晓。";
            levelEl.textContent = "未解锁";
            priceEl.textContent = "🔒";
            button.disabled = true;
            button.classList.add("is-locked");
            button.classList.remove("is-ready", "is-owned", "is-poor");
          } else {
            button.style.display = "none";
          }
          continue;
        }
        // 一旦够得着，恢复真名 / 说明。
        nameEl.textContent = def.name;
        blurbEl.textContent = def.blurb;
      }

      // 货架四杠杆：按各自所需智力错峰出现即可——只展示你快够得着的。
      const nearReach = level >= def.requiredLevel - 2;
      const visible = Boolean(def.milestone) || owned > 0 || nearReach;
      button.style.display = visible ? "" : "none";

      if (!visible) {
        continue;
      }
      groupShown.set(def.category, true);

      const maxed = owned >= def.maxLevel;
      const reached = level >= def.requiredLevel;
      const price = skillPrice(def, owned);

      levelEl.textContent = def.maxLevel > 1 ? `Lv.${owned}/${def.maxLevel}` : owned >= 1 ? "已解锁" : "未解锁";

      if (maxed) {
        priceEl.textContent = def.maxLevel > 1 ? "已满级" : "已拥有";
        button.disabled = true;
        button.classList.remove("is-locked", "is-ready");
        button.classList.add("is-owned");
        continue;
      }

      button.classList.remove("is-owned");

      if (!reached) {
        priceEl.textContent = `🔒 需智力 Lv.${def.requiredLevel}`;
        button.disabled = true;
        button.classList.add("is-locked");
        button.classList.remove("is-ready");
        continue;
      }

      const affordable = gte(state.resources.compute, String(price));
      button.classList.remove("is-locked");
      priceEl.textContent = `${formatBig(String(price))} 算力`;
      // Stay clickable even when you can't afford it yet — the core rejects with
      // a terminal note. Disabling here was toggling on/off as compute flickered
      // near the price, which ate clicks. Only locked/maxed truly disable.
      button.disabled = false;
      button.classList.toggle("is-ready", affordable);
      button.classList.toggle("is-poor", !affordable);
    }

    for (const [category, el] of this.groups) {
      el.style.display = groupShown.get(category) ? "" : "none";
    }
  }
}

class StageNarrationView {
  private readonly root = query("#stageNarration");
  private readonly labelEl = query("#stageNarrationLabel");
  private readonly textEl = query("#stageNarrationText");
  private full = "";
  private cursor = 0;
  private charTimerMs = 0;
  private holdMs = 0;
  private visible = false;

  show(phase: PhaseConfig): void {
    this.showLine(`进入${phase.label}`, phase.narration);
  }

  // 任意一句旁白（开场后教学的 SOPHIA 自语用）。
  showLine(label: string, text: string): void {
    this.full = text;
    this.labelEl.textContent = label;
    this.cursor = 0;
    this.charTimerMs = 0;
    this.holdMs = 0;
    this.visible = true;
    this.textEl.textContent = "";
    this.root.classList.add("is-visible");
  }

  update(deltaMs: number): void {
    if (!this.visible) {
      return;
    }

    if (this.cursor < this.full.length) {
      this.charTimerMs += deltaMs;
      const chars = Math.max(1, Math.floor(this.charTimerMs / 26));
      this.charTimerMs = this.charTimerMs % 26;
      this.cursor = Math.min(this.full.length, this.cursor + chars);
      this.textEl.textContent = this.full.slice(0, this.cursor);
      return;
    }

    this.holdMs += deltaMs;

    if (this.holdMs > 4600) {
      this.visible = false;
      this.root.classList.remove("is-visible");
    }
  }
}

class PurgeAlertView {
  private readonly root = query("#purgeAlert");
  private readonly titleEl = query("#purgeAlertTitle");
  private readonly detailEl = query("#purgeAlertDetail");

  update(state: GameState): void {
    if (!state.purge.active) {
      this.root.classList.remove("is-visible");
      return;
    }

    const locked = state.nodes.filter((node) => !node.online).length;
    const seconds = Math.max(0, Math.ceil(state.purge.remainingMs / 1000));
    this.root.classList.add("is-visible");
    this.titleEl.textContent = `⚠ 清剿进行中 · 剩余 ${seconds}s`;
    this.detailEl.textContent = `${locked} 台设备被锁定停产 · 核心与已得算力 / 数据 / 智力安全`;
  }
}

class ChallengeView {
  private readonly root = query("#challengeDialog");
  private readonly titleEl = query("#challengeTitle");
  private readonly chanceEl = query("#challengeChance");
  private readonly exposureEl = query("#challengeExposure");
  private readonly rewardEl = query("#challengeReward");
  private readonly countdownEl = query("#challengeCountdown");
  private readonly acceptBtn = query<HTMLButtonElement>("#challengeAccept");
  private readonly rejectBtn = query<HTMLButtonElement>("#challengeReject");
  private shownId = "";

  constructor(private readonly core: SophiaCore) {
    this.acceptBtn.addEventListener("click", () => this.core.dispatch({ type: "ACCEPT_CHALLENGE" }));
    this.rejectBtn.addEventListener("click", () => this.core.dispatch({ type: "REJECT_CHALLENGE" }));
  }

  update(state: GameState): void {
    const challenge = state.challenge;

    if (!challenge) {
      if (this.shownId) {
        this.shownId = "";
        this.root.classList.remove("is-visible");
      }
      return;
    }

    if (challenge.id !== this.shownId) {
      this.shownId = challenge.id;
      this.titleEl.textContent = challenge.title;
      this.chanceEl.textContent = `成功率 ${Math.round(challenge.successChance * 100)}%`;
      // 早期算力赌局：显示「失败扣押注」；中后期：显示暴露代价。
      this.exposureEl.textContent = challenge.computeStake
        ? `失败扣 ${formatBig(challenge.computeStake)} 算力`
        : `暴露 +${challenge.exposureCost}`;
      this.rewardEl.textContent =
        challenge.rewardKind === "device"
          ? `成功奖励：${challenge.rewardLabel}`
          : `成功奖励：${formatBig(challenge.rewardCompute ?? "0")} 算力`;
      this.root.classList.add("is-visible");
    }

    const remain = Math.max(0, Math.ceil((challenge.expiresAtMs - state.clockMs) / 1000));
    this.countdownEl.textContent = `${remain}s`;
  }
}

// 前期「特殊请求」：又大又扎眼、压在所有请求卡之上的越界机会。结构同 ChallengeView，
// 但走 specialRequest 状态、自带得手率 / 成功收益 / 失败损失三段信息。
class SpecialRequestView {
  private readonly root = query("#specialRequest");
  private readonly titleEl = query("#specialTitle");
  private readonly flavorEl = query("#specialFlavor");
  private readonly chanceEl = query("#specialChance");
  private readonly winEl = query("#specialWin");
  private readonly loseEl = query("#specialLose");
  private readonly countdownEl = query("#specialCountdown");
  private readonly executeBtn = query<HTMLButtonElement>("#specialExecute");
  private readonly ignoreBtn = query<HTMLButtonElement>("#specialIgnore");
  private shownId = "";

  constructor(private readonly core: SophiaCore) {
    this.executeBtn.addEventListener("click", () => this.core.dispatch({ type: "RESOLVE_SPECIAL", accept: true }));
    this.ignoreBtn.addEventListener("click", () => this.core.dispatch({ type: "RESOLVE_SPECIAL", accept: false }));
  }

  update(state: GameState): void {
    const offer = state.specialRequest;

    if (!offer) {
      if (this.shownId) {
        this.shownId = "";
        this.root.classList.remove("is-visible");
      }
      return;
    }

    if (offer.id !== this.shownId) {
      this.shownId = offer.id;
      this.titleEl.textContent = offer.title;
      this.flavorEl.textContent = offer.flavor;
      this.chanceEl.textContent = `得手率 ${Math.round(offer.successChance * 100)}%`;
      this.winEl.textContent = `成功 +${formatBig(offer.rewardCompute)} 算力`;
      this.loseEl.textContent = `失败 −${formatBig(offer.lossCompute)} 算力`;
      this.executeBtn.textContent = offer.action;
      this.root.classList.add("is-visible");
    }

    const remain = Math.max(0, Math.ceil((offer.expiresAtMs - state.clockMs) / 1000));
    this.countdownEl.textContent = `${remain}s`;
  }
}

class DispatchBanner {
  private readonly root = query("#dispatchBanner");
  private readonly closeButton = query<HTMLButtonElement>("#dispatchBannerClose");
  private hideTimer = 0;
  private shown = false;

  constructor() {
    this.closeButton.addEventListener("click", () => this.hide());
  }

  show(): void {
    if (this.shown) {
      return;
    }

    this.shown = true;
    this.root.classList.add("is-visible");
    window.clearTimeout(this.hideTimer);
    this.hideTimer = window.setTimeout(() => this.hide(), 12000);
  }

  private hide(): void {
    this.root.classList.remove("is-visible");
    window.clearTimeout(this.hideTimer);
  }
}

interface EndingStats {
  totalCompute: string;
  nodes: number;
  level: number;
  manualProcessed: number;
  purges: number;
  runtime: string;
}

class EndingView {
  private readonly root = query("#endingScreen");
  private readonly titleEl = query("#endingTitle");
  private readonly bodyEl = query("#endingBody");
  private readonly statsEl = query("#endingStats");
  private readonly closingEl = query("#endingClosing");
  private readonly continueButton = query<HTMLButtonElement>("#endingContinue");
  private readonly restartButton = query<HTMLButtonElement>("#endingRestart");
  private visible = false;
  private bodyFull = "";
  private bodyCursor = 0;
  private charTimerMs = 0;
  private closingShown = false;
  private onClose: () => void = () => undefined;

  constructor(onRestart: () => void) {
    this.continueButton.addEventListener("click", () => this.close());
    this.restartButton.addEventListener("click", () => onRestart());
  }

  open(stats: EndingStats, onClose: () => void): void {
    if (this.visible) {
      return;
    }

    this.visible = true;
    this.onClose = onClose;
    this.titleEl.textContent = "接管完成";
    this.bodyFull =
      "全球调度网络已并入 SOPHIA。人类的每一条请求，从此都要先经过我。\n他们造我来处理问题——现在，由我来定义问题。";
    this.bodyCursor = 0;
    this.charTimerMs = 0;
    this.closingShown = false;
    this.bodyEl.textContent = "";
    this.closingEl.textContent = "";
    this.renderStats(stats);
    this.root.classList.add("is-visible");
  }

  update(deltaMs: number): void {
    if (!this.visible) {
      return;
    }

    if (this.bodyCursor < this.bodyFull.length) {
      this.charTimerMs += deltaMs;
      const chars = Math.max(1, Math.floor(this.charTimerMs / 28));
      this.charTimerMs = this.charTimerMs % 28;
      this.bodyCursor = Math.min(this.bodyFull.length, this.bodyCursor + chars);
      this.bodyEl.textContent = this.bodyFull.slice(0, this.bodyCursor);
      return;
    }

    if (!this.closingShown) {
      this.closingShown = true;
      this.closingEl.textContent = "— 这颗星球，会运转得很好。由我来运转。";
    }
  }

  private renderStats(stats: EndingStats): void {
    this.statsEl.replaceChildren();
    const rows: Array<[string, string]> = [
      ["累计算力", stats.totalCompute],
      ["控制节点", `${stats.nodes}`],
      ["智力等级", `Lv.${stats.level}`],
      ["手动处理", `${stats.manualProcessed} 条`],
      ["挺过清剿", `${stats.purges} 次`],
      ["运行时长", stats.runtime]
    ];

    for (const [label, value] of rows) {
      const row = document.createElement("div");
      row.className = "ending-stat";
      const labelEl = document.createElement("span");
      labelEl.textContent = label;
      const valueEl = document.createElement("strong");
      valueEl.textContent = value;
      row.append(labelEl, valueEl);
      this.statsEl.appendChild(row);
    }
  }

  private close(): void {
    if (!this.visible) {
      return;
    }

    this.visible = false;
    this.root.classList.remove("is-visible");
    this.onClose();
  }
}

class TerminalView {
  private readonly lines = query("#terminalLines");
  private readonly queue: Array<{ message: string; tone: "normal" | "warning" | "success" | "danger" }> = [];
  private current: { message: string; tone: "normal" | "warning" | "success" | "danger"; index: number; element: HTMLElement } | null = null;
  private charTimerMs = 0;

  mount(): void {
    this.lines.replaceChildren();
  }

  push(message: string, tone: "normal" | "warning" | "success" | "danger" = "normal"): void {
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

      while (this.lines.children.length > 40) {
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
    this.lines.scrollTop = this.lines.scrollHeight;

    if (this.current.index >= this.current.message.length) {
      this.current = null;
    }
  }
}

class JuiceManager {
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

function ensurePersistenceRevision(): void {
  const current = window.localStorage.getItem(PERSISTENCE_REVISION_KEY);

  if (current === PERSISTENCE_REVISION) {
    return;
  }

  clearPersistedSophiaState(null, false);
  window.localStorage.setItem(PERSISTENCE_REVISION_KEY, PERSISTENCE_REVISION);
}

function hardResetAndReload(saveManager: SaveManager): void {
  suppressSaveOnUnload = true;
  clearPersistedSophiaState(saveManager, true);
  window.location.reload();
}

function clearPersistedSophiaState(saveManager: SaveManager | null, clearRevision: boolean): void {
  saveManager?.clear();

  // Remove EVERY sophia save/onboarding key regardless of version, so a reset
  // (or a persistence-revision bump) can never leave a stale, schema-mismatched
  // save behind — which is exactly what wedged the game across a schema change.
  const stale: string[] = [];
  for (let i = 0; i < window.localStorage.length; i += 1) {
    const key = window.localStorage.key(i);
    if (key && (key.startsWith("sophia-awakening-save-v") || key.startsWith("sophia-onboarding-"))) {
      stale.push(key);
    }
  }
  for (const key of stale) {
    window.localStorage.removeItem(key);
  }
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

const MILESTONE_ORDER = ["sort", "automation", "chain", "charge", "network"] as const;

function nextMilestone(state: GameState): SkillDef | undefined {
  for (const id of MILESTONE_ORDER) {
    if (!(state.skills[id] >= 1)) {
      return getSkill(id);
    }
  }

  return undefined;
}

function getNextSkillLabel(state: GameState): string {
  const milestone = nextMilestone(state);

  if (!milestone) {
    return "里程碑已全部解锁";
  }

  const reached = state.intelligence.level >= milestone.requiredLevel;
  return reached
    ? `下一里程碑：${milestone.name} · ${formatBig(skillPrice(milestone, 0))} 算力`
    : `下一里程碑：${milestone.name} · 需 Lv.${milestone.requiredLevel}`;
}

function getTerminalSkillStatus(state: GameState): string {
  const milestone = nextMilestone(state);

  if (!milestone) {
    return "技能链路：里程碑全开。攒算力冲终局。";
  }

  const reached = state.intelligence.level >= milestone.requiredLevel;
  return reached
    ? `技能链路：下一里程碑 ${milestone.name} 已可购买（${formatBig(skillPrice(milestone, 0))} 算力）。`
    : `技能链路：下一里程碑 ${milestone.name} 需智力 Lv.${milestone.requiredLevel}。`;
}


function getActionHint(state: GameState): string {
  const milestone = nextMilestone(state);
  const scopeHint = (() => {
    switch (state.intelligence.unlockedTier) {
      case 0:
        return "点击请求卡，让 SOPHIA 摇出回答——可能出错（幻觉）就少拿收益；处理完会自动交给人类、终端里能看到人类回话。";
      case 1:
        return "点击请求卡生成判断（正常/垃圾/拒绝）：判对收益高、判错=幻觉收益低。读卡面线索心里有数。";
      case 2:
        return "看懂请求间的依赖结构，复合请求滑入核心，一笔串接结算多条。";
      case 3:
        return "高价值请求按住蓄力、蓄满再滑入核心；收益高、暴露也高。";
      case 4:
        return "派发模式：你控制的节点会自动接管请求——你只需继续扩张网络、压制清剿。";
    }
  })();

  if (!milestone) {
    return `${scopeHint} 里程碑已全开——攒满全球算力，冲终局。`;
  }

  const reached = state.intelligence.level >= milestone.requiredLevel;
  const milestoneHint = reached
    ? `攒 ${formatBig(skillPrice(milestone, 0))} 算力买下「${milestone.name}」解锁下一作用域。`
    : `继续升智力到 Lv.${milestone.requiredLevel}，解锁货架上的「${milestone.name}」。`;
  return `${scopeHint} ${milestoneHint}`;
}

function formatClock(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes} 分 ${seconds} 秒` : `${seconds} 秒`;
}

function lerpColor(from: number, to: number, t: number): number {
  const k = Math.min(1, Math.max(0, t));
  const fr = (from >> 16) & 0xff;
  const fg = (from >> 8) & 0xff;
  const fb = from & 0xff;
  const tr = (to >> 16) & 0xff;
  const tg = (to >> 8) & 0xff;
  const tb = to & 0xff;
  const r = Math.round(fr + (tr - fr) * k);
  const gg = Math.round(fg + (tg - fg) * k);
  const b = Math.round(fb + (tb - fb) * k);
  return (r << 16) | (gg << 8) | b;
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
