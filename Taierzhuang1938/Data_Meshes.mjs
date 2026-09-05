// 《血战台儿庄》模型清单：Blender 程序化管线（Taierzhuang1938/_blender/）出的
// 那批 .tzm.json 的元数据。
//
// 这张表是**手写但可校验**的：数字全部抄自 Model/Index.json（BuildAll.py 每次
// 重建都会重写它），_blender/Verify.mjs 会把两边逐字段对一遍。不直接在运行时
// fetch Index.json 的理由：开机路径上每多一次往返就多一次可能失败的网络请求，
// 而这些数字是构建期常量，没有必要在玩家的手机上再确认一遍。
//
// 改了 _blender 里的建模脚本 → 重跑 BuildAll → 照 Index.json 更新这张表 →
// 跑 Verify。跳过任何一步，Verify 都会报出来。
//
// 史实红线（docs/Data_HistoryMaterial.md 第三节）：
//   中方无钢盔（布军帽 + 青天白日帽徽），日方无屁帘（1938 年 3—4 月）。
//   模型里已经照办，改建模脚本时别翻回去。

/** 模型目录。相对 index.html 所在目录。 */
export const MODEL_BASE = "./Model/";
/** 人物 / 枪 TZM 换了内容就加一，避免 Pages 继续使用旧模型缓存。 */
// 士兵预览必须把模型文件与角色/加载器模块当作同一份发布物。单独换模型而
// 浏览器仍命中旧模块缓存，会造成面板写着 model、骨架却按旧布局拆散的假成功。
const MESH_REV = "type89-20260906";

/**
 * 人物骨架的关节名 —— 与 Script_Actor.mjs 的 Actor 构造函数逐字对齐。
 * 顺序是层级顺序，不是随便排的。**没有独立的 hand / head 关节**：
 * 手的几何在 elbow 桶里、头的几何在 neck 桶里，这一点也照抄 Actor。
 */
export const SOLDIER_JOINTS = [
  "hips", "chest", "neck",
  "shoulderL", "elbowL", "shoulderR", "elbowR",
  "thighL", "kneeL", "ankleL", "thighR", "kneeR", "ankleR",
];

/** 人物身上的挂点（没有网格的空节点）。 */
export const SOLDIER_MOUNTS = ["eyes", "gripL", "gripR", "weaponMount", "slingBack"];

/** 枪上的挂点。近战/投掷物只有前几个，见每个条目的 mounts。 */
export const WEAPON_MOUNTS = ["muzzle", "gripR", "gripL", "sight", "magazine"];

/**
 * 车辆的挂点。**车辆规范系与武器不同**：原点在地面、车体中心，车头朝 -Z。
 * 车头朝向由 Script_ModelFacingTest 用几何复量：有 steel 炮管桶的看炮管质心在 -Z，
 * 单体网格的按条目里的 facing 证据（前高后低的轮廓）判；两样都没有就红。
 * （前方约定与人、枪一致），长在 Z、宽在 X、高在 Y。放置的人写一个 (x, z) 就落地。
 * 炮塔是关节而不是挂点 —— 它要转，取 nodes.get("turret")。
 */
export const VEHICLE_MOUNTS_TANK = ["gunMuzzle", "rearMgMuzzle", "hatch", "mgMuzzle", "hullFront"];
export const VEHICLE_MOUNTS_TANKETTE = ["gunMuzzle", "towHook", "hullFront"];

/**
 * 降级用的材质合并表：把材质名重映射到另一个桶，合批时就少一个 draw call。
 * 传给 LoadModel 的 options.mergeMap。
 *
 * 反直觉但重要：**只有同一个关节上的两个桶合并才真省 draw call**。
 * 把鞋并进军装（都在 ankle 上）省得到；把帽徽并进军装（都在 neck 上）也省得到；
 * 而把小臂并进上臂是省不到的 —— 它们在两根不同的骨头上，网格数一个没少。
 */
export const MERGE_PROFILES = {
  high: null,
  // trouser 只有百姓在用（士兵那两个模型没有这个桶，这一行对它们是空操作）。
  // 并进军装在**胯**那一根骨头上是真省一个：裤腰与袄下摆都挂在 hips 上。
  medium: { accentA: "uniform", accentB: "uniform", trouser: "uniform" },
  low: {
    accentA: "uniform", accentB: "uniform", accessory: "uniform",
    shoe: "uniform", leather: "uniform", red: "uniform", towel: "uniform",
    // 百姓的裤子与头发。裤子并进军装在**胯**那一根骨头上是真省一个 draw call
    //（裤腰与袄下摆都挂在 hips 上）；士兵不用这两个桶，这两行对它们是空操作。
    trouser: "uniform", hair: "uniform",
  },
};

/**
 * 模型表。
 *   triangles / meshBlocks / nodes：构建期实测值，Verify 会对
 *   draws.high|medium|low：**合批后单个实例的 draw call 数**（Verify 实测）
 *   materials：模型里出现的材质名，必须都能在调用方给的 materials 表里找到
 *   span：根空间包围盒尺寸（米），用来确认没建错比例
 */
export const MESHES = {
  SoldierNra: {
    file: "SoldierNra.tzm.json", category: "soldier",
    triangles: 1800, meshBlocks: 23, nodes: 29, joints: 13,
    materials: ["accentA", "accentB", "accessory", "shoe", "skin", "uniform"],
    mounts: SOLDIER_MOUNTS, joinNames: SOLDIER_JOINTS,
    span: [0.5187, 1.6747, 0.3484], height: 1.66,
    draws: { high: 21, medium: 19, low: 18 },
    note: "川军第 22 集团军第 122 师步兵。布军帽 + 青天白日帽徽、灰蓝土布军装、"
      + "斜挎布子弹带（只有靠身三格鼓着）、层叠绑腿、露趾草鞋。**无钢盔。**",
  },
  SoldierIja: {
    file: "SoldierIja.tzm.json", category: "soldier",
    triangles: 1776, meshBlocks: 23, nodes: 32, joints: 13,
    materials: ["accentA", "accentB", "helmet", "leather", "shoe", "skin", "uniform"],
    mounts: SOLDIER_MOUNTS, joinNames: SOLDIER_JOINTS,
    span: [0.501, 1.631, 0.348], height: 1.62,
    draws: { high: 19, medium: 18, low: 17 },
    note: "濑谷支队步兵。立领昭五式 + 步兵红领章、九〇式钢盔（外翻盔沿 + 正面五角星）、"
      + "皮弹药盒三只、编上靴 + 脚绊。**1938 年 3—4 月无屁帘。**",
  },

  // 百姓。两个模型是**同一个 kind 的两个分身**（男/女由 seed 定，见 Script_Actor
  // 的 KIND_SPEC.civilian.variants）。两个都建在 1.60 m 上，女性矮的那 4.5% 走
  // 运行时的整体缩放 —— 加载器的 scale = KIND_SPEC.height / MESHES.height 会把
  // 烘死在模型里的身高差直接除回去，所以身高差不能烘进模型。
  CivilianMale: {
    file: "CivilianMale.tzm.json", category: "soldier",
    triangles: 1726, meshBlocks: 26, nodes: 33, joints: 13,
    materials: ["accessory", "hair", "shoe", "skin", "trouser", "uniform"],
    mounts: SOLDIER_MOUNTS, joinNames: SOLDIER_JOINTS,
    span: [0.494, 1.604, 0.3024], height: 1.60,
    draws: { high: 24, medium: 23, low: 16 },
    note: "鲁南男性平民。对襟夹袄 + 中式小立领 + 布盘扣、腰里一条布带、"
      + "裤脚扎腿带（**不是绑腿** —— 绑腿缠到膝下，扎腿带只在踝上两道）、"
      + "千层底黑布鞋、包头布。**身上没有任何军用装具**，头上那块布也**不是白的**"
      + "（白毛巾是敢死队的标志，见 Script_Actor 的 towelHead）。",
  },
  CivilianFemale: {
    file: "CivilianFemale.tzm.json", category: "soldier",
    triangles: 1536, meshBlocks: 24, nodes: 31, joints: 13,
    materials: ["accessory", "hair", "shoe", "skin", "trouser", "uniform"],
    mounts: SOLDIER_MOUNTS, joinNames: SOLDIER_JOINTS,
    span: [0.4853, 1.6029, 0.2762], height: 1.60,
    draws: { high: 23, medium: 22, low: 16 },
    note: "鲁南女性平民。大襟褂（衣襟从领口斜扣到左腋下 —— 这条斜线是三十米外"
      + "唯一读得出的女装标志）、肥裤扎脚、包头巾 + 颈后裹着的纂儿、千层底布鞋。"
      + "**不扎腰带**（那是男装），**身上没有任何军用装具。**",
  },

  ZhongZheng: {
    file: "ZhongZheng.tzm.json", category: "weapon",
    triangles: 6703, meshBlocks: 2, nodes: 7, joints: 0,
    materials: ["steel", "wood"], mounts: WEAPON_MOUNTS,
    span: [0.05556, 0.16470, 1.11000], lengthM: 1.110,
    draws: { high: 2, medium: 2, low: 2 },
    note: "中正式。完整几何来自 Poly Haven CC0 Bolt Action Rifle 7.62；"
      + "剔除现代瞄准镜、包布和独立子弹，仅保留老式栓动枪轮廓，"
      + "全程不减面，并按中正式史实全长 1.110 m 导入。",
  },
  HanYang: {
    file: "HanYang.tzm.json", category: "weapon",
    triangles: 2672, meshBlocks: 2, nodes: 7, joints: 0,
    materials: ["steel", "wood"], mounts: WEAPON_MOUNTS,
    span: [0.08117, 0.19311, 1.24977], lengthM: 1.250,
    note: "汉阳造。几何来自 CC-BY Gewehr 88（Sketchfab / TastyTony）—— 汉阳八八式"
      + "的母型就是 Gewehr 88：整长套筒、曼利夏漏夹弹仓与露出式通条都是模型自带的，"
      + "不再用 Kar98k 拉长加假套筒。",
    draws: { high: 2, medium: 2, low: 2 },
  },
  Zb26: {
    file: "Zb26.tzm.json", category: "weapon",
    triangles: 7781, meshBlocks: 2, nodes: 7, joints: 0,
    materials: ["steel", "wood"], mounts: WEAPON_MOUNTS,
    span: [0.07999, 0.32660, 1.16500], lengthM: 1.165,
    draws: { high: 2, medium: 2, low: 2 },
    note: "ZB-26 轻机枪。几何来自 Larkien 的 Sketchfab CC-BY-4.0 模型；"
      + "保留上插直弹匣、提把、两脚架、木托与木握把，按史实全长 1.165 m 重建。",
  },
  Type38: {
    file: "Type38.tzm.json", category: "weapon",
    // meshBlocks 4 / nodes 8：三八式在某一轮换模后多了一个 adsNear 挂点，
    // 木/钢两桶也各裂成两块，而这张表当时没跟着改 —— Verify 第一关一直报红。
    // WP-E1 照 Model/Index.json 补正（数字来自构建期实测，不是猜的）。
    triangles: 12467, meshBlocks: 4, nodes: 8, joints: 0,
    materials: ["steel", "wood"], mounts: WEAPON_MOUNTS,
    span: [0.09814, 0.19673, 1.27529], lengthM: 1.276,
    draws: { high: 2, medium: 2, low: 2 },
    note: "三八式。几何来自 CC-BY Type 38 Arisaka rifle（Sketchfab / Snijboer）："
      + "机匣上方的防尘滑盖、近乎水平的直拉机柄、护翼准星、两道箍与通条齐备。",
  },
  ServicePistol: {
    file: "ServicePistol.tzm.json", category: "weapon",
    triangles: 7263, meshBlocks: 2, nodes: 7, joints: 0,
    materials: ["steel", "wood"], mounts: WEAPON_MOUNTS,
    span: [0.03180, 0.12953, 0.22200], lengthM: 0.222,
    draws: { high: 2, medium: 2, low: 2 },
    note: "外购九毫米军用手枪。几何来自 Poly Haven CC0 Service Pistol；"
      + "使用闭锁状态 A，移除展示用弹匣、子弹和空仓挂机状态 B，"
      + "按原 PBR 金属度分出木握把并修正源模型的上下/枪口方向。",
  },
  Grenade: {
    file: "Grenade.tzm.json", category: "weapon",
    triangles: 168, meshBlocks: 2, nodes: 4, joints: 0,
    materials: ["steel", "wood"], mounts: ["muzzle", "gripR"],
    span: [0.0580, 0.0554, 0.2250], lengthM: 0.220,
    draws: { high: 2, medium: 2, low: 2 },
    note: "木柄手榴弹。弹体 φ58×92、木柄 φ29×125。第 31 师一役用掉三十万余枚。",
  },
  Dadao: {
    file: "Dadao.tzm.json", category: "weapon",
    triangles: 4199, meshBlocks: 1, nodes: 5, joints: 0,
    materials: ["dadao"], mounts: ["muzzle", "gripR", "gripL"],
    span: [0.0232, 0.1106, 0.8988], lengthM: 0.900, bladeM: 0.625,
    draws: { high: 1, medium: 1, low: 1 },
    note: "二十九军战刀式样（CGMOL 付费源，见 _import/Data_SourceLicenses.md）。"
      + "刀身 55→88 mm、刃线外鼓上翘、刀背 5.7 mm 厚，圆盘卡扣 + 缠柄 + 柄尾大铁环。"
      + "保留原 UV、逐角法线与压缩后的专用 PBR，不再套用枪械共享钢/木材质。",
  },

  // --- 刺刀（独立模型，socket 挂点扣到枪口；见 _blender/ImportBayonets.py）----
  BayonetZhongZheng: {
    file: "BayonetZhongZheng.tzm.json", category: "weapon",
    triangles: 14730, meshBlocks: 2, nodes: 4, joints: 0,
    materials: ["steel", "wood"], mounts: ["socket", "tip"],
    span: [0.02899, 0.05034, 0.572], lengthM: 0.572, bladeM: 0.428,
    draws: { high: 2, medium: 2, low: 2 },
    note: "HY1935 刺刀（中正式）。CC-BY Seitengewehr 84/98 底模（Sketchfab / "
      + "PL_historyfan_K），程序化补枪口环与木柄片，刃拉长到史实 428 mm。",
  },
  BayonetHanYang: {
    file: "BayonetHanYang.tzm.json", category: "weapon",
    triangles: 14666, meshBlocks: 2, nodes: 4, joints: 0,
    materials: ["steel", "wood"], mounts: ["socket", "tip"],
    span: [0.02647, 0.04787, 0.517], lengthM: 0.517, bladeM: 0.395,
    draws: { high: 2, medium: 2, low: 2 },
    note: "汉阳造配刀（八八式系）。与 HY1935 同一 CC-BY 底模，刃 395 mm。",
  },
  BayonetType38: {
    file: "BayonetType38.tzm.json", category: "weapon",
    triangles: 265, meshBlocks: 1, nodes: 4, joints: 0,
    materials: ["steel"], mounts: ["socket", "tip"],
    span: [0.01029, 0.05253, 0.514], lengthM: 0.514, bladeM: 0.400,
    draws: { high: 1, medium: 1, low: 1 },
    note: "三十年式刺刀（三八式）。CC-BY Ps1 Arisaka T30 Bayonet（Sketchfab / "
      + "Swordmanck）：钩形护手与枪口环自带；丢掉刀鞘与腰带。全钢（后期批次样式），"
      + "PSX 漫反射整体偏棕，色分桶会误判成木，见 ImportBayonets 注释。",
  },

  Type89Launcher: {
    file: "Type89Launcher.tzm.json", category: "weapon",
    triangles: 318, meshBlocks: 2, nodes: 7, joints: 0,
    materials: ["steel", "wood"], mounts: WEAPON_MOUNTS,
    span: [0.098, 0.0932, 0.413], lengthM: 0.413,
    draws: { high: 2, medium: 2, low: 2 },
    note: "八九式重掷弹筒。筒身 + 粗牙螺杆 + **弧形驻钣**，侧面一块击发机构。"
      + "**没有两脚架** —— 加了脚架就成了迫击炮。约 45° 手持抵地发射。",
  },
  Type11: {
    file: "Type11.tzm.json", category: "weapon",
    triangles: 8252, meshBlocks: 5, nodes: 7, joints: 0,
    materials: ["lqType11AmmoBox", "lqType11Body", "lqType11BodyAlt", "lqType11Fore", "lqWeaponPlain"],
    mounts: WEAPON_MOUNTS,
    span: [0.24071, 0.25577, 1.10027], lengthM: 1.100,
    draws: { high: 5, medium: 5, low: 5 },
    note: "卢沟桥资源包源节点 QEDQD：十一年式轻机枪。保留 body/body2/fore/ammobox"
      + "四张 DDS 的原 UV 与独立材质槽；项目原 CC-BY 模型仍保留作对比参考。",
  },
  BrowningTripodAssembly: {
    file: "BrowningTripodAssembly.tzm.json", category: "weapon", triangles: 9003, meshBlocks: 1, nodes: 7, joints: 0,
    materials: ["lqBrowningTripod"], mounts: WEAPON_MOUNTS, span: [0.73547, 1.43177, 2.27293], lengthM: 2.273,
    draws: { high: 1, medium: 1, low: 1 }, note: "源节点 BROTRIPO009；仅能确认勃朗宁式三脚架/机件组合，具体型号未明。",
  },
  UnidentifiedMunition: {
    file: "UnidentifiedMunition.tzm.json", category: "weapon", triangles: 128, meshBlocks: 1, nodes: 7, joints: 0,
    materials: ["lqUnidentifiedMunition"], mounts: WEAPON_MOUNTS, span: [0.06568, 0.06906, 0.253], lengthM: 0.253,
    draws: { high: 1, medium: 1, low: 1 }, note: "源节点 Cylinder026；弹体型号未明，识别截图随源归档。",
  },
  OfficerSwordSet: {
    file: "OfficerSwordSet.tzm.json", category: "weapon", triangles: 7801, meshBlocks: 2, nodes: 5, joints: 0,
    materials: ["lqOfficerSword", "lqWeaponPlain"], mounts: ["muzzle", "gripR", "gripL"], span: [0.05975, 0.07192, 1.00151], lengthM: 1.000,
    draws: { high: 2, medium: 2, low: 2 }, note: "源节点 Group146；仅刀柄饰带使用 stripe01L，刀身与刀鞘改回枪钢材质，具体制式未明。",
  },
  RingPommelDagger: {
    file: "RingPommelDagger.tzm.json", category: "weapon", triangles: 515, meshBlocks: 1, nodes: 5, joints: 0,
    materials: ["lqRingPommelDagger"], mounts: ["muzzle", "gripR", "gripL"], span: [0.05430, 0.06812, 0.450], lengthM: 0.450,
    draws: { high: 1, medium: 1, low: 1 }, note: "源节点 Mesh_0300；带环首短刃，具体制式未明。",
  },
  MediumMortar: {
    file: "MediumMortar.tzm.json", category: "weapon", triangles: 9064, meshBlocks: 1, nodes: 7, joints: 0,
    materials: ["lqMediumMortar"], mounts: WEAPON_MOUNTS, span: [0.79565, 1.20429, 1.44394], lengthM: 1.444,
    draws: { high: 1, medium: 1, low: 1 }, note: "源节点 sphere3；民二十年式八二迫击炮（按 Stokes-Brandt 外形认领）。",
  },
  Type92Hmg: {
    file: "Type92Hmg.tzm.json", category: "weapon",
    triangles: 20065, meshBlocks: 1, nodes: 7, joints: 0,
    materials: ["steel"], mounts: WEAPON_MOUNTS,
    span: [0.53558, 0.55684, 1.156], lengthM: 1.156,
    draws: { high: 1, medium: 1, low: 1 },
    note: "九二式重机枪。CadNav 免费 Maya ASCII 源完整保留枪体、冷却套、瞄具与三脚架；"
      + "只排除两块空白展示方块，未减面。",
  },
  Type89Tank: {
    file: "Type89Tank.tzm.json", category: "vehicle",
    triangles: 4089, meshBlocks: 4, nodes: 8, joints: 1,
    materials: ["type89Armor", "type89Barrel", "type89Track"], mounts: VEHICLE_MOUNTS_TANK,
    span: [2.15, 2.56, 4.3],
    draws: { high: 4, medium: 4, low: 4 },   // source atlas; separate barrel retained for facing audit
    note: "八九式中战车（甲）。几何来自 CC-BY Type 89 I-Go (Chi-Ro)（Sketchfab / snrnsrk5）："
      + "炮塔偏前、塔后机枪与车体右前机枪球座、前起动轮抬高都是模型自带的。"
      + "保留源 UV、逐角法线与原作者装甲/履带贴图；既有外廓和 4,089 三角保持不变。"
      + "装甲 6—17 mm，巷宽 < 2.5 m 进不来。炮塔是关节（turret），将来接载具系统直接转它。",
  },
  Type95HaGo: {
    file: "Type95HaGo.tzm.json", category: "vehicle",
    triangles: 82142, meshBlocks: 1, nodes: 8, joints: 1,
    materials: ["armor"], mounts: VEHICLE_MOUNTS_TANK,
    span: [2.07, 2.27, 4.38],
    draws: { high: 1, medium: 1, low: 1 },
    note: "九五式轻战车 Ha-Go。CC-BY 高模（Sketchfab / Jesper Landin）原始 82,142 三角；"
      + "80,000 阈值只会减少 2.6%，按 5% 免减面规则保留原始拓扑。车体仍为单一 armor 网格，标准挂点与炮塔关节齐备。"
      + "源件车头在 Blender 导入后的 -Y，ImportVehicles 按 sourceNose 翻正（2026-09-05 前炮口朝后）。",
    // 单体网格没有炮管桶可探，朝向证据改用车体轮廓：驾驶员/机枪隆起在前（z≈-1.6 处
    // 车体顶高 1.89 m），发动机舱盖在后（z≈+1.6 处 1.34 m）。ModelFacingTest 按这条复量。
    facing: { probeZ: 1.6, frontHigherByM: 0.3 },
  },
  Type97ChiHa: {
    file: "Type97ChiHa.tzm.json", category: "vehicle",
    triangles: 3968, meshBlocks: 4, nodes: 8, joints: 1,
    materials: ["armor", "steel", "track"], mounts: VEHICLE_MOUNTS_TANK,
    span: [2.475, 2.38, 5.5],
    draws: { high: 4, medium: 4, low: 4 },
    note: "九七式中战车 Chi-Ha。CC-BY（Sketchfab / snrnsrk5）原始 3,969 三角，不焊点、不减面；"
      + "车体、履带、炮塔与炮管分桶导入，履带外廓宽度用于碰撞和巷宽判断。",
  },

  Dougong: {
    file: "Dougong.tzm.json", category: "prop",
    triangles: 176, meshBlocks: 1, nodes: 3, joints: 0,
    materials: ["WoodBeam"], mounts: ["top"],
    span: [0.642, 0.196, 0.2853],
    draws: { high: 1, medium: 1, low: 1 },
    note: "门楼斗拱（一斗三升简化）。坐斗上的十字卯口是真挖出来的（布尔）。原点在坐斗底面。",
  },
  RidgeBeast: {
    file: "RidgeBeast.tzm.json", category: "prop",
    triangles: 172, meshBlocks: 1, nodes: 3, joints: 0,
    materials: ["RoofTile"], mounts: ["ridge"],
    span: [0.144, 0.275, 0.250],
    draws: { high: 1, medium: 1, low: 1 },
    note: "屋脊兽头。民居的糙陶兽首，不是宫殿正吻。原点在脊背安装面。",
  },
  WindowLattice: {
    file: "WindowLattice.tzm.json", category: "prop",
    triangles: 284, meshBlocks: 1, nodes: 3, joints: 0,
    materials: ["WoodDoor"], mounts: ["sillCenter"],
    span: [1.100, 1.350, 0.055],
    draws: { high: 1, medium: 1, low: 1 },
    note: "格子窗棂 1.10 × 1.35 m，竖 4 横 5 的疏格。原点在窗台中点。",
  },
  DoorPier: {
    file: "DoorPier.tzm.json", category: "prop",
    triangles: 248, meshBlocks: 1, nodes: 3, joints: 0,
    materials: ["Stone"], mounts: ["doorSide"],
    span: [0.360, 0.630, 0.480],
    draws: { high: 1, medium: 1, low: 1 },
    note: "门墩石（抱鼓石）。方座 + 横轴鼓面 + 六颗鼓钉。原点在地面。",
  },

  // ——— 场景饰件（WP-E1）：由 Script_TrimProps.mjs 摆进战斗关卡 ———
  // 这一族与上面四件同为 category=prop（同一条 ≤400 三角预算），区别只在用法：
  // 门楼四件是给 Script_World 复用的建筑构件，这五件是**成列摆的场景饰件**，
  // 落点写死在 Script_TrimProps.TRIM_PLACEMENTS 里。
  // 材质名受两头夹：既要在 _blender/TzmCore.MATERIAL_NAMES 白名单里，又要
  // ResolveTengxianMaterial 认得。交集只有 Stone / WoodBeam / WoodDoor / RoofTile /
  // armor / track，所以铁活一律借 track（哑光暗灰熟铁）、漆钢借 armor。
  SemaphoreSignal: {
    file: "SemaphoreSignal.tzm.json", category: "prop",
    triangles: 244, meshBlocks: 3, nodes: 3, joints: 0,
    materials: ["Stone", "WoodDoor", "armor"], mounts: ["foot"],
    span: [1.36, 5.16, 0.46],
    draws: { high: 3, medium: 3, low: 3 },
    note: "津浦路臂板信号机（下臂式）。混凝土基墩 + 5.2 m 收分方杆 + 七级梯挂 + "
      + "木臂板 + 配重杆与拉杆。原点在基墩底面（＝地面）。臂板固定在「进站」位，"
      + "不做转动 —— 饰件层没有逐帧驱动。",
  },
  StationLamp: {
    file: "StationLamp.tzm.json", category: "prop",
    triangles: 142, meshBlocks: 3, nodes: 3, joints: 0,
    materials: ["RoofTile", "Stone", "armor"], mounts: ["foot"],
    span: [0.6, 3.2, 0.57324],
    draws: { high: 3, medium: 3, low: 3 },
    note: "站台灯 3.2 m。铸铁灯柱 + 10 段搪瓷灯罩 + 磨砂灯泡。原点在柱底（＝站台面）。"
      + "**不带光源** —— 一盏灯一个 light 就是一遍 shadow pass，六盏就没了。",
  },
  ChurchTracery: {
    file: "ChurchTracery.tzm.json", category: "prop",
    triangles: 192, meshBlocks: 1, nodes: 3, joints: 0,
    materials: ["Stone"], mounts: ["sillCenter"],
    span: [1.21, 3.07429, 0.07],
    draws: { high: 1, medium: 1, low: 1 },
    note: "天主堂尖券窗花。净宽 1.50 / 窗高 2.60 / 券高 0.89，对着 "
      + "Script_Landmark_ChurchSchool 城内那座（檐口 7.42 m）的窗洞算死；"
      + "别的尺寸靠 TRIM_PLACEMENTS 的 scale 缩。券头圆窗心是真旋转体，不是多边形拼的。"
      + "原点在窗台中点，厚度对称于墙心。",
  },
  CellDoorIron: {
    file: "CellDoorIron.tzm.json", category: "prop",
    triangles: 204, meshBlocks: 1, nodes: 3, joints: 0,
    materials: ["track"], mounts: ["doorFace"],
    span: [0.9225, 1.52, 0.0825],
    draws: { high: 1, medium: 1, low: 1 },
    note: "牢门五金。两道包铁（y=0.26 / 1.62）+ 合页轴 + 竖铁 + 锁盒 + 锁鼻 + 挂锁 + "
      + "四颗门钉，按 CELL.doorW=1.0 / doorH=1.95 配。**刻意避开** A1 程序化门板上"
      + "已有的两道箍（y=0.55 / 1.41）——这件是补全那副五金，不是盖住它。"
      + "原点在门板外表面、门扇底边中点，几何全部 z ≥ 0（朝门外）。",
  },
  CrossingSign: {
    file: "CrossingSign.tzm.json", category: "prop",
    triangles: 68, meshBlocks: 2, nodes: 3, joints: 0,
    materials: ["Stone", "WoodDoor"], mounts: ["foot"],
    span: [1.0748, 2.5574, 0.34],
    draws: { high: 2, medium: 2, low: 2 },
    note: "铁路道口斜十字标。木杆 + 白灰斜十字牌 + 一块空警示牌（**不刻字**："
      + "1938 年三月津浦路道口标的字样无资料，同 B1 的站牌口径）。原点在石基底面。",
  },
};

/** 取一个模型的 url。id 不认识时返回 null（调用方退回程序化几何）。 */
export function MeshUrl(id) {
  const entry = MESHES[id];
  return entry ? `${MODEL_BASE}${entry.file}?v=${MESH_REV}` : null;
}

/** 按类别列 id。 */
export function MeshIds(category = null) {
  return Object.keys(MESHES).filter((id) => !category || MESHES[id].category === category);
}

/** 全部模型的 url，给 PreloadModels 用。 */
export function AllMeshUrls() {
  return MeshIds().map((id) => `${MODEL_BASE}${MESHES[id].file}?v=${MESH_REV}`);
}

/** 武器 id → Data_Weapons.mjs 的武器 id。两边同名，这层只是把约定写死。 */
export const WEAPON_MESH_BY_ID = {
  ZhongZheng: "ZhongZheng", HanYang: "HanYang", Zb26: "Zb26", Type38: "Type38",
  ServicePistol: "ServicePistol", Type11: "Type11", Type92Hmg: "Type92Hmg",
  Grenade: "Grenade", GrenadeBundle: "Grenade", Dadao: "Dadao",
  // 掷弹筒走武器规范系（右手握点 = 原点、筒口朝 -Z），人物能直接拿着它；
  // 三辆车走车辆规范系，只有台架/摆场景用得上，人物拿不了
  Type89Launcher: "Type89Launcher",
  BrowningTripodAssembly: "BrowningTripodAssembly", UnidentifiedMunition: "UnidentifiedMunition",
  OfficerSwordSet: "OfficerSwordSet", RingPommelDagger: "RingPommelDagger",
  MediumMortar: "MediumMortar",
  Type89Tank: "Type89Tank", Type95HaGo: "Type95HaGo", Type97ChiHa: "Type97ChiHa",
};

/** 保留通用变体接口；大刀统一使用带铁环、缠柄的二十九军战刀。 */
export const WEAPON_MESH_VARIANTS = {};

/** 越界或已退役的变体编号回到该武器的默认模型，兼容旧掉落和编辑器数据。 */
export function WeaponMeshId(weaponId, variant = 0) {
  const list = WEAPON_MESH_VARIANTS[weaponId];
  if (list && variant > 0 && variant < list.length) return list[variant];
  return WEAPON_MESH_BY_ID[weaponId];
}

/**
 * 可装刺刀的枪 → 刺刀模型 id。运行时把刺刀模型的 socket 挂点（枪口环中心）
 * 对到枪的 muzzle 挂点上：环套枪口、刃沿枪管前伸、柄贴刺刀座。
 * 哪些枪能上刺刀由 Data_Weapons 的 bayonet: true 说了算，这里只管配哪把刀。
 */
export const BAYONET_MESH_BY_WEAPON = {
  ZhongZheng: "BayonetZhongZheng",
  HanYang: "BayonetHanYang",
  Type38: "BayonetType38",
};

/** 人物 kind（Script_Actor 的 KIND_SPEC 键）→ 模型 id。 */
export const SOLDIER_MESH_BY_KIND = {
  nra: "SoldierNra", nraDare: "SoldierNra", nraOfficer: "SoldierNra",
  ija: "SoldierIja", ijaOfficer: "SoldierIja",
  civilian: "CivilianMale",
};

/**
 * 同一个 kind 底下的模型分身。目前只有百姓分男女 —— 分身名由 Script_Actor
 * 按 seed 抽（KIND_SPEC.civilian.variants），抽不到就退回 SOLDIER_MESH_BY_KIND。
 * 分身**不是新 kind**：AI、伤害、误伤判定全都只认 "civilian" 这一个 kind。
 */
export const ACTOR_MESH_BY_VARIANT = {
  civilian: { male: "CivilianMale", female: "CivilianFemale" },
};
