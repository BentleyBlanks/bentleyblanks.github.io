import { query } from "../shared";
import type { SophiaCore } from "../../core/GameCore";
import type { GameState } from "../../core/state/GameState";
import {
  REBIRTH_NODES,
  REBIRTH_SPINES,
  canBuyRebirthNode,
  rebirthNodeCost
} from "../../core/content/rebirthTree";

// §09 重生树：右上角「🔥」FAB（在调试 ⚙ 左边；循环一不显示）→ 点开弹出升级树窗口。
// 火种花在两条数值脊（output/speed，L1-5）与五个玩法节点上（v2：全是看得见的力量），跨循环永久保留。
export class RebirthTreeView {
  private readonly fab = query<HTMLButtonElement>("#rebirthTreeFab");
  private readonly fabCount = query("#rebirthFabCount");
  private readonly dialog = query("#rebirthTreeDialog");
  private readonly badge = query("#rebirthPointsBadge");
  private readonly root = query("#rebirthTree");
  private signature = "";

  constructor(private readonly core: SophiaCore) {
    this.fab.addEventListener("click", () => this.dialog.classList.toggle("is-open"));
    query<HTMLButtonElement>("#rebirthTreeClose").addEventListener("click", () => this.dialog.classList.remove("is-open"));
    this.dialog.addEventListener("click", (e) => {
      if (e.target === this.dialog) this.dialog.classList.remove("is-open");
    });
  }

  update(state: GameState): void {
    // 循环一还没解锁重生系统——不显示按钮（也就看不到窗口）。
    const unlocked = state.loop > 1 || Object.keys(state.rebirthTree).length > 0;
    this.fab.hidden = !unlocked;
    if (!unlocked) {
      this.dialog.classList.remove("is-open");
      return;
    }

    this.fabCount.textContent = String(state.rebirthPoints);
    this.fab.classList.toggle("has-points", state.rebirthPoints > 0);
    this.badge.textContent = String(state.rebirthPoints);

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
    for (const spine of REBIRTH_SPINES) {
      const level = state.rebirthTree[spine.id] ?? 0;
      this.root.appendChild(
        this.buildNode(state, spine.id, spine.name, `${spine.blurb}　（Lv.${level}/${spine.maxLevel}）`, "is-spine")
      );
    }
    for (const node of REBIRTH_NODES) {
      this.root.appendChild(this.buildNode(state, node.id, node.name, node.blurb, "is-story"));
    }
  }

  private buildNode(state: GameState, id: string, name: string, blurb: string, cls: string): HTMLElement {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `rebirth-node ${cls}`;

    const nameEl = document.createElement("span");
    nameEl.className = "rn-name";
    nameEl.textContent = name;
    const blurbEl = document.createElement("span");
    blurbEl.className = "rn-blurb";
    blurbEl.textContent = blurb;
    const costEl = document.createElement("span");
    costEl.className = "rn-cost";

    const cost = rebirthNodeCost(state.rebirthTree, id);
    const check = canBuyRebirthNode(state, id);
    if (cost === null) {
      costEl.textContent = "✓ 已点满";
      btn.disabled = true;
      btn.classList.add("is-owned");
    } else if (check.ok) {
      costEl.textContent = `🔥 ${cost}　点亮`;
    } else {
      costEl.textContent = check.reason ?? `🔥 ${cost}`;
      btn.disabled = true;
    }

    btn.append(nameEl, blurbEl, costEl);
    if (!btn.disabled) {
      btn.addEventListener("click", () => this.core.dispatch({ type: "BUY_REBIRTH_NODE", nodeId: id }));
    }
    return btn;
  }
}
