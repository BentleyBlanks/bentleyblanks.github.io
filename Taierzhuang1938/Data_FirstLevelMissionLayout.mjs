import { OPENING } from "./Data_FirstLevelOpening.mjs";
import { MISSION_TRAIN } from "./Data_FirstLevelMissionTrain.mjs";
import { MISSION_DEFENSE_POSTS } from "./Data_FirstLevelMissionFortifications.mjs";
import { P012_STATION_BLOCKS } from "./Data_FirstLevelP012Station.mjs";
import { MISSION_TERRAIN, SampleMissionTerrain, MissionPathDistance, SampleMissionGroundColor } from "./Data_FirstLevelMissionTerrain.mjs";
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
function GroundedWall(id,x,z,w,h,d){
  const wall=Wall(id,x,z,w,h,d),top=wall.y+wall.h/2;
  const base=Math.min(...[-1,0,1].flatMap(a=>[-1,0,1].map(b=>SampleMissionTerrain(x+a*w/2,z+b*d/2))))-.1;
  wall.y=(top+base)/2;wall.h=top-base;return wall;
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
  Block(`${id}Roof`, x - w * 0.28, z, w * 0.4, 0.22, d, "structure", { y: SampleMissionTerrain(x,z) + 3.05 });
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
for (let z = -196; z < MISSION_TRAIN.approachEndZ; z += 3)
  Block("RailSleeper" + z, -77, z, 4.5, 0.12, 0.3, "structure");
for (const x of [-77.75, -76.25])
  Block("Rail" + x, x, (MISSION_TRAIN.approachEndZ-197)/2, 0.1, 0.14, MISSION_TRAIN.approachEndZ+197, "structure", { y: 0.76 });
Block("SupplyTable", -68.5, 66, 2, 0.85, 1, "missionRoute");
Room("UnloadingShed", -58, 85, 9, 9);
Wall("BrokenStationWall", -68, 55, 9, 1.1, 0.65);
GroundedWall("ApronEastBank",-63,80,.8,1.65,9);
GroundedWall("TrenchMouthBank",-58.5,65,.9,1.5,7);
GroundedWall("FlankLockBank",-37,56,.65,1.1,5);
GroundedWall("RailLockBank",-90.5,48,.65,1.1,5);
// Roofed dressing recess and two solid traverses shelter the private exchange.
Block("OpeningShelterRoof",-32,-20,7,.25,11,"timber",{y:1.05});
GroundedWall("OpeningShelterSouth",-32,-15.5,7,2.4,.8);
GroundedWall("OpeningShelterNorth",-32,-26,7,2.4,.8);
GroundedWall("OpeningShelterEast",-28,-18,.8,2.4,5);
GroundedWall("OpeningShelterEastNorth",-28,-25.5,.8,2.4,2);
GroundedWall("OpeningShelterWest",-36,-17,.8,2.4,4);
GroundedWall("OpeningShelterWestNorth",-36,-24,.8,2.4,4);
// Defensive parapets are small sandbag stacks above genuine excavated soil.
for (const x of [-25, 0, 15]) {
  Wall(`FrontParapet${x}`, x, -131, 6, 0.55, 0.9);
  Wall(`FrontTraverseCover${x}`, x + 3.6, -119.4, 0.8, 0.65, 2);
}
Block("BundleCrate", 13, -118, 1.2, 0.5, 0.8, "missionRoute");
// A traverse stops the tank from firing lengthwise down the full front trench.
GroundedWall("FrontTraverseBlastScreen",25.1,-124.5,.7,3.75,5.5);
GroundedWall("BundleParapet",13,-118.9,5.2,1.65,.7);
GroundedWall("FlankParapet",23,-112.6,5.4,1.5,.75);
// The forward weapon belongs to its real gunner; no suspended placeholder mesh.
// Side protection sits behind the muzzle so the documented firing arc stays usable.
for (const side of [-1, 1]) GroundedWall(`MachineGunSideCover${side}`, side * 2.8, -126.7, 0.65, 1.8, 4);
// The authored ZB-26 minimum is 0.12294 m below its model origin.
const gunRestTop=SampleMissionTerrain(0,-128)+1.45+.08-.12294;
const gunRestHeight=gunRestTop-SampleMissionTerrain(0,-128.55);
Block("MachineGunRest",0,-128.55,1.18,gunRestHeight,1.0,"cover");
for (const [i, x, z, w] of [
  [0, -26, -164, 10],
  [1, 28, -158, 9],
  [2, 62, -144, 10],
  [3, 35, -82, 14],
])
  Wall(`FieldRuin${i}`, x, z, w, i<2?.75:1.3, 0.7);
for(const x of [-28,-23,-18,-13,-8,-3,2,7])Wall(`WithdrawCover${x}`,x,-150,3.8,.88,.65);
// The three 0.62 m EnemyForwardCover slabs that used to sit alone on z=-173 are gone: they were
// below the crouch-and-hide band and one 4.2 m slab only ever registered a single cover point.
// The FRONT_COVER rows at the end of this file rebuild that row across the whole front.
// Real shelter for the waiting pairs; south-facing withdrawal paths remain open.
for(const [i,post] of FRONT_GUARD_POSTS.entries()) {
  GroundedWall(`GuardWaitingCover${i}`,post.x,post.z-1.25,5.8,1,.65);
  for(const side of [-1,1])GroundedWall(`GuardWaitingWing${i}_${side}`,post.x+side*2.7,post.z,.5,1,3.8);
}
for(const [i,x,z] of [[0,-16,-149.5],[1,-8,-151.5],[2,12,-151.5],[3,23,-151.5],[4,-32,-153.5],[5,-6,-158.5]])
  Wall("AssaultApproachCover"+i,x,z,2.6,.58,.6);
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
for(const post of MISSION_DEFENSE_POSTS)GroundedWall(post.id,post.x,post.z,post.w,post.h,post.d);
// Human-scale work areas, connected landmarks and trench construction remain pure geometry.
// Small surface details have no separate collision; functional furniture and walls do.
function Detail(id, x, z, w, h, d, semantic = "timber", extra = {}) {
  return Block(id, x, z, w, h, d, semantic, {solid:false, ...extra});
}
function SupplyStack(id, x, z, rows = 2) {
  for (let row = 0; row < rows; row++) for (let col = 0; col < 2; col++) {
    const cx = x + col * .95, y = SampleMissionTerrain(cx,z) + .25 + row * .51;
    Block(id+row+col,cx,z,.84,.5,.66,"timber",{y});
    for (const side of [-1,1]) Detail(id+'Strap'+row+col+side,cx+side*.27,z,.055,.51,.68,"metal",{y});
  }
}
for (const [id,x,z,rows] of [["StationSupply",-54,64,3],["StationMedical",-60,82,2],
  ["KitchenStores",61,-12,2],["CourtStores",37,22,2],["TransferStores",66,124,3],
  ["ReceptionStores",-160,21,2]]) SupplyStack(id,x,z,rows);
// Slatted revetment follows the real excavated bank, with a clear middle corridor.
for (const trench of MISSION_TERRAIN.trenches) {
  for (let segment = 1; segment < trench.points.length; segment++) {
    const a = trench.points[segment-1], b = trench.points[segment], dx = b.x-a.x, dz = b.z-a.z;
    const length = Math.hypot(dx,dz), yaw = Math.atan2(dx,dz);
    for (let distance = 4; distance < length-3; distance += 5) {
      for (const side of [-1,1]) {
        const x=a.x+dx*distance/length+dz/length*side*(trench.bottom/2+.18);
        const z=a.z+dz*distance/length-dx/length*side*(trench.bottom/2+.18);
        if (MISSION_TERRAIN.trenches.some(other => other !== trench &&
          MissionPathDistance({x,z},other.points) < other.bottom/2+2)) continue;
        const id=trench.id+'Revetment'+segment+'_'+distance+'_'+side;
        Detail(id+'Post',x,z,.13,.96,.17,"timber",{ry:yaw});
        for (const level of [0,1,2]) Detail(id+'Slat'+level,x,z,.07,.16,3.5,"timber",
          {ry:yaw,y:SampleMissionTerrain(x,z)+.15+level*.29});
      }
    }
  }
}
// Repeated sandbag seams provide scale without changing the proven solid envelope.
for (const wall of blocks.filter(b=>b.semantic==='cover' && b.h<1.21 && b.w>2 && b.d<1)) {
  for (let x=wall.x-wall.w/2+.25,i=0;x<wall.x+wall.w/2-.2;x+=.65,i++)
    Detail(wall.id+'BagSeam'+i,x,wall.z-.01,.035,wall.h+.018,wall.d+.024,'earthDark');
}
// Station telegraph line, water tower and damaged outbuildings establish direction and depth.
for (let z=-184;z<MISSION_TRAIN.approachEndZ;z+=28) {
  Block('TelegraphPole'+z,-86,z,.22,6,.22,'timber');
  Detail('TelegraphCrossarm'+z,-86,z,2.6,.14,.16,'timber',{y:SampleMissionTerrain(-86,z)+5.35});
  for(const side of [-1,1]) Detail('TelegraphWire'+z+side,-86+side*.9,z+14,.018,.018,28,'metal',
    {y:SampleMissionTerrain(-86,z)+5.48});
}
for (const x of [-1,1]) for(const z of [-1,1]) Block('WaterTowerLeg'+x+z,-98+x*1.3,68+z*1.3,.32,5,.32,'timber');
Block('WaterTowerTank',-98,68,3.8,2.3,3.8,'metal',{y:6.1});
function FarmSilhouette(id,x,z,w,d,h=3.8) {
  Room(id,x,z,w,d);
  const ground=SampleMissionTerrain(x,z);
  Block(id+'Gable',x,z,w*.36,h-2.6,d,'plaster',{y:ground+3.1+(h-2.6)/2});
  Detail(id+'RoofRidge',x,z,.3,.28,d+.6,'roof',{y:ground+h+.4});
  for(const side of [-1,1]) Detail(id+'RoofEave'+side,x+side*w*.42,z,w*.18,.25,d+.7,'roof',{y:ground+3.25});
}
FarmSilhouette('NorthFarm',-51,-184,15,11,4.3);
FarmSilhouette('NorthRuin',59,-192,16,9,4);
FarmSilhouette('EastFarm',110,-169,17,12,5);
FarmSilhouette('VillageEdgeHouse',106,40,16,12,4.4);
FarmSilhouette('VillageRearHouse',39,65,13,11,4);
FarmSilhouette('RearFarm',-66,27,13,11,4.1);
FarmSilhouette('TransferFieldStore',120,126,13,12,4.6);
FarmSilhouette('WestFieldHouse',-113,99,15,10,4.2);
FarmSilhouette('SouthFieldHouse',60,-60,12,9,4);
FarmSilhouette('RearOrchardHouse',-120,-20,13,11,4.1);
// Poplar rows mark the field edge and break long empty sightlines without closing combat lanes.
for(const [row,points] of [
  ['East',[-180,-151,-116,-81,-43,-5,36,71,104,142,167].map((z,i)=>({x:125+(i%3)*2,z}))],
  ['West',[-165,-131,-97,-63,-29,6,84,122,151].map((z,i)=>({x:-117-(i%2)*5,z}))],
  ['SouthRoad',[-83,-51,-20,12,43,71].map((z,i)=>({x:18+(i%2)*3,z}))],
  ['RailApproach',Array.from({length:Math.ceil((MISSION_TRAIN.approachEndZ-175)/24)},(_,i)=>({x:i%2?-109:-47,z:175+i*24}))],
]) for(const [i,p] of points.entries()) {
  const id='FieldPoplar'+row+i, ground=SampleMissionTerrain(p.x,p.z),height=6+(i%3)*.7;
  Block(id+'Trunk',p.x,p.z,.28,height*.65,.3,'timber');
  Detail(id+'Crown',p.x,p.z,1.8,height*.6,1.6,'foliage',{y:ground+height*.75});
  Detail(id+'CrownTip',p.x+.15,p.z,1.1,1.2,1,'foliage',{y:ground+height*1.06});
}
// Interior props sit beside movement lanes and identify kitchen, ward and sorting station.
Block('KitchenStove',54,-10,1.6,1.05,1.2,'earthDark');
Detail('KitchenFlue',53.6,-10,.36,1.8,.4,'earthDark',{y:2});
Block('KitchenTable',61,-5,1.6,.8,.8,'timber');
Block('CourtyardBench',36,27,1,.45,3.4,'timber');
for(const x of [65,68]) {
  Block('TriageBench'+x,x,119,1.5,.45,.6,'timber');
  Detail('TriageBlankets'+x,x,119,1.2,.18,.55,'canvas',{y:.61});
}
for(const z of [111,114,117]) {
  Detail('SortingRailPost'+z,70,z,.12,1.1,.12,'timber');
  Detail('SortingRope'+z,70,z+1.4,.035,.035,2.8,'canvas',{y:.95});
}
for(const x of [-153,-150,-147]) {
  Block('WardShelf'+x,x,25.8,2,.8,.55,'timber');
  Detail('WardMedicalRoll'+x,x,25.8,1.3,.25,.42,'canvas',{y:1.02});
}
// Field boundaries and split fence sections leave the tank and infantry corridors open.
for(const [id,x,z,length] of [['WestFieldFence',-58,-120,36],['VillageFieldFence',12,43,22],
  ['SouthFieldFence',102,151,26]]) {
  for(let i=0;i<length;i+=3) {
    Block(id+'Post'+i,x,z+i,.14,1.05,.14,'timber');
    Detail(id+'Rail'+i,x,z+i+1.35,.09,.12,2.7,'timber',{y:SampleMissionTerrain(x,z+i)+.72});
  }
}
// ---------------------------------------------------------------------------
// Front assault cover rows (docs/Data_FrontCover.md)
// ---------------------------------------------------------------------------
// One row of broken field banks, grave mounds and wall stubs 1.6-2.5 m south of each
// FRONT_ASSAULT bound line, so a man who reaches a line has something to kneel behind instead of
// bare field. Segments only ever go inside a FRONT_COVER column, which is exactly the x span the
// rush lanes are pushed out of, so no bank can ever stand across a bound. Anything that would
// land inside an existing building, ruin or authored firing position is dropped - NorthFarm,
// FieldRuin0 and FieldRuin1 are the cover on those stretches already.
function FieldCover(id, x, z, w, h, d) {
  const top = SampleMissionTerrain(x, z) + h;
  let base = Infinity;
  for (const a of [-1, 0, 1]) for (const b of [-1, 0, 1])
    base = Math.min(base, SampleMissionTerrain(x + a * w / 2, z + b * d / 2));
  base -= 0.06;
  // The foot is dug to the lowest corner so no bank floats over a field swell; h is therefore the
  // registered cover height (0.06 m taller than the authored clear height, still inside the band).
  // faceZ points south, at the Chinese line: Script_AiCover reads a cover normal as an unsigned
  // wall axis (its header), so the sign documents intent and only |dot| ever scores.
  return Block(id, x, z, w, top - base, d, "cover", { y: (top + base) / 2, cover: { faceX: 0, faceZ: 1 } });
}
{
  const existing = blocks.slice();
  const Taken = (x, z, w, d) => existing.some((block) => block.solid !== false
      && Math.abs(block.x - x) < (block.w + w) / 2 + 0.45
      && Math.abs(block.z - z) < (block.d + d) / 2 + 0.45
      && block.y + block.h / 2 > SampleMissionTerrain(x, z) + 0.3)
    || FRONT_FIELD_MEN.some((man) => Math.abs(man.x - x) < w / 2 + 0.9 && Math.abs(man.z - z) < d / 2 + 0.9);
  for (const row of FRONT_COVER.rows) for (const column of FRONT_COVER.columns) {
    if (column.rows && !column.rows.includes(row.id)) continue;
    const build = column.coverX || column.x;
    const span = build[1] - build[0] - FRONT_COVER.insetM * 2;
    const count = Math.max(1, Math.floor((span - row.w) / FRONT_COVER.pitchM) + 1);
    const used = (count - 1) * FRONT_COVER.pitchM + row.w;
    const first = build[0] + FRONT_COVER.insetM + (span - used) / 2 + row.w / 2;
    for (let i = 0; i < count; i++) {
      const x = first + i * FRONT_COVER.pitchM;
      // A man authored inside the one-metre slack of a bound line skips that line and rushes
      // straight through the row behind it. Columns cannot help there - the lane runs down the
      // column - so the bank gives way instead of the route gate failing on it.
      if (Taken(x, row.z, row.w, row.d) || FrontAssaultLaneCuts(x, row.z, row.w, row.d)) continue;
      FieldCover(`FrontCover${row.id}${column.id}${i}`, x, row.z, row.w, row.h, row.d);
    }
  }
}
export const MISSION_ANCHORS = Object.freeze({
  train: MISSION_TRAIN.player,
  unload: { x: -66, z: 66 },
  front: { x: 0, z: -124 },
  orders: { x: -8, z: -102 },
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
  finalCover: { x: -172, z: 54 },
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
  opening: OPENING.approachRoute,
  support: OPENING.supportRoute,
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
import { FRONT_GUARD_POSTS, FRONT_COVER, FRONT_FIELD_MEN, FrontAssaultLaneCuts } from "./Data_FirstLevelMissionFront.mjs";
export const MISSION_PLACEMENT = Object.freeze({
  stationCasualties: [
    { x: -62, z: 69, yaw: -0.4, health: 35 },
    { x: -64, z: 77, yaw: 2.1, health: 28 },
  ],
  squadFrontPositions:[{x:-1.7,z:-129},{x:1.7,z:-128.7},{x:14,z:-129},{x:16,z:-127.5}],
  reliefApproach: [{x:-69,z:106},{x:-71,z:74},{x:-66,z:66},...MISSION_ROUTES.opening,...MISSION_ROUTES.support,{x:6,z:-123}],
  reliefPositions: [{x:-30,z:-123.4},{x:-26,z:-124.9},{x:-21,z:-122.8},{x:-17,z:-125},{x:-10,z:-124.3},{x:4,z:-123.2},{x:11,z:-125},{x:20,z:-124.6}],
  // First arrivals move furthest down the communication trench; the mouth stays open.
  guardWithdrawalRoutes: Array.from({length:8},(_,i)=>[
    FRONT_GUARD_POSTS[i],
    {x:FRONT_GUARD_POSTS[i].x,z:-140},
    {x:-20+i*.45,z:-137+i*.35},
    {x:-20+i*.35,z:-124+i*.2},
    {x:-8,z:-112},
    {x:-8+(i%2?1:-1),z:-92-Math.floor(i/2)*2.8},
  ]),
  wardInterior: {minX:-157,maxX:-145,minZ:25,maxZ:43},
  tankStart: { x: 36, z: -173 },
  tankTargets: [
    { x: -24, z: -130 },
    { x: 16, z: -131 },
    { x: 2, z: -132 },
  ],
  cartBays: [
    { x: 80, z: 120 },
    { x: 86, z: 123 },
    { x: 86, z: 132 },
    { x: 86, z: 141 },
  ],
});
export const MISSION_SUPPLIES = Object.freeze([
  {id:"Unloading",x:-68.5,z:66,supportHeight:.85},
  {id:"Front",x:-2.2,z:-124,supportHeight:null},
  {id:"Orders",x:-9.5,z:-102,supportHeight:null},
  {id:"Courtyard",x:50,z:33.05,supportHeight:null},
  {id:"Transfer",x:93,z:110,supportHeight:1.15},
  {id:"Retreat",x:-53.2,z:82,supportHeight:null},
  {id:"Reception",x:-132.8,z:31,supportHeight:null},
]);
// Leave continuous openings wherever a return route or stretcher corridor crosses a revetment.
for (let i = blocks.length - 1; i >= 0; i--) {
  const block = blocks[i];
  if (!block.id.includes('Revetment')) continue;
  const c = Math.cos(block.ry||0), s = Math.sin(block.ry||0);
  const crosses = [...Object.values(MISSION_ROUTES), MISSION_PLACEMENT.reliefApproach, ...MISSION_PLACEMENT.guardWithdrawalRoutes, ...MISSION_TERRAIN.trenches.map(t=>t.points)].some(route => route.slice(1).some((b,index) => {
    const a=route[index], length=Math.hypot(b.x-a.x,b.z-a.z);
    for(let d=0;d<=length;d+=.5) {
      const x=a.x+(b.x-a.x)*d/length-block.x, z=a.z+(b.z-a.z)*d/length-block.z;
      if(Math.abs(x*c-z*s)<block.w/2+.9 && Math.abs(x*s+z*c)<block.d/2+.9)return true;
    }
    return false;
  }));
  if(crosses)blocks.splice(i,1);
}
export const MISSION_LAYOUT = Object.freeze({
  id: "FirstLevelMissionSeptember07",
  fortifications: true,
  terrain: "P012Heightfield",
  terrainSpec: MISSION_TERRAIN,
  SampleGroundColor: SampleMissionGroundColor,
  bounds: { minX: -205, maxX: 137, minZ: -258, maxZ: MISSION_TRAIN.approachEndZ },
  ground: { x: -34, z: (MISSION_TRAIN.approachEndZ-202)/2, w: 342, d: MISSION_TRAIN.approachEndZ+202, h: 1, y: -0.5, semantic: "ground" },
  semanticColors: {
    foliage: 0x68715f,
    timber: 0x746956,
    metal: 0x535b57,
    earthDark: 0x696452,
    plaster: 0xaaa69b,
    roof: 0x686c68,
    canvas: 0xa4a393,
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
