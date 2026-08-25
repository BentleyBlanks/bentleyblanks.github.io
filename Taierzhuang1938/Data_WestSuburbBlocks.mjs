// 西关城外街区矩形 —— 将《滕县城防示意图》里的每个框解释为一整块建筑用地，
// 而不是一个点状地标。坐标按现有铁路、西关大街和城壕统一压缩；图只提供相对
// 关系，具体米制尺寸均为场景化推定。

import { WEST_SUBURB } from "./Data_Tengxian.mjs";

const FreezeBlock = (block) => Object.freeze({ ry: 0, damage: 0.12, ...block });

/** 已由专用 landmark builder 覆盖的五个有名矩形；通用生成器不重复造一套。 */
export const WEST_SUBURB_NAMED_BLOCKS = Object.freeze([
  FreezeBlock({ id: "StationCompound", label: "车站", kind: "station", landmark: "station",
    x: -452.5, z: -84, w: 35, d: 72, builder: "station", source: WEST_SUBURB.station }),
  FreezeBlock({ id: "CommunicationsCompound", label: "通讯队", kind: "service", landmark: "communications",
    x: -410.5, z: -85, w: 47, d: 150, builder: "communications", source: WEST_SUBURB.communications }),
  FreezeBlock({ id: "PowerPlantCompound", label: "电灯厂", kind: "powerPlant", landmark: "powerPlant",
    x: -410, z: 69, w: 48, d: 50, builder: "powerPlant", source: WEST_SUBURB.powerPlant }),
  FreezeBlock({ id: "ExchangeCompound", label: "交易所", kind: "exchange", landmark: "exchange",
    x: -410, z: 132, w: 48, d: 62, builder: "exchange", source: WEST_SUBURB.exchange }),
  FreezeBlock({ id: "Division122Compound", label: "第122师师部", kind: "headquarters", landmark: "division122",
    x: -366, z: -85, w: 40, d: 150, ry: Math.PI, builder: "division122", source: WEST_SUBURB.division122 }),
]);

/**
 * 图中十五个未标名框。每项都由 BuildWestSuburbBlocks 生成完整院落：多栋低层屋、
 * 院墙和可读的内院空隙。框之间保留 2--7 m 巷道，不把道路也糊成建筑。
 */
export const WEST_SUBURB_BLOCKS = Object.freeze([
  // 北端两排：货场 / 仓院 / 民居，与车站、通讯队、师部的具名长框接合。
  FreezeBlock({ id: "WestRailDepotNorth", label: "北端货场", kind: "railYard",
    x: -452.5, z: -195, w: 35, d: 50, rows: 3, coverageMin: 0.44 }),
  FreezeBlock({ id: "WestWarehouseNorth", label: "北侧无名库场", kind: "warehouse",
    x: -410.5, z: -195, w: 45, d: 50, rows: 3, coverageMin: 0.48 }),
  FreezeBlock({ id: "WestResidenceNorth", label: "北侧无名民居", kind: "residence",
    x: -366, z: -195, w: 40, d: 50, rows: 3, coverageMin: 0.46 }),
  FreezeBlock({ id: "WestRailStoreNorth", label: "站北脚行院", kind: "service",
    x: -452.5, z: -145, w: 35, d: 38, rows: 2, coverageMin: 0.42, related: ["station"] }),

  // 西关大街南肩四格：完整铺院而非 5 m 深的孤立门脸。
  FreezeBlock({ id: "XiguanShopWest", label: "西关南铺院一", kind: "shop",
    x: -458.5, z: 22.5, w: 23, d: 31, rows: 3, coverageMin: 0.50 }),
  FreezeBlock({ id: "XiguanShopMiddle", label: "西关南铺院二", kind: "shop",
    x: -434, z: 22.5, w: 26, d: 31, rows: 3, coverageMin: 0.50 }),
  FreezeBlock({ id: "XiguanShopEast", label: "西关南铺院三", kind: "shop",
    x: -407.5, z: 22.5, w: 25, d: 31, rows: 3, coverageMin: 0.50 }),
  FreezeBlock({ id: "XiguanShopMoat", label: "西关南铺院四", kind: "shop",
    x: -370, z: 22.5, w: 48, d: 31, rows: 4, coverageMin: 0.50 }),

  // 电灯厂一排：厂本体在中间具名框，左右补铁路货场和近壕工役院。
  FreezeBlock({ id: "RailGoodsSouth", label: "电厂西侧货场", kind: "warehouse",
    x: -452.5, z: 69, w: 35, d: 50, rows: 3, coverageMin: 0.48, related: ["powerPlant"] }),
  FreezeBlock({ id: "MoatWorksSouth", label: "电厂东侧工役院", kind: "service",
    x: -365.5, z: 69, w: 39, d: 50, rows: 3, coverageMin: 0.44, related: ["powerPlant"] }),

  // 交易所一排：左右是无名长院，中格由交易所专用 builder 占据。
  FreezeBlock({ id: "RailYardSouth", label: "交易所西侧长院", kind: "railYard",
    x: -452.5, z: 132, w: 35, d: 62, rows: 3, coverageMin: 0.42, related: ["exchange"] }),
  FreezeBlock({ id: "SouthMarketMoat", label: "交易所东侧市院", kind: "shop",
    x: -365.5, z: 132, w: 39, d: 62, rows: 4, coverageMin: 0.48, related: ["exchange"] }),

  // 图最南三格：粮栈、住商混合院和贴壕民居。
  FreezeBlock({ id: "RailSouthFarmBlock", label: "最南铁路侧院", kind: "warehouse",
    x: -452.5, z: 195, w: 35, d: 50, rows: 3, coverageMin: 0.48 }),
  FreezeBlock({ id: "SouthMarketBlock", label: "最南中部院", kind: "shop",
    x: -410, z: 195, w: 48, d: 50, rows: 4, coverageMin: 0.50 }),
  FreezeBlock({ id: "SouthMoatBlock", label: "最南近壕院", kind: "residence",
    x: -365.5, z: 195, w: 39, d: 50, rows: 3, coverageMin: 0.46 }),
]);

export const WEST_SUBURB_ALL_BLOCKS = Object.freeze([
  ...WEST_SUBURB_NAMED_BLOCKS,
  ...WEST_SUBURB_BLOCKS,
]);

export const WEST_SUBURB_CLEARANCES = Object.freeze({
  railway: Object.freeze({ x: WEST_SUBURB.railway.x, half: 9, fromZ: -360, toZ: 400 }),
  westStreet: Object.freeze({ z: WEST_SUBURB.westStreet.z, half: 7,
    fromX: WEST_SUBURB.westStreet.fromX, toX: WEST_SUBURB.westStreet.toX }),
  // 西门外凸段的濠外沿约 x=-344.5；近壕地块统一止于 x=-346。
  moat: Object.freeze({ minX: -344.5, maxX: -318, minZ: -360, maxZ: 400 }),
  wall: Object.freeze({ minX: -318, maxX: -298, minZ: -360, maxZ: 400 }),
  overview: Object.freeze({ minX: -520, maxX: 718, minZ: -360, maxZ: 400 }),
});

