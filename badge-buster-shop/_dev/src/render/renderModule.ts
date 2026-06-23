import { computeGameLayout, type GameLayout, type IconLayout, type PhoneLayout, type QueueLayout } from '../shared/layout';
import type { AppIconDef } from '../types/content.types';
import type { GameContext, GameModule } from '../types/module.types';
import type { Mood } from '../types/state.types';

const TAU = Math.PI * 2;

interface VisualEffect {
  kind: 'pop' | 'return' | 'level' | 'leave' | 'skill' | 'combo';
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

export function createRenderModule(): GameModule {
  let ctx: GameContext;
  const effects: VisualEffect[] = [];
  const sparks: Spark[] = [];
  const swipeDots: SwipeDot[] = [];
  const images = new Map<string, HTMLImageElement>();
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
    const bg = c.createLinearGradient(0, 0, w, h);
    bg.addColorStop(0, '#F8FBFF');
    bg.addColorStop(0.46, '#FBF7F0');
    bg.addColorStop(1, '#EEF7F2');
    c.fillStyle = bg;
    c.fillRect(-24, -24, w + 48, h + 48);

    c.save();
    c.globalAlpha = 0.13;
    c.strokeStyle = '#9CB5D8';
    c.lineWidth = 1;
    for (let x = -40; x < w + 40; x += 44) {
      c.beginPath();
      c.moveTo(x, 64);
      c.lineTo(x - 70, h);
      c.stroke();
    }
    c.restore();

    if (skillFlash > 0) {
      const flash = clamp01(skillFlash / 720);
      const pulse = c.createRadialGradient(layout.playArea.x + layout.playArea.w / 2, layout.playArea.y + layout.playArea.h / 2, 20, layout.playArea.x + layout.playArea.w / 2, layout.playArea.y + layout.playArea.h / 2, Math.max(layout.playArea.w, layout.playArea.h));
      pulse.addColorStop(0, `rgba(255, 209, 102, ${0.24 * flash})`);
      pulse.addColorStop(0.55, `rgba(91, 141, 239, ${0.14 * flash})`);
      pulse.addColorStop(1, 'rgba(91, 141, 239, 0)');
      c.fillStyle = pulse;
      c.fillRect(0, 0, w, h);
    }

    c.fillStyle = 'rgba(255,255,255,0.9)';
    c.fillRect(0, 0, w, 66);
    c.fillStyle = '#2B2B33';
    c.font = '900 24px "PingFang SC", "Microsoft YaHei", system-ui, sans-serif';
    c.textAlign = 'left';
    c.textBaseline = 'alphabetic';
    c.fillText('角标清理铺', 22, 41);

    const counterX = Math.max(216, w - layout.uiReserve - 176);
    fillRound(c, counterX, 18, 152, 30, 15, 'rgba(255,255,255,0.78)');
    strokeRound(c, counterX, 18, 152, 30, 15, '#DDE8F6');
    c.font = '800 12px "PingFang SC", "Microsoft YaHei", system-ui, sans-serif';
    c.fillStyle = '#4D5A6D';
    c.textAlign = 'center';
    c.fillText(`已清理 ${Math.floor(ctx.state.totalCleared)} 个`, counterX + 76, 38);

    const counterY = h - layout.bottomReserve - 82;
    if (counterY > 88) {
      c.fillStyle = 'rgba(243, 226, 200, 0.78)';
      c.fillRect(0, counterY, Math.max(0, w - layout.uiReserve), 100);
      c.fillStyle = '#D6B37A';
      c.fillRect(0, counterY, Math.max(0, w - layout.uiReserve), 5);
      c.fillStyle = 'rgba(255,255,255,0.48)';
      c.fillRect(0, counterY + 12, Math.max(0, w - layout.uiReserve), 2);
    }

    fillRound(c, layout.queuePanel.x - 8, layout.queuePanel.y - 8, layout.queuePanel.w + 16, layout.queuePanel.h + 16, 8, 'rgba(255, 252, 246, 0.9)');
    strokeRound(c, layout.queuePanel.x - 8, layout.queuePanel.y - 8, layout.queuePanel.w + 16, layout.queuePanel.h + 16, 8, '#E7D8C0');
    c.fillStyle = '#2B2B33';
    c.font = '900 13px "PingFang SC", "Microsoft YaHei", system-ui, sans-serif';
    c.textAlign = 'center';
    c.fillText(`排队 ${ctx.state.queue.length}/${ctx.state.queueCapacity}`, layout.queuePanel.x + layout.queuePanel.w / 2, layout.queuePanel.y + 18);
  }

  function drawCustomerBust(x: number, y: number, radius: number, mood: Mood, name: string): void {
    const c = ctx.ctx2d;
    c.save();
    c.shadowColor = 'rgba(43, 43, 51, 0.18)';
    c.shadowBlur = 8;
    c.shadowOffsetY = 3;
    c.fillStyle = moodColor(mood);
    c.beginPath();
    c.arc(x, y, radius, 0, TAU);
    c.fill();
    c.shadowColor = 'transparent';
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
    const ratio = item.customer.patience / Math.max(1, item.customer.maxPatience);
    fillRound(c, item.x, item.y, item.w, item.h, 8, '#FFFFFF');
    strokeRound(c, item.x, item.y, item.w, item.h, 8, '#E7D8C0');
    drawCustomerBust(item.x + 22, item.y + item.h / 2, 15, item.customer.mood, customerName(ctx, item.customer.defId));
    c.fillStyle = '#2B2B33';
    c.font = '900 11px "PingFang SC", "Microsoft YaHei", system-ui, sans-serif';
    c.textAlign = 'left';
    c.textBaseline = 'alphabetic';
    c.fillText(customerName(ctx, item.customer.defId), item.x + 44, item.y + 22, Math.max(26, item.w - 48));
    const meterW = Math.max(24, item.w - 56);
    fillRound(c, item.x + 44, item.y + item.h - 18, meterW, 7, 3, '#EFEAE2');
    fillRound(c, item.x + 44, item.y + item.h - 18, meterW * clamp01(ratio), 7, 3, moodColor(item.customer.mood));
  }

  function drawPhone(phone: PhoneLayout): void {
    const c = ctx.ctx2d;
    const customerDef = ctx.content.customers.find((item) => item.id === phone.customer.defId);
    c.save();
    c.shadowColor = 'rgba(43, 43, 51, 0.24)';
    c.shadowBlur = 24;
    c.shadowOffsetY = 12;
    fillRound(c, phone.x, phone.y, phone.w, phone.h, phone.w * 0.12, '#25252D');
    c.shadowColor = 'transparent';

    const glass = c.createLinearGradient(phone.screenX, phone.screenY, phone.screenX + phone.screenW, phone.screenY + phone.screenH);
    glass.addColorStop(0, '#F9FCFF');
    glass.addColorStop(0.52, '#EEF6FF');
    glass.addColorStop(1, '#FFFFFF');
    fillRound(c, phone.screenX, phone.screenY, phone.screenW, phone.screenH, phone.w * 0.065, glass);
    strokeRound(c, phone.screenX, phone.screenY, phone.screenW, phone.screenH, phone.w * 0.065, 'rgba(255,255,255,0.5)');

    fillRound(c, phone.x + phone.w * 0.38, phone.y + phone.h * 0.035, phone.w * 0.24, 5, 3, '#4A4A57');
    fillRound(c, phone.screenX + 12, phone.screenY + 11, 30, 11, 6, 'rgba(43,43,51,0.08)');
    c.fillStyle = '#5B6372';
    c.font = `800 ${Math.max(8, phone.w * 0.035)}px Inter, system-ui, sans-serif`;
    c.textAlign = 'left';
    c.textBaseline = 'middle';
    c.fillText('9:41', phone.screenX + 18, phone.screenY + 16);

    c.fillStyle = '#2B2B33';
    c.font = `900 ${Math.max(12, phone.w * 0.043)}px "PingFang SC", "Microsoft YaHei", system-ui, sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'alphabetic';
    c.fillText(customerDef?.name ?? '顾客', phone.x + phone.w / 2, phone.y - 11);

    for (const icon of phone.icons) {
      drawIcon(icon);
    }

    fillRound(c, phone.x + phone.w * 0.39, phone.y + phone.h * 0.925, phone.w * 0.22, 5, 3, '#E9EEF9');

    c.font = `900 ${Math.max(10, phone.w * 0.04)}px "PingFang SC", "Microsoft YaHei", system-ui, sans-serif`;
    c.fillStyle = phone.customer.phone.badgeTotal > 0 ? '#6E6A73' : '#26A68F';
    c.fillText(phone.customer.phone.badgeTotal > 0 ? `剩余 ${phone.customer.phone.badgeTotal}` : '已清空', phone.x + phone.w / 2, phone.y + phone.h - 15);
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

  function drawIcon(icon: IconLayout): void {
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
      fillRound(c, left, top, icon.size, icon.size, icon.size * 0.24, gradient);
      c.shadowColor = 'transparent';
      strokeRound(c, left + 0.7, top + 0.7, icon.size - 1.4, icon.size - 1.4, icon.size * 0.23, 'rgba(255,255,255,0.38)', 1.2);
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

  function drawSwipeHint(layout: GameLayout): void {
    const phone = layout.phoneLayouts.find((item) => item.customer.phone.badgeTotal > 0) ?? layout.phoneLayouts[0];
    if (!phone) {
      return;
    }
    const c = ctx.ctx2d;
    const beat = (Math.sin(pulseTime * 0.006) + 1) / 2;
    const label = phone.screenW < 136 ? '按住滑动' : '按住拖动，整排清理';
    const pillW = Math.min(phone.screenW - 12, phone.screenW < 136 ? 92 : 168);
    const pillX = phone.screenX + (phone.screenW - pillW) / 2;
    const pillY = phone.screenY + Math.max(28, phone.screenH * 0.13);

    c.save();
    c.globalAlpha = ctx.state.totalCleared < 160 ? 0.92 : 0.62;
    fillRound(c, pillX, pillY, pillW, 28, 14, 'rgba(255,255,255,0.86)');
    strokeRound(c, pillX, pillY, pillW, 28, 14, '#DDE8F6');
    c.fillStyle = '#305C9C';
    c.font = `900 ${phone.screenW < 136 ? 10 : 12}px "PingFang SC", "Microsoft YaHei", system-ui, sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(label, pillX + pillW / 2, pillY + 14, pillW - 12);

    const y = phone.screenY + phone.screenH * 0.48;
    const startX = phone.screenX + phone.screenW * 0.25;
    const endX = phone.screenX + phone.screenW * 0.75;
    c.strokeStyle = `rgba(91, 141, 239, ${0.42 + beat * 0.28})`;
    c.lineWidth = Math.max(2, phone.w * 0.012);
    c.setLineDash([7, 8]);
    c.beginPath();
    c.moveTo(startX, y);
    c.quadraticCurveTo(phone.screenX + phone.screenW / 2, y - phone.screenH * 0.14, endX, y);
    c.stroke();
    c.setLineDash([]);

    const dotX = startX + (endX - startX) * beat;
    const dotY = y - Math.sin(beat * Math.PI) * phone.screenH * 0.12;
    c.fillStyle = '#FF9F43';
    c.beginPath();
    c.arc(dotX, dotY, 5 + beat * 3, 0, TAU);
    c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.9)';
    c.lineWidth = 2;
    c.stroke();
    c.restore();
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

    const shakeRatio = clamp01(shakeMs / 520);
    const shakeX = Math.sin(pulseTime * 0.072) * shakeAmp * shakeRatio + Math.sin(pulseTime * 0.117) * shakeAmp * 0.45 * shakeRatio;
    const shakeY = Math.cos(pulseTime * 0.085) * shakeAmp * shakeRatio;

    c.save();
    c.translate(shakeX, shakeY);
    drawBackground(layout);
    for (const queueItem of layout.queueLayouts) {
      drawQueueItem(queueItem);
    }
    for (const phone of layout.phoneLayouts) {
      drawPhone(phone);
    }
    drawEmptyState(layout);
    drawSwipeDots();
    drawSparks();
    drawEffects();
    c.restore();

    drawSwipeHint(layout);
    drawComboOverlay(layout);
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
        spawnBurst(ctx.canvas.clientWidth / 2, 136, '#26C6A6', 28, 1.2);
        addShake(220, 2.4);
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
