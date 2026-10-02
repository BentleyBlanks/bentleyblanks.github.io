// Default presentation profile. Pure data/rules; see docs/Data_WhiteboxQuality.md.
export const DEFAULT_GRAPHICS_PROFILE = "whitebox";
export const GRAPHICS_PROFILES = ["whitebox", "low", "medium", "high", "ultra"];
export const WHITEBOX_STORAGE_KEY = "tengxian1938_whitebox_v1";
export const GRAPHICS_PROFILE_STORAGE_KEY = "tengxian1938_graphics_profile_v1";

// These controls are shared by the editor, agent API and validation. A new visual
// feature stays off until explicitly listed here and admitted by the pass policy.
export const WHITEBOX_CONTROLS = [
  ["terrainTextures", "保留地形贴图", "材质与场景", true],
  ["characterTextures", "保留人物、敌军与手持装备贴图", "材质与场景", true],
  ["assetTextures", "恢复场景资产材质与贴图", "材质与场景", false],
  ["cardTextures", "镂空卡片（植被、草）保留原贴图色（略去饱和；关闭 = 统一表面色，亮灰剪影）", "材质与场景", true],
  ["grid", "场景灰盒网格", "材质与场景", true],
  ["sceneLighting", "关卡灯光（关闭时用中性基础光）", "材质与场景", false],
  ["sky", "天空与云层", "材质与场景", false],
  ["effects", "粒子、烟火与贴花", "材质与场景", false],
  ["environment", "环境贴图 / IBL", "材质与场景", false],
  ["materialShading", "POM / 细节法线 / 皮肤散射", "材质与场景", false],
  // 2026-10-02 用户定：白盒也要太阳影子。中性光照旧，借关卡太阳的级联灯投影（Script_WhiteboxRendering._LightingMode）。
  ["shadows", "太阳级联阴影 CSM（中性光下投关卡太阳的影子）", "光照 Feature", true],
  ["firstPersonShadow", "第一人称自阴影", "光照 Feature", false],
  ["clusteredLights", "簇状局部光", "光照 Feature", false],
  ["gi", "实时探针 GI", "光照 Feature", false],
  ["ssao", "GTAO 环境光遮蔽", "渲染 Pass", false],
  ["ssil", "屏幕空间间接光 SSIL", "渲染 Pass", false],
  ["ssr", "屏幕空间反射 SSR", "渲染 Pass", false],
  ["contactShadows", "接触阴影", "渲染 Pass", false],
  ["interiorSky", "室内天光遮蔽", "渲染 Pass", false],
  ["terrainBlend", "地形接触融合", "渲染 Pass", false],
  // 地面脚印与履带痕迹（docs/Data_TerrainTrails.md）。照白盒契约默认关；「编辑白盒画质」里可单独打开。
  ["terrainTrails", "地面脚印与痕迹", "渲染 Pass", false],
  ["atmosphere", "物理大气 LUT", "渲染 Pass", false],
  ["volumetrics", "体积雾 / 体积光", "渲染 Pass", false],
  ["taa", "TAA 时域抗锯齿", "渲染 Pass", false],
  ["fxaa", "FXAA 抗锯齿", "渲染 Pass", false],
  ["bloom", "泛光 Bloom", "渲染 Pass", false],
  ["godrays", "屏幕空间太阳光束（体积雾关闭时）", "渲染 Pass", false],
  ["motionBlur", "运动模糊", "渲染 Pass", false],
  ["dof", "景深", "渲染 Pass", false],
  ["autoExposure", "自动曝光", "渲染 Pass", false],
  ["lensFlare", "镜头光晕 / 脏污", "渲染 Pass", false],
  ["grading", "调色 / LUT / 胶片颗粒 / 暗角", "渲染 Pass", false],
  ["fog", "解析距离雾", "渲染 Pass", false],
];
export const WHITEBOX_DEFAULTS = Object.freeze({
  ...Object.fromEntries(WHITEBOX_CONTROLS.map(([key, , , value]) => [key, value])),
  surfaceColor: "#909397", gridColor: "#55585d", gridSize: 1, gridLineWidth: 0.012,
  backgroundColor: "#adb8c2", renderScale: 1,
  // 存档口径版本：2 = shadows 默认开。之前的存档把每个默认值都写了出去，存着的 shadows:false
  // 分不清是旧默认还是玩家关的，LoadWhiteboxConfig 按旧默认迁移。
  schema: 2,
});
// 2026-09-30 白盒水面约定：白盒画质下水面不再画成灰色米制网格（读起来是一条灰公路），
// 而是固定的蓝灰水色 + 掠射角天空色反光（菲涅耳）+ 一点太阳高光（粗糙度低）。不是可编辑项，
// 也不画网格；水面判定 = 网格名含 water（Script_FirstLevelWhiteboxLooks.BuildWhiteboxWater 的 FirstLevelWhitebox_Water）。
export const WHITEBOX_WATER = Object.freeze({ color: "#4d6f86", sheen: "#c4d6e2", sheenStrength: 0.85,
  sheenPower: 3, sheenMax: 0.72, roughness: 0.14, metalness: 0 });
// 2026-10-01 镂空卡片（植被十字面片、壕沟草）白盒着色（集成者验收：默认画质下 18_2 的芦苇 / 草是满地白色尖刺）：
// 表面色 #909397 被白盒的中性光（ambient 1.8 + sun 1.4）照成近白，草叶剪影在深色泥地上像一地白刺。改成保留卡片原贴图的颜色，
// 按 desaturate 略去饱和（0 = 原色，1 = 灰）再乘 brightness（中性光下的提亮折算）；没有颜色贴图、只有 alphaMap 的卡片统一成
// fallbackColor（暗橄榄枯黄）。alpha 裁切照旧；卡片上不再叠米制灰网格（网格线画在草叶上只是噪点）。
// 开关：WHITEBOX_CONTROLS.cardTextures（默认开；关 = 回到 2026-09-30 的统一表面色卡片）。缓存键 whiteboxCard2。
export const WHITEBOX_CARDS = Object.freeze({ desaturate: 0.4, brightness: 0.5, fallbackColor: "#7a7547" });
// shadowAmbient / shadowSun：开太阳阴影时的中性光（2026-10-02）。原来那组环境光比太阳还亮，影子只比受光面暗约四成、
// 读不出来；换成这组后受光地面亮度基本不变（太阳高度约 52° 时 3.07 对 2.96），影子处约为受光面的 41%。
export const WHITEBOX_LIGHTING = Object.freeze({ ambient: 1.8, sun: 1.4, direction: [40, 70, 25],
  shadowAmbient: 1.25, shadowSun: 2.3 });

export function NormalizeWhiteboxConfig(value = {}) {
  const config = { ...WHITEBOX_DEFAULTS };
  if (!value || typeof value !== "object") return config;
  for (const [key] of WHITEBOX_CONTROLS) if (typeof value[key] === "boolean") config[key] = value[key];
  for (const key of ["surfaceColor", "gridColor", "backgroundColor"]) {
    if (typeof value[key] === "string" && /^#[\da-f]{6}$/i.test(value[key])) config[key] = value[key];
  }
  if (Number.isFinite(value.renderScale)) config.renderScale = Math.min(1.6, Math.max(0.4, value.renderScale));
  if (Number.isFinite(value.gridSize)) config.gridSize = Math.min(10, Math.max(0.1, value.gridSize));
  if (Number.isFinite(value.gridLineWidth)) config.gridLineWidth = Math.min(0.05, Math.max(0.002, value.gridLineWidth));
  return config;
}

export function ResolveGraphicsProfile(requested, saved) {
  return GRAPHICS_PROFILES.includes(requested) ? requested
    : GRAPHICS_PROFILES.includes(saved) ? saved : DEFAULT_GRAPHICS_PROFILE;
}

// Explicit allow-list. Unregistered future passes cannot silently enter whitebox.
export function WhiteboxPassPlan(value) {
  const c = NormalizeWhiteboxConfig(value);
  const passes = new Set(["main", "wireframe", "debugOverlay"]);
  const Add = (...names) => names.forEach((name) => passes.add(name));
  if (c.terrainBlend) Add("terrainBlend");
  if (c.terrainTrails) Add("terrainTrails");
  if (c.ssao || c.ssil || c.interiorSky) Add("gtao");
  if (c.ssil) Add("ssilHistory");
  if (c.ssr) Add("ssr", "ssrColor", "hzb");
  if (c.contactShadows) Add("contactShadows");
  if (c.interiorSky) Add("interiorSky");
  if (c.atmosphere) Add("atmosphere");
  if (c.volumetrics) Add("volumetricInject", "volumetricIntegrate", "volumetricApply");
  if (c.taa) Add("taa");
  if (c.motionBlur) Add("motionBlur");
  if (c.dof) Add("dof");
  if (c.autoExposure) Add("exposure");
  const godrays = c.godrays && !c.volumetrics;
  if (c.bloom || c.lensFlare || godrays) Add("bloom");
  if (godrays) Add("godPrepare", "god");
  if (c.lensFlare) Add("lensFlare");
  const composite = c.bloom || c.lensFlare || godrays || c.autoExposure || c.grading || c.fog || c.volumetrics;
  if (composite) Add("composite", "fxaa");
  else Add("whiteboxOutput");
  if (c.fxaa) Add("fxaa");
  if (c.ssao || c.ssil || c.ssr || c.contactShadows || c.interiorSky || c.volumetrics
    || c.taa || c.motionBlur || c.dof || c.fog || godrays) Add("prepass");
  return [...passes];
}

export function WhiteboxGraphicsOverrides(value) {
  const c = NormalizeWhiteboxConfig(value);
  return {
    renderScale: c.renderScale, autoQuality: false, shadows: c.shadows || c.contactShadows || c.firstPersonShadow,
    firstPersonSelfShadow: c.firstPersonShadow, firstPersonSelfShadowSoft: false,
    ssao: c.ssao || c.ssil || c.interiorSky ? 1 : 0, ssil: c.ssil ? 1 : 0, ssr: c.ssr,
    gi: c.gi, clusteredLights: c.clusteredLights, clusterHeroShadow: false,
    contactShadows: c.contactShadows, atmosphere: c.atmosphere, volumetrics: c.volumetrics,
    taa: c.taa, sharpen: 0, bloom: c.bloom ? 1 : 0, god: c.godrays ? 1 : 0, godEnabled: c.godrays && !c.volumetrics,
    motionBlur: c.motionBlur ? 1 : 0, autoExposure: c.autoExposure, lut: c.grading,
    grain: c.grading ? 1 : 0, vignette: c.grading ? 1 : 0,
    lensFlare: c.lensFlare ? 1 : 0, lensDirt: c.lensFlare ? 1 : 0,
    pom: c.materialShading, pomSelfShadow: c.materialShading, detailNormal: c.materialShading,
    microShadow: c.materialShading, horizonOcclusion: c.materialShading, skinSss: c.materialShading,
  };
}

export function WhiteboxPostOptions(config, options) {
  if (!config) return options;
  return {
    ...options, aberration: 0, radialBlur: 0, sideDaze: null, concussion: null, bloodEdge: null,
    hitDisorientation: 0, motionBlur: config.motionBlur ? options.motionBlur : 0,
    dofStrength: config.dof ? options.dofStrength : 0, nearDofStrength: config.dof ? options.nearDofStrength : 0,
    exposure: config.autoExposure || config.grading ? options.exposure : 1,
    fog: config.fog || config.volumetrics ? options.fog : { density: 0, max: 0, desat: 0, flatten: 0 },
    ...(config.grading ? {} : {
      saturation: 1, contrast: 1, grain: 0, vignette: 0,
      grade: { lift: [0, 0, 0], gain: [1, 1, 1], shadowTint: [1, 1, 1], highlightTint: [1, 1, 1], shadow: 0, highlight: 0 },
    }),
  };
}

// Construction flags save the large history/SSR/DoF targets as well as gating
// execution. One neutral bloom level remains for existing composite/debug APIs.
export function MakeWhiteboxQualityPreset(base, config) {
  const c = NormalizeWhiteboxConfig(config);
  return {
    ...base, ssao: c.ssao || c.ssil || c.interiorSky, ssil: c.ssil, ssr: c.ssr,
    velocity: c.taa || c.ssr || c.motionBlur, hzb: c.ssr, terrainBlend: c.terrainBlend,
    terrainTrails: c.terrainTrails ? base.terrainTrails : false,
    taa: c.taa, taaUpscale: c.taa, msaa: 0, sharpen: 0, renderScale: c.renderScale,
    volumetrics: c.volumetrics, atmosphere: c.atmosphere, csm: c.shadows,
    contactShadows: c.contactShadows, clusteredLights: c.clusteredLights,
    bloomLevels: c.bloom || c.lensFlare || c.godrays ? base.bloomLevels : 1, godrays: c.godrays && !c.volumetrics,
    motionBlur: c.motionBlur, dof: c.dof, autoExposure: c.autoExposure,
    lensFlare: c.lensFlare, lut: c.grading,
    pom: c.materialShading ? base.pom : 0, pomRefine: c.materialShading ? base.pomRefine : 0,
    pomSelfShadow: c.materialShading, detailNormal: c.materialShading,
    microShadow: c.materialShading, horizonOcclusion: c.materialShading, skinSss: c.materialShading,
  };
}
