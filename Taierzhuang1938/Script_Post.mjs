// 《血战台儿庄》自研后处理管线。
//
// 为什么自己写：仓库里 vendor 的 three 只有 build/，**没有 examples/jsm**，
// 没有 EffectComposer / UnrealBloomPass / SSAOPass 可用。所以整条链子从
// WebGLRenderTarget + 全屏四边形手搭。好处是顺序完全可控（AO 只压间接光、
// 泛光在 tonemap 之前、抗锯齿在 sRGB 之后）—— 这三条顺序错一条画面就"塑料"。
//
// 帧结构：
//   1) 深度法线预通道  -> rtNormalDepth (RGBA16F: xyz=视空间法线, w=线性深度)
//      TAA 开着时本帧投影矩阵带 Halton(2,3) 子像素抖动，预通道与主场景同一份
//   2) SSAO + 双边模糊 -> rtAoBlur (半分辨率)
//   3) 主场景 (MSAA)   -> rtHdr    (RGBA16F, AO 由 onBeforeCompile 注入到间接光)
//   4) TAA 时域解算    -> rtTaaA/B 乒乓（UE 缺省方案，账在 FRAG_TAA 头注；
//      跑在 tonemap 之前的线性 HDR 上，与 UE 的位置一致，泛光/雾/运动模糊
//      吃的都是解算后的画面）
//   5) 亮部提取 + 逐级降/升采样(tent) -> 泛光
//   6) 太阳拖影 fallback（屏幕空间方向性模糊，太阳在屏内才跑）
//   7) 合成：运动模糊 -> 曝光 -> ACES -> 调色 -> 暗角 -> 色差 -> 颗粒 -> sRGB
//   8) TAA 关时 FXAA；一律 + 锐化 -> 屏幕（TAA 开时 FXAA 跳过，再跑只会糊）
//
// 决定论：颗粒/抖动全部用 frameIndex 驱动，不用 Math.random —— 视觉审查靠逐轮
// 截图比对，画面自己在抖的话根本判断不了"这一版比上一版好"。TAA 的抖动序列
// 与历史累积同样由 frameIndex 驱动：StepFrames 推同样多帧，画面逐像素可复现。

import * as THREE from "three";
import { BindDestructionUniforms, DestructionShaderGlsl } from "./Script_Destruction.mjs";

const QUAD_GEOMETRY = new THREE.PlaneGeometry(2, 2);
const QUAD_CAMERA = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

const VERT_QUAD = /* glsl */`
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

// --- 公共 GLSL 片段 ---------------------------------------------------------
const GLSL_COMMON = /* glsl */`
float Luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

// 交错梯度噪声（Jorge Jimenez）：比 hash 噪声在低样本数下更"均匀"，
// 泛光抖动、太阳拖影采样、颗粒都用它。
float Ign(vec2 p) {
  return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
}

float Hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
`;

// ---------------------------------------------------------------------------
// 深度法线预通道用的覆盖材质
// 用 three 的 chunk 拼，USE_INSTANCING / 形变这些分支交给它自己处理，
// 不然实例化的瓦砾在预通道里全部塌到原点，AO 就是一片乱码。
// ---------------------------------------------------------------------------
function MakeNormalDepthMaterial(destruction = null) {
  const uniforms = { uFar: { value: 500 } };
  const damageEnabled = { value: 0 };
  if (destruction) BindDestructionUniforms(uniforms, destruction, damageEnabled);
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */`
      #include <common>
      #include <batching_pars_vertex>
      varying vec3 vViewNormal;
      varying float vViewDepth;
      ${destruction ? "varying vec3 vDamageWorldPos;" : ""}
      void main() {
        #include <batching_vertex>
        #include <beginnormal_vertex>
        #include <morphinstance_vertex>
        #include <morphnormal_vertex>
        #include <defaultnormal_vertex>
        vViewNormal = normalize(transformedNormal);
        #include <begin_vertex>
        #include <morphtarget_vertex>
        #include <project_vertex>
        vViewDepth = -mvPosition.z;
        ${destruction ? `
        vec4 damageWorld = vec4(transformed, 1.0);
        #ifdef USE_BATCHING
          damageWorld = batchingMatrix * damageWorld;
        #endif
        #ifdef USE_INSTANCING
          damageWorld = instanceMatrix * damageWorld;
        #endif
        vDamageWorldPos = (modelMatrix * damageWorld).xyz;` : ""}
      }
    `,
    fragmentShader: /* glsl */`
      uniform float uFar;
      varying vec3 vViewNormal;
      varying float vViewDepth;
      ${destruction ? `varying vec3 vDamageWorldPos;
${DestructionShaderGlsl(destruction.maxVolumes)}` : ""}
      void main() {
        ${destruction ? "ApplyDamageVolumes(vDamageWorldPos);" : ""}
        vec3 n = normalize(vViewNormal);
        if (!gl_FrontFacing) n = -n;
        gl_FragColor = vec4(n, vViewDepth);
      }
    `,
    side: THREE.FrontSide,
  });
  // BuildSink 的静态网格会在自己的 onBeforeRender/onAfterRender 里只为这一 draw
  // 打开裁切。演员、枪、碎片共用 overrideMaterial，但不会被破口 OBB 切掉。
  if (destruction) material.userData.damageObjectEnabled = damageEnabled;
  return material;
}

// ---------------------------------------------------------------------------
// SSAO：视空间半球采样。
// ---------------------------------------------------------------------------
const FRAG_SSAO = /* glsl */`
uniform sampler2D uNormalDepth;
uniform vec2 uResolution;
uniform mat4 uProjection;
uniform float uRadius;
uniform float uBias;
uniform float uIntensity;
uniform float uFrame;
uniform vec2 uProjScale;      // (1/tan(fov/2)/aspect, 1/tan(fov/2))
varying vec2 vUv;
${GLSL_COMMON}

const int SAMPLES = 14;
// 半球方向常量表：随机方向数组在低端 GPU 上会被展开成天文数字的常量，
// 这里用固定表 + 逐像素旋转，效果一样但编译得动。
const vec3 KERNEL[14] = vec3[14](
  vec3( 0.5381, 0.1856,  0.4319), vec3( 0.1379, 0.2486,  0.4430),
  vec3( 0.3371, 0.5679,  0.0057), vec3(-0.6999,-0.0451,  0.0019),
  vec3( 0.0689,-0.1598,  0.8547), vec3( 0.0560, 0.0069,  0.1843),
  vec3(-0.0146, 0.1402,  0.0762), vec3( 0.0100,-0.1924,  0.0344),
  vec3(-0.3577,-0.5301,  0.4358), vec3(-0.3169, 0.1063,  0.0158),
  vec3( 0.0103,-0.5869,  0.0046), vec3(-0.0897,-0.4940,  0.3287),
  vec3( 0.7119,-0.0154, -0.0918), vec3(-0.0533, 0.0596, -0.5411)
);

// 由屏幕 uv + 线性深度反推视空间坐标
vec3 ViewPos(vec2 uv, float depth) {
  vec2 ndc = uv * 2.0 - 1.0;
  return vec3(ndc.x / uProjScale.x, ndc.y / uProjScale.y, -1.0) * depth;
}

void main() {
  vec4 nd = texture2D(uNormalDepth, vUv);
  float depth = nd.w;
  if (depth <= 0.0 || depth > 400.0) { gl_FragColor = vec4(1.0); return; }
  vec3 normal = normalize(nd.xyz);
  vec3 origin = ViewPos(vUv, depth);

  // 逐像素随机切线：不转的话 14 个样本的图案会在墙上排成规则波纹
  float angle = Ign(gl_FragCoord.xy + uFrame * 5.588238) * 6.2831853;
  vec3 rvec = vec3(cos(angle), sin(angle), 0.0);
  vec3 tangent = normalize(rvec - normal * dot(rvec, normal));
  vec3 bitangent = cross(normal, tangent);
  mat3 tbn = mat3(tangent, bitangent, normal);

  // 双半径：阴天没有硬阴影，形体感全靠 AO。
  // 前 7 个样本走大半径抓大范围遮蔽，后 7 个走小半径抓贴根的接触阴影 ——
  // 只有一档半径的话，要么墙角糊成一片灰，要么沙包脚下什么都没有。
  float occlusion = 0.0;
  for (int i = 0; i < SAMPLES; i++) {
    // 抓出 AO 图（readRenderTargetPixels 直接把 aoBlur 导出来看）之后才发现的三处硬伤：
    //
    // ① KERNEL 这张表里的向量**长度差了一个数量级**（0.19 到 0.86 都有），
    //    直接当偏移用等于大部分样本只走出三五厘米 —— 墙根、砖块底下什么都探不到。
    //    正确做法是取方向再自己配长度。
    // ② 表里有三个向量的 z 是**负的**（−0.5411 / −0.0918 / +0.0019）。z<0 表示
    //    采样点扎到表面背面去，深度比较必然判"被遮挡" —— 全屏恒定多出约 14% 的
    //    遮蔽底噪，AO 图整体发灰，真正的接触带反而被这层底噪淹没。abs() 掰回来。
    // ③ 长度还要沿半径**铺开**（0.35→1.0），不然样本全挤在同一个壳上，
    //    暗带是一圈硬环而不是由深到浅的渐变。
    vec3 dir = normalize(vec3(KERNEL[i].xy, abs(KERNEL[i].z) + 0.25));
    // 近半径 0.30×（≈18 cm，砖墙根部暗带的真实宽度）；bias 跟着半径等比缩小 ——
    // 3 cm 的固定 bias 会把 18 cm 的接触半径吃掉六分之一，近处那一档就废了
    float t = float(i < 7 ? i : i - 7) / 6.0;
    float radius = ((i < 7) ? uRadius : uRadius * 0.30) * (0.35 + 0.65 * t);
    float bias = (i < 7) ? uBias : uBias * 0.30;
    vec3 samplePos = origin + (tbn * dir) * radius;
    vec4 clip = uProjection * vec4(samplePos, 1.0);
    vec2 suv = (clip.xy / clip.w) * 0.5 + 0.5;
    if (suv.x < 0.0 || suv.x > 1.0 || suv.y < 0.0 || suv.y > 1.0) continue;
    float sceneDepth = texture2D(uNormalDepth, suv).w;
    if (sceneDepth <= 0.0) continue;
    float sampleDepth = -samplePos.z;
    // 范围检查：远处的墙不该给近处的地面投 AO
    float rangeCheck = smoothstep(0.0, 1.0, radius / max(0.0001, abs(depth - sceneDepth)));
    occlusion += (sceneDepth <= sampleDepth - bias ? 1.0 : 0.0) * rangeCheck;
  }
  float ao = 1.0 - (occlusion / float(SAMPLES)) * uIntensity;
  gl_FragColor = vec4(clamp(ao, 0.0, 1.0), depth, 0.0, 1.0);
}
`;

// 双边模糊：跨深度边界不混，不然人物脚下的接触阴影会糊成一团光晕
const FRAG_AO_BLUR = /* glsl */`
uniform sampler2D uAo;
uniform vec2 uTexel;
uniform vec2 uDirection;
varying vec2 vUv;
void main() {
  vec2 center = texture2D(uAo, vUv).rg;
  float sum = center.r * 0.2270270270;
  float wsum = 0.2270270270;
  const float OFFSETS[3] = float[3](1.3846153846, 3.2307692308, 5.1153846154);
  const float WEIGHTS[3] = float[3](0.3162162162, 0.0702702703, 0.0162162162);
  for (int i = 0; i < 3; i++) {
    for (int s = -1; s <= 1; s += 2) {
      vec2 uv = vUv + uDirection * uTexel * OFFSETS[i] * float(s);
      vec2 t = texture2D(uAo, uv).rg;
      float dw = exp(-abs(t.g - center.g) * 2.0);
      sum += t.r * WEIGHTS[i] * dw;
      wsum += WEIGHTS[i] * dw;
    }
  }
  gl_FragColor = vec4(sum / max(wsum, 1e-4), center.g, 0.0, 1.0);
}
`;

// --- 泛光：亮部提取 + 13 抽样降采样 + 3x3 tent 升采样 -----------------------
const FRAG_BRIGHT = /* glsl */`
uniform sampler2D uSource;
uniform sampler2D uNormalDepth;
uniform float uThreshold;
uniform float uKnee;
uniform float uClamp;
uniform float uPackSky;
varying vec2 vUv;
${GLSL_COMMON}
void main() {
  vec3 c = texture2D(uSource, vUv).rgb;
  c = min(c, vec3(uClamp));                 // 防单个超亮像素把整屏糊成白饼
  float br = max(c.r, max(c.g, c.b));
  // 软膝：硬阈值会在爆点边缘切出一圈生硬的轮廓
  float soft = clamp(br - uThreshold + uKnee, 0.0, 2.0 * uKnee);
  soft = soft * soft / (4.0 * uKnee + 1e-4);
  float contrib = max(soft, br - uThreshold) / max(br, 1e-4);
  // 太阳拖影开时借 alpha 带一张低分辨率天空遮挡图。这一趟本来就在读 HDR，
  // 顺手多读一次深度，可以让后面的径向模糊每步从“亮部+全分辨率深度”
  // 两次随机访存变成只读这一张图。关拖影时统一写 1，动态分支不读深度。
  float sky = 1.0;
  if (uPackSky > 0.5) {
    float depth = texture2D(uNormalDepth, vUv).w;
    sky = clamp(step(depth, 0.0001) + step(300.0, depth), 0.0, 1.0);
  }
  gl_FragColor = vec4(c * contrib, sky);
}
`;

const FRAG_DOWNSAMPLE = /* glsl */`
uniform sampler2D uSource;
uniform vec2 uTexel;
varying vec2 vUv;
void main() {
  // COD:AW 那套 13 抽样：比 2x2 盒式稳得多，镜头一动泛光不会"沸腾"
  vec3 a = texture2D(uSource, vUv + uTexel * vec2(-2.0,  2.0)).rgb;
  vec3 b = texture2D(uSource, vUv + uTexel * vec2( 0.0,  2.0)).rgb;
  vec3 c = texture2D(uSource, vUv + uTexel * vec2( 2.0,  2.0)).rgb;
  vec3 d = texture2D(uSource, vUv + uTexel * vec2(-2.0,  0.0)).rgb;
  vec3 e = texture2D(uSource, vUv).rgb;
  vec3 f = texture2D(uSource, vUv + uTexel * vec2( 2.0,  0.0)).rgb;
  vec3 g = texture2D(uSource, vUv + uTexel * vec2(-2.0, -2.0)).rgb;
  vec3 h = texture2D(uSource, vUv + uTexel * vec2( 0.0, -2.0)).rgb;
  vec3 i = texture2D(uSource, vUv + uTexel * vec2( 2.0, -2.0)).rgb;
  vec3 j = texture2D(uSource, vUv + uTexel * vec2(-1.0,  1.0)).rgb;
  vec3 k = texture2D(uSource, vUv + uTexel * vec2( 1.0,  1.0)).rgb;
  vec3 l = texture2D(uSource, vUv + uTexel * vec2(-1.0, -1.0)).rgb;
  vec3 m = texture2D(uSource, vUv + uTexel * vec2( 1.0, -1.0)).rgb;
  vec3 result = e * 0.125;
  result += (a + c + g + i) * 0.03125;
  result += (b + d + f + h) * 0.0625;
  result += (j + k + l + m) * 0.125;
  gl_FragColor = vec4(result, 1.0);
}
`;

const FRAG_UPSAMPLE = /* glsl */`
uniform sampler2D uSource;   // 更小一级
uniform sampler2D uPrevious; // 同级已有内容
uniform vec2 uTexel;
uniform float uRadius;
varying vec2 vUv;
void main() {
  vec2 o = uTexel * uRadius;
  vec3 s = texture2D(uSource, vUv + vec2(-o.x,  o.y)).rgb * 1.0;
  s += texture2D(uSource, vUv + vec2( 0.0,  o.y)).rgb * 2.0;
  s += texture2D(uSource, vUv + vec2( o.x,  o.y)).rgb * 1.0;
  s += texture2D(uSource, vUv + vec2(-o.x,  0.0)).rgb * 2.0;
  s += texture2D(uSource, vUv).rgb * 4.0;
  s += texture2D(uSource, vUv + vec2( o.x,  0.0)).rgb * 2.0;
  s += texture2D(uSource, vUv + vec2(-o.x, -o.y)).rgb * 1.0;
  s += texture2D(uSource, vUv + vec2( 0.0, -o.y)).rgb * 2.0;
  s += texture2D(uSource, vUv + vec2( o.x, -o.y)).rgb * 1.0;
  gl_FragColor = vec4(texture2D(uPrevious, vUv).rgb + s / 16.0, 1.0);
}
`;

// --- 太阳拖影 fallback（屏幕空间方向性模糊）---------------------------------
const FRAG_GODRAYS = /* glsl */`
uniform sampler2D uBright;
uniform vec2 uSunUv;
uniform float uDensity;
uniform float uWeight;
uniform float uFrame;
varying vec2 vUv;
${GLSL_COMMON}
vec3 TapRay(vec2 ray, float t, float jitter, float weight) {
  vec4 s = texture2D(uBright, vUv + ray * clamp(t + jitter, 0.0, 1.0));
  return s.rgb * s.a * weight;
}
void main() {
  // 这不再模拟体积内的逐步光线积分，只做一条指向太阳的屏幕空间拖影。
  // 8 个非均匀 tap 覆盖与旧版相同的 uDensity 长度；近处密、远处疏，
  // 低分辨率线性过滤 + 微小帧间抖动会把它融成连续光带。
  vec2 ray = (uSunUv - vUv) * uDensity;
  float jitter = (Ign(gl_FragCoord.xy + uFrame * 3.17) - 0.5) * 0.018;
  vec3 sum = TapRay(ray, 0.02, jitter, 1.00);
  sum += TapRay(ray, 0.06, jitter, 0.92);
  sum += TapRay(ray, 0.13, jitter, 0.84);
  sum += TapRay(ray, 0.23, jitter, 0.74);
  sum += TapRay(ray, 0.36, jitter, 0.63);
  sum += TapRay(ray, 0.52, jitter, 0.52);
  sum += TapRay(ray, 0.70, jitter, 0.42);
  sum += TapRay(ray, 0.90, jitter, 0.34);
  gl_FragColor = vec4(sum * (uWeight / 5.41), 1.0);
}
`;

// --- TAA：UE 缺省方案照搬 ----------------------------------------------------
// 方案与参数对齐 UE 的缺省 Temporal AA（Karis, SIGGRAPH 2014 "High Quality
// Temporal Supersampling" + TemporalAA.usf 的出厂 CVar）：
//   r.TemporalAASamples = 8               → Halton(2,3) 八相位子像素抖动
//   r.TemporalAACurrentFrameWeight = 0.04 → 当前帧权重 0.04，历史占 0.96
//   当前帧 3x3 用 Blackman-Harris 3.3 滤波重定心（高斯拟合 exp(-2.29 r²)，
//     权重只依赖本帧抖动，CPU 算好九个数喂 uniform）
//   历史用 Catmull-Rom 5-tap 重采样（双线性会把几十帧重投影抹成油画）
//   邻域裁剪在 YCoCg 空间做 AABB（3x3 大盒与十字小盒对折 = UE 的 rounded box）
//   速度取 3x3 最近片元（closest-fragment dilation），快动时权重向 0.2 抬
//     （UE: lerp(w, 0.2, saturate(velocityPx / 40))）
//   混合在 Karis tonemap 域（c / (1 + luma)）做，防高亮 firefly 帧间闪
// 与 UE 的差别只有一处：没有逐物体速度缓冲，速度全部由深度反投影从相机运动
// 推出 —— 与合成 pass 的运动模糊同一套近似。动的人物/碎片靠邻域裁剪兜底，
// 表现是它们边缘的时域累积浅一些，不是拖出鬼影。
const TAA_SAMPLES = 8;
const TAA_CURRENT_FRAME_WEIGHT = 0.04;
const TAA_FILTER_GAUSSIAN_K = 2.29;

function Halton(index, base) {
  let f = 1, r = 0, i = index;
  while (i > 0) { f /= base; r += f * (i % base); i = Math.floor(i / base); }
  return r;
}
// 与 UE 一致从 1 起数（index 0 是 0，落在像素角上，八点分布会缺一角）
const TAA_JITTER = [];
for (let i = 1; i <= TAA_SAMPLES; i += 1) {
  TAA_JITTER.push([Halton(i, 2) - 0.5, Halton(i, 3) - 0.5]);
}
// 与 FRAG_TAA 里 TAPS 的次序必须一致（滤波权重按下标对位）
const TAA_OFFSETS = [
  [-1, -1], [0, -1], [1, -1],
  [-1, 0], [0, 0], [1, 0],
  [-1, 1], [0, 1], [1, 1],
];

const FRAG_TAA = /* glsl */`
uniform sampler2D uCurrent;
uniform sampler2D uHistory;
uniform sampler2D uNormalDepth;
uniform vec2 uTexel;
uniform vec2 uResolution;
uniform float uWeights[9];       // Blackman-Harris 重定心权重，CPU 已归一
uniform float uCurrentWeight;    // UE r.TemporalAACurrentFrameWeight
uniform float uHasHistory;
uniform mat4 uInvView;
uniform mat4 uPrevViewProjection;
uniform vec2 uProjScale;
varying vec2 vUv;
${GLSL_COMMON}

const vec2 TAPS[9] = vec2[9](
  vec2(-1.0, -1.0), vec2(0.0, -1.0), vec2(1.0, -1.0),
  vec2(-1.0,  0.0), vec2(0.0,  0.0), vec2(1.0,  0.0),
  vec2(-1.0,  1.0), vec2(0.0,  1.0), vec2(1.0,  1.0));

// Karis tonemap 域：混合前把 HDR 压进 [0,1)。不压的话一个 40.0 的火光
// firefly 会把邻域盒撑到天上，历史裁剪失效，表现是高亮点逐帧闪。
vec3 TonemapWeight(vec3 c) { return c / (1.0 + Luma(c)); }
vec3 TonemapUnweight(vec3 c) { return c / max(1.0 - Luma(c), 1e-4); }

vec3 RgbToYcocg(vec3 c) {
  return vec3(0.25 * c.r + 0.5 * c.g + 0.25 * c.b,
              0.5 * c.r - 0.5 * c.b,
             -0.25 * c.r + 0.5 * c.g - 0.25 * c.b);
}
vec3 YcocgToRgb(vec3 c) {
  return max(vec3(c.x + c.y - c.z, c.x + c.z, c.x - c.y - c.z), vec3(0.0));
}

vec3 ViewPos(vec2 uv, float depth) {
  vec2 ndc = uv * 2.0 - 1.0;
  return vec3(ndc.x / uProjScale.x, ndc.y / uProjScale.y, -1.0) * depth;
}

// Catmull-Rom 5-tap（Jimenez 的 9→5 优化）：负瓣双三次抵消重投影
// 反复双线性插值的累积模糊。角上四个权重最小的 tap 省掉，误差不可见。
vec3 SampleHistory(vec2 uv) {
  vec2 samplePos = uv * uResolution;
  vec2 tc1 = floor(samplePos - 0.5) + 0.5;
  vec2 f = samplePos - tc1;
  vec2 w0 = f * (-0.5 + f * (1.0 - 0.5 * f));
  vec2 w1 = 1.0 + f * f * (-2.5 + 1.5 * f);
  vec2 w2 = f * (0.5 + f * (2.0 - 1.5 * f));
  vec2 w3 = f * f * (-0.5 + 0.5 * f);
  vec2 w12 = w1 + w2;
  vec2 p0 = (tc1 - 1.0) * uTexel;
  vec2 p3 = (tc1 + 2.0) * uTexel;
  vec2 p12 = (tc1 + w2 / w12) * uTexel;
  vec3 acc = texture2D(uHistory, vec2(p12.x, p0.y)).rgb * (w12.x * w0.y)
           + texture2D(uHistory, vec2(p0.x, p12.y)).rgb * (w0.x * w12.y)
           + texture2D(uHistory, vec2(p12.x, p12.y)).rgb * (w12.x * w12.y)
           + texture2D(uHistory, vec2(p3.x, p12.y)).rgb * (w3.x * w12.y)
           + texture2D(uHistory, vec2(p12.x, p3.y)).rgb * (w12.x * w3.y);
  float wsum = w12.x * w0.y + w0.x * w12.y + w12.x * w12.y
             + w3.x * w12.y + w12.x * w3.y;
  return max(acc / wsum, vec3(0.0));
}

void main() {
  // --- 1) 3x3 邻域一趟拿三样：滤波后的当前帧、YCoCg 包围盒、最近深度 ---
  vec3 filtered = vec3(0.0);
  vec3 boxMin = vec3(1e5), boxMax = vec3(-1e5);
  vec3 crossMin = vec3(1e5), crossMax = vec3(-1e5);
  float closestDepth = 1e9;
  vec2 closestOffset = vec2(0.0);
  for (int i = 0; i < 9; i++) {
    vec2 offset = TAPS[i] * uTexel;
    vec3 c = RgbToYcocg(TonemapWeight(texture2D(uCurrent, vUv + offset).rgb));
    filtered += c * uWeights[i];
    boxMin = min(boxMin, c);
    boxMax = max(boxMax, c);
    if (TAPS[i].x == 0.0 || TAPS[i].y == 0.0) {
      crossMin = min(crossMin, c);
      crossMax = max(crossMax, c);
    }
    float d = texture2D(uNormalDepth, vUv + offset).w;
    // 天空（w=0）当远处理：大深度下重投影退化成纯旋转视差，正是天该有的
    if (d <= 0.0) d = 400.0;
    if (d < closestDepth) { closestDepth = d; closestOffset = offset; }
  }
  // 3x3 大盒对斜边太松（鬼影漏过去），十字小盒太紧（细节闪），
  // 对折是 UE 的 rounded AABB，两头都稳
  boxMin = 0.5 * (boxMin + crossMin);
  boxMax = 0.5 * (boxMax + crossMax);

  // --- 2) 速度：最近片元的相机重投影（closest-fragment dilation）---
  // 取邻域里最近的片元算速度再套给本像素：物体轮廓外一圈像素本属于背景，
  // 不膨胀的话轮廓在镜头平移时会挂一圈背景速度的毛边。
  vec2 uvClosest = vUv + closestOffset;
  vec3 viewPos = ViewPos(uvClosest, closestDepth);
  vec4 world = uInvView * vec4(viewPos, 1.0);
  vec4 prevClip = uPrevViewProjection * world;
  vec2 prevUvClosest = (prevClip.xy / max(abs(prevClip.w), 1e-4)) * 0.5 + 0.5;
  vec2 velocity = uvClosest - prevUvClosest;
  vec2 prevUv = vUv - velocity;

  bool offscreen = prevUv.x < 0.0 || prevUv.x > 1.0
                || prevUv.y < 0.0 || prevUv.y > 1.0;
  if (uHasHistory < 0.5 || offscreen || prevClip.w <= 0.0) {
    gl_FragColor = vec4(TonemapUnweight(YcocgToRgb(filtered)), 1.0);
    return;
  }

  // --- 3) 历史：Catmull-Rom 采样 → 裁进邻域盒（防遮挡变化的鬼影）---
  vec3 history = RgbToYcocg(TonemapWeight(SampleHistory(prevUv)));
  vec3 center = 0.5 * (boxMax + boxMin);
  vec3 extent = 0.5 * (boxMax - boxMin) + 1e-5;
  vec3 dir = history - center;
  float t = min(min(extent.x / max(abs(dir.x), 1e-6),
                    extent.y / max(abs(dir.y), 1e-6)),
                    extent.z / max(abs(dir.z), 1e-6));
  history = center + dir * clamp(t, 0.0, 1.0);

  // --- 4) 混合：静止 0.04（UE 缺省），快动向 0.2 抬减少拖尾 ---
  float velocityPx = length(velocity * uResolution);
  float w = mix(uCurrentWeight, 0.2, clamp(velocityPx / 40.0, 0.0, 1.0));
  vec3 blended = mix(history, filtered, w);
  vec3 result = TonemapUnweight(YcocgToRgb(blended));
  // NaN 杀手（UE 同款）：历史里一旦混进 NaN 会永久驻留且逐帧扩散一圈
  if (any(isnan(result))) result = TonemapUnweight(YcocgToRgb(filtered));
  gl_FragColor = vec4(result, 1.0);
}
`;

// --- 合成 -------------------------------------------------------------------
const FRAG_COMPOSITE = /* glsl */`
uniform sampler2D uHdr;
uniform sampler2D uBloom;
uniform sampler2D uGod;
uniform sampler2D uNormalDepth;
uniform vec2 uResolution;
uniform float uExposure;
uniform float uBloomStrength;
uniform float uGodStrength;
uniform float uVignette;
uniform float uAberration;
uniform float uGrain;
uniform float uFrame;
uniform float uSaturation;
uniform float uContrast;
uniform vec3 uLift;
uniform vec3 uGain;
uniform float uMotionScale;
uniform mat4 uInvProjection;
uniform mat4 uPrevViewProjection;
uniform mat4 uInvView;
uniform vec2 uProjScale;
uniform float uDamage;      // 受伤：边缘泛红 + 去色
uniform float uFade;        // 黑场
// 阵亡景深：焦点固定在贴地镜头前景，深度越远 CoC 越大；随后 HUD 才叠 mask/UI。
uniform float uDofStrength;
uniform float uDofFocus;
uniform float uDofRange;
uniform float uDofMaxPx;
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
// 分离调色（split toning）：**这是「整体偏单色土黄」的最后一道闸门**。
// 前面那套 uLift/uGain 是全局加/乘，(0.006,0.004,0.012)+(1.02,1.0,0.965) 实际是恒等式，
// 中性物体的 RGB 出来仍然相等 —— 评分表 C7 直接判 0。
// 这里改成按明度分权的**乘法**着色：暗部乘一个偏青蓝的系数、亮部乘一个偏暖黄的系数。
// 必须是乘法不是加法：加法会把纯黑抬成有色的灰（暗角与暗部当场发灰，C5 就废了）。
uniform vec3 uShadowTint;
uniform vec3 uHighlightTint;
uniform float uSplitShadow;
uniform float uSplitHighlight;
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

void main() {
  vec2 uv = vUv;
  vec2 centered = uv - 0.5;
  float r2 = dot(centered, centered);

  // --- 相机运动模糊：由深度反投影求上一帧的屏幕位置 ---
  vec4 nd = texture2D(uNormalDepth, uv);
  vec2 velocity = vec2(0.0);
  if (uMotionScale > 0.0 && nd.w > 0.0) {
    vec3 viewPos = ViewPos(uv, nd.w);
    vec4 world = uInvView * vec4(viewPos, 1.0);
    vec4 prevClip = uPrevViewProjection * world;
    vec2 prevUv = (prevClip.xy / max(abs(prevClip.w), 1e-4)) * 0.5 + 0.5;
    velocity = (uv - prevUv) * uMotionScale;
    velocity = clamp(velocity, vec2(-0.05), vec2(0.05));
  }

  // --- 色差：只在画面边缘拉开，中心保持锐利（真镜头就是这样）---
  float ca = uAberration * r2;
  vec3 color;
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
    color = acc / float(TAPS);
  } else {
    color = texture2D(uHdr, uv).rgb;
  }

  // --- 阵亡景深：近景仍锐利，背景用 12 抽样圆盘做重度散焦 ---
  // 不能用 CSS blur：那会把贴在镜头前的地面也一起糊掉，只剩一张均匀毛玻璃。
  // rtNormalDepth.w 是线性视深，正好能把「倒地后眼前一两米」与远处战场分开。
  if (uDofStrength > 0.001) {
    float coc = nd.w <= 0.0 ? 1.0
      : smoothstep(uDofFocus, uDofFocus + max(uDofRange, 0.01), nd.w);
    coc *= uDofStrength;
    if (coc > 0.001) {
      vec2 radius = vec2(uDofMaxPx * coc) / uResolution;
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
      color = mix(color, blur / float(DOF_TAPS), coc);
    }
  }

  color += texture2D(uBloom, uv).rgb * uBloomStrength;
  color += texture2D(uGod, uv).rgb * uGodStrength;

  // 天空（深度 0）不吃雾 —— 它自己的着色器里已经有霾了，
  // 再叠一层会糊成一块白饼。
  if (uFogDensity > 0.0 && nd.w > 0.0) {
    vec3 fogViewPos = ViewPos(uv, nd.w);
    vec4 worldPos = uInvView * vec4(fogViewPos, 1.0);
    vec3 camPos = uInvView[3].xyz;
    vec3 rayDir = normalize(worldPos.xyz - camPos);
    float fd = 1.0 - exp(-nd.w * uFogDensity);
    float hFall = exp(-max(worldPos.y - uFogBase, 0.0) / max(uFogFalloff, 0.5));
    float fog = clamp(fd * hFall, 0.0, uFogMax);
    // 雾色随视线仰角在“地面色”与“天空色”之间过渡；
    // 朝太阳那一侧要亮 —— 这一笔是“雾里有阳光”与“屏幕发灰”的分界线。
    vec3 fogCol = mix(uFogColorGround, uFogColorSky, clamp(rayDir.y * 2.0 + 0.35, 0.0, 1.0));
    fogCol += uSunColorFog * pow(max(dot(rayDir, normalize(uSunDir)), 0.0), 8.0) * uFogSunGain;
    // 大气透视第二层：远处不只是被雾盖住，它自身的饱和与对比也在掉
    float fogLum = Luma(color);
    color = mix(color, vec3(fogLum), fog * uDepthDesat);
    color = mix(color, vec3(0.42), fog * uDepthFlatten);
    color = mix(color, fogCol, fog);
  }

  color *= uExposure;
  color = AcesFitted(color);

  // --- 调色：lift/gain + 分离调色 + 对比 + 饱和 ---
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
  float l = Luma(color);
  color = mix(vec3(l), color, uSaturation);

  // --- 受伤反馈：边缘吃血、中心去色 ---
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
    color = mix(color, vec3(l * 0.88), uDamage * 0.42);
    color *= mix(vec3(1.0), vec3(1.0, 0.40, 0.32), edge * uDamage * 0.60);
  }

  // --- 暗角：别做成一圈发灰的环，压的是亮度不是加黑纱 ---
  float vig = 1.0 - uVignette * smoothstep(0.02, 0.50, r2);
  color *= vig;

  // --- 胶片颗粒：暗部多、亮部少（真胶片的颗粒就在中间调最明显）---
  float grain = (Hash12(gl_FragCoord.xy + uFrame * 13.71) - 0.5);
  color += grain * uGrain * (0.35 + 0.65 * (1.0 - abs(Luma(color) * 2.0 - 1.0)));

  color = max(color, vec3(0.0)) * (1.0 - uFade);

  // 线性 -> sRGB（自己转：这一 pass 没有 include colorspace_fragment，
  // 交给 renderer.outputColorSpace 会一次都不转，画面直接洗白）
  vec3 srgb = LinearToSrgb(color);
  gl_FragColor = vec4(srgb, 1.0);
}
`;

// --- FXAA 3.11 简化版 + 锐化 ------------------------------------------------
const FRAG_FXAA = /* glsl */`
uniform sampler2D uSource;
uniform vec2 uTexel;
uniform float uSharpen;
uniform float uFxaa;   // TAA 开着时置 0：几何锯齿已在时域上解决，FXAA 只会再糊一层
varying vec2 vUv;
${GLSL_COMMON}

void main() {
  vec3 rgbNW = texture2D(uSource, vUv + vec2(-1.0, -1.0) * uTexel).rgb;
  vec3 rgbNE = texture2D(uSource, vUv + vec2( 1.0, -1.0) * uTexel).rgb;
  vec3 rgbSW = texture2D(uSource, vUv + vec2(-1.0,  1.0) * uTexel).rgb;
  vec3 rgbSE = texture2D(uSource, vUv + vec2( 1.0,  1.0) * uTexel).rgb;
  vec3 rgbM  = texture2D(uSource, vUv).rgb;

  vec3 aa = rgbM;
  if (uFxaa > 0.5) {
    float lNW = Luma(rgbNW), lNE = Luma(rgbNE), lSW = Luma(rgbSW), lSE = Luma(rgbSE), lM = Luma(rgbM);
    float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE)));
    float lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));

    vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), ((lNW + lSW) - (lNE + lSE)));
    float dirReduce = max((lNW + lNE + lSW + lSE) * 0.25 * 0.0625, 0.0078125);
    float rcpDirMin = 1.0 / (min(abs(dir.x), abs(dir.y)) + dirReduce);
    dir = clamp(dir * rcpDirMin, vec2(-8.0), vec2(8.0)) * uTexel;

    vec3 rgbA = 0.5 * (texture2D(uSource, vUv + dir * (1.0 / 3.0 - 0.5)).rgb
                     + texture2D(uSource, vUv + dir * (2.0 / 3.0 - 0.5)).rgb);
    vec3 rgbB = rgbA * 0.5 + 0.25 * (texture2D(uSource, vUv + dir * -0.5).rgb
                                   + texture2D(uSource, vUv + dir * 0.5).rgb);
    float lB = Luma(rgbB);
    aa = (lB < lMin || lB > lMax) ? rgbA : rgbB;
  }

  // 轻锐化（CAS 的思路简化版）：抗锯齿之后画面必然发肉，补回一点边缘
  if (uSharpen > 0.0) {
    vec3 blur = (rgbNW + rgbNE + rgbSW + rgbSE) * 0.25;
    aa = clamp(aa + (aa - blur) * uSharpen, 0.0, 1.0);
  }
  gl_FragColor = vec4(aa, 1.0);
}
`;

// 渲染调试页的专用展示 pass。所有中间靶都保持在线性/HDR 空间，不能直接
// Copy 到屏幕：法线会偏暗、辐照度图集会一片白，深度更是只剩黑。这里按
// 类型做最小限度的可读化，不改变任何供正式合成使用的纹理。
const FRAG_DEBUG_VIEW = /* glsl */`
  uniform sampler2D uSource;
  uniform float uMode;
  uniform float uUnavailable;
  uniform mat4 uInvView;
  uniform vec2 uProjScale;
  uniform float uFogDensity;
  uniform float uFogFalloff;
  uniform float uFogBase;
  uniform float uFogMax;
  uniform float uDofStrength;
  uniform float uDofFocus;
  uniform float uDofRange;
  uniform mat4 uPrevViewProjection;
  uniform vec2 uResolution;
  uniform float uHasPrev;
  varying vec2 vUv;

  vec3 ToSrgb(vec3 c) {
    return pow(max(c, vec3(0.0)), vec3(1.0 / 2.2));
  }

  void main() {
    if (uUnavailable > 0.5) {
      float stripe = step(0.5, fract((vUv.x + vUv.y) * 22.0));
      gl_FragColor = vec4(mix(vec3(0.12, 0.012, 0.018), vec3(0.55, 0.03, 0.08), stripe), 1.0);
      return;
    }
    // 变量名不许叫 sample。three 从 r163 起把所有 ShaderMaterial 都按
    // GLSL ES 3.00（#version 300 es）编译，而 sample 在 3.00 里是保留字：
    // 编译直接报 Illegal use of reserved word。整个 pass 编译不过时 three 只在
    // 控制台留一行 Shader Error，屏幕上这一趟什么都不画 —— 表现就是
    // 「调试面板每一个视图都是纯黑」，而正式合成链毫发无损，极难往这里想。
    vec4 texel = texture2D(uSource, vUv);
    vec3 color = texel.rgb;
    if (uMode < 0.5) {                 // 法线：[-1, 1] -> [0, 1]
      color = color * 0.5 + 0.5;
    } else if (uMode < 1.5) {          // 线性视深：近亮、远暗，80m 对应黑
      float depth = 1.0 - clamp(texel.a / 80.0, 0.0, 1.0);
      color = vec3(depth);
    } else if (uMode < 2.5) {          // AO 本来就是可显示的遮蔽量
      color = vec3(texel.r);
    } else if (uMode < 3.5) {          // 距离图集：均值 / 不确定度 = R / G
      color = vec3(texel.r, texel.g, 0.0);
    } else if (uMode < 4.5) {          // HDR / 辐照度：Reinhard + sRGB
      color = color / (color + vec3(1.0));
      color = ToSrgb(color);
    } else if (uMode < 5.5) {          // 材质通道假彩色：0-1 数据，只做 sRGB 编码。
      // 走 Reinhard 会把 0.5 的粗糙度压成 0.33，读数就不准了；
      // 天空穹没被注入、还是 HDR 亮度，pow 后钳到白 —— 当背景正合适。
      color = ToSrgb(color);
    } else if (uMode < 6.5) {          // 雾量：严格复算 Composite 的距离 × 高度系数。
      float fog = 0.0;
      if (texel.a > 0.0 && uFogDensity > 0.0) {
        vec2 ndc = vUv * 2.0 - 1.0;
        vec3 viewPos = vec3(ndc.x / max(uProjScale.x, 0.0001),
                            ndc.y / max(uProjScale.y, 0.0001), -1.0) * texel.a;
        vec4 worldPos = uInvView * vec4(viewPos, 1.0);
        float distanceFog = 1.0 - exp(-texel.a * uFogDensity);
        float heightFog = exp(-max(worldPos.y - uFogBase, 0.0) / max(uFogFalloff, 0.5));
        fog = clamp(distanceFog * heightFog, 0.0, uFogMax);
      }
      // 雾本身可能接近灰色，直接看它不容易看出系数；假彩色才看得见断层和高度带。
      color = mix(vec3(0.015, 0.035, 0.18), vec3(1.0, 0.63, 0.04), fog);
      color = ToSrgb(color);
    } else if (uMode < 7.5) {          // 景深 CoC：严格复算 Composite 的远景散焦系数。
      float coc = texel.a <= 0.0 ? 1.0
        : smoothstep(uDofFocus, uDofFocus + max(uDofRange, 0.01), texel.a);
      coc *= uDofStrength;
      // 即使阵亡景深没触发也保留深蓝底，避免「全黑」被误判成展示 pass 没出画。
      color = mix(vec3(0.015, 0.06, 0.30), vec3(1.0, 0.72, 0.04), clamp(coc, 0.0, 1.0));
      color = ToSrgb(color);
    } else {                           // Motion Vector：与 TAA 同一套深度反投影相机速度。
      // 没有逐物体 velocity buffer；这张图如实展示运动模糊/TAA 实际使用的速度近似。
      float depth = texel.a <= 0.0 ? 400.0 : texel.a;
      vec2 ndc = vUv * 2.0 - 1.0;
      vec3 viewPos = vec3(ndc.x / max(uProjScale.x, 0.0001),
                          ndc.y / max(uProjScale.y, 0.0001), -1.0) * depth;
      vec4 worldPos = uInvView * vec4(viewPos, 1.0);
      vec4 prevClip = uPrevViewProjection * worldPos;
      vec2 prevUv = (prevClip.xy / max(abs(prevClip.w), 0.0001)) * 0.5 + 0.5;
      vec2 velocityPx = (vUv - prevUv) * uResolution;
      if (uHasPrev < 0.5 || prevClip.w <= 0.0) velocityPx = vec2(0.0);
      vec2 encodedDirection = clamp(velocityPx / 32.0, vec2(-1.0), vec2(1.0));
      color = vec3(0.5 + encodedDirection.x * 0.5,
                   0.5 + encodedDirection.y * 0.5,
                   clamp(length(velocityPx) / 32.0, 0.0, 1.0));
    }
    gl_FragColor = vec4(color, 1.0);
  }`;

/**
 * 把一份材质排除在深度法线预通道之外。
 *
 * 事故根源：r165 起 `scene.overrideMaterial` 加了 `material.allowOverride` 闸门，
 * 默认 **true** —— 也就是说粒子、贴片（Sprite/Points）、烟、天空穹全都会被
 * 覆盖材质换掉。它们的几何属性对不上覆盖材质的顶点着色器，预通道里就蹦出
 * 一堆糊在原点的方块，SSAO 与太阳拖影的天空判据跟着一起废。
 *
 * 规矩：**任何半透明的、加性混合的、billboard 的东西，建完材质立刻调这个。**
 *
 * 但要清楚它到此为止：allowOverride = false 只是"不换材质"，对象**照样会被画进
 * 预通道**，只是用的是它自己的着色器 —— 于是 rtNormalDepth 的 xyz 收到的是它的
 * 颜色、w 收到的是它的 alpha。半透明小片子影响有限，铺满全屏的东西（天空穹）
 * 就会把整片天空的 w 写成 1.0，下游一律误判成"一米外有实体"。
 * 覆盖大片屏幕的，还要给对象挂 `userData.skipNormalDepth = true`，
 * PostPipeline 那一趟会把它整个藏掉。
 */
export function MarkNoPrepass(material) {
  if (!material) return material;
  if (Array.isArray(material)) { material.forEach(MarkNoPrepass); return material; }
  material.allowOverride = false;
  return material;
}

const QUALITY_PRESETS = {
  // 抗锯齿分工：taa 是 medium 及以上的**出厂默认**（UE 的默认 AA 也是 TAA），
  // FXAA 只在 taa 关着时兜底。low 出厂不开：两张全分辨率 RGBA16F 历史靶
  // 在集显上是实打实的带宽，low 档的定位就是"能跑"。
  // 但这一位只是默认值不是上限 —— 画质面板可以运行时开关（SetTaaEnabled），
  // low 档玩家想要也给得了，靶到那时候才建。
  low:    { ssao: false, bloomLevels: 4, godrays: false, msaa: 0, motionBlur: false, aoScale: 0.5, sharpen: 0.14, taa: false },
  medium: { ssao: true,  bloomLevels: 5, godrays: true,  msaa: 0, motionBlur: true,  aoScale: 0.6, sharpen: 0.18, taa: true },
  // high 的抗锯齿由 TAA 承担。超宽屏再给 RGBA16F 主靶叠 4×MSAA 会多占
  // 上百 MB 显存并重复抗锯齿；把 4× 留给主动选择 ultra 的玩家
  // （ultra 是 MSAA 喂更干净的几何边给 TAA，两层叠加不冲突，只是贵）。
  high:   { ssao: true,  bloomLevels: 6, godrays: true,  msaa: 0, motionBlur: true,  aoScale: 0.75, sharpen: 0.22, taa: true },
  ultra:  { ssao: true,  bloomLevels: 6, godrays: true,  msaa: 4, motionBlur: true,  aoScale: 1.0, sharpen: 0.22, taa: true },
};

export class PostPipeline {
  constructor(renderer, { width, height, quality = "high", destruction = null } = {}) {
    this.renderer = renderer;
    this.quality = QUALITY_PRESETS[quality] ? quality : "high";
    this.preset = { ...QUALITY_PRESETS[this.quality] };
    this.frame = 0;
    this.width = Math.max(2, width | 0);
    this.height = Math.max(2, height | 0);

    // 半浮点渲染目标是整条链的地基：没有 HDR 就没有真正的泛光与曝光。
    // WebGL2 下 EXT_color_buffer_float / half_float 缺一不可，缺了就降级到 8 位，
    // 画面会平但不至于黑屏。
    const gl = renderer.getContext();
    const hasFloatRt = !!(gl.getExtension("EXT_color_buffer_float")
      || gl.getExtension("EXT_color_buffer_half_float"));
    this.hdrType = hasFloatRt ? THREE.HalfFloatType : THREE.UnsignedByteType;
    this.hdrCapable = hasFloatRt;

    this.normalDepthMaterial = MakeNormalDepthMaterial(destruction);
    this._skipScratch = [];            // _CollectSkipped 的复用数组，别每帧 new
    this.quadScene = new THREE.Scene();
    this.quadMesh = new THREE.Mesh(QUAD_GEOMETRY, null);
    this.quadMesh.frustumCulled = false;
    this.quadScene.add(this.quadMesh);

    this.uniformsAo = {
      uNormalDepth: { value: null }, uResolution: { value: new THREE.Vector2() },
      // 半径 0.52 / 强度 1.20。1.85 是上一轮的补偿值：那时候 AO 图被
      // Script_Main 喂错分辨率、整张错位放大 1.333 倍，看不见暗带就一路往上抬。
      // 采样位置修正之后再留 1.85 会把墙角压成一团死黑，退回 1.20。
      // 半径收小是为了让暗带贴根而不是整墙发灰。
      uProjection: { value: new THREE.Matrix4() }, uRadius: { value: 0.52 },
      uBias: { value: 0.030 }, uIntensity: { value: 1.20 }, uFrame: { value: 0 },
      uProjScale: { value: new THREE.Vector2(1, 1) },
    };
    this.matAo = this._Mat(FRAG_SSAO, this.uniformsAo);
    this.uniformsAoBlur = {
      uAo: { value: null }, uTexel: { value: new THREE.Vector2() },
      uDirection: { value: new THREE.Vector2(1, 0) },
    };
    this.matAoBlur = this._Mat(FRAG_AO_BLUR, this.uniformsAoBlur);

    this.uniformsBright = {
      uSource: { value: null }, uNormalDepth: { value: null },
      uThreshold: { value: 1.18 }, uKnee: { value: 0.55 }, uClamp: { value: 40 },
      uPackSky: { value: 0 },
    };
    this.matBright = this._Mat(FRAG_BRIGHT, this.uniformsBright);
    this.uniformsDown = { uSource: { value: null }, uTexel: { value: new THREE.Vector2() } };
    this.matDown = this._Mat(FRAG_DOWNSAMPLE, this.uniformsDown);
    this.uniformsUp = {
      uSource: { value: null }, uPrevious: { value: null },
      uTexel: { value: new THREE.Vector2() }, uRadius: { value: 1.0 },
    };
    this.matUp = this._Mat(FRAG_UPSAMPLE, this.uniformsUp);

    this.uniformsGod = {
      uBright: { value: null },
      uSunUv: { value: new THREE.Vector2(0.5, 0.8) }, uDensity: { value: 0.52 },
      uWeight: { value: 3.0 }, uFrame: { value: 0 },
    };
    this.matGod = this._Mat(FRAG_GODRAYS, this.uniformsGod);

    this.uniformsTaa = {
      uCurrent: { value: null }, uHistory: { value: null }, uNormalDepth: { value: null },
      uTexel: { value: new THREE.Vector2() }, uResolution: { value: new THREE.Vector2() },
      uWeights: { value: new Array(9).fill(1 / 9) },
      uCurrentWeight: { value: TAA_CURRENT_FRAME_WEIGHT },
      uHasHistory: { value: 0 },
      uInvView: { value: new THREE.Matrix4() },
      uPrevViewProjection: { value: new THREE.Matrix4() },
      uProjScale: { value: new THREE.Vector2(1, 1) },
    };
    this.matTaa = this._Mat(FRAG_TAA, this.uniformsTaa);
    // 出厂值来自画质档，但**运行时状态是这一位**（画质面板走 SetTaaEnabled 改它）。
    // 历史靶按它建，不按 preset 建 —— 否则 low 档打开开关也没有靶可写。
    this.taaEnabled = !!this.preset.taa;
    this.taaFlip = false;
    this.hasTaaHistory = false;
    this.taaWasActive = false;
    // 抖动前投影矩阵第三列 x/y 的原值，主场景画完立刻还原
    this.savedProj8 = 0;
    this.savedProj9 = 0;

    this.uniformsComposite = {
      uHdr: { value: null }, uBloom: { value: null }, uGod: { value: null },
      uNormalDepth: { value: null }, uResolution: { value: new THREE.Vector2() },
      uExposure: { value: 1.0 }, uBloomStrength: { value: 0.55 }, uGodStrength: { value: 0.0 },
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
      uFogDensity: { value: 0.013 }, uFogFalloff: { value: 18 }, uFogBase: { value: 0 },
      uFogMax: { value: 0.94 },
      uFogColorSky: { value: new THREE.Vector3(0.62, 0.64, 0.68) },
      uFogColorGround: { value: new THREE.Vector3(0.42, 0.38, 0.33) },
      uFogSunGain: { value: 0.28 },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunColorFog: { value: new THREE.Vector3(1, 0.92, 0.78) },
      uDepthDesat: { value: 0.48 }, uDepthFlatten: { value: 0.14 },
      // 暗部往青蓝推、亮部往暖黄推。幅度看着小，但它作用在**每一个像素**上：
      // 实测把街景阴影的 B−R 从 +3 拉到 +12，中性水泥/石头的 RGB 不再相等。
      // 别再加大：超过 1.20/0.86 这一档，青砖会开始读成蓝砖，史实色 #7E8388 就走样了。
      uShadowTint: { value: new THREE.Vector3(0.855, 0.975, 1.170) },
      uHighlightTint: { value: new THREE.Vector3(1.105, 1.015, 0.880) },
      uSplitShadow: { value: 1.0 }, uSplitHighlight: { value: 1.0 },
    };
    this.matComposite = this._Mat(FRAG_COMPOSITE, this.uniformsComposite);

    this.uniformsFxaa = {
      uSource: { value: null }, uTexel: { value: new THREE.Vector2() },
      uSharpen: { value: this.preset.sharpen }, uFxaa: { value: 1 },
    };
    this.matFxaa = this._Mat(FRAG_FXAA, this.uniformsFxaa);

    this.uniformsDebug = {
      uSource: { value: null }, uMode: { value: 4 }, uUnavailable: { value: 0 },
      uInvView: { value: new THREE.Matrix4() }, uProjScale: { value: new THREE.Vector2(1, 1) },
      uFogDensity: { value: 0 }, uFogFalloff: { value: 18 }, uFogBase: { value: 0 }, uFogMax: { value: 0.94 },
      uDofStrength: { value: 0 }, uDofFocus: { value: 1.5 }, uDofRange: { value: 2.8 },
      uPrevViewProjection: { value: new THREE.Matrix4() }, uResolution: { value: new THREE.Vector2(1, 1) }, uHasPrev: { value: 0 },
    };
    this.matDebug = this._Mat(FRAG_DEBUG_VIEW, this.uniformsDebug);
    // final 之外的值只在开发用面板明确要求时才生效；正式出图完全不走这里。
    this.debugView = "final";
    this.debugGi = null;
    this.debugInjected = false;

    this.prevViewProjection = new THREE.Matrix4();
    this.sunWorld = new THREE.Vector3();
    this.hasPrev = false;
    // 性能剖析器（Script_Profiler）。开着时 Render 在每个 pass 两侧 GpuPush/GpuPop，
    // 由 FrameProfiler.Enable/Disable 挂上与摘下；平时是 null，逐 pass 只多一次判空。
    this.profiler = null;
    this.targets = {};
    this.bloomMips = [];
    this.SetSize(this.width, this.height);
  }

  _Mat(fragmentShader, uniforms) {
    return new THREE.ShaderMaterial({
      uniforms, vertexShader: VERT_QUAD, fragmentShader,
      depthTest: false, depthWrite: false,
    });
  }

  _MakeRt(w, h, options = {}) {
    const rt = new THREE.WebGLRenderTarget(Math.max(1, w | 0), Math.max(1, h | 0), {
      type: options.type ?? this.hdrType,
      format: THREE.RGBAFormat,
      minFilter: options.minFilter ?? THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      generateMipmaps: false,
      depthBuffer: options.depthBuffer ?? false,
      stencilBuffer: false,
      samples: options.samples ?? 0,
    });
    rt.texture.colorSpace = THREE.NoColorSpace;   // 全链路线性，最后一 pass 才转 sRGB
    rt.texture.wrapS = THREE.ClampToEdgeWrapping;
    rt.texture.wrapT = THREE.ClampToEdgeWrapping;
    return rt;
  }

  SetSize(width, height) {
    this.width = Math.max(2, width | 0);
    this.height = Math.max(2, height | 0);
    const w = this.width, h = this.height;
    for (const rt of Object.values(this.targets)) rt.dispose();
    for (const rt of this.bloomMips) rt.dispose();
    this.targets = {};
    this.bloomMips = [];

    this.targets.normalDepth = this._MakeRt(w, h, { depthBuffer: true, minFilter: THREE.NearestFilter });
    this.targets.hdr = this._MakeRt(w, h, { depthBuffer: true, samples: this.preset.msaa });
    const aw = Math.max(2, Math.round(w * this.preset.aoScale));
    const ah = Math.max(2, Math.round(h * this.preset.aoScale));
    this.targets.ao = this._MakeRt(aw, ah, { type: THREE.UnsignedByteType });
    this.targets.aoTmp = this._MakeRt(aw, ah, { type: THREE.UnsignedByteType });
    this.targets.aoBlur = this._MakeRt(aw, ah, { type: THREE.UnsignedByteType });
    this.targets.bright = this._MakeRt(w >> 1, h >> 1);
    // 太阳拖影是方向性模糊，放大后本来就没有高频细节。常规 1600×900 仍走 1/4
    // （360p 量级）；超宽/4K 不再让它跟像素数无上限增长，封顶约 9.6 万像素。
    // 用户的 3394×1348 截图因此从 848×337 收到约 491×195，宽高比不变。
    let godW = Math.max(2, w >> 2), godH = Math.max(2, h >> 2);
    const godMaxPixels = 96000;
    const godScale = Math.min(1, Math.sqrt(godMaxPixels / (godW * godH)));
    godW = Math.max(2, Math.round(godW * godScale));
    godH = Math.max(2, Math.round(godH * godScale));
    this.targets.god = this._MakeRt(godW, godH);
    this.targets.ldr = this._MakeRt(w, h, { type: THREE.UnsignedByteType });
    // TAA 历史乒乓：全分辨率 HDR。尺寸一变历史就作废（uv 对不上位），
    // taaFlip/hasTaaHistory 在下面统一清。
    if (this.taaEnabled) {
      this.targets.taaA = this._MakeRt(w, h);
      this.targets.taaB = this._MakeRt(w, h);
    }
    this.taaFlip = false;
    this.hasTaaHistory = false;
    this.taaWasActive = false;

    let mw = w >> 1, mh = h >> 1;
    for (let i = 0; i < this.preset.bloomLevels; i += 1) {
      mw = Math.max(2, mw >> 1); mh = Math.max(2, mh >> 1);
      this.bloomMips.push(this._MakeRt(mw, mh));
      // 升采样要往回叠，每一级都得有一份"已有内容"的副本
      this.bloomMips.push(this._MakeRt(mw, mh));
    }
    this.hasPrev = false;
  }

  /**
   * 运行时开关 TAA（画质面板用）。
   *
   * 与画质档不同，这一项**可以热切** —— 它不像 MSAA 采样数 / AO 靶比例 / 泛光级数
   * 那样进了建靶参数，只是多两张全分辨率历史靶。所以走 GI 那条惰性构造的先例：
   * 出厂关着的档（low）根本不建靶，玩家真打开时才建，关掉立刻还显存。
   *
   * 关掉再打开必须丢历史：TAA 关着的那几十帧没人往历史靶里写，里面躺的是
   * 上一次关掉前那一帧。不清的话重新打开的第一帧会跟一张几十秒前的画面混合 ——
   * 邻域裁剪能把它压回去，但那一帧仍会看见一层脏东西。
   */
  SetTaaEnabled(on) {
    const want = !!on;
    if (want === this.taaEnabled) return;
    this.taaEnabled = want;
    if (want) {
      if (!this.targets.taaA) {
        this.targets.taaA = this._MakeRt(this.width, this.height);
        this.targets.taaB = this._MakeRt(this.width, this.height);
      }
    } else if (this.targets.taaA) {
      this.targets.taaA.dispose();
      this.targets.taaB.dispose();
      delete this.targets.taaA;
      delete this.targets.taaB;
    }
    this.taaFlip = false;
    this.hasTaaHistory = false;
    this.taaWasActive = false;
  }

  /**
   * 镜头硬切（过场换机位、菜单进关这类瞬移）时调：丢掉 TAA 历史与
   * 运动模糊的上一帧矩阵。不调也不会坏 —— 邻域裁剪会在一两帧内把
   * 错误历史压回去，只是切换瞬间有一帧轻微的溶解感；UE 对应的是
   * camera cut 标记，语义相同。
   */
  NotifyCameraCut() {
    this.hasTaaHistory = false;
    this.hasPrev = false;
  }

  /** 屏幕空间 AO 贴图 —— 交给 Materials 层注入 MeshStandardMaterial 的间接光。 */
  get AoTexture() { return this.targets.aoBlur.texture; }

  /**
   * 深度法线预通道（RGBA16F：xyz = 视空间法线，w = 线性视深度）。全分辨率，
   * 与主 HDR 靶同尺寸，所以采样直接用 gl_FragCoord.xy / (width, height)。
   * 粒子层要它做软粒子，也要它判断"这一像素背后是不是天空"——
   * 合成 pass 的雾明写跳过 w = 0 的天空，粒子得自己接上那一半。
   */
  get NormalDepthTexture() { return this.targets.normalDepth.texture; }

  /** 合成 pass 实际采样的那一级泛光靶。调试面板与 uBloom 必须指同一张。 */
  get BloomTarget() {
    return this.bloomMips[this.preset.bloomLevels > 1 ? 1 : 0] || null;
  }

  /**
   * 让独立的渲染调试面板选择当前帧最终送往屏幕的中间结果。
   * 这个状态故意不进玩家设置，也不影响正式合成链，只在面板存活期间保留。
   */
  SetDebugView(view = "final", gi = null, injected = null) {
    this.debugView = view || "final";
    this.debugGi = gi || null;
    // 材质假彩色的可用性看「材质注了没有」（library.gi 那包 uniforms），
    // 不看 ProbeVolume：GI 出厂默认关时探针体不构造，但调试层照样编在材质里。
    // 不传第三参的旧调用点退回老代理（有探针体 = 注入过）。
    this.debugInjected = injected == null ? !!gi : !!injected;
  }

  GetDebugView() { return this.debugView; }

  _GetDebugSource() {
    const T = this.targets;
    switch (this.debugView) {
      case "normal": return { texture: T.normalDepth.texture, mode: 0 };
      case "depth": return { texture: T.normalDepth.texture, mode: 1 };
      case "ao": return { texture: T.ao.texture, mode: 2, unavailable: !this.preset.ssao };
      case "aoBlur": return { texture: T.aoBlur.texture, mode: 2, unavailable: !this.preset.ssao };
      case "hdr": return { texture: T.hdr.texture, mode: 4 };
      // Bloom 提取与最终合成分开看：前者用于判断阈值/软膝是否切掉了该进的亮部，
      // 后者用于判断多级 tent 叠加后的覆盖范围和强度。
      case "bloomExtract": return { texture: T.bright.texture, mode: 4 };
      // 送屏的要与合成 pass 真正吃的是同一张（见 uBloom 那一行）：bloomMips[0]
      // 只是第 0 级的降采样，还没叠上更小几级的 tent 放大，看着比实际泛光弱一大截。
      case "bloom": return { texture: this.BloomTarget?.texture, mode: 4 };
      // 这两项没有独立 RT：Debug pass 从与 Composite 同一张 NormalDepth 靶取深度，
      // 用同一套 uniforms 实时重算效果系数。这样不会为纯调试多占一张全分辨率显存靶。
      case "fog": return { texture: T.normalDepth.texture, mode: 6 };
      case "dof": return { texture: T.normalDepth.texture, mode: 7 };
      case "motionVector": return { texture: T.normalDepth.texture, mode: 8 };
      // enabled 为 false 时图集是上一次收敛留下的陈旧内容，或者干脆一片全黑
      // （画质档从没开过 GI 就是这一种）。这种情况要显式报"不可用"斜纹，
      // 而不是把一张黑图送到屏幕上 —— 后者跟"渲染坏了"长得一模一样。
      case "giIrradiance": return {
        texture: this.debugGi?.irradiance?.[this.debugGi.pingPong]?.texture,
        mode: 4, unavailable: !this.debugGi?.enabled,
      };
      case "giDistance": return {
        texture: this.debugGi?.distanceMoments?.[this.debugGi.pingPong]?.texture,
        mode: 3, unavailable: !this.debugGi?.enabled,
      };
      // 材质通道假彩色：真正的换色发生在材质注入里（Script_Materials 按
      // uGiDebugView 把该通道当颜色写进 hdr 靶），这里只负责把 hdr 靶
      // 以 0-1 直通模式送屏。谁设 uGiDebugView：Debug Rendering 面板
      // （SetView 同步材质 uniform 与这里的视图名）或 ?giView= 直连。
      // 可用性看 debugInjected（材质里有没有调试层）：low 档材质没有注入，
      // 屏幕上会是原样 HDR，画不可用斜纹。GI 出厂默认关（2026-08-26 起）时
      // ProbeVolume 不构造，但调试层照样编在材质里 —— 这些视图必须照常能用，
      // 所以不能再拿 debugGi 缺席当"未注入"的代理。
      case "baseColor": case "roughness": case "metalness": case "shadow":
        return { texture: T.hdr.texture, mode: 5, unavailable: !this.debugInjected };
      // 光照分量是线性 HDR；沿用 hdr 的 Reinhard + sRGB 可视化，别把高亮全钳白。
      case "diffuseLighting": case "specularLighting": case "reflection": case "indirectLighting":
        return { texture: T.hdr.texture, mode: 4, unavailable: !this.debugInjected };
      // GI 的世界空间视图同理只要求材质注入过：探针体关着时 giWorld 显示的
      // 是材质**实际在用**的间接辐照度（天空 IBL 回退），giConfidence 恒 0
      // （黑 = 没有探针 GI）—— 都是准确信息，不是"不可用"。
      case "giWorld": case "giConfidence":
        return { texture: T.hdr.texture, mode: 5, unavailable: !this.debugInjected };
      default: return null;
    }
  }

  /**
   * 收集这一帧要在预通道里整个藏掉的对象（userData.skipNormalDepth === true）。
   *
   * 每帧遍历一次场景图：这一趟本来就要被渲染器自己遍历好几遍，多一次几十微秒，
   * 换来的是"挂上去就生效"——缓存一份列表的话，换关重建场景那一帧必然是脏的，
   * 而这个 bug 的表现（天上一个黑洞）恰恰要花一小时才定位得到。
   * 只收当前可见的：本来就藏着的对象不该被这里"帮忙"打开。
   */
  _CollectSkipped(scene) {
    const list = this._skipScratch;
    list.length = 0;
    scene.traverse((object) => {
      if (object.visible && object.userData && object.userData.skipNormalDepth) list.push(object);
    });
    return list;
  }

  _Blit(material, target) {
    this.quadMesh.material = material;
    this.renderer.setRenderTarget(target ?? null);
    this.renderer.render(this.quadScene, QUAD_CAMERA);
  }

  /**
   * 跑完整一帧。
   * @param {THREE.Scene} scene
   * @param {THREE.PerspectiveCamera} camera
   * @param {object} options sunDirection / exposure / damage / fade / bloom / godStrength / dt
   */
  Render(scene, camera, options = {}) {
    const renderer = this.renderer;
    const T = this.targets;
    this.frame += 1;
    const frame = this.frame;
    // 剖析：每个 pass 两侧一对 GpuPush/GpuPop（GPU 段计时 + 提交 CPU 归账）。
    // 阴影图烘在预通道那次 render 内部，由 FrameProfiler 包的 shadowMap.render
    // 自己拆段，这里不用管。
    const P = this.profiler;

    const tanHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5));
    const projScaleY = 1 / tanHalf;
    const projScaleX = projScaleY / camera.aspect;

    // --- 0) TAA 子像素抖动：Halton(2,3) 八相位（UE r.TemporalAASamples=8）---
    // 直接改投影矩阵第三列的 x/y：e[8] 加 δ 会让 NDC 平移 -δ（透视除法 w=-z），
    // 即整幅画面平移 -jitter 像素 —— 等价于本帧采样点落在"像素中心 + jitter"。
    // 预通道与主场景同用这份矩阵（深度与颜色必须同一套抖动，SSAO 拷的投影
    // 矩阵也是它，自洽）；主场景画完立刻还原，太阳投影、prevViewProjection
    // 与运动模糊拿到的都是干净矩阵。
    // options.taa === false 是**逐次调用**的escape hatch（A/B 像素对比测试用），
    // 与面板那一位（taaEnabled）是两回事：前者不动状态，只是这一趟不跑。
    const taaActive = !!(this.taaEnabled && this.targets.taaA) && options.taa !== false;
    // 中断过一趟就丢历史：那几帧没人写历史靶，里面是中断前的旧画面。
    if (!taaActive && this.taaWasActive) this.hasTaaHistory = false;
    this.taaWasActive = taaActive;
    let jitterX = 0, jitterY = 0;
    if (taaActive) {
      const jitter = TAA_JITTER[frame % TAA_SAMPLES];
      jitterX = jitter[0];
      jitterY = jitter[1];
      const pe = camera.projectionMatrix.elements;
      this.savedProj8 = pe[8];
      this.savedProj9 = pe[9];
      pe[8] += (jitterX * 2) / this.width;
      pe[9] += (jitterY * 2) / this.height;
    }

    // --- 1) 深度法线预通道 ---
    //
    // 事故（这一条是好几个"远景不对劲"的共同根因）：allowOverride = false 只保证
    // **不被换材质**，它照样会被画进这一趟。天空穹正是这样用自己那套着色器
    // 写进 rtNormalDepth 的：xyz 是天空颜色（当法线用是纯垃圾），w 是它的
    // 不透明度 1.0 —— 于是整片天空在下游看起来像"一米外有东西"。
    // 后果一路传下去：SSAO 拿天空色当法线算遮蔽；合成 pass 的雾判据
    // `nd.w > 0.0` 对天空成立（只是雾量≈0，蒙混过关）；而粒子层用
    // `nd.w > 0.001` 判断"背景是不是天空"时全判反 —— 软粒子把天空前的烟
    // 整片抹掉（clamp((1.0 − 186)/0.45) = 0），大气透视也补不上去，
    // 二百米外的黑烟柱就成了天上一个越长越大的黑洞。
    // Script_Sky 早就标了 userData.skipNormalDepth，只是从来没人读它。
    if (P) P.GpuPush("prepass");
    const skipped = this._CollectSkipped(scene);
    for (const object of skipped) object.visible = false;
    const prevBackground = scene.background;
    const prevOverride = scene.overrideMaterial;
    scene.background = null;
    scene.overrideMaterial = this.normalDepthMaterial;
    renderer.setRenderTarget(T.normalDepth);
    renderer.setClearColor(0x000000, 0);
    renderer.clear(true, true, false);
    renderer.render(scene, camera);
    scene.overrideMaterial = prevOverride;
    scene.background = prevBackground;
    for (const object of skipped) object.visible = true;
    if (P) P.GpuPop();

    // --- 2) SSAO ---
    if (this.preset.ssao) {
      if (P) P.GpuPush("ssao");
      this.uniformsAo.uNormalDepth.value = T.normalDepth.texture;
      this.uniformsAo.uResolution.value.set(T.ao.width, T.ao.height);
      this.uniformsAo.uProjection.value.copy(camera.projectionMatrix);
      this.uniformsAo.uProjScale.value.set(projScaleX, projScaleY);
      this.uniformsAo.uFrame.value = frame;
      // 调用点（Main / Probe）从来不传这两项，所以这里的默认值就是全场的实际值。
      // 0.52 → 0.60：抬了太阳之后阴影侧不再靠 IBL 提亮，AO 的大半径要够到墙角；
      // 1.20 → 1.50：接触带的 bias 修好之后强度才真的落在贴根那一圈，
      // 不会像以前那样整墙均匀发灰。
      this.uniformsAo.uRadius.value = options.aoRadius ?? 0.60;
      this.uniformsAo.uIntensity.value = options.aoIntensity ?? 1.85;
      this._Blit(this.matAo, T.ao);

      this.uniformsAoBlur.uTexel.value.set(1 / T.ao.width, 1 / T.ao.height);
      this.uniformsAoBlur.uAo.value = T.ao.texture;
      this.uniformsAoBlur.uDirection.value.set(1, 0);
      this._Blit(this.matAoBlur, T.aoTmp);
      this.uniformsAoBlur.uAo.value = T.aoTmp.texture;
      this.uniformsAoBlur.uDirection.value.set(0, 1);
      this._Blit(this.matAoBlur, T.aoBlur);
      if (P) P.GpuPop();
    }

    // --- 3) 主场景（HDR，AO 已在材质里注入）---
    if (P) P.GpuPush("main");
    renderer.setRenderTarget(T.hdr);
    renderer.setClearColor(0x000000, 1);
    renderer.clear(true, true, false);
    renderer.render(scene, camera);
    if (P) P.GpuPop();

    // --- 3.5) TAA 时域解算：从这里起下游全部吃解算后的画面 ---
    let sceneColor = T.hdr;
    if (taaActive) {
      const pe = camera.projectionMatrix.elements;
      pe[8] = this.savedProj8;
      pe[9] = this.savedProj9;

      if (P) P.GpuPush("taa");
      const read = this.taaFlip ? T.taaB : T.taaA;
      const write = this.taaFlip ? T.taaA : T.taaB;
      const UT = this.uniformsTaa;
      UT.uCurrent.value = T.hdr.texture;
      UT.uHistory.value = read.texture;
      UT.uNormalDepth.value = T.normalDepth.texture;
      UT.uTexel.value.set(1 / this.width, 1 / this.height);
      UT.uResolution.value.set(this.width, this.height);
      UT.uProjScale.value.set(projScaleX, projScaleY);
      UT.uInvView.value.copy(camera.matrixWorld);
      UT.uPrevViewProjection.value.copy(this.prevViewProjection);
      UT.uHasHistory.value = this.hasTaaHistory && this.hasPrev ? 1 : 0;
      // 当前帧 3x3 滤波权重：Blackman-Harris 3.3 的高斯拟合 exp(-2.29 r²)，
      // 围绕本帧子像素采样位置（offset + jitter）重定心。权重只依赖 jitter，
      // 每帧在 CPU 上算九个数，比在着色器里逐像素跑九次 exp 便宜。
      const weights = UT.uWeights.value;
      let weightSum = 0;
      for (let i = 0; i < 9; i += 1) {
        const dx = TAA_OFFSETS[i][0] + jitterX;
        const dy = TAA_OFFSETS[i][1] + jitterY;
        const w = Math.exp(-TAA_FILTER_GAUSSIAN_K * (dx * dx + dy * dy));
        weights[i] = w;
        weightSum += w;
      }
      for (let i = 0; i < 9; i += 1) weights[i] /= weightSum;
      this._Blit(this.matTaa, write);
      this.taaFlip = !this.taaFlip;
      this.hasTaaHistory = true;
      sceneColor = write;
      if (P) P.GpuPop();
    }

    // 在亮部提取前就算好这帧会不会跑太阳拖影，因为亮部图的 alpha
    // 只在这种情况下需要顺手打包天空遮挡。旧版到第 5 pass 才投影太阳，
    // 亮部 pass 无法知道是否值得多读一张深度图。
    let godStrength = options.godStrength ?? 0;
    let godActive = false;
    if (this.preset.godrays && godStrength > 0 && options.sunDirection) {
      // 太阳只是方向，拿一个相机前方的有限点做屏幕投影即可。点必须留在远裁面
      // 以内；界河关卡 far=460，旧版写死 600 会让 ndc.z 越界，fallback 永远不开。
      const sunProjectionDistance = Math.min(600, camera.far * 0.9);
      const ndc = this.sunWorld.copy(options.sunDirection).multiplyScalar(sunProjectionDistance)
        .add(camera.position).project(camera);
      const edge = Math.max(Math.abs(ndc.x), Math.abs(ndc.y));
      if (ndc.z < 1 && edge < 1.4) {
        godStrength *= THREE.MathUtils.clamp(1.4 - edge, 0, 1);
        godActive = godStrength > 0.0001;
      }
    }
    if (!godActive) godStrength = 0;

    // --- 4) 泛光 ---
    if (P) P.GpuPush("bloom");
    this.uniformsBright.uSource.value = sceneColor.texture;
    this.uniformsBright.uNormalDepth.value = T.normalDepth.texture;
    this.uniformsBright.uPackSky.value = godActive ? 1 : 0;
    this.uniformsBright.uThreshold.value = options.bloomThreshold ?? 1.18;
    this._Blit(this.matBright, T.bright);

    const levels = this.preset.bloomLevels;
    let source = T.bright;
    for (let i = 0; i < levels; i += 1) {
      const dst = this.bloomMips[i * 2];
      this.uniformsDown.uSource.value = source.texture;
      this.uniformsDown.uTexel.value.set(1 / source.width, 1 / source.height);
      this._Blit(this.matDown, dst);
      source = dst;
    }
    // 从最小一级往回叠：每一级 = 本级降采样结果 + 上一级(更小)的 tent 放大
    let carried = this.bloomMips[(levels - 1) * 2];
    for (let i = levels - 2; i >= 0; i -= 1) {
      const same = this.bloomMips[i * 2];
      const dst = this.bloomMips[i * 2 + 1];
      this.uniformsUp.uSource.value = carried.texture;
      this.uniformsUp.uPrevious.value = same.texture;
      this.uniformsUp.uTexel.value.set(1 / dst.width, 1 / dst.height);
      this._Blit(this.matUp, dst);
      carried = dst;
    }
    if (P) P.GpuPop();

    // --- 5) 太阳方向拖影（便宜的屏幕空间 fallback）---
    if (godActive) {
      if (P) P.GpuPush("god");
      this.uniformsGod.uBright.value = T.bright.texture;
      this.uniformsGod.uSunUv.value.set(this.sunWorld.x * 0.5 + 0.5, this.sunWorld.y * 0.5 + 0.5);
      this.uniformsGod.uFrame.value = frame;
      this._Blit(this.matGod, T.god);
      if (P) P.GpuPop();
    }

    // --- 6) 合成 ---
    if (P) P.GpuPush("composite");
    const U = this.uniformsComposite;
    U.uHdr.value = sceneColor.texture;
    U.uBloom.value = this.BloomTarget.texture;
    U.uGod.value = T.god.texture;
    U.uNormalDepth.value = T.normalDepth.texture;
    U.uResolution.value.set(this.width, this.height);
    U.uExposure.value = options.exposure ?? 1.0;
    U.uBloomStrength.value = options.bloom ?? 0.5;
    U.uGodStrength.value = godStrength;
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
    U.uFrame.value = frame;
    U.uProjScale.value.set(projScaleX, projScaleY);
    U.uInvView.value.copy(camera.matrixWorld);
    U.uMotionScale.value = this.preset.motionBlur && this.hasPrev ? (options.motionBlur ?? 0.15) : 0;
    U.uPrevViewProjection.value.copy(this.prevViewProjection);
    this._Blit(this.matComposite, T.ldr);
    if (P) P.GpuPop();

    // --- 7) FXAA + 锐化 -> 屏幕；调试时改为展示指定的中间靶 ---
    if (P) P.GpuPush("fxaa");
    const debug = this._GetDebugSource();
    if (debug) {
      // 雾量 / CoC 调试视图必须复用刚刚送进 Composite 的本帧参数。不要另存一份
      // "调试参数"：时段预设切换一帧后两份数字就会分叉，面板反而成了假信息。
      const DU = this.uniformsDebug;
      DU.uInvView.value.copy(U.uInvView.value);
      DU.uProjScale.value.copy(U.uProjScale.value);
      DU.uFogDensity.value = U.uFogDensity.value;
      DU.uFogFalloff.value = U.uFogFalloff.value;
      DU.uFogBase.value = U.uFogBase.value;
      DU.uFogMax.value = U.uFogMax.value;
      DU.uDofStrength.value = U.uDofStrength.value;
      DU.uDofFocus.value = U.uDofFocus.value;
      DU.uDofRange.value = U.uDofRange.value;
      DU.uPrevViewProjection.value.copy(U.uPrevViewProjection.value);
      DU.uResolution.value.copy(U.uResolution.value);
      DU.uHasPrev.value = this.hasPrev ? 1 : 0;
      this.uniformsDebug.uSource.value = debug.texture || T.ldr.texture;
      this.uniformsDebug.uMode.value = debug.mode;
      this.uniformsDebug.uUnavailable.value = debug.unavailable || !debug.texture ? 1 : 0;
      this._Blit(this.matDebug, null);
    } else {
      this.uniformsFxaa.uSource.value = T.ldr.texture;
      this.uniformsFxaa.uTexel.value.set(1 / this.width, 1 / this.height);
      this.uniformsFxaa.uSharpen.value = options.sharpen ?? this.preset.sharpen;
      this.uniformsFxaa.uFxaa.value = taaActive ? 0 : 1;
      this._Blit(this.matFxaa, null);
    }
    if (P) P.GpuPop();

    // 记录本帧 viewProjection，下一帧的运动模糊要用
    this.prevViewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.hasPrev = true;
  }

  Dispose() {
    for (const rt of Object.values(this.targets)) rt.dispose();
    for (const rt of this.bloomMips) rt.dispose();
    for (const m of [this.matAo, this.matAoBlur, this.matBright, this.matDown,
      this.matUp, this.matGod, this.matTaa, this.matComposite, this.matFxaa,
      this.matDebug, this.normalDepthMaterial]) m.dispose();
  }
}

export const POST_QUALITY_KEYS = Object.keys(QUALITY_PRESETS);
