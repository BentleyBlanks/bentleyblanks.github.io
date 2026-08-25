// 「村居农具包」资产目录 —— 1938 年鲁南县城内外的农家生产生活件。
//
// 一个 .glb（Model/Model_RuralYardSet.glb，15 个具名节点，248 KB，共 3606 三角），
// 由 _import/Script_RuralYardFetch.py 取源、_import/Script_RuralYardBake.py 烘焙。
// 来源两家，都是 CC0、官网直链、无需鉴权：Kenney.nl 四个 kit + Quaternius 的
// Medieval Village。原包的 License.txt 与 URL/sha256 留在 _import/Source/<包>/。
//
// 【三件接入之前必须知道的事】
//
// 一、**这里的 `material` 有两个名字不是烘焙配方名。**
//     `Script_Materials.MaterialLibrary.Get(name)` 只认 Script_TexBake 的 RECIPES
//     那张表，取不到就直接 `throw 材质未烘焙`。`HouseholdCeramic` 与 `VillageStraw`
//     不在 RECIPES 里 —— 它们是 Script_TengxianCity 的 MATERIAL_MAP / PLAIN_MAP
//     里的**语义名**，要经 `ResolveTengxianMaterial` 才落到配方上。
//     语义上这两个名字是对的（陶器/秸秆），所以照留；但接进
//     Script_ExternalProps 的 `ApplyRuntimeMaterial` 时必须走下面的
//     TENGXIAN_ONLY_MATERIALS，否则**这两件一加载就抛**。
//
// 二、**尺寸已经是真实米制，不要再乘系数。** Kenney 按 1×1 网格作图、Quaternius
//     大约是真人的十分之一，两家的原始尺度都不能直接用。烘焙脚本按每件指定的
//     轴与米数逐件缩放过了（见 Script_RuralYardBake.SPECS 的 `target`），
//     下面每行注释里的三个数就是 .glb 里量得的实际米数（宽×高×深，Y 向上）。
//
// 三、**每个节点的原点已经是「底面几何中心」**（minY = 0、XZ 关于原点对称），
//     和 Script_ExternalProps.PrepareAsset 的归一化结果一致 —— 那一层再算一遍
//     也只会平移 0。
//
// 【tag 按工作包口径一律 "prop"、栅栏形制用 "fence"。】仓库里其实还有四个更贴切、
// 且 Data_Destruction 与 Script_Main.SURFACE_BY_TAG 两张表都已登记的 tag，
// 换上去能让打击音与碎屑对上，改动是四行：
//     ryCeramicVat    prop → householdCrock  （lightMasonry：陶缸，脆但不是木头）
//     ryHayStack      prop → villageStraw    （straw）
//     ryFirewoodStack prop → householdWoodpile（wood，语义更准）
//     ryFirewoodPit   prop → householdWoodpile
// 现在没换，是因为工作包明确写了「tag 一律 prop（草垛类用 prop）」。

export const PACK = Object.freeze({
  id: "RuralYard",
  url: "./Model/Model_RuralYardSet.glb?v=1",
  license: "CC0 1.0",
  sources: Object.freeze([
    "Kenney Nature Kit — https://kenney.nl/assets/nature-kit",
    "Kenney Survival Kit — https://kenney.nl/assets/survival-kit",
    "Kenney Graveyard Kit — https://kenney.nl/assets/graveyard-kit",
    "Kenney Fantasy Town Kit — https://kenney.nl/assets/fantasy-town-kit",
    "Quaternius Medieval Village — https://quaternius.com/packs/medievalvillage.html",
  ]),
});

/**
 * 只有 `material` 落在这张表里的两个名字需要特别处理：它们不是烘焙配方名。
 * 接入方在 `library.Get(spec.material)` 之前先查这里，命中就照 recipe/plain 取。
 * 值抄自 Script_TengxianCity 的 MATERIAL_MAP / PLAIN_MAP，改色请改那边、别改这里。
 */
export const TENGXIAN_ONLY_MATERIALS = Object.freeze({
  HouseholdCeramic: { recipe: "Stone", color: 0xb99a82, roughness: 0.96 },
  VillageStraw: { plain: true, color: 0x8a744e, roughness: 0.98 },
});

/**
 * `materialMap: true` = 这一件在 .glb 里带多个材质槽，槽名就是配方名，
 * 照 Script_ExternalProps 的 materialMap 分支逐槽重绑（和战场包一样）。
 * 其余的是单材质件，直接用 `material`。
 */
export const ASSETS = Object.freeze({
  // —— 水与灶 ——
  // 源件是欧式带红瓦顶的井屋；井台以上整个砍掉了，剩下石井圈与横在井口的两根木梁。
  ryVillageWell: { label: "村井 · 石井台", node: "VillageWell", materialMap: true, material: null, tag: "prop" },   // 1.51 × 0.95 × 1.73 m
  ryWaterBucket: { label: "木水桶", node: "WaterBucket", material: "WoodDoor", tag: "prop" },                        // 0.26 × 0.34 × 0.26 m
  ryCeramicVat: { label: "陶盆", node: "CeramicVat", material: "HouseholdCeramic", tag: "householdCrock" },                    // 0.62 × 0.51 × 0.54 m
  // 源件是未点燃的那一版（同包另有带火焰几何的 Bonfire_Lit，没取）。
  ryFirewoodPit: { label: "石圈柴堆", node: "FirewoodPit", materialMap: true, material: null, tag: "householdWoodpile" },         // 1.15 × 0.32 × 1.03 m

  // —— 柴草与木料 ——
  ryHayStack: { label: "秸秆垛", node: "HayStack", material: "VillageStraw", tag: "villageStraw" },                          // 0.85 × 1.25 × 0.87 m
  ryFirewoodStack: { label: "柴垛", node: "FirewoodStack", material: "WoodBeam", tag: "householdWoodpile" },                      // 0.69 × 0.56 × 1.15 m
  ryChoppingBlock: { label: "劈柴墩", node: "ChoppingBlock", material: "WoodBeam", tag: "prop" },                    // 0.62 × 0.40 × 0.72 m
  ryTimberStack: { label: "木料堆", node: "TimberStack", material: "WoodDoor", tag: "prop" },                        // 0.89 × 0.22 × 1.50 m

  // —— 农具 ——
  // 源件把工具立着摆（刃朝上），会像一根戳在地上的杆子；烘焙时放倒成「随手扔在院里」。
  ryFarmHoe: { label: "锄头", node: "FarmHoe", materialMap: true, material: null, tag: "prop" },                     // 0.55 × 0.46 × 1.55 m
  // 源件本来就是「铲子插在土里」的造型，保持竖立。
  ryIronSpade: { label: "铁锹", node: "IronSpade", materialMap: true, material: null, tag: "prop" },                 // 0.36 × 1.15 × 0.18 m
  ryFeedTrough: { label: "木食槽", node: "FeedTrough", materialMap: true, material: null, tag: "prop" },             // 1.10 × 0.39 × 0.95 m

  // —— 院里的家什 ——
  ryCartWheel: { label: "大车轮", node: "CartWheel", material: "WoodBeam", tag: "prop" },                            // 0.54 × 1.10 × 1.06 m
  ryYardBench: { label: "长条木凳", node: "YardBench", material: "WoodDoor", tag: "prop" },                          // 0.44 × 0.38 × 1.60 m
  ryYardStool: { label: "木方凳", node: "YardStool", material: "WoodDoor", tag: "prop" },                            // 0.51 × 0.44 × 0.51 m
  // 两柱两横杆的架子：晾衣、晒粮、拴牲口都用它。形制上归 fence。
  ryDryingRack: { label: "晾晒木架", node: "DryingRack", material: "WoodBeam", tag: "fence" },                       // 0.19 × 1.95 × 1.95 m
});
