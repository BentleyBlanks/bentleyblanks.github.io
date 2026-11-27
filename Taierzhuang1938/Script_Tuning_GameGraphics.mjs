// Data_Tuning_GameGraphics.mjs 的配套函数（2026-11-02 从数据模块搬出来：数据模块只放能导出成 JSON 的数据，见 docs/Data_DataSources.md「数据模块只放数据」）。
//
// 2026-11-28 CameraProfile 收口：所有视觉后处理 / 相机外观参数（Bloom / TAA / AutoExposure / 3D LUT /
// FilmLook / FilmOptics / LensFlare / Vignette / Grain / Sharpen / Tonemap / Dither / SSAO / SSIL）
// 已全部移入并冻结在 `Data_CameraProfile.mjs`（CAMERA_PROFILES.standard），不再进入玩家可写 `graphics` 表；
// 本表只保留硬件性能、阴影、光照/材质细节、体积雾与内容项。

import { AUTO_QUALITY } from "./Data_Tuning_Graphics.mjs";
import { CAMERA } from "./Data_Tuning_Main.mjs";
import { FIRST_PERSON_LIGHTING } from "./Data_Tuning_FirstPersonLighting.mjs";

export function CreateGameGraphics({ profile, preset, gi = false, gore = true }) {
  return {
    profile,
    renderScale: preset.renderScale ?? 1.0,
    // 自动降档总闸（docs §13）。出厂开；面板可关，关掉时阶梯立刻收回第 0 级。
    autoQuality: AUTO_QUALITY.enabled !== false,
    shadows: true,
    shadowSize: 0,          // 0 = 用出厂档位（级联之后这是**每一级**的图边长）
    contactShadows: !!preset.contactShadows,
    // 独立小阴影图，只在第一人称手臂/武器材质内部采样；仍服从上面的阴影总闸。
    firstPersonSelfShadow: true,
    // Contact-hardening viewmodel shadows, with the lower-cost path for low.
    firstPersonSelfShadowSoft: FIRST_PERSON_LIGHTING.shadow.softDefaultByProfile[profile] ?? true,
    // 第一人称取光（2026-11-02，背光枪发黑；Data_Tuning_FirstPersonLighting）。
    firstPersonEyeSun: true,
    firstPersonReflection: true,
    // 武器补光（环境系统 WeaponLight 组件给强度）：关掉 = 强度归零，对照用
    firstPersonWeaponLight: true,
    // 屏幕空间反射：布尔总闸 + 强度倍率。出厂跟画质档走（medium 及以上开）。
    ssr: !!preset.ssr,
    ssrStrength: 1,
    // 水面画质档（low / medium / high / ultra）。编辑器模式强制锁最低档（low），试玩/正式游玩按此档渲染。
    waterQuality: preset.water || "high",
    // froxel 体积雾 / 体积光（运行期允许局部开关，不在 CameraProfile 冻结项内）。
    volumetrics: !!preset.volumetrics,
    // 实时探针体默认关。默认间接光由 Global SH Probe + AmbientColor 提供。
    gi,
    giStrength: 1,
    // 簇状前向光照（局部光源）。
    clusteredLights: true,
    // 英雄光的立方体阴影：整城几何要多画六遍，出厂关。
    clusterHeroShadow: false,
    // 物理大气（Hillaire 2020 四张 LUT）。烟霾倍率 atmosphereHaze 由 NormalizeGraphicsDetails 补。
    atmosphere: preset.atmosphere !== false,
    // 材质着色升级（子系统 B7）。布尔位是编译期开关，Strength / Depth 是运行时倍率。
    pom: (preset.pom || 0) > 0,
    pomSelfShadow: !!preset.pomSelfShadow,
    detailNormal: !!preset.detailNormal,
    microShadow: !!preset.microShadow,
    horizonOcclusion: !!preset.horizonOcclusion,
    skinSss: !!preset.skinSss,
    pomDepth: 1,
    detailNormalStrength: 1,
    microShadowStrength: 1,
    horizonStrength: 1,
    skinStrength: 1,
    pomSelfShadowStrength: 1,
    fov: CAMERA.baseFovDeg,
    // 断肢表现（docs/Data_Dismemberment.md §1）：内容项。
    gore,
  };
}
