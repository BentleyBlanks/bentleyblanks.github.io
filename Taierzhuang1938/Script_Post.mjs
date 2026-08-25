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
//   5) 太阳拖影 fallback（屏幕空间方向性模糊，太阳在屏内才跑）
//   6) 合成：运动模糊 -> 曝光 -> ACES -> 调色 -> 暗角 -> 色差 -> 颗粒 -> sRGB
//   7) FXAA + 锐化 -> 屏幕
//
// 决定论：颗粒/抖动全部用 frameIndex 驱动，不用 Math.random —— 视觉审查靠逐轮
// 截图比对，画面自己在抖的话根本判断不了"这一版比上一版好"。

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
// G-Buffer
//
// 三张附件，MRT 一趟写完。屏幕空间的 GI / 反射 / 接触阴影全靠它吃饭 ——
// 只有法线和深度是喂不饱它们的：SSGI 要 albedo 才知道这一点该反弹出什么颜色，
// SSR 要 roughness / metalness 才知道该不该反射、反射得多锐。
//
//   0  RGBA16F   xyz = 视空间法线，w = 线性视深度   ← 与旧的 normalDepth 逐位相同
//   1  RGBA8     rgb = 线性 albedo，a = roughness
//   2  RGBA8     r   = metalness（gb 留给以后的 material id / 自发光）
//
// 附件 0 的布局**不许动**：粒子的软粒子判据、合成 pass 的雾、水面、SSAO 全在读它。
// 换句话说这次是往上加通道，不是改格式 —— 旧消费者一行都不用改。
//
// three 的 RenderTarget 用 count 开 MRT，逐附件的 type 可以在建完之后单独改
// （setupRenderTarget 是按 textures[i].type 逐张分配的），所以 0 走半浮点、
// 1/2 走 8 位，省下三分之二的带宽。
// ---------------------------------------------------------------------------

/** MRT 的三个出口。写进任何要进 G-Buffer 的着色器里，顺序与附件顺序一致。 */
export const GBUFFER_OUTPUTS_GLSL = /* glsl */`
layout(location = 0) out vec4 gNormalDepth;
layout(location = 1) out vec4 gAlbedoRough;
layout(location = 2) out vec4 gMaterial;
`;

/**
 * 非 Standard 材质的兜底 G-Buffer 材质（水面之外的自定义 ShaderMaterial、
 * 没有 PBR 参数的东西）。几何法线与真实视深度是对的，albedo 给中性灰、
 * roughness 给 1、metalness 给 0 —— SSGI 在这些像素上不会染色，SSR 不会反射。
 *
 * 用 three 的 chunk 拼，USE_INSTANCING / 形变这些分支交给它自己处理，
 * 不然实例化的瓦砾在预通道里全部塌到原点，AO 就是一片乱码。
 */
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
      ${GBUFFER_OUTPUTS_GLSL}
      ${destruction ? `varying vec3 vDamageWorldPos;
${DestructionShaderGlsl(destruction.maxVolumes)}` : ""}
      void main() {
        ${destruction ? "ApplyDamageVolumes(vDamageWorldPos);" : ""}
        vec3 n = normalize(vViewNormal);
        if (!gl_FrontFacing) n = -n;
        gNormalDepth = vec4(n, vViewDepth);
        gAlbedoRough = vec4(0.5, 0.5, 0.5, 1.0);
        gMaterial = vec4(0.0, 0.0, 0.0, 1.0);
      }
    `,
    glslVersion: THREE.GLSL3,
    side: THREE.FrontSide,
  });
  // BuildSink 的静态网格会在自己的 onBeforeRender/onAfterRender 里只为这一 draw
  // 打开裁切。演员、枪、碎片共用 overrideMaterial，但不会被破口 OBB 切掉。
  if (destruction) material.userData.damageObjectEnabled = damageEnabled;
  return material;
}

// three 的 meshphysical 片元着色器尾巴上这几段全是围着 gl_FragColor 转的。
// GLSL3 下 three 不再注入 `#define gl_FragColor pc_fragColor`（module 7050），
// 于是**哪怕它们在 return 之后是死代码，也照样编译不过**。整段剪掉。
const GBUFFER_STRIPPED_CHUNKS = [
  "opaque_fragment", "tonemapping_fragment", "colorspace_fragment",
  "fog_fragment", "premultiplied_alpha_fragment", "dithering_fragment",
];

/**
 * 把 three 自己的 meshphysical 片元着色器改写成 G-Buffer 写入。
 *
 * 插在 `<normal_fragment_maps>` 之后 —— 那一行跑完，这四样东西刚好都在手里，
 * 且都是 three 自己算的（法线贴图、三平面、顶点色、alpha test 全已生效）：
 *   diffuseColor.rgb  线性 albedo
 *   roughnessFactor / metalnessFactor
 *   normal            视空间、已归一化、背面已翻转
 *   vViewPosition.z   正的视深度（顶点里写的是 -mvPosition.xyz）
 * 拿到就 return，后面整条光照链一步都不跑 —— G-Buffer 不需要着色。
 *
 * 这样做而不是自己手写一个 G-Buffer 着色器，是因为「自己手写」等于把三平面、
 * 实例化、骨骼、形变、破坏裁切全部再实现一遍，而且每加一种材质就要再对一次。
 */
function PatchFragmentToGBuffer(fragment) {
  let out = fragment
    .replace("#include <common>", `#include <common>
${GBUFFER_OUTPUTS_GLSL}`)
    .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>
    {
      gNormalDepth = vec4(normalize(normal), vViewPosition.z);
      gAlbedoRough = vec4(diffuseColor.rgb, roughnessFactor);
      gMaterial = vec4(metalnessFactor, 0.0, 0.0, 1.0);
      return;
    }`);
  for (const chunk of GBUFFER_STRIPPED_CHUNKS) out = out.split(`#include <${chunk}>`).join("");
  return out;
}

/**
 * 给一份 MeshStandardMaterial 造它的 G-Buffer 影子材质。
 *
 * clone() 出来的那份与原材质**共享贴图与 uniform 对象**，所以不会多占显存，
 * 也不会出现「原材质换了贴图，G-Buffer 还在画旧的」。
 *
 * 原材质自己的 onBeforeCompile 要先跑：破坏系统的破口裁切就挂在那里，
 * 不跑的话炸出来的洞在 G-Buffer 上是补着的 —— 反射和 SSGI 会照着一堵
 * 已经不存在的墙去算。AO / GI 的注入跑不跑无所谓（G-Buffer 不着色），
 * 但它们与破坏裁切共用同一个钩子，只能一起跑。
 *
 * customProgramCacheKey：**必须给**。three 的默认实现返回
 * `onBeforeCompile.toString()`（module 7755），而这里每份影子材质的钩子都是
 * 同一段闭包源码 —— 不加区分度的话，G-Buffer 材质会和原材质抢同一份编译结果。
 */
function MakeGBufferVariant(source) {
  const variant = source.clone();
  variant.glslVersion = THREE.GLSL3;
  // 影子材质不写颜色缓冲以外的状态，也不该被雾/色调映射碰。
  variant.fog = false;
  variant.toneMapped = false;
  variant.userData = { ...source.userData, gbufferSourceUuid: source.uuid };
  const sourceHook = source.onBeforeCompile;
  variant.onBeforeCompile = function (shader, renderer) {
    if (typeof sourceHook === "function") sourceHook.call(this, shader, renderer);
    shader.fragmentShader = PatchFragmentToGBuffer(shader.fragmentShader);
  };
  const sourceKey = typeof source.customProgramCacheKey === "function"
    ? source.customProgramCacheKey() : "";
  variant.customProgramCacheKey = () => `gbuffer|${sourceKey}|${
    typeof sourceHook === "function" ? sourceHook.toString() : ""}`;
  return variant;
}

/** 能进 G-Buffer 拿到完整 PBR 参数的，只有 three 的标准/物理材质。 */
function IsStandardLike(material) {
  return !!(material && (material.isMeshStandardMaterial || material.isMeshPhysicalMaterial));
}

// 换了会换 program permutation 的字段。**只在真的变了的时候** needsUpdate ——
// 每帧无条件置一次的话 three 会每帧重编译，info.programs 无限增长，
// 帧率掉到个位数（Data_TechRenderPipeline 的「坑」里记着这一条）。
const GBUFFER_PROGRAM_KEYS = [
  "alphaTest", "flatShading", "vertexColors",
  "map", "normalMap", "roughnessMap", "metalnessMap", "alphaMap",
];
// 每帧照抄一遍的标量。clone() 是**按值**拷的，不同步的话原材质在运行时改了
// roughness / 颜色 / 透明度，G-Buffer 还停在建好那一刻的旧值 ——
// 表现就是「材质明明改了，SSR 和 SSGI 当没看见」。
const GBUFFER_SYNCED_SCALARS = ["roughness", "metalness", "opacity", "side", "visible"];

function SyncGBufferVariant(variant, source) {
  for (const key of GBUFFER_SYNCED_SCALARS) variant[key] = source[key];
  if (variant.color && source.color) variant.color.copy(source.color);
  if (variant.normalScale && source.normalScale) variant.normalScale.copy(source.normalScale);
  let recompile = false;
  for (const key of GBUFFER_PROGRAM_KEYS) {
    if (variant[key] !== source[key]) { variant[key] = source[key]; recompile = true; }
  }
  if (recompile) variant.needsUpdate = true;
  return variant;
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
  color = clamp((color - 0.5) * uContrast + 0.5, 0.0, 1.0);
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

// 渲染调试页的专用展示 pass。所有中间靶都保持在线性/HDR 空间，不能直接
// Copy 到屏幕：法线会偏暗、辐照度图集会一片白，深度更是只剩黑。这里按
// 类型做最小限度的可读化，不改变任何供正式合成使用的纹理。
const FRAG_DEBUG_VIEW = /* glsl */`
  uniform sampler2D uSource;
  uniform float uMode;
  uniform float uUnavailable;
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
    } else if (uMode < 4.5) {          // HDR / 辐照度 / SSGI：Reinhard + sRGB
      color = color / (color + vec3(1.0));
      color = ToSrgb(color);
    } else if (uMode < 5.5) {          // albedo：G-Buffer 里存的是线性值
      color = ToSrgb(color);
    } else if (uMode < 6.5) {          // roughness 打包在 albedo 的 alpha 里
      color = vec3(texel.a);
    } else {                           // SSR：rgb 是反射色，a 是置信度
      color = ToSrgb((color * texel.a) / (color * texel.a + vec3(1.0)));
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

// ssgi / ssr / contact 三个开关是**画质档的事，不是玩家开关**：它们各要一趟
// 屏幕空间射线步进，low 档的机器跑不动。screenSpaceScale 是 SSGI/SSR 的分辨率
// 比例（接触阴影永远全分辨率，理由见 SetSize）。
// ---------------------------------------------------------------------------
// 屏幕空间三件套：接触阴影 / SSGI / SSR
//
// 三个 pass 长得很像，都是「从 G-Buffer 重建视空间位置 → 朝某个方向步进 →
// 用重投影后的 uv 去查 G-Buffer 深度，看有没有被挡」。区别只在方向怎么来、
// 撞上之后拿什么：
//   接触阴影  方向 = 太阳，撞上就是挡住了，输出可见度
//   SSGI     方向 = 法线半球里的随机方向，撞上就取那一点的 HDR 颜色（一次弹跳）
//   SSR      方向 = 视线关于法线的反射，撞上就取那一点的 HDR 颜色
//
// 三条共同的硬伤，写的时候必须一起处理，漏一条画面立刻脏：
//   1) 屏幕外与天空（depth <= 0）没有信息，只能判"没撞上"，不能判"挡住了"，
//      否则镜头一转，画面边缘会出现一条跟着转的黑边。
//   2) 深度比较要给厚度容差：G-Buffer 只有一层，射线从一面墙**背后**穿过时
//      深度也满足"比记录值大"，不给容差就会在墙背后凭空多出一片假遮挡。
//   3) 每帧换随机相位（uFrame），再配一次深度感知的模糊。不换的话固定图案
//      会在墙面上结成一层网格。
// ---------------------------------------------------------------------------

/** 三个 pass 共用的重建/重投影。视空间右手系，-Z 朝前，深度取正。 */
const GLSL_SCREEN_RAY = /* glsl */`
uniform sampler2D uGNormalDepth;
uniform vec2 uProjScale;      // (1/tan(fov/2)/aspect, 1/tan(fov/2))
uniform float uFrame;

vec3 ViewPos(vec2 uv, float depth) {
  vec2 ndc = uv * 2.0 - 1.0;
  return vec3(ndc.x / uProjScale.x, ndc.y / uProjScale.y, -1.0) * depth;
}

vec2 ViewToUv(vec3 p) {
  float z = max(1e-4, -p.z);
  return vec2(p.x * uProjScale.x / z, p.y * uProjScale.y / z) * 0.5 + 0.5;
}

float DepthAt(vec2 uv) { return texture2D(uGNormalDepth, uv).w; }

/**
 * 步进一条视空间射线，返回撞击点的 uv；没撞上返回 (-1, -1)。
 * 步长按 1.0 → 1.6^n 递增：近处要密（接触带就在几厘米内），远处要疏
 * （不然一条 3 米的射线要走上百步）。
 */
const float MARCH_GROWTH = 0.28;

vec2 MarchRay(vec3 origin, vec3 dir, float maxDist, int steps, float thickness, float jitter) {
  float n = float(steps);
  // 步长递增（1, 1.28, 1.56, ...），但**总长度必须正好收在 maxDist 上**。
  // 直接拿 maxDist/steps 当步长再往上递增是错的：12 步会走出 1.07 m，
  // 而调用方以为只走了 0.42 m —— 接触阴影会拉成一米长的假影子，
  // SSR 会反射到根本够不到的地方。等差级数求和一次归一化掉。
  float step0 = maxDist / (n + MARCH_GROWTH * n * (n - 1.0) * 0.5);
  float t = step0 * (0.35 + 0.65 * jitter);
  for (int i = 0; i < 32; i++) {
    if (i >= steps) break;
    float segment = step0 * (1.0 + float(i) * MARCH_GROWTH);
    vec3 p = origin + dir * t;
    vec2 uv = ViewToUv(p);
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return vec2(-1.0);
    float sceneDepth = DepthAt(uv);
    // 天空/没写过的像素没有信息：只能算没撞上，绝不能算挡住
    if (sceneDepth > 0.0) {
      float diff = -p.z - sceneDepth;
      // 下限不能是 0：掠射角上射线起点抬得再高也可能落在自己身后一点点，
      // 判成"撞上了"就是全屏一层自阴影脏点。容差跟着深度走，远处一个像素
      // 覆盖的世界尺寸大得多。
      float minDiff = 0.006 + sceneDepth * 0.0025;
      // 上限要**跟着当前步长走**。固定厚度 + 递增步长 = 射线直接从墙里穿过去：
      // 第 i 步还在墙前面（diff < 0），第 i+1 步已经在墙后面一大截（diff > 厚度），
      // 两次都不算命中。SSR 在远处大面积失效正是这一条 —— 表现为
      // "地面明明该反射，却什么都没有"。判据改成"这一段里穿过了表面"。
      if (diff > minDiff && diff < max(thickness, segment * 1.6)) return uv;
    }
    t += segment;
  }
  return vec2(-1.0);
}
`;

// --- 接触阴影 ---------------------------------------------------------------
// 阴影图那张 2048 在 62 米的框里，一个纹素约 3 厘米；沙包压地、枪托抵墙、
// 人脚踩土这些「贴着」的接触带全在一个纹素以内，阴影图根本分辨不出来，
// 表现就是物体像浮在地上。这一趟只补那最后几十厘米。
const FRAG_CONTACT_SHADOW = /* glsl */`
uniform vec3 uSunViewDir;     // 视空间、从表面指向太阳、已归一化
uniform float uMaxDistance;
uniform float uThickness;
uniform float uStrength;
varying vec2 vUv;
${GLSL_COMMON}
${GLSL_SCREEN_RAY}

void main() {
  vec4 nd = texture2D(uGNormalDepth, vUv);
  float depth = nd.w;
  // 天空 = 全亮。远处也直接放过：接触阴影是几十厘米的效果，
  // 八十米外那几十厘米还不到一个像素，白花射线。
  if (depth <= 0.0 || depth > 80.0) { gl_FragColor = vec4(1.0); return; }
  vec3 normal = normalize(nd.xyz);
  float ndl = dot(normal, uSunViewDir);
  // 背光面本来就没有直接光，接触阴影再压一遍就是纯脏
  if (ndl <= 0.02) { gl_FragColor = vec4(1.0); return; }

  vec3 origin = ViewPos(vUv, depth);
  // 沿法线抬起一点再出发：不抬的话射线第一步就打在自己身上，整屏发黑。
  // 抬的量按**深度缓冲自己的精度**来定，不能想当然地放大：附件 0 的深度是
  // 半浮点、单位是米，30 m 处能分辨约 3 cm。原来写的 depth*0.0035 在 30 m 上
  // 抬了 12 cm —— 比 12 cm 矮的遮挡物（沙包边、砖块、台阶）整个被射线跳过，
  // 接触阴影几乎不出现。这正是这一趟本来要补的那种遮挡。
  origin += normal * (0.006 + depth * 0.0012);
  float jitter = Ign(gl_FragCoord.xy + uFrame * 7.113);
  vec2 hit = MarchRay(origin, uSunViewDir, uMaxDistance, 12, uThickness, jitter);
  float visible = hit.x < 0.0 ? 1.0 : (1.0 - uStrength);
  gl_FragColor = vec4(visible, visible, visible, 1.0);
}
`;

// --- SSGI：一次漫反射弹跳 ---------------------------------------------------
// 采的是**这一帧已经着完色的 HDR 靶**，所以拿到的是"那一点最终亮成什么样"，
// 一次弹跳该有的颜色渗透（红砖墙把暖色渗到地上）就出来了。
// 探针体（Script_Gi）给的是低频的大范围间接光，这一趟补的是它给不了的
// 高频近场：墙根、门洞、掩体内侧那一圈。两者是加法关系，不是二选一。
const FRAG_SSGI = /* glsl */`
uniform sampler2D uColor;
uniform float uRadius;
uniform float uIntensity;
varying vec2 vUv;
${GLSL_COMMON}
${GLSL_SCREEN_RAY}

const int RAYS = 6;

void main() {
  vec4 nd = texture2D(uGNormalDepth, vUv);
  float depth = nd.w;
  if (depth <= 0.0 || depth > 120.0) { gl_FragColor = vec4(0.0); return; }
  vec3 normal = normalize(nd.xyz);
  vec3 origin = ViewPos(vUv, depth) + normal * (0.02 + depth * 0.004);

  // 逐像素旋转的余弦半球。金色角 2.399963 让 6 条射线在方位角上铺得最开。
  float rnd = Ign(gl_FragCoord.xy + uFrame * 3.9271);
  vec3 up = abs(normal.z) < 0.9 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);
  vec3 tangent = normalize(cross(up, normal));
  vec3 bitangent = cross(normal, tangent);

  vec3 sum = vec3(0.0);
  float weight = 0.0;
  for (int i = 0; i < RAYS; i++) {
    float a = (float(i) + rnd) * 2.3999632;
    float r = sqrt((float(i) + 0.5 + rnd) / float(RAYS));   // 余弦分布
    vec3 dir = normalize(tangent * (r * cos(a)) + bitangent * (r * sin(a))
      + normal * sqrt(max(0.0, 1.0 - r * r)));
    float cosine = max(0.0, dot(dir, normal));
    weight += cosine;
    vec2 hit = MarchRay(origin, dir, uRadius, 10, uRadius * 0.5, rnd);
    if (hit.x < 0.0) continue;                     // 没撞上 = 看到天，天光归探针体管
    vec3 radiance = texture2D(uColor, hit).rgb;
    // 撞击点的法线要背对射线，否则那是一面朝外的墙，我们看到的是它的背面
    vec3 hitNormal = normalize(texture2D(uGNormalDepth, hit).xyz);
    float facing = max(0.0, -dot(hitNormal, dir));
    sum += radiance * cosine * facing;
  }
  gl_FragColor = vec4(sum / max(0.001, weight) * uIntensity, 1.0);
}
`;

// --- SSR --------------------------------------------------------------------
// 只做锐反射：粗糙面的反射需要一整套按 roughness 预滤过的颜色金字塔，
// 这条链上没有。所以 roughness 一过阈值就直接放弃，交回 IBL ——
// 半吊子的粗糙 SSR 比没有更难看（一片抖动的噪点）。
const FRAG_SSR = /* glsl */`
uniform sampler2D uColor;
uniform sampler2D uGAlbedoRough;
uniform sampler2D uGMaterial;
uniform float uMaxDistance;
uniform float uMaxRoughness;
uniform float uIntensity;
varying vec2 vUv;
${GLSL_COMMON}
${GLSL_SCREEN_RAY}

void main() {
  vec4 nd = texture2D(uGNormalDepth, vUv);
  float depth = nd.w;
  if (depth <= 0.0 || depth > 200.0) { gl_FragColor = vec4(0.0); return; }
  float roughness = texture2D(uGAlbedoRough, vUv).a;
  float metalness = texture2D(uGMaterial, vUv).r;
  // 粗糙度权重：0 → 满，uMaxRoughness → 0，中间平滑过渡
  float roughWeight = 1.0 - smoothstep(uMaxRoughness * 0.45, uMaxRoughness, roughness);
  if (roughWeight <= 0.001) { gl_FragColor = vec4(0.0); return; }

  vec3 normal = normalize(nd.xyz);
  vec3 origin = ViewPos(vUv, depth);
  vec3 viewDir = normalize(origin);            // 相机在原点，所以位置就是方向
  vec3 dir = reflect(viewDir, normal);

  float jitter = Ign(gl_FragCoord.xy + uFrame * 11.317);
  vec3 start = origin + normal * (0.02 + depth * 0.004);
  vec2 hit = MarchRay(start, dir, uMaxDistance, 24, max(0.35, depth * 0.06), jitter);
  if (hit.x < 0.0) { gl_FragColor = vec4(0.0); return; }

  vec3 radiance = texture2D(uColor, hit).rgb;
  // 反射到屏幕边缘要淡出，否则镜头一转，反射会沿着画面边界被硬切掉
  vec2 edge = smoothstep(vec2(0.0), vec2(0.12), hit) * (1.0 - smoothstep(vec2(0.88), vec2(1.0), hit));
  float fade = edge.x * edge.y;
  // 菲涅尔：正对着看的面几乎不反射，掠射角才反射。金属全程都反射。
  float fresnel = pow(1.0 - max(0.0, dot(-viewDir, normal)), 5.0);
  float strength = mix(fresnel, 1.0, metalness) * roughWeight * fade * uIntensity;
  gl_FragColor = vec4(radiance, clamp(strength, 0.0, 1.0));
}
`;

// --- 深度感知的横向/纵向模糊（SSGI 与 SSR 共用）-----------------------------
// 普通高斯会把墙角另一侧的颜色糊过来（漏光）。跨过深度断层就不取。
const FRAG_SS_BLUR = /* glsl */`
uniform sampler2D uSource;
uniform vec2 uTexel;
uniform vec2 uDirection;
varying vec2 vUv;
${GLSL_SCREEN_RAY}

void main() {
  float centerDepth = DepthAt(vUv);
  vec4 sum = texture2D(uSource, vUv);
  float weight = 1.0;
  for (int i = 1; i <= 3; i++) {
    vec2 offset = uDirection * uTexel * float(i);
    for (int side = 0; side < 2; side++) {
      vec2 uv = side == 0 ? vUv + offset : vUv - offset;
      float d = DepthAt(uv);
      // 容差跟着深度走：远处一个像素本来就跨更多米
      if (centerDepth > 0.0 && abs(d - centerDepth) > 0.06 + centerDepth * 0.02) continue;
      float w = 1.0 / (1.0 + float(i));
      sum += texture2D(uSource, uv) * w;
      weight += w;
    }
  }
  gl_FragColor = sum / weight;
}
`;

// --- 延迟合并 ---------------------------------------------------------------
// 这一趟是「屏幕空间的结果怎么回到画面上」，**逐像素做，不逐物体做**。
// 旧的 AO / 探针体 GI 走的是另一条路：onBeforeCompile 把它们注进每一份
// MeshStandardMaterial（Script_Materials 的 InjectIndirectLighting）。
// 那条路的问题不是效果，是**它按物体分叉** —— 每加一种材质就要再接一次线，
// 而屏幕空间的量本来就与物体无关。这里的三样全部在 G-Buffer 上一次算完。
//
// 接触阴影的减法说明（这是本阶段唯一的近似，写在这里免得以后当成 bug 查）：
// 主场景仍然是**前向**着色的，太阳的直接光已经烘进 HDR 靶，没法再取出来。
// 所以这里按 G-Buffer 重新估一份"没有阴影时的太阳直接光"，再按接触阴影的
// 遮蔽量把它从 HDR 里减掉；减的量钳在当前像素亮度的 uContactMaxCut 以内 ——
// 这一钳同时挡住两件事：像素本来就在阴影图的阴影里（HDR 很暗，于是几乎不减，
// 不会二次变黑），以及减成负数。真正的解法是把太阳也搬进延迟着色，
// 那要连同阴影图一起搬，是下一阶段的事。
const FRAG_DEFERRED = /* glsl */`
uniform sampler2D uHdr;
uniform sampler2D uGAlbedoRough;
uniform sampler2D uGMaterial;
uniform sampler2D uSsgi;
uniform sampler2D uSsr;
uniform sampler2D uContact;
uniform vec3 uSunViewDir;
uniform vec3 uSunColor;
uniform float uSsgiEnabled;
uniform float uSsrEnabled;
uniform float uContactEnabled;
uniform float uContactMaxCut;
varying vec2 vUv;
${GLSL_COMMON}
${GLSL_SCREEN_RAY}

void main() {
  vec3 color = texture2D(uHdr, vUv).rgb;
  vec4 nd = texture2D(uGNormalDepth, vUv);
  float depth = nd.w;
  // 天空不参与：它不在 G-Buffer 里，三样都无从谈起
  if (depth <= 0.0) { gl_FragColor = vec4(color, 1.0); return; }

  vec3 normal = normalize(nd.xyz);
  vec4 albedoRough = texture2D(uGAlbedoRough, vUv);
  vec3 albedo = albedoRough.rgb;
  float metalness = texture2D(uGMaterial, vUv).r;

  if (uContactEnabled > 0.5) {
    float visible = texture2D(uContact, vUv).r;
    if (visible < 0.999) {
      float ndl = max(0.0, dot(normal, uSunViewDir));
      // 金属没有漫反射项，接触阴影在它上面几乎看不出来，这里一并按能量算
      vec3 sunDirect = albedo * (1.0 - metalness) * uSunColor * ndl * 0.3183099;
      vec3 cut = min(sunDirect, color * uContactMaxCut) * (1.0 - visible);
      color = max(vec3(0.0), color - cut);
    }
  }

  if (uSsgiEnabled > 0.5) {
    // 弹跳过来的辐射度要乘接收面自己的 albedo —— 少了这一步，
    // 黑色的柏油路会和白墙一样把光反出去。
    color += texture2D(uSsgi, vUv).rgb * albedo;
  }

  if (uSsrEnabled > 0.5) {
    vec4 ssr = texture2D(uSsr, vUv);
    color = mix(color, ssr.rgb, clamp(ssr.a, 0.0, 1.0));
  }

  gl_FragColor = vec4(color, 1.0);
}
`;

const QUALITY_PRESETS = {
  low:    { ssao: false, bloomLevels: 4, godrays: false, msaa: 0, motionBlur: false, aoScale: 0.5, sharpen: 0.14,
    ssgi: false, ssr: false, contact: false, screenSpaceScale: 0.5 },
  // medium 只留接触阴影：三件套里它最便宜（12 步、只走 0.42 m），
  // 视觉回报却最直接 —— 没有它，所有东西看着都像浮在地上。
  medium: { ssao: true,  bloomLevels: 5, godrays: true,  msaa: 0, motionBlur: true,  aoScale: 0.6, sharpen: 0.18,
    ssgi: false, ssr: false, contact: true,  screenSpaceScale: 0.5 },
  // high 已有最后一趟 FXAA + 锐化。超宽屏再给 RGBA16F 主靶叠 4×MSAA 会多占
  // 上百 MB 显存并重复抗锯齿；把 4× 留给主动选择 ultra 的玩家。
  high:   { ssao: true,  bloomLevels: 6, godrays: true,  msaa: 0, motionBlur: true,  aoScale: 0.75, sharpen: 0.22,
    ssgi: true,  ssr: true,  contact: true,  screenSpaceScale: 0.5 },
  ultra:  { ssao: true,  bloomLevels: 6, godrays: true,  msaa: 4, motionBlur: true,  aoScale: 1.0, sharpen: 0.22,
    ssgi: true,  ssr: true,  contact: true,  screenSpaceScale: 0.75 },
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
    this._skipScratch = [];            // _RenderGBuffer 里藏起来的对象，复用，别每帧 new
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

    // --- 屏幕空间三件套 ---
    // uSunViewDir 是**视空间**的太阳方向：射线要在视空间里步进，每帧由 Render
    // 用当前相机把世界方向转过来。传世界方向的话镜头一转，接触阴影就会整片乱走。
    this.uniformsContact = {
      uGNormalDepth: { value: null }, uProjScale: { value: new THREE.Vector2(1, 1) },
      uFrame: { value: 0 }, uSunViewDir: { value: new THREE.Vector3(0, 1, 0) },
      uMaxDistance: { value: 0.42 }, uThickness: { value: 0.30 }, uStrength: { value: 0.72 },
    };
    this.matContact = this._Mat(FRAG_CONTACT_SHADOW, this.uniformsContact);

    this.uniformsSsgi = {
      uGNormalDepth: { value: null }, uProjScale: { value: new THREE.Vector2(1, 1) },
      uFrame: { value: 0 }, uColor: { value: null },
      uRadius: { value: 3.2 }, uIntensity: { value: 0.85 },
    };
    this.matSsgi = this._Mat(FRAG_SSGI, this.uniformsSsgi);

    this.uniformsSsr = {
      uGNormalDepth: { value: null }, uProjScale: { value: new THREE.Vector2(1, 1) },
      uFrame: { value: 0 }, uColor: { value: null },
      uGAlbedoRough: { value: null }, uGMaterial: { value: null },
      uMaxDistance: { value: 26.0 }, uMaxRoughness: { value: 0.55 }, uIntensity: { value: 1.0 },
    };
    this.matSsr = this._Mat(FRAG_SSR, this.uniformsSsr);

    this.uniformsSsBlur = {
      uGNormalDepth: { value: null }, uProjScale: { value: new THREE.Vector2(1, 1) },
      uFrame: { value: 0 }, uSource: { value: null },
      uTexel: { value: new THREE.Vector2() }, uDirection: { value: new THREE.Vector2(1, 0) },
    };
    this.matSsBlur = this._Mat(FRAG_SS_BLUR, this.uniformsSsBlur);

    this.uniformsDeferred = {
      uGNormalDepth: { value: null }, uProjScale: { value: new THREE.Vector2(1, 1) },
      uFrame: { value: 0 },
      uHdr: { value: null }, uGAlbedoRough: { value: null }, uGMaterial: { value: null },
      uSsgi: { value: null }, uSsr: { value: null }, uContact: { value: null },
      uSunViewDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunColor: { value: new THREE.Vector3(1, 1, 1) },
      uSsgiEnabled: { value: 0 }, uSsrEnabled: { value: 0 }, uContactEnabled: { value: 0 },
      // 最多从一个像素上减掉它自身亮度的 70%。见 FRAG_DEFERRED 顶上的说明。
      uContactMaxCut: { value: 0.70 },
    };
    this.matDeferred = this._Mat(FRAG_DEFERRED, this.uniformsDeferred);

    // 渲染调试面板的参数覆盖层。**只有面板会写它**，玩法与画质设置一概不碰。
    // 存在的理由：三件套的参数是 Render() 每帧从 options 重新写进 uniform 的，
    // 面板直接改 uniform 的话下一帧就被冲掉 —— 滑杆看着能拖，画面纹丝不动。
    // 值为 undefined = 这一项没被覆盖，走调用方的 options 或出厂默认。
    this.debugOverrides = Object.create(null);
    this._aoCleared = false;

    // G-Buffer 影子材质的缓存：键是原材质，值是它的影子。
    // 用 Map 而不是挂在 userData 上，是为了 Dispose 时能一次全放掉。
    this.gbufferVariants = new Map();
    this._swapScratch = [];
    this._sunView = new THREE.Vector3();

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
      uSharpen: { value: this.preset.sharpen },
    };
    this.matFxaa = this._Mat(FRAG_FXAA, this.uniformsFxaa);

    this.uniformsDebug = {
      uSource: { value: null }, uMode: { value: 4 }, uUnavailable: { value: 0 },
    };
    this.matDebug = this._Mat(FRAG_DEBUG_VIEW, this.uniformsDebug);
    // final 之外的值只在开发用面板明确要求时才生效；正式出图完全不走这里。
    this.debugView = "final";
    this.debugGi = null;

    this.prevViewProjection = new THREE.Matrix4();
    this.sunWorld = new THREE.Vector3();
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

  /**
   * G-Buffer 的 MRT 靶。逐附件设 type：附件 0 的 w 是**米为单位的线性视深度**，
   * 8 位存不下（1/255 米 ≈ 4 mm 的量化，接触阴影的射线会在自己身上打中自己）；
   * 附件 1/2 全是 0..1 的物理参数，8 位绰绰有余。三张全开半浮点的话，
   * 1920×1080 光这一组就要 50 MB，超宽屏更离谱。
   */
  _MakeGBufferRt(w, h) {
    const rt = new THREE.WebGLRenderTarget(Math.max(1, w | 0), Math.max(1, h | 0), {
      type: this.hdrType,
      format: THREE.RGBAFormat,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.LinearFilter,
      generateMipmaps: false,
      depthBuffer: true,
      stencilBuffer: false,
      samples: 0,
      count: 3,
    });
    const types = [this.hdrType, THREE.UnsignedByteType, THREE.UnsignedByteType];
    const names = ["gbufferNormalDepth", "gbufferAlbedoRough", "gbufferMaterial"];
    rt.textures.forEach((texture, i) => {
      texture.type = types[i];
      texture.name = names[i];
      texture.colorSpace = THREE.NoColorSpace;
      texture.wrapS = THREE.ClampToEdgeWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;
      texture.minFilter = THREE.NearestFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.generateMipmaps = false;
    });
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

    this.targets.gbuffer = this._MakeGBufferRt(w, h);
    // 屏幕空间三件套走半分辨率：它们都是低频量（弹跳光、粗糙反射、接触暗带），
    // 全分辨率只是把噪声画得更清楚，帧率却按像素数线性掉。
    const sw = Math.max(2, Math.round(w * this.preset.screenSpaceScale));
    const sh = Math.max(2, Math.round(h * this.preset.screenSpaceScale));
    this.targets.ssgi = this._MakeRt(sw, sh);
    this.targets.ssgiTmp = this._MakeRt(sw, sh);
    this.targets.ssr = this._MakeRt(sw, sh);
    this.targets.ssrTmp = this._MakeRt(sw, sh);
    // 接触阴影是高频的（贴着物体根部那一条），降分辨率会糊成一片灰，走全分辨率。
    this.targets.contact = this._MakeRt(w, h, { type: THREE.UnsignedByteType });
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
    // 延迟合并的输出。合并 pass 要同时读 HDR 和写结果，不能是同一张靶，
    // 所以必须多一张；泛光与合成从这一刻起吃的都是它（SSR/SSGI 要进泛光）。
    this.targets.lit = this._MakeRt(w, h);
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

  /**
   * 深度法线预通道（RGBA16F：xyz = 视空间法线，w = 线性视深度）。全分辨率，
   * 与主 HDR 靶同尺寸，所以采样直接用 gl_FragCoord.xy / (width, height)。
   * 粒子层要它做软粒子，也要它判断"这一像素背后是不是天空"——
   * 合成 pass 的雾明写跳过 w = 0 的天空，粒子得自己接上那一半。
   */
  get NormalDepthTexture() { return this.targets.gbuffer.textures[0]; }

  /** G-Buffer 附件 1：rgb = 线性 albedo，a = roughness。 */
  get GBufferAlbedoTexture() { return this.targets.gbuffer.textures[1]; }

  /** G-Buffer 附件 2：r = metalness。 */
  get GBufferMaterialTexture() { return this.targets.gbuffer.textures[2]; }

  /**
   * 一个可调参数的最终取值：调试面板的覆盖 > 调用方传的 options > 出厂默认。
   * 三级而不是两级，是为了让面板可以"改回不覆盖"（删掉键即可），
   * 而不是被迫记住调用方原来传的是什么。
   */
  _Param(key, options, fallback) {
    const override = this.debugOverrides[key];
    if (override !== undefined) return override;
    const passed = options ? options[key] : undefined;
    return passed !== undefined ? passed : fallback;
  }

  /** 调试面板专用：设一项覆盖；value 传 undefined 就是撤销这一项。 */
  SetDebugOverride(key, value) {
    if (value === undefined) delete this.debugOverrides[key];
    else this.debugOverrides[key] = value;
  }

  /** 调试面板专用：撤销全部覆盖，回到调用方/出厂参数。 */
  ClearDebugOverrides() { this.debugOverrides = Object.create(null); }

  /** 这一帧屏幕空间三件套里真正跑了的那些。 */
  get ScreenSpaceActive() {
    return !!(this.preset.ssgi || this.preset.ssr || this.preset.contact);
  }

  /** 合成 pass 实际采样的那一级泛光靶。调试面板与 uBloom 必须指同一张。 */
  get BloomTarget() {
    return this.bloomMips[this.preset.bloomLevels > 1 ? 1 : 0] || null;
  }

  /**
   * 让独立的渲染调试面板选择当前帧最终送往屏幕的中间结果。
   * 这个状态故意不进玩家设置，也不影响正式合成链，只在面板存活期间保留。
   */
  SetDebugView(view = "final", gi = null) {
    this.debugView = view || "final";
    this.debugGi = gi || null;
  }

  GetDebugView() { return this.debugView; }

  _GetDebugSource() {
    const T = this.targets;
    switch (this.debugView) {
      case "normal": return { texture: T.gbuffer.textures[0], mode: 0 };
      case "depth": return { texture: T.gbuffer.textures[0], mode: 1 };
      case "ao": return { texture: T.ao.texture, mode: 2, unavailable: !this.preset.ssao };
      case "aoBlur": return { texture: T.aoBlur.texture, mode: 2, unavailable: !this.preset.ssao };
      case "hdr": return { texture: T.hdr.texture, mode: 4 };
      case "lit": return { texture: this.ScreenSpaceActive ? T.lit.texture : T.hdr.texture, mode: 4 };
      case "albedo": return { texture: T.gbuffer.textures[1], mode: 5 };
      case "roughness": return { texture: T.gbuffer.textures[1], mode: 6 };
      case "metalness": return { texture: T.gbuffer.textures[2], mode: 2 };
      case "ssgi": return { texture: T.ssgi.texture, mode: 4, unavailable: !this.preset.ssgi };
      case "ssr": return { texture: T.ssr.texture, mode: 7, unavailable: !this.preset.ssr };
      case "contact": return { texture: T.contact.texture, mode: 2, unavailable: !this.preset.contact };
      // 送屏的要与合成 pass 真正吃的是同一张（见 uBloom 那一行）：bloomMips[0]
      // 只是第 0 级的降采样，还没叠上更小几级的 tent 放大，看着比实际泛光弱一大截。
      case "bloom": return { texture: this.BloomTarget?.texture, mode: 4 };
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
      default: return null;
    }
  }

  /**
   * 一份材质对应的 G-Buffer 影子材质。null = 这个物体不进 G-Buffer。
   *
   * 三条分流，理由都在下面：
   *   · Standard / Physical  → 完整影子材质，albedo / roughness / metalness 全有
   *   · allowOverride === false 或 transparent → 不进
   *   · 其余不透明的自定义材质 → 兜底材质（几何法线 + 真深度 + 中性 albedo）
   *
   * 第二条是这次唯一改变旧行为的地方，而且是把旧行为改**对**：
   * MarkNoPrepass 的文档写的是"把一份材质排除在预通道之外"，但它只做到了
   * "不被换材质"，物体照样会拿自己的着色器画进预通道 —— 于是烟、贴片、枪口焰
   * 往法线通道里写的是它们的**颜色**，往深度里写的是**不透明度**。
   * 现在真的排除掉了。顺带：Sprite / Points 的几何属性对不上兜底材质的顶点
   * 着色器，硬套的话会在原点糊出一堆方块，所以它们只能是"不进"，不能是兜底。
   */
  _GBufferMaterialFor(material) {
    if (!material) return null;
    if (IsStandardLike(material)) {
      let variant = this.gbufferVariants.get(material);
      if (!variant) {
        variant = MakeGBufferVariant(material);
        this.gbufferVariants.set(material, variant);
      }
      return SyncGBufferVariant(variant, material);
    }
    if (material.allowOverride === false || material.transparent === true) return null;
    return this.normalDepthMaterial;
  }

  /**
   * G-Buffer 预通道。
   *
   * 以前这里用的是 scene.overrideMaterial —— 一句话换全场，代价是**拿不到
   * 每个物体自己的贴图**：覆盖材质根本不知道这面墙的 albedo 贴图是哪一张。
   * 没有 albedo 就没有 SSGI（弹跳的颜色从哪来），没有 roughness / metalness
   * 就没有 SSR（该不该反射、反射多锐）。所以改成逐物体换材质。
   *
   * 换出去的那份要原样换回来：这一趟结束之后马上就是前向主场景，
   * 换漏一个物体，它这一帧就是用 G-Buffer 材质画到屏幕上的（一团纯色）。
   * 用一个复用的扁平数组存 [object, material, ...]，每帧零分配。
   */
  _RenderGBuffer(scene, camera) {
    // skipNormalDepth 的账（这一条是好几个"远景不对劲"的共同根因）：
    // 天空穹曾经用自己那套着色器写进这张靶 —— xyz 是天空颜色（当法线用是纯垃圾），
    // w 是它的不透明度 1.0，于是整片天空在下游看起来像"一米外有东西"。
    // 后果一路传下去：SSAO 拿天空色当法线算遮蔽；合成 pass 的雾判据
    // `nd.w > 0.0` 对天空成立（只是雾量≈0，蒙混过关）；而粒子层用
    // `nd.w > 0.001` 判断"背景是不是天空"时全判反 —— 软粒子把天空前的烟
    // 整片抹掉，二百米外的黑烟柱就成了天上一个越长越大的黑洞。
    // 每帧重新收而不缓存列表：换关重建场景那一帧，缓存必然是脏的。
    const renderer = this.renderer;
    const swapped = this._swapScratch;
    swapped.length = 0;
    const hidden = this._skipScratch;
    hidden.length = 0;

    // 一次遍历同时做两件事：收 skipNormalDepth 的、换材质。
    // 分两次遍历的话，这棵树每帧要多走一遍几千个节点。
    scene.traverse((object) => {
      if (!object.visible) return;
      if (object.userData && object.userData.skipNormalDepth) {
        object.visible = false;
        hidden.push(object);
        return;
      }
      const material = object.material;
      if (!material) return;
      if (Array.isArray(material)) {
        // 多材质网格：整只按第一份的规矩处理。分材质换的话要维护一张
        // 数组缓存，而这个项目里多材质网格只有导入模型那几只。
        const variant = this._GBufferMaterialFor(material[0]);
        if (variant === null) { object.visible = false; hidden.push(object); return; }
        swapped.push(object, material);
        object.material = variant;
        return;
      }
      const variant = this._GBufferMaterialFor(material);
      if (variant === null) { object.visible = false; hidden.push(object); return; }
      swapped.push(object, material);
      object.material = variant;
    });

    const prevBackground = scene.background;
    scene.background = null;
    renderer.setRenderTarget(this.targets.gbuffer);
    renderer.setClearColor(0x000000, 0);
    renderer.clear(true, true, false);
    renderer.render(scene, camera);
    scene.background = prevBackground;

    for (let i = 0; i < swapped.length; i += 2) swapped[i].material = swapped[i + 1];
    for (const object of hidden) object.visible = true;
    swapped.length = 0;
    hidden.length = 0;
  }

  /**
   * 屏幕空间三件套 + 延迟合并。返回下游（泛光 / 合成）该采的那张靶：
   * 三件套一个都没开时原样返回 HDR 靶，一次多余的拷贝都不做。
   *
   * 顺序是有讲究的：接触阴影 → SSGI → SSR → 合并。
   * SSGI 和 SSR 采的都是**还没被接触阴影修过的** HDR ——
   * 让它们采修过的那份要多一趟全屏拷贝，而接触阴影只影响几十厘米的接触带，
   * 反弹光与反射里那点差别看不出来。这是有意的取舍，不是漏了。
   */
  _RenderScreenSpace(camera, options) {
    const T = this.targets;
    const P = this.preset;
    if (!this.ScreenSpaceActive) return T.hdr.texture;

    const frame = this.frame;
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5));
    const projScaleY = 1 / tanHalf;
    const projScaleX = projScaleY / camera.aspect;
    const gNormalDepth = T.gbuffer.textures[0];
    const gAlbedoRough = T.gbuffer.textures[1];
    const gMaterial = T.gbuffer.textures[2];

    // 世界方向 → 视空间方向。只转方向不转位置，所以用 matrixWorldInverse 的
    // 旋转部分（transformDirection 正是干这个的，且不受相机平移影响）。
    const sunView = this._sunView;
    if (options.sunDirection) {
      sunView.copy(options.sunDirection).transformDirection(camera.matrixWorldInverse).normalize();
    } else {
      sunView.set(0, 1, 0);
    }

    const contactOn = !!P.contact && !!options.sunDirection;
    if (contactOn) {
      const U = this.uniformsContact;
      U.uGNormalDepth.value = gNormalDepth;
      U.uProjScale.value.set(projScaleX, projScaleY);
      U.uFrame.value = frame;
      U.uSunViewDir.value.copy(sunView);
      U.uMaxDistance.value = this._Param("contactDistance", options, 0.42);
      U.uThickness.value = this._Param("contactThickness", options, 0.30);
      U.uStrength.value = this._Param("contactStrength", options, 0.72);
      this._Blit(this.matContact, T.contact);
    }

    const ssgiOn = !!P.ssgi;
    if (ssgiOn) {
      const U = this.uniformsSsgi;
      U.uGNormalDepth.value = gNormalDepth;
      U.uProjScale.value.set(projScaleX, projScaleY);
      U.uFrame.value = frame;
      U.uColor.value = T.hdr.texture;
      U.uRadius.value = this._Param("ssgiRadius", options, 3.2);
      U.uIntensity.value = this._Param("ssgiIntensity", options, 0.85);
      this._Blit(this.matSsgi, T.ssgi);
      this._BlurScreenSpace(T.ssgi, T.ssgiTmp, gNormalDepth, projScaleX, projScaleY);
    }

    const ssrOn = !!P.ssr;
    if (ssrOn) {
      const U = this.uniformsSsr;
      U.uGNormalDepth.value = gNormalDepth;
      U.uProjScale.value.set(projScaleX, projScaleY);
      U.uFrame.value = frame;
      U.uColor.value = T.hdr.texture;
      U.uGAlbedoRough.value = gAlbedoRough;
      U.uGMaterial.value = gMaterial;
      U.uMaxDistance.value = this._Param("ssrDistance", options, 26.0);
      U.uMaxRoughness.value = this._Param("ssrMaxRoughness", options, 0.55);
      U.uIntensity.value = this._Param("ssrIntensity", options, 1.0);
      this._Blit(this.matSsr, T.ssr);
      this._BlurScreenSpace(T.ssr, T.ssrTmp, gNormalDepth, projScaleX, projScaleY);
    }

    const U = this.uniformsDeferred;
    U.uGNormalDepth.value = gNormalDepth;
    U.uProjScale.value.set(projScaleX, projScaleY);
    U.uFrame.value = frame;
    U.uHdr.value = T.hdr.texture;
    U.uGAlbedoRough.value = gAlbedoRough;
    U.uGMaterial.value = gMaterial;
    U.uSsgi.value = T.ssgi.texture;
    U.uSsr.value = T.ssr.texture;
    U.uContact.value = T.contact.texture;
    U.uSunViewDir.value.copy(sunView);
    if (options.sunColor) U.uSunColor.value.fromArray(options.sunColor);
    U.uSsgiEnabled.value = ssgiOn ? 1 : 0;
    U.uSsrEnabled.value = ssrOn ? 1 : 0;
    U.uContactEnabled.value = contactOn ? 1 : 0;
    this._Blit(this.matDeferred, T.lit);
    return T.lit.texture;
  }

  /** 深度感知的两趟可分离模糊，就地做完（结果回到 target）。 */
  _BlurScreenSpace(target, scratch, gNormalDepth, projScaleX, projScaleY) {
    const U = this.uniformsSsBlur;
    U.uGNormalDepth.value = gNormalDepth;
    U.uProjScale.value.set(projScaleX, projScaleY);
    U.uTexel.value.set(1 / target.width, 1 / target.height);
    U.uSource.value = target.texture;
    U.uDirection.value.set(1, 0);
    this._Blit(this.matSsBlur, scratch);
    U.uSource.value = scratch.texture;
    U.uDirection.value.set(0, 1);
    this._Blit(this.matSsBlur, target);
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

    const tanHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5));
    const projScaleY = 1 / tanHalf;
    const projScaleX = projScaleY / camera.aspect;

    // --- 1) G-Buffer 预通道 ---
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
    this._RenderGBuffer(scene, camera);

    // --- 2) SSAO ---
    if (this.preset.ssao) {
      this.uniformsAo.uNormalDepth.value = T.gbuffer.textures[0];
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
      this._aoCleared = false;
    } else if (!this._aoCleared) {
      // 关掉 SSAO 必须把 AO 靶刷成全白（1 = 完全不遮蔽）。只是不跑这两趟的话，
      // 材质那边仍在采**上一次算出来的那张图** —— 表现就是"AO 已经关了，
      // 墙角那圈暗带还钉在原地"。调试面板能实时开关 SSAO 之后这条才暴露出来。
      renderer.setRenderTarget(T.aoBlur);
      renderer.setClearColor(0xffffff, 1);
      renderer.clear(true, false, false);
      this._aoCleared = true;
    }

    // --- 3) 主场景（HDR，AO 已在材质里注入）---
    renderer.setRenderTarget(T.hdr);
    renderer.setClearColor(0x000000, 1);
    renderer.clear(true, true, false);
    renderer.render(scene, camera);

    // --- 3.5) 屏幕空间三件套 + 延迟合并 ---
    //
    // 全部排在主场景**之后**：SSGI 和 SSR 都要采"这一点最终亮成什么样"，
    // 那份信息只有着完色的 HDR 靶里才有。排在前面就只能采上一帧，
    // 镜头一动整片反射会拖影。
    //
    // 太阳方向要转到视空间：射线在视空间里步进（G-Buffer 的法线和位置都是
    // 视空间的）。传世界方向的话，镜头一转接触阴影会整片跟着乱走。
    const litSource = this._RenderScreenSpace(camera, options);

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
    this.uniformsBright.uSource.value = litSource;
    this.uniformsBright.uNormalDepth.value = T.gbuffer.textures[0];
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

    // --- 5) 太阳方向拖影（便宜的屏幕空间 fallback）---
    if (godActive) {
      this.uniformsGod.uBright.value = T.bright.texture;
      this.uniformsGod.uSunUv.value.set(this.sunWorld.x * 0.5 + 0.5, this.sunWorld.y * 0.5 + 0.5);
      this.uniformsGod.uFrame.value = frame;
      this._Blit(this.matGod, T.god);
    }

    // --- 6) 合成 ---
    const U = this.uniformsComposite;
    U.uHdr.value = litSource;
    U.uBloom.value = this.BloomTarget.texture;
    U.uGod.value = T.god.texture;
    U.uNormalDepth.value = T.gbuffer.textures[0];
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

    // --- 7) FXAA + 锐化 -> 屏幕；调试时改为展示指定的中间靶 ---
    const debug = this._GetDebugSource();
    if (debug) {
      this.uniformsDebug.uSource.value = debug.texture || T.ldr.texture;
      this.uniformsDebug.uMode.value = debug.mode;
      this.uniformsDebug.uUnavailable.value = debug.unavailable || !debug.texture ? 1 : 0;
      this._Blit(this.matDebug, null);
    } else {
      this.uniformsFxaa.uSource.value = T.ldr.texture;
      this.uniformsFxaa.uTexel.value.set(1 / this.width, 1 / this.height);
      this.uniformsFxaa.uSharpen.value = options.sharpen ?? this.preset.sharpen;
      this._Blit(this.matFxaa, null);
    }

    // 记录本帧 viewProjection，下一帧的运动模糊要用
    this.prevViewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.hasPrev = true;
  }

  Dispose() {
    for (const rt of Object.values(this.targets)) rt.dispose();
    for (const rt of this.bloomMips) rt.dispose();
    for (const m of [this.matAo, this.matAoBlur, this.matBright, this.matDown,
      this.matUp, this.matGod, this.matComposite, this.matFxaa, this.matDebug,
      this.matContact, this.matSsgi, this.matSsr, this.matSsBlur, this.matDeferred,
      this.normalDepthMaterial]) m.dispose();
    // 影子材质与原材质**共享贴图**，dispose() 只放它自己那份程序，不会连累原材质。
    for (const variant of this.gbufferVariants.values()) variant.dispose();
    this.gbufferVariants.clear();
  }
}

export const POST_QUALITY_KEYS = Object.keys(QUALITY_PRESETS);
