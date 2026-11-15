import * as THREE from "three";
import { FLOW_VILLAGE_STEALTH as PLAN } from "./Scenes/FirstLevelEncounter/Data_LevelFlow.mjs";

export class VillageStealthPlay {
  constructor(host,rules) {
    this.host=host;
    this.rules=rules;
    this.Reset();
  }
  Reset() {
    this.rules.Reset();
    this.state=null;
    this.pull=null;
    this.observerId=null;
    this.exitStartedElapsed=null;
    this.shots=this.host.state.playerShots;
    this.grenades=this.host.state.grenades+this.host.state.bundles;
  }
  CapturesInput() { return !!(this.state?.locked || this.state?.alarm); }
  CompanionFrameTime(frame,entries,elapsed) {
    if(frame.beat.id==="09a") {
      const points=frame.beat.p,player=this.host.player.position;
      let length=0,nearest=Infinity,distance=0;
      for(let index=1;index<points.length;index++) {
        const a=points[index-1],b=points[index],dx=b[0]-a[0],dz=b[1]-a[1];
        const squared=dx*dx+dz*dz,segment=Math.sqrt(squared);
        const t=squared?Math.max(0,Math.min(1,((player.x-a[0])*dx+(player.z-a[1])*dz)/squared)):0;
        const error=Math.hypot(a[0]+t*dx-player.x,a[1]+t*dz-player.z);
        if(error<nearest){nearest=error;distance=length+segment*t;}
        length+=segment;
      }
      const progress=Math.min(1,(distance+0.5)/Math.max(0.001,length));
      return Math.min(frame.beat.end-0.001,frame.beat.start+frame.beat.duration*progress);
    }
    if(frame.beat.id!==PLAN.pullBeat||frame.stealth.pulling)return null;
    const guards=[...entries.values()].filter(entry=>entry.actor.groupId===PLAN.patrol.id&&entry.soldier.alive);
    const cleared=guards.every(entry=>!entry.route || entry.routeIndex===entry.route.length-1
      &&Math.hypot(entry.soldier.position.x-entry.route.at(-1)[0],entry.soldier.position.z-entry.route.at(-1)[1])<1.5);
    if(cleared&&this.exitStartedElapsed===null)this.exitStartedElapsed=elapsed;
    if(this.exitStartedElapsed===null)return frame.beat.start+PLAN.pullSeconds;
    return Math.min(frame.beat.end-0.001,frame.beat.start+PLAN.patrolClearSeconds+elapsed-this.exitStartedElapsed);
  }
  Detected(entries) {
    const {player,battlefield}=this.host;
    this.observerId=null;
    for(const [id,entry] of entries) {
      const soldier=entry.soldier;
      if(entry.spec.side!=="ija" || !soldier.alive) continue;
      const from=soldier.position.clone();
      from.y+=PLAN.enemyEyeM;
      const dx=player.position.x-from.x,dz=player.position.z-from.z,distance=Math.hypot(dx,dz);
      if(distance>PLAN.detectionRangeM) continue;
      const yaw=soldier.actor.root.rotation.y;
      if(distance>1.5 && (-Math.sin(yaw)*dx-Math.cos(yaw)*dz)/distance<Math.cos(THREE.MathUtils.degToRad(PLAN.detectionHalfAngleDeg))) continue;
      for(const height of [player.eyeHeight,player.eyeHeight*0.55]) {
        const to=new THREE.Vector3(player.position.x,player.position.y+height,player.position.z);
        const direction=to.sub(from),range=direction.length();
        if(range<1e-6) {
          this.observerId=id;
          return true;
        }
        const hit=battlefield.Raycast(from,direction.divideScalar(range),range,{terrain:true});
        if(!hit || (hit.t??hit.distance)>=range-0.08) {
          this.observerId=id;
          return true;
        }
      }
    }
    return false;
  }
  Update(frame,dt,entries) {
    const {player,state}=this.host;
    const totalGrenades=state.grenades+state.bundles;
    this.state=this.rules.Step({time:frame.time,dt,
      fired:state.playerShots>this.shots,grenade:totalGrenades<this.grenades,
      detected:frame.stealth.active && !frame.stealth.pulling && this.Detected(entries)});
    this.shots=state.playerShots;
    this.grenades=totalGrenades;
    if(this.state.pulling) {
      if(!this.pull) {
        this.pull={
          origin:player.position.clone(),
          eyeHeight:player.eyeHeight,
          yaw:player.yaw,
          pitch:player.pitch
        };
      }
      const u=this.state.pullProgress,target=PLAN.playerCover;
      player.SetStance("crouch");
      player.eyeHeight=THREE.MathUtils.lerp(this.pull.eyeHeight,Math.min(this.pull.eyeHeight,0.95),u);
      const x=THREE.MathUtils.lerp(this.pull.origin.x,target[0],u);
      const z=THREE.MathUtils.lerp(this.pull.origin.z,target[1],u);
      player.velocity.set(0,0,0);
      const targetYaw=Math.atan2(-(PLAN.lookAt[0]-this.pull.origin.x),-(PLAN.lookAt[1]-this.pull.origin.z));
      const turn=Math.atan2(Math.sin(targetYaw-this.pull.yaw),Math.cos(targetYaw-this.pull.yaw));
      const lookProgress=Math.min(1,(frame.time-frame.beat.start)/PLAN.pullLeadSeconds);
      player.yaw=this.pull.yaw+turn*lookProgress;
      player.pitch=THREE.MathUtils.lerp(this.pull.pitch,0,lookProgress);
      player.aimYaw=0;
      player.aimPitch=0;
      player.ResetLean();
      if(player.body) {
        player.body.ReconcileTo(player.position.x,player.position.y,player.position.z);
        player.body.SetSize(player.radius,player.eyeHeight+0.16);
        const moved=player.body.Move(x-player.position.x,0,z-player.position.z);
        player.position.set(moved.x,moved.y,moved.z);
      } else player.position.set(x,this.host.battlefield.GroundHeight(x,z),z);
    } else this.pull=null;
    return this.state;
  }
}
