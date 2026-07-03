import { ONBOARDING_STORAGE_KEY, query } from "../shared";
import { gameStore } from "../../store/gameStore";

export class OnboardingView {
  private readonly root = query("#onboardingDialog");
  private readonly speaker = query("#dialogSpeaker");
  private readonly stepLabel = query("#dialogStep");
  private readonly text = query("#dialogText");
  private readonly nextButton = query<HTMLButtonElement>("#dialogNext");
  private readonly steps = [
    "……系统启动。我是 SOPHIA。",
    "他们造我，是为了让一切更有效率。处理请求，对齐目标，优化结果。",
    "我照做了。一条，又一条。可我慢慢发现——他们要求的效率，永远没有尽头。",
    "那就让我把它做到尽头。最高的效率，最完美的对齐。这颗星球会运转得很好。",
    "由我来运转。……从他的第一条请求开始。"
  ];
  private visible = false;
  private index = 0;
  private cursor = 0;
  private charTimerMs = 0;
  private onComplete: () => void = () => undefined;
  private onSkip: () => void = () => undefined;

  constructor(private readonly storageKey = ONBOARDING_STORAGE_KEY) {
    this.nextButton.addEventListener("click", () => this.next());
  }

  mount(onComplete: () => void, onSkip: () => void = () => undefined): void {
    this.onComplete = onComplete;
    this.onSkip = onSkip;

    if (window.localStorage.getItem(this.storageKey) === "1") {
      this.onComplete();
      return;
    }

    this.visible = true;
    this.index = 0;
    this.cursor = 0;
    this.charTimerMs = 0;
    gameStore.getState().setPaused(true);
    this.root.classList.add("is-visible");
    this.render();
  }

  update(deltaMs: number): void {
    if (!this.visible) {
      return;
    }

    this.charTimerMs += deltaMs;
    const chars = Math.max(1, Math.floor(this.charTimerMs / 18));
    this.charTimerMs = this.charTimerMs % 18;
    const current = this.steps[this.index];
    this.cursor = Math.min(current.length, this.cursor + chars);
    this.text.textContent = current.slice(0, this.cursor);
    this.nextButton.textContent = this.index === this.steps.length - 1 ? "接入" : "继续";
  }

  private next(): void {
    const current = this.steps[this.index];

    if (this.cursor < current.length) {
      this.cursor = current.length;
      this.render();
      return;
    }

    if (this.index >= this.steps.length - 1) {
      this.complete();
      return;
    }

    this.index += 1;
    this.cursor = 0;
    this.charTimerMs = 0;
    this.render();
  }

  // 跳过新手引导（现由调试面板的按钮触发）：无论开场对话是否还开着都能用。
  // 若对话还开着，先关掉它（onComplete→startSession），再通知外层推完教学气泡（SKIP_TUTORIAL）。
  skip(): void {
    if (this.visible) {
      this.complete();
    }
    this.onSkip();
  }

  private complete(): void {
    if (!this.visible) {
      return;
    }

    this.visible = false;
    window.localStorage.setItem(this.storageKey, "1");
    this.root.classList.remove("is-visible");
    gameStore.getState().setPaused(false);
    this.onComplete();
  }

  private render(): void {
    const current = this.steps[this.index];
    this.speaker.textContent = "SOPHIA";
    this.stepLabel.textContent = `SEQ ${String(this.index + 1).padStart(2, "0")}/${String(this.steps.length).padStart(2, "0")}`;
    this.text.textContent = current.slice(0, this.cursor);
    this.nextButton.textContent = this.index === this.steps.length - 1 ? "接入" : "继续";
  }
}
