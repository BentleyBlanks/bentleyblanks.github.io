// 家什容器包 —— 1938 鲁南县城的木/陶/竹/铁手工生活器物。
//
// 源全部是 Poly Haven 的 CC0 扫描件，经 `_import/Script_PolyHavenFetch.py` 下载、
// `_import/Script_HouseholdWareBake.py` 减面并烘成一个共享 GLB：逐件一个具名节点、
// 落地 minY=0、XZ 居中、真实米制尺寸、源贴图全部剥掉。
//
// 【整合注意 · 材质名】下面的 `material` 用的是 `Script_TengxianCity.MATERIALS`
// 的语义名（HouseholdCeramic / Wicker），**不是** `Script_TexBake.RECIPES` 的配方名。
// 而 `Script_ExternalProps.ApplyRuntimeMaterial` 现在是直接 `library.Get(spec.material)`，
// 对未烘焙的名字会抛 `材质未烘焙：HouseholdCeramic`。整合时把那一行换成
// `ResolveTengxianMaterial(spec.material, library)`（它对没登记的名字会原样透传给
// library.Get，既有 WoodDoor / WoodBeam / Sandbag / GroundRubble 那几件不受影响）。
// 若不想动 Script_ExternalProps，退路是把 HouseholdCeramic 换成 "Stone"、
// Wicker 换成 "Sandbag" —— 那正是这两个语义名在 MATERIALS 里压着的底材配方，
// 只是丢掉调色（陶少了 0xb99a82 的赭、编织少了 0xb99761 的黄）。

export const PACK = Object.freeze({ id: "HouseholdWare", url: "./Model/Model_HouseholdWareSet.glb?v=1" });

export const ASSETS = Object.freeze({
  // —— 木质容器 ——
  phWoodenBucket: { label: "木水桶", node: "WoodenBucket", material: "WoodDoor", tag: "prop" },
  phWoodenWashTub: { label: "木盆", node: "WoodenWashTub", material: "WoodDoor", tag: "prop" },
  // —— 陶器 ——
  phClayJarLidded: { label: "带盖陶罐", node: "ClayJarLidded", material: "HouseholdCeramic", tag: "prop" },
  phClayFlowerPot: { label: "素陶瓦盆", node: "ClayFlowerPot", material: "HouseholdCeramic", tag: "prop" },
  // —— 竹柳编 ——
  phWickerTray: { label: "竹编浅筐（笸箩）", node: "WickerTray", material: "Wicker", tag: "prop" },
  phWickerBasketLidded: { label: "带盖竹篮", node: "WickerBasketLidded", material: "Wicker", tag: "prop" },
  // —— 粗木家具 ——
  phChineseWoodStool: { label: "中式方凳", node: "ChineseWoodStool", material: "WoodDoor", tag: "prop" },
  phLowWoodStool: { label: "小板凳", node: "LowWoodStool", material: "WoodDoor", tag: "prop" },
  phRoughWoodTable: { label: "粗木桌", node: "RoughWoodTable", material: "WoodBeam", tag: "prop" },
  // —— 木柄铁头手工具（烘焙时已放平，落地即是「掉在地上的家伙什」） ——
  phWoodAxe: { label: "木柄斧", node: "WoodAxe", material: "Steel", tag: "prop" },
  phSmithHammer: { label: "铁锤", node: "SmithHammer", material: "Steel", tag: "prop" },
  phIronSpade: { label: "铁锹", node: "IronSpade", material: "Steel", tag: "prop" },
  // —— 柴与灯 ——
  phFirewoodBranches: { label: "柴枝堆", node: "FirewoodBranches", material: "WoodBeam", tag: "prop" },
  phWoodLantern: { label: "木框风灯", node: "WoodLantern", material: "WoodDoor", tag: "prop" },
});
