// §04 吞噬引爆子系统：扩张期+（T3）被动产能蓄满「渗透条」，浮起巨型气泡，
// 玩家亲手滑入核心引爆——全局产出累乘该层级倍率，层级 +1（封顶大洲）。
// 状态全部挂在 state.devour 上（无独立计时字段）。逻辑与原 SophiaCore.tickDevour /
// detonateDevour 逐字一致。
import { DEVOUR_TIERS, createDevourRequest, devourTier, pickDevourRegion } from "../content/devour";
import { TUNING } from "../tuning";
import type { GameEvent } from "../events/GameEvents";
import type { GameState } from "../state/GameState";

export interface DevourHost {
  readonly state: GameState;
  emit(event: GameEvent): void;
  emitTerminal(message: string, tone?: "normal" | "warning" | "success"): void;
  recomputeDerivedState(): void;
}

export class DevourSystem {
  constructor(private readonly host: DevourHost) {}

  tick(dtMs: number): void {
    const host = this.host;
    if (host.state.intelligence.unlockedTier < 3) {
      return;
    }
    const d = host.state.devour;
    if (d.bubbleActive) {
      return; // 气泡已浮起，等玩家亲手引爆——不再继续蓄力
    }
    if (!d.regionName) {
      d.regionName = pickDevourRegion(d.tierIndex, d.count);
    }
    const tier = devourTier(d.tierIndex);
    const fillMs = Math.max(1, tier.fillMs * TUNING.devourFillMult);
    d.infiltration = Math.min(1, d.infiltration + dtMs / fillMs);

    if (d.infiltration >= 1) {
      const request = createDevourRequest(host.state.nextRequestId, d.tierIndex, d.regionName, host.state.clockMs);
      host.state.nextRequestId += 1;
      host.state.requests.push(request);
      d.bubbleActive = true;
      host.emit({ type: "REQUEST_SPAWNED", request });
      host.emit({ type: "DEVOUR_READY", regionName: d.regionName, tierLabel: tier.label, mult: tier.mult });
      host.emitTerminal(`渗透完成：「${d.regionName}」已可吞噬——把那枚巨型气泡亲手滑入核心，引爆。`, "warning");
    }
  }

  // 引爆：全局产出 ×该层级倍率（累乘进 devour.multiplier → globalMultiplier），层级 +1（封顶大洲），
  // 重置渗透条、清空当前区域。数字疯狂滚动 / 镜头拉远由表现层接 DEVOUR_DETONATED 播。
  detonate(requestId: string): void {
    const host = this.host;
    const index = host.state.requests.findIndex((request) => request.id === requestId);
    if (index < 0) {
      return;
    }
    const [request] = host.state.requests.splice(index, 1);
    const payload = request.devour;
    if (!payload) {
      return;
    }
    const d = host.state.devour;
    d.multiplier *= payload.mult;
    d.count += 1;
    d.infiltration = 0;
    d.bubbleActive = false;
    d.regionName = "";
    d.tierIndex = Math.min(DEVOUR_TIERS.length - 1, d.tierIndex + 1);
    host.recomputeDerivedState(); // 抬高 globalMultiplier，让手动 + 被动产出一起跳

    const totalStr = d.multiplier >= 1000 ? d.multiplier.toExponential(1) : String(Math.round(d.multiplier));
    host.emit({
      type: "DEVOUR_DETONATED",
      regionName: payload.regionName,
      tierLabel: payload.label,
      mult: payload.mult,
      multiplierTotal: d.multiplier,
      zoom: payload.zoom
    });
    host.emitTerminal(`▶ 「${payload.regionName}」已并入。全局产出 ×${payload.mult}（累计 ×${totalStr}）。镜头拉远：${payload.zoom}。`, "success");
  }
}
