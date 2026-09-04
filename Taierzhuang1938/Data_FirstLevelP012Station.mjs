// P012 station replacement: local authored points compile once at export through
// P012StationPoint. Exported records are WORLD coordinates; do not remap them.
// Pure BoxGrammar: y is box centre, top=y+h/2; no rx/rz, assets or textures.
// BLOCKS includes the identical SURFACES objects; render BLOCKS once and register
// SURFACES as layout.walkableSurfaces for the shared height contract. Do not retain
// the old analytic y=0 spawn assumption inside the carriage or on its steps.
// Ground-painted aprons are non-solid; train floors/steps are actual support.
import { TRAVERSAL } from "./Data_Traversal.mjs";
import { P012StationPoint } from "./Data_FirstLevelP012Space.mjs";
const blocks=[],surfaces=[];
function Box(id,x,z,w,d,h,semantic="boundary",extra={}){
  // Solid grey shells are structures, never advertised as walkable ground.
  const surfaceSemantic=semantic==="ground"&&extra.solid!==false?"structure":semantic;
  return Object.freeze({id,x,z,w,d,h,y:h/2,ry:0,solid:true,semantic:surfaceSemantic,tag:id,...extra});
}
function Add(...items){blocks.push(...items);}
function Surface(id,x,z,w,d,top,semantic="ground",thickness=.2){
  const block=Box(id,x,z,w,d,thickness,semantic,{y:top-thickness/2,solid:false});
  surfaces.push(block);blocks.push(block);return block;
}
const floorTop=1.25,platformTop=.5,stepRise=(floorTop-platformTop)/5;
export const P012_STATION_HEIGHTS=Object.freeze({floorTop,platformTop,stepRise,exitTops:Object.freeze(Array.from({length:5},(_,i)=>Number((floorTop-stepRise*(i+1)).toFixed(2))))});
if(stepRise>TRAVERSAL.stepMax)throw new Error("Station stairs exceed automatic step threshold");

// Three aligned open freight wagons; the middle car owns player/Luo anchors.
// High side boards and external ribs replace passenger roofs/window strips.
for(const [index,z] of [47,65,83].entries()){
  const id=`StationCar${index}`,doorZ=z-4;
  Surface(`${id}Floor`,-66,z,4.8,14,floorTop);
  Add(Box(`${id}NorthEnd`,-66,z-7,4.8,.22,1.4,"structure",{y:1.95}),
    Box(`${id}SouthEnd`,-66,z+7,4.8,.22,1.4,"structure",{y:1.95}),
    Box(`${id}WestWaist`,-68.4,z,.22,14,1.4,"structure",{y:1.95}));
  for(let at=z-6.5,n=0;at<z+7;at+=1.5,n++)Add(Box(`${id}WestRib${n}`,-68.56,at,.12,.16,1.5,"boundary",{y:1.95}));
  const spans=[[z-7,doorZ-2.2],[doorZ+2.2,z+7]];
  for(const [part,[a,b]] of spans.entries()){
    Add(Box(`${id}EastWaist${part}`,-63.6,(a+b)/2,.22,b-a,1.4,"structure",{y:1.95}));
    for(let at=a+.15,n=0;at<b;at+=1.5,n++)Add(Box(`${id}EastRib${part}_${n}`,-63.44,at,.12,.14,1.5,"boundary",{y:1.95}));
  }
  for(const side of [-1,1])for(const offset of [-6,-5.5,4.5,5.5]){
    // Wide box-wheel/axle assemblies span rail contact to the visible body edge.
    // The occupied car's front bogie sits outside the east stair opening.
    Add(Box(`${id}Wheel${side}_${offset}`,-66+side*1.55,z+offset,2,.85,.85,"boundary",{y:.68}));
  }
  Add(Box(`${id}Underframe`,-66,z,3.6,13,.3,"boundary",{y:1.05}));
  if(index<2)Add(Box(`${id}Coupler`,-66,z+9,.4,3.7,.35,"boundary",{y:1.05}));
}
// East-side descending stair: five 0.15m risers, 0.6m tread, 3m clear width.
// The last tread meets the raised platform at 0.5m; all five are real supports.
for(const [carIndex,doorZ] of [43,61,79].entries())for(let index=0;index<5;index++){
  const id=carIndex===1?`StationExitStep${index}`:`StationCar${carIndex}ExitStep${index}`;
  const top=P012_STATION_HEIGHTS.exitTops[index],x=-63.3+index*.6;
  if(top>0)Surface(id,x,doorZ,.6,3,top,"step",top);
  else Add(Box(id,x,doorZ,.6,3,.006,"step",{y:0,solid:false}));
}
// Raised platform: track remains at zero. Northern and eastern public exits
// descend through real discrete support boxes, never an invisible height ramp.
Surface("StationRaisedPlatform",-46,64.5,32,53,platformTop,"ground",platformTop);
for(const [index,top] of [.25,0].entries()){
 Surface(`StationPlatformNorthStep${index}`,-46,37.6-index*.8,32,.8,top,"step",.1);
 Surface(`StationPlatformEastStep${index}`,-29.6+index*.8,64.5,.8,53,top,"step",.1);
}
// Open long canopy. No wall panels or columns across carriage doors / issue lanes.
for(const [index,x] of [-59.375,-56.125,-52.875,-49.625].entries())Add(Box(`StationLongCanopyRoof${index}`,x,64.5,3.35,53,.16,"structure",{y:4.8-Math.abs(x+54.5)*.018}));
for(const x of [-59,-49])for(const z of [52,73,89])Add(Box(`StationLongCanopyPost${Math.abs(x)}_${z}`,x,z,.28,.28,4.1,"structure",{y:2.55}));

// Box-built steam locomotive ahead of the carriages: cab, boiler stack, chimney,
// paired wheel rows and side rods, not a featureless rectangular train proxy.
Add(Box("StationEngineFrame",-66,31,4.3,13,.4,"boundary",{y:1.1}),
 Box("StationEngineBoiler",-66,29,2.7,7,2,"ground",{y:2.25}),
 Box("StationEngineBoilerTop",-66,29,1.7,7,.45,"ground",{y:3.45}),
 Box("StationEngineChimney",-66,26,1,1,2,"boundary",{y:4}),
 Box("StationEngineCabRoof",-66,35,4.6,4,.25,"ground",{y:4.3}),
 Box("StationEngineCabBack",-66,36.8,4,.25,2.8,"ground",{y:2.8}),
 Box("StationEngineCabWest",-68,35,.2,4,1.4,"ground",{y:2.1}),
 Box("StationEngineCabEast",-64,35,.2,4,1.4,"ground",{y:2.1}),
 Box("StationEngineCoupler",-66,39,.4,2,.35,"boundary",{y:1.05}));
for(const side of [-1,1]){
 for(let i=0;i<4;i++)Add(Box(`StationEngineWheel${side}_${i}`,-66+side*1.55,27+i*2.1,2,1.3,1.3,"boundary",{y:.7}));
 Add(Box(`StationEngineRod${side}`,-66+side*2.6,30.15,.15,7,.2,"structure",{y:.72}));
}
// Continuous paired rails visibly coincide with wheels; sleepers break the old
// black-wall silhouette. They are under the car and do not raise public lanes.
for(const side of [-1,1])Add(Box(`StationRail${side}`,-66+side*.75,-2.5,.13,375,.14,"boundary",{y:.07,solid:false}));
for(let z=-189,index=0;z<=185;z+=1.8,index++)Add(Box(`StationSleeper${index}`,-66,z,3.3,.28,.08,"boundary",{y:.04,solid:false}));
// The through line stays at x=-66. A southern turnout branches into a short
// loading siding at x=-72; it is not a second, disconnected horizon mainline.
const turnoutYaw=Math.atan2(-6,18);
for(const side of [-1,1])Add(Box(`StationTurnoutRail${side}`,-69+side*.75,114,.13,Math.hypot(6,18),.14,"boundary",{y:.07,ry:turnoutYaw,solid:false}));
for(let index=0;index<=10;index++)Add(Box(`StationTurnoutSleeper${index}`,-66-index*.6,105+index*1.8,3.3,.28,.08,"boundary",{y:.04,ry:turnoutYaw,solid:false}));
for(const side of [-1,1])Add(Box(`StationLoadingSidingRail${side}`,-72+side*.75,144,.13,42,.14,"boundary",{y:.07,solid:false}));
for(let z=124.8,index=0;z<=165;z+=1.8,index++)Add(Box(`StationLoadingSidingSleeper${index}`,-72,z,3.3,.28,.08,"boundary",{y:.04,solid:false}));
Add(Box("StationLoadingSidingBallast",-72,144,5.6,42,.06,"ground",{y:.015,solid:false}),
 Box("StationLoadingSidingBuffer",-72,165.5,3.6,.5,1,"structure"));
for(const side of [-1,1])Add(Box(`StationLoadingSidingBufferPost${side}`,-72+side*1.3,165.5,.35,.65,1.3,"structure"));
Add(Box("StationRailBallast",-66,-2.5,5.6,375,.06,"ground",{y:.015,solid:false}),
 // Apron paint stays below the green 0.025m route paint; never coplanar.
 Box("StationPlatformApron",-46,64.5,32,53,.01,"ground",{y:platformTop+.005,solid:false}));

// Existing equipment tables/interaction anchors remain untouched. Cargo is
// grouped south of the walking lanes, leaving the eastern muster ground empty.
for(const [i,x] of [-56,-53,-50].entries()){
 Add(Box(`StationCargoLower${i}`,x,71,2,2,1,"missionRoute"),
  Box(`StationCargoUpper${i}`,x,71,1.6,1.6,.7,"missionRoute",{y:1.35}));
}
// North-facing station room and genuinely open front porch (door width 3.4m).
Add(Box("StationHouseBack",-40,73,8,.25,3.3,"ground"),
 Box("StationHouseWest",-44,69.5,.25,7,3.3,"ground"),
 Box("StationHouseEast",-36,69.5,.25,7,3.3,"ground"),
 Box("StationHouseFrontWest",-43,66,2,.25,3.3,"ground"),
 Box("StationHouseFrontEast",-37,66,2,.25,3.3,"ground"),
 Box("StationHouseRoof",-40,69,9,9,.3,"ground",{y:3.6}),
 Box("StationHousePorchRoof",-40,64.5,9,3,.18,"ground",{y:3.3}));
for(const [id,x,z,w,d] of [["Unload",-35,57,6,7],["Wounded",-45,83,10,7]]){
 Add(Box(`Station${id}Canopy`,x,z,w,d,.2,"ground",{y:3.1}));
 for(const sx of [-1,1])for(const sz of [-1,1])Add(Box(`Station${id}Post${sx}_${sz}`,x+sx*(w/2-.2),z+sz*(d/2-.2),.25,.25,3.1,"boundary"));
}
// Blue low beds distinguish the separate rearward casualty shelter without text.
for(const [i,x] of [-48,-44].entries())Add(Box(`StationWoundedBed${i}`,x,83,1.2,2.6,.5,"cover"));

// Keep the continuous mainline in world space; move only the station package.
// Shared support records must remain identical to their rendered block records.
const compiled=new Map(blocks.map(block=>{
 const lifted=/^Station(?:Cargo|House|Unload|Wounded)/.test(block.id);
 return [block,Object.freeze(/^Station(?:Rail-?1|Sleeper\d+|RailBallast)$/.test(block.id)
 ? block : {...block,...P012StationPoint(block.x,block.z),y:block.y+(lifted?platformTop:0)})];
}));
export const P012_STATION_BLOCKS=Object.freeze([...compiled.values()]);
export const P012_STATION_SURFACES=Object.freeze(surfaces.map(surface=>compiled.get(surface)));
export const P012_STATION_GATES=Object.freeze([
 Box("StationCar0TrainDoor",-63.6,103,.22,4.4,1.4,"structure",{y:1.95,signal:"P012TrainDoor"}),
 Box("TrainDoor",-63.6,121,.22,4.4,1.4,"structure",{y:1.95,signal:"P012TrainDoor"}),
 Box("StationCar2TrainDoor",-63.6,139,.22,4.4,1.4,"structure",{y:1.95,signal:"P012TrainDoor"}),
]);
// WORLD routes: interior start, interior doorway, last tread, clear apron.
// Consumers must not apply P012StationPoint a second time.
export const P012_STATION_EXITS=Object.freeze([103,121,139].map((z,index)=>Object.freeze({
 carIndex:index,gateId:index===1?"TrainDoor":`StationCar${index}TrainDoor`,
 route:Object.freeze([{x:-66,z:z+4},{x:-66,z},{x:-60.9,z},...(index===0?[{x:-60,z:101.8},{x:-55,z:101.8}]:[{x:-55,z}])].map(Object.freeze)),
})));
// Regex strings anchored to exact OLD families. Never use /^Station/ after
// appending this module, which would erase the new assets and traversal fixtures.
export const P012_STATION_REMOVE_IDS=Object.freeze([
 "^StationTrain.*$","^StationWindow.*$","^TrainDoor$","^RailEmbankment$",
 "^StationSouthCargo$","^StationEastShed$",
]);
