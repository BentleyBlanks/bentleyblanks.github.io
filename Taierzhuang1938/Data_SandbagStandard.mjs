// 全项目沙袋的唯一口径（纯数据，零 three）。口径文档：docs/Data_SandbagStandard.md。
//
// 1. 模型：只用 Model_BattlefieldPack.glb 里的三件沙袋 01/02/03（ExternalProps 的
//    battlefieldSandbag01..03）。程序化椭圆袋（Script_Geo.MakeSandbag）、Model_Sandbag.glb、
//    画了袋缝的白盒块都不再用来表现沙袋；新写的沙袋一律走这里的资产表。
// 2. 贴地：最底一层按袋子自己的脚印在共享地面上多点采样，袋底（不是包围盒底）压进土里
//    `embedM`；各件的「袋底离包围盒底多高」是 GLB 实测，见 sole。
// 3. 融合：袋子材质是地形混合的接收者（Script_SandbagStandard.SandbagContactMaterial），
//    贴地那一截读同一像素的地形颜色/法线/粗糙度，没有透明贴花。

export const SANDBAG_ASSET_IDS = Object.freeze([
  "battlefieldSandbag01", "battlefieldSandbag02", "battlefieldSandbag03",
]);

/**
 * 三件的实测包围盒（米，GLB 原尺寸）与袋底高度。
 * sole = 脚印核心区（长 ±70%、宽 ±80%）逐格最低点离包围盒底的**中位数**，占包围盒高的比例。
 * 01/02 是平底；03 是一只侧躺、底面拱起的袋子，核心区袋底普遍比最低点高两成 ——
 * 只按包围盒底贴地，它在胸墙最底层会留一道 8–15 cm 的亮缝（2026-09-27 用户截图）。
 * 门禁 Script_SandbagStandardTest 从 GLB 重新量一遍，和这里不一致就红。
 */
export const SANDBAG_METRICS = Object.freeze({
  battlefieldSandbag01: Object.freeze({ width: 1.926, height: 0.426, depth: 0.866, sole: 0.0 }),
  battlefieldSandbag02: Object.freeze({ width: 2.017, height: 0.426, depth: 1.303, sole: 0.0 }),
  battlefieldSandbag03: Object.freeze({ width: 1.883, height: 0.533, depth: 0.936, sole: 0.22 }),
});

export const SANDBAG_GROUNDING = Object.freeze({
  /** 袋底压进地面的深度：盖住袋底圆角与地形三角化的起伏。 */
  embedM: 0.05,
  /** 脚印采样：3×3 网格落在半长/半宽的这个比例上（袋端收尖，最外一圈不算脚）。 */
  footprintFraction: 0.8,
  /**
   * 脚印地面取最低点，但不比中位数低超过这么多（米）。坡上、坑洼里整只袋子都压进土；
   * 横在沟沿上、一侧悬在沟里的，按沟沿那一侧落地、悬出去的一角就让它悬着 ——
   * 不把整袋往沟里拽成一只往下耷的长枕头（2026-09-27 开场南沟沿实拍）。
   */
  overhangToleranceM: 0.12,
  /** 为了贴地最多往下伸多少（米）。再深就是悬在沟里的袋子，改摆位，不靠拉长。 */
  maxDropM: 0.45,
});

/** 地形融合（接收端）。核心带宽度沿用壕沟碎石的 Data_TrenchSurface.contact.blendWidthM（预通道共用同一 mask）。 */
export const SANDBAG_CONTACT = Object.freeze({
  /** 核心带以上再往上多少米有一层浮土色（只改反照率，不改法线/粗糙度）。 */
  dustBandM: 0.12,
  /** 浮土带最多把袋面颜色往地面颜色拉多少。 */
  dustStrength: 0.35,
  /** 浮土带上沿的世界噪声幅度（米），让那条线不是一刀切。 */
  dustEdgeNoiseM: 0.08,
});

export const SANDBAG_RUN = Object.freeze({
  /** 每层往上一层里压进层距的这个比例（软袋互相压扁，不留贯通缝）。 */
  overlapFraction: 0.55,
  /** 袋长 ÷ 袋高：模型原比例约 4.5；码墙时短一些，一只只袋子才分得出来。 */
  lengthPerHeight: 2.8,
  minBagM: 0.45,
  /** 同层相邻两件在接缝处互相压进的长度。 */
  endLapM: 0.14,
});

