// 《台儿庄：血战滕县》屏幕空间反射（SSR）。
//
// 对标：Stachowiak 2015《Stochastic Screen-Space Reflections》(SIGGRAPH Advances,
// Frostbite) + Uludag 2014《Hi-Z Screen-Space Cone Tracing》(GPU Pro 5) +
// Heitz 2018 的 GGX VNDF 采样 + UE 的 SSR 工程口径（上一帧场景色、粗糙度上限、
// 屏幕边缘淡出、相机切换清历史）。整条链是：
//
//   [1] hiz      RT0.w 的 **min-reduce** 金字塔（六级，半分辨率起步）
//   [2] trace    每像素按 GGX VNDF 采一条随机反射线，Hi-Z 跳格 + 二分细化
//                → 命中缓冲 RGBA16F（rg = 命中 uv，b = pdf，a = 置信度）
//   [3] resolve  邻域 4/8 抽样按 BRDF/pdf 的 ratio estimator 重用彼此的射线
//                → RGBA16F（rgb = 镜面辐亮度，a = 置信度）
//   [4] temporal 速度缓冲重投影 + YCoCg 方差裁剪 → 与上一帧累积
//   [5] ssrColor（另一个 pass，排在 TAA 之后）把解算后的 HDR 降采样成
//                带 mip 的「上一帧场景色」金字塔，供下一帧的 [3] 按粗糙度取级
//
// 材质侧只做一件事：`<lights_fragment_maps>` 之后把镜面 IBL 的 `radiance`
// 按置信度换成 SSR 的辐亮度。菲涅尔、能量补偿与镜面遮蔽都由三方后面的
// `RE_IndirectSpecular_Physical` 与 GTAO 那一行负责，这里**不许再乘一次 F**。
//
// ---------------------------------------------------------------------------
// ## 三条要先讲清楚的口径（读代码之前先读这三条）
//
// ### 1) 一帧延迟只在「颜色」上，不在「几何」上
// SSR 的结果是被**主场景那一趟的材质**采样的，所以 SSR 靶必须在 `main` 之前
// 算完。帧图里它排在 `hzb` 之后、`ssao` 之前 —— 那时预通道**已经跑完**，
// 所以法线、线性视深、HZB、速度全是**本帧**的：追踪没有任何延迟。
// 唯一延迟的是「命中点那里是什么颜色」：本帧的颜色还没画出来（画它正需要
// SSR），只能取上一帧。这和 UE 的 SSR 是同一条路。补偿手段：
//   · 命中点按**速度缓冲重投影**到上一帧的 uv 再取色（动的东西也对得上）；
//   · 取的是 **TAA 解算之后**的那一张（已经时域降噪、无抖动），不是主靶原图；
//   · 镜头硬切（`NotifyCameraCut` → `ctx.hasPrev === false`）当帧清历史。
//
// ### 2) 粗糙度从哪来：主 HDR 靶的 alpha 通道
// 这是前向管线，没有 GBuffer，预通道 RT0 的四个通道（xyz 法线 + w 视深）也
// 满了。但**主 HDR 靶的 alpha 一直是空的** —— composite / bloom / TAA / 调试
// 视图无一读它（逐个查过：composite 只取 .r/.g/.b 与 .rgb，bloom 全是 .rgb，
// TAA 写死 alpha=1）。所以本模块的材质补丁在 `<dithering_fragment>` 处写一行
// `gl_FragColor.a = material.roughness`，把 alpha 当成一张免费的粗糙度 GBuffer。
//   · SSR 在 `main` 之前跑，此时 `targets.hdr` 里躺的正是**上一帧**的内容 ——
//     和颜色同一份延迟，同样按速度缓冲重投影读。
//   · 没有补丁的东西（天空穹、粒子、水、第一人称）alpha 是 1（清屏值或它们
//     自己写的不透明度），读出来 roughness = 1 > 上限，**自动没有 SSR**。
//     这个失败方向是安全的：宁可漏，不可在天上反出东西来。
//   · 半透明材质**不挂这条补丁**（`MaterialLibrary` 侧按 transparent 分流），
//     否则往 alpha 里写粗糙度会直接改混合结果。所有混合模式都只会把 dstAlpha
//     往 1 推，所以半透明盖过去的地方也只会「关掉 SSR」，不会假装光滑。
//
// ### 3) 为什么不用共享 HZB（`ctx.hzb`）
// 共享 HZB 是 **max-reduce**（遮挡剔除语义：一格里最远的面）。Hi-Z 追踪要的
// 恰恰相反 —— 一格里**最近**的面：只有「射线当前深度 < 格内最近面」才能安全
// 整格跳过。拿 max 判会漏掉格子里所有更近的几何，反射直接穿墙。所以这里自建
// 一条 min-reduce 链。合并建议见 `Data_Tuning_Graphics.SSR` 的注释。
// ---------------------------------------------------------------------------

import * as THREE from "three";
import { MakeFullscreenMaterial, MakeRenderTarget, GLSL_COMMON } from "./Script_PostCommon.mjs";
import { FOREGROUND_VIEW_DEPTH } from "./Script_PostPrepass.mjs";
import { SSR } from "./Data_Tuning_Graphics.mjs";

/** Hi-Z 采样器个数：GLSL ES 3.00 不许用变量下标取 sampler 数组，只能摊成 if 梯。 */
const HIZ_SLOTS = 6;

/** Debug Rendering 里属于 SSR 的三个视图 id（面板与 DebugPass 共用这一份）。 */
export const SSR_DEBUG_VIEWS = new Set(["ssr", "ssrConfidence", "ssrHitDistance"]);

// ===========================================================================
// 共享 GLSL —— SSR pass 与水面材质 include 同一份
// ===========================================================================

/**
 * 追踪端的 uniform 声明块。**名字一律 `uSsr` 前缀**，这样整块塞进任何材质的
 * uniform 表里都不会撞名（水面材质就是这么接的）。
 */
export const SSR_UNIFORM_GLSL = /* glsl */`
uniform sampler2D uSsrHiz0;
uniform sampler2D uSsrHiz1;
uniform sampler2D uSsrHiz2;
uniform sampler2D uSsrHiz3;
uniform sampler2D uSsrHiz4;
uniform sampler2D uSsrHiz5;
uniform vec2 uSsrHizSize[${HIZ_SLOTS}];
uniform float uSsrHizMaxLevel;
uniform sampler2D uSsrDepth;        // 预通道 RT0：xyz = 视空间法线，w = 线性视深
uniform sampler2D uSsrVelocity;     // 预通道 RT1：屏幕空间速度（uv）
uniform sampler2D uSsrColor;        // 上一帧 TAA 解算后的 HDR 金字塔（带 mip）
uniform vec2 uSsrColorSize;
uniform float uSsrColorLods;
uniform float uSsrHasColor;
uniform vec2 uSsrProjScale;
uniform vec2 uSsrJitterUv;
uniform float uSsrNear;
uniform float uSsrFar;
uniform float uSsrMaxDistance;
uniform float uSsrThickness;
uniform float uSsrThicknessSlope;
uniform float uSsrEdgeFade;
uniform float uSsrNormalBias;
uniform float uSsrConeScale;
uniform float uSsrFrame;
uniform float uSsrForegroundDepth;
`;

/**
 * 几何与 Hi-Z 的公共函数。
 *
 * **抖动补偿**：预通道与主场景那两趟吃的是被 TAA 抖过的投影矩阵，而 `projScale`
 * 是从 fov/aspect 现算的干净值。`ApplyJitter` 往 `projectionMatrix.elements[8]`
 * 加 δ = jitterX·2/W，透视除法之后 NDC 平移 −δ、uv 平移 −jitterX/W。所以
 * 反投影要先把这一份平移减掉、投影要再加回去 —— 少了它，射线的屏幕位置与
 * 深度图差半个像素，细几何（电线、栏杆）上的反射会一帧一跳。
 */
export const SSR_GEOMETRY_GLSL = /* glsl */`
float SsrSceneDepth(vec2 uv) {
  float d = texture2D(uSsrDepth, uv).a;
  return d <= 0.0 ? uSsrFar : d;   // 天空当最远：max-reduce 与 min-reduce 都靠这条统一
}

vec3 SsrSceneNormal(vec2 uv) { return normalize(texture2D(uSsrDepth, uv).xyz); }

// 变量下标取 sampler 在 GLSL ES 3.00 里是非法的（只允许常量表达式），
// 所以摊成 if 梯。级数不足时上层把多余的槽绑成最后一级，读到的仍然有效。
float SsrHizMin(vec2 uv, int level) {
  if (level <= 0) return texture2D(uSsrHiz0, uv).r;
  if (level == 1) return texture2D(uSsrHiz1, uv).r;
  if (level == 2) return texture2D(uSsrHiz2, uv).r;
  if (level == 3) return texture2D(uSsrHiz3, uv).r;
  if (level == 4) return texture2D(uSsrHiz4, uv).r;
  return texture2D(uSsrHiz5, uv).r;
}

vec2 SsrHizSize(int level) {
  if (level <= 0) return uSsrHizSize[0];
  if (level == 1) return uSsrHizSize[1];
  if (level == 2) return uSsrHizSize[2];
  if (level == 3) return uSsrHizSize[3];
  if (level == 4) return uSsrHizSize[4];
  return uSsrHizSize[5];
}

vec3 SsrUvToView(vec2 uv, float viewDepth) {
  vec2 ndc = (uv - uSsrJitterUv) * 2.0 - 1.0;
  return vec3(ndc.x / uSsrProjScale.x, ndc.y / uSsrProjScale.y, -1.0) * viewDepth;
}

vec2 SsrViewToUv(vec3 p) {
  float w = max(-p.z, 1e-5);
  vec2 ndc = vec2(p.x * uSsrProjScale.x, p.y * uSsrProjScale.y) / w;
  return ndc * 0.5 + 0.5 + uSsrJitterUv;
}

// 0 附近的分量会让「除以 duv」变成 0/0（NaN）；保号补一个极小值。
float SsrSafe(float v) {
  return v >= 0.0 ? max(v, 1e-9) : min(v, -1e-9);
}

// 屏幕空间里 1/视深是仿射的，所以沿投影后的线段可以直接对 1/z 做线性插值。
// 这是整条追踪能用「一个标量参数 s」表达的原因（对透视相机是精确的，不是近似）。
float SsrRayDepth(float s, float invZ0, float invZ1) {
  return 1.0 / max(mix(invZ0, invZ1, s), 1e-6);
}

float SsrParamAtDepth(float depth, float invZ0, float invZ1) {
  float denom = invZ1 - invZ0;
  if (abs(denom) < 1e-9) return 1e9;
  return (1.0 / max(depth, 1e-4) - invZ0) / denom;
}

// 射线离开当前这一格（本级的一个纹素）的参数。推过边界一丁点，
// 否则下一次 floor 还落在同一格 —— 那就是死循环。
float SsrCellExit(vec2 uv0, vec2 duv, float s, vec2 cellCount) {
  vec2 uv = uv0 + duv * s;
  vec2 cell = floor(uv * cellCount);
  vec2 stepDir = vec2(duv.x >= 0.0 ? 1.0 : 0.0, duv.y >= 0.0 ? 1.0 : 0.0);
  vec2 planes = (cell + stepDir) / cellCount;
  vec2 ts = (planes - uv0) / vec2(SsrSafe(duv.x), SsrSafe(duv.y));
  float t = min(ts.x, ts.y);
  return max(t, s) + 1e-6 + abs(t) * 2e-5;
}

// 线段被裁进 [0,1]² 的出口参数（起点保证在内）。省掉屏幕外的空转迭代。
float SsrScreenExit(vec2 uv0, vec2 duv) {
  float sx = duv.x > 0.0 ? (1.0 - uv0.x) / duv.x : (duv.x < 0.0 ? -uv0.x / duv.x : 1e9);
  float sy = duv.y > 0.0 ? (1.0 - uv0.y) / duv.y : (duv.y < 0.0 ? -uv0.y / duv.y : 1e9);
  return clamp(min(min(sx, sy), 1.0), 0.0, 1.0);
}
`;

/**
 * Hi-Z 追踪本体。步数与细化步数是**编译期常量**（GLSL 循环上限），所以按档位
 * 生成一份 —— 运行时不重编译（契约：分档写 `Data_Tuning_Graphics`）。
 *
 * 返回 `vec4(hitUv.xy, hitViewDepth, confidence)`；confidence = 0 即未命中。
 *
 * @param {number} steps  Hi-Z 迭代上限
 * @param {number} refine 命中后的二分细化步数
 * @param {string} name   函数名（SSR pass 与水面各要一份不同步数的）
 */
export function SsrTraceGlsl({ steps = 48, refine = 4, name = "SsrTrace" } = {}) {
  return /* glsl */`
vec4 ${name}(vec3 originView, vec3 dirView, float jitter) {
  // --- 射线段：起点 → 最远处，并且不许越过近平面 -------------------------
  float tMax = uSsrMaxDistance;
  if (dirView.z > 1e-5) {
    // 朝相机走：会在近平面前面出界，先截断（否则投影出来的 uv 会翻转）
    tMax = min(tMax, max((-uSsrNear - originView.z) / dirView.z, 0.0));
  }
  if (tMax <= 1e-4) return vec4(0.0);
  vec3 p1 = originView + dirView * tMax;
  vec2 uv0 = SsrViewToUv(originView);
  vec2 uv1 = SsrViewToUv(p1);
  vec2 duv = uv1 - uv0;
  float duvLen = length(duv);
  if (duvLen < 1e-6) return vec4(0.0);
  float invZ0 = 1.0 / max(-originView.z, 1e-4);
  float invZ1 = 1.0 / max(-p1.z, 1e-4);

  float sExit = SsrScreenExit(uv0, duv);
  // 起步推开一个纹素再加抖动：不推的话第 0 步落在自己那一格，深度比较必然
  // 判「已经在面后面」，全屏立刻自命中。抖动是为了把 Hi-Z 的格状台阶打散成
  // 噪声，交给解算与时域去平（不抖就是一圈一圈的同心带）。
  vec2 texel0 = 1.0 / max(SsrHizSize(0), vec2(1.0));
  float sStep = length(texel0) / duvLen;
  float s = sStep * (1.0 + jitter);
  if (s >= sExit) return vec4(0.0);

  int level = 1;
  int maxLevel = int(uSsrHizMaxLevel);
  float sFront = s;          // 最后一次确认「在表面前面」的位置（细化的左端）
  bool hit = false;
  for (int i = 0; i < ${steps}; i++) {
    if (s >= sExit) break;
    vec2 uv = uv0 + duv * s;
    float rayZ = SsrRayDepth(s, invZ0, invZ1);
    float cellMin = SsrHizMin(uv, level);
    if (rayZ < cellMin) {
      // 射线在这一格**所有**面的前面 → 这一格里不可能相交
      sFront = s;
      float sPlane = SsrParamAtDepth(cellMin, invZ0, invZ1);
      float sCell = SsrCellExit(uv0, duv, s, SsrHizSize(level));
      if (sPlane > s && sPlane < sCell) {
        s = sPlane;                       // 追上了这一格的最近面 → 下沉细化
        level = max(level - 1, 0);
      } else {
        s = sCell;                        // 先出格 → 上浮，下一格跳得更大
        level = min(level + 1, maxLevel);
      }
    } else {
      // 已经到达/穿过这一格里最近的那个面
      if (level == 0) { hit = true; break; }
      level -= 1;                         // 下沉，s 不动（层数单调降，必然终止）
    }
  }
  if (!hit) return vec4(0.0);

  // --- 二分细化：Hi-Z 只把交点定位到一个纹素，这里定位到亚纹素 -----------
  float lo = sFront;
  float hi = s;
  for (int r = 0; r < ${refine}; r++) {
    float mid = 0.5 * (lo + hi);
    float rayZ = SsrRayDepth(mid, invZ0, invZ1);
    float sceneZ = SsrSceneDepth(uv0 + duv * mid);
    if (rayZ < sceneZ) lo = mid; else hi = mid;
  }
  vec2 hitUv = uv0 + duv * hi;
  float hitRayZ = SsrRayDepth(hi, invZ0, invZ1);
  float sceneZ = SsrSceneDepth(hitUv);

  // --- 命中判据 ---------------------------------------------------------
  if (sceneZ >= uSsrFar * 0.999) return vec4(0.0);        // 命中天空 = 没命中
  // 厚度：射线钻到面后面多深还算「打在这个面上」。远处一个像素本来就覆盖
  // 几十厘米，固定厚度会把远景整片判成「穿过去了」，所以按视深线性放宽。
  float thick = uSsrThickness + uSsrThicknessSlope * sceneZ;
  if (hitRayZ - sceneZ > thick) return vec4(0.0);

  // --- 置信度 -----------------------------------------------------------
  float conf = 1.0;
  // 屏幕边缘：命中点越靠边，越可能是「屏幕外那部分本该挡住它」
  vec2 edge = min(hitUv, vec2(1.0) - hitUv);
  conf *= smoothstep(0.0, uSsrEdgeFade, min(edge.x, edge.y));
  // 朝相机走的射线：它要的信息在相机后面，屏幕空间根本没有
  vec3 toEye = normalize(-originView);
  conf *= 1.0 - smoothstep(0.20, 0.65, max(0.0, dot(normalize(dirView), toEye)));
  // 命中面背朝射线 = 打在了背面（薄片的另一侧），不可信
  vec3 hitNormal = SsrSceneNormal(hitUv);
  conf *= smoothstep(-0.02, 0.25, -dot(hitNormal, normalize(dirView)));
  return vec4(hitUv, sceneZ, clamp(conf, 0.0, 1.0));
}
`;
}

/** GGX / VNDF（Heitz 2018）。切线空间约定：法线 = +Z。 */
export const SSR_GGX_GLSL = /* glsl */`
float SsrGgxD(float NoH, float alpha) {
  float a2 = alpha * alpha;
  float d = NoH * NoH * (a2 - 1.0) + 1.0;
  return a2 / max(3.14159265 * d * d, 1e-7);
}
// Smith-GGX 的单向遮蔽项（VNDF 的 pdf 要它）
float SsrSmithG1(float NoV, float alpha) {
  float a2 = alpha * alpha;
  return 2.0 * NoV / max(NoV + sqrt(a2 + (1.0 - a2) * NoV * NoV), 1e-6);
}
// 高度相关 Smith（解算权重要它：BRDF·cos/pdf = G2/G1）
float SsrSmithG2(float NoV, float NoL, float alpha) {
  float a2 = alpha * alpha;
  float lv = NoL * sqrt(a2 + (1.0 - a2) * NoV * NoV);
  float ll = NoV * sqrt(a2 + (1.0 - a2) * NoL * NoL);
  return 2.0 * NoL * NoV / max(lv + ll, 1e-6);
}
// Heitz 2018《Sampling the GGX Distribution of Visible Normals》原文照抄。
// 相比经典的 NDF 采样，它不会产出「朝向背面」的半程向量，低样本数下方差小得多。
vec3 SsrSampleGgxVndf(vec3 Ve, float alpha, float u1, float u2) {
  vec3 Vh = normalize(vec3(alpha * Ve.x, alpha * Ve.y, Ve.z));
  float lensq = Vh.x * Vh.x + Vh.y * Vh.y;
  vec3 T1 = lensq > 0.0 ? vec3(-Vh.y, Vh.x, 0.0) * inversesqrt(lensq) : vec3(1.0, 0.0, 0.0);
  vec3 T2 = cross(Vh, T1);
  float r = sqrt(u1);
  float phi = 6.28318531 * u2;
  float t1 = r * cos(phi);
  float t2 = r * sin(phi);
  float sm = 0.5 * (1.0 + Vh.z);
  t2 = (1.0 - sm) * sqrt(max(0.0, 1.0 - t1 * t1)) + sm * t2;
  vec3 Nh = t1 * T1 + t2 * T2 + sqrt(max(0.0, 1.0 - t1 * t1 - t2 * t2)) * Vh;
  return normalize(vec3(alpha * Nh.x, alpha * Nh.y, max(1e-5, Nh.z)));
}
void SsrTangentFrame(vec3 n, out vec3 t, out vec3 b) {
  vec3 up = abs(n.z) < 0.999 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);
  t = normalize(cross(up, n));
  b = cross(n, t);
}
`;

/**
 * 噪声：交错梯度噪声（空间）+ R2 低差异序列（时间）。
 * **不许用 Math.random / hash(time)** —— 视觉审查靠逐轮截图比对，
 * 画面自己在抖就判断不了「这一版比上一版好」；这里的序列只由 `ctx.frame` 驱动。
 */
export const SSR_NOISE_GLSL = /* glsl */`
vec2 SsrNoise2(vec2 fragCoord, float frame) {
  float a = fract(Ign(fragCoord) + frame * 0.7548776662);          // R2 的第一维
  float b = fract(Ign(fragCoord + vec2(37.0, 17.0)) + frame * 0.5698402909);
  return vec2(a, b);
}
`;

/** 上一帧场景色：按锥角选 mip + 速度重投影。水面与解算共用。 */
export const SSR_FETCH_GLSL = /* glsl */`
// 反射锥在命中处的世界半径 ≈ **alpha**（= roughness²，GGX 波瓣的半角）× 行程；
// 换算成上一帧场景色金字塔的像素数再取 log2 就是 mip。这是 Uludag 的 cone
// tracing 用预滤波 mip 代替多次采样的那一步，也是「粗糙面的反射该糊」的唯一来源。
//
// **用 alpha 不是 roughness**：写成 roughness 会把粗糙度 0.1 的地板按十倍的
// 锥角去糊 —— 一块近乎镜面的湿地会采到 mip 3（1/8 分辨率）的场景色，倒影糊成
// 一团，而且轮廓在低分辨率 mip 上逐帧抖。三方 BRDF 里进 GGX 的也是 roughness²。
float SsrColorLod(float roughness, float travel, float hitDepth) {
  float alpha = max(roughness * roughness, 0.0016);
  float pixels = uSsrConeScale * alpha * travel
    * (uSsrProjScale.y * 0.5 * uSsrColorSize.y) / max(hitDepth, 0.1);
  return clamp(log2(max(pixels, 1.0)), 0.0, max(uSsrColorLods - 1.0, 0.0));
}

vec3 SsrFetchRadiance(vec2 hitUv, float lod) {
  if (uSsrHasColor < 0.5) return vec3(0.0);
  // 命中点重投影到上一帧：动的东西（人、车、火光）也能对上位。
  // 速度是**无抖动**两帧矩阵算的，而 hitUv 在抖动屏幕空间里 —— 差半个像素，
  // 对一次反射取色不值得再算一遍，记在这里免得以后有人当 bug 查。
  vec2 prevUv = hitUv - texture2D(uSsrVelocity, hitUv).xy;
  prevUv = clamp(prevUv, vec2(0.002), vec2(0.998));
  return max(textureLod(uSsrColor, prevUv, lod).rgb, vec3(0.0));
}
`;

/**
 * **给普通材质用的一次性反射**（现役消费方：`Script_Water` 的护城河与荆河）。
 *
 * 为什么水面不能走 SSR 靶：水面是 `transparent + depthWrite=false`，而且整只
 * `skipNormalDepth` 藏出了预通道 —— 它那一像素在 RT0 里存的是**河床**的法线与
 * 深度，不是水面的。所以 SSR 靶在水面位置算的是河床的反射，完全不对。
 * 让水面写进预通道也不行：`Script_Water` 的浅水吸收与岸线泡沫正是靠「读自己
 * 身后那个面的深度」工作的（`BehindSurfaceDepth`），把水面自己写进去，那套
 * 立刻退化成全河 0 深度。所以水面走这条路：**自己按平面反射假设采 Hi-Z**，
 * 用它自己的世界法线（含 Gerstner 波与细节法线）当反射面。
 *
 * 生成一份带独立步数的函数（水面比场景反射短，32 步足够跨过一条护城河）。
 */
export function SsrSurfaceGlsl({ steps = 32, refine = 3, name = "SsrSurfaceReflection" } = {}) {
  return /* glsl */`
${SsrTraceGlsl({ steps, refine, name: `${name}Trace` })}
// viewPos / viewNormal 都是**视空间**（水面自己 viewMatrix 转一次）。
// roughness 只用来选采色的 mip，方向仍按镜面 —— 水面粗糙度是 0.02 量级，
// 再套一次随机 GGX 只会白白引入噪声。
vec4 ${name}(vec3 viewPos, vec3 viewNormal, float roughness, float noise) {
  if (uSsrHasColor < 0.5) return vec4(0.0);
  vec3 V = normalize(-viewPos);
  if (dot(viewNormal, V) <= 1e-3) return vec4(0.0);
  vec3 L = reflect(-V, viewNormal);
  if (dot(L, viewNormal) <= 0.0) return vec4(0.0);
  vec3 origin = viewPos + viewNormal * uSsrNormalBias;
  vec4 hit = ${name}Trace(origin, L, noise);
  if (hit.w <= 0.0) return vec4(0.0);
  float travel = length(SsrUvToView(hit.xy, hit.z) - viewPos);
  vec3 radiance = SsrFetchRadiance(hit.xy, SsrColorLod(roughness, travel, hit.z));
  return vec4(radiance, hit.w);
}
`;
}

/** 水面这类「自己追踪」的材质要 include 的整块 GLSL。 */
export function SsrSurfaceBlockGlsl(options = {}) {
  return `${SSR_UNIFORM_GLSL}\n${SSR_GEOMETRY_GLSL}\n${SSR_FETCH_GLSL}\n${SsrSurfaceGlsl(options)}`;
}

// ===========================================================================
// 各 pass 的片元着色器
// ===========================================================================

// --- min-reduce 金字塔 ------------------------------------------------------
// uMode = 0：源是预通道 RT0（取 .a = 线性视深，天空的 0 当 uFar）；
// uMode = 1：源是上一级（取 .r）。两级共用一份材质，只换 uniform。
const FRAG_SSR_HIZ = /* glsl */`
uniform sampler2D uSource;
uniform vec2 uSourceTexel;
uniform float uMode;
uniform float uFar;
varying vec2 vUv;
float Fetch(vec2 uv) {
  vec4 texel = texture2D(uSource, uv);
  float value = uMode < 0.5 ? texel.a : texel.r;
  return value <= 0.0 ? uFar : value;
}
void main() {
  vec2 o = uSourceTexel * 0.5;
  float m = Fetch(vUv + vec2(-o.x, -o.y));
  m = min(m, Fetch(vUv + vec2(o.x, -o.y)));
  m = min(m, Fetch(vUv + vec2(-o.x, o.y)));
  m = min(m, Fetch(vUv + vec2(o.x, o.y)));
  gl_FragColor = vec4(m, m, m, 1.0);
}
`;

/**
 * 追踪：每像素一条 VNDF 随机反射线。
 * 输出 RGBA16F：rg = 命中 uv，b = 采样方向的 pdf（解算的 ratio estimator 要它），
 * a = 置信度。命中深度不存 —— 解算端拿 `hitUv` 再采一次 RT0.w 就有了，
 * 省下的那一个通道正好给 pdf（RGBA16F 只有四个）。
 */
function MakeTraceFragment({ steps, refine }) {
  return /* glsl */`
uniform vec2 uResolution;
uniform float uMaxRoughness;
uniform float uRoughnessFadeAt;
uniform sampler2D uRoughnessSource;     // 上一帧主 HDR 靶（a = 粗糙度）
uniform float uHasRoughness;
varying vec2 vUv;
${GLSL_COMMON}
${SSR_UNIFORM_GLSL}
${SSR_GEOMETRY_GLSL}
${SSR_GGX_GLSL}
${SSR_NOISE_GLSL}
${SsrTraceGlsl({ steps, refine, name: "SsrTrace" })}

// 粗糙度取自上一帧主靶的 alpha（见文件头口径 2），按速度重投影。
float SsrRoughnessAt(vec2 uv) {
  vec2 prevUv = clamp(uv - texture2D(uSsrVelocity, uv).xy, vec2(0.0), vec2(1.0));
  return texture2D(uRoughnessSource, prevUv).a;
}

void main() {
  gl_FragColor = vec4(0.0);
  // 第一帧还没有上一帧的粗糙度/颜色：一律不出 SSR（宁可漏，不可乱反）
  if (uHasRoughness < 0.5 || uSsrHasColor < 0.5) return;
  vec4 nd = texture2D(uSsrDepth, vUv);
  float depth = nd.w;
  if (depth <= 0.0) return;                      // 天空
  // 第一人称的手与枪在预通道里写的是**常数近景标签**（Script_PostPrepass 的
  // FOREGROUND_VIEW_DEPTH），不是真的世界视深；拿它反投影会得到一个不存在的
  // 世界位置，反射出来是一片乱纹。识别不到别的特征，就按这个常数排除 ——
  // 误伤的只是「正好在 1 m ± 1 mm 处的世界几何」，代价是那一像素没有 SSR。
  if (abs(depth - uSsrForegroundDepth) < 1e-3) return;
  float roughness = SsrRoughnessAt(vUv);
  if (roughness > uMaxRoughness) return;         // 太糙：回退天空 PMREM
  vec3 N = normalize(nd.xyz);
  vec3 P = SsrUvToView(vUv, depth);
  vec3 V = normalize(-P);
  float NoV = dot(N, V);
  if (NoV <= 1e-3) return;                       // 掠射到背面，几何本身就不该被看到

  vec3 T, B;
  SsrTangentFrame(N, T, B);
  vec3 Ve = vec3(dot(V, T), dot(V, B), NoV);
  // three 的 BRDF 用 alpha = roughness²（lights_physical_pars_fragment 同款）
  float alpha = max(roughness * roughness, 0.0016);
  vec2 xi = SsrNoise2(gl_FragCoord.xy, uSsrFrame);
  vec3 Hl = SsrSampleGgxVndf(Ve, alpha, xi.x, xi.y);
  vec3 H = normalize(Hl.x * T + Hl.y * B + Hl.z * N);
  vec3 L = reflect(-V, H);
  if (dot(L, N) <= 0.0) return;

  float NoH = max(dot(N, H), 1e-4);
  float pdf = max(SsrSmithG1(NoV, alpha) * SsrGgxD(NoH, alpha) / (4.0 * max(NoV, 1e-4)), 1e-6);

  // 起点沿法线推出去：不推的话第一次二分就落回自己那个面（自交 = 全屏亮斑）。
  // 偏置随视深线性放大 —— 远处一个像素覆盖的世界尺寸本来就大。
  vec3 origin = P + N * (uSsrNormalBias * max(1.0, depth * 0.08));
  float jitter = fract(Ign(gl_FragCoord.xy + vec2(11.0, 23.0)) + uSsrFrame * 0.618034);
  vec4 hit = SsrTrace(origin, L, jitter);
  if (hit.w <= 0.0) return;

  // 接近上限的粗糙度线性淡出：粗糙度贴图上一条等值线不能变成画面上一条硬边
  float fade = 1.0 - smoothstep(uRoughnessFadeAt, uMaxRoughness, roughness);
  gl_FragColor = vec4(hit.xy, pdf, hit.w * fade);
}
`;
}

/**
 * 解算（Stachowiak 的 ratio estimator）。
 *
 * 每个像素只射了一条线，但邻域里每个像素也各射了一条 —— 它们的命中点对**本**
 * 像素同样是合法的反射样本，只是采样 pdf 不是本像素的。按
 * `w = BRDF(L_i)·cos / pdf_i = D(H_i)·G2 / (4·NoV) / pdf_i` 重新加权，就把
 * N 个像素的样本合成一次 N 抽样的积分估计。这是「一条随机线也能干净」的关键。
 * 菲涅尔 F **不进权重**：三方的 `RE_IndirectSpecular_Physical` 会在材质里乘，
 * 这里再乘一次就是双份。
 */
function MakeResolveFragment({ taps }) {
  const count = Math.max(1, taps);
  // 旋转的 Vogel 盘：taps=1 时退化成中心一点（medium 档「不解算」）
  const offsets = [];
  for (let i = 0; i < count; i += 1) {
    if (count === 1) { offsets.push([0, 0]); break; }
    const golden = 2.399963;
    const radius = 2.0 * Math.sqrt((i + 0.5) / count);
    offsets.push([radius * Math.cos(i * golden), radius * Math.sin(i * golden)]);
  }
  const table = offsets.map(([x, y]) => `vec2(${x.toFixed(4)}, ${y.toFixed(4)})`).join(", ");
  return /* glsl */`
uniform sampler2D uHit;
uniform vec2 uTexel;
uniform vec2 uResolution;
uniform sampler2D uRoughnessSource;
uniform float uHasRoughness;
uniform float uMaxRoughness;
varying vec2 vUv;
${GLSL_COMMON}
${SSR_UNIFORM_GLSL}
${SSR_GEOMETRY_GLSL}
${SSR_GGX_GLSL}
${SSR_NOISE_GLSL}
${SSR_FETCH_GLSL}

const int TAPS = ${count};
const vec2 TAP_OFFSETS[${count}] = vec2[${count}](${table});

float SsrRoughnessAt(vec2 uv) {
  vec2 prevUv = clamp(uv - texture2D(uSsrVelocity, uv).xy, vec2(0.0), vec2(1.0));
  return texture2D(uRoughnessSource, prevUv).a;
}

void main() {
  gl_FragColor = vec4(0.0);
  vec4 nd = texture2D(uSsrDepth, vUv);
  float depth = nd.w;
  if (depth <= 0.0 || uHasRoughness < 0.5) return;
  if (abs(depth - uSsrForegroundDepth) < 1e-3) return;   // 第一人称前景，见追踪端注释
  float roughness = SsrRoughnessAt(vUv);
  if (roughness > uMaxRoughness) return;
  vec3 N = normalize(nd.xyz);
  vec3 P = SsrUvToView(vUv, depth);
  vec3 V = normalize(-P);
  float NoV = max(dot(N, V), 1e-4);
  float alpha = max(roughness * roughness, 0.0016);

  // 邻域盘每帧转一个角：不转的话四个固定方向会在光滑面上留下十字状的结构噪声
  float angle = Ign(gl_FragCoord.xy + uSsrFrame * 5.588238) * 6.2831853;
  float cs = cos(angle);
  float sn = sin(angle);

  vec3 sum = vec3(0.0);
  float weightSum = 0.0;
  float confSum = 0.0;
  for (int i = 0; i < TAPS; i++) {
    vec2 o = TAP_OFFSETS[i];
    vec2 rotated = vec2(o.x * cs - o.y * sn, o.x * sn + o.y * cs);
    vec2 tapUv = clamp(vUv + rotated * uTexel, vec2(0.0), vec2(1.0));
    vec4 h = texture2D(uHit, tapUv);
    confSum += h.w;
    if (h.w <= 0.0) continue;
    float hitDepth = SsrSceneDepth(h.xy);
    vec3 hitP = SsrUvToView(h.xy, hitDepth);
    vec3 toHit = hitP - P;
    float travel = length(toHit);
    if (travel < 1e-4) continue;
    vec3 L = toHit / travel;
    float NoL = dot(N, L);
    if (NoL <= 0.0) continue;
    vec3 H = normalize(L + V);
    float NoH = max(dot(N, H), 1e-4);
    // 本像素的 BRDF，除以**邻居的** pdf —— 这一步就是 ratio estimator
    float w = SsrGgxD(NoH, alpha) * SsrSmithG2(NoV, NoL, alpha) / (4.0 * NoV) / max(h.z, 1e-6);
    w = clamp(w, 0.0, 8.0) * h.w;
    if (w <= 0.0) continue;
    vec3 radiance = SsrFetchRadiance(h.xy, SsrColorLod(roughness, travel, hitDepth));
    // 单个 firefly（爆炸火球那一像素）能把整块反射拉爆；先钳一次再加权
    radiance = min(radiance, vec3(24.0));
    sum += radiance * w;
    weightSum += w;
  }
  if (weightSum <= 0.0) { gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0); return; }
  gl_FragColor = vec4(sum / weightSum, clamp(confSum / float(TAPS), 0.0, 1.0));
}
`;
}

/**
 * 时域累积。速度缓冲重投影 + YCoCg 方差裁剪（Karis 的 variance clipping），
 * 与 TAA 同一套手法但**独立的历史**：SSR 关着 TAA 时也要能收敛，而且它的
 * 噪声来源（随机方向）与 TAA 的（子像素抖动）不是一回事。
 */
const FRAG_SSR_TEMPORAL = /* glsl */`
uniform sampler2D uCurrent;
uniform sampler2D uHistory;
uniform sampler2D uVelocity;
uniform vec2 uTexel;
uniform vec2 uResolution;
uniform float uHasHistory;
uniform float uWeightMin;
uniform float uWeightMax;
uniform float uVarianceClip;
varying vec2 vUv;
${GLSL_COMMON}

vec3 RgbToYcocg(vec3 c) {
  return vec3(0.25 * c.r + 0.5 * c.g + 0.25 * c.b,
              0.5 * c.r - 0.5 * c.b,
             -0.25 * c.r + 0.5 * c.g - 0.25 * c.b);
}
vec3 YcocgToRgb(vec3 c) {
  return max(vec3(c.x + c.y - c.z, c.x + c.z, c.x - c.y - c.z), vec3(0.0));
}
vec3 TonemapWeight(vec3 c) { return c / (1.0 + Luma(c)); }
vec3 TonemapUnweight(vec3 c) { return c / max(1.0 - Luma(c), 1e-4); }

void main() {
  vec4 current = texture2D(uCurrent, vUv);
  // 3×3 的一阶/二阶矩 → 均值 ± σ 盒。比 min/max 盒紧，遮挡变化时鬼影少得多
  vec3 m1 = vec3(0.0);
  vec3 m2 = vec3(0.0);
  float aMin = 1.0;
  float aMax = 0.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec4 t = texture2D(uCurrent, vUv + vec2(float(x), float(y)) * uTexel);
      vec3 c = RgbToYcocg(TonemapWeight(t.rgb));
      m1 += c;
      m2 += c * c;
      aMin = min(aMin, t.a);
      aMax = max(aMax, t.a);
    }
  }
  m1 /= 9.0;
  m2 /= 9.0;
  vec3 sigma = sqrt(max(m2 - m1 * m1, vec3(0.0)));
  vec3 boxMin = m1 - sigma * uVarianceClip;
  vec3 boxMax = m1 + sigma * uVarianceClip;

  vec2 velocity = texture2D(uVelocity, vUv).xy;
  vec2 prevUv = vUv - velocity;
  bool offscreen = prevUv.x < 0.0 || prevUv.x > 1.0 || prevUv.y < 0.0 || prevUv.y > 1.0;
  if (uHasHistory < 0.5 || offscreen) { gl_FragColor = current; return; }

  vec4 history = texture2D(uHistory, prevUv);
  vec3 hy = RgbToYcocg(TonemapWeight(history.rgb));
  vec3 center = 0.5 * (boxMax + boxMin);
  vec3 extent = 0.5 * (boxMax - boxMin) + 1e-5;
  vec3 dir = hy - center;
  float t = min(min(extent.x / max(abs(dir.x), 1e-6),
                    extent.y / max(abs(dir.y), 1e-6)),
                    extent.z / max(abs(dir.z), 1e-6));
  hy = center + dir * clamp(t, 0.0, 1.0);
  float historyAlpha = clamp(history.a, aMin, aMax);

  float velocityPx = length(velocity * uResolution);
  float w = mix(uWeightMin, uWeightMax, clamp(velocityPx / 40.0, 0.0, 1.0));
  // 三步必须凑齐：YCoCg 里混合 → 转回 RGB → 卸掉 Karis 的 tonemap 权重。
  // 漏掉中间那一步（直接把 YCoCg 送进 TonemapUnweight）不会报任何错，
  // 但 Luma(YCoCg) 是一串没有意义的数，除数一旦逼近 0 结果就炸到上千，
  // 表现是「反射一片惨白而且每帧乱跳」。回归口：SsrTest 的静止逐帧差那一条。
  vec3 blended = TonemapUnweight(YcocgToRgb(mix(hy, RgbToYcocg(TonemapWeight(current.rgb)), w)));
  float alpha = mix(historyAlpha, current.a, w);
  // 反射不该比它反的东西还亮：钳一次，挡住任何数值意外沿历史链滚下去
  vec4 result = vec4(clamp(blended, vec3(0.0), vec3(64.0)), clamp(alpha, 0.0, 1.0));
  // NaN 一旦进历史就永久驻留并逐帧扩散一圈（TAA 同款保险）
  if (any(isnan(result))) result = current;
  gl_FragColor = result;
}
`;

/** 上一帧场景色金字塔的第 0 级：把 TAA 解算后的 HDR 降到追踪分辨率。 */
const FRAG_SSR_COLOR = /* glsl */`
uniform sampler2D uSource;
uniform vec2 uTexel;
uniform float uBox;      // 0 = 直通（全分辨率追踪），1 = 4 抽样盒降采样
varying vec2 vUv;
void main() {
  if (uBox < 0.5) { gl_FragColor = vec4(texture2D(uSource, vUv).rgb, 1.0); return; }
  vec2 o = uTexel * 0.5;
  vec3 c = texture2D(uSource, vUv + vec2(-o.x, -o.y)).rgb;
  c += texture2D(uSource, vUv + vec2(o.x, -o.y)).rgb;
  c += texture2D(uSource, vUv + vec2(-o.x, o.y)).rgb;
  c += texture2D(uSource, vUv + vec2(o.x, o.y)).rgb;
  gl_FragColor = vec4(c * 0.25, 1.0);
}
`;

/** Debug Rendering 的三张图：辐亮度 / 置信度 / 命中距离。 */
const FRAG_SSR_DEBUG = /* glsl */`
uniform sampler2D uSsr;
uniform sampler2D uHit;
uniform float uMode;         // 0 辐亮度 / 1 置信度 / 2 命中距离
uniform float uUnavailable;
varying vec2 vUv;
${GLSL_COMMON}
${SSR_UNIFORM_GLSL}
${SSR_GEOMETRY_GLSL}
vec3 ToSrgb(vec3 c) { return pow(max(c, vec3(0.0)), vec3(1.0 / 2.2)); }
void main() {
  if (uUnavailable > 0.5) {
    float stripe = step(0.5, fract((vUv.x + vUv.y) * 22.0));
    gl_FragColor = vec4(mix(vec3(0.12, 0.012, 0.018), vec3(0.55, 0.03, 0.08), stripe), 1.0);
    return;
  }
  if (uMode < 0.5) {
    vec3 c = texture2D(uSsr, vUv).rgb;
    gl_FragColor = vec4(ToSrgb(c / (c + vec3(1.0))), 1.0);
    return;
  }
  if (uMode < 1.5) {
    float conf = texture2D(uSsr, vUv).a;
    // 深蓝底 → 暖黄：全黑也读得出「这是 0」而不是「这个 pass 没出画」
    gl_FragColor = vec4(ToSrgb(mix(vec3(0.015, 0.035, 0.18), vec3(1.0, 0.72, 0.04), conf)), 1.0);
    return;
  }
  vec4 h = texture2D(uHit, vUv);
  if (h.w <= 0.0) { gl_FragColor = vec4(0.02, 0.02, 0.03, 1.0); return; }
  vec4 nd = texture2D(uSsrDepth, vUv);
  vec3 P = SsrUvToView(vUv, max(nd.w, 1e-3));
  float hitDepth = SsrSceneDepth(h.xy);
  float travel = length(SsrUvToView(h.xy, hitDepth) - P);
  float t = clamp(travel / 30.0, 0.0, 1.0);
  gl_FragColor = vec4(ToSrgb(mix(vec3(0.05, 0.9, 0.35), vec3(0.95, 0.15, 0.55), t)), 1.0);
}
`;

// ===========================================================================
// 追踪端 uniform 包 —— SSR pass 与水面材质引用**同一批对象**
// ===========================================================================

/**
 * 造一份追踪端 uniform。SSR pass 每帧刷新它，水面材质只是把同一批对象
 * 塞进自己的 uniform 表里（`Script_Water.SetWaterSsr`）—— 与「水面借天空
 * uniform」是同一个手法：改一次，两边同时变。
 */
export function MakeSsrTraceUniforms() {
  const hizSize = [];
  for (let i = 0; i < HIZ_SLOTS; i += 1) hizSize.push(new THREE.Vector2(1, 1));
  const uniforms = {
    uSsrHizSize: { value: hizSize },
    uSsrHizMaxLevel: { value: 0 },
    uSsrDepth: { value: null },
    uSsrVelocity: { value: null },
    uSsrColor: { value: null },
    uSsrColorSize: { value: new THREE.Vector2(1, 1) },
    uSsrColorLods: { value: SSR.colorLods },
    uSsrHasColor: { value: 0 },
    uSsrProjScale: { value: new THREE.Vector2(1, 1) },
    uSsrJitterUv: { value: new THREE.Vector2(0, 0) },
    uSsrNear: { value: 0.1 },
    uSsrFar: { value: 500 },
    uSsrMaxDistance: { value: 90 },
    uSsrThickness: { value: SSR.thickness },
    uSsrThicknessSlope: { value: SSR.thicknessSlope },
    uSsrEdgeFade: { value: SSR.edgeFade },
    uSsrNormalBias: { value: SSR.normalBias },
    uSsrConeScale: { value: SSR.coneScale },
    uSsrFrame: { value: 0 },
    uSsrForegroundDepth: { value: FOREGROUND_VIEW_DEPTH },
  };
  for (let i = 0; i < HIZ_SLOTS; i += 1) uniforms[`uSsrHiz${i}`] = { value: null };
  return uniforms;
}

/** 把追踪端 uniform 整包塞进别人的 uniform 表（水面用）。 */
export function BindSsrTraceUniforms(target, trace) {
  if (!target || !trace) return target;
  for (const key of Object.keys(trace)) target[key] = trace[key];
  return target;
}

// ===========================================================================
// pass
// ===========================================================================

/**
 * SSR：min-Hi-Z → 追踪 → 解算 → 时域。帧图里排在 `hzb` 之后、`ssao` 之前。
 *
 * 对外（`pipeline.targets`）：
 *   `ssr`     时域累积后的结果（rgb = 镜面辐亮度，a = 置信度）—— 材质采的就是它
 *   `ssrHit`  命中缓冲（调试用）
 */
export class SsrPass {
  constructor(pipeline) {
    this.name = "ssr";
    this.pipeline = pipeline;
    const preset = pipeline.preset;
    this.available = !!(preset.ssr && pipeline.hdrCapable);
    // 运行时开关（画质面板）。关掉不重编译材质 —— 强度归零，补丁那一行等价于
    // 「radiance 原样」，成本只剩一次纹理取样。与 GI 那种编译期开关不同：
    // SSR 补丁只有几行，不像 GI 采样层那样占着一堆采样器与寄存器。
    this.enabled = this.available;
    this.live = false;
    this.strengthScale = 1;
    this.trace = MakeSsrTraceUniforms();
    // 材质侧那一包（`Script_MaterialPatches.MakeSsrPatch` 读它）
    this.surface = {
      map: { value: null },
      resolution: { value: new THREE.Vector2(1, 1) },   // **主渲染靶**尺寸，不是 SSR 靶
      strength: { value: this.available ? SSR.strength : 0 },
      maxRoughness: { value: SSR.maxRoughness },
      fadeAt: { value: SSR.roughnessFadeAt },
    };

    this.uniformsHiz = {
      uSource: { value: null }, uSourceTexel: { value: new THREE.Vector2() },
      uMode: { value: 0 }, uFar: { value: 500 },
    };
    this.materialHiz = MakeFullscreenMaterial(FRAG_SSR_HIZ, this.uniformsHiz);

    this.uniformsTrace = BindSsrTraceUniforms({
      uResolution: { value: new THREE.Vector2() },
      uMaxRoughness: this.surface.maxRoughness,
      uRoughnessFadeAt: this.surface.fadeAt,
      uRoughnessSource: { value: null },
      uHasRoughness: { value: 0 },
    }, this.trace);
    this.materialTrace = MakeFullscreenMaterial(
      MakeTraceFragment({ steps: preset.ssrSteps | 0, refine: SSR.refineSteps }),
      this.uniformsTrace);

    this.uniformsResolve = BindSsrTraceUniforms({
      uHit: { value: null },
      uTexel: { value: new THREE.Vector2() },
      uResolution: { value: new THREE.Vector2() },
      uRoughnessSource: this.uniformsTrace.uRoughnessSource,
      uHasRoughness: this.uniformsTrace.uHasRoughness,
      uMaxRoughness: this.surface.maxRoughness,
    }, this.trace);
    this.materialResolve = MakeFullscreenMaterial(
      MakeResolveFragment({ taps: preset.ssrResolveTaps | 0 }), this.uniformsResolve);

    this.uniformsTemporal = {
      uCurrent: { value: null }, uHistory: { value: null }, uVelocity: { value: null },
      uTexel: { value: new THREE.Vector2() }, uResolution: { value: new THREE.Vector2() },
      uHasHistory: { value: 0 },
      uWeightMin: { value: SSR.temporalWeight },
      uWeightMax: { value: SSR.temporalMaxWeight },
      uVarianceClip: { value: SSR.varianceClip },
    };
    this.materialTemporal = MakeFullscreenMaterial(FRAG_SSR_TEMPORAL, this.uniformsTemporal);

    this.uniformsDebug = BindSsrTraceUniforms({
      uSsr: { value: null }, uHit: { value: null },
      uMode: { value: 0 }, uUnavailable: { value: 0 },
    }, this.trace);
    this.materialDebug = MakeFullscreenMaterial(FRAG_SSR_DEBUG, this.uniformsDebug);

    this.hizLevels = [];
    this.hit = null;
    this.resolve = null;
    this.historyA = null;
    this.historyB = null;
    this.flip = false;
    this.hasHistory = false;
    this.hasRoughness = false;
  }

  /** 材质补丁那一包（`MaterialLibrary` 的 `ssr` 参数）。SSR 关档时返回 null。 */
  get SurfaceUniforms() { return this.available ? this.surface : null; }

  /**
   * 本帧到底出不出 SSR。这里是**唯一**写 `surface.strength` 的地方 ——
   * 材质那一行是 `mix(radiance, ssr.rgb, ssr.a * uSsrStrength)`，强度为 0
   * 就等价于「radiance 原样」，所以「关掉 SSR」不需要重编译任何材质。
   *
   * 靶没建起来 / 速度缓冲缺席（low 档或 8 位回退）时也必须归零：那时
   * `targets.ssr` 要么是 null 要么是一张没人写过的靶，材质采到的是垃圾。
   */
  Prepare(ctx) {
    this.live = !!(this.available && this.enabled && ctx.velocityTexture && this.historyA);
    this.surface.strength.value = this.live ? SSR.strength * this.strengthScale : 0;
    if (!this.live) {
      this.hasHistory = false;
      // **自己追踪的消费方（水面）也要跟着停**。它们不读 targets.ssr，读的是
      // 这一包追踪 uniform；这一趟不跑的话 Hi-Z 与场景色都停在上一次的内容上，
      // 水里会留一片几十帧前的倒影。`uSsrHasColor` 是它们统一的第一道闸
      //（`SsrSurfaceReflection` 开头就查它），SsrColorPass 下次出画再置回 1。
      this.trace.uSsrHasColor.value = 0;
    }
  }

  Enabled() {
    // 强度被面板拧到 0 时就别跑了（那是玩家在省性能）；但调试视图选中时
    // 仍要跑，否则面板上是一张几十帧前的陈旧图。
    return this.live && (this.surface.strength.value > 0
      || SSR_DEBUG_VIEWS.has(this.pipeline.debugView));
  }

  /** 画质面板：运行时开关。不重编译材质，见 Prepare 的账。 */
  SetEnabled(on) {
    this.enabled = this.available && !!on;
    if (!this.enabled) {
      this.live = false;
      this.surface.strength.value = 0;
      this.hasHistory = false;
    }
  }

  /** 画质面板的强度倍率（0–2）。实际写入在 Prepare。 */
  SetStrength(scale) {
    this.strengthScale = Math.max(0, Number.isFinite(scale) ? scale : 1);
  }

  Resize(width, height) {
    this.Dispose(true);
    this.pipeline.targets.ssr = null;
    this.pipeline.targets.ssrHit = null;
    if (!this.available) return;
    const scale = this.pipeline.preset.ssrScale || 0.5;
    const tw = Math.max(4, Math.round(width * scale));
    const th = Math.max(4, Math.round(height * scale));
    this.traceWidth = tw;
    this.traceHeight = th;

    // min-reduce 金字塔：第 0 级永远是**半分辨率**（与共享 HZB 同一口径），
    // 与追踪分辨率无关 —— 最细那一步的相交判据走全分辨率 RT0.w，不走金字塔。
    let mw = Math.max(1, width >> 1);
    let mh = Math.max(1, height >> 1);
    for (let level = 0; level < SSR.hizLevels; level += 1) {
      this.hizLevels.push(MakeRenderTarget(mw, mh, {
        type: THREE.HalfFloatType,
        minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
      }));
      if (Math.min(mw, mh) <= 8) break;
      mw = Math.max(1, mw >> 1);
      mh = Math.max(1, mh >> 1);
    }

    const rtOptions = { type: THREE.HalfFloatType };
    // 命中缓冲要**最近邻**：rg 是 uv、b 是 pdf，线性插值出来的是两条射线的
    // 平均值，物理上不存在（解算端自己按邻域加权，插值只会把它算错）。
    this.hit = MakeRenderTarget(tw, th, {
      ...rtOptions, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
    });
    this.resolve = MakeRenderTarget(tw, th, rtOptions);
    this.historyA = MakeRenderTarget(tw, th, rtOptions);
    this.historyB = MakeRenderTarget(tw, th, rtOptions);
    this.hit.textures[0].name = "ssrHit";
    this.resolve.textures[0].name = "ssrResolve";
    this.flip = false;
    this.hasHistory = false;
    this.hasRoughness = false;

    this.pipeline.targets.ssr = this.historyB;
    this.pipeline.targets.ssrHit = this.hit;
    this.surface.map.value = this.historyB.texture;
    this.surface.resolution.value.set(width, height);

    // Hi-Z 采样槽：级数不足时把剩下的槽绑成最后一级（采样器必须都绑到有效
    // 纹理，否则某些驱动上整趟静默不画）
    const sizes = this.trace.uSsrHizSize.value;
    for (let i = 0; i < HIZ_SLOTS; i += 1) {
      const rt = this.hizLevels[Math.min(i, this.hizLevels.length - 1)];
      this.trace[`uSsrHiz${i}`].value = rt.texture;
      sizes[i].set(rt.width, rt.height);
    }
    this.trace.uSsrHizMaxLevel.value = this.hizLevels.length - 1;
  }

  Render(ctx) {
    const P = this.pipeline;
    const T = this.trace;
    const camera = ctx.camera;

    // --- 共享追踪 uniform（水面也读同一批对象）----------------------------
    T.uSsrDepth.value = ctx.normalDepthTexture;
    T.uSsrVelocity.value = ctx.velocityTexture;
    T.uSsrProjScale.value.copy(ctx.projScale);
    // 抖动补偿：ApplyJitter 让画面平移 −jitter 像素（见 Script_PostTaa 的账）
    T.uSsrJitterUv.value.set(-ctx.jitterX / P.width, -ctx.jitterY / P.height);
    T.uSsrNear.value = camera.near;
    T.uSsrFar.value = camera.far;
    // 追踪最长行程：城里一条街三十米，九十米够反出对面城墙；再长只是白跑迭代
    T.uSsrMaxDistance.value = Math.min(90, camera.far * 0.25);
    T.uSsrFrame.value = ctx.frame;

    // --- min-Hi-Z ---------------------------------------------------------
    const U = this.uniformsHiz;
    U.uFar.value = camera.far;
    let source = ctx.normalDepthTexture;
    let sourceWidth = P.width;
    let sourceHeight = P.height;
    for (let level = 0; level < this.hizLevels.length; level += 1) {
      const dst = this.hizLevels[level];
      U.uSource.value = source;
      U.uMode.value = level === 0 ? 0 : 1;
      U.uSourceTexel.value.set(1 / sourceWidth, 1 / sourceHeight);
      ctx.blitter.Blit(this.materialHiz, dst);
      source = dst.texture;
      sourceWidth = dst.width;
      sourceHeight = dst.height;
    }

    // --- 追踪 -------------------------------------------------------------
    // 粗糙度来自**上一帧**的主 HDR 靶 alpha。`main` 那一趟还没跑，所以
    // targets.hdr 里躺的正是上一帧画完的内容（口径 2）。
    this.uniformsTrace.uRoughnessSource.value = P.targets.hdr ? P.targets.hdr.texture : null;
    this.uniformsTrace.uHasRoughness.value = this.hasRoughness ? 1 : 0;
    this.uniformsTrace.uResolution.value.set(this.traceWidth, this.traceHeight);
    ctx.blitter.Blit(this.materialTrace, this.hit);

    // --- 解算 -------------------------------------------------------------
    this.uniformsResolve.uHit.value = this.hit.texture;
    this.uniformsResolve.uTexel.value.set(1 / this.traceWidth, 1 / this.traceHeight);
    this.uniformsResolve.uResolution.value.set(this.traceWidth, this.traceHeight);
    ctx.blitter.Blit(this.materialResolve, this.resolve);

    // --- 时域累积 ---------------------------------------------------------
    const read = this.flip ? this.historyB : this.historyA;
    const write = this.flip ? this.historyA : this.historyB;
    const V = this.uniformsTemporal;
    V.uCurrent.value = this.resolve.texture;
    V.uHistory.value = read.texture;
    V.uVelocity.value = ctx.velocityTexture;
    V.uTexel.value.set(1 / this.traceWidth, 1 / this.traceHeight);
    V.uResolution.value.set(this.traceWidth, this.traceHeight);
    // 镜头硬切（NotifyCameraCut）把 hasPrev 清掉：那一帧的历史与速度都对不上位
    V.uHasHistory.value = this.hasHistory && ctx.hasPrev ? 1 : 0;
    ctx.blitter.Blit(this.materialTemporal, write);
    this.flip = !this.flip;
    this.hasHistory = true;

    // 材质这一帧采的就是刚写完的那一张
    P.targets.ssr = write;
    this.surface.map.value = write.texture;
    this.surface.resolution.value.set(P.width, P.height);
    // 主场景画完之后 targets.hdr 的 alpha 就是本帧的粗糙度，下一帧可用
    this.hasRoughness = true;
  }

  /** Debug Rendering 的三视图（`DebugPass.GetSource` 按名字要）。 */
  DebugSource(view) {
    const modes = { ssr: 0, ssrConfidence: 1, ssrHitDistance: 2 };
    const mode = modes[view] ?? 0;
    const unavailable = !this.available || !this.pipeline.targets.ssr;
    return {
      material: this.materialDebug,
      texture: this.pipeline.targets.ssr?.texture || null,
      mode: 0,
      unavailable,
      Prepare: (ctx) => {
        this.uniformsDebug.uSsr.value = this.pipeline.targets.ssr?.texture || null;
        this.uniformsDebug.uHit.value = this.hit ? this.hit.texture : null;
        this.uniformsDebug.uMode.value = mode;
        this.uniformsDebug.uUnavailable.value = unavailable ? 1 : 0;
        void ctx;
      },
    };
  }

  Dispose(keepMaterials = false) {
    for (const rt of this.hizLevels) rt.dispose();
    this.hizLevels = [];
    for (const rt of [this.hit, this.resolve, this.historyA, this.historyB]) {
      if (rt) rt.dispose();
    }
    this.hit = null;
    this.resolve = null;
    this.historyA = null;
    this.historyB = null;
    if (keepMaterials) return;
    this.materialHiz.dispose();
    this.materialTrace.dispose();
    this.materialResolve.dispose();
    this.materialTemporal.dispose();
    this.materialDebug.dispose();
  }
}

/**
 * 上一帧场景色金字塔。**排在 TAA 之后**：那时 `ctx.sceneColor` 是时域解算后的
 * 线性 HDR（已降噪、已卸抖动），比主靶原图干净得多，SSR 反射里也就少一层噪。
 *
 * mip 由驱动的 `generateMipmap` 生成（three 在 `renderer.render()` 末尾对当前
 * 靶自动调，条件是 `generateMipmaps === true` 且 minFilter 带 mipmap）——
 * 所以整条 mip 链是一次 blit 顺带的事，不用自己再降采样四趟。
 */
export class SsrColorPass {
  constructor(pipeline, ssrPass) {
    this.name = "ssrColor";
    this.pipeline = pipeline;
    this.ssrPass = ssrPass;
    this.uniforms = {
      uSource: { value: null }, uTexel: { value: new THREE.Vector2() }, uBox: { value: 1 },
    };
    this.material = MakeFullscreenMaterial(FRAG_SSR_COLOR, this.uniforms);
    this.target = null;
  }

  Enabled(ctx) { return !!(this.target && ctx.sceneColor) && this.ssrPass.Enabled(); }

  Resize(width, height) {
    if (this.target) { this.target.dispose(); this.target = null; }
    this.pipeline.targets.ssrColor = null;
    if (!this.ssrPass.available) return;
    const scale = this.pipeline.preset.ssrScale || 0.5;
    const w = Math.max(4, Math.round(width * scale));
    const h = Math.max(4, Math.round(height * scale));
    this.target = MakeRenderTarget(w, h, {
      type: THREE.HalfFloatType,
      minFilter: THREE.LinearMipmapLinearFilter,
      magFilter: THREE.LinearFilter,
    });
    // MakeRenderTarget 出厂关 mipmap；这里显式打开，靠 three 的
    // updateRenderTargetMipmap 在每次 blit 末尾生成整条链。
    this.target.texture.generateMipmaps = true;
    this.target.texture.name = "ssrColor";
    this.pipeline.targets.ssrColor = this.target;
    const trace = this.ssrPass.trace;
    trace.uSsrColor.value = this.target.texture;
    trace.uSsrColorSize.value.set(w, h);
    trace.uSsrColorLods.value = Math.min(SSR.colorLods,
      Math.floor(Math.log2(Math.max(2, Math.min(w, h)))) + 1);
    trace.uSsrHasColor.value = 0;
    this.fullRes = scale >= 0.999;
  }

  Render(ctx) {
    if (!this.target) return;
    this.uniforms.uSource.value = ctx.sceneColor.texture;
    // 源是 **TAA 解算后的 sceneColor**（TAAU 开着时是输出分辨率，不是内部），
    // 而 uBox 的 2×2 盒式要按源的纹素取偏移。拿内部分辨率算的话四个抽样会
    // 落错格子 —— 直接问靶自己最稳，两组分辨率相等时与旧版逐比特相同。
    this.uniforms.uTexel.value.set(
      1 / ctx.sceneColor.width, 1 / ctx.sceneColor.height);
    this.uniforms.uBox.value = this.fullRes ? 0 : 1;
    ctx.blitter.Blit(this.material, this.target);
    this.ssrPass.trace.uSsrHasColor.value = 1;
  }

  Dispose() {
    if (this.target) this.target.dispose();
    this.target = null;
    this.material.dispose();
  }
}
