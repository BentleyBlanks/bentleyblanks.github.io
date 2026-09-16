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
    version: "terrain20260917",
    // 整体反照率倍率（线性）。**是亮度对齐旧地面的标定，不是美术旋钮**：旧 ORM 的 AO
    // 几乎是常数 0.75（烘焙时 R 下限 190），微阴影把它变成直射光约 −30%、间接光再 −18%；
    // 新图的 AO 是真实的腔体遮蔽（均值 0.87–0.93），同样的反照率画面整体亮 9.1%
    //（12 个俯视采样点、sky 像素逐位相同的条件下实测）。改图或改 AO 后按 docs 的亮度
    // 抽样重新标定。
    albedoScale: 0.87,
    layers: Object.freeze([
      Object.freeze({ id: "FieldSoil", file: "FieldSoil", tileM: 2.0, farTileM: 11.3, normalScale: 0.9, heightOffset: 0 }),
      Object.freeze({ id: "CartTrack", file: "CartTrack", tileM: 3.1, farTileM: 16.9, normalScale: 0.6, heightOffset: -0.08 }),
      Object.freeze({ id: "DryStubble", file: "DryStubble", tileM: 2.3, farTileM: 12.7, normalScale: 1, heightOffset: 0.1 }),
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
