// 1938 年 3 月 · 滕县城外的鲁南平原 —— **城外**内容生成器。
//
// 为什么要新开一个模块：
// Script_TengxianCity 是**建城**模块，它只往城墙、瓮城、关厢、街巷上花力气；
// 濠外那一圈它只铺了一张地皮（BuildOuterGround）+ 四十几棵树 + 几块麦地，
// 而且那几样东西是围着城心撒的（半径 360—1140 m）。序关（界河）落在城北
// 1.5 km、一关（北沙河）落在城西 1.45 km —— **出了那个圈，世界就只剩地皮**。
// 实测：L0 场上只有 3 个碰撞盒、city.stats 三档院落全是 0。
//
// 这个文件负责的就是那片空地皮：河道、河堤、土坎、散兵胸墙、坟头、光秃乔木、
// 麦田与田埂、村落轮廓、津浦路路基。
//
// ---------------------------------------------------------------------------
// **它有两个宿主**（这一段决定了这份内容能不能搬家）
//
//   L1_Beishahe  宿主是 Script_TengxianField —— 那一关是走廊式的，从北沙河
//                一路走到西门，既要野地也要城，所以仍然挂在城的世界上。
//   L0_Jiehe     宿主是 Script_JieheField（**独立场景**）—— 界河在滕县以北
//                二十公里，跟 600 m 方城不共景。设计书 §2.8 那张切片表原本
//                就把它标成「另一张外围地图」。
//
// 本模块对宿主的全部依赖只有一个钩子：**groundAt(x,z)**（外加 cityMask 这个
// 开关，见构造函数）。所以整份内容一行都不用改就能挂到另一张地表上 ——
// 这也是当初把它写成「只生成内容、不管地表」的原因。
//
// ---------------------------------------------------------------------------
// 坐标（这一段是接线说明，写错地方比不建更糟）
//
//   世界坐标只有一套：X 向东，Z 向南，**原点 = 滕县城十字街口**，单位米。
//   关卡切片 `bounds` 来自 **Data_Battle.TUNING[*].bounds，它就是世界坐标**，
//   没有第二个局部坐标系、没有平移矩阵。
//
//   `Data_Tengxian.LEVEL_BOUNDS` 是一张**没有任何代码 import 的死表**
//  （grep 过：只有定义处一条命中）。它记的是设计稿阶段「另起一张外围地图」
//   时的本地框，与运行时对不上 ——
//     L0：死表 (-400..400, -300..300) 800×600，运行时 (-620..620, -1620..-900)
//         1240×720，中心 (0,-1260)，即 z_world ≈ z_local - 1260 且 X 被拉宽；
//     L1：死表 2000×1100，运行时 1330×640 —— **连缩放都对不上**，纯属过期。
//   所以本模块一律照 Data_Battle 的世界坐标建，不做任何平移。
//
//   两关的位置（实测 spawn，非推断）：
//     L0_Jiehe    玩家 (0,-1470) 朝南（ry=π）→ 城北 1.47 km 的开阔原野
//     L1_Beishahe 玩家 (-1450,-430) 朝南       → 城西 1.45 km、津浦路旁
//
//   界河真实位置在城北约 20 km、北沙河约 8 km —— **本作把这两片战场就近借位**
//   到城北／城西的原野上（Data_Battle 的原注：「切片取城北开阔原野，不让城墙
//   入画」）。借位是既定做法，本模块沿用，逐条在 PRESUMED_OUTFIELD 里登记。
//
// ---------------------------------------------------------------------------
// 三月的地表（Data_Tengxian.MARCH_GROUND，硬约束，不许违反）
//
//   依据日军 1938-03-16 现场速写《写景図第一》：
//   **所有乔木完全落叶**，只有光秃枝干；树形高瘦、直干、分枝稀疏，
//   高约房屋的 2—3 倍。冬小麦返青期，苗高 15—30 cm，贴地、不连续、露土率高。
//   大片农田仍是裸露褐土。**绝不做成绿意盎然的春天。**
//
//   工程上的落法：**不铺满地的麦毯**。裸土就是那张已有的地面网格本身，
//   麦子只是撒在上面的一片片矮块（覆盖率 ~30%），高 0.28 m 露头。
//
// ---------------------------------------------------------------------------
// 工程约束
//   · 不许 Math.random —— 全部走 Mulberry32 / HashString（截图比对要可复现）；
//   · 不许 import three 的 examples/jsm（仓里只有核心构建）；
//   · 材质走 MaterialLibrary，桶名是**逻辑名**，由 ResolveOutfieldMaterial 落到
//     既有烘焙配方 + 调色（照 Script_TengxianCity.ResolveTengxianMaterial 的做法）；
//   · 土坎／河堤／坟头／胸墙**必须是真碰撞体**，而且不许做成「画面上是坡、
//     碰撞上是墙」—— 全部用**四级台阶式碰撞盒**贴着可见斜面走，
//     每级 ≤ 0.56 m（Script_Player.MoveWithCollision 的自动抬腿档），人能真的走上去；
//   · 长垄必须留缺口：NavGrid 把顶面高出地面 0.56 m 的盒子一律刷成不可走，
//     一条不断的土垄会把导航图切成两半，AI 从此过不来。
// ---------------------------------------------------------------------------

import * as THREE from "three";
import { Mulberry32, HashString, Clamp01 } from "./Script_Noise.mjs";
import {
  MOAT, MARCH_GROUND, WEST_SUBURB, EAST_SUBURB, OUTSKIRTS, OUTER_LANDMARKS,
} from "./Data_Tengxian.mjs";
import { BuildSink, AddTree } from "./Script_World.mjs";
import { MakeBox, MergeGeometries, PlaceGeometry, TILE_METERS, BRICK_UV_GRID } from "./Script_Geo.mjs";
import { ResolveTengxianMaterial } from "./Script_TengxianCity.mjs";

// ---------------------------------------------------------------------------
// 材质：城外这一套新增的逻辑名
//
// 与城里同样的规矩：MeshStandardMaterial.color 是**乘**在 albedo 上的，
// 只能往暗里调。裸耕土、河沙、道砟都是从既有配方染出来的。
// ---------------------------------------------------------------------------
const OUTFIELD_MATERIAL_MAP = {
  // 鲁南褐土（田埂、土坎、河堤、坟头、胸墙 —— 城外的土全是这一种）。
  //
  // **配方走 Ground 不走 Adobe**：第一版用了 Adobe（土坯 + 麦秸泥），
  // 实拍出来田埂和土坎是一条条**砌出来的石头墙** —— Adobe 那张贴图有明显的
  // 坯块分缝，那是墙的纹理不是土的纹理。城外的土垄是刨出来堆上去的，
  // 只能用细颗粒的地面纹理。
  FieldEarth: { recipe: "Ground", color: 0xD9C4A0, roughness: 1.0 },
  // 同一种土的另一档（相邻土垄不同色，一条一千米的堤才不是一根挤出来的塑料条）
  FieldEarthDark: { recipe: "Ground", color: 0xB9A788, roughness: 1.0 },
  // 新翻的土（胸墙顶、坟头、弹坑浮土）比风化面亮一档
  FreshEarth: { recipe: "Ground", color: 0xF0DCB6, roughness: 1.0 },
  // 河床沙砾：鲁南的季节河三月枯水，河床是一大片浅色沙砾
  RiverSand: { recipe: "Ground", color: 0xF2E7CE },
  // 耕地：**同一张 Ground 配方的两档色**。三月的鲁南平原是一块块的地拼起来的，
  // 犁过的、没犁的、去年留茬的各是一个色 —— 全场一个色调就是那张「一望无际的
  // 平地」截图的直接来源。露土率高不等于满地一个色。
  FieldSoil: { recipe: "Ground", color: 0xE4D2AE },
  FieldSoilDark: { recipe: "Ground", color: 0xB6A78E },
  // 大车路：比田里的土亮、被压实
  CartRoad: { recipe: "Ground", color: 0xF0E2C6 },
  // 道砟
  Ballast: { recipe: "GroundRubble", color: 0xD6D2C8 },
  // 干垒石墙（「石墙」那一带的地名就是这么来的；鲁南是石灰岩产区）
  DryStone: { recipe: "Stone", color: 0xF6F5EE },
  // 返青的冬小麦。**走带纹理的 Ground 配方染绿，不用纯色** ——
  // 纯色 plain 在近处是一块绿塑料板（第一版实拍的样子）。
  // 苗高 15—30 cm、行间露土，读出来必须是「土里透绿」而不是「一块绿地毯」，
  // 所以色偏土、不偏鲜绿。
  WheatRow: { recipe: "Ground", color: 0x97A96C },
  WheatRowDry: { recipe: "Ground", color: 0xB9B78E },
};

const OUTFIELD_PLAIN_MAP = {
  // 钢轨：三月的锈 + 轨面被车轮磨亮
  RailSteel: { color: 0x6A6058, roughness: 0.46, metalness: 0.55 },
  // 枯水期的浅流，浑浊
  ShallowWater: { color: 0x77796A, roughness: 0.22, transparent: true, opacity: 0.82, depthWrite: false },
};

/**
 * 桶名 → 材质。**先查城外这一张，查不到落回城里那一张**
 *（城外要用到城里的 Willow / HouseBrick / RoofTile / Wheat / Stone 等等）。
 */
export function ResolveOutfieldMaterial(name, library) {
  const plain = OUTFIELD_PLAIN_MAP[name];
  if (plain) return library.Plain(name, plain);
  const spec = OUTFIELD_MATERIAL_MAP[name];
  if (spec) {
    const { recipe, ...options } = spec;
    return library.Get(recipe, options);
  }
  return ResolveTengxianMaterial(name, library);
}

// ---------------------------------------------------------------------------
// 几何小工具
// ---------------------------------------------------------------------------

/** 一条梯形土垄的一段：沿 +X 展开、底面在 y=0、中心在原点。 */
const EARTH_TILE = 1.9;

function RidgePrism(len, h, baseHalf, topHalf, { tile = EARTH_TILE, u0 = 0 } = {}) {
  const x0 = -len / 2, x1 = len / 2;
  const A = [x0, 0, -baseHalf], B = [x0, h, -topHalf], C = [x0, h, topHalf], D = [x0, 0, baseHalf];
  const E = [x1, 0, -baseHalf], F = [x1, h, -topHalf], G = [x1, h, topHalf], H = [x1, 0, baseHalf];
  const pos = [], uvs = [];
  const push = (p0, p1, p2, p3, t0, t1, t2, t3) => {
    pos.push(...p0, ...p1, ...p2, ...p0, ...p2, ...p3);
    uvs.push(...t0, ...t1, ...t2, ...t0, ...t2, ...t3);
  };
  const slope = Math.hypot(baseHalf - topHalf, h) / tile;
  const flat = (2 * topHalf) / tile;
  const ua = u0 / tile, ub = (u0 + len) / tile;
  // 绕序按外法线定（推导见提交说明）：北坡 A-B-F-E、顶 B-C-G-F、南坡 C-D-H-G
  push(A, B, F, E, [ua, 0], [ua, slope], [ub, slope], [ub, 0]);
  push(B, C, G, F, [ua, slope], [ua, slope + flat], [ub, slope + flat], [ub, slope]);
  push(C, D, H, G, [ua, slope + flat], [ua, slope * 2 + flat], [ub, slope * 2 + flat], [ub, slope + flat]);
  // 两端封口（土垄是一段一段的，端面要有）
  push(A, D, C, B, [-baseHalf / tile, 0], [baseHalf / tile, 0], [topHalf / tile, h / tile], [-topHalf / tile, h / tile]);
  push(E, F, G, H, [-baseHalf / tile, 0], [-topHalf / tile, h / tile], [topHalf / tile, h / tile], [baseHalf / tile, 0]);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(uvs), 2));
  g.computeVertexNormals();
  return g;
}

/**
 * 坟头。华北平原田间的家族坟地是最常见的地貌，也是**最好用的天然掩体** ——
 * 这一关的玩法核心是「手榴弹经济 + 找掩体」，没有它这一关就不成立。
 */
function MoundGeometry(radius, h, seed) {
  const rnd = Mulberry32(HashString(seed));
  const g = new THREE.CylinderGeometry(radius * 0.16, radius, h, 9, 2);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i += 1) {
    const t = Clamp01((pos.getY(i) + h / 2) / h);
    const k = 1 + (rnd() - 0.5) * 0.16 * (1 - t * 0.4);
    pos.setX(i, pos.getX(i) * k);
    pos.setZ(i, pos.getZ(i) * k);
  }
  g.computeVertexNormals();
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i += 1) {
    uv.setXY(i, uv.getX(i) * (2 * Math.PI * radius) / EARTH_TILE, uv.getY(i) * h / EARTH_TILE);
  }
  g.translate(0, h / 2, 0);
  return g;
}

// ---------------------------------------------------------------------------
// 城外布景表 —— **按关卡 id 显式登记**。
//
// 为什么是白名单而不是「凡在城外就生成」：城里那几关（L2—L6）的切片也有一小块
// 落在濠外，一旦按范围自动生成，那几关的画面与 draw call 就跟着变了。
// 交付要求是「城内六关一个像素都不许变」，所以只有登记在这里的关才建城外。
//
// 全表**除注明外一律推定**（关卡布景），逐条见文件末尾 PRESUMED_OUTFIELD。
// ---------------------------------------------------------------------------
const OUTFIELD_SCENES = {
  // =========================================================================
  // 序 · 界河（三月十四日拂晓—十九时）
  // 史实锚：拂晓日军约 3600 人自两下店方向展开攻击，突破津浦路西第 124 师
  // 370 旅**石墙**阵地与路东第 125 师香城阵地；19 时 370 旅趁暗夜向滕县撤退。
  // 目标链：界河南岸 (0,-1420) → 土坎 (0,-1255) → 北沙河 (0,-1000)，玩家南撤。
  // =========================================================================
  L0_Jiehe: {
    id: "Jiehe",
    // **这一关的宿主是 Script_JieheField（独立场景），不是城。**
    // 生成范围比切片大一圈：相机远平面 460 m（JIEHE_CAMERA_FAR），
    // 站在 z=-1470 朝北能看到 -1930，只按 bounds(-1620) 生成的话，
    // 正前方 150 m 外就是一条空白的地平线。
    region: { minX: -960, maxX: 960, minZ: -1740, maxZ: -620 },
    // LOD/密度焦点：目标链 + 出生点
    foci: [[0, -1470], [0, -1420], [0, -1255], [0, -1000]],
    fieldRadius: 760,
    // --- 界河河道（东西向横过切片北端）---
    // 河心线定在 -1528：加上蜿蜒项，x=0 处实际在 -1517.9，南岸堤顶落在 **-1486.9**，
    // 也就是出生点 (0,-1470) 正北 17 m。**这个距离是量出来的，不是拍的** ——
    // 第一版把河放在 -1552，堤顶离出生点 40 m，实拍时那道 2.1 m 的堤在画面里
    // 只是地平线上一条 40 px 的带子，等于没建。雾在两三百米外就把东西吃干净了
    //（fog.max 0.94），所以城外的东西**必须堆在玩家一百米以内**才读得出来。
    // （河心从 -1524 北移 4 m、两岸堤各外移 4/5 m，是给下切的河槽让出槽肩：
    //   槽肩在河心 ±26，堤脚在 ±27.4 / ±30.1，差 1.4 m 以上不打架。）
    river: {
      centerZ: -1528, bedHalf: 19, waterHalf: 6.0, meander: 9,
      fromX: -960, toX: 960,
      /**
       * **河槽是真下切的。**
       *
       * 城那张外圈网格 700—1700 m 之间只有 5 圈径向采样（一格 200 m），
       * 任何窄于 200 m 的地形特征都会被混叠掉 —— 所以在城的世界里，河只能
       * 靠两岸筑堤"抬"出来。拆成独立场景之后地表是自己铺的（河槽一带 3.2 m
       * 一格），槽就能真挖下去：Script_JieheField.GroundHeight 按这两个数下切。
       *   cut 1.9 m  槽底比平地低多少（站进槽里，岸上的人只看得见头顶）
       *   run 7 m    槽肩到槽底的坡长（1.9/7 ≈ 15°，走得下去也走得上来）
       * 槽底半宽 = bedHalf 19 → **38 m 宽的平底**，槽肩落在 ±26，
       * 两道堤（offset −33 / +31，基半宽 2.9 / 3.6）正好坐在槽肩以外的平地上。
       */
      channel: { cut: 1.9, run: 7 },
      // 北岸（敌岸）：矮一档、缺口多 —— 日军要能过得来
      north: { offset: -33, height: 1.6, baseHalf: 2.9, topHalf: 1.05,
        gaps: [[-720, -676], [-430, -392], [-178, -126], [150, 188], [452, 496], [734, 778]] },
      // 南岸土坎（我岸）：**这是 L0 的核心战术地形**，玩家开局就在它后面。
      // -178…-126 那个缺口与南北向大车路对齐 —— 那是渡口，也是导航图
      // 南北连通的主通道（两道堤都不留口的话，NavGrid 会把北岸整条切出去）
      south: { offset: 31, height: 2.2, baseHalf: 3.6, topHalf: 1.35,
        gaps: [[-560, -524], [-178, -126], [96, 134], [520, 562]] },
    },
    // --- 两条阵地线 ---
    // ① 界河南岸的一线（Approach 路标）：散兵胸墙 + 单人掩体
    // ② 土坎（Kan 路标）：一道 2.05 m 的田坎，玩家越过它之后回身守
    banks: [
      { id: "Kan", from: [-620, -1262], to: [620, -1262], height: 2.05,
        baseHalf: 3.3, topHalf: 1.25, tag: "kan",
        // 缺口对着目标链（x≈0）留一个 —— 玩家从北侧过来，要能走到南侧回身守。
        // [186,226] 那个缺口是给津浦路路基让路的（路基在 x=205）：
        // 一道 2 m 土坎横穿 1.35 m 的道砟堤，实拍就是两根土条打架
        gaps: [[-370, -336], [-96, -60], [186, 226], [498, 534]] },
    ],
    parapets: [
      { z: -1455, fromX: -180, toX: 190, seed: "L0zero" },     // 出生点这一线
      { z: -1428, fromX: -300, toX: 320, seed: "L0first" },
      { z: -1408, fromX: -250, toX: 240, seed: "L0firstB" },
      { z: -1240, fromX: -340, toX: 340, seed: "L0second" },
      { z: -1222, fromX: -300, toX: 300, seed: "L0secondB" },
    ],
    pits: [
      { z: -1462, fromX: -150, toX: 160, count: 7, seed: "L0pit0" },
      { z: -1440, fromX: -280, toX: 300, count: 9, seed: "L0pitA" },
      { z: -1230, fromX: -320, toX: 320, count: 9, seed: "L0pitB" },
    ],
    // 「他们的炮先来，人后来」—— 阵地上得有炮坑，那句台词才有布景
    craters: [
      { z: -1440, fromX: -260, toX: 280, spread: 46, count: 11, seed: "L0crA" },
      { z: -1250, fromX: -300, toX: 300, spread: 42, count: 9, seed: "L0crB" },
    ],
    // --- 津浦铁路 ---
    // 铁路是这一仗的轴线（路西 370 旅、路东 125 师）。**玩家在路西**，
    // 与史实的相对位置一致。x 值本身是关卡布景推定（真线在城西 x=-1500，
    // 那一段与本关永不同屏，见文件头的借位说明）。
    //
    // **x 从 415 收到 205**：关卡副标题写的是「界河南岸 · 津浦路西」，而雾
    //（fog.max 0.93 / density 0.0125）在两百多米外就把东西吃干净 ——
    // 路基摆在 415 m 外时，那半句副标题在画面上一帧都兑现不了。
    // 205 m 处路基与电线杆（6.2 m）读得出一条东侧的天际线，
    // 离目标链（x≈0，半径 34）还有 171 m 净空，不挤占打起来的那条走廊。
    // bridgeAtZ 跟着河心走：RiverCenterZ(205) ≈ -1523，桥必须架在河心上。
    railway: { x: 205, fromZ: -1740, toZ: -620, crossings: [-1188, -862],
      bridgeAtZ: -1523, poles: true },
    // --- 大车路（南北向，连着河上的浅滩渡口）---
    roads: [{ width: 5.2, points: [[-150, -1690], [-142, -1552], [-158, -1300], [-150, -640]] }],
    // --- 村落轮廓 ---
    villages: [
      { id: "LiangxiadianW", x: -320, z: -1652, w: 150, d: 66, count: 9, far: true },
      { id: "LiangxiadianE", x: 296, z: -1668, w: 122, d: 58, count: 7, far: true },
      // 「石墙」：370 旅阵地的地名。做成一圈干垒石墙的小村
      { id: "Shiqiang", x: -524, z: -1348, w: 118, d: 86, count: 8, stoneWall: true },
      { id: "BeishaheTown", x: 70, z: -742, w: 210, d: 84, count: 12, far: true },
    ],
    // 田埂上的树行（华北平原的地界树）
    // 平原上唯一的竖线。**中段（z -1420…-1280）必须有几行** ——
    // 实拍取证：站在 z=-1320 朝南，58 m 外那道 2.05 m 的土坎在画面上只是
    // 地平线上一条淡影（平地上 2 m 的东西超过 50 m 就看不见了，这是几何事实，
    // 也正是这一关「除了土坎和坟头无处可躲」的战术前提）。
    // 中距离的可读性只能靠树行与坟头撑。
    treeRows: [
      { from: [-560, -1352], to: [560, -1358], pitch: 17 },
      { from: [-500, -1412], to: [520, -1418], pitch: 21 },
      { from: [-460, -1296], to: [470, -1302], pitch: 19 },
      { from: [-420, -1178], to: [430, -1186], pitch: 16 },
      { from: [-300, -1620], to: [-296, -1300], pitch: 19 },
      { from: [268, -1300], to: [274, -960], pitch: 18 },
      { from: [-96, -1240], to: [-90, -940], pitch: 20 },
    ],
    graves: { clusters: 19, seed: "L0grave" },
    trees: { count: 96, seed: "L0tree" },
    // collide：**田埂要挡子弹**。见 BuildFields 里那一段账 ——
    // 这一关的核心是「手榴弹经济 + 找掩体」，0.30 m 的田埂是「趴下能活、
    // 跪起来就死」的那条线，不给碰撞盒它就只是画上去的一道棱。
    // 只有这一关开：L1 手里有枪、打法不同，不动它那边的碰撞盒表。
    wheat: { cellW: 36, cellD: 74, wheatShare: 0.42, seed: "L0wheat", collide: true },
  },

  // =========================================================================
  // 一 · 北沙河 · 入城（三月十四日夜 — 十五日黄昏）
  // 史实锚：十四日夜孙震在北沙河开会、配置第二线阵地；十五日沿津浦路南撤，
  // 经西关车站与电灯厂，黄昏前从西门进城。
  // 目标链：二线阵地 (-1450,-380) → 路口 (-1450,-160) → 车站 (-1450,40)
  //         → 电灯厂 (-700,30) → 西门 (-330,0)
  // =========================================================================
  L1_Beishahe: {
    id: "Beishahe",
    region: { minX: -1820, maxX: -358, minZ: -780, maxZ: 620 },
    foci: [[-1450, -430], [-1450, -380], [-1450, -160], [-1450, 40], [-700, 30], [-352, 0]],
    fieldRadius: 700,
    // 北沙河：借位到切片北端。**只铺到 x=-820 为止** —— 再往东就压到城北了，
    // 那是第六关（北门突围）的地皮，不许动
    river: {
      centerZ: -482, bedHalf: 18, waterHalf: 5.0, meander: 7,
      fromX: -1820, toX: -820,
      north: { offset: -25, height: 1.5, baseHalf: 2.7, topHalf: 1.0,
        gaps: [[-1660, -1622], [-1400, -1362], [-1140, -1104], [-940, -902]] },
      south: { offset: 24, height: 2.05, baseHalf: 3.3, topHalf: 1.25,
        gaps: [[-1710, -1676], [-1330, -1294], [-1020, -984]] },
    },
    banks: [],
    parapets: [
      // 二线阵地：十四日夜孙震在北沙河开完会连夜挖的那一条
      { z: -412, fromX: -1560, toX: -1330, seed: "L1line0" },
      { z: -388, fromX: -1580, toX: -1250, seed: "L1line" },
      { z: -368, fromX: -1560, toX: -1290, seed: "L1line2" },
      // 路口（Dawn 路标）那一处路障
      { z: -172, fromX: -1500, toX: -1380, seed: "L1road" },
    ],
    pits: [
      { z: -424, fromX: -1540, toX: -1360, count: 7, seed: "L1pit0" },
      { z: -400, fromX: -1570, toX: -1260, count: 10, seed: "L1pitA" },
      { z: -350, fromX: -1540, toX: -1300, count: 6, seed: "L1pitB" },
    ],
    craters: [
      { z: -395, fromX: -1560, toX: -1270, spread: 44, count: 10, seed: "L1crA" },
      { z: -150, fromX: -1500, toX: -1360, spread: 40, count: 6, seed: "L1crB" },
    ],
    // 津浦正线：**这一段是真位置**（城西 0.8—1.5 km 为主流记载推算，
    // Data_Tengxian.WEST_SUBURB.railway.x = -1500）
    railway: { x: WEST_SUBURB.railway.x, fromZ: -780, toZ: 620,
      crossings: [-165, 118], bridgeAtZ: -486, poles: true, platformAtZ: 40 },
    roads: [{
      width: 5.6,
      // 车站 → 电灯厂 → 西门外的那条土路（设计稿：西门外土路自 (-310,0) 向西）
      points: [[-1500, -168], [-1444, -120], [-1440, 40], [-1330, 44], [-1080, 36],
        [-700, 26], [-470, 12], [-358, 4]],
    }],
    villages: [
      { id: "BeishaheVillage", x: -1276, z: -604, w: 132, d: 78, count: 9, far: true },
      { id: "RoadInn", x: -1386, z: -196, w: 58, d: 40, count: 4 },
      // 五里屯（城西，设计稿给的方位参照）
      { id: "Wulitun", x: -886, z: -104, w: 152, d: 106, count: 11 },
      { id: "SouthHamlet", x: -1040, z: 330, w: 118, d: 70, count: 8, far: true },
    ],
    treeRows: [
      { from: [-1560, -300], to: [-620, -286], pitch: 18 },
      { from: [-1560, -216], to: [-900, -206], pitch: 20 },
      { from: [-1320, -470], to: [-1312, 120], pitch: 17 },
      { from: [-980, -260], to: [-970, 300], pitch: 19 },
      { from: [-1540, -60], to: [-760, -50], pitch: 21 },
    ],
    graves: { clusters: 16, seed: "L1grave" },
    trees: { count: 88, seed: "L1tree" },
    wheat: { cellW: 38, cellD: 78, wheatShare: 0.40, seed: "L1wheat" },
  },
};

/** 这一关要不要建城外。给 Script_TengxianField 用。 */
export function HasOutfield(levelId) {
  return Object.prototype.hasOwnProperty.call(OUTFIELD_SCENES, levelId);
}

/**
 * 取一关的城外布景表。给**独立场景的宿主**（Script_JieheField）用 ——
 * 它要照同一份 river 参数去下切地表，两边不许各写一份数。
 */
export function OutfieldSpec(levelId) {
  return OUTFIELD_SCENES[levelId] || null;
}

/**
 * 河心线（蜿蜒项）。**这条公式有两个调用方**：本模块（摆河床、河堤、桥）
 * 与 Script_JieheField（下切地表）。写成两份的后果是河床跑到堤外面去，
 * 而且差多少取决于 x —— 一眼看不出来的那种错。
 */
export function RiverCenterAt(river, x) {
  if (!river) return 0;
  return river.centerZ
    + Math.sin(x * 0.0042 + 1.7) * river.meander
    + Math.sin(x * 0.0131 + 0.4) * river.meander * 0.35;
}

// 合批分区。城里用 150 m（院落密），城外东西稀、跨度大，用 380 m ——
// 分区越小 draw call 越多，而城外一个分区里也就三四样东西。
const SECTOR_SIZE = 380;
function SectorKey(x, z) {
  return `O${Math.floor(x / SECTOR_SIZE)}_${Math.floor(z / SECTOR_SIZE)}`;
}

// ---------------------------------------------------------------------------

export class TengxianOutfield {
  /**
   * @param {THREE.Scene} scene
   * @param {object} library MaterialLibrary
   * @param {object} options
   *   levelId   关卡 id（Data_Battle.PHASES[*].id）。没登记在 OUTFIELD_SCENES 里就什么都不建
   *   bounds    本关切片（世界坐标，Data_Battle.TUNING[*].bounds）
   *   groundAt  (x,z) => 地面标高。**必须传宿主那一份**，不然人踩的地和看的地对不上
   *   quality   low / medium / high / ultra
   *   cityMask  Blocked() 里那一串「城、护城河、关厢、荆河、电灯厂、车站的地皮
   *             一律不碰」要不要生效。**宿主是城（TengxianField）时必须 true**
   *             —— 城内六关的画面不许因为城外多了一个模块而变化。
   *             宿主是独立场景（JieheField）时传 false：那张图上没有城，
   *             那几个坐标是空的，照城的表屏蔽等于凭空挖掉几块地。
   */
  constructor(scene, library, { levelId = null, bounds = null, quality = "high",
    seed = 19380314, groundAt = () => 0, cityMask = true } = {}) {
    this.scene = scene;
    this.library = library;
    this.spec = levelId ? (OUTFIELD_SCENES[levelId] || null) : null;
    this.bounds = bounds;
    this.quality = quality;
    this.seed = seed;
    this.groundAt = groundAt;
    this.cityMask = cityMask;
    this.sink = new BuildSink();        // 有体积的（投阴影）
    this.groundSink = new BuildSink();  // 贴地的（不投阴影 —— 一块 0.3 m 的麦地投影是噪点）
    this.farSink = new BuildSink();     // 远景剪影（不投阴影）
    this.meshes = [];
    this.colliders = [];
    this.covers = [];
    this.stats = { banks: 0, parapets: 0, pits: 0, graves: 0, trees: 0,
      wheatPlots: 0, soilPlots: 0, balks: 0, craters: 0, villages: 0, railM: 0, ties: 0 };
    // 密度：low 砍四成，medium 砍两成
    this.density = quality === "low" ? 0.6 : quality === "medium" ? 0.8 : 1.0;
  }

  get active() { return this.spec !== null; }

  // -------------------------------------------------------------------------
  // 取舍判据
  // -------------------------------------------------------------------------

  /** 在生成范围里吗（生成范围 = 切片 + 一圈富余，见 spec.region）。 */
  InRegion(x, z) {
    const r = this.spec.region;
    return x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ;
  }

  /** 离最近的焦点多远（撒东西的密度按这个衰减）。 */
  FocusDistance(x, z) {
    let best = 1e9;
    for (const f of this.spec.foci) {
      const d = Math.hypot(x - f[0], z - f[1]);
      if (d < best) best = d;
    }
    return best;
  }

  /**
   * 这块地能不能放东西。
   * **一条铁律：城、濠、关厢、几处城外建筑的地皮一律不碰** ——
   * 城内六关的画面不许因为城外多了一个模块而变化。
   */
  Blocked(x, z, margin = 0, { skipRoad = false } = {}) {
    if (this.cityMask) {
      // 城 + 护城河 + 瓮城外凸 + 余量。濠外沿 328.5，瓮城处再外凸 16
      if (Math.max(Math.abs(x), Math.abs(z)) < MOAT.outerEdge + 34 + margin) return true;
      // 东关（关厢院落 + 寨墙 + 地隙）
      const es = EAST_SUBURB.bounds;
      if (x > es.minX - 40 - margin && x < es.maxX + 60 + margin
        && z > es.minZ - 40 - margin && z < es.maxZ + 40 + margin) return true;
      // 荆河
      if (Math.abs(x - OUTSKIRTS.river.x) < OUTSKIRTS.river.width + 20 + margin && z < OUTSKIRTS.river.turnZ) return true;
      // 城外几处建筑的找平台地（Script_TengxianCity 的 OUTER_PADS）
      const pp = WEST_SUBURB.powerPlant, st = WEST_SUBURB.station;
      if (Math.abs(x - pp.x) < pp.w / 2 + 38 + margin && Math.abs(z - pp.z) < pp.d / 2 + 38 + margin) return true;
      if (Math.abs(x - st.x) < st.w / 2 + 42 + margin && Math.abs(z - st.z) < st.d / 2 + 40 + margin) return true;
      for (const l of OUTER_LANDMARKS) {
        const r = (l.w ? Math.max(l.w, l.d) / 2 : 30) + 26 + margin;
        if (Math.hypot(x - l.x, z - l.z) < r) return true;
      }
      for (const f of OUTSKIRTS.hollowForts) {
        if (Math.hypot(x - f.x, z - f.z) < 26 + margin) return true;
      }
    }
    // 出生点与路标附近留空：开局卡在坟头里、路标进不去，都是事故
    for (const f of this.spec.foci) {
      if (Math.hypot(x - f[0], z - f[1]) < 12 + margin) return true;
    }
    // 自己铺的路上不许长东西（行道树是**故意**栽在路边的，它自己跳过这一条）
    if (!skipRoad) for (const road of this.spec.roads || []) {
      if (this.DistanceToPolyline(x, z, road.points) < road.width / 2 + 3 + margin) return true;
    }
    // 河道里、路基上也不许
    const rv = this.spec.river;
    if (rv && x >= rv.fromX - 20 && x <= rv.toX + 20) {
      if (Math.abs(z - this.RiverCenterZ(x)) < rv.bedHalf + Math.abs(rv.south.offset) + 8 + margin) return true;
    }
    const rw = this.spec.railway;
    if (rw && z >= rw.fromZ - 10 && z <= rw.toZ + 10 && Math.abs(x - rw.x) < 12 + margin) return true;
    return false;
  }

  DistanceToPolyline(x, z, points) {
    let best = 1e9;
    for (let i = 0; i < points.length - 1; i += 1) {
      const [x0, z0] = points[i], [x1, z1] = points[i + 1];
      const dx = x1 - x0, dz = z1 - z0;
      const len2 = dx * dx + dz * dz || 1;
      const t = Clamp01(((x - x0) * dx + (z - z0) * dz) / len2);
      const d = Math.hypot(x - (x0 + dx * t), z - (z0 + dz * t));
      if (d < best) best = d;
    }
    return best;
  }

  /** 河心线：直河一眼假，给一点蜿蜒。公式在模块级（宿主也要用同一条）。 */
  RiverCenterZ(x) { return RiverCenterAt(this.spec.river, x); }

  // =========================================================================
  /** 分帧生成。用法与 TengxianCity.BuildSteps 一致。 */
  *BuildSteps() {
    if (!this.active) return;
    const rnd = Mulberry32(this.seed ^ HashString(this.spec.id));

    yield { label: "城外：河道与河堤", progress: 0.10 };
    this.BuildRiver(rnd);

    yield { label: "城外：土坎与散兵胸墙", progress: 0.30 };
    this.BuildBanks(rnd);
    this.BuildParapets(rnd);
    this.BuildCraters();

    yield { label: "城外：坟头与光秃乔木", progress: 0.50 };
    this.BuildGraves(rnd);

    yield { label: "城外：麦田斑块与田埂", progress: 0.66 };
    this.BuildFields(rnd);

    yield { label: "城外：大车路与津浦路路基", progress: 0.80 };
    this.BuildRoads(rnd);
    this.BuildRailway(rnd);

    yield { label: "城外：村落轮廓", progress: 0.90 };
    this.BuildVillages(rnd);
    this.BuildTrees(rnd);

    yield { label: "城外：合批", progress: 0.97 };
    const opts = { resolve: ResolveOutfieldMaterial };
    for (const m of this.sink.Flush(this.scene, this.library, opts)) this.meshes.push(m);
    for (const m of this.groundSink.Flush(this.scene, this.library,
      { ...opts, castShadow: false })) this.meshes.push(m);
    for (const m of this.farSink.Flush(this.scene, this.library,
      { ...opts, castShadow: false })) this.meshes.push(m);
    this.colliders = this.sink.colliders
      .concat(this.groundSink.colliders, this.farSink.colliders);
    this.covers = this.sink.covers.concat(this.farSink.covers);
  }

  // =========================================================================
  // 构件
  // =========================================================================

  /**
   * 一条土垄（河堤／土坎／田埂共用）。
   *
   * 碰撞是**四级台阶**，不是一个大盒子：
   * 每级 ≤ 0.56 m 正好落在 Script_Player.MoveWithCollision 的自动抬腿档内，
   * 人沿着可见的斜面一级一级走上去，而不是在坡脚撞上一堵隐形墙。
   * 每级的外沿都压在可见斜面那条直线上（hz 从 baseHalf 线性收到 topHalf），
   * 所以「看到的坡」与「踩到的坡」是同一个东西。
   */
  AddBank(sink, {
    from, to, height, baseHalf, topHalf, material = "FieldEarth", crest = null,
    seed = "bank", tag = "kan", gaps = [], segLen = 7.0, colliderEvery = 13,
    steps = 4, jitter = 0.16, cover = true, sector = true,
  }) {
    const rnd = Mulberry32(HashString(seed));
    const dx = to[0] - from[0], dz = to[1] - from[1];
    const total = Math.hypot(dx, dz);
    if (total < 1) return;
    const ux = dx / total, uz = dz / total;
    const ry = Math.atan2(-uz, ux);
    const nx = -uz, nz = ux;                       // 垂直于走向（缺口偏移用）
    // **缺口一律按「主轴的世界坐标」给**：东西向的垄按 x，南北向的按 z。
    // 用沿线距离给的话，河堤那种一段一段拼出来的线每段的原点都不同，
    // 缺口就会跟着段落漂移 —— 那是写这一层时最容易踩的坑。
    const along = Math.abs(ux) >= Math.abs(uz)
      ? (s) => from[0] + ux * s
      : (s) => from[1] + uz * s;
    const InGap = (s0, s1) => gaps.some(([a, b]) => along(s1) > a && along(s0) < b);
    // ① 可见几何。段长按总长整除，**不许留下除不尽的尾巴** ——
    // 河堤是 52 m 一块拼起来的，每块尾巴留 3 m 就是每 52 m 一个洞
    const nSeg = Math.max(1, Math.round(total / segLen));
    const segL = total / nSeg;
    for (let i = 0; i < nSeg; i += 1) {
      const s = i * segL, mid = s + segL / 2;
      const sx = from[0] + ux * mid, sz = from[1] + uz * mid;
      if (InGap(s, s + segL)) { rnd(); continue; }
      if (!this.InRegion(sx, sz)) { rnd(); continue; }
      const h = height * (1 + (rnd() - 0.5) * jitter);
      const wob = (rnd() - 0.5) * 0.5;
      const y = this.groundAt(sx + nx * wob, sz + nz * wob);
      if (sector) sink.SetSector(SectorKey(sx, sz));
      // 相邻段换色：一条一千米的堤全用一个色，实拍出来就是一根挤出来的塑料条
      const mat = (material === "FieldEarth" && rnd() < 0.42) ? "FieldEarthDark" : material;
      sink.Add(mat, PlaceGeometry(
        RidgePrism(segL * 1.04, h, baseHalf, topHalf, { u0: mid }),
        { x: sx + nx * wob, y, z: sz + nz * wob, ry }));
      // 垄顶那一道新翻的土（真阵地上土坎顶总有一条被踩/被挖出来的浅色带）
      if (crest && rnd() < 0.55) {
        sink.Add(crest, PlaceGeometry(
          MakeBox(segL * 0.9, 0.12, topHalf * 1.5, EARTH_TILE, `${seed}:c${i}`),
          { x: sx + nx * wob, y: y + h, z: sz + nz * wob, ry }));
      }
      if (sector) sink.SetSector("");
    }
    // ② 碰撞：四级台阶贴着可见斜面
    const nCol = Math.max(1, Math.round(total / colliderEvery));
    const colL = total / nCol;
    for (let i = 0; i < nCol; i += 1) {
      const s = i * colL, mid = s + colL / 2;
      const sx = from[0] + ux * mid, sz = from[1] + uz * mid;
      if (InGap(s, s + colL)) continue;
      if (!this.InRegion(sx, sz)) continue;
      const y = this.groundAt(sx, sz);
      const hx = Math.abs(ux) * colL / 2, hz0 = Math.abs(uz) * colL / 2;
      for (let k = 0; k < steps; k += 1) {
        const top = height * (k + 1) / steps;
        const half = baseHalf + (topHalf - baseHalf) * ((k + 1) / steps);
        const ax = hx + Math.abs(uz) * half, az = hz0 + Math.abs(ux) * half;
        sink.Solid(sx, y + top / 2, sz, ax, top / 2, az, tag);
      }
      if (cover) sink.Cover(sx + nx * (topHalf + 0.9), sz + nz * (topHalf + 0.9), height, nx, nz);
    }
    this.stats.banks += 1;
  }

  /** 电线杆。Script_World.AddPole 是照城内 y=0 写死的，城外地坪在 -1.2，得自己来。 */
  AddPoleAt(sink, x, z, seed, height = 6.2) {
    const y = this.groundAt(x, z);
    sink.Add("WoodBeam", PlaceGeometry(
      new THREE.CylinderGeometry(0.09, 0.14, height, 7), { x, y: y + height / 2, z }));
    sink.Add("WoodBeam", PlaceGeometry(
      MakeBox(1.5, 0.09, 0.09, TILE_METERS.wood, `${seed}:arm`), { x, y: y + height - 0.5, z }));
    sink.Solid(x, y + height / 2, z, 0.17, height / 2, 0.17, "prop");
  }

  // -------------------------------------------------------------------------

  /**
   * 界河／北沙河。
   *
   * **地形是解析式的平地**（Script_TengxianCity.OuterHeight 只有 ±0.25 m 的起伏，
   * 而 GroundHeight 是同一条解析式 —— 玩家、AI、子弹都按它走）。所以河道不是
   * 「往下挖」出来的，而是**两岸筑堤抬起来**的：河床是一条浅色沙砾带，
   * 两侧各一道 1.5—2.2 m 的土堤。从堤顶到河床落差就是 2 m 上下，
   * 战术上与下切河道等价（过河要翻堤、下河床、再翻对岸堤），而且不会出现
   * 「看到的地面」与「踩到的地面」两套答案。三月枯水，河心只剩一条浅流。
   */
  BuildRiver(rnd) {
    const rv = this.spec.river;
    if (!rv) return;
    const step = 26;
    const bed = [], water = [];
    for (let x = rv.fromX; x < rv.toX; x += step) {
      const x1 = Math.min(x + step, rv.toX);
      const cx = (x + x1) / 2;
      if (!this.InRegion(cx, this.RiverCenterZ(cx))) continue;
      const cz = this.RiverCenterZ(cx);
      const y = this.groundAt(cx, cz);
      const w = x1 - x;
      const half = rv.bedHalf * (0.88 + rnd() * 0.24);
      bed.push(PlaceGeometry(
        MakeBox(w * 1.04, 0.9, half * 2, TILE_METERS.ground, `bed${Math.round(cx)}`),
        { x: cx, y: y + 0.16 - 0.45, z: cz }));
      const wh = rv.waterHalf * (0.7 + rnd() * 0.6);
      water.push(PlaceGeometry(
        MakeBox(w * 1.04, 0.08, wh * 2, 6.0, `wat${Math.round(cx)}`),
        { x: cx, y: y + 0.20, z: cz + (rnd() - 0.5) * rv.bedHalf * 0.5 }));
    }
    if (bed.length) this.groundSink.Add("RiverSand", MergeGeometries(bed));
    if (water.length) this.groundSink.Add("ShallowWater", MergeGeometries(water));

    // 两岸的堤。分段跟着河心线蜿蜒走 —— 一条笔直的堤配一条弯河是穿帮的
    for (const side of ["north", "south"]) {
      const b = rv[side];
      if (!b) continue;
      const chunk = 52;
      for (let x = rv.fromX; x < rv.toX; x += chunk) {
        const x1 = Math.min(x + chunk, rv.toX);
        const z0 = this.RiverCenterZ(x) + b.offset;
        const z1 = this.RiverCenterZ(x1) + b.offset;
        this.AddBank(this.sink, {
          from: [x, z0], to: [x1, z1], jitter: 0.075,
          height: b.height, baseHalf: b.baseHalf, topHalf: b.topHalf,
          crest: side === "south" ? "FreshEarth" : null,
          seed: `${this.spec.id}:${side}:${Math.round(x)}`,
          tag: side === "south" ? "kan" : "embankment",
          gaps: b.gaps, cover: side === "south",
        });
      }
      // **堤上栽树。**「濠岸栽柳」在这一带是通例（Data_Tengxian 的护城河岸也是这么写的）。
      // 工程上它还救了一张图：站在出生点朝北，那道 2.2 m 的堤在 18 m 外是一整条
      // 没有任何断点的褐色横带 —— 实拍过，像一堵挤出来的墙。
      // 堤顶一排光杆树把那条横带打断，天际线才有东西。
      const pitch = b.treePitch || 26;
      const len = rv.toX - rv.fromX;
      for (let s = pitch * 0.5; s < len; s += pitch) {
        const x = rv.fromX + s;
        if (rnd() < 0.34) continue;
        const cz = this.RiverCenterZ(x) + b.offset;
        if (b.gaps.some(([a, c]) => x > a - 4 && x < c + 4)) continue;
        // 树根落在堤顶（baseY 给堤高）：碰撞盒因此悬在地面 1.5 m 以上，
        // NavGrid 按「悬在头顶」跳过，不会在堤上多刷一片死格
        this.AddOneTreeAtY(x, cz, this.groundAt(x, cz) + b.height * 0.95,
          `dike${side}${Math.round(x)}`, rnd);
      }
    }
  }

  /** 土坎（田坎）—— 平原上唯一的天然掩蔽线，L0 第二个路标就在它后面。 */
  BuildBanks() {
    for (const b of this.spec.banks || []) {
      this.AddBank(this.sink, {
        from: b.from, to: b.to, height: b.height,
        baseHalf: b.baseHalf, topHalf: b.topHalf, crest: "FreshEarth",
        seed: `${this.spec.id}:${b.id}`, tag: b.tag || "kan", gaps: b.gaps,
      });
    }
  }

  /**
   * 散兵胸墙与单人掩体。
   *
   * 川军出川时**工事器材几乎没有**，二线阵地是连夜用手刨出来的 ——
   * 所以这里做的不是齐整的战壕，是一段一段、高低不齐的土胸墙 + 掏出来的散兵坑
   * 翻在外面的浮土环。高 0.95—1.15 m：蹲着能完全遮住，站着露上半身。
   */
  BuildParapets(rnd) {
    for (const line of this.spec.parapets || []) {
      const seedRnd = Mulberry32(HashString(line.seed));
      let x = line.fromX;
      while (x < line.toX) {
        const len = 3.4 + seedRnd() * 3.6;
        const gap = 2.0 + seedRnd() * 5.0;
        const z = line.z + (seedRnd() - 0.5) * 7.0;
        if (x + len > line.toX) break;
        if (!this.Blocked(x + len / 2, z) && this.InRegion(x + len / 2, z)) {
          const h = 0.95 + seedRnd() * 0.22;
          const y = this.groundAt(x + len / 2, z);
          this.sink.SetSector(SectorKey(x, z));
          this.sink.Add("FieldEarth", PlaceGeometry(
            RidgePrism(len, h, 1.15, 0.5, { u0: x }), { x: x + len / 2, y, z }));
          this.sink.SetSector("");
          // 胸墙比人矮，一个盒子就够（0.95 m > 0.56 的自动抬腿档，是真掩体；
          // 又 < 2.25 m 的翻越上限，翻得过去 —— ER2 那种「可穿越掩体」）
          this.sink.Solid(x + len / 2, y + h / 2, z, len / 2, h / 2, 0.62, "parapet");
          this.sink.Cover(x + len / 2, z + 1.0, h, 0, 1);
          this.stats.parapets += 1;
        }
        x += len + gap;
      }
    }
    for (const p of this.spec.pits || []) {
      const pitRnd = Mulberry32(HashString(p.seed));
      const n = Math.round(p.count * this.density);
      for (let i = 0; i < n; i += 1) {
        const x = p.fromX + (p.toX - p.fromX) * ((i + 0.5) / n + (pitRnd() - 0.5) * 0.06);
        const z = p.z + (pitRnd() - 0.5) * 9;
        if (this.Blocked(x, z) || !this.InRegion(x, z)) continue;
        this.AddFoxhole(x, z, `${p.seed}:${i}`, pitRnd);
      }
    }
  }

  /** 单人掩体：刨出来的浮土在坑口围成一圈缺口朝后的马蹄。 */
  AddFoxhole(x, z, seed, rnd) {
    const y = this.groundAt(x, z);
    const r = 1.5 + rnd() * 0.4;
    const h = 0.9 + rnd() * 0.24;
    const arcs = 7;
    this.sink.SetSector(SectorKey(x, z));
    for (let i = 0; i < arcs; i += 1) {
      // 缺口朝南（我方后方），马蹄开口 ~100°
      const a = -Math.PI * 0.78 + (i / (arcs - 1)) * Math.PI * 1.56;
      const px = x + Math.sin(a) * r, pz = z - Math.cos(a) * r;
      const hh = h * (0.72 + rnd() * 0.5);
      this.sink.Add("FreshEarth", PlaceGeometry(
        MakeBox(1.05, hh, 0.66, EARTH_TILE, `${seed}:${i}`),
        { x: px, y: y + hh / 2 - 0.1, z: pz, ry: -a }));
    }
    this.sink.SetSector("");
    this.sink.Solid(x, y + h / 2, z - r, 1.3, h / 2, 0.5, "parapet");
    this.sink.Cover(x, z, h, 0, 1);
    this.stats.pits += 1;
  }

  /**
   * 坟头。
   *
   * 华北平原的耕地里到处是家族坟地：一堆 1.2—1.9 m 的土馒头，旁边一两棵光秃的树，
   * 讲究点的立一块矮碑。这是**这一关唯一遍布全场的天然掩体** ——
   * 「手榴弹经济 + 找掩体」这条玩法核心靠它落地，所以它必须是真碰撞体。
   */
  BuildGraves(rnd) {
    const n = Math.round((this.spec.graves?.clusters || 0) * this.density);
    const gRnd = Mulberry32(HashString(this.spec.graves?.seed || "grave"));
    const r = this.spec.region;
    let placed = 0;
    for (let i = 0; i < n * 6 && placed < n; i += 1) {
      const cx = r.minX + gRnd() * (r.maxX - r.minX);
      const cz = r.minZ + gRnd() * (r.maxZ - r.minZ);
      if (this.Blocked(cx, cz, 10)) continue;
      if (this.FocusDistance(cx, cz) > this.spec.fieldRadius) continue;
      placed += 1;
      const count = 3 + Math.floor(gRnd() * 5);
      this.sink.SetSector(SectorKey(cx, cz));
      for (let k = 0; k < count; k += 1) {
        const a = gRnd() * Math.PI * 2;
        const rr = gRnd() * 9 + 2;
        const x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr;
        if (this.Blocked(x, z, 2)) continue;
        const radius = 1.7 + gRnd() * 0.75;
        const h = 1.25 + gRnd() * 0.6;
        const y = this.groundAt(x, z);
        this.sink.Add("FieldEarth", PlaceGeometry(
          MoundGeometry(radius, h, `${this.spec.graves.seed}:${i}:${k}`), { x, y, z }));
        // 碰撞：比可见半径收一点（土馒头是圆的，盒子是方的，取内接才不会「隔空挡枪」）
        this.sink.Solid(x, y + h / 2, z, radius * 0.74, h / 2, radius * 0.74, "grave");
        this.sink.Cover(x, z, h, 0, 1);
        // 矮碑：只给最大的那一个
        if (k === 0 && gRnd() < 0.7) {
          this.sink.Add("DryStone", PlaceGeometry(
            MakeBox(0.52, 0.86, 0.13, TILE_METERS.stone, `stele${i}`),
            { x, y: y + 0.43, z: z + radius + 0.35, ry: (gRnd() - 0.5) * 0.3 }));
        }
        this.stats.graves += 1;
      }
      this.sink.SetSector("");
      // 坟地旁的老树（三月完全无叶）
      const treeN = 1 + Math.floor(gRnd() * 2);
      for (let k = 0; k < treeN; k += 1) {
        const x = cx + (gRnd() - 0.5) * 22, z = cz + (gRnd() - 0.5) * 22;
        if (this.Blocked(x, z, 2)) continue;
        this.AddOneTree(x, z, `${this.spec.graves.seed}:t${i}:${k}`, gRnd);
      }
    }
  }

  /**
   * 麦田斑块与田埂。
   *
   * MARCH_GROUND 是硬约束：冬小麦返青期苗高 15—30 cm，**贴地、不连续、露土率高**，
   * 大片农田仍是裸露褐土。所以这里**不铺满地的麦毯** ——
   * 裸土就是既有的那张地面网格本身（Ground 配方，鲁南褐土），
   * 麦子只是一块块 0.28 m 高的矮块撒在上面，一块地里再碎成几片，中间露土。
   * 田埂（0.3 m 的土埂）是平原上唯一的线条，没有它整片地读不出「这是耕地」。
   */
  BuildFields() {
    const spec = this.spec.wheat;
    if (!spec) return;
    const fRnd = Mulberry32(HashString(spec.seed));
    const r = this.spec.region;
    const wheat = [], wheatDry = [], balks = [], soilA = [], soilB = [];
    // **成片铺，不是随机撒。**
    // 第一版是「在范围里随机丢 128 块地」，实拍出来是 23% 的覆盖率 ——
    // 也就是四分之三的画面仍然是一整块没有任何线条的裸土，
    // 正是「一望无际的平地」那张截图。真实的华北耕地是一张**连续的镶嵌**：
    // 一块挨一块，块与块之间是田埂。所以改成按格子铺满，格心加抖动。
    // 地块长条形、长边南北向（鲁南平原的常见地权划分，推定）。
    const cw = spec.cellW || 38, cd = spec.cellD || 76;
    const nx = Math.ceil((r.maxX - r.minX) / cw);
    const nz = Math.ceil((r.maxZ - r.minZ) / cd);
    for (let ix = 0; ix < nx; ix += 1) {
      for (let iz = 0; iz < nz; iz += 1) {
        const cx = r.minX + (ix + 0.5) * cw + (fRnd() - 0.5) * cw * 0.2;
        const cz = r.minZ + (iz + 0.5) * cd + (fRnd() - 0.5) * cd * 0.2;
        if (this.FocusDistance(cx, cz) > this.spec.fieldRadius) continue;
        if (this.Blocked(cx, cz)) continue;
        const w = cw * (0.84 + fRnd() * 0.12);
        const d = cd * (0.86 + fRnd() * 0.12);
        const ry = (fRnd() - 0.5) * 0.1;
        // 地色：三档（不铺 = 原地表 / 犁过的浅褐 / 没犁的深褐）。
        // **地皮层压得比路和河床低**（顶面 +0.10，路 +0.22、河床 +0.16），
        // 这样地块压过路口时被路盖住，不会打架
        const tone = fRnd();
        if (tone > 0.3) {
          const box = PlaceGeometry(
            MakeBox(w, 0.9, d, TILE_METERS.ground, `fs${ix}:${iz}`),
            { x: cx, y: this.groundAt(cx, cz) + 0.07 - 0.45, z: cz, ry });
          (tone > 0.65 ? soilA : soilB).push(box);
        }
        // 田埂：两条长边。它是平原上唯一的线条，没有它整片地读不出「这是耕地」。
        //
        // **0.30 m 这个高度是玩法数，不是布景数**（spec.collide 开的那一关）：
        //   趴下：眼高 0.42 m、身体贴地 —— 平射来的步枪弹被这道棱吃掉；
        //   跪射：眼高 1.05 m、上半身整个露在棱上 —— 挡不住。
        // 这个高差就是「序·界河」的战术核心（手榴弹经济 + 找掩体），
        // 所以**必须是真碰撞体**。别随手抬到 0.6 m：那样跪着也安全，这一关就没了。
        //
        // 代价是可控的：0.30 < 0.56（Script_Player 的自动抬腿档 / NavGrid 的
        // stepOver 档），所以它既不绊人也不会在导航图上刷出死格 ——
        // 它只对**射线**（子弹与 AI 通视）有效，正是要的那一样。
        // 盒子按 12 m 分段：一条 70 m 长、带 0.05 rad 倾角的垄用一个 AABB 会胖到 3 m 宽。
        const collide = !!spec.collide;
        for (const sgn of [-1, 1]) {
          if (fRnd() < 0.28) continue;
          const bx = cx + Math.cos(ry) * (w / 2) * sgn;
          const bz = cz - Math.sin(ry) * (w / 2) * sgn;
          if (this.Blocked(bx, bz, 1)) continue;
          const bh = 0.26 + fRnd() * 0.12;
          balks.push(PlaceGeometry(
            RidgePrism(d, bh, 0.72, 0.26, { u0: cz }),
            { x: bx, y: this.groundAt(bx, bz), z: bz, ry: ry + Math.PI / 2 }));
          if (!collide) continue;
          // PlaceGeometry 的 ry 是绕 Y 转：局部 +X 落到 (cos, 0, -sin)，
          // 这里 ry' = ry + π/2，于是垄的走向是 (-sin ry, 0, -cos ry) —— 南北向
          const ux = -Math.sin(ry), uz = -Math.cos(ry);
          const n = Math.max(1, Math.round(d / 12));
          const segL = d / n;
          for (let k = 0; k < n; k += 1) {
            const t = -d / 2 + (k + 0.5) * segL;
            const sx = bx + ux * t, sz = bz + uz * t;
            const sy = this.groundAt(sx, sz);
            // 半宽比可见断面收一点（0.60 < 0.72）：土垄是有坡的，
            // 盒子取内接才不会在垄脚外「隔空挡枪」
            const hx = Math.abs(ux) * segL / 2 + Math.abs(uz) * 0.60;
            const hz = Math.abs(uz) * segL / 2 + Math.abs(ux) * 0.60;
            this.groundSink.Solid(sx, sy + bh / 2, sz, hx, bh / 2, hz, "balk");
            this.stats.balks += 1;
          }
        }
        // 冬小麦返青：**贴地、不连续、露土率高**（写景図第一）。
        //
        // 做成**条播的麦垄**，不是一整块绿地毯：一块地里几条窄垄，垄间露土，
        // 每条垄长短不一、两头不齐。第一版用一个大绿方块，实拍出来是「田里
        // 摆了一块绿色地砖」—— 苗高 15—30 cm 的返青麦看上去恰恰是**土多于绿**。
        if (fRnd() > (spec.wheatShare || 0.4)) continue;
        const rowW = 0.9 + fRnd() * 0.7;                 // 垄宽
        const pitch = rowW + 0.85 + fRnd() * 0.9;        // 垄距（垄间露土）
        const rows = Math.max(2, Math.floor((w * 0.9) / pitch));
        for (let k = 0; k < rows; k += 1) {
          const ox = -w * 0.45 + (k + 0.5) * pitch;
          const rd = d * (0.42 + fRnd() * 0.5);          // 每条垄长短不一
          const oz = (fRnd() - 0.5) * (d - rd) * 0.8;
          const px = cx + Math.cos(ry) * ox - Math.sin(ry) * oz;
          const pz = cz - Math.sin(ry) * ox - Math.cos(ry) * oz;
          if (this.Blocked(px, pz, 1)) continue;
          // 顶面 +0.26 m = 苗高的上沿；块体埋进地里 0.6 m，免得地表起伏时露出块底
          (fRnd() < 0.34 ? wheatDry : wheat).push(PlaceGeometry(
            MakeBox(rowW, 0.86, rd, TILE_METERS.ground, `wf${ix}:${iz}:${k}`),
            { x: px, y: this.groundAt(px, pz) + 0.22 - 0.43, z: pz, ry }));
        }
        this.stats.wheatPlots += 1;
      }
    }
    // 田边树：华北平原的田埂与大车路两侧成行栽杨柳，三月全是光杆。
    // **这是平原上唯一的竖线**，也是地平线不空的唯一来源
    this.PlantRowTrees(fRnd);
    if (soilA.length) this.groundSink.Add("FieldSoil", MergeGeometries(soilA));
    if (soilB.length) this.groundSink.Add("FieldSoilDark", MergeGeometries(soilB));
    if (wheat.length) this.groundSink.Add("WheatRow", MergeGeometries(wheat));
    if (wheatDry.length) this.groundSink.Add("WheatRowDry", MergeGeometries(wheatDry));
    if (balks.length) this.groundSink.Add("FieldEarth", MergeGeometries(balks));
    this.stats.soilPlots = soilA.length + soilB.length;
  }

  /**
   * 成行的田边树 —— 沿大车路两侧与几条田埂栽。
   *
   * 为什么单列一条：散撒的树在平原上永远读不出「有人种过地」，
   * 而一排等距的光杆杨树是华北平原最强的读图信号，也是地平线上唯一的节奏。
   */
  PlantRowTrees(rnd) {
    for (const road of this.spec.roads || []) {
      const pts = road.points;
      for (let i = 0; i < pts.length - 1; i += 1) {
        const [x0, z0] = pts[i], [x1, z1] = pts[i + 1];
        const len = Math.hypot(x1 - x0, z1 - z0);
        const ux = (x1 - x0) / len, uz = (z1 - z0) / len;
        const nx = -uz, nz = ux;
        const pitch = 13 + rnd() * 5;
        for (let s = pitch * 0.5; s < len; s += pitch) {
          for (const side of [-1, 1]) {
            if (rnd() < 0.3) continue;                 // 缺株（三月的乡道不会是行道树标本园）
            const off = (road.width / 2 + 2.4 + rnd() * 1.4) * side;
            const x = x0 + ux * s + nx * off, z = z0 + uz * s + nz * off;
            if (this.FocusDistance(x, z) > this.spec.fieldRadius + 160) continue;
            // skipRoad：这一批就是**行道树**，路的排他区对它不适用。
            // 不开这个口子的话它们全被 Blocked 的「路面 ±5.6 m 不许长东西」吃掉
            this.AddOneTree(x, z, `row${Math.round(x)}:${Math.round(z)}`, rnd, { skipRoad: true });
          }
        }
      }
    }
    // 几条田埂上的树行
    for (const line of this.spec.treeRows || []) {
      const pitch = line.pitch || 15;
      const len = Math.hypot(line.to[0] - line.from[0], line.to[1] - line.from[1]);
      const ux = (line.to[0] - line.from[0]) / len, uz = (line.to[1] - line.from[1]) / len;
      for (let s = 0; s < len; s += pitch) {
        if (rnd() < 0.22) continue;
        const x = line.from[0] + ux * s + (rnd() - 0.5) * 2.4;
        const z = line.from[1] + uz * s + (rnd() - 0.5) * 2.4;
        this.AddOneTree(x, z, `tr${Math.round(x)}:${Math.round(z)}`, rnd);
      }
    }
  }

  /**
   * 弹坑。
   *
   * 这一关的第一个节拍是连长那句「趴住。他们的炮先来，人后来」——
   * 阵地上没有炮坑，那句话就没有布景支撑。
   * 地形是解析式平地、挖不下去，所以炮坑做成**翻在外面的一圈浮土**
   *（真正的浅弹坑在地面上看到的也主要是这一圈），中心留空。
   */
  BuildCraters() {
    for (const c of this.spec.craters || []) {
      const cRnd = Mulberry32(HashString(c.seed));
      const n = Math.round(c.count * this.density);
      for (let i = 0; i < n; i += 1) {
        const x = c.fromX + (c.toX - c.fromX) * ((i + 0.5) / n + (cRnd() - 0.5) * 0.1);
        const z = c.z + (cRnd() - 0.5) * c.spread;
        if (this.Blocked(x, z, 2) || !this.InRegion(x, z)) continue;
        const y = this.groundAt(x, z);
        const radius = 2.0 + cRnd() * 2.4;
        const ring = 9;
        this.sink.SetSector(SectorKey(x, z));
        for (let k = 0; k < ring; k += 1) {
          const a = (k / ring) * Math.PI * 2 + cRnd() * 0.2;
          const h = 0.28 + cRnd() * 0.34;
          this.sink.Add("FreshEarth", PlaceGeometry(
            MakeBox(radius * 0.82, h, radius * 0.5, EARTH_TILE, `${c.seed}:${i}:${k}`),
            // ry 必须让浮土块**沿环的切线**躺下。写成 -a 是让它沿半径躺 ——
            // 实拍俯视图上是一朵八瓣的花，不是一圈坑沿
            { x: x + Math.cos(a) * radius, y: y + h / 2 - 0.08, z: z + Math.sin(a) * radius,
              ry: -(a + Math.PI / 2) }));
        }
        this.sink.SetSector("");
        this.stats.craters += 1;
      }
    }
  }

  /** 大车路：压实的土路 + 两道车辙。 */
  BuildRoads(rnd) {
    const quads = [];
    for (const road of this.spec.roads || []) {
      const pts = road.points;
      for (let i = 0; i < pts.length - 1; i += 1) {
        const [x0, z0] = pts[i], [x1, z1] = pts[i + 1];
        const len = Math.hypot(x1 - x0, z1 - z0);
        const segs = Math.max(1, Math.round(len / 24));
        for (let k = 0; k < segs; k += 1) {
          const t0 = k / segs, t1 = (k + 1) / segs;
          const ax = x0 + (x1 - x0) * t0, az = z0 + (z1 - z0) * t0;
          const bx = x0 + (x1 - x0) * t1, bz = z0 + (z1 - z0) * t1;
          const cx = (ax + bx) / 2, cz = (az + bz) / 2;
          if (!this.InRegion(cx, cz)) continue;
          const ry = Math.atan2(-(bz - az), bx - ax);
          quads.push(PlaceGeometry(
            MakeBox(Math.hypot(bx - ax, bz - az) * 1.06, 0.86,
              road.width * (0.92 + rnd() * 0.18), TILE_METERS.ground, `rd${Math.round(cx)}${Math.round(cz)}`),
            { x: cx, y: this.groundAt(cx, cz) + 0.22 - 0.43, z: cz, ry }));
        }
      }
    }
    if (quads.length) this.groundSink.Add("CartRoad", MergeGeometries(quads));
  }

  /**
   * 津浦铁路路基。
   *
   * 这条路是整场滕县战役的轴线（日军沿津浦路南压；界河那一天的两处阵地
   * 就叫「路西石墙」与「路东香城」）。路基做成 1.35 m 的道砟堤 + 枕木 + 双轨；
   * 堤身是真碰撞体（分段 + 道口留缺口，不然 NavGrid 会被它从南到北切成两半）。
   */
  BuildRailway(rnd) {
    const rw = this.spec.railway;
    if (!rw) return;
    const h = 1.35, topHalf = 3.4, baseHalf = 5.9;
    const bridgeHalf = rw.bridgeAtZ !== undefined ? 26 : 0;
    // 缺口按世界 z 给（AddBank 的约定：南北向的线按 z）。
    // 道口这一档必须留：一条从南到北不断的 1.35 m 路基会把 NavGrid
    // 沿 x=rw.x 切成两半 —— 那一侧的 AI 从此过不来。
    const gaps = [];
    for (const c of rw.crossings || []) gaps.push([c - 5.5, c + 5.5]);
    if (bridgeHalf) gaps.push([rw.bridgeAtZ - bridgeHalf, rw.bridgeAtZ + bridgeHalf]);
    const InGap = (z) => gaps.some(([a, b]) => z > a && z < b);

    this.AddBank(this.sink, {
      from: [rw.x, rw.fromZ], to: [rw.x, rw.toZ],
      height: h, baseHalf, topHalf, material: "Ballast",
      seed: `${this.spec.id}:rail`, tag: "embankment",
      gaps, segLen: 9, colliderEvery: 15, cover: false, jitter: 0.04,
    });

    // 枕木与钢轨。按分区分桶 —— 一条 1 km 的钢轨合成一个网格的话，
    // 视锥剔除对它完全失效，整条路每帧都要画满
    let ties = 0;
    for (let z = rw.fromZ; z < rw.toZ; z += 0.9) {
      if (InGap(z) || !this.InRegion(rw.x, z)) continue;
      const y = this.groundAt(rw.x, z) + h;
      this.sink.SetSector(SectorKey(rw.x, z));
      this.sink.Add("WoodBeam", PlaceGeometry(
        MakeBox(2.5, 0.16, 0.24, TILE_METERS.wood, `tie${Math.round(z * 10)}`),
        { x: rw.x + (rnd() - 0.5) * 0.06, y: y + 0.08, z }));
      this.sink.SetSector("");
      ties += 1;
    }
    for (const s of [-1, 1]) {
      for (let z = rw.fromZ; z < rw.toZ; z += 20) {
        const z1 = Math.min(z + 20, rw.toZ);
        const cz = (z + z1) / 2;
        if (InGap(cz) || !this.InRegion(rw.x, cz)) continue;
        const y = this.groundAt(rw.x, cz) + h;
        this.sink.SetSector(SectorKey(rw.x, cz));
        this.sink.Add("RailSteel", PlaceGeometry(
          // 标准轨距 1.435 m（Data_Tengxian.WEST_SUBURB.railway.gauge）
          MakeBox(0.12, 0.15, z1 - z, TILE_METERS.steel, `rail${s}${Math.round(z)}`),
          { x: rw.x + s * 0.7175, y: y + 0.23, z: cz }));
        this.sink.SetSector("");
      }
    }
    this.stats.railM = Math.round(rw.toZ - rw.fromZ);
    this.stats.ties = ties;

    // 道口：一条压过道砟的车辙带（真实的乡道道口就是这样，路基在这里被压平）
    const xing = [];
    for (const c of rw.crossings || []) {
      if (!this.InRegion(rw.x, c)) continue;
      xing.push(PlaceGeometry(
        MakeBox(baseHalf * 2 + 10, 0.9, 7.0, TILE_METERS.ground, `xing${Math.round(c)}`),
        { x: rw.x, y: this.groundAt(rw.x, c) + 0.24 - 0.45, z: c }));
    }
    if (xing.length) this.groundSink.Add("CartRoad", MergeGeometries(xing));

    // 过河的铁路桥：桥台 + 钢梁。这一片最高的人造物，也是最强的地标
    if (rw.bridgeAtZ !== undefined && this.InRegion(rw.x, rw.bridgeAtZ)) {
      const y = this.groundAt(rw.x, rw.bridgeAtZ);
      this.sink.SetSector(SectorKey(rw.x, rw.bridgeAtZ));
      for (const s of [-1, 1]) {
        const az = rw.bridgeAtZ + s * (bridgeHalf - 3.5);
        const ay = this.groundAt(rw.x, az);
        this.sink.Add("DryStone", PlaceGeometry(
          MakeBox(8.0, h + 1.4, 7.0, TILE_METERS.stone, `abut${s}`),
          { x: rw.x, y: ay + (h + 1.4) / 2, z: az }));
        this.sink.Solid(rw.x, ay + (h + 1.4) / 2, az, 4.0, (h + 1.4) / 2, 3.5, "embankment");
      }
      const span = bridgeHalf * 2 - 7;
      this.sink.Add("RailSteel", PlaceGeometry(
        MakeBox(5.4, 0.55, span, TILE_METERS.steel, "deck"),
        { x: rw.x, y: y + h + 1.1, z: rw.bridgeAtZ }));
      for (const s of [-1, 1]) {
        this.sink.Add("RailSteel", PlaceGeometry(
          MakeBox(0.32, 2.0, span, TILE_METERS.steel, `truss${s}`),
          { x: rw.x + s * 2.6, y: y + h + 2.4, z: rw.bridgeAtZ }));
      }
      this.sink.SetSector("");
      this.sink.Solid(rw.x, y + h + 1.1, rw.bridgeAtZ, 2.7, 0.32, span / 2, "bridge");
    }

    // 站台（车站那一关才有）。0.82 m —— 低于自动抬腿档的两倍，一步能上去
    if (rw.platformAtZ !== undefined) {
      const z = rw.platformAtZ;
      const y = this.groundAt(rw.x + 6.2, z);
      this.sink.SetSector(SectorKey(rw.x, z));
      this.sink.Add("DryStone", PlaceGeometry(
        MakeBox(5.2, 0.82, 62, TILE_METERS.stone, "platform"),
        { x: rw.x + 6.2, y: y + 0.41, z }));
      this.sink.SetSector("");
      this.sink.Solid(rw.x + 6.2, y + 0.41, z, 2.6, 0.41, 31, "platform");
    }

    // 电线杆：沿路一排，平原上唯一的竖线节奏
    if (rw.poles) {
      for (let z = rw.fromZ + 30; z < rw.toZ; z += 62) {
        if (!this.InRegion(rw.x + 11.5, z)) continue;
        this.farSink.SetSector(SectorKey(rw.x, z));
        this.AddPoleAt(this.farSink, rw.x + 11.5, z, `pole${Math.round(z)}`);
        this.farSink.SetSector("");
      }
    }
  }

  /**
   * 村落轮廓。**只做体块剪影，不做可进入空间** ——
   * 城外的村子在这两关里是地平线上的参照物（两下店在北、北沙河镇在南、
   * 石墙在路西），玩家不会进去，做成院落是白花 draw call。
   */
  BuildVillages(rnd) {
    for (const v of this.spec.villages || []) {
      if (!this.InRegion(v.x, v.z)) continue;
      const vRnd = Mulberry32(HashString(`${this.spec.id}:${v.id}`));
      const sink = v.far ? this.farSink : this.sink;
      sink.SetSector(SectorKey(v.x, v.z));
      const n = Math.max(3, Math.round(v.count * this.density));
      for (let i = 0; i < n; i += 1) {
        const x = v.x + (vRnd() - 0.5) * v.w;
        const z = v.z + (vRnd() - 0.5) * v.d;
        const w = 8 + vRnd() * 9, d = 6 + vRnd() * 6;
        const eave = 2.4 + vRnd() * 0.5;              // 鲁南民居檐高 2.4—2.8（Data_Tengxian 的 houseDims）
        const y = this.groundAt(x, z);
        const ry = (vRnd() - 0.5) * 0.5;
        sink.Add("HouseBrick", PlaceGeometry(
          MakeBox(w, eave, d, TILE_METERS.brick, `${v.id}:${i}`, BRICK_UV_GRID),
          { x, y: y + eave / 2, z, ry }));
        // 硬山小青瓦：一条脊 + 两坡（远景只要读得出「中式硬山顶」的剪影）
        sink.Add("RoofTile", PlaceGeometry(
          MakeBox(w + 0.7, 0.22, d + 0.7, TILE_METERS.roof, `${v.id}:r${i}`),
          { x, y: y + eave + 0.11, z, ry }));
        sink.Add("RoofTile", PlaceGeometry(
          MakeBox(w * 0.94, 0.5, d * 0.44, TILE_METERS.roof, `${v.id}:rr${i}`),
          { x, y: y + eave + 0.36, z, ry }));
        if (!v.far) sink.Solid(x, y + (eave + 0.5) / 2, z, w / 2, (eave + 0.5) / 2, d / 2, "wall");
      }
      // 「石墙」：地名的由来 —— 一圈干垒石墙。真碰撞体
      if (v.stoneWall) {
        const hw = v.w / 2 + 8, hd = v.d / 2 + 8, wh = 1.45;
        for (const [ax, az, len, ry] of [
          [0, -hd, hw * 2, 0], [0, hd, hw * 2, 0],
          [-hw, 0, hd * 2, Math.PI / 2], [hw, 0, hd * 2, Math.PI / 2]]) {
          const segs = Math.max(2, Math.round(len / 9));
          for (let k = 0; k < segs; k += 1) {
            if (vRnd() < 0.18) continue;                 // 塌口
            const t = (k + 0.5) / segs - 0.5;
            const px = v.x + ax + Math.cos(ry) * t * len;
            const pz = v.z + az - Math.sin(ry) * t * len;
            const y = this.groundAt(px, pz);
            const hh = wh * (0.82 + vRnd() * 0.3);
            sink.Add("DryStone", PlaceGeometry(
              MakeBox(len / segs * 1.03, hh, 0.55, TILE_METERS.stone, `${v.id}:sw${k}${ax}${az}`),
              { x: px, y: y + hh / 2, z: pz, ry }));
            const hx = Math.abs(Math.cos(ry)) * len / segs / 2 + Math.abs(Math.sin(ry)) * 0.3;
            const hz = Math.abs(Math.sin(ry)) * len / segs / 2 + Math.abs(Math.cos(ry)) * 0.3;
            sink.Solid(px, y + hh / 2, pz, hx, hh / 2, hz, "wall");
            sink.Cover(px, pz, hh, Math.sin(ry), Math.cos(ry));
          }
        }
      }
      sink.SetSector("");
      this.stats.villages += 1;
      // 村边的树（华北村落总是被一圈树围着，三月全是光杆）
      const treeN = Math.round(5 * this.density);
      for (let i = 0; i < treeN; i += 1) {
        const a = vRnd() * Math.PI * 2;
        const rr = Math.max(v.w, v.d) * (0.55 + vRnd() * 0.3);
        this.AddOneTree(v.x + Math.cos(a) * rr, v.z + Math.sin(a) * rr,
          `${v.id}:t${i}`, vRnd);
      }
    }
  }

  /** 散在田间的乔木。三月**完全落叶**，只有光秃枝干（写景図第一）。 */
  BuildTrees() {
    const spec = this.spec.trees;
    if (!spec) return;
    const tRnd = Mulberry32(HashString(spec.seed));
    const r = this.spec.region;
    const n = Math.round(spec.count * this.density);
    let placed = 0;
    for (let i = 0; i < n * 5 && placed < n; i += 1) {
      const x = r.minX + tRnd() * (r.maxX - r.minX);
      const z = r.minZ + tRnd() * (r.maxZ - r.minZ);
      if (this.Blocked(x, z, 3)) continue;
      if (this.FocusDistance(x, z) > this.spec.fieldRadius + 120) continue;
      this.AddOneTree(x, z, `${spec.seed}:${i}`, tRnd);
      placed += 1;
    }
  }

  AddOneTree(x, z, seed, rnd, opts = {}) {
    if (!this.InRegion(x, z) || this.Blocked(x, z, 2, opts)) return;
    this.AddOneTreeAtY(x, z, this.groundAt(x, z), seed, rnd);
  }

  /** 指定根部标高的一棵（堤顶那一排要用）。 */
  AddOneTreeAtY(x, z, baseY, seed, rnd) {
    if (!this.InRegion(x, z)) return;
    this.farSink.SetSector(SectorKey(x, z));
    AddTree(this.farSink, {
      x, z, seed, scale: 0.95, material: "Willow",
      // 房屋的 2—3 倍（MARCH_GROUND.treeHeight = [7.0, 10.5]）。
      // leafless：AddTree 本来就不长叶片团，只有枝干 —— 与三月的写景図一致
      height: MARCH_GROUND.treeHeight[0]
        + rnd() * (MARCH_GROUND.treeHeight[1] - MARCH_GROUND.treeHeight[0]),
      baseY,
    });
    this.farSink.SetSector("");
    this.stats.trees += 1;
  }

  Dispose() {
    for (const m of this.meshes) {
      this.scene.remove(m);
      if (m.geometry) m.geometry.dispose();
    }
    this.meshes.length = 0;
    this.colliders = [];
    this.covers = [];
  }
}

/**
 * 城外这一份的推定值登记表 —— 与 Data_Tengxian.PRESUMED 同一套纪律：
 * **凡在这里登记的数，游戏内任何文本都不许说成史实。**
 *
 * 史料侧只有三样是硬的：
 *   ① 三月地表（全部乔木落叶、冬小麦贴地返青、露土率高）—— 日军 1938-03-16
 *      现场速写《写景図第一》，一手图像证据；
 *   ② 津浦铁路在滕县城以西（唐代县治自铁路西侧的蕃县故城「东移二里」）—— 主流记载；
 *   ③ 地名与相对位置（界河在城北、北沙河在城北、两下店在界河以北、
 *      石墙阵地在津浦路西、香城在路东、五里屯在城西）—— 主流记载。
 * 除此之外**城外这一片的每一个数都是推定**。
 */
export const PRESUMED_OUTFIELD = [
  { id: "outfieldRelocation", value: "L0/L1 就近借位",
    note: "界河真实位置在城北约 20 km、北沙河约 8 km；本作把这两片战场借位到城北 1.5 km / 城西 1.45 km 的原野上（既有做法，见 Data_Battle.TUNING.L0_Jiehe 原注：城外地面只铺到 1700 m）。相对方位保持史实（界河在北、玩家在津浦路西、南撤入城）" },
  { id: "jieheChannel", value: { centerZ: -1528, bedHalf: 19, waterHalf: 6.0, cut: 1.9, run: 7 }, unit: "m",
    note: "界河河道的位置与断面（北沙河那条同法，centerZ -482 / bedHalf 18）。三月枯水、河床沙砾裸露为鲁南季节河的常态推定，无实测断面。centerZ 是**照实拍量出来的**：河心线加蜿蜒项之后，南岸堤顶落在出生点 (0,-1470) 正北 17 m —— 第一版放在 -1552（堤顶离出生点 40 m），实拍时那道堤只是地平线上一条带子。cut/run 是槽的下切深度与坡长，只有独立场景（Script_JieheField）那一版有" },
  { id: "riverDike", value: { L0: { south: 2.2, north: 1.6 }, L1: { south: 2.05, north: 1.5 } }, unit: "m",
    note: "两岸河堤高度。**L1（宿主是城）那一条河不是下切的** —— 城的地形是解析式平地，濠外 700—1700 m 那张网格一格 200 m，刻不出河槽，所以河靠两岸筑堤表达。L0 拆成独立场景之后地表是自己铺的（河槽一带 3.2 m 一格），槽真下切 1.9 m，堤是槽肩上另加的。两版都 ≤ 2.25 m（Script_Player.VAULT_MAX_M），翻得过去" },
  { id: "nanAnTuKan", value: { z: -1262, height: 2.05 }, unit: "m",
    note: "土坎（第二路标 Kan 所在的那道田坎）。「界河南岸的土坎」为关卡设计稿的说法，具体位置、走向、高度全无载" },
  { id: "parapetForm", value: { height: [0.95, 1.17], length: [3.4, 7.0] }, unit: "m",
    note: "散兵胸墙与单人掩体的形制。川军工事器材缺乏、二线阵地连夜手刨为主流记载，断面尺寸无载" },
  { id: "graveMound", value: { radius: [1.7, 2.45], height: [1.25, 1.85] }, unit: "m",
    note: "田间坟头的尺寸与分布密度。华北平原耕地间遍布家族坟地为常识性地貌，滕县本地无实测" },
  { id: "railwayEmbankment", value: { height: 1.35, topHalf: 3.4 }, unit: "m",
    note: "津浦路路基断面。铁路在城西为主流记载（x=-1500 已在 Data_Tengxian 登记为推定），路基高度与道砟宽度无载" },
  { id: "l0RailwayX", value: 205, unit: "m",
    note: "**序关那一段路基的 x**。界河一段的真实线位不在本切片的量程内（城西正线 x=-1500，z 只到 ±900）。序关按史实的相对方位把路基放在玩家以东，使玩家处于「津浦路西」。两段几何永不同屏。205 而不是 415：雾在两百多米外把东西吃干净，摆在 415 m 外时「津浦路西」这半句副标题在画面上一帧都兑现不了" },
  { id: "villageSites", value: ["两下店方向", "石墙", "北沙河镇", "五里屯", "路口小店"],
    note: "村落只做体块剪影。地名与大致方位为主流记载，**具体坐标、规模、户数全为推定**；石墙那一圈干垒石墙是照地名做的形象推定，无形制资料" },
  { id: "fieldPlots", value: { cell: [36, 74], wheatShare: 0.42, soilShare: 0.7 }, unit: "m",
    note: "地块尺寸（L0 36×74 / L1 38×78 的抖动格）、长边南北向、返青地块占四成、地色分三档。**露土率高与麦苗贴地为写景図的一手图像证据**，具体比例与田块划分为推定" },
  { id: "wheatRows", value: { rowWidth: [0.9, 1.6], pitch: [1.75, 3.35], height: 0.22 }, unit: "m",
    note: "条播麦垄的垄宽、垄距与出土高度。苗高 15—30 cm 为写景図的一手证据；条播（而非撒播）与具体垄距为推定" },
  { id: "treeRows", value: "田埂树行 / 行道树 / 堤顶树",
    note: "成行的光杆乔木。**全部乔木完全落叶、树形高瘦直干分枝稀疏、高约房屋 2—3 倍为写景図的一手图像证据**（高度取 Data_Tengxian.MARCH_GROUND.treeHeight = 7.0—10.5 m）；成行栽植的位置、株距、缺株率全为推定" },
  { id: "balkCoverRole", value: { height: 0.30, collide: "L0 only" }, unit: "m",
    note: "**田埂挡子弹是玩法决定**，不是地貌考据：0.30 m 这条线卡在「趴下（眼高 0.42、身体贴地）挡得住平射步枪弹、跪射（眼高 1.05）挡不住」之间，是序关「手榴弹经济 + 找掩体」的战术核心。华北耕地间的土埂高度无实测。只有 L0 给碰撞盒（spec.wheat.collide），L1 那边仍然只是可见几何" },
  { id: "graveCoverRole", value: "坟头作掩体",
    note: "把田间坟头当掩体是**玩法决定**：这一关的核心是「手榴弹经济 + 找掩体」，平地上 2 m 以下的东西超过 50 m 就看不见（几何事实），所以中距离的掩蔽全靠坟头与树行。华北平原耕地间遍布家族坟地是常识性地貌，滕县本地无实测" },
  { id: "cartRoad", value: "L0 南北大车路 / L1 车站—电灯厂—西门土路",
    note: "L1 那条「西门外土路自 (-310,0) 向西」出自设计稿；L0 的南北大车路全为推定" },
];

export default TengxianOutfield;
