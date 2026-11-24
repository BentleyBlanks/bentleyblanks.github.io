// 场景资产目录（docs/Data_Scene.md §3）：场景文件里的物件只写资产编号，编号 → 这是什么、怎么画、在哪个文件，查这张表。
//
// 为什么不直接写文件路径：改文件名、换模型只改这里一行，几千行场景不用动（Unity 的场景存的也是资产的 GUID，不是路径）。
// 编号一旦被场景用上就别改名；要废弃就留着编号、改 note。
//
// 纯数据，零 three。体块的样子由材质决定：两个场景的体块都引用 Whitebox/* 材质（灰面 + 米格线）。
// 正式场景另放正式资产：道具模型（Prop/*）、树（Tree/*）；体块（房子、墙、工事）还不是正式资产，
// 不给它配贴图外观（用户 2026-11-01：「不算正式资产，你不要自己造出来」），等做了正式的房子模型再换。

/**
 * 场景清单：场景编辑器的下拉、本机存盘口 /__scene/*、白盒编辑器按 id 找场景都查这张表。
 * style：whitebox = 白盒的样子（灰面 + 米格线、高度色带地面）；formal = 正式场景（体块照旧灰面 + 米格线；道具模型、树、植被、分层地表是正式的）。
 */
export const SCENE_LIST = Object.freeze([
  Object.freeze({ id: "FirstLevelWhitebox", title: "第一关 · 白盒", style: "whitebox", note: "白盒编辑器的编辑与预演跑这个" }),
  Object.freeze({ id: "FirstLevel", title: "第一关 · 正式", style: "formal", previewParam: "firstLevelScenePreview", previewCameraOptional: true,
    note: "白盒编辑器的试玩跑这个；2026-11-01 照白盒布局复制，道具换外部模型、地面换分层地表，体块仍是白盒网格，之后单独打磨" }),
  Object.freeze({ id: "FirstLevelEncounter", title: "第一关 · Encounter Play", style: "whitebox", note: "独立遭遇场景；编排和 Play 共用，原场景保持独立" }),
  Object.freeze({ id: "DugoutAidOpenFields", title: "沟底包扎 · 朝田野敞开的木棚", style: "formal", previewParam: "dugoutAidOpenFields" }),
  Object.freeze({ id: "FirstLevelMerged", title: "第一关 · 北沙河单村合并版", style: "whitebox",
    note: "01–07（z<355）实时继承 FirstLevelEncounter，z>=355 为合并后的北沙河单村分叉段" }),
  Object.freeze({ id: "GengjiazhuangFieldApproach", title: "从沟沿望向耿家庄", style: "formal", previewParam: "gengjiazhuangFieldApproach" }),
  Object.freeze({ id: "GengjiazhuangEastSmoke", title: "凹路尽头 · 望庄东", style: "formal", previewParam: "gengjiazhuangEastSmoke" }),
  Object.freeze({ id: "TanketteAdvanceEastTrack", title: "从沟沿望向东侧战车道", style: "formal",
    previewParam: "tanketteAdvanceEastTrack" }),
  Object.freeze({ id: "AircraftEvacuationDitch", title: "凹路撤运 · 沟底仰视三机", style: "formal", previewParam: "aircraftEvacuationDitch" }),
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

// 节点名与 Blender 导出的模型包一一对应。
export const DUGOUT_AID_OPEN_FIELDS_PROPS = Object.freeze([
  ["SplitTimber", "timber", "裂口木柱", [0.33, 2.68, 0.37]],
  ["BrokenSodRoof", "timber", "破损覆土木棚", [7.44, 1.45, 4.79]],
  ["CutEarthBank", "earthDark", "沟壁与土阶", [3.27, 2.23, 2.40]],
  ["DamagedGrayBrickWall", "structure", "残缺灰砖矮墙", [1.43, 0.66, 0.32]],
  ["WickerBasket", "timber", "柳条编篮", [0.60, 0.40, 0.34]],
  ["EarthenRubble", "earthDark", "断角土石", [0.47, 0.33, 0.37]],
  ["BareFieldElm", "foliage", "田边枯榆", [7.98, 7.85, 4.44]],
  ["Farmhouse", "structure", "田野灰瓦农舍", [9.21, 3.77, 4.78]],
  ["WheatField", "foliage", "麦苗田畦", [8, 0.21, 3.8]],
].map(([node, semantic, label, size]) => Object.freeze({
  node, ...Prop(`dugoutAid${node}`, semantic, label, size),
})));

export const SCENE_ASSETS = Object.freeze({
  "Whitebox/Box": Object.freeze({ kind: "box", sized: true, label: "白盒体块", note: "米制长方体；样子看 material，碰撞看 solid" }),
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
  "Prop/ditchBrokenElm": Prop("ditchBrokenElm", "timber", "裂干枯榆", [6.094, 7.413, 3.244]),
  "Prop/deadTreeTrunk01": Prop("deadTreeTrunk01", "timber", "断枯树干", [0.74, 2.22, 0.67]),
  "Prop/ditchDamagedFarmhouse": Prop("ditchDamagedFarmhouse", "plaster", "破灰瓦土屋", [8.934, 3.436, 4.931]),
  "Prop/ditchDonkeyCart": Prop("ditchDonkeyCart", "timber", "灰驴与两轮木车 · 静置", [1.652, 1.562, 2.991]),
  "Prop/ditchStretcher": Prop("ditchStretcher", "canvas", "竹竿布兜担架", [0.69, 0.128, 2.15]),
  "Prop/ditchDistantAircraft": Prop("ditchDistantAircraft", "steel", "Ki-30 远景飞机", [14.55, 3.03, 10.14]),
  "Prop/wardBandageRoll": Prop("wardBandageRoll", "canvas", "绷带卷", [0.35, 0.04, 0.25]),
  "Prop/eastTrackSplinteredElm": Prop("eastTrackSplinteredElm", "timber", "裂口榆树干", [2.6268, 4.6105, 2.239]),
  "Prop/eastTrackGreyTimberShoring": Prop("eastTrackGreyTimberShoring", "timber", "灰木沟壁支护", [2.57361, 1.52759, 0.48875]),
  "Prop/eastTrackDrapedTimberShoring": Prop("eastTrackDrapedTimberShoring", "timber", "覆旧帆布的沟壁支护", [2.57361, 1.52759, 0.68995]),
  "Prop/type94Tankette": Prop("type94Tankette", "metal", "九四式轻装甲车", [1.62, 1.63, 3.08]),
  "Prop/battlefieldTimberBeam": Prop("battlefieldTimberBeam", "timber", "旧木梁", [1.20, 0.14, 0.18]),
  "Prop/eastTrackBambooStretcher": Prop("eastTrackBambooStretcher", "canvas", "竹竿布兜担架", [0.65, 0.20, 2.15]),
  "Prop/eastTrackDressingBlanket": Prop("eastTrackDressingBlanket", "canvas", "沟底旧毯", [0.70, 0.30, 1.20]),
  ...Object.fromEntries(DUGOUT_AID_OPEN_FIELDS_PROPS.map(asset => [`Prop/${asset.model}`, asset])),
  "Prop/fieldApproachOldElm": Prop("fieldApproachOldElm", "timber", "沟沿老榆树", [7.316, 8.345, 4.899]),
  "Prop/fieldApproachLoadedCart": Prop("fieldApproachLoadedCart", "timber", "载草木车", [1.884, 1.940, 3.958]),
  "Prop/fieldApproachTileFarmhouse": Prop("fieldApproachTileFarmhouse", "plaster", "灰瓦夯土农舍", [9.331, 3.852, 4.96]),
  "Prop/fieldApproachStrawRick": Prop("fieldApproachStrawRick", "canvas", "田边草垛", [2.489, 1.135, 1.669]),
  "Prop/fieldApproachSplitRailFence": Prop("fieldApproachSplitRailFence", "timber", "枝条栅栏", [3.438, 0.986, 0.204]),
  "Prop/fieldApproachFieldElm": Prop("fieldApproachFieldElm", "timber", "田间细榆树", [3.674, 4.783, 2.106]),
  "Prop/fieldApproachWheatTuft": Prop("fieldApproachWheatTuft", "foliage", "矮麦苗", [0.214, 0.143, 0.179]),
  "Prop/fieldApproachDryGrass": Prop("fieldApproachDryGrass", "foliage", "沟沿干草与细根", [0.352, 0.267, 0.328]),
  "Prop/fieldApproachSoilClod": Prop("fieldApproachSoilClod", "earthDark", "翻土块", [0.147, 0.071, 0.108]),
  "Prop/eastTrackBrokenEarth": Prop("eastTrackBrokenEarth", "earthDark", "东侧车道碎土", [0.102, 0.047, 0.088]),
  "Prop/eastTrackSettledStubble": Prop("eastTrackSettledStubble", "foliage", "东侧车道伏草", [0.352, 0.042, 0.318]),
  "Prop/fieldApproachPackDonkey": Prop("fieldApproachPackDonkey", "canvas", "驮草小驴", [1.245, 1.643, 1.913]),
  "Prop/eastSmokeCourtyardGate": Prop("eastSmokeCourtyardGate", "plaster", "庄东破损院墙与门洞", [7.8, 2.21, 0.82]),
  "Prop/eastSmokeMaizeStubble": Prop("eastSmokeMaizeStubble", "foliage", "庄东折断的玉米残茬", [0.69, 0.4, 0.36]),
  "Prop/woodenEvacCart": Prop("woodenEvacCart", "timber", "撤运木车（静置）", [1.95, 1.32, 4.8]),
  "Prop/singleBlanket": Prop("singleBlanket", "canvas", "土布单被（静置）", [1.4, 0.055, 1.9]),
  "Prop/singleBlanketCrumpled": Prop("singleBlanketCrumpled", "canvas", "揉起的土布单被（静置）", [0.45, 0.25, 0.45]),
  "Backdrop/Box": Object.freeze({ kind: "backdropBox", layer: "backdrop", label: "远景盒子", note: "房墙、屋顶、院墙；params: w d h lift color" }),
  "Backdrop/Blob": Object.freeze({ kind: "backdropBlob", layer: "backdrop", label: "远景树冠", note: "椭球；params: rx rz h lift color" }),
  "Backdrop/Hill": Object.freeze({ kind: "backdropHill", layer: "backdrop", label: "远景低山", note: "params: rx rz h color topColor" }),
  "Backdrop/Tree": Object.freeze({ kind: "backdropTree", layer: "backdrop", label: "远景枯树", note: "params: h" }),
});

/**
 * 材质：编号 → 语义（建场用的材质槽、弹着表面）。
 * Whitebox/*：白盒材质（灰面 + 米格线），保留语义色的几种（场景 look.colorSemantics）颜色在关卡的 semanticColors 里。
 */

export const SCENE_MATERIALS = Object.freeze({
  "Whitebox/EarthDark": Object.freeze({ semantic: "earthDark", label: "深土" }),
  "Whitebox/Step": Object.freeze({ semantic: "step", label: "台阶 / 踏脚" }),
  "Whitebox/Timber": Object.freeze({ semantic: "timber", label: "木头" }),
  "Whitebox/Cover": Object.freeze({ semantic: "cover", label: "掩体" }),
  "Whitebox/Plaster": Object.freeze({ semantic: "plaster", label: "土墙 / 抹灰" }),
  "Whitebox/Foliage": Object.freeze({ semantic: "foliage", label: "植物" }),
  "Whitebox/Canvas": Object.freeze({ semantic: "canvas", label: "布 / 席" }),
  "Whitebox/AirWall": Object.freeze({ semantic: "airWall", label: "空气墙" }),
  "Whitebox/Roof": Object.freeze({ semantic: "roof", label: "屋顶" }),
  "Whitebox/Structure": Object.freeze({ semantic: "structure", label: "建筑结构" }),
  "Whitebox/Water": Object.freeze({ semantic: "water", label: "水" }),
  "Whitebox/Danger": Object.freeze({ semantic: "danger", label: "危险区" }),
  "Whitebox/Metal": Object.freeze({ semantic: "metal", label: "铁件" }),
  "Whitebox/Void": Object.freeze({ semantic: "void", label: "门窗洞暗面" }),
  "Whitebox/Coping": Object.freeze({ semantic: "coping", label: "墙头压顶" }),
});

const SEMANTIC_TO_MATERIAL = Object.freeze(Object.fromEntries(
  Object.entries(SCENE_MATERIALS).map(([id, material]) => [material.semantic, id])));

/** 语义 → 白盒材质编号；没登记的语义返回 null。 */
export function WhiteboxMaterialFor(semantic) {
  return SEMANTIC_TO_MATERIAL[semantic] || null;
}

/** 物件的语义：材质给的优先，没写材质就取资产的（道具、树）。 */
export function SceneObjectSemantic(obj) {
  return SCENE_MATERIALS[obj?.material]?.semantic || SCENE_ASSETS[obj?.asset]?.semantic || null;
}

/** 这种样子的场景能放哪些资产：白盒 = 白盒体块 + 远景；正式 = 白盒体块、道具、树 + 远景（场景编辑器的资产页）。 */
export function SceneAssetsFor(style) {
  return Object.entries(SCENE_ASSETS).filter(([id, asset]) => asset.layer === "backdrop"
    || id === "Whitebox/Box" || (style === "formal" && (asset.kind === "prop" || asset.kind === "tree")));
}
