// 《烽火敌后》· 2.5D 华北战场（纯 Canvas2D，无图片资产）。
// v2：更大的华北战图——铁路网(囚笼的「柱与链」)+日军城市据点；每块根据地都是活的(村落/红旗/发展度)；
// 蚕食=根据地周边长出炮楼+封锁沟围圈；扫荡=多路兵团从不同方向合围；未到历史时点的区域罩战雾(分批揭露)。
// 全部状态读自 core 的 KRState，本文件只画不改。
import {
  BASES, TUNING,
  era, baseRevealed, type KRState, type Sweep
} from "./core";

export interface Scene25D {
  ok: boolean;
  resize: () => void;
  frame: (dt: number, s: KRState) => void;
  hitBase: (cx: number, cy: number) => string | null;
  dispose: () => void;
}

const EVAC = { x: 0.12, y: 0.88 }; // 群众转移去向（深山）
const HIT_R = 0.055;

// 铁路网（囚笼政策的柱与链）：城市节点 + 线段
const CITIES = [
  { id: "beiping", name: "北平", x: 0.62, y: 0.16 },
  { id: "tianjin", name: "天津", x: 0.76, y: 0.20 },
  { id: "shijiazhuang", name: "石家庄", x: 0.50, y: 0.40 },
  { id: "taiyuan", name: "太原", x: 0.30, y: 0.40 },
  { id: "datong", name: "大同", x: 0.34, y: 0.12 },
  { id: "jinan", name: "济南", x: 0.72, y: 0.42 },
  { id: "xuzhou", name: "徐州", x: 0.78, y: 0.62 }
];
const RAILS: [string, string, string][] = [
  ["平绥线", "beiping", "datong"],
  ["平汉线", "beiping", "shijiazhuang"],
  ["正太线", "shijiazhuang", "taiyuan"],
  ["同蒲线", "datong", "taiyuan"],
  ["津浦线", "tianjin", "jinan"],
  ["津浦线", "jinan", "xuzhou"],
  ["平津", "beiping", "tianjin"],
  ["石德线", "shijiazhuang", "jinan"]
];
const cityOf = (id: string) => CITIES.find((c) => c.id === id)!;

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

interface Walker { x: number; y: number; tx: number; ty: number; spd: number; kind: "villager" | "soldier" | "evac"; ph: number; }
interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; kind: "smoke" | "flame" | "flash" | "puff"; r: number; }
interface Corpse { x: number; y: number; life: number; jp: boolean; }
interface Tracer { x1: number; y1: number; x2: number; y2: number; life: number; jp: boolean; }

export function initScene(canvas: HTMLCanvasElement): Scene25D {
  const ctx0 = canvas.getContext("2d");
  if (!ctx0) return { ok: false, resize() {}, frame() {}, hitBase: () => null, dispose() {} };
  const ctx: CanvasRenderingContext2D = ctx0;

  let W = 0, H = 0, dpr = 1;
  let cx = 0, cy = 0, A = 400, B = 200;
  const proj = (mx: number, my: number): { x: number; y: number } => {
    const u = mx - 0.5, v = my - 0.5;
    return { x: cx + (u - v) * A, y: cy + (u + v) * B };
  };
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

  // ══ 地形层（静态）══
  function renderTerrain(): void {
    terrain.width = Math.max(1, W * dpr); terrain.height = Math.max(1, H * dpr);
    const g = terrain.getContext("2d")!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "#0c0d08"); bg.addColorStop(1, "#12100a");
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    const N = 46;
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const mx = i / N, my = j / N, sN = 1 / N;
        // 西部高原(太行/吕梁), 东部平原(冀中/冀鲁豫)
        const ridge = clamp((0.52 - mx) * 1.8, 0, 1) * 0.5;
        const h = fbm(mx * 5.2 + 7, my * 5.2 + 3) * (0.55 + ridge) + ridge * 0.4;
        const p0 = proj(mx, my), p1 = proj(mx + sN, my), p2 = proj(mx + sN, my + sN), p3 = proj(mx, my + sN);
        let r = 62 + h * 52, gg = 55 + h * 44, b = 34 + h * 22;
        if (h > 0.62) { r *= 0.72; gg *= 0.70; b *= 0.72; }
        if (h < 0.34) { r *= 1.10; gg *= 1.14; b *= 0.95; }
        const hl = fbm((mx - 0.012) * 5.2 + 7, (my - 0.012) * 5.2 + 3) * (0.55 + ridge) - h + ridge * 0.4;
        const lig = clamp(1 + hl * 5.5, 0.72, 1.3);
        g.fillStyle = `rgb(${(r * lig) | 0},${(gg * lig) | 0},${(b * lig) | 0})`;
        g.beginPath(); g.moveTo(p0.x, p0.y); g.lineTo(p1.x, p1.y); g.lineTo(p2.x, p2.y); g.lineTo(p3.x, p3.y); g.closePath(); g.fill();
      }
    }
    // 山脊「^」+ 散树
    for (let k = 0; k < 480; k++) {
      const mx = hash2(k, 1.7), my = hash2(k, 9.2);
      const ridge = clamp((0.52 - mx) * 1.8, 0, 1) * 0.5;
      const h = fbm(mx * 5.2 + 7, my * 5.2 + 3) * (0.55 + ridge) + ridge * 0.4;
      const p = proj(mx, my);
      if (h > 0.6) {
        const sZ = A * 0.008 * (1 + h);
        g.strokeStyle = "rgba(30,26,16,.55)"; g.lineWidth = 1.2;
        g.beginPath(); g.moveTo(p.x - sZ, p.y + sZ * 0.6); g.lineTo(p.x, p.y - sZ * 0.7); g.lineTo(p.x + sZ, p.y + sZ * 0.6); g.stroke();
      } else if (h < 0.42 && hash2(k, 4.4) < 0.3) {
        g.fillStyle = "rgba(52,66,32,.7)";
        g.beginPath(); g.arc(p.x, p.y, A * 0.004, 0, 6.29); g.fill();
      }
    }
    // 河
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
    // ── 铁路网(囚笼的柱与链)：黑白枕木线 ──
    for (const [, a, b] of RAILS) {
      const ca = cityOf(a), cb = cityOf(b);
      const pa = proj(ca.x, ca.y), pb = proj(cb.x, cb.y);
      g.strokeStyle = "rgba(20,18,14,.9)"; g.lineWidth = Math.max(2, A * 0.006);
      g.beginPath(); g.moveTo(pa.x, pa.y); g.lineTo(pb.x, pb.y); g.stroke();
      g.strokeStyle = "rgba(216,201,160,.5)"; g.lineWidth = Math.max(1, A * 0.003);
      g.setLineDash([A * 0.008, A * 0.008]);
      g.beginPath(); g.moveTo(pa.x, pa.y); g.lineTo(pb.x, pb.y); g.stroke();
      g.setLineDash([]);
    }
    // 地图外框
    const c0 = proj(0, 0), c1 = proj(1, 0), c2 = proj(1, 1), c3 = proj(0, 1);
    g.strokeStyle = "rgba(216,201,160,.22)"; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(c0.x, c0.y); g.lineTo(c1.x, c1.y); g.lineTo(c2.x, c2.y); g.lineTo(c3.x, c3.y); g.closePath(); g.stroke();
  }

  // ══ 控制区层（归属/揭雾变化时重画）══
  function renderControl(s: KRState): void {
    control.width = Math.max(1, W * dpr); control.height = Math.max(1, H * dpr);
    const g = control.getContext("2d")!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const zone = (mx: number, my: number, red: boolean, big = 1): void => {
      const p = proj(mx, my);
      const R = A * 0.14 * big;
      g.save(); g.translate(p.x, p.y); g.scale(1, 0.5);
      const gr = g.createRadialGradient(0, 0, 0, 0, 0, R);
      if (red) { gr.addColorStop(0, "rgba(178,44,28,.42)"); gr.addColorStop(0.55, "rgba(158,38,24,.24)"); gr.addColorStop(1, "rgba(158,38,24,0)"); }
      else { gr.addColorStop(0, "rgba(64,74,88,.38)"); gr.addColorStop(0.6, "rgba(56,66,80,.18)"); gr.addColorStop(1, "rgba(56,66,80,0)"); }
      g.fillStyle = gr;
      g.beginPath(); g.arc(0, 0, R, 0, 6.29); g.fill();
      g.strokeStyle = red ? "rgba(226,86,77,.38)" : "rgba(120,130,142,.2)";
      g.lineWidth = 1.4; g.setLineDash([6, 7]);
      g.beginPath(); g.arc(0, 0, R * 0.72, 0, 6.29); g.stroke();
      g.setLineDash([]); g.restore();
    };
    for (const b of BASES) {
      const st = s.bases[b.id];
      if (!baseRevealed(s, b.id)) continue;
      zone(b.x, b.y, st.est, st.est ? 0.9 + st.dev * 0.12 : 0.7);
    }
    // 日军城市据点灰区
    for (const c of CITIES) zone(c.x, c.y, false, 0.55);
    // ── 战雾：未揭露根据地罩浓黑雾(分批揭露) ──
    for (const b of BASES) {
      if (baseRevealed(s, b.id)) continue;
      const p = proj(b.x, b.y);
      const R = A * 0.17;
      g.save(); g.translate(p.x, p.y); g.scale(1, 0.5);
      const gr = g.createRadialGradient(0, 0, 0, 0, 0, R);
      gr.addColorStop(0, "rgba(4,4,3,.92)"); gr.addColorStop(0.7, "rgba(4,4,3,.75)"); gr.addColorStop(1, "rgba(4,4,3,0)");
      g.fillStyle = gr;
      g.beginPath(); g.arc(0, 0, R, 0, 6.29); g.fill();
      g.restore();
      g.fillStyle = "rgba(216,201,160,.25)";
      g.font = `700 ${Math.max(12, A * 0.028)}px 'Noto Serif SC', serif`;
      g.fillText("？", p.x - A * 0.008, p.y + A * 0.008);
    }
  }

  // ══ 小人/建筑基元（沿用）══
  function drawFigure(g: CanvasRenderingContext2D, sx: number, sy: number, k: number, opts: { jp?: boolean; civ?: boolean; walk?: number; face?: number; carry?: boolean }): void {
    const { jp = false, civ = false, walk = 0, face = 1, carry = false } = opts;
    const cloth = jp ? "#6b6b3a" : civ ? "#7a7058" : "#8a7d55";
    const dark = jp ? "#50502a" : civ ? "#5c5442" : "#6f6540";
    g.fillStyle = "rgba(0,0,0,.30)";
    g.beginPath(); g.ellipse(sx, sy, k * 3.2, k * 1.2, 0, 0, 6.29); g.fill();
    const swing = Math.sin(walk) * k * 1.6;
    g.strokeStyle = dark; g.lineWidth = k * 1.5; g.lineCap = "round";
    g.beginPath(); g.moveTo(sx, sy - k * 4); g.lineTo(sx + swing * 0.5, sy); g.stroke();
    g.beginPath(); g.moveTo(sx, sy - k * 4); g.lineTo(sx - swing * 0.5, sy); g.stroke();
    g.strokeStyle = cloth; g.lineWidth = k * 2.6;
    g.beginPath(); g.moveTo(sx, sy - k * 4); g.lineTo(sx, sy - k * 7.4); g.stroke();
    g.fillStyle = "#caa27a";
    g.beginPath(); g.arc(sx, sy - k * 8.6, k * 1.5, 0, 6.29); g.fill();
    if (jp) {
      g.fillStyle = dark;
      g.beginPath(); g.arc(sx, sy - k * 8.9, k * 1.7, Math.PI, 0); g.fill();
      g.fillRect(sx - k * 1.4, sy - k * 8.7, k * 2.8, k * 0.9);
    } else if (civ) {
      g.fillStyle = dark; g.fillRect(sx - k * 1.4, sy - k * 9.7, k * 2.8, k * 0.8);
    } else {
      g.fillStyle = dark; g.fillRect(sx - k * 1.6, sy - k * 10.1, k * 3.2, k * 1.1);
      g.fillRect(sx - k * 1.6, sy - k * 9.2, k * 3.4, k * 0.4);
    }
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
  function isoBox(g: CanvasRenderingContext2D, sx: number, sy: number, w: number, d: number, h: number, top: string, left: string, right: string): void {
    const T = { x: sx, y: sy - h };
    g.fillStyle = left;
    g.beginPath(); g.moveTo(sx - w, sy - w * 0.5); g.lineTo(sx, sy); g.lineTo(sx, T.y); g.lineTo(sx - w, T.y - w * 0.5); g.closePath(); g.fill();
    g.fillStyle = right;
    g.beginPath(); g.moveTo(sx + d, sy - d * 0.5); g.lineTo(sx, sy); g.lineTo(sx, T.y); g.lineTo(sx + d, T.y - d * 0.5); g.closePath(); g.fill();
    g.fillStyle = top;
    g.beginPath(); g.moveTo(sx, T.y); g.lineTo(sx - w, T.y - w * 0.5); g.lineTo(sx - w + d, T.y - w * 0.5 - d * 0.5); g.lineTo(sx + d, T.y - d * 0.5); g.closePath(); g.fill();
  }
  function drawHouse(g: CanvasRenderingContext2D, sx: number, sy: number, k: number, burnt = false): void {
    const wall = burnt ? "#3a3228" : "#b0a077", wallD = burnt ? "#2c2419" : "#8f8058", roof = burnt ? "#241d14" : "#6f5335", roofL = burnt ? "#2c241a" : "#7f6040";
    isoBox(g, sx, sy, k * 7, k * 7, k * 6, wall, wallD, wall);
    g.fillStyle = roofL;
    g.beginPath(); g.moveTo(sx - k * 8, sy - k * 10); g.lineTo(sx, sy - k * 6); g.lineTo(sx, sy - k * 13); g.closePath(); g.fill();
    g.fillStyle = roof;
    g.beginPath(); g.moveTo(sx + k * 8, sy - k * 10); g.lineTo(sx, sy - k * 6); g.lineTo(sx, sy - k * 13); g.closePath(); g.fill();
    if (!burnt) { g.fillStyle = "#463826"; g.fillRect(sx - k * 3.6, sy - k * 5, k * 2.2, k * 4.4); }
  }
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
  function drawBlockhouse(g: CanvasRenderingContext2D, sx: number, sy: number, k: number, t: number): void {
    isoBox(g, sx, sy, k * 5, k * 5, k * 15, "#7d8188", "#565a62", "#6a6e76");
    isoBox(g, sx, sy - k * 15, k * 6, k * 6, k * 3, "#84888f", "#5c6068", "#70747c");
    g.fillStyle = "#1c1e22";
    g.fillRect(sx - k * 3.4, sy - k * 11, k * 1.4, k * 2); g.fillRect(sx + k * 1.6, sy - k * 12, k * 1.4, k * 2);
    drawFlag(g, sx, sy - k * 18, k * 0.8, t, true);
  }
  function drawCity(g: CanvasRenderingContext2D, sx: number, sy: number, k: number, t: number): void {
    isoBox(g, sx - k * 5, sy, k * 5, k * 4, k * 7, "#6e7278", "#4a4e54", "#5c6066");
    isoBox(g, sx + k * 4, sy + k * 2, k * 4, k * 4, k * 5, "#63676d", "#45494f", "#54585e");
    isoBox(g, sx, sy - k * 3, k * 3.4, k * 3.4, k * 9, "#74787e", "#50545a", "#62666c");
    drawFlag(g, sx + k * 2, sy - k * 12, k * 0.9, t, true);
  }
  // 封锁沟：围根据地的壕沟弧线(蚕食≥3)
  function drawBlockadeRing(g: CanvasRenderingContext2D, mx: number, my: number, spots: number, t: number): void {
    const p = proj(mx, my);
    const R = A * 0.115;
    const arcFrac = clamp(spots / 5, 0, 1) * Math.PI * 2;
    g.save(); g.translate(p.x, p.y); g.scale(1, 0.5);
    g.strokeStyle = "rgba(28,26,20,.9)"; g.lineWidth = Math.max(3, A * 0.010);
    g.beginPath(); g.arc(0, 0, R, -Math.PI / 2 + t * 0.02, -Math.PI / 2 + t * 0.02 + arcFrac); g.stroke();
    g.strokeStyle = "rgba(140,130,100,.35)"; g.lineWidth = 1;
    g.setLineDash([3, 4]);
    g.beginPath(); g.arc(0, 0, R + A * 0.006, -Math.PI / 2 + t * 0.02, -Math.PI / 2 + t * 0.02 + arcFrac); g.stroke();
    g.setLineDash([]); g.restore();
  }
  function drawFormation(g: CanvasRenderingContext2D, sx: number, sy: number, count: number, jp: boolean, k: number, t: number, moving: boolean, face: number, label = true): void {
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
    if (!label) return;
    const lab = `${jp ? "日军" : "我军"} ×${Math.max(1, Math.round(count))}`;
    g.font = `700 ${Math.max(11, k * 6)}px 'Noto Serif SC', serif`;
    const tw = g.measureText(lab).width;
    const by = sy - rows * k * 5 - k * 16;
    g.fillStyle = jp ? "rgba(46,48,30,.92)" : "rgba(90,26,18,.92)";
    g.strokeStyle = jp ? "#8a8a50" : "#e2564d"; g.lineWidth = 1;
    const bx = sx - tw / 2 - k * 3;
    g.beginPath(); g.roundRect(bx, by, tw + k * 6, k * 9, 3); g.fill(); g.stroke();
    g.fillStyle = jp ? "#d8d2a8" : "#f2d8c0";
    g.fillText(lab, sx - tw / 2, by + k * 6.6);
  }

  // ══ 主帧 ══
  const baseScreen = new Map<string, { x: number; y: number }>();

  function frame(dt: number, s: KRState): void {
    time += dt;
    const t = time;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    // 控制区签名(开辟/揭雾/据点变化→重画)
    const sig = BASES.map((b) => `${s.bases[b.id].est ? 1 : 0}${baseRevealed(s, b.id) ? 1 : 0}${s.bases[b.id].dev}`).join("");
    if (sig !== controlSig) { controlSig = sig; renderControl(s); }

    ctx.drawImage(terrain, 0, 0, W, H);
    ctx.drawImage(control, 0, 0, W, H);

    const k = clamp(A * 0.006, 1.1, 2.6);
    const sw = s.sweep;

    const queue: { y: number; draw: () => void }[] = [];
    const push = (y: number, draw: () => void): void => { queue.push({ y, draw }); };

    // ① 城市(日军柱点)
    for (const c of CITIES) {
      const p = proj(c.x, c.y);
      push(p.y, () => drawCity(ctx, p.x, p.y, k, t));
    }

    // ② 根据地：村落规模=发展度; 蚕食据点炮楼围圈; 封锁沟
    baseScreen.clear();
    for (const b of BASES) {
      const st = s.bases[b.id];
      const p = proj(b.x, b.y);
      baseScreen.set(b.id, p);
      if (!baseRevealed(s, b.id)) continue;
      if (st.est) {
        const houses = 2 + st.dev;
        for (let i = 0; i < houses; i++) {
          const ang = (i / houses) * Math.PI * 2 + 0.7 + b.x * 9;
          const rr = A * (0.022 + (i % 3) * 0.009);
          const hp = { x: p.x + Math.cos(ang) * rr, y: p.y + Math.sin(ang) * rr * 0.5 };
          const burning = sw?.stage === "pillage" && sw.targetBase === b.id && i % 2 === 0;
          push(hp.y, () => drawHouse(ctx, hp.x, hp.y, k * (b.id === "hq" ? 0.95 : 0.8)));
          if (burning) spawnFlame(hp.x, hp.y - k * 6, k);
        }
        push(p.y + 1, () => drawFlag(ctx, p.x, p.y, k * (b.id === "hq" ? 1.3 : 1), t));
        // 地道口标记
        if (st.tunnels > 0) push(p.y + 2, () => {
          ctx.fillStyle = "#14110b";
          for (let i = 0; i < st.tunnels; i++) {
            const tx = p.x + A * 0.03 + i * k * 6, ty = p.y + A * 0.014;
            ctx.save(); ctx.translate(tx, ty); ctx.scale(1, 0.6); ctx.beginPath(); ctx.arc(0, 0, k * 2.2, Math.PI, 0); ctx.fill(); ctx.restore();
          }
        });
      } else {
        // 已揭露未开辟：灰村
        push(p.y, () => { drawHouse(ctx, p.x - k * 6, p.y, k * 0.6, true); drawHouse(ctx, p.x + k * 6, p.y + k * 2, k * 0.6, true); });
      }
      // 蚕食炮楼(无论开辟与否, 有 spots 就画)
      if (st.spots > 0) {
        for (let i = 0; i < st.spots; i++) {
          const ang = (i / 5) * Math.PI * 2 + 1.1;
          const sp = { x: p.x + Math.cos(ang) * A * 0.085, y: p.y + Math.sin(ang) * A * 0.0425 };
          push(sp.y, () => drawBlockhouse(ctx, sp.x, sp.y, k * 0.75, t));
        }
        if (st.spots >= 3) drawBlockadeRing(ctx, b.x, b.y, st.spots, t);
      }
    }

    // ③ 中心村里的小人
    syncWalkers(s);
    for (const wlk of walkers) {
      const p = proj(wlk.x, wlk.y);
      const kind = wlk.kind;
      push(p.y, () => drawFigure(ctx, p.x, p.y, k * (kind === "soldier" ? 0.95 : 0.85), {
        civ: kind !== "soldier", walk: t * 8 + wlk.ph, face: wlk.tx >= wlk.x ? 1 : -1, carry: kind === "evac"
      }));
    }
    stepWalkers(dt);

    // ④ 扫荡多路兵团 + 会战
    if (sw) drawSweep(sw, s, k, t, push, dt);
    trackCasualties(sw, k);

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

    queue.sort((a, b) => a.y - b.y);
    for (const q of queue) q.draw();

    // ⑤ 曳光弹
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
    // ⑥ 粒子
    for (let i = particles.length - 1; i >= 0; i--) {
      const pp = particles[i]; pp.life += dt;
      if (pp.life >= pp.max) { particles.splice(i, 1); continue; }
      const lt = pp.life / pp.max;
      pp.x += pp.vx * dt; pp.y += pp.vy * dt;
      if (pp.kind === "smoke") {
        ctx.globalAlpha = (1 - lt) * 0.35; ctx.fillStyle = "#3c3830";
        ctx.beginPath(); ctx.arc(pp.x, pp.y, pp.r * (0.6 + lt * 1.8), 0, 6.29); ctx.fill();
      } else if (pp.kind === "flame") {
        ctx.globalAlpha = (1 - lt) * 0.9; ctx.fillStyle = lt < 0.4 ? "#ffd060" : "#ff6620";
        ctx.beginPath(); ctx.arc(pp.x, pp.y, pp.r * (1 - lt * 0.6), 0, 6.29); ctx.fill();
      } else if (pp.kind === "flash") {
        ctx.globalAlpha = (1 - lt); ctx.fillStyle = "#fff4c0";
        ctx.beginPath(); ctx.arc(pp.x, pp.y, pp.r * (1 - lt), 0, 6.29); ctx.fill();
      } else {
        ctx.globalAlpha = (1 - lt) * 0.3; ctx.fillStyle = "#8a7a58";
        ctx.beginPath(); ctx.arc(pp.x, pp.y, pp.r * (0.5 + lt), 0, 6.29); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // ⑦ 名牌
    ctx.textBaseline = "alphabetic";
    for (const b of BASES) {
      if (!baseRevealed(s, b.id)) continue;
      const p = baseScreen.get(b.id)!;
      const st = s.bases[b.id];
      const canEst = !st.est && era(s).canExpand;
      ctx.font = `${st.est ? 700 : 400} ${Math.max(10, k * 5.2)}px 'Noto Serif SC', serif`;
      const lab = st.est ? `${b.short}${st.dev > 0 ? `·发展${st.dev}` : ""}${st.spots > 0 ? ` 🏯${st.spots}` : ""}` : `${b.short}(未开辟)`;
      const twd = ctx.measureText(lab).width;
      ctx.fillStyle = "rgba(10,9,6,.66)";
      ctx.beginPath(); ctx.roundRect(p.x - twd / 2 - 4, p.y + k * 6, twd + 8, k * 7.6, 3); ctx.fill();
      if (canEst) { ctx.strokeStyle = "rgba(216,164,65,.85)"; ctx.lineWidth = 1; ctx.stroke(); }
      ctx.fillStyle = st.est ? "#f2b6a0" : canEst ? "#e8d29a" : "rgba(216,201,160,.55)";
      ctx.fillText(lab, p.x - twd / 2, p.y + k * 11.6);
      if (canEst) {
        const pr = k * (10 + Math.sin(t * 3) * 2);
        ctx.strokeStyle = `rgba(216,164,65,${0.5 + Math.sin(t * 3) * 0.25})`; ctx.lineWidth = 1.5;
        ctx.save(); ctx.translate(p.x, p.y); ctx.scale(1, 0.5);
        ctx.beginPath(); ctx.arc(0, 0, pr, 0, 6.29); ctx.stroke(); ctx.restore();
      }
    }
    for (const c of CITIES) {
      const p = proj(c.x, c.y);
      ctx.font = `400 ${Math.max(9, k * 4.4)}px 'Noto Serif SC', serif`;
      ctx.fillStyle = "rgba(150,158,168,.7)";
      ctx.fillText(c.name, p.x - k * 5, p.y + k * 9);
    }

    // ⑧ 扫荡警报泛红
    if (sw) {
      const pulse = sw.stage === "pillage" ? 0.5 : 0.3;
      const a = (Math.sin(t * (sw.stage === "incoming" ? 4 : 7)) * 0.5 + 0.5) * pulse;
      const gr = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.32, W / 2, H / 2, Math.max(W, H) * 0.72);
      gr.addColorStop(0, "rgba(180,40,26,0)"); gr.addColorStop(1, `rgba(180,40,26,${a * 0.4})`);
      ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
    }
  }

  // ── 扫荡可视化：多路兵团从不同城市/据点方向合围 ──
  function colSpawns(sw: Sweep): { x: number; y: number }[] {
    const target = BASES.find((b) => b.id === sw.targetBase)!;
    // 从最近的 cols 个城市出发合围
    const sorted = [...CITIES].sort((a, b) => ((a.x - target.x) ** 2 + (a.y - target.y) ** 2) - ((b.x - target.x) ** 2 + (b.y - target.y) ** 2));
    const spawns: { x: number; y: number }[] = [];
    for (let i = 0; i < sw.cols; i++) {
      const c = sorted[i % sorted.length];
      spawns.push({ x: c.x, y: c.y });
    }
    return spawns;
  }
  function drawSweep(sw: Sweep, s: KRState, k: number, t: number, push: (y: number, d: () => void) => void, dt: number): void {
    const target = BASES.find((b) => b.id === sw.targetBase)!;
    const spawns = colSpawns(sw);
    const per = sw.strength / sw.cols;

    if (sw.stage === "incoming") {
      const prog = 1 - sw.etaSec / TUNING.sweepEtaSec;
      for (let i = 0; i < spawns.length; i++) {
        const sp = spawns[i];
        const dx = target.x - sp.x, dy = target.y - sp.y, dl = Math.hypot(dx, dy) || 1;
        const stop = 0.055 + i * 0.008;
        const mx = lerp(sp.x, target.x - (dx / dl) * stop, prog), my = lerp(sp.y, target.y - (dy / dl) * stop, prog);
        const p = proj(mx, my);
        const face = proj(target.x, target.y).x >= p.x ? 1 : -1;
        push(p.y, () => drawFormation(ctx, p.x, p.y, per, true, k * 0.9, t, true, face, i === 0));
        if (Math.random() < 0.3) particles.push({ x: p.x + (Math.random() - 0.5) * k * 14, y: p.y + k * 2, vx: -5 * face, vy: -4, life: 0, max: 1.2, kind: "puff", r: k * 2 });
        // 合围箭头虚线
        const p2 = proj(target.x, target.y);
        ctx.setLineDash([5, 6]); ctx.strokeStyle = "rgba(226,86,77,.45)"; ctx.lineWidth = 1.3;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p2.x, p2.y); ctx.stroke(); ctx.setLineDash([]);
      }
      if (sw.committed > 0) {
        const dp = proj(target.x, target.y - 0.035);
        push(dp.y, () => drawFormation(ctx, dp.x, dp.y, sw.committed, false, k, t, false, 1));
      }
    } else if (sw.stage === "battle") {
      const tp = proj(target.x, target.y);
      // 我军守中心
      const our = proj(target.x, target.y + 0.012);
      push(our.y, () => drawFormation(ctx, our.x, our.y, sw.committed, false, k, t, false, 1));
      // 日军各路围着打
      for (let i = 0; i < spawns.length; i++) {
        const sp = spawns[i];
        const dx = target.x - sp.x, dy = target.y - sp.y, dl = Math.hypot(dx, dy) || 1;
        const jp = proj(target.x - (dx / dl) * 0.05, target.y - (dy / dl) * 0.05);
        const face = tp.x >= jp.x ? 1 : -1;
        push(jp.y, () => drawFormation(ctx, jp.x, jp.y, per, true, k * 0.9, t, false, face, i === 0));
        const rate = clamp((sw.strength + sw.committed) * 0.02, 0.3, 2.2) / sw.cols;
        if (Math.random() < rate * dt * 30) {
          const fromJp = Math.random() < 0.5;
          const a = fromJp ? jp : our, b = fromJp ? our : jp;
          const ox = (Math.random() - 0.5) * k * 12, oy = (Math.random() - 0.5) * k * 7;
          tracers.push({ x1: a.x + ox, y1: a.y - k * 6 + oy, x2: b.x - ox, y2: b.y - k * 5 + oy * 0.5, life: 1, jp: fromJp });
          particles.push({ x: a.x + ox, y: a.y - k * 6 + oy, vx: 0, vy: 0, life: 0, max: 0.16, kind: "flash", r: k * 2.4 });
        }
      }
      if (Math.random() < dt * 8) {
        particles.push({ x: tp.x + (Math.random() - 0.5) * k * 34, y: tp.y - k * 4, vx: 4, vy: -8, life: 0, max: 2.2, kind: "smoke", r: k * 3 });
      }
    } else {
      const p = proj(target.x, target.y);
      push(p.y + 2, () => drawFormation(ctx, p.x, p.y, sw.strength, true, k, t, true, 1));
      spawnFlame(p.x + (Math.random() - 0.5) * k * 24, p.y - k * 4 + (Math.random() - 0.5) * k * 10, k);
    }

    // 群众大范围转移
    if (sw.evacStarted && sw.evacProgress < 1) {
      if (Math.random() < dt * 6 && walkers.filter((w) => w.kind === "evac").length < 26) {
        walkers.push({
          x: target.x + (Math.random() - 0.5) * 0.02, y: target.y + (Math.random() - 0.5) * 0.02,
          tx: EVAC.x + (Math.random() - 0.5) * 0.05, ty: EVAC.y + (Math.random() - 0.5) * 0.04,
          spd: 0.018 + Math.random() * 0.008, kind: "evac", ph: Math.random() * 7
        });
      }
    }
    void s;
  }

  function spawnFlame(x: number, y: number, k: number): void {
    if (Math.random() < 0.5) particles.push({ x: x + (Math.random() - 0.5) * k * 6, y, vx: (Math.random() - 0.5) * 4, vy: -14 - Math.random() * 10, life: 0, max: 0.7, kind: "flame", r: k * 2.2 });
    if (Math.random() < 0.3) particles.push({ x, y: y - k * 4, vx: 4, vy: -12, life: 0, max: 2.6, kind: "smoke", r: k * 3 });
  }
  function trackCasualties(sw: Sweep | null, k: number): void {
    if (!sw || sw.stage !== "battle") { prevJp = sw ? sw.strength : 0; prevOur = sw ? sw.committed : 0; prevSweepOn = !!sw; return; }
    if (!prevSweepOn) { prevJp = sw.strength; prevOur = sw.committed; prevSweepOn = true; return; }
    const target = BASES.find((b) => b.id === sw.targetBase)!;
    const jpDrop = Math.floor(prevJp) - Math.floor(sw.strength);
    const ourDrop = Math.floor(prevOur) - Math.floor(sw.committed);
    for (let i = 0; i < Math.min(3, jpDrop); i++) {
      const p = proj(target.x + (Math.random() - 0.5) * 0.05, target.y - 0.03 + (Math.random() - 0.5) * 0.02);
      corpses.push({ x: p.x, y: p.y, life: 6, jp: true });
    }
    for (let i = 0; i < Math.min(3, ourDrop); i++) {
      const p = proj(target.x + (Math.random() - 0.5) * 0.04, target.y + 0.015 + (Math.random() - 0.5) * 0.014);
      corpses.push({ x: p.x, y: p.y, life: 6, jp: false });
    }
    prevJp = sw.strength; prevOur = sw.committed;
    void k;
  }

  // ── 中心村小人 ──
  const HQ = BASES[0];
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
      x: HQ.x + (Math.random() - 0.5) * r * 2, y: HQ.y + (Math.random() - 0.5) * r * 1.6,
      tx: HQ.x + (Math.random() - 0.5) * r * 2, ty: HQ.y + (Math.random() - 0.5) * r * 1.6,
      spd: 0.008 + Math.random() * 0.006, kind, ph: Math.random() * 7
    };
  }
  function stepWalkers(dt: number): void {
    for (let i = walkers.length - 1; i >= 0; i--) {
      const w = walkers[i];
      const dx = w.tx - w.x, dy = w.ty - w.y, d = Math.hypot(dx, dy);
      if (d < 0.004) {
        if (w.kind === "evac") { walkers.splice(i, 1); continue; }
        const r = w.kind === "soldier" ? 0.05 : 0.035;
        w.tx = HQ.x + (Math.random() - 0.5) * r * 2; w.ty = HQ.y + (Math.random() - 0.5) * r * 1.6;
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
    controlSig = "";
  }
  resize();

  function hitBase(cxp: number, cyp: number): string | null {
    const m = unproj(cxp, cyp);
    let best: string | null = null, bd = HIT_R * HIT_R;
    for (const b of BASES) {
      const d = (b.x - m.x) ** 2 + (b.y - m.y) ** 2;
      if (d < bd) { bd = d; best = b.id; }
    }
    return best;
  }

  return { ok: true, resize, frame, hitBase, dispose() { walkers.length = 0; particles.length = 0; } };
}
