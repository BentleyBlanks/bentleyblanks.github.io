import { query } from "../shared";

export class TerminalView {
  private readonly lines = query("#terminalLines");
  private readonly objectiveText = query("#terminalObjectiveText");
  private objective = "";
  private readonly queue: Array<{ message: string; tone: "normal" | "warning" | "success" | "danger" }> = [];
  private current: { message: string; tone: "normal" | "warning" | "success" | "danger"; index: number; element: HTMLElement } | null = null;
  private charTimerMs = 0;

  constructor() {
    // 折叠终端：默认只显示「当前」目标行；点终端头/目标行 → 历史就地弹出；点外面收起。
    const terminal = query("#terminal");
    const toggle = (e: Event) => {
      e.stopPropagation();
      terminal.classList.toggle("is-expanded");
    };
    terminal.querySelector(".terminal-head")?.addEventListener("click", toggle);
    query("#terminalObjective").addEventListener("click", toggle);
    document.addEventListener(
      "pointerdown",
      (e) => {
        if (terminal.classList.contains("is-expanded") && !terminal.contains(e.target as Node)) {
          terminal.classList.remove("is-expanded");
        }
      },
      true
    );
  }

  mount(): void {
    this.lines.replaceChildren();
  }

  // 终端顶部常驻「当前大方向」——SOPHIA 这一阶段在做什么（贴叙事）。
  setObjective(text: string): void {
    if (text === this.objective) {
      return;
    }
    this.objective = text;
    this.objectiveText.textContent = text;
  }

  push(message: string, tone: "normal" | "warning" | "success" | "danger" = "normal"): void {
    this.queue.push({ message, tone });
  }

  update(deltaMs: number): void {
    if (!this.current) {
      const next = this.queue.shift();

      if (!next) {
        return;
      }

      const element = document.createElement("div");
      element.className = `terminal-line ${next.tone}`;
      this.lines.appendChild(element);

      while (this.lines.children.length > 40) {
        this.lines.firstElementChild?.remove();
      }

      this.current = { ...next, index: 0, element };
      this.charTimerMs = 0;
    }

    this.charTimerMs += deltaMs;
    const chars = Math.max(1, Math.floor(this.charTimerMs / 18));
    this.charTimerMs = this.charTimerMs % 18;
    this.current.index = Math.min(this.current.message.length, this.current.index + chars);
    this.current.element.textContent = this.current.message.slice(0, this.current.index);
    this.lines.scrollTop = this.lines.scrollHeight;

    if (this.current.index >= this.current.message.length) {
      this.current = null;
    }
  }
}
