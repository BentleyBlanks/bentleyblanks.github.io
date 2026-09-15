import { MISSION_RECEPTION_SPACE } from "./Data_FirstLevelMissionTopology.mjs";
// Notion 2026-09-14: public phases and conditions from the current topology table.
// Public phases group the existing gameplay steps; their fact gates remain independent.
import { MISSION_ANCHORS as A, MISSION_ROUTES as Routes } from "./Data_FirstLevelMissionLayout.mjs";
const Phase = (number, id, title, steps, spawn) => Object.freeze({
  number, id, title, steps: Object.freeze(steps), entry: steps[0], spawn: Object.freeze(spawn),
});
export const FIRST_LEVEL_STAGES = Object.freeze([
  Phase(1, "Train", "军列上的人味", ["Train"], A.train),
  Phase(2, "Unloading", "接近卸载点，遭遇炮击", ["Unloading"], A.train),
  Phase(3, "Support", "清沟、喘息与支援外围阵地", ["TrenchEntry","Shelter","Support"], A.unload),
  Phase(4, "MachineGun", "击退前方日军（机枪可选）", ["MachineGun"], {x:0,z:-127.4}),
  Phase(5, "Tank", "集束手榴弹炸停战车", ["Tank"], Routes.bundle[0]),
  Phase(6, "Orders", "后送命令", ["Orders"], A.orders),
  Phase(7, "South", "护送转场，抵达村口", ["South"], A.orders),
  Phase(8, "Village", "村口截击", ["Village"], Routes.village[0]),
  Phase(9, "Melee", "屋内伏击：刺刀顶上来", ["Melee"], A.melee),
  Phase(10, "Courtyard", "夺下院子并掩护伤员通过", ["Courtyard"], A.melee),
  Phase(11, "TransferApproach", "转运区抵达", ["TransferApproach"], {x:53,z:40}),
  Phase(12, "Transfer", "完整转运区防御", ["Transfer"], {x:94,z:101}),
  Phase(13, "AirFirst", "希望被打断——空袭与接替担架", ["AirFirst","Carry"], {x:94,z:101}),
  Phase(14, "Dive", "第二轮扫射与顺子松手", ["Dive","Rescue"], A.ditchMouth),
  Phase(15, "RetreatFirst", "撤向城边接收院", ["RetreatFirst","RetreatWall","RetreatYard"], A.retreatA),
  Phase(16, "Reception", "临时接收院仍在战斗", ["Reception","FinalCarry"], MISSION_RECEPTION_SPACE.entry),
  Phase(17, "Death", "老周牺牲", ["Death"], MISSION_RECEPTION_SPACE.deathView),
  Phase(18, "FinalDefense", "接收院被逼退，战斗收尾", ["FinalDefense","Exit"], MISSION_RECEPTION_SPACE.deathView),
]);
export const FIRST_LEVEL_ENCOUNTER_STARTS = Object.freeze({
  bundleApproach:5, surface:2, intrusion:2, shelterPursuit:3, front:3, machineGun:4, approach:3, tank:3, village:3, melee:3, courtyard:10,
  transfer:12, transferFlank:12, transferLast:12, transferRear:12, air:13, retreat:15,
  retreatWall:15,retreatYard:15,reception:16, final:17,
});
// These belong to the current public phase but arrive after its entry encounter.
export const FIRST_LEVEL_DEFERRED_ENCOUNTERS=Object.freeze({
  3:Object.freeze(["shelterPursuit","front","approach","tank","village","melee"]),
  12:Object.freeze(["transferFlank","transferLast","transferRear"]),
  15:Object.freeze(["retreatWall","retreatYard"]),
});
// Reaching the inner court assumes its entrance has been cleared; the window
// gun and side courtyard defenders still belong to the upcoming capture task.
export const FIRST_LEVEL_STAGE_CLEARED_ENEMIES = Object.freeze({
  9: Object.freeze(["VillageCorner","KitchenGuard"]),
  10: Object.freeze(["VillageCorner","KitchenGuard"]),
});
export const FIRST_LEVEL_STAGE_ENCOUNTERS = Object.freeze([
  [], [],
  ["surface","intrusion"],
  ["front","machineGun","approach","tank","village","melee"],
  ["front","machineGun","approach","tank","village","melee","bundleApproach"],
  ["village","melee"], ["village","melee"], ["village","melee"], ["village","melee"],
  ["village","courtyard"], [], ["transfer"], ["air"], ["air"],
  ["retreat"], ["reception"], ["final"], ["final"],
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
