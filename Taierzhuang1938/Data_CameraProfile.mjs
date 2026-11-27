// 《台儿庄：血战滕县》统一相机后处理档案（Unity Camera Profile 口径，纯数据、零 three 依赖 —— 契约 2）。
//
// 全项目（游戏正片、标题菜单指挥室、独立单视口看效果工具、多视口/编辑器视口）只存在以下两套固化档案，
// 禁止在业务代码、昼夜预设或玩家设置里各自拼装或漂移后处理参数：
//   1. `standard`   —— 唯一完整后处理档案（以第一关白天 `firstLevelBattleDay` 固化为准）。
//                      供游戏运行时、标题菜单指挥室与所有单视口视觉验收/预览工具使用；
//                      昼夜切换（白天 / 黄昏 / 晚上）只改天空、光照与雾，不再改动后处理；
//                      运行期仅允许局部修改 `dof` / `nearDof`（景深）、`volumetrics` / `fog`（体积雾与雾）
//                      以及瞬态玩法生理反馈（受伤 / 震荡 / 闭眼 / 黑场 / 压制）。
//   2. `editorLite` —— 简易后处理档案（无 PostPipeline、无 Bloom / TAA / LensFlare / 3D LUT / AutoExposure /
//                      Grain / Vignette，仅保留 Three.js 默认 ACESFilmicToneMapping + 固化曝光与 sRGB 输出）。
//                      专供多视口与编辑器向视口使用（EncounterPlay 观察视口、MotionCompare 双视口、
//                      SceneEditor 编辑视口、SquadSplinePreview、LevelFlow 多视口）。
//
// 规范出处：Taierzhuang1938/AGENTS.md 契约 12 与 docs/Data_TechRenderPipeline.md「CameraProfile 固化规范」。

export const CAMERA_PROFILE_SCHEMA = "tengxian-camera-profile/1";

/** 运行期允许由玩法或场景局部覆盖的通道白名单（其余视觉后处理参数一律冻结在档案里）。 */
export const CAMERA_PROFILE_RUNTIME_OVERRIDES = Object.freeze([
  "dof",
  "nearDof",
  "volumetrics",
  "fog",
  "gameplay",
]);

/**
 * 已从玩家画质设置面板收口并冻结的后处理/相机键清单。
 * `LoadSavedGraphics` 读旧存档（localStorage["tengxian1938_graphics_v1"]）时一律忽略这些键，
 * 防止旧玩家偏好悄悄覆盖固化 CameraProfile。
 */
export const CAMERA_PROFILE_FROZEN_SETTINGS_KEYS = Object.freeze([
  "ssao",
  "ssil",
  "bloom",
  "god",
  "godEnabled",
  "motionBlur",
  "grain",
  "grainSize",
  "vignette",
  "taa",
  "taaCurrentWeight",
  "taaJitterScale",
  "sharpen",
  "autoExposure",
  "exposureCompensation",
  "localTonemap",
  "lut",
  "filmLook",
  "filmOptics",
  "bloomKaris",
  "tonemap",
  "lensFlare",
  "lensDirt",
  "dither",
]);

/** 两套固化相机档案（纯 JSON 可序列化冻结数据）。 */
export const CAMERA_PROFILES = Object.freeze({
  standard: Object.freeze({
    id: "standard",
    label: "标准相机档案（白天固化基线）",
    pipeline: "post",
    skyPreset: "firstLevelBattleDay",
    exposure: 0.78,
    exposureCompensationEv: 0,
    tonemap: "aces",
    autoExposure: true,
    localTonemap: true,
    purkinje: 0.22,
    lut: true,
    filmLook: "cod14",
    filmOptics: true,
    taa: true,
    taaCurrentWeight: 0.04,
    taaJitterScale: 1,
    sharpen: 0.50,
    dither: 0.75,
    bloom: Object.freeze({
      strength: 0.04,
      threshold: 1.18,
      levels: 6,
      karis: true,
      exposureTracking: true,
      fogAware: true,
      veilingScatter: 0.008,
      wideTailGain: 1.0,
    }),
    godRays: Object.freeze({
      enabled: false,
      strength: 0,
    }),
    lensFlare: Object.freeze({
      enabled: true,
      strength: 0,
      userScale: 1,
      dirtScale: 1,
      adsScale: 0.30,
      byQualityScale: 0.55,
    }),
    grade: Object.freeze({
      saturation: 0.92,
      contrast: 1.10,
      contrastCurve: "soft",
      lift: Object.freeze([0, 0, 0]),
      gain: Object.freeze([1.02, 1.0, 0.965]),
      shadowTint: Object.freeze([0.93, 0.98, 1.08]),
      highlightTint: Object.freeze([1.105, 1.015, 0.880]),
      shadow: 0.3,
      highlight: 0.25,
    }),
    grain: Object.freeze({
      strength: 0.0055,
      size: 1,
      mode: 1,
    }),
    vignette: 0.42,
    aberration: 0.0022,
    motionBlur: 1,
    motionBlurTaps: 12,
    motionBlurScale: 1.0,
    ao: Object.freeze({
      ssaoStrength: 0.80,
      ssilStrength: 0.70,
    }),
    dof: Object.freeze({
      enabled: true,
      focus: 1.5,
      range: 2.8,
      maxPx: 11.0,
      nearFocus: 1.60,
      nearRange: 0.85,
      nearMaxPx: 4.5,
      adsStrength: 0.72,
    }),
    /** 棚拍/独立预览工具无场景雾时的中性兜底（零雾）。 */
    neutralFog: Object.freeze({
      density: 0,
      falloff: 45,
      base: 0,
      max: 0,
      sky: Object.freeze([0.60, 0.60, 0.59]),
      ground: Object.freeze([0.45, 0.43, 0.40]),
      sunGain: 0.08,
      desat: 0,
      flatten: 0,
    }),
    defaultSunDirection: Object.freeze([0.352, 0.788, 0.505]),
    defaultSunColor: Object.freeze([1.0, 0.97, 0.91]),
  }),

  editorLite: Object.freeze({
    id: "editorLite",
    label: "编辑器简易相机档案（纯 ACESFilmic）",
    pipeline: "three",
    toneMapping: "ACESFilmicToneMapping",
    /** 与 standard 白天曝光 0.78 逐系数对齐：Three.js ACESFilmicToneMapping 内部先乘 1/0.6，故乘 0.6。 */
    exposure: 0.78,
    threeAcesExposureScale: 0.6,
    toneMappingExposure: 0.468,
    outputColorSpace: "srgb",
    bloom: false,
    taa: false,
    lensFlare: false,
    lut: false,
    autoExposure: false,
    grain: false,
    vignette: false,
  }),
});

export default {
  CAMERA_PROFILE_SCHEMA,
  CAMERA_PROFILE_RUNTIME_OVERRIDES,
  CAMERA_PROFILE_FROZEN_SETTINGS_KEYS,
  CAMERA_PROFILES,
};
