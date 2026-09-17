// ===========================================================================
// Script_EditorOrchestrationMap.mjs —— 关卡编排工作台的俯视图（canvas 2D，零 three）
//
// 契约见分包文档 §7。这一层只负责「把编排模型画成一张真实比例的俯视图，
// 并把鼠标动作翻译回世界坐标」，不碰任何运行时状态、不进 three 场景。
//
// 绘制口径：**北在上**（Z 小在上）、X 向右。一米就是一米 —— 面板上的距离
// 能直接拿尺子量，别在这里引入任何「示意图」式的挪位。
//
// 为什么底图要缓存：`layout.SampleGroundColor` 里有壕沟网格与道路走廊的逐点
// 采样，整张图约四万格。每帧重采一次的话拖动会掉到个位数帧率，所以 2 m 一格
// 烘到一张离屏 canvas，之后只 drawImage —— 模型换了才重烘。
//
// 容错口径：模型字段缺了就**不画那一层**，不抛错。工作台要在「P1 的表还没长
// 齐」「不在第一关」这些半成品状态下照样打得开。
// ===========================================================================

import { PhaseLayout } from "./Script_MissionOrchestration.mjs";

// ---------------------------------------------------------------------------
// 调色板。导出是给测试**数像素**用的：光看 visible 会漏掉「画上了却 1 px 都
// 看不见」，所以测试按这里的精确 RGB 去数实心填充的像素数（仓库旧账：刺刀装上
// 了却一个像素都看不见，16 项全绿照样漏过）。改颜色就等于改测试的 oracle。
// ---------------------------------------------------------------------------
export const MAP_COLORS = Object.freeze({
  backdrop: [24, 26, 25],
  groundTint: 0.72,          // 地表色本身接近白，压暗一档才压得住上面的标记
  road: [214, 206, 186],
  railway: [74, 74, 70],
  sleeper: [96, 88, 74],
  trench: [120, 104, 84],
  blockFallback: [193, 189, 177],
  blockEdge: [58, 60, 56],
  anchor: [40, 54, 62],
  route: [24, 200, 222],
  tactic: [210, 96, 58],
  assault: [232, 150, 90],
  zone: [232, 163, 61],
  friendly: [63, 116, 214],
  enemyPending: [142, 142, 138],
  enemyStaged: [142, 47, 38],
  enemyDormant: [166, 99, 92],
  enemyActive: [255, 74, 58],
  enemyCleared: [128, 128, 124],
  player: [255, 214, 64],
  liveEnemy: [255, 138, 92],
  liveDead: [118, 118, 116],
  guide: [120, 235, 160],
  sketch: [138, 74, 200],
  note: [152, 120, 192],
  select: [255, 211, 77],
  text: [24, 26, 25],
  textLight: [242, 240, 232],
  handle: [30, 34, 39],      // 组把手 / 拍把手的芯片底色：不透明，测试能精确数
});

const FONT = '11px "Segoe UI", system-ui, sans-serif';
const FONT_SMALL = '10px "Segoe UI", system-ui, sans-serif';
const GROUND_STEP_M = 2;
// 把手芯片：成员质心右上方一枚小标签。偏移要大过成员点的拾取半径（7 px），
// 否则点人会点到把手上 —— 「把手不许遮住成员」是这枚芯片的硬条件。
const CHIP_PAD = 4;
const CHIP_H = 14;
const CHIP_DX = 10;
const CHIP_DY = -15;
const CHIP_HIT_R = 11;
const TOOLS = new Set(["select", "pan", "circle", "arrow", "path", "label", "move"]);
const DEFAULT_LAYERS = Object.freeze({
  terrain: true, blocks: true, trenches: true, roads: true, anchors: true,
  routes: true, zones: true, friendlies: true, encounters: true, tactics: true,
  live: true, notes: true, labels: true,
});

function Css(rgb, alpha = 1) {
  if (!rgb) return "rgba(0,0,0,0)";
  return alpha >= 1
    ? `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`
    : `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`;
}
function HexCss(value, fallback) {
  if (!Number.isFinite(value)) return fallback;
  const n = value | 0;
  return `rgb(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255})`;
}
const Clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const Byte = (v) => Clamp(Math.round(v * 255), 0, 255);

/** 折线点归一：既吃 `{x,z}` 也吃 `[x,z]`（railway.points 就是后者）。 */
function Points(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const p of list) {
    if (Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1])) {
      out.push({ x: p[0], z: p[1] });
    } else if (p && Number.isFinite(p.x) && Number.isFinite(p.z)) {
      out.push({ x: p.x, z: p.z });
    }
  }
  return out;
}

export class OrchestrationMap {
  constructor(canvas, { model = null } = {}) {
    this.canvas = canvas;
    this.ctx = canvas ? canvas.getContext("2d") : null;
    this.disposed = false;

    this.model = null;
    this.phaseNumber = 1;
    this.phaseLayout = null;
    this.live = null;
    this.selection = null;
    this.hover = null;
    this.layers = { ...DEFAULT_LAYERS };
    this.sketch = [];
    this.notes = [];
    this.tool = "select";

    this.dpr = 1;
    this.cssWidth = 800;
    this.cssHeight = 600;
    this.view = { cx: 0, cz: 0, scale: 2 };   // scale = 像素 / 米
    // 用户自己拖过 / 滚过之后视野算「手动」：跟随实时换阶段时不许再抢过去重新框景。
    // 两颗「适配」按钮（以及任何一次 Fit*）把它复位回「自动」。
    this.viewTouched = false;
    this.ground = null;
    this.picks = [];
    this.handles = [];
    this.drag = null;
    this.pathPoints = null;
    this.spaceDown = false;
    this.pointer = null;

    this.callbacks = { select: [], hover: [], sketch: [], move: [], label: [] };

    this.handlers = {
      down: (e) => this.OnDown(e),
      move: (e) => this.OnMove(e),
      up: (e) => this.OnUp(e),
      leave: () => { this.pointer = null; this.SetHover(null); },
      wheel: (e) => this.OnWheel(e),
      dbl: (e) => this.OnDoubleClick(e),
      menu: (e) => e.preventDefault(),
      winMove: (e) => { if (e.target !== this.canvas) this.OnMove(e); },
      winUp: (e) => { if (e.target !== this.canvas) this.OnUp(e); },
      keyDown: (e) => { if (e.code === "Space" || e.key === " ") this.spaceDown = true; },
      keyUp: (e) => { if (e.code === "Space" || e.key === " ") this.spaceDown = false; },
    };
    if (canvas) {
      canvas.addEventListener("mousedown", this.handlers.down);
      canvas.addEventListener("mousemove", this.handlers.move);
      canvas.addEventListener("mouseup", this.handlers.up);
      canvas.addEventListener("mouseleave", this.handlers.leave);
      canvas.addEventListener("wheel", this.handlers.wheel, { passive: false });
      canvas.addEventListener("dblclick", this.handlers.dbl);
      canvas.addEventListener("contextmenu", this.handlers.menu);
      const win = canvas.ownerDocument?.defaultView || globalThis;
      this.win = win;
      win.addEventListener("mousemove", this.handlers.winMove);
      win.addEventListener("mouseup", this.handlers.winUp);
      win.addEventListener("keydown", this.handlers.keyDown);
      win.addEventListener("keyup", this.handlers.keyUp);
    }

    this.Resize();
    if (model) this.SetModel(model);
  }

  // -------------------------------------------------------------------------
  // 输入口
  // -------------------------------------------------------------------------
  SetModel(model) {
    this.model = model || null;
    this.ground = null;
    this.SetPhase(this.phaseNumber);
    this.FitBounds();
    return this;
  }

  /** 阶段状态从 P1 的 `PhaseLayout` 取；它还没长齐时退回一份保守推断。 */
  SetPhase(n) {
    const number = Number.isFinite(n) ? Math.round(n) : 1;
    this.phaseNumber = number;
    let layout = null;
    if (this.model) {
      try {
        if (typeof PhaseLayout === "function") layout = PhaseLayout(this.model, number);
      } catch (error) {
        layout = null;
      }
      if (!layout || !Array.isArray(layout.encounters)) layout = this.FallbackPhaseLayout(number);
    }
    this.phaseLayout = layout;
    this.Redraw();
    return this;
  }

  /** PhaseLayout 缺席时的兜底：只按 encounter.phaseNumber 分「还没到 / 已经到」。 */
  FallbackPhaseLayout(number) {
    const encounters = [];
    for (const encounter of this.model?.encounters || []) {
      const start = Number.isFinite(encounter.phaseNumber) ? encounter.phaseNumber : 1;
      let state = number < start ? "pending" : "spawned";
      if (state !== "pending" && encounter.dormant) state = "dormant";
      if (Number.isFinite(encounter.clearedAtPhase) && number > encounter.clearedAtPhase) state = "cleared";
      encounters.push({ ...encounter, state });
    }
    return {
      encounters,
      zones: this.model?.zones || [],
      routes: Object.keys(this.model?.routes || {}),
      friendlies: this.model?.friendlies || [],
      steps: (this.model?.phases || []).find((p) => p.number === number)?.steps || [],
    };
  }

  SetLive(live) { this.live = live || null; this.Redraw(); return this; }
  SetSelection(sel) { this.selection = sel || null; this.Redraw(); return this; }
  SetHover(sel) {
    const before = this.hover;
    this.hover = sel || null;
    if (SameSel(before, this.hover)) return this;
    this.Emit("hover", this.hover);
    this.Redraw();
    return this;
  }
  SetLayers(layers) { Object.assign(this.layers, layers || {}); this.Redraw(); return this; }
  SetSketch(shapes) { this.sketch = Array.isArray(shapes) ? shapes.slice() : []; this.Redraw(); return this; }
  SetNotes(notes) { this.notes = Array.isArray(notes) ? notes.slice() : []; this.Redraw(); return this; }
  SetTool(tool) {
    this.tool = TOOLS.has(tool) ? tool : "select";
    this.drag = null;
    this.pathPoints = null;
    this.Redraw();
    return this;
  }

  onSelect(cb) { if (typeof cb === "function") this.callbacks.select.push(cb); return this; }
  onHover(cb) { if (typeof cb === "function") this.callbacks.hover.push(cb); return this; }
  onSketch(cb) { if (typeof cb === "function") this.callbacks.sketch.push(cb); return this; }
  onMove(cb) { if (typeof cb === "function") this.callbacks.move.push(cb); return this; }
  /**
   * 标注工具落点。宿主接了这个回调就由宿主自己弹输入框（工作台是在弹窗 DOM 里
   * 就地长一个小输入框），没人接才退回「直接产出一枚空文字的 label 形状」——
   * 这样单跑俯视图模块的测试与旧用法都不受影响。
   */
  onLabel(cb) { if (typeof cb === "function") this.callbacks.label.push(cb); return this; }
  Emit(name, payload) {
    if (this.disposed) return;
    for (const cb of this.callbacks[name] || []) {
      try { cb(payload); } catch (error) { /* 宿主回调出错不许拖垮绘制 */ }
    }
  }

  // -------------------------------------------------------------------------
  // 坐标
  // -------------------------------------------------------------------------
  Viewport() {
    return { w: this.cssWidth, h: this.cssHeight, scale: this.view.scale, cx: this.view.cx, cz: this.view.cz };
  }
  WorldToScreen(x, z) {
    const v = this.Viewport();
    return { x: (x - v.cx) * v.scale + v.w / 2, y: (z - v.cz) * v.scale + v.h / 2 };
  }
  ScreenToWorld(px, py) {
    const v = this.Viewport();
    return { x: (px - v.w / 2) / v.scale + v.cx, z: (py - v.h / 2) / v.scale + v.cz };
  }
  LocalPoint(event) {
    const rect = this.canvas?.getBoundingClientRect?.();
    if (!rect) return { x: event.clientX || 0, y: event.clientY || 0 };
    return { x: (event.clientX || 0) - rect.left, y: (event.clientY || 0) - rect.top };
  }

  FitBounds() {
    const b = this.model?.bounds;
    if (!b || !Number.isFinite(b.minX)) { this.Redraw(); return this; }
    this.FitRegion(b);
    return this;
  }
  FitRegion(region, padding = 24) {
    const w = Math.max(1, region.maxX - region.minX);
    const d = Math.max(1, region.maxZ - region.minZ);
    const scale = Math.min((this.cssWidth - padding * 2) / w, (this.cssHeight - padding * 2) / d);
    this.view.scale = Math.max(0.05, scale);
    this.view.cx = (region.minX + region.maxX) / 2;
    this.view.cz = (region.minZ + region.maxZ) / 2;
    this.viewTouched = false;         // 框过景 = 回到「自动」，跟随实时可以接手了
    this.Redraw();
    return this;
  }
  FitPhase(n) {
    if (Number.isFinite(n) && n !== this.phaseNumber) this.SetPhase(n);
    const box = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
    const Add = (x, z) => {
      if (!Number.isFinite(x) || !Number.isFinite(z)) return;
      if (x < box.minX) box.minX = x; if (x > box.maxX) box.maxX = x;
      if (z < box.minZ) box.minZ = z; if (z > box.maxZ) box.maxZ = z;
    };
    // 只框「这一阶段正在演的那几个人」。两类东西会把框子撑回整关视野，都要挡掉：
    // 已清除的组（第 12 阶段有十一个，遍布全关），以及不属于任何阶段的常驻防御点
    // （phaseNumber 为 null，从车站一直排到南边）。它们都不是这一阶段的戏。
    for (const encounter of this.phaseLayout?.encounters || []) {
      if (encounter.state === "pending" || encounter.state === "cleared") continue;
      for (const member of encounter.members || []) Add(member.x, member.z);
    }
    if (box.minX > box.maxX) {
      // 这一阶段场上一个敌人都没有（第 1/2/11 阶段）：退而框本阶段的友军。
      for (const friendly of this.phaseLayout?.friendlies || []) {
        if (friendly.phaseNumber === this.phaseNumber) Add(friendly.x, friendly.z);
      }
    }
    if (box.minX > box.maxX) return this.FitBounds();
    const pad = 30;
    return this.FitRegion({
      minX: box.minX - pad, maxX: box.maxX + pad, minZ: box.minZ - pad, maxZ: box.maxZ + pad,
    });
  }
  /** 跳到某一点（「定位」批注用）。这是用户点名要看的地方，算手动视野。 */
  ZoomTo(point, radiusM = 40) {
    if (!point || !Number.isFinite(point.x)) return this;
    this.view.cx = point.x;
    this.view.cz = point.z;
    const r = Math.max(1, radiusM);
    this.view.scale = Math.max(0.05, Math.min(this.cssWidth, this.cssHeight) / (2 * r));
    this.viewTouched = true;
    this.Redraw();
    return this;
  }

  Resize() {
    if (!this.canvas) return this;
    const win = this.canvas.ownerDocument?.defaultView || globalThis;
    this.dpr = Math.min(Math.max(win.devicePixelRatio || 1, 1), 2);
    const cssW = this.canvas.clientWidth || this.canvas.width || 800;
    const cssH = this.canvas.clientHeight || this.canvas.height || 600;
    this.cssWidth = Math.max(16, Math.round(cssW));
    this.cssHeight = Math.max(16, Math.round(cssH));
    const pxW = Math.round(this.cssWidth * this.dpr);
    const pxH = Math.round(this.cssHeight * this.dpr);
    if (this.canvas.width !== pxW) this.canvas.width = pxW;
    if (this.canvas.height !== pxH) this.canvas.height = pxH;
    this.Redraw();
    return this;
  }

  // -------------------------------------------------------------------------
  // 底图缓存：2 m 一格烘一次
  // -------------------------------------------------------------------------
  BuildGround() {
    const layout = this.model?.layout;
    const b = this.model?.bounds;
    if (!layout || typeof layout.SampleGroundColor !== "function" || !b || !Number.isFinite(b.minX)) {
      this.ground = null;
      return null;
    }
    const doc = this.canvas?.ownerDocument || globalThis.document;
    if (!doc) { this.ground = null; return null; }
    const cols = Math.max(1, Math.ceil((b.maxX - b.minX) / GROUND_STEP_M));
    const rows = Math.max(1, Math.ceil((b.maxZ - b.minZ) / GROUND_STEP_M));
    const off = doc.createElement("canvas");
    off.width = cols;
    off.height = rows;
    const ctx = off.getContext("2d");
    const image = ctx.createImageData(cols, rows);
    const tint = MAP_COLORS.groundTint;
    const out = [0, 0, 0];
    for (let j = 0; j < rows; j += 1) {
      const z = b.minZ + (j + 0.5) * GROUND_STEP_M;
      for (let i = 0; i < cols; i += 1) {
        const x = b.minX + (i + 0.5) * GROUND_STEP_M;
        let r = 0.5, g = 0.5, bl = 0.5;
        try {
          const sample = layout.SampleGroundColor(x, z, out);
          if (sample && Number.isFinite(sample[0])) { r = sample[0]; g = sample[1]; bl = sample[2]; }
        } catch (error) { /* 采样器不在状态就用中灰，别整层塌掉 */ }
        const k = (j * cols + i) * 4;
        image.data[k] = Byte(r * tint);
        image.data[k + 1] = Byte(g * tint);
        image.data[k + 2] = Byte(bl * tint);
        image.data[k + 3] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);
    this.ground = {
      canvas: off, minX: b.minX, minZ: b.minZ,
      width: cols * GROUND_STEP_M, depth: rows * GROUND_STEP_M,
    };
    return this.ground;
  }

  // -------------------------------------------------------------------------
  // 绘制
  // -------------------------------------------------------------------------
  Redraw() {
    if (this.disposed || !this.ctx) return this;
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.picks = [];
    this.Paint(ctx, this.Viewport(), { picks: this.picks, interactive: true });
    return this;
  }

  /** 把手（组 / 拍）的屏幕中心点；测试与宿主拿它去点、去对位。 */
  HandlePoint(kind, id) {
    const found = this.handles.find((entry) => entry.kind === kind && entry.id === id);
    return found ? { x: found.cx, y: found.cy, w: found.w, h: found.h } : null;
  }

  ToPng({ scale = 1, region = null } = {}) {
    const doc = this.canvas?.ownerDocument || globalThis.document;
    if (!doc) return "";
    const factor = Math.max(0.1, Math.min(scale || 1, 4));
    const w = Math.max(16, Math.round(this.cssWidth * factor));
    const h = Math.max(16, Math.round(this.cssHeight * factor));
    const off = doc.createElement("canvas");
    off.width = w;
    off.height = h;
    const ctx = off.getContext("2d");
    let view;
    if (region && Number.isFinite(region.minX)) {
      const rw = Math.max(1, region.maxX - region.minX);
      const rd = Math.max(1, region.maxZ - region.minZ);
      const s = Math.min((w - 16) / rw, (h - 16) / rd);
      view = { w, h, scale: Math.max(0.05, s), cx: (region.minX + region.maxX) / 2, cz: (region.minZ + region.maxZ) / 2 };
    } else {
      view = { w, h, scale: this.view.scale * factor, cx: this.view.cx, cz: this.view.cz };
    }
    this.Paint(ctx, view, { picks: null, interactive: false });
    return off.toDataURL("image/png");
  }

  Paint(ctx, view, { picks = null, interactive = false } = {}) {
    const Project = (x, z) => ({ x: (x - view.cx) * view.scale + view.w / 2, y: (z - view.cz) * view.scale + view.h / 2 });
    const Push = (sel, px, py, r) => { if (picks) picks.push({ sel, px, py, r }); };
    // 把手先攒着，最后统一画在最上层；出图（ToPng）也照画，标注图上得看得见是哪一组。
    const handles = [];

    ctx.save();
    ctx.fillStyle = Css(MAP_COLORS.backdrop);
    ctx.fillRect(0, 0, view.w, view.h);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.font = FONT;
    ctx.textBaseline = "middle";

    const layout = this.model?.layout || null;
    const L = this.layers;
    // 名字只在拉近到「一米一像素」以上才写。整关视野是 342 × 1001 m，挤进面板后
    // 不到 0.8 px/m —— 二十几个锚点、二十一条路线、二十一个组的名字会糊成一片
    // 黑边，既读不出来，还拿深色描边把它标注的那个标记本身啃掉一半。
    const showLabels = L.labels && view.scale >= 1.1;

    // --- 地表 -------------------------------------------------------------
    if (L.terrain && this.model) {
      const ground = this.ground || this.BuildGround();
      if (ground) {
        const a = Project(ground.minX, ground.minZ);
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(ground.canvas, a.x, a.y, ground.width * view.scale, ground.depth * view.scale);
      }
    }

    // --- 道路 -------------------------------------------------------------
    if (L.roads && layout) {
      for (const road of layout.roads || []) {
        const pts = Points(road.points);
        if (pts.length < 2) continue;
        ctx.strokeStyle = Css(MAP_COLORS.road, 0.55);
        ctx.lineWidth = Math.max(1, (road.width || 4) * view.scale);
        Stroke(ctx, pts, Project);
      }
      // 铁路：路基一条粗线 + 枕木短线，别只画一条线，缩小后分不清是路还是轨
      const rail = Points(layout.railway?.points);
      if (rail.length >= 2) {
        ctx.strokeStyle = Css(MAP_COLORS.railway, 0.9);
        ctx.lineWidth = Math.max(1.5, 3.4 * view.scale);
        Stroke(ctx, rail, Project);
        ctx.strokeStyle = Css(MAP_COLORS.sleeper, 0.9);
        ctx.lineWidth = 1;
        for (let i = 1; i < rail.length; i += 1) {
          const a = rail[i - 1], b = rail[i];
          const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
          const ux = (b.x - a.x) / len, uz = (b.z - a.z) / len;
          const step = Math.max(4, 24 / Math.max(view.scale, 0.05));
          for (let t = 0; t < len; t += step) {
            const p = Project(a.x + ux * t, a.z + uz * t);
            const q = Project(a.x + ux * t - uz * 1.6, a.z + uz * t + ux * 1.6);
            const q2 = Project(a.x + ux * t + uz * 1.6, a.z + uz * t - ux * 1.6);
            ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(q2.x, q2.y); ctx.stroke();
            void p;
          }
        }
      }
    }

    // --- 壕沟中心线 -------------------------------------------------------
    if (L.trenches && layout) {
      for (const segment of layout.trenches || []) {
        const pts = Points(segment.points);
        if (pts.length < 2) continue;
        ctx.strokeStyle = Css(MAP_COLORS.trench, 0.85);
        ctx.lineWidth = Math.max(1.5, (segment.width || 4) * view.scale);
        Stroke(ctx, pts, Project);
      }
    }

    // --- 体块与桥 ---------------------------------------------------------
    if (L.blocks && layout) {
      const colors = layout.semanticColors || {};
      const fallback = Css(MAP_COLORS.blockFallback);
      const structure = HexCss(colors.structure, fallback);
      ctx.lineWidth = 1;
      for (const block of layout.blocks || []) {
        if (!Number.isFinite(block.x) || !Number.isFinite(block.w)) continue;
        const a = Project(block.x - block.w / 2, block.z - block.d / 2);
        const w = Math.max(1, block.w * view.scale);
        const d = Math.max(1, block.d * view.scale);
        ctx.fillStyle = HexCss(colors[block.semantic], structure);
        ctx.fillRect(a.x, a.y, w, d);
        if (w > 4 && d > 4) {
          ctx.strokeStyle = Css(MAP_COLORS.blockEdge, 0.4);
          ctx.strokeRect(a.x, a.y, w, d);
        }
      }
      const bridge = layout.bridge;
      if (bridge && Number.isFinite(bridge.x) && Number.isFinite(bridge.w)) {
        const a = Project(bridge.x - bridge.w / 2, bridge.z - bridge.d / 2);
        ctx.fillStyle = HexCss(colors.structure, structure);
        ctx.fillRect(a.x, a.y, Math.max(2, bridge.w * view.scale), Math.max(2, bridge.d * view.scale));
        ctx.strokeStyle = Css(MAP_COLORS.blockEdge, 0.9);
        ctx.lineWidth = 1.5;
        ctx.strokeRect(a.x, a.y, Math.max(2, bridge.w * view.scale), Math.max(2, bridge.d * view.scale));
      }
    }

    // --- 已存批注的草图（淡色打底，先画，别盖住新画的） -------------------
    if (L.notes) {
      for (const note of this.notes) {
        for (const shape of note?.sketch?.shapes || []) {
          this.PaintShape(ctx, Project, view, shape, Css(MAP_COLORS.note, 0.5), false);
        }
        const target = note?.target;
        if (target && Number.isFinite(target.x) && Number.isFinite(target.z)) {
          const p = Project(target.x, target.z);
          ctx.fillStyle = Css(MAP_COLORS.note, 0.85);
          ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2); ctx.fill();
          Push({ kind: "note", id: note.id, x: target.x, z: target.z }, p.x, p.y, 7);
        }
      }
    }

    // --- 触发圈 / 区域 -----------------------------------------------------
    if (L.zones) {
      const zones = this.phaseLayout?.zones || this.model?.zones || [];
      for (const zone of zones) {
        const color = Css(MAP_COLORS.zone, 0.95);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.2;
        ctx.setLineDash([5, 4]);
        if (Number.isFinite(zone.radiusM) && Number.isFinite(zone.x)) {
          const p = Project(zone.x, zone.z);
          ctx.beginPath();
          ctx.arc(p.x, p.y, Math.max(2, zone.radiusM * view.scale), 0, Math.PI * 2);
          ctx.stroke();
          if (showLabels) Label(ctx, p.x + 4, p.y - 8, zone.fact || zone.id || "", Css(MAP_COLORS.zone));
          Push({ kind: "zone", id: zone.id || zone.fact, x: zone.x, z: zone.z }, p.x, p.y, 8);
        } else if (Number.isFinite(zone.minX)) {
          const a = Project(zone.minX, zone.minZ);
          const b = Project(zone.maxX, zone.maxZ);
          ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
          const cx = (zone.minX + zone.maxX) / 2, cz = (zone.minZ + zone.maxZ) / 2;
          const c = Project(cx, cz);
          Push({ kind: "zone", id: zone.id || zone.fact, x: cx, z: cz }, c.x, c.y, 8);
          // 转运四拍的框：标签做成可点的把手（返回 kind:"beat"），别只是一行描边字。
          // 拍是设计里唯一带时间窗的一段，用户最想点开看的就是它。
          // 登记在区域之后 = 芯片压在区域上面，点芯片拿到的是拍不是那个框。
          if (zone.kind === "beatArea") {
            const beatId = String(zone.id || "").replace(/^beat_/, "");
            const beat = (this.model?.beats || []).find((entry) => entry.id === beatId) || null;
            const text = showLabels && beat
              ? `拍 ${beatId} · ${beat.earliestS}–${beat.latestS} s`
              : `拍 ${beatId}`;
            const chip = ChipBox(ctx, a.x + 2, a.y - 2 + CHIP_DY, text);
            handles.push({ kind: "beat", id: beatId, text, color: MAP_COLORS.zone, ...chip });
            Push({ kind: "beat", id: beatId, x: cx, z: cz }, chip.cx, chip.cy, CHIP_HIT_R);
          } else if (showLabels) {
            Label(ctx, a.x + 3, a.y - 7, zone.fact || zone.id || "", Css(MAP_COLORS.zone));
          }
        }
        ctx.setLineDash([]);
      }
    }

    // --- 设计路线 ---------------------------------------------------------
    if (L.routes && this.model?.routes) {
      const names = Array.isArray(this.phaseLayout?.routes) && this.phaseLayout.routes.length
        ? this.phaseLayout.routes
        : Object.keys(this.model.routes);
      for (const name of names) {
        const pts = Points(this.model.routes[name]);
        if (pts.length < 2) continue;
        const color = Css(MAP_COLORS.route);
        DirectedPath(ctx, pts, Project, color, 2, 7);
        const mid = pts[Math.floor(pts.length / 2)];
        const p = Project(mid.x, mid.z);
        if (showLabels) Label(ctx, p.x + 6, p.y, name, color);
        Push({ kind: "route", id: name, x: mid.x, z: mid.z }, p.x, p.y, 6);
      }
    }

    // --- 锚点 -------------------------------------------------------------
    if (L.anchors && this.model?.anchors) {
      ctx.lineWidth = 1.2;
      for (const [id, point] of Object.entries(this.model.anchors)) {
        if (!point || !Number.isFinite(point.x)) continue;
        const p = Project(point.x, point.z);
        ctx.strokeStyle = Css(MAP_COLORS.anchor);
        ctx.beginPath();
        ctx.moveTo(p.x - 4, p.y); ctx.lineTo(p.x + 4, p.y);
        ctx.moveTo(p.x, p.y - 4); ctx.lineTo(p.x, p.y + 4);
        ctx.stroke();
        if (showLabels) Label(ctx, p.x + 6, p.y, id, Css(MAP_COLORS.anchor));
        Push({ kind: "anchor", id, x: point.x, z: point.z }, p.x, p.y, 6);
      }
    }

    // --- 友军 -------------------------------------------------------------
    if (L.friendlies) {
      const list = this.phaseLayout?.friendlies || this.model?.friendlies || [];
      ctx.fillStyle = Css(MAP_COLORS.friendly);
      for (const friendly of list) {
        if (!Number.isFinite(friendly.x)) continue;
        const p = Project(friendly.x, friendly.z);
        ctx.beginPath(); ctx.arc(p.x, p.y, 3.2, 0, Math.PI * 2); ctx.fill();
        Push({ kind: "friendly", id: friendly.id, x: friendly.x, z: friendly.z }, p.x, p.y, 6);
      }
    }

    // --- 敌人（本阶段状态上色） -------------------------------------------
    if (L.encounters) {
      // 先登记组把手，再登记成员。拾取是「后登记的压在上面」，这个顺序保证
      // 点到人身上拿到的永远是人 —— 把手只在没人的空处才赢。
      // 已清除的组不给把手：第 12 阶段有十一个这样的组，遍布全关，
      // 它们的芯片会把还在演的那几组盖掉。灰叉还在，悬停照样报得出是谁。
      for (const encounter of this.phaseLayout?.encounters || []) {
        const state = encounter.state || "spawned";
        if (state === "cleared") continue;
        const centre = Centroid(encounter.members);
        if (!centre) continue;
        const p = Project(centre.x, centre.z);
        const text = showLabels ? `${encounter.id} · ${StateText(state)}` : encounter.id;
        const chip = ChipBox(ctx, p.x + CHIP_DX, p.y + CHIP_DY, text);
        handles.push({ kind: "encounter", id: encounter.id, text, color: StateColor(state), ...chip });
        Push({ kind: "encounter", id: encounter.id, x: centre.x, z: centre.z }, chip.cx, chip.cy, CHIP_HIT_R);
      }
    }

    // --- 把手芯片（组 / 拍） -----------------------------------------------
    // 画在成员**下面**：芯片是不透明的，缩到整关视野时一枚芯片能把它标的那几个
    // 人整个盖掉（「画上了却一个像素都验不到」的老毛病，这次是反过来把别人啃了）。
    // 压在下面也与拾取口径一致 —— 点到人拿到的永远是人。
    this.PaintHandles(ctx, handles);

    if (L.encounters) {
      for (const encounter of this.phaseLayout?.encounters || []) {
        const state = encounter.state || "spawned";
        for (const member of encounter.members || []) {
          if (!Number.isFinite(member.x)) continue;
          const p = Project(member.x, member.z);
          if (L.tactics) this.PaintTactic(ctx, Project, member, p, state);
          this.PaintMember(ctx, p, member, state);
          Push({ kind: "member", id: member.id, encounterId: encounter.id, x: member.x, z: member.z }, p.x, p.y, 7);
        }
      }
    }

    // --- 实机层 -----------------------------------------------------------
    if (L.live && this.live) this.PaintLive(ctx, Project, Push);
    if (interactive) this.handles = handles;

    // --- 草图（当前草稿 + 正在拖的那一个） --------------------------------
    for (const shape of this.sketch) {
      this.PaintShape(ctx, Project, view, shape, Css(MAP_COLORS.sketch), true);
    }
    if (interactive) this.PaintPreview(ctx, Project, view);

    // --- 选中描亮 / 悬停 tooltip ------------------------------------------
    if (this.selection) this.PaintHighlight(ctx, Project, this.selection);
    if (interactive && this.hover && this.pointer) {
      this.PaintTooltip(ctx, view, this.hover);
    }
    ctx.restore();
  }

  /**
   * 组把手 / 拍把手：一枚不透明的小芯片。不透明是有意的 ——
   * 半透明底在这张图上会和地表混成一片，既读不出字，也数不出一个精确像素。
   */
  PaintHandles(ctx, handles) {
    const sel = this.selection;
    for (const handle of handles) {
      const picked = sel && sel.kind === handle.kind && sel.id === handle.id;
      ctx.fillStyle = Css(MAP_COLORS.handle);
      ctx.fillRect(handle.x, handle.y, handle.w, handle.h);
      ctx.strokeStyle = Css(picked ? MAP_COLORS.select : handle.color);
      ctx.lineWidth = picked ? 2 : 1;
      ctx.strokeRect(handle.x + 0.5, handle.y + 0.5, handle.w - 1, handle.h - 1);
      ctx.font = FONT_SMALL;
      ctx.fillStyle = Css(picked ? MAP_COLORS.select : handle.color);
      ctx.fillText(handle.text, handle.x + CHIP_PAD, handle.cy);
      ctx.font = FONT;
    }
  }

  PaintMember(ctx, p, member, state) {
    const color = StateColor(state);
    const filled = state !== "pending" && state !== "cleared";
    ctx.lineWidth = 1.4;
    ctx.globalAlpha = state === "dormant" ? 0.55 : 1;
    ctx.beginPath();
    if (member.weapon === "Type11" || member.weapon === "MachineGun") {
      // 机枪：三角形，尖端朝北，缩小到整张图也还认得出「这儿有挺机枪」
      ctx.moveTo(p.x, p.y - 5.5); ctx.lineTo(p.x + 5, p.y + 4); ctx.lineTo(p.x - 5, p.y + 4); ctx.closePath();
    } else if (member.hold) {
      ctx.rect(p.x - 4, p.y - 4, 8, 8);
    } else {
      ctx.arc(p.x, p.y, 4.2, 0, Math.PI * 2);
    }
    if (filled) { ctx.fillStyle = Css(color); ctx.fill(); }
    ctx.strokeStyle = Css(color);
    ctx.stroke();
    if (state === "cleared") {
      ctx.beginPath();
      ctx.moveTo(p.x - 5, p.y - 5); ctx.lineTo(p.x + 5, p.y + 5);
      ctx.moveTo(p.x + 5, p.y - 5); ctx.lineTo(p.x - 5, p.y + 5);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    if (!filled || state === "dormant") {
      // 空心圈（pending）和半透明的休眠体，中间都再点一颗**不透明**的芯。
      // 看着是「位置已知、人还没到／还没醒」；同时给测试一块精确颜色去数 ——
      // 1.4 px 的描边和 0.55 的半透明在画布上全是混出来的中间色，一个精确像素
      // 都数不出来，而「画上了却一个像素都验不到」正是这个仓库栽过的跟头。
      ctx.fillStyle = Css(color);
      ctx.beginPath(); ctx.arc(p.x, p.y, 1.8, 0, Math.PI * 2); ctx.fill();
    }
  }

  PaintTactic(ctx, Project, member, origin, state) {
    const tactic = member.tactic;
    const dim = state === "pending" ? 0.45 : 1;
    if (tactic && Array.isArray(tactic.points) && tactic.points.length) {
      const pts = [{ x: member.x, z: member.z }, ...Points(tactic.points)];
      DirectedPath(ctx, pts, Project, Css(MAP_COLORS.tactic, dim), 1.4, 6);
      if (tactic.near && Number.isFinite(tactic.near.x)) {
        const p = Project(tactic.near.x, tactic.near.z);
        ctx.strokeStyle = Css(MAP_COLORS.tactic, dim);
        ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2); ctx.stroke();
      }
    }
    if (Array.isArray(member.assaultLane) && member.assaultLane.length >= 2) {
      DirectedPath(ctx, Points(member.assaultLane), Project, Css(MAP_COLORS.assault, dim * 0.8), 1, 5);
    }
    void origin;
  }

  PaintLive(ctx, Project, Push) {
    const live = this.live;
    const guide = Array.isArray(live.guideRoute)
      ? Points(live.guideRoute)
      : Points(this.model?.routes?.[live.guideRoute]);
    if (guide.length >= 2) DirectedPath(ctx, guide, Project, Css(MAP_COLORS.guide), 2.6, 8);

    const design = new Map();
    for (const encounter of this.phaseLayout?.encounters || []) {
      for (const member of encounter.members || []) design.set(member.id, member);
    }
    for (const enemy of live.enemies || []) {
      if (!Number.isFinite(enemy.x)) continue;
      const p = Project(enemy.x, enemy.z);
      const source = design.get(enemy.id);
      if (source && Number.isFinite(source.x)) {
        const q = Project(source.x, source.z);
        ctx.strokeStyle = Css(enemy.alive === false ? MAP_COLORS.liveDead : MAP_COLORS.liveEnemy, 0.65);
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(p.x, p.y); ctx.stroke();
        ctx.setLineDash([]);
      }
      if (enemy.alive === false) {
        ctx.strokeStyle = Css(MAP_COLORS.liveDead);
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(p.x - 4, p.y - 4); ctx.lineTo(p.x + 4, p.y + 4);
        ctx.moveTo(p.x + 4, p.y - 4); ctx.lineTo(p.x - 4, p.y + 4);
        ctx.stroke();
      } else {
        ctx.globalAlpha = enemy.dormant ? 0.5 : 1;
        ctx.fillStyle = Css(MAP_COLORS.liveEnemy);
        ctx.beginPath(); ctx.arc(p.x, p.y, 3.4, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      }
      Push({ kind: "member", id: enemy.id, encounterId: enemy.encounter, x: enemy.x, z: enemy.z }, p.x, p.y, 6);
    }
    const player = live.player;
    if (player && Number.isFinite(player.x)) {
      const p = Project(player.x, player.z);
      const yaw = Number.isFinite(player.yaw) ? player.yaw : 0;
      // 世界 yaw 0 看向 -Z（北）。屏幕上 -Z 是上，所以直接用同一个角度转就行。
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(-yaw);
      ctx.fillStyle = Css(MAP_COLORS.player);
      ctx.beginPath();
      ctx.moveTo(0, -8); ctx.lineTo(5.5, 6); ctx.lineTo(0, 3); ctx.lineTo(-5.5, 6);
      ctx.closePath(); ctx.fill();
      ctx.restore();
      Push({ kind: "point", id: "player", x: player.x, z: player.z }, p.x, p.y, 8);
    }
  }

  PaintShape(ctx, Project, view, shape, color, solid) {
    if (!shape) return;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = solid ? 1.8 : 1.2;
    if (!solid) ctx.setLineDash([4, 3]);
    if (shape.type === "circle" && Number.isFinite(shape.x)) {
      const p = Project(shape.x, shape.z);
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(2, (shape.r || 1) * view.scale), 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath(); ctx.arc(p.x, p.y, 2.2, 0, Math.PI * 2); ctx.fill();   // 圈心：实心，好拖也好数
    } else if (shape.type === "arrow" && shape.from && shape.to) {
      DirectedPath(ctx, [shape.from, shape.to], Project, color, ctx.lineWidth, 9);
    } else if (shape.type === "path" && Array.isArray(shape.points)) {
      const pts = Points(shape.points);
      if (pts.length >= 2) Stroke(ctx, pts, Project);
      for (const point of pts) {
        const p = Project(point.x, point.z);
        ctx.beginPath(); ctx.arc(p.x, p.y, 2.2, 0, Math.PI * 2); ctx.fill();
      }
    } else if (shape.type === "label" && Number.isFinite(shape.x)) {
      const p = Project(shape.x, shape.z);
      ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2); ctx.fill();
      Label(ctx, p.x + 6, p.y, shape.text || "（待填）", color);
    } else if (shape.type === "ghost" && Number.isFinite(shape.x)) {
      const p = Project(shape.x, shape.z);
      ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.arc(p.x, p.y, 6, 0, Math.PI * 2); ctx.stroke();
      Label(ctx, p.x + 8, p.y, shape.memberId || "候选位", color);
    }
    ctx.setLineDash([]);
  }

  PaintPreview(ctx, Project, view) {
    const drag = this.drag;
    const color = Css(MAP_COLORS.sketch);
    if (this.pathPoints && this.pathPoints.length) {
      const pts = this.pathPoints.slice();
      if (this.pointer) pts.push(this.ScreenToWorld(this.pointer.x, this.pointer.y));
      if (pts.length >= 2) { ctx.strokeStyle = color; ctx.lineWidth = 1.8; Stroke(ctx, pts, Project); }
      for (const point of this.pathPoints) {
        const p = Project(point.x, point.z);
        ctx.fillStyle = color;
        ctx.beginPath(); ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2); ctx.fill();
      }
    }
    if (!drag || !drag.world) return;
    const now = drag.current || drag.world;
    if (drag.kind === "circle") {
      const r = Math.hypot(now.x - drag.world.x, now.z - drag.world.z);
      this.PaintShape(ctx, Project, view, { type: "circle", x: drag.world.x, z: drag.world.z, r }, color, true);
    } else if (drag.kind === "arrow") {
      this.PaintShape(ctx, Project, view, { type: "arrow", from: drag.world, to: now }, color, true);
    } else if (drag.kind === "move" && drag.target) {
      const a = Project(drag.world.x, drag.world.z);
      const b = Project(now.x, now.z);
      ctx.strokeStyle = Css(MAP_COLORS.select);
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.beginPath(); ctx.arc(b.x, b.y, 6, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  PaintHighlight(ctx, Project, sel) {
    // 组既可以从流程栏/详情栏选，也可以点地图上的组把手。选中以后得看得见是
    // 「哪一撮人」——所以整组成员逐个描亮，而不是挑第一个人画个圈了事。
    // 拍与组同名（transferFlank 既是一拍也是一组），描亮同一撮人。
    if (sel?.kind === "encounter" || sel?.kind === "beat") {
      const encounter = (this.phaseLayout?.encounters || []).find((entry) => entry.id === sel.id);
      if (encounter) {
        ctx.strokeStyle = Css(MAP_COLORS.select);
        ctx.lineWidth = 2;
        for (const member of encounter.members || []) {
          if (!Number.isFinite(member.x)) continue;
          const p = Project(member.x, member.z);
          ctx.beginPath(); ctx.arc(p.x, p.y, 9, 0, Math.PI * 2); ctx.stroke();
        }
        return;
      }
    }
    const point = this.SelPoint(sel);
    if (!point) return;
    const p = Project(point.x, point.z);
    ctx.strokeStyle = Css(MAP_COLORS.select);
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(p.x, p.y, 9, 0, Math.PI * 2); ctx.stroke();
  }

  PaintTooltip(ctx, view, sel) {
    const lines = this.DescribeSel(sel);
    if (!lines.length) return;
    ctx.font = FONT;
    let width = 0;
    for (const line of lines) width = Math.max(width, ctx.measureText(line).width);
    const w = width + 14;
    const h = lines.length * 14 + 10;
    let x = this.pointer.x + 14;
    let y = this.pointer.y + 14;
    if (x + w > view.w) x = view.w - w - 4;
    if (y + h > view.h) y = view.h - h - 4;
    ctx.fillStyle = "rgba(20,22,21,0.92)";
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = Css(MAP_COLORS.select, 0.7);
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = Css(MAP_COLORS.textLight);
    for (let i = 0; i < lines.length; i += 1) ctx.fillText(lines[i], x + 7, y + 12 + i * 14);
  }

  DescribeSel(sel) {
    if (!sel) return [];
    const lines = [`${KindText(sel.kind)}：${sel.id ?? ""}`];
    if (sel.kind === "encounter") {
      const encounter = (this.phaseLayout?.encounters || []).find((entry) => entry.id === sel.id);
      if (encounter) {
        lines.push(`${StateText(encounter.state)} · ${(encounter.members || []).length} 人`);
        const spawn = encounter.spawn || {};
        const where = spawn.step || spawn.fact || spawn.beat || "";
        if (spawn.kind) lines.push(`出现：${spawn.kind}${where ? ` ${where}` : ""}`);
        if (encounter.standbyUntil) lines.push(`待命到 ${encounter.standbyUntil}`);
      }
    }
    if (sel.kind === "beat") {
      const beat = (this.model?.beats || []).find((entry) => entry.id === sel.id);
      if (beat) {
        lines.push(`装车 ${beat.loaded} 之后 · 窗口 ${beat.earliestS}–${beat.latestS} s`);
        if (beat.hint) lines.push(String(beat.hint));
      }
    }
    if (sel.kind === "member") {
      const found = this.FindMember(sel.id);
      if (found) {
        lines.push(`${found.encounter.id} · ${StateText(found.encounter.state)}`);
        const bits = [];
        if (found.member.weapon) bits.push(found.member.weapon);
        if (found.member.hold) bits.push("钉在原地");
        if (found.member.bayonet) bits.push("刺刀");
        if (found.member.tactic) bits.push(`路线 ${found.member.tactic.points?.length || 0} 点`);
        if (bits.length) lines.push(bits.join(" / "));
      }
    }
    if (Number.isFinite(sel.x)) lines.push(`x ${sel.x.toFixed(1)}  z ${sel.z.toFixed(1)}`);
    return lines;
  }

  FindMember(id) {
    for (const encounter of this.phaseLayout?.encounters || []) {
      for (const member of encounter.members || []) {
        if (member.id === id) return { encounter, member };
      }
    }
    return null;
  }

  SelPoint(sel) {
    if (!sel) return null;
    if (Number.isFinite(sel.x) && Number.isFinite(sel.z)) return { x: sel.x, z: sel.z };
    if (sel.kind === "member") {
      const found = this.FindMember(sel.id);
      if (found) return { x: found.member.x, z: found.member.z };
    }
    if (sel.kind === "anchor") {
      const anchor = this.model?.anchors?.[sel.id];
      if (anchor) return { x: anchor.x, z: anchor.z };
    }
    if (sel.kind === "encounter" || sel.kind === "beat") {
      const encounter = (this.phaseLayout?.encounters || this.model?.encounters || [])
        .find((entry) => entry.id === sel.id);
      if (encounter) return Centroid(encounter.members);
    }
    return null;
  }

  PickAt(px, py) {
    let best = null;
    let bestD = Infinity;
    for (let i = this.picks.length - 1; i >= 0; i -= 1) {
      const entry = this.picks[i];
      const d = Math.hypot(entry.px - px, entry.py - py);
      const reach = Math.max(entry.r, 5);
      if (d > reach) continue;
      // 倒着走：后画的压在上面（敌人/实机层盖住锚点）。同样够得着时取更近的，
      // 距离打平时先遇到的（也就是后画的那个）胜出。
      if (d < bestD) { best = entry; bestD = d; }
    }
    return best ? { ...best.sel } : null;
  }

  // -------------------------------------------------------------------------
  // 交互
  // -------------------------------------------------------------------------
  OnDown(event) {
    if (this.disposed) return;
    const local = this.LocalPoint(event);
    this.pointer = local;
    const world = this.ScreenToWorld(local.x, local.y);
    const panning = event.button === 2 || event.button === 1 || this.spaceDown || this.tool === "pan";
    if (panning) {
      this.drag = { kind: "pan", screen: local, cx: this.view.cx, cz: this.view.cz };
      event.preventDefault?.();
      return;
    }
    if (event.button !== 0) return;
    if (this.tool === "select") {
      const sel = this.PickAt(local.x, local.y);
      this.selection = sel;
      this.Emit("select", sel);
      this.Redraw();
      return;
    }
    if (this.tool === "circle" || this.tool === "arrow") {
      this.drag = { kind: this.tool, screen: local, world, current: world };
      this.Redraw();
      return;
    }
    if (this.tool === "path") {
      if (!this.pathPoints) this.pathPoints = [];
      this.pathPoints.push(world);
      this.Redraw();
      return;
    }
    if (this.tool === "label") {
      // 有人接管就把「在哪儿点的」交出去（宿主在那儿长一个输入框），
      // 没人接才直接产出一枚空文字的标注。
      if (this.callbacks.label.length) this.Emit("label", { x: world.x, z: world.z, px: local.x, py: local.y });
      else this.Emit("sketch", { type: "label", x: world.x, z: world.z, text: "" });
      return;
    }
    if (this.tool === "move") {
      const picked = this.PickAt(local.x, local.y);
      const target = MovableSel(picked) ? picked : (MovableSel(this.selection) ? this.selection : null);
      if (!target) return;
      const origin = this.SelPoint(target) || world;
      this.drag = { kind: "move", screen: local, world: origin, current: world, target };
      this.Redraw();
    }
  }

  OnMove(event) {
    if (this.disposed) return;
    const local = this.LocalPoint(event);
    this.pointer = local;
    const drag = this.drag;
    if (drag?.kind === "pan") {
      this.view.cx = drag.cx - (local.x - drag.screen.x) / this.view.scale;
      this.view.cz = drag.cz - (local.y - drag.screen.y) / this.view.scale;
      this.viewTouched = true;          // 手动挪过的视野，跟随实时不许再抢
      this.Redraw();
      return;
    }
    if (drag) {
      drag.current = this.ScreenToWorld(local.x, local.y);
      this.Redraw();
      return;
    }
    if (this.tool === "path" && this.pathPoints?.length) { this.Redraw(); return; }
    this.SetHover(this.PickAt(local.x, local.y));
  }

  OnUp(event) {
    if (this.disposed) return;
    const drag = this.drag;
    this.drag = null;
    if (!drag) return;
    const local = this.LocalPoint(event);
    this.pointer = local;
    const world = this.ScreenToWorld(local.x, local.y);
    if (drag.kind === "circle") {
      const r = Math.hypot(world.x - drag.world.x, world.z - drag.world.z);
      this.Emit("sketch", { type: "circle", x: drag.world.x, z: drag.world.z, r: Math.max(1, r) });
    } else if (drag.kind === "arrow") {
      this.Emit("sketch", { type: "arrow", from: { ...drag.world }, to: { ...world } });
    } else if (drag.kind === "move" && drag.target) {
      this.Emit("move", { target: { ...drag.target }, to: { x: world.x, z: world.z } });
    }
    this.Redraw();
  }

  OnDoubleClick(event) {
    if (this.disposed) return;
    if (this.tool !== "path" || !this.pathPoints) return;
    const points = this.pathPoints;
    this.pathPoints = null;
    // 双击的第一下已经落过一个点，末尾那两个几乎重合的点丢掉一个。
    if (points.length >= 2) {
      const a = points[points.length - 1], b = points[points.length - 2];
      if (Math.hypot(a.x - b.x, a.z - b.z) * this.view.scale < 4) points.pop();
    }
    if (points.length >= 2) this.Emit("sketch", { type: "path", points });
    this.Redraw();
    event.preventDefault?.();
  }

  OnWheel(event) {
    if (this.disposed) return;
    event.preventDefault?.();
    const local = this.LocalPoint(event);
    const before = this.ScreenToWorld(local.x, local.y);
    const factor = Math.exp(-(event.deltaY || 0) * 0.0015);
    this.view.scale = Clamp(this.view.scale * factor, 0.08, 40);
    const after = this.ScreenToWorld(local.x, local.y);
    this.view.cx += before.x - after.x;     // 以鼠标为中心：光标下那一点不动
    this.view.cz += before.z - after.z;
    this.viewTouched = true;
    this.Redraw();
  }

  Dispose() {
    if (this.disposed) return;
    this.disposed = true;
    const canvas = this.canvas;
    if (canvas) {
      canvas.removeEventListener("mousedown", this.handlers.down);
      canvas.removeEventListener("mousemove", this.handlers.move);
      canvas.removeEventListener("mouseup", this.handlers.up);
      canvas.removeEventListener("mouseleave", this.handlers.leave);
      canvas.removeEventListener("wheel", this.handlers.wheel);
      canvas.removeEventListener("dblclick", this.handlers.dbl);
      canvas.removeEventListener("contextmenu", this.handlers.menu);
    }
    const win = this.win;
    if (win) {
      win.removeEventListener("mousemove", this.handlers.winMove);
      win.removeEventListener("mouseup", this.handlers.winUp);
      win.removeEventListener("keydown", this.handlers.keyDown);
      win.removeEventListener("keyup", this.handlers.keyUp);
    }
    this.callbacks = { select: [], hover: [], sketch: [], move: [], label: [] };
    this.ground = null;
    this.picks = [];
    this.handles = [];
    this.drag = null;
    this.pathPoints = null;
    this.live = null;
  }
}

// ---------------------------------------------------------------------------
// 绘制小工具
// ---------------------------------------------------------------------------
function Stroke(ctx, points, Project) {
  ctx.beginPath();
  for (let i = 0; i < points.length; i += 1) {
    const p = Project(points[i].x, points[i].z);
    if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
  }
  ctx.stroke();
}

/**
 * 有向折线：线 + 沿途箭头 + 每个拐点一颗实心圆点。
 * 圆点不只是好看 —— 细线在斜角上全是抗锯齿的中间色，测试数「这条路线到底画出来
 * 没有」时只能靠实心块给出精确 RGB 的像素。
 */
function DirectedPath(ctx, list, Project, color, width, arrow) {
  const points = Points(list);
  if (points.length < 2) return;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = width;
  Stroke(ctx, points, Project);
  let carry = 0;
  const spacing = 70;
  for (let i = 1; i < points.length; i += 1) {
    const a = Project(points[i - 1].x, points[i - 1].z);
    const b = Project(points[i].x, points[i].z);
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 1) continue;
    const ux = (b.x - a.x) / len, uy = (b.y - a.y) / len;
    for (let t = spacing - carry; t < len; t += spacing) {
      Arrow(ctx, a.x + ux * t, a.y + uy * t, ux, uy, arrow, color);
    }
    carry = (carry + len) % spacing;
  }
  const last = Project(points[points.length - 1].x, points[points.length - 1].z);
  const prev = Project(points[points.length - 2].x, points[points.length - 2].z);
  const len = Math.hypot(last.x - prev.x, last.y - prev.y) || 1;
  Arrow(ctx, last.x, last.y, (last.x - prev.x) / len, (last.y - prev.y) / len, arrow, color);
  for (const point of points) {
    const p = Project(point.x, point.z);
    ctx.beginPath();
    ctx.arc(p.x, p.y, Math.max(1.6, width), 0, Math.PI * 2);
    ctx.fill();
  }
}

function Arrow(ctx, x, y, ux, uy, size, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x - ux * size - uy * size * 0.55, y - uy * size + ux * size * 0.55);
  ctx.lineTo(x - ux * size + uy * size * 0.55, y - uy * size - ux * size * 0.55);
  ctx.closePath();
  ctx.fill();
}

function Label(ctx, x, y, text, color) {
  if (!text) return;
  ctx.font = FONT_SMALL;
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(20,22,21,0.72)";
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.font = FONT;
}

/** 一枚芯片的几何：(px, py) 是左端中点，量一次文字宽度定框。 */
function ChipBox(ctx, px, py, text) {
  ctx.font = FONT_SMALL;
  const w = Math.ceil(ctx.measureText(text).width) + CHIP_PAD * 2;
  ctx.font = FONT;
  return { x: px, y: py - CHIP_H / 2, w, h: CHIP_H, cx: px + w / 2, cy: py };
}

/** 一组人的质心。组把手挂在这儿，比挂在「第一个人」身上更像「这一撮人」。 */
function Centroid(members) {
  let x = 0, z = 0, n = 0;
  for (const member of members || []) {
    if (!Number.isFinite(member?.x) || !Number.isFinite(member?.z)) continue;
    x += member.x; z += member.z; n += 1;
  }
  return n ? { x: x / n, z: z / n } : null;
}

function StateColor(state) {
  switch (state) {
    case "pending": return MAP_COLORS.enemyPending;
    case "dormant": return MAP_COLORS.enemyDormant;
    case "active": return MAP_COLORS.enemyActive;
    case "cleared": return MAP_COLORS.enemyCleared;
    default: return MAP_COLORS.enemyStaged;   // spawned / standby
  }
}
function StateText(state) {
  switch (state) {
    case "pending": return "未出现";
    case "spawned": return "已生成";
    case "standby": return "待命";
    case "dormant": return "休眠";
    case "active": return "活跃";
    case "cleared": return "已清除";
    default: return String(state || "");
  }
}
function KindText(kind) {
  switch (kind) {
    case "member": return "敌人";
    case "encounter": return "遭遇组";
    case "anchor": return "锚点";
    case "zone": return "触发区";
    case "route": return "路线";
    case "friendly": return "友军";
    case "beat": return "节拍";
    case "note": return "批注";
    default: return "点";
  }
}
function MovableSel(sel) {
  return !!sel && (sel.kind === "member" || sel.kind === "anchor" || sel.kind === "zone");
}
function SameSel(a, b) {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a.kind === b.kind && a.id === b.id && a.encounterId === b.encounterId;
}
