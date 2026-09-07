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
//   · autoExposure / lensFlare / lut —— 2026-09 相机曝光轮落地，见下面各自的注释。
//        相机侧的数值口径（测光、EV 钳位、光晕强度、LUT 尺寸）在
//        `Data_Tuning_Camera.mjs`；这里只有「哪一档跑不跑」。
//   · 其余键（csm / gtao / ssil / ssr / volumetrics / atmosphere /
//     dof / taaUpscale / clusteredLights / contactShadows）
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
 *   ssao          屏幕空间环境光遮蔽（半分辨率 + 双边模糊）
 *   aoScale       AO 靶相对主靶的边长比例
 *   bloomLevels   泛光金字塔级数
 *   godrays       屏幕空间太阳拖影（还要 options.godStrength > 0 才真跑）
 *   msaa          主 HDR 靶的多重采样数（0 = 关）
 *   motionBlur    合成 pass 里的相机运动模糊
 *   sharpen       末趟锐化强度（FXAA/TAA 之后补回边缘）
 *   taa           时域抗锯齿的**出厂默认**（运行时可经 SetTaaEnabled 热切）
 *   velocity      预通道 MRT 的 RT1 屏幕空间速度靶
 *   hzb           预通道之后建线性视深 max-reduce mip 链（HZB）
 *   ——— 以下为后续子系统的占位位，本阶段一律「等价于今天」———
 *   csm           级联阴影（今天：单张 66 m 跟随框，false）
 *   contactShadows 屏幕空间接触阴影
 *   gtao          GTAO（将来替换 ssao 那一位）
 *   ssil          屏幕空间间接光
 *   ssr           屏幕空间反射
 *   volumetrics   froxel 体积雾（今天：合成 pass 里的解析式指数高度雾）
 *   atmosphere    物理大气（今天：SkyDome 的解析式天空）
 *   dof           景深（今天恒开：阵亡与开镜两条都走 Composite 的圆盘采样）
 *   taaUpscale    TAA 超分（TAAU）
 *   clusteredLights 簇状多光源（今天：固定预算的 PointLight 池）
 *   ——— 2026-09 相机曝光轮（数值口径在 Data_Tuning_Camera.mjs）———
 *   autoExposure  直方图自动曝光（Script_PostExposure；四趟极小的 pass + 一张 1×1）
 *   lensFlare     镜头光晕 / 脏污 / 太阳眩光（Script_PostLensFlare；1/4 分辨率一趟）
 *   lut           3D LUT 分级（Script_PostGrade 把既有分级数学原样烘成 64³）
 * @typedef {Record<string, boolean|number>} QualityPreset
 */

/** 后续子系统的占位位。四档共用同一份「等价于今天」的取值。 */
const RESERVED_OFF = {
  csm: false,
  contactShadows: false,
  gtao: false,
  ssil: false,
  ssr: false,
  volumetrics: false,
  atmosphere: false,
  taaUpscale: false,
  clusteredLights: false,
  // 景深今天就在跑（阵亡远景虚化 + 开镜近景虚化），所以它不是 false。
  dof: true,
};

/**
 * 相机曝光轮的三位（2026-09）。
 *
 *   autoExposure —— low 不开：四趟小 pass 加起来实测 ~0.09 ms（RTX 4070 SUPER
 *     1440p），对集显不是零；而 low 档的定位就是「能跑」。medium 及以上开。
 *     **打开不改变默认机位的亮度**：增益是相对锚点的（gain = 2^(evCal − evNow)），
 *     站在每张时段预设的标定机位上精确等于 1.0（口径见 Data_Tuning_Camera 抬头）。
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
  low: {
    ...RESERVED_OFF,
    ...CAMERA_OFF,
    ssao: false, bloomLevels: 4, godrays: false, msaa: 0, motionBlur: false,
    aoScale: 0.5, sharpen: 0.14, taa: false,
    velocity: true, hzb: true,
  },
  medium: {
    ...RESERVED_OFF,
    ...CAMERA_ON,
    ssao: true, bloomLevels: 5, godrays: true, msaa: 0, motionBlur: true,
    aoScale: 0.6, sharpen: 0.18, taa: true,
    velocity: true, hzb: true,
  },
  // high 的抗锯齿由 TAA 承担。超宽屏再给 RGBA16F 主靶叠 4×MSAA 会多占
  // 上百 MB 显存并重复抗锯齿；把 4× 留给主动选择 ultra 的玩家
  // （ultra 是 MSAA 喂更干净的几何边给 TAA，两层叠加不冲突，只是贵）。
  high: {
    ...RESERVED_OFF,
    ...CAMERA_FULL,
    ssao: true, bloomLevels: 6, godrays: true, msaa: 0, motionBlur: true,
    aoScale: 0.75, sharpen: 0.22, taa: true,
    velocity: true, hzb: true,
  },
  ultra: {
    ...RESERVED_OFF,
    ...CAMERA_FULL,
    ssao: true, bloomLevels: 6, godrays: true, msaa: 4, motionBlur: true,
    aoScale: 1.0, sharpen: 0.22, taa: true,
    velocity: true, hzb: true,
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
