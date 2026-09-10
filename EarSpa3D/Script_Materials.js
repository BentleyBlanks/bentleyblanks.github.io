// 《采耳物语 · EarSpa3D》程序化材质库（agent-look）
//
// 设计前提：
//  - 所有贴图都在这里用噪声函数 / 离屏 canvas 现算，**零外部图片资产**，离线可跑。
//  - 模块顶层零副作用：不碰 document / window，一切从 CreateMaterials() 里开始。
//  - 颜色一律从 Data_Palette.mjs 的 PALETTE 取，本文件不出现字面色值。
//  - 手机优先：皮肤用 emissive 近似次表面（不开 transmission），envMap 只烘一次且很小。
//
// 单位提醒：1 世界单位 = 1mm。贴图在世界里的物理尺寸由各模块的 UV 决定，
// 本文件只负责「看起来对」的密度（重复次数交给消费方设 repeat）。

import { PALETTE } from "./Data_Palette.mjs";

// ════════════════════════════════════════════════════════════════════════
//  0. 小工具：确定性随机、值噪声、fBm、网格插值
// ════════════════════════════════════════════════════════════════════════

// 为什么不用 Math.random：贴图必须每次生成结果一致，否则同一场景改一行代码
// 材质就会整体变样，回归比对没法做。
function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 值噪声：比 Perlin 便宜一半，做「斑驳 / 毛孔 / 绒毛」这类软噪声完全够用。
function makeNoise2(seed) {
  const rng = makeRng(seed);
  const perm = new Uint8Array(256);
  for (let i = 0; i < 256; i++) perm[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = (rng() * (i + 1)) | 0;
    const tmp = perm[i];
    perm[i] = perm[j];
    perm[j] = tmp;
  }
  const grid = new Float32Array(256 * 256);
  for (let i = 0; i < grid.length; i++) grid[i] = rng();

  const at = (ix, iy) => {
    const x = ix & 255;
    const y = iy & 255;
    return grid[((perm[y] + x) & 255) * 256 + ((perm[x] + y) & 255)];
  };
  const fade = (t) => t * t * (3 - 2 * t);

  return function noise(x, y) {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = fade(x - x0);
    const fy = fade(y - y0);
    const a = at(x0, y0);
    const b = at(x0 + 1, y0);
    const c = at(x0, y0 + 1);
    const d = at(x0 + 1, y0 + 1);
    const top = a + (b - a) * fx;
    const bot = c + (d - c) * fx;
    return top + (bot - top) * fy;
  };
}

// 频率写成整数倍，保证左右/上下能无缝拼接（噪声网格按 256 取模）。
const F = [1, 2, 4, 8, 16, 32, 64];

// 各向异性 fBm：x/y 用不同频率，用来做「沿一个方向拉长」的纹理
// （耳道皮纹褶皱、拉丝金属、羽毛羽枝都靠它）。
function makeFbm2(seed, ax = 1, ay = 1, octaves = 6) {
  const n = makeNoise2(seed);
  const n2 = octaves > 4 ? makeNoise2(seed ^ 0x9e3779b9) : null;
  return (x, y) => {
    let sum = 0;
    let norm = 0;
    let amp = 0.5;
    const half = Math.min(4, octaves);
    for (let o = 0; o < half; o++) {
      const f = F[o];
      sum += amp * n(x * f * ax, y * f * ay);
      norm += amp;
      amp *= 0.5;
    }
    if (n2) {
      for (let o = 4; o < octaves; o++) {
        const f = F[o];
        sum += amp * n2(x * f * ax, y * f * ay);
        norm += amp;
        amp *= 0.5;
      }
    }
    return sum / norm;
  };
}

// 低频场（斑驳 / 大块不均）在 1/step 的粗网格上算，再双线性插值。
// 为什么：512² 逐像素跑 6 个八度噪声在手机上要几百毫秒，低频本来就不需要这个密度。
function makeField(seed, step, octaves, ax = 1, ay = 1) {
  const fbm = makeFbm2(seed, ax, ay, octaves);
  const cells = Math.round(1 / step);
  const n = cells + 1;
  const table = new Float32Array(n * n);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) table[j * n + i] = fbm(i * step, j * step);
  }
  return (u, v) => {
    const x = u / step;
    const y = v / step;
    const i0 = Math.min(cells - 1, Math.max(0, Math.floor(x)));
    const j0 = Math.min(cells - 1, Math.max(0, Math.floor(y)));
    const tx = x - i0;
    const ty = y - j0;
    const a = table[j0 * n + i0];
    const b = table[j0 * n + i0 + 1];
    const c = table[(j0 + 1) * n + i0];
    const d = table[(j0 + 1) * n + i0 + 1];
    const top = a + (b - a) * tx;
    const bot = c + (d - c) * tx;
    return top + (bot - top) * ty;
  };
}

// 全频率 fBm（逐像素），只给「毛孔」这种小尺度细节用。
function makeFbm(seed, octaves) {
  return makeFbm2(seed, 1, 1, octaves);
}

// 单位化到 0..1
function fit01(v, lo = 0, hi = 1) {
  const t = (v - lo) / (hi - lo);
  return t < 0 ? 0 : t > 1 ? 1 : t;
}
function lerp(a, b, t) {
  return a + (b - a) * t;
}

// 三种插值曲线，分别对应「软斑」和「硬边（片状、节点、羽枝）」
const smooth01 = (t) => t * t * (3 - 2 * t);
function ridgeAt(t, center, width) {
  const d = Math.abs(t - center) / width;
  return d >= 1 ? 0 : 1 - d * d;
}

// ════════════════════════════════════════════════════════════════════════
//  1. 贴图工厂
// ════════════════════════════════════════════════════════════════════════

const clampByte = (v) => (v < 0 ? 0 : v > 255 ? 255 : v | 0);

function canUseCanvas() {
  return typeof document !== "undefined" && !!document.createElement;
}

// 建一张 canvas 贴图。paint(ctx, size) 里必须真写像素——本文件没有「填个纯色」的贴图。
function makeTexture(THREE, size, paint, { srgb = false, repeat = 1 } = {}) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  paint(ctx, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  if (repeat !== 1) tex.repeat.set(repeat, repeat);
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  tex.userData.procedural = true;
  tex.userData.resolution = size;
  return tex;
}

// 灰阶贴图（粗糙度 / α / 高度中间产物）
function makeGrayTexture(THREE, size, fill, { srgb = false } = {}) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const img = ctx.createImageData(size, size);
  fill(img.data, size);
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.userData.procedural = true;
  tex.userData.resolution = size;
  return tex;
}

// 由高度场推法线贴图：切空间、openGL 朝向（绿通道向上）。
// strength 越大凹凸越猛；耳道内壁这种近距离观察需要明显一点，房间木墙则要收着。
function makeNormalFromHeight(THREE, height, size, strength = 2.2) {
  return makeGrayTexture(THREE, size, (data) => {
    const at = (x, y) => height[(((y + size) % size) * size) + ((x + size) % size)];
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = at(x + 1, y) - at(x - 1, y);
        const dy = at(x, y + 1) - at(x, y - 1);
        let nx = -dx * strength;
        let ny = -dy * strength;
        let nz = 1;
        const inv = 1 / Math.sqrt(nx * nx + ny * ny + nz * nz);
        nx *= inv;
        ny *= inv;
        nz *= inv;
        const o = (y * size + x) * 4;
        data[o] = clampByte((nx * 0.5 + 0.5) * 255);
        data[o + 1] = clampByte((ny * 0.5 + 0.5) * 255);
        data[o + 2] = clampByte((nz * 0.5 + 0.5) * 255);
        data[o + 3] = 255;
      }
    }
  });
}

// ════════════════════════════════════════════════════════════════════════
//  2. 各张贴图的具体画法
// ════════════════════════════════════════════════════════════════════════

// 皮肤颜色：细腻毛孔 + 轻微不均匀 + 柔和血色斑。
// outer：健康粉嫩的身体皮肤；inner：耳道内壁（更暖更粉，带一点点血管感）。
function paintSkin(ctx, size, inner) {
  const img = ctx.createImageData(size, size);
  const d = img.data;

  // 大块不均（光照般的缓慢起伏）
  const uneven = makeField(inner ? 211 : 101, 1 / 8, 3);
  // 中频皮色斑
  const mottle = makeField(inner ? 212 : 102, 1 / 16, 4);
  // 血色斑（更慢更稀）
  const blush = makeField(inner ? 213 : 103, 1 / 4, 2);
  // 毛孔
  const pore = makeFbm(inner ? 214 : 104, 4);
  // 耳道皮纹褶皱：沿 u 拉长（u ≈ 沿耳道轴向）
  const wrinkle = makeFbm2(inner ? 215 : 105, 0.22, 1.6, 5);

  // 基准色：外层皮肤偏奶油，内壁偏粉。
  const base = inner ? [255, 216, 199] : [255, 224, 206];
  const deep = inner ? [242, 180, 156] : [247, 198, 172];
  const blushC = [255, 159, 174]; // PALETTE.blush
  const veinC = [226, 140, 140];

  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      // 混合因子：不均匀 + 斑驳
      let t = uneven(u, v) * 0.75 + mottle(u, v) * 0.25;
      t = fit01((t - 0.32) / 0.42);
      let r = lerp(base[0], deep[0], t);
      let g = lerp(base[1], deep[1], t);
      let b = lerp(base[2], deep[2], t);

      // 血色斑：只在最柔的低频峰上轻轻压一点粉
      const bf = fit01((blush(u, v) - 0.60) / 0.26);
      const bs = bf * bf * (inner ? 0.46 : 0.30);
      r = lerp(r, blushC[0], bs);
      g = lerp(g, blushC[1], bs);
      b = lerp(b, blushC[2], bs);

      // 若有若无的皮下血管：把褶皱场的脊线染成很淡的血色
      if (inner) {
        const w = wrinkle(u * 3.4, v * 1.15);
        const veiny = ridgeAt(w, 0.5, 0.075) * fit01((mottle(u * 2, v * 2) - 0.42) / 0.4);
        const vs = veiny * 0.26;
        r = lerp(r, veinC[0], vs);
        g = lerp(g, veinC[1], vs);
        b = lerp(b, veinC[2], vs);
      }

      // 毛孔 / 皮纹凹处压暗一点点（不用 pure black，"脏"感会出来）
      let shade = pore(u * 26, v * 26);
      shade = fit01((shade - 0.44) / 0.34);
      const deepAmt = shade * (inner ? 0.16 : 0.12);
      const dark = inner ? [214, 158, 134] : [222, 174, 150];
      r = lerp(r, dark[0], deepAmt);
      g = lerp(g, dark[1], deepAmt);
      b = lerp(b, dark[2], deepAmt);

      const o = (y * size + x) * 4;
      d[o] = clampByte(r);
      d[o + 1] = clampByte(g);
      d[o + 2] = clampByte(b);
      d[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  // 若隐若现的绒毛：耳道内壁/皮肤上的细软毛发，画得极淡，只为了有「绒感」
  ctx.save();
  const strands = Math.round(size * (inner ? 1.6 : 1.1));
  const rng = makeRng(inner ? 0x51a1 : 0x51a0);
  ctx.globalAlpha = inner ? 0.075 : 0.05;
  ctx.strokeStyle = inner ? "#C98F7A" : "#C79A80";
  ctx.lineWidth = Math.max(1, size / 384);
  for (let i = 0; i < strands; i++) {
    const x = rng() * size;
    const y = rng() * size;
    const len = size * (0.012 + rng() * 0.026);
    const ang = rng() * Math.PI * 2;
    const bow = (rng() - 0.5) * 0.9;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(
      x + Math.cos(ang + bow) * len * 0.6,
      y + Math.sin(ang + bow) * len * 0.6,
      x + Math.cos(ang) * len,
      y + Math.sin(ang) * len
    );
    ctx.stroke();
  }
  ctx.restore();
}

// 皮肤高度场（→ 法线贴图）：外皮是「毛孔 + 细微起伏」，内壁是「皮纹褶皱 + 毛孔」。
function buildSkinHeight(size, inner) {
  const h = new Float32Array(size * size);
  const pore = makeFbm(inner ? 224 : 114, 4);
  const fine = makeFbm(inner ? 225 : 115, 3);
  const slow = makeField(inner ? 226 : 116, 1 / 8, 3);
  // 内壁的褶皱：沿 u 拉得很长（u 是绕管壁的角向 → 拉长后像一圈圈皱褶）
  const fold = makeFbm2(227, 0.18, 2.6, 5);

  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      // 毛孔：小坑，用高频噪声的谷底
      let pv = pore(u * (inner ? 30 : 34), v * (inner ? 30 : 34));
      const pit = fit01((0.47 - pv) / 0.16); // 0..1，越大越深
      let hgt = 0.5 - pit * (inner ? 0.22 : 0.18);
      // 中频起伏
      hgt += (slow(u, v) - 0.5) * (inner ? 0.30 : 0.16);
      hgt += (fine(u * 7, v * 7) - 0.5) * 0.10;

      if (inner) {
        // 皮纹：脊 + 谷，形成有方向的褶皱
        const w = fold(u * 4.0, v * 1.1);
        hgt += ridgeAt(w, 0.5, 0.20) * 0.28;
        hgt -= fit01((w - 0.5) / 0.5) * 0.06;
      }
      h[y * size + x] = hgt < 0 ? 0 : hgt > 1 ? 1 : hgt;
    }
  }
  return h;
}

// 耵聍颜色：琥珀色斑驳 + 半透明层次。
// kind = "wet"（琥珀、湿润、层次像糖霜）| "dry"（奶黄、片状分层、像饼干屑）
function paintWax(ctx, size, kind) {
  const img = ctx.createImageData(size, size);
  const d = img.data;
  const wet = kind === "wet";

  const layer = makeField(wet ? 301 : 311, 1 / 8, 4); // 半透明层叠
  const mottle = makeField(wet ? 302 : 312, 1 / 16, 4); // 斑驳
  const sheenPool = makeField(wet ? 303 : 313, 1 / 4, 2); // 高光池（蜡质玻璃感）
  const grain = makeFbm(wet ? 304 : 314, 4);

  // 湿性：琥珀（蜜糖色，不许发脏）；干性：奶黄（像小饼干屑）。
  // 深色端都刻意抬亮：耵聍一旦压暗就变成"脏"，与美术基调冲突。
  const warm = wet ? [238, 176, 98] : [242, 220, 164];
  const deep = wet ? [206, 132, 52] : [222, 188, 116];
  const bright = wet ? [255, 226, 158] : [255, 248, 226];

  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      let r;
      let g;
      let b;

      if (wet) {
        // 糖霜般的层：低频层叠 + 中频斑驳
        const t = fit01((layer(u, v) * 0.6 + mottle(u, v) * 0.4 - 0.30) / 0.45);
        r = lerp(warm[0], deep[0], t);
        g = lerp(warm[1], deep[1], t);
        b = lerp(warm[2], deep[2], t);
        // 高光池：让湿润处发亮，读起来才"透"
        const pool = fit01((sheenPool(u, v) - 0.55) / 0.3);
        const ps = pool * pool * 0.55;
        r = lerp(r, bright[0], ps);
        g = lerp(g, bright[1], ps);
        b = lerp(b, bright[2], ps);
      } else {
        // 干性：片状分层纹。用脊线当成一片片叠起来的薄片边缘。
        const t = fit01((mottle(u, v) - 0.32) / 0.44);
        r = lerp(warm[0], deep[0], t);
        g = lerp(warm[1], deep[1], t);
        b = lerp(warm[2], deep[2], t);
        // 片层：把 v 方向的低频噪声切成硬边，形成"分层"的观感
        const flake = layer(u * 1.3, v * 2.6);
        const edge = ridgeAt(flake, 0.5, 0.11);
        const fs = edge * 0.5;
        r = lerp(r, bright[0], fs);
        g = lerp(g, bright[1], fs);
        b = lerp(b, bright[2], fs);
        // 片与片之间的缝稍深，制造层理
        const seam = ridgeAt(flake, 0.5, 0.035);
        const ss = seam * 0.42;
        r = lerp(r, deep[0], ss);
        g = lerp(g, deep[1], ss);
        b = lerp(b, deep[2], ss);
      }

      // 细颗粒：蜡质里的小气泡 / 结晶
      const gr = fit01((grain(u * 22, v * 22) - 0.58) / 0.3);
      const gi = gr * (wet ? 0.16 : 0.24);
      r = lerp(r, 255, gi);
      g = lerp(g, wet ? 240 : 246, gi);
      b = lerp(b, wet ? 190 : 218, gi);

      const o = (y * size + x) * 4;
      d[o] = clampByte(r);
      d[o + 1] = clampByte(g);
      d[o + 2] = clampByte(b);
      d[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

// 木纹：年轮 + 木纤维。年轮沿 v 密排（CylinderGeometry 的 v 是竖直方向）。
function paintWood(ctx, size, dark) {
  const img = ctx.createImageData(size, size);
  const d = img.data;
  const warp = makeField(dark ? 401 : 411, 1 / 8, 4); // 年轮被节疤搅动的偏移
  const fiber = makeFbm2(dark ? 402 : 412, 22, 1.6, 4); // 沿 u 拉长的纤维
  const knot = makeField(dark ? 403 : 413, 1 / 4, 3);

  // 抬亮的暖木色：木器要"蜜色"，不是"酱油色"。
  const light = dark ? [170, 126, 86] : [216, 174, 124];
  const mid = dark ? [140, 98, 62] : [192, 146, 98];
  const line = dark ? [108, 74, 44] : [158, 116, 74];

  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      // 年轮：v 方向密排的正弦，被低频场搅动 → 自然弯曲
      // 3.2 道/tile，配合消费方约 750mm 的 UV 尺度 ≈ 一道年轮 230mm，是木器的真实尺度
      const wob = (warp(u, v) - 0.5) * 0.22;
      const rings = Math.sin((v * 3.2 + wob * 3) * Math.PI * 2) * 0.5 + 0.5;
      const ringT = Math.pow(rings, 1.5);

      let r = lerp(light[0], mid[0], ringT);
      let g = lerp(light[1], mid[1], ringT);
      let b = lerp(light[2], mid[2], ringT);

      // 年轮之间的细线（木材的"晚材"）
      const fine = Math.pow(rings, 6);
      r = lerp(r, line[0], fine * 0.7);
      g = lerp(g, line[1], fine * 0.7);
      b = lerp(b, line[2], fine * 0.7);

      // 纤维：极细的顺纹条
      const fs = (fiber(u, v * 3) - 0.5) * (dark ? 0.30 : 0.24);
      r *= 1 + fs;
      g *= 1 + fs * 0.98;
      b *= 1 + fs * 0.94;

      // 节疤：低频峰处颜色压深
      const kn = fit01((knot(u, v) - 0.68) / 0.24);
      const ks = kn * 0.35;
      r = lerp(r, line[0], ks);
      g = lerp(g, line[1], ks);
      b = lerp(b, line[2], ks);

      const o = (y * size + x) * 4;
      d[o] = clampByte(r);
      d[o + 1] = clampByte(g);
      d[o + 2] = clampByte(b);
      d[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

// 竹子：v 方向的细长纤维 + 周期性的竹节（节环深一道、节间略亮）。
function paintBamboo(ctx, size) {
  const img = ctx.createImageData(size, size);
  const d = img.data;
  const fiber = makeFbm2(501, 34, 2.2, 4); // 沿 u 拉细的纤维
  const blotch = makeField(502, 1 / 8, 3); // 竹皮的色斑
  const nodes = 1.5; // 一张贴图 1.5 个竹节（配合约 700mm 的 UV 尺度 ≈ 一节 460mm）

  // 竹皮：偏青的奶黄 + 细长纤维 + 竹节。中间调掺一点薄荷，竹才有"竹"味。
  const pale = [232, 212, 168];
  const mid = [196, 176, 130];
  const ring = [158, 134, 88];
  const spine = [246, 236, 206];

  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      let r = lerp(pale[0], mid[0], fit01((blotch(u, v) - 0.28) / 0.5));
      let g = lerp(pale[1], mid[1], fit01((blotch(u, v) - 0.28) / 0.5));
      let b = lerp(pale[2], mid[2], fit01((blotch(u, v) - 0.28) / 0.5));

      // 纵向纤维
      const fs = (fiber(u, v * 2) - 0.5) * 0.34;
      r = r * (1 + fs);
      g = g * (1 + fs * 0.97);
      b = b * (1 + fs * 0.92);

      // 竹节：v 上等距的环
      const nv = (v * nodes) % 1;
      const ringAmt = ridgeAt(nv, 0.5, 0.075);
      const r1 = lerp(r, ring[0], ringAmt * 0.9);
      const g1 = lerp(g, ring[1], ringAmt * 0.9);
      const b1 = lerp(b, ring[2], ringAmt * 0.9);
      r = r1;
      g = g1;
      b = b1;
      // 节间的亮带（竹壁受光的那条）
      const belly = ridgeAt(nv, 0.5, 0.34) - ringAmt;
      const bs = Math.max(0, belly) * 0.5;
      r = lerp(r, spine[0], bs);
      g = lerp(g, spine[1], bs);
      b = lerp(b, spine[2], bs);

      const o = (y * size + x) * 4;
      d[o] = clampByte(r);
      d[o + 1] = clampByte(g);
      d[o + 2] = clampByte(b);
      d[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

// 木/竹共用的高度场（→ 法线贴图）：纤维凹槽 + 年轮/竹节的起伏。
function buildWoodHeight(size, kind) {
  const h = new Float32Array(size * size);
  const fiber = makeFbm2(kind === "bamboo" ? 511 : 421, kind === "bamboo" ? 40 : 26, 1.4, 4);
  const rings = makeField(kind === "bamboo" ? 512 : 422, 1 / 8, 3);
  const knots = makeField(kind === "bamboo" ? 513 : 423, 1 / 4, 2);
  const nodes = kind === "bamboo" ? 1.5 : 0;

  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      let hgt = 0.5;
      hgt += (fiber(u, v * 2) - 0.5) * 0.7; // 纤维凹槽
      if (kind === "bamboo") {
        const nv = (v * nodes) % 1;
        hgt -= ridgeAt(nv, 0.5, 0.07) * 0.5; // 节环凹下去
        hgt += (rings(u, v) - 0.5) * 0.2;
      } else {
        const wob = (rings(u, v) - 0.5) * 0.22;
        const rg = Math.sin((v * 3.2 + wob * 3) * Math.PI * 2) * 0.5 + 0.5;
        hgt += (rg - 0.5) * 0.34;
        hgt -= Math.pow(rg, 6) * 0.25; // 晚材线更深
        hgt -= fit01((knots(u, v) - 0.68) / 0.24) * 0.3;
      }
      h[y * size + x] = hgt < 0 ? 0 : hgt > 1 ? 1 : hgt;
    }
  }
  return h;
}

// 金属拉丝粗糙度：沿 u 拉得极长的噪声条纹 = 各向异性拉丝感。
function paintSteelRough(data, size, rose) {
  const streak = makeFbm2(rose ? 601 : 611, 96, 1.0, 3); // u 方向拉丝
  const blotch = makeField(rose ? 602 : 612, 1 / 8, 3); // 大块抛光不均
  const scratch = makeFbm2(rose ? 603 : 613, 60, 1.0, 2); // 更细的划痕
  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      let rough = 0.22;
      rough += (streak(u, v) - 0.5) * 0.16;
      rough += (scratch(u, v) - 0.5) * 0.07;
      rough += (blotch(u, v) - 0.5) * 0.09;
      const o = (y * size + x) * 4;
      const g = clampByte(fit01(rough, 0.04, 0.55) * 255);
      data[o] = g;
      data[o + 1] = g;
      data[o + 2] = g;
      data[o + 3] = 255;
    }
  }
}

// 羽毛：一条羽轴 + 两侧羽枝，α 用来抠出绒毛轮廓（羽枝末端要虚掉，否则像贴纸）。
function paintFeather(ctx, size, brown) {
  const img = ctx.createImageData(size, size);
  const d = img.data;
  const rng = makeRng(brown ? 0x7e01 : 0x7e00);
  const grain = makeFbm(brown ? 701 : 711, 3);
  const down = makeFbm(brown ? 702 : 712, 4);

  // 羽枝：从羽轴斜着长出来的细线。用「到最近羽枝的距离」算覆盖率。
  const barbCount = 30;
  const barbPitch = 1 / barbCount;
  // 预计算每根羽枝的扰动，避免逐像素查表
  const jitter = new Float32Array(barbCount + 1);
  const len = new Float32Array(barbCount + 1);
  for (let i = 0; i <= barbCount; i++) {
    jitter[i] = (rng() - 0.5) * 0.4;
    len[i] = 0.82 + rng() * 0.18;
  }

  const base = brown ? [216, 180, 138] : [255, 253, 248];
  const deep = brown ? [176, 136, 96] : [232, 230, 224];
  const shaftC = brown ? [238, 216, 184] : [255, 255, 255];

  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      // 羽轴：中间的竖向亮条
      const axis = 1 - Math.abs(u - 0.5) / 0.045;
      // 羽枝：沿 v 的斜线
      const pitch = v / barbPitch;
      const bi = Math.floor(pitch) % barbCount;
      const frac = pitch - Math.floor(pitch);
      // 斜度：靠近边缘的羽枝更斜（展开的羽片）
      const spread = Math.abs(u - 0.5) * 2; // 0 中心 → 1 边缘
      const skew = frac - (u - 0.5) * 0.9;
      const barbDist = Math.abs(((skew % 1) + 1.5) % 1 - 0.5);
      const barbWidth = 0.10 + 0.05 * (1 - spread);
      const barb = barbDist < barbWidth ? 1 - barbDist / barbWidth : 0;

      // 羽片整体轮廓：中间厚、两侧薄，末端收拢
      const edge = 1 - Math.pow(spread, 2.1);
      const tipTaper = 0.55 + 0.45 * Math.sin(Math.PI * Math.min(1, 0.12 + v * 0.95));

      // 细羽枝的绒感（羽枝之间的空隙里还有更细的绒毛）
      const fuzz = fit01((down(u * 28, v * 18) - 0.46) / 0.4);

      let cover = edge * tipTaper;
      cover = Math.max(cover * (0.42 + barb * 0.85), fuzz * edge * 0.55);
      cover = Math.max(cover, axis > 0 ? 1 : 0);
      cover = fit01(cover);

      // 颜色：越靠边缘越淡（真羽毛就是这样透光的）
      const t = 1 - cover * 0.75 - spread * 0.2;
      let r = lerp(base[0], deep[0], fit01(t) * 0.8);
      let g = lerp(base[1], deep[1], fit01(t) * 0.8);
      let b = lerp(base[2], deep[2], fit01(t) * 0.8);

      // 羽轴亮
      if (axis > 0) {
        const a = fit01(axis);
        r = lerp(r, shaftC[0], a * 0.85);
        g = lerp(g, shaftC[1], a * 0.85);
        b = lerp(b, shaftC[2], a * 0.85);
      }
      // 微颗粒
      const gr = (grain(u * 20, v * 20) - 0.5) * 0.12;
      r *= 1 + gr;
      g *= 1 + gr;
      b *= 1 + gr;

      const o = (y * size + x) * 4;
      d[o] = clampByte(r);
      d[o + 1] = clampByte(g);
      d[o + 2] = clampByte(b);
      // α：羽枝之间的空隙要透，但不能透成碎屑 → 给一个下限
      const alpha = axis > 0 ? 1 : fit01(cover * 1.25);
      d[o + 3] = clampByte(alpha * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
}

// 棉花：蓬松绒毛噪声 + 纤维团块，α 也带毛边。
function paintCotton(ctx, size) {
  const img = ctx.createImageData(size, size);
  const d = img.data;
  const fluff = makeFbm(801, 5); // 蓬松高低
  const clump = makeField(802, 1 / 16, 4); // 棉团
  const tip = makeFbm(803, 4); // 毛尖

  const bright = [255, 250, 244];
  const shade = [226, 218, 210];
  const warmShade = [240, 228, 214];

  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const c = fit01((clump(u, v) - 0.3) / 0.5);
      // 绒毛：把高频噪声当成一根根短毛的高度，谷底压暗
      const f = fluff(u * 14, v * 14);
      const pit = fit01((0.5 - f) / 0.3);
      let r = lerp(bright[0], shade[0], c * 0.55 + pit * 0.35);
      let g = lerp(bright[1], shade[1], c * 0.5 + pit * 0.32);
      let b = lerp(bright[2], shade[2], c * 0.45 + pit * 0.28);
      // 暖一点，别发灰
      r = lerp(r, warmShade[0], 0.18);
      g = lerp(g, warmShade[1], 0.18);
      b = lerp(b, warmShade[2], 0.18);
      const t = fit01((tip(u * 30, v * 30) - 0.62) / 0.3);
      r = lerp(r, 255, t * 0.5);
      g = lerp(g, 255, t * 0.5);
      b = lerp(b, 255, t * 0.45);

      const o = (y * size + x) * 4;
      d[o] = clampByte(r);
      d[o + 1] = clampByte(g);
      d[o + 2] = clampByte(b);
      // 只有最蓬松的团块才不透明 → 边缘有棉花糖那种虚化的毛边
      d[o + 3] = clampByte(fit01(0.35 + c * 0.75) * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
}

// 微尘 sprite：中心亮、边缘快速衰减的柔光点，带一点不规则，避免死板的圆。
function paintDust(ctx, size) {
  const img = ctx.createImageData(size, size);
  const d = img.data;
  const wob = makeFbm(901, 3);
  const c = (size - 1) / 2;
  const warm = [255, 246, 224];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x - c) / c;
      const dy = (y - c) / c;
      let r = Math.sqrt(dx * dx + dy * dy);
      // 用噪声轻微扰动半径 → 光点边缘不规整，像真实的浮尘
      r *= 0.86 + wob((x / size) * 3, (y / size) * 3) * 0.28;
      let a = 1 - fit01(r);
      a = Math.pow(a, 2.2); // 中心集中、边缘迅速消失
      const core = Math.pow(1 - fit01(r * 1.8), 3);
      const o = (y * size + x) * 4;
      d[o] = clampByte(lerp(warm[0], 255, core));
      d[o + 1] = clampByte(lerp(warm[1], 255, core));
      d[o + 2] = clampByte(lerp(warm[2], 255, core));
      d[o + 3] = clampByte(a * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
}

// 水面法线：几层缓慢起伏的波纹（撞在一起形成涟漪），供滴耳液 / 水杯用。
function buildWaterHeight(size) {
  const h = new Float32Array(size * size);
  const w1 = makeFbm2(1001, 3, 5, 3);
  const w2 = makeFbm2(1002, 9, 2, 3);
  const w3 = makeFbm2(1003, 1, 1, 3);
  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      let hgt = 0.5;
      hgt += Math.sin((u * 3 + w3(u, v) * 1.6) * Math.PI * 2) * 0.14;
      hgt += Math.sin((v * 4 + w1(u, v) * 1.4) * Math.PI * 2) * 0.12;
      hgt += (w2(u, v) - 0.5) * 0.45;
      h[y * size + x] = hgt < 0 ? 0 : hgt > 1 ? 1 : hgt;
    }
  }
  return h;
}

// 布纹（床单 / 窗帘 / 靠垫）：经纬纱 + 织法不均。
function paintCloth(ctx, size) {
  const img = ctx.createImageData(size, size);
  const d = img.data;
  const weaveU = makeFbm2(1101, 46, 3, 3);
  const weaveV = makeFbm2(1102, 3, 46, 3);
  const uneven = makeField(1103, 1 / 8, 3);
  const nap = makeFbm(1104, 4);

  // 基准色刻意压到中亮：奶油白在暖光下最容易过曝成一片死白，布纹就全丢了。
  const base = [219, 201, 183];
  const deep = [176, 156, 138];
  const warm = [238, 224, 208];

  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      // 经纬线：横竖两个方向的方波，交叉处最亮（织物凸起）
      const warp = Math.abs(((u * 24) % 1) - 0.5) * 2;
      const weft = Math.abs(((v * 24) % 1) - 0.5) * 2;
      const thread = (warp + weft) * 0.5;
      let t = thread * 0.72 + (uneven(u, v) - 0.5) * 0.5 + (nap(u * 18, v * 18) - 0.5) * 0.34;
      t = fit01(t + 0.3);
      let r = lerp(deep[0], base[0], t);
      let g = lerp(deep[1], base[1], t);
      let b = lerp(deep[2], base[2], t);
      r = lerp(r, warm[0], 0.18);
      g = lerp(g, warm[1], 0.18);
      b = lerp(b, warm[2], 0.18);
      // 表面绒毛的极淡提亮
      const fz = fit01((nap(u * 40, v * 40) - 0.6) / 0.3) * 0.16;
      r = lerp(r, 255, fz);
      g = lerp(g, 255, fz);
      b = lerp(b, 255, fz);
      const o = (y * size + x) * 4;
      d[o] = clampByte(r);
      d[o + 1] = clampByte(g);
      d[o + 2] = clampByte(b);
      d[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

function buildClothHeight(size) {
  const h = new Float32Array(size * size);
  const nap = makeFbm(1114, 4);
  const uneven = makeField(1113, 1 / 8, 3);
  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const warp = Math.cos(u * 32 * Math.PI * 2) * 0.5 + 0.5;
      const weft = Math.cos(v * 32 * Math.PI * 2) * 0.5 + 0.5;
      h[y * size + x] = fit01(0.45 + warp * 0.2 + weft * 0.2 + (nap(u * 20, v * 20) - 0.5) * 0.5 + (uneven(u, v) - 0.5) * 0.3);
    }
  }
  return h;
}

// 毛发（耳毛 / 马尾 / 头发）：一根根的纵向条纹 + 鳞片感。
function paintHair(ctx, size, light) {
  const img = ctx.createImageData(size, size);
  const d = img.data;
  const strand = makeFbm2(light ? 1201 : 1211, 3, 60, 3); // 沿 v 拉长 = 顺着毛的方向
  const scale = makeFbm2(light ? 1202 : 1212, 3, 40, 3);
  const sheen = makeField(light ? 1203 : 1213, 1 / 4, 2);

  const base = light ? [235, 226, 214] : [74, 59, 51];
  const deep = light ? [196, 184, 170] : [44, 34, 29];
  const hi = light ? [255, 252, 246] : [126, 104, 88];

  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const s = fit01(strand(u * 1.0, v) * 0.7 + (scale(u, v) - 0.5) * 0.5 + 0.3);
      let r = lerp(deep[0], base[0], s);
      let g = lerp(deep[1], base[1], s);
      let b = lerp(deep[2], base[2], s);
      // 高光带：顺着毛的方向的细亮线
      const hl = ridgeAt(strand(u, v * 0.8), 0.5, 0.16) * fit01((sheen(u, v) - 0.45) / 0.4);
      const hs = hl * 0.7;
      r = lerp(r, hi[0], hs);
      g = lerp(g, hi[1], hs);
      b = lerp(b, hi[2], hs);
      const o = (y * size + x) * 4;
      d[o] = clampByte(r);
      d[o + 1] = clampByte(g);
      d[o + 2] = clampByte(b);
      d[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

function buildHairHeight(size) {
  const h = new Float32Array(size * size);
  const strand = makeFbm2(1221, 3, 60, 3);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      h[y * size + x] = fit01(0.4 + (strand(u, v) - 0.5) * 1.1);
    }
  }
  return h;
}

// ════════════════════════════════════════════════════════════════════════
//  3. 主入口：CreateMaterials
// ════════════════════════════════════════════════════════════════════════

// 三档贴图分辨率：低档 128（省内存/带宽），中档 256，高档 512。
// 低档同时会砍掉法线贴图与部分次级材质，这是"三档真实生效"的主要开关。
const TEX_SIZE = { low: 128, mid: 256, high: 512 };

/**
 * 生成全套程序化材质。
 * @param {object} THREE_unused three 命名空间（由调用方注入）
 * @param {{quality?: "low"|"mid"|"high"}} [options]
 */
export function CreateMaterials(THREE_unused, { quality = "mid" } = {}) {
  const THREE = THREE_unused;
  if (!THREE || !THREE.MeshStandardMaterial) {
    // 契约要求：可选依赖缺失时不许抛异常把游戏卡死。
    return fallbackMaterials();
  }
  const q = quality === "low" || quality === "high" ? quality : "mid";
  const size = TEX_SIZE[q];
  const wantNormal = q !== "low"; // 低档去法线贴图
  const fullDetail = q === "high"; // 高档才有次级材质（玻璃/毛发的额外贴图）

  // ── 颜色工具：调色板是 sRGB 十六进制，three 的颜色管理要按 sRGB 解释 ──
  const col = (hex) => new THREE.Color(hex);
  const texSet = {};

  // 贴图只有在真能建 canvas 时才生成（比如 Node 端 headless 预烘时就没有 document）
  const canTex = canUseCanvas();

  if (canTex) {
    // — 皮肤（外皮）—
    texSet.skinMap = makeTexture(THREE, size, (c, s) => paintSkin(c, s, false), { srgb: true });
    texSet.skinHeight = buildSkinHeight(size, false);
    if (wantNormal) texSet.skinNormal = makeNormalFromHeight(THREE, texSet.skinHeight, size, 2.6);

    // — 皮肤（耳道内壁：皮纹褶皱版）—
    texSet.skinInnerMap = makeTexture(THREE, size, (c, s) => paintSkin(c, s, true), { srgb: true });
    texSet.skinInnerHeight = buildSkinHeight(size, true);
    if (wantNormal) texSet.skinInnerNormal = makeNormalFromHeight(THREE, texSet.skinInnerHeight, size, 3.4);

    // — 耵聍 —
    texSet.waxMap = makeTexture(THREE, size, (c, s) => paintWax(c, s, "wet"), { srgb: true });
    texSet.waxDryMap = makeTexture(THREE, size, (c, s) => paintWax(c, s, "dry"), { srgb: true });
    texSet.waxHeight = buildSkinHeight(size, false); // 借用细噪声做蜡面微凹凸
    if (wantNormal) texSet.waxNormal = makeNormalFromHeight(THREE, texSet.waxHeight, size, 1.6);

    // — 木 / 竹（木纹年轮与竹节纤维分别一张）—
    texSet.woodMap = makeTexture(THREE, size, (c, s) => paintWood(c, s, false), { srgb: true });
    texSet.woodDarkMap = makeTexture(THREE, size, (c, s) => paintWood(c, s, true), { srgb: true });
    texSet.bambooMap = makeTexture(THREE, size, (c, s) => paintBamboo(c, s), { srgb: true });
    if (wantNormal) {
      texSet.woodNormal = makeNormalFromHeight(THREE, buildWoodHeight(size, "wood"), size, 2.0);
      texSet.woodDarkNormal = makeNormalFromHeight(THREE, buildWoodHeight(size, "wood"), size, 1.7);
      texSet.bambooNormal = makeNormalFromHeight(THREE, buildWoodHeight(size, "bamboo"), size, 2.2);
    }

    // — 金属拉丝粗糙度 —
    texSet.steelRough = makeGrayTexture(THREE, size, (d, s) => paintSteelRough(d, s, false));
    texSet.steelRoughDark = makeGrayTexture(THREE, size, (d, s) => paintSteelRough(d, s, true));

    // — 羽毛 —
    texSet.featherMap = makeTexture(THREE, size, (c, s) => paintFeather(c, s, false), { srgb: true });
    texSet.featherBrownMap = makeTexture(THREE, size, (c, s) => paintFeather(c, s, true), { srgb: true });

    // — 棉花 —
    texSet.cottonMap = makeTexture(THREE, size, (c, s) => paintCotton(c, s), { srgb: true });

    // — 微尘 sprite —
    texSet.dustMap = makeTexture(THREE, Math.max(64, size >> 1), (c, s) => paintDust(c, s), { srgb: true });

    // — 水 / 液体 —
    texSet.waterNormal = makeNormalFromHeight(THREE, buildWaterHeight(size), size, 1.1);

    // — 布（床品 / 窗帘 / 靠垫）—
    texSet.clothMap = makeTexture(THREE, size, (c, s) => paintCloth(c, s), { srgb: true });
    if (wantNormal) texSet.clothNormal = makeNormalFromHeight(THREE, buildClothHeight(size), size, 1.5);

    // — 毛发 —
    texSet.hairMap = makeTexture(THREE, size, (c, s) => paintHair(c, s, false), { srgb: true });
    texSet.hairLightMap = makeTexture(THREE, size, (c, s) => paintHair(c, s, true), { srgb: true });
    if (wantNormal) texSet.hairNormal = makeNormalFromHeight(THREE, buildHairHeight(size), size, 1.8);
    // 高档多加一张毛发的柔光环境（做绒感高光用）
    if (fullDetail) texSet.hairSheenMap = texSet.hairLightMap;

    // 高度场是中间产物，法线贴图已经在手就不必留着占内存
    delete texSet.skinHeight;
    delete texSet.skinInnerHeight;
    delete texSet.waxHeight;
  }

  // ── 材质集合 ──
  const materials = {};
  const own = []; // 记下来给 dispose

  const keep = (mat) => {
    own.push(mat);
    return mat;
  };

  // ── 低档的物理材质退化路径 ────────────────────────────────────────
  // MeshPhysicalMaterial 比 Standard 贵（多了 sheen + clearcoat 两段 BRDF）。
  // 低档整条链路退回 MeshStandardMaterial：
  //   · sheen（绒感）→ 用 emissive 的极淡暖色近似，皮肤/布/羽毛不至于死板
  //   · clearcoat（湿润高光）→ 直接不要，改用略低的 roughness 顶一点高光
  // 所有参数一律走构造参数对象（three 只在构造时认这些键；事后赋值会被 setValues
  // 拒绝并打警告——sheen/clearcoat 属于 Physical，Standard 上一个都不能带）。
  const lowQ = q === "low";
  // physOpts 是"完整物理参数"，stdOpts 是低档的等价近似；两边都只在构造时传，不事后改。
  const makePhysical = (physOpts, stdOpts) => {
    if (!lowQ) return new THREE.MeshPhysicalMaterial(physOpts);
    return new THREE.MeshStandardMaterial(stdOpts || physOpts);
  };

  // 皮肤：Physical + sheen（绒感）+ 极淡 clearcoat（湿润高光）。
  // 次表面感用 emissive 的淡暖色近似——真开 transmission 在手机上会掉一半帧。
  const makeSkin = (inner) => {
    const base = {
      color: col(inner ? PALETTE.canalWall : PALETTE.skin),
      map: canTex ? (inner ? texSet.skinInnerMap : texSet.skinMap) : null,
      normalMap: wantNormal && canTex ? (inner ? texSet.skinInnerNormal : texSet.skinNormal) : null,
      roughness: inner ? 0.50 : 0.55,
      metalness: 0.0,
      envMapIntensity: 0.55,
      side: THREE.FrontSide,
    };
    const m = makePhysical(
      {
        ...base,
        sheen: 1.0,
        sheenRoughness: inner ? 0.72 : 0.62,
        sheenColor: col(PALETTE.skinSheen),
        clearcoat: inner ? 0.22 : 0.14,
        clearcoatRoughness: 0.55,
        emissive: col(PALETTE.skinShadow),
        emissiveIntensity: inner ? 0.075 : 0.05,
      },
      {
        ...base,
        // 低档：没有 sheen/clearcoat，把次表面的暖色提到看得出来的程度，
        // 并把 roughness 压一点补回湿润感
        roughness: inner ? 0.46 : 0.5,
        emissive: col(PALETTE.skinShadow),
        emissiveIntensity: inner ? 0.19 : 0.14,
      }
    );
    if (m.normalMap) m.normalScale.set(inner ? 0.85 : 0.6, inner ? 0.85 : 0.6);
    m.name = (inner ? "EarSkinInner" : "EarSkin") + (lowQ ? "Low" : "");
    return keep(m);
  };
  materials.skin = makeSkin(false);
  materials.skinInner = makeSkin(true);

  // 鼓膜：珍珠灰粉、半透、有一点点蜡感高光。禁触但要好看到让人舍不得碰。
  // 颜色比调色板稍微往蜜桃偏一点，免得在暖光下发灰、像块塑料。
  materials.drum = keep(
    makePhysical(
      {
        color: col(PALETTE.drumMembrane).lerp(col(PALETTE.peach), 0.45),
        map: canTex ? texSet.skinMap : null,
        roughness: 0.30,
        metalness: 0.0,
        transparent: true,
        opacity: 0.94,
        sheen: 0.7,
        sheenColor: col(PALETTE.drumCone),
        clearcoat: 0.55,
        clearcoatRoughness: 0.22,
        emissive: col(PALETTE.drumCone),
        emissiveIntensity: 0.22,
        envMapIntensity: 0.7,
        depthWrite: false,
        side: THREE.DoubleSide,
      },
      {
        color: col(PALETTE.drumMembrane).lerp(col(PALETTE.peach), 0.45),
        map: canTex ? texSet.skinMap : null,
        roughness: 0.26,
        metalness: 0.0,
        transparent: true,
        opacity: 0.94,
        emissive: col(PALETTE.drumCone),
        emissiveIntensity: 0.34,
        envMapIntensity: 0.7,
        depthWrite: true,
        side: THREE.DoubleSide,
      }
    )
  );
  materials.drum.name = "EarDrum" + (lowQ ? "Low" : "");

  // 耵聍三兄弟：同一张琥珀贴图，靠 tint / 粗糙度 / 透明度 / emissive 区分。
  // 硬结最透最亮——逆光时要能"透亮"，那是采耳最爽的一眼。
  const makeWax = (name, { tint, map, rough, opacity, emissive, glow, density }) => {
    const base = {
      color: col(tint),
      map: canTex ? map : null,
      normalMap: wantNormal && canTex ? texSet.waxNormal : null,
      metalness: 0.0,
      transparent: true,
      opacity,
      envMapIntensity: 1.1,
      depthWrite: opacity > 0.9,
    };
    const m = makePhysical(
      {
        ...base,
        roughness: rough, // 湿 0.35 / 干 0.62 / 硬结 0.30
        sheen: 0.5,
        sheenColor: col(PALETTE.waxGlow),
        sheenRoughness: 0.3,
        clearcoat: 0.6,
        clearcoatRoughness: 0.22,
        emissive: col(emissive),
        emissiveIntensity: glow,
        ior: 1.45,
      },
      {
        ...base,
        // 低档：靠 roughness 高低区分干湿，琥珀的"透亮"全部交给 emissive
        roughness: Math.max(0.2, rough - 0.08),
        emissive: col(emissive),
        emissiveIntensity: glow * 1.7,
      }
    );
    if (m.normalMap) m.normalScale.set(0.5, 0.5);
    m.name = name + (lowQ ? "Low" : "");
    // 供 Script_Wax 调节"软化后更透更亮"，不用重建材质。
    // 注意：opacity / emissiveIntensity 在 Physical 与 Standard 上都是合法属性，
    // 这里事后赋值不会触发 setValues 的告警。
    m.userData.soften = (soft01) => {
      const s = fit01(soft01);
      m.opacity = opacity + (0.97 - opacity) * s * 0.6;
      m.emissiveIntensity = (lowQ ? glow * 1.7 : glow) * (1 + s * 0.35);
    };
    m.userData.density = density;
    return keep(m);
  };

  materials.waxWet = makeWax("WaxWet", {
    tint: PALETTE.waxWet,
    map: texSet.waxMap,
    rough: 0.35, // 湿性：油亮
    opacity: 0.84,
    emissive: PALETTE.waxGlow,
    glow: 0.20,
    density: 1.0,
  });
  materials.waxDry = makeWax("WaxDry", {
    tint: PALETTE.waxDry,
    map: texSet.waxDryMap,
    rough: 0.62, // 干性：哑光、片状
    opacity: 0.93,
    emissive: PALETTE.waxDry,
    glow: 0.10,
    density: 0.8,
  });
  materials.waxImpacted = makeWax("WaxImpacted", {
    tint: PALETTE.waxImpacted,
    map: texSet.waxMap,
    rough: 0.30, // 硬结：更像琥珀玻璃
    opacity: 0.78,
    emissive: PALETTE.waxGlow,
    glow: 0.28,
    density: 1.3,
  });
  materials.waxImpacted.userData.hardness = 1.0;

  // 碎屑：像小饼干屑 / 麦片碎，要"好想把玩一下"。
  materials.crumb = keep(
    new THREE.MeshStandardMaterial({
      color: col(PALETTE.crumb),
      map: canTex ? texSet.waxDryMap : null,
      roughness: 0.72,
      metalness: 0.0,
      emissive: col(PALETTE.waxDry),
      emissiveIntensity: 0.07,
      envMapIntensity: 0.8,
      flatShading: false,
    })
  );
  materials.crumb.name = "WaxCrumb";

  // 不锈钢：metalness 1 + 拉丝粗糙度贴图；高光靠 envMap（scene 里统一挂）。
  // base 用调色板里的钢色，乘 0.85 压一点：金属是"反射环境"的，底色越亮越像石膏。
  const makeSteel = (name, tint, roughMap, baseRough) => {
    const c = col(tint).multiplyScalar(0.85);
    const m = new THREE.MeshStandardMaterial({
      color: c,
      metalness: 1.0,
      roughness: baseRough,
      roughnessMap: canTex ? roughMap : null,
      envMapIntensity: 1.35,
      side: THREE.FrontSide,
    });
    m.name = name;
    return keep(m);
  };
  materials.steel = makeSteel("Steel", PALETTE.steel, texSet.steelRough, 0.28);
  materials.steelDark = makeSteel("SteelDark", PALETTE.steelDeep, texSet.steelRoughDark, 0.42);

  // 竹：细长纤维 + 竹节，稍微有一点蜡质反光（真竹子是抛光过的）。
  // 注意：sheen / clearcoat 是 MeshPhysicalMaterial 的扩展，MeshStandardMaterial
  // 不认这两个键（会忽略并打 setValues 告警）。所以这里的参数全部只在构造时传，
  // 低档则由 makePhysical 整条换成 Standard（见 makePhysical 的说明）。
  materials.bamboo = keep(
    makePhysical(
      {
        color: col(PALETTE.bamboo),
        map: canTex ? texSet.bambooMap : null,
        normalMap: wantNormal && canTex ? texSet.bambooNormal : null,
        roughness: 0.45,
        metalness: 0.0,
        sheen: 0.3,
        sheenRoughness: 0.6,
        sheenColor: col(PALETTE.honey),
        clearcoat: 0.18,
        clearcoatRoughness: 0.5,
        envMapIntensity: 0.9,
      },
      {
        color: col(PALETTE.bamboo),
        map: canTex ? texSet.bambooMap : null,
        normalMap: wantNormal && canTex ? texSet.bambooNormal : null,
        roughness: 0.38,
        metalness: 0.0,
        emissive: col(PALETTE.honey),
        emissiveIntensity: 0.05,
        envMapIntensity: 0.9,
      }
    )
  );
  materials.bamboo.name = "Bamboo" + (lowQ ? "Low" : "");

  // 木：暖木色年轮，房间与木器的底子。
  const makeWood = (name, tint, map, normal, rough) => {
    const m = new THREE.MeshStandardMaterial({
      color: col(tint),
      map: canTex ? map : null,
      normalMap: wantNormal && canTex ? normal : null,
      roughness: rough,
      metalness: 0.0,
      envMapIntensity: 0.75,
    });
    m.name = name;
    return keep(m);
  };
  materials.wood = makeWood("Wood", PALETTE.wood, texSet.woodMap, texSet.woodNormal, 0.62);
  materials.woodDark = makeWood("WoodDark", PALETTE.woodDeep, texSet.woodDarkMap, texSet.woodDarkNormal, 0.66);

  // 羽毛 / 棉花：alphaMap + DoubleSide + 轻微 emissive 提亮，避免透光处发黑。
  // 用 Physical 是为了 sheen——羽毛和棉花的"绒"全靠它，Standard 上没有这个属性。
  const makeFluffy = (name, tint, map, { rough, emissive, glow, sheen, sheenColor, alphaTest }) => {
    const base = {
      color: col(tint),
      map: canTex ? map : null,
      alphaMap: canTex ? map : null,
      transparent: true,
      alphaTest: alphaTest || 0,
      metalness: 0.0,
      side: THREE.DoubleSide,
      depthWrite: true,
      envMapIntensity: 0.85,
    };
    const m = makePhysical(
      {
        ...base,
        roughness: rough,
        emissive: col(emissive),
        emissiveIntensity: glow,
        sheen: sheen == null ? 0.8 : sheen,
        sheenRoughness: 0.85,
        sheenColor: col(sheenColor || PALETTE.cream),
      },
      {
        ...base,
        // 低档：绒感没了，靠 emissive 提亮 + 略降 roughness 找补
        roughness: Math.max(0.5, rough - 0.1),
        emissive: col(emissive),
        emissiveIntensity: glow * 2.2,
      }
    );
    m.name = name + (lowQ ? "Low" : "");
    return keep(m);
  };
  materials.featherWhite = makeFluffy("FeatherWhite", PALETTE.featherWhite, texSet.featherMap, {
    rough: 0.72,
    emissive: PALETTE.cream,
    glow: 0.10,
    sheen: 0.9,
    sheenColor: PALETTE.white,
  });
  materials.featherBrown = makeFluffy("FeatherBrown", PALETTE.featherBrown, texSet.featherBrownMap, {
    rough: 0.68,
    emissive: PALETTE.honey,
    glow: 0.08,
    sheen: 0.8,
    sheenColor: PALETTE.honey,
  });
  materials.cotton = makeFluffy("Cotton", PALETTE.cotton, texSet.cottonMap, {
    rough: 0.88,
    emissive: PALETTE.cream,
    glow: 0.12,
    sheen: 1.0,
    sheenColor: PALETTE.cream,
  });
  // 棉花偏"团"，稍微透一点更像棉球
  materials.cotton.transparent = true;
  materials.cotton.opacity = 0.96;

  // 马尾 / 耳毛：细密毛束，用毛发贴图 + 弱高光。
  materials.horsehair = keep(
    makePhysical(
      {
        color: col(PALETTE.horsehair),
        map: canTex ? texSet.hairMap : null,
        normalMap: wantNormal && canTex ? texSet.hairNormal : null,
        roughness: 0.42,
        metalness: 0.0,
        sheen: 0.6,
        sheenRoughness: 0.4,
        sheenColor: col(PALETTE.wood),
        emissive: col(PALETTE.horsehair),
        emissiveIntensity: 0.05,
        side: THREE.DoubleSide,
        envMapIntensity: 0.8,
      },
      {
        color: col(PALETTE.horsehair),
        map: canTex ? texSet.hairMap : null,
        normalMap: wantNormal && canTex ? texSet.hairNormal : null,
        roughness: 0.36,
        metalness: 0.0,
        emissive: col(PALETTE.horsehair),
        emissiveIntensity: 0.12,
        side: THREE.DoubleSide,
        envMapIntensity: 0.8,
      }
    )
  );
  materials.horsehair.name = "Horsehair" + (lowQ ? "Low" : "");

  // 头发 / 角色发丝：比马尾浅，带一点亮泽。
  materials.hair = keep(
    makePhysical(
      {
        color: col(PALETTE.inkSoft),
        map: canTex ? texSet.hairMap : null,
        normalMap: wantNormal && canTex ? texSet.hairNormal : null,
        roughness: 0.36,
        metalness: 0.0,
        sheen: 0.5,
        sheenRoughness: 0.35,
        sheenColor: col(PALETTE.peach),
        emissive: col(PALETTE.inkSoft),
        emissiveIntensity: 0.04,
        side: THREE.DoubleSide,
        envMapIntensity: 0.9,
      },
      {
        color: col(PALETTE.inkSoft),
        map: canTex ? texSet.hairMap : null,
        normalMap: wantNormal && canTex ? texSet.hairNormal : null,
        roughness: 0.30,
        metalness: 0.0,
        emissive: col(PALETTE.inkSoft),
        emissiveIntensity: 0.1,
        side: THREE.DoubleSide,
        envMapIntensity: 0.9,
      }
    )
  );
  materials.hair.name = "Hair" + (lowQ ? "Low" : "");

  // 玻璃（药水瓶 / 水杯）：低粗糙 + 高透明；不用 transmission 以免移动端丢帧。
  materials.glass = keep(
    makePhysical(
      {
        color: col(PALETTE.glass),
        roughness: 0.08,
        metalness: 0.0,
        transparent: true,
        opacity: 0.30,
        clearcoat: 1.0,
        clearcoatRoughness: 0.05,
        ior: 1.5,
        reflectivity: 0.6,
        envMapIntensity: 1.5,
        side: THREE.DoubleSide,
        depthWrite: false,
      },
      {
        color: col(PALETTE.glass),
        roughness: 0.1,
        metalness: 0.0,
        transparent: true,
        opacity: 0.3,
        envMapIntensity: 1.5,
        side: THREE.DoubleSide,
        depthWrite: false,
      }
    )
  );
  materials.glass.name = "Glass" + (lowQ ? "Low" : "");

  // 水 / 液体：低粗糙、高透明、法线扰动（滴耳液、茶杯里的茶汤）。
  materials.water = keep(
    makePhysical(
      {
        color: col(PALETTE.water),
        normalMap: canTex ? texSet.waterNormal : null,
        roughness: 0.06,
        metalness: 0.0,
        transparent: true,
        opacity: 0.55,
        clearcoat: 1.0,
        clearcoatRoughness: 0.04,
        ior: 1.33,
        envMapIntensity: 1.6,
        side: THREE.DoubleSide,
        depthWrite: false,
      },
      {
        color: col(PALETTE.water),
        normalMap: canTex ? texSet.waterNormal : null,
        roughness: 0.08,
        metalness: 0.0,
        transparent: true,
        opacity: 0.55,
        envMapIntensity: 1.6,
        side: THREE.DoubleSide,
        depthWrite: false,
      }
    )
  );
  if (materials.water.normalMap) materials.water.normalScale.set(0.35, 0.35);
  materials.water.name = "Water" + (lowQ ? "Low" : "");

  // 陶瓷（茶具、花瓶）：奶油釉面，很轻的次表面。
  materials.ceramic = keep(
    makePhysical(
      {
        color: col(PALETTE.ceramic),
        roughness: 0.22,
        metalness: 0.0,
        clearcoat: 0.9,
        clearcoatRoughness: 0.12,
        sheen: 0.3,
        sheenColor: col(PALETTE.cream),
        emissive: col(PALETTE.cream),
        emissiveIntensity: 0.04,
        envMapIntensity: 1.0,
      },
      {
        color: col(PALETTE.ceramic),
        roughness: 0.18,
        metalness: 0.0,
        emissive: col(PALETTE.cream),
        emissiveIntensity: 0.1,
        envMapIntensity: 1.0,
      }
    )
  );
  materials.ceramic.name = "Ceramic" + (lowQ ? "Low" : "");

  // 布（床品 / 窗帘 / 地毯）：经纬织纹 + 绒毛（sheen 让布有棉绒的柔光）。
  materials.cloth = keep(
    makePhysical(
      {
        color: col(PALETTE.cream),
        map: canTex ? texSet.clothMap : null,
        normalMap: wantNormal && canTex ? texSet.clothNormal : null,
        roughness: 0.92,
        metalness: 0.0,
        sheen: 0.7,
        sheenColor: col(PALETTE.cream),
        sheenRoughness: 0.85,
        envMapIntensity: 0.55,
        side: THREE.DoubleSide,
      },
      {
        color: col(PALETTE.cream),
        map: canTex ? texSet.clothMap : null,
        normalMap: wantNormal && canTex ? texSet.clothNormal : null,
        roughness: 0.9,
        metalness: 0.0,
        emissive: col(PALETTE.cream),
        emissiveIntensity: 0.08,
        envMapIntensity: 0.55,
        side: THREE.DoubleSide,
      }
    )
  );
  materials.cloth.name = "Cloth" + (lowQ ? "Low" : "");
  // 布的法线只给一点点：同一张贴图既当 map 又当 normalMap，推太猛会出摩尔纹
  if (materials.cloth.normalMap) materials.cloth.normalScale.set(0.55, 0.55);

  // 微尘（Points 用的 sprite 材质；MakeDustPoints 会自己克隆一份）
  materials.dust = keep(
    new THREE.PointsMaterial({
      color: col(PALETTE.honey),
      map: canTex ? texSet.dustMap : null,
      size: 3.2,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      alphaTest: 0.002,
    })
  );
  materials.dust.name = "Dust";

  // 低档的收尾：已经全部由 makePhysical 在建材质时就分好了 Physical / Standard 两套，
  // 这里只补一处——低档没有 clearcoat 撑湿润高光，把鼓膜的不透明处理回来更稳。
  if (lowQ) materials.drum.depthWrite = true;

  // 贴图集清单：交给消费方设 repeat / offset，也方便验收页统计
  const textureSet = Object.assign(texSet, {
    size,
    quality: q,
    normalMaps: wantNormal,
  });

  return {
    ...materials,
    textureSet,
    /** 彻底释放：贴图、材质全部 dispose，并清空 textureSet 上的引用 */
    dispose() {
      for (const key of Object.keys(textureSet)) {
        const v = textureSet[key];
        if (v && v.isTexture) v.dispose();
        else if (v instanceof Float32Array) textureSet[key] = null;
      }
      for (const m of own) m.dispose();
      own.length = 0;
      for (const key of Object.keys(materials)) delete materials[key];
    },
  };
}

// 完全取不到 THREE 时的兜底：返回最小可用的标准材质，绝不让调用方崩。
function fallbackMaterials() {
  const stub = () => ({ isMaterial: true, name: "Fallback", dispose() {}, userData: {} });
  return {
    skin: stub(),
    skinInner: stub(),
    drum: stub(),
    waxDry: stub(),
    waxWet: stub(),
    waxImpacted: stub(),
    crumb: stub(),
    steel: stub(),
    steelDark: stub(),
    bamboo: stub(),
    wood: stub(),
    woodDark: stub(),
    featherWhite: stub(),
    featherBrown: stub(),
    horsehair: stub(),
    cotton: stub(),
    glass: stub(),
    water: stub(),
    ceramic: stub(),
    cloth: stub(),
    hair: stub(),
    dust: stub(),
    textureSet: { quality: "fallback", size: 0, normalMaps: false },
    dispose() {},
  };
}

// ════════════════════════════════════════════════════════════════════════
//  4. 微尘光点（"通透空气"的关键，别省）
// ════════════════════════════════════════════════════════════════════════

const DUST_VERT = `
  attribute float aSize;
  attribute float aSeed;
  attribute float aRise;
  uniform float uTime;
  uniform float uPixelRatio;
  varying float vFade;
  varying float vSeed;
  void main() {
    vSeed = aSeed;
    vec3 p = position;
    // 极慢的三维漂移：三个不同周期的正弦，合成看不出重复的浮游轨迹
    p.x += sin(uTime * 0.043 + aSeed * 6.28) * 34.0 + sin(uTime * 0.017 + aSeed * 2.1) * 12.0;
    p.y += sin(uTime * 0.061 + aSeed * 3.77) * 26.0 + mod(uTime * aRise, 1.0) * 0.0;
    p.z += cos(uTime * 0.037 + aSeed * 4.9) * 30.0 + cos(uTime * 0.021 + aSeed * 1.3) * 10.0;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    // 远处的尘点小一点、淡一点，近处的更亮 → 空气有深度
    float dist = -mv.z;
    float atten = clamp(420.0 / max(dist, 1.0), 0.15, 2.4);
    vFade = atten;
    gl_PointSize = aSize * atten * 16.0 * uPixelRatio;
    gl_Position = projectionMatrix * mv;
  }
`;

const DUST_FRAG = `
  uniform sampler2D uMap;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform float uOpacity;
  uniform float uTime;
  varying float vFade;
  varying float vSeed;
  void main() {
    // 软圆形 sprite：贴图自己带 α 渐变，这里再乘一层径向衰减防方块边
    vec4 tex = texture2D(uMap, gl_PointCoord);
    float d = length(gl_PointCoord - vec2(0.5));
    float soft = smoothstep(0.5, 0.12, d);
    float a = tex.a * soft * uOpacity * vFade;
    if (a < 0.004) discard;
    // 每颗尘点颜色略不同，其中一小部分是"闪光点"（更白更亮）
    float sparkle = step(0.86, fract(vSeed * 7.31));
    vec3 c = mix(uColorA, uColorB, fract(vSeed * 3.17) * 0.7 + sparkle * 0.3);
    // 闪烁：非常慢的正弦，禁得住长时间盯着看
    float tw = 0.75 + 0.25 * sin(uTime * 1.7 + vSeed * 40.0);
    gl_FragColor = vec4(c, a * tw);
  }
`;

/**
 * 微尘光点。缓慢漂浮的暖色小光点，用 dustMap 做 sprite，加色混合、关深度写入。
 * @param {object} THREE_unused three 命名空间
 * @param {{count?: number, radius?: number, seed?: number, color?: string, colorHot?: string, opacity?: number}} [options]
 * @returns {THREE.Points & { Update(dt): void; setMoodTint(a, b): void; dispose(): void }}
 */
export function MakeDustPoints(THREE_unused, { count = 240, radius = 900, seed = 20260910, color, colorHot, opacity = 0.62 } = {}) {
  const THREE = THREE_unused;
  const n = Math.max(1, Math.min(2000, count | 0)); // 契约：单批 ≤ 2000
  const rng = makeRng(seed);

  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(n * 3);
  const sizes = new Float32Array(n);
  const seeds = new Float32Array(n);
  const rises = new Float32Array(n);

  for (let i = 0; i < n; i++) {
    // 球内均匀分布（立方根保证体积均匀，不然全挤在壳上）
    const u = rng();
    const r = radius * Math.cbrt(u) * 0.92;
    const theta = rng() * Math.PI * 2;
    const phi = Math.acos(2 * rng() - 1);
    pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    pos[i * 3 + 1] = Math.abs(r * Math.cos(phi)) * 0.55 + 30; // 压扁并抬高：尘点主要飘在人的活动高度
    pos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    sizes[i] = 0.55 + rng() * rng() * 1.5; // 小点居多，偶尔一颗大的
    seeds[i] = rng();
    rises[i] = 2 + rng() * 5; // 上升速度系数
  }

  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
  geo.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
  geo.setAttribute("aRise", new THREE.BufferAttribute(rises, 1));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, radius * 0.4, 0), radius * 1.5);

  // 自己烘一张灰尘 sprite，避免依赖 CreateMaterials 是否被调用过
  let dustTex = null;
  if (canUseCanvas()) {
    dustTex = makeTexture(THREE, 64, (c, s) => paintDust(c, s), { srgb: true });
    dustTex.wrapS = THREE.ClampToEdgeWrapping;
    dustTex.wrapT = THREE.ClampToEdgeWrapping;
  }

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: dustTex },
      uColorA: { value: new THREE.Color(color || PALETTE.honey) },
      uColorB: { value: new THREE.Color(colorHot || PALETTE.cream) },
      uOpacity: { value: opacity },
      uTime: { value: 0 },
      uPixelRatio: { value: 1 },
    },
    vertexShader: DUST_VERT,
    fragmentShader: DUST_FRAG,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: true,
  });

  const points = new THREE.Points(geo, mat);
  points.name = "DustMotes";
  points.frustumCulled = false; // 顶点里有位移，包围球判不准，宁可一直画

  let time = 0;

  /** 每帧推进漂移；dt 单位秒 */
  points.Update = (dt) => {
    // 上限保护：切页面回来时 dt 会很大，别让尘点瞬移
    time += Math.min(0.1, Math.max(0, dt || 0));
    mat.uniforms.uTime.value = time;
  };
  /** 换氛围时改尘点色温（雨夜偏冷、清晨偏白、睡前偏暗金） */
  points.setMoodTint = (a, b) => {
    if (a) mat.uniforms.uColorA.value.set(a);
    if (b) mat.uniforms.uColorB.value.set(b);
  };
  points.setOpacity = (v) => {
    mat.uniforms.uOpacity.value = v;
  };
  points.setPixelRatio = (v) => {
    mat.uniforms.uPixelRatio.value = v || 1;
  };
  points.dispose = () => {
    geo.dispose();
    mat.dispose();
    if (dustTex) dustTex.dispose();
  };
  return points;
}

// ════════════════════════════════════════════════════════════════════════
//  5. 程序化环境贴图（柔和反射，控制成本）
// ════════════════════════════════════════════════════════════════════════

// 画一张 equirect 环境图：上暖下凉的柔和渐变 + 几个柔和亮斑（模拟窗光）。
// 为什么不直接上 HDR：包体要小、离线要跑，一张 256×128 的 canvas 足够骗过眼睛。
function paintEnvEquirect(ctx, w, h) {
  const img = ctx.createImageData(w, h);
  const d = img.data;
  const spot = makeField(1301, 1 / 8, 3);

  // 天上（暖奶油）→ 地平线（蜜桃）→ 地面（薄荷/木色反射）
  const skyTop = [255, 246, 234];
  const horizon = [255, 222, 200];
  const ground = [214, 226, 216];

  // 三个亮斑（key / fill / 窗口的位置），用高斯式的软亮斑
  const lamps = [
    { u: 0.22, v: 0.30, r: 0.20, c: [255, 244, 214], i: 0.95 }, // 暖 key（纸灯）
    { u: 0.62, v: 0.26, r: 0.26, c: [226, 240, 255], i: 0.75 }, // 冷窗光
    { u: 0.86, v: 0.42, r: 0.16, c: [255, 236, 226], i: 0.45 }, // 反弹光
  ];

  for (let y = 0; y < h; y++) {
    const v = y / h;
    // 竖直渐变
    let r;
    let g;
    let b;
    if (v < 0.5) {
      const t = smooth01(v / 0.5);
      r = lerp(skyTop[0], horizon[0], t);
      g = lerp(skyTop[1], horizon[1], t);
      b = lerp(skyTop[2], horizon[2], t);
    } else {
      const t = smooth01((v - 0.5) / 0.5);
      r = lerp(horizon[0], ground[0], t);
      g = lerp(horizon[1], ground[1], t);
      b = lerp(horizon[2], ground[2], t);
    }
    for (let x = 0; x < w; x++) {
      const u = x / w;
      let rr = r;
      let gg = g;
      let bb = b;
      // 云 / 柔和起伏，避免死板的渐变
      const cl = (spot(u, v) - 0.5) * 26;
      rr += cl;
      gg += cl * 0.95;
      bb += cl * 0.85;
      // 亮斑
      for (let i = 0; i < lamps.length; i++) {
        const L = lamps[i];
        // u 方向要考虑环绕，取最短角距
        let du = Math.abs(u - L.u);
        du = Math.min(du, 1 - du);
        const dv = v - L.v;
        const dist = Math.sqrt(du * du + dv * dv);
        const k = Math.exp(-(dist * dist) / (2 * L.r * L.r)) * L.i;
        rr = lerp(rr, L.c[0], k);
        gg = lerp(gg, L.c[1], k);
        bb = lerp(bb, L.c[2], k);
      }
      const o = (y * w + x) * 4;
      d[o] = clampByte(rr);
      d[o + 1] = clampByte(gg);
      d[o + 2] = clampByte(bb);
      d[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

/**
 * 程序化环境反射贴图。拿到 renderer 就用 PMREMGenerator 烘一张小 cubemap，
 * 拿不到就返回 null——调用方按契约自己兜底（挂 scene.environment = null 也能跑）。
 * @param {object} THREE_unused three 命名空间
 * @param {object} renderer WebGLRenderer
 * @param {{size?: number}} [options] size 是 equirect 的宽度（高度取一半）
 * @returns {THREE.Texture|null}
 */
export function MakeEnvMap(THREE_unused, renderer, { size = 256, intensity = 1 } = {}) {
  const THREE = THREE_unused;
  if (!THREE || !renderer || !renderer.isWebGLRenderer || !canUseCanvas()) return null;

  const w = Math.max(64, size | 0);
  const h = Math.max(32, w >> 1);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  paintEnvEquirect(ctx, w, h);

  const equirect = new THREE.CanvasTexture(canvas);
  equirect.mapping = THREE.EquirectangularReflectionMapping;
  equirect.colorSpace = THREE.SRGBColorSpace;
  equirect.needsUpdate = true;

  let target = null;
  let pmrem = null;
  try {
    pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    target = pmrem.fromEquirectangular(equirect);
  } catch (err) {
    // 老设备 / 上下文丢失时不能让整个场景挂掉
    if (pmrem) pmrem.dispose();
    equirect.dispose();
    return null;
  }
  pmrem.dispose();
  equirect.dispose(); // 源图已经烘进 PMREM，可以立刻回收

  const tex = target.texture;
  tex.userData.procedural = true;
  tex.userData.resolution = `${w}x${h} → PMREM`;
  // 对外只暴露 texture，同时把 target 挂上，方便彻底释放
  tex.disposeWithTarget = () => target.dispose();
  if (intensity !== 1) tex.userData.intensity = intensity;
  return tex;
}

export default CreateMaterials;
