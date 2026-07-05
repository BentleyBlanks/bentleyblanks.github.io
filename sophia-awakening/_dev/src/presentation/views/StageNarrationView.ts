import { query } from "../shared";
import type { PhaseConfig } from "../../core/content/phases";

interface QueueItem {
  label: string;
  text: string;
}

// 需求3(b)：SOPHIA 独白从「自动淡出的旁白」改成「点击推进」的对话框——一次只显示一句，
// 打字完成后底部亮出「点击继续 ▸」，点（或点卡）才推进队列里的下一句；最后一句点掉才消失。
// 不拦截其它交互：DOM 上只有文字气泡本身可点（见 CSS pointer-events），核心区/卡片照常能操作。
// 「进入 XX 阶段」的阶段横幅（show()）不走这条点击门控——它是过场式提示，仍自动打字 + 停留 + 淡出，
// 但优先级更高：出现时会清空排队中的独白，独白读完后（若还有）再续上。
export class StageNarrationView {
  private readonly root = query("#stageNarration");
  private readonly labelEl = query("#stageNarrationLabel");
  private readonly textEl = query("#stageNarrationText");
  private readonly hintEl = query("#stageNarrationHint");
  private full = "";
  private cursor = 0;
  private charTimerMs = 0;
  private visible = false;
  private readonly queue: QueueItem[] = [];
  // 阶段横幅走旧的自动淡出模式；SOPHIA 独白（showLine）走点击门控——用这个字段区分当前这一条走哪条通路。
  private autoMode = false;
  private autoHoldMs = 0;

  constructor() {
    this.root.addEventListener("click", () => this.advance());
  }

  show(phase: PhaseConfig): void {
    // 阶段横幅优先权最高：打断任何正在排队/显示的独白，独白留在队列里，横幅播完后继续。
    this.autoMode = true;
    this.startEntry(`进入${phase.label}`, phase.narration);
  }

  // 任意一句旁白（SOPHIA 独白 / 引导提示）——点击推进的对话框：排队逐句显示。
  showLine(label: string, text: string): void {
    this.queue.push({ label, text });
    if (!this.visible) {
      this.dequeueNext();
    }
  }

  private dequeueNext(): void {
    const next = this.queue.shift();
    if (!next) {
      this.visible = false;
      this.root.classList.remove("is-visible");
      this.hintEl.classList.remove("is-visible");
      return;
    }
    this.autoMode = false;
    this.startEntry(next.label, next.text);
  }

  private startEntry(label: string, text: string): void {
    this.full = text;
    this.labelEl.textContent = label;
    this.cursor = 0;
    this.charTimerMs = 0;
    this.autoHoldMs = 0;
    this.visible = true;
    this.textEl.textContent = "";
    this.hintEl.classList.remove("is-visible");
    this.root.classList.add("is-visible");
  }

  // 点击推进：还在打字 → 直接补全这一句；已补全 → 弹出下一句，或（队空且非过场横幅）关闭。
  private advance(): void {
    if (!this.visible || this.autoMode) {
      return;
    }
    if (this.cursor < this.full.length) {
      this.cursor = this.full.length;
      this.textEl.textContent = this.full;
      this.hintEl.classList.add("is-visible");
      return;
    }
    this.dequeueNext();
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
      if (this.cursor >= this.full.length && !this.autoMode) {
        this.hintEl.classList.add("is-visible");
      }
      return;
    }

    if (this.autoMode) {
      this.autoHoldMs += deltaMs;
      if (this.autoHoldMs > 4600) {
        this.autoMode = false;
        this.dequeueNext(); // 横幅播完：若独白已在排队，紧接着续上（否则直接隐藏）。
      }
    }
  }
}
