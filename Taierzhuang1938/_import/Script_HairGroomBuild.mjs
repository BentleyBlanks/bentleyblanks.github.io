// 头发 / 胡子的离线制作（docs/Data_HairSystem.md §3–§5）：相当于 UE 那条「DCC 里梳头 → 导出 Groom → 引擎里插值、出低配」的前半段。
//
//   node Taierzhuang1938/_import/Script_HairGroomBuild.mjs              # 全部重做（Data_HairStyles.json 的 grooms）
//   node Taierzhuang1938/_import/Script_HairGroomBuild.mjs Luo_Cast     # 只做某几套
//   node Taierzhuang1938/_import/Script_HairGroomBuild.mjs --atlas      # 只重烘发片图集
//
// 输入：Hair/Heads/Model_HairHead_<头>.glb + Data_HairHeads.json（Script_HairLabHeads.py 出的光头与关键点），Hair/Data_HairStyles.json。
// 输出：Hair/Grooms/Groom_<id>.bin（一套 = 一个头上的头发 + 胡子，三档都在里面）、Hair/Data_HairGrooms.json（清单）、
//       Hair/Textures/Texture_HairCardAtlas.png（所有发片共用的图集）。
//
// 头发三档：
//   发丝（strands）：只存「导向发丝」（guides，几千根，每根 K 个点）+ 每根渲染发丝的三角插值数据（落在哪三根导向发丝之间、权重、随机数、长度）。
//                    运行时顶点着色器按 UE 的做法从导向发丝插出几万根渲染发丝，再加聚簇 / 毛躁 / 卷曲（Script_HairMaterials.mjs）。
//   发片（cards）：  导向发丝挑一部分当发片的脊线，两侧展开成带子，贴图集里的一格「一撮头发」。
//   头发壳（shell）：短发 = 头皮那片三角形按发层厚度往外推；长发 = 发丝密度场的等值面（surface nets）。
// 胡子按用户要求只有发片（+ 胡茬贴片，贴着皮肤一层，着色器里画点状短茬）。
// 另存一份 48–64³ 的发丝消光体素（每立方米的发丝截面），三档都用它算自阴影，保证远近看起来是同一头头发。
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { HAIR_SHADING } from '../Data_Tuning_Hair.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROJECT = path.dirname(HERE);
const HAIR = path.join(PROJECT, 'Hair');
const STYLES = JSON.parse(fs.readFileSync(path.join(HAIR, 'Data_HairStyles.json'), 'utf8'));
const REFERENCE_TEXT = fs.readFileSync(path.join(HAIR, 'Data_HairReferences.json'), 'utf8').replace(/\r\n/g, '\n');
const REFERENCE_DATA = JSON.parse(REFERENCE_TEXT);
const REFERENCES = REFERENCE_DATA.looks;
const REFERENCE_MASKS = JSON.parse(fs.readFileSync(path.join(HAIR, 'Data_HairReferenceMasks.json'), 'utf8'));
if (REFERENCE_MASKS.definitionSha256 !== createHash('sha256').update(REFERENCE_TEXT).digest('hex')) {
  throw new Error('Reference registration changed. Run _import/Script_HairReferenceBake.py before baking grooms.');
}
const HEADS = JSON.parse(fs.readFileSync(path.join(HAIR, 'Heads', 'Data_HairHeads.json'), 'utf8')).heads;
const FORMAT_VERSION = 1;

// ---------------------------------------------------------------------------------------------------------------
// 小工具
const Clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const Mix = (a, b, t) => a + (b - a) * t;
const Smooth = (e0, e1, x) => { const t = Clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
const Dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const Sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const Add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const Scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const Cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const Len = (a) => Math.hypot(a[0], a[1], a[2]);
const Norm = (a) => { const l = Len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const Project = (v, n) => Sub(v, Scale(n, Dot(v, n)));
function Rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function HashString(s) { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; }
function WriteAsset(file, content) {
  const bytes = Buffer.isBuffer(content) ? content : Buffer.from(content);
  if (fs.existsSync(file) && fs.readFileSync(file).equals(bytes)) return;
  const temporary = `${file}.tmp-${process.pid}`;
  try {
    fs.writeFileSync(temporary, bytes);
    fs.renameSync(temporary, file);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}
function Lerp1D(table, x) { // [[x, y], ...] 按 x 升序，两端夹住
  if (x <= table[0][0]) return table[0][1];
  for (let i = 1; i < table.length; i++) if (x <= table[i][0]) {
    const [x0, y0] = table[i - 1], [x1, y1] = table[i];
    return Mix(y0, y1, (x - x0) / Math.max(1e-9, x1 - x0));
  }
  return table[table.length - 1][1];
}

// 空间哈希：按格子找邻居。
class Grid3 {
  constructor(cell) { this.cell = cell; this.map = new Map(); }
  Key(x, y, z) { return `${Math.floor(x / this.cell)},${Math.floor(y / this.cell)},${Math.floor(z / this.cell)}`; }
  Add(p, id) { const k = this.Key(p[0], p[1], p[2]); let a = this.map.get(k); if (!a) this.map.set(k, a = []); a.push(id); }
  Near(p, r, out = []) {
    out.length = 0; const c = this.cell, n = Math.ceil(r / c);
    const ix = Math.floor(p[0] / c), iy = Math.floor(p[1] / c), iz = Math.floor(p[2] / c);
    for (let x = ix - n; x <= ix + n; x++) for (let y = iy - n; y <= iy + n; y++) for (let z = iz - n; z <= iz + n; z++) {
      const a = this.map.get(`${x},${y},${z}`); if (a) for (const id of a) out.push(id);
    }
    return out;
  }
}

// ---------------------------------------------------------------------------------------------------------------
// 读头部 GLB（Script_HairLabHeads.py 写的：单网格、float32 POSITION/NORMAL、uint32 索引）
function ReadHeadGlb(file) {
  const b = fs.readFileSync(file);
  const jl = b.readUInt32LE(12), j = JSON.parse(b.subarray(20, 20 + jl).toString());
  const bin = b.subarray(28 + jl);
  const Acc = (i, Ctor) => {
    const a = j.accessors[i], v = j.bufferViews[a.bufferView];
    const comps = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type];
    const off = bin.byteOffset + (v.byteOffset || 0) + (a.byteOffset || 0);
    return new Ctor(bin.buffer.slice(off, off + a.count * comps * Ctor.BYTES_PER_ELEMENT));
  };
  const p = j.meshes[0].primitives[0];
  return { pos: Acc(p.attributes.POSITION, Float32Array), nrm: Acc(p.attributes.NORMAL, Float32Array), idx: Acc(p.indices, Uint32Array) };
}

// ---------------------------------------------------------------------------------------------------------------
// 头部有符号距离场：窄带里逐三角形精确算，带外用连通性定内外（整块 = ±band）。只用来让发丝不穿头皮。
function ClosestOnTriangle(p, a, b, c) { // Ericson, Real-Time Collision Detection 5.1.5
  const ab = Sub(b, a), ac = Sub(c, a), ap = Sub(p, a);
  const d1 = Dot(ab, ap), d2 = Dot(ac, ap); if (d1 <= 0 && d2 <= 0) return a;
  const bp = Sub(p, b), d3 = Dot(ab, bp), d4 = Dot(ac, bp); if (d3 >= 0 && d4 <= d3) return b;
  const vc = d1 * d4 - d3 * d2; if (vc <= 0 && d1 >= 0 && d3 <= 0) return Add(a, Scale(ab, d1 / (d1 - d3)));
  const cp = Sub(p, c), d5 = Dot(ab, cp), d6 = Dot(ac, cp); if (d6 >= 0 && d5 <= d6) return c;
  const vb = d5 * d2 - d1 * d6; if (vb <= 0 && d2 >= 0 && d6 <= 0) return Add(a, Scale(ac, d2 / (d2 - d6)));
  const va = d3 * d6 - d5 * d4; if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) return Add(b, Scale(Sub(c, b), (d4 - d3) / ((d4 - d3) + (d5 - d6))));
  const den = 1 / (va + vb + vc), v = vb * den, w = vc * den;
  return Add(a, Add(Scale(ab, v), Scale(ac, w)));
}
class MeshSdf {
  constructor(mesh, { voxel = 0.0025, band = 0.012, pad = 0.05 } = {}) {
    const { pos, idx } = mesh;
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < pos.length; i += 3) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], pos[i + k]); max[k] = Math.max(max[k], pos[i + k]); }
    for (let k = 0; k < 3; k++) { min[k] -= pad; max[k] += pad; }
    this.min = min; this.voxel = voxel; this.band = band;
    this.n = [0, 1, 2].map((k) => Math.ceil((max[k] - min[k]) / voxel) + 1);
    const [nx, ny, nz] = this.n, total = nx * ny * nz, BIG = 1e9;
    const d = new Float32Array(total).fill(BIG);
    const V = (i) => [pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]];
    for (let t = 0; t < idx.length; t += 3) {
      const a = V(idx[t]), b = V(idx[t + 1]), c = V(idx[t + 2]);
      const fn = Norm(Cross(Sub(b, a), Sub(c, a)));
      const lo = [0, 1, 2].map((k) => Math.max(0, Math.floor((Math.min(a[k], b[k], c[k]) - band - min[k]) / voxel)));
      const hi = [0, 1, 2].map((k) => Math.min(this.n[k] - 1, Math.ceil((Math.max(a[k], b[k], c[k]) + band - min[k]) / voxel)));
      for (let z = lo[2]; z <= hi[2]; z++) for (let y = lo[1]; y <= hi[1]; y++) for (let x = lo[0]; x <= hi[0]; x++) {
        const p = [min[0] + x * voxel, min[1] + y * voxel, min[2] + z * voxel];
        const q = ClosestOnTriangle(p, a, b, c), dv = Sub(p, q), dist = Len(dv);
        if (dist > band) continue;
        const i = x + nx * (y + ny * z);
        if (dist < Math.abs(d[i])) d[i] = Dot(dv, fn) >= 0 ? dist : -dist;
      }
    }
    // 带外：从网格边界灌水，灌得到的是外面。
    const outside = new Uint8Array(total), queue = new Int32Array(total);
    let head = 0, tail = 0;
    const Push = (i) => { if (!outside[i] && d[i] === BIG) { outside[i] = 1; queue[tail++] = i; } };
    for (let z = 0; z < nz; z++) for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++)
      if (x === 0 || y === 0 || z === 0 || x === nx - 1 || y === ny - 1 || z === nz - 1) Push(x + nx * (y + ny * z));
    while (head < tail) {
      const i = queue[head++], x = i % nx, y = ((i / nx) | 0) % ny, z = (i / (nx * ny)) | 0;
      if (x > 0) Push(i - 1); if (x < nx - 1) Push(i + 1); if (y > 0) Push(i - nx); if (y < ny - 1) Push(i + nx);
      if (z > 0) Push(i - nx * ny); if (z < nz - 1) Push(i + nx * ny);
    }
    for (let i = 0; i < total; i++) if (d[i] === BIG) d[i] = outside[i] ? band : -band;
    this.d = d;
  }
  Sample(p) {
    const v = this.voxel, [nx, ny, nz] = this.n;
    const fx = (p[0] - this.min[0]) / v, fy = (p[1] - this.min[1]) / v, fz = (p[2] - this.min[2]) / v;
    if (fx < 0 || fy < 0 || fz < 0 || fx >= nx - 1 || fy >= ny - 1 || fz >= nz - 1) return this.band;
    const x = fx | 0, y = fy | 0, z = fz | 0, tx = fx - x, ty = fy - y, tz = fz - z, d = this.d;
    const I = (a, b, c) => d[a + nx * (b + ny * c)];
    const c00 = Mix(I(x, y, z), I(x + 1, y, z), tx), c10 = Mix(I(x, y + 1, z), I(x + 1, y + 1, z), tx);
    const c01 = Mix(I(x, y, z + 1), I(x + 1, y, z + 1), tx), c11 = Mix(I(x, y + 1, z + 1), I(x + 1, y + 1, z + 1), tx);
    return Mix(Mix(c00, c10, ty), Mix(c01, c11, ty), tz);
  }
  Gradient(p) {
    const e = this.voxel * 0.5;
    return Norm([this.Sample([p[0] + e, p[1], p[2]]) - this.Sample([p[0] - e, p[1], p[2]]),
      this.Sample([p[0], p[1] + e, p[2]]) - this.Sample([p[0], p[1] - e, p[2]]),
      this.Sample([p[0], p[1], p[2] + e]) - this.Sample([p[0], p[1], p[2] - e])]);
  }
  // 把点推到离表面至少 minD（返回是否推过）
  PushOut(p, minD) {
    const s = this.Sample(p);
    if (s >= minD) return false;
    const g = this.Gradient(p);
    p[0] += g[0] * (minD - s); p[1] += g[1] * (minD - s); p[2] += g[2] * (minD - s);
    return true;
  }
}

// ---------------------------------------------------------------------------------------------------------------
// 头部坐标系与区域（按关键点，不手抠坐标）。坐标：米，y 上，脸朝 -Z，人物右手 = +X。
class HeadFrame {
  constructor(marks) {
    this.m = marks;
    this.centerX = marks.centerX || 0;
    const e = marks.ear;
    this.zc = (marks.glabella[2] + marks.skullBack) * 0.5;
    this.top = marks.top[1]; this.gl = marks.glabella[1]; this.T = this.top - this.gl;
    this.sub = marks.subnasale[1]; this.st = marks.stomion[1]; this.men = marks.menton[1];
    this.L = this.sub - this.men;                      // 下半脸高
    this.earH = e.yMax - e.yMin;
    this.earFront = this.Deg(Math.atan2(e.halfWidth, -(e.zFront - this.zc)));
    this.earBack = this.Deg(Math.atan2(e.halfWidth, -(e.zBack - this.zc)));
  }
  Deg(r) { return (r * 180) / Math.PI; }
  Phi(p) { return this.Deg(Math.atan2(Math.abs(p[0] - this.centerX), -(p[2] - this.zc))); }  // 0 = 正前，180 = 正后
  HairlineY(phi, hl) {
    const m = this.m, e = m.ear, ef = this.earFront, eb = this.earBack, gl = this.gl, T = this.T;
    return Lerp1D([
      [0, gl + hl.front * T],
      [ef * 0.3, gl + hl.temple * T],                       // 额角（M 形，略高）
      [ef * 0.62, gl + hl.templeLow * T],                   // 太阳穴往下
      [ef - 14, e.yMax + 0.002],                            // 鬓角前沿上端
      [ef - 5, e.yMin + hl.sideburn * this.earH],           // 鬓角下端
      [ef + 1.5, e.yMax + 0.006],                           // 翻过耳朵
      [(ef + eb) * 0.5, e.yMax + 0.01],
      [eb + 4, e.yMax - (hl.backEarDrop ?? 0.25) * this.earH], // 耳后
      [eb + 16, e.yMin],
      [180, e.yMin - hl.nape],                              // 后颈正中
    ], phi);
  }
  // 发际线高度再叠一点起伏（真人发际线不是一条光滑曲线），左右各自一套相位
  NoisyHairlineY(phi, hl, side) {
    const n = 0.0016 * Math.sin(phi * 0.21 + side * 1.7) + 0.0011 * Math.sin(phi * 0.57 + side * 4.1) + 0.0007 * Math.sin(phi * 1.31 + side * 2.3);
    return this.HairlineY(phi, hl) + n;
  }
  IsEar(p, halfWidthFactor = .8) {
    const phi = this.Phi(p), ear = this.m.ear;
    return phi > this.earFront - 4 && phi < this.earBack + 6 && p[1] < ear.yMax + .012
      && Math.abs(p[0] - this.centerX) > ear.halfWidth * halfWidthFactor;
  }
  ScalpMask(p, hl) {
    const phi = this.Phi(p), y = p[1], band = hl.band ?? 0.008;
    // 耳朵本身：耳朵那一段方位角、耳尖以下，横向伸出头骨的点。
    if (this.IsEar(p, hl.earMaskHalfWidth ?? .8)) return 0;
    if (p[2] < this.m.glabella[2] + 0.012 && y < this.gl + 0.15 * this.T) return 0;   // 眉骨、脸
    // 过渡带按头皮上到发际线的距离算（方位角换成弧长），不只按高度差：鬓角、耳前这些发际线陡的地方也软
    const side = p[0] >= this.centerX ? 1 : -1, arc = (0.085 * Math.PI) / 180;
    let h0 = this.NoisyHairlineY(phi, hl, side);
    if (this.referenceProjection && hl.reference !== false) {
      // A frontal image has no usable depth at the temples. Join its hairline
      // to the ear-aware side outline before projection becomes tangential.
      const [start, end] = HAIR_SHADING.referenceFrontFadeDegrees;
      const Height = (q) => {
        const angle = this.Phi(q), base = this.NoisyHairlineY(angle, hl, side);
        return angle >= end ? base : Mix(this.referenceProjection.HairlineY(q), base, Smooth(start, end, angle));
      };
      h0 = Height(p);
      const dx = (Height([p[0]+.001,y,p[2]])-Height([p[0]-.001,y,p[2]]))/.002;
      const dz = (Height([p[0],y,p[2]+.001])-Height([p[0],y,p[2]-.001]))/.002;
      return Smooth(0, band, (y-h0)/Math.hypot(1,dx,dz));
    }
    const inside = y > h0;
    let d = Math.abs(y - h0);
    for (let dp = -24; dp <= 24; dp += 2) {
      const ph = phi + dp;
      if (ph < 0 || ph > 180 || dp === 0) continue;
      const hy = this.NoisyHairlineY(ph, hl, side);
      d = Math.min(d, Math.hypot(dp * arc, y - hy));
    }
    return inside ? Smooth(0, band, d) : 0;
  }
  // 头发分区权重：顶 / 前 / 后（侧面 = 都不是）
  Regions(p) {
    const phi = this.Phi(p), y = p[1], e = this.m.ear;
    const top = Smooth(e.yMax + 0.015, this.top - 0.035, y);
    const front = Smooth(70, 15, phi) * Smooth(this.top - 0.015, this.gl + 0.45 * this.T, y);
    const back = Smooth(115, 165, phi);
    return { top, front, back };
  }
  // 胡子：各部分的 [密度, 长度系数, 梳向]；pt = 部件参数
  BeardParts(p, parts) {
    const out = [];
    const x = Math.abs(p[0]), y = p[1], phi = this.Phi(p), L = this.L, st = this.st;
    if (p[2] > this.zc + 0.01 || phi > this.earFront - 3) return out;          // 只在脸的前半面
    const lip = x < 0.026 && y > st - 0.17 * L && y < st + 0.1 * L;
    if (y > this.sub + 0.002 && phi < 40) return out;                           // 鼻子
    const fw = this.m.ear.halfWidth;                                            // 脸宽单位（约 0.1 m）
    const sideX = p[0] >= 0 ? 1 : -1;
    const mu = parts.mustache;
    if (mu) {
      const w = 0.3 * fw * (mu.width ?? 1);
      const droop = (mu.droop ?? 0) * 0.32 * L * Smooth(w * 0.55, w, x);       // 八字两撇往下
      const lo = st + (mu.thin ? 0.1 + 0.35 * mu.thin : 0.1) * L - droop;
      if (x < w && y > lo && y < this.sub + 0.002 && !(lip && x < w * 0.86 - 0.004))
        out.push({ part: 'mustache', density: (mu.density ?? 1) * Smooth(w, w - 0.004, x) * Smooth(lo, lo + 0.002, y), length: mu.length,
          dir: Norm([sideX * Mix(0.25, 0.9, Smooth(0, w, x)), -1, -0.15]) });
    }
    const ch = parts.chin;
    if (ch) {
      const w = 0.24 * fw * (ch.width ?? 1);
      const hi = st - 0.2 * L, lo = this.men - 0.18 * L;
      if (x < w && y < hi && y > lo && !lip) {
        const point = ch.point ?? 0;                                             // 尖下巴胡：越靠中间越长
        out.push({ part: 'chin', density: (ch.density ?? 1) * Smooth(w, w - 0.006, x) * Smooth(hi, hi - 0.003, y),
          length: ch.length * Mix(1, Mix(0.35, 1.2, 1 - x / w), point), dir: Norm([sideX * 0.15 * x / w, -1, -0.35]) });
      }
    }
    const jw = parts.jaw;
    if (jw) {
      const t = Clamp(phi / (this.earFront - 5), 0, 1);
      const cheekY = Mix(this.sub - 0.15 * L, this.m.ear.yMin + 0.42 * this.earH, Smooth(0.25, 1, t)) - (1 - (jw.cheek ?? 0.5)) * 0.25 * L;
      const lowY = Mix(this.men - 0.22 * L, this.m.ear.yMin - 0.012, Smooth(0.3, 1, t));
      if (y < cheekY && y > lowY && !lip && x > 0.012 + 0.0)
        out.push({ part: 'jaw', density: (jw.density ?? 1) * Smooth(cheekY, cheekY - 0.008, y) * Smooth(lowY, lowY + 0.006, y),
          length: jw.length * Mix(1, 0.55, Smooth(0.6, 1, t)), dir: Norm([sideX * 0.1, -1, 0.15 * t]) });
    }
    const nk = parts.neck;
    if (nk) {
      const t = Clamp(phi / (this.earFront - 5), 0, 1);
      const hi = Mix(this.men - 0.15 * L, this.m.ear.yMin - 0.01, Smooth(0.3, 1, t)), lo = hi - 0.35 * L;
      if (y < hi && y > lo) out.push({ part: 'neck', density: (nk.density ?? 1) * Smooth(lo, lo + 0.01, y), length: nk.length, dir: Norm([0, -1, 0.4]) });
    }
    if (parts.cheek) {   // 只给胡茬用：脸颊上部稀稀拉拉一片
      const t = Clamp(phi / (this.earFront - 5), 0, 1);
      const top = Mix(this.sub + 0.05 * L, this.m.ear.yMin + 0.55 * this.earH, t);
      const bot = Mix(this.sub - 0.2 * L, this.m.ear.yMin + 0.2 * this.earH, t);
      if (y < top && y > bot && x > 0.03) out.push({ part: 'cheek', density: 0.6 * Smooth(top, top - 0.012, y), length: 0, dir: [0, -1, 0] });
    }
    return out;
  }
}

// ---------------------------------------------------------------------------------------------------------------
// 在头部网格上按面积撒点（带区域权重）。返回 { p, n, w }。
class ReferenceProjection {
  constructor(look, frame, settings) {
    this.look = look;
    this.frame = frame;
    this.settings = settings;
    this.alpha = Buffer.from(look.grid.alpha, 'base64');
    this.parts = Buffer.from(look.grid.parts, 'base64');
  }
  Project(p) {
    const registration = this.look.projection;
    const rows = registration.rows;
    let upper = rows[0], lower = rows[1];
    for (let i = 1; i < rows.length; i++) {
      upper = rows[i - 1]; lower = rows[i];
      if (p[1] >= lower.y) break;
    }
    const t = Clamp((upper.y - p[1]) / (upper.y - lower.y), 0, 1);
    const Value = (key) => Mix(upper[key], lower[key], t);
    const dx = p[0] - registration.centerX;
    const x = Math.abs(dx), inner = Value('innerX');
    const innerPixels = Value('innerImageX');
    const offset = x <= inner ? x / inner * innerPixels
      : innerPixels + (x - inner) / (Value('outerX') - inner) * (Value('outerImageX') - innerPixels);
    return [registration.reference.centerX - Math.sign(dx) * offset, Value('imageY')];
  }
  LocalUv(p) {
    const [x, y] = this.Project(p), [left, top, right, bottom] = this.look.crop;
    return [(x - left) / (right - left), (y - top) / (bottom - top)];
  }
  AtlasUv(p) {
    const uv = this.LocalUv(p), tile = this.look.tile;
    return [tile[0] + Clamp(uv[0], .001, .999) * tile[2], tile[1] + Clamp(uv[1], .001, .999) * tile[3]];
  }
  ScalpUv(p) {
    const [x, y] = this.Project(p), [left, top, right, bottom] = this.look.hairCrop, tile = this.look.tile;
    return [tile[0] + Clamp((x - left) / (right - left), .001, .999) * tile[2],
      tile[1] + Clamp((y - top) / (bottom - top), .001, .999) * tile[3]];
  }
  Contains(p) {
    const uv = this.LocalUv(p);
    return p[2] < this.frame.zc - .005 && p[1] >= this.frame.men - .005 && p[1] < this.frame.gl
      && uv[0] >= 0 && uv[0] <= 1 && uv[1] >= 0 && uv[1] <= 1;
  }
  PartsAt(p) {
    if (!this.Contains(p)) return [];
    const uv = this.LocalUv(p), size = this.look.grid.size;
    const fx = uv[0] * (size - 1), fy = uv[1] * (size - 1);
    const x = Math.floor(fx), y = Math.floor(fy), nx = Math.min(x + 1, size - 1), ny = Math.min(y + 1, size - 1);
    const coverage = Mix(Mix(this.alpha[y * size + x], this.alpha[y * size + nx], fx - x),
      Mix(this.alpha[ny * size + x], this.alpha[ny * size + nx], fx - x), fy - y) / 255;
    const partIndex = this.parts[Math.round(fy) * size + Math.round(fx)] - 1;
    const part = REFERENCE_MASKS.parts[partIndex], setting = this.settings[part];
    if (!setting || coverage < .015) return [];
    const side = Math.sign(p[0] - this.frame.centerX);
    const density = Math.sqrt(coverage) * setting.density;
    let length = setting.length;
    if (part === 'chin' && setting.point) {
      const width = this.look.projection.reference.faceHalfWidth * .72;
      const x = Math.abs(this.Project(p)[0] - this.look.projection.reference.centerX) / width;
      length *= Mix(1, .35, Clamp(x, 0, 1) * setting.point);
    }
    if (setting.tipBelowChin !== undefined) length = Math.min(length,
      Math.max(.0005, p[1]-this.frame.men+setting.tipBelowChin));
    const dir = part === 'mustache' ? [side * .6, -1, -.1] : [side * .08, -1, .1];
    return [{part, density, length, dir: Norm(dir)}];
  }
  HairlineY(p) {
    const x = this.Project(p)[0];
    const imageY = Lerp1D(this.look.hairline, x);
    return Lerp1D(this.look.projection.rows.map(row => [row.imageY, row.y]), imageY);
  }
}

class SurfaceSampler {
  constructor(mesh) {
    this.mesh = mesh;
    const { pos, idx } = mesh;
    this.cdf = new Float64Array(idx.length / 3);
    let acc = 0;
    for (let t = 0; t < idx.length; t += 3) {
      const a = [pos[3 * idx[t]], pos[3 * idx[t] + 1], pos[3 * idx[t] + 2]];
      const b = [pos[3 * idx[t + 1]], pos[3 * idx[t + 1] + 1], pos[3 * idx[t + 1] + 2]];
      const c = [pos[3 * idx[t + 2]], pos[3 * idx[t + 2] + 1], pos[3 * idx[t + 2] + 2]];
      acc += Len(Cross(Sub(b, a), Sub(c, a))) * 0.5;
      this.cdf[t / 3] = acc;
    }
    this.area = acc;
  }
  Sample(rng) {
    const { pos, nrm, idx } = this.mesh;
    const r = rng() * this.area;
    let lo = 0, hi = this.cdf.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (this.cdf[mid] < r) lo = mid + 1; else hi = mid; }
    let u = rng(), v = rng(); if (u + v > 1) { u = 1 - u; v = 1 - v; }
    const w = 1 - u - v, t = lo * 3, ia = idx[t], ib = idx[t + 1], ic = idx[t + 2];
    const P = (k) => w * pos[3 * ia + k] + u * pos[3 * ib + k] + v * pos[3 * ic + k];
    const N = (k) => w * nrm[3 * ia + k] + u * nrm[3 * ib + k] + v * nrm[3 * ic + k];
    return { p: [P(0), P(1), P(2)], n: Norm([N(0), N(1), N(2)]), vertices: [ia, ib, ic], bary: [w, u, v] };
  }
}

// 泊松盘（飞镖）：候选点按区域权重接受，再保最小间距。
function PoissonRoots(sampler, rng, spacing, Weight, maxCount = 20000) {
  const want = Math.min(maxCount, Math.ceil(sampler.area / (spacing * spacing)) * 2);
  const grid = new Grid3(spacing), out = [], near = [];
  for (let tries = 0; tries < want * 40 && out.length < maxCount; tries++) {
    const s = sampler.Sample(rng), w = Weight(s.p, s.n, s);
    if (!(w > 0.01) || rng() > Math.max(0.15, w)) continue;
    let ok = true;
    for (const id of grid.Near(s.p, spacing, near)) { if (Len(Sub(out[id].p, s.p)) < spacing) { ok = false; break; } }
    if (!ok) continue;
    s.w = w; grid.Add(s.p, out.length); out.push(s);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// 梳向（头皮切面上的方向）
function CombDir(style, frame, p, n) {
  const c = style.comb, m = frame.m;
  if (c.type === 'bob') {
    const side = p[0] >= c.partX ? 1 : -1;
    const front = 1 - Smooth(38, 70, frame.Phi(p));
    const crown = frame.Regions(p).top;
    const fringe = Norm(Project([side * .22, -.95, -.4], n));
    const sides = Norm(Project([side * (.3 + crown * .65), -.9, .12], n));
    return Norm(Add(Scale(sides, 1 - front), Scale(fringe, front)));
  }
  if (c.type === 'crew') {
    const region = frame.Regions(p);
    const front = 1 - Smooth(45, 85, frame.Phi(p));
    const sideFlow = Project([0, -1, .15], n);
    const side = Math.sign(p[0] - frame.centerX);
    const frontFlow = Project([side * .12, 1, .65], n);
    const crownFlow = Project([side * .12, -.08, 1], n);
    const flow = Add(Scale(sideFlow, 1 - front), Scale(frontFlow, front));
    return Norm(Add(Scale(flow, 1 - region.top), Scale(crownFlow, region.top)));
  }
  if (c.type === 'whorl') {
    const W = [c.whorl[0], m.top[1] + c.whorl[1], m.top[2] + c.whorl[2]];
    let r = Project(Sub(p, W), n);
    const d = Len(r);
    r = Norm(r);
    const swirl = Cross(n, r);                                             // 发旋附近打旋
    let t = Norm(Add(r, Scale(swirl, 0.45 * Math.exp(-d / 0.03))));
    const fwd = (c.forward ?? 0) * frame.Regions(p).front;                 // 前额往前梳
    if (fwd > 0) t = Norm(Add(Scale(t, 1 - fwd), Scale(Norm(Project([0, -0.25, -1], n)), fwd)));
    return t;
  }
  if (c.type === 'part') {
    const side = p[0] >= c.partX ? 1 : -1;
    const dist = Math.abs(p[0] - c.partX);
    const lateral = Smooth(0, 0.01, dist);
    let t = Norm(Project([side * (0.4 + 0.6 * lateral), -0.35, c.back ?? 0.3], n));
    if (Len(Project([side, -0.35, c.back ?? 0.3], n)) < 1e-3) t = Norm(Project([0, -1, 0.3], n));
    return t;
  }
  return Norm(Project([0, -1, 0.3], n));
}

// ---------------------------------------------------------------------------------------------------------------
// 长一根导向发丝：从根往外「跟随」生长（每段在前一段方向、梳向、重力之间混），碰撞推出头皮；长发再做几轮 PBD 让它垂下来。
function GrowGuide(root, n, comb, length, K, opt, sdf, rng) {
  const pts = [root.slice()];
  const seg = length / Math.max(1, K - 1);
  const lift = opt.lift;
  let d = Norm(Add(Scale(n, lift), Scale(comb, 1 - lift)));
  const g = [0, -1, 0];
  const volume = opt.volume * (0.7 + 0.6 * rng());
  for (let i = 1; i < K; i++) {
    const s = i / (K - 1);
    // The comb direction only controls the root. Keeping its lateral pull all
    // the way to a long tip produces a triangular, wing-shaped wig.
    const freeFall = length > 0.1 ? Smooth(0.025, 0.12, length * s) * opt.gravity : 0;
    const bend = Add(Scale(comb, (1 - lift) * 0.6 * (1 - freeFall)), Scale(g, opt.gravity * (s + freeFall * 3)));
    d = Norm(Add(Scale(d, opt.stiffness), Scale(bend, 1 - opt.stiffness)));
    const p = Add(pts[i - 1], Scale(d, seg));
    const minD = 0.0005 + volume * Math.pow(s, 0.7);
    for (let it = 0; it < 3; it++) {
      if (!sdf.PushOut(p, minD)) break;
      const q = Add(pts[i - 1], Scale(Norm(Sub(p, pts[i - 1])), seg)); p[0] = q[0]; p[1] = q[1]; p[2] = q[2];
    }
    d = Norm(Sub(p, pts[i - 1]));
    pts.push(p);
  }
  if (opt.gravity >= 0.5 && K > 6) {   // 长发：几轮 PBD 让它顺着头垂下来（第一段方向保持，发根不倒）
    for (let iter = 0; iter < 40; iter++) {
      for (let i = 2; i < K; i++) pts[i][1] -= opt.gravity * 0.002 * (i / (K - 1));
      for (let i = 2; i < K; i++) {
        const cont = Add(pts[i - 1], Scale(Norm(Sub(pts[i - 1], pts[i - 2])), seg));   // 顺着上一段延伸 = 抗弯
        const k = opt.stiffness * 0.35;
        const q = [Mix(pts[i][0], cont[0], k), Mix(pts[i][1], cont[1], k), Mix(pts[i][2], cont[2], k)];
        const p = Add(pts[i - 1], Scale(Norm(Sub(q, pts[i - 1])), seg));
        const minD = 0.0005 + volume * Math.pow(i / (K - 1), 0.7);
        if (sdf.PushOut(p, minD)) { const r = Add(pts[i - 1], Scale(Norm(Sub(p, pts[i - 1])), seg)); p[0] = r[0]; p[1] = r[1]; p[2] = r[2]; }
        pts[i] = p;
      }
    }
  }
  return pts;
}

// ---------------------------------------------------------------------------------------------------------------
// 渲染发丝的三角插值：在根点附近的导向发丝里找一个包住它的三角形（切平面上的重心坐标），找不到就取最近三根、最小二乘后夹住。
function Barycentric2(p, a, b, c) {
  const v0 = [b[0] - a[0], b[1] - a[1]], v1 = [c[0] - a[0], c[1] - a[1]], v2 = [p[0] - a[0], p[1] - a[1]];
  const den = v0[0] * v1[1] - v1[0] * v0[1];
  if (Math.abs(den) < 1e-12) return null;
  const v = (v2[0] * v1[1] - v1[0] * v2[1]) / den, w = (v0[0] * v2[1] - v2[0] * v0[1]) / den;
  return [1 - v - w, v, w];
}
function BindStrand(root, n, guideRoots, grid, near) {
  const ids = grid.Near(root, 0.012, near).slice();
  ids.sort((i, j) => Len(Sub(guideRoots[i], root)) - Len(Sub(guideRoots[j], root)));
  const cand = ids.slice(0, 8);
  if (cand.length < 3) return null;
  const u = Norm(Math.abs(n[1]) < 0.9 ? Cross(n, [0, 1, 0]) : Cross(n, [1, 0, 0])), v = Cross(n, u);
  const P2 = (q) => { const r = Sub(q, root); return [Dot(r, u), Dot(r, v)]; };
  const pts = cand.map((i) => P2(guideRoots[i])), o = [0, 0];
  let best = null, bestCost = Infinity;
  for (let a = 0; a < cand.length; a++) for (let b = a + 1; b < cand.length; b++) for (let c = b + 1; c < cand.length; c++) {
    const w = Barycentric2(o, pts[a], pts[b], pts[c]);
    if (!w || Math.min(...w) < -0.02) continue;
    const cost = Math.hypot(...pts[a]) + Math.hypot(...pts[b]) + Math.hypot(...pts[c]);
    if (cost < bestCost) { bestCost = cost; best = [[cand[a], cand[b], cand[c]], w]; }
  }
  if (!best) {   // 发际线外沿：最近三根，权重按反距离
    const w = cand.slice(0, 3).map((i) => 1 / (Len(Sub(guideRoots[i], root)) + 1e-4));
    const s = w[0] + w[1] + w[2];
    best = [cand.slice(0, 3), w.map((x) => x / s)];
  }
  const order = [0, 1, 2].sort((i, j) => best[1][j] - best[1][i]);   // 权重最大的那根当聚簇中心
  return { ids: order.map((i) => best[0][i]), w: order.map((i) => Clamp(best[1][i], -0.5, 1.5)) };
}

// CPU 上按运行时同一公式插一根渲染发丝（不含毛躁 / 卷曲），给体素、发片、头发壳用。
function InterpolateStrand(guides, K, ids, w, lenScale, clump, steps) {
  const out = [];
  const G = (g, f) => { const i = Math.min(K - 2, Math.floor(f)), t = f - i; const a = guides[g][i], b = guides[g][i + 1]; return [Mix(a[0], b[0], t), Mix(a[1], b[1], t), Mix(a[2], b[2], t)]; };
  const r = [0, 1, 2].map((k) => w[0] * guides[ids[0]][0][k] + w[1] * guides[ids[1]][0][k] + w[2] * guides[ids[2]][0][k]);
  const r0 = guides[ids[0]][0], dOff = Sub(r, r0);
  for (let s = 0; s <= steps; s++) {
    const t = s / steps, f = t * lenScale * (K - 1);
    const S = [0, 0, 0];
    for (let j = 0; j < 3; j++) { const q = Sub(G(ids[j], f), guides[ids[j]][0]); S[0] += w[j] * q[0]; S[1] += w[j] * q[1]; S[2] += w[j] * q[2]; }
    const C = Sub(G(ids[0], f), r0);
    const k = clump * t, sm = 1 - clump * t * t * (3 - 2 * t);
    out.push([r0[0] + dOff[0] * sm + Mix(S[0], C[0], k), r0[1] + dOff[1] * sm + Mix(S[1], C[1], k), r0[2] + dOff[2] * sm + Mix(S[2], C[2], k)]);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// 发片图集：一格 = 一撮头发（R = 覆盖、G = 这根发丝从根到梢的位置、B = 发丝随机数、A = 前后深度）。
// 布局 2048×1024，每格 128 宽：长发 / 卷发占满高（第 0–7 列），其余半高（第 8–15 列上下两行）。
const ATLAS = { width: 2048, height: 1024, tile: 128 };
const TILE_FAMILIES = {
  Long:      { cols: [0, 1, 2, 3], full: true, strands: 150, lenMin: 0.75, wave: 0, waveFreq: 0, clump: 0.55, width: [1.5, 0.6], spread: 0.95 },
  Wavy:      { cols: [4, 5, 6, 7], full: true, strands: 140, lenMin: 0.6, wave: 0.07, waveFreq: 5.5, clump: 0.6, width: [1.7, 0.6], spread: 0.95 },
  Short:     { cols: [8, 9], rows: [0, 1], strands: 230, lenMin: 0.45, wave: 0.02, waveFreq: 2, clump: 0.25, width: [2.0, 0.8], spread: 1.0 },
  // 胡子：一格对应 2.5–3 mm 宽的小发片（约 0.02 mm/像素），只放十来根粗硬带弯的胡须，须间透皮肤
  Beard:     { cols: [10, 11], rows: [0, 1], strands: 13, lenMin: 0.55, wave: 0.1, waveFreq: 1.6, clump: 0.12, width: [5.0, 2.0], spread: 0.8, kink: 0.35 },
  BeardLong: { cols: [12, 13], rows: [0, 1], strands: 30, lenMin: 0.6, wave: 0.08, waveFreq: 3.0, clump: 0.35, width: [3.2, 1.2], spread: 0.9, kink: 0.15 },
  Stubble:   { cols: [14, 15], rows: [0, 1], strands: 9, lenMin: 0.45, wave: 0.06, waveFreq: 1.2, clump: 0.0, width: [5.0, 2.6], spread: 0.85, kink: 0.25 },
};
function AtlasTiles() {
  const tiles = {};
  for (const [name, f] of Object.entries(TILE_FAMILIES)) {
    tiles[name] = [];
    for (const c of f.cols) for (const r of (f.full ? [0] : f.rows)) {
      const h = f.full ? 1 : 0.5;
      tiles[name].push({ u0: (c * ATLAS.tile) / ATLAS.width, u1: ((c + 1) * ATLAS.tile) / ATLAS.width, v0: r * 0.5, v1: r * 0.5 + h });
    }
  }
  return tiles;
}
function BakeAtlas(outFile) {
  const W = ATLAS.width, H = ATLAS.height;
  const alpha = new Float32Array(W * H), tip = new Float32Array(W * H), id = new Float32Array(W * H), depth = new Float32Array(W * H).fill(1);
  const tiles = AtlasTiles();
  for (const [name, list] of Object.entries(tiles)) {
    const f = TILE_FAMILIES[name];
    list.forEach((tile, ti) => {
      const rng = Rng(HashString(name) + ti * 7919);
      const x0 = tile.u0 * W, x1 = tile.u1 * W, y0 = tile.v0 * H, y1 = tile.v1 * H, tw = x1 - x0, th = y1 - y0;
      const clumps = Array.from({ length: 5 + Math.floor(rng() * 4) }, () => 0.1 + rng() * 0.8);
      const strands = [];
      for (let s = 0; s < f.strands; s++) {
        const u = 0.5 + (rng() - 0.5) * f.spread, len = Mix(f.lenMin, 1, Math.pow(rng(), 0.6)), z = rng();
        const cl = clumps[Math.floor(rng() * clumps.length)], phase = rng() * 6.283, kinkAt = rng();
        const pts = [];
        const N = 28;
        for (let i = 0; i <= N; i++) {
          const t = i / N, v = t * len;
          let x = Mix(u, cl, f.clump * t * t) + f.wave * Math.sin(phase + v * f.waveFreq * 6.283) * Math.min(1, t * 3);
          if (f.kink && Math.abs(t - kinkAt) < 0.12) x += f.kink * 0.15 * (rng() - 0.5);
          pts.push([x0 + Clamp(x, 0.02, 0.98) * tw, y0 + v * th * 0.985 + 0.5, t]);
        }
        strands.push({ pts, z, rid: rng() });
      }
      strands.sort((a, b) => b.z - a.z);   // 从后往前画
      for (const s of strands) {
        for (let i = 0; i < s.pts.length - 1; i++) {
          const [ax, ay, at] = s.pts[i], [bx, by, bt] = s.pts[i + 1];
          const hw = Mix(f.width[0], f.width[1], at) * 0.5;
          const minX = Math.max(Math.floor(x0), Math.floor(Math.min(ax, bx) - hw - 1)), maxX = Math.min(Math.ceil(x1) - 1, Math.ceil(Math.max(ax, bx) + hw + 1));
          const minY = Math.max(Math.floor(y0), Math.floor(Math.min(ay, by) - hw - 1)), maxY = Math.min(Math.ceil(y1) - 1, Math.ceil(Math.max(ay, by) + hw + 1));
          const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1;
          for (let py = minY; py <= maxY; py++) for (let px = minX; px <= maxX; px++) {
            const cx = px + 0.5, cy = py + 0.5;
            const tt = Clamp(((cx - ax) * dx + (cy - ay) * dy) / l2, 0, 1);
            const ex = ax + dx * tt - cx, ey = ay + dy * tt - cy, dd = Math.hypot(ex, ey);
            const a = Clamp(hw + 0.5 - dd, 0, 1) * 0.92;
            if (a <= 0) continue;
            const k = px + W * py;
            alpha[k] = a + (1 - a) * alpha[k];
            if (a > 0.35) { tip[k] = Mix(at, bt, tt); id[k] = s.rid; depth[k] = s.z; }
          }
        }
      }
    });
  }
  const rgba = Buffer.alloc(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    rgba[4 * i] = Math.round(Clamp(alpha[i], 0, 1) * 255);
    rgba[4 * i + 1] = Math.round(Clamp(tip[i], 0, 1) * 255);
    rgba[4 * i + 2] = Math.round(Clamp(id[i], 0, 1) * 255);
    rgba[4 * i + 3] = Math.round(Clamp(depth[i], 0, 1) * 255);
  }
  WritePng(outFile, W, H, rgba);
  return tiles;
}
function WritePng(file, w, h, rgba) {
  const crcTable = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c; });
  const Crc = (buf) => { let c = -1; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0; };
  const Chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(Crc(td));
    return Buffer.concat([len, td, crc]);
  };
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  WriteAsset(file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), Chunk('IHDR', ihdr),
    Chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), Chunk('IEND', Buffer.alloc(0))]));
}

// ---------------------------------------------------------------------------------------------------------------
// 发片：沿脊线两侧展开成带子。spine = [[x,y,z]...]，n = 根部法线，comb = 根部梳向，width = 宽，tile = 图集格
function CardStrip(out, spine, n, comb, width, tile, cardRandom, layer, skin = null) {
  const K = spine.length, base = out.pos.length / 3;
  const across = Norm(Cross(comb, n));
  for (let i = 0; i < K; i++) {
    const s = i / (K - 1);
    const t = Norm(Sub(spine[Math.min(K - 1, i + 1)], spine[Math.max(0, i - 1)]));
    let a = Norm(Project(across, t));
    if (!(Len(a) > 0.5)) a = across;
    const hw = width * 0.5 * Mix(1, 0.72, s);
    for (const side of [-1, 1]) {
      const p = Add(spine[i], Scale(a, side * hw));
      out.pos.push(p[0], p[1], p[2]);
      out.tan.push(t[0], t[1], t[2]);
      out.nrm.push(n[0], n[1], n[2]);
      out.uv.push(Mix(tile.u0, tile.u1, side < 0 ? 0 : 1), Mix(tile.v0, tile.v1, s));
      out.data.push(s, cardRandom, layer);
      if (out.boneJoints) { out.boneJoints.push(...skin.joints); out.boneWeights.push(...skin.weights); }
    }
  }
  for (let i = 0; i < K - 1; i++) {
    const a = base + 2 * i;
    out.idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
}

// 头皮片：头部网格里区域权重 > 0 的三角形，按 offsetFn(p, n) 往外推；data = [覆盖, 厚度]
function ScalpPatch(mesh, Weight, offsetFn, tangentFn, minW = 0.02) {
  const { pos, nrm, idx } = mesh;
  const map = new Map(), out = { pos: [], nrm: [], tan: [], data: [], idx: [], sourceIndex: [] };
  if (mesh.boneJoints) { out.boneJoints = []; out.boneWeights = []; }
  const wOf = new Float32Array(pos.length / 3).fill(-1);
  const W = (i) => { if (wOf[i] < 0) wOf[i] = Weight([pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]], [nrm[3 * i], nrm[3 * i + 1], nrm[3 * i + 2]], i); return wOf[i]; };
  for (let t = 0; t < idx.length; t += 3) {
    const tri = [idx[t], idx[t + 1], idx[t + 2]];
    if (Math.max(W(tri[0]), W(tri[1]), W(tri[2])) < minW) continue;
    for (const i of tri) {
      if (!map.has(i)) {
        const p = [pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]], n = Norm([nrm[3 * i], nrm[3 * i + 1], nrm[3 * i + 2]]);
        const h = offsetFn(p, n, W(i)), q = Add(p, Scale(n, h)), tg = tangentFn(p, n);
        map.set(i, out.pos.length / 3);
        out.pos.push(q[0], q[1], q[2]); out.nrm.push(n[0], n[1], n[2]); out.tan.push(tg[0], tg[1], tg[2]); out.data.push(W(i), h); out.sourceIndex.push(i);
        if (out.boneJoints) for (let k = 0; k < 4; k++) {
          out.boneJoints.push(mesh.boneJoints[4 * i + k]);
          out.boneWeights.push(mesh.boneWeights[4 * i + k]);
        }
      }
      out.idx.push(map.get(i));
    }
  }
  return out;
}

// surface nets：体素场 > iso 的等值面（长发的头发壳）。
function SurfaceNets(field, n, min, voxel, iso) {
  const [nx, ny, nz] = n, F = (x, y, z) => field[x + nx * (y + ny * z)];
  const vid = new Int32Array(nx * ny * nz).fill(-1), pos = [], idx = [];
  const E = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  for (let z = 0; z < nz - 1; z++) for (let y = 0; y < ny - 1; y++) for (let x = 0; x < nx - 1; x++) {
    const c = [F(x, y, z), F(x + 1, y, z), F(x, y + 1, z), F(x + 1, y + 1, z), F(x, y, z + 1), F(x + 1, y, z + 1), F(x, y + 1, z + 1), F(x + 1, y + 1, z + 1)];
    let mask = 0; for (let i = 0; i < 8; i++) if (c[i] > iso) mask |= 1 << i;
    if (mask === 0 || mask === 255) continue;
    let sx = 0, sy = 0, sz = 0, cnt = 0;
    for (const [a, b] of E) {
      if ((c[a] > iso) === (c[b] > iso)) continue;
      const t = (iso - c[a]) / (c[b] - c[a]);
      const ax = a & 1, ay = (a >> 1) & 1, az = (a >> 2) & 1, bx = b & 1, by = (b >> 1) & 1, bz = (b >> 2) & 1;
      sx += Mix(ax, bx, t); sy += Mix(ay, by, t); sz += Mix(az, bz, t); cnt++;
    }
    vid[x + nx * (y + ny * z)] = pos.length / 3;
    pos.push(min[0] + (x + sx / cnt) * voxel, min[1] + (y + sy / cnt) * voxel, min[2] + (z + sz / cnt) * voxel);
  }
  const V = (x, y, z) => vid[x + nx * (y + ny * z)];
  for (let z = 1; z < nz - 1; z++) for (let y = 1; y < ny - 1; y++) for (let x = 1; x < nx - 1; x++) {
    const inside = F(x, y, z) > iso;
    // x 方向的边 (x,y,z)-(x+1,y,z)：四个格子 (x, y-1..y, z-1..z)
    if (x < nx - 1 && inside !== (F(x + 1, y, z) > iso)) Quad(V(x, y - 1, z - 1), V(x, y, z - 1), V(x, y, z), V(x, y - 1, z), inside);
    if (y < ny - 1 && inside !== (F(x, y + 1, z) > iso)) Quad(V(x - 1, y, z - 1), V(x, y, z - 1), V(x, y, z), V(x - 1, y, z), !inside);
    if (z < nz - 1 && inside !== (F(x, y, z + 1) > iso)) Quad(V(x - 1, y - 1, z), V(x, y - 1, z), V(x, y, z), V(x - 1, y, z), inside);
  }
  function Quad(a, b, c, d, flip) {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) idx.push(a, b, c, a, c, d); else idx.push(a, c, b, a, d, c);
  }
  // 两轮拉普拉斯平滑，去掉体素台阶
  const nb = Array.from({ length: pos.length / 3 }, () => new Set());
  for (let i = 0; i < idx.length; i += 3) for (let k = 0; k < 3; k++) { nb[idx[i + k]].add(idx[i + (k + 1) % 3]); nb[idx[i + k]].add(idx[i + (k + 2) % 3]); }
  for (let pass = 0; pass < 3; pass++) {
    const np = pos.slice();
    for (let v = 0; v < nb.length; v++) {
      if (!nb[v].size) continue;
      let sx = 0, sy = 0, sz = 0; for (const u of nb[v]) { sx += pos[3 * u]; sy += pos[3 * u + 1]; sz += pos[3 * u + 2]; }
      const k = nb[v].size;
      np[3 * v] = Mix(pos[3 * v], sx / k, 0.6); np[3 * v + 1] = Mix(pos[3 * v + 1], sy / k, 0.6); np[3 * v + 2] = Mix(pos[3 * v + 2], sz / k, 0.6);
    }
    pos.splice(0, pos.length, ...np);
  }
  return { pos, idx };
}

// ---------------------------------------------------------------------------------------------------------------
// 一套头发
function BuildHair(groomId, style, frame, mesh, sdf, sampler, tiles, exclude = null, scalpExclude = exclude) {
  const rng = Rng(HashString(groomId + ':hair'));
  const hl = style.hairline, K = style.points;
  // exclude：游戏模型上帽子罩住的地方不长头发（GameHeadAssets）
  const SkinTone = (source) => {
    if (!mesh.skinScore) return 1;
    if (Number.isInteger(source)) return mesh.skinScore[source];
    if (source?.vertices) return source.vertices.reduce((sum, index, k) => sum + mesh.skinScore[index] * source.bary[k], 0);
    return 1;
  };
  const Weight = (p, n, source) => SkinTone(source) >= .2 && (!exclude || !exclude(p)) ? frame.ScalpMask(p, hl) : 0;
  const ScalpWeight = (p, n, source) => SkinTone(source) >= (frame.Phi(p) >= 100 ? .08 : .2)
    && (!scalpExclude || !scalpExclude(p)) ? frame.ScalpMask(p, hl) : 0;
  const LengthAt = (p) => {
    const r = frame.Regions(p), L = style.length;
    const sideBack = Mix(L.side, L.back, r.back);
    const topFront = Mix(L.top, L.front, r.front);
    let length = Mix(sideBack, topFront, r.top);
    if (style.crownHalfWidth) length = Mix(length, sideBack,
      Smooth(style.crownHalfWidth, style.crownHalfWidth + style.crownBlend, Math.abs(p[0]-frame.centerX)));
    if (style.comb.type === 'bob') {
      const c = style.comb, front = 1 - Smooth(38, 70, frame.Phi(p));
      const fringe = Clamp(p[1] - frame.gl - c.fringeClearance, c.fringeMinLength, L.front);
      const hem = Clamp((p[1]-frame.men-c.hemOffset)*1.05 + r.top*c.crownTravel, c.hemMinLength, L.top);
      return Mix(hem, fringe, front);
    }
    return length;
  };
  const LiftAt = (p) => { const r = frame.Regions(p), l = style.lift; return Mix(Mix(l.side, l.back, r.back), l.top, r.top); };
  // 1. 导向发丝
  const roots = PoissonRoots(sampler, rng, style.guideSpacing, Weight, 9000);
  const guides = [], guideRoots = [], guideNormals = [], guideComb = [];
  for (const r of roots) {
    const comb = CombDir(style, frame, r.p, r.n);
    const len = LengthAt(r.p) * Mix(0.45, 1, r.w);
    const pts = GrowGuide(r.p, r.n, comb, len, K, { lift: LiftAt(r.p), stiffness: style.stiffness, gravity: style.gravity, volume: style.volume }, sdf, rng);
    if (style.comb.tipTuck) for (let k = 1; k < K; k++) {
      pts[k][0] -= Math.sign(pts[k][0]-frame.centerX) * style.comb.tipTuck * Smooth(.5, 1, k/(K-1));
      sdf.PushOut(pts[k], .0005);
    }
    guides.push(pts); guideRoots.push(r.p); guideNormals.push(r.n); guideComb.push(comb);
  }
  // 发丝点的「开阔度」（被别的发丝盖住多少）：给环境光遮蔽用。
  const ptGrid = new Grid3(0.006), near = [];
  guides.forEach((g, gi) => g.forEach((p, k) => ptGrid.Add(p, gi * K + k)));
  const heightOf = guides.map((g) => g.map((p) => sdf.Sample(p)));
  const open = guides.map((g, gi) => g.map((p, k) => {
    let cover = 0;
    for (const id of ptGrid.Near(p, 0.006, near)) {
      const gj = (id / K) | 0, kj = id % K;
      if (gj === gi) continue;
      if (heightOf[gj][kj] > heightOf[gi][k] + 0.0008 && Len(Sub(guides[gj][kj], p)) < 0.006) cover++;
    }
    return Math.exp(-0.09 * cover);
  }));
  // 2. 渲染发丝根点 + 插值数据
  const gGrid = new Grid3(0.006);
  guideRoots.forEach((p, i) => gGrid.Add(p, i));
  const strands = [];
  let attempts = 0;
  while (strands.length < style.strands && attempts < style.strands * 30) {
    attempts++;
    const s = sampler.Sample(rng), w = Weight(s.p, s.n, s);
    if (!(w > 0.01) || rng() > w) continue;
    const b = BindStrand(s.p, s.n, guideRoots, gGrid, near);
    if (!b) continue;
    const lenScale = Clamp((1 - style.lengthJitter * rng()) * Mix(0.4, 1, Smooth(0, 1, w)), 0.05, 1);
    strands.push({ ids: b.ids, w: b.w, seed: rng(), len: lenScale });
  }
  for (let i = strands.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [strands[i], strands[j]] = [strands[j], strands[i]]; }
  // 3. 包围盒、消光体素
  const bmin = [Infinity, Infinity, Infinity], bmax = [-Infinity, -Infinity, -Infinity];
  for (const g of guides) for (const p of g) for (let k = 0; k < 3; k++) { bmin[k] = Math.min(bmin[k], p[k]); bmax[k] = Math.max(bmax[k], p[k]); }
  for (let k = 0; k < 3; k++) { bmin[k] -= 0.01; bmax[k] += 0.01; }
  const ext = Sub(bmax, bmin), res = 56, vox = Math.max(...ext) / res;
  const vn = ext.map((e) => Math.max(4, Math.ceil(e / vox)));
  const ext2 = new Float32Array(vn[0] * vn[1] * vn[2]);
  const strandWidth = (style.width[0] + style.width[1]) * 0.5, vVol = vox * vox * vox;
  const sampleEvery = Math.max(1, Math.floor(strands.length / 12000)), steps = Math.max(4, K * 2);
  const splatScale = sampleEvery;
  const fieldCells = style.shell.kind === 'hull' ? new Float32Array(vn[0] * vn[1] * vn[2]) : null;
  for (let si = 0; si < strands.length; si += sampleEvery) {
    const s = strands[si];
    const pts = InterpolateStrand(guides, K, s.ids, s.w, s.len, style.clump, steps);
    for (let i = 1; i < pts.length; i++) {
      const seg = Len(Sub(pts[i], pts[i - 1]));
      const m = Scale(Add(pts[i], pts[i - 1]), 0.5);
      const x = Math.floor((m[0] - bmin[0]) / vox), y = Math.floor((m[1] - bmin[1]) / vox), z = Math.floor((m[2] - bmin[2]) / vox);
      if (x < 0 || y < 0 || z < 0 || x >= vn[0] || y >= vn[1] || z >= vn[2]) continue;
      ext2[x + vn[0] * (y + vn[1] * z)] += (seg * strandWidth * splatScale) / vVol;
      if (fieldCells) fieldCells[x + vn[0] * (y + vn[1] * z)] += seg * splatScale;
    }
  }
  // 体素轻微模糊一下（3 抽头盒式），免得自阴影出格子
  const Blur = (src) => {
    const dst = new Float32Array(src.length), [nx, ny, nz] = vn;
    for (let z = 0; z < nz; z++) for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
      let s = 0, c = 0;
      for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const X = x + dx, Y = y + dy, Z = z + dz; if (X < 0 || Y < 0 || Z < 0 || X >= nx || Y >= ny || Z >= nz) continue;
        const wgt = (dx ? 0.5 : 1) * (dy ? 0.5 : 1) * (dz ? 0.5 : 1); s += src[X + nx * (Y + ny * Z)] * wgt; c += wgt;
      }
      dst[x + nx * (y + ny * z)] = s / c;
    }
    return dst;
  };
  const extBlur = Blur(ext2);
  let extMax = 0; for (const v of extBlur) extMax = Math.max(extMax, v);
  const density = new Uint8Array(extBlur.length);
  for (let i = 0; i < extBlur.length; i++) density[i] = Math.round(Math.sqrt(extBlur[i] / (extMax || 1)) * 255);   // 开方存，暗部精度够
  // 4. 发片
  const cards = { pos: [], tan: [], nrm: [], uv: [], data: [], idx: [] };
  const cfg = style.cards, tileList = tiles[cfg.tile];
  for (let layer = 0; layer < cfg.layers; layer++) {
    const lrng = Rng(HashString(groomId + ':cards:' + layer));
    const picks = PoissonRoots(sampler, lrng, cfg.spacing, (p, n, source) => { const w = Weight(p, n, source); return w > .25 ? w : 0; }, 4000);
    for (const pk of picks) {
      const b = BindStrand(pk.p, pk.n, guideRoots, gGrid, near);
      if (!b) continue;
      const spine = InterpolateStrand(guides, K, b.ids, b.w, Mix(0.8, 1, lrng()), style.clump * 0.5, Math.max(3, K - 1));
      // 短发的发片压平一点（只留一部分立起来的高度），一层压一层像瓦片，免得一片片竖在头上、前额翘出去
      const flat = style.family === 'Short' ? Mix(0.45, 0.8, layer / Math.max(1, cfg.layers - 1)) : 1;
      const root = spine[0];
      const lift = 0.0006 + layer * Math.max(0.0008, style.volume * 0.45);
      const sp = spine.map((p, i) => {
        const d = Sub(p, root), up = Dot(d, pk.n);
        return Add(Add(root, Sub(d, Scale(pk.n, up * (1 - flat)))), Scale(pk.n, lift * (i === 0 ? 0.6 : 1)));
      });
      const comb = CombDir(style, frame, pk.p, pk.n);
      const edge = Mix(0.55, 1, Smooth(0.25, 0.9, Weight(pk.p, pk.n, pk)));   // 发际线附近的发片窄一些
      CardStrip(cards, sp, pk.n, comb, cfg.width * Mix(0.8, 1.15, lrng()) * edge, tileList[Math.floor(lrng() * tileList.length)], lrng(), layer / Math.max(1, cfg.layers - 1));
    }
  }
  // 5. 头发壳
  let shell;
  const HeightAt = (p) => {
    let best = 0, cnt = 0;
    for (const gi of gGrid.Near(p, 0.008, near)) { if (Len(Sub(guideRoots[gi], p)) > 0.008) continue; best += Math.max(...heightOf[gi]); cnt++; }
    return cnt ? best / cnt : 0;
  };
  if (style.shell.kind === 'scalp') {
    shell = ScalpPatch(mesh, Weight, (p, n, w) => 0.0004 + HeightAt(p) * 0.8 * Mix(0.4, 1, w), (p, n) => CombDir(style, frame, p, n));
  } else {
    const blurred = Blur(Blur(fieldCells));
    let mx = 0; for (const v of blurred) mx = Math.max(mx, v);
    // The lowest tier represents a continuous mass, not every sparse clump.
    // Close small gaps before extracting its surface; otherwise the ear/temple
    // region can contain conspicuous holes through both sides of the hull.
    let closed = Uint8Array.from(blurred, (v) => v > mx * 0.04 ? 1 : 0);
    const stride = [1, vn[0], vn[0] * vn[1]];
    for (const dilate of [true, false]) for (let axis = 0; axis < 3; axis++) {
      const dst = new Uint8Array(closed.length);
      for (let z = 0; z < vn[2]; z++) for (let y = 0; y < vn[1]; y++) for (let x = 0; x < vn[0]; x++) {
        const i = x + vn[0] * (y + vn[1] * z), coord = [x, y, z][axis];
        let value = dilate ? 0 : 1;
        for (let d = -2; d <= 2; d++) {
          const sample = coord + d < 0 || coord + d >= vn[axis] ? 0 : closed[i + d * stride[axis]];
          value = dilate ? Math.max(value, sample) : Math.min(value, sample);
        }
        dst[i] = value;
      }
      closed = dst;
    }
    const net = SurfaceNets(Blur(closed), vn, bmin.map((v) => v + vox * 0.5), vox, 0.5);
    const tan = [], nrm = [], data = [];
    const segGrid = new Grid3(0.01);
    guides.forEach((g, gi) => g.forEach((p, k) => segGrid.Add(p, gi * K + k)));
    for (let i = 0; i < net.pos.length; i += 3) {
      const p = [net.pos[i], net.pos[i + 1], net.pos[i + 2]];
      let best = null, bd = Infinity;
      for (const id of segGrid.Near(p, 0.012, near)) { const gi = (id / K) | 0, k = id % K; const d = Len(Sub(guides[gi][k], p)); if (d < bd) { bd = d; best = [gi, k]; } }
      let t = [0, -1, 0];
      if (best) { const g = guides[best[0]], k = Math.min(K - 2, best[1]); t = Norm(Sub(g[k + 1], g[k])); }
      tan.push(...t); nrm.push(0, 1, 0); data.push(1, 0);
    }
    // 法线：面法线累加
    const acc = new Float32Array(net.pos.length);
    for (let i = 0; i < net.idx.length; i += 3) {
      const [a, b, c] = [net.idx[i], net.idx[i + 1], net.idx[i + 2]];
      const P = (v) => [net.pos[3 * v], net.pos[3 * v + 1], net.pos[3 * v + 2]];
      const fn = Cross(Sub(P(b), P(a)), Sub(P(c), P(a)));
      for (const v of [a, b, c]) { acc[3 * v] += fn[0]; acc[3 * v + 1] += fn[1]; acc[3 * v + 2] += fn[2]; }
    }
    for (let v = 0; v < acc.length; v += 3) { const nn = Norm([acc[v], acc[v + 1], acc[v + 2]]); nrm[v] = nn[0]; nrm[v + 1] = nn[1]; nrm[v + 2] = nn[2]; }
    shell = { pos: net.pos, nrm, tan, data, idx: net.idx };
    // Strand density can be hollow at the crown. The coarse volume must also
    // cover the roots, including where the hanging hair parts around the scalp.
    const cap = ScalpPatch(mesh, Weight, () => .0015, (p, n) => CombDir(style, frame, p, n));
    const baseVertex = shell.pos.length / 3;
    for (const key of ['pos', 'nrm', 'tan', 'data']) shell[key].push(...cap[key]);
    shell.idx.push(...cap.idx.map(index => index + baseVertex));
    shell.rootCapTriangles = cap.idx.length / 3;
  }
  // 6. 头皮染色片：贴着头皮 0.15 mm，发丝 / 发片档下压暗发根之间透出来的光头皮（UE MetaHuman 靠头皮贴图做同一件事）
  const projection = frame.referenceProjection;
  const FrontalScalp = (p, n, source) => projection && SkinTone(source) >= .2 && !frame.IsEar(p, hl.earMaskHalfWidth ?? .8) && (!scalpExclude || !scalpExclude(p)) && frame.Phi(p) < HAIR_SHADING.referenceFrontFadeDegrees[1]
    && p[1] > projection.HairlineY(p) - .012;
  const scalp = ScalpPatch(mesh, (p, n, source) => FrontalScalp(p, n, source) ? 1 : ScalpWeight(p, n, source), () => 0.00015, (p, n) => CombDir(style, frame, p, n));
  if (projection) {
    const rootWeights = scalp.data.filter((_, i) => i % 2 === 0);
    scalp.uv = []; scalp.data = [];
    for (let i = 0; i < scalp.pos.length; i += 3) {
      const p = scalp.pos.slice(i, i + 3);
      scalp.uv.push(...projection.ScalpUv(p));
      const weight = mesh.skinScore && frame.Phi(p) >= 100 ? rootWeights[i / 3] : ScalpWeight(p, null, scalp.sourceIndex[i / 3]);
      const blend = !frame.IsEar(p, hl.earMaskHalfWidth ?? .8) && (mesh.skinScore ? weight > 0 : !exclude || !exclude(p))
        ? 1 - Smooth(65, 85, frame.Phi(p)) : 0;
      scalp.data.push(weight, .00015, blend);
    }
  }
  return { guides, open, strands, K, bmin, bmax, density, vn, vox, extMax, cards, shell, scalp, guideCount: guides.length };
}

// ---------------------------------------------------------------------------------------------------------------
// 一套胡子（发片 + 胡茬贴片）
function SampleSkinWeights(mesh, sample) {
  const byJoint = new Map();
  for (let corner = 0; corner < 3; corner++) for (let k = 0; k < 4; k++) {
    const index = 4 * sample.vertices[corner] + k, weight = mesh.boneWeights[index] * sample.bary[corner];
    if (weight > 0) byJoint.set(mesh.boneJoints[index], (byJoint.get(mesh.boneJoints[index]) || 0) + weight);
  }
  const ranked = [...byJoint].sort((a, b) => b[1] - a[1]), strongest = ranked.slice(0, 4);
  const kept = strongest.reduce((sum, pair) => sum + pair[1], 0);
  return { joints: Array.from({ length: 4 }, (_, i) => strongest[i]?.[0] ?? strongest[0][0]),
    weights: Array.from({ length: 4 }, (_, i) => (strongest[i]?.[1] || 0) / kept), dropped: 1 - kept };
}
function BuildBeard(groomId, style, frame, mesh, sdf, sampler, tiles, exclude = null) {
  const rng = Rng(HashString(groomId + ':beard'));
  const K = style.points;
  const projection = style.referenceMask ? new ReferenceProjection(REFERENCE_MASKS.looks[style.referenceMask], frame, style.referenceParts) : null;
  const PartsAt = (p) => (exclude && exclude(p) ? [] : projection ? projection.PartsAt(p) : frame.BeardParts(p, style.parts));
  const Weight = (p) => { let w = 0; for (const q of PartsAt(p)) if (projection || q.part !== 'cheek') w = Math.max(w, q.density); return w; };
  const cards = { pos: [], tan: [], nrm: [], uv: [], data: [], idx: [] };
  if (mesh.boneJoints) { cards.boneJoints = []; cards.boneWeights = []; }
  let maxDroppedWeight = 0;
  const cfg = style.cards, tileList = tiles[cfg.tile];
  let cardCount = 0;
  // 很多窄小发片：每片沿生长方向随机偏一点、翘起角度各不同（胡须是戳出来的，不是贴在脸上的），叠几层出体积。
  if (projection || Object.keys(style.parts).length) {
    for (let layer = 0; layer < cfg.layers; layer++) {
      const lrng = Rng(HashString(groomId + ':beardcards:' + layer));
      const picks = PoissonRoots(sampler, lrng, cfg.spacing * (1 + 0.12 * layer), (p) => Weight(p), 14000);
      for (const pk of picks) {
        const parts = PartsAt(pk.p).filter((q) => projection || q.part !== 'cheek');
        if (!parts.length) continue;
        parts.sort((a, b) => b.density - a.density);
        const q = parts[0];
        if (lrng() > q.density * (cfg.rootScale ?? 1)) continue;
        let comb = Norm(Project(q.dir, pk.n));
        const turn = (lrng() - 0.5) * 0.7;
        comb = Norm(Add(Scale(comb, Math.cos(turn)), Scale(Cross(pk.n, comb), Math.sin(turn))));
        const len = q.length * Mix(0.6, 1.15, lrng());
        const lift = Clamp(style.lift + (lrng() - 0.5) * 0.35 + layer * 0.06, 0.05, 0.85);
        const pts = GrowGuide(pk.p, pk.n, comb, len, Math.max(3, K), { lift, stiffness: style.stiffness, gravity: len > 0.03 ? 0.6 : 0.1, volume: len * 0.05 }, sdf, lrng);
        const sp = pts.map((p) => Add(p, Scale(pk.n, 0.0002 + layer * 0.0004)));
        const skin = mesh.boneJoints ? SampleSkinWeights(mesh, pk) : null;
        if (skin) maxDroppedWeight = Math.max(maxDroppedWeight, skin.dropped);
        CardStrip(cards, sp, pk.n, comb, cfg.width * Mix(0.8, 1.2, lrng()), tileList[Math.floor(lrng() * tileList.length)], lrng(), layer / Math.max(1, cfg.layers - 1), skin);
        cardCount++;
      }
    }
  }
  // 胡茬贴片：贴着皮肤 0.3 mm 的一层，data = [密度, 茬长]
  const st = style.stubble;
  const stParts = st ? Object.fromEntries(st.parts.map((k) => [k, { ...(style.parts[k] || {}), length: 0.001, density: 1, cheek: style.parts.jaw?.cheek ?? 0.45 }])) : null;
  if (stParts) { stParts.jaw ||= { length: 0.001, density: 1, cheek: 0.5 }; if (!st.parts.includes('jaw')) delete stParts.jaw; }
  let stubble = st && !projection ? ScalpPatch(mesh, (p) => {
    if (exclude && exclude(p)) return 0;
    let w = 0; for (const q of frame.BeardParts(p, stParts)) w = Math.max(w, q.part === 'cheek' ? q.density * 0.5 : q.density);
    return w * st.density;
  }, () => 0.00025, (p, n) => Norm(Project([0, -1, 0.1], n)), 0.01) : null;
  if (projection) {
    stubble = ScalpPatch(mesh, p => (!exclude || !exclude(p)) && projection.Contains(p) ? 1 : 0,
      () => .00035, (p, n) => Norm(Project([0, -1, .1], n)));
    stubble.uv = [];
    for (let i = 0; i < stubble.pos.length; i += 3) {
      stubble.uv.push(...projection.AtlasUv(stubble.pos.slice(i, i + 3)));
    }
  }
  return { cards, stubble, cardCount, maxDroppedWeight };
}
function BindBeardSkin(beard, game) {
  const parts = [beard.cards, beard.stubble].filter(part => part?.boneJoints?.length);
  const used = new Set();
  for (const part of parts) for (let i = 0; i < part.boneJoints.length; i++)
    if (part.boneWeights[i] > 0.001) used.add(part.boneJoints[i]);
  const joints = [...used].sort((a, b) => a - b);
  if (!joints.length || joints.length > 8) throw new Error(`${game.jointNames[0]}: beard needs ${joints.length} bones (maximum 8)`);
  const palette = new Map(joints.map((joint, index) => [joint, index]));
  let maxDroppedWeight = beard.maxDroppedWeight;
  for (const part of parts) {
    part.boneIndices = []; part.boundWeights = [];
    for (let vertex = 0; vertex < part.pos.length / 3; vertex++) {
      let kept = 0;
      for (let k = 0; k < 4; k++) {
        const i = 4 * vertex + k, weight = part.boneWeights[i];
        part.boneIndices.push(weight > 0.001 ? palette.get(part.boneJoints[i]) : 0);
        part.boundWeights.push(weight > 0.001 ? weight : 0);
        if (weight > 0.001) kept += weight;
      }
      if (kept <= 0) throw new Error('Beard vertex has no skin weights');
      maxDroppedWeight = Math.max(maxDroppedWeight, Math.abs(1 - kept));
      for (let k = 0; k < 4; k++) part.boundWeights[4 * vertex + k] /= kept;
    }
  }
  if (maxDroppedWeight > 0.02) throw new Error(`Beard skin transfer dropped ${(maxDroppedWeight * 100).toFixed(1)}% weight`);
  return { bones: joints.map(joint => game.jointNames[joint]), attach: joints.map(joint => game.attachBones[joint]), maxDroppedWeight };
}

// ---------------------------------------------------------------------------------------------------------------
// 打包：TXHR + 版本 + JSON 长度 + JSON + 4 字节对齐的各段
// 网格段量化：位置按段包围盒存 16 位、单位向量 8 位、UV 16 位、[0,1] 的数据 8 位（运行时载入时解回 float）。
function QPos(a) {
  const f = Float32Array.from(a), min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < f.length; i++) { const k = i % 3; min[k] = Math.min(min[k], f[i]); max[k] = Math.max(max[k], f[i]); }
  const q = new Uint16Array(f.length);
  for (let i = 0; i < f.length; i++) { const k = i % 3, r = max[k] - min[k] || 1; q[i] = Math.round(((f[i] - min[k]) / r) * 65535); }
  return { array: q, quant: { kind: 'range', comps: 3, min, max } };
}
function QDir(a) { const q = new Int8Array(a.length); for (let i = 0; i < a.length; i++) q[i] = Math.round(Clamp(a[i], -1, 1) * 127); return { array: q, quant: { kind: 'snorm' } }; }
function QUnit16(a) { const q = new Uint16Array(a.length); for (let i = 0; i < a.length; i++) q[i] = Math.round(Clamp(a[i], 0, 1) * 65535); return { array: q, quant: { kind: 'unorm' } }; }
function MeshSections(prefix, m, { uv = false, dataScale = null, skinning = false } = {}) {
  const out = {};
  out[prefix + 'Pos'] = QPos(m.pos);
  out[prefix + 'Nrm'] = QDir(m.nrm);
  out[prefix + 'Index'] = Idx(m.idx, m.pos.length / 3);
  if (m.tan) out[prefix + 'Tan'] = QDir(m.tan);
  if (uv && m.uv) out[prefix + 'Uv'] = QUnit16(m.uv);
  if (m.data) {
    // data 每个顶点 2–3 个分量；第 2 个分量（头发壳、头皮片的厚度，米）按 dataScale 缩放存
    const comps = m.data.length / (m.pos.length / 3);
    const scales = Array.from({ length: comps }, (_, k) => (dataScale && dataScale[k]) || 1);
    const q = new Uint8Array(m.data.length);
    for (let i = 0; i < m.data.length; i++) q[i] = Math.round(Clamp(m.data[i] / scales[i % comps], 0, 1) * 255);
    out[prefix + 'Data'] = { array: q, quant: { kind: 'unorm', comps, scales } };
  }
  if (skinning && m.boneIndices) {
    out[prefix + 'BoneIndices'] = { array: Uint8Array.from(m.boneIndices) };
    out[prefix + 'BoneWeights'] = QUnit16(m.boundWeights);
  }
  return out;
}

function Pack(header, sections) {
  const parts = [], meta = {};
  let offset = 0;
  for (const [name, entry] of Object.entries(sections)) {
    if (!entry) continue;
    const arr = entry.array || entry;
    const buf = Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength);
    meta[name] = { offset, length: buf.length, type: arr.constructor.name, count: arr.length };
    if (entry.quant) meta[name].quant = entry.quant;
    parts.push(buf);
    const pad = (4 - (buf.length % 4)) % 4;
    if (pad) parts.push(Buffer.alloc(pad));
    offset += buf.length + pad;
  }
  header.sections = meta;
  let js = Buffer.from(JSON.stringify(header));
  js = Buffer.concat([js, Buffer.alloc((4 - (js.length % 4)) % 4, 0x20)]);
  const head = Buffer.alloc(12);
  head.write('TXHR', 0, 'ascii'); head.writeUInt32LE(FORMAT_VERSION, 4); head.writeUInt32LE(js.length, 8);
  return Buffer.concat([head, js, ...parts]);
}
const Idx = (a, vertexCount) => (vertexCount < 65535 ? Uint16Array.from(a) : Uint32Array.from(a));

function DeepMerge(a, b) {
  if (!b) return a;
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = v && typeof v === 'object' && !Array.isArray(v) ? DeepMerge(a[k] || {}, v) : v;
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// 游戏里的人物（docs/Data_HairSystem.md §7）：Tripo 绑骨模型戴着帽子。做法：
//   1. 取头骨（Head）权重大的三角形，换到「米、y 朝上」的工作坐标（模型是厘米、骨架根绕 X 转 90° 缩 0.01）；
//   2. 实验室光头和游戏模型的脸是同一个 Tripo 光头：带缩放的 ICP（Horn 四元数法，修剪掉最远的 40%）把实验室光头对齐过去；
//   3. 游戏头部网格反变换回实验室坐标，关键点、发际线、胡子区域照用实验室那一套；
//   4. 默认按参考皮肤 ±4 mm 分皮肤 / 帽子。标记 hatSeam 的游戏套装只在耳后用本人脸部肤色补回误分的头皮，
//      发根继续排除帽布，发丝碰到帽子推出来；胡须仍用原皮肤网格。
//   5. 文件头写挂接矩阵 attach = 头骨反绑矩阵 × 工作坐标⁻¹ × ICP 变换（实验室米 → 头骨局部），运行时挂在 Head 骨下。
async function ReadSkinnedGlb(file, decodeColor = false) {
  const b = fs.readFileSync(file);
  const jl = b.readUInt32LE(12), j = JSON.parse(b.subarray(20, 20 + jl).toString());
  const bin = b.subarray(28 + jl);
  const Acc = (i) => {
    const a = j.accessors[i], v = j.bufferViews[a.bufferView];
    const comps = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }[a.type];
    const Ctor = { 5126: Float32Array, 5125: Uint32Array, 5123: Uint16Array, 5121: Uint8Array }[a.componentType];
    const size = Ctor.BYTES_PER_ELEMENT * comps, stride = v.byteStride || size;
    const out = new Ctor(a.count * comps), off = (v.byteOffset || 0) + (a.byteOffset || 0);
    const src = new Uint8Array(bin.buffer, bin.byteOffset + off, stride * (a.count - 1) + size);
    for (let k = 0; k < a.count; k++) out.set(new Ctor(src.slice(k * stride, k * stride + size).buffer), k * comps);
    if (a.normalized && Ctor !== Float32Array) { const f = new Float32Array(out.length), m = Ctor === Uint8Array ? 255 : 65535; for (let k = 0; k < out.length; k++) f[k] = out[k] / m; return f; }
    return out;
  };
  const prim = j.meshes[0].primitives[0], skin = j.skins[0];
  const jointNames = skin.joints.map((n) => j.nodes[n].name);
  let ColorAt = null;
  if (decodeColor) {
    const texture = j.textures[j.materials[prim.material || 0].pbrMetallicRoughness.baseColorTexture.index];
    const image = j.images[texture.source ?? texture.extensions?.EXT_texture_webp?.source];
    const imageView = j.bufferViews[image.bufferView];
    const imageBytes = bin.subarray(imageView.byteOffset || 0, (imageView.byteOffset || 0) + imageView.byteLength);
    const { data: pixels, info } = await sharp(imageBytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const uv = Acc(prim.attributes.TEXCOORD_0);
    ColorAt = (i) => {
      const x = Clamp(Math.round(uv[2 * i] * (info.width - 1)), 0, info.width - 1);
      const y = Clamp(Math.round(uv[2 * i + 1] * (info.height - 1)), 0, info.height - 1);
      const offset = (y * info.width + x) * info.channels;
      return [pixels[offset], pixels[offset + 1], pixels[offset + 2]];
    };
  }
  return { pos: Acc(prim.attributes.POSITION), nrm: Acc(prim.attributes.NORMAL), joints: Acc(prim.attributes.JOINTS_0),
    weights: Acc(prim.attributes.WEIGHTS_0), idx: Acc(prim.indices), ibm: Acc(skin.inverseBindMatrices), jointNames, ColorAt,
    root: j.nodes[j.scenes[0].nodes[0]] };
}
// 4×4 列主序
const M4 = {
  Mul(a, b) { const o = new Array(16).fill(0); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]; return o; },
  Apply(m, p) { return [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]]; },
  ApplyDir(m, p) { return [m[0] * p[0] + m[4] * p[1] + m[8] * p[2], m[1] * p[0] + m[5] * p[1] + m[9] * p[2], m[2] * p[0] + m[6] * p[1] + m[10] * p[2]]; },
  FromTRS(t, q, s) {
    const [x, y, z, w] = q, x2 = x + x, y2 = y + y, z2 = z + z;
    const xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2, wx = w * x2, wy = w * y2, wz = w * z2;
    return [(1 - (yy + zz)) * s[0], (xy + wz) * s[0], (xz - wy) * s[0], 0, (xy - wz) * s[1], (1 - (xx + zz)) * s[1], (yz + wx) * s[1], 0,
      (xz + wy) * s[2], (yz - wx) * s[2], (1 - (xx + yy)) * s[2], 0, t[0], t[1], t[2], 1];
  },
  Invert(m) {
    const [a00, a01, a02, a03, a10, a11, a12, a13, a20, a21, a22, a23, a30, a31, a32, a33] = m;
    const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10, b03 = a01 * a12 - a02 * a11;
    const b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12, b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30;
    const b08 = a20 * a33 - a23 * a30, b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
    const det = 1 / (b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06);
    return [(a11 * b11 - a12 * b10 + a13 * b09) * det, (a02 * b10 - a01 * b11 - a03 * b09) * det, (a31 * b05 - a32 * b04 + a33 * b03) * det, (a22 * b04 - a21 * b05 - a23 * b03) * det,
      (a12 * b08 - a10 * b11 - a13 * b07) * det, (a00 * b11 - a02 * b08 + a03 * b07) * det, (a32 * b02 - a30 * b05 - a33 * b01) * det, (a20 * b05 - a22 * b02 + a23 * b01) * det,
      (a10 * b10 - a11 * b08 + a13 * b06) * det, (a01 * b08 - a00 * b10 - a03 * b06) * det, (a30 * b04 - a31 * b02 + a33 * b00) * det, (a21 * b02 - a20 * b04 - a23 * b00) * det,
      (a11 * b07 - a10 * b09 - a12 * b06) * det, (a00 * b09 - a01 * b07 + a02 * b06) * det, (a31 * b01 - a30 * b03 - a32 * b00) * det, (a20 * b03 - a21 * b01 + a22 * b00) * det];
  },
};
// 4×4 实对称矩阵的雅可比特征分解（Horn 四元数法要最大特征值的特征向量）
function JacobiEigen4(A) {
  const a = A.map((r) => r.slice()), v = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]];
  for (let sweep = 0; sweep < 60; sweep++) {
    let off = 0; for (let p = 0; p < 4; p++) for (let q = p + 1; q < 4; q++) off += a[p][q] * a[p][q];
    if (off < 1e-20) break;
    for (let p = 0; p < 4; p++) for (let q = p + 1; q < 4; q++) {
      if (Math.abs(a[p][q]) < 1e-30) continue;
      const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
      const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1)), c = 1 / Math.sqrt(t * t + 1), sn = t * c;
      for (let k = 0; k < 4; k++) { const akp = a[k][p], akq = a[k][q]; a[k][p] = c * akp - sn * akq; a[k][q] = sn * akp + c * akq; }
      for (let k = 0; k < 4; k++) { const apk = a[p][k], aqk = a[q][k]; a[p][k] = c * apk - sn * aqk; a[q][k] = sn * apk + c * aqk; }
      for (let k = 0; k < 4; k++) { const vkp = v[k][p], vkq = v[k][q]; v[k][p] = c * vkp - sn * vkq; v[k][q] = sn * vkp + c * vkq; }
    }
  }
  let best = 0; for (let k = 1; k < 4; k++) if (a[k][k] > a[best][best]) best = k;
  return [v[0][best], v[1][best], v[2][best], v[3][best]];
}
// 带缩放的刚体配准（Horn 1987）：返回把 A 映到 B 的 4×4
function SimilarityFit(A, B) {
  const n = A.length, ma = [0, 0, 0], mb = [0, 0, 0];
  for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) { ma[k] += A[i][k] / n; mb[k] += B[i][k] / n; }
  const S = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]; let sa = 0, sb = 0;
  for (let i = 0; i < n; i++) {
    const a = Sub(A[i], ma), b = Sub(B[i], mb); sa += Dot(a, a); sb += Dot(b, b);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) S[r][c] += a[r] * b[c];
  }
  const [Sxx, Sxy, Sxz] = S[0], [Syx, Syy, Syz] = S[1], [Szx, Szy, Szz] = S[2];
  const N = [[Sxx + Syy + Szz, Syz - Szy, Szx - Sxz, Sxy - Syx], [Syz - Szy, Sxx - Syy - Szz, Sxy + Syx, Szx + Sxz],
    [Szx - Sxz, Sxy + Syx, -Sxx + Syy - Szz, Syz + Szy], [Sxy - Syx, Szx + Sxz, Syz + Szy, -Sxx - Syy + Szz]];
  const [w, x, y, z] = JacobiEigen4(N);
  const scale = Math.sqrt(sb / sa);
  const R = M4.FromTRS([0, 0, 0], [x, y, z, w], [scale, scale, scale]);
  const rma = M4.Apply(R, ma);
  R[12] = mb[0] - rma[0]; R[13] = mb[1] - rma[1]; R[14] = mb[2] - rma[2];
  return R;
}
// 仿射最小二乘（12 参数）：合并时头被分方向缩放过（日兵甲），相似变换对不严
function AffineFit(A, B) {
  const G = new Array(16).fill(0), R = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
  for (let i = 0; i < A.length; i++) {
    const a = [A[i][0], A[i][1], A[i][2], 1];
    for (let r = 0; r < 4; r++) { for (let c = 0; c < 4; c++) G[c * 4 + r] += a[r] * a[c]; for (let k = 0; k < 3; k++) R[k][r] += a[r] * B[i][k]; }
  }
  const Gi = M4.Invert(G), out = new Array(16).fill(0);
  for (let k = 0; k < 3; k++) for (let c = 0; c < 4; c++) { let v = 0; for (let r = 0; r < 4; r++) v += Gi[r * 4 + c] * R[k][r]; out[c * 4 + k] = v; }
  out[15] = 1;
  return out;
}
function TrimmedIcp(src, dst, init, { iterations = 40, keep = 0.6, affine = false } = {}) {
  const grid = new Grid3(0.01), near = [];
  dst.forEach((p, i) => grid.Add(p, i));
  let T = init, err = 0;
  for (let it = 0; it < iterations; it++) {
    const pairs = [];
    for (const p of src) {
      const q = M4.Apply(T, p);
      let best = -1, bd = Infinity;
      for (let r = 0.012; r <= 0.05 && best < 0; r *= 2) for (const id of grid.Near(q, r, near)) { const d = Len(Sub(dst[id], q)); if (d < bd) { bd = d; best = id; } }
      if (best >= 0) pairs.push([p, dst[best], bd]);
    }
    pairs.sort((a, b) => a[2] - b[2]);
    const used = pairs.slice(0, Math.max(30, Math.floor(pairs.length * keep)));
    err = used.reduce((s, x) => s + x[2], 0) / used.length;
    T = (affine ? AffineFit : SimilarityFit)(used.map((x) => x[0]), used.map((x) => x[1]));
  }
  return { T, err };
}
async function GameHeadAssets(def) {
  const t0 = Date.now();
  const lab = HeadAssets(def.labHead);
  const fitHatSeam = def.hairRootFit === 'hatSeam';
  const g = await ReadSkinnedGlb(path.join(PROJECT, def.model), fitHatSeam);
  const J = (name) => g.jointNames.findIndex((n) => n === name || n.endsWith(':' + name));
  const head = J('Head'), neck = J('Neck');
  if (head < 0 || neck < 0) throw new Error(`${def.model}: 缺少 Head / Neck 骨`);
  const root = g.root;
  const W = M4.FromTRS(root.translation || [0, 0, 0], root.rotation || [0, 0, 0, 1], root.scale || [1, 1, 1]);   // 模型（骨架空间）→ 工作坐标（米、y 上）
  const V = g.pos.length / 3, sel = new Uint8Array(V), work = [];
  for (let i = 0; i < V; i++) {
    let wh = 0, wn = 0;
    for (let k = 0; k < 4; k++) { const jn = g.joints[4 * i + k], w = g.weights[4 * i + k]; if (jn === head) wh += w; if (jn === neck) wn += w; }
    work.push(M4.Apply(W, [g.pos[3 * i], g.pos[3 * i + 1], g.pos[3 * i + 2]]));
    if (wh >= 0.2 || wn >= 0.35) sel[i] = 1;
  }
  // 头部这一块的工作坐标点（ICP 目标）
  const dst = []; for (let i = 0; i < V; i++) if (sel[i]) dst.push(work[i]);
  // 实验室光头的脸（眉骨以下、前半面）当 ICP 源：脸上没有帽子
  const m = lab.frame.m, src = [];
  for (let i = 0; i < lab.mesh.pos.length; i += 3) {
    const p = [lab.mesh.pos[i], lab.mesh.pos[i + 1], lab.mesh.pos[i + 2]];
    if (p[1] < m.glabella[1] + 0.01 && p[1] > m.menton[1] - 0.005 && p[2] < lab.frame.zc - 0.02) src.push(p);
  }
  // 初值：两种朝向都试（游戏模型脸朝 ±Z 不确定），鼻尖对鼻尖、头高比定缩放
  let gTop = -Infinity; for (const p of dst) gTop = Math.max(gTop, p[1]);
  let best = null;
  // 帽檐可能比鼻子更靠前（日兵甲）：鼻尖只在帽顶以下 12–30 cm 里找，再上下各错几厘米多试几个初值
  for (const yaw of [0, Math.PI]) for (const k0 of (def.icpScales || [1])) for (const dy of [-0.03, -0.015, 0, 0.015, 0.03]) {
    const q = [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)];
    const R = M4.FromTRS([0, 0, 0], q, [1, 1, 1]);
    const fwd = M4.ApplyDir(R, [0, 0, -1]);
    let nose = null, nd = -Infinity;
    for (const p of dst) { if (p[1] < gTop - 0.30 || p[1] > gTop - 0.12) continue; const d = Dot(p, fwd); if (d > nd) { nd = d; nose = p; } }
    const labNose = Scale(M4.Apply(R, [0, m.noseTip[1], m.noseTip[2]]), k0);
    const init = M4.FromTRS(Add(Sub(nose, labNose), [0, dy, 0]), q, [k0, k0, k0]);
    const r = TrimmedIcp(src, dst, init, { iterations: 25 });
    if (process.env.HAIR_ICP_DEBUG) console.log(`    yaw ${yaw.toFixed(2)} scale0 ${k0} dy ${dy}: ${(r.err * 1000).toFixed(2)} mm`);
    if (!best || r.err < best.err) best = r;
  }
  best = TrimmedIcp(src, dst, best.T, { iterations: 40 });
  if (def.icpAffine) {
    const r = TrimmedIcp(src, dst, best.T, { iterations: 30, keep: 0.75, affine: true });
    if (process.env.HAIR_ICP_DEBUG) console.log(`    affine: ${(r.err * 1000).toFixed(2)} mm`);
    if (r.err < best.err) best = r;
  }
  const S = best.T, Sinv = M4.Invert(S);
  let SkinColorScore = null;
  if (fitHatSeam) {
    const faceColors = [];
    for (let i = 0; i < V; i++) {
      const p = M4.Apply(Sinv, work[i]);
      if (p[1] < lab.frame.men + .02 || p[1] > lab.frame.gl - .015 || lab.frame.Phi(p) > 55 || p[2] > lab.frame.zc - .01) continue;
      const [r, green, blue] = g.ColorAt(i);
      if (r > green && green > blue && blue > 15) faceColors.push([Math.log(r / green), Math.log(green / blue)]);
    }
    if (faceColors.length < 50) throw new Error(`${def.model}: not enough skin pixels to distinguish the scalp from the cap`);
    const Median = (values) => { values.sort((a, b) => a - b); return values[Math.floor(values.length / 2)]; };
    const skinChroma = [0, 1].map(k => Median(faceColors.map(color => color[k])));
    SkinColorScore = (i) => {
      const [r, green, blue] = g.ColorAt(i);
      if (r <= 25 || green <= 20 || blue <= 15) return 0;
      const dr = Math.abs(Math.log(r / green) - skinChroma[0]);
      const dg = Math.abs(Math.log(green / blue) - skinChroma[1]);
      return Clamp(1 - Math.max(dr / .16, dg / .16, (dr + dg) / .24), 0, 1);
    };
  }
  // 游戏头部网格 → 实验室坐标
  const map = new Int32Array(V).fill(-1), pos = [], nrm = [], idx = [], boneJoints = [], boneWeights = [], sourceIds = [];
  for (let t = 0; t < g.idx.length; t += 3) {
    const tri = [g.idx[t], g.idx[t + 1], g.idx[t + 2]];
    if (!sel[tri[0]] || !sel[tri[1]] || !sel[tri[2]]) continue;
    for (const i of tri) {
      if (map[i] < 0) {
        map[i] = pos.length / 3;
        const p = M4.Apply(Sinv, work[i]);
        const n = Norm(M4.ApplyDir(Sinv, M4.ApplyDir(W, [g.nrm[3 * i], g.nrm[3 * i + 1], g.nrm[3 * i + 2]])));
        pos.push(...p); nrm.push(...n); sourceIds.push(i);
        for (let k = 0; k < 4; k++) { boneJoints.push(g.joints[4 * i + k]); boneWeights.push(g.weights[4 * i + k]); }
      }
      idx.push(map[i]);
    }
  }
  const all = { pos: Float32Array.from(pos), nrm: Float32Array.from(nrm), idx: Uint32Array.from(idx),
    boneJoints: Uint16Array.from(boneJoints), boneWeights: Float32Array.from(boneWeights) };
  if (fitHatSeam) all.skinScore = Float32Array.from(sourceIds, SkinColorScore);
  // 分皮肤 / 帽子：离实验室皮肤面的距离
  const vn = all.pos.length / 3, skinV = new Uint8Array(vn), hairV = new Uint8Array(vn), hairCandidate = new Uint8Array(vn);
  for (let i = 0; i < vn; i++) {
    const p = [all.pos[3 * i], all.pos[3 * i + 1], all.pos[3 * i + 2]];
    const d = lab.sdf.Sample(p);
    skinV[i] = Math.abs(d) < .004 ? 1 : 0;
    const underRearRim = lab.frame.Phi(p) > 100 && p[1] < lab.frame.m.ear.yMax + .005;
    hairCandidate[i] = fitHatSeam && underRearRim && d > -.015 && d < .018 ? 1 : 0;
    hairV[i] = skinV[i] || (hairCandidate[i] && all.skinScore[i] >= .12) ? 1 : 0;
  }
  const Split = (keepSkin, selected = skinV, closeHairGaps = false) => {
    const mp = new Int32Array(vn).fill(-1), p2 = [], n2 = [], i2 = [], joints2 = [], weights2 = [], color2 = [];
    for (let t = 0; t < all.idx.length; t += 3) {
      const tri = [all.idx[t], all.idx[t + 1], all.idx[t + 2]];
      const votes = selected[tri[0]] + selected[tri[1]] + selected[tri[2]];
      const isSkin = votes === 3 || (closeHairGaps && votes >= 2 && tri.every(i => hairCandidate[i] || skinV[i]));
      if (keepSkin !== !!isSkin) continue;
      for (const i of tri) { if (mp[i] < 0) { mp[i] = p2.length / 3; p2.push(all.pos[3 * i], all.pos[3 * i + 1], all.pos[3 * i + 2]); n2.push(all.nrm[3 * i], all.nrm[3 * i + 1], all.nrm[3 * i + 2]); if (fitHatSeam) color2.push(all.skinScore[i]); for (let k = 0; k < 4; k++) { joints2.push(all.boneJoints[4 * i + k]); weights2.push(all.boneWeights[4 * i + k]); } } i2.push(mp[i]); }
    }
    return { pos: Float32Array.from(p2), nrm: Float32Array.from(n2), idx: Uint32Array.from(i2),
      boneJoints: Uint16Array.from(joints2), boneWeights: Float32Array.from(weights2),
      ...(fitHatSeam ? {skinScore: Float32Array.from(color2)} : {}) };
  };
  const skin = Split(true), cap = Split(false), hairMesh = fitHatSeam ? Split(true, hairV, true) : skin;
  const sdf = new MeshSdf(all);                         // 碰撞：皮肤 + 帽子（帽子是实心的，发丝推到帽子外面）
  const capSdf = cap.idx.length ? new MeshSdf(cap) : null;
  const exclude = capSdf ? (p) => capSdf.Sample(p) < 0.003 || lab.sdf.Sample(p) < -0.004 : null;   // 帽子罩住的、被压进帽壳的头顶
  const hairExclude = fitHatSeam && capSdf ? (p) => {
    const rim = Smooth(lab.frame.m.ear.yMax - .005, lab.frame.m.ear.yMax + .005, p[1]);
    return capSdf.Sample(p) < Mix(-.003, .003, rim) || lab.sdf.Sample(p) < -.014;
  } : exclude;
  const scalpExclude = fitHatSeam ? (p) => {
    if (lab.sdf.Sample(p) < -.015) return true;
    const rearRim = lab.frame.Phi(p) > 100 && p[1] < lab.frame.m.ear.yMax + .005;
    return !rearRim && exclude(p);
  } : exclude;
  const base = M4.Mul(M4.Invert(W), S);
  const attachBones = g.jointNames.map((_, i) => M4.Mul(Array.from(g.ibm.slice(16 * i, 16 * i + 16)), base));
  const attach = attachBones[head];
  console.log(`  game head ${def.id}: ${dst.length} head verts, ICP ${(best.err * 1000).toFixed(2)} mm, scale ${Math.cbrt(Math.abs(S[0] * (S[5] * S[10] - S[9] * S[6]) - S[4] * (S[1] * S[10] - S[9] * S[2]) + S[8] * (S[1] * S[6] - S[5] * S[2]))).toFixed(3)}, skin ${skin.idx.length / 3} tri, hair scalp ${hairMesh.idx.length / 3} tri, cap ${cap.idx.length / 3} tri (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  const sampler = new SurfaceSampler(skin);
  return { mesh: skin, hairMesh, sdf, sampler, hairSampler: fitHatSeam ? new SurfaceSampler(hairMesh) : sampler,
    frame: lab.frame, exclude, hairExclude, scalpExclude, attach, attachBones,
    jointNames: g.jointNames, icpErrorM: best.err, bone: 'Head' };
}

const headCache = new Map();
function HeadAssets(key) {
  if (headCache.has(key)) return headCache.get(key);
  const t0 = Date.now();
  const mesh = ReadHeadGlb(path.join(HAIR, 'Heads', `Model_HairHead_${key}.glb`));
  const sdf = new MeshSdf(mesh);
  const v = { mesh, sdf, sampler: new SurfaceSampler(mesh), frame: new HeadFrame(HEADS[key]) };
  console.log(`  head ${key}: sdf ${sdf.n.join('x')} in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  headCache.set(key, v);
  return v;
}

async function BuildGroom(entry, tiles) {
  const t0 = Date.now();
  const game = entry.model ? await GameHeadAssets(entry) : null;
  const { mesh, sdf, sampler, frame: baseFrame, exclude = null, hairExclude = exclude } = game || HeadAssets(entry.head);
  const header = { format: 'tengxian.hairGroom', version: FORMAT_VERSION, id: entry.id, head: entry.head, label: entry.label, frame: 'head', units: 'm' };
  if (game) Object.assign(header, { model: entry.model, modelSha256: createHash('sha256').update(fs.readFileSync(path.join(PROJECT, entry.model))).digest('hex'), bone: game.bone, attach: game.attach, icpErrorM: game.icpErrorM });
  const sections = {};
  const reference = entry.referenceLook ? REFERENCES[entry.referenceLook] : null;
  if (entry.referenceLook && !reference) throw new Error(`Missing reference look: ${entry.referenceLook}`);
  const frame = reference ? new HeadFrame(DeepMerge(baseFrame.m, reference.landmarks)) : baseFrame;
  if (reference) {
    frame.referenceProjection = new ReferenceProjection(REFERENCE_MASKS.looks[entry.referenceLook], frame, reference.beard.referenceParts);
    header.portrait = {center: [frame.centerX, (frame.top + frame.men) * .5, frame.zc], height: frame.top - frame.men};
  }
  if (reference) header.reference = {look: entry.referenceLook, source: reference.source, sha256: reference.sha256, version: REFERENCE_DATA.version,
    recipeSha256: createHash('sha256').update(JSON.stringify(reference)).digest('hex')};
  if (entry.hair) {
    const style = DeepMerge(DeepMerge(STYLES.hair[entry.hair], entry.hairOverrides), reference?.hair);
    const h = BuildHair(entry.id, style, frame, game?.hairMesh || mesh, sdf, game?.hairSampler || sampler, tiles, hairExclude, game?.scalpExclude || hairExclude);
    const G = h.guides.length, K = h.K;
    const guideData = new Float32Array(G * K * 4);
    h.guides.forEach((g, gi) => g.forEach((p, k) => { const o = 4 * (gi * K + k); guideData[o] = p[0]; guideData[o + 1] = p[1]; guideData[o + 2] = p[2]; guideData[o + 3] = h.open[gi][k]; }));
    const S = h.strands.length;
    const sg = new Uint16Array(S * 3), sb = new Uint16Array(S * 2), ss = new Uint8Array(S * 2);
    h.strands.forEach((s, i) => {
      sg.set(s.ids, 3 * i);
      sb[2 * i] = Math.round(((s.w[0] + 0.5) / 2) * 65535); sb[2 * i + 1] = Math.round(((s.w[1] + 0.5) / 2) * 65535);
      ss[2 * i] = Math.round(s.seed * 255); ss[2 * i + 1] = Math.round(s.len * 255);
    });
    Object.assign(sections, {
      hairGuides: guideData, hairStrandGuides: sg, hairStrandBary: sb, hairStrandSeed: ss, hairDensity: h.density,
      ...MeshSections('hairCard', h.cards, { uv: true }),
      ...MeshSections('hairShell', h.shell, { dataScale: [1, 0.05] }),
      ...MeshSections('hairScalp', h.scalp, { uv: !!reference, dataScale: [1, 0.05, 1] }),
    });
    header.hair = {
      style: entry.hair, name: style.name, family: style.family, guides: G, points: K, strands: S,
      ...(entry.hairRootFit ? { rootFit: entry.hairRootFit } : {}),
      bounds: { min: h.bmin, max: h.bmax }, density: { res: h.vn, voxel: h.vox, min: h.bmin, extinctionMax: h.extMax, encoding: 'sqrt' },
      cards: { count: h.cards.idx.length / 6 / (K - 1 || 1), triangles: h.cards.idx.length / 3 },
      shell: { kind: style.shell.kind, triangles: h.shell.idx.length / 3, opacity: style.shell.opacity, ...(h.shell.rootCapTriangles ? {rootCapTriangles: h.shell.rootCapTriangles} : {}) },
      scalp: { triangles: h.scalp.idx.length / 3, tint: style.scalpTint ?? { Short: 0.8, Medium: 0.6, Long: 0.55 }[style.family] ?? 0.6 },
      render: { width: style.width, clump: style.clump, frizz: style.frizz, curl: style.curl, color: style.color,
        roughness: style.roughness, specular: style.specular, scatter: style.scatter, length: Math.max(...Object.values(style.length)) },
    };
    if (reference) {
      const mask = REFERENCE_MASKS.looks[entry.referenceLook];
      header.hair.referenceScalp = {look: entry.referenceLook, atlasSha256: REFERENCE_MASKS.atlasSha256,
        frontFadeDegrees: HAIR_SHADING.referenceFrontFadeDegrees,
        projection: mask.projection, crop: mask.hairCrop, tile: mask.tile,
        centerZ: frame.zc, top: frame.top, normalizationLuminance: mask.normalizationLuminance};
    }
  }
  if (entry.beard) {
    const style = DeepMerge(STYLES.beard[entry.beard], reference?.beard);
    const b = BuildBeard(entry.id, style, frame, mesh, sdf, sampler, tiles, exclude);
    const skinning = game ? BindBeardSkin(b, game) : null;
    if (b.cards.idx.length) Object.assign(sections, MeshSections('beardCard', b.cards, { uv: true, skinning: !!game }));
    if (b.stubble && b.stubble.idx.length) Object.assign(sections, MeshSections('beardStubble', b.stubble, { uv: !!style.referenceMask, dataScale: [1, 0.05], skinning: !!game }));
    header.beard = { style: entry.beard, name: style.name, cards: b.cardCount, triangles: b.cards.idx.length / 3,
      ...(skinning ? { skinning } : {}),
      stubble: { triangles: b.stubble ? b.stubble.idx.length / 3 : 0, density: style.stubble?.density ?? 0, length: style.stubble?.length ?? 0 },
      render: { color: style.color, roughness: 0.42, specular: 0.5, scatter: 0.5, cardAlphaScale: style.cards.alphaScale ?? 1 } };
    header.beard.render.referenceCoverageGain = style.coverageGain ?? 1;
    header.beard.render.referenceCoverageScale = style.coverageScale ?? 1;
    header.beard.render.referenceLuminance = !!style.referenceLuminance;
    header.beard.render.referenceLuminanceGain = style.luminanceGain ?? 1;
    if (style.referenceMask) header.beard.referenceMask = {
      look: style.referenceMask, atlas: REFERENCE_MASKS.atlas, atlasSha256: REFERENCE_MASKS.atlasSha256,
      sourceSha256: reference.sha256, baldSha256: reference.baldSha256,
      ...(style.referenceLuminance ? {luminanceAtlasSha256:REFERENCE_MASKS.luminanceAtlasSha256} : {}),
    };
  }
  const buf = Pack(header, sections);
  const file = path.join(HAIR, 'Grooms', `Groom_${entry.id}.bin`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  WriteAsset(file, buf);
  const sec = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`${entry.id}: ${(buf.length / 1e6).toFixed(2)} MB  hair ${header.hair ? `${header.hair.guides} guides × ${header.hair.points}, ${header.hair.strands} strands, cards ${header.hair.cards.triangles} tri, shell ${header.hair.shell.triangles} tri` : '-'}  beard ${header.beard ? `${header.beard.cards} cards, stubble ${header.beard.stubble.triangles} tri` : '-'}  (${sec} s)`);
  return { id: entry.id, head: entry.head, hair: entry.hair, beard: entry.beard, reference: header.reference || null, row: entry.row || null, label: entry.label, model: entry.model || null, file: `Grooms/Groom_${entry.id}.bin`, bytes: buf.length,
    strands: header.hair?.strands ?? 0, guides: header.hair?.guides ?? 0, cardTriangles: (header.hair?.cards.triangles ?? 0) + (header.beard?.triangles ?? 0),
    shellTriangles: header.hair?.shell.triangles ?? 0 };
}

async function main() {
  const args = process.argv.slice(2);
  const atlasFile = path.join(HAIR, 'Textures', 'Texture_HairCardAtlas.png');
  const tiles = BakeAtlas(atlasFile);
  console.log(`atlas: ${path.relative(PROJECT, atlasFile)}`);
  if (args.includes('--atlas')) return;
  const only = args.filter((a) => !a.startsWith('--'));
  const manifestFile = path.join(HAIR, 'Data_HairGrooms.json');
  const old = fs.existsSync(manifestFile) ? JSON.parse(fs.readFileSync(manifestFile, 'utf8')) : null;
  const byId = new Map((old?.grooms || []).map((g) => [g.id, g]));
  const entries = [...STYLES.grooms, ...(STYLES.gameGrooms || [])];
  for (const entry of entries) if (!only.length || only.includes(entry.id)) byId.set(entry.id, await BuildGroom(entry, tiles));
  const manifest = {
    schema: 'tengxian.hairGrooms', version: 1,
    note: '_import/Script_HairGroomBuild.mjs 生成，别手改（改 Hair/Data_HairStyles.json 再重跑）',
    atlas: { file: 'Textures/Texture_HairCardAtlas.png', width: ATLAS.width, height: ATLAS.height, channels: 'R 覆盖 / G 根到梢 / B 发丝随机数 / A 前后深度' },
    heads: Object.fromEntries(Object.keys(HEADS).map((k) => [k, { file: `Heads/Model_HairHead_${k}.glb`, name: HEADS[k].name }])),
    grooms: entries.map((e) => byId.get(e.id)).filter(Boolean),
  };
  WriteAsset(manifestFile, JSON.stringify(manifest, null, 1));
}

await main();
