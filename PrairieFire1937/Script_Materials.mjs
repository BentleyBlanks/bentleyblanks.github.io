// 《燎原 · 敌后1937》 —— 程序化材质与纹理工厂。
//
// 本模块是渲染层的"美术资产库"。项目没有任何外部贴图/模型文件，
// 因此这里负责用 Canvas2D / DataTexture / 噪声 / GLSL 现场生成全部表面表现：
//   · 地形材质（MeshStandardMaterial + onBeforeCompile 注入：顶点色细化、岩层、积雪、
//     政权染色、战争迷雾三态、指数高度雾）
//   · 程序化天穹（渐变 + 太阳辉光 + 分层云带）
//   · 河流水面（法线扰动 + 菲涅尔 + 流动）
//   · 战争迷雾云层、地毯高亮 / 悬停描边 / 选中脉冲环
//   · 四季 × 时期光照色板、旗帜/横幅贴图
//
// 约定：模块顶层不执行任何 DOM / WebGL 副作用，全部访问都在函数内部完成，
// 以便 node 侧只做语法与导出符号校验。函数名 PascalCase，变量 lowerCamelCase。

import * as THREE from "three";
import { Clamp, Clamp01, Lerp, FractalNoise2D, ValueNoise2D, HashString } from "./Script_Hex.mjs";

// ---------------------------------------------------------------------------
// 0. 缓存与回退数据表
// ---------------------------------------------------------------------------

/** 纹理缓存：key → THREE.Texture。DisposeMaterialCache() 统一释放。 */
const textureCache = new Map();
/** 已创建材质登记表，用于统一释放（WeakSet 无法遍历，这里用 Set）。 */
const materialRegistry = new Set();

/**
 * Data_Terrain.mjs 由另一 agent 并行编写，可能晚于渲染层到位。
 * 这里保存一份完整的内置回退表：字段缺失 / 文件缺失时都能独立跑通。
 */
export const fallbackTerrainDefinitions = Object.freeze({
  Mountain: { key: "Mountain", name: "高山", elevationBand: [0.76, 1.0], colorLow: "#6b6760", colorHigh: "#b6b2a8" },
  Ridge: { key: "Ridge", name: "山脊", elevationBand: [0.58, 0.86], colorLow: "#77705f", colorHigh: "#a89b85" },
  Hill: { key: "Hill", name: "丘陵", elevationBand: [0.38, 0.66], colorLow: "#7c7549", colorHigh: "#a89861" },
  Forest: { key: "Forest", name: "林地", elevationBand: [0.30, 0.72], colorLow: "#3b4f3c", colorHigh: "#617553" },
  Plain: { key: "Plain", name: "平原", elevationBand: [0.04, 0.30], colorLow: "#77804d", colorHigh: "#9aa065" },
  Loess: { key: "Loess", name: "黄土", elevationBand: [0.24, 0.58], colorLow: "#9a8452", colorHigh: "#c3aa76" },
  Marsh: { key: "Marsh", name: "沼泽", elevationBand: [0.01, 0.20], colorLow: "#54634a", colorHigh: "#78855e" },
  River: { key: "River", name: "河川", elevationBand: [0.0, 0.16], colorLow: "#55675e", colorHigh: "#758478" },
  Gorge: { key: "Gorge", name: "峡谷", elevationBand: [0.28, 0.70], colorLow: "#57504a", colorHigh: "#877d70" },
});

/**
 * 渲染专属地形档案。Data_Terrain 只承诺颜色/高程带，这些"起伏、岩层、雪线偏置"
 * 是纯美术参数，永远由本模块提供，不依赖外部文件。
 *
 * 值阶约定（第三轮修复）：strataHigh 必须明显低于同地形的 colorHigh，
 * strataLow 再低一档。侧壁是背光面，一旦岩层色比受光顶面还亮，
 * 每块地砖就会镶出一道白边，整图读作"叠起来的灰条纸盒"。
 * 这里统一取 colorHigh 的 ~0.60（高层）/ ~0.36（低层），保留色相、只压明度。
 */
export const terrainRenderProfiles = Object.freeze({
  Mountain: { relief: 0.300, peak: 0.480, roughness: 0.94, snowBias: 0.00, wet: 0.06, strataLow: "#403d38", strataHigh: "#6d6a62", water: false },
  Ridge: { relief: 0.240, peak: 0.300, roughness: 0.95, snowBias: 0.10, wet: 0.08, strataLow: "#3d3930", strataHigh: "#665e4f", water: false },
  Hill: { relief: 0.180, peak: 0.150, roughness: 0.97, snowBias: 0.26, wet: 0.20, strataLow: "#3f3826", strataHigh: "#695c3a", water: false },
  Forest: { relief: 0.130, peak: 0.075, roughness: 0.98, snowBias: 0.30, wet: 0.42, strataLow: "#262e20", strataHigh: "#3d4a34", water: false },
  Plain: { relief: 0.055, peak: 0.010, roughness: 0.99, snowBias: 0.56, wet: 0.36, strataLow: "#3a3c26", strataHigh: "#61643f", water: false },
  Loess: { relief: 0.150, peak: 0.060, roughness: 0.99, snowBias: 0.44, wet: 0.16, strataLow: "#493f2b", strataHigh: "#79694a", water: false },
  Marsh: { relief: 0.040, peak: 0.000, roughness: 0.84, snowBias: 0.64, wet: 0.86, strataLow: "#2d3223", strataHigh: "#4b533a", water: false },
  River: { relief: -0.045, peak: -0.085, roughness: 0.72, snowBias: 0.72, wet: 1.00, strataLow: "#2c322d", strataHigh: "#49534b", water: true },
  Gorge: { relief: 0.250, peak: -0.150, roughness: 0.96, snowBias: 0.18, wet: 0.30, strataLow: "#332f2a", strataHigh: "#554e46", water: false },
});

const defaultProfile = Object.freeze({
  relief: 0.10, peak: 0.02, roughness: 0.96, snowBias: 0.4, wet: 0.3,
  strataLow: "#3a352d", strataHigh: "#635c50", water: false,
  colorLow: "#7a7460", colorHigh: "#a89f88",
});

/**
 * 合并外部 Data_Terrain 定义与内置回退，得到渲染需要的完整地形档案。
 * 外部定义缺字段（甚至整个文件缺失）都不会抛错。
 */
export function ResolveTerrainProfile(terrainKey, terrainDefinitions) {
  const key = typeof terrainKey === "string" && terrainKey ? terrainKey : "Plain";
  const fallback = fallbackTerrainDefinitions[key] || fallbackTerrainDefinitions.Plain;
  const external = terrainDefinitions && typeof terrainDefinitions === "object" ? terrainDefinitions[key] : null;
  const render = terrainRenderProfiles[key] || defaultProfile;
  const band = (external && Array.isArray(external.elevationBand) && external.elevationBand.length === 2)
    ? external.elevationBand
    : fallback.elevationBand;
  // 注意回退次序：外部字段非法时要退回该地形自己的内置色，而不是通用灰色
  return {
    key,
    name: (external && external.name) || fallback.name || key,
    colorLow: NormalizeColorText((external && external.colorLow) || fallback.colorLow, fallback.colorLow || "#7a7460"),
    colorHigh: NormalizeColorText((external && external.colorHigh) || fallback.colorHigh, fallback.colorHigh || "#a89f88"),
    elevationBand: [Number(band[0]) || 0, Number(band[1]) || 1],
    relief: render.relief ?? defaultProfile.relief,
    peak: render.peak ?? defaultProfile.peak,
    roughness: render.roughness ?? defaultProfile.roughness,
    snowBias: render.snowBias ?? defaultProfile.snowBias,
    wet: render.wet ?? defaultProfile.wet,
    strataLow: NormalizeColorText(render.strataLow, defaultProfile.strataLow),
    strataHigh: NormalizeColorText(render.strataHigh, defaultProfile.strataHigh),
    water: !!render.water,
  };
}

/** 颜色文本清洗：非法值回退到默认色，避免 Data_ 文件笔误导致整张地图变黑。 */
function NormalizeColorText(value, fallbackText) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return fallbackText;
  const text = value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(text)) return text;
  if (/^#[0-9a-fA-F]{3}$/.test(text)) return text;
  return fallbackText;
}

// ---------------------------------------------------------------------------
// 1. 四季 × 时期 光照色板
// ---------------------------------------------------------------------------

const seasonKeys = ["Autumn", "Winter", "Spring", "Summer"];
const seasonNames = { Autumn: "秋", Winter: "冬", Spring: "春", Summer: "夏" };

/** 四季基准：太阳高度角、色温、雾、植被基调、雪量。 */
const seasonBase = Object.freeze({
  Autumn: {
    sunColor: 0xffd9a4, sunElevation: 44, sunAzimuth: 138, sunIntensity: 2.55,
    skyColor: 0xa9c0d4, groundColor: 0x6a6152, ambientIntensity: 0.78,
    fogColor: 0xb9bfb2, fogDensity: 0.0092, zenith: 0x39699d, horizon: 0xc9cfc0,
    cloudColor: 0xf1ece0, cloudOpacity: 0.42, snowAmount: 0.06, snowLine: 0.86,
    grass: 0x8b8a4e, rock: 0x8b8577, snow: 0xe9edf0, water: 0x49716d, seasonTint: 0xd8c08a,
  },
  Winter: {
    sunColor: 0xf3e2cc, sunElevation: 28, sunAzimuth: 152, sunIntensity: 2.05,
    skyColor: 0xb6c6d2, groundColor: 0x5d6265, ambientIntensity: 0.86,
    fogColor: 0xc3ccd2, fogDensity: 0.0124, zenith: 0x4a6f96, horizon: 0xd3dae0,
    cloudColor: 0xe7eaee, cloudOpacity: 0.58, snowAmount: 0.92, snowLine: 0.28,
    grass: 0x6f7360, rock: 0x8d8f8a, snow: 0xf0f4f7, water: 0x4e7777, seasonTint: 0xb8c4cc,
  },
  Spring: {
    sunColor: 0xffe9c6, sunElevation: 50, sunAzimuth: 128, sunIntensity: 2.7,
    skyColor: 0xa8c6e0, groundColor: 0x6b6a4e, ambientIntensity: 0.82,
    fogColor: 0xc2c9bd, fogDensity: 0.0085, zenith: 0x3b74ad, horizon: 0xd0d6c6,
    cloudColor: 0xf6f2e8, cloudOpacity: 0.36, snowAmount: 0.22, snowLine: 0.74,
    grass: 0x7c9450, rock: 0x8a857a, snow: 0xecf1f4, water: 0x467874, seasonTint: 0xc6d29a,
  },
  Summer: {
    sunColor: 0xfff1d2, sunElevation: 62, sunAzimuth: 116, sunIntensity: 2.95,
    skyColor: 0x9dc2e6, groundColor: 0x6f6d4c, ambientIntensity: 0.9,
    fogColor: 0xc7cec0, fogDensity: 0.0077, zenith: 0x2f6fb2, horizon: 0xd6dccb,
    cloudColor: 0xfaf6ec, cloudOpacity: 0.46, snowAmount: 0.0, snowLine: 0.95,
    grass: 0x5f7f3f, rock: 0x8d8878, snow: 0xeef2f5, water: 0x37746f, seasonTint: 0xa9c47f,
  },
});

/**
 * 五个时期的"影像风格"修正：
 * 开辟期清亮秋光 / 发展期均衡 / 困难期低角度冷灰 / 恢复期暖尘 / 反攻期暖金逆光。
 */
const eraGrade = Object.freeze({
  Opening: {
    sunScale: 1.06, elevationDelta: 4, azimuthDelta: 0, warm: 0.16, fogScale: 0.92,
    saturation: 1.14, contrast: 1.04, vignette: 0.20, grain: 0.010, bloomThreshold: 0.70, bloomStrength: 0.58,
    shadowTint: 0x3a3a40, highlightTint: 0xffe4b2, lift: 0.010,
  },
  Growth: {
    sunScale: 1.0, elevationDelta: 0, azimuthDelta: 8, warm: 0.08, fogScale: 1.0,
    saturation: 1.08, contrast: 1.05, vignette: 0.22, grain: 0.011, bloomThreshold: 0.72, bloomStrength: 0.54,
    shadowTint: 0x353840, highlightTint: 0xffe1ae, lift: 0.012,
  },
  Hardship: {
    sunScale: 0.80, elevationDelta: -14, azimuthDelta: 22, warm: -0.22, fogScale: 1.42,
    saturation: 0.80, contrast: 1.10, vignette: 0.24, grain: 0.017, bloomThreshold: 0.78, bloomStrength: 0.40,
    shadowTint: 0x232a34, highlightTint: 0xd7dde2, lift: 0.020,
  },
  Recovery: {
    sunScale: 0.96, elevationDelta: -4, azimuthDelta: 12, warm: 0.12, fogScale: 1.14,
    saturation: 0.94, contrast: 1.06, vignette: 0.23, grain: 0.013, bloomThreshold: 0.74, bloomStrength: 0.50,
    shadowTint: 0x2c3138, highlightTint: 0xf6dcae, lift: 0.014,
  },
  Counter: {
    sunScale: 1.12, elevationDelta: -8, azimuthDelta: -34, warm: 0.30, fogScale: 1.04,
    saturation: 1.08, contrast: 1.08, vignette: 0.22, grain: 0.010, bloomThreshold: 0.66, bloomStrength: 0.76,
    shadowTint: 0x2f2a2c, highlightTint: 0xffd58a, lift: 0.008,
  },
});

/** 把整数色向暖 / 冷方向推，warm ∈ [-1, 1]。 */
function ShiftColorTemperature(hex, warm) {
  const r = (hex >> 16) & 0xff;
  const g = (hex >> 8) & 0xff;
  const b = hex & 0xff;
  const nr = Clamp(Math.round(r * (1 + warm * 0.16)), 0, 255);
  const ng = Clamp(Math.round(g * (1 + warm * 0.03)), 0, 255);
  const nb = Clamp(Math.round(b * (1 - warm * 0.18)), 0, 255);
  return (nr << 16) | (ng << 8) | nb;
}

function MixColorInt(a, b, t) {
  const k = Clamp01(t);
  const ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff;
  const br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff;
  const r = Math.round(Lerp(ar, br, k));
  const g = Math.round(Lerp(ag, bg, k));
  const bl = Math.round(Lerp(ab, bb, k));
  return (r << 16) | (g << 8) | bl;
}

/**
 * 生成某一回合的完整色板。一回合 = 一季度，turn 0 = 1937 秋。
 * 返回纯数据（颜色为整数），不依赖 three，便于 UI / 特效模块复用。
 */
export function CreateSeasonPalette(eraKey, turn) {
  const safeTurn = Number.isFinite(turn) ? Math.max(0, Math.floor(turn)) : 0;
  const seasonKey = seasonKeys[safeTurn % 4];
  const base = seasonBase[seasonKey];
  const era = eraGrade[eraKey] || eraGrade.Growth;
  // 同一季节内做一点年际漂移，避免八年 32 回合完全重复。
  const drift = (ValueNoise2D(safeTurn * 0.37, 3.1, 1937) - 0.5) * 2;

  const sunElevation = Clamp(base.sunElevation + era.elevationDelta + drift * 3.0, 9, 78);
  const sunAzimuth = base.sunAzimuth + era.azimuthDelta + drift * 6.0;
  const sunColor = ShiftColorTemperature(base.sunColor, era.warm);
  const fogColor = ShiftColorTemperature(base.fogColor, era.warm * 0.5);

  return {
    eraKey: eraKey || "Growth",
    turn: safeTurn,
    seasonKey,
    seasonName: seasonNames[seasonKey],
    year: 1937 + Math.floor((safeTurn + 0) / 4),
    sun: {
      color: sunColor,
      intensity: base.sunIntensity * era.sunScale,
      elevation: sunElevation,
      azimuth: sunAzimuth,
    },
    ambient: {
      sky: ShiftColorTemperature(base.skyColor, era.warm * 0.35),
      ground: ShiftColorTemperature(base.groundColor, era.warm * 0.6),
      intensity: base.ambientIntensity * (1 + (1 - era.sunScale) * 0.35),
    },
    fog: {
      color: fogColor,
      density: base.fogDensity * era.fogScale,
      heightBase: 0.35,
      heightFalloff: 0.42,
    },
    sky: {
      zenith: ShiftColorTemperature(base.zenith, era.warm * 0.25),
      horizon: ShiftColorTemperature(base.horizon, era.warm * 0.55),
      ground: ShiftColorTemperature(base.groundColor, era.warm * 0.4),
      cloudColor: ShiftColorTemperature(base.cloudColor, era.warm * 0.4),
      cloudOpacity: Clamp01(base.cloudOpacity * era.fogScale * 0.92),
      sunColor: MixColorInt(sunColor, 0xffffff, 0.25),
    },
    grass: ShiftColorTemperature(base.grass, era.warm * 0.5),
    rock: ShiftColorTemperature(base.rock, era.warm * 0.3),
    snow: base.snow,
    snowAmount: base.snowAmount,
    snowLine: base.snowLine,
    water: base.water,
    seasonTint: ShiftColorTemperature(base.seasonTint, era.warm * 0.7),
    memoryTint: 0x707a86,
    unexplored: 0x1e2430,
    scorch: 0x2a221d,
    // 政权染色：低饱和、按"敌占暗红 → 争夺土褐 → 游击暖卡其 → 根据地暖黄"渐进，
    // 只做地表淡染，不做高饱和描边。
    control: {
      Enemy: 0x6a2c26,
      Contested: 0x7a6a44,
      Guerrilla: 0x8f7c46,
      Base: 0xac8c40,
    },
    grade: {
      saturation: era.saturation,
      contrast: era.contrast,
      lift: era.lift,
      vignette: era.vignette,
      grain: era.grain,
      shadowTint: era.shadowTint,
      highlightTint: era.highlightTint,
      bloomThreshold: era.bloomThreshold,
      bloomStrength: era.bloomStrength,
    },
  };
}

// ---------------------------------------------------------------------------
// 2. 程序化噪声纹理
// ---------------------------------------------------------------------------

/** 双线性拼接技巧：把 fbm 在 0..1 的单位方格上做无缝化，得到四方连续图案。 */
function TileableFractal(u, v, frequency, seed, octaves) {
  const options = { octaves, persistence: 0.52, lacunarity: 2.0, seed, frequency: 1 };
  const x = u * frequency;
  const y = v * frequency;
  const a = FractalNoise2D(x, y, options);
  const b = FractalNoise2D(x - frequency, y, options);
  const c = FractalNoise2D(x, y - frequency, options);
  const d = FractalNoise2D(x - frequency, y - frequency, options);
  const iu = 1 - u;
  const iv = 1 - v;
  return a * iu * iv + b * u * iv + c * iu * v + d * u * v;
}

/**
 * 生成四通道细节噪声 DataTexture（四方连续）：
 *   R = 大尺度 fbm（土壤晕染）  G = 山脊噪声（岩层/纹脉）
 *   B = 细颗粒（近景砂砾）      A = 扭曲低频（云 / 流动）
 */
export function CreateNoiseTexture(size = 128, options = {}) {
  const resolution = Math.max(16, Math.min(512, Math.floor(size) || 128));
  const seed = Number.isFinite(options.seed) ? options.seed : 19370701;
  const octaves = Math.max(1, Math.min(6, options.octaves ?? 3));
  const frequency = options.frequency ?? 4;
  const cacheKey = `noise:${resolution}:${seed}:${octaves}:${frequency}`;
  if (!options.fresh && textureCache.has(cacheKey)) return textureCache.get(cacheKey);

  const data = new Uint8Array(resolution * resolution * 4);
  for (let y = 0; y < resolution; y += 1) {
    const v = y / resolution;
    for (let x = 0; x < resolution; x += 1) {
      const u = x / resolution;
      const broad = TileableFractal(u, v, frequency, seed, octaves);
      const ridgeRaw = TileableFractal(u, v, frequency * 2.1, seed + 911, Math.max(2, octaves));
      const ridge = 1 - Math.abs(ridgeRaw * 2 - 1);
      const grain = TileableFractal(u, v, frequency * 6.3, seed + 4409, 2);
      const warp = TileableFractal(u + broad * 0.12, v - broad * 0.12, frequency * 0.6, seed + 7717, Math.max(2, octaves - 1));
      const index = (y * resolution + x) * 4;
      data[index] = Clamp(Math.round(broad * 255), 0, 255);
      data[index + 1] = Clamp(Math.round(ridge * 255), 0, 255);
      data[index + 2] = Clamp(Math.round((grain * 0.75 + broad * 0.25) * 255), 0, 255);
      data[index + 3] = Clamp(Math.round(warp * 255), 0, 255);
    }
  }

  const texture = new THREE.DataTexture(data, resolution, resolution, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = options.anisotropy || 4;
  texture.needsUpdate = true;
  texture.name = cacheKey;
  if (!options.fresh) textureCache.set(cacheKey, texture);
  return texture;
}

/**
 * 1×1 占位状态纹理。渲染器建好真正的 hexState 之前，材质里的 sampler2D 不能是 null
 * （否则 three 会绑定空纹理并刷警告）。默认值 = 已探索 + 完全可见 + 无归属 + 无破坏。
 */
export function CreateStateFallbackTexture(fill = [255, 255, 0, 0]) {
  const cacheKey = `stateFallback:${fill.join(",")}`;
  if (textureCache.has(cacheKey)) return textureCache.get(cacheKey);
  const texture = new THREE.DataTexture(new Uint8Array(fill), 1, 1, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  texture.name = cacheKey;
  textureCache.set(cacheKey, texture);
  return texture;
}

// ---------------------------------------------------------------------------
// 3. 共享 GLSL 片段
// ---------------------------------------------------------------------------

/**
 * 平顶六边形有向距离场（局部坐标已归一化到外接圆 1，顶点落在 ±x）。
 * 内切圆半径 = √3/2 = 0.8660254，与 Script_Hex 的 HexCornerOffsets 完全一致。
 */
const glslHexSdf = `
float SdFlatHexagon( vec2 p ) {
  const vec3 k = vec3( -0.8660254, 0.5, 0.5773503 );
  const float apothem = 0.8660254;
  vec2 q = abs( p );
  q -= 2.0 * min( dot( k.xy, q ), 0.0 ) * k.xy;
  q -= vec2( clamp( q.x, -k.z * apothem, k.z * apothem ), apothem );
  return length( q ) * sign( q.y );
}
`;

const glslHash = `
float Hash21( vec2 p ) {
  vec3 q = fract( vec3( p.xyx ) * vec3( 0.1031, 0.1030, 0.0973 ) );
  q += dot( q, q.yzx + 33.33 );
  return fract( ( q.x + q.y ) * q.z );
}
float ValueNoise( vec2 p ) {
  vec2 i = floor( p );
  vec2 f = fract( p );
  vec2 u = f * f * ( 3.0 - 2.0 * f );
  float a = Hash21( i );
  float b = Hash21( i + vec2( 1.0, 0.0 ) );
  float c = Hash21( i + vec2( 0.0, 1.0 ) );
  float d = Hash21( i + vec2( 1.0, 1.0 ) );
  return mix( mix( a, b, u.x ), mix( c, d, u.x ), u.y );
}
float Fbm( vec2 p, int octaves ) {
  float total = 0.0;
  float amplitude = 0.5;
  for ( int i = 0; i < 6; i ++ ) {
    if ( i >= octaves ) break;
    total += amplitude * ValueNoise( p );
    p *= 2.03;
    amplitude *= 0.5;
  }
  return total;
}
`;

const glslControlTint = `
vec3 ControlTint( float code ) {
  vec3 tint = uControlEnemy;
  tint = mix( tint, uControlContested, step( 0.16, code ) );
  tint = mix( tint, uControlGuerrilla, step( 0.50, code ) );
  tint = mix( tint, uControlBase, step( 0.83, code ) );
  return tint;
}
`;

// ---------------------------------------------------------------------------
// 4. 地形材质
// ---------------------------------------------------------------------------

/**
 * 地形主材质。基于 MeshStandardMaterial（可接 CSM 级联阴影），
 * 用 onBeforeCompile 注入全部程序化表现。返回材质上挂：
 *   material.userData.uniforms          —— 供渲染器逐帧/逐回合改写
 *   material.userData.baseOnBeforeCompile —— 供 CSM 链式包装
 *   material.userData.ApplyPalette(p)   —— 一键套用季节色板
 */
export function CreateTerrainMaterial(renderer, options = {}) {
  const anisotropy = renderer && renderer.capabilities
    ? Math.min(8, renderer.capabilities.getMaxAnisotropy())
    : 4;
  const noiseTexture = options.noiseTexture || CreateNoiseTexture(options.noiseSize || 128, { anisotropy });
  noiseTexture.anisotropy = Math.max(noiseTexture.anisotropy, anisotropy);

  const uniforms = {
    uTime: { value: 0 },
    uHexState: { value: options.hexStateTexture || CreateStateFallbackTexture() },
    uNoiseMap: { value: noiseTexture },
    uNoiseScale: { value: options.noiseScale ?? 0.30 },
    uDetailStrength: { value: options.detailStrength ?? 1.0 },
    uBumpStrength: { value: options.bumpStrength ?? 0.9 },
    uSnowColor: { value: new THREE.Color(0xeef2f5) },
    uSnowLine: { value: 0.7 },
    uSnowBlend: { value: 0.16 },
    uSnowAmount: { value: 0.15 },
    uSeasonTint: { value: new THREE.Color(0xd8c08a) },
    uSeasonStrength: { value: 0.24 },
    uValleyTint: { value: new THREE.Color(0x5f7360) },
    // 岩层色必须低于受光顶面：过亮会在每块地砖顶沿镶出一道白边
    uStrataLow: { value: new THREE.Color(0x413a31) },
    uStrataHigh: { value: new THREE.Color(0x6f6659) },
    uControlEnemy: { value: new THREE.Color(0x8a3226) },
    uControlContested: { value: new THREE.Color(0xa5813a) },
    uControlGuerrilla: { value: new THREE.Color(0xb4523c) },
    uControlBase: { value: new THREE.Color(0xc0492e) },
    uControlStrength: { value: options.controlStrength ?? 0.15 },
    uScorchColor: { value: new THREE.Color(0x2a221d) },
    uUnexploredColor: { value: new THREE.Color(0x1e2430) },
    uUnexploredMix: { value: 0.76 },
    uMemoryTint: { value: new THREE.Color(0x707a86) },
    uMemoryStrength: { value: 0.78 },
    uFogHeightBase: { value: 0.35 },
    uFogHeightFalloff: { value: 0.42 },
    uWallBounce: { value: 0.34 },
  };

  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.96,
    metalness: 0.0,
    dithering: true,
    name: "PrairieTerrain",
  });

  const baseOnBeforeCompile = function TerrainOnBeforeCompile(shader) {
    Object.assign(shader.uniforms, uniforms);

    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
attribute vec2 aHexUv;
attribute vec3 aFacet;
varying vec2 vHexUv;
varying vec3 vFacet;
varying vec3 vTerrainWorld;`
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
vHexUv = aHexUv;
vFacet = aFacet;
vTerrainWorld = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;`
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
uniform float uTime;
uniform sampler2D uHexState;
uniform sampler2D uNoiseMap;
uniform float uNoiseScale;
uniform float uDetailStrength;
uniform float uBumpStrength;
uniform vec3 uSnowColor;
uniform float uSnowLine;
uniform float uSnowBlend;
uniform float uSnowAmount;
uniform vec3 uSeasonTint;
uniform float uSeasonStrength;
uniform vec3 uValleyTint;
uniform vec3 uStrataLow;
uniform vec3 uStrataHigh;
uniform vec3 uControlEnemy;
uniform vec3 uControlContested;
uniform vec3 uControlGuerrilla;
uniform vec3 uControlBase;
uniform float uControlStrength;
uniform vec3 uScorchColor;
uniform vec3 uUnexploredColor;
uniform float uUnexploredMix;
uniform vec3 uMemoryTint;
uniform float uMemoryStrength;
uniform float uFogHeightBase;
uniform float uFogHeightFalloff;
uniform float uWallBounce;
varying vec2 vHexUv;
varying vec3 vFacet;
varying vec3 vTerrainWorld;
${glslControlTint}`
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
float terrainSnow = 0.0;
float terrainWet = vFacet.z * vFacet.x;
{
  vec4 hexState = texture2D( uHexState, vHexUv );
  float explored = hexState.r;
  float visible = hexState.g;
  float controlCode = hexState.b;
  float scorch = hexState.a;

  vec2 detailUv = vTerrainWorld.xz * uNoiseScale;
  vec3 fineNoise = texture2D( uNoiseMap, detailUv * 3.3 ).rgb;
  vec3 broadNoise = texture2D( uNoiseMap, detailUv * 0.43 ).rgb;
  // 拉开噪声对比，否则 fbm 集中在 0.3~0.7 之间，顶面看上去是一块死板的纯色
  float breakup = mix( broadNoise.r, fineNoise.b, 0.5 );
  breakup = clamp( ( breakup - 0.5 ) * 2.2 + 0.5, 0.0, 1.0 );
  float grit = fineNoise.b * 0.5 + broadNoise.g * 0.5;

  vec3 albedo = diffuseColor.rgb;
  albedo *= mix( 1.0, 0.62 + 0.78 * breakup, uDetailStrength );
  // 近景砂砾：小尺度的明暗颗粒，给顶面 54 个三角一点可读的质感
  albedo *= mix( 1.0, 0.90 + 0.22 * grit, uDetailStrength );

  // 侧壁：按高度分岩层，交替明暗带 + 噪声打断，做出沉积层理。
  // 值阶铁律——侧壁永远比受光顶面低 1~1.5 档：岩层色只做"层理调制"，
  // 不允许把侧壁整体抬到顶面之上（那会给每块地砖镶白边）。
  float wall = 1.0 - vFacet.x;
  float depthT = clamp( vFacet.z, 0.0, 1.0 );
  float bandPhase = fract( depthT * 3.0 + broadNoise.g * 0.45 );
  vec3 strata = mix( uStrataHigh, uStrataLow, smoothstep( 0.0, 1.0, depthT ) );
  strata *= 0.62 + 0.40 * step( 0.5, bandPhase ) + 0.18 * fineNoise.g;
  albedo = mix( albedo, albedo * 0.62 + strata * 0.45, wall * 0.90 );

  // 山顶积雪：随季节的雪量与雪线，只覆盖顶面与近顶壁。
  float snowField = smoothstep( uSnowLine, uSnowLine + uSnowBlend, vFacet.y + breakup * 0.07 - terrainWet * 0.28 );
  terrainSnow = snowField * uSnowAmount * ( 0.18 + 0.82 * vFacet.x );
  albedo = mix( albedo, uSnowColor * ( 0.86 + 0.26 * fineNoise.b ), terrainSnow );

  // 河谷湿润带：压暗、偏冷绿。
  albedo = mix( albedo, albedo * 0.76 + uValleyTint * 0.24, terrainWet * 0.55 );

  // 季节色偏 + 焦土
  albedo = mix( albedo, albedo * uSeasonTint * 1.18, uSeasonStrength );
  albedo = mix( albedo, uScorchColor, scorch * 0.7 );

  // 政权归属淡染（未探索区不泄露归属）
  albedo = mix( albedo, mix( albedo, ControlTint( controlCode ), uControlStrength ), explored );

  // 已探索但本回合不可见 → 降饱和的灰调"记忆"，并轻微压暗（不能变白）
  float memory = explored * ( 1.0 - smoothstep( 0.15, 0.6, visible ) );
  float memoryLum = dot( albedo, vec3( 0.2126, 0.7152, 0.0722 ) );
  vec3 memoryColor = mix( vec3( memoryLum ), uMemoryTint * ( 0.30 + memoryLum * 0.55 ), 0.40 ) * 0.80;
  albedo = mix( albedo, memoryColor, memory * uMemoryStrength );

  // 未探索 → 低明度冷灰的"未知的暗"。
  // 整局约 85% 的画面是这一片，不能糊成一坨泥：把高程差映射成 ±0.11 的明度带，
  // 再叠一点侧壁压暗，山脊 / 谷地的轮廓即使没探明也读得出来。
  // 亮度重建必须是「压缩」而不是「线性跟随」：线性跟随会让亮地形几乎不变暗、
  // 暗地形被压黑，结果同一地形已探/未探的明度差只有 0.001，玩家看不出自己
  // 侦察到哪儿了。压缩后任何地形的落差都稳定在可辨范围。
  float unknownLum = dot( albedo, vec3( 0.299, 0.587, 0.114 ) );
  float unknownRelief = ( clamp( vFacet.y, 0.0, 1.0 ) - 0.42 ) * 0.62;
  vec3 unknown = uUnexploredColor * ( 0.70 + 0.35 * unknownLum + unknownRelief );
  unknown *= 1.0 - wall * 0.24;
  albedo = mix( mix( albedo, unknown, uUnexploredMix ), albedo, explored );

  diffuseColor.rgb = albedo;
}`
      )
      .replace(
        "#include <lights_fragment_end>",
        `#include <lights_fragment_end>
reflectedLight.indirectDiffuse += ( 1.0 - vFacet.x ) * uWallBounce * diffuseColor.rgb;`
      )
      .replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>
roughnessFactor = clamp( roughnessFactor - 0.26 * terrainWet - 0.08 * terrainSnow, 0.06, 1.0 );`
      )
      .replace(
        "#include <normal_fragment_begin>",
        `#include <normal_fragment_begin>
{
  vec2 bumpUv = vTerrainWorld.xz * uNoiseScale * 2.2;
  float centerHeight = texture2D( uNoiseMap, bumpUv ).r;
  float rightHeight = texture2D( uNoiseMap, bumpUv + vec2( 0.018, 0.0 ) ).r;
  float upHeight = texture2D( uNoiseMap, bumpUv + vec2( 0.0, 0.018 ) ).r;
  vec3 bump = vec3( centerHeight - rightHeight, 0.0, centerHeight - upHeight );
  normal = normalize( normal + bump * uBumpStrength * ( 0.3 + 0.7 * vFacet.x ) );
}`
      )
      .replace(
        "#include <fog_fragment>",
        `#ifdef USE_FOG
  #ifdef FOG_EXP2
    float terrainFogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
  #else
    float terrainFogFactor = smoothstep( fogNear, fogFar, vFogDepth );
  #endif
  terrainFogFactor *= exp( - max( vTerrainWorld.y - uFogHeightBase, 0.0 ) * uFogHeightFalloff );
  gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, clamp( terrainFogFactor, 0.0, 1.0 ) );
#endif`
      );
  };

  material.onBeforeCompile = baseOnBeforeCompile;
  material.userData.uniforms = uniforms;
  material.userData.baseOnBeforeCompile = baseOnBeforeCompile;
  material.userData.ApplyPalette = function ApplyTerrainPalette(palette) {
    if (!palette) return;
    uniforms.uSnowColor.value.setHex(palette.snow);
    uniforms.uSnowLine.value = palette.snowLine;
    uniforms.uSnowAmount.value = palette.snowAmount;
    uniforms.uSeasonTint.value.setHex(palette.seasonTint);
    uniforms.uValleyTint.value.setHex(palette.water);
    uniforms.uMemoryTint.value.setHex(palette.memoryTint);
    uniforms.uUnexploredColor.value.setHex(palette.unexplored);
    uniforms.uScorchColor.value.setHex(palette.scorch);
    uniforms.uControlEnemy.value.setHex(palette.control.Enemy);
    uniforms.uControlContested.value.setHex(palette.control.Contested);
    uniforms.uControlGuerrilla.value.setHex(palette.control.Guerrilla);
    uniforms.uControlBase.value.setHex(palette.control.Base);
    uniforms.uFogHeightBase.value = palette.fog.heightBase;
    uniforms.uFogHeightFalloff.value = palette.fog.heightFalloff;
  };
  materialRegistry.add(material);
  return material;
}

// ---------------------------------------------------------------------------
// 5. 天穹
// ---------------------------------------------------------------------------

/**
 * 程序化天穹：垂直渐变 + 太阳盘/辉光 + 三层滚动云带。
 * 返回 Mesh，userData 上挂 uniforms 与 ApplyPalette。
 */
export function CreateSkyDome() {
  const uniforms = {
    uTime: { value: 0 },
    uZenith: { value: new THREE.Color(0x39699d) },
    uHorizon: { value: new THREE.Color(0xc9cfc0) },
    uGround: { value: new THREE.Color(0x6a6152) },
    uSunDirection: { value: new THREE.Vector3(0.4, 0.6, 0.7) },
    uSunColor: { value: new THREE.Color(0xffd9a4) },
    uSunSize: { value: 0.0008 },
    uHaze: { value: 0.56 },
    uCloudColor: { value: new THREE.Color(0xf1ece0) },
    uCloudOpacity: { value: 0.42 },
    uCloudScale: { value: 0.055 },
    uCloudSpeed: { value: 0.006 },
    uExposure: { value: 1.0 },
  };

  const vertexShader = `
varying vec3 vSkyDirection;
void main() {
  vec4 worldPosition = modelMatrix * vec4( position, 1.0 );
  vSkyDirection = normalize( worldPosition.xyz - cameraPosition );
  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}`;

  const fragmentShader = `
uniform float uTime;
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uGround;
uniform vec3 uSunDirection;
uniform vec3 uSunColor;
uniform float uSunSize;
uniform float uHaze;
uniform vec3 uCloudColor;
uniform float uCloudOpacity;
uniform float uCloudScale;
uniform float uCloudSpeed;
uniform float uExposure;
varying vec3 vSkyDirection;
${glslHash}

float CloudBand( vec2 plane, float scale, vec2 drift, int octaves ) {
  vec2 p = plane * scale + drift;
  float shape = Fbm( p, octaves );
  float detail = Fbm( p * 2.7 + vec2( shape * 1.4 ), 3 );
  return clamp( shape * 0.72 + detail * 0.42 - 0.30, 0.0, 1.0 );
}

void main() {
  vec3 direction = normalize( vSkyDirection );
  float up = direction.y;

  // 垂直渐变：天顶 → 地平 → 地面反射
  float verticalT = pow( clamp( up, 0.0, 1.0 ), 0.52 );
  vec3 sky = mix( uHorizon, uZenith, verticalT );
  // 地平线以下是「远处的大地」，必须比天空暗。原来乘 1.45 反而把它提得比天还亮，
  // 而策略视角俯角约 54°，画面上部正好落在这一段——于是地图边缘外侧变成一大片
  // 灰白平板，既是全画面最亮的区域，又把边缘的悬空断崖衬得格外刺眼。
  sky = mix( sky, uGround * 0.52, clamp( -up * 2.2, 0.0, 1.0 ) );

  // 地平线雾霭带：只在地平线以上生成，且提亮幅度收敛
  float horizonBand = exp( -abs( up ) * 9.0 ) * smoothstep( -0.03, 0.07, up );
  sky = mix( sky, uHorizon * 1.06, horizonBand * uHaze );

  // 太阳辉光 + 日盘
  float sunDot = max( dot( direction, normalize( uSunDirection ) ), 0.0 );
  float halo = pow( sunDot, 5.0 ) * 0.26 + pow( sunDot, 180.0 ) * 0.9;
  float disk = smoothstep( 1.0 - uSunSize * 2.4, 1.0 - uSunSize, sunDot );
  sky += uSunColor * halo;
  sky = mix( sky, uSunColor * 2.2, disk * 0.9 );

  // 分层云带：把方向投影到"云平面"，三层不同高度/速度滚动
  if ( uCloudOpacity > 0.002 && up > 0.006 ) {
    vec2 cloudPlane = direction.xz / max( up, 0.045 );
    float drift = uTime * uCloudSpeed;
    float layerHigh = CloudBand( cloudPlane, uCloudScale * 0.55, vec2( drift * 0.6, drift * 0.24 ), 4 );
    float layerMid = CloudBand( cloudPlane, uCloudScale, vec2( -drift * 1.1, drift * 0.5 ), 4 );
    float layerLow = CloudBand( cloudPlane, uCloudScale * 2.1, vec2( drift * 1.9, -drift * 0.8 ), 3 );
    float coverage = clamp( layerHigh * 0.55 + layerMid * 0.85 + layerLow * 0.45, 0.0, 1.0 );
    float horizonFade = smoothstep( 0.01, 0.22, up );
    coverage *= horizonFade * uCloudOpacity;
    // 云底受太阳方向照亮，形成层次
    float lighting = 0.72 + 0.5 * pow( sunDot, 2.4 ) + 0.22 * layerHigh;
    vec3 cloud = uCloudColor * lighting;
    sky = mix( sky, cloud, coverage );
  }

  gl_FragColor = vec4( max( sky * uExposure, vec3( 0.0 ) ), 1.0 );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
    name: "PrairieSky",
  });
  const geometry = new THREE.SphereGeometry(1, 48, 28);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "PrairieSkyDome";
  mesh.scale.setScalar(800);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;
  mesh.matrixAutoUpdate = true;
  mesh.userData.uniforms = uniforms;
  mesh.userData.ApplyPalette = function ApplySkyPalette(palette) {
    if (!palette) return;
    uniforms.uZenith.value.setHex(palette.sky.zenith);
    uniforms.uHorizon.value.setHex(palette.sky.horizon);
    uniforms.uGround.value.setHex(palette.sky.ground);
    uniforms.uCloudColor.value.setHex(palette.sky.cloudColor);
    uniforms.uCloudOpacity.value = palette.sky.cloudOpacity;
    uniforms.uSunColor.value.setHex(palette.sky.sunColor);
  };
  materialRegistry.add(material);
  return mesh;
}

// ---------------------------------------------------------------------------
// 6. 水面
// ---------------------------------------------------------------------------

/** 河流水面：双层波法线 + 菲涅尔 + 高光 + 缓慢流动，受迷雾状态影响。 */
export function CreateWaterMaterial() {
  const custom = {
    uTime: { value: 0 },
    uHexState: { value: CreateStateFallbackTexture() },
    uDeepColor: { value: new THREE.Color(0x21393f) },
    uShallowColor: { value: new THREE.Color(0x4a6f72) },
    uSkyColor: { value: new THREE.Color(0xa9c0d4) },
    uSunDirection: { value: new THREE.Vector3(0.4, 0.6, 0.7) },
    uSunColor: { value: new THREE.Color(0xffd9a4) },
    uFlowDirection: { value: new THREE.Vector2(0.62, 0.78) },
    uFlowSpeed: { value: 0.16 },
    uWaveScale: { value: 2.6 },
    uWaveHeight: { value: 0.028 },
    uFresnelPower: { value: 3.4 },
    uOpacity: { value: 0.9 },
    uDetail: { value: 1.0 },
    uUnexploredColor: { value: new THREE.Color(0x131820) },
  };
  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {}]);
  Object.assign(uniforms, custom);

  const vertexShader = `
#include <common>
#include <fog_pars_vertex>
attribute vec2 aHexUv;
attribute float aShore;
uniform float uTime;
uniform float uWaveScale;
uniform float uWaveHeight;
uniform vec2 uFlowDirection;
uniform float uFlowSpeed;
varying vec2 vHexUv;
varying vec3 vWaterWorld;
varying vec3 vWaterView;
varying float vWaterShore;

void main() {
  vHexUv = aHexUv;
  vWaterShore = aShore;
  vec4 worldPosition = modelMatrix * vec4( position, 1.0 );
  vec2 flow = normalize( uFlowDirection + vec2( 0.0001 ) ) * uTime * uFlowSpeed;
  float wave = sin( ( worldPosition.x * 1.7 + worldPosition.z * 1.1 ) * uWaveScale - flow.x * 6.0 ) * 0.5
             + sin( ( worldPosition.x * -0.9 + worldPosition.z * 2.3 ) * uWaveScale * 0.7 + flow.y * 4.4 ) * 0.5;
  worldPosition.y += wave * uWaveHeight;
  vWaterWorld = worldPosition.xyz;
  vec4 mvPosition = viewMatrix * worldPosition;
  vWaterView = mvPosition.xyz;
  #include <fog_vertex>
  gl_Position = projectionMatrix * mvPosition;
}`;

  const fragmentShader = `
#include <common>
#include <fog_pars_fragment>
uniform float uTime;
uniform sampler2D uHexState;
uniform vec3 uDeepColor;
uniform vec3 uShallowColor;
uniform vec3 uSkyColor;
uniform vec3 uSunDirection;
uniform vec3 uSunColor;
uniform vec2 uFlowDirection;
uniform float uFlowSpeed;
uniform float uWaveScale;
uniform float uFresnelPower;
uniform float uOpacity;
uniform float uDetail;
uniform vec3 uUnexploredColor;
varying vec2 vHexUv;
varying vec3 vWaterWorld;
varying vec3 vWaterView;
varying float vWaterShore;
${glslHash}

vec3 WaveNormal( vec2 p, float time ) {
  vec2 flow = normalize( uFlowDirection + vec2( 0.0001 ) ) * time * uFlowSpeed;
  float e = 0.06;
  vec2 a = p * uWaveScale - flow * 2.2;
  vec2 b = p * uWaveScale * 1.9 + flow.yx * 1.4;
  float h0 = Fbm( a, 3 ) * 0.6 + Fbm( b, 2 ) * 0.4;
  float hx = Fbm( a + vec2( e, 0.0 ), 3 ) * 0.6 + Fbm( b + vec2( e, 0.0 ), 2 ) * 0.4;
  float hz = Fbm( a + vec2( 0.0, e ), 3 ) * 0.6 + Fbm( b + vec2( 0.0, e ), 2 ) * 0.4;
  // y 必须占主导：水面法线只在竖直方向上做小幅扰动，否则镜面高光会炸成大片白斑
  return normalize( vec3( ( h0 - hx ) * uDetail * 0.65, 1.0, ( h0 - hz ) * uDetail * 0.65 ) );
}

void main() {
  vec4 hexState = texture2D( uHexState, vHexUv );
  float explored = hexState.r;
  float visible = hexState.g;

  vec3 normal = WaveNormal( vWaterWorld.xz, uTime );
  vec3 viewDirection = normalize( cameraPosition - vWaterWorld );
  float fresnel = pow( 1.0 - clamp( dot( normal, viewDirection ), 0.0, 1.0 ), uFresnelPower );

  vec3 sunDirection = normalize( uSunDirection );
  vec3 halfVector = normalize( sunDirection + viewDirection );
  // 高光是全画面唯一可靠的白点锚，但必须是"碎光"不是"泛白"：
  // 低频波法线在一格之内几乎是常量，一旦放宽波瓣，整块水面会同时爆成一片死白。
  // 所以高光单独用一层高频扰动法线 + 窄波瓣，强度给足，让白点散成星星点点。
  vec3 glintNormal = normalize( normal + vec3(
    ( Fbm( vWaterWorld.xz * 3.1 + uTime * 0.42, 3 ) - 0.5 ) * 1.15, 0.0,
    ( Fbm( vWaterWorld.zx * 3.4 - uTime * 0.36, 3 ) - 0.5 ) * 1.15 ) );
  float specular = pow( max( dot( glintNormal, halfVector ), 0.0 ), 64.0 );
  // 碎光掩膜：镜面波瓣一放宽，一格水面会整块进入高光区而糊成死白。
  // 关键是掩膜必须"稀疏"——只有很小一部分面积能进入高光，其余几乎为零，
  // 才读作"阳光在水上跳"而不是"一整条河在发光"。
  float sparkleMask = smoothstep( 0.62, 0.80, Fbm( vWaterWorld.xz * 11.0 - uTime * 0.55, 2 ) );
  specular *= 0.02 + 0.98 * sparkleMask;
  float diffuse = 0.52 + 0.62 * max( dot( normal, sunDirection ), 0.0 );

  // 深浅：中心深、近岸浅，由几何送来的 aShore 距离场驱动，而不是满格随机斑块
  float shoreBand = smoothstep( 0.35, 1.0, vWaterShore );
  vec3 color = mix( uDeepColor, uShallowColor, shoreBand * 0.85 ) * diffuse;
  color = mix( color, uSkyColor, fresnel * 0.55 );
  color += uSunColor * specular * 5.6;

  // 泡沫只出现在岸边，且斑块尺度缩到原来的四分之一，避免"霉斑"
  vec2 foamUv = vWaterWorld.xz * 13.0 + normalize( uFlowDirection + vec2( 0.0001 ) ) * uTime * uFlowSpeed * 3.0;
  float foamNoise = Fbm( foamUv, 3 );
  float foam = smoothstep( 0.62, 0.94, foamNoise ) * smoothstep( 0.62, 1.0, vWaterShore );
  color = mix( color, vec3( 0.86, 0.89, 0.87 ), foam * 0.30 * uDetail );

  // 顺流方向的细碎流光：幂次拉高让它只剩针尖大的亮点，强度大幅下调，
  // 否则它会和镜面高光叠加，把整条河抬成一片白。
  float glitter = pow( Fbm( vWaterWorld.xz * 34.0 + uTime * 0.9, 2 ), 14.0 );
  color += uSunColor * glitter * 1.5 * uDetail;

  // 总量钳制：以上三层（镜面 / 泡沫 / 流光）是相加的，任何一层单独看都合理，
  // 叠起来却会整体过曝。这里给水面一个明度上限，保证它始终读作"水"而不是"雪"，
  // 同时保留碎光的局部尖峰。
  float waterLum = dot( color, vec3( 0.299, 0.587, 0.114 ) );
  float overshoot = max( waterLum - 1.35, 0.0 );
  color -= overshoot * 0.72;

  float memory = explored * ( 1.0 - smoothstep( 0.15, 0.6, visible ) );
  float lum = dot( color, vec3( 0.299, 0.587, 0.114 ) );
  color = mix( color, vec3( lum ) * 0.86, memory * 0.72 );
  color = mix( uUnexploredColor, color, explored );

  // 距离雾必须在 tonemapping 之前施加，否则是对已编码的 sRGB 值做线性混合，
  // 远处水面会被明亮雾色整体抬白
  #ifdef USE_FOG
    #ifdef FOG_EXP2
      float waterFogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
    #else
      float waterFogFactor = smoothstep( fogNear, fogFar, vFogDepth );
    #endif
    color = mix( color, fogColor, clamp( waterFogFactor, 0.0, 1.0 ) * 0.85 );
  #endif

  float alpha = uOpacity * ( 0.55 + 0.45 * explored );
  gl_FragColor = vec4( color, alpha );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    fog: true,
    side: THREE.FrontSide,
    name: "PrairieWater",
  });
  material.userData.uniforms = uniforms;
  material.userData.ApplyPalette = function ApplyWaterPalette(palette) {
    if (!palette) return;
    uniforms.uDeepColor.value.setHex(palette.water).multiplyScalar(0.62);
    uniforms.uShallowColor.value.setHex(palette.water).lerp(new THREE.Color(palette.grass), 0.18);
    uniforms.uSkyColor.value.setHex(palette.sky.horizon);
    uniforms.uSunColor.value.setHex(palette.sun.color);
    uniforms.uUnexploredColor.value.setHex(palette.unexplored);
  };
  materialRegistry.add(material);
  return material;
}

// ---------------------------------------------------------------------------
// 7. 战争迷雾云层
// ---------------------------------------------------------------------------

/**
 * 未探索格上方的翻滚云雾。几何体一次性覆盖全图，
 * 是否显示完全由 uHexState 的 explored 通道驱动（不重建几何）。
 */
export function CreateFogOfWarMaterial() {
  const custom = {
    uTime: { value: 0 },
    uHexState: { value: CreateStateFallbackTexture() },
    // "未知"是暗的：低明度冷灰的稀薄雾气，绝不能是高明度白棉团
    uCloudColor: { value: new THREE.Color(0x0b0f15) },
    uCloudHighlight: { value: new THREE.Color(0x28303a) },
    uOpacity: { value: 0.62 },
    uRollSpeed: { value: 0.055 },
    uNoiseScale: { value: 0.9 },
  };
  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {}]);
  Object.assign(uniforms, custom);

  const vertexShader = `
#include <common>
#include <fog_pars_vertex>
attribute vec2 aHexUv;
attribute vec3 aPuff;
uniform float uTime;
uniform float uRollSpeed;
varying vec2 vHexUv;
varying vec3 vPuff;
varying vec2 vLocal;
varying vec3 vCloudWorld;

void main() {
  vHexUv = aHexUv;
  vPuff = aPuff;
  vLocal = uv * 2.0 - 1.0;
  vec3 displaced = position;
  float phase = aPuff.x * 6.2831853;
  displaced.y += sin( uTime * uRollSpeed * 6.2831853 + phase ) * 0.09 * aPuff.y;
  displaced.x += cos( uTime * uRollSpeed * 4.1 + phase * 1.7 ) * 0.05 * aPuff.y;
  displaced.z += sin( uTime * uRollSpeed * 3.3 + phase * 2.3 ) * 0.05 * aPuff.y;
  vec4 worldPosition = modelMatrix * vec4( displaced, 1.0 );
  vCloudWorld = worldPosition.xyz;
  vec4 mvPosition = viewMatrix * worldPosition;
  #include <fog_vertex>
  gl_Position = projectionMatrix * mvPosition;
}`;

  const fragmentShader = `
#include <common>
#include <fog_pars_fragment>
uniform float uTime;
uniform sampler2D uHexState;
uniform vec3 uCloudColor;
uniform vec3 uCloudHighlight;
uniform float uOpacity;
uniform float uNoiseScale;
varying vec2 vHexUv;
varying vec3 vPuff;
varying vec2 vLocal;
varying vec3 vCloudWorld;
${glslHash}
${glslHexSdf}

void main() {
  vec4 hexState = texture2D( uHexState, vHexUv );
  float explored = hexState.r;
  float hidden = 1.0 - explored;
  if ( hidden < 0.01 ) discard;

  float edge = SdFlatHexagon( vLocal );
  float body = smoothstep( 0.02, -0.34, edge );
  if ( body < 0.01 ) discard;

  // 单次 4 octave FBM + 廉价 domain warp，取代原来的两次 FBM
  vec2 rollUv = vCloudWorld.xz * uNoiseScale + vec2( uTime * 0.026, -uTime * 0.017 );
  vec2 warp = vec2( sin( rollUv.y * 1.7 + uTime * 0.11 ), cos( rollUv.x * 1.9 - uTime * 0.09 ) ) * 0.35;
  float mass = clamp( Fbm( rollUv + warp, 4 ) * 1.25 + vPuff.z * 0.25, 0.0, 1.0 );

  float alpha = body * hidden * uOpacity * smoothstep( 0.30, 0.88, mass );
  if ( alpha < 0.006 ) discard;

  // 只允许极小幅度的提亮，保证整体停留在"未知的暗"里
  vec3 color = mix( uCloudColor, uCloudHighlight, pow( mass, 2.2 ) * 0.34 + vPuff.y * 0.05 );

  // 距离衰减：绝不能套用 three 的 <fog_fragment>。
  // 它把结果 mix 向 fogColor（明亮天光色），中远景会把设计好的低明度冷灰云
  // 整体拉成中灰白，糊掉炮楼 / 村庄 / 河流与控制区边界——与设计意图完全相反。
  // 这里改成"越远越沉"，并且必须在 tonemapping 之前完成。
  #ifdef USE_FOG
    #ifdef FOG_EXP2
      float cloudFogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
    #else
      float cloudFogFactor = smoothstep( fogNear, fogFar, vFogDepth );
    #endif
    color = mix( color, uCloudColor * 0.8, clamp( cloudFogFactor, 0.0, 1.0 ) * 0.9 );
  #endif

  gl_FragColor = vec4( color, alpha );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    fog: true,
    side: THREE.FrontSide,
    name: "PrairieFogOfWar",
  });
  material.userData.uniforms = uniforms;
  material.userData.ApplyPalette = function ApplyFogPalette(palette) {
    if (!palette) return;
    // 迷雾云只在未探索色附近微调，不去追雾色（那是明亮的天光色，会变成白棉团）
    uniforms.uCloudColor.value.setHex(palette.unexplored).multiplyScalar(0.7);
    uniforms.uCloudHighlight.value.setHex(palette.unexplored).lerp(new THREE.Color(palette.fog.color), 0.16);
  };
  materialRegistry.add(material);
  return material;
}

// ---------------------------------------------------------------------------
// 8. 交互覆盖层（地毯高亮 / 悬停描边 / 选中脉冲环）
// ---------------------------------------------------------------------------

const overlayKindOrder = ["move", "attack", "build", "sweep", "intel"];

/** 五种地毯高亮的配色：填充色 + 边缘辉光色。 */
// 辉光色必须压在地形明度附近：这层地毯在开局就铺满可移动范围（约 24 格、
// 占屏近两成），一旦用浅色高饱和边缘，它会变成全画面最亮的东西，
// 把下面的地形、村庄、部队全部洗淡——这正是第二轮「乳白糊团」换个图层复活。
export const overlayKindColors = Object.freeze({
  move: { fill: 0x2f7d76, edge: 0x4f8f86 },
  attack: { fill: 0x8e2a1e, edge: 0xb05c42 },
  build: { fill: 0x8f6a22, edge: 0xb59a5c },
  sweep: { fill: 0x6b1f16, edge: 0xa85a3c },
  intel: { fill: 0x47548f, edge: 0x7c88b4 },
});

/** 构造 8×2 的 kind 调色板纹理：第 0 行填充色，第 1 行辉光色。 */
function CreateOverlayPaletteTexture() {
  const cacheKey = "overlayPalette";
  if (textureCache.has(cacheKey)) return textureCache.get(cacheKey);
  const width = 8;
  const height = 2;
  const data = new Uint8Array(width * height * 4);
  function WriteColor(column, row, value, alpha) {
    const index = (row * width + column) * 4;
    data[index] = (value >> 16) & 0xff;
    data[index + 1] = (value >> 8) & 0xff;
    data[index + 2] = value & 0xff;
    data[index + 3] = alpha;
  }
  WriteColor(0, 0, 0x000000, 0);
  WriteColor(0, 1, 0x000000, 0);
  overlayKindOrder.forEach((kind, index) => {
    const entry = overlayKindColors[kind];
    WriteColor(index + 1, 0, entry.fill, 255);
    WriteColor(index + 1, 1, entry.edge, 255);
  });
  for (let column = overlayKindOrder.length + 1; column < width; column += 1) {
    WriteColor(column, 0, 0x000000, 0);
    WriteColor(column, 1, 0x000000, 0);
  }
  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  // 调色板存的是给人看的颜色，标记为 sRGB 让 GPU 在采样时自动解码到线性空间
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  texture.name = cacheKey;
  textureCache.set(cacheKey, texture);
  return texture;
}

const overlayVertexShader = `
#include <common>
attribute vec2 aHexUv;
varying vec2 vHexUv;
varying vec2 vLocal;
varying vec3 vOverlayWorld;
void main() {
  vHexUv = aHexUv;
  vLocal = uv * 2.0 - 1.0;
  vec4 worldPosition = modelMatrix * vec4( position, 1.0 );
  vOverlayWorld = worldPosition.xyz;
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}`;

/** 合成式地毯高亮：一次 draw call 同时画出五种高亮，全部由状态纹理驱动。 */
function BuildCompositeOverlayShader() {
  return `
uniform float uTime;
uniform sampler2D uHighlightState;
uniform sampler2D uKindPalette;
uniform float uOpacity;
uniform float uRimBoost;
varying vec2 vHexUv;
varying vec2 vLocal;
varying vec3 vOverlayWorld;
${glslHash}
${glslHexSdf}

void main() {
  vec4 state = texture2D( uHighlightState, vHexUv );
  float code = state.r;
  if ( code < 0.05 ) discard;
  float intensity = state.g;
  float phase = state.b * 6.2831853;

  float kindIndex = floor( code * 5.0 + 0.5 );
  vec2 paletteUv = vec2( ( kindIndex + 0.5 ) / 8.0, 0.25 );
  vec3 fillColor = texture2D( uKindPalette, paletteUv ).rgb;
  vec3 edgeColor = texture2D( uKindPalette, vec2( paletteUv.x, 0.75 ) ).rgb;

  float distance = SdFlatHexagon( vLocal );
  float inside = smoothstep( 0.005, -0.02, distance );
  if ( inside < 0.004 ) discard;
  float rim = smoothstep( -0.20, -0.015, distance );

  float radial = length( vLocal );
  float pattern = 1.0;
  // 移动：向外扩散的柔和波纹
  float movePattern = 0.55 + 0.45 * sin( radial * 9.0 - uTime * 2.4 + phase );
  // 攻击：旋转的斜向锯齿
  float angle = atan( vLocal.y, vLocal.x );
  float attackPattern = 0.45 + 0.55 * abs( sin( angle * 3.0 + uTime * 1.6 + phase ) );
  // 建造：滚动网格（施工线）
  vec2 grid = fract( ( vLocal + vec2( uTime * 0.09, 0.0 ) ) * 4.5 );
  float buildPattern = 0.42 + 0.58 * max( smoothstep( 0.86, 0.98, grid.x ), smoothstep( 0.86, 0.98, grid.y ) );
  // 扫荡：警戒斜纹推进
  float sweepPattern = 0.35 + 0.65 * step( 0.5, fract( ( vLocal.x + vLocal.y ) * 2.6 - uTime * 0.85 + phase ) );
  // 情报：单向扫描线
  float scan = fract( vLocal.y * 0.5 + 0.5 - uTime * 0.32 + phase * 0.16 );
  float intelPattern = 0.32 + 0.68 * smoothstep( 0.86, 1.0, scan ) + 0.18 * Hash21( floor( vLocal * 22.0 ) + floor( uTime * 6.0 ) );

  pattern = movePattern;
  pattern = mix( pattern, attackPattern, step( 1.5, kindIndex ) );
  pattern = mix( pattern, buildPattern, step( 2.5, kindIndex ) );
  pattern = mix( pattern, sweepPattern, step( 3.5, kindIndex ) );
  pattern = mix( pattern, intelPattern, step( 4.5, kindIndex ) );

  float breathe = 0.82 + 0.18 * sin( uTime * 1.9 + phase );
  vec3 color = mix( fillColor, edgeColor, rim * uRimBoost );
  color *= 0.58 + 0.42 * pattern;

  // 填充几乎透明、只留边缘描边：常数项从 0.30 压到 0.08，
  // 让玩家读到的是「这一圈格子可以去」，而不是「地图被一层薄荷色糊住了」。
  float alpha = uOpacity * intensity * inside * ( 0.08 + 0.30 * pattern + 0.52 * rim ) * breathe;
  gl_FragColor = vec4( color, clamp( alpha, 0.0, 1.0 ) );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
}

/** 单一 kind 的地毯高亮（供特效模块单独摆放一片时使用）。 */
function BuildSingleOverlayShader() {
  return `
uniform float uTime;
uniform vec3 uFillColor;
uniform vec3 uEdgeColor;
uniform float uOpacity;
uniform float uPatternMode;
varying vec2 vHexUv;
varying vec2 vLocal;
varying vec3 vOverlayWorld;
${glslHash}
${glslHexSdf}

void main() {
  float distance = SdFlatHexagon( vLocal );
  float inside = smoothstep( 0.005, -0.02, distance );
  if ( inside < 0.004 ) discard;
  float rim = smoothstep( -0.20, -0.015, distance );
  float radial = length( vLocal );
  float angle = atan( vLocal.y, vLocal.x );

  float pattern = 0.55 + 0.45 * sin( radial * 9.0 - uTime * 2.4 );
  if ( uPatternMode > 1.5 && uPatternMode < 2.5 ) pattern = 0.45 + 0.55 * abs( sin( angle * 3.0 + uTime * 1.6 ) );
  if ( uPatternMode > 2.5 && uPatternMode < 3.5 ) {
    vec2 grid = fract( ( vLocal + vec2( uTime * 0.09, 0.0 ) ) * 4.5 );
    pattern = 0.42 + 0.58 * max( smoothstep( 0.86, 0.98, grid.x ), smoothstep( 0.86, 0.98, grid.y ) );
  }
  if ( uPatternMode > 3.5 && uPatternMode < 4.5 ) pattern = 0.35 + 0.65 * step( 0.5, fract( ( vLocal.x + vLocal.y ) * 2.6 - uTime * 0.85 ) );
  if ( uPatternMode > 4.5 ) pattern = 0.32 + 0.68 * smoothstep( 0.86, 1.0, fract( vLocal.y * 0.5 + 0.5 - uTime * 0.32 ) );

  vec3 color = mix( uFillColor, uEdgeColor, rim * 0.85 );
  color *= 0.58 + 0.42 * pattern;
  float alpha = uOpacity * inside * ( 0.30 + 0.36 * pattern + 0.44 * rim );
  gl_FragColor = vec4( color, clamp( alpha, 0.0, 1.0 ) );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
}

/** 悬停描边：挤出的六边形外框，带流动的光带。 */
function BuildHoverShader() {
  return `
uniform float uTime;
uniform vec3 uEdgeColor;
uniform float uOpacity;
varying vec2 vHexUv;
varying vec2 vLocal;
varying vec3 vOverlayWorld;
${glslHash}

void main() {
  // uv.y 记录挤出高度（0 顶 1 底），uv.x 记录沿框的行进参数
  float alongEdge = vLocal.x * 0.5 + 0.5;
  float heightT = vLocal.y * 0.5 + 0.5;
  float sweep = fract( alongEdge * 1.0 - uTime * 0.32 );
  float band = smoothstep( 0.72, 1.0, sweep ) + 0.35;
  float verticalFade = mix( 1.0, 0.24, heightT );
  float flicker = 0.9 + 0.1 * sin( uTime * 8.0 + alongEdge * 22.0 );
  vec3 color = uEdgeColor * ( 0.7 + 0.9 * band ) * flicker;
  float alpha = uOpacity * verticalFade * ( 0.42 + 0.58 * band );
  gl_FragColor = vec4( color, clamp( alpha, 0.0, 1.0 ) );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
}

/**
 * 选中环：几何本身已是六边形环带，uv.y = 0 内缘 / 1 外缘，uv.x 为沿环行进参数。
 * 着色器只做"外缘实、内缘渐隐 + 一道绕环行进的高光"，不再画同心圆脉冲。
 */
function BuildSelectShader() {
  return `
uniform float uTime;
uniform vec3 uFillColor;
uniform vec3 uEdgeColor;
uniform float uOpacity;
varying vec2 vHexUv;
varying vec2 vLocal;
varying vec3 vOverlayWorld;

void main() {
  float alongRing = vLocal.x * 0.5 + 0.5;
  float acrossRing = vLocal.y * 0.5 + 0.5;   // 0 = 内缘, 1 = 外缘

  // 外缘实、内缘渐隐，形成贴合地块的六边形描边
  float band = smoothstep( 0.0, 0.55, acrossRing );
  float outerFade = 1.0 - smoothstep( 0.86, 1.0, acrossRing );
  float body = band * outerFade;

  // 一道绕着六边形行进的高光，提示"当前选中"
  float sweep = fract( alongRing - uTime * 0.22 );
  float runner = smoothstep( 0.80, 0.98, sweep ) + smoothstep( 0.30, 0.0, sweep ) * 0.35;
  float breathe = 0.78 + 0.22 * sin( uTime * 2.4 );

  vec3 color = mix( uFillColor, uEdgeColor, clamp( runner, 0.0, 1.0 ) );
  float alpha = uOpacity * body * ( 0.55 + 0.75 * runner ) * breathe;
  if ( alpha < 0.004 ) discard;
  gl_FragColor = vec4( color * ( 0.85 + 0.6 * runner ), clamp( alpha, 0.0, 1.0 ) );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
}

/**
 * 覆盖层材质工厂。
 * kind ∈ 'move'|'attack'|'build'|'sweep'|'intel'（单色地毯）
 *      | 'composite'（一次画出全部五种，渲染器主用）
 *      | 'hover'（挤出描边）| 'select'（脉冲环）
 */
export function CreateOverlayMaterial(kind = "composite") {
  const kindKey = typeof kind === "string" ? kind : "composite";
  let uniforms;
  let fragmentShader;

  if (kindKey === "composite" || kindKey === "all") {
    uniforms = {
      uTime: { value: 0 },
      uHighlightState: { value: CreateStateFallbackTexture([0, 0, 0, 0]) },
      uKindPalette: { value: CreateOverlayPaletteTexture() },
      uOpacity: { value: 0.24 },
      uRimBoost: { value: 0.5 },
    };
    fragmentShader = BuildCompositeOverlayShader();
  } else if (kindKey === "hover") {
    uniforms = {
      uTime: { value: 0 },
      uEdgeColor: { value: new THREE.Color(0xf6e3b4) },
      uOpacity: { value: 0.92 },
    };
    fragmentShader = BuildHoverShader();
  } else if (kindKey === "select") {
    uniforms = {
      uTime: { value: 0 },
      uFillColor: { value: new THREE.Color(0xe8b95c) },
      uEdgeColor: { value: new THREE.Color(0xfff0c8) },
      uOpacity: { value: 0.55 },
    };
    fragmentShader = BuildSelectShader();
  } else {
    const entry = overlayKindColors[kindKey] || overlayKindColors.move;
    const patternMode = overlayKindOrder.indexOf(kindKey) + 1;
    uniforms = {
      uTime: { value: 0 },
      uFillColor: { value: new THREE.Color(entry.fill) },
      uEdgeColor: { value: new THREE.Color(entry.edge) },
      uOpacity: { value: 0.72 },
      uPatternMode: { value: patternMode < 1 ? 1 : patternMode },
    };
    fragmentShader = BuildSingleOverlayShader();
  }

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: overlayVertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    blending: kindKey === "hover" || kindKey === "select" ? THREE.AdditiveBlending : THREE.NormalBlending,
    fog: false,
    name: `PrairieOverlay_${kindKey}`,
  });
  material.polygonOffset = true;
  material.polygonOffsetFactor = -2;
  material.polygonOffsetUnits = -2;
  material.userData.uniforms = uniforms;
  material.userData.kind = kindKey;
  materialRegistry.add(material);
  return material;
}

// ---------------------------------------------------------------------------
// 9. 旗帜 / 横幅贴图
// ---------------------------------------------------------------------------

/** 圆角矩形路径工具。 */
function TracePanel(context2d, x, y, width, height, radius) {
  const r = Math.min(radius, width * 0.5, height * 0.5);
  context2d.beginPath();
  context2d.moveTo(x + r, y);
  context2d.arcTo(x + width, y, x + width, y + height, r);
  context2d.arcTo(x + width, y + height, x, y + height, r);
  context2d.arcTo(x, y + height, x, y, r);
  context2d.arcTo(x, y, x + width, y, r);
  context2d.closePath();
}

/**
 * 40 年代战地档案风的横幅贴图：粗布底 + 印章边 + 钢笔字。
 * colors 支持 { background, border, ink, accent } 或 [背景, 边框, 字色]。
 */
export function CreateBannerTexture(text, colors = {}) {
  const label = typeof text === "string" ? text : String(text ?? "");
  const palette = Array.isArray(colors)
    ? { background: colors[0], border: colors[1], ink: colors[2], accent: colors[3] }
    : colors || {};
  const background = palette.background || "#6d1f14";
  const border = palette.border || "#e6c98a";
  const ink = palette.ink || "#f7ecd4";
  const accent = palette.accent || "#d8b25e";
  const cacheKey = `banner:${label}:${background}:${border}:${ink}:${accent}`;
  if (textureCache.has(cacheKey)) return textureCache.get(cacheKey);

  const width = 512;
  const height = 128;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context2d = canvas.getContext("2d");

  context2d.clearRect(0, 0, width, height);

  // 布面主体
  const marginX = 18;
  const marginY = 16;
  const panelWidth = width - marginX * 2;
  const panelHeight = height - marginY * 2;
  const gradient = context2d.createLinearGradient(0, marginY, 0, marginY + panelHeight);
  gradient.addColorStop(0, background);
  gradient.addColorStop(0.55, background);
  gradient.addColorStop(1, "rgba(0,0,0,0.35)");
  TracePanel(context2d, marginX, marginY, panelWidth, panelHeight, 26);
  context2d.fillStyle = gradient;
  context2d.fill();

  // 粗布经纬纹理（确定性噪声，不用 Math.random）
  const seed = HashString(cacheKey);
  for (let index = 0; index < 900; index += 1) {
    const nx = ValueNoise2D(index * 0.71, seed % 97, seed) * width;
    const ny = ValueNoise2D(index * 1.33 + 5, (seed >> 4) % 89, seed + 7) * height;
    const alpha = 0.03 + ValueNoise2D(index * 2.1, 3, seed + 11) * 0.07;
    context2d.fillStyle = index % 2 ? `rgba(255,240,214,${alpha})` : `rgba(24,16,12,${alpha})`;
    context2d.fillRect(nx, ny, 2 + (index % 3), 1);
  }

  // 双线边框 + 四角铆钉
  context2d.save();
  TracePanel(context2d, marginX, marginY, panelWidth, panelHeight, 26);
  context2d.clip();
  context2d.strokeStyle = border;
  context2d.lineWidth = 5;
  TracePanel(context2d, marginX + 3, marginY + 3, panelWidth - 6, panelHeight - 6, 22);
  context2d.stroke();
  context2d.strokeStyle = "rgba(0,0,0,0.35)";
  context2d.lineWidth = 2;
  TracePanel(context2d, marginX + 10, marginY + 10, panelWidth - 20, panelHeight - 20, 16);
  context2d.stroke();
  context2d.restore();

  context2d.fillStyle = accent;
  const rivets = [[marginX + 16, marginY + 16], [width - marginX - 16, marginY + 16],
    [marginX + 16, height - marginY - 16], [width - marginX - 16, height - marginY - 16]];
  for (const [rx, ry] of rivets) {
    context2d.beginPath();
    context2d.arc(rx, ry, 4.5, 0, Math.PI * 2);
    context2d.fill();
  }

  // 文案：钢笔字质感（描边 + 内影）
  const fontSize = label.length > 6 ? 44 : 56;
  context2d.font = `700 ${fontSize}px "Noto Sans SC", "Source Han Sans", sans-serif`;
  context2d.textAlign = "center";
  context2d.textBaseline = "middle";
  context2d.lineJoin = "round";
  context2d.strokeStyle = "rgba(18,10,6,0.55)";
  context2d.lineWidth = 6;
  context2d.strokeText(label, width / 2, height / 2 + 2);
  context2d.fillStyle = ink;
  context2d.fillText(label, width / 2, height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  texture.name = cacheKey;
  textureCache.set(cacheKey, texture);
  return texture;
}

// ---------------------------------------------------------------------------
// 10. 释放
// ---------------------------------------------------------------------------

/** 释放本模块创建的全部纹理与材质，并清空缓存（渲染器 Dispose 时调用）。 */
export function DisposeMaterialCache() {
  for (const texture of textureCache.values()) {
    if (texture && typeof texture.dispose === "function") texture.dispose();
  }
  textureCache.clear();
  for (const material of materialRegistry) {
    if (material && typeof material.dispose === "function") material.dispose();
  }
  materialRegistry.clear();
}
