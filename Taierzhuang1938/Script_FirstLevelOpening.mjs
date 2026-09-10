import { MISSION_TRAIN } from "./Data_FirstLevelMissionTrain.mjs";
import { OPENING as C } from "./Data_FirstLevelOpening.mjs";
import { MISSION_TUNING as R } from "./Data_Tuning_FirstLevel.mjs";
import { CLOSE_RANGE } from "./Data_Tuning_AiShooting.mjs";
const Distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const Smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t)};
const Curve=(rows,t)=>{
  const next=rows.findIndex(([at])=>at>t);
  if(next<0)return rows.at(-1)[1];if(next===0)return rows[0][1];
  const [a,x]=rows[next-1],[b,y]=rows[next];return x+(y-x)*Smooth((t-a)/(b-a));
};

// Coordinates, roster and timing live in data. Existing AI owns movement,
// aiming, suppression, ammunition and damage throughout the opening.
export class FirstLevelOpening {
  constructor(runtime){this.r=runtime;this.peakPlayerShooters=0;this.fireSeen=new Map();this.fireEvents=[];this.shotCount=0;this.playerShotCount=0;this.peakVisible=0;
    this.pack={id:"ShunziPack",contents:["CivilianClothes"],carried:true};}
  Derail(){
    const r=this.r;
    if(this.derailAt!=null)return;
    this.derailAt=r.time;
    this.passengers=r.train.entries.filter(e=>e.carIndex===C.derailCar).map(e=>({e,from:{...e.actor.position},localZ:e.actor.position.z-r.battlefield.trainOffsetM}));
    this.playerFrom={...r.player.position};this.playerFrom.z-=r.battlefield.trainOffsetM;
    this.eyeFrom={...r.player.camera.position};this.eyeFrom.z-=r.battlefield.trainOffsetM;
    this.lookFrom={yaw:r.player.yaw,pitch:r.player.pitch};
    r.battlefield.OpenGate(`TrainDoor${C.derailCar}`);
    r.Record("trainNearShellImpact");
    r.BeginControl("derail",Infinity);
    r.player.stance="prone";
    r.audio.Deafen?.(1.1);
  }
  PlacePlayer(){
    const r=this.r;
    if(this.derailAt==null||r.Has("luoRescueComplete"))return;
    const elapsed=r.time-this.derailAt,t=Smooth(elapsed/C.derailSeconds);
    const offset=r.battlefield.trainOffsetM,fall=C.playerFall;
    const rescue=this.rescueAt==null?0:Smooth((r.time-this.rescueAt)/C.rescueSeconds);
    const x=this.playerFrom.x+(fall.x-this.playerFrom.x)*t+(C.rescueEnd.x-fall.x)*rescue;
    const z=this.playerFrom.z+(fall.z-this.playerFrom.z)*t+(C.rescueEnd.z-fall.z)*rescue+offset;
    const y=this.playerFrom.y+(r.battlefield.GroundHeight(x,z)-this.playerFrom.y)*t;
    r.player.position.set(x,y,z);r.player.body?.Teleport(x,y,z);r.player.velocity.set(0,0,0);
  }
  ApplyCamera(){
    const r=this.r,cam=r.player.camera;
    this.blackout=0;
    if(this.derailAt==null)return;
    const elapsed=r.time-this.derailAt;
    this.eyeClosure=Curve(C.blinks,elapsed);
    const active=!r.Has("luoRescueComplete"),rescue=this.rescueAt==null?0:Smooth((r.time-this.rescueAt)/C.rescueSeconds);
    if(active){
      this.PlacePlayer();
      const t=Smooth(elapsed/C.derailSeconds),angle=C.derailRollRad*t,c=Math.cos(angle),s=Math.sin(angle);
      const dx=this.eyeFrom.x-C.derailPivot.x,dy=this.eyeFrom.y-C.derailPivot.y;
      const fall=Smooth((elapsed-C.derailSeconds*.45)/(C.derailSeconds*.65));
      const rolledX=C.derailPivot.x+c*dx-s*dy,rolledY=C.derailPivot.y+s*dx+c*dy;
      const eye=C.playerFall.eyeM+(1.5-C.playerFall.eyeM)*rescue;
      cam.position.set(rolledX+(r.player.position.x-rolledX)*fall,
        rolledY+(r.player.position.y+eye-rolledY)*fall,r.player.position.z);
      cam.rotation.set(this.lookFrom.pitch*(1-t)+.08*t,this.lookFrom.yaw,angle*(1-rescue),"YXZ");
      if(elapsed>C.blackout.start+C.blackout.close+C.blackout.hold){
        const luo=r.companion.Handle("luo");
        if(luo){
          const yaw=Math.atan2(cam.position.x-luo.position.x,cam.position.z-luo.position.z);
          const turn=Math.atan2(Math.sin(yaw-cam.rotation.y),Math.cos(yaw-cam.rotation.y));
          const focus=Smooth((elapsed-C.blackout.start-C.blackout.close-C.blackout.hold)/C.blackout.open);
          cam.rotation.y+=turn*focus;
          cam.rotation.x+=Math.atan2(luo.position.y+1.05-cam.position.y,Math.hypot(luo.position.x-cam.position.x,luo.position.z-cam.position.z))*focus;
          r.player.yaw=cam.rotation.y;r.player.pitch=cam.rotation.x;
          if(r.controls){r.controls.yaw=cam.rotation.y;r.controls.pitch=cam.rotation.x;}
        }
      }
      const b=C.blackout,close=Smooth((elapsed-b.start)/b.close),open=Smooth((elapsed-b.start-b.close-b.hold)/b.open);
      this.blackout=close*(1-open);
      cam.rotation.x+=Math.sin(elapsed*8)*.035*t*(1-rescue);
      cam.rotation.z+=Math.sin(elapsed*5)*.05*t*(1-rescue);
    }else if(this.rescueAt!=null){
      const after=r.time-this.rescueAt-C.rescueSeconds,k=Math.max(0,1-after/C.dizzySeconds);
      cam.rotation.z+=Math.sin(after*3.5)*.035*k;
      cam.rotation.x+=Math.sin(after*4.5)*.018*k;
    }
    cam.updateMatrixWorld(true);
    if(active&&this.rescueAt!=null){
      const hand=r.companion.Handle("luo")?.missionRescueTarget;
      const age=r.time-this.rescueAt,weight=Smooth(age/.45)*(1-Smooth((age-C.rescueSeconds+.5)/.5));
      if(hand)r.viewmodel?.ReachWorld(hand,weight);
    }
  }

  Enter(stage){
    const r=this.r;
    if(stage==="TrenchEntry"){
      r.Guide(C.approachRoute);
      for(const [i,a] of r.squad.entries()){
        const route=r.squadRoutes.get(a.id)||[],entry=route.findIndex(p=>Distance(p,C.trenchEntry)<.1);
        r.squadRoutes.set(a.id,[...route.slice(0,entry+1),C.trenchCoverPosts[i]]);
      }
    }
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
      this.SpawnZhou();
    }
  }
  SpawnZhou(){
    const r=this.r;
    if(this.zhou)return;
    this.zhou=r.ai.Spawn("nra",C.zhouGunSeat.x,C.zhouGunSeat.z,{weapon:"Zb26",squadId:"MissionZhouGun"});
    if(!this.zhou)return; // A temporarily unavailable physical spawn retries next frame.
    this.zhou.missionId=r.column.zhou.id;this.zhou.castId="zhou";
    r.PlaceActor(this.zhou,C.zhouGunSeat);
    r.Defend(this.zhou,C.zhouGunSeat,0,0);r.ai.SetStance(this.zhou,0,Infinity,true);
    r.emplacement.NpcOccupy(r.gunId,this.zhou);
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
    if(this.derailAt!=null){
      const age=r.time-this.derailAt;
      const hearing=Curve(C.hearing,age);
      if(hearing!==this.hearingAmount)r.audio.SetConcussion?.(hearing,C.hearingLowHz);
      this.hearingAmount=hearing;
      const b=C.breath;
      if(age>=b.start&&age<b.end&&(this.nextBreathAt==null||age>=this.nextBreathAt)){
        this.breathVoice=r.audio.Play("breathHeavy",{volume:b.volume*(1-.45*Smooth((age-b.start)/(b.end-b.start))),priority:true});
        this.nextBreathAt=age+b.interval;
      }
    }
    if(["Train","Unloading","TrenchEntry","Shelter","Support","MachineGun"].includes(stage)&&!r.Has("gunOccupied")){
      const lost=r.squad.find(a=>!a.alive);
      if(lost){r.Record("openingSquadLost",{castId:lost.castId});r.OnPlayerDown();r.MissionFailure?.(lost.castId);return;}
    }
    if(stage==="Support")this.SpawnZhou();
    if(this.derailAt!=null&&!r.Has("trainDerailed")){
      const elapsed=r.time-this.derailAt,t=Smooth(elapsed/C.derailSeconds);
      r.battlefield.SetCarDerailment(C.derailCar,C.derailRollRad*t,C.derailPivot);
      // The same main carriage carries the player and original passengers.
      // All evacuation paths start at that moving wreck, never in a new crowd.
      for(const {e,from,localZ} of this.passengers){
        const a=e.actor;if(!a.alive)continue;
        const guide=a.castId==="luo",row=Math.floor(e.slot/2)-(MISSION_TRAIN.cars[C.derailCar].seats.length/2-1)/2;
        const target=guide?C.rescueGuide:{x:-69.2-(e.slot%2)*1.1,z:MISSION_TRAIN.cars[C.derailCar].z+Math.sign(row)*(Math.abs(row)*1.2+1.5)};
        a.missionTrainLife.weight=0;a.missionTrainLife.animationEnabled=false;a.missionTrainImpact=true;
        const x=from.x+(target.x-from.x)*t,z=localZ+(target.z-localZ)*t+r.battlefield.trainOffsetM;
        const y=from.y+(r.battlefield.GroundHeight(target.x,z)-from.y)*t+Math.sin(t*Math.PI)*.35;
        a.position.set(x,y,z);a.body?.Teleport(x,y,z);a.actor?.root.position.copy(a.position);
        r.ai.SetStance(a,1,.2,true);
        if(t===1){
          const retreat=C.spillRetreat;
          // Paired passengers clear laterally into separate posts. Sending each
          // pair south through the next pair creates a physical queue deadlock.
          e.steps=[{x:retreat.postX+(1-e.slot%2)*retreat.columnM,z:target.z}];
          e.exited=true;e.index=0;e.animation=null;e.rise=2;
          // Squad movement is released with the rescue, after the train stops.
          r.MoveActor(a,a.position,0);
        }
      }
      if(t===1)r.Record("trainDerailed",{car:C.derailCar,roll:C.derailRollRad,playerCar:MISSION_TRAIN.mainCar});
    }
    if(r.Has("trainStopped")&&!r.spawned.has("surface")){
      r.SpawnEncounter("surface");r.SpawnEncounter("intrusion");
    }
    if(r.Has("luoRescueRequested")&&r.Has("trainDerailed")&&!r.Has("luoRescueComplete")){
      const luo=r.companion.Handle("luo");
      if(luo?.alive){
        if(this.rescueAt==null&&Distance(luo.position,r.player.position)>C.rescueReachM){r.MoveActor(luo,C.rescueGuide,R.walkSpeedMps);return;}
        if(this.rescueAt==null){
          this.rescueAt=r.time;r.BeginControl("rescue",C.rescueSeconds);
          r.Record("playerDraggedFromWreck",{from:{...r.player.position},to:C.rescueEnd});
        }
        const t=Smooth((r.time-this.rescueAt)/C.rescueSeconds);
        const point={x:C.rescueGuide.x+(C.rescueEnd.x+.9-C.rescueGuide.x)*t,z:C.rescueGuide.z};
        r.MoveActor(luo,point,R.walkSpeedMps);r.ai.SetStance(luo,t<.7?1:0,.2,true);
        luo.yaw=Math.atan2(luo.position.x-r.player.position.x,luo.position.z-r.player.position.z);
        luo.missionRescueTarget=r.Point({x:r.player.position.x+.45,z:r.player.position.z},.95);
      }
    }
    if(stage==="TrenchEntry"){
      if(r.Near(C.trenchEntry,5))r.Record("trenchEntered");
      const intruders=C.intruders.map(s=>r.enemies.get(s.id));
      if(intruders.every(a=>a&&!a.alive))r.Record("trenchCleared",{count:intruders.length});
      if(r.Has("trenchCleared")&&!this.trenchReleased){this.trenchReleased=true;r.Guide(C.approachRoute);}
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
    if(a.health>=C.zhouWoundThreshold&&(!r.Has("frontRifleDefense")||!r.Has("rifleWithdrawalResolved")))return;
    if(!this.zhouShellSent&&a.health>=C.zhouWoundThreshold){
      this.zhouShellSent=true;
      const spec=C.zhouShell,target=r.Point({x:a.position.x+spec.offsetX,z:a.position.z},.65);
      r.combat.FireShell(r.Point(spec.from,spec.height),target,{...spec,kind:"Shell75",
        OnImpact:()=>r.Record("zhouGunBlast",{x:target.x,z:target.z})});
    }
    if(a.health>=C.zhouWoundThreshold)return;
    r.emplacement.NpcVacate(r.gunId,"wounded");
    a.scriptedNoncombatant=true;r.ai.SetStance(a,1,.3,true);
    if(Distance(a.position,C.zhouRest)>C.zhouExitRadiusM){r.MoveActor(a,C.zhouRest,R.walkSpeedMps);return;}
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
  Dispose(){
    this.r.audio.SetConcussion?.(0);
    if(this.breathVoice)this.r.audio.StopVoice?.(this.breathVoice,.15);
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
    // Keep the rotating distant fire windows, but give immediate threats first
    // refusal. Rest/reload windows and the authored shooter cap still apply.
    candidates.sort((a,b)=>{
      const da=Distance(a.position,r.player.position),db=Distance(b.position,r.player.position);
      return (da<=CLOSE_RANGE.priorityM?da:Infinity)-(db<=CLOSE_RANGE.priorityM?db:Infinity)||0;
    });
    for(const a of candidates.slice(0,C.playerFireLimit))a.missionFireHold=false;
    this.playerShooters=candidates.slice(0,C.playerFireLimit).map(a=>a.missionId);
    this.peakPlayerShooters=Math.max(this.peakPlayerShooters,this.playerShooters.length);
    this.visible=visible;this.peakVisible=Math.max(this.peakVisible,visible);
  }
  State(){return {derailAt:this.derailAt,roll:this.r.battlefield.derailRoll||0,
    blackout:this.eyeClosure>=.99?1:0,eyeClosure:this.eyeClosure||0,hearingAmount:this.hearingAmount||0,rescueAt:this.rescueAt,playerCar:MISSION_TRAIN.mainCar,
    pack:this.pack,
    playerShooters:this.playerShooters||[],peakPlayerShooters:this.peakPlayerShooters,
    visible:this.visible||0,peakVisible:this.peakVisible,shots:this.shotCount,playerShots:this.playerShotCount,
    shelterProtected:this.ShelterProtected(),
    recentFire:this.fireEvents.slice(-12),
    zhou:this.zhou?{position:{...this.zhou.position},health:this.zhou.health,lastFire:this.zhou.lastFire}:null,
    wounded:this.wounded?{position:{...this.wounded.actor.position},alive:this.wounded.actor.alive,index:this.wounded.index}:null,
    runner:this.runner?{position:{...this.runner.actor.position},alive:this.runner.actor.alive,index:this.runner.index}:null};}
}
