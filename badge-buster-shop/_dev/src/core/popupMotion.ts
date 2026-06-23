import {
  POPUP_BUBBLE_CHANCE,
  POPUP_BUBBLE_SPEED,
  POPUP_DODGE_CHANCE,
  POPUP_DODGE_RADIUS,
  POPUP_DODGE_STEP,
  POPUP_MOTION_UNLOCK_LEVEL,
} from '../content/balance';
import type { PhonePopup, PopupKind, PopupMotion } from '../types/state.types';

/** 决定一个新弹窗是否会乱动：bubble 像泡泡乱滚 / dodge 躲避光标。纯函数，便于测试。 */
export function rollMotion(kind: PopupKind, level: number): { motion: PopupMotion; vx: number; vy: number } {
  // 只有普通广告/视频/假奖励会乱动（scam/offer 需要稳定交互，不动）；并且要到一定等级才出现
  const canMove = (kind === 'ad' || kind === 'timed' || kind === 'bait') && level >= POPUP_MOTION_UNLOCK_LEVEL;
  if (!canMove) return { motion: 'none', vx: 0, vy: 0 };
  const r = Math.random();
  if (r < POPUP_BUBBLE_CHANCE) {
    const ang = Math.random() * Math.PI * 2;
    return { motion: 'bubble', vx: Math.cos(ang) * POPUP_BUBBLE_SPEED, vy: Math.sin(ang) * POPUP_BUBBLE_SPEED };
  }
  if (r < POPUP_BUBBLE_CHANCE + POPUP_DODGE_CHANCE) {
    return { motion: 'dodge', vx: 0, vy: 0 };
  }
  return { motion: 'none', vx: 0, vy: 0 };
}

/** 弹窗可移动的比例边界（保证 ✕ 始终留在屏内、可点中）。 */
function bounds(popup: PhonePopup): { minX: number; maxX: number; minY: number; maxY: number } {
  return {
    minX: 0.03,
    maxX: Math.max(0.03, 1 - popup.fw - 0.03),
    minY: 0.1,
    maxY: Math.max(0.1, 0.9 - popup.fh),
  };
}

/** bubble：按速度漂移，碰到屏幕边缘反弹。直接改写 popup 的 fx/fy/vx/vy。 */
export function stepBubble(popup: PhonePopup, dt: number): void {
  if (popup.motion !== 'bubble') return;
  const { minX, maxX, minY, maxY } = bounds(popup);
  popup.fx += (popup.vx * dt) / 1000;
  popup.fy += (popup.vy * dt) / 1000;
  if (popup.fx <= minX) {
    popup.fx = minX;
    popup.vx = Math.abs(popup.vx);
  } else if (popup.fx >= maxX) {
    popup.fx = maxX;
    popup.vx = -Math.abs(popup.vx);
  }
  if (popup.fy <= minY) {
    popup.fy = minY;
    popup.vy = Math.abs(popup.vy);
  } else if (popup.fy >= maxY) {
    popup.fy = maxY;
    popup.vy = -Math.abs(popup.vy);
  }
}

export interface PopupRectLike {
  x: number;
  y: number;
  w: number;
  h: number;
  closeX: number;
  closeY: number;
  closeW: number;
  closeH: number;
}

/** dodge：光标（屏幕像素坐标）靠近 ✕ 时，弹窗朝远离方向跳开一步。返回是否发生了闪避。 */
export function dodgeStep(popup: PhonePopup, rect: PopupRectLike, cursorX: number, cursorY: number): boolean {
  if (popup.motion !== 'dodge') return false;
  const bx = rect.closeX + rect.closeW / 2;
  const by = rect.closeY + rect.closeH / 2;
  if (Math.hypot(cursorX - bx, cursorY - by) >= POPUP_DODGE_RADIUS) return false;
  const px = rect.x + rect.w / 2;
  const py = rect.y + rect.h / 2;
  let dx = px - cursorX;
  let dy = py - cursorY;
  const len = Math.hypot(dx, dy) || 1;
  dx /= len;
  dy /= len;
  const { minX, maxX, minY, maxY } = bounds(popup);
  popup.fx = Math.min(maxX, Math.max(minX, popup.fx + dx * POPUP_DODGE_STEP));
  popup.fy = Math.min(maxY, Math.max(minY, popup.fy + dy * POPUP_DODGE_STEP));
  return true;
}
