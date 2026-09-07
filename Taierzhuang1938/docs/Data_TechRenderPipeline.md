# 台儿庄 FPS：零 addon 的自研 3A 观感渲染管线

> 本文所有 API / 常量 / GLSL 断言，均来自实读 `Taierzhuang1938/vendor/three/build/three.module.js` 与 `three.core.js`（`REVISION = '185'`，版权头 2010-2026），不是凭记忆。后处理链**不用任何 addon** —— `EffectComposer` / `UnrealBloomPass` / `SSAOPass` / `SMAAPass` / `CSM` 一个都没用，整条链手搭。（注：`vendor/three/examples/jsm` 后来为外部 GLB 道具 / 蒙皮人物 / 过场引入了 `GLTFLoader` 等加载器，但渲染管线本体仍零 addon。）

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

## 1. 帧图与模块契约（2026-09 重构）

> **这一节是渲染侧唯一的接入说明。** 后续所有子系统（CSM/接触阴影、GTAO+SSIL、SSR、
> froxel 体积雾、物理大气、曝光/镜头/LUT、TAAU/运动模糊/DoF、材质升级、簇状多光源）
> 按这里定的契约接入。下面的 §1A 起是设计期草案与专题深挖，**现状以本节为准**。
>
> 本轮重构对画面**逐比特无损**：`Script_Post.mjs` 从一坨 1891 行拆成编排器 + 九个
> 模块，GLSL 一个算式没改。回归证据见本节末「怎么验」。

### 1.1 模块清单

| 模块 | 职责 | 对外的东西 |
|---|---|---|
| `Script_Post.mjs` | **编排器**。持有有序 pass 列表、具名靶、运行时状态（TAA 开关/历史、调试视图、着色模式）。所有旧的公共 API 都还在这里。 | `PostPipeline`、`MarkNoPrepass`、`MarkForegroundPrepass`、`MarkDynamicPrepass`、`InjectDepthPull`、`FOREGROUND_VIEW_DEPTH`、`SHADING_MODES`、`POST_QUALITY_KEYS` |
| `Script_PostCommon.mjs` | 地基：全屏 blit、`GLSL_COMMON`、靶工厂、瞬时靶池、`FrameContext`、pass 契约文档 | `Blitter`、`RenderTargetPool`、`FrameContext`、`MakeRenderTarget`、`MakeFullscreenMaterial`、`QUAD_GEOMETRY/CAMERA`、`VERT_QUAD`、`GLSL_COMMON`、`GLSL_VIEW_POS` |
| `Script_PostPrepass.mjs` | 深度法线预通道（MRT）+ 速度缓冲 + HZB + 蒙皮上一帧骨矩阵 | `PrepassPass`、`MarkNoPrepass`、`MarkForegroundPrepass`、`MarkDynamicPrepass`、`FOREGROUND_VIEW_DEPTH` |
| `Script_PostGtao.mjs` | **GTAO**（地平线基 AO + 弯曲法线 + SSIL 位掩码）+ 时域累积 + 双边去噪。2026-09 整个替换了旧的 `Script_PostSsao.mjs`，口径见 §17 | `GtaoPass`、`MakeAoUniforms`、`SyncAoUniforms` |
| `Data_Tuning_Gtao.mjs` | GTAO / SSIL 的数值表（纯数据，零 three 依赖） | `GTAO`、`SSIL`、`GTAO_TIERS`、`MakeGtaoTier` |
| `Script_PostSsr.mjs` | 屏幕空间反射：自建 min-Hi-Z + 随机 GGX 追踪 + 解算 + 时域 | `SsrPass`、`SsrColorPass` |
| `Script_PostVolumetrics.mjs` | froxel 体积雾 / 体积光（注入 / 积分 / apply 三行帧图） | `VolumetricsPass`、`VOLUMETRIC_SAMPLE_GLSL`（含 `SampleVolumetricFog` / `VolumetricFarTransmittance`）、`BindVolumetricUniforms`、`MakeVolumetricNoiseTexture` |
| `Data_Tuning_Volumetrics.mjs` | 体积雾的网格分档与时段参数（纯数据，零 three 依赖） | `VOLUMETRIC_GRIDS`、`VOLUMETRIC_PRESETS`、`MakeVolumetricParams`、`AnalyticTransmittance`、`FroxelTransmittance`、`VISIBILITY_REFERENCE` |
| `Script_Atmosphere.mjs` | 物理大气（Hillaire 2020 四张 LUT）+ 帧图第一个 pass | `AtmospherePass`、`AERIAL_PERSPECTIVE_GLSL`、`BindAtmosphereUniforms`、`GetActiveAtmosphere` |
| `Script_PostTaa.mjs` | TAA（UE 缺省方案）+ 子像素抖动的上/卸 | `TaaPass`、`TAA_JITTER`、`TAA_SAMPLES`、`TAA_CURRENT_FRAME_WEIGHT` |
| `Script_PostBloom.mjs` | 亮部提取 + 多级降/升采样；太阳拖影 | `BloomPass`、`GodRaysPass` |
| `Script_PostComposite.mjs` | 合成（分段函数，见 §1.9） | `CompositePass` |
| `Script_PostFxaa.mjs` | FXAA + 锐化 → 屏幕（调试视图时让位给 DebugPass） | `FxaaPass` |
| `Script_PostDebug.mjs` | 中间靶展示 pass、线框着色模式、调试叠加层、SunShadow 验证图 | `DebugPass`、`InjectDepthPull`、`SHADING_MODES`、`WIRE_BACKGROUND_PURE` |
| `Script_MaterialPatches.mjs` | 材质补丁注册表 + 现役三路补丁（AO / GI / 破口） | `MakePatch`、`ApplyPatches`、`PatchKeysOf`、`MakeAmbientOcclusionPatch`（旧名 `MakeSsaoPatch` 仍导出）、`MakeGiPatch`、`MakeDestructionPatch`、`IndirectLightingPatches` |
| `Data_Tuning_Graphics.mjs` | 画质档位表（纯数据，零 three 依赖） | `QUALITY_PRESETS`、`POST_QUALITY_KEYS`、`MakeQualityPreset`、`HZB`、`VELOCITY` |
| `Script_Light.mjs` | 太阳阴影的公共采样接口（新增） | `SUN_SHADOW_GLSL`、`BindSunShadowUniforms`、`LightRig.RegisterShadowUniforms/SyncShadowUniforms` |

### 1.2 帧图（有序 pass 列表，`PostPipeline.passes`）

```
 0  （不是 pass）TaaPass.ApplyJitter —— Halton(2,3) 子像素抖动写进 projectionMatrix
 1  atmosphere            刷天空视图 LUT + 大气透视 froxel LUT（天穹与材质都要采）
 2  prepass               MRT：RT0 法线+线性视深 / RT1 屏幕空间速度 / DepthTexture
 3  hzb                   RT0.w 的 max-reduce 金字塔（SSR / 体积雾 / 接触阴影共用）
 4  ssr                   自建 min-Hi-Z + 随机 GGX 追踪 + 解算 + 时域（在 main 之前：材质要采它）
 5  gtao                  地平线搜索（AO + 弯曲法线 + SSIL）→ 时域 → 双边 → rtAoBlur（§17）
 5b contactShadows        屏幕空间接触阴影（只压直射太阳）→ 合进 SSIL 靶的 alpha（§1S）
 6  main                  HDR 主场景（AO / SSIL / SSR / 簇状局部光由材质补丁注入；ultra 才 4×MSAA）
 7  wireframe             着色模式非 shaded 时叠一层三角形边线
 8  debugOverlay          Rapier 碰撞体线框等（同一张 hdr 靶与深度）
 9  volumetricInject      froxel 注入 + 太阳阴影 + HG 相函数 + 局部光 + 时域重投影
10  volumetricIntegrate   沿 z 解析积分（散射 + 透过率）
11  volumetricApply       内部分辨率满幅 apply → Composite 的 uFogScatter / uFogSource=1
——— 以上在**内部分辨率**（`graphics.renderScale`）；`taa` 起解算到**输出分辨率** ———
12  taa                   时域解算（先卸抖动）+ TAAU 上采样到输出网格
13  exposure              直方图自动曝光 → 1×1 增益靶（§17 相机一节）
14  ssilHistory           解算后的场景色降采样 → 下一帧 SSIL 的反弹源（§17）
15  ssrColor              解算后的 HDR 降采样成带 mip 的「上一帧场景色」
16  motionBlur            tile max → neighbor max → 逐物体重建（McGuire 2012 / Jimenez 2014）
17  dof                   散景景深：CoC → 半分辨率 near/far gather → 填洞 → 合成（COD:AW）
18  godPrepare            只做决策不出画：太阳在不在屏内、拖影强度
19  bloom                 亮部提取 → 13 抽样降采样 ×N → 9 抽样 tent 升采样
20  god                   屏幕空间太阳拖影（出厂关；体积雾开着时也一律不给，会双份）
21  lensFlare             鬼影 / 光环 / 受遮挡星芒 + 程序化脏污（读 bloom 的亮部图）
22  composite             色差→+泛光/拖影→雾→镜头进光→曝光→tonemap→LUT→镜头→sRGB
23  fxaa                  FXAA + CAS 锐化 → 屏幕（调试视图时改为把选中的中间靶送屏）
```

体积雾三趟排在 main 之后（注入要本帧烘好的太阳阴影图）、composite 之前（apply 那一趟
才把 `uFogScatter` 接上）；它只读预通道的法线/视深靶，所以 `wireframe` /
`debugOverlay` 在它前后逐比特相同。回归口 `Script_PostFrameGraphTest` 断言的是
**有序子序列 + 名字不重复**，不是全等 —— 并行子系统各插各的，全等断言会天天互撞。

**两组分辨率（2026-09 TAAU）**：`SetSize(w, h, outW, outH)` 收「内部」与「输出」两套；
`Script_Post.OUTPUT_DOMAIN_PASSES`（`taa` / `motionBlur` / `dof` / `bloom` / `god` /
`lensFlare` / `composite` / `fxaa`）按输出分辨率建靶，其余按内部。TAAU 不跑时两者相等，
**只读 `ctx.width/height` 的 pass 一个字都不用改**。逐 pass 的域表见 §17 的
「TAAU / 运动模糊 / 散景景深」一节。

编排器对每个 pass 依次做：`Prepare?.(ctx)` → `Enabled(ctx)` → `GpuPush(name)` →
`Render(ctx)` → `GpuPop()`。`Enabled` 为 false 的 pass **不产生 GPU 分段**
（剖析器里就看不到它，这是有意的：没跑的东西不该占一行）。

### 1.3 pass 接口

```js
{
  name: "ssr",                 // GPU 分段名；Script_Profiler 按它归账
  Prepare(ctx) {},             // 可选。在 GPU 段之外先算好本帧参数（决策、矩阵）
  Enabled(ctx) { return ctx.preset.ssr; },
  Resize(width, height) {},    // SetSize 时建/重建自己的靶；旧靶自己 dispose
  Render(ctx) {},              // 出画
  Dispose() {},                // 材质与靶一起还
}
```

约定：

* **靶归 pass 自己所有**。要让老代码/测试也能按名字拿到，在 `Resize` 里写
  `pipeline.targets.<名字> = rt`（`pipeline.targets` 跨 `SetSize` 是同一个对象，
  不会被整体重建，所以 `delete` 语义也稳）。
* 需要**跨帧**留内容的靶（TAA 历史、GI 图集）自己持有；只在本帧中转的用
  `ctx.pool.Rent(name, w, h, options)`，`SetSize` 会整池作废。
* `Render` 里**不许**碰别的 pass 的 uniform；要什么就往 `FrameContext` 上加字段
  并在 §1.4 登记。

### 1.4 FrameContext 字段表（`ctx`）

矩阵**一律是无抖动的那一份**：TAA 的子像素抖动只在预通道与主场景两趟生效，
速度、运动模糊、太阳投影拿到的必须是干净矩阵。

| 字段 | 类型 | 说明 |
|---|---|---|
| `renderer` / `scene` / `camera` | three 对象 | 本帧三件套 |
| `pipeline` | PostPipeline | 要 `targets` / `preset` / 别的 pass 时用 |
| `preset` | object | `Data_Tuning_Graphics` 那一档的**运行时副本**（面板与测试会改它） |
| `targets` | object | 具名靶：`normalDepth` / `hdr` / `ao` / `aoTmp` / `aoBlur` / `bright` / `god` / `ldr` / `taaA` / `taaB` |
| `pool` | RenderTargetPool | 瞬时靶 |
| `blitter` | Blitter | `ctx.blitter.Blit(material, target)`（target=null 即屏幕） |
| `profiler` | FrameProfiler \| null | 一般不用碰，编排器已经按 pass 包好了 |
| `options` | object | `Render()` 的第三参，原样透传 |
| `frame` | number | 帧序号。**所有确定性噪声的种子**，不许用 `Math.random` |
| `width` / `height` / `resolution` | number / Vector2 | 主靶尺寸 = **内部分辨率**（预通道 / HZB / SSAO / 主场景） |
| `outputWidth` / `outputHeight` / `outputResolution` | number / Vector2 | **输出分辨率**：TAA 之后那几趟（taa / motionBlur / dof / composite / fxaa）的靶尺寸。TAAU 不跑时与内部相等（2026-09 追加，见 §17） |
| `jitterX` / `jitterY` | number | 本帧 TAA 抖动（像素） |
| `taaActive` | boolean | 本帧 TAA 是否真的在跑 |
| `projScale` | Vector2 | `(1/tan(fov/2)/aspect, 1/tan(fov/2))` |
| `view` / `projection` / `viewProjection` | Matrix4 | 本帧**无抖动** |
| `prevViewProjection` | Matrix4 | 上一帧无抖动（`hasPrev=false` 时无意义） |
| `invView` / `invProjection` | Matrix4 | `camera.matrixWorld` / 投影逆 |
| `hasPrev` | boolean | 上一帧矩阵可用 |
| `sceneColor` | RenderTarget | 当前「场景颜色」靶。TAA 跑完会换成解算靶 —— **下游一律读它，别读 `targets.hdr`** |
| `normalDepthTexture` | Texture | RT0 |
| `velocityTexture` | Texture \| null | RT1 |
| `sceneDepthTexture` | DepthTexture | 预通道的深度 |
| `hzb` | object \| null | 见 §1.6 |
| `sunDirection` / `sunColor` / `exposure` | Vector3 / number | 本帧太阳与曝光 |
| `godActive` / `godStrength` / `sunUv` / `sunNdc` | — | `godPrepare` 写，bloom 与 god 读 |

`FrameContext.Begin()` 里有一条容易踩的账：**它会先 `camera.updateMatrixWorld()`**。
三方是在 `renderer.render()` 里做这件事的，而现在整帧只在 Begin 读一次矩阵；不先更新
的话 `invView` / `viewProjection` 会整体落后一帧，症状是速度缓冲恒为 0、雾按上一帧的
相机位置算。回归口：`Script_PostFrameGraphTest` 的「相机右移时街面像素速度 x 为负」。

### 1.5 渲染靶命名与格式

| 名字 | 尺寸 | 格式 | 谁建 | 备注 |
|---|---|---|---|---|
| `normalDepth` | 全分辨率 | **MRT**：RT0 RGBA16F、RT1 RG16F，+ `DepthTexture(UnsignedInt)` | PrepassPass | `minFilter=Nearest / magFilter=Linear`（这一对是历史口径，改了 SSAO 读数就变） |
| `hdr` | 全分辨率 | RGBA16F（ultra 4×MSAA） | 编排器 | 主场景。**别往 MSAA 靶上挂 DepthTexture** |
| `ao` / `aoTmp` / `aoBlur` | `aoScale ×` | RGBA16F ×(1 或 2) | GtaoPass | R=可见度、G/B=弯曲法线（八面体）、A=线性视深；附件 1 = SSIL（§17.6） |
| `bright` | 1/2 | RGBA16F | BloomPass | alpha 在拖影开着时打包天空遮挡 |
| `bloomMips[]` | 逐级折半 ×2 | RGBA16F | BloomPass | 每级两张（降采样结果 + tent 回叠） |
| `god` | 1/4，封顶 9.6 万像素 | RGBA16F | GodRaysPass | |
| `ldr` | **输出分辨率** | RGBA8 | CompositePass | 合成输出，FXAA/CAS 的输入 |
| `taaA` / `taaB` | **输出分辨率** | RGBA16F | TaaPass | 只在 `taaEnabled` 时存在（热切会建/还）。TAAU 开着时 = 显示分辨率，这就是「解算到输出网格」 |
| `motionBlur` | 输出分辨率 | RGBA16F | MotionBlurPass | 重建结果；`motionBlurScale < 1` 时另有一张半分辨率中转 |
| `velocityTile` | ⌈W/20⌉ × ⌈H/20⌉ | RGBA16F | MotionBlurPass | neighbor max（调试视图「速度 tile max」看的就是它） |
| `dof` | 输出分辨率 | RGBA16F | DofPass | 景深合成结果 |
| `dofCoc` | 输出的 1/2 × `dofScale` | RGBA16F | DofPass | rgb = 降采样颜色，a = **带符号 CoC**（像素） |
| HZB `levels[i]` | 1/2 起逐级折半 | RGBA16F（四通道同值） | PrepassPass | 见 §1.6 |

**所有中间靶 `texture.colorSpace = NoColorSpace`**：three 渲进 RenderTarget 时不做
sRGB 编码，最后一趟必须自己手写（Composite 的 `EncodeOutput`）。

#### MRT 的硬约束（本轮实测得出，改预通道之前必读）

**WebGL2 里「有一个 enabled 的 draw buffer 却没有对应的片元着色器输出」是
`INVALID_OPERATION`，那一次 draw 被驱动整个丢掉。** 实测（RTX 4070 SUPER / ANGLE-D3D11，
`Script_PostFrameGraphTest` 里留了回归口）：

| 靶 | 材质 | `getError()` |
|---|---|---|
| 单靶 | 一输出（three 内置材质） | 0 |
| MRT ×2（RG16F 或 RGBA16F 都一样） | 一输出 | **1282 INVALID_OPERATION** |
| MRT ×2 | 两输出（`layout(location=0/1)`） | 0 |

后果：**`allowOverride === false` 的对象必须整只藏出预通道**。它们用的是自己的
一输出材质（天空穹、水面、粒子、烟、编辑器线框），换不成覆盖材质，留在这一趟里
只会每帧刷 GL 错误，而且那些 draw 本来也被驱动丢掉了。`PrepassPass._CollectSkipped`
现在按这条收人。

**这是本轮重构唯一一处刻意的行为变化。** 重构前它们**是**被画进 `rtNormalDepth` 的，
写进去的 xyz 是自己的光照颜色（当法线用是纯垃圾）、w 是不透明度 —— 水面那种
`depthWrite=false` 的半透明大面会把 w 写成 0~1，下游一律误判成「一米内有实体」。
所以这一改同时修掉了一条老账（旧 §1A 的抬头里本来就写着这是个坑，只是当时
只对「铺满全屏的东西」要求补 `skipNormalDepth`）。谁要往预通道里加东西，规矩是：
**要么能吃覆盖材质（`allowOverride` 保持 true），要么就不在这一趟里。**

### 1.6 速度缓冲（RT1）与 HZB

**速度口径**

* 单位 **uv**（本帧 uv − 上一帧 uv），不是像素；消费方自己乘分辨率。
* 用**无抖动**的两帧 `viewProjection` 算 —— 拿 `gl_Position` 算的话 TAA 的 ±0.5 像素
  抖动会整个漏进速度里。
* 单帧钳在 `Data_Tuning_Graphics.VELOCITY.clampUv`（0.25 uv）。
* 第一帧、前景件（`uForegroundDepth > 0`，即第一人称手与枪）一律写 0；天空整只
  `skipNormalDepth` 藏出预通道，那里留的是 clear 值 0。

**逐物体速度做到哪一步（已知近似，别当 bug 修）**

| 对象 | 速度 | 怎么做的 |
|---|---|---|
| 静态几何 | 相机速度（精确） | prevWorld = curWorld |
| **蒙皮人物（SkinnedMesh）** | **逐骨骼（精确）** | `skeleton.boneTexture` 换成**高度翻倍**的图：上半是本帧骨矩阵（three 每帧自己写），下半是上一帧的副本（`PrepassPass._SnapshotSkeletons` 在 Render 末尾 `copyWithin`）。取样端 `GetPrevBoneMatrix(i)` = three 的 `getBoneMatrix(i)` 把纹素下标 +`size*size`。**零逐 draw 成本** —— `boneTexture` 本来就是 three 逐 draw 塞的 |
| InstancedMesh / BatchedMesh | **只有相机速度（近似）** | 实例矩阵当不变。`Script_ActorBatch` 的远景人群、流送的布设件每帧改写 `instanceMatrix`，所以它们在 RT1 里是「静止物体」。要修得给每只实例网格再挂一份上一帧 `instanceMatrix`（显存翻倍 + 每帧多一次上传） |
| 非蒙皮刚体运动件（大车、列车、载具、碎块） | **只有相机速度（近似）** | 接线点是 `uPrevModelMatrix` + `MarkDynamicPrepass(object)`；**当前没有消费方**。它逐 draw 置 `material.uniformsNeedUpdate = true`，会把整份 uniform（含 24 组破口数组）重传一遍，几十只以内不值一提，成百上千会撞「CPU 提交是瓶颈」那条红线 |

主 pass 读到的骨骼纹理**逐纹素不变**（宽度没动，`getBoneMatrix(i)` 对
`i < size²/4` 落点完全一样），所以换成翻倍纹理对画面零影响。显存与上传：一具 50 骨的
骨骼从 16×16 RGBA32F（4 KB）变成 16×32（8 KB）；本关 69 名士兵满编约 0.55 MB/帧上传。

**TAA 与运动模糊本阶段仍走深度反投影**（只有相机运动）。切换到速度靶的接线点已经
留好：`TaaPass` 的 `uVelocity` + `uUseVelocityBuffer`（置 1 即切换），Composite 的
`MotionBlur()` 段注释里写了改哪三行。切换要连着重新标定邻域裁剪与 `velocityPx/40`
那条曲线，属于 TAAU 那一轮。

**HZB**

```js
ctx.hzb = {
  source,     // 全分辨率那一级 = RT0 的 w 通道（不另存）
  texture,    // = levels[0]，半分辨率
  levels: [Texture, ...],   // 每级一张独立 RT（不是一张纹理的多个 mip）
  sizes: [[w, h], ...],
  mipCount,
  size: [w, h],             // levels[0] 的尺寸
};
```

max-reduce：每级取 2×2 的**最大**线性视深；天空（RT0.w ≤ 0）按 `camera.far` 记。
级数与最小边长在 `Data_Tuning_Graphics.HZB`。格式是 RGBA16F 而不是 R16F —— 
`readRenderTargetPixels` 只保证 RGBA + UnsignedByte/HalfFloat/Float 可读，
「测得动」优先；SSR 落地时若带宽吃紧再换并同步改回归口。

#### 本轮新增的 GPU 成本（实测）

RTX 4070 SUPER / ANGLE-D3D11，3394×1348 / high / phase=2，运行时剖析器逐段中位数
（约 395 帧）。**重构前后同机同参各跑一遍**：

| GPU 段 | 重构前 | 重构后 | Δ |
|---|---:|---:|---:|
| prepass | 2.634 ms | 2.882 ms | **+0.25**（MRT 第二附件 RG16F + DepthTexture） |
| hzb | — | 0.042 ms | **+0.04**（8 级 max-reduce） |
| ssao | 0.437 | 0.425 | −0.01 |
| taa | 0.428 | 0.426 | 0.00 |
| bloom | 0.082 | 0.081 | 0.00 |
| composite | 0.281 | 0.197 | −0.08 |
| fxaa | 0.055 | 0.054 | 0.00 |
| main / shadow | 6.09 / 1.71 | 6.66 / 1.90 | 场景状态噪声（AI 与烟火不跨进程复现） |

**可归因的新增成本 ≈ 0.29 ms/帧**；`ssao / taa / bloom / composite / fxaa` 逐段持平，
说明「拆模块」本身不花钱。CPU 提交侧 `FrameProfileTest` 的 baseline 行两版各两轮：
submit 15.30/14.70 → 15.60/14.40 ms（噪声以内，没变），draw call 839/833 → 846/841
（+7，就是 HZB 那条链的 blit）。

### 1.7 太阳阴影的公共采样接口

```js
import { SUN_SHADOW_GLSL, BindSunShadowUniforms } from "./Script_Light.mjs";

const uniforms = { /* 自己的 */ };
BindSunShadowUniforms(uniforms, lightRig);   // 建条目 + 登记 + 立刻同步一次
const frag = `...${SUN_SHADOW_GLSL}...
  void main() { float v = SunShadowVisibility(worldPos, worldNormal); }`;
// 每帧（阴影框在滚）调一次：
lightRig.SyncShadowUniforms();
```

GLSL 侧签名：`float SunShadowVisibility(vec3 worldPos, vec3 worldNormal)` ——
1.0 = 完全照到，0.0 = 完全被挡，**阴影框外返回 1.0**（不是 0：66 m 外没有阴影信息，
返回 0 会让整个远景死黑）。内部与 three 的 `SHADOWMAP_TYPE_PCF` 同一套：
world-space normal offset + Vogel 5 抽样盘 + 交错梯度噪声旋转 + `shadow.intensity`。

uniform 组：`uSunShadowMap`（**必须 `highp sampler2DShadow`**）、`uSunShadowMatrix`、
`uSunShadowMapSize`、`uSunShadowBias`、`uSunShadowNormalBias`、`uSunShadowRadius`、
`uSunShadowIntensity`、`uSunShadowEnabled`。

**现在它指向唯一那张 66 m 跟随框阴影图。CSM 代理在这个接口后面换成级联，调用方一个字
都不用改。** 所以：别在自己的 pass 里直接采 `sun.shadow.map`，也别自己写一遍矩阵与
bias —— 那样级联落地时要改的地方就散在八个文件里。

最小验证：Debug Rendering 面板「光照」组的 **SunShadow 采样**（`?` 面板里选，或
`post.SetDebugView("sunShadow")`）。`Script_PostFrameGraphTest` 断言它「有黑有白」。

### 1.8 材质补丁注册表

three 一个材质只有一个 `onBeforeCompile`，谁后写谁把前面的整个覆盖掉且不报错。
所以往 `MeshStandardMaterial` 插 GLSL 一律走注册表：

```js
import { MakePatch, ApplyPatches } from "./Script_MaterialPatches.mjs";

const ssrPatch = MakePatch({
  key: () => `ssr${mode}`,                       // 运行时会翻的位写成函数（**每次编译现读**）
  uniforms: (shaderUniforms) => { shaderUniforms.uSsr = ssr.map; },
  vertex:   [["#include <common>", `varying vec3 vFoo;`]],
  fragment: [["#include <lights_fragment_end>", `...`]],
  defines:  { USE_SSR: "" },
});
ApplyPatches(material, [...IndirectLightingPatches({ ssao, gi, destruction }), ssrPatch]);
```

* **采样器有硬预算**：ANGLE-D3D11 上 `MAX_TEXTURE_IMAGE_UNITS = 16`，超了程序**不链接**
  （日志一行 `texture image units count exceeds`），而 three 每帧照样 `useProgram` ——
  症状是那只材质整个不画 + 每帧一次 1282。**门禁在 `Script_SamplerBudgetTest.mjs`**
  （四档 × `gi=0/1` 各起一次正片，遍历 `renderer.info.programs` 数每个程序的 sampler
  uniform，断言全部链接成功且 ≤ 16）。详见下面的预算表。
* 锚点一律**追加在 chunk 之后**；多个补丁挂同一个锚点按注册顺序拼接。
* `customProgramCacheKey` = 各补丁 key 拼接。**改了代码不改 key = 两种档位共用同一份
  编译缓存**（现役三态：`gtao1` / `gtao1|gi1` / `gtao1|gi2`）。
* **补丁的 `defines` 由 `ApplyPatches` 写进 `material.defines`，不是在
  `onBeforeCompile` 里写。** three 的 `getProgramCacheKey` 从 `material.defines`
  现读，而 `onBeforeCompile` 要等 program 已经开建之后才跑 —— 在钩子里写的话，
  第一次编译的键里没有这些位、第二次才有，同一份 GLSL 会被认成两个程序各链接一遍
  （2026-09 实测：正片 phase=2/high 的 188 个 program 里 95 个是这么白建的，
  链接一份一秒上下）。`ApplyPatches` 装补丁时同步一次、`customProgramCacheKey`
  里再同步一次（`Script_MaterialShading.RefreshDefines` 会在改画质档时原地改
  `patch.defines`，两边必须同源），补丁列表换了以后不再要的位 `delete` 掉。
  账见 §16.0。
* 现役顺序固定 **ORM → AO → GI → CSM → SSR → 簇光 → 材质着色 → 破口**（AO 那一路 2026-09 起是 GTAO 补丁，见 §17.4）：
  ORM 三合一排最前（它把材质自带的遮蔽乘进 `indirectDiffuse`，等价于三方 `aomap_fragment`
  chunk 原来的位置）；`<aomap_fragment>` 上同时挂着 AO 的乘法与 GI 的
  光照分量取证，AO 先压、取证后抓，面板读到的才是正式画面的值。
* `Script_Materials.InjectIndirectLighting` 只是这套的薄封装，外部签名没变；
  `MaterialLibrary.Get/Plain/Static/ConfigureExternalPbr` 与 `ActorFactory` 那条路
  全部经它，行为不变。

**锚点表**（three r185 的 chunk 名；每个锚点处能拿到什么）

| 锚点 | 着色器 | 那里有什么 |
|---|---|---|
| `#include <common>` | 顶点 / 片元 | 只能放 uniform / varying / 函数声明 |
| `#include <project_vertex>` | 顶点 | `transformed`（局部，已过形变/蒙皮）、`mvPosition`、`gl_Position`、`modelMatrix`、`batchingMatrix`/`instanceMatrix`（按宏）。算世界坐标在这儿 |
| `#include <color_fragment>` | 片元 | `diffuseColor`（rgb = BaseColor×顶点色，a = 不透明度） |
| `#include <roughnessmap_fragment>` | 片元 | `roughnessFactor` |
| `#include <metalnessmap_fragment>` | 片元 | `metalnessFactor` |
| `#include <lights_fragment_begin>` | 片元 | `geometryNormal`（**视空间**）、`geometryViewDir`、`geometryPosition`、`material`、`vDirectionalShadowCoord[]`、`getShadow()` |
| `#include <lights_fragment_maps>` | 片元 | `iblIrradiance`（= π×辐射亮度）、`radiance`、`irradiance`。**替换天空 IBL 在这儿** |
| `#include <aomap_fragment>` | 片元 | `reflectedLight.*` 全部累加完、`aoMap` 已乘。**SSAO 实际压间接光的位置** |
| `#include <lights_fragment_end>` | 片元 | 最后一次能改 `reflectedLight` |
| `#include <clipping_planes_fragment>` | 片元 | 最早能 `discard`（破口裁切用它） |
| `#include <dithering_fragment>` | 片元 | `gl_FragColor` 已成型。整帧覆盖输出（调试假彩色）用它 |

#### 采样器预算表（2026-09 集成期实测，ANGLE-D3D11 / MAX_TEXTURE_IMAGE_UNITS = 16）

八个子系统合流之后这条线是**真的会撞**的：各分支单跑都在预算内，合到一起才越线，
所以各分支自己的回归口一条都抓不到。门禁是 `Script_SamplerBudgetTest.mjs`
（四档 × `gi=0/1` 各起一次正片，遍历 `renderer.info.programs`，按
`getActiveUniform` 数每个程序里 sampler 类型 uniform 的个数 —— 数组型按 `size` 计）。

下面是最挤的几类材质在 `ultra` + `?gi=1`（最挤的组合；出厂默认 gi=0）下的实测数：

| 材质 | 打包前 | 打包后 | 占位（打包后） |
|---|---:|---:|---|
| 静态墙 / 地（`MaterialLibrary.Get`） | 19 | **14** | map / normalMap / roughnessMap(=ORM) / envMap / dfgLUT / 阴影×3 / uSsaoMap / uSsilMap / uGi×2 / uClusterData / uMatDetailNormalMap |
| 砸坑地面（+ `CraterSoilV4`） | 21 | **16** | 上面那一排 + uCraterSoil + uCraterNormal |
| 人物 GLB・皮肤（+ 预积分 LUT） | 20 | **16** | boneTexture / specularIntensityMap / map / roughnessMap / envMap / dfgLUT / 阴影×3 / uSsaoMap / uSsilMap / uGi×2 / uSsrMap / uClusterData / uMatSkinLut |
| 人物 GLB・布（sheen） | 19 | **15** | 同上去掉皮肤 LUT（外部 GLB 一律不吃细节法线，atlas UV） |
| 第一人称视模 | 19 | **15** | 同上，把 uSsrMap 换成 uFirstPersonShadowMap（视模不挂 SSR，见坑表） |

**八轮实测的上界**（`Script_SamplerBudgetTest`）：low 11 / medium・high・ultra `gi=0` 14 /
medium・high・ultra `gi=1` **16**。gi=1 那三档是贴着上限跑的 —— 再加一路采样器
之前必须先腾一个出来（候选见本表末尾）。
**打包清单**（每一条都是**逐像素无差**的，没有一条是「关掉某个功能」）：

| 改动 | 省 | 做法 |
|---|---:|---|
| **ORM 三合一** | 2 | 一张 ORM 喂三个槽时 three **不去重**，三个槽各占一个单元。`FoldOrmMaps` 把 `metalnessMap` / `aoMap` 从材质上摘掉，`MakeOrmPatch` 改从 `roughnessMap` 那一份采样里读 `.b` / `.r`（`aomap_fragment` chunk 逐行搬运，含 clearcoat / sheen / `computeSpecularOcclusion` 三个分支）。等价的依据：三张是**同一个 Texture 对象**（按对象相等判定），uv 变换与通道号一定相同；r152 起 `aoMap` 走 `texture.channel`（缺省 0 = `uv`），不再硬绑 uv1。 |
| **簇表三合一** | 2 | 簇表 / 光索引 / 光源数据合成一张 RGBA32F（`uClusterData`），整数那两段贴着 float 的位型存、`floatBitsToUint` 取回；光源数据仍然「一次 `texelFetch` 拿一个 vec4」（最内层循环的取样次数一次没多），每帧上传量与三张表时代相同。 |
| **SSR 补丁死代码消除** | 1 | SSR 只在 `material.roughness <= 0.60`（`SSR.maxRoughness`）时动 `radiance`。本仓的墙/地/木/布/砂袋那批配方烘出来的粗糙度**下界**全在 0.75 以上（`OrmRoughnessFloor` 每个配方算一次，外部图走 `ExternalOrmRoughnessFloor` 用一张离屏 canvas 整张扫），那条分支永远不成立 —— 干脆不编。下一帧追踪端也自洽：不写 `gl_FragColor.a` 则 alpha 恒 1 = 粗糙度 1，追踪端本来就会跳过。 |
| **接触阴影打进 SSIL 靶的 alpha** | 1 | 两张都是半分辨率的屏幕空间靶，而 SSIL 那张的 alpha 全链路没人读（GTAO 恒写 1）。`ContactShadowsPass` 末尾多一趟半分辨率 blit，把 `SSIL.rgb + 接触阴影` 合成一张 RGBA16F；`Script_Csm.CsmContactShadow()` 读 `uSsilMap.a`。**因此 `CSM_CONTACT` 只在挂了 AO 补丁的材质上定义**（`uSsilMap` / `uSsaoResolution` 由 AO 补丁的「屏幕空间输入公共声明块」声明）。关掉的那一帧走 `Idle()`：拿一张 1×1 纯白当接触源再合一次，alpha 就是 1 = 没挡住。 |
| **探针 GI 的每探针元数据并进辐照度图集** | 1 | `uGiOffset`（每探针一个纹素的重定位偏移 + 有效位）不再是独立纹理，而是辐照度图集**右边多出来的 cx 列**。位置不需要新 uniform（`uGiCounts.x * (uGiIrrTexels + 2)`）；带与瓦片区不相交，而图集每帧整张搬（`copyScene`），ping-pong 自己把它带过去 —— 只有重定位（`Scroll`）与清图集之后要重写一次（`ProbeVolume._WriteMeta`）。 |
| **B7 的两张图不同时出现** | — | 细节法线（uMatDetailNormalMap）只给库配方，皮肤 LUT（uMatSkinLut）只给被认成皮肤的外部 GLB；外部 GLB 一律不吃细节法线（atlas UV，一份 uv 摊在整个身体上）。所以 B7 对任一材质只是 **+1**，不是 +2。 |
| **ultra 的级联 4 → 3（每级 2048 → 4096）** | 1（仅 ultra） | `directionalShadowMap[]` 是**采样器数组**，四级就是四个单元。这是唯一一条动了档位数值的：补偿是每级图翻四倍，同样 170 m 总距离下近级的每米纹素数反而更高（四级只是把同一些米分得更细），且一轮少烘一张。三角红线不受影响（分辨率不改三角数）。 |

还没做、下一个要动的候选（按性价比）：砸坑的 `uCraterSoil` + `uCraterNormal`
（5 个通道，合不进一张 RGBA，只能做图集 + `textureGrad`）；外部人物 GLB 的
`specularIntensityMap`（KHR_materials_specular，多数是近乎常数的一张图）。

「屏幕空间输入」的公共声明块在 `MakeAmbientOcclusionPatch` 的 `<common>` 段：`uSsaoMap` /
`uSsaoResolution` / `uSsaoStrength`，外加 `#define uScreenResolution uSsaoResolution`
（`Script_Main` 喂的是**主渲染靶**尺寸而不是 AO 靶尺寸 —— 这条踩过两轮）。
low 档没有 ssao，那些补丁要自带一份分辨率 uniform。

### 1.9 Composite 的分段

`FRAG_COMPOSITE` 拆成七段，每段一个函数 + 一组 uniform + 一个 `SEGMENT` 锚点注释。
**只替换自己那一段，不要往 `main()` 里插代码。**

```
SEGMENT motion-blur      MotionBlur()            ← **只剩色差**（运动模糊已搬进 Script_PostMotionBlur）
SEGMENT depth-of-field   DepthOfField()          ← **空函数**（景深已搬进 Script_PostDof）
SEGMENT fog              ApplyFog()              ← froxel 体积雾 / 物理大气代理
SEGMENT exposure         ApplyExposureTonemap()  ← 自动曝光 / AgX / 别的 tonemap
SEGMENT color-grade      ColorGrade()            ← 3D LUT 代理
SEGMENT lens             LensEffects()           ← 镜头光晕 / 脏污 / 暗角
SEGMENT encode           EncodeOutput()          ← 输出色彩空间 / 抖动
```

* **曝光**（2026-09 生产者已接上：`Script_PostExposure` 的直方图自动曝光，见 §17
  「相机：自动曝光 / 镜头光晕 / LUT 分级」一节）`uExposure`（float）×
  `uExposureTex`（1×1 靶，关着时绑纯白 = 精确 1.0）。手调偏移仍走 `uExposure`；
  同一段里还有 `uTonemap`（0 = ACES Hill / 1 = AgX）与镜头进光（`uFlare` / `uDirt`），
  `SEGMENT color-grade` 改成查 64³ LUT（`uLut` / `uLutAmount`；`uLutAmount = 0`
  退回原来那套算式，两条路差 ≤ 1/255）。
* **雾**（2026-09 起有三个生产者，全部接上了）：
  `uFogScatter`（**内部分辨率**全分辨率 —— 体积雾 apply 那一趟在内部域，而 composite
  在输出域按 uv 采它，TAAU 开着时中间多一次双线性放大；散射是低频量（froxel 网格
  x/y 才 160–240 格），这条是**有意接受的近似**，见 §17 的逐 pass 分辨率域表。
  rgb = 沿视线累积的**绝对散射亮度**，a = 透过率）+
  `uFogSource`（0 = 用内联的解析式高度雾自算，1 = 读那张图）。
  `uFogSource` **只有一个仲裁点** —— `VolumetricsPass.Prepare` / `RenderApply`。
  下面那三次 mix（去饱和、降对比、上色）是**大气透视的口径**，两条路共用。
  谁在里面：froxel 体积雾（近段散射）、物理大气（远段换色 + 解析路的雾色）、
  内联解析式（low 档与体积雾关掉时的永久回退）。三者怎么分工写在 `ApplyFog` 的
  抬头注释里，以及本文件「体积雾 / 体积光（froxel）」一节的「与物理大气的接缝」。

色差的通道偏移仍在 `MotionBlur()` 那一段里（它必须是对 `uHdr` 的第一次取样），
语义上归 `LensEffects`。

**2026-09 起 `MotionBlur()` / `DepthOfField()` 两段是空壳**：运动模糊与景深各自成了
独立 pass（§17）。两段的 uniform（`uMotionScale` / `uDof*` / `uNearDof*`）**保留不删** ——
`Script_PostDebug` 的「景深 CoC」视图、`Script_AdsSightTest`、`Script_DeathViewTest`
把它们当「本帧意图」的取证口在读。

### 1.10 Data_Tuning_Graphics 结构

纯数据、零 three 依赖（契约 2）。`QUALITY_PRESETS[low|medium|high|ultra]` 每档是一张
平表，键分三类：

* **现役开关/旋钮**：`ssao`（AO 总闸）`gtao`（档位名）`ssil` `aoScale` `bloomLevels`
  `godrays` `msaa` `motionBlur` `sharpen` `taa` `velocity` `hzb` `csm` `contactShadows`
  `ssr`/`ssrScale`/`ssrSteps`/`ssrResolveTaps` `volumetrics` `atmosphere`
  `clusteredLights` `autoExposure` `lensFlare` `lut`
  `pom`/`pomRefine`/`pomSelfShadow`/`detailNormal`/`microShadow`/`horizonOcclusion`/
  `skinSss`/`materialTexture`；
* **TAAU / 运动模糊 / 景深（2026-09 转正）**：`taaUpscale` `renderScale`
  `motionBlurTaps` `motionBlurScale` `dof` `dofScale`（算法口径在
  `Data_Tuning_TemporalDof.mjs`，见 §17）；
* **占位位**：八个子系统全部落地之后**这一类空了**（`RESERVED_OFF` 留着只是给
  「加一个 pass 先在这里加一位」那条流程一个落脚点）；
* 另有两组独立常量：`HZB`（`maxLevels` / `minSize`）、`VELOCITY`（`clampUv` /
  `skinnedPrev`）。

`Script_Post` / `Script_Main` / `Script_EditorSettings` **只读**这张表。
子系统落地时把自己那一位改成实际档位，并在表里补出处注释。

### 1.11 怎么新增一个 pass / 一个材质补丁

**加一个 pass**（三步，不动别人）：

1. 新建 `Script_Post<Name>.mjs`，导出一个实现 §1.3 契约的类；靶在 `Resize` 里建，
   要按名字对外就写 `pipeline.targets.<名字>`。
2. `Data_Tuning_Graphics` 里给四档各加一位开关（占位位已经预留了常见的几个）。
3. `Script_Post.mjs` 的 `this.passes` 里**插一行**，位置按帧图语义决定
   （问自己：它要读谁的输出？谁要读它的输出？）。

然后：`index.html` import map 登记新模块 `?v=1`、改过的模块戳 +1；
`Script_PostFrameGraphTest` 里给自己的接口补一条读回像素的断言。
**展示类 pass 必须读回像素验证** —— GLSL ES 3.00 保留字（`sample` / `filter` /
`input` / `output` / `patch` / `resource` / `active` / `common` / `partition`）
编译失败时 three 只在控制台留一行，那一趟什么都不画。

**加一个材质补丁**：写 `MakePatch({...})`（§1.8），加进
`Script_MaterialPatches.IndirectLightingPatches` 的返回数组（或调用方自己的列表），
key 带上会在运行时翻的位。

**加一个调试视图**（Debug Rendering 面板）。`Script_PostDebug.GetSource()` 是唯一的
仲裁点，查找顺序固定三步：

1. **帧图里的 pass 自带的** —— 在自己的 pass 上实现 `GetDebugSource(view)`，
   不认识的视图名返回 `null`。froxel 体积雾那四项、GTAO 的弯曲法线 / SSIL /
   镜面遮蔽三项、B6b 的 velocityTile / dofCoc / taaWeight 三项（挂在
   `Script_PostFxaa` 上：材质与那三张图的参数都在它手里）都走这条。**优先级最高**：
   pass 是自己那张靶的所有者，它说不可用就是不可用。
2. **`GetSource()` 里那条内置 switch** —— 预通道 / AO / Bloom / 材质假彩色 /
   SunShadow / SSR 三视图。这是 Phase A 就有的表，别往里加新子系统的东西。
3. **`PostPipeline.RegisterDebugView(id, resolve)` 登记表** —— 给「持有者不是 pass」
   的子系统用（物理大气那四张 LUT 归 `Script_Atmosphere` 自己持有，不在
   `post.targets` 里；B6a 的曝光直方图 / 镜头光晕 / 镜头脏污 / LUT 校验四项同理）。
   名字撞了先到先得。`DebugPass.RegisterView(id, resolve)` 是这一条的**别名**
   （B6a 的模块调的是那个名字），转发到同一张表 —— **登记表只有一张**。

三条路返回的都是同一种结构 `{ texture, mode, unavailable?, material?, Prepare?(ctx) }`。
给了 `material` 就走 `RenderView` 的「自带材质」通道 —— **那条分支只有一个**，
参数在自己的 `Prepare(ctx)` 里现取（SunShadow 也一样，没有特例）。
没给 `material` 就按 `texture + mode` 送进通用可视化着色器。
`unavailable` 为 true 时一律画不可用斜纹：**把一张没内容的靶送屏跟「渲染坏了」
长得一模一样**。视图还要在 `Script_EditorDebugRendering` 的 `VIEWS`、`VIEW_TARGETS`
与那条**组名列表**里各登记一次 —— 组名漏登记的话那一组的视图格根本不渲染，
面板上选不到（「反射」在 SSR 落地那一轮就漏过一次）。

### 1.12 怎么验（本轮的回归口）

```bash
node Taierzhuang1938/Script_PostFrameGraphTest.mjs   # 帧图契约（新增）
node Taierzhuang1938/Script_TaauTest.mjs             # TAAU / 运动模糊 / 散景景深（§17）
node Taierzhuang1938/Script_PostTest.mjs             # 合成暗部 + TAA 基本盘
node Taierzhuang1938/Script_GiTest.mjs               # GI 三态与调试视图
node Taierzhuang1938/Script_EditorTest.mjs           # Debug Rendering 全部视图
node Taierzhuang1938/Script_ActorDepthTest.mjs       # 蒙皮人物写进预通道
node Taierzhuang1938/Script_ProfilerTest.mjs         # GPU 分段名（prepass/main/composite/fxaa）
node Taierzhuang1938/Script_FrameProfileTest.mjs     # 整帧 CPU/GPU 消融
```

逐比特无损的证据留法：把探针页的时间与帧序全部钉死
（`Probe.state.elapsed = 0; Probe.post.frame = 0; hasTaaHistory = hasPrev = false;`
再 `StepFrames(N, 1/60)`），然后 `readRenderTargetPixels` 读 `post.targets.ldr`。
**这样跨进程逐比特可复现**；而走 `Script_ShotTest` 出图的路子有 `waitForTimeout`
里的自由 rAF，跨进程本底噪声就有 1–2 的通道均差（实测同版本两轮：Probe_Materials
最大差 37、均差 1.19；正片镜头因为有 AI 与烟火，均差到 2.3），只能判「结构有没有变」。

---

## 1S. 阴影：CSM / PCSS / 接触阴影（2026-09）

> **这一节是阴影侧的现状说明。** 旧的 §10 是设计期草案，选型与实装不同（见那一节抬头）。
> 模块：`Script_Csm.mjs`（级联 + 着色器 chunk）、`Script_ContactShadows.mjs`（屏幕空间
> 接触阴影 pass + 三张调试图）、`Script_Light.mjs`（装配与对外接口）、
> `Data_Tuning_Shadows.mjs`（全部数值）。

### 1S.1 重构前是什么样

一盏 `DirectionalLight`、**一张** 66 m 跟随正交框（前推 22%、纹素吸附），
high 档 4096²（132 m 铺满 = **3.2 cm/texel**），`PCFShadowMap`（three 内置 Vogel 5
抽样 + IGN 旋转、硬件比较），`bias −0.0004 / normalBias 0.035 / radius 2.2`。
**66 m 之外一点阴影都没有**，远处靠雾盖；近处 3.2 cm 的纹素在 5 m 处铺开约
8 个屏幕像素，砖缝级的影子糊成一团。

### 1S.2 选型与 3A 参考实现的对应

| 这一版做的 | 对应的参考实现 | 为什么 |
|---|---|---|
| N 盏同方向 `DirectionalLight` 各持一张阴影图，三方的 `WebGLShadowMap` 照常烘 | three CSM addon 的原理（本仓零 addon，自己写） | 复用三方的 `castShadow` / 蒙皮 / 实例化 / alphaTest / 自定义深度材质全套，不重写一遍阴影渲染 |
| practical split（λ 混对数与均匀） | Zhang 2006，UE / Unity / DX 示例通用 | λ=0.92 偏对数：λ=0.7 会把最近一级推到 3 cm/texel，等于白改 |
| 视锥切片**包围球** + 光空间纹素吸附 + 半径量化到 1/16 m | UE 的 CSM 拟合、"Stable Cascaded Shadow Maps" | 球半径只依赖 `zn/zf/fov/aspect`，与相机位姿无关 → 转头不沸腾 |
| 相邻级 **过渡带混合**（本级图边缘 10% 内按边距淡入下一级） | UE 的 cascade fade | 不混合 = 级边界一条硬缝，而且随相机移动扫过画面 |
| **纹理空间选级**（第一张覆盖到本片元的图），不是按视深选 | — | 包围球被 `maxRadius` 封顶后「本级铺到多远」不再是常数，只有图自己知道 |
| **PCSS**：blocker search → 半影估计 → 按半影缩放的 Vogel 盘 | Fernando 2005；COD / Frostbite 的实践 | 平行光的半影只跟「遮挡体—接收面」间距成正比，一条直线 |
| **receiver-plane 深度偏置**（梯度钳住） | Isidoro 2006（本仓第一人称自阴影已经在用同一套） | 盘上偏出去的抽样点比较的是「同一个平面在那儿该有多深」，掠射角不必把常数 bias 调到顶飞影子 |
| 逐级 bias / normalBias 按**纹素世界尺寸**缩放 | 通用做法 | 远级纹素粗四倍、痤疮台阶也粗四倍，同一个绝对偏移必然「近处彼得潘 + 远处痤疮」二选一 |
| **屏幕空间接触阴影**：沿太阳方向短距离 raymarch | UE Contact Shadows / Frostbite SSCS / COD screen-space shadows | 补 `normalBias` 把着色点推出地面造成的贴地漏光，以及远级纹素够不到的接触带 |
| **一帧只烘一张**（`shadow.autoUpdate=false` + 按 `bakeOrder` 轮转点 `needsUpdate`） | UE 的 per-cascade update frequency | 城里每趟烘焙有 1.45 M 三角的地板，单帧红线只剩 2.59 M 余量（见 §1S.8） |

### 1S.3 为什么是「替换 chunk」不是「材质补丁」

材质补丁（`Script_MaterialPatches`）只覆盖走 `MaterialLibrary` 那条路的材质。
白盒关卡（`Script_FirstLevelWhiteboxField`）、破口碎块（`Script_Destruction`）、
过场自建的 `MeshStandardMaterial` 都是自己 `new` 出来的，**一份都不走补丁**。
而 N 盏灯是全局的：漏掉一份材质，那份材质就吃 N 份太阳，画面当场过曝。

所以级联本体整段替换 `THREE.ShaderChunk.lights_fragment_begin` 里的平行光循环，
外加把采样函数追加进 `shadowmap_pars_fragment`。`ShaderChunk` 是三方导出的**可变对象**，
换掉它 = 每一份内置光照材质都跟着改。**必须在任何材质编译之前做一次**
（`InstallCsmShaderChunks(quality)`，由 `LightRig` 构造时调；`PostPipeline` 与
`MaterialLibrary` 都在它之后才编译第一份程序）。

补丁注册表里只留两件 chunk 做不到的事：接屏幕空间接触阴影那张全屏图（要逐材质
接 uniform），以及把 Debug Rendering 的「太阳阴影」假彩色（GI 视图 9）改读级联可见度。

### 1S.4 零额外 uniform 的级联

级联要的东西三方已经逐灯上传了：

* `vDirectionalShadowCoord[i]` —— 顶点着色器里按**逐级** `shadowNormalBias` 推过法线的阴影坐标；
* `directionalShadowMap[i]` —— 逐级阴影图；
* `directionalLightShadows[i]` —— `shadowBias` / `shadowNormalBias` / `shadowRadius` / `shadowIntensity` / `shadowMapSize`。

唯一缺的是「这一级铺了多少米、深度范围多少米」，而它能从 `directionalShadowMatrix[i]`
反解：正交矩阵第 0 行的模 = 1/覆盖宽度，第 2 行的模 = 1/深度范围。那张矩阵三方本来
就写进 `uniforms.directionalShadowMatrix`（`three.module.js:18251`），只是只在
**顶点**着色器里声明过；追加的 chunk 在**片元**着色器里再声明一次即可。

**结果：整套 CSM + PCSS 不需要任何自备 uniform**，接谁都不会漏，也不会因为
「某个材质没接到 uniform」而半边画面不对。

### 1S.5 能量守恒（安全网，别删）

N 盏灯里**只有第 0 盏有强度**，1..N-1 的 `intensity = 0` —— 它们只是阴影图的容器。
于是任何没走到级联代码的路径（玩家关掉阴影 → `USE_SHADOWMAP` 消失 → 落回三方原版
循环；某个非内置着色器自己算光）加出来的太阳仍然只有一份。
`Script_CsmTest` 的「只有第 0 盏灯带强度」守着这一条。

`lights.sun` 仍然是第 0 盏（`csm.lights[0]`）：`Script_Gi` 取太阳色、画质面板读
`mapSize`、`ApplyGraphics` 写 bias 都还指着它，那些引用一个都没断。

### 1S.6 采样口径：BasicShadowMap（裸深度）

PCSS 的 blocker search 必须**读到深度值**，而 `PCFShadowMap` 下三方给 `depthTexture`
设了 `compareFunction = LessEqualCompare`，它是 shadow 采样器纹理，只能比较不能读
（用 `sampler2D` 绑是未定义行为，多数驱动整片返回 0 = 全屏死黑）。所以整局走
`BasicShadowMap`：`compareFunction = null`、`NearestFilter`、
`uniform sampler2D directionalShadowMap[]`，**双线性 PCF / 半影估计 / receiver-plane
偏置全部自己写**（这也正是 3A 引擎的做法）。

「先比较再插值」不能反：先插值再比较等于比较一个被平滑过的深度，阴影边缘会整体
外扩一个纹素。

渲染器的这一位由 `Script_Csm.ApplyRendererShadowSettings(renderer)` 统一设置，
`LightRig` 构造时替调用方做掉（`Script_Main` / `Script_Probe` 都把 `renderer` 传给它）。
代码里同时保留 `SHADOWMAP_TYPE_PCF` 分支：别的页面（`Script_InfantryAnimationTest`）
用三方默认的 PCF 档，那里走硬件比较 + 固定盘，级联照常工作，只是没有接触硬化。

### 1S.7 帧内位置、RT 与 uniform

```
prepass → hzb → ssao → contactShadows → main → …
                        ↑ 新增
```

* **阴影图**由三方的 `WebGLShadowMap` 在本帧**第一次** `renderer.render`（就是预通道那趟）
  内部烘。`renderer.shadowMap.autoUpdate = false`；每帧由
  `lights.ScheduleShadowUpdate(renderer)`（`Script_Main.RenderScene`）点逐级的
  `shadow.needsUpdate`，再由它汇总成全局 `shadowMap.needsUpdate`。
  剖析器里它仍然是 `shadow` 那一段（`Script_Profiler` 包着 `shadowMap.render`）。
* **接触阴影靶** `targets.contactShadow`：RGBA8，`contactScale ×` 主靶尺寸
  （high/ultra 1.0、medium/low 0.5）。R = 可见度（1 = 没挡住），G = 线性视深 / 64
  （双边模糊要）。经一次分离双边模糊后交给材质。
* 材质侧的 uniform 只有两条，且是**共享引用**（一处更新全场生效）：
  `uCsmContactMap`（关着时是 1×1 纯白）、`uCsmContactResolution`（**主靶尺寸**，
  不是接触阴影靶的尺寸 —— 材质按 `gl_FragCoord.xy / 它` 取样）。
* 全屏 pass 的公共接口在 `Script_Light.SUN_SHADOW_GLSL`（本体在 `Script_Csm.SUN_SHADOW_SAMPLER_GLSL`）：
  `uSunShadowMap[4]` / `uSunShadowMatrix[4]` / `uSunShadowParams[4]`（x=图边长, y=深度偏移,
  z=法线偏移, w=盘半径）/ `uSunShadowCount` / `uSunShadowIntensity` / `uSunShadowEnabled`。
  由 `BindSunShadowUniforms(uniforms, lightRig)` 建齐，每帧 `lightRig.SyncShadowUniforms()`。
  GLSL 三个签名：

  ```glsl
  float SunShadowVisibility( vec3 worldPos, vec3 worldNormal );        // 8 抽样 Vogel 盘
  float SunShadowVisibilityCheap( vec3 worldPos );                     // 单抽样（体积雾 raymarch）
  float SunShadowPenumbraTexels( vec3 worldPos, vec3 worldNormal );    // 半影宽度（调试视图）
  ```
  **签名跨这次实现更换一个字没改**：调用方（Debug Rendering 的 SunShadow 视图、
  接触阴影、将来的体积雾）不用跟着改。
* **`SyncShadowUniforms()` 目前由消费方自己在出画前调**（`DebugPass.RenderView`、
  阴影调试视图的 `Prepare`），不在主循环里每帧调一次。原因是它必须排在**本帧阴影图
  烘完之后** —— `shadow.map` 是三方在第一次 `shadowMap.render` 里才建的，
  而那一趟发生在预通道里。体积雾落地时要么照样在自己的 `Render(ctx)` 开头调一次
  （最简单，pass 排在预通道之后），要么由 `Script_Main.RenderScene` 在
  `post.Render` 之前补一句。

### 1S.8 一帧只烘一张（单帧三角红线逼出来的口径）

**这一条是本轮最重的一个实测发现，改级联参数前必读。**

滕县城里**每一趟阴影烘焙都有约 1.45 M 三角形的地板**，而且它几乎不随级联半径变化
（phase=2 / quality=high / scale=small 实测）：

| 这一级的半径 | 三角 | draw |
|---:|---:|---:|
| 13.5 m | 1.455 M | 98 |
| 34.6 m | 1.749 M | 142 |
| 87.6 m | 2.241 M | 236 |
| 233.6 m | 2.913 M | 377 |

原因是静态世界走 `BuildSink` 分区合批，那些巨大的合批块与地形块的包围体覆盖整片区，
**逐级视锥剔除根本剔不掉它们** —— 半径开到 13 m 还是 230 m，进那一趟的三角数只差一倍。

而 `Data_AssetStandards.SCENE_RENDER_LIMITS.triangles` 的单帧红线是 **8.10 M**，
这一关不带阴影是 5.51 M（`BootTest` 那一帧含预通道 + 主场景 + GI），
**留给阴影的余量只有 2.59 M —— 也就是一帧一张**。四张一起烘是 8.4 M，
第一版就是这么把 BootTest 的四关顶红的（phase 2/4/5/6，最高 11.07 M）。

所以调度不是「每级隔几帧」而是 `bakeOrder`：**一条逐帧轮转表，每帧恰好烘一张**，
最近一级在表里占的格子最多（它扛着会动的人和车）。副作用：近级阴影按 ~30 Hz 刷新
（60 fps 下最多落后一帧，看不出来），远级按 ~9 Hz（那里一个人只有几个像素宽）。

**例外**：`shadow.map === null` 的级必须立刻烘 —— 三方给材质绑的是空纹理，
裸深度读到 0 = 那一级覆盖的区域整片死黑。开机与换阴影图尺寸那一帧允许一次性烘满
（加载画面盖着屏幕，也不在任何单帧预算的取样点上）。

想要真正的四级铺满 200 m，前提是先解决那 1.45 M 的地板 —— **静态几何的阴影缓存**
（城不动，只有人在动；UE 的 cached whole-scene shadow 就是干这个的），或者提高三角红线。
两件事都超出本子系统的边界，留给集成方。

落地后的单帧实测（`?shot=1&phase=N&quality=high&scale=small`，16 帧取峰值）：

| 关 | 峰值三角 | 均值 | 峰值 draw | 重构前 |
|---|---:|---:|---:|---:|
| phase 2 城内 | **7.75 M** | 7.16 M | 764 | 6.97 M |
| phase 4 东关之夜 | 7.28 M | 6.64 M | 839 | — |
| phase 5 城墙 | 6.23 M | 5.83 M | 1229 | — |
| phase 6 最后 | 6.32 M | 6.02 M | 1207 | — |

红线 8.10 M / 5000 draw。**phase 2 只剩 0.35 M（4%）余量** —— 谁往城里再加几何，
先看这一格。`BootTest` 自己那一帧读到的是 7.28 M（它取的是固定的一帧，不是峰值），
七关全过。

**阴影 draw call 的 A/B**（phase 2 / high / scale=medium，包 `shadowMap.render` 记增量，
交替各 5 轮取中位数）：级联 60.9/帧 vs 重构前那张 66 m 单框 49/帧，**+24%**
（任务书给的上限是 1.8 倍）。整帧墙钟中位数两档都是 9.4 ms —— 这台机器上同时还跑着
另外几个 agent 的浏览器测试，CPU 侧噪声远大于这点差别，所以只能说「量不出退步」，
不能当成精确数字。

### 1S.8b 分档（`Data_Tuning_Shadows.SHADOW_PRESETS`）

| 档 | 级数 | 每级图 | 覆盖上限 | 最远级半径 | bakeOrder | PCSS 级 | blocker / 盘抽样 | 接触阴影 |
|---|---|---|---|---|---|---|---|---|
| low | 2 | 1024 | 60 m | 60 m | `0,1` | 0 | — / 5 | 关 |
| medium | 3 | 1024 | 90 m | 80 m | `0,1,0,2` | 0 | — / 10 | 半分辨率 |
| high | 3 | 2048 | 120 m | 90 m | `0,1,0,2,0,1,0` | 2 | 8 / 12 | 全分辨率 |
| ultra | 4 | 2048 | 170 m | 130 m | `0,1,0,2,0,1,0,3` | 2 | 12 / 16 | 全分辨率 |

实测（探针页 street，640×360）：high 三级半径 13.6 / 41.2 / 90.0 m，
纹素 **1.33 / 4.02 / 8.79 cm**（重构前是一张 66 m 框 4096²，全程 3.2 cm）。
显存比重构前**少四分之一**（3 × 2048² < 1 × 4096²）。

low 档重构前**完全没有**太阳阴影（`castShadow = false`），现在给上两级 ——
2 × 1024 一帧一张，比原来那张「1024 铺 132 m」还便宜。
夜战预设（`lightIntensity ≤ 0.35`）仍然整体关掉阴影。

`Data_Tuning_Graphics` 里只留两位总闸：`csm`（四档全开）与 `contactShadows`
（medium 及以上）。

画质面板（`Script_EditorSettings`）：

* **阴影** 总开关、**接触阴影** 开关（与档位取与：low 档没编那段 GLSL，
  开了也没用；这一位只决定「跑不跑那一趟 pass」，材质里那段是编译期开关，
  热切不重编译）、**阴影分辨率（每级）**、
* 细节组：**深度偏移** / **法线偏移**（都是**第 0 级的基准**，往外逐级按纹素缩放）、
  **阴影距离**（最远一级铺到哪，0 = 档位默认，40–400 m）、
  **阴影强度**（`shadow.intensity`，「影子不死黑」那根）。
  「阴影距离」的默认必须是 0 而不是某个具体米数：写死一个数会让 ultra 的 170 m
  被这根滑杆悄悄压回 high 的覆盖。
* 旧的「覆盖半径 `shadowExtent`」已废（级联的每级半径由分割与包围球算，不再是一个数），
  换成 `shadowDistance`；键名换了，老存档里的 66 不会被误读成 66 m 的总覆盖。

### 1S.9 调试视图

Debug Rendering「光照」组新增三项（`Script_ContactShadows.MakeShadowDebugViews`，
经 `DebugPass.RegisterView` 登记）：

* **级联假彩色**（`csmCascade`）：红=第 0 级、黄=1、绿=2、蓝=3、深灰=级联之外。
  底色乘了阴影可见度，所以同时看得到影子落在哪。相邻级之间那条颜色渐变带就是 cascade fade。
* **阴影半影**（`csmPenumbra`）：蓝 = 硬（贴着遮挡体）、橙 = 软。柱子/旗杆根部应该是蓝、
  越往上越橙；整屏一个颜色 = blocker search 没生效或这一级不跑 PCSS。
* **接触阴影**（`contactShadow`）：接触阴影靶本尊。只该出现在贴地那一圈与缝隙里。

「SunShadow 采样」（`sunShadow`）与「太阳阴影」（材质假彩色视图 9）照旧可用，
两者现在都显示级联结果 —— 视图 9 原来调的是 `getShadow(directionalShadowMap[0], …)`，
级联之后那只是第 0 级；`Script_Csm.MakeCsmPatch` 在同一个锚点**追加**一段覆盖，
改读 `gCsmSunVisibility`（已经把接触阴影 min 进去了），GI 补丁一个字没动。

**`DebugPass.RegisterView(id, spec)` 是给别的子系统开的口子**：
`{ material?, Prepare?(ctx), Texture?(), mode?, Unavailable?() }`。带 `material` 的
自己出画（像 sunShadow 那样），只给 `Texture` 的走通用展示 pass。
配套的 `RegisterSunShadowClient(client)` 让外部视图跟着 `SetSunShadowSource` 换 LightRig。
这样新增一张调试图 = 自己模块里写材质 + `Script_Post` 里登记一行，
不用改 `Script_PostDebug` 的开关表。

### 1S.10 已知近似（都是有意的，别当 bug 修）

1. **r185 没法给远级做逐级层剔除。** `WebGLShadowMap.renderObject( scene, camera,
   shadow.camera, light, type )` 里的判据是 `object.layers.test( camera.layers )` ——
   `camera` 是**主视图相机**不是阴影相机。任务书里「给远级阴影相机关掉小投影体那一层」
   的前提不成立（已核实源码）。远级成本改用「一帧只烘一张」压（§1S.8）。
2. **包围球封顶。** 超宽屏下切片包围球半径是切片远端距离的 ~1.5 倍
   （`k = tan(fovY/2)·√(1+aspect²)`）。`maxRadius` 给它封顶，封顶之后最远一级的四角
   落到覆盖外，那里返回「照到」，由雾接管。
3. **中段纹素比重构前粗。** 40–90 m 从 3.2 cm 变到 ~8.8 cm。这是有意的取舍：
   40 m 处 1 屏幕像素 ≈ 3.1 cm，8.8 cm ≈ 3 px，而那个距离的 PCSS 半影本来就更宽。
   换来的是最近一级 1.3 cm（重构前 3.2 cm）与 66 m → 90 m 的覆盖。
4. **过渡带只混两级。** 本级与下一级；三级同时相交的角落按本级算。
5. **PCSS 只在最近两级。** 远级半影早就比一个屏幕像素宽，blocker search 是白花钱。
6. **接触阴影是屏幕空间的。** 射线走出屏幕、或遮挡体在屏幕外就没有；深度缓冲只有一层，
   「射线钻到表面后面」与「表面后面是空的」靠 `thicknessMeters` 分。
   第一人称的手与枪写的是常数 1 m 前景标签（不是真视深），由 `minViewDepth = 1.25`
   整段排除。
7. **抖动不掺帧序号。** 盘旋转用 `interleavedGradientNoise(gl_FragCoord.xy)`，没有帧项 ——
   TAA 每帧抖动相机，同一个世界点落在不同的 `gl_FragCoord` 上，时间上的样本轮换由它提供
   （三方内置的 `getShadow` 同样如此），而画面仍然逐帧确定，逐轮截图比对才有意义。
8. **轮转期间不重拟合。** 这一帧不烘的级连矩阵一起不动 —— 否则会出现
   「矩阵是新的、图是旧的」，影子整体平移半个身位而且只在移动时出现
   （`Update` 置 `dirty`、`ScheduleShadowUpdate` 消 `dirty`，两者严格配对）。
   相机瞬移 / 换关 / 太阳转向由 `CsmRig.ForceUpdate()` 标脏，之后仍按轮转表
   一帧一张地补齐（`bakeOrder.length` 帧内收敛）。
9. **拟合用基准 FOV 不用当下 FOV。** 开镜把 fov 从 55 压到 20 会让包围球缩到三分之一，
   级联每帧变尺寸 = 阴影边缘随开镜呼吸。
10. **近级阴影 ~30 Hz、远级 ~9 Hz。** 会动的人与车在近级里最多落后一帧；
    远级里一个人只有几个像素宽，9 Hz 看不出来。
11. **`CsmReceiverPlane` 的 `dFdx` 在级边界与覆盖边界处于非均匀控制流。**
    那里同一个 quad 里的像素可能选了不同的级，导数是垃圾 —— 但梯度被钳在 ±0.02，
    换算到 4 纹素的偏移上只有毫米级，落在过渡带里看不见。

### 1S.11 怎么验

```bash
node Taierzhuang1938/Script_CsmTest.mjs            # 级联/PCSS/接触阴影（新增）
node Taierzhuang1938/Script_PostFrameGraphTest.mjs # 帧图契约（pass 顺序里多了 contactShadows）
node Taierzhuang1938/Script_PostTest.mjs
node Taierzhuang1938/Script_GiTest.mjs
node Taierzhuang1938/Script_EditorTest.mjs         # Debug Rendering 全部视图（含新增三张）
node Taierzhuang1938/Script_BootTest.mjs
node Taierzhuang1938/Script_ModuleGraphTest.mjs
node Taierzhuang1938/Script_TestRunnerTest.mjs
```

`Script_CsmTest` 断的是数值不是观感：逐级图与尺寸、只有第 0 盏带强度、
分割单调与纹素单调、相机平移 0.37 纹素后各级光空间中心**只整纹素地跳**、
相邻级过渡带外沿投进下一级仍在图内、**一帧只烘一张**且一轮之内每级都被烘到、
地面孤立暗点比例（痤疮）在有/无 normalBias 两种设置下都守得住、
三张调试图都有内容、60 帧不重编译、GL 无错。
末尾还会把 low / medium / ultra 各加载一遍 —— **每一档生成的是另一套 GLSL**
（级数 / 抽样数 / PCSS 级数都不同），编译失败三方只在控制台留一行，
只验 high 是不够的。

视觉对照出图（人工审，落 `_shots/`，已 gitignore）：

```bash
node Taierzhuang1938/Script_CsmShot.mjs
```

出 7 张：级联 vs 重构前那张 66 m 单框、级联假彩色、PCSS 半影、接触阴影开/关/靶本尊。
**拍的是探针页的 street 场景不是正片** —— 正片这一关的天光（smokyDay / dusk）
环境光压得很高、雾很厚，街面上的太阳阴影本来就淡到几乎看不出（那是那一关的
美术意图，见 `Script_Sky` 里 smokyDay 关于「6—8:1 照片感」的账），拿它当阴影
证据什么也证不了。

单帧提交量（三角红线）：

```bash
node Taierzhuang1938/Script_BootTest.mjs      # 七关各一帧，含 8.10 M 三角红线
```

---

## 1A. 帧结构总览（历史稿：2026-09 之前的设计期草案）

> **现状以 §1「帧图与模块契约」为准。** 这一节留着是因为下面几节（§2–§16）
> 的深挖仍然有效，而它们引用的是这张老帧图。两者的差别：TAA 实际跑在 tonemap
> 之前的线性 HDR 域（不是 sRGB 之后）、体积雾与 CSM 仍未实装、速度缓冲
> 2026-09 才真的产出。


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

### 2.1 动态特效灯进入哪一段（历史稿：2026-09 簇状光照之前）

> **现状以 §17「簇状前向光照」为准。** 下面这一节描述的是 2026-09 之前的做法：
> 固定预算的物理 `PointLight` 池（high 6 盏），逻辑火源可以更多但每帧只有前 N 盏
> 进 GPU。那条「别改 `NUM_POINT_LIGHTS`」的由头**今天仍然成立**，也正是簇状光照
> 存在的理由 —— 它把灯从「three 的 uniform 数组」搬进了纹理，于是开灯关灯不再是
> 编译期的事。low 档仍然走本节这条路。

爆炸和持续燃烧的点光不在 Composite 里“染一层橙色”，而是在第 3 趟 HDR 主场景里作为
three 前向 PBR 的直接光参与 `MeshStandardMaterial`：地面、墙、人物和碎块收到的是真正按
法线、距离和粗糙度计算的光，随后亮面再进入 Bloom，最后才 ACES。粒子火球仍是 HDR
自发光；两者共用 `VfxSystem` 的生成时刻与 `LightRig` 的秒制包络，所以火球由白热转橙、
亮度回落时，环境反光也同拍回落。

物理点光数量按画质档固定，持续火源与同时存在的爆炸只是逻辑源；`LightRig.Update` 按
镜头附近的实际贡献选出有限几盏送给 GPU。所有物理灯常驻 `visible=true`，闲置时
`intensity=0`，避免第一颗手榴弹或一处新火把改变 `NUM_POINT_LIGHTS`、触发整城 PBR shader
重编译。特效点光不投实时阴影；太阳阴影仍是唯一阴影图预算，近墙爆光靠直接光、SSAO 与
已有几何阴影共同维持体积。

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

## 4. SSAO（半球采样 + 噪声旋转 + 双边模糊）〔历史稿：2026-09 已被 GTAO 整个替换〕

> **这一节讲的实现已经不在仓库里了。** `Script_PostSsao.mjs` 于 2026-09 删除，
> 帧图里那一格换成了 `Script_PostGtao.mjs`（地平线基 AO + 弯曲法线 + SSIL）。
> 现状看文末的「17. GTAO / SSIL / 镜面遮蔽（2026-09）」。这一节留着是因为它记着
> 半球采样那一版踩过的坑（核向量长度、z 为负、双半径），换算法之后仍然是有用的
> 反面教材 —— 但**别照它调参**，GTAO 一个 uniform 都不叫这些名字。

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

### 6.2 raymarch 体积雾（历史稿：**没有实装这一版**，现状见 §17）

> **这一节是 2026-09 之前的设计期草案，实际落地的是 §17 的 froxel 方案。**
> 差别不只是「半分辨率 raymarch」换成「froxel 网格」：这里这一版没有时域重投影
> （单帧 28 步必然是噪点或环带）、没有局部光、没有局部雾体、也没有把
> **透过率**与今天的解析雾对齐（那是用户硬约束「先别动雾」的落点）。
> 留着它是因为下面那段 `sampler2DShadow` 的坑仍然成立，而且 §17 就是从它长出来的。

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

### 7.2 TAA（历史稿：2026-09 TAAU 之前的版本；现状以 §17 为准）

> **这一节写的是「单分辨率 TAA」那一版。** 2026-09 起 TAA 吃预通道的逐物体速度靶、
> 加了方差裁剪 / anti-flicker / responsive 掩码，并且解算到**输出分辨率**（TAAU）。
> 抖动、Catmull-Rom 历史、YCoCg rounded AABB、Karis tonemap 域这四件事没变，
> 下面的深挖仍然有效；改动与新口径见 §17。

实装在 `Script_Post.mjs` 的 `FRAG_TAA` + `Render()` 第 0/3.5 段，方案与参数照搬
UE 的缺省 Temporal AA（Karis SIGGRAPH 2014 + TemporalAA.usf 出厂 CVar），
数值一律看常量名，不在这里抄数：

- **抖动**：Halton(2,3) 相位数 `TAA_SAMPLES`（对应 `r.TemporalAASamples`）。
  不走 `setViewOffset`（每帧两次全量重算投影矩阵），直接偏置
  `projectionMatrix.elements[8]/[9]` 并在主场景画完立刻还原 ——
  预通道 / SSAO / 主场景吃同一份抖动矩阵（深度与颜色必须同套抖动才自洽），
  太阳投影、`prevViewProjection`、运动模糊拿到的都是干净矩阵。
- **当前帧滤波**：3×3 邻域按 Blackman-Harris 3.3 的高斯拟合
  （`TAA_FILTER_GAUSSIAN_K`）围绕本帧子像素位置重定心；权重只依赖 jitter，
  每帧 CPU 算九个数喂 uniform。
- **速度**：无逐物体速度缓冲（§1 帧图里的 MRT velocity 从未实装），
  由深度反投影从相机运动推出，与合成 pass 的运动模糊同一套近似；
  取 3×3 **最近片元**做 dilation（UE 的 closest-fragment velocity）。
  动的人物/碎片靠邻域裁剪兜底 —— 表现是它们边缘时域累积浅一些，不是鬼影。
- **历史**：Catmull-Rom 5-tap（Jimenez 9→5）重采样，抵消逐帧双线性的累积糊；
  YCoCg 空间 AABB 裁剪，3×3 大盒与十字小盒对折（UE 的 rounded box）。
- **混合**：当前帧权重 `TAA_CURRENT_FRAME_WEIGHT`（对应
  `r.TemporalAACurrentFrameWeight`），快动时向 0.2 抬
  （UE: `lerp(w, 0.2, saturate(velocityPx/40))`）；混合在 Karis tonemap 域
  （`c/(1+luma)`）做，防火光 firefly 帧间闪；NaN 杀手防历史污染。
- **位置**：主场景之后、泛光之前的线性 HDR 域（与 UE 一致；§1 帧图把 TAA
  画在 sRGB 之后是设计期的旧稿，以实装为准）。泛光 / 雾 / 运动模糊 / DOF
  吃的都是解算后的画面。TAA 开着时最后一趟的 FXAA 用 `uFxaa` 关掉，
  锐化保留（UE 对应 Tonemapper Sharpen）。
- **档位与开关**：`QUALITY_PRESETS` 的 `taa` 位是**出厂默认** —— medium/high/ultra
  开、low 关（两张全分辨率 RGBA16F 历史靶对集显是实打实的带宽）。ultra 的 4×MSAA
  保留：是给 TAA 喂更干净的几何边，叠加不冲突，只是贵。
  运行时状态在 `PostPipeline.taaEnabled`，画质面板「抗锯齿」那一栏经
  `graphics.taa` → `ApplyGraphics` → `SetTaaEnabled(on)` 热切（走 GI 那条惰性构造
  的先例：靶按 `taaEnabled` 建，low 档打开时才建、关掉立刻还显存），所以它
  **不属于**「要重开页面」的那一组。`ApplyGraphics` 里这一行必须排在 `SetSize`
  之后 —— SetSize 按当时的 `taaEnabled` 建靶，反过来的话刚打开的那一次会漏建。
  另有逐次调用的 escape hatch `options.taa === false`（A/B 像素对比测试用，
  不动面板那一位）。两条路径中断后重新开启都会丢历史（`taaWasActive` 记着）。
- **镜头硬切**：`PostPipeline.NotifyCameraCut()` 丢历史；不调也只是切换
  瞬间一帧轻微溶解（邻域裁剪一两帧内压回去），语义对应 UE 的 camera cut。
- **决定论**：抖动与历史全由 frameIndex 驱动，`StepFrames` 推同样多帧
  画面逐像素可复现 —— 截图审查流程不受影响，但对比截图前要让历史滚够
  一个相位周期（≥ `TAA_SAMPLES` 帧），半收敛的图不算数。

---

## 8. 运动模糊（历史稿：设计期草案；现状以 §17 为准）

> **实装走的不是这一节。** 2026-09 起运动模糊是独立 pass
> （`Script_PostMotionBlur.mjs`，McGuire 2012 的 tile max → neighbor max → 重建
> ＋ Jimenez 2014 的两向交替采样），快门由 `Data_Tuning_TemporalDof.MOTION_BLUR`
> 定（180°）。下面这段单向采样的草案留作对照。

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
// 对比度是感知域操作。在线性域围绕 0.5 拉伸会把暗部先减掉一大截，
// 深色枪械/军装即使 BaseColor、GI、AO 都正常，最终也会被硬裁成纯黑。
vec3 perceptual = LinearToSrgb(col);
perceptual = (perceptual - 0.5) * uContrast + 0.5;
col = SrgbToLinear(clamp(perceptual, 0.0, 1.0));
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

## 10. 阴影：没有 addon 的最简 CSM（历史稿：2026-09 之前的设计期草案）

> **现状以 §1S「阴影：CSM / PCSS / 接触阴影（2026-09）」为准。** 这一节留着是因为
> 里面的事实核查（r185 的 `shadowMapTypeDefines` 只有 PCF/VSM 两个 key、
> `PCFSoftShadowMap` 掉进 BASIC、PCF 内置 Vogel 5 抽样）仍然有效，而实装的选型
> 与它并不相同：**没有走「路线 A 的 onBeforeCompile」，走的是整段替换
> `ShaderChunk.lights_fragment_begin`**（补丁只覆盖走 MaterialLibrary 那条路的材质，
> 漏一份就是那份吃 N 份太阳）；阴影图类型也从 `PCFShadowMap` 换成了
> `BasicShadowMap`（PCSS 的 blocker search 必须读到裸深度）。
> 「第一人称自阴影」与「前景标签」两小节仍是现状。


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

### 第一人称自阴影（独立视模靶）

正式实现位于 `Script_FirstPersonSelfShadow.mjs`。第一人称枪械为了伪造窄 FOV 与守住近裁面，
在相机下经过非等比深度压缩；若直接设 `castShadow=true`，这棵假几何会进入战场太阳阴影图，
在墙上投出被放大的黑块。因此视模继续禁止向世界投影，另用只看第一人称层的正交相机画
RGBA packed depth，并在视模自己的材质克隆里以 3×3 PCF 乘直射漫反射与镜面反射。

这张靶在本帧手臂 IK、枪姿与世界矩阵更新后、主颜色 pass 前生成；透明枪焰与飞行弹壳不写入。
材质必须先克隆再注入，不能改 `MaterialLibrary` 的共享底材，否则世界里的同名枪材质也会采到
相机旁边这张阴影。画质面板的「第一人称自阴影」可热切、落盘，并服从「阴影」总闸。

**2026-09-05 定论：第一人称左手背上那块「黑色阴影状颜色」就是这张靶投出来的**，不是渲染链坏了
——太阳在玩家身后时，枪托/机匣与右手挡在太阳与左手之间，影子落在左手背；1024 图铺 2.7 m
（2.6 mm/texel）加 3×3 `step` PCF、强度 0.78，于是是一块硬边、带锯齿、只剩两成直射光的斑。
排除法：强度归零或 depth pass 后关掉着色器项即消失；bias 抬到 ≈30 cm 仍在（不是 acne）；
CPU `applyBoneTransform` 投影与深度图剪影重合（depth pass 蒙皮正确）；只留手臂或只留枪当
caster 各自都投得出。**无头 SwiftShader 下这张靶的结果与真显卡不一致**（右手整只被遮），
取证要走有头浏览器（`chromium.launch({channel:"msedge", headless:false})`，webdriver 下游戏
走假指针锁）。Debug Rendering 的「Diffuse Lighting」视图能直接看到它。

为此加了**软化路径**（`SetSoft`，画质面板「自阴影软化」，`graphics.firstPersonSelfShadowSoft`，
**出厂关**）：靶换 2048、12 点固定 Poisson 盘 × 双线性 PCF（先比较再插值）、receiver-plane
深度偏置（Isidoro 2006，梯度钳在 1.0）配更小的常数偏置 0.0006。软化是 uniform 分支不是
define，热切不重编译视模材质；滤波半径按米给（默认 6 mm）再换算成 texel，靶换尺寸半径不变。
`Script_EditorTest` 点真实按钮验 2048 靶、深度非空、GL 无错、手仍画得出来、关回 1024。

它那趟自阴影 depth pass 会临时把视模材质的 `allowOverride` 打开再还原 —— **还原必须按材质
去重**：一份钢材同时挂在枪身与刺刀上，第二次记下的是自己刚改成的 `true`，还原时最后一次
写回就把它永久留在 `true` 上，等于这一趟偷偷改掉了视模的预通道口径。反过来，它也**不许**
在打补丁时把 `allowOverride` 写死成 `false`：那一位归下面的前景预通道口径管。

### 第一人称在深度法线预通道里的口径（前景标签）

视模的几何带一层非等比深度压缩，它的视深不是世界视深（枪口在眼前 0.2 m、枪托在眼睛后面）。
`Script_Post.MarkForegroundPrepass` 定的口径是：

- **不透明件照常吃覆盖材质**，写**真法线**；深度写常数 `FOREGROUND_VIEW_DEPTH = 1 m`
  （覆盖材质的 `uForegroundDepth` uniform 按 draw 开关，与破口裁切同一个手法）。
  真按它自己的视深写，开镜近景 DOF（focus 1.60 m）会把正在瞄的枪整支糊掉、相机运动模糊
  按 0.2 m 的视差把枪拖成一片、SSAO 在枪身边缘挖黑边。
- **半透明/加性件（枪口焰）** 没有可用的法线，整只 `skipNormalDepth` 藏出预通道。

**别用 `MarkNoPrepass` 代替它。** 那个函数只保证"不被换材质"，物体照样被画进
`rtNormalDepth`，写进去的 xyz 是它自己的光照颜色 —— 当法线用是纯垃圾，SSAO 直接读错，
Debug Rendering 的 GBuffer 组也就成了一团噪声。蒙皮双臂同理不许再标 `skipNormalDepth`：
覆盖材质带 skinning chunk，蒙皮不会塌到原点（`Script_ActorDepthTest` 守着同一条）。

---

## 11. 材质：CanvasTexture 程序化烘四张图 + 三平面

> **现状看 §17「材质着色升级（2026-09）」。** 这一节是烘焙侧的旧稿（配方、
> 颜色空间、ORM 打包），全部仍然成立；表面着色那一层（视差、细节法线、微阴影、
> 地平线遮蔽、皮肤）2026-09 起在 §17。

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
| ultra | 16×9×16 = 2304 | 3.5 m | 56×31.5×56 m | 96 | 16 | 144 帧 ≈ 2.4 s |
| high | 14×8×14 = 1568 | 4.0 m | 56×32×56 m | 64 | 12 | 131 帧 ≈ 2.2 s |
| medium | 10×7×10 = 700 | 5.0 m | 50×35×50 m | 32 | 8 | 88 帧 ≈ 1.5 s |
| low | **不建** | | | | | |

**竖直为什么这么高**（2026-08-26 改，原来只有 4–6 层）：体积按镜头吸附，原点落在眼睛
下方 1.5 格，5 层时顶面只到地面上 8 m。滕县城墙墙身 11.5 m + 女墙 1.6 m ——
**墙的上半截整个在体积外**，腰上横着一条 confidence 淡出带 —— 城墙是这座城里最大的
一块竖直表面，那条带就是玩家报的「GI 色差」。竖直加层不改每帧成本（照旧 5 个 draw call、
取样端照旧八个角），只多花收敛时间和两张小图集的显存。

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

**体积边缘的淡出带**（`GI_FADE_CELLS` + smoothstep）：confidence 原来是「一格线性」——
4 m 的带落在掠射的地面上只有十来个像素，而且它在 0 与 1 两端都是折角，眼睛会把折角读成一条线
（马赫带）。于是体内体外只要有一点亮度差，体积边界上就是一条**跟着玩家走**的硬色差。
现在带宽 `GI_FADE_CELLS` 格、两端切线为零。它治的是「有多明显」，治不了「有没有」——
两侧本身的差额得靠 12.6 末那条同倍增益，以及把体积做够大。

外加 DDGI 那两条工程细节：法线/视线偏置（把取样点推离表面，免得自遮挡）、以及把极小权重再往下压一档（八个角里混进一个「勉强算数」的会把结果整体带偏）。**压制必须落在乘三线性之前**（RTXGI 的 crush 就在那个位置）：格子中央的三线性权重本来只有 1/8 量级，先乘再压等于把所有正常权重一起立方压扁，三线性实质失效，探针之间变成阶跃 —— 界河开阔地上「一格一格跟着人走的分层」就是这么来的。

**距离矩只收「真能挡天空的东西」**（墙、屋顶 —— 顶面离虚拟地面 ≥2.4 m 的盒子）。地面平面与矮障碍（田埂、胸墙、土坎、坟头）只算反弹、不写距离矩：地面对「探针→着色点」不可能是真遮挡（着色点全在平面之上），写进去反而让悬在平面上方几十厘米的探针把整个下半球的均值拉短，16×16 八面体的地平线纹素被污染后，开阔地八个角的权重被整片杀光；矮障碍则是 4 m 格距根本分辨不了，只会产出随体积滚动跳变的假暗斑。

图集里存的是**余弦加权的平均辐射亮度**，取样时乘 π 才是 three 的 `iblIrradiance` 量纲（`getIBLIrradiance()` 返回的就是 `PI * envColor * intensity`）。

### 12.6 与既有那三盏光的分工（不分清就是双份）

| 谁 | GI 上了之后干什么 |
|---|---|
| 平行光（太阳） | **不动**。直接光始终是解析的，探针射线里的天空刻意**扣掉太阳盘** —— 否则同一份太阳算两遍，而且 64 根射线采 0.003 大小的盘必炸方差 |
| 天空 IBL（PMREM） | 漫反射那一路被探针**替换**；镜面那一路留着，但按 GI/天空的亮度比做一次遮蔽（屋里的金属件不该照样反着一片亮天） |
| 半球光 | 退成 0.3 倍底噪（`LightRig.SetGiActive`）。它原本干的就是「天空把冷色洒到朝上的面」，而这正是探针算得**更准**的那部分（它还知道头顶有没有屋顶） |
| SSAO | **不动**。两者尺度不同：探针管米级的「这间屋子有多暗」，AO 管厘米级的「墙根接触处」。AO 依旧只乘间接光 |
| 特效光（持续火焰 + 爆炸点光） | 直接光走固定预算 `PointLight` 池；探针只收当前入选灯的**反弹**（射线命中点上算火光，漏空的射线不算）。爆炸包络很短，主要读直接光；持续火焰能把橙色反弹留在院墙与街面 |
| `envIntensity` | 继续有效 —— 它是美术为每一关定的「天有多强」，`ProbeVolume.ApplyPreset()` 把它乘进 `uGiIntensity` |

**画质面板那根「间接光强度」必须两侧同倍。** 它以前只乘探针一侧（`uGiIntensity`），
体积外回退的天空 IBL 不乘 —— 调到 ×2 就等于「体内两倍、体外一倍」，体积边界上凭空
多出一条硬色差，而且体积跟着玩家滚，那条色差就跟着人走。现在 `ApplyPreset` 另存一份
`uGiGain`，取样端的回退值 `giFallback = iblIrradiance * mix(1.0, uGiGain, uGiEnabled)`
乘同一份（跟着收敛淡入，免得进关先闪一下）。镜面遮蔽比也改成拿同倍的两侧比，
否则增益一开 `giOcclusion` 恒等于 1，屋里的金属件照样反着一片亮天。
源契约锁在 `Script_GiTest`（纯 shader 行为，截图里只看得见结果）。

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

正片**出厂默认关**（见 12.10），`?gi=1` 强开；画质面板「画质 → 全局光照（实时探针体）」里有开关与强度。

取样端还有一套假彩色（正片 `?giView=N`，或控制台 `Taierzhuang.library.gi.debugView.value = N`）：
1 = **材质最终采用的间接辐照度**×0.05（探针体内混合探针 GI，体外按正式渲染回退天空 IBL），2 = 被替换前的天空 IBL×0.05，3 = confidence，4 = 原始探针 gi/IBL 亮度比×0.25（与曝光无关，最好用），5 = 权重和×0.5，6 = BaseColor，7 = 粗糙度，8 = 金属度，9 = 太阳阴影因子。控制台还有 `library.gi.chebOff.value = 1` 可以整体旁路切比雪夫做 A/B —— 「画面上哪个通道塌了」用这套看，比拿成图做 diff 快一个数量级。原始探针值在体积外本来就是 0，不能拿它冒充最终照明，否则会把正常的体外回退误画成整片黑。

同一套假彩色也接进了编辑器的 **Debug Rendering** 浮窗（「材质」「光照」两组：BaseColor / 粗糙度 / 金属度 / 太阳阴影 / GI 辐照度 / GI 置信度）：面板负责把材质 uniform 与送屏视图同帧同步，走 hdr 靶的 0-1 直通显示（不过 Reinhard，读数是准的）。前向管线没有 GBuffer，这些通道都是「让材质把该通道当颜色重画一帧」拿到的；low 档材质没有注入，这两组画不可用斜纹。

同一个浮窗还管两样改「整幅画怎么画」的调试画法（`PostPipeline.SetShadingMode` / `AddDebugOverlay`）：**着色 / 线框 / 着色线框**三档着色模式（线框那趟是主场景之后用 `MeshBasicMaterial({ wireframe })` 覆盖材质再画一遍进 hdr 靶，`allowOverride === false` 与 `skipNormalDepth` 的对象藏掉；纯线框时 hdr 靶清成深灰、`final` 视图把它 0-1 直通送屏并停掉 TAA 抖动），以及 **Rapier 碰撞体线框**（`post.debugOverlays`：主场景之后、TAA 之前用同一张 hdr 靶与深度再画的 Object3D，按 1/曝光预补线色）。两者都不进场景图，预通道 / SSAO / 假彩色重画都看不见它们。贴面的线靠 `InjectDepthPull` 在视空间朝相机缩 0.2%–0.3% 赢深度测试（常数 NDC 偏置在 100 m 处等价于十米，不许用）。细节见 `docs/Data_EditorSuite.md` 的 Debug Rendering 一节。

### 12.9 已知的近似（都是有意的，别当 bug 修）

- **地面按平面处理**，但平面取体积脚印内的**最低**地面（`ProbeVolume.SampleGroundY`，每次滚动重采样）。曾经取体积中心一点：城内台地没事，界河这种向河槽下降近 2 m 的野外会让整层探针沉到平面之下 —— 朝下的射线打不到平面直接看见天，凹地整片被天光灌成银白，断层正好在地形跌破平面的等值线上。平面放低无光学代价（朗伯地面的出射辐射亮度与距离无关），高于平面的地形起伏仍被忽略。
- **代理体只有碰撞盒**。没有碰撞盒的东西（薄贴片、旗、烟）对 GI 不存在；反过来，碰撞盒比实际几何体胖的地方，间接光会略偏暗。
- **反照率按 `tag` 查表**（`GI_ALBEDO`），不是真材质。整座城是青砖 + 夯土 + 土路，色域很窄，这个近似的误差远小于「有没有位置感」的收益。要更准就得让 `BuildSink.Solid()` 记下材质名。
- **单级 cascade**。体积外（56 m 开外）退回天空 IBL，边缘按 `confidence` 平滑过渡。远景本来就被雾吃掉了。
- **动态物体不写进 GI**。士兵、载具不参与反弹（它们只是 GI 的接收者）。

### 12.10 2026-08-26 起：出厂默认关，间接光走 ambient 基线

**决定**：探针体 GI 各画质档出厂默认全关。默认间接光 = 天空 IBL（PMREM 漫反射 +
镜面）+ Global SH Probe + 冷灰蓝 `AmbientLight`（`LightRig`，`SetGiActive(0)` 的
那一档）—— 就是 12.6 表里「GI 上之前」的原始分工，不需要任何新代码。

**原因**：FrameProfileTest 实测（RTX 4070 SUPER，3394×1348 high，东关）
baseline 11.1 ms vs 无 GI 8.4 ms，差 ~2.7 ms，且 CPU 分项里 `gi=0.00` ——
成本全在 GPU/着色器侧。当前的瓶颈是 CPU 提交（见文末「CPU 提交量」那轮账），
先把这份 GPU/着色器钱省下来。大头不是那五个 GI pass（12.7 已证明它们在噪声以内），
是 **GI_SAMPLE_GLSL 编进全部材质**的代价：即使 `uGiEnabled` 恒 0，那 24 次
纹理取样的代码也占着采样器与寄存器压着 occupancy。

**所以「关」是编译期的**（`Script_Materials.InjectIndirectLighting` 拆成两层）：

- 采样层（GI_SAMPLE_GLSL + 图集 uniforms + `uGiEnabled` 分支）只在 GI 打开时编进材质；
  关闭档材质里**不存在**探针采样代码，`ProbeVolume` 也不构造（不建图集/靶、不跑每帧 Update）。
- 调试层（`uGiDebugView` / 视图 1-9 / 末端整帧覆盖）关闭档仍在：`?giView` 与
  Debug Rendering 面板照常可用。语义按「材质实际在用什么」走 —— 视图 1/2 显示
  天空 IBL×0.05（此时的间接光本体，两图相同），3/4/5 显示 0（黑 = 没有探针 GI，
  是准确信息），6-9（材质通道）与打开档逐字节相同。
- 开关进了 `customProgramCacheKey`（三态：无 / 只调试层 / 带采样），坑见「坑」一节 ——
  少了它两种档位会共用同一份编译缓存。

**怎么重新开**：`?gi=1` 强开（boot 即构造探针体、材质带采样代码），或画质面板
「全局光照（实时探针体）」开关 —— 运行时打开走 `ApplyGraphics`：惰性构造
`ProbeVolume` + 整场材质重编译（编译期开关翻转，同「阴影开关」先例，一次性几百毫秒）。
玩家 localStorage 里已存的 `gi:true` 继续被尊重（`ApplySavedSettings` 装回来时
走同一条 ApplyGraphics 路），改的只是出厂默认。回归口：`Script_GiTest.mjs`
（`?gi=1` 考 GI 本体；另有反向契约 —— 默认档编译出的程序不许含 `GiSampleIrradiance`），
成本追踪：`Script_FrameProfileTest.mjs` 的「GI forced on」消融。

---

## 13. 性能分档定稿（2026-09-08 实测，RTX 4070 SUPER / ANGLE-D3D11）

> 这一节 2026-09-08 整节重写。旧稿是设计期在 1600×900 上按 pass 拍的**估算表**，
> 八个子系统合流之后已经对不上号；下面全部是**实测**。
> 复现口径：`node Taierzhuang1938/Script_FrameProfileTest.mjs --quality=<档> --tiers`，
> 视口 3394×1348（4.58 MPix，用户那台机器的实际窗口）、`?shot=1&phase=2&scale=small`，
> 一次 `TIME_ELAPSED` 查询罩 **21 帧**再除以 21，取多轮的 **min**。

### 13.1 为什么批长是 21、为什么取 min、为什么 dt = 0

三条都是被噪声逼出来的，缺一条这张表就不可复现：

* **21 帧一批**：级联阴影按 `bakeOrder` 七帧一轮（high 是 `[0,1,0,2,0,1,0]`），
  最远那一级 2.24 M 三角、最近那一级只有它的零头。单帧采样于是是**七峰分布**，
  中位数在两个峰之间来回跳 —— 同一份代码两次跑实测能差 1.5 ms。21 是 7 的倍数，
  每批正好含整数轮。
* **取 min**：GPU 的工作量是确定的，外部争用只会**加**时间（docs §17.9b 立的口径）。
* **`dt = 0`**：正片是活的，AI 在走、烟在飘，两批之间 draw call 实测能差几十个
  （737 → 812）。分档要比的是「同一批 draw 在这一档里花多少」。

### 13.2 四档实测（3394×1348 输出）

| 档 | 内部分辨率 | 整帧下界 min | p25 | 中位 | 最大 | draw | 三角/帧 |
|---|---|---:|---:|---:|---:|---:|---:|
| low | 2885×1146（0.85） | **11.31** | 12.48 | 13.97 | 15.95 | 772 | 7.16 M |
| medium | 2546×1011（0.75） | **11.47** | 13.18 | 14.78 | 26.63 | 782 | 7.34 M |
| high | 2715×1078（0.80） | **11.48** | 13.47 | 15.05 | 19.43 | 786 | 7.33 M |
| high + 探针体 GI | 2715×1078 | 12.81 | 13.06 | 14.21 | 22.52 | 791 | 7.33 M |
| ultra | 3394×1348（1.00） | **17.27** | 18.45 | 18.74 | 30.03 | 804 | 7.41 M |
| **大修前基线** `27f6ace0f` | 3394×1348（1.00） | **13.85** | 14.67 | 15.41 | 16.89 | 837 | 7.90 M |

**这张表最重要的一条读法：low / medium / high 的下界压在同一个 ~11.4 ms 上。**
三档的像素数差 47%、功能差一整套（low 没有 AO / SSR / 体积雾 / 接触阴影 / 簇光 /
POM / TAA），整帧却分不出来 —— 说明在这台机器上**这一帧不是像素受限的**。
同一行里 `submit`（主线程把一帧交给驱动）是 11.7–15.9 ms，与整帧下界同量级：
**帧被 CPU 提交挡住**（约 790 次 draw、七百多次状态切换），GPU 在一帧之内是有空转的，
而 `TIME_ELAPSED` 罩住的是那一段墙钟，所以它量到的其实是
`max(GPU 工作量, CPU 提交)`。ultra 是唯一真正压过这条线的一档（17.3 ms，GPU 受限）。

**推论（后续要省时间的人先读这一条）**：`renderScale` / AO 切片 / SSR 步数 /
体积雾网格这些**像素旋钮，在这台机器的这一关上买不到时间**。真正的下一笔在
draw call 与状态切换（布设实例化、预通道的合批、第一人称自阴影那一趟的独立 render）。

### 13.3 逐 pass（同一批数据的分段计时，各取 min）

| GPU 段 | low | medium | high | ultra | 大修前基线 |
|---|---:|---:|---:|---:|---:|
| main | 5.82 | 5.60 | 6.32 | 9.71 | 5.92 |
| prepass | 3.29 | 2.73 | 2.91 | 2.21 | 3.20 |
| shadow（级联烘焙） | 1.49 | 1.41 | **1.28** | 0.50 | **2.59** |
| firstPersonShadow | 0.96 | 0.76 | 0.71 | — | 0.95 |
| gtao（旧 ssao） | — | 0.17 | 0.36 | 2.86 | 0.50 |
| taa | — | 0.28 | 0.28 | 0.31 | 0.61 |
| composite | 0.15 | 0.17 | 0.18 | — | 0.39 |
| contactShadows | — | — | 0.14 | 0.30 | — |
| ssr / 体积雾三趟 / 曝光 / 光晕 | — | ≈0.35 | ≈0.45 | ≈1.6 | — |
| **逐段合计** | 13.0 | 14.4 | 14.4 | 22.6 | 14.2 |

（逐段合计比整帧下界大：每段一个 `TIME_ELAPSED` 查询会在 ANGLE 上插一次刷新，
二十来段的插桩本身就有开销。这张表用来**排序**，不用来加总。）

两条值得记的账：

1. **级联阴影比重构前那张单图便宜一半**（1.28 vs 2.59）。三级 2048² 听起来更贵，
   但「一帧只烘一张」（§1S.8）把峰值摊平了，而旧版是每帧重烘一张 4096²。
2. **GTAO 比旧 SSAO 便宜**（0.36 vs 0.50），还多产出弯曲法线与 SSIL 位掩码 ——
   `aoScale` 从 0.75 降到 0.5 那一步买回来的（Data_Tuning_Graphics 的注释里有账）。

**整帧结论：八个子系统合流之后，high 档的整帧墙钟与大修前基线持平（11.5 vs 13.9），
而画面多了 CSM+PCSS+接触阴影、GTAO+SSIL、froxel 体积雾、物理大气、Hi-Z SSR、
直方图曝光+光晕+LUT、TAAU+运动模糊+DoF、POM/细节法线/微阴影/SSS、簇状多光源。**

### 13.4 这一轮改过的旋钮

| 旋钮 | 前 | 后 | 理由 |
|---|---|---|---|
| `SHADOW_PRESETS.high.blockerTaps` | 8 | 6 | 每像素阴影取样 20 → 15。半影形状由 blocker **搜索半径**定，取样数只定盘内噪声，而噪声归 TAA |
| `SHADOW_PRESETS.high.filterTaps` | 12 | 9 | 同上 |
| `SHADOW_PRESETS.medium.filterTaps` | 10 | 8 | 固定盘 PCF，盘半径不变、盘内少两点；1024 图上肉眼分辨不出 |
| `QUALITY_PRESETS.low.renderScale` | 1.0 | 0.85 | low 没有 TAAU，1.0 意味着它在比 high（0.8）**更多**的像素上跑主场景。0.85 是 §13.5 为低配档写死的那个数 |
| `QUALITY_PRESETS.medium.renderScale` | 0.75 | 0.75（试过 0.70 后**保持**） | 见 13.2 的推论：像素旋钮在这台机器上买不到时间，只买到更软的画面 |

**没有为了达标关任何功能。** 四档的功能位（AO / SSR / 体积雾 / 簇光 / POM / 接触阴影 /
曝光 / 光晕 / LUT / TAAU）与合流时一字未改。

### 13.5 自动降档（2026-09-08 实装）

规则层 `Script_AutoQuality.mjs`（纯 Node 可单测，零 three 依赖），
数值在 `Data_Tuning_Graphics.AUTO_QUALITY`，回归口 `Script_AutoQualityTest.mjs`。

* 滑动窗口 90 帧的 `performance.now()` 间隔中位数；>250 ms 的帧（切后台 / 加载）
  不进窗口**也不清计时器** —— 清了的话每次加载都会把刚攒够的 8 秒升档条件抹掉。
* 中位数 **> 20 ms 持续 2 s** 降一级；**< 13 ms 持续 8 s** 升一级；
  两条门槛之间是**死区**，两个计时器都清零（这是不来回抖的第一道保险）。
* **每次降级之后锁 30 s**，期间既不降也不升（第二道保险）。升级不上锁 ——
  升错了两秒之后就能降回来，比「升上去锁半分钟」安全。
* 阶梯只动**运行时旋钮**，不整档切换：换档要重编译全场材质
  （POM / SSIL / 簇光都是编译期开关），在已经掉帧的时候再送一次几百毫秒的编译只会更糟。

| 级 | 内部分辨率倍率 | SSR | 接触阴影 |
|---|---:|---|---|
| 0（出厂） | ×1.00 | ✓ | ✓ |
| 1 | ×0.92 | ✓ | ✓ |
| 2 | ×0.85 | ✓ | ✓ |
| 3 | ×0.78 | ✗ | ✓ |
| 4 | ×0.70 | ✗ | ✗ |

倍率是**乘在**玩家/档位的 `renderScale` 上的，不覆盖它：面板那根滑杆仍然是玩家拉的那个数，
「恢复出厂」也不必知道阶梯当前在第几级。乘完不许低于 `AUTO_QUALITY.floor`（0.50），
也不许把玩家自己调低的那个数抬上去。

出厂开；画质面板「分辨率与阴影」组第一行可关，关掉时立刻收回第 0 级。
只在**玩法帧**上喂数据（`state.running && !state.menu && !state.warming`）——
菜单/加载/暂停帧要么便宜得离谱要么长得离谱，混进窗口只会让阶梯在进出菜单时来回跳；
`StepFrames`（出图 / 测试 / 过场手动步进）一律不喂。

### 13.6 开机就绪耗时（2026-09-08 实测）

口径见 §16.0（每轮起全新浏览器；冷缓存加
`--disable-gpu-shader-disk-cache --disable-gpu-program-cache --disk-cache-size=1`），
跑 `?shot=1&phase=2&quality=high`，从 `page.goto` 到 `window.Taierzhuang` 就绪：

| | 中位数（3 次） | 三次 |
|---|---:|---|
| 冷缓存 | **29.6 s** | 27.8 / 30.1 / 29.6 |
| 热缓存 | **14.2 s** | 13.9 / 15.6 / 14.2 |

`Script_ShotTest` 的开机闸据此从 300 s 调到 **120 s**（4× 冷缓存实测）（≥ 2× 冷缓存实测）。

### 13.7 显存

`rtHdr(16F)` + 预通道 MRT×2 + 深度 + TAA 历史 ×2（输出分辨率）+ bloom 链 +
GTAO ×3 + SSR 的 min-Hi-Z 与颜色金字塔 + 体积雾图集（high 7.4 MB）+ 大气四张 LUT。
`renderer.info.memory` 实测：geometries 485 / textures 379（high）、
463 / 336（low）、506 / 375（ultra）。

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

## 17. 屏幕空间反射（2026-09）

> 模块 `Script_PostSsr.mjs` / 材质补丁 `Script_MaterialPatches.MakeSsrPatch` /
> 档位 `Data_Tuning_Graphics.SSR` + `QUALITY_PRESETS[*].ssr*` /
> 回归口 `Script_SsrTest.mjs`。落地之前镜面间接光全部来自天空 PMREM：
> 钢盔、刺刀、湿地和屋里的金属件反的都是同一片均匀的天。

### 17.1 帧图里的位置与那一帧延迟

```
prepass → hzb → **ssr** → ssao → main → … → taa → **ssrColor** → bloom → …
```

* `ssr` 排在 `main` **之前**，因为它的结果是被主场景那一趟的**材质**采样的。
* 排在 `prepass`/`hzb` **之后**，所以法线、线性视深、HZB、速度**全是本帧的** ——
  **追踪没有延迟**，只有「命中点那里是什么颜色」取的是上一帧。本帧的颜色还没
  画出来（画它正需要 SSR），这是前向管线里绕不过去的循环，UE 的 SSR 同样取
  上一帧场景色。补偿三条：
  1. 命中点按**速度缓冲重投影**到上一帧的 uv 再取色，动的东西也对得上；
  2. 取的是 **TAA 解算之后**（`ssrColor` 排在 `taa` 后面）的那一张，已经时域
     降噪、已卸抖动，比主靶原图干净；
  3. 镜头硬切（`NotifyCameraCut` → `ctx.hasPrev === false`）当帧清历史，
     否则镜面上会挂一帧上一场戏的倒影。

### 17.2 粗糙度从哪来：主 HDR 靶的 alpha 通道

这是前向管线，**没有 GBuffer**；预通道 RT0 的四个通道（xyz 视空间法线 + w
线性视深）也满了。但**主 HDR 靶的 alpha 全链路无人读** —— 逐个查过：
Composite 只取 `.r/.g/.b` 与 `.rgb`，Bloom 全是 `.rgb`，TAA 写死 `alpha = 1`，
调试视图也只看 rgb。所以 SSR 补丁在 `<dithering_fragment>` 处写一行

```glsl
if (diffuseColor.a >= 0.999) gl_FragColor.a = clamp(material.roughness, 0.0, 1.0);
```

alpha 就成了这条管线里唯一一张免费的粗糙度 GBuffer。SSR 在 `main` 之前跑，
此时 `targets.hdr` 里躺的正是**上一帧**画完的内容 —— 与颜色同一份延迟，同样
按速度缓冲重投影读。

四条要记住的后果：

* **没挂补丁的东西 alpha 是 1**（清屏值 1，或它们自己写的不透明度）→ 读出
  roughness = 1 > 上限 → **自动没有 SSR**。天空穹、粒子、烟、第一人称、
  外部未接入的材质全在这一档。这个失败方向是安全的：宁可漏，不可在天上反出东西。
* **半透明材质不挂这条补丁**（`Script_Materials` 按 `material.transparent` 分流，
  补丁自己再兜一道 `diffuseColor.a >= 0.999`）。往 alpha 里写粗糙度会直接改
  混合结果。所有混合模式都只把 dstAlpha 往 1 推（Normal 是
  `srcA + dstA(1-srcA)`，Additive 是 `srcA + dstA`），所以半透明盖过去的地方
  只会「关掉 SSR」，不会假装光滑。
* **第一人称的手与枪**在预通道里写的是常数近景标签 `FOREGROUND_VIEW_DEPTH`，
  不是真视深；拿它反投影会得到一个不存在的世界位置。追踪端按
  `abs(depth - uSsrForegroundDepth) < 1e-3` 排除，误伤只是「正好在 1 m ± 1 mm
  的世界几何没有 SSR」。
* **第一帧没有上一帧**：`uHasRoughness` / `uSsrHasColor` 为 0 时整趟输出 0。

### 17.3 为什么 SSR 不用共享 HZB，而自己再建一条

`ctx.hzb` 是 **max-reduce**（每级取 2×2 的最远视深，天空记 `camera.far`）——
遮挡剔除的语义。Hi-Z 追踪要的是反过来的东西：**一格里最近的那个面**。
只有「射线当前深度 < 格内最近面」才能安全地整格跳过；拿 max 去判会漏掉格子里
所有比最远面近的几何，反射直接穿墙。

所以 `SsrPass` 自己建一条 **min-reduce** 链（六级，半分辨率起步，
1440p 下约 3 MB，实测 0.05 ms 摊在 `ssr` 段里）。**合并方案**：共享 HZB 是
RGBA16F 且四通道同值，把 min 塞进 `.g` 是零显存零带宽的事 —— 那一步归预通道
的所有者做，做完本模块删掉自己这条链、改成读 `.g` 即可。

采样端有一条 WebGL2 的硬约束：**GLSL ES 3.00 不许用变量下标取 sampler 数组**
（只允许常量表达式；动态一致下标要 ES 3.10）。所以六级是六个 `sampler2D` +
一段 if 梯（`SsrHizMin`），不是一个数组、也不是一张纹理的多个 mip
（往同一张纹理的另一级写、同时采它是 feedback loop，WebGL2 直接
`INVALID_OPERATION`）。级数不足时多余的槽绑成最后一级 —— 采样器必须都绑到
有效纹理，否则某些驱动上整趟静默不画。

**上一帧场景色**那条链没有这个问题：它是**一张**带真 mip 的 RT，
`generateMipmaps = true` + `LinearMipmapLinearFilter`，three 在每次 blit 末尾
（`renderer.render` → `updateRenderTargetMipmap`）自动生成整条链，采样用
`textureLod(uSsrColor, uv, lod)`，lod 可以是变量。

### 17.4 四步链

| 步 | 做什么 | 输出 |
|---|---|---|
| min-Hi-Z | RT0.w 的 2×2 min-reduce ×6 级 | 六张 RGBA16F（四通道同值） |
| trace | 每像素按 GGX VNDF 采一条随机反射线，Hi-Z 跳格 + 二分细化 | RGBA16F：rg = 命中 uv，b = pdf，a = 置信度 |
| resolve | 邻域 4/8 抽样按 BRDF/pdf 的 ratio estimator 互相重用射线 | RGBA16F：rgb = 镜面辐亮度，a = 置信度 |
| temporal | 速度重投影 + YCoCg 方差裁剪 + 与历史混合 | RGBA16F = `targets.ssr`，材质采的就是它 |

**追踪**（`SsrTraceGlsl`，步数与细化步数是编译期常量，按档位生成一份）：

* 屏幕空间里 `1/视深` 是仿射的，所以整条射线可以用一个标量参数 `s` 表达，
  `uv(s) = mix(uv0, uv1, s)`、`depth(s) = 1 / mix(invZ0, invZ1, s)`。
  对透视相机这是**精确的**，不是近似。
* 每步读当前级的格内最近面 `cellMin`：
  * `rayZ < cellMin` → 射线在这一格所有面前面 → 取「追上 cellMin 的参数」与
    「离开本格的参数」中较小的那个；前者到得了就**下沉一级**细化，到不了就
    **上浮一级**跳更大的格；
  * 否则 → 已经到达/穿过格内最近面 → 到第 0 级就是命中，否则**下沉一级**（`s` 不动，
    层数单调降，必然终止）。
* 命中之后 4 步二分细化到亚纹素，再过两道判据：命中天空（`sceneZ >= far*0.999`）
  不算；`hitRayZ - sceneZ > thickness + thicknessSlope * sceneZ` 算「从物体背后
  穿过去了」，也不算。厚度随视深放宽，因为远处一个像素本来就覆盖几十厘米。
* 起步推开一个纹素**再加抖动**：不推的话第 0 步落在自己那一格，深度比较必然
  判「已经在面后面」，全屏立刻自命中；不抖的话 Hi-Z 的格状台阶会显成同心带。
* 置信度三项相乘：屏幕边缘淡出、射线朝相机走的淡出（那部分信息在相机后面，
  屏幕空间根本没有）、命中面背朝射线的淡出（打在薄片背面）。

**采样与解算**（Stachowiak 2015）：VNDF（Heitz 2018）比经典 NDF 采样不产生
朝向背面的半程向量，低样本数下方差小得多。邻域重用的权重是

```
w_i = D_c(H_i) · G2_c(NoV, NoL_i) / (4·NoV) / pdf_i
```

即「**本**像素的 BRDF 除以**邻居**的 pdf」—— 一条随机线也能干净就靠它。
菲涅尔 F **不进权重**：三方的 `RE_IndirectSpecular_Physical` 会在材质里乘，
这里再乘一次就是双份。邻域盘每帧转一个角，不转会在光滑面上留下十字状结构噪声。

**采色的 mip** 按锥角选：锥半径 ≈ `coneScale × alpha(= roughness²) × 行程`，
换算成金字塔像素数再取 log2。**用 alpha 不用 roughness**：写成 roughness 会把
粗糙度 0.1 的地板按十倍的锥角去糊，一块近乎镜面的湿地会采到 1/8 分辨率的
场景色，倒影糊成一团而且轮廓在低分辨率 mip 上逐帧抖。

**时域**与 TAA 同一套手法但**独立的历史**（SSR 关着 TAA 时也要收敛，而且它的
噪声来源是随机方向，不是子像素抖动）：3×3 一阶/二阶矩算 `均值 ± σ` 盒（比
min/max 盒紧，遮挡变化时鬼影少得多），历史裁进盒里再按速度权重混合。

> **踩过的**：YCoCg 里混完必须**先转回 RGB 再卸 Karis 权重**。漏掉中间那一步
> （直接把 YCoCg 送进 `TonemapUnweight`）不报任何错，但 `Luma(YCoCg)` 是一串
> 没有意义的数，除数一旦逼近 0 结果就炸到上千 —— 表现是「反射一片惨白而且
> 每帧乱跳」。回归口：`Script_SsrTest` 的「静止逐帧差」那一条。

### 17.5 材质侧：只换 `radiance`

```glsl
// <lights_fragment_maps> 之后
if (uSsrStrength > 0.0 && material.roughness <= uSsrMaxRoughness) {
  vec4 ssrTexel = texture2D(uSsrMap, gl_FragCoord.xy / uSsrResolution);
  float ssrFade = 1.0 - smoothstep(uSsrFadeAt, uSsrMaxRoughness, material.roughness);
  radiance = mix(radiance, ssrTexel.rgb, clamp(ssrTexel.a * uSsrStrength * ssrFade, 0.0, 1.0));
}
```

* **换不是加**：加就是天空反射与屏幕空间反射双份。
* 补丁顺序固定在 **GI 之后、破口之前**。GI 会按「探针亮度 / 天空亮度」的比值压
  `radiance`（屋里的金属件不该反一片亮天）；SSR 拿到的是真实屏幕空间的光，
  不该再吃那一层近似遮蔽，所以它排在后面直接覆盖。
* 镜面遮蔽那一行（`<aomap_fragment>` 里的 `indirectSpecular *= pow(ssao, …)`）
  仍归 AO/GTAO，SSR 的贡献照样吃它 —— 那是「间接镜面被小尺度几何挡住多少」，
  与反射来源无关。
* `uSsrResolution` 是**主渲染靶**尺寸而不是 SSR 靶尺寸（SSR 靶是半分辨率的，
  靠双线性放大）。**不共用 SSAO 那份 `uScreenResolution`**：探针页喂给
  `uSsaoResolution` 的是 AO 靶尺寸，共用会连坐。

### 17.6 水面

水面**不能**走 SSR 靶：它 `transparent + depthWrite=false`，而且整只
`skipNormalDepth` 藏出了预通道，所以它那一像素在 RT0 里存的是**河床**的法线
与深度 —— SSR 靶在水面位置算的是河床的反射。

让水面写进预通道也不行：`Script_Water` 的浅水吸收与岸线泡沫正是靠
`BehindSurfaceDepth`「读自己身后那个面的深度」工作的，把水面自己写进去，
那套立刻退化成全河 0 深度（而且 MRT 之后它还得改成两输出材质）。

所以水面走 `SsrSurfaceBlockGlsl`：**自己按平面反射假设追同一条 Hi-Z**，
用它自己的波浪法线（含 Gerstner 与细节法线）当反射面，按置信度与解析天空反射
混合。接线点是 `Script_Water.SetWaterSsr(post.ssrPass.trace)`，**必须在任何水面
材质建出来之前调**（材质按 preset+flow 缓存，建完就定型）；传 null 时那份
着色器只多两条没人用的 uniform 声明，光照与合成**一个算式没改**。水面按 32 步追踪 —— 一条护城河宽十米，
反射线斜着打到对岸城墙足够了，而水面是半透明大面，步数直接乘在填充率上。

### 17.7 分档与面板

| 档 | ssr | 追踪分辨率 | Hi-Z 步数 | 解算抽样 |
|---|---|---|---|---|
| low | 关（连靶都不建，材质不编补丁） | — | — | — |
| medium | 开 | 1/2 | 32 | 0（只走时域） |
| high | 开 | 1/2 | 48 | 4 |
| ultra | 开 | 1/1 | 64 | 8 |

与档位无关的常数在 `Data_Tuning_Graphics.SSR`（粗糙度上限 0.60、淡出起点 0.45、
厚度 0.32 m + 0.020/m、细化 4 步、六级 min-Hi-Z、四级场景色、锥角系数 2.0、
边缘淡出 0.12 uv、法线偏置 0.02 m、时域权重 0.08→0.50、方差 σ 1.25）。

画质面板：「屏幕空间反射 SSR」一节，布尔总闸 + 强度倍率。**运行时开关不重编译
材质** —— 强度归零时材质那一行等价于「radiance 原样」，成本只剩一次纹理取样。
（GI 那种编译期开关是因为探针采样层占着一堆采样器与寄存器，SSR 的补丁没有那个
体量。）low 档面板会标「本档不可用」。

Debug Rendering「反射」组三张图：**SSR 辐亮度**（HDR 映射）、**SSR 置信度**
（深蓝 0 → 暖黄 1）、**SSR 命中距离**（绿 = 近、品红 = 30 m 以上、深灰 = 未命中）。
三张都走 `DebugPass.RenderView` 新开的「自带材质」通道（视图自己给一份全屏材质
和一个 `Prepare` 钩子），不去改那份按 `uMode` 分档的通用可视化着色器。

### 17.8 成本（RTX 4070 SUPER / ANGLE-D3D11，3394×1348 / high / phase=2）

口径：SSR 开/关**交替** 5 轮（`_shots/SsrPerf.mjs`，一次性脚本不进仓库），每轮
用运行时剖析器跑 60 帧、逐 pass GPU 分段取中位数，再对 5 轮取中位数。
**必须交替** —— 单向先后测会把场景漂移（AI、烟、火光）整个算成特性开销。

| GPU 分段 | SSR 开 | SSR 关 | Δ |
|---|---:|---:|---:|
| hzb（共享） | 0.084 | 0.069 | +0.015 |
| **ssr**（min-Hi-Z + 追踪 + 解算 + 时域） | **0.525** | — | **+0.525** |
| ssao | 0.579 | 0.713 | −0.134 |
| main | 11.320 | 11.646 | −0.326 |
| taa | 0.634 | 0.711 | −0.077 |
| **ssrColor**（上一帧场景色 + mip） | **0.077** | — | **+0.077** |
| bloom / composite / fxaa | 0.090 / 0.279 / 0.080 | 0.132 / 0.295 / 0.080 | −0.042 / −0.016 / 0.000 |
| prepass / shadow / firstPersonShadow | 6.444 / 5.165 / 2.328 | 7.070 / 5.390 / 2.031 | −0.626 / −0.225 / +0.297 |
| gpuTotal | 28.706 | 28.498 | +0.208 |

**可归因的新增成本 = 0.525 + 0.077 ≈ 0.60 ms/帧**（预算 1.2 ms，逐轮区间
`ssr` 0.26–0.71 ms）。其余每一段的 Δ 都是负的或零 —— 那是场景漂移（AI、烟、
火光）的本底噪声，不是 SSR 省了别人的时间；`gpuTotal` 的 +0.21 ms 同样落在
±3 ms 的本底里，所以**整帧口径量不出 0.6 ms**，只有逐段能量。这正是「交替
A/B + 逐段计时」的理由。

材质补丁那一行（一次 `texture2D` + 一次 `mix`）落在 `main` 段里，被同一份噪声
盖住，量不出来 —— 它是每个不透明片元一次半分辨率取样，量级本来就在 0.05 ms 以下。

draw call：905 → 899（+6，逐轮区间 +6…+11）= 六次 min-Hi-Z blit + 追踪 + 解算 +
时域 + 场景色各一次。**没有增加 `renderer.render(scene, camera)` 的次数**
（全是全屏四边形），CPU 提交侧不受影响。

显存（1440p，high）：min-Hi-Z 六级约 3 MB + 命中/解算/两张历史各 1697×674×8 B
约 4×9.2 MB + 场景色金字塔约 12 MB ≈ **52 MB**。ultra 全分辨率追踪时约 4 倍。

### 17.9 已知的近似（都是有意的，别当 bug 修）

* **颜色是上一帧的**（见 17.1）。快速横移时反射里的物体会比正片落后一帧；
  速度重投影把大部分补回来，剩下的靠方差裁剪压掉。
* **粗糙度是上一帧的**（见 17.2）。运动中的物体轮廓上会有一像素宽的粗糙度错位，
  表现是轮廓外一圈偶尔多/少一点反射；置信度与方差裁剪把它压在一帧之内。
* **半分辨率上采样**（medium/high）：材质那一趟按 `gl_FragCoord / 主靶尺寸`
  双线性采半分辨率靶，深度边界上会有半像素级的渗色。置信度在边缘本来就淡出，
  所以渗过去的量也跟着淡。ultra 全分辨率追踪没有这一条。
* **屏幕外的信息没有**。命中点越靠屏幕边、射线越朝相机走，置信度越低，
  最终回退到天空 PMREM。这是屏幕空间方法的定义域，不是 bug。
* **只替换镜面间接光**。漫反射间接光仍归探针体 GI / 天空 IBL；SSR 不产出
  漫反射弹跳（那是 SSIL 那一轮的活）。
* **`InstancedMesh` 与远景人群在速度靶里是静止的**（预通道的已知近似），
  所以它们在反射里的重投影只有相机速度那一份。

### 17.10 怎么看出它在起作用（视觉验收）

数值全绿不等于画面对。看图的规矩是**同机位开/关两张对照**，再对两张做逐块差
（8×8 分块的平均通道差），因为「反射有没有变强」肉眼在雾天场景里很不敏感。
2026-09 落地那一轮的读数（1600×900，high，`_shots/Ssr_<日期>/`，已 gitignore）：

| 对照 | 整图平均通道差 | 最强块 | 差在哪 |
|---|---:|---:|---|
| 探针页材质球阵 + 湿地板（roughness 0.14 / metal 0.85） | 8.08 | 64.0 | 全部集中在地板那三行；球体与天空那几行是 0.3–0.5 的本底 |
| 东濠 `Wall_MoatEast`（走水面那条自追踪） | 2.03 | 10.5 | 只有水面那几块（第 2–5 行右半），岸上与天空是 1.0 的本底 |
| 东门外 `Gate_EastOuter` | 1.22 | 2.0 | 门洞湿地与石阶那几块微弱变化，其余本底 |
| 十字街口（全是干燥粗糙面） | 0.81 | 1.15 | **哪儿都没变** —— 粗糙度全部超上限，这是正确的负对照 |

三条一起看才算过：光滑面上有明显变化、水面上有变化、粗糙面上没有变化。
只看前两条会漏掉「粗糙度上限失灵、整城都在反射」这种坏法；只看第三条则什么
都证明不了。本底 ~1.0 是 TAA 与场景动画的跨轮噪声（见 §1.12 末尾那段账）。

> 水面那一条还顺手抓到过一个真 bug：`uSsrWaterStrength` 是建材质时定死的常数，
> 所以画质面板关掉 SSR 之后水面**照样在追踪**，只是 Hi-Z 与场景色停在上一次
> 跑过的那一帧 —— 水里留着一片几十帧前的倒影。现在 `SsrPass.Prepare` 在不跑
> 的那一帧把 `uSsrHasColor` 置 0，自己追踪的消费方统一从那道闸断供。
> 回归口：`Script_SsrTest` 的「关掉 SSR：材质强度归零、水面那条追踪也断供」。

---

## 坑

- 【本仓库现役 bug】`renderer.shadowMap.type = THREE.PCFSoftShadowMap` 在 r185 = 硬阴影。源码 `shadowMapTypeDefines` 只有 `PCFShadowMap→SHADOWMAP_TYPE_PCF` 和 `VSMShadowMap→SHADOWMAP_TYPE_VSM` 两个 key，`PCFSoftShadowMap`(=2) 落到 `|| 'SHADOWMAP_TYPE_BASIC'`；且 `WebGLShadowMap` 只在 `type === PCFShadowMap` 时设 `compareFunction = LessEqualCompare` + `LinearFilter`，否则是 `NearestFilter` + 无比较。`Script_Probe.mjs:26` 正踩这条 —— 改成 `THREE.PCFShadowMap` 即可拿到硬件 PCF + Vogel 5 抽样。
- 渲进 WebGLRenderTarget 时 three **不做 sRGB 编码**：`WebGLPrograms` 里 `outputColorSpace = (currentRenderTarget === null) ? renderer.outputColorSpace : ColorManagement.workingColorSpace`（module 7585）。所以 `renderer.outputColorSpace = SRGBColorSpace` 对所有中间 RT 无效，只在最后写画布那一 pass 生效 —— 而自定义 ShaderMaterial 如果没写 `#include <colorspace_fragment>` 就连那次也不转。结论：最后一 pass 必须**手写 sRGB 编码**，且所有中间 RT 的 `texture.colorSpace` 一律设 `NoColorSpace`。
- 渲进 RT 时 three 也**不做 tonemap**：`toneMapping` 参数同样被 `currentRenderTarget === null` 门住（module 7549）。留着 `renderer.toneMapping = ACESFilmicToneMapping` 不会报错、当前也不生效，但哪天有一 pass 直渲画布就会 tonemap 两次，画面突然发灰。统一设 `NoToneMapping`，tonemap 全收进 Composite。
- `CanvasTexture` / `Texture` 的默认 `colorSpace` 是 `NoColorSpace`（core 7266）。忘记给 albedo 设 `SRGBColorSpace` → 整个画面发白发灰、对比度上不去；反过来给 normal/ORM/LUT 设了 `SRGBColorSpace` → 法线方向错乱、粗糙度全跑偏。规则：只有 albedo/emissive 是 sRGB，其余全是数据。
- Bloom 必须在 tonemap **之前**。放到 ACES 之后，超亮部早被压到 1.0，阈值提取不出任何东西，只能靠把阈值降到 0.6 来“伪造”泛光，结果整屏发奶白。同理 SSAO 必须在材质里注入间接光，不能在 Composite 里乘最终颜色。
- `Scene.overrideMaterial` 在 r165+ 加了 `material.allowOverride === true` 闸门（module 18102），默认 true —— 意味着 **Sprite / Points / 粒子也会被 override**，几何属性对不上，预通道里蹦出糊在原点的方块，SSAO 直接乱掉。给所有贴片/粒子材质设 `allowOverride = false`，或用 `Layers` 隔离。
- 预通道覆盖材质忘记 `#include <batching_pars_vertex>` / `<skinning_*>` / `<morph*>` → `InstancedMesh` 的瓦砾全部塌回原点、骨骼角色变成 T-pose 剪影，SSAO 和运动模糊跟着一起废。用 three 的 chunk 拼顶点着色器，别自己写 `projectionMatrix * modelViewMatrix * position`。
- 【2026-09 实测】**MRT 打开之后，任何「一输出」的材质都不能再进那一趟**。WebGL2 里「有一个 enabled 的 draw buffer 却没有对应的片元着色器输出」是 `INVALID_OPERATION`，驱动把那次 draw 整个丢掉 —— 画面上表现为「某些东西突然不写深度了」，而 `renderer.info` 一切正常。对照实验（RTX 4070 SUPER / ANGLE-D3D11）：单靶+一输出 → 0；MRT(2)+一输出 → 1282（RG16F 与 RGBA16F 都一样）；MRT(2)+两输出 → 0。所以 `allowOverride === false` 的对象（天空穹 / 水面 / 粒子 / 烟 / 编辑器线框）现在由 `PrepassPass._CollectSkipped` 整只藏出预通道。回归口：`Script_PostFrameGraphTest` 的「外来一输出材质被藏出 MRT 预通道且不刷 GL 错误」。
- 【2026-09 实测】整帧只在一处读相机矩阵（`FrameContext.Begin`）的话，**必须先自己调一次 `camera.updateMatrixWorld()`** —— 三方是在 `renderer.render()` 里做这件事的。不先更新，`invView` / `viewProjection` 会整体落后一帧：速度缓冲恒为 0、运动模糊少一帧、雾按上一帧的相机位置算，而画面看上去「差不多对」。回归口：`Script_PostFrameGraphTest` 的「相机右移时街面像素速度 x 为负」。
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
- 【2026-09 实测】**GLSL 注释里写一个反引号，整个模块当场 SyntaxError**。本仓的
  着色器全部是 JS 模板字符串（`const FRAG_X = /* glsl */` 开头那种），注释里为了
  引用一个函数名顺手打了一对反引号，模板就在那里被截断，后面的 GLSL 变成 JS 代码 ——
  表现是**页面白屏、控制台一行 SyntaxError**，而那一行指的是注释里的标识符，
  看着完全不像渲染的事。已发生：`Script_PostComposite` 的 ApplyFog 段注释里引用了
  AerialPerspectiveUv，Script_BootTest 在第 5、6 关抓到（前四关是改文件之前加载的，
  所以还绿着 —— 这种"绿一半"最容易被当成偶发）。
  规矩：GLSL 注释里引用标识符**不加反引号**；改完着色器文件先跑一次
  `node --check <文件>`（毫秒级，它就是干这个的）。
- 颗粒/抖动用 `Math.random()` 会让逐轮截图对比失效（画面自己在抖，判断不了“这一版比上一版好”）。全部用 `frameIndex` 驱动的确定性噪声（interleavedGradientNoise + 黄金比推进），视觉审查 agent 才能打分。
- god rays / 体积 raymarch 不抖动起点 → 明显的同心环带（banding）。抖动了但不随帧变 → 静态噪点固定在屏幕上，看起来像脏镜头。两者都要：`Ign(gl_FragCoord.xy + frame * k)`。
- 【2026-09 实测】**GLSL ES 3.00 不许用变量下标取 sampler 数组** —— 只允许常量整型表达式（动态一致下标要 ES 3.10/GLSL 4.00，WebGL2 没有）。Hi-Z 追踪要按当前层级取金字塔，这条直接把「一个 `uniform sampler2D u[8]` 加个变量下标」的写法否掉了。三条出路：①摊成 if 梯（SSR 的 min-Hi-Z 就是六个 sampler + `SsrHizMin` 的 if 梯）；②做成**一张**带真 mip 的纹理用 `textureLod(tex, uv, lod)`（lod 可以是变量 —— SSR 的「上一帧场景色」金字塔就是这么做的，`generateMipmaps = true` + mipmap minFilter，three 在 `renderer.render` 末尾自动 `updateRenderTargetMipmap`）；③打进一张图集自己算偏移。**别想着「往同一张纹理的 level i 写、同时采它的 level i-1」** —— 那是 feedback loop，WebGL2 直接 `INVALID_OPERATION`，整趟不画。
- 【2026-09 实测】SSR 的 Hi-Z 追踪要的是 **min-reduce**（一格里最近的面），共享 HZB（`ctx.hzb`）是 **max-reduce**（一格里最远的面，遮挡剔除语义）。拿 max 去做「射线在整格前面就跳过」的判据，会漏掉格子里所有比最远面近的几何 —— 症状是反射穿墙，而且只在有前后层次的地方穿，极容易被当成「厚度参数没调好」。`Script_PostSsr` 因此自建一条 min 链；合并方案见 `Data_Tuning_Graphics.SSR` 的注释。
- 【2026-09 实测】YCoCg 邻域裁剪那一套的三步（`RgbToYcocg(TonemapWeight(c))` → 混合 → `TonemapUnweight(YcocgToRgb(x))`）**漏掉中间的 `YcocgToRgb` 不报任何错**，但 `TonemapUnweight` 里的 `1 - Luma(c)` 拿到的是一串没有意义的数，除数逼近 0 时结果炸到上千。表现是「反射/画面一片惨白而且每帧乱跳」，看着像 HDR 曝光坏了。SSR 落地时踩过一次，回归口是 `Script_SsrTest` 的「静止逐帧差」。
- 【2026-09】屏幕空间反射的锥角要按 **alpha = roughness²**（GGX 波瓣半角）算，不是按 roughness。写成 roughness 会把粗糙度 0.1 的地板按十倍锥角去糊 —— 一块近乎镜面的湿地采到 1/8 分辨率的场景色，倒影糊成一团、轮廓还在低分辨率 mip 上逐帧抖。三方 BRDF 里进 GGX 的同样是 `roughness²`。
- 【2026-09】主 HDR 靶的 **alpha 通道全链路无人读**（Composite 只取 `.r/.g/.b` 与 `.rgb`，Bloom 全是 `.rgb`，TAA 写死 1，调试视图只看 rgb）—— SSR 把它当粗糙度 GBuffer 用了（§17.2）。**谁要动 alpha 之前先看那一节**：往里写别的东西会把下一帧的反射判据改掉，而且不透明材质写非 1 的 alpha 还会破坏半透明混合，所以那条补丁只挂不透明材质。
- 运动模糊没排除武器/手臂 layer → 转身时枪身糊成一坨，FPS 手感直接塌。给第一人称模型单独 layer 并在速度缓冲里写 0。
- 【2026-09-08 集成期】**scatter-as-gather 的「一像素羽化」项必须再乘一道「这个样本
  本来就在那一层」的闸，否则半径是常数的那一支会无条件糊整幅画。**
  散景景深的近场 gather 权重是 `clamp(cocS − dist + 1.0, 0, 1)`；远场那一支由
  中心自己的 CoC 门住（合焦处整段不跑）所以没事，近场那一支的半径是**常数**
  （近场必须往外渗，只能按最大近景 CoC 采），每个像素每一帧都进循环。
  于是 `cocS = 0` 的样本落在 1 像素以内仍拿到 `w = 1 − dist > 0`，覆盖度 0.31，
  ×增益 1.35 = 0.41 —— **四成画面被半分辨率的近场层盖掉**。
  症状是「一开镜整幅画发糊，连枪都糊」，而 CoC 调试图**全是 0**（所以盯 CoC 的
  测试全绿）。取证的关键一步是**读回 CoC 靶发现它恒 0，却仍然看见糊** ——
  那一刻就该去看合成端的混合权重，而不是继续调 CoC 参数。
  回归口：`Script_TaauTest` 的「近场里什么都没有时，景深是恒等式」（比像素，
  且自带噪声底对照）。同类写法（把一层无条件混上去）在别处也要查一遍。
- 【2026-09 集成期】**TAAU 落地之后 `ctx.width/height` 不再是 `ctx.sceneColor` 的尺寸。**
  帧图从 `taa` 起解算到输出分辨率，而 `ctx.width/height` 一直是**内部**分辨率
  （`graphics.renderScale` 缩过的）。凡是「以 sceneColor 为源、按纹素取偏移」的 pass
  再拿 `ctx.width` 算 `1/宽` 就会把抽样点放错格子 —— **不报错、不黑屏**，
  只是测光偏一点、盒式滤波偏一点，画面「看着差不多对」。
  合并期抓到两处：自动曝光的 2×2 盒式测光（`uSourceTexel`）与 SSR 颜色金字塔的
  2×2 盒式降采样（`uTexel`），两处都改成**问靶自己**（`ctx.sceneColor.width/height`）。
  规矩：**要源图的纹素就问源图，别问 ctx**；要自己靶的纹素就问自己的靶。
  只有「按内部像素度量的量」（速度靶的像素速度、运动模糊的 tile 尺寸、GTAO 的
  `uFullResolution`）才该继续读 `ctx.width/height` —— 它们跟的是预通道不是场景色。
  逐 pass 的域表在 §17「TAAU / 逐物体运动模糊 / 散景景深」的 17.1。
- 【2026-09 集成期】**换着色模式（线框 / 着色线框）对自动曝光是硬切，不当硬切处理就会「先亮一下再正过来」。**
  线框那一档整幅画换成「深灰底 + 亮线」，测光读到的平均亮度跟正片完全不是一回事；
  切回来时自动曝光按适应时间常数（暗→亮 3.0 s / 亮→暗 1.0 s）慢慢爬。
  实测：切回 shaded 三帧后画面与切之前差 **3.8%**（场景自身漂移只有 0.6%）。
  `PostPipeline.SetShadingMode` 因此在模式真的变了时调一次 `exposurePass.RequestReset()`
  —— 与 `NotifyCameraCut` 同一个理由。接上之后是 0.8%。
  同一类还有：任何「整幅画换内容」的开发者视图，加的时候顺手想一下测光。
- 【2026-09 实测】**材质补丁一路加下去会撞 `MAX_TEXTURE_IMAGE_UNITS`（ANGLE-D3D11 上是 16），
  撞了之后程序不链接、three 每帧照样 `useProgram`，症状是「那只材质整个不画 + 每帧一次 1282」。**
  最挤的是第一人称视模那份：三方自带六七个 + AO 1 + 探针 GI 3（`uGiIrradiance` /
  `uGiDistance` / `uGiOffset`）+ SSR 1 + 簇状光 3（两个是 `usampler2D`）+ 自阴影 1。
  B3/B4/B5/B8 四个子系统各自单跑都在预算内，合到一起才越线 —— 所以这是**集成期**的坑，
  各分支的回归口都抓不到。取证配方：把 `gl` 上每一个函数都包一层 `getError()`，
  命中时读 `getProgramInfoLog(gl.getParameter(gl.CURRENT_PROGRAM))`，
  再拿 `renderer.info.programs` 按 `program` 反查材质名与 cacheKey；
  日志就一行 `FRAGMENT shader texture image units count exceeds MAX_TEXTURE_IMAGE_UNITS(16)`。
  现在视模那份不挂 SSR（`Script_FirstPersonSelfShadow.CloneOwnedMaterial` 重挂一次补丁），
  这既是腾槽也是修正 —— 视模走 `MarkForegroundPrepass`，`uSsrMap` 在它那些像素上存的
  是**枪后面**那块几何的反射。谁要再加一路材质补丁，先数一遍这只材质的采样器。
  回归口：`Script_EditorTest` 的「自阴影软化可热切」断言 `glError === 0`。

- 【2026-09 实测】**八个子系统合流之后，开机的着色器预热从几十秒涨到一百四十秒上下。**
  `?shot=1&phase=2&quality=high&scale=medium&ads=1` 实测：烘贴图 6 s、建城 13 s，
  然后提交 program 19→66 s、重编场景光照 66→108 s、预热材质 108→160 s。
  **program 数没多少**（phase=2 从 157 到 166），是每一份变大了：POM 16 步、
  三级 PCSS 12 抽样、簇光循环、GTAO 的联合双边升采样、SSIL 注入、CSM chunk 整段替换。
  链接时间随程序体量走，不随程序个数走。`Script_ShotTest` 的开机闸已从 90 s 抬到 300 s；
  真要把开机拉回去，要动的是预热的**组合表**（§16）而不是哪一个子系统。
- 【2026-09-08 补正】**量开机耗时必须先说清 NVIDIA 驱动的磁盘着色器缓存是冷是热。**
  上面那个「一百四十秒」是**冷缓存**的数（那一轮是当次会话第一次起浏览器）。
  同一台机器、同一份检出，跑过几轮浏览器测试之后再量是 **82–85 s** —— 差了将近一倍，
  代码一个字没改。原因是 NVIDIA 的 DXCache 目录跨进程持久化，headless Chromium
  每次换 user-data-dir 也清不掉它。
  **结论：开机耗时只有「同一次会话里、缓存状态相同、A/B 交替」才可比。**
  B6a+B6b 合流的实测（交替量三组，服务同一台机器上 git archive 出来的合并前快照）：
  合并前 81.4 / 83.6 s（program 164 / 165）、合并后 82.2 / 84.7 / 85.2 s（program 172 / 173）
  —— **+1–2 s，落在噪声里**。合理：这两轮加的全是全屏后处理着色器
  （曝光四趟 / 光晕 / 运动模糊 / 景深 / CAS），**没有新的材质变体、没有新的 cache key**
  （`Script_SamplerBudgetTest` 打出来的 cache key 组合与合并前是同一份），
  而开机那一百多秒烧的正是材质 program。

- 【2026-09 实测】ShaderMaterial 里**重复声明同名 uniform** 会把整个片元着色器废掉。
  把一段公用 GLSL（例如 `LUT_GLSL`，它自己声明了 `uniform sampler2D uLut;`）include 进来之后，
  调用方千万别再写一遍 —— `ERROR: 'uLut' : redefinition`，而 three 只在控制台留一行
  `Shader Error 0 - VALIDATE_STATUS false`，那一趟什么都不画（视图恒为纯黑）。
  同一类错法还有「公用段引用了调用方才定义的函数」（LUT 段靠 `LinearToSrgb`）——
  拼字符串的顺序就是依赖顺序。回归口：`Script_ExposureTest` 的「调试视图真的出画」。
- 【2026-09 实测】**半浮点靶上的加法混合只能精确累到 2048**（fp16 尾数 10 位）。
  直方图把 14400 个点往同一个桶里累时，超过 2048 的那部分就开始丢计数，而且不报错。
  解法是把直方图摊成 64×16（行号按顶点序号轮转）再列归约，并在归约时**归一化**；
  直接存计数的话，14400 那个量级上 fp16 的 ulp 已经是 8。
  （fp32 靶的混合要 `EXT_float_blend`，不是核心功能，所以不能靠它。）
- 【2026-09 实测】**一个 headless Chromium 里连开三个 WebGL 上下文**，第三个会零星冒出
  `THREE.WebGLProgram: Shader Error ... VALIDATE_STATUS false`（Program Info Log 是空的）
  并把 GL 推进 1282，紧接着的**半浮点 `readRenderTargetPixels` 全读回 0**。
  表现是「某一关的数值恒为 0」而同一页面单独跑一遍完全正常。
  多段取证的测试要**每段各起一个浏览器、跑完就关**，不是同一个浏览器开三个页面。
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

---

### 第三轮的账：远景层里那具「只剩一支枪」的人

**症状**（2026-09-02 实拍，第一关白盒）：46 m 以外的日军全部只剩一支悬在半空的三八式，
人不见了；近处的国军完好。换句话说，`renderLod` 计数、实例数、`visible` 标记全绿，
而画面上没有人 —— **这正是「visible 不等于看得见」那条教训的再一次现形**。

**根因在 `ActorCrowd._Bake` 对蒙皮网格的处理**。军人自 GLB 化以后是 `SkinnedMesh`，
而 `SkinnedMesh` 的顶点**不经过自己的 `matrixWorld`**：three 在 `updateMatrixWorld` 里把
`bindMatrixInverse` 设成 `inverse(matrixWorld)`，着色器再乘回 `matrixWorld`，两下正好抵消，
画出来的位置完全由骨骼给。卢沟桥那批 GLB 是 Max Biped 出的，网格节点上挂着一层 0.01 的
物体缩放，运行时被这条抵消规则吃掉，所以正常渲染一切正常。

远景层原来是 `geometry.clone().applyMatrix4(inverse(root)·mesh.matrixWorld)` —— 它把那层
0.01 当了真：1.76 m 的人被烘成 **1.7 cm** 的一粒，46 m 外一个像素都不到。而挂在手部插槽上的
步枪是普通 `Mesh`（插槽已经补偿过缩放，世界缩放是 1），照常画出来。于是只剩一支枪。

**修法**：`BakeSkinnedPose` 逐顶点走 `SkinnedMesh.applyBoneTransform`，按**当前骨骼姿势**把
顶点烘进网格自己的局部空间（该方法末尾已乘过 `bindMatrixInverse`，所以外面那条
`inverse(root)·matrixWorld` 原样保留，别再补偿一次）。法线用 `w=0` 的 `Vector4` 走同一条链路，
平移项被 w 吃掉、只剩线性部分 —— 不要改用 `computeVertexNormals`，那会把 GLB 里烘死的硬边抹平。

**开销为零**：那些三角形原本就已经合并进 `InstancedMesh` 并逐帧提交，只是被缩成了亚像素。
修复只改顶点坐标，draw call 与三角面数一个没变。

**回归口**：`node Taierzhuang1938/Script_VisibilityTest.mjs` 新增两条 ——
`ActorCrowd.BakeReport()` 报出每套姿势里**蒙皮那部分**的包围盒，站姿据枪约 1.49—1.53 m、
倒地横躺约 1.59—1.62 m，闸门设在最长边 ≥ 1.2 m。阈值必须落在**人体尺寸**上：
整具包围盒有枪撑着（0.6 m 见方）看不出问题，坏版本量出来是 0.02 m。

---

## 16. 进过场那十几秒：着色器预热

**症状**：主菜单点「序章」，画面整个冻住十几秒 —— 没有加载画面、没有进度条，
浏览器随时会判成无响应；等它活过来，过场已经播到第二镜，头几句台词永远听不到。

**根因不是加载资源，是编译着色器。** 车厢序章的布景一次往场景里加三千六百多个网格、
几十种新材质，而 three 是**惰性编译**的：program 要到第一次被渲染时才建，一建就要同步
问驱动要 uniform 位置（`WebGLProgram.getUniforms → onFirstUse → getProgramParameter`），
那一问会一直等到链接完成。CDP Profiler 采样：14.6 s 的单个长任务里九成落在这一条。
`renderer.debug.checkShaderErrors` 早就关了（见 `Script_Main` 建 renderer 那一段），
关的只是**取错误日志**那次同步，取 uniform 那次躲不掉。

**做法**（`Script_Main.WarmupShaders`，由 `RunCutscene → WarmCutscene` 调用）：布景建好后
**先按住过场的时间轴**（`CutsceneDirector.Play` 的 `ctx.hold` / `Release()`），盖上加载画面，
把这笔账分四段摊开，每段之间让一帧 —— 进度条真的在动，主循环这期间不出画
（`state.warming`，出画等于把整笔账一口气付掉）：

| 段 | 做什么 | 为什么 |
|---|---|---|
| 一 提交着色器 | 按 16 件一批 `renderer.compile` | 同步的 HLSL 翻译；整包一次交就是四五秒的长任务。交完不等它链完，链接在驱动线程上继续跑 |
| 二 重编场景光照 | 把**场上原有**的网格按 8 批累加放出来各画一帧 | 过场一开场就换天光，城里那批材质整批作废要重编。这块最大（实测 6—7 s），不摊开就整包压在第一批上 |
| 三 预热材质 | 布景的代表件逐批真画一帧 | 深度法线预通道 / 阴影 / 浮点靶那几套变体是另外的 program，**只 compile 主 pass 建不出来**（只做第一段的话第一帧照样冻十几秒）。批长自适应：建出新 program 的收到一件，纯缓存命中的翻倍放开 |
| 四 载入网格 | 剩下三千多件按 256 一批累加放出来 | 只是把顶点/索引缓冲传上去（比编译便宜得多）；不做的话它们全堆在第一帧，一秒半的卡顿 |

两条实现上的坑：

- **藏东西用 `layers` 不用 `visible`。** `visible` 是层级的（父物体一藏，整棵子树跟着没），
  `layers` 是逐物体的 —— `projectObject` 照样往下走。空层同时把灯排除掉（灯都在 0 层），
  这一件的阴影 pass 一起跳过。
- **放出来的那一批要 `frustumCulled = false`。** 剔除掉就没画，没画就没编，账原封不动
  留给后面某一镜。这一步要的是把 program 逼出来，不是把画面画对。

**实测**（RTX 4070 SUPER / Edge，序章）：总时长 14.6 s → 17.3 s（多出来的是分批出画的
开销），但最长的单次冻结 14.6 s → 2.8 s，其余时间进度条在走；过场从第 0 秒开演。
显卡驱动的着色器缓存热了以后整段掉到 6 s 上下 —— **这也是量这条时别只跑一次的原因**。

编译总量本身没动过：序章要新建约 67 个 program。真想把它变短，得从内容侧减少材质
变体，不在这条链上。

> 上面这四段的**顺序在 2026-09 改过一次**（多了「一之二 等链接」，第一段的范围也扩到
> 场上原有材质），账见下面 16.0。这一节的实测数字是改之前的，留作对照。

### 16.0 2026-09：八子系统合流之后的预热账

八个渲染子系统合进来之后开机预热从几十秒涨到两分多。**涨的不是 program 数**
（157 → 166），是每一份都变大了，而且**建一个就同步等一个**。这一轮把它压回基线以下。

#### 怎么量（不这么量就是量了个寂寞）

同一份代码在这台机器上能量出 145 s / 82 s / 20 s 三种结果，差别全在
**ANGLE 的 program 磁盘缓存**（HLSL→DXBC 那一步，缓存在浏览器 profile 里）。
可复现的口径只有一条：

```bash
# 每轮起全新浏览器，并关掉 program 缓存；三次取中位数
--disable-gpu-shader-disk-cache --disable-gpu-program-cache --disk-cache-size=1
```

跑的是 `?shot=1&phase=2&quality=high`，从 `page.goto` 到 `window.Taierzhuang` 就绪。

| 树 | 中位数（3 次） | 三次 | program 数 | 其中人物预热 |
|---|---:|---|---:|---:|
| 大修前基线 `27f6ace0f` | **34.1 s** | 33.1 / 34.1 / 34.5 | 128 | 24.0 s |
| 八子系统合流后 `5252487d0` | **82.4 s** | 77.8 / 82.4 / 82.8 | 164 | 63.8 s |
| 本轮 ①②③ 之后 | 32.5 s | 31.7 / 32.5 / 33.0 | 149 | 20.6 s |
| 本轮 ①②③④ 之后 | **31.0 s** | 29.0 / 31.0 / 31.9 | 149 | 17.7 s |

**时间到底花在哪**（包住 WebGL 入口逐调用计时，合流后那一版）：整条链
130 s 里 **100% 落在 `getProgramInfoLog`**，131 次、每次八百多毫秒；
`compileShader` 与 `linkProgram` 加起来不到 5 ms，`getShaderInfoLog`、
`getUniformLocation`、`getActiveUniform` 全是零头。栈是同一条：
`onFirstUse ← WebGLProgram.getUniforms ← setProgram ← renderBufferDirect`。

也就是说：**ANGLE 把编译和链接全甩给驱动线程池了，一次都不阻塞；阻塞的是「第一次
用到它」那一下。** `renderer.debug.checkShaderErrors` 只决定拿不拿错误日志
（`?shot` 下开着），关掉它 `getUniforms` 里的 `getProgramParameter(ACTIVE_UNIFORMS)`
照样要等链接完成 —— 躲不掉，只能**改顺序**。

#### 三条改动（逐比特无损，按收益排序）

**① 提交与等待分家 —— 建一个用一个 → 全部先交、再统一等。**
本机对照（同一份 115 KB 的着色器 8 份）：逐个「link 完立刻问」12.6 s，
「先全 link 再统一问」3.5 s，**3.6×** —— 驱动的编译线程池是四条。
落地：`WarmupShaders` 第一段现在把**新布景与场上原有材质一起**交（以前场上那批是
第二段渲染时才现建的，整座城的链接排成一条队）；交完新增一段
「等待着色器就绪」，逐帧轮询 `WebGLProgram.isReady()`
（`KHR_parallel_shader_compile` 的 `COMPLETION_STATUS_KHR`，不阻塞），
进度条跟着走，主线程空着让驱动跑满。第二段「重编场景光照」因此从 18.5 s 掉到 2.1 s。

**② 提交时必须绑主渲染靶。** three 的 program cache key 里带 `outputColorSpace`，
它按「当前绑着的靶」算：绑画布 = `srgb`，绑任意离屏靶 = `srgb-linear`。
场景网格只画进 HDR 靶，所以不绑靶就 `renderer.compile` 出来的是**另一份用不上的
program** —— 白链一遍，真正那份到第一帧还得现编现等。

**③ 补丁的 `defines` 必须在算 cache key 之前写进 `material.defines`
（不能只在 `onBeforeCompile` 里写）。** 这条是本轮最大的一处白烧：
`getProgramCacheKey` 从 `material.defines` 现读，而 `onBeforeCompile` 要等 program
已经开建之后才跑。于是同一份材质第一次编译时键里没有 `CSM_CONTACT` /
`USE_MATERIAL_POM` 这些位，钩子跑完把它们写进了材质，第二次 `getProgram` 算出来的键
就多了几位 —— three 认成另一个程序，**再链接一份逐字节相同的 GLSL**。
症状是程序表里成对出现 frag 长度只差两三个字节的孪生程序
（`118176`/`118174`、`113981`/`113978`、`108217`/`108214`……）。
`ApplyPatches` 现在装补丁时同步一次、`customProgramCacheKey` 里再同步一次
（改画质档时 `RefreshDefines` 会原地改 `patch.defines`，两边必须同源），
不再要的位 `delete` 掉。program 数 188 → 149。

**④ 破口分形图案：78 个分支的级联 → 常数表。**
`FractureSectorRadius` 原来是 JS 展开的 `if` 级联（6 图案 × 13 扇区），
`FractureRadius` 里调它两次，而这段代码落在**每个可破坏材质**的片元着色器里。
HLSL 编译器把整棵树内联展平，链接一份带破口的墙材质要 1.70 s —— 换成
`const float[72]` 查表之后 1.10 s（**−35%**）；把整段破口全删掉也只到 0.91 s，
所以级联本身就是那 35%。开机时最长的那几份 program 全是带破口的静态墙
（frag 源码 115 KB）。逐比特等价：调用点传进来的扇区号只可能是 `floor`/`mod`
出来的整数，`floor(sector + 0.5)` 与 `sector < k+0.5` 在整数上选同一格；
131072 点扫描（含两侧越界值）`floatBitsToUint` 完全一致。

#### 量过但**不是**瓶颈的（别再重做一遍）

拿真实 dump 出来的那份 115 KB 片元着色器做消融，交替 A/B 九轮取中位数
（基线 1.70 s）：

| 消融 | 省 | 结论 |
|---|---:|---|
| 破口分形表→常数表 | **35.3%** | 做了（上面④） |
| 去掉整段破口（对照） | 46.3% | 上限；表查完就只剩 11 个点 |
| 去掉整块簇光 | 15.0% | 功能，不动 |
| 簇光循环上界 64→16 / 64→4 | 3.0% / 2.4% | **噪声**。ANGLE 没有展开这个循环 |
| POM 步数 16/5→8/3 | 1.8% | **噪声**。同上 |
| 去掉 GI 的 13 个调试视图 | 2.8% | **噪声**。分支体只是几条赋值，编译器不怕 |
| 去掉材质的 5 个调试视图 | 5.7% | **噪声**（同量级的轮内漂移就有 ±10%） |
| PCSS→固定盘 / CSM 抽样数→4 | 0.6% / 0.8% | **噪声** |

所以 `RENDER_DEBUG_VIEWS` 这类「把调试分支编译期剔掉」的方案**这一轮没有做**：
量出来的收益在噪声里，而代价是面板打开要整场重编译 + `EditorTest` 那 172 项全部
要走新路径。要动它得先有新的取证，不能凭直觉。同理，循环上界与 POM 步数是
**画质旋钮**，不是编译成本旋钮。

#### 剩下的瓶颈

改完之后 31.0 s 里最大的一段是「等待着色器就绪」10.8 s —— 那是 149 份
（其中一百来份是 100 KB 量级的 `MeshStandardMaterial`）在四条驱动线程上并行编译的
真实耗时，主线程这期间是空的、进度条在走。要再往下压只有两条路：
**减 program 数**（`physical` 那一族仍有近百个，差异多来自 three 自己的
`USE_UV`/`vertexColors`/`side`/贴图组合），或者**减每份的活**
（破口那一条已经吃掉了，下一个候选是簇光那 15%，但那是功能）。

`Script_BootTest` 现在会打印 `warm=<秒>` 与预热分段 —— **软指标，只打印不判红**：
带不带 program 缓存能差五倍，拿它当门禁只会天天假红。

### 16.1 换人那一帧的一到三秒：人物材质

**症状**（2026-09-05，RTX 4070 SUPER / Edge，`?explosions=1&shot=1&manual=1` 逐帧剖析）：
玩家阵亡、卡片读完、`RespawnPlayer()` 那一帧 post 桶 2929 ms，`renderer.info.programs`
43 → 52。当时的归因是「换上来的人领了不同的枪，视图模型第一次画那支枪的材质」。

**探针量出来不是这么回事。** `Script_RespawnShaderWarmTest` 在 phase=2 与爆炸场各连死
三次：换人后手里都还是 loadoutOverride 钉死的那支汉阳造（正片七章与各靶场的携行全都
钉死，`MakeSoldierIdentity` 抽出来的 `weapon` 实际上从没当过主武器），视图模型一个
program 都没新建。涨出来的全是**卢沟桥人物 GLB 的材质**：`John_All Body`、`战士5_头部`、
`Material #1721585337`（军装）、`John_ Hair and Bread Mat`……同名材质还各有两份 ——
缓存键最后那两个位掩码解出来是 `vertexColors + vertexAlphas`（GLTFLoader 给带 COLOR_0
的 primitive 克隆的那份）与 `skinning`（蒙皮身体 vs 挂在头骨上的头盔）。远景层
`Crowd_*_Standing/Dead` 的 InstancedMesh 再各算一份（`instancing`）。

**机制**：每名士兵开局按种子在本阵营四个模型里抽一个，`CullActors` 只把视锥内、
细节距离以内的人挂回场景。某个模型号**第一次被画**的那一帧才编它的 program
（一个三四百毫秒）。换人换了个机位，也把倒地时看不见的那些人重新看见，这笔账就常落在
`RespawnPlayer` 那一帧；平时某个模型号第一次走进画面同样冻一下，只是没人盯着帧 ——
同一份取证里卡片倒计时中途也冻过一次 800 ms，那一帧是倒地机位第一次看见某个模型号。

**做法**（`Script_Main.WarmActorShaders`，`EnterLevel` 末尾、`state.ready` 之前）：按
「kind × 模型号 × 本阵营会发的枪」造一批临时 Actor 挂进场景（`nra` / `ija` 保底，撒好的
兵有什么 kind 就加什么，夜袭关补 `nraDare`），远景层按 kind 先烘出来
（`AiDirector.PrepareCrowd`），然后整批走一遍上面那个 `WarmupShaders`，收工整批拆掉。
加载画面这时还盖着，出画玩家看不见；已经热着的材质由 `WarmupShaders` 自己跳过，
第二次进关几乎不花时间。

**验收**：`node Taierzhuang1938/Script_RespawnShaderWarmTest.mjs [--query=phase=2|explosions=1]`
—— 连死三次，落地那一帧 program 不涨、整帧 CPU < 50 ms；再把两个阵营四个模型号各配
本阵营的枪摆到镜头前、镜头转一圈，仍一个 program 不新建。头一条只能证明「这次没撞上」，
第二条才证明预热覆盖了全部模型号。

---

## 17. 簇状前向光照（Clustered Forward，2026-09）

> 这一节替代 §2.1（那一节留作历史稿）。**现状以本节为准。**
> 代码：`Script_ClusteredLights.mjs`（运行时 + GLSL + 调试叠加）、
> `Data_Tuning_Lights.mjs`（档位 + `ClusterGrid` 纯几何）、
> `Script_Light.mjs` 的特效点光池、`Script_MaterialPatches.MakeClusteredLightsPatch`。
> 回归口：`Script_ClusteredLightsTest.mjs`。

### 17.0 先说要解决的那条实测

2026-09 之前，全城同时能亮的动态光**一共 6 盏**（`EFFECT_LIGHT_COUNT.high`）。
不是美术选的，是 three 的账：

```js
// three.module.js / WebGLPrograms.getParameters
numPointLights: lights.point.length,     // → #define NUM_POINT_LIGHTS n
```

`NUM_POINT_LIGHTS` 是**编译期**的。场景里多一盏 visible 的 `PointLight`，整座城的
`MeshStandardMaterial` 就要重编译一次（几百毫秒的硬卡顿）。所以灯池必须定长，
逻辑火源再多也只有前 6 名进 GPU（`LightRig.Update` 按镜头贡献排序）。
后果在夜战与燃烧的街道上一眼可见：**第七处火只有粒子，地面上没有光**。

现在：medium 32 盏 / high 64 盏 / ultra 128 盏，而且开灯关灯**不碰 defines**。

### 17.1 一帧做什么

```
[CPU] LightRig.Update(dt, elapsed, focus)
        逻辑火源 / 爆炸包络 / 聚光 / 枪口闪光 → 打分（_ScoreEffect）
        前 EFFECT_LIGHT_COUNT 盏照旧写进 fireLights（喂探针体 GI；不进场景）
        全部候选灌进 ClusteredLights（BeginFrame + AddPoint/AddSpot/AddTube）
[CPU] LightRig.UpdateClusters(camera, post.width, post.height)   ← RenderScene 里一行
        ① 超预算时按分数选前 maxLights（部分选择排序，零分配）
        ② 世界 → 视空间（直接乘 camera.matrixWorldInverse 的元素，不 new Vector3）
        ③ ClusterGrid.SetProjection(p0, p5, p8, p9)  ← 从投影矩阵现取，TAA 抖动逐帧对齐
        ④ ClusterGrid.Build(spheres, n)              ← 球→簇分配 + 压实
        ⑤ 三张 DataTexture 置 needsUpdate
[GPU] 主场景那一趟：材质补丁在 <lights_fragment_begin> 之后接一段循环
        gl_FragCoord + 线性视深 → 簇号 → offset/count → 逐灯 RE_Direct
```

**场景里一盏 three 的 `PointLight` 都没有**（`NUM_POINT_LIGHTS = 0`，省寄存器也省
那两段展开的循环）。唯一的例外是「英雄光」，见 §17.6。

### 17.2 簇网格

视锥切成 `tilesX × tilesY × slices`，深度按**指数**分布（Olsson 2012）：

```
sliceScale = slices / ln(far/near)
sliceBias  = -slices · ln(near) / ln(far/near)
slice(d)   = floor(ln(d) · sliceScale + sliceBias)
```

指数分布让每个簇在屏幕空间里近似立方（近处密、远处疏）；线性分布的远处簇会退化成
一根针，它的 AABB 会把大量不相干的灯算进来。

| 档 | tiles | slices | 簇数 | far | 光预算 | 索引表 | 聚光 | 英雄光阴影 |
|---|---|---|---:|---:|---:|---:|---|---|
| low | — | — | — | — | — | — | — | — |
| medium | 16×9 | 24 | 3456 | 140 m | 32 | 32768 | 有 | 无 |
| high | 16×9 | 24 | 3456 | 150 m | 64 | 65536 | 有 | 可开 |
| ultra | 24×16 | 32 | 12288 | 170 m | 128 | 196608 | 有 | 可开 |

low **不跑簇**（`CLUSTER_TIERS.low.enabled = false`）：每帧几千次球-AABB 判定 + 三张表
上传，换来的画面收益抵不过它在 CPU 上的占用；那一档保持 2026-09 之前的两盏物理点光。

`near` 是 **0.5 m 不是相机的 0.08 m**：`ln(d/near)` 在 near 太小时会把一半切片花在
「贴着鼻子的 10 cm」上，街道那一段反而只剩几片。

**网格参数从 `camera.projectionMatrix` 现取，不从 fov/aspect 算**：

```
clip.x = p0·vx + p8·vz,  clip.w = -vz = d
ndcX   = p0·vx/d - p8    =>   tile 边界 i 处的 x/d 比值  kx[i] = (ndcX_i + p8) / p0
```

TAA 的子像素抖动走 `camera.setViewOffset`，改的正是 p8/p9（离轴），fov 与 aspect 一个字
没变。拿 fov 算出来的网格与着色端 `gl_FragCoord → tile` 就差半个像素。
（顺带：抖动是 `post.Render` 里才上的，`UpdateClusters` 拿到的是**未抖动**那一份，
所以还留了 2% 的半径余量 `RADIUS_MARGIN`，见那里的注释。）

### 17.3 球→簇分配（CPU，每帧）

Persson 2013 的两段式：**先按屏幕矩形收窄候选 tile，再逐候选做精确的球-AABB 判定。**

```
for slice in [sliceOfDepth(d-r), sliceOfDepth(d+r)]:
    dz = 球心到这一片深度带的距离；dz ≥ r 就跳过
    rr = sqrt(r² - dz²)                      # 这一片里的截面半径
    tan 区间 → tile 矩形（取两个深度端点的并集）
    for ty in 行:  dy = 球心到这一行 AABB 的 y 距离（整行常数）
        for tx in 列: dx = …；dx² + dy² + dz² ≤ r² 就挂进这一簇的链表
```

**收窄是严格保守的**（证明写在 `Data_Tuning_Lights` 的注释里），所以它与暴力法
（扫全部 3456 个簇）**逐簇相等** —— 单测里那条断言不是「差不多」。

三层循环里能提的都提了：深度那一维的平方距离在整片里是常数、y 那一维在整行里是常数，
内层只剩两次乘法与一次比较。**不走回调** —— 一帧几万次命中，闭包调用本身就是 0.1 ms
量级（实测 64 盏灯 0.51 → 0.28 ms）。

压实用链表法：一趟几何（挂 `head[cluster]` 链表）+ 一趟压实（链表 → 连续索引段）。
不用「先数个数再填」的两趟，那要把球-AABB 判定跑两遍。全部 TypedArray 预分配，零 GC。

### 17.4 三张表

| 表 | 格式 | 尺寸 | 内容 |
|---|---|---|---|
| `uClusterLights` | RGBA32F（**必须 NearestFilter**） | 4 × maxLights | 逐灯 4 个纹素，见下 |
| `uClusterTable` | **R32UI**（`RedIntegerFormat` + `UnsignedIntType`） | (tilesX·tilesY) × slices | `offset << 8 \| count` |
| `uClusterIndex` | **R16UI**（`RedIntegerFormat` + `UnsignedShortType`） | 1024 × ⌈maxIndices/1024⌉ | 光下标，按 1024 折行 |

逐灯 4 个纹素：

```
t0: xyz = 视空间位置,  w = ±截断距离（符号 = 是不是纯点光）
t1: rgb = color × intensity（线性）, a = 类型 0 点 / 1 聚光 / 2 管状
t2: xyz = 视空间方向（聚光是「靶点→灯」，与 three 的 spotLight.direction 同口径）, w = coneCos
t3: x = penumbraCos, z = 管长半值
```

**位置存视空间**：与 `WebGLLights.setupView` 给 `pointLights[i].position` 的口径一致，
着色端 `lVector = pos - geometryPosition` 与三方逐字节同构。
**decay 不存**：全项目恒为 2（物理逆平方），常数比一个通道便宜。

`texture.needsUpdate = true` 整表传即可 —— three 对已分配过的 `DataTexture` 走
`texSubImage2D`，不重新分配显存。high 档三张表合计约 200 KB/帧。

### 17.5 着色（材质补丁）

补丁挂在 `<lights_fragment_begin>` **之后**（那里 `geometryPosition`（视空间）、
`geometryNormal`、`material`、`reflectedLight`、`RE_Direct` 全都在），
注册顺序 **AO → GI → 簇光 → 破口**：

* 排在 GI 之后：GI 改 `iblIrradiance`（间接光），簇光加 `reflectedLight.direct*`，锚点不同、互不覆盖；
* 排在 AO 的 `<aomap_fragment>` **之前**是必须的 —— 局部光是直接光，被 SSAO 压就成了
  「墙角的火照不亮墙角」。

```glsl
float clusterViewDepth = max(-geometryPosition.z, near);
ivec2 tile = (gl_FragCoord.xy * uClusterScreen);          // uClusterScreen = tiles / 主靶尺寸
int slice = int(floor(log(clusterViewDepth) * sliceScale + sliceBias));
uint cell = texelFetch(uClusterTable, ivec2(ty*tilesX+tx, slice), 0).r;
for (k < cell & 255u) {
  int id = int(texelFetch(uClusterIndex, ivec2(slot & 1023u, slot >> 10u), 0).r);
  vec4 t0 = texelFetch(uClusterLights, ivec2(0, id), 0);
  // 纯点光可以在取颜色那一次 texelFetch 之前就退（窗口函数在 d ≥ cutoff 处恒为 0）
  ...
  light.color = t1.rgb * getDistanceAttenuation(dist, range, 2.0);      // three 自己的函数
  if (spot) light.color *= getSpotAttenuation(coneCos, penumbraCos, angleCos);
  RE_Direct(light, geometryPosition, geometryNormal, geometryViewDir,
            geometryClearcoatNormal, material, reflectedLight);          // 同一个宏
}
```

衰减与聚光都直接调 three 在 `lights_pars_begin` 里的**无条件段**定义的
`getDistanceAttenuation` / `getSpotAttenuation`（`NUM_POINT_LIGHTS = 0` 时它们照样存在），
最后调的也是同一个 `RE_Direct` 宏 —— 能量、菲涅尔、各向异性全部走材质自己的 BRDF，
不是另写一份 Lambert。

**cache key**：`clust<maxLights>_<tilesX>x<tilesY>x<slices>`（三态之外多一段）。
改档位 = 换 GLSL 循环上界，必须换编译缓存；**灯的开关不在 key 里** —— 那是
`uClusterParams.w` 这个运行时 uniform，点一处火不会重编译整座城。
簇系统不存在时补丁返回 `null`，cache key 逐字节回到 `ssao1|gi2`（low 档与旧回归口一致）。

补丁怎么拿到簇系统：`Script_ClusteredLights` 里一个**全局现役实例**
（`SetActiveClusteredLights` / `GetActiveClusteredLights`），补丁在编译那一刻现问。
材质是 `MaterialLibrary` / `ActorFactory` / 过场三条链各自建的，而簇系统由 `LightRig`
构造（顺序还在材质之后），把 cluster 穿过那三条链的签名只为了拿一个全场唯一的对象，
不划算。

### 17.6 局部光的阴影 / 英雄光

**簇里的灯一律不投影。** 想给某一盏加影子（照明弹、眼前那处大火），走
`LightRig.SetHeroShadow(true)`：把当前分数最高的那一盏搬回一盏真的三方 `PointLight`
（立方体阴影），其余仍走簇；那一盏会从簇表里剔掉，不会双份。

出厂**关**，账很直白：一盏投影点光 = 整城几何再画六遍（六个面），而本项目
CPU 提交本来就是瓶颈（1440p / phase=2 实测 15 ms）。开关会翻
`NUM_POINT_LIGHTS` 0↔1 与 `NUM_POINT_LIGHT_SHADOWS` 0↔1，是**编译期**改动，
`ApplyGraphics` 里跟着重编译一次整场材质（与阴影总闸、GI 采样层同一个先例）。

### 17.7 给别的子系统的接口

```js
lights.GetClusterLightData()
// {
//   enabled, quality, maxLights,
//   grid:  { tilesX, tilesY, slices, near, far, clusters },
//   stats: { sources, active, indexCount, occupied, maxPerCluster,
//            meanPerOccupied, meanPerCluster, overflow, buildMs, clusters },
//   lights: [{ index, type: "point"|"spot"|"tube",
//              position: [x,y,z],        // **世界坐标**（体积雾在世界空间 raymarch）
//              color:    [r,g,b],        // 线性，已乘强度
//              radius, decay,
//              direction: [x,y,z]|null,  // 聚光是**光束朝向**（已还原符号）
//              coneCos, penumbraCos, halfLength, score }]
// }
```

`GetEffectLightState()` 的前五个字段（`budget` / `persistent` / `explosions` /
`active` / `muzzle`）**一个字没改**，BootTest 与现有消费方照旧；新增的
`spots` / `cluster` / `heroShadow` 是追加。簇光没开时 `GetClusterLightData()` 返回
`null`，消费方退回 `GetEffectLightState().active`（那条路一直都在）。

与 CSM 代理在 `Script_Light.mjs` 的分界线：**太阳那一半**（`sun`、阴影框、
`SUN_SHADOW_GLSL`、`BindSunShadowUniforms`、`SyncShadowUniforms`、
`UpdateShadowFrustum`、`ApplyPreset`）归 CSM；**特效点光池那一半**
（`AddFire/UpdateFire/RemoveFire/ClearFires/AddSpot/FlashMuzzle/FlashExplosion/
Update/UpdateClusters/GetEffectLightState/GetClusterLightData`）归本节。

### 17.8 Debug Rendering

两层**叠加层**（不是视图格 —— 视图那条路要在 `Script_PostDebug.GetSource()` 里加 case，
那是后处理帧图的地盘）：

* **簇灯数热图** —— 全屏四边形，读预通道的线性视深算簇号，按 count 上色
  （蓝 0-2 / 青 / 绿 / 黄 / 红 ≥8）。打开时面板自动把视图切到「HDR 场景」：那一档是
  uMode 4（Reinhard + sRGB，**不过合成链**），热图色标才不会被雾、曝光与 ACES 改掉；
  着色器里先做一次 `L/(1-L)` 反解，屏幕上拿到的正是这条色标本身。关掉时视图还原。
* **光源球线框** —— 本帧真正送进 GPU 的每盏灯的影响半径（三个大圆），聚光另画锥口圆
  与四根母线。线色按 1/曝光预补（与 ColliderWireframe 同一条账）。

面板同一栏还有三行读数：`局部光 n/预算`、`簇网格`、`每片元均/峰 + 索引条数`。
**「每片元灯数」才是这套东西的性能开关**，光看「亮了几盏」没有意义。

### 17.9 已知近似（都是有意的，别当 bug 修）

* 簇用 **AABB** 而不是精确棱台。多算进来的灯在着色端被逆平方 + 窗口函数压成 0，
  画面无差别；精确的棱台-球判定要六个平面，贵十倍。
* **局部光不投影**（英雄光除外）。近墙的火靠直接光 + SSAO + 几何阴影维持体积。
* 簇网格用**未抖动**的投影矩阵，靠 2% 的半径余量吃掉半像素误差（§17.2）。
* 超预算时按分数丢灯（`stats.overflow` 非零就是撞上了）；索引表满了是**停下来**，
  不写越界。
* 管状光是**代表点法**（Karis 2013）：高光形状会略短，漫反射几乎无差别。
  矩形面光没做（本关没有会亮的大平面）。
* **探针体 GI 只看得见灯池里那几盏**（`Script_Gi.MAX_FIRES = 6`，与
  `EFFECT_LIGHT_COUNT` 对齐）。簇里第 7 盏往后的火不参与间接光反弹，只有直接光。
  要接就是把 `Script_Gi` 的 `uFirePos/uFireColor` 数组接到
  `GetClusterLightData()` 上 —— 那是 GI 那一路的活。
* **过场道具灯仍是三方 `PointLight`**（`Script_Cutscene._MakeProp` 的 `spec.light`）。
  它们进出场景照旧会翻 `NUM_POINT_LIGHTS`、照旧重编译一次；这是 2026-09 之前就有的
  行为，簇状光照没让它变好也没让它变坏。改法是让那条路也走 `lights.AddFire`。

### 17.10 成本（RTX 4070 SUPER / ANGLE-D3D11，探针街景）

两种摆法（都是 64 盏灯全在视野内）：**spread** 是正片密度（4 列 × 7.5 m 间距，
彼此基本不重叠）；**dense** 是压力测试（8 列 × 3.2 m、9 m 半径挤在 22×56 m 里，
同一个片元真的落在七八个球的交集里 —— 那不是簇网格保守，是场景本身要求把七份
BRDF 算出来）。

GPU（2560×1440 / high / 探针街景，`EXT_disjoint_timer_query_webgl2`，
**一次查询包 12 帧**，A/B 交替 5 轮取中位数）：

| 摆法 | 灯数 | 簇光开 | 簇光关 | **Δ** | 每片元均/峰 | 非空簇 | CPU 建表 |
|---|---:|---:|---:|---:|---|---:|---:|
| spread 8（正片密度） | 8 | 2.720 | 2.620 | **+0.100** | 2.67 / 6 | 1171 | 0.045 ms |
| spread 64 | 64 | 2.486 | 2.450 | **+0.036** | 3.76 / 18 | 1352 | 0.117 ms |
| dense 64（压力） | 64 | 2.976 | 2.702 | **+0.274** | 7.60 / 27 | 1325 | 0.161 ms |

64 盏灯的 GPU 增量 **0.27 ms**、CPU 建表 **0.16 ms**，两条预算（0.8 / 0.3 ms）都在里面。
Δ 的本底噪声约 ±0.1 ms，所以 spread 64 那行比 spread 8 还低不代表它更便宜。

CPU 那一列是 `ClusterGrid.Build` 的微基准（120 次圈进同一个 `performance.now` 窗口
× 5 个窗口取最好）。Node 里同一份 dense 摆法是 0.118 ms（最好）/ 0.161 ms（中位），
两边互相印证。

**三条踩过的坑**：

* 单帧一个 `TIME_ELAPSED` 查询在 ANGLE-D3D11 上**噪声比信号还大** —— 第一版就是这么
  量出「960×540 增量 +0.907 ms」而「1440p 增量 −0.25 ms」的自相矛盾结果（每次
  begin/end 都要把命令流切断一次）。包 12 帧再除，噪声降一个量级。
* 浏览器的 `performance.now` 被降精到 0.1 ms（Spectre 缓解），逐帧那个 `stats.buildMs`
  只能读出 0.1/0.2/0.3。CPU 预算这么紧，必须把 N 次建表圈进同一个窗口再除。
* 这台机器同时在跑别的 agent 的浏览器测试：**单个计时窗口量到的是「当时机器有多忙」**
  （同一份摆法忙的时候 1.607 ms、闲的时候 0.161 ms）。微基准一律取最小值。

### 17.11 怎么验

```bash
node Taierzhuang1938/Script_ClusteredLightsTest.mjs --node   # 纯 Node 段（秒级）
node Taierzhuang1938/Script_ClusteredLightsTest.mjs          # + 真浏览器
node Taierzhuang1938/Script_ClusteredLightsTest.mjs --perf   # + 1440p GPU/CPU 消融
```

纯 Node 段查的是几何：**正式分配路径（`Build` → `_AssignSphere`）与暴力法逐簇相等**
（24 盏灯，含「贴镜头 / 裁剪外 / 半径罩住整个视锥 / 贴屏幕边」四个边界例）、
簇表与光索引表的压实结果、溢出停得住、聚光包围球装得下整个球扇形、
64 盏灯的构建耗时、四档档位自洽，外加三条源码契约（补丁顺序 / `highp usampler2D` /
衰减调的是 three 自己的函数）。

浏览器段摆 24 盏彩色点光（**三原色轮转**：地面反照率偏棕，任何非原色都会被它拉偏；
纯原色下 delta 的最大通道与反照率无关，断言才是硬的），逐盏读回它脚下那块地面像素：
簇光开/关的差值要亮、而且亮的是它自己那个通道。同一组灯在 low 档只亮 2 盏
（`EFFECT_LIGHT_COUNT.low`）—— 这条对照就是那道预算线。再验聚光锥内/锥外亮度比、
半影平滑、开关 120 次灯 + 总闸热切不新建 program。

两层调试叠加也**真的挂上去读回像素**：热图要让 144 个采样点全部变色，光源球线框要
写满顶点缓冲，摘掉之后画面**逐点完全还原**（不许把调试色带回正片）。叠加层的
ShaderMaterial 编译失败同样是静默的，热图又用了 `usampler2D` + `texelFetch`，
少写一个 `highp` 就整片不见。

> 逐像素比对前先 `post.SetTaaEnabled(false)`：抖动是逐帧的 Halton 子像素偏移，
> 两帧之间同一个像素本来就不相等。第一版没关，"摘掉叠加层后完全还原"那条被
> 判成 22/144 个点没还原 —— 越亮的地方越明显（半浮点在 20 附近的 ULP 就是 0.016）。

> **摆灯别摆在探针街景的房子里**：房子从 z = −6 排到 −63，x 半宽 3.75-4.5 m，
> 内沿只到 ±1.45 m；沙包工事在 z = −14。第一版把 24 盏摆在「街上」，四列钉进墙体，
> 俯视相机看到的是屋顶不是地面，24 盏一盏都读不到 —— 症状与「簇光没生效」一模一样。
> 测试现在统一用 z > +10 那半边空地（同一张 120×120 地面网格，材质法线 AO 全一样）。

截图：`_shots/ClusteredLights_{burningStreet,night}_{on,off}.png`（14 处火 + 一枚
照明弹 + 一盏探照灯，簇光开/关对照）。
## 17. 物理大气与大气透视（2026-09）

> 接入契约在 §1。这一节是「天空这一块换成了什么、每一个数从哪来、哪些是有意的近似」。
> 代码：`Script_Atmosphere.mjs`（LUT 与采样 GLSL）、`Script_Sky.mjs`（天穹 / 预设 /
> `SKY_RADIANCE_GLSL` / PMREM 烘焙）、`Script_PostComposite.mjs` 的 ApplyFog 段。

### 17.0 换掉的是什么

原来的天是一套美术化的解析式：`mix(zenith, horizon, pow(1−up, 2.6))` + 太阳盘 +
`pow(sunDot, glowSpread)` 的辉光 + 高空烟 + 贴地烟尘带。它的问题不是「不好看」，
是**没有结构**：

- 一条单调渐变。天顶到地平线之间没有任何可读的层次，评分表「远近景有可读的
  雾/大气层次」那一条只能靠雾去凑；
- 太阳周围只有一个 pow 出来的圆晕。真正的前向散射是**整片天**朝太阳那一侧抬起来，
  而且抬的量随 Mie 密度变；
- 黄昏/拂晓的地平线只能靠把 `horizon` 手调成 `[4.20, 2.30, 1.05]` 这种数来模拟，
  于是那一档的天顶到地平线是一条橙棕线，臭氧那条青带根本不存在；
- **雾色是另一套算式**（按视线仰角在 `fog.sky`/`fog.ground` 之间插值，再加
  `pow(sunDot, 8) * sunGain`），和天穹各算各的 —— 远景的颜色与天的颜色对不上号。

### 17.1 方案：Hillaire 2020 的四张 LUT

参考实现是 Sébastien Hillaire《A Scalable and Production Ready Sky and Atmosphere
Rendering Technique》(EGSR 2020)，也就是 UE4.26+ `SkyAtmosphere` 的算法；介质参数与
LUT 参数化沿用 Bruneton & Neyret 2008 / Bruneton 2017 的标准值。

| LUT | 尺寸（high） | 参数化 | 何时算 | 内容 |
|---|---|---|---|---|
| 透过率 | 256×64 | (到大气顶的距离映射, 海拔) | **换预设时一次** | 从 (r, μ) 出发到大气顶的三通道透过率 |
| 多次散射 | 32×32 | (cos 太阳天顶角, 海拔) | **换预设时一次** | 二阶以上散射的等比级数和 Ψ = L₂/(1−f_ms) |
| 天空视图 | 192×108 | (相对太阳的方位, 天顶角；地平线两侧各加密一次) | 相机海拔或太阳天顶角变了才算（见 17.6.1） | 相机高度处的整片天，不含太阳盘 |
| 大气透视 | 32×32×32 → 1024×32 图集 | 视锥对齐 froxel，切片按 √ 分布 | 每帧 | rgb = 沿视线累积散射，a = 透过率均值 |

介质：地球半径 6360 km、大气顶 6460 km；瑞利 (5.802, 13.558, 33.100)×10⁻³ /km、
标高 8 km；Mie 散射 3.996×10⁻³、消光 4.400×10⁻³ /km、标高 1.2 km、g = 0.8
（Cornette-Shanks 相函数）；臭氧 (0.650, 1.881, 0.085)×10⁻³ /km，帐篷分布 10—40 km、
峰在 25 km。滕县城关海拔按 60 m 记，相机高度 = 它 + 世界 Y。

**为什么单位是 km**：大气厚度 100 km、瑞利标高 8 km，而游戏世界是米。全部换算成 km
之后系数表可以直接抄文献，不必自己乘 1e-3 到处飘。

### 17.2 天穹：物理层 + 保留的美术层

`SkyRadiance(dir, sunDiskGain)` 的**签名没变**（探针体 GI 的漏空射线复用同一段 GLSL）。
里面变成：

```
物理：AtmoSkyView(dir)                    ← 天空视图 LUT（瑞利+Mie+臭氧+多次散射）
    + 辉光加成 × uArtGlow                 ← 美术层，出厂 0.25—0.5（LUT 里已有真前向散射）
    + 太阳盘 × AtmoSunTransmittance()     ← 真角直径 0.5357° + 临边昏暗，吃透过率
美术：高空烟／云（fbm）                    ← 原样
    + 贴地战场烟尘带                       ← 原样
    + 地平线以下的地面反照 uGround         ← 原样
    + 星（night）                          ← 原样
```

**美术层为什么全留着**：1938 年三月的滕县打了半个月，天上是有烟的 —— 一片干净的物理
蓝天和一条平渐变一样失真。分工是：**天空视图 LUT 管"这片空气本身散出什么光"，
贴地烟尘带管"天有多脏"**。天空视图 LUT 里刻意**不含**战场霾，两处都放就是双份灰
（那正是 2026-08 那次「白天四张的天全是一块 sRGB 234 的死白」的成因）。

`uAtmoEnabled` 是一个 uniform 分支，不是 define：`?skyLegacy=1` 与画质面板的「物理大气」
开关都走它，**运行时切换不重编译**。旧的 `zenith / horizon / glow / sunSize` 一个都没删
——`?skyLegacy=1` 要用它们做 A/B，水面（`Script_Water`）也仍借
`uZenith/uHorizon/uGround` 当反射底色。

### 17.3 与 GI / IBL 的接线（零改动那一侧）

- **探针体 GI**：`Script_Gi.BuildPasses` 把 `sky.uniforms` 整表拷进 trace 材质，
  拷的是 **uniform 对象本身**。LUT 的采样器与参数一并挂在 `sky.uniforms` 上，
  所以漏空射线自动问同一片天，`Script_Gi.mjs` 一个字没改。回归口 `Script_GiTest`。
- **IBL**：`BakeEnvironment` 仍从天穹烘 PMREM。`SkyDome.Apply()` 里三张静态 LUT 是
  **同步**算完的 —— 慢一帧的话进关第一次烘到的是上一档的天，换时段肉眼可见地闪一下。
- **水面**：只借那五个美术 uniform，不受影响。

### 17.4 大气透视接进 ApplyFog：出厂只供色

`AERIAL_PERSPECTIVE_GLSL` 导出 `vec4 AerialPerspective(vec3 worldPos)`
（rgb = 累积散射，a = 透过率）与 `AerialPerspectiveUv(screenUv, distanceMeters)`。
`BindAtmosphereUniforms(uniforms, atmosphere)` 把那一批 uniform 挂到任何 pass 上。

**`uAtmoAerialMode = 0`（出厂）：消光仍归美术雾，物理大气只供雾色。**

用户对雾有一条定论：「先别动雾」。所以透过率一个字节都不动 —— 那三行
（`1 − exp(−depth·density)` × 高度衰减，钳在 `fog.max`）原样保留，能见度逐米与今天相同。
换掉的只是**雾色**：

```glsl
fogCol = mix(今天的 mix(ground, sky, 仰角) + pow(sunDot,8)*sunGain,
             aerial.rgb / (1 − aerial.a),          // 单位不透明度的平均散射辐射亮度
             uAtmoAerialBlend);                    // 每预设 0.35—0.7
```

`aerial.rgb / (1 − aerial.a)` 与 `fogCol` 同量纲，可以直接混。这样买到的是
**真的前向散射halo、随距离变化的色相、黄昏正确的橙-青分离**，而不是一个 `pow(sunDot,8)`。

`uAtmoAerialMode = 1`（`?aerial=full` 或每预设 `atmosphere.aerialMode: 1`）是完整的
`color × T + S`，仍吃 `uFogMax` 上限（「远处兵的剪影不许更糊」那条硬约束靠它）。
**出厂不开**：它会把能见度整条曲线换成物理的，那是要用户拍板的一次画面变化。

与体积雾代理的分工 —— **2026-09 两边合流之后已经接上了，口径以这一条为准**
（实现在 `Script_PostComposite.ApplyFog` 的 `uFogSource > 0.5` 那一支，
回归口是 `Script_VolumetricsTest` 的「体积雾 × 大气透视接缝」那一组）：

* `uFogSource = 0`（low 档 / 体积雾关掉）：走上面那条，一个字没变。
* `uFogSource = 1`：ApplyFog 绕过上面那条，所以大气透视得在体积那一支里自己接。
  接法是**给远段换色**，不是再加一层雾：froxel 只铺到 `uVolumetricFar`（各时段
  200—300 m），那之后 B3 用同一条解析式高度雾把尾段续上（各向同性 + 美术雾色）；
  合成 pass 把**那一段的颜色**按 `uAtmoAerialBlend` 混向 `AerialPerspectiveUv` 的
  物理散射色，总散射量守恒。远段占多少由两段的物理不透明度算：

  ```glsl
  float farT = VolumetricFarTransmittance(uv);                       // B3 最远切片
  float tailT = exp(-max(dist - uVolumetricRange.y, 0.0) * uFogDensity);
  float farShare = farT * (1.0 - tailT)
                 / max((1.0 - farT) + farT * (1.0 - tailT), 1.0e-4);
  ```

  `farShare` 在 froxel 范围之内恰好是 0，所以近段的光柱与被切断的暗带逐比特不变。
* `uVolumetricFarTransmittance`（标量 uniform）**留着但恒为 1**：合成 pass 用的是
  上面那个**逐像素**的 `VolumetricFarTransmittance(uv)`，比一个全屏常数准。
  第三方材质（粒子 / 水面）要按自己的口径接时，那个标量仍是可用的口子。

**别拿 `fog` 去减 `1 − farT`**：`fog` 走的是 `legacyTransmittance` 那条重映射
（比物理的薄），两个数不同量纲，相减会算出负数、远段当场消失。这条踩过一次。

### 17.5 每预设标定表

标定脚本：`node Taierzhuang1938/Script_AtmosphereCalibrate.mjs`（真浏览器、真 GPU）。

**为什么必须在浏览器里做**：新旧两条天空是同一个着色器里的 uniform 分支，而新的那条要
读四张 GPU 上的 LUT。在 Node 里照着算式重写一份 JS 近似，标定出来的是那份近似。

**一条观察省掉 99% 的 GPU 往返**：天穹的最终辐射亮度对 `skyTint`/`skyFloor` 是**仿射**的
（美术层是 `mix()`，系数与 tint/floor 无关）：

```
sky = A · (LUT · tint + floor) + B
```

所以每个 (mie, rayleigh, groundAlbedo) 组合只要探三次（tint=0、tint=1、floor=1）就能把
A·LUT、A、B 全解出来，之后整段拟合在 JS 里跑。10 档 × 150 个组合，一共约三分钟。

**三个形状参数**（其余都只能整体缩放）：Mie 倍率（天有多白、地平线相对天顶抬多少）、
瑞利倍率（天顶有多蓝；它同时是压平天顶/地平线比最省力的一条 —— 地平线方向早就光学厚了，
抬它只抬得动天顶）、地面反照（亮地面把光反回大气、经多次散射再抬一次天顶）。

**目标函数**：上半球**余弦加权辐照度**（权重 1.0）+ 天顶 / 地平线四向均值 / 太阳侧
（各 0.45）+ 色相（0.25）+ Mie 先验（0.05）。辐照度是主项，因为它正比于 PMREM 烘出来那张
IBL 的量级 —— 「整幅画有多亮」是用户唯一真正敏感的一维（历史事故：「画面为什么这么黑」）。

| 预设 | mie | rayleigh | groundAlbedo | sunIrradiance | skyTint | aerialBlend | 辐照度比 | 天顶 | 地平线 | 太阳侧 |
|---|---:|---:|---:|---:|---|---:|---:|---:|---:|---:|
| testSceneDay | 2.4 | 2.0 | 0.20 | 14.04 | 1.069 / 0.922 / 1.014 | 0.50 | 1.016 | 0.888 | 1.225 | 0.903 |
| whiteboxDay | 1.6 | 2.0 | 0.20 | 18.91 | 1.074 / 0.903 / 1.031 | 0.50 | 1.014 | 0.875 | 1.227 | 0.926 |
| editorClear | 3.6 | 2.0 | 0.20 | 36.05 | 1.401 / 0.973 / 0.734 | 0.60 | 1.002 | 0.929 | 1.022 | 0.934 |
| dusk | 2.4 | 2.0 | 0.55 | 47.17 | 0.904 / 0.894 / 1.238 | 0.50 | 1.015 | 0.993 | 0.991 | 1.004 |
| smokyDay | 5.4 | 2.0 | 0.20 | 61.17 | 1.110 / 0.915 / 0.985 | 0.50 | 1.003 | 0.940 | 1.111 | 0.986 |
| chuchuanDay | 3.6 | 1.5 | 0.55 | 78.89 | 1.636 / 1.017 / 0.601 | 0.70 | 1.018 | 0.999 | 0.718 | 1.003 |
| overcast | 18.0 | 2.0 | 0.20 | 38.90 | 0.947 / 0.997 / 1.059 | 0.40 | 1.001 | 0.955 | 1.016 | 0.998 |
| burningStreet | 8.0 | 2.0 | 0.20 | 28.13 | 1.358 / 0.910 / 0.809 | 0.45 | 1.004 | 0.915 | 1.073 | 0.998 |
| night | 3.6 | 2.0 | 0.20 | 1.67 | 0.860 / 0.860 / 1.352 | 0.35 | 1.016 | 0.927 | 1.135 | 0.913 |
| dawn | 2.4 | 2.0 | 0.55 | 58.68 | 0.691 / 0.880 / 1.645 | 0.50 | 1.043 | 0.983 | 1.065 | 0.997 |

各档另有 `skyFloor`（见源码）：加在 LUT 采样上的常数，上限压在上半球均值的 25%。
夜档它是气辉 + 星光（模型本来就不含）；白天档它补的是「手调的那张天比物理的平」那一份。

**三条读得出来的账**：

1. **辐照度全部落在 ±5%**。天变了，IBL 的量级没变 —— 灰卡基线
   （`Script_TestSceneLightingTest`）四个方位 88.5 / 95.3 / 85.3 / 66.6，仍在 (45, 190) 的
   窗口里、最大最小比 1.43 < 2.5。
2. **天顶普遍暗 6—12%、地平线普遍亮 2—23%**。这不是拟合没收敛，是物理天空**本来就该**
   这样：水平视线的光学厚度是竖直的十几倍。逼这两项也进 ±15% 等于把物理模型重新拟合成
   旧模型 —— 那正是这一轮要买掉的东西。所以 `Script_AtmosphereTest` 对这三项给的是 ±40%
   的软闸（只拦「整档跑飞」），硬闸只压在辐照度上。
3. **`rayleigh` 被拟合顶到 2.0**（网格上限）。手调的天比真实的天平，而抬瑞利
   （在地平线方向已经光学厚、在天顶还没有）是压平天顶/地平线比最省力的一条。
   它在这里是**形状参数不是物理密度**，别当成「这颗星球有两倍大气」。

**物理平行光推荐值**（`atmosphere.physicalSun: true` 才生效，**出厂全部 false**）。
颜色 = 太阳方向透过率归一化到最亮通道；强度 = 现值 × 亮度比／0.72：

| 预设 | 物理推荐 | 现值（手调） |
|---|---|---|
| testSceneDay | #fff4e3 × 3.76 | #fffaf0 × 3.20 |
| whiteboxDay | #fff3e0 × 4.39 | #fff3df × 3.80 |
| editorClear | #fff4e4 × 7.83 | #ffe8cc × 6.60 |
| dusk | #ffd9a5 × 6.76 | #ffb072 × 8.80 |
| smokyDay | #fff4e3 × 10.12 | #ffe6c4 × 8.60 |
| chuchuanDay | #fff4e4 × 7.83 | #ffe8cc × 6.60 |
| overcast | #fff2de × 1.83 | #f0f2f5 × 1.60 |
| burningStreet | #fff3e0 × 8.77 | #ffbb80 × 7.60 |
| night | #fff0d8 × 0.46 | #9fb4e8 × 0.42 |
| dawn | #ffd69f × 6.01 | #ffc890 × 8.20 |

**建议**：白天四档（testSceneDay / whiteboxDay / editorClear / chuchuanDay）可以直接翻开
——物理值与手调值差 10—20%，色相几乎一样。**黄昏与拂晓不要翻**：`dusk` 手调的
#ffb072 与 `dawn` 的 #ffc890 是刻意压过的橙，物理推导给的 #ffd9a5/#ffd69f 明显偏白
——真实的低太阳确实没那么橙（那份橙一半来自散射而不是直射），但那是这两档形体分层的全部
来源（见 `SKY_PRESETS` 里太阳仰角那段长注释）。`night` 更不能翻：那盏"太阳"其实是月亮，
物理推导按日光算，会把冷蓝月光变成暖白。

### 17.6 画质分档

`Data_Tuning_Graphics` 的 `atmosphere` 位四档**全开**：透过率与多次散射只在换预设时算
一次，每帧的账只有天空视图与大气透视两张。LUT 分辨率不在那张表里，跟 `?quality=` 走
（`Script_Atmosphere.ATMOSPHERE_TIERS`）—— 它是构造期的靶尺寸，和 MSAA 采样数同一类，
热切没有意义。

| 档 | 透过率 | 多次散射（方向数×步数） | 天空视图（步数） | 大气透视（步数） |
|---|---|---|---|---|
| low | 128×32 | 16×16（4²×12） | 96×54（14） | 16³（6） |
| medium | 256×64 | 32×32（6²×16） | 128×72（22） | 24³（8） |
| high | 256×64 | 32×32（8²×20） | 192×108（32） | 32³（10） |
| ultra | 256×64 | 32×32（8²×24） | 192×108（40） | 32³（14） |

画质面板「大气」组：**物理大气**总闸（关掉 = 旧解析天空）+ **烟霾倍率**
（乘在每档预设的 Mie 上）。两者任一变了 `ApplyGraphics` 都会重烘 IBL ——
`scene.environment` 是从天穹烘出来的，天换了 IBL 不换就是「天亮了屋里没亮」。

**关掉总闸要摘两处**：`uAtmoEnabled`（天穹退回解析式）与合成 pass 的
`uAtmoAerialBlend`（雾色退回美术式）。只摘前一处的话 LUT 不再更新、而合成仍按
blend 混一张**冻在上一帧**的散射图 —— 表现是「关了开关雾色还跟着走」。
`AtmospherePass.Prepare` 跑在 `Enabled` 之前，摘干净这件事就写在那里。

### 17.6.1 每帧的账（实测）

1600×900 / high / `?phase=1`，运行时剖析器逐段 A/B/A/B 交替、各 518 帧取均值再取中位数：

| GPU 段 | atmosphere=on | atmosphere=off | Δ |
|---|---:|---:|---:|
| **atmosphere** | 0.136 / 0.157 ms | — | **+0.15 ms** |
| composite | 0.223 | 0.240 | −0.02（噪声；大气透视多两次纹理取样） |
| 其余各段 | —— | —— | 全部落在 ±0.3 ms 的本底噪声里 |

**这一笔本来是 0.4—1.2 ms**：天空视图 LUT 原来每帧无条件重算，占了 atmosphere 段的
六成。它只有两个自变量（相机海拔、太阳天顶角），而本作的太阳一关之内不动、相机海拔
是米级变化（大气标高 8 km）—— 改成脏标记（阈值 2 m / 1e-5）之后正常游玩里它每关只算
个位数次。大气透视那张是视锥对齐的，必须每帧重算，剩下的 0.15 ms 基本就是它。

透过率与多次散射两张只在 `SkyDome.Apply()` 里算（换关 / 换时段 / 调烟霾倍率）。
探针页 `gl.finish()` 同步实测（high 档）：`RenderStatic` 0.050 ms、
`RenderSkyView` 0.033 ms、`RenderAerial` 0.030 ms、`SkyDome.Apply()` 全套 0.220 ms
（后者含 uniform 装配）。与 PMREM 烘焙（10—20 ms）在同一趟里，感知不到。

**LUT 生成着色器的循环上界是 int uniform 不是常数**，这一条是有意的：常数上界会被驱动
整段展开，多次散射那一份展开出来是 8×8×24 = 1536 个带纹理取样的循环体，编译一次要
几百毫秒到几秒 —— 而这一整套正是在**进关那一趟**编的（§16 那笔账）。
GLSL ES 3.00 允许非常量上界，用它。

### 17.7 已知的近似（都是有意的，别当 bug 修）

- **大气透视 alpha 只存透过率的三通道均值**（Hillaire 的口径）。逐通道透过率要三张图，
  在本作 3 km 的视距上色差小于半个色阶，不值那份带宽。
- **froxel 只覆盖到 `aerialFarM`（出厂 4 km）**。更远的地形（`FarLand` 铺到 2.9 km）
  在范围内；再远就钳在最后一片。
- **天空视图 LUT 不含战场霾**。霾只进大气透视 LUT（那是"穿过霾看地物"），
  天上那层由美术烟尘带负责。两处都放就是双份灰。
- **多次散射只保留各向同性项**（Hillaire 的核心近似）。二阶以上的相函数信息丢掉了，
  换来的是一张 32×32 的表就能让黄昏地平线不死黑、阴天"越厚越均匀地亮"。
- **`rayleigh` / `groundAlbedo` 是拟合出来的形状参数**，不是这颗星球的真实值（见 17.5）。
- **消光出厂仍归美术雾**（17.4）。物理接管消光的那条路实装了、可切换、有测试，
  但不出厂 —— 那是一次要用户拍板的画面变化。
- **相机高度只影响天空视图 LUT**，大气透视 froxel 逐格按世界 Y 取密度（那一条是准的）。
- **水面的反射底色仍走美术 uniform**（`Script_Water` 借的是 `uZenith/uHorizon/uGround`
  那三个，不是天空视图 LUT）。护城河与荆河在画面里都只占很小一块，而接过去要在水面
  着色器里再编一份 LUT 采样；留作后续。
- **粒子层的雾仍是解析雾**（`Script_Vfx.SetFog(preset.fog, ...)`）。出厂档消光本来就归
  美术雾，两边一致；等哪天 `aerialMode` 翻成 1，粒子层要跟着换成 `AerialPerspectiveUv`。

### 17.8 调试视图

Debug Rendering 浮窗新增「大气」组六项（`Script_EditorDebugRendering.VIEWS`）：

| 视图 | 看什么 |
|---|---|
| 透过率 LUT | 天顶方向（左上）接近白、掠地平线（右下）明显偏红 —— 瑞利 λ⁻⁴ 的直接证据 |
| 多次散射 LUT | 横轴太阳天顶余弦、纵轴海拔。阴天与黄昏地平线不死黑靠它 |
| 天空视图 LUT | 相机高度处的整片天。地平线两侧各加密一次，所以中间那条横线是地平线 |
| 大气透视 LUT | froxel 图集，越靠右越远 |
| 大气透视 散射 | **屏幕空间**：拿预通道重建世界坐标再问一次 `AerialPerspective()` |
| 大气透视 透过率 | 同上，深蓝 = 全通（近处），暖黄 = 被吃光（远处）。**贴脸出现暖黄就是 froxel 切片对错位了** |

后两张与合成 pass 问的是同一个函数、同一批 uniform —— 它们能证明 froxel 真的对上了像素。

---

### 17.9 怎么验

```bash
node Taierzhuang1938/Script_AtmosphereTest.mjs            # 四张 LUT + 十档标定 + 能见度闸
node Taierzhuang1938/Script_AtmosphereTest.mjs --shot     # 再出 14 张 A/B 对照图
node Taierzhuang1938/Script_AtmosphereCalibrate.mjs       # 重标定（不改源码，只打表）
node Taierzhuang1938/Script_GiTest.mjs                    # 漏空射线仍问同一片天
node Taierzhuang1938/Script_TestSceneLightingTest.mjs --scenes   # 灰卡基线
node Taierzhuang1938/Script_PostFrameGraphTest.mjs        # 帧图顺序（atmosphere 排第一）
```

`Script_AtmosphereTest` 的三个阈值分别在守什么，写在那个文件的抬头 —— 改阈值之前先读它。

---

## 17. 材质着色升级（2026-09）

> 这一节是**表面着色**的现状（§11 是烘焙侧的旧稿，仍然成立）。
> 解决的是一句实拍评语：**「表面像塑料贴纸，近景缺凹凸与微阴影」** ——
> 材质有法线贴图、有粗糙度变化，但法线贴图**不遮挡自己**，斜射光下砖缝里
> 没有阴影，一米内看没有比一米外多出任何东西。

### 17.1 五件事与它们对标的实现

| 这里 | 对标 | 落在哪个锚点 | 有意的近似 |
|---|---|---|---|
| **视差遮蔽 POM** | 陡视差 + 二分细化（Tatarchuk 2006 / UE 的 `ParallaxOcclusionMapping` 节点） | `<clipping_planes_fragment>` | TBN 从**屏幕导数**现算（与 three 的 `getTangentFrame` 同一算式），不给静态几何烘切线属性 |
| **细节法线** | UDN 混合（Barré-Brisebois & Hill 2012） | `<normal_fragment_maps>`（**新锚点**） | 只把细节的切线空间 xy 加到已扰动法线上，不重建 z |
| **微阴影** | Chan 2018《Material Advances in Call of Duty: WWII》 | `<lights_fragment_end>` | 用**主平行光**的 NdotL 压全部直射项，不逐光源算 |
| **地平线镜面遮蔽** | Lagarde / Frostbite `horizonOcclusion` | `<lights_fragment_maps>` | 无 |
| **皮肤预积分 SSS** | Penner 2011 + 轻微 wrap | `<lights_fragment_end>` | 曲率从屏幕导数估；散射半径按美术量级放大（下详） |

代码在 `Script_MaterialShading.mjs`（GLSL 与补丁工厂）、`Data_Tuning_Materials.mjs`
（逐配方数值，纯数据）、`Script_TexBake.mjs`（细节法线 / 皮肤 LUT / 污渍层的烘焙）、
`Script_Materials.mjs`（谁编哪几路 + 外部 GLB 材质分类与换类）。
补丁在注册表里的位置固定为 **ORM → AO → GI → CSM → SSR → 簇光 → 材质着色 → 破口**（§1.8）。

### 17.2 POM：三条必须知道的实现细节

**① uv 是靠「局部变量遮蔽 varying」改的。**
r185 把每张贴图的 uv 拆成了各自的 varying（`vMapUv` / `vNormalMapUv` /
`vRoughnessMapUv` / `vMetalnessMapUv` / `vAoMapUv`），而 `#version 300 es` 里
varying 是 `in`，**只读**。所以在 `main()` 里声明同名局部量把它们一次性接管：

```glsl
vec2 gMatPomUv = vNormalMapUv;   // 先存原值（此处还是 varying）
{ ...行进 + 二分细化，写 gMatPomUv... }
#ifdef USE_MAP
vec2 vMapUv = gMatPomUv;         // 从这里往下，所有 chunk 采样的都是位移后的 uv
#endif
```

顺序不能反：`vec2 vMapUv = vMapUv + d;` 在 GLSL 里是自引用，行为未定义。
`<clipping_planes_fragment>` 是片元 `main()` 里唯一早于 `<map_fragment>` 的锚点，
所以 POM 只能挂在那儿。ANGLE-D3D11 实测通过（读回像素验证：把条纹图偏移半个平铺，
颜色确实换了），零 GL 错误。

**五张 uv 必须一起位移**，少遮一张就是「颜色错位了但粗糙度没错位」。
顺带澄清一条旧注释：`aoMap` 在 r185 里走的是 `texture.channel`，缺省 0 = `uv`，
不是 `uv1`（本项目的 ORM 三槽同一张图、同一套 uv，所以能一起遮蔽）。

**② 深度以「米」给，uv 换算是现算的。**
`Data_Tuning_Materials.SURFACE_RECIPES[*].pomDepth` 是**米**（青砖灰缝 16 mm、
瓦垄 24 mm、门板企口 6 mm）。着色器按屏幕导数现算「一米有多少 uv」：

```glsl
float pomUvPerMeter = max(length(dFdx(uv)) / length(dFdx(viewPos)),
                          length(dFdy(uv)) / length(dFdy(viewPos)));
```

两个方向取大的：掠射面上有一个方向的导数会趋近 0，只取一个方向深度会发散。
这样换 `repeat`、换物体缩放都不用重调数字。单步位移仍要封顶
（`POM.maxUvPerStep`）—— uv 导数在接缝与极端拉伸处会炸，不钳的话一个像素能跑穿整张图。

**③ 高度取自法线贴图的 A 通道**（`HeightToNormal` 写进去的）。外部下载的法线图
若没有 alpha（webp 无 alpha → 恒 1），`hgt = 1 − 1 = 0`，第一次判定就退出、uv 一动不动
—— **失败模式是「没有 POM」而不是「乱码」**，这是有意选的。

步数按档位（`Data_Tuning_Graphics`）：low 0（不编）/ medium 8 / high 16 / ultra 32，
命中后再做 4–6 次二分细化（只线性行进的话砖缝立面上是一格一格的台阶）。
掠射角加权：正对表面只用 45% 的步数。距离 9 m 起淡出、15 m 完全退回普通法线贴图。

**只给静态场景材质。** 人物、枪械、道具是 atlas UV，`pomDepth` 一律 0。

### 17.3 微阴影为什么挂 `<lights_fragment_end>` 而不是 `<aomap_fragment>`

r185 的片元 `main()` 里顺序是 `lights_fragment_end` → `aomap_fragment`，
而 GI 补丁的调试视图 10/11（直射漫反射 / 直射镜面）是在 `<aomap_fragment>` 上抓的。
挂在它后面的话，面板读到的是**没压过**的直射项，与正式画面不一致。
§1.8 的锚点表已按这条更正。

式子是 Chan 的原式：`aperture = 2·ao²`，`shadow = saturate(|NdotL| + aperture − 1)`。
`ao = 1`（完全开阔）时 aperture = 2，式子恒为 1 —— 平整表面一点不受影响，
只有 ao < 1 的砖缝 / 木纹 / 瓦垄才在斜射光下压出细阴影。

### 17.4 皮肤：为什么 LUT 的轴是「散射半径（毫米）」而不是几何曲率

d'Eon 六高斯剖面最宽一支方差 7.41 mm²（σ≈2.7 mm）。**照几何半径直接查**，
一颗 90 mm 的人头上散射只摊开 2.7/90 ≈ 0.03 弧度 —— 物理上没错（真人脸上那圈红边
确实只有几毫米宽），但在游戏分辨率下落到三四个像素，实测**与纯 Lambert 差不到一个色阶**，
接上了等于没接。所有做预积分皮肤的引擎都在这里放大一次（UE 的 `WorldUnitScale`、
Penner demo 的曲率轴），本项目的放大量是 `SKIN.radiusScale = 22`：
人头曲率 ≈ 11 /m → 散射半径 ≈ 4 mm，落在剖面真正起作用的那一段。
**这是有意的美术放大，不是 bug。**

另外两条：
- **LUT 的积分步长必须细到能采到最窄那支高斯**（σ≈0.08 mm）。Penner 原文的
  `inc = 0.05` 在这个半径量程下会让 `a = 0` 那一个样本独吞全部权重，
  LUT 退化成一张纯 Lambert（踩过）。现在是 1200 步 + 一张 4096 格的剖面查找表。
- **加的是「预积分 − Lambert」的差**，不是整项替换：替换会把 three 已经算对的
  阴影、光色和其余光源一起吃掉。差值乘 `getShadow()` 与光色再加回 `directDiffuse`。

曲率由屏幕导数估：`length(fwidth(geometryNormal)) / length(fwidth(viewPos))`，单位 1/米。

### 17.5 人物 / 枪械：外部 GLB 材质的分类与换类

按**材质名**分类（`Data_Tuning_Materials.EXTERNAL_MATERIAL_CLASSES`，顺序
皮肤 → 金属 → 布）。为什么按名字：卢沟桥那十套人物是混合 atlas，一个网格里同时有脸、
军装和头发，几何上分不开，能分开的只有材质名。**命中不到就什么都不做** ——
宁可少一层绒光，也不要把眼球或刺刀误判成棉布。

- **布**（军装 / 棉衣）→ 换成 `MeshPhysicalMaterial`，`sheen = 0.55`、
  `sheenRoughness = 0.72`、`sheenColor` 取布色去饱和后往白提（纯白绒光像蒙了塑料膜，
  完全用布色又等于只是整体提亮）。
- **金属**（枪管 / 刺刀 / 刀）→ 换类 + `anisotropy = 0.5`、`anisotropyRotation = 0`
  （沿切线 U，也就是枪管方向）、粗糙度下限 0.28（全镜面时高光只是一个点，看不出方向）。
  切线由 three 的 `getTangentFrame` 从屏幕导数补，不需要几何切线属性。
- **皮肤** → **不换类**：预积分散射是自己的补丁，用不到任何 Physical 字段，
  换类只会白吃一份 `PHYSICAL` 程序（`IOR` + `USE_SPECULAR` 两段）。

换类要拿到**网格**才做得了（换类等于换对象，得挂回 `mesh.material`），所以
`ConfigureExternalPbr(material, { …, mesh })` 多了一个 `mesh` 形参；四个调用点
（`Script_CharacterModel` / `Script_RiggedModel` / `Script_FirstPersonBody` /
`Script_Viewmodel`）都交出了网格。同一份源材质**只换一次**并记进对照表 —— 那些材质
由加载器缓存共享，逐网格各换一份等于逐网格一份程序（换人那一帧要现编几十个）。

**已知缺口：外部件不吃细节法线。** 它们是 atlas UV，一份 uv 摊在整个身体上，
再乘 10 倍平铺只有二十厘米一个循环 —— 那不是微表面，那是花布。要给人物加细节法线，
得先有一套按世界尺度走的 uv（或走三平面）。

### 17.6 defines 是**写进材质本身**的（本轮最隐蔽的一个坑）

three 的 `material.onBeforeCompile(parameters)` 里 `parameters.defines === material.defines`
（同一个对象），补丁注册表的 `Object.assign(shader.defines, patch.defines)`
因此是**写进材质本身**的。把某一位从 `patch.defines` 里拿掉**不会**让它从材质上消失：

> 症状：画质面板关掉 POM，画面一点没变。而 cache key 已经换了、`renderer.info.programs`
> 也真的多了一个、`material.needsUpdate` 也确实生效了 —— 从任何一个中间量都看不出问题。

所以本路补丁在 `uniforms` 回调里先把自己的九个 define 全部 `delete` 一遍，
再由注册表按当前的 `patch.defines` 重写。**任何做「运行时可关」的材质补丁都要照做。**
回归口：`Script_MaterialUpgradeTest` 的每一条开/关对照。

### 17.7 档位、面板与调试视图

`Data_Tuning_Graphics.QUALITY_PRESETS`：

| 档 | pom | pomRefine | pomSelfShadow | detailNormal | microShadow | horizonOcclusion | skinSss | materialTexture |
|---|---|---|---|---|---|---|---|---|
| low | 0（不编） | 0 | 否 | 否 | 是 | 是 | 否 | 256 |
| medium | 8 | 4 | 否 | 是 | 是 | 是 | 是 | 512 |
| high | 16 | 5 | 否 | 是 | 是 | 是 | 是 | 512 |
| ultra | 32 | 6 | **是** | 是 | 是 | 是 | 是 | 1024 |

low 保留微阴影与地平线遮蔽：它们各只有几条算术，却是「表面不像塑料贴纸」里最便宜的两条。
`materialTexture` 是烘焙基准边长；砖类照旧翻倍，但 `Script_TexBake.MAX_BAKE_SIZE`
把单张封在 1024²——ultra 不封顶的话是八个砖配方 × 三张 2048² = 四百多 MB 显存。

画质面板「材质细节」一组：六个 Toggle（编译期，翻一次整场重编译几百毫秒，
与阴影总闸、GI 采样层同一先例）+ 五根倍率滑杆（运行时，拖了立刻生效）。
出厂值从画质档拷进 `graphics`（与 `taa` 同款写法），「恢复出厂」按当前档重取。

Debug Rendering 新增「材质细节」一组四张取证图（`?matView=1..5` 直连）：

| 视图 | 看什么 | 关掉对应开关时 |
|---|---|---|
| 视差位移 | uv 被推了多少**屏幕像素**（纯红斜坡，绿蓝恒 0） | 纯黑 |
| 视差高度 | 命中点在高度场的哪一层（白 = 砖面，黑 = 缝底） | 纯白 |
| 细节法线 | 切线空间扰动量（中灰 = 无扰动） | 中灰 |
| 微阴影 | Chan 的遮蔽因子（白 = 不压） | 纯白 |
| 皮肤曲率 | 进 LUT 的那一轴（红 = 尖） | 黑 |

它走**自己的** `uMatDebugView`，与 GI 那一包的 `uGiDebugView` 各用各的 —— 两条注入链
是分开的补丁，共用一个编号的话关掉 GI 的档位连视差图都看不了。

### 17.8 与其它渲染子系统的接口

- **GTAO 代理**：地平线镜面遮蔽（本节）与弯曲法线镜面遮蔽是**两件不同的事**。
  前者裁的是「法线贴图把反射向量掰到几何面之下」，只用本像素的两个法线，纯局部；
  后者裁的是「周围几何挡住了多少环境光」，要屏幕空间信息。两者各乘一次 `radiance`，
  可以叠加，**不要合并成一项**。
- **预通道（`Script_PostPrepass`）不跑材质补丁**（它用覆盖材质），所以
  **POM 的位移不进预通道** —— GTAO / SSR / 接触阴影看到的是**未位移**的表面。
  这是接受的近似：位移量最大只有两三个像素，而那三条消费方的空间尺度都在十像素以上。
  真要修得给覆盖材质也编一份 POM（预通道成本翻倍），本轮不做。
- **CSM 代理**：POM 自阴影与皮肤散射都调 `getShadow(directionalShadowMap[0], …)`
  的 r185 六参签名。换级联时若签名变了，这两处要跟着改（`Script_MaterialShading.mjs`
  里搜 `getShadow`）。
- **预热（§16）**：新增的程序变体由 `WarmupShaders` / `WarmActorShaders` 自动覆盖 ——
  材质换类发生在模型加载时（`ConfigureExternalPbr`），预热是在那之后按真实 Actor 出画的。
  不需要另建组合表。

### 17.9 怎么验

```bash
node Taierzhuang1938/Script_MaterialUpgradeTest.mjs [--shot]
```

十九条断言，分三级：源码契约（uv 遮蔽五张、Chan / Lagarde / Penner 的算式、补丁顺序）、
纯 Node（皮肤 LUT 的红移、细节法线不是平图、污渍层真的改了像素、烘焙尺寸封顶）、
真浏览器（探针页 `?scene=materials`）。浏览器那一级的口径：

- **视差**：同一面砖墙、同一机位，POM 开/关两张 BaseColor 图做一维互相关求位移；
  再把相机换到镜像的另一侧重做一遍。**位移必须两侧反号** —— 单侧有位移只能证明
  「图变了」，反号才叫视差。正对表面时位移必须最小。
- **距离淡出**：20 m 外 POM 开/关逐像素几乎相同，而近处差得多。
- **微阴影**：砖墙上的直射漫反射（调试视图 10）均值下降 ≥ 5%，
  且因子图上既有白（平面）又有暗（砖缝）。
- **皮肤**：量的是**多出来的那份光是什么颜色**，不是整条交界带的颜色 ——
  带子上大头是环境光（两张图一模一样），直接比带内 R/G 只能读到万分之一的变化。
  在**线性域**里做差，`ΔR/ΔG` 必须 > 1.04。
- **程序数**：同一条相机轨迹走两遍，第二遍不许再新建 program。

`--shot` 把十二张开/关对照图写进 `_shots/materialUpgrade/`（已 gitignore）。

### 17.9b GPU 成本（实测）

**在探针街景上量，不在正片上量。** 正片这一侧同时跑着 AI / 流送 / 剔除，A/B 两组的
draw call 都不一样（实测 891 vs 921），前提就不成立；而整帧 timer query 在这台机器上
（同时有别的 agent 在跑浏览器测试）噪声是 ±3 ms，要测的量是零点几毫秒。
探针街景是静态的：同一批 draw、同一批状态，唯一的变量就是材质编了哪几路。
一次 query 里连画 32 帧再除以 32（单次外部打断只摊薄 1/32），四档交替各 6 轮取最小值
（GPU 工作量确定，争用只会加时间，min 是真值的最好估计）。

RTX 4070 SUPER / ANGLE-D3D11，**2560×1440 / high / `?scene=street`**，
机位贴着街拍（砖墙占屏近半 —— POM 的最坏情形）：

| 档 | 整帧 GPU | 相对 |
|---|---:|---:|
| 全关 | 2.306 ms | 基线 |
| 细节法线 + 微阴影 + 地平线遮蔽（POM 关） | 2.291 ms | **−0.015 ms**（在噪声里，等于免费） |
| 全开（POM 16 步） | 2.672 ms | **+0.381 ms** |
| 全开 + POM 自阴影（ultra） | 2.846 ms | +0.173 ms（相对全开） |

同一档内六轮的离散度 < 0.11 ms。**POM 16 步 +0.38 ms，在 0.6 ms 的预算内**；
细节法线 / 微阴影 / 地平线遮蔽三项加起来量不出来（各只有几条算术，没有额外采样
—— 微阴影那一次取样 2026-09 集成期已并进 ORM 那一次，一次取样都没多）。

CPU 侧不变：材质补丁不新增 draw call（`calls` 348 / 348），也不新增每帧上传。

**人物 Physical 变体的增量**：`Script_RespawnShaderWarmTest` 全绿 —— 进关预热
`programs 9 → 132`，之后连死三次 `programs 139 → 139`，全部模型号摆到镜头前
再转一圈仍 `programs 142`，一个都不新建。换类没有把预热覆盖不到的变体带进来。

### 17.10 已知缺口（都是有意的，别当 bug 修）

1. POM 不进深度法线预通道（见 17.8）。
2. 外部 GLB（人物 / 枪械）不吃细节法线（见 17.5）。
3. 微阴影用主平行光的 NdotL 压**全部**直射项，不逐光源算 —— 室内被火光照到的
   砖缝，微阴影是按太阳方向算的。逐光源要改 three 的 `RE_Direct` 本体。
4. POM 自阴影只有主平行光一路，且只有 ultra 编进去。
5. 布料绒光只有换了类的那些材质有；`MaterialLibrary.Get()` 出来的程序化布
   （`ClothNra` / `ClothIja`，旗面与背包用）仍是 `MeshStandardMaterial`。

---

## 17. 体积雾 / 体积光（froxel，2026-09）

> 2026-09 这一轮有八个并行子系统各自往这份文档追加章节，**节号会撞**。
> 认文件名不认节号：本节对应 `Script_PostVolumetrics.mjs`。

`Script_PostVolumetrics.mjs` / `Data_Tuning_Volumetrics.mjs` / `Script_VolumetricsTest.mjs`。
出厂 medium 及以上开；low 保留合成 pass 里的解析式高度雾（fallback 路径永久保留）。
**旧的 §6.2 是设计期草案，没有实装。**

### 17.0 一句话：不是换了一套雾，是把同一套雾的散射项拆开按位置着色

今天的解析雾：`out = mix(color, fogCol, fog)`，`fog = clamp((1-exp(-d·ρ))·hFall, 0, max)`。
体积雾：`out = color·T + ∫σ_s·L·T(t)dt`。均匀介质、`L = fogCol`、反照率 1 时那个积分
**恰好等于** `fogCol·(1-T)`，而 `T = 1-fog` —— 两条式子同一个答案。

所以 froxel 体积雾在本作里的定位是：把 `fogCol` 从「整条视线上的一个常数」变成
「逐 froxel 着色」。晒得到太阳的 froxel 多一份 HG 前向散射（**光柱**），
被墙挡住的没有（**光柱被几何切断**），火与照明弹周围的多一份点光散射。
雾的**量**不变，变的是雾**在哪儿亮**。

这条等价关系是整个模块的校准锚点，`Script_VolumetricsTest` 逐像素验它。

### 17.1 文献与对应关系

| 出处 | 这里怎么用的 | 有意的偏离 |
|---|---|---|
| Wronski, *Volumetric Fog: Unified Compute Shader Based Solution to Atmospheric Scattering*（AC4, SIGGRAPH 2014） | froxel 网格 + 注入/积分两趟 + 时域重投影 | 没有 compute shader（WebGL2 没有）：网格平铺成 2D 图集，两趟都是全屏 blit |
| Hillaire, *Physically Based and Unified Volumetric Rendering in Frostbite*（SIGGRAPH 2015） | 解析切片积分 `S·(1-exp(-σ·dz))/σ`、散射/消光分离、局部雾体 | 单次散射，没有多次散射近似；相函数只有 HG 一项 |
| UE *Volumetric Fog* | 指数深度分布、0.9 历史权重、局部雾体 + 局部光进雾 | 没有体素化的间接光（本作的 GI 是探针体，不进雾）；阴影只有太阳一盏 |
| Henyey & Greenstein 1941 | 相函数 | 按**峰值**归一（`uPhase.y = (1-g)²/(1+g)`），让 `sunGain` 的口径与今天的 `pow(cos,8)·sunGain` 峰值相同 |

### 17.2 帧内位置

帧图里是**三行**（profiler 逐段归账才看得出钱花在哪），插在 `main` 之后、
`wireframe` 之前：

```
 prepass → hzb → ssao → main
   → volumetricInject → volumetricIntegrate → volumetricApply        ← 本节
   → wireframe → debugOverlay → taa → godPrepare → bloom → god
   → composite → fxaa
```

排在 `main` 之后是因为注入那一趟要采**本帧**的太阳阴影图，而阴影是 three 在第一次
`renderer.render` 里烘的。它不读场景颜色（只读预通道的法线深度靶），所以放在 TAA
之前之后都行；挑这里是为了让「关掉体积雾」在剖析器里干净地少三行。

**屏幕空间太阳拖影（`god`）在体积雾开着时一律不给**（`Script_Main.RenderScene` 的
`godStrength` 那一行）：两者叠加是双份前向散射，而径向模糊不认遮挡 ——
光柱被建筑切断的那条线会被它重新糊回去。low 档是它保留下来的唯一场合。

### 17.3 图集布局

froxel 网格存成一张 **2D 图集**（切片平铺），不是 `Data3DTexture`：WebGL2 的 FBO
一次只能挂 3D 纹理的**一层**，逐层 `setRenderTarget` 就是 z 次 draw call（high 档 64 次），
而本作的瓶颈正是 CPU 提交（~15 ms/帧）。平铺之后注入与积分各只要一次全屏 blit。

| 档 | froxel | tile 平铺 | 图集 | RGBA16F 显存（×3 张） |
|---|---|---|---|---|
| low | —（解析雾） | — | — | 0 |
| medium | 120×68×48 | 8×6 | 960×408 | 3.1 MB ×3 |
| high | 160×90×64 | 8×8 | 1280×720 | 7.4 MB ×3 |
| ultra | 240×135×96 | 12×8 | 2880×1080 | 24.9 MB ×3 |

三张 = 注入乒乓两张（时域重投影的历史）+ 积分一张。另有一张全分辨率 RGBA16F
的 `volumetricFog`（apply 的输出，Composite 的 `uFogScatter`）。

深度切片按**指数**分布：`depth(t) = near·(far/near)^t`，`t = (k + jitter)/NZ`。
积分图集里切片 k 存的是 **0 到它远边界 `b(k+1)`** 的积分，所以采样下标要 −1。
**双线性不许跨 tile 渗色**：`VolAtlasUv` 把 cell uv 夹在 tile 内半纹素。

### 17.4 uniform 与对外接口

| 名字 | 谁产出 | 谁消费 |
|---|---|---|
| `uFogScatter`（全分辨率 RGBA16F：rgb = 绝对散射亮度，a = 透过率）+ `uFogSource = 1` | `volumetricApply` | `Script_PostComposite.ApplyFog` |
| `post.targets.volumetricScatter` / `volumetricIntegrated` / `volumetricFog` | 本模块 | 调试面板、集成方 |
| `VOLUMETRIC_SAMPLE_GLSL` + `BindVolumetricUniforms(uniforms, pass)` | 本模块 | 粒子 / 水面 / 透明件按**自身世界坐标**取同一份雾：`vec4 SampleVolumetricFog(vec3 worldPos)` |
| `VolumetricFarTransmittance(vec2 uv)` | 同上那块 GLSL | **物理大气代理**：体积雾覆盖 0..`far`，把 aerial perspective 乘上这个值即可。apply 在最远切片处**没有把透过率硬归零**，就是为了留这个接口 |
| `post.volumetricsPass.AddFogVolume / UpdateFogVolume / RemoveFogVolume` | 玩法侧 | 烟幕、炮击烟、着火房屋的热烟、河面薄雾 |
| `SunShadowVisibilityCheap(vec3 worldPos)` | **CSM 代理**（未落地时本模块自带 `#ifndef SUN_SHADOW_HAS_CHEAP` 的 fallback） | 注入那一趟 |
| 局部点光列表 | `LightRig`。三选一按「灯多的优先」：① `GetClusterLightData().lights[]`（**簇状多光源**，世界坐标 + 已乘强度的线性色 + 半径，按镜头贡献排过序）② `fireLights` + `muzzle`（今天的定长灯池，零分配）③ `GetEffectLightState().active`（兜底） | 注入那一趟，取前 `MAX_VOLUMETRIC_LIGHTS`（8）盏 |

Composite 侧只动了 `ApplyFog` 一段：体积路走**加法**（`color·T + scatter`），
解析路仍走 `mix`（`scatterAdd` 恒 0，逐比特不变）。反过来做
（`scatter/(1-T)` 反推 fogCol 再 mix）在 `T→1` 的近处会除零炸成白斑。

**`uFogSource` 只有一个仲裁点**：`VolumetricsPass.Prepare`（关掉 / 还没产出图时归零）
与 `RenderApply`（真的产出图之后置 1）。别的模块一个字都不许写它 —— 两边各写一次的
下场是「关了开关画面还在雾里」或者「开着却在读一张陈旧的散射图」。

#### 与物理大气的接缝（2026-09 B3/B4 合流）

froxel 铺到 `uVolumetricFar` 为止（各时段 200—300 m），那之外的空气归 B4。合成 pass
把远段那一份的**颜色**换成 `AerialPerspectiveUv(uv, dist)` 的物理散射色，权重是
`uAtmoAerialBlend × farShare`，`farShare` 由 `VolumetricFarTransmittance(uv)` 与同一条
解析式的尾段透过率算出来（式子见「物理大气与大气透视」那一节的「与体积雾代理的分工」）。

三条性质，都在 `Script_VolumetricsTest` 的接缝那一组里钉着：

* **换色不加能量**：先除以各自的不透明度还原成单位散射亮度，混完再乘回 `fog`。
  所以透过率、雾量、70 m 能见度一个字节都不动 —— 与用户定论「先别动雾」一致。
* **只动远段**：`farShare` 在 froxel 范围内恰好是 0，权重为 0 时那几行一个乘除都不做。
  实测（chuchuanDay + 600 m 平板）：关掉大气后 600 m 那 4.36 万个像素 95.8% 都变了
  （均差 8.9/255），froxel 范围内的近景 99.3% 逐比特不变
  （剩下的 0.7% 是泛光与 SSR 这两个屏幕空间效果从远景渗过来的，均差 < 0.01）。
* **雾大的时段本来就看不见大气**：smokyDay 的近段 280 m 已经吃掉九成六的光，
  `farShare` 只有百分之二 —— 这是对的，不是接线没接上。验接缝要用 chuchuanDay。

### 17.5 三条硬约束（用户定论「先别动雾」）

七十米外能不能看见敌人由雾决定。**体积雾增加的是近处光柱与空气层次，不是能见度损失。**
三道闸，缺一不可：

1. **噪声只做减法**：`σ *= 1 - noiseAmount·fbm`（fbm∈[0,1]）。最浓的 froxel
   恰好等于基础密度，绝不会比今天更浓。噪声还在 `noiseFar`（默认 95 m）之外淡出，
   远景严格按基础密度走。
2. **`densityScale ≤ 1`**，逐预设算出来的（`Data_Tuning_Volumetrics` 里每一行都有）：
   解析雾是 `(1-exp(-ρd))·hFall`（高度因子按**着色点**乘在整段上），物理积分是
   `exp(-∫ρ·hFall(y)ds)`，两者只在 `y = fog.base` 处相等，眼高处物理式略浓；
   densityScale 就是把那点差补回来的系数。
3. **`legacyTransmittance`（出厂 true）**：apply 那一趟把**透过率**换回今天那条解析式，
   只把**局部雾体多出来的**光学厚度乘上去。于是「同一像素的雾不透明度 ≤ 今天」是
   **逐像素恒等式**，不是靠调参保证的。烟幕、热烟仍照常挡视线 —— 它们本来就该挡。

关掉第 3 道闸（走纯物理）时，第 1、2 道仍保证眼高 ~2.6 m 以内、70 m 处的透过率
不低于今天。`Script_VolumetricsTest` 的 A 段（纯 Node）逐预设把两个数都算出来对账。

### 17.6 已知的近似（都是有意的，别当 bug 修）

* **单次散射**。没有多次散射近似（Frostbite 那套 `σ_s·albedo^n` 的多重反弹叠加）。
  厚烟里应该有的「烟自己发亮」靠 `albedo` 与局部点光近似。
* **只有太阳投影进雾**。局部点光不投阴影 —— 一盏火在墙那边，雾照样被它照亮。
  簇光代理扩容灯池之后这条不变（阴影预算仍只有太阳一张图）。
* **froxel 只有 `MAX_VOLUMETRIC_LIGHTS` = 8 盏局部光、`MAX_FOG_VOLUMES` = 8 块雾体**，
  按到相机的距离裁。密集炮击时远处的火会被裁掉。
* **`far` 之外是解析尾段**：同一条高度雾闭式（4 点中点积分）续上，只有各向同性项，
  没有光柱。260 m 之外本来也看不出光柱。再远交给物理大气的 aerial perspective。
* **高度雾的积分口径与解析雾不同**（见 17.5 第 2 条）：解析雾把 hFall 按**着色点**
  乘在整段上，froxel 是真的沿射线积分。离地 1 个 falloff 以上的射线（屋顶、城墙、
  飞机）物理版更浓 —— 这是修正不是回归，而且出厂的 legacyTransmittance 把透过率
  钉在今天那条上，只有走纯物理模式才看得到。
* **深度 0 的像素出厂不吃雾**（`skyScale = 0`，与今天逐比特相同）。
  「取最远切片」那条路整套都实装了、也验过（`Script_VolumetricsTest` 把 skyScale 顶到
  1 逐像素对账），画面上确实更好 —— 实测 Probe 街景开了之后地平线白化、屋脊线与天
  之间那条硬边没了，整体均值只降 1.4%–9%，全部落在最亮那两档（天）上。
  **但不能出厂开**：预通道里「深度 0」不只是天空 —— 粒子、烟、水面这些
  `skipNormalDepth` 的东西全在同一个桶里。给这一桶上整整一列 280 m 的雾，
  五十米外那根烟柱就被当成天边的霾；而它自己那份 `AERIAL` 解析雾还照旧在算
  （BootTest 的「粒子层的雾接上了」看的就是它），于是变成双份。
  试过「体积雾在跑时把粒子那份停掉」——**BootTest 七关全红**，那条断言守的正是
  「粒子层的雾必须接上」，不该为了让自己变绿去动它。
  要开 skyScale 得先解决其中之一：让半透明件也有深度（另开一张覆盖靶），
  或者让天穹自己在着色器里吃这份雾（物理大气代理的地盘，
  `VolumetricFarTransmittance()` 就是给它留的接口）。
* **噪声按帧序漂移**（`ctx.frame/60`），不是按真实秒。30 fps 下烟走得慢一半。
  换成秒会让逐轮截图比对失效 —— 决定论优先（本仓库的老规矩）。
* **粒子与半透明件仍走它们自己那份解析雾**（`Script_Vfx` 的 `AERIAL`）。
  上一条已经说明为什么：体积雾不碰深度 0 那一桶，所以两者不会双份，也不会互相冲突。
  `VOLUMETRIC_SAMPLE_GLSL` 已经导出，粒子要换成按自身世界坐标采体积雾随时能接 ——
  换的时候要连着把 `skyScale` 一起想清楚，两件事是同一个问题的两半。
  **水面本来就不在这条里** —— 它虽然也是 `skipNormalDepth`，但 `nd.w` 上留的是
  身后河床的深度（不是 0），照常走 legacy 那条，与今天逐比特相同。
* **时域重投影只做出界降权**，没有做邻域裁剪（TAA 那套 YCoCg AABB）。
  雾是低频量，遮挡变化时会有约 10 帧的拖尾；快速转身时网格边缘会短暂变噪
  （调试视图「体积重投影」看得到）。

### 17.6b 光柱有多强：`sunScale` × `ambientScale` 这一对（**待定夺的美术口径**）

出厂 `sunScale = 1.0`，含义是「正对太阳、无遮挡时，雾色与今天那条
`pow(cos, 8) · fog.sunGain` 的峰值**完全相同**」。于是相对今天：
**照到太阳的空气不变，被挡住的空气少掉那一份** —— 「建筑阴影处不发亮」成立，
但读起来是「阴影里的空气暗下去了」，不是「光柱亮起来了」。
实测 Probe 街景（dawn / burningStreet / night 九个机位）整帧均值只动 −0.4% ～ −1.7%；
结构在「体积散射」调试视图上非常清楚（建筑把一条亮楔子切成两半），
在正片画面上是含蓄的一层。

想要更戏剧化的光柱，是**同一对旋钮**的事，而且可以保持整体雾量不变：
把 `sunScale` 抬到 1.3–2.0，同时按「亮部占比 f ≈ 0.5」把 `ambientScale` 压
`f × (sunScale − 1) × sunGain / ambient` 那么多。sunScale = 2 时 dawn 的
亮/暗空气对比从 1.7× 拉到 3.0×。

**没有出厂这么调**：那是把画面往「更戏剧」推的美术决定，用户在雾这件事上留过
「先别动雾」的定论，不该由渲染这一侧单方面改。旋钮与算式都在
`Data_Tuning_Volumetrics`，要哪一档改哪一档，一行的事。

### 17.7 调试视图（Debug Rendering 面板「体积雾」组）

| 视图 | 看什么 |
|---|---|
| 体积密度 `volumetricDensity` | 这一像素背后那颗 froxel 的 σ_t（0–0.15 /m 满量程）。烟幕/热烟铺得对不对看它 |
| 体积散射 `volumetricScatter` | 积分出来的绝对散射亮度。光柱、被建筑切断的暗带、火照亮的空气全在这张上 |
| 体积透过率 `volumetricTransmittance` | 合成 pass 实际吃到的透过率。legacy 模式下它与今天的解析雾**逐像素相同** |
| 体积重投影 `volumetricReproject` | 历史权重：绿 = 采纳，红 = 只能用本帧抽样 |

pass 自带调试视图的登记方式是 `GetDebugSource(view)`（`Script_PostDebug.GetSource`
会遍历 `passes` 问一遍）—— 八个并行子系统各带两三个视图，集中在一张表里必然天天冲突，
所以 2026-09 这一轮把它改成了 pass 自己登记。

### 17.8 成本（实测）

RTX 4070 SUPER / ANGLE-D3D11，正片 `?shot=1&phase=1`，**3394×1348**，
逐 pass GPU 计时（`FrameProfiler` 的 `EXT_disjoint_timer_query_webgl2`），
体积雾开/关**交替各 5 轮**取中位数：

| 档 | froxel | 图集 | inject | integrate | apply | 合计 | composite Δ |
|---|---|---|---:|---:|---:|---:|---:|
| medium | 120×68×48 | 960×408 | 0.040 ms | 0.050 ms | 0.122 ms | **0.212 ms** | +0.041 ms |
| high | 160×90×64 | 1280×720 | 0.082 ms | 0.124 ms | 0.077 ms | **0.283 ms** | +0.035 ms |
| ultra | 240×135×96 | 2880×1080 | 0.235 ms | 0.620 ms | 0.080 ms | **0.934 ms** | +0.037 ms |

`apply` 是**全分辨率**的，与 froxel 网格无关（三档都在 0.08–0.12 ms，差别是场景噪声）；
`inject` 跟 froxel 数线性走（medium→high→ultra = 0.39 / 0.92 / 3.11 M froxel，
0.040 / 0.082 / 0.235 ms，比例对得上）。
`integrate` 涨得更快（0.050 / 0.124 / 0.620）：那一趟每个片元要从第 0 片循环到自己这一片，
总取样数是 **froxel 数 × (NZ+1)/2**，NZ 从 48 涨到 96 时又多一倍。
ultra 仍在 1 ms 以内，high 是它的三分之一。

逐轮离散度很小（inject 0.080–0.088 / integrate 0.124–0.132 / apply 0.077–0.085），
因为这三趟是纯全屏 blit，不受场景状态影响。**整帧 gpuTotal 的 on/off 差值不可用**：
它被 prepass 与 main 的几毫秒漂移（AI、烟火、别的 agent 同时在跑浏览器测试）盖过，
单向先后测会把那点漂移算成特性开销 —— 逐段计时才是这一项的正确量法。

CPU 侧：draw call +4（三趟 blit 与它们的靶切换），提交耗时在噪声以内。

**计时查询的坑**：ANGLE/D3D11 上 `QUERY_RESULT_AVAILABLE` 要**过一个 event-loop turn**
才翻过来。在一个 `page.evaluate` 里连着 `StepFrames` 推几十帧的话，`FrameProfiler._Poll`
一次都收不到结果，`pending > 8 就丢最老的` 会把整批扔掉（症状是逐段全 null）。
每帧之间 `await setTimeout(0)` 才量得到。

### 17.9 怎么验

```bash
node Taierzhuang1938/Script_VolumetricsTest.mjs     # 本节的看门狗（Node 对账 + 四时段真浏览器）
node Taierzhuang1938/Script_PostFrameGraphTest.mjs  # 帧图地基（pass 顺序现在断言的是子序列）
node Taierzhuang1938/Script_PostTest.mjs            # 合成暗部 + TAA 基本盘
node Taierzhuang1938/Script_EditorTest.mjs          # Debug Rendering 全部视图
node Taierzhuang1938/Script_FlareTest.mjs           # 照明弹（走火源池 = 体积雾的局部光）
```

**展示类 pass 一定要读回像素**：GLSL ES 3.00 保留字（`sample` / `filter` / `input` /
`output` / `half` / `noise1..4` …）编译失败时 three 只在控制台留一行，那一趟什么都不画。
本轮还踩到一条 JS 侧的同类坑：**GLSL 模板字面量里的注释不能带反引号**
（`` `mix(...)` `` 会把模板提前闭合，报 `Unexpected identifier 'mix'`）。

### 17.10 本轮踩到的三条（都写进回归口了）

1. **`uSunShadowMap` 为 null 会让整趟 draw 被丢掉。** three 绑的是它内部那张从没上传过的
   `emptyShadowTexture`，ANGLE-D3D11 给 1282 INVALID_OPERATION，注入图集变成 clear 值 ——
   画面上就是「雾突然没了」，而 `renderer.info` 一切正常。可达路径：开机头几帧阴影图还
   没烘出来、画质面板把阴影整体关掉。现在有一张真的清过一次的 1×1 深度靶兜底。
   回归口：`Script_VolumetricsTest` 的「阴影图不可用时仍照常出雾」。
2. **A/B 对照必须钉死 `post.frame`。** froxel 的 xy/z 抖动与噪声漂移都由帧序驱动，
   不钉的话两次注入是两批不同的抽样 —— 第一版量「关掉阴影」时反而有 10% 的 froxel
   变亮了，那全是抖动噪声。钉死之后 `brighter` 精确为 0。
3. **别拿 `castShadow = false` 当「关掉阴影」的 A/B。** 它会让 `SyncShadowUniforms`
   把 `uSunShadowMap` 置 null，于是撞上第 1 条 —— 量到的不是「没有阴影」而是
   「什么都没画」。正确做法是 `UnregisterShadowUniforms` 之后只翻 `uSunShadowEnabled`。
---

## 17. GTAO / SSIL / 镜面遮蔽（2026-09）

> 这一节是 AO 那一格的**现状**。§4 是它之前那一版（半球采样 SSAO），已标历史稿。
> 代码：`Script_PostGtao.mjs`（pass）、`Script_MaterialPatches.MakeAmbientOcclusionPatch`
> （材质端）、`Data_Tuning_Gtao.mjs`（全部数值）。

### 17.1 一趟地平线搜索，三样产物

帧图里 `ssao` 那一格换成了 `gtao`，并在 `taa` 之后多一趟 `ssilHistory`：

```
prepass → hzb → gtao → main → wireframe → debugOverlay → taa → ssilHistory
        → godPrepare → bloom → god → composite → fxaa
```

`gtao` 一趟出四个通道（MRT 两张附件，半分辨率 RGBA16F）：

| 通道 | 内容 |
|---|---|
| R | 可见度 V ∈ [0,1]（GTAO 的解析 cos 加权积分） |
| G,B | 弯曲法线，**视空间**，八面体编码到 [0,1]² |
| A | 线性视深（双边去噪 / 时域重投影 / 材质端联合双边升采样都要它） |
| 附件 1 RGB | SSIL：近场一次反弹的**辐照度** |

四样共用同一批深度取样 —— 地平线搜索是这一 pass 的成本主体，AO、弯曲法线、
SSIL 只是同一次行军的三份账。

### 17.2 方案与文献

| 部件 | 出处 | 落地位置 |
|---|---|---|
| GTAO 本体（切片 + 地平线角 + 解析积分） | Jimenez, Wu, Pesce, Jarabo, *Practical Realtime Strategies for Accurate Indirect Occlusion*, SIGGRAPH 2016（Activision） | `Script_PostGtao` 的 trace 着色器 |
| 参数命名与取值区间 | Intel **XeGTAO**（同一篇论文最完整的公开实现） | `Data_Tuning_Gtao.GTAO` |
| 弯曲法线闭式解（t0 / t1） | 同课程附录 | trace 着色器切片循环末尾 |
| 多次反弹 `GTAOMultiBounce` | 同课程 | 材质补丁（屏幕空间没有反照率，只能在材质里做） |
| 镜面遮蔽 GTSO | 同课程 §4，工程形式取 Oat & Sander 2007 的球冠相交 | 材质补丁 `AoSpecularOcclusion` |
| SSIL 可见性位掩码 | Vardis et al. 2023, *Screen-Space Indirect Lighting with Visibility Bitmask* | trace 着色器的 `occupied` 位掩码 |

**与论文有意的两处不同**：

1. **不照抄 XeGTAO 的 `RotFromToMatrix`。** 它的视向量在 DX 左手系里是 `(0,0,-1)`，
   搬到 OpenGL 视空间会撞上 180° 的退化旋转（`1/(1+cosθ)` 除零）。这里改成显式切片基
   `bent = t0·axisT + t1·viewVec`，数学等价、没有奇点。自检：平地无遮挡时
   `t0 = 0, t1 = 2/3`，归一化后正好是几何法线。
2. **没有深度 mip 金字塔。** XeGTAO 用一条**加权平均**的深度 mip 降低大半径时的缓存
   缺失；仓库里的 HZB 是 **max-reduce**（给 SSR / 体积雾用的保守远深度），拿它做 AO 会
   系统性压低地平线、整体欠遮蔽。代价由 `GTAO.maxPixelRadius`（96 半分辨率像素）兜住。

### 17.3 去噪与时域

```
trace(MRT) → temporal(MRT，重投影上一帧) → 双边 H → 双边 V → targets.aoBlur
```

* **时域**：位置用**速度靶**（蒙皮人物逐骨骼精确），有效性判据是「历史像素记的视深」
  与「这块表面上一帧应该在多远」对不上就整份作废 —— 后者由
  `prevViewProjection * worldPos` 的 `clip.w` 直接给出（透视矩阵的 w 就是线性视深），
  **不需要往 FrameContext 上加 prevView 矩阵**。本帧权重 `GTAO.temporalAlpha = 0.10`。
* **空间**：可分离 5 抽样双边，边缘由「相对视深差」与「几何法线夹角」双重把关；
  弯曲法线是**解码后**加权再归一化，不是直接混编码值（八面体编码不能线性混）。
* **噪声**：空间交错梯度（IGN）+ 帧序 R2 轮转，周期 `temporalCycle`（medium/high 6、
  ultra 8、low 不轮转）。全部由 `ctx.frame` 驱动，截图逐像素可复现。

### 17.4 材质端做的四件事（顺序不能换）

`Script_MaterialPatches.MakeAmbientOcclusionPatch`，锚点 `<aomap_fragment>`（契约 6：
只压间接光；那里 `lights_fragment_end` 已经跑完，直接光不在场）：

1. **联合双边升采样** —— 2×2 双线性权重 × 深度接近度（深度取自 AO 靶的 alpha）。
   `aoScale = 1`（ultra）时插值权重退化成 (1,0,0,0)，即精确直通，不会白糊一遍。
2. **多次反弹** —— `AoMultiBounce(visibility, material.diffuseContribution)`。
3. **镜面遮蔽** —— `AoSpecularOcclusion(bentNormal, visibility, roughness, reflect(...))`，
   **替换了旧的 `pow(ao, 1+2·roughness)`**：那条只看 AO 标量，反射方向明明朝着开阔的
   天空也照样压暗；有了弯曲法线才知道「被挡住的是哪半边」。
4. **SSIL** —— `indirectDiffuse += ssil × strength × diffuseContribution / π`，
   **加在 AO 乘法之后**（AO 挖掉的正是这一份，先加再乘等于双重压暗）。

### 17.5 SSIL 的量纲与「不双份」

着色器里已经按 **π²/(2·切片数)** 归一化，估计量对「被辐亮度 L 的朗伯面铺满的半球」
给出 πL（推导写在 `Script_PostGtao` 那一行注释里）。所以 `SSIL.strength` 是一根
**艺术旋钮**（1.0 = 物理量），出厂 0.70。

与探针体 GI 的分工：探针体本来就带一份多次反弹的间接光，近场那一米会被算两遍。
`Script_Main` 按 GI 的淡入量把 SSIL 整体乘 `SSIL.giScale = 0.60`（−40%），GI 关着时不打折。
接线在 `RenderScene` 的 `SyncAoUniforms(...)` 那一处，一行。

### 17.6 RT / uniform / 分档

| 靶 | 尺寸 | 格式 | 备注 |
|---|---|---|---|
| `targets.ao` | `aoScale ×` | RGBA16F ×(1 或 2) | trace 原始输出；两趟模糊时还兼作横向中转 |
| `targets.aoTmp` | 同上 | 同上 | 别名（两趟时 = `ao`，一趟时 = `aoBlur`） |
| `targets.aoBlur` | 同上 | 同上 | **最终结果**；`post.AoTexture` / `post.SsilTexture` 读它 |
| history ×2 | 同上 | 同上 | 只在 `temporal` 档建 |
| colorHistory | `min(aoScale, 0.5) ×` | RGBA16F | 上一帧解算后的 HDR，SSIL 的辐亮度源 |

材质端 uniform（由 `Script_PostGtao.MakeAoUniforms` 造，正片与探针页共用）：
`uSsaoMap`（名字保留，§1.8 那条 `#define uScreenResolution uSsaoResolution` 的公共别名
不变）、`uSsaoResolution`（**主靶**尺寸）、`uAoTexelResolution`（AO 靶尺寸）、
`uSsaoStrength`、`uSsilMap`、`uSsilStrength`。SSIL 关着时 `uSsilMap` 指向一张
**1×1 全黑**，所以开关 SSIL **不需要重编译任何材质**。

分档（`Data_Tuning_Graphics` 的 `gtao` 存档位名、`ssil` 是构造期开关；
切片/步数/时域在 `Data_Tuning_Gtao.GTAO_TIERS`；靶比例仍是 `aoScale`）：

| 档 | ssao | gtao | 切片×步 | 时域 | ssil | aoScale |
|---|---|---|---|---|---|---|
| low | false | "low" | 1×4 | 无 | false | 0.5 |
| medium | true | "medium" | 2×4 | 有（周期 6） | false | 0.5 |
| high | true | "high" | 2×6 | 有（周期 6） | **true** | 0.5 |
| ultra | true | "ultra" | 3×8 | 有（周期 8） | **true** | 1.0 |

`aoScale` 由 0.5/0.6/0.75/1.0 改成 0.5/0.5/0.5/1.0：GTAO 每像素比旧 SSAO 贵一倍多，
而它在半分辨率 + 联合双边升采样下仍然明显好于旧 SSAO 的 0.75（见下面的实测与截图）。

### 17.7 实测（RTX 4070 SUPER / ANGLE-D3D11，正片 `phase=overview` 的 `Wall_EastOuterFace` 机位，A/B/C 交替五轮取中位数）

| 视口 | AO 段 | SSIL 增量（AO 段差 + ssilHistory） |
|---|---:|---:|
| 1600×900 GTAO | 0.224 ms | +0.079 ms |
| 2560×1440 GTAO | **0.615 ms** | **+0.117 ms**（0.096 + 0.021） |
| 2560×1440 旧 SSAO（`aoScale` 0.75） | 0.498 ms | — |

预算是「high 档 1440p，GTAO+去噪 ≤ 0.9 ms、SSIL 增量 ≤ 0.6 ms」，两条都过。
**跨进程的绝对值别直接比**：旧版那一轮的 `prepass`（代码完全没动）也比新版低了约 20%，
是别的 agent 同时在跑浏览器测试抢 GPU。按 `prepass` 归一化之后
GTAO ≈ 旧 SSAO 的 1.08 倍、GTAO+SSIL ≈ 1.23 倍 —— 也就是说**多出弯曲法线、时域累积、
多次反弹、GTSO 与近场反弹，只多花两成**。

SSIL 在这一关的实际量级（探针页街景，逐像素读 SSIL 靶 / 同帧 HDR 亮度）：

| 预设 | SSIL 亮度均值 | 峰值 | >0.05 的像素占比 | 画面 HDR 亮度 |
|---|---:|---:|---:|---:|
| smokyDay | 0.0197 | 0.545 | 15.2% | 0.503 |
| dusk | 0.0102 | 0.228 | 7.3% | 0.314 |
| burningStreet | 0.0132 | 0.351 | 11.1% | 0.364 |
| night | 0.0014 | 0.028 | 0% | 0.032 |

**说清楚**：这一关的外景是阴天灰砖，源辐亮度本来就低，所以 SSIL 的平均贡献是
零点几个百分点、局部峰值几个百分点 —— 这是**物理上正确的量**，不是实现弱。
取证场（`Probe.html?scene=ssil`，一堵自发光红墙 + 一块中性灰地）上量到的是
HDR 红通道 +3.5%、蓝通道 +0.14%、三米外 +0.09%，红/蓝选择性 25:1、近/远 39:1。
旋钮线性（×4 时增量正好翻四倍），要更响就抬 `SSIL.strength`。

**试过但退回的**：把地平线搜索半径与 AO 衰减半径拆开、SSIL 走 1.8 m。
正片两个采样点上 SSIL 读数一位没动（0.0086 / 0.0034 → 0.0086 / 0.0034），
墙根接触带反而被摊薄（可见度 0.751 → 0.836）—— 步数没加、每步跨得更远。
`uAoRadius` 那条接线留着了（`SSIL.radius` 出厂 = `GTAO.radius`），
真要给 SSIL 更远的手必须同时加 `GTAO_TIERS.steps`。

### 17.8 调试视图

Debug Rendering 面板「AO」组：

| 视图 | 看什么 |
|---|---|
| AO 原始 | trace 的原始输出（还没时域累积与双边）。噪点是逐帧轮转的采样相位 |
| AO 模糊 | 实际注入材质的那张可见度 |
| 弯曲法线 | 八面体解码后按 RGB 显示：开阔平地 ≈ 几何法线，墙角朝开阔的一侧偏 |
| SSIL 间接光 | 近场一次反弹（HDR 映射）。high/ultra 才有，低档画不可用斜纹 |
| 镜面遮蔽 | GTSO 结果，为了看空间梯度统一取 0.35 粗糙度（正片按各自材质的真粗糙度算） |

后三个由 `GtaoPass.GetDebugSource()` 自己认领，走 `Script_PostDebug.RenderView` 的
**通用材质分支**（`{ material, Prepare, unavailable }`）—— 新 pass 要加自带展示材质的
视图照这条走，不用往 `FRAG_DEBUG_VIEW` 的 else 链里插 uMode。

### 17.9 已知近似（都是有意的，别当 bug 修）

1. 没有深度 mip（理由见 17.2）。
2. 八面体编码的缝在 z = 0（掠射面），双线性跨缝会插值出错误方向。可见面的弯曲法线
   基本都在 +z 半球，实测无可见伪影。
3. SSIL 的辐亮度源**滞后一帧**，且按相机运动重投影；逐物体运动在反弹源里按静止处理
   （与 TAA / 运动模糊现役的同一条近似）。
4. 位掩码只在切片内做、不跨切片（论文亦然）。
5. 第一人称的手与枪在预通道里写的是 `FOREGROUND_VIEW_DEPTH` 常数深度，那一块的 GTAO
   是「一片等深平面」= 无遮蔽。与旧 SSAO 同一条口径。
6. 时域拒绝用的是相机重投影得到的期望深度，快速位移的表面会被判为 disocclusion 而丢历史
   （运动中的角色 AO 略噪）。这是安全的一侧：宁可噪一点，也不要拖影。
7. SSIL 忽略了切片的 `projectedNormalLength` 权重，掠射面上会略微高估。

### 17.10 怎么验

```bash
node Taierzhuang1938/Script_GtaoTest.mjs            # 本节的看门狗（19 条）
node Taierzhuang1938/Script_PostFrameGraphTest.mjs  # 帧图顺序（gtao / ssilHistory 在不在）
node Taierzhuang1938/Script_GiTest.mjs              # 材质补丁三态 + GI 双份
node Taierzhuang1938/Script_PostTest.mjs
node Taierzhuang1938/Script_EditorTest.mjs          # Debug Rendering 全部视图
node Taierzhuang1938/Script_BootTest.mjs
node Taierzhuang1938/Script_ProfilerTest.mjs
```

`Script_GtaoTest` 的门槛全是**实测标定**的，跑起来会先把读数整份打出来 ——
下一次调参的人要能一眼看到当前落在哪儿、离门槛还有多远。取证机位是
`Probe.html?scene=ssil`：世界坐标已知，每一条断言都用 `camera.project()` 把世界点
投到屏幕上再去读那一块像素，不靠「画面左下角大概是地面」。
---

## 17. 相机曝光 / 泛光光晕 / LUT 分级（2026-09）

> 代码：`Script_PostExposure.mjs`、`Script_PostLensFlare.mjs`、`Script_PostGrade.mjs`、
> `Script_PostBloom.mjs`、`Script_PostComposite.mjs` 的四段；口径表 `Data_Tuning_Camera.mjs`；
> 回归口 `Script_ExposureTest.mjs`。
> §1.9 留的 `uExposureTex` 接线点从这一轮起**有生产者了**。

### 17.1 帧内位置与渲染靶

```
… taa → exposure → ssilHistory → ssrColor → motionBlur → dof
     → godPrepare → bloom → god → lensFlare → composite → fxaa
```

* `exposure` 排在 `bloom` **之前**：泛光的阈值/软膝/钳制要除以本帧的曝光增益。
* `exposure` 紧贴 `taa` 之后（B6a 的原位），也就是在 `motionBlur` / `dof` **之前**：
  测光要测「解算干净的那一帧」，不该被运动模糊糊过、被景深虚化过的画面拉走。
* 它读的是 `ctx.sceneColor`，TAAU 开着时那是**输出分辨率**的解算靶 ——
  `uSourceTexel` 因此取 `ctx.sceneColor.width/height`，不是 `ctx.width/height`。
* `lensFlare` 排在 `bloom` **之后**：它读的就是泛光那一趟提取好的亮部图（`bright`），
  不再为它扫一遍全屏 HDR。
* 光晕在**曝光与 tonemap 之前**加进 HDR（`SEGMENT exposure` 的 `LensLight()`）——
  它是进到镜头里的光，要跟场景光一起吃曝光；放到 tonemap 之后只能是一块假亮斑。

| 靶 | 尺寸 | 格式 | 说明 |
|---|---|---|---|
| `exposurePass.lumTarget` | 160×90 固定 | RGBA16F | R = log2(luminance)，2×2 盒式抽样 |
| `exposurePass.histTarget` | 64×16 | RGBA16F | 点图元 + 加法混合累出的直方图 |
| `exposurePass.binsTarget` | 64×1 | RGBA16F | 列归约后的**归一化频度** |
| `exposurePass.stateTargets[2]` | 1×1 | RGBA16F | ping-pong：R 增益 / G 当前 EV / B 目标 EV / A 平均 log 亮度 |
| `targets.flare` | ≤9.6 万像素（同太阳拖影） | RGBA16F | 鬼影 + 光环 + 太阳星芒 |
| 分级 LUT | 4096×64 | RGBA8 DataTexture | 64³ 条带，sRGB 索引域，只在换时段时重烘 |

### 17.2 直方图自动曝光（UE5 的那一套，WebGL2 无 compute 版）

四趟：**亮度降采样 → 点图元直方图 → 列归约 → 1×1 解算**。

1. 主 HDR → 160×90 的 log2 亮度图（每个输出像素 4 抽样）。
2. 14400 个 `THREE.Points`，顶点着色器 `texelFetch` 亮度、算桶号、把点落到
   `(bucket, row)` 那一格，`CustomBlending` One/One 累加。
   **为什么是 64×16 而不是 64×1**：半浮点只能精确表示到 2048 的整数，14400 个点
   全落一个桶时会溢出精度；分 16 行后单格最多 900。行号由顶点序号轮转。
3. 列归约成 64×1，并**除以总像素数**变成频度 —— 存计数的话半浮点在 14400 那个
   量级上 ulp 已经是 8，「桶和 = 像素数」这条断言自己先破。
4. 1×1 pass：取 50%–95% 百分位区间的平均 log 亮度（UE 的
   `ComputeAverageLuminaneWithoutOutlier`，掐掉大片纯黑与少量镜面高光）→
   `EV100 = log2(L·100/K)`，K = 12.5（Lagarde & de Rousiers, Frostbite PBR §5.1）→
   按预设钳位 → 时域适应（暗→亮 3.0/s、亮→暗 1.0/s，UE 默认值）→ 增益。

**全 GPU，渲染路径上一次 readback 都没有**（同步版 `readRenderTargetPixels` 是 GPU
同步点，每帧调一次直接掉到 20fps）。`ReadState()` / `ReadHistogram()` 只给标定工具与
验收断言用。

#### 桶格钉在中灰上

`AUTO_EXPOSURE.binWidth = 0.30 EV`、`midGreyBin = 32`，于是
`minLog = log2(0.18) − 32×0.30 = −12.07`，覆盖 −12.07 … +6.83 EV。
量化误差有半个桶宽（0.15 EV ≈ 11% 亮度），**它落在哪儿是可以选的** —— 把
log2(0.18) 钉在桶心上，中灰就完全不吃量化偏移，「喂一张 0.18 灰、输出必须是
中灰 sRGB 118」这条标定链因此是精确的（实测 118/118/118）而不是「差不多」。
UE 是拿 min/max 定格子的，中灰落在哪儿全看运气。

#### 增益是「相对锚点」，不是绝对物理值

绝对物理曝光 `exposure = 1/(1.2·2^EV100)` 直接用上去，九张时段预设调出来的
`exposure`（白天 0.40–0.62、夜战 3.6）全部作废，「画面为什么这么黑」会立刻重演。
所以运行档走 **anchored**：

```
gain = 2^(evCal − evNow)
```

`evCal` 来自**每一关出生机位实测的平均 log 场景亮度**
（`Data_Tuning_Camera.EXPOSURE_ANCHORS`）。站在标定机位时 `evNow == evCal`，
增益精确等于 1.0 —— 打开自动曝光**不改变**美术调好的那一帧；走进屋里、钻进
地道、抬头看天时才按实际亮度补偿。

**锚点必须逐关而不是逐时段**：`smokyDay` 被三关共用，而三关出生机位的实测亮度
差 0.70 EV（CH1 1.29 / CH2 0.77 / CH3 1.47）。按预设取平均的话，最暗那一关
一打开自动曝光就整体提亮三成。

**锚点跟着整条管线走，不是跟着相机走。** 2026-09-08 集成期重标过一次：B6a 单跑那份
检出还没有 CSM / GTAO+SSIL / SSR / froxel 体积雾 / 物理大气 / 簇状光 / 材质着色，
七个子系统合流之后同一个出生机位整体亮了约 0.4 EV（夜战反过来暗了 0.15 EV）。
沿用旧锚点的话，「打开自动曝光」当场把 CH0 提亮 15.6%、把 CH3 压暗 12.0% ——
正是本轮明令禁止的那件事，`Script_ExposureTest` 的「开/关默认机位亮度差 < 5%」
把它抓住了。**任何改变场景亮度的渲染改动（间接光、阴影、雾、tonemap）之后
都要重跑 `--calibrate`。**

`absolute` 模式仍然实现着（`evCal` 由 `options.exposure` 反推），只给验收用。
两种模式共用同一个公式，差别只是 `evCal` 从哪来。

#### 中灰补偿 EV

物理公式给的是「什么亮度会被映射成白」，而每条 tonemap 曲线把中灰放在不同位置：
ACES Hill 直出会把 0.18 压到 0.045（sRGB 60，明显偏暗）。
`Script_PostExposure` 在模块加载时**数值求解** `tonemap(x) = 0.18`，再反解
`comp = EV100(0.18) + log2(1.2·x/0.18)`：ACES **+1.3370 EV**、AgX **+0.4820 EV**
（不写死数字，换曲线自动跟着变）。它只影响 absolute 模式 —— anchored 的
增益是比值，补偿量约掉了。

#### 曝光补偿标定表（**2026-09-08 集成期重标**，RTX 4070 SUPER / 1280×720 / high / 出生机位 / 预热 240 帧）

| 关卡 | 时段预设 | 实测 avgLog | B6a 单跑时 | evUp | evDown |
|---|---|---|---|---|---|
| CH0_Chuchuan | chuchuanDay | −0.13 | 0.23 | 1.8 | 1.2 |
| CH1_NanLu | smokyDay | 1.29 | 0.93 | 1.6 | 1.4 |
| CH2_Shouliudan | smokyDay | 0.77 | 0.63 | 1.6 | 1.4 |
| CH3_Jiuhusuo | smokyDay | 1.47 | 1.01 | 1.6 | 1.4 |
| CH4_DongguanYe | night | −3.13 | −3.28 | **0.6** | 0.8 |
| CH5_Chengqiang | dawn | 0.59 | 0.13 | 1.4 | 1.2 |
| CH6_Zuihou | burningStreet | 0.54 | 0.36 | 1.6 | 1.4 |

「B6a 单跑时」那一列留着是为了让下一个人看见**合流会移动锚点**这件事本身。
同一台机器两次独立标定的差是 1 个半浮点 ulp（0.9282 / 0.9287），可复现。
夜战那一档的 `evUp` 只有 0.6 EV = 自动曝光最多把夜景提亮 1.5 倍，
**结构上不可能把夜战拉成白天**。
重量的命令：`node Taierzhuang1938/Script_ExposureTest.mjs --calibrate`
（改关卡布设、天光预设、SSAO 或 GI 之后必须重跑）。
没有登记的时段预设（dusk / overcast / 白盒 / 编辑器 / 靶场）`logLum` 是 null =
**只测量不作用**（增益恒 1）—— 没有实测数据就不许它动画面。

### 17.3 色调映射：ACES Hill（默认）+ AgX

`uTonemap` 一位 uniform 选曲线，GLSL 与 JS 镜像都在
`Script_PostExposure.TONEMAP_GLSL` / `TONEMAP_JS`。AgX 逐系数对齐 three r185 的
`AgXToneMapping` chunk（同一组 inset/outset 矩阵与六阶拟合），免得哪天换用内置
tonemapping 时观感突变。默认仍是 ACES —— AgX 高光去色更「胶片」但整体更平，
这一关的黄土与硝烟在它下面会更灰。

### 17.4 泛光：阈值跟随曝光 + Karis（出厂关）

阈值/软膝/钳制仍是 HDR 域的数，但运行时**除以自动曝光增益**：
增益 1.0（自动曝光关着 = 绑纯白 1×1）时是恒等式，逐比特不变；
自动曝光把暗处提亮两倍时阈值同步降到 0.59 —— 「显示上一样亮的东西泛光一样多」，
这就是物理化的全部意思，一张时段预设都不用改。

**没走 UE 那条「无阈值 + 强度 0.675」**：九张时段预设的 `preset.bloom` 全是按
「有阈值」调出来的，换掉等于要求美术重调九档，那是内容决定不是渲染决定。

Karis 平均（第一级降采样按 1/(1+luma) 加权压萤火虫，docs §5 早就写着该做）
已经接上，`Data_Tuning_Camera.BLOOM.karis` **出厂 false**：它改变每一张画面，
而本轮的硬约束是「新开关全关时逐比特等于改动前」。画质面板可以热切。

### 17.5 镜头光晕 / 脏污 / 太阳眩光

John Chapman《Pseudo Lens Flare》(2013) 那一套，读亮部图、四分之一分辨率：

* **鬼影** 沿「像素→屏幕中心」方向重复采样，RGB 用不同半径得到镜片色散；
  权重按到中心的距离衰减，画面外的采样点整只丢掉（clamp 会拉出一条亮边）。
* **光环** 固定半径的环（镜筒内壁一次反射）。
* **太阳眩光** 星芒 + 核心辉光，**受屏幕空间遮挡**：在太阳 uv 周围绕一圈取样，
  只有预通道视深为 0（天空）的那些方向才算露出来。太阳被墙/屋檐挡住时眩光
  必须消失，否则整关都糊着一颗假太阳。
  太阳投影**自己算**，不借 `ctx.sunUv` —— 那一份由太阳拖影 pass 写，而拖影出厂
  是关着的（`graphics.godEnabled = false`），借它等于跟着一个从不更新的坐标走。
* **镜头脏污** 程序化烘的油斑 + 划痕灰度图（确定性 LCG，不用 `Math.random`），
  **只乘在泛光的高亮处**（`smoothstep(0.25, 1.60, Luma(bloom))`）。那道门槛是
  「有强光才脏」与「整屏永远糊着一层灰」的分界线。
  它在合成 pass 里写成等价的加法项（`+ bloom·strength·dirt·门槛`），
  因为 `main()` 已经加过一次 `bloom×uBloomStrength` —— 与 docs §5 的
  `bloom *= (1 + dirt·strength·smoothstep(…))` 完全等价。

强度按档：low/medium 0、high 0.55、ultra 0.70（`LENS_FLARE.byQuality`）。
战争片不是赛博朋克 —— 实测三个时段的开/关对照，整屏平均亮度差 1.3–2.0/255。

**待定夺（2026-09-08 集成期提出，没有自行改数值）**：那条「整屏平均亮度差
1.3–2.0/255」是**均值**指标，它量不到**局部**有多显眼。合流后的正片实拍里，
鬼影在三张图上都很抢眼：`Probe_StreetBurning` 的巷子地面被抹成一片紫、
`Game_Z1_Ads` 与 `Game_Z4_CityLife` 的彩虹扇正好压在准星/照门上。
对照图在 `_shots/IntegrateB6/_flare_ab/`（同机位同帧数，只翻 `graphics.lensFlare`）。
要不要压 `LENS_FLARE.byQuality.high`、或者在开镜时按 ADS 压一档、
或者把鬼影挡在准星那一小块之外 —— 是美术与手感决定，等定夺。
玩家侧现在已经有出路：画质面板「相机」栏的镜头光晕倍率可以直接调到 0。

### 17.6 3D LUT 分级

把 `lift/gain → 分离调色 → 感知域对比` 这一段**原样**烘成 64³ 的 4096×64 条带，
合成 pass 的 `ColorGrade` 改查表（`uLutAmount`：0 = 原算式、1 = 全查表、中间是过渡）。

三条不显然的决定：

* **索引域是 sRGB 不是线性**。格子铺在线性域上时第一格覆盖 0—1/63 线性亮度
  = sRGB 0—0.14，画面里几乎所有暗部都挤在第一格里，三线性插值当场糊掉 ——
  而这一关最敏感的正是暗部。存的值同样 sRGB 编码，8 位量化因此正好落在最终输出
  （也是 8 位 sRGB）的同一个量化格上。
* **64³ 而不是 docs §9 老稿的 32³**。实测 32³ 的最大误差是 3/255：分离调色的
  权重折角（两个 `clamp` 拐点，它们是 RGB 立方体里的斜面）三线性接不住，
  而折角的误差是 O(h) 不是 O(h²)，只能加分辨率。64³ 在 B6a 单跑时落回
  **maxDiff = 1/255、超 1/255 的通道 0/2764800**；烘一张约 90 ms，只在换时段预设时跑一次。
  **2026-09-08 集成期复测：maxDiff = 2/255、越线 4/2764800、均差 0.154**（单跑时均差
  0.162，比它还大一点）。变的不是这段代码而是它的**输入** —— 合流后的 composite 里
  ApplyFog 接上了 froxel 体积雾与大气透视，同一张测试图送进 ColorGrade 的颜色已经不同，
  于是有 4 个通道正好压在折角上。要把峰值压回 1/255 只能上 128³（8 MB + 8 倍烘焙时间），
  而 2/255 落在输出抖动（`uDither`，以 1/255 计）的幅度之下。回归口因此改成三条一起看：
  峰值 ≤ 2/255、越线占比 ≤ 1e-5、均差 ≤ 0.25（后两条是这一轮新加的，只放宽峰值一条）。
* **饱和度不进 LUT**。它每帧都在动（压制去饱和）。好在饱和可乘：
  `mix(L, mix(L,c,s1), s2) = mix(L, c, s1·s2)`（因为 `Luma(mix(L,c,s)) = L`），
  所以 LUT 只烘到「饱和之前」，着色器照旧做那一步；`gradedLuma`（受伤去色要用）
  就是 LUT 输出的 `Luma`，一个比特不差。

用 `DataTexture` 而不是 docs §9 老稿的 `CanvasTexture`：2D canvas 的后备存储是
预乘 alpha 的，一旦想往 alpha 里塞东西（比如 `gradedLuma`）颜色就被就地改写。
四条铁律照旧：`NoColorSpace` / `ClampToEdge` / 无 mipmap / `flipY=false`，
采样时每格内缩半纹素。

外部 `.cube` 的载入口在 `GradeLutCache.SetExternal(texture)`。**文本解析故意没做**：
外部表通常是线性或 log 索引域的，接进来前必须先重采样到本文件的 sRGB 索引域，
否则暗部会整片错位 —— 那是资产管线的事。

### 17.7 分档

`Data_Tuning_Graphics` 三位；数值口径全在 `Data_Tuning_Camera`。

| 档 | autoExposure | lensFlare | lut |
|---|---|---|---|
| low | ✗ | ✗ | ✓ |
| medium | ✓ | ✗ | ✓ |
| high / ultra | ✓ | ✓ | ✓ |

`autoExposure` / `lut` 的**运行时状态**在管线上（`post.SetAutoExposure` /
`SetLutEnabled`，同 `SetTaaEnabled` 的先例），不写 `preset` —— preset 是「这一档的
出厂值」，面板的「恢复出厂」要从它读回去。

出厂关着、已接线、面板可切的三项：泛光 Karis 平均、输出抖动（`OUTPUT.dither`，
三角分布、幅度以 1/255 计，压 8 位渐变的色带）、`AUTO_EXPOSURE.centerWeight`
（中心加权测光；0 时直方图各桶之和精确等于降采样像素数，验收断言压在这条上）。

画质面板新增一栏「相机」：自动曝光 / 3D LUT / 泛光 Karis 三个开关、曝光补偿
（−3…+3 EV）、色调映射 chips、镜头光晕与镜头脏污两根倍率、输出抖动。

### 17.8 调试视图

Debug Rendering 面板「后处理」组新增四项，实现挂在各自的模块里，走的是
`GetSource()` 查找顺序的**第 ③ 条路**（登记表）。B6a 单跑时它在
`Script_PostDebug` 上自开了一张 `extraViews` 表；**合流时收成了一张** ——
`DebugPass.RegisterView(id, resolver)` 现在是 `PostPipeline.RegisterDebugView`
的别名，两个名字指同一张表（§1.11 的三条路一条都没多）。
契约不变：resolver 收 pipeline，返回 `{ texture, mode, unavailable }`
（走通用展示 pass）或 `{ material, Prepare?(ctx), unavailable }`（自带材质，直接送屏）。

| 视图 | 看什么 |
|---|---|
| 曝光直方图 | 64 桶对数纵轴柱状图 + 当前 EV（青线/青字）、目标 EV（橙）、增益（白）。数字是着色器里画的 3×5 点阵，截图能直接当证据 |
| 镜头光晕 | 光晕层本尊。黑场输入必须全黑；太阳被墙挡住时星芒消失 |
| 镜头脏污 | 程序化烘的油斑 + 划痕图 |
| LUT 采样校验 | 上=测试彩阶/灰阶、中=正在生效的 LUT 条带、下=恒等表的采样误差 ×16。下半屏只该剩一层均匀的量化底噪；出现**块状结构**就是 flipY / 切片索引 / 半纹素内缩出了错 |

### 17.9 已知的近似（都是有意的）

* 测光是**开环**的：亮度图取自 HDR 主靶，而增益作用在合成 pass，所以增益不反馈
  进测光。好处是绝不振荡，代价是「曝光过的画面亮度」不是被直接控制的量。
* 160×90 的测光图对全屏是**欠采样**（约 1/100 的像素）。作为分布的估计量无偏，
  但一个 3 像素的爆闪可能整帧测不到 —— 这正是要的：曝光不该被单帧爆闪拉走。
* 时域适应用的是 `exp(−dt·speed)` 的一阶逼近，不是 UE 那条带「速度上限」的曲线；
  镜头硬切与换关走 `NotifyCameraCut()` / `RequestReset()` 直接吸附。
  **换着色模式（Debug Rendering 的线框 / 着色线框）也算硬切**：线框那一档整幅画
  换成「深灰底 + 亮线」，平均亮度跟正片完全不是一回事。`SetShadingMode` 因此在
  模式真的变了时调一次 `RequestReset()`。2026-09-08 集成期实测：不当硬切处理时，
  从线框切回 shaded 之后三帧的画面与切之前差 3.8%（场景自身漂移只有 0.6%），
  肉眼是「先亮一下再正过来」；接上之后是 0.8%。回归口是 `Script_EditorTest`
  的「切回着色后画面与原正片一致」（阈值现在是 max(1%, 场景漂移 × 2)）。
* 光晕的鬼影权重是经验曲线（`pow(1−r, 8)`），不是真的镜片组光路追踪。
* 太阳遮挡是 8 个方向、半径 0.012 uv 的一圈采样：半个太阳被檐口切掉时眩光会
  按露出比例减半，但更细的边缘（电线、树枝）判不出来。
* LUT 的三线性插值在分离调色的两个权重折角处仍有 ≤1/255 的残差（见 §17.6）。
* 过场自带天空（`cutsceneSky`）时不传逐关锚点 —— 镜头已经不在这一关的出生点上，
  锚点对不上。那几场走时段预设那一条，多半是 null = 只测量不作用。

### 17.10 怎么验

```bash
node Taierzhuang1938/Script_ExposureTest.mjs                 # 全套（探针页 + 正片两关）
node Taierzhuang1938/Script_ExposureTest.mjs --probe-only    # 只跑探针页，约 90 秒
node Taierzhuang1938/Script_ExposureTest.mjs --calibrate     # 量七关的曝光锚点
node Taierzhuang1938/Script_ExposureTest.mjs --shots         # 出开/关对照图到 _shots/
node Taierzhuang1938/Script_ExposureTest.mjs --baseline=<另一份检出的根目录>
node Taierzhuang1938/Script_PostTest.mjs                     # 合成暗部保真
node Taierzhuang1938/Script_PostFrameGraphTest.mjs           # 帧图契约
```

**`--baseline` 是 B6a 单跑那一轮的证据，合流之后不再跑**：那条比的是「本检出 vs
Phase A 检出」，而合流后的树本来就比 Phase A 多七个渲染子系统，画面**应该**不同，
再比只会得到一个没有意义的红。合流之后守同一件事的是同一个测试里的两条**同进程**
断言 ——「自动曝光关掉时合成绑的是纯白 1×1（增益精确 1.0）」与「自动曝光开关往返后
画面逐比特复原」，两条都在 2026-09-08 的集成期跑绿。下面留着原始配方，
将来谁要拿两份检出做逐比特对比照抄即可：

把 Phase A 的树导出到一个临时目录，
两边各起一个服务、各起一个浏览器，把探针页的时间与帧序全部钉死
（`elapsed = 0; post.frame = 0; hasTaaHistory = hasPrev = false;` 再 `StepFrames(16)`），
读回 `targets.ldr` 逐像素比对 —— 三位新开关全关时 **maxDelta = 0**。
（导出用 `git archive <提交> Taierzhuang1938 PrairieFire1937 | tar -x -C <目录>`；
仓库根的图标与样式不在里面，那几个 404 与本轮改动无关，测试里已按 tag 过滤。）

**每一段各起一个浏览器**（跑完就关），不是同一个浏览器开三个页面：
探针页 + 基线页 + 正片页挤在同一个 headless Chromium 里跑完之后，第三个上下文
会零星冒出 `THREE.WebGLProgram: Shader Error … VALIDATE_STATUS false`
（Program Info Log 是空的）并把 GL 推进 1282，紧接着的半浮点
`readRenderTargetPixels` 全读回 0 —— 表现是「phase=0 的曝光增益是 0」，
而同一个页面单独跑一遍完全正常（增益 1.0029）。那不是渲染缺陷，是上下文压力。

### 17.11 性能（RTX 4070 SUPER / 1280×720 / high，GPU 计时查询，40 次取平均 ×5 轮取中位数）

| 段 | 中位数 |
|---|---|
| `exposure`（四趟合计） | **0.032–0.059 ms** |
| `lensFlare` | **0.0026–0.0048 ms** |
| LUT 烘一张（JS，换时段时一次） | 85–110 ms |

预算是自动曝光 ≤ 0.15 ms、光晕 ≤ 0.30 ms，两项都留着一个数量级的余量。
两趟的成本几乎与主分辨率无关：测光图固定 160×90，光晕靶封顶 9.6 万像素。
`renderer.render` 次数只多了一次（直方图那一趟点图元），不是场景提交。
---

## 17. TAAU / 逐物体运动模糊 / 散景景深（2026-09）

> 三件事共用同一条时域链（预通道速度靶 + TAA 历史 + 两组分辨率），所以写在一节里。
> 算法口径全部在 `Data_Tuning_TemporalDof.mjs`（纯数据，零 three 依赖）；
> 档位开关在 `Data_Tuning_Graphics.mjs`。**这一节是这三件事的唯一口径**，
> §7.2 与 §8 是它们之前的版本，留作对照。

### 17.1 两组分辨率：内部 vs 输出

`PostPipeline.SetSize(width, height, outputWidth = width, outputHeight = height)`：

| 名字 | 是什么 | 谁按它建靶 |
|---|---|---|
| `post.width` / `height` | **内部分辨率**（`graphics.renderScale` 缩过的） | 预通道 / hzb / ssr / gtao / 接触阴影 / main / 体积雾（`ctx.width/height`） |
| `post.outputWidth` / `outputHeight` | **输出（显示）分辨率** | 由 `ApplyGraphics` 喂 `window.innerWidth/Height` |
| `post.resolveWidth` / `resolveHeight` | 实际解算分辨率 = TAAU 在跑就取输出，否则取内部 | `OUTPUT_DOMAIN_PASSES` 里那八个（`ctx.outputWidth/outputHeight`） |
| `post.taauActive` | TAA 开着 + 档位 `taaUpscale` + 两组尺寸不同 | — |

分界线在 `Script_Post.OUTPUT_DOMAIN_PASSES`。**只读 `ctx.width/height` 的 pass 不用改
一个字**：TAAU 不跑时两组相等，跑时它们本来就该在内部分辨率上工作。

#### 逐 pass 的分辨率域（2026-09-08 八个子系统合流后逐个核对过）

判据只有一条：**这个 pass 的靶与它按纹素取的偏移，跟的是哪一张图**。
跟 `ctx.sceneColor`（TAA 解算之后）的在输出域，跟预通道 / 速度靶的在内部域。

| pass | 域 | 靶 | 采样方式 |
|---|---|---|---|
| `atmosphere` | — | 四张 LUT（固定尺寸） | 与屏幕分辨率无关 |
| `prepass` / `hzb` | 内部 | MRT + HZB 链 | 按内部纹素 |
| `ssr` / `ssrColor` | 内部 | 追踪靶 `ssrScale×` + 颜色 mip 链 | ssr 按内部纹素；**`ssrColor` 读的是输出域的 sceneColor**，2×2 盒式的纹素偏移改成问靶自己（`ctx.sceneColor.width/height`） |
| `gtao` / `ssilHistory` | 内部 | `aoScale×` 靶 + 颜色历史 | gtao 按内部纹素（`uFullResolution = ctx.width/height`）；`ssilHistory` 只按 uv blit，没有纹素偏移 |
| `contactShadows` | 内部 | 半分辨率 | 按内部纹素 |
| `main` | 内部 | `hdr` | — |
| 体积雾三趟 | 内部 | froxel 图集 + 全（内部）分辨率 apply | 按 uv；**`uFogScatter` 是内部分辨率而 composite 在输出分辨率采它** —— 双线性放大，散射本来就是低频量（froxel 网格 x/y 才 160–240 格），可接受，见 §17.6 已知近似 |
| `taa` | **输出**（解算靶） | `taaA/taaB` | 权重核以**输入像素**度量（见 17.2），历史与输出在输出网格 |
| `exposure` | **输出** | 测光/直方图靶是固定尺寸，不吃 Resize | `uSourceTexel` 取 `ctx.sceneColor.width/height`—— 拿内部分辨率算会让 2×2 盒式落错格子 |
| `motionBlur` | **输出**（彩色靶） | tile 链按**内部**（速度靶是内部的） | 速度 uv × 内部分辨率 = 内部像素，`uMaxBlurUv` 的 tile 尺寸也是内部像素 —— 三者同一把尺，自洽 |
| `dof` | **输出** | 半分辨率 gather 靶 | CoC 的像素幅度按 `resolveWidth` |
| `bloom` / `god` / `lensFlare` | **输出** | 亮部 1/2、拖影与光晕 1/4 封顶 | 跟着 sceneColor：按内部建的话泛光半径会随 `renderScale` 变，超分之后泛光就飘了 |
| `composite` | **输出** | `ldr` | `uResolution` 仍是**内部**分辨率 —— 它只剩 `Script_PostDebug` 的 Motion Vector 视图在用，那张读的是内部分辨率的预通道靶 |
| `fxaa` | **输出** | 直接送屏 | 按 `ldr` 靶自己的纹素 |

GTAO / SSR / 体积雾的时域重投影用的速度靶是**内部分辨率**的，与它们自己的靶同域，
所以那三条重投影一个字都没改。`ssilHistory` / `ssrColor` 读输出域的场景色、
产出内部域的图喂下一帧 —— 它们按 uv 采样，两组分辨率不同只影响一次双线性缩放。

`SetTaaEnabled` 会在 TAAU 的「跑 / 不跑」翻转时整体 `SetSize` 一次（解算分辨率变了，
下游五张靶都要重建）；不涉及 TAAU 的普通开关仍走惰性建靶那条便宜路。

**出厂内部分辨率跟画质档走**（`QUALITY_PRESETS[*].renderScale`：low 1.0 / medium 0.75 /
high 0.8 / ultra 1.0）。`Script_Main` 在 `graphics` 表建好之后立刻按它切一次两组尺寸 ——
`ApplyGraphics` 只在 resize / 设置面板 / 存档回灌时跑，不补这一次的话出厂档位要等玩家
改窗口大小才生效。

### 17.2 TAA 吃速度缓冲 + TAAU 上采样

`Script_PostTaa.mjs`。相对 §7.2 的四处改动：

1. **速度来自预通道 RT1**（`ctx.velocityTexture`），仍做 3×3 最近片元膨胀。
   深度反投影那条老路留着，只在没有浮点靶（`hdrCapable = false`）或 `velocity` 档位
   关掉时兜底；`taaPass.forceDepthReprojection = true` 可以强制走它（A/B 取证用，
   `Script_TaauTest` 靠它量鬼影）。
2. **TAAU 上采样**。输出像素中心落在输入像素坐标系的哪里，决定它对周围 3×3 个输入
   样本的权重：

   ```
   centerPos  = vUv * 内部分辨率              // 输出像素中心（输入像素为单位）
   baseTexel  = floor(centerPos)              // 包含它的那个输入像素
   baseOffset = (baseTexel + 0.5 + jitter) - centerPos
   w(dx,dy)   = exp(-2.29 * |baseOffset + (dx,dy)|^2)
   ```

   距离**以输入像素度量**：换成输出像素会让核比输出采样间距还窄，某些输出像素整帧
   只落到一个输入样本上，时域补不回来（会抖）。1:1 时这套公式退化成重构前那份
   「offset + jitter」的 Blackman-Harris 重定心，逐项相同。
   历史靶在输出分辨率，Catmull-Rom 5-tap 也在输出网格上做。
3. **方差裁剪**（Salvi 2016 / UE4 `AA_VARIANCE`）：3×3 的 min/max 盒再按 μ ± γσ 收紧
   （`TAAU.varianceGamma = 1.25`）。纯 min/max 对高频高光太松，萤火虫能一直留在盒里逐帧闪。
4. **anti-flicker + responsive**：
   * anti-flicker（HDRP 的 feedback 调制）—— 局部亮度对比越高，当前帧权重压得越低，
     最低压到 `antiFlickerFloor`（0.35）倍。高对比像素上「这一帧恰好采到哪」本身就是噪声源。
   * responsive（UE 的 Responsive AA）—— 第一人称手/枪走 `responsiveWeight`（0.5）。
     它们在预通道里的视深是常数前景标签（`FOREGROUND_VIEW_DEPTH`）、速度恒 0，
     世界在它们背后滑过时历史会把瞄具边缘拖出一条虚影。**没有 stencil 通道**，
     掩码用 `|nd.w − 1.0| < 0.002` 认 —— 已知近似：世界里正好落在 1 m ± 2 mm 的实体
     也会吃到 responsive 权重，那是一层 4 mm 厚的壳，肉眼不可见。

### 17.3 逐物体运动模糊（独立 pass）

`Script_PostMotionBlur.mjs`，排在 TAA 之后、泛光之前。四趟（半分辨率档五趟）：

```
tileMaxX  (⌈W/20⌉ × H)      沿 x 扫一个 tile，取速度模最大的那个向量
tileMaxY  (⌈W/20⌉ × ⌈H/20⌉) 同上沿 y
neighbor  (同上)             3×3 取最大（双线性过滤：tile 网格比屏幕粗 20 倍，
                             最近邻会让模糊长度在 tile 边界跳变）
reconstruct                  逐像素沿主导速度 8/12/16 抽样
[resolve]                    motionBlurScale < 1 时把半分辨率结果按模糊长度回填
```

* **权重**是 McGuire 2012 的三项（前景糊过来 / 中心糊透出后面 / 两者都糊），
  `SoftDepthCompare` 的过渡宽度是 `MOTION_BLUR.softZExtent`（0.6 m）。
* **采样方向**在 neighborMax 与本像素速度之间交替（Jimenez 2014）：只沿前者会把静止
  背景一起拉长，只沿后者又糊不出运动物体的轮廓。起点用交错梯度噪声抖动，防条带。
* **快门**：速度靶记的是整帧位移，模糊长度 = 速度 × `shutterFraction`（0.5 = 180° 快门），
  采样区间 ±(长度/2)。`options.motionBlur` 从「模糊长度倍率」改成了 **0–1 的总闸**
  （`Script_Main` 现在传 `graphics.motionBlur * (1 - deathDof)`）。
* **最大位移**钳在半个 tile：McGuire 的前提是「没有像素跑得比一个 tile 还远」，
  越界会在 tile 边界露出硬边。
* **前景（第一人称手/枪）两道闸**：① 预通道给它们写速度 0，cone/cylinder 权重让邻居的
  模糊够不到；② 中心像素命中前景标签时**直接返回原色**，整个重建循环都不跑。
  第二道是硬闸 —— FPS 手感的红线不靠权重公式碰运气。

### 17.4 散景景深（独立 pass）

`Script_PostDof.mjs`，COD:AW（Jimenez 2014）的四段式，排在运动模糊之后：

```
down      (输出的 1/2 × dofScale)  Karis 加权 2×2 降采样，a = 带符号 CoC（像素）
gather    (同上，MRT ×2)           48 抽样同心环 8/16/24；近场与远场分开
fill      (同上)                   近场 3×3 取覆盖度最大（半分辨率必然留空洞）
composite (输出分辨率)             远场按本像素 CoC 混、近场按覆盖度 alpha 盖上去
```

**CoC 是薄透镜的**：`coc/coc(∞) = 1 − dF/d`，即**远景的形状只由焦平面决定，光圈只改幅度**。
所以实装把「形状」交给薄透镜（远景随距离渐进逼近上限，而不是旧版 `smoothstep(focus,
focus+range)` 那样在 focus+range 处一刀切平），把「幅度」归一到调用点原来给的
`dofMaxPx` / `nearDofMaxPx`。**`Script_Main` 的调用点一个字没改，画面上限也没变**，
变的是中间那段过渡曲线（更像真镜头）。`DOF.apertureDriven = true` 可切成真·光圈驱动
（幅度直接来自 `focalLengthMm` / `fNumber` / `sensorWidthMm`）。

近场的采集半径是**固定的最大近景 CoC**而不是本像素 CoC —— 近场必须往清楚的背景上渗，
按本像素采的话前景根本盖不住背景（旧版 12 抽样圆盘就是这个毛病）。

前景（第一人称手/枪）三处认标签：CoC 恒 0、不进近场采集、合成时直接返回原色。

**近场那一支还有第四道闸，2026-09-08 集成期补的**：gather 里近场样本的权重是
`clamp(cocS − dist + 1.0, 0, 1)`，那个 `+1.0` 是 scatter-as-gather 的一像素羽化。
远场那一支不会出事（它由中心自己的 `farRadius > 0.5` 门住，合焦处整段不跑），
而**近场那一支的采集半径是常数 `uNearRadius`，每个像素每一帧都进循环** ——
于是 `cocS = 0` 的样本只要落在 1 像素以内就仍然拿到 `w = 1 − dist > 0`。
后果：**正片开镜的常态是近场空的**（焦平面 1.6 m，枪自己带前景标签 CoC 恒 0，
场景里最近的墙在三十多米外），CoC 靶实测**全是 0**，覆盖度却还有 0.31，
×`nearCoverageGain` 1.35 = 0.41 —— 四成画面被半分辨率的近场层盖掉，
表现是「一开镜整幅画发糊，连枪和 34 m 外的墙都糊」，正撞用户那条
「武器/手臂在 MB/DoF/TAA 下必须锐」。修法是给权重再乘一道
`nearMask = clamp(cocS, 0, 1)`：真近景的样本权重一点不变，CoC = 0 的样本归零。

**为什么 B6b 单跑时没抓到**：`Script_TaauTest` 的开镜档会先在 0.9 m 处补一块板
（「近场里真有东西」），量的是 CoC 图；而「近场里什么都没有」这条缝没有测试。
现在补上了 —— `Script_TaauTest` 的「近场里什么都没有时，景深是恒等式」比的是
**像素**不是 CoC：先量一次「两帧都开着景深」的噪声底（TAA 抖动相位差），
再要求「开/关的差不明显高于这个底」。修好之后开/关均差 0.225 反而**低于**
噪声底 0.322，修之前是 20+。
`dofStrength` 与 `nearDofStrength` 都是 0 时整个 pass `Enabled() === false`，**零成本**
（实测省 4 个 draw call，GPU 段整个消失）。

### 17.5 CAS 锐化

`Script_PostFxaa.mjs` 的锐化从「减模糊」换成 **AMD FidelityFX Contrast Adaptive
Sharpening 1.0**（`ffx_cas.h` 的 no-scaling 路径）：逐通道取 3×3 的 min/max，
幅度 = `sqrt(saturate(min(mn, 2−mx) / mx))`。已经饱和的区域幅度自动趋近 0，
所以不 ringing。强度沿用 `graphics.sharpen`（画质面板那根滑杆），峰值映射在 `CAS`。
TAAU 之后必须补一次锐化 —— 任何重采样都会掉高频。

### 17.6 分档

| 档 | taa | taaUpscale | renderScale | motionBlur | 抽样 / 靶比例 | dof | dofScale |
|---|---|---|---|---|---|---|---|
| low | 关 | 关 | 1.0 | 关 | — | 关 | — |
| medium | 开 | 开 | 0.75 | 开 | 8 / 0.5 | 开 | 0.5 |
| high | 开 | 开 | 0.80 | 开 | 12 / 1.0 | 开 | 0.5 |
| ultra | 开 | 开 | 1.0 | 开 | 16 / 1.0 | 开 | 1.0 |

`taaUpscale` 在 ultra 上仍是 true：`renderScale` 是 1.0 所以上采样不生效，但玩家手动
下调分辨率时它照样接上。low 档没有 TAA 也就没有 TAAU，抗锯齿由 FXAA + CAS 承担，
`renderScale < 1` 时退回老行为（末趟送屏做一次双线性放大）。

### 17.7 调试视图（Debug Rendering）

三项新的，由 `Script_PostFxaa` 的 `GetDebugSource(view)` 认领（`TEMPORAL_DEBUG_VIEWS`）。
**它们走 `GetSource()` 的第 ① 条路**（pass 自带视图），与 B3 体积雾、B2 GTAO 那几张
同一条；送屏交给 `RenderView` 的「自带材质」通道。合并期把 B6b 原来在
`FxaaPass.Render` 里那条抢先送屏的分支收掉了 —— 调试视图的仲裁点只有 `GetSource()`
那三条路，**不许有第四条**（口径见 §1.11）：

| id | 看什么 |
|---|---|
| `velocityTile` | 运动模糊的 tile 邻域最大速度（已乘快门）：R/G 方向、B 模糊长度 |
| `dofCoc` | 薄透镜 CoC：深蓝合焦、暖黄远景散焦、洋红近景散焦、**绿 = 第一人称前景标签** |
| `taaWeight` | R = 当前帧权重（×4 显示）、G = 历史被邻域盒裁掉多少、B = responsive 掩码 |

`taaWeight` 是**再跑一趟 TAA 材质**（只改 `uDebugMode`）写进池子的瞬时靶，只在选中时
产出，平时零成本，且不污染历史乒乓。

### 17.8 怎么验

```bash
node Taierzhuang1938/Script_TaauTest.mjs        # 本轮的回归口，18 条断言
node Taierzhuang1938/Script_PostFrameGraphTest.mjs
node Taierzhuang1938/Script_PostTest.mjs
node Taierzhuang1938/Script_ActorDepthTest.mjs
```

`Script_TaauTest` 里有三条踩过的坑，改它之前先看：

* **`readRenderTargetPixels` 是自下而上的**（WebGL 原点在左下）。按屏幕坐标取「上半屏」
  量到的全是第一人称的枪，锐度指标变成纯噪声。
* **量斜边锯齿要先关泛光**：纯黑板挨着亮天空时泛光会在边上铺出几十像素的软过渡，
  逐行的 mid 阈值随左侧亮度漂移，量到的散布是泛光的不是锯齿的。
* **`?shot=1` 只是跳过主菜单**，玩家还停在开机展示位上。不显式 `player.Spawn()` 的话
  每一项量的都是开机屏那把枪，而且**数字看起来完全合理**。
* **别拿「同一帧的无 TAA 版」当鬼影参考**：重投影失效时邻域裁剪会把历史整个拉回
  当前帧，结果反而**更接近**无 TAA 版 —— 那条指标的符号是反的（实测两条路 27.6 / 27.7，
  连方向都不稳）。也别在测试里用 `P.Render` 直接渲一张 4×SSAA 真值：它绕开了
  `RenderScene`，SSAO 的 `uSsaoResolution` 还停在 1× 上，整幅间接光错位，
  差值直接顶到 37/255。现在量的是**「换速度来源只该动在动的像素」**，
  速度靶内容本身的正确性交给 `Script_PostFrameGraphTest`。

### 17.9 实测（RTX 4070 SUPER / ANGLE-D3D11，1600×900 输出、phase=1、high 档）

| 指标 | 数字 | 怎么量的 |
|---|---|---|
| 斜边锯齿能量（亚像素边位残差） | TAA 关 0.287 px → **开 0.136 px** | 场景里插一条 20° 纯黑斜边，逐行求亮度中位的亚像素穿越点，对整条边做最小二乘直线拟合取残差 RMS。拟合斜率 −0.364 = tan 20°，证明量到的确实是那条边 |
| TAAU 对 1.0 的 PSNR | 0.85 → 33.6 dB / **0.80 → 30.8 dB** / 0.75 → 29.5 dB / 0.67 → 29.2 dB | 同机位同帧数（各自滚满 28 帧），关掉颗粒 |
| 速度靶这条接线通不通 | 在动的像素差 **7.84**（44 400 px） vs 静止像素差 **0.74**（474 000 px），10.5× | 32 名走动的兵、相机不动；把 `taaPass.forceDepthReprojection` 在两条路之间切，比两张 TAA 输出。掩码取自运动模糊的 tile 邻域最大速度（相机不动 → 非零 tile 就是运动物体） |
| 运动模糊长度 ∝ 角速度 | 0.010 rad/帧 → 6.04 px；0.020 → 11.50 px（比 1.90） | tile 邻域最大速度的中位数 |
| `motionBlur = 0` | pass 整个不跑，省 4 个 draw call | `renderer.info.render.calls` 差 |
| `dofStrength = 0` | pass 整个不跑，省 4 个 draw call | 同上 |
| CoC 正确性 | 焦平面 |CoC| = 0.000 px；天空 = 上限 11 px；前景标签恒 0（2200+ 样本） | 直接读半分辨率 CoC 靶的 alpha（半浮点解码） |

**GPU 单段耗时（配对差分，1600×900 输出 / 内部 0.8）**。取证期间有别的代理在同一台
机器上跑浏览器测试（70–120 个浏览器进程），各自取最小值再相减会给出「开着比关着还快」
这种不可能的排序；改成**每一轮紧挨着测 on / off 再取逐轮差的中位数**（噪声是共模的，
配对能消掉）之后才稳：

| 段 | 逐轮差中位数 | 噪声带（IQR） |
|---|---:|---|
| 整条 post 链（`P.Render` 一次） | 5.0 ms | — |
| motionBlur（全分辨率 12 抽样） | **+0.25 ms** | ±0.5 ms |
| dof（四分之一分辨率 48 抽样，远景档） | **+0.40 ms** | ±0.5 ms |
| taa 解算（含 TAAU 上采样） | **+0.15 ms** | ±0.5 ms |

#### `renderScale` 的省时量：2026-09-08 集成期复量到了

B6b 单跑那一轮**没量出来**（1.0 与 0.8 / 0.75 / 0.67 的配对差都落在 ±0.1 ms 以内），
当时留了两种解释：① 场景是逐 draw 绑定的，缩分辨率本来就省不到；② 计时被别的
进程的抢占淹掉。合流之后重量，答案是 ② —— **量法不对，不是省不到**。

这一轮的量法（3394×1348 输出、high、`?shot=1&phase=2`，14 轮 A/B 交替，
每轮每档取 5 帧中位数，再取**逐轮配对差**的中位数）：

| | 内部靶 | GPU 中位数 | CPU submit 中位数 | draw calls |
|---|---|---:|---:|---:|
| `renderScale = 1.0` | 3394×1348 | 15.53 ms | 22.20 ms | 736 |
| `renderScale = 0.8` | 2715×1078 | 12.48 ms | 18.00 ms | 740 |
| **逐轮配对差中位数** | — | **3.76 ms（−24.2%）** | 4.20 ms | — |

逐轮差 IQR [2.48, 5.09] ms，14 轮里只有 1 轮是负的 —— 符号稳，量级可信。
**0.8 省下来的 GPU 远超「≥ 10% 才值得付 3 dB PSNR」那条线，所以 high 的出厂
`renderScale` 保持 0.8。**

两条要写清楚的：

* **上一轮为什么量不到**：B6b 那次把 `SetSize(w*s, h*s)` 两组尺寸一起缩（相当于
  连输出也缩了），于是「省下来的填充」和「输出靶也变小」纠缠在一起；这一轮
  **输出恒钉 3394×1348，只动内部**（`SetSize(w*s, h*s, 3394, 1348)`），
  量的才是 renderScale 本身。取证脚本还得在每次 `SetSize` 之后推 24 帧
  —— SetSize 会作废 TAA 历史，不滚满量到的是「历史重建」那几帧。
* **CPU submit 那 4.2 ms 不是真省了 CPU**：draw call 数几乎没变（736 vs 740），
  变的是 D3D11 命令队列满时的背压 —— GPU 慢，`renderer.render()` 的 JS 侧就被
  拖住。别拿它当「renderScale 还能省 CPU」的证据。

顺带记两条不受噪声影响的：运动模糊与景深各是 **4 个 draw call**，
`motionBlur = 0` / `dofStrength = 0` 时整个 pass 不跑（`renderer.info.render.calls`
从 569 掉到 565），GPU 分段也整个消失。

### 17.10 实例化 / 非蒙皮刚体的逐物体速度：量过了，本轮不做

`docs` §1.6 留的那两条已知近似（InstancedMesh / BatchedMesh 与非蒙皮刚体运动件
**只有相机速度**）本轮**没有**补上。不是漏掉，是量完之后决定不做。实测（phase=1、
scale=medium、玩家在西关大街）：

| 数 | 值 |
|---|---:|
| InstancedMesh 只数 / 实例总数 | 161 / 2467 |
| 再挂一份上一帧 `instanceMatrix` 的显存 | **0.151 MB** |
| BatchedMesh | 1 |
| 可见的非蒙皮普通 Mesh | 432 |
| 其中**已经占着 `onBeforeRender`** 的 | **419**（BuildSink 的破口裁切） |
| 其中前景标签（第一人称手/枪） | 13 |
| **没有钩子、能直接挂 `MarkDynamicPrepass` 的** | **0** |

两条各自的拦路石：

* **非蒙皮刚体**：`MarkDynamicPrepass` 是**直接赋值** `object.onBeforeRender`，
  而 432 只可见网格里 **一只空闲的都没有** —— 419 只被破口裁切占着、13 只被前景
  标签占着。挂上去等于把破口裁切静默摘掉（墙上打了洞照样是完整的墙）。
  改成链式调用是可行的，但成本那一条仍在：逐 draw 置 `uniformsNeedUpdate` 会把
  整份 uniform（含 24 组破口数组、288 个 float）重传，419 只 × 进出各一次 =
  每帧 838 次全量重传，正好撞在「CPU 提交是瓶颈」那条红线上（`FrameProfileTest`
  的 baseline 是 submit ≈ 15 ms）。
* **实例化**：显存不是问题（0.15 MB）。问题是预通道的覆盖材质**全场只有一份**，
  自定义属性的 `#define` 是材质级不是对象级 —— 要么 161 只 InstancedMesh
  （以及布设流送、`Script_ActorBatch` 之后新建的每一只）**都**带上第二份
  `instanceMatrix` 属性，要么缺属性的那几只会拿到全零矩阵、几何整只塌到原点
  （而且是静默的）。这是一条跨 `BuildSink` / 布设流送 / `ActorBatch` 三处的契约，
  不该由后处理这一侧单方面加。

**现状的实际影响**：远景人群（`Script_ActorBatch` 的实例化 LOD）与会动的布设件在
速度靶里是「静止物体」，所以它们不吃逐物体运动模糊、TAA 对它们只能靠邻域裁剪。
近处的兵是真 SkinnedMesh，逐骨骼速度是准的 —— 运动模糊那张转身截图里几个兵都糊对了。

**要做的话该怎么做**（留给拥有 `Script_ActorBatch` / `BuildSink` 的人）：
① 在 InstancedMesh 的建构处统一挂 `aPrevInstanceMatrix`（缺一只就塌，所以必须在
建构处而不是在预通道里补）；② 把 `MarkDynamicPrepass` 改成链式钩子，并把破口裁切
那一组 uniform 挪进 UBO 或独立材质，让逐 draw 只重传一个矩阵。
