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
    // 逐砖随机数必须用**大素数异或**混，别用 row*977 + col*131 这种线性组合：
    // Mulberry32 对线性相关的种子只做一轮乘加，出来的首值仍带线性结构 ——
    // 砖多了一倍以后，那点结构在墙上聚成两三块砖宽的米黄色斑，整面墙读作迷彩。
    const jitter = Mulberry32((((row * 92837111) ^ (col * 689287499) ^ (seed * 283923481)) >>> 0))();

    // 灰缝：横缝比竖缝深（坐浆厚、立缝薄）
    const dh = Math.min(inRow, 1 - inRow);
    const dv = Math.min(inCol, 1 - inCol);
    const joint = Math.min(SmoothStep(0, mortar, dh), SmoothStep(0, mortar * 0.75, dv));

    const grain = TileableFbm2(u * 42, v * 42, 42, { octaves: 4, seed: seed + 11 });
    // 平铺可见性的第一性原理：**一张要无限平铺的图，不许含有低于约 1/4 格波长的能量**。
    // 低频斑块在一格里只出现两三团，铺到十米长的墙上就是同一组斑点重复十次，
    // 眼睛一眼锁定（评分表 B3）。所以这里所有"大团"噪声的频率都往上推，
    // 让每一格里出现十几团 —— 团还在、可读的图案没了。coarse 7 → 13。
    const coarse = TileableFbm2(u * 13, v * 13, 13, { octaves: 3, seed: seed + 23 });

    // 剥落：Worley 斑块把砖角啃掉。
    //
    // 事故：原来是 Worley2(u*9, v*9, …, 9)，而砖格是 cols×rows。9×9 个斑点铺在
    // 6×12 块砖上，比例接近 1:1 —— 出图上每一块砖的**同一个相对位置**都长着一颗
    // 深色圆斑，整面墙读成冲压出来的花纹板。这是截图里最一眼假的一处。
    // 两条都要改：① 频率取 7 —— 与砖格的 10 列 / 20 行互质，斑点不再和砖一一对应
    //   （u 与 v 必须同频：Worley2 的 period 只有一个，给不同频率就会在
    //    v = period/freq 处裂一条硬缝，比原来的毛病还大）；
    // ② 剥落是偶发事件，不是每块砖的固有属性 —— 用 jitter 做门限，只约三成砖被啃。
    // ③ 门限要用**另一个**哈希：jitter 已经在下面决定"这块砖是不是偏暖色"
    //   （mixWarm 的 0.72 门限），再拿同一个数当剥落门限，暖色砖与剥落砖就是同一批 ——
    //   两笔叠在一起把三成砖刷成同一种米黄，整面墙读作迷彩瓷砖（实测比原来的
    //   点阵还难看，这一步是回调出来的，不是推出来的）。
    // 11 与砖格的 10 列 / 20 行仍然互质，斑点不会和砖一一对应；
    // 比 7 更细，一格里的剥落团从七八处变成十几处，平铺的可读性再降一档
    const w = Worley2(u * 11, v * 11, seed + 313, 11);
    const chipRnd = Mulberry32(((row * 613 + col * 1097) >>> 0) + seed * 131)();
    const chipGate = SmoothStep(0.66, 0.88, chipRnd);
    const chip = SmoothStep(0.15, 0.02, w.f1) * damage * chipGate;

    const h = Clamp01(joint * 0.72 + 0.14 + grain * 0.1 + coarse * 0.06 - chip * 0.55);

    // 窑变：青砖出窑深浅不一，一面墙全同色一眼假
    // 窑变的**幅度**要跟着砖的密度收：一格贴图从 12×6 块砖变成 20×10 块之后，
    // 同样 ±18% 的明暗跳变在屏幕上的空间频率高了近三倍，读出来不是"青砖深浅不一"，
    // 是一面灰米两色的马赛克。0.36 → 0.24、暖色混合 0.7 → 0.5。
    const tone = 0.88 + jitter * 0.24;
    const brick = [138 * tone, 140 * tone, 137 * tone];
    const brickWarm = [152 * tone, 143 * tone, 126 * tone];
    const mixWarm = jitter > 0.72 ? 0.5 : 0.12;
    const base = [0, 0, 0];
    for (let c = 0; c < 3; c += 1) base[c] = Mix(brick[c], brickWarm[c], mixWarm);
    const mortarCol = [166, 162, 152];
    for (let c = 0; c < 3; c += 1) base[c] = Mix(mortarCol[c], base[c], joint);
    const fresh = [138, 126, 106];
    for (let c = 0; c < 3; c += 1) base[c] = Mix(base[c], fresh[c], SmoothStep(0.06, 0.60, chip));
    // 烟熏：墙根与随机竖条发黑（台儿庄的房子烧过）。
    //
    // 这一项是全砖墙里**唯一进 albedo 的低频项**，也就是出图上"每 1.2 m 重复一次
    // 的深色斑"的正主 —— 原来 3.1×2.2 的频率，一格里只有三团，铺满一面十米长的墙
    // 就是三团重复八次，眼睛一眼锁定（评分表 B3）。
    // 提到 13×8.6（竖向压扁一点，像顺着墙流下来的烟痕）之后还差一步：
    // 贴脸看（正片 P2 就是贴着墙拍的）仍是一块块**硬边黑斑**，读作豹纹／霉斑。
    // 所以再收两处：用 grain 调制让烟痕边缘碎掉、跟着砖面高频走；
    // 混合目标从近黑的 26 抬到 52 并把总量封在 0.72 —— 烧黑的砖是深灰，不是黑洞。
    const sootBase = Clamp01(TileableFbm2(u * 13, v * 8.6, 13, { octaves: 3, seed: seed + 57 }) * 1.55 - 0.56);
    const soot = Clamp01(sootBase * (0.55 + grain * 0.9)) * sootiness * 0.72;
    for (let c = 0; c < 3; c += 1) base[c] = Mix(base[c], 52, soot);

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
    // 同砖墙与地面：一格 1.6 m 的夯土，coarse 5 / Worley 4.2 各只有四五团，
    // 铺到一段十几米的院墙上就是一排复制的剥落斑。频率各推两倍多，
    // 再把 coarse 进 albedo 的幅度从 ±13 收到 ±8（起伏留给 height）。
    const coarse = TileableFbm2(u * 11, v * 11, 11, { octaves: 5, seed: seed + 3 });
    const fine = TileableFbm2(u * 40, v * 40, 40, { octaves: 4, seed: seed + 9 });
    const w = Worley2(u * 9.4, v * 9.4, seed + 71, 9);
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
    const shade = (coarse - 0.5) * 16 + (fine - 0.5) * 10;
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

/**
 * 去皮枝条：给枣刺篱笆和独立木栅栏的每根杆子用。
 *
 * 这是「材质」，不是一张把整面篱笆（枝条、绑绳、空隙）画死在里面的照片；
 * 篱笆的结构应由 `Script_WallSpline` 的几何给出。这样无论 UV 岛怎样拆、杆件怎样
 * 转向，都不会再出现生成图里那种四块互不相干的绑枝或一段一段的假接缝。
 */
export function BakeFenceWood(size = 256, { seed = 467, hue = [111, 96, 70] } = {}) {
  return BakeMaps(size, (px, py, out) => {
    const u = px / size, v = py / size;
    // 主纹只读作「顺着枝条的皮纹」；每格至少数十道，平铺时不会重复成可辨的大图案。
    const longGrain = TileableFbm2(u * 9, v * 72, 9, {
      octaves: 3, seed: seed + 11, periodY: 72,
    });
    const fibre = Ridged2(u * 13, v * 126, {
      octaves: 2, seed: seed + 23, periodY: 126,
    });
    const pores = TileableFbm2(u * 58, v * 58, 58, { octaves: 2, seed: seed + 37 });
    const weather = TileableFbm2(u * 18, v * 18, 18, { octaves: 3, seed: seed + 47 });
    const ridge = Clamp01((fibre - 0.58) * 2.5);
    const shade = (longGrain - 0.5) * 28 + (pores - 0.5) * 12 - ridge * 16;
    const sunBleach = Clamp01((weather - 0.55) * 1.45);
    const base = [hue[0] + shade, hue[1] + shade, hue[2] + shade];
    for (let c = 0; c < 3; c += 1) base[c] = Mix(base[c], 142, sunBleach * 0.18);
    out.r = base[0]; out.g = base[1]; out.b = base[2];
    out.h = Clamp01(0.54 + (longGrain - 0.5) * 0.14 + ridge * 0.18 + (pores - 0.5) * 0.06);
    out.rough = Clamp01(0.88 + pores * 0.09 + sunBleach * 0.04);
    out.ao = Clamp01(0.76 + longGrain * 0.19 - ridge * 0.10);
    out.metal = 0;
  }, { normalStrength: 1.45 });
}

/**
 * 木箱板材：箱体的板缝、钉子和封边都已是 GLB 几何，不允许再烘一套假接缝。
 * 仅保留细密锯痕、纵向木纤维与轻微搬运磨损，避免生成图的四宫格拼接痕。
 */
export function BakeCrateWood(size = 512, { seed = 439, hue = [151, 124, 84] } = {}) {
  return BakeMaps(size, (px, py, out) => {
    const u = px / size, v = py / size;
    const grain = TileableFbm2(u * 11, v * 86, 11, {
      octaves: 3, seed: seed + 13, periodY: 86,
    });
    const saw = Ridged2(u * 19, v * 144, {
      octaves: 2, seed: seed + 29, periodY: 144,
    });
    const fine = TileableFbm2(u * 74, v * 74, 74, { octaves: 2, seed: seed + 43 });
    const wear = TileableFbm2(u * 21, v * 21, 21, { octaves: 3, seed: seed + 59 });
    const groove = Clamp01((saw - 0.64) * 2.8);
    const tone = (grain - 0.5) * 22 + (fine - 0.5) * 8 - groove * 14;
    const dust = Clamp01((wear - 0.62) * 1.7);
    const base = [hue[0] + tone, hue[1] + tone, hue[2] + tone];
    for (let c = 0; c < 3; c += 1) base[c] = Mix(base[c], 176, dust * 0.13);
    out.r = base[0]; out.g = base[1]; out.b = base[2];
    out.h = Clamp01(0.58 + (grain - 0.5) * 0.13 + groove * 0.15 + (fine - 0.5) * 0.05);
    out.rough = Clamp01(0.82 + fine * 0.10 + dust * 0.05);
    out.ao = Clamp01(0.80 + grain * 0.15 - groove * 0.10);
    out.metal = 0;
  }, { normalStrength: 1.35 });
}

/**
 * 土布军装：**一块近乎纯色的布**，靠垂坠的褶、汗渍浮土和一点织向立住，不靠花纹。
 * 西北军灰蓝布 / 日军土黄。
 *
 * 事故（这一版修的就是它）：原来这张图在一格 0.6 m 里画 28 根经纬线 ——
 * 一根线 21 mm，比拇指还粗。更要命的是那套织纹同时进了 albedo、height、AO、
 * roughness **四条通道**，于是每个交叉点都是一颗有明暗有高光的珠子：全场每个人
 * 身上罩着一层锁子甲。玩家的评语是「还不如纯色」，这话是准确的。
 *
 * 定量的根子：256 px 铺 0.6 m，一个纹素 2.3 mm；而土布的经纬线是 1 mm 量级。
 * **在这个贴图密度下织纹根本不可表达**（奈奎斯特：能画的最细周期是 4.7 mm，
 * 比真线粗五倍）。硬画出来的必然是一张比布粗一个数量级的假格子，而且它一定
 * 同时在 albedo 和法线上闪 —— 越走近越像铁。
 *
 * 所以这一版把**可读的图案全部让给比纹素大得多的东西**：
 *   · 褶（20 cm）—— 军装是宽松的，「垂」才是布的第一读数；
 *   · 死褶（10 cm）—— 肘窝、膝弯、下摆压出来的折痕；
 *   · 深浅不匀（2.5 cm）—— 手织土布一匹布染不匀，这是「土布」的身份证；
 *   · 织向（1.5 cm 的**条状**噪声，不是格子）—— 只进 height 与 roughness，
 *     一点都不进 albedo。它给的是「有织向」的高光，不是印上去的花纹。
 * albedo 的总起伏压在 ±8% 以内：三米外这块布必须读作一块颜色。
 */
export function BakeCloth(size = 256, { seed = 5, hue = [104, 110, 116], grime = 0.4 } = {}) {
  return BakeMaps(size, (px, py, out) => {
    const u = px / size, v = py / size;
    // 褶：宽松军装的垂坠。低频大幅度，绝大部分幅度进 height（受光），不进颜色
    const fold = TileableFbm2(u * 3, v * 3, 3, { octaves: 4, seed: seed + 71 });
    // 死褶：脊状噪声的窄脊就是压出来的折痕线
    const crease = 1 - Math.abs(TileableFbm2(u * 6, v * 6, 6, { octaves: 3, seed: seed + 53 }) * 2 - 1);
    // 纱结 / 染色不匀：手织土布唯一该进 albedo 的「纹」，而且只有 ±3.5%
    const slub = TileableFbm2(u * 24, v * 24, 24, { octaves: 2, seed: seed + 7 });
    // 织向：经纬各一组 4:1 的**条状**噪声。两轴周期不同，所以要 periodY，
    // 否则被拉长的那一轴走不满一圈，图就不平铺了
    const warpGrain = TileableFbm2(u * 32, v * 8, 32, { octaves: 2, seed: seed + 17, periodY: 8 });
    const weftGrain = TileableFbm2(u * 8, v * 32, 8, { octaves: 2, seed: seed + 29, periodY: 32 });
    const grain = (warpGrain + weftGrain) * 0.5;
    const stain = Clamp01(TileableFbm2(u * 4, v * 4, 4, { octaves: 4, seed: seed + 19 }) * 1.7 - 0.62) * grime;
    const dust = Clamp01(TileableFbm2(u * 7, v * 7, 7, { octaves: 3, seed: seed + 37 }) * 1.5 - 0.72);
    const sun = TileableFbm2(u * 2, v * 2, 2, { octaves: 2, seed: seed + 91 });   // 日晒褪色不匀
    const col = [0, 0, 0];
    for (let c = 0; c < 3; c += 1) {
      col[c] = hue[c] * (0.965 + slub * 0.07 + (sun - 0.5) * 0.06);
      col[c] = Mix(col[c], col[c] * 0.80, stain);                        // 汗碱与泥
      col[c] = Mix(col[c], Mix(col[c], 152, 0.38), dust * 0.42);         // 蒙的一层土
      // 褶在 albedo 上只留很轻的一道自阴影。画重了就成了印花：不受光、转个身还在
      col[c] *= 1 - (1 - fold) * 0.05 - crease * 0.04;
    }
    out.r = col[0]; out.g = col[1]; out.b = col[2];
    out.h = Clamp01(0.5 + (fold - 0.5) * 0.55 + (crease - 0.5) * 0.18
      + (slub - 0.5) * 0.06 + (grain - 0.5) * 0.05);
    out.rough = Clamp01(0.90 + (grain - 0.5) * 0.10 + slub * 0.04 + stain * 0.05);
    // AO 只由褶的凹处给。挂在织纹上是上一版「锁子甲」最关键的一条 ——
    // AO 乘的是间接光，逐颗珠子的 AO = 逐颗珠子的暗边 = 一眼看见的颗粒
    out.ao = Clamp01(0.80 + fold * 0.20 - crease * 0.12 - stain * 0.06);
    out.metal = 0;
  }, { normalStrength: 2.4 });
}

/** 烤蓝钢 / 铸铁：枪管、钢盔、机件。金属度与粗糙度不均 + 锈斑。 */
export function BakeSteel(size = 256, { seed = 6, base = [58, 60, 64], rust = 0.25, polish = 0.35 } = {}) {
  return BakeMaps(size, (px, py, out) => {
    const u = px / size, v = py / size;
    const micro = TileableFbm2(u * 150, v * 150, 150, { octaves: 2, seed: seed + 3 });
    const brush = TileableFbm2(u * 220, v * 6, 220, { octaves: 2, seed: seed + 11 });   // 顺枪管的拉丝
    const dent = TileableFbm2(u * 12, v * 12, 12, { octaves: 4, seed: seed + 23 });
    // 【2026-08-26 锈斑重做：原来那版在钢盔上是一顶红麻子】
    // 老写法是 SmoothStep(0.34, 0.06, w.f1) —— Worley 的单元本来就均匀铺满平面，
    // 拿到单元中心的距离当遮罩，等于**每个单元中心画一个圆点**，而且每个单元
    // 都画。钢盔一格贴图 0.35 m、14 个单元，落到盔顶就是 2.5 cm 间距的等距橙点，
    // 实拍出来是九〇式铁帽长了一头红痘。锈不长成这样，改成两层：
    //   1) 低频斑块 patch 先决定"哪一片起锈"——大半个表面根本进不了这一层，
    //      锈于是成片、有大有小，而不是一个单元一颗；
    //   2) 单元只负责把斑块边缘咬碎，而且取**单元交界**（f2−f1）不取单元中心，
    //      锈是从划痕、卷边、磕碰爬开的，不是从一个个圆心长出来的。
    // 颜色也从 (116,62,34) 那种新鲜铁锈的橙压到暗红褐：战场上的钢盔蒙着土，
    // 高饱和的橙在这条曝光下会跳成全场最亮的一块。
    const patch = TileableFbm2(u * 6, v * 6, 6, { octaves: 4, seed: seed + 61 });
    const w = Worley2(u * 18, v * 18, seed + 91, 18);
    const crumb = 0.42 + SmoothStep(0.34, 0.02, w.f2 - w.f1) * 0.58;
    const rustPatch = Clamp01(
      SmoothStep(0.55, 0.80, patch) * crumb * (0.45 + dent * 1.1) * rust * 2.2);
    const rustCol = [92, 58, 42];
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
    // 地面一格 2.6 m，是全场铺得最开的一张图（整座城一张地）。
    // soil 原来 6 —— 一格里只有六团 43 cm 的深浅斑，沿街往远处看就是等距的地砖花纹。
    // 推到 14（团缩到 19 cm、一格十几团）并把它在 albedo 里的幅度从 0.34 收到 0.22：
    // 起伏交给 height（那一路不参与平铺的可读性，因为受光方向随几何变）。
    const soil = TileableFbm2(u * 14, v * 14, 14, { octaves: 5, seed: seed + 2 });
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
      col[c] = dirt[c] * (0.89 + soil * 0.22);
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

/**
 * 石活：碱脚（过墙石）、城门墩、井台、门槛、门道墁地。
 *
 * 原来是 Worley(5) 的泰森多边形 —— 出来是一片**乱石拼花**（crazy paving），
 * 那是欧洲花园小径的砌法。而这张图在正片里的实际用途是每一段墙脚下那条
 * 碱脚：鲁南是**条石顺砌、一皮一皮错缝**的。乱石拼花铺在几百米墙根上，
 * 是每张街景截图里最扎眼的一处形制错误。
 *
 * 改成分皮砌：一格贴图 1.4 m → 四皮，皮高 35 cm（条石的真实尺寸）；
 * 每皮一个随机错缝量，每块石头单独的深浅与鼓凸。
 * 色按 docs/Data_HistoryMaterial.md 的过墙石 #B3B0A6 往回收一档（贴图是 albedo，
 * 不是最终观感；直接写 179 会让碱脚成为全场最亮的东西）。
 */
export function BakeStone(size = 512, { seed = 9, courses = 4, perCourse = 3 } = {}) {
  const mortarH = 0.052, mortarV = 0.042;
  return BakeMaps(size, (px, py, out) => {
    const u = px / size, v = py / size;
    const rowF = v * courses;
    const row = Math.floor(rowF);
    const inRow = rowF - row;
    // 每一皮一个随机错缝量。吸附到 1/(2*perCourse) 的格上，图案随机但竖缝不会
    // 在贴图接缝处对不齐（这张图是要无缝平铺的）
    const shiftRnd = Mulberry32((((row * 374761393) ^ (seed * 668265263)) >>> 0))();
    const shift = Math.round(shiftRnd * perCourse * 2) / (perCourse * 2);
    const colF = u * perCourse + shift;
    const col = Math.floor(colF);
    const inCol = colF - col;
    // 逐石随机：大素数异或混，别用线性组合（同 BakeBrickWall 那条注释的坑）
    const stone = Mulberry32((((row * 92837111) ^ (col * 689287499) ^ (seed * 283923481)) >>> 0))();

    const dh = Math.min(inRow, 1 - inRow);
    const dv = Math.min(inCol, 1 - inCol);
    const joint = Math.min(SmoothStep(0, mortarH, dh), SmoothStep(0, mortarV, dv));

    const grain = TileableFbm2(u * 48, v * 48, 48, { octaves: 4, seed: seed + 17 });
    // 凿痕：条石表面是錾出来的，一道道斜纹
    const chisel = Math.abs(TileableFbm2(u * 26, v * 96, 26, { octaves: 2, seed: seed + 61 }) - 0.5) * 2;
    const pit = SmoothStep(0.22, 0.05, Worley2(u * 34, v * 34, seed + 53, 34).f1) * 0.35;
    // 石面中间鼓、边上收（条石不是平板）
    const belly = Math.pow(Clamp01(Math.sin(inCol * Math.PI) * Math.sin(inRow * Math.PI)), 0.5);

    const tone = 0.86 + stone * 0.26;
    const base = [148 * tone, 145 * tone, 137 * tone];
    const mortarCol = [124, 122, 116];
    for (let c = 0; c < 3; c += 1) base[c] = Mix(mortarCol[c], base[c], joint);
    const sh = (grain - 0.5) * 18 - chisel * 6;
    out.r = base[0] + sh; out.g = base[1] + sh; out.b = base[2] + sh;
    out.h = Clamp01(0.28 + joint * 0.42 + belly * 0.14 + grain * 0.1 - pit * 0.26 - chisel * 0.05);
    out.rough = Clamp01(0.80 + grain * 0.14 + pit * 0.08);
    out.ao = Clamp01(0.40 + joint * 0.52 + belly * 0.08 - pit * 0.18);
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
  // 砖墙吃双倍分辨率：它是全场**面积最大**的表面（每一张正片的主体都是砖墙），
  // 512 那一档一格贴图只塞得下 12×6 块砖，1.2 m 一个循环在两米开外就能数出来。
  // 注意别写成 `s ?? 1024` —— Materials 层 **总是**显式传 size 进来，?? 永远不生效，
  // 上一轮就是这么"改了等于没改"。这里按传进来的档位翻倍，低配档跟着降。
  BrickWall: (s) => BakeBrickWall((s ?? 512) * 2, { seed: 101, rowsPerTile: 20 }),
  BrickWallSooty: (s) => BakeBrickWall((s ?? 512) * 2, { seed: 137, rowsPerTile: 20, damage: 0.6, sootiness: 0.95 }),
  // 构件库离散战损态的 imagegen PBR 兜底。正式图缺失时仍保留相同的
  // “初阶崩裂 / 严重破坏”层级，不让编辑器因为一张贴图 404 回到同一张完好墙。
  BuildingDamageEarly: (s) => BakeBrickWall((s ?? 512) * 2,
    { seed: 101, rowsPerTile: 20, damage: 0.26, sootiness: 0.12 }),
  BuildingDamageSevere: (s) => BakeBrickWall((s ?? 512) * 2,
    { seed: 101, rowsPerTile: 20, damage: 0.56, sootiness: 0.28 }),
  Adobe: (s) => BakeAdobe(s ?? 512, { seed: 211 }),
  // 滕县城墙的三套 ImageGen PBR 在启动时覆盖这些同步兜底。独立命名避免把
  // 民居青砖、土坯房和普通院落条石一起换成军事城墙尺度的纹理。
  CityWallBrickPbr: (s) => BakeBrickWall((s ?? 512) * 2,
    { seed: 181, rowsPerTile: 22, damage: 0.42, sootiness: 0.32 }),
  CityWallCorePbr: (s) => BakeAdobe(s ?? 512, { seed: 229 }),
  CityWallStonePbr: (s) => BakeStone(s ?? 512, { seed: 929 }),
  RoofTile: (s) => BakeRoofTile(s ?? 512, { seed: 307 }),
  // 四座滕县城门的专属近景材质。外部 imagegen PBR 加载失败时仍用这些
  // 对齐尺度的程序化底材启动，不能让地标因为一张图 404 阻断整关。
  GateBrick: (s) => BakeBrickWall((s ?? 512) * 2, {
    seed: 331, rowsPerTile: 14, damage: 0.56, sootiness: 0.34,
  }),
  GatePaintedWood: (s) => BakeWood(s ?? 512, { seed: 347, planks: 5 }),
  GateRoofTile: (s) => BakeRoofTile(s ?? 512, { seed: 353, ridges: 11 }),
  WoodDoor: (s) => BakeWood(s ?? 512, { seed: 401, planks: 4 }),
  WoodBeam: (s) => BakeWood(s ?? 256, { seed: 419, planks: 1, weathered: 0.7 }),
  // 小型木制件不用门板缝或整根梁柱尺度的通用木纹；箱体和篱笆均由确定性 PBR
  // 烘焙，几何自身负责板缝、绑枝等结构细节。
  HandcartWood: (s) => BakeWood(s ?? 512, {
    seed: 431, hue: [118, 101, 82], planks: 1, weathered: 0.86,
  }),
  WoodCrate: (s) => BakeCrateWood(s ?? 512),
  WattleFence: (s) => BakeFenceWood(s ?? 256, { seed: 467, hue: [104, 92, 72] }),
  // 外部的 ImageGen 树皮 PBR 在启动时会覆盖这套同步兜底；失败时树仍不至于丢材质。
  TreeBark: (s) => BakeWood(s ?? 256, { seed: 457, hue: [92, 82, 66], planks: 1, weathered: 0.9 }),
  WoodStock: (s) => BakeWood(s ?? 256, { seed: 433, hue: [98, 66, 40], planks: 1, weathered: 0.15 }),
  ClothNra: (s) => BakeCloth(s ?? 256, { seed: 503, hue: [106, 112, 118] }),
  ClothIja: (s) => BakeCloth(s ?? 256, { seed: 521, hue: [124, 116, 82] }),
  Steel: (s) => BakeSteel(s ?? 256, { seed: 601 }),
  // 卢沟桥武器的外部原贴图若 404，按材质类别退回可用的程序化 PBR；正常路径
  // 会在 Main 启动阶段整套覆盖，因此不会把这些兜底纹理显示到玩家面前。
  LugouqiaoUnidentifiedMunition: (s) => BakeSteel(s ?? 256, { seed: 632 }),
  LugouqiaoOfficerSword: (s) => BakeSteel(s ?? 256, { seed: 634 }),
  LugouqiaoRingPommelDagger: (s) => BakeSteel(s ?? 256, { seed: 635 }),
  LugouqiaoType11AmmoBox: (s) => BakeSteel(s ?? 256, { seed: 639 }),
  LugouqiaoType11Body: (s) => BakeSteel(s ?? 256, { seed: 640 }),
  LugouqiaoType11BodyAlt: (s) => BakeSteel(s ?? 256, { seed: 641 }),
  LugouqiaoType11Fore: (s) => BakeWood(s ?? 256, { seed: 642, planks: 1 }),
  LugouqiaoMauser96: (s) => BakeSteel(s ?? 256, { seed: 643 }),
  SteelHelmet: (s) => BakeSteel(s ?? 256, { seed: 617, base: [64, 66, 60], polish: 0.2, rust: 0.35 }),
  Ground: (s) => BakeRubbleGround(s ?? 512, { seed: 701 }),
  // 东门外翻耕土的 ImageGen BaseColor + Normal 会在启动时覆盖；404 时仍保留
  // 同尺度的干燥碎土 PBR，避免新材质名让整关建场失败。
  PloughedSoil: (s) => BakeRubbleGround(s ?? 512, { seed: 709, brickiness: 0.08 }),
  GroundRubble: (s) => BakeRubbleGround(s ?? 512, { seed: 719, brickiness: 0.85 }),
  Sandbag: (s) => BakeSandbag(s ?? 256, { seed: 809 }),
  Stone: (s) => BakeStone(s ?? 512, { seed: 907 }),
  // 院落三件的 imagegen Base + Normal 兜底。正常开机整套覆盖；任一外图失败时
  // 仍要有同名 recipe，catch 才能补烘而不是到建场时抛“材质未烘焙”。
  WellStone: (s) => BakeStone(s ?? 512, { seed: 911, courses: 6, perCourse: 5 }),
  Millstone: (s) => BakeStone(s ?? 512, { seed: 919, courses: 1, perCourse: 1 }),
  // ChineseLife 三件专属外图失败时的同名兜底。井台与磨盘正常路径恢复各自
  // Sketchfab 源 PBR；门板正常路径走无字的 1938 鲁南 imagegen 木板。
  ShopDoorPbr: (s) => BakeWood(s ?? 512, {
    seed: 929, hue: [91, 66, 44], planks: 8, weathered: 0.88,
  }),
  StoneWellOriginal: (s) => BakeStone(s ?? 512, { seed: 937, courses: 6, perCourse: 7 }),
  StoneMillOriginal: (s) => BakeStone(s ?? 512, { seed: 941, courses: 1, perCourse: 1 }),
  WaterVatCeramic: (s) => BakeFlat(s ?? 256, { color: [58, 43, 32], rough: 0.78 }),
  // 庙墙灰浆：ImageGen 的 TemplePlaster PBR 在启动时覆盖此兜底；失败时退回土坯质感。
  TemplePlaster: (s) => BakeAdobe(s ?? 512, { seed: 223 }),
  // 车站红砖 / 监狱青砖：同上，外部 webp 开机覆盖；兜底只保证「加载失败不丢材质」，
  // 故意不上 BrickWall 那档双倍分辨率（反正会被顶掉，白烤）。
  StationBrick: (s) => BakeBrickWall(s ?? 512, { seed: 163, rowsPerTile: 16 }),
  PrisonBrick: (s) => BakeBrickWall(s ?? 512, { seed: 149, rowsPerTile: 18 }),
};
