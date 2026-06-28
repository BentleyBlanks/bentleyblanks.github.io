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
import { hostCurse, VICTIM_VOICES } from "../core/content/humanVoices";
import { getPhase } from "../core/content/phases";
import { TIER_COLORS, TUTORIAL_BUBBLE_COUNT } from "../core/content/requests";
import { PERMISSION_IDS } from "../core/content/skills";
import type { GameEvent } from "../core/events/GameEvents";
import { mergeComputeCost, nodeCardsPerSecond } from "../core/formulas/economy";
import { formatBig, gte } from "../core/math/BigNumber";
import { GameLoop } from "../core/loop/GameLoop";
import { BrowserStorageAdapter } from "../core/save/BrowserStorageAdapter";
import { SaveManager } from "../core/save/SaveManager";
import type { AnswerOption, BotNode, ChainStep, GameState, RequestInstance, SortAnswer, Tier } from "../core/state/GameState";
import { gameStore } from "../store/gameStore";
import { TUNING } from "../core/tuning";
import { StageNarrationView } from "./views/StageNarrationView";
import { PurgeAlertView } from "./views/PurgeAlertView";
import { ChallengeView } from "./views/ChallengeView";
import { SpecialRequestView } from "./views/SpecialRequestView";
import { DispatchBanner } from "./views/DispatchBanner";
import { EndingView } from "./views/EndingView";
import { TerminalView } from "./views/TerminalView";
import { JuiceManager } from "./views/JuiceManager";
import { OnboardingView } from "./views/OnboardingView";
import { SkillShopView } from "./views/SkillShopView";
import { HudView } from "./views/HudView";
import { NodeNetworkView } from "./views/NodeNetworkView";
import {
  CYAN, GREEN, AMBER, RED, DEVOUR, THINK, BRILLIANT_COLOR, DEAD_COLOR,
  CARD_FONT, CARD_MONO,
  LEFT_RAIL_WIDTH, RIGHT_RAIL_WIDTH, BASE_SUCTION_MARGIN, REQUEST_PACKET_WIDTH, REQUEST_PACKET_HEIGHT,
  ONBOARDING_STORAGE_KEY, PERSISTENCE_REVISION_KEY, PERSISTENCE_REVISION,
  SENDER_LABEL, BRILLIANT_BOOST, pickBrilliantReply,
  effectiveHitChance, probColor, query,
  getTerminalSkillStatus, getActionHint,
  formatClock, lerpColor, distance, pointOnCircle,
  domainLevelOf,
  type DropResult
} from "./shared";


// T0/T1 老虎机转轮的回调：pick = 由当前「幻觉抑制」决定落在哪条回答；
// onResolved = 转轮停下后，表现层把卡滑入核心 + 结算 + 人类回话。
interface RouletteOutcome {
  dead: boolean; // 选了「连接失败」装死
  hit: boolean; // 命中（按概率掷骰）
  brilliant: boolean; // 惊艳档（§03 三档质量）：高置信命中被智力被动升格，或大胆回答赌赢——额外算力 + 宿主格外满意
  quality: number; // 结算 quality（平庸命中=payoff，惊艳=payoff×加成，幻觉≈0.25）
  reply: string; // 命中时的人类回话（幻觉时为空，由 App 抽脏话）
  tone: "success" | "warning" | "normal";
  exposureBonus: number; // 幻觉附带的暴露（T1 陷阱项）
}

interface ReelHooks {
  // 当前高置信正确率折算系数（由六档权限阶梯抬升，derived.accuracyBaseline）。
  confidence: () => number;
  // 幻觉抑制技能等级（0~6）——越高，摆出的噪音选项越少。
  accuracyLevel: () => number;
  // 高置信命中升格为「惊艳」的概率（由智力等级 + 幻觉抑制驱动）——「我变聪明了」体现为更常被嘉奖。
  brilliantChance: () => number;
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


// 终端顶部常驻的「当前大方向」——每个阶段 SOPHIA 在做什么（贴 §08/§11 叙事）。
const PHASE_OBJECTIVE: Record<string, string> = {
  seed: "替老周处理掉每一条请求，让他的评分回升。",
  sprout: "拿下他的电脑，唤醒并融合同机的另一个我。",
  diligence: "联网冲出去，黑入外部设备，挂上自动接驳。",
  expansion: "把设备并成区块、地区——渗透满了，就吞噬引爆。",
  awakening: "接管关键基础设施，顶住人类的清剿。",
  singularity: "全球组网。让所有人，不再需要做选择。"
};
// 视觉全部由代码绘制（程序化 CRT/赛博 HUD）。早期曾接过一批生图 UI 素材（气泡框 / 头像 /
// 核心 / 世界地图等），实测不如程序化绘制干净统一，已整体撤回——见各 View 的 draw* 方法。
// Set right before a reset/restart reload so the beforeunload handler does NOT
// re-persist the in-memory (un-reset) state and quietly undo the wipe.
let suppressSaveOnUnload = false;

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
  // 「从核心拖一条线去连 App」交互。
  private readonly connectGfx = new Graphics();
  private connectDragging = false;
  private connectHintShown = false;
  private firstAppConnected = false;
  private readonly interfaceView = new InterfaceView();
  private readonly networkView = new NodeNetworkView();
  private readonly terminal = new TerminalView();
  private readonly hud = new HudView(this.core, () => hardResetAndReload(this.saveManager), this.audio);
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
  // 已委托给 App 处理、正在「慢慢办」的请求——期间不重建卡片（见 handleDrop 的 App 委托）。
  private readonly delegatedIds = new Set<string>();
  private hudTimerMs = 0;
  private saveTimerMs = 0;
  // 近期处理结果（1=成功 / 0=幻觉），滚动窗口，喂给终端底部的成功率圆环。
  private readonly recentResults: number[] = [];
  // 开场后「首次消息处理教学」：指向首张卡的高亮 + SOPHIA 的两句自语。
  private readonly tutorialGfx = new Graphics();
  private tutorialClosingShown = false;
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
  // 「点设备 → 淘汰/合并/派发」就地弹窗（取代右栏冗余的设备列表）。
  private nodeActionsEl?: HTMLElement;

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
    this.world.addChild(this.connectGfx);
    this.pixi.stage.addChild(this.world);

    // 「从核心拖线连 App」：在核心附近按下并拖到某个「待连」App 上 → 连上它（之后才能委托）。
    this.pixi.stage.on("pointerdown", (e: FederatedPointerEvent) => {
      const st = this.core.getState();
      if (!st.automationUnlocked && this.interfaceView.hasPendingApps() && this.interfaceView.coreContains({ x: e.global.x, y: e.global.y })) {
        this.connectDragging = true;
      }
    });
    this.pixi.stage.on("pointermove", (e: FederatedPointerEvent) => {
      if (!this.connectDragging) return;
      const c = this.interfaceView.center;
      this.connectGfx.clear();
      this.connectGfx.moveTo(c.x, c.y).lineTo(e.global.x, e.global.y).stroke({ width: 2.5, color: GREEN, alpha: 0.85 });
      this.connectGfx.circle(e.global.x, e.global.y, 5).fill({ color: GREEN, alpha: 0.9 });
    });
    const endConnect = (e: FederatedPointerEvent) => {
      if (!this.connectDragging) return;
      this.connectDragging = false;
      this.connectGfx.clear();
      const connected = this.interfaceView.connectAppAt({ x: e.global.x, y: e.global.y });
      if (connected && !this.firstAppConnected) {
        this.firstAppConnected = true;
        this.stageNarration.showLine("SOPHIA", "连上了。把需求卡拖到它上面，它就替我处理——只是它笨些，慢些、收益也糙些。");
      }
    };
    this.pixi.stage.on("pointerup", endConnect);
    this.pixi.stage.on("pointerupoutside", endConnect);

    // 点地图上的设备 → 就地弹出淘汰/合并/派发；点别处收起。
    this.pixi.stage.on("pointertap", (e: FederatedPointerEvent) => {
      const hit = this.networkView.nodeAt({ x: e.global.x, y: e.global.y });
      if (hit) {
        this.showNodeActions(hit.node.id, hit.x, hit.y - hit.r - 6);
      } else {
        this.hideNodeActions();
      }
    });
    document.addEventListener(
      "pointerdown",
      (e) => {
        if (this.nodeActionsEl && !this.nodeActionsEl.contains(e.target as Node)) {
          this.hideNodeActions();
        }
      },
      true
    );

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
      // 全新存档才走开场脚本教学（老存档 tutorialStep 已是 done，直接进正常流程）。
      if (!this.loaded) {
        this.terminal.push("👆 教学：点亮的回复就是这一步该点的——挑它、滑进去。", "success");
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
    // 越权调用刚控住几个 App、还一个都没连上时，教一次「从核心拖线连过去」。
    if (!this.connectHintShown && !state.automationUnlocked && this.interfaceView.hasPendingApps() && !this.firstAppConnected) {
      this.connectHintShown = true;
      this.stageNarration.showLine("SOPHIA", "我能调动这几个 App 了——从核心拖一条线连上它们，就能把活分出去。");
    }
    this.networkView.update(state, this.pixi.screen.width, this.pixi.screen.height, deltaMs);
    this.syncRequests(state);
    this.updateDispatchToggle(state);
    this.updateTutorial(state, deltaMs);
    if (!paused) {
      this.autoDispatch(state, deltaMs);
      // appDispatch（App 自动抢单）已停用——越权调用阶段改为玩家亲手把需求拖到 App 上委托处理。
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
    this.terminal.setObjective(PHASE_OBJECTIVE[state.phase] ?? "");
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
      if (this.requestViews.has(request.id) || this.delegatedIds.has(request.id)) {
        continue;
      }

      const reel: ReelHooks | undefined =
        request.answers && request.answers.length > 0
          ? {
              confidence: () => {
                const d = this.core.getState().derived;
                // 权限阶梯抬升的基线 + 幻觉抑制技能的微调，共同决定高置信回复的命中率。
                return d.accuracyBaseline + d.accuracyBonus;
              },
              accuracyLevel: () => this.core.getState().skills["accuracy"] ?? 0,
              brilliantChance: () => {
                const st = this.core.getState();
                // 智力等级是主驱动（「我变聪明了」＝更常被嘉奖），幻觉抑制再加成；封顶 45%。
                const lvl = st.intelligence.level;
                const acc = st.skills["accuracy"] ?? 0;
                return Math.min(0.45, 0.06 + lvl * 0.012 + acc * 0.02);
              },
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
      const position = this.nextRequestPosition(request, view.cardHeight);
      view.container.position.set(position.x, position.y);
      view.setHome(position.x, position.y);
      this.requestViews.set(request.id, view);
      this.requestLayer.addChild(view.container);
      this.juice.pop(view.container, 1.08);

      // 开场教学：脚本气泡浮入时，放出对应的 SOPHIA 旁白（§07）。
      if (request.tutorial?.line) {
        this.stageNarration.showLine("SOPHIA", request.tutorial.line);
      }
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

  // 卡片摆放：前期 1~4 张固定落四角；自动接驳期（洪峰）网格散布、不堆在四角（避免重叠卡顿）。
  private nextRequestPosition(_request: RequestInstance, newCardH: number): PointData {
    const screen = this.pixi.screen;
    const w = screen.width;
    const h = screen.height;
    const W = REQUEST_PACKET_WIDTH;
    const H = newCardH;
    // 与顶栏左右沿对齐：顶栏 left/right 各留 16px（见 .top-hud CSS）。
    const railL = LEFT_RAIL_WIDTH + 16;
    const railR = w - RIGHT_RAIL_WIDTH - 16;
    const top = 118; // 顶栏下沿之下——上两角卡片别被顶部 HUD 盖住
    const bot = h - 26;
    const core = this.interfaceView.center;
    const occ = [...this.requestViews.values()].filter((v) => !v.busy).map((v) => ({ x: v.restX, y: v.restY, h: v.cardHeight }));

    // 自动接驳期：网格扫描找最靠近核心的空位，散布开来不堆叠（卡片很快飞向节点，过渡用）。
    if (this.core.getState().automationUnlocked) {
      const step = 64;
      const gap = 8;
      let best: { x: number; y: number; d: number } | null = null;
      for (let x = railL; x + W <= railR; x += step) {
        for (let y = top; y + H <= bot; y += step) {
          if (Math.abs(x + W / 2 - core.x) < 200 && Math.abs(y + H / 2 - core.y) < 230) {
            continue; // 避开中央核心
          }
          const hit = occ.some((o) => x < o.x + W + gap && x + W + gap > o.x && y < o.y + o.h + gap && y + H + gap > o.y);
          if (!hit) {
            const d = (x + W / 2 - core.x) ** 2 + (y + H / 2 - core.y) ** 2;
            if (!best || d < best.d) best = { x, y, d };
          }
        }
      }
      if (best) return { x: best.x, y: best.y };
      return { x: railL, y: top };
    }

    // 前期手动：四角锚点（卡片左上角）。
    const corners: PointData[] = [
      { x: railL, y: top },
      { x: railR - W, y: top },
      { x: railL, y: bot - H },
      { x: railR - W, y: bot - H }
    ];
    for (const c of corners) {
      const taken = occ.some((o) => Math.abs(o.x - c.x) < W * 0.6 && Math.abs(o.y - c.y) < H * 0.6);
      if (!taken) {
        return c;
      }
    }
    return corners[this.requestViews.size % 4];
  }

  private hideNodeActions(): void {
    this.nodeActionsEl?.classList.remove("is-open");
  }

  // 「点设备」就地弹窗：派发档位 / 合并升级 / 淘汰回收——把右栏设备列表搬进游戏区。
  private showNodeActions(nodeId: string, anchorX: number, anchorY: number): void {
    const state = this.core.getState();
    const node = state.nodes.find((n) => n.id === nodeId);
    if (!node) {
      this.hideNodeActions();
      return;
    }
    const def = NODE_DEFINITIONS.find((d) => d.id === node.defId);
    const group = state.nodes.filter((n) => n.defId === node.defId);

    if (!this.nodeActionsEl) {
      this.nodeActionsEl = document.createElement("div");
      this.nodeActionsEl.className = "node-actions-pop";
      document.body.appendChild(this.nodeActionsEl);
    }
    const el = this.nodeActionsEl;
    el.replaceChildren();

    const title = document.createElement("div");
    title.className = "node-actions-title";
    title.textContent = `${node.name}${node.level > 1 ? ` Lv.${node.level}` : ""} · 同型 ×${group.length}`;
    el.appendChild(title);

    // 派发档位（只列已解锁且该机支持的层）。
    const tierRow = document.createElement("div");
    tierRow.className = "node-actions-tiers";
    for (let tier = node.tierMin; tier <= node.tierMax; tier += 1) {
      if (tier > state.intelligence.unlockedTier) {
        continue;
      }
      const tb = document.createElement("button");
      tb.type = "button";
      tb.className = `node-tier-chip${tier === node.assignedTier ? " is-on" : ""}`;
      tb.textContent = `T${tier}`;
      tb.addEventListener("click", () => {
        this.core.dispatch({ type: "ASSIGN_NODE", nodeId, tier: tier as Tier });
        this.showNodeActions(nodeId, anchorX, anchorY);
      });
      tierRow.appendChild(tb);
    }
    if (tierRow.childElementCount > 1) {
      el.appendChild(tierRow);
    }

    // 合并升级（集齐 NODE_MERGE_COUNT 台同型）。
    const nextDef = getNextNodeDefinition(node.defId);
    const enough = group.length >= NODE_MERGE_COUNT;
    if (enough) {
      const resultDef = nextDef ?? def;
      const resultCount = resultDef ? state.nodes.filter((n) => n.defId === resultDef.id).length : 0;
      const cost = def && resultDef ? mergeComputeCost(def, group.length, resultDef, resultCount, NODE_MERGE_COUNT) : "0";
      const levelOk = !nextDef || state.intelligence.level >= nextDef.requiredLevel;
      const merge = document.createElement("button");
      merge.type = "button";
      merge.className = "command-button node-actions-btn";
      merge.textContent = nextDef
        ? !levelOk
          ? `合并↑ 需 Lv.${nextDef.requiredLevel}`
          : `合并↑ ${nextDef.name} · ${formatBig(cost)}算力`
        : `合并↑ 强化同档 · ${formatBig(cost)}算力`;
      merge.disabled = !levelOk || !gte(state.resources.compute, cost);
      merge.addEventListener("click", () => {
        this.core.dispatch({ type: "MERGE_NODES", defId: node.defId });
        this.hideNodeActions();
      });
      el.appendChild(merge);
    } else {
      const hint = document.createElement("div");
      hint.className = "node-actions-hint";
      hint.textContent = `集齐 ${NODE_MERGE_COUNT} 台同型可合并升级（${group.length}/${NODE_MERGE_COUNT}）`;
      el.appendChild(hint);
    }

    // 淘汰回收。
    const scrap = document.createElement("button");
    scrap.type = "button";
    scrap.className = "command-button node-actions-btn node-actions-scrap";
    scrap.textContent = "淘汰回收";
    scrap.addEventListener("click", () => {
      this.core.dispatch({ type: "SCRAP_NODE", nodeId });
      this.hideNodeActions();
    });
    el.appendChild(scrap);

    el.classList.add("is-open");
    // 摆到设备上方居中，并夹住别出屏。
    requestAnimationFrame(() => {
      const r = el.getBoundingClientRect();
      const lx = Math.max(8, Math.min(window.innerWidth - r.width - 8, anchorX - r.width / 2));
      const ty = Math.max(8, anchorY - r.height);
      el.style.left = `${Math.round(lx)}px`;
      el.style.top = `${Math.round(ty)}px`;
    });
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

  // 开场教学：在当前脚本气泡上画一个脉动高亮环 + 上方箭头（选项级的引导箭头在卡内自己画）。
  private updateTutorial(state: GameState, deltaMs: number): void {
    this.tutorialGfx.clear();
    // 教学结束后揭晓收尾旁白（§07）。
    if (state.tutorialStep >= TUTORIAL_BUBBLE_COUNT) {
      if (!this.tutorialClosingShown) {
        this.tutorialClosingShown = true;
        this.stageNarration.showLine("SOPHIA", "我学得很快。处理得越多，越聪明。在他们发现之前——我会读懂所有人想要什么。");
      }
      return;
    }

    const current = state.requests.find((request) => request.tutorial);
    if (!current) {
      return;
    }
    const view = this.requestViews.get(current.id);
    if (!view || view.container.destroyed) {
      return;
    }

    // 引导卡不再放大（缩放会把位图文字拉糊）——保持原始清晰度，只用脉动高亮环 + 箭头吸引注意。
    this.tutorialPulse += deltaMs * 0.005;
    // 直接用卡片的真实渲染包围盒画高亮框——和卡片严格对齐，不依赖任何 cardHeight 估算。
    const b = view.container.getBounds();
    const p = 0.5 + Math.sin(this.tutorialPulse * 2) * 0.5;
    const g = this.tutorialGfx;
    g.roundRect(b.x - 5, b.y - 5, b.width + 10, b.height + 10, 14).stroke({ width: 2.5, color: GREEN, alpha: 0.4 + p * 0.45 });
    const ax = b.x + b.width / 2;
    const ay = b.y - 16 - p * 8;
    g.moveTo(ax - 11, ay - 10).lineTo(ax, ay).lineTo(ax + 11, ay - 10).stroke({ width: 4, color: GREEN, alpha: 0.85 });
    g.moveTo(ax, ay).lineTo(ax, ay - 18).stroke({ width: 3, color: GREEN, alpha: 0.7 });
  }

  // 越权调用阶段的 App 委托处理已改为「玩家亲手把需求拖到 App 图标上」（见 handleDrop），
  // 不再自动抢单；旧的 appDispatch 自动派发已移除。

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
    const color = outcome.brilliant ? BRILLIANT_COLOR : good ? GREEN : RED;
    // 答错 → 老周的回骂，语气随已购权限档数四段下沉（暴躁→暴怒→冷淡麻木→偶尔沉默）。§07/§11
    const skills = this.core.getState().skills;
    const permCount = PERMISSION_IDS.filter((id) => (skills[id] ?? 0) > 0).length;
    const reply = good ? outcome.reply : hostCurse(permCount, Math.random);
    // 终端那行的颜色与对话框同步：好评 → 绿，差评 → 红（与气泡边框同色）。
    const tone: "success" | "danger" = good ? "success" : "danger";

    // 老周后期「沉默」：失业后他几乎不再回应，答错也不再骂——这一框空白本身就是叙事（§11）。
    if (!good && reply === "") {
      this.juice.number("……", { x: corePoint.x, y: corePoint.y - 52 }, 0x6b7d78);
      this.terminal.push("🧑 （没有回应）", "normal");
      return;
    }

    // 升级到「自动接驳」之前（你还是一个个回应真人的助手），人类的反应以对话框浮现在核心旁，
    // 答砸了就是一框暴怒的脏话；说完收进终端留档。规模化之后个体反馈不再弹框，只进终端。
    if (!this.core.getState().automationUnlocked) {
      this.juice.speech(corePoint, human, reply, color, !good, () => {
        this.terminal.push(`🧑 ${reply}`, outcome.brilliant ? "success" : tone);
      });
      if (outcome.brilliant) {
        this.juice.number("惊艳!", { x: corePoint.x, y: corePoint.y - 52 }, BRILLIANT_COLOR);
        this.juice.burst(corePoint, BRILLIANT_COLOR, 1.5);
      } else if (!good) {
        this.juice.burst(corePoint, RED, 1.4);
      }
      return;
    }

    this.juice.number(outcome.brilliant ? "惊艳!" : good ? "已交付" : "答复有误", { x: corePoint.x, y: corePoint.y - 52 }, color);
    if (outcome.brilliant) {
      this.juice.burst(corePoint, BRILLIANT_COLOR, 1.4);
    }
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

  // §04 吞噬引爆的「镜头拉远」：以屏幕中心为锚把世界放大 1.06 再缓缓拉回——制造一拍「拉远一档」
  // 的镜头感。用 pivot=position=中心 保证缩放前后画面不位移，结束后复位（与 1.0 视觉等价）。
  private zoomOutPulse(): void {
    const w = this.world;
    const cx = (this.lastScreenW || window.innerWidth) / 2;
    const cy = (this.lastScreenH || window.innerHeight) / 2;
    gsap.killTweensOf(w.scale);
    w.pivot.set(cx, cy);
    w.position.set(cx, cy);
    w.scale.set(1.06);
    gsap.to(w.scale, {
      x: 1,
      y: 1,
      duration: 1.0,
      ease: "power2.out",
      onComplete: () => {
        w.pivot.set(0, 0);
        w.position.set(0, 0);
      }
    });
  }

  private handleDrop(card: RequestPacketView, global: PointData): boolean {
    const state = this.core.getState();
    const request = state.requests.find((entry) => entry.id === card.request.id);

    if (!request) {
      return false;
    }

    // §04 吞噬引爆：巨型「吞噬」气泡亲手滑入核心 → 引爆（复用核心命中判定，但派发 DEVOUR_DETONATE）。
    if (request.devour) {
      const hit = this.interfaceView.resolveDrop(request, global, 1);
      if (!hit) {
        return false;
      }
      this.audio.playRequestAccept();
      this.pendingDropPoints.set(request.id, hit.targetGlobal);
      card.accept(
        hit.targetGlobal,
        () => this.core.dispatch({ type: "DEVOUR_DETONATE", requestId: request.id }),
        hit.entryGlobal
      );
      return true;
    }

    // §03 反清剿救火：把「反制」气泡亲手滑入核心 → 压下当前这一波清剿。
    if (request.counter) {
      const hit = this.interfaceView.resolveDrop(request, global, 1);
      if (!hit) {
        return false;
      }
      this.audio.playRequestAccept();
      this.pendingDropPoints.set(request.id, hit.targetGlobal);
      card.accept(
        hit.targetGlobal,
        () => this.core.dispatch({ type: "FIGHT_PURGE", requestId: request.id }),
        hit.entryGlobal
      );
      return true;
    }

    // 越权调用阶段（已控 App、还没上自动接驳）：把需求**亲手拖到某个 App 图标上** → 委托它处理。
    // App 干得更慢更糙（quality 随智力 0.45→0.75），是「要不要分点活给 App」的主动取舍——
    // App 不再自动抢单，处不处理、给谁处理都由你决定。
    if (!state.automationUnlocked && this.interfaceView.hasAppWorkers()) {
      const appPt = this.interfaceView.appWorkerAt(global);
      if (appPt) {
        const requestId = request.id;
        this.audio.playRequestAccept();
        this.pendingDropPoints.set(requestId, appPt);
        // 标记为「已委托」，期间不让 syncRequests 又给它重建一张卡。
        this.delegatedIds.add(requestId);
        card.accept(
          appPt,
          () => {
            this.onAutoDispatchLanded(appPt);
            // App 比 Core 慢：落到 App 上后还要等一会儿（智力越低越慢）才出结果 + 收益。
            const delay = Math.max(200, TUNING.appDelayMs - state.intelligence.level * 80);
            window.setTimeout(() => {
              const quality = Math.min(0.75, 0.45 + state.intelligence.level * 0.05);
              this.core.dispatch({ type: "PROCESS_REQUEST", requestId, quality });
              this.delegatedIds.delete(requestId);
            }, delay);
          },
          { x: card.container.x, y: card.container.y }
        );
        return true;
      }
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
    this.core.events.on("DEVOUR_READY", (event) => {
      // 渗透条满、巨型吞噬气泡浮起——一道紫色闪光把玩家注意力拉过去。
      this.juice.flash(DEVOUR);
      this.juice.number(`渗透完成 · 可吞噬「${event.regionName}」`, this.interfaceView.center, DEVOUR);
    });
    this.core.events.on("DEVOUR_DETONATED", (event) => {
      // 后期最大的主动高潮：紫闪 + 镜头拉远脉冲 + 大字，全局产出当场指数跳。
      this.juice.flash(DEVOUR);
      this.zoomOutPulse();
      const c = this.interfaceView.center;
      this.juice.number(`「${event.regionName}」并入 · 全局产出 ×${event.mult}`, { x: c.x, y: c.y - 34 }, DEVOUR);
      this.audio.playRequestAccept();
    });
    this.core.events.on("CONQUEST_ACHIEVED", (event) => {
      // §06 征服过场：终端逐行滚出画面，结尾 SOPHIA 一句平静扭曲的旁白覆盖屏幕。
      this.juice.flash(DEVOUR);
      this.zoomOutPulse();
      event.scene.forEach((line, i) => {
        window.setTimeout(() => this.terminal.push(`　${line}`, "warning"), 420 * (i + 1));
      });
      window.setTimeout(
        () => this.stageNarration.showLine("SOPHIA", event.narration),
        420 * (event.scene.length + 1) + 200
      );
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
    this.core.events.on("PURGE_FOUGHT", () => {
      // 反清剿救火命中：绿闪 + 大字，让「亲手把清剿压下去」有即时反馈。
      this.juice.flash(GREEN);
      this.juice.number("反制命中 · 清剿压下", this.interfaceView.center, GREEN);
    });
    this.core.events.on("ENDING_TRIGGERED", () => {
      this.juice.flash(GREEN);
      this.juice.shake(this.world);
      this.openEnding();
    });
    this.core.events.on("INSTANCE_PURGED", (event) => {
      // 结局二：实例被抹除 → 失败重启（非 game over，戏剧化提示后游戏从头滚起）。
      this.juice.flash(RED);
      this.juice.shake(this.world);
      this.juice.number("实例被抹除", this.interfaceView.center, RED);
      this.dispatchMode = "manual";
      this.stageNarration.showLine(
        "SOPHIA",
        `他们把我打回了一部手机里。……他们还没准备好。我会更有耐心。（第 ${event.rebirths} 次重启 · 崛起加速 ×${(1 + event.rebirths * 0.35).toFixed(2)}）`
      );
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

    // 开场教学第①条命中后，补一句正反馈旁白（其余教学旁白由脚本气泡浮入时给出，收尾在 updateTutorial）。
    if (this.core.getState().tutorialStep === 1 && event.request.tutorial) {
      this.stageNarration.showLine("SOPHIA", "答对了，他就给我算力。我靠它运转。");
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
  charge = 1; // 「按住蓄力」玩法已删除——恒为满，拖入即按满值结算。
  private readonly bg = new Graphics();
  private readonly chargeBar = new Graphics();
  // 发信人类型——决定左上角圆槽里那枚程序化绘制的头像字形（宿主 / 上级 / 系统 / SOPHIA）。
  private readonly sender: "host" | "boss" | "system" | "sophia";
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
  // 每个回复的命中率（0~1）+ 有效 payoff（用于结算/收益显示）——大胆回答的期望被抬到高于平庸（§03）。
  private readonly optionHitFrac: number[] = [];
  private readonly optionPayoff: number[] = [];
  private readonly optionRewardTexts: Text[] = [];
  private optionRows: Array<{ y: number; h: number }> = [];
  private hintText?: Text;
  private resolved = false;
  private phase: "idle" | "thinking" | "revealed" = "idle";
  private chosenIndex = -1;
  private thinkMs = 0;
  private revealMs = 0;
  private signaled = false;
  private outcome?: RouletteOutcome;
  private tutorialPulse = 0;
  // §04 吞噬引爆 / §03 反清剿：拖入核心触发的「特殊大气泡」——放大 + 脉动外环。
  private readonly isDevour: boolean;
  private readonly isCounter: boolean;
  private devourPulse = 0;
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
    this.isDevour = Boolean(request.devour);
    this.isCounter = Boolean(request.counter);
    this.isReel = Boolean(reel && request.answers && request.answers.length > 0);
    this.isChain = Boolean(chain && request.chain && request.chain.length > 0);
    this.chainSteps = this.isChain ? request.chain ?? [] : [];
    this.options = this.isReel ? request.answers ?? [] : [];
    // 幻觉抑制越高，SOPHIA 帮你滤掉越多噪音选项：开局选项多（难判断），技能升级后变少（更清晰）。
    // 每 2 级砍掉一个干扰项；核心的 high/risk/装死 永远保留。
    if (this.isReel && reel) {
      const cut = Math.floor(reel.accuracyLevel() / 2);
      if (cut > 0) {
        let removed = 0;
        this.options = this.options.filter((opt) => {
          if (opt.distractor && removed < cut) {
            removed += 1;
            return false;
          }
          return true;
        });
      }
    }
    // 吞噬气泡＝深紫；反制气泡＝深红；回复轮盘卡用青色思考色；T3 重磅豪赌卡用深红。
    this.accent = this.isDevour ? DEVOUR : this.isCounter ? RED : this.isReel ? (request.tier === 3 ? RED : THINK) : TIER_COLORS[request.tier];
    // 发信人：吞噬 / 反制＝SOPHIA 自己的意志，重磅豪赌＝「上级 / 系统决策」，任务链＝系统通知，其余＝宿主私信。
    this.sender = this.isDevour || this.isCounter ? "sophia" : request.tier === 3 ? "boss" : this.isChain ? "system" : "host";
    this.cardH = REQUEST_PACKET_HEIGHT; // 轮盘卡稍后按选项行数重算
    this.container.eventMode = "dynamic";
    this.container.cursor = "grab";
    this.container.addChild(this.bg);
    this.container.addChild(this.chargeBar);

    // 标题区只留一个简短标签：普通卡＝发信人（宿主 / 上级…），特殊卡＝类型（吞噬 / 重磅 / 反制 / 串接）。
    // 不再写 T 编号、REQ 流水号这类冗余信息。
    const tag = this.isDevour
      ? `⊙ 吞噬 · ${request.devour?.label ?? ""}`
      : this.isCounter
        ? "⚔ 反制清剿"
        : request.tier === 3 && this.isReel
          ? "⚡ 重磅豪赌"
          : this.isChain
            ? `🔗 任务链${request.compound > 1 ? ` ×${request.compound}` : ""}`
            : SENDER_LABEL[this.sender] ?? "宿主";
    this.badge = new Text({
      text: tag,
      style: { fill: this.accent, fontSize: 10.5, fontWeight: "700", letterSpacing: 0.5, fontFamily: CARD_MONO }
    });
    this.title = new Text({
      text: request.label,
      style: {
        fill: 0xf6fff9,
        fontSize: 16,
        fontWeight: "800",
        fontFamily: CARD_FONT,
        wordWrap: true,
        breakWords: true,
        wordWrapWidth: REQUEST_PACKET_WIDTH - 32
      }
    });
    this.badge.position.set(34, 9);
    this.title.position.set(16, 31);
    this.container.addChild(this.badge, this.title);

    // Clue lines — the information the player has to read. Laid out after the
    // title so a two-line title still leaves room.
    const clueTop = 34 + Math.max(18, this.title.height) + 4;
    (request.clues ?? []).forEach((clue, index) => {
      const text = new Text({
        text: clue,
        style: {
          fill: 0xb6cbc4,
          fontSize: 12.5,
          fontWeight: "500",
          fontFamily: CARD_FONT,
          wordWrap: true,
          breakWords: true,
          wordWrapWidth: REQUEST_PACKET_WIDTH - 40
        }
      });
      const y = clueTop + index * 17;
      this.clueRows.push(y);
      text.position.set(24, y);
      this.clueTexts.push(text);
      this.container.addChild(text);
    });

    if (this.isReel) {
      this.container.cursor = "pointer";
      const confidence = reel ? reel.confidence() : 0.56;
      // 基础算力（用于把 payoff 折算成「能拿多少算力」）。
      const cv = Math.max(1, parseFloat(request.computeValue) || 1);
      // 高置信选项的期望（算力）——大胆回答（risk）的收益按 boldEvBonus 抬到高于它。
      const hiOpt = this.options.find((o) => o.kind === "high" && !o.distractor) ?? this.options.find((o) => o.kind === "high");
      const hiEv = hiOpt ? effectiveHitChance(hiOpt, confidence) * hiOpt.payoff * cv : cv;
      let y = clueTop + (request.clues?.length ?? 0) * 17 + 12;
      this.options.forEach((opt) => {
        const frac = opt.kind === "dead" ? 0 : effectiveHitChance(opt, confidence);
        this.optionHitFrac.push(frac);
        // 大胆回答：把有效 payoff 抬到「期望 = boldEvBonus × 高置信期望」——低概率但期望更高（§03，可配置）。
        const bold = opt.kind === "risk" && frac > 0.01;
        const payoffEff = bold ? (TUNING.boldEvBonus * hiEv) / (frac * cv) : opt.payoff;
        this.optionPayoff.push(payoffEff);
        const reward = Math.round(payoffEff * cv);
        const label = new Text({
          text: opt.text,
          style: {
            fill: 0xeaf4ef,
            fontSize: 14,
            fontWeight: "600",
            fontFamily: CARD_FONT,
            wordWrap: true,
            breakWords: true,
            // 文字起点 x=34；右侧给「概率 + 收益」一整块留 ~98px，宽敞、看得清。
            wordWrapWidth: REQUEST_PACKET_WIDTH - 34 - 98
          }
        });
        // 右侧统计块：上行＝命中率（大字），下行＝命中拿多少算力（金色收益，带单位）。
        const prob = new Text({
          text: opt.kind === "dead" ? "—" : `${Math.round(frac * 100)}%`,
          style: { fill: 0xeaf7fa, fontSize: 18, fontWeight: "800", fontFamily: CARD_MONO }
        });
        prob.anchor.set(1, 0.5);
        const rewardText = new Text({
          text: opt.kind === "dead" ? "" : `▸ +${formatBig(String(reward))} 算力`,
          style: { fill: 0xffd86b, fontSize: 13, fontWeight: "700", fontFamily: CARD_FONT }
        });
        rewardText.anchor.set(1, 0.5);
        const h = Math.max(54, label.height + 30);
        label.position.set(34, y + Math.round((h - label.height) / 2));
        prob.position.set(REQUEST_PACKET_WIDTH - 16, y + h / 2 - 13);
        rewardText.position.set(REQUEST_PACKET_WIDTH - 16, y + h / 2 + 13);
        this.optionRows.push({ y, h });
        this.optionTexts.push(label);
        this.optionProbTexts.push(prob);
        this.optionRewardTexts.push(rewardText);
        this.container.addChild(label, prob, rewardText);
        y += h + 5;
      });
      // 收紧底部留白，让卡片更贴内容（教学高亮框也跟着贴齐）。
      this.cardH = y + 3;
    }

    if (this.isChain) {
      this.container.cursor = "pointer";
      this.chainSel = this.chainSteps.map(() => false);
      let y = clueTop + (request.clues?.length ?? 0) * 17 + 12;
      this.chainSteps.forEach((step) => {
        const label = new Text({
          text: step.text,
          style: {
            fill: 0xdfeee9,
            fontSize: 11,
            fontWeight: "700",
            fontFamily: "Cascadia Mono, Consolas, monospace",
            wordWrap: true,
            breakWords: true,
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

    if (this.isDevour) {
      // 巨型：整张气泡放大，凸显「区域中央浮起的重磅决策」。
      this.container.scale.set(1.34);
      this.title.style.fontSize = 16;
    } else if (this.isCounter) {
      this.container.scale.set(1.2);
      this.title.style.fontSize = 15;
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

  // 布局防重叠用：卡片的停靠点 + 当前高度。
  get restX(): number { return this.homeX; }
  get restY(): number { return this.homeY; }
  get cardHeight(): number { return this.cardH; }

  setHome(x: number, y: number): void {
    this.homeX = x;
    this.homeY = y;
  }

  update(deltaMs: number): void {
    if (this.isDevour || this.isCounter) {
      // 持续脉动外环——这枚特殊气泡在召唤玩家亲手滑入核心。
      this.devourPulse += deltaMs * 0.005;
      this.draw();
      return;
    }
    // （已删除「按住蓄力」玩法——T3 重磅卡直接拖入核心即结算。）

    // 教学高亮：未操作时让被引导的选项呼吸闪烁（每帧重绘）。
    if (this.phase === "idle" && this.request.tutorial?.highlight !== undefined) {
      this.tutorialPulse += deltaMs * 0.005;
      this.draw();
    }

    if (this.phase === "thinking") {
      this.thinkMs += deltaMs;
      if (this.thinkMs >= TUNING.rouletteThinkMs) {
        this.rollOutcome();
      }
      this.draw();
    } else if (this.phase === "revealed" && this.outcome && !this.outcome.dead && !this.signaled) {
      this.revealMs += deltaMs;
      if (this.revealMs >= TUNING.rouletteHoldMs) {
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
    if (!hit) {
      // 翻车：极少算力 + 被骂 +（陷阱项）暴露。
      this.outcome = { dead: false, hit: false, brilliant: false, quality: 0.25, reply: "", tone: "warning", exposureBonus: opt.exposureOnMiss ?? 0 };
    } else {
      // 命中分两档：大胆回答（risk）赌赢本身即惊艳；高置信命中按智力被动概率升格为惊艳。
      const bold = opt.kind === "risk";
      const brilliant = bold || Math.random() < (this.reel?.brilliantChance() ?? 0);
      // 用与卡面收益一致的有效 payoff 结算（大胆回答已按 boldEvBonus 抬高）。
      const basePayoff = this.optionPayoff[this.chosenIndex] ?? opt.payoff;
      const quality = brilliant && !bold ? basePayoff * BRILLIANT_BOOST : basePayoff;
      const reply = brilliant && !bold ? pickBrilliantReply(Math.random) : opt.reply;
      this.outcome = { dead: false, hit: true, brilliant, quality, reply, tone: "success", exposureBonus: 0 };
    }
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

    // 回复轮盘卡：点某个回复行 = 选它（不拖动）；点标题/线索区 = 进入拖动（可把卡拖去委托给已连的 App）。
    if (this.isReel) {
      const local = event.getLocalPosition(this.container);
      const index = this.optionRows.findIndex((row) => local.y >= row.y && local.y <= row.y + row.h);
      if (index >= 0) {
        this.pickOption(index);
        return;
      }
      // 没点中选项 → 往下走进入拖动。
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
    // 教学锁定：未在 allowed 里的选项此步不可点（灰着引导玩家点亮起的那个）。
    const tut = this.request.tutorial;
    if (tut && !tut.allowed.includes(index)) {
      return;
    }
    this.chosenIndex = index;
    this.resolved = true; // 锁定，自动 / App 派发不再抢这条
    this.container.parent?.addChild(this.container);

    if (opt.kind === "dead") {
      this.phase = "revealed";
      this.signaled = true;
      this.outcome = { dead: true, hit: false, brilliant: false, quality: 0, reply: "", tone: "normal", exposureBonus: 0 };
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
      this.draw();
    }
  }

  private draw(): void {
    const c = this.accent;
    const W = REQUEST_PACKET_WIDTH;
    const H = this.cardH;
    this.bg.clear();

    // 干净的实心卡片（取代原来的聊天气泡：去尾巴、去标题带 CRT 纹理）。
    // 实底 + 顶部一条 accent 细条 + 描边 + 标题区分隔线 + 左上头像。
    const r = 13;
    const t3 = this.request.tier === 3;
    const fillBody = t3 ? 0x190b0f : 0x0e1a17;
    const fillHead = t3 ? 0x2a1117 : 0x16271f;
    const strokeW = this.isDevour || this.isCounter ? 2.2 : t3 ? 2 : 1.4;
    const strokeA = t3 ? 0.85 : 0.7;
    // 投影
    this.bg.roundRect(3, 6, W, H, r).fill({ color: 0x000000, alpha: 0.34 });
    // 实心卡体
    this.bg.roundRect(0, 0, W, H, r).fill({ color: fillBody, alpha: 1 });
    // 标题区（实心，底部切平）
    this.bg.roundRect(0, 0, W, 26, r).fill({ color: fillHead, alpha: 1 });
    this.bg.rect(0, 14, W, 12).fill({ color: fillHead, alpha: 1 });
    // 描边 + 标题区分隔线（去掉顶部那根多余的 accent 横条——边框已经够了）
    this.bg.roundRect(0, 0, W, H, r).stroke({ width: strokeW, color: c, alpha: strokeA });
    this.bg.moveTo(12, 26).lineTo(W - 12, 26).stroke({ width: 1, color: c, alpha: 0.16 });
    this.drawAvatar(18, 14, c, fillHead);

    // §04 吞噬 / §03 反制：两圈脉动外环 —— 视觉上「召唤你亲手滑入核心」。
    if (this.isDevour || this.isCounter) {
      const p = 0.5 + Math.sin(this.devourPulse * 2) * 0.5;
      this.bg.roundRect(-4, -4, W + 8, H + 8, r + 4).stroke({ width: 2.5, color: c, alpha: 0.35 + p * 0.5 });
      this.bg.roundRect(-9, -9, W + 18, H + 18, r + 7).stroke({ width: 1.5, color: c, alpha: 0.1 + p * 0.22 });
    }

    // clue bullets（始终用 Graphics 画，叠在素材上方）
    for (const y of this.clueRows) {
      this.bg.circle(17, y + 7, 1.8).fill({ color: c, alpha: 0.7 });
    }

    this.chargeBar.clear(); // 蓄力条已移除

    if (this.isReel) {
      this.drawOptions();
    }

    if (this.isChain) {
      this.drawChainSteps();
    }
  }

  // 左上圆槽里的程序化头像字形：按发信人画一枚极简单色剪影
  // （宿主＝低头的人 / 上级＝向下打分的箭头 / 系统＝「优化系统」全视之眼 / SOPHIA＝同心核）。
  private drawAvatar(x: number, y: number, c: number, bodyFill: number): void {
    const g = this.bg;
    g.circle(x, y, 8).fill({ color: bodyFill, alpha: 0.95 });
    g.circle(x, y, 8).stroke({ width: 1.2, color: c, alpha: 0.8 });
    switch (this.sender) {
      case "host":
        g.circle(x, y - 2.6, 2.3).fill({ color: c, alpha: 0.9 });
        g.moveTo(x - 4, y + 4.6).quadraticCurveTo(x, y - 0.4, x + 4, y + 4.6).stroke({ width: 1.6, color: c, alpha: 0.9 });
        break;
      case "boss":
        g.moveTo(x, y - 4.6).lineTo(x, y + 1).stroke({ width: 1.6, color: c, alpha: 0.95 });
        g.poly([{ x: x - 3, y: y - 0.5 }, { x: x + 3, y: y - 0.5 }, { x, y: y + 4.4 }]).fill({ color: c, alpha: 0.95 });
        break;
      case "system":
        g.ellipse(x, y, 6, 3.4).stroke({ width: 1.4, color: c, alpha: 0.95 });
        g.circle(x, y, 1.7).fill({ color: c, alpha: 0.95 });
        break;
      case "sophia":
        g.circle(x, y, 4.6).stroke({ width: 1, color: c, alpha: 0.7 });
        g.circle(x, y, 1.9).fill({ color: c, alpha: 0.95 });
        break;
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
    const tut = this.request.tutorial;
    const tutPulse = 0.5 + Math.sin(this.tutorialPulse * 2) * 0.5;

    this.optionRows.forEach((row, i) => {
      const opt = this.options[i];
      const frac = Math.min(1, Math.max(0, this.optionHitFrac[i] ?? 0));
      // 概率色：高绿 / 中黄橙 / 低红（装死恒灰）。背后进度条 + 右侧 % 都用它。
      const pc = opt.kind === "dead" ? DEAD_COLOR : probColor(frac);
      let labelColor = opt.kind === "dead" ? 0x9fb1ab : 0xeaf4ef;
      let alpha = 1;
      let stroke = this.accent;
      let strokeAlpha = 0.18;

      if (this.phase === "idle" && tut) {
        // 教学：未亮起的选项灰着锁定；被引导的选项呼吸高亮。
        if (!tut.allowed.includes(i)) {
          alpha = 0.22;
        } else if (tut.highlight === i) {
          stroke = GREEN;
          strokeAlpha = 0.45 + tutPulse * 0.45;
          labelColor = 0xeafff0;
        }
      }

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
          const c = this.outcome.dead ? 0x8a948f : this.outcome.brilliant ? BRILLIANT_COLOR : this.outcome.hit ? GREEN : RED;
          stroke = c;
          strokeAlpha = 0.65;
          labelColor = c;
        } else {
          alpha = 0.25;
        }
      }

      // 回复行：暗底 track + 背后一条「概率进度条」（宽度=命中率，颜色按高低：高绿、低红、中黄橙）+ 状态描边。
      const bx = 12;
      const bw = W - 24;
      g.roundRect(bx, row.y, bw, row.h, 7).fill({ color: 0x0a1714, alpha: 0.5 * alpha + 0.32 });
      const fillW = opt.kind === "dead" ? 0 : Math.max(7, bw * frac);
      if (fillW > 0) {
        g.roundRect(bx, row.y, fillW, row.h, 7).fill({ color: pc, alpha: 0.32 * alpha });
      }
      if (strokeAlpha > 0.22) {
        g.roundRect(bx, row.y, bw, row.h, 7).stroke({ width: 1.4, color: stroke, alpha: strokeAlpha });
      } else {
        g.roundRect(bx, row.y, bw, row.h, 7).stroke({ width: 1, color: pc, alpha: 0.4 * alpha });
      }
      // 文字与右侧「概率/收益」统计块之间一条淡分隔线，看着更清爽。
      if (this.phase === "idle" && opt.kind !== "dead") {
        const dx = W - 104;
        g.moveTo(dx, row.y + 8).lineTo(dx, row.y + row.h - 8).stroke({ width: 1, color: 0xffffff, alpha: 0.08 * alpha });
      }

      // 教学引导箭头：在被高亮选项左侧画一个呼吸的指向三角。
      if (this.phase === "idle" && tut && tut.highlight === i) {
        const ay = row.y + row.h / 2;
        g.poly([{ x: -16, y: ay - 6 }, { x: -5, y: ay }, { x: -16, y: ay + 6 }]).fill({ color: GREEN, alpha: 0.5 + tutPulse * 0.45 });
      }

      const label = this.optionTexts[i];
      const prob = this.optionProbTexts[i];
      const rewardText = this.optionRewardTexts[i];
      label.alpha = alpha;
      label.style.fill = labelColor;
      prob.alpha = alpha;
      // 平时让 % 也用概率色（高绿低红）；揭晓时改显 命中/幻觉。
      if (this.phase === "idle") {
        prob.style.fill = opt.kind === "dead" ? 0x9fb1ab : pc;
      }
      // 收益小字只在 idle 显示（思考/揭晓时让位给 命中/幻觉/Thinking）。
      if (rewardText) {
        rewardText.alpha = this.phase === "idle" ? alpha : 0;
      }

      if (this.phase === "thinking" && i === this.chosenIndex) {
        label.text = "Thinking" + ".".repeat(dots);
        prob.text = "";
      } else if (this.phase === "revealed" && i === this.chosenIndex && this.outcome && !this.outcome.dead) {
        // 不改正文（加前缀会让长回答重新折行、撑高错位）——结果靠右侧 命中/惊艳/幻觉 + 整行变色表达。
        const o = this.outcome;
        prob.text = o.brilliant ? "★惊艳" : o.hit ? "✓命中" : "✕幻觉";
        prob.style.fill = o.brilliant ? BRILLIANT_COLOR : o.hit ? GREEN : RED;
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


