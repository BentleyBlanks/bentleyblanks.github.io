// 《台儿庄：血战滕县》分层地形材质的调参表。纯数据、零 three。
//
// 口径与实现见 docs/Data_TerrainLayers.md；着色器在 Script_TerrainMaterial.mjs。
// 方案对标 UE Landscape / Unity HDRP TerrainLit 那一族「splat 权重 + 高度混合 +
// 远近两套平铺 + 宏观变化」的地形材质，外加 IQ 的双采样随机偏移去重复。
//
// ## 为什么要有这张表（2026-09-17 远处马赛克）
// 第一关地面原来是**一张** 2 m 平铺的土壤图（Texture_MissionSoil*），同一张图在
// 342 × 732 m 的地块上重复约四百遍。近处看不出来，掠射角下远处就成了一排排横纹
// 加一层闪烁的颗粒：贴图边缘并不严格无缝（边缘处相邻像素差 0.095，图内 0.070），
// 法线与 AO 的高频细节在远处欠采样，顶点色里还叠着一条 17 m / 22 m 周期的正弦调色。

/**
 * 一套地形图层。数组下标就是纹理数组的层号，也是着色器里的权重顺序：
 *   0 FieldSoil   —— 底土（其余三层分完剩下的都归它）
 *   1 CartTrack   —— 车道、站台前的硬地（顶点权重 r）
 *   2 DryStubble  —— 开阔地上的枯草茬（顶点权重 b 给「允许长草」，再乘宏观噪声）
 *   3 SpoilEarth  —— 壕沟底与沟沿翻出来的新土（顶点权重 g）
 *
 * 每层字段：
 *   file         贴图词干：Texture/Texture_Terrain<file>{Base,Normal,Orh}.webp
 *                Base = sRGB 反照率；Normal = 切线空间 xy（z 在着色器里重建）；
 *                Orh = R 环境遮蔽 / G 粗糙度 / B 高度（地形没有金属，M 位换成高度）。
 *   tileM        近景平铺边长（米）
 *   farTileM     远景平铺边长（米）。与 tileM 取**非整数倍**，两套网格永远对不齐。
 *   normalScale  法线强度（近景满强度，远处再乘 DISTANCE.normalFar）
 *   heightOffset 高度混合时整层抬高/压低（0..1 高度单位）。车道压实，草茬与翻土更「高」。
 */
export const TERRAIN_SETS = Object.freeze({
  MissionPlain: Object.freeze({
    textureSize: 1024,
    version: "terrain20260928ground08",
    // 整体反照率倍率（线性）。**是亮度对齐旧地面的标定，不是美术旋钮**：旧 ORM 的 AO
    // 几乎是常数 0.75（烘焙时 R 下限 190），微阴影把它变成直射光约 −30%、间接光再 −18%；
    // 新图的 AO 是真实的腔体遮蔽（均值 0.87–0.93），同样的反照率画面整体亮 9.1%
    //（12 个俯视采样点、sky 像素逐位相同的条件下实测）。改图或改 AO 后按 docs 的亮度
    // 抽样重新标定。
    albedoScale: 0.87,
    // tint：线性反照率逐通道倍率（2026-09-28 对标参考图的冷灰棕：底土与草茬原图色相 38–43°、饱和度 0.36–0.40，
    // 参考图地面实拍色相 24–30°、饱和度约 0.2–0.28；亮度不变，只把偏黄压回灰褐）。新生成的车道与壕沟土已按
    // 目标色烘进贴图，tint 为 1。缺省 1。
    layers: Object.freeze([
      Object.freeze({ id: "FieldSoil", file: "FieldSoil", tileM: 2.0, farTileM: 11.3, normalScale: 0.9, heightOffset: 0,
        tint: Object.freeze([1, 1, 1.11]) }),
      Object.freeze({ id: "CartTrack", file: "CartTrack", tileM: 3.1, farTileM: 16.9, normalScale: 0.6, heightOffset: -0.08 }),
      Object.freeze({ id: "DryStubble", file: "DryStubble", tileM: 2.3, farTileM: 12.7, normalScale: 1, heightOffset: 0.1,
        tint: Object.freeze([1, 1, 1.125]) }),
      Object.freeze({ id: "SpoilEarth", file: "SpoilEarth", tileM: 2.1, farTileM: 11.9, normalScale: 1, heightOffset: 0.06 }),
    ]),
  }),
});

/**
 * 近景 / 远景两套平铺的距离混合（米，视点到像素）。
 *   farStart/farEnd   开始混入远景平铺 → 完全换成远景平铺。之后近景那几次取样整段跳过。
 *   normalNear/normalFarDistance/normalFar
 *                     法线强度从 normalNear 米起按 smoothstep 降到 normalFarDistance 米处的
 *                     normalFar 倍 —— 远处每个像素盖住几十个纹素，法线的方差本该表现成
 *                     粗糙度，而不是一粒粒高光（掠射角闪烁的一半来自这里）。
 *   aoFar             远处材质 AO 的保留比例（mip 早已平均过，再全额乘只会让远景发灰）。
 *   biplanarDistance  陡坡侧投影只在这个距离以内做（沟壁远处只剩几个像素）。
 *   contrastFadeStart/contrastFadeEnd/contrastFar
 *                     反照率对比度从起点按 smoothstep 收到终点处的 contrastFar 倍（均值不变）。
 */
export const TERRAIN_DISTANCE = Object.freeze({
  farStart: 9,
  farEnd: 34,
  normalNear: 6,
  normalFarDistance: 120,
  normalFar: 0.3,
  aoFar: 0.55,
  biplanarDistance: 45,
  // 反照率对比度远处淡出：把高频明暗往该层均值收。卵石、草梗这类高反差细节近看耐看，
  // 远处一个像素盖几十个纹素、各向异性过滤也平均不干净，就是一层闪烁的颗粒（底土换回
  // 旧卵石土之后实测远处 grain 从 0.056 回到 0.084，见 docs §5.1）。
  contrastFadeStart: 10,
  contrastFadeEnd: 50,
  contrastFar: 0.3,
});

/**
 * 宏观变化（UE Landscape 的 Macro Variation）：三档频率的值噪声乘到反照率上。
 *   scalesM      三档噪声的特征尺度（米）。故意取互质的量级，避开平铺边长的倍数。
 *   brightness   每档对亮度的调制幅度（±）
 *   warmth       最低频那档对色温的调制幅度（偏黄 ↔ 偏灰）
 *   damp         中频那档「潮湿斑」：压暗 + 降粗糙度的幅度
 */
export const TERRAIN_MACRO = Object.freeze({
  scalesM: Object.freeze([7.3, 31, 117]),
  brightness: Object.freeze([0.05, 0.075, 0.06]),
  warmth: 0.05,
  damp: 0.06,
});

/**
 * 草茬覆盖：顶点给的「允许长草」× 宏观噪声阈值。
 *   scaleM          噪声主尺度（米）
 *   breakupScaleM   打碎边缘的小尺度噪声（米）
 *   threshold       [起, 满] —— 噪声值落在这之间线性（smoothstep）长满
 */
export const TERRAIN_STUBBLE = Object.freeze({
  scaleM: 26,
  breakupScaleM: 4.1,
  threshold: Object.freeze([0.41, 0.67]),
});

/**
 * 图层混合。
 *   heightDepth   高度混合的过渡厚度（0..1 高度单位）。越小边界越硬、越像「土块压在草上」。
 *   antiTileScaleM 去重复噪声的尺度（米）：每隔这么远换一次整数偏移，交界处两份按高度交叉淡化。
 *   antiTileBands  噪声值切成几档偏移（IQ 原文用 8）。
 */
export const TERRAIN_BLEND = Object.freeze({
  heightDepth: 0.22,
  antiTileScaleM: 5.3,
  antiTileBands: 8,
});

/**
 * 车辙（2026-09-28 对标概念图 11 / 13 与分镜里的土路）。
 *
 * 地块顶点属性 `terrainLayers` 的第 4 个分量是「离最近一条带车辙道路中线的横向带符号距离
 * ÷ encodeRangeM」，夹在 ±1；不是路的地方写 1。WebGL 对缺的分量补 1，所以只有 3 个分量的
 * 旧几何（壕沟碎土、弹坑回退）自动等于「离中线 encodeRangeM 米」——落在车辙之外，不用改。
 * 横向距离在一条线段上对位置是线性的，0.75 m 网格插值是精确的；车辙截面在片元里算。
 *   halfGaugeM   两道车辙中心离路中线的距离（北方大车轮距约 1.4–1.5 m）
 *   halfWidthM   一道车辙的半宽
 *   depthM       车辙深度（只进法线，不改高度场与碰撞）
 *   wobbleM / wobbleScaleM  车辙沿路左右摆动的幅度与特征长度（车不是走直线）
 *   darken       车辙槽里压实湿泥额外压暗（线性反照率倍率的减量）
 *   roughness    车辙槽底被轮子压光后的粗糙度倍率
 *   fadeStartM / fadeEndM  远处淡出（槽宽 0.4 m，太远就是一条闪烁的细线）
 *   pixelFadeM   一个像素横向盖住多少米起开始淡出（抗锯齿，[起, 满]）
 */
export const TERRAIN_RUTS = Object.freeze({
  encodeRangeM: 4,
  halfGaugeM: 0.72,
  halfWidthM: 0.26,
  depthM: 0.06,
  wobbleM: 0.1,
  wobbleScaleM: 9.5,
  darken: 0.12,
  roughness: 0.72,
  fadeStartM: 45,
  fadeEndM: 95,
  pixelFadeM: Object.freeze([0.09, 0.2]),
});

/**
 * 湿泥与积水（2026-09-28）。对标 UE 地形常见的「水位 vs 材质高度」积水层：
 * 一张低频噪声给出每处的水位，材质高度（反照率数组 alpha / 壕沟 POM 高度）低于水位的像素
 * 才是水面，所以水洼边缘顺着土块走，不是一个个圆；水线以上 wetBand 内是湿痕。
 *   noiseScalesM  两档值噪声的尺度：水洼群 / 单个水洼的轮廓
 *   level / gain  水位 = (噪声 − level) × gain（高度单位 0..1；噪声均值约 0.5）
 *   flat          只在几何法线 y 落在 [起, 满] 以上的平地积水（坡上存不住水）
 *   soft          水线过渡宽度（高度单位）
 *   heightWeight  材质高度参与水线的比例（1 = 全额；卵石级起伏全额进来水线会碎成黑点）
 *   wetBand       水线以上多宽算湿痕（高度单位）
 *   site          各类地面的「会不会积水」：车道/场坪、壕沟与洼地底
 *   rutWater      车辙槽里水位抬高多少（水先流进车辙）
 *   lowWater      沟底/坑底（接触高度场里四周比它高）水位抬高多少
 *   lowRiseM      「凹度」：四个方向 1.2 / 3.2 m 处比这里高出的均值落在 [起, 满] 米之间线性算沟底
 *                 （只在壕沟补丁里有接触高度场；沟沿、抛土顶四周更低 → 不积水）
 *   damp          底湿度：车道压实泥面、沟底
 *   waterRough    水面粗糙度（地面材质开着 SSR，这个值下天空与人会被反射出来）
 *   wetRough      湿痕粗糙度倍率
 *   wetDarken     湿土压暗（线性反照率减量；湿黄土约为干时的 55–65%）
 *   waterDarken   积水再压暗（浑泥水仍透出土色：压太狠时阴影里的小水洼会成一个黑洞）
 *   wetSaturation 湿土饱和度增量（保亮度，按湿度线性加）
 */
export const TERRAIN_WATER = Object.freeze({
  noiseScalesM: Object.freeze([4.6, 1.7]),
  level: 0.56,
  gain: 4.2,
  flat: Object.freeze([0.965, 0.992]),
  soft: 0.05,
  heightWeight: 0.45,
  wetBand: 0.3,
  site: Object.freeze({ track: 1, trenchFloor: 1 }),
  rutWater: 0.8,
  lowWater: 0.55,
  lowRiseM: Object.freeze([0.2, 0.7]),
  damp: Object.freeze({ track: 0.28, trenchFloor: 0.6 }),
  waterRough: 0.05,
  wetRough: 0.62,
  wetDarken: 0.3,
  waterDarken: 0.25,
  wetSaturation: 0.3,
});

/**
 * 01–05 前沿湿泥区（2026-09-28 第二轮，对标过场分镜 03–06：沟壁、沟沿、土堆是深冷灰褐的湿泥，沟底积水、泥浆）。
 * 07 以后的交通沟对的是概念图 07（干一些的灰褐土壁），不进这个区。
 * 一个世界轴对齐矩形 + 羽化；区里的翻土（壕沟土壁 / 沟底 / 抛土、沟沿碎土块）乘 soilTint、整体变湿，沟底水位抬高。
 *   box          [minX, minZ, maxX, maxZ]（米）。北到前沿外，南停在 06 集结洼地以北（羽化完 z ≈ −108）
 *   featherM     羽化宽度
 *   soilTint     翻土层线性反照率逐通道倍率：压暗，并把画面里偏品红/橙的土拉回灰褐（在天光与调色之后量：
 *                分镜沟壁/沟底 色相 20–26°、饱和 0.18–0.23，见 docs/Data_TerrainLayers.md §9）
 *   wallDamp     区内翻土的底湿度（沟壁也是湿的：压暗、粗糙度降、饱和度升 —— TERRAIN_WATER 的湿痕那一套）
 *   floorWater   区内沟底的积水倍率（TERRAIN_WATER.site.trenchFloor 之上再乘）
 *   floorRaise   区内沟底水位额外抬高（高度单位）
 *   trackDamp    区内车道/场坪的底湿度
 *   rubble       开场布景的土皮 / 土堆 / 垫木土块（Script_OpeningSet 的 GroundRubble，贴图是 MissionSoil）：
 *                color = 线性颜色倍率（把 MissionSoil 的均色拉到区内湿泥的颜色），roughness = 湿泥粗糙度
 */
export const TERRAIN_MUD_ZONE = Object.freeze({
  box: Object.freeze([-80, -250, 90, -116]),
  featherM: 8,
  soilTint: Object.freeze([0.56, 0.66, 0.64]),
  wallDamp: 0.9,
  floorWater: 2.2,
  floorRaise: 0.5,
  trackDamp: 0.5,
  rubble: Object.freeze({ color: Object.freeze([0.26, 0.3, 0.27]), roughness: 0.55 }),
});

/**
 * 地表图层怎么读白盒地形修饰（Data_FirstLevelWhiteboxTerrain 的形状；
 * 只改 SampleMissionGroundSurface 的权重输出，不碰高度）。
 *   wallSlope     形状最陡处坡度 1.5·dy/feather 超过它，羽化带（土壁）铺裸土 [起, 满]
 *   wallMinDyM    低于这个落差的形状不算土壁（路肩、下沉路）
 *   wallFadeM     土壁带向两侧淡出的宽度
 *   trenchHalfWM  折线「cut」形状核心半宽不超过它、又够陡，就按交通沟处理：沟底也铺裸土
 *   trenchSpillM  交通沟两侧再铺多宽（抛土）
 *   hollowDyM     「level」形状的 dy 低于它（下沉的洼地/场坪）：核心是踩实的场地（车道层），不是沟底
 *   hollowEdgeM   洼地核心从边缘往里多宽才完全是场地
 *   digTrackM     壕沟真实开挖深度在 [起, 满] 之间把车道权重收掉（沟切断了路，沟壁不画路面）
 */
export const TERRAIN_GROUND_SURFACE = Object.freeze({
  wallSlope: Object.freeze([0.45, 0.9]),
  wallMinDyM: 0.6,
  wallFadeM: 0.6,
  trenchHalfWM: 2.5,
  trenchSpillM: 1.1,
  hollowDyM: -0.8,
  hollowEdgeM: 0.6,
  digTrackM: Object.freeze([0.3, 0.8]),
});

/**
 * 画质分档（编译期，进 cache key）。
 *   antiTile   近景双采样去重复
 *   biplanar   陡坡侧投影（沟壁不再被俯视投影拉成竖条）
 *   aoIntensity 材质自带遮蔽的强度（与 MaterialLibrary.Get 的缺省 0.72 同口径）
 */
export const TERRAIN_QUALITY = Object.freeze({
  low: Object.freeze({ antiTile: false, biplanar: false }),
  medium: Object.freeze({ antiTile: true, biplanar: false }),
  high: Object.freeze({ antiTile: true, biplanar: true }),
  ultra: Object.freeze({ antiTile: true, biplanar: true }),
});
export const TERRAIN_AO_INTENSITY = 0.72;

/** 调试假彩色（`?terrainView=<号>`）。 */
export const TERRAIN_DEBUG_VIEWS = Object.freeze({
  wetness: 4,
  roughness: 5,
  terrainContact: 6,
  water: 7,     // 红车辙槽 / 绿积水 / 蓝湿痕（2026-09-28）
  weights: 1,   // 高度混合后的权重：红车道 / 绿草茬 / 蓝翻土 / 灰底土
  albedo: 2,    // 宏观变化之前的混合反照率
  normal: 3,    // 世界空间法线
});

/** 一套地形的三张图 URL（相对 Taierzhuang1938/）。 */
export function TerrainLayerUrls(setName) {
  const set = TERRAIN_SETS[setName];
  if (!set) throw new Error(`Unknown terrain set: ${setName}`);
  return set.layers.map((layer) => ({
    id: layer.id,
    base: `./Texture/Texture_Terrain${layer.file}Base.webp?v=${set.version}`,
    normal: `./Texture/Texture_Terrain${layer.file}Normal.webp?v=${set.version}`,
    orh: `./Texture/Texture_Terrain${layer.file}Orh.webp?v=${set.version}`,
  }));
}

/** 一档画质对应的地形分档；没登记的档位按 high。 */
export function TerrainQualityOf(quality) {
  return TERRAIN_QUALITY[quality] || TERRAIN_QUALITY.high;
}
