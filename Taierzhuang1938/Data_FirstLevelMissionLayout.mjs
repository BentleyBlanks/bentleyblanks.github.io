import { MISSION_TRAIN } from "./Data_FirstLevelMissionTrain.mjs";
import { P012_STATION_BLOCKS } from "./Data_FirstLevelP012Station.mjs";
import { MISSION_TERRAIN, SampleMissionTerrain } from "./Data_FirstLevelMissionTerrain.mjs";
const blocks = [],
  gates = [],
  surfaces = [];
function Block(id, x, z, w, h, d, semantic = "structure", extra = {}) {
  const block = {
    id,
    x,
    z,
    w,
    h,
    d,
    y: SampleMissionTerrain(x, z) + h / 2,
    semantic,
    tag: "whiteboxWall",
    ...extra,
  };
  blocks.push(block);
  return block;
}
function Wall(id, x, z, w, h, d) {
  return Block(id, x, z, w, h, d, "cover", { cover: { faceX: 0, faceZ: -1 } });
}
function DoorWall(id, x, z, w, h, opening = 3.8) {
  const side = (w - opening) / 2;
  Wall(`${id}Left`, x - (w + opening) / 4, z, side, h, 0.6);
  Wall(`${id}Right`, x + (w + opening) / 4, z, side, h, 0.6);
  Block(`${id}Lintel`, x, z, opening, 0.45, 0.6, "structure", { y: SampleMissionTerrain(x, z) + h - 0.225 });
}
function Room(id, x, z, w, d, { southDoor = true, northDoor = true, eastWindow = false } = {}) {
  if (southDoor) DoorWall(`${id}South`, x, z + d / 2, w, 2.9);
  else Wall(`${id}South`, x, z + d / 2, w, 2.9, 0.6);
  if (northDoor) DoorWall(`${id}North`, x, z - d / 2, w, 2.9);
  else Wall(`${id}North`, x, z - d / 2, w, 2.9, 0.6);
  Wall(`${id}West`, x - w / 2, z, 0.6, 2.9, d);
  if (eastWindow) {
    Wall(`${id}EastFront`, x + w / 2, z - d * 0.36, 0.6, 2.9, d * 0.28);
    Wall(`${id}EastBack`, x + w / 2, z + d * 0.36, 0.6, 2.9, d * 0.28);
    Wall(`${id}WindowSill`, x + w / 2, z, 0.6, 0.82, d * 0.44);
    Block(`${id}WindowTop`, x + w / 2, z, 0.6, 0.5, d * 0.44, "structure", {
      y: SampleMissionTerrain(x + w / 2, z) + 2.65,
    });
  } else Wall(`${id}East`, x + w / 2, z, 0.6, 2.9, d);
  // Cut-away whitebox roof leaves rooms legible while retaining actual cover.
  Block(`${id}Roof`, x - w * 0.28, z, w * 0.4, 0.22, d, "structure", { y: 3.05 });
}
// Reuse the accepted P012 open freight-wagon boards, ribs and undercarriage.
// Only the east door is recentered on this mission's existing unloading lane.
const sourceCarFloor = P012_STATION_BLOCKS.find(
  (block) => block.id === "StationCar0Floor",
);
const sourceCarParts = P012_STATION_BLOCKS.filter((block) =>
  /^StationCar0(?:NorthEnd|SouthEnd|WestWaist|WestRib|Wheel|Underframe)/.test(
    block.id,
  ),
);
for (let i = 0; i < 3; i++) {
  const z = 74 + i * 14,
    id = "StationCar" + i,
    lengthScale = 12.8 / sourceCarFloor.d;
  const floor = Block(
    id + "Floor",
    -77,
    z,
    sourceCarFloor.w,
    0.24,
    12.8,
    "structure",
    { y: 1.05 },
  );
  surfaces.push(floor);
  for (const part of sourceCarParts) {
    Block(
      part.id.replace("StationCar0", id),
      -77 + part.x - sourceCarFloor.x,
      z + (part.z - sourceCarFloor.z) * lengthScale,
      part.w,
      part.h,
      part.d * lengthScale,
      part.semantic,
      { y: part.y - 0.08 },
    );
  }
  for (const side of [-1, 1]) {
    Block(
      id + "EastWaist" + side,
      -74.6,
      z + side * 4.3,
      0.22,
      1.4,
      4.2,
      "structure",
      { y: 1.87 },
    );
    for (let rib = 0; rib < 3; rib++)
      Block(
        id + "EastRib" + side + "_" + rib,
        -74.44,
        z + side * (2.4 + rib * 1.5),
        0.12,
        1.5,
        0.14,
        "boundary",
        { y: 1.87 },
      );
  }
  const deck = floor.y + floor.h / 2, benchTop = deck + MISSION_TRAIN.life.seatTopM;
  for (const [side, end, depth, offset] of [[-1,0,11.2,0],[1,-1,4.6,-3.35],[1,1,4.6,3.35]]) {
    const benchId=id+'Bench'+side+'_'+end, x=-77+side*MISSION_TRAIN.life.sideSeatM;
    // The seated actor keeps its existing ground capsule; furniture is visual support.
    Block(benchId, x, z+offset, .68, .14, depth, 'trainWood', {y:benchTop-.07,solid:false});
    for(const leg of [-1,1]) Block(benchId+'Leg'+leg,x,z+offset+leg*(depth/2-.25),.12,MISSION_TRAIN.life.seatTopM-.14,.16,'trainWood',
      {y:deck+(MISSION_TRAIN.life.seatTopM-.14)/2,solid:false});
  }
  // Cargo stays in the end pockets. The middle door and central unloading lane stay clear.
  for(const end of [-1,1]) {
    const cargoZ=z+end*5.65, cargoId=id+'Cargo'+end;
    Block(cargoId+'Crate',-77,cargoZ,.82,.58,.62,'trainWood',{y:deck+.29});
    for(const band of [-1,1]) Block(cargoId+'Band'+band,-77+band*.28,cargoZ,.055,.60,.64,'trainMetal',{y:deck+.30,solid:false});
    Block(cargoId+'Lid',-77,cargoZ,.86,.045,.65,'trainWood',{y:deck+.603,solid:false});
    for(const side of [-1,1]) {
      const x=-77+side*1.65;
      Block(cargoId+'Bedroll'+side,x,cargoZ,.56,.28,.55,'trainCanvas',{y:benchTop+.14,solid:false});
      for(const strap of [-1,1]) Block(cargoId+'Strap'+side+'_'+strap,x+strap*.17,cargoZ,.045,.30,.57,'trainWood',{y:benchTop+.15,solid:false});
    }
  }
  for(const [slot,seat] of MISSION_TRAIN.cars[i].seats.entries()) if(Math.abs(seat.x+77)>1.2) {
    const side=Math.sign(seat.x+77), packId=id+'Pack'+slot, x=-77+side*2.04;
    Block(packId,x,seat.z,.27,.43,.35,'trainCanvas',{y:benchTop+.215,solid:false});
    Block(packId+'Flap',x-side*.15,seat.z,.045,.14,.36,'trainWood',{y:benchTop+.34,solid:false});
    Block(packId+'Canteen',x,seat.z+.30,.14,.21,.13,'trainMetal',{y:benchTop+.13,solid:false});
  }
  if (i < 2)
    Block(id + "Coupler", -77, z + 7, 0.4, 0.35, 1.4, "boundary", { y: 0.97 });
  for (let step = 0; step < 4; step++) {
    const stair = Block(
      "StationExitStep" + i + "_" + step,
      -74.3 + step * 0.5,
      z,
      0.65,
      1.02 - step * 0.25,
      4.2,
      "step",
      { y: (1.02 - step * 0.25) / 2 },
    );
    surfaces.push(stair);
  }
  gates.push({
    id: "TrainDoor" + i,
    x: -74.6,
    y: 1.87,
    z,
    w: 0.22,
    h: 1.4,
    d: 4.5,
    semantic: "structure",
    signal: "MissionTrainStopped",
  });
}
// Keep the original box-built steam engine: open cab, chimney, wheels and side rods.
const sourceEngineFrame = P012_STATION_BLOCKS.find(
  (block) => block.id === "StationEngineFrame",
);
for (const part of P012_STATION_BLOCKS.filter((block) =>
  block.id.startsWith("StationEngine"),
)) {
  Block(
    part.id,
    -77 + part.x - sourceEngineFrame.x,
    58 + part.z - sourceEngineFrame.z,
    part.w,
    part.h,
    part.d,
    part.semantic,
    { y: part.y },
  );
}
for (let z = -196; z < 176; z += 3)
  Block("RailSleeper" + z, -77, z, 4.5, 0.12, 0.3, "structure");
for (const x of [-77.75, -76.25])
  Block("Rail" + x, x, -10, 0.1, 0.14, 374, "structure", { y: 0.76 });
Block("SupplyTable", -68.5, 66, 2, 0.85, 1, "missionRoute");
Room("UnloadingShed", -58, 85, 9, 9);
Wall("BrokenStationWall", -68, 55, 9, 1.1, 0.65);
// Defensive parapets are small sandbag stacks above genuine excavated soil.
for (const x of [-25, 0, 15]) {
  Wall(`FrontParapet${x}`, x, -131, 6, 0.55, 0.9);
  Wall(`FrontTraverseCover${x}`, x + 3.6, -119.4, 0.8, 0.65, 2);
}
Block("BundleCrate", 13, -118, 1.2, 0.5, 0.8, "missionRoute");
gates.push({
  id: "ForwardGunNest",
  x: -24,
  y: 0.85,
  z: -130,
  w: 0.25,
  h: 0.3,
  d: 1.6,
  semantic: "danger",
  signal: "MissionForwardGunDestroyed",
});
for (const side of [-1, 1]) Wall(`MachineGunSideCover${side}`, side * 2.8, -128, 0.65, 1.8, 2.4);
for (const [i, x, z, w] of [
  [0, -26, -164, 10],
  [1, 28, -158, 9],
  [2, 62, -144, 10],
  [3, 35, -82, 14],
])
  Wall(`FieldRuin${i}`, x, z, w, 1.3, 0.7);
// The village route passes through a kitchen, inner courtyard and connected rooms.
Room("Kitchen", 58, -9, 12, 15, { northDoor: true, southDoor: true });
Room("ConnectedHouse", 58, 8, 12, 15, { northDoor: true, southDoor: true, eastWindow: true });
// A real cupboard wall hides the bayonet soldier from the kitchen approach.
// The passage at x=58 remains open, and a player who flanks can still shoot him early.
Wall("MeleeAlcoveScreen", 61, 2.2, 4, 1.9, 0.35);
Room("MachineGunHouse", 43, 8, 12, 15, { northDoor: true, southDoor: true, eastWindow: true });
Wall("CourtyardWest", 33, 25, 0.7, 2.5, 19);
Wall("CourtyardEast", 72, 20, 0.7, 2.5, 28);
DoorWall("CourtyardExit", 53, 34, 39, 2.5, 5);
gates.push({
  id: "MissionCourtyardGate",
  x: 53,
  y: 1.3,
  z: 34,
  w: 5,
  h: 2.6,
  d: 0.4,
  semantic: "missionRoute",
  signal: "MissionCourtyardGateOpen",
});
Wall("VillageRoadBlock", 36, -10, 10, 1.15, 0.7);
Wall("EastLaneRuin", 95, 6, 0.7, 2.1, 23);
Wall("VillageApproachCover", 28, -30, 9, 1.05, 0.6);
// Ground-level transfer yard, queue lane and two loading bays.
for (const x of [64, 88])
  for (const z of [109, 129]) Block(`TransferPost${x}_${z}`, x, z, 0.4, 3.5, 0.4, "structure");
Block("TransferCanopy", 76, 119, 25, 0.25, 22, "structure", { y: 3.65 });
Wall("TransferEastCover", 98, 104, 0.75, 1.1, 11);
Wall("TransferCorner", 95, 96, 8, 1.1, 0.7);
Wall("TransferWestCover", 53, 121, 0.75, 1.1, 10);
Block("TriageDesk", 66, 116, 2, 0.85, 1, "missionRoute");
Block("TransferCrates", 93, 111, 2, 1.15, 3, "cover");
// Temporary bridge spans the shallow drainage channel; a structural deck is valid.
const bridge = Block("TemporaryBridge", 76, 153, 8, 0.25, 7, "structure", { y: 0.13, dynamic: true });
surfaces.push(bridge);
gates.push({ ...bridge, walkableId: bridge.id, signal: "MissionBridgeDestroyed" });
// Rearguard cover alternates beside the excavated western drainage route.
for (const [id, x, z, w, d] of [
  ["DrainCorner", 18, 102, 7, 0.7],
  ["RearWallGap", -45, 73, 0.7, 10],
  ["BackyardWall", -87, 47, 9, 0.7],
])
  Wall(id, x, z, w, 1.2, d);
Room("RearCourtyardHouse", -98, 63, 13, 12, { eastWindow: true });
// Reception courtyard with street-facing cover and rear exit, never a safe room.
Room("ReceptionStreetRoom", -130, 29, 10, 14, { eastWindow: true });
Room("ReceptionWard", -151, 34, 14, 18, { eastWindow: true });
Wall("ReceptionNorth", -147, 18, 37, 2.8, 0.7);
DoorWall("ReceptionSouth", -147, 52, 37, 2.8, 5);
Wall("ReceptionWest", -166, 35, 0.7, 2.8, 34);
Block("ReceptionMedicine", -156, 36, 1, 0.7, 1, "missionRoute");
Wall("RearExitCover", -169.5, 29, 6, 1.05, 0.7);
Wall("FinalAlleyCover", -185, 10, 0.7, 1.2, 12);
export const MISSION_ANCHORS = Object.freeze({
  train: MISSION_TRAIN.player,
  unload: { x: -66, z: 66 },
  front: { x: 0, z: -124 },
  gun: { x: 0, z: -128 },
  bundle: { x: 13, z: -118 },
  throw: { x: 30, z: -117 },
  village: { x: 55, z: -20 },
  melee: { x: 58, z: 6 },
  ditchMouth: { x: 53, z: 114 },
  transferSupply: { x: 93, z: 110 },
  forwardNest: { x: -24, z: -130 },
  gate: { x: 53, z: 34 },
  courtCover: { x: 67, z: 24 },
  transfer: { x: 95, z: 103 },
  queue: { x: 74, z: 111 },
  ditch: { x: 39, z: 116 },
  retreatA: { x: 18, z: 109 },
  retreatB: { x: -51, z: 82 },
  retreatC: { x: -99, z: 42 },
  reception: { x: -131, z: 31 },
  zhouPickup: { x: -139, z: 47 },
  zhouDrop: { x: -150, z: 42 },
  finalCover: { x: -160, z: 46 },
  rearExit: { x: -171, z: 35 },
  end: { x: -186, z: -8 },
});
export const MISSION_ROUTES = Object.freeze({
  flank: [
    { x: 69, z: -139 },
    { x: 80, z: -90 },
    { x: 89, z: -45 },
    { x: 91, z: -10 },
  ],
  support: MISSION_TERRAIN.trenches[0].points,
  bundle: MISSION_TERRAIN.trenches[2].points,
  south: [
    { x: -36, z: -124 },
    { x: 0, z: -124 },
    { x: -8, z: -112 },
    { x: -8, z: -78 },
    { x: -24, z: -60 },
    { x: -24, z: -18 },
    { x: 0, z: 0 },
    { x: 24, z: -20 },
    { x: 48, z: -20 },
  ],
  village: [
    { x: 48, z: -20 },
    { x: 58, z: -20 },
    { x: 58, z: -9 },
    { x: 58, z: 8 },
    { x: 58, z: 18 },
    { x: 53, z: 24 },
    { x: 53, z: 34 },
    { x: 64, z: 52 },
    { x: 76, z: 85 },
    { x: 74, z: 111 },
  ],
  southTraffic: [
    { x: 8, z: -119 },
    { x: 8, z: -90 },
    { x: 4, z: -66 },
    { x: -4, z: -35 },
    { x: 2, z: -8 },
    { x: 22, z: 8 },
    { x: 27, z: 40 },
    { x: 55, z: 57 },
    { x: 76, z: 85 },
    { x: 76, z: 170 },
  ],
  evacuation: MISSION_TERRAIN.trenches[3].points,
  reception: [
    { x: -138, z: 40 },
    { x: -138, z: 49 },
    { x: -151, z: 49 },
    { x: -151, z: 41 },
  ],
  exit: [
    { x: -151, z: 41 },
    { x: -151, z: 47 },
    { x: -147, z: 49 },
    { x: -147, z: 54 },
    { x: -172, z: 54 },
    { x: -174, z: 29 },
    { x: -187, z: 20 },
    { x: -187, z: 12 },
    { x: -186, z: -8 },
  ],
});
export const MISSION_PLACEMENT = Object.freeze({
  stationCasualties: [
    { x: -65, z: 73, yaw: 0.3, health: 0 },
    { x: -62, z: 69, yaw: -0.4, health: 35 },
    { x: -69, z: 70, yaw: 1.2, health: 0 },
    { x: -64, z: 77, yaw: 2.1, health: 28 },
  ],
  tankStart: { x: 36, z: -173 },
  tankTargets: [
    { x: -24, z: -130 },
    { x: 16, z: -131 },
    { x: 2, z: -132 },
  ],
  cartBays: [
    { x: 80, z: 120 },
    { x: 86, z: 120 },
    { x: 80, z: 127 },
    { x: 86, z: 127 },
  ],
});
export const MISSION_LAYOUT = Object.freeze({
  id: "FirstLevelMissionSeptember07",
  terrain: "P012Heightfield",
  terrainSpec: MISSION_TERRAIN,
  bounds: { minX: -205, maxX: 137, minZ: -202, maxZ: 180 },
  ground: { x: -34, z: -11, w: 342, d: 382, h: 1, y: -0.5, semantic: "ground" },
  semanticColors: {
    trainWood: 0x82715c,
    trainCanvas: 0x747c67,
    trainMetal: 0x59625e,
    ground: 0x86877d,
    structure: 0xc1bdb1,
    cover: 0x6d8b98,
    step: 0xc4a668,
    missionRoute: 0x759b83,
    stretcherRoute: 0x9caea5,
    danger: 0x915f51,
    boundary: 0x393d3c,
  },
  blocks,
  gates,
  walkableSurfaces: surfaces,
  zones: Object.entries(MISSION_ANCHORS).map(([id, p]) => ({ id, ...p, radius: 8 })),
});
