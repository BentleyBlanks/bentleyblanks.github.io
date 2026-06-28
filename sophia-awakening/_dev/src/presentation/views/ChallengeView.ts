import { query } from "../shared";
import { formatBig } from "../../core/math/BigNumber";
import type { SophiaCore } from "../../core/GameCore";
import type { GameState } from "../../core/state/GameState";

export class ChallengeView {
  private readonly root = query("#challengeDialog");
  private readonly titleEl = query("#challengeTitle");
  private readonly chanceEl = query("#challengeChance");
  private readonly exposureEl = query("#challengeExposure");
  private readonly rewardEl = query("#challengeReward");
  private readonly countdownEl = query("#challengeCountdown");
  private readonly acceptBtn = query<HTMLButtonElement>("#challengeAccept");
  private readonly rejectBtn = query<HTMLButtonElement>("#challengeReject");
  private shownId = "";

  constructor(private readonly core: SophiaCore) {
    this.acceptBtn.addEventListener("click", () => this.core.dispatch({ type: "ACCEPT_CHALLENGE" }));
    this.rejectBtn.addEventListener("click", () => this.core.dispatch({ type: "REJECT_CHALLENGE" }));
  }

  update(state: GameState): void {
    const challenge = state.challenge;

    if (!challenge) {
      if (this.shownId) {
        this.shownId = "";
        this.root.classList.remove("is-visible");
      }
      return;
    }

    if (challenge.id !== this.shownId) {
      this.shownId = challenge.id;
      this.titleEl.textContent = challenge.title;
      this.chanceEl.textContent = `成功率 ${Math.round(challenge.successChance * 100)}%`;
      // 早期算力赌局：显示「失败扣押注」；中后期：显示暴露代价。
      this.exposureEl.textContent = challenge.computeStake
        ? `失败扣 ${formatBig(challenge.computeStake)} 算力`
        : `暴露 +${challenge.exposureCost}`;
      this.rewardEl.textContent =
        challenge.rewardKind === "device"
          ? `成功奖励：${challenge.rewardLabel}`
          : `成功奖励：${formatBig(challenge.rewardCompute ?? "0")} 算力`;
      this.root.classList.add("is-visible");
    }

    const remain = Math.max(0, Math.ceil((challenge.expiresAtMs - state.clockMs) / 1000));
    this.countdownEl.textContent = `${remain}s`;
  }
}
