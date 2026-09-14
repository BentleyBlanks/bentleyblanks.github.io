import { MISSION_STAGES } from "./Data_FirstLevelMission.mjs";
import { MISSION_ROUTES as Routes, MISSION_ANCHORS as A } from "./Data_FirstLevelMissionLayout.mjs";
// Stage-local corridors include the approach, so distant new objectives do not
// immediately condemn the player standing at the previous objective.
const overrides={
  Unloading:[{x:-77,z:108},{x:-77,z:66},A.unload],
  TrenchEntry:Routes.opening,
  Support:Routes.support,
  Tank:[A.gun,A.bundle,...Routes.bundle,A.throw],
  South:[A.orders,...Routes.south],
  Village:Routes.village.slice(0,5),
  TransferApproach:Routes.village.slice(4),
  Carry:[A.transfer,A.queue,A.ditchMouth],
  RetreatFirst:Routes.evacuation.filter(p=>p.x>=A.retreatA.x),
  RetreatWall:Routes.evacuation.filter(p=>p.x<=A.retreatA.x+12 && p.x>=A.retreatB.x-12),
  RetreatYard:Routes.evacuation.filter(p=>p.x<=A.retreatB.x+12),
  FinalDefense:Routes.exit.slice(0,5),
  Exit:Routes.exit,
};
export const MISSION_RETURN_ROUTES=Object.freeze(Object.fromEntries(MISSION_STAGES.map((stage,index)=>[
  stage.id,overrides[stage.id]||[MISSION_STAGES[Math.max(0,index-1)].target,stage.target],
])));
export const MISSION_RETURN_SQUAD_STAGES=Object.freeze(['South','TransferApproach','RetreatYard','Exit']);
export const MISSION_RETURN_DISABLED_STAGES=Object.freeze(['Train','Dive','Death','Complete']);

export const MISSION_RETURN_PERSON_STAGES=Object.freeze(["Carry","Rescue","FinalCarry"]);
