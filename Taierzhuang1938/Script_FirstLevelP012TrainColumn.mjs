// Finite, physical P012 disembark/issue queue. Initialize is called once only.
// Host Move must use real locomotion, guided arrival <=.1m and groundAt.
// Extra recruits stay scripted noncombatants after issue; Release is originals only.
export class FirstLevelP012TrainColumn {
  constructor(host,config){this.host=host;this.config=config;this.entries=[];this.initialized=false;this.merges=new Map();}
  Initialize(){
    if(this.initialized)return;this.initialized=true;
    const originals=this.host.ExistingRecruits?.()||[];let extraIndex=0,originalIndex=0;
    for(const car of this.config.cars)for(const [slot,spawn] of car.seats.entries()){
      const original=car.carIndex===1&&slot<6;
      const actor=original?originals[originalIndex]:this.host.SpawnRecruit?.({x:spawn.x,z:spawn.z,carIndex:car.carIndex,slot,scriptedNoncombatant:true});
      if(!actor)throw new Error(`Missing train recruit ${car.carIndex}:${slot}`);
      const muster=original?this.config.originalMuster[originalIndex++]:this.config.extraMuster[extraIndex++];
      this.host.Initialize(actor,spawn);this.host.SetEquipment(actor,'empty');
      const steps=[{point:{x:-66,z:spawn.z},stage:'exit'},...car.exitRoute.slice(1).map(point=>({point,stage:'exit'})),
        {point:car.weaponPoint,stage:'weapon'},{point:car.ammoPoint,stage:'ammo'},
        ...car.onward.map(point=>({point,stage:'march'})),
        ...(!original?[...this.config.extraApproach,{x:-48,z:muster.z}].map(point=>({point,stage:'march'})):[]),
        {point:muster,stage:'muster'}];
      this.entries.push({actor,original,extra:!original,carIndex:car.carIndex,slot,stage:'waiting',steps,index:0,
        weaponIssued:false,ammoIssued:false,weaponIssueCount:0,ammoIssueCount:0,exitDone:false,released:false,retired:false,hold:0});
    }
  }
  Entries(){return this.entries.map(e=>({...e,actorId:e.actor.id,position:this.host.Position(e.actor),
    requestedTarget:e.requestedTarget||null,requestedSpeed:e.requestedSpeed??0,
    mergeOwners:[...this.merges].map(([point,owner])=>({point,actorId:owner.actor.id,carIndex:owner.carIndex,slot:owner.slot}))}));}
  Command(entry,point,speed){entry.requestedTarget={x:point.x,z:point.z};entry.requestedSpeed=speed;this.host.Move(entry.actor,point,speed);}
  Move(entry,point,dt){
    const p=this.host.Position(entry.actor),dx=point.x-p.x,dz=point.z-p.z,d=Math.hypot(dx,dz);
    if(d<1e-6){this.Command(entry,p,0);return;}
    const ux=dx/d,uz=dz/d;let travel=Math.min(d,this.config.speedMps*dt);
    for(const junction of this.config.mergePoints||[]){
      let owner=this.merges.get(junction);
      if(owner){const at=this.host.Position(owner.actor);if(owner.retired||owner.released||Math.hypot(at.x-junction.x,at.z-junction.z)>3.8)this.merges.delete(junction);}
      owner=this.merges.get(junction);
      const ax=junction.x-p.x,az=junction.z-p.z,along=ax*ux+az*uz,cross=ax*uz-az*ux,r=3.5;
      if(along+ r>0&&Math.abs(cross)<r){
        const entryDistance=Math.max(0,along-Math.sqrt(r*r-cross*cross));
        if(entryDistance<travel+.02){
          if(!owner){this.merges.set(junction,entry);owner=entry;}
          if(owner!==entry)travel=Math.min(travel,Math.max(0,entryDistance-.01));
        }
      }
    }
    const bodies=[...this.entries.filter(e=>e!==entry&&!e.retired&&e.actor.alive!==false).map(e=>this.host.Position(e.actor)),...(this.host.Obstacles?.()||[])];
    for(const q of bodies){if(!q)continue;const ax=q.x-p.x,az=q.z-p.z,along=ax*ux+az*uz,cross=ax*uz-az*ux,r=this.config.bodySpacingM;
      if(along>0&&Math.abs(cross)<r)travel=Math.min(travel,Math.max(0,along-Math.sqrt(r*r-cross*cross)-.01));}
    const distance=Math.min(8,d);
    this.Command(entry,{x:p.x+ux*distance,z:p.z+uz*distance},dt>0?travel/dt:0);
  }
  Update(dt,beat){
    this.Initialize();
    for(const entry of this.entries){
      if(entry.retired||entry.released)continue;
      const actor=entry.actor,p=this.host.Position(actor);if(!p||actor.alive===false)continue;
      if(entry.stage==='arrived'){
        this.Command(entry,p,0);
        if(entry.extra&&this.host.Visible?.(actor)===false&&this.host.Retire?.(actor)===true)entry.retired=true;
        continue;
      }
      if(!entry.exitDone){
        const first=this.entries.find(e=>e.carIndex===entry.carIndex&&!e.exitDone&&e.actor.alive!==false);
        if(first!==entry||this.host.DoorOpen?.(entry.carIndex)===false){this.Command(entry,p,0);continue;}
      }
      const step=entry.steps[entry.index];entry.stage=step.stage;
      const arrival=step.stage==='weapon'||step.stage==='ammo'?this.config.arrivalRadiusM:(this.config.routeArrivalRadiusM??this.config.arrivalRadiusM);
      if(Math.hypot(p.x-step.point.x,p.z-step.point.z)>arrival){this.Move(entry,step.point,dt);continue;}
      if(step.stage==='weapon'||step.stage==='ammo'){
        this.Command(entry,p,0);entry.hold+=dt;
        if(entry.hold<(step.stage==='weapon'?this.config.weaponSeconds:this.config.ammoSeconds))continue;
        this.host.SetEquipment(actor,step.stage);entry[`${step.stage}Issued`]=true;entry[`${step.stage}IssueCount`]++;entry.hold=0;
      }
      entry.index++;
      if(step.stage==='exit'&&entry.steps[entry.index]?.stage!=='exit')entry.exitDone=true;
      if(entry.index===entry.steps.length){
        entry.stage='arrived';this.Command(entry,p,0);
        if(entry.original){entry.released=true;this.host.Release?.(actor);}
      }
    }
  }
}
