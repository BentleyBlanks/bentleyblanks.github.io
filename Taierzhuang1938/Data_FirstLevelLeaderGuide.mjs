import { MISSION_ANCHORS as A } from "./Data_FirstLevelMissionLayout.mjs";
import { OPENING } from "./Data_FirstLevelOpening.mjs";
const Entry = (mode, cue, target = null, extra = {}) => Object.freeze({mode, cue: `Guide${cue}`, target, ...extra});
// Physical actor is the destination while travelling; combat/interaction destinations
// switch to the thing the leader ordered, so a player on the gun is not told to leave it.
export const MISSION_LEADER_STAGES = Object.freeze({
  Unloading: Entry("follow", "Follow", null, {story: true}),
  TrenchEntry: Entry("cover", "Trench", OPENING.shelter),
  // "Hold the corner" points at the corner until its attack is resolved; the
  // order is not repeated over the breather that follows.
  Shelter: Entry("rally", "Shelter", OPENING.shelter, {story: true, holdTarget: OPENING.shelterCorner, holdUntil: "shelterCornerHeld"}),
  Support: Entry("follow", "Support", A.front),
  MachineGun: Entry("cover", "Gun", A.front, {story: true}),
  Tank: Entry("collect", "Bundle", A.bundle, {story: true}),
  Orders: Entry("rally", "Orders", A.orders, {story: true}),
  South: Entry("follow", "South", null, {story: true, rejoinRoute:true, hidden:true}),
  Village: Entry("move", "Kitchen", {x:58,z:-9}, {story: true}),
  Melee: Entry("clear", "Melee", A.melee),
  Courtyard: Entry("clear", "Gate", {x:43,z:8}),
  TransferApproach: Entry("follow", "Follow", null, {rejoinRoute:true}),
  Transfer: Entry("cover", "Transfer", A.transfer, {story: true}),
  AirFirst: Entry("cover", "Transfer", A.transfer, {story: true}),
  Carry: Entry("carry", "Carry", null, {story: true}),
  Rescue: Entry("cover", "Rescue", A.ditch, {story: true}),
  RetreatFirst: Entry("cover", "RetreatFirst", A.retreatA, {story: true}),
  RetreatWall: Entry("cover", "RetreatWall", A.retreatB),
  RetreatYard: Entry("cover", "RetreatYard", A.retreatC),
  Reception: Entry("cover", "Reception", A.reception, {story: true}),
  FinalCarry: Entry("carry", "Place", null, {story: true}),
  FinalDefense: Entry("cover", "RearDefense", A.rearExit, {story: true}),
  Exit: Entry("follow", "Exit", null, {story: true}),
});
export const MISSION_GUIDE_TRANSFERS = Object.freeze({
  transfer: {cue:"GuideTransfer", target:A.transfer},
  transferFlank: {cue:"GuideSouthFlank", target:{x:96,z:115}},
  transferLast: {cue:"GuideTransfer", target:A.transfer},
  transferRear: {cue:"GuideNorthRear", target:{x:91,z:94}},
});
