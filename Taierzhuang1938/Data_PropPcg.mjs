// 工事 / 生活用具 PCG 的纯数据真相。不 import three。
//
// 运行时与编辑器都读这一份：profile 说明“一组东西为什么一起出现”，volume 说明
// “哪一片允许出现”。具体落点由 Script_PropPcg 用固定种子、真实院落格与碰撞表生成。
// 资产 id 必须来自 Script_ExternalProps.ExternalPropCatalog；这里不复制 URL、材质或模型。
//
// 两条内容纪律：
//   · 生活用具按使用关系成组（水缸+桶、柴墩+斧、桌+凳），不均匀撒单件；
//   · 工事只补低矮军需/休息/就地取材，不自动生成碉堡、战壕或封路障碍。

export const PROP_PCG_SCHEMA_VERSION = 1;

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
});

const QuarterVolume = (id, label, bounds, seedOffset) => Object.freeze({
  id, label, enabled: true, profile: "householdLife", shape: "cells", bounds,
  seedOffset, chance: 0.16, maxAnchors: 12, attemptsPerAnchor: 26,
  inset: 2.1, minSpacing: 7.5,
});

const DefenseVolume = (id, label, bounds, seedOffset, axisYaw) => Object.freeze({
  id, label, enabled: true, profile: "defenseSupport", shape: "rect", bounds,
  seedOffset, count: 5, attemptsPerAnchor: 42, minSpacing: 12,
  inset: 0.8, axisYaw,
});

/**
 * 出厂布设文档。生活组只在 PlanBlocks 生成的真实院落格里落点；城防组只在四面
 * 顺城街墙根带补低矮物资，四门洞、马道和缺口由分段 volume 主动绕开。
 */
export const PROP_PCG_DOCUMENT = Object.freeze({
  version: PROP_PCG_SCHEMA_VERSION,
  seed: 19380317,
  volumes: Object.freeze([
    QuarterVolume("LifeNortheast", "东北片院落", { minX: 4, maxX: 282, minZ: -282, maxZ: -4 }, 101),
    QuarterVolume("LifeNorthwest", "西北片院落", { minX: -282, maxX: -4, minZ: -282, maxZ: -4 }, 211),
    QuarterVolume("LifeSoutheast", "东南片院落", { minX: 4, maxX: 282, minZ: 4, maxZ: 282 }, 307),
    QuarterVolume("LifeSouthwest", "西南片院落", { minX: -282, maxX: -4, minZ: 4, maxZ: 282 }, 401),
    DefenseVolume("DefenseSouthWest", "南墙西段补给", { minX: -260, maxX: 42, minZ: 286, maxZ: 293 }, 503, 0),
    DefenseVolume("DefenseSouthEast", "南墙东段补给", { minX: 116, maxX: 262, minZ: 286, maxZ: 293 }, 601, 0),
    DefenseVolume("DefenseEastNorth", "东墙北段补给", { minX: 286, maxX: 293, minZ: -264, maxZ: -104 }, 701, Math.PI / 2),
    DefenseVolume("DefenseEastSouth", "东墙南段补给", { minX: 286, maxX: 293, minZ: 104, maxZ: 258 }, 809, Math.PI / 2),
    DefenseVolume("DefenseWest", "西墙补给", { minX: -293, maxX: -286, minZ: 42, maxZ: 258 }, 907, Math.PI / 2),
    DefenseVolume("DefenseNorthEast", "北墙东段补给", { minX: 0, maxX: 258, minZ: -293, maxZ: -286 }, 1009, 0),
  ]),
});

export const PROP_PCG_PROFILE_OPTIONS = Object.freeze(
  Object.values(PROP_PCG_PROFILES).map(({ id: value, label }) => Object.freeze({ value, label })),
);
