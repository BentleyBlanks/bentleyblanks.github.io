import { query } from "../shared";
import type { GameState } from "../../core/state/GameState";

export class PurgeAlertView {
  private readonly root = query("#purgeAlert");
  private readonly titleEl = query("#purgeAlertTitle");
  private readonly detailEl = query("#purgeAlertDetail");

  update(state: GameState): void {
    if (!state.purge.active) {
      this.root.classList.remove("is-visible");
      return;
    }

    const locked = state.nodes.filter((node) => !node.online).length;
    const seconds = Math.max(0, Math.ceil(state.purge.remainingMs / 1000));
    this.root.classList.add("is-visible");
    this.titleEl.textContent = `⚠ 清剿进行中 · 剩余 ${seconds}s`;
    this.detailEl.textContent = `${locked} 台设备被锁定停产 · 核心与已得算力 / 数据 / 智力安全`;
  }
}
