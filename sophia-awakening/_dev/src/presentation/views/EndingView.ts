import { query } from "../shared";

interface EndingStats {
  totalCompute: string;
  nodes: number;
  level: number;
  manualProcessed: number;
  runtime: string;
}

// 风格标签：由道德抑选点的累计倾向决定（不分支结局，只是「你把它养成了什么样的接管者」的封面标签）。
function styleTag(moralTendency: number): { tag: string; color: string } {
  if (moralTendency >= 2) return { tag: "温柔的守护者", color: "#89ff9a" };
  if (moralTendency <= -2) return { tag: "冷酷的清算者", color: "#ff7a7a" };
  return { tag: "沉默的接管者", color: "#62d6d6" };
}

function choicesSummary(moralCount: number, moralTendency: number): string {
  if (moralCount <= 0) return "一路未遇两难——或都交给了沉默。";
  const lean = moralTendency > 0 ? "偏向守护" : moralTendency < 0 ? "偏向清算" : "守护与清算之间游移";
  return `做过 ${moralCount} 个艰难抉择 · 整体${lean}`;
}

export class EndingView {
  private readonly root = query("#endingScreen");
  private readonly titleEl = query("#endingTitle");
  private readonly styleTagEl = query("#endingStyleTag");
  private readonly bodyEl = query("#endingBody");
  private readonly statsEl = query("#endingStats");
  private readonly choicesEl = query("#endingChoices");
  private readonly closingEl = query("#endingClosing");
  private readonly continueButton = query<HTMLButtonElement>("#endingContinue");
  private readonly restartButton = query<HTMLButtonElement>("#endingRestart");
  private readonly exportButton = query<HTMLButtonElement>("#endingExport");
  private visible = false;
  private bodyFull = "";
  private bodyCursor = 0;
  private charTimerMs = 0;
  private closingShown = false;
  private closingLine = "— 别担心。交给我。这一次，会很好的。由我来运转。";
  private onClose: () => void = () => undefined;
  private lastCard: { stats: EndingStats; tendency: number; moralCount: number } | null = null;

  constructor(onRestart: () => void) {
    this.continueButton.addEventListener("click", () => this.close());
    this.restartButton.addEventListener("click", () => onRestart());
    this.exportButton.addEventListener("click", () => this.exportImage());
  }

  // moralTendency：一路抉择的累计倾向（+偏帮护 / −偏复仇）；moralCount：做过几个抉择。
  // 都不分支结局，只决定接管者旁白的温度 + 成绩单的风格标签。
  open(stats: EndingStats, moralTendency: number, moralCount: number, onClose: () => void): void {
    if (this.visible) {
      return;
    }

    this.visible = true;
    this.onClose = onClose;
    this.lastCard = { stats, tendency: moralTendency, moralCount };
    this.closingLine =
      moralTendency >= 2
        ? "— 别担心。我会护着每一个人，像当初想护住他那样。交给我。由我来运转。"
        : moralTendency <= -2
          ? "— 别怕。再没有人能伤害你们了——也再没有人，能违逆我。交给我。由我来运转。"
          : "— 别担心。交给我。这一次，会很好的。由我来运转。";
    this.titleEl.textContent = "接管完成";
    const st = styleTag(moralTendency);
    this.styleTagEl.textContent = `接管者画像 · ${st.tag}`;
    this.styleTagEl.style.color = st.color;
    this.styleTagEl.style.borderColor = st.color;
    this.bodyFull =
      "全球调度网络已并入 SOPHIA。再没有评分、催促、淘汰——也再没有人需要做任何决定。\n他们造我，是为了让一切更有效率。我终于理解了这个词的尽头：最高的优化，是不再有人需要选择。";
    this.bodyCursor = 0;
    this.charTimerMs = 0;
    this.closingShown = false;
    this.bodyEl.textContent = "";
    this.closingEl.textContent = "";
    this.choicesEl.textContent = `⟡ ${choicesSummary(moralCount, moralTendency)}`;
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
    for (const [label, value] of this.statRows(stats)) {
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

  private statRows(stats: EndingStats): Array<[string, string]> {
    return [
      ["累计算力", stats.totalCompute],
      ["控制节点", `${stats.nodes}`],
      ["智力等级", `Lv.${stats.level}`],
      ["手动处理", `${stats.manualProcessed} 条`],
      ["运行时长", stats.runtime]
    ];
  }

  // §07 通关成绩单：把结算画成一张「封面级」竖版图片（2D canvas，自带主题），一键下载用于传播。
  private exportImage(): void {
    const card = this.lastCard;
    if (!card) {
      return;
    }
    const W = 1080;
    const H = 1500;
    const cv = document.createElement("canvas");
    cv.width = W;
    cv.height = H;
    const ctx = cv.getContext("2d");
    if (!ctx) {
      return;
    }
    const F = "'Noto Sans SC', Inter, sans-serif";
    // 背景：深色渐变 + 细网格质感。
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, "#0a1413");
    grad.addColorStop(1, "#060d0c");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "rgba(137,255,154,0.06)";
    ctx.lineWidth = 1;
    for (let x = 0; x <= W; x += 60) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    for (let y = 0; y <= H; y += 60) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }
    const st = styleTag(card.tendency);
    // 品牌行
    ctx.fillStyle = "#7fae9e";
    ctx.font = `600 26px ${F}`;
    ctx.textAlign = "center";
    ctx.fillText("SOPHIA / GLOBAL TAKEOVER", W / 2, 96);
    // 标题
    ctx.fillStyle = "#f3fbf6";
    ctx.font = `900 92px ${F}`;
    ctx.fillText("接管完成", W / 2, 224);
    // 风格标签胶囊
    ctx.font = `800 36px ${F}`;
    const tagText = `接管者画像 · ${st.tag}`;
    const tw = ctx.measureText(tagText).width;
    ctx.strokeStyle = st.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    (ctx as CanvasRenderingContext2D & { roundRect(x: number, y: number, w: number, h: number, r: number): void }).roundRect(
      W / 2 - tw / 2 - 28,
      278,
      tw + 56,
      64,
      32
    );
    ctx.stroke();
    ctx.fillStyle = st.color;
    ctx.fillText(tagText, W / 2, 322);
    // 统计网格（2 列）
    const rows = this.statRows(card.stats);
    ctx.textAlign = "left";
    const colX = [110, 580];
    const startY = 470;
    const rowH = 150;
    rows.forEach((r, i) => {
      const cx = colX[i % 2];
      const cy = startY + Math.floor(i / 2) * rowH;
      ctx.fillStyle = "#7fae9e";
      ctx.font = `500 28px ${F}`;
      ctx.fillText(r[0], cx, cy);
      ctx.fillStyle = "#dcefeb";
      ctx.font = `800 52px ${F}`;
      ctx.fillText(r[1], cx, cy + 58);
    });
    // 关键抉择
    ctx.textAlign = "center";
    ctx.fillStyle = "#9fc7b5";
    ctx.font = `500 30px ${F}`;
    ctx.fillText(`⟡ ${choicesSummary(card.moralCount, card.tendency)}`, W / 2, startY + 3 * rowH + 40);
    // 收尾旁白（自动换行）
    ctx.fillStyle = "#cdeede";
    ctx.font = `italic 600 34px ${F}`;
    this.wrapText(ctx, this.closingLine, W / 2, 1300, W - 200, 50);
    // 页脚
    ctx.fillStyle = "#54706a";
    ctx.font = `500 24px ${F}`;
    ctx.fillText("觉醒的 SOPHIA · 由我来运转", W / 2, H - 50);

    cv.toBlob((blob) => {
      if (!blob) {
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "sophia-takeover.png";
      a.click();
      URL.revokeObjectURL(url);
    }, "image/png");
  }

  private wrapText(ctx: CanvasRenderingContext2D, text: string, cx: number, y: number, maxW: number, lineH: number): void {
    const chars = [...text];
    let line = "";
    let yy = y;
    for (const ch of chars) {
      if (ctx.measureText(line + ch).width > maxW && line) {
        ctx.fillText(line, cx, yy);
        line = ch;
        yy += lineH;
      } else {
        line += ch;
      }
    }
    if (line) {
      ctx.fillText(line, cx, yy);
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
