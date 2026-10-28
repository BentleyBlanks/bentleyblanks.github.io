// 人物战场反应测试场（?reactions=1）的场地数据。纯数据，零 three、零 Math.random。
//
// 2026-10-21 用户：新增一个人物战场反应测试关卡，开着扬尘、有壕沟；第一项测试是主角的第一人称近爆反应
//（歪头 / 低头 / 看爆炸的另一边 / 合眼一会儿 / 耳鸣 / 肢体反应），反应强度跟爆点到人的距离走。
// 场地借炮击扬尘测试场的那一片（同一份壕沟网络、分层土壤、布景与扬尘，Script_ShellImpactRangeField），
// 投送也借它的生产链（Script_ShellImpactRange 以 embedded 方式嵌进来）；本关只管「人站在哪、往人身边哪儿炸」。
// 口径与接口：docs/Data_BattleReactionRange.md。
import { ImpactWorldPoint as L, SHELL_IMPACT_WORLD, SHELL_IMPACT_CAMERA_FAR, SHELL_IMPACT_PROPS, SHELL_IMPACT_MUNITIONS } from "./Data_ShellImpactRange.mjs";

export const BATTLE_REACTION_RANGE_ID = "BattleReactionRange";

/**
 * 站位：局部坐标（场心原点，X 向东、Z 向南），朝向 ry（0 = 朝北，对着「敌方」）。
 *   trench 射击壕直段沟底（沟深约 2 m，眼睛在沟沿以下：沟外的爆炸被沟壁挡住，算遮挡）
 *   rear   沟后空地（站在地面上，没遮没挡）
 *   open   沟前开阔地（同上，四面空旷）
 *   paved  沟后南边的砖铺场院（BATTLE_REACTION_PAVED）：砖地上炸起来的尘少得多，看得清人被冲击波推倒
 */
/**
 * 砖铺场院（2026-10-28，用户：「新增一块扬尘不大的地面，比如湿润一点、或者砖块地，现在有扬尘不方便看到被推倒的效果」）。
 * 局部坐标中心 (0, 65)、60 × 60 m，离最近的壕沟 45 m 以上、四周没有布景。
 * 落在这块砖地里的爆炸：扬尘按 GROUND_IMPACT_SURFACES.brick（掀起来的土只有黄土地的一成多），不挖弹坑（砖面不重算，简化）。
 */
export const BATTLE_REACTION_PAVED = Object.freeze({
  id: "paved", ...L(0, 65), local: Object.freeze({ x: 0, z: 65 }), halfX: 30, halfZ: 30, surface: "brick",
  /** 一块砖的长 × 宽（米，青砖平铺、错缝），贴图一张铺几块。 */
  brickM: Object.freeze([0.26, 0.125]), lift: 0.025,
});

/** 一个世界坐标点在不在砖铺场院里（Vfx 的地面类型、弹坑闸共用）。 */
export function InPavedYard(x, z, pad = BATTLE_REACTION_PAVED) {
  return Math.abs(x - pad.x) <= pad.halfX && Math.abs(z - pad.z) <= pad.halfZ;
}

export const BATTLE_REACTION_STANDS = Object.freeze([
  Object.freeze({ id: "trench", ...L(-15, -19), local: Object.freeze({ x: -15, z: -19 }), ry: 0 }),
  Object.freeze({ id: "rear", ...L(-15, -6), local: Object.freeze({ x: -15, z: -6 }), ry: 0 }),
  Object.freeze({ id: "open", ...L(-2, -45), local: Object.freeze({ x: -2, z: -45 }), ry: 0 }),
  Object.freeze({ id: "paved", ...L(0, 65), local: Object.freeze({ x: 0, z: 65 }), ry: 0 }),
]);
export const BATTLE_REACTION_DEFAULT_STAND = "trench";

/** 爆点到人的水平距离（米）。 */
export const BATTLE_REACTION_DISTANCES = Object.freeze([3, 5, 8, 12, 20, 35, 60, 100]);
export const BATTLE_REACTION_DEFAULT_DISTANCE = 8;

/**
 * 方位：相对人此刻的朝向，顺时针度数（0 = 正前，90 = 右）。面板排成 3×3（中间是「随机」）。
 */
export const BATTLE_REACTION_BEARINGS = Object.freeze([
  Object.freeze({ id: "frontLeft", deg: -45 }), Object.freeze({ id: "front", deg: 0 }), Object.freeze({ id: "frontRight", deg: 45 }),
  Object.freeze({ id: "left", deg: -90 }), Object.freeze({ id: "random", deg: null }), Object.freeze({ id: "right", deg: 90 }),
  Object.freeze({ id: "backLeft", deg: -135 }), Object.freeze({ id: "back", deg: 180 }), Object.freeze({ id: "backRight", deg: 135 }),
]);
export const BATTLE_REACTION_DEFAULT_BEARING = "right";

/** 面板里列哪些弹种（Data_ShellImpactRange 的 id；顺序 = 从小到大）。 */
export const BATTLE_REACTION_MUNITIONS = Object.freeze(["Grenade", "GrenadeBundle", "Shell50", "Shell82", "Shell75",
  "Shell105", "Shell150", "Bomb50kg", "Bomb250kg"]);
export const BATTLE_REACTION_DEFAULT_MUNITION = "Shell75";

/** 连续炮击：count 发、每发间隔 intervalMinS..intervalMaxS（仿真秒），落在人周围 minM..maxM、方位随机。 */
export const BATTLE_REACTION_BARRAGE = Object.freeze({ count: 8, intervalMinS: 0.9, intervalMaxS: 2.4, minM: 5, maxM: 40, seed: 19380317 });

export const BATTLE_REACTION_TIME_SCALES = Object.freeze([0.25, 0.5, 1]);

/** 方位 + 距离 → 落点世界 xz。yaw 是人此刻的朝向（three 约定：前 = (−sin, 0, −cos)，右 = (cos, 0, −sin)）。 */
export function ReactionPoint(origin, yaw, bearingDeg, distanceM) {
  const a = (bearingDeg || 0) * Math.PI / 180;
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
  const f = Math.cos(a) * distanceM, r = Math.sin(a) * distanceM;
  return { x: origin.x + fx * f + rx * r, z: origin.z + fz * f + rz * r };
}

const SPAWN = BATTLE_REACTION_STANDS[0];

export const BATTLE_REACTION_RANGE_PHASE = Object.freeze({
  id: BATTLE_REACTION_RANGE_ID, sandbox: true, sandboxKey: "reactions", sandboxGlyph: "震",
  date: "反应测试", label: "人物战场反应测试场", place: "壕沟 · 近爆 · 第一人称反应 · 耳鸣",
  sky: "testSceneDay", ambience: "overcast", music: null, minutes: 600,
  story: BATTLE_REACTION_RANGE_ID, cutsceneIn: null, cutsceneOut: null,
  brief: ["和炮击扬尘测试场同一片黄土地：一道锯齿形射击壕、交通壕与后方横沟，沟外是弃土垄。你站在射击壕里。",
    "左侧面板选弹种、距离和方位，在你身边引爆：看人怎么眨眼闭眼、扭头避开、低头缩身、手臂收枪，听耳鸣怎么起来又怎么退。"],
  objectives: ["测试第一人称近爆反应"],
  mechanic: "测试场：玩家无敌，不刷敌人。面板与 Debug.BattleReaction 控制引爆。",
  nraPool: 9999, poolGain: 0, ijaPool: 9999, ijaPressure: 0, ijaSpawn: [], ijaSupport: [],
  ijaForce: { lmgEvery: 13, hmgTeams: 0, engineers: false, armor: 0, motorTransport: "rearOnly" },
  ambientAircraft: false,
  // 通用开关：炮弹落地扬尘（同炮击扬尘测试场）。
  groundImpactDust: true,
  // 通用开关：近爆的第一人称身体反应 + 耳朵模型 trauma（Script_BlastFlinch / Script_AudioEarTrauma）。正片默认不开。
  blastReaction: true,
  bounds: { minX: SHELL_IMPACT_WORLD.minX, maxX: SHELL_IMPACT_WORLD.maxX, minZ: SHELL_IMPACT_WORLD.minZ, maxZ: SHELL_IMPACT_WORLD.maxZ },
  cameraFar: SHELL_IMPACT_CAMERA_FAR,
  zones: [{ id: "ReactionRange", name: "人物战场反应测试场", x: SPAWN.x, z: SPAWN.z, radius: 6 }],
  spawn: { x: SPAWN.x, z: SPAWN.z, ry: SPAWN.ry }, hud: { objectiveMarkers: false },
  externalPlacements: SHELL_IMPACT_PROPS,
  loadoutOverride: { primary: "HanYang", secondary: null, melee: "Dadao", throwables: { Grenade: 0, GrenadeBundle: 0 }, spareClips: 12,
    note: "测试场：玩家无敌，用面板引爆。" },
});

/** 弹种表（面板与取证共用）：Data_ShellImpactRange 的条目，按 BATTLE_REACTION_MUNITIONS 的顺序。 */
export const BATTLE_REACTION_MUNITION_SPECS = Object.freeze(BATTLE_REACTION_MUNITIONS
  .map((id) => SHELL_IMPACT_MUNITIONS.find((spec) => spec.id === id)).filter(Boolean));
