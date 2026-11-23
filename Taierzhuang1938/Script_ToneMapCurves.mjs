// 色调映射曲线（零依赖）：ACES Hill / AgX 的 GLSL 与逐系数对照的 JS 镜像。
//
// 两份必须是同一条曲线，所以仍住在同一个文件里。以前它们在 Script_PostExposure（自动曝光）里，
// 只想要「把 HDR 映射到屏幕」的地方（独立特效预览窗口的输出变换）就得连自动曝光与后处理公共层一起拖进来；
// 现在挪到这里，Script_PostExposure 照旧再导出这几个名字（合成 pass 与中灰求解不用改）。

// ===========================================================================
// 色调映射曲线库（GLSL + JS 镜像）
//
// GLSL 由 Script_PostComposite 的 SEGMENT exposure 引用；JS 镜像用来数值求解
// 「中灰补偿 EV」，并给验收断言当独立 oracle。两份必须是同一条曲线 ——
// 所以放在同一个文件里，改一处另一处立刻在眼前。
// ===========================================================================

/** ACES（Stephen Hill 拟合）+ AgX（Sobotka，对齐 three r185 的 AgXToneMapping）。 */
export const TONEMAP_GLSL = /* glsl */`
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

// AgX（Troy Sobotka；这里逐系数对齐 three r185 的 tonemapping chunk，
// 免得将来换用内置 tonemapping 时观感突变）。曝光已经在前面乘过，
// 所以不再乘 toneMappingExposure。
vec3 AgxContrastApprox(vec3 x) {
  vec3 x2 = x * x;
  vec3 x4 = x2 * x2;
  return 15.5 * x4 * x2 - 40.14 * x4 * x + 31.96 * x4
    - 6.868 * x2 * x + 0.4298 * x2 + 0.1191 * x - 0.00232;
}

vec3 AgxTonemap(vec3 color) {
  const mat3 SRGB_TO_REC2020 = mat3(
    0.6274, 0.0691, 0.0164,
    0.3293, 0.9195, 0.0880,
    0.0433, 0.0113, 0.8956);
  const mat3 REC2020_TO_SRGB = mat3(
     1.6605, -0.1246, -0.0182,
    -0.5876,  1.1329, -0.1006,
    -0.0728, -0.0083,  1.1187);
  const mat3 AGX_INSET = mat3(
    0.856627153315983, 0.137318972929847, 0.11189821299995,
    0.0951212405381588, 0.761241990602591, 0.0767994186031903,
    0.0482516061458583, 0.101439036467562, 0.811302368396859);
  const mat3 AGX_OUTSET = mat3(
     1.1271005818144368, -0.1413297634984383, -0.14132976349843826,
    -0.11060664309660323, 1.157823702216272, -0.11060664309660294,
    -0.016493938717834573, -0.016493938717834257, 1.2519364065950405);
  const float AGX_MIN_EV = -12.47393;
  const float AGX_MAX_EV = 4.026069;
  vec3 c = SRGB_TO_REC2020 * max(color, vec3(0.0));
  c = AGX_INSET * c;
  c = log2(max(c, vec3(1e-10)));
  c = clamp((c - AGX_MIN_EV) / (AGX_MAX_EV - AGX_MIN_EV), 0.0, 1.0);
  c = AgxContrastApprox(c);
  c = AGX_OUTSET * c;
  c = pow(max(c, vec3(0.0)), vec3(2.2));
  c = REC2020_TO_SRGB * c;
  return clamp(c, 0.0, 1.0);
}

/** mode: 0 = ACES（默认，与既有画面逐比特一致），1 = AgX。 */
vec3 ApplyTonemap(vec3 color, float mode) {
  if (mode < 0.5) return AcesFitted(color);
  return AgxTonemap(color);
}
`;

// --- JS 镜像（中灰求解 + 验收 oracle）--------------------------------------

/** 与 GLSL 的 mat3(列0, 列1, 列2) 同序：m = [c0r0,c0r1,c0r2, c1r0,…]。 */
function Mat3Apply(m, v) {
  return [
    m[0] * v[0] + m[3] * v[1] + m[6] * v[2],
    m[1] * v[0] + m[4] * v[1] + m[7] * v[2],
    m[2] * v[0] + m[5] * v[1] + m[8] * v[2],
  ];
}

const ACES_IN = [0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777];
const ACES_OUT = [1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602];

/** ACES Hill 的 JS 镜像（逐系数对着 TONEMAP_GLSL 抄）。 */
export function AcesFittedJs(rgb) {
  const v = Mat3Apply(ACES_IN, rgb);
  const t = v.map((x) => {
    const a = x * (x + 0.0245786) - 0.000090537;
    const b = x * (0.983729 * x + 0.432951) + 0.238081;
    return a / b;
  });
  return Mat3Apply(ACES_OUT, t).map((x) => Math.min(1, Math.max(0, x)));
}

const SRGB_TO_REC2020 = [0.6274, 0.0691, 0.0164, 0.3293, 0.9195, 0.0880, 0.0433, 0.0113, 0.8956];
const REC2020_TO_SRGB = [1.6605, -0.1246, -0.0182, -0.5876, 1.1329, -0.1006, -0.0728, -0.0083, 1.1187];
const AGX_INSET = [0.856627153315983, 0.137318972929847, 0.11189821299995,
  0.0951212405381588, 0.761241990602591, 0.0767994186031903,
  0.0482516061458583, 0.101439036467562, 0.811302368396859];
const AGX_OUTSET = [1.1271005818144368, -0.1413297634984383, -0.14132976349843826,
  -0.11060664309660323, 1.157823702216272, -0.11060664309660294,
  -0.016493938717834573, -0.016493938717834257, 1.2519364065950405];

/** AgX 的 JS 镜像。 */
export function AgxTonemapJs(rgb) {
  let c = Mat3Apply(SRGB_TO_REC2020, rgb.map((x) => Math.max(0, x)));
  c = Mat3Apply(AGX_INSET, c);
  c = c.map((x) => {
    const l = Math.log2(Math.max(x, 1e-10));
    const t = Math.min(1, Math.max(0, (l + 12.47393) / (4.026069 + 12.47393)));
    const t2 = t * t;
    const t4 = t2 * t2;
    return 15.5 * t4 * t2 - 40.14 * t4 * t + 31.96 * t4
      - 6.868 * t2 * t + 0.4298 * t2 + 0.1191 * t - 0.00232;
  });
  c = Mat3Apply(AGX_OUTSET, c);
  c = c.map((x) => Math.pow(Math.max(0, x), 2.2));
  return Mat3Apply(REC2020_TO_SRGB, c).map((x) => Math.min(1, Math.max(0, x)));
}

export const TONEMAP_JS = { aces: AcesFittedJs, agx: AgxTonemapJs };
