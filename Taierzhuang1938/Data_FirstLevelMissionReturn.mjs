import { MISSION_STAGE_ROUTES as Stage } from "./Data_FirstLevelMissionTopology.mjs";
import { MISSION_STAGES } from "./Data_FirstLevelMission.mjs";
import { MISSION_ROUTES as Routes, MISSION_ANCHORS as A } from "./Data_FirstLevelMissionLayout.mjs";
// Stage-local corridors include the approach, so distant new objectives do not
// immediately condemn the player standing at the previous objective.
// 2026.09.19 重构：按新 27 步重排（契约 §1）。
const overrides={
  RearTrench:Stage.rearTrench,
  Support:Routes.support,
  Tank:[A.gun,...Routes.bundle,A.bundle],
  Orders:Stage.collectionReturn,
  South:Stage.southWalk,
  Village:Routes.village.slice(0,5),
  Courtyard:Stage.courtyardBypass,
  TransferApproach:Routes.village.slice(4),
  CartRide:Stage.cartRide,
  Carry:[A.transfer,A.queue,A.ditchMouth],
  Regroup:Routes.evacuation.slice(0,4),
  WallPath:Stage.wallPath,
  ReceptionGate:[...Stage.wallPath.slice(-2),A.receptionGate],
  BridgeOrders:Stage.toBridge,
  BridgeCover:[A.bridgeCover,A.bridgeSouthEnd],
  BridgeWithdraw:Stage.bridgeWithdraw,
  NightMarch:Stage.nightMarch,
};
export const MISSION_RETURN_ROUTES=Object.freeze(Object.fromEntries(MISSION_STAGES.map((stage,index)=>[
  stage.id,overrides[stage.id]||[MISSION_STAGES[Math.max(0,index-1)].target,stage.target],
])));
export const MISSION_RETURN_SQUAD_STAGES=Object.freeze(['South','TransferApproach','WallPath','NightMarch']);
// 受控演出与黑屏字幕那几步不报「返回」：玩家本来就没有控制权。
export const MISSION_RETURN_DISABLED_STAGES=Object.freeze(['Trapped','BunkerRescue','CartRide','Dive','Death','NightMarch','Complete']);

export const MISSION_RETURN_PERSON_STAGES=Object.freeze(["Carry","Rescue","WallPath","Handover"]);
