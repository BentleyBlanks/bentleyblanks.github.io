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
const Equip=(soldier,id)=>{if(soldier.actor.weaponId!==id)soldier.actor.SetWeapon(id);};
// Two-bone contact correction for the reclining first-person arms. The baked
// fingers remain intact; shoulders stay behind the eye so no cut sleeve is seen.
function GraspArm(bones,side,shoulder,target){
  const upper=bones["upperArm"+side],lower=bones["forearm"+side],hand=bones["hand"+side];
  const Pos=bone=>bone.getWorldPosition(new THREE.Vector3());
  const lenA=Pos(upper).distanceTo(Pos(lower)),lenB=Pos(lower).distanceTo(Pos(hand));
  const handQ=hand.getWorldQuaternion(new THREE.Quaternion());
  const reach=target.clone().sub(shoulder),excess=reach.length()-(lenA+lenB)*.96;
  if(excess>0)shoulder.addScaledVector(reach.normalize(),excess);
  upper.position.copy(upper.parent.worldToLocal(shoulder.clone()));upper.updateMatrixWorld(true);
  const delta=target.clone().sub(shoulder),distance=Math.min(lenA+lenB-.001,Math.max(.001,delta.length())),dir=delta.normalize();
  const axial=(lenA*lenA+distance*distance-lenB*lenB)/(2*distance);
  const pole=new THREE.Vector3(0,-1,0).addScaledVector(dir,dir.y).normalize();
  const elbow=shoulder.clone().addScaledVector(dir,axial).addScaledVector(pole,Math.sqrt(Math.max(0,lenA*lenA-axial*axial)));
  const Aim=(bone,child,goal)=>{
    const origin=Pos(bone),q=bone.getWorldQuaternion(new THREE.Quaternion());
    const turn=new THREE.Quaternion().setFromUnitVectors(Pos(child).sub(origin).normalize(),goal.clone().sub(origin).normalize());
    bone.quaternion.copy(bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(turn.multiply(q)));bone.updateMatrixWorld(true);
  };
  Aim(upper,lower,elbow);Aim(lower,hand,shoulder.clone().addScaledVector(dir,distance));
  hand.quaternion.copy(hand.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(handQ));hand.updateMatrixWorld(true);
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
        actor.openingStoryboardPose=null;actor.openingStoryboardTravel=null;actor.actor.root.visible=true;
        if(actor.missionEncounter==="bunkerAssault"){actor.scriptEssential=false;actor.scriptedNoncombatant=false;}
      }
      if(this.playerBody)this.playerBody.root.visible=false;
      this.Hide(this.cast.BunkerRunner);
    }
  }
  Set(phase){if(this.phase===phase)return;this.phase=phase;this.at=this.r.time;this.beats.add(phase);this.line=0;}
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
    this.captives=[this.Spawn("BunkerCaptiveHelper","nra",S.captive,{unarmed:true,modelVariant:1})];
    this.Spawn("BunkerInterpreter","ija",S.interpreter,{unarmed:true,actorKind:"nra",modelVariant:1});
    this.Spawn("BunkerRunner","nra",S.runner,{modelVariant:4});
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
    this.r.scene.add(this.playerBody.root);
    this.MakeSupplyProps();
    if(this.r.Has("captivesKilled")){
      this.Mark(this.Helper,S.captive,S.interpreter,"ShotCollapse",1.6);
      this.Helper.scriptEssential=false;this.Helper.TakeHit(200,"torso",null,{kind:"bullet"});
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
    const materials=this.r.actorFactory.ActorMaterials("nra",()=>.5);
    for(const [key,geometry] of built.geometries)this.loadingRifle.add(new THREE.Mesh(geometry,materials[key]||materials.steel));
    this.supplyRoot.add(this.loadingRifle);
  }
  get Helper(){return this.captives[0];}
  get Wounded(){return null;}
  Mark(actor,point,target,clip,seconds=this.Age){
    if(!actor)return;
    actor.openingStoryboardHidden=false;
    const last=actor.openingStoryboardLast;
    actor.openingStoryboardTravel=last&&this.r.time>last.time?Math.min(3,Math.hypot(point.x-last.x,point.z-last.z)/(this.r.time-last.time)):0;
    actor.openingStoryboardLast={...point,time:this.r.time};
    actor.scriptedNoncombatant=true;actor.missionDormant=false;actor.scriptEssential=true;
    this.r.ai.ReleaseCover(actor);this.r.PlaceActor(actor,point);this.r.MoveActor(actor,point,0);
    actor.yaw=Face(point,target);actor.watchYaw=actor.yaw;actor.watchUntil=this.r.ai.time+1;
    actor.openingStoryboardPose=clip?{clip,seconds}:null;
    actor.actor.root.rotation.y=actor.yaw;actor.actor.root.visible=true;
    InstallOpeningStoryboardAnimation(actor);
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
    if(cue==="RescueOut"&&index===2)this.Set("Kick");
    if(cue==="FrontBlockade"){
      this.pointActor=index===0?this.r.opening.zhou:this.r.companion.Handle("luo");this.pointAt=this.r.time;
      InstallOpeningStoryboardAnimation(this.pointActor);
    }
  }
  OnVoiceDone(cue){
    const r=this.r;
    if(cue==="BunkerSearch"){this.Set("Captive");r.Say("BunkerKilling");}
    if(cue==="BunkerKilling"){this.Set("CaptiveShot");}
    if(cue==="RescueCall"){this.Set("Ambush");r.Say("RescueLift");}
    if(cue==="RescueLift"){this.Set("Pull");r.Say("RescueOut");}
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
    const r=this.r,stage=r.flow.stage.id;
    if(!["Trapped","BunkerRescue"].includes(stage)){
      if(stage==="RearTrench"&&this.cast.BunkerInterpreter){this.EscapeGuide(this.cast.BunkerInterpreter,this.Age+4);if(this.Age>3)this.cast.BunkerInterpreter.scriptEssential=false;}
      if(this.pointActor){const elapsed=r.time-this.pointAt,blocker=r.enemies.get("FrontGunner");this.pointActor.openingStoryboardPose=elapsed<3?{clip:"PointBlockade",seconds:elapsed}:null;
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
      this.Mark(luo,S.luoOrder,S.runner,"MessengerReport");
      this.Mark(this.cast.BunkerRunner,Mix({x:S.runner.x,z:S.runner.z-4},S.runner,a/2),S.luoOrder,null);
      this.Hide(one);this.Hide(two);this.Hide(guide);this.Hide(this.Helper);
    }else if(p==="Blast"){
      this.Mark(yaowa,S.yaowa,S.seated,"DuckBlast");
      if(a>=C.wakeS){this.Set("Advance");r.Say("BunkerSearch");}
    }else{
      this.Hide(this.cast.BunkerRunner);
      this.Mark(yaowa,P.bunker.yaowaLift,S.trapped,null);
      this.Mark(wen,{x:-40,z:-118},S.trapped,null);
      this.Mark(he,S.heCover,S.guard,null);
      if(["Advance","Captive","CaptiveShot"].includes(p)){
        this.Mark(one,S.controller,S.captive,"CollarControl");
        this.Mark(two,S.guard,S.captive,"GuardTurn",1.2);
        this.Mark(guide,S.interpreter,S.captive,"InterpreterPoint");
        this.Mark(this.Helper,S.captive,S.interpreter,p==="CaptiveShot"?"ShotCollapse":"CaptiveHeld");
        this.Hide(luo);
        if(p==="CaptiveShot"&&!this.shotFired){this.shotFired=true;this.Shot(one,r.Point(S.captive,.75));}
        if(p==="CaptiveShot"&&a>=1.6){this.Helper.scriptEssential=false;this.Helper.TakeHit(200,"torso",null,{kind:"bullet"});r.Record("captivesKilled",{count:1});this.Set("Discover");r.Say("ShunziCurse");}
      }else if(["Discover","Drag","Butt","Black"].includes(p)){
        const pos=p==="Discover"?Mix(S.controller,S.discover,a/C.discoverS):p==="Drag"?Mix(S.discover,S.interrogator,a/C.dragS):S.interrogator;
        this.Mark(one,pos,S.interrogated,p==="Discover"?"BayonetClearWood":p==="Drag"?"CollarDrag":"ButtThreat");
        this.Mark(two,S.guardNear,S.march[1],null);this.Mark(guide,S.interpreterNear,S.interrogated,"InterpreterPoint");this.Hide(luo);
        if(p==="Discover"&&a>=C.discoverS)this.Set("Drag");
        if(p==="Drag"&&a>=C.dragS)this.Set("Butt");
        if(p==="Butt"&&a>=C.buttS){this.Set("Black");r.audio.Deafen?.(1.1);r.Record("playerButtStruck");}
        if(p==="Black"&&a>=C.strikeBlackS&&r.voice.finished.has("ShunziCurse")){r.Record("doorSearchStarted");}
      }else if(p==="Interrogate"||p==="Creep"){
        this.Mark(one,S.interrogator,S.interrogated,"InterrogateCrouch",r.time-this.started);
        this.Mark(guide,S.interpreterNear,S.interrogated,"InterpreterPoint",r.time-this.started);
        this.Mark(two,S.guardNear,S.march[1],null);
        const crawl=p==="Creep"?Mix(S.luoHidden,S.luoAmbush,a/3):Mix(S.luoRear,S.luoHidden,a/6.5);
        this.Mark(luo,crawl,p==="Creep"?S.luoAmbush:S.luoHidden,"CreepDadao");Equip(luo,"Dadao");
      }else if(p==="Ambush"){
        this.Mark(luo,S.luoAmbush,S.guardNear,"DadaoAmbush");Equip(luo,"Dadao");
        this.Mark(two,S.guardNear,S.march[1],"ShotCollapse",a/.85*1.6);
        this.Mark(one,S.interrogator,S.luoAmbush,"GuardTurn");
        this.EscapeGuide(guide,a);
        if(a>=C.ambushS){this.DropRifle(two);two.scriptEssential=false;const weapon=luo.weapon;luo.weapon=WEAPONS.Dadao;r.meleeCombat.Damage(two,luo,200,"heavy");luo.weapon=weapon;this.Set("Deflect");}
      }else if(p==="Deflect"||p==="Cover"){
        this.Mark(luo,p==="Deflect"?Mix(S.luoAmbush,S.luoDeflect,a/C.deflectS):Mix(S.luoDeflect,S.pullStart,a/1.7),S.interrogated,p==="Deflect"?"RifleDeflect":null);
        this.Mark(one,S.interrogator,{x:-37,z:-130},"GuardTurn");this.EscapeGuide(guide,a+C.ambushS);
        if(p==="Deflect"&&a>.35&&!this.deflectedShot){this.deflectedShot=true;this.Shot(one,r.Point({x:-35.5,z:-130.3},1.05),true);}
        this.UpdateSuppression();
        if(p==="Deflect"&&a>=C.deflectS)this.Set("Cover");
      }else if(p==="Pull"||p==="Kick"){
        Equip(luo,null);
        const pulling=p==="Pull"&&a<=C.pullS;
        const luoPoint=p==="Kick"?S.luoPull:pulling?Mix(S.pullStart,S.pullEnd,a/C.pullS):Mix(S.pullEnd,S.luoPull,(a-C.pullS)/2);
        this.Mark(luo,luoPoint,this.PlayerPoint(),p==="Kick"?"KickRifle":pulling?"PullComrade":null);
        this.Mark(one,Mix(S.interrogator,S.march[1],Clamp((r.time-this.at+2)/5)),S.heCover,null);
        this.EscapeGuide(guide,a+2);this.UpdateSuppression();
        if(p==="Kick"){
          this.MoveRifle(Mix(S.rifleStart,S.rifleEnd,a/C.kickS));
          if(a>=C.kickS&&this.rescueVoiceDone){this.Release();}
        }
      }else if(p==="Released"){
        this.EscapeGuide(guide,a+4);this.UpdateSuppression();
      }
    }
    // The same finite follow-up pair continues forward through the background.
    for(const [i,id] of ["BunkerFollowA","BunkerFollowB"].entries()){
      const actor=r.enemies.get(id);if(!actor)continue;
      if(["Supply","Orders","Blast"].includes(p)){this.Hide(actor);continue;}
      actor.missionDormant=false;actor.scriptedNoncombatant=true;
      const start=S.march[i],end=S.march[2],t=Clamp((r.time-r.opening.blastAt-C.wakeS-i*2)/12);
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
    this.r.scene.add(prop);prop.position.copy(this.r.Point({x:actor.position.x+.35,z:actor.position.z+.15},.08));prop.rotation.set(0,.65,Math.PI/2);
    this.rifleProps.push(prop);Equip(actor,null);
  }
  MoveRifle(point){const item=this.r.bunkerRifle;if(item?.view){const pos=this.r.Point(point);Object.assign(item.position,pos);item.view.position.copy(pos);}}
  Release(){
    const r=this.r;this.Set("Released");r.Record("playerDraggedFromWreck",{to:S.rescued});r.Record("luoRescueComplete");
    const kind=r.controls?.kind;r.controls=null;r.Control?.(false,kind);r.player.stance="crouch";
    r.player.yaw=Math.PI;r.player.pitch=-.35;
    for(const actor of r.squad){actor.openingStoryboardPose=null;actor.openingStoryboardTravel=null;actor.actor.root.visible=true;Equip(actor,actor.weaponId);}
    this.playerBody.root.visible=false;
  }
  UpdateSuppression(){
    const r=this.r,he=r.companion.Handle("heyoutian");if(!he)return;
    he.scriptedNoncombatant=false;r.Defend(he,S.heCover,0,.4);he.watchYaw=Face(S.heCover,S.march[0]);he.watchUntil=r.ai.time+1;
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
    if(p==="Pull"||p==="Kick"){eye=.62;target=p==="Kick"?S.rifleEnd:this.r.companion.Handle("luo").position;height=p==="Kick"?.10:.9;roll=0;}
    cam.position.copy(r.Point(point,eye));cam.lookAt(r.Point(target,height));cam.rotateZ(roll);cam.updateMatrixWorld(true);
    const opening=r.opening;
    opening.eyeClosure=p==="Supply"?1-Smooth((r.time-this.started)/C.fadeInS):p==="Black"?1:p==="Blast"?(a<.25?0:a<2.3?1:1-Smooth((a-2.3)/2)):0;
    opening.blackout=opening.eyeClosure;
    if(p==="Butt"||p==="Black")opening.concussion={amount:.95,focus:.15,pitch:0,roll:0};
    if(this.playerBody){
      const supply=p==="Supply"||p==="Orders",body=this.playerBody.root;
      const bodyYaw=Face(point,target),offset=supply?.12:.5;
      body.visible=this.ready;body.position.copy(r.Point({x:point.x-Math.sin(bodyYaw)*offset,z:point.z-Math.cos(bodyYaw)*offset},supply?-.18:eye-(p==="Kick"?.9:.72)));
      body.rotation.set(0,bodyYaw,0);
      const clip=p==="Supply"||p==="Orders"?"ClipLoad":p==="Blast"?"DuckBlast":p==="Pull"?"SupplyReceive":"WoundedReach";
      this.playerProxy.openingStoryboardPose={clip,seconds:a};this.playerBody.Update(0,{crouch:1,elapsed:r.time});
      if(p==="Pull"&&a<=C.pullS){
        // Keep the authored grasp attached while both actors move towards cover.
        const rescuer=r.companion.Handle("luo").actor.characterRig.bones;
        const forward=cam.getWorldDirection(new THREE.Vector3()),right=new THREE.Vector3(1,0,0).applyQuaternion(cam.quaternion);
        for(const side of ["L","R"]){
          const shoulder=cam.position.clone().addScaledVector(forward,-.12).addScaledVector(right,side==="L"?-.16:.16);shoulder.y-=.28;
          GraspArm(this.playerBody.characterRig.bones,side,shoulder,rescuer[side==="L"?"handR":"handL"].getWorldPosition(new THREE.Vector3()));
        }
      }
      this.supplyRoot.visible=supply;
      if(r.bunkerRifle?.view)r.bunkerRifle.view.visible=!supply;
      if(supply){
        const bones=this.playerBody.characterRig.bones;
        bones.handL.getWorldPosition(this.loadingRifle.position);this.loadingRifle.rotation.set(0,Math.PI/2+body.rotation.y,0);this.loadingRifle.position.y-=.035;
        bones.handR.getWorldPosition(this.clips[0].position);this.clips[0].position.y+=.045;this.clips[0].position.z-=.025;
        r.companion.Handle("yaowa").actor.characterRig.bones.handL.getWorldPosition(this.clips[1].position);this.clips[1].position.y+=.04;
      }
    }
    return true;
  }
  VoicePosition(cue,line){const a=line.who==="interpreter"?this.cast.BunkerInterpreter:line.who==="captiveHelper"?this.Helper:line.who==="ijaA"?this.Executioner(0):line.who==="ijaB"?this.Executioner(1):line.who==="runner"?this.cast.BunkerRunner:null;return a?this.r.Point(a.position,1):null;}
  Reset(){this.Dispose();for(const actor of Object.values(this.cast))this.r.ai.Remove(actor);this.cast={};this.captives=[];this.playerBody=null;this.setup=false;this.phase="Supply";this.at=this.r.time;this.started=this.r.time;this.voiceStarted=false;this.interrogationStarted=false;this.rescueVoiceDone=false;this.shotFired=false;this.deflectedShot=false;this.deflectedImpact=null;this.escapeAt=null;this.pointActor=null;this.beats.clear();}
  State(){return {phase:this.phase,phaseTime:this.Age,ready:this.ready,error:this.error,beats:[...this.beats],captives:this.captives.map(a=>({id:a.missionId,alive:a.alive,x:a.position.x,z:a.position.z})),actors:Object.fromEntries(Object.entries(this.cast).map(([id,a])=>[id,{x:a.position.x,z:a.position.z,clip:a.openingStoryboardPose?.clip}]))};}
  Dispose(){this.supplyRoot?.removeFromParent();this.playerBody?.root.removeFromParent();this.playerBody?.Dispose?.();for(const prop of this.rifleProps)prop.removeFromParent();this.rifleProps=[];for(const material of this.owned)material.dispose();for(const geometry of this.ownedGeometry||[])geometry.dispose();this.owned=[];this.ownedGeometry=[];}
}
