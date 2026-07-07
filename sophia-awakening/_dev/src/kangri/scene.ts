// 《烽火敌后》· 2.5D 战场（纯 Canvas2D，无图片资产）。
// v4：同一张无缝缩放的世界大地图。
// · 相机系统：滚轮缩放(1~22×)+拖拽平移，随时可拉到全图；阶梯升级=战雾解锁范围扩大+镜头自动平滑拉远。
//   开局全华北笼罩浓雾，只有自己的村亮着一点红——星星之火。
// · 所有内容钉在同一世界坐标系：hq 村群/卫星村/村口炮楼/县城+铁路支线(近景) 与 华北铁路网/城市/九块根据地(远景) 连续共存。
// · 地形+地块控制染色+战雾 = 屏幕空间自适应采样一次遍历(离屏缓存,脏了才重采样)；
//   地块在世界空间量化 → 边界经等距投影自然贴网格；控制半径平滑生长=红区逐格漫开。
// · 扫荡意图表现/兵团/小人/迁移队伍全部世界坐标，缩放下连续。只画不改 core 状态。
import {
  BASES,
  era, tier, baseRevealed, unitName, type KRState, type Sweep
} from "./core";

export interface Scene25D {
  ok: boolean;
  resize: () => void;
  frame: (dt: number, s: KRState) => void;
  hitBase: (cx: number, cy: number) => string | null;
  focusSweep: () => void;
  getZoom: () => number;
  dispose: () => void;
}


// ── 世界布点 ──
const HQ = { x: 0.50, y: 0.68 };
// hq 卫星村（世界坐标偏移；T0 雾半径外→只见中心村，T1 雾散见连村）
// 卫星村: 距中心村 1.5~4.5km(真实邻村距离)
const HQ_SATS = [
  { x: HQ.x + 0.0016, y: HQ.y - 0.0009 }, { x: HQ.x - 0.0018, y: HQ.y + 0.0013 },
  { x: HQ.x + 0.0028, y: HQ.y + 0.0008 }, { x: HQ.x - 0.0030, y: HQ.y - 0.0015 },
  { x: HQ.x + 0.0009, y: HQ.y + 0.0026 }, { x: HQ.x - 0.0011, y: HQ.y - 0.0029 }, { x: HQ.x + 0.0037, y: HQ.y - 0.0022 }
];
// 县城群(日占)：T3 见第一座,T4 专区见三座
const COUNTIES = [
  { x: HQ.x + 0.036, y: HQ.y - 0.024, name: "东关县城" },
  { x: HQ.x - 0.040, y: HQ.y + 0.020, name: "西口县城" },
  { x: HQ.x + 0.022, y: HQ.y + 0.052, name: "南塬县城" }
];
const HQ_COUNTY = COUNTIES[0];
// 乡镇聚落(中立灰村,被红区罩住即"解放"观感)
// 乡镇(6~18km) + 小庄子(3~7km)
const TOWNS = [
  { x: HQ.x - 0.009, y: HQ.y - 0.006 }, { x: HQ.x + 0.011, y: HQ.y - 0.010 }, { x: HQ.x + 0.014, y: HQ.y + 0.007 },
  { x: HQ.x - 0.013, y: HQ.y + 0.010 }, { x: HQ.x + 0.006, y: HQ.y + 0.015 }, { x: HQ.x - 0.017, y: HQ.y - 0.001 },
  { x: HQ.x - 0.004, y: HQ.y + 0.019 }, { x: HQ.x + 0.019, y: HQ.y - 0.002 }, { x: HQ.x - 0.008, y: HQ.y - 0.016 }, { x: HQ.x + 0.009, y: HQ.y + 0.023 },
  { x: HQ.x + 0.004, y: HQ.y - 0.005 }, { x: HQ.x - 0.005, y: HQ.y + 0.004 }, { x: HQ.x + 0.006, y: HQ.y + 0.003 }, { x: HQ.x - 0.006, y: HQ.y - 0.004 }
];
// 村口第一座炮楼(T0 的对手)；更多 spots 塔在外环
const HQ_TOWER0 = { x: HQ.x + 0.0021, y: HQ.y - 0.0007 }; // 村口炮楼 ~2.5km
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
// 阶梯 → 战雾解锁半径(以 hq 为中心；已开辟/揭示的根据地各自再挖开一圈)。7 档:村/连村/区乡/县/专区/边区/华北
const UNLOCK_R = [0.0028, 0.0058, 0.012, 0.024, 0.045, 0.085, 0.16, 0.4, 2];
// 阶梯 → 升级时镜头自动拉远到的 zoom
const TIER_ZOOM = [560, 270, 130, 62, 30, 15, 7.2, 3.2, 1.15];

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
const sstep = (a: number, b: number, x: number): number => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

interface Walker { x: number; y: number; tx: number; ty: number; spd: number; kind: "villager" | "soldier" | "evac" | "migrate"; ph: number; }
interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; kind: "smoke" | "flame" | "flash" | "puff"; r: number; } // 世界坐标/世界速度
interface Corpse { x: number; y: number; life: number; jp: boolean; }
interface Tracer { x1: number; y1: number; x2: number; y2: number; life: number; jp: boolean; }

export function initScene(canvas: HTMLCanvasElement): Scene25D {
  const ctx0 = canvas.getContext("2d");
  if (!ctx0) return { ok: false, resize() {}, frame() {}, hitBase: () => null, focusSweep() {}, getZoom: () => 1, dispose() {} };
  const ctx: CanvasRenderingContext2D = ctx0;

  let W = 0, H = 0, dpr = 1;
  let cx0 = 0, cy0 = 0, A = 400, B = 200;

  // ── 相机 ──
  const cam = { x: HQ.x, y: HQ.y, zoom: TIER_ZOOM[0], tx: HQ.x, ty: HQ.y, tzoom: TIER_ZOOM[0] };
  let userCamMs = 0; // 玩家最近操作相机的冷却(自动聚焦让路)
  const proj = (mx: number, my: number): { x: number; y: number } => {
    const u = (mx - cam.x) * cam.zoom, v = (my - cam.y) * cam.zoom;
    return { x: cx0 + (u - v) * A, y: cy0 + (u + v) * B };
  };
  const unproj = (sx: number, sy: number): { x: number; y: number } => {
    const px = (sx - cx0) / A, py = (sy - cy0) / B;
    const u = (px + py) / 2, v = (py - px) / 2;
    return { x: u / cam.zoom + cam.x, y: v / cam.zoom + cam.y };
  };

  // 交互：滚轮缩放(鼠标锚点) + 拖拽平移
  let dragging = false, dragMoved = false, lastMx = 0, lastMy = 0;
  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    const before = unproj(mx, my);
    cam.zoom = clamp(cam.zoom * Math.exp(-e.deltaY * 0.0019), 1, 900);
    cam.tzoom = cam.zoom;
    const after = unproj(mx, my);
    cam.x += before.x - after.x; cam.y += before.y - after.y;
    cam.x = clamp(cam.x, 0, 1); cam.y = clamp(cam.y, 0, 1);
    cam.tx = cam.x; cam.ty = cam.y;
    userCamMs = 8000; dirty = true;
  }, { passive: false });
  canvas.addEventListener("mousedown", (e) => { dragging = true; dragMoved = false; lastMx = e.clientX; lastMy = e.clientY; });
  window.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    const dx = e.clientX - lastMx, dy = e.clientY - lastMy;
    if (Math.abs(dx) + Math.abs(dy) > 3) dragMoved = true;
    lastMx = e.clientX; lastMy = e.clientY;
    // 屏幕位移 → 世界位移（等距逆变换）
    const pu = dx / A / 2 + dy / B / 2, pv = dy / B / 2 - dx / A / 2;
    cam.x -= pu / cam.zoom; cam.y -= pv / cam.zoom;
    cam.x = clamp(cam.x, 0, 1); cam.y = clamp(cam.y, 0, 1);
    cam.tx = cam.x; cam.ty = cam.y;
    userCamMs = 8000; dirty = true;
  });
  window.addEventListener("mouseup", () => { dragging = false; });

  // ── 地面层（地形+地块染色+战雾 一次采样；离屏缓存，脏才重画）──
  const ground = document.createElement("canvas");
  let dirty = true;
  let groundTimer = 0;
  // 控制源的平滑半径（生长动画：红区逐格漫开靠它 lerp）
  const smoothR = new Map<string, number>();
  function smoothTo(key: string, target: number, dt: number): number {
    const cur = smoothR.get(key) ?? 0;
    const next = cur + (target - cur) * Math.min(1, dt * 1.6);
    smoothR.set(key, next);
    return next;
  }
  interface Src { x: number; y: number; r: number; }
  let ourSrc: Src[] = [], jpSrc: Src[] = [];
  function rebuildSources(s: KRState, dt: number): void {
    const T = tier(s);
    ourSrc = []; jpSrc = [];
    const hq = s.bases["hq"];
    // hq 村群（中心+卫星，随发展/人口长大）
    const popF = clamp(hq.pop / 20, 0.3, 1.25);
    const tierGrow = Math.pow(1.75, T * 0.55); // 档位放大: 村级 0.002 → 板块级 ~0.05
    const baseR = Math.min(0.055, (0.0022 + hq.dev * 0.0008) * popF * tierGrow);
    ourSrc.push({ x: HQ.x, y: HQ.y, r: smoothTo("hq", baseR * 1.5, dt) });
    const satN = clamp(1 + hq.dev + T, 0, HQ_SATS.length);
    for (let i = 0; i < HQ_SATS.length; i++) {
      const on = i < satN;
      const r = smoothTo(`sat${i}`, on ? baseR : 0, dt);
      if (r > 0.002) ourSrc.push({ x: HQ_SATS[i].x, y: HQ_SATS[i].y, r });
    }
    // 其余根据地
    for (const b of BASES) {
      if (b.id === "hq") continue;
      const st = s.bases[b.id];
      const target = st.est ? (0.045 + st.dev * 0.012) * clamp(st.pop / b.pop0, 0.3, 1.25) * Math.max(0.45, 1 - st.spots * 0.09) : 0;
      const r = smoothTo(b.id, target, dt);
      if (r > 0.002) ourSrc.push({ x: b.x, y: b.y, r });
    }
    // 日军：城市 + 县城 + 炮楼
    for (const c of CITIES) jpSrc.push({ x: c.x, y: c.y, r: 0.07 });
    for (const c of COUNTIES) jpSrc.push({ x: c.x, y: c.y, r: 0.008 });
    for (const tw of hqTowers(s)) jpSrc.push({ x: tw.x, y: tw.y, r: 0.0035 });
    for (const b of BASES) {
      const st = s.bases[b.id];
      if (b.id !== "hq" && st.spots > 0) jpSrc.push({ x: b.x, y: b.y, r: (0.035 + st.spots * 0.01) * 0.8 });
    }
  }
  function fieldAt(w: { x: number; y: number }, arr: Src[]): number {
    let v = 0;
    for (const sc of arr) {
      const d2 = (w.x - sc.x) ** 2 + (w.y - sc.y) ** 2;
      if (d2 < sc.r * sc.r * 9) v = Math.max(v, Math.exp(-d2 / Math.max(1e-6, sc.r * sc.r)));
    }
    return v;
  }
  function fogAt(s: KRState, wx: number, wy: number): number {
    const T = tier(s);
    const uR = UNLOCK_R[T];
    const hb = BASES.find((b) => b.id === s.hqBase) ?? BASES[0];
    const edge = Math.max(0.004, uR * 0.5);
    let vis = sstep(uR + edge, uR - edge * 0.3, Math.hypot(wx - hb.x, wy - hb.y));
    for (const b of BASES) {
      if (b.id === "hq" || !baseRevealed(s, b.id)) continue;
      if (tier(s) < 7) continue; // 大板块的雾 T7(边区) 起才挖开
      vis = Math.max(vis, sstep(0.15, 0.06, Math.hypot(wx - b.x, wy - b.y)));
    }
    return 1 - vis; // 1=浓雾
  }
  // ── PCG 地理：高度场(西部太行山脉ridge)/湿度场/河流(沿地势下行的三条河) ──
  function terrainH(x: number, y: number): number {
    const ridge = clamp((0.52 - x) * 1.8, 0, 1) * 0.5;
    return fbm(x * 5.2 + 7, y * 5.2 + 3) * (0.55 + ridge) + ridge * 0.4;
  }
  const moistAt = (x: number, y: number): number => fbm(x * 4.2 + 51, y * 4.2 + 83);
  // 河流(华北意象:滹沱河/漳河/永定河,山地发源流向东部平原)
  const RIVERS: [number, number][][] = [
    [[0.28, 0.28], [0.40, 0.34], [0.52, 0.40], [0.66, 0.48], [0.82, 0.54]],
    [[0.34, 0.56], [0.44, 0.62], [0.54, 0.70], [0.66, 0.78], [0.78, 0.84]],
    [[0.44, 0.08], [0.54, 0.14], [0.63, 0.20], [0.72, 0.27]]
  ];
  function segDist(x: number, y: number, ax: number, ay: number, bx: number, by: number): number {
    const dx = bx - ax, dy = by - ay;
    const t = clamp(((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1), 0, 1);
    return Math.hypot(x - (ax + dx * t), y - (ay + dy * t));
  }
  function railDist(x: number, y: number): number {
    let best = 9;
    for (const [a, b] of RAILS) {
      const ca = cityOf(a), cb = cityOf(b);
      const d = segDist(x, y, ca.x, ca.y, cb.x, cb.y);
      if (d < best) best = d;
    }
    return best;
  }
  function riverDist(x: number, y: number): number {
    let best = 9;
    for (const rv of RIVERS) {
      for (let i = 0; i < rv.length - 1; i++) {
        const ax = rv[i][0], ay = rv[i][1], bx = rv[i + 1][0], by = rv[i + 1][1];
        const dx = bx - ax, dy = by - ay;
        const t = clamp(((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy), 0, 1);
        const d = Math.hypot(x - (ax + dx * t), y - (ay + dy * t));
        if (d < best) best = d;
      }
    }
    return best;
  }
  // 地形通行系数：高山/大河阻断势力扩张 → 领土边界自然沿山脊河流走(文明6的边界-地形关联)
  function terrainPass(x: number, y: number): number {
    if (terrainH(x, y) > 0.63) return 0.3;
    if (riverDist(x, y) < 0.011) return 0.55;
    return 1;
  }
  // 地理符号(山峰/森林簇/农田)预计算——按高度带+湿度分布,符合地理位置
  interface Sym { x: number; y: number; kind: 0 | 1 | 2; sd: number; } // 0峰 1树 2田
  const SYMS: Sym[] = (() => {
    const out: Sym[] = [];
    for (let k = 0; k < 4200; k++) {
      const x = hash2(k, 1.7), y = hash2(k, 9.2), sd = hash2(k, 4.4);
      const h = terrainH(x, y), m = moistAt(x, y);
      if (riverDist(x, y) < 0.012) continue;
      if (h > 0.60) out.push({ x, y, kind: 0, sd });
      else if (h > 0.40 && m > 0.56) out.push({ x, y, kind: 1, sd });
      else if (h < 0.32 && sd < 0.55) out.push({ x, y, kind: 2, sd });
      else if (m > 0.72) out.push({ x, y, kind: 1, sd });
    }
    return out;
  })();
  // ── PCG 敌占网(囚笼: 城-县-据点沿交通线) + 村庄散布 ──
  const PCG_COUNTIES: { x: number; y: number }[] = (() => {
    const out: { x: number; y: number }[] = [];
    for (let k = 0; k < 1600 && out.length < 30; k++) {
      const x = hash2(k, 77.3) * 0.9 + 0.05, y = hash2(k, 178.9) * 0.9 + 0.05;
      if (terrainH(x, y) > 0.42) continue;
      if (railDist(x, y) > 0.045 && riverDist(x, y) > 0.035) continue;
      if (Math.hypot(x - HQ.x, y - HQ.y) < 0.09) continue;
      if (CITIES.some((c) => Math.hypot(x - c.x, y - c.y) < 0.06)) continue;
      if (out.some((c) => Math.hypot(x - c.x, y - c.y) < 0.055)) continue;
      out.push({ x, y });
    }
    return out;
  })();
  const PCG_PILLBOX: { x: number; y: number }[] = (() => {
    const out: { x: number; y: number }[] = [];
    let k = 0;
    for (const [a, b] of RAILS) {
      const ca = cityOf(a), cb = cityOf(b);
      for (let t = 0.1; t < 0.92; t += 0.09) {
        k += 1;
        const x = lerp(ca.x, cb.x, t) + (hash2(k, 31.7) - 0.5) * 0.012;
        const y = lerp(ca.y, cb.y, t) + (hash2(k, 63.1) - 0.5) * 0.012;
        if (Math.hypot(x - HQ.x, y - HQ.y) < 0.05) continue;
        out.push({ x, y });
      }
    }
    return out;
  })();
  const PCG_VILLAGES: { x: number; y: number }[] = (() => {
    const out: { x: number; y: number }[] = [];
    for (let k = 0; k < 2600 && out.length < 130; k++) {
      const x = hash2(k, 271.3) * 0.92 + 0.04, y = hash2(k, 419.7) * 0.92 + 0.04;
      const h = terrainH(x, y);
      if (h > 0.55) continue; // 山里村少
      if (h > 0.4 && hash2(k, 91.1) < 0.6) continue;
      if (Math.hypot(x - HQ.x, y - HQ.y) < 0.05) continue;
      if (riverDist(x, y) < 0.006 || railDist(x, y) < 0.006) continue;
      if (out.some((c) => Math.hypot(x - c.x, y - c.y) < 0.022)) continue;
      out.push({ x, y });
    }
    return out;
  })();
  // 日军巡逻队(沿铁路往返的活动单位)
  const PATROLS = [0, 2, 4, 6].map((ri) => ({ ri: ri % RAILS.length, t: 0.2 + (ri % 3) * 0.25, dir: 1 }));
  const loCv = document.createElement("canvas");
  function renderGround(s: KRState): void {
    ground.width = Math.max(1, W * dpr); ground.height = Math.max(1, H * dpr);
    const g = ground.getContext("2d")!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = "#0a0b07"; g.fillRect(0, 0, W, H);
    // ── 地形底图：低分辨率逐像素采样 → 双线性平滑放大(连续渐变,不再是马赛克色块) ──
    const LX = 150, LY = 92;
    loCv.width = LX; loCv.height = LY;
    const lg = loCv.getContext("2d")!;
    const img = lg.createImageData(LX, LY);
    const px = img.data;
    const zd1 = clamp((cam.zoom - 4) / 20, 0, 0.28), zd2 = clamp((cam.zoom - 40) / 200, 0, 0.24);
    let prevH = 0;
    for (let j = 0; j < LY; j++) {
      for (let i = 0; i < LX; i++) {
        const idx = (j * LX + i) * 4;
        const w = unproj((i + 0.5) / LX * W, (j + 0.5) / LY * H);
        if (w.x < -0.02 || w.x > 1.02 || w.y < -0.02 || w.y > 1.02) { px[idx] = 10; px[idx + 1] = 11; px[idx + 2] = 7; px[idx + 3] = 255; prevH = 0; continue; }
        let h = terrainH(w.x, w.y);
        if (zd1 > 0) h = h * (1 - zd1 - zd2) + fbm(w.x * 26 + 3, w.y * 26 + 9) * zd1 + (zd2 > 0 ? fbm(w.x * 160 + 31, w.y * 160 + 17) * zd2 : 0);
        const m = moistAt(w.x, w.y);
        // ── 生物群系染色(重设计: 地貌分区在中远景直接可读) ──
        let r: number, gg: number, b: number;
        const forest = (h > 0.40 && h < 0.64 && m > 0.54) || m > 0.74; // 森林区
        if (h >= 0.66) { // 高山: 深棕灰,脊线亮
          const t = clamp((h - 0.66) / 0.22, 0, 1);
          r = lerp(104, 82, t); gg = lerp(94, 74, t); b = lerp(74, 62, t);
        } else if (h >= 0.52) { // 山地
          r = 118; gg = 104; b = 72;
        } else if (h >= 0.36) { // 丘陵黄土 + 梯田等高条带
          r = 152; gg = 128; b = 82;
          const band = (h * 30) % 1;
          if (band < 0.18) { r *= 0.90; gg *= 0.90; b *= 0.88; }
        } else { // 平原: 农田四色拼块(麦黄/田绿/休耕/浅绿)
          const pf = clamp(cam.zoom * 22, 120, 4000);
          const patch = hash2(Math.floor(w.x * pf), Math.floor(w.y * pf));
          if (patch < 0.3) { r = 162; gg = 146; b = 86; }
          else if (patch < 0.55) { r = 140; gg = 148; b = 80; }
          else if (patch < 0.8) { r = 154; gg = 138; b = 90; }
          else { r = 146; gg = 152; b = 86; }
        }
        // 森林色块(中远景可见的深绿成片)
        if (forest) { const ft = 0.55; r = lerp(r, 62, ft); gg = lerp(gg, 88, ft); b = lerp(b, 48, ft); }
        // 湿度微调
        const wet = (m - 0.5) * 0.4;
        gg *= 1 + wet * 0.2; r *= 1 - wet * 0.1;
        // 河谷湿绿带
        const rd = riverDist(w.x, w.y);
        if (rd < 0.024) { const t = sstep(0.024, 0.006, rd) * 0.6; r = lerp(r, 96, t); gg = lerp(gg, 128, t); b = lerp(b, 62, t); }
        // 村庄周边田野
        const dHq = Math.hypot(w.x - HQ.x, w.y - HQ.y);
        if (dHq < 0.02) { const gmix = sstep(0.02, 0.004, dHq) * 0.4; r = lerp(r, r * 0.85, gmix); gg = lerp(gg, gg * 1.18, gmix); b = lerp(b, b * 0.88, gmix); }
        // 侧光(横向高度差分近似)
        const lig = clamp(1 + (prevH - h) * 5.5, 0.74, 1.28);
        prevH = h;
        r *= lig; gg *= lig; b *= lig;
        // 战雾
        const fog = fogAt(s, w.x, w.y);
        if (fog > 0.02) { const fa = fog * 0.93; r = lerp(r, 5, fa); gg = lerp(gg, 5, fa); b = lerp(b, 4, fa); }
        px[idx] = r * 0.86; px[idx + 1] = gg * 0.86; px[idx + 2] = b * 0.86; px[idx + 3] = 255;
      }
    }
    lg.putImageData(img, 0, 0);
    g.imageSmoothingEnabled = true;
    g.drawImage(loCv, 0, 0, W, H);
    // ── 河流(蓝绿曲线,下游渐宽,雾外) ──
    for (const rv of RIVERS) {
      for (let i = 0; i < rv.length - 1; i++) {
        const SEG = 8;
        for (let st2 = 0; st2 < SEG; st2++) {
          const t0 = st2 / SEG, t1 = (st2 + 1) / SEG;
          const gT = (i + t0) / (rv.length - 1);
          const ax = lerp(rv[i][0], rv[i + 1][0], t0), ay = lerp(rv[i][1], rv[i + 1][1], t0);
          if (fogAt(s, ax, ay) > 0.8) continue;
          const pa = proj(ax, ay), pb = proj(lerp(rv[i][0], rv[i + 1][0], t1), lerp(rv[i][1], rv[i + 1][1], t1));
          const wRiver = Math.max(1.4, A * 0.0035 * Math.pow(cam.zoom, 0.62) * (0.55 + gT * 0.8));
          g.lineCap = "round";
          g.strokeStyle = "rgba(48,74,82,.92)"; g.lineWidth = wRiver;
          g.beginPath(); g.moveTo(pa.x, pa.y); g.lineTo(pb.x, pb.y); g.stroke();
          g.strokeStyle = "rgba(96,132,128,.55)"; g.lineWidth = wRiver * 0.45;
          g.beginPath(); g.moveTo(pa.x, pa.y); g.lineTo(pb.x, pb.y); g.stroke();
        }
      }
    }
    // 铁路网 + hq 县城支线（雾外部分）
    const railSeg = (x1: number, y1: number, x2: number, y2: number): void => {
      const STEPS = 14;
      for (let st2 = 0; st2 < STEPS; st2++) {
        const t0 = st2 / STEPS, t1 = (st2 + 1) / STEPS;
        const ax = lerp(x1, x2, t0), ay = lerp(y1, y2, t0), bx2 = lerp(x1, x2, t1), by2 = lerp(y1, y2, t1);
        if (fogAt(s, ax, ay) > 0.8) continue;
        const pa = proj(ax, ay), pb = proj(bx2, by2);
        g.strokeStyle = "rgba(20,18,14,.9)"; g.lineWidth = Math.max(1.6, A * 0.004 * Math.pow(cam.zoom, 0.6));
        g.beginPath(); g.moveTo(pa.x, pa.y); g.lineTo(pb.x, pb.y); g.stroke();
        g.strokeStyle = "rgba(216,201,160,.45)"; g.lineWidth = Math.max(0.8, A * 0.002 * Math.pow(cam.zoom, 0.6));
        g.setLineDash([6, 6]);
        g.beginPath(); g.moveTo(pa.x, pa.y); g.lineTo(pb.x, pb.y); g.stroke(); g.setLineDash([]);
      }
    };
    for (const [a, b] of RAILS) { const ca = cityOf(a), cb = cityOf(b); railSeg(ca.x, ca.y, cb.x, cb.y); }
    railSeg(HQ_COUNTY.x, HQ_COUNTY.y, 0.50, 0.40); // 县城→石家庄支线
    // 公路网(囚笼的链): 县城互连+通向乡镇的土路
    const road = (x1: number, y1: number, x2: number, y2: number): void => {
      const STEPS = 10;
      for (let st2 = 0; st2 < STEPS; st2++) {
        const t0 = st2 / STEPS, t1 = (st2 + 1) / STEPS;
        const ax = lerp(x1, x2, t0), ay = lerp(y1, y2, t0);
        if (fogAt(s, ax, ay) > 0.8) continue;
        const pa = proj(ax, ay), pb = proj(lerp(x1, x2, t1), lerp(y1, y2, t1));
        g.strokeStyle = "rgba(130,112,74,.4)"; g.lineWidth = Math.max(1, A * 0.0022 * Math.pow(cam.zoom, 0.6));
        g.beginPath(); g.moveTo(pa.x, pa.y); g.lineTo(pb.x, pb.y); g.stroke();
      }
    };
    road(COUNTIES[0].x, COUNTIES[0].y, COUNTIES[1].x, COUNTIES[1].y);
    road(COUNTIES[0].x, COUNTIES[0].y, COUNTIES[2].x, COUNTIES[2].y);
    road(COUNTIES[1].x, COUNTIES[1].y, COUNTIES[2].x, COUNTIES[2].y);
    for (const tn of TOWNS.slice(0, 6)) road(HQ.x, HQ.y, tn.x, tn.y);
    // ── 近景程序化符号(zoom>30): 视野内网格 hash 撒点,虚拟无限细节 ──
    if (cam.zoom > 14) {
      const gstep = Math.pow(2, Math.round(Math.log2((1 / cam.zoom) / 13)));
      const vw = 1 / cam.zoom;
      const x0 = Math.floor((cam.x - vw) / gstep) * gstep, x1 = cam.x + vw;
      const y0 = Math.floor((cam.y - vw) / gstep) * gstep, y1 = cam.y + vw;
      for (let wy = y0; wy < y1; wy += gstep) {
        for (let wx = x0; wx < x1; wx += gstep) {
          const hh = hash2(Math.round(wx / gstep), Math.round(wy / gstep));
          if (hh > 0.58) continue;
          const ox = wx + (hash2(wx * 999, wy * 777) - 0.2) * gstep, oy = wy + (hash2(wx * 555, wy * 333) - 0.2) * gstep;
          if (fogAt(s, ox, oy) > 0.6) continue;
          const p = proj(ox, oy);
          if (p.x < -20 || p.x > W + 20 || p.y < -20 || p.y > H + 20) continue;
          const h = terrainH(ox, oy), m = moistAt(ox, oy);
          const sz = clamp(A * 0.0007 * Math.pow(cam.zoom, 0.6), 2, 12);
          if (h > 0.55 || m > 0.6) { // 树
            g.strokeStyle = "rgba(52,42,26,.8)"; g.lineWidth = Math.max(0.8, sz * 0.16);
            g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x, p.y - sz * 0.7); g.stroke();
            g.fillStyle = hh > 0.2 ? "#41552b" : "#375024";
            g.beginPath(); g.arc(p.x, p.y - sz * 0.95, sz * 0.6, 0, 6.29); g.fill();
          } else if (h < 0.34 && hh < 0.24) { // 田埂
            g.strokeStyle = "rgba(150,132,80,.3)"; g.lineWidth = Math.max(0.7, sz * 0.12);
            g.beginPath(); g.moveTo(p.x - sz, p.y - sz * 0.4); g.lineTo(p.x + sz, p.y + sz * 0.4); g.stroke();
          }
        }
      }
    }
    // ── 宏观地理符号(山峰/森林/农田): 板块尺度, 近景淡出 ──
    const step = cam.zoom > 20 ? 9999 : cam.zoom < 2 ? 2 : 1; // 近景全跳(程序化符号接管)
    for (let k2 = 0; k2 < SYMS.length; k2 += step) {
      const sym = SYMS[k2];
      if (fogAt(s, sym.x, sym.y) > 0.6) continue;
      const p = proj(sym.x, sym.y);
      if (p.x < -24 || p.x > W + 24 || p.y < -24 || p.y > H + 24) continue;
      const sz = A * 0.0058 * Math.pow(cam.zoom, 0.72) * (0.8 + sym.sd * 0.5);
      if (sym.kind === 0) { // 山峰: 左亮右暗双面 + 底影
        g.fillStyle = "rgba(40,36,26,.25)";
        g.beginPath(); g.ellipse(p.x, p.y + sz * 0.9, sz * 1.9, sz * 0.5, 0, 0, 6.29); g.fill();
        g.fillStyle = "#8a7f60";
        g.beginPath(); g.moveTo(p.x - sz * 1.8, p.y + sz); g.lineTo(p.x - sz * 0.1, p.y - sz * 1.7); g.lineTo(p.x, p.y + sz * 0.2); g.closePath(); g.fill();
        g.fillStyle = "#4e4636";
        g.beginPath(); g.moveTo(p.x, p.y + sz * 0.2); g.lineTo(p.x - sz * 0.1, p.y - sz * 1.7); g.lineTo(p.x + sz * 1.7, p.y + sz); g.closePath(); g.fill();
      } else if (sym.kind === 1) { // 森林: 2-3 棵树簇
        const n = 2 + Math.floor(sym.sd * 2);
        for (let ti = 0; ti < n; ti++) {
          const ox = (hash2(k2, ti + 11) - 0.5) * sz * 2.4, oy = (hash2(k2, ti + 23) - 0.5) * sz * 1.4;
          g.strokeStyle = "rgba(52,42,26,.8)"; g.lineWidth = Math.max(0.8, sz * 0.18);
          g.beginPath(); g.moveTo(p.x + ox, p.y + oy); g.lineTo(p.x + ox, p.y + oy - sz * 0.7); g.stroke();
          g.fillStyle = ti % 2 ? "#41552b" : "#375024";
          g.beginPath(); g.arc(p.x + ox, p.y + oy - sz * 0.95, sz * 0.62, 0, 6.29); g.fill();
        }
      } else if (cam.zoom > 3.4) { // 农田: 平行田埂短线(近景)
        g.strokeStyle = "rgba(150,132,80,.34)"; g.lineWidth = Math.max(0.7, sz * 0.14);
        for (let li = 0; li < 3; li++) {
          const oy = (li - 1) * sz * 0.55;
          g.beginPath(); g.moveTo(p.x - sz, p.y + oy - sz * 0.5); g.lineTo(p.x + sz, p.y + oy + sz * 0.5 - sz); g.stroke();
        }
      }
    }
    // ── 领土地块层(文明6式): 世界网格整块填充+归属边界亮描边 ──
    drawTerritory(g, s);
    // 地图外框
    const c0 = proj(0, 0), c1 = proj(1, 0), c2 = proj(1, 1), c3 = proj(0, 1);
    g.strokeStyle = "rgba(216,201,160,.22)"; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(c0.x, c0.y); g.lineTo(c1.x, c1.y); g.lineTo(c2.x, c2.y); g.lineTo(c3.x, c3.y); g.closePath(); g.stroke();
  }


  // ── 文明6式领土层 ──
  // 世界固定网格,每格按影响场定归属(our/jp/中立);同属地块连成整片半透明填充,
  // 只在"归属交界"画亮描边(我方亮红/日军青灰)——像文明的国界线。地块随平滑半径生长/收缩。
  // 分级网格: 块大小随 zoom 自适应(snap 2 的幂, 世界对齐——缩放跨千倍仍有合适的地块)
  function drawTerritory(g: CanvasRenderingContext2D, s: KRState): void {
    const stepW = Math.pow(2, Math.round(Math.log2((1 / cam.zoom) / 20)));
    const vw = 1.4 / cam.zoom;
    const gx0 = Math.floor((cam.x - vw) / stepW), gx1 = Math.ceil((cam.x + vw) / stepW);
    const gy0 = Math.floor((cam.y - vw) / stepW), gy1 = Math.ceil((cam.y + vw) / stepW);
    const NX = gx1 - gx0 + 1, NY = gy1 - gy0 + 1;
    if (NX <= 0 || NY <= 0 || NX * NY > 4000) return;
    const own = new Int8Array(NX * NY);
    for (let j = 0; j < NY; j++) {
      for (let i = 0; i < NX; i++) {
        const wx = (gx0 + i + 0.5) * stepW, wy = (gy0 + j + 0.5) * stepW;
        if (wx < 0 || wx > 1 || wy < 0 || wy > 1) continue;
        if (fogAt(s, wx, wy) >= 0.5) continue;
        const pass = terrainPass(wx, wy);
        const ctl = (fieldAt({ x: wx, y: wy }, ourSrc) - fieldAt({ x: wx, y: wy }, jpSrc)) * pass;
        own[j * NX + i] = ctl > 0.14 ? 1 : ctl < -0.14 ? -1 : 0;
      }
    }
    const corner = (gi: number, gj: number) => proj(gi * stepW, gj * stepW);
    const lw = clamp(A * 0.0035 * Math.pow(cam.zoom, 0.3), 1.6, 4.2);
    for (let j = 0; j < NY; j++) {
      for (let i = 0; i < NX; i++) {
        const o = own[j * NX + i];
        if (o === 0) continue;
        const p0 = corner(gx0 + i, gy0 + j), p2 = corner(gx0 + i + 1, gy0 + j + 1);
        if (Math.max(p0.x, p2.x) < -40 || Math.min(p0.x, p2.x) > W + 40 || Math.max(p0.y, p2.y) < -40 || Math.min(p0.y, p2.y) > H + 40) continue;
        const p1 = corner(gx0 + i + 1, gy0 + j), p3 = corner(gx0 + i, gy0 + j + 1);
        const fa = cam.zoom > 100 ? 0.13 : 0.20;
        g.fillStyle = o > 0 ? `rgba(178,44,28,${fa})` : `rgba(56,72,92,${fa})`;
        g.beginPath(); g.moveTo(p0.x, p0.y); g.lineTo(p1.x, p1.y); g.lineTo(p2.x, p2.y); g.lineTo(p3.x, p3.y); g.closePath(); g.fill();
      }
    }
    g.lineCap = "round";
    const edge = (ax: number, ay: number, bx: number, by: number, o: number): void => {
      const pa = corner(ax, ay), pb = corner(bx, by);
      if ((pa.x < -40 && pb.x < -40) || (pa.x > W + 40 && pb.x > W + 40)) return;
      if ((pa.y < -40 && pb.y < -40) || (pa.y > H + 40 && pb.y > H + 40)) return;
      g.strokeStyle = o > 0 ? "rgba(226,86,77,.25)" : "rgba(130,160,190,.22)";
      g.lineWidth = lw * 2.6;
      g.beginPath(); g.moveTo(pa.x, pa.y); g.lineTo(pb.x, pb.y); g.stroke();
      g.strokeStyle = o > 0 ? "rgba(240,120,100,.85)" : "rgba(150,180,205,.75)";
      g.lineWidth = lw;
      g.beginPath(); g.moveTo(pa.x, pa.y); g.lineTo(pb.x, pb.y); g.stroke();
    };
    for (let j = 0; j < NY; j++) {
      for (let i = 0; i < NX; i++) {
        const o = own[j * NX + i];
        const rgt = i + 1 < NX ? own[j * NX + i + 1] : 0;
        const dwn = j + 1 < NY ? own[(j + 1) * NX + i] : 0;
        if (o !== rgt && (o !== 0 || rgt !== 0)) edge(gx0 + i + 1, gy0 + j, gx0 + i + 1, gy0 + j + 1, o !== 0 ? o : rgt);
        if (o !== dwn && (o !== 0 || dwn !== 0)) edge(gx0 + i, gy0 + j + 1, gx0 + i + 1, gy0 + j + 1, o !== 0 ? o : dwn);
      }
    }
  }

  let time = 0;
  let shownTier = -1;
  const walkers: Walker[] = [];
  const particles: Particle[] = [];
  const corpses: Corpse[] = [];
  const tracers: Tracer[] = [];
  let prevJp = 0, prevOur = 0, prevSweepOn = false;
  let migSpawnAcc = 0;
  let lastSweepTarget: { x: number; y: number } | null = null;

  // hq 的炮楼（世界坐标：第一座在村口，其余绕外环）
  function hqTowers(s: KRState): { x: number; y: number }[] {
    const n = Math.max(1, Math.min(5, s.bases["hq"].spots || 1));
    const out: { x: number; y: number }[] = [HQ_TOWER0];
    for (let i = 1; i < n; i++) {
      const ang = 0.9 + (i / 5) * Math.PI * 2;
      out.push({ x: HQ.x + Math.cos(ang) * 0.0075, y: HQ.y + Math.sin(ang) * 0.006 });
    }
    return out;
  }

  // ══ 基元（尺寸系数 k 随 zoom）══
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
    g.strokeStyle = "rgba(40,42,46,.8)"; g.lineWidth = Math.max(0.8, k * 0.5);
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
  function drawCounty(g: CanvasRenderingContext2D, sx: number, sy: number, k: number, t: number): void {
    isoBox(g, sx, sy, k * 14, k * 14, k * 4, "#7a7466", "#565046", "#6a6456");
    isoBox(g, sx, sy - k * 3, k * 9, k * 9, k * 6, "#6e7278", "#4a4e54", "#5c6066");
    isoBox(g, sx - k * 12, sy + k * 1, k * 2, k * 2, k * 8, "#84888f", "#5c6068", "#70747c");
    isoBox(g, sx + k * 11, sy + k * 3, k * 2, k * 2, k * 8, "#84888f", "#5c6068", "#70747c");
    drawFlag(g, sx, sy - k * 12, k * 1.1, t, true);
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
    // 数量标签不在这里画——收集起来最后顶层统一绘制，避免被建筑/其它兵团遮挡。
    if (!label) return;
    formationLabels.push({ sx, by: sy - rows * k * 5 - k * 16, count, jp, k });
  }
  // 顶层绘制所有兵团数量标签（不参与深度排序 → 永不被遮挡）
  const formationLabels: { sx: number; by: number; count: number; jp: boolean; k: number }[] = [];
  function drawFormationLabels(g: CanvasRenderingContext2D): void {
    for (const L of formationLabels) {
      const lab = `${L.jp ? `日军${unitName(L.count)}` : "我军"} ×${Math.max(1, Math.round(L.count))}`;
      g.font = `700 ${clamp(L.k * 6, 11, 15)}px 'Noto Serif SC', serif`;
      const tw = g.measureText(lab).width;
      const bh = clamp(L.k * 9, 15, 20);
      g.fillStyle = L.jp ? "rgba(46,48,30,.95)" : "rgba(90,26,18,.95)";
      g.strokeStyle = L.jp ? "#8a8a50" : "#e2564d"; g.lineWidth = 1;
      g.beginPath(); g.roundRect(L.sx - tw / 2 - L.k * 3, L.by, tw + L.k * 6, bh, 3); g.fill(); g.stroke();
      g.fillStyle = L.jp ? "#d8d2a8" : "#f2d8c0";
      g.textBaseline = "middle"; g.textAlign = "center";
      g.fillText(lab, L.sx, L.by + bh / 2 + 1);
      g.textBaseline = "alphabetic"; g.textAlign = "left";
    }
  }
  const inView = (p: { x: number; y: number }, pad = 80): boolean => p.x > -pad && p.x < W + pad && p.y > -pad && p.y < H + pad;

  // ══ 主帧 ══
  const baseScreen = new Map<string, { x: number; y: number }>();

  function frame(dt: number, s: KRState): void {
    time += dt;
    const t = time;
    const T = tier(s);
    // 阶梯升级：自动平滑拉远(玩家仍可随时缩放)
    if (T !== shownTier) {
      const hb2 = BASES.find((b) => b.id === s.hqBase) ?? BASES[0];
      if (shownTier >= 0) { cam.tzoom = TIER_ZOOM[T]; cam.tx = T >= 7 ? 0.5 : hb2.x; cam.ty = T >= 7 ? 0.5 : hb2.y; userCamMs = 0; }
      shownTier = T;
    }
    // 相机 lerp
    if (userCamMs > 0) userCamMs -= dt * 1000;
    const camK = 1 - Math.pow(0.04, dt);
    if (Math.abs(cam.zoom - cam.tzoom) > 0.001 || Math.abs(cam.x - cam.tx) > 0.0002 || Math.abs(cam.y - cam.ty) > 0.0002) {
      cam.zoom = lerp(cam.zoom, cam.tzoom, camK);
      cam.x = lerp(cam.x, cam.tx, camK);
      cam.y = lerp(cam.y, cam.ty, camK);
      dirty = true;
    }
    // 地面层重采样（脏/定时——控制场生长动画靠定时）
    groundTimer -= dt;
    rebuildSources(s, dt);
    if (dirty || groundTimer <= 0) { renderGround(s); dirty = false; groundTimer = 0.18; }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(ground, 0, 0, W, H);

    const k = clamp(A * 0.0011 * Math.pow(cam.zoom, 0.60), 1.1, 42);
    const kS = clamp(k, 1.2, 4.2); // 远景元素(城市/根据地村)用的小系数
    const sw = s.sweep;
    formationLabels.length = 0; // 本帧兵团标签收集器清空
    const queue: { y: number; draw: () => void }[] = [];
    const push = (y: number, draw: () => void): void => { queue.push({ y, draw }); };
    const fogOk = (wx: number, wy: number): boolean => fogAt(s, wx, wy) < 0.55;

    // ① 城市（雾外+视内）
    for (const c of CITIES) {
      if (!fogOk(c.x, c.y)) continue;
      const p = proj(c.x, c.y);
      if (!inView(p)) continue;
      push(p.y, () => drawCity(ctx, p.x, p.y, kS * 1.1, t));
    }
    // ①b PCG 敌占网: 日占县城(全图22座)/囚笼炮楼(铁路沿线)/散布村庄
    for (const c of PCG_COUNTIES) {
      if (!fogOk(c.x, c.y)) continue;
      const p = proj(c.x, c.y);
      if (!inView(p, 100)) continue;
      push(p.y, () => drawCounty(ctx, p.x, p.y, clamp(kS * 0.62, 1, 3.4), t));
    }
    if (cam.zoom > 2.6) {
      for (const pb of PCG_PILLBOX) {
        if (!fogOk(pb.x, pb.y)) continue;
        const p = proj(pb.x, pb.y);
        if (!inView(p, 60)) continue;
        push(p.y, () => drawBlockhouse(ctx, p.x, p.y, clamp(kS * 0.42, 0.9, 2.6), t));
      }
    }
    if (cam.zoom > 2.4) {
      for (const v of PCG_VILLAGES) {
        if (!fogOk(v.x, v.y)) continue;
        const p = proj(v.x, v.y);
        if (!inView(p, 40)) continue;
        push(p.y, () => { drawHouse(ctx, p.x - kS * 1.4, p.y, clamp(kS * 0.34, 0.7, 2)); drawHouse(ctx, p.x + kS * 1.2, p.y + kS * 0.5, clamp(kS * 0.3, 0.6, 1.8)); });
      }
    }
    // ①c 日军巡逻队(沿铁路往返)
    if (cam.zoom > 2 && cam.zoom < 200) {
      for (const pt of PATROLS) {
        pt.t += pt.dir * dt * 0.008;
        if (pt.t > 0.88 || pt.t < 0.12) pt.dir *= -1;
        const [a, b] = RAILS[pt.ri];
        const ca = cityOf(a), cb = cityOf(b);
        const wx = lerp(ca.x, cb.x, pt.t), wy = lerp(ca.y, cb.y, pt.t);
        if (!fogOk(wx, wy)) continue;
        const p = proj(wx, wy);
        if (!inView(p, 40)) continue;
        const pk = clamp(A * 0.0005 * Math.pow(cam.zoom, 0.55), 1, 4);
        push(p.y, () => drawFormation(ctx, p.x, p.y, 8, true, pk, t, true, pt.dir, false));
      }
    }
    // ② hq 村群（中心村+卫星村+炮楼+县城）——世界坐标，随缩放连续
    const hq = s.bases["hq"];
    baseScreen.clear();
    {
      const p = proj(HQ.x, HQ.y);
      baseScreen.set("hq", p);
      if (inView(p, 200)) {
        const houses = 3 + hq.dev;
        for (let i = 0; i < houses; i++) {
          const ang = (i / houses) * Math.PI * 2 + 0.7;
          const wr = 0.0005 + (i % 3) * 0.00028;
          const hw = { x: HQ.x + Math.cos(ang) * wr, y: HQ.y + Math.sin(ang) * wr };
          const hp = proj(hw.x, hw.y);
          const burning = sw?.stage === "pillage" && sw.targetBase === "hq" && i % 2 === 0;
          push(hp.y, () => drawHouse(ctx, hp.x, hp.y, k * 0.32));
          if (burning) spawnFlameW(hw.x, hw.y);
        }
        push(p.y + 1, () => drawFlag(ctx, p.x, p.y, clamp(k * 0.32, 2, 11), t));
        if (hq.tunnels > 0) push(p.y + 2, () => {
          ctx.fillStyle = "#14110b";
          for (let i = 0; i < hq.tunnels; i++) {
            const tp = proj(HQ.x + 0.0012 + i * 0.0005, HQ.y + 0.0009);
            ctx.save(); ctx.translate(tp.x, tp.y); ctx.scale(1, 0.6); ctx.beginPath(); ctx.arc(0, 0, k * 0.8, Math.PI, 0); ctx.fill(); ctx.restore();
          }
        });
      }
      // 卫星村（雾外）
      const satN = clamp(1 + hq.dev + T, 0, HQ_SATS.length);
      for (let i = 0; i < satN; i++) {
        const sv = HQ_SATS[i];
        if (!fogOk(sv.x, sv.y)) continue;
        const p2 = proj(sv.x, sv.y);
        if (!inView(p2)) continue;
        push(p2.y, () => { drawHouse(ctx, p2.x - k * 2.2, p2.y, k * 0.22); drawHouse(ctx, p2.x + k * 2.2, p2.y + k * 0.8, k * 0.20); drawFlag(ctx, p2.x, p2.y - k * 0.5, k * 0.24, t); });
      }
      // 炮楼
      for (const tw of hqTowers(s)) {
        if (!fogOk(tw.x, tw.y)) continue;
        const p2 = proj(tw.x, tw.y);
        if (!inView(p2)) continue;
        push(p2.y, () => drawBlockhouse(ctx, p2.x, p2.y, k * 0.26, t));
      }
      // 县城群
      for (const c of COUNTIES) {
        if (!fogOk(c.x, c.y)) continue;
        const p2 = proj(c.x, c.y);
        if (inView(p2, 160)) push(p2.y, () => drawCounty(ctx, p2.x, p2.y, k * 0.28, t));
      }
      // 乡镇聚落(中立小村)
      if (cam.zoom > 8) {
        for (const tn of TOWNS) {
          if (!fogOk(tn.x, tn.y)) continue;
          const p2 = proj(tn.x, tn.y);
          if (!inView(p2)) continue;
          push(p2.y, () => { drawHouse(ctx, p2.x - k * 1.6, p2.y, k * 0.16); drawHouse(ctx, p2.x + k * 1.4, p2.y + k * 0.6, k * 0.15); });
        }
      }
    }
    // ③ 其余根据地（T3+ 雾开后可见）
    for (const b of BASES) {
      if (b.id === "hq") continue;
      const st = s.bases[b.id];
      const p = proj(b.x, b.y);
      baseScreen.set(b.id, p);
      if (!fogOk(b.x, b.y) || !inView(p, 150)) continue;
      if (st.est) {
        const houses = 2 + st.dev;
        for (let i = 0; i < houses; i++) {
          const ang = (i / houses) * Math.PI * 2 + 0.7 + b.x * 9;
          const wr = 0.010 + (i % 3) * 0.004;
          const hw = { x: b.x + Math.cos(ang) * wr, y: b.y + Math.sin(ang) * wr };
          const hp = proj(hw.x, hw.y);
          const burning = sw?.stage === "pillage" && sw.targetBase === b.id && i % 2 === 0;
          push(hp.y, () => drawHouse(ctx, hp.x, hp.y, kS * 0.8));
          if (burning) spawnFlameW(hw.x, hw.y);
        }
        push(p.y + 1, () => drawFlag(ctx, p.x, p.y, kS, t));
        if (st.tunnels > 0) push(p.y + 2, () => {
          ctx.fillStyle = "#14110b";
          for (let i = 0; i < st.tunnels; i++) {
            const tp = proj(b.x + 0.014 + i * 0.007, b.y + 0.007);
            ctx.save(); ctx.translate(tp.x, tp.y); ctx.scale(1, 0.6); ctx.beginPath(); ctx.arc(0, 0, kS * 2.2, Math.PI, 0); ctx.fill(); ctx.restore();
          }
        });
      } else {
        push(p.y, () => { drawHouse(ctx, p.x - kS * 6, p.y, kS * 0.6, true); drawHouse(ctx, p.x + kS * 6, p.y + kS * 2, kS * 0.6, true); });
      }
      if (st.spots > 0) {
        for (let i = 0; i < st.spots; i++) {
          const ang = (i / 5) * Math.PI * 2 + 1.1;
          const wp = { x: b.x + Math.cos(ang) * 0.035, y: b.y + Math.sin(ang) * 0.026 };
          const sp = proj(wp.x, wp.y);
          push(sp.y, () => drawBlockhouse(ctx, sp.x, sp.y, kS * 0.75, t));
        }
      }
    }

    // ④ 小人
    syncWalkers(s);
    for (const wlk of walkers) {
      if (!fogOk(wlk.x, wlk.y)) continue;
      const p = proj(wlk.x, wlk.y);
      if (!inView(p, 30)) continue;
      const kind = wlk.kind;
      push(p.y, () => drawFigure(ctx, p.x, p.y, clamp(k * 0.12, 0.8, 4.2) * (kind === "soldier" ? 1.1 : 1), {
        civ: kind !== "soldier", walk: t * 8 + wlk.ph, face: wlk.tx >= wlk.x ? 1 : -1, carry: kind === "evac" || kind === "migrate"
      }));
    }
    stepWalkers(dt);
    spawnMigrationWalkers(dt, s);

    // ⑤ 扫荡兵团（世界坐标）
    if (sw) drawSweep(sw, s, t, push, dt);
    trackCasualties(sw, s);

    for (let i = corpses.length - 1; i >= 0; i--) {
      const c = corpses[i]; c.life -= dt;
      if (c.life <= 0) { corpses.splice(i, 1); continue; }
      const p = proj(c.x, c.y);
      if (!inView(p, 30)) continue;
      const a = clamp(c.life / 6, 0, 1) * 0.9;
      const ck = clamp(k * 0.09, 0.8, 3);
      push(p.y - 1, () => {
        ctx.globalAlpha = a;
        ctx.strokeStyle = c.jp ? "#5c5c32" : "#6f6540"; ctx.lineWidth = ck * 2;
        ctx.beginPath(); ctx.moveTo(p.x - ck * 4, p.y); ctx.lineTo(p.x + ck * 4, p.y - ck * 1.4); ctx.stroke();
        ctx.fillStyle = "#b08a60"; ctx.beginPath(); ctx.arc(p.x + ck * 5, p.y - ck * 1.6, ck * 1.3, 0, 6.29); ctx.fill();
        ctx.globalAlpha = 1;
      });
    }

    queue.sort((a, b) => a.y - b.y);
    for (const q of queue) q.draw();

    // ⑥ 曳光弹/粒子（世界坐标→投影）
    for (let i = tracers.length - 1; i >= 0; i--) {
      const tr = tracers[i]; tr.life -= dt * 6;
      if (tr.life <= 0) { tracers.splice(i, 1); continue; }
      const p1 = proj(tr.x1, tr.y1), p2 = proj(tr.x2, tr.y2);
      ctx.globalAlpha = clamp(tr.life, 0, 1);
      ctx.strokeStyle = tr.jp ? "#ffb060" : "#fff0a0"; ctx.lineWidth = 1.3;
      const tt = 1 - tr.life;
      ctx.beginPath();
      ctx.moveTo(lerp(p1.x, p2.x, tt * 0.85), lerp(p1.y, p2.y, tt * 0.85));
      ctx.lineTo(lerp(p1.x, p2.x, clamp(tt * 0.85 + 0.14, 0, 1)), lerp(p1.y, p2.y, clamp(tt * 0.85 + 0.14, 0, 1)));
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    for (let i = particles.length - 1; i >= 0; i--) {
      const pp = particles[i]; pp.life += dt;
      if (pp.life >= pp.max) { particles.splice(i, 1); continue; }
      const lt = pp.life / pp.max;
      pp.x += pp.vx * dt; pp.y += pp.vy * dt;
      const p = proj(pp.x, pp.y);
      const pr = clamp(pp.r * Math.pow(cam.zoom, 0.5) * A * 0.0012, 1, 26);
      if (pp.kind === "smoke") {
        ctx.globalAlpha = (1 - lt) * 0.35; ctx.fillStyle = "#3c3830";
        ctx.beginPath(); ctx.arc(p.x, p.y, pr * (0.6 + lt * 1.8), 0, 6.29); ctx.fill();
      } else if (pp.kind === "flame") {
        ctx.globalAlpha = (1 - lt) * 0.9; ctx.fillStyle = lt < 0.4 ? "#ffd060" : "#ff6620";
        ctx.beginPath(); ctx.arc(p.x, p.y, pr * (1 - lt * 0.6), 0, 6.29); ctx.fill();
      } else if (pp.kind === "flash") {
        ctx.globalAlpha = (1 - lt); ctx.fillStyle = "#fff4c0";
        ctx.beginPath(); ctx.arc(p.x, p.y, pr * (1 - lt), 0, 6.29); ctx.fill();
      } else {
        ctx.globalAlpha = (1 - lt) * 0.3; ctx.fillStyle = "#8a7a58";
        ctx.beginPath(); ctx.arc(p.x, p.y, pr * (0.5 + lt), 0, 6.29); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // ⑦ 名牌 + 兵团数量标签（顶层，永不被遮挡）
    drawLabels(s, t);
    drawFormationLabels(ctx);

    // ⑧ 扫荡警报泛红
    if (sw) {
      const pulse = sw.stage === "pillage" ? 0.5 : 0.3;
      const a = (Math.sin(t * (sw.stage === "incoming" ? 4 : 7)) * 0.5 + 0.5) * pulse;
      const gr = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.32, W / 2, H / 2, Math.max(W, H) * 0.72);
      gr.addColorStop(0, "rgba(180,40,26,0)"); gr.addColorStop(1, `rgba(180,40,26,${a * 0.4})`);
      ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
    }
  }

  function drawLabels(s: KRState, t: number): void {
    ctx.textBaseline = "alphabetic";
    const fs = clamp(A * 0.028 / Math.pow(cam.zoom, 0.15), 11, 15);
    // hq 名牌
    {
      const p = baseScreen.get("hq")!;
      if (inView(p, 100)) {
        ctx.font = `700 ${fs}px 'Noto Serif SC', serif`;
        const hq = s.bases["hq"];
        const T = tier(s);
        const lab = `${s.hqBase === "hq" ? "★ " : ""}${T < 2 ? "根据地·村" : T < 3 ? "太行根据地" : `太行·总部${hq.dev > 0 ? ` 发展${hq.dev}` : ""}${hq.spots > 0 ? ` 🏯${hq.spots}` : ""}`}`;
        const twd = ctx.measureText(lab).width;
        ctx.fillStyle = "rgba(90,26,18,.8)";
        ctx.beginPath(); ctx.roundRect(p.x - twd / 2 - 5, p.y + 14, twd + 10, fs + 8, 3); ctx.fill();
        ctx.fillStyle = "#f2d8c0"; ctx.fillText(lab, p.x - twd / 2, p.y + 14 + fs + 1);
      }
    }
    // 其余根据地（雾外）
    for (const b of BASES) {
      if (b.id === "hq") continue;
      if (fogAt(s, b.x, b.y) > 0.55) continue;
      const p = baseScreen.get(b.id)!;
      if (!inView(p, 60)) continue;
      const st = s.bases[b.id];
      const canEst = !st.est && era(s).canExpand && tier(s) >= 7;
      ctx.font = `${st.est ? 700 : 400} ${fs}px 'Noto Serif SC', serif`;
      const lab = st.est ? `${s.hqBase === b.id ? "🏛" : ""}${b.short}${st.dev > 0 ? `·发展${st.dev}` : ""}${st.spots > 0 ? ` 🏯${st.spots}` : ""}` : `${b.short}(未开辟)`;
      const twd = ctx.measureText(lab).width;
      ctx.fillStyle = "rgba(10,9,6,.66)";
      ctx.beginPath(); ctx.roundRect(p.x - twd / 2 - 4, p.y + 12, twd + 8, fs + 7, 3); ctx.fill();
      if (canEst) { ctx.strokeStyle = "rgba(216,164,65,.85)"; ctx.lineWidth = 1; ctx.stroke(); }
      ctx.fillStyle = st.est ? "#f2b6a0" : canEst ? "#e8d29a" : "rgba(216,201,160,.55)";
      ctx.fillText(lab, p.x - twd / 2, p.y + 12 + fs);
      if (canEst) {
        const pr = 14 + Math.sin(t * 3) * 3;
        ctx.strokeStyle = `rgba(216,164,65,${0.5 + Math.sin(t * 3) * 0.25})`; ctx.lineWidth = 1.5;
        ctx.save(); ctx.translate(p.x, p.y); ctx.scale(1, 0.5);
        ctx.beginPath(); ctx.arc(0, 0, pr, 0, 6.29); ctx.stroke(); ctx.restore();
      }
    }
    // 城市名（拉远才显示，避免近景乱）
    if (cam.zoom < 7) {
      for (const c of CITIES) {
        if (fogAt(s, c.x, c.y) > 0.55) continue;
        const p = proj(c.x, c.y);
        if (!inView(p, 40)) continue;
        ctx.font = `400 ${clamp(fs - 2, 9, 12)}px 'Noto Serif SC', serif`;
        ctx.fillStyle = "rgba(150,158,168,.7)";
        ctx.fillText(c.name, p.x - 12, p.y + 20);
      }
    }
    // 县城/炮楼 小字（近景才显示）
    if (cam.zoom > 3.2) {
      for (const c of COUNTIES) {
        if (fogAt(s, c.x, c.y) > 0.55) continue;
        const p = proj(c.x, c.y);
        if (inView(p, 40)) { ctx.font = `400 11px 'Noto Serif SC', serif`; ctx.fillStyle = "rgba(150,158,168,.8)"; ctx.fillText(c.name + "(日占)", p.x - 30, p.y + 26); }
      }
      for (const tw of hqTowers(s)) {
        if (fogAt(s, tw.x, tw.y) > 0.55) continue;
        const p = proj(tw.x, tw.y);
        if (!inView(p, 30)) continue;
        ctx.font = `400 10px 'Noto Serif SC', serif`; ctx.fillStyle = "rgba(150,158,168,.6)";
        ctx.fillText("炮楼", p.x - 10, p.y + 16);
      }
    }
  }

  // ── 扫荡表现（世界坐标；意图差异化）──
  function sweepGeom(sw: Sweep, s: KRState): { target: { x: number; y: number }; spawns: { x: number; y: number }[] } {
    const tb = BASES.find((b) => b.id === sw.targetBase)!;
    const target = { x: tb.x, y: tb.y };
    const spawns: { x: number; y: number }[] = [];
    if (sw.targetBase === "hq" && tier(s) < 7) {
      const tws = hqTowers(s);
      for (let i = 0; i < sw.cols; i++) spawns.push(tier(s) >= 5 && i < COUNTIES.length ? COUNTIES[i] : tws[i % tws.length]);
    } else {
      const sorted = [...CITIES].sort((a, b) => ((a.x - target.x) ** 2 + (a.y - target.y) ** 2) - ((b.x - target.x) ** 2 + (b.y - target.y) ** 2));
      for (let i = 0; i < sw.cols; i++) spawns.push(sorted[i % sorted.length]);
    }
    lastSweepTarget = target;
    return { target, spawns };
  }
  function drawSweep(sw: Sweep, s: KRState, t: number, push: (y: number, d: () => void) => void, dt: number): void {
    const { target, spawns } = sweepGeom(sw, s);
    const LOCAL = sw.targetBase === "hq" && tier(s) < 7;
    const SC = LOCAL ? 0.1 : 1; // 局部战斗全部 offset 缩到村尺度
    const per = sw.strength / Math.max(1, sw.cols);
    const tp = proj(target.x, target.y);
    const fk = clamp(A * 0.0006 * Math.pow(cam.zoom, 0.55), 1.0, 8); // 兵团小人尺寸
    if (sw.stage === "incoming") {
      const prog = 1 - sw.etaSec / sw.etaSec0;
      if (sw.kind === "encircle") {
        const wR = 0.10 * SC * 10 * (1 - prog * 0.7) * (LOCAL ? 0.14 : 1);
        const sR = wR * cam.zoom * A;
        ctx.save(); ctx.translate(tp.x, tp.y); ctx.scale(1, 0.5);
        ctx.strokeStyle = `rgba(226,86,77,${0.35 + prog * 0.3})`; ctx.lineWidth = 1.6; ctx.setLineDash([7, 7]);
        ctx.beginPath(); ctx.arc(0, 0, sR, 0, 6.29); ctx.stroke();
        ctx.setLineDash([]); ctx.restore();
      }
      for (let i = 0; i < spawns.length; i++) {
        const sp = spawns[i];
        const dx = target.x - sp.x, dy = target.y - sp.y, dl = Math.hypot(dx, dy) || 1;
        const stop = (0.018 + i * 0.004) * SC;
        const mx = lerp(sp.x, target.x - (dx / dl) * stop, prog), my = lerp(sp.y, target.y - (dy / dl) * stop, prog);
        const p = proj(mx, my);
        const face = tp.x >= p.x ? 1 : -1;
        if (inView(p, 150)) push(p.y, () => drawFormation(ctx, p.x, p.y, per, true, fk, t, true, face, i === 0, sw.kind === "comb"));
        if (Math.random() < (sw.kind === "raid" ? 0.7 : 0.3)) { const pv2 = 30 / (cam.zoom * A); particles.push({ x: mx, y: my, vx: -pv2 * face, vy: -pv2 * 0.7, life: 0, max: 1.2, kind: "puff", r: 2 }); }
        if (sw.kind === "raid") { ctx.strokeStyle = "rgba(255,90,60,.8)"; ctx.lineWidth = 2; }
        else { ctx.setLineDash([5, 6]); ctx.strokeStyle = "rgba(226,86,77,.45)"; ctx.lineWidth = 1.3; }
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(tp.x, tp.y); ctx.stroke(); ctx.setLineDash([]);
      }
      if (sw.committed > 0) {
        const dp = proj(target.x, target.y - 0.012 * SC);
        push(dp.y, () => drawFormation(ctx, dp.x, dp.y, sw.committed, false, fk, t, false, 1));
      }
    } else if (sw.stage === "battle") {
      const our = proj(target.x, target.y + 0.006 * SC);
      push(our.y, () => drawFormation(ctx, our.x, our.y, sw.committed, false, fk, t, false, 1));
      for (let i = 0; i < spawns.length; i++) {
        const sp = spawns[i];
        const dx = target.x - sp.x, dy = target.y - sp.y, dl = Math.hypot(dx, dy) || 1;
        const jw = { x: target.x - (dx / dl) * 0.016 * SC, y: target.y - (dy / dl) * 0.016 * SC };
        const jp = proj(jw.x, jw.y);
        const face = tp.x >= jp.x ? 1 : -1;
        push(jp.y, () => drawFormation(ctx, jp.x, jp.y, per, true, fk, t, false, face, i === 0, sw.kind === "comb"));
        const rate = clamp((sw.strength + sw.committed) * 0.02, 0.3, 2.2) / sw.cols;
        if (Math.random() < rate * dt * 30) {
          const fromJp = Math.random() < 0.5;
          const aW = fromJp ? jw : { x: target.x, y: target.y + 0.006 * SC };
          const bW = fromJp ? { x: target.x, y: target.y + 0.006 * SC } : jw;
          const ox = (Math.random() - 0.5) * 0.004 * SC, oy = (Math.random() - 0.5) * 0.003 * SC;
          tracers.push({ x1: aW.x + ox, y1: aW.y + oy, x2: bW.x - ox, y2: bW.y - oy, life: 1, jp: fromJp });
          particles.push({ x: aW.x + ox, y: aW.y + oy, vx: 0, vy: 0, life: 0, max: 0.16, kind: "flash", r: 2.4 });
        }
      }
      if (Math.random() < dt * 8) particles.push({ x: target.x + (Math.random() - 0.5) * 0.012 * SC, y: target.y, vx: 0.002 * SC, vy: -0.004 * SC, life: 0, max: 2.2, kind: "smoke", r: 3 });
    } else {
      push(tp.y + 2, () => drawFormation(ctx, tp.x, tp.y, sw.strength, true, fk, t, true, 1));
      spawnFlameW(target.x + (Math.random() - 0.5) * 0.008 * SC, target.y + (Math.random() - 0.5) * 0.006 * SC);
    }
    // 群众进山
    if (sw.evacStarted && sw.evacProgress < 1) {
      if (Math.random() < dt * 6 && walkers.filter((w) => w.kind === "evac").length < 26) {
        const evScale = sw.targetBase === "hq" && tier(s) < 7 ? 1 : 10;
        walkers.push({
          x: target.x + (Math.random() - 0.5) * 0.001 * evScale, y: target.y + (Math.random() - 0.5) * 0.001 * evScale,
          tx: target.x - 0.006 * evScale + (Math.random() - 0.5) * 0.002 * evScale, ty: target.y + 0.005 * evScale + (Math.random() - 0.5) * 0.002 * evScale,
          spd: (0.0012 + Math.random() * 0.0006) * evScale, kind: "evac", ph: Math.random() * 7
        });
      }
    }
  }
  function spawnFlameW(wx: number, wy: number): void {
    const pv = 46 / (cam.zoom * A); // 屏幕~46px/s 的世界速度
    if (Math.random() < 0.5) particles.push({ x: wx + (Math.random() - 0.5) * pv, y: wy, vx: (Math.random() - 0.5) * pv * 0.4, vy: -pv - Math.random() * pv * 0.6, life: 0, max: 0.7, kind: "flame", r: 2.2 });
    if (Math.random() < 0.3) particles.push({ x: wx, y: wy, vx: pv * 0.3, vy: -pv * 0.8, life: 0, max: 2.6, kind: "smoke", r: 3 });
  }
  function trackCasualties(sw: Sweep | null, s: KRState): void {
    if (!sw || sw.stage !== "battle") { prevJp = sw ? sw.strength : 0; prevOur = sw ? sw.committed : 0; prevSweepOn = !!sw; return; }
    if (!prevSweepOn) { prevJp = sw.strength; prevOur = sw.committed; prevSweepOn = true; return; }
    const tb = BASES.find((b) => b.id === sw.targetBase)!;
    const jpDrop = Math.floor(prevJp) - Math.floor(sw.strength);
    const ourDrop = Math.floor(prevOur) - Math.floor(sw.committed);
    const cSC = sw.targetBase === "hq" && tier(s) < 7 ? 0.1 : 1;
    for (let i = 0; i < Math.min(3, jpDrop); i++) corpses.push({ x: tb.x + (Math.random() - 0.5) * 0.02 * cSC, y: tb.y - 0.012 * cSC + (Math.random() - 0.5) * 0.008 * cSC, life: 6, jp: true });
    for (let i = 0; i < Math.min(3, ourDrop); i++) corpses.push({ x: tb.x + (Math.random() - 0.5) * 0.016 * cSC, y: tb.y + 0.006 * cSC + (Math.random() - 0.5) * 0.006 * cSC, life: 6, jp: false });
    prevJp = sw.strength; prevOur = sw.committed;
    void s;
  }
  // 迁移队伍
  function spawnMigrationWalkers(dt: number, s: KRState): void {
    const m = s.migration;
    if (!m) { migSpawnAcc = 0; return; }
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
    const r = kind === "soldier" ? 0.0016 : 0.0011;
    return {
      x: HQ.x + (Math.random() - 0.5) * r * 2, y: HQ.y + (Math.random() - 0.5) * r * 1.6,
      tx: HQ.x + (Math.random() - 0.5) * r * 2, ty: HQ.y + (Math.random() - 0.5) * r * 1.6,
      spd: 0.0004 + Math.random() * 0.0002, kind, ph: Math.random() * 7
    };
  }
  function stepWalkers(dt: number): void {
    for (let i = walkers.length - 1; i >= 0; i--) {
      const w = walkers[i];
      const dx = w.tx - w.x, dy = w.ty - w.y, d = Math.hypot(dx, dy);
      if (d < 0.0004) {
        if (w.kind === "evac" || w.kind === "migrate") { walkers.splice(i, 1); continue; }
        const r = w.kind === "soldier" ? 0.016 : 0.011;
        w.tx = HQ.x + (Math.random() - 0.5) * r * 2; w.ty = HQ.y + (Math.random() - 0.5) * r * 1.6;
      } else {
        const sp = w.kind === "evac" || w.kind === "migrate" ? w.spd : w.spd * 0.55;
        w.x += (dx / d) * sp * dt;
        w.y += (dy / d) * sp * dt;
      }
    }
  }

  function resize(): void {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = canvas.clientWidth || 1; H = canvas.clientHeight || 1;
    canvas.width = Math.max(1, W * dpr); canvas.height = Math.max(1, H * dpr);
    cx0 = W * 0.5; cy0 = H * 0.52;
    A = Math.min(W * 0.52, H * 0.92); B = A * 0.5;
    dirty = true;
  }
  resize();

  function hitBase(cxp: number, cyp: number): string | null {
    if (dragMoved) return null; // 拖拽不算点击
    let best: string | null = null, bd = 42 * 42; // 屏幕像素判定
    for (const b of BASES) {
      const p = proj(b.x, b.y);
      const d = (p.x - cxp) ** 2 + (p.y - cyp) ** 2;
      if (d < bd) { bd = d; best = b.id; }
    }
    return best;
  }
  function focusSweep(): void {
    if (!lastSweepTarget) return;
    cam.tx = lastSweepTarget.x; cam.ty = lastSweepTarget.y;
    cam.tzoom = Math.max(cam.zoom, 6);
  }

  return { ok: true, resize, frame, hitBase, focusSweep, getZoom: () => cam.zoom, dispose() { walkers.length = 0; particles.length = 0; } };
}
