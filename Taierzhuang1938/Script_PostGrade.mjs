// 《台儿庄：血战滕县》色彩分级：把 lift/gain + 分离调色 + 感知域对比
// **原样烘成一张 3D LUT**（64³ → 4096×64 条带），合成 pass 改查表。
//
// ## 为什么要烘成 LUT 而不是继续在着色器里算
// 三件事：
//   1. 分级从此是**数据**：换一套调色 = 换一张表，不用重编译着色器，
//      也不用担心某一段算式被别的子系统改坏；
//   2. 外部 LUT（.cube）能直接接进来 —— 那是美术流程的通用交换格式；
//   3. 逐像素成本从「两次 sRGB 幂运算 + 两次 pow 权重」降成一次三线性查表。
//
// ## 索引域是 sRGB，不是线性（这条最要命）
// 格子铺在线性域上的话，第一格覆盖 0—(1/63) 线性亮度 = sRGB 0—0.14：
// **画面里几乎所有暗部都挤在第一格里**，三线性插值当场糊掉。而这一关最敏感的
// 就是暗部（历史事故「画面为什么这么黑」）。所以索引与存值都走 sRGB：
//   查表：coord = LinearToSrgb(color)
//   烘表：LUT[coord] = LinearToSrgb(GradeMath(SrgbToLinear(coord)))
//   取值：color = SrgbToLinear(texture(...))
// 8 位量化因此正好落在最终输出（也是 8 位 sRGB）的同一个量化格上，
// 误差 ≤ 1/255 —— 这是 `Script_ExposureTest` 的 LUT 一致性断言能成立的原因。
//
// ## 饱和度**不烘**进去
// `saturation` 每帧都在动（压制去饱和 `preset.saturation * (1 - suppression*0.35)`）。
// 好在饱和是可乘的：mix(L, mix(L, c, s1), s2) = mix(L, c, s1·s2)（因为
// Luma(mix(L,c,s)) = L）。所以 LUT 只烘到「饱和之前」，着色器照旧做那一步，
// 顺便 `gradedLuma`（受伤去色要用）就是 LUT 输出的 Luma，一个比特不差。
//
// ## LUT 纹理的四条铁律（漏一条就是暗部彩色斑块，docs 的坑里有）
//   NoColorSpace / ClampToEdge / 无 mipmap / flipY=false，采样时每格内缩半纹素。
// 用 DataTexture 而不是 CanvasTexture：2D canvas 的后备存储是**预乘 alpha** 的，
// 一旦哪天想往 alpha 里塞东西，颜色就被就地改写了。DataTexture 没有这层。

import * as THREE from "three";
import { MakeFullscreenMaterial } from "./Script_PostCommon.mjs";
import { LUT } from "./Data_Tuning_Camera.mjs";

// ===========================================================================
// GLSL 侧
// ===========================================================================

/**
 * 三线性查表。**要求调用方已经定义 `LinearToSrgb` / `SrgbToLinear`**
 * （合成 pass 里本来就有，别再抄一份 —— 两份迟早分叉）。
 */
export const LUT_GLSL = /* glsl */`
uniform sampler2D uLut;
uniform float uLutAmount;
const float LUT_SIZE = ${LUT.size.toFixed(1)};

vec3 SampleLut(vec3 linearColor) {
  // 索引域 = sRGB（见文件抬头）
  vec3 c = clamp(LinearToSrgb(clamp(linearColor, 0.0, 1.0)), 0.0, 1.0);
  float bz = c.b * (LUT_SIZE - 1.0);
  float b0 = floor(bz);
  float b1 = min(b0 + 1.0, LUT_SIZE - 1.0);
  float f = bz - b0;
  // 每格内缩半纹素，防止相邻切片互相渗色
  vec2 uvBase = vec2(c.r * (LUT_SIZE - 1.0) + 0.5, c.g * (LUT_SIZE - 1.0) + 0.5)
    / vec2(LUT_SIZE * LUT_SIZE, LUT_SIZE);
  vec3 slice0 = texture2D(uLut, uvBase + vec2(b0 / LUT_SIZE, 0.0)).rgb;
  vec3 slice1 = texture2D(uLut, uvBase + vec2(b1 / LUT_SIZE, 0.0)).rgb;
  return SrgbToLinear(mix(slice0, slice1, f));
}
`;

// ===========================================================================
// JS 侧：与着色器同一套数学（烘表的唯一来源）
// ===========================================================================

/** 与 GLSL_COMMON.Luma 同系数。 */
export function LumaJs(r, g, b) { return 0.2126 * r + 0.7152 * g + 0.0722 * b; }

/** 与合成 pass 的 LinearToSrgb 逐分支一致（step(0.0031308, x) = x >= edge）。 */
export function LinearToSrgbJs(x) {
  return x >= 0.0031308 ? 1.055 * Math.pow(Math.max(x, 1e-5), 1 / 2.4) - 0.055 : x * 12.92;
}

/** 与合成 pass 的 SrgbToLinear 逐分支一致。 */
export function SrgbToLinearJs(x) {
  return x >= 0.04045 ? Math.pow((Math.max(x, 0) + 0.055) / 1.055, 2.4) : x / 12.92;
}

function Clamp01(x) { return x < 0 ? 0 : (x > 1 ? 1 : x); }

/**
 * `ColorGrade` 的**饱和之前**那一段，JS 版。
 * 与 `Script_PostComposite.FRAG_COMPOSITE` 的 `GradeMath()` 逐行对应；
 * 改一边必须改另一边，`Script_ExposureTest` 的一致性断言就压在这上面。
 *
 * @param {number[]} rgb 线性
 * @param {object} grade { lift, gain, shadowTint, highlightTint, splitShadow, splitHighlight, contrast }
 * @returns {number[]} 线性
 */
export function GradeMathJs(rgb, grade) {
  const { lift, gain, shadowTint, highlightTint, splitShadow, splitHighlight, contrast } = grade;
  let r = Clamp01(rgb[0] * gain[0] + lift[0]);
  let g = Clamp01(rgb[1] * gain[1] + lift[1]);
  let b = Clamp01(rgb[2] * gain[2] + lift[2]);
  // 分离调色：权重曲线故意不重叠（暗部权重 0.55 明度处归零、亮部 0.30 才起步）
  const luma = LumaJs(r, g, b);
  const sw = Math.pow(Clamp01(1 - luma * 1.82), 1.35) * splitShadow;
  const hw = Math.pow(Clamp01(luma * 1.42 - 0.42), 1.15) * splitHighlight;
  r = Clamp01(r * (1 + (shadowTint[0] - 1) * sw) * (1 + (highlightTint[0] - 1) * hw));
  g = Clamp01(g * (1 + (shadowTint[1] - 1) * sw) * (1 + (highlightTint[1] - 1) * hw));
  b = Clamp01(b * (1 + (shadowTint[2] - 1) * sw) * (1 + (highlightTint[2] - 1) * hw));
  // 对比度是**感知域**操作：线性域围绕 0.5 拉伸会把暗部直接裁成纯黑
  const cr = Clamp01((LinearToSrgbJs(r) - 0.5) * contrast + 0.5);
  const cg = Clamp01((LinearToSrgbJs(g) - 0.5) * contrast + 0.5);
  const cb = Clamp01((LinearToSrgbJs(b) - 0.5) * contrast + 0.5);
  return [SrgbToLinearJs(cr), SrgbToLinearJs(cg), SrgbToLinearJs(cb)];
}

/** 把合成 pass 的 uniform 拆成 `GradeMathJs` 认的形状。 */
export function GradeFromUniforms(U) {
  return {
    lift: U.uLift.value.toArray(),
    gain: U.uGain.value.toArray(),
    shadowTint: U.uShadowTint.value.toArray(),
    highlightTint: U.uHighlightTint.value.toArray(),
    splitShadow: U.uSplitShadow.value,
    splitHighlight: U.uSplitHighlight.value,
    contrast: U.uContrast.value,
  };
}

/** 分级参数的缓存键（换时段才会变，所以字符串键足够，不必做增量比较）。 */
export function GradeKey(grade) {
  const N = (x) => x.toFixed(5);
  return [
    grade.lift.map(N).join(","), grade.gain.map(N).join(","),
    grade.shadowTint.map(N).join(","), grade.highlightTint.map(N).join(","),
    N(grade.splitShadow), N(grade.splitHighlight), N(grade.contrast),
  ].join("|");
}

/**
 * 烘一张 3D LUT 条带（`size*size × size` 的 RGBA8 DataTexture）。
 * 第 b 层放在 x ∈ [b·size, b·size + size)，行 = g，列内偏移 = r。
 *
 * 64³ 约 26 万格、每格十来次 pow —— 实测约 60 ms，只在**换时段预设**时跑一次。
 */
export function BakeGradeLut(grade, size = LUT.size) {
  const width = size * size;
  const height = size;
  const data = new Uint8Array(width * height * 4);
  const inv = 1 / (size - 1);
  for (let bi = 0; bi < size; bi += 1) {
    const bIn = SrgbToLinearJs(bi * inv);
    for (let gi = 0; gi < size; gi += 1) {
      const gIn = SrgbToLinearJs(gi * inv);
      for (let ri = 0; ri < size; ri += 1) {
        const rIn = SrgbToLinearJs(ri * inv);
        const out = GradeMathJs([rIn, gIn, bIn], grade);
        const index = ((gi * width) + (bi * size + ri)) * 4;
        data[index] = Math.round(Clamp01(LinearToSrgbJs(out[0])) * 255);
        data[index + 1] = Math.round(Clamp01(LinearToSrgbJs(out[1])) * 255);
        data[index + 2] = Math.round(Clamp01(LinearToSrgbJs(out[2])) * 255);
        data[index + 3] = 255;
      }
    }
  }
  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.UnsignedByteType);
  // 四条铁律，漏一条 = 暗部彩色斑块
  texture.colorSpace = THREE.NoColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.flipY = false;
  texture.unpackAlignment = 1;
  texture.needsUpdate = true;
  return texture;
}

/** 恒等 LUT（调试视图「LUT 恒等校验」与外部表缺席时的兜底）。 */
export function BakeIdentityLut(size = LUT.size) {
  return BakeGradeLut({
    lift: [0, 0, 0], gain: [1, 1, 1],
    shadowTint: [1, 1, 1], highlightTint: [1, 1, 1],
    splitShadow: 0, splitHighlight: 0, contrast: 1,
  }, size);
}

/**
 * 一小撮 LUT 的缓存。换时段来回切（过场自带天空、编辑器切预设）时不重复烘。
 */
export class GradeLutCache {
  constructor(size = LUT.size, capacity = LUT.maxCache) {
    this.size = size;
    this.capacity = Math.max(1, capacity);
    this.entries = new Map();      // key -> texture
    this.bakes = 0;                // 烘过几次（性能断言读它）
    this.external = null;          // 外部 .cube 载入的表；非空时**压过**烘出来的
  }

  /**
   * 外部 LUT 接口。传一张已经按本文件口径准备好的纹理
   * （`size*size × size` 条带、sRGB 索引域、NoColorSpace/Clamp/无 mipmap/flipY=false），
   * 或传 null 恢复内部烘焙。
   *
   * `.cube` / `.3dl` 的文本解析**故意不在这里实现**：那是资产管线的事，
   * 而且外部表通常是**线性或 log 索引域**的，接进来前必须先重采样到本文件的
   * sRGB 索引域，否则暗部会整片错位。留这个口子是为了让那一步有地方接。
   */
  SetExternal(texture) {
    this.external = texture || null;
  }

  Get(grade) {
    if (this.external) return this.external;
    const key = GradeKey(grade);
    const hit = this.entries.get(key);
    if (hit) return hit;
    const texture = BakeGradeLut(grade, this.size);
    this.bakes += 1;
    this.entries.set(key, texture);
    while (this.entries.size > this.capacity) {
      const oldest = this.entries.keys().next().value;
      this.entries.get(oldest)?.dispose();
      this.entries.delete(oldest);
    }
    return texture;
  }

  Dispose() {
    for (const texture of this.entries.values()) texture.dispose();
    this.entries.clear();
  }
}

// ===========================================================================
// 调试视图：LUT 采样校验
//
// 查表这条路真正容易坏的不是分级数学，是**采样**：flipY 反了、少内缩半纹素、
// 切片索引错一格、colorSpace 设成 sRGB —— 四种坏法在正片画面上都表现为
// 「暗部有点脏」，肉眼分辨不出是哪一种。
//
// 这张图把它们逼出来：绑一张**恒等 LUT**，让一条 sRGB 灰阶/彩阶过一遍查表，
// 上半屏画输入、下半屏画 |查表结果 − 输入| × 32。采样正确 = 下半屏全黑。
// 中间那一条是正在生效的那张 LUT 条带本尊（看得见分级往哪边偏）。
// ===========================================================================
const FRAG_LUT_CHECK = /* glsl */`
uniform sampler2D uLut;          // 正在生效的那张（只作展示）
uniform sampler2D uIdentityLut;  // 恒等表（用来量采样误差）
uniform float uAmplify;
varying vec2 vUv;

vec3 LinearToSrgb(vec3 color) {
  return mix(color * 12.92,
             1.055 * pow(max(color, vec3(1e-5)), vec3(1.0 / 2.4)) - 0.055,
             step(0.0031308, color));
}
vec3 SrgbToLinear(vec3 color) {
  return mix(color / 12.92,
             pow((max(color, vec3(0.0)) + 0.055) / 1.055, vec3(2.4)),
             step(0.04045, color));
}
${LUT_GLSL}

/** 与 Script_PostComposite 的 SampleLut 同一份公式，只换成恒等表。 */
vec3 SampleIdentity(vec3 linearColor) {
  vec3 c = clamp(LinearToSrgb(clamp(linearColor, 0.0, 1.0)), 0.0, 1.0);
  float bz = c.b * (LUT_SIZE - 1.0);
  float b0 = floor(bz);
  float b1 = min(b0 + 1.0, LUT_SIZE - 1.0);
  float f = bz - b0;
  vec2 uvBase = vec2(c.r * (LUT_SIZE - 1.0) + 0.5, c.g * (LUT_SIZE - 1.0) + 0.5)
    / vec2(LUT_SIZE * LUT_SIZE, LUT_SIZE);
  vec3 slice0 = texture2D(uIdentityLut, uvBase + vec2(b0 / LUT_SIZE, 0.0)).rgb;
  vec3 slice1 = texture2D(uIdentityLut, uvBase + vec2(b1 / LUT_SIZE, 0.0)).rgb;
  return SrgbToLinear(mix(slice0, slice1, f));
}

/** 测试图案：上半 8 条彩阶 + 下半连续灰阶，全部在 sRGB 域均匀铺开。 */
vec3 Pattern(vec2 uv) {
  float t = clamp(uv.x, 0.0, 1.0);
  float band = floor(clamp(uv.y, 0.0, 0.999) * 8.0);
  vec3 srgb;
  if (band < 1.0) srgb = vec3(t);
  else if (band < 2.0) srgb = vec3(t, 0.0, 0.0);
  else if (band < 3.0) srgb = vec3(0.0, t, 0.0);
  else if (band < 4.0) srgb = vec3(0.0, 0.0, t);
  else if (band < 5.0) srgb = vec3(t, t, 0.0);
  else if (band < 6.0) srgb = vec3(0.0, t, t);
  else if (band < 7.0) srgb = vec3(t, 0.0, t);
  else srgb = vec3(t, 1.0 - t, 0.5);
  return SrgbToLinear(srgb);
}

void main() {
  vec3 color;
  if (vUv.y > 0.66) {
    // 上：测试图案本身
    color = Pattern(vec2(vUv.x, (vUv.y - 0.66) / 0.34));
  } else if (vUv.y > 0.58) {
    // 中：正在生效的 LUT 条带（1024×32 直接铺开）
    color = SrgbToLinear(texture2D(uLut, vec2(vUv.x, (vUv.y - 0.58) / 0.08)).rgb);
  } else {
    // 下：恒等表的采样误差 × uAmplify。采样正确 = 全黑。
    vec2 uv = vec2(vUv.x, vUv.y / 0.58);
    vec3 reference = Pattern(uv);
    vec3 through = SampleIdentity(reference);
    color = abs(LinearToSrgb(through) - LinearToSrgb(reference)) * uAmplify;
  }
  gl_FragColor = vec4(LinearToSrgb(clamp(color, 0.0, 1.0)), 1.0);
}
`;

/**
 * LUT 采样校验视图。挂在合成 pass 上（它持有那张正在生效的表），
 * 由 `Script_Post` 在建完 debugPass 之后登记。
 */
export class LutCheckView {
  constructor() {
    this.identity = null;
    this.uniforms = {
      uLut: { value: null },
      uIdentityLut: { value: null },
      uAmplify: { value: 32 },
    };
    this.material = MakeFullscreenMaterial(FRAG_LUT_CHECK, this.uniforms);
  }

  /** 恒等表惰性烘：不开这张视图就一个字节都不占。 */
  get Identity() {
    if (!this.identity) this.identity = BakeIdentityLut();
    return this.identity;
  }

  RegisterDebugViews(debugPass, compositePass) {
    debugPass.RegisterView("lutCheck", () => ({
      material: this.material,
      Prepare: () => {
        this.uniforms.uIdentityLut.value = this.Identity;
        this.uniforms.uLut.value = compositePass.uniforms.uLut.value || this.Identity;
      },
    }));
  }

  Dispose() {
    this.material.dispose();
    this.identity?.dispose();
    this.identity = null;
  }
}

export default { LUT_GLSL, BakeGradeLut, BakeIdentityLut, GradeLutCache, GradeMathJs, LutCheckView };
