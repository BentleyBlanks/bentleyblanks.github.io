// 《台儿庄：血战滕县》材质着色升级（2026-09）：视差遮蔽 / 细节法线 / 微阴影 /
// 地平线镜面遮蔽 / 皮肤预积分次表面散射。
//
// 这一份是**补丁注册表里的「材质着色」那一路**（`Script_MaterialPatches` 的
// AO → GI → **这里** → 破口）。为什么单独一个文件而不是塞进注册表：
// 注册表是八个渲染子系统共用的登记点，改的人多；这一路的 GLSL 有四百行，
// 放进去等于把所有人的合并冲突面积翻一倍。注册表那边只多一个 `shading` 形参。
//
// ## 每一项对应的 3A 实现
//
// | 这里 | 对标 | 有意的近似 |
// |---|---|---|
// | POM | 陡视差 + 二分细化（Tatarchuk 2006 / UE 的 ParallaxOcclusionMapping 节点） | TBN 从**屏幕导数**现算（three 的 `getTangentFrame` 同款），不给静态几何烘切线属性 |
// | 细节法线 | UDN 混合（Barré-Brisebois & Hill 2012 的 partial derivative 一族里最省的一支） | 只加 xy 不重建 z；6–10× 频率下与 RNM 肉眼无差 |
// | 微阴影 | Chan 2018《Material Advances in Call of Duty: WWII》 | 用**主平行光**的 NdotL 压全部直射项，不逐光源算 |
// | 地平线镜面遮蔽 | Lagarde / Frostbite `horizonOcclusion` | 无 |
// | 皮肤 | Penner 2011 预积分 + 轻微 wrap | 曲率从屏幕导数估；散射半径按美术量级放大（见 Data_Tuning_Materials.SKIN） |
//
// ## 三条实现上的账（改之前先读）
//
// 1. **POM 改 uv 靠「局部变量遮蔽 varying」。** three r185 把每张贴图的 uv 拆成了
//    各自的 varying（`vMapUv` / `vNormalMapUv` / `vRoughnessMapUv` …），而
//    `#version 300 es` 里 varying 是 `in`，**只读**。所以在 `main()` 里
//    `vec2 vMapUv = <位移后的 uv>;` 声明一个同名局部量，把后面所有 chunk 的采样
//    一次性接管。这条在 ANGLE-D3D11 上实测通过（读回像素验证：偏移 0.5 个平铺
//    的条纹图案确实换了颜色），没有 GL 错误、没有编译警告。
//    注意声明顺序：**先把原 uv 存进另一个名字，再声明遮蔽量** —— 反过来写
//    （`vec2 vMapUv = vMapUv + d;`）在 GLSL 里是自引用，行为未定义。
//
// 2. **锚点多用了一个 `#include <normal_fragment_maps>`。** 细节法线必须在直射
//    光循环之前改 `normal`，而 `<lights_fragment_begin>` 里那一整套 RE_Direct
//    已经跑完了 —— 追加在它后面等于只影响间接光。§1.8 的锚点表里补了这一行。
//
// 3. **微阴影挂在 `<lights_fragment_end>` 而不是 `<aomap_fragment>`。** r185 的
//    片元 main 里顺序是 `lights_fragment_end` → `aomap_fragment`，而 GI 的调试
//    视图 10（直射漫反射）是在 `aomap_fragment` 上抓的。挂在后面的话面板读到的
//    是**没压过**的直射项，与正式画面不一致。

import * as THREE from "three";
import { MakePatch } from "./Script_MaterialPatches.mjs";
import {
  POM, DETAIL_NORMAL, MICRO_SHADOW, HORIZON_OCCLUSION, SKIN, MATERIAL_DEBUG_VIEWS,
} from "./Data_Tuning_Materials.mjs";

/** 一张 1×1 的平法线（0.5,0.5,1）：细节法线还没烘出来时占位，接上去等于不扰动。 */
function BlankNormalTexture() {
  const texture = new THREE.DataTexture(
    new Uint8Array([128, 128, 255, 128]), 1, 1, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.colorSpace = THREE.NoColorSpace;
  texture.needsUpdate = true;
  return texture;
}

/**
 * 材质着色升级的 uniform 包 + 编译期档位。**一份实例给全场所有材质共用**，
 * 所以调一根旋钮就是全场生效（与 SSAO / GI 那两包同一个模式）。
 *
 * `quality` 里的东西是**编译期**的（进 cache key）：翻转要连着把所有材质
 * `needsUpdate = true`，否则画面还跑着旧程序（阴影开关与 GI 采样层同一先例）。
 */
export function MakeMaterialShadingUniforms() {
  return {
    // ——— 运行时旋钮（改了立刻生效，不重编译）———
    detailNormalMap: { value: BlankNormalTexture() },
    detailFade: { value: new THREE.Vector2(DETAIL_NORMAL.nearMeters, DETAIL_NORMAL.fadeMeters) },
    detailStrength: { value: DETAIL_NORMAL.strength },
    pomFade: { value: new THREE.Vector2(POM.fadeStartMeters, POM.fadeEndMeters) },
    // x = 深度倍率，y = 单像素 uv 位移上限（uv 导数在接缝处会炸，不钳就是一条乱码带）
    pomScale: { value: new THREE.Vector2(POM.depthScale, POM.maxUvPerStep) },
    pomShadow: { value: new THREE.Vector2(POM.shadowSoftness, 1) },
    microShadow: { value: MICRO_SHADOW.strength },
    horizonFade: { value: HORIZON_OCCLUSION.fade },
    skinLut: { value: BlankNormalTexture() },
    // x = 强度，y = wrap，z = 曲率→毫米半径的放大倍数
    skinParams: { value: new THREE.Vector3(SKIN.strength, SKIN.wrap, SKIN.radiusScale) },
    skinRadius: { value: new THREE.Vector2(SKIN.radiusMinMm, SKIN.radiusMaxMm) },
    // 调试假彩色（Data_Tuning_Materials.MATERIAL_DEBUG_VIEWS）；0 = 关
    debugView: { value: 0 },

    // ——— 编译期档位（进 cache key，改了要整场 needsUpdate）———
    quality: {
      pomSteps: 16,
      pomRefine: 5,
      pomSelfShadow: false,
      detailNormal: true,
      microShadow: true,
      horizonOcclusion: true,
      skinSss: true,
    },
    // 已经发出去的补丁（改档位时要就地改它们的 defines；见 ApplyShadingQuality）
    patches: new Set(),
  };
}

/**
 * 把一档画质表（`Data_Tuning_Graphics.QUALITY_PRESETS[*]`）落到 uniform 包上。
 * **返回是否需要重编译** —— 变了的话调用方负责把材质全部 `needsUpdate`。
 */
export function ApplyShadingQuality(pack, preset, graphics = {}) {
  if (!pack || !preset) return false;
  // 画质面板给的是**布尔开关**，步数仍由档位决定 —— 步数是编译期常量，
  // 做成滑杆等于每拖一格重编译全场材质。
  const On = (key, fallback) => (typeof graphics[key] === "boolean" ? graphics[key] : !!fallback);
  const next = {
    pomSteps: On("pom", (preset.pom || 0) > 0) ? Math.max(0, Math.round(preset.pom || 0)) : 0,
    pomRefine: Math.max(0, Math.round(preset.pomRefine || 0)),
    pomSelfShadow: On("pomSelfShadow", preset.pomSelfShadow),
    detailNormal: On("detailNormal", preset.detailNormal),
    microShadow: On("microShadow", preset.microShadow),
    horizonOcclusion: On("horizonOcclusion", preset.horizonOcclusion),
    skinSss: On("skinSss", preset.skinSss),
  };
  let changed = false;
  for (const key of Object.keys(next)) {
    if (pack.quality[key] !== next[key]) { pack.quality[key] = next[key]; changed = true; }
  }
  if (changed) for (const patch of pack.patches) RefreshDefines(patch, pack);
  return changed;
}

/**
 * 运行时旋钮（倍率）。这些**不**重编译，拖一格立刻生效。
 * 与画质档位的分工同 `Script_Main` 里的 graphics：档位决定编不编，倍率决定多重。
 */
export function SyncShadingKnobs(pack, graphics = {}) {
  if (!pack) return pack;
  const Mul = (value, fallback = 1) => (Number.isFinite(value) ? value : fallback);
  pack.pomScale.value.x = POM.depthScale * Mul(graphics.pomDepth);
  pack.pomShadow.value.y = Mul(graphics.pomSelfShadowStrength);
  pack.detailStrength.value = DETAIL_NORMAL.strength * Mul(graphics.detailNormalStrength);
  pack.microShadow.value = MICRO_SHADOW.strength * Mul(graphics.microShadowStrength);
  pack.horizonFade.value = HORIZON_OCCLUSION.fade * Mul(graphics.horizonStrength);
  pack.skinParams.value.x = SKIN.strength * Mul(graphics.skinStrength);
  return pack;
}

/** 一份材质要编哪几路。调用方（MaterialLibrary）按配方或材质名决定。 */
export function MakeShadingFeatures({
  pom = 0, detailNormal = 0, detailTile = 9, microShadow = 1,
  horizonOcclusion = true, skin = false, hasNormalMap = true, hasAoMap = true,
} = {}) {
  return {
    pomDepth: Math.max(0, pom),
    detailWeight: Math.max(0, detailNormal),
    detailTile,
    microShadowScale: Math.max(0, microShadow),
    horizonOcclusion: !!horizonOcclusion,
    skin: !!skin,
    hasNormalMap: !!hasNormalMap,
    hasAoMap: !!hasAoMap,
  };
}

/** 这份材质在当前档位下实际会编进去哪几位（defines / cache key 都按它走）。 */
function ActiveBits(features, pack) {
  const q = pack.quality;
  return {
    pom: features.hasNormalMap && features.pomDepth > 0 && q.pomSteps > 0,
    pomShadow: features.hasNormalMap && features.pomDepth > 0 && q.pomSteps > 0 && q.pomSelfShadow,
    detail: features.hasNormalMap && features.detailWeight > 0 && q.detailNormal,
    micro: features.hasAoMap && features.microShadowScale > 0 && q.microShadow,
    horizon: features.hasNormalMap && features.horizonOcclusion && q.horizonOcclusion,
    skin: features.skin && q.skinSss,
  };
}

/**
 * 本路补丁会写的全部 define。**关掉一位时必须显式删掉它**，见下面 `uniforms`
 * 回调里那段清理：three 的 `onBeforeCompile(parameters)` 里
 * `parameters.defines === material.defines`（同一个对象），注册表的
 * `Object.assign` 是**写进材质本身**的。把某一位从 `patch.defines` 里拿掉
 * 不会让它从材质上消失 —— 表现是「面板关了 POM，画面一点没变」，而且
 * cache key 已经换了、程序也真的重编了，从任何一个中间量都看不出问题。
 * （2026-09 实测踩过，回归口就是 MaterialUpgradeTest 的开/关对照。）
 */
const SHADING_DEFINES = [
  "USE_MATERIAL_POM", "MATERIAL_POM_STEPS", "MATERIAL_POM_REFINE",
  "USE_MATERIAL_POM_SHADOW", "MATERIAL_POM_SHADOW_STEPS",
  "USE_MATERIAL_DETAIL_NORMAL", "USE_MATERIAL_MICRO_SHADOW",
  "USE_MATERIAL_HORIZON", "USE_MATERIAL_SKIN",
];

function RefreshDefines(patch, pack) {
  const bits = ActiveBits(patch.shadingFeatures, pack);
  const defines = patch.defines;
  for (const key of Object.keys(defines)) delete defines[key];
  if (bits.pom) {
    defines.USE_MATERIAL_POM = "";
    defines.MATERIAL_POM_STEPS = String(pack.quality.pomSteps);
    defines.MATERIAL_POM_REFINE = String(pack.quality.pomRefine);
    if (bits.pomShadow) {
      defines.USE_MATERIAL_POM_SHADOW = "";
      defines.MATERIAL_POM_SHADOW_STEPS = String(POM.shadowSteps);
    }
  }
  if (bits.detail) defines.USE_MATERIAL_DETAIL_NORMAL = "";
  if (bits.micro) defines.USE_MATERIAL_MICRO_SHADOW = "";
  if (bits.horizon) defines.USE_MATERIAL_HORIZON = "";
  if (bits.skin) defines.USE_MATERIAL_SKIN = "";
}

function KeyOf(features, pack) {
  const bits = ActiveBits(features, pack);
  // 会在运行时翻的位全在这儿；缺一位就是「两种档位共用同一份编译缓存」。
  return `mat${bits.pom ? pack.quality.pomSteps : 0}`
    + `r${bits.pom ? pack.quality.pomRefine : 0}`
    + `${bits.pomShadow ? "s" : ""}`
    + `${bits.detail ? "d" : ""}${bits.micro ? "m" : ""}`
    + `${bits.horizon ? "h" : ""}${bits.skin ? "k" : ""}`;
}

// ===========================================================================
// GLSL
// ===========================================================================

/**
 * 片元 `<common>`：uniform、全局取证量、切线基。
 *
 * 切线基自己写一份而不是用 three 的 `getTangentFrame`：后者的声明挂在
 * `#if !defined(USE_TANGENT) && (USE_NORMALMAP_TANGENTSPACE || …)` 下面，
 * 哪天某份材质带了几何切线，POM 就会静默编不过（three 只在控制台留一行）。
 * 算式与 three 那份逐字相同，所以两条路得到的切线一致。
 */
const GLSL_COMMON = /* glsl */`
uniform vec4 uMatSurface;          // x=POM 深度(米) y=细节法线权重 z=细节平铺 w=微阴影倍率
uniform vec2 uMatDetailFade;       // x=近处满强度距离 y=完全淡出距离
uniform float uMatDetailStrength;
uniform vec2 uMatPomFade;          // x=淡出起点 y=淡出终点（米）
uniform vec2 uMatPomScale;         // x=深度倍率 y=单步 uv 位移上限
uniform vec2 uMatPomShadow;        // x=软化 y=强度
uniform float uMatMicroShadow;
uniform float uMatHorizonFade;
uniform vec3 uMatSkinParams;       // x=强度 y=wrap z=曲率→毫米半径倍数
uniform vec2 uMatSkinRadius;       // x=最小半径(mm) y=最大半径(mm)
uniform float uMatDebugView;
#ifdef USE_MATERIAL_DETAIL_NORMAL
uniform sampler2D uMatDetailNormalMap;
#endif
#ifdef USE_MATERIAL_SKIN
uniform sampler2D uMatSkinLut;
#endif

// 取证用的全局量（调试视图在 <dithering_fragment> 那一段读它们）
vec3 gMatDebugColor = vec3(0.0);
float gMatPomOffset = 0.0;
float gMatPomHeight = 1.0;
float gMatPomShadow = 1.0;
vec2 gMatDetailN = vec2(0.0);
float gMatMicroShadow = 1.0;
float gMatSkinCurvature = 0.0;

// 导数由调用方传进来的那一版：**屏幕导数必须在一致控制流里求**（见 GLSL_POM
// 里那段长注释），所以 POM 走这一版，把 dFdx/dFdy 全留在分支外面。
mat3 MatTangentFrameFrom(vec3 q0, vec3 q1, vec2 st0, vec2 st1, vec3 surfNormal) {
  vec3 nrm = surfNormal;
  vec3 q1perp = cross(q1, nrm);
  vec3 q0perp = cross(nrm, q0);
  vec3 tan0 = q1perp * st0.x + q0perp * st1.x;
  vec3 bit0 = q1perp * st0.y + q0perp * st1.y;
  float det = max(dot(tan0, tan0), dot(bit0, bit0));
  float scl = (det == 0.0) ? 0.0 : inversesqrt(det);
  return mat3(tan0 * scl, bit0 * scl, nrm);
}`;

/**
 * `<clipping_planes_fragment>`：视差遮蔽映射。
 *
 * 这是片元 `main()` 里能拿到 `vNormalMapUv` 的**最早**位置，也是唯一能在
 * `<map_fragment>` 之前遮蔽 uv varying 的位置。
 *
 * 高度取自法线贴图的 A 通道（`Script_TexBake.HeightToNormal` 写进去的），
 * 所以外部下载的法线图若没有 A（webp 无 alpha → 恒 1），`hgt = 1 - 1 = 0`，
 * 第一次判定就退出、uv 一动不动 —— **失败模式是「没有 POM」而不是「乱码」**，
 * 这是有意选的。
 *
 * 深度以**米**给（Data_Tuning_Materials.SURFACE_RECIPES[*].pomDepth），
 * 现场按屏幕导数换算成 uv：`uv/米 = |duv/dx| / |dp/dx|`。这样换 repeat、
 * 换物体缩放都不用重调数字。
 */
const GLSL_POM = /* glsl */`
#ifdef USE_MATERIAL_POM
vec2 gMatPomUv = vNormalMapUv;
{
  vec3 pomViewPos = -vViewPosition;
  float pomDistance = length(vViewPosition);
  float pomFade = 1.0 - smoothstep(uMatPomFade.x, uMatPomFade.y, pomDistance);
  // --- 屏幕导数一律在**分支外**求 -----------------------------------------
  // GLSL 里在非一致控制流里取 dFdx/dFdy 是未定义行为（2×2 像素块里没进分支的
  // helper lane 不执行块内语句），而 pomFade 的淡出带正好会制造半进半不进的
  // 像素块。2026-09-08 整理这一段时把 dFdx/dFdy 与切线标架一并提了出来 ——
  // 它本身**不是**下面那条死黑窄缝的病因（已单独消融验证过），是顺手补的
  // 规范问题：淡出带上的导数从此有定义。
  vec2 pomDx = dFdx(vNormalMapUv);
  vec2 pomDy = dFdy(vNormalMapUv);
  vec3 pomPx = dFdx(pomViewPos);
  vec3 pomPy = dFdy(pomViewPos);
  vec3 pomNormal = normalize(vNormal);
  #ifdef DOUBLE_SIDED
    pomNormal *= gl_FrontFacing ? 1.0 : -1.0;
  #endif
  mat3 pomTbn = MatTangentFrameFrom(pomPx, pomPy, pomDx, pomDy, pomNormal);
  if (pomFade > 0.003) {
    vec3 pomT = normalize(pomTbn[0]);
    vec3 pomB = normalize(pomTbn[1]);
    vec3 pomView = normalize(vViewPosition);
    vec3 pomTs = vec3(dot(pomView, pomT), dot(pomView, pomB), dot(pomView, pomNormal));
    // 「一米有多少 uv」：两个方向各算一次取大的 —— 掠射面上有一个方向的导数
    // 会趋近 0，只取一个方向会把深度放大到发散。
    float pomUvPerMeter = max(length(pomDx) / max(length(pomPx), 1e-5),
                              length(pomDy) / max(length(pomPy), 1e-5));
    float pomDepthUv = uMatSurface.x * uMatPomScale.x * pomUvPerMeter * pomFade;
    // 掠射角步数加权：正对表面时位移本来就小，用不着满步数。
    float pomSteps = mix(float(MATERIAL_POM_STEPS) * 0.45, float(MATERIAL_POM_STEPS),
                         clamp(1.0 - abs(pomTs.z), 0.0, 1.0));
    pomSteps = max(4.0, floor(pomSteps));
    float pomLayer = 1.0 / pomSteps;
    vec2 pomStepUv = (pomTs.xy / max(abs(pomTs.z), 0.12)) * pomDepthUv * pomLayer;
    // 单步位移封顶：uv 导数在接缝 / 极端拉伸处会炸，不钳的话一个像素能跑穿整张图。
    float pomStepLen = length(pomStepUv);
    if (pomStepLen > uMatPomScale.y) pomStepUv *= uMatPomScale.y / pomStepLen;
    // --- 退化行进的下闸（2026-09-08）--------------------------------------
    // 淡出带的尾巴上 pomFade 只剩百分之几，整趟行进加起来走不满四分之一个屏幕
    // 像素 —— 视差在画面上一点都看不出来，可循环仍然会跑满、把 pomDepth 累到
    // 高度场上，出来的解与「干脆不做 POM」不是同一个（实测 Gate_SouthOuter
    // 斜坡护栏那面斜退的墙，淡出边界那一列是一条 4 px 宽、50 px 高的死黑窄缝，
    // 13/255 对周围 78/255）。把淡出带整个挪开（2—3 m 或 40—60 m）那条缝就消失，
    // 只有默认的 9—15 m 有 —— 病在**淡出带本身**，不在深度也不在自阴影。
    // 这一闸让「位移小于四分之一像素」直接退回无 POM，与 pomFade = 0 那一侧
    // 逐比特一致，淡出因此是单调的：满视差 → 无视差，中间没有第三种解。
    float pomTravel = length(pomStepUv) * pomSteps;
    float pomPixelUv = (length(pomDx) + length(pomDy)) * 0.25;
    if (pomTravel >= pomPixelUv) {

    vec2 pomUv = vNormalMapUv;
    vec2 pomPrevUv = pomUv;
    float pomDepth = 0.0;
    float pomPrevDepth = 0.0;
    float pomHeight = 1.0 - textureGrad(normalMap, pomUv, pomDx, pomDy).a;
    for (int pomI = 0; pomI < MATERIAL_POM_STEPS; pomI += 1) {
      if (float(pomI) >= pomSteps || pomDepth >= pomHeight) break;
      pomPrevUv = pomUv;
      pomPrevDepth = pomDepth;
      pomUv -= pomStepUv;
      pomDepth += pomLayer;
      pomHeight = 1.0 - textureGrad(normalMap, pomUv, pomDx, pomDy).a;
    }
    // 二分细化：线性行进只能定位到一层厚，砖缝的立面上会出现一格一格的台阶。
    for (int pomR = 0; pomR < MATERIAL_POM_REFINE; pomR += 1) {
      vec2 pomMidUv = (pomUv + pomPrevUv) * 0.5;
      float pomMidDepth = (pomDepth + pomPrevDepth) * 0.5;
      float pomMidHeight = 1.0 - textureGrad(normalMap, pomMidUv, pomDx, pomDy).a;
      if (pomMidDepth >= pomMidHeight) { pomUv = pomMidUv; pomDepth = pomMidDepth; }
      else { pomPrevUv = pomMidUv; pomPrevDepth = pomMidDepth; }
    }
    gMatPomUv = pomUv;
    gMatPomHeight = 1.0 - pomDepth;
    gMatPomOffset = length(pomUv - vNormalMapUv) / max(length(pomDx) + length(pomDy), 1e-6);

    #if defined( USE_MATERIAL_POM_SHADOW ) && NUM_DIR_LIGHTS > 0
    {
      // 自阴影：从命中点朝主平行光走，谁挡在射线上方就是阴影。
      vec3 pomLight = directionalLights[0].direction;
      vec3 pomLts = vec3(dot(pomLight, pomT), dot(pomLight, pomB), dot(pomLight, pomNormal));
      if (pomLts.z > 0.05) {
        vec2 pomLightStep = (pomLts.xy / pomLts.z) * pomDepthUv / float(MATERIAL_POM_SHADOW_STEPS);
        float pomLightLen = length(pomLightStep);
        if (pomLightLen > uMatPomScale.y) pomLightStep *= uMatPomScale.y / pomLightLen;
        float pomLightDepth = pomDepth;
        float pomLightLayer = pomDepth / float(MATERIAL_POM_SHADOW_STEPS);
        vec2 pomLightUv = pomUv;
        float pomOccluded = 0.0;
        for (int pomS = 1; pomS <= MATERIAL_POM_SHADOW_STEPS; pomS += 1) {
          pomLightUv += pomLightStep;
          pomLightDepth -= pomLightLayer;
          float pomBlockH = 1.0 - textureGrad(normalMap, pomLightUv, pomDx, pomDy).a;
          // 越靠近命中点的遮挡越硬，远处的只贡献半影
          float pomWeight = 1.0 - float(pomS) / float(MATERIAL_POM_SHADOW_STEPS + 1);
          pomOccluded = max(pomOccluded,
            clamp((pomLightDepth - pomBlockH) * uMatPomShadow.x, 0.0, 1.0) * pomWeight);
        }
        gMatPomShadow = clamp(1.0 - pomOccluded * uMatPomShadow.y, 0.0, 1.0);
      }
    }
    #endif
    }   // 退化行进的下闸（pomTravel >= pomPixelUv）
  }
}
// 从这里往下，所有 chunk 采样的都是位移后的 uv（局部量遮蔽同名 varying）。
#ifdef USE_MAP
vec2 vMapUv = gMatPomUv;
#endif
#ifdef USE_NORMALMAP
vec2 vNormalMapUv = gMatPomUv;
#endif
#ifdef USE_ROUGHNESSMAP
vec2 vRoughnessMapUv = gMatPomUv;
#endif
#ifdef USE_METALNESSMAP
vec2 vMetalnessMapUv = gMatPomUv;
#endif
#ifdef USE_AOMAP
vec2 vAoMapUv = gMatPomUv;
#endif
#endif`;

/**
 * `<normal_fragment_maps>`：细节法线。
 *
 * 必须在这儿而不是 `<lights_fragment_begin>` 之后 —— 那时直射光循环已经跑完，
 * 再改 `normal` 只影响间接光，近景那点微表面高光正是要在直射光上看的。
 *
 * UDN：把细节的切线空间 xy 直接加到已经扰动过的法线上再归一化。
 * 6–10× 频率下与 RNM（重定向法线映射）肉眼无差，省一次基变换。
 */
const GLSL_DETAIL_NORMAL = /* glsl */`
#if defined( USE_MATERIAL_DETAIL_NORMAL ) && defined( USE_NORMALMAP_TANGENTSPACE )
{
  float dtlDistance = length(vViewPosition);
  float dtlFade = 1.0 - smoothstep(uMatDetailFade.x, uMatDetailFade.y, dtlDistance);
  float dtlWeight = uMatSurface.y * uMatDetailStrength * dtlFade;
  if (dtlWeight > 0.002) {
    vec2 dtlUv = vNormalMapUv * uMatSurface.z;
    vec3 dtlNormal = texture2D(uMatDetailNormalMap, dtlUv).xyz * 2.0 - 1.0;
    normal = normalize(normal
      + (normalize(tbn[0]) * dtlNormal.x + normalize(tbn[1]) * dtlNormal.y) * dtlWeight);
    gMatDetailN = dtlNormal.xy * dtlWeight;
  }
}
#endif`;

/**
 * `<lights_fragment_maps>`：地平线镜面遮蔽（Lagarde）。
 *
 * 法线贴图把法线掰过头之后，反射向量会钻到**几何面之下**去采环境图 ——
 * 表现是凸起的背面漏出一圈本不该有的亮高光（砖缝里最明显）。
 * `saturate(1 + fade * dot(R, Ng))` 的平方把那一段裁掉。
 *
 * 与 GTAO 的弯曲法线镜面遮蔽是**两件事**：那一项管的是「周围几何挡住了多少
 * 环境光」，要屏幕空间信息；这一项只用本像素的两个法线，纯局部。两者叠加即可，
 * 各乘一次 radiance。
 */
const GLSL_HORIZON = /* glsl */`
#if defined( USE_MATERIAL_HORIZON ) && defined( RE_IndirectSpecular )
{
  vec3 hrzReflect = reflect(-geometryViewDir, geometryNormal);
  float hrzTerm = clamp(1.0 + uMatHorizonFade * dot(hrzReflect, nonPerturbedNormal), 0.0, 1.0);
  radiance *= hrzTerm * hrzTerm;
}
#endif`;

/**
 * `<lights_fragment_end>`：微阴影 + POM 自阴影 + 皮肤预积分。
 *
 * 三样都只动**直射项**，而且必须在 `<aomap_fragment>` **之前** ——
 * GI 补丁的调试视图 10/11（直射漫反射/镜面）是在 aomap 那一处抓的，
 * 挂在它后面的话面板读到的是没压过的值，与正式画面对不上。
 */
const GLSL_DIRECT = /* glsl */`
#if defined( USE_MATERIAL_MICRO_SHADOW ) && NUM_DIR_LIGHTS > 0
{
  // Chan 2018：aperture = 2·ao²，microShadow = saturate(|NdotL| + aperture − 1)。
  // ao = 1（完全开阔）时 aperture = 2，式子恒为 1 —— 平整表面一点不受影响，
  // 只有砖缝/木纹这种 ao < 1 的地方在斜射光下才压出细阴影。
  // 读的是 **gMaterialAo**（ORM 补丁声明并写好的材质自带遮蔽），不是 three 的
  // aoMap：2026-09 集成期为了采样器预算把 aoMap 从材质上摘掉了（一张 ORM 喂三个
  // 槽时 three 不去重，三个槽各占一个纹理单元，口径见 docs §1.8）。
  // 这一位编不编由 features.hasAoMap 决定，而那一位在 MaterialLibrary._Inject 里
  // 按 ORM 三合一的结果现算 —— 没有 ORM 的材质不编这一段，也就不会引用
  // 未声明的 gMaterialAo。
  float msAo = gMaterialAo;
  msAo = max(msAo, ${MICRO_SHADOW.minAo.toFixed(3)});
  float msNdL = dot(geometryNormal, directionalLights[0].direction);
  float msAperture = 2.0 * msAo * msAo;
  float msTerm = clamp(abs(msNdL) + msAperture - 1.0, 0.0, 1.0);
  msTerm = mix(1.0, msTerm, clamp(uMatMicroShadow * uMatSurface.w, 0.0, 1.0));
  gMatMicroShadow = msTerm;
  reflectedLight.directDiffuse *= msTerm;
  reflectedLight.directSpecular *= msTerm;
}
#endif
#ifdef USE_MATERIAL_POM_SHADOW
reflectedLight.directDiffuse *= gMatPomShadow;
reflectedLight.directSpecular *= gMatPomShadow;
#endif
#if defined( USE_MATERIAL_SKIN ) && NUM_DIR_LIGHTS > 0
{
  // Penner 2011 预积分：把「球面上散射过来的漫反射」与「纯 Lambert」的**差**
  // 加回直射漫反射。加差值而不是整项替换，是为了不动阴影、不动光色、
  // 不动别的光源 —— 那三样 three 已经在直射循环里算对了。
  vec3 sknLight = directionalLights[0].direction;
  float sknNdL = dot(geometryNormal, sknLight);
  // 曲率：法线的屏幕变化率 ÷ 位置的屏幕变化率 = 1/米。
  vec3 sknPos = -vViewPosition;
  float sknCurv = length(fwidth(geometryNormal)) / max(length(fwidth(sknPos)), 1e-5);
  gMatSkinCurvature = sknCurv;
  // 换成散射半径（毫米）再归一到 LUT 的 y 轴。y=0 最平、y=1 最尖。
  float sknRadius = clamp(1000.0 / max(sknCurv * uMatSkinParams.z, 1e-3),
                          uMatSkinRadius.x, uMatSkinRadius.y);
  float sknY = log(uMatSkinRadius.y / sknRadius) / log(uMatSkinRadius.y / uMatSkinRadius.x);
  // 轻微 wrap：把明暗交界往暗面借一点，交界带更软（LUT 只管散射，不管交界位置）。
  float sknWrapped = (sknNdL + uMatSkinParams.y) / (1.0 + uMatSkinParams.y);
  vec3 sknScatter = texture2D(uMatSkinLut, vec2(sknWrapped * 0.5 + 0.5, clamp(sknY, 0.0, 1.0))).rgb;
  float sknShadow = 1.0;
  #if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
    sknShadow = getShadow(directionalShadowMap[0],
      directionalLightShadows[0].shadowMapSize, directionalLightShadows[0].shadowIntensity,
      directionalLightShadows[0].shadowBias, directionalLightShadows[0].shadowRadius,
      vDirectionalShadowCoord[0]);
  #endif
  vec3 sknDelta = (sknScatter - vec3(clamp(sknNdL, 0.0, 1.0)))
    * directionalLights[0].color * sknShadow * uMatSkinParams.x;
  reflectedLight.directDiffuse += BRDF_Lambert(material.diffuseColor) * sknDelta;
}
#endif`;

/** `<dithering_fragment>`：调试假彩色整帧覆盖（与 GI 那一路各用各的 uniform）。 */
const GLSL_DEBUG = /* glsl */`
if (uMatDebugView > 0.5) {
  #ifdef USE_MATERIAL_POM
  if (uMatDebugView < ${MATERIAL_DEBUG_VIEWS.pomOffset + 0.5}) {
    // 视差位移量，单位是**像素**（uv 位移 ÷ 一像素的 uv 跨度）。
    // 关掉 POM 的同一块墙这张图恒为纯黑，两张一比就是「视差到底有没有在动」。
    // 只写红通道：绿蓝留 0，取证脚本才能用「纯红」把它和天、地一刀切开
    // （写成 (0.25o, 0.06o, 0) 那种双通道斜坡的话，sRGB 编码会把 4:1 压成 2:1，
    //  阈值一取 r > 2g 就恒不成立 —— 踩过一轮）。
    gMatDebugColor = vec3(clamp(gMatPomOffset * 0.2, 0.0, 1.0), 0.0, 0.0);
  }
  else if (uMatDebugView < ${MATERIAL_DEBUG_VIEWS.pomHeight + 0.5}) {
    gMatDebugColor = vec3(gMatPomHeight) * gMatPomShadow;
  }
  else
  #endif
  if (uMatDebugView > ${MATERIAL_DEBUG_VIEWS.detailNormal - 0.5}
      && uMatDebugView < ${MATERIAL_DEBUG_VIEWS.detailNormal + 0.5}) {
    gMatDebugColor = vec3(gMatDetailN * 2.0 + 0.5, 0.5);
  }
  else if (uMatDebugView > ${MATERIAL_DEBUG_VIEWS.microShadow - 0.5}
      && uMatDebugView < ${MATERIAL_DEBUG_VIEWS.microShadow + 0.5}) {
    gMatDebugColor = vec3(gMatMicroShadow) * gMatPomShadow;
  }
  else if (uMatDebugView > ${MATERIAL_DEBUG_VIEWS.skinCurvature - 0.5}
      && uMatDebugView < ${MATERIAL_DEBUG_VIEWS.skinCurvature + 0.5}) {
    gMatDebugColor = vec3(clamp(gMatSkinCurvature / 60.0, 0.0, 1.0),
                          clamp(gMatSkinCurvature / 240.0, 0.0, 1.0), 0.0);
  }
  gl_FragColor = vec4(gMatDebugColor, diffuseColor.a);
}`;

/**
 * 造一份材质的着色补丁。
 *
 * @param {object} pack MakeMaterialShadingUniforms() 的那一包（全场共用）
 * @param {object} features MakeShadingFeatures() 的结果（逐材质）
 * @returns {object|null} 一个补丁；这份材质一路都不编时返回 null（不占 cache key）
 */
export function MakeMaterialShadingPatch(pack, features) {
  if (!pack || !features) return null;
  // 逐材质的四个标量。**用 uniform 不用 define** —— 写进 define 的话每种砖每种木
  // 各是一份程序，几十个变体全要预热。
  const surface = {
    value: new THREE.Vector4(features.pomDepth, features.detailWeight,
      features.detailTile, features.microShadowScale),
  };
  const patch = MakePatch({
    key: () => KeyOf(features, pack),
    uniforms: (uniforms, shader) => {
      // 先把上一次编译留在 material.defines 上的本路 define 全部清掉，
      // 再由注册表按 patch.defines 重新写一遍（见 SHADING_DEFINES 的账）。
      if (shader?.defines) {
        for (const key of SHADING_DEFINES) delete shader.defines[key];
      }
      uniforms.uMatSurface = surface;
      uniforms.uMatDetailFade = pack.detailFade;
      uniforms.uMatDetailStrength = pack.detailStrength;
      uniforms.uMatDetailNormalMap = pack.detailNormalMap;
      uniforms.uMatPomFade = pack.pomFade;
      uniforms.uMatPomScale = pack.pomScale;
      uniforms.uMatPomShadow = pack.pomShadow;
      uniforms.uMatMicroShadow = pack.microShadow;
      uniforms.uMatHorizonFade = pack.horizonFade;
      uniforms.uMatSkinLut = pack.skinLut;
      uniforms.uMatSkinParams = pack.skinParams;
      uniforms.uMatSkinRadius = pack.skinRadius;
      uniforms.uMatDebugView = pack.debugView;
    },
    fragment: [
      ["#include <common>", GLSL_COMMON],
      ["#include <clipping_planes_fragment>", GLSL_POM],
      ["#include <normal_fragment_maps>", GLSL_DETAIL_NORMAL],
      ["#include <lights_fragment_maps>", GLSL_HORIZON],
      ["#include <lights_fragment_end>", GLSL_DIRECT],
      ["#include <dithering_fragment>", GLSL_DEBUG],
    ],
    defines: {},
  });
  patch.shadingFeatures = features;
  patch.surfaceUniform = surface;
  RefreshDefines(patch, pack);
  pack.patches.add(patch);
  return patch;
}

/** 一份材质当前的逐材质标量（取证与测试用）。 */
export function ShadingSurfaceOf(material) {
  return material?.userData?.materialShadingSurface || null;
}
