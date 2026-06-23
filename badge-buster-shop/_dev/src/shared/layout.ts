import { MALWARE_LAG_THRESHOLD } from '../content/balance';
import type { CustomerRuntime, GameState, IconRuntime, PhonePopup } from '../types/state.types';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface IconLayout {
  customerId: string;
  icon: IconRuntime;
  x: number;
  y: number;
  size: number;
  badgeX: number;
  badgeY: number;
}

export interface PhoneLayout {
  customer: CustomerRuntime;
  x: number;
  y: number;
  w: number;
  h: number;
  screenX: number;
  screenY: number;
  screenW: number;
  screenH: number;
  icons: IconLayout[];
}

export interface QueueLayout {
  customer: CustomerRuntime;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SlotTab {
  index: number;
  rect: Rect;
  customer: CustomerRuntime;
}

export interface GameLayout {
  phoneLayouts: PhoneLayout[];
  queueLayouts: QueueLayout[];
  queuePanel: Rect; // 顶部横向候客条
  playArea: Rect;
  uiReserve: number;
  bottomReserve: number;
  slotTabs: SlotTab[]; // 多工位时的切换标签
  focusedIndex: number;
  topHud: number;
}

/** 维修台底部抽屉的高度（手机清完进入维修阶段时占用底部，挤压手机区） */
export const REPAIR_BENCH_H = 204;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function buildPhoneLayout(customer: CustomerRuntime, x: number, y: number, w: number, h: number): PhoneLayout {
  const bezel = w * 0.07;
  const screenX = x + bezel;
  const screenY = y + h * 0.09;
  const screenW = w - bezel * 2;
  const screenH = h * 0.8;
  // 图标网格区：顶部让出状态/通知栏（否则首行图标被通知条压住=错位 #2），底部让出 Home 指示条与"清理后台"按钮
  const gridTop = screenY + screenH * 0.16;
  const gridBottom = screenY + screenH * 0.88;
  const gridH = gridBottom - gridTop;
  const sidePad = screenW * 0.04; // 左右留白，图标不顶到屏幕边
  const gridW = screenW - sidePad * 2;
  const cellW = gridW / customer.phone.gridCols;
  const cellH = gridH / customer.phone.gridRows;
  const iconSize = Math.min(cellW, cellH) * 0.78; // 放大图标（原 0.66 偏小 #2）
  const icons = customer.phone.icons.map((icon) => ({
    customerId: customer.id,
    icon,
    x: screenX + sidePad + icon.col * cellW + cellW / 2,
    y: gridTop + icon.row * cellH + cellH / 2,
    size: iconSize,
    badgeX: screenX + sidePad + icon.col * cellW + cellW / 2 + iconSize * 0.38,
    badgeY: gridTop + icon.row * cellH + cellH / 2 - iconSize * 0.38,
  }));
  return { customer, x, y, w, h, screenX, screenY, screenW, screenH, icons };
}

// 移动优先：单台大手机聚焦 + 工位切换标签 + 顶部横向候客条 + 底部大按钮栏。
export function computeGameLayout(state: GameState, width: number, height: number): GameLayout {
  const activeCount = state.activeCustomers.length;
  const focusedIndex = activeCount > 0 ? clamp(Math.floor(state.ui.focusedSlot ?? 0), 0, activeCount - 1) : 0;

  const topHud = width >= 700 ? 62 : 56;
  const queueH = 58;
  // 聚焦中的手机若已进入维修台阶段，底部让出更高的维修抽屉（挤压手机区，避免遮挡）
  const benchOpen = !!state.activeCustomers[focusedIndex]?.phone.awaitingDelivery;
  const bottomReserve = benchOpen ? REPAIR_BENCH_H + 6 : 96; // 底部大控制栏（拇指可达）
  const tabH = activeCount > 1 ? 42 : 0;

  const phoneTop = topHud + queueH + tabH + 6;
  const phoneAreaH = Math.max(220, height - phoneTop - bottomReserve - 8);
  const maxW = Math.min(width * 0.94, 460);
  let phoneH = phoneAreaH;
  let phoneW = phoneH * 0.5;
  if (phoneW > maxW) {
    phoneW = maxW;
    phoneH = phoneW / 0.5;
  }
  const phoneX = (width - phoneW) / 2;
  const phoneY = phoneTop + Math.max(0, (phoneAreaH - phoneH) / 2);

  const phoneLayouts: PhoneLayout[] = [];
  const focused = state.activeCustomers[focusedIndex];
  if (focused) {
    phoneLayouts.push(buildPhoneLayout(focused, phoneX, phoneY, phoneW, phoneH));
  }

  const slotTabs: SlotTab[] = [];
  if (activeCount > 1) {
    const tw = Math.min(120, (width - 20 - (activeCount - 1) * 8) / activeCount);
    const totalW = tw * activeCount + 8 * (activeCount - 1);
    let tx = (width - totalW) / 2;
    const ty = topHud + queueH + 4;
    for (let i = 0; i < activeCount; i += 1) {
      slotTabs.push({ index: i, rect: { x: tx, y: ty, w: tw, h: tabH - 8 }, customer: state.activeCustomers[i] });
      tx += tw + 8;
    }
  }

  const queuePanel: Rect = { x: 0, y: topHud, w: width, h: queueH };
  const qCap = Math.max(1, Math.max(state.queueCapacity, state.queue.length));
  const qPad = 12;
  const qGap = 8;
  const avatar = clamp((width - qPad * 2 - qGap * (qCap - 1)) / qCap, 34, 54);
  const queueLayouts = state.queue.map((customer, index) => ({
    customer,
    x: qPad + index * (avatar + qGap),
    y: topHud + (queueH - avatar) / 2,
    w: avatar,
    h: avatar,
  }));

  return {
    phoneLayouts,
    queueLayouts,
    queuePanel,
    playArea: { x: 0, y: phoneTop, w: width, h: phoneAreaH },
    uiReserve: 0,
    bottomReserve,
    slotTabs,
    focusedIndex,
    topHud,
  };
}

export interface PopupRect {
  x: number; y: number; w: number; h: number;
  closeX: number; closeY: number; closeW: number; closeH: number;
}

/** 把弹窗的比例坐标换算成屏幕绝对矩形（render 绘制与 core 命中共用）。 */
export function popupRectOf(phone: PhoneLayout, popup: PhonePopup): PopupRect {
  const x = phone.screenX + popup.fx * phone.screenW;
  const y = phone.screenY + popup.fy * phone.screenH;
  const w = popup.fw * phone.screenW;
  const h = popup.fh * phone.screenH;
  return {
    x, y, w, h,
    closeX: x + popup.closeFx * w,
    closeY: y + popup.closeFy * h,
    closeW: popup.closeFw * w,
    closeH: popup.closeFh * h,
  };
}

export function rectContains(rect: { x: number; y: number; w: number; h: number }, px: number, py: number): boolean {
  return px >= rect.x && px <= rect.x + rect.w && py >= rect.y && py <= rect.y + rect.h;
}

/** 图标中心是否被任一弹窗遮住（被遮住则不能点/划清）。 */
export function iconCoveredByPopup(phone: PhoneLayout, icon: IconLayout): boolean {
  for (const popup of phone.customer.phone.popups) {
    if (rectContains(popupRectOf(phone, popup), icon.x, icon.y)) {
      return true;
    }
  }
  return false;
}

/** 有遮挡弹窗时整机禁清（#1）。 */
export function phoneBlockedByPopup(phone: PhoneLayout): boolean {
  return phone.customer.phone.popups.length > 0;
}

/** 后台恶意软件过高 → 卡死，无法清角标（#5）。 */
export function phoneLaggy(phone: PhoneLayout): boolean {
  return phone.customer.phone.malware >= MALWARE_LAG_THRESHOLD;
}

/** 该机当前是否无法清角标（弹窗遮挡 或 卡死）。 */
export function phoneClearingDisabled(phone: PhoneLayout): boolean {
  return phoneBlockedByPopup(phone) || phoneLaggy(phone);
}

/** 屏幕底部"清理后台"按钮（仅 malware>0 时显示/可点）。 */
export function malwareButtonRect(phone: PhoneLayout): Rect {
  return { x: phone.screenX + phone.screenW * 0.13, y: phone.screenY + phone.screenH * 0.9, w: phone.screenW * 0.74, h: phone.screenH * 0.075 };
}

/** 顶部通知栏区域（从这里向下滑动 = 下拉通知栏清理）。 */
export function notifBarRect(phone: PhoneLayout): Rect {
  return { x: phone.screenX, y: phone.screenY, w: phone.screenW, h: phone.screenH * 0.18 };
}

/** 盲盒 offer 弹窗底部的"清理"接受按钮（✕ 为拒绝）。 */
export function popupAcceptRect(rect: PopupRect): Rect {
  const w = rect.w * 0.52;
  const h = rect.h * 0.3;
  return { x: rect.x + (rect.w - w) / 2, y: rect.y + rect.h - h - rect.h * 0.1, w, h };
}

/** 宇宙魔方手机的"拔电源"拆除按钮。 */
export function defuseButtonRect(phone: PhoneLayout): Rect {
  const w = phone.screenW * 0.62;
  const h = phone.screenH * 0.1;
  return { x: phone.screenX + (phone.screenW - w) / 2, y: phone.screenY + phone.screenH * 0.44, w, h };
}
