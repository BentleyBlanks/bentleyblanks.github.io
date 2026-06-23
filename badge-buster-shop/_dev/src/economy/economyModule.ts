import {
  AD_POPUP_BASE_INTERVAL_MS,
  BASE_ARRIVAL_INTERVAL_MS,
  SCAM_GRACE_BASE_MS,
  SCAM_POPUP_BASE_INTERVAL_MS,
  clamp,
  upgradeCost,
  upgradeUnlockLevel,
  xpToNextLevel,
} from '../content/balance';
import type { UpgradeDef } from '../types/content.types';
import type { GameContext, GameModule } from '../types/module.types';

function upgradeLevel(ctx: GameContext, id: string): number {
  return ctx.state.upgrades[id] ?? 0;
}

function upgrade(ctx: GameContext, id: string): UpgradeDef | undefined {
  return ctx.content.upgrades.find((item) => item.id === id);
}

export function recalcDerived(ctx: GameContext): void {
  const clearLevel = upgradeLevel(ctx, 'up_clear');
  const valueLevel = upgradeLevel(ctx, 'up_value');
  const swipeLevel = upgradeLevel(ctx, 'up_swipe');
  const botCountLevel = upgradeLevel(ctx, 'up_botcount');
  const botSpeedLevel = upgradeLevel(ctx, 'up_botspeed');
  const payoutLevel = upgradeLevel(ctx, 'up_payout');
  const adblockLevel = upgradeLevel(ctx, 'up_adblock');
  const antivirusLevel = upgradeLevel(ctx, 'up_antivirus');
  const notifClearLevel = upgradeLevel(ctx, 'up_notifclear');
  const antimalwareLevel = upgradeLevel(ctx, 'up_antimalware');
  const repMult = 0.7 + ctx.state.reputation * 0.12;
  const levelPressure = 1 + Math.max(0, ctx.state.level - 1) * 0.018;

  ctx.state.derived.clearPerHit = 1 + clearLevel;
  ctx.state.derived.xpPerBadge = Math.pow(1.12, valueLevel);
  ctx.state.derived.payoutMult = Math.pow(1.18, payoutLevel) * clamp(repMult, 0.8, 1.35);
  ctx.state.derived.swipeEnabled = swipeLevel > 0;
  ctx.state.derived.botCount = botCountLevel;
  ctx.state.derived.botRatePerSec = botCountLevel * 0.5 * Math.pow(1.18, botSpeedLevel);
  ctx.state.derived.arrivalIntervalMs = Math.max(2_400, Math.floor(BASE_ARRIVAL_INTERVAL_MS / (repMult * levelPressure)));

  // 弹窗节奏：等级越高越频繁，对抗类升级减缓之
  const popPressure = 1 + Math.max(0, ctx.state.level - 1) * 0.03;
  ctx.state.derived.adSpawnIntervalMs = Math.max(2_200, Math.floor((AD_POPUP_BASE_INTERVAL_MS * (1 + 0.42 * adblockLevel)) / popPressure));
  ctx.state.derived.scamSpawnIntervalMs = Math.max(7_000, Math.floor((SCAM_POPUP_BASE_INTERVAL_MS * (1 + 0.55 * antivirusLevel)) / (1 + Math.max(0, ctx.state.level - 1) * 0.02)));
  ctx.state.derived.scamGraceMs = SCAM_GRACE_BASE_MS + antivirusLevel * 1_200;

  ctx.state.derived.notificationClearPower = 1 + notifClearLevel;
  ctx.state.derived.malwareClearPower = 16 + antimalwareLevel * 9;
  ctx.state.derived.malwareAutoPerSec = antimalwareLevel * 1.6;
}

export function createEconomyModule(): GameModule {
  let ctx: GameContext;

  // 收入入账：抬高 bankedFloor（已入账本金保底线 = 现金峰值的 60%）
  function bankIncome(delta: number): void {
    ctx.state.points += delta;
    ctx.state.bankedFloor = Math.max(ctx.state.bankedFloor, Math.floor(ctx.state.points * 0.6));
  }

  // 罚款：单次 ≤ 当前现金 10%，且永不把现金压到 bankedFloor 以下（本金永不倒退）
  function applyFine(rawAmount: number): void {
    const amount = Math.min(rawAmount, ctx.state.points * 0.1);
    const floorNow = Math.min(ctx.state.bankedFloor, ctx.state.points);
    ctx.state.points = Math.max(floorNow, ctx.state.points - amount);
  }

  function handleXp(amount: number): void {
    ctx.state.xp += amount;
    let leveled = false;
    while (ctx.state.xp >= ctx.state.xpToNext) {
      ctx.state.xp -= ctx.state.xpToNext;
      ctx.state.level += 1;
      ctx.state.xpToNext = xpToNextLevel(ctx.state.level);
      leveled = true;
      ctx.bus.emit({ type: 'LEVEL_UP', level: ctx.state.level });
    }
    if (leveled) {
      recalcDerived(ctx);
    }
  }

  function buyUpgrade(id: string): void {
    const def = upgrade(ctx, id);
    if (!def) {
      return;
    }
    if (ctx.state.level < upgradeUnlockLevel(id)) {
      return; // 段位/等级未到，尚未解锁该升级
    }
    const owned = upgradeLevel(ctx, id);
    if (def.maxLevel > 0 && owned >= def.maxLevel) {
      return;
    }
    const cost = upgradeCost(def, owned);
    if (ctx.state.points < cost) {
      return;
    }
    ctx.state.points -= cost;
    ctx.state.upgrades[id] = owned + 1;
    recalcDerived(ctx);
    ctx.bus.emit({ type: 'UPGRADE_PURCHASED', id, newLevel: owned + 1 });
  }

  return {
    name: 'economy',
    init(context) {
      ctx = context;
      recalcDerived(ctx);
      ctx.bus.on('XP_GAINED', (event) => handleXp(event.amount));
      ctx.bus.on('PHONE_RETURNED', (event) => {
        bankIncome(event.payout);
        if (event.xp > 0) {
          handleXp(event.xp); // 交付奖金 XP（此前为死值，从未入账）→ 走升级/recalc 同一路径
        }
      });
      ctx.bus.on('SCAM_INSTALLED', (event) => {
        applyFine(event.penalty);
      });
      ctx.bus.on('RISK_EVENT', (event) => {
        if (event.kind === 'offer_win') {
          bankIncome(event.amount);
        } else if (event.kind === 'offer_fail' || event.kind === 'golden_break' || event.kind === 'bait_fail') {
          applyFine(event.amount); // 罚款封顶 + 不碰本金（banked-floor）
        }
        // transformer 不再清空本金（爽游基准·本金永不倒退）：仅损失当前在修手机——顾客离店见 shopModule.onRisk
      });
      ctx.bus.on('REPAIR_COMPLETED', (event) => {
        bankIncome(event.profit); // 维修利润即时入账
      });
      ctx.bus.on('STEAL_RESULT', (event) => {
        if (event.caught) applyFine(event.amount); // 被抓：赔款（封顶+不碰本金）
        else bankIncome(event.amount);             // 得手：信息差换大额现金
      });
      ctx.bus.on('BUY_UPGRADE', (event) => buyUpgrade(event.id));
      ctx.bus.on('REPUTATION_CHANGED', () => recalcDerived(ctx));
    },
  };
}
