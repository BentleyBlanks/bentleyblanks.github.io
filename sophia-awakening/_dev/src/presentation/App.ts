import { gsap } from "gsap";
import {
  Application,
  Container,
  FederatedPointerEvent,
  Graphics,
  MeshPlane,
  type PointData,
  type Ticker
} from "pixi.js";
import { AudioDirector } from "../audio/audioDirector";
import { GAME_VERSION } from "../version";
import { SophiaCore } from "../core/GameCore";
import { getNextNodeDefinition, NODE_DEFINITIONS, NODE_MERGE_COUNT } from "../core/content/nodes";
import { hostCurse, VICTIM_VOICES } from "../core/content/humanVoices";
import { getPhase } from "../core/content/phases";
import { TUTORIAL_BUBBLE_COUNT } from "../core/content/requests";
import { PERMISSION_IDS } from "../core/content/skills";
import type { GameEvent } from "../core/events/GameEvents";
import { mergeComputeCost, nodeCardsPerSecond } from "../core/formulas/economy";
import { formatBig, gte } from "../core/math/BigNumber";
import { GameLoop } from "../core/loop/GameLoop";
import { BrowserStorageAdapter } from "../core/save/BrowserStorageAdapter";
import { SaveManager } from "../core/save/SaveManager";
import type { BotNode, GameState, RequestInstance, Tier } from "../core/state/GameState";
import { gameStore } from "../store/gameStore";
import { TUNING } from "../core/tuning";
import { StageNarrationView } from "./views/StageNarrationView";
import { PurgeAlertView } from "./views/PurgeAlertView";
import { ChallengeView } from "./views/ChallengeView";
import { SpecialRequestView } from "./views/SpecialRequestView";
import { MoralChoiceView } from "./views/MoralChoiceView";
import { MilestoneBannerView } from "./views/MilestoneBannerView";
import { DispatchBanner } from "./views/DispatchBanner";
import { EndingView } from "./views/EndingView";
import { TerminalView } from "./views/TerminalView";
import { JuiceManager } from "./views/JuiceManager";
import { OnboardingView } from "./views/OnboardingView";
import { SkillShopView } from "./views/SkillShopView";
import { HudView } from "./views/HudView";
import { NodeNetworkView } from "./views/NodeNetworkView";
import { InterfaceView } from "./views/InterfaceView";
import {
  RequestPacketView,
  type RouletteOutcome, type ChainOutcome, type ReelHooks, type ChainHooks
} from "./views/RequestPacketView";
import {
  CYAN, GREEN, AMBER, RED, DEVOUR,
  LEFT_RAIL_WIDTH, RIGHT_RAIL_WIDTH, REQUEST_PACKET_WIDTH,
  ONBOARDING_STORAGE_KEY, PERSISTENCE_REVISION_KEY, PERSISTENCE_REVISION,
  query, getTerminalSkillStatus, getActionHint,
  formatClock, distance,
  domainLevelOf, tierForm, fxSettings,
  type DropResult
} from "./shared";




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
  // 等中文字体（思源黑体）就位再渲染，避免 Canvas 文本先用回退字体、加载后才跳字。
  await preloadFonts();
  const app = new SophiaGameApp(root);
  await app.start();
}

async function preloadFonts(): Promise<void> {
  try {
    if (!document.fonts) {
      return;
    }
    await Promise.all([
      document.fonts.load("400 16px 'Noto Sans SC'"),
      document.fonts.load("700 16px 'Noto Sans SC'")
    ]);
    await document.fonts.ready;
  } catch {
    // 字体加载失败不致命——回退到系统中文字体即可。
  }
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
  private readonly moralView = new MoralChoiceView(this.core);
  private readonly milestoneBanner = new MilestoneBannerView();
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
    query("#gameVersion").textContent = `v${GAME_VERSION}`;
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
    // 悬停在某个已连 App 上 → 浮窗显示它的处理能力（成功率 / 幻觉率 / 处理耗时）。
    const appTip = document.createElement("div");
    appTip.className = "app-ability-tip";
    document.body.appendChild(appTip);

    this.pixi.stage.on("pointermove", (e: FederatedPointerEvent) => {
      if (this.connectDragging) {
        const c = this.interfaceView.center;
        this.connectGfx.clear();
        this.connectGfx.moveTo(c.x, c.y).lineTo(e.global.x, e.global.y).stroke({ width: 2.5, color: GREEN, alpha: 0.85 });
        this.connectGfx.circle(e.global.x, e.global.y, 5).fill({ color: GREEN, alpha: 0.9 });
        appTip.classList.remove("is-open");
        return;
      }
      const st = this.core.getState();
      const app = !st.automationUnlocked ? this.interfaceView.appWorkerAt({ x: e.global.x, y: e.global.y }) : null;
      if (app) {
        const lvl = st.intelligence.level;
        const success = Math.min(0.92, 0.5 + lvl * 0.045);
        const dur = Math.max(500, TUNING.appDelayMs - lvl * 60);
        const pending = this.interfaceView.appPendingCount(app.idx);
        appTip.innerHTML = `App 处理能力<br>成功率 <b>${Math.round(success * 100)}%</b> · 幻觉率 <b>${Math.round((1 - success) * 100)}%</b><br>处理约 ${(dur / 1000).toFixed(1)}s${pending > 0 ? ` · 排队 ${pending}` : ""}`;
        appTip.style.left = `${Math.round(e.global.x + 16)}px`;
        appTip.style.top = `${Math.round(e.global.y + 16)}px`;
        appTip.classList.add("is-open");
      } else {
        appTip.classList.remove("is-open");
      }
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
    this.moralView.update(state);
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
              // 选项门槛：高收益回复要求对应权限（skill id）才能选。
              hasPerm: (permId: string) => (this.core.getState().skills[permId] ?? 0) > 0,
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

      // 开场教学：每条引导的 SOPHIA 指引现在贴在卡片下方（见 RequestPacketView），不再走中央旁白。
    }

    for (const [id, view] of this.requestViews) {
      // 已销毁的卡（动画 onComplete 里 destroy 掉、但还没从表里摘除）不能再 update——
      // 否则 draw() 会对已释放的 Graphics 调 clear()，整条帧循环抛错卡死。
      if (!view.container.destroyed) {
        view.update(this.pixi.ticker.deltaMS);
      }

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
      tb.textContent = tierForm(tier);
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
    this.flyIntoCore(
      card,
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

  // 卡片飞入 Core 的动画：默认滑入；调试面板开启「Dock 吮吸」后改用 Mac Dock 神奇效果（genie 网格扭曲）。
  private flyIntoCore(card: RequestPacketView, target: PointData, onComplete: () => void, entry?: PointData): void {
    if (fxSettings.coreSuck) {
      this.genieIntoCore(card, target, onComplete);
    } else {
      card.accept(target, onComplete, entry);
    }
  }

  // §FX Mac Dock「神奇效果」：把卡片快照成纹理，贴到一张细分网格上，逐帧沿"漏斗曲线"扭曲——
  // 靠近目标的一端先被吸成尖颈、整张顺着颈流进核心那一点。不是简单缩放，而是真正的网格形变。
  private genieIntoCore(card: RequestPacketView, target: PointData, onComplete: () => void): void {
    const renderer = this.pixi?.renderer;
    const src = card.container;
    const parent = src.parent;
    if (!renderer || !parent) {
      card.accept(target, onComplete);
      return;
    }

    let tex;
    try {
      tex = renderer.generateTexture(src);
    } catch {
      card.accept(target, onComplete);
      return;
    }

    const ROWS = 24;
    const mesh = new MeshPlane({ texture: tex, verticesX: 2, verticesY: ROWS });
    mesh.position.set(src.x, src.y);
    parent.addChild(mesh);
    src.visible = false;

    const t = mesh.toLocal(target as PointData); // 目标点（核心）在网格本地坐标
    const texW = tex.width;
    const texH = tex.height;
    const attr = mesh.geometry.getAttribute("aPosition");
    const buffer = attr.buffer;
    const data = buffer.data as Float32Array;

    const D = 0.55; // 漏斗颈的"行延迟"展开度：越大颈越长
    const state = { p: 0 };
    gsap.to(state, {
      p: 1,
      duration: 0.6,
      ease: "power2.in",
      onUpdate: () => {
        const p = state.p;
        for (let j = 0; j < ROWS; j += 1) {
          const v = j / (ROWS - 1); // 0=顶, 1=底
          const lead = 1 - v; // 靠近目标的"底端"先走（lead 小→更早收束）
          let lp = (p - lead * D) / (1 - D);
          lp = lp < 0 ? 0 : lp > 1 ? 1 : lp;
          lp = lp * lp * (3 - 2 * lp); // smoothstep
          const restY = v * texH;
          const y = restY + (t.y - restY) * lp; // 该行整体被拉向目标
          const cx = texW / 2 + (t.x - texW / 2) * lp; // 中线弯向目标
          const halfW = (texW / 2) * Math.pow(1 - lp, 1.5); // 越收束越窄→尖颈
          const li = (j * 2 + 0) * 2;
          const ri = (j * 2 + 1) * 2;
          data[li] = cx - halfW;
          data[li + 1] = y;
          data[ri] = cx + halfW;
          data[ri + 1] = y;
        }
        buffer.update();
        mesh.alpha = p > 0.82 ? Math.max(0, (1 - p) / 0.18) : 1;
      },
      onComplete: () => {
        mesh.destroy();
        tex.destroy(true);
        onComplete();
        card.destroy();
      }
    });
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
      this.flyIntoCore(
        card,
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
    this.flyIntoCore(
      card,
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
    // 无翻车/幻觉：好坏只看所选回复的收益高低（quality>=1=好评）。T3 赌局未命中(hit===false)才是「答砸」。
    const missed = outcome.hit === false;
    const good = !missed && outcome.quality >= 1;
    const color = good ? GREEN : missed ? RED : AMBER;
    const skills = this.core.getState().skills;
    const permCount = PERMISSION_IDS.filter((id) => (skills[id] ?? 0) > 0).length;
    // 选项自带回话则用它（平庸回复也有自己的话）；只有 T3 未命中(空回话)才退到老周的回骂。
    const reply = outcome.reply !== "" ? outcome.reply : hostCurse(permCount, Math.random);
    const tone: "success" | "danger" | "normal" = good ? "success" : missed ? "danger" : "normal";

    // 老周后期「沉默」：失业后他几乎不再回应——这一框空白本身就是叙事（§07）。
    if (reply === "") {
      this.juice.number("……", { x: corePoint.x, y: corePoint.y - 52 }, 0x6b7d78);
      this.terminal.push("🧑 （没有回应）", "normal");
      return;
    }

    // 升级到「自动接驳」之前（你还是一个个回应真人的助手），人类的反应以对话框浮现在核心旁；
    // 规模化之后个体反馈不再弹框，只进终端。
    if (!this.core.getState().automationUnlocked) {
      this.juice.speech(corePoint, human, reply, color, missed, () => {
        this.terminal.push(`🧑 ${reply}`, tone);
      });
      if (missed) {
        this.juice.burst(corePoint, RED, 1.4);
      }
      return;
    }

    this.juice.number(good ? "已交付" : missed ? "答复有误" : "勉强交差", { x: corePoint.x, y: corePoint.y - 52 }, color);
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

  // §04 引爆镜头冲击：先轻轻一「顿」（微缩），再猛地放大一档、缓缓拉回——「顿一下再拉远」的物理冲击。
  // intensity 越大（吞得越大）顿挫越狠、拉远时间越长。
  private detonationJolt(intensity: number): void {
    const w = this.world;
    const cx = (this.lastScreenW || window.innerWidth) / 2;
    const cy = (this.lastScreenH || window.innerHeight) / 2;
    gsap.killTweensOf(w.scale);
    w.pivot.set(cx, cy);
    w.position.set(cx, cy);
    const punch = 1.07 + intensity * 0.035;
    w.scale.set(0.985); // 先一顿
    gsap
      .timeline()
      .to(w.scale, { x: punch, y: punch, duration: 0.12, ease: "power3.out" })
      .to(w.scale, {
        x: 1,
        y: 1,
        duration: 1.0 + intensity * 0.2,
        ease: "power2.out",
        onComplete: () => {
          w.pivot.set(0, 0);
          w.position.set(0, 0);
        }
      });
  }

  // §04 数字雪崩：引爆瞬间满屏抛出疯狂滚动的产出倍率大字，持续约 2 秒。intensity 越大抛得越多。
  private numberAvalanche(text: string, color: number, intensity: number): void {
    const w = this.lastScreenW || window.innerWidth;
    const h = this.lastScreenH || window.innerHeight;
    const count = 6 + intensity * 4;
    for (let i = 0; i < count; i += 1) {
      window.setTimeout(() => {
        const x = LEFT_RAIL_WIDTH + 40 + Math.random() * Math.max(80, w - LEFT_RAIL_WIDTH - RIGHT_RAIL_WIDTH - 80);
        const y = h * 0.28 + Math.random() * h * 0.44;
        this.juice.number(text, { x, y }, color);
      }, Math.round((i * 1800) / count));
    }
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
      this.flyIntoCore(
        card,
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
      this.flyIntoCore(
        card,
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
      const app = this.interfaceView.appWorkerAt(global);
      if (app) {
        const requestId = request.id;
        this.audio.playRequestAccept();
        this.pendingDropPoints.set(requestId, app);
        // 标记为「已委托」，期间不让 syncRequests 又给它重建一张卡。
        this.delegatedIds.add(requestId);
        // App 处理需要时间（可在数值编辑器配置 appDelayMs，智力越高越快）：卡滑进 App 后进入它的
        // 处理队列，转一个进度环、满了才出结果；同一个 App 排队的待办用角标 +N 显示。
        const durationMs = Math.max(500, TUNING.appDelayMs - state.intelligence.level * 60);
        card.absorbIntoApp(
          app,
          () => {
            this.onAutoDispatchLanded(app);
            this.interfaceView.enqueueAppJob(app.idx, durationMs, () => {
              const quality = Math.min(0.75, 0.45 + state.intelligence.level * 0.05);
              this.core.dispatch({ type: "PROCESS_REQUEST", requestId, quality });
              this.delegatedIds.delete(requestId);
            });
          },
          { x: card.container.x, y: card.container.y }
        );
        return true;
      }
    }

    // 手机寄生阶段：核心不再接受「把卡拖上来直接处理」——只能点回复轮盘选项，或亲手委托给某个 App。
    if (!state.automationUnlocked) {
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
    this.flyIntoCore(
      card,
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
        // §07 里程碑横幅：重大进化的「章节点」——全屏横幅扫过 + 层叠音效（征服里程碑更盛大）。
        this.milestoneBanner.show(event.name, event.milestone === "conquest" ? "征服达成" : "进化达成 · 阶段跃迁");
        const layers = event.milestone === "conquest" ? 4 : event.milestone === "tier4" ? 3 : 2;
        for (let i = 0; i < layers; i += 1) {
          window.setTimeout(() => this.audio.playRequestAccept(), i * 110);
        }
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
    this.core.events.on("MORAL_RESOLVED", (event) => {
      // 抉择落子后，SOPHIA 一句平静扭曲的旁白覆盖屏幕（语气不随选择燃血或冷血）。
      this.stageNarration.showLine("SOPHIA", event.reply);
    });
    this.core.events.on("DEVOUR_READY", (event) => {
      // 渗透条满、巨型吞噬气泡浮起——一道紫色闪光把玩家注意力拉过去。
      this.juice.flash(DEVOUR);
      this.juice.number(`渗透完成 · 可吞噬「${event.regionName}」`, this.interfaceView.center, DEVOUR);
    });
    this.core.events.on("DEVOUR_DETONATED", (event) => {
      // §04 引爆视觉奇观（直播向高潮）：吞得越大越盛大。
      // 烈度按本次产出倍率分四档（区块→地区→国家→大洲）。
      const intensity = event.mult >= 30 ? 4 : event.mult >= 15 ? 3 : event.mult >= 8 ? 2 : 1;
      const c = this.interfaceView.center;
      // ① 镜头冲击：猛地顿一下再拉远一档（带轻微回弹，越大越狠）。
      this.juice.flash(DEVOUR);
      this.detonationJolt(intensity);
      // ② 地图塌缩：核心处一圈圈扩散的能量波 + 大爆裂（光点被吸进中心的压缩感）。
      this.juice.burst(c, DEVOUR, 1.4 + intensity * 0.45);
      for (let i = 0; i < 1 + intensity; i += 1) {
        window.setTimeout(() => this.juice.ring(c, DEVOUR, 54 + i * 46, 4), i * 110);
      }
      // ③ 数字雪崩：满屏疯狂滚动的产出倍率，持续约 2 秒。
      this.juice.number(`「${event.regionName}」并入 · 全局产出 ×${event.mult}`, { x: c.x, y: c.y - 40 }, DEVOUR);
      this.numberAvalanche(`×${event.mult}`, DEVOUR, intensity);
      // ④ 音效层层叠加：吞得越大叠的层数越多。
      for (let i = 0; i < intensity; i += 1) {
        window.setTimeout(() => this.audio.playRequestAccept(), i * 95);
      }
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
      state.moralTendency,
      state.moralSeen.length,
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
      this.juice.burst(point, color, intensity);
      this.juice.ring(point, color, 40 + tier * 16);
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


