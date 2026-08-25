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
const MESH_REV = "12";

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
 * 车辆的挂点。**车辆规范系与武器不同**：原点在地面、车体中心，车头朝 -Z
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
  medium: { accentA: "uniform", accentB: "uniform" },
  low: {
    accentA: "uniform", accentB: "uniform", accessory: "uniform",
    shoe: "uniform", leather: "uniform", red: "uniform", towel: "uniform",
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

  ZhongZheng: {
    file: "ZhongZheng.tzm.json", category: "weapon",
    triangles: 5633, meshBlocks: 2, nodes: 7, joints: 0,
    materials: ["steel", "wood"], mounts: WEAPON_MOUNTS,
    span: [0.05570, 0.17549, 1.11133], lengthM: 1.110,
    draws: { high: 2, medium: 2, low: 2 },
    note: "中正式。几何来自 Poly Haven CC0 Bolt Action Rifle 7.62；"
      + "剔除现代瞄准镜、包布和独立子弹，仅保留老式栓动枪轮廓，"
      + "并按中正式史实全长 1.110 m 重建。",
  },
  HanYang: {
    file: "HanYang.tzm.json", category: "weapon",
    triangles: 4686, meshBlocks: 2, nodes: 7, joints: 0,
    materials: ["steel", "wood"], mounts: WEAPON_MOUNTS,
    span: [0.08052, 0.19313, 1.24976], lengthM: 1.250,
    note: "汉阳造。几何来自 CC-BY Gewehr 88（Sketchfab / TastyTony）—— 汉阳八八式"
      + "的母型就是 Gewehr 88：整长套筒、曼利夏漏夹弹仓与露出式通条都是模型自带的，"
      + "不再用 Kar98k 拉长加假套筒。",
    draws: { high: 2, medium: 2, low: 2 },
  },
  Zb26: {
    file: "Zb26.tzm.json", category: "weapon",
    triangles: 884, meshBlocks: 2, nodes: 7, joints: 0,
    materials: ["steel", "wood"], mounts: WEAPON_MOUNTS,
    span: [0.17050, 0.37276, 1.16500], lengthM: 1.165,
    draws: { high: 2, medium: 2, low: 2 },
    note: "ZB-26 轻机枪。**弹匣从上方插**（直的，不是布伦那种弯的）、枪管上提把、"
      + "前段两脚架张开、带散热环的枪管。",
  },
  Type38: {
    file: "Type38.tzm.json", category: "weapon",
    // meshBlocks 4 / nodes 8：三八式在某一轮换模后多了一个 adsNear 挂点，
    // 木/钢两桶也各裂成两块，而这张表当时没跟着改 —— Verify 第一关一直报红。
    // WP-E1 照 Model/Index.json 补正（数字来自构建期实测，不是猜的）。
    triangles: 4690, meshBlocks: 4, nodes: 8, joints: 0,
    materials: ["steel", "wood"], mounts: WEAPON_MOUNTS,
    span: [0.09814, 0.19667, 1.27562], lengthM: 1.276,
    draws: { high: 2, medium: 2, low: 2 },
    note: "三八式。几何来自 CC-BY Type 38 Arisaka rifle（Sketchfab / Snijboer）："
      + "机匣上方的防尘滑盖、近乎水平的直拉机柄、护翼准星、两道箍与通条齐备。",
  },
  Mauser96: {
    file: "Mauser96.tzm.json", category: "weapon",
    triangles: 3768, meshBlocks: 2, nodes: 7, joints: 0,
    materials: ["steel", "wood"], mounts: WEAPON_MOUNTS,
    span: [0.04618, 0.16422, 0.28827], lengthM: 0.288,
    draws: { high: 2, medium: 2, low: 2 },
    note: "驳壳枪（毛瑟 C96）。几何来自 CC0 Mauser C96（itch.io / Plewr）。"
      + "扫帚柄握把 + 扳机前方的固定弹仓。",
  },
  ServicePistol: {
    file: "ServicePistol.tzm.json", category: "weapon",
    triangles: 5728, meshBlocks: 1, nodes: 7, joints: 0,
    materials: ["steel"], mounts: WEAPON_MOUNTS,
    span: [0.04308, 0.12836, 0.23743], lengthM: 0.222,
    draws: { high: 1, medium: 1, low: 1 },
    note: "外购九毫米军用手枪。几何来自 Poly Haven CC0 Service Pistol；"
      + "使用闭锁状态 A，移除展示用弹匣、子弹和空仓挂机状态 B。",
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
    triangles: 4688, meshBlocks: 2, nodes: 5, joints: 0,
    materials: ["steel", "wood"], mounts: ["muzzle", "gripR", "gripL"],
    span: [0.0232, 0.1106, 0.8988], lengthM: 0.900, bladeM: 0.625,
    draws: { high: 2, medium: 2, low: 2 },
    note: "二十九军战刀式样（CGMOL 付费源，见 _import/Data_SourceLicenses.md）。"
      + "刀身 55→88 mm、刃线外鼓上翘、刀背 5.7 mm 厚，圆盘卡扣 + 缠柄 + 柄尾大铁环。"
      + "换掉了原来那把 40→67 mm 的程序化刀 —— 旧刀没护手没铁环，剪影读起来是把菜刀。",
  },
  DadaoAlt: {
    file: "DadaoAlt.tzm.json", category: "weapon",
    triangles: 2797, meshBlocks: 2, nodes: 5, joints: 0,
    materials: ["steel", "wood"], mounts: ["muzzle", "gripR", "gripL"],
    span: [0.0574, 0.1575, 0.8982], lengthM: 0.900, bladeM: 0.624,
    draws: { high: 2, medium: 2, low: 2 },
    note: "大刀的第二种式样（CC-BY Sketchfab / Trector）。**只是外观变体**，"
      + "数值仍读 Data_Weapons.Dadao：大刀是各地铁匠各打各的，一个班人手一把"
      + "一模一样的刀反倒不像 1938。圆盘吞口、束节木柄、刃线较直的一路。",
  },

  // --- 刺刀（独立模型，socket 挂点扣到枪口；见 _blender/ImportBayonets.py）----
  BayonetZhongZheng: {
    file: "BayonetZhongZheng.tzm.json", category: "weapon",
    triangles: 2218, meshBlocks: 2, nodes: 4, joints: 0,
    materials: ["steel", "wood"], mounts: ["socket", "tip"],
    span: [0.03289, 0.05997, 0.57153], lengthM: 0.572, bladeM: 0.428,
    draws: { high: 2, medium: 2, low: 2 },
    note: "HY1935 刺刀（中正式）。CC-BY Seitengewehr 84/98 底模（Sketchfab / "
      + "PL_historyfan_K），程序化补枪口环与木柄片，刃拉长到史实 428 mm。",
  },
  BayonetHanYang: {
    file: "BayonetHanYang.tzm.json", category: "weapon",
    triangles: 2198, meshBlocks: 2, nodes: 4, joints: 0,
    materials: ["steel", "wood"], mounts: ["socket", "tip"],
    span: [0.02956, 0.0596, 0.51643], lengthM: 0.517, bladeM: 0.395,
    draws: { high: 2, medium: 2, low: 2 },
    note: "汉阳造配刀（八八式系）。与 HY1935 同一 CC-BY 底模，刃 395 mm。",
  },
  BayonetType38: {
    file: "BayonetType38.tzm.json", category: "weapon",
    triangles: 1344, meshBlocks: 1, nodes: 4, joints: 0,
    materials: ["steel"], mounts: ["socket", "tip"],
    span: [0.01029, 0.05254, 0.514], lengthM: 0.514, bladeM: 0.400,
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
  Type89Tank: {
    file: "Type89Tank.tzm.json", category: "vehicle",
    triangles: 1239, meshBlocks: 4, nodes: 8, joints: 1,
    materials: ["armor", "steel", "track"], mounts: VEHICLE_MOUNTS_TANK,
    span: [2.18538, 2.56785, 4.26924],
    draws: { high: 4, medium: 4, low: 4 },   // body 两桶（armor/track）+ turret 两桶（armor/steel）
    note: "八九式中战车（甲）。几何来自 CC-BY Type 89 I-Go (Chi-Ro)（Sketchfab / snrnsrk5）："
      + "炮塔偏前、塔后机枪与车体右前机枪球座、前起动轮抬高都是模型自带的。"
      + "尺寸按史实 2.15 × 2.56 × 4.30 m 归一（2.19/2.57/4.27 为换模减面后实测）。"
      + "装甲 6—17 mm，巷宽 < 2.5 m 进不来。炮塔是关节（turret），将来接载具系统直接转它。",
  },
  Type94Tankette: {
    file: "Type94Tankette.tzm.json", category: "vehicle",
    triangles: 976, meshBlocks: 5, nodes: 6, joints: 1,
    materials: ["armor", "steel", "track"], mounts: VEHICLE_MOUNTS_TANKETTE,
    span: [1.592, 1.5725, 3.1002],
    draws: { high: 5, medium: 5, low: 5 },   // 车辆没有 accent 桶，低模无处可并
    note: "九四式轻装甲车（豆战车）。一挺机枪、四只负重轮、**车尾牵引钩** —— "
      + "它本来是拉弹药拖车的，被拉到前线当装甲车用。",
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
  Mauser96: "Mauser96", ServicePistol: "ServicePistol",
  Grenade: "Grenade", GrenadeBundle: "Grenade", Dadao: "Dadao",
  // 掷弹筒走武器规范系（右手握点 = 原点、筒口朝 -Z），人物能直接拿着它；
  // 两辆车走车辆规范系，只有台架/摆场景用得上，人物拿不了
  Type89Launcher: "Type89Launcher",
  Type89Tank: "Type89Tank", Type94Tankette: "Type94Tankette",
};

/**
 * 武器 id → 可换用的外观变体模型（**只换模型，不换任何数值**）。
 *
 * 只有大刀有：它不是兵工厂的制式货，是各县铁匠照各自习惯打的，一个班里
 * 人手一把一模一样的刀反倒露馅。AI 士兵按自己的 seed 稳定抽一把；
 * 玩家手里的第一人称永远走 `WEAPON_MESH_BY_ID`（也就是数组第 0 项），
 * 免得同一场战斗里自己的刀会变。
 *
 * 第 0 项必须与 `WEAPON_MESH_BY_ID` 一致。
 */
export const WEAPON_MESH_VARIANTS = {
  Dadao: ["Dadao", "DadaoAlt"],
};

/**
 * 武器 id + 变体序号 → 模型 id。没登记变体、或者序号越界，都退回主模型。
 *
 * 变体的模型文件缺席（比如构建机上没有大刀第二式样的源）也不会白屏：
 * `Script_Actor._ModelWeaponGeometry` 里 `meshDocs.has(id)` 落空就退回程序化几何。
 */
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
};
