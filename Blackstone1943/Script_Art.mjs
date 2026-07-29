/**
 * Script_Art.mjs — 渲染栈：材质库 / 程序化贴图 / 光照 / 雾 / 天空 / 后处理 / 天气 / 特效
 * Owner: AgentArt
 *
 * 视觉签名（一句话）：**冬日冷灰蓝是唯一底色，火光暖橙是唯一暖色。**
 * 画面里每一处暖色都必须有物理来源（篝火 / 油灯 / 枪口焰 / 照明弹 / 燃烧的房梁），
 * 天光、雪、雾、远山、人物一律落在冷端。冷暖对比就是本作的构图。
 *
 * 依赖 DAG：three, Config, Math。禁止 import 任何玩法模块。
 * 零外部素材：所有贴图 Canvas2D 程序化生成，所有天空/雾/粒子/后处理为自写 shader。
 *
 * 渲染管线（顺序固定）：
 *   RenderPass(线性 HDR) → GodRayPass(径向散射) → UnrealBloomPass → GradePass(暗角/颗粒/色差/受伤)
 *   → OutputPass(ACESFilmic + sRGB 编码，输出到屏幕)
 * 前四段全部在线性空间，色调映射只在最后一次，避免二次压缩。
 *
 * 高度雾：不走 EffectComposer 的深度重建（软件光栅上风险高），改为对**本模块产出的每一个材质**
 * 注入 onBeforeCompile，替换 three 的 fog chunk。共享同一份 uniform 对象，一帧只更新一次。
 * 世界 Y 由视空间位置反推：worldY = cameraY + dot(upInView, mvPosition)，
 * 对 InstancedMesh / SkinnedMesh 同样正确（mvPosition 已含实例与蒙皮变换）。
 */

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Config, Palette } from './Script_Config.mjs';
import * as MathUtil from './Script_Math.mjs';

/* ================================================================== *
 * 〇、通用工具：色彩 / 可平铺噪声
 * ================================================================== */

function ChannelsOf(hex) {
  return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
}

function HexOf(r, g, b) {
  const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
  return (clamp(r) << 16) | (clamp(g) << 8) | clamp(b);
}

/** sRGB 空间的直线混合，够用且直觉（美术调色就是这么想的）。 */
function MixHex(fromHex, toHex, t) {
  const a = ChannelsOf(fromHex);
  const b = ChannelsOf(toHex);
  const k = MathUtil.Clamp01(t);
  return HexOf(a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k);
}

/**
 * 把过暗的反照率抬回可读区间，保持色相。
 * 起因：`BrickBurnt(#4a3d38)` / `CharredWood(#241f1d)` 在 ACES + 暗角 + 低角度太阳下
 * 出屏只剩 rgb(0..13)，断墙变成没有体积的黑板。真实的烧焦木头反照率约 0.06—0.10，
 * 但屏幕上"烧焦"的读数来自**结构**（龟裂、炭化纹理），不是来自一个死黑的底色。
 */
function LiftAlbedo(hex, floorLevel) {
  const [r, g, b] = ChannelsOf(hex);
  const luma = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  if (luma >= floorLevel) return hex;
  const gain = floorLevel / Math.max(0.01, luma);
  /* 提亮时略微去饱和，避免暗色被抬亮后变成塑料玩具色 */
  const lifted = [r * gain, g * gain, b * gain];
  const mean = (lifted[0] + lifted[1] + lifted[2]) / 3;
  const desat = 0.22;
  return HexOf(
    lifted[0] + (mean - lifted[0]) * desat,
    lifted[1] + (mean - lifted[1]) * desat,
    lifted[2] + (mean - lifted[2]) * desat,
  );
}

/* —— 可平铺值噪声：贴图必须无缝，否则地形上 repeat 26 会出现网格状接缝 —— */

function TileHash(ix, iy, period) {
  const px = Math.max(1, period);
  const wx = ((ix % px) + px) % px;
  const wy = ((iy % px) + px) % px;
  return MathUtil.Hash2(wx * 1.0 + 0.5, wy * 1.0 + 0.5);
}

function TileValueNoise(x, y, period) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = TileHash(ix, iy, period);
  const b = TileHash(ix + 1, iy, period);
  const c = TileHash(ix, iy + 1, period);
  const d = TileHash(ix + 1, iy + 1, period);
  return MathUtil.Lerp(MathUtil.Lerp(a, b, ux), MathUtil.Lerp(c, d, ux), uy);
}

/** 可平铺 fbm。period 与频率同步翻倍，保证每一层都在同一张图上闭合。 */
function TileFbm(x, y, period, octaves, gain) {
  let amplitude = 1;
  let sum = 0;
  let norm = 0;
  let frequency = 1;
  const decay = gain === undefined ? 0.52 : gain;
  const count = octaves === undefined ? 4 : octaves;
  for (let i = 0; i < count; i += 1) {
    sum += TileValueNoise(x * frequency, y * frequency, period * frequency) * amplitude;
    norm += amplitude;
    amplitude *= decay;
    frequency *= 2;
  }
  return sum / Math.max(0.0001, norm);
}

/** 可平铺 worley（细胞距离），用于龟裂、卵石、锈斑。返回 [0,1]，0 = 细胞中心。 */
function TileWorley(x, y, period) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  let best = 8;
  for (let oy = -1; oy <= 1; oy += 1) {
    for (let ox = -1; ox <= 1; ox += 1) {
      const cx = ix + ox;
      const cy = iy + oy;
      const jitterX = TileHash(cx, cy, period);
      const jitterY = TileHash(cx + 37, cy + 11, period);
      const px = cx + jitterX;
      const py = cy + jitterY;
      const dx = px - x;
      const dy = py - y;
      const distance = dx * dx + dy * dy;
      if (distance < best) best = distance;
    }
  }
  return MathUtil.Clamp01(Math.sqrt(best));
}

function TileRidge(x, y, period, octaves) {
  return 1 - Math.abs(TileFbm(x, y, period, octaves || 3) * 2 - 1);
}

/* ================================================================== *
 * 一、程序化贴图：高度场 → 反照率细节图 + 法线图
 *
 * 纪律：
 *  - 反照率图是**细节**不是压暗器，均值贴近 1.0；底色由 MaterialSpecs.color 决定。
 *  - 法线图必须 NoColorSpace（three 默认），反照率图必须 SRGBColorSpace，混了就整体偏色。
 *  - 高度场只算一次，反照率与法线共用，法线只是 Sobel，几乎不花钱。
 * ================================================================== */

function MakeCanvas(size) {
  const canvas = (typeof document !== 'undefined' && document.createElement)
    ? document.createElement('canvas')
    : null;
  if (!canvas) return null;
  canvas.width = size;
  canvas.height = size;
  return canvas;
}

/** 采样高度场到 Float32Array，坐标以 [0,1) 归一给配方函数。 */
function BuildHeightField(size, sampler) {
  const field = new Float32Array(size * size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      field[y * size + x] = MathUtil.Clamp01(sampler(x / size, y / size, x, y));
    }
  }
  return field;
}

function FieldToAlbedoTexture(field, size, options) {
  const canvas = MakeCanvas(size);
  if (!canvas) return null;
  const context = canvas.getContext('2d');
  const image = context.createImageData(size, size);
  const data = image.data;
  const settings = options || {};
  const base = settings.base === undefined ? 0.96 : settings.base;
  const contrast = settings.contrast === undefined ? 0.24 : settings.contrast;
  /* 凹处偏冷（雪影/湿土），凸处偏中性——这一步让灰度图有了"空气" */
  const shadowTint = ChannelsOf(settings.shadowTint === undefined ? 0x9fb0c4 : settings.shadowTint);
  const speck = settings.speck === undefined ? 0.035 : settings.speck;
  for (let i = 0; i < size * size; i += 1) {
    const x = i % size;
    const y = (i / size) | 0;
    const value = field[i];
    const noise = (MathUtil.Hash2(x * 3.117 + 0.5, y * 7.331 + 0.5) - 0.5) * speck;
    const level = MathUtil.Clamp01(base + (value - 0.5) * contrast * 2 + noise);
    const shade = MathUtil.Clamp01((1 - level) * 1.4);
    const index = i * 4;
    data[index] = Math.round(255 * level * MathUtil.Lerp(1, shadowTint[0] / 255, shade));
    data[index + 1] = Math.round(255 * level * MathUtil.Lerp(1, shadowTint[1] / 255, shade));
    data[index + 2] = Math.round(255 * level * MathUtil.Lerp(1, shadowTint[2] / 255, shade));
    data[index + 3] = 255;
  }
  context.putImageData(image, 0, 0);
  return canvas;
}

function FieldToNormalCanvas(field, size, strength) {
  const canvas = MakeCanvas(size);
  if (!canvas) return null;
  const context = canvas.getContext('2d');
  const image = context.createImageData(size, size);
  const data = image.data;
  const power = strength === undefined ? 1.4 : strength;
  const At = (x, y) => field[(((y % size) + size) % size) * size + (((x % size) + size) % size)];
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      /* Sobel，环绕取样保证与反照率同样无缝 */
      const dx = (At(x + 1, y - 1) + 2 * At(x + 1, y) + At(x + 1, y + 1))
        - (At(x - 1, y - 1) + 2 * At(x - 1, y) + At(x - 1, y + 1));
      const dy = (At(x - 1, y + 1) + 2 * At(x, y + 1) + At(x + 1, y + 1))
        - (At(x - 1, y - 1) + 2 * At(x, y - 1) + At(x + 1, y - 1));
      let nx = -dx * power;
      let ny = -dy * power;
      const nz = 1;
      const length = Math.sqrt(nx * nx + ny * ny + nz * nz);
      nx /= length;
      ny /= length;
      const index = (y * size + x) * 4;
      data[index] = Math.round((nx * 0.5 + 0.5) * 255);
      data[index + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      data[index + 2] = Math.round((nz / length * 0.5 + 0.5) * 255);
      data[index + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
  return canvas;
}

function WrapTexture(canvas, colorSpace) {
  if (!canvas) return null;
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  texture.colorSpace = colorSpace || THREE.NoColorSpace;
  texture.needsUpdate = true;
  return texture;
}

/* ------------------------------------------------------------------ *
 * 高度场配方：每一种材质的"手感"都写在这里。
 * 目标不是照片级，而是**在 3—30 米距离上一眼能分辨材质**：
 * 雪有风纹、夯土有抹刀痕与麦秸、焦木有龟裂、粗布有经纬。
 * ------------------------------------------------------------------ */

const FieldRecipes = {
  /**
   * 雪：**几乎是平的**。新雪最重要的读数是"没有细节"——大面积柔和起伏 + 风梳出的浅波纹。
   * 早期版本在高度场里加了高频晶粒，出屏变成一地砂砾，那是石子路不是雪。
   * 晶体的闪只走 albedo 的 speck（不进法线），才不会在远处糊成噪点。
   */
  Texture_SnowNoise: {
    size: 256,
    normalStrength: 0.85,
    albedo: { base: 0.975, contrast: 0.075, shadowTint: 0xa8bcd2, speck: 0.022 },
    Field(u, v) {
      const dune = TileFbm(u * 3, v * 3, 3, 4, 0.55);
      const drift = TileFbm(u * 7 + 3, v * 7 + 7, 7, 3, 0.5);
      const warp = TileFbm(u * 4 + 11, v * 4 + 3, 4, 2, 0.5) * 0.75;
      const ripple = Math.sin((v * 5 + warp) * Math.PI * 2) * 0.5 + 0.5;
      return dune * 0.54 + drift * 0.28 + ripple * 0.18;
    },
  },
  /* 压实的雪/雪路：被踩过的雪会板结成浅浅的团块，比新雪略糙但仍然不是砂砾 */
  Texture_SnowPacked: {
    size: 256,
    normalStrength: 1.15,
    albedo: { base: 0.955, contrast: 0.14, shadowTint: 0x93a8c0, speck: 0.03 },
    Field(u, v) {
      const clump = 1 - TileWorley(u * 6, v * 6, 6);
      const rough = TileFbm(u * 10, v * 10, 10, 3, 0.5);
      return MathUtil.Clamp01(clump * 0.42 + rough * 0.58);
    },
  },
  /* 冰：大块裂纹 + 内部气泡 */
  Texture_Ice: {
    size: 256,
    normalStrength: 2.8,
    albedo: { base: 0.94, contrast: 0.26, shadowTint: 0x7fa0b8, speck: 0.02 },
    Field(u, v) {
      const crack = MathUtil.Clamp01(TileWorley(u * 5, v * 5, 5) * 3.4);
      const bubble = TileFbm(u * 24, v * 24, 24, 2, 0.5);
      return crack * 0.78 + bubble * 0.22;
    },
  },
  /* 泥土：冻硬的土面，大块板结为主，碎粒只做点缀 */
  Texture_DirtGrain: {
    size: 256,
    normalStrength: 1.5,
    albedo: { base: 0.94, contrast: 0.20, shadowTint: 0x6a6154, speck: 0.05 },
    Field(u, v) {
      const cake = TileFbm(u * 4, v * 4, 4, 4, 0.58);
      const pebble = 1 - TileWorley(u * 9, v * 9, 9);
      const grain = TileFbm(u * 18, v * 18, 18, 2, 0.5);
      return MathUtil.Clamp01(cake * 0.46 + pebble * 0.30 + grain * 0.24);
    },
  },
  /* 岩：层理 + 崩口。层理方向固定，让山石有"沉积"的重量 */
  Texture_RockGrain: {
    size: 256,
    normalStrength: 1.8,
    albedo: { base: 0.93, contrast: 0.26, shadowTint: 0x59606b, speck: 0.035 },
    Field(u, v) {
      const bendWarp = TileFbm(u * 3, v * 3, 3, 3, 0.55) * 0.35;
      const strata = Math.sin((v * 5 + bendWarp) * Math.PI * 2) * 0.5 + 0.5;
      const chip = 1 - TileWorley(u * 5, v * 5, 5);
      const grit = TileFbm(u * 14, v * 14, 14, 3, 0.5);
      return MathUtil.Clamp01(strata * 0.20 + chip * 0.48 + grit * 0.32);
    },
  },
  /* 夯土墙：抹刀横向拖痕 + 掺进去的麦秸 + 掉皮露出的粗胎 */
  Texture_MudWall: {
    size: 256,
    normalStrength: 1.25,
    albedo: { base: 0.955, contrast: 0.17, shadowTint: 0x6f6350, speck: 0.035 },
    Field(u, v) {
      const trowelWarp = TileFbm(u * 4, v * 8, 4, 3, 0.5) * 0.6;
      const trowel = Math.sin((v * 7 + trowelWarp) * Math.PI * 2) * 0.5 + 0.5;
      const body = TileFbm(u * 5, v * 5, 5, 4, 0.55);
      /* 麦秸：稀疏的短亮线。用 ridge 噪声掐尖，只留下最亮的一小撮 */
      const strawSeed = TileRidge(u * 20 + 5, v * 6 + 2, 20, 2);
      const straw = MathUtil.Clamp01((strawSeed - 0.86) * 6);
      const peel = MathUtil.Clamp01((TileFbm(u * 2.5 + 17, v * 2.5 + 23, 3, 3, 0.6) - 0.62) * 3);
      return MathUtil.Clamp01(body * 0.58 + trowel * 0.12 + straw * 0.16 - peel * 0.14 + 0.16);
    },
  },
  /**
   * 烧过的墙：黑石峪是华北土坯村，不是砖城。所以砖缝只是**隐约**的一道，
   * 主导读数是烟熏的深浅斑与掉落的墙皮。做成整齐红砖会瞬间穿越到现代。
   */
  Texture_BrickBurnt: {
    size: 256,
    normalStrength: 1.35,
    albedo: { base: 0.94, contrast: 0.24, shadowTint: 0x4a4644, speck: 0.04 },
    Field(u, v) {
      const rows = 6;
      const row = Math.floor(v * rows);
      const offset = (row % 2) * 0.5;
      const bx = (u * 3 + offset) % 1;
      const by = (v * rows) % 1;
      const course = Math.min(
        MathUtil.SmoothStep(0.0, 0.06, bx) * MathUtil.SmoothStep(1.0, 0.94, bx),
        MathUtil.SmoothStep(0.0, 0.10, by) * MathUtil.SmoothStep(1.0, 0.90, by),
      );
      const face = TileFbm(u * 8, v * 8, 8, 4, 0.55);
      const soot = TileFbm(u * 3 + 31, v * 5 + 7, 3, 3, 0.62);
      return MathUtil.Clamp01(course * 0.11 + face * 0.55 + (1 - soot) * 0.34);
    },
  },
  /* 木：年轮拖长的竖纹 + 结疤 */
  Texture_WoodGrain: {
    size: 256,
    normalStrength: 1.05,
    albedo: { base: 0.95, contrast: 0.18, shadowTint: 0x5a4a37, speck: 0.025 },
    Field(u, v) {
      const wobble = TileFbm(u * 3, v * 12, 3, 3, 0.5) * 0.9;
      const rings = Math.sin((u * 7 + wobble) * Math.PI * 2) * 0.5 + 0.5;
      const knotDistance = TileWorley(u * 2.2, v * 2.2, 3);
      const knot = MathUtil.Clamp01((0.28 - knotDistance) * 4);
      const fibre = TileFbm(u * 20, v * 5, 20, 2, 0.5);
      return MathUtil.Clamp01(rings * 0.34 + fibre * 0.44 - knot * 0.34 + 0.24);
    },
  },
  /* 炭化的房梁：龟裂成鳞片（alligator cracking），这才是"烧过"的真正读数 */
  Texture_CharredPlank: {
    size: 256,
    normalStrength: 0.85,
    albedo: { base: 0.935, contrast: 0.17, shadowTint: 0x2f2a26, speck: 0.045 },
    Field(u, v) {
      const cell = TileWorley(u * 5, v * 5, 5);
      const scale = MathUtil.Clamp01(cell * 2.6);
      const soot = TileFbm(u * 6, v * 6, 6, 4, 0.55);
      const ash = TileFbm(u * 15, v * 15, 15, 2, 0.5);
      return MathUtil.Clamp01(scale * 0.30 + soot * 0.48 + ash * 0.22);
    },
  },
  /* 茅草/麦秸：一堆方向略乱的细杆 */
  Texture_StrawWeave: {
    size: 256,
    normalStrength: 1.3,
    albedo: { base: 0.945, contrast: 0.22, shadowTint: 0x6e6142, speck: 0.06 },
    Field(u, v) {
      const lean = TileFbm(u * 5, v * 5, 5, 2, 0.5) * 0.9;
      const stalk = TileRidge(u * 24 + lean * 4, v * 3, 24, 2);
      const bundle = TileFbm(u * 9, v * 4, 9, 3, 0.55);
      return MathUtil.Clamp01(stalk * 0.56 + bundle * 0.44);
    },
  },
  /**
   * 粗布：经纬交织。**频率必须远低于贴图分辨率**——早期版本 128px 上放 22 个周期，
   * 只有 5.8 像素一格，mipmap 一压就是摩尔纹，人物身上出现巨大的毛衣格子。
   * 现在 9 个周期（14 像素一格），密度靠 repeat 调，远看是布，近看才有纹。
   */
  Texture_ClothWeave: {
    size: 128,
    normalStrength: 0.75,
    albedo: { base: 0.965, contrast: 0.085, shadowTint: 0x5d5a52, speck: 0.035 },
    Field(u, v) {
      const warp = Math.sin(u * Math.PI * 2 * 9) * 0.5 + 0.5;
      const weft = Math.sin(v * Math.PI * 2 * 9) * 0.5 + 0.5;
      const weave = Math.max(warp, weft) * 0.5 + warp * weft * 0.5;
      const slub = TileFbm(u * 6, v * 6, 6, 3, 0.55);
      /* 布不是完美的网格：让经纬本身被低频噪声推着走 */
      const wear = TileFbm(u * 3 + 13, v * 3 + 5, 3, 2, 0.5);
      return MathUtil.Clamp01(weave * 0.34 + slub * 0.38 + wear * 0.28);
    },
  },
  /* 棉絮/皮毛：蓬松团块 */
  Texture_FurTuft: {
    size: 128,
    normalStrength: 1.1,
    albedo: { base: 0.95, contrast: 0.18, shadowTint: 0x4b4238, speck: 0.06 },
    Field(u, v) {
      const tuft = 1 - TileWorley(u * 6, v * 6, 6);
      const fibre = TileRidge(u * 14, v * 14, 14, 2);
      return MathUtil.Clamp01(tuft * 0.62 + fibre * 0.38);
    },
  },
  /* 窗纸/纸张：纤维 + 破口 */
  Texture_PaperGrain: {
    size: 128,
    normalStrength: 0.9,
    albedo: { base: 0.97, contrast: 0.14, shadowTint: 0x9c9384, speck: 0.05 },
    Field(u, v) {
      const fibre = TileRidge(u * 26, v * 8, 26, 2);
      const blotch = TileFbm(u * 6, v * 6, 6, 3, 0.55);
      return MathUtil.Clamp01(fibre * 0.35 + blotch * 0.65);
    },
  },
  /* 锈铁：锈斑吃掉漆面 */
  Texture_MetalRust: {
    size: 256,
    normalStrength: 1.3,
    albedo: { base: 0.935, contrast: 0.24, shadowTint: 0x574636, speck: 0.05 },
    Field(u, v) {
      const patch = TileFbm(u * 6, v * 6, 6, 4, 0.6);
      const pit = 1 - TileWorley(u * 11, v * 11, 11);
      return MathUtil.Clamp01(patch * 0.6 + pit * 0.4);
    },
  },
  /* 枯叶/针叶：作为面片贴图，只要有疏密即可 */
  Texture_FoliageMask: {
    size: 128,
    normalStrength: 0.8,
    albedo: { base: 0.945, contrast: 0.24, shadowTint: 0x424a3a, speck: 0.07 },
    Field(u, v) {
      const needle = TileRidge(u * 13, v * 13, 13, 2);
      const clump = TileFbm(u * 7, v * 7, 7, 3, 0.5);
      return MathUtil.Clamp01(needle * 0.45 + clump * 0.55);
    },
  },
};

/* —— 精灵贴图（粒子/光晕/贴花），不走高度场 —— */

function SpriteSoftDot(size) {
  const canvas = MakeCanvas(size);
  if (!canvas) return null;
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.4, 'rgba(255,255,255,0.62)');
  gradient.addColorStop(0.75, 'rgba(255,255,255,0.16)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
  return canvas;
}

/** 雪花：不是完美圆点，带一点结晶的不规则，近景大片时能看出形状 */
function SpriteSnowFlake(size) {
  const canvas = MakeCanvas(size);
  if (!canvas) return null;
  const context = canvas.getContext('2d');
  const image = context.createImageData(size, size);
  const data = image.data;
  const half = size / 2;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = (x - half) / half;
      const dy = (y - half) / half;
      const radius = Math.sqrt(dx * dx + dy * dy);
      const angle = Math.atan2(dy, dx);
      const lobes = 0.86 + Math.cos(angle * 6) * 0.14;
      const alpha = MathUtil.Clamp01(1 - radius / lobes);
      const soft = Math.pow(alpha, 1.7);
      const index = (y * size + x) * 4;
      data[index] = 255;
      data[index + 1] = 255;
      data[index + 2] = 255;
      data[index + 3] = Math.round(soft * 255);
    }
  }
  context.putImageData(image, 0, 0);
  return canvas;
}

/** 烟：多团重叠的软斑，避免"一个完美圆"的塑料感 */
function SpriteSmokePuff(size) {
  const canvas = MakeCanvas(size);
  if (!canvas) return null;
  const context = canvas.getContext('2d');
  const image = context.createImageData(size, size);
  const data = image.data;
  const half = size / 2;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = (x - half) / half;
      const dy = (y - half) / half;
      const radius = Math.sqrt(dx * dx + dy * dy);
      const churn = TileFbm(x / size * 6, y / size * 6, 6, 3, 0.55) - 0.5;
      const alpha = MathUtil.Clamp01(1 - radius * (1.05 + churn * 0.55));
      const index = (y * size + x) * 4;
      data[index] = 255;
      data[index + 1] = 255;
      data[index + 2] = 255;
      data[index + 3] = Math.round(Math.pow(alpha, 1.5) * 235);
    }
  }
  context.putImageData(image, 0, 0);
  return canvas;
}

/** 脚印：前掌 + 后跟两块凹陷，边缘软。只做"暗斑"，靠材质颜色决定冷暖 */
function SpriteFootprint(size) {
  const canvas = MakeCanvas(size);
  if (!canvas) return null;
  const context = canvas.getContext('2d');
  context.clearRect(0, 0, size, size);
  const Blob = (cx, cy, rx, ry, strength) => {
    const gradient = context.createRadialGradient(cx, cy, 0, cx, cy, Math.max(rx, ry));
    gradient.addColorStop(0, 'rgba(255,255,255,' + strength + ')');
    gradient.addColorStop(0.62, 'rgba(255,255,255,' + (strength * 0.55) + ')');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    context.save();
    context.translate(cx, cy);
    context.scale(rx / Math.max(rx, ry), ry / Math.max(rx, ry));
    context.translate(-cx, -cy);
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(cx, cy, Math.max(rx, ry), 0, Math.PI * 2);
    context.fill();
    context.restore();
  };
  Blob(size * 0.5, size * 0.36, size * 0.22, size * 0.20, 0.95);
  Blob(size * 0.5, size * 0.68, size * 0.16, size * 0.15, 0.80);
  return canvas;
}

/** 弹着点：中心暗、四周溅开的碎点 */
function SpriteImpactMark(size) {
  const canvas = MakeCanvas(size);
  if (!canvas) return null;
  const context = canvas.getContext('2d');
  context.clearRect(0, 0, size, size);
  const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size * 0.3);
  gradient.addColorStop(0, 'rgba(255,255,255,0.95)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
  for (let i = 0; i < 22; i += 1) {
    const angle = MathUtil.Hash1(i * 3.3) * Math.PI * 2;
    const distance = (0.18 + MathUtil.Hash1(i * 7.1) * 0.30) * size;
    const radius = (0.012 + MathUtil.Hash1(i * 11.9) * 0.030) * size;
    context.fillStyle = 'rgba(255,255,255,' + (0.20 + MathUtil.Hash1(i * 5.7) * 0.45).toFixed(3) + ')';
    context.beginPath();
    context.arc(size / 2 + Math.cos(angle) * distance, size / 2 + Math.sin(angle) * distance, radius, 0, Math.PI * 2);
    context.fill();
  }
  return canvas;
}

/** 雾片：一大团有絮状边缘的软斑，用来铺地面薄雾 */
function SpriteMistPatch(size) {
  const canvas = MakeCanvas(size);
  if (!canvas) return null;
  const context = canvas.getContext('2d');
  const image = context.createImageData(size, size);
  const data = image.data;
  const half = size / 2;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = (x - half) / half;
      const dy = (y - half) / half;
      const radius = Math.sqrt(dx * dx + dy * dy);
      const wisp = TileFbm(x / size * 4, y / size * 4, 4, 4, 0.6);
      const edge = MathUtil.Clamp01(1 - radius);
      const alpha = MathUtil.Clamp01(Math.pow(edge, 1.9) * (0.35 + wisp * 0.9));
      const index = (y * size + x) * 4;
      data[index] = 255;
      data[index + 1] = 255;
      data[index + 2] = 255;
      data[index + 3] = Math.round(alpha * 255);
    }
  }
  context.putImageData(image, 0, 0);
  return canvas;
}

/** 火焰片：下宽上尖的舌状，叠两层做火堆 */
function SpriteFlame(size) {
  const canvas = MakeCanvas(size);
  if (!canvas) return null;
  const context = canvas.getContext('2d');
  const image = context.createImageData(size, size);
  const data = image.data;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = x / size;
      const v = y / size;
      /* v=0 顶端（尖），v=1 底部（宽） */
      const width = 0.10 + Math.pow(v, 0.75) * 0.40;
      const dx = Math.abs(u - 0.5) / width;
      const flick = TileFbm(u * 5, v * 3, 5, 3, 0.55) * 0.35;
      const body = MathUtil.Clamp01(1 - dx - flick) * MathUtil.Clamp01(v * 3.2) * MathUtil.Clamp01((1 - v) * 4);
      const core = Math.pow(body, 2.4);
      const index = (y * size + x) * 4;
      /* 火芯偏白黄，外焰偏橙红——这是全片唯一允许的暖色梯度 */
      data[index] = 255;
      data[index + 1] = Math.round(MathUtil.Lerp(120, 240, core) );
      data[index + 2] = Math.round(MathUtil.Lerp(40, 190, core * core));
      data[index + 3] = Math.round(MathUtil.Clamp01(body * 1.25) * 255);
    }
  }
  context.putImageData(image, 0, 0);
  return canvas;
}

/* ================================================================== *
 * 二、材质库
 *
 * 反照率取自 Config.Palette，但**最暗的一档统一抬到可读区间**（见 LiftAlbedo 注释）。
 * 抬亮不是"变浅"：焦木仍是画面里最暗的东西，只是从"死黑板"变回"有体积的炭"。
 * ================================================================== */

const AlbedoFloor = {
  /* key → 最低感知亮度（0—1）。没列的按原 Palette 走。 */
  CharredWood: 0.320,
  BrickBurnt: 0.420,
  RockDark: 0.320,
  Rock: 0.360,
  Mud: 0.300,
  Dirt: 0.310,
  Gunmetal: 0.185,
  FabricGray: 0.400,
  FabricOlive: 0.300,
  FabricBlue: 0.280,
  FabricKhaki: 0.260,
  Foliage: 0.290,
  FoliageDead: 0.330,
  BarbedWire: 0.200,
  Fur: 0.290,
  ClothCoarse: 0.300,
  ClothPadded: 0.330,
  Thatch: 0.285,
  Wood: 0.300,
  WoodOld: 0.290,
  StoneWall: 0.300,
  MudWall: 0.330,
  MetalDull: 0.240,
};

/**
 * 冬日冷灰是唯一底色。土坯、木头、锈铁这些天生偏暖的材质必须**往中性冷端拉**，
 * 否则村子会读成暖褐色的黄土高原，和"火光是唯一暖色"直接冲突。
 * 拉多少有讲究：完全拉成灰会失去材质身份，所以只拉一半，留一点土的暖底。
 */
const AlbedoCool = {
  MudWall: 0.24, BrickBurnt: 0.46, Wood: 0.28, WoodOld: 0.32,
  Thatch: 0.32, Straw: 0.30, MetalRust: 0.40, Fur: 0.28,
  CanvasTent: 0.34, Sandbag: 0.36, Dirt: 0.34, Mud: 0.34,
  FabricKhaki: 0.22, Paper: 0.28, PaperWindow: 0.26, CharredWood: 0.45,
};
const CoolGray = 0x8a9099;

function AlbedoOf(key, hex) {
  let value = hex;
  const coolAmount = AlbedoCool[key];
  if (coolAmount !== undefined) {
    /* 只把色相往中性冷端推，亮度靠 LiftAlbedo 单独管 */
    const [r, g, b] = ChannelsOf(value);
    const luma = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    const [cr, cg, cb] = ChannelsOf(CoolGray);
    const cLuma = (0.2126 * cr + 0.7152 * cg + 0.0722 * cb) / 255;
    const scale = luma / Math.max(0.01, cLuma);
    value = MixHex(value, HexOf(cr * scale, cg * scale, cb * scale), coolAmount);
  }
  const floorLevel = AlbedoFloor[key];
  return floorLevel === undefined ? value : LiftAlbedo(value, floorLevel);
}

/**
 * MaterialKey → 外观。`repeat` 单位是"每 UV 单位重复次数"，World 的地形 UV 覆盖整块地，
 * 所以地面用大 repeat，墙面用小 repeat。
 * `roughnessRange` 存在时会用高度场生成粗糙度图，让同一面墙有干湿差别。
 */
const MaterialSpecs = {
  SnowGround: { color: AlbedoOf('SnowGround', Palette.SnowMid), roughness: 0.93, texture: 'Texture_SnowNoise', repeat: 30, normalScale: 0.22 },
  SnowPacked: { color: AlbedoOf('SnowPacked', Palette.SnowTrampled), roughness: 0.82, texture: 'Texture_SnowPacked', repeat: 12, normalScale: 0.34 },
  Ice: { color: AlbedoOf('Ice', Palette.Ice), roughness: 0.22, metalness: 0.04, texture: 'Texture_Ice', repeat: 5, normalScale: 0.32 },
  Dirt: { color: AlbedoOf('Dirt', Palette.Dirt), roughness: 0.97, texture: 'Texture_DirtGrain', repeat: 9, normalScale: 0.45 },
  Mud: { color: AlbedoOf('Mud', Palette.Mud), roughness: 1.0, texture: 'Texture_DirtGrain', repeat: 7, normalScale: 0.5 },
  Gravel: { color: AlbedoOf('Gravel', Palette.Gravel), roughness: 0.95, texture: 'Texture_DirtGrain', repeat: 13, normalScale: 0.55 },
  Rock: { color: AlbedoOf('Rock', Palette.Rock), roughness: 0.88, texture: 'Texture_RockGrain', repeat: 2.2, normalScale: 0.62 },
  RockDark: { color: AlbedoOf('RockDark', Palette.RockDark), roughness: 0.90, texture: 'Texture_RockGrain', repeat: 2.2, normalScale: 0.62 },
  StoneWall: { color: AlbedoOf('StoneWall', Palette.StoneWall), roughness: 0.86, texture: 'Texture_RockGrain', repeat: 3.4, normalScale: 0.38 },
  MudWall: { color: AlbedoOf('MudWall', Palette.MudWall), roughness: 0.95, texture: 'Texture_MudWall', repeat: 3.0, normalScale: 0.30 },
  BrickBurnt: { color: AlbedoOf('BrickBurnt', Palette.BrickBurnt), roughness: 0.93, texture: 'Texture_BrickBurnt', repeat: 2.6, normalScale: 0.28 },
  Wood: { color: AlbedoOf('Wood', Palette.Wood), roughness: 0.80, texture: 'Texture_WoodGrain', repeat: 5.0, normalScale: 0.20 },
  WoodOld: { color: AlbedoOf('WoodOld', Palette.WoodOld), roughness: 0.90, texture: 'Texture_WoodGrain', repeat: 5.0, normalScale: 0.24 },
  CharredWood: { color: AlbedoOf('CharredWood', Palette.CharredWood), roughness: 0.99, texture: 'Texture_CharredPlank', repeat: 3.6, normalScale: 0.20 },
  Thatch: { color: AlbedoOf('Thatch', Palette.Thatch), roughness: 0.98, texture: 'Texture_StrawWeave', repeat: 3.2, normalScale: 0.52 },
  Straw: { color: AlbedoOf('Straw', Palette.Straw), roughness: 0.98, texture: 'Texture_StrawWeave', repeat: 2.6, normalScale: 0.52 },
  Paper: { color: AlbedoOf('Paper', Palette.Paper), roughness: 0.88, texture: 'Texture_PaperGrain', repeat: 1, normalScale: 0.15 },
  PaperWindow: { color: AlbedoOf('PaperWindow', Palette.PaperWindow), roughness: 0.84, texture: 'Texture_PaperGrain', repeat: 1, normalScale: 0.15, transparent: true, opacity: 0.88, side: 'double' },
  ClothCoarse: { color: AlbedoOf('ClothCoarse', Palette.ClothCoarse), roughness: 0.96, texture: 'Texture_ClothWeave', repeat: 3, normalScale: 0.25 },
  ClothPadded: { color: AlbedoOf('ClothPadded', Palette.ClothPadded), roughness: 0.98, texture: 'Texture_ClothWeave', repeat: 1.6, normalScale: 0.32 },
  FabricGray: { color: AlbedoOf('FabricGray', Palette.FabricGray), roughness: 0.95, texture: 'Texture_ClothWeave', repeat: 1.8, normalScale: 0.29 },
  FabricKhaki: { color: AlbedoOf('FabricKhaki', Palette.FabricKhaki), roughness: 0.95, texture: 'Texture_ClothWeave', repeat: 1.8, normalScale: 0.29 },
  FabricBlue: { color: AlbedoOf('FabricBlue', Palette.FabricBlue), roughness: 0.95, texture: 'Texture_ClothWeave', repeat: 1.8, normalScale: 0.29 },
  FabricRed: { color: AlbedoOf('FabricRed', Palette.FabricRed), roughness: 0.90, texture: 'Texture_ClothWeave', repeat: 3, normalScale: 0.21 },
  Fur: { color: AlbedoOf('Fur', Palette.Fur), roughness: 1.0, texture: 'Texture_FurTuft', repeat: 3, normalScale: 0.42 },
  SkinPale: { color: AlbedoOf('SkinPale', Palette.SkinPale), roughness: 0.70 },
  SkinWeathered: { color: AlbedoOf('SkinWeathered', Palette.SkinWeathered), roughness: 0.76 },
  MetalDull: { color: AlbedoOf('MetalDull', Palette.MetalDull), roughness: 0.52, metalness: 0.62 },
  MetalRust: { color: AlbedoOf('MetalRust', Palette.MetalRust), roughness: 0.86, metalness: 0.22, texture: 'Texture_MetalRust', repeat: 3, normalScale: 0.38 },
  Gunmetal: { color: AlbedoOf('Gunmetal', Palette.Gunmetal), roughness: 0.38, metalness: 0.78 },
  Glass: { color: 0x9fb2bd, roughness: 0.08, metalness: 0.10, transparent: true, opacity: 0.32 },
  Water: { color: 0x3b4a56, roughness: 0.12, metalness: 0.24, transparent: true, opacity: 0.84 },
  Sandbag: { color: 0x86795e, roughness: 0.98, texture: 'Texture_ClothWeave', repeat: 1.6, normalScale: 0.42 },
  BarbedWire: { color: AlbedoOf('BarbedWire', Palette.BarbedWire), roughness: 0.58, metalness: 0.52 },
  CanvasTent: { color: 0x7a7460, roughness: 0.96, texture: 'Texture_ClothWeave', repeat: 2.4, normalScale: 0.34 },
  Foliage: { color: AlbedoOf('Foliage', Palette.Foliage), roughness: 0.93, texture: 'Texture_FoliageMask', repeat: 2, normalScale: 0.34, side: 'double' },
  FoliageDead: { color: AlbedoOf('FoliageDead', Palette.FoliageDead), roughness: 0.96, texture: 'Texture_FoliageMask', repeat: 2, normalScale: 0.34, side: 'double' },
};

/* ------------------------------------------------------------------ *
 * 高度雾 shader 注入
 *
 * 替换 three 的四个 fog chunk。所有材质共享同一份 uniform 对象引用，
 * 因此每帧只需要写一次 `fogUniforms.uFogCameraY.value = ...`，全场生效。
 * ------------------------------------------------------------------ */

const FogParsVertexGlsl = [
  '#ifdef USE_FOG',
  '  varying float vFogDepth;',
  '  varying float vFogWorldY;',
  '  varying vec3 vFogView;',
  '  uniform float uFogCameraY;',
  '  uniform vec3 uFogUpView;',
  '#endif',
].join('\n');

const FogVertexGlsl = [
  '#ifdef USE_FOG',
  '  vFogDepth = - mvPosition.z;',
  '  vFogWorldY = uFogCameraY + dot(uFogUpView, mvPosition.xyz);',
  '  vFogView = mvPosition.xyz;',
  '#endif',
].join('\n');

const FogParsFragmentGlsl = [
  '#ifdef USE_FOG',
  '  varying float vFogDepth;',
  '  varying float vFogWorldY;',
  '  varying vec3 vFogView;',
  '  uniform float uFogDensity;',
  '  uniform float uFogFalloff;',
  '  uniform float uFogBaseY;',
  '  uniform float uFogCameraY;',
  '  uniform vec3 uFogGround;',
  '  uniform vec3 uFogSky;',
  '  uniform vec3 uFogSun;',
  '  uniform float uFogInscatter;',
  '  uniform vec3 uFogSunView;',
  '  vec3 BsFogColor(float worldY, vec3 viewDir) {',
  '    float dirY = clamp((worldY - uFogCameraY) / max(vFogDepth, 0.001), -1.0, 1.0);',
  '    vec3 tint = mix(uFogGround, uFogSky, smoothstep(-0.30, 0.62, dirY));',
  '    float toSun = max(dot(viewDir, uFogSunView), 0.0);',
  '    return mix(tint, uFogSun, pow(toSun, 5.0) * uFogInscatter);',
  '  }',
  '  float BsFogFactor(float worldY, float depth) {',
  '    float atCamera = exp(-max(uFogCameraY - uFogBaseY, 0.0) * uFogFalloff);',
  '    float atFragment = exp(-max(worldY - uFogBaseY, 0.0) * uFogFalloff);',
  '    float column = (atCamera + atFragment) * 0.5;',
  '    float term = uFogDensity * column * depth;',
  '    return clamp(1.0 - exp(-term * term), 0.0, 1.0);',
  '  }',
  '#endif',
].join('\n');

const FogFragmentGlsl = [
  '#ifdef USE_FOG',
  '  {',
  '    float bsFog = BsFogFactor(vFogWorldY, vFogDepth);',
  '    vec3 bsFogTint = BsFogColor(vFogWorldY, normalize(vFogView));',
  '    gl_FragColor.rgb = mix(gl_FragColor.rgb, bsFogTint, bsFog);',
  '  }',
  '#endif',
].join('\n');

function CreateFogUniforms(three) {
  const Three = three || THREE;
  return {
    uFogDensity: { value: 0.0135 },
    uFogFalloff: { value: 0.085 },
    uFogBaseY: { value: -2.0 },
    uFogGround: { value: new Three.Color(0xb3bfca) },
    uFogSky: { value: new Three.Color(0x9fb0c2) },
    uFogSun: { value: new Three.Color(0xd6d2c8) },
    uFogInscatter: { value: 0.35 },
    uFogCameraY: { value: 1.7 },
    uFogUpView: { value: new Three.Vector3(0, 1, 0) },
    uFogSunView: { value: new Three.Vector3(0, 1, 0) },
  };
}

/** 给任意 three 内置材质接上高度雾。失败时静默退回 three 原生雾，绝不抛错。 */
function PatchMaterialFog(material, fogUniforms) {
  if (!material || material.userData.bsFogPatched) return material;
  material.userData.bsFogPatched = true;
  const previous = material.onBeforeCompile;
  material.onBeforeCompile = function PatchFog(shader, renderer) {
    if (typeof previous === 'function') previous.call(this, shader, renderer);
    if (shader.vertexShader.indexOf('#include <fog_pars_vertex>') < 0) return;
    Object.assign(shader.uniforms, fogUniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <fog_pars_vertex>', FogParsVertexGlsl)
      .replace('#include <fog_vertex>', FogVertexGlsl);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <fog_pars_fragment>', FogParsFragmentGlsl)
      .replace('#include <fog_fragment>', FogFragmentGlsl);
  };
  material.customProgramCacheKey = function CacheKey() { return 'BsHeightFogV1'; };
  material.needsUpdate = true;
  return material;
}

/**
 * 共享材质库。World / Character 必须从这里取材质，保证 draw call 与色调统一。
 * 独立导出，便于单测。
 */
export function CreateMaterialLibrary(three, fogUniforms) {
  const Three = three || THREE;
  const fog = fogUniforms || CreateFogUniforms(Three);
  const materials = new Map();
  const variants = new Map();
  const textures = new Map();
  const fields = new Map();
  const spriteCanvasBuilders = {
    Texture_SoftDot: () => SpriteSoftDot(64),
    Texture_SnowFlake: () => SpriteSnowFlake(64),
    Texture_SmokePuff: () => SpriteSmokePuff(96),
    Texture_Footprint: () => SpriteFootprint(64),
    Texture_ImpactMark: () => SpriteImpactMark(64),
    Texture_MistPatch: () => SpriteMistPatch(128),
    Texture_Flame: () => SpriteFlame(64),
  };

  function GetField(key) {
    if (fields.has(key)) return fields.get(key);
    const recipe = FieldRecipes[key];
    if (!recipe) { fields.set(key, null); return null; }
    const field = BuildHeightField(recipe.size, recipe.Field);
    fields.set(key, { field: field, size: recipe.size, recipe: recipe });
    return fields.get(key);
  }

  function GetTexture(key) {
    if (textures.has(key)) return textures.get(key);
    let texture = null;
    const spriteBuilder = spriteCanvasBuilders[key];
    if (spriteBuilder) {
      texture = WrapTexture(spriteBuilder(), THREE.SRGBColorSpace);
      if (texture) { texture.wrapS = Three.ClampToEdgeWrapping; texture.wrapT = Three.ClampToEdgeWrapping; }
    } else if (key.length > 6 && key.slice(-6) === 'Normal') {
      const source = GetField(key.slice(0, -6));
      if (source) texture = WrapTexture(FieldToNormalCanvas(source.field, source.size, source.recipe.normalStrength), THREE.NoColorSpace);
    } else {
      const source = GetField(key);
      if (source) texture = WrapTexture(FieldToAlbedoTexture(source.field, source.size, source.recipe.albedo), THREE.SRGBColorSpace);
    }
    textures.set(key, texture);
    return texture;
  }

  function CloneForRepeat(texture, repeat) {
    if (!texture) return null;
    const cloned = texture.clone();
    cloned.wrapS = Three.RepeatWrapping;
    cloned.wrapT = Three.RepeatWrapping;
    cloned.repeat.set(repeat || 1, repeat || 1);
    cloned.colorSpace = texture.colorSpace;
    cloned.anisotropy = texture.anisotropy;
    cloned.needsUpdate = true;
    return cloned;
  }

  function Build(key, overrides) {
    const spec = MaterialSpecs[key] || MaterialSpecs.MudWall;
    const params = {
      color: new Three.Color(spec.color),
      roughness: spec.roughness === undefined ? 0.9 : spec.roughness,
      metalness: spec.metalness === undefined ? 0.02 : spec.metalness,
    };
    if (spec.transparent) { params.transparent = true; params.opacity = spec.opacity === undefined ? 1 : spec.opacity; }
    if (spec.side === 'double') params.side = Three.DoubleSide;
    const material = new Three.MeshStandardMaterial(params);
    material.name = 'Material_' + key;
    if (spec.texture) {
      const albedo = CloneForRepeat(GetTexture(spec.texture), spec.repeat);
      if (albedo) material.map = albedo;
      const normal = CloneForRepeat(GetTexture(spec.texture + 'Normal'), spec.repeat);
      if (normal) {
        material.normalMap = normal;
        const scale = spec.normalScale === undefined ? 0.8 : spec.normalScale;
        material.normalScale = new Three.Vector2(scale, scale);
      }
    }
    if (overrides) {
      for (const name of Object.keys(overrides)) {
        if (name === 'color') material.color.set(overrides.color);
        else if (name === 'normalScale' && typeof overrides.normalScale === 'number') {
          material.normalScale = new Three.Vector2(overrides.normalScale, overrides.normalScale);
        } else material[name] = overrides[name];
      }
    }
    PatchMaterialFog(material, fog);
    return material;
  }

  return {
    keys: Object.keys(MaterialSpecs),
    fogUniforms: fog,
    GetMaterial(key, overrides) {
      if (overrides) return Build(key, overrides);
      if (!materials.has(key)) materials.set(key, Build(key, null));
      return materials.get(key);
    },
    MakeVariant(key, variantId, overrides) {
      const cacheKey = key + '#' + variantId;
      if (!variants.has(cacheKey)) variants.set(cacheKey, Build(key, overrides));
      return variants.get(cacheKey);
    },
    RegisterMaterial(key, material) {
      PatchMaterialFog(material, fog);
      materials.set(key, material);
      return material;
    },
    GetTexture: GetTexture,
    Dispose() {
      const DisposeMaterial = (material) => {
        if (material.map) material.map.dispose();
        if (material.normalMap) material.normalMap.dispose();
        if (material.roughnessMap) material.roughnessMap.dispose();
        material.dispose();
      };
      for (const material of materials.values()) DisposeMaterial(material);
      for (const material of variants.values()) DisposeMaterial(material);
      for (const texture of textures.values()) { if (texture) texture.dispose(); }
      materials.clear();
      variants.clear();
      textures.clear();
      fields.clear();
    },
  };
}

/* ================================================================== *
 * 三、天空穹顶
 *
 * 冬日阴天不是"一块灰布"：它有云的疏密、有太阳位置透出来的一点亮、
 * 有靠近地平线越来越厚的霾。这三样都做出来，天空才不像 clear color。
 * 灰度渐变最容易出色带，所以最后叠一层 dither。
 * ================================================================== */

const SkyVertexShader = [
  'varying vec3 vSkyDirection;',
  'void main() {',
  '  vec4 worldPosition = modelMatrix * vec4(position, 1.0);',
  '  vSkyDirection = worldPosition.xyz - cameraPosition;',
  '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
  '  gl_Position.z = gl_Position.w;',
  '}',
].join('\n');

const SkyFragmentShader = [
  'uniform vec3 uZenith;',
  'uniform vec3 uHorizon;',
  'uniform vec3 uHaze;',
  'uniform float uHazeAmount;',
  'uniform vec3 uCloudDark;',
  'uniform vec3 uCloudLight;',
  'uniform float uCloudCover;',
  'uniform float uCloudSharpness;',
  'uniform vec2 uCloudOffset;',
  'uniform vec3 uSunDirection;',
  'uniform vec3 uSunColor;',
  'uniform float uSunStrength;',
  'uniform float uSunHalo;',
  'uniform float uStars;',
  'varying vec3 vSkyDirection;',

  'float SkyHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }',
  'float SkyNoise(vec2 p) {',
  '  vec2 i = floor(p); vec2 f = fract(p);',
  '  vec2 u = f * f * (3.0 - 2.0 * f);',
  '  return mix(mix(SkyHash(i), SkyHash(i + vec2(1.0, 0.0)), u.x),',
  '             mix(SkyHash(i + vec2(0.0, 1.0)), SkyHash(i + vec2(1.0, 1.0)), u.x), u.y);',
  '}',
  'float SkyFbm(vec2 p) {',
  '  float sum = 0.0; float amplitude = 0.5;',
  '  for (int i = 0; i < 5; i++) { sum += SkyNoise(p) * amplitude; p *= 2.07; amplitude *= 0.52; }',
  '  return sum;',
  '}',

  'void main() {',
  '  vec3 dir = normalize(vSkyDirection);',
  '  float up = clamp(dir.y * 0.5 + 0.5, 0.0, 1.0);',
  '  vec3 color = mix(uHorizon, uZenith, pow(up, 0.85));',

  /* 云：把方向投到一个高空平面上，越靠地平线云被压得越扁——这是真实的透视 */
  '  float lift = max(dir.y, 0.045);',
  '  vec2 cloudUv = dir.xz / lift * 2.4 + uCloudOffset;',
  '  float shape = SkyFbm(cloudUv);',
  '  float edge = mix(0.55, 0.06, clamp(uCloudCover, 0.0, 1.0));',
  '  float cover = smoothstep(edge, edge + uCloudSharpness, shape);',
  '  float detail = SkyFbm(cloudUv * 2.3 + vec2(7.3, 2.1));',
  '  vec3 cloudColor = mix(uCloudDark, uCloudLight, clamp(detail * 1.35, 0.0, 1.0));',
  /* 地平线附近云层堆叠，视觉上必须更密更暗 */
  '  float horizonPack = smoothstep(0.0, 0.32, dir.y);',
  '  color = mix(color, cloudColor, cover * mix(0.35, 1.0, horizonPack));',

  /* 太阳：被云挡住时只剩一团发白的亮斑，这正是华北冬天的太阳 */
  '  float toSun = max(dot(dir, normalize(uSunDirection)), 0.0);',
  '  float veil = 1.0 - cover * 0.72;',
  '  color += uSunColor * pow(toSun, 220.0) * uSunStrength * veil;',
  '  color += uSunColor * pow(toSun, 5.0) * uSunHalo * veil;',
  '  color += uSunColor * pow(toSun, 1.4) * uSunHalo * 0.22;',

  /* 星：只在第三幕深夜露出一点，且要被云吃掉 */
  '  if (uStars > 0.001) {',
  '    vec2 starUv = dir.xz / lift * 6.0;',
  '    float star = SkyHash(floor(starUv * 30.0));',
  '    float twinkle = step(0.9965, star) * clamp(dir.y * 2.4, 0.0, 1.0);',
  '    color += vec3(0.62, 0.70, 0.85) * twinkle * uStars * (1.0 - cover);',
  '  }',

  /* 地平线霾：与场景雾同色，天地才能焊在一起 */
  '  float band = pow(clamp(1.0 - abs(dir.y), 0.0, 1.0), 2.6);',
  '  color = mix(color, uHaze, band * uHazeAmount);',

  /* 抗色带 */
  '  color += (SkyHash(gl_FragCoord.xy) - 0.5) * 0.0055;',
  '  gl_FragColor = vec4(color, 1.0);',
  '}',
].join('\n');

/* ================================================================== *
 * 四、远山：三层视差剪影
 *
 * 这是"景深感天际线"最便宜也最有效的一招。三层不同半径、不同高度、
 * 不同雾化程度的山脊环，随相机以不同比例平移 → 走路时它们真的会错开。
 * 不写深度、不做深度测试，永远垫在最底下；地形照常盖住它们。
 * ================================================================== */

const RidgeVertexShader = [
  'varying float vRidgeHeight;',
  'varying float vRidgeSnow;',
  'varying float vRidgeWorldY;',
  'attribute float aSnow;',
  'void main() {',
  '  vRidgeHeight = uv.y;',
  '  vRidgeSnow = aSnow;',
  '  vRidgeWorldY = position.y;',
  '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
  '}',
].join('\n');

const RidgeFragmentShader = [
  'uniform vec3 uBase;',
  'uniform vec3 uTop;',
  'uniform vec3 uSnow;',
  'uniform float uSnowAmount;',
  'uniform float uFogDensity;',
  'uniform float uFogFalloff;',
  'uniform float uFogBaseY;',
  'uniform float uFogCameraY;',
  'uniform vec3 uFogGround;',
  'uniform vec3 uFogSky;',
  'uniform float uDistance;',
  'varying float vRidgeHeight;',
  'varying float vRidgeSnow;',
  'varying float vRidgeWorldY;',
  'void main() {',
  '  vec3 color = mix(uBase, uTop, pow(clamp(vRidgeHeight, 0.0, 1.0), 0.75));',
  /* 山脊线附近的积雪：只在高处、且只在朝上的坡面（用顶点烘好的 aSnow 近似） */
  '  float snowMask = smoothstep(0.55, 0.96, vRidgeHeight) * vRidgeSnow * uSnowAmount;',
  '  color = mix(color, uSnow, snowMask);',
  /* 远山吃**同一套高度雾**：山脚埋进雾里（所以看不到那条悬空的底边），
     山顶因为高出雾层而留下来。暴雪时整座山被白毛风吃掉——这是对的，
     不是"山消失了"，是你根本看不到三百米外。 */
  '  float atCamera = exp(-max(uFogCameraY - uFogBaseY, 0.0) * uFogFalloff);',
  '  float atFragment = exp(-max(vRidgeWorldY - uFogBaseY, 0.0) * uFogFalloff);',
  '  float term = uFogDensity * (atCamera + atFragment) * 0.5 * uDistance;',
  '  float fogAmount = clamp(1.0 - exp(-term * term), 0.0, 1.0);',
  '  float dirY = clamp((vRidgeWorldY - uFogCameraY) / max(uDistance, 0.001), -1.0, 1.0);',
  '  vec3 fogTint = mix(uFogGround, uFogSky, smoothstep(-0.30, 0.62, dirY));',
  '  color = mix(color, fogTint, fogAmount);',
  '  gl_FragColor = vec4(color, 1.0);',
  '}',
].join('\n');

/**
 * 造一圈山脊。radius 决定视差与遮挡关系，height 决定张角。
 * 顶点烘一个 aSnow（局部坡面朝上程度），让雪线不是一条水平直线。
 */
function BuildRidgeGeometry(three, options) {
  const segments = options.segments || 160;
  const radius = options.radius;
  const height = options.height;
  const seed = options.seed || 0;
  const baseY = options.baseY === undefined ? -60 : options.baseY;
  const positions = new Float32Array((segments + 1) * 2 * 3);
  const normals = new Float32Array((segments + 1) * 2 * 3);
  const uvs = new Float32Array((segments + 1) * 2 * 2);
  const snow = new Float32Array((segments + 1) * 2);
  const indices = [];
  const profile = new Float32Array(segments + 1);
  for (let i = 0; i <= segments; i += 1) {
    const turn = i / segments;
    /* 用可平铺 fbm 采环，保证首尾接得上 */
    /* 太行山不是丘陵：大块山体 + 尖锐主峰 + 碎裂的次级齿口。
       ridge 噪声取幂是为了把圆钝的峰"掐尖"，天际线才有骨头。 */
    const bulk = TileFbm(turn * 5 + seed, seed * 0.37, 5, 3, 0.50);
    const peaks = Math.pow(TileRidge(turn * 11 + seed * 1.7, seed * 0.11 + 3, 11, 3), 1.7);
    const jag = Math.pow(TileRidge(turn * 23 + seed * 2.3, seed * 0.23 + 7, 23, 2), 2.4);
    profile[i] = MathUtil.Clamp01(bulk * 0.40 + peaks * 0.42 + jag * 0.18);
  }
  for (let i = 0; i <= segments; i += 1) {
    const angle = (i / segments) * Math.PI * 2;
    const x = Math.sin(angle) * radius;
    const z = Math.cos(angle) * radius;
    const top = baseY + height * (0.12 + profile[i] * 0.88);
    const prev = profile[(i - 1 + segments) % segments];
    const next = profile[(i + 1) % segments];
    /* 坡度小 = 顶面平 = 挂得住雪 */
    const slope = Math.abs(next - prev) * segments / 40;
    const snowValue = MathUtil.Clamp01(1 - slope) * MathUtil.Clamp01(profile[i] * 1.4);
    const base = i * 6;
    positions[base] = x; positions[base + 1] = baseY; positions[base + 2] = z;
    positions[base + 3] = x; positions[base + 4] = top; positions[base + 5] = z;
    /* 法线朝环内（朝相机）。着色器用不到，但 three 会为 ShaderMaterial 声明该属性，
       声明了却不提供 buffer 会让整次 draw 被丢弃——这条曾经让远山整层消失。 */
    const inwardX = -Math.sin(angle);
    const inwardZ = -Math.cos(angle);
    normals[base] = inwardX; normals[base + 1] = 0; normals[base + 2] = inwardZ;
    normals[base + 3] = inwardX; normals[base + 4] = 0; normals[base + 5] = inwardZ;
    const uvBase = i * 4;
    uvs[uvBase] = i / segments; uvs[uvBase + 1] = 0;
    uvs[uvBase + 2] = i / segments; uvs[uvBase + 3] = 1;
    snow[i * 2] = 0;
    snow[i * 2 + 1] = snowValue;
    if (i < segments) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const geometry = new three.BufferGeometry();
  geometry.setAttribute('position', new three.BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new three.BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new three.BufferAttribute(uvs, 2));
  geometry.setAttribute('aSnow', new three.BufferAttribute(snow, 1));
  geometry.setIndex(indices);
  geometry.boundingSphere = new three.Sphere(new three.Vector3(0, 0, 0), radius * 1.6);
  return geometry;
}

function CreateRidgeLayers(three, parent) {
  const specs = [
    { radius: 150, height: 104, seed: 3.1, parallax: 0.74, order: -7 },
    { radius: 236, height: 152, seed: 11.7, parallax: 0.86, order: -8 },
    { radius: 296, height: 200, seed: 23.9, parallax: 0.94, order: -9 },
  ];
  const layers = specs.map((spec, index) => {
    const geometry = BuildRidgeGeometry(three, {
      radius: spec.radius, height: spec.height, seed: spec.seed,
      segments: index === 0 ? 190 : 140, baseY: -60,
    });
    const material = new three.ShaderMaterial({
      uniforms: {
        uBase: { value: new three.Color(0x6d7c8c) },
        uTop: { value: new three.Color(0x8b99a8) },
        uSnow: { value: new three.Color(0xc6d0da) },
        uSnowAmount: { value: 0.6 },
        uFogDensity: { value: 0.014 },
        uFogFalloff: { value: 0.09 },
        uFogBaseY: { value: -2 },
        uFogCameraY: { value: 1.7 },
        uFogGround: { value: new three.Color(0xb3bfca) },
        uFogSky: { value: new three.Color(0x9fb0c2) },
        uDistance: { value: spec.radius },
      },
      vertexShader: RidgeVertexShader,
      fragmentShader: RidgeFragmentShader,
      side: three.DoubleSide,
      depthWrite: false,
      depthTest: true,
      fog: false,
    });
    const mesh = new three.Mesh(geometry, material);
    mesh.name = 'MeshRidgeLayer' + index;
    mesh.frustumCulled = false;
    mesh.renderOrder = spec.order;
    mesh.matrixAutoUpdate = true;
    parent.add(mesh);
    return { mesh: mesh, material: material, parallax: spec.parallax };
  });

  return {
    layers: layers,
    /** 越近的层跟得越松 → 走路时层与层之间真的错开 */
    Follow(cameraPosition) {
      for (let i = 0; i < layers.length; i += 1) {
        const layer = layers[i];
        layer.mesh.position.set(
          cameraPosition.x * layer.parallax,
          0,
          cameraPosition.z * layer.parallax,
        );
      }
    },
    ApplyMood(nearColor, farColor, snowColor, snowAmount) {
      for (let i = 0; i < layers.length; i += 1) {
        const t = i / Math.max(1, layers.length - 1);
        layers[i].material.uniforms.uBase.value.copy(nearColor).lerp(farColor, t * 0.85 + 0.15);
        layers[i].material.uniforms.uTop.value.copy(nearColor).lerp(farColor, t * 0.95);
        layers[i].material.uniforms.uSnow.value.copy(snowColor).lerp(farColor, t * 0.55);
        layers[i].material.uniforms.uSnowAmount.value = snowAmount * (1 - t * 0.35);
      }
    },
    SetVisible(visible) {
      for (let i = 0; i < layers.length; i += 1) layers[i].mesh.visible = visible;
    },
    SyncFog(fogUniforms) {
      for (let i = 0; i < layers.length; i += 1) {
        const target = layers[i].material.uniforms;
        target.uFogDensity.value = fogUniforms.uFogDensity.value;
        target.uFogFalloff.value = fogUniforms.uFogFalloff.value;
        target.uFogBaseY.value = fogUniforms.uFogBaseY.value;
        target.uFogCameraY.value = fogUniforms.uFogCameraY.value;
        target.uFogGround.value.copy(fogUniforms.uFogGround.value);
        target.uFogSky.value.copy(fogUniforms.uFogSky.value);
      }
    },
    Dispose() {
      for (let i = 0; i < layers.length; i += 1) {
        layers[i].mesh.geometry.dispose();
        layers[i].material.dispose();
        if (layers[i].mesh.parent) layers[i].mesh.parent.remove(layers[i].mesh);
      }
    },
  };
}

/* ================================================================== *
 * 五、地面薄雾（体积感的便宜做法）
 *
 * 一组贴地的大软片，跟相机走、随风漂、慢慢自转。近处淡出避免穿帮，
 * 远处被高度雾吃掉。第一幕清晨这层是主角，第三幕暴雪时它变成翻滚的雪雾。
 * 一个 InstancedMesh = 1 个 draw call。
 * ================================================================== */

/**
 * 雾片是**面向相机的横幅**，不是贴地的水平片。
 * 水平片从 1.7 米的视高看过去几乎是一条线，等于白画；
 * 面向相机的宽扁软片才读得出"雾在地面上淌"。
 */
const MistVertexShader = [
  'attribute float aSeed;',
  'attribute float aScale;',
  'attribute float aHeight;',
  'uniform float uTime;',
  'uniform vec2 uDrift;',
  'uniform float uSpan;',
  'uniform vec3 uCameraPosition;',
  'varying vec2 vMistUv;',
  'varying float vMistFade;',
  'varying float vMistSeed;',
  'void main() {',
  '  vMistUv = uv;',
  '  vMistSeed = aSeed;',
  /* 以相机为中心的环绕格：飘出去就从另一侧绕回来，永远不会"走出雾区" */
  '  vec2 cell = vec2(aSeed * 37.13, fract(aSeed * 91.71));',
  '  vec2 drift = uDrift * uTime * (0.35 + aSeed * 0.4);',
  '  vec2 origin = fract(cell + drift / uSpan) * uSpan - uSpan * 0.5;',
  '  vec3 world = vec3(uCameraPosition.x + origin.x, aHeight, uCameraPosition.z + origin.y);',
  '  vec4 center = viewMatrix * vec4(world, 1.0);',
  '  float breathe = 1.0 + sin(uTime * 0.22 + aSeed * 6.283) * 0.12;',
  /* 宽而扁：雾条的高宽比大约 1:3.2，横着铺开才像雾带 */
  '  center.x += position.x * aScale * breathe;',
  '  center.y += position.y * aScale * 0.31 * breathe;',
  '  float depth = -center.z;',
  '  vMistFade = smoothstep(2.5, 11.0, depth) * (1.0 - smoothstep(uSpan * 0.30, uSpan * 0.50, depth));',
  '  gl_Position = projectionMatrix * center;',
  '}',
].join('\n');

const MistFragmentShader = [
  'uniform sampler2D uSprite;',
  'uniform vec3 uColor;',
  'uniform float uOpacity;',
  'varying vec2 vMistUv;',
  'varying float vMistFade;',
  'varying float vMistSeed;',
  'void main() {',
  '  float mask = texture2D(uSprite, vMistUv).a;',
  '  float alpha = mask * vMistFade * uOpacity * (0.55 + vMistSeed * 0.6);',
  '  if (alpha < 0.004) discard;',
  '  gl_FragColor = vec4(uColor, alpha);',
  '}',
].join('\n');

function CreateGroundMist(three, parent, sprite, capacity) {
  const plane = new three.PlaneGeometry(1, 1);
  const geometry = new three.InstancedBufferGeometry();
  geometry.index = plane.index;
  geometry.attributes.position = plane.attributes.position;
  geometry.attributes.uv = plane.attributes.uv;
  geometry.attributes.normal = plane.attributes.normal;
  const seeds = new Float32Array(capacity);
  const scales = new Float32Array(capacity);
  const heights = new Float32Array(capacity);
  for (let i = 0; i < capacity; i += 1) {
    seeds[i] = MathUtil.Hash1(i * 2.71 + 0.3);
    scales[i] = 12 + MathUtil.Hash1(i * 5.13) * 22;
    heights[i] = 0.35 + MathUtil.Hash1(i * 9.37) * 1.5;
  }
  geometry.setAttribute('aSeed', new three.InstancedBufferAttribute(seeds, 1));
  geometry.setAttribute('aScale', new three.InstancedBufferAttribute(scales, 1));
  geometry.setAttribute('aHeight', new three.InstancedBufferAttribute(heights, 1));
  geometry.instanceCount = capacity;
  geometry.boundingSphere = new three.Sphere(new three.Vector3(), 400);

  const material = new three.ShaderMaterial({
    uniforms: {
      uSprite: { value: sprite },
      uColor: { value: new three.Color(0xb6c2ce) },
      uOpacity: { value: 0.30 },
      uTime: { value: 0 },
      uDrift: { value: new three.Vector2(0.4, 0.2) },
      uSpan: { value: 72 },
      uCameraPosition: { value: new three.Vector3() },
    },
    vertexShader: MistVertexShader,
    fragmentShader: MistFragmentShader,
    transparent: true,
    depthWrite: false,
    side: three.DoubleSide,
    fog: false,
  });
  const mesh = new three.Mesh(geometry, material);
  mesh.name = 'InstancedGroundMist';
  mesh.frustumCulled = false;
  mesh.renderOrder = 3;
  parent.add(mesh);

  return {
    mesh: mesh,
    material: material,
    capacity: capacity,
    SetCount(count) { geometry.instanceCount = Math.max(0, Math.min(capacity, count | 0)); },
    Update(dt, elapsed, cameraPosition, windX, windZ) {
      material.uniforms.uTime.value = elapsed;
      material.uniforms.uCameraPosition.value.copy(cameraPosition);
      material.uniforms.uDrift.value.set(windX, windZ);
    },
    ApplyMood(color, opacity) {
      material.uniforms.uColor.value.copy(color);
      material.uniforms.uOpacity.value = opacity;
      mesh.visible = opacity > 0.005;
    },
    Dispose() {
      plane.dispose();
      geometry.dispose();
      material.dispose();
      if (mesh.parent) mesh.parent.remove(mesh);
    },
  };
}

/* ================================================================== *
 * 六、飘雪：近景大片 + 远景细密 + 暴雪拉丝
 *
 * 三套系统共用一个"随相机环绕"的位置更新，风向统一由 Art 的 weather 决定。
 * 近景片大、稀、有摆动和自转感；远景细、密、几乎只是空气里的颗粒；
 * 暴雪时第三套"拉丝"启动——被风扯成横线的雪，是风雪垭口的签名画面。
 * ================================================================== */

const SnowVertexShader = [
  'attribute float aSize;',
  'attribute float aAlpha;',
  'attribute float aSeed;',
  'uniform float uPixelScale;',
  'uniform float uTime;',
  'uniform float uSway;',
  'uniform float uFogCameraY;',
  'uniform vec3 uFogUpView;',
  'varying float vSnowAlpha;',
  'varying float vFogDepth;',
  'varying float vFogWorldY;',
  'varying vec3 vFogView;',
  'void main() {',
  '  vSnowAlpha = aAlpha;',
  '  vec3 shifted = position;',
  '  shifted.x += sin(uTime * 1.7 + aSeed * 6.283) * uSway;',
  '  shifted.z += cos(uTime * 1.31 + aSeed * 4.11) * uSway;',
  '  vec4 mv = modelViewMatrix * vec4(shifted, 1.0);',
  '  vFogDepth = -mv.z;',
  '  vFogWorldY = uFogCameraY + dot(uFogUpView, mv.xyz);',
  '  vFogView = mv.xyz;',
  '  gl_PointSize = max(1.0, aSize * uPixelScale / max(-mv.z, 0.35));',
  '  gl_Position = projectionMatrix * mv;',
  '}',
].join('\n');

const SnowFragmentShader = [
  'uniform sampler2D uSprite;',
  'uniform vec3 uColor;',
  'uniform float uFogDensity;',
  'uniform float uFogFalloff;',
  'uniform float uFogBaseY;',
  'uniform float uFogCameraY;',
  'uniform vec3 uFogGround;',
  'uniform vec3 uFogSky;',
  'varying float vSnowAlpha;',
  'varying float vFogDepth;',
  'varying float vFogWorldY;',
  'varying vec3 vFogView;',
  'void main() {',
  '  vec4 sprite = texture2D(uSprite, gl_PointCoord);',
  '  float alpha = sprite.a * vSnowAlpha;',
  '  if (alpha < 0.012) discard;',
  '  float atCamera = exp(-max(uFogCameraY - uFogBaseY, 0.0) * uFogFalloff);',
  '  float atFragment = exp(-max(vFogWorldY - uFogBaseY, 0.0) * uFogFalloff);',
  '  float term = uFogDensity * (atCamera + atFragment) * 0.5 * vFogDepth;',
  '  float fogAmount = clamp(1.0 - exp(-term * term), 0.0, 1.0);',
  '  float dirY = clamp((vFogWorldY - uFogCameraY) / max(vFogDepth, 0.001), -1.0, 1.0);',
  '  vec3 fogTint = mix(uFogGround, uFogSky, smoothstep(-0.30, 0.62, dirY));',
  /* 雪片本来就是白的，远处不该变黑；用雾色替换而不是压暗 */
  '  vec3 color = mix(uColor, fogTint, fogAmount * 0.85);',
  '  gl_FragColor = vec4(color, alpha * (1.0 - fogAmount * 0.55));',
  '}',
].join('\n');

function CreateSnowField(three, parent, options) {
  const capacity = options.capacity;
  const span = options.span;
  const ceiling = options.ceiling;
  const positions = new Float32Array(capacity * 3);
  const sizes = new Float32Array(capacity);
  const alphas = new Float32Array(capacity);
  const seeds = new Float32Array(capacity);
  for (let i = 0; i < capacity; i += 1) {
    positions[i * 3] = (MathUtil.Hash1(i * 1.7 + options.seed) - 0.5) * span;
    positions[i * 3 + 1] = MathUtil.Hash1(i * 3.1 + options.seed) * ceiling;
    positions[i * 3 + 2] = (MathUtil.Hash1(i * 5.3 + options.seed) - 0.5) * span;
    sizes[i] = options.sizeMin + MathUtil.Hash1(i * 7.7 + options.seed) * (options.sizeMax - options.sizeMin);
    alphas[i] = options.alphaMin + MathUtil.Hash1(i * 11.3 + options.seed) * (options.alphaMax - options.alphaMin);
    seeds[i] = MathUtil.Hash1(i * 13.9 + options.seed);
  }
  const geometry = new three.BufferGeometry();
  geometry.setAttribute('position', new three.BufferAttribute(positions, 3));
  geometry.setAttribute('aSize', new three.BufferAttribute(sizes, 1));
  geometry.setAttribute('aAlpha', new three.BufferAttribute(alphas, 1));
  geometry.setAttribute('aSeed', new three.BufferAttribute(seeds, 1));
  geometry.boundingSphere = new three.Sphere(new three.Vector3(), span);
  geometry.setDrawRange(0, capacity);

  const material = new three.ShaderMaterial({
    uniforms: {
      uSprite: { value: options.sprite },
      uColor: { value: new three.Color(0xeaf0f6) },
      uPixelScale: { value: 400 },
      uTime: { value: 0 },
      uSway: { value: options.sway },
      uFogDensity: { value: 0.013 },
      uFogFalloff: { value: 0.085 },
      uFogBaseY: { value: -2 },
      uFogCameraY: { value: 1.7 },
      uFogUpView: { value: new three.Vector3(0, 1, 0) },
      uFogGround: { value: new three.Color(0xb3bfca) },
      uFogSky: { value: new three.Color(0x9fb0c2) },
    },
    vertexShader: SnowVertexShader,
    fragmentShader: SnowFragmentShader,
    transparent: true,
    depthWrite: false,
    fog: false,
  });
  const points = new three.Points(geometry, material);
  points.name = options.name;
  points.frustumCulled = false;
  points.renderOrder = options.renderOrder;
  parent.add(points);

  let activeCount = capacity;
  const half = span * 0.5;

  return {
    object: points,
    material: material,
    capacity: capacity,
    SetCount(count) {
      activeCount = Math.max(0, Math.min(capacity, count | 0));
      geometry.setDrawRange(0, activeCount);
      points.visible = activeCount > 0;
    },
    Update(dt, elapsed, cameraPosition, windX, windZ, fallSpeed, alphaScale) {
      material.uniforms.uTime.value = elapsed;
      /* 整块雪区按 span 对齐跟随相机，粒子只在局部坐标里循环 */
      points.position.set(
        Math.round(cameraPosition.x / span) * span,
        0,
        Math.round(cameraPosition.z / span) * span,
      );
      for (let i = 0; i < activeCount; i += 1) {
        const base = i * 3;
        positions[base] += windX * dt;
        positions[base + 1] -= fallSpeed * (0.6 + seeds[i] * 0.8) * dt;
        positions[base + 2] += windZ * dt;
        if (positions[base + 1] < -3) {
          positions[base + 1] = ceiling;
          positions[base] = (MathUtil.Hash1(elapsed * 7.1 + i) - 0.5) * span;
          positions[base + 2] = (MathUtil.Hash1(elapsed * 11.3 + i) - 0.5) * span;
        }
        const localX = positions[base] + points.position.x - cameraPosition.x;
        const localZ = positions[base + 2] + points.position.z - cameraPosition.z;
        if (localX > half) positions[base] -= span;
        else if (localX < -half) positions[base] += span;
        if (localZ > half) positions[base + 2] -= span;
        else if (localZ < -half) positions[base + 2] += span;
        alphas[i] = (options.alphaMin + seeds[i] * (options.alphaMax - options.alphaMin)) * alphaScale;
      }
      geometry.attributes.position.needsUpdate = true;
      geometry.attributes.aAlpha.needsUpdate = true;
    },
    SyncFog(fogUniforms, pixelScale) {
      const target = material.uniforms;
      target.uFogDensity.value = fogUniforms.uFogDensity.value;
      target.uFogFalloff.value = fogUniforms.uFogFalloff.value;
      target.uFogBaseY.value = fogUniforms.uFogBaseY.value;
      target.uFogCameraY.value = fogUniforms.uFogCameraY.value;
      target.uFogUpView.value.copy(fogUniforms.uFogUpView.value);
      target.uFogGround.value.copy(fogUniforms.uFogGround.value);
      target.uFogSky.value.copy(fogUniforms.uFogSky.value);
      target.uPixelScale.value = pixelScale;
    },
    Dispose() {
      geometry.dispose();
      material.dispose();
      if (points.parent) points.parent.remove(points);
    },
  };
}

/* —— 暴雪拉丝：被风扯成线的雪。实例化细长片，在视空间里沿风向拉伸 —— */

const StreakVertexShader = [
  'attribute vec3 aOffset;',
  'attribute float aSeed;',
  'attribute float aLength;',
  'uniform vec3 uCameraPosition;',
  'uniform vec3 uWindView;',
  'uniform float uSpan;',
  'uniform float uCeiling;',
  'uniform float uTime;',
  'uniform float uFall;',
  'uniform vec2 uWindWorld;',
  'varying float vStreakAlpha;',
  'varying vec2 vStreakUv;',
  'void main() {',
  '  vStreakUv = uv;',
  '  vec3 world = aOffset;',
  '  world.x = mod(aOffset.x + uWindWorld.x * uTime + uSpan * 0.5, uSpan) - uSpan * 0.5 + uCameraPosition.x;',
  '  world.z = mod(aOffset.z + uWindWorld.y * uTime + uSpan * 0.5, uSpan) - uSpan * 0.5 + uCameraPosition.z;',
  '  world.y = mod(aOffset.y - uFall * uTime * (0.6 + aSeed * 0.7), uCeiling);',
  '  vec4 mv = viewMatrix * vec4(world, 1.0);',
  /* 在视空间里把方片沿"风的屏幕投影方向"拉长 */
  '  vec3 along = normalize(uWindView + vec3(0.0001, 0.0, 0.0));',
  '  vec3 across = normalize(cross(along, vec3(0.0, 0.0, 1.0)) + vec3(0.0, 0.0001, 0.0));',
  '  mv.xyz += along * (position.y * aLength) + across * (position.x * 0.045);',
  '  float depth = -mv.z;',
  '  vStreakAlpha = smoothstep(1.2, 5.0, depth) * (1.0 - smoothstep(uSpan * 0.30, uSpan * 0.48, depth));',
  '  gl_Position = projectionMatrix * mv;',
  '}',
].join('\n');

const StreakFragmentShader = [
  'uniform vec3 uColor;',
  'uniform float uOpacity;',
  'varying float vStreakAlpha;',
  'varying vec2 vStreakUv;',
  'void main() {',
  '  float across = 1.0 - abs(vStreakUv.x * 2.0 - 1.0);',
  '  float along = sin(vStreakUv.y * 3.14159);',
  '  float alpha = pow(across, 1.6) * along * vStreakAlpha * uOpacity;',
  '  if (alpha < 0.006) discard;',
  '  gl_FragColor = vec4(uColor, alpha);',
  '}',
].join('\n');

function CreateSnowStreaks(three, parent, capacity) {
  const plane = new three.PlaneGeometry(1, 1);
  const geometry = new three.InstancedBufferGeometry();
  geometry.index = plane.index;
  geometry.attributes.position = plane.attributes.position;
  geometry.attributes.uv = plane.attributes.uv;
  const span = 44;
  const ceiling = 22;
  const offsets = new Float32Array(capacity * 3);
  const seeds = new Float32Array(capacity);
  const lengths = new Float32Array(capacity);
  for (let i = 0; i < capacity; i += 1) {
    offsets[i * 3] = MathUtil.Hash1(i * 1.31) * span;
    offsets[i * 3 + 1] = MathUtil.Hash1(i * 3.77) * ceiling;
    offsets[i * 3 + 2] = MathUtil.Hash1(i * 7.19) * span;
    seeds[i] = MathUtil.Hash1(i * 9.53);
    lengths[i] = 0.55 + MathUtil.Hash1(i * 13.1) * 1.5;
  }
  geometry.setAttribute('aOffset', new three.InstancedBufferAttribute(offsets, 3));
  geometry.setAttribute('aSeed', new three.InstancedBufferAttribute(seeds, 1));
  geometry.setAttribute('aLength', new three.InstancedBufferAttribute(lengths, 1));
  geometry.instanceCount = 0;
  geometry.boundingSphere = new three.Sphere(new three.Vector3(), span);

  const material = new three.ShaderMaterial({
    uniforms: {
      uCameraPosition: { value: new three.Vector3() },
      uWindView: { value: new three.Vector3(1, 0, 0) },
      uWindWorld: { value: new three.Vector2(1, 0) },
      uSpan: { value: span },
      uCeiling: { value: ceiling },
      uTime: { value: 0 },
      uFall: { value: 7 },
      uColor: { value: new three.Color(0xe6eef6) },
      uOpacity: { value: 0.55 },
    },
    vertexShader: StreakVertexShader,
    fragmentShader: StreakFragmentShader,
    transparent: true,
    depthWrite: false,
    side: three.DoubleSide,
    fog: false,
  });
  const mesh = new three.Mesh(geometry, material);
  mesh.name = 'InstancedSnowStreaks';
  mesh.frustumCulled = false;
  mesh.renderOrder = 7;
  parent.add(mesh);

  const windView = new three.Vector3();
  return {
    mesh: mesh,
    capacity: capacity,
    SetCount(count) { geometry.instanceCount = Math.max(0, Math.min(capacity, count | 0)); },
    Update(elapsed, camera, windX, windZ, opacity) {
      material.uniforms.uTime.value = elapsed;
      material.uniforms.uCameraPosition.value.copy(camera.position);
      material.uniforms.uWindWorld.value.set(windX, windZ);
      material.uniforms.uOpacity.value = opacity;
      windView.set(windX, -3.2, windZ).normalize().transformDirection(camera.matrixWorldInverse);
      material.uniforms.uWindView.value.copy(windView);
      mesh.visible = opacity > 0.01 && geometry.instanceCount > 0;
    },
    ApplyMood(color) { material.uniforms.uColor.value.copy(color); },
    Dispose() {
      plane.dispose();
      geometry.dispose();
      material.dispose();
      if (mesh.parent) mesh.parent.remove(mesh);
    },
  };
}

/* ================================================================== *
 * 七、一次性粒子池
 *
 * 两个池：
 *   soft  — NormalBlending：雪爆、呵气、烟、碎屑。会被雾吃掉。
 *   glow  — AdditiveBlending：火星、枪口焰、照明弹火花。**全片唯一的暖色来源之一。**
 * 全部预分配，Emit 只写数组，绝不每帧 new。
 * ================================================================== */

const ParticleVertexShader = [
  'attribute float aSize;',
  'attribute float aAlpha;',
  'attribute vec3 aColor;',
  'uniform float uPixelScale;',
  'uniform float uFogCameraY;',
  'uniform vec3 uFogUpView;',
  'varying float vAlpha;',
  'varying vec3 vColor;',
  'varying float vFogDepth;',
  'varying float vFogWorldY;',
  'void main() {',
  '  vAlpha = aAlpha;',
  '  vColor = aColor;',
  '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
  '  vFogDepth = -mv.z;',
  '  vFogWorldY = uFogCameraY + dot(uFogUpView, mv.xyz);',
  '  gl_PointSize = max(1.0, aSize * uPixelScale / max(-mv.z, 0.3));',
  '  gl_Position = projectionMatrix * mv;',
  '}',
].join('\n');

const ParticleFragmentShader = [
  'uniform sampler2D uSprite;',
  'uniform float uFogDensity;',
  'uniform float uFogFalloff;',
  'uniform float uFogBaseY;',
  'uniform float uFogCameraY;',
  'uniform vec3 uFogGround;',
  'uniform vec3 uFogSky;',
  'varying float vAlpha;',
  'varying vec3 vColor;',
  'varying float vFogDepth;',
  'varying float vFogWorldY;',
  'void main() {',
  '  vec4 sprite = texture2D(uSprite, gl_PointCoord);',
  '  float alpha = sprite.a * vAlpha;',
  '  if (alpha < 0.012) discard;',
  '  float atCamera = exp(-max(uFogCameraY - uFogBaseY, 0.0) * uFogFalloff);',
  '  float atFragment = exp(-max(vFogWorldY - uFogBaseY, 0.0) * uFogFalloff);',
  '  float term = uFogDensity * (atCamera + atFragment) * 0.5 * vFogDepth;',
  '  float fogAmount = clamp(1.0 - exp(-term * term), 0.0, 1.0);',
  '#ifdef PARTICLE_ADDITIVE',
  /* 加色粒子（火星）：雾只能让它变淡，不能给它染色，否则火星会变成蓝的 */
  '  gl_FragColor = vec4(vColor * sprite.rgb, alpha * (1.0 - fogAmount * 0.9));',
  '#else',
  '  float dirY = clamp((vFogWorldY - uFogCameraY) / max(vFogDepth, 0.001), -1.0, 1.0);',
  '  vec3 fogTint = mix(uFogGround, uFogSky, smoothstep(-0.30, 0.62, dirY));',
  '  gl_FragColor = vec4(mix(vColor, fogTint, fogAmount * 0.9), alpha * (1.0 - fogAmount * 0.4));',
  '#endif',
  '}',
].join('\n');

function CreateParticlePool(three, parent, options) {
  const capacity = options.capacity;
  const positions = new Float32Array(capacity * 3);
  const velocities = new Float32Array(capacity * 3);
  const colors = new Float32Array(capacity * 3);
  const sizes = new Float32Array(capacity);
  const alphas = new Float32Array(capacity);
  const baseAlpha = new Float32Array(capacity);
  const life = new Float32Array(capacity);
  const maxLife = new Float32Array(capacity);
  const drag = new Float32Array(capacity);
  const gravity = new Float32Array(capacity);
  const growth = new Float32Array(capacity);
  const baseSize = new Float32Array(capacity);

  const geometry = new three.BufferGeometry();
  geometry.setAttribute('position', new three.BufferAttribute(positions, 3));
  geometry.setAttribute('aColor', new three.BufferAttribute(colors, 3));
  geometry.setAttribute('aSize', new three.BufferAttribute(sizes, 1));
  geometry.setAttribute('aAlpha', new three.BufferAttribute(alphas, 1));
  geometry.setDrawRange(0, capacity);
  geometry.boundingSphere = new three.Sphere(new three.Vector3(), 600);

  const material = new three.ShaderMaterial({
    defines: options.additive ? { PARTICLE_ADDITIVE: '' } : {},
    uniforms: {
      uSprite: { value: options.sprite },
      uPixelScale: { value: 400 },
      uFogDensity: { value: 0.013 },
      uFogFalloff: { value: 0.085 },
      uFogBaseY: { value: -2 },
      uFogCameraY: { value: 1.7 },
      uFogUpView: { value: new three.Vector3(0, 1, 0) },
      uFogGround: { value: new three.Color(0xb3bfca) },
      uFogSky: { value: new three.Color(0x9fb0c2) },
    },
    vertexShader: ParticleVertexShader,
    fragmentShader: ParticleFragmentShader,
    transparent: true,
    depthWrite: false,
    blending: options.additive ? three.AdditiveBlending : three.NormalBlending,
    fog: false,
  });

  const points = new three.Points(geometry, material);
  points.name = options.name;
  points.frustumCulled = false;
  points.renderOrder = options.renderOrder;
  parent.add(points);

  let cursor = 0;
  let liveCount = 0;

  return {
    object: points,
    material: material,
    /** 发射一颗。参数全部是标量，调用方不需要 new 任何对象。 */
    Emit(x, y, z, vx, vy, vz, size, color, seconds, gravityValue, dragValue, alphaValue, growthValue) {
      const index = cursor;
      cursor = (cursor + 1) % capacity;
      positions[index * 3] = x; positions[index * 3 + 1] = y; positions[index * 3 + 2] = z;
      velocities[index * 3] = vx; velocities[index * 3 + 1] = vy; velocities[index * 3 + 2] = vz;
      colors[index * 3] = color.r; colors[index * 3 + 1] = color.g; colors[index * 3 + 2] = color.b;
      sizes[index] = size;
      baseSize[index] = size;
      growth[index] = growthValue === undefined ? 0 : growthValue;
      const alpha = alphaValue === undefined ? 1 : alphaValue;
      alphas[index] = alpha;
      baseAlpha[index] = alpha;
      life[index] = seconds;
      maxLife[index] = seconds;
      gravity[index] = gravityValue;
      drag[index] = dragValue;
    },
    Update(dt) {
      let active = 0;
      for (let i = 0; i < capacity; i += 1) {
        if (life[i] <= 0) { if (alphas[i] !== 0) alphas[i] = 0; continue; }
        life[i] -= dt;
        if (life[i] <= 0) { alphas[i] = 0; continue; }
        active += 1;
        const damping = Math.max(0, 1 - drag[i] * dt);
        velocities[i * 3] *= damping;
        velocities[i * 3 + 1] = velocities[i * 3 + 1] * damping + gravity[i] * dt;
        velocities[i * 3 + 2] *= damping;
        positions[i * 3] += velocities[i * 3] * dt;
        positions[i * 3 + 1] += velocities[i * 3 + 1] * dt;
        positions[i * 3 + 2] += velocities[i * 3 + 2] * dt;
        const t = MathUtil.Clamp01(life[i] / Math.max(0.001, maxLife[i]));
        /* 烟要一边升一边散开：growth 让尺寸随年龄增长 */
        sizes[i] = baseSize[i] * (1 + (1 - t) * growth[i]);
        alphas[i] = baseAlpha[i] * (t < 0.15 ? t / 0.15 : MathUtil.Clamp01(t / 0.85));
      }
      liveCount = active;
      geometry.attributes.position.needsUpdate = true;
      geometry.attributes.aAlpha.needsUpdate = true;
      geometry.attributes.aColor.needsUpdate = true;
      geometry.attributes.aSize.needsUpdate = true;
      points.visible = active > 0;
      return active;
    },
    GetLiveCount() { return liveCount; },
    SyncFog(fogUniforms, pixelScale) {
      const target = material.uniforms;
      target.uFogDensity.value = fogUniforms.uFogDensity.value;
      target.uFogFalloff.value = fogUniforms.uFogFalloff.value;
      target.uFogBaseY.value = fogUniforms.uFogBaseY.value;
      target.uFogCameraY.value = fogUniforms.uFogCameraY.value;
      target.uFogUpView.value.copy(fogUniforms.uFogUpView.value);
      target.uFogGround.value.copy(fogUniforms.uFogGround.value);
      target.uFogSky.value.copy(fogUniforms.uFogSky.value);
      target.uPixelScale.value = pixelScale;
    },
    Clear() {
      for (let i = 0; i < capacity; i += 1) { life[i] = 0; alphas[i] = 0; }
      geometry.attributes.aAlpha.needsUpdate = true;
      points.visible = false;
    },
    Dispose() {
      geometry.dispose();
      material.dispose();
      if (points.parent) points.parent.remove(points);
    },
  };
}

/* ================================================================== *
 * 八、地面贴花：脚印 / 弹着点
 *
 * 雪地脚印是本作的潜行语言之一（Config.Stealth.footprintLifeSeconds = 90，
 * 敌人会发现它们）。所以它必须**看得见、会随时间被新雪填平**。
 * 用 InstancedMesh + 每实例 aBirth/aLife，在 shader 里淡出，零 CPU 开销。
 * ================================================================== */

function CreateDecalField(three, parent, options) {
  const capacity = options.capacity;
  const geometry = new three.PlaneGeometry(1, 1);
  geometry.rotateX(-Math.PI / 2);
  const birth = new Float32Array(capacity);
  const life = new Float32Array(capacity);
  for (let i = 0; i < capacity; i += 1) { birth[i] = -1000; life[i] = 1; }
  geometry.setAttribute('aBirth', new three.InstancedBufferAttribute(birth, 1));
  geometry.setAttribute('aLife', new three.InstancedBufferAttribute(life, 1));

  const timeUniform = { value: 0 };
  const material = new three.MeshBasicMaterial({
    color: new three.Color(options.color),
    map: options.map,
    transparent: true,
    opacity: options.opacity === undefined ? 0.5 : options.opacity,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3,
  });
  material.onBeforeCompile = function PatchDecalFade(shader) {
    shader.uniforms.uDecalTime = timeUniform;
    shader.vertexShader = [
      'attribute float aBirth;',
      'attribute float aLife;',
      'uniform float uDecalTime;',
      'varying float vDecalFade;',
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\n  vDecalFade = clamp(1.0 - (uDecalTime - aBirth) / max(aLife, 0.001), 0.0, 1.0);\n  vDecalFade = smoothstep(0.0, 0.25, vDecalFade);',
      ),
    ].join('\n');
    shader.fragmentShader = [
      'varying float vDecalFade;',
      shader.fragmentShader.replace(
        '#include <dithering_fragment>',
        '#include <dithering_fragment>\n  gl_FragColor.a *= vDecalFade;\n  if (gl_FragColor.a < 0.004) discard;',
      ),
    ].join('\n');
  };
  material.customProgramCacheKey = function CacheKey() { return 'BsDecalFadeV1'; };

  const mesh = new three.InstancedMesh(geometry, material, capacity);
  mesh.name = options.name;
  mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(three.DynamicDrawUsage);
  mesh.count = 0;
  mesh.visible = false;
  mesh.renderOrder = options.renderOrder === undefined ? 2 : options.renderOrder;
  mesh.receiveShadow = false;
  mesh.castShadow = false;
  parent.add(mesh);

  let cursor = 0;
  const matrix = new three.Matrix4();
  const quaternion = new three.Quaternion();
  const axis = new three.Vector3(0, 1, 0);
  const scale = new three.Vector3();
  const place = new three.Vector3();

  return {
    mesh: mesh,
    material: material,
    Stamp(x, y, z, yaw, width, length, seconds, now) {
      const index = cursor;
      cursor = (cursor + 1) % capacity;
      if (mesh.count < capacity) mesh.count += 1;
      mesh.visible = true;
      quaternion.setFromAxisAngle(axis, yaw);
      place.set(x, y, z);
      scale.set(width, 1, length);
      matrix.compose(place, quaternion, scale);
      mesh.setMatrixAt(index, matrix);
      mesh.instanceMatrix.needsUpdate = true;
      birth[index] = now;
      life[index] = seconds;
      geometry.attributes.aBirth.needsUpdate = true;
      geometry.attributes.aLife.needsUpdate = true;
    },
    SetTime(now) { timeUniform.value = now; },
    SetColor(color) { material.color.copy(color); },
    Clear() {
      mesh.count = 0;
      mesh.visible = false;
      cursor = 0;
      for (let i = 0; i < capacity; i += 1) birth[i] = -1000;
      geometry.attributes.aBirth.needsUpdate = true;
    },
    Dispose() {
      geometry.dispose();
      material.dispose();
      if (mesh.parent) mesh.parent.remove(mesh);
    },
  };
}

/* ================================================================== *
 * 九、火：全片唯一的暖色
 *
 * 一个 CreateFireLight 不只是一盏 PointLight，还带：
 *   两片交错跳动的火舌 + 一团 additive 光晕 + 不断上飘的火星 + 缓慢的烟柱。
 * 这样村子里的两处余火才会成为构图的锚点，而不是"地上有个看不见的光源"。
 * ================================================================== */

const FireQuadVertexShader = [
  'attribute float aIndex;',
  'uniform float uTime;',
  'uniform float uScale;',
  'uniform float uFlicker;',
  'varying vec2 vFireUv;',
  'varying float vFireIndex;',
  'void main() {',
  '  vFireUv = uv;',
  '  vFireIndex = aIndex;',
  '  float phase = uTime * (5.2 + aIndex * 2.1) + aIndex * 2.7;',
  '  float wobble = sin(phase) * 0.10 + sin(phase * 1.87) * 0.05;',
  '  float lift = 1.0 + sin(phase * 0.83) * 0.16 * uFlicker;',
  '  vec3 local = position;',
  '  local.x = (local.x + wobble * uv.y) * uScale * (1.05 - aIndex * 0.24);',
  '  local.y = local.y * uScale * lift * (0.72 + aIndex * 0.30);',
  /* 永远面向相机：只取 modelView 的位移，旋转用单位阵 */
  '  vec4 center = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);',
  '  center.xy += local.xy;',
  '  gl_Position = projectionMatrix * center;',
  '}',
].join('\n');

const FireQuadFragmentShader = [
  'uniform sampler2D uSprite;',
  'uniform float uOpacity;',
  'varying vec2 vFireUv;',
  'varying float vFireIndex;',
  'void main() {',
  '  vec4 sprite = texture2D(uSprite, vFireUv);',
  '  float alpha = sprite.a * uOpacity * (0.85 - vFireIndex * 0.25);',
  '  if (alpha < 0.01) discard;',
  '  gl_FragColor = vec4(sprite.rgb, alpha);',
  '}',
].join('\n');

/** 火舌：两片错位的billboard，UV 原点在底部中心。 */
function CreateFireQuads(three, flameSprite) {
  const plane = new three.PlaneGeometry(1.5, 1.15);
  plane.translate(0, 0.575, 0);
  const geometry = new three.InstancedBufferGeometry();
  geometry.index = plane.index;
  geometry.attributes.position = plane.attributes.position;
  geometry.attributes.uv = plane.attributes.uv;
  const indices = new Float32Array([0, 1, 2]);
  geometry.setAttribute('aIndex', new three.InstancedBufferAttribute(indices, 1));
  geometry.instanceCount = 3;
  geometry.boundingSphere = new three.Sphere(new three.Vector3(), 4);
  const material = new three.ShaderMaterial({
    uniforms: {
      uSprite: { value: flameSprite },
      uTime: { value: 0 },
      uScale: { value: 1 },
      uFlicker: { value: 1 },
      uOpacity: { value: 1 },
    },
    vertexShader: FireQuadVertexShader,
    fragmentShader: FireQuadFragmentShader,
    transparent: true,
    depthWrite: false,
    blending: three.AdditiveBlending,
    fog: false,
  });
  const mesh = new three.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 8;
  return { mesh: mesh, material: material, plane: plane };
}

/* —— 光晕片：附着在任何点光源上的 additive 软球，让光"有形状" —— */

const GlowVertexShader = [
  'uniform float uSize;',
  'varying vec2 vGlowUv;',
  'void main() {',
  '  vGlowUv = uv;',
  '  vec4 center = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);',
  '  center.xy += position.xy * uSize;',
  '  gl_Position = projectionMatrix * center;',
  '}',
].join('\n');

const GlowFragmentShader = [
  'uniform sampler2D uSprite;',
  'uniform vec3 uColor;',
  'uniform float uStrength;',
  'varying vec2 vGlowUv;',
  'void main() {',
  '  float mask = texture2D(uSprite, vGlowUv).a;',
  '  gl_FragColor = vec4(uColor * uStrength, mask * uStrength);',
  '}',
].join('\n');

function CreateGlowSprite(three, sprite, color, size) {
  const geometry = new three.PlaneGeometry(2, 2);
  const material = new three.ShaderMaterial({
    uniforms: {
      uSprite: { value: sprite },
      uColor: { value: new three.Color(color) },
      uStrength: { value: 1 },
      uSize: { value: size },
    },
    vertexShader: GlowVertexShader,
    fragmentShader: GlowFragmentShader,
    transparent: true,
    depthWrite: false,
    blending: three.AdditiveBlending,
    fog: false,
  });
  const mesh = new three.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 9;
  return { mesh: mesh, material: material };
}

/* ================================================================== *
 * 十、光轴（god shaft）：探照灯与手电的可见光锥
 *
 * 第三幕搜山的探照灯必须"看得见光柱"，否则玩家不知道该躲哪。
 * 一个圆锥 + 沿轴向与径向双重衰减的 additive 材质，front face 剔除掉，
 * 只留背面 → 从外面看是一柱光，走进去也不会翻面。
 * ================================================================== */

const ShaftVertexShader = [
  'uniform float uRange;',
  'uniform float uRadius;',
  'varying float vShaftAxial;',
  'varying float vShaftRadial;',
  'void main() {',
  /* 几何已经摆成：锥尖在原点、轴指向 -Z。轴向 = 离光源多远，径向 = 离轴心多偏 */
  '  vShaftAxial = clamp(-position.z / max(uRange, 0.001), 0.0, 1.0);',
  '  vShaftRadial = clamp(length(position.xy) / max(uRadius * vShaftAxial, 0.0001), 0.0, 1.0);',
  '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
  '}',
].join('\n');

const ShaftFragmentShader = [
  'uniform vec3 uColor;',
  'uniform float uStrength;',
  'varying float vShaftAxial;',
  'varying float vShaftRadial;',
  'void main() {',
  '  float axial = pow(clamp(1.0 - vShaftAxial, 0.0, 1.0), 1.6);',
  '  float edge = pow(clamp(1.0 - vShaftRadial, 0.0, 1.0), 0.8);',
  '  float alpha = axial * (0.25 + edge * 0.75) * uStrength;',
  '  if (alpha < 0.004) discard;',
  '  gl_FragColor = vec4(uColor * alpha, alpha);',
  '}',
].join('\n');

function CreateLightShaft(three, range, halfAngleDeg, color, strength) {
  const radius = Math.tan(halfAngleDeg * MathUtil.DegToRad) * range;
  const geometry = new three.ConeGeometry(radius, range, 20, 1, true);
  /* 锥尖在光源处：默认 ConeGeometry 尖在 +Y，先平移让尖端到原点，再倒过来朝 -Z */
  geometry.translate(0, -range * 0.5, 0);
  geometry.rotateX(Math.PI * 0.5);
  const material = new three.ShaderMaterial({
    uniforms: {
      uColor: { value: new three.Color(color) },
      uStrength: { value: strength },
      uRange: { value: range },
      uRadius: { value: radius },
    },
    vertexShader: ShaftVertexShader,
    fragmentShader: ShaftFragmentShader,
    transparent: true,
    depthWrite: false,
    side: three.BackSide,
    blending: three.AdditiveBlending,
    fog: false,
  });
  const mesh = new three.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 8;
  return { mesh: mesh, material: material };
}

/* ================================================================== *
 * 十一、后处理
 *
 * 顺序：RenderPass → GodRay → Bloom → Grade → Output(ACES + sRGB)
 * 前四段全在**线性 HDR**里；色调映射只做一次，放在最后。
 * 这个顺序很重要：辉光必须在线性空间做（否则亮部会脏），
 * 暗角/颗粒放在 tonemap 之前更像真实镜头的光学衰减。
 * ================================================================== */

/** 径向散射：从太阳屏幕位置往外拉，只累加超过阈值的亮部 = 便宜的体积光。 */
const GodRayShader = {
  name: 'BsGodRay',
  defines: { GODRAY_SAMPLES: 10 },
  uniforms: {
    tDiffuse: { value: null },
    uSunUv: { value: new THREE.Vector2(0.5, 0.5) },
    uStrength: { value: 0.0 },
    uDecay: { value: 0.93 },
    uWeight: { value: 0.55 },
    uThreshold: { value: 0.62 },
    uTint: { value: new THREE.Color(0xd8dde4) },
    uOnScreen: { value: 0 },
  },
  vertexShader: [
    'varying vec2 vUv;',
    'void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  ].join('\n'),
  fragmentShader: [
    'uniform sampler2D tDiffuse;',
    'uniform vec2 uSunUv;',
    'uniform float uStrength;',
    'uniform float uDecay;',
    'uniform float uWeight;',
    'uniform float uThreshold;',
    'uniform vec3 uTint;',
    'uniform float uOnScreen;',
    'varying vec2 vUv;',
    'void main() {',
    '  vec4 base = texture2D(tDiffuse, vUv);',
    '  float power = uStrength * uOnScreen;',
    '  if (power > 0.002) {',
    '    vec2 delta = (vUv - uSunUv) * (0.82 / float(GODRAY_SAMPLES));',
    '    vec2 uv = vUv;',
    '    float illumination = 1.0;',
    '    vec3 accumulated = vec3(0.0);',
    '    for (int i = 0; i < GODRAY_SAMPLES; i++) {',
    '      uv -= delta;',
    '      vec3 sampled = texture2D(tDiffuse, clamp(uv, vec2(0.0), vec2(1.0))).rgb;',
    '      float luma = max(dot(sampled, vec3(0.2126, 0.7152, 0.0722)) - uThreshold, 0.0);',
    '      accumulated += sampled * luma * illumination;',
    '      illumination *= uDecay;',
    '    }',
    '    accumulated *= uWeight / float(GODRAY_SAMPLES);',
    '    base.rgb += accumulated * uTint * power;',
    '  }',
    '  gl_FragColor = base;',
    '}',
  ].join('\n'),
};

/**
 * 最终分级。全部效果可通过强度归零关闭（设置面板走 SettingsChanged）。
 * uHurt 是"受伤时的血色低饱和"：**不是喷血**，是失血时视野褪色 + 边缘发暗红，
 * 这是生理反应的表达，不是伤口展示（红线二）。
 */
const GradeShader = {
  name: 'BsGrade',
  uniforms: {
    tDiffuse: { value: null },
    uVignette: { value: Config.Render.vignette },
    uStealth: { value: 0 },
    uGrain: { value: Config.Render.filmGrain },
    uChroma: { value: Config.Render.chromaticAberration },
    uDesaturation: { value: Config.Render.desaturationBase },
    uHurt: { value: 0 },
    uFrost: { value: 0 },
    uShadowLift: { value: 0.016 },
    uLiftColor: { value: new THREE.Color(0.56, 0.70, 0.92) },
    uLiftRange: { value: 0.11 },
    uLetterbox: { value: 0 },
    uFlashColor: { value: new THREE.Color(1, 1, 1) },
    uFlashStrength: { value: 0 },
    uHurtColor: { value: new THREE.Color(0x5a1b16) },
    uFrostColor: { value: new THREE.Color(0xbcd0e2) },
    uTime: { value: 0 },
    uAspect: { value: 1.78 },
  },
  vertexShader: [
    'varying vec2 vUv;',
    'void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  ].join('\n'),
  fragmentShader: [
    'uniform sampler2D tDiffuse;',
    'uniform float uVignette;',
    'uniform float uStealth;',
    'uniform float uGrain;',
    'uniform float uChroma;',
    'uniform float uDesaturation;',
    'uniform float uHurt;',
    'uniform float uFrost;',
    'uniform float uShadowLift;',
    'uniform vec3 uLiftColor;',
    'uniform float uLiftRange;',
    'uniform float uLetterbox;',
    'uniform vec3 uFlashColor;',
    'uniform float uFlashStrength;',
    'uniform vec3 uHurtColor;',
    'uniform vec3 uFrostColor;',
    'uniform float uTime;',
    'uniform float uAspect;',
    'varying vec2 vUv;',
    'float GradeHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }',
    'void main() {',
    '  vec2 centered = (vUv - 0.5) * vec2(uAspect, 1.0);',
    '  float radius = clamp(length(centered) / (0.5 * length(vec2(uAspect, 1.0))), 0.0, 1.0);',
    '  vec3 color;',
    '  float chroma = uChroma * (1.0 + uHurt * 4.0 + uFlashStrength * 3.0);',
    '  if (chroma > 0.00004) {',
    '    vec2 shift = (vUv - 0.5) * chroma * (0.35 + radius * radius * 2.4);',
    '    color.r = texture2D(tDiffuse, vUv + shift).r;',
    '    color.g = texture2D(tDiffuse, vUv).g;',
    '    color.b = texture2D(tDiffuse, vUv - shift).b;',
    '  } else {',
    '    color = texture2D(tDiffuse, vUv).rgb;',
    '  }',
    '  float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));',
    '  if (uShadowLift > 0.0001) {',
    '    float toe = 1.0 - smoothstep(0.0, uLiftRange, luma);',
    '    color += uLiftColor * uShadowLift * toe * toe;',
    '    luma = dot(color, vec3(0.2126, 0.7152, 0.0722));',
    '  }',
    '  color = mix(color, vec3(luma), clamp(uDesaturation + uHurt * 0.42, 0.0, 1.0));',
    /* 受伤：边缘压向暗红，中心保持可读（玩家还得看得见路） */
    '  float hurtEdge = smoothstep(0.22, 1.0, radius) * uHurt;',
    '  color = mix(color, uHurtColor * (0.30 + luma * 0.9), hurtEdge * 0.72);',
    /* 低温：镜头边缘结霜，冷调、发亮，与受伤的暗红是两种完全不同的读数 */
    '  float frostEdge = smoothstep(0.38, 1.0, radius) * uFrost;',
    '  color = mix(color, uFrostColor * (0.5 + luma * 0.75), frostEdge * 0.5);',
    /* 暗角 + 潜行时额外收边：蹲下藏好，画面自己会告诉你"你被世界包住了" */
    '  float vignette = uVignette + uStealth * 0.26;',
    '  color *= 1.0 - vignette * pow(radius, 2.1);',
    /* 颗粒：线性空间里按亮度加权，暗部才不会炸成噪点雪花 */
    '  if (uGrain > 0.0001) {',
    '    float grain = GradeHash(vUv * vec2(1031.0, 617.0) + mod(uTime, 97.0)) - 0.5;',
    '    color += grain * uGrain * (0.18 + luma * 0.9);',
    '  }',
    '  color = mix(color, uFlashColor, clamp(uFlashStrength, 0.0, 1.0));',
    '  if (uLetterbox > 0.001) {',
    '    float bar = uLetterbox * 0.113;',
    '    float mask = smoothstep(bar - 0.004, bar + 0.002, vUv.y) * smoothstep(1.0 - bar + 0.004, 1.0 - bar - 0.002, vUv.y);',
    '    color *= mask;',
    '  }',
    '  gl_FragColor = vec4(max(color, vec3(0.0)), 1.0);',
    '}',
  ].join('\n'),
};

/* ================================================================== *
 * 十二、三幕 light rig
 *
 * 每一幕两个端点（t=0 / t=1），中间线性插值 → SetChapterMood(chapterId, t)。
 * 设计意图：
 *  一 · 雪窖   清晨薄雾  低角度侧光 + 厚地面雾 + 长影。世界刚刚被烧过，光是灰蓝的。
 *  二 · 断谷   正午惨白  高角度平光 + 高去饱和 + 视距最远。没有影子可藏 = 暴露感。
 *  三 · 风雪垭口 黄昏转夜暴雪 关键光死掉 + 雾吃掉一切 + 只剩火/照明弹是暖的。
 *
 * 全局纪律：三套 rig 里**没有一处天光是暖的**。地平线那一点余烬色（第三幕 t=0）
 * 饱和度压到极低且很快熄灭，它的作用是把"唯一暖色"的位置交接给火。
 * ================================================================== */

const MoodColorKeys = {
  sunColor: 1, skyLightColor: 1, groundLightColor: 1, bounceColor: 1, ambientColor: 1,
  zenith: 1, horizon: 1, hazeColor: 1, cloudDark: 1, cloudLight: 1, sunDiskColor: 1,
  fogGround: 1, fogSky: 1, fogSun: 1, ridgeNear: 1, ridgeFar: 1, ridgeSnow: 1,
  mistColor: 1, snowColor: 1, footprintColor: 1, godrayTint: 1,
};

const MoodRigs = {
  /* ——— 第一幕 · 雪窖：拂晓，薄雾，被烧过的村子 ——— */
  ChapterSnowCellar: {
    start: {
      sunElevationDeg: 9, sunAzimuthDeg: 96, shadowElevationDeg: 24,
      sunColor: 0xc6d3e2, sunIntensity: 4.30,
      skyLightColor: 0x8aa6c6, groundLightColor: 0xcbd5df, hemiIntensity: 1.30,
      bounceColor: 0xaec0d2, bounceIntensity: 0.50,
      ambientColor: 0x6b7d93, ambientIntensity: 0.30,
      zenith: 0x4b5c72, horizon: 0xb2bfcb, hazeColor: 0xb6c2cd, hazeAmount: 0.62,
      cloudDark: 0x7c8b9c, cloudLight: 0xc3ced9, cloudCover: 0.52, cloudSharpness: 0.30, cloudSpeed: 0.0035,
      sunDiskColor: 0xdfe6ee, sunDiskStrength: 0.55, sunHalo: 0.30, stars: 0.0,
      fogDensity: 0.0150, fogFalloff: 0.115, fogBaseY: -1.5,
      fogGround: 0xb0bdc9, fogSky: 0x9db0c4, fogSun: 0xd2d0c9, fogInscatter: 0.40,
      ridgeNear: 0x475463, ridgeFar: 0x8b9aab, ridgeSnow: 0xc4cfda, ridgeSnowAmount: 0.62,
      mistColor: 0xc2ccd6, mistOpacity: 0.50, mistCount: 1.0,
      snowColor: 0xe8eff6, snowRateScale: 1.0,
      shadowLift: 0.020, exposure: 0.94, vignette: 0.40, desaturation: 0.15, godray: 0.55, godrayTint: 0xd9dfe6, bloom: 1.0,
      footprintColor: 0x5a6b7e, ambientLevel: 0.46,
    },
    end: {
      sunElevationDeg: 15, sunAzimuthDeg: 102, shadowElevationDeg: 30,
      sunColor: 0xcfdae6, sunIntensity: 4.55,
      skyLightColor: 0x90abc9, groundLightColor: 0xd0d9e2, hemiIntensity: 1.36,
      bounceColor: 0xb2c3d4, bounceIntensity: 0.52,
      ambientColor: 0x718398, ambientIntensity: 0.31,
      zenith: 0x51637a, horizon: 0xb8c5d0, hazeColor: 0xbac6d1, hazeAmount: 0.54,
      cloudDark: 0x82909f, cloudLight: 0xc9d3de, cloudCover: 0.48, cloudSharpness: 0.32, cloudSpeed: 0.0038,
      sunDiskColor: 0xe6ecf2, sunDiskStrength: 0.70, sunHalo: 0.34, stars: 0.0,
      fogDensity: 0.0126, fogFalloff: 0.125, fogBaseY: -1.5,
      fogGround: 0xb4c0cb, fogSky: 0xa2b4c6, fogSun: 0xd6d4cd, fogInscatter: 0.42,
      ridgeNear: 0x4c5967, ridgeFar: 0x909eae, ridgeSnow: 0xc8d2dc, ridgeSnowAmount: 0.64,
      mistColor: 0xc6cfd9, mistOpacity: 0.40, mistCount: 0.85,
      snowColor: 0xeaf1f7, snowRateScale: 1.0,
      shadowLift: 0.019, exposure: 0.95, vignette: 0.38, desaturation: 0.14, godray: 0.62, godrayTint: 0xdde3ea, bloom: 1.0,
      footprintColor: 0x5e6f82, ambientLevel: 0.50,
    },
  },

  /* ——— 第二幕 · 断谷：正午，惨白，无处可藏 ——— */
  ChapterBrokenValley: {
    start: {
      sunElevationDeg: 46, sunAzimuthDeg: 172, shadowElevationDeg: 46,
      sunColor: 0xe4ebf2, sunIntensity: 3.20,
      skyLightColor: 0x9fb5cb, groundLightColor: 0xd8dee5, hemiIntensity: 1.85,
      bounceColor: 0xc4ced8, bounceIntensity: 0.62,
      ambientColor: 0x828d9b, ambientIntensity: 0.38,
      zenith: 0x76889b, horizon: 0xc6d0da, hazeColor: 0xc4ced8, hazeAmount: 0.44,
      cloudDark: 0x8e9ba9, cloudLight: 0xd4dce4, cloudCover: 0.80, cloudSharpness: 0.42, cloudSpeed: 0.0050,
      sunDiskColor: 0xf0f4f8, sunDiskStrength: 0.42, sunHalo: 0.26, stars: 0.0,
      fogDensity: 0.0092, fogFalloff: 0.150, fogBaseY: -2.5,
      fogGround: 0xc0c9d2, fogSky: 0xb6c2ce, fogSun: 0xdfe4e9, fogInscatter: 0.20,
      ridgeNear: 0x5b6875, ridgeFar: 0x9dabb8, ridgeSnow: 0xd0d8e1, ridgeSnowAmount: 0.66,
      mistColor: 0xcbd3db, mistOpacity: 0.22, mistCount: 0.55,
      snowColor: 0xecf1f6, snowRateScale: 1.0,
      shadowLift: 0.014, exposure: 0.98, vignette: 0.33, desaturation: 0.26, godray: 0.30, godrayTint: 0xe4e9ee, bloom: 0.85,
      footprintColor: 0x6b7787, ambientLevel: 0.74,
    },
    end: {
      sunElevationDeg: 38, sunAzimuthDeg: 202, shadowElevationDeg: 40,
      sunColor: 0xdfe7ef, sunIntensity: 3.00,
      skyLightColor: 0x98aec5, groundLightColor: 0xd2d9e1, hemiIntensity: 1.72,
      bounceColor: 0xbec9d4, bounceIntensity: 0.60,
      ambientColor: 0x7b8695, ambientIntensity: 0.20,
      zenith: 0x6f8194, horizon: 0xc0cad5, hazeColor: 0xbec9d4, hazeAmount: 0.50,
      cloudDark: 0x86929f, cloudLight: 0xced7e0, cloudCover: 0.86, cloudSharpness: 0.38, cloudSpeed: 0.0058,
      sunDiskColor: 0xe9eef4, sunDiskStrength: 0.30, sunHalo: 0.22, stars: 0.0,
      fogDensity: 0.0108, fogFalloff: 0.140, fogBaseY: -2.5,
      fogGround: 0xbac4ce, fogSky: 0xb0bcc9, fogSun: 0xd9dfe5, fogInscatter: 0.18,
      ridgeNear: 0x556270, ridgeFar: 0x97a5b3, ridgeSnow: 0xcad3dd, ridgeSnowAmount: 0.64,
      mistColor: 0xc5cdd7, mistOpacity: 0.28, mistCount: 0.65,
      snowColor: 0xe9eff5, snowRateScale: 1.0,
      shadowLift: 0.015, exposure: 0.97, vignette: 0.35, desaturation: 0.27, godray: 0.22, godrayTint: 0xdfe5eb, bloom: 0.85,
      footprintColor: 0x66727f, ambientLevel: 0.68,
    },
  },

  /* ——— 第三幕 · 风雪垭口：黄昏转夜，暴雪，被追 ——— */
  ChapterWindPass: {
    start: {
      sunElevationDeg: 5, sunAzimuthDeg: 258, shadowElevationDeg: 22,
      /* 黄昏的最后一点光：饱和度压得极低，它在"死"，不与火争暖色 */
      sunColor: 0x9a9490, sunIntensity: 2.10,
      skyLightColor: 0x6b8098, groundLightColor: 0x9aa5b2, hemiIntensity: 1.05,
      bounceColor: 0x8b98a7, bounceIntensity: 0.40,
      ambientColor: 0x4a586a, ambientIntensity: 0.26,
      zenith: 0x2c3745, horizon: 0x7f8794, hazeColor: 0x7d8895, hazeAmount: 0.78,
      cloudDark: 0x4d5764, cloudLight: 0x8b95a2, cloudCover: 0.90, cloudSharpness: 0.30, cloudSpeed: 0.014,
      /* 地平线那一点余烬：极小面积、极低饱和，t 一走就没 */
      sunDiskColor: 0x8a6f5c, sunDiskStrength: 0.30, sunHalo: 0.30, stars: 0.0,
      fogDensity: 0.0330, fogFalloff: 0.055, fogBaseY: -3.0,
      fogGround: 0x77828f, fogSky: 0x6e7a88, fogSun: 0x8a8079, fogInscatter: 0.20,
      ridgeNear: 0x2d3844, ridgeFar: 0x616e7c, ridgeSnow: 0x8b98a6, ridgeSnowAmount: 0.48,
      mistColor: 0x94a0ad, mistOpacity: 0.60, mistCount: 1.0,
      snowColor: 0xdde6ef, snowRateScale: 1.0,
      shadowLift: 0.017, exposure: 1.04, vignette: 0.46, desaturation: 0.28, godray: 0.18, godrayTint: 0xa8a49e, bloom: 1.15,
      footprintColor: 0x39434f, ambientLevel: 0.30,
    },
    end: {
      sunElevationDeg: 34, sunAzimuthDeg: 300, shadowElevationDeg: 34,
      /* 深夜只剩云层透下来的散射，方向光几乎只是给轮廓一点边缘 */
      sunColor: 0x4f6180, sunIntensity: 0.95,
      skyLightColor: 0x36485f, groundLightColor: 0x4e5b6b, hemiIntensity: 0.62,
      bounceColor: 0x445264, bounceIntensity: 0.24,
      ambientColor: 0x232e3d, ambientIntensity: 0.17,
      zenith: 0x0e131a, horizon: 0x2f3944, hazeColor: 0x2e3844, hazeAmount: 0.86,
      cloudDark: 0x1a222c, cloudLight: 0x3d4854, cloudCover: 0.94, cloudSharpness: 0.26, cloudSpeed: 0.020,
      sunDiskColor: 0x54627a, sunDiskStrength: 0.10, sunHalo: 0.16, stars: 0.35,
      fogDensity: 0.0520, fogFalloff: 0.045, fogBaseY: -3.0,
      fogGround: 0x2c343d, fogSky: 0x333d49, fogSun: 0x3a434f, fogInscatter: 0.12,
      ridgeNear: 0x0d1219, ridgeFar: 0x27303b, ridgeSnow: 0x3d4954, ridgeSnowAmount: 0.34,
      mistColor: 0x46525f, mistOpacity: 0.68, mistCount: 1.0,
      snowColor: 0xc8d4e0, snowRateScale: 1.0,
      shadowLift: 0.011, exposure: 1.16, vignette: 0.54, desaturation: 0.30, godray: 0.05, godrayTint: 0x6a7688, bloom: 1.35,
      footprintColor: 0x1d242c, ambientLevel: 0.13,
    },
  },
};

/** TimeOfDay 预设 → (章节 rig, t)。Boot 只知道 timeOfDay，这里把它翻译成 mood。 */
const TimeOfDayToMood = {
  Dawn: { chapterId: 'ChapterSnowCellar', t: 0.15 },
  Noon: { chapterId: 'ChapterBrokenValley', t: 0.30 },
  Dusk: { chapterId: 'ChapterWindPass', t: 0.08 },
  Night: { chapterId: 'ChapterWindPass', t: 1.00 },
};

/** 天气对 mood 的乘性修正。天气不改色相，只改"能见度与雪量"。 */
const WeatherModifiers = {
  Clear: { fogDensity: 0.62, hazeAmount: 0.72, cloudCover: 0.45, mistOpacity: 0.5, snowRateScale: 0.0, godray: 1.45, desaturation: 0.92, sunIntensity: 1.12 },
  LightSnow: { fogDensity: 1.00, hazeAmount: 1.00, cloudCover: 1.00, mistOpacity: 1.0, snowRateScale: 1.0, godray: 1.00, desaturation: 1.00, sunIntensity: 1.00 },
  Overcast: { fogDensity: 1.22, hazeAmount: 1.12, cloudCover: 1.18, mistOpacity: 1.15, snowRateScale: 0.45, godray: 0.55, desaturation: 1.10, sunIntensity: 0.84 },
  Blizzard: { fogDensity: 2.15, hazeAmount: 1.30, cloudCover: 1.25, mistOpacity: 1.5, snowRateScale: 2.6, godray: 0.18, desaturation: 1.18, sunIntensity: 0.58 },
};

function LerpMoodSpec(fromSpec, toSpec, t, out) {
  const target = out || {};
  const k = MathUtil.Clamp01(t);
  for (const key of Object.keys(fromSpec)) {
    const a = fromSpec[key];
    const b = toSpec[key] === undefined ? a : toSpec[key];
    target[key] = MoodColorKeys[key] ? MixHex(a, b, k) : a + (b - a) * k;
  }
  return target;
}

function ApplyWeatherModifier(spec, weatherPreset) {
  const modifier = WeatherModifiers[weatherPreset] || WeatherModifiers.LightSnow;
  spec.fogDensity *= modifier.fogDensity;
  spec.hazeAmount = MathUtil.Clamp01(spec.hazeAmount * modifier.hazeAmount);
  spec.cloudCover = MathUtil.Clamp01(spec.cloudCover * modifier.cloudCover);
  spec.mistOpacity *= modifier.mistOpacity;
  spec.snowRateScale *= modifier.snowRateScale;
  spec.godray *= modifier.godray;
  spec.desaturation = MathUtil.Clamp01(spec.desaturation * modifier.desaturation);
  spec.sunIntensity *= modifier.sunIntensity;
  return spec;
}

function ResolveMoodSpec(chapterId, t, weatherPreset, out) {
  const rig = MoodRigs[chapterId] || MoodRigs.ChapterSnowCellar;
  const spec = LerpMoodSpec(rig.start, rig.end, t, out);
  return ApplyWeatherModifier(spec, weatherPreset);
}

/* ================================================================== *
 * 十三、画质档位
 * ================================================================== */

const QualityProfiles = {
  low: {
    shadows: false, shadowMapSize: 512, shadowDistance: 26,
    snowNear: 150, snowFar: 240, streaks: 0, mist: 5,
    godraySamples: 0, bloom: false, grain: 0, chroma: 0,
    poolSoft: 200, poolGlow: 140, decalFoot: 90, decalImpact: 40,
    ridgeLayers: true, pixelCap: 1.5, anisotropy: 1, bloomScale: 0.4,
  },
  medium: {
    shadows: true, shadowMapSize: 1024, shadowDistance: 36,
    snowNear: 420, snowFar: 900, streaks: 220, mist: 9,
    godraySamples: 8, bloom: true, grain: 0.035, chroma: 0.0011,
    poolSoft: 420, poolGlow: 260, decalFoot: 160, decalImpact: 80,
    ridgeLayers: true, pixelCap: 1.75, anisotropy: 4, bloomScale: 0.5,
  },
  high: {
    shadows: true, shadowMapSize: 2048, shadowDistance: 45,
    snowNear: 900, snowFar: 1800, streaks: 420, mist: 14,
    godraySamples: 12, bloom: true, grain: 0.048, chroma: 0.0016,
    poolSoft: 700, poolGlow: 420, decalFoot: 240, decalImpact: 120,
    ridgeLayers: true, pixelCap: 2, anisotropy: 8, bloomScale: 0.55,
  },
};

/* ================================================================== *
 * 十四、Art 本体
 * ================================================================== */

export function CreateArt(ctx, options) {
  const settings = options || {};
  const renderConfig = Config.Render;
  let currentQuality = settings.quality || (ctx && ctx.quality) || 'high';
  let profile = QualityProfiles[currentQuality] || QualityProfiles.high;

  /* ---------------- renderer ---------------- */
  const renderer = new THREE.WebGLRenderer({
    canvas: settings.canvas || (ctx && ctx.canvas) || undefined,
    antialias: currentQuality !== 'low',
    alpha: false,
    powerPreference: 'high-performance',
    stencil: false,
  });
  renderer.setPixelRatio(Math.min(profile.pixelCap, (typeof window !== 'undefined' && window.devicePixelRatio) || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = renderConfig.toneMappingExposure;
  renderer.shadowMap.enabled = profile.shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(new THREE.Color(Palette.FogWinter), 1);

  /* ---------------- scene / camera ---------------- */
  const scene = new THREE.Scene();
  scene.name = 'SceneBlackstone';
  /* three 原生雾只用来点亮 USE_FOG 宏；真正的雾由注入的高度雾 chunk 计算。 */
  scene.fog = new THREE.FogExp2(new THREE.Color(Palette.FogWinter), 0.0012);

  const camera = new THREE.PerspectiveCamera(Config.Camera.fov, 16 / 9, Config.Camera.near, Config.Camera.far);
  camera.position.set(0, 2.2, 6);
  camera.name = 'CameraMain';

  const effectsGroup = new THREE.Group();
  effectsGroup.name = 'GroupEffects';
  effectsGroup.matrixAutoUpdate = false;
  effectsGroup.matrixWorldAutoUpdate = true;
  scene.add(effectsGroup);

  const fogUniforms = CreateFogUniforms(THREE);
  const library = CreateMaterialLibrary(THREE, fogUniforms);

  /* ---------------- 天空 ---------------- */
  const skyUniforms = {
    uZenith: { value: new THREE.Color(0x4b5c72) },
    uHorizon: { value: new THREE.Color(0xb2bfcb) },
    uHaze: { value: new THREE.Color(0xb6c2cd) },
    uHazeAmount: { value: 0.6 },
    uCloudDark: { value: new THREE.Color(0x7c8b9c) },
    uCloudLight: { value: new THREE.Color(0xc3ced9) },
    uCloudCover: { value: 0.52 },
    uCloudSharpness: { value: 0.30 },
    uCloudOffset: { value: new THREE.Vector2() },
    uSunDirection: { value: new THREE.Vector3(0.3, 0.4, -0.9) },
    uSunColor: { value: new THREE.Color(0xdfe6ee) },
    uSunStrength: { value: 0.55 },
    uSunHalo: { value: 0.30 },
    uStars: { value: 0 },
  };
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(1, 40, 24),
    new THREE.ShaderMaterial({
      uniforms: skyUniforms,
      vertexShader: SkyVertexShader,
      fragmentShader: SkyFragmentShader,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      fog: false,
    }),
  );
  sky.name = 'MeshSkyDome';
  sky.scale.setScalar(Config.Camera.far * 0.85);
  sky.frustumCulled = false;
  sky.renderOrder = -10;
  scene.add(sky);

  /* ---------------- 远山 / 地面雾 / 雪 ---------------- */
  const ridges = CreateRidgeLayers(THREE, scene);
  const mistSprite = library.GetTexture('Texture_MistPatch');
  const mist = CreateGroundMist(THREE, effectsGroup, mistSprite, QualityProfiles.high.mist);
  mist.SetCount(profile.mist);

  const flakeSprite = library.GetTexture('Texture_SnowFlake');
  const dotSprite = library.GetTexture('Texture_SoftDot');
  const smokeSprite = library.GetTexture('Texture_SmokePuff');

  const snowNear = CreateSnowField(THREE, effectsGroup, {
    name: 'PointsSnowNear', capacity: QualityProfiles.high.snowNear, span: 26, ceiling: 16,
    sizeMin: 0.040, sizeMax: 0.105, alphaMin: 0.22, alphaMax: 0.62, sway: 0.35,
    seed: 1.3, sprite: flakeSprite, renderOrder: 6,
  });
  const snowFar = CreateSnowField(THREE, effectsGroup, {
    name: 'PointsSnowFar', capacity: QualityProfiles.high.snowFar, span: 78, ceiling: 30,
    sizeMin: 0.020, sizeMax: 0.055, alphaMin: 0.14, alphaMax: 0.46, sway: 0.10,
    seed: 7.9, sprite: dotSprite, renderOrder: 5,
  });
  snowNear.SetCount(profile.snowNear);
  snowFar.SetCount(profile.snowFar);
  const streaks = CreateSnowStreaks(THREE, effectsGroup, QualityProfiles.high.streaks);
  streaks.SetCount(profile.streaks);

  /* ---------------- 粒子池 / 贴花 ---------------- */
  const poolSoft = CreateParticlePool(THREE, effectsGroup, {
    name: 'PointsParticleSoft', capacity: QualityProfiles.high.poolSoft,
    sprite: smokeSprite, additive: false, renderOrder: 6,
  });
  const poolGlow = CreateParticlePool(THREE, effectsGroup, {
    name: 'PointsParticleGlow', capacity: QualityProfiles.high.poolGlow,
    sprite: dotSprite, additive: true, renderOrder: 9,
  });

  const footprintDecals = CreateDecalField(THREE, effectsGroup, {
    name: 'InstancedFootprints', capacity: QualityProfiles.high.decalFoot,
    map: library.GetTexture('Texture_Footprint'), color: 0x5a6b7e, opacity: 0.55, renderOrder: 2,
  });
  const impactDecals = CreateDecalField(THREE, effectsGroup, {
    name: 'InstancedImpacts', capacity: QualityProfiles.high.decalImpact,
    map: library.GetTexture('Texture_ImpactMark'), color: 0x424b55, opacity: 0.62, renderOrder: 2,
  });

  /* ---------------- 光照 ----------------
   * 四盏常驻灯：
   *   sun     关键光（唯一投影），冬天的太阳其实很弱，靠它做的是**方向**不是亮度
   *   hemi    天穹散射：上半球冷蓝（天），下半球雪的反照 → 阴影自然发蓝
   *   bounce  雪地反光（从下往上打的补光），没有它人物下巴永远是死黑
   *   ambient 兜底，压到很低，防止暗部彻底失去信息
   */
  const sun = new THREE.DirectionalLight(new THREE.Color(0xc6d3e2), 2.35);
  sun.name = 'LightSun';
  sun.castShadow = profile.shadows;
  sun.shadow.mapSize.set(profile.shadowMapSize, profile.shadowMapSize);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 220;
  sun.shadow.bias = -0.00035;
  sun.shadow.normalBias = 0.026;
  scene.add(sun);
  scene.add(sun.target);

  const hemisphere = new THREE.HemisphereLight(new THREE.Color(0x7b96b8), new THREE.Color(0xb4bfca), 0.72);
  hemisphere.name = 'LightHemisphere';
  scene.add(hemisphere);

  const bounce = new THREE.DirectionalLight(new THREE.Color(0xa8bacd), 0.42);
  bounce.name = 'LightSnowBounce';
  bounce.castShadow = false;
  scene.add(bounce);
  scene.add(bounce.target);

  const ambient = new THREE.AmbientLight(new THREE.Color(0x4e5c6e), 0.20);
  ambient.name = 'LightAmbient';
  scene.add(ambient);

  const sunDirection = new THREE.Vector3(0.3, 0.6, -0.7).normalize();
  const skySunDirection = new THREE.Vector3(0.3, 0.2, -0.9).normalize();

  /* ---------------- 天气 ---------------- */
  const weather = {
    preset: 'LightSnow',
    snowRate: Config.Weather.LightSnow.snowRate,
    windDirection: new THREE.Vector2(-0.6, -0.8),
    windSpeed: Config.Weather.LightSnow.windSpeed,
    fogDensity: Config.Weather.LightSnow.fogDensity,
    visibility: Config.Weather.LightSnow.visibility,
    ambientLight: Config.Weather.LightSnow.ambientLight,
  };
  let gustStrength = 0;
  let gustSeconds = 0;

  /* ---------------- mood 状态机 ---------------- */
  const moodFrom = ResolveMoodSpec('ChapterSnowCellar', 0.15, 'LightSnow', {});
  const moodTo = ResolveMoodSpec('ChapterSnowCellar', 0.15, 'LightSnow', {});
  const moodNow = ResolveMoodSpec('ChapterSnowCellar', 0.15, 'LightSnow', {});
  const moodState = { chapterId: 'ChapterSnowCellar', t: 0.15, timeOfDay: 'Dawn', blend: 1, blendSeconds: 1 };

  /* ---------------- 后处理 ---------------- */
  const composer = new EffectComposer(renderer);
  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  const godRayPass = new ShaderPass(GodRayShader);
  godRayPass.material.depthWrite = false;
  godRayPass.material.depthTest = false;
  godRayPass.material.defines.GODRAY_SAMPLES = Math.max(1, profile.godraySamples);
  godRayPass.enabled = profile.godraySamples > 0;
  composer.addPass(godRayPass);

  const bloomPass = new UnrealBloomPass(new THREE.Vector2(640, 360), renderConfig.bloomStrength, 0.78, 0.68);
  bloomPass.enabled = profile.bloom;
  composer.addPass(bloomPass);

  const gradePass = new ShaderPass(GradeShader);
  gradePass.material.depthWrite = false;
  gradePass.material.depthTest = false;
  gradePass.uniforms.uGrain.value = profile.grain;
  gradePass.uniforms.uChroma.value = profile.chroma;
  composer.addPass(gradePass);

  const outputPass = new OutputPass();
  composer.addPass(outputPass);

  /* ---------------- 屏幕状态 ---------------- */
  const screen = {
    vignette: 0.40, vignetteBase: 0.40, vignetteBias: 0,
    stealth: 0, stealthTarget: 0,
    desaturation: 0.15, desaturationBase: 0.15, desaturationBias: 0,
    hurt: 0, hurtTarget: 0,
    frost: 0, frostTarget: 0,
    letterbox: 0, letterboxTarget: 0,
    flashStrength: 0, flashDecay: 4,
    aimMode: false,
    grainEnabled: true, chromaEnabled: true, shakeEnabled: true, flashEnabled: true,
  };
  const shake = { strength: 0, seconds: 0, total: 0.2, frequency: 22 };

  const dynamicLights = [];
  const stats = { drawCalls: 0, triangles: 0, programs: 0, fps: 0, frameMs: 0 };
  const frameSamples = { total: 0, count: 0, last: 0 };
  let elapsed = 0;
  let cloudDrift = 0;
  let lastWorld = null;
  let breathTimer = 1.2;
  let companionBreathTimer = 2.4;
  let gustCooldown = 6;
  let pixelScale = 400;
  let viewportHeight = 900;

  /* 临时向量：这些绝不能在每帧里 new */
  const scratchA = new THREE.Vector3();
  const scratchB = new THREE.Vector3();
  const scratchC = new THREE.Vector3();
  const scratchColor = new THREE.Color();
  const shadowRight = new THREE.Vector3();
  const shadowUp = new THREE.Vector3();
  const shadowFocus = new THREE.Vector3();
  const shadowSnapped = new THREE.Vector3();
  const cameraForward = new THREE.Vector3();
  const projectedSun = new THREE.Vector3();
  const worldUp = new THREE.Vector3(0, 1, 0);
  const moodColorA = new THREE.Color();
  const moodColorB = new THREE.Color();
  const moodColorC = new THREE.Color();

  /* ================================================================ *
   * mood 应用
   * ================================================================ */

  function ApplyMoodToScene(spec) {
    const azimuth = spec.sunAzimuthDeg * MathUtil.DegToRad;
    const skyElevation = spec.sunElevationDeg * MathUtil.DegToRad;
    const keyElevation = spec.shadowElevationDeg * MathUtil.DegToRad;

    skySunDirection.set(
      Math.cos(skyElevation) * Math.sin(azimuth),
      Math.sin(skyElevation),
      Math.cos(skyElevation) * Math.cos(azimuth),
    ).normalize();
    sunDirection.set(
      Math.cos(keyElevation) * Math.sin(azimuth),
      Math.sin(keyElevation),
      Math.cos(keyElevation) * Math.cos(azimuth),
    ).normalize();

    sun.color.setHex(spec.sunColor);
    sun.intensity = spec.sunIntensity;
    hemisphere.color.setHex(spec.skyLightColor);
    hemisphere.groundColor.setHex(spec.groundLightColor);
    hemisphere.intensity = spec.hemiIntensity;
    bounce.color.setHex(spec.bounceColor);
    bounce.intensity = spec.bounceIntensity;
    ambient.color.setHex(spec.ambientColor);
    ambient.intensity = spec.ambientIntensity;

    skyUniforms.uZenith.value.setHex(spec.zenith);
    skyUniforms.uHorizon.value.setHex(spec.horizon);
    skyUniforms.uHaze.value.setHex(spec.hazeColor);
    skyUniforms.uHazeAmount.value = spec.hazeAmount;
    skyUniforms.uCloudDark.value.setHex(spec.cloudDark);
    skyUniforms.uCloudLight.value.setHex(spec.cloudLight);
    skyUniforms.uCloudCover.value = spec.cloudCover;
    skyUniforms.uCloudSharpness.value = spec.cloudSharpness;
    skyUniforms.uSunColor.value.setHex(spec.sunDiskColor);
    skyUniforms.uSunStrength.value = spec.sunDiskStrength;
    skyUniforms.uSunHalo.value = spec.sunHalo;
    skyUniforms.uStars.value = spec.stars;
    skyUniforms.uSunDirection.value.copy(skySunDirection);

    fogUniforms.uFogDensity.value = spec.fogDensity;
    fogUniforms.uFogFalloff.value = spec.fogFalloff;
    fogUniforms.uFogBaseY.value = spec.fogBaseY;
    fogUniforms.uFogGround.value.setHex(spec.fogGround);
    fogUniforms.uFogSky.value.setHex(spec.fogSky);
    fogUniforms.uFogSun.value.setHex(spec.fogSun);
    fogUniforms.uFogInscatter.value = spec.fogInscatter;

    scene.fog.color.setHex(spec.fogSky);
    renderer.setClearColor(scene.fog.color, 1);
    renderer.toneMappingExposure = spec.exposure;

    ridges.ApplyMood(
      moodColorA.setHex(spec.ridgeNear),
      moodColorB.setHex(spec.ridgeFar),
      moodColorC.setHex(spec.ridgeSnow),
      spec.ridgeSnowAmount,
    );

    mist.ApplyMood(moodColorA.setHex(spec.mistColor), spec.mistOpacity);
    snowNear.material.uniforms.uColor.value.setHex(spec.snowColor);
    snowFar.material.uniforms.uColor.value.setHex(spec.snowColor);
    streaks.ApplyMood(moodColorA.setHex(spec.snowColor));
    footprintDecals.SetColor(moodColorA.setHex(spec.footprintColor));
    impactDecals.SetColor(moodColorA.setHex(MixHex(spec.footprintColor, 0x2a2320, 0.5)));

    gradePass.uniforms.uShadowLift.value = spec.shadowLift;
    screen.vignetteBase = spec.vignette;
    screen.desaturationBase = spec.desaturation;
    godRayPass.uniforms.uStrength.value = spec.godray;
    godRayPass.uniforms.uTint.value.setHex(spec.godrayTint);
    bloomPass.strength = renderConfig.bloomStrength * spec.bloom;
  }

  function SetMoodTarget(chapterId, t, blendSeconds) {
    moodState.chapterId = chapterId;
    moodState.t = MathUtil.Clamp01(t);
    LerpMoodSpec(moodNow, moodNow, 0, moodFrom);
    ResolveMoodSpec(chapterId, moodState.t, weather.preset, moodTo);
    moodState.blendSeconds = Math.max(0.001, blendSeconds === undefined ? 1.6 : blendSeconds);
    moodState.blend = blendSeconds === 0 ? 1 : 0;
    if (moodState.blend >= 1) {
      LerpMoodSpec(moodTo, moodTo, 0, moodNow);
      ApplyMoodToScene(moodNow);
    }
  }

  function AdvanceMood(dt) {
    if (moodState.blend >= 1) return;
    moodState.blend = Math.min(1, moodState.blend + dt / moodState.blendSeconds);
    const eased = MathUtil.SmoothStep(0, 1, moodState.blend);
    LerpMoodSpec(moodFrom, moodTo, eased, moodNow);
    ApplyMoodToScene(moodNow);
  }

  /* ================================================================ *
   * 天气
   * ================================================================ */

  function ApplyWeather(preset) {
    const data = Config.Weather[preset] || Config.Weather.LightSnow;
    weather.preset = preset;
    weather.snowRate = data.snowRate;
    weather.windSpeed = data.windSpeed;
    weather.fogDensity = data.fogDensity;
    weather.visibility = data.visibility;
    weather.ambientLight = data.ambientLight;
    const windRadians = data.windDirectionDeg * MathUtil.DegToRad;
    weather.windDirection.set(Math.sin(windRadians), Math.cos(windRadians));
    SetMoodTarget(moodState.chapterId, moodState.t, 2.2);
    if (ctx && ctx.bus && typeof ctx.bus.Emit === 'function') {
      ctx.bus.Emit('WeatherChanged', {
        preset: weather.preset, snowRate: weather.snowRate,
        windSpeed: weather.windSpeed, visibility: weather.visibility,
      });
    }
  }

  /* ================================================================ *
   * 动态光
   * ================================================================ */

  function MakeLightHandle(record) {
    const handle = {
      object: record.group,
      SetPosition(vector) { record.group.position.copy(vector); },
      SetDirection(vector) {
        if (record.light && record.light.target) {
          record.direction.copy(vector).normalize();
          record.light.target.position.copy(record.direction).multiplyScalar(10);
          record.light.target.updateMatrixWorld();
          if (record.shaft) {
            scratchA.copy(record.group.position).add(record.direction);
            record.shaft.mesh.lookAt(scratchA);
          }
        }
      },
      SetIntensity(value) { record.baseIntensity = value; if (record.light) record.light.intensity = value; },
      SetEnabled(value) { record.group.visible = !!value; },
      Dispose() { DisposeLightRecord(record); },
    };
    record.handle = handle;
    dynamicLights.push(record);
    return handle;
  }

  function DisposeLightRecord(record) {
    const index = dynamicLights.indexOf(record);
    if (index >= 0) dynamicLights.splice(index, 1);
    if (record.flame) { record.flame.mesh.geometry.dispose(); record.flame.material.dispose(); record.flame.plane.dispose(); }
    if (record.glow) { record.glow.mesh.geometry.dispose(); record.glow.material.dispose(); }
    if (record.shaft) { record.shaft.mesh.geometry.dispose(); record.shaft.material.dispose(); }
    if (record.group.parent) record.group.parent.remove(record.group);
    if (record.light && record.light.target && record.light.target.parent) {
      record.light.target.parent.remove(record.light.target);
    }
  }

  function ClearAutoLights() {
    for (let i = dynamicLights.length - 1; i >= 0; i -= 1) {
      if (dynamicLights[i].auto) DisposeLightRecord(dynamicLights[i]);
    }
  }

  /** 世界一换就把 world.spawns.fireSpots 变成真正的火堆：本作唯一的暖色锚点。 */
  function EnsureWorldFires(frameCtx) {
    const world = frameCtx && frameCtx.world;
    if (world === lastWorld) return;
    lastWorld = world;
    ClearAutoLights();
    if (!world || !world.spawns || !Array.isArray(world.spawns.fireSpots)) return;
    for (let i = 0; i < world.spawns.fireSpots.length; i += 1) {
      const spot = world.spawns.fireSpots[i];
      if (!spot) continue;
      const handle = art.CreateFireLight(spot, { radius: 10.5, intensity: 5.4, flicker: 0.34, scale: 1.15 });
      const record = dynamicLights[dynamicLights.length - 1];
      if (record && record.handle === handle) record.auto = true;
    }
  }

  /* ================================================================ *
   * 阴影相机：跟随 + texel 吸附（不吸附会有爬行的阴影边）
   * ================================================================ */

  function UpdateShadowCamera() {
    if (!sun.castShadow) return;
    const half = profile.shadowDistance * 0.42;
    if (sun.shadow.camera.right !== half) {
      sun.shadow.camera.left = -half;
      sun.shadow.camera.right = half;
      sun.shadow.camera.top = half;
      sun.shadow.camera.bottom = -half;
      sun.shadow.camera.updateProjectionMatrix();
    }
    camera.getWorldDirection(cameraForward);
    const lead = half * 0.30;
    let groundY = 0;
    if (ctx && ctx.world && typeof ctx.world.SampleHeight === 'function') {
      groundY = ctx.world.SampleHeight(camera.position.x, camera.position.z) || 0;
    }
    shadowFocus.set(
      camera.position.x + cameraForward.x * lead,
      groundY,
      camera.position.z + cameraForward.z * lead,
    );
    shadowRight.copy(worldUp).cross(sunDirection);
    if (shadowRight.lengthSq() < 0.0001) shadowRight.set(1, 0, 0);
    shadowRight.normalize();
    shadowUp.copy(sunDirection).cross(shadowRight).normalize();
    const texel = (half * 2) / Math.max(1, sun.shadow.mapSize.x);
    const px = Math.round(shadowFocus.dot(shadowRight) / texel) * texel;
    const py = Math.round(shadowFocus.dot(shadowUp) / texel) * texel;
    const pz = shadowFocus.dot(sunDirection);
    shadowSnapped.set(0, 0, 0)
      .addScaledVector(shadowRight, px)
      .addScaledVector(shadowUp, py)
      .addScaledVector(sunDirection, pz);
    sun.target.position.copy(shadowSnapped);
    sun.target.updateMatrixWorld();
    sun.position.copy(shadowSnapped).addScaledVector(sunDirection, half * 2 + 55);
    /* 反光板从雪地往上打，跟着相机走即可，不投影 */
    bounce.position.set(camera.position.x - sunDirection.x * 18, camera.position.y - 8, camera.position.z - sunDirection.z * 18);
    bounce.target.position.set(camera.position.x, camera.position.y + 2, camera.position.z);
    bounce.target.updateMatrixWorld();
  }

  /* ================================================================ *
   * 事件订阅：Art 主动消费玩法事件，不需要别人来调我
   * ================================================================ */

  const unsubscribers = [];
  function Subscribe(name, handler) {
    if (!ctx || !ctx.bus || typeof ctx.bus.On !== 'function') return;
    unsubscribers.push(ctx.bus.On(name, handler));
  }

  /* 枪口用的一盏共享闪光灯：每次开枪只是把它点亮 0.05 秒，不 new 光源 */
  const muzzleLight = new THREE.PointLight(new THREE.Color(Palette.MuzzleFlash), 0, 14, 2);
  muzzleLight.name = 'LightMuzzleFlash';
  muzzleLight.castShadow = false;
  effectsGroup.add(muzzleLight);
  let muzzleSeconds = 0;

  const art = {
    renderer: renderer,
    scene: scene,
    camera: camera,
    effectsGroup: effectsGroup,
    stats: stats,

    /* ---------------- 材质与贴图 ---------------- */
    GetMaterial(key, overrides) { return library.GetMaterial(key, overrides); },
    GetTexture(key) { return library.GetTexture(key); },
    MakeVariant(key, variantId, overrides) { return library.MakeVariant(key, variantId, overrides); },
    RegisterMaterial(key, material) { return library.RegisterMaterial(key, material); },

    /* ---------------- 环境 ---------------- */
    SetTimeOfDay(preset, blendSeconds) {
      const mapped = TimeOfDayToMood[preset] || TimeOfDayToMood.Dawn;
      moodState.timeOfDay = preset;
      SetMoodTarget(mapped.chapterId, mapped.t, blendSeconds === undefined ? 1.8 : blendSeconds);
    },
    SetWeather(preset, blendSeconds) {
      ApplyWeather(preset);
      if (blendSeconds !== undefined) moodState.blendSeconds = Math.max(0.001, blendSeconds);
    },
    /**
     * 章节情绪：三幕各一套 light rig，t 是幕内进度 [0,1]。
     * 第三幕的 t 就是"黄昏 → 深夜"的那条线，剧情导演可以在追逐段落把它推到 1。
     */
    SetChapterMood(chapterId, t, blendSeconds) {
      if (!MoodRigs[chapterId]) return false;
      SetMoodTarget(chapterId, t === undefined ? 0 : t, blendSeconds === undefined ? 2.4 : blendSeconds);
      return true;
    },
    GetChapterMood() { return { chapterId: moodState.chapterId, t: moodState.t }; },
    GetWeather() {
      return {
        preset: weather.preset, snowRate: weather.snowRate,
        windDirection: weather.windDirection, windSpeed: weather.windSpeed + gustStrength,
        fogDensity: weather.fogDensity, visibility: weather.visibility, ambientLight: weather.ambientLight,
      };
    },
    SetWindGust(strength, seconds) { gustStrength = strength; gustSeconds = seconds; },
    /** World.GetLightLevel 会调它做潜行判定：暗处 = 能藏。 */
    GetAmbientLightLevel(position) {
      let level = MathUtil.Clamp01(moodNow.ambientLevel);
      if (position) {
        for (let i = 0; i < dynamicLights.length; i += 1) {
          const record = dynamicLights[i];
          if (!record.group.visible || !record.light) continue;
          const distance = record.group.position.distanceTo(position);
          const radius = record.light.distance || 12;
          if (distance < radius) {
            const falloff = 1 - distance / radius;
            level += falloff * falloff * MathUtil.Clamp01(record.light.intensity / 6);
          }
        }
      }
      return MathUtil.Clamp01(level);
    },

    /* ---------------- 动态光 ---------------- */
    CreateFireLight(position, lightOptions) {
      const opt = lightOptions || {};
      const scale = opt.scale === undefined ? 1 : opt.scale;
      const group = new THREE.Group();
      group.position.copy(position);
      const light = new THREE.PointLight(
        new THREE.Color(Palette.FireMid),
        opt.intensity === undefined ? 5.5 : opt.intensity,
        opt.radius === undefined ? 10 : opt.radius,
        1.8,
      );
      light.position.set(0, 0.55 * scale, 0);
      light.castShadow = false;
      group.add(light);
      const flame = CreateFireQuads(THREE, library.GetTexture('Texture_Flame'));
      flame.material.uniforms.uScale.value = 0.78 * scale;
      flame.mesh.position.set(0, 0.06, 0);
      group.add(flame.mesh);
      const glow = CreateGlowSprite(THREE, dotSprite, Palette.Ember, 2.35 * scale);
      glow.mesh.position.set(0, 0.34 * scale, 0);
      group.add(glow.mesh);
      effectsGroup.add(group);
      return MakeLightHandle({
        group: group, light: light, flame: flame, glow: glow, kind: 'Fire',
        baseIntensity: light.intensity, flicker: opt.flicker === undefined ? 0.30 : opt.flicker,
        emberTimer: 0, smokeTimer: 0, scale: scale, seed: dynamicLights.length * 1.37,
        direction: new THREE.Vector3(0, 0, -1), auto: false,
      });
    },
    CreateSpotLight(spotOptions) {
      const opt = spotOptions || {};
      const kind = opt.kind || 'Flashlight';
      const isSearchlight = kind === 'Searchlight';
      const group = new THREE.Group();
      if (opt.position) group.position.copy(opt.position);
      const halfAngleDeg = opt.halfAngleDeg || (isSearchlight ? 12 : 18);
      const range = opt.range || (isSearchlight ? Config.Enemy.searchlightRange : Config.Enemy.flashlightRange);
      const light = new THREE.SpotLight(
        new THREE.Color(isSearchlight ? Palette.SearchlightBeam : Palette.LanternGlow),
        opt.intensity === undefined ? (isSearchlight ? 26 : 9) : opt.intensity,
        range,
        halfAngleDeg * MathUtil.DegToRad,
        0.42,
        1.3,
      );
      light.castShadow = false;
      group.add(light);
      group.add(light.target);
      light.target.position.set(0, 0, -1);
      /* 看得见的光柱：探照灯浓，手电淡到几乎只有一层薄纱 */
      const shaft = CreateLightShaft(
        THREE, range * 0.9, halfAngleDeg,
        isSearchlight ? Palette.SearchlightBeam : Palette.LanternGlow,
        isSearchlight ? 0.16 : 0.05,
      );
      group.add(shaft.mesh);
      effectsGroup.add(group);
      const record = {
        group: group, light: light, shaft: shaft, kind: kind,
        baseIntensity: light.intensity, flicker: isSearchlight ? 0.04 : 0.09,
        direction: new THREE.Vector3(0, 0, -1), seed: dynamicLights.length * 2.11, auto: false,
      };
      const handle = MakeLightHandle(record);
      if (opt.direction) handle.SetDirection(opt.direction);
      return handle;
    },
    CreateFlare(position, flareOptions) {
      const opt = flareOptions || {};
      const group = new THREE.Group();
      group.position.copy(position);
      const light = new THREE.PointLight(
        new THREE.Color(Palette.FlareLight), 18,
        Config.Enemy.flareLightRadius || 26, 1.5,
      );
      light.castShadow = false;
      group.add(light);
      const glow = CreateGlowSprite(THREE, dotSprite, Palette.FlareLight, 2.4);
      group.add(glow.mesh);
      effectsGroup.add(group);
      return MakeLightHandle({
        group: group, light: light, glow: glow, kind: 'Flare',
        baseIntensity: 18, flicker: 0.16, seconds: opt.seconds === undefined ? (Config.Enemy.flareBurnSeconds || 12) : opt.seconds,
        velocity: opt.driftVelocity ? opt.driftVelocity.clone() : new THREE.Vector3(0, 0.35, 0),
        emberTimer: 0, seed: dynamicLights.length * 3.7,
        direction: new THREE.Vector3(0, 0, -1), auto: false,
      });
    },

    /* ---------------- 一次性特效 ---------------- */
    SpawnImpact(position, normal, surface) {
      const nx = normal ? normal.x : 0;
      const ny = normal ? normal.y : 1;
      const nz = normal ? normal.z : 0;
      const isSnow = surface === 'Snow' || surface === 'Ice' || surface === undefined;
      const puffColor = scratchColor.setHex(isSnow ? 0xe4ecf4 : (surface === 'Wood' ? 0x8a7358 : 0x8b8f94));
      for (let i = 0; i < 9; i += 1) {
        const spread = 2.6;
        poolSoft.Emit(
          position.x, position.y, position.z,
          nx * 1.8 + (MathUtil.Hash1(elapsed * 91 + i) - 0.5) * spread,
          ny * 1.8 + MathUtil.Hash1(elapsed * 37 + i) * spread,
          nz * 1.8 + (MathUtil.Hash1(elapsed * 53 + i) - 0.5) * spread,
          0.05 + MathUtil.Hash1(i * 3.3) * 0.07, puffColor, 0.55, -7, 2.4, 0.85, 1.4,
        );
      }
      /* 石/铁上才有火星——这是画面里少数几处合法的暖色，必须克制 */
      if (surface === 'Stone' || surface === 'Metal') {
        const sparkColor = scratchColor.setHex(Palette.Ember);
        for (let i = 0; i < 5; i += 1) {
          poolGlow.Emit(
            position.x, position.y, position.z,
            nx * 3 + (MathUtil.Hash1(elapsed * 17 + i) - 0.5) * 4,
            ny * 3 + MathUtil.Hash1(elapsed * 23 + i) * 3,
            nz * 3 + (MathUtil.Hash1(elapsed * 31 + i) - 0.5) * 4,
            0.028, sparkColor, 0.42, -11, 1.6, 1, 0,
          );
        }
      }
      if (ny > 0.45) {
        impactDecals.Stamp(
          position.x, position.y + 0.012, position.z,
          MathUtil.Hash1(elapsed * 7 + position.x) * Math.PI * 2,
          0.34, 0.34, 26, elapsed,
        );
      }
    },
    SpawnMuzzleFlash(position, direction, scale) {
      const size = scale || 1;
      const dirX = direction ? direction.x : 0;
      const dirY = direction ? direction.y : 0;
      const dirZ = direction ? direction.z : -1;
      const core = scratchColor.setHex(Palette.MuzzleFlash);
      for (let i = 0; i < 7; i += 1) {
        poolGlow.Emit(
          position.x, position.y, position.z,
          dirX * 7 + (MathUtil.Hash1(i * 7.1) - 0.5) * 1.6,
          dirY * 7 + (MathUtil.Hash1(i * 11.7) - 0.5) * 1.6,
          dirZ * 7 + (MathUtil.Hash1(i * 5.9) - 0.5) * 1.6,
          0.16 * size, core, 0.085, 0, 11, 1, 0.6,
        );
      }
      const emberColor = scratchColor.setHex(Palette.Ember);
      for (let i = 0; i < 4; i += 1) {
        poolGlow.Emit(
          position.x, position.y, position.z,
          dirX * 4 + (MathUtil.Hash1(i * 3.3 + 1) - 0.5) * 3,
          dirY * 4 + 0.6 + (MathUtil.Hash1(i * 9.1) - 0.5) * 2,
          dirZ * 4 + (MathUtil.Hash1(i * 13.7) - 0.5) * 3,
          0.035, emberColor, 0.45, -6, 1.4, 0.9, 0,
        );
      }
      /* 火药的烟：栓动步枪一枪一团，是暴露位置的视觉证据 */
      const smokeColor = scratchColor.setHex(0x9aa0a4);
      for (let i = 0; i < 3; i += 1) {
        poolSoft.Emit(
          position.x + dirX * 0.3, position.y + dirY * 0.3, position.z + dirZ * 0.3,
          dirX * 1.4, dirY * 1.4 + 0.4, dirZ * 1.4,
          0.16 * size, smokeColor, 1.5, 0.25, 1.5, 0.42, 2.6,
        );
      }
      muzzleLight.position.set(position.x, position.y, position.z);
      muzzleLight.intensity = 26 * size;
      muzzleSeconds = 0.055;
    },
    SpawnSnowBurst(position, strength) {
      const power = strength === undefined ? 1 : strength;
      const color = scratchColor.setHex(0xe8eff6);
      const count = Math.round(12 * power);
      for (let i = 0; i < count; i += 1) {
        poolSoft.Emit(
          position.x, position.y + 0.05, position.z,
          (MathUtil.Hash1(elapsed * 17 + i) - 0.5) * 2.4 * power,
          0.7 + MathUtil.Hash1(elapsed * 29 + i) * 2.0 * power,
          (MathUtil.Hash1(elapsed * 41 + i) - 0.5) * 2.4 * power,
          0.07 + MathUtil.Hash1(i * 2.7) * 0.09, color, 0.95, -3.0, 1.5, 0.8, 1.1,
        );
      }
    },
    SpawnBreathPuff(position, direction, strength) {
      const power = strength === undefined ? 1 : strength;
      const color = scratchColor.setHex(0xdfe8f2);
      for (let i = 0; i < 3; i += 1) {
        poolSoft.Emit(
          position.x, position.y, position.z,
          (direction ? direction.x : 0) * 0.75 * power + (MathUtil.Hash1(i * 3.1 + elapsed) - 0.5) * 0.2,
          0.16 + MathUtil.Hash1(i * 4.9 + elapsed) * 0.14,
          (direction ? direction.z : -1) * 0.75 * power + (MathUtil.Hash1(i * 6.3 + elapsed) - 0.5) * 0.2,
          0.075 + i * 0.02, color, 1.05 + power * 0.5, 0.10, 1.7, 0.32 + power * 0.20, 3.2,
        );
      }
    },
    SpawnFootprint(position, forward, surface, side) {
      if (surface === 'Water') return;
      const yaw = forward ? Math.atan2(forward.x, forward.z) : 0;
      const lateral = side === 'L' ? -0.115 : 0.115;
      const life = surface === 'Snow' ? (Config.Stealth.footprintLifeSeconds || 90) : 26;
      footprintDecals.Stamp(
        position.x + Math.cos(yaw) * lateral,
        position.y + 0.014,
        position.z - Math.sin(yaw) * lateral,
        yaw, 0.21, 0.38, life, elapsed,
      );
    },
    SpawnSmoke(position, smokeOptions) {
      const opt = smokeOptions || {};
      const seconds = opt.seconds === undefined ? 2.6 : opt.seconds;
      const scale = opt.scale === undefined ? 1 : opt.scale;
      const color = scratchColor.setHex(opt.color === undefined ? 0x7d8288 : opt.color);
      for (let i = 0; i < 4; i += 1) {
        poolSoft.Emit(
          position.x + (MathUtil.Hash1(elapsed * 23 + i) - 0.5) * 0.3 * scale,
          position.y, position.z + (MathUtil.Hash1(elapsed * 31 + i) - 0.5) * 0.3 * scale,
          (MathUtil.Hash1(elapsed * 13 + i) - 0.5) * 0.35,
          0.45 + MathUtil.Hash1(i * 9.1 + elapsed) * 0.5,
          (MathUtil.Hash1(elapsed * 19 + i) - 0.5) * 0.35,
          0.28 * scale, color, seconds, 0.08, 0.55, 0.34, 2.8,
        );
      }
    },
    SpawnDebris(position, count, surface) {
      const color = scratchColor.setHex(surface === 'Wood' ? 0x7a6247 : (surface === 'Snow' ? 0xdde5ee : 0x71767c));
      const total = count || 6;
      for (let i = 0; i < total; i += 1) {
        poolSoft.Emit(
          position.x, position.y + 0.1, position.z,
          (MathUtil.Hash1(elapsed * 13 + i) - 0.5) * 3.4,
          1.3 + MathUtil.Hash1(i * 8.3 + elapsed) * 2.2,
          (MathUtil.Hash1(elapsed * 19 + i) - 0.5) * 3.4,
          0.035 + MathUtil.Hash1(i * 1.9) * 0.035, color, 1.2, -10, 0.7, 0.9, 0,
        );
      }
    },
    ClearTransient() {
      poolSoft.Clear();
      poolGlow.Clear();
      footprintDecals.Clear();
      impactDecals.Clear();
      muzzleLight.intensity = 0;
      muzzleSeconds = 0;
    },

    /* ---------------- 屏幕表现 ---------------- */
    ShakeCamera(strength, seconds, frequency) {
      if (!screen.shakeEnabled) return;
      shake.strength = Math.max(shake.strength, strength);
      shake.seconds = Math.max(shake.seconds, seconds);
      shake.total = Math.max(shake.total, seconds);
      shake.frequency = frequency || 22;
    },
    FlashScreen(color, strength, seconds) {
      if (!screen.flashEnabled) return;
      gradePass.uniforms.uFlashColor.value.set(color);
      screen.flashStrength = Math.max(screen.flashStrength, MathUtil.Clamp01(strength));
      screen.flashDecay = 1 / Math.max(0.05, seconds || 0.2);
    },
    SetVignette(strength, blendSeconds) {
      screen.vignetteBias = strength - screen.vignetteBase;
      if (blendSeconds === 0) screen.vignette = strength;
    },
    /** 低血/低温的边缘结霜。**不是血**：冷调、发亮，与受伤的暗红是两套读数。 */
    SetDamageOverlay(intensity) { screen.frostTarget = MathUtil.Clamp01(intensity); },
    /** 受伤瞬间的褪色与暗红收边（红线二：不做伤口展示，只做生理感受）。 */
    PulseDamage(strength) {
      const power = strength === undefined ? 1 : MathUtil.Clamp01(strength);
      screen.hurtTarget = Math.max(screen.hurtTarget, 0.35 + power * 0.5);
      screen.hurt = Math.max(screen.hurt, screen.hurtTarget);
      art.ShakeCamera(0.10 + power * 0.16, 0.30 + power * 0.2, 26);
      art.FlashScreen(0x2a0d0a, 0.14 * power, 0.22);
    },
    SetAimMode(on, blendSeconds) {
      screen.aimMode = !!on;
      screen.vignetteBias = on ? 0.16 : 0;
      if (blendSeconds === 0) screen.vignette = screen.vignetteBase + screen.vignetteBias;
    },
    /** 潜行时收边：蹲下藏好，画面自己会告诉你"世界把你包住了"。 */
    SetStealthMode(amount) { screen.stealthTarget = MathUtil.Clamp01(amount); },
    SetLetterbox(on, blendSeconds) {
      screen.letterboxTarget = on ? 1 : 0;
      if (blendSeconds === 0) screen.letterbox = screen.letterboxTarget;
    },
    SetDesaturation(amount, blendSeconds) {
      screen.desaturationBias = MathUtil.Clamp01(amount) - screen.desaturationBase;
      if (blendSeconds === 0) screen.desaturation = MathUtil.Clamp01(amount);
    },
    SetTimeScaleVisual(scale) {
      const slow = 1 - MathUtil.Clamp01(scale);
      screen.desaturationBias = slow * 0.30;
      screen.vignetteBias = slow * 0.14;
    },
    /** hitstop 的统一入口：视觉 + 请求 Boot 改 timeScale（ctx.timeScale 只有 Boot 能写）。 */
    SetTimeScale(scale, seconds, reason) {
      art.SetTimeScaleVisual(scale);
      if (ctx && ctx.bus && typeof ctx.bus.Emit === 'function') {
        ctx.bus.Emit('RequestTimeScale', { scale: scale, seconds: seconds === undefined ? 0.09 : seconds, reason: reason || 'Art' });
      }
    },
    /** 无障碍与设置面板用：单独关掉某一类效果。 */
    SetEffectEnabled(name, enabled) {
      if (name === 'shake') screen.shakeEnabled = !!enabled;
      else if (name === 'flash') { screen.flashEnabled = !!enabled; if (!enabled) screen.flashStrength = 0; }
      else if (name === 'grain') { screen.grainEnabled = !!enabled; gradePass.uniforms.uGrain.value = enabled ? profile.grain : 0; }
      else if (name === 'chroma') { screen.chromaEnabled = !!enabled; gradePass.uniforms.uChroma.value = enabled ? profile.chroma : 0; }
      else if (name === 'bloom') bloomPass.enabled = !!enabled && profile.bloom;
      else if (name === 'godray') godRayPass.enabled = !!enabled && profile.godraySamples > 0;
    },

    /* ---------------- 生命周期 ---------------- */
    Resize(width, height, pixelRatio) {
      const safeWidth = Math.max(1, Math.floor(width));
      const safeHeight = Math.max(1, Math.floor(height));
      const ratio = Math.min(profile.pixelCap, pixelRatio || 1);
      renderer.setPixelRatio(ratio);
      renderer.setSize(safeWidth, safeHeight, false);
      composer.setPixelRatio(ratio);
      composer.setSize(safeWidth, safeHeight);
      camera.aspect = safeWidth / safeHeight;
      camera.updateProjectionMatrix();
      gradePass.uniforms.uAspect.value = camera.aspect;
      viewportHeight = safeHeight * ratio;
      /* 辉光跑半分辨率：它本来就是低频层，全分辨率纯属浪费 */
      bloomPass.setSize(
        Math.max(160, Math.floor(safeWidth * profile.bloomScale)),
        Math.max(90, Math.floor(safeHeight * profile.bloomScale)),
      );
    },
    SetQuality(level) {
      const next = QualityProfiles[level] ? level : 'medium';
      if (next === currentQuality) return;
      currentQuality = next;
      profile = QualityProfiles[next];
      renderer.shadowMap.enabled = profile.shadows;
      sun.castShadow = profile.shadows;
      if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
      sun.shadow.mapSize.set(profile.shadowMapSize, profile.shadowMapSize);
      sun.shadow.camera.right = -1;
      mist.SetCount(profile.mist);
      streaks.SetCount(profile.streaks);
      godRayPass.enabled = profile.godraySamples > 0;
      if (profile.godraySamples > 0) {
        godRayPass.material.defines.GODRAY_SAMPLES = profile.godraySamples;
        godRayPass.material.needsUpdate = true;
      }
      bloomPass.enabled = profile.bloom;
      gradePass.uniforms.uGrain.value = screen.grainEnabled ? profile.grain : 0;
      gradePass.uniforms.uChroma.value = screen.chromaEnabled ? profile.chroma : 0;
      if (typeof window !== 'undefined') {
        art.Resize(renderer.domElement.clientWidth || 1280, renderer.domElement.clientHeight || 720,
          Math.min(profile.pixelCap, window.devicePixelRatio || 1));
      }
    },
    GetQuality() { return currentQuality; },

    Update(dt, frameCtx) {
      const step = Math.min(0.1, Math.max(0, dt));
      elapsed += step;

      /* —— 1. 镜头抖动：叠加在 Player 写好的变换之上，必须先于矩阵刷新 —— */
      if (shake.seconds > 0) {
        shake.seconds -= step;
        const decay = MathUtil.Clamp01(shake.seconds / Math.max(0.001, shake.total));
        const amount = shake.strength * decay * decay;
        scratchA.set(
          Math.sin(elapsed * shake.frequency) * amount,
          Math.sin(elapsed * shake.frequency * 1.41 + 1.1) * amount,
          Math.sin(elapsed * shake.frequency * 0.83 + 2.3) * amount * 0.35,
        ).applyQuaternion(camera.quaternion);
        camera.position.add(scratchA);
        camera.rotateZ(Math.sin(elapsed * shake.frequency * 0.71) * amount * 0.12);
        if (shake.seconds <= 0) { shake.strength = 0; shake.seconds = 0; }
      }
      camera.updateMatrixWorld();
      camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
      pixelScale = viewportHeight * 0.5 / Math.tan(camera.fov * 0.5 * MathUtil.DegToRad);

      /* —— 2. mood 推进 —— */
      AdvanceMood(step);

      /* —— 3. 高度雾的相机项：全场材质共享同一份 uniform，一帧只写一次 —— */
      fogUniforms.uFogCameraY.value = camera.position.y;
      fogUniforms.uFogUpView.value.copy(worldUp).transformDirection(camera.matrixWorldInverse);
      fogUniforms.uFogSunView.value.copy(skySunDirection).transformDirection(camera.matrixWorldInverse);

      /* —— 4. 风 —— */
      if (gustSeconds > 0) {
        gustSeconds -= step;
        if (gustSeconds <= 0) { gustSeconds = 0; gustStrength = 0; }
      }
      const windSpeed = weather.windSpeed + gustStrength;
      const windX = weather.windDirection.x * windSpeed * 0.42;
      const windZ = weather.windDirection.y * windSpeed * 0.42;

      /* —— 5. 天空与远山 —— */
      sky.position.copy(camera.position);
      cloudDrift += step * moodNow.cloudSpeed * (1 + windSpeed * 0.08);
      skyUniforms.uCloudOffset.value.set(cloudDrift * 1.0, cloudDrift * 0.42);
      skyUniforms.uSunDirection.value.copy(skySunDirection);
      ridges.Follow(camera.position);
      ridges.SyncFog(fogUniforms);

      /* —— 6. 天气粒子 —— */
      const snowRate = MathUtil.Clamp01(weather.snowRate * moodNow.snowRateScale);
      const fall = MathUtil.Lerp(1.0, 4.6, snowRate);
      mist.Update(step, elapsed, camera.position, windX * 0.5, windZ * 0.5);
      snowNear.SyncFog(fogUniforms, pixelScale);
      snowFar.SyncFog(fogUniforms, pixelScale);
      snowNear.Update(step, elapsed, camera.position, windX, windZ, fall, MathUtil.Clamp01(0.30 + snowRate * 0.85));
      snowFar.Update(step, elapsed, camera.position, windX * 0.85, windZ * 0.85, fall * 0.8, MathUtil.Clamp01(0.22 + snowRate * 0.9));
      streaks.Update(elapsed, camera, windX * 2.6, windZ * 2.6, MathUtil.Clamp01((snowRate - 0.55) * 1.9) * 0.7);

      /* —— 7. 粒子池 —— */
      poolSoft.SyncFog(fogUniforms, pixelScale);
      poolGlow.SyncFog(fogUniforms, pixelScale);
      poolSoft.Update(step);
      poolGlow.Update(step);
      footprintDecals.SetTime(elapsed);
      impactDecals.SetTime(elapsed);

      /* —— 8. 动态光 —— */
      if (muzzleSeconds > 0) {
        muzzleSeconds -= step;
        muzzleLight.intensity *= 0.35;
        if (muzzleSeconds <= 0) { muzzleSeconds = 0; muzzleLight.intensity = 0; }
      }
      for (let i = dynamicLights.length - 1; i >= 0; i -= 1) {
        const record = dynamicLights[i];
        if (!record.group.visible) continue;
        const wobble = MathUtil.Wobble(elapsed * 3.6 + record.seed, record.seed);
        if (record.light && record.flicker) {
          record.light.intensity = record.baseIntensity * (1 + wobble * record.flicker);
        }
        if (record.flame) {
          record.flame.material.uniforms.uTime.value = elapsed;
          record.flame.material.uniforms.uFlicker.value = record.flicker * 2.4;
        }
        if (record.glow) {
          record.glow.material.uniforms.uStrength.value = 0.55 + wobble * 0.22;
        }
        if (record.kind === 'Fire') {
          record.emberTimer -= step;
          if (record.emberTimer <= 0) {
            record.emberTimer = 0.035 + MathUtil.Hash1(elapsed * 3.1 + record.seed) * 0.06;
            const emberColor = scratchColor.setHex(MathUtil.Hash1(elapsed * 5.7) > 0.6 ? Palette.FireCore : Palette.Ember);
            poolGlow.Emit(
              record.group.position.x + (MathUtil.Hash1(elapsed * 9.3 + record.seed) - 0.5) * 0.35 * record.scale,
              record.group.position.y + 0.35 * record.scale,
              record.group.position.z + (MathUtil.Hash1(elapsed * 11.9 + record.seed) - 0.5) * 0.35 * record.scale,
              (MathUtil.Hash1(elapsed * 13.1) - 0.5) * 0.5 + windX * 0.18,
              1.1 + MathUtil.Hash1(elapsed * 17.7) * 1.0,
              (MathUtil.Hash1(elapsed * 19.3) - 0.5) * 0.5 + windZ * 0.18,
              0.045 + MathUtil.Hash1(elapsed * 23.9) * 0.035, emberColor,
              1.5 + MathUtil.Hash1(elapsed * 29.1) * 1.4, 0.35, 0.55, 1, 0,
            );
          }
          record.smokeTimer -= step;
          if (record.smokeTimer <= 0) {
            record.smokeTimer = 0.42 + MathUtil.Hash1(elapsed * 7.7 + record.seed) * 0.30;
            const smokeColor = scratchColor.setHex(0x5d6167);
            poolSoft.Emit(
              record.group.position.x, record.group.position.y + 0.8 * record.scale, record.group.position.z,
              windX * 0.32 + (MathUtil.Hash1(elapsed * 31.3) - 0.5) * 0.25,
              0.75 + MathUtil.Hash1(elapsed * 37.1) * 0.5,
              windZ * 0.32 + (MathUtil.Hash1(elapsed * 41.7) - 0.5) * 0.25,
              0.34 * record.scale, smokeColor, 5.5, 0.10, 0.42, 0.26, 3.4,
            );
          }
        } else if (record.kind === 'Flare') {
          record.seconds -= step;
          record.group.position.addScaledVector(record.velocity, step);
          record.velocity.multiplyScalar(0.986);
          record.emberTimer -= step;
          if (record.emberTimer <= 0) {
            record.emberTimer = 0.05;
            const flareColor = scratchColor.setHex(Palette.FlareLight);
            poolGlow.Emit(
              record.group.position.x, record.group.position.y, record.group.position.z,
              (MathUtil.Hash1(elapsed * 43.1) - 0.5) * 0.8, -0.4, (MathUtil.Hash1(elapsed * 47.3) - 0.5) * 0.8,
              0.05, flareColor, 1.2, -0.6, 0.9, 1, 1.2,
            );
          }
          if (record.seconds <= 0) DisposeLightRecord(record);
        }
      }

      /* —— 9. 呵气 / 潜行收边 / 阵风：这三件事没有别的模块会来驱动，Art 自己读 ctx 做 ——
         纲领里"呵气"和"潜行时的边缘暗化"是点名要的氛围，等别人来调用只会永远没有。 */
      const player = frameCtx && frameCtx.player;
      if (player) {
        breathTimer -= step;
        if (breathTimer <= 0) {
          /* 冷、累、跑起来，呼吸就急——白气的节奏本身就是状态显示 */
          const speed = (player.state && player.state.speed) || 0;
          const sprinting = !!(player.state && player.state.sprinting);
          breathTimer = MathUtil.Lerp(2.6, 1.15, MathUtil.Clamp01(speed / 4.4)) * (sprinting ? 0.62 : 1);
          if (typeof player.GetEyePosition === 'function' && typeof player.GetForward === 'function') {
            player.GetEyePosition(scratchB);
            player.GetForward(scratchC);
            scratchB.addScaledVector(scratchC, 0.16).setY(scratchB.y - 0.08);
            art.SpawnBreathPuff(scratchB, scratchC, 0.55 + MathUtil.Clamp01(speed / 4.4) * 0.75);
          }
        }
        if (player.state) {
          const crouched = player.state.stance === 'Crouch';
          const prone = player.state.stance === 'Prone';
          art.SetStealthMode(prone ? 1 : (crouched ? 0.6 : 0));
        }
      }
      const companion = frameCtx && frameCtx.companion;
      if (companion && companion.position) {
        companionBreathTimer -= step;
        if (companionBreathTimer <= 0) {
          /* 小满个子小、呼吸快，白气更频更小——这是"她还在你旁边"的无声提示 */
          companionBreathTimer = 1.5 + MathUtil.Hash1(elapsed * 3.7) * 1.0;
          scratchB.set(companion.position.x, companion.position.y + 1.24, companion.position.z);
          scratchC.set(Math.sin(elapsed * 0.4), 0, Math.cos(elapsed * 0.4));
          art.SpawnBreathPuff(scratchB, scratchC, 0.42);
        }
      }
      gustCooldown -= step;
      if (gustCooldown <= 0) {
        /* 风不是常数。隔一阵来一下，雪、雾、火苗一起动，世界才像活的 */
        const base = weather.windSpeed;
        gustCooldown = MathUtil.Lerp(9, 3.2, MathUtil.Clamp01(base / 9.5)) + MathUtil.Hash1(elapsed * 5.1) * 4;
        art.SetWindGust(base * (0.35 + MathUtil.Hash1(elapsed * 7.3) * 0.55), 1.6 + MathUtil.Hash1(elapsed * 2.9) * 2.2);
      }

      /* —— 10. 阴影相机 —— */
      UpdateShadowCamera();

      /* —— 11. 世界换了就重新点火 —— */
      EnsureWorldFires(frameCtx);

      /* —— 12. 屏幕分级 —— */
      screen.vignette = MathUtil.Damp(screen.vignette, screen.vignetteBase + screen.vignetteBias, 6, step);
      screen.desaturation = MathUtil.Damp(screen.desaturation, MathUtil.Clamp01(screen.desaturationBase + screen.desaturationBias), 4, step);
      screen.stealth = MathUtil.Damp(screen.stealth, screen.stealthTarget, 5, step);
      screen.frost = MathUtil.Damp(screen.frost, screen.frostTarget, 3, step);
      screen.letterbox = MathUtil.Damp(screen.letterbox, screen.letterboxTarget, 7, step);
      screen.hurtTarget = Math.max(0, screen.hurtTarget - step * 0.85);
      screen.hurt = MathUtil.Damp(screen.hurt, screen.hurtTarget, 3.2, step);
      if (screen.flashStrength > 0) screen.flashStrength = Math.max(0, screen.flashStrength - screen.flashDecay * step);
      const grade = gradePass.uniforms;
      grade.uVignette.value = screen.vignette;
      grade.uStealth.value = screen.stealth;
      grade.uDesaturation.value = screen.desaturation;
      grade.uHurt.value = screen.hurt;
      grade.uFrost.value = screen.frost;
      grade.uLetterbox.value = screen.letterbox;
      grade.uFlashStrength.value = screen.flashStrength;
      grade.uTime.value = elapsed;

      /* —— 13. 体积光的太阳屏幕位置 —— */
      camera.getWorldDirection(cameraForward);
      const facing = cameraForward.dot(skySunDirection);
      if (facing > 0.02 && godRayPass.enabled) {
        projectedSun.copy(camera.position).addScaledVector(skySunDirection, 350).project(camera);
        const uvX = projectedSun.x * 0.5 + 0.5;
        const uvY = projectedSun.y * 0.5 + 0.5;
        godRayPass.uniforms.uSunUv.value.set(uvX, uvY);
        const marginX = 1 - MathUtil.Clamp01((Math.abs(uvX - 0.5) - 0.5) * 2.2);
        const marginY = 1 - MathUtil.Clamp01((Math.abs(uvY - 0.5) - 0.5) * 2.2);
        godRayPass.uniforms.uOnScreen.value = MathUtil.Clamp01(facing * 1.6) * marginX * marginY;
      } else {
        godRayPass.uniforms.uOnScreen.value = 0;
      }

      if (frameCtx && frameCtx.debug && frameCtx.debug.gizmos) {
        frameCtx.debug.gizmos.visible = !!frameCtx.debug.enabled;
      }
    },

    Render() {
      const started = (typeof performance !== 'undefined' && performance.now) ? performance.now() : 0;
      /* autoReset 会在每个 pass 后清零，统计就只剩最后那个全屏四边形；手动管窗口才有意义 */
      renderer.info.autoReset = false;
      renderer.info.reset();
      composer.render();
      const info = renderer.info;
      stats.drawCalls = info.render.calls;
      stats.triangles = info.render.triangles;
      stats.programs = info.programs ? info.programs.length : 0;
      if (started) {
        const spent = performance.now() - started;
        frameSamples.total += spent;
        frameSamples.count += 1;
        if (frameSamples.count >= 20) {
          stats.frameMs = Math.round((frameSamples.total / frameSamples.count) * 100) / 100;
          stats.fps = stats.frameMs > 0 ? Math.round(1000 / stats.frameMs) : 0;
          frameSamples.total = 0;
          frameSamples.count = 0;
        }
      }
    },

    Dispose() {
      for (let i = unsubscribers.length - 1; i >= 0; i -= 1) {
        if (typeof unsubscribers[i] === 'function') unsubscribers[i]();
      }
      unsubscribers.length = 0;
      for (let i = dynamicLights.length - 1; i >= 0; i -= 1) DisposeLightRecord(dynamicLights[i]);
      poolSoft.Dispose();
      poolGlow.Dispose();
      footprintDecals.Dispose();
      impactDecals.Dispose();
      snowNear.Dispose();
      snowFar.Dispose();
      streaks.Dispose();
      mist.Dispose();
      ridges.Dispose();
      sky.geometry.dispose();
      sky.material.dispose();
      library.Dispose();
      composer.dispose();
      renderer.dispose();
    },
  };

  /* ================================================================ *
   * 订阅：Art 自己去听玩法事件，别的模块不需要认识我
   * ================================================================ */

  Subscribe('GunFired', (payload) => {
    if (!payload || !payload.position) return;
    art.SpawnMuzzleFlash(payload.position, payload.direction, payload.isPlayer ? 1 : 0.85);
    if (payload.isPlayer) {
      art.ShakeCamera(0.22, 0.22, 30);
      art.FlashScreen(0xffd9a0, 0.06, 0.10);
    }
  });
  Subscribe('PlayerDamaged', (payload) => {
    const amount = payload && payload.amount ? payload.amount : 10;
    art.PulseDamage(MathUtil.Clamp01(amount / 45));
  });
  Subscribe('HealthChanged', (payload) => {
    if (!payload || !payload.maxHealth) return;
    const ratio = MathUtil.Clamp01(payload.health / payload.maxHealth);
    /* 低血 = 视野褪色收边，不是红屏 */
    screen.desaturationBias = Math.max(screen.desaturationBias, (1 - ratio) * 0.22);
  });
  Subscribe('WarmthChanged', (payload) => {
    if (!payload || !payload.maxWarmth) return;
    const ratio = MathUtil.Clamp01(payload.warmth / payload.maxWarmth);
    art.SetDamageOverlay(MathUtil.Clamp01((0.45 - ratio) * 2.2));
  });
  Subscribe('EnemyAlertChanged', (payload) => {
    if (!payload) return;
    if (payload.level === 2 && payload.previous !== 2) art.ShakeCamera(0.05, 0.18, 18);
  });
  Subscribe('MeleeHit', () => {
    art.ShakeCamera(0.16, 0.16, 34);
  });
  Subscribe('ThrowLanded', (payload) => {
    if (payload && payload.position) art.SpawnSnowBurst(payload.position, 1.2);
  });
  Subscribe('ChapterChanged', (payload) => {
    if (payload && payload.chapterId && MoodRigs[payload.chapterId]) {
      art.SetChapterMood(payload.chapterId, 0, 2.4);
    }
  });
  Subscribe('QualityChanged', (payload) => {
    if (payload && payload.level) art.SetQuality(payload.level);
  });
  Subscribe('SettingsChanged', (payload) => {
    const values = payload && payload.settings;
    if (!values) return;
    if (values.cameraShake !== undefined) art.SetEffectEnabled('shake', values.cameraShake);
    if (values.flashEffects !== undefined) art.SetEffectEnabled('flash', values.flashEffects);
    if (values.filmGrain !== undefined) art.SetEffectEnabled('grain', values.filmGrain);
    if (values.postProcessing !== undefined) {
      art.SetEffectEnabled('bloom', values.postProcessing);
      art.SetEffectEnabled('godray', values.postProcessing);
      art.SetEffectEnabled('chroma', values.postProcessing);
    }
  });

  ApplyWeather('LightSnow');
  SetMoodTarget('ChapterSnowCellar', 0.15, 0);
  if (typeof window !== 'undefined') {
    art.Resize(window.innerWidth || 1280, window.innerHeight || 720, Math.min(profile.pixelCap, window.devicePixelRatio || 1));
  }

  return art;
}

export default CreateArt;
