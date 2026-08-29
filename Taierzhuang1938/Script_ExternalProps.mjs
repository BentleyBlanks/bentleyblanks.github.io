// 滕县白盒里那批**下载来的** .glb 布景（区别于 _blender 出的 .tzm.json 与
// Script_World / Script_LivedInProps 的程序化几何）。
//
// 【2026-08-25 这一轮做的事：把它们从"贴图布景"变成真的场上物体。】
//
// 在这之前这一层是明确的"只画不碰"：collision / navigation / destruction 一律
// 归程序化建造器，理由是"别让一个下载来的装饰网格悄悄改掉 AI 路线"。
// 这条理由本身没错 —— 错的是它掩盖了三件更基础的事，全部从运行时取证：
//
//   · **模型自带的原点不在脚底。** 手推车的包围盒在 y = 59.58…60.76 m，
//     而摆位只写了 `position.y = groundAt(x, z)` —— 五关的手推车全都悬在
//     六十米高的天上。乡村房屋悬空 7.4 m，木箱 0.9 m，砖瓦堆 1.0 m。
//   · **原点在 XZ 上也不居中。** 木箱的几何在 z = +0.59…+1.31，
//     摆位坐标写的是哪儿，东西就不在哪儿。
//   · 于是"没有碰撞体"这一条**根本没法单独修**：给一辆天上的车加碰撞盒
//     只会在天上多一个隐形方块。
//
// 所以现在这一层做三件事，顺序不能反：
//   1. `PrepareAsset` —— 取出该资产的节点（多件共用一个 .glb 时按 spec.node 取），
//      按它**自己的**包围盒落地并 XZ 居中，原点变成"底面几何中心"；
//   2. 上材质、摆位。正片摆位自 2026-08-26 起走 GPU instancing：
//      `InstancedFormFor` 把 shell 按运行时材质合并成「每资产每材质一份几何」，
//      流送半径内的件是 PropBatcher 桶里的实例矩阵（Script_PropBatch），
//      不再逐件 clone；`CloneLoadedAsset` 保留给编辑器摄影棚、无实例化形态的
//      个别件与测试开关对比；
//   3. `AddExternalProps` 顺手吐一份碰撞盒（每件一只**带朝向的**长方体，
//      与程序化民居登记的粒度一致），由调用方并进 field.colliders。
//
// 「别让装饰网格改掉 AI 路线」这条担心仍然成立，只是答案变了：这些摆位是
// **写死的常量**（下面 PLACEMENTS 一个随机数都没有），照它生成的碰撞盒同样是
// 常量。确定性没丢，丢的是"看得见摸不着"。
//
// 还没改的一条（留给美术定夺，不在这一轮里）：houseRow / housePair 两个模型
// 自带的尺度偏小 —— 排屋整体高 1.70 m、双栋高 2.96 m，比 1.66 m 的士兵高不了
// 多少，而 docs/Data_HistoryMaterial.md 记的鲁南民居脊高是 4.0—4.8 m。
// 等比放大会把 10 m 长的排屋拉到二十几米，会不会撞上旁边的程序化院落要另外量。

import * as THREE from "three";
import { GLTFLoader } from "./vendor/three/examples/jsm/loaders/GLTFLoader.js";
import {
  BuildSink, EXTERNAL_SANDBAG_ASSET_IDS, EXTERNAL_LEAFLESS_TREE_ASSET_IDS,
} from "./Script_World.mjs";
import { OVERVIEW_BOUNDS } from "./Data_Battle.mjs";
import { OVERVIEW_LEVEL_ID } from "./Data_Menu.mjs";
import { TownDressingFor } from "./Script_TownDressing.mjs";
import { PropStreamer } from "./Script_PropStreaming.mjs";
import { PropBatcher } from "./Script_PropBatch.mjs";
import { MergeGeometries, TILE_METERS } from "./Script_Geo.mjs";
import { ResolveTengxianMaterial } from "./Script_TengxianCity.mjs";
// 并行下载工作包各交一份目录片段（PACK.url + 无 url 的 ASSETS 表），此处接线。
import { PACK as HW_PACK, ASSETS as HW_ASSETS } from "./Data_ExternalAssets_HouseholdWare.mjs";
import { PACK as RY_PACK, ASSETS as RY_ASSETS } from "./Data_ExternalAssets_RuralYard.mjs";
import { PACK as CL_PACK, ASSETS as CL_ASSETS } from "./Data_ExternalAssets_ChineseLife.mjs";

const LOADER = new GLTFLoader();

const BATTLEFIELD_URL = "./Model/Model_BattlefieldPack.glb?v=2";
const BARBED_WIRE_URL = "./Model/Model_BarbedWireSet.glb?v=1";
const MARKET_STORAGE_URL = "./Model/Model_MarketStorageSet.glb?v=2";
const CITY_WALL_BREACH_URL = "./Model/Model_CityWallBreachPack.glb?v=2";
const CITY_WALL_DETAIL_URL = "./Model/Model_CityWallDetailPack.glb?v=1";
const LEAFLESS_TREE_URL = "./Model/Model_LeaflessTreeSet.glb?v=1";

function BattlefieldAsset(label, node, material, tag = "prop", solid = true,
  category = "院落小件") {
  return { label, url: BATTLEFIELD_URL, node, materialMap: true, material, tag, solid, category };
}

function BarbedWireAsset(label, node) {
  // 原 Battlefield Pack 两个同名源节点都只是 80 三角的无刺螺旋线，近看就是
  // 多边形弹簧。保留资产 id 与摆位契约，改由本项目可复现烘焙的有刺障碍网格承接。
  return {
    label, url: BARBED_WIRE_URL, node, materialMap: true,
    material: null, tag: "fence", solid: true, category: "工事",
  };
}

const BATTLEFIELD_ASSETS = Object.freeze({
  battlefieldBarbedWire01: BarbedWireAsset("铁丝网 · 蛇腹障碍", "BattlefieldBarbedWire01"),
  battlefieldBarbedWire02: BarbedWireAsset("铁丝网 · 三道桩网", "BattlefieldBarbedWire02"),
  battlefieldBeamObstacle01: BattlefieldAsset("战场包 · 木梁障碍 01", "BattlefieldBeamObstacle01", null, "barricade", true, "工事"),
  battlefieldBeamObstacle02: BattlefieldAsset("战场包 · 木梁障碍 02", "BattlefieldBeamObstacle02", null, "barricade", true, "工事"),
  battlefieldSupplyBox: BattlefieldAsset("战场包 · 补给箱", "BattlefieldSupplyBox", null),
  battlefieldCanvasCover01: BattlefieldAsset("战场包 · 掩布 01", "BattlefieldCanvasCover01", null),
  battlefieldCompartmentCrate: BattlefieldAsset("战场包 · 分格弹药箱", "BattlefieldCompartmentCrate", null),
  battlefieldShellStack: BattlefieldAsset("战场包 · 炮弹堆", "BattlefieldShellStack", null),
  battlefieldGrenadeStack: BattlefieldAsset("战场包 · 手榴弹堆", "BattlefieldGrenadeStack", null),
  battlefieldCartridgeScatter: BattlefieldAsset("战场包 · 散落弹药", "BattlefieldCartridgeScatter", null),
  battlefieldCanvasCover02: BattlefieldAsset("战场包 · 掩布 02", "BattlefieldCanvasCover02", null),
  battlefieldHedgehog: BattlefieldAsset("战场包 · 拒马", "BattlefieldHedgehog", null, "barricade", true, "工事"),
  battlefieldOpenBin: BattlefieldAsset("战场包 · 敞口容器", "BattlefieldOpenBin", null),
  battlefieldGroundSheet: BattlefieldAsset("战场包 · 地面帆布", "BattlefieldGroundSheet", null, "prop", false),
  battlefieldTimberBeam: BattlefieldAsset("战场包 · 木梁", "BattlefieldTimberBeam", null),
  battlefieldMetalPole: BattlefieldAsset("战场包 · 金属杆", "BattlefieldMetalPole", null),
  battlefieldPillbox: BattlefieldAsset("战场包 · 碉堡", "BattlefieldPillbox", null, "wall", true, "工事"),
  battlefieldLadder: BattlefieldAsset("战场包 · 梯子", "BattlefieldLadder", null),
  battlefieldTrenchEarthwork: BattlefieldAsset("战场包 · 战壕地形", "BattlefieldTrenchEarthwork", null, "rubble", false, "工事"),
  battlefieldSandbag01: BattlefieldAsset("战场包 · 沙袋 01", "BattlefieldSandbag01", null, "barricade", true, "工事"),
  battlefieldSandbag02: BattlefieldAsset("战场包 · 沙袋 02", "BattlefieldSandbag02", null, "barricade", true, "工事"),
  battlefieldSandbag03: BattlefieldAsset("战场包 · 沙袋 03", "BattlefieldSandbag03", null, "barricade", true, "工事"),
  battlefieldGroundPlane: BattlefieldAsset("战场包 · 地面片", "BattlefieldGroundPlane", null, "rubble", false, "景观"),
  battlefieldRock: BattlefieldAsset("战场包 · 岩石", "BattlefieldRock", null, "rubble", true, "景观"),
});

function CityWallBreachAsset(label, node) {
  // 破口主体仍由程序化城墙提供碰撞；这些模块跨在既有墙盒与通行口两侧，只负责
  // 不规则断面和瓦砾轮廓，重复登记一个大 AABB 会把中央净宽重新封死。
  return {
    label, url: CITY_WALL_BREACH_URL, node, materialMap: true,
    tag: "rubble", solid: false, category: "工事", projectUvs: false,
  };
}

const CITY_WALL_BREACH_ASSETS = Object.freeze({
  cityWallBreachShoulderLeft: CityWallBreachAsset(
    "城墙缺口 · 左断肩", "CityWallBreachShoulderLeft"),
  cityWallBreachShoulderRight: CityWallBreachAsset(
    "城墙缺口 · 右断肩", "CityWallBreachShoulderRight"),
  cityWallBreachDebrisFan: CityWallBreachAsset(
    "城墙缺口 · 双向瓦砾扇", "CityWallBreachDebrisFan"),
  cityWallBreachBrickCluster01: CityWallBreachAsset(
    "城墙缺口 · 残砖簇 01", "CityWallBreachBrickCluster01"),
  cityWallBreachBrickCluster02: CityWallBreachAsset(
    "城墙缺口 · 残砖簇 02", "CityWallBreachBrickCluster02"),
  cityWallBreachCoping01: CityWallBreachAsset(
    "城墙缺口 · 坠落压顶石 01", "CityWallBreachCoping01"),
  cityWallBreachCoping02: CityWallBreachAsset(
    "城墙缺口 · 坠落压顶石 02", "CityWallBreachCoping02"),
});

function CityWallDetailAsset(label, node) {
  // 全部贴附在既有城墙碰撞面上，只增加近景轮廓与材质层次；登记盒体会在墙外
  // 平白造出隐形台阶，也会让子弹在装饰层上提前命中。
  return {
    label, url: CITY_WALL_DETAIL_URL, node, materialMap: true,
    tag: "wallDetail", solid: false, category: "工事", projectUvs: false,
  };
}

const CITY_WALL_DETAIL_ASSETS = Object.freeze({
  cityWallRepairPatchLarge: CityWallDetailAsset(
    "城墙细节 · 大片补砖", "CityWallRepairPatchLarge"),
  cityWallRepairPatchSmall: CityWallDetailAsset(
    "城墙细节 · 小片补砖", "CityWallRepairPatchSmall"),
  cityWallDrainSpout: CityWallDetailAsset(
    "城墙细节 · 石框泄水嘴", "CityWallDrainSpout"),
  cityWallRootSpall: CityWallDetailAsset(
    "城墙细节 · 勒脚剥落", "CityWallRootSpall"),
  cityWallCopingBrokenRun: CityWallDetailAsset(
    "城墙细节 · 破损压顶", "CityWallCopingBrokenRun"),
  cityWallShellScar: CityWallDetailAsset(
    "城墙细节 · 炮弹着痕", "CityWallShellScar"),
  cityWallCoreExposurePatch: CityWallDetailAsset(
    "城墙细节 · 小面积露芯", "CityWallCoreExposurePatch"),
});

function MarketStorage(label, node, material = "WoodCrate") {
  return { label, url: MARKET_STORAGE_URL, node, material, tag: "prop", category: "院落小件" };
}

/**
 * 资产表。
 *
 * `tag` 决定三件事，全部照 Data_Destruction 的 TAG_PROFILE 与 Script_Main 的
 * SURFACE_BY_TAG 走：吃多少火力、打上去出什么屑、出什么声。用的都是**那两张表
 * 里已经有的 tag**，别为这一层新编一套。
 *
 * `solid: false` = 确实不该挡人的那一类。**目前一件都没有** —— 留着这个口子是
 * 因为下一个下载来的布景很可能是墙上的爬藤或者地上的车辙。
 * 最小的可堆石块只有 0.22 m 高，照样登记：它在 0.56 m 的跨越判据之下，
 * 进不了导航图，人一步就迈过去，但子弹打得中、身子穿不过。
 */
/** 资产包片段 → 总表条目（补上包级 url）。 */
function PackAssets(pack, table) {
  const out = {};
  for (const [id, spec] of Object.entries(table)) {
    out[id] = { category: "院落小件", ...spec, url: pack.url };
  }
  return out;
}

const ASSETS = Object.freeze({
  house: { label: "乡村房屋", url: "./Model/Model_ChineseRuralHouse.glb?v=3", material: null, tag: "wall", category: "建筑" },
  houseRow: { label: "民居排屋", url: "./Model/Model_AsianHouseRow.glb?v=2", material: null, tag: "wall", category: "建筑" },
  housePair: { label: "民居双栋", url: "./Model/Model_AsianHousePair.glb?v=2", material: null, tag: "wall", category: "建筑" },
  sandbag: { label: "沙袋", url: "./Model/Model_Sandbag.glb?v=2", material: null, tag: "barricade", category: "工事" },
  cart: {
    label: "市场木制手推车", url: "./Model/Model_Handcart.glb?v=2",
    materialMap: { WoodBeam: "HandcartWood" }, tag: "householdCart", category: "院落小件",
  },
  fence: { label: "木栅栏", url: "./Model/Model_WoodFence.glb?v=1", material: "WattleFence", tag: "fence", category: "工事" },
  crate: { label: "木箱", url: "./Model/Model_WoodCrate.glb?v=1", material: "WoodCrate", tag: "prop", category: "院落小件" },
  rubble: { label: "砖瓦堆", url: "./Model/Model_BrickRubble.glb?v=1", material: "GroundRubble", tag: "rubble", category: "院落小件" },
  militaryCrateClosed: {
    label: "旧式军用木箱（闭合）", url: "./Model/Model_MilitaryCrateSet.glb?v=1",
    node: "MilitaryCrateClosed", material: "WoodCrate", tag: "prop", category: "院落小件",
  },
  militaryCrateOpen: {
    label: "旧式军用木箱（打开）", url: "./Model/Model_MilitaryCrateSet.glb?v=1",
    node: "MilitaryCrateOpen", material: "WoodCrate", tag: "prop", category: "院落小件",
  },
  stackableStone01: { label: "可堆石块 01", url: "./Model/Model_StackableStoneSet.glb?v=1", node: "StackableStone01", material: "GroundRubble", tag: "rubble", category: "院落小件" },
  stackableStone02: { label: "可堆石块 02", url: "./Model/Model_StackableStoneSet.glb?v=1", node: "StackableStone02", material: "GroundRubble", tag: "rubble", category: "院落小件" },
  stackableStone03: { label: "可堆石块 03", url: "./Model/Model_StackableStoneSet.glb?v=1", node: "StackableStone03", material: "GroundRubble", tag: "rubble", category: "院落小件" },
  stackableStone04: { label: "可堆石块 04", url: "./Model/Model_StackableStoneSet.glb?v=1", node: "StackableStone04", material: "GroundRubble", tag: "rubble", category: "院落小件" },
  stackableStone05: { label: "可堆石块 05", url: "./Model/Model_StackableStoneSet.glb?v=1", node: "StackableStone05", material: "GroundRubble", tag: "rubble", category: "院落小件" },
  stackableStone06: { label: "可堆石块 06", url: "./Model/Model_StackableStoneSet.glb?v=1", node: "StackableStone06", material: "GroundRubble", tag: "rubble", category: "院落小件" },
  stackableStone07: { label: "可堆石块 07", url: "./Model/Model_StackableStoneSet.glb?v=1", node: "StackableStone07", material: "GroundRubble", tag: "rubble", category: "院落小件" },
  deadTreeTrunk01: { label: "无叶枯树干 01", url: "./Model/Model_DeadTreeTrunkSet.glb?v=1", node: "DeadTreeTrunk01", material: "WoodBeam", tag: "deadTree", category: "景观" },
  deadTreeTrunk02: { label: "无叶枯树干 02", url: "./Model/Model_DeadTreeTrunkSet.glb?v=1", node: "DeadTreeTrunk02", material: "WoodBeam", tag: "deadTree", category: "景观" },
  leaflessTreeOak: { label: "无叶乔木 · 老橡树", url: LEAFLESS_TREE_URL, node: "LeaflessTreeOak", material: "TreeBark", tag: "prop", solid: false, category: "景观" },
  leaflessTree01: { label: "无叶乔木 · 枝展型", url: LEAFLESS_TREE_URL, node: "LeaflessTree01", material: "TreeBark", tag: "prop", solid: false, category: "景观" },
  leaflessTreeLowPoly: { label: "无叶乔木 · 疏枝型", url: LEAFLESS_TREE_URL, node: "LeaflessTreeLowPoly", material: "TreeBark", tag: "prop", solid: false, category: "景观" },
  courtyardHouse: {
    label: "中式四合院", url: "./Model/Model_AncientChineseCourtyardHouse.glb?v=1",
    node: "AncientChineseCourtyardHouse", materialMap: true, tag: "wall", category: "建筑",
  },
  marketRiceSack01: MarketStorage("市场米袋 01", "MarketRiceSack01", "Sandbag"),
  marketRiceSack02: MarketStorage("市场米袋 02", "MarketRiceSack02", "Sandbag"),
  marketBox01: MarketStorage("市场木箱 01", "MarketBox01"),
  marketBox02: MarketStorage("市场木箱 02", "MarketBox02"),
  marketBox03: MarketStorage("市场木箱 03", "MarketBox03"),
  marketCrate01: MarketStorage("市场板条箱 01", "MarketCrate01"),
  marketCrate02: MarketStorage("市场板条箱 02", "MarketCrate02"),
  marketCrate03: MarketStorage("市场板条箱 03", "MarketCrate03"),
  marketCrate04: MarketStorage("市场板条箱 04", "MarketCrate04"),
  ...BATTLEFIELD_ASSETS,
  ...CITY_WALL_BREACH_ASSETS,
  ...CITY_WALL_DETAIL_ASSETS,
  ...PackAssets(HW_PACK, HW_ASSETS),
  ...PackAssets(RY_PACK, RY_ASSETS),
  ...PackAssets(CL_PACK, CL_ASSETS),
});

// Exact sites are a compact, intentional dressing pass rather than random
// scenery.  All positions are already world coordinates (X east, Z south).
//
// 【摆位的一条新规矩，2026-08-25】这些东西从今天起是**实心的**，所以摆位不能
// 再只按"看着顺眼"来：没有碰撞时它们是透明的，双方隔着它对射毫无影响；
// 一给碰撞，一栋 10 m 长的排屋就是一堵墙。
//
// 取证用三百秒停摆探针（Script_PlayTest 12.14，二·东关头六十秒的全场开火数）：
// 原样加碰撞 126 → 78；把横在交战轴上的那一栋排屋挪开之后回到 113。
// 下面两处带注释的摆位就是这么挪的。
//
// **但别拿这个数字当旋钮拧。** 三百秒后半段的开火数是混沌的：同一份代码
// 在改动前三次分别是 65 / 25 / 65；而"挡掉最多火力"的那栋房子（462,-144）
// 按真实交战连线采样（5907 条）**一条都没挡**，两军最近敌距反而更小。
// 除了"整堵墙横在轴上"这种量得出机理的情形，剩下的波动是 AI 决策的蝴蝶效应。
// 判据只认两条讲得出道理的：**不压进既有院墙、不横在目标与目标之间的连线上**。
const PLACEMENTS = Object.freeze({
  L0_Jiehe: [
    { asset: "fence", x: -88, z: -1362, ry: 0.14 },
    { asset: "fence", x: 76, z: -1336, ry: -0.22 },
    { asset: "rubble", x: -32, z: -1300, ry: 0.48, scale: 0.78 },
    { asset: "courtyardHouse", x: 128, z: -1352, ry: -0.08, scale: 0.92 },
  ],
  CH1_NanLu: [
    { asset: "house", x: -1224, z: -164, ry: 0.04 },
    { asset: "houseRow", x: -1152, z: -208, ry: -0.1 },
    { asset: "sandbag", x: -1210, z: -140, ry: 0.35 },
    { asset: "cart", x: -1192, z: -121, ry: 0.22 },
    { asset: "crate", x: -1190, z: -119, ry: -0.15, scale: 0.96 },
    { asset: "fence", x: -1260, z: -104, ry: 0.05 },
    { asset: "rubble", x: -1170, z: -176, ry: -0.31, scale: 0.84 },
    { asset: "militaryCrateClosed", x: -1186, z: -117, ry: 0.28 },
    { asset: "stackableStone02", x: -1238, z: -151, ry: 0.7 },
    { asset: "stackableStone04", x: -1237.5, z: -150.7, ry: -0.2, scale: 0.72 },
    { asset: "deadTreeTrunk01", x: -1268, z: -183, ry: 0.5 },
  ],
  CH2_Shouliudan: [
    { asset: "house", x: 462, z: -144, ry: 0.03 },
    { asset: "housePair", x: 428, z: -178, ry: 0.06 },
    // 原来在 (500, -60)：正落在第四个目标圈（500,-65 半径 22）里，10 m 的长边
    // 又几乎顺着 Z 摆，等于在日军（x≈556）与守军（x≈472）之间横一堵墙。
    // 往南挪 40 m 到关厢后排，长边照旧顺街，交战轴让出来。
    // 再挪：(500,-100) 带上碰撞后正好压死第三条南北巷（x≈504±1.25）——
    // 与批次C 的 731 营两院（封住巷2一带）叠加，东关中段三条通路全断，
    // 300 秒火力浸泡在 140 s 后停摆（两军隔墙互相摸不到，取证见停摆探针）。
    // 移到巷3 与地隙之间的后排（x 518），三条巷都让开。
    { asset: "houseRow", x: 518, z: -100, ry: -0.12 },
    { asset: "cart", x: 485, z: -96, ry: -0.28, scale: 0.9 },
    { asset: "crate", x: 479, z: -94, ry: 0.18, scale: 0.92 },
    { asset: "rubble", x: 504, z: 18, ry: 0.46, scale: 1.05 },
    { asset: "militaryCrateOpen", x: 477, z: -91, ry: -0.48 },
    { asset: "stackableStone06", x: 521, z: 12, ry: 0.9, scale: 0.85 },
  ],
  CH4_DongguanYe: [
    { asset: "cart", x: 468, z: -54, ry: 0.16, scale: 0.86 },
    { asset: "crate", x: 471, z: -52, ry: -0.22, scale: 0.88 },
    { asset: "housePair", x: 508, z: -30, ry: -0.08 },
    { asset: "rubble", x: 516, z: 14, ry: 0.32, scale: 1.0 },
    { asset: "marketRiceSack01", x: 473, z: -50, ry: 0.38 },
    { asset: "marketBox01", x: 471.8, z: -49.5, ry: -0.16 },
  ],
  CH3_Jiuhusuo: [
    // 东墙缺口（世界 305,-15）：两只断肩把墙皮、夯土芯和真实墙厚连成 V 形，
    // 瓦砾扇跨墙内外但中间留 3.8 m 净槽，玩家与补位 AI 仍沿缺口通过。
    { asset: "cityWallBreachShoulderLeft", x: 305, z: -7.5, ry: Math.PI / 2 },
    { asset: "cityWallBreachShoulderRight", x: 305, z: -22.5, ry: Math.PI / 2 },
    { asset: "cityWallBreachDebrisFan", x: 305, z: -15, ry: Math.PI / 2 },
    { asset: "cityWallBreachBrickCluster01", x: 312.8, z: -5.8, ry: 1.08, scale: 0.92 },
    { asset: "cityWallBreachBrickCluster02", x: 298.2, z: -25.5, ry: -0.62, scale: 0.86 },
    { asset: "cityWallBreachCoping01", x: 312.4, z: -21.4, ry: 1.86 },
    { asset: "cityWallBreachCoping02", x: 298.0, z: -6.8, ry: 0.72 },

    // 南墙缺口（世界 285,305）：参考手绘把靠东南角的炮击口做得更宽、更不对称。
    // 内外各有坍塌扇，断下来的压顶石落在两肩，不把 L4 的目标轴横向封死。
    { asset: "cityWallBreachShoulderLeft", x: 275.4, z: 305, ry: 0 },
    { asset: "cityWallBreachShoulderRight", x: 294.6, z: 305, ry: 0 },
    { asset: "cityWallBreachDebrisFan", x: 285, z: 305, ry: 0, scale: 1.08 },
    { asset: "cityWallBreachBrickCluster01", x: 273.2, z: 313.0, ry: 0.42, scale: 1.05 },
    { asset: "cityWallBreachBrickCluster02", x: 297.5, z: 298.0, ry: -0.74, scale: 0.94 },
    { asset: "cityWallBreachCoping01", x: 276.0, z: 297.8, ry: 0.34 },
    { asset: "cityWallBreachCoping02", x: 294.8, z: 312.2, ry: -0.48 },

    // 完整墙段也要有真实建模层。四面墙各布一组补砖、泄水嘴、勒脚剥落、
    // 破压顶与弹着疤；yOffset 从墙基起量，不把贴墙件错误吸到地面。
    // 南墙（避开 x=70 城门与 x=285 缺口）
    { asset: "cityWallRepairPatchLarge", x: -214, z: 309.45, ry: 0, yOffset: 3.1 },
    { asset: "cityWallDrainSpout", x: -116, z: 308.35, ry: 0, yOffset: 8.25 },
    { asset: "cityWallShellScar", x: -20, z: 309.05, ry: 0, yOffset: 4.7 },
    { asset: "cityWallCoreExposurePatch", x: 156, z: 309.0, ry: 0, yOffset: 5.2 },
    { asset: "cityWallRootSpall", x: 220, z: 310.05, ry: 0 },
    { asset: "cityWallCopingBrokenRun", x: -254, z: 307.55, ry: 0, yOffset: 11.46 },
    // 北墙（避开 x=-145 城门）
    { asset: "cityWallRepairPatchSmall", x: -244, z: -308.7, ry: Math.PI, yOffset: 6.6 },
    { asset: "cityWallShellScar", x: -52, z: -309.15, ry: Math.PI, yOffset: 4.0 },
    { asset: "cityWallDrainSpout", x: 48, z: -308.25, ry: Math.PI, yOffset: 8.35 },
    { asset: "cityWallRepairPatchLarge", x: 154, z: -309.45, ry: Math.PI, yOffset: 2.7 },
    { asset: "cityWallRootSpall", x: 236, z: -310.05, ry: Math.PI },
    { asset: "cityWallCopingBrokenRun", x: 266, z: -307.55, ry: Math.PI, yOffset: 11.46 },
    // 东墙（避开 z=-65 城门、z=-15 缺口与马面）
    { asset: "cityWallRootSpall", x: 310.05, z: -242, ry: Math.PI / 2 },
    { asset: "cityWallRepairPatchSmall", x: 308.7, z: -174, ry: Math.PI / 2, yOffset: 6.2 },
    { asset: "cityWallDrainSpout", x: 308.3, z: 66, ry: Math.PI / 2, yOffset: 8.3 },
    { asset: "cityWallShellScar", x: 309.1, z: 142, ry: Math.PI / 2, yOffset: 4.4 },
    { asset: "cityWallCoreExposurePatch", x: 308.85, z: 224, ry: Math.PI / 2, yOffset: 5.5 },
    { asset: "cityWallCopingBrokenRun", x: 307.55, z: 266, ry: Math.PI / 2, yOffset: 11.46 },
    // 西墙（避开 z=0 城门）
    { asset: "cityWallRepairPatchLarge", x: -309.45, z: -226, ry: -Math.PI / 2, yOffset: 3.0 },
    { asset: "cityWallDrainSpout", x: -308.35, z: -126, ry: -Math.PI / 2, yOffset: 8.2 },
    { asset: "cityWallShellScar", x: -309.0, z: 74, ry: -Math.PI / 2, yOffset: 5.1 },
    { asset: "cityWallRepairPatchSmall", x: -308.65, z: 152, ry: -Math.PI / 2, yOffset: 6.7 },
    { asset: "cityWallRootSpall", x: -310.05, z: 226, ry: -Math.PI / 2 },
    { asset: "cityWallCopingBrokenRun", x: -307.55, z: 272, ry: -Math.PI / 2, yOffset: 11.46 },

    { asset: "rubble", x: 307, z: -67, ry: 0.52, scale: 1.18 },
    { asset: "crate", x: 260, z: -89, ry: -0.18, scale: 0.92 },
    { asset: "sandbag", x: 252, z: -80, ry: 0.42 },
    { asset: "sandbag", x: 257, z: -76, ry: -0.28, scale: 0.94 },
    { asset: "sandbag", x: 248, z: -85, ry: 0.88, scale: 0.9 },
    { asset: "stackableStone01", x: 303, z: -65, ry: 0.18 },
    { asset: "stackableStone03", x: 304, z: -64.7, ry: -0.42, scale: 0.82 },
    { asset: "stackableStone05", x: 304.3, z: -64.4, ry: 0.62, scale: 0.68 },
    { asset: "stackableStone07", x: 310, z: -70, ry: -0.3, scale: 0.76 },
  ],
  CH5_Chengqiang: [
    { asset: "cart", x: 112, z: -38, ry: 0.38, scale: 0.84 },
    { asset: "crate", x: 116, z: -36, ry: -0.22, scale: 0.86 },
    { asset: "houseRow", x: 84, z: -70, ry: 0.22 },
    { asset: "sandbag", x: 100, z: -52, ry: -0.4 },
    { asset: "rubble", x: -66, z: 44, ry: 0.18, scale: 0.92 },
    { asset: "deadTreeTrunk02", x: -72, z: 51, ry: -0.44, scale: 0.9 },
  ],
  CH6_Zuihou: [
    { asset: "cart", x: -188, z: -128, ry: 0.18, scale: 0.82 },
    { asset: "crate", x: -184, z: -127, ry: -0.14, scale: 0.84 },
    // 原来在 (-224, -160)：压在北门通往城北两个目标（-145,-296 与
    // 0,-520）的那条对角线上，两条通视一起被这一栋挡掉。往西让 9 m 就都让开了
    // （空位是扫出来的：不压进既有院墙、也不落在任何一条目标连线上）。
    { asset: "housePair", x: -232, z: -164, ry: 0.12 },
    { asset: "sandbag", x: -176, z: -118, ry: 0.55 },
    { asset: "rubble", x: -246, z: -36, ry: 0.41, scale: 0.96 },
  ],
});

/**
 * 全城俯瞰（`?phase=overview`）那一片**自己没有手摆件** —— 它要的正是
 * 「城里该有的都在」：城墙那一整套修补/泄水嘴/压顶/两处缺口是登记在
 * `CH3_Jiuhusuo` 名下的，东关那几件在 CH2/CH4 名下，谁都不在 `Overview` 名下。
 * 不补这一条，Wall_* 那批采样点与 Z18—Z21 的墙面专项拍出来就是**光墙**。
 *
 * **按 bounds 现算，不手抄一份副本**：手抄的那一刻就开始过期 —— 下一个人往 CH3
 * 加一处墙面修补，俯瞰这一片会悄悄少一件，而少了什么没有任何测试看得出来。
 * 去重按「资产 + 坐标」：同一处东西被两章各登记一次是常事（东关那几件就是）。
 */
const OVERVIEW_PLACEMENTS = (() => {
  const seen = new Set();
  const out = [];
  for (const [levelId, list] of Object.entries(PLACEMENTS)) {
    if (levelId === "L0_Jiehe") continue;            // 城北二十公里，不在这一片里
    for (const entry of list) {
      if (entry.x < OVERVIEW_BOUNDS.minX || entry.x > OVERVIEW_BOUNDS.maxX
        || entry.z < OVERVIEW_BOUNDS.minZ || entry.z > OVERVIEW_BOUNDS.maxZ) continue;
      const key = `${entry.asset}@${entry.x.toFixed(2)},${entry.z.toFixed(2)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(entry);
    }
  }
  return Object.freeze(out);
})();

// Several catalog entries intentionally share one GLB. Cache by URL so seven
// stones cost one request and one parsed source scene instead of seven.
const cache = new Map();
// 归一化之后的外壳按**资产 id** 缓存 —— 同一个 .glb 里的七块石头各有各的原点，
// 落地量必须一件一件算，不能跟着 URL 走。
const prepared = new Map();
let liveRoot = null;
let liveStreamer = null;

/**
 * 下载模型的 UV 是给它原来的 atlas / 扫描贴图画的，不是给本项目的平铺 PBR
 * 配方画的。把 WoodBeam / Stone 直接套上去会把整张贴图挤进一个窄 UV 岛，
 * 木轮、井台和农具就出现一圈圈粗黑条，看起来像贴图损坏。
 *
 * 这里按顶点法线的主轴做确定性的 box projection，坐标直接使用模型米制位置，
 * 所以纹理密度与 Script_Geo 的程序化几何共用 TILE_METERS。外部房屋保留作者
 * 原贴图，不进这条；城墙破口的 UV 是本项目离线明确铺过的，也由 projectUvs:false
 * 保留。其余运行时重绑项目材质的 GLB 全部走这一条。
 */
function RuntimeTileMeters(name) {
  if (/Steel|Iron|Metal/i.test(name)) return TILE_METERS.steel;
  if (/Ground/i.test(name)) return TILE_METERS.ground;
  if (/Roof/i.test(name)) return TILE_METERS.roof;
  if (/Adobe|Rammed/i.test(name)) return TILE_METERS.adobe;
  if (/Brick/i.test(name)) return TILE_METERS.brick;
  if (/Stone|Ashlar|Ceramic|Rubble/i.test(name)) return TILE_METERS.stone;
  if (/Cloth|Straw/i.test(name)) return TILE_METERS.cloth;
  if (/Sandbag|Wicker/i.test(name)) return TILE_METERS.sandbag;
  return TILE_METERS.wood;
}

function ProjectRuntimeUv(geometry, materialName) {
  const position = geometry?.attributes?.position;
  const normal = geometry?.attributes?.normal;
  if (!position || !normal) return geometry;
  const projected = geometry.clone();
  const uv = new Float32Array(position.count * 2);
  const tile = RuntimeTileMeters(materialName);
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
    const nx = normal.getX(i), ny = normal.getY(i), nz = normal.getZ(i);
    const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
    let u, v;
    if (ax >= ay && ax >= az) {
      u = (nx >= 0 ? -z : z) / tile;
      v = y / tile;
    } else if (ay >= az) {
      u = x / tile;
      v = (ny >= 0 ? z : -z) / tile;
    } else {
      u = (nz >= 0 ? x : -x) / tile;
      v = y / tile;
    }
    uv[i * 2] = u;
    uv[i * 2 + 1] = v;
  }
  projected.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  projected.userData.externalUvProjection = { material: materialName, tileMeters: tile };
  return projected;
}

function PrepareRuntimeUvs(root, spec) {
  if (spec.projectUvs === false || (!spec.material && !spec.materialMap)) return;
  root.traverse((object) => {
    if (!object.isMesh || Array.isArray(object.material)) return;
    const materialName = spec.material || MappedMaterialName(object.material, spec);
    object.geometry = ProjectRuntimeUv(object.geometry, materialName);
  });
}

async function LoadSource(id) {
  const spec = ASSETS[id];
  if (cache.has(spec.url)) return cache.get(spec.url);
  const pending = LOADER.loadAsync(spec.url).catch((error) => {
    console.warn(`[ExternalProps] ${id} 读取失败，跳过该布设：${String(error).slice(0, 180)}`);
    return null;
  });
  cache.set(spec.url, pending);
  return pending;
}

/**
 * 把该资产的节点搬进一个"底面几何中心即原点"的外壳里，并量出归一化之后的
 * 包围盒（碰撞盒就照它出）。
 *
 * **只做平移，不动缩放。** 缩放是美术尺度问题（见文件头最后一段），
 * 混在这一趟里改会让"落地"这条修复没法单独验证。
 *
 * 量之前必须 `updateMatrixWorld(true)`：glTF 的节点变换是在解析时写进 matrix 的，
 * 不主动更新的话 setFromObject 量到的是父链没算过的旧值。而共用 .glb 的那几件
 * 还多一层坑 —— 取出来的子节点身上带着它在源场景里的变换，克隆之后必须清掉，
 * 否则七块石头会各自带着自己在展示排里的偏移落到关卡里。
 */
function PrepareAsset(id, gltf) {
  if (!gltf) return null;
  if (prepared.has(id)) return prepared.get(id);
  const spec = ASSETS[id];
  gltf.scene.updateMatrixWorld(true);
  const source = spec.node ? gltf.scene.getObjectByName(spec.node) : gltf.scene;
  if (!source) {
    console.warn(`[ExternalProps] ${id} 缺少节点 ${spec.node}，跳过该布设`);
    prepared.set(id, null);
    return null;
  }
  const node = source.clone(true);
  node.position.set(0, 0, 0);
  node.rotation.set(0, 0, 0);
  node.scale.copy(source.scale);
  PrepareRuntimeUvs(node, spec);
  node.updateMatrixWorld(true);
  const raw = new THREE.Box3().setFromObject(node);
  const shell = new THREE.Group();
  shell.name = `${id}_Grounded`;
  node.position.set(
    -(raw.min.x + raw.max.x) * 0.5,
    -raw.min.y,
    -(raw.min.z + raw.max.z) * 0.5,
  );
  shell.add(node);
  shell.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(shell);
  const entry = {
    shell,
    // 归一化之后：底面贴 y=0、XZ 关于原点对称。半长与中心高度就是碰撞盒的全部参数。
    half: [(box.max.x - box.min.x) * 0.5, (box.max.y - box.min.y) * 0.5,
      (box.max.z - box.min.z) * 0.5],
    centerY: (box.min.y + box.max.y) * 0.5,
    offset: [(box.min.x + box.max.x) * 0.5, (box.min.z + box.max.z) * 0.5],
  };
  prepared.set(id, entry);
  return entry;
}

async function LoadAsset(id) {
  if (prepared.has(id)) return prepared.get(id);
  return PrepareAsset(id, await LoadSource(id));
}

// 材质名 → 材质。语义名（HouseholdCeramic / Wicker 这类 Script_TengxianCity
// MATERIALS 表里的行）走 ResolveTengxianMaterial 拿到配方+调色；直接写配方名的
// 老条目同样过那张表（表里有同名行，取的是城里同一档参数 —— 外部件与程序化
// 民居本来就该同色）。Steel 保留这层自己的粗糙度/金属度，表里没有它的行。
// 【为什么必须过表】library.Get 对没烘焙的名字直接抛「材质未烘焙」——
// PolyHaven 包第一次用 HouseholdCeramic 时是整关炸掉才发现的。
function RuntimeMaterialFor(name, library, source = null) {
  // Blender 烘焙出来的外部静态件普遍是双面：竹筐、斗笠、薄铁皮和木板靠这条
  // 才能从内外两侧都看见。以前重绑库材质时只保留了“叫什么”，把 side 丢了，
  // 于是正面正常、转半圈就整片消失。让材质库按 source.side 直接建缓存变体，
  // 既保住项目的 GI/AO shader 注入，也不污染全场共用的 FrontSide 底材。
  const side = source && [THREE.FrontSide, THREE.BackSide, THREE.DoubleSide].includes(source.side)
    ? { side: source.side } : {};
  // WoodBeam / WoodDoor 的贴图是给一米级程序化梁柱与门板铺的，细柄、车轮、
  // 凳腿套上去会出现夸张的板缝和树皮状粗条。外部网格统一改用无假板缝、
  // 专为任意 UV 木器烘的 HandcartWood；木箱仍由 spec 明确走 WoodCrate。
  if (name === "WoodBeam" || name === "WoodDoor") {
    return ResolveTengxianMaterial("HandcartWood", library, side);
  }
  if (name === "Steel") {
    return library.Get("Steel", { roughness: 0.72, metalness: 0.55, ...side });
  }
  return ResolveTengxianMaterial(name, library, side);
}

function MappedMaterialName(source, spec) {
  const name = source.name.replace(/\.\d{3}$/, "");
  if (spec.materialMap && typeof spec.materialMap === "object") {
    return spec.materialMap[name] || name;
  }
  return name;
}

function ApplyRuntimeMaterial(root, spec, library) {
  if (spec.materialMap) {
    const bind = (source) => RuntimeMaterialFor(MappedMaterialName(source, spec), library, source);
    root.traverse((object) => {
      if (!object.isMesh) return;
      object.material = Array.isArray(object.material)
        ? object.material.map(bind) : bind(object.material);
    });
    return;
  }
  if (!spec.material) return;
  root.traverse((object) => {
    if (!object.isMesh) return;
    object.material = Array.isArray(object.material)
      ? object.material.map((source) => RuntimeMaterialFor(spec.material, library, source))
      : RuntimeMaterialFor(spec.material, library, object.material);
  });
}

function CloneLoadedAsset(id, asset, library) {
  if (!asset) return null;
  const spec = ASSETS[id];
  const prop = asset.shell.clone(true);
  ApplyRuntimeMaterial(prop, spec, library);
  prop.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = true;
    object.receiveShadow = true;
    object.userData.skipNormalDepth = false;
  });
  return prop;
}

/**
 * 该资产的实例化形态：shell 里的子网格按**运行时材质**分桶，逐桶把「子网格
 * 相对 shell 根的局部变换」烘进顶点后合并成一份几何 —— 与 clone 摆出来的
 * 世界位置逐像素一致（摆位矩阵 × 烘好的局部顶点 = 摆位矩阵 × 局部矩阵 × 顶点）。
 * 多材质件（materialMap）产出 2—5 个桶，单材质件 1 个。
 *
 * 按资产懒建并缓存在 prepared 条目上（材质来自全程序唯一的 MaterialLibrary，
 * 跨关不变）；编辑器摄影棚（InstantiateExternalProp）照旧走 clone，不吃这份。
 *
 * 回不去实例化、返回 null 走克隆老路的几类（逐条都有理由）：
 *   · 子网格保留 GLB 自带材质（spec 无 material/materialMap）**且**几何带
 *     uv1+/color 等额外属性：MergeGeometries 只搬 position/normal/uv，
 *     丢通道会改画面（排屋 houseRow/housePair 的 GLB 材质用 TEXCOORD_1/2）。
 *     库材质只采样 uv0，所以换库材质的件丢这些通道无损；
 *   · 蒙皮/数组材质/镜像变换（负行列式会翻绕序）：都不该出现在布设件里，
 *     真出现时宁可慢也不能画错。
 */
function InstancedFormFor(id, asset, library) {
  if (!asset) return null;
  if (asset.instanced !== undefined) return asset.instanced;
  const spec = ASSETS[id];
  const keepsNativeMaterial = !spec.materialMap && !spec.material;
  asset.shell.updateMatrixWorld(true);
  const byMaterial = new Map();
  let ok = true;
  asset.shell.traverse((object) => {
    if (!ok || !object.isMesh) return;
    if (object.isSkinnedMesh || object.isInstancedMesh || Array.isArray(object.material)) {
      ok = false;
      return;
    }
    const source = object.geometry;
    if (!source?.attributes?.position || object.matrixWorld.determinant() < 0) {
      ok = false;
      return;
    }
    if (keepsNativeMaterial) {
      for (const name of Object.keys(source.attributes)) {
        if (name !== "position" && name !== "normal" && name !== "uv") { ok = false; return; }
      }
    }
    const material = spec.materialMap
      ? RuntimeMaterialFor(MappedMaterialName(object.material, spec), library, object.material)
      : (spec.material ? RuntimeMaterialFor(spec.material, library, object.material) : object.material);
    // 挑出要合并的三个属性各拷一份（InterleavedBufferAttribute.clone() 会
    // 顺手解交织），再把相对 shell 根的变换烘进去 —— shell 自己是单位阵，
    // matrixWorld 就是那份局部变换。
    const geometry = new THREE.BufferGeometry();
    for (const name of ["position", "normal", "uv"]) {
      const attribute = source.attributes[name];
      if (attribute) geometry.setAttribute(name, attribute.clone());
    }
    if (source.index) geometry.setIndex(source.index.clone());
    geometry.applyMatrix4(object.matrixWorld);
    let list = byMaterial.get(material);
    if (!list) { list = []; byMaterial.set(material, list); }
    list.push(geometry);
  });
  if (!ok || byMaterial.size === 0) {
    asset.instanced = null;
    return null;
  }
  const parts = [];
  let geoMinY = Infinity;
  for (const [material, list] of byMaterial) {
    const geometry = MergeGeometries(list);
    geometry.computeBoundingBox();
    geoMinY = Math.min(geoMinY, geometry.boundingBox.min.y);
    parts.push({ geometry, material });
  }
  asset.instanced = { parts, geoMinY };
  return asset.instanced;
}

/**
 * 一个摆件的碰撞盒：归一化包围盒 × 摆位缩放，绕 Y 转到摆位朝向。
 *
 * 一件一只盒子，与程序化民居登记的粒度一致（`Script_TengxianCity` 里一栋房
 * 也是一只 `Solid`）。逐子网格出盒会把乡村房屋拆成十七只、把屋里的细节也变成
 * 隐形障碍，既贵又不对。
 *
 * 中心点要**先转再平移** —— 归一化之后 XZ 已经对称，理论上偏移是 0，
 * 但浮点残差与将来可能出现的偏心模型都靠这一步兜住。
 */
function SolidFor(sink, spec, asset, placement) {
  if (spec.solid === false || placement.solid === false) return 0;
  const s = placement.scale || 1;
  const ry = placement.ry || 0;
  const [ox, oz] = asset.offset;
  const cos = Math.cos(ry), sin = Math.sin(ry);
  const cx = placement.x + (ox * cos + oz * sin) * s;
  const cz = placement.z + (-ox * sin + oz * cos) * s;
  sink.Solid(cx, placement.y + asset.centerY * s, cz,
    asset.half[0] * s, asset.half[1] * s, asset.half[2] * s, spec.tag, ry);
  return 1;
}

/** Dedicated editor catalog; runtime placement coordinates stay private below. */
export function ExternalPropCatalog() {
  return Object.entries(ASSETS).map(([id, spec]) => ({
    id, label: spec.label, url: spec.url, node: spec.node ?? null,
    material: spec.material, materialMap: !!spec.materialMap, tag: spec.tag,
    solid: spec.solid !== false, category: spec.category,
  }));
}

/** 布设工具/测试用的只读口子：按关卡写死的那几组原始摆位。 */
export function BasePlacements() {
  return PLACEMENTS;
}

/** 这一片有哪些手摆件。`Overview` 是现算的并集，见 OVERVIEW_PLACEMENTS 的注释。 */
function PlacementsFor(phaseId) {
  if (phaseId === OVERVIEW_LEVEL_ID) return OVERVIEW_PLACEMENTS;
  return PLACEMENTS[phaseId] || [];
}

/** Clone one runtime prop for the component-library studio without placing it in a level. */
export async function InstantiateExternalProp(id, library) {
  if (!ASSETS[id]) return null;
  return CloneLoadedAsset(id, await LoadAsset(id), library);
}

/**
 * 构件库/场景编辑器共用的三种沙袋模板。返回的根节点可以 clone，几何和材质由
 * ExternalProps 缓存持有；调用方只移除克隆，不 dispose 共享资源。
 */
export async function LoadExternalSandbagModels(library) {
  const entries = await Promise.all(EXTERNAL_SANDBAG_ASSET_IDS.map(async (id) => (
    [id, await InstantiateExternalProp(id, library)]
  )));
  return new Map(entries.filter(([, root]) => root));
}

/** 场景编辑器需要的程序化构件外部模板：沙袋组合 + 三种无叶树。 */
export async function LoadExternalWorldModels(library) {
  const ids = [...EXTERNAL_SANDBAG_ASSET_IDS, ...EXTERNAL_LEAFLESS_TREE_ASSET_IDS];
  const entries = await Promise.all(ids.map(async (id) => (
    [id, await InstantiateExternalProp(id, library)]
  )));
  return new Map(entries.filter(([, root]) => root));
}

/** Remove the previous level's visual-only props before its scene is disposed. */
export function ClearExternalProps() {
  if (liveStreamer) { liveStreamer.Dispose(); liveStreamer = null; }
  if (!liveRoot) return;
  liveRoot.parent?.remove(liveRoot);
  liveRoot = null;
}

/**
 * Add the short list of downloaded props relevant to a built level.
 *
 * 返回的 `colliders` 是**给调用方并进 field.colliders 的**，这一层自己不碰战场
 * 对象。并完之后调用方必须重刷一次空间散列（`field.BuildCollisionGrid()`），
 * 否则 AI 找掩体与破坏系统的粗筛里没有这些盒子 —— 物理世界有、粗筛没有，
 * 是最难认的一类不一致。
 */
export async function AddExternalProps({
  scene, library, phaseId, groundAt, bounds, generatedPlacements = [],
}) {
  ClearExternalProps();
  // 两层摆位：按关写死的 PLACEMENTS + 按世界坐标登记、按本关 bounds 过滤的
  // 城内每户布设（Script_TownDressing）。后者跨关共位 —— 城是同一座城。
  // generatedPlacements 是 Script_World 构建器产出的沙袋组合；它只负责画面，
  // 碰撞仍由 AddBarricade/AddSandbagPlug/AddSandbagEmplacement 的整段盒负责。
  const placements = [
    ...PlacementsFor(phaseId), ...TownDressingFor(bounds), ...generatedPlacements,
  ];
  if (!placements.length) {
    return { count: 0, generatedCount: 0, failed: [], colliders: [], streamer: null };
  }

  const ids = [...new Set(placements.map((entry) => entry.asset))];
  const loaded = await Promise.all(ids.map(async (id) => [id, await LoadAsset(id)]));
  const models = new Map(loaded);
  const root = new THREE.Group();
  root.name = `ExternalProps_${phaseId}`;
  root.userData.externalProps = true;
  const sink = new BuildSink();
  // 【流送分工，2026-08-25】碰撞照旧在这里**全量**登记（AI/破坏/子弹的世界
  // 不许随玩家位置变形）；画面由 PropStreamer 按「尺寸→半径」在焦点附近
  // 按需生成/回收（规矩见 Script_PropStreaming 文件头）。
  // 【实例化，2026-08-26】有实例化形态的件登记 {bucket, matrix} 进 PropBatcher
  // 的桶（每资产 × 每材质一只 InstancedMesh）；make() 闭包保留，既是没有实例化
  // 形态那几件的执行体，也是 SetInstancing 开关对比的回退路。
  const batcher = new PropBatcher(root);
  const streamer = new PropStreamer(root, batcher);
  const failed = [];
  const euler = new THREE.Euler(0, 0, 0);
  let count = 0;

  for (const placement of placements) {
    const asset = models.get(placement.asset);
    if (!asset) { failed.push(placement.asset); continue; }
    const y = Number.isFinite(placement.y)
      ? placement.y
      : groundAt(placement.x, placement.z) + (placement.yOffset || 0);
    SolidFor(sink, ASSETS[placement.asset], asset, { ...placement, y });
    const scale = placement.scale || 1;
    const maxDim = Math.max(asset.half[0], asset.half[1], asset.half[2]) * 2 * scale;
    const index = count;
    const id = placement.asset;
    const form = InstancedFormFor(id, asset, library);
    let parts = null;
    let probe = null;
    if (form) {
      // 摆位矩阵与 clone 路径的 position/rotation.y/scale.setScalar 一字不差：
      // compose(T, R_y, S) 就是 three 从那三样合成 matrix 的同一公式。
      const matrix = new THREE.Matrix4().compose(
        new THREE.Vector3(placement.x, y, placement.z),
        new THREE.Quaternion().setFromEuler(euler.set(0, placement.ry || 0, 0)),
        new THREE.Vector3(scale, scale, scale),
      );
      parts = form.parts.map((part) => ({
        bucket: batcher.BucketFor(part.geometry, part.material),
        matrix,
      }));
      for (const part of parts) batcher.Reserve(part.bucket, 1);
      // 底面只随 Y 旋转与等比缩放变换：世界 minY = y + 局部 minY × scale。
      probe = {
        name: `External_${id}_${index}`,
        x: placement.x, y, z: placement.z,
        minY: y + form.geoMinY * scale,
        generatedSandbag: Boolean(placement.generatedSandbag),
        generatedTree: Boolean(placement.generatedTree),
        requiresOwnCollider: placement.solid !== false,
      };
    }
    streamer.Register({
      x: placement.x, z: placement.z, maxDim, label: id, parts, probe,
      // 三月无叶树在中远景只剩亚像素细枝。高模保留近景枝干拓扑，
      // 但不为雾里的不可见细枝支付 330 m 建筑级实例半径。
      loadRadius: placement.generatedTree ? 140 : null,
      make: () => {
        const prop = CloneLoadedAsset(id, asset, library);
        if (!prop) return null;
        prop.name = `External_${id}_${index}`;
        prop.position.set(placement.x, y, placement.z);
        prop.rotation.y = placement.ry || 0;
        prop.scale.setScalar(scale);
        prop.userData.generatedSandbag = Boolean(placement.generatedSandbag);
        prop.userData.generatedTree = Boolean(placement.generatedTree);
        prop.userData.requiresOwnCollider = placement.solid !== false;
        prop.userData.expectedMinY = y;
        return prop;
      },
    });
    count += 1;
  }
  // 容量已按本关注册数算齐，桶网格一次建到位（转身/流送不再碰 GPU buffer 分配）。
  batcher.Finalize();
  scene.add(root);
  liveRoot = root;
  liveStreamer = streamer;
  return {
    count, generatedCount: generatedPlacements.length,
    failed, colliders: sink.colliders, streamer,
  };
}

export function ExternalPropCount(phaseId, bounds) {
  return PlacementsFor(phaseId).length + TownDressingFor(bounds).length;
}
