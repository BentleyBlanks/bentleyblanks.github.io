// 《台儿庄：血战滕县》GTAO（地平线基环境光遮蔽）+ 弯曲法线 + SSIL（屏幕空间近场间接光）。
//
// 2026-09 起**替换** `Script_PostSsao.mjs` 在帧图里的位置。对外契约向下兼容：
// 仍然产出 `pipeline.targets.ao / aoTmp / aoBlur`，`post.AoTexture` 仍然是
// 材质端要的那张图；新增 `post.SsilTexture` 与弯曲法线通道。
//
// ## 一趟地平线搜索，三样产物
// ```
//   R   可见度 V ∈ [0,1]        —— GTAO 的解析 cos 加权积分
//   G,B 弯曲法线（视空间，八面体编码）—— 未被遮挡方向的加权平均
//   A   线性视深                —— 双边去噪 / 时域重投影 / 材质端升采样都要它
//   （第二张附件）RGB 近场反弹辐照度 —— SSIL，位掩码可见性
// ```
// 三样共用同一批深度取样：地平线搜索是这一 pass 的成本主体（每像素
// slices × steps × 2 次深度读），AO、弯曲法线、SSIL 只是同一次行军的三份账。
//
// ## 文献与对应关系（数值全部在 Data_Tuning_Gtao.mjs，带出处）
//   · **GTAO** —— Jimenez et al., *"Practical Realtime Strategies for Accurate
//     Indirect Occlusion"*, SIGGRAPH 2016（Activision）。切片 + 地平线角 + 解析
//     积分那一套；参数命名对齐 Intel **XeGTAO** 的开源实现，便于逐项对照。
//     与论文的差别写在文件末尾「已知近似」。
//   · **弯曲法线** —— 同课程的闭式解（t0 / t1 两个三角多项式）。这里没有照抄
//     XeGTAO 的 `RotFromToMatrix`：它的视向量在 DX 左手系里是 (0,0,-1)，直接搬到
//     OpenGL 视空间会撞上 180° 的退化旋转。改成显式切片基
//     `bent = t0·axisT + t1·viewVec`，数学等价且没有奇点。
//   · **多次反弹** —— 同课程的 `GTAOMultiBounce`，在**材质补丁**里用 albedo 做
//     （见 Script_MaterialPatches）。放在这里做不到：屏幕空间没有反照率。
//   · **镜面遮蔽（GTSO）** —— 同课程 §4，工程形式取 Oat & Sander 2007 的球冠
//     相交，同样在材质补丁里（要 roughness 与反射向量）。
//   · **SSIL** —— Vardis et al. 2023 *Screen-Space Indirect Lighting with
//     Visibility Bitmask*：把切片内的半圆分成 32 个扇区，用一个 uint 记录已被
//     占用的扇区；只有**这一次新占用**的扇区才吃一份反弹辐亮度。重叠的遮挡物
//     不会被重复计光 —— 这正是它比「取地平线那一个样本的颜色」强的地方。
//     辐亮度来自**上一帧解算后的线性 HDR**（帧图里 taa 之后那一趟降采样存下的
//     `colorHistory`），采样时按相机重投影回上一帧的屏幕位置。
//
// ## 三条铁律（改这个文件之前先读）
//   · **AO 只压间接光**（契约 6）。这个 pass 只出图，乘法在
//     `Script_MaterialPatches` 的 `<aomap_fragment>` 那一段。
//   · **GLSL ES 3.00 保留字**不许当标识符：sample / filter / input / output /
//     patch / resource / active / common / partition。编译失败 three 只在控制台
//     留一行，这一趟什么都不画 —— 回归口是 `Script_GtaoTest.mjs` 的读回像素。
//   · **噪声由 ctx.frame 驱动**，不用 Math.random：截图比对靠逐像素可复现。
//
// ## 帧内位置
// ```
//   prepass → hzb → gtao → main → … → taa → ssilHistory → …
//                    ↑                          ↓
//                    └── 读上一帧的 colorHistory ┘
// ```
// `gtao` 在 `main` 之前（材质要这一帧的 AO），`ssilHistory` 在 `taa` 之后
// （要解算干净的 HDR）。所以 SSIL 的反弹光天然滞后一帧 —— 与所有屏幕空间
// GI 的做法相同，时域累积会把它抹平。

import * as THREE from "three";
import {
  MakeFullscreenMaterial, MakeRenderTarget, GLSL_COMMON, GLSL_VIEW_POS,
} from "./Script_PostCommon.mjs";
import { GTAO, SSIL, MakeGtaoTier } from "./Data_Tuning_Gtao.mjs";

// ---------------------------------------------------------------------------
// 公共 GLSL：八面体法线编码、popcount、快速 acos、纹素对齐
// ---------------------------------------------------------------------------
const GLSL_GTAO_COMMON = /* glsl */`
const float PI_G = 3.14159265359;
const float HALF_PI_G = 1.57079632679;

// 八面体编码：单位向量 -> [0,1]^2。两个 8/16 位通道就够存一个法线。
// 缝在 z = 0（掠射面）上，可见面的弯曲法线基本都在 +z 半球，双线性混合
// 跨缝的概率极低 —— 这是有意的近似，写在文件末尾。
vec2 OctEncode(vec3 n) {
  n /= max(abs(n.x) + abs(n.y) + abs(n.z), 1e-6);
  vec2 e = n.z >= 0.0
    ? n.xy
    : (1.0 - abs(n.yx)) * vec2(n.x >= 0.0 ? 1.0 : -1.0, n.y >= 0.0 ? 1.0 : -1.0);
  return e * 0.5 + 0.5;
}

vec3 OctDecode(vec2 e) {
  vec2 f = e * 2.0 - 1.0;
  vec3 n = vec3(f.x, f.y, 1.0 - abs(f.x) - abs(f.y));
  float t = max(-n.z, 0.0);
  n.x += n.x >= 0.0 ? -t : t;
  n.y += n.y >= 0.0 ? -t : t;
  return normalize(n);
}

// Eberly 的 acos 多项式近似（XeGTAO 用的同一条）：最大误差 ~0.0007 rad，
// 每切片要调四次，真 acos 在这个循环里是能量到的开销。
float FastAcos(float x) {
  float v = abs(x);
  float res = (-0.156583 * v + HALF_PI_G) * sqrt(max(1.0 - v, 0.0));
  return x >= 0.0 ? res : PI_G - res;
}
`;

// bitCount() 是 GLSL ES **3.10** 才有的，WebGL2 = 3.00 —— 手写 popcount。
const GLSL_POPCOUNT = /* glsl */`
uint PopCount32(uint x) {
  x = x - ((x >> 1u) & 0x55555555u);
  x = (x & 0x33333333u) + ((x >> 2u) & 0x33333333u);
  x = (x + (x >> 4u)) & 0x0F0F0F0Fu;
  return (x * 0x01010101u) >> 24u;
}
`;

// 采样位置一律对齐到**全分辨率**纹素中心：预通道靶是 minFilter=Nearest /
// magFilter=Linear，半分辨率下取到的是 Nearest、全分辨率下是 Linear，
// 不对齐的话两档的读数不一样（而且全分辨率那一档会把 2×2 的深度搅在一起）。
const GLSL_SNAP_UV = /* glsl */`
uniform vec2 uFullResolution;
vec2 SnapUv(vec2 uv) {
  return (floor(uv * uFullResolution) + 0.5) / uFullResolution;
}
`;

// ---------------------------------------------------------------------------
// 1) 地平线搜索（GTAO + 弯曲法线 + SSIL 位掩码），MRT
// ---------------------------------------------------------------------------
function MakeTraceShader({ slices, steps, ssil }) {
  return /* glsl */`
#define GTAO_SLICES ${slices}
#define GTAO_STEPS ${steps}
${ssil ? "#define GTAO_SSIL 1" : ""}

uniform sampler2D uNormalDepth;
uniform sampler2D uPrevColor;
uniform vec2 uAoResolution;
uniform vec2 uProjScale;
uniform mat4 uInvView;
uniform mat4 uPrevViewProjection;
uniform float uHasPrevColor;
uniform float uRadius;
uniform float uFalloffRange;
uniform float uThinOccluder;
uniform float uFinalPower;
uniform float uMaxPixelRadius;
uniform float uDistributionPower;
uniform float uPixelTooClose;
uniform vec2 uFade;
uniform float uFrame;
uniform float uTemporalCycle;
uniform float uSsilClamp;
uniform float uSsilThickness;
varying vec2 vUv;

layout(location = 0) out vec4 oAo;
#ifdef GTAO_SSIL
layout(location = 1) out vec4 oIl;
#endif

${GLSL_COMMON}
${GLSL_VIEW_POS}
${GLSL_GTAO_COMMON}
${GLSL_SNAP_UV}
${ssil ? GLSL_POPCOUNT : ""}

void main() {
  vec2 baseUv = SnapUv(vUv);
  vec4 nd = texture(uNormalDepth, baseUv);
  float viewZ = nd.w;
  vec3 pixelNormal = viewZ > 0.0 ? normalize(nd.xyz) : vec3(0.0, 0.0, 1.0);
  // 先写「全开」的默认值：天空、远景与半径不足一像素的地方都走这一条。
  // A = viewZ，天空是 0 —— 下游（双边、时域、材质升采样）按 A<=0 判「无数据」。
  oAo = vec4(1.0, OctEncode(pixelNormal), viewZ);
  #ifdef GTAO_SSIL
  oIl = vec4(0.0, 0.0, 0.0, 1.0);
  #endif
  if (viewZ <= 0.0) return;

  // 远处淡出：AO 是接触现象，一个像素覆盖的世界尺度超过半径之后继续算只是噪声。
  // 这一条同时把远景像素的整个采样循环跳掉，是最便宜的那笔性能。
  float fade = 1.0 - smoothstep(uFade.x, uFade.y, viewZ);
  if (fade <= 0.001) return;

  // 世界半径 -> 屏幕像素。透视投影下每米对应的像素在 x/y 上是同一个数
  // （projScale.x * width == projScale.y * height），所以一个标量就够。
  float pixelsPerMeter = uProjScale.y * uAoResolution.y * 0.5 / viewZ;
  float screenRadiusPx = min(uRadius * pixelsPerMeter, uMaxPixelRadius);
  if (screenRadiusPx < uPixelTooClose) return;

  vec3 pixelPos = ViewPosFromDepth(baseUv, viewZ, uProjScale);
  vec3 viewVec = normalize(-pixelPos);
  float minS = uPixelTooClose / screenRadiusPx;

  float falloffRange = max(uFalloffRange * uRadius, 1e-4);
  float falloffMul = -1.0 / falloffRange;
  float falloffAdd = (uRadius - falloffRange) / falloffRange + 1.0;

  // 空间噪声（交错梯度）+ 帧序轮转（R2 低差异序列）。两者相加保证：
  // 同一帧里相邻像素取到不同的切片相位（空间去噪能吃掉），
  // 同一像素在连续几帧里扫遍整圈（时域累积能吃掉）。
  float tIndex = floor(mod(uFrame, max(uTemporalCycle, 1.0)));
  float spatialNoise = Ign(gl_FragCoord.xy);
  vec2 noise2 = fract(vec2(spatialNoise, fract(spatialNoise * 1.6180339887 + 0.5))
    + tIndex * vec2(0.75487766624669276, 0.56984029099805327));

  float visibility = 0.0;
  vec3 bentNormal = vec3(0.0);
  #ifdef GTAO_SSIL
  vec3 nearLight = vec3(0.0);
  #endif

  for (int sliceIndex = 0; sliceIndex < GTAO_SLICES; sliceIndex++) {
    float phi = (float(sliceIndex) + noise2.x) * (PI_G / float(GTAO_SLICES));
    float cosPhi = cos(phi);
    float sinPhi = sin(phi);
    vec2 omega = vec2(cosPhi, sinPhi);
    vec3 directionVec = vec3(cosPhi, sinPhi, 0.0);

    // 切片平面 = (viewVec, axisT) 张成的平面；axisVec 是它的法线。
    vec3 orthoDirectionVec = directionVec - dot(directionVec, viewVec) * viewVec;
    float orthoLen = length(orthoDirectionVec);
    if (orthoLen < 1e-5) continue;
    vec3 axisT = orthoDirectionVec / orthoLen;
    vec3 axisVec = normalize(cross(orthoDirectionVec, viewVec));

    // 法线投影到切片平面上，n = 它与视向量的夹角（带符号）。
    vec3 projectedNormal = pixelNormal - axisVec * dot(pixelNormal, axisVec);
    float projectedNormalLen = length(projectedNormal);
    if (projectedNormalLen < 1e-5) continue;
    float cosNorm = clamp(dot(projectedNormal, viewVec) / projectedNormalLen, 0.0, 1.0);
    float signNorm = dot(axisT, projectedNormal) >= 0.0 ? 1.0 : -1.0;
    float n = signNorm * FastAcos(cosNorm);

    // 两侧的「地平线在半球边缘」初值：没有任何遮挡时就是这个。
    float lowCos0 = cos(n + HALF_PI_G);
    float lowCos1 = cos(n - HALF_PI_G);
    float horizonCos0 = lowCos0;
    float horizonCos1 = lowCos1;
    #ifdef GTAO_SSIL
    uint occupied = 0u;
    #endif

    for (int stepIndex = 0; stepIndex < GTAO_STEPS; stepIndex++) {
      // 幂分布把样本推向近处：接触阴影那一段才够密（XeGTAO 同款）。
      float s = pow((float(stepIndex) + noise2.y) / float(GTAO_STEPS), uDistributionPower) + minS;
      vec2 offsetPx = floor(s * screenRadiusPx * omega + 0.5);
      vec2 offsetUv = offsetPx / uAoResolution;

      for (int side = 0; side < 2; side++) {
        vec2 rawUv = side == 0 ? baseUv + offsetUv : baseUv - offsetUv;
        if (rawUv.x < 0.0 || rawUv.x > 1.0 || rawUv.y < 0.0 || rawUv.y > 1.0) continue;
        vec2 suv = SnapUv(rawUv);
        vec4 snd = texture(uNormalDepth, suv);
        float sz = snd.w;
        if (sz <= 0.0) continue;                     // 天空不是遮挡物
        vec3 samplePos = ViewPosFromDepth(suv, sz, uProjScale);
        vec3 delta = samplePos - pixelPos;
        float sampleDist = length(delta);
        if (sampleDist < 1e-4) continue;
        vec3 hv = delta / sampleDist;

        // 距离衰减：半径边缘的样本对地平线的抬升渐弱，避免出现硬环。
        float weight = clamp(sampleDist * falloffMul + falloffAdd, 0.0, 1.0);
        float lowCos = side == 0 ? lowCos0 : lowCos1;
        float shc = mix(lowCos, dot(hv, viewVec), weight);

        // 厚度启发式：新地平线更高就直接抬；更低则**部分**回落
        // （uThinOccluder=0 等于经典 max，1 等于把每个遮挡物都当薄片）。
        // 这一条是「屋檐/门板背后不该整片死黑」的唯一出处。
        if (side == 0) {
          horizonCos0 = shc > horizonCos0 ? shc : mix(horizonCos0, shc, uThinOccluder);
        } else {
          horizonCos1 = shc > horizonCos1 ? shc : mix(horizonCos1, shc, uThinOccluder);
        }

        #ifdef GTAO_SSIL
        {
          // 位掩码：这个采样点在切片平面里张开的角度段 [前表面, 后表面]。
          // 后表面 = 沿视线往远处推 uSsilThickness（深度图只有一层，厚度靠假设）。
          float thetaFront = atan(dot(delta, axisT), dot(delta, viewVec));
          vec3 deltaBack = delta - viewVec * uSsilThickness;
          float thetaBack = atan(dot(deltaBack, axisT), dot(deltaBack, viewVec));
          float t0u = clamp((min(thetaFront, thetaBack) - n + HALF_PI_G) / PI_G, 0.0, 1.0);
          float t1u = clamp((max(thetaFront, thetaBack) - n + HALF_PI_G) / PI_G, 0.0, 1.0);
          uint startBit = min(uint(floor(t0u * 32.0)), 31u);
          uint bitSpan = min(uint(ceil((t1u - t0u) * 32.0)), 32u - startBit);
          if (bitSpan > 0u) {
            uint span = bitSpan >= 32u ? 0xFFFFFFFFu : ((1u << bitSpan) - 1u) << startBit;
            uint fresh = span & (~occupied);
            occupied = occupied | span;
            if (fresh != 0u && uHasPrevColor > 0.5) {
              float cosReceiver = max(dot(pixelNormal, hv), 0.0);
              float cosEmitter = max(dot(normalize(snd.xyz), -hv), 0.0);
              if (cosReceiver > 0.0 && cosEmitter > 0.0) {
                // 上一帧的已光照 HDR 存在上一帧的屏幕位置上，所以要把这个
                // 采样点按相机运动重投影回去再取色（逐物体运动按静止近似）。
                vec4 prevClip = uPrevViewProjection * (uInvView * vec4(samplePos, 1.0));
                if (prevClip.w > 0.0) {
                  vec2 prevUv = (prevClip.xy / prevClip.w) * 0.5 + 0.5;
                  if (prevUv.x >= 0.0 && prevUv.x <= 1.0 && prevUv.y >= 0.0 && prevUv.y <= 1.0) {
                    vec3 radiance = min(texture(uPrevColor, prevUv).rgb, vec3(uSsilClamp));
                    nearLight += radiance * (float(PopCount32(fresh)) / 32.0)
                      * cosReceiver * cosEmitter;
                  }
                }
              }
            }
          }
        }
        #endif
      }
    }

    // --- 解析积分（论文 Eq. 8 的 arc 形式；XeGTAO 的 iarc0/iarc1） ---------
    float h0 = -FastAcos(clamp(horizonCos1, -1.0, 1.0));
    float h1 = FastAcos(clamp(horizonCos0, -1.0, 1.0));
    h0 = n + clamp(h0 - n, -HALF_PI_G, HALF_PI_G);
    h1 = n + clamp(h1 - n, -HALF_PI_G, HALF_PI_G);
    float sinN = sin(n);
    float iarc0 = (cosNorm + 2.0 * h0 * sinN - cos(2.0 * h0 - n)) * 0.25;
    float iarc1 = (cosNorm + 2.0 * h1 * sinN - cos(2.0 * h1 - n)) * 0.25;
    visibility += projectedNormalLen * (iarc0 + iarc1);

    // --- 弯曲法线（同课程的闭式解） ---------------------------------------
    // 切片内的方向都写成 sin(θ)·axisT + cos(θ)·viewVec，所以 t0 是切片内分量、
    // t1 是视向分量。平地无遮挡时 t0=0、t1=2/3 —— 归一化后就是几何法线。
    float t0 = (6.0 * sin(h0 - n) - sin(3.0 * h0 - n)
              + 6.0 * sin(h1 - n) - sin(3.0 * h1 - n)
              + 16.0 * sin(n) - 3.0 * (sin(h0 + n) + sin(h1 + n))) / 12.0;
    float t1 = (-cos(3.0 * h0 - n) - cos(3.0 * h1 - n) + 8.0 * cos(n)
              - 3.0 * (cos(h0 + n) + cos(h1 + n))) / 12.0;
    bentNormal += (axisT * t0 + viewVec * t1) * projectedNormalLen;
  }

  visibility = clamp(visibility / float(GTAO_SLICES), 0.0, 1.0);
  visibility = pow(visibility, uFinalPower);
  visibility = mix(1.0, visibility, fade);

  vec3 bent = dot(bentNormal, bentNormal) > 1e-8 ? normalize(bentNormal) : pixelNormal;
  bent = normalize(mix(pixelNormal, bent, fade));

  oAo = vec4(visibility, OctEncode(bent), viewZ);
  #ifdef GTAO_SSIL
  // 归一化到**辐照度**。推导（一个切片）：32 个扇区在 θ ∈ [n−π/2, n+π/2] 上等分，
  // 每个扇区宽 Δθ = π/32，所以「新占用位数 / 32」就是 dθ/π；再乘上 cosReceiver =
  // cos(θ−n)，一个切片的和收敛到 ∫ L·cos(u)·du/π = 2L/π。N 个切片按 (π/N) 加权
  // 求和得到 2L —— 而一个被辐亮度 L 的朗伯面**铺满**的半球，真值是 πL。
  // 所以还差 π/2，合起来的系数是 π²/(2N)。这条把估计量钉在物理量纲上，
  // SSIL.strength 才是一根"艺术旋钮"而不是在替算式补窟窿。
  oIl = vec4(max(nearLight * (PI_G * PI_G / (2.0 * float(GTAO_SLICES))) * fade, vec3(0.0)), 1.0);
  #endif
}
`;
}

// ---------------------------------------------------------------------------
// 2) 时域累积：按速度靶重投影上一帧，深度不一致处拒绝
// ---------------------------------------------------------------------------
function MakeTemporalShader({ ssil }) {
  return /* glsl */`
${ssil ? "#define GTAO_SSIL 1" : ""}

uniform sampler2D uCurrentAo;
uniform sampler2D uCurrentIl;
uniform sampler2D uHistoryAo;
uniform sampler2D uHistoryIl;
uniform sampler2D uVelocity;
uniform sampler2D uNormalDepth;
uniform mat4 uInvView;
uniform mat4 uPrevViewProjection;
uniform vec2 uProjScale;
uniform float uHasHistory;
uniform float uAlpha;
uniform float uDepthReject;
uniform float uUseVelocity;
varying vec2 vUv;

layout(location = 0) out vec4 oAo;
#ifdef GTAO_SSIL
layout(location = 1) out vec4 oIl;
#endif

${GLSL_VIEW_POS}
${GLSL_GTAO_COMMON}
${GLSL_SNAP_UV}

void main() {
  vec4 cur = texture(uCurrentAo, vUv);
  #ifdef GTAO_SSIL
  vec4 curIl = texture(uCurrentIl, vUv);
  #endif
  oAo = cur;
  #ifdef GTAO_SSIL
  oIl = curIl;
  #endif
  float viewZ = cur.a;
  if (uHasHistory < 0.5 || viewZ <= 0.0) return;

  // 期望的「上一帧视深」：把本帧的世界坐标用上一帧的 viewProjection 投一次，
  // 透视矩阵的 clip.w 就是线性视深 —— 不必再往 ctx 上加一个 prevView 矩阵。
  vec3 viewPos = ViewPosFromDepth(vUv, viewZ, uProjScale);
  vec4 worldPos = uInvView * vec4(viewPos, 1.0);
  vec4 prevClip = uPrevViewProjection * worldPos;
  if (prevClip.w <= 0.0) return;
  float expectedPrevZ = prevClip.w;

  // 重投影位置优先用速度靶（蒙皮人物是逐骨骼精确的），退化时用相机重投影。
  vec2 prevUv = (prevClip.xy / prevClip.w) * 0.5 + 0.5;
  if (uUseVelocity > 0.5) prevUv = vUv - texture(uVelocity, vUv).xy;
  if (prevUv.x < 0.0 || prevUv.x > 1.0 || prevUv.y < 0.0 || prevUv.y > 1.0) return;

  vec4 hist = texture(uHistoryAo, prevUv);
  if (hist.a <= 0.0) return;
  // 遮挡变化（disocclusion）判据：历史像素记的视深与「这块表面上一帧应该在
  // 多远」对不上，就说明重投影落到了别的表面上，整份历史作废。
  float rel = abs(hist.a - expectedPrevZ) / max(expectedPrevZ, 0.05);
  if (rel > uDepthReject) return;

  vec3 histBent = OctDecode(hist.gb);
  vec3 curNormal = normalize(texture(uNormalDepth, SnapUv(vUv)).xyz);
  // 弯曲法线一定偏离几何法线（墙角就是这么来的），所以这里只做最弱的一条：
  // 指到表面背面去的历史一定是错的。
  if (dot(histBent, curNormal) < 0.0) return;

  float alpha = clamp(uAlpha, 0.02, 1.0);
  float ao = mix(hist.r, cur.r, alpha);
  vec3 bent = normalize(mix(histBent, OctDecode(cur.gb), alpha));
  oAo = vec4(ao, OctEncode(bent), viewZ);
  #ifdef GTAO_SSIL
  oIl = vec4(mix(texture(uHistoryIl, prevUv).rgb, curIl.rgb, alpha), 1.0);
  #endif
}
`;
}

// ---------------------------------------------------------------------------
// 3) 空间双边（可分离，5 抽样）：深度 + 几何法线双重边缘保护
// ---------------------------------------------------------------------------
function MakeBlurShader({ ssil }) {
  return /* glsl */`
${ssil ? "#define GTAO_SSIL 1" : ""}

uniform sampler2D uAo;
uniform sampler2D uIl;
uniform sampler2D uNormalDepth;
uniform vec2 uTexel;
uniform vec2 uDirection;
uniform float uDepthSigma;
uniform float uNormalPower;
varying vec2 vUv;

layout(location = 0) out vec4 oAo;
#ifdef GTAO_SSIL
layout(location = 1) out vec4 oIl;
#endif

${GLSL_GTAO_COMMON}
${GLSL_SNAP_UV}

const float BLUR_W[5] = float[5](0.0545, 0.2442, 0.4026, 0.2442, 0.0545);

void main() {
  vec4 center = texture(uAo, vUv);
  oAo = center;
  #ifdef GTAO_SSIL
  oIl = texture(uIl, vUv);
  #endif
  float centerZ = center.a;
  if (centerZ <= 0.0) return;
  vec3 centerN = normalize(texture(uNormalDepth, SnapUv(vUv)).xyz);

  float ao = 0.0;
  vec3 bent = vec3(0.0);
  vec3 light = vec3(0.0);
  float wsum = 0.0;
  for (int i = 0; i < 5; i++) {
    vec2 uv = vUv + uDirection * uTexel * float(i - 2);
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) continue;
    vec4 t = texture(uAo, uv);
    if (t.a <= 0.0) continue;
    float dz = abs(t.a - centerZ) / max(centerZ, 0.05);
    vec3 tn = normalize(texture(uNormalDepth, SnapUv(uv)).xyz);
    float w = BLUR_W[i] * exp(-dz / max(uDepthSigma, 1e-4))
      * pow(max(dot(tn, centerN), 0.0), uNormalPower);
    ao += t.r * w;
    bent += OctDecode(t.gb) * w;
    #ifdef GTAO_SSIL
    light += texture(uIl, uv).rgb * w;
    #endif
    wsum += w;
  }
  if (wsum <= 1e-5) return;
  oAo = vec4(ao / wsum, OctEncode(normalize(bent)), centerZ);
  #ifdef GTAO_SSIL
  oIl = vec4(light / wsum, 1.0);
  #endif
}
`;
}

// ---------------------------------------------------------------------------
// 4) 颜色历史降采样（帧图里的 ssilHistory，跑在 taa 之后）
// ---------------------------------------------------------------------------
const FRAG_COLOR_HISTORY = /* glsl */`
uniform sampler2D uSource;
varying vec2 vUv;
void main() {
  // 半分辨率靶上一次双线性正好等于源图 2×2 的平均：SSIL 每个采样代表一小片
  // 立体角，预滤过的源比逐像素锐利的源更接近正确答案，也更省缓存。
  gl_FragColor = vec4(max(texture2D(uSource, vUv).rgb, vec3(0.0)), 1.0);
}
`;

// ---------------------------------------------------------------------------
// 5) 调试视图（弯曲法线 / SSIL / 镜面遮蔽）
// ---------------------------------------------------------------------------
const FRAG_GTAO_DEBUG = /* glsl */`
uniform sampler2D uAo;
uniform sampler2D uIl;
uniform sampler2D uNormalDepth;
uniform vec2 uProjScale;
uniform float uMode;
uniform float uUnavailable;
uniform float uDebugRoughness;
varying vec2 vUv;
${GLSL_VIEW_POS}
${GLSL_GTAO_COMMON}

vec3 ToSrgb(vec3 c) { return pow(max(c, vec3(0.0)), vec3(1.0 / 2.2)); }

// GTSO：可见性锥（轴 = 弯曲法线、张角来自 AO）与镜面锥（轴 = 反射向量、
// 张角来自粗糙度）的球冠相交。与材质补丁里那一份是同一条式子。
float CapIntersection(float cosCap1, float cosCap2, float cosDistance) {
  float r1 = FastAcos(clamp(cosCap1, -1.0, 1.0));
  float r2 = FastAcos(clamp(cosCap2, -1.0, 1.0));
  float d = FastAcos(clamp(cosDistance, -1.0, 1.0));
  if (min(r1, r2) <= max(r1, r2) - d) return 1.0 - max(cosCap1, cosCap2);
  if (r1 + r2 <= d) return 0.0;
  float delta = abs(r1 - r2);
  float x = 1.0 - clamp((d - delta) / max(r1 + r2 - delta, 1e-4), 0.0, 1.0);
  return (x * x * (-2.0 * x + 3.0)) * (1.0 - max(cosCap1, cosCap2));
}

void main() {
  if (uUnavailable > 0.5) {
    float stripe = step(0.5, fract((vUv.x + vUv.y) * 22.0));
    gl_FragColor = vec4(mix(vec3(0.12, 0.012, 0.018), vec3(0.55, 0.03, 0.08), stripe), 1.0);
    return;
  }
  vec4 texel = texture2D(uAo, vUv);
  vec3 color = vec3(0.0);
  if (uMode < 0.5) {                       // 弯曲法线：[-1,1] -> [0,1]
    color = texel.a <= 0.0 ? vec3(0.5, 0.5, 1.0) : OctDecode(texel.gb) * 0.5 + 0.5;
  } else if (uMode < 1.5) {                // SSIL：线性 HDR，Reinhard + sRGB
    vec3 il = texture2D(uIl, vUv).rgb;
    color = ToSrgb(il / (il + vec3(1.0)));
  } else {                                 // 镜面遮蔽（固定粗糙度，看空间梯度）
    if (texel.a <= 0.0) { gl_FragColor = vec4(0.05, 0.09, 0.20, 1.0); return; }
    vec4 nd = texture2D(uNormalDepth, vUv);
    vec3 normal = normalize(nd.xyz);
    vec3 viewPos = ViewPosFromDepth(vUv, texel.a, uProjScale);
    vec3 viewDir = normalize(-viewPos);
    vec3 refl = reflect(-viewDir, normal);
    float visibility = texel.r;
    float cosAv = sqrt(max(1.0 - visibility, 0.0));
    float rr = uDebugRoughness * uDebugRoughness;
    float cosAs = exp2(-3.32193 * rr * rr);
    float so = clamp(CapIntersection(cosAv, cosAs, dot(OctDecode(texel.gb), refl))
      / max(1.0 - cosAs, 1e-4), 0.0, 1.0);
    color = vec3(so);
  }
  gl_FragColor = vec4(color, 1.0);
}
`;

/** 只在 SSIL 关着时顶上去的 1×1 全黑图：材质端那一次取样永远有个合法的靶。 */
function MakeBlackPixel() {
  const texture = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
  texture.colorSpace = THREE.NoColorSpace;
  texture.needsUpdate = true;
  texture.name = "ssilOff";
  return texture;
}

/**
 * 材质端的 AO / SSIL uniform 包。**正片与探针页共用这一份构造**，
 * 免得两边各写一套（分辨率喂错整张 AO 会放大并错位 —— 这条踩过两轮）。
 * @param {import("./Script_Post.mjs").PostPipeline} post
 */
export function MakeAoUniforms(post, { strength = 0.80, ssilStrength = SSIL.strength } = {}) {
  const uniforms = {
    map: { value: null },
    // **主渲染靶**尺寸，不是 AO 靶尺寸：材质里的取样是
    // `gl_FragCoord.xy / uSsaoResolution`，而 gl_FragCoord 跑在主靶的像素域里。
    resolution: { value: new THREE.Vector2(1, 1) },
    // AO 靶自己的尺寸，联合双边升采样要它。
    aoResolution: { value: new THREE.Vector2(1, 1) },
    strength: { value: strength },
    ssilMap: { value: null },
    ssilStrength: { value: ssilStrength },
  };
  SyncAoUniforms(uniforms, post);
  return uniforms;
}

/** 每帧把靶引用与尺寸接回去（SetSize 会换靶，纹理引用不能只接一次）。 */
export function SyncAoUniforms(uniforms, post, { strength = null, ssilStrength = null } = {}) {
  if (!uniforms || !post) return uniforms;
  uniforms.map.value = post.AoTexture;
  uniforms.resolution.value.set(post.width, post.height);
  const aoTarget = post.targets?.aoBlur;
  uniforms.aoResolution.value.set(aoTarget?.width || post.width, aoTarget?.height || post.height);
  if (uniforms.ssilMap) uniforms.ssilMap.value = post.SsilTexture;
  if (strength != null) uniforms.strength.value = strength;
  if (ssilStrength != null && uniforms.ssilStrength) uniforms.ssilStrength.value = ssilStrength;
  return uniforms;
}

/**
 * GTAO pass。帧图里排在 `hzb` 与 `main` 之间（材质要的是**本帧**的 AO）。
 *
 * 靶（全部归自己所有，按老名字对外挂到 `pipeline.targets`）：
 *   `ao`      trace 的原始输出（调试视图「AO 原始」看的是它）
 *   `aoTmp`   可分离双边的中转（没有中转的档位上等于 `ao`）
 *   `aoBlur`  最终结果 —— `post.AoTexture` / `post.SsilTexture` 读它
 *   history×2 时域累积的乒乓（`temporal` 档位才建）
 *   colorHistory  上一帧解算后的 HDR 降采样（SSIL 的辐亮度源）
 */
export class GtaoPass {
  constructor(pipeline) {
    this.name = "gtao";
    this.pipeline = pipeline;
    this.tier = MakeGtaoTier(this._TierName());
    // 出厂 SSIL 跟画质档走。运行时可经 `post.SetSsilEnabled` 热切（会重建材质与靶）。
    this.ssilEnabled = !!pipeline.preset.ssil;
    this.blackPixel = MakeBlackPixel();

    this.uniformsTrace = {
      uNormalDepth: { value: null }, uPrevColor: { value: null },
      uAoResolution: { value: new THREE.Vector2(2, 2) },
      uFullResolution: { value: new THREE.Vector2(2, 2) },
      uProjScale: { value: new THREE.Vector2(1, 1) },
      uInvView: { value: new THREE.Matrix4() },
      uPrevViewProjection: { value: new THREE.Matrix4() },
      uHasPrevColor: { value: 0 },
      uRadius: { value: GTAO.radius },
      uFalloffRange: { value: GTAO.falloffRange },
      uThinOccluder: { value: GTAO.thinOccluder },
      uFinalPower: { value: GTAO.finalPower },
      uMaxPixelRadius: { value: GTAO.maxPixelRadius },
      uDistributionPower: { value: GTAO.sampleDistributionPower },
      uPixelTooClose: { value: GTAO.pixelTooCloseThreshold },
      uFade: { value: new THREE.Vector2(GTAO.fadeStart, GTAO.fadeEnd) },
      uFrame: { value: 0 },
      uTemporalCycle: { value: this.tier.temporalCycle },
      uSsilClamp: { value: SSIL.clamp },
      uSsilThickness: { value: SSIL.thickness },
    };
    this.uniformsTemporal = {
      uCurrentAo: { value: null }, uCurrentIl: { value: null },
      uHistoryAo: { value: null }, uHistoryIl: { value: null },
      uVelocity: { value: null }, uNormalDepth: { value: null },
      uFullResolution: { value: new THREE.Vector2(2, 2) },
      uInvView: { value: new THREE.Matrix4() },
      uPrevViewProjection: { value: new THREE.Matrix4() },
      uProjScale: { value: new THREE.Vector2(1, 1) },
      uHasHistory: { value: 0 },
      uAlpha: { value: GTAO.temporalAlpha },
      uDepthReject: { value: GTAO.temporalDepthReject },
      uUseVelocity: { value: 1 },
    };
    this.uniformsBlur = {
      uAo: { value: null }, uIl: { value: null }, uNormalDepth: { value: null },
      uFullResolution: { value: new THREE.Vector2(2, 2) },
      uTexel: { value: new THREE.Vector2() },
      uDirection: { value: new THREE.Vector2(1, 0) },
      uDepthSigma: { value: GTAO.blurDepthSigma },
      uNormalPower: { value: GTAO.blurNormalPower },
    };
    this.uniformsHistory = { uSource: { value: null } };
    this.materialHistory = MakeFullscreenMaterial(FRAG_COLOR_HISTORY, this.uniformsHistory);
    this.uniformsDebug = {
      uAo: { value: null }, uIl: { value: null }, uNormalDepth: { value: null },
      uProjScale: { value: new THREE.Vector2(1, 1) },
      uMode: { value: 0 }, uUnavailable: { value: 0 }, uDebugRoughness: { value: 0.35 },
    };
    this.materialDebug = MakeFullscreenMaterial(FRAG_GTAO_DEBUG, this.uniformsDebug);

    this.materialTrace = null;
    this.materialTemporal = null;
    this.materialBlur = null;
    this._BuildMaterials();

    this.raw = null;
    this.blurOut = null;
    this.history = [null, null];
    this.historyFlip = false;
    this.hasHistory = false;
    this.colorHistory = null;
    this.hasColorHistory = false;
  }

  _TierName() {
    const bit = this.pipeline.preset.gtao;
    return typeof bit === "string" ? bit : this.pipeline.quality;
  }

  _BuildMaterials() {
    this.materialTrace?.dispose();
    this.materialTemporal?.dispose();
    this.materialBlur?.dispose();
    const ssil = this.ssilEnabled;
    const options = { glslVersion: THREE.GLSL3 };
    this.materialTrace = MakeFullscreenMaterial(
      MakeTraceShader({ slices: this.tier.slices, steps: this.tier.steps, ssil }),
      this.uniformsTrace, options);
    this.materialTemporal = MakeFullscreenMaterial(
      MakeTemporalShader({ ssil }), this.uniformsTemporal, options);
    this.materialBlur = MakeFullscreenMaterial(
      MakeBlurShader({ ssil }), this.uniformsBlur, options);
  }

  /** 一张 GTAO 工作靶：RGBA16F，SSIL 开着时是两张附件的 MRT。 */
  _MakeTarget(width, height, name) {
    const rt = MakeRenderTarget(width, height, {
      type: THREE.HalfFloatType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      count: this.ssilEnabled ? 2 : 1,
    });
    rt.textures[0].name = name;
    if (this.ssilEnabled) rt.textures[1].name = name + "Ssil";
    return rt;
  }

  /** 运行时开关 SSIL（画质面板 / 性能消融）。要重建材质与靶，不是每帧的事。 */
  SetSsilEnabled(on) {
    const want = !!on;
    if (want === this.ssilEnabled) return;
    this.ssilEnabled = want;
    this._BuildMaterials();
    this.Resize(this.pipeline.width, this.pipeline.height);
  }

  Enabled(ctx) {
    // `preset.ssao` 是 AO 的总闸（FrameProfileTest 的消融、调试面板的可用性判据
    // 都读它，语义不许变）；`preset.gtao` 是档位名。任一为假就整趟不跑。
    return ctx.preset.ssao !== false && !!ctx.preset.gtao;
  }

  Resize(width, height) {
    this._DisposeTargets();
    this.tier = MakeGtaoTier(this._TierName());
    this.uniformsTrace.uTemporalCycle.value = this.tier.temporalCycle;
    // 靶比例只有一个出处：画质档的 aoScale（面板上能看见的那一根）。
    const scale = this.pipeline.preset.aoScale || 0.5;
    const aw = Math.max(2, Math.round(width * scale));
    const ah = Math.max(2, Math.round(height * scale));
    this.raw = this._MakeTarget(aw, ah, "gtaoRaw");
    this.blurOut = this._MakeTarget(aw, ah, "gtao");
    if (this.tier.temporal) {
      this.history = [this._MakeTarget(aw, ah, "gtaoHistoryA"), this._MakeTarget(aw, ah, "gtaoHistoryB")];
    } else {
      this.history = [null, null];
    }
    this.historyFlip = false;
    this.hasHistory = false;
    // 颜色历史封顶在半分辨率：SSIL 是低频量，ultra 的全分辨率给它没有意义，
    // 只会白占一张 36 MB 的靶。
    const cw = Math.max(2, Math.round(width * Math.min(scale, 0.5)));
    const ch = Math.max(2, Math.round(height * Math.min(scale, 0.5)));
    this.colorHistory = MakeRenderTarget(cw, ch, { type: this.pipeline.hdrType });
    this.colorHistory.texture.name = "gtaoColorHistory";
    this.hasColorHistory = false;

    // 老名字对外（EditorTest / Debug Rendering / Script_Main 都按这三个名字取）
    const T = this.pipeline.targets;
    T.ao = this.raw;
    T.aoTmp = this.tier.blurPasses > 1 ? this.raw : this.blurOut;
    T.aoBlur = this.blurOut;
  }

  _DisposeTargets() {
    for (const rt of [this.raw, this.blurOut, this.history[0], this.history[1], this.colorHistory]) {
      if (rt) rt.dispose();
    }
    this.raw = null;
    this.blurOut = null;
    this.history = [null, null];
    this.colorHistory = null;
  }

  /** 最终 AO 靶的第二张附件（SSIL）。SSIL 关着时是一张 1×1 全黑。 */
  get SsilTexture() {
    return this.ssilEnabled && this.blurOut?.textures?.[1]
      ? this.blurOut.textures[1] : this.blackPixel;
  }

  Render(ctx) {
    const U = this.uniformsTrace;
    U.uNormalDepth.value = ctx.normalDepthTexture;
    U.uPrevColor.value = this.colorHistory ? this.colorHistory.texture : null;
    U.uAoResolution.value.set(this.raw.width, this.raw.height);
    U.uFullResolution.value.set(ctx.width, ctx.height);
    U.uProjScale.value.copy(ctx.projScale);
    U.uInvView.value.copy(ctx.invView);
    U.uPrevViewProjection.value.copy(ctx.prevViewProjection);
    U.uHasPrevColor.value = this.hasColorHistory && ctx.hasPrev ? 1 : 0;
    U.uFrame.value = ctx.frame;
    // 半径与强度允许调用方逐帧改（编辑器旋钮 / 测试消融），默认取数值表。
    U.uRadius.value = ctx.options.aoRadius ?? GTAO.radius;
    U.uFinalPower.value = ctx.options.aoPower ?? GTAO.finalPower;
    ctx.blitter.Blit(this.materialTrace, this.raw);

    let source = this.raw;
    if (this.tier.temporal && this.history[0]) {
      const read = this.historyFlip ? this.history[1] : this.history[0];
      const write = this.historyFlip ? this.history[0] : this.history[1];
      const V = this.uniformsTemporal;
      V.uCurrentAo.value = this.raw.textures[0];
      V.uCurrentIl.value = this.ssilEnabled ? this.raw.textures[1] : null;
      V.uHistoryAo.value = read.textures[0];
      V.uHistoryIl.value = this.ssilEnabled ? read.textures[1] : null;
      V.uVelocity.value = ctx.velocityTexture;
      V.uNormalDepth.value = ctx.normalDepthTexture;
      V.uFullResolution.value.set(ctx.width, ctx.height);
      V.uInvView.value.copy(ctx.invView);
      V.uPrevViewProjection.value.copy(ctx.prevViewProjection);
      V.uProjScale.value.copy(ctx.projScale);
      V.uHasHistory.value = this.hasHistory && ctx.hasPrev ? 1 : 0;
      V.uUseVelocity.value = ctx.velocityTexture ? 1 : 0;
      ctx.blitter.Blit(this.materialTemporal, write);
      this.historyFlip = !this.historyFlip;
      this.hasHistory = true;
      source = write;
    }

    const B = this.uniformsBlur;
    B.uNormalDepth.value = ctx.normalDepthTexture;
    B.uFullResolution.value.set(ctx.width, ctx.height);
    B.uTexel.value.set(1 / this.raw.width, 1 / this.raw.height);
    if (this.tier.blurPasses > 1) {
      // 横向写回 raw：trace 的原始内容这一帧已经用完了，省一对全尺寸靶。
      B.uAo.value = source.textures[0];
      B.uIl.value = this.ssilEnabled ? source.textures[1] : null;
      B.uDirection.value.set(1, 0);
      ctx.blitter.Blit(this.materialBlur, this.raw);
      B.uAo.value = this.raw.textures[0];
      B.uIl.value = this.ssilEnabled ? this.raw.textures[1] : null;
      B.uDirection.value.set(0, 1);
      ctx.blitter.Blit(this.materialBlur, this.blurOut);
    } else {
      B.uAo.value = source.textures[0];
      B.uIl.value = this.ssilEnabled ? source.textures[1] : null;
      B.uDirection.value.set(1, 0);
      ctx.blitter.Blit(this.materialBlur, this.blurOut);
    }
  }

  /** 帧图里的 `ssilHistory`：把 taa 解算后的场景色降采样存下来，下一帧当反弹源。 */
  ColorHistoryEnabled(ctx) {
    return this.ssilEnabled && !!this.colorHistory && this.Enabled(ctx);
  }

  CaptureColorHistory(ctx) {
    this.uniformsHistory.uSource.value = ctx.sceneColor.texture;
    ctx.blitter.Blit(this.materialHistory, this.colorHistory);
    this.hasColorHistory = true;
  }

  /** 镜头硬切：历史一律作废（PostPipeline.NotifyCameraCut 调）。 */
  NotifyCameraCut() {
    this.hasHistory = false;
    this.hasColorHistory = false;
  }

  /**
   * Debug Rendering 的三个自有视图。返回 `{ material, Prepare, unavailable }`，
   * 由 `Script_PostDebug.RenderView` 的通用材质分支送屏。
   */
  GetDebugSource(view) {
    const modes = { bentNormal: 0, ssil: 1, specularOcclusion: 2 };
    if (!(view in modes)) return null;
    const ready = !!this.blurOut && this.pipeline.preset.ssao !== false && !!this.pipeline.preset.gtao;
    const unavailable = !ready || (view === "ssil" && !this.ssilEnabled);
    return {
      material: this.materialDebug,
      unavailable,
      texture: this.blurOut?.textures?.[0] ?? null,
      Prepare: (ctx) => {
        const D = this.uniformsDebug;
        D.uMode.value = modes[view];
        D.uUnavailable.value = unavailable ? 1 : 0;
        D.uAo.value = this.blurOut?.textures?.[0] ?? null;
        D.uIl.value = this.SsilTexture;
        D.uNormalDepth.value = ctx.normalDepthTexture;
        D.uProjScale.value.copy(ctx.projScale);
      },
    };
  }

  Dispose() {
    this._DisposeTargets();
    this.materialTrace?.dispose();
    this.materialTemporal?.dispose();
    this.materialBlur?.dispose();
    this.materialHistory.dispose();
    this.materialDebug.dispose();
    this.blackPixel.dispose();
  }
}

// ===========================================================================
// 已知近似（都是有意的，别当 bug 修）
// ---------------------------------------------------------------------------
// 1) **没有深度 mip 金字塔。** XeGTAO 用一条加权平均的深度 mip 链降低大半径时的
//    缓存缺失。这里没接：仓库里的 HZB 是 **max-reduce**（给 SSR / 体积雾用的
//    保守远深度），拿它做 AO 会系统性地把地平线压低、整体欠遮蔽。
//    代价由 `GTAO.maxPixelRadius` 兜住（贴脸时半径封顶）。
// 2) **八面体编码的缝。** 弯曲法线的 G/B 通道在双线性过滤下跨 z=0 的缝会插值出
//    错误方向。可见面的弯曲法线基本都在 +z 半球，实测没有可见伪影；真要修得
//    在时域/双边里逐抽样解码（成本翻倍）。
// 3) **SSIL 的辐亮度源滞后一帧，且按相机运动重投影。** 逐物体运动（跑动的士兵、
//    大车）在反弹源里按静止处理 —— 与 TAA / 运动模糊现役的同一条近似。
// 4) **位掩码只在切片内做，不跨切片。** 论文的做法也是如此：跨切片的遮挡重叠
//    由切片数本身平均掉。
// 5) **第一人称的手与枪**在预通道里写的是 FOREGROUND_VIEW_DEPTH 常数深度，
//    所以它们那一块的 GTAO 是「一片等深平面」= 无遮蔽。与旧 SSAO 同一条口径。
// 6) **时域拒绝用的是相机重投影得到的期望深度**，逐物体运动的表面在快速位移时
//    会被判为 disocclusion 而丢历史（表现是运动中的角色 AO 略噪）。这是安全的
//    一侧：宁可噪一点，也不要拖影。
// ===========================================================================
