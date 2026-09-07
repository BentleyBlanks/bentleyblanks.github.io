// 《台儿庄：血战滕县》画质档位表（纯数据，零 three 依赖 —— 契约 2）。
//
// 这张表是**渲染帧图唯一的开关与旋钮来源**：`Script_Post.mjs` 的编排器按它决定
// 每个 pass 建不建靶、跑不跑；`Script_Main.mjs` 与 `Script_EditorSettings.mjs`
// 只读，不写。想加一个 pass，先在这里加一位开关（四档都要给值），再去帧图里插一行。
//
// ## 为什么值都写死不做插值
// 档位是**构造期**的：MSAA 采样数、AO 靶比例、泛光级数在 PostPipeline 建靶时就
// 定死了（画质面板那一栏给的是「按这个档重开页面」）。中间档靠插值猜出来的数字
// 没有实测背书，只会让「high 到底是什么样」说不清楚。
//
// ## 出处
//   · ssao / bloomLevels / godrays / msaa / motionBlur / aoScale / sharpen / taa
//     —— 2026-08 之前就在 Script_Post.mjs 里的那张 QUALITY_PRESETS，逐位搬过来，
//        本次重构不改一个数（行为守恒）。
//   · velocity / hzb —— 2026-09 帧图重构新增：MRT 速度靶与 HZB 链。
//        高低档都开：它们是后续 SSR / 体积雾 / 接触阴影的公共输入，
//        关掉等于把八个并行子系统一起关掉；真要省，先关消费方。
//   · ssr / ssrScale / ssrSteps / ssrResolveTaps —— 2026-09 屏幕空间反射落地。
//        档位口径见 §「SSR 分档」注释与 docs/Data_TechRenderPipeline.md
//        「屏幕空间反射」一节；不随天光预设变。
//   · clusteredLights —— 2026-09 簇状前向光照落地：medium 及以上开。
//        low 保持 2026-09 之前的固定灯池（`Data_Tuning_Lights.CLUSTER_TIERS.low`
//        的 enabled 也是 false，两处都关才是真关）。网格与光源预算不在这张表里，
//        它们在 `Data_Tuning_Lights.CLUSTER_TIERS`（那张表是纯数值 + 纯几何，
//        纯 Node 单测直接 import 它）。
//   · atmosphere —— 2026-09 物理大气（子系统 B4）。四档全开：透过率与多次散射
//        两张 LUT 只在换预设时算一次，每帧的账只有天空视图（两万像素）与
//        大气透视 froxel（低档 16³），low 档也给得起。关掉退回旧解析天空。
//   · volumetrics —— 2026-09 froxel 体积雾落地：medium/high/ultra 开，low 保留解析雾。
//        网格与时段参数在 `Data_Tuning_Volumetrics.mjs`（这张表只留开关位，
//        免得画质档与美术意图又混成一张表）。
//   · gtao / ssil / aoScale —— 2026-09 GTAO 落地（`Script_PostGtao.mjs`）：
//        `ssao` 保留为 **AO 总闸**（消融与调试面板的可用性都读它，语义不许变），
//        `gtao` 存的是**档位名**（`Data_Tuning_Gtao.GTAO_TIERS` 的键），
//        `ssil` 是屏幕空间近场间接光的构造期开关。
//        `aoScale` 由 0.5/0.6/0.75/1.0 改为 0.5/0.5/0.5/1.0：GTAO 的每像素成本
//        是旧 SSAO 的两倍多（地平线搜索 + 弯曲法线 + 位掩码），而它在半分辨率上
//        配联合双边升采样的画质仍然明显好于旧 SSAO 的 0.75 —— 详见
//        docs/Data_TechRenderPipeline.md「GTAO / SSIL / 镜面遮蔽」一节的实测表。
//   · csm / contactShadows —— 2026-09 阴影子系统落地：
//        csm 四档全开（级数、图尺寸、分割、节流、PCSS 抽样数在
//        `Data_Tuning_Shadows.SHADOW_PRESETS`，这里只是「跑不跑」的总闸）；
//        contactShadows 只 medium 及以上（low 档一张半分辨率 12 步 raymarch
//        在集显上不值那个钱，而且 low 的阴影本来就只铺 70 m）。
//   · 其余键（autoExposure / lensFlare / lut / dof / taaUpscale）
//     —— **本阶段全部为占位**，值 = 与今天等价（即「不启用新东西」）。
//        对应子系统落地时把自己那一位改成实际档位，并在这里补出处注释。
//
// ## 与天光预设（SKY_PRESETS）的分工
// 天光预设决定「这一关长什么样」（曝光、雾色、泛光阈值，全是美术意图）；
// 这张表决定「这台机器画多重」。两件事混在一张表里的下场是玩家把画质调低之后
// 夜战关变成纯黑 —— 那一关的 exposure 是 3.6，被当成画质项一起压掉了。

/**
 * 一档画质 = 一整套 pass 开关与旋钮。
 *
 * 键的语义（布尔 = 开关，数字 = 旋钮）：
 *   ssao          环境光遮蔽**总闸**（2026-09 起实现是 GTAO；false = 整趟不跑）
 *   gtao          GTAO 档位名（Data_Tuning_Gtao.GTAO_TIERS 的键）；false = 关
 *   ssil          屏幕空间近场间接光（构造期开关，与 GTAO 同一趟地平线搜索）
 *   aoScale       AO 靶相对主靶的边长比例
 *   bloomLevels   泛光金字塔级数
 *   godrays       屏幕空间太阳拖影（还要 options.godStrength > 0 才真跑）
 *   msaa          主 HDR 靶的多重采样数（0 = 关）
 *   motionBlur    合成 pass 里的相机运动模糊
 *   sharpen       末趟锐化强度（FXAA/TAA 之后补回边缘）
 *   taa           时域抗锯齿的**出厂默认**（运行时可经 SetTaaEnabled 热切）
 *   velocity      预通道 MRT 的 RT1 屏幕空间速度靶
 *   hzb           预通道之后建线性视深 max-reduce mip 链（HZB）
 *   ssr           屏幕空间反射（Hi-Z 追踪 + 随机 GGX + 解算 + 时域累积）
 *   ssrScale      SSR 追踪靶相对主靶的边长比例（0.5 = 半分辨率）
 *   ssrSteps      Hi-Z 追踪的最大迭代次数（编译期常量，进 shader 的循环上限）
 *   ssrResolveTaps 解算（ratio estimator）的邻域样本数；0 = 不解算，只走时域
 *   volumetrics   froxel 体积雾 / 体积光（medium 及以上开；low 保留解析式高度雾）。
 *                 froxel 网格尺寸不在这张表里，在 `Data_Tuning_Volumetrics.VOLUMETRIC_GRIDS`
 *                 （按同名档位查），时段参数在同文件的 VOLUMETRIC_PRESETS
 *   csm           级联阴影总闸（级数/尺寸/分割/节流见 Data_Tuning_Shadows）
 *   contactShadows 屏幕空间接触阴影（帧图里排在 gtao 之后、main 之前）
 *   ——— 以下为后续子系统的占位位，本阶段一律「等价于今天」———
 *   autoExposure  自动曝光（今天：时段预设手调的常数曝光）
 *   lensFlare     镜头光晕
 *   lut           3D LUT 调色（今天：lift/gain + 分离调色）
 *   dof           景深（今天恒开：阵亡与开镜两条都走 Composite 的圆盘采样）
 *   taaUpscale    TAA 超分（TAAU）
 *   clusteredLights 簇状多光源：视锥切簇 + CPU 每帧建簇表 + 材质补丁里的局部光循环。
 *                   medium 32 盏 / high 64 盏 / ultra 128 盏；low 仍是固定预算的
 *                   PointLight 池。网格与预算见 Data_Tuning_Lights.CLUSTER_TIERS
 * @typedef {Record<string, boolean|number>} QualityPreset
 */

/** 后续子系统的占位位。四档共用同一份「等价于今天」的取值。 */
const RESERVED_OFF = {
  autoExposure: false,
  lensFlare: false,
  lut: false,
  taaUpscale: false,
  // 景深今天就在跑（阵亡远景虚化 + 开镜近景虚化），所以它不是 false。
  dof: true,
};

export const QUALITY_PRESETS = {
  // 抗锯齿分工：taa 是 medium 及以上的**出厂默认**（UE 的默认 AA 也是 TAA），
  // FXAA 只在 taa 关着时兜底。low 出厂不开：两张全分辨率 RGBA16F 历史靶
  // 在集显上是实打实的带宽，low 档的定位就是"能跑"。
  // 但这一位只是默认值不是上限 —— 画质面板可以运行时开关（SetTaaEnabled），
  // low 档玩家想要也给得了，靶到那时候才建。
  // AO 分档（2026-09 GTAO）：low 出厂不开 AO（`ssao: false`），但 `gtao` 仍写
  // "low" —— 玩家在 low 上手动打开时走 1 切片 4 步无时域的最便宜那一档，
  // 而不是掉进 high 的 2×6。SSIL 只给 high / ultra：它要多一张颜色历史靶
  // 与每采样一次颜色读，medium 的定位是"1080p 稳 60"。
  low: {
    ...RESERVED_OFF,
    ssao: false, gtao: "low", ssil: false,
    bloomLevels: 4, godrays: false, msaa: 0, motionBlur: false,
    aoScale: 0.5, sharpen: 0.14, taa: false,
    velocity: true, hzb: true, atmosphere: true,
    // low 不跑 SSR：连靶都不建，材质也不编入补丁（`ssr` 进 cache key）。
    ssr: false, ssrScale: 0.5, ssrSteps: 32, ssrResolveTaps: 0,
    // low 不跑簇：每帧几千次球-AABB 判定 + 一张表上传，换来的画面收益抵不过
    // 它在 CPU 上的占用（low 档本来就卡在 CPU 提交）。这一档仍是两盏三方点光。
    clusteredLights: false,
    // low 唯一保留解析式高度雾的一档（Composite 的 uFogSource = 0 那条路永久保留）。
    // 也是唯一还能开屏幕空间太阳拖影（godrays）的一档 —— 体积雾开着时两者会双份。
    // 这一档的雾色仍由大气透视供（atmosphere 开着），只是散射按解析式一条常数走。
    volumetrics: false,
    // 级联阴影四档全开（low 是 2 级）；接触阴影 low 不跑。
    csm: true, contactShadows: false,
  },
  medium: {
    ...RESERVED_OFF,
    clusteredLights: true,   // 局部光预算 32 盏（Data_Tuning_Lights.CLUSTER_TIERS.medium）
    ssao: true, gtao: "medium", ssil: false,
    bloomLevels: 5, godrays: true, msaa: 0, motionBlur: true,
    aoScale: 0.5, sharpen: 0.18, taa: true,
    velocity: true, hzb: true, atmosphere: true,
    // medium：半分辨率 32 步，**不做空间解算**（只有中心那一条随机射线），
    // 噪声全交给时域累积压。静止画面收敛得和 high 一样干净，动起来会脏一点。
    ssr: true, ssrScale: 0.5, ssrSteps: 32, ssrResolveTaps: 0,
    volumetrics: true,
    csm: true, contactShadows: true,
  },
  // high 的抗锯齿由 TAA 承担。超宽屏再给 RGBA16F 主靶叠 4×MSAA 会多占
  // 上百 MB 显存并重复抗锯齿；把 4× 留给主动选择 ultra 的玩家
  // （ultra 是 MSAA 喂更干净的几何边给 TAA，两层叠加不冲突，只是贵）。
  high: {
    ...RESERVED_OFF,
    clusteredLights: true,   // 局部光预算 64 盏（Data_Tuning_Lights.CLUSTER_TIERS.high）
    ssao: true, gtao: "high", ssil: true,
    bloomLevels: 6, godrays: true, msaa: 0, motionBlur: true,
    aoScale: 0.5, sharpen: 0.22, taa: true,
    velocity: true, hzb: true, atmosphere: true,
    // high：半分辨率 48 步 + 4 抽样 ratio estimator + 时域。这一档是性能红线所在
    //（3394×1348 实测 hiz+trace+resolve+temporal 合计见 docs「屏幕空间反射」）。
    ssr: true, ssrScale: 0.5, ssrSteps: 48, ssrResolveTaps: 4,
    volumetrics: true,
    csm: true, contactShadows: true,
  },
  ultra: {
    ...RESERVED_OFF,
    clusteredLights: true,   // 局部光预算 128 盏（Data_Tuning_Lights.CLUSTER_TIERS.ultra）
    ssao: true, gtao: "ultra", ssil: true,
    bloomLevels: 6, godrays: true, msaa: 4, motionBlur: true,
    aoScale: 1.0, sharpen: 0.22, taa: true,
    velocity: true, hzb: true, atmosphere: true,
    // ultra：全分辨率追踪（不再有半分辨率上采样的边缘渗色）+ 64 步 + 8 抽样解算。
    ssr: true, ssrScale: 1.0, ssrSteps: 64, ssrResolveTaps: 8,
    volumetrics: true,
    csm: true, contactShadows: true,
  },
};

/** 画质档名（`?quality=` 认这几个，别的一律退回 high）。 */
export const POST_QUALITY_KEYS = Object.keys(QUALITY_PRESETS);

/** 取一份档位副本。调用方会往上写运行时状态（FrameProfileTest 就直接改 preset.ssao）。 */
export function MakeQualityPreset(quality) {
  const name = QUALITY_PRESETS[quality] ? quality : "high";
  return { ...QUALITY_PRESETS[name] };
}

/**
 * HZB（层级化 Z 缓冲）的口径。SSR / 体积雾 / 屏幕空间接触阴影共用这一条链，
 * 所以级数与最小边长写在这里而不是散在各 pass 里。
 *   maxLevels  最多建几级（不含第 0 级 = 全分辨率线性视深）
 *   minSize    最小一级的短边像素，低于它就停
 */
export const HZB = { maxLevels: 8, minSize: 8 };

/**
 * 速度缓冲口径。单位是 uv（本帧 uv − 上一帧 uv），用**无抖动**的两帧矩阵算，
 * 所以 TAA 的 jitter 不会漏进速度里。
 *   clampUv        单帧最大位移（uv）。快速转身时越界的速度会把运动模糊拉成一坨。
 *   skinnedPrev    蒙皮上一帧骨骼矩阵（doubled boneTexture，见 Script_PostPrepass）
 */
export const VELOCITY = { clampUv: 0.25, skinnedPrev: true };

/**
 * 屏幕空间反射（`Script_PostSsr.mjs`）。与档位无关的那一套常数都在这里，
 * 档位只管「画多重」（分辨率 / 步数 / 解算样本数）。
 *
 * 出处：Stachowiak 2015《Stochastic Screen-Space Reflections》（随机 GGX +
 * ratio estimator 解算 + 时域累积）、Uludag 2014《Hi-Z Screen-Space Cone Tracing》
 * （层级 Z 跳跃）、Heitz 2018（VNDF 采样与 G2/G1 权重）、UE 的 SSR
 * （上一帧场景色 + 粗糙度上限 + 屏幕边缘淡出）。数字全部是本作实测调出来的。
 *
 *   maxRoughness    粗糙度上限。超过它整片元不进 SSR（a 恒 0，回退天空 PMREM）。
 *                   0.6 是本作 ORM 里「湿泥地 / 旧钢盔」的粗糙度带上沿；再高
 *                   反射本身已经糊成 PMREM 那一档，追踪只是白花钱。
 *   roughnessFadeAt 从这个粗糙度起线性淡出到 maxRoughness（没有这一段，
 *                   粗糙度贴图上的一条等值线会变成画面上一条硬边）。
 *   thickness       命中判据的厚度（米）：射线视深与场景视深之差小于它才算命中。
 *   thicknessSlope  厚度随视深线性放宽的斜率 —— 远处一个像素本来就覆盖几十厘米，
 *                   固定厚度会把远景全判成「穿过去了」。
 *   refineSteps     Hi-Z 命中之后的二分细化步数。
 *   hizLevels       SSR 自己那条 **min-reduce** 金字塔的级数（见下面那段账）。
 *   colorLods       上一帧场景色金字塔的可用级数（含第 0 级）。
 *   coneScale       锥角系数：锥半径 ≈ coneScale × alpha(=roughness²) × 行程。
 *                   **按 alpha 不按 roughness** —— 按 roughness 会把 0.1 的地板
 *                   当 1.0 的锥角糊，湿地上的倒影直接变成一团。
 *   edgeFade        屏幕边缘淡出带宽（uv）。命中点越靠边置信度越低。
 *   normalBias      射线起点沿法线推出去的距离（米），防自交。
 *   temporalWeight  时域累积里当前帧的最小权重（静止时）。
 *   temporalMaxWeight 快动时抬到的权重上限（对着 40 px/帧标定，与 TAA 同口径）。
 *   varianceClip    邻域方差裁剪的 sigma 倍数（YCoCg）。
 *   strength        出厂强度。画质面板那根滑杆按倍率乘它。
 *
 * ## 为什么 SSR 不用共享 HZB（`ctx.hzb`）而自己再建一条
 * 共享 HZB 是 **max-reduce**（每一级取 2×2 的最远视深，天空记 camera.far）——
 * 那是遮挡剔除的语义。Hi-Z 追踪要的是反过来的东西：**一格里最近的那个面**。
 * 只有「射线当前深度 < 格内最近面」才能安全地整格跳过；拿 max 去判会漏掉
 * 格子里所有比最远面近的几何，反射直接穿墙。所以本模块自己建一条
 * min-reduce 链（六级，半分辨率起步，~3 MB@1440p，实测 0.05 ms）。
 * **将来的合并方案**：共享 HZB 是 RGBA16F 且四通道同值，把 min 塞进 .g 是
 * 零显存零带宽的事 —— 那一步归预通道的所有者做，做完本模块删掉自己这条链即可。
 */
export const SSR = {
  maxRoughness: 0.60,
  roughnessFadeAt: 0.45,
  thickness: 0.32,
  thicknessSlope: 0.020,
  refineSteps: 4,
  hizLevels: 6,
  colorLods: 4,
  coneScale: 2.0,
  edgeFade: 0.12,
  normalBias: 0.02,
  temporalWeight: 0.08,
  temporalMaxWeight: 0.50,
  varianceClip: 1.25,
  strength: 1.0,
};
