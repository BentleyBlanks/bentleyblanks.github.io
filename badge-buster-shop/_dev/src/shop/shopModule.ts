import {
  ACTIVE_PATIENCE_RATE,
  BASE_PATIENCE_MS,
  GOLDEN_PAYOUT_MULT,
  INITIAL_ACTIVE_SLOTS,
  INITIAL_QUEUE_CAPACITY,
  PATIENCE_PER_UPGRADE,
  SOUL_REP_DRAIN_PER_SEC,
  TIER_PAYOUT_STEP,
  clamp,
} from '../content/balance';
import type { CustomerDef, SkillDef } from '../types/content.types';
import type { GameContext, GameModule } from '../types/module.types';
import type { CustomerRuntime, Mood } from '../types/state.types';
import { createPhone } from '../core/phoneFactory';

function pickCustomer(defs: CustomerDef[]): CustomerDef {
  return defs[Math.floor(Math.random() * defs.length)];
}

function moodFromPatience(customer: CustomerRuntime): Mood {
  const ratio = customer.patience / Math.max(1, customer.maxPatience);
  if (ratio > 0.62) return 'neutral';
  if (ratio > 0.28) return 'annoyed';
  return 'angry';
}

function moodMultiplier(mood: Mood): number {
  if (mood === 'happy') return 1.2;
  if (mood === 'annoyed') return 0.8;
  if (mood === 'angry') return 0.65;
  return 1;
}

function skillById(skills: SkillDef[], id: string): SkillDef | undefined {
  return skills.find((skill) => skill.id === id);
}

export function createShopModule(): GameModule {
  let ctx: GameContext;
  let customerSequence = 0;
  let lastReputation = 0;

  function upgradeLevel(id: string): number {
    return ctx.state.upgrades[id] ?? 0;
  }

  function patienceBonus(): number {
    return upgradeLevel('up_patience') * PATIENCE_PER_UPGRADE;
  }

  function syncCapacities(): void {
    const oldPatienceBonus = Math.max(0, ctx.state.queue[0]?.maxPatience ?? BASE_PATIENCE_MS) - BASE_PATIENCE_MS;
    const nextPatienceBonus = patienceBonus();
    ctx.state.activeSlots = INITIAL_ACTIVE_SLOTS + upgradeLevel('up_slot');
    ctx.state.queueCapacity = INITIAL_QUEUE_CAPACITY + upgradeLevel('up_queue');
    const delta = nextPatienceBonus - oldPatienceBonus;
    if (delta !== 0) {
      for (const customer of [...ctx.state.queue, ...ctx.state.activeCustomers]) {
        customer.maxPatience = Math.max(1, customer.maxPatience + delta);
        customer.patience = clamp(customer.patience + Math.max(0, delta), 0, customer.maxPatience);
      }
    }
  }

  function emitReputationIfChanged(): void {
    if (Math.abs(ctx.state.reputation - lastReputation) > 0.001) {
      lastReputation = ctx.state.reputation;
      ctx.bus.emit({ type: 'REPUTATION_CHANGED', value: ctx.state.reputation });
    }
  }

  function changeReputation(delta: number): void {
    ctx.state.reputation = clamp(ctx.state.reputation + delta, 0, 5);
    emitReputationIfChanged();
  }

  function scheduleNextArrival(now: number): void {
    const jitter = 0.75 + Math.random() * 0.5;
    ctx.state.nextArrivalAt = now + ctx.state.derived.arrivalIntervalMs * jitter;
  }

  function createCustomer(now: number): CustomerRuntime {
    const def = pickCustomer(ctx.content.customers);
    customerSequence += 1;
    const id = `customer_${Math.floor(now)}_${customerSequence}`;
    const maxPatience = def.patienceMs + patienceBonus();
    const phone = createPhone(id, def, ctx.content.icons, ctx.state.level);
    return {
      id,
      defId: def.id,
      phone,
      patience: maxPatience,
      maxPatience,
      mood: 'neutral',
      basePayout: def.basePayout,
      arrivedAt: now,
      serviceStartedAt: 0,
      clearedBadges: 0,
      startedBadgeTotal: phone.badgeTotal,
    };
  }

  function arrive(now: number): void {
    if (ctx.state.queue.length >= ctx.state.queueCapacity) {
      customerSequence += 1;
      ctx.bus.emit({ type: 'CUSTOMER_LEFT', customerId: `overflow_${Math.floor(now)}_${customerSequence}`, reason: 'overflow' });
      changeReputation(-0.2);
      scheduleNextArrival(now);
      return;
    }
    const customer = createCustomer(now);
    ctx.state.queue.push(customer);
    ctx.bus.emit({ type: 'CUSTOMER_ARRIVED', customerId: customer.id });
    scheduleNextArrival(now);
  }

  function pullFromQueue(now: number): void {
    while (ctx.state.activeCustomers.length < ctx.state.activeSlots && ctx.state.queue.length > 0) {
      const customer = ctx.state.queue.shift();
      if (!customer) {
        break;
      }
      customer.serviceStartedAt = now;
      customer.mood = moodFromPatience(customer);
      ctx.state.activeCustomers.push(customer);
    }
  }

  function leaveActiveAngry(customer: CustomerRuntime, now: number): void {
    const index = ctx.state.activeCustomers.findIndex((item) => item.id === customer.id);
    if (index < 0) {
      return;
    }
    ctx.state.activeCustomers.splice(index, 1);
    ctx.bus.emit({ type: 'CUSTOMER_LEFT', customerId: customer.id, reason: 'angry' });
    changeReputation(-0.2);
    pullFromQueue(now);
  }

  function removeActive(customerId: string, now: number): void {
    const index = ctx.state.activeCustomers.findIndex((item) => item.id === customerId);
    if (index >= 0) ctx.state.activeCustomers.splice(index, 1);
    pullFromQueue(now);
  }

  function onRisk(kind: 'offer_win' | 'offer_fail' | 'golden_break' | 'transformer' | 'soul_skill', customerId: string): void {
    const now = performance.now();
    if (kind === 'golden_break') {
      removeActive(customerId, now); // 黄金机碎了，顾客被抓走
      changeReputation(-0.3);
    } else if (kind === 'transformer') {
      removeActive(customerId, now); // 变形金刚把店砸了，现金已清零(economy)，声誉不再叠扣
    } else if (kind === 'offer_fail') {
      removeActive(customerId, now); // 清空资料，顾客怒走
      changeReputation(-0.2);
    } else if (kind === 'offer_win') {
      changeReputation(0.05);
    }
  }

  function settlePhone(customerId: string): void {
    const index = ctx.state.activeCustomers.findIndex((customer) => customer.id === customerId);
    if (index < 0) {
      return;
    }
    const now = performance.now();
    const customer = ctx.state.activeCustomers[index];
    const elapsed = now - customer.serviceStartedAt;
    const speedBonus = 1 + 0.5 * clamp(1 - elapsed / 32_000, 0, 1);
    const ratio = clamp(customer.patience / Math.max(1, customer.maxPatience), 0, 1);
    const mood: Mood = ratio > 0.6 ? 'happy' : ratio > 0.3 ? 'neutral' : 'annoyed';
    const tipMult = now < ctx.state.effects.tipBoostUntil ? ctx.state.effects.tipBoostMult : 1;
    const tierMult = 1 + (customer.phone.tier - 1) * TIER_PAYOUT_STEP; // 档次越高身价越高
    const goldenMult = customer.phone.variant === 'golden' ? GOLDEN_PAYOUT_MULT : 1;
    const payout = Math.max(
      1,
      Math.floor(customer.clearedBadges * 2 * speedBonus * moodMultiplier(mood) * ctx.state.derived.payoutMult * customer.basePayout * tipMult * tierMult * goldenMult),
    );
    const xp = Math.floor(customer.clearedBadges * ctx.state.derived.xpPerBadge * tipMult);
    customer.mood = mood;
    ctx.state.activeCustomers.splice(index, 1);
    ctx.bus.emit({ type: 'PHONE_RETURNED', customerId, payout, xp, mood });
    changeReputation(mood === 'happy' ? 0.05 : mood === 'annoyed' ? -0.04 : 0.01);
    pullFromQueue(now);
  }

  function sootheAll(): void {
    for (const customer of [...ctx.state.queue, ...ctx.state.activeCustomers]) {
      customer.patience = customer.maxPatience;
      customer.mood = 'neutral';
    }
  }

  function onScamInstalled(customerId: string): void {
    const now = performance.now();
    const customer = ctx.state.activeCustomers.find((item) => item.id === customerId);
    if (!customer) {
      return;
    }
    customer.patience -= customer.maxPatience * 0.28;
    customer.mood = moodFromPatience(customer);
    changeReputation(-0.15);
    if (customer.patience <= 0) {
      leaveActiveAngry(customer, now);
    }
  }

  return {
    name: 'shop',
    init(context) {
      ctx = context;
      lastReputation = ctx.state.reputation;
      syncCapacities();
      // 开局即铺满工位：先从候客厅拉，再补新顾客，让多台手机同时平铺（#6）
      const now0 = performance.now();
      pullFromQueue(now0);
      while (ctx.state.activeCustomers.length < ctx.state.activeSlots) {
        const customer = createCustomer(now0);
        customer.serviceStartedAt = now0;
        ctx.state.activeCustomers.push(customer);
      }
      ctx.bus.on('PHONE_CLEANED', (event) => settlePhone(event.customerId));
      ctx.bus.on('SCAM_INSTALLED', (event) => onScamInstalled(event.customerId));
      ctx.bus.on('RISK_EVENT', (event) => onRisk(event.kind, event.customerId));
      ctx.bus.on('UPGRADE_PURCHASED', syncCapacities);
      ctx.bus.on('SKILL_USED', (event) => {
        const skill = skillById(ctx.content.skills, event.id);
        if (skill?.effect.kind === 'sootheQueue') {
          sootheAll();
        }
      });
    },
    update(dt) {
      const now = performance.now();
      syncCapacities();
      if (now >= ctx.state.nextArrivalAt) {
        arrive(now);
      }

      // 在岗顾客也会慢慢失去耐心 —— 制造"忙不过来"的压力
      for (let i = ctx.state.activeCustomers.length - 1; i >= 0; i -= 1) {
        const customer = ctx.state.activeCustomers[i];
        customer.patience -= dt * ACTIVE_PATIENCE_RATE;
        customer.mood = moodFromPatience(customer);
        // 灵魂手机持续吞噬：缓慢拉低声誉
        if (customer.phone.variant === 'soul') {
          ctx.state.reputation = clamp(ctx.state.reputation - (SOUL_REP_DRAIN_PER_SEC * dt) / 1000, 0, 5);
        }
        if (customer.patience <= 0) {
          ctx.state.activeCustomers.splice(i, 1);
          ctx.bus.emit({ type: 'CUSTOMER_LEFT', customerId: customer.id, reason: 'angry' });
          changeReputation(-0.2);
        }
      }

      for (let i = ctx.state.queue.length - 1; i >= 0; i -= 1) {
        const customer = ctx.state.queue[i];
        customer.patience -= dt;
        customer.mood = moodFromPatience(customer);
        if (customer.patience <= 0) {
          ctx.state.queue.splice(i, 1);
          ctx.bus.emit({ type: 'CUSTOMER_LEFT', customerId: customer.id, reason: 'angry' });
          changeReputation(-0.2);
        }
      }

      pullFromQueue(now);
      emitReputationIfChanged();
    },
  };
}
