import assert from 'node:assert/strict';
import {Vector3} from 'three';
import {SquadMarchAi} from './Script_SquadMarchAi.mjs';
import {InstallSquadMarchActor} from './Script_SquadMarchActor.mjs';

const ai={time:10,ctx:{nav:{Walkable:()=>true},battlefield:{GroundHeight:()=>0}}};
const soldiers=Array.from({length:4},(_,i)=>({id:i+1,alive:true,position:new Vector3(i*2,0,0),goal:new Vector3(),
  yaw:0,moveSpeed:0,target:{},targetVisible:false,lastFire:-99,grounded:true,vaultT:-1}));
const adapter=new SquadMarchAi(ai,soldiers,{route:[{x:0,z:0},{x:0,z:-200}]});
for(let frame=0;frame<2400;frame++){
  ai.time+=1/60;adapter.Update(1/60);
  for(const s of soldiers){const c=s.squadMarchCommand;if(!c)continue;const delta=s.goal.clone().sub(s.position),d=delta.length();
    const step=Math.min(d,c.speedMps/60);if(d)s.position.addScaledVector(delta,step/d);s.moveSpeed=step*60/3.6;}
}
assert.ok(adapter.march.events.some(e=>e.type==='stop'),'remembering an unseen enemy must not suppress all rest cycles');
assert.ok(soldiers.every(s=>s.position.z<-30),'memory-only march keeps physical progress');
const s=soldiers[1];
for(const patch of [{targetVisible:true},{lastFire:ai.time},{vaultT:0},{suppression:.8},{hurtPose:.8},{carryRole:'front'},{woundedWalk:1},{grounded:false}]){
  Object.assign(s,patch);adapter.Update(1/60);assert.ok(!s.squadMarchCommand,`priority releases command: ${JSON.stringify(patch)}`);
  Object.assign(s,{targetVisible:false,lastFire:-99,vaultT:-1,suppression:0,hurtPose:0,carryRole:null,woundedWalk:0,grounded:true});
}
adapter.Dispose();assert.ok(soldiers.every(s=>!s.squadMarchCommand&&!Object.hasOwn(s,'p012Guided')),'dispose restores only owned movement');
const blocked={id:'Blocked',alive:true,position:new Vector3(),goal:new Vector3(),moveSpeed:0,grounded:true,yaw:0};
const navAi={...ai,ctx:{...ai.ctx,nav:{Walkable:()=>true,Steer:()=>true}}};
const recovery=new SquadMarchAi(navAi,[blocked],{route:[{x:0,z:0},{x:0,z:-100}]},{Move(s,point,speed){
  s.goal.copy(s.position).addScaledVector(new Vector3(point.x,0,point.z).sub(s.position).normalize(),8);s.scriptMoveSpeedMps=speed;
}});
for(let i=0;i<120;i++)recovery.Update(1/60);
assert.ok(blocked.goal.distanceTo(blocked.position)>14,'a real stall restores the far goal required by host navigation');
recovery.Dispose();
let poseState;
const actor={characterRig:{p012ActorMotion:true,Update(_dt,state){poseState=state;}}},soldier={actor,squadMarchCommand:{breath:1}};
InstallSquadMarchActor(soldier);actor.characterRig.Update(.1,{aim:1,lookYaw:.8,firing:false});assert.equal(poseState.aim,0,'memory aim yields to actual recovery pose');
actor.characterRig.Update(.1,{aim:1,firing:true});assert.equal(poseState.aim,1,'real shot preserves weapon pose');
delete soldier.squadMarchCommand;actor.characterRig.Update(.1,{aim:.7});assert.equal(poseState.aim,.7,'normal mission pose resumes after release');
console.log('ok actual AI adapter: memory-only movement/rest, combat and traversal handoff, disposal, existing mission pose recovery');
