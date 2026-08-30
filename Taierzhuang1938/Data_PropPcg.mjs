// 工事 / 生活用具 PCG 的纯数据真相。不 import three。
//
// 运行时与编辑器都读这一份：profile 说明“一组东西为什么一起出现”，volume 说明
// “哪一片允许出现”。具体落点由 Script_PropPcg 用固定种子、真实院落格与碰撞表生成。
// 资产 id 必须来自 Script_ExternalProps.ExternalPropCatalog；这里不复制 URL、材质或模型。
//
// 三条内容纪律：
//   · 生活用具按使用关系成组（水缸+桶、柴墩+斧、桌+凳），不均匀撒单件；
//   · 面状工事 PCG 只补低矮军需/休息/就地取材，不自动生成碉堡或战壕；
//   · 真正会改通行的沙袋/铁丝网只许走 spline，控制点主动绕开门洞、马道与任务轴。

export const PROP_PCG_SCHEMA_VERSION = 2;

/**
 * PCG 只需知道水平占地与用途；真实模型、材质、碰撞 tag 仍归 ExternalProps。
 * radius 是保守的水平圆半径（m），用于生成前的净空裁决。自动生活小物默认
 * 只做视觉实例，不写 AI / 玩家物理；某个未来模板确需实体碰撞时必须逐资产显式
 * 登记 solid:true，并补交火 / 导航回归，不能让随机凳子悄悄改变一场仗。
 */
export const PROP_PCG_ASSET_RULES = Object.freeze({
  clayWaterVat: { radius: 0.46, category: "life" },
  clayRoundVat: { radius: 0.38, category: "life" },
  clayLiddedJar: { radius: 0.28, category: "life" },
  clayWideJar: { radius: 0.32, category: "life" },
  phWoodenBucket: { radius: 0.24, category: "life" },
  phWoodenWashTub: { radius: 0.34, category: "life" },
  phWickerTray: { radius: 0.34, category: "life" },
  phWickerBasketLidded: { radius: 0.30, category: "life" },
  wovenBasket: { radius: 0.31, category: "life" },
  winnowingBasket: { radius: 0.34, category: "life" },
  phChineseWoodStool: { radius: 0.34, category: "life" },
  phLowWoodStool: { radius: 0.30, category: "life" },
  phRoughWoodTable: { radius: 0.84, category: "life" },
  longBench: { radius: 0.82, category: "life" },
  ryChoppingBlock: { radius: 0.42, category: "life" },
  phWoodAxe: { radius: 0.52, category: "life" },
  phSmithHammer: { radius: 0.40, category: "life" },
  phIronSpade: { radius: 0.60, category: "life" },
  ryFarmHoe: { radius: 0.66, category: "life" },
  phFirewoodBranches: { radius: 0.62, category: "life" },
  ryFirewoodStack: { radius: 0.72, category: "life" },
  marketRiceSack01: { radius: 0.42, category: "life" },
  marketRiceSack02: { radius: 0.42, category: "life" },
  marketBox01: { radius: 0.48, category: "life" },
  marketBox03: { radius: 0.58, category: "life" },
  crate: { radius: 0.56, category: "life" },
  stackableStone02: { radius: 0.34, category: "defense" },
  stackableStone04: { radius: 0.38, category: "defense" },
  battlefieldSupplyBox: { radius: 0.66, category: "defense" },
  battlefieldGrenadeStack: { radius: 0.42, category: "defense" },
  battlefieldCartridgeScatter: { radius: 0.42, category: "defense" },
  battlefieldGroundSheet: { radius: 0.92, category: "defense" },
  battlefieldCanvasCover01: { radius: 1.10, category: "defense" },
  battlefieldCanvasCover02: { radius: 1.10, category: "defense" },
  battlefieldTimberBeam: { radius: 1.18, category: "defense" },
  battlefieldSandbag01: { radius: 1.06, category: "defenseLine", solid: true },
  battlefieldSandbag02: { radius: 1.12, category: "defenseLine", solid: true },
  battlefieldSandbag03: { radius: 1.04, category: "defenseLine", solid: true },
  battlefieldBarbedWire01: { radius: 1.62, category: "defenseLine", solid: true },
  battlefieldBarbedWire02: { radius: 1.62, category: "defenseLine", solid: true },
});

const LifeTemplate = (id, label, weight, items) => Object.freeze({
  id, label, weight, items: Object.freeze(items),
});

/**
 * item.offset = [沿组局部 X, 沿组局部 Z]；ry 是相对组朝向。
 * 小幅 scaleRange 只消除复制感，不改变真实物件的类别尺度。
 */
export const PROP_PCG_PROFILES = Object.freeze({
  householdLife: Object.freeze({
    id: "householdLife", label: "院落生活组", category: "life",
    maxSlope: 0.16, fixedClearance: 0.34, itemClearance: 0.10,
    yawJitter: 0.16, scaleRange: [0.94, 1.04],
    templates: Object.freeze([
      LifeTemplate("water", "取水洗濯", 1.2, [
        { asset: "clayWaterVat", offset: [0, 0], ry: 0 },
        { asset: "phWoodenBucket", offset: [0.78, 0.22], ry: 0.35 },
        { asset: "phWoodenWashTub", offset: [-0.76, 0.25], ry: -0.30, chance: 0.72 },
      ]),
      LifeTemplate("firewood", "劈柴修补", 1.1, [
        { asset: "ryChoppingBlock", offset: [0, 0], ry: 0 },
        { asset: "phWoodAxe", offset: [0.64, 0.10], ry: 0.72 },
        { asset: "phFirewoodBranches", offset: [-0.82, 0.16], ry: -0.20, chance: 0.78 },
      ]),
      LifeTemplate("meal", "院心桌凳", 0.82, [
        { asset: "phRoughWoodTable", offset: [0, 0], ry: 0 },
        { asset: "longBench", offset: [0, 1.22], ry: 0 },
        { asset: "phLowWoodStool", offset: [-1.02, -0.12], ry: 0.42, chance: 0.62 },
      ]),
      LifeTemplate("storage", "收拾到一半", 1.0, [
        { asset: "marketRiceSack01", offset: [0, 0], ry: 0.28 },
        { asset: "marketBox01", offset: [0.84, 0.10], ry: -0.20 },
        { asset: "wovenBasket", offset: [-0.70, 0.18], ry: 0.48, chance: 0.74 },
      ]),
      LifeTemplate("tools", "农具靠墙", 0.9, [
        { asset: "ryFarmHoe", offset: [0, 0], ry: 0 },
        { asset: "phIronSpade", offset: [0.74, 0.12], ry: 0.12 },
        { asset: "winnowingBasket", offset: [-0.66, 0.18], ry: -0.18, chance: 0.68 },
      ]),
      LifeTemplate("jars", "灶间陶瓮", 0.95, [
        { asset: "clayRoundVat", offset: [0, 0], ry: 0.10 },
        { asset: "clayLiddedJar", offset: [0.66, 0.05], ry: -0.18 },
        { asset: "clayWideJar", offset: [-0.66, 0.04], ry: 0.24, chance: 0.76 },
      ]),
    ]),
  }),
  defenseSupport: Object.freeze({
    id: "defenseSupport", label: "守军补给组", category: "defense",
    maxSlope: 0.12, fixedClearance: 0.55, itemClearance: 0.14,
    yawJitter: 0.20, scaleRange: [0.92, 1.03],
    templates: Object.freeze([
      LifeTemplate("grenades", "手榴弹补给", 1.35, [
        { asset: "battlefieldSupplyBox", offset: [0, 0], ry: 0.18 },
        { asset: "battlefieldGrenadeStack", offset: [1.08, 0.10], ry: -0.16 },
        { asset: "battlefieldCartridgeScatter", offset: [-0.92, 0.20], ry: 0.34, chance: 0.68 },
      ]),
      LifeTemplate("rest", "墙根歇兵", 0.72, [
        { asset: "battlefieldGroundSheet", offset: [0, 0], ry: 0 },
        { asset: "crate", offset: [1.36, 0.18], ry: 0.32 },
        { asset: "phWoodenBucket", offset: [-1.18, 0.10], ry: -0.24, chance: 0.72 },
      ]),
      LifeTemplate("materials", "就地取材", 0.84, [
        { asset: "battlefieldTimberBeam", offset: [0, 0], ry: 0.08 },
        { asset: "stackableStone02", offset: [1.42, 0.28], ry: 0.40 },
        { asset: "stackableStone04", offset: [-1.40, 0.20], ry: -0.46, chance: 0.74 },
      ]),
    ]),
  }),
  defenseFiringLine: Object.freeze({
    id: "defenseFiringLine", label: "沙袋散兵线", category: "defenseLine",
    maxSlope: 0.12, fixedClearance: 0.30, itemClearance: 0.08,
    yawJitter: 0.035, scaleRange: [0.96, 1.04],
    templates: Object.freeze([
      LifeTemplate("sandbag01", "低矮土袋段", 1.0, [
        { asset: "battlefieldSandbag01", offset: [0, 0], ry: 0 },
      ]),
      LifeTemplate("sandbag02", "宽土袋段", 0.85, [
        { asset: "battlefieldSandbag02", offset: [0, 0], ry: 0 },
      ]),
      LifeTemplate("sandbag03", "加高土袋段", 0.92, [
        { asset: "battlefieldSandbag03", offset: [0, 0], ry: 0 },
      ]),
    ]),
  }),
  defenseWireLine: Object.freeze({
    id: "defenseWireLine", label: "铁丝障碍线", category: "defenseLine",
    maxSlope: 0.10, fixedClearance: 0.36, itemClearance: 0.06, lineOverlap: 0.52,
    yawJitter: 0.025, scaleRange: [0.98, 1.02],
    templates: Object.freeze([
      LifeTemplate("concertina", "蛇腹铁丝网", 1.25, [
        { asset: "battlefieldBarbedWire01", offset: [0, 0], ry: 0 },
      ]),
      LifeTemplate("stakeWire", "三道桩网", 1.0, [
        { asset: "battlefieldBarbedWire02", offset: [0, 0], ry: 0 },
      ]),
    ]),
  }),
});

const QuarterVolume = (id, label, bounds, seedOffset) => Object.freeze({
  id, label, enabled: true, profile: "householdLife", shape: "cells", bounds,
  seedOffset, chance: 0.16, maxAnchors: 12, attemptsPerAnchor: 26,
  inset: 2.1, minSpacing: 7.5,
});

const DefenseVolume = (id, label, bounds, seedOffset, axisYaw, options = {}) => Object.freeze({
  id, label, enabled: true, profile: "defenseSupport", shape: "rect", bounds,
  seedOffset, count: options.count ?? 3, attemptsPerAnchor: options.attemptsPerAnchor ?? 52,
  minSpacing: options.minSpacing ?? 9, inset: options.inset ?? 0.8, axisYaw,
});

function PointsBounds(points, padding = 4) {
  const xs = points.map((point) => point[0]);
  const zs = points.map((point) => point[1]);
  return Object.freeze({
    minX: Math.min(...xs) - padding, maxX: Math.max(...xs) + padding,
    minZ: Math.min(...zs) - padding, maxZ: Math.max(...zs) + padding,
  });
}

const DefenseSpline = (id, label, profile, points, seedOffset, options = {}) => Object.freeze({
  id, label, enabled: true, profile, shape: "spline",
  bounds: PointsBounds(points, options.boundsPadding ?? 4),
  points: Object.freeze(points.map((point) => Object.freeze(point))),
  seedOffset, spacing: options.spacing ?? (profile === "defenseWireLine" ? 3.18 : 12.5),
  startInset: options.startInset ?? 1.5, endInset: options.endInset ?? 1.5,
  sideOffset: options.sideOffset ?? 0, sideJitter: options.sideJitter ?? 0.18,
  alongJitter: options.alongJitter ?? 0.28,
  minSpacing: 0,
  exclusions: Object.freeze(options.exclusions || []),
});

/**
 * 出厂布设文档。生活组只在 PlanBlocks 生成的真实院落格里落点。城防工事不再
 * 沿四面墙平均铺开：Notion「场景设计」的城防图与东关白盒把主防区明确收束为
 * 东寨门—东关院落—东门／东墙缺口，南东侧只承担逐渐压来的侧翼威胁，西侧是
 * 退却方向。PCG 因此只补这些节点之间的短线与补给，不把整圈城墙做成齐整胸墙。
 */
export const PROP_PCG_DOCUMENT = Object.freeze({
  version: PROP_PCG_SCHEMA_VERSION,
  seed: 19380317,
  volumes: Object.freeze([
    QuarterVolume("LifeNortheast", "东北片院落", { minX: 4, maxX: 282, minZ: -282, maxZ: -4 }, 101),
    QuarterVolume("LifeNorthwest", "西北片院落", { minX: -282, maxX: -4, minZ: -282, maxZ: -4 }, 211),
    QuarterVolume("LifeSoutheast", "东南片院落", { minX: 4, maxX: 282, minZ: 4, maxZ: 282 }, 307),
    QuarterVolume("LifeSouthwest", "西南片院落", { minX: -282, maxX: -4, minZ: 4, maxZ: 282 }, 401),
    // 第一层：东墙缺口与东门内侧。固定投弹位／交叉机枪位由 EAST_DEFENSE 建造，
    // 这里仅在其后方空地补弹药、掩体材料与歇兵物件，避免重复压住射界。
    DefenseVolume("DefenseEastBreachRear", "东墙缺口后方补给",
      { minX: 258, maxX: 283, minZ: -40, maxZ: 14 }, 503, Math.PI / 2,
      { count: 3, minSpacing: 11 }),
    DefenseVolume("DefenseEastGateRear", "东门内侧补给",
      { minX: 254, maxX: 282, minZ: -82, maxZ: -48 }, 601, 0,
      { count: 2, minSpacing: 10 }),
    DefenseVolume("DefenseEastReserve", "东关预备队院落补给",
      { minX: 366, maxX: 410, minZ: -143, maxZ: -106 }, 701, 0,
      { count: 3, minSpacing: 10 }),

    // 第二层：东寨门两翼投弹／阻滞区。主路 z=-65 与门洞保持净空；补给落在
    // 两侧院巷，沙袋与铁丝线均沿南北向短铺，不横切任务轴。
    DefenseVolume("DefenseZhaiNorth", "东寨门北翼手榴弹补给",
      { minX: 478, maxX: 516, minZ: -101, maxZ: -86 }, 809, 0,
      { count: 2, minSpacing: 9 }),
    DefenseVolume("DefenseZhaiSouth", "东寨门南翼手榴弹补给",
      { minX: 478, maxX: 516, minZ: -46, maxZ: -31 }, 907, 0,
      { count: 2, minSpacing: 9 }),

    // 第三层：日军南侧突破逐渐威胁后方，只在东南角留下少量侧翼物资；西门是
    // 退却方向，仅在道路两肩放两处补给，不再沿西墙、北墙筑成长线。
    DefenseVolume("DefenseSouthEastFlank", "东南城角侧翼补给",
      { minX: 188, maxX: 258, minZ: 286, maxZ: 293 }, 1009, 0,
      { count: 2, minSpacing: 18, inset: 0.5 }),
    DefenseVolume("DefenseWestWithdrawalNorth", "西门退却线北肩补给",
      { minX: -282, maxX: -254, minZ: -34, maxZ: -18 }, 1103, 0,
      { count: 1, minSpacing: 8 }),
    DefenseVolume("DefenseWestWithdrawalSouth", "西门退却线南肩补给",
      { minX: -282, maxX: -254, minZ: 18, maxZ: 34 }, 1151, 0,
      { count: 1, minSpacing: 8 }),

    // 东墙缺口外围与东门后方用短 spline 串成可换位的火力层；每条只放 1—3 个
    // 沙袋模块，门洞、马道、固定投弹位和东西门大街始终留空。
    DefenseSpline("FiringEastBreachSouth", "东墙缺口南翼散兵位", "defenseFiringLine",
      [[291, 12], [291, 30]], 1201, { spacing: 8.5, startInset: 0.5, endInset: 0.5 }),
    DefenseSpline("FiringEastGateNorth", "东门后方北肩散兵位", "defenseFiringLine",
      [[278, -72], [254, -72]], 1301, { spacing: 8.0, startInset: 0.8, endInset: 0.8 }),
    DefenseSpline("FiringEastGateSouth", "东门后方南肩散兵位", "defenseFiringLine",
      [[282, -54], [258, -54]], 1409, { spacing: 8.0, startInset: 0.8, endInset: 0.8 }),
    DefenseSpline("FiringZhaiNorth", "东寨门北翼投弹位", "defenseFiringLine",
      [[528, -91], [528, -79]], 1511, { spacing: 7.2, startInset: 0.4, endInset: 0.4 }),
    DefenseSpline("FiringZhaiSouth", "东寨门南翼投弹位", "defenseFiringLine",
      [[528, -51], [528, -39]], 1601, { spacing: 7.2, startInset: 0.4, endInset: 0.4 }),
    DefenseSpline("FiringSouthEastFlank", "东南城角侧翼散兵线", "defenseFiringLine",
      [[188, 291], [258, 291]], 1709, { spacing: 13.5 }),

    // 东寨缺口两翼是全场最适合连续障碍线的地方：顺巷铺，不横过 x 向主路。
    // 主路中心 z=-65 与缺口净宽始终留空；拒马和弹壳仍由手摆件做视觉焦点。
    DefenseSpline("WireEastBreachNorth", "东寨缺口北翼桩网", "defenseWireLine",
      [[504, -82], [504, -73]], 1801, {
        spacing: 3.05, startInset: 0.2, endInset: 0.2, sideJitter: 0.06, alongJitter: 0.08,
      }),
    DefenseSpline("WireEastBreachSouth", "东寨缺口南翼蛇腹网", "defenseWireLine",
      [[504, -60.5], [504, -53]], 1901, {
        spacing: 3.05, startInset: 0.2, endInset: 0.2, sideJitter: 0.06, alongJitter: 0.08,
      }),
  ]),
});

export const PROP_PCG_PROFILE_OPTIONS = Object.freeze(
  Object.values(PROP_PCG_PROFILES).map(({ id: value, label }) => Object.freeze({ value, label })),
);
