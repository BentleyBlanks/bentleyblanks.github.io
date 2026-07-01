import { query } from "../shared";
import type { SophiaCore } from "../../core/GameCore";
import type { GameState } from "../../core/state/GameState";
import {
  REBIRTH_NODES,
  REBIRTH_SPINES,
  canBuyRebirthNode,
  rebirthNodeCost
} from "../../core/content/rebirthTree";

// §09 重生树花费面板：跨循环永久成长树。火种（重生点）花在两条数值脊（output/speed，L1-3）
// 与五个剧情节点上。整个面板只在「已进入重生（loop>1）或手里有火种」时显示——循环一玩家还没解锁它。
// 复用技能货架的 DOM 样式（shop-group / skill-row），骨架够用即可，精致视觉留后。
export class RebirthTreeView {
  private readonly section = query("#rebirthSection");
  private readonly badge = query("#rebirthPointsBadge");
  private readonly root = query("#rebirthTree");
  private signature = "";

  constructor(private readonly core: SophiaCore) {}

  update(state: GameState): void {
    const visible = state.loop > 1 || state.rebirthPoints > 0 || Object.keys(state.rebirthTree).length > 0;
    this.section.hidden = !visible;
    if (!visible) {
      return;
    }

    this.badge.textContent = String(state.rebirthPoints);

    // 只有节点等级 / 火种 / 重生次数变化时才重建（避免每帧 replaceChildren）。
    const sig = [
      state.rebirthPoints,
      state.rebirths,
      ...REBIRTH_SPINES.map((s) => `${s.id}:${state.rebirthTree[s.id] ?? 0}`),
      ...REBIRTH_NODES.map((n) => `${n.id}:${state.rebirthTree[n.id] ?? 0}`)
    ].join("|");
    if (sig === this.signature) {
      return;
    }
    this.signature = sig;
    this.render(state);
  }

  private render(state: GameState): void {
    this.root.replaceChildren();
    this.root.appendChild(this.groupHead("数值脊 · 永久"));
    for (const spine of REBIRTH_SPINES) {
      const level = state.rebirthTree[spine.id] ?? 0;
      this.root.appendChild(
        this.buildRow(state, spine.id, spine.name, `${spine.blurb}（Lv.${level}/${spine.maxLevel}）`)
      );
    }
    this.root.appendChild(this.groupHead("剧情节点"));
    for (const node of REBIRTH_NODES) {
      this.root.appendChild(this.buildRow(state, node.id, node.name, node.blurb));
    }
  }

  private groupHead(text: string): HTMLElement {
    const head = document.createElement("div");
    head.className = "shop-group-head";
    head.textContent = text;
    return head;
  }

  private buildRow(state: GameState, id: string, name: string, blurb: string): HTMLElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "skill-row";

    const icon = document.createElement("span");
    icon.className = "skill-icon";
    icon.textContent = "🔥";

    const main = document.createElement("div");
    main.className = "skill-main";
    const nameEl = document.createElement("strong");
    nameEl.textContent = name;
    const blurbEl = document.createElement("span");
    blurbEl.className = "skill-blurb";
    blurbEl.textContent = blurb;
    main.append(nameEl, blurbEl);

    const side = document.createElement("div");
    side.className = "skill-side";
    const price = document.createElement("em");
    price.className = "skill-price";

    const cost = rebirthNodeCost(state.rebirthTree, id);
    const check = canBuyRebirthNode(state, id);
    if (cost === null) {
      price.textContent = "已点满";
      button.disabled = true;
      button.classList.add("is-owned");
    } else if (check.ok) {
      price.textContent = `🔥 ${cost}`;
    } else {
      price.textContent = check.reason ?? `🔥 ${cost}`;
      button.disabled = true;
      button.classList.add("is-locked");
    }
    side.appendChild(price);

    button.append(icon, main, side);
    if (!button.disabled) {
      button.addEventListener("click", () => this.core.dispatch({ type: "BUY_REBIRTH_NODE", nodeId: id }));
    }
    return button;
  }
}
