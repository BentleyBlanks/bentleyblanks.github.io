import {
  BAIT_FINE_PER_TIER,
  BAIT_UNLOCK_LEVEL,
  GOLDEN_BREAK_CHANCE,
  GOLDEN_FINE_PER_TIER,
  INCOMING_BASE_INTERVAL_MS,
  MALWARE_GAIN_INTERVAL_MS,
  MALWARE_MAX,
  MALWARE_PROMPT_THRESHOLD,
  MALWARE_UNLOCK_LEVEL,
  MAX_NOTIFICATIONS,
  MAX_POPUPS_PER_PHONE,
  NOTIF_BASE_INTERVAL_MS,
  OFFER_BASE_INTERVAL_MS,
  OFFER_FINE_PER_TIER,
  OFFER_UNLOCK_LEVEL,
  OFFER_WIN_CHANCE,
  OFFER_WIN_PER_TIER,
  SCAM_UNLOCK_LEVEL,
  TIMED_CLOSE_MS,
} from '../content/balance';
import {
  computeGameLayout,
  defuseButtonRect,
  malwareButtonRect,
  notifBarRect,
  phoneClearingDisabled,
  popupAcceptRect,
  popupRectOf,
  rectContains,
  type IconLayout,
  type PhoneLayout,
} from '../shared/layout';
import type { AppIconDef } from '../types/content.types';
import type { GameEvent } from '../types/events.types';
import type { GameContext, GameModule } from '../types/module.types';
import type { CustomerRuntime, IconRuntime, PhonePopup, PhoneRuntime, PopupKind } from '../types/state.types';
import { saveState } from './persistence';
import { dodgeStep, rollMotion, stepBubble } from './popupMotion';

const AD_TITLES = ['🧧 恭喜中红包', '附近的人想认识你', '🔥 限时 1 折', '点击领取大礼包', '您有 1 条新消息'];
const AD_BODIES = ['立即领取 ›', '马上查看', '仅剩 3 个名额', '免费试用 7 天'];
const SCAM_TITLES = ['⚠ 检测到病毒', '账户异常需验证', '免费领 iPhone', '🎁 中奖通知'];
const SCAM_BODIES = ['不处理将自动安装', '点此验证身份', '填写信息领取', '倒计时结束即扣费'];
const OFFER_TITLES = ['🎁 帮顾客一键清理垃圾？', '🧹 深度清理优化？'];
const OFFER_BODIES = ['可能有惊喜，也可能清空资料赔钱'];
const BAIT_TITLES = ['🎉 恭喜获得 ¥888', '✅ 系统赠送免费升级', '🎁 点击领 500 经验', '💰 现金红包已到账', '🏆 您是第 1 位幸运用户'];
const BAIT_BODIES = ['点击立即领取', '名额有限 速领', '审核已通过'];
const TIMED_TITLES = ['🎬 精彩视频广告', '📺 广告加载中…', '您可能感兴趣的内容'];
const TIMED_BODIES = ['倒计时结束后可关闭', '稍候即可跳过'];

function pickAdKind(level: number): PopupKind {
  const r = Math.random();
  if (r < 0.22) return 'timed';
  if (level >= BAIT_UNLOCK_LEVEL && r < 0.46) return 'bait'; // 假奖励陷阱
  return 'ad';
}

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

function buildPopup(kind: PopupKind, now: number, graceMs: number, level: number): PhonePopup {
  popupSeq += 1;
  const hasButton = kind === 'offer' || kind === 'bait';
  const { motion, vx, vy } = rollMotion(kind, level);
  // 泡泡弹窗做小一点，才有空间"滚来滚去"；其余保持常规大小
  const fw = motion === 'bubble' ? 0.34 + Math.random() * 0.1 : 0.62 + Math.random() * 0.22;
  const fh = motion === 'bubble' ? 0.16 + Math.random() * 0.04 : (hasButton ? 0.28 : 0.15) + Math.random() * 0.06;
  const fx = Math.min(Math.max((1 - fw) / 2 + (Math.random() - 0.5) * (motion === 'bubble' ? 0.4 : 0.12), 0.04), 1 - fw - 0.04);
  const fy = Math.min(Math.max(0.2 + Math.random() * 0.36, 0.18), 0.88 - fh);
  const title =
    kind === 'scam' ? pick(SCAM_TITLES)
      : kind === 'offer' ? pick(OFFER_TITLES)
        : kind === 'bait' ? pick(BAIT_TITLES)
          : kind === 'timed' ? pick(TIMED_TITLES)
            : pick(AD_TITLES);
  const body =
    kind === 'scam' ? pick(SCAM_BODIES)
      : kind === 'offer' ? pick(OFFER_BODIES)
        : kind === 'bait' ? pick(BAIT_BODIES)
          : kind === 'timed' ? pick(TIMED_BODIES)
            : pick(AD_BODIES);
  const accent =
    kind === 'scam' ? '#FF3B30'
      : kind === 'offer' ? '#8E7CF6'
        : kind === 'bait' ? '#E8B500' // 看起来像真奖励的金色
          : '#FF9F43';
  return {
    id: `popup_${Math.floor(now)}_${popupSeq}`,
    kind, fx, fy, fw, fh,
    closeFx: 0.82, closeFy: 0.07, closeFw: 0.15, closeFh: 0.28,
    bornAt: now,
    installAt: kind === 'scam' ? now + graceMs : Number.POSITIVE_INFINITY,
    title, body, accent,
    motion, vx, vy,
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
    // 黄金手机：清除时小概率碎裂 → 被抓走赔巨款（抢先于正常结算）
    if (customer.phone.variant === 'golden' && !customer.phone.cleaned && Math.random() < GOLDEN_BREAK_CHANCE) {
      customer.phone.cleaned = true;
      const fine = Math.round(GOLDEN_FINE_PER_TIER * customer.phone.tier);
      ctx.bus.emit({ type: 'RISK_EVENT', customerId: customer.id, kind: 'golden_break', amount: fine, label: `黄金机碎裂 赔${fine}`, x: event.x, y: event.y });
      return;
    }
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
        const radius = icon.size * 0.92 + 4; // 放宽点击容差，移动端更易点中
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

  function resolveOffer(customer: CustomerRuntime, popup: PhonePopup, x: number, y: number): void {
    customer.phone.popups = customer.phone.popups.filter((item) => item.id !== popup.id);
    const tier = customer.phone.tier;
    if (Math.random() < OFFER_WIN_CHANCE) {
      const reward = Math.round(OFFER_WIN_PER_TIER * tier);
      ctx.bus.emit({ type: 'RISK_EVENT', customerId: customer.id, kind: 'offer_win', amount: reward, label: `清理成功 +${reward}`, x, y });
    } else {
      const fine = Math.round(OFFER_FINE_PER_TIER * tier);
      ctx.bus.emit({ type: 'RISK_EVENT', customerId: customer.id, kind: 'offer_fail', amount: fine, label: `资料清空 赔${fine}`, x, y });
    }
  }

  function dismissPopup(customer: CustomerRuntime, popup: PhonePopup, rect: { closeX: number; closeY: number; closeW: number; closeH: number }): void {
    customer.phone.popups = customer.phone.popups.filter((it) => it.id !== popup.id);
    ctx.bus.emit({ type: 'POPUP_CLOSED', customerId: customer.id, kind: popup.kind, x: rect.closeX, y: rect.closeY, defused: false });
  }

  function handlePopupTap(x: number, y: number): boolean {
    const now = performance.now();
    const layout = computeGameLayout(ctx.state, ctx.canvas.clientWidth, ctx.canvas.clientHeight);
    for (const phone of layout.phoneLayouts) {
      const popups = phone.customer.phone.popups;
      for (let i = popups.length - 1; i >= 0; i -= 1) {
        const popup = popups[i];
        const rect = popupRectOf(phone, popup);
        if (!rectContains(rect, x, y)) continue;
        const closeHit = rectContains({ x: rect.closeX, y: rect.closeY, w: rect.closeW, h: rect.closeH }, x, y);
        const btn = popupAcceptRect(rect);

        if (popup.kind === 'offer') {
          if (rectContains(btn, x, y)) resolveOffer(phone.customer, popup, btn.x + btn.w / 2, btn.y);
          else if (closeHit) dismissPopup(phone.customer, popup, rect);
          return true;
        }
        if (popup.kind === 'bait') {
          if (rectContains(btn, x, y)) {
            // 上当了：点了那个"领取/升级/送经验"的诱饵按钮 → 扣钱
            phone.customer.phone.popups = phone.customer.phone.popups.filter((it) => it.id !== popup.id);
            const fine = Math.round(BAIT_FINE_PER_TIER * phone.customer.phone.tier);
            ctx.bus.emit({ type: 'RISK_EVENT', customerId: phone.customer.id, kind: 'bait_fail', amount: fine, label: `假的！赔 ${fine}`, x: btn.x + btn.w / 2, y: btn.y });
          } else if (closeHit) {
            closePopup(phone.customer, popup, rect.closeX + rect.closeW / 2, rect.closeY + rect.closeH / 2); // ✕ 才是安全的
          }
          return true;
        }
        if (popup.kind === 'timed') {
          if (closeHit && now >= popup.bornAt + TIMED_CLOSE_MS) {
            closePopup(phone.customer, popup, rect.closeX + rect.closeW / 2, rect.closeY + rect.closeH / 2);
          }
          return true; // 倒计时未到：✕ 不响应，但仍吞掉点击（无法清角标）
        }

        if (closeHit) {
          closePopup(phone.customer, popup, rect.closeX + rect.closeW / 2, rect.closeY + rect.closeH / 2);
        }
        return true; // 点到弹窗任意处都吞掉（防穿透）
      }
    }
    return false;
  }

  function handleDefuseTap(x: number, y: number): boolean {
    const layout = computeGameLayout(ctx.state, ctx.canvas.clientWidth, ctx.canvas.clientHeight);
    for (const phone of layout.phoneLayouts) {
      const runtime = phone.customer.phone;
      if (runtime.variant !== 'cosmic' || !Number.isFinite(runtime.transformMs)) continue;
      if (rectContains(defuseButtonRect(phone), x, y)) {
        runtime.variant = 'normal';
        runtime.transformMs = Number.POSITIVE_INFINITY;
        grantXp(3);
        return true;
      }
    }
    return false;
  }

  function handleMalwareTap(x: number, y: number): boolean {
    const layout = computeGameLayout(ctx.state, ctx.canvas.clientWidth, ctx.canvas.clientHeight);
    for (const phone of layout.phoneLayouts) {
      const runtime = phone.customer.phone;
      if (runtime.malware < MALWARE_PROMPT_THRESHOLD) continue; // 仅 ≥60% 才有按钮可点
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
    phone.popups.push(buildPopup(kind, now, ctx.state.derived.scamGraceMs, ctx.state.level));
  }

  // 恶心弹窗的移动：bubble 像泡泡乱滚（碰边反弹），dodge 在光标靠近 ✕ 时逃开
  function updatePopupMotion(customer: CustomerRuntime, phoneLayout: PhoneLayout | undefined, dt: number): void {
    const popups = customer.phone.popups;
    if (popups.length === 0) return;
    const cursor = ctx.state.ui.cursor;
    const canDodge = !!phoneLayout && phoneLayout.customer.id === customer.id && cursor.visible;
    for (const popup of popups) {
      if (popup.motion === 'bubble') {
        stepBubble(popup, dt);
      } else if (popup.motion === 'dodge' && canDodge && phoneLayout) {
        dodgeStep(popup, popupRectOf(phoneLayout, popup), cursor.x, cursor.y);
      }
    }
  }

  function scamPenalty(): number {
    const antivirus = ctx.state.upgrades['up_antivirus'] ?? 0;
    return Math.max(5, Math.round((9 + ctx.state.level * 3) * (1 - 0.12 * antivirus)));
  }

  function handleTap(event: Extract<GameEvent, { type: 'TAP' }>): void {
    if (event.consumed) return;
    if (handlePopupTap(event.x, event.y)) return;   // 关弹窗 / 盲盒抉择优先
    if (handleMalwareTap(event.x, event.y)) return;  // 清理后台
    if (handleDefuseTap(event.x, event.y)) return;   // 拔电源拆除宇宙魔方
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
    // 仅聚焦中的手机会进入 phoneLayouts（单机大屏）；dodge 需要它来计算光标与 ✕ 的距离
    const layout = computeGameLayout(ctx.state, ctx.canvas.clientWidth, ctx.canvas.clientHeight);
    for (const customer of ctx.state.activeCustomers) {
      const phone = customer.phone;

      // 恶心弹窗乱动（泡泡乱滚 / 躲避光标）——即便手机已清完也让它平滑停住
      updatePopupMotion(customer, layout.phoneLayouts.find((pl) => pl.customer.id === customer.id), dt);

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
        spawnPopup(phone, pickAdKind(ctx.state.level), now);
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

      // 宇宙魔方手机：倒计时（冻结时暂停）→ 变形金刚砸店 → 现金清零
      if (phone.variant === 'cosmic' && Number.isFinite(phone.transformMs)) {
        if (!isFrozen) phone.transformMs -= dt;
        if (phone.transformMs <= 0) {
          phone.transformMs = Number.POSITIVE_INFINITY;
          phone.cleaned = true;
          ctx.bus.emit({ type: 'RISK_EVENT', customerId: customer.id, kind: 'transformer', amount: ctx.state.points, label: '变形金刚砸店 破产!', x: 0, y: 0 });
        }
      }

      // 盲盒"帮清理垃圾"邀约弹窗
      phone.offerAccumulatorMs += dt;
      if (!isFrozen && ctx.state.level >= OFFER_UNLOCK_LEVEL && phone.offerAccumulatorMs >= OFFER_BASE_INTERVAL_MS && !phone.popups.some((p) => p.kind === 'offer') && phone.popups.length < MAX_POPUPS_PER_PHONE) {
        phone.offerAccumulatorMs = 0;
        spawnPopup(phone, 'offer', now);
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
