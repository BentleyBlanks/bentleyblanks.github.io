import { FRONT_SORTIE as Sortie } from "./Data_FirstLevelFrontRoute.mjs";
import { MISSION_REAR_ANCHORS, MISSION_REAR_ROUTES, MISSION_RECEPTION_SPACE, MISSION_SOUTH_BRIDGE } from "./Data_FirstLevelMissionTopology.mjs";
import { MISSION_TRENCH_COVER as TC } from "./Data_FirstLevelMissionTrenchCover.mjs";
import { OPENING } from "./Data_FirstLevelOpening.mjs";
import { MISSION_TRAIN } from "./Data_FirstLevelMissionTrain.mjs";
import { MISSION_DEFENSE_POSTS } from "./Data_FirstLevelMissionFortifications.mjs";
import { P012_STATION_BLOCKS } from "./Data_FirstLevelP012Station.mjs";
import { MISSION_TERRAIN, SampleMissionTerrain, MissionPathDistance, SampleMissionGroundColor, TrenchPlanFor } from "./Data_FirstLevelMissionTerrain.mjs";
import { PlanTrenchDressing } from "./Script_TrenchPlan.mjs";
import { MakeRailwayProfile } from "./Script_RoadPath.mjs";
// A low field line through the halt: two rails on sleepers on a shallow ballast
// bed that follows the shared heightfield. Script_RoadSpline builds it from this
// spec (whitebox field and the scene-spline editor preview alike); there are no
// rail boxes at an absolute height. Rail top is ~0.3 m above the soil.
export const MISSION_RAILWAY = Object.freeze({
  id: "MissionRailway",
  // North end stops at the foot of the 3 m field bank (z < -184) instead of climbing it.
  points: Object.freeze([[-77, -186], [-77, MISSION_TRAIN.approachEndZ]]),
  gauge: 1.435,
  // Ballast top: soil smoothed over +/-24 m, then kept 0.06-0.18 m above the local soil.
  crown: Object.freeze({ step: 4, smooth: 6, lift: 0.1, clampLo: 0.06, clampHi: 0.18 }),
  bed: Object.freeze({ material: "railBallast", topHalf: 1.7, slope: 1.6, embed: 0.25, step: 4, chunkLen: 48 }),
  sleeper: Object.freeze({ material: "timber", along: 0.22, h: 0.14, length: 2.5, lift: 0.02,
    spacing: 0.75, jitter: 0.03, ryJitter: 0.02 }),
  // Rail foot rests on the sleeper top (crown + 0.09).
  rail: Object.freeze({ material: "metal", w: 0.08, h: 0.13, lift: 0.155, segLen: 12 }),
});
const railProfile = MakeRailwayProfile(MISSION_RAILWAY, SampleMissionTerrain);
// Box wheels keep their authored top inside the underframe; the bottom stands on the rail top.
function SeatOnRail(block) {
  const top = block.y + block.h / 2, rail = railProfile.RailTopNear(block.x, block.z);
  block.h = top - rail;
  block.y = (top + rail) / 2;
  return block;
}
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
/**
 * 檩条与一段望板。屋内伏击那一拍玩家是**躺在地板上仰头**看的
 *（docs/Data_FirstLevelRoomAmbush.md）：白盒剖面屋顶（`<id>Roof` 只盖西侧四成）
 * 留下的那一大片天空正好落在视野正中，躺在屋里却看见白天的天。
 *
 * 这里补一套梁与板，**不整个封死** —— 剖面屋顶的可读性（俯视能看进屋里）要留着，
 * 中间那道窄缝也正好给一束天光。全部在墙顶（2.9 m）之上，不影响走位与碰撞。
 */
function Rafters(id, x, z, w, d) {
  const ground = SampleMissionTerrain(x, z);
  // 脊檩：南北向，压在两扇门的中线上。
  Block(`${id}Ridge`, x, z, 0.34, 0.34, d + 0.6, "timber", { y: ground + 3.26 });
  // 横梁：每 1.85 m 一根，东西向跨满整间屋。
  const step = 1.85, count = Math.floor((d - 1.2) / step);
  for (let i = 0; i <= count; i += 1)
    Block(`${id}Rafter${i}`, x, z - d / 2 + 0.9 + i * step, w, 0.16, 0.24, "timber", { y: ground + 3.02 });
  // 东侧那半边补一段望板：剖面屋顶盖的是西侧，躺在地上仰头看的正是这一片。
  Block(`${id}Boards`, x + w * 0.26, z, w * 0.46, 0.14, d, "timber", { y: ground + 3.16 });
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
    const block = Block(
      part.id.replace("StationCar0", id),
      -77 + part.x - sourceCarFloor.x,
      z + (part.z - sourceCarFloor.z) * lengthScale,
      part.w,
      part.h,
      part.d * lengthScale,
      part.semantic,
      { y: part.y - 0.08 },
    );
    if (part.id.includes("Wheel")) SeatOnRail(block);
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
  const deck = floor.y + floor.h / 2;
  // Cargo stays in the end pockets. The middle door and central unloading lane stay clear.
  for(const end of [-1,1]) {
    const cargoZ=z+end*5.65, cargoId=id+'Cargo'+end;
    Block(cargoId+'Crate',-77,cargoZ,.82,.58,.62,'trainWood',{y:deck+.29});
    for(const band of [-1,1]) Block(cargoId+'Band'+band,-77+band*.28,cargoZ,.055,.60,.64,'trainMetal',{y:deck+.30,solid:false});
    Block(cargoId+'Lid',-77,cargoZ,.86,.045,.65,'trainWood',{y:deck+.603,solid:false});
    for(const side of [-1,1]) {
      const x=-77+side*1.65;
      Block(cargoId+'Bedroll'+side,x,cargoZ,.56,.28,.55,'trainCanvas',{y:deck+.14,solid:false});
      for(const strap of [-1,1]) Block(cargoId+'Strap'+side+'_'+strap,x+strap*.17,cargoZ,.045,.30,.57,'trainWood',{y:deck+.15,solid:false});
    }
  }
  for(const [slot,seat] of MISSION_TRAIN.cars[i].seats.entries()) if(Math.abs(seat.x+77)>1.2) {
    // Personal kit rests between adjacent feet, never at the removed seat height.
    const side=Math.sign(seat.x+77), packId=id+'Pack'+slot, x=-77+side*2.08, kitZ=seat.z+.53;
    Block(packId,x,kitZ,.27,.43,.24,'trainCanvas',{y:deck+.215,solid:false});
    Block(packId+'Flap',x-side*.15,kitZ,.045,.14,.25,'trainWood',{y:deck+.34,solid:false});
    Block(packId+'Canteen',x,kitZ+.20,.14,.21,.13,'trainMetal',{y:deck+.105,solid:false});
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
  const block = Block(
    part.id,
    -77 + part.x - sourceEngineFrame.x,
    58 + part.z - sourceEngineFrame.z,
    part.w,
    part.h,
    part.d,
    part.semantic,
    { y: part.y },
  );
  if (part.id.startsWith("StationEngineWheel")) SeatOnRail(block);
}
// Sleepers and rails are not layout blocks: see MISSION_RAILWAY above.
Block("SupplyTable", -68.5, 66, 2, 0.85, 1, "missionRoute");
Room("UnloadingShed", -58, 85, 9, 9);
Wall("BrokenStationWall", -68, 55, 9, 1.1, 0.65);
GroundedWall("ApronEastBank",-63,80,.8,1.65,9);
GroundedWall("TrenchMouthBank",-58.5,65,.9,1.5,7);
GroundedWall("FlankLockBank",-37,56,.65,1.1,5);
GroundedWall("RailLockBank",-90.5,48,.65,1.1,5);
// Rally behind the eastern earth traverse while the player clears the breach.
const trenchRallyWall=GroundedWall("TrenchRallyEast",-42.3,33,.65,2,15);
trenchRallyWall.cover={faceX:1,faceZ:0,
  points:[27,29,31,33,35,37,39].map(z=>({x:trenchRallyWall.x,z}))};
// L-shaped whitebox shelters sit inside the excavated trench, with a 2.4 m
// centre gap between opposite front faces. Both visible arms have real solids.
for(const station of [...TC.rally,...TC.approach,...TC.support]){
  const x=station.x+station.side*TC.wallOffsetM;
  GroundedWall(`TrenchBound${station.id}Front`,x,station.z,TC.wallWidthM,TC.wallHeightM,TC.wallDepthM);
  const wing=GroundedWall(`TrenchBound${station.id}Wing`,station.x+station.side*TC.wingOffsetM,
    station.z+TC.wingLengthM/2,TC.wingDepthM,TC.wallHeightM,TC.wingLengthM);
  wing.cover={faceX:station.side,faceZ:0,points:TC.postRearM.map(rear=>({x:wing.x,z:station.z+rear}))};
}
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
Room("BundleSupplyHouse",Sortie.house.x,Sortie.house.z,9,10,{northDoor:false});
Block("BundleCrate",Sortie.bundle.x,Sortie.bundle.z,1.2,.5,.8,"missionRoute");
for(const crawl of Sortie.crawl){
  const ground=SampleMissionTerrain(crawl.x,crawl.z);
  Block(`BundleCrawl${crawl.id}Roof`,crawl.x,crawl.z,crawl.w,Sortie.crawlRoofM,crawl.d,"timber",
    {y:ground+Sortie.crawlClearanceM+Sortie.crawlRoofM/2});
  for(const side of [-1,1])GroundedWall(`BundleCrawl${crawl.id}Side${side}`,crawl.x+side*crawl.w/2,
    crawl.z,.4,2.4,crawl.d+2);
}
// Traverse walls face the tank road and interrupt long fire lanes. Open ends lead around each bend.
for(const [i,x,z,d] of [[0,45,-131,9],[1,53,-143,8],[2,45,-161,9],[3,51.5,-177,8]])
  GroundedWall(`BundleTankScreen${i}`,x,z,.7,2.6,d);
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
// A timber firing step carries the shooter's feet even after nearby shelling
// deforms the soil. The gun and the shooter share a stable physical foundation.
Block("MachineGunFiringStep",0,-127.5,2.2,.18,1.9,"timber",
  {y:SampleMissionTerrain(0,-127.4)-.09});
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
// Two more hide spots for the room ambush (docs/Data_FirstLevelRoomAmbush.md).
// The west screen runs north-south beside the west wall, so (53.6, 2.4) and (53.6, 4.6)
// are behind it both from the north door (58, 0.5) and from the trigger point (58, 6).
// The south-east crate stack covers (62.4, 14.3) from the same two eyes. Neither piece
// touches the x=58 stretcher lane, the north door or the south door opening.
Wall("AmbushWestScreen", 54.6, 3.5, 0.35, 1.9, 4.2);
// 货箱堆要留得出一个人真的站得下的角落：南面到墙内侧 1.8 m，东面到墙内侧 0.3 m。
// 留窄了出生点会被物理挤出屋外（实拍把侧翼那个顶到了 (60.5,16.5)）。
Block("AmbushCornerCrates", 61.9, 12.6, 3, 1.7, 1.6, "cover");
// 被砸倒之后是躺着仰头看的：这间屋子的头顶上必须有东西（见 Rafters 的注释）。
Rafters("ConnectedHouse", 58, 8, 12, 15);
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
gates.push(MISSION_SOUTH_BRIDGE.wreck);
// Three separate rearguard pockets turn south after the western ditch mouth.
GroundedWall("DrainCorner",28,134,4,1.2,.7);
GroundedWall("DrainSightBreak",44,160,9,2.8,1);
GroundedWall("RearWallGapWest",45,184,16,2.8,.7);
GroundedWall("RearWallGapEast",65,184,14,2.8,.7);
GroundedWall("RearWallSightBreak",38,199,16,2.8,1);
GroundedWall("BackyardWall",20,224,9,2.8,.7);
Room("RearCourtyardHouse",27,232,13,12,{eastWindow:true});
// One reception compound: street room, ward, second cover and an actual west back door.
Room("ReceptionStreetRoom",-5,229,10,14,{eastWindow:true});
Room("ReceptionWard",-26,234,14,18,{eastWindow:true});
Wall("ReceptionNorth",-22,218,37,2.8,.7);
DoorWall("ReceptionSouth",-22,252,37,2.8,5);
Wall("ReceptionWestNorth",-41,229.75,.7,2.8,23.5);
Wall("ReceptionWestSouth",-41,249.25,.7,2.8,5.5);
Block("ReceptionRearLintel",-41,244,.7,.45,5,"structure",{y:2.575});
Block("ReceptionMedicine",-31,236,1,.7,1,"missionRoute");
Wall("ReceptionSecondCover",-32,242,4,1.05,.7);
Wall("RearExitCover",-43,235,4,1.05,.7);
Wall("FinalAlleyCover",-60,210,.7,1.2,12);
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
  ["ReceptionStores",-35,221,2]]) SupplyStack(id,x,z,rows);
// 护壁 / 踏板 / 射击位 / 杂物不再在这里手写：见文件末尾 MISSION_TRENCH_PLACEMENTS
// 那一段（沿编译好的中心线 PCG，要等 MISSION_ROUTES / MISSION_PLACEMENT 定义完）。
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
for(const x of [-28,-25,-22]) {
  Block('WardShelf'+x,x,225.8,2,.8,.55,'timber');
  Detail('WardMedicalRoll'+x,x,225.8,1.3,.25,.42,'canvas',{y:1.02});
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
      if(MissionPathDistance({x,z:row.z},Sortie.route)<row.w/2+1.0)continue;
      FieldCover(`FrontCover${row.id}${column.id}${i}`, x, row.z, row.w, row.h, row.d);
    }
  }
}
export const MISSION_ANCHORS = Object.freeze({
  train: MISSION_TRAIN.player,
  unload: { x: -66, z: 66 },
  front: { x: 0, z: -124 },
  orders: Sortie.orders,
  gun: { x: 0, z: -128 },
  bundle: Sortie.bundle,
  throw: { x: 30, z: -117 },
  village: { x: 55, z: -20 },
  melee: { x: 58, z: 6 },
  transferSupply: { x: 93, z: 110 },
  forwardNest: { x: -24, z: -130 },
  gate: { x: 53, z: 34 }, courtCover: { x: 67, z: 24 },
  transfer: { x: 95, z: 103 }, queue: { x: 74, z: 111 },
  ...MISSION_REAR_ANCHORS,
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
  bundle: Sortie.route,
  bundleReturn: Sortie.route.slice(3).reverse(),
  orders: [Sortie.throw,{x:25,z:-110},Sortie.orders],
  // The tank can be immobilized anywhere along the return trench, so the rally
  // leg starts wherever the bundle run is; the squad already walks it this way.
  ordersRejoin: [...Sortie.route.slice(3).reverse(),{x:25,z:-110},Sortie.orders],
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
  ...MISSION_REAR_ROUTES,
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
    {x:6,z:-124},
    {x:-8,z:-112},
    {x:-8+(i%2?1:-1),z:-92-Math.floor(i/2)*2.8},
  ]),
  kitchenInterior: {minX:53,maxX:63,minZ:-15,maxZ:-2},
  // ConnectedHouse（58,8，12×15）的可站区域：墙心 x 52/64、z 0.5/15.5，墙厚 0.6。
  // 伏击那一拍用它判断「班里人进屋了没有」。
  roomInterior: {minX:52.6,maxX:63.4,minZ:1,maxZ:15},
  // 罗班长、何有田、刘文财在灶屋北门内侧的掩护位（北墙 z=-16.5），让开 x=58 的担架通道。
  // 贴着门口而不是门外十米：挣脱之后他们要在顺子被四个人围死之前跑进屋（实拍量过）。
  ambushSquadPosts: [{x:55,z:-14.2},{x:61,z:-14.2},{x:58,z:-15.4}],
  // 幺娃跟着担架，停在屋门口西侧。
  ambushYaowaPost: {x:56.4,z:0.6},
  // 挣脱之后三个人从灶屋穿进屋里的落点（都在 roomInterior 里，让开 x=58 的担架）。
  ambushSquadEntry: [{x:56.4,z:4.6},{x:60.2,z:4.2},{x:57.4,z:8.6}],
  // 从灶屋门口穿屋门进屋的折线；两道门都在 x 56.1–59.9 的开口上。
  // 每个人再按 ambushSquadLanesM 错开一点，免得三个人在门口挤成一堆。
  ambushSquadRoute: [{x:58,z:-8},{x:58,z:-3},{x:58,z:-0.4}],
  ambushSquadLanesM: [-0.7,0.7,0],
  wardInterior: MISSION_RECEPTION_SPACE.ward,
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
  // 2026-09-15: the shelter corner is now a fight of its own, between the trench
  // and the front crates. Kept on the recess floor, clear of its entry lane and posts.
  {id:"Shelter",x:-34.2,z:-18.3,supportHeight:null},
  {id:"Front",x:-2.2,z:-124,supportHeight:null},
  {id:"Orders",x:Sortie.orders.x-1.5,z:Sortie.orders.z,supportHeight:null},
  {id:"Courtyard",x:50,z:33.05,supportHeight:null},
  {id:"Transfer",x:93,z:110,supportHeight:1.15},
  {id:"Retreat",x:53.8,z:184,supportHeight:null},
  {id:"Reception",x:-7.8,z:231,supportHeight:null},
]);
// 在沟里走、但线写在**别的文件**里的那几条。本文件不能 import
// Data_FirstLevelMission（它 import 本文件，反过来读就是一个求值期的环），
// 所以只能照抄那一小段。看守是 Script_FirstLevelMissionTest 的路线净空断言：
// 那边改了线、这边没跟，它会指名道姓地红。
const TRENCH_TRAFFIC_LANES = [
  // 增援班从交通壕口沿 z=-123 散开到各自的射击位（测试里的 Relief<i> 路线）。
  // 这条腿整段躺在 FrontTraverse 的沟里，偏中线 1 m 左右。
  ...MISSION_PLACEMENT.reliefPositions.map((point) => [
    MISSION_PLACEMENT.reliefApproach.at(-1), { x: point.x, z: -123 }, point]),
  // 后院那三个追兵贴着撤离壕 (26,215) 的拐角外侧下来
  //（Data_FirstLevelMission.MISSION_TACTICS.YardPursuerA/B/C，三条同线）。
  [{ x: 27, z: 224 }, MISSION_REAR_ROUTES.evacuation[7], MISSION_REAR_ANCHORS.retreatC],
];
// 壕沟布设：沿编译好的中心线自动摆护壁、踏板、射击位沙袋和杂物
// （Script_TrenchPlan.PlanTrenchDressing，参数在 TRENCH_PRESETS）。
// 旧写法是「每 5 m 两侧各一根桩 + 3 条横板」的双重循环，间距、根数、倾斜全是
// 常数 —— 那正是这一轮要去掉的「工业化」。
// 为什么在这里而不是在上面那些 Detail() 旁边：它要吃 MISSION_ROUTES /
// MISSION_PLACEMENT（就定义在上面几十行）和**当时已经摆好的全部实心体块**。
// 下面那张老清理网留着当第二道保险（它只认 id 里的 `Revetment`）。
//
// 布设跑两遍：**沟里的路线就是沟的中心线**。opening/support 是 FrontCommunication、
// bundle 是 BundleApproach、evacuation 是 WestEvacuation，连担架、通信兵、追兵那几条
// 也都顺着沟底走。护壁摆在沟壁上（离中线 1.4 m 开外），只有横穿的路线才碰得到它，
// 所以第一遍照常吃全部路线；踏板和杂物摆在沟底中线附近，吃同一套路线的结果是
// **一件都不剩** —— 而踏板本来就是给人踩的，杂物是不带碰撞的箱子。
// 两遍用同一个种子，件的位置逐位相同，差的只是筛掉了哪些。
export const MISSION_TRENCH_PLACEMENTS = (() => {
  const shared = { groundAt: SampleMissionTerrain, laneCuts: FrontAssaultLaneCuts };
  const handPlaced = blocks.filter((block) => block.solid !== false)
    .map((block) => ({ x: block.x, z: block.z, w: block.w, d: block.d, ry: block.ry || 0 }));
  // 手挖的凹地也算占了地：机枪踏步、补给屋的地板。件摆在它们的过渡带上，中心与
  // 端点会差半米高 —— 症状是沙袋一头埋进土里、踏板一头翘在半空。
  // 半径乘几：PlanTrenchDressing 自己还要按件的尺寸再外扩（3.5 m 长的护壁是
  // 2.25 m，2.4 m 的踏板是 1.7 m）。护壁贴在沟壁上、离踏步还有一堵墙，写 ×1 就够；
  // 踏板躺在沟底，和踏步的斜面是同一片地，要 ×2 才躲得开。照直径给护壁写，整条
  // 射击壕的护壁会被清光。
  const StepBoxes = (scale) => MISSION_TERRAIN.steps.map((step) => ({
    x: step.x, z: step.z, w: step.radius * scale, d: step.radius * scale, ry: 0 }));
  const guarded = PlanTrenchDressing(TrenchPlanFor(MISSION_TERRAIN), {
    ...shared,
    keepOut: [...handPlaced, ...StepBoxes(1)],
    avoidRoutes: [
      ...Object.values(MISSION_ROUTES),
      MISSION_PLACEMENT.reliefApproach,
      ...MISSION_PLACEMENT.guardWithdrawalRoutes,
      // 沟里活动的那几条：担架、通信兵、缺口进来的敌人、追到拐角的那一股
      OPENING.woundedRoute, OPENING.runnerRoute, OPENING.trenchContactRoute,
      ...Object.values(OPENING.intruderRoutes),
      ...Object.values(OPENING.shelterPursuerRoutes).map((route) => route.points),
      ...TRENCH_TRAFFIC_LANES,
    ],
  });
  const floor = PlanTrenchDressing(TrenchPlanFor(MISSION_TERRAIN), {
    ...shared, keepOut: [...handPlaced, ...StepBoxes(2)] });
  const OnFloor = (id) => /Duckboard\d+$/.test(id);
  for (const piece of [...guarded.blocks.filter((b) => !OnFloor(b.id)),
    ...floor.blocks.filter((b) => OnFloor(b.id))]) {
    const { id, x, z, w, h, d, semantic, ...extra } = piece;
    (piece.solid === false ? Detail : Block)(id, x, z, w, h, d, semantic, extra);
  }
  return Object.freeze(floor.placements);
})();
// Leave continuous openings wherever a return route or stretcher corridor crosses a revetment.
for (let i = blocks.length - 1; i >= 0; i--) {
  const block = blocks[i];
  if (!block.id.includes('Revetment')) continue;
  const c = Math.cos(block.ry||0), s = Math.sin(block.ry||0);
  if(block.id.startsWith('BundleApproachRevetment') && FrontAssaultLaneCuts(block.x,block.z,
    Math.abs(c)*block.w+Math.abs(s)*block.d,Math.abs(s)*block.w+Math.abs(c)*block.d,.8)){
    blocks.splice(i,1);continue;
  }
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
  id: "FirstLevelMissionSeptember14",
  fortifications: true,
  derailCar: OPENING.derailCar,
  terrain: "P012Heightfield",
  terrainSpec: MISSION_TERRAIN,
  SampleGroundColor: SampleMissionGroundColor,
  bounds: { minX: -205, maxX: 137, minZ: -258, maxZ: MISSION_TRAIN.approachEndZ },
  ground: { x: -34, z: (MISSION_TRAIN.approachEndZ-258)/2, w: 342, d: MISSION_TRAIN.approachEndZ+258, h: 1, y: -0.5, semantic: "ground", pbr: "Ground", pbrOptions: { normalScale: .5, metalness: 0 } },
  railway: MISSION_RAILWAY,
  semanticColors: {
    railBallast: 0x5a5750,
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
  // 壕沟里的外部模型件（箱/板条箱/帆布）。放在 layout 上而不是并进
  // MISSION_DEFENSE_OBJECTS：那张表在 Data_FirstLevelMissionFortifications 里，
  // 而这份布设要吃本文件的体块做 keepOut —— 反过来 import 就是一个求值期的环。
  trenchPlacements: MISSION_TRENCH_PLACEMENTS,
  walkableSurfaces: surfaces,
  zones: Object.entries(MISSION_ANCHORS).map(([id, p]) => ({ id, ...p, radius: 8 })),
});
