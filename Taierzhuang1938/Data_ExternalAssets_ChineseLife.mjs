// 中式生活道具包 —— 1938 年鲁南县城的家什（水缸、柴垛、簸箕、井台、石磨…）。
// 全部烘自 Sketchfab 的 CC-BY 源，源目录与逐条许可见
// Taierzhuang1938/_import/Source/Model_Sketchfab*/license.txt，
// 下载/烘焙脚本是 _import/Script_ChineseLifeFetch.py 与 _import/Script_ChineseLifeBake.py。
//
// 【两条给整合方的提醒，都是这一轮踩出来的】
//
// 1. **`material` 只能填 Script_TexBake.RECIPES 里的配方名。**
//    `Script_ExternalProps.ApplyRuntimeMaterial` 走的是 `library.Get(name)`，
//    它查的是烘焙表，不是 `Script_TengxianCity.MATERIAL_MAP` 那张逻辑名表。
//    所以这里写的是 `Stone` / `Sandbag` / `ClothNra` / `WoodBeam` / `WoodDoor`，
//    **不是** `HouseholdCeramic` / `Wicker` / `HouseholdCloth` —— 后者会抛
//    「材质未烘焙」。代价是丢了 MATERIAL_MAP 给的那层暖调（陶器 0xb99a82、
//    柳编 0xb99761、旧布 0xb7a189）：陶缸现在是条石的冷灰，不是酱釉的暖褐。
//    要补的话得在 ExternalProps 那一层加一条「逻辑名 → 配方 + 乘色」的解析，
//    那不在这个工作包的改动范围里。
//
// 2. **`ShopPlaque` 的字是贴图，这一层把贴图剥了。**
//    源模型的「首播」二字与边框缠枝纹全在 normal/albedo 里，几何上只有一块
//    带凸边框的板。所以它现在读作「铺面门板」而不是「刻字匾额」，标签也照这个
//    写。真要匾额的字，得单独给它一张 decal。
//
// 尺寸一律真实米制、底面贴地、XZ 居中（烘焙时就做完了，运行时的
// `PrepareAsset` 再算一遍是白算，但也不会出错）。

export const PACK = Object.freeze({
  id: "ChineseLife",
  url: "./Model/Model_ChineseLifeSet.glb?v=1",
});

/**
 * `tag` 用的都是 Data_Destruction.TAG_PROFILE 与 Script_Main.SURFACE_BY_TAG
 * **两张表里都已经登记过**的键，没有新编：
 *   householdCrock  = lightMasonry / brick —— 陶缸脆，打碎出砖灰不是木屑
 *   householdBasket = wood / wood         —— 荆条筐、簸箕、斗笠
 *   householdWoodpile = wood / wood       —— 柴垛
 *   prop            = wood / wood         —— 木器
 *   rubble          = lightMasonry / brick —— 石井台、石磨盘
 */
export const ASSETS = Object.freeze({
  clayWaterVat: { label: "水缸", node: "ClayWaterVat", material: "HouseholdCeramic", tag: "householdCrock" },
  clayRoundVat: { label: "圆腹陶缸", node: "ClayRoundVat", material: "HouseholdCeramic", tag: "householdCrock" },
  clayLuggedJar: { label: "带耳陶罐", node: "ClayLuggedJar", material: "HouseholdCeramic", tag: "householdCrock" },
  clayLiddedJar: { label: "有盖陶坛", node: "ClayLiddedJar", material: "HouseholdCeramic", tag: "householdCrock" },
  clayWideJar: { label: "阔口陶坛", node: "ClayWideJar", material: "HouseholdCeramic", tag: "householdCrock" },
  wineJarCluster: { label: "酒坛一堆", node: "WineJarCluster", material: "HouseholdCeramic", tag: "householdCrock" },
  firewoodPile: { label: "柴垛", node: "FirewoodPile", material: "WoodBeam", tag: "householdWoodpile" },
  longBench: { label: "木条凳", node: "LongBench", material: "WoodDoor", tag: "prop" },
  woodPlatformBench: { label: "木凉床", node: "WoodPlatformBench", material: "WoodBeam", tag: "prop" },
  // 立着的，不是躺着的：布设只给得了 ry，簸箕只能靠墙立、不能平放在地上。
  winnowingBasket: { label: "簸箕（靠墙立）", node: "WinnowingBasket", material: "Wicker", tag: "householdBasket" },
  wovenBasket: { label: "笸箩", node: "WovenBasket", material: "Wicker", tag: "householdBasket" },
  bambooHat: { label: "斗笠", node: "BambooHat", material: "Wicker", tag: "householdBasket" },
  clothLantern: { label: "布灯笼", node: "ClothLantern", material: "HouseholdCloth", tag: "prop" },
  shopPlaque: { label: "铺面门板", node: "ShopPlaque", material: "WoodDoor", tag: "prop" },
  stoneWellCurb: { label: "石井台", node: "StoneWellCurb", material: "Stone", tag: "rubble" },
  stoneMillWheel: { label: "石磨盘", node: "StoneMillWheel", material: "Stone", tag: "rubble" },
});
