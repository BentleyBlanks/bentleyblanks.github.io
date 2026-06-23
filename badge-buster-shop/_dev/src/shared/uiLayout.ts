import { clamp } from '../content/balance';
import type { GameState, ModalKind } from '../types/state.types';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type UiButtonId = 'shop' | 'skills' | 'settings';

export interface UiButton {
  id: UiButtonId;
  rect: Rect;
  icon: string;
  label: string;
}

export interface UiRow {
  id: string;
  rect: Rect;
}

export type ModalLayout =
  | { open: false }
  | {
      open: true;
      kind: Exclude<ModalKind, 'none'>;
      title: string;
      backdrop: Rect;
      panel: Rect;
      titleBar: Rect;
      close: Rect;
      body: Rect;
      rowH: number;
      rows: UiRow[];
    };

export interface UiLayout {
  hud: Rect;
  controlBar: Rect;
  buttons: UiButton[];
  modal: ModalLayout;
}

const BUTTONS: { id: UiButtonId; icon: string; label: string }[] = [
  { id: 'shop', icon: '升', label: '升级' },
  { id: 'skills', icon: '技', label: '技能' },
  { id: 'settings', icon: '设', label: '设置' },
];

const MODAL_TITLES: Record<Exclude<ModalKind, 'none'>, string> = {
  shop: '升级商店',
  skills: '技能',
  settings: '设置',
};

export function computeUiLayout(
  state: GameState,
  w: number,
  h: number,
  upgradeIds: string[],
  skillIds: string[],
): UiLayout {
  const topH = w >= 700 ? 62 : 56;
  const ctrlH = 96;
  const hud: Rect = { x: 0, y: 0, w, h: topH };
  const controlBar: Rect = { x: 0, y: h - ctrlH, w, h: ctrlH };

  // 底部大按钮（拇指可达）
  const bw = clamp((w - 48) / 3, 96, 240);
  const bh = 68;
  const gap = clamp((w - bw * 3) / 4, 8, 30);
  const totalW = bw * 3 + gap * 2;
  const startX = (w - totalW) / 2;
  const by = h - ctrlH + (ctrlH - bh) / 2;
  const buttons: UiButton[] = BUTTONS.map((def, index) => ({
    ...def,
    rect: { x: startX + index * (bw + gap), y: by, w: bw, h: bh },
  }));

  let modal: ModalLayout = { open: false };
  if (state.ui.modal !== 'none') {
    const kind = state.ui.modal;
    const items = kind === 'shop' ? upgradeIds : kind === 'skills' ? skillIds : ['mute', 'reset'];
    // 底部抽屉式弹窗：贴底、占满宽，不盖住顶部 HUD
    const panelX = 8;
    const panelW = w - 16;
    const headerH = 52;
    const padV = 10;
    const rowGap = 8;
    const maxPanelH = h - topH - 14;
    const idealH = headerH + padV * 2 + items.length * 66 + (items.length - 1) * rowGap;
    const panelH = Math.min(idealH, maxPanelH);
    const rowH = clamp((panelH - headerH - padV * 2 - (items.length - 1) * rowGap) / items.length, 42, 76);
    const panelY = h - panelH;
    const body: Rect = { x: panelX + 10, y: panelY + headerH + padV, w: panelW - 20, h: panelH - headerH - padV * 2 };
    modal = {
      open: true,
      kind,
      title: MODAL_TITLES[kind],
      backdrop: { x: 0, y: 0, w, h },
      panel: { x: panelX, y: panelY, w: panelW, h: panelH },
      titleBar: { x: panelX, y: panelY, w: panelW, h: headerH },
      close: { x: panelX + panelW - 52, y: panelY + 9, w: 42, h: 36 },
      body,
      rowH,
      rows: items.map((id, index) => ({ id, rect: { x: body.x, y: body.y + index * (rowH + rowGap), w: body.w, h: rowH } })),
    };
  }

  return { hud, controlBar, buttons, modal };
}

export function rectHit(rect: Rect, x: number, y: number): boolean {
  return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}
