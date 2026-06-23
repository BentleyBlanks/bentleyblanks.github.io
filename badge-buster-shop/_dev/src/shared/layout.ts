import type { CustomerRuntime, GameState, IconRuntime } from '../types/state.types';

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
  const desktopUi = width >= 960 ? 340 : 0;
  const bottomReserve = width >= 960 ? 0 : 228;
  const queueWidth = clamp(width * 0.16, 112, 176);
  const topReserve = width >= 700 ? 76 : 58;
  const playX = queueWidth + 18;
  const playY = topReserve;
  const playW = Math.max(260, width - queueWidth - desktopUi - 42);
  const playH = Math.max(280, height - topReserve - bottomReserve - 30);
  const activeCount = state.activeCustomers.length;
  const columns = activeCount >= 3 && playW > 780 ? 3 : activeCount >= 2 && playW > 520 ? 2 : 1;
  const rows = Math.max(1, Math.ceil(Math.max(activeCount, 1) / columns));
  const gap = width >= 900 ? 26 : 16;
  const maxPhoneWByWidth = (playW - gap * (columns - 1)) / columns;
  const maxPhoneWByHeight = (playH - gap * (rows - 1)) / rows / 1.88;
  const phoneW = clamp(Math.min(maxPhoneWByWidth, maxPhoneWByHeight, 282), 150, 282);
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
  const queueItemH = clamp(queuePanel.h / Math.max(4, state.queueCapacity + 1), 48, 64);
  const overlap = queueItemH * 0.3;
  const bottom = queuePanel.y + queuePanel.h - queueItemH;
  const queueLayouts = state.queue.map((customer, index) => ({
    customer,
    x: queuePanel.x,
    y: bottom - index * (queueItemH - overlap),
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
