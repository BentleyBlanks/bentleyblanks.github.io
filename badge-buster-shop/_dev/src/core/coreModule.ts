import {
  INCOMING_BASE_INTERVAL_MS,
  MALWARE_GAIN_INTERVAL_MS,
  MALWARE_MAX,
  MALWARE_UNLOCK_LEVEL,
  MAX_NOTIFICATIONS,
  MAX_POPUPS_PER_PHONE,
  NOTIF_BASE_INTERVAL_MS,
  SCAM_UNLOCK_LEVEL,
} from '../content/balance';
import {
  computeGameLayout,
  malwareButtonRect,
  notifBarRect,
  phoneClearingDisabled,
  popupRectOf,
  rectContains,
  type IconLayout,
} from '../shared/layout';
import type { AppIconDef } from '../types/content.types';
import type { GameEvent } from '../types/events.types';
import type { GameContext, GameModule } from '../types/module.types';
import type { CustomerRuntime, IconRuntime, PhonePopup, PhoneRuntime, PopupKind } from '../types/state.types';
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
  const fy = Math.min(Math.max(0.22 + Math.random() * 0.4, 0.2), 0.86 - fh);
  return {
    id: `popup_${Math.floor(now)}_${popupSeq}`,
    kind, fx, fy, fw, fh,
    closeFx: 0.82, closeFy: 0.07, closeFw: 0.15, closeFh: 0.34,
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

  function grantXp(amount: number): void {
    const xpMult = performance.now() < ctx.state.effects.tipBoostUntil ? ctx.state.effects.tipBoostMult : 1;
    ctx.bus.emit({ type: 'XP_GAINED', amount: amount * ctx.state.derived.xpPerBadge * xpMult });
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
    grantXp(amount);
    if (recalcPhone(customer) <= 0 && !customer.phone.cleaned) {
      customer.phone.cleaned = true;
      ctx.bus.emit({ type: 'PHONE_CLEANED', customerId: customer.id });
    }
  }

  function findIconAt(x: number, y: number): IconLayout | null {
    const layout = computeGameLayout(ctx.state, ctx.canvas.clientWidth, ctx.canvas.clientHeight);
    let best: { icon: IconLayout; d: number } | null = null;
    for (const phone of layout.phoneLayouts) {
      if (phoneClearingDisabled(phone)) continue; // 弹窗遮挡 或 卡死 → 整机禁清
      for (const icon of phone.icons) {
        if (icon.icon.badge <= 0) continue;
        const radius = icon.size * 0.62;
        const d = distance({ x, y }, icon);
        if (d <= radius && (!best || d < best.d)) best = { icon, d };
      }
    }
    return best?.icon ?? null;
  }

  function iconsAlongPath(path: { x: number; y: number }[]): IconLayout[] {
    const layout = computeGameLayout(ctx.state, ctx.canvas.clientWidth, ctx.canvas.clientHeight);
    const touched = new Map<string, IconLayout>();
    for (const phone of layout.phoneLayouts) {
      if (phoneClearingDisabled(phone)) continue;
      for (const icon of phone.icons) {
        if (icon.icon.badge <= 0) continue;
        const radius = icon.size * 0.68;
        if (path.some((point) => distance(point, icon) <= radius)) touched.set(icon.icon.id, icon);
      }
    }
    return [...touched.values()];
  }

  function closePopup(customer: CustomerRuntime, popup: PhonePopup, cx: number, cy: number): void {
    customer.phone.popups = customer.phone.popups.filter((item) => item.id !== popup.id);
    const defused = popup.kind === 'scam';
    grantXp(defused ? 3 : 1);
    ctx.bus.emit({ type: 'POPUP_CLOSED', customerId: customer.id, kind: popup.kind, x: cx, y: cy, defused });
  }

  function handlePopupTap(x: number, y: number): boolean {
    const layout = computeGameLayout(ctx.state, ctx.canvas.clientWidth, ctx.canvas.clientHeight);
    for (const phone of layout.phoneLayouts) {
      const popups = phone.customer.phone.popups;
      for (let i = popups.length - 1; i >= 0; i -= 1) {
        const popup = popups[i];
        const rect = popupRectOf(phone, popup);
        if (!rectContains(rect, x, y)) continue;
        if (rectContains({ x: rect.closeX, y: rect.closeY, w: rect.closeW, h: rect.closeH }, x, y)) {
          closePopup(phone.customer, popup, rect.closeX + rect.closeW / 2, rect.closeY + rect.closeH / 2);
        }
        return true; // 点到弹窗任意处都吞掉（防穿透）
      }
    }
    return false;
  }

  function handleMalwareTap(x: number, y: number): boolean {
    const layout = computeGameLayout(ctx.state, ctx.canvas.clientWidth, ctx.canvas.clientHeight);
    for (const phone of layout.phoneLayouts) {
      const runtime = phone.customer.phone;
      if (runtime.malware <= 0) continue;
      if (rectContains(malwareButtonRect(phone), x, y)) {
        const amount = Math.min(runtime.malware, ctx.state.derived.malwareClearPower);
        runtime.malware = Math.max(0, runtime.malware - amount);
        grantXp(Math.max(1, Math.round(amount / 12)));
        const r = malwareButtonRect(phone);
        ctx.bus.emit({ type: 'MALWARE_CLEARED', customerId: phone.customer.id, amount, x: r.x + r.w / 2, y: r.y + r.h / 2 });
        return true;
      }
    }
    return false;
  }

  function handleNotificationPull(path: { x: number; y: number }[]): boolean {
    const first = path[0];
    const last = path[path.length - 1];
    if (!first || !last) return false;
    if (last.y - first.y < 40 || Math.abs(last.x - first.x) > Math.abs(last.y - first.y) * 0.9) return false; // 必须明显向下
    const layout = computeGameLayout(ctx.state, ctx.canvas.clientWidth, ctx.canvas.clientHeight);
    for (const phone of layout.phoneLayouts) {
      const runtime = phone.customer.phone;
      if (runtime.notifications <= 0) continue;
      if (rectContains(notifBarRect(phone), first.x, first.y)) {
        const amount = Math.min(runtime.notifications, ctx.state.derived.notificationClearPower);
        runtime.notifications -= amount;
        grantXp(amount);
        ctx.bus.emit({ type: 'NOTIFICATION_CLEARED', customerId: phone.customer.id, amount, x: phone.screenX + phone.screenW / 2, y: phone.screenY + phone.screenH * 0.18 });
        return true;
      }
    }
    return false;
  }

  function spawnPopup(phone: PhoneRuntime, kind: PopupKind, now: number): void {
    if (phone.popups.length >= MAX_POPUPS_PER_PHONE) return;
    phone.popups.push(buildPopup(kind, now, ctx.state.derived.scamGraceMs));
  }

  function scamPenalty(): number {
    const antivirus = ctx.state.upgrades['up_antivirus'] ?? 0;
    return Math.max(5, Math.round((9 + ctx.state.level * 3) * (1 - 0.12 * antivirus)));
  }

  function handleTap(event: Extract<GameEvent, { type: 'TAP' }>): void {
    if (event.consumed) return;
    if (handlePopupTap(event.x, event.y)) return;   // 关弹窗优先
    if (handleMalwareTap(event.x, event.y)) return;  // 清理后台
    const hit = findIconAt(event.x, event.y);
    if (hit) emitClear(hit, ctx.state.derived.clearPerHit);
  }

  function handleSwipe(event: Extract<GameEvent, { type: 'SWIPE' }>): void {
    if (event.consumed) return;
    if (handleNotificationPull(event.path)) return;  // 下拉通知栏
    if (!ctx.state.derived.swipeEnabled) {
      const last = event.path[event.path.length - 1];
      if (last) handleTap({ type: 'TAP', x: last.x, y: last.y });
      return;
    }
    for (const icon of iconsAlongPath(event.path)) emitClear(icon, ctx.state.derived.clearPerHit);
  }

  function addIncomingBadge(customer: CustomerRuntime): void {
    const candidates = customer.phone.icons.filter((icon) => {
      const def = iconDef(icon, ctx.content.icons);
      return def ? icon.badge < def.maxBadge : true;
    });
    if (candidates.length === 0) return;
    const icon = candidates[Math.floor(Math.random() * candidates.length)];
    icon.badge += 1;
    customer.phone.badgeTotal += 1;
  }

  function updateWorld(dt: number): void {
    const now = performance.now();
    const isFrozen = frozen(now);
    for (const customer of ctx.state.activeCustomers) {
      const phone = customer.phone;

      // 后台恶意软件（被动自动杀毒持续生效，即使手机已清角标也跑，便于卡死解除）
      if (!isFrozen && ctx.state.level >= MALWARE_UNLOCK_LEVEL) {
        phone.malwareAccumulatorMs += dt;
        const gain = 3 + ctx.state.level * 0.4;
        while (phone.malwareAccumulatorMs >= MALWARE_GAIN_INTERVAL_MS) {
          phone.malwareAccumulatorMs -= MALWARE_GAIN_INTERVAL_MS;
          phone.malware = Math.min(MALWARE_MAX, phone.malware + gain);
        }
      }
      if (ctx.state.derived.malwareAutoPerSec > 0 && phone.malware > 0) {
        phone.malware = Math.max(0, phone.malware - (ctx.state.derived.malwareAutoPerSec * dt) / 1000);
      }

      if (phone.cleaned) continue;

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

      // 顶部通知栏广告
      if (!isFrozen) {
        phone.notificationAccumulatorMs += dt;
        while (phone.notificationAccumulatorMs >= NOTIF_BASE_INTERVAL_MS && phone.notifications < MAX_NOTIFICATIONS) {
          phone.notificationAccumulatorMs -= NOTIF_BASE_INTERVAL_MS;
          phone.notifications += 1;
        }
      }

      // 遮挡广告弹窗
      phone.popupAccumulatorMs += dt;
      if (!isFrozen && phone.popupAccumulatorMs >= ctx.state.derived.adSpawnIntervalMs && phone.popups.length < MAX_POPUPS_PER_PHONE) {
        phone.popupAccumulatorMs = 0;
        spawnPopup(phone, 'ad', now);
      }

      // 诈骗弹窗（限一个在场）
      phone.scamAccumulatorMs += dt;
      const hasScam = phone.popups.some((item) => item.kind === 'scam');
      if (!isFrozen && ctx.state.level >= SCAM_UNLOCK_LEVEL && !hasScam && phone.scamAccumulatorMs >= ctx.state.derived.scamSpawnIntervalMs && phone.popups.length < MAX_POPUPS_PER_PHONE) {
        phone.scamAccumulatorMs = 0;
        spawnPopup(phone, 'scam', now);
      }

      // 诈骗到点自动安装：扣费 + 激怒 + 扩散
      for (let i = phone.popups.length - 1; i >= 0; i -= 1) {
        const popup = phone.popups[i];
        if (popup.kind === 'scam' && now >= popup.installAt) {
          phone.popups.splice(i, 1);
          ctx.bus.emit({ type: 'SCAM_INSTALLED', customerId: customer.id, x: 0, y: 0, penalty: scamPenalty() });
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
