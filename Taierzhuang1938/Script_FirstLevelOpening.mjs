import { MISSION_TRAIN } from "./Data_FirstLevelMissionTrain.mjs";
import { OPENING as C } from "./Data_FirstLevelOpening.mjs";
import { MISSION_TUNING as R, OPENING_PERCEPTION as P } from "./Data_Tuning_FirstLevel.mjs";
import { CLOSE_RANGE } from "./Data_Tuning_AiShooting.mjs";
import { FirstLevelOpeningBarrage } from "./Script_FirstLevelOpeningBarrage.mjs";
const Distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const Smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t)};
const Curve=(rows,t)=>{
  const next=rows.findIndex(([at])=>at>t);
  if(next<0)return rows.at(-1)[1];if(next===0)return rows[0][1];
  const [a,x]=rows[next-1],[b,y]=rows[next];return x+(y-x)*Smooth((t-a)/(b-a));
};
// Keep the impact onset at its authored time; stretch only recovery after the peak.
export const OpeningRecoveryTime=(elapsed,onset)=>elapsed<=onset?elapsed:onset+(elapsed-onset)/R.openingRecoveryScale;

// A pure mission-clock sample: pause, re-render and different frame rates all
// produce the same recovery. No accumulated post-process animation time.
export function SampleOpeningPerception(elapsed){
  const age=OpeningRecoveryTime(elapsed,P.onsetS);
  return {
    eyeClosure:Curve(C.blinks,OpeningRecoveryTime(elapsed,C.blinks.find(([,value])=>value===1)[0])),
    amount:Curve(P.intensity,age),focus:Curve(P.focus,age),
    pitch:Curve(P.pitch,age),roll:Curve(P.roll,age),
  };
}

// Coordinates, roster and timing live in data. Existing AI owns movement,
// aiming, suppression, ammunition and damage throughout the opening.
export class FirstLevelOpening {
  constructor(runtime){this.r=runtime;this.peakPlayerShooters=0;this.fireSeen=new Map();this.fireEvents=[];this.shotCount=0;this.playerShotCount=0;this.peakVisible=0;
    this.pack={id:"ShunziPack",contents:["CivilianClothes"],carried:true};
    this.pressureShells=new Set();this.pressureImpacts=[];this.wreckSmoke=[];this.barrage=new FirstLevelOpeningBarrage(runtime);
    this.reducedMotion=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');}
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
    const rescue=this.RescueLift();
    const x=this.playerFrom.x+(fall.x-this.playerFrom.x)*t+(C.rescueEnd.x-fall.x)*rescue;
    const z=this.playerFrom.z+(fall.z-this.playerFrom.z)*t+(C.rescueEnd.z-fall.z)*rescue+offset;
    const y=this.playerFrom.y+(r.battlefield.GroundHeight(x,z)-this.playerFrom.y)*t;
    r.player.position.set(x,y,z);r.player.body?.Teleport(x,y,z);r.player.velocity.set(0,0,0);
  }
  RescueElapsed(){
    if(this.rescueAt==null)return 0;
    const voice=this.r.voice?.current;
    return voice?.cue.id==="TrainShelling"&&this.rescueSourceStart!=null
      ?Math.max(0,voice.sourceTime-this.rescueSourceStart):this.r.time-this.rescueAt;
  }
  RescueSampleTime(){
    return this.rescueBeats?Curve(this.rescueBeats,this.RescueElapsed()):this.RescueElapsed();
  }
  RescueLift(){
    // Keep the player on the floor until the visible hand has reached and
    // gripped; the physical lift follows the authored pull, not cue onset.
    return this.rescueAt==null?0:Smooth((this.RescueSampleTime()-C.rescuePullSeconds)/(C.rescueStandSeconds-C.rescuePullSeconds));
  }
  ApplyCamera(){
    const r=this.r,cam=r.player.camera;
    this.blackout=0;this.eyeClosure=0;this.concussion=null;
    if(this.derailAt==null)return;
    const elapsed=r.time-this.derailAt;
    const perception=SampleOpeningPerception(elapsed);
    this.eyeClosure=perception.eyeClosure;
    this.concussion=perception;
    const active=!r.Has("luoRescueComplete"),rescue=this.RescueLift();
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
    }
    const standingAge=this.rescueAt==null?0:Math.max(0,r.time-this.rescueAt-(this.rescueDuration||C.rescueSeconds));
    const settle=active?1:1-Smooth(standingAge/(C.dizzySeconds*R.openingRecoveryScale));
    if(!this.reducedMotion?.matches){
      cam.rotation.x+=perception.pitch*settle;
      cam.rotation.z+=perception.roll*settle;
    }
    cam.updateMatrixWorld(true);
    if(active&&this.rescueAt!=null){
      const luo=r.companion.Handle("luo"),bone=luo?.actor?.characterRig?.bones.handR;
      const hand=bone?bone.getWorldPosition(r.player.position.clone()):luo?.missionRescueTarget;
      const age=this.RescueSampleTime(),weight=Smooth(age/.45)*(1-Smooth((age-C.rescueSeconds+.5)/.5));
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
    r.Defend(this.zhou,C.zhouGunSeat,0,R.companionCoverSlackM);r.ai.SetStance(this.zhou,1,.5,true);
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
    this.barrage.Update();
    this.UpdateEscapePressure();
    if(this.derailAt!=null){
      const age=r.time-this.derailAt;
      const recoveryAge=OpeningRecoveryTime(age,C.hearing.find(([,value])=>value===1)[0]);
      const hearing=Curve(C.hearing,recoveryAge);
      if(hearing!==this.hearingAmount)r.audio.SetConcussion?.(hearing,C.hearingLowHz);
      this.hearingAmount=hearing;
      const b=C.breath;
      if(age>=b.start&&recoveryAge<b.end&&(this.nextBreathAt==null||age>=this.nextBreathAt)){
        this.breathVoice=r.audio.Play("breathHeavy",{volume:b.volume*(1-.45*Smooth((recoveryAge-b.start)/(b.end-b.start))),priority:true});
        this.nextBreathAt=age+b.interval;
      }
      if(recoveryAge>=b.end&&!r.Has("trenchEntered")&&["Unloading","TrenchEntry"].includes(stage)&&age>=this.nextBreathAt){
        this.breathVoice=r.audio.Play("breathHeavy",{volume:C.escapeBreath.volume,priority:true});
        this.nextBreathAt=age+C.escapeBreath.interval;
      }
    }
    if(["Train","Unloading","TrenchEntry","Shelter","Support","MachineGun"].includes(stage)&&!r.Has("gunOccupied")){
      const lost=r.squad.find(a=>!a.alive&&C.requiredSquadCast.includes(a.castId));
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
    // The flank infantry arrives after the artillery and the visible rescue.
    // Control returns before live small-arms combat; no damage/grace override.
    if(r.Has("trainStopped")&&r.Has("luoRescueComplete")&&!r.spawned.has("surface")){
      r.SpawnEncounter("surface");r.SpawnEncounter("intrusion");
    }
    // The squad leader is thrown down too. His own failed rise is shown in the
    // player's view before the voice and rescue are allowed to continue.
    if(r.Has("trainDerailed")&&!r.Has("luoRescueComplete")){
      const luo=r.companion.Handle("luo");
      if(luo?.alive&&this.rescueAt==null){
        const eyeClosure=SampleOpeningPerception(r.time-this.derailAt).eyeClosure;
        if(this.luoRecoveryAt==null&&eyeClosure<=C.luoRecoveryMaxEyeClosure){
          this.luoRecoveryAt=r.time;r.Record("trainLuoRecovering",{eyeClosure});
        }
        // Wait prone at the authored first frame. Starting the clip under the
        // stretched blackout would hide the failed attempt rather than delay it.
        const age=this.luoRecoveryAt==null?0:r.time-this.luoRecoveryAt;
        luo.missionCarriageAction={clipId:"LuoStaggerRecover",seconds:Math.min(age,C.luoRecoverySeconds),weight:1,loop:false,deckY:luo.position.y,transitionSeconds:0};
        r.MoveActor(luo,luo.position,0);
        luo.yaw=Math.atan2(luo.position.x-r.player.position.x,luo.position.z-r.player.position.z);
        r.ai.SetStance(luo,age<C.luoRecoverySeconds*.68?1:0,.2,true);
        if(this.luoRecoveryAt!=null&&age>=C.luoRecoverySeconds&&r.Has("trainStopped"))r.Record("trainLuoStanding");
      }
    }
    if(r.Has("luoRescueRequested")&&r.Has("trainLuoStanding")&&!r.Has("luoRescueComplete")){
      const luo=r.companion.Handle("luo");
      if(luo?.alive){
        if(this.rescueAt==null&&Distance(luo.position,r.player.position)>C.rescueReachM){r.MoveActor(luo,C.rescueGuide,R.walkSpeedMps);return;}
        if(this.rescueAt==null){
          this.rescueAt=r.time;
          const lines=r.voice?.current?.plan.lines,indices=C.rescueDialogueLines;
          if(lines?.[indices.steady]){
            this.rescueSourceStart=lines[indices.reach][0];
            const grip=lines[indices.grip][0]-this.rescueSourceStart,steady=lines[indices.steady][0]-this.rescueSourceStart;
            this.rescueDuration=lines[indices.steady][1]-this.rescueSourceStart;
            const events=r.voice.current.plan.segments.flatMap(segment=>segment.events||[]);
            const liftAt=events.find(event=>event.id==="TrainRescueLift")?.at;
            const lift=liftAt==null?grip+(steady-grip)*C.rescueGripFraction:liftAt-this.rescueSourceStart;
            this.rescueBeats=[[0,0],[grip,C.rescueGripSeconds],[lift,C.rescuePullSeconds],
              [steady,C.rescueStandSeconds],[this.rescueDuration,C.rescueSeconds]];
          }else this.rescueDuration=C.rescueSeconds;
          r.BeginControl("rescue",this.rescueDuration);
          r.Record("playerDraggedFromWreck",{from:{...r.player.position},to:C.rescueEnd});
        }
        const age=this.RescueSampleTime(),t=this.RescueLift();
        luo.missionCarriageAction={clipId:"LuoHelpUp",seconds:Math.min(age,C.rescueSeconds),weight:1,loop:false,deckY:luo.position.y};
        // Brace beside the player's corridor for the whole authored help-up.
        // An AI pursuit target can lag behind the source-timed player pull and
        // put the camera inside Luo's chest, even with separated end targets.
        r.MoveActor(luo,luo.position,0);r.ai.SetStance(luo,t<.7?1:0,.2,true);
        luo.yaw=Math.atan2(luo.position.x-r.player.position.x,luo.position.z-r.player.position.z);
        luo.missionRescueTarget=r.Point({x:r.player.position.x+.45,z:r.player.position.z},.95);
      }
    }
    if(stage==="TrenchEntry"){
      if(r.Near(C.trenchEntry,5))r.Record("trenchEntered");
      const intruders=C.intruders.map(s=>r.enemies.get(s.id));
      if(intruders.every(a=>a&&!a.alive))r.Record("trenchCleared",{count:intruders.length});
      if(r.Has("trenchCleared")&&!this.trenchReleased){this.trenchReleased=true;r.Guide(C.approachRoute,{resumeAfter:C.trenchEntry});}
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
  UpdateEscapePressure(){
    const r=this.r,config=C.escapePressure;
    if(this.derailAt==null)return;
    const age=r.time-this.derailAt;
    // The same wreck remains a visible source while the player leaves it.
    // Smoke uses the existing pools and is removed at the sheltered exchange.
    if(!this.wreckSmokeStarted){
      this.wreckSmokeStarted=true;
      for(const spec of config.smoke)this.wreckSmoke.push(r.vfx.SmokeSource(r.Point(spec.point,spec.height),spec));
    }
    if(r.Has("shelterReached"))this.ClearWreckSmoke();
    if(r.Has("trenchEntered")||!["Unloading","TrenchEntry"].includes(r.flow.stage.id)||r.time<(this.nextPressureAt||0))return;
    const shell=config.shells.find(s=>!this.pressureShells.has(s.id)&&age>=s.after&&(!s.near||r.Near(s.near,s.nearM)));
    if(!shell)return;
    this.pressureShells.add(shell.id);
    this.nextPressureAt=r.time+config.intervalS;
    r.combat.FireShell(r.Point(config.origin,config.originHeightM),r.Point(shell.impact),{
      kind:"Shell75",flight:config.flightS,radius:config.radiusM,damage:config.damage,
      OnImpact:point=>this.pressureImpacts.push({id:shell.id,time:r.time,point:{x:point.x,y:point.y,z:point.z}}),
    });
  }
  ClearWreckSmoke(){
    for(const handle of this.wreckSmoke)this.r.vfx.RemoveSmokeSource(handle);
    this.wreckSmoke=[];
  }
  UpdateZhou(){
    const r=this.r,a=this.zhou;
    if(!a||r.Has("zhouGunWounded"))return;
    if(!a.alive){
      r.Record("zhouGunKilled",{actorId:a.id});r.OnPlayerDown();r.MissionFailure?.("zhou");return;
    }
    if(a.lastFire>0)r.Record("zhouCoverFired");
    // The gunner owns a separate opening script, outside UpdateSquad. Give
    // him the same real cover/escape response while the gun is still his;
    // actual injury continues into the existing wounded handover below.
    if(a.health>=C.zhouWoundThreshold){
      const shelter=r.RespondToGrenade(a)||r.RespondToContact(a);
      if(!shelter)r.Defend(a,C.zhouGunSeat,0,R.companionCoverSlackM);
    }
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
    this.ClearWreckSmoke();
    this.eyeClosure=0;this.blackout=0;this.concussion=null;
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
      const phase=C.surface.find(spec=>spec.id===a.missionId)?.firePhaseS||0;
      const rest=surface&&((r.time+phase)%(C.surfaceBurstSeconds+C.surfaceRestSeconds)>=C.surfaceBurstSeconds);
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
    const chosen=candidates.filter(a=>Distance(a.position,r.player.position)<=CLOSE_RANGE.priorityM).slice(0,C.playerFireLimit);
    const groups=new Set(chosen.map(a=>a.missionFireGroup).filter(Boolean));
    // When both flanking teams can see the player, each gets a firing lane.
    // Immediate close threats keep priority; this never exceeds the same cap.
    for(const a of candidates){
      if(chosen.length>=C.playerFireLimit)break;
      if(a.missionFireGroup&&!groups.has(a.missionFireGroup)&&!chosen.includes(a)){
        chosen.push(a);groups.add(a.missionFireGroup);
      }
    }
    for(const a of candidates)if(chosen.length<C.playerFireLimit&&!chosen.includes(a))chosen.push(a);
    for(const a of chosen)a.missionFireHold=false;
    this.playerShooters=chosen.map(a=>a.missionId);
    this.peakPlayerShooters=Math.max(this.peakPlayerShooters,this.playerShooters.length);
    this.visible=visible;this.peakVisible=Math.max(this.peakVisible,visible);
  }
  State(){return {derailAt:this.derailAt,luoRecoveryAt:this.luoRecoveryAt,barrage:this.barrage.State(),roll:this.r.battlefield.derailRoll||0,
    blackout:this.eyeClosure>=.99?1:0,eyeClosure:this.eyeClosure||0,concussion:this.concussion,hearingAmount:this.hearingAmount||0,rescueAt:this.rescueAt,
    rescueDuration:this.rescueDuration,rescueSampleTime:this.RescueSampleTime(),playerCar:MISSION_TRAIN.mainCar,
    pack:this.pack,
    escapePressure:{launched:[...this.pressureShells],impacts:this.pressureImpacts,smokeSources:this.wreckSmoke.length},
    playerShooters:this.playerShooters||[],peakPlayerShooters:this.peakPlayerShooters,
    visible:this.visible||0,peakVisible:this.peakVisible,shots:this.shotCount,playerShots:this.playerShotCount,
    shelterProtected:this.ShelterProtected(),
    recentFire:this.fireEvents.slice(-12),
    zhou:this.zhou?{position:{...this.zhou.position},health:this.zhou.health,lastFire:this.zhou.lastFire}:null,
    wounded:this.wounded?{position:{...this.wounded.actor.position},alive:this.wounded.actor.alive,index:this.wounded.index}:null,
    runner:this.runner?{position:{...this.runner.actor.position},alive:this.runner.actor.alive,index:this.runner.index}:null};}
}
