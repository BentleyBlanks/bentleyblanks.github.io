// Adapter for existing AiDirector soldiers: keep Rapier/navigation and combat ownership.
import { SquadMarch } from './Script_SquadMarch.mjs';
import { InstallSquadMarchActor } from './Script_SquadMarchActor.mjs';
import { SQUAD_MARCH_GUARDS as G } from './Data_Tuning_SquadMarch.mjs';

export class SquadMarchAi {
  constructor(ai,soldiers,config,{Move=null}={}){
    this.ai=ai;this.soldiers=[...soldiers];this.Move=Move;
    this.march=new SquadMarch({...config,count:soldiers.length,
      members:soldiers.map((s,i)=>({id:String(s.id),...(config.members?.[i]?.route?{route:config.members[i].route}:{})}))});
    this.owned=new Map();
    for(const soldier of this.soldiers)InstallSquadMarchActor(soldier);
  }
  AddMember(soldier,options){this.march.AddMember(soldier.id,options);this.soldiers.push(soldier);InstallSquadMarchActor(soldier);}
  RemoveMember(soldier){this.Release(soldier);this.march.RemoveMember(soldier.id);this.soldiers=this.soldiers.filter(s=>s!==soldier);}
  SetLeader(soldier){this.march.SetLeader(soldier.id);}
  Update(dt,{player=null,Observe=()=>({})}={}){
    const observations=this.soldiers.map(s=>({id:String(s.id),position:s.position,yaw:s.yaw,alive:s.alive,
      speedMps:(s.moveSpeed||0)*3.6,turnLimited:false,
      noPause:!!(this.owned.get(s)?.navigationGoal||this.owned.get(s)?.recoveryGoal),
      // AI retains unseen targets in memory. Awareness alone is not active combat.
      busy:!!((s.target&&s.targetVisible!==false)||this.ai.time-s.lastFire<G.recentFireS
        ||s.carryRole||s.woundedWalk||s.meleeCombat||s.vaultT>=0||s.ragdollState||s.grounded===false
        ||s.state==='grenade'||s.state==='vault'||this.ai.time-s.grenadeThreatAt<G.grenadeThreatS||s.suppression>G.suppression||s.hurtPose>G.hurt),
      canPause:this.CanPause(s),CanMoveTo:point=>this.CanMoveTo(s,point),...Observe(s)}));
    const outputs=this.march.Update(dt,observations,{player});
    for(const s of this.soldiers){
      const command=outputs.get(String(s.id));
      if(!command?.controlled){this.Release(s);continue;}
      if(!this.owned.has(s))this.owned.set(s,{prior:new Map(),applied:new Map(),goal:s.goal?.clone()});
      const owner=this.owned.get(s);
      s.squadMarchCommand=command;
      owner.command=command;
      if(this.Move){
        this.Move(s,command.goal,command.speedMps);
        if(command.arrivalM)s.scriptArrivalRadius=Math.min(s.scriptArrivalRadius??Infinity,command.arrivalM);
        // Some authored hosts clamp goals to a short corridor step. After an actual
        // stall, expose the original distant waypoint so AiDirector can navigate
        // around static obstacles instead of repeatedly walking into the same face.
        const distance=Math.hypot(command.goal.x-s.position.x,command.goal.z-s.position.z);
        owner.stalledS=command.speedMps>G.navigationCommandMps&&(s.moveSpeed||0)*3.6<G.navigationMovingMps?(owner.stalledS||0)+dt:0;
        if(owner.navigationGoal&&Math.hypot(owner.navigationGoal.x-command.goal.x,owner.navigationGoal.z-command.goal.z)>this.march.tuning.arrivalM)owner.navigationGoal=null;
        if(owner.stalledS>=G.navigationStallS&&distance>G.navigationMinDistanceM&&this.ai.ctx?.nav?.Steer)owner.navigationGoal={...command.goal};
        if(distance<=G.navigationMinDistanceM)owner.navigationGoal=null;
        if(owner.navigationGoal)s.goal.set(command.goal.x,0,command.goal.z);
        if(owner.recoveryGoal&&(Math.hypot(owner.recoveryGoal.x-s.position.x,owner.recoveryGoal.z-s.position.z)<this.march.tuning.arrivalM||this.march.time>owner.recoveryUntil
          ||Math.hypot(owner.recoverySource.x-command.goal.x,owner.recoverySource.z-command.goal.z)>this.march.tuning.arrivalM)){
          const dx=command.goal.x-s.position.x,dz=command.goal.z-s.position.z,d=Math.hypot(dx,dz)||1;
          const direct=this.ProbeDirection(s,dx/d,dz/d);
          const sourceChanged=Math.hypot(owner.recoverySource.x-command.goal.x,owner.recoverySource.z-command.goal.z)>this.march.tuning.arrivalM;
          if(sourceChanged||direct&&(direct.x*dx+direct.z*dz)/d>G.localRecoveryMinFraction){
            owner.recoveryGoal=null;owner.recoveryHeading=null;owner.navigationGoal=null;owner.stalledS=0;
          }else{
            owner.recoveryGoal=this.RecoveryGoal(s,command.goal,owner.recoveryHeading);
            owner.recoveryUntil=this.march.time+G.localRecoveryTimeoutS;
          }
        }
        if(!owner.recoveryGoal&&owner.stalledS>=G.localRecoveryStallS&&this.march.time>=(owner.recoveryRetryAt??0)&&s.body?.ProbeMove){
          owner.recoveryRetryAt=this.march.time+G.localRecoveryRetryS;
          owner.recoveryGoal=this.RecoveryGoal(s,command.goal,owner.recoveryHeading);
          owner.recoverySource={...command.goal};
          owner.recoveryUntil=this.march.time+G.localRecoveryTimeoutS;
        }
        if(owner.recoveryGoal&&command.speedMps>0){
          const dx=owner.recoveryGoal.x-s.position.x,dz=owner.recoveryGoal.z-s.position.z,d=Math.hypot(dx,dz)||1;
          owner.recoveryHeading={x:dx/d,z:dz/d};s.goal.set(owner.recoveryGoal.x,0,owner.recoveryGoal.z);
        }
      }
      else{
        // p012Guided is the existing shared route-following switch despite its legacy name.
        const values={p012Guided:true,scriptDefensive:false,scriptMoveSpeedMps:command.speedMps,
          scriptArrivalRadius:command.arrivalM??this.march.tuning.arrivalM*.5,manualGoalUntil:this.ai.time+1,order:'advance',holdZone:null};
        for(const [key,value] of Object.entries(values)){
          if(!owner.prior.has(key))owner.prior.set(key,{had:Object.hasOwn(s,key),value:s[key]});
          s[key]=value;owner.applied.set(key,value);
        }
        s.goal.set(command.goal.x,0,command.goal.z);owner.appliedGoal=s.goal.clone();
      }
    }
    return outputs;
  }
  CanPause(s){
    const nav=this.ai.ctx?.nav,ground=this.ai.ctx?.battlefield?.GroundHeight;
    if(!nav)return false; // no navigation evidence: keep moving, don't invent a safe rest point.
    const p=s.position,r=this.march.tuning.separationM;
    if(!nav.Walkable(p.x,p.z))return false;
    for(const [dx,dz] of [[r,0],[-r,0],[0,r],[0,-r]]){
      if(!nav.Walkable(p.x+dx,p.z+dz))return false;
      if(ground&&Math.abs(ground.call(this.ai.ctx.battlefield,p.x+dx,p.z+dz)-p.y)>G.groundDeltaM)return false;
    }
    return true;
  }
  ProbeDirection(s,nx,nz){
    const ground=this.ai.ctx?.battlefield?.GroundHeight,field=this.ai.ctx?.battlefield;
    if(!ground)return null;
    const swept=s.body.ProbeMove(nx*G.localRecoveryProbeM,-.01,nz*G.localRecoveryProbeM);
    const travel=Math.hypot(swept.x,swept.z);
    if(travel<G.localRecoveryProbeM*G.localRecoveryMinFraction)return null;
    const x=s.position.x+swept.x,z=s.position.z+swept.z;
    if(Math.abs(ground.call(field,x,z)-s.position.y)>Math.max(G.groundDeltaM,travel*G.localRecoveryMaxGrade))return null;
    return {x:swept.x/travel,z:swept.z/travel};
  }
  RecoveryGoal(s,target,heading){
    const dx=target.x-s.position.x,dz=target.z-s.position.z,distance=Math.hypot(dx,dz)||1;
    let best=null,score=-Infinity;
    for(let i=0;i<G.localRecoveryAngles;i++){
      const angle=i*Math.PI*2/G.localRecoveryAngles;
      const direction=this.ProbeDirection(s,Math.cos(angle),Math.sin(angle));if(!direction)continue;
      const nx=direction.x,nz=direction.z;
      const candidate=(nx*dx+nz*dz)/distance+(heading?(nx*heading.x+nz*heading.z)*G.localRecoveryPersistence:0);
      if(candidate>score){score=candidate;best={x:s.position.x+nx*G.localRecoveryGoalM,z:s.position.z+nz*G.localRecoveryGoalM};}
    }
    return best;
  }
  CanMoveTo(s,point){
    const nav=this.ai.ctx?.nav,field=this.ai.ctx?.battlefield;
    if(!nav)return false;
    for(let i=1;i<=5;i++){
      const x=s.position.x+(point.x-s.position.x)*i/5,z=s.position.z+(point.z-s.position.z)*i/5;
      if(!nav.Walkable(x,z)||field?.GroundHeight&&Math.abs(field.GroundHeight(x,z)-s.position.y)>G.groundDeltaM)return false;
    }
    return true;
  }
  Release(s){
    const prior=this.owned.get(s);if(!prior)return;
    if(s.squadMarchCommand===prior.command)delete s.squadMarchCommand;
    if(this.Move){this.owned.delete(s);return;} // custom movement host owns its own flags
    // Return only fields still carrying our last command; preserve a newer host/tactical order.
    for(const [key,value] of prior.applied){
      if(s[key]!==value)continue;
      const saved=prior.prior.get(key);if(saved.had)s[key]=saved.value;else delete s[key];
    }
    if(prior.goal&&s.goal.equals(prior.appliedGoal))s.goal.copy(prior.goal);
    this.owned.delete(s);
  }
  Dispose(){for(const s of this.soldiers)this.Release(s);}
}
