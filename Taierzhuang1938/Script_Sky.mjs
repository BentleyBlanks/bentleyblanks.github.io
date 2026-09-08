// 《台儿庄：血战滕县》天空。
//
// 默认间接光由 Global SH Probe + 环境贴图共同提供：SH 托住漫反射的方向感，
// PMREM 则给人物军装、钢盔和刀枪保留必要的反射。缺掉环境贴图时，背光的人物和
// 金属会直接压成黑色；实时 GI 打开后再补上位置相关的反弹光。
//
// ## 2026-09：天穹换成 Hillaire 2020 的物理大气
// 原来是一套美术化的解析式（天顶→地平线梯度 + 太阳盘 + 前向散射辉光），
// 问题不是"不好看"，是**没有结构**：一条单调渐变，太阳周围只有一个 pow 出来的
// 圆晕，地平线附近既没有臭氧的青、也没有多次散射把黄昏托起来的那层亮。
// 现在天顶到地平线这一段由 `Script_Atmosphere.mjs` 的天空视图 LUT 给
// （瑞利 + Mie + 臭氧 + 多次散射），**美术层原样留在它上面**：
// 高空烟／云、贴地的战场烟尘带、辉光加成、地面反照、星。
// 台儿庄打了半个月，天上是有烟的 —— 一片干净的物理蓝天同样失真。
//
// 三条不许破的接线：
//   1. `SkyRadiance(dir, sunDiskGain)` 的**签名不变** —— 探针体 GI 的漏空射线
//      （Script_Gi 的 trace pass）复用同一段 GLSL，两处各抄一份的下场是
//      改了天空预设、GI 还照着旧的天在积分。
//   2. LUT 的纹理与参数 uniform 一并挂进 `sky.uniforms`；GI 的 `BuildPasses`
//      把这张表整个拷进 trace 材质（**拷的是 uniform 对象本身**），所以
//      换预设两边同时变，不需要 Script_Gi 改一个字。
//   3. `BakeEnvironment` 仍从天穹烘 PMREM。`Apply()` 里三张静态 LUT 是
//      **同步**算完的，烘焙拿到的一定是本预设的天，不是上一档的。
//
// `?skyLegacy=1` 走回旧的解析天空（A/B 对照与回退用）。切换是 uniform 分支，
// 不重编译。

import * as THREE from "three";
import {
  Atmosphere, ATMOSPHERE_SAMPLE_GLSL, ATMOSPHERE_EARTH,
  MakeAtmospherePreset, PhysicalSunLight, SetActiveAtmosphere,
} from "./Script_Atmosphere.mjs";

const SKY_VERT = /* glsl */`
varying vec3 vWorldDirection;
void main() {
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vWorldDirection = normalize(worldPosition.xyz - cameraPosition);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position.z = gl_Position.w;   // 永远贴在远平面
}
`;

// 天空的本体。抽成独立的一段 GLSL 是因为**探针体的漏空射线也要问同一片天**
// （见 Script_Gi.mjs）：两处各抄一份的下场是改了天空预设、GI 还照着旧的天在积分，
// 阴影侧的补光和天穹对不上色。uniform 声明一起抽出来，两边共用同一批 uniform 对象。
//
// sunDiskGain：天穹本体传 1.0；探针积分传 0.0 —— 太阳的直接光在材质里是
// DirectionalLight 那一路算的，射线再撞上太阳盘就是双份，而且 0.53° 的
// 盘用 64 根射线去采必然爆方差（有的探针撞上、有的没撞上，闪成一片噪点）。
export const SKY_RADIANCE_GLSL = ATMOSPHERE_SAMPLE_GLSL + /* glsl */`
uniform vec3 uSunDirection;
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uGround;
uniform vec3 uSunColor;
uniform float uSunIntensity;
uniform float uSunSize;
uniform float uGlowStrength;
uniform float uGlowSpread;
uniform float uSmoke;        // 战场烟尘的总量
uniform vec3 uSmokeColor;
uniform float uSmokeHeight;
uniform float uStars;
uniform float uTime;
// 物理天空之上的美术层强度：LUT 里已经有真的前向散射，这一层只补"辉光多亮"。
uniform float uArtGlow;
// 太阳盘吃多少透过率（1 = 完全物理，黄昏自然变橙变暗；0 = 沿用美术色）。
uniform float uSunDiskT;
// 地平线以下：朝下的视线被战场霾罩住多少（0 = 不修正，退回原始 LUT）。
// 为什么需要它，见 SkyRadiance 里那一段长注释。
uniform float uAtmoBelowVeil;

float Hash31(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float Noise3(vec3 x) {
  vec3 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(Hash31(i + vec3(0,0,0)), Hash31(i + vec3(1,0,0)), f.x),
                 mix(Hash31(i + vec3(0,1,0)), Hash31(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(Hash31(i + vec3(0,0,1)), Hash31(i + vec3(1,0,1)), f.x),
                 mix(Hash31(i + vec3(0,1,1)), Hash31(i + vec3(1,1,1)), f.x), f.y), f.z);
}

float Fbm3(vec3 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * Noise3(p); p *= 2.02; a *= 0.5; }
  return v;
}

vec3 SkyRadiance(vec3 dir, float sunDiskGain) {
  float up = dir.y;
  vec3 sunDir = normalize(uSunDirection);
  float sunDot = dot(dir, sunDir);

  // --- 前向散射的**形状**：靠近太阳的一大片天要亮起来 ---
  // 物理档里 LUT 已经给了真的 Mie 前向散射，这一层退成美术加成（uArtGlow）；
  // 旧档里它是唯一的来源，所以 uArtGlow 在 legacy 分支不参与。
  float glow = pow(max(sunDot * 0.5 + 0.5, 0.0), uGlowSpread);

  vec3 sky;
  if (uAtmoEnabled > 0.5) {
    // --- 物理：天空视图 LUT（瑞利 + Mie + 臭氧 + 多次散射）---
    sky = AtmoSkyView(dir, sunDir);
    // --- 地平线以下：把 LUT 那一半按霾的不透明度混向地平线那一圈 -------------
    //
    // 事故（2026-09-08，俯瞰机位）：Hillaire 的天空视图 LUT 下半张算的是
    // 「干净空气里看一片 albedo 0.2 的地面」—— 一条短程瑞利加一个朗伯地面。
    // 而战场霾**按设计不进这张表**（它只进大气透视 LUT，见 17.7「已知的近似」），
    // 于是朝下的方向拿到的是又暗又蓝的一片：实测 smokyDay、相机 86 m 时
    // −1° 处物理 1.24 对旧解析天的 1.82（−32%），B/R 从 1.05 涨到 1.50。
    // 地面机位看不见这一段（下半屏全是几何），**只有俯瞰机位会整片吃到** ——
    // Air_Crossroad 的上半屏因此是一整块暗蓝灰，而基线是明亮白霾。
    //
    // 修法不是抬 LUT，是补上那层霾：一条朝下的视线要横穿整层战场霾好几公里，
    // 出来的就是霾自己的辐射亮度，也就是**地平线那一圈**的值（真实世界里
    // 「远处地面在霾里与天连成一片」正是这么来的）。所以按不透明度混向
    // 同方位的 0° 方向。地平线两侧因此是连续的（up→0 时两个采样重合）。
    if (up < 0.0 && uAtmoBelowVeil > 0.001) {
      vec2 flatDir = vec2(dir.x, dir.z);
      float flatLen = length(flatDir);
      // 正下方没有方位可言；那里 uGround 早已完全接管，补不补一个样
      if (flatLen > 1.0e-4) {
        vec3 horizonDir = vec3(flatDir.x / flatLen, 0.0, flatDir.y / flatLen);
        sky = mix(sky, AtmoSkyView(horizonDir, sunDir), clamp(uAtmoBelowVeil, 0.0, 1.0));
      }
    }
    sky += uSunColor * glow * uGlowStrength * uArtGlow;
  } else {
    // --- 旧解析天空（?skyLegacy=1）：天顶到地平线的梯度，pow 决定"天有多高" ---
    float t = pow(clamp(1.0 - max(up, 0.0), 0.0, 1.0), 2.6);
    sky = mix(uZenith, uHorizon, t);
    sky += uSunColor * glow * uGlowStrength;
  }

  // --- 太阳盘：给足 HDR 值，泛光与 IBL 都靠它 ---
  if (sunDiskGain > 0.0) {
    // 物理档是真角直径 0.5357° 的圆盘 + 临边昏暗（中心到边缘掉到约 0.4）；
    // 旧档是 smoothstep 出来的软斑。两者角径几乎一样（旧的 uSunSize 1.2e-5
    // 反解出来是 0.56° 直径），换过去泛光与拖影的量级不变。
    float disk = uAtmoEnabled > 0.5
      ? AtmoSunDisk(sunDot)
      : smoothstep(1.0 - uSunSize, 1.0 - uSunSize * 0.35, sunDot);
    vec3 diskColor = uSunColor * uSunIntensity;
    if (uAtmoEnabled > 0.5) {
      diskColor *= mix(vec3(1.0), AtmoSunTransmittance(sunDir), clamp(uSunDiskT, 0.0, 1.0));
    }
    sky += diskColor * disk * sunDiskGain;
  }

  // --- 高空烟／云：拉长的 fbm，越靠地平线越压扁 ---
  if (uSmoke > 0.001) {
    vec3 p = dir / max(abs(up) + 0.12, 0.06);
    // 事故：原来是 Fbm3(p * 0.9) 配 smoothstep(0.42, 0.86)。五倍频 fbm 的取值
    // 实际集中在 0.48 ± 0.08，0.86 这个上限相当于 +4.7σ —— 云项恒等于 0，
    // 白天四张的天全是一块 sRGB 234 的死白。频率提到 5.5 才有云团大小的团块，
    // 阈值窗口收到 0.445—0.615 才真的落在分布里被触发。
    float cloud = Fbm3(p * 5.5 + vec3(uTime * 0.006, 0.0, uTime * 0.004));
    cloud = smoothstep(0.445, 0.615, cloud) * smoothstep(-0.02, 0.22, up);
    // 烟被太阳打透的那一侧要亮：这一笔没有的话烟就是一块贴纸
    vec3 lit = mix(uSmokeColor, uSmokeColor * 2.4 + uSunColor * 0.25, pow(max(sunDot, 0.0), 3.0));
    sky = mix(sky, lit, clamp(cloud * uSmoke, 0.0, 0.94));
  }

  // --- 贴地的战场烟尘带：整场戏都在这层灰里 ---
  //
  // 事故（这是"诊断到一半"的典型）：上一轮把云的频率与阈值修对了，夜景能证明
  // 云项真的在跑；但紧跟其后的这一行又把云整片刷回去了 —— smokyDay 是
  // exp(−up/0.30) 配 0.72×0.75+0.18 = 0.72 的混合上限，而 uSmokeColor 3.30 与
  // uHorizon 5.40 只差百分之几，云和天被刷成同一个值，实测就是 229→250 的单调白。
  // 这一层是**贴地的一条带**，不是罩住整个天穹的盖子：混合上限压到 0.62，
  // 底噪从 0.18 压到 0.04（没有烟的时候就该几乎没有这一层），
  // 再配合各预设把 smokeHeight 从 0.2—0.36 收到 0.10—0.13，它才退回地平线附近。
  //
  // 物理档里它仍然留着：大气透视 LUT 里的战场霾管的是**视线穿过霾看地物**，
  // 这一条带管的是**天本身有多脏**，两件事。天空视图 LUT 刻意不含霾，
  // 两处都放就是双份灰（那正是 2026-08 那次"单调白"的成因）。
  float haze = exp(-max(up, 0.0) / max(uSmokeHeight, 0.01));
  sky = mix(sky, uSmokeColor * (0.85 + glow * 0.6), haze * clamp(uSmoke * 0.55 + 0.04, 0.0, 0.62));

  // --- 地平线以下：地面反照（IBL 的下半球靠它，不然人物下巴死黑）---
  // 物理档同样保留：LUT 的地面项只有朗伯反照，落到 PMREM 下半球会比
  // 美术定的 uGround 暗一大截，人物下巴与檐下当场死黑。
  sky = mix(sky, uGround, smoothstep(0.0, -0.14, up));

  // --- 星（夜战关）---
  if (uStars > 0.001 && up > 0.0 && sunDiskGain > 0.5) {
    // 190 的格距在 1600×900 上一格有 4—8 px 宽，而 floor() 取的是整格常数 ——
    // 星星就是一个个硬边方块，还会被 FXAA 啃出十字，看着像屏幕坏点。
    // 900 让一格缩到 1—2 px，再乘一个格内径向衰减把方块磨成圆点。
    vec3 sp = dir * 900.0;
    float star = pow(Hash31(floor(sp)), 220.0)
      * (1.0 - smoothstep(0.15, 0.5, length(fract(sp) - 0.5)));
    sky += vec3(0.85, 0.9, 1.0) * star * uStars * smoothstep(0.02, 0.35, up);
  }

  return max(sky, vec3(0.0));
}
`;

const SKY_FRAG = SKY_RADIANCE_GLSL + /* glsl */`
varying vec3 vWorldDirection;
void main() {
  gl_FragColor = vec4(SkyRadiance(normalize(vWorldDirection), 1.0), 1.0);
}
`;

/**
 * 时段预设。每一关按剧情选一个，关内可以插值过渡。
 * 数值单位是"线性 HDR"，配合 PostPipeline 的 exposure 一起看。
 *
 * ## `atmosphere` 这一块（2026-09 新增）
 * 是物理大气的每预设参数，缺省值见 `Script_Atmosphere.ATMOSPHERE_PRESET_DEFAULTS`。
 * 旧的 `zenith / horizon / glow / sunSize` 一个都没删：`?skyLegacy=1` 要用它们
 * 做 A/B，水面（Script_Water）也仍借 `uZenith/uHorizon/uGround` 当反射底色。
 * 数值由 `Script_AtmosphereCalibrate.mjs` 在真浏览器里拟合出来。**拟合的主目标是
 * 上半球余弦加权辐照度**（十档全部落在 ±5%）—— 它正比于 PMREM 烘出来那张 IBL 的
 * 量级，也就是「整幅画有多亮」。天顶/地平线/太阳侧允许重新分配（实测最多 ±23%）：
 * 物理天空本来就会把能量从天顶挪到地平线，逼它们逐项等于旧值等于把物理模型
 * 重新拟合成旧模型。逐档的数与理由见 docs/Data_TechRenderPipeline.md §17.5。
 */
// Shared test daylight: fixed world-space key + neutral shadow fill, clear air.
// Linear HDR renderer units, not measured physical lux. Compare identical poses,
// orientation and graphics settings; preserve each character's authored albedo.
export const TEST_SCENE_DAY = {
  sunElevation: 52, sunAzimuth: 35,
  zenith: [0.38, 0.52, 0.72], horizon: [0.68, 0.76, 0.86], ground: [0.30, 0.32, 0.34],
  sunColor: [1.0, 0.98, 0.95], sunIntensity: 40, sunSize: 0.000012, glow: 0.18, glowSpread: 10,
  smoke: 0, smokeColor: [0.67, 0.70, 0.75], smokeHeight: 0.10, stars: 0,
  lightColor: 0xfffaf0, lightIntensity: 3.2,
  envIntensity: 0.70, shProbeIntensity: 0.85, ambientColor: 0xffffff, ambientIntensity: 1.0,
  fog: { density: 0, falloff: 30, max: 0,
    sky: [0.50, 0.56, 0.65], ground: [0.42, 0.44, 0.47], sunGain: 0,
    desat: 0, flatten: 0 },
  exposure: 0.62, godStrength: 0, bloom: 0, saturation: 1, contrast: 1,
  // 测试场是六个白盒共用的基准，灰卡基线（Script_TestSceneLightingTest）对它最敏感。
  // Mie 2.4 不是"干净空气"：手调的那张天本来就偏白偏平（天顶 B/R 只有 1.9，
  // 真正的晴空是 5 上下），拟合出来的就是一层薄霾 —— 鲁南三四月浮尘大，说得通。
  atmosphere: { mie: 2.4, rayleigh: 2.0, groundAlbedo: 0.2, sunIrradiance: 14.04,
    skyTint: [1.069, 0.922, 1.014], skyFloor: [0.069, 0.128, 0.238],
    aerialBlend: 0.5, aerialGain: 0.532, artGlow: 0.35 },
};

export const SKY_PRESETS = {
  testSceneDay: TEST_SCENE_DAY,
  // Keep saved editor/debug preset names on the same calibration.
  weaponRangeDay: TEST_SCENE_DAY,
  p012WhiteboxDay: TEST_SCENE_DAY,
  // 关卡策划白盒专用：环境体块全是 0xffffff，不能沿用正片 smokyDay 的 8.6 直射、
  // 1.05 IBL 与 0.34 bloom —— 三项叠加会把地面和迎光面一起剪成纯白，形体反而消失。
  // 这里不靠给盒子染灰做层次；材质仍是纯白，只把光照压进可审读的动态范围，
  // 冷灰天空同时给轮廓留出背景分离。正片没有任何章节引用这一档。
  whiteboxDay: {
    sunElevation: 45, sunAzimuth: 222,
    zenith: [0.42, 0.58, 0.86], horizon: [0.82, 0.88, 1.02], ground: [0.26, 0.28, 0.31],
    sunColor: [1.0, 0.97, 0.91], sunIntensity: 42, sunSize: 0.000012, glow: 0.45, glowSpread: 10,
    smoke: 0.16, smokeColor: [0.62, 0.66, 0.73], smokeHeight: 0.10, stars: 0.0,
    lightColor: 0xfff3df, lightIntensity: 3.8,
    envIntensity: 0.52,
    shProbeIntensity: 0.20,
    ambientIntensity: 0.07,
    fog: { density: 0.0048, falloff: 30, max: 0.70,
      sky: [0.40, 0.44, 0.52], ground: [0.34, 0.35, 0.38], sunGain: 0.10,
      desat: 0.18, flatten: 0.04 },
    exposure: 0.40, godStrength: 0.05, bloom: 0.06, saturation: 0.92, contrast: 1.12,
    atmosphere: { mie: 1.6, rayleigh: 2.0, groundAlbedo: 0.2, sunIrradiance: 18.91,
      skyTint: [1.074, 0.903, 1.031], skyFloor: [0.077, 0.145, 0.273],
      aerialBlend: 0.5, aerialGain: 0.336, artGlow: 0.35 },
  },
  // 完整场景编辑器专用的长视距白昼。县城总览机位离最远门外约 1.6 km，正片的
  // 历史硝烟档会把四关厢压成同一片灰；这一档把雾留作轻空气透视，但不遮掉地物。
  // 不进七章、不进过场，只由 Data_Menu.FULL_SCENE_PHASE 使用。
  editorClear: {
    sunElevation: 56, sunAzimuth: 232,
    zenith: [0.95, 1.12, 1.48], horizon: [1.30, 1.31, 1.34], ground: [0.52, 0.47, 0.39],
    sunColor: [1.0, 0.94, 0.82], sunIntensity: 64, sunSize: 0.000012, glow: 0.95, glowSpread: 12,
    smoke: 0.18, smokeColor: [1.05, 1.03, 0.99], smokeHeight: 0.10, stars: 0.0,
    lightColor: 0xffe8cc, lightIntensity: 6.6,
    hemiSky: 0x9bb6dc, hemiGround: 0x76583d, hemiIntensity: 1.20,
    envIntensity: 1.35, shProbeIntensity: 0.58, ambientIntensity: 0.30,
    fog: { density: 0.00018, falloff: 600, max: 0.42,
      sky: [0.68, 0.67, 0.64], ground: [0.40, 0.40, 0.41], sunGain: 0.12,
      desat: 0.12, flatten: 0.04 },
    exposure: 0.54, godStrength: 0.12, bloom: 0.16, saturation: 1.0, contrast: 1.08,
    atmosphere: { mie: 3.6, rayleigh: 2.0, groundAlbedo: 0.2, sunIrradiance: 36.05,
      skyTint: [1.401, 0.973, 0.734], skyFloor: [0.117, 0.209, 0.393],
      aerialBlend: 0.6, aerialGain: 0.266, artGlow: 0.35 },
  },
  // ==========================================================================
  // 太阳仰角这一栏是本作**最贵的一个数**，改之前先读这一段。
  //
  // 实测（Probe_StreetSmokyDay，主街净宽 5.2 m、檐口 4.6 m）：
  // 把 lightIntensity 从 3.1 一路抬到 30，街上墙面只从 sRGB 88.5 动到 89.8 ——
  // **平行光一点都没照进街里**；旧版整场亮度都来自 scene.environment 的天空 IBL，
  // 现在则由默认 Global SH Probe 托底。两者都没有位置概念，所以这条街仍必须让
  // 太阳越过峡谷线，才能形成真正的明暗分离。
  // IBL 从各个方向来的值差不多，于是每一面墙、地、瓦都是同一个亮度、同一个色相：
  // 这就是「整体偏单色土黄、没有暖主光 + 冷阴影分离」的**唯一根因**，
  // 不是调色不够，也不是饱和度不对。
  //
  // 街是一条峡谷：檐高 h、街宽 w，太阳仰角必须满足 tan(elev) > h/w 才有一线阳光
  // 落到街面上。这里 atan(4.6/5.2) = 41.5° —— 原来的 smokyDay 38° 差一点点，
  // burningStreet 21° 差得远。抬过这条线，街上立刻出现「一条晒着的地 + 一面
  // 晒着的墙 + 一面阴着的墙」，形体是白送的。
  //
  // 上限由史实定死：台儿庄 34.56°N，三月末赤纬 +2°，正午最大仰角 57.4°。
  // 所以白天档只能落在 41.5°—57° 这个窄窗里，写在下面每一档的注释里。
  // 抬仰角之后必须**同步压 envIntensity** —— 否则阴影侧被 IBL 提起来，
  // 明暗比又白调，等于只把整张图提亮。
  //
  // 【2026-09 物理大气】仰角同时是大气 LUT 的唯一自变量（太阳天顶角），
  // 改它连带改整张天空视图 LUT 与平行光的物理推荐值 —— 这一栏比以前更贵了。
  // ==========================================================================

  // 3 月 23 日黄昏：部队进城布防
  dusk: {
    // 黄昏就是**该**低于峡谷线：街底全在阴影里，只有屋面与山墙顶端挂着最后一道
    // 橙光 —— 这个上明下暗的分层本身就是形体。7.5° 太低（连屋脊都吃不满），
    // 12° 让檐口以上那一米真的亮起来，仍是日落前 40 分钟的样子。
    sunElevation: 12.0, sunAzimuth: 262,
    zenith: [0.42, 0.62, 1.15], horizon: [4.20, 2.30, 1.05], ground: [0.46, 0.38, 0.30],
    sunColor: [1.0, 0.54, 0.26], sunIntensity: 90, sunSize: 0.000012, glow: 3.2, glowSpread: 18,
    smoke: 0.50, smokeColor: [1.55, 1.05, 0.70], smokeHeight: 0.17, stars: 0.0,
    lightColor: 0xffb072, lightIntensity: 8.8,
    // 街底唯一的光源是天空，所以半球光的「天」端要真的冷、真的够亮 ——
    // 它是黄昏档冷阴影的全部来源
    hemiSky: 0x7d95c4, hemiGround: 0x4a3a28, hemiIntensity: 1.40,
    envIntensity: 0.98,
    fog: { density: 0.0125, falloff: 17, max: 0.93,
      sky: [0.86, 0.56, 0.34], ground: [0.40, 0.30, 0.24], sunGain: 0.42,
      desat: 0.40, flatten: 0.10 },
    exposure: 0.62, godStrength: 0.45, bloom: 0.42, saturation: 0.98, contrast: 1.08,
    // 黄昏是臭氧唯一看得见的时候：太阳低到光线穿过 25 km 那层臭氧的路径最长，
    // 地平线上方那条带因此偏青而不是纯橙。ozone 倍率就是这条带的浓淡。
    // **2026-09-08：skyFloor 中性化（同 smokyDay 定稿①、chuchuanDay 那一条配方）。**
    // 全量清扫时 `Probe_StreetDusk` 是 45 张里色偏最大的一张：对大修前基线
    // Δ(B−R) **+28.8**、ΔC **10.88**（第二名只有 4.9）—— 那条黄昏巷子从暖金色
    // 变成了冷蓝灰。巷底几乎吃不到直射，墙的颜色全来自天光，而这一档的
    // skyFloor 是个蓝得厉害的常数（B ≈ 2 × R）加在天顶也加在地平线上。
    // 保亮度去蓝：Luma = 0.2126·0.127 + 0.7152·0.177 + 0.0722·0.249 = 0.1716。
    // 亮度逐比特不变，只把这份常数拉成中性灰；黄昏的橙仍由物理 LUT 与
    // 手调的 sunColor（#ffb072，定稿②明令不动）给。
    atmosphere: { mie: 2.4, mieG: 0.78, rayleigh: 2.0, ozone: 1.4, groundAlbedo: 0.55,
      sunIrradiance: 47.17, skyTint: [1.192, 0.852, 0.804], skyFloor: [0.172, 0.172, 0.172],
      aerialBlend: 0.5, aerialGain: 0.435, artGlow: 0.45 },
  },
  // 3 月 24 日午后：日军攻北门，硝烟遮日
  smokyDay: {
    // 38° 差 3.5° 越不过峡谷线（atan(4.6/5.2)=41.5°），街上一寸阳光都没有。
    // 52° 是三月末台儿庄 13:30 前后的真实仰角（正午上限 57.4°），
    // 檐影长 4.6×tan(38°)=3.6 m < 街宽 5.2 m —— 街上留出 1.6 m 的晒条，
    // 对面那半面墙从墙根到檐口全亮。这一改是本轮画面变化最大的一笔。
    sunElevation: 52, sunAzimuth: 214,
    // horizon 5.40 亮到把天顶到地平线的整段梯度压平（实测 229→250，11 级）。
    // 2.40 让它掉回天顶 1.90—2.35 的同一量级，梯度才读得出来；同时给一个冷偏
    // （B > R），白天的天才有色相可分离，而不是一条橙棕线上的一块白板。
    zenith: [1.90, 2.35, 3.20], horizon: [2.40, 2.46, 2.62], ground: [0.58, 0.52, 0.42],
    sunColor: [1.0, 0.92, 0.78], sunIntensity: 120, sunSize: 0.000012, glow: 1.35, glowSpread: 12,
    smoke: 0.72, smokeColor: [1.35, 1.33, 1.30], smokeHeight: 0.11, stars: 0.0,
    // 天地比：实测天 sRGB 234 / 地 136 只有 3.4:1 的线性亮度比，屋脊和人的轮廓
    // 从天上剥不出来。ER2 那种照片感是 6—8:1。修法必须是**降 lightIntensity**
    // 而不是降 exposure —— 降 exposure 天会跟着一起暗，比例白调。
    // 同时把半球光拉大（1.05 → 1.40）并把两端拉开：朝上的面吃冷天光、
    // 屋檐下与下巴吃暖地反光，「暖主光 + 冷阴影」才成立。
    // 太阳翻过峡谷线之后，lightIntensity 第一次真的作用在墙和地上，
    // 3.1 那一档是「反正照不进来、调它没用」时期留下的数
    lightColor: 0xffe6c4, lightIntensity: 8.6,
    hemiSky: 0x8fb0e0, hemiGround: 0x7a5228, hemiIntensity: 1.55,
    // 真正压住地面亮度的是这一项，不是 lightIntensity。实测：平行光从 4.8 砍到 3.1，
    // 街景地面/墙面均值只从 sRGB 108 动到 107 —— 这几面墙全在背光侧，亮度几乎
    // 都来自 scene.environment 那张天空 IBL。1.20 → 0.95 才把均值压到 90—110、
    // 天仍留在 237，天地线性亮度比从 3.4:1 拉到 6:1 上下。
    // 别再往下砍：试过 0.75，地面掉到 74，暗部糊成一片。
    // 0.95 → 1.45：地平线色从 5.40 压到 2.40 之后，这张天烘出来的 IBL 整体暗了三成，
    // 街景地面均值跟着从 99 掉到 66 —— 天修好了、地塌了，等于把问题挪了个位置。
    // 这一档补回来，均值回到 90—110 的窗口里。
    // 1.45 → 1.05：太阳抬到 52° 之后 IBL 不再是唯一光源了。留在 1.45 的话，
    // 阴影侧被环境光整片提起来，明暗比又白调 —— 等于只是把整张图提亮一档。
    envIntensity: 1.05,
    fog: { density: 0.0145, falloff: 15, max: 0.88,
      sky: [0.72, 0.70, 0.66], ground: [0.38, 0.39, 0.42], sunGain: 0.24,
      desat: 0.50, flatten: 0.15 },
    exposure: 0.46, godStrength: 0.28, bloom: 0.34, saturation: 0.90, contrast: 1.07,
    // 硝烟遮日：Mie 倍率是这一档的主旋钮。它同时做两件事 ——
    // 把天顶的蓝压掉（今天那份 1.90/2.35/3.20 本来就不蓝），
    // 以及把地平线附近整片抬亮（真正的"硝烟天"就是这么白的）。
    // **skyFloor 的蓝偏 2026-09-08 压掉六成（美术定稿）。**
    // 标定出来的 [0.264, 0.442, 0.785] 是全部十档里最大的一份底噪（是第二名的两三倍），
    // 而它是个**常数**：加在天顶也加在地平线。旧版这一档的地平线本来是近中性的
    // （horizon [2.40, 2.46, 2.62]），蓝只在天顶（zenith [1.90, 2.35, 3.20]）——
    // 一面竖直的墙看到的主要是地平线那一圈，于是新版把墙照成了冷蓝。
    // 实测（85 个采样点对基线树，`Wall_EastOuterFace`）：
    // rgb 59.4/60.2/69.9 → 61.6/66.3/85.8，ΔE 6.93，B 抬了 15.9 而 R 只抬了 2.2。
    // 修法是**保亮度的去蓝**：F' = L·[1,1,1]，L = Luma(F) = 0.4289 ——
    // 亮度逐比特不变（所以 IBL 量级、AtmosphereTest 的辐照度闸、整幅明暗都不动），
    // 只把这份常数拉成**中性灰**。天空的蓝从此全部由物理 LUT 自己给，
    // 结构（天顶↔地平线的梯度、太阳侧的前向散射）一点没动。
    // 复测（同六个采样点，色度 ΔC = √(Δa*²+Δb*²)，相对基线树）：
    //   Wall_EastOuterFace 6.37 → 4.91 / West_Communications 5.89 → 4.64 /
    //   Lm_Yamen 4.50 → 3.41 / East_Battalion731 4.07 → 2.75 /
    //   Lm_DivisionHQ127 3.01 → 2.22 / Street_Crossroad 2.90 → 2.02 —— 六点全部回到 ±5 内，
    // 而整幅亮度一步没动（Wall_EastOuterFace 全幅均值 66.76 → 66.6，在噪声里）。
    // 同族的 chuchuanDay [0.144,0.243,0.469] 与 overcast [0.228,0.305,0.457] 是同样的
    // 蓝偏，只是量级只有这一档的三分之一；它们没有采样点覆盖（chuchuanDay 只在出川
    // 过场的车厢里、overcast 正片没用），**没有基线可对照就没改** —— 修法同上，一行。
    // **2026-09-08 俯瞰回归的两笔**（只有俯瞰机位吃得到，地面机位量出来在噪声里）：
    //
    // · `belowVeil` 0.40 —— 天空视图 LUT 的下半张是「干净空气里看一片 albedo 0.2
    //   的地面」，战场霾按设计不进那张表。地面机位下半屏全是几何，看不见；
    //   俯瞰机位（Air_* 那五个，相机 86—430 m）上半屏整片吃到，于是新版是一整块
    //   暗蓝灰而基线是明亮白霾。实测（Air_Crossroad、自动曝光钉死 1.0、天空带
    //   y∈[4,64]）：veil 0 → 150.6，旧解析天 → 190.9，veil 0.40 → **191.5**，
    //   RGB 196.0/190.6/187.4 对旧解析的 195.6/190.2/184.2 —— 亮度与色相同时回位。
    //   0.5/0.6/0.8/1.0 分别是 198/204/212/217，都比基线亮，所以取 0.40。
    //
    // · `aerialTint` —— 大气透视那张 LUT 里，战场霾的标高就是 fog.falloff（15 m），
    //   而美术雾的高度衰减按**着色点**的高度算。两者对地面机位一致，对俯瞰机位
    //   差得远：一条从 430 m 打下来的视线几乎不穿霾（只有贴地那 15 m），散射因此
    //   由瑞利主导 = 蓝；而消光仍按美术雾给（「先别动雾」），于是「美术的雾量 +
    //   物理的蓝色」。实测 Air_WholeCity 全幅 B−R 从基线的 +8.2 涨到 +30.1。
    //   修法与 skyFloor 定稿同一条配方：**保亮度去蓝**（Luma(tint) = 1.000，
    //   所以雾的明暗一步不动，只改色相）。扫值（同机位、AE 钉死）：
    //   [1,1,1] +30.1 / A[1.162,0.969,0.833] +22.5 / **B[1.315,0.939,0.676] +14.2** /
    //   C[1.458,0.911,0.529] +6.5。取 B：它把俯瞰那一张拉回与其余 84 张同一档
    //   （Δ(B−R) +6…+10），而不是把物理散射的色相整个抹平（那就等于把 aerialBlend
    //   退回 0，连「随距离变色 + 太阳侧前向散射」一起丢掉）。
    atmosphere: { mie: 5.4, mieG: 0.76, rayleigh: 2.0, groundAlbedo: 0.2, sunIrradiance: 61.17,
      skyTint: [1.110, 0.915, 0.985], skyFloor: [0.429, 0.429, 0.429],
      aerialBlend: 0.5, aerialGain: 0.129, aerialTint: [1.315, 0.939, 0.676],
      belowVeil: 0.40, artGlow: 0.30 },
  },
  // 出川序章（CS_Chuchuan）专用。**只有这一场引用它**，正片七关一律不用 ——
  // 加这一档而不是改 smokyDay，就是因为 smokyDay 被七关共用，动不得。
  //
  // 这一场的画面难点和外景关卡正相反：主体在一节封闭车厢**里面**，窗洞是唯一的光口。
  // 沿用 smokyDay 时实测是「窗户纯白过曝、车厢内接近纯黑」的两极 —— 天地比不是太小，
  // 是太大。四个数各管一件事：
  //   · horizon/zenith 从 2.40/2.35 压到 1.52/1.45：窗洞不再是一块没有层次的白板，
  //     窗外的土堤、电杆、村舍才有机会落在可读的曝光段里；
  //   · envIntensity 1.05 → 1.70、shProbeIntensity 0.34 → 0.62、ambientIntensity
  //     0.16 → 0.30：车厢内壁吃不到直射，全部亮度来自这三项（点光只补窗口与顶灯），
  //     smokyDay 那三档的值等于把车厢刷黑；
  //   · fog density 0.0145 → 0.0068：60—300 m 的田野与村舍不再被雾一口吃光；
  //   · bloom 0.34 → 0.16：窗框边缘不再糊出一圈白光晕（过曝的观感一半来自它）。
  // 太阳仰角 44°、方位 232°：从车厢右后方（月台那一侧）打进来，右窗一带有光斑、
  // 左侧留在阴影里，车厢内部才有明暗分离而不是一块均匀的灰。
  chuchuanDay: {
    // 仰角 56°（三月末鲁南正午上限 57.4°，仍是史实窗口内）不是为了「亮」，是为了
    // **让列车自己的影子落不到月台上**：车厢顶梁 3.76 m 高、离月台沿 1.6 m，
    // 44° 时影子推到 x≈5.5，把月台边、雨棚柱、下车的人全罩进阴影里（实测 t=47/50
    // 那两根柱子黑得读不出是木头）。56° 时影子只到 x≈4.7，正好停在月台沿以内。
    sunElevation: 56, sunAzimuth: 232,
    // horizon 从 1.52 压到 1.30：窗洞是全场唯一的高光区，1.52 时是一块没有层次的
    // 纯白；1.30 之后掠过的电杆、村舍在天上还剩得住轮廓。压掉的那部分间接光
    // 由 envIntensity 1.70→1.85 补回来，车厢内亮度不变。
    zenith: [0.95, 1.12, 1.48], horizon: [1.30, 1.31, 1.34], ground: [0.52, 0.47, 0.39],
    sunColor: [1.0, 0.94, 0.82], sunIntensity: 64, sunSize: 0.000012, glow: 0.95, glowSpread: 12,
    smoke: 0.34, smokeColor: [1.05, 1.03, 0.99], smokeHeight: 0.10, stars: 0.0,
    lightColor: 0xffe8cc, lightIntensity: 6.6,
    envIntensity: 1.85,
    // 这两项在本场比 envIntensity 还关键：车厢内壁、雨棚下的月台、背光的柱子与站牌
    // 全都吃不到直射，只能靠 Global SH + AmbientLight 托底。smokyDay 的 0.34/0.16
    // 在这一场等于把它们全刷成黑。抬到 0.85/0.46 之后背光面仍比受光面暗一大截，
    // 但读得出材质。
    shProbeIntensity: 0.85,
    ambientIntensity: 0.46,
    // ── 雾：0.0068 那一档等于**没有远景** ────────────────────────────────
    // fd = 1 − exp(−depth·density)，0.0068 时 250 m 就吃满 max=0.80，
    // 于是窗外和门外从两百米起就是一块均匀的灰白板 —— 用户原话
    // 「我要的是真实的远景」。地形侧已经把起伏、农田、村庄一路铺到 2.9 km，
    // 雾不松，这些东西一件也看不见。
    //   density 0.0011：100 m 吃 10%、400 m 36%、1 km 67%，
    //     二百到九百米的村舍与树行读得出，远山仍是一层淡影（真实的空气透视）；
    //   max 0.86（原 0.80）：远山不许被压成纯天空色，也不许糊成一块白饼；
    //   falloff 520（原 22）：高度衰减近似关掉。22 m 的半衰高度意味着
    //     一座 100 m 的山头 hFall≈0.01 —— 山脚在雾里、山顶纤毫毕现，
    //     山会像贴在天上的黑纸片。空气透视在这个尺度上是**按距离**走的。
    // desat 0.40 → 0.26：这一档的雾要保留**色相**。田块之间的差别一半在色相上
    // （返青的绿 vs 翻耕的褐 vs 麦茬的黄），去饱和四成等于把农田重新刷成一片灰。
    fog: { density: 0.0011, falloff: 520, max: 0.86,
      sky: [0.68, 0.67, 0.64], ground: [0.40, 0.40, 0.41], sunGain: 0.18,
      desat: 0.26, flatten: 0.08 },
    exposure: 0.56, godStrength: 0.18, bloom: 0.16, saturation: 0.98, contrast: 1.08,
    // 这一场唯一真正需要大气透视的地方是窗外那片两公里的田野 ——
    // aerialBlend 给到 0.7，让远处村舍的偏蓝是算出来的而不是刷上去的。
    // **2026-09-08：skyFloor 按 smokyDay 定稿①的同一条配方中性化。**
    // 那一轮写着「chuchuanDay 没有采样点覆盖、没有基线可对照就不改」——
    // 这一轮翻 ShotTest 全套时找到了基线：`BaselineFull/Game_CH0_Chuchuan.png`。
    // 标定出来的 [0.144, 0.243, 0.469] 蓝得厉害（B ≈ 3.3 × R），而它是个**常数**，
    // 加在天顶也加在地平线；实测这一张对基线的 Δ(B−R) 是 +10.4、ΔC 3.88，
    // 是 45 张里色偏最大的一档（其余中位 2.65）。修法同样是**保亮度去蓝**：
    // F' = Luma(F)·[1,1,1]，Luma = 0.2126·0.144 + 0.7152·0.243 + 0.0722·0.469 = 0.238。
    // 亮度逐比特不变（车厢内壁那三项 envIntensity / shProbeIntensity /
    // ambientIntensity 一个没动），只把这份常数拉成中性灰。
    atmosphere: { mie: 3.6, rayleigh: 1.5, groundAlbedo: 0.55, sunIrradiance: 78.89,
      skyTint: [1.636, 1.017, 0.601], skyFloor: [0.238, 0.238, 0.238],
      aerialBlend: 0.7, aerialGain: 0.096, artGlow: 0.35 },
  },
  // 阴天：鲁南三四月多西南风、浮尘大，天是一块均匀的亮。
  // 这一档没有硬阴影，形体感全靠 AO 与环境光——最难做，也最能看出管线水平。
  overcast: {
    sunElevation: 42, sunAzimuth: 200,
    zenith: [1.55, 1.68, 1.95], horizon: [2.30, 2.32, 2.34], ground: [0.50, 0.46, 0.40],
    sunColor: [1.0, 0.98, 0.94], sunIntensity: 6, sunSize: 0.000018, glow: 0.6, glowSpread: 4,
    smoke: 0.62, smokeColor: [2.05, 2.02, 1.96], smokeHeight: 0.42, stars: 0.0,
    lightColor: 0xf0f2f5, lightIntensity: 1.6,
    hemiSky: 0xb6bcc4, hemiGround: 0x585048, hemiIntensity: 1.6,
    envIntensity: 1.55,
    fog: { density: 0.0150, falloff: 18, max: 0.95,
      sky: [0.70, 0.71, 0.73], ground: [0.46, 0.44, 0.40], sunGain: 0.10,
      desat: 0.55, flatten: 0.18 },
    exposure: 0.88, godStrength: 0.0, bloom: 0.34, saturation: 0.86, contrast: 1.02,
    // 阴天 = 极高 Mie + 多次散射托底。这是多次散射 LUT 最能证明自己的一档：
    // 只有一阶散射的话，浮尘越厚天越暗；加上 Ψ 之后才是「越厚越均匀地亮」。
    atmosphere: { mie: 18.0, mieG: 0.62, rayleigh: 2.0, groundAlbedo: 0.2, sunIrradiance: 38.9,
      skyTint: [0.947, 0.997, 1.059], skyFloor: [0.228, 0.305, 0.457],
      aerialBlend: 0.4, aerialGain: 0.161, artGlow: 0.25 },
  },
  // 3 月 27 日——4 月 2 日：城内巷战，一半的天被火烧着
  burningStreet: {
    // 巷战打了七天，不必挑在傍晚。21° 是全部预设里离峡谷线最远的一档，
    // 街上零阳光；45° 约合 14:30，檐影 4.6 m 略短于街宽，一条晒地贴着对面墙根。
    // 方位角从 238 收到 226：更贴近 STREETS_NS（南北向主街）的走向，
    // 光顺着街打下来，视线被自然引向街的深处（评分表 D7）。
    sunElevation: 45, sunAzimuth: 226,
    zenith: [0.78, 0.92, 1.35], horizon: [2.05, 1.50, 1.05], ground: [0.50, 0.40, 0.30],
    sunColor: [1.0, 0.70, 0.38], sunIntensity: 88, sunSize: 0.000012, glow: 2.4, glowSpread: 13,
    smoke: 0.88, smokeColor: [1.85, 1.35, 1.00], smokeHeight: 0.13, stars: 0.0,
    lightColor: 0xffbb80, lightIntensity: 7.6,
    hemiSky: 0x7f97cf, hemiGround: 0x63472e, hemiIntensity: 1.55,
    // 同 smokyDay：太阳翻过峡谷线，IBL 要让位，否则阴影侧被提平
    envIntensity: 1.10,
    fog: { density: 0.0160, falloff: 14, max: 0.88,
      sky: [0.74, 0.52, 0.36], ground: [0.42, 0.32, 0.26], sunGain: 0.38,
      desat: 0.45, flatten: 0.13 },
    exposure: 0.54, godStrength: 0.55, bloom: 0.50, saturation: 0.94, contrast: 1.10,
    // 半个天被火烧着 = 极重的烟 + 偏暖的散射。skyTint 这里担的活最重：
    // 物理大气本身不知道"烟是橙的"，那份橙由 tint 与美术烟层一起给。
    atmosphere: { mie: 8.0, mieG: 0.74, rayleigh: 2.0, groundAlbedo: 0.2, sunIrradiance: 28.13,
      skyTint: [1.358, 0.910, 0.809], skyFloor: [0.123, 0.190, 0.318],
      aerialBlend: 0.45, aerialGain: 0.256, artGlow: 0.40 },
  },
  // 4 月 3 日夜：敢死队
  night: {
    sunElevation: 34, sunAzimuth: 96,
    zenith: [0.020, 0.030, 0.062], horizon: [0.075, 0.086, 0.125], ground: [0.026, 0.026, 0.032],
    sunColor: [0.52, 0.62, 0.92], sunIntensity: 2.4, sunSize: 0.000012, glow: 0.22, glowSpread: 7,
    smoke: 0.55, smokeColor: [0.085, 0.095, 0.130], smokeHeight: 0.26, stars: 0.55,
    lightColor: 0x9fb4e8, lightIntensity: 0.42,
    hemiSky: 0x2b3a5c, hemiGround: 0x171310, hemiIntensity: 0.30,
    envIntensity: 1.40,
    fog: { density: 0.0210, falloff: 14, max: 0.96,
      sky: [0.055, 0.065, 0.095], ground: [0.030, 0.032, 0.040], sunGain: 0.04,
      desat: 0.35, flatten: 0.06 },
    exposure: 3.6, godStrength: 0.0, bloom: 0.85, saturation: 0.72, contrast: 1.14,
    // 夜战关的"太阳"其实是月亮（预设里的 sunColor 就是冷蓝的）。
    // 物理上这没问题：月光就是被反射的日光，只是辐照度小五个数量级。
    // skyFloor 是气辉 + 星光的积分 —— 没有它整片天是纯黑，星星浮在黑纸上；
    // 有了它天才有"夜的蓝"，而这一层物理模型本身给不出来。
    atmosphere: { mie: 3.6, rayleigh: 2.0, groundAlbedo: 0.2, sunIrradiance: 1.67,
      skyTint: [0.860, 0.860, 1.352], skyFloor: [0.006, 0.010, 0.018],
      aerialBlend: 0.35, aerialGain: 0.710, artGlow: 0.5, sunDiskT: 0.0 },
  },
  // 4 月 7 日拂晓：总反攻
  dawn: {
    // 六个关卡阶段里有两个用这一档（含「破口」那一关），它的画面权重最高。
    // 4° 太低：屋脊都吃不满光，整关只剩一片褐。11° 约合日出后 45 分钟，
    // 仍是拂晓（反攻本来就打了一整个上午），而檐口以上、山墙、寨墙顶全部亮起来，
    // 街底留在冷影里 —— 上暖下冷的分层是这一档形体的全部来源。
    sunElevation: 11.0, sunAzimuth: 88,
    zenith: [0.50, 0.72, 1.30], horizon: [2.30, 1.55, 1.00], ground: [0.48, 0.40, 0.32],
    sunColor: [1.0, 0.64, 0.36], sunIntensity: 105, sunSize: 0.000012, glow: 3.6, glowSpread: 15,
    smoke: 0.58, smokeColor: [1.80, 1.25, 0.90], smokeHeight: 0.10, stars: 0.04,
    lightColor: 0xffc890, lightIntensity: 8.2,
    hemiSky: 0x7d9ad4, hemiGround: 0x50402f, hemiIntensity: 1.55,
    // 1.75 是「街底全靠 IBL」时代的补偿值；抬了太阳之后它会把冷影冲平
    envIntensity: 1.15,
    fog: { density: 0.0140, falloff: 18, max: 0.93,
      sky: [0.92, 0.60, 0.40], ground: [0.42, 0.33, 0.27], sunGain: 0.45,
      desat: 0.42, flatten: 0.11 },
    exposure: 0.56, godStrength: 0.60, bloom: 0.46, saturation: 0.96, contrast: 1.09,
    // 泛光门槛（缺省 1.18；十档里目前只有这一档写了值）。见 docs 的
    // 「拂晓逆光洗平」一节：物理天穹在这一档把**整圈地平线**抬到 1.7—3.8、
    // 太阳侧抬到 6.5（旧解析天是 1.35—3.6 / 3.65），而 1.18 是按旧天调出来的常数 ——
    // 于是整片下半天空都够到门槛，六级金字塔把它铺成一层盖住全屏的 veiling glare。
    // 2.6 之后只有太阳附近 20° 以内（3.8—6.5）还够得着：太阳的暖辉光原样保留，
    // 离太阳 60° 以外的天不再发光。
    // dusk 量过，**没有同病，没改**：它的偏 60°/90° 物理值反而低于旧解析天，
    // 只有太阳附近抬了 58%，整片下半天空在 1.18 之上是基线时代就有的账。
    bloomThreshold: 2.6,
    // 与 dusk 同一套账（低太阳、长光路、臭氧带），只是方位在东。
    //
    // **skyTint / skyFloor 是 2026-09-08 的美术定稿，不是标定输出**（详见
    // docs 的「拂晓逆光洗平」一节）。标定给的是 skyTint [0.691, 0.880, 1.645] +
    // skyFloor [0.149, 0.202, 0.277]：辐照度对得上（比 1.043），但它把太阳侧
    // 那份橙**主动压掉**了 —— 实测天穹在太阳上方 8° 处，原始 LUT 是
    // [9.32, 5.78, 2.49]（R/B = 3.7，真正的拂晓），乘完这份 tint 变成
    // [6.44, 5.09, 4.10]（R/B = 1.57），屏幕上就是一片粉白霾。
    // 而「dawn 的 #ffc890 是刻意压过的橙、是这一档形体分层的全部来源」是
    // 已经立过的口径（见 §17.5 定稿②），天穹不能反过来把它洗掉。
    //
    // 修法与 smokyDay 的 skyFloor 定稿同源：**保亮度地改色**。
    // skyTint 取标定值与「美术定的地平线色相 [2.30, 1.55, 1.00]」的中点，
    // 再归一到同一个 Luma(0.895) —— 亮度逐通道加权和不变，所以辐照度闸（±15%）
    // 与三向亮度比闸（±40%）都不受影响，动的只有色相。实测天穹在太阳上方 8°
    // 从 [6.44, 5.09, 4.10] 回到 [10.56, 6.11, 3.51]（R/B 1.57 → 3.01，
    // 美术那张天是 2.21），而 AtmosphereTest 的上半球均色 ΔE 从 30 降到 17：
    // 这一改**让新天更靠近美术那张天**，不是把它推远。
    //
    // **skyFloor 保持标定值。** 按 smokyDay 那条一并中性化试过：CH5 的读数几乎
    // 不动（±1），巷子里的砖墙饱和度也不动（0.127 vs 0.125）—— 也就是说这一档的
    // 蓝底噪根本不是主项，改它只是多改一处。它在天顶那一头仍是街底唯一的冷天光。
    atmosphere: { mie: 2.4, mieG: 0.78, rayleigh: 2.0, ozone: 1.4, groundAlbedo: 0.55,
      sunIrradiance: 58.68, skyTint: [0.962, 0.856, 1.091], skyFloor: [0.149, 0.202, 0.277],
      aerialBlend: 0.5, aerialGain: 0.437, artGlow: 0.45 },
  },
};

// ---------------------------------------------------------------------------
// 天空取证探针（回归测试与标定脚本共用）
//
// 把 `SkyRadiance()` 按经纬展开渲到一张小靶上再读回来。**必须是这个函数本尊**，
// 不能在 JS 里重算一遍：新旧两条天空是同一个着色器里的 uniform 分支，
// 各写一份 JS 近似的话，标定出来的是那份近似，不是屏幕上的天。
// ---------------------------------------------------------------------------

const SKY_PROBE_FRAG = SKY_RADIANCE_GLSL + /* glsl */`
uniform float uProbeSunDisk;
varying vec2 vUv;
void main() {
  // 经度沿 x、纬度沿 y。方位口径与 SunDirectionFrom 完全一致
  // （0 = +Z，90 = +X；本作 Z 向南、X 向东），所以采样端可以直接按度取格。
  float lon = (vUv.x * 2.0 - 1.0) * 3.14159265359;
  float lat = (vUv.y - 0.5) * 3.14159265359;
  vec3 dir = vec3(cos(lat) * sin(lon), sin(lat), cos(lat) * cos(lon));
  gl_FragColor = vec4(SkyRadiance(normalize(dir), uProbeSunDisk), 1.0);
}
`;

/** 半浮点纹素 → float（readRenderTargetPixels 对 HalfFloatType 给的是 Uint16）。 */
export function HalfToFloat(bits) {
  const sign = (bits >> 15) & 1 ? -1 : 1;
  const exponent = (bits >> 10) & 0x1f;
  const mantissa = bits & 0x3ff;
  if (exponent === 0) return sign * Math.pow(2, -14) * (mantissa / 1024);
  if (exponent === 31) return mantissa ? NaN : sign * Infinity;
  return sign * Math.pow(2, exponent - 15) * (1 + mantissa / 1024);
}

/**
 * 建一台天空探针。`skyUniforms` 传 `sky.uniforms`（同一批对象，所以换预设、
 * 切 `uAtmoEnabled` 之后不用重建）。
 * @returns {{Render:Function, Sample:Function, Dispose:Function, width:number, height:number}}
 */
export function MakeSkyProbe(renderer, skyUniforms, { width = 64, height = 32 } = {}) {
  const uniforms = { ...skyUniforms, uProbeSunDisk: { value: 0 } };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: `varying vec2 vUv;\nvoid main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: SKY_PROBE_FRAG,
    depthTest: false, depthWrite: false,
  });
  const geometry = new THREE.PlaneGeometry(2, 2);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(mesh);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const target = new THREE.WebGLRenderTarget(width, height, {
    type: THREE.HalfFloatType, format: THREE.RGBAFormat,
    minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
    depthBuffer: false, stencilBuffer: false, generateMipmaps: false,
  });
  target.texture.colorSpace = THREE.NoColorSpace;
  const raw = new Uint16Array(width * height * 4);
  const rgb = new Float32Array(width * height * 3);

  return {
    width, height, target,
    /** 渲一趟并读回。`sunDisk` 传 1 才含太阳盘（比亮度时一律传 0）。 */
    Render(sunDisk = 0) {
      uniforms.uProbeSunDisk.value = sunDisk;
      const prev = renderer.getRenderTarget();
      renderer.setRenderTarget(target);
      renderer.render(scene, camera);
      renderer.setRenderTarget(prev);
      renderer.readRenderTargetPixels(target, 0, 0, width, height, raw);
      for (let i = 0; i < width * height; i += 1) {
        rgb[i * 3] = HalfToFloat(raw[i * 4]);
        rgb[i * 3 + 1] = HalfToFloat(raw[i * 4 + 1]);
        rgb[i * 3 + 2] = HalfToFloat(raw[i * 4 + 2]);
      }
      return rgb;
    },
    /**
     * 按仰角/方位取一格（度）。方位 0 = −Z（北），90 = +X（东），
     * 与 `SunDirectionFrom` 同一套口径。
     */
    Sample(elevationDeg, azimuthDeg) {
      const wrapped = ((azimuthDeg % 360) + 360) % 360;
      const signed = wrapped > 180 ? wrapped - 360 : wrapped;
      const u = signed / 360 + 0.5;
      const v = THREE.MathUtils.clamp(elevationDeg, -89.9, 89.9) / 180 + 0.5;
      const x = Math.min(width - 1, Math.max(0, Math.round(u * width - 0.5)));
      const y = Math.min(height - 1, Math.max(0, Math.round(v * height - 0.5)));
      const i = (y * width + x) * 3;
      return [rgb[i], rgb[i + 1], rgb[i + 2]];
    },
    Dispose() {
      material.dispose();
      geometry.dispose();
      target.dispose();
    },
  };
}

function Vec3(a) { return new THREE.Vector3(a[0], a[1], a[2]); }

export function SunDirectionFrom(elevationDeg, azimuthDeg) {
  const phi = THREE.MathUtils.degToRad(90 - elevationDeg);
  const theta = THREE.MathUtils.degToRad(azimuthDeg);
  return new THREE.Vector3().setFromSphericalCoords(1, phi, theta);
}

/** URL 开关。`?skyLegacy=1` 走旧解析天空；`?aerial=full` 让物理大气接管消光。 */
function UrlFlag(name) {
  if (typeof location === "undefined") return null;
  try {
    return new URLSearchParams(location.search).get(name);
  } catch {
    return null;
  }
}

export class SkyDome {
  constructor(renderer, { radius = 4000, quality = null } = {}) {
    this.renderer = renderer;
    const qualityName = quality || UrlFlag("quality") || "high";
    this.atmosphere = new Atmosphere(renderer, { quality: qualityName });
    // 一页只有一台天空。合成 pass 的大气透视 pass 通过这个登记点找到它
    // （与 Script_Water 的 SetWaterSkyUniforms 同一个先例：借同一批 uniform 对象）。
    SetActiveAtmosphere(this.atmosphere);
    this.legacy = UrlFlag("skyLegacy") === "1";
    this.atmosphereEnabled = !this.legacy;
    this.atmosphere.sampleUniforms.uAtmoEnabled.value = this.atmosphereEnabled ? 1 : 0;
    if (UrlFlag("aerial") === "full") this.forceAerialMode = 1;

    this.uniforms = {
      uSunDirection: { value: new THREE.Vector3(0, 0.4, -1).normalize() },
      uZenith: { value: new THREE.Vector3(0.2, 0.3, 0.5) },
      uHorizon: { value: new THREE.Vector3(0.7, 0.6, 0.5) },
      uGround: { value: new THREE.Vector3(0.12, 0.1, 0.08) },
      uSunColor: { value: new THREE.Vector3(1, 0.9, 0.75) },
      uSunIntensity: { value: 50 },
      uSunSize: { value: 0.003 },
      uGlowStrength: { value: 0.5 },
      uGlowSpread: { value: 16 },
      uSmoke: { value: 0.6 },
      uSmokeColor: { value: new THREE.Vector3(0.45, 0.4, 0.36) },
      uSmokeHeight: { value: 0.25 },
      uStars: { value: 0 },
      uTime: { value: 0 },
      uArtGlow: { value: 0.35 },
      uSunDiskT: { value: 1 },
      uAtmoBelowVeil: { value: 0 },
      // 大气 LUT 的采样端。**同一批对象**并进来：Script_Gi 的 BuildPasses
      // 把 sky.uniforms 整表拷进 trace 材质，于是探针的漏空射线自动问同一片天。
      ...this.atmosphere.sampleUniforms,
    };
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: true,
      fog: false,
      toneMapped: false,
    });
    // r165+ 起 scene.overrideMaterial 只放过 allowOverride === false 的材质。
    // 天空穹的顶点着色器把 z 顶到远平面，被覆盖材质换掉之后它会以真实的
    // 4000 米深度参与深度法线预通道 —— SSAO 与体积光的天空判据当场作废。
    // 所有"不该进预通道"的东西（天空、粒子、贴片、烟）都要关掉这个开关。
    this.material.allowOverride = false;
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 32), this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1000;
    this.mesh.name = "SkyDome";
    // 天空穹不参与 AO/法线预通道 —— 它没有法线可言，混进去只会把远景 AO 弄脏。
    // 光靠上面那行 allowOverride = false 不够：那只保证"不被换材质"，天空穹
    // 照样会用自己这套着色器画进预通道，把天空色写进 xyz、把不透明度 1.0 写进 w。
    // 下游全按 w = 线性视深度读，于是整片天空被当成"一米外有实体"——
    // 天空前的烟被软粒子整片抹掉、大气透视补不上，远处就多了个越长越大的黑洞。
    // 真正生效的是这一行：PostPipeline 的预通道会把标了它的对象整个藏掉。
    this.mesh.userData.skipNormalDepth = true;

    this.pmrem = renderer ? new THREE.PMREMGenerator(renderer) : null;
    if (this.pmrem) this.pmrem.compileEquirectangularShader();
    this.envTarget = null;
    this.presetName = null;
    this.preset = null;
    /** 物理推荐的平行光（PhysicalSunLight 的输出），面板与标定脚本读它。 */
    this.physicalSun = null;
    this.sunDirection = new THREE.Vector3(0, 1, 0);
    /** 画质面板的烟霾倍率（乘在预设的 Mie 上）。 */
    this.hazeScale = 1;
  }

  /**
   * 直接套用一个预设（不插值）。
   *
   * 返回值是**给 LightRig 用的那一份**：`atmosphere.physicalSun` 打开时返回的是
   * 一个派生副本（lightColor / lightIntensity 由透过率 LUT 推导），
   * 默认关的时候返回的就是 `SKY_PRESETS[name]` 本尊（对象同一性不变 ——
   * Script_TestSceneLightingTest 的别名共享断言靠它）。
   */
  Apply(nameOrPreset) {
    const preset = typeof nameOrPreset === "string" ? SKY_PRESETS[nameOrPreset] : nameOrPreset;
    if (!preset) throw new Error(`未知天空预设：${nameOrPreset}`);
    this.presetName = typeof nameOrPreset === "string" ? nameOrPreset : "custom";
    this.preset = preset;
    const U = this.uniforms;
    this.sunDirection = SunDirectionFrom(preset.sunElevation, preset.sunAzimuth);
    U.uSunDirection.value.copy(this.sunDirection);
    U.uZenith.value.copy(Vec3(preset.zenith));
    U.uHorizon.value.copy(Vec3(preset.horizon));
    U.uGround.value.copy(Vec3(preset.ground));
    U.uSunColor.value.copy(Vec3(preset.sunColor));
    U.uSunIntensity.value = preset.sunIntensity;
    U.uSunSize.value = preset.sunSize;
    U.uGlowStrength.value = preset.glow;
    U.uGlowSpread.value = preset.glowSpread;
    U.uSmoke.value = preset.smoke;
    U.uSmokeColor.value.copy(Vec3(preset.smokeColor));
    U.uSmokeHeight.value = preset.smokeHeight;
    U.uStars.value = preset.stars;

    const atmo = MakeAtmospherePreset(preset.atmosphere);
    U.uArtGlow.value = atmo.artGlow ?? 0.35;
    U.uSunDiskT.value = atmo.sunDiskT ?? 1;
    U.uAtmoBelowVeil.value = atmo.belowVeil ?? 0;
    // 画质面板的烟霾倍率乘在预设的 Mie 上；霾同时决定大气透视 LUT 里那一层。
    const tuned = { ...atmo, mie: atmo.mie * this.hazeScale };
    if (this.forceAerialMode != null) tuned.aerialMode = this.forceAerialMode;
    // **同步**算三张 LUT：紧接着的 BakeEnvironment 要拿本预设的天去烘 PMREM，
    // 慢一帧的话进关第一次的 IBL 是上一档的天（换时段时肉眼可见地闪一下）。
    this.atmosphere.ApplyPreset(tuned, { sunDirection: this.sunDirection, fog: preset.fog });

    this.physicalSun = PhysicalSunLight(
      { ...ATMOSPHERE_EARTH }, preset.sunElevation, preset.lightIntensity);
    if (atmo.physicalSun && this.atmosphereEnabled) {
      // 派生副本：只换平行光那两项，别的原样带过去（exposure / fog / bloom
      // 都是美术意图，不许被物理推导覆盖）。
      return { ...preset, lightColor: this.physicalSun.colorHex, lightIntensity: this.physicalSun.intensity };
    }
    return preset;
  }

  /** 物理大气总闸（画质面板 / `?skyLegacy=1`）。切换后调用方要重烘 IBL。 */
  SetAtmosphereEnabled(on) {
    const want = !!on && !this.legacy;
    if (want === this.atmosphereEnabled) return false;
    this.atmosphereEnabled = want;
    this.atmosphere.sampleUniforms.uAtmoEnabled.value = want ? 1 : 0;
    return true;
  }

  /**
   * 画质面板的「烟霾」倍率。改了要重套预设（LUT 要重算）。
   *
   * 注意它**不重装平行光** —— 调用方（`ApplyGraphics`）只补一次 `BakeEnvironment`。
   * 今天没事：`physicalSun` 出厂全档关着，平行光是预设里手调的常数，与霾无关。
   * 哪天把某一档的 `physicalSun` 翻开，这里要连着调一次 `lights.ApplyPreset(返回值)`
   * —— 霾变浓，太阳方向的透过率就变了。
   */
  SetHazeScale(scale) {
    const value = THREE.MathUtils.clamp(scale ?? 1, 0.1, 6);
    if (Math.abs(value - this.hazeScale) < 1e-4) return false;
    this.hazeScale = value;
    if (this.preset) this.Apply(this.presetName === "custom" ? this.preset : this.presetName);
    return true;
  }

  /**
   * 把当前天空烘成环境贴图挂到场景上。
   * 贵（约 10—20ms），只在换关/换时段时调，**不许每帧调**。
   */
  BakeEnvironment(scene) {
    if (!this.pmrem) return null;
    const skyScene = new THREE.Scene();
    const dome = new THREE.Mesh(this.mesh.geometry, this.material);
    dome.frustumCulled = false;
    skyScene.add(dome);
    if (this.envTarget) this.envTarget.dispose();
    this.envTarget = this.pmrem.fromScene(skyScene, 0.04);
    skyScene.remove(dome);
    if (scene) {
      scene.environment = this.envTarget.texture;
      scene.environmentIntensity = this.preset?.envIntensity ?? 1;
    }
    return this.envTarget.texture;
  }

  Update(elapsedSeconds) {
    this.uniforms.uTime.value = elapsedSeconds;
  }

  Dispose() {
    this.material.dispose();
    this.mesh.geometry.dispose();
    if (this.envTarget) this.envTarget.dispose();
    if (this.pmrem) this.pmrem.dispose();
    this.atmosphere.Dispose();
    SetActiveAtmosphere(null);
  }
}
