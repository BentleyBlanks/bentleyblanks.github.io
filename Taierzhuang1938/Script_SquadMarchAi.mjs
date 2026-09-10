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
      speedMps:(s.moveSpeed||0)*3.6,
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
      if(this.Move){this.Move(s,command.goal,command.speedMps);if(command.arrivalM)s.scriptArrivalRadius=Math.min(s.scriptArrivalRadius??Infinity,command.arrivalM);}
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
