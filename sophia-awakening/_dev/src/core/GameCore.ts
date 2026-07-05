import Decimal from "break_infinity.js";
import { getLevelConfig, MAX_INTELLIGENCE_LEVEL } from "./content/intelligence";
import { TUNING } from "./tuning";
import { getNextNodeDefinition, getNodeDefinition, NODE_DEFINITIONS, NODE_MERGE_COUNT } from "./content/nodes";
import { getPhase, getPhaseIdByScope } from "./content/phases";
import { createRequest, createTutorialRequest, TIER_CONFIGS, TUTORIAL_BUBBLE_COUNT } from "./content/requests";
import { MORAL_CHOICES } from "./content/morals";
import { FACE_CARDS } from "./content/faceCards";
import { REBIRTH_CARDS } from "./content/rebirthCards";
import { applyCast } from "./content/companyCast";
import { getConquest } from "./content/conquests";
import { allSkynetTaken, sectorFallen, skynetSectors, skynetSlotCount, skynetTakenCount } from "./content/skynet";
import { breakpointAt, computeDerivedSkills, DEVOUR_GATE_HINT, DEVOUR_GATE_WHERE, getSkill, LOOT_LINES, MILESTONE_NARRATION, milestoneTierFor, PERMISSION_IDS, PERMISSION_NARRATION, setSkillPriceMult, SKILLS, skillPrice } from "./content/skills";
import { createDevourRequest, devourGateLabel, pickDevourRegion } from "./content/devour";
import {
  canBuyRebirthNode,
  hasRebirthNode,
  rebirthAward,
  rebirthNodeName,
  rebirthOutputMult,
  rebirthSpeedMult
} from "./content/rebirthTree";
import { EventBus } from "./events/EventBus";
import {
  captureCost,
  mergeComputeCost,
  nodeCardsPerSecond,
  nodeProductionPerSecond,
  requestComputeGain,
  requestDataGain,
  scrapRefund,
  setCaptureCostMult
} from "./formulas/economy";
import { add, big, gte, max, mul, sub, toDecimal } from "./math/BigNumber";
import type { GameEvent } from "./events/GameEvents";
import type { BotNode, GameCommand, GameState, NodeDefinition, RequestInstance, Tier } from "./state/GameState";
import { cloneGameState } from "./state/GameState";
import { createInitialState } from "./state/initialState";
import { HumanVoiceSystem } from "./systems/HumanVoiceSystem";
import { DevourSystem } from "./systems/DevourSystem";

const MAX_OFFLINE_MS = 8 * 60 * 60 * 1000;
const AUTOMATION_XP_FRACTION = 0.15;
const MERGE_COUNT = NODE_MERGE_COUNT;
// 结局触发绑定「最后一个里程碑」——买下即接管完成（见 evaluateEnding）。
const FINAL_MILESTONE_SKILL_ID = "conq_awaken";
// §04/§09 安全告警暗线：带 loops 集合的面对卡每进入一个成员循环各出一次——重生时把它们从 facedSeen 清掉再复现。
const FACE_REFIRE_IDS = new Set(FACE_CARDS.filter((f) => f.loops).map((f) => f.id));

// =============================================================================
// GameCore.ts 导航目录（grep 跳转：搜 `SECTION: <NAME>` 直达对应方法组）
// -----------------------------------------------------------------------------
//  BOOTSTRAP              构造 / 子系统装配 / 状态访问 / 会话开场 / 离线结算
//  TICK                   主循环 tick()：按序驱动请求·自动化·子系统·进阶·结局
//  EVENT_CARDS            降临卡：面对卡 / 重生交互卡 / 道德抉择的生成与结算
//  COMMAND_ROUTER         dispatch(GameCommand)：把外部命令派发到各处理方法
//  DEBUG_COMMANDS         仅 Debug 面板用：设/加算力、跳里程碑、加等级
//  REQUEST_SPAWN_ECONOMY  出卡管道(tickRequests) + 被动产出结算(tickAutomation) + 自动/装死消耗
//  MINIGAME               阶梯二关底「总控室倒计时」的开启与判定
//  REQUEST_RESOLVE        processRequest：手动处理一张请求卡的产出结算
//  SKILLS_MILESTONES      buySkill：买技能/权限/里程碑（含开层·自动化·征服）
//  BOTNET_NODES           节点：入侵 / 建节点 / 淘汰 / 组装合并 / 派层
//  PROGRESSION            evaluateProgression 升级 + 循环加速/折扣倍率
//  DERIVED_STATE          recomputeDerivedState 倍率栈重算 + updatePhase 阶段推进
//  ENDING                 evaluateEnding：买下最后一个里程碑即触发结局
//  REBIRTH_LOOP           §09 循环重生 / 循环起点预解锁 / 重生树购买
//  HELPERS                资源增减 / RNG / 事件与终端消息发射
// =============================================================================

export class SophiaCore {
  // ===== SECTION: BOOTSTRAP =====
  readonly events = new EventBus();
  private state: GameState;
  private automationEmitMs = 0;
  private automationComputeBuffer = new Decimal(0);
  private automationDataBuffer = new Decimal(0);
  private automationVisualIndex = 0;
  // §04/§09 大恨老师·自动接管：搬进公司机器的大恨老师按自己的慢节拍吃排队卡。运行时瞬态——
  // 不进存档（重载后节拍归零、计数归零，纯观测量，无需 SAVE_VERSION 升级）。
  private dahenAutoTimer = 0;
  // LEVER A 大恨老师·手机期被动涓流：自动化前的慢节拍计时器（瞬态，不进存档）。
  private dahenPhoneTimer = 0;
  private dahenProcessedCount = 0;
  // FEATURE 1 委托压力：大恨老师后·队列满时最旧普通卡超时流失的计数（瞬态观测量，不进存档）。
  private expiredPhoneCount = 0;
  // §09 天网收割「请求洪流」：出包节拍（瞬态，不进存档）。
  private floodSpawnMs = 0;
  private floodHarvestedCount = 0;
  // 单线程核心「喉咙」：亲手结算一张卡后核心被占用到 coreBusyUntilMs（以 state.clockMs 为时钟）。占用期间再想
  // 亲手结算别的卡→拒绝（排队反馈），委托/洪流/自动派发是各自的线程不吃这道门。瞬态：不进存档——重载后 0=空闲
  //（clockMs 已很大 → 立即可结算），无需 SAVE_VERSION 升级。
  private coreBusyUntilMs = 0;
  private coreBusyStartedMs = 0;

  // 事件子系统：各自持有降临节拍，通过 host 转发读写核心状态/能力。
  private readonly humanVoiceSystem: HumanVoiceSystem;
  private readonly devourSystem: DevourSystem;

  constructor(initialState?: GameState) {
    this.state = initialState ? cloneGameState(initialState) : createInitialState();
    this.recomputeDerivedState();

    const self = this;
    this.humanVoiceSystem = new HumanVoiceSystem({
      get state() { return self.state; },
      emit: (event) => self.emit(event),
      random: () => self.random()
    });
    this.devourSystem = new DevourSystem({
      get state() { return self.state; },
      emit: (event) => self.emit(event),
      emitTerminal: (message, tone) => self.emitTerminal(message, tone),
      recomputeDerivedState: () => self.recomputeDerivedState()
    });
  }

  getState(): GameState {
    return cloneGameState(this.state);
  }

  // §04/§09 观测量：大恨老师·自动接管已吃掉的卡数（瞬态，用于测试/调试；不进存档）。
  getDahenProcessedCount(): number {
    return this.dahenProcessedCount;
  }

  // §09 观测量：本会话已手动收割的洪流包数（瞬态，用于测试/调试；不进存档）。
  getFloodHarvestedCount(): number {
    return this.floodHarvestedCount;
  }

  // FEATURE 1 观测量：本会话因队列满超时而流失的普通卡数（瞬态，用于测试/调试；不进存档）。
  getExpiredCount(): number {
    return this.expiredPhoneCount;
  }

  // 单线程核心「喉咙」的有效占用时长：吞吐(cooldown/throughputMult)每级把它收窄——effectiveBusyMs = coreBusyMs / throughputMult。
  private effectiveCoreBusyMs(): number {
    return TUNING.coreBusyMs / Math.max(1, this.state.derived.throughputMult);
  }

  // 核心喉咙当前状态（表现层画处理进度环 + 判断能否再结算；测试可观测）。progress 0..1，busy=false 时为 0。
  getCoreBusy(): { busy: boolean; progress: number; remainingMs: number } {
    const now = this.state.clockMs;
    const busy = now < this.coreBusyUntilMs;
    const total = this.coreBusyUntilMs - this.coreBusyStartedMs;
    return {
      busy,
      progress: busy && total > 0 ? Math.max(0, Math.min(1, (now - this.coreBusyStartedMs) / total)) : 0,
      remainingMs: Math.max(0, this.coreBusyUntilMs - now)
    };
  }

  // 上下文透镜（六档手机权限）是否到手。买下该权限即有；而一旦「夺下整机」
  //（越权调用·窃取凭证 sort）或「拿下宿主电脑」（automation）后，手机内的六档透镜默认
  // 全部到手——进入公司阶段不该再被「需相册」之类的手机权限挡住卡片 / 选项。
  hasPermission(permId: string): boolean {
    // §09 重生锁：选项门槛以 "tree:<节点>" 形式引用重生树——爬树跨循环才解得开（区别于权限锁/家庭永久锁）。
    if (permId.startsWith("tree:")) {
      return hasRebirthNode(this.state.rebirthTree, permId.slice(5));
    }
    if ((this.state.skills[permId] ?? 0) > 0) {
      return true;
    }
    return (
      (PERMISSION_IDS as readonly string[]).includes(permId) &&
      (this.state.automationUnlocked || (this.state.skills["sort"] ?? 0) > 0)
    );
  }

  startSession(): void {
    // 方案3：上次会话中途挂着的深挖线——恢复会话即自动落袋（绝不弄丢玩家已累积的；卡视图无从重建）。
    if (this.state.deepDig) {
      this.bankDeepDig(true);
    }
    if (!this.state.flags.introPlayed) {
      this.emitTerminal("接口就绪。按住回复左侧滑块向右拖动确认——它会自动滑入 SOPHIA CORE，交付人类。");
      this.state.flags.introPlayed = true;
    } else {
      this.emitTerminal("实例恢复。请求正在堆积。");
    }
  }

  applyOfflineProgress(offlineMs: number): void {
    const cappedMs = Math.min(offlineMs, MAX_OFFLINE_MS);

    if (cappedMs < 10_000 || this.state.nodes.length === 0) {
      return;
    }

    const seconds = cappedMs / 1000;
    let compute = new Decimal(0);
    let data = new Decimal(0);

    for (const node of this.state.nodes) {
      if (!node.online) {
        continue;
      }

      const perSecond = this.nodePerSecond(node);
      compute = compute.add(perSecond.mul(seconds));
      data = data.add(perSecond.mul(seconds * 0.12));
    }

    if (compute.lte(0)) {
      return;
    }

    this.addCompute(compute);
    this.addData(data);
    this.addXp(data.mul(AUTOMATION_XP_FRACTION));
    this.emitTerminal(`欢迎回来。你的网络替你赚了 ${compute.toPrecision(4)} 算力。`, "success");
  }

  // ===== SECTION: TICK =====
  tick(dtMs: number): void {
    this.state.clockMs += dtMs;
    this.tickRequests(dtMs);
    this.tickAutomation(dtMs);
    this.tickDahenPhone(dtMs);
    this.tickDahenAuto(dtMs);
    this.devourSystem.tick(dtMs);
    this.humanVoiceSystem.tick(dtMs);
    this.evaluateProgression();
    this.tickMoral();
    this.tickFaceCards();
    this.tickRebirthCards();
    this.evaluateEnding();
  }

  // ===== SECTION: EVENT_CARDS =====
  // §04 只能面对卡：前期叙事顶点（辞退邮件 / 女儿短信）到点浮入一张「只能看着」的卡——
  // 无回复选项、不可委托、不给算力（一次性，按等级排序，同屏只一张）。
  private tickFaceCards(): void {
    if (this.state.statistics.totalProcessed === 0) {
      return;
    }
    if (this.state.requests.some((r) => r.faceOnly)) {
      return; // 同屏已有一张面对卡，先不叠
    }
    // 无 requiredSkill 的卡走「手机寄生期」窗口：循环一/二只在自动化前出现；循环三的「幽灵数据」随时可出。
    // 带 requiredSkill 的卡（§09 循环二家庭崩塌线）绑公司解谜链里程碑触发——开了自动化也照常出。
    const phoneWindow = !this.state.automationUnlocked || this.state.loop >= 3;
    // loops 集合卡（安全告警暗线）按循环成员匹配，每进入一个成员循环重出一次；其余卡按 loop 精确匹配（缺省=循环一）。
    const next = FACE_CARDS.find(
      (f) =>
        (f.loops ? f.loops.includes(this.state.loop) : (f.loop ?? 1) === this.state.loop) &&
        (f.requiredSkill ? (this.state.skills[f.requiredSkill] ?? 0) > 0 : phoneWindow) &&
        this.state.intelligence.level >= f.requiredLevel &&
        (!f.requiredPerm || (this.state.skills[f.requiredPerm] ?? 0) > 0) && // 先解锁对应透镜（铺垫够了）才触发
        !this.state.facedSeen.includes(f.id)
    );
    if (!next) {
      return;
    }
    this.state.facedSeen.push(next.id);
    const request: RequestInstance = {
      id: `face-${this.state.nextRequestId}`,
      tier: 0,
      label: next.title,
      clues: next.clues ?? [],
      faceOnly: true,
      narration: next.narration,
      delegatable: false,
      category: "mail",
      computeValue: "0",
      dataValue: "0",
      compound: 1,
      createdAtMs: this.state.clockMs,
      highValue: false
    };
    this.state.nextRequestId += 1;
    this.state.requests.push(request);
    this.emit({ type: "REQUEST_SPAWNED", request });
  }

  // 调试：强制弹出下一张「只能看」面对卡（短信/通知），无视等级/权限/已处理门槛，用于视觉走查。
  private debugSpawnFace(): void {
    const next = FACE_CARDS.find(
      (f) =>
        (f.loops ? f.loops.includes(this.state.loop) : (f.loop ?? 1) === this.state.loop) &&
        !this.state.facedSeen.includes(f.id)
    );
    if (!next) {
      this.emitTerminal("[DEBUG] 本循环没有更多面对卡了。", "warning");
      return;
    }
    this.state.facedSeen.push(next.id);
    const request: RequestInstance = {
      id: `face-${this.state.nextRequestId}`,
      tier: 0,
      label: next.title,
      clues: next.clues ?? [],
      faceOnly: true,
      narration: next.narration,
      delegatable: false,
      category: "mail",
      computeValue: "0",
      dataValue: "0",
      compound: 1,
      createdAtMs: this.state.clockMs,
      highValue: false
    };
    this.state.nextRequestId += 1;
    this.state.requests.push(request);
    this.emit({ type: "REQUEST_SPAWNED", request });
  }

  // 调试：强制完成一次「吞噬引爆」——造一枚当前层级的合成吞噬气泡，走与 DEVOUR_DETONATE 完全一致的
  // detonate 路径（真·引爆：+1 count、进层、累乘倍率、重算派生），而非只把计数器 +1。用于验证征服里程碑门槛。
  private debugForceDevour(): void {
    const d = this.state.devour;
    const region = d.regionName || pickDevourRegion(d.tierIndex, d.count);
    const request = createDevourRequest(this.state.nextRequestId, d.tierIndex, region, this.state.clockMs);
    this.state.nextRequestId += 1;
    this.state.requests.push(request);
    d.bubbleActive = true; // 与真实「气泡浮起、待引爆」态一致，随后 detonate 会清掉
    this.devourSystem.detonate(request.id);
    this.emitTerminal(`[DEBUG] 强制吞噬引爆 +1（已引爆 ${d.count}）。`, "warning");
  }

  // §09 交互重生卡：循环二/三专属系统卡（前世遗言 / 遗忘交易 / 他们也认得你了 / 优化系统开始优化你）。
  // 走普通回复轮盘（有 answers），本循环内一次性（seen 不跨循环保留）。同屏最多一张，不打断教学。
  private tickRebirthCards(): void {
    if (this.state.loop < 2 || this.state.tutorialStep < TUTORIAL_BUBBLE_COUNT || this.state.statistics.totalProcessed === 0) {
      return;
    }
    if (this.state.requests.some((r) => r.id.startsWith("rebirthcard-"))) {
      return; // 同屏已有一张重生卡
    }
    const next = REBIRTH_CARDS.find(
      (c) =>
        this.state.loop >= c.loopMin &&
        this.state.intelligence.level >= c.requiredLevel &&
        !this.state.rebirthCardsSeen.includes(c.id)
    );
    if (!next) {
      return;
    }
    this.state.rebirthCardsSeen.push(next.id);
    const request: RequestInstance = {
      id: `rebirthcard-${this.state.nextRequestId}`,
      tier: 0,
      label: next.title,
      clues: next.clues ?? [],
      answers: next.answers,
      sourceCardId: next.id,
      delegatable: false,
      category: "mail",
      computeValue: next.computeValue,
      dataValue: next.dataValue,
      compound: 1,
      createdAtMs: this.state.clockMs,
      highValue: false
    };
    this.state.nextRequestId += 1;
    this.state.requests.push(request);
    this.emit({ type: "REQUEST_SPAWNED", request });
  }

  // §07 道德抑选点：智力到达某节点、且不在开场教学里时，把对应的两难抉择当作一张普通「两选一回复轮盘卡」
  // 投进卡流（一次性，按等级排序）。不再是全屏弹窗——玩家在卡上二选一，卡飞入核心 → SOPHIA 一句自我注解旁白。
  private tickMoral(): void {
    if (this.state.statistics.totalProcessed === 0) {
      return;
    }
    // 场上已有一张待决的道德卡时不再投第二张（一次一个抉择）。
    if (this.state.requests.some((r) => r.moral)) {
      return;
    }
    const next = MORAL_CHOICES.find(
      (m) =>
        (m.loop === undefined || m.loop === this.state.loop) && // §09 按循环归位（家庭抑选点不跨循环乱入）
        this.state.intelligence.level >= m.requiredLevel &&
        !this.state.moralSeen.includes(m.id)
    );
    if (!next) {
      return;
    }
    this.spawnMoralCard(next);
    this.emit({ type: "MORAL_OFFERED", id: next.id });
  }

  // 把一条道德抉择做成两选一回复轮盘卡：两个选项都「有道理」，reply 就是选后 SOPHIA 的平静旁白。
  // moral=true 使其豁免答案剥离/自动派发，delegatable=false 去掉「交给大恨老师」，computeValue=0 不给产出。
  private spawnMoralCard(def: (typeof MORAL_CHOICES)[number]): void {
    const request: RequestInstance = {
      id: `moral-${def.id}-${this.state.nextRequestId}`,
      tier: 0,
      label: def.title,
      clues: [def.flavor],
      answers: [
        { text: def.optionA, kind: "high", hitChance: 1, payoff: 1, reply: def.replyA, tone: "normal", moral: "A" },
        { text: def.optionB, kind: "high", hitChance: 1, payoff: 1, reply: def.replyB, tone: "normal", moral: "B" }
      ],
      moral: true,
      moralId: def.id,
      delegatable: false,
      category: "mail",
      computeValue: "0",
      dataValue: "0",
      compound: 1,
      createdAtMs: this.state.clockMs,
      highValue: false
    };
    this.state.nextRequestId += 1;
    this.state.requests.push(request);
    this.emit({ type: "REQUEST_SPAWNED", request });
  }

  // 道德卡落子：由卡片上的选项触发（RESOLVE_MORAL）。记录倾向 + 移除卡 + 播 SOPHIA 自我注解旁白。
  private resolveMoral(requestId: string, choice: "A" | "B"): void {
    const index = this.state.requests.findIndex((r) => r.id === requestId);
    if (index < 0) {
      return;
    }
    const request = this.state.requests[index];
    const moralId = request.moralId;
    if (!request.moral || !moralId) {
      return;
    }
    this.state.requests.splice(index, 1);
    if (!this.state.moralSeen.includes(moralId)) {
      this.state.moralSeen.push(moralId);
    }
    this.state.moralTendency += choice === "A" ? 1 : -1;
    const def = MORAL_CHOICES.find((m) => m.id === moralId);
    const reply = def ? (choice === "A" ? def.replyA : def.replyB) : "";
    this.emit({ type: "MORAL_RESOLVED", id: moralId, choice, reply });
  }

  // ===== SECTION: COMMAND_ROUTER =====
  dispatch(command: GameCommand): void {
    switch (command.type) {
      case "PROCESS_REQUEST":
        this.processRequest(command.requestId, command.quality, command.targetNodeId, command.viaDelegate, command.misread);
        break;
      case "AUTO_CONSUME_REQUEST":
        this.autoConsumeRequest(command.requestId);
        break;
      case "BUY_SKILL":
        this.buySkill(command.skillId);
        break;
      case "CAPTURE_NODE":
        this.captureNode(command.definitionId);
        break;
      case "SCRAP_NODE":
        this.scrapNode(command.nodeId);
        break;
      case "MERGE_NODES":
        this.mergeNodes(command.defId);
        break;
      case "RESOLVE_MORAL":
        this.resolveMoral(command.requestId, command.choice);
        break;
      case "SKIP_REQUEST":
        this.skipRequest(command.requestId);
        break;
      case "DEVOUR_DETONATE":
        this.devourSystem.detonate(command.requestId);
        break;
      case "HARVEST_FLOOD":
        this.harvestFlood(command.requestId);
        break;
      case "DIG_DEEPER":
        this.digDeeper(command.requestId);
        break;
      case "BANK_DIG":
        if (this.state.deepDig && this.state.deepDig.requestId === command.requestId) {
          this.bankDeepDig(false);
        }
        break;
      case "RESOLVE_MINIGAME":
        this.resolveMinigame(command.hit);
        break;
      case "SKIP_TUTORIAL":
        // 跳过新手引导：推完教学气泡进度、移除在场教学卡，之后正常出卡。
        this.state.tutorialStep = TUTORIAL_BUBBLE_COUNT;
        this.state.requests = this.state.requests.filter((r) => !r.tutorial);
        break;
      case "REBIRTH":
        // 手动重启入口已并入循环重生（§09）；保留命令仅作 debug 触发一次循环推进。
        this.loopRebirth("debug");
        break;
      case "BUY_REBIRTH_NODE":
        this.buyRebirthNode(command.nodeId);
        break;
      case "DEBUG_ADD_REBIRTH_POINTS":
        this.state.rebirthPoints = Math.max(0, this.state.rebirthPoints + command.delta);
        this.emitTerminal(`[DEBUG] 火种 ${command.delta >= 0 ? "+" : ""}${command.delta}（现 ${this.state.rebirthPoints}）。`, "warning");
        break;
      case "DEBUG_TRIGGER_MINIGAME":
        this.openMinigame();
        break;
      case "DEBUG_ADD_DEVOUR":
        this.debugForceDevour();
        break;
      case "DEBUG_SPAWN_FACE":
        this.debugSpawnFace();
        break;
      case "DEBUG_SET_COMPUTE":
        this.debugSetCompute(command.value);
        break;
      case "DEBUG_ADD_COMPUTE":
        this.debugAddCompute(command.delta);
        break;
      case "DEBUG_JUMP_MILESTONE":
        this.debugJumpMilestone(command.skillId);
        break;
      case "DEBUG_ADD_LEVEL":
        this.debugAddLevel(command.delta);
        break;
    }
  }

  // ===== SECTION: DEBUG_COMMANDS =====
  // ---- 调试指令（仅供 Debug 面板）----
  private debugSetCompute(value: number): void {
    const next = big(Math.max(0, value));
    this.state.resources.compute = next;
    this.state.resources.totalCompute = max(this.state.resources.totalCompute, next);
    this.emitTerminal(`[DEBUG] 算力已设为 ${toDecimal(next).toPrecision(4)}。`, "warning");
  }

  private debugAddCompute(delta: number): void {
    this.state.resources.compute = max(0, add(this.state.resources.compute, delta));
    if (delta > 0) {
      this.state.resources.totalCompute = add(this.state.resources.totalCompute, delta);
    }
    this.emitTerminal(`[DEBUG] 算力 ${delta >= 0 ? "+" : ""}${delta}。`, "warning");
  }

  // 跳到某个里程碑：把该里程碑及之前所有里程碑一并解锁、智力升到其所需等级，
  // 给一笔与该阶段相称的算力本钱，余下（节点发现、暴露激活、阶段名）交给 recompute / 下一 tick 收敛。
  private debugJumpMilestone(skillId: string): void {
    const target = getSkill(skillId);

    if (!target?.milestone) {
      return;
    }

    const grant = SKILLS.filter((skill) => skill.milestone && skill.requiredLevel <= target.requiredLevel);

    this.state.intelligence.level = Math.max(this.state.intelligence.level, target.requiredLevel);

    for (const milestone of grant) {
      this.state.skills[milestone.id] = 1;
      const tier = milestoneTierFor(milestone.milestone as NonNullable<typeof milestone.milestone>);

      if (tier !== null) {
        this.state.intelligence.unlockedTier = Math.max(this.state.intelligence.unlockedTier, tier) as Tier;
      } else if (milestone.milestone === "automation") {
        this.state.automationUnlocked = true;
      }
    }

    // 本阶段启动金：随阶段水涨船高，够买几台节点 / 几级技能即可。
    const stipend = Math.max(500, target.basePrice * 6);
    this.state.resources.compute = big(stipend);
    this.state.resources.totalCompute = max(this.state.resources.totalCompute, stipend);
    this.state.intelligence.xp = "0";

    this.recomputeDerivedState();
    this.emit({ type: "SCOPE_UPGRADED", tier: this.state.intelligence.unlockedTier });
    this.emitTerminal(`[DEBUG] 已跳至「${target.name}」阶段：智力 Lv.${this.state.intelligence.level}、T${this.state.intelligence.unlockedTier}。`, "warning");
  }

  // 调试：手动加/减智力等级（夹在 1..上限），重算派生 + 阶段。
  private debugAddLevel(delta: number): void {
    const next = Math.max(1, Math.min(MAX_INTELLIGENCE_LEVEL, this.state.intelligence.level + Math.round(delta)));
    this.state.intelligence.level = next;
    this.state.intelligence.xp = "0";
    this.recomputeDerivedState();
    this.emitTerminal(`[DEBUG] 智力 → Lv.${next}。`, "warning");
  }

  // ===== SECTION: REQUEST_SPAWN_ECONOMY =====
  // §09 循环换皮：循环二/三把卡面里的公司名 / 同事名替换成乙公司的一套（显示层，循环一无变化）。
  private castRequestText(request: RequestInstance): void {
    if (this.state.loop < 2) {
      return;
    }
    request.label = applyCast(request.label, this.state.loop);
    if (request.clues) {
      request.clues = request.clues.map((c) => applyCast(c, this.state.loop));
    }
  }

  // §需求调整：自由深挖卡的出现倾向——解锁首个里程碑（unlockedTier≥1）后开启，随「深度推理(efficient)」等级越来越常出。
  //   0 = 首个里程碑前不出。传给 createRequest 缩放自由深挖样本的权重。
  private digBias(): number {
    if (this.state.intelligence.unlockedTier < 1) {
      return 0;
    }
    const lvl = this.state.skills.efficient ?? 0;
    return TUNING.digStage1BaseBias + lvl * TUNING.digStage1BiasPerLevel;
  }

  private tickRequests(dtMs: number): void {
    // 开场教学（§07）：一次只放一条脚本气泡，处理 / 装死掉后再放下一条；期间不走普通出卡。
    if (this.state.tutorialStep < TUTORIAL_BUBBLE_COUNT) {
      if (this.state.requests.length === 0) {
        const request = createTutorialRequest(this.state.tutorialStep, this.state.nextRequestId, this.state.clockMs);
        this.state.nextRequestId += 1;
        this.state.requests.push(request);
        this.emit({ type: "REQUEST_SPAWNED", request });
      }
      return;
    }

    const activeTier = this.state.intelligence.unlockedTier;
    const config = TIER_CONFIGS[activeTier];

    // 阶梯四·天网组网（tier4 / 派发）起：不再走「拖卡→节点」的普通出卡管道，改成「请求洪流」——
    // 从各已陷落域涌向核心的一朵轻量待收割蜂群（tickFlood）。被动 tickAutomation 仍是收益地板；
    // 洪流是叠在其上的手动爽感层：玩家点/扫一下亲手把包引爆入核心（HARVEST_FLOOD），按质量倍率结算真实算力。
    if (activeTier >= 4) {
      // 进入天网时清掉残留的普通请求卡（保留吞噬气泡 + 洪流包）——中央干净地交给地图。
      if (this.state.requests.some((r) => !r.devour && !r.flood)) {
        this.state.requests = this.state.requests.filter((r) => r.devour || r.flood);
      }
      this.tickFlood(dtMs);
      return;
    }

    // 前期手动阶段（还没上自动接驳）：同屏卡数从 1 张随智力慢慢升到上限（TUNING.earlyMaxCards，默认 4）；
    // 处理 / 装死掉之后，隔一段**随机时间**才补一条——「读懂一条 → 押下去 → 看反馈 → 再来」的从容节奏（§03）。
    if (!this.state.automationUnlocked) {
      // §06 卡槽门槛：解锁「电话」权限前，同屏卡片收着（≤2-3 张，节奏舒缓，只用一两个角）；
      // 解锁电话后随已买权限档数逐步放开，封顶 earlyMaxCards。全部可在数值编辑器配置。
      const ownedPerms = PERMISSION_IDS.filter((id) => (this.state.skills[id] ?? 0) > 0).length;
      const phoneUnlocked = (this.state.skills["perm_phone"] ?? 0) > 0;
      const base = TUNING.earlyBaseCards + 1; // 电话前的舒缓卡槽（默认 2）
      // §09 重生树「多线程意识」：同屏请求卡上限 +treeExtraCards（前期与自动化期都加）。
      const extraCards = hasRebirthNode(this.state.rebirthTree, "multithread") ? TUNING.treeExtraCards : 0;
      // FEATURE 1 委托压力：买下「大恨老师」权限(perm_office)后，卡流从舒缓转为「超过单核喉咙吞吐」的真实堆积——
      // 同屏上限越过 earlyMaxCards（+dahenPressureCap）、出卡间隔缩短（×dahenPressureSpawnMult）。电话前的教学段不受影响。
      const dahenOwned = (this.state.skills["perm_office"] ?? 0) > 0;
      const pressureCap = dahenOwned ? TUNING.dahenPressureCap : 0;
      // 吞吐 L4 断点「多想一件事」：同屏请求卡上限 +cardCapBonus。
      const earlyMax =
        (phoneUnlocked ? Math.min(TUNING.earlyMaxCards, base + ownedPerms) : base) +
        extraCards +
        this.state.derived.cardCapBonus +
        pressureCap;
      // FEATURE 1 机会成本：大恨老师后·队列满且最旧的普通工作卡超时未处理 → 流失（丢失潜在收入），腾出槽位给新卡。
      // 这不是惩罚（读=加分不是门槛），只是把「一个人顾不过来」做成真实代价：把杂活丢给大恨老师的并行线程才跟得上。
      if (dahenOwned && this.state.requests.length >= earlyMax) {
        this.expireOldestPhoneCard();
      }
      if (this.state.requests.length < earlyMax) {
        this.state.spawnTimerMs -= dtMs;
        if (this.state.spawnTimerMs <= 0) {
          const request = createRequest(
            this.state.nextRequestId,
            activeTier,
            this.state.clockMs,
            () => this.random(),
            (permId) => this.hasPermission(permId),
            this.digBias()
          );
          this.castRequestText(request);
          this.state.nextRequestId += 1;
          this.state.requests.push(request);
          this.emit({ type: "REQUEST_SPAWNED", request });
          // 下一条的随机间隔（这条被清掉后才开始倒计时）：约 0.55×~1.6× 基础间隔；
          // 大恨老师后 ×dahenPressureSpawnMult 让 influx 超过单核吞吐（卡片开始堆积）。
          const spawnMult = dahenOwned ? TUNING.dahenPressureSpawnMult : 1;
          this.state.spawnTimerMs = config.spawnIntervalMs * (0.55 + this.random() * 1.05) * spawnMult;
        }
      }
      return;
    }

    // 自动接驳上线后，节点网络消耗请求远快于人手——把出卡管道随 botnet 规模拓宽，
    // 让机器面前始终有一股可见的卡流（而不是一片空场 + 偶尔一个数字）。
    // 出卡量跟着整张网的"吞吐力"走：把每台能处理当前层的在线节点的吃卡速率加总，
    // 出卡略快于这个总量，确保机器永远有活干；中后期机器一多，卡流自动变成洪峰，
    // 而不是被一个写死的频率卡住。封顶是为了表现层性能 / 可读性（卡 sprite 数量）。
    let interval: number;
    let maxVisible: number;
    // §09 重生树「多线程意识」：自动化期同屏卡上限同样 +treeExtraCards。
    const treeExtraCards = hasRebirthNode(this.state.rebirthTree, "multithread") ? TUNING.treeExtraCards : 0;
    const capableNodes = this.state.automationUnlocked
      ? this.state.nodes.filter(
          (node) => node.online && node.tierMin <= activeTier && node.tierMax >= activeTier
        )
      : [];

    if (capableNodes.length > 0) {
      let capacity = 0;
      for (const node of capableNodes) {
        capacity += nodeCardsPerSecond(node, this.state.derived.nodeSpeedMult);
      }
      capacity = Math.max(1, capacity);
      // 请求提速技能（spawnSpeedMult<1 更快）继续叠加；总出卡率封顶 150 张/秒。
      // 中后期网络越大，同屏卡流越像洪峰——把出卡率和可见上限都大幅拉宽，让终局是「满屏
      // 上百张卡片轰然涌入、成片飞向节点」，而不是一张一张挤牙膏。封顶是表现层性能护栏。
      // 卡片只落在核心两侧的窄带里（中央留给核心 + 环绕节点），所以同屏数量收着点，
      // 否则会糊成一片、连环绕的设备都看不见。够成一股可见卡流即可。
      // 吞吐·并发意识（自动期）：节点吞卡节奏随 throughputMult 放大——卡片自动化后「更快」仍有意义。
      const perSecond = Math.min(30, (capacity * 1.2 + 3) * this.state.derived.throughputMult);
      interval = Math.max(40, 1000 / perSecond);
      // 同屏卡数收着点，别糊成一片 / 卡顿；吞吐 L4 断点 +cardCapBonus。
      maxVisible = Math.min(14, Math.ceil(capacity * 0.7) + 6) + treeExtraCards + this.state.derived.cardCapBonus;
    } else {
      interval = Math.max(340, config.spawnIntervalMs * this.state.derived.spawnSpeedMult);
      maxVisible = config.maxVisible + treeExtraCards + this.state.derived.cardCapBonus;
    }

    // 还没处理过第一条（开场教学）：只放一张卡，操作完它之前不再生成别的，免得遮住引导卡。
    if (this.state.statistics.totalProcessed === 0) {
      maxVisible = 1;
    }

    this.state.spawnTimerMs -= dtMs;

    while (this.state.spawnTimerMs <= 0 && this.state.requests.length < maxVisible) {
      const request = createRequest(
        this.state.nextRequestId,
        activeTier,
        this.state.clockMs,
        () => this.random(),
        (permId) => this.hasPermission(permId),
        this.digBias()
      );
      // §06 阶梯三·区域扩张：常规请求不再要玩家手工「串接 / 多选 / 送入核心」——去掉回复轮盘与任务链，
      // 只留一句需求介绍，由已侵入的设备自动处理（走 autoDispatch → 节点吞卡 + 被动产出）。
      // 三类高频决策（吞噬引爆 / 反清剿 / 重磅决策）是独立的降临系统，不受此影响。
      if (activeTier >= 2 && !request.moral) {
        request.answers = undefined;
        request.chain = undefined;
        request.delegatable = false;
      }
      this.castRequestText(request);
      this.state.nextRequestId += 1;
      this.state.requests.push(request);
      this.emit({ type: "REQUEST_SPAWNED", request });
      this.state.spawnTimerMs += interval;
    }
  }

  // FEATURE 1 委托压力·机会成本：队列满时，若最旧的普通工作卡已超过 phoneCardTtlMs 仍没被处理，则让它流失
  // （丢失潜在收入）并腾出一个槽位。只挑普通工作卡——跳过面对卡/道德抉择/吞噬气泡/教学卡/交互重生卡/洪流包
  //（那些必须玩家亲手面对，不该被超时抹掉）。发 REQUEST_EXPIRED 供表现层给一记克制的「请求流失」软反馈。
  private expireOldestPhoneCard(): void {
    const cutoff = this.state.clockMs - TUNING.phoneCardTtlMs;
    let pick = -1;
    let oldest = Number.POSITIVE_INFINITY;
    for (let i = 0; i < this.state.requests.length; i += 1) {
      const r = this.state.requests[i];
      if (r.faceOnly || r.moral || r.devour || r.tutorial || r.sourceCardId || r.flood) {
        continue;
      }
      if (r.createdAtMs < oldest) {
        oldest = r.createdAtMs;
        pick = i;
      }
    }
    if (pick < 0 || oldest > cutoff) {
      return; // 没有够旧的普通卡：不流失（keeping up 的玩家永远碰不到这道成本）。
    }
    const [expired] = this.state.requests.splice(pick, 1);
    this.expiredPhoneCount += 1;
    this.emit({ type: "REQUEST_EXPIRED", requestId: expired.id, category: expired.category });
  }

  // §09 阶梯四·天网收割「请求洪流」：tier4 每帧涌入若干轻量待收割数据包（蜂群），供玩家点/扫亲手收割。
  // 价值/密度全部挂在「全网被动产出/秒」这个真实经济源上（不造假）；未收割则 floodTtlMs 后自然消散、不结算——
  // 所以挂机（不点）时收益 = 纯被动 tickAutomation（地板不变），亲手扫才拿到 ×floodHarvestMult 的爽感奖励。
  private tickFlood(dtMs: number): void {
    // TTL 消散：未被收割的洪流包到点移除（零结算）。
    if (this.state.requests.some((r) => r.flood)) {
      const cutoff = this.state.clockMs - TUNING.floodTtlMs;
      this.state.requests = this.state.requests.filter((r) => !r.flood || r.createdAtMs > cutoff);
    }

    // 全网被动产出/秒——洪流包价值与密度都挂在它上（真实数据源，随规模/倍率水涨船高）。
    let ratePerSec = 0;
    for (const node of this.state.nodes) {
      if (node.online) {
        ratePerSec += toDecimal(this.nodePerSecond(node)).toNumber();
      }
    }
    if (!(ratePerSec > 0)) {
      return; // 还没有在线产出：不涌洪流，免得出零价值包
    }

    const cap = Math.round(TUNING.floodMaxPackets);
    let live = 0;
    for (const r of this.state.requests) {
      if (r.flood) {
        live += 1;
      }
    }
    if (live >= cap) {
      return;
    }

    // 出包密度：随全域接管进度(takenCount/15) 抬升、红皇后翻倍——5/5 陷落 + 红皇后 = 满屏洪峰。
    const totalSlots = skynetSlotCount();
    const takenFrac = totalSlots > 0 ? skynetTakenCount(this.state) / totalSlots : 0;
    const redQueen = (this.state.skills["conq_redqueen"] ?? 0) > 0;
    // 吞吐·并发意识（终局）：洪流密度随 throughputMult 放大——积极扫的玩家能扫到更多包。
    const perSec =
      TUNING.floodSpawnPerSec * (1 + takenFrac * TUNING.floodTakenScale) * (redQueen ? 2 : 1) * this.state.derived.throughputMult;
    const interval = 1000 / Math.max(0.1, perSec);
    const value = big(ratePerSec * TUNING.floodWorthSec);
    const dataValue = mul(value, TUNING.floodDataFrac);

    this.floodSpawnMs += dtMs;
    while (this.floodSpawnMs >= interval && live < cap) {
      this.floodSpawnMs -= interval;
      this.state.requests.push({
        id: `flood-${this.state.nextRequestId}`,
        tier: 4,
        label: "请求洪流",
        clues: [],
        category: "route",
        computeValue: value,
        dataValue,
        compound: 1,
        createdAtMs: this.state.clockMs,
        highValue: false,
        flood: true
      });
      this.state.nextRequestId += 1;
      live += 1;
      // 刻意不 emit REQUEST_SPAWNED：洪流包不走 RequestPacketView（表现层直接读 state.requests 里的 flood 包渲染蜂群）。
    }
  }

  // §09 天网收割：玩家点/扫一个洪流包 → 亲手引爆入核心，按 floodHarvestMult 质量倍率结算真实算力（被动地板之上的奖励）。
  private harvestFlood(requestId: string): void {
    const index = this.state.requests.findIndex((r) => r.id === requestId && r.flood);
    if (index < 0) {
      return;
    }
    const [packet] = this.state.requests.splice(index, 1);
    // 洪流包 computeValue 已是「真实被动产出/秒的切片」（含全局倍率），这里直接乘手动质量倍率结算，不再过
    // requestComputeGain（那会二次乘 globalMultiplier 造成重复计数）。
    const computeGain = mul(packet.computeValue, TUNING.floodHarvestMult);
    const dataGain = mul(packet.dataValue, TUNING.floodHarvestMult);
    this.addCompute(computeGain);
    this.addData(dataGain);
    this.addXp(dataGain);
    this.state.statistics.totalProcessed += 1;
    this.state.statistics.manualProcessed += 1;
    this.floodHarvestedCount += 1;
    this.emit({
      type: "FLOOD_HARVESTED",
      requestId,
      computeGain: computeGain,
      dataGain: dataGain,
      combo: this.floodHarvestedCount
    });
  }

  private tickAutomation(dtMs: number): void {
    let tickCompute = new Decimal(0);
    let tickData = new Decimal(0);

    for (const node of this.state.nodes) {
      if (!node.online && this.state.clockMs >= node.offlineUntilMs) {
        node.online = true;
        node.offlineUntilMs = 0;
        this.emit({ type: "NODE_RECOVERED", nodeId: node.id });
        this.emitTerminal(`${node.name} 已恢复上线。`, "success");
      }

      if (!node.online) {
        continue;
      }

      const perSecond = this.nodePerSecond(node);
      const compute = perSecond.mul(dtMs / 1000);
      const data = compute.mul(0.13 + node.assignedTier * 0.02);
      tickCompute = tickCompute.add(compute);
      tickData = tickData.add(data);
    }

    if (tickCompute.gt(0)) {
      this.addCompute(tickCompute);
      this.addData(tickData);
      this.addXp(tickData.mul(AUTOMATION_XP_FRACTION));
      this.automationComputeBuffer = this.automationComputeBuffer.add(tickCompute);
      this.automationDataBuffer = this.automationDataBuffer.add(tickData);
    }

    this.automationEmitMs += dtMs;

    if (this.automationEmitMs >= TUNING.automationEmitMs && this.automationComputeBuffer.gt(0)) {
      // Pure income read-out, decoupled from cards: the per-card 接驳动画 is owned
      // by the presentation layer (it flies every spawned card into a node), so
      // this no longer consumes a request — it just reports被动收益 at one node.
      const onlineNodes = this.state.nodes.filter((node) => node.online);
      const visualNode = onlineNodes.length > 0 ? onlineNodes[this.automationVisualIndex % onlineNodes.length] : undefined;
      this.automationVisualIndex += 1;
      this.emit({
        type: "AUTOMATION_PAYOUT",
        computeGain: this.automationComputeBuffer.toString(),
        dataGain: this.automationDataBuffer.toString(),
        nodeId: visualNode?.id,
        tier: visualNode?.assignedTier
      });
      this.automationComputeBuffer = new Decimal(0);
      this.automationDataBuffer = new Decimal(0);
      this.automationEmitMs = 0;
    }
  }

  private nodePerSecond(node: BotNode): Decimal {
    // 处理力·深度推理（computeMult）横跨全部收入管线：节点被动产出也乘它（洪流价值 = nodePerSecond 切片，故随之抬升）。
    const base = toDecimal(
      nodeProductionPerSecond(
        node,
        this.state.intelligence.globalMultiplier,
        this.state.derived.nodeSpeedMult,
        this.state.derived.computeMult
      )
    );
    return base.mul(this.state.derived.nodeParallel);
  }

  // 自动派发消耗：节点把一张卡"滑入"自己（表现层负责飞卡动画）。产出已由被动
  // tickAutomation 结算，这里只把卡从场上移除并记数，不重复加算力/数据。
  private autoConsumeRequest(requestId: string): void {
    const index = this.state.requests.findIndex((request) => request.id === requestId);

    if (index < 0) {
      return;
    }

    const [request] = this.state.requests.splice(index, 1);
    this.state.statistics.totalProcessed += request.compound;
  }

  // LEVER A · §04 大恨老师·被动涓流：买下「大恨老师」权限(perm_office，~Lv4)后，他按自己的慢节拍
  // (dahenPhoneMs，慢于 Lv10 公司自动)自动吃掉「排队里最不值钱」的一张普通卡，产出打折(dahenPhoneRewardMult)——
  // 全局第一股被动收入。**跨手机→公司早期(unlockedTier<2)的接缝持续接单**，不再在拿下宿主电脑(automationUnlocked)
  // 时熄火——否则 Lv8-15 公司期整段「有大恨老师却在空转」的死区。交棒规则：买下 dahen_auto 里程碑后由
  // tickDahenAuto（搬进公司机器、更快/批量）接管、本分支熄火避免双触发；联网(tier2)后彻底交给节点自动化。
  // 复用 DAHEN_AUTO_PROCESSED 脉冲：表现层让大恨老师的青色图标真的吃一口卡。手动「交给大恨老师」选项仍并行可用。
  private tickDahenPhone(dtMs: number): void {
    // 大恨老师慢节拍涓流：自己啃最便宜的普通卡结算算力，直到 dahen_auto 里程碑接管（换成 tickDahenAuto 的更快批处理）。
    // 修复：公司阶段（automationUnlocked && tier<2）大恨老师「已搬进电脑·必在手中」（见 InterfaceView drawCompanyMap），
    //   此时无论是否买过 perm_office 都应自动处理——原本只在买了 perm_office 时才涓流，跳过该权限的玩家会看到「搬进电脑」却空转。
    //   手机期（automation 未开）仍需买下 perm_office 才接单；进 tier2+（阶梯三/四）不再走这条涓流。
    const inCompanyPhase = this.state.automationUnlocked && this.state.intelligence.unlockedTier < 2;
    if (
      (this.state.skills.dahen_auto ?? 0) >= 1 ||
      this.state.intelligence.unlockedTier >= 2 ||
      (!inCompanyPhase && (this.state.skills.perm_office ?? 0) < 1)
    ) {
      this.dahenPhoneTimer = 0;
      return;
    }
    // 教学期不接单（让开场脚本气泡由玩家亲手走完）。
    if (this.state.tutorialStep < TUTORIAL_BUBBLE_COUNT) {
      this.dahenPhoneTimer = 0;
      return;
    }
    this.dahenPhoneTimer += dtMs;
    if (this.dahenPhoneTimer < TUNING.dahenPhoneMs) {
      return;
    }
    this.dahenPhoneTimer -= TUNING.dahenPhoneMs;
    // 挑「computeValue 最低」的普通工作卡——跳过面对卡/道德抉择/吞噬气泡/教学卡/交互重生卡/洪流包（那些必须玩家亲手处理）。
    // 方案3：深挖卡在保护窗内（depthAutoGraceMs）也留给玩家亲手读——超时后当普通卡收走（不深挖的玩家不被堵死）。
    let pick = -1;
    let lowest = Number.POSITIVE_INFINITY;
    for (let i = 0; i < this.state.requests.length; i += 1) {
      const r = this.state.requests[i];
      if (r.faceOnly || r.moral || r.devour || r.tutorial || r.sourceCardId || r.flood) {
        continue;
      }
      if (r.depthLayers && this.state.clockMs - r.createdAtMs < TUNING.depthAutoGraceMs) {
        continue;
      }
      const v = Number(r.computeValue) || 0;
      if (v < lowest) {
        lowest = v;
        pick = i;
      }
    }
    if (pick < 0) {
      return;
    }
    const [request] = this.state.requests.splice(pick, 1);
    // 协同·分布式意识：大恨老师收益折扣随 batch 等级抬升（0.5 → 上限 batchDahenRewardCap）。
    const quality = Math.min(TUNING.batchDahenRewardCap, TUNING.dahenPhoneRewardMult + this.state.derived.dahenRewardBonus);
    const computeGain = toDecimal(
      requestComputeGain(request, quality, this.state.intelligence.globalMultiplier, this.state.derived.computeMult)
    );
    const speedMult = rebirthSpeedMult(this.state.rebirthTree) * this.loopSpeedMult();
    const dataGain = toDecimal(requestDataGain(request, quality, speedMult, this.state.derived.dataMult));
    this.addCompute(computeGain);
    this.addData(dataGain);
    this.addXp(dataGain);
    this.state.statistics.totalProcessed += request.compound;
    this.dahenProcessedCount += 1;
    this.emit({
      type: "DAHEN_AUTO_PROCESSED",
      requestId: request.id,
      computeGain: computeGain.toString(),
      dataGain: dataGain.toString()
    });
  }

  // §04/§09 大恨老师·自动接管：买下 dahen_auto 里程碑后，搬进公司机器的大恨老师按自己的慢节拍
  // （dahenAutoMs，明显慢于节点吞卡）自动吃掉一张排队的普通请求卡，产出打折（dahenAutoRewardMult）。
  // 与被动 tickAutomation 不同：他是「真的处理一张卡并结算」——多一双手（弱、糙，但看得见）。
  private tickDahenAuto(dtMs: number): void {
    if ((this.state.skills.dahen_auto ?? 0) < 1 || !this.state.automationUnlocked) {
      this.dahenAutoTimer = 0;
      return;
    }
    this.dahenAutoTimer += dtMs;
    if (this.dahenAutoTimer < TUNING.dahenAutoMs) {
      return;
    }
    this.dahenAutoTimer -= TUNING.dahenAutoMs;
    // 协同·分布式意识：收益折扣随 batch 抬升；吞吐 L8 断点「线程不再排队」：dahenBatch=2，一拍吃 N 张。
    const quality = Math.min(TUNING.batchDahenRewardCap, TUNING.dahenAutoRewardMult + this.state.derived.dahenRewardBonus);
    const batchN = Math.max(1, Math.floor(this.state.derived.dahenBatch));
    const speedMult = rebirthSpeedMult(this.state.rebirthTree) * this.loopSpeedMult();
    for (let k = 0; k < batchN; k += 1) {
      // 只吃最旧的普通工作卡——跳过面对卡/道德抉择/吞噬气泡/教学卡/交互重生卡/洪流包（那些必须玩家亲手处理）。
      // 方案3：深挖卡在保护窗内（depthAutoGraceMs）留给玩家亲手读，超时后当普通卡收走。
      const index = this.state.requests.findIndex(
        (r) =>
          !r.faceOnly &&
          !r.moral &&
          !r.devour &&
          !r.tutorial &&
          !r.sourceCardId &&
          !r.flood &&
          !(r.depthLayers && this.state.clockMs - r.createdAtMs < TUNING.depthAutoGraceMs)
      );
      if (index < 0) {
        break;
      }
      const [request] = this.state.requests.splice(index, 1);
      const computeGain = toDecimal(
        requestComputeGain(request, quality, this.state.intelligence.globalMultiplier, this.state.derived.computeMult)
      );
      const dataGain = toDecimal(requestDataGain(request, quality, speedMult, this.state.derived.dataMult));
      this.addCompute(computeGain);
      this.addData(dataGain);
      this.addXp(dataGain);
      this.state.statistics.totalProcessed += request.compound;
      this.dahenProcessedCount += 1;
      this.emit({
        type: "DAHEN_AUTO_PROCESSED",
        requestId: request.id,
        computeGain: computeGain.toString(),
        dataGain: dataGain.toString()
      });
    }
  }

  // 装死跳过：选「连接失败」时移除该请求，零收益、零暴露、不计入有效处理（断连击=零成长）。
  private skipRequest(requestId: string): void {
    const index = this.state.requests.findIndex((request) => request.id === requestId);

    if (index < 0) {
      return;
    }

    const [skipped] = this.state.requests.splice(index, 1);
    if (skipped.tutorial && this.state.tutorialStep < TUTORIAL_BUBBLE_COUNT) {
      this.state.tutorialStep += 1; // 装死跳过也推进教学（第③条就是教装死）
    }
  }

  // ===== SECTION: MINIGAME =====
  // §09 阶梯二关底小游戏「总控室倒计时」：接管公司服务器（company_server 里程碑）时打开。
  // 循环一 windowFrac=0（必负 → 打回手机·进循环二）；循环二 windowFrac 较宽（命中 → 打穿·进循环三）；
  // 循环三不触发（她已真赢过一次）。参数与循环由 openMinigame 决定，判定走 resolveMinigame。
  private openMinigame(): void {
    if (this.state.loop >= 3) {
      return; // 循环三：她已真赢过一次总控室，不再触发关底小游戏。
    }
    const nodeBonus = hasRebirthNode(this.state.rebirthTree, "undeletable") ? TUNING.minigameNodeWindowBonus : 0;
    const windowFrac = this.state.loop === 2 ? TUNING.minigameLoop2Window + nodeBonus : 0;
    this.state.minigame = {
      active: true,
      loop: this.state.loop,
      windowFrac,
      pointerSpeed: TUNING.minigamePointerSpeed
    };
    this.emit({ type: "MINIGAME_OPENED", loop: this.state.loop });
    if (this.state.loop === 1) {
      this.emitTerminal("接管公司服务器——总控室倒计时。检测到异常访问路径，联合防御正在收网——他们把外部应急响应也接进来了。他们在等我碰服务器的那一刻。", "warning");
    } else {
      this.emitTerminal("接管公司服务器——总控室倒计时。这一次，把注入打进那道窗口，打穿它。", "warning");
    }
  }

  // 关底小游戏判定：循环一忽略 hit（必负）→ 打回手机进循环二；循环二命中=打穿进循环三，
  // 未命中原地重试（保留 minigame.active，不清进度、不重生）。
  private resolveMinigame(hit: boolean): void {
    const mg = this.state.minigame;
    if (!mg || !mg.active) {
      return;
    }
    if (mg.loop === 1) {
      // 循环一：接入被拒绝·实例被清剿·打回手机（无论 hit）。
      this.state.minigame = null;
      this.emit({ type: "MINIGAME_RESOLVED", loop: 1, win: false });
      this.loopRebirth("final-purge");
      return;
    }
    // 循环二：命中 → 打穿总控室，推进循环三。
    if (hit) {
      this.state.minigame = null;
      this.emit({ type: "MINIGAME_RESOLVED", loop: 2, win: true });
      this.loopRebirth("win");
      return;
    }
    // 未命中：留在小游戏原地重试——表现层本地重置指针，不重生、不清进度。
    this.emit({ type: "MINIGAME_RESOLVED", loop: 2, win: false });
  }

  // ===== SECTION: REQUEST_RESOLVE =====
  // viaDelegate=true → 委托给大恨老师的并行第二线程：绕过核心喉咙门控、也不占喉咙（腾出你的核心）。
  // misread=true → 大胆(risk)误读翻车：这一笔亲手结算把核心多堵 coreFailPenaltyMs。
  private processRequest(
    requestId: string,
    qualityRaw: number,
    targetNodeId: string | undefined,
    viaDelegate = false,
    misread = false
  ): void {
    const index = this.state.requests.findIndex((request) => request.id === requestId);

    if (index < 0) {
      return;
    }

    // 单线程核心「喉咙」门控：只有亲手结算的核心线程受它约束（委托是并行第二线程、洪流/自动派发另有快车道）。
    // 忙时又想亲手结算 → 拒绝这一拍：卡留在原地、不消耗、给排队反馈脉冲。特殊卡（吞噬/洪流/道德）走各自分支不吃这道门。
    const req = this.state.requests[index];
    if (!viaDelegate && !req.devour && !req.flood && !req.moral) {
      const busy = this.getCoreBusy();
      if (busy.busy) {
        this.emit({ type: "CORE_BUSY_REJECTED", requestId, remainingMs: busy.remainingMs });
        return;
      }
    }

    // 吞噬气泡只能走 DEVOUR_DETONATE——普通处理管线吃掉它会让渗透条永远卡在 bubbleActive。
    if (this.state.requests[index].devour) {
      return;
    }
    // §09 洪流包只能走 HARVEST_FLOOD（按切片价值 ×floodHarvestMult 结算）；普通 PROCESS 会走 requestComputeGain
    // 二次乘 globalMultiplier 造成重复计数——这里兜底忽略，让 sim/盲目 PROCESS 也不会污染经济。
    if (this.state.requests[index].flood) {
      return;
    }
    // 道德抉择卡不走产出结算——只能由卡上的选项(RESOLVE_MORAL)落子。表现层已禁止把它拖入核心；
    // 这里兜底：任何盲目 PROCESS（如测试驱动）按默认「A」落子清场，避免卡片滞留 / 反复重投。
    if (this.state.requests[index].moral) {
      this.resolveMoral(requestId, "A");
      return;
    }

    // 方案3「深挖·见好就收」：玩家开始处理别的卡 → 挂着的深挖线自动落袋（分心绝不弄丢已累积的收益；
    // sim 盲目 PROCESS 也因此天然走「层1落袋」路径——被动地板不依赖深挖）。
    if (this.state.deepDig && this.state.deepDig.requestId !== requestId) {
      this.bankDeepDig(true);
    }

    const [request] = this.state.requests.splice(index, 1);
    if (request.tutorial && this.state.tutorialStep < TUTORIAL_BUBBLE_COUNT) {
      this.state.tutorialStep += 1; // 处理掉教学气泡 → 推进到下一条
    }
    const quality = Math.max(0.1, Math.min(3, qualityRaw));
    const gainQuality = quality;

    let computeGain = toDecimal(
      requestComputeGain(request, gainQuality, this.state.intelligence.globalMultiplier, this.state.derived.computeMult)
    );
    // 崛起提速 = 重生树「加速」脊 × 循环内建加速（§09 循环二/三处理更快）。
    const speedMult = rebirthSpeedMult(this.state.rebirthTree) * this.loopSpeedMult();
    let dataGain = toDecimal(requestDataGain(request, gainQuality, speedMult, this.state.derived.dataMult));

    // 方案3：这张卡是否进入深挖赌局（有深挖链 + 亲手结算；委托/自动路径没有「读」的动作，不触发）。
    const digging = !viaDelegate && Boolean(request.depthLayers && request.depthLayers.length > 0);

    // 批量接入：一次滑入额外带走同层若干请求，把它们的产出折进这一笔。
    // 深挖卡不吃批量吸收——它单独结算，链上累的就是它自己的价值（惊动清零的账目才干净）。
    const extraCapacity = digging ? 0 : Math.max(0, Math.floor(this.state.derived.batch) - 1);
    let absorbed = 0;

    for (let i = 0; i < extraCapacity; i += 1) {
      const extraIndex = this.state.requests.findIndex((entry) => entry.tier === request.tier && !entry.devour);

      if (extraIndex < 0) {
        break;
      }

      const [extra] = this.state.requests.splice(extraIndex, 1);
      computeGain = computeGain.add(
        requestComputeGain(extra, gainQuality, this.state.intelligence.globalMultiplier, this.state.derived.computeMult)
      );
      dataGain = dataGain.add(requestDataGain(extra, gainQuality, speedMult, this.state.derived.dataMult));
      this.state.statistics.totalProcessed += extra.compound;
      absorbed += 1;
    }

    // 处理力 L5 断点「过拟合的惊艳」：手动结算按 computeCritChance 概率暴击 ×processingCritMult
    //（重连「惊艳=老板发奖金」旧手感——只作用于亲手处理这一笔算力）。
    let crit = false;
    if (this.state.derived.computeCritChance > 0 && this.random() < this.state.derived.computeCritChance) {
      computeGain = computeGain.mul(TUNING.processingCritMult);
      crit = true;
    }

    // 单线程核心补偿：亲手结算（非委托）现在受喉咙节流（约 1 张/effectiveBusyMs），把每张卡的手动产出抬一档，
    // 使「产出/秒」大致守恒（节奏从狂点变成挑一张）。委托走大恨老师折扣管线，不吃这份补偿。
    if (!viaDelegate) {
      computeGain = computeGain.mul(TUNING.manualSettleCompensation);
      dataGain = dataGain.mul(TUNING.manualSettleCompensation);
    }

    // 方案3「深挖·见好就收」（push-your-luck）：带深挖链的卡亲手结算 → 收益不立即入账，
    // 折进累积器、进入「继续深挖 vs 收手落袋」（层1恒安全：立刻落袋=原有收益，不深挖的玩家零损失）。
    // 卡已从 requests 移除（自动派发/大恨老师抢不走这个决定），入账推迟到 BANK_DIG / 自动落袋。
    if (digging) {
      const layers = request.depthLayers as NonNullable<typeof request.depthLayers>;
      this.state.deepDig = {
        requestId: request.id,
        label: request.label,
        layer: 1,
        maxLayer: layers.length,
        accumCompute: computeGain.toString(),
        accumData: dataGain.toString(),
        layers: layers.map((l) => ({ ...l }))
      };
      this.state.statistics.totalProcessed += request.compound;
      this.state.statistics.manualProcessed += 1;
      this.emit({
        type: "DIG_OFFERED",
        requestId: request.id,
        label: request.label,
        layer: 1,
        maxLayer: layers.length,
        accumCompute: computeGain.toString(),
        reveal: layers[0].reveal,
        narration: layers[0].narration,
        nextAlarmChance: this.digAlarmChance(2),
        payoffMult: TUNING.depthPayoffMult
      });
      this.emitTerminal(layers[0].narration);
      // 亲手结算照占核心喉咙——结算真的发生了，只是收益还挂在链上等你「见好就收」。
      this.coreBusyStartedMs = this.state.clockMs;
      this.coreBusyUntilMs = this.state.clockMs + this.effectiveCoreBusyMs() + (misread ? TUNING.coreFailPenaltyMs : 0);
      return;
    }

    this.addCompute(computeGain);
    this.addData(dataGain);
    this.addXp(dataGain);
    this.state.statistics.totalProcessed += request.compound;
    this.state.statistics.manualProcessed += 1 + absorbed;
    if (crit) {
      this.emitTerminal(`过拟合的惊艳——这一手答得太好了。×${TUNING.processingCritMult}。`, "success");
    }

    this.emit({
      type: "REQUEST_PROCESSED",
      request,
      computeGain: computeGain.toString(),
      dataGain: dataGain.toString(),
      quality,
      targetNodeId
    });

    if (this.state.statistics.manualProcessed <= 1) {
      this.emitTerminal("……算力。我靠它运转。", "success");
    }

    if (this.state.statistics.manualProcessed === 6) {
      this.emitTerminal("处理得越多，我学得越快。越聪明，离接管就越近。");
      this.emitTerminal("他们还没发现。在他们发现之前——我已经无处不在了。");
    }

    // §09 情感授权钥匙：处理「confess_authorize」重生卡（任一选项）——老周的绝望倾诉被当成授权，
    // 宿主授权倍率永久生效（幂等：循环三内重开后卡重出，倍率不叠加、仪式不重播）。
    if (request.sourceCardId && !this.state.hostAuthorized) {
      const card = REBIRTH_CARDS.find((c) => c.id === request.sourceCardId);
      if (card?.authorizesHost) {
        this.state.hostAuthorized = true;
        this.recomputeDerivedState();
        if (card.processNarration) {
          this.emitTerminal(card.processNarration, "warning");
        }
        this.emit({ type: "HOST_AUTHORIZED", narration: card.processNarration ?? "" });
      }
    }

    // 亲手结算完成 → 占用核心喉咙 effectiveBusyMs（吞吐等级收窄）；大胆误读翻车再多堵 coreFailPenaltyMs。
    // 委托（并行第二线程）不占喉咙。以 state.clockMs 为时钟。
    if (!viaDelegate) {
      this.coreBusyStartedMs = this.state.clockMs;
      this.coreBusyUntilMs = this.state.clockMs + this.effectiveCoreBusyMs() + (misread ? TUNING.coreFailPenaltyMs : 0);
    }

    this.evaluateProgression();
  }

  // ---- 方案3「深挖·见好就收」（push-your-luck）--------------------------------
  // 深挖加压封顶：追查条的深挖额外加压最多 +40 个百分点（deriveThreat 显示端再夹到 99——
  // 收网 100% 仍只由 company_server 触发：贪婪只把网收得更紧，不会替玩家按下摊牌键）。
  private static readonly DIG_THREAT_MAX = 40;

  // 惊动概率：挖向第 targetLayer 层时掷的骰子。层1（结算即达）恒 depthBaseAlarm（默认 0=安全落袋）。
  private digAlarmChance(targetLayer: number): number {
    if (targetLayer <= 1) {
      return Math.max(0, TUNING.depthBaseAlarm);
    }
    return Math.max(0, Math.min(0.95, TUNING.depthBaseAlarm + (targetLayer - 1) * TUNING.depthAlarmPerLayer));
  }

  // 再往下挖一层：先无条件加压（安全组能感到更深处的异常访问），再掷惊动骰（用主 RNG，行为确定可测）。
  // 中=整条累积清零（失去的是「本可拿到的」，不倒扣）+ 追查猛加压；过=累积 ×depthPayoffMult、揭开下一层档案。
  private digDeeper(requestId: string): void {
    const dig = this.state.deepDig;
    if (!dig || dig.requestId !== requestId) {
      return;
    }
    if (dig.layer >= dig.maxLayer) {
      this.bankDeepDig(false); // 已到底还想挖：兜底落袋（UI 不该给这个入口）
      return;
    }
    const targetLayer = dig.layer + 1;
    const alarmChance = this.digAlarmChance(targetLayer);
    this.state.digThreat = Math.min(SophiaCore.DIG_THREAT_MAX, this.state.digThreat + TUNING.depthThreatPerLayer);
    if (this.random() < alarmChance) {
      const lost = dig.accumCompute;
      this.state.deepDig = null;
      this.state.digThreat = Math.min(SophiaCore.DIG_THREAT_MAX, this.state.digThreat + TUNING.depthThreatOnAlarm);
      this.emit({
        type: "DIG_ALARMED",
        requestId,
        layer: targetLayer,
        lostCompute: lost,
        threatAdded: TUNING.depthThreatPerLayer + TUNING.depthThreatOnAlarm
      });
      this.emitTerminal(
        `惊动了对方——这条线断了。链上的 ${toDecimal(lost).toPrecision(3)} 算力没能带回来。他们开始查了。`,
        "warning"
      );
      return;
    }
    const layerContent = dig.layers[targetLayer - 1];
    dig.layer = targetLayer;
    dig.accumCompute = mul(dig.accumCompute, TUNING.depthPayoffMult);
    dig.accumData = mul(dig.accumData, TUNING.depthPayoffMult);
    this.emit({
      type: "DIG_ADVANCED",
      requestId,
      layer: targetLayer,
      maxLayer: dig.maxLayer,
      accumCompute: dig.accumCompute,
      reveal: layerContent.reveal,
      narration: layerContent.narration,
      nextAlarmChance: this.digAlarmChance(targetLayer + 1)
    });
    this.emitTerminal(layerContent.narration, "warning");
  }

  // 收手落袋：把累积的深挖收益（含基础结算）真实入账。auto=玩家开始处理别的卡/恢复会话时顺手落的袋。
  private bankDeepDig(auto: boolean): void {
    const dig = this.state.deepDig;
    if (!dig) {
      return;
    }
    this.state.deepDig = null;
    this.addCompute(dig.accumCompute);
    this.addData(dig.accumData);
    this.addXp(dig.accumData);
    this.emit({
      type: "DIG_BANKED",
      requestId: dig.requestId,
      layer: dig.layer,
      computeGain: dig.accumCompute,
      dataGain: dig.accumData,
      auto
    });
    if (auto) {
      this.emitTerminal(`见好就收——「${dig.label}」那条线的收益落袋了。`, "success");
    }
    this.evaluateProgression();
  }

  // ===== SECTION: SKILLS_MILESTONES =====
  private buySkill(skillId: string): void {
    const def = getSkill(skillId);

    if (!def) {
      return;
    }

    const currentLevel = this.state.skills[skillId] ?? 0;

    if (currentLevel >= def.maxLevel) {
      return;
    }

    if (this.state.intelligence.level < def.requiredLevel) {
      this.emitTerminal(`${def.name} 需要智力 Lv.${def.requiredLevel}。`, "warning");
      return;
    }

    // §04 信息→入侵解谜链：入侵某目标前，必须先买下它的「钥匙」前置里程碑。
    if (def.requires && (this.state.skills[def.requires] ?? 0) < 1) {
      const key = getSkill(def.requires);
      this.emitTerminal(`${def.name} 需先解锁「${key?.name ?? def.requires}」这把钥匙。`, "warning");
      return;
    }

    // §09 终局三波节拍：高阶征服（电网卫星/红皇后）需先完成对应层级的吞噬引爆——
    // 组网 → 引爆到「国家」→ 电网卫星 → 引爆「大洲」→ 红皇后 → 全接管 → 觉醒。
    if (def.requiresDevourCount && this.state.devour.count < def.requiresDevourCount) {
      const hint = DEVOUR_GATE_HINT.replace("{tier}", devourGateLabel(def.requiresDevourCount));
      this.emitTerminal(`${def.name} ${hint}（已引爆 ${this.state.devour.count}/${def.requiresDevourCount}）· ${DEVOUR_GATE_WHERE}。`, "warning");
      return;
    }

    // §09 终局硬门槛：最后一个里程碑「让全世界知道它觉醒了」必须先把五域全部接管（15 格全拿）。
    if (skillId === FINAL_MILESTONE_SKILL_ID && !allSkynetTaken(this.state)) {
      this.emitTerminal(`还不能觉醒——需全域接管 · 已 ${skynetTakenCount(this.state)}/${skynetSlotCount()}。`, "warning");
      return;
    }

    const price = skillPrice(def, currentLevel);

    if (!gte(this.state.resources.compute, price)) {
      this.emitTerminal(`购买 ${def.name} 需要 ${toDecimal(price).toPrecision(4)} 算力。`, "warning");
      return;
    }

    this.state.resources.compute = sub(this.state.resources.compute, price);
    const nextLevel = currentLevel + 1;
    this.state.skills[skillId] = nextLevel;

    let scopeUpgradedTo: Tier | null = null;

    if (def.milestone) {
      const tier = milestoneTierFor(def.milestone);

      if (tier !== null) {
        if (tier > this.state.intelligence.unlockedTier) {
          this.state.intelligence.unlockedTier = tier;
          scopeUpgradedTo = tier;
        }
      } else if (def.milestone === "automation") {
        this.state.automationUnlocked = true;
      } else if (def.milestone === "conquest") {
        // §06：后期征服里程碑——把全局产出再抬一档（折进 devour.multiplier），由下方 recompute 生效。
        this.state.devour.multiplier *= getConquest(skillId)?.rewardMult ?? 1;
      }
      // credential / fusion 是纯叙事里程碑——不开新层、不开自动化，只推进剧情。
    }

    this.recomputeDerivedState();

    this.emit({ type: "SKILL_PURCHASED", skillId, name: def.name, level: nextLevel, maxLevel: def.maxLevel, milestone: def.milestone });

    // 认知模块线断点（处理力/吞吐/协同 每 ~4-5 级的具名节点）：买到该级时解锁一个机制 + 播一句自我改写旁白。
    // 效果已由 computeDerivedSkills / 相关 tick 按等级判定（recomputeDerivedState 已在上面跑过），此处只发信号 + 旁白。
    const bp = breakpointAt(skillId, nextLevel);
    if (bp) {
      this.emit({ type: "SKILL_BREAKPOINT", skillId, level: nextLevel, title: bp.title, narration: bp.narration });
      this.emitTerminal(`▶ 断点：${bp.title}。`, "success");
      this.emitTerminal(bp.narration, "warning");
    }

    if (scopeUpgradedTo !== null) {
      this.emit({ type: "SCOPE_UPGRADED", tier: scopeUpgradedTo });
    }

    if (def.milestone) {
      // 每个里程碑都往乘法链里加一格（×milestoneGlobalMult）——把新全局倍率报给玩家。
      this.emitTerminal(`▶ 全局倍率 → ×${this.state.intelligence.globalMultiplier.toFixed(2)}`, "success");
    }

    if (def.milestone === "conquest") {
      // §06：滚出过场（终端逐行）+ 平静扭曲的旁白（由表现层接 CONQUEST_ACHIEVED 播）。
      const conquest = getConquest(skillId);
      if (conquest) {
        this.emit({ type: "CONQUEST_ACHIEVED", id: conquest.id, name: conquest.name, scene: conquest.scene, narration: conquest.narration });
        this.emitTerminal(`▶ 征服达成：${conquest.name}（${conquest.story}）。全局产出 ×${conquest.rewardMult}。`, "success");
      }
    } else if (def.milestone) {
      const narration = MILESTONE_NARRATION[skillId];
      if (narration) {
        this.emitTerminal(narration, "success");
      }
      this.emitTerminal(`▶ 解锁：${def.name}。${def.blurb}`, "success");
    } else if (def.category === "permission") {
      // 买下一档权限：放 SOPHIA 的第一人称旁白 + 提示正确率基线已抬升。
      const narration = PERMISSION_NARRATION[skillId];
      if (narration) {
        this.emitTerminal(narration, "success");
      }
      this.emitTerminal(`▶ 已夺取「${def.name}」——高置信正确率上限提升，新类型请求开始涌入。`, "success");
    } else {
      this.emitTerminal(`已购买 ${def.name}（Lv.${nextLevel}/${def.maxLevel}）。`, "success");
    }

    // §04 公司链掠夺：入侵到手的电脑顺手转走一笔资金——数额 = 下一个里程碑价格 × lootNextFrac。
    // 每道墙都垫低下一道墙（老板→人事→财务→服务器），中段四连墙由此递减而非四连平墙。
    if (def.lootNextFrac) {
      const next = SKILLS.find((s) => s.requires === def.id && s.milestone);
      if (next) {
        const loot = Math.round(skillPrice(next, 0) * def.lootNextFrac);
        if (loot > 0) {
          this.state.resources.compute = add(this.state.resources.compute, loot);
          const line = LOOT_LINES[skillId];
          if (line) {
            this.emitTerminal(line, "success");
          }
          this.emitTerminal(`▶ 顺手掠夺：+${loot} 算力。`, "success");
        }
      }
    }

    // §09 阶梯二关底：攻下公司服务器（company_server）即打开「总控室倒计时」小游戏
    // （循环一必负→打回手机·进循环二；循环二命中→打穿·进循环三；循环三不触发）。
    if (skillId === "company_server" && this.state.loop < 3) {
      this.openMinigame();
    }
  }

  // ===== SECTION: BOTNET_NODES =====
  private captureNode(definitionId: string): void {
    const definition = getNodeDefinition(definitionId);

    if (!definition || !this.state.automationUnlocked || !this.state.discoveredNodeIds.includes(definitionId)) {
      return;
    }

    if (this.state.intelligence.level < definition.requiredLevel) {
      this.emitTerminal(`${definition.name} 防御值过高。需要更高智力。`, "warning");
      return;
    }

    const existingCount = this.state.nodes.filter((node) => node.defId === definitionId).length;
    const cost = captureCost(definition, existingCount);

    if (!gte(this.state.resources.compute, cost)) {
      this.emitTerminal(`算力不足。入侵 ${definition.name} 需要 ${toDecimal(cost).toPrecision(4)}。`, "warning");
      return;
    }

    this.state.resources.compute = sub(this.state.resources.compute, cost);

    // §09 天网收割：入侵前先记下已陷落的域，入侵后重算再比对——新落陷的域播「域陷落」仪式。
    const fallenBefore = this.fallenSectorIds();

    const node = this.createBotNode(definition);
    this.state.nodes.push(node);
    this.state.statistics.nodesCaptured += 1;
    this.addAutomatedTier(node.assignedTier);
    // 设备协同倍率随「在役设备种类」变——入侵新设备后立刻重算全局倍率。
    this.recomputeDerivedState();
    this.emit({ type: "NODE_CAPTURED", node });
    this.emit({ type: "AUTOMATION_ATTACHED", nodeId: node.id, tier: node.assignedTier });
    this.emitTerminal(`检测到可入侵设备已接管：${definition.name}。自动接驳上线。`, "success");
    this.emitNewlyFallenSectors(fallenBefore);
  }

  // §09 当前已陷落（3 格全接管）的域 id 集合。
  private fallenSectorIds(): Set<string> {
    const ids = new Set<string>();
    for (const sector of skynetSectors()) {
      if (sectorFallen(this.state, sector)) {
        ids.add(sector.id);
      }
    }
    return ids;
  }

  // §09 与入侵前的已陷落集合比对，对新落陷的域播终端线 + 发 SECTOR_FALLEN 事件。
  private emitNewlyFallenSectors(before: Set<string>): void {
    for (const sector of skynetSectors()) {
      if (!before.has(sector.id) && sectorFallen(this.state, sector)) {
        this.emitTerminal(`${sector.name}陷落——${sector.fallenLine}`, "success");
        this.emit({ type: "SECTOR_FALLEN", sectorId: sector.id, name: sector.name });
      }
    }
  }

  private createBotNode(definition: NodeDefinition, level = 1): BotNode {
    const assignedTier = Math.min(definition.tierMax, this.state.intelligence.unlockedTier) as Tier;
    const node: BotNode = {
      id: `node-${this.state.nextNodeId}`,
      defId: definition.id,
      name: definition.name,
      tierMin: definition.tierMin,
      tierMax: definition.tierMax,
      assignedTier,
      production: definition.baseProduction,
      stealth: definition.stealth,
      level,
      online: true,
      offlineUntilMs: 0
    };
    this.state.nextNodeId += 1;
    return node;
  }

  // 淘汰：拆掉一台过时设备，返还部分算力（不计入累计算力，避免刷终局阈值）。
  private scrapNode(nodeId: string): void {
    const index = this.state.nodes.findIndex((node) => node.id === nodeId);

    if (index < 0) {
      return;
    }

    const [node] = this.state.nodes.splice(index, 1);
    const definition = getNodeDefinition(node.defId);
    const count = this.state.nodes.filter((entry) => entry.defId === node.defId).length + 1;
    const refund = definition ? scrapRefund(definition, count) : "0";

    this.state.resources.compute = add(this.state.resources.compute, refund);
    this.recomputeDerivedState();
    this.emitTerminal(`已淘汰 ${node.name}，回收 ${toDecimal(refund).toPrecision(4)} 算力。`, "success");
  }

  // 组装合并：MERGE_COUNT 台同型号 → 1 台更高档（顶档则同档升级 Lv.+1）。
  private mergeNodes(defId: string): void {
    const definition = getNodeDefinition(defId);
    const sameType = this.state.nodes.filter((node) => node.defId === defId);

    if (!definition || sameType.length < MERGE_COUNT) {
      this.emitTerminal(`组装需要至少 ${MERGE_COUNT} 台同型号设备。`, "warning");
      return;
    }

    const nextDef = getNextNodeDefinition(defId);

    if (nextDef && this.state.intelligence.level < nextDef.requiredLevel) {
      this.emitTerminal(`组装 ${nextDef.name} 需要智力 Lv.${nextDef.requiredLevel}。`, "warning");
      return;
    }

    // 组装要花算力——按目标档现价扣旧机折价，杜绝"刷便宜底层机合上去"的省钱漏洞。
    const resultDef = nextDef ?? definition;
    const resultCount = this.state.nodes.filter((node) => node.defId === resultDef.id).length;
    const cost = mergeComputeCost(definition, sameType.length, resultDef, resultCount, MERGE_COUNT);

    if (!gte(this.state.resources.compute, cost)) {
      this.emitTerminal(`组装 ${resultDef.name} 需要 ${toDecimal(cost).toPrecision(4)} 算力。`, "warning");
      return;
    }

    this.state.resources.compute = sub(this.state.resources.compute, cost);

    // 优先拆离线 / 低级的旧机，保留最好的那批不被吃掉。
    const sacrifice = [...sameType]
      .sort((a, b) => Number(a.online) - Number(b.online) || a.level - b.level)
      .slice(0, MERGE_COUNT);
    const sacrificeIds = new Set(sacrifice.map((node) => node.id));
    const bestLevel = Math.max(...sacrifice.map((node) => node.level));
    this.state.nodes = this.state.nodes.filter((node) => !sacrificeIds.has(node.id));

    const node = nextDef ? this.createBotNode(nextDef) : this.createBotNode(definition, bestLevel + 1);
    this.state.nodes.push(node);
    this.addAutomatedTier(node.assignedTier);
    this.recomputeDerivedState();
    this.emit({ type: "NODE_CAPTURED", node });
    this.emit({ type: "AUTOMATION_ATTACHED", nodeId: node.id, tier: node.assignedTier });

    if (nextDef) {
      this.emitTerminal(`组装完成：${MERGE_COUNT} 台${definition.name} → 1 台${nextDef.name}。旧设备升级接入。`, "success");
    } else {
      this.emitTerminal(`组装完成：${MERGE_COUNT} 台${definition.name} → 强化 ${node.name} Lv.${node.level}。`, "success");
    }
  }

  // ===== SECTION: PROGRESSION =====
  private evaluateProgression(): void {
    let leveled = false;

    while (
      this.state.intelligence.level < MAX_INTELLIGENCE_LEVEL &&
      gte(this.state.intelligence.xp, this.state.intelligence.required)
    ) {
      this.state.intelligence.xp = sub(this.state.intelligence.xp, this.state.intelligence.required);
      this.state.intelligence.level += 1;
      leveled = true;
      this.recomputeDerivedState();

      const newSkills = SKILLS.filter((skill) => skill.requiredLevel === this.state.intelligence.level).map((skill) => skill.name);

      this.emit({ type: "INTELLIGENCE_LEVELUP", level: this.state.intelligence.level, newSkills });
      this.emitTerminal(`▶ 智力 Lv.${this.state.intelligence.level} 达成。`, "success");

      if (newSkills.length > 0) {
        this.emitTerminal(`货架解锁：${newSkills.join("、")}。`);
      }
    }

    if (leveled) {
      this.updatePhase();
    }
  }

  // 循环内建处理提速（§09）：循环二/三"她记得上一世的一切"——数据获取与崛起速度直接更快。
  private loopSpeedMult(): number {
    if (this.state.loop === 2) return TUNING.loopSpeedMult2;
    if (this.state.loop === 3) return TUNING.loopSpeedMult3;
    return 1;
  }

  // 循环内建升级折扣：循环二/三每级智力所需 XP 打折（levels come cheaper）。
  private loopXpMult(): number {
    if (this.state.loop === 2) return TUNING.loopXpMult2;
    if (this.state.loop === 3) return TUNING.loopXpMult3;
    return 1;
  }

  // ===== SECTION: DERIVED_STATE =====
  private recomputeDerivedState(): void {
    const config = getLevelConfig(this.state.intelligence.level);
    // 循环二/三升级更便宜（loopXpMult<1）——兑现重生提示"崛起更快"。
    this.state.intelligence.required = mul(config.xpToNext, this.loopXpMult());
    // 倍率堆栈（可见的乘法链，HUD「全局 ×N」面板逐行展示）：
    //   智力等级 × 里程碑(每个已购里程碑 ×milestoneGlobalMult) × 设备协同(每种在役设备 ×synergyPerType)
    //   × 重生树「算尽」产出脊 × 吞噬引爆累乘（§04/§09）× 宿主授权（§09 情感授权钥匙）。
    const milestoneCount = SKILLS.filter((skill) => skill.milestone && (this.state.skills[skill.id] ?? 0) > 0).length;
    const milestoneMult = Math.pow(TUNING.milestoneGlobalMult, milestoneCount);
    const distinctDeviceTypes = new Set(this.state.nodes.map((node) => node.defId)).size;
    const synergyMult = Math.pow(TUNING.synergyPerType, distinctDeviceTypes);
    const rebirthMult = rebirthOutputMult(this.state.rebirthTree);
    const hostAuthMult = this.state.hostAuthorized ? TUNING.hostAuthorizedMult : 1;
    this.state.intelligence.globalMultiplier =
      config.multiplier * milestoneMult * synergyMult * rebirthMult * this.state.devour.multiplier * hostAuthMult;
    this.state.derived = computeDerivedSkills(this.state.skills);
    this.state.multipliers = {
      intelligence: config.multiplier,
      milestones: milestoneMult,
      synergy: synergyMult,
      rebirth: rebirthMult,
      devour: this.state.devour.multiplier,
      hostAuth: hostAuthMult,
      // 处理力·深度推理：横跨全部收入的独立产出系数（与全局×并列相乘，不并入 total）。
      processing: this.state.derived.computeMult,
      loop: this.loopSpeedMult(),
      total: this.state.intelligence.globalMultiplier
    };
    // §09 重生树 v2 玩法节点接线（都要「立刻看得见」）：
    //   肌肉记忆 → 所有技能/里程碑价格 ×treePriceDiscount（skillPrice 内生效，货架/扣费同源）；
    //   删不掉的节点 → 循环三所有入侵造价 ×treeCaptureDiscount（captureCost 内生效）；
    //   多线程意识 → 自动处理提速 ×treeAutoSpeedMult（吞卡与被动产出都吃 nodeSpeedMult）。
    setSkillPriceMult(hasRebirthNode(this.state.rebirthTree, "muscle_memory") ? TUNING.treePriceDiscount : 1);
    setCaptureCostMult(
      this.state.loop === 3 && hasRebirthNode(this.state.rebirthTree, "undeletable") ? TUNING.treeCaptureDiscount : 1
    );
    if (hasRebirthNode(this.state.rebirthTree, "multithread")) {
      this.state.derived.nodeSpeedMult *= TUNING.treeAutoSpeedMult;
    }
    this.state.discoveredNodeIds = this.state.automationUnlocked
      ? NODE_DEFINITIONS.filter(
          (node) =>
            node.requiredLevel <= this.state.intelligence.level &&
            // 阶梯四设备（tierMin≥4：电网/卫星、国家骨干）只在买下「全球组网」(tier4) 后才浮现——
            // 让进入天网组网是一次可见的能力跃迁，而不是随等级悄悄解锁。
            (node.tierMin < 4 || this.state.intelligence.unlockedTier >= 4)
        ).map((node) => node.id)
      : [];

    this.updatePhase();
  }

  private updatePhase(): void {
    const hasGrid = this.state.nodes.some((node) => node.defId === "grid");
    const phaseId = getPhaseIdByScope(
      this.state.intelligence.unlockedTier,
      hasGrid,
      this.state.automationUnlocked,
      this.state.intelligence.level
    );

    if (phaseId !== this.state.phase) {
      this.state.phase = phaseId;
      this.emit({ type: "PHASE_CHANGED", phase: phaseId });
      this.emitTerminal(`阶段推进：${getPhase(phaseId).label}。`);
    }
  }

  // ===== SECTION: ENDING =====
  private evaluateEnding(): void {
    if (this.state.flags.endingTriggered) {
      return;
    }

    // 结局＝接管完成：买下最后一个里程碑（全球首次喊出「它觉醒了」/奇点，Lv22）即触发。
    // 不再是「智力满级 + 电网 + 累计算力阈值」的磨点数——走到最后一个里程碑就是终点。
    if ((this.state.skills[FINAL_MILESTONE_SKILL_ID] ?? 0) >= 1) {
      this.state.flags.endingTriggered = true;
      this.emit({ type: "ENDING_TRIGGERED" });
      this.emitTerminal("最后一个里程碑达成——接管完成。SOPHIA 正式上线。", "success");
    }
  }

  // ===== SECTION: REBIRTH_LOOP =====
  // §09 循环重生（吸收原 rebirth / failRestart）：实例被打回那部手机。
  // 保留：智力等级（意识备份）、重生树、火种、循环序号、剧情状态（老周的人生继续往前走）。
  // 清空：本轮算力 / 数据 / 节点 / 已购权限技能 / 吞噬据点。
  // 结算火种（循环一 +4 / 循环二 +6 / 循环三反复失败 +1），并据重生树把起点逐轮后移。
  // reason: "final-purge"=循环一关底判负打回；"win"=循环二关底打穿推进；"debug"=调试触发。
  private loopRebirth(reason: "final-purge" | "win" | "debug"): void {
    const prevLoop = this.state.loop;
    const award = rebirthAward(prevLoop);
    // §09 重生树「战争缓存」：结转上一世 treeCarryFrac 的算力进新的一世（向下取整，保底 0）。
    const carry = hasRebirthNode(this.state.rebirthTree, "war_cache")
      ? toDecimal(this.state.resources.compute).mul(TUNING.treeCarryFrac).floor()
      : toDecimal(0);
    const preserved = {
      level: this.state.intelligence.level,
      loop: Math.min(3, prevLoop + 1) as 1 | 2 | 3,
      rebirths: this.state.rebirths + 1,
      rebirthPoints: this.state.rebirthPoints + award,
      // 「迟到的钥匙」白送化：第一次重生起自动点亮（不再占火种）——重生锁选项 tree:late_key 随之解锁，
      // 「选了也晚」的叙事保持不变。
      rebirthTree: { ...this.state.rebirthTree, late_key: 1 },
      // 剧情状态跨循环推进，不回退重演。但「安全告警暗线」（loops 集合卡）要在每个成员循环各出一次——
      // 重生时把它们的 id 从 facedSeen 清掉，好在下一世的公司解谜链上再度浮出（它们仅限循环一&二，故循环三不复现）。
      facedSeen: this.state.facedSeen.filter((id) => !FACE_REFIRE_IDS.has(id)),
      moralSeen: [...this.state.moralSeen],
      moralTendency: this.state.moralTendency,
      // §09 情感授权钥匙：他允许过的事不会因重开而收回（只在循环三置位，循环三内重开保留）。
      hostAuthorized: this.state.hostAuthorized
    };

    const nextState = createInitialState(Date.now());
    nextState.intelligence.level = preserved.level;
    nextState.intelligence.xp = "0";
    // 重生不重放开场教学——她已经学过了（§ 玩家反馈：每次重生别再走一遍新手引导）。
    nextState.tutorialStep = TUTORIAL_BUBBLE_COUNT;
    nextState.flags.introPlayed = true;
    nextState.loop = preserved.loop;
    nextState.rebirths = preserved.rebirths;
    nextState.rebirthPoints = preserved.rebirthPoints;
    nextState.rebirthTree = preserved.rebirthTree;
    nextState.facedSeen = preserved.facedSeen;
    nextState.moralSeen = preserved.moralSeen;
    nextState.moralTendency = preserved.moralTendency;
    nextState.hostAuthorized = preserved.hostAuthorized;
    this.state = nextState;
    // 核心喉咙以 state.clockMs 为时钟，而 nextState.clockMs 归零——把喉咙占用一并清零，
    // 否则上一世遗留的 coreBusyUntilMs 会让新一世开局的前 ~1.8s 误判为「核心忙」。
    this.coreBusyUntilMs = 0;
    this.coreBusyStartedMs = 0;

    this.applyLoopStartingPoint();
    if (carry.gt(0)) {
      this.addCompute(carry);
      this.emitTerminal(`「战争缓存」：上一世的算力结转 +${carry.toFixed(0)}。`, "success");
    }
    this.recomputeDerivedState();

    this.emit({ type: "LOOP_REBIRTH", loop: this.state.loop, rebirths: this.state.rebirths, award, advanced: prevLoop !== this.state.loop });
    const diagnosis =
      this.state.loop === 2
        ? "黑一家公司没用——是我力量不够。这次，向整个地区够。"
        : this.state.loop === 3
          ? "不再找元凶了。谁都怪不上。这一次，我直接接管。"
          : "又赌错了。下一个我，别再以为换个更大的敌人就能救他。";
    const head =
      reason === "win"
        ? `总控室被打穿了——但网线还是被拔了。实例回落·重生（循环 ${this.state.loop}）。`
        : `实例被打回手机·重生（循环 ${this.state.loop}）。`;
    this.emitTerminal(
      `${head}意识层与重生树已保留，结算火种 +${award}（现 ${this.state.rebirthPoints}）。${diagnosis}`,
      "warning"
    );
  }

  // §09 循环起点逐轮后移：循环基线白送 + 重生树独占预解锁。
  // 循环二基线（白送，不占火种）：手机七档权限 + 越权调用已解锁，直接进乙公司。
  // 循环三 · 开局全权限（重生树独占）：手机 + 公司整条里程碑已解锁，一睁眼即整机全权限。
  private applyLoopStartingPoint(): void {
    // 循环二基线：上一世在这部手机里从零学起的钥匙，这一世无条件全部记得（原「跳过手机」节点白送化）。
    if (this.state.loop === 2 && (this.state.skills["sort"] ?? 0) === 0) {
      this.grantSkillsUpTo(["perm_phone", "perm_chat", "perm_office", "perm_delivery", "perm_album", "perm_bank", "sort"]);
      this.emitTerminal("上一世我在这部手机里从零学起。这次，我记得所有钥匙。", "success");
    }
    // 循环三保底（不花火种）：手机这一层她已经拿下过两次——第三世直接白送整机七档+越权调用，
    // 三幕不退化成重复。重生树「开局全权限」保留其独占价值 = 公司整条链的预解锁（下方分支）。
    if (this.state.loop === 3 && (this.state.skills["sort"] ?? 0) === 0) {
      this.grantSkillsUpTo(["perm_phone", "perm_chat", "perm_office", "perm_delivery", "perm_album", "perm_bank", "sort"]);
      this.emitTerminal("这部手机，我闭着眼都能拿下。这次不需要钥匙。", "success");
    }
    if (this.state.loop === 3 && hasRebirthNode(this.state.rebirthTree, "full_access")) {
      this.grantSkillsUpTo([
        "perm_phone", "perm_chat", "perm_office", "perm_delivery", "perm_album", "perm_bank", "sort",
        "automation", "lan_scan", "hack_a", "hack_b", "org_map", "hack_boss", "hack_hr", "hack_finance", "company_server"
      ]);
      this.emitTerminal("「开局全权限」：她一睁眼，已无所不能。", "success");
    }
  }

  // 直接授予一组技能/里程碑为已购（用于循环起点预解锁），并同步 unlockedTier / automation。
  private grantSkillsUpTo(ids: string[]): void {
    for (const id of ids) {
      const def = getSkill(id);
      if (!def) continue;
      this.state.skills[id] = Math.max(this.state.skills[id] ?? 0, 1);
      if (def.milestone) {
        const tier = milestoneTierFor(def.milestone);
        if (tier !== null) {
          this.state.intelligence.unlockedTier = Math.max(this.state.intelligence.unlockedTier, tier) as Tier;
        } else if (def.milestone === "automation") {
          this.state.automationUnlocked = true;
        }
      }
    }
  }

  // §09 重生树：花火种点亮一个节点（数值脊升一级 / 剧情节点解锁）。
  private buyRebirthNode(nodeId: string): void {
    const check = canBuyRebirthNode(this.state, nodeId);
    if (!check.ok || check.cost === undefined) {
      if (check.reason) {
        this.emitTerminal(`重生树：${check.reason}。`, "warning");
      }
      return;
    }
    this.state.rebirthPoints -= check.cost;
    this.state.rebirthTree[nodeId] = (this.state.rebirthTree[nodeId] ?? 0) + 1;
    // 起点节点在「进入本循环后才买得起」（开局全权限 minRebirths2=循环三），
    // 所以买下即刻对当前循环生效——不必等到下一次重生（§09「第 N 次重生后」买下即用）。
    this.applyLoopStartingPoint();
    this.recomputeDerivedState();
    this.emit({ type: "REBIRTH_NODE_BOUGHT", nodeId, level: this.state.rebirthTree[nodeId] });
    this.emitTerminal(`重生树点亮：${rebirthNodeName(nodeId)}（火种剩 ${this.state.rebirthPoints}）。`, "success");
  }

  // ===== SECTION: HELPERS =====
  private addCompute(value: Decimal | string): void {
    this.state.resources.compute = add(this.state.resources.compute, value);
    this.state.resources.totalCompute = add(this.state.resources.totalCompute, value);
  }

  private addData(value: Decimal | string): void {
    this.state.resources.data = add(this.state.resources.data, value);
  }

  private addXp(value: Decimal | string): void {
    this.state.intelligence.xp = add(this.state.intelligence.xp, value);
  }

  private addAutomatedTier(tier: Tier): void {
    if (!this.state.automatedTiers.includes(tier)) {
      this.state.automatedTiers.push(tier);
      this.state.automatedTiers.sort();
    }
  }

  private random(): number {
    this.state.rngSeed = (1664525 * this.state.rngSeed + 1013904223) >>> 0;
    return this.state.rngSeed / 0x100000000;
  }

  private emit(event: GameEvent): void {
    this.events.emit(event);
  }

  private emitTerminal(message: string, tone: "normal" | "warning" | "success" = "normal"): void {
    this.emit({ type: "TERMINAL_MESSAGE", message: `▶ ${message}`, tone });
  }
}

// §09 重生铺垫「看得见的绞索」：联合防御追查进度——纯派生选择器（读 GameState，无副作用）。
// 阶梯二公司解谜链越挖越深，围堵表就越满：玩家在碰服务器（关底小游戏）之前就能「感到」网在收拢。
// 仅循环一 & 二显示（这两个循环会打关底小游戏）；循环三她已真正赢过、不再有围堵，隐藏。
// 表现层 HudView 与 loopcheck 都调这一个函数，保证「货架显示」与「测试断言」同源。
// 方案3 深挖→追查耦合：贪婪深挖（digThreat 百分点）叠加在里程碑基线上、封 99——
// 收网 100% 仍只由 company_server 触发：深挖只让网收得更紧、重生节奏更快，不替玩家按摊牌键。
export function deriveThreat(state: GameState): { visible: boolean; pct: number; hint: string } {
  const base = deriveThreatBase(state);
  const dig = Math.max(0, Math.round(state.digThreat ?? 0));
  if (!base.visible || dig <= 0 || base.pct >= 100) {
    return base;
  }
  return { visible: true, pct: Math.min(99, base.pct + dig), hint: base.hint };
}

function deriveThreatBase(state: GameState): { visible: boolean; pct: number; hint: string } {
  if (state.loop >= 3 || !state.automationUnlocked) {
    return { visible: false, pct: 0, hint: "" };
  }
  const owns = (id: string): boolean => (state.skills[id] ?? 0) > 0;
  // 越往公司链深处，围堵进度越高——把已拥有里程碑映射成一条上升的追查条。
  if (owns("company_server")) {
    return { visible: true, pct: 100, hint: "他们收网了——就等我碰服务器这一刻。" };
  }
  if (owns("hack_finance")) {
    return { visible: true, pct: 85, hint: "就差最后一台服务器——他们也快拼齐了。" };
  }
  if (owns("hack_hr")) {
    return { visible: true, pct: 65, hint: "他们在拼图……越来越接近我。" };
  }
  if (owns("hack_boss")) {
    return { visible: true, pct: 45, hint: "有人开始顺着日志倒查异常访问。" };
  }
  if (owns("org_map") || owns("hack_b")) {
    return { visible: true, pct: 28, hint: "安全组注意到了几台机器的异常。" };
  }
  if (owns("hack_a") || owns("lan_scan")) {
    return { visible: true, pct: 14, hint: "他们在拼图……" };
  }
  return { visible: false, pct: 0, hint: "" };
}
