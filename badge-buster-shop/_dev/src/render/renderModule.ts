import { computeGameLayout, type GameLayout, type IconLayout, type PhoneLayout, type QueueLayout } from '../shared/layout';
import type { AppIconDef } from '../types/content.types';
import type { GameContext, GameModule } from '../types/module.types';
import type { Mood } from '../types/state.types';

const TAU = Math.PI * 2;

interface VisualEffect {
  kind: 'pop' | 'return' | 'level' | 'leave' | 'skill' | 'combo' | 'smash';
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
  const system: PhoneSystem = model === 'island' || model === 'notch' ? 'ios' : 'android';
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
    const stageW = Math.max(0, w - layout.uiReserve);
    const bg = c.createLinearGradient(0, 0, w, h);
    bg.addColorStop(0, '#EAF4FF');
    bg.addColorStop(0.5, '#FFF7EC');
    bg.addColorStop(1, '#EAF8F2');
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

    c.save();
    c.globalAlpha = 0.95;
    fillRound(c, layout.playArea.x + 8, 82, Math.max(160, stageW - layout.playArea.x - 36), 42, 8, 'rgba(255,255,255,0.58)');
    strokeRound(c, layout.playArea.x + 8, 82, Math.max(160, stageW - layout.playArea.x - 36), 42, 8, 'rgba(91,141,239,0.18)');
    c.fillStyle = '#315779';
    c.font = '900 13px "PingFang SC", "Microsoft YaHei", system-ui, sans-serif';
    c.textAlign = 'left';
    c.fillText('今日柜台：快速清理 · 手机焕新', layout.playArea.x + 24, 108);

    const shelfX = Math.max(16, layout.queuePanel.x + layout.queuePanel.w + 18);
    const shelfY = h - layout.bottomReserve - 132;
    if (shelfY > 150) {
      fillRound(c, shelfX, shelfY, Math.max(220, stageW - shelfX - 26), 13, 6, '#C99A5B');
      for (let index = 0; index < 8; index += 1) {
        const itemX = shelfX + 18 + index * 42;
        if (itemX > stageW - 40) break;
        const color = index % 3 === 0 ? '#5B8DEF' : index % 3 === 1 ? '#26C6A6' : '#FF9F43';
        fillRound(c, itemX, shelfY - 28 - (index % 2) * 7, 22, 30 + (index % 2) * 7, 4, alphaColor(color, 0.74));
        fillRound(c, itemX + 5, shelfY - 20 - (index % 2) * 7, 12, 4, 2, 'rgba(255,255,255,0.56)');
      }
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

    const counterY = h - layout.bottomReserve - 86;
    if (counterY > 88) {
      const counter = c.createLinearGradient(0, counterY, 0, counterY + 108);
      counter.addColorStop(0, '#D6B37A');
      counter.addColorStop(0.18, '#F4D6A3');
      counter.addColorStop(1, '#B77845');
      c.fillStyle = counter;
      c.fillRect(0, counterY, stageW, 108);
      c.fillStyle = '#8B5A2B';
      c.fillRect(0, counterY, stageW, 6);
      c.fillStyle = 'rgba(255,255,255,0.38)';
      c.fillRect(0, counterY + 12, stageW, 2);
      for (let x = 18; x < stageW; x += 92) {
        c.fillStyle = 'rgba(93, 55, 29, 0.12)';
        c.fillRect(x, counterY + 24, 2, 68);
      }
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

    for (const icon of phone.icons) {
      drawIcon(icon, skin);
    }

    c.font = `900 ${Math.max(10, phone.w * 0.04)}px "PingFang SC", "Microsoft YaHei", system-ui, sans-serif`;
    c.fillStyle = phone.customer.phone.badgeTotal > 0 ? '#F8FAFC' : '#C7F9CC';
    c.shadowColor = 'rgba(0,0,0,0.35)';
    c.shadowBlur = 4;
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

  function drawSwipeHint(layout: GameLayout): void {
    const phone = layout.phoneLayouts.find((item) => item.customer.phone.badgeTotal > 0) ?? layout.phoneLayouts[0];
    if (!phone) {
      return;
    }
    const c = ctx.ctx2d;
    const beat = (Math.sin(pulseTime * 0.006) + 1) / 2;
    const swipeEnabled = ctx.state.derived.swipeEnabled;
    if ((swipeEnabled && ctx.state.totalCleared > 180) || (!swipeEnabled && ctx.state.totalCleared > 36)) {
      return;
    }
    const label = swipeEnabled ? (phone.screenW < 136 ? '按住滑动' : '按住拖过红角标') : phone.screenW < 136 ? '点红角标' : '先点掉红色角标';
    const pillW = Math.min(phone.screenW - 12, phone.screenW < 136 ? 92 : 168);
    const pillX = phone.screenX + (phone.screenW - pillW) / 2;
    const pillY = phone.screenY + Math.max(28, phone.screenH * 0.13);

    c.save();
    c.globalAlpha = ctx.state.totalCleared < 160 ? 0.92 : 0.62;
    fillRound(c, pillX, pillY, pillW, 28, 14, 'rgba(255,255,255,0.86)');
    strokeRound(c, pillX, pillY, pillW, 28, 14, '#DDE8F6');
    c.fillStyle = swipeEnabled ? '#305C9C' : '#8A3E00';
    c.font = `900 ${phone.screenW < 136 ? 10 : 12}px "PingFang SC", "Microsoft YaHei", system-ui, sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(label, pillX + pillW / 2, pillY + 14, pillW - 12);

    const y = phone.screenY + phone.screenH * 0.48;
    const startX = phone.screenX + phone.screenW * 0.25;
    const endX = phone.screenX + phone.screenW * 0.75;
    c.strokeStyle = swipeEnabled ? `rgba(91, 141, 239, ${0.42 + beat * 0.28})` : `rgba(255, 159, 67, ${0.4 + beat * 0.28})`;
    c.lineWidth = Math.max(2, phone.w * 0.012);
    if (swipeEnabled) {
      c.setLineDash([7, 8]);
      c.beginPath();
      c.moveTo(startX, y);
      c.quadraticCurveTo(phone.screenX + phone.screenW / 2, y - phone.screenH * 0.14, endX, y);
      c.stroke();
      c.setLineDash([]);
    }

    const dotX = swipeEnabled ? startX + (endX - startX) * beat : phone.screenX + phone.screenW * 0.5;
    const dotY = swipeEnabled ? y - Math.sin(beat * Math.PI) * phone.screenH * 0.12 : y;
    c.fillStyle = '#FF9F43';
    c.beginPath();
    c.arc(dotX, dotY, 5 + beat * 3, 0, TAU);
    c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.9)';
    c.lineWidth = 2;
    c.stroke();
    c.restore();
  }

  function drawTutorialCoach(layout: GameLayout): void {
    const phone = layout.phoneLayouts.find((item) => item.customer.phone.badgeTotal > 0);
    const target = phone?.icons.find((item) => item.icon.badge > 0);
    if (!phone || !target) {
      return;
    }
    const swipeEnabled = ctx.state.derived.swipeEnabled;
    if ((swipeEnabled && ctx.state.totalCleared > 120) || (!swipeEnabled && ctx.state.totalCleared > 18)) {
      return;
    }
    const c = ctx.ctx2d;
    const beat = (Math.sin(pulseTime * 0.008) + 1) / 2;
    const label = swipeEnabled ? '按住划过红角标' : '点这里清掉角标';
    const sub = swipeEnabled ? '拖过一串角标会连清' : '先从红色数字开始';
    const boxW = Math.min(176, Math.max(126, phone.screenW * 0.82));
    const boxH = 54;
    const boxX = clamp(target.badgeX - boxW * 0.5, phone.screenX + 6, phone.screenX + phone.screenW - boxW - 6);
    const boxY = Math.max(phone.screenY + 34, target.badgeY - 78);

    c.save();
    c.globalAlpha = 0.96;
    fillRound(c, boxX, boxY, boxW, boxH, 10, 'rgba(255,255,255,0.92)');
    strokeRound(c, boxX, boxY, boxW, boxH, 10, swipeEnabled ? '#5B8DEF' : '#FF9F43', 2);
    c.fillStyle = '#2B2B33';
    c.font = '900 13px "PingFang SC", "Microsoft YaHei", system-ui, sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'alphabetic';
    c.fillText(label, boxX + boxW / 2, boxY + 22, boxW - 14);
    c.fillStyle = '#6E6A73';
    c.font = '800 10px "PingFang SC", "Microsoft YaHei", system-ui, sans-serif';
    c.fillText(sub, boxX + boxW / 2, boxY + 39, boxW - 14);

    c.strokeStyle = swipeEnabled ? 'rgba(91,141,239,0.86)' : 'rgba(255,159,67,0.9)';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(boxX + boxW / 2, boxY + boxH);
    c.quadraticCurveTo(target.badgeX - 18, target.badgeY - 24, target.badgeX, target.badgeY - 9);
    c.stroke();

    c.strokeStyle = swipeEnabled ? 'rgba(91,141,239,0.5)' : 'rgba(255,159,67,0.55)';
    c.lineWidth = 3;
    c.beginPath();
    c.arc(target.badgeX, target.badgeY, 18 + beat * 9, 0, TAU);
    c.stroke();
    c.fillStyle = swipeEnabled ? 'rgba(91,141,239,0.2)' : 'rgba(255,159,67,0.22)';
    c.beginPath();
    c.arc(target.badgeX, target.badgeY, 8 + beat * 5, 0, TAU);
    c.fill();
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
    drawTutorialCoach(layout);
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
      ctx.bus.on('PHONE_SMASHED', (event) => {
        effects.push({ kind: 'smash', x: event.x, y: event.y, age: 0, ttl: 1050, label: `砸出 ${event.totalBadges}`, color: '#FF3B30', power: 1.7 });
        spawnBurst(event.x, event.y, '#FF3B30', 46 + Math.min(44, event.iconCount * 5), 2);
        spawnBurst(event.x, event.y, '#FFD166', 28 + Math.min(34, event.totalBadges), 1.6);
        spawnBurst(event.x, event.y, '#5B8DEF', 18 + Math.min(28, event.iconCount * 3), 1.3);
        addShake(760, 10);
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
