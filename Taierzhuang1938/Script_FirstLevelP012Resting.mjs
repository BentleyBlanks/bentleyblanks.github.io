// Pure host controller; no three, DOM, timers, navigation, respawn or teleport.
// Spawn(spec) places once with root foot at GroundHeight and returns a handle.
// Position(handle) returns current WORLD x/z. HoldPose(handle,state,dt) feeds
// Actor.Update with stationary movement and lifePose; never writes root position.
// Optional Remove(handle) releases host-owned actor on Dispose.
import {P012_RESTING_PEOPLE,P012_RESTING_REACTION} from "./Data_FirstLevelP012Resting.mjs";
export class FirstLevelP012Resting {
 constructor(host,people=P012_RESTING_PEOPLE){this.host=host;this.people=people;this.entries=[];this.started=false;this.disposed=false;}
 Start(){
  if(this.started||this.disposed)return false;
  this.started=true;
  this.entries=this.people.map(spec=>({spec,actor:this.host.Spawn({...spec,weapon:null}),sit:1,brace:0,alert:false}));
  return true;
 }
 OnImpact({event,position}={}){
  if(this.disposed||event!==P012_RESTING_REACTION.event||!Number.isFinite(position?.x)||!Number.isFinite(position?.z))return 0;
  let changed=0;
  for(const entry of this.entries){
   const at=this.host.Position(entry.actor);
   if(!entry.alert&&at&&Math.hypot(at.x-position.x,at.z-position.z)<=P012_RESTING_REACTION.radiusM){entry.alert=true;changed++;}
  }
  return changed;
 }
 Update(dt){
  if(!this.started||this.disposed)return;
  const step=Math.max(0,Math.min(.1,Number.isFinite(dt)?dt:0));
  for(const entry of this.entries){
   if(entry.alert)entry.brace=Math.min(1,entry.brace+step*P012_RESTING_REACTION.blendPerSecond);
   this.host.HoldPose(entry.actor,{moveSpeed:0,aim:0,firing:false,yaw:entry.spec.yaw,
    crouch:0,lookYaw:0,lookPitch:-.45*entry.brace,lifePose:{sit:1,warmHands:.35}},step);
  }
 }
 Snapshot(){return this.entries.map(({spec,actor,sit,brace,alert})=>({id:spec.id,position:this.host.Position(actor),sit,brace,alert,lookPitch:-.45*brace}));}
 Dispose(){if(this.disposed)return;this.disposed=true;for(const entry of this.entries)this.host.Remove?.(entry.actor);this.entries=[];}
}
