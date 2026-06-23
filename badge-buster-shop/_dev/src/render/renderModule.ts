import { computeGameLayout, type GameLayout, type IconLayout, type PhoneLayout, type QueueLayout } from '../shared/layout';
import type { AppIconDef } from '../types/content.types';
import type { GameContext, GameModule } from '../types/module.types';
import type { Mood } from '../types/state.types';

interface VisualEffect {
  kind: 'pop' | 'return' | 'level' | 'leave';
  x: number;
  y: number;
  age: number;
  ttl: number;
  label: string;
  color: string;
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

function fillRound(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, fill: string): void {
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

export function createRenderModule(): GameModule {
  let ctx: GameContext;
  const effects: VisualEffect[] = [];
  const images = new Map<string, HTMLImageElement>();

  function iconDef(icon: IconLayout): AppIconDef {
    return ctx.content.icons.find((item) => item.id === icon.icon.appId) ?? ctx.content.icons[0];
  }

  function drawBackground(layout: GameLayout): void {
    const c = ctx.ctx2d;
    const w = ctx.canvas.clientWidth;
    const h = ctx.canvas.clientHeight;
    c.clearRect(0, 0, w, h);
    c.fillStyle = '#FBF7F0';
    c.fillRect(0, 0, w, h);

    c.fillStyle = '#FFFFFF';
    c.fillRect(0, 0, w, 64);
    c.fillStyle = '#2B2B33';
    c.font = '700 24px Inter, system-ui, sans-serif';
    c.textAlign = 'left';
    c.fillText('Badge Buster Shop', 22, 40);

    c.font = '600 13px Inter, system-ui, sans-serif';
    c.fillStyle = '#6E6A73';
    c.textAlign = 'right';
    c.fillText(`Cleared ${Math.floor(ctx.state.totalCleared)} badges`, Math.max(220, w - layout.uiReserve - 24), 38);

    const counterY = h - layout.bottomReserve - 82;
    c.fillStyle = '#F3E2C8';
    c.fillRect(0, counterY, w - layout.uiReserve, 100);
    c.fillStyle = '#D6B37A';
    c.fillRect(0, counterY, w - layout.uiReserve, 6);

    fillRound(c, layout.queuePanel.x - 6, layout.queuePanel.y - 6, layout.queuePanel.w + 12, layout.queuePanel.h + 12, 8, '#FFF9F0');
    strokeRound(c, layout.queuePanel.x - 6, layout.queuePanel.y - 6, layout.queuePanel.w + 12, layout.queuePanel.h + 12, 8, '#E7D8C0');
    c.fillStyle = '#2B2B33';
    c.font = '700 13px Inter, system-ui, sans-serif';
    c.textAlign = 'center';
    c.fillText(`Queue ${ctx.state.queue.length}/${ctx.state.queueCapacity}`, layout.queuePanel.x + layout.queuePanel.w / 2, layout.queuePanel.y + 18);
  }

  function drawCustomerBust(x: number, y: number, radius: number, mood: Mood, name: string): void {
    const c = ctx.ctx2d;
    c.save();
    c.fillStyle = moodColor(mood);
    c.beginPath();
    c.arc(x, y, radius, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#FFE2C8';
    c.beginPath();
    c.arc(x, y - radius * 0.12, radius * 0.54, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = '#2B2B33';
    c.lineWidth = 2;
    c.beginPath();
    c.arc(x - radius * 0.2, y - radius * 0.18, 1.5, 0, Math.PI * 2);
    c.arc(x + radius * 0.2, y - radius * 0.18, 1.5, 0, Math.PI * 2);
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
    c.font = '700 10px Inter, system-ui, sans-serif';
    c.textAlign = 'center';
    c.fillText(name.slice(0, 1), x, y + radius * 0.92);
    c.restore();
  }

  function drawQueueItem(item: QueueLayout): void {
    const c = ctx.ctx2d;
    const ratio = item.customer.patience / Math.max(1, item.customer.maxPatience);
    fillRound(c, item.x, item.y, item.w, item.h, 8, '#FFFFFF');
    strokeRound(c, item.x, item.y, item.w, item.h, 8, '#E7D8C0');
    drawCustomerBust(item.x + 22, item.y + item.h / 2, 15, item.customer.mood, item.customer.defId);
    c.fillStyle = '#2B2B33';
    c.font = '700 11px Inter, system-ui, sans-serif';
    c.textAlign = 'left';
    c.fillText(item.customer.defId.replace('cust_', '').toUpperCase(), item.x + 44, item.y + 22);
    fillRound(c, item.x + 44, item.y + item.h - 18, item.w - 56, 7, 3, '#EFEAE2');
    fillRound(c, item.x + 44, item.y + item.h - 18, (item.w - 56) * clamp01(ratio), 7, 3, moodColor(item.customer.mood));
  }

  function drawPhone(phone: PhoneLayout): void {
    const c = ctx.ctx2d;
    const customerDef = ctx.content.customers.find((item) => item.id === phone.customer.defId);
    c.save();
    c.shadowColor = 'rgba(43, 43, 51, 0.18)';
    c.shadowBlur = 18;
    c.shadowOffsetY = 8;
    fillRound(c, phone.x, phone.y, phone.w, phone.h, phone.w * 0.11, '#2B2B33');
    c.shadowColor = 'transparent';
    fillRound(c, phone.screenX, phone.screenY, phone.screenW, phone.screenH, phone.w * 0.06, '#F8FBFF');
    fillRound(c, phone.x + phone.w * 0.39, phone.y + phone.h * 0.035, phone.w * 0.22, 5, 3, '#494957');

    c.fillStyle = '#2B2B33';
    c.font = '700 13px Inter, system-ui, sans-serif';
    c.textAlign = 'center';
    c.fillText(customerDef?.name ?? 'Customer', phone.x + phone.w / 2, phone.y - 11);

    for (const icon of phone.icons) {
      drawIcon(icon);
    }

    c.fillStyle = '#E9EEF9';
    c.beginPath();
    c.arc(phone.x + phone.w / 2, phone.y + phone.h * 0.935, phone.w * 0.035, 0, Math.PI * 2);
    c.fill();

    c.font = '700 12px Inter, system-ui, sans-serif';
    c.fillStyle = '#6E6A73';
    c.fillText(`${phone.customer.phone.badgeTotal} left`, phone.x + phone.w / 2, phone.y + phone.h - 14);
    c.restore();
  }

  function drawIcon(icon: IconLayout): void {
    const c = ctx.ctx2d;
    const def = iconDef(icon);
    const image = images.get(def.artId);
    if (image?.complete && image.naturalWidth > 0) {
      c.drawImage(image, icon.x - icon.size / 2, icon.y - icon.size / 2, icon.size, icon.size);
    } else {
      c.save();
      c.shadowColor = 'rgba(43, 43, 51, 0.12)';
      c.shadowBlur = 8;
      c.shadowOffsetY = 3;
      fillRound(c, icon.x - icon.size / 2, icon.y - icon.size / 2, icon.size, icon.size, icon.size * 0.24, def.fallbackColor);
      c.shadowColor = 'transparent';
      c.fillStyle = 'rgba(255,255,255,0.82)';
      c.font = `700 ${Math.max(13, icon.size * 0.42)}px Inter, system-ui, sans-serif`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(def.fallbackGlyph, icon.x, icon.y + 1);
      c.restore();
    }

    if (icon.icon.badge > 0) {
      const label = icon.icon.badge > 99 ? '99+' : String(icon.icon.badge);
      const badgeW = Math.max(icon.size * 0.43, 14 + label.length * 6);
      const badgeH = icon.size * 0.34;
      fillRound(c, icon.badgeX - badgeW / 2, icon.badgeY - badgeH / 2, badgeW, badgeH, badgeH / 2, '#FF3B30');
      c.fillStyle = '#FFFFFF';
      c.font = `800 ${Math.max(9, icon.size * 0.22)}px Inter, system-ui, sans-serif`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(label, icon.badgeX, icon.badgeY + 0.5);
    }
  }

  function drawEffects(): void {
    const c = ctx.ctx2d;
    for (const effect of effects) {
      const t = effect.age / effect.ttl;
      c.globalAlpha = Math.max(0, 1 - t);
      c.fillStyle = effect.color;
      c.font = `800 ${effect.kind === 'level' ? 24 : 18}px Inter, system-ui, sans-serif`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(effect.label, effect.x, effect.y - t * 42);
      if (effect.kind === 'pop') {
        c.beginPath();
        c.arc(effect.x, effect.y, 8 + t * 26, 0, Math.PI * 2);
        c.strokeStyle = effect.color;
        c.lineWidth = 2;
        c.stroke();
      }
      c.globalAlpha = 1;
    }
  }

  function drawEmptyState(layout: GameLayout): void {
    if (ctx.state.activeCustomers.length > 0) {
      return;
    }
    const c = ctx.ctx2d;
    fillRound(c, layout.playArea.x + layout.playArea.w * 0.22, layout.playArea.y + layout.playArea.h * 0.26, layout.playArea.w * 0.56, 92, 8, '#FFFFFF');
    strokeRound(c, layout.playArea.x + layout.playArea.w * 0.22, layout.playArea.y + layout.playArea.h * 0.26, layout.playArea.w * 0.56, 92, 8, '#E7D8C0');
    c.fillStyle = '#2B2B33';
    c.font = '800 18px Inter, system-ui, sans-serif';
    c.textAlign = 'center';
    c.fillText('Next phone arriving...', layout.playArea.x + layout.playArea.w / 2, layout.playArea.y + layout.playArea.h * 0.26 + 38);
    c.fillStyle = '#6E6A73';
    c.font = '600 12px Inter, system-ui, sans-serif';
    c.fillText('Keep the counter clear.', layout.playArea.x + layout.playArea.w / 2, layout.playArea.y + layout.playArea.h * 0.26 + 62);
  }

  function clamp01(value: number): number {
    return Math.min(1, Math.max(0, value));
  }

  function draw(): void {
    const layout = computeGameLayout(ctx.state, ctx.canvas.clientWidth, ctx.canvas.clientHeight);
    drawBackground(layout);
    for (const queueItem of layout.queueLayouts) {
      drawQueueItem(queueItem);
    }
    for (const phone of layout.phoneLayouts) {
      drawPhone(phone);
    }
    drawEmptyState(layout);
    drawEffects();
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
        if (event.amount > 0) {
          effects.push({ kind: 'pop', x: event.x, y: event.y, age: 0, ttl: 520, label: `-${event.amount}`, color: '#FF3B30' });
        }
      });
      ctx.bus.on('PHONE_RETURNED', (event) => {
        effects.push({ kind: 'return', x: ctx.canvas.clientWidth / 2, y: 130, age: 0, ttl: 950, label: `+$${event.payout}`, color: '#26C6A6' });
      });
      ctx.bus.on('LEVEL_UP', (event) => {
        effects.push({ kind: 'level', x: ctx.canvas.clientWidth / 2, y: 110, age: 0, ttl: 1300, label: `LEVEL ${event.level}`, color: '#5B8DEF' });
      });
      ctx.bus.on('CUSTOMER_LEFT', (event) => {
        effects.push({ kind: 'leave', x: 82, y: 120, age: 0, ttl: 900, label: event.reason === 'overflow' ? 'FULL' : 'LEFT', color: '#FF9F43' });
      });
    },
    update(dt) {
      for (const effect of effects) {
        effect.age += dt;
      }
      for (let i = effects.length - 1; i >= 0; i -= 1) {
        if (effects[i].age >= effects[i].ttl) {
          effects.splice(i, 1);
        }
      }
      draw();
    },
  };
}
