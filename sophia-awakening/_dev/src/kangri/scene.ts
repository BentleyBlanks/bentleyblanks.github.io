// 《烽火敌后》· 2.5D 战场（纯 Canvas2D，无图片资产）。
// v3：尺度阶梯 + 地块控制层。
// · 阶梯外观：T0 一个村(特写:大村+村口炮楼) → T1 数村连片 → T2 县域(县城+铁路支线+据点链) → T3/T4 华北大图(雾逐块揭开)。
// · 地块层：等距菱形网格铺满地图，按「我方影响场 vs 日军影响场」染色(根据地红/日占灰蓝)，
//   随发展自动漫开、被围剿(掉人口/发展)自动缩回——控制范围一眼可见。
// · 扫荡意图表现：讨伐=单路推进；铁壁合围=多路箭头+收缩圈；奔袭=快速小队直插；梳篦=拉网横排。
// · 群众跨根据地大转移：拖家带口的队伍从 A 走到 B。全部状态读自 core，只画不改。
import {
  BASES,
  era, tier, baseRevealed, unitName, type KRState, type Sweep
} from "./core";

export interface Scene25D {
  ok: boolean;
  resize: () => void;
  frame: (dt: number, s: KRState) => void;
  hitBase: (cx: number, cy: number) => string | null;
  dispose: () => void;
}

const EVAC = { x: 0.12, y: 0.88 };
const HIT_R = 0.055;

// 铁路网（华北图用）
const CITIES = [
  { id: "beiping", name: "北平", x: 0.62, y: 0.16 },
  { id: "tianjin", name: "天津", x: 0.76, y: 0.20 },
  { id: "shijiazhuang", name: "石家庄", x: 0.50, y: 0.40 },
  { id: "taiyuan", name: "太原", x: 0.30, y: 0.40 },
  { id: "datong", name: "大同", x: 0.34, y: 0.12 },
  { id: "jinan", name: "济南", x: 0.72, y: 0.42 },
  { id: "xuzhou", name: "徐州", x: 0.78, y: 0.62 }
];
const RAILS: [string, string][] = [
  ["beiping", "datong"], ["beiping", "shijiazhuang"], ["shijiazhuang", "taiyuan"],
  ["datong", "taiyuan"], ["tianjin", "jinan"], ["jinan", "xuzhou"], ["beiping", "tianjin"], ["shijiazhuang", "jinan"]
];
const cityOf = (id: string) => CITIES.find((c) => c.id === id)!;

// ── 局部场景布点（T0-T2；坐标同 0..1 地图系）──
interface LocalLayout {
  center: { x: number; y: number }; // 中心村/根据地心
  villages: { x: number; y: number; big: boolean }[];
  towers: { x: number; y: number }[]; // 日军炮楼(数量跟 hq.spots, 至少1座=对手)
  county: { x: number; y: number } | null; // 县城(T2)
  rail: { x1: number; y1: number; x2: number; y2: number } | null;
}
function localLayout(tierId: number, spots: number): LocalLayout {
  const C = { x: 0.5, y: 0.56 };
  const nT = Math.max(1, Math.min(5, spots || 1));
  const towerRing = (n: number, r: number): { x: number; y: number }[] =>
    Array.from({ length: n }, (_, i) => ({ x: C.x + Math.cos(0.9 + (i / 5) * Math.PI * 2) * r, y: C.y + Math.sin(0.9 + (i / 5) * Math.PI * 2) * r * 0.8 }));
  if (tierId === 0) {
    return { center: C, villages: [{ x: C.x, y: C.y, big: true }], towers: [{ x: 0.74, y: 0.30 }].slice(0, 1), county: null, rail: null };
  }
  if (tierId === 1) {
    return {
      center: C,
      villages: [{ x: C.x, y: C.y, big: true }, { x: 0.34, y: 0.44, big: false }, { x: 0.62, y: 0.40, big: false }, { x: 0.40, y: 0.72, big: false }, { x: 0.66, y: 0.68, big: false }],
      towers: towerRing(nT, 0.30), county: null, rail: null
    };
  }
  return {
    center: C,
    villages: [{ x: C.x, y: C.y, big: true }, { x: 0.34, y: 0.46, big: false }, { x: 0.60, y: 0.42, big: false }, { x: 0.38, y: 0.70, big: false }, { x: 0.64, y: 0.70, big: false }, { x: 0.26, y: 0.58, big: false }, { x: 0.52, y: 0.30, big: false }, { x: 0.72, y: 0.56, big: false }],
    towers: towerRing(nT, 0.26), county: { x: 0.78, y: 0.22 }, rail: { x1: 0.06, y1: 0.36, x2: 0.96, y2: 0.14 }
  };
}

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

interface Walker { x: number; y: number; tx: number; ty: number; spd: number; kind: "villager" | "soldier" | "evac" | "migrate"; ph: number; }
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
  let terrainTier = -1;
  let time = 0;
  let shownTier = -1; // 转场检测
  let flashT = 0;

  const walkers: Walker[] = [];
  const particles: Particle[] = [];
  const corpses: Corpse[] = [];
  const tracers: Tracer[] = [];
  let prevJp = 0, prevOur = 0, prevSweepOn = false;
  let migSpawnAcc = 0;

  // ── 地块控制层 ──
  const TX = 32, TY = 22;
  const tileCtl = new Float32Array(TX * TY); // -1(日占)..1(我方), lerp 平滑

  // 我方/日方影响场（按当前 tier 用不同的源）
  function fields(s: KRState, L: LocalLayout | null): { our: (x: number, y: number) => number; jp: (x: number, y: number) => number } {
    const t = tier(s);
    const g = (d2: number, r: number): number => Math.exp(-d2 / (r * r));
    if (t < 3 && L) {
      const hq = s.bases["hq"];
      const devR = 0.10 + hq.dev * 0.03 + Math.min(0.12, s.totalWuzi / 60_000 * 0.1);
      const popF = clamp(hq.pop / 20, 0.3, 1.25);
      return {
        our: (x, y) => {
          let v = 0;
          for (const vg of L.villages) v = Math.max(v, g((x - vg.x) ** 2 + (y - vg.y) ** 2, devR * (vg.big ? 1.15 : 0.8) * popF));
          return v;
        },
        jp: (x, y) => {
          let v = 0;
          for (const tw of L.towers) v = Math.max(v, g((x - tw.x) ** 2 + (y - tw.y) ** 2, 0.11));
          if (L.county) v = Math.max(v, g((x - L.county.x) ** 2 + (y - L.county.y) ** 2, 0.16));
          return v;
        }
      };
    }
    return {
      our: (x, y) => {
        let v = 0;
        for (const b of BASES) {
          const st = s.bases[b.id];
          if (!st.est) continue;
          const r = (0.055 + st.dev * 0.014) * clamp(st.pop / b.pop0, 0.3, 1.25) * Math.max(0.45, 1 - st.spots * 0.09);
          v = Math.max(v, g((x - b.x) ** 2 + (y - b.y) ** 2, r));
        }
        return v;
      },
      jp: (x, y) => {
        let v = 0;
        for (const c of CITIES) v = Math.max(v, g((x - c.x) ** 2 + (y - c.y) ** 2, 0.085));
        for (const b of BASES) {
          const st = s.bases[b.id];
          if (st.spots > 0) v = Math.max(v, g((x - b.x) ** 2 + (y - b.y) ** 2, 0.05 + st.spots * 0.012) * 0.7);
        }
        return v;
      }
    };
  }
  function stepTiles(dt: number, s: KRState, L: LocalLayout | null): void {
    const f = fields(s, L);
    const k = Math.min(1, dt * 1.4); // 漫开/缩回速度
    for (let j = 0; j < TY; j++) {
      for (let i = 0; i < TX; i++) {
        const x = (i + 0.5) / TX, y = (j + 0.5) / TY;
        const o = f.our(x, y), e = f.jp(x, y);
        let target = 0;
        if (o > 0.18 || e > 0.18) target = clamp((o - e) * 1.6, -1, 1);
        const idx = j * TX + i;
        tileCtl[idx] += (target - tileCtl[idx]) * k;
      }
    }
  }
  function drawTiles(): void {
    // 每个地块的 4 个地图角点各自投影（与地形同一套等距投影 → 完全对齐），向外微扩 ~0.6px 消接缝。
    const EXP = 1.05;
    for (let j = 0; j < TY; j++) {
      for (let i = 0; i < TX; i++) {
        const c = tileCtl[j * TX + i];
        if (Math.abs(c) < 0.13) continue;
        const mx0 = i / TX, my0 = j / TY, mx1 = (i + 1) / TX, my1 = (j + 1) / TY;
        const p0 = proj(mx0, my0), p1 = proj(mx1, my0), p2 = proj(mx1, my1), p3 = proj(mx0, my1);
        const mxs = (p0.x + p1.x + p2.x + p3.x) / 4, mys = (p0.y + p1.y + p2.y + p3.y) / 4;
        const ex = (p: { x: number; y: number }): [number, number] => [mxs + (p.x - mxs) * EXP, mys + (p.y - mys) * EXP];
        const a0 = ex(p0), a1 = ex(p1), a2 = ex(p2), a3 = ex(p3);
        if (c > 0) ctx.fillStyle = `rgba(178,44,28,${0.08 + 0.22 * c})`;
        else ctx.fillStyle = `rgba(58,70,86,${0.08 + 0.20 * -c})`;
        ctx.beginPath();
        ctx.moveTo(a0[0], a0[1]); ctx.lineTo(a1[0], a1[1]); ctx.lineTo(a2[0], a2[1]); ctx.lineTo(a3[0], a3[1]);
        ctx.closePath(); ctx.fill();
      }
    }
  }

  // ══ 地形层（tier 变化时重画：T0-2 局部黄土/田野，T3-4 华北大图）══
  function renderTerrain(t: number): void {
    terrain.width = Math.max(1, W * dpr); terrain.height = Math.max(1, H * dpr);
    const g = terrain.getContext("2d")!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "#0c0d08"); bg.addColorStop(1, "#12100a");
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    const local = t < 3;
    const N = 46;
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const mx = i / N, my = j / N, sN = 1 / N;
        const ridge = local ? 0 : clamp((0.52 - mx) * 1.8, 0, 1) * 0.5;
        const freq = local ? 3.4 : 5.2;
        const h = fbm(mx * freq + 7, my * freq + 3) * (0.55 + ridge) + ridge * 0.4;
        const p0 = proj(mx, my), p1 = proj(mx + sN, my), p2 = proj(mx + sN, my + sN), p3 = proj(mx, my + sN);
        let r = 62 + h * 52, gg = 55 + h * 44, b = 34 + h * 22;
        if (local && h < 0.42) { r *= 0.94; gg *= 1.20; b *= 0.92; } // 局部图偏田野绿
        if (h > 0.62) { r *= 0.72; gg *= 0.70; b *= 0.72; }
        if (!local && h < 0.34) { r *= 1.10; gg *= 1.14; b *= 0.95; }
        const hl = fbm((mx - 0.012) * freq + 7, (my - 0.012) * freq + 3) * (0.55 + ridge) - h + ridge * 0.4;
        const lig = clamp(1 + hl * 5.5, 0.72, 1.3);
        g.fillStyle = `rgb(${(r * lig) | 0},${(gg * lig) | 0},${(b * lig) | 0})`;
        g.beginPath(); g.moveTo(p0.x, p0.y); g.lineTo(p1.x, p1.y); g.lineTo(p2.x, p2.y); g.lineTo(p3.x, p3.y); g.closePath(); g.fill();
      }
    }
    if (local) {
      // 田埂条纹 + 树（村庄尺度）
      for (let k = 0; k < 200; k++) {
        const mx = hash2(k, 2.7), my = hash2(k, 8.2);
        const p = proj(mx, my);
        if (hash2(k, 5.1) < 0.4) {
          g.fillStyle = "rgba(52,66,32,.75)";
          g.beginPath(); g.arc(p.x, p.y, A * 0.006, 0, 6.29); g.fill();
          g.strokeStyle = "rgba(40,32,20,.6)"; g.lineWidth = 1.2;
          g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x, p.y + A * 0.009); g.stroke();
        } else if (hash2(k, 6.3) < 0.3) {
          g.strokeStyle = "rgba(70,62,38,.4)"; g.lineWidth = 1;
          const p2 = proj(mx + 0.05, my + 0.02);
          g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p2.x, p2.y); g.stroke();
        }
      }
      // 土路：村与村之间(浅色路径感)
      g.strokeStyle = "rgba(140,120,80,.28)"; g.lineWidth = Math.max(2, A * 0.006); g.lineCap = "round";
      const C = proj(0.5, 0.56);
      for (const e of [[0.34, 0.44], [0.62, 0.40], [0.40, 0.72], [0.66, 0.68]]) {
        const p = proj(e[0], e[1]);
        g.beginPath(); g.moveTo(C.x, C.y); g.lineTo(p.x, p.y); g.stroke();
      }
    } else {
      for (let k = 0; k < 480; k++) {
        const mx = hash2(k, 1.7), my = hash2(k, 9.2);
        const ridge = clamp((0.52 - mx) * 1.8, 0, 1) * 0.5;
        const h = fbm(mx * 5.2 + 7, my * 5.2 + 3) * (0.55 + ridge) + ridge * 0.4;
        const p = proj(mx, my);
        if (h > 0.6) {
          const sZ = A * 0.008 * (1 + h);
          g.strokeStyle = "rgba(30,26,16,.55)"; g.lineWidth = 1.2;
          g.beginPath(); g.moveTo(p.x - sZ, p.y + sZ * 0.6); g.lineTo(p.x, p.y - sZ * 0.7); g.lineTo(p.x + sZ, p.y + sZ * 0.6); g.stroke();
        }
      }
      g.strokeStyle = "rgba(58,74,72,.85)"; g.lineWidth = Math.max(2, A * 0.008); g.lineCap = "round";
      g.beginPath();
      for (let tt2 = 0; tt2 <= 40; tt2++) {
        const tt = tt2 / 40;
        const mx = lerp(0.08, 0.92, tt) + Math.sin(tt * 9 + 1.3) * 0.035;
        const my = lerp(0.16, 0.5, tt) + Math.sin(tt * 6.2) * 0.05;
        const p = proj(mx, my);
        if (tt2 === 0) g.moveTo(p.x, p.y); else g.lineTo(p.x, p.y);
      }
      g.stroke();
      for (const [a, b] of RAILS) {
        const ca = cityOf(a), cb = cityOf(b);
        const pa = proj(ca.x, ca.y), pb = proj(cb.x, cb.y);
        g.strokeStyle = "rgba(20,18,14,.9)"; g.lineWidth = Math.max(2, A * 0.006);
        g.beginPath(); g.moveTo(pa.x, pa.y); g.lineTo(pb.x, pb.y); g.stroke();
        g.strokeStyle = "rgba(216,201,160,.5)"; g.lineWidth = Math.max(1, A * 0.003);
        g.setLineDash([A * 0.008, A * 0.008]);
        g.beginPath(); g.moveTo(pa.x, pa.y); g.lineTo(pb.x, pb.y); g.stroke();
        g.setLineDash([]);
      }
    }
    const c0 = proj(0, 0), c1 = proj(1, 0), c2 = proj(1, 1), c3 = proj(0, 1);
    g.strokeStyle = "rgba(216,201,160,.22)"; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(c0.x, c0.y); g.lineTo(c1.x, c1.y); g.lineTo(c2.x, c2.y); g.lineTo(c3.x, c3.y); g.closePath(); g.stroke();
  }

  // ══ 基元 ══
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
    g.strokeStyle = "rgba(40,42,46,.8)"; g.lineWidth = 1;
    for (let i = -2; i <= 2; i++) {
      g.beginPath(); g.moveTo(sx + i * k * 5, sy + k * 4 - Math.abs(i) * k); g.lineTo(sx + i * k * 5, sy + k * 1.5 - Math.abs(i) * k); g.stroke();
    }
  }
  function drawCity(g: CanvasRenderingContext2D, sx: number, sy: number, k: number, t: number): void {
    isoBox(g, sx - k * 5, sy, k * 5, k * 4, k * 7, "#6e7278", "#4a4e54", "#5c6066");
    isoBox(g, sx + k * 4, sy + k * 2, k * 4, k * 4, k * 5, "#63676d", "#45494f", "#54585e");
    isoBox(g, sx, sy - k * 3, k * 3.4, k * 3.4, k * 9, "#74787e", "#50545a", "#62666c");
    drawFlag(g, sx + k * 2, sy - k * 12, k * 0.9, t, true);
  }
  // 县城(T2)：带城墙的方城
  function drawCounty(g: CanvasRenderingContext2D, sx: number, sy: number, k: number, t: number): void {
    isoBox(g, sx, sy, k * 14, k * 14, k * 4, "#7a7466", "#565046", "#6a6456");
    isoBox(g, sx, sy - k * 3, k * 9, k * 9, k * 6, "#6e7278", "#4a4e54", "#5c6066");
    isoBox(g, sx - k * 12, sy + k * 1, k * 2, k * 2, k * 8, "#84888f", "#5c6068", "#70747c");
    isoBox(g, sx + k * 11, sy + k * 3, k * 2, k * 2, k * 8, "#84888f", "#5c6068", "#70747c");
    drawFlag(g, sx, sy - k * 12, k * 1.1, t, true);
  }
  function drawBlockadeRing(g: CanvasRenderingContext2D, px: number, py: number, spots: number, t: number, R: number): void {
    const arcFrac = clamp(spots / 5, 0, 1) * Math.PI * 2;
    g.save(); g.translate(px, py); g.scale(1, 0.5);
    g.strokeStyle = "rgba(28,26,20,.9)"; g.lineWidth = Math.max(3, A * 0.010);
    g.beginPath(); g.arc(0, 0, R, -Math.PI / 2 + t * 0.02, -Math.PI / 2 + t * 0.02 + arcFrac); g.stroke();
    g.strokeStyle = "rgba(140,130,100,.35)"; g.lineWidth = 1;
    g.setLineDash([3, 4]);
    g.beginPath(); g.arc(0, 0, R + A * 0.006, -Math.PI / 2 + t * 0.02, -Math.PI / 2 + t * 0.02 + arcFrac); g.stroke();
    g.setLineDash([]); g.restore();
  }
  function drawFormation(g: CanvasRenderingContext2D, sx: number, sy: number, count: number, jp: boolean, k: number, t: number, moving: boolean, face: number, label = true, wide = false): void {
    if (count <= 0) return;
    const n = clamp(Math.round(3 + Math.log2(count + 1) * 2.4), 3, 20);
    const cols = wide ? n : Math.ceil(Math.sqrt(n * 1.8));
    const rows = Math.ceil(n / cols);
    let idx = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols && idx < n; c++, idx++) {
        const jx = (hash2(idx, jp ? 3 : 5) - 0.5) * k * 3;
        const fx = sx + (c - (cols - 1) / 2) * k * (wide ? 9 : 7) + (r % 2) * k * 3 + jx;
        const fy = sy + (r - (rows - 1) / 2) * k * 5;
        drawFigure(g, fx, fy, k * 0.9, { jp, walk: moving ? t * 9 + idx * 1.7 : Math.sin(idx) * 0.3, face });
      }
    }
    if (!label) return;
    const lab = `${jp ? `日军${unitName(count)}` : "我军"} ×${Math.max(1, Math.round(count))}`;
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
  let curLayout: LocalLayout | null = null;

  function frame(dt: number, s: KRState): void {
    time += dt;
    const t = time;
    const T = tier(s);
    // 阶梯转场：白闪 + 重画地形
    if (T !== shownTier) { shownTier = T; flashT = 0.7; }
    if (terrainTier !== (T < 3 ? T : 3)) { terrainTier = T < 3 ? T : 3; renderTerrain(T); }
    curLayout = T < 3 ? localLayout(T, s.bases["hq"].spots) : null;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(terrain, 0, 0, W, H);

    // 地块控制层
    stepTiles(dt, s, curLayout);
    drawTiles();

    const k = clamp(A * 0.006, 1.1, 2.6) * (T === 0 ? 2.2 : T === 1 ? 1.5 : T === 2 ? 1.2 : 1);
    const sw = s.sweep;
    const queue: { y: number; draw: () => void }[] = [];
    const push = (y: number, draw: () => void): void => { queue.push({ y, draw }); };

    if (T < 3 && curLayout) {
      drawLocal(s, curLayout, k, t, push, dt, sw);
    } else {
      drawNorthChina(s, k, t, push, dt, sw);
    }

    // 小人（中心村人气）
    syncWalkers(s, T);
    for (const wlk of walkers) {
      const p = proj(wlk.x, wlk.y);
      const kind = wlk.kind;
      push(p.y, () => drawFigure(ctx, p.x, p.y, k * (kind === "soldier" ? 0.95 : 0.85) * (T >= 3 ? 1 : 0.8), {
        civ: kind !== "soldier", walk: t * 8 + wlk.ph, face: wlk.tx >= wlk.x ? 1 : -1, carry: kind === "evac" || kind === "migrate"
      }));
    }
    stepWalkers(dt, s, T);
    spawnMigrationWalkers(dt, s, T);

    if (sw) drawSweepFx(sw, s, k, t, dt);
    trackCasualties(sw, k, s);

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

    // 曳光弹/粒子
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

    // 名牌（华北图）
    if (T >= 3) drawLabels(s, k, t);
    else drawLocalLabels(s, curLayout!, k, T);

    // 扫荡泛红 + 阶梯转场白闪
    if (sw) {
      const pulse = sw.stage === "pillage" ? 0.5 : 0.3;
      const a = (Math.sin(t * (sw.stage === "incoming" ? 4 : 7)) * 0.5 + 0.5) * pulse;
      const gr = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.32, W / 2, H / 2, Math.max(W, H) * 0.72);
      gr.addColorStop(0, "rgba(180,40,26,0)"); gr.addColorStop(1, `rgba(180,40,26,${a * 0.4})`);
      ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
    }
    if (flashT > 0) {
      flashT = Math.max(0, flashT - dt);
      ctx.fillStyle = `rgba(240,228,192,${flashT * 0.7})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  // ── T0-2 局部场景 ──
  function drawLocal(s: KRState, L: LocalLayout, k: number, t: number, push: (y: number, d: () => void) => void, dt: number, sw: Sweep | null): void {
    const hq = s.bases["hq"];
    baseScreen.clear();
    const cp = proj(L.center.x, L.center.y);
    baseScreen.set("hq", cp);
    // 铁路(T2)
    if (L.rail) {
      const pa = proj(L.rail.x1, L.rail.y1), pb = proj(L.rail.x2, L.rail.y2);
      ctx.strokeStyle = "rgba(20,18,14,.9)"; ctx.lineWidth = Math.max(2, A * 0.006);
      ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke();
      ctx.strokeStyle = "rgba(216,201,160,.5)"; ctx.lineWidth = Math.max(1, A * 0.003);
      ctx.setLineDash([A * 0.008, A * 0.008]);
      ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke(); ctx.setLineDash([]);
    }
    // 村庄：中心村房子数随 dev；外村小
    for (let vi = 0; vi < L.villages.length; vi++) {
      const v = L.villages[vi];
      const p = proj(v.x, v.y);
      const houses = v.big ? 3 + hq.dev : 2;
      for (let i = 0; i < houses; i++) {
        const ang = (i / houses) * Math.PI * 2 + 0.7 + vi;
        const rr = A * (v.big ? 0.030 : 0.016) + (i % 3) * A * 0.008;
        const hp = { x: p.x + Math.cos(ang) * rr, y: p.y + Math.sin(ang) * rr * 0.5 };
        const burning = sw?.stage === "pillage" && v.big && i % 2 === 0;
        push(hp.y, () => drawHouse(ctx, hp.x, hp.y, k * (v.big ? 0.9 : 0.6)));
        if (burning) spawnFlame(hp.x, hp.y - k * 6, k);
      }
      if (v.big) {
        push(p.y + 1, () => drawFlag(ctx, p.x, p.y, k * 1.2, t));
        if (hq.tunnels > 0) push(p.y + 2, () => {
          ctx.fillStyle = "#14110b";
          for (let i = 0; i < hq.tunnels; i++) {
            const tx = p.x + A * 0.045 + i * k * 7, ty = p.y + A * 0.02;
            ctx.save(); ctx.translate(tx, ty); ctx.scale(1, 0.6); ctx.beginPath(); ctx.arc(0, 0, k * 2.6, Math.PI, 0); ctx.fill(); ctx.restore();
          }
        });
      }
    }
    // 炮楼(=hq.spots) + 封锁沟
    for (const tw of L.towers) {
      const p = proj(tw.x, tw.y);
      push(p.y, () => drawBlockhouse(ctx, p.x, p.y, k * 0.8, t));
    }
    if (hq.spots >= 3) drawBlockadeRing(ctx, cp.x, cp.y, hq.spots, t, A * 0.20);
    // 县城
    if (L.county) {
      const p = proj(L.county.x, L.county.y);
      push(p.y, () => drawCounty(ctx, p.x, p.y, k * 0.9, t));
    }
    // 扫荡兵团（局部：从炮楼/县城/图角开进）
    if (sw) drawSweepLocal(sw, L, k, t, push, dt);
  }
  function drawLocalLabels(s: KRState, L: LocalLayout, k: number, T: number): void {
    ctx.textBaseline = "alphabetic";
    const cp = proj(L.center.x, L.center.y);
    ctx.font = `700 ${Math.max(11, k * 4.6)}px 'Noto Serif SC', serif`;
    const lab = T === 0 ? "★ 根据地·村" : T === 1 ? "★ 中心村" : "★ 根据地中心区";
    const twd = ctx.measureText(lab).width;
    ctx.fillStyle = "rgba(90,26,18,.8)";
    ctx.beginPath(); ctx.roundRect(cp.x - twd / 2 - 5, cp.y + k * 8, twd + 10, k * 6.4, 3); ctx.fill();
    ctx.fillStyle = "#f2d8c0"; ctx.fillText(lab, cp.x - twd / 2, cp.y + k * 12.8);
    if (L.county) {
      const p = proj(L.county.x, L.county.y);
      ctx.font = `400 ${Math.max(10, k * 4)}px 'Noto Serif SC', serif`;
      ctx.fillStyle = "rgba(150,158,168,.8)";
      ctx.fillText("县城(日占)", p.x - k * 8, p.y + k * 10);
    }
    for (const tw of L.towers) {
      const p = proj(tw.x, tw.y);
      ctx.font = `400 ${Math.max(9, k * 3.2)}px 'Noto Serif SC', serif`;
      ctx.fillStyle = "rgba(150,158,168,.6)";
      ctx.fillText("炮楼", p.x - k * 3.5, p.y + k * 7);
    }
    void s;
  }
  // 局部扫荡表现
  function drawSweepLocal(sw: Sweep, L: LocalLayout, k: number, t: number, push: (y: number, d: () => void) => void, dt: number): void {
    const target = L.center;
    const spawnPts: { x: number; y: number }[] = [];
    for (let i = 0; i < sw.cols; i++) {
      const src = L.county && i === 0 ? L.county : L.towers[i % L.towers.length] ?? { x: 0.85, y: 0.2 };
      spawnPts.push(src);
    }
    drawSweepCommon(sw, spawnPts, target, k, t, push, dt);
  }

  // ── T3-4 华北图 ──
  function drawNorthChina(s: KRState, k: number, t: number, push: (y: number, d: () => void) => void, dt: number, sw: Sweep | null): void {
    for (const c of CITIES) {
      const p = proj(c.x, c.y);
      push(p.y, () => drawCity(ctx, p.x, p.y, k, t));
    }
    baseScreen.clear();
    for (const b of BASES) {
      const st = s.bases[b.id];
      const p = proj(b.x, b.y);
      baseScreen.set(b.id, p);
      if (!baseRevealed(s, b.id)) {
        // 战雾
        const R = A * 0.15;
        ctx.save(); ctx.translate(p.x, p.y); ctx.scale(1, 0.5);
        const gr = ctx.createRadialGradient(0, 0, 0, 0, 0, R);
        gr.addColorStop(0, "rgba(4,4,3,.92)"); gr.addColorStop(0.7, "rgba(4,4,3,.75)"); gr.addColorStop(1, "rgba(4,4,3,0)");
        ctx.fillStyle = gr;
        ctx.beginPath(); ctx.arc(0, 0, R, 0, 6.29); ctx.fill(); ctx.restore();
        ctx.fillStyle = "rgba(216,201,160,.25)";
        ctx.font = `700 ${Math.max(12, A * 0.028)}px 'Noto Serif SC', serif`;
        ctx.fillText("？", p.x - A * 0.008, p.y + A * 0.008);
        continue;
      }
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
        if (st.tunnels > 0) push(p.y + 2, () => {
          ctx.fillStyle = "#14110b";
          for (let i = 0; i < st.tunnels; i++) {
            const tx = p.x + A * 0.03 + i * k * 6, ty = p.y + A * 0.014;
            ctx.save(); ctx.translate(tx, ty); ctx.scale(1, 0.6); ctx.beginPath(); ctx.arc(0, 0, k * 2.2, Math.PI, 0); ctx.fill(); ctx.restore();
          }
        });
      } else {
        push(p.y, () => { drawHouse(ctx, p.x - k * 6, p.y, k * 0.6, true); drawHouse(ctx, p.x + k * 6, p.y + k * 2, k * 0.6, true); });
      }
      if (st.spots > 0) {
        for (let i = 0; i < st.spots; i++) {
          const ang = (i / 5) * Math.PI * 2 + 1.1;
          const sp = { x: p.x + Math.cos(ang) * A * 0.085, y: p.y + Math.sin(ang) * A * 0.0425 };
          push(sp.y, () => drawBlockhouse(ctx, sp.x, sp.y, k * 0.75, t));
        }
        if (st.spots >= 3) drawBlockadeRing(ctx, p.x, p.y, st.spots, t, A * 0.115);
      }
    }
    if (sw) {
      const target = BASES.find((b) => b.id === sw.targetBase)!;
      const sorted = [...CITIES].sort((a, b) => ((a.x - target.x) ** 2 + (a.y - target.y) ** 2) - ((b.x - target.x) ** 2 + (b.y - target.y) ** 2));
      const spawns: { x: number; y: number }[] = [];
      for (let i = 0; i < sw.cols; i++) spawns.push(sorted[i % sorted.length]);
      drawSweepCommon(sw, spawns, target, k, t, push, dt);
    }
  }
  function drawLabels(s: KRState, k: number, t: number): void {
    ctx.textBaseline = "alphabetic";
    for (const b of BASES) {
      if (!baseRevealed(s, b.id)) continue;
      const p = baseScreen.get(b.id)!;
      const st = s.bases[b.id];
      const canEst = !st.est && era(s).canExpand && tier(s) >= 3;
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
  }

  // ── 扫荡通用表现（意图差异：合围收缩圈 / 奔袭直插 / 梳篦拉网）──
  function drawSweepCommon(sw: Sweep, spawns: { x: number; y: number }[], target: { x: number; y: number }, k: number, t: number, push: (y: number, d: () => void) => void, dt: number): void {
    const per = sw.strength / Math.max(1, sw.cols);
    const tp = proj(target.x, target.y);
    if (sw.stage === "incoming") {
      const prog = 1 - sw.etaSec / sw.etaSec0;
      // 合围：外圈收缩虚线椭圆
      if (sw.kind === "encircle") {
        const R0 = A * 0.30, R = R0 * (1 - prog * 0.75);
        ctx.save(); ctx.translate(tp.x, tp.y); ctx.scale(1, 0.5);
        ctx.strokeStyle = `rgba(226,86,77,${0.35 + prog * 0.3})`; ctx.lineWidth = 1.6; ctx.setLineDash([7, 7]);
        ctx.beginPath(); ctx.arc(0, 0, R, t * 0.4, t * 0.4 + Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]); ctx.restore();
      }
      for (let i = 0; i < spawns.length; i++) {
        const sp = spawns[i];
        const dx = target.x - sp.x, dy = target.y - sp.y, dl = Math.hypot(dx, dy) || 1;
        const stop = 0.055 + i * 0.008;
        const spdMul = sw.kind === "raid" ? 1 : 1; // 奔袭本身 eta 短=快
        const mx = lerp(sp.x, target.x - (dx / dl) * stop, prog * spdMul), my = lerp(sp.y, target.y - (dy / dl) * stop, prog * spdMul);
        const p = proj(mx, my);
        const face = tp.x >= p.x ? 1 : -1;
        const wide = sw.kind === "comb"; // 梳篦=拉网横排
        push(p.y, () => drawFormation(ctx, p.x, p.y, per, true, k * 0.9, t, true, face, i === 0, wide));
        if (Math.random() < (sw.kind === "raid" ? 0.7 : 0.3)) particles.push({ x: p.x + (Math.random() - 0.5) * k * 14, y: p.y + k * 2, vx: -5 * face, vy: -4, life: 0, max: 1.2, kind: "puff", r: k * 2 });
        // 行军路线：奔袭=醒目实线，其它=虚线
        if (sw.kind === "raid") { ctx.strokeStyle = "rgba(255,90,60,.8)"; ctx.lineWidth = 2; }
        else { ctx.setLineDash([5, 6]); ctx.strokeStyle = "rgba(226,86,77,.45)"; ctx.lineWidth = 1.3; }
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(tp.x, tp.y); ctx.stroke(); ctx.setLineDash([]);
      }
      if (sw.committed > 0) {
        const dp = proj(target.x, target.y - 0.035);
        push(dp.y, () => drawFormation(ctx, dp.x, dp.y, sw.committed, false, k, t, false, 1));
      }
    } else if (sw.stage === "battle") {
      const our = proj(target.x, target.y + 0.012);
      push(our.y, () => drawFormation(ctx, our.x, our.y, sw.committed, false, k, t, false, 1));
      for (let i = 0; i < spawns.length; i++) {
        const sp = spawns[i];
        const dx = target.x - sp.x, dy = target.y - sp.y, dl = Math.hypot(dx, dy) || 1;
        const jp = proj(target.x - (dx / dl) * 0.05, target.y - (dy / dl) * 0.05);
        const face = tp.x >= jp.x ? 1 : -1;
        push(jp.y, () => drawFormation(ctx, jp.x, jp.y, per, true, k * 0.9, t, false, face, i === 0, sw.kind === "comb"));
        const rate = clamp((sw.strength + sw.committed) * 0.02, 0.3, 2.2) / sw.cols;
        if (Math.random() < rate * dt * 30) {
          const fromJp = Math.random() < 0.5;
          const a = fromJp ? jp : our, b = fromJp ? our : jp;
          const ox = (Math.random() - 0.5) * k * 12, oy = (Math.random() - 0.5) * k * 7;
          tracers.push({ x1: a.x + ox, y1: a.y - k * 6 + oy, x2: b.x - ox, y2: b.y - k * 5 + oy * 0.5, life: 1, jp: fromJp });
          particles.push({ x: a.x + ox, y: a.y - k * 6 + oy, vx: 0, vy: 0, life: 0, max: 0.16, kind: "flash", r: k * 2.4 });
        }
      }
      if (Math.random() < dt * 8) particles.push({ x: tp.x + (Math.random() - 0.5) * k * 34, y: tp.y - k * 4, vx: 4, vy: -8, life: 0, max: 2.2, kind: "smoke", r: k * 3 });
    } else {
      push(tp.y + 2, () => drawFormation(ctx, tp.x, tp.y, sw.strength, true, k, t, true, 1));
      spawnFlame(tp.x + (Math.random() - 0.5) * k * 24, tp.y - k * 4 + (Math.random() - 0.5) * k * 10, k);
    }
  }
  // 扫荡期间的群众进山转移小人
  function drawSweepFx(sw: Sweep, s: KRState, k: number, t: number, dt: number): void {
    void k; void t;
    if (sw.evacStarted && sw.evacProgress < 1) {
      const T = tier(s);
      const target = T < 3 && curLayout ? curLayout.center : BASES.find((b) => b.id === sw.targetBase)!;
      if (Math.random() < dt * 6 && walkers.filter((w) => w.kind === "evac").length < 26) {
        walkers.push({
          x: target.x + (Math.random() - 0.5) * 0.02, y: target.y + (Math.random() - 0.5) * 0.02,
          tx: EVAC.x + (Math.random() - 0.5) * 0.05, ty: EVAC.y + (Math.random() - 0.5) * 0.04,
          spd: 0.018 + Math.random() * 0.008, kind: "evac", ph: Math.random() * 7
        });
      }
    }
  }
  // 跨根据地大迁移的队伍（读 s.migration）
  function spawnMigrationWalkers(dt: number, s: KRState, T: number): void {
    const m = s.migration;
    if (!m || T < 3) { migSpawnAcc = 0; return; }
    migSpawnAcc += dt;
    const from = BASES.find((b) => b.id === m.from)!, to = BASES.find((b) => b.id === m.to)!;
    if (migSpawnAcc > 0.25 && walkers.filter((w) => w.kind === "migrate").length < 20) {
      migSpawnAcc = 0;
      walkers.push({
        x: from.x + (Math.random() - 0.5) * 0.02, y: from.y + (Math.random() - 0.5) * 0.02,
        tx: to.x + (Math.random() - 0.5) * 0.03, ty: to.y + (Math.random() - 0.5) * 0.02,
        spd: 0.03 + Math.random() * 0.01, kind: "migrate", ph: Math.random() * 7
      });
    }
  }

  function spawnFlame(x: number, y: number, k: number): void {
    if (Math.random() < 0.5) particles.push({ x: x + (Math.random() - 0.5) * k * 6, y, vx: (Math.random() - 0.5) * 4, vy: -14 - Math.random() * 10, life: 0, max: 0.7, kind: "flame", r: k * 2.2 });
    if (Math.random() < 0.3) particles.push({ x, y: y - k * 4, vx: 4, vy: -12, life: 0, max: 2.6, kind: "smoke", r: k * 3 });
  }
  function trackCasualties(sw: Sweep | null, k: number, s: KRState): void {
    if (!sw || sw.stage !== "battle") { prevJp = sw ? sw.strength : 0; prevOur = sw ? sw.committed : 0; prevSweepOn = !!sw; return; }
    if (!prevSweepOn) { prevJp = sw.strength; prevOur = sw.committed; prevSweepOn = true; return; }
    const T = tier(s);
    const target = T < 3 && curLayout ? curLayout.center : BASES.find((b) => b.id === sw.targetBase)!;
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
  function centerOf(T: number): { x: number; y: number } {
    return T < 3 && curLayout ? curLayout.center : { x: BASES[0].x, y: BASES[0].y };
  }
  function syncWalkers(s: KRState, T: number): void {
    const wantVil = clamp(Math.floor(2 + Math.log2(s.bing + 1) * 2.6), 2, 30);
    const wantSol = clamp(Math.floor(Math.log2(s.bing + 1) * 1.1), 0, 12);
    let vil = 0, sol = 0;
    for (const w of walkers) { if (w.kind === "villager") vil++; else if (w.kind === "soldier") sol++; }
    while (vil < wantVil) { walkers.push(spawnWalker("villager", T)); vil++; }
    while (sol < wantSol) { walkers.push(spawnWalker("soldier", T)); sol++; }
    if (vil > wantVil || sol > wantSol) {
      for (let i = walkers.length - 1; i >= 0 && (vil > wantVil || sol > wantSol); i--) {
        const w = walkers[i];
        if (w.kind === "villager" && vil > wantVil) { walkers.splice(i, 1); vil--; }
        else if (w.kind === "soldier" && sol > wantSol) { walkers.splice(i, 1); sol--; }
      }
    }
  }
  function spawnWalker(kind: "villager" | "soldier", T: number): Walker {
    const C = centerOf(T);
    const r = (kind === "soldier" ? 0.05 : 0.035) * (T < 3 ? 1.6 : 1);
    return {
      x: C.x + (Math.random() - 0.5) * r * 2, y: C.y + (Math.random() - 0.5) * r * 1.6,
      tx: C.x + (Math.random() - 0.5) * r * 2, ty: C.y + (Math.random() - 0.5) * r * 1.6,
      spd: 0.008 + Math.random() * 0.006, kind, ph: Math.random() * 7
    };
  }
  function stepWalkers(dt: number, s: KRState, T: number): void {
    void s;
    const C = centerOf(T);
    for (let i = walkers.length - 1; i >= 0; i--) {
      const w = walkers[i];
      const dx = w.tx - w.x, dy = w.ty - w.y, d = Math.hypot(dx, dy);
      if (d < 0.004) {
        if (w.kind === "evac" || w.kind === "migrate") { walkers.splice(i, 1); continue; }
        const r = (w.kind === "soldier" ? 0.05 : 0.035) * (T < 3 ? 1.6 : 1);
        w.tx = C.x + (Math.random() - 0.5) * r * 2; w.ty = C.y + (Math.random() - 0.5) * r * 1.6;
      } else {
        w.x += (dx / d) * w.spd * dt * (w.kind === "evac" || w.kind === "migrate" ? 1 : 0.55);
        w.y += (dy / d) * w.spd * dt * (w.kind === "evac" || w.kind === "migrate" ? 1 : 0.55);
      }
    }
  }

  function resize(): void {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = canvas.clientWidth || 1; H = canvas.clientHeight || 1;
    canvas.width = Math.max(1, W * dpr); canvas.height = Math.max(1, H * dpr);
    cx = W * 0.5; cy = H * 0.52;
    A = Math.min(W * 0.52, H * 0.92); B = A * 0.5;
    terrainTier = -1; // 触发重画
  }
  resize();

  function hitBase(cxp: number, cyp: number): string | null {
    const m = unproj(cxp, cyp);
    if (curLayout) { // 局部场景只有 hq
      const d = (curLayout.center.x - m.x) ** 2 + (curLayout.center.y - m.y) ** 2;
      return d < HIT_R * HIT_R * 4 ? "hq" : null;
    }
    let best: string | null = null, bd = HIT_R * HIT_R;
    for (const b of BASES) {
      const d = (b.x - m.x) ** 2 + (b.y - m.y) ** 2;
      if (d < bd) { bd = d; best = b.id; }
    }
    return best;
  }

  return { ok: true, resize, frame, hitBase, dispose() { walkers.length = 0; particles.length = 0; } };
}
