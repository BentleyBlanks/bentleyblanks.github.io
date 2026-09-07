// 《台儿庄：血战滕县》材质补丁注册表。
//
// ## 为什么要有它
// three 一个材质**只有一个** `onBeforeCompile` 钩子。谁后写谁把前面的整个覆盖掉，
// 而且没有任何报错 —— SSAO 曾经就这么静默消失过。于是「往 MeshStandardMaterial
// 里插一段 GLSL」这件事必须集中：所有补丁在**同一个**钩子里按固定顺序做完，
// `customProgramCacheKey` 由各补丁的 key 拼出来。
//
// 2026-09 帧图重构之前，这段逻辑是 `Script_Materials.InjectIndirectLighting` 里
// 一坨三百行的 if/else。现在它是一张注册表：GTAO / SSR / 接触阴影 / 簇状多光源
// 各写一个补丁，插进列表即可，互不覆盖。
//
// ## 用法
// ```js
// const patch = MakePatch({
//   key: "ssr1",                                  // 或 () => `ssr${mode}`（运行时三态）
//   uniforms: (shaderUniforms) => { shaderUniforms.uSsr = ssr.map; },
//   fragment: [["#include <lights_fragment_end>", `...glsl...`]],
//   vertex:   [["#include <common>", `varying vec3 vFoo;`]],
//   defines:  { USE_SSR: "" },
// });
// ApplyPatches(material, [ScreenSpaceInputs, Ssao, Gi, Ssr, Destruction]);
// ```
// `vertex` / `fragment` 也可以是 `(shader) => [[anchor, glsl], ...]` 的函数 ——
// 内容依赖运行时开关（GI 的采样层就是）时必须用函数，**编译那一刻现读**。
//
// ## 锚点表（three r185 的 chunk 名；每个锚点处能拿到什么）
//
// | 锚点 | 着色器 | 那里有什么 |
// |---|---|---|
// | `#include <common>` | 顶点 / 片元 | 只能放 uniform / varying / 函数声明。片元这里还没有任何几何量。 |
// | `#include <project_vertex>` | 顶点 | `transformed`（局部坐标，已过形变/蒙皮）、`mvPosition`、`gl_Position`、`modelMatrix`、`batchingMatrix`/`instanceMatrix`（按宏）。算世界坐标就在这儿。 |
// | `#include <color_fragment>` | 片元 | `diffuseColor`（rgb = BaseColor × vertexColor，a = 不透明度）。 |
// | `#include <roughnessmap_fragment>` | 片元 | `roughnessFactor`（真正进 BRDF 的那个标量）。 |
// | `#include <metalnessmap_fragment>` | 片元 | `metalnessFactor`。 |
// | `#include <lights_fragment_begin>` | 片元 | `geometryNormal`（**视空间**！）、`geometryViewDir`、`geometryPosition`、`material`、`vDirectionalShadowCoord[]`、`getShadow()`。直接光循环从这里开始。 |
// | `#include <lights_fragment_maps>` | 片元 | `iblIrradiance`（漫反射 IBL，量纲 = π×辐射亮度）、`radiance`（镜面 IBL）、`irradiance`。**替换天空 IBL 就在这儿**。 |
// | `#include <aomap_fragment>` | 片元 | `reflectedLight.{direct,indirect}{Diffuse,Specular}` 都已累加完，`aoMap` 也乘过。**SSAO 实际压间接光的位置**；再往后就是加总。 |
// | `#include <lights_fragment_end>` | 片元 | 同上，最后一次能改 `reflectedLight` 的地方。 |
// | `#include <clipping_planes_fragment>` | 片元 | 最早能 `discard` 的地方（破口裁切用它）。 |
// | `#include <dithering_fragment>` | 片元 | `gl_FragColor` 已成型。整帧覆盖输出（调试假彩色）用它。 |
//
// 三条不许破：
//   · **`geometryNormal` 是视空间**。要世界法线自己
//     `transformNormalByInverseViewMatrix(geometryNormal, viewMatrix)`。
//   · **改了代码就必须改 cache key**，而且运行时会翻的位要**每次编译现读**
//     （`key` 写成函数）。少了这一条，两种档位共用同一份编译缓存。
//   · 锚点一律**追加在 chunk 之后**（`#include <x>` → `#include <x>\n你的代码`），
//     不要整段替换 —— 多个补丁挂同一个锚点时按注册顺序拼接。

import { GI_SAMPLE_GLSL, BindGiUniforms } from "./Script_Gi.mjs";
import { BindDestructionUniforms, DestructionShaderGlsl } from "./Script_Destruction.mjs";
import {
  CLUSTER_COMMON_GLSL, ClusterLoopGlsl, BindClusterUniforms, GetActiveClusteredLights,
} from "./Script_ClusteredLights.mjs";

/**
 * 造一个补丁。字段全是可选的（只加 uniform 不改代码也合法）。
 * @param {object} spec
 * @param {string|(()=>string)} spec.key 进 customProgramCacheKey 的标识
 * @param {(uniforms:object, shader:object)=>void} [spec.uniforms]
 * @param {Array|((shader:object)=>Array)} [spec.vertex] `[[anchor, glsl], ...]`
 * @param {Array|((shader:object)=>Array)} [spec.fragment] `[[anchor, glsl], ...]`
 * @param {object} [spec.defines]
 */
export function MakePatch(spec) {
  return {
    key: spec.key ?? "",
    uniforms: spec.uniforms ?? null,
    vertex: spec.vertex ?? null,
    fragment: spec.fragment ?? null,
    defines: spec.defines ?? null,
  };
}

function ResolveEntries(source, shader) {
  if (!source) return [];
  return typeof source === "function" ? (source(shader) || []) : source;
}

function CollectAnchors(target, entries) {
  for (const entry of entries) {
    if (!entry) continue;
    const [anchor, glsl] = entry;
    if (!anchor || !glsl) continue;
    const list = target.get(anchor);
    if (list) list.push(glsl);
    else target.set(anchor, [glsl]);
  }
}

function ApplyAnchors(source, byAnchor) {
  let out = source;
  for (const [anchor, parts] of byAnchor) {
    if (!out.includes(anchor)) {
      // 锚点不存在 = three 换了 chunk 名或者这份材质根本没有那一段。
      // 静默跳过是最坏的选择（画面少一块，没人知道），所以吼一声。
      console.warn(`[MaterialPatches] 锚点缺失，补丁没接上：${anchor}`);
      continue;
    }
    out = out.replace(anchor, `${anchor}\n${parts.join("\n")}`);
  }
  return out;
}

/**
 * 把一组补丁装到材质上。**一个 onBeforeCompile 做完全部替换**。
 * 重复调用会整体覆盖上一次（这是有意的：调用方持有完整补丁列表）。
 * @param {THREE.Material} material
 * @param {Array} patches 顺序即拼接顺序；null / undefined 自动跳过
 */
export function ApplyPatches(material, patches) {
  const list = (patches || []).filter(Boolean);
  material.onBeforeCompile = (shader) => {
    const vertexByAnchor = new Map();
    const fragmentByAnchor = new Map();
    for (const patch of list) {
      patch.uniforms?.(shader.uniforms, shader);
      CollectAnchors(vertexByAnchor, ResolveEntries(patch.vertex, shader));
      CollectAnchors(fragmentByAnchor, ResolveEntries(patch.fragment, shader));
      if (patch.defines) {
        shader.defines = shader.defines || {};
        Object.assign(shader.defines, patch.defines);
      }
    }
    shader.vertexShader = ApplyAnchors(shader.vertexShader, vertexByAnchor);
    shader.fragmentShader = ApplyAnchors(shader.fragmentShader, fragmentByAnchor);
  };
  // 缓存键必须跟着注入组合走，而且**每次编译现读** —— 运行时翻转某个补丁的
  // 三态位再 needsUpdate，就能拿到另一套程序而不撞缓存。
  material.customProgramCacheKey = () => list
    .map((patch) => (typeof patch.key === "function" ? patch.key() : patch.key))
    .join("|");
  material.userData.materialPatchKeys = list.map((patch) => patch.key);
  return material;
}

/** 一份材质当前挂了哪些补丁（取证用；key 是函数时求值）。 */
export function PatchKeysOf(material) {
  const keys = material?.userData?.materialPatchKeys;
  if (!keys) return [];
  return keys.map((key) => (typeof key === "function" ? key() : key));
}

// ===========================================================================
// 现役补丁三路：屏幕空间 AO / 探针体 GI（含三态与全部调试视图）/ 破口裁切。
// 2026-09 帧图重构从 `Script_Materials.InjectIndirectLighting` 原样搬来，
// GLSL 一个字没改（拼接顺序与空白有差异，编译结果相同）。
// ===========================================================================

/**
 * 屏幕空间 AO。
 *
 * `<common>` 那一段同时是**「屏幕空间输入」的公共声明块** —— SSR / 接触阴影 /
 * GTAO 要按 `gl_FragCoord.xy / 屏幕分辨率` 取自己的全屏图时，直接用这里已经声明
 * 好的 `uScreenResolution`（就是 `uSsaoResolution`，`Script_Main` 喂的是**主渲染靶**
 * 的尺寸而不是 AO 靶的尺寸 —— 这条踩过两轮：喂错了整张 AO 会放大 1.333 倍并错位）。
 * 没有 ssao 的档位（low）不含这一段，那些补丁得自带一份分辨率 uniform。
 *
 * `<aomap_fragment>` 那一段是**SSAO 唯一允许生效的位置**：那里 aoMap 已经乘过、
 * 直接光与间接光都累加完，往后就是加总。乘到最终颜色上等于连直接光一起压黑。
 */
export function MakeSsaoPatch(ssao) {
  if (!ssao) return null;
  return MakePatch({
    key: "ssao1",
    uniforms: (uniforms) => {
      uniforms.uSsaoMap = ssao.map;
      uniforms.uSsaoResolution = ssao.resolution;
      uniforms.uSsaoStrength = ssao.strength;
    },
    fragment: [
      ["#include <common>", /* glsl */`
        uniform sampler2D uSsaoMap;
        uniform vec2 uSsaoResolution;
        uniform float uSsaoStrength;
        // 屏幕空间输入的公共别名：AO / SSR / 接触阴影共用这一份主靶分辨率。
        #define uScreenResolution uSsaoResolution`],
      ["#include <aomap_fragment>", /* glsl */`
        {
          float ssao = texture2D(uSsaoMap, gl_FragCoord.xy / uSsaoResolution).r;
          ssao = mix(1.0, ssao, uSsaoStrength);
          reflectedLight.indirectDiffuse *= ssao;
          // 镜面遮蔽：粗糙面遮得多、光滑面遮得少（Lagarde 的近似）
          reflectedLight.indirectSpecular *= clamp(pow(ssao, 1.0 + material.roughness * 2.0), 0.0, 1.0);
        }`],
    ],
  });
}

/**
 * 探针体 GI。**编译期三态**（key 每次编译现读 `gi.sampling`）：
 *   0 无（gi 为 null）/ 1 只有调试层 / 2 带探针采样。
 *
 * 采样层（GI_SAMPLE_GLSL + 图集 uniforms + uGiEnabled 分支）只在探针体打开时
 * 编进去。即使 uGiEnabled 恒为 0 这坨代码也占着采样器与寄存器，实测整帧贵
 * ~2.7 ms（2026-08-26 FrameProfileTest，RTX 4070 SUPER）。
 * 调试层（uGiDebugView / gGiDebugColor / 视图 1-13 / 末端整帧覆盖）**关着也要在**：
 * `?giView` 与 Debug Rendering 面板不依赖探针体。
 */
export function MakeGiPatch(gi) {
  if (!gi) return null;
  return MakePatch({
    key: () => `gi${gi.sampling !== false ? 2 : 1}`,
    uniforms: (uniforms) => {
      if (gi.sampling !== false) BindGiUniforms(uniforms, gi);
      else uniforms.uGiDebugView = gi.debugView;
    },
    vertex: () => (gi.sampling === false ? [] : [
      // 世界坐标要自己传：three 的 worldPosition 只在开了阴影/envMap 时才有，
      // 靠它等于把 GI 的生死系在别的开关上。实例化/骨骼的矩阵顺序照抄 <project_vertex>。
      ["#include <common>", /* glsl */`
        varying vec3 vGiWorldPos;`],
      ["#include <project_vertex>", /* glsl */`
        {
          vec4 giWorld = vec4(transformed, 1.0);
          #ifdef USE_BATCHING
            giWorld = batchingMatrix * giWorld;
          #endif
          #ifdef USE_INSTANCING
            giWorld = instanceMatrix * giWorld;
          #endif
          vGiWorldPos = (modelMatrix * giWorld).xyz;
        }`],
    ]),
    fragment: () => {
      // 材质通道假彩色（6 BaseColor / 7 粗糙度 / 8 金属度 / 9 太阳阴影）。
      // 前向管线没有延迟渲染的 GBuffer，这些通道只在材质自己的着色器里存在 ——
      // 想看它们只有一条路：让材质把该通道当颜色写出去。各通道在它诞生的
      // chunk 之后立刻抓（那时值刚算完、还没被后续光照消费掉）。
      const channelViews = [
        ["#include <color_fragment>", /* glsl */`
        if (uGiDebugView > 5.5 && uGiDebugView < 6.5) gGiDebugColor = diffuseColor.rgb;`],
        ["#include <roughnessmap_fragment>", /* glsl */`
        if (uGiDebugView > 6.5 && uGiDebugView < 7.5) gGiDebugColor = vec3(roughnessFactor);`],
        ["#include <metalnessmap_fragment>", /* glsl */`
        if (uGiDebugView > 7.5 && uGiDebugView < 8.5) gGiDebugColor = vec3(metalnessFactor);`],
        // 太阳阴影因子：白 = 照到，黑 = 挡住。r185 的 getShadow 六参签名。
        // 不收影的材质（USE_SHADOWMAP 未定义）保持 0 —— 黑 = 没参与收影，也是信息。
        // 阴影框只有 66 m：框外 getShadow 的 frustumTest 不过、恒返回 1（纯白），
        // 这个视图顺带能看到阴影覆盖范围的边。
        ["#include <lights_fragment_begin>", /* glsl */`
        #if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
        if (uGiDebugView > 8.5 && uGiDebugView < 9.5) {
          gGiDebugColor = vec3(getShadow(directionalShadowMap[0],
            directionalLightShadows[0].shadowMapSize, directionalLightShadows[0].shadowIntensity,
            directionalLightShadows[0].shadowBias, directionalLightShadows[0].shadowRadius,
            vDirectionalShadowCoord[0]));
        }
        #endif`],
        ["#include <dithering_fragment>", /* glsl */`
        if (uGiDebugView > 0.5) gl_FragColor = vec4(gGiDebugColor, diffuseColor.a);`],
        // 光照分量必须在 <aomap_fragment> **之后**截取：这里正是 SSAO 实际压过
        // indirectDiffuse / indirectSpecular 的位置；往 lights_fragment_end 前挪会把
        // 未遮蔽的旧值拿去调试，面板反而和正式画面不一致。
        ["#include <aomap_fragment>", /* glsl */`
        // 10 直射漫反射 / 11 直射镜面 / 12 IBL 反射 / 13 GI/IBL 漫反射。
        // 四项都是 reflectedLight 的正式累积项；不要从最终 totalDiffuse/
        // totalSpecular 再猜，后者已经把两条路径相加，无法定位是哪一路失衡。
        if (uGiDebugView > 9.5 && uGiDebugView < 10.5) gGiDebugColor = reflectedLight.directDiffuse;
        if (uGiDebugView > 10.5 && uGiDebugView < 11.5) gGiDebugColor = reflectedLight.directSpecular;
        if (uGiDebugView > 11.5 && uGiDebugView < 12.5) gGiDebugColor = reflectedLight.indirectSpecular;
        if (uGiDebugView > 12.5 && uGiDebugView < 13.5) gGiDebugColor = reflectedLight.indirectDiffuse;`],
      ];
      if (gi.sampling === false) {
        // 调试视图基建（无探针采样版）。视图语义按「GI 关闭时材质实际在用什么」走：
        //   1/2 = 天空 IBL×0.05 —— 采样层没编进来，材质实际采用的间接辐照度**就是**
        //         iblIrradiance，所以视图 1 与视图 2 在这个档位是同一张图；
        //   3/4/5 = 黑 —— confidence / 亮度比 / 权重和都是探针量，没有探针 = 0，
        //         黑不是坏视图，是准确信息（画面里没有探针 GI）；
        //   6-9 材质通道、10-13 光照分量与采样版逐字节相同。
        return [
          ["#include <common>", /* glsl */`
        uniform float uGiDebugView;
        vec3 gGiDebugColor = vec3(0.0);`],
          ["#include <lights_fragment_maps>", /* glsl */`
        #if defined( RE_IndirectDiffuse )
        if (uGiDebugView > 0.5 && uGiDebugView < 2.5) gGiDebugColor = iblIrradiance * 0.05;
        #endif`],
          ...channelViews,
        ];
      }
      return [
        ["#include <common>", /* glsl */`
        varying vec3 vGiWorldPos;
        vec3 gGiDebugColor = vec3(0.0);
${GI_SAMPLE_GLSL}`],
        // GI 直接**替换**天空 IBL 的漫反射项。探针体里已经含了天光，再加一份就是
        // 双份；而 iblIrradiance 本身没有位置概念，正是要被换掉的那个。镜面那一路
        // （radiance）留给 IBL，但按 GI/天空的亮度比做一次遮蔽 —— 否则屋里的
        // 金属件照样反着一片亮天。
        ["#include <lights_fragment_maps>", /* glsl */`
        #if defined( RE_IndirectDiffuse )
        if (uGiEnabled > 0.001) {
          // geometryNormal 是**视空间**的，不转回世界空间就会得到一张跟着镜头转的假 GI
          vec3 giNormal = transformNormalByInverseViewMatrix(geometryNormal, viewMatrix);
          vec3 giView = normalize(cameraPosition - vGiWorldPos);
          float giConfidence;
          vec3 giIrradiance = GiSampleIrradiance(vGiWorldPos, giNormal, giView, giConfidence) * uGiIntensity;
          // uGiEnabled 是 0→1 的淡入量（图集收敛前是 0），不是开关
          giConfidence *= uGiEnabled;
          // 体积**外**的回退值。画质面板那根「间接光强度」已经乘进了 uGiIntensity
          // （探针一侧），回退的天空 IBL 必须乘同一份 —— 少乘一边，×2 就等于
          // 「体内两倍、体外一倍」，体积边界上凭空多出一圈硬色差，而且体积跟着
          // 玩家滚，那圈色差就跟着人走。乘数跟着 uGiEnabled 淡入：图集还没收敛
          // 就先把体外提亮的话，进关那一秒会先闪一下再落回来。
          vec3 giFallback = iblIrradiance * mix(1.0, uGiGain, uGiEnabled);
          // ?giView= 假彩色取证：1 材质最终采用的间接辐照度×0.05 /
          // 2 被替换前的天空 IBL×0.05（不含上面那份增益，看的是「原样的天」）/
          // 3 confidence / 4 探针 GI 与体外回退的亮度比×0.25（与曝光无关，
          // 1.0 的比值显示为 0.25 灰；比值离 1 越远，体积边界那条缝越明显）。
          // 在 mix 之前抓，末端 <dithering_fragment> 处整帧覆盖输出。
          if (uGiDebugView > 0.5) {
            // 正片在探针体外（confidence=0）会回退到天空 IBL。这里以前只画
            // giIrradiance，体积边界外便整片纯黑，误报成“远处没有 GI”。调试图
            // 必须复现下面实际写回 iblIrradiance 的同一条 mix，才能显示真实结果。
            if (uGiDebugView < 1.5) {
              gGiDebugColor = mix(giFallback, giIrradiance, giConfidence) * 0.05;
            }
            else if (uGiDebugView < 2.5) gGiDebugColor = iblIrradiance * 0.05;
            else if (uGiDebugView < 3.5) gGiDebugColor = vec3(giConfidence);
            else if (uGiDebugView < 4.5) {
              float giDbgL = dot(giIrradiance, vec3(0.2126, 0.7152, 0.0722));
              float iblDbgL = max(dot(giFallback, vec3(0.2126, 0.7152, 0.0722)), 1e-4);
              gGiDebugColor = vec3(giDbgL / iblDbgL * 0.25);
            }
            // 5.5 的上界不能省：6-9 是材质通道视图，值在更早的 chunk 里已经抓好，
            // 这里兜底 else 一接就会把它们全冲成权重和（四个视图一模一样的灰）。
            else if (uGiDebugView < 5.5) gGiDebugColor = vec3(gGiDbgWeightSum * 0.5);
          }
          #if defined( RE_IndirectSpecular )
          if (giConfidence > 0.0) {
            // 遮蔽比要拿**同倍**的两侧比，否则增益一开就恒等于 1（屋里的金属件
            // 照样反着一片亮天）。giFallback 与 giIrradiance 都含增益，比值干净。
            float giSkyLum = max(dot(giFallback, vec3(0.2126, 0.7152, 0.0722)), 1e-4);
            float giLum = dot(giIrradiance, vec3(0.2126, 0.7152, 0.0722));
            float giOcclusion = clamp(giLum / giSkyLum, 0.0, 1.0);
            radiance *= mix(1.0, mix(1.0, giOcclusion, giConfidence), uGiSpecularOcclusion);
          }
          #endif
          // confidence=0 也要写回：那一路是 giFallback，增益在体外同样生效。
          iblIrradiance = mix(giFallback, giIrradiance, giConfidence);
        }
        #endif`],
        ...channelViews,
      ];
    },
  });
}

/**
 * 破口裁切。主材质、静态克隆与阴影深度材质三条链共用同一份 OBB + 断裂图案，
 * 少接一条就会出现「墙已经穿了，太阳底下还留一块完整墙影」这类不自洽。
 *
 * 世界坐标必须自己传：静态合批网格分区之后 modelMatrix 通常是单位阵，但编辑器
 * 与过场会真的移动整棵节点，拿 vViewPosition 反推会错。
 */
export function MakeDestructionPatch(destruction, { key = "destruction1" } = {}) {
  if (!destruction) return null;
  return MakePatch({
    key,
    uniforms: (uniforms) => { BindDestructionUniforms(uniforms, destruction); },
    vertex: [
      ["#include <common>", /* glsl */`
        varying vec3 vDamageWorldPos;`],
      ["#include <project_vertex>", /* glsl */`
        {
          vec4 damageWorld = vec4(transformed, 1.0);
          #ifdef USE_BATCHING
            damageWorld = batchingMatrix * damageWorld;
          #endif
          #ifdef USE_INSTANCING
            damageWorld = instanceMatrix * damageWorld;
          #endif
          vDamageWorldPos = (modelMatrix * damageWorld).xyz;
        }`],
    ],
    fragment: [
      ["#include <common>", /* glsl */`
        varying vec3 vDamageWorldPos;
${DestructionShaderGlsl(destruction.maxVolumes)}`],
      ["#include <clipping_planes_fragment>", /* glsl */`
        ApplyDamageVolumes(vDamageWorldPos);`],
    ],
  });
}

/**
 * 簇状前向光照的**局部光补丁**：替换 three 的点光/聚光循环。
 *
 * 它没有参数 —— 现役簇光系统是**全局单例**（`Script_ClusteredLights` 的
 * `SetActiveClusteredLights`），补丁在编译那一刻现问一次。这样接是有由头的：
 * 材质是 `MaterialLibrary` / `ActorFactory` / 过场三条链各自建的，而簇系统由
 * `LightRig` 构造，两边的构造顺序在正片与探针页里都是「材质在前」。把
 * cluster 一路穿过那三条链的签名，只为了拿一个全场唯一的对象，不划算。
 *
 * **没有簇系统时返回 null**：补丁列表里就没有这一项，`customProgramCacheKey`
 * 逐字节回到 2026-09 之前的 `ssao1|gi2`，low 档与旧回归口一个字不差。
 *
 * key 里带簇网格的形状（`clust64_16x9x24`）：改档位 = 换 GLSL 循环上界，
 * 必须换一份编译缓存。**灯的开关不在 key 里** —— 那是 `uClusterParams.w`
 * 这个运行时 uniform，点一处火不会重编译整座城。
 */
export function MakeClusteredLightsPatch() {
  const cluster = GetActiveClusteredLights();
  if (!cluster) return null;
  const grid = cluster.grid;
  return MakePatch({
    key: () => `clust${cluster.maxLights}_${grid.tilesX}x${grid.tilesY}x${grid.slices}`,
    uniforms: (uniforms) => { BindClusterUniforms(uniforms, cluster); },
    fragment: [
      ["#include <common>", CLUSTER_COMMON_GLSL],
      // 锚点选 `<lights_fragment_begin>` 之后：那里 geometryPosition（视空间）、
      // geometryNormal、material、reflectedLight、RE_Direct 全都在，而三方的
      // 点光/聚光循环刚跑完（NUM_POINT_LIGHTS = 0 时那两段整个不存在）。
      // 上界取 maxLights：一个簇最多也就登记这么多盏。
      ["#include <lights_fragment_begin>", ClusterLoopGlsl(cluster.maxLights)],
    ],
  });
}

/**
 * 现役间接光补丁组：顺序固定 **AO → GI → 簇光 → 破口**。
 * 新补丁插在哪儿要想清楚：`<aomap_fragment>` 上挂着 AO 的乘法与 GI 的光照分量
 * 取证，两者按这个顺序拼（AO 先压，取证后抓，面板读到的才是正式画面的值）。
 * 簇光排在 GI 之后：它往 `reflectedLight.direct*` 里加直接光，而 GI 改的是
 * `iblIrradiance`（间接光），两者锚点不同、互不覆盖；排在 AO 的
 * `<aomap_fragment>` **之前**是必须的 —— 局部光是直接光，不该被 SSAO 压。
 */
export function IndirectLightingPatches({ ssao = null, gi = null, destruction = null } = {}) {
  return [
    MakeSsaoPatch(ssao), MakeGiPatch(gi), MakeClusteredLightsPatch(), MakeDestructionPatch(destruction),
  ].filter(Boolean);
}
