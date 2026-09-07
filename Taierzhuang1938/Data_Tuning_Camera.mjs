// 《台儿庄：血战滕县》**物理相机**的数值表：自动曝光、色调映射、3D LUT 分级、
// 镜头光晕与脏污。纯数据、零 three 依赖（契约 2），代码只读这张表。
//
// ## 与 Data_Tuning_Graphics 的分工（别混）
//   · `Data_Tuning_Graphics.QUALITY_PRESETS` 决定「这台机器画多重」——
//     autoExposure / lensFlare / lut 三位开关在那里，本文件不重复。
//   · 本文件决定「相机是一台什么样的相机」：测光怎么做、EV 怎么钳、光晕多强。
//     它对四档画质是同一套（除了少数按档缩放的强度，写成 byQuality 子表）。
//   · `Script_Sky.SKY_PRESETS` 仍然决定「这一关长什么样」（exposure/bloom/雾/调色）。
//     **自动曝光不夺走那份美术意图** —— 见下面 SKY_EXPOSURE 的锚点口径。
//
// ## 自动曝光的口径（UE5 / Frostbite 的那一套）
// 1. 主 HDR 降采样成 160×90 的 **log2 亮度** 图；
// 2. 每个降采样像素用**点图元 + 加法混合**投进 64 桶直方图（WebGL2 没有 compute，
//    这是成熟做法）。为了让半浮点靶不丢计数，直方图是 64×16 的，行由顶点序号轮转，
//    单格最多 160×90/16 = 900 —— 半浮点能精确表示到 2048 的整数；
// 3. 列归约成 64×1 的**归一化频度**（除以总像素数：半浮点的相对精度与量级无关，
//    存计数会在 14400 这个量级上丢到 8 的 ulp）；
// 4. 1×1 pass 取 50%–95% 百分位区间的平均 log 亮度（UE 的
//    `ComputeAverageLuminaneWithoutOutlier`，掐掉纯黑天花板与镜面高光两头）；
// 5. EV100 = log2(L · 100 / K)，K = 12.5 是反射式测光表的标定常数
//    （Lagarde & de Rousiers,《Moving Frostbite to PBR》, 2014, §5.1）；
// 6. 时域适应：亮→暗与暗→亮两个不同的时间常数，指数逼近，状态存 1×1 RGBA16F
//    的 ping-pong（**全 GPU，不许 readRenderTargetPixels —— 那是 GPU 同步点**）。
//
// ## 为什么最终增益是「相对锚点」而不是绝对值
// 绝对物理曝光 = 1/(1.2 · 2^EV100)（Frostbite 的 maxLuminance 形式）。直接用它，
// 九张时段预设辛辛苦苦调出来的 exposure（白天 0.40–0.62、夜战 3.6）全部作废，
// 而且「画面为什么这么黑」那一类事故会立刻重演。
//
// 所以运行档的默认口径是 **anchored（锚定）**：
//     gain = 2^(evCal − evNow)
// `evCal` 是**那一关在出生机位上实测的 EV**（下面 EXPOSURE_ANCHORS.logLum；
// 为什么是逐关而不是逐时段，见那张表的抬头）。
// 站在标定机位时 evNow == evCal，gain 精确等于 1.0 —— 画面与关掉自动曝光时
// 一模一样；走进屋里、钻进地道、面对火光时才按实际亮度补偿。
// `absolute` 模式仍然实现着（evCal 由 options.exposure 反推），只给验收用：
// 喂一张 0.18 灰，输出必须落在中灰 sRGB 118 上。
//
// 出处：UE5 `PostProcessEyeAdaptation.cpp` / `PostProcessHistogram.usf`；
// Frostbite PBR 课程笔记 §5；Alex Fry, "High Dynamic Range Color Grading and
// Display in Frostbite"(GDC 2017)。

/** 直方图自动曝光的固定口径。改这里要连着 Script_ExposureTest 一起跑。 */
export const AUTO_EXPOSURE = {
  /** 亮度降采样图尺寸（固定，不随窗口变 —— 测光是统计量，不需要跟分辨率走）。 */
  lumWidth: 160,
  lumHeight: 90,
  /** 每个降采样像素取几个 HDR 抽样（2×2 盒式：一个抽样会让统计对高频过敏）。 */
  lumTaps: 2,
  /** 直方图桶数与行数。行数只为半浮点加法混合不溢出，见抬头第 2 条。 */
  bins: 64,
  rows: 16,
  /**
   * 桶格：宽度（EV）+ **中灰钉在第几号桶**。
   *
   * 直方图的量化误差有半个桶宽（0.15 EV ≈ 11% 亮度），它落在哪儿是可以选的。
   * 把 log2(0.18) 钉在桶心上，中灰就完全不吃量化偏移 —— 整条标定链
   * （「喂一张 0.18 灰，输出必须是中灰 sRGB 118」）因此是精确的，而不是
   * 「差不多」。UE 是拿 min/max 定格子的，中灰落在哪儿全看运气。
   *
   * 覆盖范围 = 32×0.30 EV 往下、31×0.30 EV 往上，即 −12.07 … +6.83 EV：
   * 下端约 2.3e-4（无月夜的墙面），上端约 114（正午晒白的墙），
   * 更亮的（太阳盘、枪口焰）落进最后一桶，对百分位平均没有影响。
   */
  binWidth: 0.30,
  midGreyBin: 32,
  /** 百分位区间（UE 默认 50%–95%）：掐掉大片纯黑与少量镜面高光。 */
  lowPercent: 0.50,
  highPercent: 0.95,
  /** 反射式测光标定常数 K。ISO 2720 允许 10.6—13.4，12.5 是 Canon/Nikon 的取值。 */
  calibrationK: 12.5,
  /**
   * 时域适应速率（1/s，指数逼近 exp(−dt·speed)）。
   * 暗→亮（瞳孔收缩）比亮→暗（暗适应）快得多，UE 默认 3.0 / 1.0，照抄。
   */
  speedUp: 3.0,
  speedDown: 1.0,
  /**
   * 中心加权测光。0 = 全画面等权（**默认**，直方图各桶之和精确等于降采样像素数，
   * 验收断言就压在这条上）；>0 时边缘权重按 1 − w·r² 衰减。
   */
  centerWeight: 0.0,
  /** 增益硬钳（防止半浮点溢出 / 某一帧的病态统计把画面掀翻）。 */
  gainMin: 1 / 32,
  gainMax: 32,
  /** 复位后强制吸附目标值的帧数（换关、镜头硬切、SetSize 之后）。 */
  snapFrames: 2,
};

/**
 * 每个时段预设的 **EV 钳位与曝光补偿**（锚点在下面 EXPOSURE_ANCHORS）。
 *
 *   logLum  兜底锚点：该预设没有逐关锚点时用它。null = **只测量不作用**
 *           （增益恒 1，画面与关掉自动曝光完全一致）。
 *   evBias  曝光补偿（EV，正数 = 更亮）。美术意图的最后一道旋钮，默认 0 ——
 *           因为 SKY_PRESETS.exposure 已经把每一关调好了。
 *   evUp    允许自动曝光**提亮**的上限（EV）。
 *   evDown  允许自动曝光**压暗**的上限（EV）。
 *
 * 夜战那一档的钳位特别紧：evUp 0.6 意味着自动曝光最多把夜景提亮 1.5 倍，
 * 结构上不可能把夜战拉成白天（用户明确要求）。
 */
export const SKY_EXPOSURE = {
  // logLum: null = **只测量不作用**（增益恒 1，画面与关掉自动曝光完全一致）。
  // 没有实测数据就绝不允许它动画面 —— 用户对明暗极敏感，猜一个数比不做更糟。
  _default: { logLum: null, evBias: 0, evUp: 1.5, evDown: 1.5 },
  // 下面四档由 `node Taierzhuang1938/Script_ExposureTest.mjs --calibrate` 在正片
  // 每一关的**出生机位**上实测（2026-09-07，RTX 4070 SUPER / 1600×900 / high）。
  // 换关卡布景、改天光预设或改 SSAO/GI 都要重跑一次并更新这里。
  smokyDay: { logLum: null, evBias: 0, evUp: 1.6, evDown: 1.4 },
  dawn: { logLum: null, evBias: 0, evUp: 1.4, evDown: 1.2 },
  burningStreet: { logLum: null, evBias: 0, evUp: 1.6, evDown: 1.4 },
  // 夜战：钳位特别紧。evUp 0.6 = 自动曝光最多把夜景提亮 1.5 倍，
  // 绝不可能被拉成白天（用户明确要求）。
  night: { logLum: null, evBias: 0, evUp: 0.6, evDown: 0.8 },
  // 下面这些不在正片七关的出生机位上（过场自带天空、白盒、编辑器、靶场），
  // 没有可复现的「默认机位」可标定，一律留 null = 只测量不作用。
  dusk: { logLum: null, evBias: 0, evUp: 1.4, evDown: 1.2 },
  overcast: { logLum: null, evBias: 0, evUp: 1.2, evDown: 1.2 },
  chuchuanDay: { logLum: null, evBias: 0, evUp: 1.8, evDown: 1.2 },
  whiteboxDay: { logLum: null, evBias: 0, evUp: 1.2, evDown: 1.2 },
  editorClear: { logLum: null, evBias: 0, evUp: 1.2, evDown: 1.2 },
  testSceneDay: { logLum: null, evBias: 0, evUp: 1.0, evDown: 1.0 },
  weaponRangeDay: { logLum: null, evBias: 0, evUp: 1.0, evDown: 1.0 },
  p012WhiteboxDay: { logLum: null, evBias: 0, evUp: 1.0, evDown: 1.0 },
};

/**
 * **逐关**的曝光锚点（键 = `Data_Levels` 的关卡 id，也就是 `PHASE_TABLE[i].id`）。
 *
 * 为什么不能只按时段预设锚：`smokyDay` 被三关共用，而三关的出生机位实测平均
 * 场景亮度差了 0.70 EV（CH1 1.29 / CH2 0.77 / CH3 1.47）。按预设取平均的话，
 * 最暗那一关一打开自动曝光就整体提亮三成 —— 正是本轮明令禁止的那种事。
 * 所以锚点跟着**关**走，时段预设那张表只留 EV 钳位与补偿。
 *
 * 数据来自 `node Taierzhuang1938/Script_ExposureTest.mjs --calibrate`
 * （**2026-09-08 集成期重标**，RTX 4070 SUPER / 1280×720 / high / 出生机位 / 预热 240 帧）。
 * 上一版（2026-09-07）是在 B6a 分支上量的，那份检出还没有 CSM / GTAO+SSIL / SSR /
 * froxel 体积雾 / 物理大气 / 簇状光 / 材质着色 —— 七个子系统合流之后同一个出生机位
 * 整体亮了约 0.4 EV（夜战反而暗了 0.15 EV），旧锚点会让「打开自动曝光」当场把
 * 第 0 关提亮 15%、第 3 关压暗 12%。**锚点是跟着整条管线走的，不是跟着相机走的**：
 * 任何改变场景亮度的渲染改动（间接光、阴影、雾、tonemap）之后都要重跑这一条。
 * 换关卡布设、改天光预设、改 SSAO 或 GI 之后同样要重跑并更新这里；
 * 没有登记的关一律走时段预设那条，再没有就是 null = 只测量不作用。
 */
export const EXPOSURE_ANCHORS = {
  CH0_Chuchuan: { logLum: -0.13 },       // chuchuanDay
  CH1_NanLu: { logLum: 1.29 },           // smokyDay
  CH2_Shouliudan: { logLum: 0.77 },      // smokyDay
  CH3_Jiuhusuo: { logLum: 1.47 },        // smokyDay
  CH4_DongguanYe: { logLum: -3.13 },     // night
  CH5_Chengqiang: { logLum: 0.59 },      // dawn
  CH6_Zuihou: { logLum: 0.54 },          // burningStreet
};

/**
 * 取一份锚点。三层合并：`_default` ← 时段预设 ← 逐关锚点。
 * @param {string|null} skyName    时段预设名（EV 钳位与补偿从这里来）
 * @param {string|null} anchorKey  关卡 id（实测 logLum 从这里来，优先）
 */
export function SkyExposureFor(skyName, anchorKey = null) {
  return {
    ...SKY_EXPOSURE._default,
    ...(SKY_EXPOSURE[skyName] || null),
    ...(anchorKey ? EXPOSURE_ANCHORS[anchorKey] || null : null),
  };
}

/**
 * 色调映射。
 *   aces  Stephen Hill 的 ACES RRT+ODT 拟合（**默认**，与既有观感逐比特一致）。
 *   agx   Troy Sobotka 的 AgX（Blender 4.0 的默认），高光去色更"胶片"，
 *         但整体更平 —— 这一关的黄土与硝烟在 AgX 下会更灰，所以不设为默认。
 * 两条曲线的 GLSL 都在 Script_PostComposite 的 SEGMENT exposure 里。
 * AgX 的实现直接对齐 three r185 的 `AgXToneMapping` chunk（同一组矩阵与六阶拟合），
 * 免得哪天换成内置 tonemapping 时观感突变。
 */
export const TONEMAP_MODES = ["aces", "agx"];
export const TONEMAP = { default: "aces" };

/**
 * 3D LUT 分级。
 *
 * 尺寸 64³ → 4096×64 条带。1 MB 的 RGBA8，烘一张实测约 60 ms，
 * 只在**换时段预设**时跑一次（进关 / 过场开场，本来就有更贵的开销）。
 * docs §9 的老稿写的是 32³：实测下分离调色的**权重折角**（clamp 的两个拐点，
 * 它们是 RGB 立方体里的斜面）三线性插值接不住，32³ 的最大误差是 3/255；
 * 64³ 才落回 ≤ 1/255。折角的误差是 O(h) 不是 O(h²)，所以只能加分辨率。
 * 索引域是 **sRGB**（显示参考），
 * 不是线性：分级里的对比度本来就是在 sRGB 域做的，而按线性索引会让第一格
 * 覆盖 0—0.032 线性亮度（sRGB 0—0.20），暗部三线性插值直接崩 —— 这一关最
 * 敏感的正是暗部。存的值同样是 sRGB 编码，8 位量化误差因此落在最终输出的
 * 同一个量化格上（≤1/255）。
 *
 *   size      每边格数（64 = 4096×64 条带）。
 *   amount    出厂混合量（1 = 完全走 LUT）。
 *   maxCache  同时缓存几张烘好的 LUT（换时段来回切不重烘）。
 */
export const LUT = { size: 64, amount: 1.0, maxCache: 4 };

/**
 * 泛光的物理化口径。
 *
 * threshold/knee/clamp 仍是 HDR 域的数，但运行时**除以自动曝光增益**：
 * gain = 1（自动曝光关着，绑纯白 1×1）时与今天逐比特相同；自动曝光把暗处
 * 提亮 2 倍时阈值同步降到 0.59，于是「显示上一样亮的东西泛光一样多」——
 * 这就是物理化的全部意思，不需要改任何一张时段预设。
 *
 *   karis   第一级降采样用 Karis 平均（1/(1+luma) 加权）压萤火虫。
 *           **出厂关**：它会改变每一张画面（这正是它的用途），
 *           而本轮的验收要求「自动曝光关掉时逐比特等于改动前」。
 *           想开就在画质面板里翻，或把这一位改 true。
 *   exposureTracking  上面那条阈值跟随。恒开（gain=1 时是恒等式）。
 */
export const BLOOM = { karis: false, exposureTracking: true };

/**
 * 镜头光晕（Chapman 2013,《Pseudo Lens Flare》）+ 镜头脏污。
 *
 * 战争片不是赛博朋克：默认强度压得很低，只在真的有强光源（太阳、爆炸、火）
 * 时才看得出来。三层：
 *   ghosts   亮部图沿「像素→屏幕中心」方向的重复采样，带 RGB 色散；
 *   halo     固定半径的环（镜筒内反射）；
 *   glare    太阳位置的十字星芒，**受屏幕空间遮挡**（太阳被墙挡住就没有）。
 * 脏污只乘在泛光的高亮处（smoothstep 门槛），否则整屏永远糊着一层灰 ——
 * 那是最典型的廉价滤镜感（docs §5）。
 */
export const LENS_FLARE = {
  ghostCount: 5,
  ghostSpacing: 0.33,
  ghostDispersal: 0.0075,
  ghostChroma: 0.010,
  haloRadius: 0.42,
  haloWidth: 0.28,
  haloChroma: 0.014,
  /** 亮部再抬一道门槛：光晕只吃真正的光源，不吃被泛光提起来的中间调。 */
  threshold: 0.55,
  /** 太阳星芒：条数、长度（uv）、粗细指数。0 条 = 关。 */
  starPoints: 4,
  starLength: 0.11,
  starSharpness: 220.0,
  /** 太阳遮挡判据：在太阳 uv 周围取几圈样，命中几何就算被挡。 */
  occlusionTaps: 8,
  occlusionRadius: 0.012,
  /** 各档的总强度（乘在 preset.bloom 之后；0 = 该档不跑这一 pass）。 */
  byQuality: { low: 0, medium: 0, high: 0.55, ultra: 0.70 },
  /** 镜头脏污。strength 是脏污对泛光的**额外**增益，门槛按泛光亮度。 */
  dirt: { strength: 0.45, thresholdLow: 0.25, thresholdHigh: 1.60, size: 256, seed: 20260907 },
};

/** 输出编码。dither = 三角分布抖动的幅度（1/255 的倍数）；0 = 关（出厂）。 */
export const OUTPUT = { dither: 0.0 };

export default {
  AUTO_EXPOSURE, SKY_EXPOSURE, SkyExposureFor, TONEMAP, TONEMAP_MODES, LUT, BLOOM,
  LENS_FLARE, OUTPUT,
};
