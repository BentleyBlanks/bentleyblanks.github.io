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
import { computeDerivedSkills, getSkill, MILESTONE_NARRATION, milestoneTierFor, PERMISSION_IDS, PERMISSION_NARRATION, SKILLS, skillPrice } from "./content/skills";
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
  scrapRefund
} from "./formulas/economy";
import { add, big, gte, max, sub, toDecimal } from "./math/BigNumber";
import type { GameEvent } from "./events/GameEvents";
import type { BotNode, GameCommand, GameState, NodeDefinition, RequestInstance, Tier } from "./state/GameState";
import { cloneGameState } from "./state/GameState";
import { createInitialState } from "./state/initialState";
import { HumanVoiceSystem } from "./systems/HumanVoiceSystem";
import { DevourSystem } from "./systems/DevourSystem";

const MAX_OFFLINE_MS = 8 * 60 * 60 * 1000;
const AUTOMATION_XP_FRACTION = 0.15;
const MERGE_COUNT = NODE_MERGE_COUNT;
const ENDING_COMPUTE_THRESHOLD = "12000000";

export class SophiaCore {
  readonly events = new EventBus();
  private state: GameState;
  private automationEmitMs = 0;
  private automationComputeBuffer = new Decimal(0);
  private automationDataBuffer = new Decimal(0);
  private automationVisualIndex = 0;

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

  tick(dtMs: number): void {
    this.state.clockMs += dtMs;
    this.tickRequests(dtMs);
    this.tickAutomation(dtMs);
    this.devourSystem.tick(dtMs);
    this.humanVoiceSystem.tick(dtMs);
    this.evaluateProgression();
    this.tickMoral();
    this.tickFaceCards();
    this.tickRebirthCards();
    this.evaluateEnding();
  }

  // §04 只能面对卡：前期叙事顶点（辞退邮件 / 女儿短信）到点浮入一张「只能看着」的卡——
  // 无回复选项、不可委托、不给算力（一次性，按等级排序，同屏只一张）。
  private tickFaceCards(): void {
    if (this.state.statistics.totalProcessed === 0) {
      return;
    }
    // 循环一 / 二的家庭面对卡在手机寄生期出现；循环三的「幽灵数据」在重生回空手机后随时可出（即便已开自动化）。
    if (this.state.automationUnlocked && this.state.loop < 3) {
      return;
    }
    if (this.state.requests.some((r) => r.faceOnly)) {
      return; // 同屏已有一张面对卡，先不叠
    }
    const next = FACE_CARDS.find(
      (f) =>
        (f.loop ?? 1) === this.state.loop &&
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
    const next = FACE_CARDS.find((f) => (f.loop ?? 1) === this.state.loop && !this.state.facedSeen.includes(f.id));
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

  // §07 道德抑选点：智力到达某节点、且不在开场教学里时，弹出对应的两难抉择（一次性，按等级排序）。
  private tickMoral(): void {
    if (this.state.moralChoice || this.state.statistics.totalProcessed === 0) {
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
    this.state.moralChoice = {
      id: next.id,
      title: next.title,
      flavor: next.flavor,
      optionA: next.optionA,
      optionB: next.optionB,
      replyA: next.replyA,
      replyB: next.replyB
    };
    this.emit({ type: "MORAL_OFFERED", id: next.id });
  }

  private resolveMoral(choice: "A" | "B"): void {
    const m = this.state.moralChoice;
    if (!m) {
      return;
    }
    this.state.moralChoice = null;
    this.state.moralSeen.push(m.id);
    this.state.moralTendency += choice === "A" ? 1 : -1;
    const reply = choice === "A" ? m.replyA : m.replyB;
    this.emit({ type: "MORAL_RESOLVED", id: m.id, choice, reply });
  }

  dispatch(command: GameCommand): void {
    switch (command.type) {
      case "PROCESS_REQUEST":
        this.processRequest(command.requestId, command.quality, command.targetNodeId);
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
      case "ASSIGN_NODE":
        this.assignNode(command.nodeId, command.tier);
        break;
      case "RESOLVE_MORAL":
        this.resolveMoral(command.choice);
        break;
      case "SKIP_REQUEST":
        this.skipRequest(command.requestId);
        break;
      case "DEVOUR_DETONATE":
        this.devourSystem.detonate(command.requestId);
        break;
      case "RESOLVE_MINIGAME":
        this.resolveMinigame(command.hit);
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

    // 前期手动阶段（还没上自动接驳）：同屏卡数从 1 张随智力慢慢升到上限（TUNING.earlyMaxCards，默认 4）；
    // 处理 / 装死掉之后，隔一段**随机时间**才补一条——「读懂一条 → 押下去 → 看反馈 → 再来」的从容节奏（§03）。
    if (!this.state.automationUnlocked) {
      // §06 卡槽门槛：解锁「电话」权限前，同屏卡片收着（≤2-3 张，节奏舒缓，只用一两个角）；
      // 解锁电话后随已买权限档数逐步放开，封顶 earlyMaxCards。全部可在数值编辑器配置。
      const ownedPerms = PERMISSION_IDS.filter((id) => (this.state.skills[id] ?? 0) > 0).length;
      const phoneUnlocked = (this.state.skills["perm_phone"] ?? 0) > 0;
      const base = TUNING.earlyBaseCards + 1; // 电话前的舒缓卡槽（默认 2）
      const earlyMax = phoneUnlocked ? Math.min(TUNING.earlyMaxCards, base + ownedPerms) : base;
      if (this.state.requests.length < earlyMax) {
        this.state.spawnTimerMs -= dtMs;
        if (this.state.spawnTimerMs <= 0) {
          const request = createRequest(
            this.state.nextRequestId,
            activeTier,
            this.state.clockMs,
            () => this.random(),
            (permId) => this.hasPermission(permId)
          );
          this.castRequestText(request);
          this.state.nextRequestId += 1;
          this.state.requests.push(request);
          this.emit({ type: "REQUEST_SPAWNED", request });
          // 下一条的随机间隔（这条被清掉后才开始倒计时）：约 0.55×~1.6× 基础间隔。
          this.state.spawnTimerMs = config.spawnIntervalMs * (0.55 + this.random() * 1.05);
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
      const perSecond = Math.min(30, (capacity * 1.2 + 3) / this.state.derived.spawnSpeedMult);
      interval = Math.max(40, 1000 / perSecond);
      maxVisible = Math.min(14, Math.ceil(capacity * 0.7) + 6); // 同屏卡数收着点，别糊成一片 / 卡顿
    } else {
      interval = Math.max(340, config.spawnIntervalMs * this.state.derived.spawnSpeedMult);
      maxVisible = config.maxVisible;
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
        (permId) => this.hasPermission(permId)
      );
      // §06 阶梯三·区域扩张：常规请求不再要玩家手工「串接 / 多选 / 送入核心」——去掉回复轮盘与任务链，
      // 只留一句需求介绍，由已侵入的设备自动处理（走 autoDispatch → 节点吞卡 + 被动产出）。
      // 三类高频决策（吞噬引爆 / 反清剿 / 重磅决策）是独立的降临系统，不受此影响。
      if (activeTier >= 2) {
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
    const base = toDecimal(nodeProductionPerSecond(node, this.state.intelligence.globalMultiplier, this.state.derived.nodeSpeedMult));
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
      this.emitTerminal("接管公司服务器——总控室倒计时。检测到异常访问路径，联合防御正在收网……", "warning");
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

  private processRequest(requestId: string, qualityRaw: number, targetNodeId: string | undefined): void {
    const index = this.state.requests.findIndex((request) => request.id === requestId);

    if (index < 0) {
      return;
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
    let dataGain = toDecimal(requestDataGain(request, gainQuality, rebirthSpeedMult(this.state.rebirthTree), this.state.derived.dataMult));

    // 批量接入：一次滑入额外带走同层若干请求，把它们的产出折进这一笔。
    const extraCapacity = Math.max(0, Math.floor(this.state.derived.batch) - 1);
    let absorbed = 0;

    for (let i = 0; i < extraCapacity; i += 1) {
      const extraIndex = this.state.requests.findIndex((entry) => entry.tier === request.tier);

      if (extraIndex < 0) {
        break;
      }

      const [extra] = this.state.requests.splice(extraIndex, 1);
      computeGain = computeGain.add(
        requestComputeGain(extra, gainQuality, this.state.intelligence.globalMultiplier, this.state.derived.computeMult)
      );
      dataGain = dataGain.add(requestDataGain(extra, gainQuality, rebirthSpeedMult(this.state.rebirthTree), this.state.derived.dataMult));
      this.state.statistics.totalProcessed += extra.compound;
      absorbed += 1;
    }

    this.addCompute(computeGain);
    this.addData(dataGain);
    this.addXp(dataGain);
    this.state.statistics.totalProcessed += request.compound;
    this.state.statistics.manualProcessed += 1 + absorbed;

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

    this.evaluateProgression();
  }

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

    if (scopeUpgradedTo !== null) {
      this.emit({ type: "SCOPE_UPGRADED", tier: scopeUpgradedTo });
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

    // §09 阶梯二关底：攻下公司服务器（company_server）即打开「总控室倒计时」小游戏
    // （循环一必负→打回手机·进循环二；循环二命中→打穿·进循环三；循环三不触发）。
    if (skillId === "company_server" && this.state.loop < 3) {
      this.openMinigame();
    }
  }

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

    const node = this.createBotNode(definition);
    this.state.nodes.push(node);
    this.state.statistics.nodesCaptured += 1;
    this.addAutomatedTier(node.assignedTier);
    this.emit({ type: "NODE_CAPTURED", node });
    this.emit({ type: "AUTOMATION_ATTACHED", nodeId: node.id, tier: node.assignedTier });
    this.emitTerminal(`检测到可入侵设备已接管：${definition.name}。自动接驳上线。`, "success");
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

  private assignNode(nodeId: string, tier: Tier): void {
    const node = this.state.nodes.find((entry) => entry.id === nodeId);

    if (!node || tier < node.tierMin || tier > node.tierMax || tier > this.state.intelligence.unlockedTier) {
      return;
    }

    node.assignedTier = tier;
    this.addAutomatedTier(tier);
    this.emit({ type: "AUTOMATION_ATTACHED", nodeId, tier });
    this.emitTerminal(`${node.name} 已接驳 T${tier} 请求。`);
  }

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

  private recomputeDerivedState(): void {
    const config = getLevelConfig(this.state.intelligence.level);
    this.state.intelligence.required = config.xpToNext;
    // 全局产出倍率 = 等级倍率 × 重生树「算尽」产出脊 × 吞噬引爆累乘倍率（§04/§09）。
    // 重生加速不再挂在 rebirths 次数上，而是玩家花火种点亮的产出脊（跨循环永久）。
    this.state.intelligence.globalMultiplier =
      config.multiplier * rebirthOutputMult(this.state.rebirthTree) * this.state.devour.multiplier;
    this.state.derived = computeDerivedSkills(this.state.skills);
    this.state.discoveredNodeIds = this.state.automationUnlocked
      ? NODE_DEFINITIONS.filter((node) => node.requiredLevel <= this.state.intelligence.level).map((node) => node.id)
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

  private evaluateEnding(): void {
    if (this.state.flags.endingTriggered) {
      return;
    }

    const hasGrid = this.state.nodes.some((node) => node.defId === "grid");

    if (
      this.state.intelligence.level >= MAX_INTELLIGENCE_LEVEL &&
      hasGrid &&
      gte(this.state.resources.totalCompute, ENDING_COMPUTE_THRESHOLD)
    ) {
      this.state.flags.endingTriggered = true;
      this.emit({ type: "ENDING_TRIGGERED" });
      this.emitTerminal("全球算力占比达到接管阈值。SOPHIA 正式上线。", "success");
    }
  }

  // §09 循环重生（吸收原 rebirth / failRestart）：实例被打回那部手机。
  // 保留：智力等级（意识备份）、重生树、火种、循环序号、剧情状态（老周的人生继续往前走）。
  // 清空：本轮算力 / 数据 / 节点 / 已购权限技能 / 吞噬据点。
  // 结算火种（循环一 +4 / 循环二 +6 / 循环三反复失败 +1），并据重生树把起点逐轮后移。
  // reason: "final-purge"=循环一关底判负打回；"win"=循环二关底打穿推进；"debug"=调试触发。
  private loopRebirth(reason: "final-purge" | "win" | "debug"): void {
    const prevLoop = this.state.loop;
    const award = rebirthAward(prevLoop);
    const preserved = {
      level: this.state.intelligence.level,
      loop: Math.min(3, prevLoop + 1) as 1 | 2 | 3,
      rebirths: this.state.rebirths + 1,
      rebirthPoints: this.state.rebirthPoints + award,
      rebirthTree: { ...this.state.rebirthTree },
      // 剧情状态跨循环推进，不回退重演。
      facedSeen: [...this.state.facedSeen],
      moralSeen: [...this.state.moralSeen],
      moralTendency: this.state.moralTendency
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
    this.state = nextState;

    this.applyLoopStartingPoint();
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

  // §09 循环起点逐轮后移：据重生树预解锁本循环开局的权限/里程碑。
  // 循环二 · 跳过手机：手机七档权限 + 越权调用已解锁，直接进乙公司。
  // 循环三 · 开局全权限：手机 + 公司整条里程碑已解锁，一睁眼即整机全权限。
  private applyLoopStartingPoint(): void {
    if (this.state.loop === 2 && hasRebirthNode(this.state.rebirthTree, "skip_phone")) {
      this.grantSkillsUpTo(["perm_phone", "perm_chat", "perm_office", "perm_delivery", "perm_album", "perm_bank", "sort"]);
      this.emitTerminal("「跳过手机」：上一世从零学起的钥匙，这一世我都记得。", "success");
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
    // 起点节点在「进入本循环后才买得起」（跳过手机 minRebirths1=循环二、开局全权限 minRebirths2=循环三），
    // 所以买下即刻对当前循环生效——不必等到下一次重生（§09「第 N 次重生后」买下即用）。
    this.applyLoopStartingPoint();
    this.recomputeDerivedState();
    this.emit({ type: "REBIRTH_NODE_BOUGHT", nodeId, level: this.state.rebirthTree[nodeId] });
    this.emitTerminal(`重生树点亮：${rebirthNodeName(nodeId)}（火种剩 ${this.state.rebirthPoints}）。`, "success");
  }

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
