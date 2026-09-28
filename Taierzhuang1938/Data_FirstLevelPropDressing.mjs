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
  P("VillageGateCartWheel", "ryCartWheel", WHEEL),
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
  P("TransferPlazaCartWheel", "ryCartWheel", WHEEL),
  P("TransferPlazaHaystack", "ryHayStack", { hide: Tiers("TransferPlazaHaystack"), ...STRAW }),
  P("TransferScreenCrate0", "crate"),
  P("TransferScreenBasket", "wovenBasket", BASKET),
  P("TransferScreenWheel", "ryCartWheel", WHEEL),
  P("TransferScreenCrate1", "crate"),
  P("TransferYardCrate0", "crate"),
  P("TransferYardCrate1", "marketBox02"),
  // 平躺在地上的车轮：先把轮子放倒（绕 Z 转 90°），再按盒子配。
  P("TransferYardWheel", "ryCartWheel", { ...WHEEL, roll: true }),
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

/** 替换表用到的外部资产（Script_ExternalProps 的 ASSETS 键），开机按它预载。 */
export const PROP_DRESSING_ASSETS = Object.freeze([...new Set(PROP_DRESSING.map((entry) => entry.asset))].sort());

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

// ---------------------------------------------------------------------------
// 纯函数（运行时与 node 测试共用）
// ---------------------------------------------------------------------------
export function HashSeed(text, seed = 2166136261) {
  let h = seed >>> 0;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}
export function Rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 模型尺寸（归一化后：底面中心为原点，[x, y, z] 米）配到一只盒子（块自身轴 w, h, d）。
 * 候选朝向：原样 / 绕 Y 转 90°（长边、薄边对上盒子的那一边）；`roll` 先把模型放倒（绕 Z 90°）。
 * 逐轴缩放 s_i = box_i / model_i，再按几何平均把压扁/拉长收进 maxStretch 以内，取变形最小的朝向。
 * 返回模型轴上的缩放、附加偏航、以及外观在盒子轴上的实际尺寸（测试拿它和碰撞盒比）。
 */
export function FitPropToBox(modelSize, box, { maxStretch = 1.35, roll = false } = {}) {
  const base = roll ? [modelSize[1], modelSize[0], modelSize[2]] : modelSize;
  let best = null;
  for (const swap of [false, true]) {
    const model = swap ? [base[2], base[1], base[0]] : base;
    const target = [box.w, box.h, box.d];
    const raw = target.map((value, i) => value / Math.max(model[i], 1e-4));
    const g = Math.cbrt(raw[0] * raw[1] * raw[2]);
    const scale = raw.map((s) => Math.min(g * maxStretch, Math.max(g / maxStretch, s)));
    const distortion = raw.reduce((sum, s) => sum + Math.abs(Math.log(s / g)), 0);
    const visual = model.map((m, i) => m * scale[i]);
    if (!best || distortion < best.distortion - 1e-9) {
      // 模型轴上的缩放：swap 时模型 x 对的是盒子 d、模型 z 对的是盒子 w。
      const modelScale = swap ? [scale[2], scale[1], scale[0]] : scale;
      best = { swap, distortion, scale: modelScale, visual, yaw: swap ? Math.PI / 2 : 0 };
    }
  }
  return best;
}

function CornersOf(block) {
  const c = Math.cos(block.ry || 0), s = Math.sin(block.ry || 0), hw = block.w / 2, hd = block.d / 2;
  return [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([a, b]) => ({ x: block.x + a * c + b * s, z: block.z - a * s + b * c }));
}

/** 主块 + 附属件在主块自身坐标系里的并集盒。 */
function UnionBox(main, parts) {
  const c = Math.cos(main.ry || 0), s = Math.sin(main.ry || 0);
  let minX = -main.w / 2, maxX = main.w / 2, minZ = -main.d / 2, maxZ = main.d / 2;
  let bottom = main.y - main.h / 2, top = main.y + main.h / 2;
  for (const part of parts) {
    for (const corner of CornersOf(part)) {
      const dx = corner.x - main.x, dz = corner.z - main.z;
      const lx = dx * c - dz * s, lz = dx * s + dz * c;
      minX = Math.min(minX, lx); maxX = Math.max(maxX, lx); minZ = Math.min(minZ, lz); maxZ = Math.max(maxZ, lz);
    }
    bottom = Math.min(bottom, part.y - part.h / 2); top = Math.max(top, part.y + part.h / 2);
  }
  // 并集中心在主块轴上的偏移（轮廓不对称时，比如缸沿比缸身宽，中心不动）。
  const ox = (minX + maxX) / 2, oz = (minZ + maxZ) / 2;
  return { x: main.x + ox * c + oz * s, z: main.z - ox * s + oz * c, ry: main.ry || 0,
    w: maxX - minX, d: maxZ - minZ, bottom, top };
}

/**
 * 按替换表出摆位。`modelSizes`：Map / 对象，资产 id → 归一化尺寸 [x, y, z]。
 * 返回 { placements, replaced, missing }；placements 每件：
 *   { id, block, asset, x, y（底）, z, yaw, roll, scale:[模型轴], visual:[w,h,d], box:{w,h,d} }
 */
export function PlanPropDressing(blocks, groundAt, modelSizes, entries = PROP_DRESSING) {
  const byId = new Map(blocks.map((block) => [block.id, block]));
  const SizeOf = (asset) => (modelSizes instanceof Map ? modelSizes.get(asset) : modelSizes[asset]);
  const placements = [], replaced = new Set(), missing = [];
  for (const entry of entries) {
    const main = byId.get(entry.block), size = SizeOf(entry.asset);
    const parts = (entry.hide || []).map((id) => byId.get(id));
    if (!main || !size || parts.some((part) => !part)) { missing.push(entry.block); continue; }
    const union = UnionBox(main, parts);
    // 贴地：盒底就在地面附近的，按并集脚印四角 + 中心取最低地面再压进土里，顶面不动。
    const corners = CornersOf({ x: union.x, z: union.z, w: union.w, d: union.d, ry: union.ry });
    const centerGround = groundAt(union.x, union.z);
    let bottom = union.bottom;
    if (Math.abs(bottom - centerGround) <= PROP_GROUND.snapM) {
      bottom = Math.min(centerGround, ...corners.map((p) => groundAt(p.x, p.z))) - PROP_GROUND.embedM;
    }
    const [nw, nh, nd] = entry.tile || [1, 1, 1];
    const cell = { w: union.w / nw, h: (union.top - bottom) / nh, d: union.d / nd };
    const c = Math.cos(union.ry), s = Math.sin(union.ry);
    const rng = Rng(HashSeed(entry.block));
    for (let iy = 0; iy < nh; iy++) for (let iz = 0; iz < nd; iz++) for (let ix = 0; ix < nw; ix++) {
      const fit = FitPropToBox(size, cell, entry);
      const lx = -union.w / 2 + (ix + 0.5) * cell.w, lz = -union.d / 2 + (iz + 0.5) * cell.d;
      const jitter = (entry.jitterYaw ?? (nw * nh * nd > 1 ? 0.06 : 0)) * (rng() * 2 - 1);
      placements.push({
        id: `${entry.block}#${ix}${iy}${iz}`, block: entry.block, asset: entry.asset,
        x: union.x + lx * c + lz * s, y: bottom + iy * cell.h, z: union.z - lx * s + lz * c,
        yaw: union.ry + fit.yaw + jitter, roll: !!entry.roll, scale: fit.scale, visual: fit.visual,
        box: { ...cell },
      });
    }
    replaced.add(main.id);
    for (const part of parts) replaced.add(part.id);
  }
  return { placements, replaced, missing };
}

/** 碎砖瓦的「散块」判据（白盒 RubbleStrip 的产物）。 */
export function IsLooseRubbleBlock(block, groundAt, rules = PROP_RUBBLE.loose) {
  if (block.solid !== false || block.cover || block.dynamic || block.treeModel) return false;
  if (!rules.idPattern.test(block.id) || rules.excludePattern.test(block.id)) return false;
  if (!rules.semantics.includes(block.semantic)) return false;
  if (Math.max(block.w, block.d) > rules.maxFootprintM || block.h > rules.maxHeightM) return false;
  return Math.abs(block.y - block.h / 2 - groundAt(block.x, block.z)) <= rules.groundSnapM;
}

function SegmentDistance(px, pz, a, b) {
  const dx = b.x - a.x, dz = b.z - a.z, len = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((px - a.x) * dx + (pz - a.z) * dz) / len));
  return Math.hypot(px - a.x - dx * t, pz - a.z - dz * t);
}

/** 路线折线 → 16 m 分桶的线段表，查「离最近路线多远」（cap 以外返回 cap）。 */
export function RouteIndex(routes, cellM = 16) {
  const grid = new Map();
  const Key = (ix, iz) => ix * 73856093 ^ iz * 19349663;
  for (const route of routes) for (let i = 1; i < route.length; i++) {
    const a = route[i - 1], b = route[i];
    const x0 = Math.floor(Math.min(a.x, b.x) / cellM) - 1, x1 = Math.floor(Math.max(a.x, b.x) / cellM) + 1;
    const z0 = Math.floor(Math.min(a.z, b.z) / cellM) - 1, z1 = Math.floor(Math.max(a.z, b.z) / cellM) + 1;
    for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++) {
      const key = Key(ix, iz);
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key).push([a, b]);
    }
  }
  return {
    Distance(x, z, cap = cellM) {
      const list = grid.get(Key(Math.floor(x / cellM), Math.floor(z / cellM)));
      let best = cap;
      if (list) for (const [a, b] of list) best = Math.min(best, SegmentDistance(x, z, a, b));
      return best;
    },
  };
}

/** 点表（锚点、交互点）→ 同样的分桶，查最近点距离。 */
export function PointIndex(points, cellM = 16) {
  const grid = new Map();
  const Key = (ix, iz) => ix * 73856093 ^ iz * 19349663;
  for (const p of points) {
    for (let ix = Math.floor(p.x / cellM) - 1; ix <= Math.floor(p.x / cellM) + 1; ix++)
      for (let iz = Math.floor(p.z / cellM) - 1; iz <= Math.floor(p.z / cellM) + 1; iz++) {
        const key = Key(ix, iz);
        if (!grid.has(key)) grid.set(key, []);
        grid.get(key).push(p);
      }
  }
  return {
    Distance(x, z, cap = cellM) {
      const list = grid.get(Key(Math.floor(x / cellM), Math.floor(z / cellM)));
      let best = cap;
      if (list) for (const p of list) best = Math.min(best, Math.hypot(x - p.x, z - p.z));
      return best;
    },
  };
}

function PickKind(rng, kinds) {
  const total = kinds.reduce((sum, kind) => sum + kind.weight, 0);
  let r = rng() * total;
  for (const kind of kinds) { r -= kind.weight; if (r <= 0) return kind; }
  return kinds[kinds.length - 1];
}

/**
 * 碎砖瓦撒点。ctx：{ blocks, groundAt, routes（折线数组）, anchors（点数组）, craters }。
 * 返回 { pieces:[{x,y,z,yaw,tilt,kind,size:[l,h,w],shade}], hidden:Set（换掉的散块 id） }。
 */
export function PlanRubbleScatter(ctx, rules = PROP_RUBBLE) {
  const { blocks, groundAt } = ctx;
  const routes = RouteIndex(ctx.routes || []), anchors = PointIndex(ctx.anchors || []);
  const pieces = [], hidden = new Set();
  const Clear = (x, z) => routes.Distance(x, z, rules.routeClearM + 1) > rules.routeClearM
    && anchors.Distance(x, z, rules.anchorClearM + 1) > rules.anchorClearM;
  const Emit = (rng, x, z, maxH = rules.maxHeightM, scaleMul = 1) => {
    if (pieces.length >= rules.maxPieces) return;
    const kind = PickKind(rng, rules.kinds);
    const k = (1 + (rng() * 2 - 1) * kind.jitter) * scaleMul;
    const size = [kind.size[0] * k, Math.min(kind.size[1] * k, maxH), kind.size[2] * k];
    const tilt = (rng() * 2 - 1) * 0.35;
    pieces.push({ x, z, y: groundAt(x, z) - size[1] * 0.28, yaw: rng() * Math.PI * 2, tilt,
      kind: kind.id, size, shade: kind.shade.map((v) => v * (0.85 + rng() * 0.3)) });
  };
  // 1) 白盒散块：整只换掉，块面积 × 密度件，落在块脚印里（块本来就在墙根上）。
  for (const block of blocks) {
    if (!IsLooseRubbleBlock(block, groundAt, rules.loose)) continue;
    hidden.add(block.id);
    const rng = Rng(HashSeed(block.id, rules.seed));
    const count = Math.max(rules.loose.minPieces, Math.min(rules.loose.maxPiecesPerBlock,
      Math.round(block.w * block.d * rules.loose.piecesPerM2 + rng() * 2)));
    const c = Math.cos(block.ry || 0), s = Math.sin(block.ry || 0);
    for (let i = 0; i < count; i++) {
      const a = (rng() - 0.5) * block.w * 1.3, b = (rng() - 0.5) * block.d * 1.3;
      Emit(rng, block.x + a * c + b * s, block.z - a * s + b * c, Math.min(rules.maxHeightM, block.h + 0.05));
    }
  }
  // 2) 残墙 / 倒墙脚下、3) 完好墙根：沿块的四条边，往外 bandM 以内。
  const EdgeScatter = (block, perM, bandM, idSalt) => {
    const rng = Rng(HashSeed(block.id + idSalt, rules.seed));
    const corners = CornersOf(block);
    for (let e = 0; e < 4; e++) {
      const a = corners[e], b = corners[(e + 1) % 4];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      const nx = (b.z - a.z) / (len || 1), nz = -(b.x - a.x) / (len || 1);
      const count = Math.floor(len * perM + rng());
      for (let i = 0; i < count; i++) {
        const t = rng(), out = 0.05 + rng() ** 1.6 * bandM;
        const x = a.x + (b.x - a.x) * t + nx * out, z = a.z + (b.z - a.z) * t + nz * out;
        if (!Clear(x, z) || InsideAnyBlock(x, z)) continue;
        Emit(rng, x, z);
      }
    }
  };
  const grounded = blocks.filter((block) => block.solid !== false
    && Math.abs(block.y - block.h / 2 - groundAt(block.x, block.z)) < 0.6);
  const footIndex = new Map();
  for (const block of grounded) {
    const key = `${Math.floor(block.x / 16)},${Math.floor(block.z / 16)}`;
    if (!footIndex.has(key)) footIndex.set(key, []);
    footIndex.get(key).push(block);
  }
  function InsideAnyBlock(x, z) {
    for (let ix = -1; ix <= 1; ix++) for (let iz = -1; iz <= 1; iz++) {
      for (const block of footIndex.get(`${Math.floor(x / 16) + ix},${Math.floor(z / 16) + iz}`) || []) {
        const dx = x - block.x, dz = z - block.z, c = Math.cos(block.ry || 0), s = Math.sin(block.ry || 0);
        if (Math.abs(dx * c - dz * s) < block.w / 2 + 0.02 && Math.abs(dx * s + dz * c) < block.d / 2 + 0.02) return true;
      }
    }
    return false;
  }
  for (const block of grounded) {
    if (block.h >= rules.ruin.minHeightM && rules.ruin.idPattern.test(block.id))
      EdgeScatter(block, rules.ruin.perM, rules.ruin.bandM, ":ruin");
    else if (block.h >= rules.wallFoot.minHeightM && rules.wallFoot.idPattern.test(block.id)
      && rules.wallFoot.semantics.includes(block.semantic))
      EdgeScatter(block, rules.wallFoot.perM, rules.wallFoot.bandM, ":foot");
  }
  // 4) 弹坑沿。
  for (const [i, crater] of (ctx.craters || []).entries()) {
    if (!(crater.radius >= rules.crater.minRadiusM)) continue;
    const rng = Rng(HashSeed(`crater${i}`, rules.seed));
    const count = Math.floor(2 * Math.PI * crater.radius * rules.crater.perM);
    for (let k = 0; k < count; k++) {
      const angle = rng() * Math.PI * 2, r = crater.radius * (0.85 + rng() * 0.2) + rng() ** 1.5 * rules.crater.bandM;
      const x = crater.x + Math.cos(angle) * r, z = crater.z + Math.sin(angle) * r;
      if (!Clear(x, z) || InsideAnyBlock(x, z)) continue;
      Emit(rng, x, z, rules.maxHeightM, 0.9);
    }
  }
  return { pieces, hidden };
}
