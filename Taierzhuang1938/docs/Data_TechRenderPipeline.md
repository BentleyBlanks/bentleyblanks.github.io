# 台儿庄 FPS：零 addon 的自研 3A 观感渲染管线

> 本文所有 API / 常量 / GLSL 断言，均来自实读 `Taierzhuang1938/vendor/three/build/three.module.js` 与 `three.core.js`（`REVISION = '185'`，版权头 2010-2026），不是凭记忆。`vendor/three/` 下**只有 `build/` 与 `LICENSE`，没有 `examples/jsm`** —— `EffectComposer` / `UnrealBloomPass` / `SSAOPass` / `SMAAPass` / `CSM` 一个都没有，整条链必须手搭。

---

## 0. 事实核查结果（先把地基钉死）

| 需求 | 结论 | 出处 |
|---|---|---|
| `WebGLRenderTarget` | ✅ 导出（`three.core.js:9497`，继承 `RenderTarget`） | module 第 19610 行 export 列表 |
| RT `depthTexture` 选项 | ✅ `options.depthTexture`，有 getter/setter，会自动解绑旧的 | `RenderTarget` 构造 |
| **MRT（`count > 1`）** | ✅ **可用**。`RenderTarget` 有 `count` 选项 → `this.textures[]` 数组；`WebGLState.drawBuffers()` 会 `gl.drawBuffers([COLOR_ATTACHMENT0+i…])`；`setupFrameBufferTexture(..., COLOR_ATTACHMENT0 + i, ...)` | module 10155–10202 / 13198 |
| `DepthTexture` | ✅ 默认 `type=UnsignedIntType, format=DepthFormat, magFilter=minFilter=NearestFilter, flipY=false, generateMipmaps=false, compareFunction=null` | core 29229 |
| `HalfFloatType` / `RGBAFormat` / `FloatType` | ✅ 全部导出；渲染器启动时主动 `getExtension('EXT_color_buffer_float')` 和 `OES_texture_float_linear` | module 4191–4193 |
| `ShaderMaterial` / `RawShaderMaterial` | ✅ 都导出。`ShaderMaterial` 有 `glslVersion` 字段 | core 37982 |
| **`#version 300 es` 永远开着** | ✅ 非 Raw 材质一律被前置 `#version 300 es`，并注入 `#define varying in / #define texture2D texture`。只有 `glslVersion === GLSL3` 时才**不**注入 `layout(location=0) out pc_fragColor` —— 即 **MRT 必须 `glslVersion: THREE.GLSL3` + 自己写 `layout(location=N) out vec4`**，同时 `#include <...>` chunk 依然可用 | module 7036–7062 |
| `ShaderChunk` / `ShaderLib` / `UniformsLib` / `UniformsUtils` | ✅ 都从 `three.module.js` 导出，且是**可变对象**（可整段替换阴影 chunk） | module 19610 |
| `InstancedMesh` | ✅ `setMatrixAt/setColorAt/instanceMatrix/instanceColor/count` | core |
| `PMREMGenerator` | ✅ `fromScene(scene, sigma, near, far)` / `fromEquirectangular` / `fromCubemap` | module 2663–2791 |
| `ACESFilmicToneMapping` | ✅ 常量导出；GLSL 原文在 `tonemapping_pars_fragment`（含 `ACESInputMat/ACESOutputMat/RRTAndODTFit`，且 `color *= toneMappingExposure / 0.6`） | module 499 |
| `VSMShadowMap` / `PCFSoftShadowMap` / `PCFShadowMap` | ✅ 常量都在，但**语义变了**，见下 | core 62–88 |
| `Scene.overrideMaterial` | ✅ 生效，但 r165+ 加了闸门：`material.allowOverride === true` 才会被替换 | module 18102 |
| `MeshPhysicalMaterial` | ✅ `clearcoat/clearcoatRoughness/clearcoatNormalMap(+Scale)`、`sheen/sheenColor/sheenRoughness(+Map)`、`iridescence/iridescenceIOR/iridescenceThicknessRange`、`transmission/thickness/attenuationDistance/attenuationColor/dispersion`、`ior/reflectivity`、`specularIntensity/specularColor(+Map)`、**`anisotropy/anisotropyRotation/anisotropyMap`** | core `MeshPhysicalMaterial` |
| `onBeforeCompile(shader, renderer)` | ✅ 在 `setProgram` 里调用；配套 `customProgramCacheKey()` 必须一起改，否则不同参数共用同一份编译缓存 | module 18210 / core 21018 |
| `renderer.setRenderTarget(rt, cubeFace, mipLevel)` | ✅ | module 18884 |
| `copyFramebufferToTexture` / `copyTextureToTexture` / `readRenderTargetPixelsAsync` | ✅ 都在（TAA 历史帧可用，但更推荐 ping-pong RT） | module 19147/19233/19264 |
| `camera.setViewOffset(fw, fh, x, y, w, h)` | ✅ 存在 —— TAA jitter 用它，别手改 `projectionMatrix.elements` | core 46537 |
| `scene.environmentIntensity` / `environmentRotation` / `backgroundBlurriness` | ✅ | core 15089–15124 |
| `renderer.info.programs` | ✅ `info.programs = programCache.programs` | module 16464 |

### ⚠️ 本仓库版本最要命的一条

```js
const shadowMapTypeDefines = {
  [ PCFShadowMap ]: 'SHADOWMAP_TYPE_PCF',
  [ VSMShadowMap ]: 'SHADOWMAP_TYPE_VSM'
};
function generateShadowMapTypeDefine( parameters ) {
  return shadowMapTypeDefines[ parameters.shadowMapType ] || 'SHADOWMAP_TYPE_BASIC';
}
```
`PCFSoftShadowMap === 2` **不是这张表的 key**，直接落到 `SHADOWMAP_TYPE_BASIC`。再看 `WebGLShadowMap`：只有 `this.type === PCFShadowMap` 才把 `depthTexture.compareFunction = LessEqualCompare` 且 `min/magFilter = LinearFilter`，否则 `compareFunction = null` + `NearestFilter`。

**结论：在 r185 里 `PCFSoftShadowMap` = 1 抽样硬阴影 + 最近邻采样，比 `PCFShadowMap` 还差。** 而 `Script_Probe.mjs:26` 现在正是 `renderer.shadowMap.type = THREE.PCFSoftShadowMap` —— 这是当前 demo 里一条实打实的画质 bug，改成 `PCFShadowMap` 立刻拿到硬件 PCF + Vogel 5 抽样盘（`interleavedGradientNoise` 驱动 `phi`），阴影边缘直接从锯齿变柔和。

---

## 1. 帧结构总览

```
[-] GiProbes      : 半实时辐照度探针体，5 个 draw call 更新十几个探针（见 §12）
                    —— 它不进主帧的合成链，只是每帧往图集里补一批，材质直接取用
[0] ShadowPass    : 2~3 级 CSM 正交深度（three 自己的 shadowMap 跑，但灯是我们排的）
[1] PrePass (MRT) : RT0 = RGBA16F (xyz=view normal, w=linear viewZ)
                    RT1 = RG16F   (screen-space velocity, 单位=UV)
                    + DepthTexture（给体积雾/后续重建复用）
[2] SSAO          : 半分辨率 → 双边模糊 ×2 → rtAO(R8)
[3] MainHDR       : RGBA16F + MSAA(4x)，AO 经 onBeforeCompile 注入 <aomap_fragment>
[4] Volumetrics   : 半分辨率 raymarch（吃 CSM cascade0）→ 上采样
[5] Bloom         : 阈值 → 13 抽样降采样 ×5 → 9 抽样 tent 升采样 ×5（累加回叠）
[6] GodRays       : 1/4 分辨率径向模糊（太阳在屏内才跑）
[7] Composite     : 运动模糊 → +体积 → +bloom×lensDirt → 曝光 → ACES
                    → LUT/lift-gamma-gain → 暗角 → 色差 → 颗粒 → **手写 sRGB 编码**
[8] TAA           : jitter + 重投影 + neighborhood clamp（关掉时跳过）
[9] FXAA + Sharpen: → 屏幕
```

三条顺序是"塑料 vs 电影"的分水岭，错一条全盘皆输：
1. **AO 只压间接光**，不能压直接光（不然背光面死黑）；
2. **Bloom 在 tonemap 之前**（HDR 域），不然亮部早被 ACES 压平了，泛不出来；
3. **sRGB 编码在最后一 pass**，FXAA 必须跑在 sRGB 之后（FXAA 3.11 的 luma 阈值是按感知域标定的）。

---

## 2. HDR 主渲染

```js
const gl = renderer.getContext();
const hdrOk = !!(gl.getExtension('EXT_color_buffer_half_float')
              || gl.getExtension('EXT_color_buffer_float'));
const rtHdr = new THREE.WebGLRenderTarget(w, h, {
  type: hdrOk ? THREE.HalfFloatType : THREE.UnsignedByteType,
  format: THREE.RGBAFormat,
  minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
  generateMipmaps: false, depthBuffer: true, stencilBuffer: false,
  samples: 4,                       // MSAA，只对几何边有效，对高光噪点无效
});
rtHdr.texture.colorSpace = THREE.NoColorSpace;   // 全链路线性
renderer.toneMapping = THREE.NoToneMapping;      // 关键：tonemap 我们自己做
renderer.outputColorSpace = THREE.SRGBColorSpace;
```

为什么 `renderer.toneMapping` 必须设 `NoToneMapping`：三方源码里 `toneMapping` 只在 `currentRenderTarget === null` 时才注入（module 7549–7559），也就是说渲进 RT 时它本来就不生效；但如果你留着 `ACESFilmicToneMapping`，最后那一 pass 如果哪天直接渲到屏幕，就会**tonemap 两次**。索性关掉，全部收进 Composite。

Composite 里的 ACES 直接抄 r185 原文（避免和 three 内置材质的观感漂移）：

```glsl
uniform float uExposure;
vec3 RRTAndODTFit(vec3 v) {
  vec3 a = v * (v + 0.0245786) - 0.000090537;
  vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
  return a / b;
}
vec3 ACESFilmic(vec3 color) {
  const mat3 IN = mat3(vec3(0.59719,0.07600,0.02840),
                       vec3(0.35458,0.90834,0.13383),
                       vec3(0.04823,0.01566,0.83777));
  const mat3 OUT= mat3(vec3( 1.60475,-0.10208,-0.00327),
                       vec3(-0.53108, 1.10813,-0.07276),
                       vec3(-0.07367,-0.00605, 1.07602));
  color *= uExposure / 0.6;            // 三方就是除 0.6，别自己改成 1.0
  color = IN * color;
  color = RRTAndODTFit(color);
  color = OUT * color;
  return clamp(color, 0.0, 1.0);
}
```

**曝光**建议做成"自动 + 手动偏移"：用 `readRenderTargetPixelsAsync` 每 8 帧异步读一张 1/64 分辨率的亮度 mip（或干脆读 4x4 像素），求 log 平均亮度，指数平滑到目标 EV，钳在 `[-2, +2] EV` 内。**别每帧同步 `readRenderTargetPixels`** —— 那是 GPU 同步点，直接掉到 20fps。

---

## 3. 深度/法线预通道（MRT 版）

r185 支持 MRT，所以别开两次 pass。用 `count: 3` 一次写出 法线+深度 / 速度：

```js
const rtPre = new THREE.WebGLRenderTarget(w, h, {
  count: 2,
  type: THREE.HalfFloatType, format: THREE.RGBAFormat,
  minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
  depthBuffer: true, generateMipmaps: false,
});
rtPre.textures[0].name = 'normalDepth';
rtPre.textures[1].name = 'velocity';
rtPre.depthTexture = new THREE.DepthTexture(w, h, THREE.UnsignedIntType);
```

覆盖材质（`glslVersion: THREE.GLSL3` 才能声明多个 out）：

```js
const preMat = new THREE.ShaderMaterial({
  glslVersion: THREE.GLSL3,
  uniforms: { uPrevViewProj: { value: new THREE.Matrix4() } },
  vertexShader: /* glsl */`
    #include <common>
    #include <batching_pars_vertex>
    #include <skinning_pars_vertex>
    #include <morphtarget_pars_vertex>
    uniform mat4 uPrevViewProj;
    out vec3 vViewNormal;
    out float vViewZ;
    out vec4 vCurClip;
    out vec4 vPrevClip;
    void main() {
      #include <beginnormal_vertex>
      #include <morphinstance_vertex>
      #include <morphnormal_vertex>
      #include <skinbase_vertex>
      #include <skinnormal_vertex>
      #include <defaultnormal_vertex>
      vViewNormal = normalize(transformedNormal);
      #include <begin_vertex>
      #include <morphtarget_vertex>
      #include <skinning_vertex>
      #include <project_vertex>          // 产出 mvPosition / gl_Position
      vViewZ   = -mvPosition.z;
      vCurClip = gl_Position;
      vec4 wp  = modelMatrix * vec4(transformed, 1.0);
      vPrevClip= uPrevViewProj * wp;     // 静态物体够用；骨骼动画需上一帧骨矩阵
    }`,
  fragmentShader: /* glsl */`
    precision highp float;
    in vec3 vViewNormal; in float vViewZ; in vec4 vCurClip; in vec4 vPrevClip;
    layout(location = 0) out vec4 oNormalDepth;
    layout(location = 1) out vec4 oVelocity;
    void main() {
      vec3 n = normalize(vViewNormal);
      if (!gl_FrontFacing) n = -n;
      oNormalDepth = vec4(n, vViewZ);
      vec2 cur  = vCurClip.xy  / vCurClip.w  * 0.5 + 0.5;
      vec2 prev = vPrevClip.xy / vPrevClip.w * 0.5 + 0.5;
      oVelocity = vec4(cur - prev, 0.0, 1.0);
    }`,
});
```

注意 `#include <batching_pars_vertex>` / `USE_INSTANCING` 这一串必须带上 —— 否则实例化的瓦砾/沙袋在预通道里全部塌回原点，SSAO 会变成一片乱纹。而 `USE_INSTANCING` 的 `attribute mat4 instanceMatrix` 是渲染器自动注入的（module 6839），`<project_vertex>` 会自己处理。

**`allowOverride` 陷阱**：Sprite / Points / 粒子系统的材质默认 `allowOverride = true`，会被 override 掉，几何属性对不上 → 预通道里蹦出一堆糊在原点的方块。在所有粒子/贴片材质上写死：

```js
particleMaterial.allowOverride = false;   // r165+ 的正规做法
```

或者更稳：给后处理相关物体单独一个 `Layers`，预通道时 `camera.layers.set(N)`。

---

## 4. SSAO（半球采样 + 噪声旋转 + 双边模糊）

参数取舍（1600×900，半分辨率 800×450）：
- **样本数 14**：低于 10 会出现明显噪点带；高于 24 收益递减，成本线性上升。
- **半径 0.6–1.0 世界米**：室内窄巷选 0.6，室外街区选 1.0。半径过大 → "脏兮兮的整墙灰"，不是接触阴影。
- **bias 0.02–0.04**：低于 0.02 出自遮挡摩尔纹，高于 0.05 接触阴影会脱离物体底部。
- **强度 1.0–1.3**，`pow(ao, 1.4)` 提对比。

```glsl
uniform sampler2D uNormalDepth;
uniform vec2  uProjScale;     // (1/tan(fov/2)/aspect, 1/tan(fov/2))
uniform vec2  uResolution;
uniform float uRadius, uBias, uIntensity, uFrame;
in vec2 vUv; out vec4 oColor;

const int SAMPLES = 14;
const vec3 KERNEL[14] = vec3[14](
  vec3( 0.5381, 0.1856, 0.4319), vec3( 0.1379, 0.2486, 0.4430),
  vec3( 0.3371, 0.5679, 0.0057), vec3(-0.6999,-0.0451, 0.0019),
  vec3( 0.0689,-0.1598, 0.8547), vec3( 0.0560, 0.0069, 0.1843),
  vec3(-0.0146, 0.1402, 0.0762), vec3( 0.0100,-0.1924, 0.0344),
  vec3(-0.3577,-0.5301, 0.4358), vec3(-0.3169, 0.1063, 0.0158),
  vec3( 0.0103,-0.5869, 0.0046), vec3(-0.0897,-0.4940, 0.3287),
  vec3( 0.7119,-0.0154,-0.0918), vec3(-0.0533, 0.0596,-0.5411));

vec3 ViewPos(vec2 uv, float z) {
  vec2 ndc = uv * 2.0 - 1.0;
  return vec3(ndc.x / uProjScale.x, ndc.y / uProjScale.y, -1.0) * z;
}
float Ign(vec2 p){ return fract(52.9829189 * fract(dot(p, vec2(0.06711056,0.00583715)))); }

void main() {
  vec4 nd = texture(uNormalDepth, vUv);
  float z = nd.w;
  if (z <= 0.0 || z > 400.0) { oColor = vec4(1.0); return; }
  vec3 P = ViewPos(vUv, z);
  vec3 N = normalize(nd.xyz);

  // 逐像素旋转：交错梯度噪声（Jimenez），比 4x4 随机纹理更均匀，且不用额外贴图
  float ang = Ign(gl_FragCoord.xy + uFrame * 5.588238) * 6.2831853;
  vec3 rvec = vec3(cos(ang), sin(ang), 0.0);
  vec3 T = normalize(rvec - N * dot(rvec, N));
  mat3 TBN = mat3(T, cross(N, T), N);

  float occ = 0.0;
  for (int i = 0; i < SAMPLES; ++i) {
    vec3 sp = P + TBN * KERNEL[i] * uRadius;
    vec4 clip = vec4(sp.x * uProjScale.x, sp.y * uProjScale.y, 0.0, -sp.z);
    vec2 suv  = clip.xy / clip.w * 0.5 + 0.5;
    if (any(lessThan(suv, vec2(0.0))) || any(greaterThan(suv, vec2(1.0)))) continue;
    float sz = texture(uNormalDepth, suv).w;
    if (sz <= 0.0) continue;
    // 距离衰减：远处的遮挡体不该在近处画一圈黑边（halo）
    float rangeCheck = smoothstep(0.0, 1.0, uRadius / max(1e-4, abs(z - sz)));
    occ += (sz < -sp.z - uBias ? 1.0 : 0.0) * rangeCheck;
  }
  float ao = 1.0 - occ / float(SAMPLES) * uIntensity;
  oColor = vec4(pow(clamp(ao, 0.0, 1.0), 1.4));
}
```

**双边模糊**（可分离，两次 1D，各 9 抽样）——权重必须吃深度差，否则墙角的 AO 会渗到前景人物身上：

```glsl
uniform sampler2D uAo, uNormalDepth;
uniform vec2 uTexel, uDir;
in vec2 vUv; out vec4 oColor;
void main() {
  float zc = texture(uNormalDepth, vUv).w;
  vec3  nc = texture(uNormalDepth, vUv).xyz;
  float sum = 0.0, wsum = 0.0;
  for (int i = -4; i <= 4; ++i) {
    vec2 uv = vUv + uDir * uTexel * float(i);
    vec4 nd = texture(uNormalDepth, uv);
    float wz = exp(-abs(nd.w - zc) * 3.0);          // 深度权重
    float wn = pow(max(dot(nd.xyz, nc), 0.0), 8.0); // 法线权重
    float wg = exp(-float(i * i) / 8.0);            // 空间高斯
    float w  = wz * wn * wg;
    sum += texture(uAo, uv).r * w; wsum += w;
  }
  oColor = vec4(sum / max(wsum, 1e-4));
}
```

**注入到间接光**（这是 three 里唯一一个"只动间接光"的钩子）：

```js
material.onBeforeCompile = (shader) => {
  shader.uniforms.uAoTex = { value: aoTexture };
  shader.uniforms.uResolution = { value: resVec2 };
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <aomap_fragment>', /* glsl */`
      #include <aomap_fragment>
      {
        float ssao = texture2D(uAoTex, gl_FragCoord.xy / uResolution).r;
        reflectedLight.indirectDiffuse  *= ssao;
        reflectedLight.indirectSpecular *= mix(1.0, ssao, 0.6); // 镜面遮蔽弱一半
      }`);
};
material.customProgramCacheKey = () => 'ssao1';   // 不写这句会和没注入的材质共用缓存
```

---

## 5. Bloom（COD Advanced Warfare 那一套）

比"一次高斯"更像 3A 的原因：多级金字塔的能量分布是**幂律**的，近似真实镜头 PSF 的长尾；单次高斯只有一个尺度，泛出来像一层雾。

**阈值 + 软膝（soft knee）**，并在**第一级降采样**做 Karis 平均抑制萤火虫：

```glsl
// Bright pass
uniform sampler2D uSource; uniform float uThreshold, uKnee, uClamp;
in vec2 vUv; out vec4 oColor;
float Luma(vec3 c){ return dot(c, vec3(0.2126,0.7152,0.0722)); }
void main() {
  vec3 c = min(texture(uSource, vUv).rgb, vec3(uClamp));  // 钳死超亮点，否则闪烁
  float br = max(c.r, max(c.g, c.b));
  float soft = clamp(br - uThreshold + uKnee, 0.0, 2.0 * uKnee);
  soft = soft * soft / (4.0 * uKnee + 1e-4);
  float w = max(soft, br - uThreshold) / max(br, 1e-4);
  oColor = vec4(c * w, 1.0);
}
```

**13 抽样降采样**（权重和恰为 1.0）：

```glsl
uniform sampler2D uSource; uniform vec2 uTexel; uniform float uKaris;
in vec2 vUv; out vec4 oColor;
float KW(vec3 c){ return 1.0 / (1.0 + dot(c, vec3(0.2126,0.7152,0.0722))); }
void main() {
  vec2 t = uTexel;
  vec3 a = texture(uSource, vUv + t*vec2(-2., 2.)).rgb;
  vec3 b = texture(uSource, vUv + t*vec2( 0., 2.)).rgb;
  vec3 c = texture(uSource, vUv + t*vec2( 2., 2.)).rgb;
  vec3 d = texture(uSource, vUv + t*vec2(-2., 0.)).rgb;
  vec3 e = texture(uSource, vUv                 ).rgb;
  vec3 f = texture(uSource, vUv + t*vec2( 2., 0.)).rgb;
  vec3 g = texture(uSource, vUv + t*vec2(-2.,-2.)).rgb;
  vec3 h = texture(uSource, vUv + t*vec2( 0.,-2.)).rgb;
  vec3 i = texture(uSource, vUv + t*vec2( 2.,-2.)).rgb;
  vec3 j = texture(uSource, vUv + t*vec2(-1., 1.)).rgb;
  vec3 k = texture(uSource, vUv + t*vec2( 1., 1.)).rgb;
  vec3 l = texture(uSource, vUv + t*vec2(-1.,-1.)).rgb;
  vec3 m = texture(uSource, vUv + t*vec2( 1.,-1.)).rgb;

  if (uKaris > 0.5) {              // 只在 mip0→mip1 这一级开
    vec3 g0=(a+b+d+e)*0.25, g1=(b+c+e+f)*0.25, g2=(d+e+g+h)*0.25,
         g3=(e+f+h+i)*0.25, g4=(j+k+l+m)*0.25;
    float w0=KW(g0),w1=KW(g1),w2=KW(g2),w3=KW(g3),w4=KW(g4);
    oColor = vec4((g0*w0+g1*w1+g2*w2+g3*w3+g4*w4)/(w0+w1+w2+w3+w4+1e-4), 1.0);
    return;
  }
  vec3 o  = e * 0.125;
  o += (a + c + g + i) * 0.03125;
  o += (b + d + f + h) * 0.0625;
  o += (j + k + l + m) * 0.125;
  oColor = vec4(o, 1.0);
}
```

**9 抽样 tent 升采样**（1-2-1 / 2-4-2 / 1-2-1，/16），加法回叠到上一级：

```glsl
uniform sampler2D uSource;    // 更小的一级
uniform vec2 uTexel; uniform float uRadius;
in vec2 vUv; out vec4 oColor;
void main() {
  vec4 d = vec4(uTexel.x, uTexel.y, -uTexel.x, 0.0) * uRadius;
  vec3 s  = texture(uSource, vUv - d.xy).rgb;
  s += texture(uSource, vUv - d.wy).rgb * 2.0;
  s += texture(uSource, vUv - d.zy).rgb;
  s += texture(uSource, vUv + d.zw).rgb * 2.0;
  s += texture(uSource, vUv       ).rgb * 4.0;
  s += texture(uSource, vUv + d.xw).rgb * 2.0;
  s += texture(uSource, vUv + d.zy).rgb;
  s += texture(uSource, vUv + d.wy).rgb * 2.0;
  s += texture(uSource, vUv + d.xy).rgb;
  oColor = vec4(s * (1.0 / 16.0), 1.0);
}
```

回叠用 `blending: THREE.AdditiveBlending` 写进上一级 RT，比再开一份 ping-pong 省一半带宽。级数：1600×900 用 **5 级**（到 50×28 停），低配降到 3 级。`uRadius` 0.85–1.2，越大越"雾"。

**镜头脏污**：把一张 CanvasTexture 烘的油污/划痕图（灰度）乘进最终 bloom：
```glsl
vec3 bloom = texture(uBloom, vUv).rgb;
float dirt = texture(uLensDirt, vUv).r;
bloom *= (1.0 + dirt * uDirtStrength * smoothstep(0.2, 1.5, Luma(bloom)));
```
关键是 `smoothstep` 门槛：只有真的有强光源时脏污才亮起来，否则整屏永远糊着一层灰 —— 那是最典型的"廉价滤镜感"。

---

## 6. 体积光 / 神光 + 廉价 raymarch 体积雾

### 6.1 屏幕空间径向模糊（god rays）
只在太阳投影落在屏幕内（含 20% 外扩）时跑，1/4 分辨率，48–64 步：

```glsl
uniform sampler2D uBright, uNormalDepth;
uniform vec2 uSunUv; uniform float uDensity, uDecay, uWeight, uExposure, uFrame;
in vec2 vUv; out vec4 oColor;
float Ign(vec2 p){ return fract(52.9829189 * fract(dot(p, vec2(0.06711056,0.00583715)))); }
void main() {
  const int STEPS = 48;
  vec2 delta = (vUv - uSunUv) * (uDensity / float(STEPS));
  vec2 uv = vUv;
  // 抖动起点：不抖会看到 48 条同心环带（banding）
  uv -= delta * Ign(gl_FragCoord.xy + uFrame * 3.17);
  float illum = 1.0; vec3 acc = vec3(0.0);
  for (int i = 0; i < STEPS; ++i) {
    uv -= delta;
    // 遮挡掩码：有几何的地方不发光（天空 w<=0）
    float z = texture(uNormalDepth, uv).w;
    float mask = step(z, 0.0);
    acc += texture(uBright, uv).rgb * mask * illum * uWeight;
    illum *= uDecay;
  }
  oColor = vec4(acc / float(STEPS), 1.0);
}
```
`uDecay` 0.95–0.97、`uWeight` 4–6、`uDensity` 0.7–0.95。合成时用 **screen 混合**而非直加，避免天空过曝：`col = 1.0 - (1.0 - col) * (1.0 - god * uGodStrength)`。

### 6.2 raymarch 体积雾（光柱穿过烟尘）
这是"3A 感"里性价比最高的一项，因为它同时给出**景深层次**和**光的可见形状**。半分辨率、24–32 步、吃 CSM cascade0 的阴影图。

**关键坑**：三方给阴影 `DepthTexture` 设了 `compareFunction = LessEqualCompare`（只在 `PCFShadowMap` 下），此时它是一张 **shadow 采样器纹理**，用 `sampler2D` 绑定是 UB（多数驱动返回 0 → 全屏黑雾）。必须声明成 `sampler2DShadow`：

```glsl
uniform highp sampler2DShadow uSunShadow;   // = sun.shadow.map.depthTexture
uniform mat4  uSunShadowMatrix;             // = sun.shadow.matrix（world → [0,1]）
uniform mat4  uInvViewProj;
uniform vec3  uCamPos, uSunDir, uSunColor;
uniform float uFogDensity, uAnisotropy, uFrame, uMaxDist;
uniform sampler2D uNormalDepth;
in vec2 vUv; out vec4 oColor;

float HG(float cosT, float g) {             // Henyey-Greenstein 前向散射
  float g2 = g * g;
  return (1.0 - g2) / (4.0 * 3.14159265 * pow(1.0 + g2 - 2.0*g*cosT, 1.5));
}
float Ign(vec2 p){ return fract(52.9829189*fract(dot(p, vec2(0.06711056,0.00583715)))); }

void main() {
  vec4 nd = texture(uNormalDepth, vUv);
  vec4 far = uInvViewProj * vec4(vUv*2.0-1.0, 1.0, 1.0);
  vec3 dir = normalize(far.xyz / far.w - uCamPos);
  float maxT = (nd.w > 0.0) ? min(nd.w / max(dot(dir, -normalize(vec3(0,0,-1))), 1e-3), uMaxDist)
                            : uMaxDist;
  const int STEPS = 28;
  float dt = maxT / float(STEPS);
  float jit = Ign(gl_FragCoord.xy + uFrame * 7.13);
  float t = dt * jit;
  vec3 acc = vec3(0.0);
  float trans = 1.0;
  float phase = HG(dot(dir, -uSunDir), uAnisotropy);
  for (int i = 0; i < STEPS; ++i) {
    vec3 p = uCamPos + dir * t;
    vec4 sc = uSunShadowMatrix * vec4(p, 1.0);
    sc.xyz /= sc.w;
    float lit = (sc.x>0.0 && sc.x<1.0 && sc.y>0.0 && sc.y<1.0 && sc.z<1.0)
              ? texture(uSunShadow, vec3(sc.xy, sc.z - 0.0015)) : 1.0;
    // 高度雾：越低越浓；再叠一层慢速噪声当烟尘团
    float dens = uFogDensity * exp(-max(p.y, 0.0) * 0.09);
    float sigma = dens * dt;
    acc  += trans * lit * uSunColor * phase * sigma;
    trans*= exp(-sigma);
    t    += dt;
    if (trans < 0.01) break;
  }
  oColor = vec4(acc, 1.0 - trans);
}
```
上采样时用**深度感知的双边上采样**（拿 1/2 分辨率的深度和全分辨率深度比，挑最近的那个 tap），否则物体轮廓上会出现一圈漏光。

---

## 7. 抗锯齿

### 7.1 FXAA 3.11（必做，成本最低）
跑在 **sRGB 编码之后**、写屏幕之前。核心是：亮度边缘检测 → 判断边是水平还是垂直 → 沿边两端搜索端点 → 按到端点的距离算亚像素偏移。

```glsl
uniform sampler2D uSource; uniform vec2 uTexel; uniform float uSharpen;
in vec2 vUv; out vec4 oColor;
#define EDGE_MIN     0.0312
#define EDGE_MAX     0.125
#define SUBPIX       0.75
float L(vec3 c){ return sqrt(dot(c, vec3(0.299, 0.587, 0.114))); }

void main() {
  vec3 rgbM = texture(uSource, vUv).rgb;
  float lM = L(rgbM);
  float lN = L(texture(uSource, vUv + vec2(0.0,  uTexel.y)).rgb);
  float lS = L(texture(uSource, vUv + vec2(0.0, -uTexel.y)).rgb);
  float lE = L(texture(uSource, vUv + vec2( uTexel.x, 0.0)).rgb);
  float lW = L(texture(uSource, vUv + vec2(-uTexel.x, 0.0)).rgb);
  float lMin = min(lM, min(min(lN,lS), min(lE,lW)));
  float lMax = max(lM, max(max(lN,lS), max(lE,lW)));
  float range = lMax - lMin;
  if (range < max(EDGE_MIN, lMax * EDGE_MAX)) { oColor = vec4(rgbM, 1.0); return; }

  float lNW = L(texture(uSource, vUv + vec2(-uTexel.x,  uTexel.y)).rgb);
  float lNE = L(texture(uSource, vUv + vec2( uTexel.x,  uTexel.y)).rgb);
  float lSW = L(texture(uSource, vUv + vec2(-uTexel.x, -uTexel.y)).rgb);
  float lSE = L(texture(uSource, vUv + vec2( uTexel.x, -uTexel.y)).rgb);

  float edgeH = abs(lNW + lNE - 2.0*lN) * 2.0 + abs(lW + lE - 2.0*lM) * 4.0
              + abs(lSW + lSE - 2.0*lS) * 2.0;
  float edgeV = abs(lNW + lSW - 2.0*lW) * 2.0 + abs(lN + lS - 2.0*lM) * 4.0
              + abs(lNE + lSE - 2.0*lE) * 2.0;
  bool horz = edgeH >= edgeV;

  float l1 = horz ? lS : lW, l2 = horz ? lN : lE;
  float g1 = abs(l1 - lM), g2 = abs(l2 - lM);
  bool pair1 = g1 >= g2;
  float stepLen = horz ? uTexel.y : uTexel.x;
  if (!pair1) stepLen = -stepLen;
  float lLocal = 0.5 * (pair1 ? (l1 + lM) : (l2 + lM));
  float gScaled = 0.25 * max(g1, g2);

  vec2 uvEdge = vUv;
  if (horz) uvEdge.y += stepLen * 0.5; else uvEdge.x += stepLen * 0.5;
  vec2 off = horz ? vec2(uTexel.x, 0.0) : vec2(0.0, uTexel.y);

  vec2 uv1 = uvEdge - off, uv2 = uvEdge + off;
  float lEnd1 = L(texture(uSource, uv1).rgb) - lLocal;
  float lEnd2 = L(texture(uSource, uv2).rgb) - lLocal;
  bool done1 = abs(lEnd1) >= gScaled, done2 = abs(lEnd2) >= gScaled;
  // 端点搜索：12 步，步长 1,1,1,1,1.5,2,2,2,2,4,8,8（FXAA 3.11 QUALITY__PRESET 12）
  const float QS[12] = float[12](1.,1.,1.,1.,1.5,2.,2.,2.,2.,4.,8.,8.);
  for (int i = 0; i < 12; ++i) {
    if (done1 && done2) break;
    if (!done1) { uv1 -= off * QS[i]; lEnd1 = L(texture(uSource, uv1).rgb) - lLocal;
                  done1 = abs(lEnd1) >= gScaled; }
    if (!done2) { uv2 += off * QS[i]; lEnd2 = L(texture(uSource, uv2).rgb) - lLocal;
                  done2 = abs(lEnd2) >= gScaled; }
  }
  float d1 = horz ? (vUv.x - uv1.x) : (vUv.y - uv1.y);
  float d2 = horz ? (uv2.x - vUv.x) : (uv2.y - vUv.y);
  bool near1 = d1 < d2;
  float dist = min(d1, d2);
  float span = d1 + d2;
  float pxOff = max(0.0, 0.5 - dist / span);
  bool goodSpan = ((near1 ? lEnd1 : lEnd2) < 0.0) != (lM < lLocal);
  if (!goodSpan) pxOff = 0.0;

  // 亚像素混合：抓细线不被端点搜索覆盖的情况
  float lAvg = (2.0*(lN+lS+lE+lW) + lNW+lNE+lSW+lSE) * (1.0/12.0);
  float sub = clamp(abs(lAvg - lM) / max(range, 1e-4), 0.0, 1.0);
  sub = (-2.0*sub + 3.0)*sub*sub;  sub = sub*sub*SUBPIX;
  pxOff = max(pxOff, sub);

  vec2 uvF = vUv;
  if (horz) uvF.y += pxOff * stepLen; else uvF.x += pxOff * stepLen;
  vec3 aa = texture(uSource, uvF).rgb;

  // 顺手做锐化（unsharp）：FXAA 会糊，锐化把细节抢回来
  vec3 blur = (texture(uSource, vUv + vec2( uTexel.x,0)).rgb
             + texture(uSource, vUv + vec2(-uTexel.x,0)).rgb
             + texture(uSource, vUv + vec2(0, uTexel.y)).rgb
             + texture(uSource, vUv + vec2(0,-uTexel.y)).rgb) * 0.25;
  oColor = vec4(clamp(aa + (aa - blur) * uSharpen, 0.0, 1.0), 1.0);
}
```

### 7.2 TAA：可行，但成本在**正确性**不在性能
- **Jitter**：`camera.setViewOffset(w, h, (halton.x-0.5), (halton.y-0.5), w, h)`，Halton(2,3) 8–16 相位。渲染完 `camera.clearViewOffset()`。注意 jitter 会污染 SSAO 的深度重建 —— SSAO 用**未 jitter** 的投影参数即可（误差 <1px，肉眼不可见）。
- **速度缓冲**：MRT slot1 已产出。摄影机-only 的速度可以从深度反投影算，但**任何会动的物体（人物、旗帜、烟）必须写真速度**，否则鬼影拖成一条。
- **重投影 + neighborhood clamp**（YCoCg 空间的 variance clipping 最稳）：

```glsl
vec3 RGB2YCoCg(vec3 c){ return vec3(0.25*c.r+0.5*c.g+0.25*c.b, 0.5*c.r-0.5*c.b, -0.25*c.r+0.5*c.g-0.25*c.b); }
vec3 YCoCg2RGB(vec3 c){ return vec3(c.x+c.y-c.z, c.x+c.z, c.x-c.y-c.z); }

vec2 vel = texture(uVelocity, vUv).xy;
vec3 cur = RGB2YCoCg(texture(uCurrent, vUv).rgb);
vec3 his = RGB2YCoCg(texture(uHistory, vUv - vel).rgb);

vec3 m1 = vec3(0.0), m2 = vec3(0.0);
for (int y=-1; y<=1; ++y) for (int x=-1; x<=1; ++x) {
  vec3 s = RGB2YCoCg(texture(uCurrent, vUv + vec2(x,y)*uTexel).rgb);
  m1 += s; m2 += s*s;
}
vec3 mu = m1/9.0, sigma = sqrt(max(m2/9.0 - mu*mu, 0.0));
vec3 lo = mu - 1.25*sigma, hi = mu + 1.25*sigma;
his = clamp(his, lo, hi);

float blend = mix(0.12, 1.0, clamp(length(vel)*40.0, 0.0, 1.0)); // 快动时更信当前帧
bool valid = all(greaterThanEqual(vUv - vel, vec2(0.0))) && all(lessThanEqual(vUv - vel, vec2(1.0)));
oColor = vec4(YCoCg2RGB(valid ? mix(his, cur, blend) : cur), 1.0);
```
- **代价**：+2 个 RGBA16F 历史 RT（23MB）、+0.4~0.7ms、+一整套"鬼影 bug"。**建议默认关，作为 high/ultra 档的可选项**；FXAA+MSAA4x 已经能覆盖 90% 的观感需求，而 TAA 出鬼影是"看一眼就掉档"的负分项。

---

## 8. 运动模糊

有速度缓冲就直接沿速度方向采样；没有就用深度重建（只有相机运动）：

```glsl
uniform sampler2D uHdr, uVelocity;
uniform float uMotionScale, uShutter;   // uShutter = dt / (1/60) 归一化
vec3 MotionBlur(vec2 uv) {
  vec2 v = texture(uVelocity, uv).xy * uMotionScale * uShutter;
  float len = length(v * uResolution);
  int taps = int(clamp(len, 1.0, 12.0));
  if (taps <= 1) return texture(uHdr, uv).rgb;
  vec3 sum = vec3(0.0); float wsum = 0.0;
  float jit = Ign(gl_FragCoord.xy + uFrame * 1.618) - 0.5;
  for (int i = 0; i < 12; ++i) {
    if (i >= taps) break;
    float t = (float(i) + 0.5 + jit) / float(taps) - 0.5;
    vec2 su = uv - v * t;
    // 深度权重：别把远景的速度糊到近景人物脸上
    float w = exp(-abs(texture(uNormalDepth, su).w - texture(uNormalDepth, uv).w) * 0.5);
    sum += texture(uHdr, su).rgb * w; wsum += w;
  }
  return sum / max(wsum, 1e-4);
}
```
`uMotionScale` 0.4–0.8；**必须钳最大位移**（≤ 屏宽 4%），否则快速转身会拉成一坨。FPS 里还要额外把"武器模型"排除（单独 layer，速度写 0），不然开镜时枪身糊掉，手感立刻塌。

---

## 9. 画面质感层（Composite 里一条龙）

顺序不能乱：**运动模糊 → 加体积/bloom → 曝光 → ACES → LUT/分级 → 暗角 → 色差 → 颗粒 → sRGB**。

```glsl
vec3 col = MotionBlur(vUv);
col += texture(uVolumetric, vUv).rgb * uVolStrength;
vec3 bloom = texture(uBloom, vUv).rgb;
bloom *= (1.0 + texture(uLensDirt, vUv).r * uDirt * smoothstep(0.2, 1.5, Luma(bloom)));
col = mix(col, bloom, uBloomStrength);              // mix 比 += 更可控
col = ACESFilmic(col);                              // 内含 uExposure

// --- lift / gamma / gain（ASC-CDL 风格）---
col = clamp(col, 0.0, 1.0);
col = uLift + col * (uGain - uLift);                // lift 抬黑位、gain 拉白位
col = pow(max(col, 0.0), 1.0 / uGammaLGG);
// --- 3D LUT（32³ 烘进 1024×32 的 CanvasTexture 条带）---
col = mix(col, SampleLut(col), uLutAmount);
// --- 对比 + 饱和 ---
col = (col - 0.5) * uContrast + 0.5;
col = mix(vec3(Luma(col)), col, uSaturation);

// --- 暗角：压亮度，不是叠黑纱 ---
vec2 q = (vUv - 0.5) * vec2(uResolution.x / uResolution.y, 1.0);
float vig = 1.0 - uVignette * smoothstep(0.35, 0.95, length(q));
col *= vig;                                          // 乘法 → 黑的地方更黑，不发灰

// --- 色差：只在边缘拉开，中心保持锐利 ---
float r2 = dot(q, q);
vec2 caOff = normalize(q + 1e-6) * uAberration * r2;
// （实际实现要在 MotionBlur 之前分通道采样，这里示意偏移量的形状）

// --- 胶片颗粒：中间调最明显、时间抖动 ---
float g = Ign(gl_FragCoord.xy + fract(uFrame * 0.6180339887) * 1024.0) - 0.5;
float gw = 1.0 - abs(Luma(col) * 2.0 - 1.0);         // 暗部/亮部少，中间调多
col += g * uGrain * gw;

// --- 最后一步：手写 sRGB 编码 ---
vec3 srgb = mix(col * 12.92,
                1.055 * pow(max(col, vec3(0.0)), vec3(1.0/2.4)) - 0.055,
                step(vec3(0.0031308), col));
oColor = vec4(clamp(srgb, 0.0, 1.0), 1.0);
```

**3D LUT 用 CanvasTexture 烘**：32³ → 1024×32 条带，第 b 层放在 x∈[b*32, b*32+32)。

```js
function BakeLut(size = 32, grade = (r,g,b)=>[r,g,b]) {
  const cv = document.createElement('canvas');
  cv.width = size * size; cv.height = size;
  const ctx = cv.getContext('2d', { willReadFrequently: false });
  const img = ctx.createImageData(cv.width, cv.height);
  for (let b = 0; b < size; b++)
    for (let g = 0; g < size; g++)
      for (let r = 0; r < size; r++) {
        const [R, G, B] = grade(r/(size-1), g/(size-1), b/(size-1));
        const i = ((g * cv.width) + (b * size + r)) * 4;
        img.data[i]=R*255; img.data[i+1]=G*255; img.data[i+2]=B*255; img.data[i+3]=255;
      }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.NoColorSpace;        // ★ LUT 是查表数据，不是颜色
  tex.minFilter = tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.generateMipmaps = false;
  tex.flipY = false;                          // ★ 否则 GLSL 里 y 要反着算
  return tex;
}
```
```glsl
uniform sampler2D uLut; const float LUT = 32.0;
vec3 SampleLut(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  float bz = c.b * (LUT - 1.0);
  float b0 = floor(bz), b1 = min(b0 + 1.0, LUT - 1.0), f = bz - b0;
  // 每格内缩半像素，防止相邻切片互相渗色
  vec2 uvBase = vec2(c.r * (LUT-1.0) + 0.5, c.g * (LUT-1.0) + 0.5) / vec2(LUT*LUT, LUT);
  vec2 s0 = uvBase + vec2(b0 * LUT / (LUT * LUT), 0.0);
  vec2 s1 = uvBase + vec2(b1 * LUT / (LUT * LUT), 0.0);
  return mix(texture(uLut, s0).rgb, texture(uLut, s1).rgb, f);
}
```

---

## 10. 阴影：没有 addon 的最简 CSM

### 路线 A（推荐，~120 行，就是 three CSM addon 的原理）
建 **N 盏同方向 DirectionalLight**，各自持有一张阴影图；用 `onBeforeCompile` 改写 `<lights_fragment_begin>`，按片元视深度只让**一盏**贡献。

```js
// 1) 分级：对数/均匀混合（λ=0.6，室内窄场景可以到 0.8）
function SplitCascades(near, far, count, lambda = 0.6) {
  const s = [near];
  for (let i = 1; i < count; i++) {
    const p = i / count;
    const logD = near * Math.pow(far / near, p);
    const uniD = near + (far - near) * p;
    s.push(lambda * logD + (1 - lambda) * uniD);
  }
  s.push(far);
  return s;   // [n, d1, d2, f]
}

// 2) 每级拟合正交相机 + 纹素吸附（不吸附 = 走路时阴影边缘沸腾）
function FitCascade(light, camera, zn, zf, mapSize) {
  const corners = FrustumCornersWorld(camera, zn, zf);          // 8 个角
  const center = corners.reduce((a,c)=>a.add(c), new THREE.Vector3()).multiplyScalar(1/8);
  let radius = 0;
  for (const c of corners) radius = Math.max(radius, c.distanceTo(center));
  radius = Math.ceil(radius * 16) / 16;                         // 稳定半径
  const texel = (radius * 2) / mapSize;
  // 把 center 吸附到光空间的纹素栅格上
  const lightDir = light.position.clone().sub(light.target.position).normalize();
  const lv = new THREE.Matrix4().lookAt(new THREE.Vector3(), lightDir.clone().negate(), new THREE.Vector3(0,1,0));
  const inv = lv.clone().invert();
  const cl = center.clone().applyMatrix4(inv);
  cl.x = Math.floor(cl.x / texel) * texel;
  cl.y = Math.floor(cl.y / texel) * texel;
  center.copy(cl).applyMatrix4(lv);

  light.position.copy(center).addScaledVector(lightDir, radius + 20);
  light.target.position.copy(center);
  light.target.updateMatrixWorld();
  const cam = light.shadow.camera;
  cam.left = -radius; cam.right = radius; cam.top = radius; cam.bottom = -radius;
  cam.near = 0.5; cam.far = radius * 2 + 40;
  cam.updateProjectionMatrix();
}
```

```js
// 3) 材质补丁：只让当前级贡献
material.onBeforeCompile = (shader) => {
  shader.uniforms.uCascadeSplits = { value: new THREE.Vector4(8, 24, 70, 200) };
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <lights_fragment_begin>', /* glsl */`
      uniform vec4 uCascadeSplits;
      #include <lights_fragment_begin>`)
    // three 的 dir light 循环是 unroll 过的宏，最稳的做法是在循环之后把
    // 非当前级的贡献减掉 —— 更简单的等效做法：给每级灯 intensity 做逐片元 mask。
    ;
};
```
实践中更省事的等效实现：**保留 three 的 dir light 循环不动**，改为在 `<lights_fragment_begin>` 之前重写 `getShadow` 的入口宏，让不匹配级别的灯返回 `1.0`（不遮挡）+ 把该灯的 `directionalLights[i].color` 逐片元乘 0。因为 `directionalLights` 是 uniform 结构体数组不能逐片元改，所以最干净的是**直接整段替换 `ShaderChunk.shadowmap_pars_fragment`**（`ShaderChunk` 是导出的可变对象）：

```js
THREE.ShaderChunk.shadowmap_pars_fragment =
  THREE.ShaderChunk.shadowmap_pars_fragment.replace(
    'float getShadow( sampler2DShadow shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {',
    `uniform vec4 uCascadeSplits;
     varying float vCascadeDepth;
     float getShadow( sampler2DShadow shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {`
  );
```
再在 `getShadow` 体内加一句"超出本级范围直接 return 1.0"。这必须在**任何材质编译之前**执行一次（模块顶层），否则一半材质用旧 chunk。

### 路线 B（低配档）
只留 1 盏灯 + 单张 2048 阴影图，`shadow.camera` 只覆盖玩家周围 60m，远处靠**距离雾 + 体积雾**盖掉没有阴影的事实。60m 之外本来也看不清阴影边界。

### PCF 的实情（r185）
`SHADOWMAP_TYPE_PCF` 已经内置 **Vogel 盘 5 抽样 + interleavedGradientNoise 旋转**（就是 Poisson PCF 的现代版）。所以：
```js
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;   // ★ 不是 PCFSoftShadowMap
sun.shadow.radius = 2.5;        // 直接控软硬
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.035;  // 斜面痤疮靠这个，不是靠把 bias 调大
sun.shadow.intensity = 1.0;     // r165+ 新字段，可以做"阴影别死黑"
```
想要更软的 8 抽样自定义 Poisson，就替换上面那段 chunk 里的 5 个 `vogelDiskSample` 为 8 个固定 Poisson 常量 —— 但代价是每盏灯每片元 +3 次 `sampler2DShadow` 采样。VSM（`VSMShadowMap`）能给真正的大范围软阴影（`blurSamples` 可调），但有漏光，室外柱子/树叶场景不建议。

---

## 11. 材质：CanvasTexture 程序化烘四张图 + 三平面

仓库里 `Script_TexBake.mjs` 已经做对了骨架（`BakeMaps` → albedo/normal(A=height)/orm），沿用即可。要点：

**高度图 → 法线（Sobel，环绕取样保证无缝）**：
```js
export function HeightToNormal(height, size, strength = 2.0) {
  const data = new Uint8ClampedArray(size * size * 4);
  const at = (x, y) => height[(((y % size) + size) % size) * size + (((x % size) + size) % size)];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    // Sobel 比中心差分抗噪，法线不会一格一格跳
    const dX = (at(x+1,y-1) + 2*at(x+1,y) + at(x+1,y+1))
             - (at(x-1,y-1) + 2*at(x-1,y) + at(x-1,y+1));
    const dY = (at(x-1,y+1) + 2*at(x,y+1) + at(x+1,y+1))
             - (at(x-1,y-1) + 2*at(x,y-1) + at(x+1,y-1));
    let nx = -dX * strength, ny = -dY * strength, nz = 1.0;
    const inv = 1 / Math.hypot(nx, ny, nz);
    const i = (y * size + x) * 4;
    data[i]   = (nx*inv * 0.5 + 0.5) * 255;
    data[i+1] = (ny*inv * 0.5 + 0.5) * 255;
    data[i+2] = (nz*inv * 0.5 + 0.5) * 255;
    data[i+3] = Clamp01(height[y*size+x]) * 255;   // A 存高度，视差/混合备用
  }
  return data;
}
```

**颜色空间**（这条错了整个画面会"洗白或发闷"）：
```js
albedo.colorSpace = THREE.SRGBColorSpace;   // 只有 albedo/emissive 是 sRGB
normal.colorSpace = THREE.NoColorSpace;     // 法线/ORM/粗糙度/金属度/高度都是数据
orm.colorSpace    = THREE.NoColorSpace;
```
`Texture` 的默认 `colorSpace` 是 `NoColorSpace`（core 7266），`CanvasTexture` 继承它 —— 所以**忘记给 albedo 设 SRGBColorSpace** 是最常见的翻车（画面整体发灰发白、对比度上不去）。

**ORM 打包**：R=AO, G=roughness, B=metalness，一张图喂 `aoMap`/`roughnessMap`/`metalnessMap`（three 会自己取 `.r`/`.g`/`.b`）。记得 `aoMap` 走 uv2 —— 需要 `geometry.setAttribute('uv1', geometry.attributes.uv)`（r152+ 用 `uv1` 而非 `uv2`）。

**三平面映射**（避免地形/瓦砾拉伸），用 `onBeforeCompile` 换掉 `<map_fragment>` 和 `<normal_fragment_maps>`：
```glsl
// vWorldPos / vWorldNormal 由 <worldpos_vertex> 提供（需在 vertexShader 里加 varying）
vec3 TriplanarSample(sampler2D t, vec3 wp, vec3 wn, float scale) {
  vec3 b = pow(abs(wn), vec3(4.0));          // 4 次幂 → 过渡带窄，不糊
  b /= (b.x + b.y + b.z);
  vec3 cx = texture2D(t, wp.zy * scale).rgb;
  vec3 cy = texture2D(t, wp.xz * scale).rgb;
  vec3 cz = texture2D(t, wp.xy * scale).rgb;
  return cx * b.x + cy * b.y + cz * b.z;
}
// 法线要用 "whiteout blend"，不能直接三向平均：
vec3 TriplanarNormal(sampler2D t, vec3 wp, vec3 wn, float scale) {
  vec3 b = pow(abs(wn), vec3(4.0)); b /= (b.x+b.y+b.z);
  vec3 nx = texture2D(t, wp.zy*scale).xyz*2.0-1.0;
  vec3 ny = texture2D(t, wp.xz*scale).xyz*2.0-1.0;
  vec3 nz = texture2D(t, wp.xy*scale).xyz*2.0-1.0;
  nx = vec3(nx.xy + wn.zy, abs(nx.z) * wn.x);
  ny = vec3(ny.xy + wn.xz, abs(ny.z) * wn.y);
  nz = vec3(nz.xy + wn.xy, abs(nz.z) * wn.z);
  return normalize(nx.zyx*b.x + ny.xzy*b.y + nz.xyz*b.z);
}
```

**各向异性金属**（刺刀、枪管、铁轨）：`MeshPhysicalMaterial` 的 `anisotropy` / `anisotropyRotation` / `anisotropyMap` 在 r185 里是**真实装的**，直接用；配合 `clearcoat = 0.25, clearcoatRoughness = 0.15` 给漆面/油膜。IBL 必须存在（`scene.environment` 来自 `PMREMGenerator.fromScene(skyScene, 0.04)`），否则金属只有一坨黑。

---

## 12. 全局光照：半实时辐照度探针体（`Script_Gi.mjs`）

> 这一节记的是**间接光**。前面十一节讲的是「一盏太阳 + 一张天空 IBL + 屏幕空间遮蔽」怎么拍得好看；这一节讲的是把那张各向同性的天空 IBL 换掉，让间接光第一次有位置。

### 12.0 先说要解决的那条实测

`SKY_PRESETS` 的注释里记着一条反复出现的账：

> 把 `lightIntensity` 从 3.1 一路抬到 30，街上墙面只从 sRGB 88.5 动到 89.8。

结论当时写的是「平行光一点都没照进街里，全场亮度都来自 `scene.environment` 那张天空 IBL」。这条诊断是对的，但它还有下半句：**那张 IBL 从各个方向来的值差不多，而且全场每一点拿到的是同一张**。于是

- 街上和屋里一个亮度；
- 墙根和墙头一个亮度；
- 晒得发白的砖墙不会把暖色弹到对面的阴影墙上；
- 着火的院子不会把橙色泼到半条街上。

`envIntensity` 这根旋钮只能整体升降，永远换不来「屋里比街上暗」。这是**结构问题，不是调色问题**。

### 12.1 选型：为什么是探针，为什么是这种探针

参考的是《全境封锁》(Snowdrop) 那一路「半实时探针」：一格一格地摆探针，每帧只更新一小撮，结果存成低阶表示，材质里插值取用；上一次的结果喂回下一次，多次反弹白送。**没有预烘焙**，换时段/起火自己会收敛过去。

本作在它之上换了两处，都是为了 WebGL2 这块地：

**(1) 更新探针不靠渲 cubemap，靠射线。**
Snowdrop 是把场景往探针的小立方体上渲六个面。three 里那等于每个探针 6 次 `renderer.render()` —— 光 JS 侧的遍历/剔除/状态机开销就吃掉几毫秒，一帧更新不了几个探针。这里改成在 shader 里对**碰撞盒代理体**做解析光追：`BuildSink` 为了物理早就攒了一张 AABB 表（一关几百到几千个盒子），拿来当 GI 的代理几何体是白捡的。代价是间接光看到的世界是「体块版」的城 —— 对漫反射间接光完全够用，而换来的是**一帧 5 个 draw call 更新十几个探针**。

**(2) 带可见性的八面体探针（DDGI），不是球谐。**
SH 只有辐照度、没有遮挡，街对面的太阳光会直接漏进屋里 —— 巷战场景里这是致命的。每个探针除了 8×8 的八面体辐照度，另存一张 16×16 的「到最近遮挡物的距离一阶矩/二阶矩」，取样时做切比雪夫检验（方差阴影那一套）。**墙这才真的挡光。**

> **r185 自带的那条为什么不用**：`lightprobes_pars_fragment` 里有 `USE_LIGHT_PROBES_GRID`（SH-L2 存在 `sampler3D` 里，`getLightProbeGridIrradiance()`）。两条硬伤：一是它由 `materialProperties.lightProbeGrid` 喂**烘焙资产**，而本作要的是随时段与火光实时收敛；二是它只有三线性插值、没有可见性项，漏光挡不住。

### 12.2 一帧五个 draw call

```
[1] Trace   (rays × batch) 的小靶，一个像素一根射线
            → 对 AABB 汤求交；命中点 = 太阳(带阴影射线) + 火光 + 上一帧探针的间接光
            → 漏空 = 天空解析式（不含太阳盘）
            输出 RGBA16F：rgb = 入射辐射亮度，a = 命中距离
[2] Copy    上一帧的辐照度图集整张搬到 ping-pong 的另一面
[3] BlendI  实例化四边形，把这一批探针的辐照度瓦片写进图集，与上一帧按迟滞混合
[4] Copy    距离图集同上
[5] BlendD  距离矩瓦片同上
```

`[2]/[4]` 那两次整张拷贝是 WebGL 的硬约束：**不能边读边写同一张靶**，而我们每帧只重算十几个瓦片，其余必须留着。图集很小（high 档 140×700 与 252×1260），这两次拷贝的带宽可以忽略。

`[3]/[5]` 用 `InstancedBufferGeometry`：每个实例一个瓦片，顶点着色器按瓦片在图集里的行列直接算裁剪空间坐标。**这样十几个散落在图集各处的瓦片一次 draw 就写完了** —— 否则要么一个瓦片一次 draw，要么只能更新图集里连续的一行（探针的刷新顺序就被存储布局绑死）。

### 12.3 关键数与画质档

| 档 | 探针格数 | 格距 | 覆盖 | 射线/探针 | 每帧更新 | 扫满一遍 |
|---|---|---|---|---|---|---|
| ultra | 16×6×16 = 1536 | 3.5 m | 56×21×56 m | 96 | 16 | 96 帧 ≈ 1.6 s |
| high | 14×5×14 = 980 | 4.0 m | 56×20×56 m | 64 | 12 | 82 帧 ≈ 1.4 s |
| medium | 10×4×10 = 400 | 5.0 m | 50×20×50 m | 32 | 8 | 50 帧 ≈ 0.8 s |
| low | **不建** | | | | | |

辐照度瓦片 8×8 + 1 像素边框 = 10×10；距离瓦片 16×16 + 边框 = 18×18。图集布局：列 = `counts.x`，行 = `counts.y * counts.z`。

**为什么一两秒的收敛延迟可以接受**：这一关的太阳不动，天也基本不动，探针体唯一需要追的是「玩家走动带进来的新格子」—— 而那些格子是**插队优先算**的（`dirty` 队列），几帧就补上。真正会看出延迟的是「一栋房子突然烧起来」，间接光会用一秒左右泛上去 —— 那反而像样。

### 12.4 探针体是跟着玩家滚的裁剪图

体积中心跟着镜头走，但**按格距吸附**（和阴影框的纹素吸附是同一个道理：不吸附就会整场爬行）。存储下标用环形取模（`storage = (worldCell + count) % count`），所以走一步只有真正滚进来的那一层作废重算，其余探针连位置都不用动。

滚进来的探针要做三件事：

1. **重定位**。探针落在墙体里就没有意义（射线全部从墙内出发）。CPU 侧拿同一张 AABB 表判：在盒子里就往外挤半格（先试六个正方向再试斜的），挤不出去的标记作废，取样时权重直接为 0。**这一条比任何 shader 技巧都管用** —— 有了 CPU 侧的精确 AABB 表，就不必像 RTXGI 那样靠射线统计去猜探针是不是埋着。
2. **迟滞归零**。新探针上一帧的值是**别的地方**的光，按迟滞混进来就是一坨拖影。所以这一批里只要有新生探针就整批降迟滞（批次 ≤16，代价只是多噪一帧）。
3. **代理盒重选**。按体积 + 24 m 外扩挑盒子（阴影射线要打得着体积外面的墙，不然屋顶挡不住太阳），超过上限 768 个就按到体心的距离取最近的。

### 12.5 取样端：三个权重缺一不可

注在 `MeshStandardMaterial` 的 `<lights_fragment_maps>` 之后（`Script_Materials.InjectIndirectLighting`），八个角的探针按下面三项加权平均：

| 权重 | 干什么 | 缺了会怎样 |
|---|---|---|
| 三线性 | 位置插值 | 探针格子的棋盘格会直接显出来 |
| 背面项 `(dot(dirToProbe, N)*0.5+0.5)²` | 探针在这块面背后就基本不算数 | 墙背面的探针把光带穿过来 |
| **切比雪夫** | 探针与着色点之间有没有遮挡 | **屋里漏一片天光**，整套白做 |

外加 DDGI 那两条工程细节：法线/视线偏置（把取样点推离表面，免得自遮挡）、以及把极小权重再往下压一档（八个角里混进一个「勉强算数」的会把结果整体带偏）。

图集里存的是**余弦加权的平均辐射亮度**，取样时乘 π 才是 three 的 `iblIrradiance` 量纲（`getIBLIrradiance()` 返回的就是 `PI * envColor * intensity`）。

### 12.6 与既有那三盏光的分工（不分清就是双份）

| 谁 | GI 上了之后干什么 |
|---|---|
| 平行光（太阳） | **不动**。直接光始终是解析的，探针射线里的天空刻意**扣掉太阳盘** —— 否则同一份太阳算两遍，而且 64 根射线采 0.003 大小的盘必炸方差 |
| 天空 IBL（PMREM） | 漫反射那一路被探针**替换**；镜面那一路留着，但按 GI/天空的亮度比做一次遮蔽（屋里的金属件不该照样反着一片亮天） |
| 半球光 | 退成 0.3 倍底噪（`LightRig.SetGiActive`）。它原本干的就是「天空把冷色洒到朝上的面」，而这正是探针算得**更准**的那部分（它还知道头顶有没有屋顶） |
| SSAO | **不动**。两者尺度不同：探针管米级的「这间屋子有多暗」，AO 管厘米级的「墙根接触处」。AO 依旧只乘间接光 |
| 火光（点光源） | 直接光照旧走 `PointLight`；探针只收它的**反弹**（射线命中点上算火光，漏空的射线不算），所以着火的院子会把橙色泼到半条街上 |
| `envIntensity` | 继续有效 —— 它是美术为每一关定的「天有多强」，`ProbeVolume.ApplyPreset()` 把它乘进 `uGiIntensity` |

### 12.7 成本

RTX 4070 SUPER / 1280×720 / high 档，**A/B/A/B 交替各 6 轮取中位数**（单向测量会把场景自身的漂移——AI 死人、烟散——算成 GI 的开销，第一次就是这么测出「+11 ms」这个假数的）：

| | ms/帧 |
|---|---|
| GI 全开 | 9.77 |
| 只取样、不更新探针 | 10.42 |
| GI 关 | 10.87 |

即**噪声以内**。合理：更新侧一帧只有 5 个 draw call、追踪靶只有 `64×12 = 768` 个像素；取样侧每个不透明像素多 24 次纹理取样，但那都是小图集里的命中。低端机的账没测，`low` 档直接不建探针体，画质面板里也有开关。

七关开机冒烟（`Script_BootTest`）在 GI 打开后 draw call 890–1224、三角 0.2M–2.4M，仍在当前 5000 / 6.0M 的红线内。

### 12.8 怎么验

```bash
node Taierzhuang1938/Script_GiTest.mjs
```

查的是数值不是观感 —— 图集全黑、切比雪夫恒为 0、探针全被判成埋在墙里，这三种情况画面都还在，只是「间接光没了」，光看截图很容易当成美术风格：

1. 页面无控制台报错（**shader 编译失败 three 是静默吞掉的**）；
2. 代理盒表非空（否则射线全部漏空，探针体退化成一张天空 IBL）；
3. 图集收敛（`blend` 到 1）且有能量（半浮点靶按 `Uint16` 读回来解码）；
4. 有效探针过半（全被判死等于 GI 没上）；
5. **`gi=1` 与 `gi=0` 两张图必须不一样**（注入没生效的话它们会一模一样）。

肉眼看用探针页：

```
Probe.html?scene=street&preset=smokyDay&gi=1            # 开
Probe.html?scene=street&preset=smokyDay&gi=0            # 关
Probe.html?scene=street&preset=smokyDay&gi=1&giDebug=1  # 画探针球（紫色 = 该探针埋在几何体里、已作废）
```

正片同样吃 `?gi=0`，画质面板「画质 → 全局光照（探针体）」里有开关与强度。

### 12.9 已知的近似（都是有意的，别当 bug 修）

- **地面按平面处理**，但平面取体积脚印内的**最低**地面（`ProbeVolume.SampleGroundY`，每次滚动重采样）。曾经取体积中心一点：城内台地没事，界河这种向河槽下降近 2 m 的野外会让整层探针沉到平面之下 —— 朝下的射线打不到平面直接看见天，凹地整片被天光灌成银白，断层正好在地形跌破平面的等值线上。平面放低无光学代价（朗伯地面的出射辐射亮度与距离无关），高于平面的地形起伏仍被忽略。
- **代理体只有碰撞盒**。没有碰撞盒的东西（薄贴片、旗、烟）对 GI 不存在；反过来，碰撞盒比实际几何体胖的地方，间接光会略偏暗。
- **反照率按 `tag` 查表**（`GI_ALBEDO`），不是真材质。整座城是青砖 + 夯土 + 土路，色域很窄，这个近似的误差远小于「有没有位置感」的收益。要更准就得让 `BuildSink.Solid()` 记下材质名。
- **单级 cascade**。体积外（56 m 开外）退回天空 IBL，边缘按 `confidence` 平滑过渡。远景本来就被雾吃掉了。
- **动态物体不写进 GI**。士兵、载具不参与反弹（它们只是 GI 的接收者）。

---

## 13. 性能预算（1600×900，1.44 MPix）

中端笔记本独显（GTX 1650 / RTX 3050M 量级）实测量级估算：

| Pass | 分辨率 | 预算 (ms) | 备注 |
|---|---|---|---|
| CSM 3 级 @2048 | — | 1.2–2.5 | 与场景 draw call 线性相关；静态几何可缓存 cascade2 每 4 帧更新一次 |
| PrePass (MRT×2) | 1.0× | 0.6–1.2 | 带宽敏感；`NearestFilter` 别开 mipmap |
| SSAO 14 抽样 | 0.5× | 0.35–0.7 | 半分辨率是必须的，全分辨率翻 4 倍 |
| 双边模糊 ×2 | 0.5× | 0.15–0.3 | |
| **主渲染 HDR + MSAA4x** | 1.0× | **3.5–6.0** | 全帧最大头，材质复杂度主导 |
| 体积雾 raymarch 28 步 | 0.5× | 0.9–1.8 | 步数是唯一旋钮 |
| Bright + 降 5 + 升 5 | 0.5×→ | 0.65–1.05 | 带宽为主 |
| God rays 48 步 | 0.25× | 0.3–0.6 | 太阳出屏直接跳过 |
| Composite | 1.0× | 0.5–0.9 | 含 12 抽样运动模糊 |
| TAA resolve | 1.0× | 0.4–0.7 | |
| FXAA + Sharpen | 1.0× | 0.25–0.45 | |
| **合计** | | **8.8–16.2** | 60fps 预算 16.6ms，high 档刚好卡住 |

显存：`rtHdr(16F, MSAA4x)` ≈ 46MB(多重采样) + 11.5MB(解析) ；`rtPre` 2×11.5MB + depth 5.8MB；TAA 历史 2×11.5MB；bloom 链 ping-pong ≈ 8MB；ldr 5.8MB → **约 110–125MB**。集显（Iris Xe / Vega 8）上这已经吃紧，低配档必须砍。

**分级降档表**：

| 档位 | MSAA | SSAO | Bloom 级 | 体积 | TAA | 阴影 | 目标 |
|---|---|---|---|---|---|---|---|
| ultra | 4× | 24 抽样 @0.5 | 6 | 40 步 @0.5 | 开 | 3 级 @2048 | 桌面独显 |
| high | 4× | 14 抽样 @0.5 | 5 | 28 步 @0.5 | 关 | 3 级 @2048 | 默认 |
| medium | 2× | 10 抽样 @0.5 | 4 | 16 步 @0.35 | 关 | 2 级 @1536 | 笔记本独显 |
| low | 0 | **关** | 3 | **关** | 关 | 1 级 @1024 | 集显 |

**自动降档**：用滑动窗口统计最近 90 帧的 `performance.now()` 帧间隔，中位数 >20ms 连续 2 秒就降一档；升档要更保守（<13ms 持续 8 秒才升一档），且**每次降档后锁 30 秒**，避免在临界点来回抖。低配档同时把 `renderer.setPixelRatio(1)` 并允许 0.85× 内部分辨率 + FXAA 拉回来。

---

## 14. 常见翻车（按被踩频率排序）

见 `pitfalls` 字段，每条都对应本仓库 r185 的实际行为。

---

## 15. 落地建议（针对现有 `Taierzhuang1938/`）

现有 `Script_Post.mjs`（30KB）已经把 §2/§3(非 MRT)/§4/§5/§6.1/§7.1/§8/§9(部分) 做出来了，且顺序是对的。要补的差量按优先级：

1. **`Script_Probe.mjs:26` 改 `PCFShadowMap`** —— 一行，画质跳档（当前是硬阴影）。
2. 预通道改 **MRT**，顺带产出 velocity（现在的运动模糊是纯深度重建，动的物体没有速度）。
3. 加 **§6.2 体积雾**（吃阴影图的那种）—— 台儿庄巷战的烟尘/斜射光是整个题材的画面记忆点，这一条的"观感增量/工时"比是全表最高的。
4. 加 **§10 CSM**（现在是单张 260m 远的正交阴影，近处纹素密度必然不够，接触阴影糊）。
5. 加 **§9 的 3D LUT + 镜头脏污**（现在只有 lift/gain）。
6. 给所有粒子/贴片材质设 `allowOverride = false`。
7. TAA 最后做，且默认关。


---

## 「3A 观感」验收清单（视觉审查 agent 的评分表）

### [中] 接触阴影（AO）真的贴着物体根部
- **为什么**：SSAO 是把物体“钉”在地面上的唯一手段。没有它，所有几何体都像浮在贴图上，是“网页 demo 感”的第一来源。
- **怎么在截图上验**：找沙袋/木箱/墙角与地面的交线：应该有一条 3–10 像素宽、由深到浅的暗带，紧贴接缝，且随几何形状弯折。若暗带整墙均匀发灰 → 半径太大；若完全没有 → AO 没注入或被注入到直接光。
### [低] AO 只压间接光，背光面没有死黑
- **为什么**：把 AO 乘到最终颜色上会让阴影里的物体变成纯黑剪影，丢掉所有材质信息 —— 这是最容易被误判成“对比度高=高级”的陷阱。
- **怎么在截图上验**：看画面里完全背光的墙面/人物背部：仍应能分辨砖缝、布料褶皱和颜色倾向（偏蓝的天光），而不是一整块 RGB(8,8,8)。
### [低] 远近景有可读的雾/大气层次（至少 3 层深度）
- **为什么**：3A 画面的“空间感”几乎全靠大气透视。单一深度的画面无论多少细节都显得平。
- **怎么在截图上验**：沿视线方向找三组物体（<10m / 30m / 80m+）：三者的对比度和饱和度应逐级下降，最远那组应明显偏向天空色。用取色器点三处，明度差应 ≥15%。
### [高] 有体积光柱且光柱被几何遮挡切断
- **为什么**：光柱穿过烟尘是巷战题材的记忆点；更重要的是它证明雾在采样阴影图，而不是一层贴上去的渐变。
- **怎么在截图上验**：找门洞/断墙/屋顶缺口：应能看到从缺口射入的锥形光束，且光束在被墙体挡住的位置**干净地断掉**，断口形状与墙的轮廓一致。断口糊成一团 → 只是径向模糊，不是体积雾。
### [中] 泛光是多尺度长尾，不是一圈均匀光晕
- **为什么**：单次高斯只有一个尺度，看起来像给亮部加了描边；多级金字塔的幂律衰减才像真实镜头。
- **怎么在截图上验**：找最亮的光源（太阳/火光/爆点）：应能看到“核心极亮 + 中等半径的晕 + 覆盖大半屏的极淡辉光”三层叠加。若只有一个边界清晰的圆环 → 单级高斯。
### [低] 泛光不糊掉中间调（阈值和 knee 是对的）
- **为什么**：阈值太低会让整个画面蒙一层奶白，是“廉价滤镜”最明显的特征。
- **怎么在截图上验**：看白墙、浅色布料这类高反射率但不发光的表面：它们**不应该**发光外溢。若浅色物体边缘有光晕 → 阈值太低。
### [低] 阴影边缘是软的，且近处比远处锐利
- **为什么**：硬边 1 抽样阴影一眼就是“未完成”；近处糊则暴露没有级联。
- **怎么在截图上验**：同一张图里对比 <8m 的近景阴影（应能看清锯齿级别的清晰边界，过渡带 1–3 px）和 40m+ 的远景阴影（过渡带更宽）。近处阴影边缘出现单像素锯齿或点阵 → 落到 SHADOWMAP_TYPE_BASIC 了。
### [中] 阴影没有痤疮（acne）也没有彼得潘（peter-panning）
- **为什么**：这两个是相反方向的 bias 病，同时避开才说明用了 normalBias 而不是硬调 bias。
- **怎么在截图上验**：看斜面（屋顶、斜坡）上的阳光区：不应有条纹状的明暗摩尔纹；同时看柱子/人腿与地面接触处：阴影不应与物体脱开一段距离。
### [中] 金属件有各向异性/方向性高光，不是一个圆点
- **为什么**：刺刀、枪管、铁轨的拉丝高光是“材质做过功课”的直接证据。
- **怎么在截图上验**：找刺刀刃/枪管/铁轨：高光应沿其长轴拉成一条**带状**，而不是一个各向同性的圆亮斑；转动视角时高光沿长轴滑动而非整体位移。
### [中] 材质有真实的凹凸（法线来自高度场），不是只有颜色变化
- **为什么**：只调 albedo 的程序化材质在斜光下会完全露馅 —— 平的。
- **怎么在截图上验**：找侧向受光的砖墙/夯土墙：砖缝应有明确的**受光侧亮/背光侧暗**，且明暗方向与主光方向一致。若砖缝只是颜色深浅、明暗不随光向变 → 只有 albedo 没有 normal。
### [高] 屋里比街上暗，且暗得有方向

夹道、院内、屋里的间接光必须明显低于街上，且墙面从檐口到墙根有可读的渐变（上面看得见天、下面看不见）。整条巷子一个亮度 = 探针体没生效，或者切比雪夫可见性没起作用（见 §12.8 的查法）。

### [中] 画面里能看到 IBL 反弹光（阴影里带天空色）
- **为什么**：没有环境贴图的场景，阴影区只有一个常数 ambient，颜色是死的。
- **怎么在截图上验**：看阴影中朝上的表面（地面、箱顶）：应比朝下的表面更亮且更偏冷（天空色）。人物下巴、屋檐下方应偏暖（地面反弹）。全场阴影同色 → 没挂 scene.environment。
### [低] 胶片颗粒存在但不抢戏，且中间调最明显
- **为什么**：颗粒是“电影感”的廉价来源，但均匀满屏颗粒会毁掉暗部，亮部有颗粒则像噪点 bug。
- **怎么在截图上验**：100% 放大看三处：纯黑区域应几乎无颗粒、纯白/过曝区域应无颗粒、中间调（水泥墙、皮肤）应有细密可见的颗粒。颗粒粒径应 ≈1 像素，不成块。
### [低] 暗角压的是亮度，四角不发灰
- **为什么**：叠一层黑色半透明是最常见的偷懒做法，结果是四角对比度塌掉、发灰发脏。
- **怎么在截图上验**：取色器点画面四角的暗部：应比中心同类暗部**更黑**（更接近 0），而不是变成中灰。四角若出现“蒙了层雾”的观感 → 用了加法而非乘法。
### [低] 色差只在画面边缘，中心完全锐利
- **为什么**：全屏均匀色差是滤镜，真实镜头的横向色差随半径平方增长。
- **怎么在截图上验**：100% 放大画面正中心的高对比边缘（如天空与屋脊）：应无红蓝分离。再看四角同类边缘：应有可见但克制的红/青分离（≤2 像素）。
### [低] 有明确的色彩分级倾向（不是中性直出）
- **为什么**：3A 画面都有统一的色彩语言；ACES 直出是“技术正确但没有作者”。
- **怎么在截图上验**：用取色器采样画面里的中性灰物体（水泥、石头）：其 RGB 不应相等，应有一致的偏移（例如阴影偏青蓝、高光偏暖黄）。整图直方图的暗部不应贴死在 0（lift 抬起过）。
### [低] 几何边缘无锯齿，但细节没被 AA 糊掉
- **为什么**：锯齿是最刺眼的“未完成”信号；过度 FXAA 则让整图发软，同样掉档。
- **怎么在截图上验**：看屋脊/电线/枪管这类高对比细长边：应平滑无阶梯。同时看砖墙/布料的高频纹理：应仍然清晰可数。若纹理明显发糊 → FXAA 之后缺锐化，或跑在了线性空间。
### [低] 曝光合理：高光不成片死白，暗部不成片死黑
- **为什么**：HDR + ACES 的价值就在于两端都保留信息；直方图两端堆积说明 tonemap 顺序或曝光错了。
- **怎么在截图上验**：截图直方图：0 和 255 两端不应有明显尖峰（各 <2% 像素）。目视天空/太阳周围应有渐变而非一整块纯白；阴影深处应能看出材质。
### [低] 没有明显的 banding（色带）
- **为什么**：HDR→8bit 输出时缺抖动会在天空、雾、暗部渐变里出现同心色带，一眼廉价。
- **怎么在截图上验**：看天空渐变、体积雾内部、暗部大面积渐变：不应出现台阶状的等亮度带。颗粒本身能掩盖大部分 banding —— 若关掉颗粒后出现色带，说明抖动依赖颗粒，可接受但要记录。
### [中] 画面有场景纵深的构图信息（前景遮挡物）
- **为什么**：纯中景平铺的构图无论后处理多好都不像 3A 截图；前中后三层是电影摄影的基本盘。
- **怎么在截图上验**：画面里应能识别出至少一个 <3m 的前景元素（枪身、断墙、草叶）被虚化/压暗，一个中景主体，和一个远景轮廓线。三层俱全才给分。
### [中] 运动模糊（若截取运动帧）方向正确且武器不糊
- **为什么**：FPS 里枪身糊掉会立刻毁掉手感与可读性；模糊方向与相机运动不符则是速度缓冲算错了。
- **怎么在截图上验**：在转身帧截图：背景应沿转身相反方向拉出条带，条带长度 ≤ 屏宽 4%；而屏幕下方的武器模型应保持锐利。武器与背景一起糊 → 没有排除武器 layer。

---

## 坑

- 【本仓库现役 bug】`renderer.shadowMap.type = THREE.PCFSoftShadowMap` 在 r185 = 硬阴影。源码 `shadowMapTypeDefines` 只有 `PCFShadowMap→SHADOWMAP_TYPE_PCF` 和 `VSMShadowMap→SHADOWMAP_TYPE_VSM` 两个 key，`PCFSoftShadowMap`(=2) 落到 `|| 'SHADOWMAP_TYPE_BASIC'`；且 `WebGLShadowMap` 只在 `type === PCFShadowMap` 时设 `compareFunction = LessEqualCompare` + `LinearFilter`，否则是 `NearestFilter` + 无比较。`Script_Probe.mjs:26` 正踩这条 —— 改成 `THREE.PCFShadowMap` 即可拿到硬件 PCF + Vogel 5 抽样。
- 渲进 WebGLRenderTarget 时 three **不做 sRGB 编码**：`WebGLPrograms` 里 `outputColorSpace = (currentRenderTarget === null) ? renderer.outputColorSpace : ColorManagement.workingColorSpace`（module 7585）。所以 `renderer.outputColorSpace = SRGBColorSpace` 对所有中间 RT 无效，只在最后写画布那一 pass 生效 —— 而自定义 ShaderMaterial 如果没写 `#include <colorspace_fragment>` 就连那次也不转。结论：最后一 pass 必须**手写 sRGB 编码**，且所有中间 RT 的 `texture.colorSpace` 一律设 `NoColorSpace`。
- 渲进 RT 时 three 也**不做 tonemap**：`toneMapping` 参数同样被 `currentRenderTarget === null` 门住（module 7549）。留着 `renderer.toneMapping = ACESFilmicToneMapping` 不会报错、当前也不生效，但哪天有一 pass 直渲画布就会 tonemap 两次，画面突然发灰。统一设 `NoToneMapping`，tonemap 全收进 Composite。
- `CanvasTexture` / `Texture` 的默认 `colorSpace` 是 `NoColorSpace`（core 7266）。忘记给 albedo 设 `SRGBColorSpace` → 整个画面发白发灰、对比度上不去；反过来给 normal/ORM/LUT 设了 `SRGBColorSpace` → 法线方向错乱、粗糙度全跑偏。规则：只有 albedo/emissive 是 sRGB，其余全是数据。
- Bloom 必须在 tonemap **之前**。放到 ACES 之后，超亮部早被压到 1.0，阈值提取不出任何东西，只能靠把阈值降到 0.6 来“伪造”泛光，结果整屏发奶白。同理 SSAO 必须在材质里注入间接光，不能在 Composite 里乘最终颜色。
- `Scene.overrideMaterial` 在 r165+ 加了 `material.allowOverride === true` 闸门（module 18102），默认 true —— 意味着 **Sprite / Points / 粒子也会被 override**，几何属性对不上，预通道里蹦出糊在原点的方块，SSAO 直接乱掉。给所有贴片/粒子材质设 `allowOverride = false`，或用 `Layers` 隔离。
- 预通道覆盖材质忘记 `#include <batching_pars_vertex>` / `<skinning_*>` / `<morph*>` → `InstancedMesh` 的瓦砾全部塌回原点、骨骼角色变成 T-pose 剪影，SSAO 和运动模糊跟着一起废。用 three 的 chunk 拼顶点着色器，别自己写 `projectionMatrix * modelViewMatrix * position`。
- MRT 必须 `glslVersion: THREE.GLSL3` + 自己写 `layout(location = N) out vec4`。不设的话 three 会注入 `layout(location = 0) out highp vec4 pc_fragColor;` 并 `#define gl_FragColor pc_fragColor`（module 7050），你的第二个 out 要么和它冲突要么永远写不出去。注意 ShaderMaterial 本来就永远是 `#version 300 es`，`varying`/`texture2D` 有兼容 define，所以 chunk 照常可用。
- ShaderMaterial 的 GLSL 里**不许用 GLSL ES 3.00 的保留字当标识符** —— `sample` 是最容易撞上的一个（`texel`/`texelSample` 都行）。非 Raw 材质永远被前置 `#version 300 es`（module 7039），ESSL 1.00 里能编过的`vec4 sample = texture2D(...)` 到这里直接报 `Illegal use of reserved word`。**编译失败不抛异常**：three 只在控制台打一行 `THREE.WebGLProgram: Shader Error`，那一趟 blit 什么都不画，屏幕留着上一次 clear 的颜色。表现是「某个 pass 恒为纯黑」而其余画面完全正常，极难往着色器上想。同类保留字还有 `filter` / `input` / `output` / `patch` / `resource` / `active` / `common` / `partition`。
  已发生：`Script_Post.mjs` 的 `FRAG_DEBUG_VIEW` 用了 `sample`，Debug Rendering 面板九个视图全黑，而当时的冒烟只比对 uniform 上的纹理引用，一路全绿。**验一个展示 pass 一定要读回像素**。
- 自己的 pass 里想采样 `sun.shadow.map.depthTexture`：`PCFShadowMap` 下它的 `compareFunction = LessEqualCompare`，此时它是 shadow 采样器纹理，用 `uniform sampler2D` 绑定是未定义行为（多数驱动返回 0 → 全屏黑雾）。必须声明 `uniform highp sampler2DShadow`，用 `texture(s, vec3(uv, z))` 取。
- `onBeforeCompile` 改了 shader 却不改 `customProgramCacheKey()`：three 的程序缓存键里含 `material.customProgramCacheKey()`（module 7755），默认返回 `onBeforeCompile.toString()`。两个材质用同一个 onBeforeCompile 函数但注入不同参数（比如不同三平面 scale 走 defines）会共用同一份编译程序 —— 表现为“改了一个材质，另一个也跟着变”。
- `preserveDrawingBuffer: false`（默认）时 `canvas.toDataURL()` / `toBlob()` 在 rAF 之外调用会得到全黑。截图必须在渲染完成的**同一个 tick 内同步**取；或临时开 `preserveDrawingBuffer: true`（代价是每帧多一次拷贝，别在正式档开）。playwright 无头截图同理 —— 要在 `requestAnimationFrame` 回调里抓。
- `renderer.info` 泄漏排查：`info.memory.geometries` / `textures` 应该在稳定运行后**帧间不变**；`info.programs.length`（module 16464）持续增长说明 `onBeforeCompile` 每帧生成新函数或 defines 每帧变，导致无限编译新程序 —— 这是最隐蔽的卡顿源。SetSize 时旧 RT 必须 `.dispose()`，否则每次窗口 resize 泄漏上百 MB。
- `readRenderTargetPixels`（同步版）是 GPU 同步点，每帧调一次直接掉到 20fps。自动曝光务必用 `readRenderTargetPixelsAsync`，且每 4–8 帧一次、读极小区域。
- TAA 的 jitter 用 `camera.setViewOffset(fw, fh, x, y, w, h)`（core 46537），别手改 `projectionMatrix.elements[8/9]` —— 后者会在下一次 `updateProjectionMatrix()` 被冲掉，表现为“jitter 时有时无”。渲染结束记得 `clearViewOffset()`，否则阴影相机、拾取射线全部跟着偏。
- MSAA 目标（`samples > 0`）+ 挂 `depthTexture` 读回是脆的：需要额外的 depth blit（`resolveDepthBuffer`），部分驱动上直接得到未定义深度。稳妥做法是预通道用**独立的非 MSAA RT**（现有 `Script_Post.mjs` 正是这么做的，保持）。
- `aoMap` 走的是 `uv1`（r152+ 更名，不再叫 uv2）。程序化几何忘了 `geometry.setAttribute('uv1', geometry.attributes.uv.clone())` → AO 贴图完全不生效，而且不报错。
- LUT 的 CanvasTexture 必须 `flipY = false` + `ClampToEdgeWrapping` + `generateMipmaps = false` + `NoColorSpace`，采样时每格内缩半纹素。任一条漏掉 → 相邻切片互相渗色，暗部出现彩色斑块。
- 颗粒/抖动用 `Math.random()` 会让逐轮截图对比失效（画面自己在抖，判断不了“这一版比上一版好”）。全部用 `frameIndex` 驱动的确定性噪声（interleavedGradientNoise + 黄金比推进），视觉审查 agent 才能打分。
- god rays / 体积 raymarch 不抖动起点 → 明显的同心环带（banding）。抖动了但不随帧变 → 静态噪点固定在屏幕上，看起来像脏镜头。两者都要：`Ign(gl_FragCoord.xy + frame * k)`。
- 运动模糊没排除武器/手臂 layer → 转身时枪身糊成一坨，FPS 手感直接塌。给第一人称模型单独 layer 并在速度缓冲里写 0。

---

## CPU 提交量：2026-08-21 那一轮无损优化

玩家反馈「挺卡的」。先量再改，量出来的结论是**整帧卡在 CPU 的提交上，不是 GPU**：
`gl.finish()` 在 RTX 4070 上不等任何东西，而 `renderer.render()` 的 JS 侧自耗
占了整帧的四分之三。phase=2（东关）1280×720 实测基线：

| | 基线 | 改后 |
|---|---|---|
| 一帧 draw call（预通道＋主场景＋阴影） | 1670 | 523 |
| 纯渲染（不含玩法逻辑） | 12.2—16.3 ms | 6.5—7.9 ms |
| 整帧 | 17.2—22.9 ms | 12.4—13.4 ms |

CPU 采样（Profiler，300 帧）里排前面的是 `updateMatrixWorld` 17%、`projectObject` 6.6%、
`traverse` 4.1% —— 全是**场景图的固定开销**，与三角形数无关。三条改动，逐像素无损：

1. **阴影图一帧只烘一次**（`renderer.shadowMap.autoUpdate = false`，`RenderScene` 每帧点一次
   `needsUpdate`）。three 默认每次 `renderer.render()` 都重烘全部阴影图，而我们一帧要
   `render()` 二十几次（预通道 1 ＋ 主场景 1 ＋ GI 探针那二十来次小四边形）。
   同一帧里灯与投影体都没动过，重烘出来本来就是同一张图。→ 阴影 draw 444/帧 → 222/帧。
2. **世界矩阵一帧只算一次**（`scene.matrixWorldAutoUpdate = false`，`RenderScene` 出画前
   显式 `scene.updateMatrixWorld()`）。原来预通道与主场景各把四千个节点的矩阵重算一遍。
   注意：**这不改任何人读到的东西** —— 原来也只在渲染时更新，逻辑层读到的一样是上一次出画的位姿。
3. **人物分件合批**（`Script_ActorBatch.mjs`）。69 个人 × 24—33 个分件网格 = 一帧 1408 个
   draw call（全场的 84%），却只有 15 万个三角形。全场只有 69 份几何 × 29 份材质，
   按「几何 × 材质」收成 `InstancedMesh`，实例矩阵直接取分件自己的 `matrixWorld`。
   原网格不删不改 `visible`，只挪到第 30 层（相机与灯的 layers 掩码都只有第 0 位）。
   → 人物 draw 1408 → 一百多。细节与三条边界（`castShadow` 逐分件、`skipNormalDepth`、
   逐人剔除）写在那个文件的抬头。

回归口：`node Taierzhuang1938/Script_ActorBatchTest.mjs` —— 推 200 帧后**冻住玩法**，
同一份世界开/关合批各读一次 backbuffer 直接比像素（跨进程重跑对不齐：同样推 180 帧，
两次跑出来的画面差 27% 的像素，城里的战斗不是逐帧可复现的）。实测差异 ≤ 0.0006%，
与渲染器自己的噪声底同一量级。

### 第二轮：别遍历根本不画的完整人物

`matrixWorldAutoUpdate = false` 只能避免矩阵相乘，不能阻止 three 递归 invisible 子树；
69 个人约四千个骨骼/分件节点仍会每帧全走一遍。现在 `AiDirector.CullActors` 在人物进入
远景 LOD 或屏外时把完整 `actor.root` 从 scene 摘下，逻辑位姿仍照常写 root，画面由
`ActorCrowd` 接手；回近景时挂回同一 scene，本帧统一更新。3394×1348 / high / phase=2：

| | 摘树前 | 摘树后 |
|---|---:|---:|
| `scene.updateMatrixWorld` | 1.72 ms | 0.44 ms |
| `ActorBatcher.Update` | 0.31 ms | 0.18 ms |
| 90 帧平均整帧 | 7.52 ms | 4.70 ms |

另把人物实例缓冲按本关总人数一次预留，转头时不再让几十个材质桶依次 16→32→64
扩容；high 档去掉与最终 FXAA 重复的 4×MSAA，4× 只留给 ultra。RTX 4070 SUPER
同一超宽测试里，4×MSAA 单独把 GPU 从约 3.8 ms 抬到 4.8 ms。
复测入口：`node Taierzhuang1938/Script_FrameProfileTest.mjs`（真实 GPU timer query，
同时输出 CPU 分项、逐项消融与 GI 跨格尖峰）。

还没动的是静态布景（两百多个单网格）的 `matrixAutoUpdate`；破坏系统可能在运行时挪它们，
必须先确认所有写入口，不能靠全局 traverse 粗暴冻结。
