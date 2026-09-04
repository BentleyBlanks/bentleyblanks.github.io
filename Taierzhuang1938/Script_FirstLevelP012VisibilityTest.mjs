// Execute production render-policy methods without WebGL or a browser.
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import {P012MapPoints} from "./Data_FirstLevelP012Space.mjs";
import {AircraftStrafeDirector} from "./Script_AircraftStrafe.mjs";
import {FIRST_LEVEL_P012_LAYOUT as layout,P012_ANCHORS as anchors} from "./Data_FirstLevelP012Layout.mjs";
import phase from "./Data_FirstLevelP012Whitebox.mjs";
import {MissionSetpieceDirector} from "./Script_MissionSetpieces.mjs";
import {FirstLevelP012Runtime} from "./Script_FirstLevelP012Runtime.mjs";
function Source(file){return fs.readFileSync(new URL(file,import.meta.url),"utf8").replace(/\r/g,"");}
function Method(source,name){return source.match(new RegExp(`  (?:async )?${name}\\([^\\n]*[\\s\\S]*?\\n  }\\n`))[0];}
const field=Source("./Script_FirstLevelWhiteboxField.mjs");
const nodes=[];
const document={createElement:tag=>({tag,style:{},children:[],appendChild(node){this.children.push(node);}}),createTextNode:text=>({text}),body:{appendChild:node=>nodes.push(node)}};
const legendMethod=vm.runInNewContext(`({${Method(field,"BuildLegend")}})`,{document,window:{innerWidth:390}});
const legendHost={layout:{scenario:{},semanticColors:{ground:0xb8b8b0,step:1,vault:2,mantle:3,cover:4,boundary:5,danger:6,missionRoute:7,stretcherRoute:8}}};
legendMethod.BuildLegend.call(legendHost);
assert.equal(legendHost.legend.open,false,"mobile legend starts compact");
const objectiveCss=legendHost.legend.children.find(n=>n.tag==="style").textContent;
assert.match(objectiveCss,/body:has\(#firstLevelP012Legend\) \.hudObjective/);
assert.match(objectiveCss,/opacity:1 !important; animation:none !important; background:#151a20/);
assert.match(objectiveCss,/color:#fff/);
legendMethod.BuildLegend.call({layout:{}});assert.equal(nodes.length,1,"legacy field adds no HUD override");
assert.match(Method(field,"Dispose"),/this\.legend\?\.remove\(\)/,"P012 styles leave with the disposable legend");
const gateMethods=vm.runInNewContext(`({${Method(field,"OpenGate")},${Method(field,"CloseGate")}})`,{ColliderRecord:spec=>({id:spec.id})});
for(const p012 of [false,true]){
 const spec={id:"Door",y:1.9,h:3.8},collider={_physicsHandle:1};
 const gate={spec,collider,open:false,mesh:{position:{y:spec.y},visible:true}};
 const removed=[],added=[];
 const host={layout:p012?{scenario:{}}:{},gates:new Map([[spec.id,gate]]),colliders:[collider],physics:{RemoveSolid:h=>removed.push(h),AddSolid:b=>added.push(b)},BuildCollisionGrid(){}};
 assert.equal(gateMethods.OpenGate.call(host,spec.id),true);
 assert.equal(gate.mesh.visible,!p012);assert.equal(gate.mesh.position.y,p012?spec.y:spec.y+spec.h+1.2);
 assert.equal(host.colliders.length,0);assert.equal(removed.length,1);
 assert.equal(gateMethods.CloseGate.call(host,spec.id),true);assert.equal(gate.mesh.visible,true);assert.equal(gate.mesh.position.y,spec.y);
 assert.equal(host.colliders.length,1);assert.equal(added.length,1);
}
function Root(){return {visible:true,position:{set(){}},rotation:{set(){}}};}
const aircraft=Source("./Script_Aircraft.mjs");
const specs=[0,1,2].map(id=>({id,orbitRadius:40,speed:1,phaseOffset:0,altitude:30,bank:0}));
const methods=vm.runInNewContext(`({${["Load","SetPhase","Update","FormFor"].map(n=>Method(aircraft,n)).join(",")}})`,{
 REJOIN_HIDE_S:2.5,AIRCRAFT_ASSETS:specs,LOADER:{loadAsync:async()=>({})},PrepareAircraft:()=>Root(),ApplyStrafePose:()=>{},
});
const host={forms:[],group:{add(){}},phase:null,anchor:{x:0,y:0,set(x,y){this.x=x;this.y=y;}},lastElapsed:0,rejoinT:0,strafeForm:null,FormFor:methods.FormFor};
const bounds={minX:0,maxX:10,minZ:0,maxZ:10};
methods.SetPhase.call(host,{bounds,whitebox:{p012:true}});
await methods.Load.call(host);assert.ok(host.forms.every(f=>!f.root.visible),"late-loaded P012 planes must start hidden");
methods.Update.call(host,1,null);assert.ok(host.forms.every(f=>!f.root.visible),"no pre-story orbiters");
methods.Update.call(host,2,{active:true,aircraft:{id:1}});assert.deepEqual(host.forms.map(f=>f.root.visible),[false,true,false]);
methods.Update.call(host,10,null);assert.ok(host.forms.every(f=>!f.root.visible),"no orbiters after scripted exit");
methods.SetPhase.call(host,{bounds});for(let time=20;time<26;time++)methods.Update.call(host,time,null);assert.ok(host.forms.every(f=>f.root.visible),"legacy orbit returns after its unchanged rejoin delay");
methods.SetPhase.call(host,{bounds,whitebox:{p012:true}});assert.ok(host.forms.every(f=>!f.root.visible),"phase entry hides loaded planes immediately");
console.log("PASS P012 gate visibility/restore and story-only aircraft, legacy visuals unchanged");

// Replay the production curve and impact steering, rather than a separate
// test-only trajectory. A voluntary south-facing view includes the people and
// the final turn; this does not lock the camera or promise visibility behind it.
function Occluded(from,to){
 return layout.blocks.some(b=>{
  if(b.solid===false)return false;
  const c=Math.cos(b.ry),s=Math.sin(b.ry),local=p=>[(p.x-b.x)*c-(p.z-b.z)*s,p.y-b.y,(p.x-b.x)*s+(p.z-b.z)*c];
  const a=local(from),end=local(to),half=[b.w/2,b.h/2,b.d/2];let low=0,high=1;
  for(let axis=0;axis<3;axis++){
   const delta=end[axis]-a[axis];
   if(Math.abs(delta)<1e-8){if(Math.abs(a[axis])>half[axis])return false;}
   else{const t=(-half[axis]-a[axis])/delta,u=(half[axis]-a[axis])/delta;low=Math.max(low,Math.min(t,u));high=Math.min(high,Math.max(t,u));if(low>high)return false;}
  }return true;
 });
}
const airCfg=phase.whitebox.aircraftRoutes.crowdTurn;
assert.ok(airCfg.turnControl2,"P012 uses a two-tangent continuous turn");
assert.ok(airCfg.to.z<airCfg.from.z,"attack enters from the south, not same-direction pursuit");
const curve=new AircraftStrafeDirector({});curve.StrafeRun({preset:"crowdTurn",...airCfg});
const observers=[P012MapPoints({x:47,z:74}),P012MapPoints({x:46,z:70}),P012MapPoints({x:44,z:66}),P012MapPoints({x:44,z:62})];
const crowd=P012MapPoints({x:47,y:1.1,z:80});let sightSamples=0;
for(let i=0;i<=100;i++){
 curve.run.t=2.5+2.5*i/100;curve.PlaceAircraft(0);const plane=curve.run.air;
 for(let leg=1;leg<observers.length;leg++)for(let k=0;k<=10;k++){
  const a=observers[leg-1],b=observers[leg],eye={x:a.x+(b.x-a.x)*k/10,y:1.62,z:a.z+(b.z-a.z)*k/10};
  for(const target of [plane,crowd]){
   assert.equal(Occluded(eye,target),false,"air and unarmed road column have actual solid-geometry LOS");
   // Perspective projection, south-facing, pitched up 8 degrees, base FOV55.
   const dx=target.x-eye.x,dy=target.y-eye.y,dz=target.z-eye.z,pitch=8*Math.PI/180;
   const depth=dy*Math.sin(pitch)+dz*Math.cos(pitch),up=dy*Math.cos(pitch)-dz*Math.sin(pitch);
   assert.ok(depth>0&&Math.abs(dx/depth)<Math.tan(55*Math.PI/360)*16/9&&Math.abs(up/depth)<Math.tan(55*Math.PI/360),"last 2.5s plane and people fit the same freely chosen 16:9 view");
  }sightSamples++;
 }
}
function ReplayCrowdPass(){
 const sys=new AircraftStrafeDirector({});sys.StrafeRun({preset:"crowdTurn",...airCfg,TrackTo:()=>crowd});
 let nearest=Infinity;const trace=[];
 while(sys.Active){sys.Update(1/60);if(sys.run?.phase==="strafe"){
  const p=sys.run.impact;nearest=Math.min(nearest,Math.hypot(p.x-crowd.x,p.z-crowd.z));trace.push([p.x,p.z]);
 }}return {nearest,trace};
}
const pass=ReplayCrowdPass();assert.ok(pass.nearest<.5,"real steered impact line crosses the actual road column, not an empty endpoint");
assert.deepEqual(ReplayCrowdPass(),pass,"air attack geometry is deterministic and replayable");
console.log(`PASS P012 southern turn: ${sightSamples} LOS/projected-view samples; crowd impact miss ${pass.nearest.toFixed(3)}m`);

// Use actual chapter roster and EscortColumn.Start slot placement, not a single
// invented crowd point. This checks the new formation, not AI arrival timing.
const castHost={SpawnActor:spec=>({position:{x:spec.x,y:0,z:spec.z},alive:true}),PositionOf:actor=>actor.position};
const castDirector=new MissionSetpieceDirector(castHost);
assert.equal(castDirector.BeginLevel("CH1_NanLu",phase),true);
const cast=castDirector.mem.column;
cast.waypoints=[P012MapPoints({x:47,z:80}),P012MapPoints({x:44,z:92})];cast.Start();
const civilians=cast.members.filter(m=>m.role==="civilian");
assert.deepEqual(civilians.map(m=>m.variant).sort(),["female","male"]);
assert.ok(civilians.every(m=>m.weapon===null));
for(const member of cast.members.filter(m=>m.role==="civilian"||m.role==="bearer")){
 assert.ok(Math.abs(member.slot.lateral)+.42<=1.3,"mixed formation fits the existing stretcher corridor");
 for(const other of cast.members.filter(m=>m!==member&&(m.role==="civilian"||m.role==="bearer"))){
  const a=member.handle.position,b=other.handle.position;
  assert.ok(Math.hypot(a.x-b.x,a.z-b.z)>=.84,"civilian must not overlap a bearer capsule");
 }
}
const actualEye=P012MapPoints({x:45.356,y:1.62,z:66.265}),actualPitch=.249;
curve.run.t=4.75;curve.PlaceAircraft(0);
const actualYaw=Math.atan2(curve.run.air.x-actualEye.x,curve.run.air.z-actualEye.z);
for(const member of civilians){
 const target={...member.handle.position,y:1.1};
 assert.equal(Occluded(actualEye,target),false,`${member.variant} civilian actual slot has LOS from failed-run camera position`);
 const dx=target.x-actualEye.x,dz=target.z-actualEye.z,dy=target.y-actualEye.y;
 const right=dx*Math.cos(actualYaw)-dz*Math.sin(actualYaw),forward=dx*Math.sin(actualYaw)+dz*Math.cos(actualYaw);
 const depth=dy*Math.sin(actualPitch)+forward*Math.cos(actualPitch),up=dy*Math.cos(actualPitch)-forward*Math.sin(actualPitch);
 assert.ok(depth>0&&Math.abs(right/depth)<Math.tan(55*Math.PI/360)*16/9&&Math.abs(up/depth)<Math.tan(55*Math.PI/360),`${member.variant} civilian fits the same actual-pitch plane-facing view`);
}
console.log("PASS production male/female formation slots: separation, corridor width, actual-camera LOS and shared aircraft view");
// Runtime ten-person movement replay, not ideal slot placement: late members
// have not yet caught up to their desired slots. Preserve this distinction.
const reachedCivilians=[P012MapPoints({variant:"male",x:48.182,y:1.1,z:71.455}),P012MapPoints({variant:"female",x:49.085,y:1.1,z:67.353})];
const reachedVisible=reachedCivilians.filter(target=>{
 const dx=target.x-actualEye.x,dz=target.z-actualEye.z,dy=target.y-actualEye.y;
 const right=dx*Math.cos(actualYaw)-dz*Math.sin(actualYaw),forward=dx*Math.sin(actualYaw)+dz*Math.cos(actualYaw);
 const depth=dy*Math.sin(actualPitch)+forward*Math.cos(actualPitch),up=dy*Math.cos(actualPitch)-forward*Math.sin(actualPitch);
 return !Occluded(actualEye,target)&&depth>0&&Math.abs(right/depth)<Math.tan(55*Math.PI/360)*16/9&&Math.abs(up/depth)<Math.tan(55*Math.PI/360);
});
assert.deepEqual(reachedVisible.map(m=>m.variant),["male"],"actual movement replay shows a civilian with the aircraft; the near-right female is correctly outside this camera");
console.log("PASS actual ten-person replay positions: male civilian visible, near-right female correctly reported offscreen");
const dive=new AircraftStrafeDirector({});
dive.StrafeRun({preset:"divePress",...phase.whitebox.aircraftRoutes.divePress,TrackTo:()=>(P012MapPoints({x:44,z:62}))});
let diveVisibleSamples=0;
while(dive.Active){
 dive.Update(1/120);
 if(dive.run?.phase!=="strafe")continue;
 const eye=P012MapPoints({x:44,y:1.62,z:62}),air=dive.run.air;
 assert.equal(Occluded(eye,air),false,"expanded actual dive pass is not hidden by scene geometry");
 assert.ok(air.z>eye.z,"actual attack stays in the southern sky rather than switching behind the player");
 diveVisibleSamples++;
}
assert.ok(diveVisibleSamples>=299,"visibility audit covers 2.5 seconds of strafe, not exit");
console.log(`PASS expanded dive: ${diveVisibleSamples} real strafe sky-LOS samples`);

// Execute the actual Main host callback with a real Three perspective camera.
// Include closed gates and the initial scenario, not only static layout.blocks.
const THREE=await import(`data:text/javascript;base64,${Buffer.from(Source("./vendor/three/build/three.core.js")).toString("base64")}`);
const observationCamera=new THREE.PerspectiveCamera(55,16/9,.06,620);
const initialGeometry=[...layout.blocks.filter(b=>!layout.scenario.replaceBlockIds.includes(b.id)),...layout.scenario.states[0].blocks,...layout.gates];
function ObservationRaycast(origin,direction,maxDistance){
 let nearest=maxDistance+1;
 for(const b of initialGeometry){
  if(b.solid===false)continue;
  const c=Math.cos(b.ry),s=Math.sin(b.ry),a=[(origin.x-b.x)*c-(origin.z-b.z)*s,origin.y-b.y,(origin.x-b.x)*s+(origin.z-b.z)*c];
  const d=[direction.x*c-direction.z*s,direction.y,direction.x*s+direction.z*c],half=[b.w/2,b.h/2,b.d/2];
  let low=0,high=maxDistance;
  for(let axis=0;axis<3;axis++){
   if(Math.abs(d[axis])<1e-9){if(Math.abs(a[axis])>half[axis]){high=-1;break;}}
   else{const t=(-half[axis]-a[axis])/d[axis],u=(half[axis]-a[axis])/d[axis];low=Math.max(low,Math.min(t,u));high=Math.min(high,Math.max(t,u));}
  }
  if(low<=high)nearest=Math.min(nearest,low);
 }return nearest<=maxDistance?{t:nearest}:null;
}
const observationField={Raycast:ObservationRaycast};
const mainSource=Source("./Script_Main.mjs");
const hostSource=mainSource.slice(mainSource.indexOf("    TrafficVisible:"),mainSource.indexOf("    RetireTraffic:"));
const player={EyePosition:observationCamera.position};
const visible=Function("camera","player","battlefield","P012BinocularLensContains",`return ({${hostSource}}).TrafficVisible;`)(observationCamera,player,observationField,()=>{throw new Error("P012 ordinary sight must never request binocular lenses");});
const hub=anchors.supplyPoint;
observationCamera.position.set(hub.x,1.62,hub.z);
observationCamera.fov=55;observationCamera.updateProjectionMatrix();
const subjects=phase.whitebox.activities.traffic.filter(entry=>entry.side===0||entry.role==="walking")
 .map(entry=>({alive:true,position:new THREE.Vector3((entry.side===0?entry.route.at(-1):entry.route[0]).x,0,(entry.side===0?entry.route.at(-1):entry.route[0]).z)}));
assert.equal(subjects.length,5,"three real northbound soldiers and two southbound wounded");
for(const actor of subjects){
 const Aim=()=>{observationCamera.lookAt(actor.position.x,1.15,actor.position.z);observationCamera.updateMatrixWorld(true);};
 Aim();assert.equal(visible(actor),true,"actual northbound/wounded actor visible at normal 55 degree FOV and real hub geometry");
 for(const pitch of [-1.4,1.4]){
  Aim();observationCamera.rotateX(pitch);observationCamera.updateMatrixWorld(true);
  assert.equal(visible(actor),false,"sky or feet are not actor recognition");
 }
 Aim();observationField.Raycast=()=>({t:1});
 assert.equal(visible(actor),false,"real callback rejects intervening geometry");
 observationField.Raycast=ObservationRaycast;
 Aim();
 observationCamera.rotateY(Math.PI);observationCamera.updateMatrixWorld(true);
 assert.equal(visible(actor),false,"actors behind the actual camera are not recognized");
 actor.alive=false;Aim();assert.equal(visible(actor),false);actor.alive=true;
}
assert.deepEqual(phase.whitebox.activities.orientations,[],"removed four-landmark task has no targets");
const noLandmarkRuntime=new FirstLevelP012Runtime({ObservationVisible:()=>{throw new Error("obsolete landmark raycast");},GuideActor:()=>null,Position:()=>null,Alive:()=>false},phase.whitebox);
for(const beat of [3,4]){noLandmarkRuntime.beat=beat;assert.deepEqual(noLandmarkRuntime.Sample().orientationVisible,[]);}
// Fixed real impact stays in the forward horizontal view while the player keeps
// moving through the 1.6s warning. This is projection, not a claim that every
// particle is visible through foreground actors or that the camera is forced.
const activity=phase.whitebox.activities,[a,b]=activity.shellCoverRoute;
const direction=new THREE.Vector3(b.x-a.x,0,b.z-a.z).normalize();
for(const speed of [activity.openingGuideWalkMps,activity.openingGuideCatchupMps]){
 const distance=activity.northNearMissAfterM+speed*1.6;
 const p=new THREE.Vector3(a.x,1.62,a.z).addScaledVector(direction,distance);
 observationCamera.position.copy(p);observationCamera.lookAt(p.clone().add(direction));observationCamera.updateMatrixWorld(true);
 const target=new THREE.Vector3(activity.northNearMissImpactPosition.x,.35,activity.northNearMissImpactPosition.z).project(observationCamera);
 assert.ok(target.z>-1&&target.z<1&&Math.abs(target.x)<.95,"production fixed impact lies inside normal horizontal FOV after real walk/run advance");
}
console.log("PASS normal 55FOV village traffic: actual Main callback, sky/feet/wall/behind-camera rejection and fixed-impact projection");
