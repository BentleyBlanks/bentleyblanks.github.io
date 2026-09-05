// 资产规范编辑器的纯数据真相。不得 import three。
//
// “原始面数”统一指：导入器剔除明确不进游戏的展示件、备用状态、重复壳之后，
// 在通用减面前选定的三角形。源文件中的退化面会在强制拓扑清理时消失；刺刀的
// 枪口环与柄片等项目补件则会让最终数略高于原始数。实际面数始终读 Data_Meshes。

export const TRIANGLE_RULES = Object.freeze({
  weapon: Object.freeze({
    label: "枪械 / 武器源模型",
    limit: 30000,
    rule: "选定源几何不超过 30,000 三角时不减面；超过时尽量贴近 30,000，但降幅 ≤5% 仍保留原始拓扑。",
  }),
  vehicle: Object.freeze({
    label: "战车源模型",
    limit: 80000,
    rule: "选定源几何不超过 80,000 三角时不减面；超过时尽量贴近 80,000，但降幅 ≤5% 仍保留原始拓扑。",
  }),
});

export const MIN_DECIMATION_REDUCTION = 0.05;

// 恢复外部 GLB 面数后，七关 high 档实测峰值为 7.842M。保留约 3.3% 工程余量，
// 仍由 BootTest 逐关量；编辑器与门禁必须共用这一份数值。
export const SCENE_RENDER_LIMITS = Object.freeze({
  drawCalls: 5000,
  triangles: 8100000,
});

export const SPECIAL_TRIANGLE_TARGETS = Object.freeze({
  OfficerSwordSet: 7812,
  BrowningTripodAssembly: 9026,
  MediumMortar: 9068,
});

const SharedWeaponPbr = "项目共享 512px 枪钢/枪木 BaseColor + Normal + ORM";
const SourceUv = "保留源 UV，使用源图的浏览器转换版";

export const SOURCE_ASSET_STANDARDS = Object.freeze({
  ZhongZheng: { name: "中正式", group: "firearm", sourceTriangles: 6703,
    sourceTexture: "有（离线分桶）", runtimeTexture: SharedWeaponPbr,
    note: "现代瞄准镜、包布与独立子弹不属于游戏选定几何。" },
  HanYang: { name: "汉阳造", group: "firearm", sourceTriangles: 2672,
    sourceTexture: "有（源材质）", runtimeTexture: SharedWeaponPbr },
  Zb26: { name: "ZB-26", group: "firearm", sourceTriangles: 7811,
    sourceTexture: "有（离线分桶）", runtimeTexture: SharedWeaponPbr,
    note: "24k 三角的重复枪管细分壳明确排除，完整主枪管保留。" },
  Type38: { name: "三八式", group: "firearm", sourceTriangles: 12475,
    sourceTexture: "有（占位纹理）", runtimeTexture: SharedWeaponPbr },
  ServicePistol: { name: "九毫米军用手枪", group: "firearm", sourceTriangles: 7265,
    sourceTexture: "有", runtimeTexture: SharedWeaponPbr,
    note: "只取闭锁状态 A；展示弹匣、子弹与空仓挂机状态 B 不进游戏。" },
  Type11: { name: "十一年式轻机枪", group: "firearm", sourceTriangles: 8255,
    sourceTexture: "有（4 张）", runtimeTexture: SourceUv,
    note: "分解展示件排除，保留装配态枪体；退化面清理不属于减面。" },
  Mauser96: { name: "毛瑟 C96", group: "firearm", sourceTriangles: 1123,
    sourceTexture: "有（漫反射 + 高光）", runtimeTexture: SourceUv },
  Type92Hmg: { name: "九二式重机枪", group: "firearm", sourceTriangles: null,
    sourceTexture: "无", runtimeTexture: SharedWeaponPbr,
    note: "本机重建源当前缺席；已提交成品 20,065 三角，仅排除两个展示 Cube。" },

  Dadao: { name: "二十九军战刀", group: "melee", sourceTriangles: 4199,
    sourceTexture: "有（付费源）", runtimeTexture: "专用 1K PBR，保留源 UV" },
  BayonetZhongZheng: { name: "HY1935 刺刀", group: "melee", sourceTriangles: 14431,
    sourceTexture: "有（源 4K）", runtimeTexture: SharedWeaponPbr, repair: true,
    note: "源底模无枪口环；最终数包含项目补环、环箍与木柄片。" },
  BayonetHanYang: { name: "汉阳造配刀", group: "melee", sourceTriangles: 14431,
    sourceTexture: "有（源 4K）", runtimeTexture: SharedWeaponPbr, repair: true,
    note: "最终数包含项目补环、环箍与木柄片。" },
  BayonetType38: { name: "三十年式刺刀", group: "melee", sourceTriangles: 265,
    sourceTexture: "有（PSX 漫反射）", runtimeTexture: SharedWeaponPbr },
  OfficerSwordSet: { name: "军刀与刀鞘", group: "melee", sourceTriangles: 298456,
    sourceTexture: "局部饰带", runtimeTexture: "饰带保留源 UV；刀身/刀鞘使用共享枪钢",
    note: "指定特例：以原成品 3,906 三角为基准翻倍，目标 7,812。" },
  RingPommelDagger: { name: "环首短刃", group: "melee", sourceTriangles: 515,
    sourceTexture: "有", runtimeTexture: SourceUv },

  BrowningTripodAssembly: { name: "勃朗宁三脚架组件", group: "assembly", sourceTriangles: 54013,
    sourceTexture: "无可用成品图", runtimeTexture: SharedWeaponPbr,
    note: "指定特例：以原成品 4,513 三角为基准翻倍，目标 9,026。" },
  UnidentifiedMunition: { name: "未识别弹体", group: "assembly", sourceTriangles: 128,
    sourceTexture: "有", runtimeTexture: SourceUv },
  MediumMortar: { name: "中型迫击炮", group: "assembly", sourceTriangles: 70460,
    sourceTexture: "无可用成品图", runtimeTexture: SharedWeaponPbr,
    note: "指定特例：以原成品 4,534 三角为基准翻倍，目标 9,068。" },

  Type89Tank: { name: "八九式中战车", group: "vehicle", sourceTriangles: 4089,
    sourceTexture: "有（扫描图）", runtimeTexture: "项目共享 armor / track / steel PBR" },
  Type95HaGo: { name: "九五式轻战车", group: "vehicle", sourceTriangles: 82142,
    sourceTexture: "有源包引用", runtimeTexture: "项目共享 armor PBR",
    note: "目标 80k 只会减 2.6%，按 5% 规则保留原始拓扑。" },
  Type97ChiHa: { name: "九七式中战车", group: "vehicle", sourceTriangles: 3969,
    sourceTexture: "有（扫描图）", runtimeTexture: "项目共享 armor / track / steel PBR" },
});

const BattlefieldSourceTriangles = Object.freeze({
  BattlefieldBarbedWire01: 80, BattlefieldBarbedWire02: 80,
  BattlefieldBeamObstacle01: 36, BattlefieldBeamObstacle02: 36,
  BattlefieldSupplyBox: 12, BattlefieldCanvasCover01: 968,
  BattlefieldCompartmentCrate: 132, BattlefieldShellStack: 2384,
  BattlefieldGrenadeStack: 1920, BattlefieldCartridgeScatter: 1324,
  BattlefieldCanvasCover02: 882, BattlefieldHedgehog: 180,
  BattlefieldOpenBin: 352, BattlefieldGroundSheet: 128,
  BattlefieldTimberBeam: 112, BattlefieldMetalPole: 36,
  BattlefieldPillbox: 1519, BattlefieldLadder: 764,
  BattlefieldTrenchEarthwork: 14928, BattlefieldSandbag01: 572,
  BattlefieldSandbag02: 572, BattlefieldSandbag03: 572,
  BattlefieldGroundPlane: 133, BattlefieldRock: 140,
});

const ChineseLifeSourceTriangles = Object.freeze({
  ClayWaterVat: 856, ClayRoundVat: 856, ClayLuggedJar: 1088,
  ClayLiddedJar: 500, ClayWideJar: 500, FirewoodPile: 1426,
  LongBench: 242, WineJarCluster: 650, ClothLantern: 976,
  ShopPlaque: 316, WinnowingBasket: 4700, WovenBasket: 1088,
  WoodPlatformBench: 1252, StoneWellCurb: 816, StoneMillWheel: 976,
  BambooHat: 2178,
});

function PreserveSourceRows(pack, records, runtimeTexture) {
  return Object.entries(records).map(([id, triangles]) => Object.freeze({
    id, name: `${pack} / ${id}`, pack, sourceTriangles: triangles,
    actualTriangles: triangles, targetTriangles: triangles,
    sourceTexture: "有（源包）", runtimeTexture, policy: "source",
    note: "指定保留选定源模型面数，不做通用减面。",
  }));
}

export const EXTERNAL_GLB_STANDARDS = Object.freeze([
  Object.freeze({
    id: "ChineseRuralHouse", name: "乡村房屋", pack: "Model_ChineseRuralHouse.glb",
    sourceTriangles: 236434, actualTriangles: 58812, targetTriangles: 58812,
    sourceTexture: "有（2 张源 BaseColor）", runtimeTexture: "源 UV + 项目房屋 BaseColor / Normal",
    policy: "target", note: "指定以原成品 29,406 三角为基准翻倍，目标 58,812。",
  }),
  ...PreserveSourceRows("Battlefield Pack", BattlefieldSourceTriangles, "项目共享战场材质 PBR"),
  ...PreserveSourceRows("Chinese Life", ChineseLifeSourceTriangles, "项目共享 / 专用生活道具 PBR"),
  Object.freeze({
    id: "TengxianShopFacade", name: "滕县临街铺面", pack: "Model_TengxianConstructionKit.glb",
    sourceTriangles: 372, actualTriangles: 372, targetTriangles: 372,
    sourceTexture: "无（Blender MCP 自建）", runtimeTexture: "项目共享 HouseBrick / Stone / WoodDoor / RoofTile",
    policy: "source", note: "Blender MCP 自建低模构件；保留经审查的自制拓扑。",
  }),
  Object.freeze({
    id: "TengxianCourtyardHouse", name: "滕县一进院落", pack: "Model_TengxianConstructionKit.glb",
    sourceTriangles: 432, actualTriangles: 432, targetTriangles: 432,
    sourceTexture: "无（Blender MCP 自建）", runtimeTexture: "项目共享 HouseBrick / Stone / WoodDoor / RoofTile",
    policy: "source", note: "Blender MCP 自建低模构件；外墙无窗、东南门为鲁南形制约束。",
  }),
  Object.freeze({
    id: "TengxianCountyOfficeGatehouse", name: "滕县县署门楼", pack: "Model_TengxianConstructionKit.glb",
    sourceTriangles: 284, actualTriangles: 284, targetTriangles: 284,
    sourceTexture: "无（Blender MCP 自建）", runtimeTexture: "项目共享 HouseBrick / Stone / WoodBeam / RoofTile",
    policy: "source", note: "Blender MCP 自建低模构件；不附加未考证的门匾文字。",
  }),
  Object.freeze({
    id: "TengxianCityGateTower", name: "滕县城门楼", pack: "Model_TengxianConstructionKit.glb",
    sourceTriangles: 664, actualTriangles: 664, targetTriangles: 664,
    sourceTexture: "无（Blender MCP 自建）", runtimeTexture: "项目共享 GateBrick / Stone / WoodDoor / GateRoofTile",
    policy: "source", note: "Blender MCP 自建低模构件；按滕县砖石高城墙与双檐门楼尺度做独立基座。",
  }),
  Object.freeze({
    id: "TengxianRailwayStation", name: "津浦铁路三等站（推定）", pack: "Model_TengxianConstructionKit.glb",
    sourceTriangles: 484, actualTriangles: 484, targetTriangles: 484,
    sourceTexture: "无（Blender MCP 自建）", runtimeTexture: "项目共享 StationBrick / Stone / WoodBeam / RoofTile",
    policy: "source", note: "Blender MCP 自建低模构件；滕县原站房无图纸，德式三等站形制为明确推定。",
  }),
  Object.freeze({
    id: "TengxianOutfieldDefenseKit", name: "城外防御工事组合", pack: "Model_TengxianConstructionKit.glb",
    sourceTriangles: 1852, actualTriangles: 1852, targetTriangles: 1852,
    sourceTexture: "无（Blender MCP 自建）", runtimeTexture: "项目共享 RammedEarth / Sandbag / WoodBeam / GroundRubble",
    policy: "source", note: "Blender MCP 自建低模构件；壕沟、木衬砌、沙袋、瞭望棚与线杆可拆分审查。",
  }),
  Object.freeze({
    id: "LeaflessTreeOak", name: "无叶乔木 / 老橡树", pack: "Model_LeaflessTreeSet.glb",
    sourceTriangles: 190527, actualTriangles: 47998, targetTriangles: 47998,
    sourceTexture: "有（源树皮）", runtimeTexture: "项目共享 TreeBark",
    policy: "target", note: "指定以原成品 23,999 三角为基准翻倍。",
  }),
  Object.freeze({
    id: "LeaflessTree01", name: "无叶乔木 / 枝展型", pack: "Model_LeaflessTreeSet.glb",
    sourceTriangles: 253600, actualTriangles: 60000, targetTriangles: 60000,
    sourceTexture: "源包无有效成品图", runtimeTexture: "项目共享 TreeBark",
    policy: "target", note: "指定以原成品 30,000 三角为基准翻倍。",
  }),
  Object.freeze({
    id: "LeaflessTreeLowPoly", name: "无叶乔木 / 疏枝型", pack: "Model_LeaflessTreeSet.glb",
    sourceTriangles: 22700, actualTriangles: 22700, targetTriangles: 22700,
    sourceTexture: "源包无有效成品图", runtimeTexture: "项目共享 TreeBark",
    policy: "source", note: "翻倍目标 25,928 高于源模型 22,700；以原始拓扑封顶，不人为细分。",
  }),
]);

export const ASSET_STANDARD_GROUPS = Object.freeze([
  { id: "firearm", label: "枪械" },
  { id: "assembly", label: "架设 / 炮械" },
  { id: "melee", label: "刀剑 / 刺刀" },
  { id: "vehicle", label: "战车" },
  { id: "procedural", label: "程序化 TZM" },
  { id: "external", label: "外部 GLB" },
  { id: "texture", label: "贴图规范" },
]);

export const OTHER_ASSET_RULES = Object.freeze({
  procedural: Object.freeze([
    { name: "人物 TZM", limit: "1,800 三角", texture: "项目材质桶", note: "无外部原始模型，原始/降幅记为不适用。" },
    { name: "程序化 Prop TZM", limit: "400 三角", texture: "项目共享材质", note: "新增静态几何仍必须走 BuildSink。" },
    { name: "程序化武器 TZM", limit: "30,000 三角", texture: "项目共享武器 PBR", note: "同枪械分类上限；当前成品远低于阈值。" },
  ]),
  external: Object.freeze([
    { name: "通用减面下限", limit: "降幅 >5% 才减面", texture: "不影响贴图判定", note: "目标与原始面数相差 5% 及以下时，直接保留选定源拓扑。" },
    { name: "角色 GLB", limit: "逐角色骨架/动作审计", texture: "源贴图或项目换装", note: "面数不是唯一门禁；姿态、骨盆高度、命中骨与动画完整性同时验收。" },
    { name: "场景构件 GLB", limit: "逐资产登记预算", texture: "源图压缩或项目共享材质", note: "不套用枪械 30k / 战车 80k；构件包按 Data_ExternalAssets_* 的逐件预算验收。" },
    { name: "静态世界构件", limit: `开机全场 ≤ ${SCENE_RENDER_LIMITS.triangles.toLocaleString("en-US")} 三角`, texture: "albedo=sRGB；normal/orm=NoColorSpace", note: `同时受 draw call ≤ ${SCENE_RENDER_LIMITS.drawCalls.toLocaleString("en-US")} 与 BuildSink/实例化规则约束。` },
  ]),
  texture: Object.freeze([
    { name: "枪械共享 PBR", limit: "512px / 通道", texture: "BaseColor + Normal + ORM", note: "源 2K/4K 图不直接进 Pages；ORM 为 R=AO、G=roughness、B=metalness。" },
    { name: "专用源 UV PBR", limit: "按资产清单", texture: "保留 UV 的浏览器转换版", note: "只用于确有辨识信息的原图；不得把占位/噪点图当成成品皮肤。" },
    { name: "色彩空间", limit: "硬规则", texture: "Albedo=sRGB；Normal/ORM=NoColorSpace", note: "任何来源都不得例外。" },
    { name: "许可与署名", limit: "硬规则", texture: "源文件与运行时派生物分开", note: "付费/受限源不进公开仓库；CC-BY 署名链必须保留。" },
  ]),
});

export function TriangleRuleFor(record) {
  return record?.group === "vehicle" ? TRIANGLE_RULES.vehicle : TRIANGLE_RULES.weapon;
}

export function ThresholdTriangleTarget(sourceTriangles, limit) {
  if (!Number.isFinite(sourceTriangles) || sourceTriangles <= 0) return null;
  const target = Math.min(sourceTriangles, limit);
  return (sourceTriangles - target) / sourceTriangles <= MIN_DECIMATION_REDUCTION
    ? sourceTriangles : target;
}

export function ReductionPercent(sourceTriangles, actualTriangles) {
  if (!Number.isFinite(sourceTriangles) || sourceTriangles <= 0) return null;
  return (1 - actualTriangles / sourceTriangles) * 100;
}

export function ComplianceFor(id, actualTriangles) {
  const record = SOURCE_ASSET_STANDARDS[id];
  if (!record) return { label: "程序化 / 独立预算", tone: "" };
  if (!Number.isFinite(record.sourceTriangles)) return { label: "源文件待复核", tone: "warn" };
  const special = SPECIAL_TRIANGLE_TARGETS[id];
  if (special != null) {
    const close = actualTriangles <= special && actualTriangles >= special * 0.97;
    return { label: close ? "特例达标" : "偏离特例目标", tone: close ? "good" : "bad" };
  }
  const rule = TriangleRuleFor(record);
  if (record.repair && actualTriangles > record.sourceTriangles) {
    return { label: "原模保留 + 补件", tone: "good" };
  }
  const target = ThresholdTriangleTarget(record.sourceTriangles, rule.limit);
  if (target === record.sourceTriangles) {
    const close = actualTriangles <= record.sourceTriangles * 1.001
      && actualTriangles >= record.sourceTriangles * 0.97;
    return { label: close ? "原始拓扑保留" : "阈值内却明显减面", tone: close ? "good" : "bad" };
  }
  if (record.sourceTriangles > rule.limit) {
    const close = actualTriangles <= target && actualTriangles >= target * 0.97;
    return { label: close ? "阈值达标" : "偏离分类阈值", tone: close ? "good" : "bad" };
  }
  if (actualTriangles > rule.limit) return { label: "超过分类阈值", tone: "bad" };
  return { label: "原始拓扑保留", tone: "good" };
}
