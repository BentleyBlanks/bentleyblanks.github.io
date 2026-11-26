// 纯 JS 地面与远景涂色栅格工具（零 three、零 DOM，Node、浏览器与地形 Worker 共用）。
// 从 Script_EditorBlockoutLevels 拆出，避免地形 Worker 的依赖图把整套关卡注册表与
// 剧情/任务数据拖进来（此前 69 个模块任一改动都会击穿地形快照缓存）。

export const BLOCKOUT_PAINT = Object.freeze({
  /** 栅格格距：从 0.5 m 起，格数超过 maxCells 就翻倍。 */
  cellM: 0.5, maxCells: 400000, feather: 1,
});

/** 远景地面贴图（§6.3 backdrop，2026-10-20）：最长边至多 maxPx 像素、一个像素至少 minTexelM 米。 */
export const BLOCKOUT_BACKDROP_TEXTURE = Object.freeze({ maxPx: 4096, minTexelM: 1, padM: 6 });

export function HexRgb(hex) {
  const v = parseInt(hex.slice(1), 16);
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
}

/** 点到线段的距离平方。 */
function SegDist2(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2)) : 0;
  const ex = px - ax - dx * t, ez = pz - az - dz * t;
  return ex * ex + ez * ez;
}

/** 有符号距离：多边形内为负。 */
function PolySignedDistance(px, pz, pts) {
  let inside = false, best = Infinity;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i], b = pts[j];
    if ((a.z > pz) !== (b.z > pz) && px < (b.x - a.x) * (pz - a.z) / (b.z - a.z) + a.x) inside = !inside;
    const d2 = SegDist2(px, pz, a.x, a.z, b.x, b.z);
    if (d2 < best) best = d2;
  }
  const d = Math.sqrt(best);
  return inside ? -d : d;
}

function LineDistance(px, pz, pts) {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const d2 = SegDist2(px, pz, pts[i - 1].x, pts[i - 1].z, pts[i].x, pts[i].z);
    if (d2 < best) best = d2;
  }
  return Math.sqrt(best);
}

/**
 * 把 paint 烘成栅格。→ null（没有可画的项）或 { cellM, minX, minZ, cols, rows, C: Float32Array(rgb 预乘), A: Float32Array, Blend(x, z, rgb) }。
 * Blend 把 (x,z) 处的涂色按覆盖度混进 rgb（sRGB 0–1，就地改），返回覆盖度 A（0 = 没涂）。
 */
export function BuildGroundPaint(items, bounds = null, { cellM: startCellM = BLOCKOUT_PAINT.cellM, maxCells = BLOCKOUT_PAINT.maxCells } = {}) {
  if (!Array.isArray(items) || !items.length) return null;
  const list = items.map((item) => {
    const pts = item.poly || item.line;
    const halfW = item.line ? item.halfW : 0;
    const feather = Number.isFinite(item.feather) ? item.feather : BLOCKOUT_PAINT.feather;
    const pad = halfW + feather;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const p of pts) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z); }
    return { pts, line: !!item.line, halfW, feather, strength: Number.isFinite(item.strength) ? item.strength : 1, rgb: item.rgb || HexRgb(item.color),
      minX: minX - pad, maxX: maxX + pad, minZ: minZ - pad, maxZ: maxZ + pad };
  });
  let minX = Math.min(...list.map((p) => p.minX)), maxX = Math.max(...list.map((p) => p.maxX));
  let minZ = Math.min(...list.map((p) => p.minZ)), maxZ = Math.max(...list.map((p) => p.maxZ));
  if (bounds) { minX = Math.max(minX, bounds.minX); maxX = Math.min(maxX, bounds.maxX); minZ = Math.max(minZ, bounds.minZ); maxZ = Math.min(maxZ, bounds.maxZ); }
  if (!(maxX > minX && maxZ > minZ)) return null;
  let cellM = startCellM;
  while (((maxX - minX) / cellM + 1) * ((maxZ - minZ) / cellM + 1) > maxCells) cellM *= 2;
  const cols = Math.ceil((maxX - minX) / cellM) + 1, rows = Math.ceil((maxZ - minZ) / cellM) + 1;
  const C = new Float32Array(cols * rows * 3), A = new Float32Array(cols * rows);
  for (const p of list) {
    const i0 = Math.max(0, Math.floor((p.minX - minX) / cellM)), i1 = Math.min(cols - 1, Math.ceil((p.maxX - minX) / cellM));
    const j0 = Math.max(0, Math.floor((p.minZ - minZ) / cellM)), j1 = Math.min(rows - 1, Math.ceil((p.maxZ - minZ) / cellM));
    for (let j = j0; j <= j1; j++) {
      const z = minZ + j * cellM;
      for (let i = i0; i <= i1; i++) {
        const x = minX + i * cellM;
        const sd = p.line ? LineDistance(x, z, p.pts) - p.halfW : PolySignedDistance(x, z, p.pts);
        // 边界（sd = 0）处覆盖一半，往外 feather/2 落到 0、往里 feather/2 到满
        const u = 0.5 - sd / p.feather;
        if (u <= 0) continue;
        const k = u >= 1 ? 1 : u * u * (3 - 2 * u);
        const a = k * p.strength;
        if (a <= 0) continue;
        const at = j * cols + i;
        A[at] = A[at] * (1 - a) + a;
        C[at * 3] = C[at * 3] * (1 - a) + p.rgb[0] * a;
        C[at * 3 + 1] = C[at * 3 + 1] * (1 - a) + p.rgb[1] * a;
        C[at * 3 + 2] = C[at * 3 + 2] * (1 - a) + p.rgb[2] * a;
      }
    }
  }
  return HydrateGroundPaint({ cellM, minX, minZ, cols, rows, C, A });
}

export function HydrateGroundPaint(raster) {
  if (!raster) return null;
  const { cellM, minX, minZ, cols, rows, C, A } = raster;
  const Blend = (x, z, rgb) => {
    const gx = (x - minX) / cellM, gz = (z - minZ) / cellM;
    if (!(gx >= 0 && gz >= 0 && gx <= cols - 1 && gz <= rows - 1)) return 0;
    const i = Math.min(cols - 2, Math.floor(gx)), j = Math.min(rows - 2, Math.floor(gz));
    if (i < 0 || j < 0) return 0;
    const u = gx - i, v = gz - j;
    const a00 = j * cols + i, a10 = a00 + 1, a01 = a00 + cols, a11 = a01 + 1;
    const w00 = (1 - u) * (1 - v), w10 = u * (1 - v), w01 = (1 - u) * v, w11 = u * v;
    const a = A[a00] * w00 + A[a10] * w10 + A[a01] * w01 + A[a11] * w11;
    if (a <= 1e-4) return 0;
    for (let c = 0; c < 3; c++) {
      const pc = C[a00 * 3 + c] * w00 + C[a10 * 3 + c] * w10 + C[a01 * 3 + c] * w01 + C[a11 * 3 + c] * w11;
      rgb[c] = rgb[c] * (1 - a) + pc;
    }
    return a;
  };
  return { ...raster, Blend };
}

/**
 * 把 backdrop.paint（按顺序：poly / line 同场景 paint，rects = 轴对齐田块，实边）画成一张 RGBA 图（sRGB 字节），纯 JS、零 three。
 * 每个像素存「预乘」累积色 C 与覆盖度 A（同 BuildGroundPaint），最后写出 rgb = C / A、a = A；没涂到的像素 rgb = ground.color、a = 0
 * （mipmap 平均时不会混进黑边）。图外框一圈像素一定是 a = 0（钳边采样出去就是没涂）。
 * options.bounds 可限定烘焙范围，供局部高精度涂色复用同一套形状与叠色。
 * → null（没有可画的项）或 { minX, minZ, texelM, width, height, data: Uint8Array, painted 被涂到的像素数 }。
 */
export function RasterizeBackdropPaint(backdrop, options = {}) {
  const items = backdrop?.paint || [];
  if (!items.length) return null;
  const T = { ...BLOCKOUT_BACKDROP_TEXTURE, ...options };
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  const Grow = (x0, z0, x1, z1) => { minX = Math.min(minX, x0); minZ = Math.min(minZ, z0); maxX = Math.max(maxX, x1); maxZ = Math.max(maxZ, z1); };
  for (const item of items) {
    if (item.rects) { for (const r of item.rects) Grow(r[0], r[1], r[2], r[3]); continue; }
    const pad = (item.line ? item.halfW : 0) + (Number.isFinite(item.feather) ? item.feather : BLOCKOUT_PAINT.feather);
    for (const p of item.poly || item.line) Grow(p.x - pad, p.z - pad, p.x + pad, p.z + pad);
  }
  if (options.bounds) {
    minX = Math.max(minX, options.bounds.minX); maxX = Math.min(maxX, options.bounds.maxX);
    minZ = Math.max(minZ, options.bounds.minZ); maxZ = Math.min(maxZ, options.bounds.maxZ);
  }
  if (!(maxX > minX && maxZ > minZ)) return null;
  minX -= T.padM; minZ -= T.padM; maxX += T.padM; maxZ += T.padM;
  const texelM = Math.max(T.minTexelM, Math.max(maxX - minX, maxZ - minZ) / (T.maxPx - 2));
  const width = Math.min(T.maxPx, Math.ceil((maxX - minX) / texelM) + 2), height = Math.min(T.maxPx, Math.ceil((maxZ - minZ) / texelM) + 2);
  // 像素 (i, j) 的中心 = (minX + (i − 0.5)·texelM, minZ + (j − 0.5)·texelM)：第 0 行 / 列与最后一行 / 列是空的外框
  minX -= texelM; minZ -= texelM;
  const C = new Float32Array(width * height * 3), A = new Float32Array(width * height);
  const PX = (x) => (x - minX) / texelM - 0.5, PZ = (z) => (z - minZ) / texelM - 0.5;
  const Lo = (v, n) => Math.max(1, Math.min(n - 2, Math.floor(v))), Hi = (v, n) => Math.max(1, Math.min(n - 2, Math.ceil(v)));
  const Blend = (at, rgb, a) => {
    A[at] = A[at] * (1 - a) + a;
    C[at * 3] = C[at * 3] * (1 - a) + rgb[0] * a; C[at * 3 + 1] = C[at * 3 + 1] * (1 - a) + rgb[1] * a; C[at * 3 + 2] = C[at * 3 + 2] * (1 - a) + rgb[2] * a;
  };
  const cov = new Float32Array(width * height);
  for (const item of items) {
    if (item.rects) {
      const pal = item.palette.map(HexRgb);
      for (const [x0, z0, x1, z1, c] of item.rects) {
        // 像素中心落在矩形里的那些像素：实边，整块盖上
        const i0 = Math.max(1, Math.ceil(PX(x0))), i1 = Math.min(width - 2, Math.floor(PX(x1)));
        const j0 = Math.max(1, Math.ceil(PZ(z0))), j1 = Math.min(height - 2, Math.floor(PZ(z1)));
        const rgb = pal[c];
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
          const at = j * width + i;
          A[at] = 1; C[at * 3] = rgb[0]; C[at * 3 + 1] = rgb[1]; C[at * 3 + 2] = rgb[2];
        }
      }
      continue;
    }
    const rgb = HexRgb(item.color);
    const feather = Number.isFinite(item.feather) ? item.feather : BLOCKOUT_PAINT.feather;
    const strength = Number.isFinite(item.strength) ? item.strength : 1;
    const Cover = (sd) => { const u = 0.5 - sd / feather; return u <= 0 ? 0 : (u >= 1 ? 1 : u * u * (3 - 2 * u)) * strength; };
    if (item.poly) {
      const pts = item.poly;
      let bx0 = Infinity, bx1 = -Infinity, bz0 = Infinity, bz1 = -Infinity;
      for (const p of pts) { bx0 = Math.min(bx0, p.x); bx1 = Math.max(bx1, p.x); bz0 = Math.min(bz0, p.z); bz1 = Math.max(bz1, p.z); }
      const i0 = Lo(PX(bx0 - feather), width), i1 = Hi(PX(bx1 + feather), width), j0 = Lo(PZ(bz0 - feather), height), j1 = Hi(PZ(bz1 + feather), height);
      // 轴对齐的矩形（四个点、边都顺着 x / z）直接算有符号距离：大片底色（扫清带、田间小路底色）不必逐边求
      const rect = pts.length === 4 && pts.every((p, k) => { const q = pts[(k + 1) % 4]; return p.x === q.x || p.z === q.z; })
        && new Set(pts.map((p) => p.x)).size === 2 && new Set(pts.map((p) => p.z)).size === 2;
      const cx = (bx0 + bx1) / 2, cz = (bz0 + bz1) / 2, hx = (bx1 - bx0) / 2, hz = (bz1 - bz0) / 2;
      const Sd = rect ? (x, z) => { const qx = Math.abs(x - cx) - hx, qz = Math.abs(z - cz) - hz; return Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0); }
        : (x, z) => PolySignedDistance(x, z, pts);
      for (let j = j0; j <= j1; j++) {
        const z = minZ + (j + 0.5) * texelM;
        for (let i = i0; i <= i1; i++) {
          const a = Cover(Sd(minX + (i + 0.5) * texelM, z));
          if (a > 0) Blend(j * width + i, rgb, a);
        }
      }
      continue;
    }
    // 折线：逐段在自己的外包框里算覆盖、取最大（段与段接头处不叠两遍），最后一起混
    const pts = item.line, reach = item.halfW + feather, touched = [];
    for (let k = 1; k < pts.length; k++) {
      const a0 = pts[k - 1], b0 = pts[k];
      const i0 = Lo(PX(Math.min(a0.x, b0.x) - reach), width), i1 = Hi(PX(Math.max(a0.x, b0.x) + reach), width);
      const j0 = Lo(PZ(Math.min(a0.z, b0.z) - reach), height), j1 = Hi(PZ(Math.max(a0.z, b0.z) + reach), height);
      for (let j = j0; j <= j1; j++) {
        const z = minZ + (j + 0.5) * texelM;
        for (let i = i0; i <= i1; i++) {
          const a = Cover(Math.sqrt(SegDist2(minX + (i + 0.5) * texelM, z, a0.x, a0.z, b0.x, b0.z)) - item.halfW);
          if (a <= 0) continue;
          const at = j * width + i;
          if (cov[at] === 0) touched.push(at);
          if (a > cov[at]) cov[at] = a;
        }
      }
    }
    for (const at of touched) { Blend(at, rgb, cov[at]); cov[at] = 0; }
  }
  const base = HexRgb(backdrop.ground?.color || "#808080");
  const data = new Uint8Array(width * height * 4);
  let painted = 0;
  for (let at = 0; at < width * height; at++) {
    const a = A[at];
    if (a > 1e-4) {
      painted += 1;
      for (let c = 0; c < 3; c++) data[at * 4 + c] = Math.max(0, Math.min(255, Math.round(C[at * 3 + c] / a * 255)));
      data[at * 4 + 3] = Math.max(1, Math.min(255, Math.round(a * 255)));
    } else {
      data[at * 4] = Math.round(base[0] * 255); data[at * 4 + 1] = Math.round(base[1] * 255); data[at * 4 + 2] = Math.round(base[2] * 255); data[at * 4 + 3] = 0;
    }
  }
  return { minX, minZ, texelM, width, height, data, painted };
}
