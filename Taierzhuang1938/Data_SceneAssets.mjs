// 场景资产目录（docs/Data_Scene.md §3）：场景文件里的物件只写资产编号，编号 → 这是什么、怎么画、在哪个文件，查这张表。
//
// 为什么不直接写文件路径：改文件名、换模型只改这里一行，几千行场景不用动（Unity 的场景存的也是资产的 GUID，不是路径）。
// 编号一旦被场景用上就别改名；要废弃就留着编号、改 note。
//
// 纯数据，零 three。体块的样子由材质决定：白盒场景引用 Whitebox/* 材质（灰面 + 米格线），
// 正式场景引用 Look/* 材质（现行第一关的 PBR 外观，Data_FirstLevelWhiteboxMaterials.WHITEBOX_LOOKS）。

/**
 * 场景清单：场景编辑器的下拉、本机存盘口 /__scene/*、白盒编辑器按 id 找场景都查这张表。
 * style：whitebox = 白盒的样子（灰面 + 米格线、高度色带地面）；formal = 正式场景（PBR 外观、道具模型、分层地表）。
 */
export const SCENE_LIST = Object.freeze([
  Object.freeze({ id: "FirstLevelWhitebox", title: "第一关 · 白盒", style: "whitebox", note: "白盒编辑器的编辑与预演跑这个" }),
  Object.freeze({ id: "FirstLevel", title: "第一关 · 正式", style: "formal",
    note: "白盒编辑器的试玩跑这个；2026-11-01 照白盒布局复制，换成现行第一关的外观、道具模型与分层地表，之后单独打磨" }),
]);

/** 场景 id → 清单里那一项（没有返回 null）。 */
export function SceneInfo(sceneId) {
  return SCENE_LIST.find((scene) => scene.id === sceneId) || null;
}

/**
 * 资产：kind 决定读取器怎么把它交给建场。
 *   box   米制长方体，size [w, h, d]，样子看 material
 *   prop  外部道具模型（Script_ExternalProps 的 model），按 size 那只盒子缩放摆进去；碰撞仍是那只盒子；semantic = 弹着表面
 *   tree  树（白盒编辑器的树种植，Script_EditorBlockoutTrees）：size 是树干碰撞盒，h 是树高
 *   backdrop*  远景层（只看不走）
 * sized = 要写 size；layer = 只能放在哪一层。
 */
// size：场景编辑器新加一件时的缺省盒子（米，取白盒里同类道具最常见的那个尺寸）
const Prop = (model, semantic, label, size) => Object.freeze({ kind: "prop", sized: true, model, semantic, label, size: Object.freeze(size), note: `外部道具 ${model}` });

export const SCENE_ASSETS = Object.freeze({
  "Whitebox/Box": Object.freeze({ kind: "box", sized: true, label: "白盒体块", note: "米制长方体；样子看 material，碰撞看 solid" }),
  "Block/Box": Object.freeze({ kind: "box", sized: true, label: "体块", note: "米制长方体（正式场景）；样子看 material（Look/*），碰撞看 solid" }),
  "Tree/Dead": Object.freeze({ kind: "tree", sized: true, semantic: "foliage", label: "枯树", size: Object.freeze([0.6, 11, 0.6]),
    note: "size 是树干碰撞盒、h 是树高；模型由白盒编辑器的树种植挑" }),
  "Tree/Cypress": Object.freeze({ kind: "tree", sized: true, semantic: "foliage", label: "坟地柏树", size: Object.freeze([1.1, 7, 1.1]),
    note: "暂用枯树模型；以后换柏树模型只改这一行" }),
  "Prop/militaryCrateClosed": Prop("militaryCrateClosed", "timber", "弹药箱", [0.55, 0.32, 0.38]),
  "Prop/battlefieldGrenadeStack": Prop("battlefieldGrenadeStack", "timber", "手榴弹箱", [0.45, 0.28, 0.3]),
  "Prop/marketCrate01": Prop("marketCrate01", "timber", "木箱", [1.6, 1, 1]),
  "Prop/marketBox02": Prop("marketBox02", "timber", "木柜 / 箱子", [1, 0.7, 0.6]),
  "Prop/clayWaterVat": Prop("clayWaterVat", "earthDark", "水缸", [0.8, 0.9, 0.8]),
  "Prop/stoneWellCurb": Prop("stoneWellCurb", "structure", "井台", [1.2, 0.45, 1.2]),
  "Prop/stoneMillWheel": Prop("stoneMillWheel", "structure", "磨盘", [1.3, 0.5, 1.3]),
  "Prop/ryHayStack": Prop("ryHayStack", "canvas", "草垛", [2.2, 1.5, 1.5]),
  "Prop/strawSleepingMatFlat": Prop("strawSleepingMatFlat", "canvas", "草席 / 铺草", [2, 0.03, 1.4]),
  "Prop/ryFirewoodStack": Prop("ryFirewoodStack", "timber", "柴堆", [2, 0.55, 0.8]),
  "Prop/ryTimberStack": Prop("ryTimberStack", "timber", "枕木 / 木料堆", [2.6, 0.9, 1]),
  "Prop/phFirewoodBranches": Prop("phFirewoodBranches", "foliage", "树枝", [1.6, 0.6, 1]),
  "Prop/battlefieldSandbag01": Prop("battlefieldSandbag01", "canvas", "沙袋垛", [1.8, 0.9, 0.9]),
  "Prop/battlefieldSandbag02": Prop("battlefieldSandbag02", "canvas", "沙袋", [0.6, 0.25, 0.35]),
  "Prop/cityWallBreachBrickCluster01": Prop("cityWallBreachBrickCluster01", "plaster", "碎砖堆 A", [2.6, 0.9, 1.1]),
  "Prop/cityWallBreachBrickCluster02": Prop("cityWallBreachBrickCluster02", "plaster", "碎砖堆 B", [2.4, 0.8, 2]),
  "Prop/phRoughWoodTable": Prop("phRoughWoodTable", "timber", "木桌", [1.2, 0.75, 0.5]),
  "Prop/phChineseWoodStool": Prop("phChineseWoodStool", "timber", "木凳", [0.4, 0.4, 0.4]),
  "Prop/clothLantern": Prop("clothLantern", "canvas", "马灯 / 灯笼", [0.2, 0.3, 0.2]),
  "Prop/ryCartWheel": Prop("ryCartWheel", "timber", "车轮", [0.9, 0.9, 0.12]),
  "Prop/marketRiceSack01": Prop("marketRiceSack01", "canvas", "包袱 / 麻袋", [0.7, 0.45, 0.5]),
  "Prop/wardBandageRoll": Prop("wardBandageRoll", "canvas", "绷带卷", [0.35, 0.04, 0.25]),
  "Backdrop/Box": Object.freeze({ kind: "backdropBox", layer: "backdrop", label: "远景盒子", note: "房墙、屋顶、院墙；params: w d h lift color" }),
  "Backdrop/Blob": Object.freeze({ kind: "backdropBlob", layer: "backdrop", label: "远景树冠", note: "椭球；params: rx rz h lift color" }),
  "Backdrop/Hill": Object.freeze({ kind: "backdropHill", layer: "backdrop", label: "远景低山", note: "params: rx rz h color topColor" }),
  "Backdrop/Tree": Object.freeze({ kind: "backdropTree", layer: "backdrop", label: "远景枯树", note: "params: h" }),
});

/**
 * 材质：编号 → 语义（建场用的材质槽、弹着表面）与外观。
 * Whitebox/*：白盒材质，颜色在关卡的 semanticColors 里。
 * Look/*：现行第一关的 PBR 外观（look 是 WHITEBOX_LOOKS 的键）；水与隐形墙没有外观（水面另铺、隐形墙不画）。
 */
// color：场景编辑器里这种外观画成什么颜色（只是预览色，真样子是贴图）
const Look = (look, semantic, label, color) => Object.freeze({ semantic, look, label, color });

export const SCENE_MATERIALS = Object.freeze({
  "Whitebox/EarthDark": Object.freeze({ semantic: "earthDark", label: "深土" }),
  "Whitebox/Step": Object.freeze({ semantic: "step", label: "台阶 / 踏脚" }),
  "Whitebox/Timber": Object.freeze({ semantic: "timber", label: "木头" }),
  "Whitebox/Cover": Object.freeze({ semantic: "cover", label: "掩体" }),
  "Whitebox/Plaster": Object.freeze({ semantic: "plaster", label: "土墙 / 抹灰" }),
  "Whitebox/Foliage": Object.freeze({ semantic: "foliage", label: "植物" }),
  "Whitebox/Canvas": Object.freeze({ semantic: "canvas", label: "布 / 席" }),
  "Whitebox/AirWall": Object.freeze({ semantic: "airWall", label: "隐形墙" }),
  "Whitebox/Roof": Object.freeze({ semantic: "roof", label: "屋顶" }),
  "Whitebox/Structure": Object.freeze({ semantic: "structure", label: "建筑结构" }),
  "Whitebox/Water": Object.freeze({ semantic: "water", label: "水" }),
  "Whitebox/Danger": Object.freeze({ semantic: "danger", label: "危险区" }),
  "Whitebox/Metal": Object.freeze({ semantic: "metal", label: "铁件" }),
  "Whitebox/Void": Object.freeze({ semantic: "void", label: "门窗洞暗面" }),
  "Whitebox/Coping": Object.freeze({ semantic: "coping", label: "墙头压顶" }),
  "Look/mudPlaster": Look("mudPlaster", "plaster", "泥抹面墙", "#9b8b74"),
  "Look/limePlaster": Look("limePlaster", "plaster", "白灰抹面墙", "#c9c3b6"),
  "Look/greyBrick": Look("greyBrick", "plaster", "青砖墙", "#8d8780"),
  "Look/gateBrick": Look("gateBrick", "structure", "门楼青砖", "#807a72"),
  "Look/brickPlinth": Look("brickPlinth", "plaster", "青砖碱脚", "#6c6762"),
  "Look/earthWork": Look("earthWork", "earthDark", "夯土 / 土工事", "#8a7b62"),
  "Look/roofTile": Look("roofTile", "roof", "小青瓦", "#5d5f5e"),
  "Look/timber": Look("timber", "timber", "旧木料", "#7a6a56"),
  "Look/doorLeaf": Look("doorLeaf", "timber", "旧门板", "#6e5f50"),
  "Look/stone": Look("stone", "structure", "条石", "#8f8b84"),
  "Look/canvas": Look("canvas", "canvas", "布 / 麻袋", "#a49c86"),
  "Look/thatch": Look("thatch", "canvas", "草束 / 苇子", "#a8925f"),
  "Look/jar": Look("jar", "earthDark", "陶缸", "#8a6e55"),
  "Look/steel": Look("steel", "metal", "锈钢板", "#6e655c"),
  "Look/wire": Look("wire", "metal", "铁丝 / 电线", "#2d2e2c"),
  "Look/voidDark": Look("voidDark", "void", "门窗洞暗面", "#16140f"),
  "Look/bloodStain": Look("bloodStain", "danger", "血迹", "#3b1a14"),
  // 苇丛、草丛：植物语义 —— 正式场景里这只盒子长成植被卡片（Data_FirstLevelVegetation 的 foliage 规则），读不到植被图集时画成草束
  "Look/reed": Object.freeze({ semantic: "foliage", look: "thatch", label: "苇丛 / 草丛（长成植被）", color: "#8f8456" }),
  "Look/water": Object.freeze({ semantic: "water", look: null, label: "水（水面另铺）", color: "#5c6f78" }),
  "Look/airWall": Object.freeze({ semantic: "airWall", look: null, label: "隐形墙", color: "#d6604a" }),
});

const SEMANTIC_TO_MATERIAL = Object.freeze(Object.fromEntries(
  Object.entries(SCENE_MATERIALS).filter(([id]) => id.startsWith("Whitebox/")).map(([id, material]) => [material.semantic, id])));

/** 语义 → 白盒材质编号；没登记的语义返回 null。 */
export function WhiteboxMaterialFor(semantic) {
  return SEMANTIC_TO_MATERIAL[semantic] || null;
}

/** 物件的语义：材质给的优先，没写材质就取资产的（道具、树）。 */
export function SceneObjectSemantic(obj) {
  return SCENE_MATERIALS[obj?.material]?.semantic || SCENE_ASSETS[obj?.asset]?.semantic || null;
}

/** 这种样子的场景用哪些材质：白盒场景 Whitebox/*，正式场景 Look/*（场景编辑器的材质下拉）。 */
export function SceneMaterialsFor(style) {
  const prefix = style === "formal" ? "Look/" : "Whitebox/";
  return Object.entries(SCENE_MATERIALS).filter(([id]) => id.startsWith(prefix));
}

/** 这种样子的场景能放哪些资产：白盒 = 白盒体块 + 远景；正式 = 体块、道具、树 + 远景（场景编辑器的资产页）。 */
export function SceneAssetsFor(style) {
  return Object.entries(SCENE_ASSETS).filter(([id, asset]) => asset.layer === "backdrop"
    || (style === "formal" ? id !== "Whitebox/Box" : id === "Whitebox/Box"));
}
