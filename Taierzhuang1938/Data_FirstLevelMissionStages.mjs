import { MISSION_RECEPTION_SPACE, MISSION_STAGE_ROUTES as Stage } from "./Data_FirstLevelMissionTopology.mjs";
// Notion 2026-09-19（docs/Data_FirstLevelRebuild20260919Contract.md §1）：18 个公开阶段，
// 27 个可玩内部步骤；流程表另有终止哨兵 Complete。公开阶段只做分组与调试跳转的起点，事实门仍各自独立。
import { MISSION_ANCHORS as A, MISSION_ROUTES as Routes } from "./Data_FirstLevelMissionLayout.mjs";
import { FRONT_APPROACH_ENEMIES, FRONT_FLANK_GROUP } from "./Data_FirstLevelMissionFront.mjs";
const Phase = (number, id, title, steps, spawn) => Object.freeze({
  number, id, title, steps: Object.freeze(steps), entry: steps[0], spawn: Object.freeze(spawn),
});
export const FIRST_LEVEL_STAGES = Object.freeze([
  Phase(1, "Trapped", "黑屏、爆炸、受困", ["Trapped"], A.bunker),
  Phase(2, "Rescue", "班长救人，撤入后交通壕", ["BunkerRescue", "RearTrench"], A.bunker),
  Phase(3, "Support", "夺取右侧阵位，接回第一批守军", ["Support"], Routes.support[0]),
  Phase(4, "MachineGun", "战车压进，退至阵位后侧", ["MachineGun"], A.front),
  Phase(5, "Tank", "班长带路取弹，炸停战车", ["Tank"], Routes.bundle[0]),
  Phase(6, "Orders", "回到伤员集结处，接下后送", ["Orders"], A.collection),
  Phase(7, "South", "沿沟南行", ["South"], A.collection),
  Phase(8, "Village", "主街受阻", ["Village"], Routes.village[0]),
  Phase(9, "Melee", "灶屋—连屋近战", ["Melee"], A.melee),
  Phase(10, "Courtyard", "打开内院，放行担架", ["Courtyard"], A.melee),
  Phase(11, "TransferApproach", "抵达桥头接运点", ["TransferApproach"], {x:53,z:40}),
  Phase(12, "Transfer", "掩护装载与离开", ["Transfer", "CartRide"], {x:94,z:101}),
  Phase(13, "AirFirst", "日机空袭桥头道路与车列", ["AirFirst"], A.cartHalt),
  Phase(14, "Dive", "第二轮扫射，转入西沟", ["Carry", "Dive", "Rescue"], A.ditchMouth),
  Phase(15, "Regroup", "降压：收拢、换手抬运、找到接收处", ["Regroup", "WallPath", "ReceptionGate"], A.retreatA),
  Phase(16, "Handover", "完成交接", ["Handover"], MISSION_RECEPTION_SPACE.entry),
  Phase(17, "Death", "确认老周死亡", ["Death"], MISSION_RECEPTION_SPACE.deathView),
  Phase(18, "Bridge", "接应回援尾队，奉令毁桥，夜入滕城", ["BridgeOrders", "BridgeCover", "BridgeWithdraw", "NightMarch"], MISSION_RECEPTION_SPACE.deathView),
]);
export const FIRST_LEVEL_ENCOUNTER_STARTS = Object.freeze({
  bunkerAssault:1, bunkerBackdrop:1, bunkerPursuit:2, frontFlank:2, frontOfficer:2, frontReserve:4,
  front:2, approach:2, tank:2, village:3, melee:3, machineGun:2, bundleApproach:2,
  courtyard:10, transfer:12, transferAlley:12, air:13, bridgeNorth:18,
});
// These belong to the current public phase but arrive after its entry encounter.
export const FIRST_LEVEL_DEFERRED_ENCOUNTERS=Object.freeze({
  12:Object.freeze(["transferAlley"]),
  18:Object.freeze(["bridgeNorth"]),
});
// Reaching the inner court assumes its entrance has been cleared; the window
// gun and side courtyard defenders still belong to the upcoming capture task.
export const FIRST_LEVEL_STAGE_CLEARED_ENEMIES = Object.freeze({
  // A 04 debug start represents the observed continuous 03→04 battlefield.
  // Capturing the right nest requires all four existing position guards to be neutralized.
  // Rebuild the persistent roster while pre-clearing those four original ids.
  // The flank group is cleared to its usual survivor too: a continuous run reaches 04 / 05 with 0–1 of the four flank
  // men alive, and that one is always FrontFlankA (2026-09-25 Gate: three 03→06 drives read 0, 1, 1 at both the
  // 03→04 and the 04→05 transition; a checkpoint start used to bring back all four on their start line at x 50–59).
  4: Object.freeze([...FRONT_APPROACH_ENEMIES.map(spec=>spec.id),...FRONT_FLANK_GROUP.slice(1).map(spec=>spec.id)]),
  5: Object.freeze([...FRONT_APPROACH_ENEMIES.map(spec=>spec.id),...FRONT_FLANK_GROUP.slice(1).map(spec=>spec.id)]),
  9: Object.freeze(["VillageCorner","KitchenGuard"]),
  10: Object.freeze(["VillageCorner","KitchenGuard"]),
});
// Where a checkpoint start puts live enemies who, in a continuous run, have moved by then. The tank escorts ride
// with the tank from its road cutting; from their spawn (x 99–107) they are beyond TANK.escorts.joinRangeM (30 m) of
// the tank at a 04 / 05 start, so they never joined it and 05 had no escorts. The points are what three continuous
// 03→06 drives read at the 03→04 and 04→05 transitions (2026-09-25 Gate, STAGE_ENTRY_ENEMIES; each read within 4 m of it).
// Only a checkpoint start reads this (Script_FirstLevelMissionStageJump); a continuous run is untouched.
export const FIRST_LEVEL_CHECKPOINT_ENEMY_POSTS = Object.freeze({
  4: Object.freeze({TankEscortA:{x:69,z:-204},TankEscortB:{x:67,z:-212},TankEscortC:{x:60,z:-207},TankEscortD:{x:61,z:-212}}),
  5: Object.freeze({TankEscortA:{x:40,z:-164},TankEscortB:{x:40,z:-173.5},TankEscortC:{x:38,z:-163.5},TankEscortD:{x:39.5,z:-172}}),
});
// 下标对齐 FIRST_LEVEL_STAGES（第 n 阶段读 [n-1]）。这里写的是**跳到该阶段时仍活着**的组，
// 没列进来又已经开始过的组会被登记成 spawned（不再重建）。
export const FIRST_LEVEL_STAGE_ENCOUNTERS = Object.freeze([
  // bunkerBackdrop / bunkerPursuit / frontReserve are fact-activated (their owning mechanism spawns
  // them, see MISSION_ENCOUNTER_ACTIVATION), so a jump never recreates them through the generic spawner.
  ["bunkerAssault"], ["bunkerAssault","front","frontFlank","frontOfficer","approach","machineGun","tank","bundleApproach"],
  ["front","frontFlank","frontOfficer","approach","machineGun","tank","bundleApproach","village","melee"],
  ["front","frontFlank","frontOfficer","approach","machineGun","tank","bundleApproach","village","melee"],
  ["front","frontFlank","frontOfficer","machineGun","approach","tank","village","melee","bundleApproach"],
  ["village","melee"], ["village","melee"], ["village","melee"], ["village","melee"],
  ["village","courtyard"], [], ["transfer"], ["air"], ["air"],
  [], [], [], [],
].map(Object.freeze));
export function FirstLevelStageForStep(step) {
  return FIRST_LEVEL_STAGES.find(stage => stage.steps.includes(step))
    || (step === "Complete" ? FIRST_LEVEL_STAGES.at(-1) : null);
}
export function ResolveFirstLevelStage(value) {
  const number = typeof value === "number" ? value : /^\d+$/.test(value) ? Number(value) : null;
  const stage = number === null ? FIRST_LEVEL_STAGES.find(stage => stage.id === value)
    : FIRST_LEVEL_STAGES.find(stage => stage.number === number);
  if (!stage) throw new Error(`Unknown first-level stage: ${String(value)}`);
  return stage;
}
