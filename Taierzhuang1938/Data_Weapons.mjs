// 《血战台儿庄》武器数据 —— 纯数据，**不许 import three**。
// 尺寸与性能取自 docs/Data_HistoryMaterial.md 的考据（带来源），
// 手感参数（recoil / sway / adsTime）是玩法调校值，不是史料。
//
// 一条设计底线：**中方装备必须参差**。第 2 集团军是杂牌，一个班里至少三种枪，
// 轻机枪每班 0—1 挺，子弹带大半是瘪的。把中正式做成制式统一装备就失真了。

/**
 * 后坐的两个字段（实测校出来的，别再拍脑袋改）：
 *   recoverS    —— 回落时间常数。实测原来的 0.42 s 意味着 95% 回稳要 1063 ms，
 *                  而中正式两发间隔才 1250 ms —— 只剩 190 ms 是"静止的"，
 *                  玩家读不到那截残留，只感到画面一直在缓慢往下淌。
 *   recoverFrac —— **保留多少残留。战地的答案是：一点都不留。**
 *
 *   这条我改错过一次，记在这里免得再犯。上一版按"留 28% 让玩家自己压"做，
 *   那是 CS / Valorant 的喷射弹道逻辑。战地的 datamine 数据说得很清楚：
 *   BF1/BFV 的栓动步枪**后坐永远回到零**，0.25—0.5 s 收干净，
 *   而两发间隔是 1.0—2.4 s —— **每一发都从同一个瞄准点开始**。
 *
 *   那它的"重量感"从哪来？从**回落曲线的形状**：
 *     Decrease ∝ RecoilTerm * RecoilDec * dt * TimeSinceLastShot^0.5
 *   t=0 时最后那一项是 0，所以回落**从零速率起步、然后加速** ——
 *   踢上去、悬住、加速归位。是这条曲线在卖那一枪，不是残留。
 *   （出处见 docs/Data_BattlefieldNumbers.md，sym.gg 的出货原值 + 公式）
 */
export const AMMO = {
  Mauser792: { label: "七九", caliber: "7.92×57mm", muzzle: 810 },
  Arisaka65: { label: "六五", caliber: "6.5×50mm", muzzle: 762 },
  Arisaka77: { label: "七七", caliber: "7.7×58mm", muzzle: 800 },
  Service9: { label: "九毫米", caliber: "9×19mm", muzzle: 350 },
};

/**
 * 持枪白刃的口径（大刀不走这张表，它有自己的 swingTimeS / damage）。
 *
 * 两个动作按**蓄力**区分：点按是挥砍（快、浅、砍不死一个满血兵），
 * 按住超过 chargeMinS 再松手是劈刺（慢、深、一下放倒一个 100 血的步兵）。
 * 没上刺刀（或这支枪装不了刺刀）时同一对输入退化成枪托横扫 / 蓄力重砸。
 *
 * damage 参照系：AI 步兵 health = 100（Script_Ai），日军拼刺对玩家的基准也是
 * 110（TryBayonet）。所以劈刺基伤 105 = 「劈刺见血封喉」，挥砍 90 = 两下，
 * 枪托 60 = 三下 —— 白刃的层级感全靠这三个数拉开，别调平。
 * thrust 的 reach 在 Combat 里还要加上这支枪的 bayonetLengthM（臂展 + 刀长）。
 */
export const GUN_MELEE = {
  bash: { damage: 60, reachM: 1.55, timeS: 0.50, arcDot: 0.55 },
  slash: { damage: 90, reachM: 1.85, timeS: 0.55, arcDot: 0.50 },
  thrust: { damage: 105, chargedBonus: 70, reachM: 1.70, timeS: 0.62, arcDot: 0.78 },
  // 按住多久算「蓄力劈刺」；蓄满（chargeMaxS）后 power = 1，不再涨
  chargeMinS: 0.30,
  chargeMaxS: 0.85,
};

/**
 * 武器表。
 * 几何尺寸单位为米，用于第一人称模型与人物手持模型的实际比例。
 * damage 是"命中躯干"的基准，Rules 层再按部位与距离修正。
 */
export const WEAPONS = {
  // --- 中方 -----------------------------------------------------------------
  ZhongZheng: {
    id: "ZhongZheng",
    name: "中正式",
    fullName: "中正式步骑枪（民国二十四年式）",
    side: "nra",
    kind: "boltRifle",
    ammo: "Mauser792",
    lengthM: 1.110, barrelM: 0.600, massKg: 4.0,
    magazine: 5, reloadKind: "stripper",     // 5 发桥夹自上方压入固定弹仓
    damage: 78, headMultiplier: 2.6, effectiveRangeM: 500,
    boltTimeS: 1.05,                          // 拉栓一次：抬-拉-推-闭
    fireIntervalS: 1.25,
    reloadTimeS: 3.4,
    recoil: { pitch: 2.9, yaw: 0.55, kick: 0.055, recoverS: 0.24, recoverFrac: 1.0 },
    swayScale: 1.0, adsTimeS: 0.28, adsFovScale: 0.72,
    spreadHipDeg: 2.6, spreadAdsDeg: 0.18,
    // HY1935 刺刀：全长约 572 mm、刃长约 428 mm —— 比汉阳造的 395 mm 长一截
    bayonet: true, bayonetLengthM: 0.428,
    note: "枪口初速 810 m/s，瞄准基线 503.5 mm。装填是桥夹压入，不是一发一发塞。",
  },
  HanYang: {
    id: "HanYang",
    name: "汉阳造",
    fullName: "汉阳八八式（老套筒）",
    side: "nra",
    kind: "boltRifle",
    ammo: "Mauser792",
    lengthM: 1.250, barrelM: 0.740, massKg: 4.06,
    magazine: 5, reloadKind: "stripper",
    damage: 74, headMultiplier: 2.6, effectiveRangeM: 400,
    boltTimeS: 1.18, fireIntervalS: 1.40, reloadTimeS: 3.8,
    recoil: { pitch: 3.1, yaw: 0.62, kick: 0.06, recoverS: 0.26, recoverFrac: 1.0 },
    swayScale: 1.12, adsTimeS: 0.32, adsFovScale: 0.74,
    spreadHipDeg: 3.0, spreadAdsDeg: 0.26,
    bayonet: true, bayonetLengthM: 0.395,
    note: "枪管外有薄套筒 —— 这是它区别于中正式的剪影特征。枪龄大，膛线磨得厉害。",
  },
  Zb26: {
    id: "Zb26",
    name: "捷克式",
    fullName: "ZB vz.26 轻机枪",
    side: "nra",
    kind: "lmg",
    ammo: "Mauser792",
    lengthM: 1.165, barrelM: 0.602, massKg: 10.5,
    magazine: 20, reloadKind: "topMag",       // 20 发弧形弹匣**上方**插入
    damage: 70, headMultiplier: 2.2, effectiveRangeM: 800,
    rpm: 500, fireIntervalS: 60 / 500, reloadTimeS: 3.0,
    recoil: { pitch: 0.85, yaw: 0.34, kick: 0.02, recoverS: 0.11, recoverFrac: 1.0 },
    swayScale: 1.35, adsTimeS: 0.40, adsFovScale: 0.80,
    spreadHipDeg: 4.2, spreadAdsDeg: 0.55, bipod: true,
    note: "全班就这一挺，弹匣从上面插。抛壳口在下方。第 2 集团军每班 0—1 挺。",
  },
  ServicePistol: {
    id: "ServicePistol",
    name: "军用手枪",
    fullName: "外购九毫米军用自动手枪",
    side: "nra",
    kind: "pistol",
    ammo: "Service9",
    lengthM: 0.222, massKg: 0.98,
    magazine: 8, reloadKind: "boxMag",
    damage: 38, headMultiplier: 2.2, effectiveRangeM: 50,
    fireIntervalS: 0.18, reloadTimeS: 2.2,
    recoil: { pitch: 1.35, yaw: 0.72, kick: 0.027, recoverS: 0.12, recoverFrac: 1.0 },
    swayScale: 0.72, adsTimeS: 0.17, adsFovScale: 0.86,
    spreadHipDeg: 3.2, spreadAdsDeg: 0.82,
    note: "少量外购军用自动手枪；不把 Poly Haven 的通用外形冒认成某一特定制式。",
  },
  Grenade: {
    id: "Grenade",
    name: "手榴弹",
    fullName: "巩县兵工厂木柄手榴弹（仿德 M24）",
    side: "nra",
    kind: "throwable",
    lengthM: 0.220, massKg: 0.50,
    magazine: 6,                               // 滕县日方记录：守军遗体旁约六发余
    damage: 130, radiusM: 6.5, fuseS: 4.2,
    throwSpeedMin: 14, throwSpeedMax: 26,       // 优秀士兵 40—50 m，高手 70—80 m
    cookable: true,
    note: "巩县兵工厂仿德式木柄弹；旋开底盖后拉火绳起爆。滕县日方记录川军士兵约携六发余，近距投弹是其主要火力。",
  },
  GrenadeBundle: {
    id: "GrenadeBundle",
    name: "集束手榴弹",
    fullName: "集束手榴弹（五至七枚去柄捆于一枚带柄弹）",
    side: "nra",
    kind: "throwable",
    lengthM: 0.24, massKg: 2.6,
    magazine: 2,
    damage: 620, radiusM: 4.2, fuseS: 3.6,
    throwSpeedMin: 8, throwSpeedMax: 13,
    armorPiercing: true,
    note: "仅供台儿庄战车关使用；滕县攻城阶段未配属战车或装甲车，关卡不得发放此项。",
  },
  Dadao: {
    id: "Dadao",
    name: "大刀",
    fullName: "西北军大刀",
    side: "nra",
    kind: "melee",
    lengthM: 0.90, bladeM: 0.625, massKg: 2.0,
    damage: 260, headMultiplier: 1.0,
    // 大刀不该像抡钝器一样拖：短蓄力后整刀在半秒内劈完，命中窗口仍由 Combat 管。
    swingTimeS: 0.50, reachM: 2.05,
    silent: true,
    note: "二十九军战刀式样：宽刃前展、上翘削尖、圆盘卡扣、缠柄、柄尾大铁环。"
      + "斜挎背在身后，右手过左肩抽出。AI 士兵按 seed 抽两种式样之一"
      + "（统一使用二十九军环首缠柄战刀模型）；"
      + "玩家同样按接替者 seed 随机抽取，拾取时保留尸体上那一式。",
  },

  // --- 卢沟桥资源包 ---------------------------------------------------------
  // 这几项是新增；Type11 则沿用原 id，只替换模型与材质。模型节点没给出
  // 可靠制式名的条目一律标作“型号尚待考证”，不从外形硬猜成史实型号。
  // 2026-09-05 按考据删掉五件不属于 1938 年 3 月的东西：Walther P38（1939 年才交付德军）、
  // Karabiner98k 与 MK98 系「待考证栓动步枪」（中国 5 万支 K98k 合同 1938 年 3 月才签、
  // 首批 4 月底到港，且两把模型机匣带皮卡汀尼导轨）、被误标成「高射炮」的 Bren Mk I 式
  // 轻机枪（英军 1938 年才列装，7.92 mm 版 1943 年才到华）、带两脚架的 50 mm 级轻迫击炮。
  // 依据见 docs/Data_HistoryMaterial.md「避坑清单」。
  OfficerSwordSet: {
    id: "OfficerSwordSet", name: "九八式军刀", fullName: "九八式军刀与刀鞘（按形制认领）",
    side: "ija", kind: "melee", lengthM: 1.0, massKg: 1.3, damage: 210,
    swingTimeS: 0.48, reachM: 1.95, silent: true,
    note: "源节点 Group146；缠柄、双环刀鞘与约 1 m 全长符合九四/九八式军刀，2026-09-06 按形制认领为九八式（军官佩刀）。",
  },
  RingPommelDagger: {
    id: "RingPommelDagger", name: "环首短刃", fullName: "带环首短刃（具体制式尚待考证）",
    side: "neutral", kind: "melee", lengthM: 0.45, massKg: 0.65, damage: 155,
    swingTimeS: 0.36, reachM: 1.45, silent: true,
    note: "源节点 Mesh_0300；按截图特征描述，不推断年代或军种。",
  },
  BrowningTripodAssembly: {
    id: "BrowningTripodAssembly", name: "勃朗宁三脚架组件", fullName: "勃朗宁式三脚架/机件组合（具体型号尚待考证）",
    side: "neutral", kind: "mortar", lengthM: 2.273, massKg: 30,
    note: "源节点 BROTRIPO009；仅加入台架预览，识别结论未定。",
  },
  UnidentifiedMunition: {
    id: "UnidentifiedMunition", name: "弹体", fullName: "弹体（具体型号尚待考证）",
    side: "neutral", kind: "mortar", lengthM: 0.253, massKg: 2.0,
    note: "源节点 Cylinder026；保留 WW-100heqdf 原贴图并附识别截图。",
  },
  MediumMortar: {
    id: "MediumMortar", name: "八二迫击炮", fullName: "民国二十年式八二迫击炮（按 Stokes-Brandt 外形认领）",
    side: "nra", kind: "mortar", lengthM: 1.444, massKg: 69,
    damage: 150, radiusM: 7.0, rangeMinM: 100, rangeMaxM: 2850,
    fireIntervalS: 7.0,
    note: "源节点 sphere3；Stokes-Brandt 式两脚架 + 圆座钣，2026-09-06 认领为民二十年式八二迫击炮：滕县城内守军有一个迫击炮连（张宣武）。放列全重 69 kg、实际射速 8—9 发/分、最大射程 2.85 km 取自 docs/Data_HistoryMaterial.md §1.6。日方九七式曲射步兵炮同为 Brandt 系，需要时可共用此模型。",
  },

  // --- 日方 -----------------------------------------------------------------
  Type38: {
    id: "Type38",
    name: "三八式",
    fullName: "三八式步枪",
    side: "ija",
    kind: "boltRifle",
    ammo: "Arisaka65",
    lengthM: 1.276, bayonetTotalM: 1.663, massKg: 3.73,
    magazine: 5, reloadKind: "stripper",
    damage: 72, headMultiplier: 2.6, effectiveRangeM: 460,
    boltTimeS: 1.15, fireIntervalS: 1.35, reloadTimeS: 3.5,
    aiAccuracy: 0.62, aiBurstMin: 1, aiBurstMax: 2, aiAimTimeS: 0.85,
    bayonet: true, bayonetLengthM: 0.51,
    note: "机匣上方有防尘滑盖，拉栓时随之前后滑动 —— 这是它最强的剪影特征。",
  },
  Type11: {
    id: "Type11",
    name: "十一年式轻机枪",
    fullName: "十一年式轻机枪",
    side: "ija",
    kind: "lmg",
    ammo: "Arisaka65",
    lengthM: 1.100, massKg: 10.2,
    magazine: 30, reloadKind: "hopper",        // 左侧漏斗，装 6 个 5 发桥夹
    damage: 66, headMultiplier: 2.2, effectiveRangeM: 600,
    rpm: 500, fireIntervalS: 60 / 500, reloadTimeS: 5.2,
    overheatShots: 200, coolDownS: 8.0,        // 不能换枪管，约 200 发须冷却
    aiAccuracy: 0.5, aiBurstMin: 4, aiBurstMax: 9, aiAimTimeS: 0.7,
    note: "左上方一个敞口方斗 + 顶部压弹板，枪托向右偏。日军一个分队通常 1 挺。",
  },
  Type92Hmg: {
    id: "Type92Hmg",
    name: "九二式重机枪",
    fullName: "九二式重机枪",
    side: "ija",
    kind: "hmg",
    ammo: "Arisaka77",
    lengthM: 1.156, massKg: 55.3,
    magazine: 30, reloadKind: "stripFeed",     // 30 发金属保弹板横向供弹
    damage: 92, headMultiplier: 2.0, effectiveRangeM: 1200,
    rpm: 200,                                   // 实际射速，"啄木鸟"节奏
    fireIntervalS: 60 / 200, reloadTimeS: 4.4,
    aiAccuracy: 0.55, aiBurstMin: 5, aiBurstMax: 14, aiAimTimeS: 1.1,
    emplaced: true,
    note: "气冷，枪管外粗大散热片。射声明显慢，中方老兵记它像啄木鸟。",
  },
  Type89Launcher: {
    id: "Type89Launcher",
    name: "掷弹筒",
    fullName: "八九式重掷弹筒",
    side: "ija",
    kind: "mortar",
    lengthM: 0.413, massKg: 2.7,
    damage: 110, radiusM: 5.0,
    rangeMinM: 40, rangeMaxM: 700,
    fireIntervalS: 2.4, flightTimeS: 3.2,
    warnLeadS: 1.5,                             // 落点先有啸声与地面标记
    note: "没有两脚架，底部弧形驻钣抵地，约 45° 手持发射。能越过院墙打进院子。",
  },
  Type89Tank: {
    id: "Type89Tank",
    name: "八九式中战车",
    fullName: "八九式中战车",
    side: "ija",
    kind: "vehicle",
    lengthM: 4.30, widthM: 2.15, heightM: 2.56, massT: 12.7,
    armorMm: [6, 17],
    hp: 900, weakSpotMultiplier: 3.2,
    gunDamage: 160, gunRadiusM: 4.0, gunIntervalS: 4.5,
    mgDamage: 44, mgIntervalS: 0.12,
    speedMs: 2.2,
    minAlleyWidthM: 2.5,                        // 巷宽小于此值进不来
    note: "装甲最厚 17 mm。巷子窄它转不了身，也抬不起炮打屋顶 —— 这就是从高处砸集束手榴弹的成立条件。",
  },
  Type95HaGo: {
    id: "Type95HaGo",
    name: "九五式轻战车",
    fullName: "九五式轻战车 Ha-Go",
    side: "ija",
    kind: "vehicle",
    lengthM: 4.38, widthM: 2.07, heightM: 2.27, massT: 7.4,
    armorMm: [6, 12],
    hp: 560, weakSpotMultiplier: 3.1,
    gunDamage: 120, gunRadiusM: 3.4, gunIntervalS: 4.1,
    mgDamage: 40, mgIntervalS: 0.12,
    speedMs: 3.9,
    minAlleyWidthM: 2.4,
    note: "九五式轻战车。高模源件减面后保留偏置小炮塔、短炮和双履带外轮廓；装甲最厚 12 mm。",
  },
  Type97ChiHa: {
    id: "Type97ChiHa",
    name: "九七式中战车",
    fullName: "九七式中战车 Chi-Ha",
    side: "ija",
    kind: "vehicle",
    lengthM: 5.50, widthM: 2.475, heightM: 2.38, massT: 15.8,
    armorMm: [12, 25],
    hp: 1080, weakSpotMultiplier: 3.0,
    gunDamage: 175, gunRadiusM: 4.4, gunIntervalS: 4.8,
    mgDamage: 46, mgIntervalS: 0.12,
    speedMs: 2.7,
    minAlleyWidthM: 2.8,
    note: "九七式中战车。源模型保留车体/履带/炮塔/炮管独立节点，炮塔可直接接入运行时转向。",
  },
};

/** 玩家在各关的携行。杂牌部队的弹药必须是紧的。 */
export const LOADOUTS = {
  L0_Wall: { primary: "ZhongZheng", secondary: null, melee: null,
    throwables: { Grenade: 3 }, spareClips: 6, note: "上墙前领的：一支枪，三十发子弹，三枚手榴弹。" },
  L1_Breach: { primary: "ZhongZheng", secondary: null, melee: "Dadao",
    throwables: { Grenade: 5 }, spareClips: 5 },
  L2_RoomWar: { primary: "HanYang", secondary: null, melee: "Dadao",
    throwables: { Grenade: 6, GrenadeBundle: 2 }, spareClips: 4,
    note: "中正式打坏了，换了支汉阳造 —— 杂牌部队就是这么换枪的。" },
  L3_WhiteTowel: { primary: "HanYang", secondary: null, melee: "Dadao",
    throwables: { Grenade: 8 }, spareClips: 3,
    note: "携行：汉阳造、大刀和手榴弹。" },
  L4_LastFiveMinutes: { primary: "HanYang", secondary: "ServicePistol", melee: "Dadao",
    throwables: { Grenade: 4 }, spareClips: 2, scavenge: true,
    note: "打到这儿，子弹得从倒下的人身上取；短枪换成捡来的外购九毫米手枪。" },
  L5_Morning: { primary: null, secondary: null, melee: null, throwables: {}, spareClips: 0 },
};

/** 敌方编组：日军一个分队约 13 人，通常 1 挺轻机枪。 */
export const IJA_SQUAD = {
  size: 13,
  composition: [
    { weapon: "Type38", count: 11 },
    { weapon: "Type11", count: 1 },
    { weapon: "Type38", count: 1, role: "leader" },
  ],
};
