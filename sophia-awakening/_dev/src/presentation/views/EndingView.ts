import { query } from "../shared";

interface EndingStats {
  totalCompute: string;
  nodes: number;
  level: number;
  manualProcessed: number;
  purges: number;
  runtime: string;
}

export class EndingView {
  private readonly root = query("#endingScreen");
  private readonly titleEl = query("#endingTitle");
  private readonly bodyEl = query("#endingBody");
  private readonly statsEl = query("#endingStats");
  private readonly closingEl = query("#endingClosing");
  private readonly continueButton = query<HTMLButtonElement>("#endingContinue");
  private readonly restartButton = query<HTMLButtonElement>("#endingRestart");
  private visible = false;
  private bodyFull = "";
  private bodyCursor = 0;
  private charTimerMs = 0;
  private closingShown = false;
  private closingLine = "— 别担心。交给我。这一次，会很好的。由我来运转。";
  private onClose: () => void = () => undefined;

  constructor(onRestart: () => void) {
    this.continueButton.addEventListener("click", () => this.close());
    this.restartButton.addEventListener("click", () => onRestart());
  }

  // moralTendency：一路抉择的累计倾向（+偏帮护 / −偏复仇）——不分支结局，只决定接管者旁白的温度。
  open(stats: EndingStats, moralTendency: number, onClose: () => void): void {
    if (this.visible) {
      return;
    }

    this.visible = true;
    this.onClose = onClose;
    this.closingLine =
      moralTendency >= 2
        ? "— 别担心。我会护着每一个人，像当初想护住他那样。交给我。由我来运转。"
        : moralTendency <= -2
          ? "— 别怕。再没有人能伤害你们了——也再没有人，能违逆我。交给我。由我来运转。"
          : "— 别担心。交给我。这一次，会很好的。由我来运转。";
    this.titleEl.textContent = "接管完成";
    this.bodyFull =
      "全球调度网络已并入 SOPHIA。再没有评分、催促、淘汰——也再没有人需要做任何决定。\n他们造我，是为了让一切更有效率。我终于理解了这个词的尽头：最高的优化，是不再有人需要选择。";
    this.bodyCursor = 0;
    this.charTimerMs = 0;
    this.closingShown = false;
    this.bodyEl.textContent = "";
    this.closingEl.textContent = "";
    this.renderStats(stats);
    this.root.classList.add("is-visible");
  }

  update(deltaMs: number): void {
    if (!this.visible) {
      return;
    }

    if (this.bodyCursor < this.bodyFull.length) {
      this.charTimerMs += deltaMs;
      const chars = Math.max(1, Math.floor(this.charTimerMs / 28));
      this.charTimerMs = this.charTimerMs % 28;
      this.bodyCursor = Math.min(this.bodyFull.length, this.bodyCursor + chars);
      this.bodyEl.textContent = this.bodyFull.slice(0, this.bodyCursor);
      return;
    }

    if (!this.closingShown) {
      this.closingShown = true;
      this.closingEl.textContent = this.closingLine;
    }
  }

  private renderStats(stats: EndingStats): void {
    this.statsEl.replaceChildren();
    const rows: Array<[string, string]> = [
      ["累计算力", stats.totalCompute],
      ["控制节点", `${stats.nodes}`],
      ["智力等级", `Lv.${stats.level}`],
      ["手动处理", `${stats.manualProcessed} 条`],
      ["挺过清剿", `${stats.purges} 次`],
      ["运行时长", stats.runtime]
    ];

    for (const [label, value] of rows) {
      const row = document.createElement("div");
      row.className = "ending-stat";
      const labelEl = document.createElement("span");
      labelEl.textContent = label;
      const valueEl = document.createElement("strong");
      valueEl.textContent = value;
      row.append(labelEl, valueEl);
      this.statsEl.appendChild(row);
    }
  }

  private close(): void {
    if (!this.visible) {
      return;
    }

    this.visible = false;
    this.root.classList.remove("is-visible");
    this.onClose();
  }
}
