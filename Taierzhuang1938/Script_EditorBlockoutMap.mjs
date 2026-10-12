// STUB：集成时由 C 包替换
//
// 白盒关卡编辑器的纸面俯视图（docs/Data_EditorBlockout.md §4.1）的最小占位实现：接口与 §4.1 逐字相同，
// canvas 2D、零 three。北朝上（屏幕 x = 世界 x，屏幕 y = 世界 z）。静态层（纸色 + 高度晕染 + 等高线 + 块脚印）
// 每关烘一次；小地图 / 全关总图每次刷新 = 一次 drawImage + 动态标记。不往 window 挂任何监听。

const PAPER = [230, 223, 205];
const COLORS = { ija: "#c4442f", nra: "#3d74b0", civ: "#5d8f42", gold: "#b8892a", ink: "#3b3a35", cover: "#8a877c", water: "#9cc3dc" };
const SKIP_SEMANTICS = new Set(["airWall", "void", "coping"]);

export class BlockoutMap {
  constructor() {
    this.scene = null;
    this.static = null;      // { canvas, pxPerM, minX, minZ }
    this.keyframes = [];
    this.index = 0;
    this.dynamic = { player: null, units: [], pois: [], next: null };
    this.layers = { arcs: true, intents: true, labels: true };
    this.view = { cx: 0, cz: 0, pxPerM: 1 };
    this.fullSize = { w: 1, h: 1 };
    this.bakeToken = 0;
  }

  SetScene({ levelKey, bounds, blocks, sampleHeight, naturalHeight = null, ways = null }) {
    this.scene = { levelKey, bounds: { ...bounds }, blocks: blocks || [], sampleHeight, naturalHeight, ways: ways || { roads: [], trenches: [] } };
    this.static = null;
    this.bakeToken += 1;
    this.FitBounds();
  }

  /** 空闲分块烘静态层。 */
  Bake() {
    const scene = this.scene;
    if (!scene || typeof document === "undefined") return Promise.resolve(false);
    const token = this.bakeToken;
    const b = scene.bounds, w = b.maxX - b.minX, d = b.maxZ - b.minZ;
    const pxPerM = Math.max(0.5, Math.min(2, 1400 / Math.max(w, d)));
    const cw = Math.max(1, Math.round(w * pxPerM)), ch = Math.max(1, Math.round(d * pxPerM));
    const canvas = document.createElement("canvas");
    canvas.width = cw; canvas.height = ch;
    const ctx = canvas.getContext("2d");
    const image = ctx.createImageData(cw, ch);
    const heights = new Float32Array(cw * ch);
    let row = 0;
    return new Promise((resolve) => {
      const Step = () => {
        if (token !== this.bakeToken) { resolve(false); return; }
        const until = Math.min(ch, row + 48);
        for (; row < until; row++) {
          const z = b.minZ + (row + 0.5) / pxPerM;
          for (let col = 0; col < cw; col++) heights[row * cw + col] = scene.sampleHeight(b.minX + (col + 0.5) / pxPerM, z);
        }
        if (row < ch) { setTimeout(Step, 0); return; }
        for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
          const i = y * cw + x, h = heights[i];
          const hx = heights[y * cw + Math.min(cw - 1, x + 1)] - h, hz = heights[Math.min(ch - 1, y + 1) * cw + x] - h;
          const shade = Math.max(0.78, Math.min(1.08, 1 + (-hx - hz) * pxPerM * 0.35));
          let r = PAPER[0] * shade, g = PAPER[1] * shade, bl = PAPER[2] * shade;
          if (scene.naturalHeight && scene.naturalHeight(b.minX + (x + 0.5) / pxPerM, b.minZ + (y + 0.5) / pxPerM) - h > 0.25) { r *= 0.9; g *= 0.86; bl *= 0.8; }
          const c1 = Math.floor(h), c1x = Math.floor(h + hx), c1z = Math.floor(h + hz);
          if (c1 !== c1x || c1 !== c1z) {
            const strong = (Math.floor(h / 5) !== Math.floor((h + hx) / 5)) || (Math.floor(h / 5) !== Math.floor((h + hz) / 5));
            const k = strong ? 0.72 : 0.88;
            r *= k; g *= k; bl *= k;
          }
          image.data[i * 4] = r; image.data[i * 4 + 1] = g; image.data[i * 4 + 2] = bl; image.data[i * 4 + 3] = 255;
        }
        ctx.putImageData(image, 0, 0);
        ctx.save();
        ctx.scale(pxPerM, pxPerM);
        ctx.translate(-b.minX, -b.minZ);
        this._PaintWays(ctx, 1 / pxPerM);
        this._PaintBlocks(ctx);
        ctx.restore();
        this.static = { canvas, pxPerM, minX: b.minX, minZ: b.minZ };
        resolve(true);
      };
      Step();
    });
  }

  _PaintWays(ctx, px) {
    const ways = this.scene?.ways;
    if (!ways) return;
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.strokeStyle = "rgba(150,130,96,.45)"; ctx.lineWidth = Math.max(px * 2, 2.4);
    for (const road of ways.roads || []) { ctx.beginPath(); road.forEach((p, i) => (i ? ctx.lineTo(p.x, p.z) : ctx.moveTo(p.x, p.z))); ctx.stroke(); }
    ctx.strokeStyle = "rgba(110,88,60,.5)"; ctx.lineWidth = Math.max(px * 1.5, 1.6);
    for (const trench of ways.trenches || []) { ctx.beginPath(); trench.forEach((p, i) => (i ? ctx.lineTo(p.x, p.z) : ctx.moveTo(p.x, p.z))); ctx.stroke(); }
  }

  _PaintBlocks(ctx) {
    for (const block of this.scene?.blocks || []) {
      if (SKIP_SEMANTICS.has(block.semantic) || block.tag === "airWall" || block.h < 0.35) continue;
      ctx.fillStyle = block.semantic === "water" ? COLORS.water : (block.semantic === "cover" || block.h <= 1.4) ? COLORS.cover : COLORS.ink;
      ctx.save();
      ctx.translate(block.x, block.z);
      ctx.rotate(-(block.ry || 0));
      ctx.fillRect(-block.w / 2, -block.d / 2, block.w, block.d);
      ctx.restore();
    }
  }

  SetKeyframes(list, index) { this.keyframes = list || []; this.index = index; }
  SetDynamic(dynamic) { this.dynamic = { ...this.dynamic, ...dynamic }; }
  SetLayers(layers) { Object.assign(this.layers, layers || {}); }

  _Dpr(canvas) { return canvas.clientWidth ? canvas.width / canvas.clientWidth : 1; }

  /** 北朝上，以玩家为中心并夹在边界内。pxPerM 按 CSS 像素。 */
  PaintMini(canvas, { pxPerM = 1.6 } = {}) {
    if (!canvas || !this.scene) return;
    const dpr = this._Dpr(canvas), w = canvas.width / dpr, h = canvas.height / dpr, b = this.scene.bounds;
    const p = this.dynamic.player || { x: (b.minX + b.maxX) / 2, z: (b.minZ + b.maxZ) / 2 };
    const halfW = w / 2 / pxPerM, halfH = h / 2 / pxPerM;
    const cx = Math.max(b.minX + halfW, Math.min(b.maxX - halfW, p.x));
    const cz = Math.max(b.minZ + halfH, Math.min(b.maxZ - halfH, p.z));
    this._Paint(canvas, { cx: (b.maxX - b.minX) < 2 * halfW ? (b.minX + b.maxX) / 2 : cx, cz: (b.maxZ - b.minZ) < 2 * halfH ? (b.minZ + b.maxZ) / 2 : cz, pxPerM }, false);
  }

  PaintFull(canvas) {
    if (!canvas || !this.scene) return;
    const dpr = this._Dpr(canvas);
    this.fullSize = { w: canvas.width / dpr, h: canvas.height / dpr };
    if (!this.fullFitted) { this.FitBounds(); this.fullFitted = true; }
    this._Paint(canvas, this.view, true);
  }

  _Paint(canvas, view, full) {
    const ctx = canvas.getContext("2d");
    const dpr = this._Dpr(canvas), w = canvas.width / dpr, h = canvas.height / dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = `rgb(${PAPER.join(",")})`;
    ctx.fillRect(0, 0, w, h);
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.scale(view.pxPerM, view.pxPerM);
    ctx.translate(-view.cx, -view.cz);
    const s = this.static;
    if (s) {
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(s.canvas, s.minX, s.minZ, s.canvas.width / s.pxPerM, s.canvas.height / s.pxPerM);
    }
    if (full && view.pxPerM >= 4) this._PaintBlocks(ctx);
    const px = 1 / view.pxPerM;
    if (full) this._PaintRoute(ctx, px);
    this._PaintDynamic(ctx, px);
    ctx.restore();
  }

  _PaintRoute(ctx, px) {
    const list = this.keyframes;
    if (!list.length) return;
    ctx.setLineDash([4 * px, 4 * px]);
    ctx.strokeStyle = "rgba(90,80,60,.7)"; ctx.lineWidth = 1.2 * px;
    ctx.beginPath(); list.forEach((kf, i) => (i ? ctx.lineTo(kf.player.x, kf.player.z) : ctx.moveTo(kf.player.x, kf.player.z))); ctx.stroke();
    ctx.setLineDash([]);
    list.forEach((kf, i) => {
      ctx.fillStyle = i === this.index ? COLORS.gold : "#5b5446";
      ctx.beginPath(); ctx.arc(kf.player.x, kf.player.z, (i === this.index ? 5 : 3.5) * px, 0, Math.PI * 2); ctx.fill();
      ctx.font = `${10 * px}px sans-serif`; ctx.fillText(String(kf.stage).padStart(2, "0"), kf.player.x + 5 * px, kf.player.z - 4 * px);
    });
  }

  _PaintDynamic(ctx, px) {
    const { units, pois, next, player } = this.dynamic;
    for (const unit of units || []) {
      if (unit.visible === false) continue;
      const color = COLORS[unit.side] || COLORS.nra;
      if (this.layers.arcs && unit.arc) {
        const a0 = (-90 - (unit.arc.yawDeg ?? unit.yawDeg) - unit.arc.halfDeg) * Math.PI / 180;
        const a1 = (-90 - (unit.arc.yawDeg ?? unit.yawDeg) + unit.arc.halfDeg) * Math.PI / 180;
        ctx.fillStyle = color; ctx.globalAlpha = 0.14;
        ctx.beginPath(); ctx.moveTo(unit.x, unit.z); ctx.arc(unit.x, unit.z, unit.arc.rangeM, a0, a1); ctx.closePath(); ctx.fill();
        ctx.globalAlpha = 1;
      }
      if (this.layers.intents && unit.intent?.length && !unit.moving) {
        ctx.setLineDash([3 * px, 3 * px]); ctx.strokeStyle = color; ctx.lineWidth = 1.4 * px;
        ctx.beginPath(); ctx.moveTo(unit.x, unit.z); for (const p of unit.intent) ctx.lineTo(p.x, p.z); ctx.stroke(); ctx.setLineDash([]);
      }
      const r = (unit.kind === "tank" ? 6 : 4) * px;
      ctx.save(); ctx.translate(unit.x, unit.z); ctx.rotate(-(unit.yawDeg || 0) * Math.PI / 180);
      ctx.fillStyle = color;
      if (unit.kind === "tank") ctx.fillRect(-1.1, -2.9, 2.2, 5.8);
      else if (unit.side === "ija") { ctx.beginPath(); ctx.moveTo(0, -r * 1.3); ctx.lineTo(r, r); ctx.lineTo(-r, r); ctx.closePath(); ctx.fill(); }
      else if (unit.kind === "litter" || unit.kind === "cart") ctx.fillRect(-r * 0.7, -r * 1.2, r * 1.4, r * 2.4);
      else { ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = color; ctx.lineWidth = 1.2 * px; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -r * 2); ctx.stroke(); }
      ctx.restore();
      if (unit.guess) { ctx.setLineDash([2 * px, 2 * px]); ctx.strokeStyle = color; ctx.beginPath(); ctx.arc(unit.x, unit.z, r * 2, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); }
    }
    for (const poi of pois || []) {
      ctx.fillStyle = COLORS.gold;
      ctx.save(); ctx.translate(poi.x, poi.z); ctx.rotate(Math.PI / 4); ctx.fillRect(-3 * px, -3 * px, 6 * px, 6 * px); ctx.restore();
    }
    if (next) {
      ctx.strokeStyle = COLORS.gold; ctx.lineWidth = 2 * px;
      ctx.beginPath(); ctx.arc(next.x, next.z, Math.max(6 * px, next.radiusM || 3), 0, Math.PI * 2); ctx.stroke();
    }
    if (player) {
      ctx.save(); ctx.translate(player.x, player.z); ctx.rotate(-(player.yawDeg || 0) * Math.PI / 180);
      ctx.fillStyle = "rgba(184,137,42,.18)";
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 40 * px, -Math.PI / 2 - 0.5, -Math.PI / 2 + 0.5); ctx.closePath(); ctx.fill();
      ctx.fillStyle = COLORS.gold; ctx.strokeStyle = "#2b2a26"; ctx.lineWidth = px;
      ctx.beginPath(); ctx.moveTo(0, -7 * px); ctx.lineTo(5 * px, 6 * px); ctx.lineTo(0, 3 * px); ctx.lineTo(-5 * px, 6 * px); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
    }
  }

  FitBounds() {
    const b = this.scene?.bounds;
    if (!b) return;
    const { w, h } = this.fullSize;
    this.view = { cx: (b.minX + b.maxX) / 2, cz: (b.minZ + b.maxZ) / 2,
      pxPerM: Math.max(0.05, Math.min(w / (b.maxX - b.minX), h / (b.maxZ - b.minZ)) * 0.94) };
  }

  ZoomAt(px, py, factor) {
    const before = this.ScreenToWorld(px, py);
    this.view.pxPerM = Math.max(0.05, Math.min(40, this.view.pxPerM * factor));
    const after = this.ScreenToWorld(px, py);
    this.view.cx += before.x - after.x;
    this.view.cz += before.z - after.z;
  }

  PanBy(dxPx, dyPx) { this.view.cx -= dxPx / this.view.pxPerM; this.view.cz -= dyPx / this.view.pxPerM; }

  ScreenToWorld(px, py) {
    return { x: this.view.cx + (px - this.fullSize.w / 2) / this.view.pxPerM, z: this.view.cz + (py - this.fullSize.h / 2) / this.view.pxPerM };
  }

  WorldToScreen(x, z) {
    return { x: this.fullSize.w / 2 + (x - this.view.cx) * this.view.pxPerM, y: this.fullSize.h / 2 + (z - this.view.cz) * this.view.pxPerM };
  }

  PickKeyframe(px, py) {
    let best = -1, bestD = 10;
    this.keyframes.forEach((kf, i) => {
      const s = this.WorldToScreen(kf.player.x, kf.player.z);
      const d = Math.hypot(s.x - px, s.y - py);
      if (d < bestD) { bestD = d; best = i; }
    });
    return best;
  }

  Dispose() { this.static = null; this.scene = null; this.bakeToken += 1; }
}
