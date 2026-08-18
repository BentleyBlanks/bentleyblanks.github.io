// 《血战台儿庄》程序化 PBR 贴图烘焙 —— 纯 JS，**不许 import three**。
// 输出裸字节（Uint8Array），由 Script_Materials.mjs 包成 DataTexture。
// 这样 Node 里能直接跑烘焙做断言（不需要 canvas，也不需要 GL）。
//
// 每种材质出三张图：
//   albedo : RGB = 基色（存 sRGB 字节，由 three 的 colorSpace 负责转线性）
//   normal : RGB = 切线空间法线（从 height 场差分求得），A = 高度（视差备用）
//   orm    : R = AO, G = roughness, B = metalness  —— 打包成一张，少两个采样器
//
// 「3A 观感」的第一性原理：**没有法线与粗糙度变化的表面，无论打多少光都是塑料**。
// 所以每一种材质都必须真的有 height 场，不许只调颜色。

import {
  TileableFbm2, TileableValue2, Worley2, Ridged2,
  Clamp01, Clamp, Mix, SmoothStep, Mulberry32, HashString,
} from "./Script_Noise.mjs";

/** #rrggbb -> [r,g,b] 0-255 */
export function HexRgb(hex) {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * 通用烘焙器。
 * @param {number} size 边长（2 的幂，mipmap 才干净）
 * @param {(x:number,y:number,out:object)=>void} shade 逐像素着色：
 *        写 out.r/g/b (0-255)、out.h (0-1)、out.rough、out.ao、out.metal
 */
export function BakeMaps(size, shade, { normalStrength = 2.0 } = {}) {
  const n = size * size;
  const albedo = new Uint8Array(n * 4);
  const orm = new Uint8Array(n * 4);
  const height = new Float32Array(n);
  const out = { r: 128, g: 128, b: 128, h: 0.5, rough: 0.8, ao: 1, metal: 0 };
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      out.r = 128; out.g = 128; out.b = 128;
      out.h = 0.5; out.rough = 0.8; out.ao = 1; out.metal = 0;
      shade(x, y, out);
      const i = (y * size + x) * 4;
      albedo[i] = Clamp(out.r, 0, 255) | 0;
      albedo[i + 1] = Clamp(out.g, 0, 255) | 0;
      albedo[i + 2] = Clamp(out.b, 0, 255) | 0;
      albedo[i + 3] = 255;
      orm[i] = (Clamp01(out.ao) * 255) | 0;
      orm[i + 1] = (Clamp01(out.rough) * 255) | 0;
      orm[i + 2] = (Clamp01(out.metal) * 255) | 0;
      orm[i + 3] = 255;
      height[y * size + x] = out.h;
    }
  }
  const normal = HeightToNormal(height, size, normalStrength);
  return { size, albedo, normal, orm, height };
}

/**
 * 高度场 -> 切线空间法线贴图（Sobel 差分，环绕取样保证无缝）。
 * A 通道存回高度，给视差遮蔽留口子。
 */
export function HeightToNormal(height, size, strength = 2.0) {
  const data = new Uint8Array(size * size * 4);
  const at = (x, y) => height[(((y % size) + size) % size) * size + (((x % size) + size) % size)];
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      // Sobel 比中心差分抗噪，法线不会一格一格地跳
      const tl = at(x - 1, y - 1), t = at(x, y - 1), tr = at(x + 1, y - 1);
      const l = at(x - 1, y), r = at(x + 1, y);
      const bl = at(x - 1, y + 1), b = at(x, y + 1), br = at(x + 1, y + 1);
      const dx = (tr + 2 * r + br) - (tl + 2 * l + bl);
      const dy = (bl + 2 * b + br) - (tl + 2 * t + tr);
      let nx = -dx * strength, ny = -dy * strength, nz = 1;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len; ny /= len; nz /= len;
      const i = (y * size + x) * 4;
      data[i] = ((nx * 0.5 + 0.5) * 255) | 0;
      data[i + 1] = ((ny * 0.5 + 0.5) * 255) | 0;
      data[i + 2] = ((nz * 0.5 + 0.5) * 255) | 0;
      data[i + 3] = (Clamp01(height[y * size + x]) * 255) | 0;
    }
  }
  return data;
}

// ---------------------------------------------------------------------------
// 材质配方
//
// 色值按鲁南 1938 的实地风貌：青砖是灰蓝而不是红（华北旧砖还原焰烧成，出窑青灰）；
// 夯土墙黄褐；瓦深灰；西北军军装灰蓝土布。红砖只在个别新式商号上。
// ---------------------------------------------------------------------------

/** 青砖墙：错缝砌法 + 灰缝凹陷 + 剥落。台儿庄的墙就是这个。 */
export function BakeBrickWall(size = 512, { seed = 1, rowsPerTile = 12, damage = 0.35, sootiness = 0.2 } = {}) {
  const rows = rowsPerTile;
  const cols = rows / 2;                 // 砖长约砖高 4 倍；贴图 1:1 时列数取一半
  const mortar = 0.055;
  return BakeMaps(size, (px, py, out) => {
    const u = px / size, v = py / size;
    const rowF = v * rows;
    const row = Math.floor(rowF);
    const inRow = rowF - row;
    const offset = (row % 2) * 0.5;      // 上下皮错半砖
    const colF = u * cols + offset;
    const col = Math.floor(colF);
    const inCol = colF - col;
    const jitter = Mulberry32(((row * 977 + col * 131) >>> 0) + seed * 7919)();

    // 灰缝：横缝比竖缝深（坐浆厚、立缝薄）
    const dh = Math.min(inRow, 1 - inRow);
    const dv = Math.min(inCol, 1 - inCol);
    const joint = Math.min(SmoothStep(0, mortar, dh), SmoothStep(0, mortar * 0.75, dv));

    const grain = TileableFbm2(u * 42, v * 42, 42, { octaves: 4, seed: seed + 11 });
    const coarse = TileableFbm2(u * 7, v * 7, 7, { octaves: 3, seed: seed + 23 });

    // 剥落：Worley 斑块把砖角啃掉
    const w = Worley2(u * 9, v * 9, seed + 313, 9);
    const chip = SmoothStep(0.18, 0.02, w.f1) * damage * (0.4 + jitter * 0.6);

    const h = Clamp01(joint * 0.72 + 0.14 + grain * 0.1 + coarse * 0.06 - chip * 0.55);

    // 窑变：青砖出窑深浅不一，一面墙全同色一眼假
    const tone = 0.82 + jitter * 0.36;
    const brick = [138 * tone, 140 * tone, 137 * tone];
    const brickWarm = [152 * tone, 143 * tone, 126 * tone];
    const mixWarm = jitter > 0.72 ? 0.7 : 0.12;
    const base = [0, 0, 0];
    for (let c = 0; c < 3; c += 1) base[c] = Mix(brick[c], brickWarm[c], mixWarm);
    const mortarCol = [166, 162, 152];
    for (let c = 0; c < 3; c += 1) base[c] = Mix(mortarCol[c], base[c], joint);
    const fresh = [138, 126, 106];
    for (let c = 0; c < 3; c += 1) base[c] = Mix(base[c], fresh[c], SmoothStep(0.02, 0.5, chip));
    // 烟熏：墙根与随机竖条发黑（台儿庄的房子烧过）
    const soot = Clamp01(TileableFbm2(u * 3.1, v * 2.2, 3, { octaves: 4, seed: seed + 57 }) * 1.6 - 0.55) * sootiness;
    for (let c = 0; c < 3; c += 1) base[c] = Mix(base[c], 26, soot);

    const lum = (grain - 0.5) * 18;
    out.r = base[0] + lum; out.g = base[1] + lum; out.b = base[2] + lum;
    out.h = h;
    out.rough = Clamp01(0.86 - joint * 0.05 + grain * 0.12 - soot * 0.08);
    out.ao = Clamp01(0.42 + joint * 0.58 - chip * 0.3);
    out.metal = 0;
  }, { normalStrength: 3.2 });
}

/** 夯土 / 土坯墙：抹面剥落露出草筋土坯。鲁南乡下院墙的主力。 */
export function BakeAdobe(size = 512, { seed = 2, wear = 0.55 } = {}) {
  return BakeMaps(size, (px, py, out) => {
    const u = px / size, v = py / size;
    const coarse = TileableFbm2(u * 5, v * 5, 5, { octaves: 5, seed: seed + 3 });
    const fine = TileableFbm2(u * 40, v * 40, 40, { octaves: 4, seed: seed + 9 });
    const w = Worley2(u * 4.2, v * 4.2, seed + 71, 4);
    const patch = SmoothStep(0.42, 0.16, w.f2 - w.f1);
    const peel = Clamp01(patch * wear + coarse * 0.35 - 0.18);
    // 土坯里的麦秸草筋：细长高频条纹
    const straw = Math.abs(TileableFbm2(u * 90, v * 14, 90, { octaves: 2, seed: seed + 41 }) - 0.5) * 2;
    const strawMask = SmoothStep(0.86, 1.0, 1 - straw) * peel;
    // 雨水冲刷的竖沟
    const rillMask = SmoothStep(0.72, 1.0, Ridged2(u * 26, v * 2.4, { octaves: 3, seed: seed + 17 })) * 0.5;

    const h = Clamp01(0.62 + coarse * 0.2 + fine * 0.08 - peel * 0.3 - rillMask * 0.12 + strawMask * 0.05);
    const dry = [154, 132, 96];        // 麦秸泥抹面
    const core = [132, 108, 76];       // 里头的土坯
    const col = [0, 0, 0];
    for (let c = 0; c < 3; c += 1) col[c] = Mix(dry[c], core[c], Clamp01(peel * 1.4));
    const strawCol = [176, 158, 118];
    for (let c = 0; c < 3; c += 1) col[c] = Mix(col[c], strawCol[c], strawMask * 0.6);
    const shade = (coarse - 0.5) * 26 + (fine - 0.5) * 10;
    out.r = col[0] + shade; out.g = col[1] + shade; out.b = col[2] + shade;
    out.h = h;
    out.rough = Clamp01(0.93 + fine * 0.06 - peel * 0.04);
    out.ao = Clamp01(0.55 + (1 - peel) * 0.4 - rillMask * 0.2);
    out.metal = 0;
  }, { normalStrength: 2.6 });
}

/** 灰瓦屋面：仰合瓦一垄一垄，缝里长草。 */
export function BakeRoofTile(size = 512, { seed = 3, ridges = 9 } = {}) {
  return BakeMaps(size, (px, py, out) => {
    const u = px / size, v = py / size;
    const t = u * ridges;
    const col = Math.floor(t);
    const inCol = t - col;
    const capped = Math.pow(Clamp01(Math.sin(inCol * Math.PI)), 0.65);  // 半圆筒瓦剖面
    const lap = v * ridges * 1.35;                                      // 沿坡一片压一片
    const lapRow = Math.floor(lap);
    const step = SmoothStep(0.0, 0.1, lap - lapRow) * 0.14;
    const jitter = Mulberry32(HashString(`${col}:${lapRow}:${seed}`))();
    const grain = TileableFbm2(u * 60, v * 60, 60, { octaves: 3, seed: seed + 5 });
    const moss = Clamp01(TileableFbm2(u * 12, v * 12, 12, { octaves: 4, seed: seed + 29 }) * 1.7 - 0.72) * (1 - capped);

    const tone = 0.86 + jitter * 0.28;
    const base = [92 * tone, 94 * tone, 92 * tone];
    const mossCol = [78, 92, 58];
    for (let c = 0; c < 3; c += 1) base[c] = Mix(base[c], mossCol[c], moss * 0.8);
    const sh = (grain - 0.5) * 16 - (1 - capped) * 12;
    out.r = base[0] + sh; out.g = base[1] + sh; out.b = base[2] + sh;
    out.h = Clamp01(0.3 + capped * 0.5 + step + grain * 0.08 + jitter * 0.03);
    out.rough = Clamp01(0.78 + grain * 0.14 + moss * 0.1);
    out.ao = Clamp01(0.35 + capped * 0.6 - moss * 0.15);
    out.metal = 0;
  }, { normalStrength: 2.2 });
}

/** 旧木：门板、房梁、枪托。顺纹 + 年轮 + 开裂。 */
export function BakeWood(size = 512, { seed = 4, hue = [110, 84, 54], planks = 5, weathered = 0.5 } = {}) {
  return BakeMaps(size, (px, py, out) => {
    const u = px / size, v = py / size;
    const p = v * planks;
    const plank = Math.floor(p);
    const inPlank = p - plank;
    const jitter = Mulberry32(HashString(`p${plank}:${seed}`))();
    const seam = SmoothStep(0, 0.035, Math.min(inPlank, 1 - inPlank));
    // 年轮：沿板长拉伸的同心带
    const warp = TileableFbm2(u * 3 + jitter * 10, v * 9, 3, { octaves: 3, seed: seed + 13 });
    const grain = Math.pow(Math.abs(Math.sin((v * 34 + warp * 6 + jitter * 20) * Math.PI)), 2.2);
    const fibre = TileableFbm2(u * 120, v * 26, 120, { octaves: 2, seed: seed + 31 });
    const crack = SmoothStep(0.9, 1.0, Ridged2(u * 8, v * 46, { octaves: 3, seed: seed + 61 })) * weathered;

    const dark = [hue[0] * 0.62, hue[1] * 0.6, hue[2] * 0.58];
    const col = [0, 0, 0];
    for (let c = 0; c < 3; c += 1) col[c] = Mix(hue[c] * (0.86 + jitter * 0.28), dark[c], grain * 0.7 + fibre * 0.2);
    for (let c = 0; c < 3; c += 1) col[c] = Mix(col[c], col[c] * 0.45, crack);
    for (let c = 0; c < 3; c += 1) col[c] = Mix(col[c] * 0.4, col[c], seam);
    // 风吹日晒发灰
    const grey = (col[0] + col[1] + col[2]) / 3;
    for (let c = 0; c < 3; c += 1) col[c] = Mix(col[c], grey * 1.08, weathered * 0.4);
    out.r = col[0]; out.g = col[1]; out.b = col[2];
    out.h = Clamp01(0.62 + seam * 0.2 - grain * 0.1 + fibre * 0.08 - crack * 0.4);
    out.rough = Clamp01(0.7 + grain * 0.2 + weathered * 0.12);
    out.ao = Clamp01(0.45 + seam * 0.5 - crack * 0.3);
    out.metal = 0;
  }, { normalStrength: 2.0 });
}

/** 土布军装：粗平纹 + 汗渍 + 浮土。西北军灰蓝布 / 日军土黄。 */
export function BakeCloth(size = 256, { seed = 5, hue = [104, 110, 116], threads = 28, grime = 0.4 } = {}) {
  return BakeMaps(size, (px, py, out) => {
    const u = px / size, v = py / size;
    const wu = Math.sin(u * threads * Math.PI * 2);
    const wv = Math.sin(v * threads * Math.PI * 2);
    const weave = (wu * 0.5 + 0.5) * (wv * 0.5 + 0.5);      // 平纹：经纬交替
    const slub = TileableFbm2(u * 30, v * 30, 30, { octaves: 3, seed: seed + 7 });
    const stain = Clamp01(TileableFbm2(u * 4, v * 4, 4, { octaves: 4, seed: seed + 19 }) * 1.6 - 0.5) * grime;
    const dust = TileableFbm2(u * 11, v * 11, 11, { octaves: 3, seed: seed + 37 });
    const col = [0, 0, 0];
    for (let c = 0; c < 3; c += 1) {
      col[c] = hue[c] * (0.9 + slub * 0.22);
      col[c] = Mix(col[c], col[c] * 0.68, stain);                                       // 汗碱与泥
      col[c] = Mix(col[c], Mix(col[c], 150, 0.35), Clamp01(dust * 1.4 - 0.55) * 0.6);   // 蒙的一层土
      col[c] *= 0.86 + weave * 0.2;
    }
    out.r = col[0]; out.g = col[1]; out.b = col[2];
    out.h = Clamp01(0.5 + (weave - 0.5) * 0.5 + slub * 0.2);
    out.rough = Clamp01(0.94 - weave * 0.06 + stain * 0.04);
    out.ao = Clamp01(0.6 + weave * 0.36 - stain * 0.1);
    out.metal = 0;
  }, { normalStrength: 0.9 });
}

/** 烤蓝钢 / 铸铁：枪管、钢盔、机件。金属度与粗糙度不均 + 锈斑。 */
export function BakeSteel(size = 256, { seed = 6, base = [58, 60, 64], rust = 0.25, polish = 0.35 } = {}) {
  return BakeMaps(size, (px, py, out) => {
    const u = px / size, v = py / size;
    const micro = TileableFbm2(u * 150, v * 150, 150, { octaves: 2, seed: seed + 3 });
    const brush = TileableFbm2(u * 220, v * 6, 220, { octaves: 2, seed: seed + 11 });   // 顺枪管的拉丝
    const dent = TileableFbm2(u * 12, v * 12, 12, { octaves: 4, seed: seed + 23 });
    const w = Worley2(u * 14, v * 14, seed + 91, 14);
    const rustPatch = Clamp01(SmoothStep(0.34, 0.06, w.f1) * (dent * 1.4) * rust * 2.2);
    const rustCol = [116, 62, 34];
    const col = [0, 0, 0];
    for (let c = 0; c < 3; c += 1) {
      col[c] = base[c] * (0.82 + micro * 0.3 + (brush - 0.5) * 0.16);
      col[c] = Mix(col[c], rustCol[c], rustPatch);
    }
    out.r = col[0]; out.g = col[1]; out.b = col[2];
    out.h = Clamp01(0.62 + (dent - 0.5) * 0.24 + (brush - 0.5) * 0.05 + rustPatch * 0.1);
    out.rough = Clamp01(0.52 - polish * 0.3 + micro * 0.18 + rustPatch * 0.5 + (dent - 0.5) * 0.1);
    out.ao = Clamp01(0.72 + (1 - rustPatch) * 0.28);
    out.metal = Clamp01(1 - rustPatch * 0.85);
  }, { normalStrength: 1.2 });
}

/** 土路 / 瓦砾地：夯土 + 碎砖 + 浮土。 */
export function BakeRubbleGround(size = 512, { seed = 7, brickiness = 0.5, wet = 0 } = {}) {
  return BakeMaps(size, (px, py, out) => {
    const u = px / size, v = py / size;
    const soil = TileableFbm2(u * 6, v * 6, 6, { octaves: 5, seed: seed + 2 });
    const fine = TileableFbm2(u * 55, v * 55, 55, { octaves: 3, seed: seed + 13 });
    // 碎砖块：Worley 单元当碎片，随机挑一部分算砖
    const w = Worley2(u * 22, v * 22, seed + 47, 22);
    const isBrick = Mulberry32(HashString(`${Math.floor(u * 22)}:${Math.floor(v * 22)}:${seed}`))();
    const shard = SmoothStep(0.34, 0.08, w.f1) * (isBrick < brickiness ? 1 : 0);
    const pebble = SmoothStep(0.3, 0.1, Worley2(u * 60, v * 60, seed + 83, 60).f1) * 0.5;
    const h = Clamp01(0.5 + soil * 0.24 + fine * 0.1 + shard * 0.22 + pebble * 0.08);
    const dirt = [132, 118, 96];
    const brick = [130, 116, 104];
    const col = [0, 0, 0];
    for (let c = 0; c < 3; c += 1) {
      col[c] = dirt[c] * (0.82 + soil * 0.34);
      col[c] = Mix(col[c], brick[c] * (0.9 + isBrick * 0.3), shard);
      col[c] = Mix(col[c], col[c] * 0.55, wet * Clamp01(1 - h) * 1.2);
    }
    const sh = (fine - 0.5) * 16;
    out.r = col[0] + sh; out.g = col[1] + sh; out.b = col[2] + sh;
    out.h = h;
    out.rough = Clamp01(0.95 - wet * 0.6 * Clamp01(1 - h) - shard * 0.08);
    out.ao = Clamp01(0.5 + h * 0.5 - shard * 0.05);
    out.metal = 0;
  }, { normalStrength: 2.8 });
}

/** 麻袋 / 沙包：粗麻布纹 + 鼓胀。 */
export function BakeSandbag(size = 256, { seed = 8 } = {}) {
  return BakeMaps(size, (px, py, out) => {
    const u = px / size, v = py / size;
    const wu = Math.sin(u * 20 * Math.PI * 2), wv = Math.sin(v * 20 * Math.PI * 2);
    const weave = (wu * 0.5 + 0.5) * 0.6 + (wv * 0.5 + 0.5) * 0.4;
    const slub = TileableFbm2(u * 22, v * 22, 22, { octaves: 3, seed: seed + 5 });
    const stain = Clamp01(TileableFbm2(u * 3.5, v * 3.5, 3, { octaves: 4, seed: seed + 27 }) * 1.5 - 0.45);
    const hue = [146, 128, 92];
    const col = [0, 0, 0];
    for (let c = 0; c < 3; c += 1) {
      col[c] = hue[c] * (0.86 + slub * 0.26) * (0.9 + weave * 0.16);
      col[c] = Mix(col[c], col[c] * 0.62, stain * 0.7);
    }
    out.r = col[0]; out.g = col[1]; out.b = col[2];
    out.h = Clamp01(0.5 + (weave - 0.5) * 0.55 + slub * 0.2);
    out.rough = Clamp01(0.95 + slub * 0.05);
    out.ao = Clamp01(0.55 + weave * 0.4 - stain * 0.12);
    out.metal = 0;
  }, { normalStrength: 1.1 });
}

/** 石活：城门墩、井台、碾盘。 */
export function BakeStone(size = 512, { seed = 9 } = {}) {
  return BakeMaps(size, (px, py, out) => {
    const u = px / size, v = py / size;
    const w = Worley2(u * 5, v * 5, seed + 3, 5);
    const seam = SmoothStep(0.0, 0.06, w.f2 - w.f1);
    const grain = TileableFbm2(u * 48, v * 48, 48, { octaves: 4, seed: seed + 17 });
    const pit = SmoothStep(0.22, 0.05, Worley2(u * 34, v * 34, seed + 53, 34).f1) * 0.35;
    const tone = 0.85 + TileableValue2(u * 5, v * 5, 5, seed + 3) * 0.3;
    const base = [118 * tone, 116 * tone, 110 * tone];
    const sh = (grain - 0.5) * 22;
    out.r = base[0] + sh; out.g = base[1] + sh; out.b = base[2] + sh;
    out.h = Clamp01(0.35 + seam * 0.5 + grain * 0.12 - pit * 0.3);
    out.rough = Clamp01(0.82 + grain * 0.14);
    out.ao = Clamp01(0.4 + seam * 0.55 - pit * 0.2);
    out.metal = 0;
  }, { normalStrength: 2.4 });
}

/** 单色占位，避免到处 new 材质。 */
export function BakeFlat(size = 4, { color = [128, 128, 128], rough = 0.9, metal = 0 } = {}) {
  return BakeMaps(size, (px, py, out) => {
    out.r = color[0]; out.g = color[1]; out.b = color[2];
    out.h = 0.5; out.rough = rough; out.ao = 1; out.metal = metal;
  }, { normalStrength: 0.01 });
}

/** 全部配方登记在此，Materials 层按名字取；测试也按这张表逐个烘一遍。 */
export const RECIPES = {
  BrickWall: (s) => BakeBrickWall(s ?? 512, { seed: 101 }),
  BrickWallSooty: (s) => BakeBrickWall(s ?? 512, { seed: 137, damage: 0.6, sootiness: 0.6 }),
  Adobe: (s) => BakeAdobe(s ?? 512, { seed: 211 }),
  RoofTile: (s) => BakeRoofTile(s ?? 512, { seed: 307 }),
  WoodDoor: (s) => BakeWood(s ?? 512, { seed: 401, planks: 4 }),
  WoodBeam: (s) => BakeWood(s ?? 256, { seed: 419, planks: 1, weathered: 0.7 }),
  WoodStock: (s) => BakeWood(s ?? 256, { seed: 433, hue: [98, 66, 40], planks: 1, weathered: 0.15 }),
  ClothNra: (s) => BakeCloth(s ?? 256, { seed: 503, hue: [106, 112, 118] }),
  ClothIja: (s) => BakeCloth(s ?? 256, { seed: 521, hue: [124, 116, 82] }),
  Steel: (s) => BakeSteel(s ?? 256, { seed: 601 }),
  SteelHelmet: (s) => BakeSteel(s ?? 256, { seed: 617, base: [64, 66, 60], polish: 0.2, rust: 0.35 }),
  Ground: (s) => BakeRubbleGround(s ?? 512, { seed: 701 }),
  GroundRubble: (s) => BakeRubbleGround(s ?? 512, { seed: 719, brickiness: 0.85 }),
  Sandbag: (s) => BakeSandbag(s ?? 256, { seed: 809 }),
  Stone: (s) => BakeStone(s ?? 512, { seed: 907 }),
};
