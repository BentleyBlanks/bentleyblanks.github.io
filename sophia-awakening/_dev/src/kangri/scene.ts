// 《烽火敌后》· 2.5D 战场（纯 Canvas2D，无图片资产、无 Three.js）。
// 一张华北大地图（斜 45° 等距投影）：黄土地形 + 控制区染色（根据地红/敌占灰）+ 区域据点/村落。
// 中心根据地是活的：买设施→地图上长出对应建筑；兵员越多→村里走动的小人越多。
// 扫荡=日军兵团（多个人形+「×数量」旗标）从据点开拔压过来，我方部队列阵会战：曳光弹、倒下的小人、火光。
// 群众大范围转移=村民队伍拖家带口向山里疏散。全部状态读自 core 的 KRState，本文件只画不改。
import {
  BUILDINGS, REGIONS, TUNING,
  phase, type KRState, type Sweep
} from "./core";

export interface Scene25D {
  ok: boolean;
  resize: () => void;
  frame: (dt: number, s: KRState) => void;
  hitRegion: (cx: number, cy: number) => string | null; // canvas 内坐标 → 区域 id（含 "base"=中心根据地）
  dispose: () => void;
}

// 地图关键点（归一化 0..1 地图坐标；REGIONS 的 x,y 同一坐标系）
const BASE = { x: 0.5, y: 0.68 };   // 中心根据地（太行山中心村）
const EVAC = { x: 0.14, y: 0.86 };  // 群众转移去向（深山）
const REGION_R = 0.055;             // 区域点击半径（地图坐标）

// ── 简易 value noise（地形高度场）──
function hash2(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function vnoise(x: number, y: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x: number, y: number): number {
  let v = 0, amp = 0.5, fx = x, fy = y;
  for (let i = 0; i < 4; i++) { v += amp * vnoise(fx, fy); fx *= 2.03; fy *= 2.03; amp *= 0.5; }
  return v;
}
const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

// ── 表现层实体 ──
interface Walker { x: number; y: number; tx: number; ty: number; spd: number; kind: "villager" | "soldier" | "evac"; ph: number; done?: boolean; }
interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; kind: "smoke" | "flame" | "flash" | "puff"; r: number; }
interface Corpse { x: number; y: number; life: number; jp: boolean; }
interface Tracer { x1: number; y1: number; x2: number; y2: number; life: number; jp: boolean; }

export function initScene(canvas: HTMLCanvasElement): Scene25D {
  const ctx0 = canvas.getContext("2d");
  if (!ctx0) return { ok: false, resize() {}, frame() {}, hitRegion: () => null, dispose() {} };
  const ctx: CanvasRenderingContext2D = ctx0;

  let W = 0, H = 0, dpr = 1;
  // 投影参数（resize 时重算）
  let cx = 0, cy = 0, A = 400, B = 200;
  const proj = (mx: number, my: number): { x: number; y: number } => {
    const u = mx - 0.5, v = my - 0.5;
    return { x: cx + (u - v) * A, y: cy + (u + v) * B };
  };
  // 逆投影（点击检测）
  const unproj = (sx: number, sy: number): { x: number; y: number } => {
    const px = (sx - cx) / A, py = (sy - cy) / B;
    return { x: (px + py) / 2 + 0.5, y: (py - px) / 2 + 0.5 };
  };

  const terrain = document.createElement("canvas");
  const control = document.createElement("canvas");
  let controlSig = "";
  let time = 0;

  const walkers: Walker[] = [];
  const particles: Particle[] = [];
  const corpses: Corpse[] = [];
  const tracers: Tracer[] = [];
  let prevJp = 0, prevOur = 0, prevSweepOn = false;

  // ══ 地形层（静态，resize 时重画）══════════════════════════════
  function renderTerrain(): void {
    terrain.width = Math.max(1, W * dpr); terrain.height = Math.max(1, H * dpr);
    const g = terrain.getContext("2d")!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    // 底：暗夜战图
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "#0c0d08"); bg.addColorStop(1, "#12100a");
    g.fillStyle = bg; g.fillRect(0, 0, W, H);

    // 等距地块
    const N = 46;
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const mx = i / N, my = j / N, s = 1 / N;
        const h = fbm(mx * 5.2 + 7, my * 5.2 + 3);
        const p0 = proj(mx, my), p1 = proj(mx + s, my), p2 = proj(mx + s, my + s), p3 = proj(mx, my + s);
        // 黄土 → 山地
        let r = 62 + h * 52, gg = 55 + h * 44, b = 34 + h * 22;
        if (h > 0.60) { r *= 0.72; gg *= 0.70; b *= 0.72; } // 山脊压暗
        if (h < 0.34) { r *= 1.08; gg *= 1.12; b *= 0.95; } // 平原微亮
        // 侧光（东北→西南）
        const hl = fbm((mx - 0.012) * 5.2 + 7, (my - 0.012) * 5.2 + 3) - h;
        const lig = clamp(1 + hl * 5.5, 0.72, 1.3);
        g.fillStyle = `rgb(${(r * lig) | 0},${(gg * lig) | 0},${(b * lig) | 0})`;
        g.beginPath(); g.moveTo(p0.x, p0.y); g.lineTo(p1.x, p1.y); g.lineTo(p2.x, p2.y); g.lineTo(p3.x, p3.y); g.closePath(); g.fill();
      }
    }
    // 山脊「^」符号 + 散树（老战图风）
    for (let k = 0; k < 480; k++) {
      const mx = hash2(k, 1.7), my = hash2(k, 9.2);
      const h = fbm(mx * 5.2 + 7, my * 5.2 + 3);
      const p = proj(mx, my);
      if (h > 0.62) {
        const s = A * 0.008 * (1 + h);
        g.strokeStyle = "rgba(30,26,16,.55)"; g.lineWidth = 1.2;
        g.beginPath(); g.moveTo(p.x - s, p.y + s * 0.6); g.lineTo(p.x, p.y - s * 0.7); g.lineTo(p.x + s, p.y + s * 0.6); g.stroke();
      } else if (h < 0.42 && hash2(k, 4.4) < 0.3) {
        g.fillStyle = "rgba(52,66,32,.7)";
        g.beginPath(); g.arc(p.x, p.y, A * 0.004, 0, 6.29); g.fill();
        g.strokeStyle = "rgba(40,32,20,.6)"; g.lineWidth = 1;
        g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x, p.y + A * 0.006); g.stroke();
      }
    }
    // 河（滹沱河意象：从西北蜿蜒到东南）
    g.strokeStyle = "rgba(58,74,72,.85)"; g.lineWidth = Math.max(2, A * 0.008); g.lineCap = "round";
    g.beginPath();
    for (let t = 0; t <= 40; t++) {
      const tt = t / 40;
      const mx = lerp(0.08, 0.92, tt) + Math.sin(tt * 9 + 1.3) * 0.035;
      const my = lerp(0.16, 0.5, tt) + Math.sin(tt * 6.2) * 0.05;
      const p = proj(mx, my);
      if (t === 0) g.moveTo(p.x, p.y); else g.lineTo(p.x, p.y);
    }
    g.stroke();
    // 地图外沿描边（战图边框感）
    const c0 = proj(0, 0), c1 = proj(1, 0), c2 = proj(1, 1), c3 = proj(0, 1);
    g.strokeStyle = "rgba(216,201,160,.22)"; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(c0.x, c0.y); g.lineTo(c1.x, c1.y); g.lineTo(c2.x, c2.y); g.lineTo(c3.x, c3.y); g.closePath(); g.stroke();
    g.strokeStyle = "rgba(216,201,160,.08)";
    g.beginPath(); g.moveTo(c0.x, c0.y - 5); g.lineTo(c1.x + 8, c1.y); g.lineTo(c2.x, c2.y + 5); g.lineTo(c3.x - 8, c3.y); g.closePath(); g.stroke();
  }

  // ══ 控制区层（区域归属变化时重画）══════════════════════════════
  function renderControl(s: KRState): void {
    control.width = Math.max(1, W * dpr); control.height = Math.max(1, H * dpr);
    const g = control.getContext("2d")!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const zone = (mx: number, my: number, red: boolean, big = 1): void => {
      const p = proj(mx, my);
      const R = A * 0.16 * big;
      g.save(); g.translate(p.x, p.y); g.scale(1, 0.5); // 椭圆化贴地
      // 注意：渐变坐标吃当前变换——必须在 translate 之后以 (0,0) 为心建
      const gr = g.createRadialGradient(0, 0, 0, 0, 0, R);
      if (red) { gr.addColorStop(0, "rgba(178,44,28,.42)"); gr.addColorStop(0.55, "rgba(158,38,24,.24)"); gr.addColorStop(1, "rgba(158,38,24,0)"); }
      else { gr.addColorStop(0, "rgba(64,74,88,.38)"); gr.addColorStop(0.6, "rgba(56,66,80,.18)"); gr.addColorStop(1, "rgba(56,66,80,0)"); }
      g.fillStyle = gr;
      g.beginPath(); g.arc(0, 0, R, 0, 6.29); g.fill();
      // 控制圈虚线边界（根据地=红实感，敌占=灰）
      g.strokeStyle = red ? "rgba(226,86,77,.38)" : "rgba(120,130,142,.2)";
      g.lineWidth = 1.4; g.setLineDash([6, 7]);
      g.beginPath(); g.arc(0, 0, R * 0.72, 0, 6.29); g.stroke();
      g.setLineDash([]); g.restore();
    };
    zone(BASE.x, BASE.y, true, 1.25);
    for (const r of REGIONS) zone(r.x, r.y, !!s.regions[r.id], s.regions[r.id] ? 1 : 0.85);
  }

  // ══ 小人 ══════════════════════════════════════════════════════
  // 画一个 2.5D 小人（脚站在 sx,sy）。k=身高像素比例；jp=日军；civ=群众。
  function drawFigure(g: CanvasRenderingContext2D, sx: number, sy: number, k: number, opts: { jp?: boolean; civ?: boolean; walk?: number; face?: number; carry?: boolean }): void {
    const { jp = false, civ = false, walk = 0, face = 1, carry = false } = opts;
    const cloth = jp ? "#6b6b3a" : civ ? "#7a7058" : "#8a7d55";
    const dark = jp ? "#50502a" : civ ? "#5c5442" : "#6f6540";
    // 影
    g.fillStyle = "rgba(0,0,0,.30)";
    g.beginPath(); g.ellipse(sx, sy, k * 3.2, k * 1.2, 0, 0, 6.29); g.fill();
    const swing = Math.sin(walk) * k * 1.6;
    // 腿
    g.strokeStyle = dark; g.lineWidth = k * 1.5; g.lineCap = "round";
    g.beginPath(); g.moveTo(sx, sy - k * 4); g.lineTo(sx + swing * 0.5, sy); g.stroke();
    g.beginPath(); g.moveTo(sx, sy - k * 4); g.lineTo(sx - swing * 0.5, sy); g.stroke();
    // 躯干
    g.strokeStyle = cloth; g.lineWidth = k * 2.6;
    g.beginPath(); g.moveTo(sx, sy - k * 4); g.lineTo(sx, sy - k * 7.4); g.stroke();
    // 头
    g.fillStyle = "#caa27a";
    g.beginPath(); g.arc(sx, sy - k * 8.6, k * 1.5, 0, 6.29); g.fill();
    // 帽/盔
    if (jp) { // 钢盔+屁帘
      g.fillStyle = dark;
      g.beginPath(); g.arc(sx, sy - k * 8.9, k * 1.7, Math.PI, 0); g.fill();
      g.fillRect(sx - k * 1.4, sy - k * 8.7, k * 2.8, k * 0.9);
    } else if (civ) {
      g.fillStyle = dark; g.fillRect(sx - k * 1.4, sy - k * 9.7, k * 2.8, k * 0.8);
    } else { // 八路布军帽
      g.fillStyle = dark; g.fillRect(sx - k * 1.6, sy - k * 10.1, k * 3.2, k * 1.1);
      g.fillRect(sx - k * 1.6, sy - k * 9.2, k * 3.4, k * 0.4);
    }
    // 枪 / 扁担行李
    if (carry) {
      g.strokeStyle = "#4a3826"; g.lineWidth = k * 0.8;
      g.beginPath(); g.moveTo(sx - k * 3.4, sy - k * 7.6); g.lineTo(sx + k * 3.4, sy - k * 7.0); g.stroke();
      g.fillStyle = "#5c5442";
      g.fillRect(sx - k * 4.2, sy - k * 7.9, k * 1.7, k * 1.4); g.fillRect(sx + k * 2.6, sy - k * 7.3, k * 1.7, k * 1.4);
    } else if (!civ) {
      g.strokeStyle = "#3a2f22"; g.lineWidth = k * 0.9;
      g.beginPath(); g.moveTo(sx - face * k * 1.2, sy - k * 5.2); g.lineTo(sx + face * k * 3.6, sy - k * 8.2); g.stroke();
    }
  }

  // ══ 2.5D 建筑基元 ══════════════════════════════════════════════
  // 等距盒子：底中心(sx,sy)、半宽 w、半深 d、高 h（屏幕像素）。
  function isoBox(g: CanvasRenderingContext2D, sx: number, sy: number, w: number, d: number, h: number, top: string, left: string, right: string): void {
    const T = { x: sx, y: sy - h };
    g.fillStyle = left; // 左前脸
    g.beginPath(); g.moveTo(sx - w, sy - w * 0.5 - 0); g.lineTo(sx, sy); g.lineTo(sx, T.y); g.lineTo(sx - w, T.y - w * 0.5); g.closePath(); g.fill();
    g.fillStyle = right; // 右前脸
    g.beginPath(); g.moveTo(sx + d, sy - d * 0.5); g.lineTo(sx, sy); g.lineTo(sx, T.y); g.lineTo(sx + d, T.y - d * 0.5); g.closePath(); g.fill();
    g.fillStyle = top; // 顶
    g.beginPath(); g.moveTo(sx, T.y); g.lineTo(sx - w, T.y - w * 0.5); g.lineTo(sx - w + d, T.y - w * 0.5 - d * 0.5); g.lineTo(sx + d, T.y - d * 0.5); g.closePath(); g.fill();
  }
  // 民房：盒子+双坡顶
  function drawHouse(g: CanvasRenderingContext2D, sx: number, sy: number, k: number, burnt = false): void {
    const wall = burnt ? "#3a3228" : "#b0a077", wallD = burnt ? "#2c2419" : "#8f8058", roof = burnt ? "#241d14" : "#6f5335", roofL = burnt ? "#2c241a" : "#7f6040";
    isoBox(g, sx, sy, k * 7, k * 7, k * 6, wall, wallD, wall);
    // 双坡顶
    g.fillStyle = roofL;
    g.beginPath(); g.moveTo(sx - k * 8, sy - k * 6 - k * 4); g.lineTo(sx, sy - k * 6); g.lineTo(sx, sy - k * 13); g.closePath(); g.fill();
    g.fillStyle = roof;
    g.beginPath(); g.moveTo(sx + k * 8, sy - k * 6 - k * 4); g.lineTo(sx, sy - k * 6); g.lineTo(sx, sy - k * 13); g.closePath(); g.fill();
    if (!burnt) { // 门
      g.fillStyle = "#463826"; g.fillRect(sx - k * 3.6, sy - k * 5, k * 2.2, k * 4.4);
    }
  }
  // 红旗
  function drawFlag(g: CanvasRenderingContext2D, sx: number, sy: number, k: number, t: number, jp = false): void {
    g.strokeStyle = "#5a4a30"; g.lineWidth = k * 0.9;
    g.beginPath(); g.moveTo(sx, sy); g.lineTo(sx, sy - k * 14); g.stroke();
    const wav = Math.sin(t * 3 + sx * 0.1) * k;
    if (jp) {
      g.fillStyle = "#ddd6c2";
      g.beginPath(); g.moveTo(sx, sy - k * 14); g.lineTo(sx + k * 7, sy - k * 13.4 + wav * 0.4); g.lineTo(sx + k * 7, sy - k * 9.6 + wav * 0.4); g.lineTo(sx, sy - k * 10); g.closePath(); g.fill();
      g.fillStyle = "#b23a2c";
      g.beginPath(); g.arc(sx + k * 3.5, sy - k * 11.7 + wav * 0.2, k * 1.5, 0, 6.29); g.fill();
    } else {
      g.fillStyle = "#c8392e";
      g.beginPath(); g.moveTo(sx, sy - k * 14); g.lineTo(sx + k * 8, sy - k * 13.2 + wav * 0.5); g.lineTo(sx + k * 8, sy - k * 9.2 + wav * 0.5); g.lineTo(sx, sy - k * 10); g.closePath(); g.fill();
    }
  }
  // 炮楼（日军据点）
  function drawBlockhouse(g: CanvasRenderingContext2D, sx: number, sy: number, k: number, t: number): void {
    isoBox(g, sx, sy, k * 5, k * 5, k * 15, "#7d8188", "#565a62", "#6a6e76");
    isoBox(g, sx, sy - k * 15, k * 6, k * 6, k * 3, "#84888f", "#5c6068", "#70747c");
    // 枪眼
    g.fillStyle = "#1c1e22";
    g.fillRect(sx - k * 3.4, sy - k * 11, k * 1.4, k * 2); g.fillRect(sx + k * 1.6, sy - k * 12, k * 1.4, k * 2);
    drawFlag(g, sx, sy - k * 18, k * 0.8, t, true);
    // 铁丝网桩
    g.strokeStyle = "rgba(40,42,46,.8)"; g.lineWidth = 1;
    for (let i = -2; i <= 2; i++) {
      g.beginPath(); g.moveTo(sx + i * k * 5, sy + k * 4 - Math.abs(i) * k); g.lineTo(sx + i * k * 5, sy + k * 1.5 - Math.abs(i) * k); g.stroke();
    }
  }

  // 设施→建筑 sprite（画在中心根据地周围；idx=BUILDINGS 下标）
  function drawFacility(g: CanvasRenderingContext2D, idx: number, sx: number, sy: number, k: number, t: number): void {
    const id = BUILDINGS[idx].id;
    switch (id) {
      case "militia": // 练兵场：草垛靶+小旗
        g.fillStyle = "#8f8058";
        g.save(); g.translate(sx, sy); g.scale(1, 0.5); g.beginPath(); g.arc(0, 0, k * 7, 0, 6.29); g.restore(); g.fill();
        g.fillStyle = "#6a5c3a";
        g.save(); g.translate(sx, sy); g.scale(1, 0.5); g.beginPath(); g.arc(0, 0, k * 5.4, 0, 6.29); g.restore(); g.fill();
        isoBox(g, sx + k * 4, sy - k * 2, k * 1.6, k * 1.6, k * 4, "#a89a68", "#7d7048", "#948658");
        drawFlag(g, sx - k * 4, sy - k * 2, k * 0.7, t);
        break;
      case "farm": { // 梯田
        for (let i = 0; i < 3; i++) {
          const yy = sy - i * k * 2.6;
          g.fillStyle = i % 2 ? "#5d6e33" : "#52632c";
          g.beginPath(); g.moveTo(sx, yy); g.lineTo(sx - k * 8, yy - k * 4); g.lineTo(sx - k * 8 + k * 3, yy - k * 5.5); g.lineTo(sx + k * 3, yy - k * 1.5); g.closePath(); g.fill();
        }
        break;
      }
      case "tunnel": // 地道口：土丘+黑洞
        g.fillStyle = "#5c4f33";
        g.save(); g.translate(sx, sy); g.scale(1, 0.6); g.beginPath(); g.arc(0, -k * 1.5, k * 5, Math.PI, 0); g.restore(); g.fill();
        g.fillStyle = "#14110b";
        g.save(); g.translate(sx, sy); g.scale(1, 0.7); g.beginPath(); g.arc(0, -k * 0.6, k * 2.4, Math.PI, 0); g.restore(); g.fill();
        break;
      case "arsenal": case "arsenal2": { // 兵工坊/黄崖洞：厂房+烟囱冒烟
        const big = id === "arsenal2" ? 1.5 : 1;
        isoBox(g, sx, sy, k * 8 * big, k * 6 * big, k * 6 * big, "#9a8c62", "#6f6444", "#847752");
        isoBox(g, sx + k * 4 * big, sy - k * 6 * big, k * 1.3, k * 1.3, k * 7 * big, "#6a5f42", "#4d4530", "#5c5238");
        if (Math.random() < 0.25) particles.push({ x: sx + k * 4 * big, y: sy - k * 13 * big, vx: 3, vy: -9, life: 0, max: 2.4, kind: "smoke", r: k * 2 });
        break;
      }
      case "intel": // 情报站：消息树+瞭望
        isoBox(g, sx, sy, k * 2, k * 2, k * 12, "#8a7d55", "#615738", "#766a48");
        g.fillStyle = "#a89a68"; g.fillRect(sx - k * 3, sy - k * 14, k * 6, k * 2.4);
        g.strokeStyle = "#4a3826"; g.lineWidth = k;
        g.beginPath(); g.moveTo(sx + k * 6, sy); g.lineTo(sx + k * 6, sy - k * 9); g.stroke();
        g.fillStyle = "#4a5a2a";
        g.beginPath(); g.arc(sx + k * 6, sy - k * 10.5, k * 2.6, 0, 6.29); g.fill();
        break;
      case "supply": // 被服医疗：帐篷+红十字
        g.fillStyle = "#9a9070";
        g.beginPath(); g.moveTo(sx - k * 6, sy); g.lineTo(sx, sy - k * 8); g.lineTo(sx + k * 6, sy); g.closePath(); g.fill();
        g.fillStyle = "#857b5c";
        g.beginPath(); g.moveTo(sx, sy - k * 8); g.lineTo(sx + k * 6, sy); g.lineTo(sx + k * 8.5, sy - k * 1.6); g.closePath(); g.fill();
        g.fillStyle = "#c0392e"; g.fillRect(sx - k * 0.7, sy - k * 5.6, k * 1.4, k * 3.4); g.fillRect(sx - k * 1.7, sy - k * 4.6, k * 3.4, k * 1.4);
        break;
      case "raid": // 破袭队：拆下的铁轨+枕木堆
        g.strokeStyle = "#55585e"; g.lineWidth = k * 1.1;
        g.beginPath(); g.moveTo(sx - k * 7, sy + k); g.lineTo(sx + k * 5, sy - k * 5); g.stroke();
        g.beginPath(); g.moveTo(sx - k * 5, sy + k * 2.5); g.lineTo(sx + k * 7, sy - k * 3.5); g.stroke();
        g.fillStyle = "#4a3826";
        for (let i = 0; i < 3; i++) g.fillRect(sx - k * 3 + i * k * 2.6, sy - k * 2 - i * k * 1.3, k * 4.5, k * 1.2);
        break;
      case "college": // 抗大分校：书院+牌匾
        isoBox(g, sx, sy, k * 8, k * 6, k * 7, "#ab9c70", "#7c7050", "#93865e");
        g.fillStyle = "#6f5335";
        g.beginPath(); g.moveTo(sx - k * 9.5, sy - k * 7 - k * 3); g.lineTo(sx, sy - k * 7); g.lineTo(sx, sy - k * 14.5); g.closePath(); g.fill();
        g.fillStyle = "#7f6040";
        g.beginPath(); g.moveTo(sx + k * 9.5, sy - k * 7 - k * 3); g.lineTo(sx, sy - k * 7); g.lineTo(sx, sy - k * 14.5); g.closePath(); g.fill();
        g.fillStyle = "#2c2419"; g.fillRect(sx - k * 3.4, sy - k * 6.4, k * 6.8, k * 1.8);
        break;
      case "mainforce": // 主力团：营房排+军旗
        for (let i = 0; i < 3; i++) isoBox(g, sx - k * 4 + i * k * 4.2, sy - i * k * 2.1, k * 3, k * 5, k * 4, "#8a7d55", "#615738", "#766a48");
        drawFlag(g, sx + k * 6, sy - k * 6, k, t);
        break;
    }
  }

  // ══ 兵团（多个人形 + ×数量旗标）══════════════════════════════
  function drawFormation(g: CanvasRenderingContext2D, sx: number, sy: number, count: number, jp: boolean, k: number, t: number, moving: boolean, face: number): void {
    if (count <= 0) return;
    const n = clamp(Math.round(3 + Math.log2(count + 1) * 2.4), 3, 20);
    const cols = Math.ceil(Math.sqrt(n * 1.8)), rows = Math.ceil(n / cols);
    let idx = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols && idx < n; c++, idx++) {
        const jx = (hash2(idx, jp ? 3 : 5) - 0.5) * k * 3;
        const fx = sx + (c - (cols - 1) / 2) * k * 7 + (r % 2) * k * 3 + jx;
        const fy = sy + (r - (rows - 1) / 2) * k * 5;
        drawFigure(g, fx, fy, k * 0.9, { jp, walk: moving ? t * 9 + idx * 1.7 : Math.sin(idx) * 0.3, face });
      }
    }
    // 旗标：底色牌 + 「日军/我军 ×N」
    const label = `${jp ? "日军" : "我军"} ×${Math.max(1, Math.round(count))}`;
    g.font = `700 ${Math.max(11, k * 6)}px 'Noto Serif SC', serif`;
    const tw = g.measureText(label).width;
    const by = sy - rows * k * 5 - k * 16;
    g.fillStyle = jp ? "rgba(46,48,30,.92)" : "rgba(90,26,18,.92)";
    g.strokeStyle = jp ? "#8a8a50" : "#e2564d"; g.lineWidth = 1;
    const bx = sx - tw / 2 - k * 3;
    g.beginPath(); g.roundRect(bx, by, tw + k * 6, k * 9, 3); g.fill(); g.stroke();
    g.fillStyle = jp ? "#d8d2a8" : "#f2d8c0";
    g.fillText(label, sx - tw / 2, by + k * 6.6);
    // 牌→队伍的小竖线
    g.strokeStyle = jp ? "rgba(138,138,80,.5)" : "rgba(226,86,77,.5)";
    g.beginPath(); g.moveTo(sx, by + k * 9); g.lineTo(sx, sy - rows * k * 3); g.stroke();
  }

  // ══ 主帧 ══════════════════════════════════════════════════════
  const regionScreen = new Map<string, { x: number; y: number }>();

  function frame(dt: number, s: KRState): void {
    time += dt;
    const t = time;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    // 控制区签名（收复变化→重画控制层）
    const sig = REGIONS.map((r) => (s.regions[r.id] ? "1" : "0")).join("");
    if (sig !== controlSig) { controlSig = sig; renderControl(s); }

    ctx.drawImage(terrain, 0, 0, W, H);
    ctx.drawImage(control, 0, 0, W, H);

    const k = clamp(A * 0.006, 1.1, 2.6); // 全局小人/建筑比例
    const sw = s.sweep;

    // —— 深度排序绘制队列：所有"立着的东西"按屏幕 y 排序 ——
    const queue: { y: number; draw: () => void }[] = [];
    const push = (y: number, draw: () => void): void => { queue.push({ y, draw }); };

    // ① 区域据点/根据地村落
    regionScreen.clear();
    for (const r of REGIONS) {
      const p = proj(r.x, r.y);
      regionScreen.set(r.id, p);
      const owned = !!s.regions[r.id];
      if (owned) {
        push(p.y, () => {
          drawHouse(ctx, p.x - k * 8, p.y + k * 2, k * 0.8);
          drawHouse(ctx, p.x + k * 9, p.y + k * 4, k * 0.7);
          drawFlag(ctx, p.x, p.y - k * 2, k, t);
        });
      } else {
        push(p.y, () => drawBlockhouse(ctx, p.x, p.y, k, t));
      }
      // 名牌（不参与深度排序，最后画）
    }
    const basePt = proj(BASE.x, BASE.y);
    regionScreen.set("base", basePt);

    // ② 中心根据地：村子随设施生长
    const totalBuild = s.buildings.reduce((a, b) => a + b, 0);
    const houseN = clamp(2 + Math.floor(totalBuild / 4), 2, 10);
    for (let i = 0; i < houseN; i++) {
      const ang = (i / houseN) * Math.PI * 2 + 0.7;
      const rr = 0.030 + (i % 3) * 0.011;
      const hx = BASE.x + Math.cos(ang) * rr, hy = BASE.y + Math.sin(ang) * rr;
      const p = proj(hx, hy);
      const burning = sw?.stage === "pillage" && sw.targetRegion === null && i % 2 === 0;
      push(p.y, () => drawHouse(ctx, p.x, p.y, k * 0.9, false));
      if (burning) spawnFlame(p.x, p.y - k * 6, k);
    }
    push(basePt.y + 1, () => drawFlag(ctx, basePt.x, basePt.y, k * 1.3, t));
    // 设施建筑（每类一个 sprite，围绕村子屏幕空间椭圆环两环错开；数量角标交替上下防重叠）
    let slot = 0;
    for (let i = 0; i < BUILDINGS.length; i++) {
      if (s.buildings[i] <= 0) continue;
      const ang = -0.55 + slot * 1.256; // 5 个一圈
      const rad = A * (0.155 + Math.floor(slot / 5) * 0.075);
      const p = { x: basePt.x + Math.cos(ang) * rad, y: basePt.y + Math.sin(ang) * rad * 0.5 };
      const idx = i, cnt = s.buildings[i], below = slot % 2 === 0;
      push(p.y, () => {
        drawFacility(ctx, idx, p.x, p.y, k, t);
        ctx.font = `700 ${Math.max(10, k * 4.6)}px 'Noto Serif SC', serif`;
        const lab = `${BUILDINGS[idx].name}×${cnt}`;
        const twd = ctx.measureText(lab).width;
        const ly = below ? p.y + k * 3.5 : p.y - k * 22;
        ctx.fillStyle = "rgba(14,12,8,.78)";
        ctx.beginPath(); ctx.roundRect(p.x - twd / 2 - 3, ly, twd + 6, k * 7, 3); ctx.fill();
        ctx.fillStyle = "#d8c9a0"; ctx.fillText(lab, p.x - twd / 2, ly + k * 5);
      });
      slot += 1;
    }

    // ③ 村民/战士小人（数量随兵员涨）
    syncWalkers(s);
    for (const wlk of walkers) {
      const p = proj(wlk.x, wlk.y);
      const kind = wlk.kind;
      push(p.y, () => drawFigure(ctx, p.x, p.y, k * (kind === "soldier" ? 0.95 : 0.85), {
        civ: kind !== "soldier", walk: t * 8 + wlk.ph, face: wlk.tx >= wlk.x ? 1 : -1, carry: kind === "evac"
      }));
    }
    stepWalkers(dt, s);

    // ④ 扫荡兵团 + 会战
    if (sw) drawSweep(sw, s, k, t, push, dt);
    trackCasualties(sw, k);

    // 尸体（倒下的小人，渐隐）
    for (let i = corpses.length - 1; i >= 0; i--) {
      const c = corpses[i]; c.life -= dt;
      if (c.life <= 0) { corpses.splice(i, 1); continue; }
      const a = clamp(c.life / 6, 0, 1) * 0.9;
      push(c.y - 1, () => {
        ctx.globalAlpha = a;
        ctx.strokeStyle = c.jp ? "#5c5c32" : "#6f6540"; ctx.lineWidth = k * 2;
        ctx.beginPath(); ctx.moveTo(c.x - k * 4, c.y); ctx.lineTo(c.x + k * 4, c.y - k * 1.4); ctx.stroke();
        ctx.fillStyle = "#b08a60"; ctx.beginPath(); ctx.arc(c.x + k * 5, c.y - k * 1.6, k * 1.3, 0, 6.29); ctx.fill();
        ctx.globalAlpha = 1;
      });
    }

    // 深度排序 & 绘制
    queue.sort((a, b) => a.y - b.y);
    for (const q of queue) q.draw();

    // ⑤ 曳光弹（画在最上层）
    for (let i = tracers.length - 1; i >= 0; i--) {
      const tr = tracers[i]; tr.life -= dt * 6;
      if (tr.life <= 0) { tracers.splice(i, 1); continue; }
      ctx.globalAlpha = clamp(tr.life, 0, 1);
      ctx.strokeStyle = tr.jp ? "#ffb060" : "#fff0a0"; ctx.lineWidth = 1.3;
      const tt = 1 - tr.life;
      ctx.beginPath();
      ctx.moveTo(lerp(tr.x1, tr.x2, tt * 0.85), lerp(tr.y1, tr.y2, tt * 0.85));
      ctx.lineTo(lerp(tr.x1, tr.x2, clamp(tt * 0.85 + 0.14, 0, 1)), lerp(tr.y1, tr.y2, clamp(tt * 0.85 + 0.14, 0, 1)));
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    // ⑥ 粒子（烟/火/枪口闪光）
    for (let i = particles.length - 1; i >= 0; i--) {
      const pp = particles[i]; pp.life += dt;
      if (pp.life >= pp.max) { particles.splice(i, 1); continue; }
      const lt = pp.life / pp.max;
      pp.x += pp.vx * dt; pp.y += pp.vy * dt;
      if (pp.kind === "smoke") {
        ctx.globalAlpha = (1 - lt) * 0.35;
        ctx.fillStyle = "#3c3830";
        ctx.beginPath(); ctx.arc(pp.x, pp.y, pp.r * (0.6 + lt * 1.8), 0, 6.29); ctx.fill();
      } else if (pp.kind === "flame") {
        ctx.globalAlpha = (1 - lt) * 0.9;
        ctx.fillStyle = lt < 0.4 ? "#ffd060" : "#ff6620";
        ctx.beginPath(); ctx.arc(pp.x, pp.y, pp.r * (1 - lt * 0.6), 0, 6.29); ctx.fill();
      } else if (pp.kind === "flash") {
        ctx.globalAlpha = (1 - lt);
        ctx.fillStyle = "#fff4c0";
        ctx.beginPath(); ctx.arc(pp.x, pp.y, pp.r * (1 - lt), 0, 6.29); ctx.fill();
      } else { // puff（尘土）
        ctx.globalAlpha = (1 - lt) * 0.3;
        ctx.fillStyle = "#8a7a58";
        ctx.beginPath(); ctx.arc(pp.x, pp.y, pp.r * (0.5 + lt), 0, 6.29); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // ⑦ 区域名牌（最上层、不排序）
    ctx.textBaseline = "alphabetic";
    for (const r of REGIONS) {
      const p = regionScreen.get(r.id)!;
      const owned = !!s.regions[r.id];
      const avail = !owned && phase(s) >= r.requiresPhase;
      ctx.font = `${owned ? 700 : 400} ${Math.max(10, k * 5.2)}px 'Noto Serif SC', serif`;
      const lab = r.name;
      const twd = ctx.measureText(lab).width;
      ctx.fillStyle = "rgba(10,9,6,.66)";
      ctx.beginPath(); ctx.roundRect(p.x - twd / 2 - 4, p.y + k * 6, twd + 8, k * 7.6, 3); ctx.fill();
      if (avail) { ctx.strokeStyle = "rgba(216,164,65,.85)"; ctx.lineWidth = 1; ctx.stroke(); }
      ctx.fillStyle = owned ? "#f2b6a0" : avail ? "#e8d29a" : "rgba(216,201,160,.55)";
      ctx.fillText(lab, p.x - twd / 2, p.y + k * 11.6);
      if (avail) { // 可收复脉动圈
        const pr = k * (10 + Math.sin(t * 3) * 2);
        ctx.strokeStyle = `rgba(216,164,65,${0.5 + Math.sin(t * 3) * 0.25})`; ctx.lineWidth = 1.5;
        ctx.save(); ctx.translate(p.x, p.y); ctx.scale(1, 0.5);
        ctx.beginPath(); ctx.arc(0, 0, pr, 0, 6.29); ctx.stroke(); ctx.restore();
      }
    }
    // 中心根据地名牌
    {
      ctx.font = `700 ${Math.max(11, k * 5.6)}px 'Noto Serif SC', serif`;
      const lab = "★ 中心根据地";
      const twd = ctx.measureText(lab).width;
      ctx.fillStyle = "rgba(90,26,18,.8)";
      ctx.beginPath(); ctx.roundRect(basePt.x - twd / 2 - 5, basePt.y + k * 8, twd + 10, k * 8, 3); ctx.fill();
      ctx.fillStyle = "#f2d8c0"; ctx.fillText(lab, basePt.x - twd / 2, basePt.y + k * 14);
    }

    // ⑧ 扫荡全屏警报边缘泛红
    if (sw) {
      const pulse = sw.stage === "pillage" ? 0.5 : 0.3;
      const a = (Math.sin(t * (sw.stage === "incoming" ? 4 : 7)) * 0.5 + 0.5) * pulse;
      const gr = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.32, W / 2, H / 2, Math.max(W, H) * 0.72);
      gr.addColorStop(0, "rgba(180,40,26,0)"); gr.addColorStop(1, `rgba(180,40,26,${a * 0.4})`);
      ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
    }
  }

  // ── 扫荡可视化 ──
  function sweepGeom(sw: Sweep): { spawn: { x: number; y: number }; target: { x: number; y: number }; def: { x: number; y: number } } {
    const target = sw.targetRegion ? REGIONS.find((r) => r.id === sw.targetRegion)! : BASE;
    // 出发点：离目标最近的敌占（未收复）据点；全收复了就从地图北角开来
    let spawn = { x: 0.78, y: 0.10 }; let bd = 1e9;
    for (const r of REGIONS) {
      if (lastRegions[r.id]) continue;
      if (r.x === target.x && r.y === target.y) continue;
      const d = (r.x - target.x) ** 2 + (r.y - target.y) ** 2;
      if (d < bd) { bd = d; spawn = { x: r.x, y: r.y }; }
    }
    const dx = target.x - spawn.x, dy = target.y - spawn.y, dl = Math.hypot(dx, dy) || 1;
    const def = { x: target.x - (dx / dl) * 0.055, y: target.y - (dy / dl) * 0.055 };
    return { spawn, target: { x: target.x, y: target.y }, def };
  }
  let lastRegions: Record<string, boolean> = {};

  function drawSweep(sw: Sweep, s: KRState, k: number, t: number, push: (y: number, d: () => void) => void, dt: number): void {
    lastRegions = s.regions;
    const { spawn, target, def } = sweepGeom(sw);
    const face = proj(target.x, target.y).x >= proj(spawn.x, spawn.y).x ? 1 : -1;

    if (sw.stage === "incoming") {
      const prog = 1 - sw.etaSec / TUNING.sweepEtaSec;
      const mx = lerp(spawn.x, def.x, prog), my = lerp(spawn.y, def.y, prog);
      const p = proj(mx, my);
      push(p.y, () => drawFormation(ctx, p.x, p.y, sw.strength, true, k, t, true, face));
      if (Math.random() < 0.5) particles.push({ x: p.x + (Math.random() - 0.5) * k * 16, y: p.y + k * 2, vx: -6 * face, vy: -4, life: 0, max: 1.2, kind: "puff", r: k * 2.2 });
      // 行军路线虚线
      const p1 = proj(mx, my), p2 = proj(target.x, target.y);
      ctx.setLineDash([5, 6]); ctx.strokeStyle = "rgba(226,86,77,.5)"; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke(); ctx.setLineDash([]);
      // 我方已集结部队在防线待命
      if (sw.committed > 0) {
        const dp = proj(lerp(def.x, target.x, 0.55), lerp(def.y, target.y, 0.55));
        push(dp.y, () => drawFormation(ctx, dp.x, dp.y, sw.committed, false, k, t, false, -face));
      }
    } else if (sw.stage === "battle") {
      const gap = 0.020;
      const dxn = target.x - spawn.x, dyn = target.y - spawn.y, dl = Math.hypot(dxn, dyn) || 1;
      const jpPos = { x: def.x - (dxn / dl) * gap, y: def.y - (dyn / dl) * gap };
      const ourPos = { x: def.x + (dxn / dl) * gap, y: def.y + (dyn / dl) * gap };
      const jp = proj(jpPos.x, jpPos.y), our = proj(ourPos.x, ourPos.y);
      push(jp.y, () => drawFormation(ctx, jp.x, jp.y, sw.strength, true, k, t, false, face));
      push(our.y, () => drawFormation(ctx, our.x, our.y, sw.committed, false, k, t, false, -face));
      // 曳光弹 + 枪口闪光（频率随双方规模）
      const rate = clamp((sw.strength + sw.committed) * 0.02, 0.3, 2.2);
      if (Math.random() < rate * dt * 30) {
        const fromJp = Math.random() < 0.5;
        const a = fromJp ? jp : our, b = fromJp ? our : jp;
        const ox = (Math.random() - 0.5) * k * 14, oy = (Math.random() - 0.5) * k * 8;
        tracers.push({ x1: a.x + ox, y1: a.y - k * 6 + oy, x2: b.x - ox, y2: b.y - k * 5 + oy * 0.5, life: 1, jp: fromJp });
        particles.push({ x: a.x + ox, y: a.y - k * 6 + oy, vx: 0, vy: 0, life: 0, max: 0.16, kind: "flash", r: k * 2.6 });
      }
      // 战场硝烟
      if (Math.random() < dt * 8) {
        const mid = { x: (jp.x + our.x) / 2, y: (jp.y + our.y) / 2 };
        particles.push({ x: mid.x + (Math.random() - 0.5) * k * 30, y: mid.y, vx: 4, vy: -8, life: 0, max: 2.2, kind: "smoke", r: k * 3 });
      }
    } else { // pillage：日军在村里烧抢
      const p = proj(target.x, target.y);
      push(p.y + 2, () => drawFormation(ctx, p.x, p.y, sw.strength, true, k, t, true, face));
      spawnFlame(p.x + (Math.random() - 0.5) * k * 24, p.y - k * 4 + (Math.random() - 0.5) * k * 10, k);
    }

    // 群众大范围转移（转移中：从目标村向深山的队伍）
    if (sw.evacStarted && sw.evacProgress < 1) {
      if (Math.random() < dt * 6 && walkers.filter((w) => w.kind === "evac").length < 26) {
        walkers.push({
          x: target.x + (Math.random() - 0.5) * 0.02, y: target.y + (Math.random() - 0.5) * 0.02,
          tx: EVAC.x + (Math.random() - 0.5) * 0.05, ty: EVAC.y + (Math.random() - 0.5) * 0.04,
          spd: 0.018 + Math.random() * 0.008, kind: "evac", ph: Math.random() * 7
        });
      }
    }
  }

  function spawnFlame(x: number, y: number, k: number): void {
    if (Math.random() < 0.5) particles.push({ x: x + (Math.random() - 0.5) * k * 6, y, vx: (Math.random() - 0.5) * 4, vy: -14 - Math.random() * 10, life: 0, max: 0.7, kind: "flame", r: k * 2.2 });
    if (Math.random() < 0.3) particles.push({ x, y: y - k * 4, vx: 4, vy: -12, life: 0, max: 2.6, kind: "smoke", r: k * 3 });
  }

  // 战损→倒下的小人（对比上一帧的整数差）
  function trackCasualties(sw: Sweep | null, k: number): void {
    if (!sw || sw.stage !== "battle") { prevJp = sw ? sw.strength : 0; prevOur = sw ? sw.committed : 0; prevSweepOn = !!sw; return; }
    if (!prevSweepOn) { prevJp = sw.strength; prevOur = sw.committed; prevSweepOn = true; return; }
    const { spawn, target, def } = sweepGeom(sw);
    const dxn = target.x - spawn.x, dyn = target.y - spawn.y, dl = Math.hypot(dxn, dyn) || 1;
    const jpDrop = Math.floor(prevJp) - Math.floor(sw.strength);
    const ourDrop = Math.floor(prevOur) - Math.floor(sw.committed);
    for (let i = 0; i < Math.min(3, jpDrop); i++) {
      const p = proj(def.x - (dxn / dl) * 0.02 + (Math.random() - 0.5) * 0.02, def.y - (dyn / dl) * 0.02 + (Math.random() - 0.5) * 0.014);
      corpses.push({ x: p.x, y: p.y, life: 6, jp: true });
    }
    for (let i = 0; i < Math.min(3, ourDrop); i++) {
      const p = proj(def.x + (dxn / dl) * 0.02 + (Math.random() - 0.5) * 0.02, def.y + (dyn / dl) * 0.014 + (Math.random() - 0.5) * 0.014);
      corpses.push({ x: p.x, y: p.y, life: 6, jp: false });
    }
    prevJp = sw.strength; prevOur = sw.committed;
  }

  // ── 村民/战士小人管理（数量跟随兵员规模）──
  function syncWalkers(s: KRState): void {
    const wantVil = clamp(Math.floor(2 + Math.log2(s.bing + 1) * 2.6), 2, 30);
    const wantSol = clamp(Math.floor(Math.log2(s.bing + 1) * 1.1), 0, 12);
    let vil = 0, sol = 0;
    for (const w of walkers) { if (w.kind === "villager") vil++; else if (w.kind === "soldier") sol++; }
    while (vil < wantVil) { walkers.push(spawnWalker("villager")); vil++; }
    while (sol < wantSol) { walkers.push(spawnWalker("soldier")); sol++; }
    if (vil > wantVil || sol > wantSol) {
      for (let i = walkers.length - 1; i >= 0 && (vil > wantVil || sol > wantSol); i--) {
        const w = walkers[i];
        if (w.kind === "villager" && vil > wantVil) { walkers.splice(i, 1); vil--; }
        else if (w.kind === "soldier" && sol > wantSol) { walkers.splice(i, 1); sol--; }
      }
    }
  }
  function spawnWalker(kind: "villager" | "soldier"): Walker {
    const r = kind === "soldier" ? 0.05 : 0.035;
    return {
      x: BASE.x + (Math.random() - 0.5) * r * 2, y: BASE.y + (Math.random() - 0.5) * r * 1.6,
      tx: BASE.x + (Math.random() - 0.5) * r * 2, ty: BASE.y + (Math.random() - 0.5) * r * 1.6,
      spd: 0.008 + Math.random() * 0.006, kind, ph: Math.random() * 7
    };
  }
  function stepWalkers(dt: number, s: KRState): void {
    void s;
    for (let i = walkers.length - 1; i >= 0; i--) {
      const w = walkers[i];
      const dx = w.tx - w.x, dy = w.ty - w.y, d = Math.hypot(dx, dy);
      if (d < 0.004) {
        if (w.kind === "evac") { walkers.splice(i, 1); continue; } // 进山=安全
        const r = w.kind === "soldier" ? 0.05 : 0.035;
        w.tx = BASE.x + (Math.random() - 0.5) * r * 2; w.ty = BASE.y + (Math.random() - 0.5) * r * 1.6;
      } else {
        w.x += (dx / d) * w.spd * dt * (w.kind === "evac" ? 1 : 0.55);
        w.y += (dy / d) * w.spd * dt * (w.kind === "evac" ? 1 : 0.55);
      }
    }
  }

  function resize(): void {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = canvas.clientWidth || 1; H = canvas.clientHeight || 1;
    canvas.width = Math.max(1, W * dpr); canvas.height = Math.max(1, H * dpr);
    cx = W * 0.5; cy = H * 0.52;
    A = Math.min(W * 0.52, H * 0.92); B = A * 0.5;
    renderTerrain();
    controlSig = ""; // 触发控制层重画
  }
  resize();

  function hitRegion(cxp: number, cyp: number): string | null {
    const m = unproj(cxp, cyp);
    let best: string | null = null, bd = REGION_R * REGION_R;
    for (const r of REGIONS) {
      const d = (r.x - m.x) ** 2 + (r.y - m.y) ** 2;
      if (d < bd) { bd = d; best = r.id; }
    }
    const db = (BASE.x - m.x) ** 2 + (BASE.y - m.y) ** 2;
    if (db < bd) best = "base";
    return best;
  }

  return { ok: true, resize, frame, hitRegion, dispose() { walkers.length = 0; particles.length = 0; } };
}
