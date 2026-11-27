// 《台儿庄：血战滕县》3A 物理水面调参表（纯数据，零 three 依赖、零函数 —— Script_DataJsonTest 契约）。
//
// 分档契约（用户 2026-11-27）：
//   · 编辑器默认一律锁定最低水面画质档（WATER_EDITOR_DEFAULT_QUALITY = "low"），省去折射拷贝、
//     水下焦散、SSR 追踪、CSM 投影与高阶泡沫，保证白盒编辑、遭遇编排与场景编辑视口流畅；
//   · 仅在试玩 / 正式游玩（SetWaterMode("play")）时启用对应画质档（默认 high / 可选 medium / ultra），
//     画质设置面板与 ?waterQuality= 可实时热切换，无需重建网格。
//
// 采样器预算（ANGLE-D3D11 上限 16）：
//   · low    : 2 采样器（法线坡度图 + 场景深度）
//   · medium : 11 采样器（法线 + 光学细节 + 4 级 Hi-Z SSR + 深度/速度/颜色 + 折射拷贝 + 天空 LUT）
//   · high   : 15 采样器（medium 全部 + 4 级 CSM 太阳阴影）
//   · ultra  : 15 采样器（全分辨率折射 + 色散 + 6 组 Gerstner + 64 步 Hi-Z SSR + 8 抽样软阴影 + 24 交互波纹）

export const WATER_QUALITY_KEYS = ["low", "medium", "high", "ultra"];
export const WATER_EDITOR_DEFAULT_QUALITY = "low";

export const WATER_QUALITY_TIERS = {
  low: {
    label: "低（编辑器默认）",
    gerstnerCount: 1,
    rippleOctaves: 2,
    microCapillary: false,
    windGusts: false,
    refraction: false,
    refractionScale: 0,
    chromaticDispersion: false,
    caustics: false,
    causticsLayers: 0,
    ssr: false,
    ssrSteps: 0,
    ssrRefine: 0,
    ssrHizSlots: 0,
    screenSky: false,
    physicalSky: false,
    shadows: false,
    shadowMode: "none",
    subsurface: false,
    foamLayers: 1,
    wetBank: true,
    aerialFog: true,
    maxRipples: 0,
  },
  medium: {
    label: "中",
    gerstnerCount: 3,
    rippleOctaves: 3,
    microCapillary: false,
    windGusts: true,
    refraction: true,
    refractionScale: 0.5,
    chromaticDispersion: false,
    caustics: true,
    causticsLayers: 1,
    ssr: true,
    ssrSteps: 28,
    ssrRefine: 3,
    ssrHizSlots: 4,
    screenSky: true,
    physicalSky: true,
    shadows: false,
    shadowMode: "none",
    subsurface: true,
    foamLayers: 2,
    wetBank: true,
    aerialFog: true,
    maxRipples: 8,
  },
  high: {
    label: "高（正式 3A）",
    gerstnerCount: 5,
    rippleOctaves: 4,
    microCapillary: true,
    windGusts: true,
    refraction: true,
    refractionScale: 0.5,
    chromaticDispersion: true,
    caustics: true,
    causticsLayers: 2,
    ssr: true,
    ssrSteps: 48,
    ssrRefine: 3,
    ssrHizSlots: 4,
    screenSky: true,
    physicalSky: true,
    shadows: true,
    shadowMode: "pcf",
    subsurface: true,
    foamLayers: 3,
    wetBank: true,
    aerialFog: true,
    maxRipples: 16,
  },
  ultra: {
    label: "极致（3A 满配）",
    gerstnerCount: 6,
    rippleOctaves: 4,
    microCapillary: true,
    windGusts: true,
    refraction: true,
    refractionScale: 1.0,
    chromaticDispersion: true,
    caustics: true,
    causticsLayers: 2,
    ssr: true,
    ssrSteps: 64,
    ssrRefine: 4,
    ssrHizSlots: 4,
    screenSky: true,
    physicalSky: true,
    shadows: true,
    shadowMode: "pcf",
    subsurface: true,
    foamLayers: 3,
    wetBank: true,
    aerialFog: true,
    maxRipples: 24,
  },
};

export const WATER_TEXTURES = {
  rippleSize: 512,
  detailSize: 512,
  anisotropy: 8,
  rippleSeed: 19380314,
  detailSeed: 19380317,
};

export const WATER_RIPPLES = {
  maxCount: 24,
  wadeStepDistanceM: 0.55,
  wadeMinIntervalS: 0.24,
  wadeStrength: 0.42,
  wadeRadiusM: 3.4,
  wadeSpeed: 2.35,
  wadeFreq: 9.5,
  wadeFoam: 0.22,
  blastStrength: 1.35,
  blastRadiusM: 12.0,
  blastSpeed: 5.2,
  blastFreq: 4.8,
  blastFoam: 0.92,
  bulletStrength: 0.55,
  bulletRadiusM: 2.2,
  bulletSpeed: 3.4,
  bulletFreq: 13.0,
  bulletFoam: 0.35,
};

// 物理光学水体预设：
//   shallowColor / deepColor / scatterColor : 线性化前 sRGB 十六进制颜色（运行期转 THREE.Color 线性空间）
//   extinctionRgb  : Beer-Lambert RGB 分光吸收系数 (1/m)，红光最快衰减、蓝绿较慢，浑水则全谱更陡
//   clarityDepth   : 河床可见的特征透明深度 (m)
//   turbidity      : 悬沙散射占比（0 = 清水，1 = 浑浊泥沙河）
//   roughness      : 基础微表面粗糙度（配合 Toksvig 法线方差抗锯齿进入 GGX）
//   specScale      : 太阳直接镜面高光增益
//   refractionStrength : 斯涅尔折射像素偏移强度（按水深自动渐入）
//   dispersionStrength : RGB 色散偏移强度（仅 high/ultra）
//   causticsStrength   : 浅水河床动态焦散亮度
//   causticsScale      : 焦散世界空间平铺频率 (1/m)
//   subsurfaceStrength : 逆光波峰次表面透光散射强度
//   foamWidth      : 岸线与桥墩接触泡沫带特征竖向水深 (m)
//   foamStrength   : 泡沫总不透明度倍率
//   foamSwash      : 岸线轻拍波纹推进强度
//   crestFoam      : 风浪波峰白沫强度
//   wetBankDepth   : 水边浸湿变暗过渡深度 (m)
//   wetBankDarken  : 湿润河床/岸泥反照率压暗比例（物理：水膜填满砂粒空隙）
//   edgeFadeDepth  : 水边毛细弯月面软化深度 (m)，彻底消除多边形硬切线
//   flow           : 默认世界空间流速向量 [fx, fz] (m/s)
//   rippleScale    : 主波纹世界空间基准频率 (1/m)
//   rippleSpeed    : 波纹平流速度
//   rippleStrength : 法线扰动总强度
//   microScale     : 高频毛细微涟漪频率 (1/m)
//   microStrength  : 高频毛细微涟漪法线强度
//   windGustStrength : 风斑镜面/起皱空间调制幅度（3A 水面真实感核心）
//   ssrStrength    : 屏幕空间倒影倍率
//   skyReflectScale: 天空环境倒影倍率
//   waves          : 最多 6 组定向 Gerstner 波 [dx, dz, wavelengthM, amplitudeM, steepness, speedMul]
export const WATER_PRESETS = {
  // 北沙河 / 三月枯水浑沙河：岸边 5–25 cm 浅滩清晰折射出湿砂卵石与跳动焦散，
  // 往深槽自然过渡为暖褐橄榄浑水；逆光波脊透暖金浑光；风斑将宽河面切出镜面与细涟漪层次。
  muddyRiver: {
    shallowColor: 0x766440,
    deepColor: 0x181812,
    scatterColor: 0x8f7640,
    extinctionRgb: [1.22, 1.78, 2.95],
    clarityDepth: 1.55,
    turbidity: 0.56,
    roughness: 0.044,
    specScale: 1.55,
    refractionStrength: 0.052,
    dispersionStrength: 0.009,
    causticsStrength: 1.28,
    causticsScale: 0.58,
    subsurfaceStrength: 0.78,
    foamWidth: 0.26,
    foamStrength: 0.68,
    foamSwash: 0.68,
    crestFoam: 0.16,
    wetBankDepth: 0.30,
    wetBankDarken: 0.46,
    edgeFadeDepth: 0.075,
    flow: [-0.85, 0.16],
    rippleScale: 0.21,
    rippleSpeed: 0.17,
    rippleStrength: 0.40,
    microScale: 1.85,
    microStrength: 0.17,
    windGustStrength: 0.54,
    ssrStrength: 0.96,
    skyReflectScale: 0.96,
    waves: [
      [-0.95, 0.28, 7.6, 0.024, 0.19, 0.88],
      [-0.78, -0.62, 4.9, 0.017, 0.17, 0.95],
      [-0.45, 0.89, 3.1, 0.011, 0.15, 1.04],
      [0.34, 0.94, 2.05, 0.007, 0.14, 1.12],
      [-0.88, -0.46, 1.32, 0.0045, 0.12, 1.18],
      [0.62, -0.78, 0.88, 0.0028, 0.10, 1.24],
    ],
  },
  // 村中水塘 / 土坑静水：近乎静止的胶泥塘水，清晰倒映村屋土墙、柳树与暮云，
  // 微风轻拂起极细同心/斜向涟漪，岸缘浅水柔和浸湿泥岸并带零星水沫。
  pond: {
    shallowColor: 0x625a3c,
    deepColor: 0x101611,
    scatterColor: 0x647042,
    extinctionRgb: [1.55, 1.82, 3.15],
    clarityDepth: 1.20,
    turbidity: 0.48,
    roughness: 0.026,
    specScale: 1.42,
    refractionStrength: 0.036,
    dispersionStrength: 0.006,
    causticsStrength: 0.88,
    causticsScale: 0.74,
    subsurfaceStrength: 0.48,
    foamWidth: 0.18,
    foamStrength: 0.44,
    foamSwash: 0.32,
    crestFoam: 0.0,
    wetBankDepth: 0.28,
    wetBankDarken: 0.48,
    edgeFadeDepth: 0.068,
    flow: [-0.04, 0.02],
    rippleScale: 0.30,
    rippleSpeed: 0.06,
    rippleStrength: 0.20,
    microScale: 2.45,
    microStrength: 0.09,
    windGustStrength: 0.68,
    ssrStrength: 1.0,
    skyReflectScale: 1.0,
    waves: [
      [0.86, 0.50, 4.6, 0.006, 0.07, 0.48],
      [-0.55, 0.83, 2.8, 0.004, 0.06, 0.56],
      [0.32, -0.94, 1.75, 0.0025, 0.05, 0.65],
      [-0.91, -0.41, 1.15, 0.0018, 0.05, 0.72],
      [0.68, -0.73, 0.78, 0.0012, 0.04, 0.80],
      [-0.24, 0.97, 0.52, 0.0008, 0.04, 0.86],
    ],
  },
  // 滕县护城河：沉郁深青褐静缓河水，高保真倒映青砖城墙、城楼与拱桥，
  // 桥洞阴影清晰压在水面之上，石岸接触处带细密破散水线沫。
  moat: {
    shallowColor: 0x3f5349,
    deepColor: 0x0a1418,
    scatterColor: 0x2f5a50,
    extinctionRgb: [1.45, 1.16, 1.85],
    clarityDepth: 1.95,
    turbidity: 0.34,
    roughness: 0.034,
    specScale: 1.48,
    refractionStrength: 0.042,
    dispersionStrength: 0.0075,
    causticsStrength: 1.05,
    causticsScale: 0.62,
    subsurfaceStrength: 0.55,
    foamWidth: 0.24,
    foamStrength: 0.52,
    foamSwash: 0.44,
    crestFoam: 0.06,
    wetBankDepth: 0.26,
    wetBankDarken: 0.44,
    edgeFadeDepth: 0.062,
    flow: [0.18, 0.05],
    rippleScale: 0.22,
    rippleSpeed: 0.09,
    rippleStrength: 0.30,
    microScale: 1.95,
    microStrength: 0.13,
    windGustStrength: 0.58,
    ssrStrength: 1.0,
    skyReflectScale: 1.0,
    waves: [
      [0.92, 0.38, 6.4, 0.014, 0.14, 0.62],
      [-0.45, 0.89, 3.8, 0.010, 0.12, 0.72],
      [0.72, -0.69, 2.3, 0.006, 0.11, 0.82],
      [-0.84, -0.54, 1.45, 0.004, 0.10, 0.90],
      [0.36, 0.93, 0.96, 0.0025, 0.08, 0.98],
      [-0.66, 0.75, 0.66, 0.0016, 0.08, 1.04],
    ],
  },
  // 荆河：较开阔流动河面，风浪与浪脊透光更明显，日光下碎金波光活跃，
  // 岸边浅水清澈可见砾石与焦散，波峰带克制的风浪白沫。
  river: {
    shallowColor: 0x3b5856,
    deepColor: 0x0b1a20,
    scatterColor: 0x26655c,
    extinctionRgb: [1.35, 0.96, 1.45],
    clarityDepth: 2.35,
    turbidity: 0.28,
    roughness: 0.052,
    specScale: 1.48,
    refractionStrength: 0.054,
    dispersionStrength: 0.0095,
    causticsStrength: 1.08,
    causticsScale: 0.52,
    subsurfaceStrength: 0.72,
    foamWidth: 0.28,
    foamStrength: 0.78,
    foamSwash: 0.72,
    crestFoam: 0.24,
    wetBankDepth: 0.26,
    wetBankDarken: 0.40,
    edgeFadeDepth: 0.050,
    flow: [0.95, 0.18],
    rippleScale: 0.17,
    rippleSpeed: 0.22,
    rippleStrength: 0.48,
    microScale: 1.65,
    microStrength: 0.18,
    windGustStrength: 0.48,
    ssrStrength: 0.95,
    skyReflectScale: 0.98,
    waves: [
      [0.96, 0.24, 9.2, 0.036, 0.24, 1.02],
      [0.74, -0.66, 5.6, 0.025, 0.22, 1.08],
      [0.42, 0.90, 3.4, 0.016, 0.19, 1.14],
      [-0.35, 0.93, 2.2, 0.010, 0.16, 1.20],
      [0.85, 0.52, 1.38, 0.006, 0.14, 1.26],
      [-0.68, -0.73, 0.92, 0.0038, 0.12, 1.32],
    ],
  },
};
