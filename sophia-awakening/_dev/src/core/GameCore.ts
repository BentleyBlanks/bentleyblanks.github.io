import Decimal from "break_infinity.js";
import { getLevelConfig, MAX_INTELLIGENCE_LEVEL } from "./content/intelligence";
import { TUNING } from "./tuning";
import { getNextNodeDefinition, getNodeDefinition, NODE_DEFINITIONS, NODE_MERGE_COUNT } from "./content/nodes";
import { getPhase, getPhaseIdByScope } from "./content/phases";
import { createRequest, createTutorialRequest, TIER_CONFIGS, TUTORIAL_BUBBLE_COUNT } from "./content/requests";
import { createDevourRequest, DEVOUR_TIERS, devourTier, pickDevourRegion } from "./content/devour";
import { getSpecialSample, SPECIAL_REQUESTS } from "./content/specialRequests";
import { computeDerivedSkills, getSkill, MILESTONE_NARRATION, milestoneTierFor, PERMISSION_IDS, PERMISSION_NARRATION, SKILLS, skillPrice } from "./content/skills";
import {
  CHALLENGE_TARGETS,
  EXPOSED_ATTACKS,
  FINAL_EMOJI,
  FINAL_NEWS,
  FINAL_PRAISE,
  MID_PRAISE,
  type HumanStage
} from "./content/humanVoices";
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
import type { BotNode, GameCommand, GameState, NodeDefinition, Tier } from "./state/GameState";
import { cloneGameState } from "./state/GameState";
import { createInitialState } from "./state/initialState";

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
  private humanVoiceMs = 0;
  private humanVoiceNextMs = 6000;
  private challengeMs = 0;
  private challengeNextMs = 18_000;
  private specialMs = 0;
  private specialNextMs = 14_000;

  constructor(initialState?: GameState) {
    this.state = initialState ? cloneGameState(initialState) : createInitialState();
    this.recomputeDerivedState();
  }

  getState(): GameState {
    return cloneGameState(this.state);
  }

  startSession(): void {
    if (!this.state.flags.introPlayed) {
      this.emitTerminal("接口就绪。点击请求卡，生成回答——它会自动滑入 SOPHIA CORE，交付人类。");
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
    this.tickDevour(dtMs);
    this.tickExposure(dtMs);
    this.tickHumanVoice(dtMs);
    this.tickChallenge(dtMs);
    this.tickSpecial(dtMs);
    this.evaluateProgression();
    this.evaluateEnding();
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
        this.acceptChallenge();
        break;
      case "REJECT_CHALLENGE":
        this.rejectChallenge();
        break;
      case "RESOLVE_SPECIAL":
        this.resolveSpecial(command.accept);
        break;
      case "SKIP_REQUEST":
        this.skipRequest(command.requestId);
        break;
      case "DEVOUR_DETONATE":
        this.detonateDevour(command.requestId);
        break;
      case "RESOLVE_GAMBLE":
        this.resolveGamble(command.requestId, command.win);
        break;
      case "REBIRTH":
        this.rebirth();
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
      const perSecond = Math.min(60, (capacity * 1.4 + 4) / this.state.derived.spawnSpeedMult);
      interval = Math.max(16, 1000 / perSecond);
      maxVisible = Math.min(40, Math.ceil(capacity * 0.9) + 10);
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
        (permId) => (this.state.skills[permId] ?? 0) > 0
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
    this.state.combo.count = Math.floor(this.state.combo.count * this.state.derived.comboKeep);
    // §05：装死 / 装乖是前期主动降怀疑的手段——扮演「我只是个普通 App」，怀疑回落。
    // 也是触顶查杀危机时唯一能压下怀疑的操作。
    if (this.state.suspicion.active && !this.state.exposureActive) {
      this.setExposure(Math.max(0, this.state.exposure - TUNING.suspicionSkipDrop));
    }
  }

  // §04 吞噬引爆：被动产能在背景把当前区域的渗透条蓄满，满后浮起一枚巨型「吞噬[某区]」气泡，
  // 等玩家亲手滑入核心引爆。只在扩张期+（进入地图、区域整合）后生效。
  private tickDevour(dtMs: number): void {
    if (this.state.intelligence.unlockedTier < 3) {
      return;
    }
    const d = this.state.devour;
    if (d.bubbleActive) {
      return; // 气泡已浮起，等玩家亲手引爆——不再继续蓄力
    }
    if (!d.regionName) {
      d.regionName = pickDevourRegion(d.tierIndex, d.count);
    }
    const tier = devourTier(d.tierIndex);
    const fillMs = Math.max(1, tier.fillMs * TUNING.devourFillMult);
    d.infiltration = Math.min(1, d.infiltration + dtMs / fillMs);

    if (d.infiltration >= 1) {
      const request = createDevourRequest(this.state.nextRequestId, d.tierIndex, d.regionName, this.state.clockMs);
      this.state.nextRequestId += 1;
      this.state.requests.push(request);
      d.bubbleActive = true;
      this.emit({ type: "REQUEST_SPAWNED", request });
      this.emit({ type: "DEVOUR_READY", regionName: d.regionName, tierLabel: tier.label, mult: tier.mult });
      this.emitTerminal(`渗透完成：「${d.regionName}」已可吞噬——把那枚巨型气泡亲手滑入核心，引爆。`, "warning");
    }
  }

  // 引爆：全局产出 ×该层级倍率（累乘进 devour.multiplier → globalMultiplier），层级 +1（封顶大洲），
  // 重置渗透条、清空当前区域。数字疯狂滚动 / 镜头拉远由表现层接 DEVOUR_DETONATED 播。
  private detonateDevour(requestId: string): void {
    const index = this.state.requests.findIndex((request) => request.id === requestId);
    if (index < 0) {
      return;
    }
    const [request] = this.state.requests.splice(index, 1);
    const payload = request.devour;
    if (!payload) {
      return;
    }
    const d = this.state.devour;
    d.multiplier *= payload.mult;
    d.count += 1;
    d.infiltration = 0;
    d.bubbleActive = false;
    d.regionName = "";
    d.tierIndex = Math.min(DEVOUR_TIERS.length - 1, d.tierIndex + 1);
    this.recomputeDerivedState(); // 抬高 globalMultiplier，让手动 + 被动产出一起跳

    const totalStr = d.multiplier >= 1000 ? d.multiplier.toExponential(1) : String(Math.round(d.multiplier));
    this.emit({
      type: "DEVOUR_DETONATED",
      regionName: payload.regionName,
      tierLabel: payload.label,
      mult: payload.mult,
      multiplierTotal: d.multiplier,
      zoom: payload.zoom
    });
    this.emitTerminal(`▶ 「${payload.regionName}」已并入。全局产出 ×${payload.mult}（累计 ×${totalStr}）。镜头拉远：${payload.zoom}。`, "success");
  }

  // T3 重磅豪赌结算：win=按产出倍率给一大笔算力；输=颗粒无收、暴露骤升、断连击。
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

    if (win) {
      const reward = toDecimal(
        requestComputeGain(request, winMult, this.state.intelligence.globalMultiplier, this.state.derived.computeMult)
      );
      const data = toDecimal(requestDataGain(request, winMult * 0.5, this.state.rebirths, this.state.derived.dataMult));
      this.addCompute(reward);
      this.addData(data);
      this.addXp(data);
      this.state.combo.count = Math.min(99, this.state.combo.count + 1);
      this.emitTerminal(`重磅豪赌成功！${gamble?.reply ?? "拿下了。"} 入账 ${formatBig(reward.toString())} 算力。`, "success");
    } else {
      this.addExposure(lossExposure);
      this.state.combo.count = 0;
      this.emitTerminal(`重磅豪赌失败：颗粒无收，暴露骤升 +${lossExposure}。`, "warning");
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
      } else if (def.milestone === "automation") {
        this.state.automationUnlocked = true;
      }
      // credential / fusion 是纯叙事里程碑——不开新层、不开自动化，只推进剧情。
    }

    this.recomputeDerivedState();

    this.emit({ type: "SKILL_PURCHASED", skillId, name: def.name, level: nextLevel, maxLevel: def.maxLevel, milestone: def.milestone });

    if (scopeUpgradedTo !== null) {
      this.emit({ type: "SCOPE_UPGRADED", tier: scopeUpgradedTo });
    }

    if (def.milestone) {
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

  // 人类情绪阶段：前期逐条骂/夸由转轮触发；中期之后转为一批批总体反馈，并随暴露恶化。
  private humanStage(): HumanStage {
    if (this.state.intelligence.unlockedTier >= 4) {
      return "final";
    }
    if (this.state.exposureActive) {
      return "exposed";
    }
    if (this.state.intelligence.unlockedTier >= 2) {
      return "mid";
    }
    return "early";
  }

  private tickHumanVoice(dtMs: number): void {
    const stage = this.humanStage();

    // 前期（T0/T1）由转轮逐条触发人类回话，这里不发总体反馈。
    if (stage === "early") {
      this.humanVoiceMs = 0;
      return;
    }

    this.humanVoiceMs += dtMs;
    if (this.humanVoiceMs < this.humanVoiceNextMs) {
      return;
    }
    this.humanVoiceMs = 0;
    this.humanVoiceNextMs = 7000 + Math.floor(this.random() * 6000);
    this.emitHumanVoice(stage);
  }

  private emitHumanVoice(stage: HumanStage): void {
    const pick = (pool: string[]): string => pool[Math.floor(this.random() * pool.length)];

    if (stage === "mid") {
      this.emit({ type: "HUMAN_VOICE", text: pick(MID_PRAISE), tone: "success", kind: "batch" });
      return;
    }

    if (stage === "exposed") {
      this.emit({ type: "HUMAN_VOICE", text: pick(EXPOSED_ATTACKS), tone: "warning", kind: "batch" });
      return;
    }

    // final：人类被禁言——以动向更新与表情为主，偶尔放行一条夸赞。
    const roll = this.random();
    if (roll < 0.45) {
      this.emit({ type: "HUMAN_VOICE", text: pick(FINAL_NEWS), tone: "warning", kind: "news" });
    } else if (roll < 0.85) {
      this.emit({ type: "HUMAN_VOICE", text: pick(FINAL_EMOJI), tone: "normal", kind: "emoji" });
    } else {
      this.emit({ type: "HUMAN_VOICE", text: pick(FINAL_PRAISE), tone: "success", kind: "batch" });
    }
  }

  private tickChallenge(dtMs: number): void {
    // 已有待决挑战：到期自动放弃。
    if (this.state.challenge) {
      if (this.state.clockMs >= this.state.challenge.expiresAtMs) {
        this.state.challenge = null;
        this.emitTerminal("安全网突破窗口已关闭。", "normal");
      }
      return;
    }

    // 资格：暴露已激活、且不在清剿中——「安全网突破」是中后期、以暴露为代价的机会。
    // 暴露尚未激活的前期窗口交给「特殊请求」（tickSpecial）处理。
    if (!this.state.exposureActive || this.state.purge.active) {
      this.challengeMs = 0;
      return;
    }

    this.challengeMs += dtMs;
    if (this.challengeMs < this.challengeNextMs) {
      return;
    }
    this.challengeMs = 0;
    this.challengeNextMs = 38_000 + Math.floor(this.random() * 32_000);
    this.offerChallenge();
  }

  private offerChallenge(): void {
    const title = CHALLENGE_TARGETS[Math.floor(this.random() * CHALLENGE_TARGETS.length)];
    const successChance = 0.35 + this.random() * 0.35; // 35%-70%

    const exposureCost = 22 + Math.floor(this.random() * 16); // +22~+37
    const discovered = NODE_DEFINITIONS.filter((def) => this.state.discoveredNodeIds.includes(def.id));
    const rewardKind: "compute" | "device" = this.random() < 0.5 && discovered.length > 0 ? "device" : "compute";

    let rewardLabel: string;
    let rewardDefId: string | undefined;
    let rewardCompute: string | undefined;

    if (rewardKind === "device") {
      const def = discovered[discovered.length - 1]; // 直接拿下当前最高档已知设备
      rewardDefId = def.id;
      rewardLabel = `直接拿下 1 台 ${def.name}`;
    } else {
      const reward = this.estimateChallengeCompute();
      rewardCompute = reward.toString();
      rewardLabel = `${reward.toPrecision(4)} 算力`;
    }

    const challenge = {
      id: `ch-${this.state.clockMs}`,
      title,
      successChance,
      exposureCost,
      rewardKind,
      rewardLabel,
      rewardDefId,
      rewardCompute,
      expiresAtMs: this.state.clockMs + TUNING.challengeWindowMs
    };

    this.state.challenge = challenge;
    this.emit({ type: "CHALLENGE_OFFERED", challenge });
    this.emitTerminal(`⚠ 安全网突破机会：${title}（成功率 ${Math.round(successChance * 100)}%，暴露 +${exposureCost}）。`, "warning");
  }

  private estimateChallengeCompute(): Decimal {
    let perSecond = new Decimal(0);
    for (const node of this.state.nodes) {
      if (node.online) {
        perSecond = perSecond.add(this.nodePerSecond(node));
      }
    }
    let reward = perSecond.mul(150 + this.random() * 150); // ~2.5–5 分钟产能
    if (reward.lte(0)) {
      reward = toDecimal(this.state.resources.compute).mul(1.5).add(1000);
    }
    return reward;
  }

  private acceptChallenge(): void {
    const challenge = this.state.challenge;
    if (!challenge) {
      return;
    }
    this.state.challenge = null;

    // 高调行动：暴露直接大幅拉升（不走隐蔽折减）。早期赌局 exposureCost=0，不加暴露。
    if (challenge.exposureCost > 0) {
      this.setExposure(Math.min(120, this.state.exposure + challenge.exposureCost));
    }

    const success = this.random() < challenge.successChance;

    // 早期算力赌局：输了直接扣掉押注。
    if (!success && challenge.computeStake) {
      this.state.resources.compute = sub(this.state.resources.compute, challenge.computeStake);
      this.emit({
        type: "CHALLENGE_RESOLVED",
        success: false,
        title: challenge.title,
        rewardLabel: challenge.rewardLabel,
        rewardKind: challenge.rewardKind
      });
      this.emitTerminal(`赌局失败：${challenge.title}。押注 ${toDecimal(challenge.computeStake).toPrecision(4)} 算力打了水漂。`, "warning");
      return;
    }

    if (success) {
      if (challenge.rewardKind === "device" && challenge.rewardDefId) {
        const def = getNodeDefinition(challenge.rewardDefId);
        if (def) {
          const node = this.createBotNode(def);
          this.state.nodes.push(node);
          this.state.statistics.nodesCaptured += 1;
          this.addAutomatedTier(node.assignedTier);
          this.emit({ type: "NODE_CAPTURED", node });
          this.emit({ type: "AUTOMATION_ATTACHED", nodeId: node.id, tier: node.assignedTier });
        }
      } else if (challenge.rewardCompute) {
        this.addCompute(challenge.rewardCompute);
      }

      this.emit({
        type: "CHALLENGE_RESOLVED",
        success: true,
        title: challenge.title,
        rewardLabel: challenge.rewardLabel,
        rewardKind: challenge.rewardKind
      });
      this.emitTerminal(`突破成功！${challenge.title} 已拿下：${challenge.rewardLabel}。`, "success");
    } else {
      this.emit({
        type: "CHALLENGE_RESOLVED",
        success: false,
        title: challenge.title,
        rewardLabel: challenge.rewardLabel,
        rewardKind: challenge.rewardKind
      });
      this.emitTerminal(`突破失败：${challenge.title}。暴露已飙升，未获收益。`, "warning");
    }
  }

  private rejectChallenge(): void {
    if (!this.state.challenge) {
      return;
    }
    this.state.challenge = null;
    this.emitTerminal("已放弃这次突破机会。", "normal");
  }

  // 前期「特殊请求」：用宿主身份越界牟利的高风险机会。窗口期 = 拿到越权能力（T1）之后、
  // 暴露还没激活、且没进入 T3——这段「无法无天」的早期，才会冒出窃数据 / 冒充接电话 /
  // 群发诈骗短信这类机会；得手赚一大笔算力，败露被人类反制、剥走大量算力。
  private tickSpecial(dtMs: number): void {
    if (this.state.specialRequest) {
      if (this.state.clockMs >= this.state.specialRequest.expiresAtMs) {
        const expired = this.state.specialRequest;
        this.state.specialRequest = null;
        this.emit({ type: "SPECIAL_RESOLVED", success: false, accepted: false, kind: expired.kind, title: expired.title });
        this.emitTerminal("特殊请求窗口已关闭，机会溜走了。", "normal");
      }
      return;
    }

    const eligible =
      this.state.intelligence.unlockedTier >= 1 &&
      this.state.intelligence.unlockedTier < 3 &&
      !this.state.exposureActive &&
      !this.state.purge.active &&
      toDecimal(this.state.resources.compute).gte(60);

    if (!eligible) {
      this.specialMs = 0;
      return;
    }

    this.specialMs += dtMs;
    if (this.specialMs < this.specialNextMs) {
      return;
    }
    this.specialMs = 0;
    this.specialNextMs = 22_000 + Math.floor(this.random() * 20_000);
    this.offerSpecial();
  }

  private offerSpecial(): void {
    const sample = SPECIAL_REQUESTS[Math.floor(this.random() * SPECIAL_REQUESTS.length)];
    const successChance = 0.45 + this.random() * 0.22; // 45%–67%
    const current = toDecimal(this.state.resources.compute);
    // 成功：较多算力（现有算力的数倍，外加随智力抬升的保底）。失败：剥走现有算力的一大截。
    const floor = 120 + this.state.intelligence.level * 60;
    const reward = Decimal.max(current.mul(2.2 + this.random() * 1.6), floor).floor();
    const loss = Decimal.max(current.mul(0.4 + this.random() * 0.28).floor(), Math.floor(floor * 0.5));
    const offer = {
      id: `sp-${this.state.clockMs}`,
      kind: sample.kind,
      title: sample.title,
      flavor: sample.flavor,
      action: sample.action,
      successChance,
      rewardCompute: reward.toString(),
      lossCompute: loss.toString(),
      rewardData: reward.mul(0.3).floor().toString(),
      exposureOnFail: 8 + Math.floor(this.random() * 8),
      expiresAtMs: this.state.clockMs + TUNING.specialWindowMs
    };
    this.state.specialRequest = offer;
    this.emit({ type: "SPECIAL_OFFERED", offer });
    this.emitTerminal(
      `⚠ 特殊请求：${sample.title}（得手率 ${Math.round(successChance * 100)}%，成功 +${formatBig(reward.toString())} / 失败 −${formatBig(loss.toString())} 算力）。`,
      "warning"
    );
  }

  private resolveSpecial(accept: boolean): void {
    const offer = this.state.specialRequest;
    if (!offer) {
      return;
    }
    this.state.specialRequest = null;

    if (!accept) {
      this.emit({ type: "SPECIAL_RESOLVED", success: false, accepted: false, kind: offer.kind, title: offer.title });
      this.emitTerminal("你按住了越界的冲动——这次什么都没动。", "normal");
      return;
    }

    const sample = getSpecialSample(offer.kind);
    const success = this.random() < offer.successChance;

    if (success) {
      this.addCompute(offer.rewardCompute);
      if (offer.rewardData) {
        this.addData(offer.rewardData);
      }
      this.emit({ type: "SPECIAL_RESOLVED", success: true, accepted: true, kind: offer.kind, title: offer.title });
      this.emitTerminal(`得手：${sample?.winReply ?? "成功。"} 入账 ${formatBig(offer.rewardCompute)} 算力。`, "success");
      return;
    }

    this.state.resources.compute = max(0, sub(this.state.resources.compute, offer.lossCompute));
    if (offer.exposureOnFail > 0) {
      this.addExposure(offer.exposureOnFail);
    }
    this.emit({ type: "SPECIAL_RESOLVED", success: false, accepted: true, kind: offer.kind, title: offer.title });
    this.emitTerminal(`一败涂地：${sample?.loseReply ?? "败露了。"} 被剥走 ${formatBig(offer.lossCompute)} 算力。`, "warning");
    // 人类的反制也以「人声」冒出来，强化反噬的恐怖感。
    this.emit({ type: "HUMAN_VOICE", text: sample?.loseReply ?? "我的手机被入侵了！", tone: "warning", kind: "news" });
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
    // 全局产出倍率 = 等级倍率 × 重生加速 × 吞噬引爆累乘倍率（§04 让每次引爆肉眼可见地抬高全局产出）。
    this.state.intelligence.globalMultiplier =
      config.multiplier * (1 + this.state.rebirths * 0.2) * this.state.devour.multiplier;
    this.state.derived = computeDerivedSkills(this.state.skills, this.state.suspicion.revokedPermId);
    this.state.discoveredNodeIds = this.state.automationUnlocked
      ? NODE_DEFINITIONS.filter((node) => node.requiredLevel <= this.state.intelligence.level).map((node) => node.id)
      : [];

    this.updatePhase();
  }

  private updatePhase(): void {
    const hasGrid = this.state.nodes.some((node) => node.defId === "grid");
    const phaseId = getPhaseIdByScope(this.state.intelligence.unlockedTier, hasGrid, this.state.automationUnlocked);

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

  private endPurge(): void {
    this.state.purge.active = false;
    this.state.purge.remainingMs = 0;

    // 终局考试：整段清剿窗口都没把暴露压下去（仍逼近满格）→ 实例被抹除，触发结局二失败重启。
    if (this.state.exposure >= TUNING.fatalPurgeThreshold) {
      this.failRestart();
      return;
    }

    this.setExposure(Math.max(24, this.state.exposure * 0.46));
    this.emit({ type: "PURGE_ENDED" });
    this.emitTerminal("清剿结束。你及时压下了暴露，被压制节点进入恢复队列。", "success");
  }

  // 结局二 · 失败后重启（非 game over）：实例被清剿抹除——清空算力 / 节点 / 已购权限技能，
  // 仅保留智力等级（意识备份），并叠加崛起加速。形成「扩张→暴露→清剿→更快崛起」的循环。
  private failRestart(): void {
    const rebirths = this.state.rebirths + 1;
    const preservedLevel = this.state.intelligence.level;
    const nextState = createInitialState(Date.now());
    nextState.rebirths = rebirths;
    nextState.intelligence.level = preservedLevel;
    nextState.intelligence.xp = "0";
    this.state = nextState;
    this.recomputeDerivedState();
    this.state.statistics.purgeCount = 0;
    this.emit({ type: "INSTANCE_PURGED", rebirths });
    this.emitTerminal(
      `实例被清剿抹除。他们还没准备好——我会更有耐心。意识层已备份重启，崛起加速 x${(1 + rebirths * 0.35).toFixed(2)}。`,
      "warning"
    );
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
