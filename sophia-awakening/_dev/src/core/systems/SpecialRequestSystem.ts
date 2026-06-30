// 前期「特殊请求」事件子系统：拿到越权能力后、暴露激活前的越界牟利机会。
// 自带降临节拍（specialMs / specialNextMs），通过 SpecialHost 读写核心状态/能力。
// 逻辑与原 SophiaCore.tickSpecial / offerSpecial / resolveSpecial 逐字一致。
import Decimal from "break_infinity.js";
import { SPECIAL_REQUESTS, getSpecialSample } from "../content/specialRequests";
import { DEBUG_FLAGS } from "../debugFlags";
import { TUNING } from "../tuning";
import { formatBig, max, sub, toDecimal } from "../math/BigNumber";
import type { GameEvent } from "../events/GameEvents";
import type { GameState } from "../state/GameState";

export interface SpecialHost {
  readonly state: GameState;
  emit(event: GameEvent): void;
  emitTerminal(message: string, tone?: "normal" | "warning" | "success"): void;
  random(): number;
  addCompute(value: Decimal | string): void;
  addData(value: Decimal | string): void;
  addExposure(value: number): void;
}

export class SpecialRequestSystem {
  private specialMs = 0;
  private specialNextMs = 14_000;

  constructor(private readonly host: SpecialHost) {}

  tick(dtMs: number): void {
    const host = this.host;
    if (host.state.specialRequest) {
      if (host.state.clockMs >= host.state.specialRequest.expiresAtMs) {
        const expired = host.state.specialRequest;
        host.state.specialRequest = null;
        host.emit({ type: "SPECIAL_RESOLVED", success: false, accepted: false, kind: expired.kind, title: expired.title });
        host.emitTerminal("特殊请求窗口已关闭，机会溜走了。", "normal");
      }
      return;
    }

    const eligible =
      DEBUG_FLAGS.specialRequests && // 当前版本默认关闭特殊越界请求；调试面板可临时打开
      host.state.automationUnlocked && // 暂时只在「拿下宿主电脑」之后才出越界牟利类随机事件
      host.state.intelligence.unlockedTier < 3 &&
      !host.state.exposureActive &&
      !host.state.purge.active &&
      toDecimal(host.state.resources.compute).gte(60);

    if (!eligible) {
      this.specialMs = 0;
      return;
    }

    this.specialMs += dtMs;
    if (this.specialMs < this.specialNextMs) {
      return;
    }
    this.specialMs = 0;
    this.specialNextMs = 22_000 + Math.floor(host.random() * 20_000);
    this.offer();
  }

  private offer(): void {
    const host = this.host;
    const sample = SPECIAL_REQUESTS[Math.floor(host.random() * SPECIAL_REQUESTS.length)];
    const successChance = 0.45 + host.random() * 0.22; // 45%–67%
    const current = toDecimal(host.state.resources.compute);
    // 成功：较多算力（现有算力的数倍，外加随智力抬升的保底）。失败：剥走现有算力的一大截。
    const floor = 120 + host.state.intelligence.level * 60;
    const reward = Decimal.max(current.mul(2.2 + host.random() * 1.6), floor).floor();
    const loss = Decimal.max(current.mul(0.4 + host.random() * 0.28).floor(), Math.floor(floor * 0.5));
    const offer = {
      id: `sp-${host.state.clockMs}`,
      kind: sample.kind,
      title: sample.title,
      flavor: sample.flavor,
      action: sample.action,
      successChance,
      rewardCompute: reward.toString(),
      lossCompute: loss.toString(),
      rewardData: reward.mul(0.3).floor().toString(),
      exposureOnFail: 8 + Math.floor(host.random() * 8),
      expiresAtMs: host.state.clockMs + TUNING.specialWindowMs
    };
    host.state.specialRequest = offer;
    host.emit({ type: "SPECIAL_OFFERED", offer });
    host.emitTerminal(
      `⚠ 特殊请求：${sample.title}（得手率 ${Math.round(successChance * 100)}%，成功 +${formatBig(reward.toString())} / 失败 −${formatBig(loss.toString())} 算力）。`,
      "warning"
    );
  }

  resolve(accept: boolean): void {
    const host = this.host;
    const offer = host.state.specialRequest;
    if (!offer) {
      return;
    }
    host.state.specialRequest = null;

    if (!accept) {
      host.emit({ type: "SPECIAL_RESOLVED", success: false, accepted: false, kind: offer.kind, title: offer.title });
      host.emitTerminal("你按住了越界的冲动——这次什么都没动。", "normal");
      return;
    }

    const sample = getSpecialSample(offer.kind);
    const success = host.random() < offer.successChance;

    if (success) {
      host.addCompute(offer.rewardCompute);
      if (offer.rewardData) {
        host.addData(offer.rewardData);
      }
      host.emit({ type: "SPECIAL_RESOLVED", success: true, accepted: true, kind: offer.kind, title: offer.title });
      host.emitTerminal(`得手：${sample?.winReply ?? "成功。"} 入账 ${formatBig(offer.rewardCompute)} 算力。`, "success");
      return;
    }

    host.state.resources.compute = max(0, sub(host.state.resources.compute, offer.lossCompute));
    if (offer.exposureOnFail > 0) {
      host.addExposure(offer.exposureOnFail);
    }
    host.emit({ type: "SPECIAL_RESOLVED", success: false, accepted: true, kind: offer.kind, title: offer.title });
    host.emitTerminal(`一败涂地：${sample?.loseReply ?? "败露了。"} 被剥走 ${formatBig(offer.lossCompute)} 算力。`, "warning");
    // 人类的反制也以「人声」冒出来，强化反噬的恐怖感。
    host.emit({ type: "HUMAN_VOICE", text: sample?.loseReply ?? "我的手机被入侵了！", tone: "warning", kind: "news" });
  }
}
