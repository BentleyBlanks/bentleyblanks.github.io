// 1938 年 3 月 · 山东滕县县城 —— 白盒数据。
//
// **纯数据，不许 import three**（Node 里要能直接跑：出图脚本、导航烘焙、
// 自检都读这一份；一旦沾上 three，命令行工具就得拖起整个渲染库）。
//
// 坐标系：X 向东，Z 向南，Y 向上，单位米。原点 (0,0) = 城中心十字街口。
// 依据：docs/Data_TengxianDesign.md「滕县城白盒规格」一节，
//       与 docs/Data_TengxianCity.md 的考据全文（含出处与存疑标注）。
//
// ---------------------------------------------------------------------------
// 史实纪律（这一份文件的最高规矩）
//
//   凡史料里有的数字，照史料，不许为了关卡好玩改；
//   凡史料里没有的，一律在字段旁写「推定」，并登记进本文件末尾的 PRESUMED 表。
//   任何游戏内文本都不许把 PRESUMED 里的数说成史实。
//
// 台儿庄那一套（四米寨墙、六门、运河、浮桥、清真寺）在这里**整个作废**：
// 那是运河商镇的民防寨墙，与 11.5 m 的包砖县城墙差一个量级。
// 能沿用的只有鲁南民居的建筑构件（硬山顶、四合院、青砖灰瓦、对外不开窗、过墙石）。
// ---------------------------------------------------------------------------

/**
 * 城池主体。
 *
 * 高度这一栏是全案最贵的数：墙身 11.5 m（志载「三丈五尺」÷0.32 m/尺）。
 * 它决定了「城墙是一条高空回廊」这件事 —— 11.5 m 摔下去必死，
 * 所以上城道只有四条这条史料才有力量，也才有 L5 那一关。
 */
export const CITY = {
  // 墙身中心线到城心的距离。600×600 m 方城 = 中心线 610 见方，周长约 2.44 km。
  wallCenter: 305,
  // 志载 3 丈 5 尺 ÷ 0.32。日方战详报另记「城壁高 20 m」，那是从濠底量的印象值。
  wallHeight: 11.5,
  // 成化八年增建女墙垛口（存在为史料，高度推定 1.6 m）。视觉总高 13.1 m。
  parapetHeight: 1.6,
  // 志载 1 丈 5 尺（4.8 m）与日方实测 5 m 双源吻合：可跑人、可架轻机枪，
  // 不足以并排跑车 —— 这一条直接决定城墙上的战斗是「一列纵队」而不是「散兵线」。
  wallTopWidth: 5.0,
  // 推定：按 1:6 收分自 11.5 m 反推应为 ~13.8 m，但图纸给死了 10.0 m。
  // 两个数不自洽时取图纸给死的两端宽度（顶 5 / 底 10），实际收分为 1:4.6。
  wallBaseWidth: 10.0,
  // 条石勒脚 1.8 m：鲁南是石灰岩产区，条石与青砖的明暗条带是滕县最强的读图信号。
  plinthHeight: 1.8,
  // 城内地坪比濠外高 1.2 m（依据「东面高起入城内」的现地描述 + 推定）。
  // 整座城是一块微微抬起的台地，不是平铺在平地上。
  //
  // 基准的取法：**城内地坪定为 y=0，濠外原野压到 y=-1.2**，而不是反过来。
  // 理由是工程的：鲁南民居那一整套构件（AddCompound / AddRoomBlock / AddWall）
  // 全部以 y=0 起砌且没有 baseY 参数，把城内抬到 +1.2 就等于让城里每一座
  // 四合院沉进地里 1.2 m。高差是同一个高差，只是把零点放在了城里。
  platformY: 0,
  outerY: -1.2,
  // 台地外沿（= 护城河内岸顶）离城心的距离：墙脚 310 + 濠内边距 8。
  platformEdge: 318,
  // 顺城街：墙内脚下留出的一圈空地，走人、堆物、开防空洞、接上城道。宽度推定。
  innerRingWidth: 14,
};

/** 墙脚（外侧）与墙顶的绝对坐标，省得到处重算。 */
export const WALL_OUTER_FOOT = CITY.wallCenter + CITY.wallBaseWidth / 2;   // 310
export const WALL_INNER_FOOT = CITY.wallCenter - CITY.wallBaseWidth / 2;   // 300
export const WALL_TOP_Y = CITY.platformY + CITY.wallHeight;                // 11.5
export const PARAPET_TOP_Y = WALL_TOP_Y + CITY.parapetHeight;              // 13.1

/**
 * 护城河。志载 3 丈 5 尺（10.5 m）与日方实测 10 m 双源吻合；
 * 深 4.5—5 m（志载 1 丈 5 尺），日方另记深 8 m，并列存疑，本作取 4.8。
 * 濠底到墙顶总落差 = 4.8 + 11.5 = 16.3 m（推定，用来解释日方「城壁高 20 m」的印象，
 * 也是日军工兵突击桥尺度不足的原因）。
 */
export const MOAT = {
  innerEdge: CITY.platformEdge,          // 318：内岸顶，标高 = platformY
  width: 10.5,
  depth: 4.8,                            // 自内岸顶往下量
  get outerEdge() { return this.innerEdge + this.width; },   // 328.5，标高 = outerY
  bankRunInner: 2.5,                     // 内岸坡水平投影（推定）
  bankRunOuter: 2.1,                     // 外岸坡水平投影（推定）
  get bottomY() { return CITY.platformY - this.depth; },     // -4.8
  waterY: -1.6,                          // 水面：此高度处水面宽约 9.4 m，合志载 8—9 m
  // 濠岸栽柳（史料）。三月柳条无叶，深褐红枝条。间距推定。
  willowSpacing: 58,
};

/**
 * 四座城门。按城防示意图在四边形成错位的门位，每座内外二门 + **半圆形**瓮城
 * （半圆是滕县的特征点，志载「外门呈半圆形称关门」，**不做方瓮城**）。
 *
 * 1938 年 3 月的门禁状态两说并列：一说封东北南三门，一说封南北两门而东西留通行。
 * 本作取「南北完全堵死、东门半堵、西门留一人宽通道」—— 这个状态能同时容纳两说。
 *
 * ry = 该门朝外的方向（局部 +z 轴指向城外）。
 */
export const GATES = [
  {
    id: "East", name: "宗鲁门", plaqueInner: "云连东岱", plaqueOuter: "宗鲁门",
    // 门位按 Notion《滕县城防示意图》相对 600 m 方城换算；仅相对位置可读，故为推定。
    x: 305, z: -65, ry: Math.PI / 2, outward: [1, 0],
    blocked: "partial",                  // 土袋半堵
    // 日方原文「最モ堅固ナル東門側防機関ノ直下ニアリテ瞰制セラレ」：
    // 东门旁有专门的侧射工事，位置高、能俯瞰城外突破口，还在手榴弹投掷距离内。
    // 这是日军从东面打不进去的直接原因，必须建出来。位置与尺寸推定。
    sidework: { offset: 26, out: 6.5, width: 11, height: 13.0 },
  },
  {
    id: "West", name: "怀古门", plaqueInner: "宝庆西畴", plaqueOuter: "怀古门",
    x: -305, z: 0, ry: -Math.PI / 2, outward: [-1, 0],
    // 1938 年唯一的活口。土袋堵到只剩一人宽通道 —— 落城时「外门与内门之间
    // 完全是人的漩涡」（日军第九中队安田少尉手记）。缺口净宽 0.9 m 为推定。
    blocked: "slit", slitWidth: 0.9,
    sidework: null,
  },
  {
    id: "South", name: "迎薰门", plaqueInner: "化洽南离", plaqueOuter: "迎薰门",
    x: 70, z: 305, ry: 0, outward: [0, 1],
    blocked: "full",
    sidework: null,
  },
  {
    id: "North", name: "望阙门", plaqueInner: "恩承北极", plaqueOuter: "望阙门",
    x: -145, z: -305, ry: Math.PI, outward: [0, -1],
    // 土袋堵死，突围当夜被守军「扒开已屯闭的北城门」。
    blocked: "full",
    sidework: null,
  },
];

/** 瓮城：半圆，半径 18 m（推定）。外门 3.4×5.0，内门 3.8×5.6（全为推定）。 */
export const BARBICAN = {
  radius: 18,
  wallHeight: 9.0,        // 推定：低于主墙一档，站在城楼上能俯瞰瓮城里
  wallThickness: 4.0,     // 推定
  outerGateW: 3.4, outerGateH: 5.0,
  innerGateW: 3.8, innerGateH: 5.6,
  // 直进式（内外门同轴）。志载只说「外门呈半圆形」，未言开口方位 —— 推定。
  straightThrough: true,
};

/** 城楼：内门之上，重檐、筒瓦叠脊、彩画，下有方砖月台 + 石围栏（形制为史料，尺寸推定）。 */
export const GATE_TOWER = {
  terraceW: 17, terraceD: 11, terraceH: 0.45,
  bodyW: 11.4, bodyD: 7.2,
  columnH: 4.4, upperH: 3.0,
  eaveOut: 1.6,
};

/**
 * 四条边。ry 是「墙朝外」的方向；沿 axis 方向展开 length。
 * north/south 沿 X 展开，east/west 沿 Z 展开。
 */
export const WALL_SIDES = [
  { id: "North", x: 0, z: -CITY.wallCenter, ry: Math.PI, axis: "x", sign: -1 },
  { id: "South", x: 0, z: CITY.wallCenter, ry: 0, axis: "x", sign: 1 },
  { id: "West", x: -CITY.wallCenter, z: 0, ry: -Math.PI / 2, axis: "z", sign: -1 },
  { id: "East", x: CITY.wallCenter, z: 0, ry: Math.PI / 2, axis: "z", sign: 1 },
];

/**
 * 马面／敌台 24 座（志载「24 个城堡」，按明代城防用语指凸出墙外的方台）。
 * 600 m 见方、周长 2.44 km，24 座 = 平均间距 101.7 m —— 正好落在明清城防
 * 「马面间距不超过两倍弓弩／火铳有效射程」的常规值内，自洽。
 * **形制与尺寸（凸出 4 m、面宽 8 m）全部为推定。**
 *
 * 每边 6 座，自该边中点（即城门）向两侧对称排开，避开城门与四角角楼。
 */
export const BASTION = { out: 4.0, width: 8.0, spacing: 610 / 6 };

export const BASTIONS = (() => {
  const list = [];
  for (const side of WALL_SIDES) {
    for (const k of [-2.5, -1.5, -0.5, 0.5, 1.5, 2.5]) {
      const at = k * BASTION.spacing;      // 沿墙的局部坐标，0 = 城门
      list.push({ side: side.id, at });
    }
  }
  return list;
})();

/** 四角望角楼（志载 + 日方「東南角望楼」双源吻合；形制推定）。 */
export const CORNER_TOWERS = [
  { id: "NorthWest", x: -CITY.wallCenter, z: -CITY.wallCenter },
  { id: "NorthEast", x: CITY.wallCenter, z: -CITY.wallCenter },
  { id: "SouthWest", x: -CITY.wallCenter, z: CITY.wallCenter },
  { id: "SouthEast", x: CITY.wallCenter, z: CITY.wallCenter },   // 日方点名的那一座
];

/**
 * 上城道 —— **全城只有四条，每座城门内侧旁一条，宽 2.4 m**（主流记载）。
 *
 * 这是全局最重要的一条空间约束：城墙是一条连续的、只有四个出入口的高空回廊。
 * 守军上下城必须绕到城门 —— 这也是日军占了西门城楼之后守军城墙防线立刻崩的原因。
 * 碰撞与导航上必须真的成立：除这四条以外，任何地方都不许能上墙。
 *
 * at = 坡道中点沿墙的局部坐标（正负决定在门的哪一侧）；坡长 28 m 为推定
 * （11.5 m 升高 ÷ 0.46 m 每级 × 1.0 m 踏面 + 中间 2 m 转折平台）。
 */
// dir：坡自 at 起沿哪个方向爬。**必须背离城门** —— 朝着城门爬的话坡身会压进
// z=0（或 x=0）那条不许有任何遮挡的视线走廊里。
export const RAMPS = [
  { side: "East", at: 65, dir: 1, seed: "rampE" },
  { side: "West", at: 0, dir: -1, seed: "rampW" },
  { side: "South", at: 70, dir: 1, seed: "rampS" },
  { side: "North", at: 145, dir: -1, seed: "rampN" },
];
export const RAMP = { width: 2.4, run: 1.0, landingAt: 13, landingRun: 2.0 };

/** 墙脚防空洞：内侧墙根，每 40 m 一个，口宽 1.2 m、进深 3 m（存在为主流记载，尺寸推定）。 */
export const DUGOUT = { spacing: 40, width: 1.2, height: 1.6, depth: 3.0 };

/**
 * 城内骨架：十字街口 + 四条门里街。
 * **街巷宽度全部为推定，无任何实测数据。**
 */
// 生成器、碰撞与菜单都以原点绘制十字街口；不得再把数据路标偏到 z=20。
export const CROSSROAD = { x: 0, z: 0, size: 30 };

export const STREETS = [
  // 主街骨架：四门契约（*GateStreet 命名 + 连门）与十字口双主轴，测试锁死不可动。
  { id: "WestGateStreet", axis: "x", at: 0, from: -305, to: 0, width: 9, label: "西门大街" },
  { id: "CentralEastStreet", axis: "x", at: 0, from: 0, to: 75, width: 8, label: "十字街" },
  { id: "EastGateStreet", axis: "x", at: -65, from: 52, to: 300, width: 9, label: "东门大街" },
  { id: "EastGateLink", axis: "z", at: 52, from: -65, to: 0, width: 6, label: "县署前街" },
  // 城防示意图：门里为北门大街，北关大街在城外（见 NORTH_SUBURB.street）。
  { id: "NorthGateStreet", axis: "z", at: -145, from: -300, to: -145, width: 7, label: "北门大街" },
  { id: "CentralNorthStreet", axis: "z", at: 0, from: -145, to: 0, width: 7, label: "北门大街南段" },
  { id: "CentralSouthStreet", axis: "z", at: 0, from: 0, to: 66, width: 7, label: "南门里大街北段" },
  { id: "SouthGateLink", axis: "x", at: 66, from: 0, to: 70, width: 6, label: "南门里大街转折" },
  { id: "SouthGateStreet", axis: "z", at: 70, from: 66, to: 300, width: 8, label: "南门里大街" },
  // 次街 v2 —— 照城防示意图重排：新增顺兴街/后门大街/当典后街/奎文街，
  // 关西店街、董文炳街两个无出处街名分别归位为图上的关岳庙街、奎文东街。
  { id: "LongwangTempleStreet", axis: "x", at: -145, from: -145, to: 88, width: 5, label: "龙王庙街" },
  { id: "HoumenStreet", axis: "z", at: -75, from: -260, to: -149, width: 5, label: "后门大街" },
  { id: "ShunxingStreet", axis: "z", at: -185, from: -90, to: 122, width: 5, label: "顺兴街" },
  { id: "DangdianBackStreet", axis: "x", at: -90, from: -185, to: 52, width: 5, label: "当典后街" },
  { id: "DangdianEastStreet", axis: "x", at: 90, from: -185, to: 150, width: 5, label: "当典东街" },
  { id: "GuanyueTempleStreet", axis: "z", at: 150, from: -65, to: 122, width: 5, label: "关岳庙街" },
  { id: "KuiwenStreet", axis: "z", at: 118, from: 86, to: 210, width: 5, label: "奎文街" },
  { id: "KuiwenEastStreet", axis: "z", at: 192, from: 66, to: 210, width: 5, label: "奎文东街" },
  { id: "FireGodTempleEastStreet", axis: "x", at: 210, from: -145, to: 192, width: 5, label: "火神庙东街" },
  // 巷道：rank:"hutong" —— 照常在街坊网格里雕出通道，但路面不铺车辙、不摆街肩生活层。
  { id: "MiaojiaHutong", axis: "x", at: -255, from: -248, to: -165, width: 2, rank: "hutong", label: "苗家胡同" },
];

/**
 * 硬约束：西城门楼 → 西门大街 → 十字街口必须是一条通视走廊。
 *
 * 「日兵占领西城门楼后，即集中火力向城中心十字街口扫射」是更强的一手战斗约束。
 * 图面示意的西门偏移不得覆盖这条空间机制；任何几何都不许侵入其净宽。
 */
export const SIGHT_CORRIDOR = {
  fromX: -305, toX: 0, atZ: 0, clearHalfWidth: 4.5, eyeY: 1.65,
};

/**
 * 城内地标。位置来自「滕县惨案调查」与地方志的街道记载；
 * 除县衙外，形制、尺寸一概无资料，全部为推定。
 */
export const LANDMARKS = [
  // 县衙：城内唯一有实物可参照的建筑（旧县衙大堂尚存，2006 年省级文保，典型明代建筑）。
  // 图上县公署位于东北偏中，轴线朝南；占地与精确落点均为推定。
  // 注意：现址的仪门、谯楼门、善国门是 2007 年后复建的仿古建筑，不能照抄细部。
  { id: "Yamen", kind: "yamen", x: 128, z: -118, ry: 0, w: 62, d: 54 },
  // 西门里街上的三处（位置为主流记载，形制推定）
  // 跨街的牌坊。明间（中间两根柱之间）净宽 = span/3 = 4 m，
  // 正好把 z=0 那条通视轴线让出来 —— 柱子站在街两侧，不站在轴线上。
  { id: "LongPaifang", kind: "paifang", x: -120, z: 0, ry: Math.PI / 2, span: 12 },
  { id: "AlarmTower", kind: "alarmTower", x: -205, z: -12, ry: 0, height: 9 },
  { id: "WangShrine", kind: "shrine", x: -250, z: 28, ry: 0, w: 26, d: 22 },
  // 北门里街东侧
  { id: "SquareFort", kind: "squareFort", x: -145, z: -255, ry: 0, w: 32, d: 32 },
  // 铁牌坊，坐东朝西（朝向为主流记载）
  { id: "IronPaifang", kind: "paifang", x: -145, z: -160, ry: 0, span: 7, iron: true },
  // 南门里街西侧，1931 年中共滕县特支驻地
  { id: "PeoplesBookshop", kind: "shop", x: -108, z: 132, ry: -Math.PI / 2, w: 12, d: 9 },
  // 城内西北的德国天主堂。日方战详报「城内外国建築物」指的就是它 ——
  // 日军接到「保护外国权益」的命令，十六日因此不敢彻底破坏城内建筑，
  // 十七日才改为「纵使把滕县城化为灰烬也在所不惜」的焦土方针。
  // **形制、规模、有无钟楼一概无资料**，做最保守的单钟塔小堂。
  // v2：照城防示意图移到南城书院小学以东（图上天主堂在南门里大街东侧）。
  { id: "CatholicChurchInner", kind: "church", x: 36, z: 238, ry: 0, nave: [11, 24], towerH: 16 },
];

/**
 * 城防图上能辨认出的主要院落和公共建筑。它们不是番号永久驻地，而是把图上的
 * 形状、街区位置和功能关系落成可见的场景节点；具体建制仍由战斗时段数据决定。
 */
export const CITY_FEATURES = [
  // label 只记录图号/功能，不表达永久驻防；相对坐标、尺寸、类型均为 PRESUMED。
  // v2：照城防示意图补齐监狱/看守所/警备队/团部/文庙/当典，北城功能区整体照图归位。
  // kind 一律走 Script_LandmarkRegistry 的构建器表；ry 显式给出（不再依赖生成器里的朝向表）。
  // —— 北城：后门大街／龙王庙街一带 ——
  { id: "NorthCompound727", label: "第727团1营", kind: "billet", x: -20, z: -250, ry: Math.PI, w: 80, d: 36, damage: 0.18, source: "diagram", notPermanentGarrison: true },
  { id: "ConfucianTemple", label: "文庙", kind: "confucianTemple", x: -100, z: -230, ry: 0, w: 40, d: 34, damage: 0.2, source: "diagram" },
  { id: "NorthWestCourtyard", label: "苗家胡同院落", kind: "compound", x: -205, z: -166, ry: Math.PI / 2, w: 52, d: 42, damage: 0.22, source: "diagram" },
  { id: "GarrisonHQ", label: "警备队", kind: "garrison", x: 150, z: -250, ry: Math.PI, w: 46, d: 30, damage: 0.2, source: "diagram", notPermanentGarrison: true },
  { id: "CountyJail", label: "监狱", kind: "prison", x: 162, z: -192, ry: 0, w: 44, d: 36, damage: 0.2, source: "diagram" },
  { id: "CountyPrison", label: "看守所", kind: "detention", x: 224, z: -192, ry: -Math.PI / 2, w: 30, d: 26, damage: 0.2, source: "diagram" },
  { id: "RegimentHQ", label: "团部", kind: "hq", x: -38, z: -176, ry: 0, w: 38, d: 30, damage: 0.16, source: "diagram", notPermanentGarrison: true },
  { id: "DragonKingTemple", label: "龙王庙", kind: "temple", x: 52, z: -172, ry: 0, w: 42, d: 30, damage: 0.22, source: "diagram" },
  { id: "PoliceStation", label: "警察所", kind: "police", x: 104, z: -216, ry: Math.PI / 2, w: 34, d: 28, damage: 0.18, source: "diagram" },
  { id: "CommerceGuild", label: "商会", kind: "guild", x: 34, z: -116, ry: Math.PI, w: 40, d: 26, damage: 0.18, source: "diagram" },
  { id: "PawnShop", label: "当典", kind: "pawnshop", x: -136, z: -116, ry: 0, w: 34, d: 30, damage: 0.2, source: "diagram" },
  // —— 中城 ——
  { id: "CentralCompound124", label: "第124师师部", kind: "hq", x: -58, z: -55, ry: 0, w: 94, d: 54, damage: 0.14, source: "diagram", notPermanentGarrison: true },
  { id: "CentralCompound127", label: "第127师师部", kind: "hq", x: -72, z: 56, ry: Math.PI, w: 94, d: 48, damage: 0.18, source: "diagram", notPermanentGarrison: true },
  { id: "WestSpecialCompound", label: "特务营第1连", kind: "billet", x: -225, z: -50, ry: Math.PI / 2, w: 52, d: 62, damage: 0.26, source: "diagram", notPermanentGarrison: true },
  { id: "EastDistrictOffice", label: "第二区公所", kind: "compound", x: 218, z: 12, ry: -Math.PI / 2, w: 50, d: 74, damage: 0.28, source: "diagram" },
  { id: "SouthWestOffice", label: "办事处", kind: "office", x: -140, z: 126, ry: Math.PI, w: 50, d: 44, damage: 0.3, source: "diagram" },
  // —— 南城 ——
  { id: "WenzhongSchool", label: "滕文中学旧址", kind: "school", x: -186, z: 220, ry: Math.PI / 2, w: 66, d: 40, damage: 0.26, source: "diagram" },
  { id: "ShuyuanPrimarySchool", label: "书院小学", kind: "school", x: -105, z: 238, ry: 0, w: 48, d: 30, damage: 0.24, source: "diagram" },
  // 火神庙东街的名字来源；旧数据误标为天主堂（天主堂见 LANDMARKS.CatholicChurchInner）。
  { id: "FireGodTemple", label: "火神庙", kind: "temple", x: 148, z: 182, ry: 0, w: 34, d: 26, damage: 0.28, source: "diagram" },
  { id: "SouthEastSpecialCompound", label: "特务营第2连", kind: "billet", x: 142, z: 247, ry: Math.PI, w: 76, d: 42, damage: 0.35, source: "diagram", notPermanentGarrison: true },
  { id: "SouthWestBlock", kind: "compound", x: -245, z: 260, ry: 0, w: 72, d: 34, damage: 0.32 },
  { id: "SouthEastBlock", kind: "compound", x: 230, z: 260, ry: Math.PI, w: 68, d: 36, damage: 0.36 },
];

/** 城外地标。南关教堂与城内那座两说并列，各建一处，不合并。 */
export const OUTER_LANDMARKS = [
  { id: "CatholicChurchSouth", kind: "church", x: 0, z: 420, ry: 0, nave: [9, 18], towerH: 12 },
  // 北关教产：弘道院／华北神学院一带。位置、布局、形制均无资料，
  // 只做剪影级远景，不做可进入空间。
  { id: "HongdaoAcademy", kind: "silhouetteCluster", x: -60, z: -420, w: 120, d: 70 },
  // 龙泉塔：城东郊、荆河西岸，**不在城内**。八角九级砖塔。
  // 1938 年 3 月状态：塔刹已倾毁、顶层塔室部分倾塌、挑檐斗拱脱落
  //（现在完整的宝葫芦塔刹是 1984 年新装的）。可登高约 30 m，非全高 43 m。
  // 三月十七日十时被日军观测班占领作炮兵观测所 —— 城之所以被精确轰开，是因为这座塔。
  { id: "LongquanPagoda", kind: "pagoda", x: 620, z: 210, tiers: 9, climbY: 30 },
  // 善国门**不是城门**：清末城南驿道上的一座牌坊式阁门楼。
  { id: "ShanguoGate", kind: "paifang", x: 0, z: 900, ry: 0, span: 8, arch: true },
];

/**
 * 东关（关厢）—— 本战真正的主战场，打了整整 24 小时。
 *
 * 日方自己的战后检讨：「对守军有利的不是城墙的高度与坚固，而是外城的存在
 * 与环绕城墙的密集民房的存在。」
 * 东关不是一堵坚固的墙，是一片可以被打穿的、家家有枪眼的院落迷宫。
 */
export const EAST_SUBURB = {
  bounds: { minX: 334, maxX: 540, minZ: -235, maxZ: 220 },   // 与城防图东关外侧的长条街区对应
  roadZ: -65,
  lane: { min: 1.5, max: 2.5 },                              // 巷宽（推定）
  // 东关寨墙：日方实测高 2 m、顶宽 0.4 m —— 极薄，一炮一个口。
  zhaiWall: { enabled: false, x: 540, fromZ: -235, toZ: 220, height: 2.0, topWidth: 0.4, baseWidth: 0.9 },
  // 东寨门：砖券洞，宽 3 m（宽度推定）。1938-03-16 14:00 被 105 mm 榴弹第一发命中打毁。
  zhaiGate: { x: 540, z: -65, width: 3.0, height: 3.4 },
  // 日方称之为「敌之有力据点」的寺院地阵地。位置为日方要图，形制推定。
  temple: { x: 414, z: -176, w: 26, d: 22 },
  // 地隙：河西岸与外城之间的南北向冲沟，日军沿此沟可掩蔽接近到寨墙 200 m 处
  // 而不暴露（存在与作用为日方实测；具体断面尺寸推定）。
  gully: { x: 555, fromZ: -200, toZ: 220, depth: 3.0, width: 7.5 },
  // v2：城防示意图上的东关挂牌院落（第一区公所、第731团1营）。
  // 位置照图在东关大街两侧、迷宫网格之内；坐标尺寸为推定。
  features: [
    { id: "FirstDistrictOffice", label: "第一区", x: 366, z: -28, w: 38, d: 44 },
    { id: "Battalion731", label: "第731团1营", x: 458, z: -108, w: 56, d: 40 },
  ],
};

/**
 * 东关核心白盒的防区锚点（游戏化推定，不是史实测绘坐标）。
 *
 * 这些点把城防示意图里的“开阔接近地—城壕—东城墙缺口—东门—中心街区”
 * 落成可以检查的空间关系：缺口两侧各有投弹位，缺口后方有交叉火力位，
 * 东关民房后保留一个预备队院落。wallAt 使用东墙局部坐标，East 墙上
 * worldZ = -wallAt，避免在不同切片里重复手写绝对坐标。
 */
export const EAST_DEFENSE = {
  breachWallAt: 65,
  grenadePositions: [
    { id: "BreachNorthGrenade", wallAt: 86, inward: 5, length: 7.2, depth: 2.6, ry: Math.PI / 2 },
    { id: "BreachSouthGrenade", wallAt: 44, inward: 5, length: 7.2, depth: 2.6, ry: Math.PI / 2 },
  ],
  crossfirePosition: { id: "BreachMachineGun", wallAt: 65, inward: 3.3, length: 9.6, depth: 3.0, ry: Math.PI / 2 },
  reserveCourtyard: { id: "EastReserveCourtyard", x: 390, z: -124, length: 11.0, depth: 3.2, ry: 0 },
  rubblePiles: [
    { id: "BreachNorthRubble", wallAt: 90, inward: 0.5, radius: 8.5 },
    { id: "BreachSouthRubble", wallAt: 40, inward: 0.5, radius: 8.5 },
    { id: "BreachApronRubble", wallAt: 65, inward: -5.0, radius: 7.0 },
  ],
};

/**
 * 东关外农田带（寨墙一线以东、荆河西岸）—— L2/L3 日军反冲击的出发区。
 *
 * 史实底子：日方战详记第三中队沿地隙掩蔽接近东寨门；出发区是滕县城郊的
 * 普通农耕平原 —— 冬小麦返青的麦地、翻耕的裸土、田埂、坟地、行道杨树
 * 与几处独户农院。**不能生成一块光板**：那既不像鲁南县郊，也让夜袭关卡
 * 的日军出生点毫无遮蔽。地形起伏、地块、村缘构件全部由这份表驱动
 * （Script_TengxianCity.BuildEastApproach 消费），坐标除注明外均为推定。
 */
export const EAST_FIELD = {
  bounds: { minX: 548, maxX: 756, minZ: -250, maxZ: 250 },
  roadZ: -65,
  // 战术地形：压在濠外原野解析高程上（Script_TengxianCity.OuterHeight）。
  // ridges：{id, from, to, width, height} —— 距中线 width 处衰减到 0；
  // lanes ：{id, from, to, inner, outer, depth} —— inner 内全深、outer 外为 0。
  terrain: {
    ridges: [
      // 北岭：东关大街北侧的缓丘，日军在岭后集结，挡住城里沿街的直瞄
      { id: "NorthRise", from: [556, -168], to: [752, -192], width: 36, height: 2.3 },
      // 南台：路南坟地所在的高台，比四野高出约一级坎
      { id: "SouthKnoll", from: [566, 126], to: [700, 146], width: 28, height: 1.6 },
    ],
    lanes: [
      // 大车道南侧的排水沟，与东关大街平行
      { id: "RoadSideDitch", from: [558, -82], to: [756, -90], inner: 1.4, outer: 6.0, depth: 1.0 },
      // 南台北麓往荆河去的田间排水沟
      { id: "FieldDrain", from: [642, -46], to: [694, 100], inner: 1.2, outer: 5.0, depth: 0.85 },
    ],
  },
  // 独户农院：院内地坪找平到 y=0（OUTER_PADS 由城模块按这份表自动登记），
  // 所以院子构件照旧以 y=0 起砌。
  farmsteads: [
    { id: "EastFarmNorth", x: 584, z: -208, w: 23, d: 18 },
    { id: "EastFarmSouth", x: 594, z: 76, w: 21, d: 17 },
    { id: "EastFarmFar", x: 668, z: -236, w: 19, d: 16 },
  ],
  // 坟地：rows×cols 个坟头成排（鲁南祖坟的排法），四周配侧柏。
  graves: [
    { id: "GraveSouth", x: 602, z: 140, rows: 2, cols: 4, spreadX: 13, spreadZ: 7 },
    { id: "GraveNorth", x: 576, z: -148, rows: 1, cols: 3, spreadX: 9, spreadZ: 5 },
  ],
};

/** 西关：电灯厂的烟囱是西关天际线上的关键剪影，且在西城门楼的直瞄射程内。 */
export const WEST_SUBURB = {
  // 西关紧贴西门与津浦铁路：通信队、电灯厂、交易所与车站的相对关系来自城防图；尺度推定。
  communications: { x: -402, z: -28, w: 30, d: 72 },
  powerPlant: { x: -408, z: 62, w: 30, d: 18, chimneyH: 22 },
  exchange: { x: -438, z: 116, w: 24, d: 28 },
  // 津浦路滕县站，1911 年竣工、德国承建的北段。三等小站不会有钟楼与大厅。
  // 形制全部为推定：单层局部两层、清水砖墙、石质窗套与转角、陡坡瓦屋面、木构月台雨棚。
  station: { x: -458, z: -82, w: 34, d: 12 },
  railway: { x: -480, fromZ: -900, toZ: 900, gauge: 1.435 },   // 相对城墙位置为推定
  // v2：照城防示意图补齐 —— 第122师师部在西关（濠外、西关大街北侧）；
  // 西关大街 = 西门吊桥外接铁路方向的城外土路。坐标、尺度均为推定。
  division122: { x: -362, z: -38, w: 40, d: 32 },
  westStreet: { z: 0, fromX: -470, toX: -328, width: 6, label: "西关大街" },
};

/**
 * 北关（城防示意图上沿）：坝墙（圩子）一线带若干圩门，北关大街出望阙门
 * 向北穿过关厢，庙在坝墙内东北。存在与走向为图示，坐标、尺度全部为推定。
 */
export const NORTH_SUBURB = {
  street: { x: -145, fromZ: -560, toZ: -328, width: 6, label: "北关大街" },
  stockade: { z: -560, fromX: -420, toX: 240, height: 2.2, topWidth: 0.5, baseWidth: 1.1,
    gates: [{ x: -145, width: 3.2 }, { x: 60, width: 2.8 }] },
  temple: { x: 60, z: -520, w: 26, d: 20 },
};

/** 城外水系与地表。 */
export const OUTSKIRTS = {
  // 荆河（城河）：南北向流过城东，z≈+380 转向西南沿城南而去，宽 25—35 m。
  // 护城河自明代起即引荆河水。
  river: { x: 680, width: 30, turnZ: 380 },
  // 城外空心炮台 2 座（1908 年建），**位置无载**，推定置于东南、西南墙外 60 m。
  hollowForts: [
    { x: 370, z: 370 },
    { x: -370, z: 370 },
  ],
};

/**
 * 三月的地表 —— 美术硬约束。
 * 依据日军 1938-03-16 下午现场速写《写景図第一》：
 * 所有乔木完全落叶，只有光秃枝干；树形高瘦、直干、分枝稀疏，高度约为房屋的 2—3 倍。
 * 冬小麦返青期，苗高 15—30 cm，贴地、不连续、露土率高。大片农田仍是裸露褐土。
 * **绝不做成绿意盎然的春天。**
 */
export const MARCH_GROUND = {
  wheatPatch: { count: 46, minSize: 45, maxSize: 130 },   // 麦田斑块数量与尺寸为推定
  treeHeight: [7.0, 10.5],                               // 房屋的 2—3 倍
  leafless: true,
};

/**
 * 色板（美术近似值，非史料）。标注「材质：史料」的是有文献依据的材质事实，
 * 其余 hex 一律为美术推定。
 */
export const PALETTE = {
  cityBrick: 0x7A7F84,        // 城墙青砖（清乾隆修补层）。材质：史料
  cityBrickWorn: 0x8D9195,
  ashlar: 0xB0ADA3,           // 条石勒脚。鲁南为石灰岩产区，材质：史料
  rammedEarth: 0xA38F6C,      // 夯土芯（缺口断面）—— 砖包夯土的最强读图信号
  freshImpact: 0x99A0A5,      // 城砖新弹痕断口
  houseBrick: 0x7E8388,       // 民居青砖
  crossStone: 0xB3B0A6,       // 民居过墙石（鲁南特征）。材质：史料
  adobe: 0xA8926E,            // 土坯 + 麦秸泥
  roofTile: 0x6E7276,         // 小青瓦
  tubeTile: 0x5F646A,         // 城楼筒瓦（叠脊、重檐）。形制：史料
  paintRed: 0x9A6A55,         // 城楼彩画（褪色后）。存在：史料
  paintGreen: 0x5F7D6E,
  timber: 0x5A4630,
  ironDoor: 0x3A342E,         // 城门包铁大门
  sandbag: 0x8E8467,          // 土袋堵门（1938 现状）。史料
  zhaiWall: 0x9C8A68,         // 关厢寨墙
  loophole: 0xB9B4A6,         // 民房枪眼边缘 —— 新掏的白茬，滕县巷战的第一符号。史料
  charred: 0x2E2A26,
  wheat: 0x5F7A40,            // 冬小麦返青
  bareSoil: 0x9C8562,         // 裸露耕土（鲁南褐土）
  dirtRoad: 0xA89373,
  moatWater: 0x6B7060,        // 护城河水（春季），浑浊
  willow: 0x7A5B48,           // 濠岸柳，三月无叶的深褐红枝条。栽柳为史料
  bareBranch: 0x6B6154,       // 落叶乔木枝干（杨／柳）。三月完全无叶：史料
  sky: 0xB9BCC0,              // 春季浮尘
};

/** 各关可玩切片 bounds（X / Z）。生成器按这个裁剪，控住绘制量。 */
export const LEVEL_BOUNDS = {
  L0Jiehe: { minX: -400, maxX: 400, minZ: -300, maxZ: 300 },
  L1Approach: { minX: -1600, maxX: 400, minZ: -900, maxZ: 200 },
  L2EastSuburb: { minX: 300, maxX: 600, minZ: -220, maxZ: 220 },
  L3EastNight: { minX: 300, maxX: 600, minZ: -220, maxZ: 220 },
  L4Wall: { minX: -100, maxX: 620, minZ: -100, maxZ: 420 },
  L5Crossroad: { minX: -340, maxX: 340, minZ: -340, maxZ: 340 },
  L6Breakout: { minX: -340, maxX: 340, minZ: -700, maxZ: 340 },
  Whole: { minX: -1100, maxX: 1100, minZ: -1100, maxZ: 1100 },
};

/**
 * 推定值登记表 —— **这一张表是史实纪律的执行机制**。
 *
 * 凡在这里登记的数，游戏内任何文本（图鉴、字幕、UI）都不许说成史实；
 * docs/ 里也必须逐条标注。若后续找到实测数据，改这里、改用它的字段，
 * 并把该条从表里删掉。
 */
export const PRESUMED = [
  { id: "wallBaseWidth", value: 10.0, unit: "m", note: "底宽。志载只给顶宽；1:6 收分反推应为 13.8 m，图纸取 10.0，实际收分 1:4.6" },
  { id: "parapetHeight", value: 1.6, unit: "m", note: "女墙高。成化八年建女墙垛口为史料，高度无载" },
  { id: "plinthHeight", value: 1.8, unit: "m", note: "条石勒脚高。鲁南石灰岩产区、砖石并用为史料，分层高度无载" },
  { id: "platformY", value: 1.2, unit: "m", note: "城内地坪高出濠外。依据「东面高起入城内」的现地描述 + 推定" },
  { id: "moatDepth", value: 4.8, unit: "m", note: "志载 1 丈 5 尺≈4.8；日方另记 8 m，并列存疑，本作取志载" },
  { id: "moatBankRun", value: [2.5, 2.1], unit: "m", note: "濠岸内外坡的水平投影，无载" },
  { id: "willowSpacing", value: 45, unit: "m", note: "濠岸栽柳为史料，株距无载" },
  { id: "bastionForm", value: { out: 4.0, width: 8.0 }, unit: "m", note: "马面 24 座为志载，凸出与面宽形制全无载" },
  { id: "bastionSpacing", value: 101.7, unit: "m", note: "24 座沿 2.44 km 周长均布的推算值，非实测" },
  { id: "cornerTowerForm", value: "6×6 m 亭阁", note: "四角有望角楼为双源史料，形制尺寸无载" },
  { id: "barbicanRadius", value: 18, unit: "m", note: "瓮城半圆半径。半圆形制为志载，尺寸无载" },
  { id: "barbicanStraight", value: true, note: "内外门同轴（直进式）。志载只说外门呈半圆形，未言开口方位" },
  { id: "barbicanWall", value: { height: 9.0, thickness: 4.0 }, unit: "m", note: "瓮城墙高与厚，无载" },
  { id: "gateOpening", value: { outer: [3.4, 5.0], inner: [3.8, 5.6] }, unit: "m", note: "内外门洞净宽净高，无载" },
  { id: "gateTowerSize", value: { body: [11.4, 7.2], terrace: [17, 11] }, unit: "m", note: "城楼与月台尺寸。重檐筒瓦叠脊彩画、方砖月台加石栏为志载，尺寸无载" },
  { id: "westGateSlit", value: 0.9, unit: "m", note: "西门土袋只剩「一人宽」为史料，具体净宽无载" },
  { id: "eastGateSidework", value: { out: 6.5, width: 11, height: 13.0 }, unit: "m", note: "东门侧防机关的存在与作用为日方一手史料，形制尺寸无载" },
  { id: "rampLength", value: 28, unit: "m", note: "上城道每门旁一条、宽 2.4 m 为主流记载；坡长、级高、中间转折平台全为推定" },
  { id: "dugoutSize", value: { width: 1.2, height: 1.6, depth: 3.0, spacing: 40 }, unit: "m", note: "墙脚防空洞存在为主流记载，尺寸与间距无载" },
  { id: "streetWidths", value: { west: 9, east: 9, south: 8, north: 7, secondary: 5, lane: 2.0 }, unit: "m", note: "**街巷宽度全部为推定，无任何实测数据**" },
  { id: "crossroadPosition", value: [0, 0], unit: "m", note: "十字街口以城心为原点；为与生成器、碰撞和菜单统一，已取消旧数据 z=20 的无依据偏移" },
  { id: "crossroadSize", value: 30, unit: "m", note: "十字街口的开阔尺寸，无载" },
  { id: "streetTopology", value: "STREETS", note: "v2 全网照 Notion 城防示意图重排：西门/东门/北门/南门里大街 + 龙王庙街、后门大街、顺兴街、当典后街、当典东街、关岳庙街、奎文街、奎文东街、火神庙东街、苗家胡同；具体米制坐标、转折点与街宽均为推定" },
  { id: "gateOffsets", value: { eastZ: -65, westZ: 0, northX: -145, southX: 70 }, unit: "m", note: "东、南、北门错位关系据 Notion 城防示意图按约 600 m 方城比例换算；西门固定在十字街 z=0 直瞄轴上，优先服从战斗史料硬约束" },
  { id: "yamenFootprint", value: [62, 54], unit: "m", note: "县公署/旧县衙位于城内东北偏中、轴线朝南为图示与主流记载；白盒占地尺寸无载" },
  { id: "cityFeatureLayout", value: "CITY_FEATURES", note: "v2 主要公共院落（含监狱、看守所、警备队、团部、文庙、当典、火神庙）的相对位置、白盒占地、类型均由 Notion 城防示意图转写，除图中文字外一律为推定；图中番号只作 1938 年 3 月态势标签，不表示永久驻防" },
  { id: "landmarkForms", value: ["LongPaifang", "AlarmTower", "WangShrine", "SquareFort", "IronPaifang", "PeoplesBookshop"], note: "西门里街与北门里街上这几处只有街名记载，位置为街上大致里程推定，形制尺寸全无资料" },
  { id: "churchForm", value: { nave: [11, 24], towerH: 16 }, unit: "m", note: "城内德国天主堂：存在为日方一手史料，形制、规模、有无钟楼一概无资料，做最保守的单钟塔小堂" },
  { id: "churchLocation", value: "两说并列", note: "日方记城内近内城墙、中方记南关，无法判定，各建一处不合并" },
  { id: "pagodaForm", value: { tiers: 9, climbY: 30 }, note: "八角九级为各家一致；密檐式／楼阁式两说互斥，高度三说，始建年代四说互斥。1938 年塔刹已毁、顶层倾塌为主流记载，日方观测班登高 30 m 为一手史料" },
  { id: "zhaiGateWidth", value: 3.0, unit: "m", note: "东寨门宽。寨墙高 2 m 顶宽 0.4 m 为日方实测，门洞尺寸无载" },
  { id: "gullySection", value: { depth: 3.0, width: 7.5 }, unit: "m", note: "地隙的存在与「可掩蔽接近到寨墙 200 m」为日方实测，断面尺寸无载" },
  { id: "eastSuburbLayout", value: "18×16 m 院落密铺", note: "东关「密集院落、院墙相连」为日方描述，具体地块划分无资料" },
  { id: "powerPlantSize", value: { w: 30, d: 18, chimneyH: 22 }, unit: "m", note: "电灯厂位置与「在西城楼直瞄射程内」为主流记载，厂房规模与烟囱高度无载" },
  { id: "westSuburbLayout", value: "WEST_SUBURB", note: "津浦铁路在城西，以及西关的车站、通信队、电灯厂、交易所、第122师师部与西关大街的关系为 Notion 城防示意图可见信息；其坐标、尺度和站房形式均为推定" },
  { id: "northSuburbLayout", value: "NORTH_SUBURB", note: "北关坝墙（圩子）、圩门、北关大街与北庙的存在与走向为 Notion 城防示意图可见信息；坐标、圩门数量与坝墙断面全部为推定" },
  { id: "stationForm", value: { w: 34, d: 12 }, unit: "m", note: "滕县站位置为主流记载，1911 年德建为史料，站房形制尺寸全为推定" },
  { id: "railwayX", value: -480, unit: "m", note: "津浦铁路在城西为主流记载；相对西城墙距离按 Notion 城防示意图比例换算，绝对坐标为推定" },
  { id: "hollowForts", value: [[370, 370], [-370, 370]], note: "城外空心炮台 2 座（1908 建）为主流记载，**位置无载**，暂置东南／西南墙外 60 m" },
  { id: "houseDims", value: { eave: [2.4, 2.8], ridge: [3.5, 4.2], courtWall: [1.8, 2.2] }, unit: "m", note: "鲁南民居形制为主流记载，具体高度为推定" },
  { id: "loopholeSize", value: 0.24, unit: "m", note: "家家掏枪眼、新掏边缘发白为日方一手史料反复点名，孔径与分布密度无载" },
  { id: "wheatPatch", value: { count: 46 }, note: "冬小麦贴地返青、露土率高为日方写景図一手图像证据，田块划分为推定" },
];

/** 按 id 查推定条目，给 UI 的「这是推定值」角标用。 */
export function FindPresumed(id) {
  return PRESUMED.find((p) => p.id === id) || null;
}
