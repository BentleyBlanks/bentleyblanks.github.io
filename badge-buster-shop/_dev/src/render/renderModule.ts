import {
  MALWARE_LAG_THRESHOLD,
  MALWARE_MAX,
  MALWARE_PROMPT_THRESHOLD,
  REPAIR_CLOSE_MS,
  REPAIR_OPEN_MS,
  REPAIR_WORK_MS,
  maxUnlockedTier,
  repairProfit,
  repairServiceDef,
  shopRankName,
  TIMED_CLOSE_MS,
  upgradeCost,
  upgradeUnlockLevel,
} from '../content/balance';
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
import { computeRepairLayout } from '../shared/repairLayout';
import { computeUiLayout, type Rect, type UiLayout } from '../shared/uiLayout';
import type { AppIconDef } from '../types/content.types';
import type { GameContext, GameModule } from '../types/module.types';
import type { Mood, RepairKind } from '../types/state.types';

function formatMoney(value: number): string {
  if (value >= 100_000_000) return `${(value / 100_000_000).toFixed(1)}亿`;
  if (value >= 10_000) return `${(value / 10_000).toFixed(1)}万`;
  return String(Math.floor(value));
}

const TAU = Math.PI * 2;
const NOTIF_SWEEP_MS = 620; // 下拉通知"卷帘"仪式时长

interface VisualEffect {
  kind: 'pop' | 'return' | 'level' | 'leave' | 'skill' | 'combo' | 'smash' | 'task' | 'delivery';
  x: number;
  y: number;
  age: number;
  ttl: number;
  label: string;
  color: string;
  power: number;
  mood?: Mood; // delivery 横幅用：满意度星级
}

interface Coin {
  x: number;
  y: number;
  vx: number;
  vy: number;
  tx: number; // 目标：HUD 钱袋
  ty: number;
  age: number;
  ttl: number;
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

// —————————— 工坊拟物质感（程序化绘制：木 / 拉丝金属 / 黄铜 / 雕刻字）——————————
function woodPanel(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, top = '#6E4A2A', bottom = '#43301C'): void {
  const g = c.createLinearGradient(x, y, x, y + h);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  fillRound(c, x, y, w, h, r, g);
  c.save();
  roundedRect(c, x, y, w, h, r);
  c.clip();
  c.globalAlpha = 0.12;
  c.strokeStyle = '#241404';
  c.lineWidth = 1;
  for (let yy = y + 4; yy < y + h; yy += 6) {
    c.beginPath();
    c.moveTo(x, yy + Math.sin(yy * 0.35) * 1.4);
    c.bezierCurveTo(x + w * 0.32, yy + 1.8, x + w * 0.62, yy - 1.8, x + w, yy + Math.cos(yy * 0.22) * 1.4);
    c.stroke();
  }
  c.restore();
  strokeRound(c, x + 1, y + 1, w - 2, h - 2, r, 'rgba(255,214,160,0.16)', 1);
  strokeRound(c, x, y, w, h, r, 'rgba(20,12,5,0.55)', 1.2);
}

function metalPlate(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, pressed = false, tint?: string): void {
  const g = c.createLinearGradient(x, y, x, y + h);
  if (pressed) {
    g.addColorStop(0, '#79818D');
    g.addColorStop(1, '#A4ACB8');
  } else {
    g.addColorStop(0, tint ?? '#DCE1E9');
    g.addColorStop(0.5, '#A6AEBB');
    g.addColorStop(1, '#7B828F');
  }
  fillRound(c, x, y, w, h, r, g);
  strokeRound(c, x + 1.2, y + 1.2, w - 2.4, h - 2.4, r, pressed ? 'rgba(0,0,0,0.32)' : 'rgba(255,255,255,0.72)', 1.4);
  strokeRound(c, x, y, w, h, r, 'rgba(28,34,42,0.6)', 1.2);
}

function brassPlate(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const g = c.createLinearGradient(x, y, x, y + h);
  g.addColorStop(0, '#FCE7A4');
  g.addColorStop(0.5, '#E7B748');
  g.addColorStop(1, '#A8780E');
  fillRound(c, x, y, w, h, r, g);
  strokeRound(c, x + 1.2, y + 1.2, w - 2.4, h - 2.4, r, 'rgba(255,250,210,0.7)', 1.2);
  strokeRound(c, x, y, w, h, r, 'rgba(86,58,6,0.6)', 1.3);
}

function engraveText(c: CanvasRenderingContext2D, text: string, x: number, y: number, font: string, color: string, align: CanvasTextAlign = 'center', maxW?: number): void {
  c.font = font;
  c.textAlign = align;
  c.textBaseline = 'middle';
  c.fillStyle = 'rgba(255,255,255,0.22)';
  c.fillText(text, x, y + 1, maxW);
  c.fillStyle = color;
  c.fillText(text, x, y, maxW);
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
  const notifSweeps: Array<{ customerId: string; age: number; count: number }> = []; // 下拉通知卷帘仪式
  const coins: Coin[] = []; // 交付时飞向钱袋的金币（#3）
  const deliveredInfo = new Map<string, { payout: number; xp: number; mood: Mood }>(); // 待离场手机的交付信息
  const images = new Map<string, HTMLImageElement>();
  // —— 手机进出场动画（#2）——
  const phoneAnims = new Map<string, { x: number; y: number; alpha: number }>();
  const departing: Array<{ layout: PhoneLayout; age: number; ttl: number; delivered?: { payout: number; mood: Mood } }> = [];
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

    // 注：原先 iOS"程序化 Dock 半透明白条"画在 0.82*screenH，与最下行图标重叠 → 看起来"被遮住/错位"，已移除。
    // Android 顶部搜索框移到状态栏带内、且仅在没有通知时画，避免和通知条打架。
    if (skin.system === 'android' && phone.customer.phone.notifications <= 0) {
      c.globalAlpha = 0.2;
      fillRound(c, phone.screenX + phone.screenW * 0.12, phone.screenY + phone.screenH * 0.075, phone.screenW * 0.76, Math.max(13, phone.screenH * 0.05), 99, '#FFFFFF');
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
    // 静态把手（之前会"呼吸"上下跳，反而让人以为拉不动/自己弹上去 #5）
    const h = Math.max(20, bar.h * 0.5);
    const w = bar.w * 0.7;
    const x = bar.x + (bar.w - w) / 2;
    const y = bar.y + bar.h * 0.16;

    c.save();
    // 通知"卷帘"把手：上缘贴住屏顶，下缘圆角，像可以被往下拽
    c.shadowColor = 'rgba(0,0,0,0.35)';
    c.shadowBlur = 10;
    c.shadowOffsetY = 3;
    const g = c.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, 'rgba(28, 38, 58, 0.96)');
    g.addColorStop(1, 'rgba(14, 20, 34, 0.96)');
    fillRound(c, x, y, w, h, h * 0.42, g);
    c.shadowColor = 'transparent';
    strokeRound(c, x, y, w, h, h * 0.42, 'rgba(255,159,67,0.6)', 1.2);

    // 顶部"抓手"短横条（grabber）
    c.fillStyle = 'rgba(255,255,255,0.5)';
    fillRound(c, x + w / 2 - w * 0.1, y + h * 0.16, w * 0.2, Math.max(2, h * 0.07), 99, 'rgba(255,255,255,0.5)');

    // 文案 + 件数胶囊
    c.fillStyle = '#FFE9CF';
    c.font = `900 ${Math.max(9, phone.w * 0.032)}px "PingFang SC", "Microsoft YaHei", system-ui, sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('点我 / 下拉清理', x + w / 2, y + h * 0.52, w * 0.7);

    // 数量徽标（左侧）
    const badgeR = h * 0.2;
    const bx = x + h * 0.42;
    const by = y + h * 0.52;
    c.fillStyle = '#FF3B30';
    c.beginPath();
    c.arc(bx, by, badgeR, 0, TAU);
    c.fill();
    c.fillStyle = '#FFFFFF';
    c.font = `900 ${Math.max(8, badgeR * 1.05)}px Inter, system-ui, sans-serif`;
    c.fillText(String(runtime.notifications), bx, by + 0.5);

    // 静态下拉箭头 ▾（右侧）
    const ax = x + w - h * 0.42;
    const ay = y + h * 0.5;
    c.strokeStyle = '#FF9F43';
    c.lineWidth = Math.max(2, h * 0.09);
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.beginPath();
    c.moveTo(ax - h * 0.16, ay - h * 0.06);
    c.lineTo(ax, ay + h * 0.1);
    c.lineTo(ax + h * 0.16, ay - h * 0.06);
    c.stroke();
    c.restore();
  }

  // 下拉清理通知的"卷帘"仪式：深色通知面板从屏顶滑下，几张通知卡被一道亮光扫掉后收起
  function drawNotifSweep(phone: PhoneLayout): void {
    const c = ctx.ctx2d;
    for (const sweep of notifSweeps) {
      if (sweep.customerId !== phone.customer.id) continue;
      const t = clamp01(sweep.age / NOTIF_SWEEP_MS);
      // 卷帘下探(0..0.45)→停留+扫光(0.45..0.72)→收起(0.72..1)
      const drop = t < 0.72 ? Math.min(1, t / 0.45) : 1 - (t - 0.72) / 0.28;
      const shadeH = phone.screenH * 0.6 * clamp01(drop);
      if (shadeH <= 1) continue;
      c.save();
      roundedRect(c, phone.screenX, phone.screenY, phone.screenW, phone.screenH, phone.w * 0.06);
      c.clip();
      // 卷帘面板
      const g = c.createLinearGradient(phone.screenX, phone.screenY, phone.screenX, phone.screenY + shadeH);
      g.addColorStop(0, 'rgba(10, 14, 26, 0.96)');
      g.addColorStop(1, 'rgba(16, 24, 42, 0.86)');
      fillRound(c, phone.screenX, phone.screenY - phone.screenH * 0.04, phone.screenW, shadeH + phone.screenH * 0.04, phone.w * 0.05, g);
      // 通知卡：被"扫光"线扫过后向上飞散淡出
      const cards = Math.max(1, Math.min(4, sweep.count));
      const sweepY = phone.screenY + shadeH * (0.2 + 0.9 * clamp01((t - 0.4) / 0.36));
      const cardW = phone.screenW * 0.84;
      const cardX = phone.screenX + phone.screenW * 0.08;
      const cardH = phone.screenH * 0.082;
      for (let i = 0; i < cards; i += 1) {
        const baseY = phone.screenY + phone.screenH * (0.07 + i * 0.11);
        const wiped = baseY < sweepY; // 已被扫光线扫过
        const fly = wiped ? clamp01((sweepY - baseY) / (phone.screenH * 0.2)) : 0;
        c.globalAlpha = (1 - fly) * Math.min(1, drop * 1.4);
        if (c.globalAlpha <= 0.02) continue;
        fillRound(c, cardX, baseY - fly * phone.screenH * 0.12, cardW, cardH, cardH * 0.3, 'rgba(40, 52, 78, 0.96)');
        c.fillStyle = '#FF9F43';
        c.beginPath();
        c.arc(cardX + cardH * 0.6, baseY - fly * phone.screenH * 0.12 + cardH * 0.5, cardH * 0.22, 0, TAU);
        c.fill();
        c.fillStyle = 'rgba(230,238,250,0.9)';
        fillRound(c, cardX + cardH * 1.1, baseY - fly * phone.screenH * 0.12 + cardH * 0.28, cardW * 0.5, cardH * 0.16, 2, 'rgba(230,238,250,0.7)');
        fillRound(c, cardX + cardH * 1.1, baseY - fly * phone.screenH * 0.12 + cardH * 0.58, cardW * 0.32, cardH * 0.14, 2, 'rgba(190,205,230,0.5)');
      }
      c.globalAlpha = 1;
      // 扫光亮线
      if (t > 0.4 && t < 0.78) {
        c.fillStyle = 'rgba(255, 214, 102, 0.9)';
        c.fillRect(phone.screenX, sweepY - 2, phone.screenW, 3);
        c.fillStyle = 'rgba(255, 214, 102, 0.25)';
        c.fillRect(phone.screenX, sweepY - 14, phone.screenW, 12);
      }
      c.restore();
    }
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

  // ———————————— 维修系统（#4）渲染 ————————————
  const FF = '"PingFang SC", "Microsoft YaHei", system-ui, sans-serif';

  function drawScrew(c: CanvasRenderingContext2D, x: number, y: number, rad: number, ang: number): void {
    c.save();
    c.translate(x, y);
    c.fillStyle = '#C2CBD8';
    c.beginPath();
    c.arc(0, 0, rad, 0, TAU);
    c.fill();
    c.strokeStyle = '#6B7686';
    c.lineWidth = Math.max(1, rad * 0.28);
    c.beginPath();
    c.arc(0, 0, rad, 0, TAU);
    c.stroke();
    c.rotate(ang);
    c.strokeStyle = '#566072';
    c.lineWidth = Math.max(1.4, rad * 0.34);
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(-rad * 0.6, 0);
    c.lineTo(rad * 0.6, 0);
    c.stroke();
    c.restore();
  }

  function drawProgressRing(c: CanvasRenderingContext2D, x: number, y: number, radius: number, p: number, color: string): void {
    c.save();
    c.lineWidth = Math.max(3, radius * 0.26);
    c.strokeStyle = 'rgba(255,255,255,0.16)';
    c.beginPath();
    c.arc(x, y, radius, 0, TAU);
    c.stroke();
    c.strokeStyle = color;
    c.lineCap = 'round';
    c.beginPath();
    c.arc(x, y, radius, -Math.PI / 2, -Math.PI / 2 + TAU * clamp01(p));
    c.stroke();
    c.restore();
  }

  // 施工阶段的工种特效（屏幕坐标 sx/sy/sw/sh，p=本阶段进度）
  function drawRepairWork(c: CanvasRenderingContext2D, kind: RepairKind, sx: number, sy: number, sw: number, sh: number, p: number): void {
    const midY = sy + sh * 0.44;
    if (kind === 'dust') {
      const bx = sx + sw * (0.22 + 0.56 * (Math.sin(p * Math.PI * 3) * 0.5 + 0.5));
      c.save();
      c.strokeStyle = '#FFD166';
      c.lineWidth = 2;
      for (let i = 0; i < 5; i += 1) {
        c.beginPath();
        c.moveTo(bx - sw * 0.06 + i * sw * 0.03, midY + sh * 0.02);
        c.lineTo(bx - sw * 0.06 + i * sw * 0.03, midY + sh * 0.08);
        c.stroke();
      }
      fillRound(c, bx - sw * 0.07, midY - sh * 0.04, sw * 0.14, sh * 0.06, 4, '#8B5A2B');
      c.fillStyle = 'rgba(210,200,180,0.85)';
      for (let i = 0; i < 8; i += 1) {
        const a = p * 8 + i;
        c.beginPath();
        c.arc(bx + Math.cos(a) * sw * 0.12, midY + sh * 0.1 + Math.sin(a * 1.7) * sh * 0.05, 1.6, 0, TAU);
        c.fill();
      }
      c.restore();
    } else if (kind === 'film') {
      const filmTop = sy + sh * 0.18;
      const filmH = sh * 0.46 * p;
      c.save();
      c.fillStyle = 'rgba(120, 200, 255, 0.22)';
      fillRound(c, sx + sw * 0.18, filmTop, sw * 0.64, Math.max(1, filmH), 8, 'rgba(120,200,255,0.22)');
      c.strokeStyle = 'rgba(150,220,255,0.7)';
      c.lineWidth = 2;
      c.strokeRect(sx + sw * 0.18, filmTop, sw * 0.64, Math.max(1, filmH));
      // 刮板扫过
      const sqY = filmTop + filmH;
      c.fillStyle = '#EAF4FF';
      fillRound(c, sx + sw * 0.16, sqY - 3, sw * 0.68, 6, 3, '#EAF4FF');
      c.restore();
    } else if (kind === 'case') {
      const inset = (1 - p) * sw * 0.22;
      c.save();
      c.strokeStyle = '#26C6A6';
      c.lineWidth = Math.max(4, sw * 0.04);
      strokeRound(c, sx + sw * 0.12 - inset * 0.2 + inset, sy + sh * 0.16 + inset, sw * 0.76 - inset * 2, sh * 0.52 - inset * 2, 16, '#26C6A6', Math.max(4, sw * 0.04));
      c.restore();
    } else {
      // battery：旧电池(红)滑出右侧，新电池(绿)从左滑入
      c.save();
      const oldX = sx + sw * (0.3 + p * 0.5);
      const newX = sx + sw * (-0.1 + p * 0.4);
      fillRound(c, oldX, midY - sh * 0.06, sw * 0.22, sh * 0.12, 4, alphaColor('#FF3B30', 1 - p));
      fillRound(c, newX, midY - sh * 0.06, sw * 0.22, sh * 0.12, 4, alphaColor('#26C6A6', Math.min(1, p + 0.3)));
      c.fillStyle = '#0A0E18';
      fillRound(c, newX + sw * 0.22, midY - sh * 0.02, sw * 0.02, sh * 0.04, 1, '#0A0E18');
      c.restore();
    }
  }

  // 维修台阶段：在手机屏幕上叠加拆机/施工/装回仪式（或待操作提示）
  function drawRepairCeremony(phone: PhoneLayout): void {
    const runtime = phone.customer.phone;
    if (!runtime.awaitingDelivery) return;
    const c = ctx.ctx2d;
    const r = runtime.repair;
    const sx = phone.screenX;
    const sy = phone.screenY;
    const sw = phone.screenW;
    const sh = phone.screenH;
    const cx = sx + sw / 2;
    c.save();
    roundedRect(c, sx, sy, sw, sh, phone.w * 0.06);
    c.clip();
    c.fillStyle = 'rgba(8, 14, 24, 0.6)';
    c.fillRect(sx, sy, sw, sh);

    if (r.activeKind) {
      const def = repairServiceDef(r.activeKind);
      const dur = r.stage === 'open' ? REPAIR_OPEN_MS : r.stage === 'work' ? REPAIR_WORK_MS : REPAIR_CLOSE_MS;
      const p = clamp01(r.stageMs / dur);
      const lift = r.stage === 'open' ? p * sh * 0.14 : r.stage === 'close' ? (1 - p) * sh * 0.14 : sh * 0.14;
      // 背板
      fillRound(c, sx + sw * 0.14, sy + sh * 0.2 - lift, sw * 0.72, sh * 0.5, 12, 'rgba(46,58,82,0.92)');
      strokeRound(c, sx + sw * 0.14, sy + sh * 0.2 - lift, sw * 0.72, sh * 0.5, 12, 'rgba(150,170,200,0.5)', 1.5);
      // 四角螺丝
      const screwAng = (r.stage === 'open' ? p : r.stage === 'close' ? 1 - p : 1) * Math.PI * 3;
      for (const [dx, dy] of [[0.24, 0.27], [0.76, 0.27], [0.24, 0.63], [0.76, 0.63]]) {
        drawScrew(c, sx + sw * dx, sy + sh * dy - lift, Math.max(3, sw * 0.035), screwAng);
      }
      if (r.stage === 'work') drawRepairWork(c, r.activeKind, sx, sy, sw, sh, p);
      // 进度环 + 文案
      drawProgressRing(c, cx, sy + sh * 0.82, Math.min(sw, sh) * 0.07, p, '#26C6A6');
      const label = r.stage === 'open' ? '🔧 拆机中' : r.stage === 'close' ? '🔩 装回中' : `${def.emoji} ${def.name}中`;
      c.fillStyle = '#EAF4FF';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.font = `900 ${Math.max(10, sw * 0.055)}px ${FF}`;
      c.fillText(label, cx, sy + sh * 0.92);
    } else {
      c.fillStyle = '#EAF4FF';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.font = `900 ${Math.max(12, sw * 0.08)}px ${FF}`;
      c.fillText('🔧 维修台', cx, sy + sh * 0.4);
      c.fillStyle = 'rgba(220,230,245,0.82)';
      c.font = `800 ${Math.max(9, sw * 0.045)}px ${FF}`;
      c.fillText('下方选服务 · 修好点「交付」', cx, sy + sh * 0.5);
      // 已完成服务的小勾
      const doneList = r.services.filter((s) => s.done);
      if (doneList.length > 0) {
        c.fillStyle = '#9DE7C4';
        c.font = `800 ${Math.max(8, sw * 0.04)}px ${FF}`;
        c.fillText(`✓ ${doneList.map((s) => repairServiceDef(s.kind).name).join(' ')}`, cx, sy + sh * 0.6);
      }
    }
    c.restore();
  }

  // 底部维修台抽屉
  function drawRepairBench(): void {
    const c = ctx.ctx2d;
    const bench = computeRepairLayout(ctx.state, ctx.canvas.clientWidth, ctx.canvas.clientHeight);
    if (!bench.open || !bench.customer) return;
    const r = bench.customer.phone.repair;
    const tierOf = bench.customer.phone.tier;
    c.save();
    c.shadowColor = 'rgba(0,0,0,0.5)';
    c.shadowBlur = 20;
    c.shadowOffsetY = -6;
    woodPanel(c, bench.panel.x - 2, bench.panel.y, bench.panel.w + 4, bench.panel.h + 26, 16, '#5E3F23', '#362413');
    c.restore();
    // 黄铜上沿条 + 两端螺丝（像工作台金属包边）
    c.fillStyle = '#C8860B';
    c.fillRect(bench.panel.x, bench.panel.y + 2, bench.panel.w, 2);
    drawScrew(c, bench.panel.x + 12, bench.panel.y + 14, 3.2, 0.5);
    drawScrew(c, bench.panel.x + bench.panel.w - 12, bench.panel.y + 14, 3.2, 1.2);

    c.textBaseline = 'middle';
    c.textAlign = 'left';
    c.fillStyle = '#EAF4FF';
    c.font = `900 14px ${FF}`;
    c.fillText('🔧 维修台 · 修好再交付', bench.title.x, bench.title.y + bench.title.h / 2);
    c.textAlign = 'right';
    c.fillStyle = '#FFD166';
    c.font = `900 13px ${FF}`;
    c.fillText(`本台已赚 ¥${r.earned}`, bench.title.x + bench.title.w, bench.title.y + bench.title.h / 2);

    for (const tile of bench.tiles) {
      const def = repairServiceDef(tile.kind);
      const svc = r.services.find((s) => s.kind === tile.kind);
      const active = r.activeKind === tile.kind;
      const done = !!svc?.done;
      const b = tile.body;
      // 工作台上的"工具凹槽"：深色内陷 + 黄铜/状态描边
      fillRound(c, b.x, b.y, b.w, b.h, 10, done ? 'rgba(24,86,58,0.7)' : active ? 'rgba(34,72,116,0.85)' : 'rgba(22,15,8,0.66)');
      strokeRound(c, b.x + 1, b.y + 1, b.w - 2, b.h - 2, 9, 'rgba(0,0,0,0.4)', 1.4);
      strokeRound(c, b.x, b.y, b.w, b.h, 10, done ? '#1FB57A' : active ? '#5B8DEF' : 'rgba(200,134,11,0.5)', 1.3);
      const tcx = b.x + b.w / 2;
      const hasChip = !!tile.tierChip;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      // 图标
      c.fillStyle = '#FFFFFF';
      c.font = `${Math.max(14, b.w * 0.22)}px system-ui, sans-serif`;
      c.fillText(def.emoji, tcx, b.y + b.h * 0.19);
      // 名称
      c.fillStyle = '#EAF4FF';
      c.font = `900 12px ${FF}`;
      c.fillText(def.name, tcx, b.y + b.h * 0.41);
      // 状态/动作（与底部材料档 chip 错开，互不重叠）
      const lineY = b.y + b.h * 0.6;
      if (done) {
        c.fillStyle = '#9DE7C4';
        c.font = `800 11px ${FF}`;
        c.fillText('✓ 已完成', tcx, lineY);
      } else if (active) {
        const dur = r.stage === 'open' ? REPAIR_OPEN_MS : r.stage === 'work' ? REPAIR_WORK_MS : REPAIR_CLOSE_MS;
        const p = clamp01(r.stageMs / dur);
        const stageIdx = r.stage === 'open' ? 0 : r.stage === 'work' ? 1 : 2;
        const barW = b.w * 0.74;
        const barX = tcx - barW / 2;
        const barY = b.y + b.h * 0.55;
        fillRound(c, barX, barY, barW, 5, 2.5, 'rgba(0,0,0,0.4)');
        fillRound(c, barX, barY, barW * ((stageIdx + p) / 3), 5, 2.5, '#5B8DEF');
        c.fillStyle = '#CBE0FF';
        c.font = `800 10px ${FF}`;
        c.fillText((r.stage === 'open' ? '拆机' : r.stage === 'work' ? '施工' : '装回') + '中…', tcx, b.y + b.h * 0.72);
      } else if (!hasChip) {
        const profit = repairProfit(def, svc?.tier ?? 0, tierOf);
        c.fillStyle = '#FFD166';
        c.font = `900 12px ${FF}`;
        c.fillText(`施工 +¥${profit}`, tcx, lineY);
      } else {
        c.fillStyle = 'rgba(220,230,245,0.7)';
        c.font = `800 10px ${FF}`;
        c.fillText('点此施工', tcx, b.y + b.h * 0.58);
      }
      // 材料档 chip（贴膜/手机壳）：材料名 + 利润 + 可换标记
      if (tile.tierChip && svc) {
        const maxT = maxUnlockedTier(def, ctx.state.level);
        const profit = repairProfit(def, svc.tier, tierOf);
        const tc = tile.tierChip;
        fillRound(c, tc.x, tc.y, tc.w, tc.h, tc.h / 2, done ? 'rgba(0,0,0,0.22)' : 'rgba(91,141,239,0.36)');
        c.fillStyle = done ? 'rgba(200,220,250,0.5)' : '#DCE9FF';
        c.font = `800 10px ${FF}`;
        c.fillText(`${def.tiers[svc.tier].name} +¥${profit}${maxT > 0 ? ' ▸' : ''}`, tc.x + tc.w / 2, tc.y + tc.h / 2);
      }
    }

    if (bench.steal) {
      const on = r.steal;
      const s = bench.steal;
      fillRound(c, s.x, s.y, s.w, s.h, 10, on ? 'rgba(176,38,58,0.9)' : 'rgba(40,52,74,0.94)');
      strokeRound(c, s.x, s.y, s.w, s.h, 10, on ? '#FF6B81' : 'rgba(255,255,255,0.16)', 1.3);
      c.textAlign = 'left';
      c.fillStyle = on ? '#FFE3E8' : '#DCE6F5';
      c.font = `900 12px ${FF}`;
      c.fillText(on ? '😈 偷资料：开' : '😈 顺手牵羊', s.x + 10, s.y + s.h * 0.36);
      c.fillStyle = on ? 'rgba(255,222,228,0.85)' : 'rgba(200,215,235,0.62)';
      c.font = `700 10px ${FF}`;
      c.fillText(on ? '交付时见分晓 · 被抓掉信任' : '小概率发大财 / 被抓掉信任', s.x + 10, s.y + s.h * 0.72);
    }

    const dl = bench.deliver;
    const canDeliver = !r.activeKind;
    const g = c.createLinearGradient(dl.x, dl.y, dl.x, dl.y + dl.h);
    g.addColorStop(0, canDeliver ? '#2BD49B' : '#3A5060');
    g.addColorStop(1, canDeliver ? '#179B6F' : '#2A3A48');
    fillRound(c, dl.x, dl.y, dl.w, dl.h, 12, g);
    strokeRound(c, dl.x, dl.y, dl.w, dl.h, 12, 'rgba(255,255,255,0.4)', 1.5);
    c.textAlign = 'center';
    c.fillStyle = '#FFFFFF';
    c.font = `1000 16px ${FF}`;
    c.fillText(r.activeKind ? '施工中…' : '✓ 交付手机', dl.x + dl.w / 2, dl.y + dl.h * 0.4);
    c.fillStyle = 'rgba(255,255,255,0.86)';
    c.font = `800 11px ${FF}`;
    c.fillText(r.earned > 0 ? `含维修 ¥${r.earned}` : '可直接交付', dl.x + dl.w / 2, dl.y + dl.h * 0.74);
    c.restore();
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
        const info = deliveredInfo.get(id);
        // 交付走的手机用更长、更隆重的退场动画；其它（怒走/被砸）保持快退场
        departing.push({ layout: lay, age: 0, ttl: info ? 720 : 420, delivered: info ? { payout: info.payout, mood: info.mood } : undefined });
        departingIds.add(id);
        deliveredInfo.delete(id);
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
      if (departing[i].age >= departing[i].ttl) {
        departingIds.delete(departing[i].layout.customer.id);
        departing.splice(i, 1);
      }
    }
    lastLayouts = new Map(layout.phoneLayouts.map((p) => [p.customer.id, p]));
    // 清掉未被退场动画消费的交付信息（如非聚焦手机被自动清完），防止泄漏
    for (const id of [...deliveredInfo.keys()]) if (!lastLayouts.has(id)) deliveredInfo.delete(id);
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

  function drawDepartingPhone(dep: { layout: PhoneLayout; age: number; ttl: number; delivered?: { payout: number; mood: Mood } }): void {
    const c = ctx.ctx2d;
    const t = clamp01(dep.age / dep.ttl);
    const phone = dep.layout;
    c.save();
    if (dep.delivered) {
      // 交付：先弹一下(0..0.18)欢庆，再托起飞向顾客（向上+缩小+淡出）= 把手机"递还"
      const pop = t < 0.18 ? 1 + Math.sin((t / 0.18) * Math.PI) * 0.06 : 1 - (t - 0.18) / 0.82 * 0.32;
      const lift = t < 0.18 ? 0 : -Math.pow((t - 0.18) / 0.82, 1.7) * (phone.h * 0.5 + 70);
      const cxp = phone.x + phone.w / 2;
      const cyp = phone.y + phone.h / 2;
      c.globalAlpha = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
      c.translate(cxp, cyp + lift);
      c.scale(pop, pop);
      c.translate(-cxp, -cyp);
      drawPhone(phone);
      // 绿色"已交付"盖章 + 对勾，盖在屏幕中央，随弹跳放大
      const stampT = clamp01(t / 0.24);
      const sr = phone.screenW * 0.3 * (0.6 + stampT * 0.4);
      const sx = phone.screenX + phone.screenW / 2;
      const sy = phone.screenY + phone.screenH * 0.42;
      c.globalAlpha *= stampT;
      c.lineWidth = Math.max(3, sr * 0.16);
      c.strokeStyle = '#1FB57A';
      c.beginPath();
      c.arc(sx, sy, sr, 0, TAU);
      c.stroke();
      c.lineCap = 'round';
      c.lineJoin = 'round';
      c.beginPath();
      c.moveTo(sx - sr * 0.42, sy + sr * 0.02);
      c.lineTo(sx - sr * 0.1, sy + sr * 0.34);
      c.lineTo(sx + sr * 0.46, sy - sr * 0.34);
      c.stroke();
      c.fillStyle = '#1FB57A';
      c.font = `1000 ${Math.max(10, sr * 0.36)}px "PingFang SC", "Microsoft YaHei", system-ui, sans-serif`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText('已交付', sx, sy + sr * 0.78);
    } else {
      c.globalAlpha = (1 - t) * 0.92;
      c.translate(0, t * 80);
      drawPhone(phone);
    }
    c.restore();
  }

  // 交付金币飞向 HUD 钱袋
  function drawCoins(): void {
    if (coins.length === 0) return;
    const c = ctx.ctx2d;
    c.save();
    for (const coin of coins) {
      const t = clamp01(coin.age / coin.ttl);
      const r = 7 * (1 - t * 0.4);
      c.globalAlpha = t > 0.82 ? (1 - t) / 0.18 : 1;
      const g = c.createRadialGradient(coin.x - r * 0.3, coin.y - r * 0.3, r * 0.2, coin.x, coin.y, r);
      g.addColorStop(0, '#FFF1B8');
      g.addColorStop(1, '#F0A500');
      c.fillStyle = g;
      c.beginPath();
      c.arc(coin.x, coin.y, r, 0, TAU);
      c.fill();
      c.strokeStyle = 'rgba(180,120,0,0.7)';
      c.lineWidth = 1;
      c.stroke();
      c.fillStyle = '#8A5A00';
      c.font = `1000 ${Math.max(7, r * 1.1)}px Inter, system-ui, sans-serif`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText('¥', coin.x, coin.y + 0.5);
    }
    c.restore();
  }

  function spawnCoinStream(x: number, y: number, count: number): void {
    const tx = 64;
    const ty = (ctx.canvas.clientWidth >= 700 ? 62 : 56) / 2;
    for (let i = 0; i < count; i += 1) {
      const ang = Math.random() * TAU;
      const spd = 1.5 + Math.random() * 3;
      coins.push({
        x: x + (Math.random() - 0.5) * 30,
        y: y + (Math.random() - 0.5) * 20,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd - 2,
        tx, ty,
        age: -i * 26, // 逐枚错峰出发
        ttl: 620 + Math.random() * 160,
      });
    }
    if (coins.length > 120) coins.splice(0, coins.length - 120);
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
    drawNotifSweep(phone); // 下拉清理通知的卷帘仪式（在通知栏之上）
    if (phoneBlockedByPopup(phone)) drawBlockedScreenDim(phone);
    if (phoneLaggy(phone)) drawLagOverlay(phone);
    if (phone.customer.phone.variant === 'cosmic') drawCosmic(phone);
    drawMalware(phone);
    drawPopups(phone); // 遮挡弹窗在最上层
    drawRepairCeremony(phone); // 维修台阶段：拆机/施工/装回仪式叠加在屏幕上

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
      } else if (effect.kind === 'delivery') {
        // 交付横幅：彩带绿牌，弹跳上浮，显示收入 + 满意度星级
        const pop = 1 + Math.sin(Math.min(1, t / 0.22) * Math.PI) * 0.16;
        const rise = t * 40;
        c.translate(effect.x, effect.y - rise);
        c.scale(pop, pop);
        // 放射光
        c.globalAlpha = alpha * 0.5;
        for (let ray = 0; ray < 12; ray += 1) {
          c.rotate(TAU / 12);
          c.strokeStyle = alphaColor('#FFD166', 0.5);
          c.lineWidth = 3;
          c.beginPath();
          c.moveTo(70, 0);
          c.lineTo(70 + 26 + Math.sin(t * 6 + ray) * 6, 0);
          c.stroke();
        }
        c.globalAlpha = alpha;
        const bw = 188;
        const bh = 64;
        c.shadowColor = 'rgba(31,181,122,0.5)';
        c.shadowBlur = 16;
        fillRound(c, -bw / 2, -bh / 2, bw, bh, 16, 'rgba(255,255,255,0.96)');
        c.shadowColor = 'transparent';
        strokeRound(c, -bw / 2, -bh / 2, bw, bh, 16, '#1FB57A', 2.5);
        c.fillStyle = '#0E7A50';
        c.font = '900 14px "PingFang SC", "Microsoft YaHei", system-ui, sans-serif';
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText('🎉 交付完成', 0, -bh / 2 + 15);
        c.fillStyle = '#0B6B45';
        c.font = '1000 24px "PingFang SC", "Microsoft YaHei", system-ui, sans-serif';
        c.fillText(effect.label, -6, 4);
        // 满意度星级
        const stars = effect.mood === 'happy' ? 5 : effect.mood === 'neutral' ? 4 : effect.mood === 'annoyed' ? 2 : 1;
        let starStr = '';
        for (let i = 0; i < 5; i += 1) starStr += i < stars ? '★' : '☆';
        c.fillStyle = '#FFB300';
        c.font = '900 13px system-ui, sans-serif';
        c.fillText(starStr, 0, bh / 2 - 13);
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
    // 木质招牌底板（替代扁平深色条）
    woodPanel(c, -2, -2, bar.w + 4, bar.h + 2, 4, '#5E3F23', '#392713');
    c.fillStyle = 'rgba(0,0,0,0.3)';
    c.fillRect(0, bar.h - 3, bar.w, 3);
    drawScrew(c, 9, 9, 3.2, 0.6);
    drawScrew(c, bar.w - 9, 9, 3.2, 1.3);

    const cy = bar.h / 2;
    // 现金：黄铜收银牌
    const cashLabel = `💰 ${formatMoney(s.points)} 元`;
    const pillH = bar.h - 16;
    const pillY = 8;
    const pillX = 16;
    c.font = `1000 ${Math.round(pillH * 0.46)}px "PingFang SC", "Microsoft YaHei", system-ui, sans-serif`;
    const cashW = Math.min(bar.w * 0.56, c.measureText(cashLabel).width + 30);
    brassPlate(c, pillX, pillY, cashW, pillH, 6);
    engraveText(c, cashLabel, pillX + cashW / 2, cy, `1000 ${Math.round(pillH * 0.46)}px "PingFang SC", "Microsoft YaHei", system-ui, sans-serif`, '#4A3000', 'center', cashW - 18);

    // 等级：金属铭牌 + 黄铜星
    const badgeW = Math.min(112, bar.w * 0.3);
    const badgeH = bar.h - 18;
    const badgeX = bar.w - badgeW - 12;
    const badgeY = 9;
    metalPlate(c, badgeX, badgeY, badgeW, badgeH, 6);
    engraveText(c, `Lv${s.level} · ${shopRankName(s.level)}`, badgeX + badgeW / 2, badgeY + badgeH * 0.33, '900 12px "PingFang SC", "Microsoft YaHei", system-ui, sans-serif', '#2A2E36', 'center', badgeW - 8);
    const stars = Math.round(clamp01(s.reputation / 5) * 5);
    let starStr = '';
    for (let i = 0; i < 5; i += 1) starStr += i < stars ? '★' : '☆';
    engraveText(c, starStr, badgeX + badgeW / 2, badgeY + badgeH * 0.72, '900 11px system-ui, sans-serif', '#B8860B', 'center', badgeW - 8);

    // 经验：底边黄铜进度条
    const xpRatio = Math.min(1, s.xp / Math.max(1, s.xpToNext));
    c.fillStyle = 'rgba(0,0,0,0.32)';
    c.fillRect(0, bar.h - 3, bar.w, 3);
    c.fillStyle = '#E7B748';
    c.fillRect(0, bar.h - 3, bar.w * xpRatio, 3);
  }

  function drawControls(ui: UiLayout): void {
    const c = ctx.ctx2d;
    const now = performance.now();
    // 木质工具架
    woodPanel(c, ui.controlBar.x - 2, ui.controlBar.y, ui.controlBar.w + 4, ui.controlBar.h + 6, 6, '#583C21', '#36240F');
    c.fillStyle = 'rgba(255,220,170,0.14)';
    c.fillRect(ui.controlBar.x, ui.controlBar.y, ui.controlBar.w, 2);
    const readySkills = ctx.content.skills.filter((sk) => {
      const rt = ctx.state.skills[sk.id];
      return rt?.unlocked && now - rt.lastUsedAt >= sk.cooldownMs;
    }).length;
    const emojiOf: Record<string, string> = { shop: '🧰', skills: '⚡', settings: '⚙️' };
    for (const btn of ui.buttons) {
      const active = ctx.state.ui.modal === btn.id;
      const r = btn.rect;
      // 金属工具牌（按下=内陷质感）
      metalPlate(c, r.x, r.y, r.w, r.h, 12, active, active ? '#A9C6F2' : undefined);
      const sr = Math.max(2.4, r.h * 0.045);
      drawScrew(c, r.x + 10, r.y + 10, sr, 0.4);
      drawScrew(c, r.x + r.w - 10, r.y + 10, sr, 1.2);
      drawScrew(c, r.x + 10, r.y + r.h - 10, sr, 2.1);
      drawScrew(c, r.x + r.w - 10, r.y + r.h - 10, sr, 0.9);
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.font = '21px system-ui, sans-serif';
      c.fillText(emojiOf[btn.id] ?? btn.icon, r.x + r.w / 2, r.y + r.h * 0.36);
      engraveText(c, btn.label, r.x + r.w / 2, r.y + r.h * 0.74, '900 13px "PingFang SC", "Microsoft YaHei", system-ui, sans-serif', active ? '#10294C' : '#2A2E36');
      if (btn.id === 'skills' && readySkills > 0 && !active) {
        const dx = r.x + r.w - 14;
        const dy = r.y + 13;
        c.fillStyle = '#C8281E';
        c.beginPath();
        c.arc(dx, dy, 9, 0, TAU);
        c.fill();
        c.strokeStyle = 'rgba(255,220,170,0.8)';
        c.lineWidth = 1.2;
        c.stroke();
        c.fillStyle = '#FFF';
        c.font = '900 11px Inter, system-ui, sans-serif';
        c.fillText(String(readySkills), dx, dy + 0.5);
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
    fillRound(c, rect.x, rect.y, rect.w, rect.h, 10, '#FBF4E2');
    strokeRound(c, rect.x, rect.y, rect.w, rect.h, 10, 'rgba(80,55,25,0.22)', 1.2);
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
    fillRound(c, rect.x, rect.y, rect.w, rect.h, 10, ready ? '#DBF3EA' : '#FBF4E2');
    strokeRound(c, rect.x, rect.y, rect.w, rect.h, 10, ready ? 'rgba(38,198,166,0.55)' : 'rgba(80,55,25,0.22)', 1.2);
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
    fillRound(c, rect.x, rect.y, rect.w, rect.h, 10, isReset ? '#F6DED9' : '#FBF4E2');
    strokeRound(c, rect.x, rect.y, rect.w, rect.h, 10, isReset ? 'rgba(192,57,43,0.4)' : 'rgba(80,55,25,0.22)', 1.2);
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
    c.fillStyle = 'rgba(6, 12, 22, 0.6)';
    c.fillRect(0, 0, m.backdrop.w, m.backdrop.h);
    // 木框抽屉
    c.save();
    c.shadowColor = 'rgba(0,0,0,0.45)';
    c.shadowBlur = 26;
    c.shadowOffsetY = -6;
    woodPanel(c, m.panel.x, m.panel.y, m.panel.w, m.panel.h, 14, '#6A4828', '#42301C');
    c.restore();
    // 内层米色工作面
    fillRound(c, m.panel.x + 8, m.panel.y + m.titleBar.h - 2, m.panel.w - 16, m.panel.h - m.titleBar.h - 6, 10, '#ECE0C7');
    // 黄铜铭牌标题（留出右侧关闭键空间）
    brassPlate(c, m.panel.x + 10, m.panel.y + 8, m.panel.w - 20 - 46, m.titleBar.h - 16, 7);
    engraveText(c, m.title, m.panel.x + 24, m.panel.y + 8 + (m.titleBar.h - 16) / 2, '900 16px "PingFang SC", "Microsoft YaHei", system-ui, sans-serif', '#4A3000', 'left', m.panel.w - 90);
    // 金属关闭键
    metalPlate(c, m.close.x, m.close.y, m.close.w, m.close.h, 8);
    c.strokeStyle = '#2A2E36';
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
    drawCoins(); // 交付金币飞向钱袋（固定屏幕坐标，落点是 HUD 金牌）

    const ui = computeUiLayout(ctx.state, w, h, ctx.content.upgrades.map((u) => u.id), ctx.content.skills.map((s) => s.id));
    drawHud(ui);
    drawStatusStrip(ui);
    drawControls(ui);
    drawRepairBench(); // 维修台抽屉（盖在底部控制栏之上）
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
        // 把交付庆典锚定在刚离场的那台手机上（用上一帧布局位置），而不是干巴巴的屏幕顶部
        const last = lastLayouts.get(event.customerId);
        const px = last ? last.x + last.w / 2 : ctx.canvas.clientWidth / 2;
        const py = last ? last.y + last.h * 0.4 : 150;
        // 记录交付信息：退场动画据此盖"已交付"章并把手机递还顾客
        deliveredInfo.set(event.customerId, { payout: event.payout, xp: event.xp, mood: event.mood });
        // 交付横幅（含满意度）+ 金币飞向钱袋 + 金光爆发
        effects.push({ kind: 'delivery', x: px, y: py, age: 0, ttl: 1150, label: `+${event.payout} 元`, color: '#1FB57A', power: 1.4, mood: event.mood });
        if (event.xp > 0) {
          effects.push({ kind: 'return', x: px, y: py - 56, age: 0, ttl: 980, label: `+${event.xp} 经验`, color: '#5B8DEF', power: 1 });
        }
        spawnCoinStream(px, py, 8 + Math.min(16, Math.round(event.payout / 6)));
        spawnBurst(px, py, '#FFD166', 26, 1.3);
        spawnBurst(px, py, '#1FB57A', 18, 1.1);
        addShake(240, 2.8);
      });
      ctx.bus.on('REPAIR_COMPLETED', (event) => {
        // 装回完成：盖个绿章 + 金币飞钱袋 + 利润飘字
        effects.push({ kind: 'task', x: event.x, y: event.y, age: 0, ttl: 620, label: `${event.tierName} ✓`, color: '#26C6A6', power: 1.1 });
        effects.push({ kind: 'return', x: event.x, y: event.y - 30, age: 0, ttl: 900, label: `维修 +${event.profit}元`, color: '#26C6A6', power: 1.1 });
        spawnCoinStream(event.x, event.y, 4 + Math.min(10, Math.round(event.profit / 8)));
        spawnBurst(event.x, event.y, '#26C6A6', 16, 1);
        spawnBurst(event.x, event.y, '#FFD166', 8, 0.8);
        addShake(120, 2);
      });
      ctx.bus.on('STEAL_RESULT', (event) => {
        if (event.caught) {
          effects.push({ kind: 'smash', x: event.x, y: event.y, age: 0, ttl: 1050, label: `偷资料被抓 -${event.amount}`, color: '#FF3B30', power: 1.6 });
          spawnBurst(event.x, event.y, '#FF3B30', 40, 1.7);
          skillFlash = 600;
          addShake(520, 8);
        } else {
          effects.push({ kind: 'delivery', x: event.x, y: event.y, age: 0, ttl: 1250, label: `信息差 +${event.amount}元`, color: '#E0A100', power: 1.6, mood: 'happy' });
          spawnCoinStream(event.x, event.y, 16);
          spawnBurst(event.x, event.y, '#FFD166', 44, 1.8);
          addShake(300, 3.2);
        }
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
        spawnBurst(event.x, event.y, '#FF9F43', 14, 1);
        spawnBurst(event.x, event.y, '#FFD166', 8, 0.8);
        notifSweeps.push({ customerId: event.customerId, age: 0, count: event.amount });
        addShake(70, 1.2);
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

      for (const sweep of notifSweeps) {
        sweep.age += dt;
      }
      for (let i = notifSweeps.length - 1; i >= 0; i -= 1) {
        if (notifSweeps[i].age >= NOTIF_SWEEP_MS) {
          notifSweeps.splice(i, 1);
        }
      }

      // 金币飞向钱袋：先小爆发再被钱袋吸引，划出弧线
      for (const coin of coins) {
        coin.age += dt;
        if (coin.age <= 0) continue;
        const dx = coin.tx - coin.x;
        const dy = coin.ty - coin.y;
        const dist = Math.hypot(dx, dy) || 1;
        const pull = 0.55 * step;
        coin.vx = coin.vx * 0.9 + (dx / dist) * pull;
        coin.vy = coin.vy * 0.9 + (dy / dist) * pull;
        coin.x += coin.vx * step * 3.4;
        coin.y += coin.vy * step * 3.4;
      }
      for (let i = coins.length - 1; i >= 0; i -= 1) {
        if (coins[i].age >= coins[i].ttl) coins.splice(i, 1);
      }

      draw();
    },
  };
}
