// 断肢测试场（?gore=1）的场地数据。纯数据，零 three、零 Math.random。
//
// 口径：docs/Data_Dismemberment.md §9。这里只有坐标与内容字段，判定与视觉在
// Data_Tuning_Gore / Script_Dismemberment / Script_CharacterGore，场地在
// Script_GoreRangeField，运行时与面板在 Script_GoreRange / Script_GoreLab。
//
// 选址：x 3300–3380 / z 3300–3370，与另外五个测试场的 *_WORLD 都不重叠
//   靶场 1290–1510 / 1300–1510、枪械白盒 2350–2460 / 2242–2480、
//   爆炸场 2545–2655 / 2495–2700、操作白盒 3150–3248 / 3150–3225。
// 地表是解析平地 y = 0（同 RangeField），所以下面每个 y 都是「离地多高」。
//
// 朝向约定同 Data_Range：玩家从 +Z 一侧进场往 -Z 打，木桩兵 yaw = Math.PI 面朝 +Z。

export const GORE_RANGE_ID = "GoreRange";

/** 地皮边界（语义同 Data_Range.RANGE_WORLD）。 */
export const GORE_RANGE_WORLD = Object.freeze({
  minX: 3300, maxX: 3380, minZ: 3300, maxZ: 3370, groundLimit: 3600,
});

/** 相机远平面：整片场地对角不到 110 m，收到 200 是白赚的剔除。 */
export const GORE_RANGE_CAMERA_FAR = 200;

/** 木桩兵一律面朝 +Z（玩家来的方向）。 */
const FACING = Math.PI;

/**
 * 四个工位。id 同时是 HUD 路标名与 Debug.GoreRange 的工位参数。
 * radius 只影响路标圈，不影响场地几何。
 *
 * signZ / signY 是**立牌**的位置，floorZ 是地面那块副本（null = 不铺）。
 * 两个都写死而不是按 z 偏移算：观察台的牌子必须挂到身后那面白板上 ——
 * 按「工位 z 减四米半」算的话，它正好悬在出生点前一米九，一进场就糊满上半屏。
 */
export const GORE_RANGE_STATIONS = Object.freeze([
  { id: "GoreLine", name: "01 枪线", x: 3340, z: 3350, radius: 12, color: "Blue",
    signZ: 3345.5, signY: 2.9, floorZ: 3351.6 },
  { id: "GoreCrater", name: "02 炸坑", x: 3364, z: 3336, radius: 6, color: "Orange",
    signZ: 3331.5, signY: 2.9, floorZ: 3341.6 },
  { id: "GoreBlade", name: "03 刀桩", x: 3316, z: 3336, radius: 6, color: "Red",
    signZ: 3331.5, signY: 2.9, floorZ: 3340.5 },
  { id: "GoreDeck", name: "04 观察台", x: 3340, z: 3365, radius: 5, color: "Cyan",
    signZ: 3367.4, signY: 1.7, floorZ: null },
]);

/** 射击位胸墙：能站着依托射击的高度（与 Script_RangeField.FIRING_LINE 同一档）。 */
export const GORE_FIRING_LINE = Object.freeze({ z: 3358, x0: 3331, x1: 3351, h: 0.92, d: 0.7 });

/** 枪线两排的名义距离（米），从胸墙量起。 */
export const GORE_LINE_RANGES = Object.freeze([10, 25]);

/** 炸坑：爆心与三道环线。引爆用的手榴弹数值照 Data_Weapons.Grenade（半径 6.5 / 伤害 130）。 */
export const GORE_CRATER = Object.freeze({ x: 3364, z: 3336, rings: [1, 2, 3] });

/**
 * 刀桩台：台面 0.30 m，木桩兵站上去正好齐玩家胸口。
 *
 * 台子**必须浅**、木桩**必须站在前沿**：台面挡着玩家的脚，站在台前能贴到的
 * 最近距离就是「台前沿 + 人的半径」。头一版台深 2.4 m、木桩摆在台心，
 * 于是玩家离木桩 1.55 m —— 大刀够不着，连挥六刀一滴血都掉不了。
 */
export const GORE_BLADE_STAND = Object.freeze({ x: 3316, z: 3335.1, w: 6.4, d: 1.8, h: 0.30 });
/** 刀桩木桩兵站的那条线：离台前沿 0.3 m。 */
export const GORE_BLADE_POST_Z = 3335.7;

/** 观察台：退后看全场的 0.6 m 台子，身后一面白板当截图背景。 */
export const GORE_OBSERVATION = Object.freeze({
  deck: { x: 3340, z: 3365, w: 10, d: 4, h: 0.6 },
  board: { x: 3340, z: 3367.6, w: 13, h: 4.2 },
});

/**
 * 木桩兵工位表。**全部是固定坐标**（零 Math.random）。
 *   station  归哪个工位（重置与 Detonate 按它筛）
 *   x / z    站位；yaw 面朝玩家
 *   weapon   手里那支枪（只影响外观与命中体，木桩兵不 Think）
 *   standY   站在台子上时的台面高度（刀桩用）
 *   rangeM   枪线两排的名义距离；ringM 炸坑的环号 —— 都只用来写牌子与断言
 */
export const GORE_RANGE_POSTS = Object.freeze([
  ...GORE_LINE_RANGES.flatMap((rangeM, row) => [3332, 3336, 3340, 3344, 3348].map((x, i) => Object.freeze({
    id: `L${rangeM}_${i + 1}`, station: "GoreLine", x, z: GORE_FIRING_LINE.z - rangeM,
    yaw: FACING, weapon: "Type38", rangeM, row,
  }))),
  // 炸坑一圈六个：1 m 两个、2 m 两个、3 m 两个。3 m 的两个按 45° 斜放，
  // 免得六个人排成一条直线（爆炸遮挡会让后面那个白站）。
  Object.freeze({ id: "C1_E", station: "GoreCrater", x: 3365, z: 3336, yaw: FACING, weapon: "Type38", ringM: 1 }),
  Object.freeze({ id: "C1_W", station: "GoreCrater", x: 3363, z: 3336, yaw: FACING, weapon: "Type38", ringM: 1 }),
  Object.freeze({ id: "C2_S", station: "GoreCrater", x: 3364, z: 3338, yaw: FACING, weapon: "Type38", ringM: 2 }),
  Object.freeze({ id: "C2_N", station: "GoreCrater", x: 3364, z: 3334, yaw: FACING, weapon: "Type38", ringM: 2 }),
  Object.freeze({ id: "C3_SE", station: "GoreCrater", x: 3366.121, z: 3338.121, yaw: FACING, weapon: "Type38", ringM: 3 }),
  Object.freeze({ id: "C3_NW", station: "GoreCrater", x: 3361.879, z: 3333.879, yaw: FACING, weapon: "Type38", ringM: 3 }),
  // 刀桩三个：站在 0.30 m 的台上。
  ...[3313.8, 3316, 3318.2].map((x, i) => Object.freeze({
    id: `B_${i + 1}`, station: "GoreBlade", x, z: GORE_BLADE_POST_Z,
    yaw: FACING, weapon: "Type38", standY: GORE_BLADE_STAND.h,
  })),
]);

/** 面板上每肢体一个按钮，顺序即按钮顺序；id 与 CHARACTER_HITBOX_PROFILE 的 shape id 同名。 */
export const GORE_LIMB_BUTTONS = Object.freeze([
  "upperArmL", "forearmL", "upperArmR", "forearmR",
  "thighL", "calfL", "thighR", "calfR", "head",
]);

/** 慢动作档位（面板上那颗按钮）。 */
export const GORE_SLOW_MOTION = 0.2;

export const GORE_RANGE_PHASE = Object.freeze({
  id: GORE_RANGE_ID, sandbox: true, sandboxKey: "gore", sandboxGlyph: "肢",
  date: "断肢白盒", label: "断肢测试场", place: "枪线 · 炸坑 · 刀桩 · 观察台",
  sky: "testSceneDay", ambience: "overcast", music: null, minutes: 600,
  story: GORE_RANGE_ID, cutsceneIn: null, cutsceneOut: null,
  brief: ["四个工位共用正式伤害链：枪线两排在十米与二十五米，炸坑一圈六个木桩标着一二三米环，刀桩三个站在台上。",
    "左上角面板可以开「下一发必断」、按肢体直接卸一段、重置木桩、引爆炸坑和放慢到零点二倍速。"],
  objectives: ["自由测试断肢"],
  mechanic: "左键射击 / 右键机瞄 / G 投弹 / 大刀劈砍；面板按钮走同一条死亡链。",
  nraPool: 9999, poolGain: 0, ijaPool: 9999, ijaPressure: 0, ijaSpawn: [], ijaSupport: [],
  ijaForce: { lmgEvery: 13, hmgTeams: 0, engineers: false, armor: 0, motorTransport: "rearOnly" },
  // 环境机队在 165–250 m 高空绕圈，这片场地相机只看 200 m：画不进画面却每帧更新
  // 两百多个节点，与白刃场同样的账 —— 不要它。
  ambientAircraft: false,
  bounds: { minX: GORE_RANGE_WORLD.minX, maxX: GORE_RANGE_WORLD.maxX,
    minZ: GORE_RANGE_WORLD.minZ, maxZ: GORE_RANGE_WORLD.maxZ },
  cameraFar: GORE_RANGE_CAMERA_FAR,
  zones: GORE_RANGE_STATIONS.map((station) => ({ ...station })),
  // 出生点在观察台前沿：再往前站就贴到胸墙上了（0.92 m 的墙在 2.6 m 外要占掉
  // 画面下半屏，第一眼看不到场地）。这里离胸墙 4 m，一眼能看全两排木桩。
  spawn: { x: 3340, z: 3362.4, ry: 0 }, hud: { objectiveMarkers: false },
  loadoutOverride: { primary: "HanYang", secondary: null, melee: "Dadao",
    throwables: { Grenade: 6, GrenadeBundle: 0 }, spareClips: 99,
    note: "汉阳造、大刀、六枚手榴弹，备弹管够。" },
});
