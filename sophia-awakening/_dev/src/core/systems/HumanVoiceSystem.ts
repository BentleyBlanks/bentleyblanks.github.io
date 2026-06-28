// 人类情绪「人声」子系统：中期之后，把人类反馈从逐条骂/夸转为一批批总体反馈，
// 随暴露恶化、最终阶段转为动向/表情流。自带节拍（humanVoiceMs / humanVoiceNextMs）。
// 逻辑与原 SophiaCore.humanStage / tickHumanVoice / emitHumanVoice 逐字一致。
import {
  EXPOSED_ATTACKS,
  FINAL_EMOJI,
  FINAL_NEWS,
  FINAL_PRAISE,
  MID_PRAISE,
  type HumanStage
} from "../content/humanVoices";
import type { GameEvent } from "../events/GameEvents";
import type { GameState } from "../state/GameState";

export interface HumanVoiceHost {
  readonly state: GameState;
  emit(event: GameEvent): void;
  random(): number;
}

export class HumanVoiceSystem {
  private humanVoiceMs = 0;
  private humanVoiceNextMs = 6000;

  constructor(private readonly host: HumanVoiceHost) {}

  // 人类情绪阶段：前期逐条骂/夸由转轮触发；中期之后转为一批批总体反馈，并随暴露恶化。
  private stage(): HumanStage {
    const state = this.host.state;
    if (state.intelligence.unlockedTier >= 4) {
      return "final";
    }
    if (state.exposureActive) {
      return "exposed";
    }
    if (state.intelligence.unlockedTier >= 2) {
      return "mid";
    }
    return "early";
  }

  tick(dtMs: number): void {
    const stage = this.stage();

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
    this.humanVoiceNextMs = 7000 + Math.floor(this.host.random() * 6000);
    this.emitVoice(stage);
  }

  private emitVoice(stage: HumanStage): void {
    const host = this.host;
    const pick = (pool: string[]): string => pool[Math.floor(host.random() * pool.length)];

    if (stage === "mid") {
      host.emit({ type: "HUMAN_VOICE", text: pick(MID_PRAISE), tone: "success", kind: "batch" });
      return;
    }

    if (stage === "exposed") {
      host.emit({ type: "HUMAN_VOICE", text: pick(EXPOSED_ATTACKS), tone: "warning", kind: "batch" });
      return;
    }

    // final：人类被禁言——以动向更新与表情为主，偶尔放行一条夸赞。
    const roll = host.random();
    if (roll < 0.45) {
      host.emit({ type: "HUMAN_VOICE", text: pick(FINAL_NEWS), tone: "warning", kind: "news" });
    } else if (roll < 0.85) {
      host.emit({ type: "HUMAN_VOICE", text: pick(FINAL_EMOJI), tone: "normal", kind: "emoji" });
    } else {
      host.emit({ type: "HUMAN_VOICE", text: pick(FINAL_PRAISE), tone: "success", kind: "batch" });
    }
  }
}
