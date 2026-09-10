import { OPENING as C } from "./Data_FirstLevelOpening.mjs";
import { MISSION_TUNING as R } from "./Data_Tuning_FirstLevel.mjs";
const Distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const Smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t)};

// Coordinates, roster and timing live in data. Existing AI owns movement,
// aiming, suppression, ammunition and damage throughout the opening.
export class FirstLevelOpening {
  constructor(runtime){this.r=runtime;this.peakPlayerShooters=0;this.fireSeen=new Map();this.fireEvents=[];this.shotCount=0;this.playerShotCount=0;this.peakVisible=0;
    this.pack={id:"ShunziPack",contents:["CivilianClothes"],carried:true};}
  Derail(){
    const r=this.r;
    if(this.derailAt!=null)return;
    this.derailAt=r.time;
    this.passengers=r.train.entries.filter(e=>e.carIndex===C.derailCar).map(e=>({e,from:{...e.actor.position}}));
    r.Record("trainNearShellImpact");
    r.player.stance="prone";
  }
  Enter(stage){
    const r=this.r;
    if(stage==="TrenchEntry")r.Guide(C.approachRoute);
    if(stage==="Shelter"){
      for(const [i,a] of r.squad.entries()){
        const route=r.squadRoutes.get(a.id)||[];
        r.squadRoutes.set(a.id,[...route,C.shelterPosts[i]]);
      }
      this.wounded=this.SpawnMessenger("OpeningWounded",C.woundedRoute,"HanYang");
      if(this.wounded){this.wounded.actor.health=35;this.wounded.actor.scriptedNoncombatant=true;}
      this.runner=this.SpawnMessenger("OpeningRunner",C.runnerRoute,"HanYang");
    }
    if(stage==="Support"){
      r.rifleStartShots=r.Inventory().shots;
      this.zhou=r.ai.Spawn("nra",C.zhouGunSeat.x,C.zhouGunSeat.z,{weapon:"Zb26",squadId:"MissionZhouGun"});
      if(this.zhou){
        this.zhou.missionId=r.column.zhou.id;this.zhou.castId="zhou";
        r.PlaceActor(this.zhou,C.zhouGunSeat);
        r.Defend(this.zhou,C.zhouGunSeat,0,0);r.ai.SetStance(this.zhou,0,Infinity,true);
        r.emplacement.NpcOccupy(r.gunId,this.zhou);
      }
    }
  }
  SpawnMessenger(id,route,weapon){
    const r=this.r,actor=r.ai.Spawn("nra",route[0].x,route[0].z,{weapon,scriptedNoncombatant:true,squadId:id});
    if(!actor)return null;
    actor.missionId=id;r.MoveActor(actor,actor.position,0);return {actor,route,index:1};
  }
  Messenger(entry,speed){
    if(!entry?.actor.alive)return;
    const r=this.r,{actor,route}=entry;
    while(entry.index<route.length&&Distance(actor.position,route[entry.index])<.6)entry.index++;
    r.MoveActor(actor,route[entry.index]||actor.position,entry.index<route.length?speed:0);
    if(entry.index===route.length)r.ai.SetStance(actor,1,1,true);
  }
  Update(dt){
    const r=this.r,stage=r.flow.stage.id;
    if(this.derailAt!=null&&!r.Has("trainDerailed")){
      const elapsed=r.time-this.derailAt,t=Smooth(elapsed/C.derailSeconds);
      r.battlefield.SetCarDerailment(C.derailCar,C.derailRollRad*t,C.derailPivot);
      // The forward carriage tips away from the remaining two. Its eight men
      // spill through its open east side; no new crowd or per-frame spawning.
      for(const {e,from} of this.passengers){
        const a=e.actor;
        if(!a.alive)continue;
        const target={x:-70.5+(e.slot%2)*1.1,z:from.z};
        a.missionTrainLife.weight=0;a.missionTrainLife.animationEnabled=false;
        const x=from.x+(target.x-from.x)*t,z=from.z;
        const y=from.y+(r.battlefield.GroundHeight(target.x,z)-from.y)*t+Math.sin(t*Math.PI)*.35;
        a.position.set(x,y,z);a.body?.Teleport(x,y,z);a.actor?.root.position.copy(a.position);
        r.ai.SetStance(a,2,.2,true);
        if(t===1){
          e.exited=true;e.arrived=true;e.index=e.steps.length;e.animation=null;e.rise=2;
          a.missionUnloaded=true;a.missionTrainReady=true;
          r.MoveActor(a,a.position,0);r.ai.SetStance(a,2,Infinity,true);
        }
      }
      if(t===1)r.Record("trainDerailed",{car:C.derailCar,roll:C.derailRollRad});
    }
    if(r.Has("trainStopped")&&!r.spawned.has("surface")){
      r.SpawnEncounter("surface");r.SpawnEncounter("intrusion");
    }
    if(r.Has("luoRescueRequested")&&!r.Has("luoRescueComplete")){
      const luo=r.companion.Handle("luo");
      if(luo?.alive){
        if(this.rescueAt==null){
          const point={x:r.player.position.x+1,z:r.player.position.z};
          r.MoveActor(luo,point,R.squadSpeedMps);
          if(Distance(luo.position,r.player.position)<C.rescueReachM){
            this.rescueAt=r.time;r.BeginControl("rescue",C.rescueSeconds);
          }
        }else{
          r.MoveActor(luo,luo.position,0);r.ai.SetStance(luo,1,.2,true);
          luo.missionRescueTarget=r.Point(r.player.position,.85);
        }
      }else{
        // If ordinary combat killed the guide, the player gets up unaided.
        r.Record("luoRescueComplete",{guideLost:true});
      }
    }
    if(stage==="TrenchEntry"){
      if(r.Near(C.trenchEntry,5))r.Record("trenchEntered");
      const intruders=C.intruders.map(s=>r.enemies.get(s.id));
      if(intruders.every(a=>a&&!a.alive))r.Record("trenchCleared",{count:intruders.length});
      if(r.Has("trenchCleared")&&r.Near(C.shelter,C.shelterRadiusM)&&this.ShelterProtected())r.Record("shelterReached",{health:r.player.health});
    }
    if(stage==="Shelter"){
      const yaowa=r.companion.Handle("yaowa"),luo=r.companion.Handle("luo");
      if(r.Near(C.shelter,C.shelterRadiusM)&&yaowa?.alive&&Distance(yaowa.position,r.player.position)<5&&
        luo?.alive&&Distance(luo.position,C.shelter)<12&&!r.BlocksSight(r.player.EyePosition,r.Point(yaowa.position,1)))r.Say("EscapeWhisper");
      this.Messenger(this.wounded,R.walkSpeedMps);
      // The physical casualty appears before the runner reaches the exchange.
      if(this.wounded&&Distance(r.player.position,this.wounded.actor.position)<C.shelterWitnessM&&
        !r.BlocksSight(r.player.EyePosition,r.Point(this.wounded.actor.position,1)))r.Record("woundedSeen");
      if(r.Has("woundedSeen"))this.Messenger(this.runner,R.squadSpeedMps);
      if(r.Has("escapeWhisperHeard")&&r.Has("woundedSeen")&&this.runner&&
        Distance(this.runner.actor.position,C.shelter)<5)r.Say("SupportOrder");
    }
    this.FireWindows();
    this.UpdateZhou();
  }
  UpdateZhou(){
    const r=this.r,a=this.zhou;
    if(!a||r.Has("zhouGunWounded"))return;
    if(!a.alive){
      r.Record("zhouGunKilled",{actorId:a.id});r.OnPlayerDown();r.MissionFailure?.("zhou");return;
    }
    if(a.lastFire>0)r.Record("zhouCoverFired");
    if(a.health>=95&&(!r.Has("frontRifleDefense")||!r.Has("rifleWithdrawalResolved")))return;
    if(!this.zhouShellSent&&a.health>=95){
      this.zhouShellSent=true;
      const spec=C.zhouShell,target=r.Point({x:a.position.x+spec.offsetX,z:a.position.z},.65);
      r.combat.FireShell(r.Point(spec.from,spec.height),target,{...spec,kind:"Shell75",
        OnImpact:()=>r.Record("zhouGunBlast",{x:target.x,z:target.z})});
    }
    if(a.health>=95)return;
    r.emplacement.NpcVacate(r.gunId,"wounded");
    a.scriptedNoncombatant=true;r.ai.SetStance(a,1,.3,true);
    if(a.alive&&Distance(a.position,C.zhouRest)>.65){r.MoveActor(a,C.zhouRest,R.walkSpeedMps);return;}
    // The same narrative casualty continues on the existing litter. Switch
    // representation only at his observed position after the real hit and move.
    Object.assign(r.column.zhou,{x:a.position.x,z:a.position.z,health:Math.max(0,a.health),visible:true,state:"waiting",yaw:a.yaw});
    r.Record("zhouGunWounded",{actorId:a.id,health:a.health,alive:a.alive,fired:a.lastFire>0});
    r.ai.Remove(a);
  }
  ShelterProtected(){
    const r=this.r;
    return C.surface.every(spec=>{
      const a=r.enemies.get(spec.id);
      return !!a&&(!a.alive||r.BlocksSight(r.Point(a.position,1.3),r.player.EyePosition));
    });
  }
  FireWindows(){
    const r=this.r,active=["Unloading","TrenchEntry","Shelter","Support","MachineGun"].includes(r.flow.stage.id);
    const candidates=[];
    let visible=0;
    for(const a of r.enemies.values()){
      if(a.lastFire>0&&a.lastFire!==this.fireSeen.get(a.id)){
        this.fireSeen.set(a.id,a.lastFire);
        this.fireEvents.push({at:r.time,id:a.missionId,encounter:a.missionEncounter,player:!!a.target?.isPlayer});
        this.shotCount++;if(a.target?.isPlayer)this.playerShotCount++;
        if(this.fireEvents.length>256)this.fireEvents.shift();
      }
      a.missionFireHold=false;
      a.missionSurfaceRest=false;
      if(!active||!a.alive||a.scriptedNoncombatant)continue;
      // Visible MG bursts alternate with real reload/reacquisition windows.
      // The field still shoots at friendly combatants during player fire slots.
      const surface=a.missionEncounter==="surface";
      const rest=surface&&(r.time%(C.surfaceBurstSeconds+C.surfaceRestSeconds)>=C.surfaceBurstSeconds);
      a.missionFireHold=true;
      a.missionSurfaceRest=rest;
      const projected=a.position.clone();projected.y+=1;projected.project(r.player.camera);
      if(Math.abs(projected.x)<=1&&Math.abs(projected.y)<=1&&projected.z>=-1&&projected.z<=1&&
        !r.BlocksSight(r.player.EyePosition,r.Point(a.position,1)))visible++;
      if(!rest && Distance(a.position,r.player.position)<90 && !r.BlocksSight(r.Point(a.position,a.stance===2?.35:a.stance===1?.85:1.3),r.player.EyePosition))candidates.push(a);
    }
    const shift=Math.floor(r.time/C.fireSlotSeconds);
    candidates.sort((a,b)=>a.id-b.id);
    if(candidates.length)candidates.push(...candidates.splice(0,shift%candidates.length));
    for(const a of candidates.slice(0,C.playerFireLimit))a.missionFireHold=false;
    this.playerShooters=candidates.slice(0,C.playerFireLimit).map(a=>a.missionId);
    this.peakPlayerShooters=Math.max(this.peakPlayerShooters,this.playerShooters.length);
    this.visible=visible;this.peakVisible=Math.max(this.peakVisible,visible);
  }
  State(){return {derailAt:this.derailAt,roll:this.r.battlefield.derailRoll||0,
    pack:this.pack,
    playerShooters:this.playerShooters||[],peakPlayerShooters:this.peakPlayerShooters,
    visible:this.visible||0,peakVisible:this.peakVisible,shots:this.shotCount,playerShots:this.playerShotCount,
    shelterProtected:this.ShelterProtected(),
    recentFire:this.fireEvents.slice(-12),
    zhou:this.zhou?{position:{...this.zhou.position},health:this.zhou.health,lastFire:this.zhou.lastFire}:null,
    wounded:this.wounded?{position:{...this.wounded.actor.position},alive:this.wounded.actor.alive,index:this.wounded.index}:null,
    runner:this.runner?{position:{...this.runner.actor.position},alive:this.runner.actor.alive,index:this.runner.index}:null};}
}
