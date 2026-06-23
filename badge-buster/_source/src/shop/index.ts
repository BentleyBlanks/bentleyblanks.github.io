// shop —— 顾客生命周期 · 排队 · 结算 · 声誉（Agent 9）
// 拥有：activeCustomers/queue 成员增减、patience、mood、reputation、nextArrivalAt、activeSlots/queueCapacity。
import type { GameContext, GameModule } from '../types/module.types';
import type { CustomerRuntime, GameState, Mood, PhoneRuntime } from '../types/state.types';
import type { CustomerDef } from '../types/content.types';
import { CUSTOMERS, SKILLS, Balance } from '../content';
import { clamp, randInt, uid, weightedIndex } from '../util';

function moodFromFraction(frac: number): Mood {
  if (frac > 0.6) return 'happy';
  if (frac > 0.3) return 'neutral';
  if (frac > 0) return 'annoyed';
  return 'angry';
}

export function createShopModule(): GameModule {
  let ctx!: GameContext;

  const upLvl = (id: string) => ctx.state.upgrades[id] ?? 0;

  function maxPatienceFor(def: CustomerDef): number {
    return def.patienceMs + upLvl('up_patience') * Balance.PATIENCE_PER_UPGRADE;
  }

  function buildPhone(def: CustomerDef): PhoneRuntime {
    const cols = Balance.GRID_COLS;
    const rows = Balance.GRID_ROWS;
    const cellCount = cols * rows;
    const iconCount = clamp(
      randInt(Balance.CUSTOMER_START_ICON_RANGE[0], Balance.CUSTOMER_START_ICON_RANGE[1]),
      1, Math.min(cellCount, ctx.content.icons.length)
    );

    // 按权重抽不重复图标
    const pool = ctx.content.icons.slice();
    const chosen: typeof ctx.content.icons = [];
    for (let i = 0; i < iconCount && pool.length > 0; i++) {
      const idx = weightedIndex(pool.map((d) => d.spawnWeight));
      chosen.push(pool[idx]);
      pool.splice(idx, 1);
    }

    // 随机不重复格子
    const cells: number[] = [];
    for (let i = 0; i < cellCount; i++) cells.push(i);
    for (let i = cells.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [cells[i], cells[j]] = [cells[j], cells[i]];
    }

    const icons = chosen.map((def2, i) => ({
      id: def2.id,
      badge: 1,
      col: cells[i] % cols,
      row: Math.floor(cells[i] / cols),
    }));

    // 分配初始角标总数（每个先 1，余下随机塞给未满的）
    let total = randInt(def.startBadgeRange[0], def.startBadgeRange[1]);
    total = Math.max(total, icons.length);
    let remaining = total - icons.length;
    let guard = remaining * 8 + 10;
    while (remaining > 0 && guard-- > 0) {
      const i = Math.floor(Math.random() * icons.length);
      const iconDef = ctx.content.icons.find((d) => d.id === icons[i].id)!;
      if (icons[i].badge < iconDef.maxBadge) { icons[i].badge += 1; remaining -= 1; }
    }
    const badgeTotal = icons.reduce((s, i) => s + i.badge, 0);

    return { icons, gridCols: cols, gridRows: rows, badgeTotal, incomingRateMult: Balance.PHONE_INCOMING_RATE_MULT };
  }

  function createCustomer(): CustomerRuntime {
    const def = CUSTOMERS[Math.floor(Math.random() * CUSTOMERS.length)];
    const maxPatience = maxPatienceFor(def);
    const phone = buildPhone(def);
    const t = ctx.now();
    return {
      id: uid('cust'),
      defId: def.id,
      phone,
      patience: maxPatience,
      maxPatience,
      mood: 'neutral',
      basePayout: def.basePayout,
      arrivedAt: t,
      serviceStartedAt: t,
      clearedThisPhone: 0,
      startBadgeTotal: phone.badgeTotal,
    };
  }

  function changeReputation(delta: number) {
    const v = clamp(ctx.state.reputation + delta, Balance.REPUTATION_MIN, Balance.REPUTATION_MAX);
    if (v !== ctx.state.reputation) {
      ctx.state.reputation = v;
      ctx.bus.emit({ type: 'REPUTATION_CHANGED', value: v });
    }
  }

  function spawnArrival() {
    const c = createCustomer();
    if (ctx.state.activeCustomers.length < ctx.state.activeSlots) {
      c.serviceStartedAt = ctx.now();
      ctx.state.activeCustomers.push(c);
      ctx.bus.emit({ type: 'CUSTOMER_ARRIVED', customerId: c.id });
    } else if (ctx.state.queue.length < ctx.state.queueCapacity) {
      ctx.state.queue.push(c);
      ctx.bus.emit({ type: 'CUSTOMER_ARRIVED', customerId: c.id });
    } else {
      // 客满溢出
      ctx.bus.emit({ type: 'CUSTOMER_LEFT', customerId: c.id, reason: 'overflow' });
      changeReputation(-Balance.REP_LOSS_OVERFLOW);
    }
  }

  function fillSlots() {
    while (ctx.state.activeCustomers.length < ctx.state.activeSlots && ctx.state.queue.length > 0) {
      const c = ctx.state.queue.shift()!;
      c.serviceStartedAt = ctx.now(); // 进入工作台才开始计服务速度（耐心仍从进店连续倒计）
      ctx.state.activeCustomers.push(c);
    }
  }

  function settle(customerId: string) {
    const idx = ctx.state.activeCustomers.findIndex((c) => c.id === customerId);
    if (idx < 0) return;
    const c = ctx.state.activeCustomers[idx];
    const now = ctx.now();

    const timeTaken = now - c.serviceStartedAt;
    const ratio = clamp(timeTaken / Math.max(1, c.maxPatience), 0, 1);
    const speedBonus = Balance.SPEED_BONUS_FAST - (Balance.SPEED_BONUS_FAST - Balance.SPEED_BONUS_SLOW) * ratio;

    const frac = clamp(c.patience / Math.max(1, c.maxPatience), 0, 1);
    const mood = moodFromFraction(frac);
    const moodMult = Balance.MOOD_MULT[mood] ?? 1;

    const tip = now < ctx.state.effects.tipBoostUntil ? ctx.state.effects.tipBoostMult : 1;
    const payout = Math.max(
      1,
      Math.round(c.clearedThisPhone * c.basePayout * speedBonus * moodMult * ctx.state.derived.payoutMult * tip)
    );
    const xp = Math.round(c.clearedThisPhone * ctx.state.derived.xpPerBadge);

    ctx.state.activeCustomers.splice(idx, 1);
    ctx.bus.emit({ type: 'PHONE_RETURNED', customerId, payout, xp, mood });
    if (mood === 'happy') changeReputation(+Balance.REP_GAIN_HAPPY);
    fillSlots();
  }

  function leaveAngry(c: CustomerRuntime, fromQueue: boolean) {
    if (fromQueue) {
      const i = ctx.state.queue.findIndex((x) => x.id === c.id);
      if (i >= 0) ctx.state.queue.splice(i, 1);
    } else {
      const i = ctx.state.activeCustomers.findIndex((x) => x.id === c.id);
      if (i >= 0) ctx.state.activeCustomers.splice(i, 1);
    }
    ctx.bus.emit({ type: 'CUSTOMER_LEFT', customerId: c.id, reason: 'angry' });
    changeReputation(-Balance.REP_LOSS_ANGRY);
  }

  function tickPatience(dt: number) {
    // 倒序遍历以便安全删除
    for (let i = ctx.state.activeCustomers.length - 1; i >= 0; i--) {
      const c = ctx.state.activeCustomers[i];
      c.patience -= dt;
      c.mood = moodFromFraction(c.patience / Math.max(1, c.maxPatience));
      if (c.patience <= 0) leaveAngry(c, false);
    }
    for (let i = ctx.state.queue.length - 1; i >= 0; i--) {
      const c = ctx.state.queue[i];
      c.patience -= dt;
      c.mood = moodFromFraction(c.patience / Math.max(1, c.maxPatience));
      if (c.patience <= 0) leaveAngry(c, true);
    }
  }

  function applyUpgradeFields(id: string) {
    if (id === 'up_slot') ctx.state.activeSlots = Balance.INITIAL_ACTIVE_SLOTS + upLvl('up_slot');
    if (id === 'up_queue') ctx.state.queueCapacity = Balance.INITIAL_QUEUE_CAPACITY + upLvl('up_queue');
    // up_patience 仅影响新到顾客
  }

  function soothe() {
    for (const c of [...ctx.state.activeCustomers, ...ctx.state.queue]) {
      c.patience = c.maxPatience;
      c.mood = 'happy';
    }
  }

  return {
    name: 'shop',
    init(c) {
      ctx = c;
      // 从存档/升级恢复台数与候客厅容量
      ctx.state.activeSlots = Balance.INITIAL_ACTIVE_SLOTS + upLvl('up_slot');
      ctx.state.queueCapacity = Balance.INITIAL_QUEUE_CAPACITY + upLvl('up_queue');

      ctx.bus.on('PHONE_CLEANED', (e) => settle(e.customerId));
      ctx.bus.on('UPGRADE_PURCHASED', (e) => applyUpgradeFields(e.id));
      ctx.bus.on('SKILL_USED', (e) => {
        const def = SKILLS.find((s) => s.id === e.id);
        if (def && def.effect.kind === 'sootheQueue') soothe();
      });

      // 开张先来一位，立刻有得玩
      spawnArrival();
      ctx.state.nextArrivalAt = ctx.now() + ctx.state.derived.arrivalIntervalMs;
    },
    update(dt) {
      const now = ctx.now();
      tickPatience(dt);
      if (now >= ctx.state.nextArrivalAt) {
        spawnArrival();
        ctx.state.nextArrivalAt = now + ctx.state.derived.arrivalIntervalMs;
      }
      fillSlots();
    },
  };
}
