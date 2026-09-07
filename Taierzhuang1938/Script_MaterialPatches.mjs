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
// 各写一个补丁，插进列表即可，互不覆盖（簇状多光源已经按这条路接上了）。
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
import { MakeCsmPatch } from "./Script_Csm.mjs";

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
// 现役补丁：ORM 三合一 / 屏幕空间 AO+SSIL / 探针体 GI（含三态与全部调试视图）/
// 屏幕空间反射 / 簇状局部光 / 破口裁切。
// AO 与 GI 是 2026-09 帧图重构从 `Script_Materials.InjectIndirectLighting`
// 原样搬来的，GLSL 一个字没改（拼接顺序与空白有差异，编译结果相同）。
// ===========================================================================

/**
 * ORM 三合一：把 `metalnessMap` / `aoMap` 从材质上摘掉，改成从 `roughnessMap`
 * 那一个采样器里读 `.b` / `.r`。**这是采样器预算的头号腾槽手段（省 2 个单元）。**
 *
 * ## 为什么必须摘
 * 本仓的 ORM 是一张图喂三个槽（glTF 的 metallic-roughness 打包约定）。
 * three **不做去重**：`roughnessMap` / `metalnessMap` / `aoMap` 各声明一个
 * `uniform sampler2D`，即使绑的是同一张纹理也各占一个纹理单元。ANGLE-D3D11 上
 * `MAX_TEXTURE_IMAGE_UNITS = 16`，八个子系统合流之后静态墙材质要 17 个 ——
 * 超了程序不链接、那只材质整只不画（口径见 docs §1.8 的采样器预算表）。
 *
 * ## 为什么是「留 roughnessMap、摘另外两个」而不是自己声明一张 uOrmMap
 * 留着三方那一个的话，采样器、uv varying（`vRoughnessMapUv`）与 uv 变换矩阵
 * 全部由 three 自己维护，一个字都不用猜。自己声明 `uOrmMap` 就得自己接 uv：
 * `repeat` 是逐材质克隆的，猜错一次整张贴图就错位。
 *
 * ## 逐像素等价的依据
 *   · `metalnessMap` 与 `roughnessMap` 是**同一个 Texture 对象**（下面按对象相等
 *     判定，不等就不折叠），所以 uv 变换矩阵与通道号一定相同；
 *   · `aoMap` 同理。r152 起 aoMap 走的是 `texture.channel`（缺省 0 = `uv`），
 *     **不再硬绑 uv1**，与 roughnessMap 落在同一套 `vRoughnessMapUv` 上；
 *   · 下面 `<aomap_fragment>` 那一段是三方 `aomap_fragment` chunk 的逐行搬运
 *     （含 clearcoat / sheen / `computeSpecularOcclusion` 三个分支）。
 *
 * @param {{metalness:boolean, ao:boolean, aoIntensity:{value:number}}|null} orm
 *        `FoldOrmMaps()` 的返回值。
 */
export function MakeOrmPatch(orm) {
  if (!orm || (!orm.metalness && !orm.ao)) return null;
  return MakePatch({
    key: `orm${orm.metalness ? "m" : ""}${orm.ao ? "a" : ""}`,
    uniforms: (uniforms) => { uniforms.uOrmAoIntensity = orm.aoIntensity; },
    // **不加 define**：`onBeforeCompile` 里的 `shader.defines` 就是 `material.defines`
    // 本身，往里写一位会永久留在材质上，而 `getParameters` 是在 onBeforeCompile
    // **之前**读它的 —— 于是同一份材质会先按"没有这一位"编一次、重编时再按
    // "有这一位"编一次，`renderer.info.programs` 里凭空多出一份重复程序。
    // 下游（B7 的微阴影）要知道 ORM 折没折，走 JS 侧的补丁参数，不走 define。
    fragment: [
      ["#include <common>", /* glsl */`
        uniform float uOrmAoIntensity;
        // 本像素的 ORM texel 与材质自带的遮蔽量。后者给 B7 的微阴影用
        // （它挂在 <lights_fragment_end>，比 <aomap_fragment> 早，读不到下面算的值）。
        vec4 gOrmTexel = vec4(1.0);
        float gMaterialAo = 1.0;`],
      // texelRoughness 是三方在 <roughnessmap_fragment> 里声明的**函数作用域**变量，
      // chunk 之后仍在作用域内 —— 直接接过来，一次纹理取样都不多花。
      ["#include <roughnessmap_fragment>", /* glsl */`
        #ifdef USE_ROUGHNESSMAP
          gOrmTexel = texelRoughness;
          gMaterialAo = gOrmTexel.r;
        #endif`],
      ...(orm.metalness ? [["#include <metalnessmap_fragment>", /* glsl */`
        #ifdef USE_ROUGHNESSMAP
          metalnessFactor *= gOrmTexel.b;
        #endif`]] : []),
      // 三方 aomap_fragment 的逐行搬运。**必须排在 GTAO 之前**（补丁列表里 ORM 是
      // 第一路）：材质自带的遮蔽是烘进贴图的小尺度细节，屏幕空间那一份压的是
      // 同一批间接光，顺序反了等于把屏幕空间 AO 又乘了一遍材质 AO 的倒数。
      ...(orm.ao ? [["#include <aomap_fragment>", /* glsl */`
        #ifdef USE_ROUGHNESSMAP
        {
          float ormAo = (gOrmTexel.r - 1.0) * uOrmAoIntensity + 1.0;
          reflectedLight.indirectDiffuse *= ormAo;
          #if defined( USE_CLEARCOAT )
            clearcoatSpecularIndirect *= ormAo;
          #endif
          #if defined( USE_SHEEN )
            sheenSpecularIndirect *= ormAo;
          #endif
          #if defined( USE_ENVMAP ) && defined( STANDARD )
            float ormDotNV = saturate(dot(geometryNormal, geometryViewDir));
            reflectedLight.indirectSpecular *= computeSpecularOcclusion(ormDotNV, ormAo, material.roughness);
          #endif
          gMaterialAo = ormAo;
        }
        #endif`]] : []),
    ],
  });
}

/**
 * 把一份材质的 ORM 折成一个采样器：摘掉 `metalnessMap` / `aoMap`（仅当它们与
 * `roughnessMap` 是同一个 Texture 对象），返回给 `MakeOrmPatch` 的描述子。
 *
 * **幂等**：结果记在 `material.userData.ormUniforms`（纯 JSON，`clone()` 的
 * `JSON.parse(JSON.stringify(userData))` 能原样带过去），第二次调用直接取回 ——
 * 静态克隆、第一人称克隆、外部 GLB 重复配置三条路都会二次注入。
 *
 * 不折叠的情形（原样返回 null，材质保持三方默认）：没有 `roughnessMap`；
 * 或者 `metalnessMap` / `aoMap` 是**另一张**图（那就不是打包 ORM，各读各的）。
 */
export function FoldOrmMaps(material) {
  if (!material) return null;
  if (material.userData.ormUniforms !== undefined) return material.userData.ormUniforms;
  const rough = material.roughnessMap || null;
  let folded = null;
  if (rough) {
    const metalness = material.metalnessMap === rough;
    const ao = material.aoMap === rough;
    if (metalness || ao) {
      folded = {
        metalness, ao,
        aoIntensity: { value: ao ? (material.aoMapIntensity ?? 1) : 1 },
      };
      if (metalness) material.metalnessMap = null;
      if (ao) material.aoMap = null;
    }
  }
  material.userData.ormUniforms = folded;
  return folded;
}

/**
 * 环境光遮蔽 + 弯曲法线镜面遮蔽 + SSIL（2026-09 起，屏幕空间来源是
 * `Script_PostGtao.mjs`）。
 *
 * `<common>` 那一段同时是**「屏幕空间输入」的公共声明块** —— SSR / 接触阴影
 * 要按 `gl_FragCoord.xy / 屏幕分辨率` 取自己的全屏图时，直接用这里已经声明
 * 好的 `uScreenResolution`（就是 `uSsaoResolution`，`Script_Main` 喂的是**主渲染靶**
 * 的尺寸而不是 AO 靶的尺寸 —— 这条踩过两轮：喂错了整张 AO 会放大并错位）。
 * 没有 AO 的档位（low 出厂）不含这一段，那些补丁得自带一份分辨率 uniform。
 *
 * `<aomap_fragment>` 那一段是**遮蔽唯一允许生效的位置**：那里 aoMap 已经乘过、
 * 直接光与间接光都累加完（`lights_fragment_end` 在它前面），往后就是加总。
 * 乘到最终颜色上等于连直接光一起压黑（契约 6）。
 *
 * 这一段做四件事，**顺序不能换**：
 *   1) 联合双边升采样 —— AO 靶是半分辨率的（`aoScale`），直接双线性会在
 *      深度断层上糊出一圈光晕。用 AO 靶 alpha 里存的线性视深做深度加权，
 *      2×2 取样；`aoScale = 1` 时插值权重退化成 (1,0,0,0)，即精确直通。
 *   2) 多次反弹 —— Jimenez 2016 的 `GTAOMultiBounce`。只乘可见度会把亮反照率
 *      的凹角压得比现实黑（光在里面还会再弹几次）；这条三次多项式把它补回来，
 *      对暗反照率退化成恒等（`max(ao, …)` 保证不会比可见度更暗）。
 *   3) 镜面遮蔽 —— GTSO：可见性锥（轴 = 弯曲法线，张角来自 AO）与镜面锥
 *      （轴 = 反射向量，张角来自粗糙度）的球冠相交。**替换了旧的
 *      `pow(ao, 1+2·roughness)`** —— 那条只看 AO 标量，反射方向明明朝着开阔的
 *      天空也照样压暗；有了弯曲法线才知道"被挡住的是哪半边"。
 *   4) SSIL —— 近场反弹加进间接漫反射，**加在 AO 乘法之后**：AO 挖掉的正是
 *      这一份，先加再乘等于把反弹光也压一遍（双重压暗）。
 *
 * uniform 包由 `Script_PostGtao.MakeAoUniforms` 造（正片与探针页共用）。
 * 老调用点只传 `{ map, resolution, strength }` 也能编 —— 缺的那几项按"没有
 * SSIL、AO 靶与主靶同尺寸"退化。
 */
export function MakeAmbientOcclusionPatch(ssao) {
  if (!ssao) return null;
  return MakePatch({
    key: "gtao1",
    uniforms: (uniforms) => {
      uniforms.uSsaoMap = ssao.map;
      uniforms.uSsaoResolution = ssao.resolution;
      uniforms.uAoTexelResolution = ssao.aoResolution ?? ssao.resolution;
      uniforms.uSsaoStrength = ssao.strength;
      uniforms.uSsilMap = ssao.ssilMap ?? { value: null };
      uniforms.uSsilStrength = ssao.ssilStrength ?? { value: 0 };
    },
    fragment: [
      ["#include <common>", /* glsl */`
        uniform sampler2D uSsaoMap;        // R=可见度 G,B=弯曲法线(oct) A=线性视深
        uniform vec2 uSsaoResolution;      // **主渲染靶**尺寸
        uniform vec2 uAoTexelResolution;   // AO 靶自己的尺寸（升采样要）
        uniform float uSsaoStrength;
        uniform sampler2D uSsilMap;        // RGB=近场反弹辐照度（关着时是 1×1 全黑）
        uniform float uSsilStrength;
        // 屏幕空间输入的公共别名：AO / SSR / 接触阴影共用这一份主靶分辨率。
        #define uScreenResolution uSsaoResolution

        vec3 AoOctDecode(vec2 e) {
          vec2 f = e * 2.0 - 1.0;
          vec3 n = vec3(f.x, f.y, 1.0 - abs(f.x) - abs(f.y));
          float t = max(-n.z, 0.0);
          n.x += n.x >= 0.0 ? -t : t;
          n.y += n.y >= 0.0 ? -t : t;
          return normalize(n);
        }

        // Jimenez et al. 2016, "Practical Realtime Strategies for Accurate
        // Indirect Occlusion"（Activision）的 GTAOMultiBounce。
        vec3 AoMultiBounce(float visibility, vec3 albedo) {
          vec3 a =  2.0404 * albedo - 0.3324;
          vec3 b = -4.7951 * albedo + 0.6417;
          vec3 c =  2.7552 * albedo + 0.6903;
          return max(vec3(visibility), ((visibility * a + b) * visibility + c) * visibility);
        }

        float AoFastAcos(float x) {
          float v = abs(x);
          float res = (-0.156583 * v + 1.57079632679) * sqrt(max(1.0 - v, 0.0));
          return x >= 0.0 ? res : 3.14159265359 - res;
        }

        // 两个球冠相交的面积（Oat & Sander 2007, "Ambient Aperture Lighting"）。
        float AoCapIntersection(float cosCap1, float cosCap2, float cosDistance) {
          float r1 = AoFastAcos(clamp(cosCap1, -1.0, 1.0));
          float r2 = AoFastAcos(clamp(cosCap2, -1.0, 1.0));
          float d = AoFastAcos(clamp(cosDistance, -1.0, 1.0));
          if (min(r1, r2) <= max(r1, r2) - d) return 1.0 - max(cosCap1, cosCap2);
          if (r1 + r2 <= d) return 0.0;
          float delta = abs(r1 - r2);
          float x = 1.0 - clamp((d - delta) / max(r1 + r2 - delta, 1e-4), 0.0, 1.0);
          return (x * x * (-2.0 * x + 3.0)) * (1.0 - max(cosCap1, cosCap2));
        }

        // GTSO（Jimenez 2016 §4 的工程形式）。roughness→0 时镜面锥收成一根线，
        // 分母趋 0，所以钳住并让极光滑面直接退回可见度（保守，不会漏光）。
        float AoSpecularOcclusion(vec3 bentNormal, float visibility, float roughness, vec3 refl) {
          float cosAv = sqrt(max(1.0 - visibility, 0.0));
          float r2 = roughness * roughness;
          float cosAs = exp2(-3.32193 * r2 * r2);
          float open = 1.0 - cosAs;
          if (open < 1e-3) return visibility;
          return clamp(AoCapIntersection(cosAv, cosAs, dot(bentNormal, refl)) / open, 0.0, 1.0);
        }

        // 联合双边升采样：2×2 双线性权重 × 深度接近度。断层处只剩同深度的那几个
        // 抽样，所以人物脚下的接触带不会在半分辨率下糊出一圈亮边。
        const vec2 AO_TAPS[4] = vec2[4](vec2(0.0, 0.0), vec2(1.0, 0.0), vec2(0.0, 1.0), vec2(1.0, 1.0));
        float AoUpsample(vec2 screenUv, float receiverZ, vec3 fallbackNormal, out vec3 bentNormal) {
          vec2 texel = screenUv * uAoTexelResolution - 0.5;
          vec2 baseCoord = floor(texel);
          vec2 aoFrac = texel - baseCoord;
          vec2 invSize = 1.0 / uAoTexelResolution;
          float visibility = 0.0;
          vec3 bent = vec3(0.0);
          float wsum = 0.0;
          for (int i = 0; i < 4; i++) {
            vec2 o = AO_TAPS[i];
            vec4 t = texture2D(uSsaoMap, (baseCoord + o + 0.5) * invSize);
            if (t.a <= 0.0) continue;               // 天空：没有 AO 数据
            float bw = mix(1.0 - aoFrac.x, aoFrac.x, o.x) * mix(1.0 - aoFrac.y, aoFrac.y, o.y);
            float dw = 1.0 / (1e-3 + abs(t.a - receiverZ) / max(receiverZ, 0.05));
            float w = bw * dw;
            visibility += t.r * w;
            bent += AoOctDecode(t.gb) * w;
            wsum += w;
          }
          // 一个有效抽样都没有：可见度 1、弯曲法线退回几何法线。
          // 这条不是只为天空留的 —— **low 档（preset.ssao = false）AO 那一趟根本不跑**，
          // 靶里躺的是建靶时的全零，A 通道 = 0 会整片走到这里。退回几何法线之后
          // 镜面遮蔽也恒等于 1（可见性锥张满半球、轴与反射向量同侧），画面与"没有 AO"
          // 完全一致；退回一个常数视向量的话掠射面会凭空多出一层假遮蔽。
          if (wsum <= 1e-5) { bentNormal = fallbackNormal; return 1.0; }
          bentNormal = normalize(bent);
          return visibility / wsum;
        }`],
      ["#include <aomap_fragment>", /* glsl */`
        {
          vec2 aoScreenUv = gl_FragCoord.xy / uSsaoResolution;
          vec3 aoBentNormal;
          float aoVisibility = AoUpsample(aoScreenUv, vViewPosition.z, geometryNormal, aoBentNormal);
          aoVisibility = clamp(mix(1.0, aoVisibility, uSsaoStrength), 0.0, 1.0);
          reflectedLight.indirectDiffuse *= AoMultiBounce(aoVisibility, material.diffuseContribution);
          reflectedLight.indirectSpecular *= AoSpecularOcclusion(
            aoBentNormal, aoVisibility, material.roughness,
            reflect(-geometryViewDir, geometryNormal));
          // SSIL 走一次普通双线性：它是低频量，边缘光晕远不如 AO 那样刺眼，
          // 而再来一趟四抽样是全分辨率主 pass 上的实打实开销。
          reflectedLight.indirectDiffuse += texture2D(uSsilMap, aoScreenUv).rgb
            * uSsilStrength * material.diffuseContribution * RECIPROCAL_PI;
        }`],
    ],
  });
}

/** 旧名字（2026-09 之前叫 SSAO 补丁）。外部调用点只有 IndirectLightingPatches。 */
export const MakeSsaoPatch = MakeAmbientOcclusionPatch;

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
 * 屏幕空间反射（`Script_PostSsr.mjs`）。补丁只做两件事：
 *
 *   1) `<lights_fragment_maps>` 之后按置信度把镜面 IBL 的 `radiance` **换成**
 *      SSR 的辐亮度。换而不是加 —— 加就是天空反射与屏幕空间反射双份。
 *      菲涅尔 / 能量补偿由三方后面的 `RE_IndirectSpecular_Physical` 负责，
 *      镜面遮蔽由 AO 补丁在 `<aomap_fragment>` 负责，这里**都不许再乘一次**。
 *   2) `<dithering_fragment>` 处把 `material.roughness` 写进 `gl_FragColor.a`。
 *      主 HDR 靶的 alpha 通道全链路无人读（composite 只取 .r/.g/.b 与 .rgb，
 *      bloom 全是 .rgb，TAA 写死 1，调试视图也只看 rgb），于是它就是这条
 *      前向管线里唯一一张免费的粗糙度 GBuffer —— 下一帧的 SSR 追踪端读它决定
 *      每个像素的 GGX 波瓣有多宽、要不要追。没有它，SSR 只能对全屏假设一个
 *      粗糙度，光滑地板与旧钢盔就分不开了。
 *
 * **只能挂在不透明材质上**：往 alpha 里写粗糙度会直接改混合结果。分流在
 * `Script_Materials`（`transparent` 的材质不传 ssr）。补丁自己再加一道
 * `diffuseColor.a >= 0.999` 的保险，两道都失手时也只会写回 1.0。
 *
 * 顺序固定在 **GI 之后**：GI 会按「探针亮度 / 天空亮度」的比值压 `radiance`
 * （屋里的金属件不该反一片亮天）。SSR 拿到的是真实屏幕空间的光，不该再吃
 * 那一层近似遮蔽，所以它排在后面、直接覆盖。
 */
export function MakeSsrPatch(ssr) {
  if (!ssr) return null;
  return MakePatch({
    key: "ssr1",
    uniforms: (uniforms) => {
      uniforms.uSsrMap = ssr.map;
      uniforms.uSsrResolution = ssr.resolution;
      uniforms.uSsrStrength = ssr.strength;
      uniforms.uSsrMaxRoughness = ssr.maxRoughness;
      uniforms.uSsrFadeAt = ssr.fadeAt;
    },
    fragment: [
      ["#include <common>", /* glsl */`
        uniform sampler2D uSsrMap;
        // **主渲染靶**尺寸，不是 SSR 靶尺寸。SSR 靶是半分辨率的，采样按
        // gl_FragCoord / 主靶尺寸做、靠双线性放大 —— 喂错就整张错位放大两倍
        // （SSAO 那条 uSsaoResolution 踩过两轮，这里不共用它：探针页喂给
        // uSsaoResolution 的是 AO 靶尺寸，共用会连坐）。
        uniform vec2 uSsrResolution;
        uniform float uSsrStrength;
        uniform float uSsrMaxRoughness;
        uniform float uSsrFadeAt;`],
      ["#include <lights_fragment_maps>", /* glsl */`
        #if defined( RE_IndirectSpecular )
        if (uSsrStrength > 0.0 && material.roughness <= uSsrMaxRoughness) {
          vec4 ssrTexel = texture2D(uSsrMap, gl_FragCoord.xy / uSsrResolution);
          // 追踪端已经按同一条曲线淡出过一次；材质这边再算一次是为了那些
          // 追踪端读到的粗糙度（上一帧 alpha）与本帧不一致的像素（运动边缘）。
          float ssrFade = 1.0 - smoothstep(uSsrFadeAt, uSsrMaxRoughness, material.roughness);
          float ssrWeight = clamp(ssrTexel.a * uSsrStrength * ssrFade, 0.0, 1.0);
          radiance = mix(radiance, max(ssrTexel.rgb, vec3(0.0)), ssrWeight);
        }
        #endif`],
      ["#include <dithering_fragment>", /* glsl */`
        // 下一帧 SSR 的粗糙度输入。写在最后：这时 gl_FragColor 已经成型，
        // 而 alpha 对不透明材质本来就恒等于 1，没人读。
        if (diffuseColor.a >= 0.999) gl_FragColor.a = clamp(material.roughness, 0.0, 1.0);`],
    ],
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
 * 现役间接光补丁组：顺序固定 **ORM → AO → GI → CSM → SSR → 簇光 → 破口**。
 * 新补丁插在哪儿要想清楚：
 *   · ORM 三合一排**最前**：它把材质自带的遮蔽（烘进贴图的小尺度细节）乘进
 *     `indirectDiffuse`，等价于三方 `aomap_fragment` chunk 原来的位置；
 *   · `<aomap_fragment>` 上挂着 AO 的乘法与 GI 的光照分量取证，两者按这个顺序拼
 *     （AO 先压、取证后抓，面板读到的才是正式画面的值）；
 *   · `<lights_fragment_maps>` 上挂着 GI 的 `radiance *= 遮蔽比` 与 SSR 的
 *     `radiance = mix(...)`，SSR 必须在后（它是真实屏幕空间的光，不该再吃一层
 *     「探针亮度／天空亮度」的近似遮蔽）；
 *   · 簇光挂在 `<lights_fragment_begin>` 之后，往 `reflectedLight.direct*` 里加直接光，
 *     与 GI/SSR 改的间接光锚点不同、互不覆盖；它在 AO 的 `<aomap_fragment>` **之前**
 *     是必须的 —— 局部光是直接光，不该被 SSAO 压；
 *   · CSM 那一路必须排在 **GI 之后** —— 它要覆盖 GI 补丁里视图 9「太阳阴影」那一行
 *     （同锚点按注册顺序拼接，后写的赢）。**级联阴影本体不在补丁里**：它整段替换了
 *     `ShaderChunk.lights_fragment_begin`，覆盖每一份内置光照材质（连没走 MaterialLibrary
 *     的都算），见 `Script_Csm.mjs` 抬头。这里的 CSM 补丁只做两件补丁注册表才做得到的事：
 *     接屏幕空间接触阴影那张全屏图，以及把调试视图 9 改读级联可见度。
 */
export function IndirectLightingPatches({
  orm = null, ssao = null, gi = null, ssr = null, destruction = null,
} = {}) {
  return [
    MakeOrmPatch(orm), MakeSsaoPatch(ssao), MakeGiPatch(gi),
    // contact 的开关是**档位级**的（`Script_ContactShadows` 构造时告诉 Script_Csm），
    // 不从这里传：MaterialLibrary 的构造参数不该为了一个编译期布尔多一项。
    // contact 那一位还要求**本材质挂了 AO 补丁**：接触阴影读的是 AO 补丁声明的
    // `uSsilMap` 的 alpha（采样器预算，见 Script_Csm.CsmContactShadow）。没有 AO 补丁
    // 的材质编上 CSM_CONTACT 就是未声明标识符 —— 那一趟直接编译失败、什么都不画。
    MakeCsmPatch({ contact: ssao ? null : false, giDebug: !!gi }),
    MakeSsrPatch(ssr), MakeClusteredLightsPatch(), MakeDestructionPatch(destruction),
  ].filter(Boolean);
}
