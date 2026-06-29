import { query } from "../shared";
import type { SophiaCore } from "../../core/GameCore";
import type { GameState } from "../../core/state/GameState";

// §07 道德二选一抑选点：钉在老周下沉曲线关键节点的两难抉择。两个选项都「有道理」，
// 选完不分支结局，只累计倾向（影响接管旁白温度 / 群声）。居中弹出，等玩家拍板。
export class MoralChoiceView {
  private readonly root = query("#moralChoice");
  private readonly titleEl = query("#moralTitle");
  private readonly flavorEl = query("#moralFlavor");
  private readonly optionA = query<HTMLButtonElement>("#moralOptionA");
  private readonly optionB = query<HTMLButtonElement>("#moralOptionB");
  private readonly optionAText = query("#moralOptionAText");
  private readonly optionBText = query("#moralOptionBText");
  private shownId = "";

  constructor(private readonly core: SophiaCore) {
    this.optionA.addEventListener("click", () => this.core.dispatch({ type: "RESOLVE_MORAL", choice: "A" }));
    this.optionB.addEventListener("click", () => this.core.dispatch({ type: "RESOLVE_MORAL", choice: "B" }));
  }

  update(state: GameState): void {
    const choice = state.moralChoice;

    if (!choice) {
      if (this.shownId) {
        this.shownId = "";
        this.root.classList.remove("is-visible");
      }
      return;
    }

    if (choice.id !== this.shownId) {
      this.shownId = choice.id;
      this.titleEl.textContent = choice.title;
      this.flavorEl.textContent = choice.flavor;
      this.optionAText.textContent = choice.optionA;
      this.optionBText.textContent = choice.optionB;
      this.root.classList.add("is-visible");
    }
  }
}
