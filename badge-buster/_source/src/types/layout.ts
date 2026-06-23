// layout.ts —— 画布场景的"几何契约"（冻结，纯函数）。
// render 用它绘制、core 用它命中测试、input 换算坐标、ui 据 REGIONS 摆放 DOM 控件，
// 三者共享同一份几何，杜绝漂移。
//
// 纵向分区（逻辑 960×640，互不重叠）：
//   HUD     y   0.. 52   （DOM 顶栏）
//   服务区   y  58..498   （画布：顾客 + 手机）
//   候客厅   y 504..566   （画布：排队顾客）
//   控制带   y 572..640   （DOM：左下"商店"抽屉按钮 + 右下技能栏）
// 画布的可交互内容只落在"服务区/候客厅"，控制带留给 DOM 控件，二者天然不重叠。
import type { GameState } from './state.types';

export const LOGICAL_W = 960;
export const LOGICAL_H = 640;

export interface Rect { x: number; y: number; w: number; h: number; }

export const REGIONS: { hud: Rect; service: Rect; queue: Rect; controls: Rect } = {
  hud: { x: 0, y: 0, w: LOGICAL_W, h: 52 },
  service: { x: 40, y: 58, w: LOGICAL_W - 80, h: 440 }, // x40..920 y58..498
  queue: { x: 0, y: 504, w: LOGICAL_W, h: 62 },          // y504..566
  controls: { x: 0, y: 572, w: LOGICAL_W, h: 68 },       // y572..640
};

export interface CellRect { col: number; row: number; rect: Rect; }

export interface StationLayout {
  index: number;
  station: Rect;
  customerRect: Rect;
  phoneRect: Rect;
  screenRect: Rect;
  gridCols: number;
  gridRows: number;
  cells: CellRect[];
}

export interface SceneLayout {
  stations: StationLayout[];
  queue: { area: Rect; slots: Rect[] };
}

function gridCells(screen: Rect, cols: number, rows: number): CellRect[] {
  const cells: CellRect[] = [];
  const cw = screen.w / cols;
  const ch = screen.h / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      cells.push({ col: c, row: r, rect: { x: screen.x + c * cw, y: screen.y + r * ch, w: cw, h: ch } });
    }
  }
  return cells;
}

export function computeLayout(state: GameState): SceneLayout {
  const slots = Math.max(1, state.activeSlots);
  const cols = state.activeCustomers[0]?.phone.gridCols ?? 4;
  const rows = state.activeCustomers[0]?.phone.gridRows ?? 5;

  const S = REGIONS.service;
  const gap = 22;
  const areaTop = S.y;
  const areaH = S.h;
  const usableW = S.w;
  const stationW = Math.min(248, (usableW - gap * (slots - 1)) / slots);
  const totalW = stationW * slots + gap * (slots - 1);
  const startX = S.x + (usableW - totalW) / 2;

  const stations: StationLayout[] = [];
  for (let i = 0; i < slots; i++) {
    const sx = startX + i * (stationW + gap);
    const station: Rect = { x: sx, y: areaTop, w: stationW, h: areaH };

    const customerH = Math.min(128, areaH * 0.3);
    const customerRect: Rect = { x: sx, y: areaTop, w: stationW, h: customerH };

    const phoneAreaTop = areaTop + customerH + 6;
    const phoneAreaH = areaH - customerH - 6;
    let phoneH = phoneAreaH;
    let phoneW = phoneH * 0.5;
    if (phoneW > stationW * 0.92) { phoneW = stationW * 0.92; phoneH = phoneW / 0.5; }
    const phoneX = sx + (stationW - phoneW) / 2;
    const phoneY = phoneAreaTop + (phoneAreaH - phoneH) / 2;
    const phoneRect: Rect = { x: phoneX, y: phoneY, w: phoneW, h: phoneH };

    const padSide = phoneW * 0.07;
    const padTop = phoneH * 0.07;
    const padBottom = phoneH * 0.085;
    const screenRect: Rect = {
      x: phoneX + padSide,
      y: phoneY + padTop,
      w: phoneW - padSide * 2,
      h: phoneH - padTop - padBottom,
    };

    stations.push({
      index: i, station, customerRect, phoneRect, screenRect,
      gridCols: cols, gridRows: rows, cells: gridCells(screenRect, cols, rows),
    });
  }

  const Q = REGIONS.queue;
  const qCap = Math.max(1, state.queueCapacity);
  const qPad = 18;
  const qGap = 14;
  const avatar = Math.min(56, (Q.w - qPad * 2 - qGap * (qCap - 1)) / qCap);
  const qSlots: Rect[] = [];
  const qTotal = avatar * qCap + qGap * (qCap - 1);
  const qStart = (Q.w - qTotal) / 2;
  for (let i = 0; i < qCap; i++) {
    qSlots.push({
      x: qStart + i * (avatar + qGap),
      y: Q.y + (Q.h - avatar) / 2,
      w: avatar,
      h: avatar,
    });
  }

  return { stations, queue: { area: { ...Q }, slots: qSlots } };
}

export function pointInRect(x: number, y: number, r: Rect): boolean {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

export function hitTestCell(
  layout: SceneLayout,
  x: number,
  y: number
): { stationIndex: number; col: number; row: number } | null {
  for (const st of layout.stations) {
    if (!pointInRect(x, y, st.screenRect)) continue;
    const cw = st.screenRect.w / st.gridCols;
    const ch = st.screenRect.h / st.gridRows;
    const col = Math.min(st.gridCols - 1, Math.max(0, Math.floor((x - st.screenRect.x) / cw)));
    const row = Math.min(st.gridRows - 1, Math.max(0, Math.floor((y - st.screenRect.y) / ch)));
    return { stationIndex: st.index, col, row };
  }
  return null;
}
