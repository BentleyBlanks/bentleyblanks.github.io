// 《台儿庄：血战滕县》时域与镜头三件套的口径表（纯数据，零 three 依赖 —— 契约 2）。
//
// 这一张表管三个 pass：**TAA / TAAU**（`Script_PostTaa`）、**逐物体运动模糊**
// （`Script_PostMotionBlur`）、**散景景深**（`Script_PostDof`），外加末趟的
// **CAS 锐化**（`Script_PostFxaa`）。
//
// 与 `Data_Tuning_Graphics` 的分工：那张表是**档位**（这台机器画多重：开不开、
// 几个抽样、内部分辨率多少）；这张表是**算法口径**（快门多长、光圈多大、
// 邻域裁剪多紧）。同一个数字只该出现在其中一张里。
//
// ## 出处
//   · TAA 的 8 相位 Halton、0.04 当前帧权重、Blackman-Harris 3.3 高斯拟合
//     —— UE `r.TemporalAASamples=8` / `r.TemporalAACurrentFrameWeight=0.04` /
//        `TemporalAA.usf`（Karis, SIGGRAPH 2014 "High Quality Temporal Supersampling"）。
//   · 方差裁剪 —— Salvi, "An Excursion in Temporal Supersampling" (GDC 2016)，
//        即 UE4 `AA_VARIANCE` 那一路：把 3×3 的 min/max 盒再按 μ ± γσ 收紧一次。
//        纯 min/max 盒对高频高光太松（萤火虫留得住），收紧之后闪烁明显下降。
//   · anti-flicker 权重 —— Unity HDRP `TemporalAA` 的 feedback 调制：局部亮度
//        对比越高越信历史（当前帧在这种像素上本来就不可信）。
//   · responsive 掩码 —— UE 的 Responsive AA（stencil 标记）。本仓库没有 stencil
//        通道，改用预通道前景标签（`FOREGROUND_VIEW_DEPTH`）当同一件事，见 TAAU.responsive*。
//   · TAAU 的「按输出像素中心到输入样本的距离加权重采样」—— UE 的 TAAU
//        （`r.TemporalAA.Upsampling`）与 TSR 的输入重采样同一思路。
//   · 运动模糊 —— McGuire et al. 2012 "A Reconstruction Filter for Plausible Motion
//        Blur"（tile max → neighbor max → 深度/速度加权重建）+ Jimenez 2014
//        "Next Generation Post Processing in Call of Duty: Advanced Warfare"
//        （两向交替采样、抖动起点）。
//   · 景深 —— 同一份 COD:AW 讲义的 DOF 一节：半分辨率预滤波 → 近/远场分离 gather
//        → 填洞 → 上采样合成。CoC 用薄透镜公式。
//   · CAS —— AMD FidelityFX Contrast Adaptive Sharpening 1.0（ffx_cas.h 的
//        no-scaling 路径，逐通道 min/max + `sqrt(saturate(min/max))` 自适应幅度）。

/**
 * TAA / TAAU。
 *
 *   currentFrameWeight   静止像素的当前帧权重（UE 缺省 0.04；运行时可由画质面板改）
 *   fastMotionWeight     像素速度达到 fastMotionPx 时抬到的权重（UE 的 lerp 终点）
 *   fastMotionPx         上面那条曲线的饱和点（UE: velocityPx / 40）
 *   filterGaussianK      Blackman-Harris 3.3 的高斯拟合 exp(-k r²)，r 以**输入像素**为单位。
 *                        TAAU 下仍以输入像素度量：换成输出像素会让核比输出采样间距还窄，
 *                        某些输出像素整帧只落到一个输入样本上，靠时域补不回来。
 *   varianceGamma        方差裁剪的 γ。1.0 偏稳、1.5 偏锐；0 = 退回纯 min/max 盒。
 *   antiFlicker          anti-flicker 强度（0 = 关）。局部亮度对比 × 这个数进 saturate。
 *   antiFlickerFloor     高对比像素上当前帧权重的下限倍率（0.35 = 最多把权重压到 35%）
 *   responsiveWeight     responsive 掩码命中时的当前帧权重（UE ResponsiveAA 同义）
 *   responsiveDepthEps   前景标签的判定容差（米）。预通道把第一人称手/枪的视深写成
 *                        常数 FOREGROUND_VIEW_DEPTH，这里按 |w − tag| < eps 认它。
 *                        **已知近似**：世界里正好落在 1 m ± 2 mm 的实体也会吃到
 *                        responsive 权重 —— 那是一层 4 mm 厚的壳，肉眼不可见。
 *   historyClampMinWeight 混合权重的地板，防止裁剪 + anti-flicker 把画面彻底冻住
 */
export const TAAU = {
  currentFrameWeight: 0.04,
  fastMotionWeight: 0.2,
  fastMotionPx: 40,
  filterGaussianK: 2.29,
  varianceGamma: 1.25,
  antiFlicker: 0.6,
  antiFlickerFloor: 0.35,
  responsiveWeight: 0.5,
  responsiveDepthEps: 0.002,
  historyClampMinWeight: 0.015,
};

/**
 * 逐物体运动模糊。
 *
 *   tilePx           tile max 的边长（输入像素）。**它同时是单帧最大模糊位移**
 *                    —— McGuire 的前提是「任何像素的速度不超过一个 tile」，
 *                    超了就会在 tile 边界露出硬边。20 px 是讲义里的取值。
 *   shutterFraction  快门开合占一帧的比例。0.5 = 电影的 180° 快门。
 *                    速度靶记的是**整帧**位移，所以模糊长度 = 速度 × 这个数。
 *   softZExtent      McGuire 的 SOFT_Z_EXTENT（米）：深度分类的软过渡宽度。
 *   minBlurPx        低于这个像素长度直接返回中心色（跳过整个重建循环）。
 *   halfResBlendPx   半分辨率档的混合曲线：模糊长度到这个像素数时完全采用半分辨率
 *                    结果，之下按比例混回全分辨率原图（静止区域仍然是锐的）。
 */
export const MOTION_BLUR = {
  tilePx: 20,
  shutterFraction: 0.5,
  softZExtent: 0.6,
  minBlurPx: 0.6,
  halfResBlendPx: 2.5,
};

/**
 * 散景景深。
 *
 * ## CoC 的口径（薄透镜）
 * ```
 *   A     = f / N                                   光圈直径
 *   coc   = A · f · (d − dF) / (d · (dF − f))       传感器上的直径（带符号：近景为负）
 *   cocPx = coc / sensorWidth · 输出宽度（像素）
 * ```
 * 注意 `coc/cocInf = 1 − dF/d`：**远景的形状只由焦距平面 dF 决定**，光圈只改幅度。
 * 所以本实现把「形状」交给薄透镜、把「幅度」归一到既有的美术上限
 * （`dofMaxPx` / `nearDofMaxPx`），调用点一个字不用改，画面上限也不变。
 * 想要真·光圈驱动（改 f/N 就改虚化量）把 `apertureDriven` 置 true。
 *
 *   sensorWidthMm / focalLengthMm / fNumber  物理镜头参数（35 mm 全画幅 + 35/2.8）
 *   apertureDriven   true = CoC 幅度直接来自 f/N；false（出厂）= 归一到美术上限
 *   ringCount / ringSamples  gather 的同心环：8 + 16 + 24 = 48 抽样（COD:AW 同量级）
 *   nearFillRadius   近场填洞的半径（半分辨率像素）
 *   nearCoverageGain 近场覆盖度（alpha）的增益：>1 让前景边缘更肯往外渗
 *   maxCocPx         CoC 的绝对上限（输出像素）。tile 之外没有别的保护，别调太大
 *   minCocPx         低于它按锐利处理（跳过 gather 的混合）
 */
export const DOF = {
  sensorWidthMm: 36,
  focalLengthMm: 35,
  fNumber: 2.8,
  apertureDriven: false,
  ringCount: 3,
  ringSamples: [8, 16, 24],
  nearFillRadius: 1,
  nearCoverageGain: 1.35,
  maxCocPx: 28,
  minCocPx: 0.35,
};

/**
 * CAS（AMD FidelityFX Contrast Adaptive Sharpening）。
 *
 *   peakLow / peakHigh  sharpness 0→1 映射到的锐化峰值（AMD 原版：-1/8 … -1/5）
 *   clampOutput         末趟是否把结果钳回 [0,1]（送屏是 8 位，钳掉是对的）
 */
export const CAS = {
  peakLow: -0.125,
  peakHigh: -0.2,
  clampOutput: true,
};
