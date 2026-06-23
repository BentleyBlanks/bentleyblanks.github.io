import { MALWARE_LAG_THRESHOLD, MALWARE_MAX, MALWARE_PROMPT_THRESHOLD, shopRankName, TIMED_CLOSE_MS, upgradeCost, upgradeUnlockLevel } from '../content/balance';
import {
  computeGameLayout,
  defuseButtonRect,
  malwareButtonRect,
  notifBarRect,
  phoneBlockedByPopup,
  phoneLaggy,
  popupAcceptRect,
  popupRectOf,
  type GameLayout,
  type IconLayout,
  type PhoneLayout,
  type QueueLayout,
} from '../shared/layout';
import { computeUiLayout, type Rect, type UiLayout } from '../shared/uiLayout';
import type { AppIconDef } from '../types/content.types';
import type { GameContext, GameModule } from '../types/module.types';
import type { Mood } from '../types/state.types';

function formatMoney(value: number): string {
  if (value >= 100_000_000) return `${(value / 100_000_000).toFixed(1)}亿`;
  if (value >= 10_000) return `${(value / 10_000).toFixed(1)}万`;
  return String(Math.floor(value));
}

const TAU = Math.PI * 2;

interface VisualEffect {
  kind: 'pop' | 'return' | 'level' | 'leave' | 'skill' | 'combo' | 'smash' | 'task';
  x: number;
  y: number;
  age: number;
  ttl: number;
  label: string;
  color: string;
  power: number;
}

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  age: number;
  ttl: number;
  color: string;
}

interface SwipeDot {
  x: number;
  y: number;
  age: number;
  ttl: number;
  color: string;
}

type PhoneModel = 'island' | 'notch' | 'androidGlass' | 'classic' | 'senior';
type PhoneSystem = 'ios' | 'android';

interface PhoneSkin {
  model: PhoneModel;
  system: PhoneSystem;
  seed: number;
  bodyTop: string;
  bodyBottom: string;
  bezel: string;
  accent: string;
  wallpaperA: string;
  wallpaperB: string;
  wallpaperC: string;
}

const WALLPAPERS = [
  ['#102A43', '#5B8DEF', '#FFD166'],
  ['#312E81', '#8E7CF6', '#F472B6'],
  ['#064E3B', '#26C6A6', '#C7F9CC'],
  ['#7C2D12', '#FF9F43', '#FDE68A'],
  ['#164E63', '#73D2DE', '#F0FDFA'],
  ['#3B0764', '#EF476F', '#FDBA74'],
  ['#111827', '#4D96FF', '#A7F3D0'],
  ['#701A75', '#FF6B81', '#FBCFE8'],
  ['#1E293B', '#06D6A0', '#93C5FD'],
  ['#422006', '#D6B37A', '#F8FBFF'],
] as const;

const BODY_PALETTES = [
  ['#111827', '#020617', '#303443'],
  ['#D8DFEA', '#AAB6C7', '#F8FAFC'],
  ['#2B2B33', '#101018', '#4A4A57'],
  ['#6B7280', '#374151', '#E5E7EB'],
  ['#DDD6C8', '#8D7A61', '#F7F1E6'],
  ['#1F2937', '#0F172A', '#64748B'],
] as const;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function rgbParts(color: string): [number, number, number] {
  const raw = color.trim().replace('#', '');
  const normalized = raw.length === 3 ? raw.split('').map((part) => part + part).join('') : raw.padEnd(6, '0').slice(0, 6);
  const value = Number.parseInt(normalized, 16);
  if (!Number.isFinite(value)) {
    return [91, 141, 239];
  }
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function mixColor(color: string, target: string, amount: number): string {
  const mix = clamp01(amount);
  const [r, g, b] = rgbParts(color);
  const [tr, tg, tb] = rgbParts(target);
  return `rgb(${Math.round(r + (tr - r) * mix)}, ${Math.round(g + (tg - g) * mix)}, ${Math.round(b + (tb - b) * mix)})`;
}

function alphaColor(color: string, alpha: number): string {
  const [r, g, b] = rgbParts(color);
  return `rgba(${r}, ${g}, ${b}, ${clamp01(alpha).toFixed(3)})`;
}

function drawImageCover(ctx: CanvasRenderingContext2D, image: HTMLImageElement, x: number, y: number, w: number, h: number): void {
  const scale = Math.max(w / image.naturalWidth, h / image.naturalHeight);
  const drawW = image.naturalWidth * scale;
  const drawH = image.naturalHeight * scale;
  ctx.drawImage(image, x + (w - drawW) / 2, y + (h - drawH) / 2, drawW, drawH);
}

function drawImageContain(ctx: CanvasRenderingContext2D, image: HTMLImageElement, x: number, y: number, w: number, h: number): void {
  const scale = Math.min(w / image.naturalWidth, h / image.naturalHeight);
  const drawW = image.naturalWidth * scale;
  const drawH = image.naturalHeight * scale;
  ctx.drawImage(image, x + (w - drawW) / 2, y + (h - drawH) / 2, drawW, drawH);
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function fillRound(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, fill: string | CanvasGradient): void {
  roundedRect(ctx, x, y, w, h, r);
  ctx.fillStyle = fill;
  ctx.fill();
}

function strokeRound(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  stroke: string,
  width = 1,
): void {
  roundedRect(ctx, x, y, w, h, r);
  ctx.strokeStyle = stroke;
  ctx.lineWidth = width;
  ctx.stroke();
}

function moodColor(mood: Mood): string {
  if (mood === 'happy') return '#26C6A6';
  if (mood === 'annoyed') return '#FF9F43';
  if (mood === 'angry') return '#FF3B30';
  return '#5B8DEF';
}

function customerName(ctx: GameContext, defId: string): string {
  return ctx.content.customers.find((item) => item.id === defId)?.name ?? '顾客';
}

function hashText(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function pickBySeed<T>(items: readonly T[], seed: number): T {
  return items[seed % items.length];
}

function skinForPhone(phone: PhoneLayout): PhoneSkin {
  const seed = hashText(`${phone.customer.id}:${phone.customer.phone.id}:${phone.customer.defId}`);
  const model = pickBySeed<PhoneModel>(['island', 'notch', 'androidGlass', 'classic', 'senior'], seed);
  const system: PhoneSystem = phone.customer.phone.system;
  const wallpaper = pickBySeed(WALLPAPERS, Math.floor(seed / 7));
  const body = pickBySeed(BODY_PALETTES, Math.floor(seed / 19));
  return {
    model,
    system,
    seed,
    bodyTop: model === 'senior' ? '#EEF2F7' : body[0],
    bodyBottom: model === 'senior' ? '#9CA8B8' : body[1],
    bezel: model === 'senior' ? '#4B5563' : body[2],
    accent: wallpaper[1],
    wallpaperA: wallpaper[0],
    wallpaperB: wallpaper[1],
    wallpaperC: wallpaper[2],
  };
}

export function createRenderModule(): GameModule {
  let ctx: GameContext;
  const effects: VisualEffect[] = [];
  const sparks: Spark[] = [];
  const swipeDots: SwipeDot[] = [];
  const images = new Map<string, HTMLImageElement>();
  // —— 手机进出场动画（#2）——
  const phoneAnims = new Map<string, { x: number; y: number; alpha: number }>();
  const departing: Array<{ layout: PhoneLayout; age: number }> = [];
  const departingIds = new Set<string>();
  let lastLayouts = new Map<string, PhoneLayout>();
  let lastDrawTime = performance.now();
  let combo = 0;
  let lastClearAt = -Infinity;
  let comboHoldMs = 0;
  let shakeMs = 0;
  let shakeAmp = 0;
  let skillFlash = 0;
  let pulseTime = 0;

  function iconDef(icon: IconLayout): AppIconDef {
    return ctx.content.icons.find((item) => item.id === icon.icon.appId) ?? ctx.content.icons[0];
  }

  function addShake(durationMs: number, amplitude: number): void {
    shakeMs = Math.max(shakeMs, durationMs);
    shakeAmp = Math.max(shakeAmp, amplitude);
  }

  function spawnBurst(x: number, y: number, color: string, count: number, power = 1): void {
    for (let index = 0; index < count; index += 1) {
      const angle = Math.random() * TAU;
      const speed = (1.2 + Math.random() * 4.2) * power;
      sparks.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - Math.random() * 1.8 * power,
        size: (2 + Math.random() * 4) * power,
        age: 0,
        ttl: 360 + Math.random() * 360,
        color,
      });
    }
    if (sparks.length > 260) {
      sparks.splice(0, sparks.length - 260);
    }
  }

  function spawnSwipeTrace(path: { x: number; y: number }[]): void {
    const start = Math.max(0, path.length - 7);
    for (let index = start; index < path.length; index += 1) {
      const point = path[index];
      swipeDots.push({ x: point.x, y: point.y, age: 0, ttl: 260, color: index % 2 === 0 ? '#5B8DEF' : '#26C6A6' });
      if (index % 2 === 0) {
        sparks.push({
          x: point.x,
          y: point.y,
          vx: (Math.random() - 0.5) * 2.8,
          vy: (Math.random() - 0.7) * 2.8,
          size: 2 + Math.random() * 2,
          age: 0,
          ttl: 260 + Math.random() * 180,
          color: '#FFD166',
        });
      }
    }
    if (swipeDots.length > 120) {
      swipeDots.splice(0, swipeDots.length - 120);
    }
  }

  function drawBackground(layout: GameLayout): void {
    const c = ctx.ctx2d;
    const w = ctx.canvas.clientWidth;
    const h = ctx.canvas.clientHeight;
    const shopImage = images.get('shopCounter');
    if (shopImage?.complete && shopImage.naturalWidth > 0) {
      drawImageCover(c, shopImage, 0, 0, w, h);
      c.fillStyle = 'rgba(6, 13, 22, 0.42)';
      c.fillRect(0, 0, w, h);
    } else {
      const bg = c.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, '#1b2740');
      bg.addColorStop(1, '#0c1422');
      c.fillStyle = bg;
      c.fillRect(0, 0, w, h);
    }

    if (skillFlash > 0) {
      const flash = clamp01(skillFlash / 720);
      const cx = w / 2;
      const cy = layout.playArea.y + layout.playArea.h / 2;
      const pulse = c.createRadialGradient(cx, cy, 20, cx, cy, Math.max(w, h));
      pulse.addColorStop(0, `rgba(255, 209, 102, ${0.24 * flash})`);
      pulse.addColorStop(0.55, `rgba(91, 141, 239, ${0.14 * flash})`);
      pulse.addColorStop(1, 'rgba(91, 141, 239, 0)');
      c.fillStyle = pulse;
      c.fillRect(0, 0, w, h);
    }

    // 顶部横向候客条背板
    const q = layout.queuePanel;
    c.fillStyle = 'rgba(10, 19, 32, 0.5)';
    c.fillRect(q.x, q.y, q.w, q.h);
    if (ctx.state.queue.length === 0) {
      c.fillStyle = 'rgba(255,255,255,0.4)';
      c.font = '800 12px "PingFang SC", "Microsoft YaHei", system-ui, sans-serif';
      c.textAlign = 'left';
      c.textBaseline = 'middle';
      c.fillText('候客区（暂无排队）', q.x + 14, q.y + q.h / 2);
    }
  }

  function drawCustomerBust(x: number, y: number, radius: number, mood: Mood, name: string, defId: string): void {
    const c = ctx.ctx2d;
    const portrait = images.get(`${defId}_neutral`);
    c.save();
    c.shadowColor = 'rgba(43, 43, 51, 0.18)';
    c.shadowBlur = 8;
    c.shadowOffsetY = 3;
    c.fillStyle = moodColor(mood);
    c.beginPath();
    c.arc(x, y, radius, 0, TAU);
    c.fill();
    c.shadowColor = 'transparent';
    if (portrait?.complete && portrait.naturalWidth > 0) {
      c.beginPath();
      c.arc(x, y, radius * 0.96, 0, TAU);
      c.clip();
      drawImageCover(c, portrait, x - radius * 1.08, y - radius * 1.08, radius * 2.16, radius * 2.16);
      c.restore();
      c.save();
      c.strokeStyle = moodColor(mood);
      c.lineWidth = 2;
      c.beginPath();
      c.arc(x, y, radius, 0, TAU);
      c.stroke();
      c.restore();
      return;
    }
    c.fillStyle = '#FFE2C8';
    c.beginPath();
    c.arc(x, y - radius * 0.12, radius * 0.54, 0, TAU);
    c.fill();
    c.strokeStyle = '#2B2B33';
    c.lineWidth = 2;
    c.beginPath();
    c.arc(x - radius * 0.2, y - radius * 0.18, 1.5, 0, TAU);
    c.arc(x + radius * 0.2, y - radius * 0.18, 1.5, 0, TAU);
    c.stroke();
    c.beginPath();
    if (mood === 'happy') {
      c.arc(x, y, radius * 0.22, 0.15 * Math.PI, 0.85 * Math.PI);
    } else if (mood === 'angry') {
      c.moveTo(x - radius * 0.22, y + radius * 0.1);
      c.lineTo(x + radius * 0.22, y + radius * 0.04);
    } else {
      c.moveTo(x - radius * 0.18, y + radius * 0.08);
      c.lineTo(x + radius * 0.18, y + radius * 0.08);
    }
    c.stroke();
    c.fillStyle = '#2B2B33';
    c.font = '900 10px "PingFang SC", "Microsoft YaHei", system-ui, sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(name.slice(0, 1), x, y + radius * 0.92);
    c.restore();
  }

  function drawQueueItem(item: QueueLayout): void {
    const c = ctx.ctx2d;
    const ratio = clamp01(item.customer.patience / Math.max(1, item.customer.maxPatience));
    const cx = item.x + item.w / 2;
    drawCustomerBust(cx, item.y + item.h * 0.42, item.w * 0.4, item.customer.mood, customerName(ctx, item.customer.defId), item.customer.defId);
    const barW = item.w * 0.84;
    const barX = item.x + (item.w - barW) / 2;
    const barY = item.y + item.h - 5;
    fillRound(c, barX, barY, barW, 4, 2, 'rgba(255,255,255,0.28)');
    fillRound(c, barX, barY, barW * ratio, 4, 2, moodColor(item.customer.mood));
  }

  function drawPhoneStation(phone: PhoneLayout, skin: PhoneSkin): void {
    const c = ctx.ctx2d;
    const matX = phone.x - phone.w * 0.16;
    const matY = phone.y + phone.h * 0.78;
    const matW = phone.w * 1.32;
    const matH = phone.h * 0.23;
    const mat = c.createLinearGradient(matX, matY, matX + matW, matY + matH);
    mat.addColorStop(0, alphaColor(skin.accent, 0.18));
    mat.addColorStop(0.5, 'rgba(255,255,255,0.42)');
    mat.addColorStop(1, 'rgba(35,44,58,0.18)');

    c.save();
    c.shadowColor = 'rgba(43, 43, 51, 0.16)';
    c.shadowBlur = 18;
    c.shadowOffsetY = 8;
    fillRound(c, matX, matY, matW, matH, 14, mat);
    c.shadowColor = 'transparent';
    strokeRound(c, matX + 1, matY + 1, matW - 2, matH - 2, 13, alphaColor(skin.accent, 0.28));

    c.globalAlpha = 0.34;
    c.strokeStyle = '#FFFFFF';
    c.lineWidth = 1;
    for (let offset = 12; offset < matW; offset += 18) {
      c.beginPath();
      c.moveTo(matX + offset, matY + 8);
      c.lineTo(matX + offset - 26, matY + matH - 7);
      c.stroke();
    }
    c.globalAlpha = 1;

    c.strokeStyle = alphaColor(skin.bezel, 0.38);
    c.lineWidth = Math.max(2, phone.w * 0.012);
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(phone.x + phone.w * 0.5, phone.y + phone.h * 0.965);
    c.bezierCurveTo(phone.x + phone.w * 0.66, phone.y + phone.h * 1.02, matX + matW * 0.88, matY + matH * 0.64, matX + matW * 1.05, matY + matH * 0.76);
    c.stroke();

    fillRound(c, matX + matW * 0.76, matY + matH * 0.46, matW * 0.14, matH * 0.28, 5, 'rgba(255,255,255,0.72)');
    strokeRound(c, matX + matW * 0.76, matY + matH * 0.46, matW * 0.14, matH * 0.28, 5, 'rgba(119,141,169,0.32)');

    const noteW = Math.min(52, phone.w * 0.28);
    const noteH = Math.min(34, phone.h * 0.09);
    fillRound(c, matX + matW * 0.08, matY + matH * 0.48, noteW, noteH, 5, 'rgba(255, 238, 153, 0.78)');
    c.fillStyle = 'rgba(91, 77, 36, 0.5)';
    c.font = `800 ${Math.max(7, phone.w * 0.032)}px "PingFang SC", "Microsoft YaHei", system-ui, sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('待清', matX + matW * 0.08 + noteW / 2, matY + matH * 0.48 + noteH / 2, noteW - 6);
    c.restore();
  }

  function drawWallpaper(phone: PhoneLayout, skin: PhoneSkin): void {
    const c = ctx.ctx2d;
    const screenRadius = phone.w * (skin.model === 'senior' ? 0.035 : 0.065);
    roundedRect(c, phone.screenX, phone.screenY, phone.screenW, phone.screenH, screenRadius);
    c.save();
    c.clip();

    const wallpaperImage = images.get(`wallpaper_${(skin.seed % 8) + 1}`);
    if (wallpaperImage?.complete && wallpaperImage.naturalWidth > 0) {
      drawImageCover(c, wallpaperImage, phone.screenX, phone.screenY, phone.screenW, phone.screenH);
      c.globalAlpha = 0.16;
      c.fillStyle = mixColor(skin.wallpaperA, '#020617', 0.34);
      c.fillRect(phone.screenX, phone.screenY, phone.screenW, phone.screenH);
    } else {
      const wallpaper = c.createLinearGradient(phone.screenX, phone.screenY, phone.screenX + phone.screenW, phone.screenY + phone.screenH);
      wallpaper.addColorStop(0, skin.wallpaperA);
      wallpaper.addColorStop(0.48, skin.wallpaperB);
      wallpaper.addColorStop(1, mixColor(skin.wallpaperA, '#020617', 0.35));
      c.fillStyle = wallpaper;
      c.fillRect(phone.screenX, phone.screenY, phone.screenW, phone.screenH);

      c.globalAlpha = 0.34;
      c.fillStyle = skin.wallpaperC;
      c.beginPath();
      c.ellipse(phone.screenX + phone.screenW * 0.82, phone.screenY + phone.screenH * 0.22, phone.screenW * 0.35, phone.screenH * 0.16, -0.25, 0, TAU);
      c.fill();
      c.globalAlpha = 0.22;
      c.fillStyle = '#FFFFFF';
      c.beginPath();
      c.ellipse(phone.screenX + phone.screenW * 0.22, phone.screenY + phone.screenH * 0.76, phone.screenW * 0.32, phone.screenH * 0.2, 0.45, 0, TAU);
      c.fill();
      c.globalAlpha = 0.14;
      c.strokeStyle = '#FFFFFF';
      c.lineWidth = 1;
      for (let offset = -phone.screenH; offset < phone.screenW; offset += 18) {
        c.beginPath();
        c.moveTo(phone.screenX + offset, phone.screenY + phone.screenH);
        c.lineTo(phone.screenX + offset + phone.screenH, phone.screenY);
        c.stroke();
      }
    }

    const overlayImage = images.get('phoneOverlays');
    if (overlayImage?.complete && overlayImage.naturalWidth > 0) {
      const cropSize = Math.min(overlayImage.naturalWidth, overlayImage.naturalHeight);
      const cropX = (skin.seed % 3) * Math.floor((overlayImage.naturalWidth - cropSize) / 3);
      c.globalAlpha = 0.1;
      c.drawImage(overlayImage, cropX, 0, cropSize, cropSize, phone.screenX, phone.screenY, phone.screenW, phone.screenH);
    }

    if (skin.system === 'ios') {
      c.globalAlpha = 0.24;
      fillRound(c, phone.screenX + phone.screenW * 0.08, phone.screenY + phone.screenH * 0.82, phone.screenW * 0.84, phone.screenH * 0.12, phone.w * 0.045, '#FFFFFF');
    } else {
      c.globalAlpha = 0.22;
      fillRound(c, phone.screenX + phone.screenW * 0.12, phone.screenY + phone.screenH * 0.1, phone.screenW * 0.76, Math.max(14, phone.screenH * 0.055), 99, '#FFFFFF');
      c.globalAlpha = 0.28;
      c.fillStyle = '#FFFFFF';
      c.beginPath();
      c.arc(phone.screenX + phone.screenW * 0.18, phone.screenY + phone.screenH * 0.127, Math.max(2, phone.w * 0.009), 0, TAU);
      c.fill();
    }
    c.restore();

    strokeRound(c, phone.screenX, phone.screenY, phone.screenW, phone.screenH, screenRadius, 'rgba(255,255,255,0.46)', 1.3);
  }

  function drawPopups(phone: PhoneLayout): void {
    const c = ctx.ctx2d;
    const now = performance.now();
    for (const popup of phone.customer.phone.popups) {
      const rect = popupRectOf(phone, popup);
      if (popup.motion === 'bubble') {
        // 泡泡弹窗：圆润半透明的"肥皂泡"，自己滚来滚去（位置由 fx/fy 驱动）→ 又滑又难点中
        const bcx = rect.x + rect.w / 2;
        const bcy = rect.y + rect.h / 2;
        const br = Math.min(rect.w, rect.h) / 2; // 全圆角 = 胶囊/泡泡轮廓
        c.save();
        c.shadowColor = 'rgba(0,0,0,0.28)';
        c.shadowBlur = 14;
        c.shadowOffsetY = 6;
        const grad = c.createRadialGradient(rect.x + rect.w * 0.32, rect.y + rect.h * 0.28, br * 0.2, bcx, bcy, rect.w * 0.62);
        grad.addColorStop(0, 'rgba(255,255,255,0.92)');
        grad.addColorStop(0.55, alphaColor(popup.accent, 0.5));
        grad.addColorStop(1, alphaColor(popup.accent, 0.8));
        fillRound(c, rect.x, rect.y, rect.w, rect.h, br, grad);
        c.shadowColor = 'transparent';
        strokeRound(c, rect.x, rect.y, rect.w, rect.h, br, 'rgba(255,255,255,0.85)', 2);
        strokeRound(c, rect.x + 1.5, rect.y + 1.5, rect.w - 3, rect.h - 3, br, alphaColor(popup.accent, 0.5), 1);
        // 左上高光小白椭圆 → 肥皂泡反光感
        c.fillStyle = 'rgba(255,255,255,0.9)';
        c.beginPath();
        c.ellipse(rect.x + rect.w * 0.26, rect.y + rect.h * 0.3, rect.w * 0.09, rect.h * 0.17, -0.5, 0, TAU);
        c.fill();
        // 泡泡里塞一句广告词（单行）
        c.fillStyle = '#2B2B33';
        c.font = `900 ${Math.max(9, rect.h * 0.3)}px "PingFang SC", "Microsoft YaHei", system-ui, sans-serif`;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText(popup.title, bcx, bcy, rect.w * 0.7);
        // ✕（坐标与 popupRectOf 命中区一致：要点中它得追着泡泡点）
        c.strokeStyle = 'rgba(43,43,51,0.82)';
        c.lineWidth = Math.max(1.4, rect.closeW * 0.14);
        c.lineCap = 'round';
        const bpad = rect.closeW * 0.3;
        c.beginPath();
        c.moveTo(rect.closeX + bpad, rect.closeY + bpad);
        c.lineTo(rect.closeX + rect.closeW - bpad, rect.closeY + rect.closeH - bpad);
        c.moveTo(rect.closeX + rect.closeW - bpad, rect.closeY + bpad);
        c.lineTo(rect.closeX + bpad, rect.closeY + rect.closeH - bpad);
        c.stroke();
        c.restore();
        continue;
      }
      const scam = popup.kind === 'scam';
      const art = scam ? images.get('scam_warning') : images.get(hashText(popup.id) % 2 === 0 ? 'ad_redpacket' : 'ad_offer');
      c.save();
      c.shadowColor = 'rgba(0,0,0,0.4)';
      c.shadowBlur = 12;
      c.shadowOffsetY = 5;
      fillRound(c, rect.x, rect.y, rect.w, rect.h, 10, scam ? 'rgba(40, 12, 12, 0.96)' : 'rgba(252, 252, 255, 0.98)');
      c.shadowColor = 'transparent';
      strokeRound(c, rect.x, rect.y, rect.w, rect.h, 10, popup.accent, scam ? 2.4 : 1.6);
      fillRound(c, rect.x, rect.y, rect.w, Math.max(4, rect.h * 0.16), 8, alphaColor(popup.accent, scam ? 0.95 : 0.85));

      if (art?.complete && art.naturalWidth > 0) {
        c.globalAlpha = scam ? 0.52 : 0.58;
        drawImageContain(c, art, rect.x + rect.w * 0.05, rect.y + rect.h * 0.19, rect.w * 0.9, rect.h * 0.46);
        c.globalAlpha = 1;
      }

      c.fillStyle = scam ? '#FFE3DE' : '#2B2B33';
      c.font = `900 ${Math.max(9, rect.h * 0.25)}px "PingFang SC", "Microsoft YaHei", system-ui, sans-serif`;
      c.textAlign = 'left';
      c.textBaseline = 'middle';
      c.fillText(popup.title, rect.x + rect.w * 0.07, rect.y + rect.h * (art?.complete ? 0.47 : 0.36), rect.w * 0.74);

      const bodyX = scam ? rect.x + rect.w * 0.26 : rect.x + rect.w * 0.07;
      c.fillStyle = scam ? 'rgba(255, 220, 214, 0.88)' : 'rgba(43,43,51,0.66)';
      c.font = `800 ${Math.max(8, rect.h * 0.19)}px "PingFang SC", "Microsoft YaHei", system-ui, sans-serif`;
      c.fillText(popup.body, bodyX, rect.y + rect.h * (popup.kind === 'offer' ? 0.56 : art?.complete ? 0.76 : 0.72), rect.x + rect.w - bodyX - rect.w * 0.05);

      // 关闭 ✕
      fillRound(c, rect.closeX, rect.closeY, rect.closeW, rect.closeH, Math.min(rect.closeW, rect.closeH) * 0.3, scam ? 'rgba(255,255,255,0.18)' : 'rgba(43,43,51,0.1)');
      c.strokeStyle = scam ? '#FFD7D0' : '#6E6A73';
      c.lineWidth = Math.max(1.6, rect.closeW * 0.12);
      c.lineCap = 'round';
      const pad = rect.closeW * 0.3;
      c.beginPath();
      c.moveTo(rect.closeX + pad, rect.closeY + pad);
      c.lineTo(rect.closeX + rect.closeW - pad, rect.closeY + rect.closeH - pad);
      c.moveTo(rect.closeX + rect.closeW - pad, rect.closeY + pad);
      c.lineTo(rect.closeX + pad, rect.closeY + rect.closeH - pad);
      c.stroke();

      if (scam && Number.isFinite(popup.installAt)) {
        const remain = Math.max(0, popup.installAt - now);
        const total = Math.max(1, popup.installAt - popup.bornAt);
        const ratio = remain / total;
        const ringX = rect.x + rect.w * 0.12;
        const ringY = rect.y + rect.h * 0.72;
        const ringR = Math.max(7, rect.h * 0.2);
        c.lineWidth = Math.max(2, ringR * 0.32);
        c.strokeStyle = 'rgba(255,255,255,0.18)';
        c.beginPath();
        c.arc(ringX, ringY, ringR, 0, TAU);
        c.stroke();
        c.strokeStyle = ratio < 0.34 ? '#FF3B30' : '#FFC03A';
        c.beginPath();
        c.arc(ringX, ringY, ringR, -Math.PI / 2, -Math.PI / 2 + TAU * ratio);
        c.stroke();
        c.fillStyle = '#FFE3DE';
        c.font = `900 ${Math.max(8, ringR * 0.9)}px Inter, system-ui, sans-serif`;
        c.textAlign = 'center';
        c.fillText(String(Math.ceil(remain / 1000)), ringX, ringY + 0.5);
      }

      if (popup.kind === 'offer' || popup.kind === 'bait') {
        const acc = popupAcceptRect(rect);
        const isBait = popup.kind === 'bait';
        fillRound(c, acc.x, acc.y, acc.w, acc.h, acc.h * 0.4, isBait ? '#E8B500' : '#26C6A6');
        strokeRound(c, acc.x, acc.y, acc.w, acc.h, acc.h * 0.4, 'rgba(255,255,255,0.5)', 1.5);
        c.fillStyle = isBait ? '#3B2E00' : '#FFFFFF';
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.font = `900 ${Math.max(9, acc.h * 0.4)}px "PingFang SC", "Microsoft YaHei", system-ui, sans-serif`;
        c.fillText(isBait ? '🎁 立即领取' : '🧹 帮他清理', acc.x + acc.w / 2, acc.y + acc.h / 2);
      }
      if (popup.kind === 'timed') {
        const remain = popup.bornAt + TIMED_CLOSE_MS - now;
        if (remain > 0) {
          // 盖住 ✕，显示倒计时（X 秒后才能关）
          fillRound(c, rect.closeX, rect.closeY, rect.closeW, rect.closeH, Math.min(rect.closeW, rect.closeH) * 0.3, 'rgba(20,20,28,0.78)');
          c.fillStyle = '#FFFFFF';
          c.textAlign = 'center';
          c.textBaseline = 'middle';
          c.font = `900 ${Math.max(8, rect.closeH * 0.62)}px Inter, system-ui, sans-serif`;
          c.fillText(String(Math.ceil(remain / 1000)), rect.closeX + rect.closeW / 2, rect.closeY + rect.closeH / 2 + 0.5);
        }
      }
      c.restore();
    }
  }

  function drawDeviceChrome(phone: PhoneLayout, skin: PhoneSkin): void {
    const c = ctx.ctx2d;
    c.save();
    if (skin.model === 'island') {
      fillRound(c, phone.x + phone.w * 0.35, phone.y + phone.h * 0.045, phone.w * 0.3, 9, 5, '#0A0A0D');
      fillRound(c, phone.screenX + phone.screenW * 0.36, phone.screenY + 8, phone.screenW * 0.28, 10, 6, 'rgba(8,8,12,0.86)');
    } else if (skin.model === 'notch') {
      fillRound(c, phone.screenX + phone.screenW * 0.31, phone.screenY, phone.screenW * 0.38, 18, 0, 'rgba(8,8,12,0.9)');
      fillRound(c, phone.x + phone.w * 0.38, phone.y + phone.h * 0.037, phone.w * 0.24, 5, 3, skin.bezel);
    } else if (skin.model === 'androidGlass') {
      c.fillStyle = 'rgba(8,8,12,0.76)';
      c.beginPath();
      c.arc(phone.screenX + phone.screenW / 2, phone.screenY + 13, 5, 0, TAU);
      c.fill();
    } else if (skin.model === 'classic') {
      fillRound(c, phone.x + phone.w * 0.38, phone.y + phone.h * 0.04, phone.w * 0.24, 5, 3, skin.bezel);
      c.strokeStyle = alphaColor(skin.accent, 0.7);
      c.lineWidth = 2;
      c.beginPath();
      c.arc(phone.x + phone.w / 2, phone.y + phone.h * 0.918, phone.w * 0.043, 0, TAU);
      c.stroke();
    } else {
      fillRound(c, phone.x + phone.w * 0.31, phone.y + phone.h * 0.045, phone.w * 0.38, 6, 3, '#6B7280');
      fillRound(c, phone.x + phone.w * 0.18, phone.y + phone.h * 0.865, phone.w * 0.64, phone.h * 0.08, 6, '#CBD5E1');
      c.strokeStyle = '#64748B';
      c.lineWidth = 1;
      for (let index = 1; index < 3; index += 1) {
        const x = phone.x + phone.w * (0.18 + index * 0.64 / 3);
        c.beginPath();
        c.moveTo(x, phone.y + phone.h * 0.87);
        c.lineTo(x, phone.y + phone.h * 0.94);
        c.stroke();
      }
      c.beginPath();
      c.moveTo(phone.x + phone.w * 0.2, phone.y + phone.h * 0.905);
      c.lineTo(phone.x + phone.w * 0.8, phone.y + phone.h * 0.905);
      c.stroke();
    }

    c.fillStyle = skin.system === 'ios' ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.86)';
    c.font = `800 ${Math.max(8, phone.w * 0.033)}px Inter, system-ui, sans-serif`;
    c.textAlign = 'left';
    c.textBaseline = 'middle';
    c.fillText(skin.system === 'ios' ? '9:41' : '09:41', phone.screenX + 13, phone.screenY + 17);
    c.textAlign = 'right';
    c.fillText(skin.system === 'ios' ? '5G' : 'LTE', phone.screenX + phone.screenW - 14, phone.screenY + 17);

    if (skin.system === 'ios') {
      fillRound(c, phone.x + phone.w * 0.39, phone.y + phone.h * 0.925, phone.w * 0.22, 5, 3, 'rgba(255,255,255,0.72)');
    } else {
      c.strokeStyle = 'rgba(255,255,255,0.7)';
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(phone.screenX + phone.screenW * 0.38, phone.screenY + phone.screenH - 13);
      c.lineTo(phone.screenX + phone.screenW * 0.62, phone.screenY + phone.screenH - 13);
      c.stroke();
    }
    c.restore();
  }

  function drawVariantAura(phone: PhoneLayout): void {
    const v = phone.customer.phone.variant;
    if (v === 'normal') return;
    const c = ctx.ctx2d;
    const color = v === 'golden' ? '#FFC107' : v === 'soul' ? '#8E7CF6' : '#4D96FF';
    const pulse = (Math.sin(pulseTime * 0.006) + 1) / 2;
    c.save();
    c.shadowColor = color;
    c.shadowBlur = 22 + pulse * 18;
    strokeRound(c, phone.x - 3, phone.y - 3, phone.w + 6, phone.h + 6, phone.w * 0.14, alphaColor(color, 0.85), 3);
    c.restore();
  }

  function drawVariantTag(phone: PhoneLayout): void {
    const v = phone.customer.phone.variant;
    if (v === 'normal') return;
    const c = ctx.ctx2d;
    const label = v === 'golden' ? '👑 黄金机·高价易碎' : v === 'soul' ? '👻 灵魂机·掉声誉' : '⚡ 魔方感染·会变形';
    const color = v === 'golden' ? '#B8860B' : v === 'soul' ? '#6A4FB3' : '#2E6FD6';
    c.save();
    c.font = `900 ${Math.max(9, phone.w * 0.044)}px "PingFang SC", "Microsoft YaHei", system-ui, sans-serif`;
    const tw = c.measureText(label).width + 14;
    const tx = phone.x + (phone.w - tw) / 2;
    const ty = phone.y - 32;
    fillRound(c, tx, ty, tw, 18, 9, color);
    c.fillStyle = '#FFFFFF';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(label, tx + tw / 2, ty + 9);
    c.restore();
  }

  function drawCosmic(phone: PhoneLayout): void {
    const runtime = phone.customer.phone;
    if (runtime.variant !== 'cosmic' || !Number.isFinite(runtime.transformMs)) return;
    const c = ctx.ctx2d;
    c.save();
    roundedRect(c, phone.screenX, phone.screenY, phone.screenW, phone.screenH, phone.w * 0.06);
    c.clip();
    c.fillStyle = 'rgba(30, 60, 140, 0.34)';
    c.fillRect(phone.screenX, phone.screenY, phone.screenW, phone.screenH);
    c.strokeStyle = `rgba(140, 190, 255, ${0.4 + 0.3 * ((Math.sin(pulseTime * 0.02) + 1) / 2)})`;
    c.lineWidth = 2;
    for (let i = 0; i < 4; i += 1) {
      c.beginPath();
      const yy = phone.screenY + ((i + 1) / 5) * phone.screenH + Math.sin(pulseTime * 0.03 + i) * 6;
      c.moveTo(phone.screenX, yy);
      for (let xx = phone.screenX; xx < phone.screenX + phone.screenW; xx += 12) {
        c.lineTo(xx, yy + Math.sin(xx * 0.3 + pulseTime * 0.04 + i) * 8);
      }
      c.stroke();
    }
    c.restore();
    const remain = Math.max(0, runtime.transformMs);
    c.save();
    c.fillStyle = '#DCE9FF';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = `900 ${Math.max(10, phone.w * 0.046)}px "PingFang SC", "Microsoft YaHei", system-ui, sans-serif`;
    c.fillText('⚡ 宇宙魔方充能', phone.screenX + phone.screenW / 2, phone.screenY + phone.screenH * 0.24);
    c.font = `1000 ${Math.max(16, phone.w * 0.09)}px Inter, system-ui, sans-serif`;
    c.fillText(`${Math.ceil(remain / 1000)}s`, phone.screenX + phone.screenW / 2, phone.screenY + phone.screenH * 0.33);
    c.restore();
    const btn = defuseButtonRect(phone);
    fillRound(c, btn.x, btn.y, btn.w, btn.h, btn.h * 0.3, '#FF3B30');
    strokeRound(c, btn.x, btn.y, btn.w, btn.h, btn.h * 0.3, 'rgba(255,255,255,0.4)', 1.5);
    c.fillStyle = '#FFFFFF';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = `900 ${Math.max(9, btn.h * 0.4)}px "PingFang SC", "Microsoft YaHei", system-ui, sans-serif`;
    c.fillText('🔌 拔电源拆除', btn.x + btn.w / 2, btn.y + btn.h / 2);
  }

  function drawNotifBar(phone: PhoneLayout): void {
    const runtime = phone.customer.phone;
    if (runtime.notifications <= 0) return;
    const c = ctx.ctx2d;
    const bar = notifBarRect(phone);
    const h = Math.max(15, bar.h * 0.46);
    const x = bar.x + bar.w * 0.06;
    const y = bar.y + bar.h * 0.12;
    const w = bar.w * 0.88;
    c.save();
    fillRound(c, x, y, w, h, h * 0.32, 'rgba(18, 26, 42, 0.9)');
    strokeRound(c, x, y, w, h, h * 0.32, 'rgba(255,159,67,0.55)', 1);
    c.fillStyle = '#FF9F43';
    c.beginPath();
    c.arc(x + h * 0.55, y + h * 0.5, h * 0.2, 0, TAU);
    c.fill();
    c.fillStyle = '#F8FBFF';
    c.font = `900 ${Math.max(8, phone.w * 0.03)}px "PingFang SC", "Microsoft YaHei", system-ui, sans-serif`;
    c.textAlign = 'left';
    c.textBaseline = 'middle';
    c.fillText(`${runtime.notifications} 条广告 · 下拉清`, x + h, y + h * 0.5, w - h - 6);
    c.restore();
  }

  function drawBlockedScreenDim(phone: PhoneLayout): void {
    const c = ctx.ctx2d;
    c.save();
    roundedRect(c, phone.screenX, phone.screenY, phone.screenW, phone.screenH, phone.w * 0.06);
    c.clip();
    c.fillStyle = 'rgba(10, 14, 24, 0.4)';
    c.fillRect(phone.screenX, phone.screenY, phone.screenW, phone.screenH);
    c.restore();
  }

  function drawLagOverlay(phone: PhoneLayout): void {
    const c = ctx.ctx2d;
    c.save();
    roundedRect(c, phone.screenX, phone.screenY, phone.screenW, phone.screenH, phone.w * 0.06);
    c.clip();
    c.fillStyle = 'rgba(120, 20, 30, 0.3)';
    c.fillRect(phone.screenX, phone.screenY, phone.screenW, phone.screenH);
    c.globalAlpha = 0.16;
    c.fillStyle = '#000';
    const jitter = (Math.sin(pulseTime * 0.05) + 1) * 2;
    for (let y = phone.screenY + (jitter % 6); y < phone.screenY + phone.screenH; y += 6) {
      c.fillRect(phone.screenX, y, phone.screenW, 2);
    }
    c.restore();
    c.save();
    c.fillStyle = '#FFE3DE';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = `900 ${Math.max(11, phone.w * 0.052)}px "PingFang SC", "Microsoft YaHei", system-ui, sans-serif`;
    c.fillText('⚠ 卡顿', phone.screenX + phone.screenW / 2, phone.screenY + phone.screenH * 0.42);
    c.font = `800 ${Math.max(8, phone.w * 0.033)}px "PingFang SC", "Microsoft YaHei", system-ui, sans-serif`;
    c.fillText('点下方"清理后台"', phone.screenX + phone.screenW / 2, phone.screenY + phone.screenH * 0.52);
    c.restore();
  }

  function drawMalware(phone: PhoneLayout): void {
    const runtime = phone.customer.phone;
    if (runtime.malware < MALWARE_PROMPT_THRESHOLD) return; // 仅 ≥60% 才提示清理
    const c = ctx.ctx2d;
    const laggy = runtime.malware >= MALWARE_LAG_THRESHOLD;
    const btn = malwareButtonRect(phone);
    const barH = Math.max(4, btn.h * 0.22);
    const barY = btn.y - barH - 4;
    fillRound(c, btn.x, barY, btn.w, barH, barH / 2, 'rgba(0,0,0,0.35)');
    const ratio = Math.min(1, runtime.malware / MALWARE_MAX);
    fillRound(c, btn.x, barY, btn.w * ratio, barH, barH / 2, laggy ? '#FF3B30' : '#FF9F43');
    fillRound(c, btn.x, btn.y, btn.w, btn.h, btn.h * 0.3, laggy ? '#FF3B30' : 'rgba(38, 50, 72, 0.94)');
    strokeRound(c, btn.x, btn.y, btn.w, btn.h, btn.h * 0.3, 'rgba(255,255,255,0.32)', 1);
    c.fillStyle = '#FFFFFF';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = `900 ${Math.max(8, btn.h * 0.4)}px "PingFang SC", "Microsoft YaHei", system-ui, sans-serif`;
    c.fillText(`🧹 清理后台 ${Math.ceil(runtime.malware)}%`, btn.x + btn.w / 2, btn.y + btn.h / 2, btn.w - 8);
  }

  function drawStatusStrip(ui: UiLayout): void {
    const c = ctx.ctx2d;
    const s = ctx.state;
    const now = performance.now();
    const up = (id: string) => s.upgrades[id] ?? 0;
    const chips: Array<{ label: string; color: string }> = [];
    if (up('up_adblock') > 0) chips.push({ label: `🛡防弹窗 Lv${up('up_adblock')}`, color: '#5B8DEF' });
    if (up('up_antivirus') > 0) chips.push({ label: `🦠卫士 Lv${up('up_antivirus')}`, color: '#8E7CF6' });
    if (up('up_notifclear') > 0) chips.push({ label: `🔔通知 Lv${up('up_notifclear')}`, color: '#FF9F43' });
    if (up('up_antimalware') > 0) chips.push({ label: `🧹杀毒 Lv${up('up_antimalware')}`, color: '#26C6A6' });
    if (s.derived.botCount > 0) chips.push({ label: `🤖学徒 x${s.derived.botCount}`, color: '#4D96FF' });
    if (now < s.effects.freezeIncomingUntil) chips.push({ label: `❄冻结 ${Math.ceil((s.effects.freezeIncomingUntil - now) / 1000)}s`, color: '#5BC0EB' });
    if (now < s.effects.tipBoostUntil) chips.push({ label: `💰双倍 ${Math.ceil((s.effects.tipBoostUntil - now) / 1000)}s`, color: '#E0A100' });
    if (now < s.effects.extraHandsUntil) chips.push({ label: `🙌多手 ${Math.ceil((s.effects.extraHandsUntil - now) / 1000)}s`, color: '#FF6B81' });
    if (chips.length === 0) return;
    let x = 14;
    const y = ui.hud.h + 6;
    const hChip = 22;
    c.save();
    c.font = '800 11px "PingFang SC", "Microsoft YaHei", system-ui, sans-serif';
    c.textBaseline = 'middle';
    c.textAlign = 'left';
    for (const chip of chips) {
      const tw = c.measureText(chip.label).width + 16;
      if (x + tw > ctx.canvas.clientWidth - 14) break;
      fillRound(c, x, y, tw, hChip, hChip / 2, 'rgba(255,255,255,0.94)');
      strokeRound(c, x, y, tw, hChip, hChip / 2, alphaColor(chip.color, 0.5), 1);
      c.fillStyle = chip.color;
      c.fillText(chip.label, x + 8, y + hChip / 2 + 0.5);
      x += tw + 6;
    }
    c.restore();
  }

  function drawCursor(): void {
    const cur = ctx.state.ui.cursor;
    if (!cur.visible) return;
    const c = ctx.ctx2d;
    c.save();
    c.translate(cur.x, cur.y);
    const k = cur.pressed ? 0.86 : 1;
    c.scale(k, k);
    if (cur.pressed) {
      c.strokeStyle = 'rgba(91,141,239,0.7)';
      c.lineWidth = 2.5;
      c.beginPath();
      c.arc(0, 2, 17, 0, TAU);
      c.stroke();
    }
    c.fillStyle = 'rgba(0,0,0,0.16)';
    c.beginPath();
    c.ellipse(3, 42, 12, 4, 0, 0, TAU);
    c.fill();
    c.strokeStyle = '#2B2B33';
    c.lineWidth = 2;
    c.fillStyle = '#FFE0B8';
    roundedRect(c, -4, 0, 9, 24, 4); // 食指
    c.fill();
    c.stroke();
    roundedRect(c, -12, 18, 25, 22, 9); // 手掌
    c.fill();
    c.stroke();
    c.restore();
  }

  function updatePhoneAnims(layout: GameLayout, fdt: number): void {
    const currentIds = new Set(layout.phoneLayouts.map((p) => p.customer.id));
    for (const [id, lay] of lastLayouts) {
      if (!currentIds.has(id) && !departingIds.has(id)) {
        departing.push({ layout: lay, age: 0 });
        departingIds.add(id);
        phoneAnims.delete(id);
      }
    }
    const k = 1 - Math.exp(-fdt / 80);
    for (const phone of layout.phoneLayouts) {
      let a = phoneAnims.get(phone.customer.id);
      if (!a) {
        a = { x: phone.x, y: phone.y + 50, alpha: 0 };
        phoneAnims.set(phone.customer.id, a);
      }
      a.x += (phone.x - a.x) * k;
      a.y += (phone.y - a.y) * k;
      a.alpha += (1 - a.alpha) * k;
    }
    for (const id of [...phoneAnims.keys()]) if (!currentIds.has(id)) phoneAnims.delete(id);
    for (const dep of departing) dep.age += fdt;
    for (let i = departing.length - 1; i >= 0; i -= 1) {
      if (departing[i].age >= 420) {
        departingIds.delete(departing[i].layout.customer.id);
        departing.splice(i, 1);
      }
    }
    lastLayouts = new Map(layout.phoneLayouts.map((p) => [p.customer.id, p]));
  }

  function drawAnimatedPhone(phone: PhoneLayout): void {
    const a = phoneAnims.get(phone.customer.id);
    const c = ctx.ctx2d;
    c.save();
    if (a) {
      c.globalAlpha = a.alpha;
      c.translate(a.x - phone.x, a.y - phone.y);
    }
    drawPhone(phone);
    c.restore();
  }

  function drawDepartingPhone(dep: { layout: PhoneLayout; age: number }): void {
    const c = ctx.ctx2d;
    const t = clamp01(dep.age / 420);
    c.save();
    c.globalAlpha = (1 - t) * 0.92;
    c.translate(0, t * 80);
    drawPhone(dep.layout);
    c.restore();
  }

  function drawPhone(phone: PhoneLayout): void {
    const c = ctx.ctx2d;
    const customerDef = ctx.content.customers.find((item) => item.id === phone.customer.defId);
    const skin = skinForPhone(phone);
    const bodyRadius = phone.w * (skin.model === 'senior' ? 0.06 : skin.model === 'classic' ? 0.095 : 0.13);
    const body = c.createLinearGradient(phone.x, phone.y, phone.x + phone.w * 0.5, phone.y + phone.h);
    body.addColorStop(0, mixColor(skin.bodyTop, '#FFFFFF', skin.model === 'senior' ? 0.18 : 0.08));
    body.addColorStop(0.55, skin.bodyTop);
    body.addColorStop(1, skin.bodyBottom);
    drawPhoneStation(phone, skin);
    drawVariantAura(phone);
    c.save();
    c.shadowColor = 'rgba(43, 43, 51, 0.24)';
    c.shadowBlur = 24;
    c.shadowOffsetY = 12;
    fillRound(c, phone.x, phone.y, phone.w, phone.h, bodyRadius, body);
    c.shadowColor = 'transparent';
    strokeRound(c, phone.x + 1, phone.y + 1, phone.w - 2, phone.h - 2, bodyRadius, 'rgba(255,255,255,0.2)', 1.2);
    drawWallpaper(phone, skin);
    drawDeviceChrome(phone, skin);

    c.fillStyle = '#2B2B33';
    c.font = `900 ${Math.max(12, phone.w * 0.043)}px "PingFang SC", "Microsoft YaHei", system-ui, sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'alphabetic';
    c.fillText(customerDef?.name ?? '顾客', phone.x + phone.w / 2, phone.y - 11);
    drawVariantTag(phone);

    for (const icon of phone.icons) {
      drawIcon(icon, skin);
    }
    drawNotifBar(phone);
    if (phoneBlockedByPopup(phone)) drawBlockedScreenDim(phone);
    if (phoneLaggy(phone)) drawLagOverlay(phone);
    if (phone.customer.phone.variant === 'cosmic') drawCosmic(phone);
    drawMalware(phone);
    drawPopups(phone); // 遮挡弹窗在最上层

    c.font = `900 ${Math.max(10, phone.w * 0.04)}px "PingFang SC", "Microsoft YaHei", system-ui, sans-serif`;
    const badgeTotal = phone.customer.phone.badgeTotal;
    c.fillStyle = badgeTotal > 0 ? '#F8FAFC' : '#C7F9CC';
    c.shadowColor = 'rgba(0,0,0,0.35)';
    c.shadowBlur = 4;
    c.textAlign = 'center';
    c.fillText(
      badgeTotal > 0 ? `角标 ${badgeTotal}` : '已清空',
      phone.x + phone.w / 2,
      phone.y + phone.h - 15,
    );
    c.restore();
  }

  function drawIconGlyph(def: AppIconDef, x: number, y: number, size: number): void {
    const c = ctx.ctx2d;
    const s = size;
    c.save();
    c.strokeStyle = 'rgba(255,255,255,0.94)';
    c.fillStyle = 'rgba(255,255,255,0.94)';
    c.lineWidth = Math.max(2, s * 0.07);
    c.lineCap = 'round';
    c.lineJoin = 'round';
    switch (def.id) {
      case 'chat':
        strokeRound(c, x - s * 0.25, y - s * 0.18, s * 0.5, s * 0.35, s * 0.11, 'rgba(255,255,255,0.94)', Math.max(2, s * 0.07));
        c.beginPath();
        c.moveTo(x - s * 0.05, y + s * 0.18);
        c.lineTo(x - s * 0.16, y + s * 0.29);
        c.stroke();
        break;
      case 'mail':
        strokeRound(c, x - s * 0.28, y - s * 0.18, s * 0.56, s * 0.38, s * 0.05, 'rgba(255,255,255,0.94)', Math.max(2, s * 0.06));
        c.beginPath();
        c.moveTo(x - s * 0.26, y - s * 0.16);
        c.lineTo(x, y + s * 0.05);
        c.lineTo(x + s * 0.26, y - s * 0.16);
        c.stroke();
        break;
      case 'social':
        for (const offset of [-0.18, 0, 0.18]) {
          c.beginPath();
          c.arc(x + offset * s, y + (offset === 0 ? -0.11 : 0.12) * s, s * 0.095, 0, TAU);
          c.fill();
        }
        c.beginPath();
        c.moveTo(x - s * 0.1, y + s * 0.08);
        c.lineTo(x, y - s * 0.02);
        c.lineTo(x + s * 0.1, y + s * 0.08);
        c.stroke();
        break;
      case 'news':
        strokeRound(c, x - s * 0.24, y - s * 0.25, s * 0.48, s * 0.5, s * 0.04, 'rgba(255,255,255,0.94)', Math.max(2, s * 0.055));
        for (let line = 0; line < 3; line += 1) {
          c.beginPath();
          c.moveTo(x - s * 0.12, y - s * 0.1 + line * s * 0.12);
          c.lineTo(x + s * 0.14, y - s * 0.1 + line * s * 0.12);
          c.stroke();
        }
        break;
      case 'shop':
        strokeRound(c, x - s * 0.22, y - s * 0.09, s * 0.44, s * 0.35, s * 0.05, 'rgba(255,255,255,0.94)', Math.max(2, s * 0.06));
        c.beginPath();
        c.arc(x, y - s * 0.08, s * 0.15, Math.PI, TAU);
        c.stroke();
        break;
      case 'game':
        strokeRound(c, x - s * 0.28, y - s * 0.13, s * 0.56, s * 0.3, s * 0.14, 'rgba(255,255,255,0.94)', Math.max(2, s * 0.06));
        c.beginPath();
        c.moveTo(x - s * 0.18, y + s * 0.02);
        c.lineTo(x - s * 0.08, y + s * 0.02);
        c.moveTo(x - s * 0.13, y - s * 0.03);
        c.lineTo(x - s * 0.13, y + s * 0.07);
        c.stroke();
        c.beginPath();
        c.arc(x + s * 0.14, y - s * 0.02, s * 0.035, 0, TAU);
        c.arc(x + s * 0.22, y + s * 0.05, s * 0.035, 0, TAU);
        c.fill();
        break;
      case 'video':
        c.beginPath();
        c.moveTo(x - s * 0.13, y - s * 0.2);
        c.lineTo(x + s * 0.2, y);
        c.lineTo(x - s * 0.13, y + s * 0.2);
        c.closePath();
        c.fill();
        break;
      case 'music':
        c.beginPath();
        c.moveTo(x + s * 0.1, y - s * 0.27);
        c.lineTo(x + s * 0.1, y + s * 0.1);
        c.stroke();
        c.beginPath();
        c.arc(x - s * 0.05, y + s * 0.16, s * 0.11, 0, TAU);
        c.fill();
        c.beginPath();
        c.moveTo(x + s * 0.1, y - s * 0.24);
        c.lineTo(x + s * 0.28, y - s * 0.18);
        c.stroke();
        break;
      case 'photo':
        strokeRound(c, x - s * 0.26, y - s * 0.2, s * 0.52, s * 0.42, s * 0.06, 'rgba(255,255,255,0.94)', Math.max(2, s * 0.055));
        c.beginPath();
        c.moveTo(x - s * 0.2, y + s * 0.16);
        c.lineTo(x - s * 0.04, y);
        c.lineTo(x + s * 0.08, y + s * 0.12);
        c.lineTo(x + s * 0.2, y - s * 0.04);
        c.stroke();
        c.beginPath();
        c.arc(x + s * 0.14, y - s * 0.1, s * 0.045, 0, TAU);
        c.fill();
        break;
      case 'map':
        c.beginPath();
        c.arc(x, y - s * 0.08, s * 0.18, 0, TAU);
        c.stroke();
        c.beginPath();
        c.moveTo(x - s * 0.15, y + s * 0.02);
        c.lineTo(x, y + s * 0.28);
        c.lineTo(x + s * 0.15, y + s * 0.02);
        c.stroke();
        break;
      case 'weather':
        c.beginPath();
        c.arc(x - s * 0.12, y - s * 0.1, s * 0.12, 0, TAU);
        c.fill();
        strokeRound(c, x - s * 0.12, y, s * 0.38, s * 0.18, s * 0.09, 'rgba(255,255,255,0.94)', Math.max(2, s * 0.06));
        break;
      case 'calendar':
        strokeRound(c, x - s * 0.24, y - s * 0.22, s * 0.48, s * 0.46, s * 0.05, 'rgba(255,255,255,0.94)', Math.max(2, s * 0.055));
        c.beginPath();
        c.moveTo(x - s * 0.24, y - s * 0.08);
        c.lineTo(x + s * 0.24, y - s * 0.08);
        c.stroke();
        c.fillRect(x - s * 0.12, y + s * 0.02, s * 0.07, s * 0.07);
        c.fillRect(x + s * 0.05, y + s * 0.02, s * 0.07, s * 0.07);
        break;
      default:
        c.font = `900 ${Math.max(13, s * 0.38)}px "PingFang SC", "Microsoft YaHei", system-ui, sans-serif`;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText(def.fallbackGlyph, x, y + 1);
        break;
    }
    c.restore();
  }

  function drawBadge(icon: IconLayout): void {
    const c = ctx.ctx2d;
    const label = icon.icon.badge > 99 ? '99+' : String(icon.icon.badge);
    const badgeW = Math.max(icon.size * 0.46, 15 + label.length * 6);
    const badgeH = icon.size * 0.35;
    const x = icon.badgeX - badgeW / 2;
    const y = icon.badgeY - badgeH / 2;
    const gradient = c.createLinearGradient(x, y, x + badgeW, y + badgeH);
    gradient.addColorStop(0, '#FF6B5D');
    gradient.addColorStop(0.52, '#FF2D20');
    gradient.addColorStop(1, '#C91912');
    c.save();
    c.shadowColor = 'rgba(255, 59, 48, 0.42)';
    c.shadowBlur = 11;
    c.shadowOffsetY = 4;
    fillRound(c, x, y, badgeW, badgeH, badgeH / 2, gradient);
    c.shadowColor = 'transparent';
    strokeRound(c, x + 0.7, y + 0.7, badgeW - 1.4, badgeH - 1.4, badgeH / 2, 'rgba(255,255,255,0.75)', 1.5);
    c.globalAlpha = 0.45;
    fillRound(c, x + badgeW * 0.16, y + 2, badgeW * 0.55, Math.max(2, badgeH * 0.18), badgeH * 0.09, '#FFFFFF');
    c.globalAlpha = 1;
    c.fillStyle = '#FFFFFF';
    c.font = `900 ${Math.max(9, icon.size * 0.22)}px Inter, system-ui, sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(label, icon.badgeX, icon.badgeY + 0.5);
    c.restore();
  }

  function drawIcon(icon: IconLayout, skin: PhoneSkin): void {
    const c = ctx.ctx2d;
    const def = iconDef(icon);
    const image = images.get(def.artId);
    if (image?.complete && image.naturalWidth > 0) {
      c.drawImage(image, icon.x - icon.size / 2, icon.y - icon.size / 2, icon.size, icon.size);
    } else {
      const left = icon.x - icon.size / 2;
      const top = icon.y - icon.size / 2;
      const gradient = c.createLinearGradient(left, top, left + icon.size, top + icon.size);
      gradient.addColorStop(0, mixColor(def.fallbackColor, '#FFFFFF', 0.36));
      gradient.addColorStop(0.42, def.fallbackColor);
      gradient.addColorStop(1, mixColor(def.fallbackColor, '#111827', 0.32));
      c.save();
      c.shadowColor = alphaColor(def.fallbackColor, 0.32);
      c.shadowBlur = 10;
      c.shadowOffsetY = 4;
      const radius = skin.system === 'ios' ? icon.size * 0.24 : skin.model === 'senior' ? icon.size * 0.13 : icon.size * 0.18;
      fillRound(c, left, top, icon.size, icon.size, radius, gradient);
      c.shadowColor = 'transparent';
      strokeRound(c, left + 0.7, top + 0.7, icon.size - 1.4, icon.size - 1.4, radius, 'rgba(255,255,255,0.42)', 1.2);
      c.globalAlpha = 0.26;
      fillRound(c, left + icon.size * 0.13, top + icon.size * 0.08, icon.size * 0.52, icon.size * 0.18, icon.size * 0.09, '#FFFFFF');
      c.globalAlpha = 1;
      drawIconGlyph(def, icon.x, icon.y, icon.size);
      c.restore();
    }

    if (icon.icon.badge > 0) {
      drawBadge(icon);
    }
  }

  function drawSwipeDots(): void {
    const c = ctx.ctx2d;
    c.save();
    for (const dot of swipeDots) {
      const t = clamp01(dot.age / dot.ttl);
      c.globalAlpha = Math.max(0, 1 - t);
      c.fillStyle = dot.color;
      c.beginPath();
      c.arc(dot.x, dot.y, 7 * (1 - t) + 2, 0, TAU);
      c.fill();
      c.strokeStyle = alphaColor(dot.color, 0.5);
      c.lineWidth = 2;
      c.beginPath();
      c.arc(dot.x, dot.y, 13 + t * 12, 0, TAU);
      c.stroke();
    }
    c.restore();
  }

  function drawSparks(): void {
    const c = ctx.ctx2d;
    c.save();
    for (const spark of sparks) {
      const t = clamp01(spark.age / spark.ttl);
      c.globalAlpha = Math.max(0, 1 - t);
      c.fillStyle = spark.color;
      c.beginPath();
      c.arc(spark.x, spark.y, Math.max(0.5, spark.size * (1 - t * 0.45)), 0, TAU);
      c.fill();
    }
    c.restore();
  }

  function drawEffects(): void {
    const c = ctx.ctx2d;
    for (const effect of effects) {
      const t = clamp01(effect.age / effect.ttl);
      const alpha = Math.max(0, 1 - t);
      c.save();
      c.globalAlpha = alpha;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      if (effect.kind === 'pop') {
        const rise = 46 * t;
        c.strokeStyle = alphaColor(effect.color, 0.7);
        c.lineWidth = 2 + effect.power;
        c.beginPath();
        c.arc(effect.x, effect.y, 10 + t * 38 * effect.power, 0, TAU);
        c.stroke();
        c.fillStyle = effect.color;
        c.font = `1000 ${18 + effect.power * 4}px Inter, system-ui, sans-serif`;
        c.fillText(effect.label, effect.x, effect.y - rise);
      } else if (effect.kind === 'combo') {
        const scale = 1 + Math.sin(t * Math.PI) * 0.18;
        c.translate(effect.x, effect.y - t * 34);
        c.scale(scale, scale);
        fillRound(c, -44, -18, 88, 36, 18, 'rgba(255,255,255,0.84)');
        strokeRound(c, -44, -18, 88, 36, 18, '#FFD166', 2);
        c.fillStyle = '#B66E00';
        c.font = '1000 18px "PingFang SC", "Microsoft YaHei", system-ui, sans-serif';
        c.fillText(effect.label, 0, 1);
      } else if (effect.kind === 'smash') {
        const radius = 26 + t * 190 * effect.power;
        c.translate(effect.x, effect.y);
        c.strokeStyle = alphaColor('#FF3B30', 0.72);
        c.lineWidth = 5 * (1 - t) + 1.5;
        c.beginPath();
        c.arc(0, 0, radius, 0, TAU);
        c.stroke();
        c.strokeStyle = alphaColor('#2B2B33', 0.72);
        c.lineWidth = 3;
        for (let crack = 0; crack < 12; crack += 1) {
          const angle = crack * (TAU / 12) + Math.sin(crack * 12.989) * 0.26;
          const inner = 12 + t * 12;
          const outer = 38 + t * 82 * (0.7 + (crack % 4) * 0.12);
          c.beginPath();
          c.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
          c.lineTo(Math.cos(angle + 0.18) * outer * 0.62, Math.sin(angle + 0.18) * outer * 0.62);
          c.lineTo(Math.cos(angle - 0.08) * outer, Math.sin(angle - 0.08) * outer);
          c.stroke();
        }
        fillRound(c, -76, -23 - t * 18, 152, 46, 23, 'rgba(255,255,255,0.9)');
        strokeRound(c, -76, -23 - t * 18, 152, 46, 23, '#FF3B30', 2);
        c.fillStyle = '#8E1B15';
        c.font = '1000 21px "PingFang SC", "Microsoft YaHei", system-ui, sans-serif';
        c.fillText(effect.label, 0, -t * 18 + 1, 138);
      } else if (effect.kind === 'skill') {
        const radius = 48 + t * 150 * effect.power;
        c.translate(effect.x, effect.y);
        for (let ray = 0; ray < 16; ray += 1) {
          c.rotate(TAU / 16);
          c.strokeStyle = ray % 2 === 0 ? alphaColor('#FFD166', 0.42) : alphaColor('#5B8DEF', 0.38);
          c.lineWidth = 3;
          c.beginPath();
          c.moveTo(24 + t * 24, 0);
          c.lineTo(radius, 0);
          c.stroke();
        }
        c.globalAlpha = alpha;
        c.strokeStyle = alphaColor(effect.color, 0.72);
        c.lineWidth = 4;
        c.beginPath();
        c.arc(0, 0, 28 + t * 126, 0, TAU);
        c.stroke();
        fillRound(c, -82, -24, 164, 48, 24, 'rgba(255,255,255,0.9)');
        strokeRound(c, -82, -24, 164, 48, 24, '#8E7CF6', 2);
        c.fillStyle = '#35265E';
        c.font = '1000 22px "PingFang SC", "Microsoft YaHei", system-ui, sans-serif';
        c.fillText(effect.label, 0, 1, 150);
      } else {
        const isLevel = effect.kind === 'level';
        const boxW = isLevel ? 166 : 126;
        const boxH = isLevel ? 48 : 38;
        fillRound(c, effect.x - boxW / 2, effect.y - boxH / 2 - t * 34, boxW, boxH, boxH / 2, 'rgba(255,255,255,0.88)');
        strokeRound(c, effect.x - boxW / 2, effect.y - boxH / 2 - t * 34, boxW, boxH, boxH / 2, effect.color, 2);
        c.fillStyle = effect.color;
        c.font = `1000 ${isLevel ? 22 : 17}px "PingFang SC", "Microsoft YaHei", system-ui, sans-serif`;
        c.fillText(effect.label, effect.x, effect.y - t * 34);
      }
      c.restore();
    }
  }

  function drawSlotTabs(layout: GameLayout): void {
    if (layout.slotTabs.length <= 1) return;
    const c = ctx.ctx2d;
    for (const tab of layout.slotTabs) {
      const focused = tab.index === layout.focusedIndex;
      const phone = tab.customer.phone;
      fillRound(c, tab.rect.x, tab.rect.y, tab.rect.w, tab.rect.h, 10, focused ? '#5B8DEF' : 'rgba(12,20,34,0.72)');
      strokeRound(c, tab.rect.x, tab.rect.y, tab.rect.w, tab.rect.h, 10, focused ? '#3B6FD0' : 'rgba(255,255,255,0.18)', 1.5);
      c.fillStyle = focused ? '#FFFFFF' : '#DCE6F5';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.font = '900 12px "PingFang SC", "Microsoft YaHei", system-ui, sans-serif';
      c.fillText(`工位 ${tab.index + 1}`, tab.rect.x + tab.rect.w / 2, tab.rect.y + tab.rect.h / 2);
      // 需要关注（弹窗/卡死）的工位标红点
      if (!focused && (phone.popups.length > 0 || phone.malware >= MALWARE_LAG_THRESHOLD)) {
        fillRound(c, tab.rect.x + tab.rect.w - 13, tab.rect.y + 4, 9, 9, 5, '#FF3B30');
      }
    }
  }

  function drawIntro(layout: GameLayout): void {
    if (ctx.state.totalCleared > 6 || layout.phoneLayouts.length === 0) return;
    const c = ctx.ctx2d;
    const w = ctx.canvas.clientWidth;
    const boxW = Math.min(w - 24, 360);
    const boxX = (w - boxW) / 2;
    const boxY = layout.playArea.y + 6;
    fillRound(c, boxX, boxY, boxW, 54, 12, 'rgba(12,20,34,0.92)');
    strokeRound(c, boxX, boxY, boxW, 54, 12, 'rgba(91,141,239,0.6)', 1.5);
    c.fillStyle = '#F8FBFF';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = '900 13px "PingFang SC", "Microsoft YaHei", system-ui, sans-serif';
    c.fillText('👆 点掉红色角标，修完自动收钱', boxX + boxW / 2, boxY + 19);
    c.fillStyle = 'rgba(248,251,255,0.74)';
    c.font = '800 11px "PingFang SC", "Microsoft YaHei", system-ui, sans-serif';
    c.fillText('弹窗点 ✕ 关掉 · 别乱点"领取/中奖"会被扣钱', boxX + boxW / 2, boxY + 38);
  }

  function drawHud(ui: UiLayout): void {
    const c = ctx.ctx2d;
    const s = ctx.state;
    const bar = ui.hud;
    const grad = c.createLinearGradient(0, 0, 0, bar.h);
    grad.addColorStop(0, 'rgba(12, 20, 34, 0.96)');
    grad.addColorStop(1, 'rgba(12, 20, 34, 0.86)');
    c.fillStyle = grad;
    c.fillRect(0, 0, bar.w, bar.h);

    const cy = bar.h / 2;

    // —— 现金：大金牌，视觉焦点（#E）——
    const cashLabel = `💰 ${formatMoney(s.points)} 元`;
    const pillH = bar.h - 12;
    c.font = `1000 ${Math.round(pillH * 0.46)}px "PingFang SC", "Microsoft YaHei", system-ui, sans-serif`;
    const cashW = Math.min(bar.w * 0.58, c.measureText(cashLabel).width + 34);
    const pillX = 8;
    const pillY = 6;
    const cg = c.createLinearGradient(pillX, pillY, pillX, pillY + pillH);
    cg.addColorStop(0, '#FFE082');
    cg.addColorStop(1, '#FFB300');
    c.save();
    c.shadowColor = 'rgba(255, 179, 0, 0.5)';
    c.shadowBlur = 12;
    fillRound(c, pillX, pillY, cashW, pillH, pillH / 2, cg);
    c.restore();
    strokeRound(c, pillX, pillY, cashW, pillH, pillH / 2, 'rgba(255,255,255,0.7)', 1.5);
    c.fillStyle = '#5A3600';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(cashLabel, pillX + cashW / 2, cy);

    // —— 右侧：等级·段位 + 声誉 ——
    const rx = bar.w - 12;
    c.textAlign = 'right';
    c.fillStyle = '#EAF4FF';
    c.font = '900 13px "PingFang SC", "Microsoft YaHei", system-ui, sans-serif';
    c.fillText(`Lv${s.level} · ${shopRankName(s.level)}`, rx, cy - 9);
    const stars = Math.round(clamp01(s.reputation / 5) * 5);
    let starStr = '';
    for (let i = 0; i < 5; i += 1) starStr += i < stars ? '★' : '☆';
    c.fillStyle = '#FFC542';
    c.font = '900 13px system-ui, sans-serif';
    c.fillText(starStr, rx, cy + 9);

    // —— 经验：贴在 HUD 底边的细条 ——
    const xpRatio = Math.min(1, s.xp / Math.max(1, s.xpToNext));
    c.fillStyle = 'rgba(255,255,255,0.14)';
    c.fillRect(0, bar.h - 3, bar.w, 3);
    c.fillStyle = '#5B8DEF';
    c.fillRect(0, bar.h - 3, bar.w * xpRatio, 3);
  }

  function drawControls(ui: UiLayout): void {
    const c = ctx.ctx2d;
    const now = performance.now();
    c.fillStyle = 'rgba(12, 20, 34, 0.5)';
    c.fillRect(ui.controlBar.x, ui.controlBar.y, ui.controlBar.w, ui.controlBar.h);
    const readySkills = ctx.content.skills.filter((sk) => {
      const rt = ctx.state.skills[sk.id];
      return rt?.unlocked && now - rt.lastUsedAt >= sk.cooldownMs;
    }).length;
    for (const btn of ui.buttons) {
      const active = ctx.state.ui.modal === btn.id;
      fillRound(c, btn.rect.x, btn.rect.y, btn.rect.w, btn.rect.h, 16, active ? '#5B8DEF' : 'rgba(255,255,255,0.96)');
      strokeRound(c, btn.rect.x, btn.rect.y, btn.rect.w, btn.rect.h, 16, active ? '#3B6FD0' : 'rgba(43,43,51,0.12)', 1.5);
      c.fillStyle = active ? '#FFFFFF' : '#2B2B33';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.font = '22px system-ui, sans-serif';
      c.fillText(btn.icon, btn.rect.x + btn.rect.w / 2, btn.rect.y + btn.rect.h * 0.36);
      c.font = '900 13px "PingFang SC", "Microsoft YaHei", system-ui, sans-serif';
      c.fillText(btn.label, btn.rect.x + btn.rect.w / 2, btn.rect.y + btn.rect.h * 0.74);
      if (btn.id === 'skills' && readySkills > 0 && !active) {
        fillRound(c, btn.rect.x + btn.rect.w - 22, btn.rect.y + 5, 17, 17, 9, '#FF3B30');
        c.fillStyle = '#FFFFFF';
        c.font = '900 11px Inter, system-ui, sans-serif';
        c.fillText(String(readySkills), btn.rect.x + btn.rect.w - 13, btn.rect.y + 14);
      }
    }
  }

  function drawShopRow(id: string, rect: Rect): void {
    const c = ctx.ctx2d;
    const def = ctx.content.upgrades.find((u) => u.id === id);
    if (!def) return;
    const level = ctx.state.upgrades[id] ?? 0;
    const maxed = def.maxLevel > 0 && level >= def.maxLevel;
    const cost = upgradeCost(def, level);
    const unlockLv = upgradeUnlockLevel(id);
    const locked = ctx.state.level < unlockLv;
    const affordable = !maxed && !locked && ctx.state.points >= cost;
    fillRound(c, rect.x, rect.y, rect.w, rect.h, 12, 'rgba(255,255,255,0.85)');
    strokeRound(c, rect.x, rect.y, rect.w, rect.h, 12, 'rgba(43,43,51,0.08)', 1);
    c.textAlign = 'left';
    c.textBaseline = 'middle';
    c.fillStyle = '#2B2B33';
    c.font = `900 ${Math.min(14, rect.h * 0.32)}px "PingFang SC", "Microsoft YaHei", system-ui, sans-serif`;
    c.fillText(`${def.name}  Lv${level}`, rect.x + 12, rect.y + rect.h * 0.36, rect.w * 0.6);
    c.fillStyle = '#8A8790';
    c.font = `700 ${Math.min(11, rect.h * 0.24)}px "PingFang SC", "Microsoft YaHei", system-ui, sans-serif`;
    c.fillText(def.desc, rect.x + 12, rect.y + rect.h * 0.74, rect.w * 0.6);
    const pw = Math.min(96, rect.w * 0.28);
    const ph = Math.min(34, rect.h * 0.62);
    const px = rect.x + rect.w - pw - 10;
    const py = rect.y + (rect.h - ph) / 2;
    fillRound(c, px, py, pw, ph, ph / 2, locked ? '#9AA0AA' : maxed ? '#FF9F43' : affordable ? '#5B8DEF' : '#C7C7CF');
    c.fillStyle = '#FFFFFF';
    c.textAlign = 'center';
    c.font = `900 ${Math.min(12, ph * 0.48)}px "PingFang SC", "Microsoft YaHei", system-ui, sans-serif`;
    c.fillText(locked ? `🔒Lv${unlockLv}` : maxed ? '已满' : `${formatMoney(cost)}元`, px + pw / 2, py + ph / 2);
  }

  function drawSkillRow(id: string, rect: Rect): void {
    const c = ctx.ctx2d;
    const def = ctx.content.skills.find((s) => s.id === id);
    if (!def) return;
    const rt = ctx.state.skills[id];
    const now = performance.now();
    const unlocked = !!rt?.unlocked;
    const remaining = rt ? Math.max(0, def.cooldownMs - (now - rt.lastUsedAt)) : def.cooldownMs;
    const ready = unlocked && remaining <= 0;
    fillRound(c, rect.x, rect.y, rect.w, rect.h, 12, ready ? 'rgba(38,198,166,0.16)' : 'rgba(255,255,255,0.85)');
    strokeRound(c, rect.x, rect.y, rect.w, rect.h, 12, ready ? 'rgba(38,198,166,0.5)' : 'rgba(43,43,51,0.08)', 1);
    c.textAlign = 'left';
    c.textBaseline = 'middle';
    c.fillStyle = '#2B2B33';
    c.font = `${Math.min(22, rect.h * 0.5)}px system-ui, sans-serif`;
    c.fillText(def.icon, rect.x + 12, rect.y + rect.h / 2);
    c.fillStyle = unlocked ? '#2B2B33' : '#9A9AA3';
    c.font = `900 ${Math.min(14, rect.h * 0.32)}px "PingFang SC", "Microsoft YaHei", system-ui, sans-serif`;
    c.fillText(def.name, rect.x + 46, rect.y + rect.h * 0.36, rect.w * 0.5);
    c.fillStyle = '#8A8790';
    c.font = `700 ${Math.min(11, rect.h * 0.24)}px "PingFang SC", "Microsoft YaHei", system-ui, sans-serif`;
    c.fillText(def.desc, rect.x + 46, rect.y + rect.h * 0.74, rect.w * 0.52);
    const pw = Math.min(86, rect.w * 0.24);
    const ph = Math.min(32, rect.h * 0.58);
    const px = rect.x + rect.w - pw - 10;
    const py = rect.y + (rect.h - ph) / 2;
    const label = !unlocked ? `Lv${def.unlockLevel}` : ready ? '释放' : `${Math.ceil(remaining / 1000)}s`;
    fillRound(c, px, py, pw, ph, ph / 2, !unlocked ? '#C7C7CF' : ready ? '#26C6A6' : '#8E7CF6');
    c.fillStyle = '#FFFFFF';
    c.textAlign = 'center';
    c.font = `900 ${Math.min(13, ph * 0.5)}px "PingFang SC", "Microsoft YaHei", system-ui, sans-serif`;
    c.fillText(label, px + pw / 2, py + ph / 2);
  }

  function drawSettingRow(id: string, rect: Rect): void {
    const c = ctx.ctx2d;
    const muted = localStorage.getItem('badge-buster-muted') === '1';
    const isReset = id === 'reset';
    fillRound(c, rect.x, rect.y, rect.w, rect.h, 12, isReset ? 'rgba(255,59,48,0.08)' : 'rgba(255,255,255,0.85)');
    strokeRound(c, rect.x, rect.y, rect.w, rect.h, 12, isReset ? 'rgba(255,59,48,0.3)' : 'rgba(43,43,51,0.08)', 1);
    c.textAlign = 'left';
    c.textBaseline = 'middle';
    c.fillStyle = isReset ? '#C0392B' : '#2B2B33';
    c.font = '900 15px "PingFang SC", "Microsoft YaHei", system-ui, sans-serif';
    c.fillText(isReset ? '🗑 重置本地存档' : muted ? '🔇 声音：已静音' : '🔊 声音：开启', rect.x + 16, rect.y + rect.h / 2);
    c.textAlign = 'right';
    c.fillStyle = '#8A8790';
    c.font = '800 12px "PingFang SC", "Microsoft YaHei", system-ui, sans-serif';
    c.fillText(isReset ? '点此清空重来' : '点击切换', rect.x + rect.w - 16, rect.y + rect.h / 2);
  }

  function drawModal(ui: UiLayout): void {
    if (!ui.modal.open) {
      return;
    }
    const c = ctx.ctx2d;
    const m = ui.modal;
    c.fillStyle = 'rgba(6, 12, 22, 0.55)';
    c.fillRect(0, 0, m.backdrop.w, m.backdrop.h);
    c.save();
    c.shadowColor = 'rgba(0,0,0,0.35)';
    c.shadowBlur = 24;
    c.shadowOffsetY = 10;
    fillRound(c, m.panel.x, m.panel.y, m.panel.w, m.panel.h, 16, '#FBF7F0');
    c.restore();
    strokeRound(c, m.panel.x, m.panel.y, m.panel.w, m.panel.h, 16, 'rgba(43,43,51,0.18)', 1.5);
    fillRound(c, m.panel.x, m.panel.y, m.panel.w, m.titleBar.h, 16, 'rgba(91,141,239,0.16)');
    c.fillStyle = '#2B2B33';
    c.font = '900 17px "PingFang SC", "Microsoft YaHei", system-ui, sans-serif';
    c.textAlign = 'left';
    c.textBaseline = 'middle';
    c.fillText(m.title, m.panel.x + 16, m.panel.y + m.titleBar.h / 2);
    fillRound(c, m.close.x, m.close.y, m.close.w, m.close.h, 10, 'rgba(43,43,51,0.08)');
    c.strokeStyle = '#6E6A73';
    c.lineWidth = 2.4;
    c.lineCap = 'round';
    const cp = m.close.w * 0.3;
    c.beginPath();
    c.moveTo(m.close.x + cp, m.close.y + cp);
    c.lineTo(m.close.x + m.close.w - cp, m.close.y + m.close.h - cp);
    c.moveTo(m.close.x + m.close.w - cp, m.close.y + cp);
    c.lineTo(m.close.x + cp, m.close.y + m.close.h - cp);
    c.stroke();
    for (const row of m.rows) {
      if (m.kind === 'shop') drawShopRow(row.id, row.rect);
      else if (m.kind === 'skills') drawSkillRow(row.id, row.rect);
      else drawSettingRow(row.id, row.rect);
    }
  }

  function drawComboOverlay(layout: GameLayout): void {
    if (combo < 3 || comboHoldMs <= 0) {
      return;
    }
    const c = ctx.ctx2d;
    const alpha = clamp01(comboHoldMs / 720);
    const x = layout.playArea.x + Math.min(layout.playArea.w - 72, Math.max(78, layout.playArea.w * 0.78));
    const y = layout.playArea.y + 30;
    c.save();
    c.globalAlpha = alpha;
    c.translate(x, y);
    c.scale(1 + Math.sin(pulseTime * 0.024) * 0.05, 1 + Math.sin(pulseTime * 0.024) * 0.05);
    fillRound(c, -58, -21, 116, 42, 21, 'rgba(255,255,255,0.9)');
    strokeRound(c, -58, -21, 116, 42, 21, '#FF9F43', 2);
    c.fillStyle = '#B35400';
    c.font = '1000 20px "PingFang SC", "Microsoft YaHei", system-ui, sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(`连击 x${combo}`, 0, 1);
    c.restore();
  }

  function drawEmptyState(layout: GameLayout): void {
    if (ctx.state.activeCustomers.length > 0) {
      return;
    }
    const c = ctx.ctx2d;
    const boxW = Math.min(360, layout.playArea.w * 0.7);
    const boxX = layout.playArea.x + (layout.playArea.w - boxW) / 2;
    const boxY = layout.playArea.y + layout.playArea.h * 0.26;
    fillRound(c, boxX, boxY, boxW, 96, 8, 'rgba(255,255,255,0.9)');
    strokeRound(c, boxX, boxY, boxW, 96, 8, '#E7D8C0');
    c.fillStyle = '#2B2B33';
    c.font = '900 18px "PingFang SC", "Microsoft YaHei", system-ui, sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'alphabetic';
    c.fillText('等待下一台手机...', layout.playArea.x + layout.playArea.w / 2, boxY + 39);
    c.fillStyle = '#6E6A73';
    c.font = '700 12px "PingFang SC", "Microsoft YaHei", system-ui, sans-serif';
    c.fillText('保持柜台通畅。', layout.playArea.x + layout.playArea.w / 2, boxY + 64);
  }

  function draw(): void {
    const layout = computeGameLayout(ctx.state, ctx.canvas.clientWidth, ctx.canvas.clientHeight);
    const c = ctx.ctx2d;
    const w = ctx.canvas.clientWidth;
    const h = ctx.canvas.clientHeight;
    c.clearRect(0, 0, w, h);

    const nowT = performance.now();
    const fdt = Math.min(60, nowT - lastDrawTime);
    lastDrawTime = nowT;
    updatePhoneAnims(layout, fdt);

    const shakeRatio = clamp01(shakeMs / 520);
    const shakeX = Math.sin(pulseTime * 0.072) * shakeAmp * shakeRatio + Math.sin(pulseTime * 0.117) * shakeAmp * 0.45 * shakeRatio;
    const shakeY = Math.cos(pulseTime * 0.085) * shakeAmp * shakeRatio;

    c.save();
    c.translate(shakeX, shakeY);
    drawBackground(layout);
    for (const queueItem of layout.queueLayouts) {
      drawQueueItem(queueItem);
    }
    for (const dep of departing) {
      drawDepartingPhone(dep);
    }
    for (const phone of layout.phoneLayouts) {
      drawAnimatedPhone(phone);
    }
    drawEmptyState(layout);
    drawSwipeDots();
    drawSparks();
    drawEffects();
    c.restore();

    drawSlotTabs(layout);
    drawIntro(layout);
    drawComboOverlay(layout);

    const ui = computeUiLayout(ctx.state, w, h, ctx.content.upgrades.map((u) => u.id), ctx.content.skills.map((s) => s.id));
    drawHud(ui);
    drawStatusStrip(ui);
    drawControls(ui);
    drawModal(ui);
    drawCursor();
  }

  function loadImages(): void {
    for (const [id, path] of Object.entries(ctx.assets.images)) {
      if (!path) {
        continue;
      }
      const image = new Image();
      image.src = path;
      images.set(id, image);
    }
  }

  return {
    name: 'render',
    init(context) {
      ctx = context;
      loadImages();
      ctx.bus.on('BADGE_CLEARED', (event) => {
        if (event.amount <= 0) {
          return;
        }
        const now = performance.now();
        combo = now - lastClearAt < 680 ? combo + 1 : 1;
        lastClearAt = now;
        comboHoldMs = combo >= 3 ? 720 : 0;
        const power = Math.min(2.4, 1 + combo * 0.08);
        effects.push({ kind: 'pop', x: event.x, y: event.y, age: 0, ttl: 540, label: `-${event.amount}`, color: '#FF3B30', power });
        if (combo >= 3 && combo % 3 === 0) {
          effects.push({ kind: 'combo', x: event.x, y: event.y - 28, age: 0, ttl: 650, label: `${combo}连清`, color: '#FF9F43', power });
        }
        spawnBurst(event.x, event.y, '#FF3B30', 10 + Math.min(16, combo * 2), power);
        spawnBurst(event.x, event.y, '#FFD166', 4 + Math.min(10, combo), power * 0.68);
        addShake(90 + Math.min(160, combo * 12), 1.4 + Math.min(4.2, combo * 0.28));
      });
      ctx.bus.on('SWIPE', (event) => {
        if (event.path.length > 1) {
          spawnSwipeTrace(event.path);
          addShake(48, 0.8);
        }
      });
      ctx.bus.on('PHONE_RETURNED', (event) => {
        effects.push({ kind: 'return', x: ctx.canvas.clientWidth / 2, y: 130, age: 0, ttl: 950, label: `+${event.payout}元`, color: '#26C6A6', power: 1.2 });
        if (event.xp > 0) {
          effects.push({ kind: 'return', x: ctx.canvas.clientWidth / 2, y: 168, age: 0, ttl: 950, label: `+${event.xp} 经验`, color: '#5B8DEF', power: 1 });
        }
        spawnBurst(ctx.canvas.clientWidth / 2, 136, '#26C6A6', 28, 1.2);
        addShake(220, 2.4);
      });
      ctx.bus.on('PHONE_SMASHED', (event) => {
        effects.push({ kind: 'smash', x: event.x, y: event.y, age: 0, ttl: 1050, label: `砸出 ${event.totalBadges}`, color: '#FF3B30', power: 1.7 });
        spawnBurst(event.x, event.y, '#FF3B30', 46 + Math.min(44, event.iconCount * 5), 2);
        spawnBurst(event.x, event.y, '#FFD166', 28 + Math.min(34, event.totalBadges), 1.6);
        spawnBurst(event.x, event.y, '#5B8DEF', 18 + Math.min(28, event.iconCount * 3), 1.3);
        addShake(760, 10);
      });
      ctx.bus.on('POPUP_CLOSED', (event) => {
        const color = event.defused ? '#26C6A6' : '#FF9F43';
        effects.push({ kind: 'task', x: event.x, y: event.y, age: 0, ttl: 560, label: event.defused ? '已拆除' : '已关闭', color, power: 1 });
        spawnBurst(event.x, event.y, color, event.defused ? 18 : 10, 1);
        addShake(70, 1);
      });
      ctx.bus.on('NOTIFICATION_CLEARED', (event) => {
        effects.push({ kind: 'task', x: event.x, y: event.y, age: 0, ttl: 520, label: `-${event.amount} 通知`, color: '#FF9F43', power: 1 });
        spawnBurst(event.x, event.y, '#FF9F43', 10, 0.9);
      });
      ctx.bus.on('MALWARE_CLEARED', (event) => {
        effects.push({ kind: 'task', x: event.x, y: event.y, age: 0, ttl: 560, label: `-${Math.round(event.amount)} 病毒`, color: '#26C6A6', power: 1 });
        spawnBurst(event.x, event.y, '#26C6A6', 14, 1);
        addShake(60, 1);
      });
      ctx.bus.on('RISK_EVENT', (event) => {
        const layout = computeGameLayout(ctx.state, ctx.canvas.clientWidth, ctx.canvas.clientHeight);
        const phone = layout.phoneLayouts.find((p) => p.customer.id === event.customerId);
        let x = event.x;
        let y = event.y;
        if (!x && !y) {
          if (phone) { x = phone.x + phone.w / 2; y = phone.y + phone.h / 2; }
          else { x = ctx.canvas.clientWidth / 2; y = ctx.canvas.clientHeight * 0.4; }
        }
        if (event.kind === 'transformer') {
          x = ctx.canvas.clientWidth / 2;
          y = ctx.canvas.clientHeight * 0.42;
          effects.push({ kind: 'smash', x, y, age: 0, ttl: 1500, label: event.label, color: '#FF3B30', power: 2.6 });
          spawnBurst(x, y, '#FF3B30', 80, 2.6);
          spawnBurst(x, y, '#2B2B33', 60, 2.2);
          skillFlash = 1100;
          addShake(1200, 17);
        } else if (event.kind === 'golden_break') {
          effects.push({ kind: 'smash', x, y, age: 0, ttl: 1000, label: event.label, color: '#FFB200', power: 1.9 });
          spawnBurst(x, y, '#FFD166', 52, 1.9);
          spawnBurst(x, y, '#B8860B', 30, 1.5);
          addShake(640, 8.5);
        } else if (event.kind === 'soul_skill') {
          effects.push({ kind: 'skill', x, y, age: 0, ttl: 1200, label: event.label, color: '#8E7CF6', power: 1.8 });
          spawnBurst(x, y, '#8E7CF6', 54, 1.8);
          spawnBurst(x, y, '#C7B3FF', 30, 1.3);
          skillFlash = 760;
        } else if (event.kind === 'offer_win') {
          effects.push({ kind: 'return', x, y, age: 0, ttl: 950, label: event.label, color: '#26C6A6', power: 1.4 });
          spawnBurst(x, y, '#26C6A6', 30, 1.3);
        } else {
          effects.push({ kind: 'smash', x, y, age: 0, ttl: 950, label: event.label, color: '#FF3B30', power: 1.4 });
          spawnBurst(x, y, '#FF3B30', 28, 1.5);
          addShake(340, 5);
        }
      });
      ctx.bus.on('SCAM_INSTALLED', (event) => {
        const layout = computeGameLayout(ctx.state, ctx.canvas.clientWidth, ctx.canvas.clientHeight);
        const phone = layout.phoneLayouts.find((item) => item.customer.id === event.customerId);
        const x = phone ? phone.x + phone.w / 2 : ctx.canvas.clientWidth / 2;
        const y = phone ? phone.y + phone.h / 2 : 140;
        effects.push({ kind: 'smash', x, y, age: 0, ttl: 900, label: `中招 -${event.penalty}元`, color: '#FF3B30', power: 1.3 });
        spawnBurst(x, y, '#FF3B30', 34, 1.6);
        addShake(360, 6);
      });
      ctx.bus.on('LEVEL_UP', (event) => {
        effects.push({ kind: 'level', x: ctx.canvas.clientWidth / 2, y: 112, age: 0, ttl: 1300, label: `升级到 ${event.level}`, color: '#5B8DEF', power: 1.7 });
        spawnBurst(ctx.canvas.clientWidth / 2, 112, '#5B8DEF', 42, 1.6);
        spawnBurst(ctx.canvas.clientWidth / 2, 112, '#FFD166', 24, 1.2);
        addShake(420, 4.8);
      });
      ctx.bus.on('CUSTOMER_LEFT', (event) => {
        effects.push({ kind: 'leave', x: 82, y: 120, age: 0, ttl: 900, label: event.reason === 'overflow' ? '队满' : '离店', color: '#FF9F43', power: 1 });
      });
      ctx.bus.on('SKILL_USED', (event) => {
        const layout = computeGameLayout(ctx.state, ctx.canvas.clientWidth, ctx.canvas.clientHeight);
        const skill = ctx.content.skills.find((item) => item.id === event.id);
        const x = layout.playArea.x + layout.playArea.w / 2;
        const y = layout.playArea.y + layout.playArea.h / 2;
        effects.push({ kind: 'skill', x, y, age: 0, ttl: 980, label: skill?.name ?? '技能释放', color: '#8E7CF6', power: 1.6 });
        skillFlash = 720;
        spawnBurst(x, y, '#8E7CF6', 58, 1.9);
        spawnBurst(x, y, '#FFD166', 42, 1.5);
        addShake(520, 7.5);
      });
    },
    update(dt) {
      pulseTime += dt;
      skillFlash = Math.max(0, skillFlash - dt);
      shakeMs = Math.max(0, shakeMs - dt);
      if (shakeMs <= 0) {
        shakeAmp = 0;
      }
      comboHoldMs = Math.max(0, comboHoldMs - dt);

      for (const effect of effects) {
        effect.age += dt;
      }
      for (let i = effects.length - 1; i >= 0; i -= 1) {
        if (effects[i].age >= effects[i].ttl) {
          effects.splice(i, 1);
        }
      }

      const step = dt / 16.67;
      for (const spark of sparks) {
        spark.age += dt;
        spark.x += spark.vx * step;
        spark.y += spark.vy * step;
        spark.vy += 0.12 * step;
        spark.vx *= 0.988;
      }
      for (let i = sparks.length - 1; i >= 0; i -= 1) {
        if (sparks[i].age >= sparks[i].ttl) {
          sparks.splice(i, 1);
        }
      }

      for (const dot of swipeDots) {
        dot.age += dt;
      }
      for (let i = swipeDots.length - 1; i >= 0; i -= 1) {
        if (swipeDots[i].age >= swipeDots[i].ttl) {
          swipeDots.splice(i, 1);
        }
      }

      draw();
    },
  };
}
