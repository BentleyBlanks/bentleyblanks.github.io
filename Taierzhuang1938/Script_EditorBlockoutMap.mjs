// ===========================================================================
// Script_EditorBlockoutMap.mjs —— 白盒关卡编辑器的纸面俯视图（docs/Data_EditorBlockout.md §4.1）
//
// canvas 2D，零 three。一个实例同时画两张图：
//   小地图（PaintMini）  北朝上、以玩家为中心并夹在关卡边界内；每次 = 一次 drawImage + 动态标记。
//   全关总图（PaintFull） 自带视图 {cx, cz, pxPerM}：滚轮以光标为中心缩放、拖动平移、双击回到全图、
//                        点关键帧点 → 在画布上派发 MAP_PICK_EVENT（detail.index），界面层接去跳转。
//
// 静态层（纸色底 + 山体阴影 + 1 m / 5 m 等高线 + 开挖水洗 + 块脚印 + 路）每关只烘一次：
// Bake() 在空闲帧里分块做（requestIdleCallback，带超时兜底），按 levelKey 缓存，切回来不重烘。
// 全关总图放大到 ≥ VECTOR_PX_PER_M 时块改用矢量重画（地面仍用烘好的图），不糊。
//
// 坐标：世界 X 向东、Z 向南、米；画面 x 向右 = 东、y 向下 = 南（北朝上）。
// 朝向 yawDeg：0 = 朝北（−Z），+90 = 朝西；前方 = (−sin, −cos)。块的 ry（弧度）在画布上是 rotate(−ry)。
//
// 输入监听只挂在全关总图那张 canvas 元素上（pointer 事件 + setPointerCapture），**不往 window 挂**。
// ===========================================================================

import { DefaultArc } from "./Script_EditorBlockoutConfig.mjs";

const RGB = (r, g, b) => Object.freeze([r, g, b]);

/** 调色板。测试按这张表数像素（精确色 = 不透明实心填充的内部像素）。 */
export const MAP_COLORS = Object.freeze({
  paper: RGB(230, 223, 205),     // 纸色（平地、无阴影时的底色）
  desk: RGB(21, 24, 25),         // 全关总图上图纸以外的底
  edge: RGB(196, 188, 168),      // 小地图视野超出边界时的边外
  wall: RGB(52, 48, 43),         // 房屋 / 墙：深墨
  low: RGB(142, 135, 122),       // 矮掩体：中灰
  roof: RGB(203, 194, 175),      // 屋面：浅墨铺底（墙压在上面）
  water: RGB(152, 187, 207),     // 水
  foliage: RGB(122, 136, 88),    // 树 / 苇
  road: RGB(244, 240, 229),      // 路面
  contour: RGB(126, 96, 62),     // 等高线
  cut: RGB(158, 116, 70),        // 开挖水洗
  ink: RGB(38, 35, 31),          // 描边 / 路线 / 文字
  enemy: RGB(196, 60, 42),       // 敌：红
  friend: RGB(38, 106, 180),     // 友：蓝
  civ: RGB(70, 136, 56),         // 百姓：绿
  gold: RGB(226, 166, 26),       // 要点 / 下一步 / 玩家 / 当前关键帧
});

/** 全关总图在这个比例（像素 / 米）及以上改用矢量块。 */
export const VECTOR_PX_PER_M = 4;
/** 小地图缺省比例：220 px 宽约 137 m。 */
export const MINI_PX_PER_M = 1.6;
/** 全关总图点关键帧时在画布上派发的事件名（detail: { index }）。 */
export const MAP_PICK_EVENT = "blockoutmappick";

const BAKE = Object.freeze({
  maxPxPerM: 4,            // 静态层分辨率上限
  maxPixels: 4.2e6,        // 静态层像素上限（第一关 342×602 m → 4 px/m ≈ 3.3 M）
  maxDim: 4096,
  maxCells: 400000,        // 高度采样格上限（第一关 1 m 格 ≈ 207 k）
  sliceMs: 9,              // 每个空闲片最多干这么久
  idleTimeoutMs: 60,       // 等不到空闲也最多隔这么久干一片
});

const SHADE = Object.freeze({ lx: -0.5, ly: 0.7071, lz: -0.5, k: 0.6, min: 0.74, max: 1.09 });
const CUT = Object.freeze({ minM: 0.25, fullM: 1.25, maxAlpha: 0.42 });
const CONTOUR = Object.freeze({ minorA: 0.32, majorA: 0.62, minorHalfPx: 0.45, majorHalfPx: 0.85, steepFade: 0.8 });

const SKIP_SEMANTICS = new Set(["airWall", "void", "coping"]);
const LOW_MAX_H = 1.4;
const MIN_H = 0.35;
const OVERHEAD_M = 1.5;

const FONT_STACK = '"TzUiLatin", "Microsoft YaHei UI", "Microsoft YaHei", "PingFang SC", "Hiragino Sans GB", "Noto Sans CJK SC", "TzUiSans", sans-serif';
const MONO_STACK = '"Cascadia Mono", Consolas, ui-monospace, monospace';

const SIDE_COLOR = { ija: MAP_COLORS.enemy, nra: MAP_COLORS.friend, civ: MAP_COLORS.civ };

function Css(rgb, a = 1) {
  return a >= 1 ? `rgb(${rgb[0]},${rgb[1]},${rgb[2]})` : `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`;
}
function Clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function Finite(v) { return typeof v === "number" && Number.isFinite(v); }
function Pt(p) {
  if (Array.isArray(p)) return Finite(p[0]) && Finite(p[1]) ? { x: p[0], z: p[1] } : null;
  return p && Finite(p.x) && Finite(p.z) ? { x: p.x, z: p.z } : null;
}
function Polylines(list) {
  if (!Array.isArray(list)) return [];
  // 接受 [[pt,pt…], …]、[{points:[…]}, …] 或单条 [pt, pt…]
  const lines = list.length && (Pt(list[0]) && !Array.isArray(list[0]?.[0])) ? [list] : list;
  return lines.map(line => (Array.isArray(line) ? line : line?.points || []).map(Pt).filter(Boolean)).filter(l => l.length >= 2);
}
function Now() { return (typeof performance !== "undefined" ? performance : Date).now(); }
function YawRad(deg) { return (deg || 0) * Math.PI / 180; }
/** 朝向 yawDeg 在画布上的角（atan2(y,x)，y 向下）。 */
function CanvasAngle(yawDeg) {
  const r = YawRad(yawDeg);
  return Math.atan2(-Math.cos(r), -Math.sin(r));
}

/**
 * 块在纸面图上的画法。返回 "skip" | "water" | "roof" | "foliage" | "low" | "wall"。
 * 规则见 §4.1：airWall / void / coping 与 0.35 m 以下的碎块不画；矮掩体（高 ≤ 1.4 m）中灰，其余深墨；
 * 屋面铺浅墨底（让房子读得出是房子），水淡蓝，树 / 苇橄榄色。不挡人的装饰件（solid: false）不画；
 * 给了 y 且底面高出地面 1.5 m 以上的（门楣、梁）不画，免得把门口画死。
 */
export function ClassifyBlock(block, groundAt = null) {
  if (!block) return "skip";
  const sem = block.semantic || "";
  if (SKIP_SEMANTICS.has(sem)) return "skip";
  if (!(block.w > 0) || !(block.d > 0)) return "skip";
  if (sem === "water") return "water";
  if (sem === "roof") return block.w * block.d >= 1.5 ? "roof" : "skip";
  if (sem === "foliage") return "foliage";
  if (!(block.h >= MIN_H)) return "skip";
  if (Math.min(block.w, block.d) < 0.06) return "skip";
  if (block.solid === false) return "skip";
  if (groundAt && Finite(block.y)) {
    const ground = groundAt(block.x, block.z);
    if (Finite(ground) && block.y - block.h / 2 - ground > OVERHEAD_M) return "skip";
  }
  return block.h > LOW_MAX_H ? "wall" : "low";
}

function Corners(b) {
  const ry = Finite(b.ry) ? b.ry : 0;
  const c = Math.cos(ry), s = Math.sin(ry);
  const hw = b.w / 2, hd = b.d / 2;
  // three：world = (lx·cos + lz·sin, −lx·sin + lz·cos)
  const P = (lx, lz) => [b.x + lx * c + lz * s, b.z - lx * s + lz * c];
  return [P(-hw, -hd), P(hw, -hd), P(hw, hd), P(-hw, hd)];
}

const STYLE_ORDER = ["water", "roof", "foliage", "low", "wall"];

function Schedule(fn) {
  if (typeof requestIdleCallback === "function") {
    const id = requestIdleCallback((deadline) => fn(deadline), { timeout: BAKE.idleTimeoutMs });
    return () => (typeof cancelIdleCallback === "function" ? cancelIdleCallback(id) : null);
  }
  const id = setTimeout(() => fn(null), 0);
  return () => clearTimeout(id);
}

function NiceLength(m) {
  const steps = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000];
  for (const s of steps) if (s >= m) return s;
  return steps[steps.length - 1];
}

export class BlockoutMap {
  constructor() {
    this.scene = null;
    this.items = [];            // 归类后的块：{style, corners|circle, minX…}
    this.index = null;          // 32 m 格的空间索引（矢量重画时裁剪）
    this.ways = { roads: [], trenches: [], rails: [] };
    this.cache = new Map();     // levelKey → baked
    this.baked = null;
    this.job = null;
    this.bakeStats = null;
    this.keyframes = [];
    this.kfIndex = -1;
    this.dynamic = { player: null, units: [], pois: [], next: null };
    this.layers = { arcs: "default", intents: true, labels: true };
    this.view = null;           // 全关总图视图 {cx, cz, pxPerM}
    this.viewTouched = false;   // 用户缩放 / 平移过就不再自动看全图
    this.fitFor = { w: 0, h: 0 };
    this.full = { canvas: null, w: 0, h: 0, dpr: 1, off: [] };
    this.hover = -1;
    this.cursor = null;         // 全关总图上光标的世界坐标
    this.drag = null;
    this.repaintQueued = false;
    this.disposed = false;
    this.miniView = null;       // 最近一次小地图的视图（测试与调试用）
    this.lastMiniMs = 0;
    this.lastFullMs = 0;
    if (typeof document !== "undefined" && document.fonts?.ready) {
      document.fonts.ready.then(() => { if (!this.disposed) this.RequestFullRepaint(); }).catch(() => {});
    }
  }

  // -------------------------------------------------------------------------
  // 数据

  /**
   * @param {{levelKey:string, bounds:{minX,maxX,minZ,maxZ}, blocks:Array, sampleHeight:(x,z)=>number,
   *          naturalHeight?:(x,z)=>number, ways?:{roads?, trenches?, rails?}}} scene
   */
  SetScene(scene) {
    const b = scene?.bounds;
    if (!scene || !b || !(b.maxX > b.minX) || !(b.maxZ > b.minZ)) throw new Error("BlockoutMap.SetScene 需要 bounds（minX < maxX、minZ < maxZ）");
    const levelKey = String(scene.levelKey || "");
    const blocks = Array.isArray(scene.blocks) ? scene.blocks : [];
    const bounds = { minX: b.minX, maxX: b.maxX, minZ: b.minZ, maxZ: b.maxZ };
    const signature = `${levelKey}|${blocks.length}|${bounds.minX},${bounds.maxX},${bounds.minZ},${bounds.maxZ}`;
    const changedLevel = !this.scene || this.scene.levelKey !== levelKey;
    if (this.job && this.job.signature !== signature) this.CancelBake();
    this.scene = {
      levelKey, bounds, signature,
      sampleHeight: typeof scene.sampleHeight === "function" ? scene.sampleHeight : () => 0,
      naturalHeight: typeof scene.naturalHeight === "function" ? scene.naturalHeight : null,
    };
    this.ways = {
      roads: Polylines(scene.ways?.roads),
      trenches: Polylines(scene.ways?.trenches),
      rails: Polylines(scene.ways?.rails),
    };
    this.BuildItems(blocks);
    const cached = this.cache.get(levelKey);
    this.baked = cached && cached.signature === signature ? cached : null;
    if (changedLevel) { this.view = null; this.hover = -1; }
    this.RequestFullRepaint();
  }

  BuildItems(blocks) {
    const groundAt = this.scene.sampleHeight;
    const items = [];
    const counts = { skip: 0, water: 0, roof: 0, foliage: 0, low: 0, wall: 0 };
    for (const block of blocks) {
      if (!block || !Finite(block.x) || !Finite(block.z)) { counts.skip++; continue; }
      const style = ClassifyBlock(block, groundAt);
      counts[style]++;
      if (style === "skip") continue;
      if (style === "foliage") {
        const r = Math.max(1.1, Math.max(block.w, block.d) / 2);
        items.push({ style, x: block.x, z: block.z, r, minX: block.x - r, maxX: block.x + r, minZ: block.z - r, maxZ: block.z + r });
        continue;
      }
      const corners = Corners(block);
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (const [x, z] of corners) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z); }
      items.push({ style, corners, minX, maxX, minZ, maxZ });
    }
    items.sort((a, b) => STYLE_ORDER.indexOf(a.style) - STYLE_ORDER.indexOf(b.style));
    this.items = items;
    this.blockCounts = counts;
    // 空间索引
    const cell = 32;
    const { minX, minZ, maxX, maxZ } = this.scene.bounds;
    const cols = Math.max(1, Math.ceil((maxX - minX) / cell));
    const rows = Math.max(1, Math.ceil((maxZ - minZ) / cell));
    const buckets = Array.from({ length: cols * rows }, () => []);
    items.forEach((item, i) => {
      const c0 = Clamp(Math.floor((item.minX - minX) / cell), 0, cols - 1), c1 = Clamp(Math.floor((item.maxX - minX) / cell), 0, cols - 1);
      const r0 = Clamp(Math.floor((item.minZ - minZ) / cell), 0, rows - 1), r1 = Clamp(Math.floor((item.maxZ - minZ) / cell), 0, rows - 1);
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) buckets[r * cols + c].push(i);
    });
    this.index = { cell, cols, rows, buckets };
  }

  /** @param {Array<{id, stage, player:{x,z}, name?}>} list */
  SetKeyframes(list, index = 0) {
    this.keyframes = (Array.isArray(list) ? list : []).map((kf, i) => ({
      i, id: String(kf?.id ?? i), stage: kf?.stage, name: kf?.name || "",
      x: kf?.player?.x, z: kf?.player?.z,
    })).filter(kf => Finite(kf.x) && Finite(kf.z));
    this.kfIndex = Number.isInteger(index) ? index : -1;
    this.RequestFullRepaint();
  }

  /** @param {{player?:{x,z,yawDeg}, units?:Array, pois?:Array, next?:{x,z,text,radiusM}|null}} d */
  SetDynamic(d = {}) {
    this.dynamic = {
      player: d.player && Finite(d.player.x) && Finite(d.player.z) ? { x: d.player.x, z: d.player.z, yawDeg: d.player.yawDeg || 0 } : null,
      units: Array.isArray(d.units) ? d.units : [],
      pois: Array.isArray(d.pois) ? d.pois : [],
      next: d.next && Finite(d.next.x) && Finite(d.next.z) ? d.next : null,
    };
  }

  /** arcs: true / "default"（数据给的 + 机枪战车）、"all"（再加举枪的步枪）、false / "off" */
  SetLayers(layers = {}) {
    if ("arcs" in layers) {
      const a = layers.arcs;
      this.layers.arcs = a === true ? "default" : a === false ? "off" : ["default", "all", "off"].includes(a) ? a : this.layers.arcs;
    }
    if ("intents" in layers) this.layers.intents = !!layers.intents;
    if ("labels" in layers) this.layers.labels = !!layers.labels;
    this.RequestFullRepaint();
  }

  // -------------------------------------------------------------------------
  // 烘静态层

  get baking() { return !!this.job; }

  /** 空闲分块烘当前关卡的静态层 → Promise<stats>。同一关卡已烘好直接返回。 */
  Bake() {
    if (!this.scene) return Promise.resolve(null);
    if (this.baked && this.baked.signature === this.scene.signature) return Promise.resolve(this.baked.stats);
    if (this.job && this.job.signature === this.scene.signature) return this.job.promise;
    if (typeof document === "undefined") return Promise.resolve(null);
    const scene = this.scene;
    const { minX, maxX, minZ, maxZ } = scene.bounds;
    const wM = maxX - minX, hM = maxZ - minZ;
    const area = wM * hM;
    const cellM = Math.max(1, Math.sqrt(area / BAKE.maxCells));
    const cols = Math.ceil(wM / cellM), rows = Math.ceil(hM / cellM);
    let pxPerM = Math.min(BAKE.maxPxPerM, Math.sqrt(BAKE.maxPixels / area));
    pxPerM = Math.min(pxPerM, BAKE.maxDim / wM, BAKE.maxDim / hM);
    const width = Math.max(1, Math.round(wM * pxPerM)), height = Math.max(1, Math.round(hM * pxPerM));
    const ground = document.createElement("canvas");
    ground.width = width; ground.height = height;
    const gctx = ground.getContext("2d");
    gctx.fillStyle = Css(MAP_COLORS.paper);
    gctx.fillRect(0, 0, width, height);
    const job = {
      signature: scene.signature, levelKey: scene.levelKey, scene, items: this.items, ways: this.ways,
      cellM, cols, rows, pxPerM, width, height, ground, gctx,
      H: new Float32Array((cols + 1) * (rows + 1)),
      N: scene.naturalHeight ? new Float32Array((cols + 1) * (rows + 1)) : null,
      GX: null, GZ: null,
      phase: "heights", row: 0, workMs: 0, slices: 0, startedAt: Now(), cancel: null, cancelled: false,
      maxStepMs: 0, maxStepPhase: "",
    };
    job.promise = new Promise((resolve, reject) => { job.resolve = resolve; job.reject = reject; });
    this.job = job;
    const Run = (deadline) => {
      if (job.cancelled) return;
      const t0 = Now();
      const budget = deadline && !deadline.didTimeout ? Clamp(deadline.timeRemaining(), 3, BAKE.sliceMs) : BAKE.sliceMs * 0.7;
      try {
        do {
          const s0 = Now(), phase = job.phase;
          this.BakeStep(job);
          const ms = Now() - s0;
          if (ms > job.maxStepMs) { job.maxStepMs = ms; job.maxStepPhase = phase; }
        } while (job.phase !== "done" && Now() - t0 < budget);
      } catch (error) {
        job.workMs += Now() - t0;
        if (this.job === job) this.job = null;
        job.reject(error);
        return;
      }
      job.workMs += Now() - t0;
      job.slices += 1;
      if (job.phase === "done") return;
      job.cancel = Schedule(Run);
    };
    job.cancel = Schedule(Run);
    return job.promise;
  }

  /** 立即同步烘完（测试 / 离线出图用；游戏里用 Bake()）。 */
  BakeNow() {
    const promise = this.Bake();
    const job = this.job;
    if (job) {
      job.cancel?.();
      const t0 = Now();
      while (job.phase !== "done") this.BakeStep(job);
      job.workMs += Now() - t0;
      job.slices += 1;
    }
    return promise;
  }

  /** 丢掉烘好的静态层（某关的块变了：场景态切换、重读场景文件）。不给 levelKey = 全部。之后再 Bake()。 */
  ClearCache(levelKey = null) {
    if (levelKey === null) this.cache.clear(); else this.cache.delete(String(levelKey));
    if (this.baked && (levelKey === null || this.baked.levelKey === String(levelKey))) this.baked = null;
    if (this.job && (levelKey === null || this.job.levelKey === String(levelKey))) this.CancelBake();
    this.RequestFullRepaint();
  }

  CancelBake() {
    if (!this.job) return;
    this.job.cancelled = true;
    this.job.cancel?.();
    this.job.resolve(null);
    this.job = null;
  }

  BakeStep(job) {
    const { scene, cols, rows, cellM } = job;
    const { minX, minZ } = scene.bounds;
    if (job.phase === "heights") {
      // 一次一行格点
      const iz = job.row;
      const z = minZ + iz * cellM;
      const base = iz * (cols + 1);
      for (let ix = 0; ix <= cols; ix++) {
        const x = minX + ix * cellM;
        const h = scene.sampleHeight(x, z);
        job.H[base + ix] = Finite(h) ? h : 0;
        if (job.N) { const n = scene.naturalHeight(x, z); job.N[base + ix] = Finite(n) ? n : job.H[base + ix]; }
      }
      job.row += 1;
      if (job.row > rows) { job.phase = "gradients"; job.row = 0; }
      return;
    }
    if (job.phase === "gradients") {
      const W = cols + 1, H = job.H;
      const GX = new Float32Array(H.length), GZ = new Float32Array(H.length);
      for (let iz = 0; iz <= rows; iz++) {
        for (let ix = 0; ix <= cols; ix++) {
          const i = iz * W + ix;
          const xl = ix > 0 ? i - 1 : i, xr = ix < cols ? i + 1 : i;
          const zu = iz > 0 ? i - W : i, zd = iz < rows ? i + W : i;
          GX[i] = (H[xr] - H[xl]) / (((xr - xl) || 1) * cellM);
          GZ[i] = (H[zd] - H[zu]) / ((((zd - zu) / W) || 1) * cellM);
        }
      }
      job.GX = GX; job.GZ = GZ;
      job.phase = "raster"; job.row = 0;
      return;
    }
    if (job.phase === "raster") {
      const strip = Math.min(12, job.height - job.row);
      this.RasterRows(job, job.row, strip);
      job.row += strip;
      if (job.row >= job.height) { job.phase = "blocks"; job.row = 0; }
      return;
    }
    if (job.phase === "blocks") {
      const composite = document.createElement("canvas");
      composite.width = job.width; composite.height = job.height;
      const ctx = composite.getContext("2d");
      ctx.drawImage(job.ground, 0, 0);
      ctx.setTransform(job.pxPerM, 0, 0, job.pxPerM, -minX * job.pxPerM, -minZ * job.pxPerM);
      DrawWays(ctx, job.ways, job.pxPerM);
      DrawItems(ctx, job.items, job.pxPerM);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const wallS = (Now() - job.startedAt);
      const stats = {
        levelKey: job.levelKey, cellM: job.cellM, cells: (cols + 1) * (rows + 1), pxPerM: job.pxPerM,
        width: job.width, height: job.height, blocks: job.items.length,
        workMs: Math.round(job.workMs), wallMs: Math.round(wallS), slices: job.slices + 1,
      };
      const baked = {
        signature: job.signature, levelKey: job.levelKey, bounds: { ...scene.bounds },
        pxPerM: job.pxPerM, width: job.width, height: job.height,
        ground: job.ground, composite, stats,
      };
      this.cache.set(job.levelKey, baked);
      if (this.scene && this.scene.signature === job.signature) this.baked = baked;
      this.bakeStats = stats;
      job.phase = "done";
      if (this.job === job) this.job = null;
      // 统计在 resolve 时补上最后这一片的耗时
      queueMicrotask(() => {
        stats.workMs = Math.round(job.workMs);
        stats.wallMs = Math.round(Now() - job.startedAt);
        stats.slices = job.slices;
        stats.maxStepMs = Math.round(job.maxStepMs * 10) / 10;
        stats.maxStepPhase = job.maxStepPhase;
        job.resolve(stats);
        this.RequestFullRepaint();
      });
    }
  }

  RasterRows(job, y0, count) {
    const { width, pxPerM: s, cellM, cols, rows, H, N, GX, GZ } = job;
    const { minX, minZ } = job.scene.bounds;
    const W = cols + 1;
    const img = job.gctx.createImageData(width, count);
    const data = img.data;
    const [pr, pg, pb] = MAP_COLORS.paper;
    const [cr, cg, cb] = MAP_COLORS.cut;
    const [lr, lg, lb] = MAP_COLORS.contour;
    const Lx = SHADE.lx, Ly = SHADE.ly, Lz = SHADE.lz;
    const lLen = Math.hypot(Lx, Ly, Lz);
    const flat = Ly / lLen;
    for (let row = 0; row < count; row++) {
      const py = y0 + row;
      const z = minZ + (py + 0.5) / s;
      let fz = (z - minZ) / cellM;
      fz = Clamp(fz, 0, rows - 1e-6);
      const iz = Math.floor(fz), v = fz - iz;
      for (let px = 0; px < width; px++) {
        const x = minX + (px + 0.5) / s;
        let fx = (x - minX) / cellM;
        fx = Clamp(fx, 0, cols - 1e-6);
        const ix = Math.floor(fx), u = fx - ix;
        const i00 = iz * W + ix, i10 = i00 + 1, i01 = i00 + W, i11 = i01 + 1;
        const w00 = (1 - u) * (1 - v), w10 = u * (1 - v), w01 = (1 - u) * v, w11 = u * v;
        const h = H[i00] * w00 + H[i10] * w10 + H[i01] * w01 + H[i11] * w11;
        const gx = GX[i00] * w00 + GX[i10] * w10 + GX[i01] * w01 + GX[i11] * w11;
        const gz = GZ[i00] * w00 + GZ[i10] * w10 + GZ[i01] * w01 + GZ[i11] * w11;
        // 山体阴影：光从西北来
        const nLen = Math.sqrt(gx * gx + 1 + gz * gz);
        const dot = (-gx * Lx + Ly - gz * Lz) / (nLen * lLen);
        const f = Clamp(1 + (dot - flat) * SHADE.k, SHADE.min, SHADE.max);
        let r = pr * f, g = pg * f, b = pb * f;
        // 开挖水洗
        if (N) {
          const n = N[i00] * w00 + N[i10] * w10 + N[i01] * w01 + N[i11] * w11;
          const cut = n - h;
          if (cut > CUT.minM) {
            const a = Clamp((cut - CUT.minM) / (CUT.fullM - CUT.minM), 0, 1) * CUT.maxAlpha + 0.06;
            r += (cr - r) * a; g += (cg - g) * a; b += (cb - b) * a;
          }
        }
        // 等高线：到最近整米 / 整 5 米等值线的像素距离 = 高差 / 每像素坡度
        const slopePx = Math.sqrt(gx * gx + gz * gz) / s;
        if (slopePx > 1e-4) {
          const steep = slopePx > CONTOUR.steepFade ? CONTOUR.steepFade / slopePx : 1;
          const d1 = Math.abs(h - Math.round(h)) / slopePx;
          let a = Clamp(CONTOUR.minorHalfPx + 0.5 - d1, 0, 1) * CONTOUR.minorA;
          const h5 = h / 5;
          const d5 = Math.abs(h5 - Math.round(h5)) * 5 / slopePx;
          a = Math.max(a, Clamp(CONTOUR.majorHalfPx + 0.5 - d5, 0, 1) * CONTOUR.majorA);
          a *= steep;
          if (a > 0) { r += (lr - r) * a; g += (lg - g) * a; b += (lb - b) * a; }
        }
        const o = (row * width + px) * 4;
        data[o] = r; data[o + 1] = g; data[o + 2] = b; data[o + 3] = 255;
      }
    }
    job.gctx.putImageData(img, 0, y0);
  }

  // -------------------------------------------------------------------------
  // 小地图

  /**
   * 北朝上、以玩家为中心并夹在边界内。canvas 的 CSS 尺寸决定画多大，按 DPR 出图。
   * 关卡比视野还小时自动放大到整关正好铺满（不在小地图上留一圈空白）。
   */
  PaintMini(canvas, { pxPerM = MINI_PX_PER_M } = {}) {
    if (!canvas || !this.scene) return;
    const t0 = Now();
    const { ctx, w, h, dpr } = PrepareCanvas(canvas);
    if (!ctx) return;
    const b = this.scene.bounds;
    const s = Math.max(Finite(pxPerM) && pxPerM > 0 ? pxPerM : MINI_PX_PER_M, Math.min(w / (b.maxX - b.minX), h / (b.maxZ - b.minZ)));
    const viewW = w / s, viewH = h / s;
    const player = this.dynamic.player;
    let cx = player ? player.x : (b.minX + b.maxX) / 2;
    let cz = player ? player.z : (b.minZ + b.maxZ) / 2;
    cx = viewW >= b.maxX - b.minX ? (b.minX + b.maxX) / 2 : Clamp(cx, b.minX + viewW / 2, b.maxX - viewW / 2);
    cz = viewH >= b.maxZ - b.minZ ? (b.minZ + b.maxZ) / 2 : Clamp(cz, b.minZ + viewH / 2, b.maxZ - viewH / 2);
    const view = { cx, cz, s, w, h };
    this.miniView = view;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = Css(MAP_COLORS.edge);
    ctx.fillRect(0, 0, w, h);
    this.PaintBase(ctx, view, dpr, { vector: false });
    this.PaintDynamic(ctx, view, { mini: true });
    this.lastMiniMs = Now() - t0;
  }

  // -------------------------------------------------------------------------
  // 全关总图

  PaintFull(canvas) {
    if (!canvas || !this.scene) return;
    const t0 = Now();
    this.AttachFull(canvas);
    const { ctx, w, h, dpr } = PrepareCanvas(canvas);
    if (!ctx) return;
    this.full.w = w; this.full.h = h; this.full.dpr = dpr;
    // 还没人动过视图时，画布尺寸一变（第一次打开、窗口缩放）就重新看全图
    if (!this.view || (!this.viewTouched && (this.fitFor.w !== w || this.fitFor.h !== h))) this.FitBounds();
    const view = { cx: this.view.cx, cz: this.view.cz, s: this.view.pxPerM, w, h };
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = Css(MAP_COLORS.desk);
    ctx.fillRect(0, 0, w, h);
    // 图纸的影子：一圈柔和的暗边，让纸「浮」在桌面上
    const b = this.scene.bounds;
    const p0 = Project(view, b.minX, b.minZ), p1 = Project(view, b.maxX, b.maxZ);
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.55)";
    ctx.shadowBlur = 18;
    ctx.fillStyle = Css(MAP_COLORS.paper);
    ctx.fillRect(p0.x, p0.y, p1.x - p0.x, p1.y - p0.y);
    ctx.restore();
    this.PaintBase(ctx, view, dpr, { vector: view.s >= VECTOR_PX_PER_M });
    this.PaintRoute(ctx, view);
    this.PaintKeyframeDots(ctx, view);
    this.PaintDynamic(ctx, view, { mini: false });
    this.PaintHoverTip(ctx, view);
    this.PaintChrome(ctx, view);
    this.lastFullMs = Now() - t0;
  }

  FitBounds() {
    if (!this.scene) return;
    const b = this.scene.bounds;
    const w = this.full.w || 1000, h = this.full.h || 700;
    const s = Math.min(w / (b.maxX - b.minX), h / (b.maxZ - b.minZ)) * 0.94;
    this.view = { cx: (b.minX + b.maxX) / 2, cz: (b.minZ + b.maxZ) / 2, pxPerM: s };
    this.fitFor = { w: this.full.w, h: this.full.h };
    this.viewTouched = false;
    this.RequestFullRepaint();
  }

  /** 把全关总图对准某个世界点（可选比例）。 */
  FocusOn(x, z, pxPerM = null) {
    if (!this.view) this.FitBounds();
    if (!this.view) return;
    this.view.cx = x; this.view.cz = z;
    if (Finite(pxPerM)) this.view.pxPerM = Clamp(pxPerM, this.MinScale(), this.MaxScale());
    this.viewTouched = true;
    this.ClampView();
    this.RequestFullRepaint();
  }

  MinScale() {
    if (!this.scene) return 0.05;
    const b = this.scene.bounds;
    const w = this.full.w || 1000, h = this.full.h || 700;
    return Math.min(w / (b.maxX - b.minX), h / (b.maxZ - b.minZ)) * 0.5;
  }
  MaxScale() { return 40; }

  ClampView() {
    if (!this.view || !this.scene) return;
    const b = this.scene.bounds;
    this.view.cx = Clamp(this.view.cx, b.minX, b.maxX);
    this.view.cz = Clamp(this.view.cz, b.minZ, b.maxZ);
  }

  ZoomAt(px, py, factor) {
    if (!this.view) this.FitBounds();
    if (!this.view || !(factor > 0)) return;
    const before = this.ScreenToWorld(px, py);
    const s = Clamp(this.view.pxPerM * factor, this.MinScale(), this.MaxScale());
    const w = this.full.w || 1000, h = this.full.h || 700;
    this.view.pxPerM = s;
    this.view.cx = before.x - (px - w / 2) / s;
    this.view.cz = before.z - (py - h / 2) / s;
    this.viewTouched = true;
    this.ClampView();
    this.RequestFullRepaint();
  }

  PanBy(dxPx, dyPx) {
    if (!this.view) this.FitBounds();
    if (!this.view) return;
    this.view.cx -= dxPx / this.view.pxPerM;
    this.view.cz -= dyPx / this.view.pxPerM;
    this.viewTouched = true;
    this.ClampView();
    this.RequestFullRepaint();
  }

  ScreenToWorld(px, py) {
    if (!this.view) this.FitBounds();
    const v = this.view || { cx: 0, cz: 0, pxPerM: 1 };
    const w = this.full.w || 1000, h = this.full.h || 700;
    return { x: (px - w / 2) / v.pxPerM + v.cx, z: (py - h / 2) / v.pxPerM + v.cz };
  }

  WorldToScreen(x, z) {
    if (!this.view) this.FitBounds();
    const v = this.view || { cx: 0, cz: 0, pxPerM: 1 };
    const w = this.full.w || 1000, h = this.full.h || 700;
    return { x: (x - v.cx) * v.pxPerM + w / 2, y: (z - v.cz) * v.pxPerM + h / 2 };
  }

  /** 全关总图上 (px, py)（CSS 像素）附近 10 px 内最近的关键帧 → 下标，没有 → −1。 */
  PickKeyframe(px, py) {
    let best = -1, bestD = 11;
    for (const kf of this.keyframes) {
      const p = this.WorldToScreen(kf.x, kf.z);
      const d = Math.hypot(p.x - px, p.y - py);
      if (d < bestD || (d === bestD && kf.i === this.kfIndex)) { best = kf.i; bestD = d; }
    }
    return best;
  }

  RequestFullRepaint() {
    if (this.repaintQueued || !this.full.canvas || this.disposed) return;
    this.repaintQueued = true;
    const Go = () => {
      this.repaintQueued = false;
      if (!this.disposed && this.full.canvas && this.full.canvas.isConnected && this.full.canvas.clientWidth > 0) this.PaintFull(this.full.canvas);
    };
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(Go); else setTimeout(Go, 16);
  }

  AttachFull(canvas) {
    if (this.full.canvas === canvas) return;
    this.DetachFull();
    this.full.canvas = canvas;
    const on = (type, fn, opts) => { canvas.addEventListener(type, fn, opts); this.full.off.push(() => canvas.removeEventListener(type, fn, opts)); };
    on("wheel", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const r = canvas.getBoundingClientRect();
      const unit = e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 400 : 1;
      this.ZoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * unit * 0.0016));
    }, { passive: false });
    on("pointerdown", (e) => {
      if (e.button !== 0 && e.button !== 1 && e.button !== 2) return;
      e.preventDefault();
      try { canvas.setPointerCapture(e.pointerId); } catch { /* 合成事件没有真指针 */ }
      this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: 0, button: e.button };
      canvas.classList.add("dragging");
    });
    on("pointermove", (e) => {
      const r = canvas.getBoundingClientRect();
      const px = e.clientX - r.left, py = e.clientY - r.top;
      if (this.drag && this.drag.id === e.pointerId) {
        const dx = e.clientX - this.drag.x, dy = e.clientY - this.drag.y;
        this.drag.x = e.clientX; this.drag.y = e.clientY;
        this.drag.moved += Math.abs(dx) + Math.abs(dy);
        if (this.drag.moved > 3) this.PanBy(dx, dy);
      }
      this.cursor = this.ScreenToWorld(px, py);
      const hover = this.drag ? -1 : this.PickKeyframe(px, py);
      if (hover !== this.hover) { this.hover = hover; canvas.style.cursor = hover >= 0 ? "pointer" : ""; }
      this.RequestFullRepaint();
    });
    const End = (e) => {
      if (!this.drag || this.drag.id !== e.pointerId) return;
      const drag = this.drag;
      this.drag = null;
      canvas.classList.remove("dragging");
      try { canvas.releasePointerCapture(e.pointerId); } catch { /* 已释放 */ }
      if (e.type === "pointerup" && drag.moved <= 3 && drag.button === 0) {
        const r = canvas.getBoundingClientRect();
        const index = this.PickKeyframe(e.clientX - r.left, e.clientY - r.top);
        if (index >= 0) canvas.dispatchEvent(new CustomEvent(MAP_PICK_EVENT, { detail: { index } }));
      }
    };
    on("pointerup", End);
    on("pointercancel", End);
    on("pointerleave", () => { if (!this.drag) { this.hover = -1; this.cursor = null; this.RequestFullRepaint(); } });
    on("dblclick", (e) => { e.preventDefault(); this.FitBounds(); });
    on("contextmenu", (e) => e.preventDefault());
  }

  DetachFull() {
    for (const off of this.full.off) off();
    this.full.off = [];
    this.full.canvas = null;
  }

  // -------------------------------------------------------------------------
  // 画

  PaintBase(ctx, view, dpr, { vector }) {
    const baked = this.baked || (this.job ? { ground: this.job.ground, pxPerM: this.job.pxPerM, width: this.job.width, height: this.job.height, partial: true } : null);
    const b = this.scene.bounds;
    if (baked) {
      const img = vector || baked.partial ? baked.ground : baked.composite;
      BlitBaked(ctx, img, baked.pxPerM, b, view);
    } else {
      const p0 = Project(view, b.minX, b.minZ), p1 = Project(view, b.maxX, b.maxZ);
      ctx.fillStyle = Css(MAP_COLORS.paper);
      ctx.fillRect(p0.x, p0.y, p1.x - p0.x, p1.y - p0.y);
    }
    if (vector || !this.baked) {
      // 矢量块：放大看细节时不糊；烘好之前也先用它顶着
      const minX = view.cx - view.w / 2 / view.s, maxX = view.cx + view.w / 2 / view.s;
      const minZ = view.cz - view.h / 2 / view.s, maxZ = view.cz + view.h / 2 / view.s;
      const items = this.ItemsIn(minX, maxX, minZ, maxZ);
      ctx.save();
      ctx.setTransform(dpr * view.s, 0, 0, dpr * view.s, dpr * (view.w / 2 - view.cx * view.s), dpr * (view.h / 2 - view.cz * view.s));
      ctx.beginPath();
      ctx.rect(b.minX, b.minZ, b.maxX - b.minX, b.maxZ - b.minZ);
      ctx.clip();   // 与烘好的图一致：路头、块都不画出图纸
      DrawWays(ctx, this.ways, view.s);
      DrawItems(ctx, items, view.s);
      ctx.restore();
    }
    // 图纸边线
    const p0 = Project(view, b.minX, b.minZ), p1 = Project(view, b.maxX, b.maxZ);
    ctx.strokeStyle = Css(MAP_COLORS.ink, 0.35);
    ctx.lineWidth = 1;
    ctx.strokeRect(Math.round(p0.x) + 0.5, Math.round(p0.y) + 0.5, Math.round(p1.x - p0.x) - 1, Math.round(p1.y - p0.y) - 1);
  }

  ItemsIn(minX, maxX, minZ, maxZ) {
    if (!this.index) return [];
    const { cell, cols, rows, buckets } = this.index;
    const b = this.scene.bounds;
    const c0 = Clamp(Math.floor((minX - b.minX) / cell), 0, cols - 1), c1 = Clamp(Math.floor((maxX - b.minX) / cell), 0, cols - 1);
    const r0 = Clamp(Math.floor((minZ - b.minZ) / cell), 0, rows - 1), r1 = Clamp(Math.floor((maxZ - b.minZ) / cell), 0, rows - 1);
    const seen = new Set();
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) for (const i of buckets[r * cols + c]) seen.add(i);
    return [...seen].sort((a, b2) => a - b2).map(i => this.items[i]);
  }

  PaintRoute(ctx, view) {
    const kfs = this.keyframes;
    if (kfs.length < 2) return;
    ctx.save();
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = Css(MAP_COLORS.ink, 0.55);
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    kfs.forEach((kf, i) => {
      const p = Project(view, kf.x, kf.z);
      if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
    });
    ctx.stroke();
    ctx.setLineDash([]);
    // 段中的小箭头：读得出走向
    ctx.fillStyle = Css(MAP_COLORS.ink, 0.6);
    for (let i = 1; i < kfs.length; i++) {
      const a = Project(view, kfs[i - 1].x, kfs[i - 1].z), b = Project(view, kfs[i].x, kfs[i].z);
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      if (len < 46) continue;
      const ang = Math.atan2(b.y - a.y, b.x - a.x);
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      ctx.save();
      ctx.translate(mx, my);
      ctx.rotate(ang);
      ctx.beginPath();
      ctx.moveTo(4.5, 0); ctx.lineTo(-3.5, -3.6); ctx.lineTo(-1.5, 0); ctx.lineTo(-3.5, 3.6); ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  PaintKeyframeDots(ctx, view) {
    const kfs = this.keyframes;
    if (!kfs.length) return;
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const order = kfs.filter(kf => kf.i !== this.kfIndex && kf.i !== this.hover);
    const top = kfs.filter(kf => kf.i === this.hover && kf.i !== this.kfIndex);
    const current = kfs.filter(kf => kf.i === this.kfIndex);
    for (const kf of [...order, ...top, ...current]) {
      const p = Project(view, kf.x, kf.z);
      if (p.x < -24 || p.y < -24 || p.x > view.w + 24 || p.y > view.h + 24) continue;
      const label = String(kf.stage ?? "").padStart(2, "0");
      if (kf.i === this.kfIndex) {
        // 当前关键帧：空心金环（玩家箭头站在环里），阶段号挂在右上角的金色小牌上
        ctx.beginPath();
        ctx.arc(p.x, p.y, 12, 0, Math.PI * 2);
        ctx.lineWidth = 5; ctx.strokeStyle = Css(MAP_COLORS.ink, 0.85); ctx.stroke();
        ctx.lineWidth = 3; ctx.strokeStyle = Css(MAP_COLORS.gold); ctx.stroke();
        ctx.font = `700 10px ${FONT_STACK}`;
        const tw = ctx.measureText(label).width;
        const bx = p.x + 9, by = p.y - 22, bw = tw + 8, bh = 14;
        ctx.fillStyle = Css(MAP_COLORS.ink);
        ctx.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
        ctx.fillStyle = Css(MAP_COLORS.gold);
        ctx.fillRect(bx, by, bw, bh);
        ctx.fillStyle = Css(MAP_COLORS.ink);
        ctx.fillText(label, bx + bw / 2, by + bh / 2 + 0.5);
        continue;
      }
      const isHover = kf.i === this.hover;
      const r = isHover ? 9 : 8;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r + 1.5, 0, Math.PI * 2);
      ctx.fillStyle = Css(MAP_COLORS.paper);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fillStyle = Css(MAP_COLORS.ink);
      ctx.fill();
      ctx.fillStyle = Css(MAP_COLORS.paper);
      ctx.font = `700 9px ${FONT_STACK}`;
      ctx.fillText(label, p.x, p.y + 0.5);
    }
    ctx.restore();
  }

  PaintHoverTip(ctx, view) {
    const hk = this.keyframes.find(kf => kf.i === this.hover);
    if (!hk) return;
    ctx.save();
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    const p = Project(view, hk.x, hk.z);
    const text = hk.name ? `${hk.id} · ${hk.name}` : hk.id;
    ctx.font = `600 12px ${FONT_STACK}`;
    const tw = ctx.measureText(text).width;
    const bw = tw + 16, bh = 24;
    let bx = p.x + 14, by = p.y - bh - 8;
    if (bx + bw > view.w - 6) bx = p.x - 14 - bw;
    if (by < 6) by = p.y + 12;
    ctx.fillStyle = "rgba(14,16,17,0.92)";
    ctx.fillRect(bx, by, bw, bh);
    ctx.strokeStyle = "rgba(196,198,187,0.35)";
    ctx.lineWidth = 1;
    ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
    ctx.fillStyle = "#eeefec";
    ctx.fillText(text, bx + 8, by + bh / 2 + 0.5);
    ctx.restore();
  }

  PaintDynamic(ctx, view, { mini }) {
    const { units, pois, next, player } = this.dynamic;
    const s = view.s;
    const glyph = mini ? 1 : Clamp(0.85 + (s - 1.5) * 0.06, 1, 1.45);
    const arcMode = this.layers.arcs;
    ctx.save();
    // 射界
    if (arcMode !== "off") {
      for (const u of units) {
        if (u.visible === false || u.state === "down") continue;
        const arc = this.ArcFor(u, arcMode);
        if (!arc) continue;
        const color = SIDE_COLOR[u.side] || MAP_COLORS.ink;
        const p = Project(view, u.x, u.z);
        const r = arc.rangeM * s;
        const a = CanvasAngle(arc.yawDeg);
        const half = YawRad(arc.halfDeg);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.arc(p.x, p.y, r, a - half, a + half);
        ctx.closePath();
        ctx.fillStyle = Css(color, mini ? 0.13 : 0.12);
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = Css(color, 0.5);
        ctx.stroke();
      }
    }
    // 去向
    if (this.layers.intents) {
      for (const u of units) {
        if (u.visible === false || !Array.isArray(u.intent) || !u.intent.length) continue;
        const pts = [{ x: u.x, z: u.z }, ...u.intent.map(Pt).filter(Boolean)];
        if (pts.length < 2) continue;
        DashedArrow(ctx, pts.map(q => Project(view, q.x, q.z)), Css(SIDE_COLOR[u.side] || MAP_COLORS.ink, 0.85), mini ? 1.3 : 1.6);
      }
    }
    // 下一步：到目标的金色虚线 + 金环
    if (next) {
      const t = Project(view, next.x, next.z);
      if (player) {
        const p = Project(view, player.x, player.z);
        ctx.save();
        ctx.setLineDash([3, 4]);
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = Css(MAP_COLORS.gold, 0.9);
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(t.x, t.y); ctx.stroke();
        ctx.restore();
      }
      const r = Math.max(6, (Finite(next.radiusM) ? next.radiusM : 3) * s);
      ctx.beginPath(); ctx.arc(t.x, t.y, r, 0, Math.PI * 2);
      ctx.lineWidth = 4.5; ctx.strokeStyle = Css(MAP_COLORS.ink, 0.75); ctx.stroke();
      ctx.lineWidth = 2.5; ctx.strokeStyle = Css(MAP_COLORS.gold); ctx.stroke();
      ctx.beginPath(); ctx.arc(t.x, t.y, 2, 0, Math.PI * 2); ctx.fillStyle = Css(MAP_COLORS.gold); ctx.fill();
      if (mini) EdgePointer(ctx, view, t, player ? Project(view, player.x, player.z) : null);
    }
    // 要点
    for (const poi of pois) {
      if (!Finite(poi.x) || !Finite(poi.z)) continue;
      const p = Project(view, poi.x, poi.z);
      Diamond(ctx, p.x, p.y, (mini ? 5 : 6) * glyph, poi.kind === "danger" ? MAP_COLORS.enemy : MAP_COLORS.gold);
    }
    // 单位：先画倒地的（压在下面），再画活的
    const live = units.filter(u => u.visible !== false);
    for (const u of live.filter(q => q.state === "down")) this.DrawUnit(ctx, view, u, glyph, true);
    for (const u of live.filter(q => q.state !== "down")) this.DrawUnit(ctx, view, u, glyph, false);
    // 玩家
    if (player) {
      const p = Project(view, player.x, player.z);
      const a = CanvasAngle(player.yawDeg);
      const coneR = mini ? 46 : Clamp(40 * s, 46, 130);
      const grad = ctx.createRadialGradient(p.x, p.y, 2, p.x, p.y, coneR);
      grad.addColorStop(0, Css(MAP_COLORS.gold, 0.42));
      grad.addColorStop(1, Css(MAP_COLORS.gold, 0));
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.arc(p.x, p.y, coneR, a - 0.6, a + 0.6);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();
      PlayerArrow(ctx, p.x, p.y, (mini ? 1 : 1.15) * glyph, player.yawDeg);
    }
    // 标签（只在全关总图上）
    if (!mini && this.layers.labels) this.PaintLabels(ctx, view, live);
    ctx.restore();
  }

  ArcFor(u, mode) {
    let arc = u.arc && Finite(u.arc.halfDeg) && Finite(u.arc.rangeM) ? u.arc : null;
    if (!arc && mode === "all") arc = DefaultArc(u, "all");
    if (!arc) return null;
    // 缺省射界跟着人现在的朝向走（过渡中会转身）；数据给了中心朝向的按数据。
    const yawDeg = arc.source === "default" || !Finite(arc.yawDeg) ? u.yawDeg : arc.yawDeg;
    return { halfDeg: arc.halfDeg, rangeM: arc.rangeM, yawDeg };
  }

  DrawUnit(ctx, view, u, glyph, down) {
    if (!Finite(u.x) || !Finite(u.z)) return;
    const p = Project(view, u.x, u.z);
    if (p.x < -30 || p.y < -30 || p.x > view.w + 30 || p.y > view.h + 30) return;
    const color = SIDE_COLOR[u.side] || MAP_COLORS.ink;
    ctx.save();
    if (down) ctx.globalAlpha = 0.42;
    const kind = u.kind || "soldier";
    const s = view.s;
    if (kind === "tank") {
      RotRect(ctx, p.x, p.y, Math.max(11, 2.18 * s), Math.max(18, 5.75 * s), u.yawDeg, color);
      // 炮管
      const a = CanvasAngle(u.yawDeg);
      const L = Math.max(13, 4.2 * s);
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + Math.cos(a) * L, p.y + Math.sin(a) * L);
      ctx.lineWidth = 2.5; ctx.strokeStyle = Css(MAP_COLORS.ink); ctx.stroke();
    } else if (kind === "litter" || kind === "cart") {
      const wM = kind === "litter" ? 0.7 : 1.6, lM = kind === "litter" ? 2.1 : 3.2;
      RotRect(ctx, p.x, p.y, Math.max(5, wM * s), Math.max(10, lM * s), u.yawDeg, MAP_COLORS.friend);
    } else if (u.side === "ija") {
      Triangle(ctx, p.x, p.y, (kind === "officer" ? 6.6 : 5.6) * glyph, u.yawDeg, color);
    } else {
      const r = (kind === "child" || kind === "animal" ? 2.8 : kind === "officer" ? 4.4 : 3.8) * glyph;
      Dot(ctx, p.x, p.y, r, u.yawDeg, color, u.side === "nra");
    }
    ctx.restore();
    if (u.guess) {
      ctx.save();
      ctx.setLineDash([2.5, 2.5]);
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = Css(color, 0.95);
      ctx.beginPath(); ctx.arc(p.x, p.y, 9 * glyph, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
  }

  PaintLabels(ctx, view, units) {
    const placed = [];
    const Fits = (r) => r.x >= 2 && r.y >= 2 && r.x + r.w <= view.w - 2 && r.y + r.h <= view.h - 2
      && !placed.some(o => !(r.x > o.x + o.w || r.x + r.w < o.x || r.y > o.y + o.h || r.y + r.h < o.y));
    const Label = (text, x, y, color, weight = 600) => {
      if (!text) return;
      ctx.font = `${weight} 11px ${FONT_STACK}`;
      const tw = ctx.measureText(text).width;
      const tries = [[10, -6], [-10 - tw, -6], [10, 8], [-10 - tw, 8], [-tw / 2, -20], [-tw / 2, 16]];
      for (const [ox, oy] of tries) {
        const r = { x: x + ox - 2, y: y + oy - 7, w: tw + 4, h: 14 };
        if (!Fits(r)) continue;
        placed.push(r);
        ctx.lineWidth = 3;
        ctx.lineJoin = "round";
        ctx.strokeStyle = Css(MAP_COLORS.paper, 0.92);
        ctx.strokeText(text, x + ox, y + oy);
        ctx.fillStyle = color;
        ctx.fillText(text, x + ox, y + oy);
        return;
      }
    };
    ctx.save();
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    // 先给关键帧点与玩家占位，标签不压它们
    for (const kf of this.keyframes) {
      const p = Project(view, kf.x, kf.z);
      placed.push({ x: p.x - 10, y: p.y - 10, w: 20, h: 20 });
      if (kf.i === this.kfIndex) placed.push({ x: p.x - 13, y: p.y - 24, w: 50, h: 38 });
    }
    const next = this.dynamic.next;
    if (next?.text) { const p = Project(view, next.x, next.z); Label(next.text, p.x, p.y, Css(MAP_COLORS.ink), 700); }
    for (const poi of this.dynamic.pois) {
      if (!poi.name || !Finite(poi.x)) continue;
      const p = Project(view, poi.x, poi.z);
      Label(poi.name, p.x, p.y, Css(MAP_COLORS.ink));
    }
    for (const u of units) {
      if (!u.name || !Finite(u.x)) continue;
      const p = Project(view, u.x, u.z);
      Label(u.name, p.x, p.y, Css(SIDE_COLOR[u.side] || MAP_COLORS.ink), 600);
    }
    ctx.restore();
  }

  PaintChrome(ctx, view) {
    // 比例尺（左下）
    const target = 110 / view.s;
    const len = NiceLength(target * 0.8);
    const px = len * view.s;
    const x0 = 16, y0 = view.h - 18;
    ctx.save();
    ctx.fillStyle = "rgba(14,16,17,0.78)";
    ctx.fillRect(x0 - 8, y0 - 18, px + 58, 28);
    ctx.strokeStyle = "#d6d9d1";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x0, y0 - 4); ctx.lineTo(x0, y0); ctx.lineTo(x0 + px, y0); ctx.lineTo(x0 + px, y0 - 4);
    ctx.stroke();
    ctx.fillStyle = "#d6d9d1";
    ctx.font = `500 11px ${MONO_STACK}`;
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillText(`${len} m`, x0 + px + 8, y0 - 3);
    // 光标坐标（右下）：写配置时直接抄
    if (this.cursor) {
      const text = `x ${this.cursor.x.toFixed(1)}   z ${this.cursor.z.toFixed(1)}`;
      ctx.font = `500 11px ${MONO_STACK}`;
      const tw = ctx.measureText(text).width;
      const bx = view.w - tw - 24, by = view.h - 36;
      ctx.fillStyle = "rgba(14,16,17,0.78)";
      ctx.fillRect(bx, by, tw + 16, 26);
      ctx.fillStyle = "#d6d9d1";
      ctx.fillText(text, bx + 8, by + 13);
    }
    ctx.restore();
  }

  Dispose() {
    this.disposed = true;
    this.CancelBake();
    this.DetachFull();
    this.cache.clear();
    this.baked = null;
    this.items = [];
  }
}

// ---------------------------------------------------------------------------
// 画布与图元

function PrepareCanvas(canvas) {
  const dpr = Math.min(2, (typeof window !== "undefined" && window.devicePixelRatio) || 1);
  let w = canvas.clientWidth, h = canvas.clientHeight;
  if (!w || !h) return { ctx: null };
  const bw = Math.round(w * dpr), bh = Math.round(h * dpr);
  if (canvas.width !== bw || canvas.height !== bh) { canvas.width = bw; canvas.height = bh; }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  return { ctx, w, h, dpr };
}

function Project(view, x, z) {
  return { x: (x - view.cx) * view.s + view.w / 2, y: (z - view.cz) * view.s + view.h / 2 };
}

/** 把烘好的图（世界边界 b、分辨率 bs px/m）按视图贴上去：只取看得见的那块源矩形。 */
function BlitBaked(ctx, img, bs, b, view) {
  const vx0 = view.cx - view.w / 2 / view.s, vz0 = view.cz - view.h / 2 / view.s;
  const vx1 = view.cx + view.w / 2 / view.s, vz1 = view.cz + view.h / 2 / view.s;
  const x0 = Math.max(vx0, b.minX), x1 = Math.min(vx1, b.maxX);
  const z0 = Math.max(vz0, b.minZ), z1 = Math.min(vz1, b.maxZ);
  if (x1 <= x0 || z1 <= z0) return;
  const sx = (x0 - b.minX) * bs, sy = (z0 - b.minZ) * bs;
  const sw = Math.min(img.width - sx, (x1 - x0) * bs), sh = Math.min(img.height - sy, (z1 - z0) * bs);
  if (sw <= 0 || sh <= 0) return;
  const d0 = Project(view, x0, z0);
  ctx.drawImage(img, sx, sy, sw, sh, d0.x, d0.y, (sw / bs) * view.s, (sh / bs) * view.s);
}

/** 在当前变换（世界米）下画块；items 已按 STYLE_ORDER 排好。 */
function DrawItems(ctx, items, pxPerM) {
  const fills = {
    water: Css(MAP_COLORS.water),
    roof: Css(MAP_COLORS.roof),
    foliage: Css(MAP_COLORS.foliage, 0.72),
    low: Css(MAP_COLORS.low),
    wall: Css(MAP_COLORS.wall),
  };
  let style = null;
  const Flush = () => { if (style) ctx.fill(); };
  for (const item of items) {
    if (item.style !== style) { Flush(); style = item.style; ctx.beginPath(); ctx.fillStyle = fills[style]; }
    if (item.style === "foliage") {
      ctx.moveTo(item.x + item.r, item.z);
      ctx.arc(item.x, item.z, item.r, 0, Math.PI * 2);
    } else {
      const c = item.corners;
      ctx.moveTo(c[0][0], c[0][1]); ctx.lineTo(c[1][0], c[1][1]); ctx.lineTo(c[2][0], c[2][1]); ctx.lineTo(c[3][0], c[3][1]); ctx.closePath();
    }
  }
  Flush();
  // 屋面压一道细边，房子的轮廓才读得出
  if (pxPerM >= 1) {
    ctx.beginPath();
    for (const item of items) {
      if (item.style !== "roof") continue;
      const c = item.corners;
      ctx.moveTo(c[0][0], c[0][1]); ctx.lineTo(c[1][0], c[1][1]); ctx.lineTo(c[2][0], c[2][1]); ctx.lineTo(c[3][0], c[3][1]); ctx.closePath();
    }
    ctx.lineWidth = 1 / pxPerM;
    ctx.strokeStyle = Css(MAP_COLORS.ink, 0.28);
    ctx.stroke();
  }
}

function StrokeLines(ctx, lines) {
  ctx.beginPath();
  for (const line of lines) line.forEach((p, i) => (i ? ctx.lineTo(p.x, p.z) : ctx.moveTo(p.x, p.z)));
  ctx.stroke();
}

function DrawWays(ctx, ways, pxPerM) {
  if (!ways) return;
  ctx.save();
  ctx.lineJoin = "round"; ctx.lineCap = "round";
  if (ways.trenches.length) {
    ctx.strokeStyle = Css(MAP_COLORS.cut, 0.55);
    ctx.lineWidth = 1.6;
    StrokeLines(ctx, ways.trenches);
  }
  if (ways.roads.length) {
    ctx.strokeStyle = Css(MAP_COLORS.ink, 0.38);
    ctx.lineWidth = 4.4;
    StrokeLines(ctx, ways.roads);
    ctx.strokeStyle = Css(MAP_COLORS.road);
    ctx.lineWidth = Math.max(3.4, 4.4 - 2 / pxPerM);
    StrokeLines(ctx, ways.roads);
  }
  if (ways.rails.length) {
    ctx.lineCap = "butt";
    ctx.strokeStyle = Css(MAP_COLORS.ink, 0.8);
    ctx.lineWidth = 1.5;
    StrokeLines(ctx, ways.rails);
    ctx.strokeStyle = Css(MAP_COLORS.paper);
    ctx.lineWidth = 0.7;
    ctx.setLineDash([3, 3]);
    StrokeLines(ctx, ways.rails);
    ctx.setLineDash([]);
  }
  ctx.restore();
}

function Triangle(ctx, x, y, size, yawDeg, rgb) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-YawRad(yawDeg));
  ctx.beginPath();
  ctx.moveTo(0, -size * 1.25);
  ctx.lineTo(size, size * 0.85);
  ctx.lineTo(-size, size * 0.85);
  ctx.closePath();
  ctx.lineJoin = "round";
  ctx.lineWidth = 2.4;
  ctx.strokeStyle = Css(MAP_COLORS.paper);
  ctx.stroke();
  ctx.fillStyle = Css(rgb);
  ctx.fill();
  ctx.restore();
}

function Dot(ctx, x, y, r, yawDeg, rgb, tick) {
  if (tick) {
    const a = CanvasAngle(yawDeg);
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(a) * (r - 1), y + Math.sin(a) * (r - 1));
    ctx.lineTo(x + Math.cos(a) * (r + 4), y + Math.sin(a) * (r + 4));
    ctx.lineCap = "round";
    ctx.lineWidth = 3.6;
    ctx.strokeStyle = Css(MAP_COLORS.paper);
    ctx.stroke();
    ctx.lineWidth = 1.8;
    ctx.strokeStyle = Css(rgb);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.lineWidth = 2.2;
  ctx.strokeStyle = Css(MAP_COLORS.paper);
  ctx.stroke();
  ctx.fillStyle = Css(rgb);
  ctx.fill();
}

function RotRect(ctx, x, y, wPx, lPx, yawDeg, rgb) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-YawRad(yawDeg));
  ctx.beginPath();
  ctx.rect(-wPx / 2, -lPx / 2, wPx, lPx);
  ctx.lineWidth = 2.2;
  ctx.strokeStyle = Css(MAP_COLORS.paper);
  ctx.stroke();
  ctx.fillStyle = Css(rgb);
  ctx.fill();
  ctx.restore();
}

function Diamond(ctx, x, y, r, rgb) {
  ctx.beginPath();
  ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y); ctx.closePath();
  ctx.lineWidth = 3;
  ctx.lineJoin = "miter";
  ctx.strokeStyle = Css(MAP_COLORS.ink, 0.85);
  ctx.stroke();
  ctx.fillStyle = Css(rgb);
  ctx.fill();
}

function PlayerArrow(ctx, x, y, scale, yawDeg) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-YawRad(yawDeg));
  ctx.scale(scale, scale);
  ctx.beginPath();
  ctx.moveTo(0, -11);
  ctx.lineTo(6.6, 6);
  ctx.lineTo(0, 2.4);
  ctx.lineTo(-6.6, 6);
  ctx.closePath();
  ctx.lineJoin = "round";
  ctx.lineWidth = 3;
  ctx.strokeStyle = Css(MAP_COLORS.ink);
  ctx.stroke();
  ctx.fillStyle = Css(MAP_COLORS.gold);
  ctx.fill();
  ctx.restore();
}

function DashedArrow(ctx, pts, color, width) {
  if (pts.length < 2) return;
  ctx.save();
  ctx.setLineDash([4, 3]);
  ctx.lineWidth = width;
  ctx.strokeStyle = color;
  ctx.lineCap = "round";
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.stroke();
  ctx.setLineDash([]);
  const a = pts[pts.length - 2], b = pts[pts.length - 1];
  const ang = Math.atan2(b.y - a.y, b.x - a.x);
  ctx.translate(b.x, b.y);
  ctx.rotate(ang);
  ctx.beginPath();
  ctx.moveTo(1, 0); ctx.lineTo(-6.5, -4); ctx.lineTo(-6.5, 4); ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

/** 小地图上目标在视野外时，贴边画一枚指向它的金色小箭头。 */
function EdgePointer(ctx, view, t, from) {
  const pad = 9;
  if (t.x >= pad && t.y >= pad && t.x <= view.w - pad && t.y <= view.h - pad) return;
  const cx = from ? from.x : view.w / 2, cy = from ? from.y : view.h / 2;
  const dx = t.x - cx, dy = t.y - cy;
  const k = Math.min(
    dx > 0 ? (view.w - pad - cx) / dx : dx < 0 ? (pad - cx) / dx : Infinity,
    dy > 0 ? (view.h - pad - cy) / dy : dy < 0 ? (pad - cy) / dy : Infinity,
  );
  if (!Finite(k)) return;
  const x = cx + dx * k, y = cy + dy * k;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(Math.atan2(dy, dx));
  ctx.beginPath();
  ctx.moveTo(6, 0); ctx.lineTo(-5, -5.5); ctx.lineTo(-2.5, 0); ctx.lineTo(-5, 5.5); ctx.closePath();
  ctx.lineWidth = 2.6; ctx.lineJoin = "round";
  ctx.strokeStyle = Css(MAP_COLORS.ink); ctx.stroke();
  ctx.fillStyle = Css(MAP_COLORS.gold); ctx.fill();
  ctx.restore();
}
