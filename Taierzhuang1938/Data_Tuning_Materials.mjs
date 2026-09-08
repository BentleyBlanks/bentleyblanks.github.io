// 《台儿庄：血战滕县》材质着色升级的数值表（纯数据，零 three 依赖 —— 契约 2）。
//
// 这张表管的是「表面看起来是不是真的凹凸」，不是「这台机器画多重」：
//   · 画质档的开关与步数在 `Data_Tuning_Graphics.QUALITY_PRESETS`（pom / detailNormal
//     / microShadow / horizonOcclusion / skinSss / materialTexture）；
//   · **一种材质凹多深、细节法线铺多密、布是什么绒光**在这里。
// 两件事分开的理由与画质表抬头同一条：档位调低不该让青砖变成另一种砖。
//
// ## 单位
// `pomDepth` 是**米**，不是 uv。着色器按屏幕导数现算「一米有多少 uv」
// （`length(dFdx(uv)) / length(dFdx(viewPos))`），所以同一份深度值在任何 repeat、
// 任何物体缩放下都表示同样的物理起伏 —— 换 repeat 不用重调数。
// 青砖的灰缝实测凹进去 10–20 mm，所以砖墙是 0.016；瓦垄深一些，木板缝浅一些。
//
// ## 出处
//   · 灰缝/瓦垄/板缝深度 —— 鲁南旧墙的常见砌法尺寸（灰缝 10–20 mm、
//     小青瓦垄高 20–30 mm、门板企口 4–8 mm），与 `Script_TexBake` 各配方的
//     height 场对齐（那张图的 0→1 正好是「缝底→砖面」）。
//   · 微阴影 —— Chan 2018《Material Advances in Call of Duty: WWII》的
//     `saturate(NdotL + 2*ao*ao - 1)`；strength 是从 0 到 1 的混合量，不是替换。
//   · 地平线镜面遮蔽 —— Lagarde / Frostbite《Moving Frostbite to PBR》附录的
//     `horizonOcclusion`：`saturate(1 + fade * dot(R, Ng))` 平方。
//   · 皮肤预积分 —— Penner 2011《Pre-Integrated Skin Shading》；扩散剖面用
//     d'Eon 六高斯（单位 mm），LUT 的两轴是 NdotL 与曲率 1/r。
//   · 布料绒光 —— three r185 `MeshPhysicalMaterial` 的 Charlie sheen；
//     粗棉布/土布的 sheenRoughness 取 0.6–0.8（越糙绒光越散）。

/**
 * 逐配方的表面参数。`Script_Materials` 按配方名查这张表决定编哪几个 define。
 *
 *   pomDepth      视差起伏深度（米）。0 或缺席 = 不给这份材质编 POM。
 *   detailWeight  细节法线权重（0 关）。近距离淡入，见 DETAIL_NORMAL.fadeMeters。
 *   detailTile    细节法线相对主 uv 的频率倍数（6–10× 是"看得见颗粒但不出摩尔纹"的带）。
 *   microShadow   微阴影强度倍率（默认 1；金属件与布料压低，石材砖墙全量）。
 *   grime         烘焙期的污渍/尘土层强度（0 = 不加；见 Script_TexBake.GrimeLayer）。
 */
export const SURFACE_RECIPES = {
  // ——— 砖 / 石 / 土：全场面积最大的表面，POM 收益最高 ———
  BrickWall: { pomDepth: 0.016, detailWeight: 0.55, detailTile: 8, grime: 0.55 },
  BrickWallSooty: { pomDepth: 0.016, detailWeight: 0.55, detailTile: 8, grime: 0.75 },
  BuildingDamageEarly: { pomDepth: 0.018, detailWeight: 0.55, detailTile: 8, grime: 0.6 },
  BuildingDamageSevere: { pomDepth: 0.020, detailWeight: 0.6, detailTile: 8, grime: 0.7 },
  CityWallBrickPbr: { pomDepth: 0.022, detailWeight: 0.5, detailTile: 7, grime: 0.6 },
  CityWallCorePbr: { pomDepth: 0.018, detailWeight: 0.65, detailTile: 9, grime: 0.5 },
  CityWallStonePbr: { pomDepth: 0.020, detailWeight: 0.5, detailTile: 7, grime: 0.45 },
  GateBrick: { pomDepth: 0.018, detailWeight: 0.55, detailTile: 8, grime: 0.65 },
  StationBrick: { pomDepth: 0.014, detailWeight: 0.5, detailTile: 8, grime: 0.5 },
  PrisonBrick: { pomDepth: 0.014, detailWeight: 0.5, detailTile: 8, grime: 0.5 },
  Adobe: { pomDepth: 0.012, detailWeight: 0.7, detailTile: 9, grime: 0.5 },
  TemplePlaster: { pomDepth: 0.010, detailWeight: 0.7, detailTile: 9, grime: 0.45 },
  Stone: { pomDepth: 0.020, detailWeight: 0.5, detailTile: 7, grime: 0.4 },
  WellStone: { pomDepth: 0.022, detailWeight: 0.5, detailTile: 7, grime: 0.45 },
  Millstone: { pomDepth: 0.012, detailWeight: 0.5, detailTile: 7, grime: 0.4 },
  StoneWellOriginal: { pomDepth: 0.022, detailWeight: 0.5, detailTile: 7, grime: 0.45 },
  StoneMillOriginal: { pomDepth: 0.012, detailWeight: 0.5, detailTile: 7, grime: 0.4 },
  // ——— 瓦：垄深，掠射角下最能看出视差 ———
  RoofTile: { pomDepth: 0.024, detailWeight: 0.45, detailTile: 7, grime: 0.5 },
  GateRoofTile: { pomDepth: 0.026, detailWeight: 0.45, detailTile: 7, grime: 0.5 },
  // ——— 木：板缝浅，给一点就够；木纹靠细节法线 ———
  WoodDoor: { pomDepth: 0.006, detailWeight: 0.8, detailTile: 10, grime: 0.35 },
  GatePaintedWood: { pomDepth: 0.006, detailWeight: 0.7, detailTile: 10, grime: 0.4 },
  ShopDoorPbr: { pomDepth: 0.006, detailWeight: 0.8, detailTile: 10, grime: 0.4 },
  WoodBeam: { pomDepth: 0.005, detailWeight: 0.8, detailTile: 10, grime: 0.35 },
  WoodCrate: { pomDepth: 0.005, detailWeight: 0.7, detailTile: 10, grime: 0.3 },
  TreeBark: { pomDepth: 0.010, detailWeight: 0.9, detailTile: 10, grime: 0.3 },
  WattleFence: { pomDepth: 0.008, detailWeight: 0.8, detailTile: 10, grime: 0.3 },
  // ——— 地面：踩得最近、看得最斜，POM 在这里最值 ———
  Ground: { pomDepth: 0.014, detailWeight: 0.75, detailTile: 9, grime: 0.35 },
  GroundRubble: { pomDepth: 0.022, detailWeight: 0.7, detailTile: 9, grime: 0.4 },
  PloughedSoil: { pomDepth: 0.020, detailWeight: 0.75, detailTile: 9, grime: 0.3 },
  CraterScorched: { pomDepth: 0.018, detailWeight: 0.7, detailTile: 9, grime: 0.6 },
  Sandbag: { pomDepth: 0.010, detailWeight: 0.6, detailTile: 8, grime: 0.45 },
  // ——— 不给 POM 的：小件、金属、布，凹凸尺度小于一个像素，只吃细节法线 ———
  Steel: { detailWeight: 0.5, detailTile: 10, microShadow: 0.6 },
  SteelHelmet: { detailWeight: 0.5, detailTile: 10, microShadow: 0.6 },
  WoodStock: { detailWeight: 0.7, detailTile: 10 },
  HandcartWood: { detailWeight: 0.7, detailTile: 10, grime: 0.3 },
  CarriageBenchWood: { detailWeight: 0.7, detailTile: 10 },
  CarriageFloorSteel: { detailWeight: 0.5, detailTile: 10, microShadow: 0.6 },
  CarriageCeilingSteel: { detailWeight: 0.4, detailTile: 10, microShadow: 0.6 },
  ClothNra: { detailWeight: 0.6, detailTile: 10, microShadow: 0.7 },
  ClothIja: { detailWeight: 0.6, detailTile: 10, microShadow: 0.7 },
};

/** 表里没有的配方按这个走：不编 POM，只给一点细节法线。 */
export const SURFACE_DEFAULT = { pomDepth: 0, detailWeight: 0.35, detailTile: 9, microShadow: 1, grime: 0 };

/** 取一份配方的表面参数（缺省项补齐，调用方不用自己 ?? 一遍）。 */
export function SurfaceOf(name) {
  const entry = SURFACE_RECIPES[name] || null;
  return {
    pomDepth: entry?.pomDepth ?? SURFACE_DEFAULT.pomDepth,
    detailWeight: entry?.detailWeight ?? SURFACE_DEFAULT.detailWeight,
    detailTile: entry?.detailTile ?? SURFACE_DEFAULT.detailTile,
    microShadow: entry?.microShadow ?? SURFACE_DEFAULT.microShadow,
    grime: entry?.grime ?? SURFACE_DEFAULT.grime,
  };
}

/**
 * 视差遮蔽映射。
 *   fadeStartMeters / fadeEndMeters  距离淡出带：出了 fadeEnd 完全退回普通法线贴图
 *     （远处一个纹素早就小于一个像素，POM 只是在烧步数）。
 *   depthScale     全局深度倍率，画质面板那根旋钮乘在它上面。
 *   maxUvPerStep   单步 uv 位移上限。uv 导数在接缝/极端拉伸处会炸，
 *                  不钳的话一个像素能跑穿整张图，表现为墙上出现一条乱码带。
 *   shadowSteps    自阴影的行进步数（只有 ultra 编进去）。
 *   shadowSoftness 自阴影的软化：越大越像面光源，太小会出现硬边阶梯。
 */
export const POM = {
  fadeStartMeters: 9,
  fadeEndMeters: 15,
  depthScale: 1,
  maxUvPerStep: 0.02,
  shadowSteps: 8,
  shadowSoftness: 12,
  // 掠射角步数加权：正对表面用最少步数，掠射时用满（视差位移最大的地方最需要步数）。
  grazingBoost: 1,
};

/**
 * 细节法线（第二张高频微表面）。
 *   fadeMeters   完全淡出的距离；近于 nearMeters 时满强度。
 *   size         烘焙尺寸（一张就够，全场共用）。
 *   strength     全局权重，逐配方的 detailWeight 再乘上来。
 */
export const DETAIL_NORMAL = {
  nearMeters: 1.5,
  fadeMeters: 4.5,
  size: 256,
  strength: 0.85,
  seed: 20260907,
};

/**
 * 微阴影（Chan 2018）。`aperture = 2 * ao^2`，`shadow = saturate(NdotL + aperture - 1)`。
 * strength 是 0→1 的混合量：0 完全不压，1 完全按公式。0.85 是"砖缝在斜射光下
 * 真的出现细阴影，而正对光时几乎没有变化"的位置。
 */
export const MICRO_SHADOW = { strength: 0.85, minAo: 0.02 };

/**
 * 地平线镜面遮蔽（Lagarde）。fade 越大裁得越狠；1.3 时法线贴图凸起的背面
 * 不再漏出一圈亮高光，而正面几乎不受影响。
 * **与 GTAO 的弯曲法线镜面遮蔽是两件不同的事**：这一项裁的是「法线贴图的法线
 * 让反射向量钻到几何面之下」，只用本像素的两个法线，不需要任何屏幕空间信息；
 * 两者可以叠加（各自乘一次 radiance）。
 */
export const HORIZON_OCCLUSION = { fade: 1.3 };

/**
 * 皮肤预积分（Penner 2011）。
 *   lutWidth/lutHeight  LUT 尺寸；x = NdotL（−1→1），y = 曲率
 *   curvatureMin/Max    曲率轴的量程，单位 1/米（人头 ≈ 11，手指 ≈ 60）
 *   curvatureScale      从屏幕导数估出来的曲率再乘这个（蒙皮法线偏平，要提一点）
 *   strength            与纯 Lambert 的差值按这个混合进直射漫反射
 *   wrap                轻微 wrap：把 NdotL 往负方向借一点，明暗交界更软
 *   profile             d'Eon 六高斯扩散剖面：[方差 mm², r, g, b 权重]
 */
export const SKIN = {
  lutWidth: 128,
  lutHeight: 32,
  // LUT 的 y 轴是**散射半径（毫米）**，不是几何曲率。
  //
  // 为什么不用几何半径直接查：d'Eon 的剖面最宽一支方差 7.41 mm²（σ≈2.7 mm），
  // 在一颗 90 mm 的头上摊开只有 2.7/90 ≈ 0.03 弧度 —— 物理上没错（真人脸上
  // 那圈红边确实只有几毫米宽），但在 1080p 的游戏里落到三四个像素，等于白算。
  // 所有做预积分皮肤的引擎（UE 的 WorldUnitScale、Penner 原始 demo 的曲率轴）
  // 都在这里放大一次，把"几毫米"抬成"看得见的一条红边"。放大量就是 radiusScale。
  // 这是**有意的美术放大**，写在这里免得下一轮有人当 bug 修。
  radiusMinMm: 1.5,
  radiusMaxMm: 40,
  // 屏幕导数估出来的曲率单位是 1/米；乘这个再取倒数得到毫米半径。
  // 人头曲率 ≈ 11 /m → 半径 ≈ 4 mm，落在剖面真正起作用的那一段
  // （按几何半径 90 mm 直接查，LUT 那一行与纯 Lambert 差不到一个色阶 —— 实测过，
  //   那正是"预积分接上了但画面没变"的样子）。这一步就是上面说的美术放大。
  radiusScale: 22,
  // 积分步数：最窄那支高斯 σ≈0.08 mm，步长必须细到能采到它，
  // 否则 a=0 那一个样本独吞全部权重，LUT 退化成一张纯 Lambert（踩过）。
  integrationSteps: 1200,
  strength: 0.85,
  wrap: 0.12,
  profile: [
    [0.0064, 0.233, 0.455, 0.649],
    [0.0484, 0.100, 0.336, 0.344],
    [0.187, 0.118, 0.198, 0.000],
    [0.567, 0.113, 0.007, 0.007],
    [1.99, 0.358, 0.004, 0.000],
    [7.41, 0.078, 0.000, 0.000],
  ],
};

/**
 * 外部 GLB（人物 / 枪械 / 道具）材质的分类。**按材质名匹配**，因为卢沟桥那十套
 * 人物是混合 atlas，一个网格里就有布、皮肤和头发，只有材质名分得开。
 * 匹配到 skin 的走预积分 SSS，匹配到 cloth 的换 MeshPhysicalMaterial 加绒光，
 * 匹配到 metal 的加各向异性。都没匹配上的保持今天的 MeshStandardMaterial。
 *
 * 名字出处：`docs/Data_TechRenderPipeline.md` §16.1 记的那批实际材质名
 * （`John_All Body` / `战士5_头部` / `Material #1721585337` / `John_ Hair and Bread Mat`），
 * 加上导入战车与枪械的英文命名。命中不到时**什么都不做**是有意的：宁可少一层绒光，
 * 也不要把眼球或刺刀误判成棉布。
 */
export const EXTERNAL_MATERIAL_CLASSES = {
  skin: /(skin|face|head|hand|body|皮肤|脸|头部|手)/i,
  cloth: /(cloth|uniform|coat|fabric|cotton|jacket|trouser|puttee|军装|棉|布|衣|裤|绑腿)/i,
  metal: /(metal|steel|iron|barrel|bolt|bayonet|blade|sword|receiver|gun|rifle|枪|刺刀|刀|钢|铁)/i,
};

/** 分类命中后不再往下试的顺序：皮肤最专一，金属次之，布兜底。 */
export const EXTERNAL_MATERIAL_ORDER = ["skin", "metal", "cloth"];

/**
 * 布料绒光（three 的 Charlie sheen）。sheenColor 按布本身的色相取一份**去饱和后提亮**
 * 的版本 —— 绒光是纤维末梢的散射，颜色比布浅、比布白，但不是纯白（纯白一上就像塑料膜）。
 *   colorLift        往白拉多少（0 = 用布色，1 = 纯白）
 *   colorSaturation  绒光色的饱和度保留量
 *   sheen / roughness  three 的 material.sheen / sheenRoughness
 */
export const CLOTH_SHEEN = {
  sheen: 0.55,
  roughness: 0.72,
  colorLift: 0.55,
  colorSaturation: 0.35,
};

/** 枪械金属各向异性：沿枪管方向拉长高光。rotation 单位是弧度（0 = 沿切线 U）。 */
export const METAL_ANISOTROPY = { anisotropy: 0.5, rotation: 0, minRoughness: 0.28 };

/** 调试视图编号（`uMatDebugView`）。0 = 关。与 GI 的 uGiDebugView 各用各的。 */
export const MATERIAL_DEBUG_VIEWS = {
  pomOffset: 1,      // 视差位移量（uv 位移的像素长度，暖色 = 位移大）
  pomHeight: 2,      // 命中点的高度场（黑 = 缝底，白 = 表面）
  detailNormal: 3,   // 细节法线的切线空间 xy（灰底 = 无扰动）
  microShadow: 4,    // 微阴影因子（白 = 不压，黑 = 全压）
  skinCurvature: 5,  // 皮肤曲率（进 LUT 的那一轴）
};
