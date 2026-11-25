// 断肢测试场（?gore=1）的场地数据。纯数据，零 three、零 Math.random。
//
// 2026-11-25 重构：从塑料灰白盒升级为「1938 滕县城郊军事院落 · 断肢实景测试场」——
//   · 保留全部木桩 ID（L10_1..5 / L25_1..5 / C1..C3 / B_1..3）与核心坐标契约；
//   · 撤除刀桩区绊脚的 0.30 m 红色高台，改为平地土坪 + 浅灰白灰墙血溅反差背板；
//   · 枪线胸墙两侧留通行缺口，弹坑外侧加沙袋防爆土堤，新增一键实景演示与自由特写机位。
//
// 选址：x 3300–3380 / z 3300–3370（解析平地 y = 0），玩家从 +Z 面向 -Z 进场。

export const GORE_RANGE_ID = "GoreRange";

export const GORE_RANGE_WORLD = Object.freeze({
  minX: 3300, maxX: 3380, minZ: 3300, maxZ: 3370, groundLimit: 3600,
});

export const GORE_RANGE_CAMERA_FAR = 220;

/** 木桩兵面朝 +Z（朝向射击位与观察机位）。 */
const FACING = Math.PI;

/**
 * 精切日军士兵A测试副本配置（不改动正式 Model_JapaneseSoldierA.glb）。
 * 由 Script_BuildJapaneseSoldierAGoreTest.py + Script_PackJapaneseSoldierAGoreTest.mjs 生成。
 */
export const GORE_TEST_CHARACTER = Object.freeze({
  key: "ijaAGoreTest",
  name: "日军士兵A·精切断肢版",
  file: "./Model/GoreTest/Model_JapaneseSoldierAGoreTest.glb",
  hipsScale: 0.9396,
  heightM: 1.8376,
  ownMaterial: true,
  groom: "./Hair/Grooms/Groom_Game_JapaneseSoldierA.bin",
  goreEnabled: true,
});

/** 四个实景工位（id 保持向后兼容）。 */
export const GORE_RANGE_STATIONS = Object.freeze([
  { id: "GoreLine", name: "01 枪械射界", x: 3340, z: 3348, radius: 12, color: "Brass",
    signX: 3340, signZ: 3320.2, signY: 2.8, floorZ: null },
  { id: "GoreCrater", name: "02 爆破弹坑", x: 3364, z: 3336, radius: 6, color: "Rust",
    signX: 3364, signZ: 3329.8, signY: 2.5, floorZ: null },
  { id: "GoreBlade", name: "03 白刃劈砍区", x: 3316, z: 3336, radius: 6, color: "Crimson",
    signX: 3316, signZ: 3332.15, signY: 2.75, floorZ: null },
  { id: "GoreDeck", name: "04 指挥观察坪", x: 3340, z: 3364.5, radius: 5, color: "Brass",
    signX: 3340, signZ: 3366.65, signY: 2.1, floorZ: null },
]);

/** 枪线沙袋胸墙（两侧留通行缺口，可随时步行上前近距离查验断面）。 */
export const GORE_FIRING_LINE = Object.freeze({ z: 3358, x0: 3332, x1: 3348, h: 0.90, d: 0.68 });

/** 枪线两排的名义距离（米），从胸墙量起。 */
export const GORE_LINE_RANGES = Object.freeze([10, 25]);

/** 炸坑：爆心与一二三米环。 */
export const GORE_CRATER = Object.freeze({ x: 3364, z: 3336, rings: Object.freeze([1, 2, 3]) });

/**
 * 白刃劈砍区：取消旧版 0.30 m 绊脚高台，改为平地练兵坪 + 背后白灰反差墙（距木桩 3.5 m）。
 * 保留字段结构给外部读取，h = 0 表示平地。
 */
export const GORE_BLADE_STAND = Object.freeze({ x: 3316, z: 3335.7, w: 8.6, d: 5.4, h: 0 });
export const GORE_BLADE_POST_Z = 3335.7;
export const GORE_BLADE_WALL = Object.freeze({ x: 3316, z: 3332.0, w: 10.4, h: 3.4, d: 0.32 });

/** 指挥观察坪：低矮木栈台（0.18 m 轻踏步）+ 院落背墙。 */
export const GORE_OBSERVATION = Object.freeze({
  deck: { x: 3340, z: 3364.5, w: 11, d: 3.8, h: 0.18 },
  board: { x: 3340, z: 3366.8, w: 12.6, h: 3.4 },
});

/** 木桩兵固定站位表（零 Math.random，与 Script_GoreRangeTest 契约全兼容）。 */
export const GORE_RANGE_POSTS = Object.freeze([
  ...GORE_LINE_RANGES.flatMap((rangeM, row) => [3332, 3336, 3340, 3344, 3348].map((x, i) => Object.freeze({
    id: `L${rangeM}_${i + 1}`, station: "GoreLine", x, z: GORE_FIRING_LINE.z - rangeM,
    yaw: FACING, weapon: "Type38", rangeM, row,
  }))),
  Object.freeze({ id: "C1_E", station: "GoreCrater", x: 3365, z: 3336, yaw: Math.PI * 0.88, weapon: "Type38", ringM: 1 }),
  Object.freeze({ id: "C1_W", station: "GoreCrater", x: 3363, z: 3336, yaw: -Math.PI * 0.88, weapon: "Type38", ringM: 1 }),
  Object.freeze({ id: "C2_S", station: "GoreCrater", x: 3364, z: 3338, yaw: FACING, weapon: "Type38", ringM: 2 }),
  Object.freeze({ id: "C2_N", station: "GoreCrater", x: 3364, z: 3334, yaw: FACING, weapon: "Type38", ringM: 2 }),
  Object.freeze({ id: "C3_SE", station: "GoreCrater", x: 3366.121, z: 3338.121, yaw: Math.PI * 0.82, weapon: "Type38", ringM: 3 }),
  Object.freeze({ id: "C3_NW", station: "GoreCrater", x: 3361.879, z: 3333.879, yaw: -Math.PI * 0.82, weapon: "Type38", ringM: 3 }),
  // 白刃劈砍区三个平地目标（零 standY 绊脚，可贴身 360° 挥刀与特写检视）。
  ...[3313.6, 3316, 3318.4].map((x, i) => Object.freeze({
    id: `B_${i + 1}`, station: "GoreBlade", x, z: GORE_BLADE_POST_Z,
    yaw: FACING, weapon: "Type38",
  })),
]);

/** 面板上每肢体一个按钮（与 CHARACTER_HITBOX_PROFILE 同名）。 */
export const GORE_LIMB_BUTTONS = Object.freeze([
  "upperArmL", "forearmL", "upperArmR", "forearmR",
  "thighL", "calfL", "thighR", "calfR", "head",
]);

/** 慢动作档位。 */
export const GORE_SLOW_MOTION = 0.2;
export const GORE_TIME_SCALES = Object.freeze([1, 0.2, 0.05]);

/** 四个工位的快捷观察机位 / 玩家传送点。 */
export const GORE_CAMERA_PRESETS = Object.freeze({
  overview: Object.freeze({ pos: [3340, 2.6, 3362.5], lookAt: [3340, 1.0, 3345] }),
  bladeClose: Object.freeze({ pos: [3317.3, 1.52, 3338.2], lookAt: [3316.0, 1.25, 3335.7] }),
  craterClose: Object.freeze({ pos: [3361.2, 2.75, 3342.4], lookAt: [3364.0, 0.85, 3336.0] }),
  lineClose: Object.freeze({ pos: [3341.4, 1.52, 3350.6], lookAt: [3340.0, 1.22, 3348.0] }),
});

/** 玩家传送工位（第一人称快速移步）。 */
export const GORE_STATION_TELEPORTS = Object.freeze({
  GoreLine: Object.freeze({ x: 3340, z: 3359.6, ry: 0 }),
  GoreCrater: Object.freeze({ x: 3364, z: 3344.2, ry: 0 }),
  GoreBlade: Object.freeze({ x: 3316, z: 3338.0, ry: 0 }),
  GoreDeck: Object.freeze({ x: 3340, z: 3363.6, ry: 0 }),
});

export const GORE_RANGE_PHASE = Object.freeze({
  id: GORE_RANGE_ID, sandbox: true, sandboxKey: "gore", sandboxGlyph: "肢",
  date: "断肢实景", label: "断肢测试场", place: "枪械射界 · 爆破弹坑 · 白刃劈砍 · 精切模型演示",
  sky: "testSceneDay", ambience: "overcast", music: null, minutes: 580,
  story: GORE_RANGE_ID,
  brief: [
    "滕县城郊军事院落靶场：全员默认换装 BlenderMCP 精切版日军士兵A（零锯齿 9 处解剖切面、独立九〇式钢盔与雕刻 PBR 湿血断骨盖）。",
    "左侧面板支持一键实景演示（大刀斩首/断臂、手雷近炸、机枪断肢、重机枪爆头碎裂），并可切自由观察相机与 0.2×/0.05× 慢动作特写检视。",
  ],
  objectives: ["检视断肢实景效果与刀/爆/枪三大演示"],
  mechanic: "1/2/3 切汉阳造/捷克式机枪/大刀 · G 掷雷 · Alt 点左侧演示面板 · 自由相机 WASD+QE 漫游。",
  nraPool: 9999, poolGain: 0, ijaPool: 9999, ijaPressure: 0, ijaSpawn: [], ijaSupport: [],
  ijaForce: { lmgEvery: 13, hmgTeams: 0, engineers: false, armor: 0, motorTransport: "rearOnly" },
  ambientAircraft: false,
  bounds: {
    minX: GORE_RANGE_WORLD.minX, maxX: GORE_RANGE_WORLD.maxX,
    minZ: GORE_RANGE_WORLD.minZ, maxZ: GORE_RANGE_WORLD.maxZ,
  },
  cameraFar: GORE_RANGE_CAMERA_FAR,
  zones: GORE_RANGE_STATIONS.map((station) => ({ ...station })),
  spawn: { x: 3340, z: 3360.2, ry: 0 },
  hud: { objectiveMarkers: false },
  loadoutOverride: {
    primary: "HanYang", secondary: "Zb26", melee: "Dadao",
    throwables: { Grenade: 12, GrenadeBundle: 4 }, spareClips: 99,
    note: "汉阳造、捷克式轻机枪、二十九军大刀与充足手榴弹。",
  },
});
