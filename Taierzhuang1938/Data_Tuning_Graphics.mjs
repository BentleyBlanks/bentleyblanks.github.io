// 《台儿庄：血战滕县》画质档位表（纯数据，零 three 依赖 —— 契约 2）。
//
// **口径文档：`docs/Data_TechRenderPipeline.md` §1.10「Data_Tuning_Graphics 结构」**
// （这张表在帧图里的角色），分档实测与自动降档在 §17，逐子系统的档位表在各自那一章
// （§2 大气 / §4 SSR / §5 GTAO / §6 阴影 / §7 材质 / §8 体积雾 / §9 TAAU / §10 曝光 /
// §15 簇光）。**加一个 pass 先在这里加一位开关（四档都要给值），再去 §1.11 走登记路。**
// 跨系统契约见项目 AGENTS.md 第 12 条。
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
//        档位口径见 §「SSR 分档」注释与 docs/Data_TechRenderPipeline.md §4
//        「屏幕空间反射」一章；不随天光预设变。
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
//        docs/Data_TechRenderPipeline.md §5「GTAO / SSIL / 镜面遮蔽」的实测表。
//   · csm / contactShadows —— 2026-09 阴影子系统落地：
//        csm 四档全开（级数、图尺寸、分割、节流、PCSS 抽样数在
//        `Data_Tuning_Shadows.SHADOW_PRESETS`，这里只是「跑不跑」的总闸）；
//        contactShadows 只 medium 及以上（low 档一张半分辨率 12 步 raymarch
//        在集显上不值那个钱，而且 low 的阴影本来就只铺 70 m）。
//   · pom / pomRefine / pomSelfShadow / detailNormal / microShadow /
//     horizonOcclusion / skinSss / materialTexture —— 2026-09 材质着色升级
//     （子系统 B7）。数值背书见 `docs/Data_TechRenderPipeline.md` §7.3 起的
//     「材质着色升级（2026-09）」与 `Data_Tuning_Materials.mjs`。
//     POM 的步数是**编译期常量**（进 cache key），运行时只能整档开关。
//   · autoExposure / lensFlare / lut —— 2026-09 相机曝光轮（子系统 B6a）落地，
//        见下面各自的注释。相机侧的数值口径（测光、EV 钳位、光晕强度、LUT 尺寸）
//        在 `Data_Tuning_Camera.mjs`；这里只有「哪一档跑不跑」。
//   · 其余键（dof / taaUpscale）
//     —— **本阶段全部为占位**，值 = 与今天等价（即「不启用新东西」）。
//        对应子系统落地时把自己那一位改成实际档位，并在这里补出处注释。
//
// ## 2026-09-08 分档定稿的实测（口径与全表见 docs §17）
// 3394×1348 输出、`?shot=1&phase=2&scale=small`、RTX 4070 SUPER / ANGLE-D3D11，
// 一次 TIME_ELAPSED 罩 21 帧（级联 bakeOrder 七帧一轮，批长必须是 7 的倍数）、
// 多轮取 min、`dt = 0` 把世界钉住：
//
//   low 11.31 ms（内部 2885×1146） / medium 11.47（2546×1011） /
//   high 11.48（2715×1078） / ultra 17.27（3394×1348） /
//   high+探针体 GI 12.81 —— **大修前基线 13.85（满分辨率）**
//
// **三档的下界压在同一个 ~11.4 ms 上**：像素数差 47%、功能差一整套，整帧却分不出来。
// 同一行的 `submit`（主线程提交一帧）是 11.7–15.9 ms —— 这一帧是 **CPU 提交受限**的
// （约 790 次 draw），GPU 在一帧内有空转。**推论：renderScale / AO 切片 / SSR 步数 /
// 体积雾网格这些像素旋钮在这台机器的这一关上买不到时间**；下一笔要省的是 draw call。
// 本轮据此只动了两处：high/medium 的 PCSS 抽样数（见 Data_Tuning_Shadows）与
// low 的 renderScale（它没有 TAAU，1.0 让它比 high 还多画像素）。
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
 *   clusteredLights 簇状多光源：视锥切簇 + CPU 每帧建簇表 + 材质补丁里的局部光循环。
 *                   medium 32 盏 / high 64 盏 / ultra 128 盏；low 仍是固定预算的
 *                   PointLight 池。网格与预算见 Data_Tuning_Lights.CLUSTER_TIERS
 *   ——— 2026-09 相机曝光轮 B6a（数值口径在 Data_Tuning_Camera.mjs）———
 *   autoExposure  直方图自动曝光（Script_PostExposure；四趟极小的 pass + 一张 1×1）
 *   lensFlare     镜头光晕 / 脏污 / 太阳眩光（Script_PostLensFlare；1/4 分辨率一趟）
 *   lut           3D LUT 分级（Script_PostGrade 把既有分级数学原样烘成 64³）
 *   ——— TAAU / 运动模糊 / 景深 B6b（2026-09 落地，Data_Tuning_TemporalDof 管算法口径）———
 *   taaUpscale    TAA 超分（TAAU）。开着且内部分辨率 ≠ 输出分辨率时，TAA 解算到输出网格
 *   renderScale   **该档的默认内部分辨率比例**（Script_Main 的 graphics.renderScale 出厂值）。
 *                 2026-09-08 集成期实测（3394×1348 输出 / high / phase=2，14 轮 A/B 交替、
 *                 逐轮配对差取中位数）：内部 0.8 相对 1.0 **省 3.76 ms GPU（−24.2%）**，
 *                 IQR [2.48, 5.09]、14 轮只有 1 轮负号。TAAU 把画面解算回满分辨率，
 *                 画质代价约 3 dB PSNR（见 docs §9.9 的 TAAU 表），所以 high 保持 0.8。
 *                 重量的规矩：**输出分辨率必须钉死、只动内部**，并在每次 SetSize
 *                 之后推 24 帧滚满 TAA 历史 —— 两组一起缩量到的是别的东西。
 *   motionBlurTaps  运动模糊的重建抽样数（0 = 不建 pass 也没意义，配合 motionBlur 用）
 *   motionBlurScale 重建靶相对输出分辨率的比例（0.5 = 半分辨率 + 按模糊长度回填全分辨率）
 *   dof           散景景深（阵亡远景虚化 + 开镜近景虚化两条用法共用）
 *   dofScale      景深靶相对「输出的一半」再乘一档（1.0 = 半分辨率，0.5 = 四分之一）
 * @typedef {Record<string, boolean|number>} QualityPreset
 */

/** 后续子系统的占位位。四档共用同一份「等价于今天」的取值。 */
const RESERVED_OFF = {
  // 八个子系统全部落地之后这张表空了 —— 每一位都在各档里给了实际值。
  // 留着它是为了「加一个 pass 先在这里加一位占位」那条流程还有落脚点。
};

/**
 * 相机曝光轮的三位（2026-09）。
 *
 *   autoExposure —— low 不开：四趟小 pass 加起来实测 ~0.09 ms（RTX 4070 SUPER
 *     1440p），对集显不是零；而 low 档的定位就是「能跑」。medium 及以上开。
 *     **打开不改变默认机位的亮度**：增益是相对锚点的（gain = 2^(evCal − evNow)），
 *     站在**每一关出生机位**的标定值上精确等于 1.0
 *     （口径见 Data_Tuning_Camera 抬头与 EXPOSURE_ANCHORS）。
 *   lensFlare —— 只在 high / ultra。它是加进来的光，不是省下来的；
 *     强度按档在 Data_Tuning_Camera.LENS_FLARE.byQuality 里（low/medium 是 0，
 *     所以就算这一位被打开也不出画）。
 *   lut —— 四档全开。查一次三线性表比原来那套「两次 sRGB 幂 + 两次 pow 权重」
 *     更便宜，而且分级从此是数据。与旧算式的差在灰阶与彩阶上实测 ≤ 1/255
 *     （回归口：Script_ExposureTest 的 LUT 一致性断言）。
 *
 * 三位**全部关掉时，合成输出逐比特等于 2026-09 帧图重构后的版本** ——
 * 这是本轮的硬约束（用户对画面明暗极敏感，历史事故「画面为什么这么黑」）。
 */
const CAMERA_OFF = { autoExposure: false, lensFlare: false, lut: true };
const CAMERA_ON = { autoExposure: true, lensFlare: false, lut: true };
const CAMERA_FULL = { autoExposure: true, lensFlare: true, lut: true };

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
    ...CAMERA_OFF,
    ssao: false, gtao: "low", ssil: false,
    bloomLevels: 4, godrays: false, msaa: 0, motionBlur: false,
    aoScale: 0.5, sharpen: 0.14, taa: false,
    velocity: true, hzb: true, atmosphere: true,
    // TAA 关着就没有 TAAU，末趟做一次双线性放大。0.85 是 docs §17.5「自动降档」
    // 那一段为低配档写死的那个数（「集显同时把 setPixelRatio(1) 并允许 0.85×
    // 内部分辨率 + FXAA 拉回来」）。2026-09-08 分档定稿把它从 1.0 落到 0.85：
    // low 出厂**没有** TAAU，1.0 意味着这一档反而在比 high（0.8）更多的像素上
    // 跑主场景 —— 实测 3394×1348 下 low 与 high 的整帧 GPU 几乎持平，
    // 这不是「能跑」该有的样子。抗锯齿仍由 FXAA + CAS 承担。
    taaUpscale: false, renderScale: 0.85,
    motionBlurTaps: 0, motionBlurScale: 1.0, dof: false, dofScale: 0.5,
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
    // low 的定位是「能跑」：POM 与细节法线整个不编（省的是采样数与寄存器，
    // 不是一两个 uniform）。微阴影与地平线遮蔽留着 —— 它们各只有几条算术，
    // 却是「表面不像塑料贴纸」里最便宜的两条。
    pom: 0, pomRefine: 0, pomSelfShadow: false, detailNormal: false,
    microShadow: true, horizonOcclusion: true, skinSss: false,
    materialTexture: 256,
  },
  medium: {
    ...RESERVED_OFF,
    ...CAMERA_ON,
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
    pom: 8, pomRefine: 4, pomSelfShadow: false, detailNormal: true,
    microShadow: true, horizonOcclusion: true, skinSss: true,
    materialTexture: 512,
    // 2026-09-08 分档定稿复核：**保持 0.75**。试过 0.70，但这一轮的实测说明
    // 3394×1348 下整帧根本不是像素受限（见 docs §17.2 的分档表：四档的下界都压在
    // 同一个 ~11.4 ms 上，而 CPU 提交是 12–16 ms），压内部分辨率买不到时间、
    // 只买到更软的画面。真要在 medium 上再省，省的是 draw call 不是像素。
    taaUpscale: true, renderScale: 0.75,
    motionBlurTaps: 8, motionBlurScale: 0.5, dof: true, dofScale: 0.5,
  },
  // high 的抗锯齿由 TAA 承担。超宽屏再给 RGBA16F 主靶叠 4×MSAA 会多占
  // 上百 MB 显存并重复抗锯齿；把 4× 留给主动选择 ultra 的玩家
  // （ultra 是 MSAA 喂更干净的几何边给 TAA，两层叠加不冲突，只是贵）。
  high: {
    ...RESERVED_OFF,
    ...CAMERA_FULL,
    clusteredLights: true,   // 局部光预算 64 盏（Data_Tuning_Lights.CLUSTER_TIERS.high）
    ssao: true, gtao: "high", ssil: true,
    bloomLevels: 6, godrays: true, msaa: 0, motionBlur: true,
    aoScale: 0.5, sharpen: 0.22, taa: true,
    velocity: true, hzb: true, atmosphere: true,
    // high：半分辨率 48 步 + 4 抽样 ratio estimator + 时域。这一档是性能红线所在
    //（3394×1348 实测 hiz+trace+resolve+temporal 合计见 docs §4.8）。
    ssr: true, ssrScale: 0.5, ssrSteps: 48, ssrResolveTaps: 4,
    volumetrics: true,
    csm: true, contactShadows: true,
    pom: 16, pomRefine: 5, pomSelfShadow: false, detailNormal: true,
    microShadow: true, horizonOcclusion: true, skinSss: true,
    materialTexture: 512,
    // 0.8 是实测背书的（省 24.2% GPU，见上面 renderScale 那一条），不是拍的
    taaUpscale: true, renderScale: 0.8,
    motionBlurTaps: 12, motionBlurScale: 1.0, dof: true, dofScale: 0.5,
  },
  ultra: {
    ...RESERVED_OFF,
    ...CAMERA_FULL,
    clusteredLights: true,   // 局部光预算 128 盏（Data_Tuning_Lights.CLUSTER_TIERS.ultra）
    ssao: true, gtao: "ultra", ssil: true,
    bloomLevels: 6, godrays: true, msaa: 4, motionBlur: true,
    aoScale: 1.0, sharpen: 0.22, taa: true,
    velocity: true, hzb: true, atmosphere: true,
    // ultra：全分辨率追踪（不再有半分辨率上采样的边缘渗色）+ 64 步 + 8 抽样解算。
    ssr: true, ssrScale: 1.0, ssrSteps: 64, ssrResolveTaps: 8,
    volumetrics: true,
    csm: true, contactShadows: true,
    // ultra 才开 POM 自阴影：那是每像素再走 8 步高度图，砖缝里投出的细影
    // 在 1440p 上是三四个像素的事，只有主动选 ultra 的人值得为它付这一笔。
    pom: 32, pomRefine: 6, pomSelfShadow: true, detailNormal: true,
    microShadow: true, horizonOcclusion: true, skinSss: true,
    materialTexture: 1024,
    // ultra 是「内部 = 输出」，TAA 退回纯抗锯齿（TAAU 的上采样部分不生效，
    // 因为两组尺寸相等）。留 taaUpscale: true 是为了玩家手动下调分辨率时它照样接上。
    taaUpscale: true, renderScale: 1.0,
    motionBlurTaps: 16, motionBlurScale: 1.0, dof: true, dofScale: 1.0,
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
 * 自动降档（`Script_AutoQuality.mjs`）。docs §17.5 的那一条落地：
 * 滑动窗口的帧间隔中位数 >20 ms 持续 2 s 降一级、<13 ms 持续 8 s 升一级、
 * **降级后锁 30 s**（避免在临界点来回抖）。
 *
 * ## 为什么是「阶梯」不是「整档切换」
 * 换画质档要重建全部靶、重编译全场材质（POM / SSIL / 簇状光都是编译期开关），
 * 那是几百毫秒的卡顿 —— 在**已经掉帧**的时候再送一次几百毫秒的卡顿，
 * 玩家感受到的是「越卡越卡」。所以阶梯只动运行时旋钮：
 *   · `scale`          内部分辨率**倍率**（乘在玩家/档位的 renderScale 上，
 *                      不覆盖它 —— 玩家拉过的滑杆仍然是他拉的那个数）
 *   · `nearShadowBake` 允不允许「近级每帧烘」那第二张阴影图
 *                      （`Data_Tuning_Shadows` 抬头那一节）。**效果开关里第一个摘的是它** ——
 *                      第一关车厢实测它值 +163 draw / +2.09 ms（3394×1348 / high，
 *                      `Script_FirstLevelFrameProbe --strict --ablate=oneShadowBakePerFrame`），
 *                      而 `scale` 那几档只买得到像素、买不到 draw，这一帧偏偏是提交受限的。
 *                      摘掉的代价是近处会动的人在地板上的影子退回 30 Hz（会看出来一点跳），
 *                      所以放在第 3 级而不是更早 —— 见 ladder 里那条注释。
 *   · `ssr`            屏幕空间反射（`SetSsrEnabled`，运行时开关不重编译）
 *   · `contactShadows` 屏幕空间接触阴影（`preset.contactShadows`，同上）
 * 四者都是 `ApplyGraphics` 里一句话的事，没有一处会触发 `RecompileAllMaterials`。
 *
 * ## 出厂开、面板可关
 * 它是**保底**不是画质策略：出厂配置本身已经按 docs §17 的表定过，
 * 自动降档只在实际机器跑不动时才动手，并且一路只往回收 `scale`（画面变软），
 * 不动曝光、不动雾、不动阴影总闸 —— 那几样一动，画面明暗就漂了。
 */
export const AUTO_QUALITY = {
  /** 出厂开。画质面板「分辨率与阴影」组第一行可关。 */
  enabled: true,
  /** 滑动窗口的帧数（60 fps 下 1.5 秒）。docs §17.5 写的是 90。 */
  window: 90,
  /** 超过它的帧间隔当作「页面被切走 / 加载卡顿」，不进窗口（与剖析器同口径）。 */
  maxIntervalMs: 250,
  /** 中位数高于它才算「跑不动」（docs §17.5：20 ms）。 */
  downMedianMs: 20,
  /** 要连续满足多久才降一级（毫秒）。 */
  downSustainMs: 2000,
  /** 中位数低于它才算「有余量」（docs §17.5：13 ms）。升档比降档保守。 */
  upMedianMs: 13,
  /** 要连续满足多久才升一级（毫秒）。 */
  upSustainMs: 8000,
  /** 降一级之后锁多久，期间既不降也不升（docs §17.5：30 s）。 */
  lockMs: 30000,
  /**
   * 阶梯。第 0 级 = 出厂配置（倍率 1、什么都不摘）。
   * `scale` 是**乘在**当前 renderScale 上的倍率；`floor` 是绝对下限，
   * 低于它 TAAU 已经补不回来了（1440p 输出 × 0.5 = 720p 内部）。
   */
  ladder: [
    { scale: 1.00, nearShadowBake: true, ssr: true, contactShadows: true },
    { scale: 0.92, nearShadowBake: true, ssr: true, contactShadows: true },
    { scale: 0.85, nearShadowBake: true, ssr: true, contactShadows: true },
    // 第 3 级起摘掉第二张阴影烘焙。它是这条阶梯上**唯一按 draw call 计价**的一项，
    // 到这一级还没救回来的机器多半卡在提交上，压像素买不回 draw —— 所以在几个
    // 效果开关里它排第一个。
    // **不放在第 2 级**：第一关车厢在这台机器上实机就稳定落在第 2 级
    //（3394×1348、帧间隔中位数 35 ms，`Script_FirstLevelFrameProbe --live` 实测），
    // 放第 2 级等于「玩家最常待着的那一幕永远享受不到近级每帧烘」，这件事就白做了。
    { scale: 0.78, nearShadowBake: false, ssr: false, contactShadows: true },
    { scale: 0.70, nearShadowBake: false, ssr: false, contactShadows: false },
  ],
  /** 内部分辨率倍率乘完之后的绝对下限（相对输出分辨率）。 */
  floor: 0.50,
};

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
