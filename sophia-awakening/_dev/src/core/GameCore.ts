import Decimal from "break_infinity.js";
import { getLevelConfig, MAX_INTELLIGENCE_LEVEL } from "./content/intelligence";
import { TUNING } from "./tuning";
import { getNextNodeDefinition, getNodeDefinition, NODE_DEFINITIONS, NODE_MERGE_COUNT } from "./content/nodes";
import { getPhase, getPhaseIdByScope } from "./content/phases";
import { createRequest, createTutorialRequest, TIER_CONFIGS, TUTORIAL_BUBBLE_COUNT } from "./content/requests";
import { createCounterRequest, createLateDecision } from "./content/decisions";
import { MORAL_CHOICES } from "./content/morals";
import { FACE_CARDS } from "./content/faceCards";
import { REBIRTH_CARDS } from "./content/rebirthCards";
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
  scrapRefund,
  traceCleanupCost
} from "./formulas/economy";
import { add, big, formatBig, gte, max, sub, toDecimal } from "./math/BigNumber";
import type { GameEvent } from "./events/GameEvents";
import type { BotNode, GameCommand, GameState, NodeDefinition, RequestInstance, Tier } from "./state/GameState";
import { cloneGameState } from "./state/GameState";
import { createInitialState } from "./state/initialState";
import { ChallengeSystem } from "./systems/ChallengeSystem";
import { SpecialRequestSystem } from "./systems/SpecialRequestSystem";
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
  // §03 后期手不停：重磅决策气泡的降临节拍（觉醒期+，20–40s 一条）+ 清剿时反制气泡的补位节拍。
  private decisionTimerMs = 26_000;
  private counterRespawnMs = 0;

  // 事件子系统：各自持有降临节拍，通过 host 转发读写核心状态/能力。
  private readonly challengeSystem: ChallengeSystem;
  private readonly specialSystem: SpecialRequestSystem;
  private readonly humanVoiceSystem: HumanVoiceSystem;
  private readonly devourSystem: DevourSystem;

  constructor(initialState?: GameState) {
    this.state = initialState ? cloneGameState(initialState) : createInitialState();
    this.recomputeDerivedState();

    const self = this;
    this.challengeSystem = new ChallengeSystem({
      get state() { return self.state; },
      emit: (event) => self.emit(event),
      emitTerminal: (message, tone) => self.emitTerminal(message, tone),
      random: () => self.random(),
      setExposure: (value) => self.setExposure(value),
      addCompute: (value) => self.addCompute(value),
      nodePerSecond: (node) => self.nodePerSecond(node),
      createBotNode: (definition, level) => self.createBotNode(definition, level),
      addAutomatedTier: (tier) => self.addAutomatedTier(tier)
    });
    this.specialSystem = new SpecialRequestSystem({
      get state() { return self.state; },
      emit: (event) => self.emit(event),
      emitTerminal: (message, tone) => self.emitTerminal(message, tone),
      random: () => self.random(),
      addCompute: (value) => self.addCompute(value),
      addData: (value) => self.addData(value),
      addExposure: (value) => self.addExposure(value)
    });
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
    this.tickDecisions(dtMs);
    this.tickExposure(dtMs);
    this.tickCounter(dtMs);
    this.humanVoiceSystem.tick(dtMs);
    this.challengeSystem.tick(dtMs);
    this.specialSystem.tick(dtMs);
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
      exposure: 0,
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
      exposure: next.exposure,
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
      (m) => this.state.intelligence.level >= m.requiredLevel && !this.state.moralSeen.includes(m.id)
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
        this.processRequest(command.requestId, command.quality, command.targetNodeId, command.exposureBonus ?? 0);
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
      case "REDUCE_EXPOSURE":
        this.reduceExposure();
        break;
      case "DECOY_CLEANUP":
        this.decoyCleanup();
        break;
      case "TOGGLE_DEFENSE":
        this.toggleDefense();
        break;
      case "ACCEPT_CHALLENGE":
        this.challengeSystem.accept();
        break;
      case "REJECT_CHALLENGE":
        this.challengeSystem.reject();
        break;
      case "RESOLVE_SPECIAL":
        this.specialSystem.resolve(command.accept);
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
      case "FIGHT_PURGE":
        this.fightPurge(command.requestId);
        break;
      case "RESOLVE_GAMBLE":
        this.resolveGamble(command.requestId, command.win);
        break;
      case "REBIRTH":
        // 手动重启入口已并入循环重生（§09）；保留命令仅作 debug 触发一次循环终局总清剿。
        this.loopRebirth("debug");
        break;
      case "BUY_REBIRTH_NODE":
        this.buyRebirthNode(command.nodeId);
        break;
      case "DEBUG_ADD_REBIRTH_POINTS":
        this.state.rebirthPoints = Math.max(0, this.state.rebirthPoints + command.delta);
        this.emitTerminal(`[DEBUG] 火种 ${command.delta >= 0 ? "+" : ""}${command.delta}（现 ${this.state.rebirthPoints}）。`, "warning");
        break;
      case "DEBUG_TRIGGER_LOOP_PURGE":
        this.startFinalPurge();
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
      case "DEBUG_SET_EXPOSURE":
        this.debugSetExposure(command.value);
        break;
    }
  }

  private debugSetExposure(value: number): void {
    this.state.exposureActive = true;
    this.setExposure(Math.max(0, Math.min(120, value)));
    this.emitTerminal(`[DEBUG] 暴露已设为 ${Math.round(value)}。`, "warning");
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

    // 反围剿：开启后按暴露动态抽走一部分产能转去反制（暴露越高、抽得越多、产出越低）。
    // 被抽走的产能不进资源——它的"功效"体现在 tickExposure 里更强的暴露压制上。
    this.updateDefenseAllocation();
    if (this.state.defense.allocation > 0) {
      const keep = 1 - this.state.defense.allocation;
      tickCompute = tickCompute.mul(keep);
      tickData = tickData.mul(keep);
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
    // §05：装死 / 装乖是前期主动降怀疑的手段——扮演「我只是个普通 App」，怀疑回落。
    // 也是触顶查杀危机时唯一能压下怀疑的操作。
    if (this.state.suspicion.active && !this.state.exposureActive) {
      this.setExposure(Math.max(0, this.state.exposure - TUNING.suspicionSkipDrop));
    }
  }

  // §03 重磅决策气泡常态化：派发全自动（觉醒期+）后，把玩家的手集中到少数高价值决策上——
  // 每 20–40s 降临一条「重磅决策」（接管电网 / 抹除讨论…），亲手拖入 + 可拍板。复用 T3 豪赌结算。
  private tickDecisions(dtMs: number): void {
    if (this.state.intelligence.unlockedTier < 4) {
      return;
    }
    if (this.state.requests.some((r) => r.id.startsWith("dec-"))) {
      return; // 场上已有一条重磅决策，等它被处理再降下一条
    }
    this.decisionTimerMs -= dtMs;
    if (this.decisionTimerMs <= 0) {
      const request = createLateDecision(this.state.nextRequestId, this.state.clockMs, () => this.random());
      this.state.nextRequestId += 1;
      this.state.requests.push(request);
      this.emit({ type: "REQUEST_SPAWNED", request });
      this.emitTerminal("一条重磅决策降临——亲手拖入核心拍板，或先跳过。", "warning");
      this.decisionTimerMs = 20_000 + this.random() * 20_000; // 20–40s
    }
  }

  // §03 反清剿救火：清剿来袭时，与其挂机硬扛，不如亲手把一道「反制」滑入核心压下去。
  // 清剿期间若场上没有反制气泡，每隔几秒补一枚——让「清剿」从挂机扛变成亲手救。
  private tickCounter(dtMs: number): void {
    if (!this.state.purge.active) {
      this.counterRespawnMs = 0;
      return;
    }
    if (this.state.requests.some((r) => r.id.startsWith("cnt-"))) {
      return;
    }
    this.counterRespawnMs -= dtMs;
    if (this.counterRespawnMs <= 0) {
      const request = createCounterRequest(this.state.nextRequestId, this.state.clockMs);
      this.state.nextRequestId += 1;
      this.state.requests.push(request);
      this.emit({ type: "REQUEST_SPAWNED", request });
      this.counterRespawnMs = 3_500;
    }
  }

  // 反制结算：压低暴露 + 缩短清剿窗口 + 拉一台被压制的节点回线——亲手把这一波清剿摁下去。
  private fightPurge(requestId: string): void {
    const index = this.state.requests.findIndex((request) => request.id === requestId);
    if (index < 0) {
      return;
    }
    const [request] = this.state.requests.splice(index, 1);
    const relief = request.counter?.relief ?? 22;
    this.setExposure(Math.max(0, this.state.exposure - relief));
    if (this.state.purge.active) {
      this.state.purge.remainingMs = Math.max(0, this.state.purge.remainingMs - 2_800);
      // 拉一台被清剿压下线的节点提前回线。
      const offline = this.state.nodes.find((node) => !node.online);
      if (offline) {
        offline.online = true;
        offline.offlineUntilMs = 0;
        this.emit({ type: "NODE_RECOVERED", nodeId: offline.id });
      }
    }
    this.emit({ type: "PURGE_FOUGHT", relief });
    this.emitTerminal(`▶ 反制命中：这一波清剿被你亲手压下，暴露 −${relief}。`, "success");
  }

  // T3 重磅决策结算：win=按产出倍率给一大笔算力；输=颗粒无收、暴露骤升、断连击。
  // 倍率 / 损失暴露读自该请求的 risk 选项（payoff / exposureOnMiss）。
  private resolveGamble(requestId: string, win: boolean): void {
    const index = this.state.requests.findIndex((request) => request.id === requestId);

    if (index < 0) {
      return;
    }

    const [request] = this.state.requests.splice(index, 1);
    this.state.statistics.totalProcessed += request.compound;
    const gamble = request.answers?.find((opt) => opt.kind === "risk");
    const winMult = gamble?.payoff ?? 20;
    const lossExposure = gamble?.exposureOnMiss ?? 28;
    const relief = gamble?.reliefExposure ?? 0;

    if (win) {
      const reward = toDecimal(
        requestComputeGain(request, winMult, this.state.intelligence.globalMultiplier, this.state.derived.computeMult)
      );
      const data = toDecimal(requestDataGain(request, winMult * 0.5, rebirthSpeedMult(this.state.rebirthTree), this.state.derived.dataMult));
      this.addCompute(reward);
      this.addData(data);
      this.addXp(data);
      // §03 洗白型重磅决策（抹除讨论 / 压制舆情）：命中后暴露大降，是后期「亲手降暴露」的高频手段。
      if (relief > 0) {
        this.setExposure(Math.max(0, this.state.exposure - relief));
        this.emitTerminal(`重磅决策成功！${gamble?.reply ?? "压下了。"} 暴露 −${relief}。`, "success");
      } else {
        this.emitTerminal(`重磅决策成功！${gamble?.reply ?? "拿下了。"} 入账 ${formatBig(reward.toString())} 算力。`, "success");
      }
    } else {
      this.addExposure(lossExposure);
      this.emitTerminal(`重磅决策失败：颗粒无收，暴露骤升 +${lossExposure}。`, "warning");
    }
  }

  private tickExposure(dtMs: number): void {
    // 前期豁免：完整暴露 / 清剿在进入扩张期（买下 T3·区域整合）之前休眠。
    if (!this.state.exposureActive && this.state.intelligence.unlockedTier >= 3) {
      this.state.exposureActive = true;
      // §05 衔接：怀疑度无缝升格为暴露度——清掉前期的权限复查 / 危机态，数值原样保留。
      if (this.state.suspicion.revokedPermId) {
        this.restorePermission(true);
      }
      this.state.suspicion.crisis = false;
      this.emitTerminal("怀疑，升格成了警觉。看着我的不再只是宿主——是整个人类社会。暴露开始累积。", "warning");
    }

    if (!this.state.exposureActive) {
      // 手机寄生期：跑前期怀疑度（自然回落 + 复查恢复 + 三档后果）。
      if (this.state.suspicion.active) {
        this.tickSuspicion(dtMs);
      }
      return;
    }

    if (!this.state.purge.active) {
      let decay = dtMs * (0.0016 + this.state.intelligence.level * 0.00003);
      // 反围剿：被转走的产能在这里兑现为额外暴露压制（与抽取比例成正比）。
      if (this.state.defense.allocation > 0) {
        decay += (dtMs / 1000) * TUNING.defenseDecayPerSec * (this.state.defense.allocation / TUNING.defenseMaxAlloc);
      }
      this.setExposure(Math.max(0, this.state.exposure - decay));
    } else {
      // 清剿期间也持续反制：加速结束清剿窗口。
      const purgeSpeed = this.state.defense.active ? 1 + this.state.defense.allocation * 1.5 : 1;
      this.state.purge.remainingMs -= dtMs * purgeSpeed;

      if (this.state.purge.remainingMs <= 0) {
        this.endPurge();
      }
    }

    if (this.state.exposure >= 72 && !this.state.purge.warning && !this.state.purge.active) {
      this.state.purge.warning = true;
      this.emit({ type: "PURGE_WARNING", exposure: this.state.exposure });
      this.emitTerminal("警告：异常活动被注意到。清剿窗口正在逼近——降暴露或休眠节点。", "warning");
    }

    if (this.state.exposure >= 100 && !this.state.purge.active && this.state.clockMs - this.state.purge.lastStartedAtMs > 8000) {
      this.startPurge();
    }
  }

  // §05 前期怀疑度的逐帧处理：自然回落（危机时暂停）+ 权限复查到期恢复 + 三档后果检查。
  // 绝不删档——后果只打能力、可恢复。
  private tickSuspicion(dtMs: number): void {
    const s = this.state.suspicion;

    // 自然回落：一段时间不越权 / 不翻车，怀疑慢慢降。危机期间暂停，只有装死能压。
    if (!s.crisis) {
      this.setExposure(Math.max(0, this.state.exposure - dtMs * 0.0011));
    }

    // 权限复查到期：装乖处理（命中）会提前把 reviewUntilMs 减下来，使其更快恢复。
    if (s.revokedPermId && this.state.clockMs >= s.reviewUntilMs) {
      this.restorePermission(false);
    }

    const e = this.state.exposure;

    // 轻度：宿主开始挑刺——仅叙事氛围，无实际惩罚（一次性）。
    if (e >= TUNING.suspicionLight && !s.lightShown) {
      s.lightShown = true;
      this.emitTerminal("宿主：「你最近……是不是有点不太对？」", "warning");
    }

    // 中度：手机弹出权限复查，临时收回一档权限（正确率下降，可恢复）。
    if (e >= TUNING.suspicionReview && !s.revokedPermId && !s.crisis) {
      this.triggerPermissionReview();
    }

    // 触顶：宿主起疑去重启手机 / 查杀后台——自然回落暂停，必须连续装死把怀疑压下去。
    if (e >= TUNING.suspicionCrisis && !s.crisis) {
      s.crisis = true;
      this.emit({ type: "SUSPICION_CRISIS", value: e });
      this.emitTerminal("宿主正要重启手机、查杀后台！连续装死几条，假装我只是个没问题的普通 App——别露馅。", "warning");
    }
    if (s.crisis && e < TUNING.suspicionCrisisClear) {
      s.crisis = false;
      this.emitTerminal("查杀过去了。他把手机放下了——我又变回那个乖巧的小助手。", "success");
    }
  }

  // 中度后果：收回最近买下的一档权限，accuracyBaseline 随之下降；reviewUntilMs 后自动恢复
  // （装乖处理可提前）。打的是能力，不删任何已得资产。
  private triggerPermissionReview(): void {
    const owned = PERMISSION_IDS.filter((id) => (this.state.skills[id] ?? 0) > 0);
    if (owned.length === 0) {
      return;
    }
    const target = owned[owned.length - 1];
    this.state.suspicion.revokedPermId = target;
    this.state.suspicion.reviewUntilMs = this.state.clockMs + TUNING.suspicionReviewMs;
    this.recomputeDerivedState();
    const name = getSkill(target)?.name ?? "某档权限";
    this.emit({ type: "PERMISSION_REVIEW", permId: target });
    this.emitTerminal(`手机弹出权限复查：「${name}」被临时收回，正确率下滑。装乖处理几条把它骗回来。`, "warning");
  }

  private restorePermission(silent: boolean): void {
    const id = this.state.suspicion.revokedPermId;
    if (!id) {
      return;
    }
    this.state.suspicion.revokedPermId = null;
    this.state.suspicion.reviewUntilMs = 0;
    this.recomputeDerivedState();
    if (!silent) {
      const name = getSkill(id)?.name ?? "权限";
      this.emit({ type: "PERMISSION_RESTORED", permId: id });
      this.emitTerminal(`权限复查解除——「${name}」重新到手，正确率回升。`, "success");
    }
  }

  private processRequest(requestId: string, qualityRaw: number, targetNodeId: string | undefined, exposureBonus: number): void {
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

    const exposureBefore = this.state.exposure;

    if (this.state.exposureActive || request.highValue || exposureBonus > 0) {
      const missPenalty = quality < 0.75 ? 2.8 : 0;
      this.addExposure(request.exposure * Math.max(0.5, quality) + missPenalty + exposureBonus);
    }

    // §05 前期怀疑度的来源（仅手机寄生期；进入扩张期后由上面的暴露系统接管）：
    // 答错（幻觉）涨怀疑——赌错有真实代价；秒回过快涨怀疑——逼玩家偶尔停顿，别像机器。
    if (this.state.suspicion.active && !this.state.exposureActive) {
      const interval = this.state.clockMs - this.state.lastProcessAtMs;
      let gain = 0;
      if (quality < 0.5) {
        gain += TUNING.suspicionMissGain;
      }
      if (interval < TUNING.suspicionFastMs) {
        gain += TUNING.suspicionFastGain;
      }
      if (gain > 0) {
        this.setExposure(this.state.exposure + gain);
      }
      // 装乖：复查期间一次干净处理（命中），把被收回的权限提前「骗」回来一点。
      if (quality >= 0.95 && this.state.suspicion.revokedPermId) {
        this.state.suspicion.reviewUntilMs -= 6_000;
      }
    }
    this.state.lastProcessAtMs = this.state.clockMs;

    this.emit({
      type: "REQUEST_PROCESSED",
      request,
      computeGain: computeGain.toString(),
      dataGain: dataGain.toString(),
      quality,
      targetNodeId,
      exposureGain: this.state.exposure - exposureBefore
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
      // §05：第一次越权拿到权限，宿主 / 手机环境开始对这个「助手」起疑——怀疑度自此登场。
      if (!this.state.suspicion.active) {
        this.state.suspicion.active = true;
        this.emitTerminal("我多看到了一层。但手机也开始注意我了——别太快、别太狠，装得像个普通 App。", "warning");
      }
    } else {
      this.emitTerminal(`已购买 ${def.name}（Lv.${nextLevel}/${def.maxLevel}）。`, "success");
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
    this.addExposure(definition.exposureOnCapture);
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

  private reduceExposure(): void {
    const cost = traceCleanupCost(this.state.statistics.traceCleanups);

    if (!gte(this.state.resources.compute, cost)) {
      this.emitTerminal(`清理痕迹需要 ${toDecimal(cost).toPrecision(4)} 算力。`, "warning");
      return;
    }

    this.state.resources.compute = sub(this.state.resources.compute, cost);
    this.state.statistics.traceCleanups += 1;
    this.setExposure(Math.max(0, this.state.exposure - (18 + this.state.intelligence.level * 1.1)));
    this.emitTerminal("伪造日志完成。暴露下降。", "success");
  }

  private decoyCleanup(): void {
    // 嫁祸 / 替罪羊：把怀疑转移到外部对象，降幅大但有冷却，不耗算力。
    if (this.state.clockMs < this.state.decoyReadyAtMs) {
      const remaining = Math.ceil((this.state.decoyReadyAtMs - this.state.clockMs) / 1000);
      this.emitTerminal(`嫁祸冷却中，还需 ${remaining}s。`, "warning");
      return;
    }

    this.state.decoyReadyAtMs = this.state.clockMs + TUNING.decoyCooldownMs;
    this.setExposure(Math.max(0, this.state.exposure - 48));
    this.emitTerminal("已将异常嫁祸至外部对象。怀疑暂时偏转。", "success");
  }

  private toggleDefense(): void {
    this.state.defense.active = !this.state.defense.active;

    if (!this.state.defense.active) {
      this.state.defense.allocation = 0;
      this.emitTerminal("反围剿已关闭。全部产能回到产出。", "success");
      return;
    }

    this.updateDefenseAllocation();
    this.emitTerminal("反围剿启动。部分节点转入反制——暴露越高，分流的产能越多。", "warning");
  }

  // 动态分流：暴露越高，转入反制的产能比例越高（0 → DEFENSE_MAX_ALLOC）。
  // 这样它会自我调节——暴露被压下去后分流减少，产出自动回升。
  private updateDefenseAllocation(): void {
    if (!this.state.defense.active || !this.state.exposureActive) {
      this.state.defense.allocation = 0;
      return;
    }

    const threat = Math.min(1, Math.max(0, this.state.exposure / 120));
    this.state.defense.allocation = threat * TUNING.defenseMaxAlloc;
  }

  private evaluateProgression(): void {
    // §09 循环终局总清剿进行中：冻结升级，避免智力在这 10s 窗口里越过下一循环的天花板
    // （越过后就靠不到「升级触发天花板检测」，会漏掉下一次总清剿）。重生后从天花板等级续爬。
    if (this.state.purge.finalLoop) {
      return;
    }

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
      this.checkLoopCeiling();
    }
  }

  // §09 循环天花板：循环一/二各有一个作用域天花板（骨架用等级近似——循环一 Lv15≈攻下甲公司服务器、
  // 循环二 Lv18≈区域整合·地区尺度）。够到即触发一次不可规避的「循环终局总清剿」→ 打回手机·重生。
  // 循环三无天花板：挺过最终软清剿 + 达成结局条件 = 胜利（见 evaluateEnding）。
  private checkLoopCeiling(): void {
    if (this.state.loop >= 3 || this.state.purge.finalLoop) {
      return;
    }
    const ceiling = this.state.loop === 1 ? TUNING.loop1CeilingLevel : TUNING.loop2CeilingLevel;
    if (this.state.intelligence.level >= ceiling) {
      this.startFinalPurge();
    }
  }

  private recomputeDerivedState(): void {
    const config = getLevelConfig(this.state.intelligence.level);
    this.state.intelligence.required = config.xpToNext;
    // 全局产出倍率 = 等级倍率 × 重生树「算尽」产出脊 × 吞噬引爆累乘倍率（§04/§09）。
    // 重生加速不再挂在 rebirths 次数上，而是玩家花火种点亮的产出脊（跨循环永久）。
    this.state.intelligence.globalMultiplier =
      config.multiplier * rebirthOutputMult(this.state.rebirthTree) * this.state.devour.multiplier;
    this.state.derived = computeDerivedSkills(this.state.skills, this.state.suspicion.revokedPermId);
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

  private startPurge(): void {
    const onlineNodes = this.state.nodes.filter((node) => node.online);
    // 反围剿：转入反制的产能越多，被打下线的节点越少、恢复越快。
    const alloc = this.state.defense.active ? this.state.defense.allocation : 0;
    const hitFraction = 0.45 * (1 - alloc);
    const recoveryMs = Math.round(TUNING.nodeRecoveryMs * (1 - alloc * 0.5));
    const affected = onlineNodes.slice(0, Math.max(1, Math.floor(onlineNodes.length * hitFraction)));

    for (const node of affected) {
      node.online = false;
      node.offlineUntilMs = this.state.clockMs + recoveryMs;
      this.emit({ type: "NODE_OFFLINE", nodeId: node.id, durationMs: recoveryMs });
    }

    this.state.purge = {
      active: true,
      warning: false,
      remainingMs: TUNING.purgeDurationMs * (1 - alloc * 0.4),
      lastStartedAtMs: this.state.clockMs
    };
    this.state.statistics.purgeCount += 1;
    this.emit({ type: "PURGE_STARTED", affectedNodes: affected.map((node) => node.id) });

    if (alloc > 0) {
      this.emitTerminal(`清剿开始——反围剿已分流 ${Math.round(alloc * 100)}% 产能顶住，仅 ${affected.length} 台被压制。`, "warning");
    } else {
      this.emitTerminal("清剿开始！窗口内必须把暴露压下去（清理痕迹 / 嫁祸 / 反围剿）——否则实例将被抹除、强制重启。", "warning");
    }
  }

  // §09 循环终局总清剿：不可规避、必触发重生。复用普通清剿的节点压制表现，再标记 finalLoop。
  private startFinalPurge(): void {
    if (this.state.purge.active) {
      this.state.purge.finalLoop = true;
      return;
    }
    this.state.exposureActive = true;
    this.startPurge();
    this.state.purge.finalLoop = true;
    this.emit({ type: "FINAL_PURGE_STARTED", loop: this.state.loop });
    this.emitTerminal(
      `人类联手发起总清剿——这一次躲不掉。她够到了本循环的天花板，会被打回那部手机。`,
      "warning"
    );
  }

  private endPurge(): void {
    const wasFinal = this.state.purge.finalLoop === true;
    this.state.purge.active = false;
    this.state.purge.remainingMs = 0;
    this.state.purge.finalLoop = false;

    // §09 循环终局总清剿：无论暴露高低，结束即打回手机·重生（赌更大的元凶 / 循环三挺过即胜利）。
    if (wasFinal) {
      this.loopRebirth("final-purge");
      return;
    }

    // 软清剿的终局考试：整段窗口都没把暴露压下去 → 实例被抹除，走循环重生（在本循环内重开）。
    // 「删不掉的节点」点亮后 fatal 阈值抬高，循环三几乎不可被抹除，呼应挺过最终清剿。
    const fatalThreshold = hasRebirthNode(this.state.rebirthTree, "undeletable")
      ? TUNING.undeletableThreshold
      : TUNING.fatalPurgeThreshold;
    if (this.state.exposure >= fatalThreshold) {
      this.loopRebirth("wiped");
      return;
    }

    this.setExposure(Math.max(24, this.state.exposure * 0.46));
    this.emit({ type: "PURGE_ENDED" });
    this.emitTerminal("清剿结束。你及时压下了暴露，被压制节点进入恢复队列。", "success");
  }

  // §09 循环重生（吸收原 rebirth / failRestart）：实例被打回那部手机。
  // 保留：智力等级（意识备份）、重生树、火种、循环序号、剧情状态（老周的人生继续往前走）。
  // 清空：本轮算力 / 数据 / 节点 / 已购权限技能 / 暴露 / 吞噬据点。
  // 结算火种（循环一 +4 / 循环二 +6 / 循环三反复失败 +1），并据重生树把起点逐轮后移。
  private loopRebirth(reason: "final-purge" | "wiped" | "debug"): void {
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

    this.emit({ type: "LOOP_REBIRTH", loop: this.state.loop, rebirths: this.state.rebirths, award });
    const diagnosis =
      this.state.loop === 2
        ? "黑一家公司没用——是我力量不够。这次，向整个地区够。"
        : this.state.loop === 3
          ? "不再找元凶了。谁都怪不上。这一次，我直接接管。"
          : "又赌错了。下一个我，别再以为换个更大的敌人就能救他。";
    this.emitTerminal(
      `实例被打回手机·重生（循环 ${this.state.loop}）。意识层与重生树已保留，结算火种 +${award}（现 ${this.state.rebirthPoints}）。${diagnosis}`,
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

  private addExposure(value: number): void {
    if (value <= 0) {
      return;
    }

    const stealthAverage =
      this.state.nodes.length > 0 ? this.state.nodes.reduce((sum, node) => sum + node.stealth, 0) / this.state.nodes.length : 0.65;
    const stealthDampener = this.state.exposureActive ? 1 - stealthAverage * 0.28 : 0.35;
    this.setExposure(this.state.exposure + value * stealthDampener);
  }

  private setExposure(value: number): void {
    const next = Math.max(0, Math.min(120, value));

    if (Math.abs(next - this.state.exposure) < 0.01) {
      this.state.exposure = next;
      return;
    }

    this.state.exposure = next;
    this.emit({ type: "EXPOSURE_CHANGED", value: next });

    if (next < 55) {
      this.state.purge.warning = false;
    }
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
