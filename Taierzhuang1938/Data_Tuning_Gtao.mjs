// 《台儿庄：血战滕县》GTAO / SSIL 的数值表（纯数据，零 three 依赖 —— 契约 2）。
//
// 这张表是 `Script_PostGtao.mjs` 唯一的数值来源；代码只读表，一个魔数都不许写在
// 着色器里。`Data_Tuning_Graphics.QUALITY_PRESETS` 里那两位（`gtao` / `ssil`）
// 只决定**哪一档、开不开**，具体几个切片几步在这里。
//
// ## 方案出处
//   · GTAO 本体 —— Jimenez, Wu, Pesce, Jarabo, *"Practical Realtime Strategies for
//     Accurate Indirect Occlusion"*, SIGGRAPH 2016 Course（Activision / Call of Duty）。
//     地平线角的解析 cos 加权积分（论文 Eq. 5-8）、弯曲法线闭式解（同课程附录）。
//   · 参数命名与取值区间对齐 Intel **XeGTAO** 的开源实现（XeGTAO.h 的
//     `XeGTAOSettings`）—— 它是同一篇论文最完整的公开落地，数值可直接对照。
//   · 多次反弹 —— 同一篇课程的 `GTAOMultiBounce(visibility, albedo)` 三次多项式。
//   · 镜面遮蔽 —— 同课程 §4「GTSO」，工程形式取 Oat & Sander 2007 的球冠相交
//     （Filament 的 `SpecularAO_Cones` 是同一条式子）。
//   · SSIL —— Vardis, Vasilakis, Papaioannou 等 2023 的**可见性位掩码**
//     （*Screen-Space Indirect Lighting with Visibility Bitmask*）：与 GTAO 共用
//     同一趟地平线搜索，用 32 位掩码记录已被占用的扇区，只有**新占用**的扇区
//     才吃一份反弹辐亮度 —— 这一条正是它比"取地平线那一个样本的颜色"强的地方
//     （重叠遮挡物不会被重复计一次光）。
//
// ## 为什么档位值写死不插值
// 与 `Data_Tuning_Graphics` 同一条理由：切片数 / 步数是**编译期**的
// （进了着色器的 `#define`，也进了 program cache key），中间档靠插值猜出来的数字
// 没有实测背书。改这里的 slices/steps 会换一份 program，不是每帧的事。

/**
 * 一档 GTAO = 一组编译期常量 + 一位时域开关。
 *
 * slices        每像素几个切片方向（论文的 slice，屏幕空间一条直线）
 * steps         每个切片**每一侧**走几步（总采样数 = slices × steps × 2）
 * temporal      时域累积（重投影上一帧 AO / 弯曲法线 / SSIL）
 * temporalCycle 噪声的帧序轮转周期。1 = 不轮转（低配：纯空间噪声，不闪）
 * blurPasses    空间双边去噪跑几趟（1 = 只横向，2 = 横+竖）
 *
 * **靶的分辨率不在这里** —— 它是 `Data_Tuning_Graphics.aoScale`（画质面板能看见的
 * 那一根），一份数据只许有一个出处。low/medium/high 是 0.5，ultra 是 1.0。
 * @typedef {{slices:number,steps:number,temporal:boolean,temporalCycle:number,blurPasses:number}} GtaoTier
 */

/** @type {Record<string, GtaoTier>} */
export const GTAO_TIERS = {
  // low 出厂其实不开 AO（QUALITY_PRESETS.low.ssao = false），这一档留着是为了
  // 「玩家在 low 上手动打开 AO」以及性能消融的最便宜对照组：1 切片 4 步、
  // 无时域、单趟模糊。噪声比 medium 明显，但成本约为 high 的 1/3。
  low: { slices: 1, steps: 4, temporal: false, temporalCycle: 1, blurPasses: 1 },
  medium: { slices: 2, steps: 4, temporal: true, temporalCycle: 6, blurPasses: 2 },
  high: { slices: 2, steps: 6, temporal: true, temporalCycle: 6, blurPasses: 2 },
  // ultra 配 aoScale=1.0：没有升采样就没有边缘光晕，接触带直接是 1:1 的锐度。
  // 代价是像素数 ×4，实测见 docs/Data_TechRenderPipeline.md 的「GTAO / SSIL」一节。
  ultra: { slices: 3, steps: 8, temporal: true, temporalCycle: 8, blurPasses: 2 },
};

/**
 * 与档位无关的 GTAO 口径。**世界空间单位一律米。**
 */
export const GTAO = {
  // AO 的**衰减**半径（米）：超过它的采样点对地平线不再有抬升。
  // 取值区间的两头都有理由 —— 小于 0.8 m 墙根的接触带只剩一指宽（旧 SSAO 的
  // 0.60 m 就偏小，靠把强度抬到 1.85 硬凑）；大于 1.5 m 整面墙都会发灰，
  // 遮蔽读起来就不像"接触"而像"脏"。
  // 注意这**不是**地平线搜索走多远：SSIL 开着时那一趟按 SSIL.radius 走得更远，
  // 只是超出这个半径的采样点权重为 0、只喂反弹光不喂 AO（见 Script_PostGtao）。
  radius: 1.2,
  // 衰减带占半径的比例（XeGTAO `EffectFalloffRange` 出厂 0.615）。
  // 采样点越靠近半径边缘，它对地平线的抬升越弱，避免半径边界出现硬环。
  falloffRange: 0.615,
  // 厚度启发式（论文 §3.4；XeGTAO 的 `ThinOccluderCompensation`）。
  // 0 = 经典 max 地平线：一根电线杆 / 一片瓦会被当成无限厚的墙，背后整片死黑；
  // 1 = 完全当薄片。0.35 是这一关的折中：砖墙、沙包是实心的（不该被当薄片），
  // 但屋檐、门板、栏杆是薄的，压到 0 会在它们背后留一条明显的黑带。
  thinOccluder: 0.35,
  // 采样点沿半径的分布幂（XeGTAO `SampleDistributionPower` 出厂 2.0）：
  // 幂 > 1 把样本推向近处，接触阴影那一段才够密。
  sampleDistributionPower: 2.0,
  // 离得比这还近的样本直接跳过（像素单位）。半分辨率下 1.3 px 以内的偏移
  // 落回自己那一格，只会给出一个恒等于 0 的地平线。
  pixelTooCloseThreshold: 1.3,
  // 屏幕空间半径上限（AO 靶的像素）。近处的墙面上 1.2 m 能撑到几百像素，
  // 不封顶的话贴脸时每一步都是一次远距离纹理跳读，缓存全丢。
  maxPixelRadius: 96,
  // 可见度的最终曲线。XeGTAO 出厂 2.2 —— 但那是**没有多次反弹**的版本；
  // 这里 MultiBounce 会把亮反照率的暗部提回去，再用 2.2 就压得太狠。
  finalPower: 1.6,
  // 远处淡出（米）：起点—终点。AO 是接触现象，60 m 之外一个像素覆盖的世界尺度
  // 已经超过半径本身，继续算只是噪声。淡出同时把那些像素的采样循环整个跳掉。
  fadeStart: 60,
  fadeEnd: 110,
  // 时域累积：本帧权重（历史 = 1 − 这个）。0.10 → 历史 0.90，与任务书的 0.9 一致。
  // 噪声按 temporalCycle 轮转，稳态残余纹波 ≈ 0.10 / |1 − 0.9·e^(−i·2π/cycle)|。
  temporalAlpha: 0.10,
  // 重投影拒绝：|历史视深 − 期望的上一帧视深| / 期望值 超过这个就丢历史。
  // 8% 是"允许角色自身运动带来的深度变化，但拒绝真正的遮挡变化"的分界。
  temporalDepthReject: 0.08,
  // 空间双边：深度权重的相对 sigma（相对视深）。0.02 = 2 cm/米。
  blurDepthSigma: 0.02,
  // 空间双边：法线权重的幂。越大边越硬。
  blurNormalPower: 8.0,
};

/**
 * SSIL（屏幕空间近场间接光）。
 *
 * **量纲是辐照度**：着色器里已经按 π²/(2·切片数) 归一化，估计量对
 * 「被辐亮度 L 的朗伯面铺满的半球」给出 πL（推导写在 Script_PostGtao 的
 * 那一行注释里）。材质端按 `indirectDiffuse += ssil × albedo / π` 注入 ——
 * 与天空 IBL 走 `RE_IndirectDiffuse` 的那条路完全同一个量纲。
 * 所以下面的 strength 是一根**艺术旋钮**（1.0 = 物理量），不是在替算式补窟窿。
 */
export const SSIL = {
  // 出厂强度（1.0 = 物理量）。0.70 是保守档：屏幕空间只看得见屏幕里那点几何，
  // 视野外的墙一律不反弹，所以按 1.0 走反而会在转头时出现"光随镜头亮起来"。
  strength: 0.70,
  // 地平线搜索的**实际半径**（米），SSIL 开着时用它。出厂与 AO 的衰减半径相等。
  //
  // 试过放到 1.8 m 让巷子对面那堵墙进搜索范围，**实测没有收益、还有代价**
  // （2026-09-07，正片 phase=overview 的 Wall_EastOuterFace / Street_Crossroad 两个
  // 采样点，逐像素读 SSIL 靶）：
  //   · SSIL 均值 0.0086 / 0.0034 → 0.0086 / 0.0034，一位都没动 —— 这一关的外景
  //     是阴天灰砖，源辐亮度本来就低，反弹量与半径无关，是"没有亮东西可反弹"；
  //   · 墙根接触带反而被摊薄：GtaoTest 的墙根可见度 0.751 → 0.836（暗带落差
  //     0.229 → 0.143）。步数没加、每步跨得更远，落在 0.4 m 以内的采样点从 4 个
  //     掉到 3 个。
  // 结论：**要给 SSIL 更远的手，必须同时加步数**，不能只放半径。真要试就把
  // GTAO_TIERS 的 steps 一起抬，并重跑 GtaoTest 的接触暗带那一条。
  radius: 1.2,
  // 反弹辐亮度的钳制。上一帧的 HDR 里有火光（40+）与太阳高光，不钳的话
  // 一颗 firefly 会在半径一米内泼一大片彩色，且时域累积会把它拖长。
  clamp: 6.0,
  // 探针体 GI 打开时的整体降幅。探针体已经带了一份多次反弹的间接光，
  // 近场那一米会被算两遍。−40%（乘 0.60）是实测折中，见 docs 的实测表。
  giScale: 0.60,
  // 可见性位掩码的扇区数。32 = 一个 uint。GLSL ES 3.00 没有 bitCount()，
  // 手写 popcount（见 Script_PostGtao）；换 64 要拆成两个 uint，不值。
  sectorCount: 32,
  // 位掩码用的"厚度"（米）：一个采样点在深度图里只是一个面，掩码要知道它
  // 挡住多宽的一段角度，所以沿视线往后推这么远当作它的背面。
  thickness: 0.35,
};

/** 档位名 → 一档 GTAO。`Data_Tuning_Graphics` 里 `gtao` 那一位存的就是这个键。 */
export function MakeGtaoTier(name) {
  return { ...(GTAO_TIERS[name] || GTAO_TIERS.high) };
}
