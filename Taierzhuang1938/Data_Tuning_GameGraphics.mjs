// Shared player settings defaults; usable without constructing the gameplay renderer.
import {AUTO_QUALITY} from "./Data_Tuning_Graphics.mjs";
import {CAMERA} from "./Data_Tuning_Main.mjs";
export function CreateGameGraphics({profile, preset, taaEnabled = !!preset.taa, gi = false, gore = true}) {
return {
  profile: profile,
  renderScale: preset.renderScale ?? 1.0,
  // 自动降档总闸（docs §13）。出厂开；面板可关，关掉时阶梯立刻收回第 0 级。
  // 它必须是 `graphics` 上的一位，`ApplySavedSettings` 才认得（那边只回灌
  // 已经存在于 graphics 上的键）。阶梯的级数本身**不存盘** —— 换台机器、
  // 换个窗口大小，重新量就是了。
  autoQuality: AUTO_QUALITY.enabled !== false,
  shadows: true,
  shadowSize: 0,          // 0 = 用出厂档位（级联之后这是**每一级**的图边长）
  // 独立小阴影图，只在第一人称手臂/武器材质内部采样；仍服从上面的阴影总闸。
  firstPersonSelfShadow: true,
  // 自阴影软化：2048 图 + 双线性 Poisson PCF + receiver-plane 偏置。出厂关（2026-09-05），
  // 手背上的枪托/右手投影默认仍是 1024 图硬 3×3 那块；画质面板热切。
  firstPersonSelfShadowSoft: false,
  ssao: 1, bloom: 1, god: 1, motionBlur: 1, grain: 1, vignette: 1,
  // 屏幕空间反射：布尔总闸 + 强度倍率。出厂跟画质档走（medium 及以上开），
  // 关掉不重编译材质（强度归零，材质那一行等价于「radiance 原样」）。
  ssr: !!preset.ssr, ssrStrength: 1,
  // 屏幕空间近场间接光（SSIL）的倍率。**只是强度，不是总闸** —— 位掩码那一趟
  // 与 GTAO 共用同一次地平线搜索，开不开是构造期的事（画质档的 ssil 那一位），
  // 滑到 0 只是不出效果、不省时间。low / medium 档没有它，面板那一行会自己藏起来。
  ssil: 1,
  // --- 相机曝光轮（2026-09 子系统 B6a）。出厂值跟画质档走，面板热切 ---------------------
  // autoExposure 打开**不改变默认机位的亮度**：增益锚在**每一关出生机位**
  // 实测的平均场景亮度上（Data_Tuning_Camera.EXPOSURE_ANCHORS），
  // 站在标定机位时增益精确是 1.0。
  autoExposure: preset.autoExposure !== false,
  // 曝光补偿（EV，正 = 更亮）。这是玩家能改画面明暗的唯一一根，别把它做成倍率 ——
  // 相机上就是 EV 刻度，一档就是一倍。
  exposureCompensation: 0,
  // 镜头光晕 / 脏污强度倍率（与 bloom/god 同一套约定，0 = 关）
  lensFlare: 1, lensDirt: 1,
  // 色调映射曲线："aces"（默认）/ "agx"
  tonemap: "aces",
  // 3D LUT 分级（关掉退回等价的着色器算式，画面差 ≤ 1/255）
  lut: preset.lut !== false,
  // 泛光第一级的 Karis 平均（压萤火虫）。出厂关：它会改变每一张画面。
  bloomKaris: false,
  // 输出抖动（1/255 的倍数）。出厂 0，同上。
  dither: 0,
  // 抗锯齿：TAA 开着时末趟的 FXAA 自动让位（两层叠加只会糊）。出厂值跟画质档走
  // （medium 及以上默认开），但这是**布尔开关不是倍率** —— 它不决定"画多重"，
  // 决定的是走哪条抗锯齿路，所以不套 Mul 那套倍率约定。
  taa: taaEnabled,
  // 体积光临时关停（性能观察期）：god 仍是强度倍率，godEnabled 是整个 pass 的总闸，
  // 关掉时连径向模糊那一趟都不跑。想恢复把出厂值改回 true 即可。
  // **froxel 体积雾开着时它一律不生效**（见 RenderScene 的 godStrength 那一行）：
  // 屏幕空间径向模糊与真体积光柱叠加就是双份，而且前者的拖影不认遮挡。
  godEnabled: false,
  // froxel 体积雾 / 体积光。出厂值跟画质档走（medium 及以上开，low 保留解析式高度雾），
  // 与 TAA 同一个先例：布尔开关不是倍率，所以不套 Mul 那套约定。
  volumetrics: !!preset.volumetrics,
  // 实时探针体默认关。默认间接光由 Global SH Probe + AmbientColor 提供；打开时
  // 才跑五个 GI pass/帧，并在图集收敛后渐进接管室内与墙角的反弹光。
  gi: gi, giStrength: 1,
  // 簇状前向光照（局部光源）。medium 及以上出厂开：它不是"多一层效果"，
  // 而是把动态光预算从 6 盏解到 32/64/128 盏（low 档的 CLUSTER_TIERS 是 enabled:false，
  // 打开也仍走旧的固定灯池）。运行时开关，不重编译。
  clusteredLights: true,
  // 英雄光的立方体阴影：整城几何要多画六遍，出厂关。打开会重编译一次
  // （NUM_POINT_LIGHTS 0↔1），与阴影总闸、GI 采样层同一个先例。
  clusterHeroShadow: false,
  // 物理大气（Hillaire 2020 四张 LUT）。出厂跟画质档走；关掉退回旧解析天空
  // （与 ?skyLegacy=1 等价）。烟霾倍率 atmosphereHaze 由 NormalizeGraphicsDetails 补。
  atmosphere: preset.atmosphere !== false,
  // 材质着色升级（子系统 B7）。
  // 布尔位是**编译期**的：翻一次要把全场材质重编译（几百毫秒，一次性），
  // 与阴影总闸、GI 采样层同一个先例。出厂值跟画质档走（与 taa 同款写法）——
  // 写成常量的话 low 档一进来就会给自己编上 32 步 POM。
  pom: (preset.pom || 0) > 0,
  pomSelfShadow: !!preset.pomSelfShadow,
  detailNormal: !!preset.detailNormal,
  microShadow: !!preset.microShadow,
  horizonOcclusion: !!preset.horizonOcclusion,
  skinSss: !!preset.skinSss,
  // 带 Strength / Depth 的是运行时倍率，拖了立刻生效、不重编译。
  pomDepth: 1, detailNormalStrength: 1, microShadowStrength: 1,
  horizonStrength: 1, skinStrength: 1, pomSelfShadowStrength: 1,
  fov: CAMERA.baseFovDeg,
  // 断肢表现（docs/Data_Dismemberment.md §1）。**这不是画质项，是内容项** ——
  // 它不省时间也不改画风，它决定的是玩家愿不愿意看到这个。放在 graphics 上
  // 只是为了搭 `ApplySavedSettings` 的顺风车（那边只回灌已经存在于 graphics
  // 上的键），面板里单开一节「内容」，不与阴影/后处理混在一起。
  // 出厂值读规则层的当前状态：`?gore=0` 已经在上面把它关掉了。
  gore: gore,
};
}
