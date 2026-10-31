// 炮击扬尘测试场（?impacts=1）的场地数据。纯数据，零 three、零 Math.random。
//
// 用途：验收「炮弹落地扬尘」——炸点附近的尘土起始形态要贴合壕沟形状（沟里炸了，
// 尘沿着沟走、从沟里冒出来），然后升起、顺风飘散。场景本身不画爆炸：所有弹种走生产链
// Combat.Blast / Combat.FireShell（它们再调 vfx.Explosion 与地形形变挖坑）。
// 口径与接口：docs/Data_ShellImpactRange.md。
//
// 坐标：以下 `L(x, z)` 都是场地局部坐标（原点 = 场心，X 向东、Z 向南，和世界同向），
// 经 SHELL_IMPACT_ORIGIN 平移成世界坐标。镜头默认朝北（-Z）看：玩家站在南侧（+Z），
// 隔着射击壕往北看；北侧是「敌方」，弃土垄也堆在北侧。
// 选址：x 3650–3950 / z 3650–3950，与别的测试场都不重叠（断肢 3300–3380、操作 3150–3248、
// 爆炸 2545–2655、枪械 2350–2460、靶场 1290–1510、工具首页 4900–4940）。
//
// 地形与壕沟照第一关的样条壕沟管线（Script_TrenchPlan / docs/Data_TrenchSpline.md）：
// 这里只放「中心线 + 预设 + 少数段级覆盖」，逐点的宽深与抛土由管线的位置噪声算。
import { WEAPONS } from "./Data_Weapons.mjs";
import { EXPLOSIVES } from "./Data_Explosives.mjs";

export const SHELL_IMPACT_RANGE_ID = "ShellImpactRange";

/** 场心的世界坐标。 */
export const SHELL_IMPACT_ORIGIN = Object.freeze({ x: 3800, z: 3800 });
const O = SHELL_IMPACT_ORIGIN;
/** 局部 → 世界。 */
const L = (x, z) => ({ x: O.x + x, z: O.z + z });
export const ImpactWorldPoint = L;

/** 地皮边界：300 × 300 m（东侧 150 m 内放战车炮的发射阵地）。 */
export const SHELL_IMPACT_WORLD = Object.freeze({
  minX: O.x - 150, maxX: O.x + 150, minZ: O.z - 150, maxZ: O.z + 150, groundLimit: 4300,
});
/** 远平面：场地对角约 400 m，参考机位的最远目标不到 100 m，给足地平线。 */
export const SHELL_IMPACT_CAMERA_FAR = 650;

/** 玩家（回到玩家时）出生点：南侧沟后，朝北。 */
export const SHELL_IMPACT_SPAWN = Object.freeze({ ...L(8, 34), ry: 0 });

// ---------------------------------------------------------------------------
// 壕沟网络（局部坐标写，下面统一平移）。
// 一条锯齿形射击壕横贯视野（约 95 m，三个折角）；一条交通壕从射击壕往南接到后方横沟
// 形成三岔口；一小段短支沟（听音哨）从射击壕往北探出去。
// ---------------------------------------------------------------------------
const seg = (id, preset, points, extra = {}) => Object.freeze({
  id, preset, role: null, source: "Data_ShellImpactRange（自有点）", routeBound: false,
  points: points.map(([x, z]) => L(x, z)), ...extra,
});

export const SHELL_IMPACT_TRENCH_SEGMENTS = Object.freeze([
  // 射击壕：锯齿形，每个折角做出一段护墙（traverse）似的拐弯。北侧堆弃土（敌方一侧）也堆南侧，
  // 好让机位从南侧看过去近处也有垄。
  seg("FireLine", "fire", [[-48, -8], [-31, -8], [-25, -19], [-9, -19], [-3, -8], [14, -8],
    [20, -20], [36, -20], [42, -10], [49, -10]], { bermSide: "both", bermH: 0.85 }),
  // 交通壕：从射击壕 (6,-8) 往南，到后方横沟（中途拐一下）。
  seg("CommTrench", "communication", [[6, -8], [6, 3], [9, 10]]),
  // 后方横沟：与交通壕在 (9,10) 成 T 形三岔口。
  seg("RearTrench", "communication", [[-26, 15], [-10, 11], [9, 10], [24, 12], [38, 19]]),
  // 短支沟（听音哨）：从射击壕 (30,-20) 往北探 17 m。
  seg("ListeningSap", "sap", [[30, -20], [30, -31], [35, -37]], { depth: 1.5 }),
]);

export const SHELL_IMPACT_TRENCH_NETWORK_ID = "tengxian1938:impactRange";

// ---------------------------------------------------------------------------
// 落点
// ---------------------------------------------------------------------------
/**
 * 预设落点。局部坐标；高度由场地的共享高度场现取（不在数据里写 y）。
 * kind 只用来分组与写图例：trench 沟里、berm 垄上、open 空地、bunker 碉堡边。
 */
const target = (id, x, z, kind, extra = {}) => Object.freeze({ id, kind, local: Object.freeze({ x, z }), ...L(x, z), ...extra });
export const SHELL_IMPACT_TARGETS = Object.freeze([
  target("TrenchStraight", -17, -19, "trench"),
  target("TrenchCorner", 20, -20, "trench"),
  target("CommTrench", 6, 0, "trench"),
  target("Junction", 9, 10, "trench"),
  target("BermCrest", -17, -22.5, "berm"),
  target("OpenFront20", -2, -42, "open"),
  target("OpenRear8", -34, 0, "open"),
  target("BunkerSide", 47.5, -24, "bunker"),
]);
export const SHELL_IMPACT_DEFAULT_TARGET = "TrenchCorner";

// ---------------------------------------------------------------------------
// 布景（仓库现有资产；不新生成）
// ---------------------------------------------------------------------------
/** Script_ExternalProps 的 placementsOnly 摆位：{ asset, x, z, ry, scale } 世界坐标。 */
const prop = (asset, x, z, ry = 0, scale = 1) => Object.freeze({ asset, ...L(x, z), ry, scale });
export const SHELL_IMPACT_PROPS = Object.freeze([
  // 两座圆形混凝土碉堡：一座在后方中间，一座在右侧、挨着射击壕东端。
  prop("battlefieldPillbox", 2, -62, 0.0, 1),
  prop("battlefieldPillbox", 56, -22, 0.6, 1),
  // 沟后弹药堆：补给箱 / 分格弹药箱 / 炮弹堆 / 军用木箱。
  prop("battlefieldCompartmentCrate", -22, 1.5, 0.3),
  prop("battlefieldSupplyBox", -19.5, 3, -0.2),
  prop("battlefieldShellStack", -24.5, 3.5, 0.1),
  prop("militaryCrateClosed", -21, 5, 0.6),
  prop("battlefieldCompartmentCrate", 17, 1, -0.4),
  prop("battlefieldSupplyBox", 18.6, 2.6, 0.5),
  prop("militaryCrateOpen", 15.8, 3.4, -0.1),
  // 碉堡旁与前方散落。
  prop("battlefieldSupplyBox", 49, -3, 0.9),
  prop("battlefieldShellStack", 51, 2, -0.3),
  prop("battlefieldCompartmentCrate", -8, -33, 0.7),
  prop("battlefieldSupplyBox", 12, -36, 0.2),
  // 沙袋：机枪位两侧矮墙。
  prop("battlefieldSandbag01", -45.9, -4.2, 0.12, 1),
  prop("battlefieldSandbag02", -41.9, -4.2, -0.1, 1),
  prop("battlefieldSandbag03", -48.1, -3.2, 1.2, 1),
]);

/** 汽油桶（仓库里没有现成的桶模型：沿用第一关焦桶堆的程序化做法 —— 圆柱 + 两道箍）。 */
export const SHELL_IMPACT_DRUMS = Object.freeze([
  [-27, 2.5], [-27.9, 3.8], [-26.2, 4.5], [-15, 1.5], [-14.2, 2.8],
  [20, -3.5], [21.1, -2.4], [60, -12], [61.2, -11], [60.4, -9.6],
  [-6, -38], [-5, -36.7], [14, -30], [-48, -2],
].map(([x, z], i) => Object.freeze({ id: `Drum${i}`, ...L(x, z), tilt: i % 5 === 3 ? 1 : 0, yaw: i * 1.7 })));

/** 沟沿机枪位：一挺九二式三脚架重机枪，枪口朝北（-Z），架在射击壕南沿左段。 */
export const SHELL_IMPACT_MG = Object.freeze({ weaponId: "Type92Hmg", ...L(-44, -2.7), yaw: 0 });

/** 枯树（Model_BreakableDeadTree，炮击能打断）：局部坐标，scale 是相对原模型的倍率。 */
export const SHELL_IMPACT_TREES = Object.freeze([
  [-62, -50, 1.0], [-48, -70, 1.15], [-30, -86, 0.95], [22, -80, 1.1], [44, -48, 0.9],
  [82, -48, 1.05], [-78, 12, 1.0], [-66, 30, 0.9], [68, 30, 1.1],
].map(([x, z, scale], i) => Object.freeze({ id: `ImpactTree${i}`, ...L(x, z), ry: i * 2.1, scale })));

// ---------------------------------------------------------------------------
// 弹种
// ---------------------------------------------------------------------------
/**
 * 投送方式：
 *   hand    直接在落点起爆（手榴弹 / 集束手榴弹），附一个典型的抛出落角做取证用。
 *   lob     高抛（掷弹筒 / 迫击炮 / 榴弹炮）：从落点北侧 rangeM 远、按落角 angleDeg 反推的弹道进来。
 *   direct  战车炮平射：从场地东侧约 150 m 外的战车炮口低伸飞来（flightS 是飞行时间）。
 *   field   野炮：45° 左右的中弧线，用 lob 同一套公式。
 *   drop    航空炸弹：从 altitudeM 高处近乎垂直落下，落角 angleDeg（无动力自由下落，自己积分）。
 * 落角 angleDeg 是命中点弹道与水平面的夹角；平射的落角由飞行时间与射距反算，这里的 angleDeg 只是名义值。
 * 伤害 / 半径尽量取自 Data_Weapons，没有的（105 / 150 / 航弹）是测试场的名义值，装药量一律读 Data_Explosives。
 */
const gun = (id) => ({ radiusM: WEAPONS[id].gunRadiusM, damage: WEAPONS[id].gunDamage });
export const SHELL_IMPACT_MUNITIONS = Object.freeze([
  { id: "Grenade", explosiveId: "Grenade", blastKind: "grenade", delivery: "hand", angleDeg: 55,
    radiusM: WEAPONS.Grenade.radiusM, damage: WEAPONS.Grenade.damage },
  { id: "GrenadeBundle", explosiveId: "GrenadeBundle", blastKind: "tank", delivery: "hand", angleDeg: 55,
    radiusM: WEAPONS.GrenadeBundle.radiusM, damage: WEAPONS.GrenadeBundle.damage },
  { id: "Shell50", explosiveId: "Shell50", blastKind: "shell", delivery: "lob", angleDeg: 70, rangeM: 55,
    radiusM: WEAPONS.Type89Launcher.radiusM, damage: WEAPONS.Type89Launcher.damage },
  { id: "Shell37", explosiveId: "Shell37", blastKind: "shell", delivery: "direct", tankId: "Type95HaGo",
    flightS: 0.55, ...gun("Type95HaGo") },
  { id: "Shell57", explosiveId: "Shell57", blastKind: "shell", delivery: "direct", tankId: "Type89Tank",
    flightS: 0.6, ...gun("Type89Tank") },
  { id: "Shell82", explosiveId: "Shell82", blastKind: "shell", delivery: "lob", angleDeg: 70, rangeM: 70,
    radiusM: WEAPONS.MediumMortar.radiusM, damage: WEAPONS.MediumMortar.damage },
  { id: "Shell75", explosiveId: "Shell75", blastKind: "shell", delivery: "field", angleDeg: 45, rangeM: 100,
    radiusM: 7, damage: 150 },
  { id: "Shell105", explosiveId: "Shell105", blastKind: "shell", delivery: "lob", angleDeg: 60, rangeM: 110,
    radiusM: 9, damage: 220 },
  { id: "Shell150", explosiveId: "Shell150", blastKind: "shell", delivery: "lob", angleDeg: 60, rangeM: 120,
    radiusM: 12, damage: 320 },
  { id: "Bomb50kg", explosiveId: "Bomb50kg", blastKind: "bomb", delivery: "drop", angleDeg: 80, altitudeM: 110,
    radiusM: 14, damage: 420 },
  { id: "Bomb250kg", explosiveId: "Bomb250kg", blastKind: "bomb", delivery: "drop", angleDeg: 80, altitudeM: 130,
    radiusM: 22, damage: 800 },
].map((m) => Object.freeze({ ...m, fillingKg: EXPLOSIVES[m.explosiveId].fillingKg })));

// ---------------------------------------------------------------------------
// 弹道几何（纯函数；运行时与测试共用）。
// 弹从落点水平 D 米外、高出落点 h 米的 from 起飞，飞行 T 秒，抛物线（重力 g）；命中点弹道与水平面夹角 θ：
//   tanθ = (h + g·T²/2) / D          →   T = √(2·(D·tanθ − h) / g)
// ---------------------------------------------------------------------------
/** Script_Combat.GRAVITY：FireShell 的弹道重力（游戏里的炮弹按这个值飞）。 */
export const SHELL_GRAVITY = 19.6;
/** 航空炸弹自由下落的真实重力（Data_AerialBombs.BOMB_PHYSICS.gravity）。 */
export const BOMB_GRAVITY = 9.81;
/** 炮位 / 火炮起飞点高出落点多少米（只影响反推的飞行时间）。 */
export const ORIGIN_RISE_M = 2.5;

/** 已知射距 D 与落角 θ，反推高抛 / 野炮的飞行时间（秒）。 */
export function LobFlightS(rangeM, angleDeg, riseM = ORIGIN_RISE_M, g = SHELL_GRAVITY) {
  return Math.sqrt(2 * Math.max(0.2, rangeM * Math.tan(angleDeg * Math.PI / 180) - riseM) / g);
}

/** 已知水平射距、起飞点高出落点的米数与飞行时间，命中点弹道与水平面的夹角（度）。 */
export function ArrivalAngleDeg(horizontalM, riseM, flightS, g = SHELL_GRAVITY) {
  return Math.atan((riseM + g * flightS * flightS / 2) / Math.max(1e-6, horizontalM)) * 180 / Math.PI;
}

/** 航空炸弹：从 altitudeM 高处零初速下落，带水平速度使落角为 angleDeg。返回下落时间、水平速度与投下点相对落点的水平偏移。 */
export function DropPlan(altitudeM, angleDeg, g = BOMB_GRAVITY) {
  const fallS = Math.sqrt(2 * altitudeM / g), impactVy = g * fallS;
  const horizontalSpeed = impactVy / Math.tan(angleDeg * Math.PI / 180);
  return { fallS, impactVy, horizontalSpeed, offsetM: horizontalSpeed * fallS };
}

/** 战车炮的发射阵地：场地东侧约 140 m，炮口朝西（-X）。 */
export const SHELL_IMPACT_TANKS = Object.freeze({
  Type95HaGo: Object.freeze({ id: "Type95HaGo", ...L(140, -12), yaw: Math.PI / 2 }),
  Type89Tank: Object.freeze({ id: "Type89Tank", ...L(140, 10), yaw: Math.PI / 2 }),
});

/** 齐射：同一弹种在落点周围 count 发，间隔 intervalS，散布半径 spreadM。 */
export const SHELL_IMPACT_BARRAGE = Object.freeze({ count: 4, intervalS: 0.9, spreadM: 5 });

/** 弹在空中时用的倍速（落地后恢复所选倍速）。 */
export const SHELL_IMPACT_FLIGHT_SPEED = 1;
export const SHELL_IMPACT_TIME_SCALES = Object.freeze([0.1, 0.25, 0.5, 1]);

// ---------------------------------------------------------------------------
// 机位
// ---------------------------------------------------------------------------
/**
 * 预设机位：from 局部 xz + 离地高度 h（米，现取地面高度再加），at 是看向的局部 xz + 离地高度。
 * 参考机位对着参考图：抬高约 10 m、隔着射击壕往前看 50 m 左右。
 */
export const SHELL_IMPACT_CAMERAS = Object.freeze([
  { id: "reference", from: { x: 22, z: 38, h: 11 }, at: { x: 14, z: -24, h: 0.5 } },
  { id: "trenchLow", from: { x: -12, z: -4.5, h: 1.7 }, at: { x: -17, z: -32, h: 1.5 } },
  { id: "overhead", from: { x: 6, z: -14, h: 70 }, at: { x: 6, z: -14.5, h: 0 } },
]);

// ---------------------------------------------------------------------------
// 相位（Script_Main 的 PHASE_TABLE 一项）
// ---------------------------------------------------------------------------
export const SHELL_IMPACT_RANGE_PHASE = Object.freeze({
  id: SHELL_IMPACT_RANGE_ID, sandbox: true, sandboxKey: "impacts", sandboxGlyph: "尘",
  date: "扬尘测试", label: "炮击扬尘测试场", place: "壕沟 · 弹种 · 落点 · 观察机位",
  sky: "testSceneDay", ambience: "overcast", music: null, minutes: 600,
  story: SHELL_IMPACT_RANGE_ID,
  brief: ["一片黄土地上有一道锯齿形射击壕、一条交通壕、一个三岔口和一小段短支沟，沟外是弃土垄，另有两座混凝土堡垒与散落的桶、箱。",
    "左侧面板选弹种与落点，发射或齐射；每一发都走正式的炮击链：打出炮弹、落地起爆、挖坑。可暂停、单步、放慢，机位可飞到任意处看尘怎么起来、怎么散。"],
  objectives: ["观察炮弹落地扬尘"],
  mechanic: "测试场：玩家无敌，不刷敌人。左键不射击；面板与 Debug.ShellImpact 控制发射。",
  nraPool: 9999, poolGain: 0, ijaPool: 9999, ijaPressure: 0, ijaSpawn: [], ijaSupport: [],
  ijaForce: { lmgEvery: 13, hmgTeams: 0, engineers: false, armor: 0, motorTransport: "rearOnly" },
  ambientAircraft: false,
  // 通用开关：本关开启「炮弹落地扬尘」，Script_Main 据此调 vfx.SetGroundImpactDust / SetGroundSampler（别的关以后也能开）。
  groundImpactDust: true,
  bounds: { minX: SHELL_IMPACT_WORLD.minX, maxX: SHELL_IMPACT_WORLD.maxX, minZ: SHELL_IMPACT_WORLD.minZ, maxZ: SHELL_IMPACT_WORLD.maxZ },
  cameraFar: SHELL_IMPACT_CAMERA_FAR,
  zones: [{ id: "ImpactRange", name: "炮击扬尘测试场", x: SHELL_IMPACT_SPAWN.x, z: SHELL_IMPACT_SPAWN.z, radius: 6 }],
  spawn: { x: SHELL_IMPACT_SPAWN.x, z: SHELL_IMPACT_SPAWN.z, ry: SHELL_IMPACT_SPAWN.ry }, hud: { objectiveMarkers: false },
  // 外部道具走 Script_ExternalProps 的 placementsOnly：只摆这里列的，不带城里的摆件与 PCG。
  externalPlacements: SHELL_IMPACT_PROPS,
  loadoutOverride: { primary: "HanYang", secondary: null, melee: "Dadao", throwables: { Grenade: 0, GrenadeBundle: 0 }, spareClips: 12,
    note: "测试场：玩家无敌，用面板发射。" },
});
