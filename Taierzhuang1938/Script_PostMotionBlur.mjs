// 《台儿庄：血战滕县》逐物体运动模糊：McGuire 2012 的重建滤波 + Jimenez 2014 的采样。
//
// 参考实现：
//   · McGuire, Hennessy, Bukowski, Osman —— "A Reconstruction Filter for Plausible
//     Motion Blur"（I3D 2012）。三件事：**tile max**（把速度场降到 tile 网格取最大）
//     → **neighbor max**（3×3 取最大，让一个 tile 知道邻居会不会糊过来）→
//     **逐像素沿主导速度重建**，用深度分类（前景/背景）与 cone/cylinder 权重决定
//     每个抽样能不能贡献。
//   · Jimenez —— "Next Generation Post Processing in Call of Duty: Advanced Warfare"
//     （SIGGRAPH 2014 Course）。两点改进照抄：抽样在**邻域最大速度**与**本像素速度**
//     两个方向之间交替（只沿一个方向会把静止背景也拉长）、起点用交错梯度噪声抖动
//     （固定起点会留下条带）。
//
// ## 为什么要独立成 pass（旧版在 Composite 里六抽样）
//   · 旧版的速度是**相机深度反投影**：只有相机在动才有模糊，走动的兵、开过去的
//     大车一律纹丝不动 —— 那不是运动模糊，是相机抖动。
//   · 旧版没有 tile max：每个像素只能按自己的速度采样，快速移动的物体**糊不出
//     自己的轮廓**（模糊只能往里收，不能往外扩），边缘是硬的。
//   · 旧版钳在 5% 屏幕且只有六抽样，抽样间隔远大于一个像素，转身时是明显的重影梯子。
//
// ## 快门
// 速度靶记的是**整帧**位移（本帧 uv − 上一帧 uv）。电影的 180° 快门在一帧里只开一半，
// 所以模糊长度 = 速度 × `MOTION_BLUR.shutterFraction`（0.5）。抽样区间是
// ±(长度/2)，所以内部用的 `uBlurScale = shutterFraction * 0.5`。
//
// ## 前景（第一人称手/枪）绝不糊
// 两道闸：① 预通道给它们写速度 0，McGuire 的 cone/cylinder 权重让邻居的模糊
// 够不到它们；② 中心像素命中前景标签时**直接返回原色**，整个重建循环都不跑。
// 第二道是硬闸 —— FPS 手感的红线不靠权重公式碰运气。

import * as THREE from "three";
import { MakeFullscreenMaterial, MakeRenderTarget, GLSL_COMMON } from "./Script_PostCommon.mjs";
import { MOTION_BLUR } from "./Data_Tuning_TemporalDof.mjs";

// --- tile max（可分离：先 X 后 Y）------------------------------------------
// uAxis = (1,0) 走 X、(0,1) 走 Y。一份材质两趟用，省一次编译。
function MakeTileMaxFrag(tilePx) {
  return /* glsl */`
uniform sampler2D uSource;
uniform vec2 uSourceTexel;
uniform vec2 uAxis;
uniform float uFirstPass;   // 1 = 源是速度靶（rg），0 = 源是上一趟 tile（rg）
varying vec2 vUv;
void main() {
  vec2 best = vec2(0.0);
  float bestLen = -1.0;
  // 沿 uAxis 扫一个 tile 的宽度。起点对齐到 tile 的第一个源纹素中心。
  vec2 base = vUv - uAxis * (float(${tilePx}) * 0.5 - 0.5) * uSourceTexel;
  for (int i = 0; i < ${tilePx}; i++) {
    vec2 uv = base + uAxis * (float(i) * uSourceTexel);
    vec2 v = texture2D(uSource, uv).xy;
    float len = dot(v, v);
    if (len > bestLen) { bestLen = len; best = v; }
  }
  gl_FragColor = vec4(best, 0.0, 1.0);
}
`;
}

// --- neighbor max（3×3 取最大）---------------------------------------------
const FRAG_NEIGHBOR_MAX = /* glsl */`
uniform sampler2D uSource;
uniform vec2 uSourceTexel;
varying vec2 vUv;
void main() {
  vec2 best = vec2(0.0);
  float bestLen = -1.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 v = texture2D(uSource, vUv + vec2(float(x), float(y)) * uSourceTexel).xy;
      float len = dot(v, v);
      if (len > bestLen) { bestLen = len; best = v; }
    }
  }
  gl_FragColor = vec4(best, 0.0, 1.0);
}
`;

// --- 重建 -------------------------------------------------------------------
function MakeReconstructFrag(taps) {
  return /* glsl */`
uniform sampler2D uColor;         // 场景颜色（TAA 之后，输出分辨率）
uniform sampler2D uVelocity;      // 预通道 RT1（内部分辨率，单位 uv）
uniform sampler2D uNormalDepth;   // 预通道 RT0（内部分辨率，w = 线性视深）
uniform sampler2D uNeighborMax;   // tile 邻域最大速度（单位 uv）
uniform vec2 uPixelResolution;    // 换算像素长度用的网格（内部分辨率）
uniform vec2 uMaxBlurUv;          // 单帧最大半位移（uv），= tile 的一半
uniform float uBlurScale;         // shutterFraction * 0.5
uniform float uSoftZ;             // McGuire 的软深度过渡宽度（米）
uniform float uMinBlurPx;
uniform float uFrame;
uniform float uForegroundDepth;
uniform float uForegroundEps;
varying vec2 vUv;
${GLSL_COMMON}

float Cone(float dist, float len) { return clamp(1.0 - dist / max(len, 1e-4), 0.0, 1.0); }
float Cylinder(float dist, float len) {
  return 1.0 - smoothstep(0.95 * len, 1.05 * len, dist);
}
// 1.0 = za 在 zb 前面（更近）。SOFT_Z_EXTENT 让分类有个软过渡，不然会有硬边。
float SoftDepthCompare(float za, float zb) {
  return clamp(1.0 - (za - zb) / uSoftZ, 0.0, 1.0);
}
float ViewDepth(vec2 uv) {
  float d = texture2D(uNormalDepth, uv).w;
  return d <= 0.0 ? 1.0e4 : d;    // 天空当无穷远
}
vec2 BlurVector(vec2 uv) {
  return clamp(texture2D(uVelocity, uv).xy * uBlurScale, -uMaxBlurUv, uMaxBlurUv);
}

void main() {
  vec4 nd = texture2D(uNormalDepth, vUv);
  vec3 centerColor = texture2D(uColor, vUv).rgb;
  // 硬闸：第一人称手与枪一个像素都不许糊。
  if (uForegroundDepth > 0.0 && abs(nd.w - uForegroundDepth) < uForegroundEps) {
    gl_FragColor = vec4(centerColor, 1.0);
    return;
  }
  vec2 dirN = clamp(texture2D(uNeighborMax, vUv).xy * uBlurScale, -uMaxBlurUv, uMaxBlurUv);
  float lenN = length(dirN * uPixelResolution);
  if (lenN < uMinBlurPx) {
    gl_FragColor = vec4(centerColor, 1.0);
    return;
  }
  vec2 dirC = BlurVector(vUv);
  float lenC = length(dirC * uPixelResolution);
  // 本像素几乎不动时借邻域方向（否则交替采样的一半退化成原地踏步）
  if (lenC < 0.5) { dirC = dirN; }
  lenC = max(lenC, 0.5);
  float zC = nd.w <= 0.0 ? 1.0e4 : nd.w;

  // 中心权重（McGuire）：本像素越模糊，自己的权重越低。
  float total = float(${taps}) / (40.0 * lenC);
  vec3 sum = centerColor * total;
  float jitter = Ign(gl_FragCoord.xy + uFrame * 7.13) - 0.5;
  for (int i = 0; i < ${taps}; i++) {
    // t ∈ (-1, 1)，抖动起点（Jimenez）：固定起点会在长模糊上留下条带
    float t = mix(-1.0, 1.0, (float(i) + jitter + 1.0) / float(${taps} + 1));
    // 两个方向交替（Jimenez）：只沿邻域最大速度会把静止背景一起拉长，
    // 只沿本像素速度又糊不出运动物体的轮廓。
    vec2 dir = (i % 2 == 0) ? dirN : dirC;
    vec2 sampleUv = vUv + dir * t;
    float dist = abs(t) * length(dir * uPixelResolution);
    float zS = ViewDepth(sampleUv);
    float lenS = max(length(BlurVector(sampleUv) * uPixelResolution), 0.5);
    // 前景（zS 更小）模糊到中心 / 中心模糊透出后面的 S / 两者都模糊
    float front = SoftDepthCompare(zS, zC);
    float back = SoftDepthCompare(zC, zS);
    float w = front * Cone(dist, lenS)
            + back * Cone(dist, lenC)
            + Cylinder(dist, lenS) * Cylinder(dist, lenC) * 2.0;
    sum += texture2D(uColor, sampleUv).rgb * w;
    total += w;
  }
  gl_FragColor = vec4(sum / max(total, 1e-4), 1.0);
}
`;
}

// --- 半分辨率档的回填 -------------------------------------------------------
// 半分辨率重建只对**真的在糊**的像素有意义；静止区域仍旧取全分辨率原图，
// 否则整帧被降采样一遍，画面平白掉一档细节。
const FRAG_MB_RESOLVE = /* glsl */`
uniform sampler2D uSharp;
uniform sampler2D uBlur;
uniform sampler2D uNeighborMax;
uniform vec2 uPixelResolution;
uniform float uBlurScale;
uniform float uMinBlurPx;
uniform float uBlendPx;
varying vec2 vUv;
void main() {
  float lenN = length(texture2D(uNeighborMax, vUv).xy * uBlurScale * uPixelResolution);
  float amount = smoothstep(uMinBlurPx, uBlendPx, lenN);
  gl_FragColor = vec4(mix(texture2D(uSharp, vUv).rgb, texture2D(uBlur, vUv).rgb, amount), 1.0);
}
`;

export class MotionBlurPass {
  constructor(pipeline) {
    this.name = "motionBlur";
    this.pipeline = pipeline;
    const preset = pipeline.preset;
    this.tilePx = Math.max(4, MOTION_BLUR.tilePx | 0);
    // 抽样数与内部缩放是**构造期**的（进了着色器源码与建靶参数），与画质档同寿命。
    this.taps = Math.max(4, preset.motionBlurTaps || 12);
    this.scale = preset.motionBlurScale > 0 ? preset.motionBlurScale : 1;

    this.uniformsTile = {
      uSource: { value: null }, uSourceTexel: { value: new THREE.Vector2() },
      uAxis: { value: new THREE.Vector2(1, 0) }, uFirstPass: { value: 1 },
    };
    this.matTile = MakeFullscreenMaterial(MakeTileMaxFrag(this.tilePx), this.uniformsTile);

    this.uniformsNeighbor = {
      uSource: { value: null }, uSourceTexel: { value: new THREE.Vector2() },
    };
    this.matNeighbor = MakeFullscreenMaterial(FRAG_NEIGHBOR_MAX, this.uniformsNeighbor);

    this.uniforms = {
      uColor: { value: null }, uVelocity: { value: null }, uNormalDepth: { value: null },
      uNeighborMax: { value: null },
      uPixelResolution: { value: new THREE.Vector2(2, 2) },
      uMaxBlurUv: { value: new THREE.Vector2(0.05, 0.05) },
      uBlurScale: { value: MOTION_BLUR.shutterFraction * 0.5 },
      uSoftZ: { value: MOTION_BLUR.softZExtent },
      uMinBlurPx: { value: MOTION_BLUR.minBlurPx },
      uFrame: { value: 0 },
      uForegroundDepth: { value: 0 }, uForegroundEps: { value: 0.002 },
    };
    this.material = MakeFullscreenMaterial(MakeReconstructFrag(this.taps), this.uniforms);

    this.uniformsResolve = {
      uSharp: { value: null }, uBlur: { value: null }, uNeighborMax: { value: null },
      uPixelResolution: { value: new THREE.Vector2(2, 2) },
      uBlurScale: { value: MOTION_BLUR.shutterFraction * 0.5 },
      uMinBlurPx: { value: MOTION_BLUR.minBlurPx },
      uBlendPx: { value: MOTION_BLUR.halfResBlendPx },
    };
    this.matResolve = MakeFullscreenMaterial(FRAG_MB_RESOLVE, this.uniformsResolve);

    this.tileX = null;
    this.tile = null;
    this.neighbor = null;
    this.target = null;
    this.blurTarget = null;
    /** 本帧真的跑了没有（`Script_PostFxaa` 的调试视图与剖析要看）。 */
    this.active = false;
  }

  /**
   * 靶按**解算分辨率**（TAAU 开着时 = 输出分辨率）建；tile 网格按**内部分辨率**
   * 切 —— 速度靶是内部分辨率的，tile 的语义是「一个 tile 里最快的那个源纹素」。
   */
  Resize(width, height) {
    for (const rt of [this.tileX, this.tile, this.neighbor, this.target, this.blurTarget]) {
      if (rt) rt.dispose();
    }
    this.tileX = this.tile = this.neighbor = this.target = this.blurTarget = null;
    const P = this.pipeline;
    // 档位关掉就**一张靶都不建**（low 的定位是「能跑」，不该为一个永不启用的
    // pass 押着一张全分辨率 RGBA16F）。`Enabled` 会看 this.target 是不是在。
    if (!P.preset.motionBlur) {
      delete P.targets.motionBlur;
      delete P.targets.velocityTile;
      return;
    }
    const K = this.tilePx;
    const tilesX = Math.max(1, Math.ceil(P.width / K));
    const tilesY = Math.max(1, Math.ceil(P.height / K));
    // tile 靶用 RGBA16F 而不是 RG16F：`readRenderTargetPixels` 只保证 RGBA 可读，
    // 回归测试要能直接量它。整条链只有 tilesX×tilesY 个纹素，省这点带宽没意义。
    const tileOptions = {
      type: THREE.HalfFloatType,
      minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
    };
    this.tileX = MakeRenderTarget(tilesX, P.height, tileOptions);
    this.tile = MakeRenderTarget(tilesX, tilesY, tileOptions);
    // neighbor max 要**双线性**：tile 网格比屏幕粗 20 倍，最近邻取样会让
    // 模糊长度在 tile 边界上跳变，转身时能看见方格。
    this.neighbor = MakeRenderTarget(tilesX, tilesY, { type: THREE.HalfFloatType });
    this.target = MakeRenderTarget(width, height, { type: P.hdrType });
    this.blurTarget = this.scale < 1
      ? MakeRenderTarget(Math.max(2, Math.round(width * this.scale)),
        Math.max(2, Math.round(height * this.scale)), { type: P.hdrType })
      : null;
    P.targets.motionBlur = this.target;
    P.targets.velocityTile = this.neighbor;
  }

  /**
   * 跑不跑：档位开着、速度靶在、上一帧矩阵可用、调用方给了非零强度。
   * `options.motionBlur` 是 0–1 的总闸（阵亡镜头会把它关掉，见 Script_Main）。
   */
  Enabled(ctx) {
    this.active = !!(ctx.preset.motionBlur && ctx.velocityTexture && ctx.hasPrev
      && (ctx.options.motionBlur ?? 1) > 0.001 && this.target);
    return this.active;
  }

  Render(ctx) {
    const P = this.pipeline;
    const strength = ctx.options.motionBlur ?? 1;
    const blurScale = MOTION_BLUR.shutterFraction * 0.5 * strength;

    // 1) tile max：先 X 后 Y（可分离，K + K 次取样而不是 K²）
    const UT = this.uniformsTile;
    UT.uSource.value = ctx.velocityTexture;
    UT.uSourceTexel.value.set(1 / P.width, 1 / P.height);
    UT.uAxis.value.set(1, 0);
    UT.uFirstPass.value = 1;
    ctx.blitter.Blit(this.matTile, this.tileX);
    UT.uSource.value = this.tileX.texture;
    UT.uSourceTexel.value.set(1 / this.tileX.width, 1 / this.tileX.height);
    UT.uAxis.value.set(0, 1);
    UT.uFirstPass.value = 0;
    ctx.blitter.Blit(this.matTile, this.tile);

    // 2) neighbor max
    const UN = this.uniformsNeighbor;
    UN.uSource.value = this.tile.texture;
    UN.uSourceTexel.value.set(1 / this.tile.width, 1 / this.tile.height);
    ctx.blitter.Blit(this.matNeighbor, this.neighbor);

    // 3) 重建
    const U = this.uniforms;
    U.uColor.value = ctx.sceneColor.texture;
    U.uVelocity.value = ctx.velocityTexture;
    U.uNormalDepth.value = ctx.normalDepthTexture;
    U.uNeighborMax.value = this.neighbor.texture;
    U.uPixelResolution.value.set(P.width, P.height);
    // 最大半位移 = 半个 tile：McGuire 的前提是「没有像素跑得比一个 tile 还远」，
    // 越界就会在 tile 边界露出硬边。
    U.uMaxBlurUv.value.set(this.tilePx * 0.5 / P.width, this.tilePx * 0.5 / P.height);
    U.uBlurScale.value = blurScale;
    U.uFrame.value = ctx.frame;
    U.uForegroundDepth.value = P.foregroundViewDepth ?? 0;
    if (this.blurTarget) {
      ctx.blitter.Blit(this.material, this.blurTarget);
      // 4) 半分辨率回填：静止区域取回全分辨率原图
      const UR = this.uniformsResolve;
      UR.uSharp.value = ctx.sceneColor.texture;
      UR.uBlur.value = this.blurTarget.texture;
      UR.uNeighborMax.value = this.neighbor.texture;
      UR.uPixelResolution.value.set(P.width, P.height);
      UR.uBlurScale.value = blurScale;
      ctx.blitter.Blit(this.matResolve, this.target);
    } else {
      ctx.blitter.Blit(this.material, this.target);
    }
    ctx.sceneColor = this.target;
  }

  Dispose() {
    for (const rt of [this.tileX, this.tile, this.neighbor, this.target, this.blurTarget]) {
      if (rt) rt.dispose();
    }
    this.tileX = this.tile = this.neighbor = this.target = this.blurTarget = null;
    this.matTile.dispose();
    this.matNeighbor.dispose();
    this.material.dispose();
    this.matResolve.dispose();
  }
}
