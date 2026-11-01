// 第一关白盒「平色道具盒 → 现成外部模型」替换表 + 墙根碎砖瓦散布规则（纯数据 + 纯函数，零 three）。
// 口径：docs/Data_FirstLevelVegetationProps.md。运行时：Script_FirstLevelPropDressing.mjs。
//
// 【契约】只换「看起来」：
//   · 表里的块照旧登记碰撞与掩体（Script_FirstLevelWhiteboxField 的 Solid/Cover 一行不动），
//     只是那只平色盒不再画，换成按盒子尺寸摆好的外部模型；
//   · 模型的外观包围盒贴着原盒：逐轴缩放到原盒（`maxStretch` 限制压扁/拉长的比例，超了就
//     按几何平均收回），`Script_FirstLevelPropDressingTest` 逐件核对外观与碰撞盒的误差；
//   · `hide` 列的是同一件道具的附属平色件（缸沿、柴垛顶上的三根木头、草垛的中/顶两层、
//     物资箱的铁箍），一起不画，外观按它们的并集算；
//   · `tile: [nw, nh, nd]` 把一只大盒按块自身的 w/h/d 轴切成若干格，每格摆一件
//     （一整垛柴、一摞箱子），而不是把一件模型拉成三米长；
//   · 只用已登记的外部资产包（Script_ExternalProps 的 ASSETS：RuralYard / HouseholdWare /
//     ChineseLife / 市场箱 / 木箱），不新增模型。
//
// 碎砖瓦（PROP_RUBBLE）：白盒里的 RubbleStrip 散块（不实心的矮盒）不画，换成低模砖块/瓦片/
// 石块；另在残墙、倒墙脚下与弹坑边补撒。全部纯视觉、不登记碰撞，单件高 ≤ 0.25 m，
// 离路线走廊与交互点有退让。

export const PROP_DRESSING_VERSION = "first-level-prop-dressing-20260928";
/**
 * 道具与碎砖瓦按这个边长分区合批（BuildSink 分区）。道具稀疏、材质种类多（每区每材质一个 draw，还要乘预通道），
 * 192 m 一区：村子只落在一两区里。2026-09-28 同页开关实测 64 m 一区时本包在村里多出 130 多个 draw。
 */
export const PROP_DRESSING_SECTOR_M = 192;
/** 外观与原盒的允许误差：逐轴 max(相对 tolerance, 绝对 toleranceM)。 */
export const PROP_FIT_TOLERANCE = Object.freeze({ relative: 0.3, absoluteM: 0.12 });
/** 贴地：盒底离中心地面这么近就当「落在地上」，按脚印四角取最低点再压进土里 embedM。 */
export const PROP_GROUND = Object.freeze({ snapM: 0.2, embedM: 0.03 });

const Logs = (id) => [`${id}Log0`, `${id}Log1`, `${id}Log2`];
const Tiers = (id) => [`${id}Mid`, `${id}Top`];
const Rim = (id) => [`${id}Rim`];
const P = (block, asset, extra = {}) => Object.freeze({ block, asset, ...extra });
// 车轮：模型的轮毂轴向 0.54 m，白盒轮子是 0.12 m 的圆片 —— 允许把轴向压到 1/3。
const WHEEL = { maxStretch: 3.2 };
// 笸箩（0.54×0.23×0.52）拉成 0.5 m 高的圆筐；草垛（0.85×1.25×0.87）压成 2–3 m 的矮圆垛。
const BASKET = { maxStretch: 1.7 };
const STRAW = { maxStretch: 1.9 };

function Stores(id, rows) {
  const out = [];
  for (let row = 0; row < rows; row++) for (let col = 0; col < 2; col++) {
    const key = `${row}${col}`;
    out.push(P(`${id}${key}`, "crate", { hide: [`${id}Strap${key}-1`, `${id}Strap${key}1`], jitterYaw: 0.05 }));
  }
  return out;
}

// Stocked shelves replace their old solid body, protruding boards and bottle-strip placeholders
// together. The asset front is -Z; north-wall furniture faces +Z into the ward.
const WardShelfParts = (id) => [0, 1, 2].flatMap((i) => [`${id}Board${i}`, `${id}Jars${i}`]);
export const WARD_PROP_DRESSING = Object.freeze([
  P("ReceptionWardNorthCabinet", "wardMedicineCabinet", { hide: ["ReceptionWardNorthCabinetDoors"],
    // Legacy north-wall counters were left underneath the later cabinet/crate dressing.
    // Remove only their duplicate exterior; they must not enlarge the fitted cabinet.
    hideOverlaps: ["WardShelf-28", "WardMedicalRoll-28", "WardShelf-25", "WardMedicalRoll-25"], flipFacing: true }),
  P("ReceptionWardShelf", "wardStockedShelf", { hide: WardShelfParts("ReceptionWardShelf"), flipFacing: true }),
  P("ReceptionWardShelfN", "wardStockedShelf", { hide: WardShelfParts("ReceptionWardShelfN"),
    hideOverlaps: ["WardShelf-22", "WardMedicalRoll-22"], flipFacing: true }),
  P("ReceptionWardShelfB", "wardStockedShelf", { hide: WardShelfParts("ReceptionWardShelfB") }),
  P("ReceptionWardMedicineTable", "wardTreatmentTable", { flipFacing: true }),
  P("ReceptionWardLanternTable", "wardTreatmentTable"),
  P("ReceptionWardStool", "wardWoodStool"),
  P("ReceptionWardBenchW", "wardWoodBench"),
  P("ReceptionWardBenchE", "wardWoodBench"),
  P("ReceptionWardBasin", "wardEnamelBasin"),
  ...["wardAmberBottle", "wardCeramicJar", "wardGreenBottle", "wardCeramicJar"].map((asset, i) => P(`ReceptionWardMedicineJar${i}`, asset, { flipFacing: true })),
  ...["wardAmberBottle", "wardCeramicJar", "wardGreenBottle"].map((asset, i) => P(`ReceptionWardLanternTableJar${i}`, asset)),
]);

export const PROP_DRESSING = Object.freeze([
  // —— 05 前沿 / 06 集结处 / 07 交通沟 ——
  P("RightEntryCrate", "marketBox03"),
  P("SouthRoadWreckWheel0", "ryCartWheel", WHEEL),
  P("SouthRoadWreckWheel1", "ryCartWheel", WHEEL),
  P("CollectionNorthFootStack", "crate", { tile: [1, 2, 1], maxStretch: 1.6 }),
  P("CollectionWestPack0", "marketRiceSack02"),
  P("CollectionWestPack1", "marketRiceSack02"),
  P("CollectionWestPack2", "marketRiceSack02"),
  P("CollectionShedCrate0", "crate"),
  P("CollectionShedCrate1", "marketBox02"),
  P("CollectionShedCrate2", "crate"),
  P("SouthTrenchCrate", "crate", { tile: [1, 2, 1], maxStretch: 1.6 }),
  // —— 07_2 村北口 / 08 担架停靠处与主街 ——
  P("VillageMouthHaystack", "ryHayStack", { hide: Tiers("VillageMouthHaystack"), ...STRAW }),
  P("VillageMouthHaystackSmall", "ryHayStack", { hide: Tiers("VillageMouthHaystackSmall"), ...STRAW }),
  P("LitterHoldWoodpile", "ryFirewoodStack", { hide: Logs("LitterHoldWoodpile"), tile: [3, 2, 1] }),
  P("LitterHoldJar", "clayWaterVat", { hide: Rim("LitterHoldJar") }),
  P("StreetLeanToBasket0", "wovenBasket", BASKET),
  P("StreetLeanToBasket1", "wovenBasket", BASKET),
  P("StreetLeanToBasket2", "wovenBasket", BASKET),
  P("StreetLeanToFaggots", "ryFirewoodStack", { hide: Logs("StreetLeanToFaggots"), tile: [1, 2, 1], maxStretch: 1.6 }),
  P("StreetEastJar0", "clayWaterVat", { hide: Rim("StreetEastJar0") }),
  P("StreetEastBasket0", "wovenBasket", BASKET),
  P("StreetWestHouseJar", "clayRoundVat", { hide: Rim("StreetWestHouseJar") }),
  P("StreetWestHouseBasket", "wovenBasket", BASKET),
  P("StreetEastNorthFaggots", "ryFirewoodStack", { hide: Logs("StreetEastNorthFaggots"), tile: [1, 2, 2], maxStretch: 1.6 }),
  // 08 主街障碍（概念图 08：倒墙碎砖堆 + 翻倒木车）：车身换成撤运牛车（掉了左轮、朝缺轮一侧歪 14°），
  // 两侧的碎土坡换成城墙缺口包的残砖簇。碰撞仍是原来那只 4.55 × 1.6 × 2.6 的盒子与各块土坡。
  P("StreetBlockCart", "evacCartWreck", { rollDeg: 14 }),
  ...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => P(`StreetObstacleRubble${i}`, i % 2 ? "cityWallBreachBrickCluster02" : "cityWallBreachBrickCluster01",
    { maxStretch: 2.2, jitterYaw: 0.6 })),
  P("StreetCartWheel78.3", "ryCartWheel", WHEEL),
  P("StreetCartWheel80.7", "ryCartWheel", WHEEL),
  P("StreetBlockCartWheel", "ryCartWheel", WHEEL),
  P("StreetCartBasket0", "wovenBasket", BASKET),
  P("StreetCartBasket1", "wovenBasket", BASKET),
  // —— 09 灶屋 / 连屋 ——
  P("KitchenTable", "phRoughWoodTable"),
  P("KitchenWoodpile", "ryFirewoodStack", { hide: Logs("KitchenWoodpile"), tile: [1, 2, 3] }),
  P("KitchenWaterJar", "clayWaterVat", { hide: Rim("KitchenWaterJar") }),
  P("KitchenHangingBasket", "wovenBasket", BASKET),
  ...Stores("KitchenStores", 2),
  P("ConnectedHouseBasket", "wovenBasket", BASKET),
  // —— 10 内院 / 绕回巷 ——
  P("CourtWestWingBasket0", "wovenBasket", BASKET),
  P("CourtWestWingBasket1", "wovenBasket", BASKET),
  P("CourtWestWingJar", "clayLiddedJar", { hide: Rim("CourtWestWingJar") }),
  P("CourtWell", "stoneWellCurb"),
  P("CourtMillStone", "stoneMillWheel", { maxStretch: 1.4 }),
  P("CourtHandcartWheel-1", "ryCartWheel", WHEEL),
  P("CourtHandcartWheel1", "ryCartWheel", WHEEL),
  P("CourtBench", "ryYardBench"),
  P("CourtJar0", "clayWaterVat", { hide: Rim("CourtJar0") }),
  P("CourtWoodpile", "ryFirewoodStack", { hide: Logs("CourtWoodpile"), tile: [2, 2, 1] }),
  P("AlleySouthWoodpile", "ryFirewoodStack", { hide: Logs("AlleySouthWoodpile"), tile: [3, 2, 1] }),
  P("WestLaneWoodpile", "ryFirewoodStack", { hide: Logs("WestLaneWoodpile"), tile: [1, 2, 3] }),
  P("EastRowWoodpile", "ryFirewoodStack", { hide: Logs("EastRowWoodpile"), tile: [1, 2, 3] }),
  P("VillageEastLaneWoodpile", "ryFirewoodStack", { hide: Logs("VillageEastLaneWoodpile"), tile: [2, 1, 1] }),
  P("VillageLaneCartWheel", "ryCartWheel", WHEEL),
  P("VillageStreetCrates", "marketBox03"),
  P("VillageStreetCratesTop", "crate"),
  P("VillageStreetSacks", "marketRiceSack01", { tile: [2, 2, 1] }),
  P("VillageWestLaneCrates", "marketBox03"),
  P("VillageEastLaneCrate", "marketBox03"),
  P("SouthWestHaystack0", "ryHayStack", { hide: Tiers("SouthWestHaystack0"), ...STRAW }),
  P("SouthWestHaystack1", "ryHayStack", { hide: Tiers("SouthWestHaystack1"), ...STRAW }),
  P("EastRowHaystack", "ryHayStack", { hide: Tiers("EastRowHaystack"), ...STRAW }),
  P("EastSouthHaystack", "ryHayStack", { hide: Tiers("EastSouthHaystack"), ...STRAW }),
  // —— 11–14 桥头接运 ——
  P("TransferWallCrateA", "crate"),
  P("TransferWallCrateB", "marketBox02"),
  P("TransferWallBasket", "wovenBasket", BASKET),
  P("TransferWallJar", "clayLiddedJar"),
  // 2026-09-30：村路东侧的大草垛（3.6×3.3×3.6 m，比别处的 2–3 m 矮圆垛大一圈），拉伸上限放宽。
  P("TransferPlazaHaystack", "ryHayStack", { hide: Tiers("TransferPlazaHaystack"), maxStretch: 4.5 }),
  P("TransferScreenCrate0", "crate"),
  P("TransferScreenBasket", "wovenBasket", BASKET),
  P("TransferScreenWheel", "ryCartWheel", WHEEL),
  P("TransferScreenCrate1", "crate"),
  P("TransferYardCrate0", "crate"),
  P("TransferYardCrate1", "marketBox02"),
  // 平躺在地上的车轮：先把轮子放倒（绕 Z 转 90°），再按盒子配。
  P("TransferYardWheel", "ryCartWheel", { ...WHEEL, rollDeg: 90 }),
  P("TransferYardBasket", "wovenBasket", BASKET),
  P("TransferYardSack", "marketRiceSack01"),
  P("TransferTriageCrate", "crate"),
  P("TransferTriageBasket", "wovenBasket", BASKET),
  P("TransferShelterCrate0", "crate"),
  P("TransferShelterCrate1", "crate"),
  P("TransferCornerWheel", "ryCartWheel", WHEEL),
  P("TransferEastCoverCrate", "crate"),
  P("TransferShedBasket", "wovenBasket", BASKET),
  P("TransferShedJar", "clayLiddedJar"),
  P("TransferBrokenCartWheel", "ryCartWheel", WHEEL),
  P("TransferCrates", "marketBox03", { tile: [2, 1, 3] }),
  ...Stores("TransferStores", 3),
  // —— 15–18 桥南接收 ——
  P("LaneHollowCartWheel", "ryCartWheel", WHEEL),
  ...WARD_PROP_DRESSING,
  P("ReceptionWardWashTable", "phRoughWoodTable"),
  P("ReceptionWaitingBench", "ryYardBench", { tile: [3, 1, 1] }),
  P("ReceptionReceivingTable", "phRoughWoodTable"),
  P("ReceptionVat0", "clayRoundVat", { hide: ["ReceptionVatRim0"] }),
  P("ReceptionVat1", "clayRoundVat", { hide: ["ReceptionVatRim1"] }),
  P("ReceptionVat2", "clayRoundVat", { hide: ["ReceptionVatRim2"] }),
  P("ReceptionBasket0", "wovenBasket", BASKET),
  P("ReceptionBasket1", "wovenBasket", BASKET),
  P("ReceptionBasket2", "wovenBasket", BASKET),
  ...Stores("ReceptionStores", 2),
]);

/**
 * 外部模型材质的调色（乘在库材质的颜色上，只作用于本模块克隆出来的那份，不碰全局共享材质）。
 * 1938 年 3 月鲁南阴天：木箱不要新木的橙黄、陶缸是深褐灰的粗陶、柳条筐是褪色的灰黄。
 * 键是资产目录里的 `material` 名（Script_ExternalProps 的 ASSETS）。
 */
export const PROP_MATERIAL_TINT = Object.freeze({
  WoodCrate: Object.freeze([0.72, 0.68, 0.62]),
  HouseholdCeramic: Object.freeze([0.62, 0.55, 0.5]),
  Wicker: Object.freeze([0.9, 0.84, 0.72]),
  WoodBeam: Object.freeze([0.86, 0.82, 0.78]),
  WoodDoor: Object.freeze([0.86, 0.82, 0.78]),
  Sandbag: Object.freeze([0.92, 0.9, 0.84]),
});

/**
 * 换材质（优先于上面的调色）：按资产整件换成第一关按需材质集里的一套（Data_LevelTextureSets.FirstLevel），
 * 建场前 MaterialLibrary.LoadLevelSets 已下完；那一套不在库里（纯 node / 按需集缺失）就用 fallback 配方 + fallbackOptions。
 * repeat = 外部件盒投影 UV 的一格米数（Script_ExternalProps.RuntimeTileMeters）÷ 贴图一格米数。
 * smoothNormals：把硬边多面体的法线按同位置顶点平均（草垛是低模多面体，平着色读成一只橙色鼓）。
 *   · 木箱 / 市场箱 → B5 的 OpeningCrate（灰褐旧板箱，0.6 m 一格；外部件木料盒投影 1.0 m 一格）；
 *   · 草垛 → HaystackStraw（Lovart 秸秆，1.5 m 一格；VillageStraw 走 cloth 0.6 m 一格）。
 */
const OLD_CRATE = Object.freeze({ recipe: "OpeningCrate", options: Object.freeze({ color: 0xd8d2c8, repeat: 1.6 }),
  fallback: "WoodCrate", fallbackOptions: Object.freeze({ color: 0x9d9486 }) });
// 城墙缺口包的残砖簇自带四种材质（城砖 / 夯土 / 条石 / 碎砖地），夯土与城砖在村里读成橙红碎片；
// 08 障碍的碎砖堆整件换成一种灰褐碎砖瓦（GroundRubble 盒投影 2.6 m 一格，残砖簇保留作者 UV，repeat 1）。
const OLD_RUBBLE = Object.freeze({ recipe: "GroundRubble", options: Object.freeze({ color: 0x8e8b84, repeat: 1 }),
  fallback: "GroundRubble", fallbackOptions: Object.freeze({ color: 0x8e8b84 }) });
export const PROP_MATERIAL_OVERRIDE = Object.freeze({
  crate: OLD_CRATE, marketBox02: OLD_CRATE, marketBox03: OLD_CRATE,
  cityWallBreachBrickCluster01: OLD_RUBBLE, cityWallBreachBrickCluster02: OLD_RUBBLE,
  ryHayStack: Object.freeze({ recipe: "HaystackStraw", options: Object.freeze({ color: 0xe6e0d4, repeat: 0.4, normalScale: 0.8 }),
    fallback: "Sandbag", fallbackOptions: Object.freeze({ color: 0x9a8f78 }), smoothNormals: true }),
});

/**
 * 不在 Script_ExternalProps 目录里的现成模型（由各自的加载器给几何）：
 *   evacCartWreck —— 12/13 撤运牛车（Script_DraftCartModel 的 Model_WoodenEvacCart.glb，关里本来就下），
 *   取绑定姿势的静态几何、去掉 dropBone 那只轮子的三角形，当作坏在街上的车。材质克隆，不与蒙皮车共用。
 */
export const PROP_SPECIAL_ASSETS = Object.freeze({
  evacCartWreck: Object.freeze({ url: "./Model/OxCart/Model_WoodenEvacCart.glb", loader: "Script_DraftCartModel.LoadDraftCartAssets",
    dropBone: "WheelLeft", tint: Object.freeze([0.8, 0.77, 0.72]) }),
});

/** 替换表用到的外部资产（Script_ExternalProps 的 ASSETS 键），开机按它预载。 */
export const PROP_DRESSING_ASSETS = Object.freeze([...new Set(PROP_DRESSING.map((entry) => entry.asset))]
  .filter((id) => !PROP_SPECIAL_ASSETS[id]).sort());

// ---------------------------------------------------------------------------
// 碎砖瓦
// ---------------------------------------------------------------------------
export const PROP_RUBBLE = Object.freeze({
  seed: 20260928,
  maxPieces: 1800,
  maxHeightM: 0.25,
  routeClearM: 0.9,
  anchorClearM: 1.6,
  /** 白盒里的散块（RubbleStrip / Bats）：这类不实心的矮盒整只换成低模碎块。 */
  loose: Object.freeze({
    idPattern: /(Rubble|Foot|Bats|Chips|Spill|Brick|Stone|Debris)[A-Za-z]*\d+$/,
    excludePattern: /(Step|Sill|Plinth|Kerb|Curb|Post|Rail|Pier|Slab)/,
    semantics: Object.freeze(["earthDark", "plaster", "structure", "railBallast"]),
    maxFootprintM: 1.3, maxHeightM: 0.45, groundSnapM: 0.5,
    piecesPerM2: 7, minPieces: 2, maxPiecesPerBlock: 7,
  }),
  /** 残墙、倒墙、塌落的矮墙脚下补撒（块 id 命中即算「残」）。 */
  ruin: Object.freeze({
    idPattern: /(Ruin|RubbleWall|Fallen|Collapsed|Broken|Breach|Obstacle)/,
    minHeightM: 0.45, perM: 1.4, bandM: 1.1,
  }),
  /** 完好的房身 / 院墙脚下：稀疏几块掉下来的瓦片与砖角。 */
  wallFoot: Object.freeze({
    idPattern: /(Body|YardWall|Wall[A-Z]?\w*)$/,
    semantics: Object.freeze(["plaster", "structure"]),
    minHeightM: 1.6, perM: 0.14, bandM: 0.7,
  }),
  /** 弹坑沿：土块与石块。 */
  crater: Object.freeze({ minRadiusM: 1.0, perM: 1.1, bandM: 1.3 }),
  /** 碎块种类：尺寸是米（长、高、宽），shade 是顶点色（乘在 Stone 贴图上）。 */
  kinds: Object.freeze([
    { id: "Brick", size: [0.24, 0.055, 0.115], jitter: 0.35, shade: [0.64, 0.61, 0.56], weight: 0.45 },
    { id: "BrickHalf", size: [0.13, 0.055, 0.115], jitter: 0.3, shade: [0.58, 0.56, 0.52], weight: 0.25 },
    { id: "TileShard", size: [0.19, 0.018, 0.15], jitter: 0.3, shade: [0.44, 0.44, 0.43], weight: 0.18 },
    { id: "Stone", size: [0.2, 0.12, 0.17], jitter: 0.5, shade: [0.78, 0.72, 0.62], weight: 0.12 },
  ]),
});

