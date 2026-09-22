import * as THREE from "three";
import { OPENING_STORYBOARDS as C } from "./Data_OpeningStoryboards.mjs";
import { MISSION_PLACEMENT as P } from "./Data_FirstLevelMissionLayout.mjs";
import { LoadOpeningStoryboardAnimation, InstallOpeningStoryboardAnimation } from "./Script_OpeningStoryboardAnimation.mjs";
import { CloneShadedMaterial } from "./Script_Materials.mjs";
import { ApplyPatches, MakePatch, PatchesOf } from "./Script_MaterialPatches.mjs";
import { WEAPONS } from "./Data_Weapons.mjs";
import { NRA_UNIFORM_COLORS } from "./Data_Tuning_Materials.mjs";
const S=C.positions;
const Clamp=v=>Math.max(0,Math.min(1,v));
const Smooth=v=>{v=Clamp(v);return v*v*(3-2*v);};
const Mix=(a,b,t)=>({x:a.x+(b.x-a.x)*Smooth(t),z:a.z+(b.z-a.z)*Smooth(t)});
const Face=(a,b)=>Math.atan2(a.x-b.x,a.z-b.z);
const Distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const Wrap=v=>Math.atan2(Math.sin(v),Math.cos(v));
const Equip=(soldier,id)=>{if(soldier.actor.weaponId!==id)soldier.actor.SetWeapon(id);};
// Two-bone contact correction for the reclining first-person arms. The baked
// fingers remain intact; shoulders stay behind the eye so no cut sleeve is seen.
function GraspArm(bones,side,shoulder,target,leg=false,polePoint=null){
  const upper=bones[(leg?"thigh":"upperArm")+side],lower=bones[(leg?"calf":"forearm")+side],hand=bones[(leg?"foot":"hand")+side];
  const Pos=bone=>bone.getWorldPosition(new THREE.Vector3());
  const lenA=Pos(upper).distanceTo(Pos(lower)),lenB=Pos(lower).distanceTo(Pos(hand));
  const handQ=hand.getWorldQuaternion(new THREE.Quaternion());
  // Never translate the shoulder toward an unreachable grasp: that puts the
  // open sleeve in front of the first-person camera. Keep anatomical lengths.
  upper.position.copy(upper.parent.worldToLocal(shoulder.clone()));upper.updateMatrixWorld(true);
  const delta=target.clone().sub(shoulder),distance=Math.min(lenA+lenB-.001,Math.max(.001,delta.length())),dir=delta.normalize();
  const axial=(lenA*lenA+distance*distance-lenB*lenB)/(2*distance);
  const pole=polePoint?polePoint.clone().sub(shoulder):new THREE.Vector3(0,-1,0);
  pole.addScaledVector(dir,-pole.dot(dir)).normalize();
  const elbow=shoulder.clone().addScaledVector(dir,axial).addScaledVector(pole,Math.sqrt(Math.max(0,lenA*lenA-axial*axial)));
  const Aim=(bone,child,goal)=>{
    const origin=Pos(bone),q=bone.getWorldQuaternion(new THREE.Quaternion());
    const turn=new THREE.Quaternion().setFromUnitVectors(Pos(child).sub(origin).normalize(),goal.clone().sub(origin).normalize());
    bone.quaternion.copy(bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(turn.multiply(q)));bone.updateMatrixWorld(true);
  };
  Aim(upper,lower,elbow);Aim(lower,hand,shoulder.clone().addScaledVector(dir,distance));
  hand.quaternion.copy(hand.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(handQ));hand.updateMatrixWorld(true);
}
function ArmReach(bones,side){
  const Pos=key=>bones[key+side].getWorldPosition(new THREE.Vector3());
  return Pos("upperArm").distanceTo(Pos("forearm"))+Pos("forearm").distanceTo(Pos("hand"))-.012;
}
function SharedGrasp(target,a,reachA,b,reachB){
  const delta=new THREE.Vector3();
  for(let i=0;i<20;i++)for(const [origin,reach] of [[a,reachA],[b,reachB]]){
    delta.copy(target).sub(origin);if(delta.length()>reach)target.copy(origin).add(delta.setLength(reach));
  }
  return target;
}

// Actor, camera and voice progression share this director. Mission gates are only
// recorded after the corresponding physical performance has actually completed.
export class FirstLevelBunkerShow {
  constructor(runtime){this.r=runtime;this.captives=[];this.rifleProps=[];this.beats=new Set();this.phase="Supply";this.at=0;this.line=0;this.cast={};this.ready=false;this.owned=[];
    LoadOpeningStoryboardAnimation().then(()=>this.ready=true).catch(error=>this.error=String(error));}
  Begin(){this.at=this.r.time;this.started=this.r.time;}
  Enter(stage){
    if(stage==="RearTrench"){
      for(const actor of [...this.r.squad,...this.r.enemies.values()]){
        if(actor.alive)actor.openingStoryboardPose=null;
        actor.openingStoryboardTravel=null;actor.actor.root.visible=true;
        if(actor.missionEncounter==="bunkerAssault"){actor.scriptEssential=false;actor.scriptedNoncombatant=false;}
      }
      if(this.playerBody)this.playerBody.root.visible=false;
      this.Hide(this.cast.BunkerRunner);
    }
  }
  Set(phase){
    if(this.phase===phase)return;
    this.phaseFrom=Object.fromEntries([...Object.values(this.cast),...this.r.squad,...this.r.enemies.values()]
      .map(actor=>[actor.id,{x:actor.position.x,z:actor.position.z}]));
    const cam=this.presentedCamera||this.r.player.camera;
    this.cameraFrom={position:cam.position.clone(),quaternion:cam.quaternion.clone()};
    this.phase=phase;this.at=this.r.time;this.beats.add(phase);this.line=0;
  }
  get Age(){return this.r.time-this.at;}
  get CameraActive(){return ["Trapped","BunkerRescue"].includes(this.r.flow.stage.id)&&this.phase!=="Released";}
  Spawn(id,side,point,options={}){
    const actor=this.r.ai.Spawn(side,point.x,point.z,{weapon:"HanYang",scriptedNoncombatant:true,squadId:"OpeningStoryboard",...options});
    if(!actor)throw Error(`Opening storyboard spawn failed: ${id}`);
    actor.missionId=id;actor.scriptEssential=true;actor.missionDormant=false;
    this.r.MoveActor(actor,actor.position,0);InstallOpeningStoryboardAnimation(actor);return this.cast[id]=actor;
  }
  Setup(){
    if(this.setup)return;this.setup=true;
    this.captives=[this.Spawn("BunkerCaptiveHelper","nra",S.captiveStart,{unarmed:true,modelVariant:1})];
    this.Spawn("BunkerInterpreter","ija",S.interpreter,{unarmed:true,actorKind:"nra",modelVariant:1});
    this.Spawn("BunkerRunner","nra",{x:S.runner.x,z:S.runner.z-4},{modelVariant:4});
    // The interpreter is recognizable as an unarmed dark-clothed guide, never a
    // friendly faction marker. Preserve registered shader patches on cloned cloth.
    this.cast.BunkerInterpreter.actor.root.traverse(node=>{
      if(!node.isMesh||!node.material)return;
      const Change=source=>{
        if(source.name!==NRA_UNIFORM_COLORS.materialName)return source;
        const mat=CloneShadedMaterial(source);
        // Replace only blue uniform cloth and red insignia, preserving skin and
        // the original atlas folds. Registered after the shared uniform patch.
        const patch=MakePatch({key:"OpeningInterpreterCloth",fragment:[["#include <color_fragment>",`
          float openingShade = dot(diffuseColor.rgb,vec3(.2126,.7152,.0722));
          diffuseColor.rgb=vec3(.11,.095,.078)*openingShade*2.2;
        `]]});
        ApplyPatches(mat,[...(PatchesOf(mat)||[]).filter(p=>!String(typeof p.key==="function"?p.key():p.key).startsWith("nraUniformCloth")),patch]);
        this.owned.push(mat);return mat;
      };
      node.material=Array.isArray(node.material)?node.material.map(Change):Change(node.material);
    });
    for(const actor of this.r.squad)InstallOpeningStoryboardAnimation(actor);
    for(const actor of this.r.enemies.values())if(actor.missionEncounter==="bunkerAssault")InstallOpeningStoryboardAnimation(actor);
    this.playerBody=this.r.actorFactory.Create("nra",{weapon:null,modelVariant:1,seed:101});
    this.playerBody.characterRig.SetHeadVisible(false);
    this.playerBody.root.traverse(mesh=>{
      if(!mesh.isSkinnedMesh)return;
      const source=mesh.geometry,indices=source.index?.array,skin=source.getAttribute("skinIndex"),weight=source.getAttribute("skinWeight");
      if(!indices||!skin||!weight)return;
      const arms=new Set(mesh.skeleton.bones.flatMap((bone,i)=>/UpperArm|Forearm|Hand|Finger/.test(bone.name)?[i]:[]));
      const Keep=index=>{let total=0;for(let k=0;k<4;k++)if(arms.has(skin.array[index*4+k]))total+=weight.array[index*4+k];return total>.999;};
      const selected=[];for(let i=0;i<indices.length;i+=3)if([indices[i],indices[i+1],indices[i+2]].every(Keep))selected.push(indices[i],indices[i+1],indices[i+2]);
      const geometry=source.clone();geometry.setIndex(selected);geometry.clearGroups();mesh.geometry=geometry;this.ownedGeometry??=[];this.ownedGeometry.push(geometry);
    });
    this.playerProxy={actor:this.playerBody};InstallOpeningStoryboardAnimation(this.playerProxy);
    const one=this.Executioner(0);
    if(one)one.openingStoryboardContact=()=>this.CollarContact(one);
    this.r.scene.add(this.playerBody.root);
    this.MakeSupplyProps();
    // Establish the opening tableau behind the initial fade. Subsequent shot
    // changes always travel from the actual pose; no actor crosses the eye to
    // reach an offscreen spawn intended only for the later playable stage.
    if(this.r.flow.stage.id==="Trapped")for(const [actor,point,target] of [
      [this.r.companion.Handle("yaowa"),S.yaowa,S.seated],
      [this.r.companion.Handle("luo"),S.luoOrder,S.runner],
      [this.r.companion.Handle("heyoutian"),S.heCover,S.march[0]],
      [this.r.companion.Handle("liuwencai"),{x:-40,z:-118},S.runner],
    ]){
      this.r.PlaceActor(actor,point);actor.openingStoryboardLast={...point,time:this.r.time};
      actor.yaw=Face(point,target);actor.actor.root.rotation.y=actor.yaw;
    }
    if(this.r.Has("captivesKilled")){
      this.r.PlaceActor(this.Helper,S.captive);
      this.Helper.openingStoryboardLast={...S.captive,time:this.r.time};
      this.Mark(this.Helper,S.captive,S.interpreter,"ShotCollapse",1.6);
      this.Helper.scriptEssential=false;this.Helper.TakeHit(200,"torso",null,{kind:"bullet"});
      this.shotFired=true;this.captiveHitAt=this.r.time-1.6;
    }
    if(this.r.flow.stage.id==="BunkerRescue"){
      const actors=[[this.Executioner(0),S.interrogator,S.interrogated],[this.Executioner(1),S.guardNear,S.march[1]],
        [this.cast.BunkerInterpreter,S.interpreterNear,S.interrogated],[this.r.companion.Handle("luo"),S.luoRear,S.luoHidden]];
      for(const [actor,point,target] of actors){
        this.r.PlaceActor(actor,point);actor.openingStoryboardLast={...point,time:this.r.time};
        actor.yaw=Face(point,target);actor.actor.root.rotation.y=actor.yaw;
      }
    }
    // Source skin remains intact. Camera stays beyond its face, looking over the
    // chest/arms; the same world-space skeleton writes real motion vectors.
  }
  Executioner(slot){return this.r.enemies.get(slot?"BunkerExecutionerB":"BunkerExecutionerA");}
  MakeSupplyProps(){
    this.supplyRoot=new THREE.Group();this.r.scene.add(this.supplyRoot);
    const brass=new THREE.MeshStandardMaterial({color:0x887039,metalness:.65,roughness:.58}),steel=new THREE.MeshStandardMaterial({color:0x343533,metalness:.7,roughness:.5});
    this.owned.push(brass,steel);this.clips=[];
    for(let n=0;n<2;n++){
      const clip=new THREE.Group();this.supplyRoot.add(clip);this.clips.push(clip);
      const frame=new THREE.Mesh(new THREE.BoxGeometry(.061,.005,.009),steel);clip.add(frame);frame.position.y=-.025;this.ownedGeometry.push(frame.geometry);
      for(let i=0;i<5;i++){const round=new THREE.Mesh(new THREE.CylinderGeometry(.003,.004,.053,8),brass);round.position.x=(i-2)*.011;clip.add(round);this.ownedGeometry.push(round.geometry);}
    }
    this.loadingRifle=new THREE.Group();const built=this.r.actorFactory.WeaponGeometry("HanYang",0,{includeBayonet:false});
    this.loadingRifleGrip=built.gripFront.clone();
    const materials=this.r.actorFactory.ActorMaterials("nra",()=>.5);
    for(const [key,geometry] of built.geometries)this.loadingRifle.add(new THREE.Mesh(geometry,materials[key]||materials.steel));
    this.supplyRoot.add(this.loadingRifle);
  }
  get Helper(){return this.captives[0];}
  get Wounded(){return null;}
  Mark(actor,point,target,clip,seconds=this.Age){
    if(!actor||!actor.alive)return;
    actor.openingStoryboardHidden=false;
    const last=actor.openingStoryboardLast;
    const dt=Math.max(0,this.r.time-(last?.time??this.r.time-this.delta)),from=last||actor.position;
    const distance=Distance(from,point),step=Math.min(distance,C.walkMps*dt);
    if(distance>.00001)point={x:from.x+(point.x-from.x)*step/distance,z:from.z+(point.z-from.z)*step/distance};
    actor.openingStoryboardTravel=dt>0?Distance(from,point)/dt:0;
    actor.openingStoryboardLast={...point,time:this.r.time};
    actor.scriptedNoncombatant=true;actor.missionDormant=false;actor.scriptEssential=true;
    this.r.ai.ReleaseCover(actor);this.r.PlaceActor(actor,point);this.r.MoveActor(actor,point,0);
    const desired=Distance(point,target)>.02?Face(point,target):actor.yaw;
    actor.yaw+=Math.max(-C.turnRps*dt,Math.min(C.turnRps*dt,Wrap(desired-actor.yaw)));
    actor.watchYaw=actor.yaw;actor.watchUntil=this.r.ai.time+1;
    if(actor.openingStoryboardTravel>.1&&["InterpreterPoint","CaptiveHeld","SupplyReceive"].includes(clip))clip=null;
    if(clip==="GuardTurn"||!clip&&actor.actor.weaponId&&actor.actor.weaponId!=="Dadao")clip="IjaBayonetGuard";
    actor.openingStoryboardPose=clip?{clip,seconds}:null;
    actor.actor.root.rotation.y=actor.yaw;actor.actor.root.visible=true;
    InstallOpeningStoryboardAnimation(actor);
  }
  From(actor,to,seconds){return Mix(this.phaseFrom?.[actor.id]||actor.position,to,seconds);}
  Arrived(actor,point){return actor&&Distance(actor.position,point)<.08;}
  CollarContact(actor){
    const p=this.phase,bones=actor.actor.characterRig.bones;
    let target;
    if(["Advance","Captive"].includes(p))target=this.Helper.actor.characterRig.bones.chest.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0,.1,0));
    if(p==="Drag"){
      const feet=["L","R"].map(side=>bones["foot"+side].getWorldPosition(new THREE.Vector3()));
      const pelvis=bones.pelvis.getWorldPosition(new THREE.Vector3());pelvis.y-=.3;
      bones.pelvis.position.copy(bones.pelvis.parent.worldToLocal(pelvis));bones.pelvis.updateMatrixWorld(true);
      for(const [i,side] of ["L","R"].entries()){
        const knee=bones["calf"+side].getWorldPosition(new THREE.Vector3());
        knee.x-=Math.sin(actor.yaw)*.4;knee.z-=Math.cos(actor.yaw)*.4;
        GraspArm(bones,side,bones["thigh"+side].getWorldPosition(new THREE.Vector3()),feet[i],true,knee);
      }
      target=this.r.Point(this.PlayerPoint(),.68);
    }
    if(!target)return;
    GraspArm(bones,"L",bones.upperArmL.getWorldPosition(new THREE.Vector3()),target);
    const twoHanded=actor.actor.weaponTwoHanded;actor.actor.weaponTwoHanded=false;
    actor.actor._UpdateRiggedWeaponMount();actor.actor.weaponTwoHanded=twoHanded;
  }
  Hide(actor){if(actor){actor.openingStoryboardHidden=true;actor.actor.root.visible=false;actor.openingStoryboardPose=null;}}
  BeforeRender(){
    for(const actor of [...Object.values(this.cast),...this.r.squad,...this.r.enemies.values()])
      if(actor.openingStoryboardHidden)actor.actor.root.visible=false;
  }
  OnLine(cue,index){
    this.line=index;this.lineAt=this.r.time;
    if(cue==="BunkerBanter"&&index===2)this.Set("Orders");
    if(cue==="RescueCall"&&index===3)this.Set("Creep");
    if(cue==="RescueOut"&&index===2)this.kickRequested=true;
    if(cue==="FrontBlockade"){
      this.pointActor=index===0?this.r.opening.zhou:this.r.companion.Handle("luo");this.pointAt=this.r.time;
      InstallOpeningStoryboardAnimation(this.pointActor);
    }
  }
  OnVoiceDone(cue){
    const r=this.r;
    if(cue==="BunkerSearch"){this.searchVoiceDone=true;}
    if(cue==="BunkerKilling"){this.Set("CaptiveShot");}
    if(cue==="RescueCall"){this.ambushRequested=true;}
    if(cue==="RescueLift"){this.pullRequested=true;}
    if(cue==="RescueOut")this.rescueVoiceDone=true;
  }
  Blast(){
    if(this.phase!=="Supply"&&this.phase!=="Orders")return;
    this.Set("Blast");
    this.r.combat.FireShell(this.r.Point({x:S.blast.x+4,z:S.blast.z-5},12),this.r.Point(S.blast),{flight:.22,damage:0,radius:4,incoming:false});
    this.r.audio?.Play?.("debrisFall",{position:this.r.Point(S.trapped),volume:.9});
  }
  UpdateBunker(){ /* Driven after UpdateSquad by FrontShow.Update. */ }
  Update(dt){
    this.delta=dt;
    const r=this.r,stage=r.flow.stage.id;
    if(this.CameraActive){
      if(!this.savedMeleeDormancy){this.playerMeleeDormancy=r.player.meleeDormant;this.savedMeleeDormancy=true;}
      r.player.meleeDormant=true;
    }else this.ReleaseMeleeDormancy();
    const bloodAge=this.strikeAt==null?Infinity:r.time-this.strikeAt;
    this.bloodMask=C.strikeBlood.opacity*(1-Smooth((bloodAge-C.strikeBlood.holdS)/C.strikeBlood.fadeS));
    r.hud.SetStoryBlood?.(this.bloodMask);
    if(!["Trapped","BunkerRescue"].includes(stage)){
      if(stage==="RearTrench"&&this.cast.BunkerInterpreter){this.EscapeGuide(this.cast.BunkerInterpreter,this.Age+4);if(this.Age>3)this.cast.BunkerInterpreter.scriptEssential=false;}
      if(this.pointActor){const elapsed=r.time-this.pointAt,blocker=r.enemies.get("FrontGunner");this.pointActor.openingStoryboardPose=elapsed<3?{clip:"PointBlockade",seconds:elapsed,upperBody:true}:null;
        if(blocker&&elapsed<3){this.pointActor.watchYaw=Face(this.pointActor.position,blocker.position);this.pointActor.yaw=this.pointActor.watchYaw;this.pointActor.watchUntil=r.ai.time+.2;}
        if(elapsed>=3)this.pointActor=null;}
      return;
    }
    if(!this.ready)return;
    this.Setup();
    if(this.phase!=="Kick"&&this.phase!=="Released")this.MoveRifle(S.rifleStart);
    if(!this.voiceStarted){this.voiceStarted=true;this.started=r.time;if(stage==="Trapped")r.Say("BunkerBanter");}
    if(stage==="BunkerRescue"&&!this.interrogationStarted){this.interrogationStarted=true;this.Set("Interrogate");r.Say("RescueCall");}
    const a=this.Age,p=this.phase,luo=r.companion.Handle("luo"),yaowa=r.companion.Handle("yaowa"),
      he=r.companion.Handle("heyoutian"),wen=r.companion.Handle("liuwencai"),one=this.Executioner(0),two=this.Executioner(1),guide=this.cast.BunkerInterpreter;
    if(p==="Supply"||p==="Orders"){
      this.Mark(yaowa,S.yaowa,S.seated,"SupplyReceive",r.time-this.started);
      Equip(yaowa,null);
      this.Mark(luo,S.luoOrder,S.runner,"PointBlockade");
      this.Mark(he,S.heCover,S.march[0],null);
      this.Mark(wen,{x:-40,z:-118},S.runner,null);
      this.Mark(this.cast.BunkerRunner,S.runner,S.luoOrder,null);
      this.Hide(one);this.Hide(two);this.Hide(guide);this.Hide(this.Helper);
    }else if(p==="Blast"){
      this.Mark(yaowa,a<1.2?S.yaowa:P.bunker.yaowaLift,P.bunker.yaowaLift,a<1.2?"DuckBlast":null);
      this.Mark(luo,S.luoRear,S.luoRear,null);
      this.Mark(this.cast.BunkerRunner,{x:-40,z:-118},{x:-40,z:-118},null);
      if(a>=C.wakeS){this.Set("Advance");r.Say("BunkerSearch");}
    }else{
      this.Mark(this.cast.BunkerRunner,{x:-40,z:-118},{x:-40,z:-118},null);
      this.Mark(yaowa,P.bunker.yaowaLift,S.trapped,null);
      if(!["Deflect","Cover","Pull","Kick","Released"].includes(p))this.Mark(wen,{x:-40,z:-118},S.trapped,null);
      if(!["Deflect","Cover","Pull","Kick","Released"].includes(p))this.Mark(he,S.heCover,S.guard,null);
      if(["Advance","Captive","CaptiveShot"].includes(p)){
        this.Mark(one,S.controller,S.captive,p==="CaptiveShot"?null:"CollarControl");
        one.openingStoryboardAim=p==="CaptiveShot"?1:0;
        this.Mark(two,S.guard,S.captive,"GuardTurn",1.2);
        this.Mark(guide,S.interpreter,S.captive,"InterpreterPoint");
        if(p==="Advance"&&this.Arrived(this.Helper,S.captive))this.kneelAt??=r.time;
        const kneeling=this.kneelAt!=null?r.time-this.kneelAt:0;
        this.Mark(this.Helper,S.captive,p==="Advance"&&this.kneelAt==null?S.captive:S.interpreter,p==="Advance"?(this.kneelAt==null?"CaptiveHandsUpWalk":"CaptiveStandToKneel"):"CaptiveHeld",p==="Advance"?(this.kneelAt==null?a:kneeling):p==="CaptiveShot"?0:a);
        this.Mark(luo,S.luoRear,S.luoHidden,null);
        if(p==="Advance"&&this.searchVoiceDone&&kneeling>=1&&this.Arrived(one,S.controller)&&this.Arrived(guide,S.interpreter)){
          this.Set("Captive");r.Say("BunkerKilling");
        }
        if(p==="CaptiveShot"&&a>=.4&&!this.shotFired){
          this.shotFired=true;this.Shot(one,r.Point(S.captive,.75));
          this.Helper.scriptEssential=false;this.Helper.TakeHit(200,"torso",null,{kind:"bullet"});
          this.captiveHitAt=r.time;
        }
        if(this.shotFired)this.Helper.openingStoryboardPose={clip:"ShotCollapse",seconds:r.time-this.captiveHitAt};
        if(p==="CaptiveShot"&&a>=2.1){r.Record("captivesKilled",{count:1});this.Set("Discover");r.Say("ShunziCurse");}
      }else if(["Discover","Drag","Butt","Black"].includes(p)){
        const playerPoint=this.PlayerPoint();
        const pos=p==="Discover"?S.discover:p==="Drag"?Mix(S.discover,{x:playerPoint.x-.25,z:playerPoint.z-.55},a/.35):S.interrogator;
        const clearing=p==="Discover"&&this.Arrived(one,S.discover);
        if(clearing)this.clearAt??=r.time;
        this.Mark(one,pos,this.PlayerPoint(),p==="Discover"?(clearing?"BayonetClearWood":null):p==="Drag"?"CollarDrag":p==="Butt"?"ButtThreat":"InterrogateCrouch",
          clearing?r.time-this.clearAt:a);
        one.openingStoryboardAim=0;
        this.Mark(two,S.guardNear,S.march[1],null);this.Mark(guide,S.interpreterNear,S.interrogated,"InterpreterPoint");this.Mark(luo,S.luoRear,S.luoHidden,null);
        if(p==="Discover"&&clearing&&r.time-this.clearAt>=C.clearWoodS)this.Set("Drag");
        if(p==="Drag"&&a>=C.dragS)this.Set("Butt");
        if(p==="Butt"&&a>=C.buttContactS&&!this.strikeAt){this.strikeAt=r.time;r.audio.Deafen?.(1.1);r.Record("playerButtStruck");}
        if(p==="Butt"&&a>=C.buttS)this.Set("Black");
        if(p==="Black"&&a>=C.strikeBlackS&&r.voice.finished.has("ShunziCurse")){r.Record("doorSearchStarted");}
      }else if(p==="Interrogate"||p==="Creep"){
        this.Mark(one,S.interrogator,S.interrogated,"InterrogateCrouch",r.time-this.started);
        this.Mark(guide,S.interpreterNear,S.interrogated,"InterpreterPoint",r.time-this.started);
        this.Mark(two,S.guardNear,S.march[1],null);
        const crawl=p==="Creep"?this.From(luo,S.luoAmbush,a/3):this.From(luo,S.luoHidden,a/6.5);
        this.Mark(luo,crawl,p==="Creep"?S.luoAmbush:S.luoHidden,"CreepDadao");Equip(luo,"Dadao");
        if(this.ambushRequested&&this.Arrived(luo,S.luoAmbush)){this.Set("Ambush");r.Say("RescueLift");}
      }else if(p==="Ambush"){
        this.Mark(luo,S.luoAmbush,S.guardNear,"DadaoAmbush");Equip(luo,"Dadao");
        this.Mark(two,S.guardNear,S.march[1],null);
        this.Mark(one,S.interrogator,S.luoAmbush,"GuardTurn");
        this.EscapeGuide(guide,a);
        if(a>=C.bladeContactS&&two.alive){
          this.DropRifle(two);two.openingStoryboardPose=null;two.scriptEssential=false;
          const weapon=luo.weapon;luo.weapon=WEAPONS.Dadao;r.meleeCombat.Damage(two,luo,200,"heavy");luo.weapon=weapon;
          this.bladeHitAt=r.time;
        }
        if(a>=C.ambushS)this.Set("Deflect");
      }else if(p==="Deflect"||p==="Cover"){
        this.Mark(luo,p==="Deflect"?Mix(S.luoAmbush,S.luoDeflect,a/C.deflectS):this.From(luo,S.pullStart,a/1.7),S.interrogated,p==="Deflect"?"RifleDeflect":this.Arrived(luo,S.pullStart)?"PullComrade":null,p==="Deflect"?a:0);
        if(!one.openingCombatReleased)this.Mark(one,S.interrogator,{x:-37,z:-130},"GuardTurn");this.EscapeGuide(guide,a+C.ambushS);
        if(p==="Deflect"&&a>.7&&!this.deflectedShot){this.deflectedShot=true;this.Shot(one,r.Point({x:-35.5,z:-130.3},1.05),true);}
        if(this.deflectedShot)this.ReleaseCombat(one);
        this.UpdateSuppression();
        if(p==="Deflect"&&a>=C.deflectS)this.Set("Cover");
        if(p==="Cover"&&this.pullRequested&&this.Arrived(luo,S.pullStart)&&this.VanguardCleared()){this.Set("Pull");r.Say("RescueOut");}
      }else if(p==="Pull"||p==="Kick"){
        Equip(luo,null);
        const pulling=p==="Pull"&&a<=C.pullS;
        const luoPoint=p==="Kick"?S.luoPull:pulling?Mix(S.pullStart,S.pullEnd,a/C.pullS):Mix(S.pullEnd,S.luoPull,(a-C.pullS)/2);
        this.Mark(luo,luoPoint,this.PlayerPoint(),p==="Kick"?"KickRifle":pulling?"PullComrade":null);
        this.EscapeGuide(guide,a+2);this.UpdateSuppression();
        if(p==="Kick"){
          this.MoveRifle(Mix(S.rifleStart,S.rifleEnd,(a-C.kickContactS)/(C.kickS-C.kickContactS)));
          if(a>=C.kickS&&this.rescueVoiceDone){this.Release();}
        }
        if(p==="Pull"&&this.kickRequested&&a>C.pullS&&this.Arrived(luo,S.luoPull))this.Set("Kick");
      }else if(p==="Released"){
        this.EscapeGuide(guide,a+4);this.UpdateSuppression();
      }
    }
    if(this.shotFired)this.Helper.openingStoryboardPose={clip:"ShotCollapse",seconds:r.time-this.captiveHitAt};
    this.UpdateDroppedRifle();
    // The same finite follow-up pair continues forward through the background.
    for(const [i,id] of ["BunkerFollowA","BunkerFollowB"].entries()){
      const actor=r.enemies.get(id);if(!actor)continue;
      if(["Supply","Orders","Blast"].includes(p)){this.Hide(actor);continue;}
      if(["Ambush","Deflect","Cover","Pull","Kick","Released"].includes(p)){this.ReleaseCombat(actor);continue;}
      actor.missionDormant=false;actor.scriptedNoncombatant=true;
      const start=S.march[i],end={x:start.x,z:S.march[2].z-i*1.8},t=Clamp((r.time-r.opening.blastAt-C.wakeS-i*2)/12);
      this.Mark(actor,Mix(start,end,t),end,null);
    }
  }
  EscapeGuide(actor,age){this.escapeAt??=this.r.time-age;this.Mark(actor,Mix(S.interpreterNear,S.interpreterExit,(this.r.time-this.escapeAt)/6),S.interpreterExit,null);}
  Shot(actor,target,wall=false){
    const r=this.r,from=actor.actor.MuzzleWorld(new THREE.Vector3()).clone(),dir=target.clone().sub(from).normalize();
    const hit=wall?r.battlefield.Raycast(from,dir,8,{terrain:true}):null,end=hit?from.clone().addScaledVector(dir,hit.t):target;
    r.vfx?.MuzzleFlash(from,dir,{kind:"boltRifle"});r.vfx?.Tracer(from,end,{kind:"ija"});
    if(hit)r.vfx?.Impact(end,dir.clone().negate(),"dirt");
    r.audio?.PlayGunshot("rifleIja",{position:from,volume:1});actor.actor.recoil=1;
    if(wall)this.deflectedImpact={hit:!!hit,point:end.toArray()};
  }
  DropRifle(actor){
    const source=actor.actor.weaponGroup;if(!source)return;
    source.updateWorldMatrix(true,true);const prop=source.clone();source.matrixWorld.decompose(prop.position,prop.quaternion,prop.scale);
    this.r.scene.add(prop);
    this.rifleDrop={prop,at:this.r.time,from:prop.position.clone(),rotation:prop.quaternion.clone(),
      to:this.r.Point({x:actor.position.x+.35,z:actor.position.z+.15},.08),
      endRotation:new THREE.Quaternion().setFromEuler(new THREE.Euler(0,.65,Math.PI/2))};
    this.rifleProps.push(prop);Equip(actor,null);
  }
  UpdateDroppedRifle(){
    const d=this.rifleDrop;if(!d)return;const t=Clamp((this.r.time-d.at)/.55);
    d.prop.position.lerpVectors(d.from,d.to,t);d.prop.position.y+=Math.sin(Math.PI*t)*.12;
    d.prop.quaternion.slerpQuaternions(d.rotation,d.endRotation,t);
  }
  MoveRifle(point){const item=this.r.bunkerRifle;if(item?.view){const pos=this.r.Point(point);Object.assign(item.position,pos);item.view.position.copy(pos);}}
  Release(){
    if(!this.VanguardCleared())return;
    this.ReleaseMeleeDormancy();
    const r=this.r;this.Set("Released");r.Record("playerDraggedFromWreck",{to:S.rescued});r.Record("luoRescueComplete");
    const kind=r.controls?.kind;r.controls=null;r.Control?.(false,kind);r.player.stance="crouch";
    const direction=r.player.camera.getWorldDirection(new THREE.Vector3());
    r.player.yaw=Math.atan2(-direction.x,-direction.z);r.player.pitch=Math.asin(direction.y);
    for(const actor of r.squad){actor.openingStoryboardPose=null;actor.openingStoryboardTravel=null;actor.actor.root.visible=true;Equip(actor,actor.weaponId);}
    this.playerBody.root.visible=false;
  }
  UpdateSuppression(){
    const r=this.r;
    for(const [id,post] of Object.entries(C.coverPosts)){
      const actor=r.companion.Handle(id);if(!actor?.alive)continue;
      actor.openingStoryboardPose=null;actor.openingStoryboardTravel=null;actor.openingStoryboardLast=null;
      actor.scriptedNoncombatant=false;
      if(Distance(actor.position,post)>C.coverArrivalM){r.ai.ReleaseCover(actor);r.MoveActor(actor,post,C.walkMps);}
      else r.Defend(actor,post,0,.4);
      actor.scriptAccuracyScale=C.counterattackAccuracyScale;
    }
  }
  VanguardCleared(){return C.vanguardIds.every(id=>this.r.enemies.get(id)?.alive===false);}
  ReleaseMeleeDormancy(){
    if(this.savedMeleeDormancy){this.r.player.meleeDormant=this.playerMeleeDormancy;this.savedMeleeDormancy=false;}
  }
  ReleaseCombat(actor){
    if(!actor?.alive||actor.openingCombatReleased)return;
    actor.openingCombatReleased=true;actor.scriptEssential=false;actor.scriptedNoncombatant=false;actor.missionDormant=false;
    actor.openingStoryboardPose=null;actor.openingStoryboardTravel=null;actor.openingStoryboardLast=null;actor.openingStoryboardContact=null;
    // Turn and fight the counterattack from the current post, without the old
    // intrusion roaming radius pushing the soldiers through Luo and the captive.
    actor.tacticalRadiusM=0;
    this.r.Defend(actor,actor.position,C.counterattackHoldM,C.counterattackHoldM);
  }
  RescueGatherReady(){return false;}
  PlayerPoint(){
    const p=this.phase,a=this.Age;
    if(["Supply","Orders","Blast"].includes(p))return S.seated;
    if(["Advance","Captive","CaptiveShot","Discover"].includes(p))return S.trapped;
    if(p==="Drag")return Mix(S.trapped,S.interrogated,a/C.dragS);
    if(p==="Pull")return Mix(S.interrogated,S.rescued,a/C.pullS);
    if(["Kick","Released"].includes(p))return S.rescued;
    return S.interrogated;
  }
  PlacePlayer(){const r=this.r,point=this.PlayerPoint(),y=r.battlefield.GroundHeight(point.x,point.z);r.player.position.set(point.x,y,point.z);r.player.body?.Teleport(point.x,y,point.z);r.player.velocity.set(0,0,0);}
  ApplyCamera(){
    const r=this.r,p=this.phase,a=this.Age;
    if(!this.CameraActive)return false;
    const cam=r.player.camera,point=this.PlayerPoint();let eye=.46,target=S.interrogator,height=.94,roll=-.055;
    if(p==="Supply"){eye=.95;target={x:-40.45,z:-127.4};height=.72;roll=0;}
    if(p==="Orders"){eye=1.05;target=S.runner;height=1.35;roll=0;}
    if(p==="Blast"){eye=.95-.5*Smooth(a);target=S.runner;height=1;roll=.25*Math.sin(a*12)*Math.exp(-a);}
    if(["Advance","Captive","CaptiveShot"].includes(p)){target=p==="Advance"?S.guard:S.captive;height=p==="Advance"?1.25:.95;}
    if(p==="Discover"){target=S.discover;height=1.0;}
    if(["Interrogate","Creep","Ambush","Deflect","Cover"].includes(p)){eye=.8;target=p==="Creep"||p==="Ambush"?S.guardNear:{x:-40,z:-131.2};height=1.05;roll=0;}
    if(p==="Drag"){target=this.Executioner(0).position;height=1.25;eye=.62;}
    if(p==="Butt"||p==="Black"){height=1.22;eye=.8;}
    if(p==="Pull"||p==="Kick"){eye=.62+(p==="Kick"?.43*Smooth((a-.8)/.8):0);target=p==="Kick"?S.rifleEnd:this.r.companion.Handle("luo").position;height=p==="Kick"?.10:.9;roll=0;}
    if(p==="Cover"){eye=.62;target=this.r.companion.Handle("luo").position;height=.9;roll=0;}
    cam.position.copy(r.Point(point,eye));cam.lookAt(r.Point(target,height));cam.rotateZ(roll);
    if(this.cameraFrom&&a<C.cameraBlendS){const mix=Smooth(a/C.cameraBlendS);cam.position.lerpVectors(this.cameraFrom.position,cam.position,mix);cam.quaternion.slerpQuaternions(this.cameraFrom.quaternion,cam.quaternion,mix);}
    cam.updateMatrixWorld(true);
    this.presentedCamera={position:cam.position.clone(),quaternion:cam.quaternion.clone()};
    const opening=r.opening;
    opening.eyeClosure=p==="Supply"?1-Smooth((r.time-this.started)/C.fadeInS):p==="Blast"?(a<.25?0:a<2.3?1:1-Smooth((a-2.3)/2)):0;
    opening.blackout=opening.eyeClosure;
    if(p==="Butt"||p==="Black")opening.concussion={amount:.95,focus:.15,pitch:0,roll:0};
    if(this.playerBody){
      const supply=p==="Supply"||p==="Orders",body=this.playerBody.root;
      const bodyYaw=Face(point,target),offset=supply?.12:.5;
      body.visible=this.ready;body.position.copy(r.Point({x:point.x-Math.sin(bodyYaw)*offset,z:point.z-Math.cos(bodyYaw)*offset},supply?-.18:eye-(p==="Kick"?.9:.72)));
      body.rotation.set(0,bodyYaw,0);
      const clip=p==="Supply"||p==="Orders"?"ClipLoad":p==="Blast"?"DuckBlast":p==="Pull"?"SupplyReceive":"WoundedReach";
      this.playerProxy.openingStoryboardPose={clip,seconds:a};this.playerBody.Update(this.delta||0,{crouch:1,elapsed:r.time});
      const bones=this.playerBody.characterRig.bones,fp=C.firstPerson;
      const Local=(x,y,z)=>new THREE.Vector3(x,y,z).applyQuaternion(cam.quaternion).add(cam.position);
      for(const side of ["L","R"]){
        const sign=side==="L"?-1:1,shoulder=Local(sign*fp.shoulderHalfWidthM,-fp.shoulderDropM,fp.shoulderBackM);
        let hand=Local(sign*.16,-.5,-.15);
        if(supply)hand=Local(sign*.13,side==="L"?-.14:-.08+.035*Math.sin(a*4),-.32);
        else if(p==="Blast")hand=Local(sign*.22,-.1,-.3);
        else if(["Advance","Captive","CaptiveShot","Discover"].includes(p)&&side==="L")hand=Local(-.13,-.28,-.36);
        else if(p==="Drag"&&side==="L"){
          const captor=this.Executioner(0).actor.characterRig.bones;
          const otherShoulder=captor.upperArmL.getWorldPosition(new THREE.Vector3());
          hand=Local(-.1,-.08,-.3);
          SharedGrasp(hand,shoulder,ArmReach(bones,side),otherShoulder,ArmReach(captor,"L"));
          GraspArm(captor,"L",otherShoulder,hand);
          hand=captor.handL.getWorldPosition(new THREE.Vector3());
        }
        else if(p==="Pull"&&a<=C.pullS){
          hand=Local(sign*.12,-.18,-.32);
          const rescuer=r.companion.Handle("luo").actor.characterRig.bones,other=side==="L"?"R":"L";
          const otherShoulder=rescuer["upperArm"+other].getWorldPosition(new THREE.Vector3());
          SharedGrasp(hand,shoulder,ArmReach(bones,side),otherShoulder,ArmReach(rescuer,other));
          GraspArm(rescuer,other,otherShoulder,hand);
          hand=rescuer["hand"+other].getWorldPosition(new THREE.Vector3());
        }
        GraspArm(bones,side,shoulder,hand);
      }
      this.supplyRoot.visible=supply;
      if(r.bunkerRifle?.view)r.bunkerRifle.view.visible=!supply;
      if(supply){
        this.loadingRifle.quaternion.copy(cam.quaternion).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),Math.PI/2));
        bones.handL.getWorldPosition(this.loadingRifle.position);
        this.loadingRifle.position.sub(this.loadingRifleGrip.clone().applyQuaternion(this.loadingRifle.quaternion));
        bones.handR.getWorldPosition(this.clips[0].position);this.clips[0].position.y+=.045;this.clips[0].position.z-=.025;
        r.companion.Handle("yaowa").actor.characterRig.bones.handL.getWorldPosition(this.clips[1].position);this.clips[1].position.y+=.04;
      }
    }
    return true;
  }
  VoicePosition(cue,line){const a=line.who==="interpreter"?this.cast.BunkerInterpreter:line.who==="captiveHelper"?this.Helper:line.who==="ijaA"?this.Executioner(0):line.who==="ijaB"?this.Executioner(1):line.who==="runner"?this.cast.BunkerRunner:null;return a?this.r.Point(a.position,1):null;}
  Reset(){this.Dispose();for(const actor of Object.values(this.cast))this.r.ai.Remove(actor);this.cast={};this.captives=[];this.playerBody=null;this.setup=false;this.phase="Supply";this.at=this.r.time;this.started=this.r.time;this.voiceStarted=false;this.interrogationStarted=false;this.rescueVoiceDone=false;this.shotFired=false;this.deflectedShot=false;this.deflectedImpact=null;this.escapeAt=null;this.pointActor=null;this.beats.clear();
    this.strikeAt=null;this.bloodMask=0;this.rifleDrop=null;this.captiveHitAt=null;this.bladeHitAt=null;this.clearAt=null;this.kneelAt=null;
    this.searchVoiceDone=false;this.kickRequested=false;this.ambushRequested=false;this.pullRequested=false;this.cameraFrom=null;this.presentedCamera=null;this.phaseFrom=null;
    for(const actor of [...this.r.squad,...this.r.enemies.values()]){if(actor.openingCombatReleased)actor.missionFireHold=false;actor.openingCombatReleased=false;actor.openingStoryboardLast=null;actor.openingStoryboardPose=null;actor.openingStoryboardTravel=null;actor.openingStoryboardContact=null;actor.openingStoryboardAim=0;}
  }
  State(){return {phase:this.phase,phaseTime:this.Age,ready:this.ready,error:this.error,beats:[...this.beats],captives:this.captives.map(a=>({id:a.missionId,alive:a.alive,x:a.position.x,z:a.position.z})),actors:Object.fromEntries(Object.entries(this.cast).map(([id,a])=>[id,{x:a.position.x,z:a.position.z,clip:a.openingStoryboardPose?.clip}]))};}
  Dispose(){this.ReleaseMeleeDormancy();this.r.hud.SetStoryBlood?.(0);this.supplyRoot?.removeFromParent();this.playerBody?.root.removeFromParent();this.playerBody?.Dispose?.();for(const prop of this.rifleProps)prop.removeFromParent();this.rifleProps=[];for(const material of this.owned)material.dispose();for(const geometry of this.ownedGeometry||[])geometry.dispose();this.owned=[];this.ownedGeometry=[];}
}
