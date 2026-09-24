import { MISSION_ANCHORS as A, MISSION_PLACEMENT as P } from "./Data_FirstLevelMissionLayout.mjs";
const Entry = (mode, cue, target = null, extra = {}) => Object.freeze({mode, cue: `Guide${cue}`, target, ...extra});
// Physical actor is the destination while travelling; combat/interaction destinations
// switch to the thing the leader ordered, so a player on the gun is not told to leave it.
// 2026.09.19 契约 §5：按新 27 步重排；旧的 GuideTrench/GuideShelter/GuideRetreat*/
// GuideReception/GuideRearDefense/GuideExit/GuideSouthFlank/GuideNorthRear 全部下线。
export const MISSION_LEADER_STAGES = Object.freeze({
  BunkerRescue: Entry("follow", "Follow", null, {story: true}),
  RearTrench: Entry("follow", "RearTrench", null, {story: true, rejoinRoute: true}),
  Support: Entry("follow", "Support", A.front),
  MachineGun: Entry("cover", "Gun", A.front, {story: true}),
  Tank: Entry("collect", "Bundle", A.bundle, {story: true}),
  Orders: Entry("rally", "Collection", A.collection, {story: true}),
  South: Entry("follow", "South", null, {story: true, rejoinRoute: true}),
  Village: Entry("move", "Kitchen", {x:58,z:-9}, {story: true}),
  Melee: Entry("clear", "Melee", A.melee),
  Courtyard: Entry("clear", "Gate", P.sideRoomGunner),
  TransferApproach: Entry("follow", "Follow", null, {rejoinRoute: true}),
  Transfer: Entry("cover", "Transfer", A.transfer, {story: true}),
  CartRide: Entry("move", "Cart", A.cartBoard, {story: true}),
  AirFirst: Entry("cover", "WestDitch", A.ditchMouth, {story: true}),
  Carry: Entry("carry", "Carry", null, {story: true}),
  Rescue: Entry("cover", "Rescue", A.ditch, {story: true}),
  Regroup: Entry("rally", "Follow", A.retreatA, {story: true}),
  WallPath: Entry("follow", "WallPath", null, {story: true, rejoinRoute: true}),
  ReceptionGate: Entry("move", "YardGate", A.receptionGate, {story: true}),
  Handover: Entry("carry", "Place", null, {story: true}),
  BridgeOrders: Entry("follow", "Bridge", A.bridgeCover, {story: true}),
  // 「守住南岸射位」这条命令指着射位，直到北岸火力被打掉为止；打掉之后不再重复，
  // 玩家也可以走在班长前头（尾队正在过桥）。holdUntil / leadAfter 的口径见 View()。
  BridgeCover: Entry("cover", "Bridge", A.bridgeCover,
    {story: true, holdTarget: A.bridgeCover, holdUntil: "bridgeFireBroken", leadAfter: "bridgeFireBroken"}),
  BridgeWithdraw: Entry("cover", "Withdraw", A.blastSafe, {story: true}),
  NightMarch: Entry("follow", "NorthGate", null, {story: true, hidden: true}),
});
// 12 只有两处威胁（MISSION_TRANSFER_THREATS）。
export const MISSION_GUIDE_TRANSFERS = Object.freeze({
  transfer: {cue:"GuideTransfer", target:A.transfer},
  transferAlley: {cue:"GuideAlley", target:A.sideAlley},
});
