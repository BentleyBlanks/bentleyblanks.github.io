// P012 station replacement, WORLD coordinates; do not run P012MapPoints on this.
// Pure BoxGrammar: y is box centre, top=y+h/2; no rx/rz, assets or textures.
// BLOCKS includes the identical SURFACES objects; render BLOCKS once and register
// SURFACES as layout.walkableSurfaces for the shared height contract. Do not retain
// the old analytic y=0 spawn assumption inside the carriage or on its steps.
// Ground-painted aprons are non-solid; train floors/steps are actual support.
import { TRAVERSAL } from "./Data_Traversal.mjs";
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
const floorTop=1.25,stepRise=floorTop/5;
if(stepRise>TRAVERSAL.stepMax)throw new Error("Station stairs exceed automatic step threshold");

// Three aligned carriages; the middle car owns the unchanged player/Luo anchors.
// Window strips are genuinely open above the solid waist, admitting exterior light.
for(const [index,z] of [47,65,83].entries()){
  const id=`StationCar${index}`,near=index===1;
  Surface(`${id}Floor`,-66,z,4.8,14,floorTop);
  Add(Box(`${id}Roof`,-66,z,5.1,14.4,.22,"ground",{y:4.15}),
    Box(`${id}NorthEnd`,-66,z-7,4.8,.22,2.7,"ground",{y:2.7}),
    Box(`${id}SouthEnd`,-66,z+7,4.8,.22,2.7,"ground",{y:2.7}),
    Box(`${id}WestWaist`,-68.4,z,.22,14,1.15,"ground",{y:1.825}),
    Box(`${id}WestHeader`,-68.4,z,.22,14,.3,"ground",{y:3.9}));
  const spans=near?[[58,58.8],[63.2,72]]:[[z-7,z+7]];
  for(const [part,[a,b]] of spans.entries()){
    Add(Box(`${id}EastWaist${part}`,-63.6,(a+b)/2,.22,b-a,1.15,"ground",{y:1.825}),
      Box(`${id}EastHeader${part}`,-63.6,(a+b)/2,.22,b-a,.3,"ground",{y:3.9}));
    for(let at=a+.15,n=0;at<b;at+=1.5,n++)Add(Box(`${id}WindowPost${part}_${n}`,-63.6,at,.22,.14,1.5,"ground",{y:3.05}));
  }
  for(const side of [-1,1])for(const offset of (near?[-6,-5.5,4.5,5.5]:[-4.5,-3,3,4.5])){
    // Wide box-wheel/axle assemblies span rail contact to the visible body edge.
    // The occupied car's front bogie sits outside the east stair opening.
    Add(Box(`${id}Wheel${side}_${offset}`,-66+side*1.55,z+offset,2,.85,.85,"boundary",{y:.68}));
  }
  Add(Box(`${id}Underframe`,-66,z,3.6,13,.3,"boundary",{y:1.05}));
  if(index<2)Add(Box(`${id}Coupler`,-66,z+9,.4,3.7,.35,"boundary",{y:1.05}));
}
// East-side descending stair: five 0.25m risers, 0.6m tread, 3m clear width.
// The final flush tread is visual only; analytic ground owns its contact plane.
for(let index=0;index<5;index++){
  const top=floorTop-stepRise*(index+1),x=-63.3+index*.6;
  if(top>0)Surface(`StationExitStep${index}`,x,61,.6,3,top,"step",top);
  else Add(Box(`StationExitStep${index}`,x,61,.6,3,.006,"step",{y:0,solid:false}));
}

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
for(const side of [-1,1])Add(Box(`StationRail${side}`,-66+side*.75,-32.5,.13,315,.14,"boundary",{y:.07,solid:false}));
for(let z=-189,index=0;z<=125;z+=1.8,index++)Add(Box(`StationSleeper${index}`,-66,z,3.3,.28,.08,"boundary",{y:.04,solid:false}));
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
Add(Box("StationRailBallast",-66,-32.5,5.6,315,.06,"ground",{y:.015,solid:false}),
 // Apron paint stays below the green 0.025m route paint; never coplanar.
 Box("StationPlatformApron",-57,62,10,17,.01,"ground",{y:.005,solid:false}));

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

export const P012_STATION_BLOCKS=Object.freeze(blocks);
export const P012_STATION_SURFACES=Object.freeze(surfaces);
export const P012_STATION_GATES=Object.freeze([
 Box("TrainDoor",-63.6,61,.22,4.4,2.7,"ground",{y:2.6,signal:"P012TrainDoor"}),
]);
// Regex strings anchored to exact OLD families. Never use /^Station/ after
// appending this module, which would erase the new assets and traversal fixtures.
export const P012_STATION_REMOVE_IDS=Object.freeze([
 "^StationTrain.*$","^StationWindow.*$","^TrainDoor$","^RailEmbankment$",
 "^StationSouthCargo$","^StationEastShed$",
]);
