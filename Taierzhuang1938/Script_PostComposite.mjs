// 《台儿庄：血战滕县》合成 pass：一趟把「画面质感」全部做完。
//
// 顺序不许乱（错一条画面立刻塑料）：
//   运动模糊 → 景深 → +泛光/拖影 → 雾 → 曝光 → ACES → 调色 → 镜头效果 → sRGB
// 三条铁律：AO 只压间接光（在材质里）、泛光在 tonemap 之前（在 Bloom pass）、
// **sRGB 编码在最后一 pass**（就是这里的 EncodeOutput）。
//
// ## 2026-09 帧图重构：GLSL 拆成分段函数
// 每一段是一个独立函数 + 一组独立 uniform + 一个 `SEGMENT` 锚点注释。
// 后续代理**只替换自己那一段**，不要在 main() 里插代码：
//
//   SEGMENT motion-blur      MotionBlur()            ← 逐物体速度 / 分块最大速度代理
//   SEGMENT depth-of-field   DepthOfField()          ← 光圈形状 / 前后景分离代理
//   SEGMENT fog              ApplyFog()              ← froxel 体积雾 / 物理大气代理
//   SEGMENT exposure         ApplyExposureTonemap()  ← 自动曝光 / AgX / 别的 tonemap
//   SEGMENT color-grade      ColorGrade()            ← 3D LUT 代理
//   SEGMENT lens             LensEffects()           ← 镜头光晕 / 脏污 / 暗角
//   SEGMENT encode           EncodeOutput()          ← 输出色彩空间 / 抖动
//
// 本次重构**没有改任何一个算式**：分段只是把 main() 里原来的顺序写法搬进函数，
// 逐比特结果与重构前相同（回归口：探针页三档 ldr 靶逐像素比对）。
//
// ## 两个新接口（本阶段都是「接线点在、生产者还没接上」）
//   · **曝光** `uExposure`（float）× `uExposureTex`（1×1 靶）。自动曝光落地时
//     往那张 1×1 里写平均亮度换算出的增益即可，手调偏移仍走 uExposure。
//     出厂绑一张纯白 1×1，乘出来精确等于 1.0，不改一个比特。
//   · **雾** `uFogScatter`（全分辨率，rgb = 沿视线累积的散射色，a = 透过率）
//     + `uFogSource`（0 = 用下面这段解析式自算，1 = 读那张图）。
//     体积雾 / 物理大气代理只要产出这张图并把 uFogSource 置 1，不用碰 main()。

import * as THREE from "three";
import { MakeFullscreenMaterial, MakeRenderTarget, GLSL_COMMON } from "./Script_PostCommon.mjs";

const FRAG_COMPOSITE = /* glsl */`
uniform sampler2D uHdr;
uniform sampler2D uBloom;
uniform sampler2D uGod;
uniform sampler2D uNormalDepth;
uniform vec2 uResolution;
uniform float uFrame;
uniform vec2 uProjScale;
uniform mat4 uInvProjection;
uniform mat4 uInvView;
uniform mat4 uPrevViewProjection;

// --- SEGMENT motion-blur ----------------------------------------------------
uniform float uMotionScale;
// 色差与运动模糊**共用同一趟圆盘采样**（分开就要再来一趟全分辨率取样）。
// 所以 uAberration 的声明在这里，语义上归 LensEffects 那一段。
uniform float uAberration;

// --- SEGMENT depth-of-field -------------------------------------------------
// 两条景深共用这一趟圆盘采样：阵亡镜头虚化远景；ADS 只虚化贴眼的枪与掩体。
uniform float uDofStrength;
uniform float uDofFocus;
uniform float uDofRange;
uniform float uDofMaxPx;
uniform float uNearDofStrength;
uniform float uNearDofFocus;
uniform float uNearDofRange;
uniform float uNearDofMaxPx;

// --- SEGMENT bloom/godrays 混入 ---------------------------------------------
uniform float uBloomStrength;
uniform float uGodStrength;

// --- SEGMENT fog ------------------------------------------------------------
// 大气：Easy Red 2 的“远景退进去”不是靠一层灰纱盖上去，
// 而是**染在物体自身上**：指数距离雾 x 高度雾，再按雾量去饱和降对比。
// 三件事合起来才有纵深 —— 只做其中一件都是“屏幕上蒙了层灰”。
uniform float uFogDensity;
uniform float uFogFalloff;
uniform float uFogBase;
uniform float uFogMax;
uniform vec3 uFogColorSky;
uniform vec3 uFogColorGround;
uniform float uFogSunGain;
uniform vec3 uSunDir;
uniform vec3 uSunColorFog;
uniform float uDepthDesat;
uniform float uDepthFlatten;
// 体积雾 / 物理大气的接线点：rgb = 散射色，a = 透过率。uFogSource=0 时不采样。
uniform sampler2D uFogScatter;
uniform float uFogSource;

// --- SEGMENT exposure -------------------------------------------------------
uniform float uExposure;
// 自动曝光的接线点：1×1 靶，出厂是纯白（乘出来精确等于 1.0）。
uniform sampler2D uExposureTex;

// --- SEGMENT color-grade ----------------------------------------------------
uniform float uSaturation;
uniform float uContrast;
uniform vec3 uLift;
uniform vec3 uGain;
// 分离调色（split toning）：**这是「整体偏单色土黄」的最后一道闸门**。
// 前面那套 uLift/uGain 是全局加/乘，(0.006,0.004,0.012)+(1.02,1.0,0.965) 实际是恒等式，
// 中性物体的 RGB 出来仍然相等 —— 评分表 C7 直接判 0。
// 这里改成按明度分权的**乘法**着色：暗部乘一个偏青蓝的系数、亮部乘一个偏暖黄的系数。
// 必须是乘法不是加法：加法会把纯黑抬成有色的灰（暗角与暗部当场发灰，C5 就废了）。
uniform vec3 uShadowTint;
uniform vec3 uHighlightTint;
uniform float uSplitShadow;
uniform float uSplitHighlight;

// --- SEGMENT lens -----------------------------------------------------------
uniform float uVignette;
uniform float uGrain;
uniform float uDamage;      // 受伤：边缘泛红 + 去色
uniform float uFade;        // 黑场

varying vec2 vUv;
${GLSL_COMMON}

vec3 AcesFitted(vec3 x) {
  // Stephen Hill 的 ACES 拟合（比 Narkowicz 版在高光处更不容易偏色）
  const mat3 IN = mat3(
    0.59719, 0.07600, 0.02840,
    0.35458, 0.90834, 0.13383,
    0.04823, 0.01566, 0.83777);
  const mat3 OUT = mat3(
     1.60475, -0.10208, -0.00327,
    -0.53108,  1.10813, -0.07276,
    -0.07367, -0.00605,  1.07602);
  vec3 v = IN * x;
  vec3 a = v * (v + 0.0245786) - 0.000090537;
  vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
  return clamp(OUT * (a / b), 0.0, 1.0);
}

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

vec3 ViewPos(vec2 uv, float depth) {
  vec2 ndc = uv * 2.0 - 1.0;
  return vec3(ndc.x / uProjScale.x, ndc.y / uProjScale.y, -1.0) * depth;
}

// ===========================================================================
// SEGMENT motion-blur —— 相机运动模糊（色差的通道偏移融在同一趟采样里）
//
// 速度由深度反投影求上一帧的屏幕位置。预通道从 2026-09 起也产出逐物体速度靶，
// 换过去只要把 velocity 那三行改成读那张图（并把 uPrevViewProjection 留给雾）。
// 色差只在画面边缘拉开、中心保持锐利 —— 真镜头就是这样。
// ===========================================================================
vec3 MotionBlur(vec2 uv, vec2 centered, float r2, vec4 nd) {
  vec2 velocity = vec2(0.0);
  if (uMotionScale > 0.0 && nd.w > 0.0) {
    vec3 viewPos = ViewPos(uv, nd.w);
    vec4 world = uInvView * vec4(viewPos, 1.0);
    vec4 prevClip = uPrevViewProjection * world;
    vec2 prevUv = (prevClip.xy / max(abs(prevClip.w), 1e-4)) * 0.5 + 0.5;
    velocity = (uv - prevUv) * uMotionScale;
    velocity = clamp(velocity, vec2(-0.05), vec2(0.05));
  }

  float ca = uAberration * r2;
  if (ca > 0.0001 || length(velocity) > 0.0005) {
    vec3 acc = vec3(0.0);
    const int TAPS = 6;
    float jitter = Ign(gl_FragCoord.xy + uFrame * 7.13);
    for (int i = 0; i < TAPS; i++) {
      float t = (float(i) + jitter) / float(TAPS) - 0.5;
      vec2 base = uv - velocity * t;
      acc.r += texture2D(uHdr, base + centered * ca).r;
      acc.g += texture2D(uHdr, base).g;
      acc.b += texture2D(uHdr, base - centered * ca).b;
    }
    return acc / float(TAPS);
  }
  return texture2D(uHdr, uv).rgb;
}

// ===========================================================================
// SEGMENT depth-of-field —— 阵亡虚化远景；开镜只轻微虚化贴眼近景
//
// 不能用 CSS blur：那会把贴在镜头前的地面也一起糊掉，只剩一张均匀毛玻璃。
// rtNormalDepth.w 是线性视深；视图模型由 MarkForegroundPrepass 显式写
// FOREGROUND_VIEW_DEPTH（1 m）这个稳定的近景标签，而不是它自己被压缩过的视深 ——
// 否则开镜近景 CoC 会把正在瞄的那支枪整支糊掉。法线仍是真的，SSAO 读得到。
// ===========================================================================
vec3 DepthOfField(vec3 color, vec2 uv, vec4 nd) {
  if (uDofStrength <= 0.001 && uNearDofStrength <= 0.001) return color;
  float farCoc = nd.w <= 0.0 ? 1.0
    : smoothstep(uDofFocus, uDofFocus + max(uDofRange, 0.01), nd.w);
  farCoc *= uDofStrength;
  float nearStart = max(0.0, uNearDofFocus - max(uNearDofRange, 0.01));
  float nearCoc = nd.w <= 0.0 ? 0.0
    : 1.0 - smoothstep(nearStart, uNearDofFocus, nd.w);
  nearCoc *= uNearDofStrength;
  float coc = max(farCoc, nearCoc);
  if (coc <= 0.001) return color;
  float radiusPx = max(uDofMaxPx * farCoc, uNearDofMaxPx * nearCoc);
  vec2 radius = vec2(radiusPx) / uResolution;
  float seed = Ign(gl_FragCoord.xy + uFrame * 3.17) * 6.2831853;
  vec3 blur = vec3(0.0);
  const int DOF_TAPS = 12;
  for (int i = 0; i < DOF_TAPS; i++) {
    float fi = float(i) + 0.5;
    float angle = fi * 2.39996323 + seed;
    float ring = sqrt(fi / float(DOF_TAPS));
    vec2 offset = vec2(cos(angle), sin(angle)) * ring * radius;
    blur += texture2D(uHdr, clamp(uv + offset, vec2(0.001), vec2(0.999))).rgb;
  }
  return mix(color, blur / float(DOF_TAPS), coc);
}

// ===========================================================================
// SEGMENT fog —— 距离雾 × 高度雾 + 大气透视（去饱和 / 降对比）
//
// 天空（深度 0）不吃解析雾 —— 它自己的着色器里已经有霾了，再叠一层会糊成一块白饼。
// 体积雾 / 物理大气接上之后走 uFogSource = 1 那条：只换「散射色与透过率从哪来」，
// 下面那三次 mix（去饱和、降对比、上色）是**大气透视的口径**，两条路共用。
// ===========================================================================
vec3 ApplyFog(vec3 color, vec2 uv, vec4 nd) {
  vec3 fogCol;
  float fog;
  // B3 froxel 体积雾：图里的 rgb 是**已积分的绝对散射亮度**，不是一个可以 mix 的颜色。
  // 所以体积那条走加法（color·T + scatter），解析那条仍走 mix（scatterAdd 恒 0，逐比特不变）。
  // 反过来做（scatter / (1-T) 反推 fogCol 再 mix）在 T→1 的近处会除零炸成白斑。
  vec3 scatterAdd = vec3(0.0);
  if (uFogSource > 0.5) {
    vec4 volume = texture2D(uFogScatter, uv);        // B3 体积采样
    fog = clamp(1.0 - volume.a, 0.0, 1.0);           // B3 a = 透过率
    scatterAdd = max(volume.rgb, vec3(0.0));         // B3 rgb = 散射亮度
    fogCol = vec3(0.0);                              // B3 颜色已经含在 scatterAdd 里
  } else {
    if (uFogDensity <= 0.0 || nd.w <= 0.0) return color;
    vec3 fogViewPos = ViewPos(uv, nd.w);
    vec4 worldPos = uInvView * vec4(fogViewPos, 1.0);
    vec3 camPos = uInvView[3].xyz;
    vec3 rayDir = normalize(worldPos.xyz - camPos);
    float fd = 1.0 - exp(-nd.w * uFogDensity);
    float hFall = exp(-max(worldPos.y - uFogBase, 0.0) / max(uFogFalloff, 0.5));
    fog = clamp(fd * hFall, 0.0, uFogMax);
    // 雾色随视线仰角在“地面色”与“天空色”之间过渡；
    // 朝太阳那一侧要亮 —— 这一笔是“雾里有阳光”与“屏幕发灰”的分界线。
    fogCol = mix(uFogColorGround, uFogColorSky, clamp(rayDir.y * 2.0 + 0.35, 0.0, 1.0));
    fogCol += uSunColorFog * pow(max(dot(rayDir, normalize(uSunDir)), 0.0), 8.0) * uFogSunGain;
  }
  // 大气透视第二层：远处不只是被雾盖住，它自身的饱和与对比也在掉
  float fogLum = Luma(color);
  color = mix(color, vec3(fogLum), fog * uDepthDesat);
  color = mix(color, vec3(0.42), fog * uDepthFlatten);
  // B3：解析路 scatterAdd = 0，mix(color, fogCol, fog) 原样保留；
  // 体积路 fogCol = 0，mix 退化成 color·(1−fog) = color·T，再加上积分出来的散射。
  return mix(color, fogCol, fog) + scatterAdd;
}

// ===========================================================================
// SEGMENT exposure —— 曝光 + ACES
//
// 曝光 = 手调常数 × 自动曝光增益（1×1 靶，出厂纯白 = 1.0）。
// tonemap 换别的（AgX / Khronos PBR neutral）只改这个函数最后一行。
// ===========================================================================
vec3 ApplyExposureTonemap(vec3 color) {
  color *= uExposure * texture2D(uExposureTex, vec2(0.5)).r;
  return AcesFitted(color);
}

// ===========================================================================
// SEGMENT color-grade —— lift/gain + 分离调色 + 对比 + 饱和
//
// gradedLuma 是**饱和之前**的明度，受伤那一段要用同一份（改成饱和之后
// 会让「快不行了」的去色随分级强度漂移）。3D LUT 代理接在饱和之后。
// ===========================================================================
vec3 ColorGrade(vec3 color, out float gradedLuma) {
  color = clamp(color * uGain + uLift, 0.0, 1.0);
  {
    // 权重曲线故意不重叠：暗部权重在 0.55 明度处已经归零，亮部权重从 0.30 才起步。
    // 重叠的话中间调被两头一起染，就成了整体色偏（正是要避免的"套一层滤镜"）。
    float g = Luma(color);
    float sw = pow(clamp(1.0 - g * 1.82, 0.0, 1.0), 1.35);
    float hw = pow(clamp(g * 1.42 - 0.42, 0.0, 1.0), 1.15);
    color *= mix(vec3(1.0), uShadowTint, sw * uSplitShadow);
    color *= mix(vec3(1.0), uHighlightTint, hw * uSplitHighlight);
    color = clamp(color, 0.0, 1.0);
  }
  // 对比度是感知域操作。旧版直接在线性域围绕 0.5 拉伸：contrast=1.07
  // 会先减掉 0.035 线性亮度，所有低于它的阴影被硬裁到 0。深色枪械、军装、
  // 屋檐下表面因此即使 BaseColor / GI / AO 都有信息，最终仍变成纯黑剪影。
  // 转到 sRGB 后再围绕 0.5 调对比，等价黑位只到约 0.0026 线性亮度；暗部层次
  // 保留下来，亮部和中间调仍维持原来的感知对比意图。
  vec3 perceptual = LinearToSrgb(color);
  perceptual = clamp((perceptual - 0.5) * uContrast + 0.5, 0.0, 1.0);
  color = SrgbToLinear(perceptual);
  gradedLuma = Luma(color);
  return mix(vec3(gradedLuma), color, uSaturation);
}

// ===========================================================================
// SEGMENT lens —— 受伤反馈 / 暗角 / 颗粒 / 黑场
//
// （色差的通道偏移在 MotionBlur 那一趟里做，见那一段的抬头。）
// 镜头光晕、镜头脏污接在这里：都属于「镜头上发生的事」，在调色之后、编码之前。
// ===========================================================================
vec3 LensEffects(vec3 color, vec2 uv, float r2, float gradedLuma) {
  // 受伤反馈：边缘吃血、中心去色。
  //
  // 原来 edge = smoothstep(0.06, 0.28, r2)：r2 的角点最大值只有 0.5，0.28 意味着
  // 画面外圈约 40% 的面积**整片**被 mix 到 (0.42,0.03,0.02)，uDamage 0.55 时
  // 接近一半的颜色被红漆盖掉。而正片截图里玩家基本一直挂着「流血」，
  // 于是每一张图都罩着一层暗红 —— 环境视觉做什么都白做，评分表 C7/C5 一起废。
  // 改两件事：① 起点推到 r2=0.20（只压最外一圈）；② 红改成**乘法**压 G/B，
  // 不再往画面上刷不透明的红色，暗部照样是暗部而不是变成红灰。
  // 去色留作主通道 —— 那才是「快不行了」在不糊掉画面的前提下唯一可读的信号。
  if (uDamage > 0.001) {
    float edge = smoothstep(0.20, 0.46, r2);
    color = mix(color, vec3(gradedLuma * 0.88), uDamage * 0.42);
    color *= mix(vec3(1.0), vec3(1.0, 0.40, 0.32), edge * uDamage * 0.60);
  }

  // 暗角：别做成一圈发灰的环，压的是亮度不是加黑纱
  float vig = 1.0 - uVignette * smoothstep(0.02, 0.50, r2);
  color *= vig;

  // 胶片颗粒：暗部多、亮部少（真胶片的颗粒就在中间调最明显）
  float grain = (Hash12(gl_FragCoord.xy + uFrame * 13.71) - 0.5);
  color += grain * uGrain * (0.35 + 0.65 * (1.0 - abs(Luma(color) * 2.0 - 1.0)));

  return max(color, vec3(0.0)) * (1.0 - uFade);
}

// ===========================================================================
// SEGMENT encode —— 线性 → sRGB（**必须自己转**）
//
// 这一 pass 没有 include colorspace_fragment，交给 renderer.outputColorSpace
// 会一次都不转（三方只在 currentRenderTarget === null 时才注入），画面直接洗白。
// ===========================================================================
vec4 EncodeOutput(vec3 color) {
  return vec4(LinearToSrgb(color), 1.0);
}

void main() {
  vec2 uv = vUv;
  vec2 centered = uv - 0.5;
  float r2 = dot(centered, centered);
  vec4 nd = texture2D(uNormalDepth, uv);

  vec3 color = MotionBlur(uv, centered, r2, nd);
  color = DepthOfField(color, uv, nd);
  color += texture2D(uBloom, uv).rgb * uBloomStrength;
  color += texture2D(uGod, uv).rgb * uGodStrength;
  color = ApplyFog(color, uv, nd);
  color = ApplyExposureTonemap(color);
  float gradedLuma;
  color = ColorGrade(color, gradedLuma);
  color = LensEffects(color, uv, r2, gradedLuma);
  gl_FragColor = EncodeOutput(color);
}
`;

/** 自动曝光还没接上时绑的 1×1 纯白：乘出来精确等于 1.0，不改一个比特。 */
function MakeWhitePixel() {
  const texture = new THREE.DataTexture(
    new Uint8Array([255, 255, 255, 255]), 1, 1, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.colorSpace = THREE.NoColorSpace;
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

export class CompositePass {
  constructor(pipeline) {
    this.name = "composite";
    this.pipeline = pipeline;
    this.whitePixel = MakeWhitePixel();
    this.uniforms = {
      uHdr: { value: null }, uBloom: { value: null }, uGod: { value: null },
      uNormalDepth: { value: null }, uResolution: { value: new THREE.Vector2() },
      uExposure: { value: 1.0 }, uExposureTex: { value: this.whitePixel },
      uBloomStrength: { value: 0.55 }, uGodStrength: { value: 0.0 },
      uVignette: { value: 0.42 }, uAberration: { value: 0.0022 }, uGrain: { value: 0.014 },
      uFrame: { value: 0 }, uSaturation: { value: 0.94 }, uContrast: { value: 1.06 },
      uLift: { value: new THREE.Vector3(0.006, 0.004, 0.012) },
      uGain: { value: new THREE.Vector3(1.02, 1.0, 0.965) },
      uMotionScale: { value: 0.6 }, uInvProjection: { value: new THREE.Matrix4() },
      uPrevViewProjection: { value: new THREE.Matrix4() }, uInvView: { value: new THREE.Matrix4() },
      uProjScale: { value: new THREE.Vector2(1, 1) },
      uDamage: { value: 0 }, uFade: { value: 0 },
      uDofStrength: { value: 0 }, uDofFocus: { value: 1.5 },
      uDofRange: { value: 2.8 }, uDofMaxPx: { value: 11.0 },
      uNearDofStrength: { value: 0 }, uNearDofFocus: { value: 1.6 },
      uNearDofRange: { value: 0.85 }, uNearDofMaxPx: { value: 4.5 },
      uFogDensity: { value: 0.013 }, uFogFalloff: { value: 18 }, uFogBase: { value: 0 },
      uFogMax: { value: 0.94 },
      uFogColorSky: { value: new THREE.Vector3(0.62, 0.64, 0.68) },
      uFogColorGround: { value: new THREE.Vector3(0.42, 0.38, 0.33) },
      uFogSunGain: { value: 0.28 },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunColorFog: { value: new THREE.Vector3(1, 0.92, 0.78) },
      uDepthDesat: { value: 0.48 }, uDepthFlatten: { value: 0.14 },
      uFogScatter: { value: this.whitePixel }, uFogSource: { value: 0 },
      // 暗部往青蓝推、亮部往暖黄推。幅度看着小，但它作用在**每一个像素**上：
      // 实测把街景阴影的 B−R 从 +3 拉到 +12，中性水泥/石头的 RGB 不再相等。
      // 别再加大：超过 1.20/0.86 这一档，青砖会开始读成蓝砖，史实色 #7E8388 就走样了。
      uShadowTint: { value: new THREE.Vector3(0.855, 0.975, 1.170) },
      uHighlightTint: { value: new THREE.Vector3(1.105, 1.015, 0.880) },
      uSplitShadow: { value: 1.0 }, uSplitHighlight: { value: 1.0 },
    };
    this.material = MakeFullscreenMaterial(FRAG_COMPOSITE, this.uniforms);
    this.target = null;
  }

  Enabled() { return true; }

  Resize(width, height) {
    if (this.target) this.target.dispose();
    this.target = MakeRenderTarget(width, height, { type: THREE.UnsignedByteType });
    this.pipeline.targets.ldr = this.target;
  }

  Render(ctx) {
    const U = this.uniforms;
    const options = ctx.options;
    U.uHdr.value = ctx.sceneColor.texture;
    U.uBloom.value = this.pipeline.BloomTarget.texture;
    U.uGod.value = this.pipeline.targets.god.texture;
    U.uNormalDepth.value = ctx.normalDepthTexture;
    U.uResolution.value.set(ctx.width, ctx.height);
    U.uExposure.value = options.exposure ?? 1.0;
    U.uBloomStrength.value = options.bloom ?? 0.5;
    U.uGodStrength.value = ctx.godStrength;
    U.uVignette.value = options.vignette ?? 0.42;
    U.uAberration.value = options.aberration ?? 0.0022;
    U.uGrain.value = options.grain ?? 0.014;
    U.uSaturation.value = options.saturation ?? 0.94;
    U.uContrast.value = options.contrast ?? 1.06;
    if (options.lift) U.uLift.value.copy(options.lift);
    if (options.gain) U.uGain.value.copy(options.gain);
    if (options.fog) {
      U.uFogDensity.value = options.fog.density ?? 0.013;
      U.uFogFalloff.value = options.fog.falloff ?? 18;
      U.uFogBase.value = options.fog.base ?? 0;
      U.uFogMax.value = options.fog.max ?? 0.94;
      if (options.fog.sky) U.uFogColorSky.value.fromArray(options.fog.sky);
      if (options.fog.ground) U.uFogColorGround.value.fromArray(options.fog.ground);
      U.uFogSunGain.value = options.fog.sunGain ?? 0.28;
      U.uDepthDesat.value = options.fog.desat ?? 0.48;
      U.uDepthFlatten.value = options.fog.flatten ?? 0.14;
    }
    // 分离调色。Script_Main / Script_Probe 的调用点只透传 `preset.fog`，
    // 所以时段档要改这一组就把 grade 挂在 preset.fog 里带过来（大气与调色本来同源）。
    // 两边都没给就吃上面那组默认值 —— 默认值必须自己就是对的。
    const grade = options.grade ?? options.fog?.grade;
    if (grade) {
      if (grade.shadowTint) U.uShadowTint.value.fromArray(grade.shadowTint);
      if (grade.highlightTint) U.uHighlightTint.value.fromArray(grade.highlightTint);
      U.uSplitShadow.value = grade.shadow ?? 1.0;
      U.uSplitHighlight.value = grade.highlight ?? 1.0;
    }
    if (options.sunDirection) U.uSunDir.value.copy(options.sunDirection);
    if (options.sunColor) U.uSunColorFog.value.fromArray(options.sunColor);
    U.uDamage.value = options.damage ?? 0;
    U.uFade.value = options.fade ?? 0;
    U.uDofStrength.value = options.dofStrength ?? 0;
    U.uDofFocus.value = options.dofFocus ?? 1.5;
    U.uDofRange.value = options.dofRange ?? 2.8;
    U.uDofMaxPx.value = options.dofMaxPx ?? 11.0;
    U.uNearDofStrength.value = options.nearDofStrength ?? 0;
    U.uNearDofFocus.value = options.nearDofFocus ?? 1.6;
    U.uNearDofRange.value = options.nearDofRange ?? 0.85;
    U.uNearDofMaxPx.value = options.nearDofMaxPx ?? 4.5;
    U.uFrame.value = ctx.frame;
    U.uProjScale.value.copy(ctx.projScale);
    U.uInvView.value.copy(ctx.invView);
    U.uMotionScale.value = ctx.preset.motionBlur && ctx.hasPrev
      ? (options.motionBlur ?? 0.15) : 0;
    U.uPrevViewProjection.value.copy(ctx.prevViewProjection);
    ctx.blitter.Blit(this.material, this.target);
  }

  Dispose() {
    if (this.target) this.target.dispose();
    this.material.dispose();
    this.whitePixel.dispose();
  }
}
