// 《台儿庄：血战滕县》3A 物理水面系统（单层水体折射 + 动态焦散 + CSM 投影 +
// Hillaire 物理大气倒影 + Hi-Z SSR + GGX/Toksvig 抗锯齿日斑 + 交互波纹 + 编辑器低画质门禁）。
//
// 架构要点：
//   1. 编辑器 vs 试玩/正片分档门禁（用户 2026-11-27）：
//      · SetWaterMode("editor") 强制把实际生效档锁定为 WATER_EDITOR_DEFAULT_QUALITY ("low")
//        （除非地址栏显式 ?waterQuality= 覆盖），仅用 2 个采样器、零折射拷贝、零 SSR/CSM/焦散；
//      · SetWaterMode("play") 启用画质设置档（默认 high / 可选 medium / ultra），并在所有
//        已登记水面上原地热切材质，无需重建几何。
//   2. 当前帧零反馈折射拷贝（Single-Layer Water）：
//      · 所有水面网格 renderOrder = 1（在不透明件 + 浮桥 HullMask[900] 之后、贴花/扬尘/烟火[3..23] 之前）；
//      · 每帧首个可见水面在 onBeforeRender 里执行一次 WebGL2 blitFramebuffer，把当前绑定的
//        主 HDR 靶拷入非 MSAA 折射靶（MSAA 下等尺寸 NEAREST 硬件 resolve，非 MSAA 下可半分辨率 LINEAR），
//        并严格恢复原有 FBO 与 scissor 状态。零额外场景 draw call，零反馈环。
//   3. 片段采样器严格封顶 15/16（ANGLE-D3D11 上限 16）：
//      · low    : 2  (Ripple + SceneDepth)
//      · medium : 11 (Ripple + Detail + SsrHiz0..3 + SsrDepth/Vel/Color + OpaqueColor + AtmoSkyView)
//      · high   : 15 (medium + uSunShadowMap[0..3])
//      · ultra  : 15 (全分辨率折射 + 色散 + 6 组 Gerstner + 64 步 Hi-Z SSR + 24 交互波纹)
//   4. 几何零依赖：不进深度法线预通道（skipNormalDepth + MarkNoPrepass），从预通道 RT0.w 精确反推
//      河床世界坐标 bedWorldPos，实现视角无关的真实竖向水深、无镜头漂移的世界空间焦散、
//      无前景渗色的折射深度剔除与柔和湿泥岸线。

import * as THREE from "three";
import { MarkNoPrepass } from "./Script_Post.mjs";
import { SsrSurfaceBlockGlsl, BindSsrTraceUniforms } from "./Script_PostSsr.mjs";
import { SUN_SHADOW_GLSL, BindSunShadowUniforms } from "./Script_SunShadowSampling.mjs";
import { ATMOSPHERE_CONST_GLSL } from "./Script_Atmosphere.mjs";
import {
  WATER_QUALITY_KEYS,
  WATER_EDITOR_DEFAULT_QUALITY,
  WATER_QUALITY_TIERS,
  WATER_TEXTURES,
  WATER_RIPPLES,
  WATER_PRESETS,
} from "./Data_Tuning_Water.mjs";
import { BuildContinuousWaterGeometry } from "./Script_WaterGeometry.mjs";

const MAX_WAVES = 6;
const MAX_RIPPLES = WATER_RIPPLES.maxCount;

// ---------------------------------------------------------------------------
// 全局共享状态与引用
// ---------------------------------------------------------------------------

let waterMode = "play";             // "play" | "editor"
let requestedQuality = "high";      // 玩家画质设置 / 档位默认值
let forcedQuality = null;           // ?waterQuality= 显式覆盖
let skyUniformsRef = null;
let ssrTraceRef = null;
let lightRigRef = null;
let atmosphereRef = null;
let lastMainCamera = null;

// 共享阴影 uniform 包：全局只向 LightRig 注册一次，避免热切材质时重复堆积。
const waterShadowUniforms = BindSunShadowUniforms({}, null);

// 共享大气天空视图 LUT uniform 包：无物理大气时退回占位纹理与 uAtmoEnabled = 0。
let fallbackSkyLut = null;
function FallbackBlackTexture() {
  if (fallbackSkyLut) return fallbackSkyLut;
  const data = new Uint8Array([0, 0, 0, 255]);
  fallbackSkyLut = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat);
  fallbackSkyLut.minFilter = THREE.LinearFilter;
  fallbackSkyLut.magFilter = THREE.LinearFilter;
  fallbackSkyLut.needsUpdate = true;
  return fallbackSkyLut;
}

const waterAtmoUniforms = {
  uAtmoSkyView: { value: FallbackBlackTexture() },
  uAtmoSkyViewSize: { value: new THREE.Vector2(1, 1) },
  uAtmoEnabled: { value: 0 },
  uAtmoViewHeight: { value: 6360.1 },
  uAtmoSkyTint: { value: new THREE.Vector3(1, 1, 1) },
  uAtmoSkyFloor: { value: new THREE.Vector3(0, 0, 0) },
};

// 交互波纹环形池（全部通过两个 vec4[24] uniform 传入，0 额外采样器）
const rippleEntries = [];
const ripplePosUniform = Array.from({ length: MAX_RIPPLES }, () => new THREE.Vector4(0, 0, -9999, 0));
const rippleParamUniform = Array.from({ length: MAX_RIPPLES }, () => new THREE.Vector4(4, 2.5, 8, 0));

// 当前帧折射拷贝靶与帧去重记号
let waterOpaqueTarget = null;
let waterOpaqueTargetType = null;
let lastOpaqueCopyFrame = -1;
let opaqueCopyCount = 0;

// 共享逐帧 uniform：所有水面材质指向同一批对象，UpdateWaterSurfaces 每帧写一次全生效。
const sharedUniforms = {
  uTime: { value: 0 },
  uSceneDepth: { value: null },
  uWaterOpaqueColor: { value: FallbackBlackTexture() },
  uWaterHasOpaque: { value: 0 },
  uResolution: { value: new THREE.Vector2(1, 1) },
  uCameraFar: { value: 1600 },
  uViewMatrix: { value: new THREE.Matrix4() },
  uWaterSsrEnabled: { value: 1 },
  uWaterSsrStrength: { value: 1 },
  uFogColor: { value: new THREE.Color(0x9ea8b2) },
  uFogSunColor: { value: new THREE.Color(0xffd2a0) },
  uFogDensity: { value: 0.0014 },
  uFogHeightFalloff: { value: 0.035 },
  uFogSunAmount: { value: 0.25 },
  uRipplePos: { value: ripplePosUniform },
  uRippleParam: { value: rippleParamUniform },
  uRippleCount: { value: 0 },
};

// 跟踪所有由 CreateWaterSurface 建出的活网格，以便 SetWaterQuality / SetWaterMode 热切材质。
const trackedSurfaces = new Set();
// 材质缓存：key = `${tier}|${preset}|${flowKey}|${ssrOn}|${shadowOn}|${atmoOn}`
const materialCache = new Map();

// ---------------------------------------------------------------------------
// 档位解析与公共控制口
// ---------------------------------------------------------------------------

function NormalizeTier(tier, fallback = "high") {
  return WATER_QUALITY_KEYS.includes(tier) ? tier : fallback;
}

/** 实际生效的水面画质档：显式覆盖 > 编辑器强制最低档 > 请求档位。 */
export function GetEffectiveWaterQuality() {
  if (forcedQuality) return forcedQuality;
  if (waterMode === "editor") return WATER_EDITOR_DEFAULT_QUALITY;
  return requestedQuality;
}

export function GetWaterTierSpec(quality = GetEffectiveWaterQuality()) {
  const key = NormalizeTier(quality);
  return { key, ...WATER_QUALITY_TIERS[key] };
}

function DisposeOpaqueTarget() {
  if (!waterOpaqueTarget) return;
  waterOpaqueTarget.dispose();
  waterOpaqueTarget = null;
  waterOpaqueTargetType = null;
  sharedUniforms.uWaterOpaqueColor.value = FallbackBlackTexture();
  sharedUniforms.uWaterHasOpaque.value = 0;
}

function PruneTrackedSurfaces() {
  for (const record of trackedSurfaces) {
    if (!record.mesh || record.disposed) {
      trackedSurfaces.delete(record);
    }
  }
}

function RefreshTrackedMaterials() {
  PruneTrackedSurfaces();
  const effective = GetEffectiveWaterQuality();
  if (!WATER_QUALITY_TIERS[effective]?.refraction) DisposeOpaqueTarget();
  for (const record of trackedSurfaces) {
    const nextMat = GetWaterMaterial(record.preset, record.flow, effective);
    if (record.mesh.material !== nextMat) {
      record.mesh.material = nextMat;
    }
  }
}

/**
 * 切换水面运行模式：
 *   · "editor" — 编辑器模式，默认强制锁定最低水面画质档（"low"）
 *   · "play"   — 试玩 / 正式游玩模式，启用画质设置档（默认 high / ultra）
 */
export function SetWaterMode(mode) {
  const next = mode === "editor" ? "editor" : "play";
  if (waterMode === next) return GetEffectiveWaterQuality();
  waterMode = next;
  RefreshTrackedMaterials();
  return GetEffectiveWaterQuality();
}

/** 设置期望的水面画质档（"low" | "medium" | "high" | "ultra"）。在 editor 模式下暂存，进入 play 时生效。 */
export function SetWaterQuality(tier) {
  const next = NormalizeTier(tier, requestedQuality);
  if (requestedQuality === next) return GetEffectiveWaterQuality();
  requestedQuality = next;
  RefreshTrackedMaterials();
  return GetEffectiveWaterQuality();
}

/** 地址栏 ?waterQuality= 显式覆盖（传 null 解除）。 */
export function SetWaterQualityOverride(tier) {
  forcedQuality = tier ? NormalizeTier(tier, null) : null;
  RefreshTrackedMaterials();
  return GetEffectiveWaterQuality();
}

/** 天空 uniform 引用（Script_Main 在 SkyDome 建好后调一次）。 */
export function SetWaterSkyUniforms(skyUniforms) {
  skyUniformsRef = skyUniforms || null;
  if (skyUniformsRef) {
    const sunDirU = skyUniformsRef.uSunDirection || skyUniformsRef.uSunDir;
    for (const mat of materialCache.values()) {
      if (sunDirU) mat.uniforms.uSunDir = sunDirU;
      if (skyUniformsRef.uZenith) mat.uniforms.uZenith = skyUniformsRef.uZenith;
      if (skyUniformsRef.uHorizon) mat.uniforms.uHorizon = skyUniformsRef.uHorizon;
      if (skyUniformsRef.uSunColor) mat.uniforms.uSunColor = skyUniformsRef.uSunColor;
      if (skyUniformsRef.uSunIntensity) mat.uniforms.uSunIntensity = skyUniformsRef.uSunIntensity;
    }
  }
}

/** SSR 追踪端 uniform 引用（Script_Main 在 PostPipeline 建好后调一次）。 */
export function SetWaterSsr(traceUniforms) {
  const had = !!ssrTraceRef;
  ssrTraceRef = traceUniforms || null;
  if (had !== !!ssrTraceRef) RefreshTrackedMaterials();
}

/** 运行时同步画质面板里的 SSR 开关与倍率（不重编译材质）。 */
export function SetWaterSsrState(enabled, strength = 1) {
  sharedUniforms.uWaterSsrEnabled.value = enabled ? 1 : 0;
  sharedUniforms.uWaterSsrStrength.value = Math.max(0, Number.isFinite(strength) ? strength : 1);
}

/** 绑定级联太阳阴影源（Script_Main 在 LightRig 建好后调一次）。 */
export function SetWaterLightRig(lightRig) {
  lightRigRef = lightRig || null;
  if (lightRigRef) {
    lightRigRef.RegisterShadowUniforms(waterShadowUniforms);
    lightRigRef.SyncShadowUniforms();
  } else {
    waterShadowUniforms.uSunShadowEnabled.value = 0;
  }
}

/** 绑定物理大气天空视图 LUT（Script_Main 建好 SkyDome / 切大气开关后调用）。 */
export function SetWaterAtmosphere(atmosphere) {
  atmosphereRef = atmosphere || null;
  if (atmosphereRef?.sampleUniforms) {
    const src = atmosphereRef.sampleUniforms;
    waterAtmoUniforms.uAtmoSkyView = src.uAtmoSkyView;
    waterAtmoUniforms.uAtmoSkyViewSize = src.uAtmoSkyViewSize;
    waterAtmoUniforms.uAtmoEnabled = src.uAtmoEnabled;
    waterAtmoUniforms.uAtmoViewHeight = src.uAtmoViewHeight;
    waterAtmoUniforms.uAtmoSkyTint = src.uAtmoSkyTint;
    waterAtmoUniforms.uAtmoSkyFloor = src.uAtmoSkyFloor;
    for (const mat of materialCache.values()) {
      if ("uAtmoSkyView" in mat.uniforms) {
        mat.uniforms.uAtmoSkyView = src.uAtmoSkyView;
        mat.uniforms.uAtmoSkyViewSize = src.uAtmoSkyViewSize;
        mat.uniforms.uAtmoEnabled = src.uAtmoEnabled;
        mat.uniforms.uAtmoViewHeight = src.uAtmoViewHeight;
        mat.uniforms.uAtmoSkyTint = src.uAtmoSkyTint;
        mat.uniforms.uAtmoSkyFloor = src.uAtmoSkyFloor;
      }
    }
  } else {
    waterAtmoUniforms.uAtmoEnabled.value = 0;
  }
}

/** 同步当前时段/环境的雾与远景烟霾参数（每帧 RenderScene 调用）。 */
export function SetWaterFog(fogPreset, sunColorHex = 0xffd2a0) {
  if (!fogPreset) return;
  if (fogPreset.color != null) sharedUniforms.uFogColor.value.setHex(fogPreset.color);
  if (sunColorHex != null) sharedUniforms.uFogSunColor.value.setHex(sunColorHex);
  sharedUniforms.uFogDensity.value = Math.max(0, fogPreset.density ?? 0.0012);
  sharedUniforms.uFogHeightFalloff.value = Math.max(0.002, fogPreset.heightFalloff ?? 0.035);
  sharedUniforms.uFogSunAmount.value = Math.max(0, fogPreset.sunAmount ?? 0.25);
}

/**
 * 注入一圈世界空间交互波纹（涉水脚步、弹着点、手榴弹/炮弹水花）。
 * 编辑器 low 档下不堆积渲染开销，但仍接受调用并静默跳过。
 */
export function AddWaterRipple(x, z, options = {}) {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
  const tier = WATER_QUALITY_TIERS[GetEffectiveWaterQuality()];
  if (!tier || tier.maxRipples <= 0) return false;
  const now = sharedUniforms.uTime.value;
  const strength = Math.max(0.05, Math.min(2.5, options.strength ?? WATER_RIPPLES.wadeStrength));
  const radius = Math.max(0.8, Math.min(24.0, options.radius ?? WATER_RIPPLES.wadeRadiusM));
  const speed = Math.max(0.6, Math.min(12.0, options.speed ?? WATER_RIPPLES.wadeSpeed));
  const freq = Math.max(2.0, Math.min(24.0, options.freq ?? WATER_RIPPLES.wadeFreq));
  const foam = Math.max(0.0, Math.min(1.5, options.foam ?? WATER_RIPPLES.wadeFoam));
  const entry = { x, z, birth: now, strength, radius, speed, freq, foam };
  if (rippleEntries.length >= MAX_RIPPLES) {
    rippleEntries.shift();
  }
  rippleEntries.push(entry);
  SyncRippleUniforms();
  return true;
}

function SyncRippleUniforms() {
  const now = sharedUniforms.uTime.value;
  const tier = WATER_QUALITY_TIERS[GetEffectiveWaterQuality()];
  const limit = Math.min(MAX_RIPPLES, tier?.maxRipples ?? 0);
  // 清理已完全扩散消散的波纹
  for (let i = rippleEntries.length - 1; i >= 0; i -= 1) {
    const r = rippleEntries[i];
    const life = r.radius / Math.max(0.5, r.speed) + 0.6;
    if (now - r.birth > life || now < r.birth - 1.0) {
      rippleEntries.splice(i, 1);
    }
  }
  const count = Math.min(limit, rippleEntries.length);
  const start = rippleEntries.length - count;
  for (let i = 0; i < count; i += 1) {
    const r = rippleEntries[start + i];
    ripplePosUniform[i].set(r.x, r.z, r.birth, r.strength);
    rippleParamUniform[i].set(r.radius, r.speed, r.freq, r.foam);
  }
  for (let i = count; i < MAX_RIPPLES; i += 1) {
    ripplePosUniform[i].set(0, 0, -9999, 0);
  }
  sharedUniforms.uRippleCount.value = count;
}

/** 运行时取证口：供 Debug.Water.State()、画质面板与自动化测试读取。 */
export function GetWaterState() {
  PruneTrackedSurfaces();
  const effective = GetEffectiveWaterQuality();
  const tier = WATER_QUALITY_TIERS[effective];
  const meshes = [];
  for (const r of trackedSurfaces) {
    if (r.mesh?.visible !== false) meshes.push({ name: r.mesh.name, preset: r.preset });
  }
  return {
    mode: waterMode,
    requestedQuality,
    forcedQuality,
    effectiveQuality: effective,
    tierLabel: tier.label,
    hasSsr: !!(ssrTraceRef && tier.ssr),
    hasShadows: !!(lightRigRef && tier.shadows),
    hasAtmosphere: !!(atmosphereRef && tier.physicalSky),
    hasRefraction: !!tier.refraction,
    hasOpaqueCopy: sharedUniforms.uWaterHasOpaque.value > 0.5,
    opaqueCopyCount,
    opaqueCopySize: waterOpaqueTarget ? [waterOpaqueTarget.width, waterOpaqueTarget.height] : null,
    activeMeshes: meshes.length,
    meshes,
    activeRipples: sharedUniforms.uRippleCount.value,
    presets: Object.keys(WATER_PRESETS),
    tiers: WATER_QUALITY_KEYS.slice(),
  };
}

// ---------------------------------------------------------------------------
// 确定性程序化光学贴图（双频 FFT 坡度场 + 蜂窝泡沫/焦散/风斑细节图）
// ---------------------------------------------------------------------------

function MakeRng(seed) {
  let s = seed | 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) | 0;
    return ((s >>> 0) + 0.5) / 4294967296;
  };
}

function Fft1D(re, im, n, inverse) {
  for (let i = 1, j = 0; i < n; i += 1) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      let t = re[i]; re[i] = re[j]; re[j] = t;
      t = im[i]; im[i] = im[j]; im[j] = t;
    }
  }
  const sign = inverse ? 1 : -1;
  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1;
    const step = (sign * 2 * Math.PI) / len;
    const wStepR = Math.cos(step);
    const wStepI = Math.sin(step);
    for (let i = 0; i < n; i += len) {
      let wr = 1, wi = 0;
      for (let k = 0; k < half; k += 1) {
        const u = i + k;
        const v = u + half;
        const vr = re[v] * wr - im[v] * wi;
        const vi = re[v] * wi + im[v] * wr;
        re[v] = re[u] - vr;
        im[v] = im[u] - vi;
        re[u] += vr;
        im[u] += vi;
        const nextR = wr * wStepR - wi * wStepI;
        wi = wr * wStepI + wi * wStepR;
        wr = nextR;
      }
    }
  }
  if (inverse) {
    const invN = 1 / n;
    for (let i = 0; i < n; i += 1) { re[i] *= invN; im[i] *= invN; }
  }
}

function Fft2D(re, im, n, inverse) {
  const rowR = new Float32Array(n);
  const rowI = new Float32Array(n);
  for (let y = 0; y < n; y += 1) {
    const off = y * n;
    rowR.set(re.subarray(off, off + n));
    rowI.set(im.subarray(off, off + n));
    Fft1D(rowR, rowI, n, inverse);
    re.set(rowR, off);
    im.set(rowI, off);
  }
  for (let x = 0; x < n; x += 1) {
    for (let y = 0; y < n; y += 1) {
      const idx = y * n + x;
      rowR[y] = re[idx];
      rowI[y] = im[idx];
    }
    Fft1D(rowR, rowI, n, inverse);
    for (let y = 0; y < n; y += 1) {
      const idx = y * n + x;
      re[idx] = rowR[y];
      im[idx] = rowI[y];
    }
  }
}

function BuildSlopeField(n, rng, { kMin, kMax, kPeak, exponent, dirAngle, dirPower }) {
  const count = n * n;
  const dxRe = new Float32Array(count), dxIm = new Float32Array(count);
  const dzRe = new Float32Array(count), dzIm = new Float32Array(count);
  const windX = Math.cos(dirAngle), windZ = Math.sin(dirAngle);
  const half = n >> 1;

  for (let y = 0; y < n; y += 1) {
    const kz = y <= half ? y : y - n;
    for (let x = 0; x < n; x += 1) {
      const kx = x <= half ? x : x - n;
      const k2 = kx * kx + kz * kz;
      if (k2 === 0) continue;
      const k = Math.sqrt(k2);
      if (k < kMin || k > kMax) continue;
      // Box-Muller 高斯复振幅
      const u1 = Math.max(1e-7, rng());
      const u2 = rng();
      const mag = Math.sqrt(-2 * Math.log(u1));
      const gr = mag * Math.cos(2 * Math.PI * u2);
      const gi = mag * Math.sin(2 * Math.PI * u2);
      // Phillips / JONSWAP 风格谱：抑制极低频泥块，强化中高频浪脊与细涟漪
      const dirDot = Math.abs((kx * windX + kz * windZ) / k);
      const dirWeight = 0.28 + 0.72 * Math.pow(dirDot, dirPower);
      const peakCut = Math.exp(-Math.pow(kPeak / k, 2.2));
      const hiCut = Math.exp(-Math.pow(k / (kMax * 0.82), 3.0));
      const amp = Math.pow(k, -exponent) * peakCut * hiCut * dirWeight;
      // H(k) 的空间偏导：i * kx * H(k) 与 i * kz * H(k)
      const hR = gr * amp;
      const hI = gi * amp;
      const idx = y * n + x;
      dxRe[idx] = -hI * kx;
      dxIm[idx] = hR * kx;
      dzRe[idx] = -hI * kz;
      dzIm[idx] = hR * kz;
    }
  }
  Fft2D(dxRe, dxIm, n, true);
  Fft2D(dzRe, dzIm, n, true);

  let sumSq = 0;
  for (let i = 0; i < count; i += 1) sumSq += dxRe[i] * dxRe[i] + dzRe[i] * dzRe[i];
  const rms = Math.sqrt(sumSq / Math.max(1, count * 2)) || 1;
  const invScale = 1 / (rms * 3.15);
  return { dx: dxRe, dz: dzRe, invScale };
}

let cachedRippleTexture = null;
/**
 * 512² RGBA8 双频 FFT 水面坡度图（无平铺接缝、零外链）：
 *   RG = 中频定向重力-毛细波坡度（清晰浪脊，避免泥块感）
 *   BA = 高频毛细微涟漪坡度（近景碎金波光与微面闪烁）
 */
function GetRippleSlopesTexture() {
  if (cachedRippleTexture) return cachedRippleTexture;
  const n = WATER_TEXTURES.rippleSize;
  const rng = MakeRng(WATER_TEXTURES.rippleSeed);
  const fieldA = BuildSlopeField(n, rng, {
    kMin: 3, kMax: 44, kPeak: 7.5, exponent: 1.85, dirAngle: 0.22, dirPower: 2.2,
  });
  const fieldB = BuildSlopeField(n, rng, {
    kMin: 14, kMax: 112, kPeak: 28, exponent: 1.55, dirAngle: -0.68, dirPower: 1.1,
  });
  const data = new Uint8Array(n * n * 4);
  const Pack = (v, inv) => Math.max(0, Math.min(255, Math.round((Math.max(-1, Math.min(1, v * inv)) * 0.5 + 0.5) * 255)));
  for (let i = 0; i < n * n; i += 1) {
    const o = i * 4;
    data[o]     = Pack(fieldA.dx[i], fieldA.invScale);
    data[o + 1] = Pack(fieldA.dz[i], fieldA.invScale);
    data[o + 2] = Pack(fieldB.dx[i], fieldB.invScale);
    data[o + 3] = Pack(fieldB.dz[i], fieldB.invScale);
  }
  const tex = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
  tex.name = "Texture_WaterRippleSlopes";
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = WATER_TEXTURES.anisotropy;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  cachedRippleTexture = tex;
  return tex;
}

/** 周期性网格哈希，用于无缝 2D Worley 蜂窝泡沫与焦散网格。 */
function Hash2Periodic(ix, iy, period, salt) {
  const px = ((ix % period) + period) % period;
  const py = ((iy % period) + period) % period;
  let h = (Math.imul(px, 374761393) + Math.imul(py, 668265263) + Math.imul(salt, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) | 0;
  const hx = ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  h = Math.imul(h ^ (h >>> 11), 2246822519) | 0;
  const hy = ((h ^ (h >>> 15)) >>> 0) / 4294967296;
  return [hx, hy];
}

function SamplePeriodicWorley(u, v, cells, salt, ptsX, ptsY) {
  const gx = u * cells;
  const gy = v * cells;
  const ix0 = Math.floor(gx);
  const iy0 = Math.floor(gy);
  const fx = gx - ix0;
  const fy = gy - iy0;
  let d1 = 9.0, d2 = 9.0;
  for (let oy = -1; oy <= 1; oy += 1) {
    const cy = ((iy0 + oy) % cells + cells) % cells;
    const rowOff = cy * cells;
    for (let ox = -1; ox <= 1; ox += 1) {
      const cx = ((ix0 + ox) % cells + cells) % cells;
      const idx = rowOff + cx;
      const dx = ox + ptsX[idx] - fx;
      const dy = oy + ptsY[idx] - fy;
      const d = dx * dx + dy * dy;
      if (d < d1) { d2 = d1; d1 = d; }
      else if (d < d2) { d2 = d; }
    }
  }
  const s1 = Math.sqrt(d1);
  const s2 = Math.sqrt(d2);
  return { f1: s1, edge: s2 - s1 };
}

function PrecomputeWorleyPoints(cells, salt) {
  const ptsX = new Float32Array(cells * cells);
  const ptsY = new Float32Array(cells * cells);
  for (let y = 0; y < cells; y += 1) {
    for (let x = 0; x < cells; x += 1) {
      const [hx, hy] = Hash2Periodic(x, y, cells, salt);
      // 保留 0.1..0.9 抖动区间，让蜂窝泡沫与焦散脉络圆润自然不出现极细尖刺
      const idx = y * cells + x;
      ptsX[idx] = 0.12 + hx * 0.76;
      ptsY[idx] = 0.12 + hy * 0.76;
    }
  }
  return { ptsX, ptsY };
}

let cachedDetailTexture = null;
/**
 * 512² RGBA8 无缝光学细节图：
 *   R = 蜂窝蕾丝泡沫网（多尺度 Worley 细胞边丝 + 气泡空洞）
 *   G = 细密岸线浮沫与气泡颗粒
 *   B = 锐利无缝 Voronoi 水下焦散光网
 *   A = 无缝大尺度风斑与平静/起皱调制掩码
 */
function GetOpticalDetailTexture() {
  if (cachedDetailTexture) return cachedDetailTexture;
  const n = WATER_TEXTURES.detailSize;
  const salt = WATER_TEXTURES.detailSeed;
  const w8  = PrecomputeWorleyPoints(8,  salt + 11);
  const w16 = PrecomputeWorleyPoints(16, salt + 37);
  const w32 = PrecomputeWorleyPoints(32, salt + 73);
  const w12 = PrecomputeWorleyPoints(12, salt + 131);
  const data = new Uint8Array(n * n * 4);

  const Clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const Smooth = (e0, e1, x) => {
    const t = Clamp01((x - e0) / (e1 - e0));
    return t * t * (3 - 2 * t);
  };

  const twoPi = Math.PI * 2;
  for (let y = 0; y < n; y += 1) {
    const v = y / n;
    for (let x = 0; x < n; x += 1) {
      const u = x / n;
      const c8  = SamplePeriodicWorley(u, v, 8,  salt + 11, w8.ptsX,  w8.ptsY);
      const c16 = SamplePeriodicWorley(u, v, 16, salt + 37, w16.ptsX, w16.ptsY);
      const c32 = SamplePeriodicWorley(u, v, 32, salt + 73, w32.ptsX, w32.ptsY);
      const c12 = SamplePeriodicWorley(u, v, 12, salt + 131, w12.ptsX, w12.ptsY);

      // R: 蕾丝蜂窝泡沫网（大网格空洞 + 中网格丝络）
      const webCoarse = 1.0 - Smooth(0.02, 0.24, c8.edge);
      const webMid    = 1.0 - Smooth(0.015, 0.20, c16.edge);
      const holeMask  = Smooth(0.22, 0.56, c8.f1);
      const foamLace  = Clamp01(Math.max(webCoarse * 0.85, webMid * (0.45 + 0.55 * holeMask)));

      // G: 细密微气泡与岸边泡沫碎片
      const bubbleWeb = 1.0 - Smooth(0.02, 0.26, c32.edge);
      const bubbleDot = 1.0 - Smooth(0.18, 0.42, c32.f1);
      const foamFine  = Clamp01(bubbleWeb * 0.65 + bubbleDot * 0.45);

      // B: 水下焦散光丝（双尺度 Voronoi 锐利焦散脊）
      const causticA = Math.pow(Clamp01(1.0 - c12.edge * 3.15), 2.8);
      const causticB = Math.pow(Clamp01(1.0 - c16.edge * 3.45), 3.1);
      const caustic  = Clamp01(causticA * 0.72 + causticB * 0.52 + causticA * causticB * 0.65);

      // A: 无缝平滑风斑（低频谐波 + 柔和细胞调制，用来切出镜面与起皱水域）
      const gustWave = 0.5
        + 0.22 * Math.sin(twoPi * (u * 2 + v * 1) + 0.7)
        + 0.16 * Math.cos(twoPi * (u * 1 - v * 3) + 1.9)
        + 0.12 * Math.sin(twoPi * (u * 3 + v * 2) + 4.1);
      const gust = Clamp01(gustWave * 0.68 + (1.0 - Clamp01(c8.f1 * 1.15)) * 0.32);

      const o = (y * n + x) * 4;
      data[o]     = Math.round(foamLace * 255);
      data[o + 1] = Math.round(foamFine * 255);
      data[o + 2] = Math.round(caustic * 255);
      data[o + 3] = Math.round(gust * 255);
    }
  }

  const tex = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
  tex.name = "Texture_WaterOpticalDetail";
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = WATER_TEXTURES.anisotropy;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  cachedDetailTexture = tex;
  return tex;
}

// ---------------------------------------------------------------------------
// 当前帧主 HDR 靶折射拷贝（Single-Layer Water，零额外 draw call）
// ---------------------------------------------------------------------------

function CaptureWaterOpaqueColor(renderer, camera, scale) {
  if (!renderer || (lastMainCamera && camera && camera !== lastMainCamera)) return;
  const frameId = renderer.info?.render?.frame ?? -1;
  if (frameId >= 0 && frameId === lastOpaqueCopyFrame) return;

  const gl = renderer.getContext?.();
  if (!gl || typeof gl.blitFramebuffer !== "function") {
    sharedUniforms.uWaterHasOpaque.value = 0;
    return;
  }
  const activeRT = renderer.getRenderTarget?.();
  if (!activeRT || activeRT.isWebGLCubeRenderTarget || activeRT.width < 64 || activeRT.height < 64) {
    sharedUniforms.uWaterHasOpaque.value = 0;
    return;
  }
  const activeProps = renderer.properties?.get?.(activeRT);
  const srcSamples = activeRT.samples || 0;
  const srcFbo = srcSamples > 0
    ? activeProps?.__webglMultisampledFramebuffer
    : activeProps?.__webglFramebuffer;
  if (!srcFbo) {
    sharedUniforms.uWaterHasOpaque.value = 0;
    return;
  }

  // WebGL2 规范：从多采样 READ_FRAMEBUFFER blit 时，源/目标尺寸与内部格式必须严格一致，且滤镜必须为 NEAREST。
  const effScale = srcSamples > 0 ? 1.0 : Math.max(0.25, Math.min(1.0, scale || 0.5));
  const dstW = Math.max(2, Math.round(activeRT.width * effScale));
  const dstH = Math.max(2, Math.round(activeRT.height * effScale));
  const wantType = activeRT.texture?.type || THREE.HalfFloatType;
  let reinit = false;

  if (!waterOpaqueTarget || waterOpaqueTargetType !== wantType) {
    DisposeOpaqueTarget();
    waterOpaqueTarget = new THREE.WebGLRenderTarget(dstW, dstH, {
      type: wantType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      wrapS: THREE.ClampToEdgeWrapping,
      wrapT: THREE.ClampToEdgeWrapping,
      depthBuffer: false,
      stencilBuffer: false,
      generateMipmaps: false,
    });
    waterOpaqueTarget.texture.colorSpace = THREE.NoColorSpace;
    waterOpaqueTarget.texture.name = "WaterOpaqueHdrCopy";
    waterOpaqueTargetType = wantType;
    renderer.initRenderTarget(waterOpaqueTarget);
    reinit = true;
  } else if (waterOpaqueTarget.width !== dstW || waterOpaqueTarget.height !== dstH) {
    waterOpaqueTarget.setSize(dstW, dstH);
    renderer.initRenderTarget(waterOpaqueTarget);
    reinit = true;
  }

  if (reinit) {
    // initRenderTarget 内部会切换 GL 绑定，先同步回主靶以确保 Three.js state 缓存一致。
    renderer.setRenderTarget(activeRT);
  }

  const dstProps = renderer.properties?.get?.(waterOpaqueTarget);
  const dstFbo = dstProps?.__webglFramebuffer;
  if (!dstFbo) {
    sharedUniforms.uWaterHasOpaque.value = 0;
    return;
  }

  const scissorWasOn = gl.isEnabled(gl.SCISSOR_TEST);
  if (scissorWasOn) gl.disable(gl.SCISSOR_TEST);
  gl.bindFramebuffer(gl.READ_FRAMEBUFFER, srcFbo);
  gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, dstFbo);
  gl.blitFramebuffer(
    0, 0, activeRT.width, activeRT.height,
    0, 0, dstW, dstH,
    gl.COLOR_BUFFER_BIT,
    srcSamples > 0 ? gl.NEAREST : gl.LINEAR,
  );
  // 恢复 READ + DRAW 到当前主 HDR 靶，与 renderer.state 缓存保持一致
  gl.bindFramebuffer(gl.FRAMEBUFFER, srcFbo);
  if (scissorWasOn) gl.enable(gl.SCISSOR_TEST);

  sharedUniforms.uWaterOpaqueColor.value = waterOpaqueTarget.texture;
  sharedUniforms.uWaterHasOpaque.value = 1;
  lastOpaqueCopyFrame = frameId;
  opaqueCopyCount += 1;
}

// ---------------------------------------------------------------------------
// 顶点与片元着色器（按档位精确编译：low 2 采样器 / medium 11 / high&ultra 15）
// ---------------------------------------------------------------------------

function MakeWaterVertexShader(gerstnerCount) {
  const waveLoop = Math.max(0, Math.min(MAX_WAVES, gerstnerCount | 0));
  return /* glsl */`
precision highp float;

attribute float aWaterEdge;

uniform float uTime;
uniform vec4 uWaveDirAmp[${MAX_WAVES}];     // xy = 单位波向, z = 角波数 k, w = 振幅 A
uniform vec4 uWaveSpeedSteep[${MAX_WAVES}]; // x = 角频率 w, y = 陡度 Q, z = 1, w = 0

varying vec3 vWorldPos;
varying vec3 vGeoNormal;
varying vec2 vRestXz;
varying float vRestY;
varying float vViewZ;
varying float vWaveHeight;
varying float vWaveCrest;
varying float vShoreEdge;

void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vRestXz = wp.xz;
  vRestY = wp.y;
  float edgeMask = clamp(aWaterEdge, 0.0, 1.0);
  vShoreEdge = edgeMask;

  vec3 displaced = wp.xyz;
  vec3 tangent = vec3(1.0, 0.0, 0.0);
  vec3 binormal = vec3(0.0, 0.0, 1.0);
  float waveH = 0.0;
  float crestAcc = 0.0;

  // 岸边柔和收敛振幅（aWaterEdge -> 0），避免波浪在岸沿浮空或穿插干土
  float waveScale = smoothstep(0.0, 0.55, edgeMask);

  for (int i = 0; i < ${waveLoop}; i++) {
    vec4 da = uWaveDirAmp[i];
    vec4 ss = uWaveSpeedSteep[i];
    float amp = da.w * waveScale;
    if (amp <= 1e-5) continue;
    vec2 dir = da.xy;
    float k = da.z;
    float phase = k * dot(dir, wp.xz) - ss.x * uTime;
    float s = sin(phase);
    float c = cos(phase);
    float q = ss.y * waveScale;
    float wa = k * amp;
    displaced.x += q * amp * dir.x * c;
    displaced.z += q * amp * dir.y * c;
    displaced.y += amp * s;
    waveH += amp * s;
    crestAcc += max(0.0, s) * wa;

    tangent.x -= q * dir.x * dir.x * wa * s;
    tangent.y += dir.x * wa * c;
    tangent.z -= q * dir.x * dir.y * wa * s;

    binormal.x -= q * dir.x * dir.y * wa * s;
    binormal.y += dir.y * wa * c;
    binormal.z -= q * dir.y * dir.y * wa * s;
  }

  vWorldPos = displaced;
  vGeoNormal = normalize(cross(binormal, tangent));
  vWaveHeight = waveH;
  vWaveCrest = clamp(crestAcc * 2.2, 0.0, 1.5);

  vec4 mv = viewMatrix * vec4(displaced, 1.0);
  vViewZ = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;
}

/** 仅绑 uAtmoSkyView 一张贴图的物理天空反射采样块（省出 uAtmoTrans 给 CSM 阴影，守 15/16 预算）。 */
const WATER_ATMO_SKY_GLSL = `${ATMOSPHERE_CONST_GLSL}
uniform sampler2D uAtmoSkyView;
uniform vec2 uAtmoSkyViewSize;
uniform float uAtmoEnabled;
uniform float uAtmoViewHeight;
uniform vec3 uAtmoSkyTint;
uniform vec3 uAtmoSkyFloor;

vec3 WaterSampleAtmoSky(vec3 dir, vec3 sunDir) {
  float viewZenithCos = clamp(dir.y, -1.0, 1.0);
  vec2 dirH = vec2(dir.x, dir.z);
  vec2 sunH = vec2(sunDir.x, sunDir.z);
  float lenD = length(dirH);
  float lenS = length(sunH);
  float lightViewCos = (lenD < 1e-5 || lenS < 1e-5) ? 1.0 : dot(dirH / lenD, sunH / lenS);
  vec2 uv = AtmoSkyViewUv(viewZenithCos, lightViewCos, uAtmoViewHeight, uAtmoSkyViewSize);
  return max(texture2D(uAtmoSkyView, uv).rgb, vec3(0.0)) * uAtmoSkyTint + uAtmoSkyFloor;
}
`;

function MakeWaterFragmentShader(tier, { withSsr, withShadows, withPhysicalSky }) {
  const useSsr = !!(tier.ssr && withSsr);
  const useShadows = !!(tier.shadows && withShadows);
  const useAtmo = !!(tier.physicalSky && withPhysicalSky);
  const useRefraction = !!tier.refraction;
  const useDispersion = !!(tier.refraction && tier.chromaticDispersion);
  const useCaustics = !!(tier.caustics && tier.causticsLayers > 0);
  const useDetailTex = useCaustics || tier.foamLayers >= 2 || tier.windGusts;
  const useScreenSky = !!(useSsr && tier.screenSky);
  const maxRipples = Math.max(0, Math.min(MAX_RIPPLES, tier.maxRipples | 0));

  const ssrBlock = useSsr
    ? SsrSurfaceBlockGlsl({
        steps: tier.ssrSteps || 32,
        refine: tier.ssrRefine || 3,
        name: "SsrWaterReflection",
        rejectFront: true,
        hizSlots: tier.ssrHizSlots || 4,
      })
    : "";

  return /* glsl */`
precision highp float;

uniform float uTime;
uniform sampler2D uWaterRippleMap;
${useDetailTex ? "uniform sampler2D uWaterDetailMap;" : ""}
${useSsr ? "" : "uniform sampler2D uSceneDepth;"}
${useRefraction ? "uniform sampler2D uWaterOpaqueColor;\nuniform float uWaterHasOpaque;" : ""}
uniform vec2 uResolution;
uniform float uCameraFar;
uniform mat4 uViewMatrix;
uniform float uWaterSsrEnabled;
uniform float uWaterSsrStrength;

uniform vec3 uSunDir;
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uSunColor;
uniform float uSunIntensity;

uniform vec3 uShallowColor;
uniform vec3 uDeepColor;
uniform vec3 uScatterColor;
uniform vec3 uExtinctionRgb;
uniform float uClarityDepth;
uniform float uTurbidity;
uniform float uRoughness;
uniform float uSpecScale;
uniform float uRefractionStrength;
uniform float uDispersionStrength;
uniform float uCausticsStrength;
uniform float uCausticsScale;
uniform float uSubsurfaceStrength;
uniform float uFoamWidth;
uniform float uFoamStrength;
uniform float uFoamSwash;
uniform float uCrestFoam;
uniform float uWetBankDepth;
uniform float uWetBankDarken;
uniform float uEdgeFadeDepth;
uniform vec2 uFlow;
uniform float uRippleScale;
uniform float uRippleSpeed;
uniform float uRippleStrength;
uniform float uMicroScale;
uniform float uMicroStrength;
uniform float uWindGustStrength;
uniform float uSsrStrength;
uniform float uSkyReflectScale;

uniform vec3 uFogColor;
uniform vec3 uFogSunColor;
uniform float uFogDensity;
uniform float uFogHeightFalloff;
uniform float uFogSunAmount;

${maxRipples > 0 ? `
uniform vec4 uRipplePos[${MAX_RIPPLES}];
uniform vec4 uRippleParam[${MAX_RIPPLES}];
uniform float uRippleCount;
` : ""}

${useAtmo ? WATER_ATMO_SKY_GLSL : ""}
${ssrBlock}
${useShadows ? SUN_SHADOW_GLSL : ""}

varying vec3 vWorldPos;
varying vec3 vGeoNormal;
varying vec2 vRestXz;
varying float vRestY;
varying float vViewZ;
varying float vWaveHeight;
varying float vWaveCrest;
varying float vShoreEdge;

const float WATER_PI = 3.14159265359;

float WaterIgn(vec2 p) {
  return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
}

float WaterRawDepth(vec2 uv) {
  return texture2D(${useSsr ? "uSsrDepth" : "uSceneDepth"}, uv).a;
}

vec2 Rot2(vec2 p, float c, float s) {
  return vec2(p.x * c - p.y * s, p.x * s + p.y * c);
}

// Trowbridge-Reitz GGX 法线分布函数 + 高度相关 Smith 遮蔽项
float WaterDggx(float NoH, float alpha) {
  float a2 = alpha * alpha;
  float d = NoH * NoH * (a2 - 1.0) + 1.0;
  return a2 / max(WATER_PI * d * d, 1e-6);
}

float WaterSmithG2(float NoV, float NoL, float alpha) {
  float a2 = alpha * alpha;
  float lv = NoL * sqrt(a2 + (1.0 - a2) * NoV * NoV);
  float ll = NoV * sqrt(a2 + (1.0 - a2) * NoL * NoL);
  return 2.0 * NoL * NoV / max(lv + ll, 1e-5);
}

// 解析天空回退（low 档或 ?skyLegacy=1 时使用）
vec3 WaterAnalyticalSky(vec3 dir, vec3 sunDir) {
  float up = clamp(dir.y, 0.0, 1.0);
  vec3 sky = mix(uHorizon, uZenith, pow(up, 0.52));
  float sunCos = max(0.0, dot(dir, sunDir));
  float sunLift = smoothstep(-0.06, 0.16, sunDir.y);
  sky += uSunColor * (0.28 * pow(sunCos, 6.0) + 0.45 * pow(sunCos, 32.0)) * sunLift;
  return max(sky, vec3(0.0));
}

vec3 WaterSkyRadiance(vec3 dir, vec3 sunDir) {
  vec3 d = normalize(vec3(dir.x, max(dir.y, 0.015), dir.z));
  vec3 outSky = WaterAnalyticalSky(d, sunDir);
  ${useAtmo ? `
  if (uAtmoEnabled > 0.5) {
    vec3 atmoSky = WaterSampleAtmoSky(d, sunDir);
    // 略压极近地平线的暗带，让低掠射倒影与远景雾色顺滑衔接
    float horizFade = smoothstep(0.0, 0.08, d.y);
    outSky = mix(max(atmoSky, uFogColor * 0.55), atmoSky, horizFade);
  }
  ` : ""}
  return outSky;
}

${useScreenSky ? `
vec4 WaterScreenSkyReflection(vec3 viewPos, vec3 reflViewDir, float rough) {
  if (uSsrHasColor < 0.5) return vec4(0.0);
  if (reflViewDir.z >= -0.05) return vec4(0.0);
  vec3 farPt = viewPos + reflViewDir * (uSsrFar * 0.85);
  vec2 uv = SsrViewToUv(farPt);
  vec2 edge = min(uv, vec2(1.0) - uv);
  float inScreen = smoothstep(0.0, 0.09, min(edge.x, edge.y));
  if (inScreen <= 0.001) return vec4(0.0);
  float d = SsrSceneDepth(uv);
  float isSky = step(uSsrFar * 0.99, d);
  if (isSky < 0.5) return vec4(0.0);
  float lod = clamp(rough * 5.0, 0.0, max(uSsrColorLods - 1.0, 0.0));
  vec3 col = max(textureLod(uSsrColor, uv, lod).rgb, vec3(0.0));
  return vec4(col, inScreen);
}
` : ""}

void main() {
  vec2 screenUv = clamp(gl_FragCoord.xy / max(uResolution, vec2(1.0)), vec2(0.001), vec2(0.999));
  vec3 toCam = cameraPosition - vWorldPos;
  float camDist = max(length(toCam), 0.001);
  vec3 V = toCam / camDist;
  vec3 sunDir = normalize(uSunDir);
  // 黄昏低仰角（5°–10°）同样保留充足日路高光与焦散，日落后柔和归零
  float sunLift = smoothstep(-0.02, 0.09, sunDir.y);
  float sunPower = clamp(uSunIntensity * 0.085, 0.45, 4.8);

  // --- 1. 精确河床三维坐标与视角无关竖向水深 -------------------------------
  float rawDepth = WaterRawDepth(screenUv);
  bool hasBed = rawDepth > 0.001 && rawDepth < (uCameraFar * 0.992);
  float safeViewZ = max(vViewZ, 0.02);
  vec3 bedWorldPos = hasBed
    ? cameraPosition + (vWorldPos - cameraPosition) * (rawDepth / safeViewZ)
    : (vWorldPos - vec3(0.0, 3.0, 0.0));
  float trueDepth = hasBed ? max(0.0, vRestY - bedWorldPos.y) : 3.0;
  float rayPath = hasBed ? max(0.0, length(bedWorldPos - vWorldPos)) : 5.0;

  // --- 2. 风斑平静/起皱调制（3A 河面质感核心）-------------------------------
  float windGust = 1.0;
  float gustField = 0.5;
  ${tier.windGusts && useDetailTex ? `
  vec2 gustUvA = vRestXz * 0.017 - uFlow * (uTime * 0.0045);
  vec2 gustUvB = Rot2(vRestXz * 0.041, 0.82, 0.57) + vec2(uTime * 0.003, -uTime * 0.002);
  float gA = texture2D(uWaterDetailMap, gustUvA).a;
  float gB = texture2D(uWaterDetailMap, gustUvB).a;
  gustField = smoothstep(0.18, 0.86, gA * 0.65 + gB * 0.35);
  // 岸边浅水稍平，河心受风面起皱更活
  windGust = mix(1.0 - uWindGustStrength * 0.55, 1.0 + uWindGustStrength * 0.45, gustField);
  ` : ""}

  // --- 3. 多尺度 FFT 坡度法线 + 毛细微涟漪 + 交互波纹 + Toksvig 抗锯齿 ------
  vec2 flow = uFlow;
  vec2 adv = flow * (uTime * uRippleSpeed);
  vec2 uv0 = vRestXz * uRippleScale - adv;
  vec4 tap0 = texture2D(uWaterRippleMap, uv0);
  vec2 slope = (tap0.rg * 2.0 - 1.0) * 0.52;

  // 第二八度：跨角反向平流，彻底打散定向条纹
  vec2 uv1 = Rot2(vRestXz * (uRippleScale * 1.63), 0.788, 0.616) - Rot2(adv * 1.18, 0.866, -0.5);
  vec4 tap1 = texture2D(uWaterRippleMap, uv1);
  slope += (tap1.rg * 2.0 - 1.0) * 0.34;
  ${tier.rippleOctaves >= 3 ? `
  // 第三八度：BA 高频毛细波段（无周期重叠）
  vec2 uv2 = Rot2(vRestXz * (uRippleScale * 2.45), -0.422, 0.906) - adv * 1.48 + vec2(0.37, 0.19);
  vec4 tap2 = texture2D(uWaterRippleMap, uv2);
  slope += (tap2.ba * 2.0 - 1.0) * 0.28;
  ` : ""}
  ${tier.rippleOctaves >= 4 ? `
  // 第四八度：逆风细波交叉干扰，产生真实碎面光泽
  vec2 uv3 = Rot2(vRestXz * (uRippleScale * 3.85), 0.259, -0.966) + adv * 0.92 + vec2(0.71, 0.53);
  vec4 tap3 = texture2D(uWaterRippleMap, uv3);
  slope += (tap3.ba * 2.0 - 1.0) * 0.20;
  ` : ""}

  // 远距离温和衰减高频法线，近景保留锐利微涟漪
  float distFade = 1.0 / (1.0 + camDist * 0.0085);
  float shoreCalm = smoothstep(0.0, 0.16, trueDepth) * (0.35 + 0.65 * vShoreEdge);
  vec2 microSlope = vec2(0.0);
  ${tier.microCapillary ? `
  float microFade = 1.0 / (1.0 + camDist * 0.055);
  vec2 mUvA = vRestXz * uMicroScale - adv * 2.1;
  vec2 mUvB = Rot2(vRestXz * (uMicroScale * 1.41), 0.64, -0.77) + adv * 1.65;
  vec2 mA = texture2D(uWaterRippleMap, mUvA).ba * 2.0 - 1.0;
  vec2 mB = texture2D(uWaterRippleMap, mUvB).ba * 2.0 - 1.0;
  microSlope = (mA + mB) * (0.5 * uMicroStrength * microFade);
  ` : ""}

  vec2 totalSlope = (slope * uRippleStrength * distFade + microSlope) * windGust * (0.45 + 0.55 * shoreCalm);

  // 交互波纹（涉水脚步 / 炮弹水花 / 弹着点）
  float rippleFoam = 0.0;
  ${maxRipples > 0 ? `
  int rCount = int(uRippleCount + 0.5);
  for (int i = 0; i < ${maxRipples}; i++) {
    if (i >= rCount) break;
    vec4 rp = uRipplePos[i];
    vec4 rq = uRippleParam[i];
    float age = uTime - rp.z;
    if (age <= 0.0 || rp.w <= 0.001) continue;
    vec2 dVec = vRestXz - rp.xy;
    float d2 = dot(dVec, dVec);
    float maxR = rq.x;
    if (d2 >= maxR * maxR) continue;
    float dist = sqrt(max(d2, 1e-6));
    float front = age * rq.y;
    float band = dist - front;
    // 局限在扩散波前附近的波列包络，衰减平滑不生硬
    float ringEnv = exp(-band * band * 2.6) * (1.0 - smoothstep(maxR * 0.35, maxR, dist));
    float timeDecay = exp(-age * 0.72);
    float amp = rp.w * ringEnv * timeDecay;
    if (amp > 0.002) {
      float waveDeriv = cos(band * rq.z) * amp;
      totalSlope += (dVec / dist) * (waveDeriv * 0.52);
      rippleFoam += max(0.0, sin(band * rq.z * 0.7 + 0.6)) * amp * rq.w;
    }
  }
  ` : ""}

  vec3 N = normalize(vGeoNormal + vec3(totalSlope.x, 0.0, totalSlope.y));
  // 防止法线在极陡处朝向相机背面造成黑点
  float NoV = max(dot(N, V), 0.02);

  // Toksvig / 屏幕导数高光抗锯齿：把亚像素法线方差折算进 GGX 粗糙度 alpha，
  // 近看锐利碎金、远看丝滑日路，彻底消除闪烁噪点。
  vec3 dNdx = dFdx(N);
  vec3 dNdy = dFdy(N);
  float normalVar = clamp(dot(dNdx, dNdx) + dot(dNdy, dNdy), 0.0, 0.35);
  float gustRough = mix(uRoughness * 0.62, uRoughness * 1.48, clamp((windGust - 0.65) / 0.75, 0.0, 1.0));
  float effRough = clamp(sqrt(gustRough * gustRough + normalVar * 0.55), 0.018, 0.52);
  float alpha = max(effRough * effRough, 0.0008);

  // --- 4. 级联太阳阴影（桥身、桥墩、岸堤、柳树真实投在水面与焦散上）--------
  float sunVis = 1.0;
  ${useShadows ? `
  sunVis = SunShadowVisibility(vWorldPos, vec3(0.0, 1.0, 0.0));
  ` : ""}

  // --- 5. 水下折射 + 色散 + 世界空间动态焦散 + 光谱 Beer-Lambert 吸收 --------
  vec3 skyAmb = WaterSkyRadiance(vec3(0.0, 0.55, 0.0), sunDir);
  vec3 horizAmb = WaterSkyRadiance(vec3(V.x, 0.12, V.z), sunDir);
  // 太阳有效照度（白昼亮、黄昏暖、夜战自然归零）
  vec3 sunIrrad = uSunColor * (sunLift * (0.45 + 0.55 * max(sunDir.y, 0.0)));
  vec3 ambientLight = skyAmb * 0.42 + horizAmb * 0.28 + vec3(0.012);

  // 浅→深水体散射基色（严格受太阳阴影与昼夜天光驱动，夜战绝不发灰发亮）
  float depthMix = 1.0 - exp(-trueDepth / max(uClarityDepth, 0.15));
  vec3 bodyAlbedo = mix(uShallowColor, uDeepColor, clamp(depthMix, 0.0, 1.0));
  vec3 bodyLit = bodyAlbedo * (ambientLight + sunIrrad * (0.58 * sunVis + 0.12));

  // 逆光波峰次表面透光散射（Henyey-Greenstein 前向散射 + 波高透光）
  ${tier.subsurface ? `
  float forwardScatter = pow(max(dot(V, -sunDir), 0.0), 4.0);
  float waveThin = clamp(vWaveCrest * 0.75 + max(0.0, vWaveHeight * 14.0) + (1.0 - depthMix) * 0.35, 0.0, 1.35);
  float grazingBack = pow(1.0 - NoV, 2.2) * (0.35 + 0.65 * max(dot(N, sunDir), 0.0));
  vec3 sss = uScatterColor * sunIrrad * sunVis * uSubsurfaceStrength
    * (forwardScatter * 0.85 + grazingBack * 0.42) * waveThin;
  bodyLit += sss;
  ` : ""}

  vec3 underwater = bodyLit;
  float finalAlpha = 1.0;

  ${useRefraction ? `
  if (uWaterHasOpaque > 0.5) {
    vec3 viewN = normalize((uViewMatrix * vec4(N, 0.0)).xyz);
    vec3 viewGeoN = normalize((uViewMatrix * vec4(vGeoNormal, 0.0)).xyz);
    vec2 refrSlope = (viewN - viewGeoN).xy + viewN.xy * 0.25;
    float refrScale = smoothstep(0.0, 0.42, trueDepth) * clamp(1.0 / (1.0 + camDist * 0.032), 0.12, 1.0);
    vec2 refrOffset = refrSlope * uRefractionStrength * refrScale;
    vec2 refrUv = clamp(screenUv + refrOffset, vec2(0.002), vec2(0.998));

    // 前景遮挡剔除：折射偏移点若落到水面之前的物体（桥墩/船舷/芦苇）上，退回原屏幕坐标，零黑边渗色！
    float refrDepth = WaterRawDepth(refrUv);
    bool refrOk = refrDepth > (safeViewZ + 0.015) && refrDepth < (uCameraFar * 0.992);
    if (!refrOk) {
      vec2 halfUv = clamp(screenUv + refrOffset * 0.4, vec2(0.002), vec2(0.998));
      float halfDepth = WaterRawDepth(halfUv);
      if (halfDepth > (safeViewZ + 0.015) && halfDepth < (uCameraFar * 0.992)) {
        refrUv = halfUv;
        refrDepth = halfDepth;
        refrOk = true;
      } else {
        refrUv = screenUv;
        refrDepth = rawDepth;
      }
    }

    vec3 bedColor;
    ${useDispersion ? `
    vec2 dispOff = refrSlope * uDispersionStrength * refrScale;
    vec2 uvR = clamp(refrUv + dispOff, vec2(0.002), vec2(0.998));
    vec2 uvB = clamp(refrUv - dispOff, vec2(0.002), vec2(0.998));
    float dR = WaterRawDepth(uvR);
    float dB = WaterRawDepth(uvB);
    if (dR <= safeViewZ + 0.01) uvR = refrUv;
    if (dB <= safeViewZ + 0.01) uvB = refrUv;
    bedColor = vec3(
      texture2D(uWaterOpaqueColor, uvR).r,
      texture2D(uWaterOpaqueColor, refrUv).g,
      texture2D(uWaterOpaqueColor, uvB).b
    );
    ` : `
    bedColor = texture2D(uWaterOpaqueColor, refrUv).rgb;
    `}
    bedColor = max(bedColor, vec3(0.0));

    // 精确计算折射后河床点用于吸收与焦散
    bool refrHasBed = refrDepth > 0.001 && refrDepth < (uCameraFar * 0.992);
    vec3 refrBedWorld = refrHasBed
      ? cameraPosition + (vWorldPos - cameraPosition) * (refrDepth / safeViewZ)
      : bedWorldPos;
    float refrTrueDepth = refrHasBed ? max(0.0, vRestY - refrBedWorld.y) : trueDepth;
    float refrRayPath = refrHasBed ? max(0.0, length(refrBedWorld - vWorldPos)) : rayPath;

    // 湿润水底与岸沿物理压暗（水填满砂粒气孔，彻底消除生硬干湿切线）
    float wetMask = smoothstep(0.0, max(uWetBankDepth, 0.02), refrTrueDepth);
    bedColor *= mix(1.0, 1.0 - uWetBankDarken, wetMask);

    // 世界空间动态水下焦散（双层反流 Voronoi 光网，受太阳方向倾斜 + CSM 阴影调制）
    ${useCaustics ? `
    if (sunLift > 0.01 && refrHasBed) {
      vec2 sunProj = refrBedWorld.xz - sunDir.xz * (refrTrueDepth / max(sunDir.y, 0.22));
      vec2 cFlow = uFlow * (uTime * 0.14);
      vec2 cUvA = sunProj * uCausticsScale - cFlow + totalSlope * 0.28;
      float cA = texture2D(uWaterDetailMap, cUvA).b;
      ${tier.causticsLayers >= 2 ? `
      vec2 cUvB = Rot2(sunProj * (uCausticsScale * 1.37), 0.76, -0.65) + cFlow * 0.85 - totalSlope * 0.22;
      float cB = texture2D(uWaterDetailMap, cUvB).b;
      float cPeak = clamp((cA + cB) * 0.42 + cA * cB * 1.45, 0.0, 1.6);
      // 极致档略加微妙焦散色散边缘
      vec3 cTint = vec3(1.04, 1.0, 0.92);
      ${useDispersion ? `
      float cR = texture2D(uWaterDetailMap, cUvA + vec2(0.008, 0.004)).b;
      float cBl = texture2D(uWaterDetailMap, cUvA - vec2(0.008, 0.004)).b;
      cTint = vec3(0.82 + cR * 0.42, 0.85 + cA * 0.35, 0.80 + cBl * 0.44);
      ` : ""}
      ` : `
      float cPeak = cA;
      vec3 cTint = vec3(1.02, 1.0, 0.94);
      `}
      float cWindow = smoothstep(0.015, 0.14, refrTrueDepth) * exp(-refrTrueDepth * (0.95 + uTurbidity * 0.85));
      float cDistFade = 1.0 / (1.0 + camDist * 0.025);
      bedColor += bedColor * (cTint * uSunColor * (cPeak * uCausticsStrength * cWindow * cDistFade * sunVis * sunLift * (0.75 + 0.35 * sunPower)));
    }
    ` : ""}

    // 光谱 Beer-Lambert 透射（浅滩暖砂清晰透出，深槽红光先衰、自然沉入泥青深水）
    vec3 optExt = uExtinctionRgb * (0.58 + uTurbidity * 0.62);
    vec3 transmit = exp(-optExt * refrRayPath);
    underwater = bedColor * transmit + bodyLit * (vec3(1.0) - transmit);
    // 岸边毛细弯月面带细微有机噪点，彻底消除多边形硬切线
    float edgeJit = ${useDetailTex ? "(texture2D(uWaterDetailMap, vRestXz * 0.38).r - 0.5) * 0.028" : "0.0"};
    finalAlpha = smoothstep(0.0, max(uEdgeFadeDepth, 0.01), trueDepth + edgeJit);
  } else {
    float fallbackOp = clamp(1.0 - exp(-rayPath * (0.9 + uTurbidity * 1.4)), 0.0, 0.94);
    finalAlpha = smoothstep(0.0, max(uEdgeFadeDepth, 0.01), trueDepth) * max(0.32, fallbackOp);
  }
  ` : `
  // low 档（编辑器默认）：极简半透明混合，无折射拷贝与焦散，保持 2 采样器零负担
  float lowOp = clamp(1.0 - exp(-rayPath * (0.85 + uTurbidity * 1.35)), 0.0, 0.90);
  finalAlpha = smoothstep(0.0, max(uEdgeFadeDepth, 0.01), trueDepth) * max(0.28, lowOp);
  `}

  // --- 6. 物理菲涅尔反射：Hillaire 大气 LUT + 屏空云烟 + 4 级 Hi-Z SSR -------
  vec3 R = reflect(-V, N);
  R.y = max(R.y, 0.012);
  vec3 reflColor = WaterSkyRadiance(R, sunDir) * uSkyReflectScale;

  ${useSsr ? `
  if (uWaterSsrEnabled > 0.5 && uWaterSsrStrength > 0.001) {
    vec3 viewPos = (uViewMatrix * vec4(vWorldPos, 1.0)).xyz;
    vec3 viewUp = normalize((uViewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
    // 追踪法线比微面法线柔和，并把世界反射方向钳在水面之上，杜绝向水底发射射线导致黑斑噪点
    vec3 traceWorldN = normalize(mix(vGeoNormal, N, mix(0.15, 0.24, uTurbidity)));
    vec3 reflWorld = reflect(-V, traceWorldN);
    reflWorld.y = max(reflWorld.y, 0.016);
    reflWorld = normalize(reflWorld);
    vec3 reflView = normalize((uViewMatrix * vec4(reflWorld, 0.0)).xyz);
    ${useScreenSky ? `
    vec4 screenSky = WaterScreenSkyReflection(viewPos, reflView, effRough);
    reflColor = mix(reflColor, screenSky.rgb, screenSky.a * 0.92);
    ` : ""}
    if (uSsrHasColor > 0.5 && dot(reflView, viewUp) > -0.05) {
      // 水面不做时域解算：用低幅有序抖动代替全幅高频噪声，彻底消除浅河/池塘倒影里的椒盐黑点
      float jitter = 0.25 + 0.35 * WaterIgn(gl_FragCoord.xy);
      vec3 ssrOrigin = viewPos + viewUp * max(uSsrNormalBias, 0.045);
      vec4 hit = SsrWaterReflectionTrace(ssrOrigin, reflView, jitter);
      if (hit.w > 0.001) {
        vec3 hitViewPos = SsrUvToView(hit.xy, hit.z);
        // 关键物理剔除：预通道存的是河床深度，若命中点位于水面以下（hitAboveWater <= 0），
        // 说明击中了水下河床/泥坑底，必须剔除，彻底根除水塘与浅河上的黑斑噪点！
        float hitAboveWater = dot(hitViewPos - viewPos, viewUp);
        float aboveMask = smoothstep(0.01, 0.20, hitAboveWater);
        if (aboveMask > 0.001) {
          float travel = length(hitViewPos - viewPos);
          vec3 ssrRad = SsrFetchRadiance(hit.xy, SsrColorLod(clamp(effRough * 0.95, 0.02, 0.28), travel, hit.z));
          float ssrWeight = clamp(hit.w * aboveMask * uSsrStrength * uWaterSsrStrength, 0.0, 1.0);
          ssrWeight *= smoothstep(0.03, 0.18, trueDepth);
          reflColor = mix(reflColor, ssrRad, ssrWeight);
        }
      }
    }
  }
  ` : ""}

  // 水体物理 Schlick 菲涅尔（IOR = 1.333 -> F0 = 0.02），岸沿极浅水柔和降反射让干湿过渡融为一体
  float fresnelBase = 0.02 + 0.98 * pow(1.0 - NoV, 5.0);
  float roughAtten = mix(1.0, 0.74, smoothstep(0.04, 0.35, effRough));
  float shoreFresnel = smoothstep(0.0, 0.18, trueDepth);
  float fresnel = clamp(fresnelBase * roughAtten * mix(0.16, 1.0, shoreFresnel), 0.015, 0.94);

  vec3 surface = mix(underwater, reflColor, fresnel);

  // --- 7. 双瓣 GGX 物理 HDR 太阳日路（近景碎金微闪 + 远景丝滑金带）+ 夜月微光 ---
  float NoL = max(dot(N, sunDir), 0.0);
  if (NoL > 0.001 && sunLift > 0.005) {
    vec3 H = normalize(V + sunDir);
    float NoH = max(dot(N, H), 0.0);
    float VoH = max(dot(V, H), 0.0);
    float F = 0.02 + 0.98 * pow(1.0 - VoH, 5.0);
    // 瓣 1：锐利毛细碎金微光（近中景波面闪烁）
    float alphaSparkle = clamp(gustRough * gustRough * 0.58 + normalVar * 0.22, 0.00045, 0.075);
    float dSparkle = WaterDggx(NoH, alphaSparkle);
    float gSparkle = WaterSmithG2(NoV, NoL, alphaSparkle);
    float specSparkle = (dSparkle * gSparkle * F) / max(4.0 * NoV * NoL, 1e-4) * NoL;
    // 瓣 2：Toksvig 抗锯齿主日路 + 柔和波光光晕（黄昏/逆光向地平线铺开金色波光带）
    float dRoad = WaterDggx(NoH, max(alpha * 1.65, 0.0032));
    float gRoad = WaterSmithG2(NoV, NoL, max(alpha * 1.65, 0.0032));
    float specRoad = (dRoad * gRoad * F) / max(4.0 * NoV * NoL, 1e-4) * NoL;
    float glintHalo = WaterDggx(NoH, min(0.48, alpha * 5.0 + 0.045)) * F * NoL * 0.26;
    vec3 sunSpec = uSunColor * ((specSparkle * 0.48 + specRoad * 0.86 + glintHalo) * uSpecScale * sunPower * sunLift * sunVis * shoreFresnel);
    surface += min(sunSpec, vec3(28.0));
  }
  // 夜战（太阳落山后）：极克制的冷月高光，由天顶色驱动，绝不突兀
  if (sunLift < 0.25) {
    vec3 moonDir = normalize(vec3(-0.35, 0.52, -0.78));
    float mNoL = max(dot(N, moonDir), 0.0);
    vec3 mH = normalize(V + moonDir);
    float mD = WaterDggx(max(dot(N, mH), 0.0), max(alpha, 0.006));
    float nightWeight = 1.0 - smoothstep(0.0, 0.25, sunLift);
    surface += (uZenith + uHorizon) * (mD * mNoL * 0.022 * nightWeight * shoreFresnel);
  }

  // --- 8. 多层有机岸线拍岸泡沫、桥墩破散水沫与风浪波峰白沫 -------------------
  float foamMask = 0.0;
  float shoreZone = 1.0 - smoothstep(0.015, max(uFoamWidth, 0.05), trueDepth);
  ${tier.foamLayers >= 2 && useDetailTex ? `
  vec2 fUvA = vRestXz * 0.42 - flow * (uTime * 0.18) + totalSlope * 0.35;
  vec2 fUvB = Rot2(vRestXz * 0.96, 0.72, 0.69) - flow * (uTime * 0.11);
  float lace = texture2D(uWaterDetailMap, fUvA).r;
  float bubbles = texture2D(uWaterDetailMap, fUvB).g;
  // 岸线周期轻拍波（swash）：按真实竖向水深推进，带噪点打散避免平行条纹
  float swashPhase = trueDepth * 22.0 - uTime * 2.0 + lace * 4.2;
  float swashWave = pow(max(0.0, sin(swashPhase)), 3.0) * uFoamSwash * shoreZone;
  // 有机破散水线沫（零常数底板，避免在笔直护城河石墙边画出一条死白直线）
  float contactBreakup = smoothstep(0.24, 0.80, bubbles * 0.58 + lace * 0.52 + (gustField - 0.5) * 0.25);
  float contactBand = (1.0 - smoothstep(0.006, 0.055 + lace * 0.04, trueDepth)) * contactBreakup;
  float shoreFoam = (shoreZone * lace * (0.45 + 0.55 * bubbles) * 0.68 + swashWave * (0.30 + 0.70 * lace) + contactBand * 0.72);
  foamMask = max(foamMask, shoreFoam * uFoamStrength);
  ${tier.foamLayers >= 3 ? `
  // 风浪波脊细碎白沫 + 交互波纹水花环
  float crestMask = smoothstep(0.42, 1.05, vWaveCrest) * lace * uCrestFoam;
  foamMask = max(foamMask, crestMask);
  foamMask = clamp(foamMask + rippleFoam * (0.45 + 0.55 * bubbles), 0.0, 0.92);
  ` : ""}
  ` : `
  // low 档极简岸边浅沫
  foamMask = shoreZone * uFoamStrength * 0.34;
  `}

  if (foamMask > 0.004) {
    // 浑水河沫微带暖灰沙色，护城河/荆河沫偏冷白，严格跟随太阳阴影与昼夜光照
    vec3 foamBase = mix(vec3(0.84, 0.86, 0.87), vec3(0.76, 0.70, 0.58), uTurbidity * 0.78);
    vec3 foamLit = foamBase * (ambientLight * 0.85 + sunIrrad * (0.68 * sunVis + 0.08));
    surface = mix(surface, foamLit, clamp(foamMask, 0.0, 0.82));
    // 泡沫区提高覆盖度，使破散水沫与水花环清晰可见
    finalAlpha = max(finalAlpha, clamp(foamMask * 1.05, 0.0, 1.0) * smoothstep(0.0, 0.018, trueDepth + rippleFoam * 0.1));
  }

  // --- 9. 远景大气雾与水平烟霾同步（消除 200–480 m 远水断层）----------------
  ${tier.aerialFog ? `
  if (uFogDensity > 1e-6) {
    float hDelta = max(0.0, vWorldPos.y - cameraPosition.y);
    float fogIntegral = uFogDensity * camDist * exp(-max(0.0, cameraPosition.y) * uFogHeightFalloff * 0.25)
      * (1.0 / (1.0 + hDelta * uFogHeightFalloff));
    float fogFactor = clamp(1.0 - exp(-fogIntegral), 0.0, 0.96);
    float sunAlign = pow(max(dot(-V, sunDir), 0.0), 6.0);
    vec3 fogCol = mix(uFogColor, uFogSunColor, clamp(sunAlign * uFogSunAmount * sunLift, 0.0, 0.85));
    surface = mix(surface, fogCol, fogFactor);
  }
  ` : ""}

  // NaN / Inf 安全网（防止进 TAA 历史靶永久扩散）
  if (any(isnan(surface)) || any(isinf(surface))) {
    surface = bodyLit;
  }
  gl_FragColor = vec4(max(surface, vec3(0.0)), clamp(finalAlpha, 0.0, 1.0));
}
`;
}

// ---------------------------------------------------------------------------
// 材质构建与缓存
// ---------------------------------------------------------------------------

function PackWaveUniforms(wavesSpec) {
  const dirAmp = [];
  const speedSteep = [];
  for (let i = 0; i < MAX_WAVES; i += 1) {
    const w = wavesSpec?.[i];
    if (!w) {
      dirAmp.push(new THREE.Vector4(1, 0, 1, 0));
      speedSteep.push(new THREE.Vector4(0, 0, 1, 0));
      continue;
    }
    const [dx, dz, wavelength, amp, steep, speedMul = 1] = w;
    const len = Math.hypot(dx, dz) || 1;
    const k = (2 * Math.PI) / Math.max(0.25, wavelength);
    const omega = Math.sqrt(9.81 * k) * speedMul;
    dirAmp.push(new THREE.Vector4(dx / len, dz / len, k, amp));
    speedSteep.push(new THREE.Vector4(omega, steep, 1, 0));
  }
  return { dirAmp, speedSteep };
}

function GetWaterMaterial(presetName = "moat", flowOverride = null, qualityOverride = null) {
  const tierKey = NormalizeTier(qualityOverride || GetEffectiveWaterQuality());
  const tier = WATER_QUALITY_TIERS[tierKey];
  const presetKey = WATER_PRESETS[presetName] ? presetName : "moat";
  const spec = WATER_PRESETS[presetKey];
  const flow = flowOverride || spec.flow;
  const flowKey = `${flow[0].toFixed(3)},${flow[1].toFixed(3)}`;
  const withSsr = !!(tier.ssr && ssrTraceRef);
  const withShadows = !!tier.shadows;
  const withPhysicalSky = !!tier.physicalSky;

  const cacheKey = `${tierKey}|${presetKey}|${flowKey}|${withSsr ? 1 : 0}|${withShadows ? 1 : 0}|${withPhysicalSky ? 1 : 0}`;
  const cached = materialCache.get(cacheKey);
  if (cached) return cached;

  const packedWaves = PackWaveUniforms(spec.waves);
  const sky = skyUniformsRef;
  const uniforms = {
    uTime: sharedUniforms.uTime,
    uWaterRippleMap: { value: GetRippleSlopesTexture() },
    uResolution: sharedUniforms.uResolution,
    uCameraFar: sharedUniforms.uCameraFar,
    uViewMatrix: sharedUniforms.uViewMatrix,
    uWaterSsrEnabled: sharedUniforms.uWaterSsrEnabled,
    uWaterSsrStrength: sharedUniforms.uWaterSsrStrength,

    uSunDir: (sky?.uSunDirection || sky?.uSunDir) ?? { value: new THREE.Vector3(0.4, 0.5, 0.7).normalize() },
    uZenith: sky?.uZenith ?? { value: new THREE.Color(0x526b82) },
    uHorizon: sky?.uHorizon ?? { value: new THREE.Color(0xc8bfa8) },
    uSunColor: sky?.uSunColor ?? { value: new THREE.Color(0xfff0d4) },
    uSunIntensity: sky?.uSunIntensity ?? { value: 28.0 },

    uWaveDirAmp: { value: packedWaves.dirAmp },
    uWaveSpeedSteep: { value: packedWaves.speedSteep },

    uShallowColor: { value: new THREE.Color(spec.shallowColor) },
    uDeepColor: { value: new THREE.Color(spec.deepColor) },
    uScatterColor: { value: new THREE.Color(spec.scatterColor) },
    uExtinctionRgb: { value: new THREE.Vector3(...spec.extinctionRgb) },
    uClarityDepth: { value: spec.clarityDepth },
    uTurbidity: { value: spec.turbidity },
    uRoughness: { value: spec.roughness },
    uSpecScale: { value: spec.specScale },
    uRefractionStrength: { value: spec.refractionStrength },
    uDispersionStrength: { value: spec.dispersionStrength },
    uCausticsStrength: { value: spec.causticsStrength },
    uCausticsScale: { value: spec.causticsScale },
    uSubsurfaceStrength: { value: spec.subsurfaceStrength },
    uFoamWidth: { value: spec.foamWidth },
    uFoamStrength: { value: spec.foamStrength },
    uFoamSwash: { value: spec.foamSwash },
    uCrestFoam: { value: spec.crestFoam },
    uWetBankDepth: { value: spec.wetBankDepth },
    uWetBankDarken: { value: spec.wetBankDarken },
    uEdgeFadeDepth: { value: spec.edgeFadeDepth },
    uFlow: { value: new THREE.Vector2(flow[0], flow[1]) },
    uRippleScale: { value: spec.rippleScale },
    uRippleSpeed: { value: spec.rippleSpeed },
    uRippleStrength: { value: spec.rippleStrength },
    uMicroScale: { value: spec.microScale },
    uMicroStrength: { value: spec.microStrength },
    uWindGustStrength: { value: spec.windGustStrength },
    uSsrStrength: { value: spec.ssrStrength },
    uSkyReflectScale: { value: spec.skyReflectScale },

    uFogColor: sharedUniforms.uFogColor,
    uFogSunColor: sharedUniforms.uFogSunColor,
    uFogDensity: sharedUniforms.uFogDensity,
    uFogHeightFalloff: sharedUniforms.uFogHeightFalloff,
    uFogSunAmount: sharedUniforms.uFogSunAmount,
  };

  if (tier.caustics || tier.foamLayers >= 2 || tier.windGusts) {
    uniforms.uWaterDetailMap = { value: GetOpticalDetailTexture() };
  }
  if (tier.refraction) {
    uniforms.uWaterOpaqueColor = sharedUniforms.uWaterOpaqueColor;
    uniforms.uWaterHasOpaque = sharedUniforms.uWaterHasOpaque;
  }
  if (tier.maxRipples > 0) {
    uniforms.uRipplePos = sharedUniforms.uRipplePos;
    uniforms.uRippleParam = sharedUniforms.uRippleParam;
    uniforms.uRippleCount = sharedUniforms.uRippleCount;
  }
  if (withSsr) {
    BindSsrTraceUniforms(uniforms, ssrTraceRef, tier.ssrHizSlots || 4);
  } else {
    uniforms.uSceneDepth = sharedUniforms.uSceneDepth;
  }
  if (withPhysicalSky) {
    uniforms.uAtmoSkyView = waterAtmoUniforms.uAtmoSkyView;
    uniforms.uAtmoSkyViewSize = waterAtmoUniforms.uAtmoSkyViewSize;
    uniforms.uAtmoEnabled = waterAtmoUniforms.uAtmoEnabled;
    uniforms.uAtmoViewHeight = waterAtmoUniforms.uAtmoViewHeight;
    uniforms.uAtmoSkyTint = waterAtmoUniforms.uAtmoSkyTint;
    uniforms.uAtmoSkyFloor = waterAtmoUniforms.uAtmoSkyFloor;
  }
  if (withShadows) {
    for (const key of Object.keys(waterShadowUniforms)) {
      uniforms[key] = waterShadowUniforms[key];
    }
  }

  const material = new THREE.ShaderMaterial({
    name: `Water_${presetKey}_${tierKey}`,
    vertexShader: MakeWaterVertexShader(tier.gerstnerCount),
    fragmentShader: MakeWaterFragmentShader(tier, { withSsr, withShadows, withPhysicalSky }),
    uniforms,
    transparent: true,
    depthWrite: false,
    side: THREE.FrontSide,
    extensions: { derivatives: true },
  });
  material.userData.waterTier = tierKey;
  material.userData.waterPreset = presetKey;
  MarkNoPrepass(material);
  material.addEventListener?.("dispose", () => {
    if (materialCache.get(cacheKey) === material) materialCache.delete(cacheKey);
  });
  materialCache.set(cacheKey, material);
  return material;
}

// ---------------------------------------------------------------------------
// 几何辅助与网格创建
// ---------------------------------------------------------------------------

/** 确保几何体具备 aWaterEdge 顶点属性（缺省为 1.0，不压制 Gerstner 波）。 */
function EnsureWaterEdgeAttribute(geometry) {
  if (!geometry?.attributes?.position) return;
  if (!geometry.getAttribute("aWaterEdge")) {
    const count = geometry.attributes.position.count;
    const edge = new Float32Array(count).fill(1.0);
    geometry.setAttribute("aWaterEdge", new THREE.BufferAttribute(edge, 1));
  }
}

/**
 * 把一组（可能旋转、弯曲串接的）水块拼接成连续、无缝、带 aWaterEdge 岸边衰减属性的平滑水面几何，
 * 供白盒编辑器切入正式试玩（formal variant）及正式关卡渲染连续河道与水塘。
 */
export function BuildWaterBlockGeometry(blocks, groundAt, { stepM = 2.0, across = 8 } = {}) {
  return BuildContinuousWaterGeometry(blocks, groundAt, { stepM, across, bankTuckM: 0.55 });
}

/**
 * 挂接一只 3A 物理水面网格到场景。
 * 网格自动登记到 trackedSurfaces：运行期切画质档或编辑/试玩模式切换时自动热更新材质。
 */
export function CreateWaterSurface({ geometry, scene, preset = "moat", flow = null, name = "Water" }) {
  EnsureWaterEdgeAttribute(geometry);
  const presetKey = WATER_PRESETS[preset] ? preset : "moat";
  const material = GetWaterMaterial(presetKey, flow);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  // renderOrder = 1：排在不透明件 + 浮桥 HullMask (900) 之后，贴花 (3)、扬尘 (4)、烟火 (6..23) 之前。
  mesh.renderOrder = 1;
  mesh.userData.skipNormalDepth = true;
  mesh.userData.waterSurface = true;
  mesh.userData.waterPreset = presetKey;

  const record = { mesh, preset: presetKey, flow: flow ? [flow[0], flow[1]] : null, disposed: false };
  trackedSurfaces.add(record);

  // 首个可见水面渲染前执行一次当前帧主 HDR 靶拷贝（供单层水体折射与色散读取）
  mesh.onBeforeRender = (renderer, _scene, camera) => {
    const tier = WATER_QUALITY_TIERS[GetEffectiveWaterQuality()];
    if (tier?.refraction) {
      CaptureWaterOpaqueColor(renderer, camera, tier.refractionScale);
    } else {
      sharedUniforms.uWaterHasOpaque.value = 0;
    }
  };

  // 跟随几何销毁自动摘除登记，避免换关后残留空引用
  geometry.addEventListener?.("dispose", () => {
    record.disposed = true;
    trackedSurfaces.delete(record);
  });

  if (scene) scene.add(mesh);
  return mesh;
}

/**
 * 每帧推进波纹相位、同步深度靶/分辨率/相机矩阵与交互波纹池。
 * Script_Main 的 RenderScene 每帧调用一次。
 */
export function UpdateWaterSurfaces(dt, depthTexture, width, height, camera = null) {
  sharedUniforms.uTime.value += Math.max(0, Math.min(0.1, dt || 0));
  if (depthTexture) sharedUniforms.uSceneDepth.value = depthTexture;
  if (width > 0 && height > 0) sharedUniforms.uResolution.value.set(width, height);
  if (camera) {
    lastMainCamera = camera;
    sharedUniforms.uCameraFar.value = camera.far || 1600;
    camera.updateMatrixWorld?.();
    sharedUniforms.uViewMatrix.value.copy(camera.matrixWorldInverse);
  }
  if (rippleEntries.length > 0 || sharedUniforms.uRippleCount.value > 0) {
    SyncRippleUniforms();
  }
}
