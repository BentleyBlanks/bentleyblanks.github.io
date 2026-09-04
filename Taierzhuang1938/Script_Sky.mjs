// 《血战台儿庄》程序化天空。
//
// 默认间接光由 Global SH Probe + 环境贴图共同提供：SH 托住漫反射的方向感，
// PMREM 则给人物军装、钢盔和刀枪保留必要的反射。缺掉环境贴图时，背光的人物和
// 金属会直接压成黑色；实时 GI 打开后再补上位置相关的反弹光。
//
// 天空本身是解析式的（不是 Preetham 原版，是一套可控的美术化模型）：
// 天顶色 -> 地平线色的梯度 + 太阳盘 + 前向散射辉光 + 高空烟层 + 战场烟尘带。
// 台儿庄打了半个月，天上是有烟的 —— 一片干净的蓝天反而失真。

import * as THREE from "three";

const SKY_VERT = /* glsl */`
varying vec3 vWorldDirection;
void main() {
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vWorldDirection = normalize(worldPosition.xyz - cameraPosition);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position.z = gl_Position.w;   // 永远贴在远平面
}
`;

// 天空的解析式本体。抽成独立的一段 GLSL 是因为**探针体的漏空射线也要问同一片天**
// （见 Script_Gi.mjs）：两处各抄一份的下场是改了天空预设、GI 还照着旧的天在积分，
// 阴影侧的补光和天穹对不上色。uniform 声明一起抽出来，两边共用同一批 uniform 对象。
//
// sunDiskGain：天穹本体传 1.0；探针积分传 0.0 —— 太阳的直接光在材质里是
// DirectionalLight 那一路算的，射线再撞上太阳盘就是双份，而且 0.003 大小的
// 盘用 64 根射线去采必然爆方差（有的探针撞上、有的没撞上，闪成一片噪点）。
export const SKY_RADIANCE_GLSL = /* glsl */`
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
  float sunDot = dot(dir, normalize(uSunDirection));

  // --- 天顶到地平线的梯度：pow 决定"天有多高" ---
  float t = pow(clamp(1.0 - max(up, 0.0), 0.0, 1.0), 2.6);
  vec3 sky = mix(uZenith, uHorizon, t);

  // --- 前向散射：靠近太阳的一大片天要亮起来，这是"有大气"的关键 ---
  float glow = pow(max(sunDot * 0.5 + 0.5, 0.0), uGlowSpread);
  sky += uSunColor * glow * uGlowStrength;

  // --- 太阳盘：给足 HDR 值，泛光与 IBL 都靠它 ---
  float disk = smoothstep(1.0 - uSunSize, 1.0 - uSunSize * 0.35, sunDot);
  sky += uSunColor * disk * uSunIntensity * sunDiskGain;

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
  float haze = exp(-max(up, 0.0) / max(uSmokeHeight, 0.01));
  sky = mix(sky, uSmokeColor * (0.85 + glow * 0.6), haze * clamp(uSmoke * 0.55 + 0.04, 0.0, 0.62));

  // --- 地平线以下：地面反照（IBL 的下半球靠它，不然人物下巴死黑）---
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
 */
export const SKY_PRESETS = {
  // Firearm/sight inspection uses clear air across the whole measured range.
  // The overcast combat preset would erase a 200 m target beneath 95% fog.
  // Neutral daylight keeps steel, wood, uniforms and painted lanes distinct.
  weaponRangeDay: {
    sunElevation: 52, sunAzimuth: 222,
    zenith: [0.38, 0.52, 0.72], horizon: [0.68, 0.76, 0.86], ground: [0.30, 0.32, 0.34],
    sunColor: [1.0, 0.98, 0.95], sunIntensity: 40, sunSize: 0.000012, glow: 0.18, glowSpread: 10,
    smoke: 0, smokeColor: [0.67, 0.70, 0.75], smokeHeight: 0.10, stars: 0,
    lightColor: 0xfffaf0, lightIntensity: 3.8,
    hemiSky: 0x9bb6d1, hemiGround: 0x747b80, hemiIntensity: 0.55,
    envIntensity: 0.70, shProbeIntensity: 0.25, ambientIntensity: 0.10,
    fog: { density: 0, falloff: 30, max: 0,
      sky: [0.50, 0.56, 0.65], ground: [0.42, 0.44, 0.47], sunGain: 0,
      desat: 0, flatten: 0 },
    exposure: 0.52, godStrength: 0, bloom: 0, saturation: 1, contrast: 1.06,
  },
  // P012 是颜色语义审读场：照亮背光人物与可通行体块，不借正片的烟尘掩盖空间。
  // 独立预设，不改变旧白盒与正式章节。低对比保留蓝/紫/黑等类别的可辨性。
  p012WhiteboxDay: {
    sunElevation: 52, sunAzimuth: 222,
    zenith: [0.42, 0.58, 0.78], horizon: [0.78, 0.85, 0.96], ground: [0.34, 0.35, 0.36],
    sunColor: [1.0, 0.98, 0.95], sunIntensity: 42, sunSize: 0.000012, glow: 0.3, glowSpread: 10,
    smoke: 0.05, smokeColor: [0.67, 0.70, 0.75], smokeHeight: 0.10, stars: 0,
    lightColor: 0xfffaf0, lightIntensity: 4.2,
    envIntensity: 0.85, shProbeIntensity: 0.35, ambientIntensity: 0.14,
    fog: { density: 0.0015, falloff: 30, max: 0.35,
      sky: [0.50, 0.56, 0.65], ground: [0.42, 0.44, 0.47], sunGain: 0.05,
      desat: 0.03, flatten: 0.02 },
    exposure: 0.65, godStrength: 0, bloom: 0.03, saturation: 1, contrast: 1,
  },
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
  },
};

function Vec3(a) { return new THREE.Vector3(a[0], a[1], a[2]); }

export function SunDirectionFrom(elevationDeg, azimuthDeg) {
  const phi = THREE.MathUtils.degToRad(90 - elevationDeg);
  const theta = THREE.MathUtils.degToRad(azimuthDeg);
  return new THREE.Vector3().setFromSphericalCoords(1, phi, theta);
}

export class SkyDome {
  constructor(renderer, { radius = 4000 } = {}) {
    this.renderer = renderer;
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
    this.sunDirection = new THREE.Vector3(0, 1, 0);
  }

  /** 直接套用一个预设（不插值）。 */
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
    return preset;
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
  }
}
