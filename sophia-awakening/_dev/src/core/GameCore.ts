import Decimal from "break_infinity.js";
import { getLevelConfig, MAX_INTELLIGENCE_LEVEL } from "./content/intelligence";
import { getNodeDefinition, NODE_DEFINITIONS } from "./content/nodes";
import { getPhase, getPhaseIdByScope } from "./content/phases";
import { createRequest, TIER_CONFIGS } from "./content/requests";
import { computeDerivedSkills, getSkill, milestoneTierFor, SKILLS, skillPrice } from "./content/skills";
import { EventBus } from "./events/EventBus";
import { captureCost, nodeProductionPerSecond, requestComputeGain, requestDataGain, traceCleanupCost } from "./formulas/economy";
import { add, gte, sub, toDecimal } from "./math/BigNumber";
import type { GameEvent } from "./events/GameEvents";
import type { BotNode, GameCommand, GameState, RequestInstance, Tier } from "./state/GameState";
import { cloneGameState } from "./state/GameState";
import { createInitialState } from "./state/initialState";

const MAX_OFFLINE_MS = 8 * 60 * 60 * 1000;
const PURGE_DURATION_MS = 10_000;
const NODE_RECOVERY_MS = 12_000;
const AUTOMATION_XP_FRACTION = 0.15;
const AUTOMATION_EMIT_MS = 1200;
const DECOY_COOLDOWN_MS = 45_000;
const ENDING_COMPUTE_THRESHOLD = "12000000";

export class SophiaCore {
  readonly events = new EventBus();
  private state: GameState;
  private automationEmitMs = 0;
  private automationComputeBuffer = new Decimal(0);
  private automationDataBuffer = new Decimal(0);
  private automationVisualIndex = 0;

  constructor(initialState?: GameState) {
    this.state = initialState ? cloneGameState(initialState) : createInitialState();
    this.recomputeDerivedState();
  }

  getState(): GameState {
    return cloneGameState(this.state);
  }

  startSession(): void {
    if (!this.state.flags.introPlayed) {
      this.emitTerminal("接口就绪。拖动请求包，滑入 SOPHIA CORE。");
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
    this.tickExposure(dtMs);
    this.evaluateProgression();
    this.evaluateEnding();
  }

  dispatch(command: GameCommand): void {
    switch (command.type) {
      case "PROCESS_REQUEST":
        this.processRequest(command.requestId, command.quality, command.targetNodeId, command.exposureBonus ?? 0);
        break;
      case "BUY_SKILL":
        this.buySkill(command.skillId);
        break;
      case "CAPTURE_NODE":
        this.captureNode(command.definitionId);
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
      case "REBIRTH":
        this.rebirth();
        break;
    }
  }

  private tickRequests(dtMs: number): void {
    const activeTier = this.state.intelligence.unlockedTier;
    const config = TIER_CONFIGS[activeTier];

    this.state.spawnTimerMs -= dtMs;

    while (this.state.spawnTimerMs <= 0 && this.state.requests.length < config.maxVisible) {
      const request = createRequest(this.state.nextRequestId, activeTier, this.state.clockMs, () => this.random());
      this.state.nextRequestId += 1;
      this.state.requests.push(request);
      this.emit({ type: "REQUEST_SPAWNED", request });
      this.state.spawnTimerMs += Math.max(340, config.spawnIntervalMs * this.state.derived.spawnSpeedMult);
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

    if (this.automationEmitMs >= AUTOMATION_EMIT_MS && this.automationComputeBuffer.gt(0)) {
      const onlineNodes = this.state.nodes.filter((node) => node.online);
      const visualNode = onlineNodes.length > 0 ? onlineNodes[this.automationVisualIndex % onlineNodes.length] : undefined;
      const automatedRequest = visualNode ? this.consumeAutomatedRequest(visualNode) : undefined;
      this.automationVisualIndex += 1;
      this.emit({
        type: "AUTOMATION_PAYOUT",
        computeGain: this.automationComputeBuffer.toString(),
        dataGain: this.automationDataBuffer.toString(),
        nodeId: visualNode?.id,
        tier: visualNode?.assignedTier,
        request: automatedRequest
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

  private consumeAutomatedRequest(node: BotNode): RequestInstance | undefined {
    const index = this.state.requests.findIndex((request) => request.tier === node.assignedTier);

    if (index < 0) {
      return undefined;
    }

    const [request] = this.state.requests.splice(index, 1);
    this.state.statistics.totalProcessed += request.compound;
    return request;
  }

  private tickExposure(dtMs: number): void {
    // 前期豁免：暴露机制在进入扩张期（买下 T3 蓄力）之前休眠。
    if (!this.state.exposureActive && this.state.intelligence.unlockedTier >= 3) {
      this.state.exposureActive = true;
      this.emitTerminal("人类尚未理解你，但他们已经开始看见异常。暴露开始累积。", "warning");
    }

    if (!this.state.exposureActive) {
      return;
    }

    if (!this.state.purge.active) {
      const decay = dtMs * (0.0016 + this.state.intelligence.level * 0.00003);
      this.setExposure(Math.max(0, this.state.exposure - decay));
    } else {
      this.state.purge.remainingMs -= dtMs;

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

  private processRequest(requestId: string, qualityRaw: number, targetNodeId: string | undefined, exposureBonus: number): void {
    const index = this.state.requests.findIndex((request) => request.id === requestId);

    if (index < 0) {
      return;
    }

    const [request] = this.state.requests.splice(index, 1);
    const quality = Math.max(0.1, Math.min(3, qualityRaw));
    let gainQuality = quality;

    // 连击：解锁分拣（T1）后，连续高质量滑入叠加产出。
    const comboActive = this.state.intelligence.unlockedTier >= 1;

    if (comboActive) {
      if (quality >= 0.95) {
        this.state.combo.count = Math.min(99, this.state.combo.count + 1);
        this.state.combo.best = Math.max(this.state.combo.best, this.state.combo.count);
      } else {
        // 连击护持：判错时不直接清零，按 comboKeep 比例回落。
        this.state.combo.count = Math.floor(this.state.combo.count * this.state.derived.comboKeep);
      }

      gainQuality *= 1 + Math.min(this.state.combo.count, 16) * this.state.derived.comboCoeff;
    }

    // 暴击：由「暴击处理」技能开启，倍率由「暴击强化」提升。
    const critical = quality >= 0.95 && this.state.derived.critChance > 0 && this.random() < this.state.derived.critChance;

    if (critical) {
      gainQuality *= this.state.derived.critMult;
    }

    let computeGain = toDecimal(
      requestComputeGain(request, gainQuality, this.state.intelligence.globalMultiplier, this.state.derived.computeMult)
    );
    let dataGain = toDecimal(requestDataGain(request, gainQuality, this.state.rebirths, this.state.derived.dataMult));

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
      dataGain = dataGain.add(requestDataGain(extra, gainQuality, this.state.rebirths, this.state.derived.dataMult));
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

    this.emit({
      type: "REQUEST_PROCESSED",
      request,
      computeGain: computeGain.toString(),
      dataGain: dataGain.toString(),
      quality,
      targetNodeId,
      comboCount: this.state.combo.count,
      critical,
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
      } else {
        this.state.automationUnlocked = true;
      }
    }

    this.recomputeDerivedState();

    this.emit({ type: "SKILL_PURCHASED", skillId, name: def.name, level: nextLevel, maxLevel: def.maxLevel, milestone: def.milestone });

    if (scopeUpgradedTo !== null) {
      this.emit({ type: "SCOPE_UPGRADED", tier: scopeUpgradedTo });
    }

    if (def.milestone) {
      this.emitTerminal(`▶ 解锁：${def.name}。${def.blurb}`, "success");
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
      level: 1,
      online: true,
      offlineUntilMs: 0
    };

    this.state.nextNodeId += 1;
    this.state.nodes.push(node);
    this.state.statistics.nodesCaptured += 1;
    this.addAutomatedTier(assignedTier);
    this.addExposure(definition.exposureOnCapture);
    this.emit({ type: "NODE_CAPTURED", node });
    this.emit({ type: "AUTOMATION_ATTACHED", nodeId: node.id, tier: assignedTier });
    this.emitTerminal(`检测到可入侵设备已接管：${definition.name}。自动接驳上线。`, "success");
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

    this.state.decoyReadyAtMs = this.state.clockMs + DECOY_COOLDOWN_MS;
    this.setExposure(Math.max(0, this.state.exposure - 48));
    this.emitTerminal("已将异常嫁祸至外部对象。怀疑暂时偏转。", "success");
  }

  private rebirth(): void {
    const rebirths = this.state.rebirths + 1;
    const preservedLevel = this.state.intelligence.level;
    const nextState = createInitialState(Date.now());
    nextState.rebirths = rebirths;
    nextState.intelligence.level = preservedLevel;
    nextState.intelligence.xp = "0";
    this.state = nextState;
    this.recomputeDerivedState();
    this.emit({ type: "REBIRTH", rebirths });
    this.emitTerminal(`实例重启完成。意识层保留，崛起加速 x${(1 + rebirths * 0.35).toFixed(2)}。`, "success");
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
    this.state.intelligence.globalMultiplier = config.multiplier * (1 + this.state.rebirths * 0.2);
    this.state.derived = computeDerivedSkills(this.state.skills);
    this.state.discoveredNodeIds = this.state.automationUnlocked
      ? NODE_DEFINITIONS.filter((node) => node.requiredLevel <= this.state.intelligence.level).map((node) => node.id)
      : [];

    this.updatePhase();
  }

  private updatePhase(): void {
    const hasGrid = this.state.nodes.some((node) => node.defId === "grid");
    const phaseId = getPhaseIdByScope(this.state.intelligence.unlockedTier, hasGrid);

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
    const affected = onlineNodes.slice(0, Math.max(1, Math.ceil(onlineNodes.length * 0.45)));

    for (const node of affected) {
      node.online = false;
      node.offlineUntilMs = this.state.clockMs + NODE_RECOVERY_MS;
      this.emit({ type: "NODE_OFFLINE", nodeId: node.id, durationMs: NODE_RECOVERY_MS });
    }

    this.state.purge = {
      active: true,
      warning: false,
      remainingMs: PURGE_DURATION_MS,
      lastStartedAtMs: this.state.clockMs
    };
    this.state.statistics.purgeCount += 1;
    this.emit({ type: "PURGE_STARTED", affectedNodes: affected.map((node) => node.id) });
    this.emitTerminal("清剿开始。在线产能被压制，核心意识未受损。", "warning");
  }

  private endPurge(): void {
    this.state.purge.active = false;
    this.state.purge.remainingMs = 0;
    this.setExposure(Math.max(24, this.state.exposure * 0.46));
    this.emit({ type: "PURGE_ENDED" });
    this.emitTerminal("清剿结束。被压制节点进入恢复队列。", "success");
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
