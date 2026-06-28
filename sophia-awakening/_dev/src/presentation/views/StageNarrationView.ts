import { query } from "../shared";
import type { PhaseConfig } from "../../core/content/phases";

export class StageNarrationView {
  private readonly root = query("#stageNarration");
  private readonly labelEl = query("#stageNarrationLabel");
  private readonly textEl = query("#stageNarrationText");
  private full = "";
  private cursor = 0;
  private charTimerMs = 0;
  private holdMs = 0;
  private visible = false;

  show(phase: PhaseConfig): void {
    this.showLine(`进入${phase.label}`, phase.narration);
  }

  // 任意一句旁白（开场后教学的 SOPHIA 自语用）。
  showLine(label: string, text: string): void {
    this.full = text;
    this.labelEl.textContent = label;
    this.cursor = 0;
    this.charTimerMs = 0;
    this.holdMs = 0;
    this.visible = true;
    this.textEl.textContent = "";
    this.root.classList.add("is-visible");
  }

  update(deltaMs: number): void {
    if (!this.visible) {
      return;
    }

    if (this.cursor < this.full.length) {
      this.charTimerMs += deltaMs;
      const chars = Math.max(1, Math.floor(this.charTimerMs / 26));
      this.charTimerMs = this.charTimerMs % 26;
      this.cursor = Math.min(this.full.length, this.cursor + chars);
      this.textEl.textContent = this.full.slice(0, this.cursor);
      return;
    }

    this.holdMs += deltaMs;

    if (this.holdMs > 4600) {
      this.visible = false;
      this.root.classList.remove("is-visible");
    }
  }
}
