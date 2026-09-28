// 第一关白盒体块「画成什么」—— 语义 → 材质外观的唯一口径（纯数据，零 three）。
//
// 2026-09-28 3A 画面迭代 B1（建筑材质）：白盒体块原来是按语义上的平色
// `MeshStandardMaterial`，没有贴图、没有 AO/GI/细节补丁。现在每一块按下面三层解析成一个
// 「外观」（look），运行时（Script_FirstLevelWhiteboxLooks）照外观走材质库建 PBR 材质：
//   1. `WHITEBOX_LOOK_RULES`：按体块 id（和可选的语义）命中的特例 —— 门洞里的门板、
//      桥墩的条石、墙裙的青砖、土工事的夯土…… 先命中先用；
//   2. `WHITEBOX_SEMANTIC_LOOKS`：语义的缺省外观，多个时按「建筑组」哈希确定性地挑一个
//      （同一栋房子的四面墙挑到同一种，不会一面砖一面泥）；
//   3. 都没有就保持原来的平色（foliage 归 B6、ground 归地形）。
// 同一个外观 = 同一份材质 = 同一只合批网格；外观种类就是 draw call 的增量（口径见
// docs/Data_FirstLevelWhitebox0518Gap.md「2026-09-28 材质」）。
//
// 坐标、尺寸、碰撞、cover 语义一个不动；这里只决定「看起来」。
//
// 单位：`tileM` = 一张贴图在世界里铺多少米（白盒体块的 UV 是按世界米算的，见 Script_Geo.ScaleBoxUv）。
// 颜色：sRGB 十六进制，是乘在贴图反照率上的 tint，不是最终屏幕色。

/** 按需贴图的版本戳（改了图就改它；拼在 URL 的 ?v= 上）。 */
export const WHITEBOX_MATERIAL_VERSION = "b1wb20260928";

/**
 * 第一关按需加载的贴图套（开机清单 PBR_SETS 已满额，这几套只在建第一关时下）。
 * 下不到时退回 `fallback`（开机就有的配方/外部套）并改用外观里的 `fallbackTint`，
 * 建场不会因此卡住（每张图带超时，见 Script_Materials._LoadExternalImage）。
 * 源图、提示词、Lovart thread 与烘焙参数登记在 Data_TextureManifest（阶段 A 清单）。
 */
export const WHITEBOX_TEXTURE_SETS = Object.freeze({
  VillageMudPlaster: Object.freeze({ fallback: "Adobe",
    albedo: "./Texture/Texture_VillageMudPlasterBase.webp",
    normal: "./Texture/Texture_VillageMudPlasterNormal.webp",
    orm: "./Texture/Texture_VillageMudPlasterOrm.webp" }),
  VillageLimePlaster: Object.freeze({ fallback: "TemplePlaster",
    albedo: "./Texture/Texture_VillageLimePlasterBase.webp",
    normal: "./Texture/Texture_VillageLimePlasterNormal.webp",
    orm: "./Texture/Texture_VillageLimePlasterOrm.webp" }),
  VillageRoofTile: Object.freeze({ fallback: "GateRoofTile",
    albedo: "./Texture/Texture_VillageRoofTileBase.webp",
    normal: "./Texture/Texture_VillageRoofTileNormal.webp",
    orm: "./Texture/Texture_VillageRoofTileOrm.webp" }),
  VillageTimber: Object.freeze({ fallback: "HandcartWood",
    albedo: "./Texture/Texture_VillageTimberBase.webp",
    normal: "./Texture/Texture_VillageTimberNormal.webp",
    orm: "./Texture/Texture_VillageTimberOrm.webp" }),
  RailBallast: Object.freeze({ fallback: "GroundRubble",
    albedo: "./Texture/Texture_RailBallastBase.webp",
    normal: "./Texture/Texture_RailBallastNormal.webp",
    orm: "./Texture/Texture_RailBallastOrm.webp" }),
});

/**
 * 外观表。字段：
 *   set          材质库里的套名（WHITEBOX_TEXTURE_SETS 的键，或开机就有的配方/外部套）
 *   tileM        一张贴图铺多少米
 *   tint         乘在反照率上的 sRGB 色（缺省白）；`fallbackTint` = 退回 fallback 套时用的 tint
 *   normalScale / roughness / metalness   交给 MaterialLibrary.Get 的标量
 *   uv           "roof"：±y 面把瓦垄转到顺坡（沿盒子水平短边）；"grain"：木纹顺盒子最长边
 *   weather      风化补丁的总强度 0..1（墙根潮湿、檐下雨痕、棱角磨损、大尺度色斑、倒角）
 *   jitter       同一外观内按建筑组的明度抖动幅度（写进顶点色，不多一个材质）
 *   plain        无贴图的纯色件（门窗洞里的黑、电线）：{ color, roughness, metalness }
 */
export const WHITEBOX_LOOKS = Object.freeze({
  // 墙：泥抹面 / 青砖 / 白灰抹面（1938 鲁南村落三种主墙面，参考图 05/08/10/12/16）
  mudPlaster: Object.freeze({ set: "VillageMudPlaster", tileM: 2.8, tint: 0xecece4, fallbackTint: 0x958b7c,
    normalScale: 1.1, weather: 1, jitter: 0.09 }),
  // 白灰抹面的剥落斑铺得稀一点（3.6 m 一张）才不像一格格印上去的
  limePlaster: Object.freeze({ set: "VillageLimePlaster", tileM: 3.6, tint: 0xe2dfd8, fallbackTint: 0xb7b2a7,
    normalScale: 0.9, weather: 1, jitter: 0.07 }),
  // 青砖：BrickWall 底色是中灰，往暖灰拉一点（参考图 08 的砖是灰褐，不是蓝黑）
  greyBrick: Object.freeze({ set: "BrickWall", tileM: 1.2, tint: 0xe9e3d9, weather: 1, jitter: 0.08 }),
  gateBrick: Object.freeze({ set: "BrickWall", tileM: 1.1, tint: 0xd6d1c8, weather: 1, jitter: 0.06 }),
  // 县城城墙与瓮城（关尾北门夜景）：城砖
  cityBrick: Object.freeze({ set: "CityWallBrickPbr", tileM: 1.6, tint: 0xd8d4cc, weather: 1, jitter: 0.05 }),
  // 城楼的木构（旧漆木）
  paintedWood: Object.freeze({ set: "GatePaintedWood", tileM: 1.5, tint: 0xb0a898, uv: "grain", weather: 0.7, jitter: 0.05 }),
  // 墙裙：青砖砌的碱脚，比墙身暗
  brickPlinth: Object.freeze({ set: "BrickWallSooty", tileM: 1.2, tint: 0xc4c0b8, weather: 1, jitter: 0.05 }),
  // 土工事、土坎、倒塌的土堆（与地形的夯土同一口径的灰黄土色）
  earthWork: Object.freeze({ set: "Ground", tileM: 2.6, tint: 0xcfc4b0, normalScale: 1.0, weather: 0.6, jitter: 0.06 }),
  // 小青瓦（屋面、压顶、剖面屋顶板）
  roofTile: Object.freeze({ set: "VillageRoofTile", tileM: 2.0, tint: 0xe2e2e2, fallbackTint: 0x8f9190,
    normalScale: 1.2, uv: "roof", weather: 0.55, jitter: 0.07 }),
  // 风化灰褐木料（梁、柱、门窗框、檩条、枕木、木桥面）
  timber: Object.freeze({ set: "VillageTimber", tileM: 1.0, tint: 0xe6e2dc, fallbackTint: 0x9a8f80,
    uv: "grain", weather: 0.8, jitter: 0.1 }),
  // 旧门板（门洞里那块）
  doorLeaf: Object.freeze({ set: "ShopDoorPbr", tileM: 1.2, tint: 0x8e8478, weather: 0.8, jitter: 0.08 }),
  // 条石：桥墩、台阶、门槛、井台、石墙
  stone: Object.freeze({ set: "Stone", tileM: 1.4, tint: 0x9e998f, weather: 1, jitter: 0.07 }),
  ballast: Object.freeze({ set: "RailBallast", tileM: 1.5, tint: 0xeeeeee, fallbackTint: 0x8f8a82,
    weather: 0.3, jitter: 0.04 }),
  // 布、麻袋、帐篷
  canvas: Object.freeze({ set: "Sandbag", tileM: 0.9, tint: 0xb2aa94, weather: 0.5, jitter: 0.08 }),
  // 草垛、草棚（编织纹当草束）
  thatch: Object.freeze({ set: "WattleFence", tileM: 1.2, tint: 0xb8a47e, uv: "grain", weather: 0.5, jitter: 0.1 }),
  jar: Object.freeze({ set: "WaterVatCeramic", tileM: 0.8, tint: 0xd8d4cc, weather: 0.6, jitter: 0.06 }),
  // 桥梁钢件：涂过漆、生了锈的铆接钢板（不是枪管那种亮钢）
  steel: Object.freeze({ set: "CarriageCeilingSteel", tileM: 1.2, tint: 0x9c8f84, roughness: 1, metalness: 0.35,
    weather: 0.4, jitter: 0.04 }),
  // 钢桁架：盒子的两个大面按一节 panelM 画华伦式桁架（上下弦 + 斜腹杆 + 竖杆），其余镂空；
  // 镂空走 alphaTest（预通道与阴影都认 map 的 alpha），贴图是运行时画的，不下载
  steelTruss: Object.freeze({ set: "CarriageCeilingSteel", tileM: 1.2, tint: 0x9c8f84, roughness: 1, metalness: 0.35,
    uv: "truss", truss: Object.freeze({ panelM: 4.25, chordM: 0.32, memberM: 0.2 }), weather: 0.3, jitter: 0 }),
  wire: Object.freeze({ plain: Object.freeze({ color: 0x2d2e2c, roughness: 0.6, metalness: 0.4 }) }),
  voidDark: Object.freeze({ plain: Object.freeze({ color: 0x16140f, roughness: 0.96, metalness: 0 }) }),
});

/**
 * 语义的缺省外观。数组 = 按建筑组哈希的加权挑选（权重之和不必为 1）。
 * plaster / cover 是房屋与院墙的墙身：比例照参考图（村里泥抹面最多、青砖其次、白灰最少）。
 */
export const WHITEBOX_SEMANTIC_LOOKS = Object.freeze({
  plaster: Object.freeze([["mudPlaster", 0.42], ["greyBrick", 0.33], ["limePlaster", 0.25]]),
  cover: Object.freeze([["mudPlaster", 0.42], ["greyBrick", 0.33], ["limePlaster", 0.25]]),
  structure: Object.freeze([["gateBrick", 1]]),
  roof: Object.freeze([["roofTile", 1]]),
  coping: Object.freeze([["roofTile", 1]]),
  void: Object.freeze([["voidDark", 1]]),
  timber: Object.freeze([["timber", 1]]),
  earthDark: Object.freeze([["earthWork", 1]]),
  railBallast: Object.freeze([["stone", 1]]),
  canvas: Object.freeze([["canvas", 1]]),
  metal: Object.freeze([["steel", 1]]),
  step: Object.freeze([["stone", 1]]),
  missionRoute: Object.freeze([["timber", 1]]),
});

/**
 * 按 id 命中的特例（先命中先用）。`semantic` 缺省 = 任何语义。
 * 只认 id 的形状，不认坐标：体块挪了位置外观跟着走。
 */
export const WHITEBOX_LOOK_RULES = Object.freeze([
  // 门洞里那块是门板，窗洞里那块是黑的（Village Door()/Window() 的 Void 盒）
  { id: /Door\d+Void$/, look: "doorLeaf" },
  { id: /^MissionCourtyardGate$/, look: "doorLeaf" },
  // 铁路桥：条石墩台、木桥面；钢桁架走 metal 的缺省
  { id: /RailBridge(Pier|Abutment)/, look: "stone" },
  { id: /^(TemporaryBridge|RailBridgeDeck)$/, look: "timber" },
  { id: /RailBridgeWreckSpan/, look: "steel" },
  { id: /RailBridge(Wreck)?Truss/, look: "steelTruss" },
  // 台阶、门槛、窗台、井台、磨盘
  { id: /(Step\d*|Threshold|Bump)$/, semantic: /^(structure|step|plaster|cover)$/, look: "stone" },
  // 窗台：结构件的是石条；墙身语义的 WindowSill 是窗下那段墙，留给墙的外观
  { id: /Sill$/, semantic: /^(structure|step)$/, look: "stone" },
  { id: /Court(Mill|Well)|Mill(Stone)?$|Well$/, semantic: /^structure$/, look: "stone" },
  // 关尾北门：城墙、瓮城、垛口是城砖，城楼是旧漆木
  { id: /^Night(Wall|Barbican|CityMerlon|GateLintel|GateHaunch)/, look: "cityBrick" },
  { id: /^NightGateTower$/, look: "paintedWood" },
  // 接收院的病房（参考图 16）：屋里是刷过白灰的墙
  { id: /Ward/, semantic: /^(cover|plaster)$/, look: "limePlaster" },
  // 灶台、炕、烟囱：泥抹的
  { id: /Hearth|Stove|Kang(?!Mat)|Chimney/, semantic: /^(earthDark|plaster|structure|cover)$/, look: "mudPlaster" },
  // 墙裙（House() 的 Plinth）是青砖碱脚
  { id: /Plinth/, look: "brickPlinth" },
  { id: /Jar/, semantic: /^earthDark$/, look: "jar" },
  { id: /Wire|Strap|Rope/, semantic: /^(metal|canvas)$/, look: "wire" },
  { id: /Thatch|Haystack/, look: "thatch" },
  // 掩体里的箱子、担架摞、杂物
  { id: /Crate|Stores|Desk|Medicine/, semantic: /^(cover|structure|missionRoute)$/, look: "timber" },
  // 石墙、干砌乱石墙、碎砖
  { id: /StoneWall|VillageWall|FieldStone|Stones?\d*$/, semantic: /^(cover|plaster|structure|railBallast)$/, look: "stone" },
  { id: /Brick/, semantic: /^railBallast$/, look: "greyBrick" },
  { id: /Rubble|Chips|Spill|Bats/, semantic: /^(plaster|structure|cover)$/, look: "greyBrick" },
  // 前沿土工事：沟里的横墙、胸墙、土坎、弹坑沿、射击台
  { id: /Trench|Bay$|Parapet|Traverse|Mound|Ridge|Bank|Crater|Scrape|GunRest|GunSide|Lip$|Rally|Drain|Backslope|Spoil|Berm|Defense/,
    semantic: /^(cover|structure)$/, look: "earthWork" },
  // Layout Room() 的剖面屋顶板
  { id: /Roof$/, semantic: /^structure$/, look: "roofTile" },
]);

/** 铁路样条（Script_RoadSpline）直接用语义键进合批；它的 UV 单位是 TILE_METERS 的格子，不是米。 */
export const WHITEBOX_RAILWAY_LOOKS = Object.freeze({
  railBallast: Object.freeze({ look: "ballast", uvUnit: "ground" }),
  timber: Object.freeze({ look: "timber", uvUnit: "wood" }),
  metal: Object.freeze({ look: "steel", uvUnit: "steel" }),
});

/** 32 位 FNV-1a → [0,1)。确定性：同一个 id 每次建场挑到同一种。 */
export function WhiteboxHash01(text, salt = 0) {
  let h = (2166136261 ^ salt) >>> 0;
  const s = String(text);
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  // 末尾再搅一次：短 id 的低位不够乱
  h ^= h >>> 15; h = Math.imul(h, 2246822519) >>> 0; h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

/**
 * 建筑组：同一栋房子 / 同一道院墙的各段共用一个键（去掉末尾的方位、部件词与编号）。
 * `VillageEdgeHouseWest` → `VillageEdgeHouse`，`KitchenSouthLeft` → `Kitchen`。
 */
const GROUP_SUFFIX = /(North|South|East|West|Left|Right|Front|Back|Body|Wing|Low|High|Gable|Peak|Lintel|Top|Stub|Mid|Foot|Infill|Link|Window|Door|Screen|Half|Inner|Outer|Corner|End|Cap|\d|-|\.)+$/;
export function WhiteboxGroupKey(id) {
  const text = String(id || "");
  const key = text.replace(GROUP_SUFFIX, "");
  return key || text;
}

function PickWeighted(list, u) {
  let total = 0;
  for (const [, w] of list) total += w;
  let acc = 0;
  for (const [look, w] of list) {
    acc += w / total;
    if (u < acc) return look;
  }
  return list[list.length - 1][0];
}

/**
 * 一块体块（或 gate）该用哪个外观。返回外观名；null = 不归本表管（保持原平色）。
 * @param {{id:string, semantic?:string}} block
 */
export function ResolveWhiteboxLook(block) {
  const id = String(block?.id || "");
  const semantic = block?.semantic || "";
  for (const rule of WHITEBOX_LOOK_RULES) {
    if (!rule.id.test(id)) continue;
    if (rule.semantic && !rule.semantic.test(semantic)) continue;
    return rule.look;
  }
  const list = WHITEBOX_SEMANTIC_LOOKS[semantic];
  if (!list) return null;
  return list.length === 1 ? list[0][0] : PickWeighted(list, WhiteboxHash01(WhiteboxGroupKey(id), 0x51b1));
}

/**
 * 同一外观内按建筑组的明度 / 冷暖抖动（sRGB 乘子，写进顶点色）。
 * 幅度取外观的 `jitter`；冷暖只给明度的三分之一，不把灰墙抖成彩色。
 */
export function WhiteboxTint(block, look) {
  const amount = WHITEBOX_LOOKS[look]?.jitter ?? 0;
  if (!amount) return [1, 1, 1];
  const key = WhiteboxGroupKey(block?.id);
  const value = 1 + (WhiteboxHash01(key, 0x7a11) - 0.5) * 2 * amount;
  const warm = (WhiteboxHash01(key, 0x3c0d) - 0.5) * 2 * amount / 3;
  return [value * (1 + warm), value, value * (1 - warm)];
}
