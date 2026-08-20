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
    triangles: 1764, meshBlocks: 21, nodes: 29, joints: 13,
    materials: ["accentA", "accentB", "accessory", "shoe", "skin", "uniform"],
    mounts: SOLDIER_MOUNTS, joinNames: SOLDIER_JOINTS,
    span: [0.5187, 1.6747, 0.3215], height: 1.66,
    draws: { high: 19, medium: 17, low: 16 },
    note: "第 2 集团军第 31 师步兵。布军帽 + 青天白日帽徽、灰蓝土布军装、"
      + "斜挎布子弹带（只有靠身三格鼓着）、缠出层叠的绑腿、草鞋或布鞋。**无钢盔。**",
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
    triangles: 612, meshBlocks: 2, nodes: 7, joints: 0,
    materials: ["steel", "wood"], mounts: WEAPON_MOUNTS,
    span: [0.0899, 0.1280, 1.1100], lengthM: 1.110,
    draws: { high: 2, medium: 2, low: 2 },
    note: "中正式。分段枪托 + 上护木 + 立框表尺 + 刺刀座。",
  },
  HanYang: {
    file: "HanYang.tzm.json", category: "weapon",
    triangles: 608, meshBlocks: 2, nodes: 7, joints: 0,
    materials: ["steel", "wood"], mounts: WEAPON_MOUNTS,
    span: [0.0880, 0.1236, 1.2500], lengthM: 1.250,
    note: "汉阳造。**枪管外那层 φ32 薄套筒**是它的剪影特征 —— 没有它就跟中正式分不开，"
      + "而这两把枪在第 31 师是混装的。",
    draws: { high: 2, medium: 2, low: 2 },
  },
  Zb26: {
    file: "Zb26.tzm.json", category: "weapon",
    triangles: 572, meshBlocks: 2, nodes: 7, joints: 0,
    materials: ["steel", "wood"], mounts: WEAPON_MOUNTS,
    span: [0.1705, 0.3728, 1.1650], lengthM: 1.165,
    draws: { high: 2, medium: 2, low: 2 },
    note: "ZB-26 轻机枪。**弹匣从上方插**（直的，不是布伦那种弯的）、枪管上提把、"
      + "前段两脚架张开、带散热环的枪管。",
  },
  Type38: {
    file: "Type38.tzm.json", category: "weapon",
    triangles: 680, meshBlocks: 2, nodes: 7, joints: 0,
    materials: ["steel", "wood"], mounts: WEAPON_MOUNTS,
    span: [0.0954, 0.1211, 1.2760], lengthM: 1.276,
    draws: { high: 2, medium: 2, low: 2 },
    note: "三八式。**机匣上方的防尘滑盖**是独门标志；拉机柄近乎水平、球头小。",
  },
  Mauser96: {
    file: "Mauser96.tzm.json", category: "weapon",
    triangles: 424, meshBlocks: 2, nodes: 7, joints: 0,
    materials: ["steel", "wood"], mounts: WEAPON_MOUNTS,
    span: [0.0380, 0.1578, 0.2815], lengthM: 0.288,
    draws: { high: 2, medium: 2, low: 2 },
    note: "驳壳枪（毛瑟 C96）。扫帚柄握把 + 扳机**前方**的固定弹仓。",
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
    triangles: 308, meshBlocks: 3, nodes: 5, joints: 0,
    materials: ["accessory", "red", "steel"], mounts: ["muzzle", "gripR", "gripL"],
    span: [0.0420, 0.0530, 0.8960], lengthM: 0.900, bladeM: 0.595,
    draws: { high: 3, medium: 3, low: 2 },
    note: "大刀。**柄尾有真的铁环**、护手是一小片横铁不是圆盘、刀身宽 57→38 mm 背厚 5—6 mm。",
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
    triangles: 1160, meshBlocks: 5, nodes: 8, joints: 1,
    materials: ["armor", "steel", "track"], mounts: VEHICLE_MOUNTS_TANK,
    span: [2.14, 2.54, 4.2657],
    draws: { high: 5, medium: 5, low: 5 },   // 车辆没有 accent 桶，低模无处可并
    note: "八九式中战车（甲）。**前起动轮抬高、履带前段上翘**是它的剪影线；"
      + "炮塔偏车体前部，塔后另有一挺机枪。装甲 6—17 mm，巷宽 < 2.5 m 进不来。"
      + "炮塔是关节（turret），将来接载具系统直接转它。",
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
};

/** 取一个模型的 url。id 不认识时返回 null（调用方退回程序化几何）。 */
export function MeshUrl(id) {
  const entry = MESHES[id];
  return entry ? MODEL_BASE + entry.file : null;
}

/** 按类别列 id。 */
export function MeshIds(category = null) {
  return Object.keys(MESHES).filter((id) => !category || MESHES[id].category === category);
}

/** 全部模型的 url，给 PreloadModels 用。 */
export function AllMeshUrls() {
  return MeshIds().map((id) => MODEL_BASE + MESHES[id].file);
}

/** 武器 id → Data_Weapons.mjs 的武器 id。两边同名，这层只是把约定写死。 */
export const WEAPON_MESH_BY_ID = {
  ZhongZheng: "ZhongZheng", HanYang: "HanYang", Zb26: "Zb26", Type38: "Type38",
  Mauser96: "Mauser96", Grenade: "Grenade", GrenadeBundle: "Grenade", Dadao: "Dadao",
  // 掷弹筒走武器规范系（右手握点 = 原点、筒口朝 -Z），人物能直接拿着它；
  // 两辆车走车辆规范系，只有台架/摆场景用得上，人物拿不了
  Type89Launcher: "Type89Launcher",
  Type89Tank: "Type89Tank", Type94Tankette: "Type94Tankette",
};

/** 人物 kind（Script_Actor 的 KIND_SPEC 键）→ 模型 id。 */
export const SOLDIER_MESH_BY_KIND = {
  nra: "SoldierNra", nraDare: "SoldierNra", nraOfficer: "SoldierNra",
  ija: "SoldierIja", ijaOfficer: "SoldierIja",
};
