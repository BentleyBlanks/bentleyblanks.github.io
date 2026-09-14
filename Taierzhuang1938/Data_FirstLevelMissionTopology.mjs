// Notion: 空间、流程拓扑图 / 2026.09.14. X east, Z south, metres.
// The sketch fixes adjacency and direction, not a surveyed metric scale.
export const MISSION_TOPOLOGY_VERSION = "first-level-20260914-topology-r1";
export const MISSION_REAR_ANCHORS = Object.freeze({
  ditchMouth: {x:53,z:114}, ditch: {x:39,z:116},
  retreatA: {x:32,z:140}, retreatB: {x:56,z:184}, retreatC: {x:9,z:220},
  reception: {x:-6,z:231}, zhouPickup: {x:-14,z:247}, zhouDrop: {x:-25,z:242},
  finalCover: {x:-35,z:247}, rearExit: {x:-44,z:244}, end: {x:-61,z:192},
});
const A=MISSION_REAR_ANCHORS;
export const MISSION_REAR_ROUTES = Object.freeze({
  evacuation: [
    {x:54,z:114}, A.ditch, A.retreatA, {x:50,z:150}, {x:56,z:165},
    A.retreatB, {x:56,z:207}, {x:26,z:215}, A.retreatC, {x:9,z:240}, {x:-13,z:240},
  ],
  reception: [{x:-13,z:240},{x:-13,z:249},{x:-26,z:249},{x:-26,z:241}],
  exit: [
    {x:-26,z:241},{x:-26,z:247},A.finalCover,{x:-38,z:244},A.rearExit,
    {x:-49,z:229},{x:-62,z:220},{x:-62,z:212},A.end,
  ],
});
export const MISSION_RECEPTION_SPACE = Object.freeze({
  bounds: {minX:-41,maxX:1,minZ:218,maxZ:252},
  ward: {minX:-32,maxX:-20,minZ:225,maxZ:243},
  litterOrigin: {x:-30,z:229}, walkerOrigin: {x:-37,z:244.2},
  entry: {x:-13,z:240}, wardEntry: {x:-26,z:240},
  wardExit: {x:-26,z:247}, yardJunction: {x:-13,z:249},
  deathView: {x:-26,z:243.6},
});
export const MISSION_REARGUARD_POCKETS = Object.freeze([
  {id:"RetreatFirst",anchor:A.retreatA,route:MISSION_REAR_ROUTES.evacuation.slice(0,4)},
  {id:"RetreatWall",anchor:A.retreatB,route:MISSION_REAR_ROUTES.evacuation.slice(3,7)},
  {id:"RetreatYard",anchor:A.retreatC,route:MISSION_REAR_ROUTES.evacuation.slice(6)},
]);
export const MISSION_SOUTH_BRIDGE = Object.freeze({
  deck: {x:76,z:153,w:8,d:7},
  // Visible collapsed abutment blocks the former road after the actual bomb hit.
  wreck: {id:"MissionBridgeWreck",x:76,z:153,w:8.8,h:4.4,d:2.8,y:.45,
    semantic:"earthDark",appearSignal:"MissionBridgeDestroyed",signal:"MissionBridgeRepaired"},
});
