// 《台儿庄：血战滕县》地面脚印与痕迹（terrain trails）的调参表。纯数据、零 three。
//
// 口径与实现见 docs/Data_TerrainTrails.md。规则层 Script_TerrainTrailRules.mjs（纯 Node），
// GPU 痕迹靶与着色 Script_TerrainTrails.mjs，地形材质接入在 Script_TerrainMaterial.mjs /
// Script_TrenchSurfaceMaterial.mjs。
//
// ## 方案（对标 3A 的「痕迹渲染靶」）
// RDR2 的雪/泥、God of War 的雪、Batman: Arkham Origins 的雪、Horizon 的沙地都是同一族做法：
//   1. 以相机为中心的一张**世界空间俯视渲染靶**（这里 2 cm/纹素），寻址取模 —— 环形缓冲（toroidal），
//      窗口跟着相机滑动时不搬数据，只清掉新露出来的条带；
//   2. 脚落地那一下往靶里**盖一个鞋底印章**（带鞋纹的高度 + 挤出来的泥边 + 踩乱的一圈），
//      印章与印章之间取 MAX 混合 —— 同一个坑反复踩不会越挖越深；
//   3. 地形着色器按世界 xz 采这张靶：视差（POM）让坑有真实的深度、由高度差分出法线、
//      坑里压暗压光、积水按坑深往下灌；随时间整张靶按通道线性减淡（反向减法混合，一趟全屏）；
//   4. CPU 留一份印章历史，窗口滑回已经清掉的区域时按「当下该剩多少」重新盖回去。
// 印章的落点由动画真实的脚骨决定（脚踝离地高度 + 水平速度的着地判定），不是按时间估。
//
// 所有长度单位米，时间单位秒。

/**
 * 按画质分档。size = 渲染靶边长（纹素），texelM = 一纹素多少米，窗口边长 = size × texelM。
 * low 不建靶、材质也不编进采样（与 low「能跑就行」的定位一致）。
 * whitebox 默认画质跟随其底档（Data_Tuning_Whitebox 的 terrainTrails 开关只决定跑不跑）。
 *
 * 2 cm 一纹素：一只 27 cm 的草鞋约 13 × 5 纹素，鞋纹靠印章图集的 mip 取平均、坑的轮廓与泥边读得出来。
 * 2048² RGBA8 = 16 MB 显存，窗口 41 m（半径 20 m，脚印在 18 m 外已经淡掉）。
 */
export const TERRAIN_TRAIL_TIERS = Object.freeze({
  low: null,
  medium: Object.freeze({ size: 1024, texelM: 0.03, parallaxSteps: 6 }),
  high: Object.freeze({ size: 2048, texelM: 0.02, parallaxSteps: 8 }),
  ultra: Object.freeze({ size: 2048, texelM: 0.02, parallaxSteps: 10 }),
});

/** 一档画质的痕迹分档；没登记的档位按 high。 */
export function TerrainTrailTierOf(quality) {
  if (quality === "low") return null;
  return TERRAIN_TRAIL_TIERS[quality] || TERRAIN_TRAIL_TIERS.high;
}

/**
 * 窗口与衰减。
 *   recenterM    相机离窗口中心超过这么远才挪窗口（挪的时候按整纹素对齐）。每挪一次要清条带、
 *                回填历史；每帧挪一两个纹素也能跑，但画的次数多，不值当。
 *   edgeFadeM    窗口边上这么宽的一圈里脚印淡出（边界处不许有一刀切的线）。
 *   fadeM        [起, 满]：离相机这么远脚印淡出（法线与压暗一起淡，远处只剩一点湿痕色）。
 *   lifeS        每个通道从满强度退到 0 的秒数（线性；靶里每攒够 1/255 就整张减一次）。
 *                R 坑深 / G 泥边 / B 踩乱。坑能留很久（打一场仗，泥地上一直有来时的脚印），
 *                踩乱那一圈（颜色）干得快。
 *   history      CPU 印章历史：容量（环形，满了挤掉最老的）、只记相机这么远以内落下的印子
 *                （更远的地方没人看，也用不上 —— 窗口半径才 20 m）。
 */
export const TERRAIN_TRAIL_WINDOW = Object.freeze({
  recenterM: 0.6,
  edgeFadeM: 2.0,
  fadeM: Object.freeze([13, 18]),
  lifeS: Object.freeze([420, 420, 150]),
  history: Object.freeze({ capacity: 8192, recordWithinM: 60 }),
});

/**
 * 鞋底与其他印章（印章图集 Script_TerrainTrailRules.BuildStampAtlas 程序生成，一格 64 × 128，
 * 图上画的是**右脚**，左脚镜像）。lengthM / widthM 是印章在地上的实际尺寸。
 *
 * 1938 年 3 月滕县：川军草鞋、布鞋混穿（Data_History「脚上草鞋、布鞋混着穿」、Data_Meshes 的露趾草鞋），
 * 百姓千层底布鞋，日军钉了鞋钉的皮靴。三种鞋底在泥里的印子不一样，追踪痕迹时读得出是谁走过去的。
 *   straw   草鞋：编绳横纹 + 中间两道纵绳；露趾，脚尖前面按出五个趾头
 *   cloth   千层底布鞋：平底、密纳底针脚（一粒粒小凹点），边沿圆润
 *   boot    日军皮靴：更宽更长，前掌一片鞋钉点阵、后跟马蹄铁一圈
 *   knee    跪地的膝盖（椭圆，中间深）
 *   hand    手掌 / 手肘撑地
 *   drag    匍匐拖痕：身体、装具压过去的一长条（纵向条纹，两侧被推开的泥）
 *   scuff   打滑 / 落地的一团（圆，浅，踩乱为主）
 *   tread   战车履带一段：lengthM = 图样周期（4 块履带板 × 0.14 m 节距），横向履齿 + 中间导齿浅槽 + 两侧挤出的泥。
 *           沿履带每走一个 lengthM 盖一段，相邻两段的履齿落在同一套世界格子上，接起来是一条连续的履带印。
 */
export const TERRAIN_TRAIL_STAMPS = Object.freeze({
  straw: Object.freeze({ cell: 0, lengthM: 0.27, widthM: 0.105 }),
  cloth: Object.freeze({ cell: 1, lengthM: 0.265, widthM: 0.098 }),
  boot: Object.freeze({ cell: 2, lengthM: 0.29, widthM: 0.112 }),
  knee: Object.freeze({ cell: 3, lengthM: 0.13, widthM: 0.1 }),
  hand: Object.freeze({ cell: 4, lengthM: 0.12, widthM: 0.09 }),
  drag: Object.freeze({ cell: 5, lengthM: 0.62, widthM: 0.4 }),
  scuff: Object.freeze({ cell: 6, lengthM: 0.3, widthM: 0.24 }),
  tread: Object.freeze({ cell: 7, lengthM: 0.56, widthM: 0.32, pitchM: 0.14 }),
});

/** 印章图集的格子（像素）。一行 8 格。 */
export const TERRAIN_TRAIL_ATLAS = Object.freeze({ cellW: 64, cellH: 128, cells: 8 });

/**
 * 地面怎么「吃」印子。
 *   depthM / rimM  靶里满值（255）对应的坑深 / 泥边高。真实人脚在松土里 1–3 cm、湿泥里 3–6 cm。
 *   soft           逐地形层的软硬（乘在坑深、泥边上）：[底土, 车道硬地, 枯草茬, 翻土]。
 *                  车道被车马压实了只留浅浅一层；翻土最松。顺序同 Data_Tuning_Terrain.TERRAIN_SETS 层号。
 *   mudSoft        前沿湿泥区（Data_Tuning_Terrain.TERRAIN_MUD_ZONE）里再乘这么多：泥里的脚印最深。
 *   slope          [起, 满]：几何法线 y 在这之下不出脚印（沟壁、陡坡没人踩，靶是俯视的，不遮会竖着拉成条）。
 *   printDarken    坑底压暗（坑里是被压实、更潮的土）
 *   disturbDarken  踩乱一圈的压暗
 *   rimLighten     泥边稍亮（翻起来的干土块迎光）
 *   printRough     坑里粗糙度倍率的减量（压实、潮 → 更光一点）
 *   detailFlatten  坑里把地形贴图自带的细节法线压平多少（鞋底把土粒压平了）
 *   cavityAo       坑底材质 AO（只压间接光，同地形 AO 口径）
 *   waterPerM      坑深折成积水判据里的「高度单位」：Data_Tuning_Terrain.TERRAIN_WATER 的水线按
 *                  材质高度比，这里把坑深（米）换算过去。泥地里踩出的坑会自己汪一层水。
 *   maxSlope       高度场求出来的坡度上限（坑壁最陡 ~60°）
 */
export const TERRAIN_TRAIL_SURFACE = Object.freeze({
  depthM: 0.04,
  rimM: 0.012,
  soft: Object.freeze([0.8, 0.45, 0.6, 1.0]),
  mudSoft: 1.3,
  slope: Object.freeze([0.62, 0.82]),
  printDarken: 0.42,
  disturbDarken: 0.18,
  rimLighten: 0.06,
  printRough: 0.3,
  detailFlatten: 0.6,
  cavityAo: 0.5,
  waterPerM: 6,
  maxSlope: 1.7,
  // 硬地保底：颜色（压暗 / 泥边提亮 / AO）按 max(软硬, hardFloor) 算 —— 车道上坑只有几毫米，
  // 但鞋底压实的那一块颜色、鞋纹照样看得出（实拍干硬土路上的脚印就是这样读出来的）。
  hardFloor: 0.9,
  // 坑壁侧光增益：越硬的地坑越浅，法线的坡按 1 + wallLight × (1 − 软硬) 放大（只影响光）。
  wallLight: 1.6,
  // 坑里反照率往地层平均色收多少（0..1）：鞋底把碎石、土粒压平了 —— 碎石土路上脚印读得出来主要靠这一条。
  albedoFlatten: 0.85,
  // 视差：只在这么近以内做（米，[全强度, 关]），再远一个坑也就几个像素。
  parallaxM: Object.freeze([6, 10]),
});

/**
 * 印章的强度（写进靶的 [R 坑深, G 泥边, B 踩乱]，0..1）。人的动作决定压得多重。
 * 同一次落脚只盖一个印，同一处反复踩取 MAX。
 */
export const TERRAIN_TRAIL_STRENGTH = Object.freeze({
  walk: Object.freeze([0.85, 0.7, 0.8]),
  run: Object.freeze([0.95, 0.85, 0.9]),
  crouch: Object.freeze([0.85, 0.6, 0.75]),
  land: Object.freeze([1.0, 0.95, 1.0]),
  knee: Object.freeze([0.7, 0.5, 0.6]),
  hand: Object.freeze([0.45, 0.35, 0.5]),
  drag: Object.freeze([0.3, 0.45, 0.85]),
  scuff: Object.freeze([0.25, 0.2, 0.8]),
  // 战车十几吨压在两条履带上：坑深、泥边都顶满
  tread: Object.freeze([1.0, 1.0, 1.0]),
  // 跑起来脚跟蹬出去，印子往后拖长一点
  runLengthScale: 1.08,
});

/**
 * 士兵 / 百姓的着地判定（Script_TerrainTrailRules.FootContact，读动画后的真实脚骨）。
 *   withinM         离相机这么远以内的人才判（再远的印子落在窗口外，也看不见）
 *   refInitM        脚踝离地的初始参考高（1.68 m 身高的站姿踝高约 9 cm）
 *   refRangeM       参考高的上下限：比这还高说明脚下不是地形（楼板、踏板、车上），不出印
 *   refRelaxMps     参考高每秒往上松多少（跟着真实的踝高走，不被一次蹲姿钉死）
 *   enterM / exitM  踝高比参考高多出 enterM 以内算着地，高出 exitM 算抬脚（迟滞，防抖）
 *   plantMps        脚的水平速度在这之下才算踩实（拖着脚滑不算落脚）
 *   minSpacingM     同一只脚两个印至少隔这么远（原地转身、微调站位不反复盖）
 *   ankleT          脚踝在鞋底长度方向的位置（从脚跟起，0..1）；印章中心 = 踝 + 朝向 × (0.5 − ankleT) × 长
 *   kneeEnterM      膝盖离地这么低算跪下（膝盖骨点在关节中心，离地约半个膝盖厚）
 *   proneHipM       骨盆离地低于这个算趴着：只出拖痕，不判脚
 *   dragEveryM      趴着每挪这么远盖一段拖痕
 *   runMps          根速度超过这个按跑步的强度盖
 */
export const TERRAIN_TRAIL_CONTACT = Object.freeze({
  withinM: 32,
  refInitM: 0.09,
  refRangeM: Object.freeze([0.03, 0.16]),
  refRelaxMps: 0.02,
  enterM: 0.035,
  exitM: 0.075,
  plantMps: 0.7,
  minSpacingM: 0.14,
  ankleT: 0.22,
  kneeEnterM: 0.075,
  kneeExitM: 0.14,
  proneHipM: 0.32,
  dragEveryM: 0.36,
  runMps: 3.2,
});

/**
 * 第一人称玩家（看不见自己的脚骨）：按步距交替左右脚，落在身下两侧。
 *   strideM       各姿态一步多远（落一个印）；与 Data_Tuning_Audio.PLAYER_STEP 的听感步距同量级
 *   halfStanceM   左右脚离中线的横向距离
 *   aheadM        印子落在身体投影点前面多少（落脚在重心前）
 *   minMps        比这慢不出印（原地蹭）
 *   sole          玩家（川军）的鞋
 *   onGroundM     脚底离地形高度差在这之内才算踩在地形上（站在楼板、车上不出）
 */
export const TERRAIN_TRAIL_PLAYER = Object.freeze({
  strideM: Object.freeze({ walk: 0.72, run: 0.95, crouch: 0.55, prone: 0.36 }),
  halfStanceM: 0.1,
  aheadM: 0.12,
  minMps: 0.3,
  sole: "straw",
  onGroundM: 0.18,
});

/**
 * 履带车辆（Script_TerrainTrails.TrackVehicle 登记）。车体局部 −Z 是车头、+X 是右（项目契约 4）。
 *   trackWidthM     一条履带宽
 *   halfGaugeM      两条履带中线离车体中线多远；null = 登记时按车体包围盒量（半车宽 − 半履带宽）
 *   contactLengthM  履带着地长（车一停下，整段着地的地方都压着 —— 登记后第一次落在地形上时整段盖一遍）
 *   onGroundM       车体原点离地形高度差在这之内才算压在地上（在桥上、车皮上不出印）
 *   recordWithinM   离相机这么远以内都记进历史（履带印又大又持久：战车从远处开过去，玩家之后走到那条路上还要看得见；
 *                   人的脚印只记 60 m）
 *
 * 八九式乙型中战车：全宽 2.18 m、履带宽约 0.32 m、着地长约 3.6 m（公开资料的近似值，出处见 docs §5）；
 * 半轨距由模型包围盒量，不写死。
 */
export const TERRAIN_TRAIL_VEHICLES = Object.freeze({
  type89: Object.freeze({ trackWidthM: 0.32, halfGaugeM: null, contactLengthM: 3.6, onGroundM: 0.6, recordWithinM: 400 }),
});

/** 调试视图编号（接在 Data_Tuning_Terrain.TERRAIN_DEBUG_VIEWS 后面）：红坑深 / 绿泥边 / 蓝踩乱。 */
export const TERRAIN_TRAIL_DEBUG_VIEW = 8;
