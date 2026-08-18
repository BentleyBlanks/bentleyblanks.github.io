// 《血战台儿庄》自研后处理管线。
//
// 为什么自己写：仓库里 vendor 的 three 只有 build/，**没有 examples/jsm**，
// 没有 EffectComposer / UnrealBloomPass / SSAOPass 可用。所以整条链子从
// WebGLRenderTarget + 全屏四边形手搭。好处是顺序完全可控（AO 只压间接光、
// 泛光在 tonemap 之前、抗锯齿在 sRGB 之后）—— 这三条顺序错一条画面就"塑料"。
//
// 帧结构：
//   1) 深度法线预通道  -> rtNormalDepth (RGBA16F: xyz=视空间法线, w=线性深度)
//   2) SSAO + 双边模糊 -> rtAoBlur (半分辨率)
//   3) 主场景 (MSAA)   -> rtHdr    (RGBA16F, AO 由 onBeforeCompile 注入到间接光)
//   4) 亮部提取 + 逐级降/升采样(tent) -> 泛光
//   5) 体积光（屏幕空间径向模糊，太阳在屏内才跑）
//   6) 合成：运动模糊 -> 曝光 -> ACES -> 调色 -> 暗角 -> 色差 -> 颗粒 -> sRGB
//   7) FXAA + 锐化 -> 屏幕
//
// 决定论：颗粒/抖动全部用 frameIndex 驱动，不用 Math.random —— 视觉审查靠逐轮
// 截图比对，画面自己在抖的话根本判断不了"这一版比上一版好"。

import * as THREE from "three";

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
// 泛光抖动、体积光步进、颗粒都用它。
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
function MakeNormalDepthMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uFar: { value: 500 } },
    vertexShader: /* glsl */`
      #include <common>
      varying vec3 vViewNormal;
      varying float vViewDepth;
      void main() {
        #include <beginnormal_vertex>
        #include <morphinstance_vertex>
        #include <morphnormal_vertex>
        #include <defaultnormal_vertex>
        vViewNormal = normalize(transformedNormal);
        #include <begin_vertex>
        #include <morphtarget_vertex>
        #include <project_vertex>
        vViewDepth = -mvPosition.z;
      }
    `,
    fragmentShader: /* glsl */`
      uniform float uFar;
      varying vec3 vViewNormal;
      varying float vViewDepth;
      void main() {
        vec3 n = normalize(vViewNormal);
        if (!gl_FrontFacing) n = -n;
        gl_FragColor = vec4(n, vViewDepth);
      }
    `,
    side: THREE.FrontSide,
  });
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
    float radius = (i < 7) ? uRadius : uRadius * 0.22;
    vec3 samplePos = origin + (tbn * KERNEL[i]) * radius;
    vec4 clip = uProjection * vec4(samplePos, 1.0);
    vec2 suv = (clip.xy / clip.w) * 0.5 + 0.5;
    if (suv.x < 0.0 || suv.x > 1.0 || suv.y < 0.0 || suv.y > 1.0) continue;
    float sceneDepth = texture2D(uNormalDepth, suv).w;
    if (sceneDepth <= 0.0) continue;
    float sampleDepth = -samplePos.z;
    // 范围检查：远处的墙不该给近处的地面投 AO
    float rangeCheck = smoothstep(0.0, 1.0, radius / max(0.0001, abs(depth - sceneDepth)));
    occlusion += (sceneDepth <= sampleDepth - uBias ? 1.0 : 0.0) * rangeCheck;
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
uniform float uThreshold;
uniform float uKnee;
uniform float uClamp;
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
  gl_FragColor = vec4(c * contrib, 1.0);
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

// --- 体积光（屏幕空间径向模糊）---------------------------------------------
const FRAG_GODRAYS = /* glsl */`
uniform sampler2D uBright;
uniform sampler2D uNormalDepth;
uniform vec2 uSunUv;
uniform float uDensity;
uniform float uDecay;
uniform float uWeight;
uniform float uFrame;
varying vec2 vUv;
${GLSL_COMMON}
const int STEPS = 24;
void main() {
  vec2 delta = (vUv - uSunUv) * (uDensity / float(STEPS));
  // 抖动起点：不抖的话 24 步会在画面上排出一圈圈同心条纹
  vec2 uv = vUv - delta * Ign(gl_FragCoord.xy + uFrame * 3.17);
  float illum = 1.0;
  vec3 sum = vec3(0.0);
  for (int i = 0; i < STEPS; i++) {
    vec3 s = texture2D(uBright, uv).rgb;
    // 只有天空（深度为 0 / 极远）才是光源；被砖墙挡住的地方不许透出光柱
    float depth = texture2D(uNormalDepth, uv).w;
    float sky = step(depth, 0.0001) + step(300.0, depth);
    sum += s * illum * clamp(sky, 0.0, 1.0);
    illum *= uDecay;
    uv -= delta;
  }
  gl_FragColor = vec4(sum * uWeight / float(STEPS), 1.0);
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

  // --- 调色：lift/gain + 对比 + 饱和 ---
  color = clamp(color * uGain + uLift, 0.0, 1.0);
  color = clamp((color - 0.5) * uContrast + 0.5, 0.0, 1.0);
  float l = Luma(color);
  color = mix(vec3(l), color, uSaturation);

  // --- 受伤反馈：边缘吃血、中心去色 ---
  if (uDamage > 0.001) {
    float edge = smoothstep(0.06, 0.28, r2);
    color = mix(color, vec3(l * 0.85), uDamage * 0.5);
    color = mix(color, vec3(0.42, 0.03, 0.02), edge * uDamage * 0.85);
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
  vec3 srgb = mix(color * 12.92,
                  1.055 * pow(max(color, vec3(1e-5)), vec3(1.0 / 2.4)) - 0.055,
                  step(0.0031308, color));
  gl_FragColor = vec4(srgb, 1.0);
}
`;

// --- FXAA 3.11 简化版 + 锐化 ------------------------------------------------
const FRAG_FXAA = /* glsl */`
uniform sampler2D uSource;
uniform vec2 uTexel;
uniform float uSharpen;
varying vec2 vUv;
${GLSL_COMMON}

void main() {
  vec3 rgbNW = texture2D(uSource, vUv + vec2(-1.0, -1.0) * uTexel).rgb;
  vec3 rgbNE = texture2D(uSource, vUv + vec2( 1.0, -1.0) * uTexel).rgb;
  vec3 rgbSW = texture2D(uSource, vUv + vec2(-1.0,  1.0) * uTexel).rgb;
  vec3 rgbSE = texture2D(uSource, vUv + vec2( 1.0,  1.0) * uTexel).rgb;
  vec3 rgbM  = texture2D(uSource, vUv).rgb;

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
  vec3 aa = (lB < lMin || lB > lMax) ? rgbA : rgbB;

  // 轻锐化（CAS 的思路简化版）：抗锯齿之后画面必然发肉，补回一点边缘
  if (uSharpen > 0.0) {
    vec3 blur = (rgbNW + rgbNE + rgbSW + rgbSE) * 0.25;
    aa = clamp(aa + (aa - blur) * uSharpen, 0.0, 1.0);
  }
  gl_FragColor = vec4(aa, 1.0);
}
`;

/**
 * 把一份材质排除在深度法线预通道之外。
 *
 * 事故根源：r165 起 `scene.overrideMaterial` 加了 `material.allowOverride` 闸门，
 * 默认 **true** —— 也就是说粒子、贴片（Sprite/Points）、烟、天空穹全都会被
 * 覆盖材质换掉。它们的几何属性对不上覆盖材质的顶点着色器，预通道里就蹦出
 * 一堆糊在原点的方块，SSAO 与体积光的天空判据跟着一起废。
 *
 * 规矩：**任何半透明的、加性混合的、billboard 的东西，建完材质立刻调这个。**
 */
export function MarkNoPrepass(material) {
  if (!material) return material;
  if (Array.isArray(material)) { material.forEach(MarkNoPrepass); return material; }
  material.allowOverride = false;
  return material;
}

const QUALITY_PRESETS = {
  low:    { ssao: false, bloomLevels: 4, godrays: false, msaa: 0, motionBlur: false, aoScale: 0.5, sharpen: 0.14 },
  medium: { ssao: true,  bloomLevels: 5, godrays: true,  msaa: 0, motionBlur: true,  aoScale: 0.6, sharpen: 0.18 },
  high:   { ssao: true,  bloomLevels: 6, godrays: true,  msaa: 4, motionBlur: true,  aoScale: 0.75, sharpen: 0.22 },
  ultra:  { ssao: true,  bloomLevels: 6, godrays: true,  msaa: 4, motionBlur: true,  aoScale: 1.0, sharpen: 0.22 },
};

export class PostPipeline {
  constructor(renderer, { width, height, quality = "high" } = {}) {
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

    this.normalDepthMaterial = MakeNormalDepthMaterial();
    this.quadScene = new THREE.Scene();
    this.quadMesh = new THREE.Mesh(QUAD_GEOMETRY, null);
    this.quadMesh.frustumCulled = false;
    this.quadScene.add(this.quadMesh);

    this.uniformsAo = {
      uNormalDepth: { value: null }, uResolution: { value: new THREE.Vector2() },
      uProjection: { value: new THREE.Matrix4() }, uRadius: { value: 0.78 },
      uBias: { value: 0.030 }, uIntensity: { value: 1.30 }, uFrame: { value: 0 },
      uProjScale: { value: new THREE.Vector2(1, 1) },
    };
    this.matAo = this._Mat(FRAG_SSAO, this.uniformsAo);
    this.uniformsAoBlur = {
      uAo: { value: null }, uTexel: { value: new THREE.Vector2() },
      uDirection: { value: new THREE.Vector2(1, 0) },
    };
    this.matAoBlur = this._Mat(FRAG_AO_BLUR, this.uniformsAoBlur);

    this.uniformsBright = {
      uSource: { value: null }, uThreshold: { value: 1.18 },
      uKnee: { value: 0.55 }, uClamp: { value: 40 },
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
      uBright: { value: null }, uNormalDepth: { value: null },
      uSunUv: { value: new THREE.Vector2(0.5, 0.8) }, uDensity: { value: 0.52 },
      uDecay: { value: 0.972 }, uWeight: { value: 3.0 }, uFrame: { value: 0 },
    };
    this.matGod = this._Mat(FRAG_GODRAYS, this.uniformsGod);

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
      uFogDensity: { value: 0.013 }, uFogFalloff: { value: 18 }, uFogBase: { value: 0 },
      uFogMax: { value: 0.94 },
      uFogColorSky: { value: new THREE.Vector3(0.62, 0.64, 0.68) },
      uFogColorGround: { value: new THREE.Vector3(0.42, 0.38, 0.33) },
      uFogSunGain: { value: 0.28 },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunColorFog: { value: new THREE.Vector3(1, 0.92, 0.78) },
      uDepthDesat: { value: 0.48 }, uDepthFlatten: { value: 0.14 },
    };
    this.matComposite = this._Mat(FRAG_COMPOSITE, this.uniformsComposite);

    this.uniformsFxaa = {
      uSource: { value: null }, uTexel: { value: new THREE.Vector2() },
      uSharpen: { value: this.preset.sharpen },
    };
    this.matFxaa = this._Mat(FRAG_FXAA, this.uniformsFxaa);

    this.prevViewProjection = new THREE.Matrix4();
    this.hasPrev = false;
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
    this.targets.god = this._MakeRt(Math.max(2, w >> 2), Math.max(2, h >> 2));
    this.targets.ldr = this._MakeRt(w, h, { type: THREE.UnsignedByteType });

    let mw = w >> 1, mh = h >> 1;
    for (let i = 0; i < this.preset.bloomLevels; i += 1) {
      mw = Math.max(2, mw >> 1); mh = Math.max(2, mh >> 1);
      this.bloomMips.push(this._MakeRt(mw, mh));
      // 升采样要往回叠，每一级都得有一份"已有内容"的副本
      this.bloomMips.push(this._MakeRt(mw, mh));
    }
    this.hasPrev = false;
  }

  /** 屏幕空间 AO 贴图 —— 交给 Materials 层注入 MeshStandardMaterial 的间接光。 */
  get AoTexture() { return this.targets.aoBlur.texture; }

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

    const tanHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5));
    const projScaleY = 1 / tanHalf;
    const projScaleX = projScaleY / camera.aspect;

    // --- 1) 深度法线预通道 ---
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

    // --- 2) SSAO ---
    if (this.preset.ssao) {
      this.uniformsAo.uNormalDepth.value = T.normalDepth.texture;
      this.uniformsAo.uResolution.value.set(T.ao.width, T.ao.height);
      this.uniformsAo.uProjection.value.copy(camera.projectionMatrix);
      this.uniformsAo.uProjScale.value.set(projScaleX, projScaleY);
      this.uniformsAo.uFrame.value = frame;
      this.uniformsAo.uRadius.value = options.aoRadius ?? 0.78;
      this.uniformsAo.uIntensity.value = options.aoIntensity ?? 1.30;
      this._Blit(this.matAo, T.ao);

      this.uniformsAoBlur.uTexel.value.set(1 / T.ao.width, 1 / T.ao.height);
      this.uniformsAoBlur.uAo.value = T.ao.texture;
      this.uniformsAoBlur.uDirection.value.set(1, 0);
      this._Blit(this.matAoBlur, T.aoTmp);
      this.uniformsAoBlur.uAo.value = T.aoTmp.texture;
      this.uniformsAoBlur.uDirection.value.set(0, 1);
      this._Blit(this.matAoBlur, T.aoBlur);
    }

    // --- 3) 主场景（HDR，AO 已在材质里注入）---
    renderer.setRenderTarget(T.hdr);
    renderer.setClearColor(0x000000, 1);
    renderer.clear(true, true, false);
    renderer.render(scene, camera);

    // --- 4) 泛光 ---
    this.uniformsBright.uSource.value = T.hdr.texture;
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

    // --- 5) 体积光 ---
    let godStrength = options.godStrength ?? 0;
    if (this.preset.godrays && godStrength > 0 && options.sunDirection) {
      const sunWorld = options.sunDirection.clone().multiplyScalar(600).add(camera.position);
      const ndc = sunWorld.project(camera);
      const onScreen = ndc.z < 1 && Math.abs(ndc.x) < 1.9 && Math.abs(ndc.y) < 1.9;
      if (onScreen) {
        this.uniformsGod.uBright.value = T.bright.texture;
        this.uniformsGod.uNormalDepth.value = T.normalDepth.texture;
        this.uniformsGod.uSunUv.value.set(ndc.x * 0.5 + 0.5, ndc.y * 0.5 + 0.5);
        this.uniformsGod.uFrame.value = frame;
        this._Blit(this.matGod, T.god);
        // 太阳越接近画面中心，光柱越强（偏出画外就淡出，不然会突然消失）
        const edge = Math.max(Math.abs(ndc.x), Math.abs(ndc.y));
        godStrength *= THREE.MathUtils.clamp(1.4 - edge, 0, 1);
      } else {
        godStrength = 0;
      }
    } else {
      godStrength = 0;
    }

    // --- 6) 合成 ---
    const U = this.uniformsComposite;
    U.uHdr.value = T.hdr.texture;
    U.uBloom.value = this.bloomMips[levels > 1 ? 1 : 0].texture;
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
    if (options.sunDirection) U.uSunDir.value.copy(options.sunDirection);
    if (options.sunColor) U.uSunColorFog.value.fromArray(options.sunColor);
    U.uDamage.value = options.damage ?? 0;
    U.uFade.value = options.fade ?? 0;
    U.uFrame.value = frame;
    U.uProjScale.value.set(projScaleX, projScaleY);
    U.uInvView.value.copy(camera.matrixWorld);
    U.uMotionScale.value = this.preset.motionBlur && this.hasPrev ? (options.motionBlur ?? 0.15) : 0;
    U.uPrevViewProjection.value.copy(this.prevViewProjection);
    this._Blit(this.matComposite, T.ldr);

    // --- 7) FXAA + 锐化 -> 屏幕 ---
    this.uniformsFxaa.uSource.value = T.ldr.texture;
    this.uniformsFxaa.uTexel.value.set(1 / this.width, 1 / this.height);
    this.uniformsFxaa.uSharpen.value = options.sharpen ?? this.preset.sharpen;
    this._Blit(this.matFxaa, null);

    // 记录本帧 viewProjection，下一帧的运动模糊要用
    this.prevViewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.hasPrev = true;
  }

  Dispose() {
    for (const rt of Object.values(this.targets)) rt.dispose();
    for (const rt of this.bloomMips) rt.dispose();
    for (const m of [this.matAo, this.matAoBlur, this.matBright, this.matDown,
      this.matUp, this.matGod, this.matComposite, this.matFxaa, this.normalDepthMaterial]) m.dispose();
  }
}

export const POST_QUALITY_KEYS = Object.keys(QUALITY_PRESETS);
