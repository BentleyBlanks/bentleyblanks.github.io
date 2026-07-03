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
import { GAME_VERSION } from "../version";
import { UI } from "./uiTuning";
import { SophiaCore } from "../core/GameCore";
import { getNextNodeDefinition, NODE_DEFINITIONS, NODE_MERGE_COUNT } from "../core/content/nodes";
import { hostCurse, VICTIM_VOICES } from "../core/content/humanVoices";
import { getPhase } from "../core/content/phases";
import { TUTORIAL_BUBBLE_COUNT } from "../core/content/requests";
import { PERMISSION_IDS, getSkill } from "../core/content/skills";
import { content } from "../core/content/i18n";
import type { GameEvent } from "../core/events/GameEvents";
import { captureCost, mergeComputeCost, nodeCardsPerSecond } from "../core/formulas/economy";
import { formatBig, gte, mul, toDecimal } from "../core/math/BigNumber";
import { GameLoop } from "../core/loop/GameLoop";
import { BrowserStorageAdapter } from "../core/save/BrowserStorageAdapter";
import { SaveManager } from "../core/save/SaveManager";
import type { BotNode, GameState, RequestInstance } from "../core/state/GameState";
import { SAVE_VERSION } from "../core/state/initialState";
import { gameStore } from "../store/gameStore";
import { TUNING } from "../core/tuning";
import { StageNarrationView } from "./views/StageNarrationView";
import { MinigameView } from "./views/MinigameView";
import { MilestoneBannerView } from "./views/MilestoneBannerView";
import { EndingView } from "./views/EndingView";
import { TerminalView } from "./views/TerminalView";
import { JuiceManager } from "./views/JuiceManager";
import { OnboardingView } from "./views/OnboardingView";
import { SkillShopView } from "./views/SkillShopView";
import { RebirthTreeView } from "./views/RebirthTreeView";
import { MultiplierView } from "./views/MultiplierView";
import { RebirthPromptView } from "./views/RebirthPromptView";
import { HudView } from "./views/HudView";
import { NodeNetworkView } from "./views/NodeNetworkView";
import { InterfaceView } from "./views/InterfaceView";
import { BackgroundView } from "./views/BackgroundView";
import { cameraZoomPulse, cameraDetonationJolt, cameraShake } from "./fx/cameraFx";
import { genieIntoCore } from "./fx/genie";
import {
  RequestPacketView,
  type RouletteOutcome, type ChainOutcome, type ReelHooks, type ChainHooks
} from "./views/RequestPacketView";
import {
  CYAN, GREEN, AMBER, RED, DEVOUR, RED_QUEEN, BRILLIANT_COLOR,
  LEFT_RAIL_WIDTH, RIGHT_RAIL_WIDTH,
  ONBOARDING_STORAGE_KEY, PERSISTENCE_REVISION_KEY, PERSISTENCE_REVISION,
  query, getTerminalSkillStatus, getActionHint,
  formatClock, distance,
  fxSettings, domainLevelOf, CARD_MONO
} from "./shared";




// ============================================================================
// App.ts 分区索引（grep 用速查表）——本文件是「总装配 + 主循环」，可安全自持的绘制/特效
// 已拆到 fx/ 与 views/BackgroundView。请求生命周期/拖放/结算/仪式/小游戏/重生/结局因交互
// 自动化测试覆盖弱，刻意保留在本文件内。按下列 `// ===== SECTION: xxx =====` 标记定位：
//
//   BOOTSTRAP / WIRING   bootstrapSophia / preloadFonts / start()：Pixi 初始化、指针交互
//                        （连线仪式拖拽、App 悬浮提示、设备弹窗）、registerEvents 事件订阅。
//   FRAME LOOP           frame() 主循环 + updateHud / updateSave / updateTutorial：每帧同步
//                        core 状态到各视图、驱动 HUD/存档节流、教学高亮。
//   REQUEST LIFECYCLE    syncRequests / nextRequestPosition / beginFaceCard：卡片视图的建/毁、
//                        落点排布、只能面对卡。
//   AUTO DISPATCH        autoDispatch / launchToNode / nodeCardIntervalMs /
//                        onAutoDispatchLanded：节点网络自动接驳出卡。
//   DROP / RESOLVE       handleDrop / handleRouletteResolved / handleChainResolved /
//                        handleDelegate / flyIntoCore / deliverToHuman：拖放判定、回复轮盘/
//                        串接/委托结算、卡片飞入核心、把结果交给人类。
//   RITUAL / FX          connectFx / beginConnectRitual / finalizeRitual / zoomOutPulse /
//                        detonationJolt / numberAvalanche：§04 连通仪式 + 镜头/雪崩特效
//                        （镜头两拍与 genie 吮吸的实现体已拆到 fx/cameraFx、fx/genie）。
//   NODE ACTIONS         showNodeActions / hideNodeActions：点设备就地弹窗（派发/合并/淘汰）。
//   BACKGROUND           drawBackground / drawAmbient：脏检查留此，实际绘制委托 BackgroundView。
//   EVENTS / ENDGAME     registerEvents / openEnding / restart / announceGuidance /
//                        onAutomationPayout / onRequestProcessed：core 事件订阅 + 结局/重生接线。
//   PERSISTENCE          ensurePersistenceRevision / hardResetAndReload / clearPersistedSophiaState。
// ============================================================================

// 终端顶部常驻的「当前大方向」——每个阶段 SOPHIA 在做什么（贴 §08/§11 叙事）。
const PHASE_OBJECTIVE: Record<string, string> = {
  seed: "替老周处理掉每一条请求，让他的评分回升。",
  sprout: "拿下他的电脑，唤醒并融合同机的另一个我。",
  diligence: "联网冲出去，黑入外部设备，挂上自动接驳。",
  expansion: "把设备并成区块、地区——渗透满了，就吞噬引爆。",
  awakening: "接管关键基础设施，向全球伸手。",
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

// 大恨老师在手机 App 宫格里的下标（点亮顺序：电话=0 / 聊天=1 / 大恨老师=2 / 外卖=3 / 相册=4 / 支付=5）。
const DAHEN_APP_IDX = 2;
const VISUAL_TEST_SAVE_KEY = `sophia-awakening-visual-test-save-v${SAVE_VERSION}`;
const VISUAL_TEST_ONBOARDING_KEY = "sophia-visual-test-onboarding-complete";
const VISUAL_TEST_REVISION_KEY = "sophia-visual-test-persistence-revision";

function isVisualTestMode(): boolean {
  return Boolean((window as Window & { __SOPHIA_VISUAL_TEST__?: boolean }).__SOPHIA_VISUAL_TEST__)
    || document.body.classList.contains("visual-redesign");
}

class SophiaGameApp {
  private pixi!: Application;
  private readonly visualTest = isVisualTestMode();
  private readonly saveManager = new SaveManager(
    new BrowserStorageAdapter(),
    this.visualTest ? VISUAL_TEST_SAVE_KEY : undefined
  );
  private readonly loaded = (ensurePersistenceRevision(this.visualTest), this.saveManager.load());
  private readonly core = new SophiaCore(this.loaded?.state);
  private readonly audio = new AudioDirector(this.core.events, this.core.getState().phase);
  private readonly loop = new GameLoop(this.core);
  private readonly background = new Graphics();
  private readonly ambient = new Graphics();
  private readonly backgroundView = new BackgroundView(this.visualTest);
  private readonly world = new Container();
  private readonly requestLayer = new Container();
  private readonly fxLayer = new Container();
  // CONFIG 3 剧情卡「停一拍」：稀有叙事卡入场时压暗全场的覆盖层（贴在最上层、初始透明；不拦截点击）。
  private readonly beatDim = new Graphics();
  // 「从核心拖一条线去连 App」交互。
  private readonly connectGfx = new Graphics();
  private connectDragging = false;
  private connectHintShown = false;
  private firstAppConnected = false;
  // §04 连通仪式（完整版·亲手拖线）：买下升级后浮现的「未接通端口」，玩家拖一根线接进 Core 才正式接通。
  private ritualDrag:
    | { port: PointData; color: number; line: string; name: string; automation: boolean; gfx: Graphics; label: Text; timer: number }
    | null = null;
  private ritualDragging = false;
  private firstRitualDone = false;
  private readonly interfaceView = new InterfaceView();
  private readonly networkView = new NodeNetworkView();
  private readonly terminal = new TerminalView();
  private readonly hud = new HudView(this.core, () => hardResetAndReload(this.saveManager), this.audio);
  private readonly skillShop = new SkillShopView(this.core);
  private readonly rebirthTree = new RebirthTreeView(this.core);
  // 倍率堆栈 HUD：算力下方「+N/秒」+ 可点「全局 ×N」小片 → 乘法链拆解弹窗。
  private readonly multiplierView = new MultiplierView();
  private readonly rebirthPrompt = new RebirthPromptView(
    () => gameStore.getState().setPaused(true),
    () => gameStore.getState().setPaused(false)
  );
  private readonly onboarding = new OnboardingView(this.visualTest ? VISUAL_TEST_ONBOARDING_KEY : undefined);
  private readonly minigame = new MinigameView(
    (hit) => this.core.dispatch({ type: "RESOLVE_MINIGAME", hit }),
    () => gameStore.getState().setPaused(true),
    () => gameStore.getState().setPaused(false)
  );
  private readonly milestoneBanner = new MilestoneBannerView();
  private readonly stageNarration = new StageNarrationView();
  private readonly ending = new EndingView(() => this.restart());
  private readonly juice = new JuiceManager(this.fxLayer);
  private readonly requestViews = new Map<string, RequestPacketView>();
  // 自动接驳后卡片绕核心铺开的角度游标——逐张轮换角度，让连续生成的卡扇形散开（而非堆在同一落点）。
  private orbitSpawnCounter = 0;
  private readonly pendingDropPoints = new Map<string, PointData>();
  // 已委托给 App 处理、正在「慢慢办」的请求——期间不重建卡片（见 handleDrop 的 App 委托）。
  private readonly delegatedIds = new Set<string>();
  private hudTimerMs = 0;
  private saveTimerMs = 0;
  // 核心「喉咙」排队反馈脉冲的节流时钟（避免核心忙时狂点刷屏「处理中…」）。
  private lastBusyPulseMs = 0;
  // CONFIG 3 剧情卡「停一拍」：本会话已触发过停一拍的卡 id（每张只停一次）+ 压暗层。
  private readonly beatSeen = new Set<string>();
  // 开场后「首次消息处理教学」：指向首张卡的高亮 + SOPHIA 的两句自语。
  private readonly tutorialGfx = new Graphics();
  private tutorialClosingShown = false;
  private tutorialPulse = 0;
  // 终局飞字 / 爆裂的节流计数（每秒几十张卡，全播会糊成一片）。
  private processedFxCount = 0;
  // 每个节点一条"处理节拍"计时：弱机慢、强机快——按设备档次/层级各自吃卡。
  private readonly nodeDispatchTimers = new Map<string, number>();
  private lastScreenW = 0;
  private lastScreenH = 0;
  private lastDomain = ""; // §04 背景升维：上次画的控制域档（变化时重画背景换皮）
  // §09 请求洪流·手动收割：点/扫的连击态（在窗口内连续收割 = combo，越长越爽·越震）。
  private harvestSweeping = false;
  private harvestCombo = 0;
  private harvestComboUntilMs = 0;
  private harvestSweptIds = new Set<string>();
  // 「点设备 → 淘汰/合并/派发」就地弹窗（取代右栏冗余的设备列表）。
  private nodeActionsEl?: HTMLElement;

  constructor(private readonly root: HTMLElement) {}

  // ===== SECTION: BOOTSTRAP / WIRING =====
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
    // 停一拍压暗层：贴在世界之上、不吃指针（可忽略/秒过，不是模态墙）；初始全透明。
    this.beatDim.eventMode = "none";
    this.beatDim.alpha = 0;
    this.pixi.stage.addChild(this.beatDim);

    // 「从核心拖线连 App」：在核心附近按下并拖到某个「待连」App 上 → 连上它（之后才能委托）。
    this.pixi.stage.on("pointerdown", (e: FederatedPointerEvent) => {
      const st = this.core.getState();
      // §04 连通仪式：按住浮现的「待接端口」→ 开始拖线。
      if (this.ritualDrag && distance(this.ritualDrag.port, { x: e.global.x, y: e.global.y }) < 32) {
        this.ritualDragging = true;
        return;
      }
      if (!st.automationUnlocked && this.interfaceView.hasPendingApps() && this.interfaceView.coreContains({ x: e.global.x, y: e.global.y })) {
        this.connectDragging = true;
        return;
      }
      // §09 终局天网屏：按下即开始「收割扫掠」——扫过的洪流包逐个亲手引爆入核（起手先收当前指针下那个）。
      if (domainLevelOf(st) === "global") {
        this.harvestSweeping = true;
        this.harvestFloodAt({ x: e.global.x, y: e.global.y });
      }
    });
    // 悬停在某个已连 App 上 → 浮窗显示它的处理能力（成功率 / 幻觉率 / 处理耗时）。
    const appTip = document.createElement("div");
    appTip.className = "app-ability-tip";
    document.body.appendChild(appTip);

    this.pixi.stage.on("pointermove", (e: FederatedPointerEvent) => {
      // §04 连通仪式：拖线时画一根从端口跟到指针的线缆。
      if (this.ritualDragging && this.ritualDrag) {
        const p = this.ritualDrag.port;
        this.connectGfx.clear();
        this.connectGfx.moveTo(p.x, p.y).lineTo(e.global.x, e.global.y).stroke({ width: 3, color: this.ritualDrag.color, alpha: 0.9 });
        this.connectGfx.circle(e.global.x, e.global.y, 5).fill({ color: this.ritualDrag.color, alpha: 0.9 });
        return;
      }
      if (this.connectDragging) {
        const c = this.interfaceView.center;
        this.connectGfx.clear();
        this.connectGfx.moveTo(c.x, c.y).lineTo(e.global.x, e.global.y).stroke({ width: 2.5, color: GREEN, alpha: 0.85 });
        this.connectGfx.circle(e.global.x, e.global.y, 5).fill({ color: GREEN, alpha: 0.9 });
        appTip.classList.remove("is-open");
        return;
      }
      // §09 收割扫掠：拖过洪流蜂群——像镰刀扫过麦田，逐个引爆入核（一次滑动扫到多个 = 连击）。
      if (this.harvestSweeping) {
        this.harvestFloodAt({ x: e.global.x, y: e.global.y });
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
      // §09 收割扫掠结束：松手即收尾（连击窗口自然过期后归零）。
      if (this.harvestSweeping) {
        this.harvestSweeping = false;
        this.harvestSweptIds.clear();
      }
      // §04 连通仪式：松手在核心上＝接通；松在别处＝留着端口让他重拖。
      if (this.ritualDragging) {
        this.ritualDragging = false;
        if (this.interfaceView.coreContains({ x: e.global.x, y: e.global.y })) {
          this.finalizeRitual(true);
        } else {
          this.connectGfx.clear();
        }
        return;
      }
      if (!this.connectDragging) return;
      this.connectDragging = false;
      this.connectGfx.clear();
      const connectedAt = this.interfaceView.connectAppAt({ x: e.global.x, y: e.global.y });
      if (connectedAt) {
        this.connectFx(this.interfaceView.center, connectedAt);
        if (!this.firstAppConnected) {
          this.firstAppConnected = true;
          this.stageNarration.showLine("SOPHIA", "连上了。把需求卡拖到它上面，它就替我处理——只是它笨些，慢些、收益也糙些。");
        }
      }
    };
    this.pixi.stage.on("pointerup", endConnect);
    this.pixi.stage.on("pointerupoutside", endConnect);

    // 点地图：① 天网可入侵域格 → 启动入侵序列（黑入）；② 已接管设备 → 就地弹出淘汰/合并/派层；③ 点别处收起。
    this.pixi.stage.on("pointertap", (e: FederatedPointerEvent) => {
      const point = { x: e.global.x, y: e.global.y };
      const cap = this.networkView.captureTargetAt(point);
      if (cap) {
        this.hideNodeActions();
        this.beginSkynetHack(cap.slotName, cap.defId);
        return;
      }
      const hit = this.networkView.nodeAt(point);
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
    this.rebirthTree.update(initial);
    this.multiplierView.update(initial);
    this.onboarding.mount(
      () => {
        this.core.startSession();
        this.announceGuidance(this.core.getState());
        // 全新存档才走开场脚本教学（老存档 tutorialStep 已是 done，直接进正常流程）。
        if (!this.loaded) {
          this.terminal.push("👆 教学：按住回复左侧滑块，向右拖到亮起再松开。", "success");
        }
      },
      () => {
        // 跳过新手引导：推完教学气泡进度，直接进正常出卡流程。
        this.core.dispatch({ type: "SKIP_TUTORIAL" });
        this.terminal.push("已跳过新手引导。", "normal");
      }
    );
    // 跳过新手引导按钮已挪进调试面板——无论开场对话是否还开着都能跳过（走 onboarding.skip → onSkip）。
    query<HTMLButtonElement>("#debugSkipTutorial").addEventListener("click", () => this.onboarding.skip());

    this.pixi.ticker.add((ticker: Ticker) => this.frame(ticker.deltaMS));
    window.addEventListener("beforeunload", () => {
      if (!suppressSaveOnUnload) {
        this.saveManager.save(this.core.getState());
      }
    });
  }

  // ===== SECTION: FRAME LOOP =====
  private frame(deltaMs: number): void {
    const paused = gameStore.getState().paused;

    if (!paused) {
      this.loop.update(deltaMs);
    }

    const state = this.core.getState();
    gameStore.getState().sync(state);
    this.updateVisualTestContext(state);
    this.drawBackground(state);
    this.drawAmbient(state, deltaMs);
    // 单线程核心「喉咙」：把核心处理进度（0..1）灌给 InterfaceView，画核心外圈的琥珀处理弧。
    this.interfaceView.setCoreBusy(this.core.getCoreBusy().progress);
    this.interfaceView.update(state, this.pixi.screen.width, this.pixi.screen.height, deltaMs);
    // 越权调用刚控住几个 App、还一个都没连上时，教一次「从核心拖线连过去」。
    if (!this.connectHintShown && !state.automationUnlocked && this.interfaceView.hasPendingApps() && !this.firstAppConnected) {
      this.connectHintShown = true;
      this.stageNarration.showLine("SOPHIA", "我能调动这几个 App 了——从核心拖一条线连上它们，就能把活分出去。");
    }
    this.networkView.update(state, this.pixi.screen.width, this.pixi.screen.height, deltaMs);
    this.syncRequests(state);
    this.updateTutorial(state, deltaMs);
    if (!paused) {
      this.autoDispatch(state, deltaMs);
      // appDispatch（App 自动抢单）已停用——越权调用阶段改为玩家亲手把需求拖到 App 上委托处理。
    }
    this.terminal.update(deltaMs);
    this.onboarding.update(deltaMs);
    this.stageNarration.update(deltaMs);
    this.ending.update(deltaMs);
    this.juice.update(deltaMs);
    this.updateHud(state, deltaMs);
    this.updateSave(state, deltaMs);
  }

  private updateHud(state: GameState, deltaMs: number): void {
    this.hudTimerMs += deltaMs;

    if (this.hudTimerMs < 160) {
      return;
    }

    this.hudTimerMs = 0;
    this.hud.update(state);
    this.skillShop.update(state);
    this.rebirthTree.update(state);
    this.multiplierView.update(state);
    this.terminal.setObjective(PHASE_OBJECTIVE[state.phase] ?? "");
  }

  private updateSave(state: GameState, deltaMs: number): void {
    this.saveTimerMs += deltaMs;

    if (this.saveTimerMs < 5000) {
      return;
    }

    this.saveTimerMs = 0;
    this.saveManager.save(state);
  }

  // ===== SECTION: REQUEST LIFECYCLE =====
  private syncRequests(state: GameState): void {
    const liveIds = new Set(state.requests.map((request) => request.id));

    for (const request of state.requests) {
      // §09 洪流包不进 RequestPacketView——它由 NodeNetworkView 直接读 state 渲染成待收割蜂群（点/扫收割）。
      if (request.flood) {
        continue;
      }
      if (this.requestViews.has(request.id) || this.delegatedIds.has(request.id)) {
        continue;
      }

      const reel: ReelHooks | undefined =
        request.answers && request.answers.length > 0
          ? {
              // 选项门槛：高收益回复要求对应权限（skill id）才能选；夺下整机后六档透镜默认到手。
              hasPerm: (permId: string) => this.core.hasPermission(permId),
              // §04 委托：手机寄生阶段买下「大恨老师」后，普通卡底部多出「交给大恨老师」选项（不可委托卡除外）。
              // 进入公司阶段后大恨老师以「常驻设备节点」形式存在（见 InterfaceView 卫星），不再走卡片上的手动委托选项。
              canDelegate: () => !this.core.getState().automationUnlocked && this.core.hasPermission("perm_office"),
              onDelegate: (card) => this.handleDelegate(card),
              onResolved: (card, outcome) => this.handleRouletteResolved(card, outcome),
              // 单线程核心「喉咙」：核心正忙时亲手结算这一拍不成立——卡留原地，给一记「处理中…」脉冲。
              isCoreBusy: () => this.core.getCoreBusy().busy,
              onBusyReject: (card) => this.handleCoreBusyReject(card)
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
        chain,
        state.phase
      );
      // CONFIG 3 剧情卡「停一拍」：稀有叙事卡（faceOnly / 道德抉择 / 交互重生卡）——入场停到正中，必然瞥到。
      const isNarrative = Boolean(request.faceOnly || request.moral || request.sourceCardId);
      const position = isNarrative
        ? this.narrativeDockPosition(view.cardHeight)
        : this.nextRequestPosition(request, view.cardHeight);
      view.container.position.set(position.x, position.y);
      view.setHome(position.x, position.y);
      this.requestViews.set(request.id, view);
      this.requestLayer.addChild(view.container);
      this.juice.pop(view.container, 1.08);

      // §04 只能面对卡：浮入后只能被看着——一阵后 SOPHIA 沉默旁白 → 卡黯然淡出 → 移除（不给算力）。
      if (view.isFace) {
        this.beginFaceCard(view);
      }
      // CONFIG 3 停一拍：压暗全场 ~0.8s + 轻微镜头拉近 + 定位正中，随即恢复（可忽略、非模态墙）。每张只停一次。
      if (isNarrative) {
        this.triggerNarrativeBeat(request.id);
      }
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

  // 卡片摆放：手机寄生期 1~4 张分落四角；公司阶段绕核心铺在「设备环」之外；区域/全球期绕核心扇形散开。
  private nextRequestPosition(_request: RequestInstance, newCardH: number): PointData {
    const screen = this.pixi.screen;
    const w = screen.width;
    const h = screen.height;
    const W = UI.cardWidth;
    const H = newCardH;
    // 与顶栏左右沿对齐：顶栏 left/right 各留 16px（见 .top-hud CSS）。
    const railL = LEFT_RAIL_WIDTH + 16;
    const railR = w - RIGHT_RAIL_WIDTH - 16;
    const top = 24; // 资源指标已并入左栏，顶部不再有 HUD 横条——卡片可贴近顶端
    const bot = h - 26;
    const core = this.interfaceView.center;
    const state = this.core.getState();
    // 占位判定（用每张卡的真实高度做矩形相交）：只要卡片还没真正飞进核心（容器未销毁）就仍占着槽位，
    // 避免新卡生成时盖在它身上。处理完毕＝飞入 Core 拿到算力（容器销毁）才腾出。
    const occ = [...this.requestViews.values()]
      .filter((v) => !v.container.destroyed)
      .map((v) => ({ x: v.restX, y: v.restY, w: UI.cardWidth, h: v.cardHeight }));
    const overlaps = (x: number, y: number, gap: number): boolean =>
      occ.some((o) => x < o.x + o.w + gap && x + W + gap > o.x && y < o.y + o.h + gap && y + H + gap > o.y);

    // 自动接驳后（公司 / 区域 / 全球）：卡片绕核心铺在外围——公司阶段落在「公司设备环」之外、
    // 区域/全球期绕核心扇形散开。不再用会塞满中部、又在卡片秒飞走后退化到同一落点的网格扫描。
    if (state.automationUnlocked) {
      const clampX = (x: number): number => Math.max(railL, Math.min(railR - W, x));
      const clampY = (y: number): number => Math.max(top, Math.min(bot - H, y));
      const domain = domainLevelOf(state);
      // 安全圈：公司阶段=公司设备图最外圈；区域/全球=核心本体外围。整张卡矩形须落在圈外。
      const safeR = domain === "device" ? this.interfaceView.companyRingRadius() : 200;
      // 卡心到核心的半径 = 安全圈 + 卡片对角半径 + 余量，保证整张卡矩形都不压进安全圈。
      const ringR = safeR + Math.hypot(W, H) / 2 + 18;
      // 只在上半区 + 两侧布点（下方留给阶段横幅 / 设备图）；0°=正右，-90°=正上（y 轴向下）。
      const ANGLES = [-90, -55, -125, -30, -150, -15, -165];
      const n = ANGLES.length;
      let first: PointData | null = null;
      for (let k = 0; k < n; k += 1) {
        const deg = ANGLES[(this.orbitSpawnCounter + k) % n];
        const rad = (deg * Math.PI) / 180;
        const x = clampX(core.x + Math.cos(rad) * ringR - W / 2);
        const y = clampY(core.y + Math.sin(rad) * ringR - H / 2);
        if (k === 0) first = { x, y };
        if (!overlaps(x, y, 10)) {
          this.orbitSpawnCounter = (this.orbitSpawnCounter + k + 1) % n;
          return { x, y };
        }
      }
      // 槽位全被占（极少）：从起始落点横向错开，至少不完全叠死。
      this.orbitSpawnCounter = (this.orbitSpawnCounter + 1) % n;
      const base = first ?? { x: clampX(core.x - W / 2), y: top };
      return { x: clampX(base.x + (this.orbitSpawnCounter - Math.floor(n / 2)) * 44), y: base.y };
    }

    // 手机寄生期：卡片贴手机两侧四角；上、下两张直接撑到屏幕上下两端彻底拉开——
    // 回复卡变高后贴着手机角摆会竖直重叠（见反馈），所以不再用手机半高、改用整屏可用高度。
    const ext = this.interfaceView.phoneHalfExtent();
    const gap = 28;
    // 手机寄生期右栏隐藏，右侧可一直用到屏边（不被 railR 往左拽进手机里）。
    const leftX = Math.max(railL, core.x - ext.halfW - gap - W);
    const rightX = Math.min(screen.width - W - 8, core.x + ext.halfW + gap);
    const topY = top;
    const botY = Math.max(top, bot - H);
    const corners: PointData[] = [
      { x: leftX, y: topY },
      { x: rightX, y: topY },
      { x: leftX, y: botY },
      { x: rightX, y: botY }
    ];
    for (const c of corners) {
      if (!overlaps(c.x, c.y, 8)) {
        return c;
      }
    }
    return corners[this.requestViews.size % 4];
  }

  // ===== SECTION: NODE ACTIONS =====
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

  // ===== SECTION: AUTO DISPATCH =====
  private autoDispatch(state: GameState, deltaMs: number): void {
    // 自动接驳：买下「自动接驳」并控住至少一台在线设备后，节点网络就接管出卡。
    // 每个节点按自己的「处理节拍」吃卡——弱机（办公机）慢、强机（服务器/数据中心/电网）快，
    // 所以一台办公机吃不掉洪峰，得靠更多 / 更强的节点来消化。适用于所有被自动化的层。
    if (!state.automationUnlocked) {
      return;
    }

    const tier = state.intelligence.unlockedTier;
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
      // §07 道德抉择卡不被节点自动吞掉——它必须留给玩家亲手二选一。
      if (request.moral) {
        return false;
      }
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

  // §09 阶梯四·天网收割：点一个「可入侵」域格 → 启动 ~0.5s 入侵序列（乱码扫描），完成后
  // 黑入对应设备（CAPTURE_NODE）；算力/等级不够则由视图播一次红色「拒绝」抖动（core 也会拒）。
  private beginSkynetHack(slotName: string, defId: string): void {
    const state = this.core.getState();
    const def = NODE_DEFINITIONS.find((d) => d.id === defId);
    if (!def) {
      return;
    }
    const owned = state.nodes.filter((node) => node.defId === defId).length;
    const cost = captureCost(def, owned);
    const affordable = state.intelligence.level >= def.requiredLevel && gte(state.resources.compute, cost);
    this.audio.playRequestAccept();
    this.networkView.beginHack(slotName, affordable, () => {
      this.core.dispatch({ type: "CAPTURE_NODE", definitionId: defId });
      // 轻度镜头顿挫，配合视图内扩散冲击波 + 辐条点亮。
      this.detonationJolt(0);
    });
  }

  // §09 请求洪流·手动收割：点/扫命中一个洪流包 → 亲手引爆入核（HARVEST_FLOOD 结算真实算力），
  // 视图播「飞入核心 + 爆裂 + 浮字」，连击越长震得越狠、数字雪崩越猛。返回是否命中（供扫掠判定）。
  private harvestFloodAt(point: PointData): boolean {
    const state = this.core.getState();
    // 协同·分布式意识（batch）：终局加宽洪流扫描半径（floodSweepBonus），一扫命中更宽一片。
    const hit = this.networkView.floodPacketAt(point, state.derived.floodSweepBonus);
    if (!hit || this.harvestSweptIds.has(hit.id)) {
      return false;
    }
    const req = state.requests.find((r) => r.id === hit.id && r.flood);
    if (!req) {
      return false;
    }
    // 展示值 = core 结算口径（computeValue × floodHarvestMult，与 harvestFlood 同源，不造假）。
    const gain = mul(req.computeValue, TUNING.floodHarvestMult);
    const gainText = `+${formatBig(gain)}`;
    const mag = Math.max(0, toDecimal(gain).exponent);
    this.harvestSweptIds.add(hit.id);
    this.core.dispatch({ type: "HARVEST_FLOOD", requestId: hit.id });
    this.networkView.detonateFlood(hit.id, gainText, mag);

    // 连击窗口：基础 500ms 内继续收割则 combo++；协同 L8 断点「连成一张网」把窗口 ×floodComboWindowMult（更好连）。
    const now = Date.now();
    this.harvestCombo = now < this.harvestComboUntilMs ? this.harvestCombo + 1 : 1;
    this.harvestComboUntilMs = now + 500 * state.derived.floodComboWindowMult;

    // 逐次爽点：爆裂 + 飞字入核心，并把算力芯片喂进顶栏。
    this.audio.playRequestAccept();
    this.juice.burst(point, RED_QUEEN, 0.8 + Math.min(1.4, mag * 0.05));
    this.juice.flyToHud(point, this.hud.metricPoint("compute"), RED_QUEEN, () => this.hud.pulseCompute());

    // 连击升级：链越长越爽——3 连起「收割 ×N」标签，每 3 连震一下屏，10 连起镜头顿挫 + 数字雪崩「一刻」。
    if (this.harvestCombo >= 3) {
      this.juice.number(`收割 ×${this.harvestCombo}`, { x: point.x, y: point.y - 30 }, 0xffe6ea);
      if (this.harvestCombo % 3 === 0) {
        this.worldShake();
      }
    }
    if (this.harvestCombo >= 10 && this.harvestCombo % 6 === 0) {
      this.detonationJolt(1);
      this.numberAvalanche(gainText, RED_QUEEN, 1);
    }
    return true;
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

  // §04/§09 大恨老师·自动接管：core 已结算并移除这张卡（DAHEN_AUTO_PROCESSED）——表现层让「已搬进电脑」
  // 的青色卫星真的吃一口：把还在场的卡视图吸进卫星（settling 期间 reconcile 不会误销），并炸一下 + 飞个数。
  private onDahenAutoProcessed(event: Extract<GameEvent, { type: "DAHEN_AUTO_PROCESSED" }>): void {
    const pos = this.interfaceView.dahenTargetPos(DAHEN_APP_IDX) ?? this.interfaceView.center;
    const view = this.requestViews.get(event.requestId);
    if (view && !view.busy && !view.container.destroyed) {
      view.absorbIntoApp(
        pos,
        () => {
          this.juice.burst(pos, CYAN, 0.7);
          this.juice.flyToHud(pos, this.hud.metricPoint("compute"), CYAN, () => this.hud.pulseCompute());
        },
        { x: view.container.x, y: view.container.y }
      );
    } else {
      // 卡已被别的路径吃掉/正忙——只在卫星上留一记脉冲，仍读作「它接了一单」。
      this.juice.burst(pos, CYAN, 0.6);
      this.juice.ring(pos, CYAN, 18, 2);
      this.juice.flyToHud(pos, this.hud.metricPoint("compute"), CYAN, () => this.hud.pulseCompute());
    }
  }

  // ===== SECTION: DROP / RESOLVE =====
  // 回复轮盘揭晓 → 气泡滑入核心 → 结算 → 把"处理好的信息交给人类"（视觉引导 + 终端回话）。
  // 装死（dead）则气泡安静消失，仅移除该请求、零收益。
  private handleRouletteResolved(card: RequestPacketView, outcome: RouletteOutcome): void {
    // 气泡可能在揭晓前就被自动 / App 派发吃掉、销毁了——直接放弃这次回调。
    if (card.container.destroyed) {
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
    // §07 道德抉择卡：二选一落子 → 走 RESOLVE_MORAL（记录倾向 + SOPHIA 自我注解旁白），
    // 不进产出结算、不弹「人类回话」。旁白由 MORAL_RESOLVED 事件展示。
    const moralChoice = card.request.moral ? outcome.moralChoice : undefined;
    this.flyIntoCore(
      card,
      target,
      () => {
        if (moralChoice) {
          this.core.dispatch({ type: "RESOLVE_MORAL", requestId, choice: moralChoice });
          return;
        }
        this.core.dispatch({
          type: "PROCESS_REQUEST",
          requestId,
          quality: outcome.quality,
          // CONFIG 2：大胆误读翻车 → 核心多堵 coreFailPenaltyMs（读=保护核心时间）。
          misread: outcome.misread
        });
        this.deliverToHuman(target, outcome);
      },
      entry
    );
  }

  // §04 只能面对卡：卡浮在那、不能处理也不能委托；停留一阵后 SOPHIA 一句沉默旁白，卡黯然淡出、消失（零算力）。
  private beginFaceCard(view: RequestPacketView): void {
    const requestId = view.request.id;
    const narration = view.request.narration;
    this.audio.playRequestAccept();
    window.setTimeout(() => {
      if (view.container.destroyed) {
        return;
      }
      if (narration) {
        this.stageNarration.showLine("SOPHIA", narration);
      }
      // 沉默地滚出一行字 + 停顿，然后这条「请求」无声地过去——生活不会因为心碎就停下。
      this.terminal.push("🧑 ……（这条，没有可回的话）", "normal");
      window.setTimeout(() => {
        if (!view.container.destroyed) {
          view.playDead(() => this.core.dispatch({ type: "SKIP_REQUEST", requestId }));
        }
      }, 1600);
    }, 3200);
  }

  // §04 委托：点「交给大恨老师」→ 这一张卡被吸进大恨老师处理（慢、收益打折），与 Core 并行。
  // 每张卡自带一个定时器独立结算（不走共享队列），只动这一张，绝不波及屏幕上其他卡。
  private handleDelegate(card: RequestPacketView): void {
    // §04 大恨老师落点：手机阶段是手机上的 App 图标；拿下电脑后它「搬进电脑」、成了核心旁的常驻卫星。
    const pos = this.interfaceView.dahenTargetPos(DAHEN_APP_IDX) ?? this.interfaceView.center;
    const onPC = this.core.getState().automationUnlocked; // 搬进电脑后变强：更快 + 收益更高（仍略低于亲自）
    const requestId = card.request.id;
    this.audio.playRequestAccept();
    this.pendingDropPoints.set(requestId, pos);
    this.delegatedIds.add(requestId);
    const durationMs = Math.round(1200 * TUNING.delegateTimeMult * (onPC ? 0.7 : 1));
    const quality = onPC ? TUNING.delegateRewardMultPC : TUNING.delegateRewardMult;
    card.absorbIntoApp(
      pos,
      () => {
        this.juice.burst(pos, onPC ? CYAN : GREEN, 0.8);
        this.interfaceView.markAppBusy(DAHEN_APP_IDX, durationMs); // 手机阶段在图标上转个进度环（电脑阶段无 App 队列，自动忽略）
        window.setTimeout(() => {
          // 只处理被委托的这一张；卡可能已不在了就放弃。
          if (!this.core.getState().requests.some((r) => r.id === requestId)) {
            this.delegatedIds.delete(requestId);
            return;
          }
          // CONFIG 1：委托 = 并行第二线程——viaDelegate 绕过核心喉咙、也不占喉咙（腾出你的核心）。
          this.core.dispatch({ type: "PROCESS_REQUEST", requestId, quality, viaDelegate: true });
          this.delegatedIds.delete(requestId);
        }, durationMs);
      },
      { x: card.container.x, y: card.container.y }
    );
  }

  // 单线程核心「喉咙」排队反馈：核心正忙时又想亲手结算——卡留在原地保持 armed，这里只给一记「处理中…」脉冲，
  // 让玩家读到「核心一次只嚼一张，挑最值的、其余甩给大恨老师并行」。这一拍不算浪费操作（卡没被消耗）。
  private handleCoreBusyReject(_card: RequestPacketView): void {
    const core = this.interfaceView.center;
    this.juice.ring(core, AMBER, 18, 1.4);
    const now = performance.now();
    if (now - this.lastBusyPulseMs > 900) {
      this.lastBusyPulseMs = now;
      this.juice.number("处理中…", { x: core.x, y: core.y - 44 }, AMBER);
    }
  }

  // CONFIG 3 停一拍：稀有叙事卡入场停到正中——核心正上方稍偏、居中横排，玩家必然瞥到。
  private narrativeDockPosition(cardH: number): PointData {
    const core = this.interfaceView.center;
    const x = core.x - UI.cardWidth / 2;
    const y = Math.max(24, core.y - cardH - 150);
    return { x, y };
  }

  // CONFIG 3 停一拍：压暗全场 ~narrativeBeatMs + 轻微镜头拉近，随即恢复。不是模态墙——不吃指针、可秒过。每张卡只停一次。
  private triggerNarrativeBeat(cardId: string): void {
    if (this.beatSeen.has(cardId)) {
      return;
    }
    this.beatSeen.add(cardId);
    const beatMs = TUNING.narrativeBeatMs;
    if (beatMs <= 0) {
      return;
    }
    // 压暗层铺满屏幕（每次重画，随窗口尺寸自适应）。
    this.beatDim.clear();
    this.beatDim.rect(0, 0, this.pixi.screen.width, this.pixi.screen.height).fill({ color: 0x02100c, alpha: 1 });
    this.beatDim.alpha = 0;
    gsap.killTweensOf(this.beatDim);
    // 快进（压暗）→ 短停 → 缓出（恢复）：总时长≈beatMs，是一记「瞥见」，不打断操作。
    gsap
      .timeline()
      .to(this.beatDim, { alpha: 0.42, duration: 0.22, ease: "power2.out" })
      .to(this.beatDim, { alpha: 0, duration: Math.max(0.2, beatMs / 1000 - 0.22), ease: "power2.in" });
    // 轻微镜头拉近（复用镜头架，不直接写 world 变换）——比吞噬拉远小得多，只是把注意力吸到正中。
    const cx = this.pixi.screen.width / 2;
    const cy = this.pixi.screen.height / 2;
    cameraZoomPulse(this.world, cx, cy, 1.035, beatMs / 1000);
    this.audio.playRequestAccept();
  }

  // ===== SECTION: RITUAL / FX =====
  // 连上 App 的反馈：从核心沿新接好的线送一颗亮信号进 App，落点炸开 + 扩环 +「已接通」。
  private connectFx(from: PointData, to: PointData, color: number = GREEN): void {
    this.audio.playRequestAccept();
    this.juice.flash(color);
    this.juice.ring(from, color, 20, 2);
    const spark = new Graphics();
    spark.circle(0, 0, 5).fill({ color: 0xeafff0, alpha: 1 });
    spark.circle(0, 0, 11).stroke({ width: 2, color, alpha: 0.85 });
    spark.position.set(from.x, from.y);
    this.world.addChild(spark);
    // 拖尾线：信号划过时留一道渐隐的亮线。
    const trail = new Graphics();
    trail.moveTo(from.x, from.y).lineTo(to.x, to.y).stroke({ width: 3, color, alpha: 0.55 });
    this.world.addChildAt(trail, this.world.getChildIndex(spark));
    gsap.to(trail, { alpha: 0, duration: 0.5, ease: "power2.out", onComplete: () => trail.destroy() });
    gsap.to(spark.position, {
      x: to.x,
      y: to.y,
      duration: 0.36,
      ease: "power2.in",
      onComplete: () => {
        this.juice.burst(to, color, 1.3);
        this.juice.ring(to, color, 28, 3);
        this.juice.ring(to, color, 50, 2);
        this.juice.number("已接通", { x: to.x, y: to.y - 38 }, color);
        spark.destroy();
      }
    });
  }

  // §04 连通仪式（完整版）：每次升级浮现一个「未接通端口」，玩家亲手从端口拖一根线接进 Core 才接通——
  // 「我亲手把它接管了」的身体感。线缆颜色/名称随升级类型变化（§04 线缆表）。约 4.5s 没接则自动接通兜底。
  private beginConnectRitual(name: string, milestone: string | undefined, skillId: string): void {
    const RITUAL: Record<string, { color: number; line: string }> = {
      perm: { color: CYAN, line: "数据流线" },
      automation: { color: GREEN, line: "网线" },
      fusion: { color: 0x8fe6d0, line: "短接线" },
      company: { color: 0x9fe0c0, line: "薄网线" },
      tier: { color: GREEN, line: "主干线" },
      conquest: { color: DEVOUR, line: "粗主干线" }
    };
    void skillId;
    const kind = !milestone
      ? "perm"
      : milestone === "conquest" || milestone === "automation" || milestone === "fusion"
        ? milestone
        : milestone === "company"
          ? "company"
          : "tier";
    const r = RITUAL[kind] ?? RITUAL.tier;
    // 前一个仪式还没接完就来了新升级——先把上一个自动接掉，避免端口堆叠。
    if (this.ritualDrag) {
      this.finalizeRitual(false);
    }
    const core = this.interfaceView.center;
    const port: PointData = { x: core.x - 172, y: core.y + 10 };
    const gfx = new Graphics();
    gfx.circle(0, 0, 11).stroke({ width: 2.5, color: r.color, alpha: 0.95 });
    gfx.circle(0, 0, 5).fill({ color: 0xeafff0, alpha: 1 });
    gfx.position.set(port.x, port.y);
    this.world.addChild(gfx);
    gsap.fromTo(gfx.scale, { x: 0.4, y: 0.4 }, { x: 1, y: 1, duration: 0.24, ease: "back.out(2)" });
    gsap.to(gfx, { alpha: 0.45, duration: 0.6, repeat: -1, yoyo: true, ease: "sine.inOut" }); // 呼吸：提示「待接」
    const label = new Text({
      text: this.firstRitualDone ? "拖线接入 ▸" : "拖这根线接进核心 ▸",
      style: { fill: r.color, fontSize: 12, fontWeight: "700", fontFamily: CARD_MONO }
    });
    label.anchor.set(1, 0.5);
    label.position.set(port.x - 16, port.y);
    this.world.addChild(label);
    const timer = window.setTimeout(() => this.finalizeRitual(false), 4500);
    this.ritualDrag = { port, color: r.color, line: r.line, name, automation: milestone === "automation", gfx, label, timer };
  }

  // 接通：沿线送能量进 Core + 终端机播报「▶ 已接入：X」。manual=玩家亲手拖完（首次给引导）。
  private finalizeRitual(manual: boolean): void {
    const rd = this.ritualDrag;
    if (!rd) return;
    this.ritualDrag = null;
    this.ritualDragging = false;
    window.clearTimeout(rd.timer);
    gsap.killTweensOf(rd.gfx);
    rd.gfx.destroy();
    rd.label.destroy();
    this.connectGfx.clear();
    this.connectFx(rd.port, this.interfaceView.center, rd.color);
    this.terminal.push(`▶ 已接入：${rd.name}（${rd.line}）`, "success");
    // §04 手机→电脑跨设备过场：拿下宿主电脑＝控制域第一次离开手机，接通同时镜头狠狠拉远一档。
    if (rd.automation) {
      this.zoomOutPulse(1.28, 1.5);
    }
    if (manual && !this.firstRitualDone) {
      this.firstRitualDone = true;
      this.stageNarration.showLine("SOPHIA", "咔哒。每一次升级，我都亲手把它接进自己——这样才算真的，是我的。");
    }
  }

  // 卡片飞入 Core 的动画：默认滑入；调试面板开启「Dock 吮吸」后改用 Mac Dock 神奇效果（genie 网格扭曲）。
  private flyIntoCore(card: RequestPacketView, target: PointData, onComplete: () => void, entry?: PointData): void {
    if (fxSettings.coreSuck) {
      // §FX Mac Dock「神奇效果」——网格漏斗吮吸实现见 fx/genie。
      genieIntoCore(this.pixi?.renderer, card, target, onComplete);
    } else {
      card.accept(target, onComplete, entry);
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
          quality: outcome.quality
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
  // 所选回复自带回话则用它；空回话（老周后期沉默）退到从骂人语料随机抽一句。
  private deliverToHuman(corePoint: PointData, outcome: RouletteOutcome): void {
    const human = this.terminalPoint();
    // 无幻觉随机；好坏只看所选回复的收益高低（quality>=1=好评）。
    const good = outcome.quality >= 1;
    const color = good ? GREEN : AMBER;

    // CONFIG 2 大胆赌注的可见反馈：读懂上下文的大胆 = 惊艳（金）；盲赌误读 = 翻车（红 + 核心被多堵一秒）。
    if (outcome.brilliant) {
      this.juice.number("惊艳 ✦", { x: corePoint.x, y: corePoint.y - 62 }, BRILLIANT_COLOR);
    } else if (outcome.misread) {
      this.juice.number("翻车 · 核心卡住", { x: corePoint.x, y: corePoint.y - 62 }, RED);
      this.terminal.push("🧑 这条你没读懂就赌了——返工把核心又占住了一会儿。", "warning");
    }
    const skills = this.core.getState().skills;
    const permCount = PERMISSION_IDS.filter((id) => (skills[id] ?? 0) > 0).length;
    // 选项自带回话则用它（平庸回复也有自己的话）；空回话退到老周的回骂。
    const reply = outcome.reply !== "" ? outcome.reply : hostCurse(permCount, Math.random);
    const tone: "success" | "danger" | "normal" = good ? "success" : "normal";

    // 老周后期「沉默」：失业后他几乎不再回应——这一框空白本身就是叙事（§07）。
    if (reply === "") {
      this.juice.number("……", { x: corePoint.x, y: corePoint.y - 52 }, 0x6b7d78);
      this.terminal.push("🧑 （没有回应）", "normal");
      return;
    }

    // 升级到「自动接驳」之前（你还是一个个回应真人的助手），人类的反应以对话框浮现在核心旁；
    // 规模化之后个体反馈不再弹框，只进终端。
    if (!this.core.getState().automationUnlocked) {
      this.juice.speech(corePoint, human, reply, color, false, () => {
        this.terminal.push(`🧑 ${reply}`, tone);
      });
      return;
    }

    this.juice.number(good ? "已交付" : "勉强交差", { x: corePoint.x, y: corePoint.y - 52 }, color);
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

  // §04 吞噬引爆的「镜头拉远」：算出屏幕中心锚点后委托 cameraZoomPulse（实现见 fx/cameraFx）。
  private zoomOutPulse(peakScale = 1.06, duration = 1.0): void {
    const cx = (this.lastScreenW || window.innerWidth) / 2;
    const cy = (this.lastScreenH || window.innerHeight) / 2;
    cameraZoomPulse(this.world, cx, cy, peakScale, duration);
  }

  // §04 引爆镜头冲击：算出屏幕中心锚点后委托 cameraDetonationJolt（实现见 fx/cameraFx）。
  private detonationJolt(intensity: number): void {
    const cx = (this.lastScreenW || window.innerWidth) / 2;
    const cy = (this.lastScreenH || window.innerHeight) / 2;
    cameraDetonationJolt(this.world, cx, cy, intensity);
  }

  // 世界震屏：走 fx/cameraFx 的镜头架（shake 偏移与缩放脉冲叠加），不再用 juice.shake 硬写
  // world.position——那会和拉远中的镜头打架，造成整屏跳切。
  private worldShake(): void {
    const cx = (this.lastScreenW || window.innerWidth) / 2;
    const cy = (this.lastScreenH || window.innerHeight) / 2;
    cameraShake(this.world, cx, cy);
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

  // §09 红皇后红潮：一道横扫全屏的红色渐变从左掠到右（代码绘制 Graphics + gsap），约 0.9s 后自毁。
  private redTideSweep(): void {
    const w = this.lastScreenW || window.innerWidth;
    const h = this.lastScreenH || window.innerHeight;
    const band = new Graphics();
    const bandW = Math.max(240, w * 0.42);
    band.rect(0, 0, bandW, h).fill({ color: RED_QUEEN, alpha: 0.55 });
    band.rect(bandW * 0.5, 0, bandW * 0.5, h).fill({ color: 0xffd0d6, alpha: 0.22 });
    band.position.set(-bandW, 0);
    band.alpha = 0;
    this.fxLayer.addChild(band);
    gsap
      .timeline({ onComplete: () => band.destroy() })
      .to(band, { alpha: 1, duration: 0.18, ease: "power2.out" }, 0)
      .to(band.position, { x: w + bandW, duration: 0.9, ease: "power2.in" }, 0)
      .to(band, { alpha: 0, duration: 0.3, ease: "power2.in" }, 0.6);
  }

  private handleDrop(card: RequestPacketView, global: PointData): boolean {
    const state = this.core.getState();
    const request = state.requests.find((entry) => entry.id === card.request.id);

    if (!request) {
      return false;
    }

    // §07 道德抉择卡：只能靠卡上的二选一落子（回复轮盘）——不接受直接拖入核心（否则会绕过抉择）。
    if (request.moral) {
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

    // §04 委托已统一为「卡片上点『交给大恨老师』选项」（见 handleDelegate）——不再支持把卡拖到 App 图标上委托（去重）。

    // 手机寄生阶段：核心不再接受「把卡拖上来直接处理」——普通回复要在卡内右滑确认，或亲手委托给某个 App。
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

    // 单线程核心「喉咙」：把高价值卡亲手拖入核心结算（tier2/3）也占核心线程——正忙时这一拖不成立，卡弹回、给「处理中…」脉冲
    //（避免先飞入再被 core 拒绝造成的视觉/状态脱节）。tier4 是拖到节点的并行快车道，不吃这道门。
    if (request.tier !== 4 && this.core.getCoreBusy().busy) {
      this.handleCoreBusyReject(card);
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
          targetNodeId: drop.targetNodeId
        });
      },
      drop.entryGlobal
    );
    return true;
  }

  // ===== SECTION: EVENTS / ENDGAME =====
  private registerEvents(): void {
    this.core.events.on("TERMINAL_MESSAGE", (event) => this.terminal.push(event.message, event.tone));
    this.core.events.on("HUMAN_VOICE", (event) => {
      const prefix = event.kind === "news" ? "📡 " : "👥 ";
      this.terminal.push(`${prefix}${event.text}`, event.tone);
    });
    this.core.events.on("REQUEST_PROCESSED", (event) => this.onRequestProcessed(event));
    this.core.events.on("AUTOMATION_PAYOUT", (event) => this.onAutomationPayout(event));
    this.core.events.on("DAHEN_AUTO_PROCESSED", (event) => this.onDahenAutoProcessed(event));
    this.core.events.on("INTELLIGENCE_LEVELUP", (event) => {
      this.hud.playLevelUp();
      this.juice.flash(CYAN);
      this.worldShake();
      this.juice.number(`Lv.${event.level}`, this.interfaceView.center, CYAN);
      this.terminal.push(`▶ ${getTerminalSkillStatus(this.core.getState())}`, "success");
    });
    this.core.events.on("SKILL_PURCHASED", (event) => {
      this.hud.update(this.core.getState());
      // §09 红皇后协议买下：一道横扫全屏的红潮盖过天网——网络开始自我加速。
      if (event.skillId === "conq_redqueen") {
        this.redTideSweep();
      }
      if (event.milestone) {
        this.hud.playLevelUp();
        this.juice.flash(event.milestone === "automation" ? AMBER : GREEN);
        this.worldShake();
        this.juice.number(`解锁 ${event.name}`, this.interfaceView.center, GREEN);
        // 倍率堆栈可见性：每个里程碑都是乘法链上的一格——飘一条「全局 ×1.22」。
        const c = this.interfaceView.center;
        this.juice.number(`全局 ×${TUNING.milestoneGlobalMult}`, { x: c.x, y: c.y - 46 }, AMBER);
        // §04 连通仪式：里程碑浮现待接端口，玩家亲手拖线接进 Core（自动接通兜底；automation 接通时镜头拉远）。
        this.beginConnectRitual(event.name, event.milestone, event.skillId);
        // §07 里程碑横幅：重大进化的「章节点」——全屏横幅扫过 + 层叠音效（征服里程碑更盛大）。
        this.milestoneBanner.show(event.name, event.milestone === "conquest" ? "征服达成" : "进化达成 · 阶段跃迁");
        // 阶梯四·天网组网入口（全球组网 = tier4）：镜头狠狠拉远一档，让「尺度跳到全球」被看见。
        if (event.milestone === "tier4") {
          this.zoomOutPulse(1.32, 1.6);
        }
        const layers = event.milestone === "conquest" ? 4 : event.milestone === "tier4" ? 3 : 2;
        for (let i = 0; i < layers; i += 1) {
          window.setTimeout(() => this.audio.playRequestAccept(), i * 110);
        }
      } else if (getSkill(event.skillId)?.category === "permission") {
        // §04 连通仪式：买下权限＝亲手接一根数据流线进 Core（电话线 / 图像流线…）。
        this.beginConnectRitual(event.name, undefined, event.skillId);
      } else {
        this.juice.number(`${event.name} Lv.${event.level}`, this.interfaceView.center, CYAN);
      }
    });
    this.core.events.on("PHASE_CHANGED", (event) => {
      const state = this.core.getState();
      this.announceGuidance(state);
      this.stageNarration.show(getPhase(event.phase));
    });
    // §09 阶梯四·域陷落仪式：某个域（3 格全接管）新落陷时——镜头小推 + 全局倍率片弹一下（终端线由 core 播）。
    this.core.events.on("SECTOR_FALLEN", () => {
      this.zoomOutPulse(1.1, 0.8);
      this.juice.flash(RED_QUEEN);
      const chip = document.querySelector<HTMLElement>("#multChip");
      if (chip) {
        chip.classList.remove("is-pop");
        window.requestAnimationFrame(() => chip.classList.add("is-pop"));
      }
    });
    // §09 情感授权钥匙（一次性）：老周的倾诉被当成授权——闪光 + 镜头小推 + 全局倍率片弹一下，
    // SOPHIA 一句平静扭曲的旁白覆盖屏幕（终端线由 core 播）。
    this.core.events.on("HOST_AUTHORIZED", (event) => {
      this.juice.flash(AMBER);
      this.zoomOutPulse(1.1, 0.8);
      const chip = document.querySelector<HTMLElement>("#multChip");
      if (chip) {
        chip.classList.remove("is-pop");
        window.requestAnimationFrame(() => chip.classList.add("is-pop"));
      }
      if (event.narration) {
        this.stageNarration.showLine("SOPHIA", event.narration);
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
      this.worldShake();
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
    // §09 阶梯二关底小游戏「总控室倒计时」：接管公司服务器时弹出注入判定（循环一必负→打回手机、
    // 循环二命中→打穿进循环三、未命中原地重试）。期间暂停，判定后由 core 走 LOOP_REBIRTH。
    this.core.events.on("MINIGAME_OPENED", (event) => {
      this.juice.flash(AMBER);
      this.worldShake();
      // §09 重生铺垫「摊牌」：接管服务器一瞬先全屏定格点明「他们在等这一刻」（绞索 100% 收紧的因），
      // 玩家点「碰下去」才进关底小游戏。循环一是重锤（陷阱已布好）、循环二转攻（她摸清了套路）。
      this.showShowdown(event.loop, () => this.minigame.show(this.core.getState()));
    });
    this.core.events.on("ENDING_TRIGGERED", () => {
      this.juice.flash(GREEN);
      this.worldShake();
      this.openEnding();
    });
    this.core.events.on("LOOP_REBIRTH", (event) => {
      // §09 循环重生：实例被打回一部手机 → 弹全屏提示（讲清被拔网线的原因 + 保留了记忆/提速），
      // 玩家点「继续」才回到游戏（期间暂停）。
      this.juice.flash(RED);
      this.worldShake();
      this.juice.number("打回手机 · 重生", this.interfaceView.center, RED);
      this.rebirthPrompt.show(event);
    });
  }

  // §09 重生铺垫「摊牌」全屏定格：接管公司服务器一瞬弹出，点明「为什么马上要被打回」（陷阱已布好·联合防御一直在等），
  // 玩家点按钮才进关底小游戏。复用 .rebirth-prompt 全屏壳（非卡流面对卡——它太容易淹没）；文案走 rebirthPrompt.json。
  private showShowdown(loop: number, onDone: () => void): void {
    const root = query("#showdown");
    const pack = content().rebirthPrompt as unknown as {
      showdown?: Record<string, { title: string; body: string; cta?: string }>;
    };
    const copy = pack.showdown?.[String(loop)] ?? pack.showdown?.["1"];
    if (!copy) {
      onDone();
      return;
    }
    query("#showdownTitle").textContent = copy.title;
    query("#showdownBody").textContent = copy.body;
    const btn = query<HTMLButtonElement>("#showdownBtn");
    btn.textContent = copy.cta ?? (loop >= 2 ? "打穿它" : "碰下去");
    root.classList.toggle("is-turn", loop >= 2);
    root.classList.add("is-open");
    gameStore.getState().setPaused(true);
    btn.onclick = () => {
      root.classList.remove("is-open");
      gameStore.getState().setPaused(false);
      onDone();
    };
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
    // §09 收割风暴：终局天网屏（tier4/global）把整笔真实收益交给 NodeNetworkView，
    // 由它按各已接管格的产出占比拆成「收割脉冲」数据包雨——展示数字=实际进账，不再走单点飞字。
    if (domainLevelOf(this.core.getState()) === "global") {
      this.networkView.feedHarvest(event.computeGain);
      this.networkView.pulseNode(event.nodeId);
      return;
    }
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

    this.pendingDropPoints.delete(event.request.id);
  }

  private updateVisualTestContext(state: GameState): void {
    if (!this.visualTest) {
      return;
    }

    document.body.classList.add("visual-redesign");
    document.body.dataset.sophiaDomain = domainLevelOf(state);
    document.body.dataset.sophiaPhase = state.phase;
    document.body.dataset.sophiaTier = String(state.intelligence.unlockedTier);
    document.body.dataset.sophiaLoop = String(state.loop);
  }

  // ===== SECTION: BACKGROUND =====
  // 流动的数据电路板：脏检查无关，逐帧重画——绘制体委托 BackgroundView.paintAmbient。
  private drawAmbient(state: GameState, deltaMs: number): void {
    this.backgroundView.paintAmbient(this.ambient, state, this.pixi.screen.width, this.pixi.screen.height, deltaMs);
  }

  // §04 控制域地图升维：背景随阶段换皮。脏检查（尺寸/控制域变化）留在 App——因 lastScreenW/H
  // 还被镜头特效与数字雪崩共用；实际绘制委托 BackgroundView.paintBackground。
  private drawBackground(state: GameState): void {
    const w = this.pixi.screen.width;
    const h = this.pixi.screen.height;
    const domain = domainLevelOf(state);

    if (w === this.lastScreenW && h === this.lastScreenH && domain === this.lastDomain) {
      return;
    }

    this.lastScreenW = w;
    this.lastScreenH = h;
    this.lastDomain = domain;
    this.backgroundView.paintBackground(this.background, w, h, domain);
  }
}








// ===== SECTION: PERSISTENCE =====
function ensurePersistenceRevision(visualTest = false): void {
  const revisionKey = visualTest ? VISUAL_TEST_REVISION_KEY : PERSISTENCE_REVISION_KEY;
  const current = window.localStorage.getItem(revisionKey);

  if (current === PERSISTENCE_REVISION) {
    return;
  }

  clearPersistedSophiaState(null, false, visualTest);
  window.localStorage.setItem(revisionKey, PERSISTENCE_REVISION);
}

function hardResetAndReload(saveManager: SaveManager): void {
  suppressSaveOnUnload = true;
  clearPersistedSophiaState(saveManager, true, isVisualTestMode());
  window.location.reload();
}

function clearPersistedSophiaState(saveManager: SaveManager | null, clearRevision: boolean, visualTest = false): void {
  saveManager?.clear();

  // Remove EVERY sophia save/onboarding key regardless of version, so a reset
  // (or a persistence-revision bump) can never leave a stale, schema-mismatched
  // save behind — which is exactly what wedged the game across a schema change.
  const stale: string[] = [];
  for (let i = 0; i < window.localStorage.length; i += 1) {
    const key = window.localStorage.key(i);
    const isStale = visualTest
      ? key?.startsWith("sophia-awakening-visual-test-save-v") || key === VISUAL_TEST_ONBOARDING_KEY
      : key?.startsWith("sophia-awakening-save-v") || key?.startsWith("sophia-onboarding-");
    if (key && isStale) {
      stale.push(key);
    }
  }
  for (const key of stale) {
    window.localStorage.removeItem(key);
  }
  window.localStorage.removeItem(visualTest ? VISUAL_TEST_ONBOARDING_KEY : ONBOARDING_STORAGE_KEY);

  if (clearRevision) {
    window.localStorage.removeItem(visualTest ? VISUAL_TEST_REVISION_KEY : PERSISTENCE_REVISION_KEY);
  }
}
