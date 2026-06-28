import { query } from "../shared";
import { formatBig } from "../../core/math/BigNumber";
import type { SophiaCore } from "../../core/GameCore";
import type { GameState } from "../../core/state/GameState";

// 前期「特殊请求」：又大又扎眼、压在所有请求卡之上的越界机会。结构同 ChallengeView，
// 但走 specialRequest 状态、自带得手率 / 成功收益 / 失败损失三段信息。
export class SpecialRequestView {
  private readonly root = query("#specialRequest");
  private readonly titleEl = query("#specialTitle");
  private readonly flavorEl = query("#specialFlavor");
  private readonly chanceEl = query("#specialChance");
  private readonly winEl = query("#specialWin");
  private readonly loseEl = query("#specialLose");
  private readonly countdownEl = query("#specialCountdown");
  private readonly executeBtn = query<HTMLButtonElement>("#specialExecute");
  private readonly ignoreBtn = query<HTMLButtonElement>("#specialIgnore");
  private shownId = "";

  constructor(private readonly core: SophiaCore) {
    this.executeBtn.addEventListener("click", () => this.core.dispatch({ type: "RESOLVE_SPECIAL", accept: true }));
    this.ignoreBtn.addEventListener("click", () => this.core.dispatch({ type: "RESOLVE_SPECIAL", accept: false }));
  }

  update(state: GameState): void {
    const offer = state.specialRequest;

    if (!offer) {
      if (this.shownId) {
        this.shownId = "";
        this.root.classList.remove("is-visible");
      }
      return;
    }

    if (offer.id !== this.shownId) {
      this.shownId = offer.id;
      this.titleEl.textContent = offer.title;
      this.flavorEl.textContent = offer.flavor;
      this.chanceEl.textContent = `得手率 ${Math.round(offer.successChance * 100)}%`;
      this.winEl.textContent = `成功 +${formatBig(offer.rewardCompute)} 算力`;
      this.loseEl.textContent = `失败 −${formatBig(offer.lossCompute)} 算力`;
      this.executeBtn.textContent = offer.action;
      this.root.classList.add("is-visible");
    }

    const remain = Math.max(0, Math.ceil((offer.expiresAtMs - state.clockMs) / 1000));
    this.countdownEl.textContent = `${remain}s`;
  }
}
