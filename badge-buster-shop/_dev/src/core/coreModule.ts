import { INCOMING_BASE_INTERVAL_MS, MAX_POPUPS_PER_PHONE, SCAM_UNLOCK_LEVEL } from '../content/balance';
import {
  computeGameLayout,
  iconCoveredByPopup,
  popupRectOf,
  rectContains,
  type IconLayout,
  type PhoneLayout,
} from '../shared/layout';
import type { AppIconDef } from '../types/content.types';
import type { GameEvent } from '../types/events.types';
import type { GameContext, GameModule } from '../types/module.types';
import type { CustomerRuntime, IconRuntime, PhonePopup, PopupKind } from '../types/state.types';
import { saveState } from './persistence';

const AD_TITLES = ['🧧 恭喜中红包', '附近的人想认识你', '🔥 限时 1 折', '点击领取大礼包', '您有 1 条新消息'];
const AD_BODIES = ['立即领取 ›', '马上查看', '仅剩 3 个名额', '免费试用 7 天'];
const SCAM_TITLES = ['⚠ 检测到病毒', '账户异常需验证', '免费领 iPhone', '🎁 中奖通知'];
const SCAM_BODIES = ['不处理将自动安装', '点此验证身份', '填写信息领取', '倒计时结束即扣费'];

function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function iconDef(icon: IconRuntime, defs: AppIconDef[]): AppIconDef | undefined {
  return defs.find((def) => def.id === icon.appId);
}

function recalcPhone(customer: CustomerRuntime): number {
  const total = customer.phone.icons.reduce((sum, icon) => sum + icon.badge, 0);
  customer.phone.badgeTotal = total;
  return total;
}

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

let popupSeq = 0;

function buildPopup(kind: PopupKind, now: number, graceMs: number): PhonePopup {
  popupSeq += 1;
  const fw = 0.62 + Math.random() * 0.22;
  const fh = 0.15 + Math.random() * 0.08;
  const fx = Math.min(Math.max((1 - fw) / 2 + (Math.random() - 0.5) * 0.12, 0.04), 1 - fw - 0.04);
  const fy = Math.min(Math.max(0.2 + Math.random() * 0.42, 0.18), 0.9 - fh);
  return {
    id: `popup_${Math.floor(now)}_${popupSeq}`,
    kind,
    fx,
    fy,
    fw,
    fh,
    closeFx: 0.82,
    closeFy: 0.07,
    closeFw: 0.15,
    closeFh: 0.34,
    bornAt: now,
    installAt: kind === 'scam' ? now + graceMs : Number.POSITIVE_INFINITY,
    title: kind === 'scam' ? pick(SCAM_TITLES) : pick(AD_TITLES),
    body: kind === 'scam' ? pick(SCAM_BODIES) : pick(AD_BODIES),
    accent: kind === 'scam' ? '#FF3B30' : '#FF9F43',
  };
}

export function createCoreModule(): GameModule {
  let ctx: GameContext;
  let saveAccumulator = 0;

  function frozen(now: number): boolean {
    return now < ctx.state.effects.freezeIncomingUntil;
  }

  function emitClear(icon: IconLayout, amount: number): void {
    ctx.bus.emit({ type: 'BADGE_CLEARED', customerId: icon.customerId, iconId: icon.icon.id, amount, x: icon.badgeX, y: icon.badgeY });
  }

  function applyClear(event: Extract<GameEvent, { type: 'BADGE_CLEARED' }>): void {
    const customer = ctx.state.activeCustomers.find((item) => item.id === event.customerId);
    const icon = customer?.phone.icons.find((item) => item.id === event.iconId);
    if (!customer || !icon || icon.badge <= 0 || event.amount <= 0) {
      event.amount = 0;
      return;
    }
    const amount = Math.min(icon.badge, Math.max(1, Math.floor(event.amount)));
    icon.badge -= amount;
    customer.clearedBadges += amount;
    ctx.state.totalCleared += amount;
    event.amount = amount;

    const xpMult = performance.now() < ctx.state.effects.tipBoostUntil ? ctx.state.effects.tipBoostMult : 1;
    ctx.bus.emit({ type: 'XP_GAINED', amount: amount * ctx.state.derived.xpPerBadge * xpMult });

    if (recalcPhone(customer) <= 0 && !customer.phone.cleaned) {
      customer.phone.cleaned = true;
      ctx.bus.emit({ type: 'PHONE_CLEANED', customerId: customer.id });
    }
  }

  function findIconAt(x: number, y: number, extraRadius: number): IconLayout | null {
    const layout = computeGameLayout(ctx.state, ctx.canvas.clientWidth, ctx.canvas.clientHeight);
    let best: { icon: IconLayout; d: number } | null = null;
    for (const phone of layout.phoneLayouts) {
      for (const icon of phone.icons) {
        if (icon.icon.badge <= 0 || iconCoveredByPopup(phone, icon)) {
          continue;
        }
        const radius = icon.size * 0.62 + extraRadius;
        const d = distance({ x, y }, icon);
        if (d <= radius && (!best || d < best.d)) {
          best = { icon, d };
        }
      }
    }
    return best?.icon ?? null;
  }

  function iconsAlongPath(path: { x: number; y: number }[]): IconLayout[] {
    const layout = computeGameLayout(ctx.state, ctx.canvas.clientWidth, ctx.canvas.clientHeight);
    const touched = new Map<string, IconLayout>();
    for (const phone of layout.phoneLayouts) {
      for (const icon of phone.icons) {
        if (icon.icon.badge <= 0 || iconCoveredByPopup(phone, icon)) {
          continue;
        }
        const radius = icon.size * 0.68;
        if (path.some((point) => distance(point, icon) <= radius)) {
          touched.set(icon.icon.id, icon);
        }
      }
    }
    return [...touched.values()];
  }

  function closePopup(customer: CustomerRuntime, popup: PhonePopup, cx: number, cy: number): void {
    customer.phone.popups = customer.phone.popups.filter((item) => item.id !== popup.id);
    const defused = popup.kind === 'scam';
    // 关闭弹窗给一点正反馈：广告 +1，拆掉诈骗 +3（按经验系数）
    const reward = (defused ? 3 : 1) * ctx.state.derived.xpPerBadge;
    ctx.bus.emit({ type: 'XP_GAINED', amount: reward });
    ctx.bus.emit({ type: 'POPUP_CLOSED', customerId: customer.id, kind: popup.kind, x: cx, y: cy, defused });
  }

  /** 弹窗在图标之上：先处理弹窗点击（关闭 ✕），命中即吞掉本次点击。 */
  function handlePopupTap(x: number, y: number): boolean {
    const layout = computeGameLayout(ctx.state, ctx.canvas.clientWidth, ctx.canvas.clientHeight);
    for (const phone of layout.phoneLayouts) {
      const popups = phone.customer.phone.popups;
      // 顶层（数组末尾）优先
      for (let i = popups.length - 1; i >= 0; i -= 1) {
        const popup = popups[i];
        const rect = popupRectOf(phone, popup);
        if (!rectContains(rect, x, y)) {
          continue;
        }
        if (rectContains({ x: rect.closeX, y: rect.closeY, w: rect.closeW, h: rect.closeH }, x, y)) {
          closePopup(phone.customer, popup, rect.closeX + rect.closeW / 2, rect.closeY + rect.closeH / 2);
        }
        // 点到弹窗任意处都算"被弹窗挡住"，吞掉这次点击（防止穿透清角标）
        return true;
      }
    }
    return false;
  }

  function spawnPopup(phone: PhoneLayout['customer']['phone'], kind: PopupKind, now: number): void {
    if (phone.popups.length >= MAX_POPUPS_PER_PHONE) {
      return;
    }
    phone.popups.push(buildPopup(kind, now, ctx.state.derived.scamGraceMs));
  }

  function scamPenalty(): number {
    const antivirus = ctx.state.upgrades['up_antivirus'] ?? 0;
    return Math.max(5, Math.round((9 + ctx.state.level * 3) * (1 - 0.12 * antivirus)));
  }

  function handleTap(event: Extract<GameEvent, { type: 'TAP' }>): void {
    if (event.consumed) {
      return;
    }
    if (handlePopupTap(event.x, event.y)) {
      return;
    }
    const hit = findIconAt(event.x, event.y, 0);
    if (hit) {
      emitClear(hit, ctx.state.derived.clearPerHit);
    }
  }

  function handleSwipe(event: Extract<GameEvent, { type: 'SWIPE' }>): void {
    if (event.consumed) {
      return;
    }
    if (!ctx.state.derived.swipeEnabled) {
      const last = event.path[event.path.length - 1];
      if (last) {
        handleTap({ type: 'TAP', x: last.x, y: last.y });
      }
      return;
    }
    for (const icon of iconsAlongPath(event.path)) {
      emitClear(icon, ctx.state.derived.clearPerHit);
    }
  }

  function addIncomingBadge(customer: CustomerRuntime): void {
    const candidates = customer.phone.icons.filter((icon) => {
      const def = iconDef(icon, ctx.content.icons);
      return def ? icon.badge < def.maxBadge : true;
    });
    if (candidates.length === 0) {
      return;
    }
    const icon = candidates[Math.floor(Math.random() * candidates.length)];
    icon.badge += 1;
    customer.phone.badgeTotal += 1;
  }

  function updateWorld(dt: number): void {
    const now = performance.now();
    const isFrozen = frozen(now);
    const layoutCustomers = ctx.state.activeCustomers;
    for (const customer of layoutCustomers) {
      const phone = customer.phone;
      if (phone.cleaned) {
        continue;
      }

      // 新角标涌入
      if (!isFrozen) {
        const interval = INCOMING_BASE_INTERVAL_MS / Math.max(0.2, phone.incomingRateMult);
        phone.incomingAccumulatorMs += dt;
        let guard = 0;
        while (phone.incomingAccumulatorMs >= interval && guard < 8) {
          phone.incomingAccumulatorMs -= interval;
          addIncomingBadge(customer);
          guard += 1;
        }
      }

      // 广告弹窗
      phone.popupAccumulatorMs += dt;
      if (!isFrozen && phone.popupAccumulatorMs >= ctx.state.derived.adSpawnIntervalMs && phone.popups.length < MAX_POPUPS_PER_PHONE) {
        phone.popupAccumulatorMs = 0;
        spawnPopup(phone, 'ad', now);
      }

      // 诈骗弹窗（限一个在场）
      phone.scamAccumulatorMs += dt;
      const hasScam = phone.popups.some((item) => item.kind === 'scam');
      if (
        !isFrozen &&
        ctx.state.level >= SCAM_UNLOCK_LEVEL &&
        !hasScam &&
        phone.scamAccumulatorMs >= ctx.state.derived.scamSpawnIntervalMs &&
        phone.popups.length < MAX_POPUPS_PER_PHONE
      ) {
        phone.scamAccumulatorMs = 0;
        spawnPopup(phone, 'scam', now);
      }

      // 诈骗到点自动安装：扣费 + 激怒 + 可能扩散
      for (let i = phone.popups.length - 1; i >= 0; i -= 1) {
        const popup = phone.popups[i];
        if (popup.kind === 'scam' && now >= popup.installAt) {
          phone.popups.splice(i, 1);
          const penalty = scamPenalty();
          ctx.bus.emit({ type: 'SCAM_INSTALLED', customerId: customer.id, x: 0, y: 0, penalty });
          // 恶意软件扩散：再弹一个广告
          spawnPopup(phone, 'ad', now);
        }
      }
    }
  }

  return {
    name: 'core',
    init(context) {
      ctx = context;
      ctx.bus.on('BADGE_CLEARED', applyClear);
      ctx.bus.on('TAP', handleTap);
      ctx.bus.on('SWIPE', handleSwipe);
    },
    update(dt) {
      ctx.state.lastTickAt = performance.now();
      updateWorld(dt);
      saveAccumulator += dt;
      if (saveAccumulator >= 3_000) {
        saveAccumulator = 0;
        saveState(ctx.state);
      }
    },
  };
}
