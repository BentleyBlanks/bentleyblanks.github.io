import type { CustomerRuntime, GameState, IconRuntime, PhonePopup } from '../types/state.types';

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

export interface GameLayout {
  phoneLayouts: PhoneLayout[];
  queueLayouts: QueueLayout[];
  queuePanel: { x: number; y: number; w: number; h: number };
  playArea: { x: number; y: number; w: number; h: number };
  uiReserve: number;
  bottomReserve: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function computeGameLayout(state: GameState, width: number, height: number): GameLayout {
  const desktopUi = 0; // 不再有 DOM 侧栏，UI 全部画在画布上
  const bottomReserve = 92; // 底部画布控制栏（升级/技能/设置按钮）
  const topReserve = width >= 700 ? 66 : 58; // 顶部 HUD
  const queueWidth = clamp(width * (width < 560 ? 0.24 : 0.15), width < 560 ? 92 : 150, 216);
  const playX = queueWidth + (width >= 700 ? 24 : 16);
  const playY = topReserve + 6;
  const playW = Math.max(width < 520 ? 180 : 300, width - queueWidth - desktopUi - (width >= 700 ? 48 : 34));
  const playH = Math.max(width < 520 ? 214 : 280, height - playY - bottomReserve - 24);
  const activeCount = state.activeCustomers.length;
  const columns = activeCount >= 3 && playW > 620 ? 3 : activeCount >= 2 && playW > 430 ? 2 : 1;
  const rows = Math.max(1, Math.ceil(Math.max(activeCount, 1) / columns));
  const gap = width >= 900 ? 26 : 16;
  const maxPhoneWByWidth = (playW - gap * (columns - 1)) / columns;
  const maxPhoneWByHeight = (playH - gap * (rows - 1)) / rows / 1.88;
  const phoneLimit = width >= 960 ? (rows > 1 ? 286 : 352) : width < 520 ? 190 : 282;
  const phoneMin = width >= 960 ? (rows > 1 ? 132 : 184) : width < 520 ? 132 : 150;
  const phoneW = clamp(Math.min(maxPhoneWByWidth, maxPhoneWByHeight, phoneLimit), phoneMin, phoneLimit);
  const phoneH = phoneW * 1.88;
  const gridW = columns * phoneW + (columns - 1) * gap;
  const gridH = rows * phoneH + (rows - 1) * gap;
  const startX = playX + Math.max(0, (playW - gridW) / 2);
  const startY = playY + Math.max(0, (playH - gridH) / 2);

  const phoneLayouts = state.activeCustomers.map((customer, index) => {
    const col = index % columns;
    const row = Math.floor(index / columns);
    const x = startX + col * (phoneW + gap);
    const y = startY + row * (phoneH + gap);
    const bezel = phoneW * 0.07;
    const screenX = x + bezel;
    const screenY = y + phoneH * 0.09;
    const screenW = phoneW - bezel * 2;
    const screenH = phoneH * 0.8;
    const cellW = screenW / customer.phone.gridCols;
    const cellH = screenH / customer.phone.gridRows;
    const iconSize = Math.min(cellW, cellH) * 0.62;
    const icons = customer.phone.icons.map((icon) => ({
      customerId: customer.id,
      icon,
      x: screenX + icon.col * cellW + cellW / 2,
      y: screenY + icon.row * cellH + cellH / 2,
      size: iconSize,
      badgeX: screenX + icon.col * cellW + cellW / 2 + iconSize * 0.36,
      badgeY: screenY + icon.row * cellH + cellH / 2 - iconSize * 0.36,
    }));
    return { customer, x, y, w: phoneW, h: phoneH, screenX, screenY, screenW, screenH, icons };
  });

  const queuePanel = {
    x: 14,
    y: topReserve + 8,
    w: queueWidth - 26,
    h: Math.max(240, height - topReserve - bottomReserve - 40),
  };
  const queueGap = width < 520 ? 5 : 7;
  const queueHeaderReserve = width < 520 ? 34 : 38;
  const queueSlots = Math.max(1, Math.max(state.queueCapacity, state.queue.length));
  const rawQueueItemH = (queuePanel.h - queueHeaderReserve - queueGap * Math.max(0, queueSlots - 1)) / queueSlots;
  const queueItemH = clamp(rawQueueItemH, width < 520 ? 34 : 40, width < 520 ? 52 : 64);
  const bottom = queuePanel.y + queuePanel.h - queueItemH - 6;
  const queueLayouts = state.queue.map((customer, index) => ({
    customer,
    x: queuePanel.x,
    y: bottom - index * (queueItemH + queueGap),
    w: queuePanel.w,
    h: queueItemH,
  }));

  return {
    phoneLayouts,
    queueLayouts,
    queuePanel,
    playArea: { x: playX, y: playY, w: playW, h: playH },
    uiReserve: desktopUi,
    bottomReserve,
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
