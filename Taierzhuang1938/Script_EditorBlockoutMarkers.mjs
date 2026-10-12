// 白盒关卡编辑器的 3D 标记（docs/Data_EditorBlockout.md §5.5）。
//
// 全部画在 post.AddDebugOverlay(root) 里：默认白盒画质会把场景里的 Sprite / Points 藏掉、
// 把普通 Mesh 涂灰，调试叠加层不受影响。颜色按曝光预补（同 Script_EditorAi 的叠加层：
// 峰值压到 0.75，否则 ACES 会把阵营色冲成白）。
//
// 看得见 / 被挡住两种画法：同一份几何画两遍 —— 一遍做深度测试（亮），一遍不做（暗、半透明）。
// 被墙挡住的人也找得到，但一眼分得出现在看不看得见他。「穿墙显示」关掉第二遍。
//
// 头顶标签是 DOM（挂在单位的世界位置上，不挂 actor 子节点）：有名字的「色点 + 名字」，
// 无名普通兵只有色点；120 m 外只留有名字的与机枪；近的先排、互相避让；
// 下一步目标在屏幕外时贴边显示箭头 + 「下一步 · 文字 · 距离」。

import * as THREE from "three";
import { BLOCKOUT_MG_WEAPONS } from "./Script_EditorBlockoutConfig.mjs";

export const BLOCKOUT_MARKER_COLORS = Object.freeze({
  ija: "#d6604a", nra: "#9dc0e4", civ: "#9fc47f",
  next: "#dfbd68", objective: "#dfbd68", poi: "#e3cf93", landmark: "#d4d8cf", danger: "#e58a4a",
});
const OVERLAY_PEAK = 0.75;
const LABEL_FAR_M = 120;
const FLASH_S = 0.6;
const DEG = Math.PI / 180;

const RING_RADIUS = { soldier: 0.55, officer: 0.6, civilian: 0.5, child: 0.4, tank: 3.4, litter: 1.9, cart: 2.4, animal: 1.2 };
const HEAD_Y = { soldier: 2.05, officer: 2.05, civilian: 2.0, child: 1.45, tank: 3.1, litter: 2.1, cart: 2.2, animal: 1.9 };

function Rgba(hex, alpha = 1) {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b, alpha];
}

/** 一段几何（三角 + 线段），各自按顶点存 xyz + rgba。 */
class Chunk {
  constructor(groundAt) { this.groundAt = groundAt; this.tri = []; this.line = []; }
  Y(x, z, lift) { return this.groundAt(x, z) + lift; }
  Tri(a, b, c, rgba) { this.tri.push(...a, ...rgba, ...b, ...rgba, ...c, ...rgba); }
  Seg(a, b, rgba) { this.line.push(...a, ...rgba, ...b, ...rgba); }
  /** 贴地的带子（每段一个四边形）。dash：[实长, 空长]。 */
  Ribbon(points, width, rgba, { lift = 0.08, dash = null } = {}) {
    if (points.length < 2) return;
    let along = 0;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      if (len < 1e-4) continue;
      const nx = -(b.z - a.z) / len * width / 2, nz = (b.x - a.x) / len * width / 2;
      const pieces = dash ? [] : [[0, len]];
      if (dash) {
        // 每一步至少前进 1 mm：浮点取模卡在段界上时也不会原地打转
        const period = dash[0] + dash[1];
        let s = 0, phase = along % period;
        while (s < len - 1e-6) {
          const onDash = phase < dash[0];
          const step = Math.max(1e-3, Math.min(onDash ? dash[0] - phase : period - phase, len - s));
          if (onDash) pieces.push([s, Math.min(len, s + step)]);
          s += step;
          phase += step;
          if (phase >= period - 1e-9) phase -= period;
        }
      }
      for (const [s0, s1] of pieces) {
        // 长段按 2 m 切开贴地，别让带子在起伏处钻进土里
        const steps = Math.max(1, Math.ceil((s1 - s0) / 2));
        for (let k = 0; k < steps; k++) {
          const t0 = (s0 + (s1 - s0) * k / steps) / len, t1 = (s0 + (s1 - s0) * (k + 1) / steps) / len;
          const x0 = a.x + (b.x - a.x) * t0, z0 = a.z + (b.z - a.z) * t0;
          const x1 = a.x + (b.x - a.x) * t1, z1 = a.z + (b.z - a.z) * t1;
          const y0 = this.Y(x0, z0, lift), y1 = this.Y(x1, z1, lift);
          const p0 = [x0 - nx, y0, z0 - nz], p1 = [x0 + nx, y0, z0 + nz], p2 = [x1 + nx, y1, z1 + nz], p3 = [x1 - nx, y1, z1 - nz];
          this.Tri(p0, p1, p2, rgba); this.Tri(p0, p2, p3, rgba);
        }
      }
      along += len;
    }
  }
  Ring(cx, cz, radius, width, rgba, { dash = false, segments = 28, lift = 0.08 } = {}) {
    for (let i = 0; i < segments; i++) {
      if (dash && i % 2) continue;
      const a0 = i / segments * Math.PI * 2, a1 = (i + 1) / segments * Math.PI * 2;
      const ri = radius - width / 2, ro = radius + width / 2;
      const P = (a, r) => { const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r; return [x, this.Y(x, z, lift), z]; };
      const p0 = P(a0, ri), p1 = P(a0, ro), p2 = P(a1, ro), p3 = P(a1, ri);
      this.Tri(p0, p1, p2, rgba); this.Tri(p0, p2, p3, rgba);
    }
  }
  /** 地上的箭头头部（实心三角）。dir 是单位向量 {x,z}。 */
  Head(tip, dir, size, rgba, lift = 0.1) {
    const bx = tip.x - dir.x * size, bz = tip.z - dir.z * size;
    const nx = -dir.z * size * 0.55, nz = dir.x * size * 0.55;
    this.Tri([tip.x, this.Y(tip.x, tip.z, lift), tip.z], [bx + nx, this.Y(bx + nx, bz + nz, lift), bz + nz],
      [bx - nx, this.Y(bx - nx, bz - nz, lift), bz - nz], rgba);
  }
  /** 射界扇：贴地半透明填充 + 两条边线与外弧（线段）。 */
  Fan(cx, cz, yawDeg, halfDeg, range, fill, edge) {
    const angSteps = Math.max(4, Math.ceil(halfDeg * 2 / 5));
    const radSteps = Math.max(2, Math.ceil(range / 3));
    const P = (k, j) => {
      const a = (yawDeg - halfDeg + 2 * halfDeg * k / angSteps) * DEG, r = range * j / radSteps;
      const x = cx - Math.sin(a) * r, z = cz - Math.cos(a) * r;
      return [x, this.Y(x, z, 0.14), z];
    };
    const grid = [];
    for (let j = 0; j <= radSteps; j++) { const row = []; for (let k = 0; k <= angSteps; k++) row.push(P(k, j)); grid.push(row); }
    for (let j = 0; j < radSteps; j++) for (let k = 0; k < angSteps; k++) {
      const a = grid[j][k], b = grid[j][k + 1], c = grid[j + 1][k + 1], d = grid[j + 1][k];
      // 填充向外渐淡：近处实一点，射程边缘轻一点
      const f = [fill[0], fill[1], fill[2], fill[3] * (1 - 0.55 * j / radSteps)];
      if (j === 0) this.Tri(a, c, d, f);
      else { this.Tri(a, b, c, f); this.Tri(a, c, d, f); }
    }
    for (let j = 0; j < radSteps; j++) { this.Seg(grid[j][0], grid[j + 1][0], edge); this.Seg(grid[j][angSteps], grid[j + 1][angSteps], edge); }
    for (let k = 0; k < angSteps; k++) this.Seg(grid[radSteps][k], grid[radSteps][k + 1], edge);
  }
  /** 竖光柱：围一圈的竖线。 */
  Pillar(x, z, height, radius, rgba, count = 4) {
    const y = this.groundAt(x, z);
    for (let i = 0; i < count; i++) {
      const a = i / count * Math.PI * 2;
      const px = x + Math.cos(a) * radius, pz = z + Math.sin(a) * radius;
      this.Seg([px, y, pz], [px, y + height, pz], rgba);
    }
    if (count > 1) this.Seg([x, y, z], [x, y + height, z], rgba);
  }
}

/** 一层可增长的动态缓冲（三角或线段），两遍画法共用同一份 geometry。 */
class DynamicLayer {
  constructor(name, Ctor, makeMaterial) {
    this.geometry = new THREE.BufferGeometry();
    this.capacity = 0;
    this.count = 0;
    this._Allocate(2048);
    this.visibleMaterial = makeMaterial(true);
    this.occludedMaterial = makeMaterial(false);
    this.visible = new Ctor(this.geometry, this.visibleMaterial);
    this.occluded = new Ctor(this.geometry, this.occludedMaterial);
    for (const [object, order, suffix] of [[this.occluded, 997, "Occluded"], [this.visible, 999, "Visible"]]) {
      object.name = `${name}${suffix}`;
      object.frustumCulled = false;
      object.matrixAutoUpdate = false;
      object.renderOrder = order;
    }
  }
  _Allocate(capacity) {
    this.capacity = capacity;
    this.positions = new Float32Array(capacity * 3);
    this.colors = new Float32Array(capacity * 4);
    this.geometry.setAttribute("position", new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute("color", new THREE.BufferAttribute(this.colors, 4).setUsage(THREE.DynamicDrawUsage));
  }
  Fill(chunks, key) {
    let vertices = 0;
    for (const chunk of chunks) vertices += chunk[key].length / 7;
    if (vertices > this.capacity) {
      this.geometry.dispose();
      this._Allocate(Math.max(vertices, this.capacity * 2));
    }
    let v = 0;
    for (const chunk of chunks) {
      const data = chunk[key];
      for (let i = 0; i < data.length; i += 7, v++) {
        this.positions[v * 3] = data[i]; this.positions[v * 3 + 1] = data[i + 1]; this.positions[v * 3 + 2] = data[i + 2];
        this.colors[v * 4] = data[i + 3]; this.colors[v * 4 + 1] = data[i + 4]; this.colors[v * 4 + 2] = data[i + 5]; this.colors[v * 4 + 3] = data[i + 6];
      }
    }
    this.count = v;
    const position = this.geometry.getAttribute("position"), color = this.geometry.getAttribute("color");
    position.needsUpdate = true; color.needsUpdate = true;
    position.clearUpdateRanges(); color.clearUpdateRanges();
    if (v) { position.addUpdateRange(0, v * 3); color.addUpdateRange(0, v * 4); }
    this.geometry.setDrawRange(0, v);
  }
  Dispose() { this.geometry.dispose(); this.visibleMaterial.dispose(); this.occludedMaterial.dispose(); }
}

function MeshMaterial(depthTest) {
  return new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: depthTest ? 1 : 0.3,
    depthTest, depthWrite: false, toneMapped: false, fog: false, side: THREE.DoubleSide });
}
function LineMaterial(depthTest) {
  return new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: depthTest ? 1 : 0.3,
    depthTest, depthWrite: false, toneMapped: false, fog: false });
}

function IsMachineGun(unit) { return BLOCKOUT_MG_WEAPONS.includes(unit.weapon); }

export class BlockoutMarkers {
  constructor({ post, camera, groundAt, labelRoot }) {
    this.post = post;
    this.camera = camera;
    this.groundAt = groundAt;
    this.labelRoot = labelRoot;
    this.root = new THREE.Group();
    this.root.name = "BlockoutMarkers";
    this.tris = new DynamicLayer("BlockoutMarkerTris", THREE.Mesh, MeshMaterial);
    this.lines = new DynamicLayer("BlockoutMarkerLines", THREE.LineSegments, LineMaterial);
    this.root.add(this.tris.occluded, this.lines.occluded, this.tris.visible, this.lines.visible);
    const materials = [this.tris.visibleMaterial, this.tris.occludedMaterial, this.lines.visibleMaterial, this.lines.occludedMaterial];
    this.root.userData.PrepareDebugOverlay = ({ exposure }) => {
      const gain = OVERLAY_PEAK / THREE.MathUtils.clamp(exposure || 1, 0.05, 20);
      for (const material of materials) material.color.setScalar(gain);
    };
    if (post?.AddDebugOverlay) { post.AddDebugOverlay(this.root); this.host = "post"; }
    else { camera.parent?.add?.(this.root); this.host = "scene"; }
    this.layers = { arcs: "default", intents: true, labels: true, xray: true };
    this.units = [];
    this.pois = [];
    this.next = null;
    this.chunks = new Map();     // key -> { sig, chunk }
    this.dirty = true;
    this.time = 0;
    this.labels = [];
    this.edge = null;
    this._v = new THREE.Vector3();
    this._w = new THREE.Vector3();
    this._camera = new THREE.Vector3();
    this.stats = { units: 0, tris: 0, lines: 0, labels: 0 };
  }

  // -------------------------------------------------------------------------
  // 数据

  SetUnits(units) {
    this.units = units || [];
    const alive = new Set();
    for (const unit of this.units) {
      const key = `u:${unit.id}`;
      alive.add(key);
      const arc = this.layers.arcs === "off" || this.layers.arcs === false ? null : unit.arc;
      const sig = `${unit.x.toFixed(2)},${unit.z.toFixed(2)},${unit.yawDeg.toFixed(1)},${unit.visible !== false},${unit.side},${unit.kind},${unit.guess}`
        + `,${arc ? `${arc.halfDeg},${arc.rangeM},${(arc.yawDeg ?? unit.yawDeg).toFixed(1)}` : "-"}`
        + `,${this.layers.intents && !unit.moving && unit.intent?.length ? unit.intent.map(p => `${p.x},${p.z}`).join(";") : "-"}`;
      const entry = this.chunks.get(key);
      if (entry && entry.sig === sig) continue;
      this.chunks.set(key, { sig, chunk: this._UnitChunk(unit, arc) });
      this.dirty = true;
    }
    for (const key of [...this.chunks.keys()]) if (key.startsWith("u:") && !alive.has(key)) { this.chunks.delete(key); this.dirty = true; }
  }

  SetPois(pois) {
    this.pois = pois || [];
    const chunk = new Chunk(this.groundAt);
    for (const poi of this.pois) {
      const color = BLOCKOUT_MARKER_COLORS[poi.kind] || BLOCKOUT_MARKER_COLORS.poi;
      chunk.Pillar(poi.x, poi.z, 8, 0.06, Rgba(color, 0.95), 3);
      chunk.Ring(poi.x, poi.z, Math.max(0.6, poi.radiusM || 2), 0.12, Rgba(color, 0.85), { segments: 36 });
    }
    this.chunks.set("pois", { sig: "", chunk });
    this.dirty = true;
  }

  SetNext(next) {
    this.next = next && Number.isFinite(next.x) && Number.isFinite(next.z) ? { ...next } : null;
    if (!this.next) { this.chunks.delete("next"); this.dirty = true; }
  }

  SetLayers(layers) {
    const before = JSON.stringify(this.layers);
    Object.assign(this.layers, layers || {});
    if (this.layers.arcs === true) this.layers.arcs = "default";
    if (JSON.stringify(this.layers) === before) return;
    for (const key of [...this.chunks.keys()]) if (key.startsWith("u:")) this.chunks.delete(key);
    this.tris.occluded.visible = this.lines.occluded.visible = this.layers.xray !== false;
    this.SetUnits(this.units);
    this.dirty = true;
  }

  _UnitChunk(unit, arc) {
    const chunk = new Chunk(this.groundAt);
    if (unit.visible === false) return chunk;
    const color = BLOCKOUT_MARKER_COLORS[unit.side] || BLOCKOUT_MARKER_COLORS.nra;
    const ring = RING_RADIUS[unit.kind] || RING_RADIUS.soldier;
    chunk.Ring(unit.x, unit.z, ring, unit.kind === "tank" ? 0.2 : 0.11, Rgba(color, 0.95), { dash: !!unit.guess, segments: unit.kind === "tank" ? 40 : 24 });
    // 朝向短箭头：从地环边上伸出去
    const fx = -Math.sin(unit.yawDeg * DEG), fz = -Math.cos(unit.yawDeg * DEG);
    const reach = ring + (unit.kind === "tank" ? 2.2 : 0.9);
    const start = { x: unit.x + fx * ring, z: unit.z + fz * ring }, tip = { x: unit.x + fx * reach, z: unit.z + fz * reach };
    chunk.Ribbon([start, { x: tip.x - fx * 0.25, z: tip.z - fz * 0.25 }], 0.1, Rgba(color, 0.95));
    chunk.Head(tip, { x: fx, z: fz }, unit.kind === "tank" ? 0.9 : 0.42, Rgba(color, 0.95));
    if (arc) {
      chunk.Fan(unit.x, unit.z, arc.yawDeg ?? unit.yawDeg, arc.halfDeg, arc.rangeM, Rgba(color, 0.13), Rgba(color, 0.85));
    }
    if (this.layers.intents && !unit.moving && unit.intent?.length) {
      const route = [{ x: unit.x, z: unit.z }, ...unit.intent];
      chunk.Ribbon(route, 0.16, Rgba(color, 0.9), { dash: [1.1, 0.8] });
      const a = route[route.length - 2], b = route[route.length - 1];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      if (len > 0.2) chunk.Head(b, { x: (b.x - a.x) / len, z: (b.z - a.z) / len }, 0.9, Rgba(color, 0.95));
    }
    return chunk;
  }

  /** 地环闪一下（§5.2：原地出现 / 过渡开始时消失的人）。 */
  Flash(x, z, side) {
    this.flashes = (this.flashes || []).filter(f => this.time - f.t0 < FLASH_S);
    this.flashes.push({ x, z, color: BLOCKOUT_MARKER_COLORS[side] || BLOCKOUT_MARKER_COLORS.nra, t0: this.time });
  }

  _FlashChunk() {
    const chunk = new Chunk(this.groundAt);
    for (const f of this.flashes) {
      const k = (this.time - f.t0) / FLASH_S;
      if (k < 0 || k >= 1) continue;
      chunk.Ring(f.x, f.z, 0.5 + 1.6 * k, 0.16, Rgba(f.color, 0.95 * (1 - k)), { segments: 24 });
    }
    return chunk;
  }

  _NextChunk() {
    const n = this.next;
    const chunk = new Chunk(this.groundAt);
    const gold = BLOCKOUT_MARKER_COLORS.next;
    chunk.Pillar(n.x, n.z, 14, 0.16, Rgba(gold, 1), 6);
    const base = Math.max(0.8, n.radiusM || 3);
    const breath = 1 + 0.1 * Math.sin(this.time * 3.2);
    chunk.Ring(n.x, n.z, base * breath, 0.18, Rgba(gold, 0.95), { segments: 40 });
    chunk.Ring(n.x, n.z, base * 0.35, 0.1, Rgba(gold, 0.7), { segments: 20 });
    return chunk;
  }

  _Rebuild() {
    const chunks = [...this.chunks.values()].map(entry => entry.chunk);
    this.tris.Fill(chunks, "tri");
    this.lines.Fill(chunks, "line");
    this.dirty = false;
    this.stats.tris = this.tris.count / 3;
    this.stats.lines = this.lines.count / 2;
    this.stats.units = this.units.length;
  }

  // -------------------------------------------------------------------------
  // 每帧

  Update(dt) {
    this.time += dt;
    if (this.next) { this.chunks.set("next", { sig: "", chunk: this._NextChunk() }); this.dirty = true; }
    if (this.flashes?.length) {
      this.flashes = this.flashes.filter(f => this.time - f.t0 < FLASH_S);
      this.chunks.set("flash", { sig: "", chunk: this._FlashChunk() });
      this.dirty = true;
    } else if (this.chunks.has("flash")) { this.chunks.delete("flash"); this.dirty = true; }
    if (this.dirty) this._Rebuild();
    this._UpdateLabels();
  }

  _Project(x, y, z) {
    const camera = this.camera;
    this._w.set(x, y, z).applyMatrix4(camera.matrixWorldInverse);
    const behind = this._w.z >= 0;
    this._v.set(x, y, z).project(camera);
    const w = innerWidth, h = innerHeight;
    return { sx: (this._v.x * 0.5 + 0.5) * w, sy: (-this._v.y * 0.5 + 0.5) * h, behind,
      onScreen: !behind && Math.abs(this._v.x) < 1 && Math.abs(this._v.y) < 1, ndcX: this._v.x, ndcY: this._v.y };
  }

  _Label(index) {
    let el = this.labels[index];
    if (!el) {
      el = document.createElement("div");
      el.className = "blockoutLabel";
      el.style.cssText = "position:absolute;left:0;top:0;display:none;align-items:center;gap:5px;white-space:nowrap;"
        + "font:12px/16px var(--ui-font, system-ui, sans-serif);color:#eef0ea;padding:1px 6px 1px 4px;"
        + "background:rgba(10,13,14,.62);border:1px solid rgba(196,198,187,.22);pointer-events:none;will-change:transform;";
      const dot = document.createElement("i");
      dot.style.cssText = "display:inline-block;width:8px;height:8px;flex:none;";
      const text = document.createElement("span");
      el.append(dot, text);
      el._dot = dot; el._text = text;
      this.labelRoot.appendChild(el);
      this.labels[index] = el;
    }
    return el;
  }

  _UpdateLabels() {
    if (!this.labelRoot || typeof document === "undefined") return;
    const camera = this.camera;
    camera.getWorldPosition(this._camera);
    const cx = this._camera.x, cz = this._camera.z;
    const candidates = [];
    if (this.layers.labels !== false) {
      for (const unit of this.units) {
        if (unit.visible === false) continue;
        const distance = Math.hypot(unit.x - cx, unit.z - cz);
        const named = !!unit.name;
        if (distance > LABEL_FAR_M && !named && !IsMachineGun(unit)) continue;
        const y = this.groundAt(unit.x, unit.z) + (HEAD_Y[unit.kind] || 2) + (unit.stance === "prone" ? -1.2 : unit.stance === "crouch" ? -0.5 : 0);
        const p = this._Project(unit.x, y, unit.z);
        if (!p.onScreen) continue;
        candidates.push({ p, distance, color: BLOCKOUT_MARKER_COLORS[unit.side] || "#fff", text: unit.name || (IsMachineGun(unit) ? "机枪" : ""),
          shape: unit.side === "ija" ? "tri" : "dot", guess: !!unit.guess, priority: named ? 1 : 0 });
      }
      for (const poi of this.pois) {
        const distance = Math.hypot(poi.x - cx, poi.z - cz);
        const p = this._Project(poi.x, this.groundAt(poi.x, poi.z) + 8.4, poi.z);
        if (!p.onScreen || !poi.name) continue;
        candidates.push({ p, distance, color: BLOCKOUT_MARKER_COLORS[poi.kind] || BLOCKOUT_MARKER_COLORS.poi, text: poi.name, shape: "diamond", priority: 1 });
      }
    }
    let nextLabel = null;
    if (this.next) {
      const n = this.next;
      const distance = Math.hypot(n.x - cx, n.z - cz);
      const p = this._Project(n.x, this.groundAt(n.x, n.z) + 14.4, n.z);
      const text = `下一步 · ${n.text || ""} · ${Math.round(distance)} m`;
      if (p.onScreen) candidates.push({ p, distance: -1, color: BLOCKOUT_MARKER_COLORS.next, text, shape: "diamond", priority: 2, next: true });
      else nextLabel = { p, text };
    }
    // 近的先排；同距离时有名字的、下一步优先
    candidates.sort((a, b) => (b.priority === 2) - (a.priority === 2) || a.distance - b.distance);
    const placed = [];
    let used = 0;
    for (const c of candidates) {
      const width = 22 + (c.text ? c.text.length * 12 : 0), height = 18;
      let x = c.p.sx - width / 2, y = c.p.sy - height;
      let ok = false;
      for (let attempt = 0; attempt < 3 && !ok; attempt++) {
        const yy = y - attempt * (height + 2);
        if (!placed.some(r => x < r.x + r.w && x + width > r.x && yy < r.y + r.h && yy + height > r.y)) { y = yy; ok = true; }
      }
      if (!ok) continue;
      placed.push({ x, y, w: width, h: height });
      const el = this._Label(used++);
      el.style.display = "flex";
      el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
      el.style.borderColor = c.next ? "rgba(223,189,104,.7)" : "rgba(196,198,187,.22)";
      el._dot.style.background = c.shape === "tri" ? "transparent" : c.color;
      el._dot.style.borderRadius = c.shape === "dot" ? "50%" : "0";
      el._dot.style.transform = c.shape === "diamond" ? "rotate(45deg) scale(.8)" : "none";
      el._dot.style.borderLeft = c.shape === "tri" ? "5px solid transparent" : "0";
      el._dot.style.borderRight = c.shape === "tri" ? "5px solid transparent" : "0";
      el._dot.style.borderBottom = c.shape === "tri" ? `9px solid ${c.color}` : "0";
      el._dot.style.width = c.shape === "tri" ? "0" : "8px";
      el._dot.style.height = c.shape === "tri" ? "0" : "8px";
      el._dot.style.outline = c.guess ? `1px dashed ${c.color}` : "none";
      el._text.textContent = c.text;
      el._text.style.display = c.text ? "" : "none";
      el.style.padding = c.text ? "1px 6px 1px 4px" : "3px";
    }
    for (let i = used; i < this.labels.length; i++) if (this.labels[i].style.display !== "none") this.labels[i].style.display = "none";
    this.stats.labels = used;
    this._UpdateEdge(nextLabel);
  }

  /** 下一步目标在屏幕外：贴边箭头 + 文字。 */
  _UpdateEdge(next) {
    if (!next) { if (this.edge) this.edge.style.display = "none"; return; }
    if (!this.edge) {
      const el = document.createElement("div");
      el.className = "blockoutEdgeNext";
      el.style.cssText = "position:absolute;left:0;top:0;display:none;align-items:center;gap:6px;white-space:nowrap;pointer-events:none;"
        + "font:12px/16px var(--ui-font, system-ui, sans-serif);color:#f4e2b0;background:rgba(10,13,14,.7);"
        + "border:1px solid rgba(223,189,104,.6);padding:2px 8px 2px 4px;";
      const arrow = document.createElement("i");
      arrow.style.cssText = "display:inline-block;width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;"
        + "border-bottom:11px solid #dfbd68;flex:none;";
      const text = document.createElement("span");
      el.append(arrow, text);
      el._arrow = arrow; el._text = text;
      this.labelRoot.appendChild(el);
      this.edge = el;
    }
    const w = innerWidth, h = innerHeight, margin = 70;
    let dx = next.p.ndcX, dy = -next.p.ndcY;
    if (next.p.behind) { dx = -dx; dy = -dy; }
    if (Math.abs(dx) < 1e-4 && Math.abs(dy) < 1e-4) dy = 1;
    const scale = Math.min((w / 2 - margin) / Math.max(1e-4, Math.abs(dx * w / 2)), (h / 2 - margin) / Math.max(1e-4, Math.abs(dy * h / 2)));
    const x = w / 2 + dx * w / 2 * scale, y = h / 2 + dy * h / 2 * scale;
    const angle = Math.atan2(dy * h, dx * w) * 180 / Math.PI + 90;
    const el = this.edge;
    el.style.display = "flex";
    el._text.textContent = next.text;
    el._arrow.style.transform = `rotate(${Math.round(angle)}deg)`;
    const width = 30 + next.text.length * 12;
    el.style.transform = `translate(${Math.round(Math.max(8, Math.min(w - width - 8, x - width / 2)))}px, ${Math.round(Math.max(8, Math.min(h - 30, y - 10)))}px)`;
  }

  Dispose() {
    if (this.host === "post") this.post?.RemoveDebugOverlay?.(this.root);
    else this.root.removeFromParent();
    this.tris.Dispose();
    this.lines.Dispose();
    this.root.clear();
    for (const el of this.labels) el.remove();
    this.labels.length = 0;
    this.edge?.remove();
    this.edge = null;
    this.chunks.clear();
  }
}
