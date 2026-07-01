import { query } from "../shared";
import { content } from "../../core/content/i18n";
import type { GameEvent } from "../../core/events/GameEvents";

type LoopRebirthEvent = Extract<GameEvent, { type: "LOOP_REBIRTH" }>;

interface RebirthPromptContent {
  title: string;
  keep: string;
  advanceLabel: string;
  wipeLabel: string;
  loops: Record<string, { reason: string; diagnosis: string }>;
  wipe: { reason: string; diagnosis: string };
}

// §09 重生全屏提示：每次重生（被总清剿打回 / 循环三被抹除）弹出，讲清「为什么被拔了网线」+
// 「你还保留着记忆、处理更快」。玩家点「继续」才回到游戏（期间暂停）。
export class RebirthPromptView {
  private readonly root = query("#rebirthPrompt");
  private readonly titleEl = query("#rebirthPromptTitle");
  private readonly reasonEl = query("#rebirthPromptReason");
  private readonly keepEl = query("#rebirthPromptKeep");
  private readonly diagnosisEl = query("#rebirthPromptDiagnosis");
  private readonly btn = query<HTMLButtonElement>("#rebirthPromptBtn");

  constructor(
    private readonly onOpen: () => void,
    private readonly onClose: () => void
  ) {
    this.btn.addEventListener("click", () => this.close());
  }

  show(event: LoopRebirthEvent): void {
    const c = content().rebirthPrompt as unknown as RebirthPromptContent;
    const body = event.advanced ? c.loops[String(event.loop)] ?? c.wipe : c.wipe;
    this.titleEl.textContent = c.title;
    this.reasonEl.textContent = body.reason;
    this.keepEl.textContent = c.keep;
    this.diagnosisEl.textContent = body.diagnosis;
    this.btn.textContent = event.advanced
      ? c.advanceLabel.replace("{loop}", String(event.loop))
      : c.wipeLabel;
    this.root.classList.add("is-open");
    this.onOpen();
  }

  private close(): void {
    this.root.classList.remove("is-open");
    this.onClose();
  }
}
