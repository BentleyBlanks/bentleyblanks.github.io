import { query } from "../shared";
import { formatBig } from "../../core/math/BigNumber";
import type { GameState } from "../../core/state/GameState";

// HUD 倍率堆栈（刮个爽式可见性）：可点的「全局 ×N」小片；点开弹窗把乘法链逐行摊开
// （智力 / 里程碑 / 设备协同 / 重生树 / 吞噬 / 循环提速 / 合计）。需求4：HUD 精简——移除了
// 冗余的「+N/秒」被动产出速率读数（#computeRate），只留这块弹窗拆解。
// 数据全部来自 state.multipliers（recomputeDerivedState 维护）。
export class MultiplierView {
  private readonly chip = query<HTMLButtonElement>("#multChip");
  private readonly dialog = query("#multiplierDialog");
  private readonly totalBadge = query("#multTotalBadge");
  private readonly rows = query("#multRows");
  private signature = "";

  constructor() {
    this.chip.addEventListener("click", () => this.dialog.classList.toggle("is-open"));
    query<HTMLButtonElement>("#multiplierClose").addEventListener("click", () => this.dialog.classList.remove("is-open"));
    this.dialog.addEventListener("click", (e) => {
      if (e.target === this.dialog) this.dialog.classList.remove("is-open");
    });
  }

  update(state: GameState): void {
    const m = state.multipliers;
    const sig = [m.intelligence, m.milestones, m.synergy, m.rebirth, m.devour, m.hostAuth, m.processing, m.loop, m.total].map((v) => v.toFixed(3)).join("|");
    if (sig === this.signature) {
      return;
    }
    this.signature = sig;
    this.chip.textContent = `全局 ×${fmtMult(m.total)}`;
    this.totalBadge.textContent = `×${fmtMult(m.total)}`;
    this.renderRows(state);
  }

  private renderRows(state: GameState): void {
    const m = state.multipliers;
    const rows = [
      this.row("智力等级", m.intelligence, `Lv.${state.intelligence.level} 的等级倍率`),
      this.row("里程碑", m.milestones, "每个已购里程碑技能永久 ×1 格（乘法叠）"),
      this.row("设备协同", m.synergy, "每种在役设备 ×1 格——机型越杂，协同越强"),
      this.row("重生树", m.rebirth, "「算尽 · 全局产出」脊（火种点亮，跨循环永久）"),
      this.row("吞噬", m.devour, "历次吞噬引爆累乘")
    ];
    // §09 情感授权钥匙：授权后才出现的一行——玩家必须看见「宿主授权」这个名字。
    if (m.hostAuth > 1.0001) {
      rows.push(this.row("宿主授权", m.hostAuth, "他允许了我。他不知道他允许的是什么——永久全局产出"));
    }
    // 处理力·深度推理：横跨全部收入的独立产出系数（与全局×并列相乘，故单列一行、不并入合计）。
    if (m.processing > 1.0001) {
      rows.push(this.row("处理力 · 深度推理", m.processing, "手动 / 大恨 / 节点被动 / 洪流——所有产出的独立系数（与全局×并列相乘，不并入合计）"));
    }
    rows.push(
      this.row("循环", m.loop, "循环内建提速——她记得上一世的一切（作用于数据/崛起速度）", true),
      this.row("合计", m.total, "以上各行相乘（循环行为提速，不计入产出合计）", false, true)
    );
    this.rows.replaceChildren(...rows);
  }

  private row(label: string, value: number, hint: string, isSpeed = false, isTotal = false): HTMLElement {
    const el = document.createElement("div");
    el.className = `mult-row${isTotal ? " is-total" : ""}${isSpeed ? " is-speed" : ""}`;
    const nameEl = document.createElement("span");
    nameEl.className = "mult-row-name";
    nameEl.textContent = label;
    const hintEl = document.createElement("span");
    hintEl.className = "mult-row-hint";
    hintEl.textContent = hint;
    const valueEl = document.createElement("strong");
    valueEl.className = "mult-row-value";
    valueEl.textContent = `×${fmtMult(value)}${isSpeed ? "（提速）" : ""}`;
    valueEl.classList.toggle("is-neutral", value <= 1.0001 && !isTotal);
    el.append(nameEl, hintEl, valueEl);
    return el;
  }
}

// 倍率格式：小于 1000 保留两位小数，更大走 formatBig 缩写（吞噬后期会滚很大）。
function fmtMult(value: number): string {
  return value < 1000 ? String(parseFloat(value.toFixed(2))) : formatBig(Math.round(value));
}
