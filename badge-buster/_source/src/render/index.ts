// render —— 画布渲染（Agent 2 + 程序化美术）
// 每帧读取 state（只读）+ computeLayout(state) 绘制整个场景，并管理本地粒子 FX。
import type { GameContext, GameModule } from '../types/module.types';
import type { GameState, CustomerRuntime, IconRuntime, Mood } from '../types/state.types';
import type { AppIconDef, CustomerDef } from '../types/content.types';
import {
  LOGICAL_W,
  LOGICAL_H,
  computeLayout,
  type SceneLayout,
  type StationLayout,
  type Rect,
} from '../types/layout';

// ——— 调色板 ———
const COL = {
  cream: '#FBF7F0',
  blue: '#5B8DEF',
  red: '#FF3B30',
  orange: '#FF9F43',
  mint: '#26C6A6',
  ink: '#2B2B33',
  white: '#FFFFFF',
  green: '#43C463',
  amber: '#FFC03A',
};

const GLYPH_FONT = '"Segoe UI Emoji", system-ui, sans-serif';
const UI_FONT = '"Segoe UI", system-ui, "PingFang SC", "Microsoft YaHei", sans-serif';

// ——————————————————————————— 粒子系统 ———————————————————————————
type ParticleKind =
  | 'speck'        // 小色块/碎屑
  | 'ring'         // 收缩圆环
  | 'sparkle'      // 星点
  | 'coin'         // 上浮硬币
  | 'text'         // 上浮文字
  | 'check'        // 绿色对勾
  | 'puff'         // 扩散烟雾
  | 'banner'       // 升级横幅
  | 'flash';       // 全屏闪光

interface Particle {
  kind: ParticleKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  born: number;
  life: number;     // ms
  size: number;
  color: string;
  text?: string;
  rot?: number;
  vrot?: number;
}

// ——————————————————————————— 小工具 ———————————————————————————
function rng(seedStr: string): number {
  // 由字符串得到一个稳定 [0,1)，用于给角色/工位赋予稳定的随机外观
  let h = 2166136261;
  for (let i = 0; i < seedStr.length; i++) {
    h ^= seedStr.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  // 转 [0,1)
  return ((h >>> 0) % 100000) / 100000;
}

function roundRect(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.max(0, Math.min(r, Math.min(w, h) / 2));
  g.beginPath();
  g.moveTo(x + rr, y);
  g.arcTo(x + w, y, x + w, y + h, rr);
  g.arcTo(x + w, y + h, x, y + h, rr);
  g.arcTo(x, y + h, x, y, rr);
  g.arcTo(x, y, x + w, y, rr);
  g.closePath();
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

// 耐心条颜色：绿→琥珀→红
function patienceColor(t: number): string {
  if (t > 0.5) return COL.green;
  if (t > 0.25) return COL.amber;
  return COL.red;
}

// ——————————————————————————— 模块 ———————————————————————————
export function createRenderModule(): GameModule {
  let ctx!: GameContext;
  let g!: CanvasRenderingContext2D;
  const particles: Particle[] = [];
  const unsubs: Array<() => void> = [];

  // 索引内容，避免每帧 find 的开销
  const iconById = new Map<string, AppIconDef>();
  const custById = new Map<string, CustomerDef>();

  // 图像缓存（manifest 当前为空 → 永远走程序化；若将来填路径则可用）
  const imgCache = new Map<string, HTMLImageElement>();

  function getImage(artId: string): HTMLImageElement | null {
    const path = ctx.assets.images[artId];
    if (!path) return null;
    const cached = imgCache.get(artId);
    if (cached) return cached.complete && cached.naturalWidth > 0 ? cached : null;
    const im = new Image();
    im.src = path;
    imgCache.set(artId, im);
    return null;
  }

  /** 优先绘制 assets.images[artId]，否则调用程序化回退 */
  function drawArtOr(artId: string, r: Rect, fallback: () => void): void {
    const im = getImage(artId);
    if (im) {
      g.drawImage(im, r.x, r.y, r.w, r.h);
    } else {
      fallback();
    }
  }

  // ——— 粒子生成 ———
  function spawn(p: Partial<Particle> & { kind: ParticleKind; x: number; y: number }): void {
    particles.push({
      vx: 0,
      vy: 0,
      born: ctx.now(),
      life: 600,
      size: 6,
      color: COL.orange,
      ...p,
    });
  }

  function burstAt(x: number, y: number): void {
    const cols = [COL.orange, COL.blue, COL.mint, COL.red, COL.amber];
    for (let i = 0; i < 7; i++) {
      const a = (Math.PI * 2 * i) / 7 + Math.random() * 0.5;
      const sp = 0.06 + Math.random() * 0.09;
      spawn({
        kind: 'speck',
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 0.03,
        life: 420 + Math.random() * 200,
        size: 3 + Math.random() * 3,
        color: cols[i % cols.length],
      });
    }
    spawn({ kind: 'ring', x, y, life: 360, size: 6, color: COL.red });
  }

  function cleanedAt(x: number, y: number): void {
    spawn({ kind: 'check', x, y, life: 900, size: 34, color: COL.green });
    for (let i = 0; i < 8; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 0.03 + Math.random() * 0.06;
      spawn({
        kind: 'sparkle',
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 700 + Math.random() * 300,
        size: 4 + Math.random() * 4,
        color: i % 2 ? COL.mint : COL.amber,
      });
    }
  }

  function returnedAt(x: number, y: number, payout: number): void {
    for (let i = 0; i < 6; i++) {
      spawn({
        kind: 'coin',
        x: x + (Math.random() - 0.5) * 40,
        y: y + (Math.random() - 0.5) * 14,
        vx: (Math.random() - 0.5) * 0.03,
        vy: -0.08 - Math.random() * 0.05,
        life: 900 + Math.random() * 300,
        size: 12 + Math.random() * 4,
        color: COL.amber,
        rot: Math.random() * Math.PI,
        vrot: (Math.random() - 0.5) * 0.01,
      });
    }
    spawn({
      kind: 'text',
      x,
      y: y - 8,
      vy: -0.05,
      life: 1200,
      size: 24,
      color: COL.mint,
      text: '+' + Math.round(payout),
    });
  }

  function puffAt(x: number, y: number, color: string): void {
    for (let i = 0; i < 7; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 0.02 + Math.random() * 0.05;
      spawn({
        kind: 'puff',
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 0.02,
        life: 600 + Math.random() * 300,
        size: 8 + Math.random() * 8,
        color,
      });
    }
  }

  // ——— 事件 → FX ———
  function wireEvents(): void {
    unsubs.push(
      ctx.bus.on('BADGE_CLEARED', (e) => burstAt(e.x, e.y)),
      ctx.bus.on('PHONE_CLEANED', (e) => {
        const st = stationForCustomer(e.customerId);
        if (st) cleanedAt(centerOf(st.screenRect).x, centerOf(st.screenRect).y);
      }),
      ctx.bus.on('PHONE_RETURNED', (e) => {
        const st = stationForCustomer(e.customerId);
        const c = st ? centerOf(st.phoneRect) : { x: LOGICAL_W / 2, y: LOGICAL_H / 2 };
        returnedAt(c.x, c.y, e.payout);
      }),
      ctx.bus.on('CUSTOMER_LEFT', (e) => {
        const st = stationForCustomer(e.customerId);
        const c = st ? centerOf(st.customerRect) : { x: LOGICAL_W / 2, y: 120 };
        puffAt(c.x, c.y, e.reason === 'angry' ? COL.red : '#9AA0AA');
      }),
      ctx.bus.on('CUSTOMER_ARRIVED', () => {
        const lay = computeLayout(ctx.state);
        const slot = lay.queue.slots[ctx.state.queue.length - 1] ?? lay.queue.slots[0];
        if (slot) puffAt(centerOf(slot).x, centerOf(slot).y, COL.blue);
        else puffAt(40, LOGICAL_H - 58, COL.blue);
      }),
      ctx.bus.on('LEVEL_UP', (e) => {
        spawn({
          kind: 'banner',
          x: LOGICAL_W / 2,
          y: LOGICAL_H / 2 - 40,
          life: 1800,
          size: 56,
          color: COL.orange,
          text: 'LV ' + e.level,
        });
        for (let i = 0; i < 18; i++) {
          const a = (Math.PI * 2 * i) / 18;
          const sp = 0.12 + Math.random() * 0.06;
          spawn({
            kind: 'speck',
            x: LOGICAL_W / 2,
            y: LOGICAL_H / 2 - 40,
            vx: Math.cos(a) * sp,
            vy: Math.sin(a) * sp,
            life: 700,
            size: 4 + Math.random() * 4,
            color: i % 2 ? COL.amber : COL.mint,
          });
        }
      }),
      ctx.bus.on('SKILL_USED', () => {
        spawn({ kind: 'flash', x: 0, y: 0, life: 360, size: 0, color: COL.white });
      }),
    );
  }

  // ——— 几何辅助（依赖当前帧 layout，由闭包缓存） ———
  let frameLayout: SceneLayout | null = null;

  function centerOf(r: Rect): { x: number; y: number } {
    return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
  }

  function stationForCustomer(customerId: string): StationLayout | null {
    const lay = frameLayout ?? computeLayout(ctx.state);
    const idx = ctx.state.activeCustomers.findIndex((c) => c && c.id === customerId);
    if (idx < 0) return null;
    return lay.stations[idx] ?? null;
  }

  // ——————————————————————————— 绘制：背景 ———————————————————————————
  function drawBackground(): void {
    // 暖色渐变墙
    const grad = g.createLinearGradient(0, 0, 0, LOGICAL_H);
    grad.addColorStop(0, '#FFFBF4');
    grad.addColorStop(1, COL.cream);
    g.fillStyle = grad;
    g.fillRect(0, 0, LOGICAL_W, LOGICAL_H);

    // 墙纸细点（轻量、固定）
    g.fillStyle = 'rgba(91,141,239,0.04)';
    for (let x = 30; x < LOGICAL_W; x += 60) {
      for (let y = 90; y < LOGICAL_H - 130; y += 60) {
        g.beginPath();
        g.arc(x, y, 3, 0, Math.PI * 2);
        g.fill();
      }
    }

    // 木质柜台带（服务区下沿）
    const counterY = LOGICAL_H - 116 - 26;
    g.fillStyle = '#E9D9C2';
    g.fillRect(0, counterY, LOGICAL_W, 30);
    g.fillStyle = 'rgba(0,0,0,0.06)';
    g.fillRect(0, counterY + 26, LOGICAL_W, 4);
  }

  function drawShopSign(): void {
    // 顶栏由 DOM HUD 占据（y0..52），招牌改为墙面淡水印，避免与 HUD 叠加。
    g.save();
    g.globalAlpha = 0.05;
    g.fillStyle = COL.ink;
    g.font = `800 60px ${UI_FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('噩梦角标清除铺', LOGICAL_W / 2, 232);
    g.restore();
  }

  // ——————————————————————————— 绘制：顾客角色 ———————————————————————————
  function drawFace(
    cx: number,
    cy: number,
    scale: number,
    mood: Mood,
    accent: string,
  ): void {
    // 头
    g.fillStyle = accent;
    g.beginPath();
    g.arc(cx, cy, 18 * scale, 0, Math.PI * 2);
    g.fill();

    // 眼睛
    g.fillStyle = COL.ink;
    const ex = 6 * scale;
    const ey = -2 * scale;
    const eyeR = 2.2 * scale;
    if (mood === 'angry') {
      // 怒眉 + 眼
      g.lineWidth = 2 * scale;
      g.strokeStyle = COL.ink;
      g.beginPath();
      g.moveTo(cx - ex - 4 * scale, cy + ey - 5 * scale);
      g.lineTo(cx - ex + 3 * scale, cy + ey - 2 * scale);
      g.moveTo(cx + ex + 4 * scale, cy + ey - 5 * scale);
      g.lineTo(cx + ex - 3 * scale, cy + ey - 2 * scale);
      g.stroke();
    }
    g.beginPath();
    g.arc(cx - ex, cy + ey, eyeR, 0, Math.PI * 2);
    g.arc(cx + ex, cy + ey, eyeR, 0, Math.PI * 2);
    g.fill();

    // 嘴
    g.lineWidth = 2 * scale;
    g.strokeStyle = COL.ink;
    g.lineCap = 'round';
    const my = cy + 7 * scale;
    g.beginPath();
    if (mood === 'happy') {
      g.arc(cx, my - 2 * scale, 6 * scale, 0.15 * Math.PI, 0.85 * Math.PI);
    } else if (mood === 'neutral') {
      g.moveTo(cx - 5 * scale, my);
      g.lineTo(cx + 5 * scale, my);
    } else if (mood === 'annoyed') {
      g.moveTo(cx - 5 * scale, my);
      g.lineTo(cx + 5 * scale, my - 1.5 * scale);
    } else {
      // angry: 倒弧
      g.arc(cx, my + 5 * scale, 6 * scale, 1.15 * Math.PI, 1.85 * Math.PI);
    }
    g.stroke();

    // 烦躁/愤怒：汗滴
    if (mood === 'annoyed' || mood === 'angry') {
      g.fillStyle = COL.blue;
      const sx = cx + 16 * scale;
      const sy = cy - 8 * scale;
      g.beginPath();
      g.moveTo(sx, sy);
      g.quadraticCurveTo(sx + 4 * scale, sy + 5 * scale, sx, sy + 8 * scale);
      g.quadraticCurveTo(sx - 4 * scale, sy + 5 * scale, sx, sy);
      g.fill();
    }
  }

  function drawCustomer(st: StationLayout, c: CustomerRuntime): void {
    const r = st.customerRect;
    const accent = customerAccent(c.defId);
    const cx = r.x + r.w / 2;
    const bodyTop = r.y + r.h * 0.46;
    const bodyW = Math.min(r.w * 0.5, 70);
    const bodyH = r.h * 0.5;
    const scale = Math.min(1.1, r.h / 120);

    // 身体（圆角梯形近似）
    g.save();
    g.shadowColor = 'rgba(0,0,0,0.08)';
    g.shadowBlur = 8;
    g.shadowOffsetY = 3;
    g.fillStyle = accent;
    roundRect(g, cx - bodyW / 2, bodyTop, bodyW, bodyH + 6, 14);
    g.fill();
    g.restore();

    // 头 + 脸
    const headCy = bodyTop - 6 * scale;
    drawFace(cx, headCy, scale, c.mood, lighten(accent, 0.18));

    // 名字标签
    const def = custById.get(c.defId);
    if (def) {
      g.fillStyle = COL.ink;
      g.font = `600 ${Math.round(13 * scale)}px ${UI_FONT}`;
      g.textAlign = 'center';
      g.textBaseline = 'top';
      g.fillText(def.name, cx, r.y + 1);
    }

    // 耐心条
    const t = clamp01(c.patience / Math.max(1, c.maxPatience));
    const barW = r.w * 0.62;
    const barH = 6;
    const barX = cx - barW / 2;
    const barY = r.y + r.h - barH - 2;
    g.fillStyle = 'rgba(43,43,51,0.12)';
    roundRect(g, barX, barY, barW, barH, 3);
    g.fill();
    g.fillStyle = patienceColor(t);
    roundRect(g, barX, barY, barW * t, barH, 3);
    g.fill();
  }

  function drawEmptyStation(st: StationLayout): void {
    const r = st.customerRect;
    g.fillStyle = 'rgba(43,43,51,0.05)';
    roundRect(g, r.x + 8, r.y + 14, r.w - 16, r.h - 18, 14);
    g.fill();
    g.fillStyle = 'rgba(43,43,51,0.28)';
    g.font = `500 13px ${UI_FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('空闲工位', r.x + r.w / 2, r.y + r.h / 2 + 2);
  }

  // ——————————————————————————— 绘制：手机 + 图标网格 ———————————————————————————
  function drawPhone(st: StationLayout): void {
    const p = st.phoneRect;
    // 阴影机身
    g.save();
    g.shadowColor = 'rgba(0,0,0,0.18)';
    g.shadowBlur = 12;
    g.shadowOffsetY = 5;
    g.fillStyle = '#1F2129';
    roundRect(g, p.x, p.y, p.w, p.h, Math.min(18, p.w * 0.16));
    g.fill();
    g.restore();

    // 机身高光边
    g.strokeStyle = 'rgba(255,255,255,0.08)';
    g.lineWidth = 1.5;
    roundRect(g, p.x + 1, p.y + 1, p.w - 2, p.h - 2, Math.min(17, p.w * 0.15));
    g.stroke();

    // 刘海/听筒
    const notchW = p.w * 0.34;
    g.fillStyle = '#0C0D11';
    roundRect(g, p.x + (p.w - notchW) / 2, p.y + p.h * 0.018, notchW, p.h * 0.022, 4);
    g.fill();

    // 屏幕底色
    const s = st.screenRect;
    const sgrad = g.createLinearGradient(s.x, s.y, s.x, s.y + s.h);
    sgrad.addColorStop(0, '#2E3550');
    sgrad.addColorStop(1, '#222A40');
    g.fillStyle = sgrad;
    roundRect(g, s.x, s.y, s.w, s.h, 8);
    g.fill();

    // 底部 Home 指示条
    g.fillStyle = 'rgba(255,255,255,0.5)';
    const hbW = p.w * 0.28;
    roundRect(g, p.x + (p.w - hbW) / 2, p.y + p.h - p.h * 0.05, hbW, 3, 1.5);
    g.fill();
  }

  function drawIconGrid(st: StationLayout, c: CustomerRuntime): void {
    for (let i = 0; i < c.phone.icons.length; i++) {
      const ic = c.phone.icons[i];
      const cell = st.cells.find((cc) => cc.col === ic.col && cc.row === ic.row);
      if (!cell) continue;
      drawIconTile(cell.rect, ic);
    }
  }

  function drawIconTile(cell: Rect, ic: IconRuntime): void {
    const def = iconById.get(ic.id);
    const pad = Math.min(cell.w, cell.h) * 0.16;
    const tx = cell.x + pad;
    const ty = cell.y + pad;
    const tw = cell.w - pad * 2;
    const th = cell.h - pad * 2;
    const size = Math.min(tw, th);
    const tileR = size * 0.24;

    // App 底色
    g.fillStyle = def?.fallbackColor ?? COL.blue;
    drawArtOr(def?.artId ?? ic.id, { x: tx, y: ty, w: tw, h: th }, () => {
      roundRect(g, tx, ty, tw, th, tileR);
      g.fill();
      // 轻微高光
      g.fillStyle = 'rgba(255,255,255,0.14)';
      roundRect(g, tx, ty, tw, th * 0.45, tileR);
      g.fill();
    });

    // glyph
    if (def) {
      g.fillStyle = COL.white;
      g.font = `${Math.round(size * 0.52)}px ${GLYPH_FONT}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(def.fallbackGlyph, tx + tw / 2, ty + th / 2 + size * 0.02);
    }

    // 角标气泡
    if (ic.badge > 0) {
      const bx = tx + tw - size * 0.04;
      const by = ty + size * 0.04;
      const br = Math.max(9, size * 0.28);
      const label = ic.badge > 99 ? '99+' : String(ic.badge);

      g.save();
      g.shadowColor = 'rgba(0,0,0,0.25)';
      g.shadowBlur = 3;
      g.shadowOffsetY = 1;
      g.fillStyle = COL.red;
      if (label.length <= 2) {
        g.beginPath();
        g.arc(bx, by, br, 0, Math.PI * 2);
        g.fill();
      } else {
        // 椭圆胶囊容纳 "99+"
        const cw = br * 2.4;
        roundRect(g, bx - cw / 2, by - br, cw, br * 2, br);
        g.fill();
      }
      g.restore();

      // 白描边
      g.strokeStyle = COL.white;
      g.lineWidth = Math.max(1, size * 0.04);
      if (label.length <= 2) {
        g.beginPath();
        g.arc(bx, by, br, 0, Math.PI * 2);
        g.stroke();
      }

      g.fillStyle = COL.white;
      const badgeFont = label.length >= 3 ? Math.round(br * 0.92) : Math.round(br * 1.12);
      g.font = `700 ${badgeFont}px ${UI_FONT}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(label, bx, by + 0.5);
    }
  }

  // ——————————————————————————— 绘制：候客厅队列 ———————————————————————————
  function drawQueue(lay: SceneLayout, state: GameState): void {
    const area = lay.queue.area;
    const full = state.queue.length >= state.queueCapacity;

    // 背板
    g.fillStyle = full ? 'rgba(255,59,48,0.07)' : 'rgba(91,141,239,0.06)';
    g.fillRect(area.x, area.y, area.w, area.h);
    g.strokeStyle = 'rgba(43,43,51,0.08)';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(area.x, area.y + 0.5);
    g.lineTo(area.x + area.w, area.y + 0.5);
    g.stroke();

    // 标题
    g.fillStyle = full ? COL.red : 'rgba(43,43,51,0.5)';
    g.font = `600 13px ${UI_FONT}`;
    g.textAlign = 'left';
    g.textBaseline = 'top';
    g.fillText(full ? '候客厅 · 拥挤' : '候客厅', area.x + 18, area.y + 8);

    for (let k = 0; k < lay.queue.slots.length; k++) {
      const slot = lay.queue.slots[k];
      const c = state.queue[k];
      if (!c) {
        // 空位
        g.fillStyle = 'rgba(43,43,51,0.06)';
        roundRect(g, slot.x, slot.y, slot.w, slot.h, 14);
        g.fill();
        continue;
      }
      drawQueueAvatar(slot, c, full);
    }
  }

  function drawQueueAvatar(slot: Rect, c: CustomerRuntime, crowded: boolean): void {
    const accent = customerAccent(c.defId);
    const cx = slot.x + slot.w / 2;
    const cy = slot.y + slot.h * 0.42;
    const scale = Math.min(1.0, slot.w / 96) * 1.05;

    // 底座圆
    g.save();
    g.shadowColor = 'rgba(0,0,0,0.08)';
    g.shadowBlur = 6;
    g.shadowOffsetY = 2;
    g.fillStyle = lighten(accent, 0.05);
    g.beginPath();
    g.arc(cx, cy + 6 * scale, 26 * scale, 0, Math.PI * 2);
    g.fill();
    g.restore();

    // 拥挤时整体偏红 tint
    drawFace(cx, cy, scale, crowded ? 'annoyed' : c.mood, lighten(accent, 0.2));
    if (crowded) {
      g.fillStyle = 'rgba(255,59,48,0.10)';
      g.beginPath();
      g.arc(cx, cy + 6 * scale, 26 * scale, 0, Math.PI * 2);
      g.fill();
    }

    // 迷你耐心条
    const t = clamp01(c.patience / Math.max(1, c.maxPatience));
    const barW = slot.w * 0.7;
    const barH = 5;
    const barX = cx - barW / 2;
    const barY = slot.y + slot.h - barH - 2;
    g.fillStyle = 'rgba(43,43,51,0.12)';
    roundRect(g, barX, barY, barW, barH, 2.5);
    g.fill();
    g.fillStyle = patienceColor(t);
    roundRect(g, barX, barY, barW * t, barH, 2.5);
    g.fill();
  }

  // ——— 角色配色（稳定）———
  const accentPalette = [COL.blue, COL.orange, COL.mint, '#7C4DFF', '#FF6B6B', '#43A047'];
  function customerAccent(defId: string): string {
    return accentPalette[Math.floor(rng(defId) * accentPalette.length) % accentPalette.length];
  }
  function lighten(hex: string, amt: number): string {
    // 简单提亮
    const h = hex.replace('#', '');
    if (h.length !== 6) return hex;
    const r = parseInt(h.slice(0, 2), 16);
    const gg = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    const lr = Math.round(lerp(r, 255, amt));
    const lg = Math.round(lerp(gg, 255, amt));
    const lb = Math.round(lerp(b, 255, amt));
    return `rgb(${lr},${lg},${lb})`;
  }

  // ——————————————————————————— 绘制：粒子 ———————————————————————————
  function updateAndDrawParticles(dt: number): void {
    const now = ctx.now();
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      const age = now - p.born;
      if (age >= p.life) {
        particles.splice(i, 1);
        continue;
      }
      const t = age / p.life; // 0..1
      // 物理积分
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.kind === 'speck' || p.kind === 'coin') {
        p.vy += 0.00018 * dt; // 重力
      }
      if (p.rot !== undefined && p.vrot !== undefined) p.rot += p.vrot * dt;

      drawParticle(p, t);
    }
  }

  function drawParticle(p: Particle, t: number): void {
    const fade = 1 - t;
    switch (p.kind) {
      case 'speck': {
        g.globalAlpha = fade;
        g.fillStyle = p.color;
        g.beginPath();
        g.arc(p.x, p.y, p.size * (1 - t * 0.4), 0, Math.PI * 2);
        g.fill();
        g.globalAlpha = 1;
        break;
      }
      case 'ring': {
        g.globalAlpha = fade * 0.8;
        g.strokeStyle = p.color;
        g.lineWidth = 3 * fade + 1;
        g.beginPath();
        g.arc(p.x, p.y, 6 + t * 34, 0, Math.PI * 2);
        g.stroke();
        g.globalAlpha = 1;
        break;
      }
      case 'sparkle': {
        g.globalAlpha = fade;
        g.fillStyle = p.color;
        const s = p.size * (1 - t * 0.3);
        drawStar(p.x, p.y, s, s * 0.45);
        g.globalAlpha = 1;
        break;
      }
      case 'coin': {
        g.globalAlpha = fade;
        const sx = Math.abs(Math.cos(p.rot ?? 0)); // 翻转
        g.fillStyle = COL.amber;
        g.beginPath();
        g.ellipse(p.x, p.y, p.size * sx * 0.5 + 1, p.size * 0.5, 0, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = '#D99A1E';
        g.lineWidth = 1.5;
        g.stroke();
        g.globalAlpha = 1;
        break;
      }
      case 'text': {
        g.globalAlpha = fade;
        g.fillStyle = p.color;
        g.font = `800 ${p.size}px ${UI_FONT}`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.strokeStyle = 'rgba(255,255,255,0.85)';
        g.lineWidth = 3;
        if (p.text) {
          g.strokeText(p.text, p.x, p.y);
          g.fillText(p.text, p.x, p.y);
        }
        g.globalAlpha = 1;
        break;
      }
      case 'check': {
        const pop = t < 0.25 ? t / 0.25 : 1;
        const s = p.size * pop;
        g.globalAlpha = fade;
        // 绿底圆
        g.fillStyle = p.color;
        g.beginPath();
        g.arc(p.x, p.y, s, 0, Math.PI * 2);
        g.fill();
        // 对勾
        g.strokeStyle = COL.white;
        g.lineWidth = Math.max(2, s * 0.16);
        g.lineCap = 'round';
        g.lineJoin = 'round';
        g.beginPath();
        g.moveTo(p.x - s * 0.4, p.y + s * 0.02);
        g.lineTo(p.x - s * 0.08, p.y + s * 0.34);
        g.lineTo(p.x + s * 0.42, p.y - s * 0.3);
        g.stroke();
        g.globalAlpha = 1;
        break;
      }
      case 'puff': {
        g.globalAlpha = fade * 0.5;
        g.fillStyle = p.color;
        g.beginPath();
        g.arc(p.x, p.y, p.size * (0.6 + t), 0, Math.PI * 2);
        g.fill();
        g.globalAlpha = 1;
        break;
      }
      case 'banner': {
        const pop = t < 0.2 ? t / 0.2 : 1;
        const out = t > 0.85 ? (1 - t) / 0.15 : 1;
        g.globalAlpha = out;
        g.save();
        g.translate(p.x, p.y);
        g.scale(pop, pop);
        // 横幅
        const w = 240;
        const h = 76;
        g.fillStyle = p.color;
        g.shadowColor = 'rgba(0,0,0,0.2)';
        g.shadowBlur = 16;
        roundRect(g, -w / 2, -h / 2, w, h, 18);
        g.fill();
        g.shadowBlur = 0;
        g.fillStyle = COL.white;
        g.font = `800 ${p.size}px ${UI_FONT}`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        if (p.text) g.fillText(p.text, 0, 2);
        g.fillStyle = 'rgba(255,255,255,0.9)';
        g.font = `600 14px ${UI_FONT}`;
        g.fillText('升级啦！', 0, h / 2 - 12);
        g.restore();
        g.globalAlpha = 1;
        break;
      }
      case 'flash': {
        g.globalAlpha = (1 - t) * 0.35;
        g.fillStyle = p.color;
        g.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
        g.globalAlpha = 1;
        break;
      }
    }
  }

  function drawStar(cx: number, cy: number, outer: number, inner: number): void {
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? outer : inner;
      const a = (Math.PI / 5) * i - Math.PI / 2;
      const px = cx + Math.cos(a) * r;
      const py = cy + Math.sin(a) * r;
      if (i === 0) g.moveTo(px, py);
      else g.lineTo(px, py);
    }
    g.closePath();
    g.fill();
  }

  // ——————————————————————————— 主循环 ———————————————————————————
  function render(dt: number): void {
    const state = ctx.state;
    const lay = computeLayout(state);
    frameLayout = lay;

    g.clearRect(0, 0, LOGICAL_W, LOGICAL_H);
    drawBackground();
    drawShopSign();

    for (let i = 0; i < lay.stations.length; i++) {
      const st = lay.stations[i];
      const c = state.activeCustomers[i];
      if (c) {
        drawCustomer(st, c);
        drawPhone(st);
        drawIconGrid(st, c);
      } else {
        drawEmptyStation(st);
        drawPhone(st); // 空台仍显示待修手机外框（暗）
        g.save();
        g.globalAlpha = 0.35;
        g.fillStyle = '#222A40';
        roundRect(g, st.screenRect.x, st.screenRect.y, st.screenRect.w, st.screenRect.h, 8);
        g.fill();
        g.restore();
      }
    }

    drawQueue(lay, state);
    updateAndDrawParticles(dt);

    frameLayout = null;
  }

  return {
    name: 'render',
    init(c) {
      ctx = c;
      g = c.ctx2d;
      for (const ic of c.content.icons) iconById.set(ic.id, ic);
      for (const cu of c.content.customers) custById.set(cu.id, cu);
      wireEvents();
    },
    update(dt) {
      render(dt);
    },
    destroy() {
      for (const u of unsubs) u();
      unsubs.length = 0;
      particles.length = 0;
    },
  };
}
