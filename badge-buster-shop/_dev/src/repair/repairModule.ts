import {
  REPAIR_CLOSE_MS,
  REPAIR_OPEN_MS,
  REPAIR_STEAL_LEVEL,
  REPAIR_WORK_MS,
  STEAL_CATCH_CHANCE,
  STEAL_FINE_PER_TIER,
  STEAL_WINDFALL_PER_TIER,
  maxUnlockedTier,
  repairProfit,
  repairServiceDef,
} from '../content/balance';
import { computeGameLayout, REPAIR_BENCH_H } from '../shared/layout';
import { computeRepairLayout, focusedAwaitingPhone } from '../shared/repairLayout';
import { rectHit } from '../shared/uiLayout';
import type { GameEvent } from '../types/events.types';
import type { GameContext, GameModule } from '../types/module.types';
import type { CustomerRuntime, RepairKind } from '../types/state.types';

// 维修台逻辑：拆机→施工→装回的三段仪式由 update 驱动；点按维修台抽屉触发开工/选材/偷资料/交付。
// 必须排在 core 之前订阅 TAP，命中维修台时吞掉事件，避免穿透到手机。
export function createRepairModule(): GameModule {
  let ctx: GameContext;

  function phoneCenter(customerId: string): { x: number; y: number } {
    const layout = computeGameLayout(ctx.state, ctx.canvas.clientWidth, ctx.canvas.clientHeight);
    const p = layout.phoneLayouts.find((pl) => pl.customer.id === customerId);
    if (p) return { x: p.x + p.w / 2, y: p.y + p.h * 0.4 };
    return { x: ctx.canvas.clientWidth / 2, y: ctx.canvas.clientHeight * 0.4 };
  }

  function startService(customer: CustomerRuntime, kind: RepairKind): void {
    const r = customer.phone.repair;
    if (r.activeKind) return; // 一次只能修一项
    const svc = r.services.find((s) => s.kind === kind);
    if (!svc || svc.done) return;
    r.activeKind = kind;
    r.stage = 'open';
    r.stageMs = 0;
  }

  function cycleTier(customer: CustomerRuntime, kind: RepairKind): void {
    const def = repairServiceDef(kind);
    if (def.tiers.length <= 1) return;
    const maxT = maxUnlockedTier(def, ctx.state.level);
    const svc = customer.phone.repair.services.find((s) => s.kind === kind);
    if (!svc) return;
    svc.tier = svc.tier + 1 > maxT ? 0 : svc.tier + 1; // 在已解锁档之间循环
  }

  function completeService(customer: CustomerRuntime): void {
    const r = customer.phone.repair;
    const kind = r.activeKind;
    if (!kind) return;
    const svc = r.services.find((s) => s.kind === kind);
    const def = repairServiceDef(kind);
    if (svc) {
      svc.done = true;
      const profit = repairProfit(def, svc.tier, customer.phone.tier);
      r.earned += profit;
      const { x, y } = phoneCenter(customer.id);
      ctx.bus.emit({ type: 'REPAIR_COMPLETED', customerId: customer.id, kind, tierName: def.tiers[svc.tier].name, profit, x, y });
    }
    r.activeKind = null;
    r.stage = 'idle';
    r.stageMs = 0;
  }

  function deliver(customer: CustomerRuntime): void {
    const r = customer.phone.repair;
    if (r.activeKind) return; // 施工中不能交付
    // 偷资料结算（在维修期间开了开关 → 交付时见分晓）
    if (r.steal && !r.stealResolved) {
      r.stealResolved = true;
      const tier = customer.phone.tier;
      const caught = Math.random() < STEAL_CATCH_CHANCE;
      const amount = Math.round((caught ? STEAL_FINE_PER_TIER : STEAL_WINDFALL_PER_TIER) * tier);
      const { x, y } = phoneCenter(customer.id);
      ctx.bus.emit({ type: 'STEAL_RESULT', customerId: customer.id, caught, amount, x, y });
    }
    ctx.bus.emit({ type: 'DELIVER_PHONE', customerId: customer.id });
  }

  function onTap(event: Extract<GameEvent, { type: 'TAP' }>): void {
    if (event.consumed) return;
    const bench = computeRepairLayout(ctx.state, ctx.canvas.clientWidth, ctx.canvas.clientHeight);
    if (!bench.open || !bench.customer) return;
    const customer = bench.customer;
    const { x, y } = event;

    if (rectHit(bench.deliver, x, y)) {
      event.consumed = true;
      deliver(customer);
      return;
    }
    if (bench.steal && rectHit(bench.steal, x, y)) {
      event.consumed = true;
      if (ctx.state.level >= REPAIR_STEAL_LEVEL && !customer.phone.repair.activeKind) {
        customer.phone.repair.steal = !customer.phone.repair.steal;
      }
      return;
    }
    for (const tile of bench.tiles) {
      if (tile.tierChip && rectHit(tile.tierChip, x, y)) {
        event.consumed = true;
        if (!customer.phone.repair.activeKind) cycleTier(customer, tile.kind);
        return;
      }
      if (rectHit(tile.body, x, y)) {
        event.consumed = true;
        startService(customer, tile.kind);
        return;
      }
    }
    if (rectHit(bench.panel, x, y)) event.consumed = true; // 吞掉抽屉空白，避免穿透
  }

  function onSwipe(event: Extract<GameEvent, { type: 'SWIPE' }>): void {
    // 维修台展开时，底部抽屉区域的滑动也吞掉，避免误触手机
    if (!focusedAwaitingPhone(ctx.state)) return;
    const last = event.path[event.path.length - 1];
    if (last && last.y >= ctx.canvas.clientHeight - (REPAIR_BENCH_H + 6)) event.consumed = true;
  }

  return {
    name: 'repair',
    init(context) {
      ctx = context;
      ctx.bus.on('TAP', onTap);
      ctx.bus.on('SWIPE', onSwipe);
    },
    update(dt) {
      // 驱动所有在场手机的维修仪式（即使切走工位也会修完）
      for (const customer of ctx.state.activeCustomers) {
        const r = customer.phone.repair;
        if (!r.activeKind) continue;
        r.stageMs += dt;
        const dur = r.stage === 'open' ? REPAIR_OPEN_MS : r.stage === 'work' ? REPAIR_WORK_MS : REPAIR_CLOSE_MS;
        if (r.stageMs < dur) continue;
        r.stageMs = 0;
        if (r.stage === 'open') r.stage = 'work';
        else if (r.stage === 'work') r.stage = 'close';
        else completeService(customer);
      }
    },
  };
}
