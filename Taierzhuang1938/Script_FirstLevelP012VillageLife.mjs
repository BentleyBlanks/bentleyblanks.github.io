// Pure finite controller. Host owns actors and collision. Move must sweep and
// update the real actor; Position must read that actor, not the requested target.
// MoveProp(from,to,radius) returns the collision-approved WORLD point (or from).
// Pose uses existing Actor.Update reach/melee/lifePose, never global pose edits.
import {P012_VILLAGE_LIFE as config,P012_VILLAGE_LIFE_PEOPLE as people} from "./Data_FirstLevelP012VillageLife.mjs";
const Copy=p=>p?{x:p.x,z:p.z}:null;
const Distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
function Step(a,b,amount){const distance=Distance(a,b),t=distance?Math.min(1,amount/distance):0;return{x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t};}
function Turn(from,to,amount){const delta=Math.atan2(Math.sin(to-from),Math.cos(to-from));return from+Math.max(-amount,Math.min(amount,delta));}
export class FirstLevelP012VillageLife {
 constructor(host){this.host=host;this.entries=[];this.started=false;this.disposed=false;this.time=0;this.doorTime=0;this.phoneIndex=1;this.muleIndex=1;this.phoneActive=false;this.muleActive=false;this.wire=[];this.mule=Copy(config.muleRoute[0]);this.muleYaw=0;this.muleTravel=0;this.familyPrevious=null;this.familyYaw=Math.PI;this.seen=new Set();}
 Start(){if(this.started||this.disposed)return false;this.started=true;this.entries=people.map(spec=>({spec,actor:this.host.Spawn({...spec})}));this.wire=[Copy(this.host.Position(this.entries[4].actor))];return true;}
 Visible(position){return !!position&&this.host.IsVisible?.(position)===true;}
 Update(dt){
  if(!this.started||this.disposed)return;
  const step=Math.min(.1,Math.max(0,Number.isFinite(dt)?dt:0));this.time+=step;
  const doorVisible=this.doorTime>0||this.Visible(config.door);let workersReady=true;
  for(const entry of this.entries){
   const {spec,actor}=entry;let speed=0,yaw=spec.yaw;
   if(spec.role==="telephone"){
    this.phoneActive ||= this.Visible(this.host.Position(actor));
    const target=config.telephoneRoute[this.phoneIndex];
    if(this.phoneActive&&target){const before=Copy(this.host.Position(actor));this.host.Move(actor,target,config.telephoneSpeed,step);const after=this.host.Position(actor);speed=step?Distance(before,after)/step:0;yaw=speed>.001?Math.atan2(before.x-after.x,before.z-after.z):yaw;if(Distance(after,target)<.08)this.phoneIndex++;if(Distance(this.wire.at(-1),after)>.4)this.wire.push(Copy(after));}
   }
   const working=spec.role==="worker"&&doorVisible&&this.doorTime<config.doorSeconds;
   const work=working?this.host.WorkerWork?.(spec,this.Door()):null;if(working&&!work)workersReady=false;
   if(work){const before=Copy(this.host.Position(actor));this.host.Move(actor,work.position,work.speedMps,step);const after=this.host.Position(actor);speed=step?Distance(before,after)/step:0;yaw=work.yaw;workersReady&&=Distance(after,work.position)<=work.arrivalRadius;}
   this.host.Pose(actor,{yaw,moveSpeed:speed,aim:0,firing:false,crouch:work?.crouch||0,reach:0,melee:0,workTargets:work?.targets||null,doorWork:working?this.Door():null,lifePose:spec.role==="wounded"?{sit:1,warmHands:.5}:{},lookPitch:spec.role==="wounded"?-.3:0},step);
  }
  if(doorVisible&&workersReady)this.doorTime=Math.min(config.doorSeconds,this.doorTime+step);
  this.muleActive ||= this.Visible(this.mule);
  const target=config.muleRoute[this.muleIndex];
  if(this.muleActive&&target){
   const before=Copy(this.mule),wanted=Math.atan2(before.x-target.x,before.z-target.z),yaw=Turn(this.muleYaw,wanted,.9*step);
   const aligned=Math.abs(Math.atan2(Math.sin(wanted-yaw),Math.cos(wanted-yaw)))<.12;
   const candidate=aligned?Step(before,target,config.muleSpeed*step):before;
   const approved=this.host.MoveProp(before,candidate,1.05,{fromYaw:this.muleYaw,toYaw:yaw});
   this.mule=Copy(approved);this.muleYaw=approved.yaw??yaw;this.muleTravel+=Distance(before,this.mule);
   if(Distance(this.mule,target)<.08)this.muleIndex++;
  }
  const family=this.host.ExistingFamilyActor?.(config.familyId,config.familySlot),at=family?Copy(this.host.Position(family)):null;
  if(at&&this.familyPrevious&&Distance(at,this.familyPrevious)>.0001)this.familyYaw=Turn(this.familyYaw,Math.atan2(this.familyPrevious.x-at.x,this.familyPrevious.z-at.z),1.5*step);
  this.familyPrevious=at;
  for(const item of this.Snapshot().vignettes)if(item.visible&&!this.seen.has(item.id)){this.seen.add(item.id);this.host.Signal?.(`P012Village${item.id}Seen`);}
 }
 Door(){
  const progress=Math.min(1,Math.max(0,(this.doorTime-3)/5));
  return{position:{x:config.door.x,z:config.door.z+progress*.7},height:1.15-progress*.55,rotationX:-Math.PI/2*progress,progress,state:this.doorTime===0?"waiting":this.doorTime<3?"unfastening":progress<1?"lowering":this.doorTime<config.doorSeconds?"lashing":"stretcherReady"};
 }
 Snapshot(){
  const actors=this.entries.map(({spec,actor})=>({id:spec.id,role:spec.role,position:Copy(this.host.Position(actor)),visible:this.Visible(this.host.Position(actor))}));
  const phone=actors.find(entry=>entry.role==="telephone");
  const family=this.host.ExistingFamilyActor?.(config.familyId,config.familySlot),familyPosition=family?Copy(this.host.Position(family)):null;
  const door=this.Door();
  const wire=this.wire.map(Copy);if(phone?.position&&wire.length&&Distance(wire.at(-1),phone.position)>.00001)wire.push(Copy(phone.position));
  const mule={position:Copy(this.mule),yaw:this.muleYaw,travel:this.muleTravel,state:this.muleIndex>=config.muleRoute.length?"arrived":this.muleActive?"northbound":"waiting"};
  return{started:this.started,disposed:this.disposed,actors,door,telephone:{position:phone?.position,wire,state:this.phoneIndex>=config.telephoneRoute.length?"arrived":this.phoneActive?"laying":"waiting"},mule,cart:{position:familyPosition,yaw:this.familyYaw,actorId:family?.id??null,familyId:config.familyId,slot:config.familySlot,state:familyPosition?"attached":"awaitingExistingFamily"},vignettes:[{id:"WaitingWounded",position:actors[0]?.position,state:"waitingForEvacuation"},{id:"DoorStretcher",position:door.position,state:door.state},{id:"Telephone",position:phone?.position,state:this.phoneActive?"laying":"waiting"},{id:"MuleAmmo",position:mule.position,state:mule.state},{id:"FamilyCart",position:familyPosition,state:familyPosition?"southbound":"absent"}].map(entry=>({...entry,visible:this.Visible(entry.position)}))};
 }
 Dispose(){if(this.disposed)return;this.disposed=true;for(const entry of this.entries)this.host.Remove?.(entry.actor);this.entries=[];}
}
