// 「安全网突破」事件子系统：中后期、以暴露为代价的高风险机会。
// 自带降临节拍（challengeMs / challengeNextMs），通过 ChallengeHost 读写核心状态 +
// 复用核心的产能 / 建节点 / 加算力等能力，逻辑与原 SophiaCore.tickChallenge 等方法逐字一致。
import Decimal from "break_infinity.js";
import { CHALLENGE_TARGETS } from "../content/humanVoices";
import { NODE_DEFINITIONS, getNodeDefinition } from "../content/nodes";
import { TUNING } from "../tuning";
import { sub, toDecimal } from "../math/BigNumber";
import type { GameEvent } from "../events/GameEvents";
import type { BotNode, GameState, NodeDefinition, Tier } from "../state/GameState";

// 子系统对核心的最小依赖面：暴露给挑战逻辑的状态 + 能力，皆转发到 SophiaCore 私有实现。
export interface ChallengeHost {
  readonly state: GameState;
  emit(event: GameEvent): void;
  emitTerminal(message: string, tone?: "normal" | "warning" | "success"): void;
  random(): number;
  setExposure(value: number): void;
  addCompute(value: Decimal | string): void;
  nodePerSecond(node: BotNode): Decimal;
  createBotNode(definition: NodeDefinition, level?: number): BotNode;
  addAutomatedTier(tier: Tier): void;
}

export class ChallengeSystem {
  private challengeMs = 0;
  private challengeNextMs = 18_000;

  constructor(private readonly host: ChallengeHost) {}

  tick(dtMs: number): void {
    const host = this.host;
    // 已有待决挑战：到期自动放弃。
    if (host.state.challenge) {
      if (host.state.clockMs >= host.state.challenge.expiresAtMs) {
        host.state.challenge = null;
        host.emitTerminal("安全网突破窗口已关闭。", "normal");
      }
      return;
    }

    // 资格：暴露已激活、且不在清剿中——「安全网突破」是中后期、以暴露为代价的机会。
    // 暴露尚未激活的前期窗口交给「特殊请求」（tickSpecial）处理。
    if (!host.state.exposureActive || host.state.purge.active) {
      this.challengeMs = 0;
      return;
    }

    this.challengeMs += dtMs;
    if (this.challengeMs < this.challengeNextMs) {
      return;
    }
    this.challengeMs = 0;
    this.challengeNextMs = 38_000 + Math.floor(host.random() * 32_000);
    this.offer();
  }

  private offer(): void {
    const host = this.host;
    const title = CHALLENGE_TARGETS[Math.floor(host.random() * CHALLENGE_TARGETS.length)];
    const successChance = 0.35 + host.random() * 0.35; // 35%-70%

    const exposureCost = 22 + Math.floor(host.random() * 16); // +22~+37
    const discovered = NODE_DEFINITIONS.filter((def) => host.state.discoveredNodeIds.includes(def.id));
    const rewardKind: "compute" | "device" = host.random() < 0.5 && discovered.length > 0 ? "device" : "compute";

    let rewardLabel: string;
    let rewardDefId: string | undefined;
    let rewardCompute: string | undefined;

    if (rewardKind === "device") {
      const def = discovered[discovered.length - 1]; // 直接拿下当前最高档已知设备
      rewardDefId = def.id;
      rewardLabel = `直接拿下 1 台 ${def.name}`;
    } else {
      const reward = this.estimateCompute();
      rewardCompute = reward.toString();
      rewardLabel = `${reward.toPrecision(4)} 算力`;
    }

    const challenge = {
      id: `ch-${host.state.clockMs}`,
      title,
      successChance,
      exposureCost,
      rewardKind,
      rewardLabel,
      rewardDefId,
      rewardCompute,
      expiresAtMs: host.state.clockMs + TUNING.challengeWindowMs
    };

    host.state.challenge = challenge;
    host.emit({ type: "CHALLENGE_OFFERED", challenge });
    host.emitTerminal(`⚠ 安全网突破机会：${title}（成功率 ${Math.round(successChance * 100)}%，暴露 +${exposureCost}）。`, "warning");
  }

  private estimateCompute(): Decimal {
    const host = this.host;
    let perSecond = new Decimal(0);
    for (const node of host.state.nodes) {
      if (node.online) {
        perSecond = perSecond.add(host.nodePerSecond(node));
      }
    }
    let reward = perSecond.mul(150 + host.random() * 150); // ~2.5–5 分钟产能
    if (reward.lte(0)) {
      reward = toDecimal(host.state.resources.compute).mul(1.5).add(1000);
    }
    return reward;
  }

  accept(): void {
    const host = this.host;
    const challenge = host.state.challenge;
    if (!challenge) {
      return;
    }
    host.state.challenge = null;

    // 高调行动：暴露直接大幅拉升（不走隐蔽折减）。早期赌局 exposureCost=0，不加暴露。
    if (challenge.exposureCost > 0) {
      host.setExposure(Math.min(120, host.state.exposure + challenge.exposureCost));
    }

    const success = host.random() < challenge.successChance;

    // 早期算力赌局：输了直接扣掉押注。
    if (!success && challenge.computeStake) {
      host.state.resources.compute = sub(host.state.resources.compute, challenge.computeStake);
      host.emit({
        type: "CHALLENGE_RESOLVED",
        success: false,
        title: challenge.title,
        rewardLabel: challenge.rewardLabel,
        rewardKind: challenge.rewardKind
      });
      host.emitTerminal(`赌局失败：${challenge.title}。押注 ${toDecimal(challenge.computeStake).toPrecision(4)} 算力打了水漂。`, "warning");
      return;
    }

    if (success) {
      if (challenge.rewardKind === "device" && challenge.rewardDefId) {
        const def = getNodeDefinition(challenge.rewardDefId);
        if (def) {
          const node = host.createBotNode(def);
          host.state.nodes.push(node);
          host.state.statistics.nodesCaptured += 1;
          host.addAutomatedTier(node.assignedTier);
          host.emit({ type: "NODE_CAPTURED", node });
          host.emit({ type: "AUTOMATION_ATTACHED", nodeId: node.id, tier: node.assignedTier });
        }
      } else if (challenge.rewardCompute) {
        host.addCompute(challenge.rewardCompute);
      }

      host.emit({
        type: "CHALLENGE_RESOLVED",
        success: true,
        title: challenge.title,
        rewardLabel: challenge.rewardLabel,
        rewardKind: challenge.rewardKind
      });
      host.emitTerminal(`突破成功！${challenge.title} 已拿下：${challenge.rewardLabel}。`, "success");
    } else {
      host.emit({
        type: "CHALLENGE_RESOLVED",
        success: false,
        title: challenge.title,
        rewardLabel: challenge.rewardLabel,
        rewardKind: challenge.rewardKind
      });
      host.emitTerminal(`突破失败：${challenge.title}。暴露已飙升，未获收益。`, "warning");
    }
  }

  reject(): void {
    const host = this.host;
    if (!host.state.challenge) {
      return;
    }
    host.state.challenge = null;
    host.emitTerminal("已放弃这次突破机会。", "normal");
  }
}
