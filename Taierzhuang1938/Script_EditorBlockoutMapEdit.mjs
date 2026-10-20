// ===========================================================================
// Script_EditorBlockoutMapEdit.mjs —— 全关总图里的「编辑布设」（docs/Data_EditorBlockout.md §4.4）
//
// DOM + canvas 2D，零 three。挂在 BlockoutMap 上（map.SetEditLayer(this)），只在全关总图里起作用：
//   图头一个「编辑布设」开关；打开后图上左上一条工具栏（拖动 / 加标记、撤销 / 重做、计数、清空、导出给 Agent），
//   右上一块检查器（选中的是谁、坐标 / 朝向可以直接敲数、还原；标记写字、半径、删除）。
//   能拖的：地标、体块（场景文件里有 id 的）、当前关键帧的人 / 要点 / 下一步目标、各关键帧的玩家站位、自己加的说明标记。
//   左键拖东西 = 挪；左键拖空地 = 平移；Shift + 点 = 多选，Shift + 拖空地 = 框选；右键 / 中键拖 = 平移；
//   画布有焦点时：方向键微调 0.1 m（Shift 1 m）、Q / E 转 15°（Shift 5°）、Delete 删标记 / 还原、Ctrl+Z / Ctrl+Y、Esc 取消。
//
// 改动记录在 Script_EditorBlockoutLayoutEdit.LayoutEditSession（总控按关卡各留一份，不存盘）；
// 这里只管交互和画：地图画动态层之前问 Override*（挪过的东西画在新位置），画完动态层调 Paint 补上
// 挪过的体块、原位置的虚影与连线、选中框、标记、框选框。
// 输入监听只挂在全关总图那张 canvas 上（经地图模块转进来）和自己的 DOM 上，不往 window 挂。
// ===========================================================================

import { LAYOUT_EDIT_KINDS, LAYOUT_EDIT_STEP_M, SnapM } from "./Script_EditorBlockoutLayoutEdit.mjs";
import { MAP_COLORS, BlockCorners, BlockStyleFill } from "./Script_EditorBlockoutMap.mjs";

const MARKER_RGB = Object.freeze([122, 47, 196]);
const DRAG_PX = 3;
const HIT = Object.freeze({ markerPx: 11, unitPx: 10, poiPx: 9, landmarkPx: 8, stationPx: 11 });
const ROT_STEP_DEG = 15, ROT_FINE_DEG = 5;
const FONT_STACK = '"TzUiLatin", "Microsoft YaHei UI", "Microsoft YaHei", "PingFang SC", "Hiragino Sans GB", "Noto Sans CJK SC", "TzUiSans", sans-serif';
const MONO_STACK = '"Cascadia Mono", Consolas, ui-monospace, monospace';
const CIRCLED = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳";

const SVG = (body) => `<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
const ICONS = Object.freeze({
  edit: SVG('<path d="M3 13l.6-2.8L10.4 3.4l2.2 2.2-6.8 6.8z"/><path d="M9.2 4.6l2.2 2.2"/>'),
  move: SVG('<path d="M8 2v12M2 8h12"/><path d="M6.2 3.8 8 2l1.8 1.8M6.2 12.2 8 14l1.8-1.8M3.8 6.2 2 8l1.8 1.8M12.2 6.2 14 8l-1.8 1.8"/>'),
  marker: SVG('<path d="M8 14.2s4.4-4.1 4.4-7.4a4.4 4.4 0 0 0-8.8 0c0 3.3 4.4 7.4 4.4 7.4z"/><circle cx="8" cy="6.8" r="1.5" fill="currentColor" stroke="none"/>'),
  undo: SVG('<path d="M5.5 4 2.8 6.7l2.7 2.7"/><path d="M3 6.7h6.2a3.6 3.6 0 0 1 0 7.2H7"/>'),
  redo: SVG('<path d="M10.5 4l2.7 2.7-2.7 2.7"/><path d="M13 6.7H6.8a3.6 3.6 0 0 0 0 7.2H9"/>'),
  clear: SVG('<path d="M3.5 4.5h9M6.5 4.5V3h3v1.5M4.7 4.5l.6 8.7h5.4l.6-8.7"/>'),
  send: SVG('<path d="M2.4 7.6 13.6 2.4l-3.3 11.2-2.6-4.4z"/><path d="M7.7 9.2 13.6 2.4"/>'),
  reset: SVG('<path d="M3.4 8.2a4.6 4.6 0 1 0 1.5-3.6"/><path d="M3.2 2.7v2.6h2.6"/>'),
  close: SVG('<path d="M4 4l8 8M12 4l-8 8"/>'),
  jump: SVG('<path d="M3 8h9M8.6 4.4 12.2 8l-3.6 3.6"/>'),
});

const SIDE_TEXT = Object.freeze({ nra: "友", ija: "敌", civ: "百姓" });

function Css(rgb, a = 1) { return a >= 1 ? `rgb(${rgb[0]},${rgb[1]},${rgb[2]})` : `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`; }
function Finite(v) { return typeof v === "number" && Number.isFinite(v); }
function Fix(v, d = 1) { return Finite(v) ? v.toFixed(d) : "?"; }
function WrapDeg(deg) { let d = ((deg + 180) % 360 + 360) % 360 - 180; if (d === -180) d = 180; return d; }
function El(tag, className = "", text = "") {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text) el.textContent = text;
  return el;
}
function Button(className, { icon = "", text = "", tip = "" } = {}) {
  const b = El("button", `boBtn ${className}`.trim());
  b.type = "button";
  if (icon) b.innerHTML = ICONS[icon];
  if (text) b.appendChild(El("span", "boBtnText", text));
  if (tip) { b.dataset.tip = tip; b.setAttribute("aria-label", tip); }
  return b;
}
function PointInPoly(x, z, corners) {
  let inside = false;
  for (let i = 0, j = corners.length - 1; i < corners.length; j = i++) {
    const [xi, zi] = corners[i], [xj, zj] = corners[j];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / ((zj - zi) || 1e-12) + xi) inside = !inside;
  }
  return inside;
}
function RefKey(ref) { return ref.kind === "marker" ? `marker|${ref.n}` : `${ref.kind}|${LAYOUT_EDIT_KINDS[ref.kind]?.perKeyframe ? ref.keyframeId : ""}|${ref.id}`; }

export class BlockoutMapEdit {
  /**
   * @param {object} o
   *   map          BlockoutMap
   *   head         全关总图的图头（开关插在 before 前面）  before：关闭按钮
   *   body         全关总图的画布容器（工具栏、检查器放这里）
   *   onExport()   「导出给 Agent」
   *   onJump(index)  检查器里「跳到这个关键帧」
   *   onActive(on)   开关切换（总控据此改提示）
   */
  constructor({ map, head, before = null, body, onExport, onJump, onActive }) {
    this.map = map;
    this.onExport = onExport || (() => {});
    this.onJump = onJump || (() => {});
    this.onActive = onActive || (() => {});
    this.session = null;
    this.ctx = { keyframeId: "", keyframeIndex: -1, units: [], pois: [], next: null, stations: [], landmarks: [] };
    this.active = false;
    this.tool = "move";
    this.sel = [];
    this.hover = null;
    this.drag = null;
    this.band = null;
    this.blockCache = { items: null, byId: new Map() };
    this.shownRevision = -1;
    this.off = [];
    this.BuildDom(head, before, body);
    map.SetEditLayer(this);
  }

  // -------------------------------------------------------------------------
  // 总控接口

  SetSession(session) {
    if (this.drag) this.EndDrag(true);
    this.session = session || null;
    this.sel = [];
    this.hover = null;
    this.Refresh();
  }

  /**
   * 当前能挪的数据（总控每次切关键帧 / 重读配置 / 地标读回来后给一次）。每项是 LayoutEditSession 的 ref：
   *   units / pois / next：当前关键帧的；stations：所有关键帧的玩家站位（带 index）；landmarks：场景文件的。
   */
  SetContext(ctx = {}) {
    this.ctx = {
      keyframeId: String(ctx.keyframeId ?? ""), keyframeIndex: Number.isInteger(ctx.keyframeIndex) ? ctx.keyframeIndex : -1,
      units: Array.isArray(ctx.units) ? ctx.units : [], pois: Array.isArray(ctx.pois) ? ctx.pois : [],
      next: ctx.next || null, stations: Array.isArray(ctx.stations) ? ctx.stations : [], landmarks: Array.isArray(ctx.landmarks) ? ctx.landmarks : [],
    };
    // 选中的东西换了关键帧就不在了（人 / 要点 / 下一步）：从选择里拿掉
    this.sel = this.sel.map(r => this.Rebind(r)).filter(Boolean);
    this.Refresh();
  }

  SetActive(on) {
    const next = !!on;
    if (next === this.active) return;
    if (!next && this.drag) this.EndDrag(true);
    this.active = next;
    if (!next) { this.sel = []; this.hover = null; this.tool = "move"; this.band = null; }
    this.Refresh();
    this.onActive(next);
  }

  /** 改动记录变了（外面调了 Undo / Reconcile 之类）：刷新界面与地图。 */
  Refresh() {
    this.RenderDom();
    this.map.RequestFullRepaint();
  }

  // -------------------------------------------------------------------------
  // 数据：ref 与当前位置

  Blocks() {
    const items = this.map.items;
    if (this.blockCache.items !== items) {
      const byId = new Map();
      for (const it of items || []) if (it.src?.id) byId.set(it.src.id, it);
      this.blockCache = { items, byId };
    }
    return this.blockCache.byId;
  }

  BlockRef(item) {
    const s = item.src;
    return { kind: "block", id: s.id, name: "", path: "", meta: { semantic: s.semantic || "", w: s.w, d: s.d, h: s.h }, x: s.x, z: s.z, ry: s.ry || 0 };
  }

  /** 选择里存的 ref 在新的上下文里还在不在（换关键帧后人 / 要点 / 下一步就换成了新那一帧的）。 */
  Rebind(ref) {
    if (ref.kind === "marker") return this.session?.Marker(ref.n) ? ref : null;
    if (ref.kind === "block") { const it = this.Blocks().get(ref.id); return it ? this.BlockRef(it) : null; }
    const list = ref.kind === "unit" ? this.ctx.units : ref.kind === "poi" ? this.ctx.pois : ref.kind === "station" ? this.ctx.stations
      : ref.kind === "landmark" ? this.ctx.landmarks : ref.kind === "next" ? (this.ctx.next ? [this.ctx.next] : []) : [];
    return list.find(r => RefKey(r) === RefKey(ref)) || null;
  }

  Pos(ref) {
    if (ref.kind === "marker") { const m = this.session?.Marker(ref.n); return m ? { x: m.x, z: m.z } : null; }
    return this.session ? this.session.Resolve(ref) : { x: ref.x, z: ref.z, yawDeg: ref.yawDeg, ry: ref.ry };
  }

  IsSelected(ref) { const k = RefKey(ref); return this.sel.some(r => RefKey(r) === k); }

  // -------------------------------------------------------------------------
  // 地图画动态层前的替换：挪过的东西画在新位置（只在开着编辑时、只在全关总图上）

  OverrideUnits(units) {
    if (!this.session || !this.session.moveCount) return units;
    return units.map((u) => {
      const ref = { kind: "unit", id: u.id, keyframeId: this.ctx.keyframeId };
      const m = this.session.MoveOf(ref);
      if (!m) return u;
      // 射界给了中心朝向的跟着转同样的角度（缺省射界本来就跟着人的朝向走）；去向箭头从新位置画起
      const turn = Finite(m.to.yawDeg) && Finite(m.from.yawDeg) ? WrapDeg(m.to.yawDeg - m.from.yawDeg) : 0;
      return { ...u, x: m.to.x, z: m.to.z, yawDeg: Finite(m.to.yawDeg) ? m.to.yawDeg : u.yawDeg,
        arc: u.arc && Finite(u.arc.yawDeg) && turn ? { ...u.arc, yawDeg: u.arc.yawDeg + turn } : u.arc };
    });
  }
  OverridePois(pois) {
    if (!this.session || !this.session.moveCount) return pois;
    return pois.map((p) => { const m = this.session.MoveOf({ kind: "poi", id: p.id, keyframeId: this.ctx.keyframeId }); return m ? { ...p, x: m.to.x, z: m.to.z } : p; });
  }
  OverrideNext(next) {
    if (!next || !this.session) return next;
    const m = this.session.MoveOf({ kind: "next", id: "next", keyframeId: this.ctx.keyframeId });
    return m ? { ...next, x: m.to.x, z: m.to.z } : next;
  }
  OverrideKeyframes(kfs) {
    if (!this.session || !this.session.moveCount) return kfs;
    return kfs.map((k) => { const m = this.session.MoveOf({ kind: "station", id: k.id, keyframeId: k.id }); return m ? { ...k, x: m.to.x, z: m.to.z } : k; });
  }
  OverrideLandmarks(list) {
    if (!this.session || !this.session.moveCount) return list;
    return list.map((lm) => { const m = this.session.MoveOf({ kind: "landmark", id: lm.id }); return m ? { ...lm, x: m.to.x, z: m.to.z, ry: Finite(m.to.ry) ? m.to.ry : lm.ry } : lm; });
  }

  // -------------------------------------------------------------------------
  // 拾取

  /** 屏幕点 (px, py) 下最上面那个能挪的东西 → ref | null。 */
  HitTest(px, py) {
    const map = this.map;
    const near = (x, z, r) => { const p = map.WorldToScreen(x, z); const d = Math.hypot(p.x - px, p.y - py); return d <= r ? d : Infinity; };
    const Best = (list, r, posOf) => {
      let best = null, bd = Infinity;
      for (const ref of list) { const p = posOf(ref); if (!p) continue; const d = near(p.x, p.z, r); if (d < bd) { bd = d; best = ref; } }
      return best;
    };
    if (this.session) {
      const markers = this.session.markers.map(m => ({ kind: "marker", n: m.n }));
      const hit = Best(markers, HIT.markerPx, r => this.Pos(r));
      if (hit) return hit;
    }
    const units = Best(this.ctx.units, HIT.unitPx, r => this.Pos(r));
    if (units) return units;
    if (this.ctx.next) { const p = this.Pos(this.ctx.next); if (near(p.x, p.z, HIT.poiPx + 3) < Infinity) return this.ctx.next; }
    const poi = Best(this.ctx.pois, HIT.poiPx, r => this.Pos(r));
    if (poi) return poi;
    if (this.map.layers.landmarks) { const lm = Best(this.ctx.landmarks, HIT.landmarkPx, r => this.Pos(r)); if (lm) return lm; }
    const st = Best(this.ctx.stations, HIT.stationPx, r => this.Pos(r));
    if (st) return st;
    // 体块：点落在脚印里（挪过的按新位置），多块叠着取最小的那块
    const w = map.ScreenToWorld(px, py);
    const pad = 2 / (map.view?.pxPerM || 1);
    let best = null, bestArea = Infinity;
    const Consider = (item, x, z, ry) => {
      const s = item.src;
      if (item.style === "foliage") {
        const r = Math.max(item.r || 1, pad);
        if (Math.hypot(w.x - x, w.z - z) > r) return;
        const area = Math.PI * r * r;
        if (area < bestArea) { bestArea = area; best = item; }
        return;
      }
      const corners = BlockCorners({ x, z, w: s.w + pad * 2, d: s.d + pad * 2, ry });
      if (!PointInPoly(w.x, w.z, corners)) return;
      const area = s.w * s.d;
      if (area < bestArea) { bestArea = area; best = item; }
    };
    const movedIds = new Set();
    if (this.session) for (const m of this.session.moves.values()) if (m.kind === "block") movedIds.add(m.id);
    for (const item of map.ItemsIn(w.x - 1, w.x + 1, w.z - 1, w.z + 1)) {
      if (!item.src?.id || movedIds.has(item.src.id)) continue;
      Consider(item, item.src.x, item.src.z, item.src.ry || 0);
    }
    const byId = this.Blocks();
    for (const id of movedIds) {
      const item = byId.get(id);
      if (!item) continue;
      const p = this.session.Resolve(this.BlockRef(item));
      Consider(item, p.x, p.z, Finite(p.ry) ? p.ry : item.src.ry || 0);
    }
    return best ? this.BlockRef(best) : null;
  }

  /** 框选：世界矩形里（中心落在里面）的东西。 */
  InBand(x0, z0, x1, z1) {
    const minX = Math.min(x0, x1), maxX = Math.max(x0, x1), minZ = Math.min(z0, z1), maxZ = Math.max(z0, z1);
    const In = (p) => p && p.x >= minX && p.x <= maxX && p.z >= minZ && p.z <= maxZ;
    const out = [];
    for (const r of [...this.ctx.units, ...this.ctx.pois, ...(this.ctx.next ? [this.ctx.next] : []), ...(this.map.layers.landmarks ? this.ctx.landmarks : [])]) if (In(this.Pos(r))) out.push(r);
    if (this.session) for (const m of this.session.markers) if (In(m)) out.push({ kind: "marker", n: m.n });
    for (const item of this.map.ItemsIn(minX, maxX, minZ, maxZ)) {
      if (!item.src?.id) continue;
      const ref = this.BlockRef(item);
      if (In(this.Pos(ref))) out.push(ref);
    }
    return out;
  }

  /** 光标样子（地图在悬停时问）。 */
  Cursor(px, py) {
    if (this.tool === "marker") return "crosshair";
    const hit = this.HitTest(px, py);
    const key = hit ? RefKey(hit) : "";
    if (key !== (this.hover ? RefKey(this.hover) : "")) { this.hover = hit; this.map.RequestFullRepaint(); }
    return hit ? "move" : "";
  }

  // -------------------------------------------------------------------------
  // 指针（地图模块的 canvas 监听转进来；返回 true = 归编辑）

  OnPointerDown(e, px, py) {
    if (!this.active || !this.session || e.button !== 0) return false;
    this.canvas = e.currentTarget;
    try { this.canvas.tabIndex = -1; this.canvas.focus({ preventScroll: true }); } catch { /* 合成事件 */ }
    const world = this.map.ScreenToWorld(px, py);
    if (this.tool === "marker") {
      this.drag = { type: "marker", x: e.clientX, y: e.clientY, moved: 0, start: world, cur: world };
      return true;
    }
    const hit = this.HitTest(px, py);
    if (!hit) {
      this.drag = e.shiftKey
        ? { type: "band", x: e.clientX, y: e.clientY, moved: 0, start: world, cur: world }
        : { type: "pan", x: e.clientX, y: e.clientY, moved: 0 };
      if (e.shiftKey) this.band = { x0: world.x, z0: world.z, x1: world.x, z1: world.z };
      return true;
    }
    if (e.shiftKey) {
      if (this.IsSelected(hit)) { const k = RefKey(hit); this.sel = this.sel.filter(r => RefKey(r) !== k); this.drag = { type: "none", x: e.clientX, y: e.clientY, moved: 0 }; this.Refresh(); return true; }
      this.sel = [...this.sel, hit];
    } else if (!this.IsSelected(hit)) {
      this.sel = [hit];
    }
    this.session.Begin();
    const refs = this.sel.slice();
    this.drag = { type: "move", x: e.clientX, y: e.clientY, moved: 0, start: world, refs, starts: refs.map(r => this.Pos(r)), delta: { x: 0, z: 0 } };
    this.Refresh();
    return true;
  }

  OnPointerMove(e, px, py) {
    const d = this.drag;
    if (!d) return false;
    const dxPx = e.clientX - d.x, dyPx = e.clientY - d.y;
    d.moved += Math.abs(dxPx) + Math.abs(dyPx);
    d.x = e.clientX; d.y = e.clientY;
    const world = this.map.ScreenToWorld(px, py);
    if (d.type === "pan") { if (d.moved > DRAG_PX) this.map.PanBy(dxPx, dyPx); return true; }
    if (d.type === "band") { d.cur = world; this.band = { x0: d.start.x, z0: d.start.z, x1: world.x, z1: world.z }; this.map.RequestFullRepaint(); return true; }
    if (d.type === "marker") { d.cur = world; this.map.RequestFullRepaint(); return true; }
    if (d.type === "move" && d.moved > DRAG_PX) {
      const dx = world.x - d.start.x, dz = world.z - d.start.z;
      d.delta = { x: SnapM(dx), z: SnapM(dz) };
      this.ApplyDelta(d.refs, d.starts, dx, dz);
      this.RenderDom();
      this.map.RequestFullRepaint();
    }
    return true;
  }

  OnPointerUp(e, px, py) {
    const d = this.drag;
    if (!d) return false;
    if (e.type === "pointercancel") { this.EndDrag(true); return true; }
    this.drag = null;
    if (d.type === "pan") { if (d.moved <= DRAG_PX && !e.shiftKey) { this.sel = []; this.Refresh(); } return true; }
    if (d.type === "band") {
      const picked = this.band ? this.InBand(this.band.x0, this.band.z0, this.band.x1, this.band.z1) : [];
      this.band = null;
      const keys = new Set(this.sel.map(RefKey));
      this.sel = [...this.sel, ...picked.filter(r => !keys.has(RefKey(r)))];
      this.Refresh();
      return true;
    }
    if (d.type === "marker") {
      const r = Math.hypot(d.cur.x - d.start.x, d.cur.z - d.start.z);
      const radius = d.moved > 6 && r >= 1 ? Math.round(r * 2) / 2 : 0;
      let marker = null;
      this.session.Step(() => { marker = this.session.AddMarker({ x: d.start.x, z: d.start.z, radiusM: radius }); });
      this.tool = "move";
      if (marker) this.sel = [{ kind: "marker", n: marker.n }];
      this.Refresh();
      this.FocusMarkerText();
      return true;
    }
    if (d.type === "move") {
      this.session.Commit();
      this.Refresh();
      return true;
    }
    return true;
  }

  OnDblClick() { return this.active; }   // 编辑时双击不跳回全图（拖东西时手一抖就跳走了）

  EndDrag(cancel) {
    const d = this.drag;
    this.drag = null;
    this.band = null;
    if (d?.type === "move" && this.session) { if (cancel) this.session.Cancel(); else this.session.Commit(); }
    this.Refresh();
  }

  ApplyDelta(refs, starts, dx, dz) {
    const sx = SnapM(dx), sz = SnapM(dz);
    const items = [], from = [];
    refs.forEach((r, i) => {
      if (r.kind === "marker") { const s = starts[i]; if (s) this.session.UpdateMarker(r.n, { x: s.x + sx, z: s.z + sz }); }
      else { items.push(r); from.push(starts[i]); }
    });
    this.session.Translate(items, from, sx, sz);
  }

  // -------------------------------------------------------------------------
  // 键盘（画布有焦点时；画布在编辑器界面里，界面根上的拦截不会让这些键漏到游戏）

  OnKey(e) {
    if (!this.active || !this.session) return;
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && (e.code === "KeyZ" || e.code === "KeyY")) {
      e.preventDefault(); e.stopPropagation();
      const redo = e.code === "KeyY" || e.shiftKey;
      if (redo ? this.session.Redo() : this.session.Undo()) { this.sel = this.sel.map(r => this.Rebind(r)).filter(Boolean); this.Refresh(); }
      return;
    }
    if (ctrl || e.altKey) return;
    if (e.code === "Escape") {
      if (this.drag) { this.EndDrag(true); e.stopPropagation(); return; }
      if (this.tool === "marker") { this.tool = "move"; this.Refresh(); e.stopPropagation(); return; }
      if (this.sel.length) { this.sel = []; this.Refresh(); e.stopPropagation(); }
      return;   // 什么都没有 → 照常关图
    }
    if (!this.sel.length) return;
    const step = e.shiftKey ? 1 : LAYOUT_EDIT_STEP_M;
    const arrows = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (arrows[e.code]) {
      e.preventDefault(); e.stopPropagation();
      const [dx, dz] = arrows[e.code];
      this.session.Step(() => this.ApplyDelta(this.sel, this.sel.map(r => this.Pos(r)), dx, dz));
      this.Refresh();
      return;
    }
    if (e.code === "KeyQ" || e.code === "KeyE") {
      e.preventDefault(); e.stopPropagation();
      const deg = (e.shiftKey ? ROT_FINE_DEG : ROT_STEP_DEG) * (e.code === "KeyQ" ? 1 : -1);
      this.Rotate(deg);
      return;
    }
    if (e.code === "Delete" || e.code === "Backspace") {
      e.preventDefault(); e.stopPropagation();
      this.session.Step(() => { for (const r of this.sel) { if (r.kind === "marker") this.session.RemoveMarker(r.n); else this.session.Reset(r); } });
      this.sel = this.sel.filter(r => r.kind !== "marker");
      this.Refresh();
    }
  }

  /** 选中的单个人 / 站位 / 体块 / 地标转 deg 度（Q 左转为正，同 yawDeg）。 */
  Rotate(deg) {
    const refs = this.sel.filter(r => r.kind !== "marker" && LAYOUT_EDIT_KINDS[r.kind]?.rot);
    if (!refs.length) return;
    this.session.Step(() => {
      for (const r of refs) {
        const p = this.Pos(r), rot = LAYOUT_EDIT_KINDS[r.kind].rot;
        if (rot === "yawDeg") this.session.Set(r, { yawDeg: WrapDeg((p.yawDeg || 0) + deg) });
        else this.session.Set(r, { ry: Math.round(((p.ry || 0) + deg * Math.PI / 180) * 1e4) / 1e4 });
      }
    });
    this.Refresh();
  }

  // -------------------------------------------------------------------------
  // 画（地图画完动态层之后调；当前变换 = CSS 像素）

  Paint(ctx, view) {
    if (!this.active || !this.session) return;
    const P = (x, z) => ({ x: (x - view.cx) * view.s + view.w / 2, y: (z - view.cz) * view.s + view.h / 2 });
    const s = view.s;
    ctx.save();
    // 挪过的体块：原位置盖一层纸色 + 虚线框，新位置按原样式画 + 金边
    const byId = this.Blocks();
    for (const m of this.session.moves.values()) {
      if (m.kind !== "block") continue;
      const item = byId.get(m.id);
      if (!item) continue;
      const src = item.src;
      const fill = BlockStyleFill(item.style);
      const Poly = (x, z, ry) => {
        ctx.beginPath();
        if (item.style === "foliage") { const p = P(x, z); ctx.arc(p.x, p.y, Math.max(2, item.r * s), 0, Math.PI * 2); return; }
        BlockCorners({ x, z, w: src.w, d: src.d, ry }).forEach(([cx, cz], i) => { const p = P(cx, cz); if (i) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); });
        ctx.closePath();
      };
      Poly(m.from.x, m.from.z, Finite(m.from.ry) ? m.from.ry : src.ry || 0);
      ctx.fillStyle = Css(MAP_COLORS.paper, 0.82); ctx.fill();
      ctx.setLineDash([3, 3]); ctx.lineWidth = 1; ctx.strokeStyle = Css(MAP_COLORS.ink, 0.55); ctx.stroke(); ctx.setLineDash([]);
      Poly(m.to.x, m.to.z, Finite(m.to.ry) ? m.to.ry : src.ry || 0);
      ctx.fillStyle = fill; ctx.fill();
      ctx.lineWidth = 1.4; ctx.strokeStyle = Css(MAP_COLORS.gold, 0.95); ctx.stroke();
    }
    // 其余挪过的东西：原位置一个空心小圈 + 细虚线连到新位置
    ctx.setLineDash([2.5, 3]);
    for (const m of this.session.moves.values()) {
      if (m.kind === "block") continue;
      if (LAYOUT_EDIT_KINDS[m.kind].perKeyframe && m.kind !== "station" && m.keyframeId !== this.ctx.keyframeId) continue;
      const a = P(m.from.x, m.from.z), b = P(m.to.x, m.to.z);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
      ctx.lineWidth = 1.2; ctx.strokeStyle = Css(MAP_COLORS.ink, 0.6); ctx.stroke();
      ctx.beginPath(); ctx.arc(a.x, a.y, 3.2, 0, Math.PI * 2);
      ctx.lineWidth = 1.2; ctx.stroke();
    }
    ctx.setLineDash([]);
    // 标记
    this.PaintMarkers(ctx, view, P);
    // 悬停与选中
    const Outline = (ref, color, width, dashed) => {
      const p = this.Pos(ref);
      if (!p) return;
      ctx.save();
      if (dashed) ctx.setLineDash([3, 2.5]);
      ctx.lineWidth = width; ctx.strokeStyle = color;
      if (ref.kind === "block") {
        const item = byId.get(ref.id);
        if (item) {
          ctx.beginPath();
          if (item.style === "foliage") { const c = P(p.x, p.z); ctx.arc(c.x, c.y, Math.max(4, item.r * s + 2), 0, Math.PI * 2); }
          else BlockCorners({ x: p.x, z: p.z, w: item.src.w, d: item.src.d, ry: Finite(p.ry) ? p.ry : item.src.ry || 0 }).forEach(([cx, cz], i) => { const q = P(cx, cz); if (i) ctx.lineTo(q.x, q.y); else ctx.moveTo(q.x, q.y); });
          ctx.closePath(); ctx.stroke();
        }
      } else {
        const c = P(p.x, p.z);
        const r = ref.kind === "marker" ? 13 : ref.kind === "station" ? 14 : 11;
        ctx.beginPath(); ctx.arc(c.x, c.y, r, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.restore();
    };
    if (this.hover && !this.IsSelected(this.hover) && !this.drag) Outline(this.hover, Css(MAP_COLORS.ink, 0.7), 1.4, true);
    for (const ref of this.sel) { Outline(ref, Css(MAP_COLORS.ink, 0.9), 4, false); Outline(ref, Css(MAP_COLORS.gold), 2, false); }
    // 框选框
    if (this.band) {
      const a = P(this.band.x0, this.band.z0), b = P(this.band.x1, this.band.z1);
      ctx.fillStyle = Css(MAP_COLORS.gold, 0.12);
      ctx.fillRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
      ctx.setLineDash([4, 3]); ctx.lineWidth = 1.2; ctx.strokeStyle = Css(MAP_COLORS.gold);
      ctx.strokeRect(Math.min(a.x, b.x) + 0.5, Math.min(a.y, b.y) + 0.5, Math.abs(b.x - a.x), Math.abs(b.y - a.y));
      ctx.setLineDash([]);
    }
    // 正在放的标记（拖出半径）
    if (this.drag?.type === "marker") {
      const a = P(this.drag.start.x, this.drag.start.z);
      const r = Math.hypot(this.drag.cur.x - this.drag.start.x, this.drag.cur.z - this.drag.start.z) * s;
      if (r > 4) {
        ctx.beginPath(); ctx.arc(a.x, a.y, r, 0, Math.PI * 2);
        ctx.fillStyle = Css(MARKER_RGB, 0.12); ctx.fill();
        ctx.setLineDash([5, 4]); ctx.lineWidth = 1.6; ctx.strokeStyle = Css(MARKER_RGB, 0.9); ctx.stroke(); ctx.setLineDash([]);
      }
      Pin(ctx, a.x, a.y, String(this.session.markers.length + 1));
    }
    // 拖动中：挪动量小牌；悬停：名字小牌
    if (this.drag?.type === "move" && this.drag.moved > DRAG_PX) {
      const d = this.drag.delta;
      const first = this.Pos(this.drag.refs[0]);
      const p = first ? P(first.x, first.z) : { x: view.w / 2, y: view.h / 2 };
      const parts = [];
      if (d.x) parts.push(`${d.x > 0 ? "东" : "西"} ${Math.abs(d.x).toFixed(1)}`);
      if (d.z) parts.push(`${d.z > 0 ? "南" : "北"} ${Math.abs(d.z).toFixed(1)}`);
      Tip(ctx, view, p.x, p.y, `${parts.join("  ") || "没动"} m${this.drag.refs.length > 1 ? `　${this.drag.refs.length} 个` : ""}`, `x ${Fix(first?.x)}  z ${Fix(first?.z)}`);
    } else if (this.hover && !this.drag) {
      const p = this.Pos(this.hover);
      if (p) { const c = P(p.x, p.z); Tip(ctx, view, c.x, c.y, this.Title(this.hover), this.hover.kind === "marker" ? "" : `x ${Fix(p.x)}  z ${Fix(p.z)}`); }
    }
    ctx.restore();
  }

  PaintMarkers(ctx, view, P) {
    const s = view.s;
    for (const m of this.session.markers) {
      const p = P(m.x, m.z);
      if (p.x < -200 || p.y < -200 || p.x > view.w + 200 || p.y > view.h + 200) continue;
      if (m.radiusM > 0) {
        ctx.beginPath(); ctx.arc(p.x, p.y, m.radiusM * s, 0, Math.PI * 2);
        ctx.fillStyle = Css(MARKER_RGB, 0.1); ctx.fill();
        ctx.setLineDash([5, 4]); ctx.lineWidth = 1.6; ctx.strokeStyle = Css(MARKER_RGB, 0.85); ctx.stroke(); ctx.setLineDash([]);
      }
      Pin(ctx, p.x, p.y, String(this.MarkerNo(m.n)));
      const text = m.text ? (m.text.length > 26 ? m.text.slice(0, 25) + "…" : m.text) : "（没写字）";
      ctx.font = `600 11.5px ${FONT_STACK}`;
      ctx.textBaseline = "middle"; ctx.textAlign = "left";
      const tw = ctx.measureText(text).width;
      const bx = p.x + 12, by = p.y - 26;
      ctx.fillStyle = "rgba(14,16,17,0.86)";
      ctx.fillRect(bx, by, tw + 12, 18);
      ctx.fillStyle = Css(MARKER_RGB); ctx.fillRect(bx, by, 2.5, 18);
      ctx.fillStyle = m.text ? "#eeefec" : "#9a9c92";
      ctx.fillText(text, bx + 7, by + 9.5);
    }
  }

  /** 标记的显示号：按现在的顺序 1、2、3…（删了中间的，后面的往前补，跟导出一致）。 */
  MarkerNo(n) { return this.session.markers.findIndex(m => m.n === n) + 1; }

  Title(ref) {
    if (ref.kind === "marker") return `说明标记 ${CIRCLED[this.MarkerNo(ref.n) - 1] || this.MarkerNo(ref.n)}`;
    const label = LAYOUT_EDIT_KINDS[ref.kind]?.label || ref.kind;
    if (ref.kind === "unit") return `${SIDE_TEXT[ref.meta?.side] ? SIDE_TEXT[ref.meta.side] + "方" : ""}${ref.name || label} · ${ref.id}`;
    if (ref.kind === "station") return `站位 ${ref.id}${ref.name ? " · " + ref.name : ""}`;
    if (ref.kind === "next") return `下一步 · ${ref.name || "目标"}`;
    if (ref.kind === "block") return `体块 · ${ref.id}`;
    return `${label} · ${ref.name || ref.id}`;
  }

  /** 导出时标记附近的东西候选（按现在的位置，挪过的用新位置）。 */
  NearCandidates() {
    const out = [];
    const Add = (ref, name) => { const p = this.Pos(ref); if (p) out.push({ kind: ref.kind, id: ref.id, name, x: p.x, z: p.z }); };
    for (const r of this.ctx.landmarks) Add(r, r.name || "");
    for (const r of this.ctx.units) Add(r, r.name || "");
    for (const r of this.ctx.pois) Add(r, r.name || "");
    for (const r of this.ctx.stations) Add(r, `站位 ${r.id}`);
    for (const item of this.Blocks().values()) if (item.style === "wall" || item.style === "roof" || item.style === "low") Add(this.BlockRef(item), "");
    return out;
  }

  // -------------------------------------------------------------------------
  // DOM：图头开关、工具栏、检查器

  Listen(el, type, fn, opts) { el.addEventListener(type, fn, opts); this.off.push(() => el.removeEventListener(type, fn, opts)); }

  BuildDom(head, before, body) {
    this.btnToggle = Button("boEditToggle", { icon: "edit", text: "编辑布设", tip: "拖动调整布设、加说明标记，导出给 agent" });
    this.btnToggle.dataset.tipSide = "below";
    this.elBadge = El("span", "boEditBadge");
    this.btnToggle.append(this.elBadge);
    this.Listen(this.btnToggle, "click", () => this.SetActive(!this.active));
    head.insertBefore(this.btnToggle, before && before.parentNode === head ? before : null);

    const bar = El("div", "boEditBar boPanel");
    this.btnMove = Button("boIconBtn boEditTool", { icon: "move", tip: "拖动：挪位置（Shift 多选 / 框选）" });
    this.btnMarker = Button("boIconBtn boEditTool", { icon: "marker", tip: "加说明标记：点一下放点，拖出圆圈 = 一片" });
    this.Listen(this.btnMove, "click", () => { this.tool = "move"; this.Refresh(); });
    this.Listen(this.btnMarker, "click", () => { this.tool = this.tool === "marker" ? "move" : "marker"; this.Refresh(); });
    this.btnUndo = Button("boIconBtn", { icon: "undo", tip: "撤销（Ctrl+Z）" });
    this.btnRedo = Button("boIconBtn", { icon: "redo", tip: "重做（Ctrl+Y）" });
    this.Listen(this.btnUndo, "click", () => { if (this.session?.Undo()) { this.sel = this.sel.map(r => this.Rebind(r)).filter(Boolean); this.Refresh(); } });
    this.Listen(this.btnRedo, "click", () => { if (this.session?.Redo()) { this.sel = this.sel.map(r => this.Rebind(r)).filter(Boolean); this.Refresh(); } });
    this.elCount = El("span", "boEditCount");
    this.btnClear = Button("boIconBtn", { icon: "clear", tip: "全部清掉（挪动和标记，能撤销）" });
    this.Listen(this.btnClear, "click", () => { if (!this.session) return; this.session.Step(() => this.session.Clear()); this.sel = []; this.Refresh(); });
    this.btnExport = Button("boEditExport", { icon: "send", text: "导出给 Agent", tip: "整理成一段文字放进剪贴板，直接粘贴给 agent" });
    this.Listen(this.btnExport, "click", () => this.onExport());
    const sep = () => El("span", "boEditSep");
    bar.append(this.btnMove, this.btnMarker, sep(), this.btnUndo, this.btnRedo, sep(), this.elCount, this.btnClear, this.btnExport);
    this.barEl = bar;

    const insp = El("div", "boEditInspector boPanel");
    this.inspEl = insp;
    body.append(bar, insp);
    this.RenderDom();
  }

  RenderDom() {
    if (!this.barEl) return;
    const active = this.active && !!this.session;
    this.btnToggle.classList.toggle("on", this.active);
    const moves = this.session?.moveCount || 0, markers = this.session?.markerCount || 0;
    this.elBadge.textContent = moves + markers ? String(moves + markers) : "";
    this.barEl.hidden = !active;
    this.btnMove.classList.toggle("on", this.tool === "move");
    this.btnMarker.classList.toggle("on", this.tool === "marker");
    this.btnUndo.disabled = !this.session?.canUndo;
    this.btnRedo.disabled = !this.session?.canRedo;
    this.btnClear.disabled = !moves && !markers;
    this.btnExport.disabled = !moves && !markers;
    this.elCount.textContent = `挪了 ${moves} 处 · 标记 ${markers} 个`;
    this.RenderInspector(active);
  }

  RenderInspector(active) {
    const insp = this.inspEl;
    // 正在敲字 / 敲数时不重建（会把光标弄丢）：只在选择变了、或焦点不在检查器里时重建
    const selKey = this.sel.map(RefKey).join(",");
    const typing = insp.contains(document.activeElement) && /^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName);
    if (typing && this.inspSelKey === selKey) { this.UpdateInspectorReadouts(); return; }
    this.inspSelKey = selKey;
    insp.replaceChildren();
    insp.hidden = !active;
    if (!active) return;
    if (!this.sel.length) {
      insp.append(El("div", "boEditHead", this.tool === "marker" ? "加说明标记" : "编辑布设"));
      const help = this.tool === "marker"
        ? ["在图上点一下放一个标记；按住拖开 = 圈一片（带半径）", "放好后在这里写字，说明想怎么改", "Esc 取消"]
        : ["左键拖：挪地标、体块、人、要点、站位", "Shift + 点：多选；Shift + 拖空地：框选（一座房子框住一起挪）", "拖空地 / 右键拖：平移；滚轮缩放",
          "选中后：方向键 0.1 m（Shift 1 m），Q / E 转 15°（Shift 5°），Delete 还原", "改动不存盘，弄好点「导出给 Agent」"];
      for (const t of help) insp.append(El("div", "boEditHelp", t));
      return;
    }
    if (this.sel.length > 1) {
      const kinds = {};
      for (const r of this.sel) { const l = r.kind === "marker" ? "标记" : LAYOUT_EDIT_KINDS[r.kind].label; kinds[l] = (kinds[l] || 0) + 1; }
      insp.append(El("div", "boEditHead", `选中 ${this.sel.length} 个`));
      insp.append(El("div", "boEditSub", Object.entries(kinds).map(([k, n]) => `${k} ${n}`).join(" · ")));
      insp.append(El("div", "boEditHelp", "拖其中任意一个，整组一起挪"));
      const row = El("div", "boEditActions");
      const reset = Button("boEditAct", { icon: "reset", text: "还原这几个" });
      this.Listen(reset, "click", () => { this.session.Step(() => { for (const r of this.sel) if (r.kind !== "marker") this.session.Reset(r); }); this.Refresh(); });
      const none = Button("boEditAct", { icon: "close", text: "取消选择" });
      this.Listen(none, "click", () => { this.sel = []; this.Refresh(); });
      row.append(reset, none);
      insp.append(row);
      return;
    }
    const ref = this.sel[0];
    insp.append(El("div", "boEditHead", this.Title(ref)));
    if (ref.kind === "marker") { this.RenderMarkerInspector(insp, ref); return; }
    const kind = LAYOUT_EDIT_KINDS[ref.kind];
    const sub = [ref.kind === "block" ? (ref.meta?.semantic || "") : "", ref.path || "", kind.file === "scene" ? "场景文件" : "配置"].filter(Boolean).join(" · ");
    insp.append(El("div", "boEditSub", sub));
    const pos = this.Pos(ref);
    const grid = El("div", "boEditGrid");
    const Field = (label, value, digits, onSet) => {
      const wrap = El("label", "boEditField");
      wrap.append(El("span", "boEditLabel", label));
      const input = El("input", "boEditInput");
      input.type = "number"; input.step = digits >= 1 ? "0.1" : "1"; input.value = Finite(value) ? value.toFixed(digits) : "";
      this.Listen(input, "change", () => { const v = Number(input.value); if (Finite(v)) { this.session.Step(() => onSet(v)); this.Refresh(); } });
      this.Listen(input, "keydown", (e) => { if (e.code === "Enter") { input.blur(); } });
      wrap.append(input);
      grid.append(wrap);
      return input;
    };
    this.inX = Field("x 东", pos.x, 2, (v) => this.session.Set(ref, { x: v }));
    this.inZ = Field("z 南", pos.z, 2, (v) => this.session.Set(ref, { z: v }));
    if (kind.rot === "yawDeg") this.inRot = Field("朝向°", pos.yawDeg ?? ref.yawDeg ?? 0, 1, (v) => this.session.Set(ref, { yawDeg: v }));
    else if (kind.rot === "ry") this.inRot = Field("转角°", ((pos.ry ?? ref.ry ?? 0) * 180 / Math.PI), 1, (v) => this.session.Set(ref, { ry: Math.round(v * Math.PI / 180 * 1e4) / 1e4 }));
    else this.inRot = null;
    insp.append(grid);
    const move = this.session.MoveOf(ref);
    this.elFrom = El("div", "boEditFrom", move ? `原来 x ${Fix(move.from.x, 2)}  z ${Fix(move.from.z, 2)}` : "没挪过");
    insp.append(this.elFrom);
    const row = El("div", "boEditActions");
    if (move) {
      const reset = Button("boEditAct", { icon: "reset", text: "还原" });
      this.Listen(reset, "click", () => { this.session.Step(() => this.session.Reset(ref)); this.Refresh(); });
      row.append(reset);
    }
    if (ref.kind === "station" && Number.isInteger(ref.index) && ref.index !== this.ctx.keyframeIndex) {
      const jump = Button("boEditAct", { icon: "jump", text: "跳到这个关键帧" });
      this.Listen(jump, "click", () => this.onJump(ref.index));
      row.append(jump);
    }
    if (row.childNodes.length) insp.append(row);
  }

  RenderMarkerInspector(insp, ref) {
    const m = this.session.Marker(ref.n);
    if (!m) return;
    const area = El("textarea", "boEditText");
    area.rows = 3; area.placeholder = "想怎么改？例：这道墙往东挪到巷口 / 这里缺一个掩体";
    area.value = m.text;
    this.Listen(area, "focus", () => this.session.Begin());
    this.Listen(area, "input", () => { this.session.UpdateMarker(ref.n, { text: area.value }); this.RenderDom(); this.map.RequestFullRepaint(); });
    this.Listen(area, "blur", () => { this.session.Commit(); this.RenderDom(); });
    this.Listen(area, "keydown", (e) => { if (e.code === "Escape") { area.blur(); e.stopPropagation(); } });
    this.markerText = area;
    insp.append(area);
    const grid = El("div", "boEditGrid");
    const Field = (label, value, onSet) => {
      const wrap = El("label", "boEditField");
      wrap.append(El("span", "boEditLabel", label));
      const input = El("input", "boEditInput");
      input.type = "number"; input.step = "0.5"; input.value = Finite(value) ? String(value) : "";
      this.Listen(input, "change", () => { const v = Number(input.value); if (Finite(v)) { this.session.Step(() => onSet(v)); this.Refresh(); } });
      wrap.append(input); grid.append(wrap);
      return input;
    };
    this.inX = Field("x 东", Math.round(m.x * 100) / 100, (v) => this.session.UpdateMarker(ref.n, { x: v }));
    this.inZ = Field("z 南", Math.round(m.z * 100) / 100, (v) => this.session.UpdateMarker(ref.n, { z: v }));
    this.inRot = null;
    Field("半径 m", m.radiusM || 0, (v) => this.session.UpdateMarker(ref.n, { radiusM: Math.max(0, v) }));
    insp.append(grid);
    this.elFrom = null;
    const row = El("div", "boEditActions");
    const del = Button("boEditAct danger", { icon: "clear", text: "删掉这个标记" });
    this.Listen(del, "click", () => { this.session.Step(() => this.session.RemoveMarker(ref.n)); this.sel = []; this.Refresh(); });
    row.append(del);
    insp.append(row);
  }

  /** 敲字时只更新读数（不重建输入框）。 */
  UpdateInspectorReadouts() {
    const ref = this.sel[0];
    if (!ref || this.sel.length !== 1) return;
    const p = this.Pos(ref);
    const active = document.activeElement;
    if (p && this.inX && active !== this.inX) this.inX.value = p.x.toFixed(2);
    if (p && this.inZ && active !== this.inZ) this.inZ.value = p.z.toFixed(2);
  }

  FocusMarkerText() {
    const area = this.markerText;
    if (area && area.isConnected) { try { area.focus({ preventScroll: true }); } catch { /* 无焦点环境 */ } }
  }

  /** 测试与调试用：选择、工具、拖动状态。 */
  State() {
    return { active: this.active, tool: this.tool, selection: this.sel.map(RefKey), hover: this.hover ? RefKey(this.hover) : null, dragging: this.drag?.type || null };
  }

  Dispose() {
    for (const off of this.off) off();
    this.off = [];
    this.btnToggle?.remove();
    this.barEl?.remove();
    this.inspEl?.remove();
    if (this.map.editLayer === this) this.map.SetEditLayer(null);
  }
}

function Pin(ctx, x, y, label) {
  ctx.save();
  ctx.beginPath(); ctx.arc(x, y, 9.5, 0, Math.PI * 2);
  ctx.fillStyle = "#f3efe4"; ctx.fill();
  ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI * 2);
  ctx.fillStyle = Css(MARKER_RGB); ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.font = `700 10px ${FONT_STACK}`;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(label, x, y + 0.5);
  ctx.restore();
}

function Tip(ctx, view, x, y, text, sub) {
  ctx.save();
  ctx.textBaseline = "middle"; ctx.textAlign = "left";
  ctx.font = `600 12px ${FONT_STACK}`;
  const tw = ctx.measureText(text).width;
  ctx.font = `500 11px ${MONO_STACK}`;
  const sw = sub ? ctx.measureText(sub).width : 0;
  const bw = Math.max(tw, sw) + 16, bh = sub ? 38 : 24;
  let bx = x + 16, by = y + 12;
  if (bx + bw > view.w - 6) bx = x - 16 - bw;
  if (by + bh > view.h - 6) by = y - 12 - bh;
  ctx.fillStyle = "rgba(14,16,17,0.92)";
  ctx.fillRect(bx, by, bw, bh);
  ctx.strokeStyle = "rgba(196,198,187,0.35)"; ctx.lineWidth = 1;
  ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
  ctx.fillStyle = "#eeefec";
  ctx.font = `600 12px ${FONT_STACK}`;
  ctx.fillText(text, bx + 8, by + 12.5);
  if (sub) { ctx.fillStyle = "#b9bcb0"; ctx.font = `500 11px ${MONO_STACK}`; ctx.fillText(sub, bx + 8, by + 27); }
  ctx.restore();
}
