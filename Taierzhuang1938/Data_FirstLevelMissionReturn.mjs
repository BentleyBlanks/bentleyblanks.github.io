import { MISSION_REARGUARD_POCKETS } from "./Data_FirstLevelMissionTopology.mjs";
import { MISSION_STAGES } from "./Data_FirstLevelMission.mjs";
import { MISSION_ROUTES as Routes, MISSION_ANCHORS as A } from "./Data_FirstLevelMissionLayout.mjs";
// Stage-local corridors include the approach, so distant new objectives do not
// immediately condemn the player standing at the previous objective.
const overrides={
  Unloading:[{x:-77,z:108},{x:-77,z:66},A.unload],
  TrenchEntry:Routes.opening,
  Support:Routes.support,
  Tank:[A.gun,...Routes.bundle,A.bundle],
  Orders:Routes.ordersRejoin,
  South:[A.orders,...Routes.south],
  Village:Routes.village.slice(0,5),
  TransferApproach:Routes.village.slice(4),
  Carry:[A.transfer,A.queue,A.ditchMouth],
  ...Object.fromEntries(MISSION_REARGUARD_POCKETS.map(pocket=>[pocket.id,pocket.route])),
  FinalDefense:Routes.exit.slice(0,5),
  Exit:Routes.exit,
};
export const MISSION_RETURN_ROUTES=Object.freeze(Object.fromEntries(MISSION_STAGES.map((stage,index)=>[
  stage.id,overrides[stage.id]||[MISSION_STAGES[Math.max(0,index-1)].target,stage.target],
])));
export const MISSION_RETURN_SQUAD_STAGES=Object.freeze(['South','TransferApproach','RetreatYard','Exit']);
export const MISSION_RETURN_DISABLED_STAGES=Object.freeze(['Train','Dive','Death','Complete']);

export const MISSION_RETURN_PERSON_STAGES=Object.freeze(["Carry","Rescue","FinalCarry"]);
