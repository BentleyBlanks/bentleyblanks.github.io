import * as THREE from "three";
import { OPENING_STORYBOARDS as C } from "./Data_OpeningStoryboards.mjs";
import { MISSION_PLACEMENT as P, MISSION_ANCHORS as A } from "./Data_FirstLevelMissionLayout.mjs";
import { MISSION_ENCOUNTERS } from "./Data_FirstLevelMission.mjs";
import { FRONT_SPACE } from "./Data_FirstLevelFrontRoute.mjs";
import { LoadOpeningStoryboardAnimation, InstallOpeningStoryboardAnimation, SetOpeningActorPerformance, ClearOpeningActorPerformance,
  UpdateOpeningStoryboardCorpse, OpeningStage, OpeningClipMeta, OpeningClipRoot, OpeningPlayerPoint, OpeningPropConfig,
  OwnOpeningProp, DropOpeningWeapon, IsOpeningTerminalClip } from "./Script_OpeningStoryboardAnimation.mjs";
import { OpeningPropSet } from "./Script_OpeningProps.mjs";
import { OpeningFirstPerson, TrimOpeningPlayerBody } from "./Script_OpeningFirstPerson.mjs";
import { GearCamera, GearPoint, GearData, GearArrivalS } from "./Script_OpeningFirstPersonGear.mjs";
import { WEAPONS } from "./Data_Weapons.mjs";
import { SpeakingCastOptions } from "./Data_FirstLevelSpeakingCast.mjs";
import { CharacterFacial } from "./Script_CharacterFacialAnimation.mjs";
import { CharacterWounds } from "./Script_CharacterWounds.mjs";
import { MISSION_STAGE_ROUTES } from "./Data_FirstLevelMissionTopology.mjs";
import { MissionRouteProjection, MissionRoutePoint, MissionRouteLength, MissionRouteBetween } from "./Script_FirstLevelMissionColumn.mjs";
import { SampleOpeningPerception } from "./Script_FirstLevelOpening.mjs";
import { BuildSink } from "./Script_World.mjs";
import { InCameraView } from "./Script_FirstLevelBackdropSquads.mjs";
import { OPENING_DEPTH_WALKERS, OPENING_DEPTH_IJA } from "./Data_FirstLevelBackdropSquads.mjs";
import { LoadRelaxedGait, SetRelaxedGait } from "./Script_RelaxedGait.mjs";
// ===========================================================================
// 01–02 director (2026-09-23 draft, docs/Data_FirstLevelOpeningSource20260923.md).
// Contract docs/Data_FirstLevel0105Refactor20260923Contract.md §5.3 phases, §5.4 clips,
// §5.5 dialogue (voice.PlayScene), §2.1 hand-back rule (ijaA/ijaB really cut down, the
// junction man really shot; the fold man and the pursuers may live). Every wait has a
// timeout in Data_OpeningStoryboards.timeouts that forces the physical beat instead of
// skipping it, so the show can never stall. Actors are placed on the manifest's paired
// stages (anchor frame) and walk the trench polylines in the data, never through walls.
// ===========================================================================
const Clamp=v=>Math.max(0,Math.min(1,v));
const Smooth=v=>{v=Clamp(v);return v*v*(3-2*v);};
const Face=(a,b)=>Math.atan2(a.x-b.x,a.z-b.z);
const Distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const Wrap=v=>Math.atan2(Math.sin(v),Math.cos(v));
const DEG=Math.PI/180;
/** [[t, value], …] eased key to key (smoothstep), held past either end. */
const SampleCurve=(keys,t)=>{if(!(t>keys[0][0]))return keys[0][1];for(let i=1;i<keys.length;i++)if(t<keys[i][0])return keys[i-1][1]+(keys[i][1]-keys[i-1][1])*Smooth((t-keys[i-1][0])/(keys[i][0]-keys[i-1][0]));return keys.at(-1)[1];};
const Window=(t,a0,a1,b0,b1)=>Smooth((t-a0)/(a1-a0))*(1-Smooth((t-b0)/(b1-b0)));
const Rot=(yaw,x,z)=>({x:x*Math.cos(yaw)+z*Math.sin(yaw),z:-x*Math.sin(yaw)+z*Math.cos(yaw)});
/** A point in an anchor's frame (+x right, -z forward), yaw offset in degrees (+ = turn left). */
const Local=(anchor,x,z,dyawDeg=0)=>{const o=Rot(anchor.yaw||0,x,z);return {x:anchor.x+o.x,z:anchor.z+o.z,yaw:(anchor.yaw||0)+dyawDeg*DEG};};
/** Freeze the displayed skeleton in world space across a root move this frame: returns the restore. */
const _keepMatrix=new THREE.Matrix4(),_keepLocal=new THREE.Matrix4();
function KeepSkeleton(soldier){
  const rig=soldier?.actor?.characterRig,root=rig?.bones?.pelvis;
  let top=root;while(top?.parent?.isBone)top=top.parent;
  if(!top?.parent)return null;
  top.updateWorldMatrix(true,false);
  const world=top.matrixWorld.clone();
  return()=>{
    soldier.actor.root.updateMatrixWorld(true);
    _keepLocal.copy(top.parent.matrixWorld).invert().multiply(world).decompose(top.position,top.quaternion,top.scale);
    top.updateMatrixWorld(true);
  };
}
/** Authored timing from the clip manifest (Anim package): a contact's time by action, an event's
 *  time by kind, a clip's length. The fallback is the V4 value, used only before the library loads. */
const ContactAt=(clip,action,fallback)=>OpeningClipMeta(clip)?.contacts?.find(c=>c.action===action&&c.t>0)?.t??fallback;
const EventAt=(clip,kind,fallback)=>OpeningClipMeta(clip)?.events?.find(e=>e.kind===kind)?.t??fallback;
const ClipLength=(clip,fallback)=>OpeningClipMeta(clip)?.duration??fallback;
const Equip=(soldier,id)=>{if(soldier&&soldier.actor.weaponId!==id)soldier.actor.SetWeapon(id);};
const RouteLength=route=>route.slice(1).reduce((sum,p,i)=>sum+Distance(route[i],p),0);
/** The point `s` metres along a polyline (from its start; past the end it carries on along the last leg). */
const RoutePointAt=(route,s)=>{
  for(let i=1;i<route.length;i++){const a=route[i-1],b=route[i],d=Distance(a,b),last=i===route.length-1;
    if(s<=d||last){const k=d>0?Math.max(0,last?s/d:Math.min(1,s/d)):1;return {x:a.x+(b.x-a.x)*k,z:a.z+(b.z-a.z)*k};}s-=d;}
  return {x:route[0].x,z:route[0].z};
};
/** Arc length along `route` of the point on it nearest to `p`. */
const RouteProject=(route,p)=>{
  let best=Infinity,at=0,run=0;for(let i=1;i<route.length;i++){const a=route[i-1],b=route[i],dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz)||1e-9;
    const k=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/(len*len))),d=Math.hypot(a.x+dx*k-p.x,a.z+dz*k-p.z);
    if(d<best){best=d;at=run+k*len;}
    run+=len;}
  return at;
};
const TRAPPED=new Set(C.phases.Trapped),RESCUE=new Set(C.phases.BunkerRescue);
const UP=new THREE.Vector3(0,1,0);
// 02 -> 03: the player's way out along the rear trench (return spot ... RC ... SJ ... collection).
const REAR_LANE=MISSION_STAGE_ROUTES.rearTrench,REAR_LANE_M=MissionRouteLength(REAR_LANE);
const OPENING_MARK_STAGES=new Set(["Trapped","BunkerRescue","RearTrench","Support","MachineGun","Tank","Orders"]);
// Player-track owners: the clips whose `player` track says where Shunzi's body is.
const PLAYER_TRACK_CLIPS=new Set(["IjaCrouchHairHold","IjaSlapForehand","IjaSlapBackhand","IjaSlapRaise","IjaHoldCollarUp","LuoDragToCover","LuoKneelCheck","InterpreterCrouchAsk"]);

/** Normalize the random ±4 % body scale: paired contacts are authored at scale 1 (Anim report §3). */
function PinOpeningScale(soldier){
  const actor=soldier?.actor;
  if(!actor||actor.sizeScale===1||!actor.root)return;
  const k=1/actor.sizeScale;
  actor.sizeScale=1;actor.weaponScale=1;actor.height*=k;actor.root.scale.setScalar(1);
  actor.socketScaleStamp=(actor.socketScaleStamp||1)+1;
  // Weapons mounted before the pin keep the old compensation (Script_Actor sets it when it mounts).
  for(const group of [actor.weaponGroup,actor.backDadao])
    if(group?.parent)group.scale.setScalar(actor._SocketScaleCompensation?.(group.parent)??1);
}
// Two-bone correction for the NPC collar hold during the long drags (legacy CollarDrag clip).
function GraspArm(bones,side,shoulder,target){
  const upper=bones["upperArm"+side],lower=bones["forearm"+side],hand=bones["hand"+side];
  if(!upper||!lower||!hand)return;
  const Pos=bone=>bone.getWorldPosition(new THREE.Vector3());
  const lenA=Pos(upper).distanceTo(Pos(lower)),lenB=Pos(lower).distanceTo(Pos(hand));
  const handQ=hand.getWorldQuaternion(new THREE.Quaternion());
  upper.position.copy(upper.parent.worldToLocal(shoulder.clone()));upper.updateMatrixWorld(true);
  const delta=target.clone().sub(shoulder),distance=Math.min(lenA+lenB-.001,Math.max(.001,delta.length())),dir=delta.normalize();
  const axial=(lenA*lenA+distance*distance-lenB*lenB)/(2*distance);
  const pole=new THREE.Vector3(0,-1,0);pole.addScaledVector(dir,-pole.dot(dir)).normalize();
  const elbow=shoulder.clone().addScaledVector(dir,axial).addScaledVector(pole,Math.sqrt(Math.max(0,lenA*lenA-axial*axial)));
  const Aim=(bone,child,goal)=>{
    const origin=Pos(bone),q=bone.getWorldQuaternion(new THREE.Quaternion());
    const turn=new THREE.Quaternion().setFromUnitVectors(Pos(child).sub(origin).normalize(),goal.clone().sub(origin).normalize());
    bone.quaternion.copy(bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(turn.multiply(q)));bone.updateMatrixWorld(true);
  };
  Aim(upper,lower,elbow);Aim(lower,hand,shoulder.clone().addScaledVector(dir,distance));
  hand.quaternion.copy(hand.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(handQ));hand.updateMatrixWorld(true);
}

export class FirstLevelBunkerShow {
  constructor(runtime){
    this.r=runtime;this.captives=[];this.rifleProps=[];this.beats=new Set();this.phase=null;this.at=0;this.cast={};this.ready=false;this.owned=[];
    this.scenes={};this.events=[];this.flags={};
    LoadOpeningStoryboardAnimation().then(()=>this.ready=true).catch(error=>this.error=String(error));
    // The walk with the rifle slung / with no weapon (ijaA, ijaB, the depth Japanese, the interpreter).
    LoadRelaxedGait().catch(error=>{this.gaitError=String(error);});
  }
  Begin(){this.at=this.r.time;this.started=this.r.time;}
  get Age(){return this.r.time-this.at;}
  // 2026-09-27: no cut-away camera any more (user: 「保持第一人称，不在切换视角」); kept for the probes that ask.
  get CinematicActive(){return false;}
  get CameraActive(){return ["Trapped","BunkerRescue"].includes(this.r.flow.stage.id)&&this.phase!=="Released"&&this.phase!=null&&(TRAPPED.has(this.phase)||RESCUE.has(this.phase));}
  // ---- cast -------------------------------------------------------------------------------
  Ija(role){const actor=this.r.enemies.get(C.cast[role]);return actor||null;}
  Squad(id){return this.r.companion?.Handle(id)||null;}
  get Comrade(){return this.cast.comrade||null;}
  get Helper(){return this.cast.comrade||null;}
  Spawn(id,side,point,options={}){
    const actor=this.r.ai.Spawn(side,point.x,point.z,{weapon:"HanYang",scriptedNoncombatant:true,squadId:"OpeningStoryboard",...options});
    if(!actor)throw Error(`Opening storyboard spawn failed: ${id}`);
    actor.missionId=`Opening_${id}`;actor.scriptEssential=true;actor.missionDormant=false;actor.scriptedNoncombatant=true;
    if(options.castId)actor.speakerRole=options.castId;
    PinOpeningScale(actor);
    this.r.MoveActor(actor,actor.position,0);InstallOpeningStoryboardAnimation(actor);return this.cast[id]=actor;
  }
  BloodiedComrade(soldier){
    const actor=soldier?.actor,rig=actor?.characterRig,look=C.comradeBlood;
    if(!rig?.bones?.chest||!rig.root)return false;
    let hasSkin=false;rig.root.traverse(object=>{if(object.isSkinnedMesh)hasSkin=true;});
    if(!hasSkin)return false;
    // The stains are placed on the seated pose they were authored on, but he is unhurt until the shell:
    // they stay hidden (and the face clean, its materials made now) until ComradeBleeds at the black.
    if(CharacterFacial.Of(rig))CharacterFacial.PrepareFaceBlood(rig);
    actor.woundBlood ||= new CharacterWounds(rig.root);
    actor.woundBlood.Hide();
    rig.root.updateWorldMatrix(true,true);
    const rotation=actor.root.getWorldQuaternion(new THREE.Quaternion());
    const forward=new THREE.Vector3(0,0,-1).applyQuaternion(rotation);
    const right=new THREE.Vector3(1,0,0).applyQuaternion(rotation);
    for(const wound of look.wounds){
      const from=rig.bones[wound.from],to=rig.bones[wound.to];
      if(!from||!to)throw Error(`Opening comrade wound missing ${wound.from}/${wound.to}`);
      const point=from.getWorldPosition(new THREE.Vector3()).lerp(to.getWorldPosition(new THREE.Vector3()),wound.t);
      const direction=forward.clone().addScaledVector(right,wound.side||0).normalize();
      point.addScaledVector(direction,wound.frontM).addScaledVector(right,wound.rightM||0);
      if(!actor.woundBlood.Add({part:wound.part,point,direction,preferCloth:true,radiusM:wound.radiusM,ageS:wound.ageS}))
        throw Error(`Opening comrade wound ${wound.from}/${wound.to} found no skin`);
    }
    return true;
  }
  /** The shell has landed on him (from the black on, or any later start): show the stains and the face blood. */
  ComradeBlasted(){
    const order=C.phases.Trapped,at=order.indexOf(this.phase);
    return this.r.flow.stage.id!=="Trapped"||at>order.indexOf("Blast");
  }
  ComradeBleeds(soldier){
    const actor=soldier?.actor,rig=actor?.characterRig;
    if(!actor?.woundBlood)return false;
    actor.woundBlood.Show();
    if(CharacterFacial.Of(rig))CharacterFacial.SetFaceBlood(rig,C.comradeBlood.face);
    return true;
  }
  /** Bunker-assault men arrive through the generic spawner (spawn queue): adopt each once. */
  AdoptAssault(){
    for(const role of ["ijaA","ijaB","ijaC","ijaD"]){
      const actor=this.Ija(role);if(!actor||actor.openingAdopted)continue;
      actor.openingAdopted=true;actor.grenades=0;PinOpeningScale(actor);InstallOpeningStoryboardAnimation(actor);
      if(role==="ijaA")OwnOpeningProp(actor,"bayonet");
      // Before the blast the vanguard is still on the far side of the line.
      if(!this.r.Has("bunkerCollapsed"))this.Hide(actor);
      const spec=MISSION_ENCOUNTERS.bunkerAssault.find(s=>s.id===actor.missionId);
      if(spec?.enter&&!this.r.Has("bunkerCollapsed"))this.Put(actor,{...spec.enter[0],yaw:Face(spec.enter[0],spec.enter[1])});
      else if(["ijaA","ijaB"].includes(role)&&!this.r.Has("bunkerCollapsed"))this.Put(actor,{...C.ija.walkIn[0],yaw:0});
    }
  }
  Setup(){
    if(this.setup)return;this.setup=true;this.setupAt=this.r.time;
    const r=this.r,b=C.banter,stage=r.flow.stage.id;
    this.Spawn("comrade","nra",b.comradeSeat,{...SpeakingCastOptions("comrade")});
    // Set the authored facing before the first pose. The placement is off camera,
    // so it should not preserve the spawner's facing.
    this.Hide(this.cast.comrade);
    this.Put(this.cast.comrade,b.comradeSeat);
    this.Show(this.cast.comrade);
    this.captives=[this.cast.comrade];
    this.Spawn("runner","nra",b.runnerRoute[0],SpeakingCastOptions("runner"));
    this.Spawn("shouter","nra",b.shouter,SpeakingCastOptions("shouter"));
    // NRA06 wears the interpreter's own plain clothes (no uniform tint to override).
    this.Spawn("interpreter","ija",C.ija.interpreterEnter[0],{unarmed:true,actorKind:"nra",...SpeakingCastOptions("interpreter")});
    // He carries no rifle: he walks and trots with his arms free, never in the rifle-at-the-ready gait.
    SetRelaxedGait(this.cast.interpreter,"unarmed");
    for(const actor of r.squad){InstallOpeningStoryboardAnimation(actor);if(["luo","heyoutian"].includes(actor.castId))PinOpeningScale(actor);}
    this.AdoptAssault();
    this.playerBody=r.actorFactory.Create("nra",{weapon:null,modelVariant:1,seed:101});
    this.playerBody.characterRig?.SetHeadVisible?.(false);
    // Arms plus a continuous jacket/pelvis/legs surface on the same skeleton. Only the head is cut;
    // OpeningFirstPerson shows and poses the body surface whenever a leg pose is solved.
    this.ownedGeometry=[...TrimOpeningPlayerBody(this.playerBody).geometries];
    this.playerProxy={actor:this.playerBody};InstallOpeningStoryboardAnimation(this.playerProxy);
    r.scene.add(this.playerBody.root);
    this.MakeSupplyProps();
    this.firstPerson=new OpeningFirstPerson(this);
    if(stage==="Trapped"||stage==="BunkerRescue")this.MoveRifle(C.rescue.rifleMouth,true);
    if(stage==="Trapped"&&!r.Has("bunkerCollapsed")){
      const b=C.banter,trap=C.shunzi.trap;
      for(const [actor,mark,face] of [[this.Squad("yaowa"),b.yaowa,trap],[this.Squad("luo"),b.luo,{x:8,z:-125}],[this.Squad("heyoutian"),b.he,{x:9,z:-125.3}],
        [this.Squad("liuwencai"),b.liu,{x:10,z:-124.4}],[this.cast.shouter,b.shouter,{x:12,z:-122.9}],[this.cast.comrade,b.comradeSeat,null]])
        if(actor)this.Put(actor,{...mark,yaw:mark.yaw??Face(mark,face)});
      // SB01 「纵深有人远去」: three men going up to the front line, backs to the camera (contract §2.3).
      for(const m of OPENING_DEPTH_WALKERS.members)this.Put(this.Spawn(m.id,"nra",m.start),{...m.start,yaw:-Math.PI/2});
      this.Stage("Banter");return;
    }
    // Every start past Orders (a checkpoint after the near miss, a jump into 02 or later) has had the runner's call: 09-29's
    // fact runnerCallHeard and the RunnerCall beat are made true here too, so what waits for them is the same on every path.
    this.NoteRunnerCall({skipped:stage});
    if(stage==="Trapped"){this.Stage("Wake");return;}
    // A checkpoint / stage jump into 02: the 01 aftermath is already true.
    if(stage==="BunkerRescue"){this.StageRescue();return;}
    // A debug start or checkpoint in the withdrawal: the 01–02 cast is already dead, fled or gone.
    this.StageAftermath({fled:true});
    this.phase??="Released";
  }
  /** The 01 aftermath on a start that skipped it: comrade dead at the wall, shouter killed by the
   *  near miss, runner gone with the squad; with fled, the interpreter has run off too. */
  StageAftermath({fled=false}={}){
    const r=this.r,comrade=this.Comrade;
    if(comrade?.alive){
      this.Put(comrade,this.ComradeWallRoot());comrade.scriptEssential=false;
      this.PlayClip(comrade,"CaptiveWallSlideTwitch",{at:r.time-10});this.Kill(comrade);this.Corpse(comrade,"CaptiveWallSlideTwitch");
    }
    this.flags.comradeDead=true;this.flags.flagFallProgress=1;this.r.openingSet?.PoseFlag("flagTrench",1);
    const shouter=this.cast.shouter;
    if(shouter?.alive){this.Put(shouter,{...C.banter.shouter,yaw:Face(C.banter.shouter,C.banter.shellAt)});this.Kill(shouter,"explosion");}
    this.Hide(this.cast.runner);
    if(fled&&this.cast.interpreter){const interp=this.cast.interpreter;interp.scriptEssential=false;this.Hide(interp);r.ai.Remove(interp);delete this.cast.interpreter;this.flags.interpreterGone=true;}
  }
  /** 02 start after a jump: comrade dead against the wall, ijaA squatting at the pinned man's head, the interpreter at
   *  his right front, ijaB watching east. */
  StageRescue(){
    const r=this.r,R=C.rescue;
    this.StageAftermath();
    this.flags.walkOffAt=r.time-10;this.flags.depthIjaAt=r.time-10;
    if(this.cast.interpreter){this.Put(this.cast.interpreter,R.interpreter);this.cast.interpreter.openingWalk={key:"squat",index:0,done:true};}
    for(const role of ["ijaA","ijaB","ijaC","ijaD"])this.Show(this.Ija(role));
    if(this.Ija("ijaA"))this.Put(this.Ija("ijaA"),C.ija.crouch);
    if(this.Ija("ijaB"))this.Put(this.Ija("ijaB"),R.ijaBGuard);
    this.Stage("Hold");
  }
  Stage(phase){this.Set(phase);this.phaseEntered=null;}
  // ---- props ------------------------------------------------------------------------------
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
  /**
   * Furrows in the mud (drag marks behind the knees, claw marks under the fingers): thin ribbons that
   * follow the shared ground sampler, one merged mesh per call, removed on Dispose.
   */
  MudMarks(route,{offsets=[-.17,.17],width=.07,lift=.012}={}){
    const r=this.r,positions=[],index=[];
    for(const offset of offsets){
      const base=positions.length/3;
      for(let i=0;i<route.length;i++){
        const a=route[Math.max(0,i-1)],b=route[Math.min(route.length-1,i+1)],dx=b.x-a.x,dz=b.z-a.z,l=Math.hypot(dx,dz)||1;
        const nx=-dz/l,nz=dx/l,cx=route[i].x+nx*offset,cz=route[i].z+nz*offset;
        for(const side of [-1,1]){const x=cx+nx*width*.5*side,z=cz+nz*width*.5*side;positions.push(x,r.battlefield.GroundHeight(x,z)+lift,z);}
        if(i)index.push(base+(i-1)*2,base+i*2,base+(i-1)*2+1,base+(i-1)*2+1,base+i*2,base+i*2+1);
      }
    }
    if(!index.length)return null;
    const geometry=new THREE.BufferGeometry();geometry.setAttribute("position",new THREE.Float32BufferAttribute(positions,3));
    geometry.setAttribute("uv",new THREE.Float32BufferAttribute(new Float32Array(positions.length/3*2),2));
    geometry.setIndex(index);geometry.computeVertexNormals();
    this.mudMaterial??=new THREE.MeshStandardMaterial({color:0x2a231c,roughness:.95,metalness:0,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});
    if(!this.owned.includes(this.mudMaterial))this.owned.push(this.mudMaterial);
    (this.markSources??=[]).push(geometry);this.ownedGeometry.push(geometry);
    // Static ground decals go through BuildSink like other static geometry (AGENTS §3): all the
    // furrows so far are merged into one mesh (one draw call), rebuilt when one is added.
    for(const mesh of this.marks||[]){mesh.removeFromParent();mesh.geometry.dispose();}
    const sink=new BuildSink();for(const source of this.markSources)sink.Add("OpeningMud",source.clone());
    this.marks=sink.Flush(r.scene,{},{castShadow:false,receiveShadow:true,resolve:()=>this.mudMaterial});
    for(const mesh of this.marks)mesh.name="OpeningMudMarks";
    return this.marks[0]||null;
  }
  /** Remove the furrows (leaving 01–06, Reset, Dispose). */
  ClearMudMarks(){
    for(const mesh of this.marks||[]){mesh.removeFromParent();mesh.geometry.dispose();}
    this.marks=[];this.markSources=[];
  }
  /** Sample a polyline every `step` metres (for the furrows). */
  Densify(route,step=.25){
    const out=[];
    for(let i=1;i<route.length;i++){const a=route[i-1],b=route[i],n=Math.max(1,Math.ceil(Distance(a,b)/step));
      for(let k=i===1?0:1;k<=n;k++)out.push({x:a.x+(b.x-a.x)*k/n,z:a.z+(b.z-a.z)*k/n});}
    return out;
  }
  MoveRifle(point,instant=false){
    const item=this.r.bunkerRifle;if(!item?.view)return;
    const pos=this.r.Point(point,.03);Object.assign(item.position,pos);item.view.position.copy(pos);
    if(point.yaw!=null)item.view.rotation.y=point.yaw;
    const interact=this.r.interact?.points?.get?.("MissionRifle");
    if(interact?.position)interact.position.copy(this.r.Point(point,.6));
    if(instant)this.rifleAt={...point};
  }
  // ---- movement ----------------------------------------------------------------------------
  /** Hidden and held at the point (a hidden squad man is still walked about by the squad AI otherwise). */
  Pin(actor,point){if(!actor)return;this.Hide(actor);this.Put(actor,point);}
  Hide(actor){if(actor){actor.openingStoryboardHidden=true;actor.actor.root.visible=false;actor.openingStoryboardPose=null;}}
  Show(actor){if(actor){actor.openingStoryboardHidden=false;actor.actor.root.visible=true;}}
  /** Teleport a root (only for placements that are out of view or pelvis-continuous by design). */
  Put(actor,point,{noBlend=false,keep:force=false}={}){
    if(!actor)return;
    // A re-root (under 1.5 m: a clip hand-over or a paired stage) keeps the displayed body; a longer
    // Put is a placement (a debug start, an actor brought on out of sight) and is instant.
    // Measured against the director's own last placement: between director frames the (dormant) AI
    // turns the actor toward its last-known position, and treating that as a re-root restarted the pose
    // blend every frame (09-24 review: ijaA frozen and sinking through the ground for all of 02).
    const root=actor.actor?.root,last=actor.openingStoryboardLast,fresh=last&&this.r.time-(last.time??-Infinity)<=.25;
    const from=fresh?last:root?.position,shift=from?Math.hypot(from.x-point.x,from.z-point.z):0;
    const shownYaw=fresh&&Number.isFinite(actor.openingStoryboardYaw)?actor.openingStoryboardYaw:actor.yaw;
    // `keep`: a re-root however far the root is from the body (a long root-motion clip's hand-over).
    // Shown is last frame's final word (MarkNotShown), not root.visible alone: the AI culls against the player's
    // own view before the director runs, so a man in the shot behind the player's back reads hidden here (09-27:
    // the interpreter's Flee hand-over lost its keep and his body swung the clip's 183 deg turn back to the squat).
    const shown=root&&!actor.openingStoryboardHidden&&(root.visible||actor.openingShown);
    const moved=shown&&(force||shift<1.5
      &&(shift>.01||Number.isFinite(point.yaw)&&Math.abs(Wrap(point.yaw-shownYaw))>.01));
    const keep=moved?KeepSkeleton(actor):null;
    this.r.PlaceActor(actor,point);actor.openingStoryboardLast={x:point.x,z:point.z,time:this.r.time};
    if(Number.isFinite(point.yaw)){actor.yaw=point.yaw;actor.actor.root.rotation.y=point.yaw;actor.openingTurnRate=0;}
    actor.openingStoryboardYaw=actor.yaw;
    actor.openingStoryboardTravel=0;actor.openingPace=0;
    if(keep){keep();actor.openingRerooted=true;if(noBlend)actor.openingNoBlend=true;}
  }
  /** A re-root under the pelvis at a root-motion clip's hand-over to the native gait (no pose blend:
   *  the clip ends in the gait it hands to, and a blend would drag the old root offset along). */
  RerootUnderPelvis(actor,yaw){
    const pelvis=actor?.actor?.characterRig?.bones?.pelvis;if(!pelvis)return;
    const at=pelvis.getWorldPosition(new THREE.Vector3());
    this.Put(actor,{x:at.x,z:at.z,yaw},{noBlend:true});
  }
  /** Current clip of an actor and its start time; restarting only when the clip changes. */
  PlayClip(actor,clip,{at=null,restart=false,holdUntil=null,additive=null,offset=0}={}){
    if(!actor)return 0;
    const play=actor.openingPlay;
    if(!play||play.clip!==clip||restart)actor.openingPlay={clip,at:at??this.r.time,holdUntil:null,offset};
    if(holdUntil!=null)actor.openingPlay.holdUntil=holdUntil;
    actor.openingPlay.additive=additive;
    return this.r.time-actor.openingPlay.at+actor.openingPlay.offset;
  }
  ClipAge(actor,clip){return actor?.openingPlay?.clip===clip?this.r.time-actor.openingPlay.at+actor.openingPlay.offset:-1;}
  /**
   * Move a root toward `point` at `speed` along its authored route, turn at
   * turnRps toward `face` (a point, a yaw, or the direction of travel), and pose `clip`.
   * The unpaired interpreter waits at occupied body space. Returns true when within arriveM.
   */
  Move(actor,point,face,clip,speed=C.speed.walk,{seconds=null,upperBody=false,holdUntil=null,additive=null,aim=0,ease=true,remainingM=null,pace:paceSpec=C.pace}={}){
    if(!actor)return false;
    const dt=this.delta||0;
    actor.openingStoryboardHidden=false;actor.actor.root.visible=true;
    // A mark older than a few frames is stale (the squad AI has moved the actor since): walk from where he is.
    const stale=actor.openingStoryboardLast&&this.r.time-(actor.openingStoryboardLast.time??-Infinity)>.25;
    const last=stale?null:actor.openingStoryboardLast,from=last?{x:last.x,z:last.z}:{x:actor.position.x,z:actor.position.z};
    // The facing the director showed last frame (the AI may have turned him since): turn from there.
    if(last&&Number.isFinite(actor.openingStoryboardYaw))actor.yaw=actor.openingStoryboardYaw;
    const distance=Distance(from,point);
    // A free walk accelerates from the pace he had and slows into the route's last mark (C.pace); clip-driven
    // travel (drags, paired stages) and Settle keep their exact speed so partners stay on their contacts.
    let pace=speed;
    if(ease&&!clip&&speed>0&&dt>0){
      const prior=Number.isFinite(actor.openingPace)?actor.openingPace:0,remaining=Number.isFinite(remainingM)?remainingM:distance;
      const want=Math.min(speed,Math.max(paceSpec.minMps,Math.sqrt(2*paceSpec.decelMps2*remaining)));
      pace=prior+Math.max(-paceSpec.decelMps2*dt,Math.min(paceSpec.accelMps2*dt,want-prior));
    }
    const step=Math.min(distance,pace*dt);
    const to=distance>1e-5?{x:from.x+(point.x-from.x)*step/distance,z:from.z+(point.z-from.z)*step/distance}:{x:point.x,z:point.z};
    if(actor===this.cast.interpreter&&step>0)this.AvoidInterpreterOverlap(from,to,actor);
    const travel=dt>0?Distance(from,to)/dt:0;
    actor.openingStoryboardTravel=travel;actor.openingPace=ease&&!clip&&speed>0?pace:travel;
    actor.openingStoryboardLast={...to,time:this.r.time};
    if(actor.alive&&!actor.openingDoomed){
      actor.scriptedNoncombatant=true;actor.missionDormant=false;actor.scriptEssential=true;
      this.r.ai.ReleaseCover(actor);
    }
    this.r.PlaceActor(actor,to);this.r.MoveActor(actor,to,0);
    let desired=actor.yaw;
    if(typeof face==="number")desired=face;
    else if(face&&Distance(to,face)>.02)desired=Face(to,face);
    else if(!face&&distance>.05)desired=Face(from,point);
    // Turn with an angular speed that builds up and eases off into the facing (at most turnRps).
    const error=Wrap(desired-actor.yaw),prior=Number.isFinite(actor.openingTurnRate)?actor.openingTurnRate:0;
    const wanted=Math.sign(error)*Math.min(C.turnRps,Math.sqrt(2*C.turnAccelRps2*Math.abs(error)));
    let rate=prior+Math.max(-C.turnAccelRps2*dt,Math.min(C.turnAccelRps2*dt,wanted-prior)),turn=rate*dt;
    if(Math.abs(turn)>=Math.abs(error)||Math.abs(error)<1e-4){turn=error;rate=0;}
    actor.yaw+=turn;actor.openingTurnRate=rate;
    actor.watchYaw=actor.yaw;actor.watchUntil=this.r.ai.time+1;
    if(clip){
      const age=this.PlayClip(actor,clip,{holdUntil,additive});
      actor.openingStoryboardPose={clip,seconds:seconds??age,upperBody,holdUntil:actor.openingPlay.holdUntil,additive};
    // A man in the relaxed gait stands at ease (RelaxedStand) instead of on guard.
    }else actor.openingStoryboardPose=travel>.1||!actor.actor.weaponId||actor.actor.weaponId==="Dadao"||actor.relaxedGait?null:{clip:"IjaBayonetGuard",seconds:this.r.time};
    actor.openingStoryboardAim=aim;
    actor.actor.root.rotation.y=actor.yaw;actor.openingStoryboardYaw=actor.yaw;
    InstallOpeningStoryboardAnimation(actor);
    return Distance(to,point)<C.arriveM;
  }
  /** Swept body clearance for the unpaired interpreter, including background soldiers.
   * Authored routes provide the passing lane; a blocked step waits instead of tunnelling through a body. */
  AvoidInterpreterOverlap(from,to,actor){
    const inCircle=["Hold","Ask"].includes(this.phase);
    const radius=inCircle?C.rescue.interpreterClearanceM:C.interpreterClearanceM,dx=to.x-from.x,dz=to.z-from.z,len2=dx*dx+dz*dz;
    if(len2<1e-10)return;
    let fraction=1;
    for(const other of new Set([...this.r.enemies.values(),...Object.values(this.cast),...(this.r.backdrop?.members||[]).map(m=>m.actor)])){
      if(!other||other===actor||!other.alive||other.openingStoryboardHidden)continue;
      const at=other.openingStoryboardLast||other.position;
      if(!at||Math.abs((other.position.y||0)-(actor.position.y||0))>1.5)continue;
      const x=from.x-at.x,z=from.z-at.z,b=x*dx+z*dz,c=x*x+z*z-radius*radius;
      if(c<0){if(b<0)fraction=0;continue;}
      const disc=b*b-len2*c;
      if(disc<0||b>=0)continue;
      const contact=(-b-Math.sqrt(disc))/len2;
      if(contact>=0&&contact<fraction)fraction=Math.max(0,contact-.001);
    }
    to.x=from.x+dx*fraction;to.z=from.z+dz*fraction;
    if(fraction<1)this.flags.interpreterBlockedFrames=(this.flags.interpreterBlockedFrames||0)+1;
  }
  /** Stand exactly on a root (stage placements); small offsets are walked, never jumped. */
  Hold(actor,root,clip,options={}){
    const at=actor?.openingStoryboardLast||actor?.position,far=at&&Distance(at,root)>.6;
    const arrived=this.Move(actor,root,far?null:Number.isFinite(root.yaw)?root.yaw:options.face??null,clip,options.speed??C.speed.stroll,options);
    return arrived&&Math.abs(Wrap((root.yaw??actor.yaw)-actor.yaw))<.05;
  }
  /** Follow a polyline (trench legs); `key` keeps the leg index per actor. */
  Follow(actor,key,route,speed,clip=null,faceEnd=null,options={}){
    if(!actor)return false;
    const walk=actor.openingWalk?.key===key?actor.openingWalk:(actor.openingWalk={key,index:0});
    const at=actor.openingStoryboardLast||actor.position;
    while(walk.index<route.length-1&&Distance(at,route[walk.index])<(options.cornerM??.3))walk.index++;
    const last=walk.index===route.length-1;
    let remainingM=Distance(at,route[walk.index]);for(let i=walk.index+1;i<route.length;i++)remainingM+=Distance(route[i-1],route[i]);
    const arrived=this.Move(actor,route[walk.index],last&&Distance(at,route[walk.index])<.3?faceEnd:null,clip,speed,{remainingM,...options});
    return last&&arrived;
  }
  /** Land on a stage root without a jump: an arrival gate leaves up to ~0.15 m, walked here at run speed. */
  Settle(actor,root){
    if(!actor)return;
    const at=actor.openingStoryboardLast||actor.position;
    if(Distance(at,root)<.01){this.Put(actor,root);return;}
    this.Move(actor,root,Number.isFinite(root.yaw)?root.yaw:null,null,C.speed.run,{ease:false});
  }
  /** Stationary pose on the current root (no travel). */
  Pose(actor,clip,options={}){
    if(!actor)return;
    const at=actor.openingStoryboardLast||actor.position;
    return this.Move(actor,{x:at.x,z:at.z},options.face??actor.yaw,clip,0,options);
  }
  /** Pose for the dead: authored terminal clips play on after death (UpdateOpeningStoryboardCorpse). */
  Corpse(actor,clip){
    if(!actor)return;
    const age=this.ClipAge(actor,clip);
    actor.openingStoryboardPose={clip,seconds:Math.max(0,age)};
  }
  /** Where a paired stage puts `role`, given the anchor's world root. */
  StageRoot(stage,role,anchorRoot){
    const actor=OpeningStage(stage)?.actors?.[role];
    return actor?Local(anchorRoot,actor.x,actor.z,actor.yawDeg||0):{...anchorRoot};
  }
  /** Chain a new root when a clip was baked on a different root (pelvis stays put). */
  ChainRoot(root,model,fromClip,toClip){
    const a=OpeningClipRoot(model,fromClip)?.end,b=OpeningClipRoot(model,toClip)?.start;
    if(!a||!b)return {...root};
    const yaw=(root.yaw||0)+(a[2]-b[2])*DEG,pa=Rot(root.yaw||0,a[0],a[1]),pb=Rot(yaw,b[0],b[1]);
    return {x:root.x+pa.x-pb.x,z:root.z+pa.z-pb.z,yaw};
  }
  ComradeWallRoot(){return this.ChainRoot(C.banter.comradeBlast,"TengxianNra02","CaptiveDraggedFromDirt","CaptiveWallBrace");}
  // ---- phases -------------------------------------------------------------------------------
  Set(phase){
    if(this.phase===phase)return;
    const cam=this.presentedCamera||this.r.player.camera;
    this.cameraFrom={position:cam.position.clone(),quaternion:cam.quaternion.clone()};
    this.phase=phase;this.at=this.r.time;this.beats.add(phase);
    this.events.push({phase,time:+this.r.time.toFixed(3),stage:this.r.flow.stage.id});
    if(this.events.length>200)this.events.shift();
  }
  /** Start a per-line dialogue scene on the director's clock; the handle is kept by id. */
  Scene(id,handle){if(handle)this.scenes[id]=handle;this.flags["scene:"+id]=this.r.time;return handle;}
  /** A scene was started (with or without a handle: a missing voice never restarts it every frame). */
  Started(id){return this.flags["scene:"+id]!=null;}
  SceneDone(id){const h=this.scenes[id];return !h||h.done||h.stopped;}
  SceneLine(id){return this.scenes[id]?.playing||[];}
  /**
   * The runner's far call (BunkerRunnerCall) has begun: the moment its first line really starts to play (onLine), and on every
   * path that never plays it (no voice layer; a start, checkpoint or jump past Orders; a blast from Banter / Orders) at the moment
   * that path is taken. Records the fact runnerCallHeard once (frozen name, docs/Data_OpeningStoryboards20260923.md §4b: the
   * battlefield sound comes up on it) and the RunnerCall beat / event once; `flags.runnerCallAt` is its time.
   */
  NoteRunnerCall(detail={}){
    const r=this.r;
    if(!this.beats.has("RunnerCall")){
      this.beats.add("RunnerCall");
      this.events.push({phase:"RunnerCall",time:+r.time.toFixed(3),stage:r.flow.stage.id});
      if(this.events.length>200)this.events.shift();
    }
    this.flags.runnerCallAt??=r.time;
    if(r.Has("runnerCallHeard"))return false;
    const runner=this.cast.runner,seat=C.shunzi.seat,at=runner&&!runner.openingStoryboardHidden?runner.openingStoryboardLast||runner.position:null;
    return r.Record("runnerCallHeard",{...detail,distM:at?+Distance(at,seat).toFixed(1):null});
  }
  /** The runner is within `metres` of the seat (the listener), on the plane. */
  RunnerWithin(metres){
    const runner=this.cast.runner;if(!runner||runner.openingStoryboardHidden)return false;
    return Distance(runner.openingStoryboardLast||runner.position,C.shunzi.seat)<=metres;
  }
  Speakers(){
    const who=role=>()=>this.HeadPoint(this.SpeakerActor(role));
    const out={};for(const role of ["luo","yaowa","heyoutian","liuwencai","comrade","runner","shouter","interpreter","ijaA","ijaB","ijaC","ijaD","guard"])out[role]=who(role);
    return out;
  }
  HeadPoint(actor){
    if(!actor)return null;
    // Culled by the AI (renderLod not "detail"): the anim layer is skipped and the head bone is wherever he was
    // last shown (09-24: He's backup shot at the junction was traced from a stale head and hit the spoil).
    if(actor.renderLod&&actor.renderLod!=="detail"&&actor.position)return this.r.Point(actor.position,C.culledHeadM);
    return (actor.actor?.characterRig?.bones.head||actor.actor?.head)?.getWorldPosition(new THREE.Vector3())||null;
  }
  /** Estimated start of a line inside its scene (manifest durations and gaps; direction offsets). */
  LineStart(sceneId,lineId){
    const lines=this.r.voice?.manifest?.lines||{};let t=0;
    for(let n=1;;n++){
      const id=`${sceneId}.${String(n).padStart(2,"0")}`,entry=lines[id];
      if(n>1)t+=entry?.gapBeforeS??.3;
      if(id===lineId)return t;
      if(!entry&&n>20)return t;
      t+=entry?.seconds??1.5;
    }
  }
  SceneLength(sceneId){
    const lines=this.r.voice?.manifest?.lines||{};let t=0;
    for(let n=1;n<40;n++){const entry=lines[`${sceneId}.${String(n).padStart(2,"0")}`];if(!entry)break;t+=(n>1?entry.gapBeforeS??.3:0)+entry.seconds;}
    return t||6;
  }
  OnLine(cue,index,who=null){
    // 03 FrontBlockade: whoever calls the blockade points at it (a per-line scene says who; the legacy whole cue
    // is looked up by index). Only while this director runs the squad (a cold start at 03 never set it up).
    if(cue==="FrontBlockade"&&this.setup){
      const current=this.r.voice?.current?.cue;
      this.pointActor=this.SpeakerActor(who??(current?.id===cue?current.lines[index]?.who:null));this.pointAt=this.r.time;
      InstallOpeningStoryboardAnimation(this.pointActor);
    }
  }
  OnVoiceDone(){}
  /** Near miss outside the mouth: fired by BunkerIncoming's cut (voice event BunkerBlast). */
  Blast(){
    if(!["Banter","Orders","Incoming"].includes(this.phase))return;
    const r=this.r,b=C.banter;
    this.NoteRunnerCall({skipped:this.phase});   // a blast from Banter / Orders (a debug or timeout path) skipped the call
    this.blastFrom=this.FollowPoint();
    this.Stage("Blast");
    r.voice?.Signal?.("Blast");
    // The shouter outside dies when the shell lands, not when it is fired: that is also 0.22 s later than the
    // frame that fires it, which already pays the collapse and the story tinnitus (09-27 stutter review).
    // PhaseBlast still kills him before the black if the shell never reports an impact.
    const shouter=this.cast.shouter;
    r.combat?.FireShell(r.Point(b.shellFrom,14),r.Point(b.shellAt),{flight:b.blastShot.fallStartS,damage:0,radius:4,incoming:false,feedbackOnly:true,
      OnImpact:()=>this.ShouterDown(shouter)});
    // The dirt and timber coming down on him is PhaseBlast's (blastShot.debrisS): after the explosion, not before it.
  }
  ShouterDown(shouter=this.cast.shouter){
    if(shouter?.alive&&shouter===this.cast.shouter&&["Blast","Black"].includes(this.phase))this.Kill(shouter,"explosion");
  }
  UpdateBunker(){ /* Driven after UpdateSquad by FrontShow.Update. */ }
  Update(dt){
    this.delta=dt;
    const r=this.r,stage=r.flow.stage.id;
    if(this.CameraActive){
      if(!this.savedMeleeDormancy){this.playerMeleeDormancy=r.player.meleeDormant;this.savedMeleeDormancy=true;}
      r.player.meleeDormant=true;
    }else this.ReleaseMeleeDormancy();
    // The blow's blood layer: full for holdS, settles to `settle` over settleS (SB04A: about 0.3), then fades out.
    const bloodAge=this.strikeAt==null?Infinity:r.time-this.strikeAt,SB=C.strikeBlood;
    this.bloodMask=(SB.opacity+(SB.settle-SB.opacity)*Smooth((bloodAge-SB.holdS)/SB.settleS))*(1-Smooth((bloodAge-SB.holdS-SB.settleS)/SB.fadeS));
    r.hud.SetStoryBlood?.(this.bloodMask);
    if(!this.ready)return;
    if(["Trapped","BunkerRescue","RearTrench"].includes(stage)||this.setup)this.Setup();
    if(!this.setup)return;
    this.AdoptAssault();
    if(stage==="Trapped"||stage==="BunkerRescue"){
      if(this.phase==null)this.Stage("Banter");
      const handler=this["Phase"+this.phase];
      if(handler)handler.call(this,this.Age);
      this.Background();
    }else{
      this.Aftermath(stage);
    }
    this.UpdatePursuit();
    this.UpdatePerformances();
    // The actor's first animation pass follows Setup. Lay the (hidden) blood onto the
    // already posed uniform on the next frame, while the opening is still fading in.
    if(!this.flags.comradeBloodied&&r.time-this.setupAt>=.1)
      this.flags.comradeBloodied=this.BloodiedComrade(this.cast.comrade);
    // He is unhurt until the shell: the blood shows in the black after it (unseen).
    if(this.flags.comradeBloodied&&!this.flags.comradeBled&&this.ComradeBlasted())
      this.flags.comradeBled=this.ComradeBleeds(this.cast.comrade);
    // Outside the director's shots the AI's own cull is the frame's last word.
    if(!this.CameraActive)this.MarkNotShown();
  }
  /**
   * After this frame's final cull. The AI animates only actors whose root is visible, and culling takes it out
   * of the scene: an actor the director is posing keeps animating off screen (root visible but detached, so
   * nothing is drawn -- the carriage passengers' rule in Script_Ai), so the frame he comes into shot shows his
   * current pose, not the one he had when he left it. Anyone else the cull left out is flagged for the anim
   * layer (openingNotShown: no blend from, no re-root against, the last place he was seen).
   */
  MarkNotShown(){
    for(const actor of [...Object.values(this.cast),...this.r.squad,...this.r.enemies.values()]){
      // The director is done moving roots for this frame: remember the parent as it will be shown.
      if(actor&&!actor.openingStoryboardHidden)actor.actor?.characterRig?.openingRememberShown?.();
      if(actor?.renderLod&&actor.renderLod!=="detail"){
        const posed=actor.alive&&!actor.openingStoryboardHidden&&(actor.openingStoryboardPose||actor.openingStoryboardTravel!=null);
        if(posed)actor.actor.root.visible=true;else actor.openingNotShown=true;
      }
      // What Put takes as "on screen" next frame, before the AI's cull against the player's own view.
      if(actor?.actor?.root)actor.openingShown=actor.actor.root.visible;
    }
  }
  // -- 01 -------------------------------------------------------------------------------------
  Tableau(){
    const r=this.r,b=C.banter,luo=this.Squad("luo"),yaowa=this.Squad("yaowa"),he=this.Squad("heyoutian"),liu=this.Squad("liuwencai");
    const comrade=this.Comrade,trap=C.shunzi.trap;
    for(const role of ["ijaA","ijaB","ijaC","ijaD"])this.Hide(this.Ija(role));
    this.Hide(this.cast.interpreter);this.Hide(this.cast.runner);
    Equip(yaowa,"HanYang");
    this.Hold(yaowa,b.yaowa,"YaowaSitLoad");
    this.Hold(luo,b.luo,"LuoKneelCheck",{seconds:b.luoKneelS});
    this.DepthWalkers();
    this.Hold(he,{...b.he,yaw:-Math.PI/2},null);
    this.Hold(liu,{...b.liu,yaw:-Math.PI/2},null);
    this.Hold(this.cast.shouter,{...b.shouter,yaw:-Math.PI/2},null);
    const add=this.flags.comradeAdditive;
    this.Hold(comrade,b.comradeSeat,"WoundedSitRifleIdle",{additive:add&&r.time-add.at<add.length?{clip:add.clip,seconds:r.time-add.at,weight:1}:null});
  }
  PhaseBanter(age){
    const r=this.r;
    if(!this.phaseEntered){
      this.phaseEntered=true;this.started=r.time;
      // 「画面渐亮……一声闷响过后，几块土掉进顺子衣领。他缩起脖子，伸手往外掏。」 The picture comes up first;
      // the dirt falls once it is up, and his first line comes while he digs it out of the collar.
      this.flags.dirtAt=r.time+C.banter.dirtS;this.flags.banterAt=this.flags.dirtAt+C.banter.lineAfterDirtS;
      this.banterLength=this.SceneLength("BunkerBanter");
    }
    if(this.flags["scene:BunkerBanter"]==null&&r.time>=this.flags.banterAt){
      const Additive=(clip,length)=>{this.flags.comradeAdditive={clip,at:r.time,length};};
      this.Scene("BunkerBanter",r.voice?.PlayScene("BunkerBanter",{speakers:this.Speakers(),onLine:(lineId)=>{
        if(lineId==="BunkerBanter.04")Additive("BanterLaugh",1.6);
        if(lineId==="BunkerBanter.10")Additive("BanterLookShoulder",2.2);
        if(lineId==="BunkerBanter.14"){Additive("BanterPatRifle",2);this.flags.laughAt=r.time+1.4;}
      }}));
    }
    this.Tableau();
    const hand=this.firstPersonState?.hands?.r;
    if(this.flags.dirtDone&&!this.flags.dirtOut&&r.time>=this.flags.dirtAt+1.6&&hand?.palm){
      this.flags.dirtOut=true;
      r.vfx?.Impact?.(new THREE.Vector3(...hand.palm),new THREE.Vector3(.3,-1,0).normalize(),"dirt");
    }
    if(!this.flags.dirtDone&&r.time>=this.flags.dirtAt){
      this.flags.dirtDone=true;
      const at=r.Point(C.shunzi.trap,1.1);r.vfx?.Impact?.(at,new THREE.Vector3(0,-1,0),"dirt");
      r.audio?.Play?.("debrisFall",{position:at,volume:.35});
    }
    const lead=C.banter.dirtS+C.banter.lineAfterDirtS;
    if(this.flags["scene:BunkerBanter"]!=null&&this.SceneDone("BunkerBanter")&&age>lead+1||age>lead+this.banterLength+C.timeouts.banterExtraS)this.Stage("Orders");
  }
  PhaseOrders(age){
    const r=this.r,b=C.banter,luo=this.Squad("luo"),yaowa=this.Squad("yaowa"),he=this.Squad("heyoutian"),liu=this.Squad("liuwencai");
    const comrade=this.Comrade,runner=this.cast.runner,trap=C.shunzi.trap;
    if(!this.phaseEntered){this.phaseEntered=true;this.flags.exitAt=null;this.Show(runner);}
    for(const role of ["ijaA","ijaB","ijaC","ijaD"])this.Hide(this.Ija(role));
    this.DepthWalkers();
    const post=b.runnerRoute.at(-1),seat=C.shunzi.seat,call=b.runnerCall;
    // 2026-09-29 (user: 「传令兵应该是老远就喊话（玩家就能听到），然后在地道门外就和班长可以说话了」): the runner is on the run from
    // the first frame of Orders, 23 m off in the rear trench; call.afterS in, Banter's last line long over, he calls out to
    // Luo (BunkerRunnerCall, from his own moving head: heard in the dugout at that distance). The moment line 1 really begins
    // is the fact runnerCallHeard (and the RunnerCall beat); line 2 waits until he is within call.secondWithinM of the seat.
    if(this.flags.exitAt==null&&!this.Started("BunkerRunnerCall")&&age>=call.afterS){
      const handle=r.voice?.PlayScene("BunkerRunnerCall",{speakers:this.Speakers(),gate:(lineId)=>lineId!=="BunkerRunnerCall.02"||this.RunnerWithin(call.secondWithinM),
        onLine:(lineId)=>{if(lineId==="BunkerRunnerCall.01")this.NoteRunnerCall({line:lineId});else this.flags.walkersAt??=r.time;}});
      this.Scene("BunkerRunnerCall",handle);
      // No voice layer to say it: the call still counts, at the moment it would have opened.
      if(!handle)this.NoteRunnerCall({line:null});
    }
    // BunkerOrders.01 is shouted at Luo (「班长！……」), not at the camera: the runner turns to Luo's back from outside the mouth
    // (09-29: he stops on the trench floor beside Luo instead of running in). Luo keeps looking down the front trench while he
    // thinks it over (.02–.04, Yaowa asks in between; user 09-27: he must not order the instant he hears it) and only turns
    // round to the room with the order itself (.05).
    const runnerIn=this.flags.exitAt==null&&this.Follow(runner,"orders",b.runnerRoute,C.speed.run,null,b.luo);
    if(this.flags.exitAt==null){
      if(runnerIn||Distance(runner.position,post)<.4)this.Hold(runner,{...post,yaw:Face(post,b.luo)},"MessengerReport");
      if(runnerIn){this.flags.runnerInAt??=r.time;this.flags.walkersAt??=r.time;}
      // He reports the moment he is at the post; the far call's last line is let finish first, but never held past holdMaxS.
      const callDone=this.Started("BunkerRunnerCall")&&this.SceneDone("BunkerRunnerCall");
      const arrived=runnerIn&&(callDone||r.time-this.flags.runnerInAt>=call.holdMaxS);
      if(!this.Started("BunkerOrders")&&(arrived||age>C.timeouts.runnerArriveS)){
        this.flags.runnerInAt??=r.time;this.flags.walkersAt??=r.time;   // (the timeout path)
        this.scenes.BunkerRunnerCall?.Stop();
        this.Scene("BunkerOrders",r.voice?.PlayScene("BunkerOrders",{speakers:this.Speakers(),onLine:(lineId)=>{if(lineId==="BunkerOrders.05")this.flags.luoTurnAt=r.time;}}));
      }
      // Kneeling, looking out, while he thinks it over; up, round to the room and pointing with the order.
      if(this.flags.luoTurnAt==null)this.Hold(luo,b.luo,"LuoKneelCheck",{seconds:b.luoKneelS});
      else this.Hold(luo,{...b.luo,yaw:Face(b.luo,seat)},"PointBlockade",{upperBody:true});
      this.Tableau2(yaowa,he,liu,comrade);
      if(this.Started("BunkerOrders")&&this.SceneDone("BunkerOrders"))this.flags.exitAt=r.time;
      if(age>C.timeouts.runnerArriveS+this.SceneLength("BunkerOrders")+C.timeouts.ordersSlackS)this.flags.exitAt??=r.time;
      return;
    }
    // Everyone leaves by the mouth and the south-south-west leg; they disappear beyond RC.
    const since=r.time-this.flags.exitAt;
    this.GearCues();
    for(const [id,actor,delay,speed] of [["luo",luo,0,C.speed.walk],["runner",runner,.2,C.speed.run],["yaowa",yaowa,.5,C.speed.walk],
      ["he",he,.9,C.speed.walk],["liu",liu,1.3,C.speed.walk]]){
      if(!actor)continue;
      if(since<delay){this.Pose(actor,null);continue;}
      // The runner leaves from his post outside the mouth (banter.runnerExitRoute), not from the mouth like the others.
      if(this.Follow(actor,"exit",id==="runner"?b.runnerExitRoute:b.exitRoute,speed,null))this.Hide(actor);
    }
    Equip(yaowa,yaowa?.weaponId||"HanYang");
    // The wounded comrade braces on the wall, stands (rise clip), then squeezes out of the mouth.
    const rise=since-.4;
    if(rise<0)this.Hold(comrade,b.comradeSeat,"WoundedSitRifleIdle");
    else if(rise<2.8)this.Pose(comrade,"WoundedRiseWall");
    else{
      if(!this.flags.comradeStood){this.flags.comradeStood=true;this.RerootUnderPelvis(comrade,this.ChainRoot(b.comradeSeat,"TengxianNra02","WoundedRiseWall","MessengerReport").yaw);}
      if(this.Hold(comrade,b.comradeBlast,null,{speed:C.speed.walk})||since>C.timeouts.ordersExitS)this.Stage("Incoming");
    }
  }
  Tableau2(yaowa,he,liu,comrade){
    const b=C.banter,trap=C.shunzi.trap;
    Equip(yaowa,"HanYang");
    this.Hold(yaowa,b.yaowa,"YaowaSitLoad");
    this.Hold(he,{...b.he,yaw:-Math.PI/2},null);this.Hold(liu,{...b.liu,yaw:-Math.PI/2},null);
    this.Hold(comrade,b.comradeSeat,"WoundedSitRifleIdle");
    this.Hold(this.cast.shouter,{...b.shouter,yaw:-Math.PI/2},null);
  }
  PhaseIncoming(age){
    const r=this.r,b=C.banter;
    if(!this.phaseEntered){
      this.phaseEntered=true;
      // Straight into Incoming (a stage jump): the gear-up is done, he is at the mouth with the pack on and the rifle at the ready;
      // the runner has come and gone.
      this.flags.exitAt??=r.time-GearData().doneS;
      this.NoteRunnerCall({skipped:"Incoming"});
      this.Scene("BunkerIncoming",r.voice?.PlayScene("BunkerIncoming",{speakers:this.Speakers()}));
    }
    this.Hold(this.Comrade,b.comradeBlast,null);
    this.Hold(this.cast.shouter,{...b.shouter,yaw:Face(b.shouter,b.shellFrom)},null);
    this.GearCues();
    this.ExitSquad();this.DepthWalkers();
    // BunkerIncoming.01 is cut by the blast (its cutEvent BunkerBlast reaches FirstLevelOpening).
    if(age>C.timeouts.blastEventS){if(r.opening.blastAt!=null||r.opening.bunker?.blastAt!=null)this.Blast();else r.opening.BunkerBlast();}
  }
  ExitSquad(){
    const b=C.banter;
    for(const [id,actor,speed] of [["luo",this.Squad("luo"),C.speed.walk],["runner",this.cast.runner,C.speed.run],["yaowa",this.Squad("yaowa"),C.speed.walk],
      ["he",this.Squad("heyoutian"),C.speed.walk],["liu",this.Squad("liuwencai"),C.speed.walk]]){
      if(!actor||actor.openingStoryboardHidden)continue;
      if(this.Follow(actor,"exit",id==="runner"?b.runnerExitRoute:b.exitRoute,speed,null))this.Hide(actor);
    }
  }
  /** SB01's men going up to the front (Data_FirstLevelBackdropSquads.OPENING_DEPTH_WALKERS): standing in the
   *  trench facing east during the talk, walking off east from Orders + delayS, retired at the end of the route
   *  once out of the shot (at the latest in the black after the blast). */
  DepthWalkers(){
    // 2026-09-29: Orders now opens with the runner still 23 m out (banter.runnerCall), so they are clocked on his second call
    // (flags.walkersAt: line 2 opening, or his arrival if that comes first), not on Orders' start: they set off delayS after it
    // and are 3 s under way when he reports, as before (the old runner took 4.4 s to arrive, they left 1.4 s in).
    const D=OPENING_DEPTH_WALKERS,setOff=this.flags.walkersAt,
      go=this.phase==="Banter"?-1:this.phase==="Orders"?(setOff==null?-1:this.r.time-setOff-D.delayS):Infinity;
    D.members.forEach((m,i)=>{
      const actor=this.cast[m.id];if(!actor)return;
      if(go<i*D.staggerS){this.Hold(actor,{...m.start,yaw:-Math.PI/2},null);return;}
      if(!this.Follow(actor,"depth",m.route,D.speedMps,null))return;
      if(!InCameraView(this.r.player.camera,this.r.Point(actor.position,1),10))this.RetireWalker(m.id);
      else this.Pose(actor,null);
    });
  }
  RetireWalker(id){
    const actor=this.cast[id];if(!actor)return;
    this.Hide(actor);actor.scriptEssential=false;this.r.ai.Remove(actor);delete this.cast[id];
  }
  /** Seconds since Luo's order (flags.exitAt), the clock of the gear-up (Data_OpeningFirstPersonGear); null before it. */
  FollowAge(){const at=this.flags.exitAt;return at==null||!["Orders","Incoming","Blast"].includes(this.phase)?null:this.r.time-at;}
  /** The gear-up's sounds (Data_OpeningFirstPersonGear.cues: cloth, buckles, rifle, strides), each once when its time comes. A start
   *  in the middle of the action (a stage jump into Incoming) skips those already past. */
  GearCues(){
    const at=this.flags.exitAt;
    if(at==null)return;
    const t=this.r.time-at,cues=GearData().cues;
    if(this.gearCueFor!==at){this.gearCueFor=at;this.gearCueIndex=cues.findIndex(c=>c[0]>t-.25);if(this.gearCueIndex<0)this.gearCueIndex=cues.length;}
    while(this.gearCueIndex<cues.length&&cues[this.gearCueIndex][0]<=t){
      const [,cue,volume,pitch]=cues[this.gearCueIndex++];
      this.r.audio?.Play?.(cue,{volume,pitch});
    }
  }
  /** What the gear-up's eye path needs: where he sat, where he runs to, how high the seated eye was. */
  GearContext(){const S=C.shunzi;return {seat:S.seat,followTo:S.followTo,seatEyeM:this.seatEyeM??S.seatEyeM};}
  /** 「弹装起！往后沟撤！跟紧！」: from the order on he gears up and hurries to the mouth (seat -> pack -> followTo). */
  FollowPoint(t=this.FollowAge()){
    if(t==null)return C.shunzi.seat;
    return GearPoint(t,this.GearContext());
  }
  /** The look while he gears up and runs: the gear-up's own heading / pitch / height / roll, then (once he is on his way, from
   *  lookOutS) eased to the men going out of the mouth (in Incoming the wounded comrade squeezing out). */
  FollowShot(){
    const r=this.r,b=C.banter,G=GearData(),t=this.FollowAge()??0;
    const cam=GearCamera(t,this.GearContext()),eye={x:cam.x,z:cam.z};
    const comrade=this.Comrade,out=r.Point(b.exitRoute[0],1.1);
    if(this.phase==="Incoming"&&comrade?.alive)out.lerp(r.Point(comrade.position,1.2),Smooth(this.Age/.8));
    const target=this.Aim(eye,cam.height,cam.yaw,cam.pitch).lerp(out,Smooth((t-G.cam.lookOut[0])/G.cam.lookOut[1]));
    return {eye,height:cam.height,target,pitch:0,roll:cam.roll,turnRps:G.turnRps};
  }
  /** SB02: the eye knocked down from where he had followed to (blastFrom) onto shunzi.blastFall over the fall. */
  BlastPoint(){
    const B=C.banter.blastShot,from=this.blastFrom||C.shunzi.followTo,to=C.shunzi.blastFall;
    const f=Smooth(((this.phase==="Blast"?this.Age:B.fallEndS)-B.fallStartS)/(B.fallEndS-B.fallStartS));
    return {x:from.x+(to.x-from.x)*f,z:from.z+(to.z-from.z)*f};
  }
  /** A look from the eye toward `point` with its pitch held in [minDeg, maxDeg] (a man leaning over the low eye). */
  LookClamped(eye,height,point,minDeg,maxDeg){
    const e=this.r.Point(eye,height),elev=Math.atan2(point.y-e.y,Math.hypot(point.x-e.x,point.z-e.z));
    return this.Aim(eye,height,Face(eye,point),Math.min(maxDeg*DEG,Math.max(minDeg*DEG,elev)));
  }
  /**
   * LookClamped at `actor`'s head, the bearing taken from his hips with the head counting only as it comes into the
   * picture's height (bodyLook). Crouched over the lying eye his head is right above it, where a few cm swing its
   * bearing through tens of degrees (09-27: 30-60 deg shakes over Found's landing and the collar drag; standing up to
   * vault out his head passed 3 cm over the eye and flipped the bearing 150 deg in two frames). The hips stay 0.3 m and
   * more off the eye and turn smoothly.
   */
  LookAtBody(eye,height,actor,minDeg,maxDeg){
    const head=this.HeadPoint(actor);if(!head)return null;
    const pelvis=(!actor.renderLod||actor.renderLod==="detail")&&actor.actor?.characterRig?.bones?.pelvis?.getWorldPosition(new THREE.Vector3());
    const B=C.bodyLook,e=this.r.Point(eye,height),elev=Math.atan2(head.y-e.y,Math.hypot(head.x-e.x,head.z-e.z));
    const w=pelvis?B.headWeight*Clamp((B.headInDeg-elev/DEG)/B.fadeDeg):1,hips=pelvis?Face(eye,pelvis):Face(eye,head);
    return this.Aim(eye,height,hips+Wrap(Face(eye,head)-hips)*w/(1+w),Math.min(maxDeg*DEG,Math.max(minDeg*DEG,elev)));
  }
  /** A look target from an eye at yaw / pitch (radians, three.js: yaw 0 north, -PI/2 east; pitch + up). */
  Aim(eye,height,yaw,pitch){
    return this.r.Point(eye,height).add(new THREE.Vector3(-Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),-Math.cos(yaw)*Math.cos(pitch)));
  }
  /** SB01's look from the seat (the player's own look is laid over it; 09-27: no turn to whoever speaks). */
  SeatAim(eye,height,pitch){return this.Aim(eye,height,C.banter.seatShot.yawDeg*DEG,pitch);}
  /** The seated eye: the fill clip's (over shunzi.seat, ~0.7 m up), else the old fixed seat eye. Remembered for FollowShot. */
  SeatEye(){
    const S=C.shunzi,e=this.playerBody?this.firstPerson?.PoseFill(this.r.time):null;
    if(!e)return {eye:S.seat,height:S.seatEyeM};
    const eye={x:e.x,z:e.z},height=e.y-this.r.battlefield.GroundHeight(e.x,e.z);
    this.seatEyeM=height;return {eye,height};
  }
  /** Sitting in the dugout (Banter, Orders until Luo's order): the player looks round freely. */
  Seated(){return this.phase==="Banter"||this.phase==="Orders"&&this.flags.exitAt==null;}
  /** The player's look limits about the control's look (rad, {yaw:[min,max], pitch:[min,max]}) while seated, else null:
   *  the mission runtime's trapped clamp takes them (Script_FirstLevelMissionRuntime.BeforePlayer). */
  LookLimits(){
    if(!this.CameraActive||!this.Seated())return null;
    const W=C.firstPerson.headLook.seated;
    return {yaw:[-W.yawRad,W.yawRad],pitch:W.pitchRad};
  }
  PhaseBlast(age){
    const comrade=this.Comrade,Q=C.banter.blastShot,landed=age>=Q.fallStartS;
    this.phaseEntered=true;
    // Blast() fires the shell; nothing it does happens before it lands at fallStartS (user 09-27: the timber broke
    // before the shell was heard). Then the comrade is thrown into the wall and the rifle knocked out of his hands.
    if(landed&&!this.flags.blastLanded){
      this.flags.blastLanded=true;this.PlayClip(comrade,"BlastSlamBuried",{restart:true});this.MoveRifle(C.rescue.rifleMouth,true);
    }
    // What the blast throws down on him (dirt, the broken timber) is heard after the explosion.
    if(!this.flags.blastDebris&&age>=Q.debrisS){
      this.flags.blastDebris=true;this.r.audio?.Play?.("debrisFall",{position:this.r.Point(C.shunzi.trap,1),volume:.9});
    }
    if(landed){this.Put(comrade,C.banter.comradeBlast);this.Pose(comrade,"BlastSlamBuried");}
    else this.Hold(comrade,C.banter.comradeBlast,null);
    // The loose timber lands on his pack in the mouth, where he lies from the black on (not before his eyes).
    this.ExitSquad();this.DepthWalkers();
    if(age>=C.banter.blastShot.phaseS){this.ShouterDown();this.Stage("Black");}
  }
  /** Stunned in the heap from the landing to the drag: BlastSlamBuried plays out, then the BlastDazedStir loop
   *  (its frame 0 and last frame are the heap, CaptiveDraggedFromDirt frame 0). */
  ComradeDazed(){
    const comrade=this.Comrade;if(!comrade)return;
    const slam=this.ClipAge(comrade,"BlastSlamBuried");
    this.Pose(comrade,slam>=0&&slam<ClipLength("BlastSlamBuried",1.5)?"BlastSlamBuried":"BlastDazedStir");
  }
  /** At the cut into the drag shot: restart the loop so a loop end lands exactly on dragStart (hidden by the cut). */
  AlignDazed(){
    const comrade=this.Comrade,length=ClipLength("BlastDazedStir",6.4),left=this.flags.dragStart-this.r.time;
    if(!comrade||this.ClipAge(comrade,"BlastDazedStir")<0||!(left>0))return;
    this.PlayClip(comrade,"BlastDazedStir",{restart:true,offset:(length-left%length)%length});
  }
  PhaseBlack(age){
    this.ComradeDazed();this.ExitSquad();
    for(const m of OPENING_DEPTH_WALKERS.members)this.RetireWalker(m.id);
    for(const [id,actor] of [["luo",this.Squad("luo")],["runner",this.cast.runner],["yaowa",this.Squad("yaowa")],["he",this.Squad("heyoutian")],["liu",this.Squad("liuwencai")]])
      if(actor)this.Hide(actor);
    if(age>=C.timeouts.blackS)this.Stage("Wake");
  }
  /** ijaC / ijaD walk in down the link sap to the fold / junction and keep up their loops. */
  VanguardFront(start){
    const r=this.r;
    for(const role of ["ijaC","ijaD"]){
      const actor=this.Ija(role);if(!actor?.alive||actor.openingCombatReleased)continue;
      const spec=MISSION_ENCOUNTERS.bunkerAssault.find(s=>s.id===actor.missionId);
      const route=spec?.enter||[{x:spec?.x??actor.position.x,z:spec?.z??actor.position.z}];
      if(r.time<start+(role==="ijaC"?0:1.4)){this.Hide(actor);continue;}
      const clip=role==="ijaC"?"IjaCornerFire":"IjaJunctionPeek";
      const post=route.at(-1);
      const at=actor.openingWalk?.key==="enter"&&actor.openingWalk.done;
      if(!at){
        if(this.Follow(actor,"enter",route,C.speed.run,null,role==="ijaC"?-Math.PI/2:-Math.PI*.35))actor.openingWalk.done=true;
        continue;
      }
      const faceYaw=role==="ijaC"?Face(post,{x:post.x-4,z:post.z+2}):Face(post,{x:post.x+2,z:post.z-3});
      const age=this.Pose(actor,clip,{face:faceYaw});
      if(role==="ijaC")this.CornerFire(actor);
    }
  }
  /** IjaCornerFire's authored shot (event t 0.1 each loop): a real report and tracer at an authorised point. */
  CornerFire(actor){
    const age=this.ClipAge(actor,"IjaCornerFire");if(age<0)return;
    const loop=Math.floor((age-.1)/2.6);
    if(loop<0||actor.openingShotLoop===loop)return;
    actor.openingShotLoop=loop;
    const targets=[A.rearCorner,{x:-26.5,z:-124.2}];
    this.FireRifle(actor,this.r.Point(targets[loop%targets.length],.6),true);
  }
  PhaseWake(age){
    const r=this.r;
    if(!this.phaseEntered){this.phaseEntered=true;this.flags.vanguardAt??=r.time;}
    this.ComradeDazed();
    this.VanguardFront(this.flags.vanguardAt);
    // ijaA / ijaB set off walkInDelayS after the eyes open (they are far up the link sap, rifles slung).
    this.WalkIn(0);
    if(age>=1.0&&!this.Started("BunkerSearch"))this.Scene("BunkerSearch",r.voice?.PlayScene("BunkerSearch",{speakers:this.Speakers()}));
    // 「手指在泥里抓出一道痕」: four short furrows where his right fingertips really dragged (the
    // first-person hand's claw keys); without the arm rig, in front of the eye as before.
    const hand=this.firstPersonState?.hands?.r;
    if(age>=2.2&&!this.flags.clawed&&hand?.pose?.startsWith?.("claw"))(this.clawPath??=[]).push({x:hand.palm[0],z:hand.palm[2]});
    if(age>=3.0&&!this.flags.clawed){
      this.flags.clawed=true;const t=C.shunzi.trap,f={x:-Math.sin(t.yaw),z:-Math.cos(t.yaw)},side={x:-f.z,z:f.x};
      const path=this.clawPath||[];
      if(path.length>=2&&Distance(path[0],path.at(-1))>.04){
        const a=path[0],b=path.at(-1),d=Distance(a,b),u={x:(a.x-b.x)/d,z:(a.z-b.z)/d};
        this.MudMarks([{x:a.x+u.x*.07,z:a.z+u.z*.07},{x:b.x+u.x*.07,z:b.z+u.z*.07}],{offsets:[-.03,-.01,.01,.03],width:.012,lift:.006});
      }else{
        const start={x:t.x+f.x*.3+side.x*.14,z:t.z+f.z*.3+side.z*.14};
        this.MudMarks([start,{x:start.x-f.x*.14,z:start.z-f.z*.14}],{offsets:[-.03,-.01,.01,.03],width:.012,lift:.006});
      }
    }
    if(age>=C.timeouts.wakeS)this.Stage("FrontPass");
  }
  /** Where ijaA / ijaB stand when the drag starts (manifest stage captiveDrag, comrade anchor). */
  DragMarks(){
    const root=C.banter.comradeBlast;
    return {ijaA:this.StageRoot("captiveDrag","ijaA",root),ijaB:this.StageRoot("captiveDrag","ijaB",root)};
  }
  /**
   * ijaA / ijaB, the vanguard, come down the link sap into a trench just shelled: upright at a trot, rifles in both
   * hands at the waist, heads sweeping (alert gait; a late man runs after walkInS of FrontPass). On his mark each
   * slings his rifle (IjaReadyRifle backwards: twoHand -> slungBack) for the drag, whose clips carry it slung.
   * Returns how many stand on their marks, rifles on their backs.
   */
  WalkIn(age){
    const r=this.r,marks=this.DragMarks(),sling=ClipLength("IjaReadyRifle",1.1);let ready=0;
    for(const role of ["ijaA","ijaB"]){
      const actor=this.Ija(role);if(!actor)continue;
      if(r.time-this.flags.vanguardAt<C.ija.walkInDelayS[role]){this.Hide(actor);continue;}
      const mark=marks[role],key="slungAt:"+role;
      if(this.flags[key]==null)SetRelaxedGait(actor,"alert");
      if(this.Follow(actor,"walkIn",[...C.ija.walkIn,mark],age>C.timeouts.walkInS?C.speed.run:C.speed.trot,null,mark.yaw)){
        const t=r.time-(this.flags[key]??=r.time);
        if(t<sling){this.Hold(actor,mark,"IjaReadyRifle",{seconds:sling-t});continue;}
        SetRelaxedGait(actor,"slung");
        if(this.Hold(actor,mark,null))ready++;
      }
    }
    return ready;
  }
  /**
   * 「翻译！快给我滚过来！」: when the first of them has the buried man in sight (interpreterCallM from his mark), ijaB
   * shouts back up the sap; the interpreter answers from there (InterpreterCall.02) and trots in (InterpreterIn).
   * True once the call has ended (or timed out, or there is no one to call).
   */
  InterpreterCall(){
    const r=this.r,marks=this.DragMarks();
    if(!this.Started("InterpreterCall")){
      const near=["ijaA","ijaB"].some(role=>{const a=this.Ija(role);return a&&!a.openingStoryboardHidden&&Distance(a.openingStoryboardLast||a.position,marks[role])<C.ija.interpreterCallM;});
      if(!near||!this.cast.interpreter)return !this.cast.interpreter;
      this.flags.callAt=r.time;
      this.Scene("InterpreterCall",r.voice?.PlayScene("InterpreterCall",{speakers:this.Speakers(),
        onLine:(lineId)=>{if(lineId==="InterpreterCall.02")this.flags.interpGo??=r.time;}}));
    }
    // No voice (or its line never reported): he sets off when his answer would have started.
    if(this.flags.interpGo==null&&r.time-this.flags.callAt>=this.LineStart("InterpreterCall","InterpreterCall.02"))this.flags.interpGo=r.time;
    if(this.flags.interpGo!=null)this.InterpreterIn();
    return this.SceneDone("InterpreterCall")||r.time-this.flags.callAt>C.timeouts.interpreterCallS;
  }
  PhaseFrontPass(age){
    const r=this.r,marks=this.DragMarks();
    this.ComradeDazed();
    this.VanguardFront(this.flags.vanguardAt);
    const ready=this.WalkIn(age),called=this.InterpreterCall();
    if(ready===2&&called)this.Stage("CaptiveDragged");
    else if(age>C.timeouts.frontPassS+(this.flags.callAt!=null?C.timeouts.interpreterCallS:0)){
      // Late from the spawn queue (or held up): whoever is here stands on his mark, the drag goes on.
      for(const role of ["ijaA","ijaB"]){const actor=this.Ija(role);if(actor){this.Show(actor);this.Put(actor,marks[role]);SetRelaxedGait(actor,"slung");}}
      this.flags.frontPassForced=r.time;this.Stage("CaptiveDragged");
    }
  }
  /** The interpreter squeezes in from the junction while the comrade is dragged and shoved. */
  InterpreterIn(m=this.InterrogationMarks()){
    const interp=this.cast.interpreter;if(!interp)return true;
    if(this.flags.interpIn){this.Hold(interp,m.interpreter,"InterpreterCrouchAsk");return true;}
    this.Show(interp);
    // Called over (InterpreterCall), he comes at a trot, arms free (relaxed gait, no rifle).
    if(this.Follow(interp,"enter",[...C.ija.interpreterEnter,m.interpreter],C.speed.trot,null,m.interpreter.yaw)){this.flags.interpIn=true;}
    return !!this.flags.interpIn;
  }
  PhaseCaptiveDragged(age){
    const r=this.r,comrade=this.Comrade,ijaA=this.Ija("ijaA"),ijaB=this.Ija("ijaB"),marks=this.DragMarks();
    if(!this.phaseEntered){
      this.phaseEntered=true;
      this.Scene("CaptiveDragged",r.voice?.PlayScene("CaptiveDragged",{speakers:this.Speakers()}));
      // The jerk-up (clip 2.2 s) lands on 「立て！」 (CaptiveDragged.02).
      this.flags.dragStart=r.time+Math.max(0,this.LineStart("CaptiveDragged","CaptiveDragged.02")-EventAt("IjaDragCollarFromDirt","jerkUp",2.2));
      this.AlignDazed();
    }
    this.VanguardFront(this.flags.vanguardAt);
    const t=r.time-this.flags.dragStart;
    this.InterpreterIn();
    if(t<0){this.ComradeDazed();this.Hold(ijaA,marks.ijaA,null);this.Hold(ijaB,marks.ijaB,null);return;}
    this.Put(comrade,C.banter.comradeBlast);this.Pose(comrade,"CaptiveDraggedFromDirt",{seconds:t});
    this.Put(ijaA,marks.ijaA);this.Pose(ijaA,"IjaDragCollarFromDirt",{seconds:t});
    this.Put(ijaB,marks.ijaB);this.Pose(ijaB,"IjaPullArm",{seconds:t});
    if(t>=ClipLength("IjaDragCollarFromDirt",4.4))this.Stage("CaptiveWall");
  }
  /** Interrogation marks round the kneeling comrade (his wall root R3). */
  InterrogationMarks(){
    const wall=this.ComradeWallRoot(),I=C.interrogation;
    // SB03: the interpreter side-on to the comrade east of the group, ijaB behind him (world marks, contract §5).
    return {wall,ijaA:this.StageRoot("captiveWall","ijaA",wall),ijaAHold:Local(wall,...I.ijaAHold),
      interpreter:{...I.interpreterAt},ijaB:{...I.ijaBAt}};
  }
  /**
   * SB03A's Japanese going away down the front trench (Data_FirstLevelBackdropSquads.OPENING_DEPTH_IJA): spawned at the
   * wipe on the crater step (out of the picture), walking from afterWipeS (+ staggerS each), retired at the route's end
   * once out of the shot, and at the latest when 02 begins (RetireDepthIja).
   */
  DepthIja(){
    const D=OPENING_DEPTH_IJA,at=this.flags.depthIjaAt;if(at==null)return;
    D.members.forEach((m,i)=>{
      if(this.flags["retired:"+m.id])return;
      const start={...m.start,yaw:Face(m.start,m.route[0])};
      let actor=this.cast[m.id];
      // 2026-09-27: one of them stops at a post down the trench and watches east until the charge cuts him down there
      // (rescue.depthPost; ChargeExtras owns him from the cut). He wears IJA01, the body IjaChoppedFallWall is baked on.
      const post=C.rescue.depthPost[m.id];
      // Going off after the killing, rifles slung (relaxed gait), not at the ready.
      if(!actor){actor=this.Spawn(m.id,"ija",m.start,{weapon:"Type38",...(post?{actorKind:"ija",modelVariant:0}:{})});this.Put(actor,start);SetRelaxedGait(actor,"slung");}
      if(post){
        if(this.flags["cut:"+C.rescue.extras.find(e=>e.victim===m.id)?.id]!=null||!actor.alive)return;
        if(this.r.time<at+D.afterWipeS+i*D.staggerS){this.Hold(actor,start,null);return;}
        const there=actor.openingWalk?.key==="post"&&actor.openingWalk.done;
        if(!there){if(this.Follow(actor,"post",[m.route[0],{x:post.x-1.2,z:post.z},post],D.speedMps,null,post.yaw))actor.openingWalk.done=true;return;}
        SetRelaxedGait(actor,null);this.Hold(actor,post,"IjaGuardPort",{seconds:this.r.time});
        return;
      }
      if(m.flagKick&&!this.KickBackdropFlag(actor,m.flagKick))return;
      if(!m.flagKick&&this.r.time<at+D.afterWipeS+i*D.staggerS){this.Hold(actor,start,null);return;}
      if(!this.Follow(actor,"depth",m.route,D.speedMps,null))return;
      if(!InCameraView(this.r.player.camera,this.r.Point(actor.position,1),10))this.RetireDepthIja(m.id);else this.Pose(actor,null);
    });
  }
  KickBackdropFlag(actor,spec){
    const key="flagKickAt",root={...spec.root,yaw:spec.yawDeg*DEG};
    if(this.flags[key]==null){
      if(this.Hold(actor,root,null,{speed:OPENING_DEPTH_IJA.speedMps}))this.flags[key]=this.r.time;
      return false;
    }
    const t=this.r.time-this.flags[key];
    if(t>=spec.contactS){
      if(this.flags.flagKickedAt==null){this.flags.flagKickedAt=this.r.time;this.r.audio?.Play?.("debrisFall",{position:this.r.Point(root,.4),volume:.65});}
      this.flags.flagFallProgress=Smooth((t-spec.contactS)/spec.fallS);
      this.r.openingSet?.PoseFlag(spec.id,this.flags.flagFallProgress);
    }
    // The kick is the legs' (IjaKickPrisoner); his arms stay at his sides, the rifle stays on his back.
    if(t<spec.clipS){this.Hold(actor,root,"IjaKickPrisoner",{seconds:t});if(actor.openingStoryboardPose)actor.openingStoryboardPose.nativeArms=true;return false;}
    return true;
  }
  RetireDepthIja(id=null){
    for(const m of OPENING_DEPTH_IJA.members)if(id==null||m.id===id){this.flags["retired:"+m.id]=true;this.RetireWalker(m.id);}
  }
  PhaseCaptiveWall(age){
    const r=this.r,comrade=this.Comrade,ijaA=this.Ija("ijaA"),ijaB=this.Ija("ijaB"),interp=this.cast.interpreter,m=this.InterrogationMarks();
    if(!this.phaseEntered){this.phaseEntered=true;this.Put(comrade,m.wall);this.Put(ijaA,m.ijaA);this.PlayClip(comrade,"CaptiveWallBrace",{restart:true});this.PlayClip(ijaA,"IjaShoveToWall",{restart:true});
      // ijaB takes the rifle off his back now (IjaReadyRifle: slungBack -> twoHand) and keeps it at the ready.
      SetRelaxedGait(ijaB,null);}
    this.VanguardFront(this.flags.vanguardAt);
    if(age<2)this.Pose(comrade,"CaptiveWallBrace");else this.Pose(comrade,"CaptiveKneelMud");
    if(age<1)this.Pose(ijaA,"IjaShoveToWall");else this.Hold(ijaA,m.ijaAHold,"CollarControl");
    this.Hold(ijaB,m.ijaB,age<1.1?"IjaReadyRifle":null,{speed:C.speed.walk,seconds:age<1.1?age:undefined});
    const interpIn=this.InterpreterIn(m);
    if(age>=2&&(this.SceneDone("CaptiveDragged")&&(interpIn||age>C.timeouts.walkInS)||age>this.SceneLength("CaptiveDragged")+C.timeouts.walkInS))this.Stage("Interrogation");
  }
  PhaseInterrogation(age){
    const r=this.r,comrade=this.Comrade,ijaA=this.Ija("ijaA"),ijaB=this.Ija("ijaB"),interp=this.cast.interpreter,m=this.InterrogationMarks();
    if(!this.phaseEntered){
      this.phaseEntered=true;
      this.Scene("CaptiveInterrogation",r.voice?.PlayScene("CaptiveInterrogation",{speakers:this.Speakers()}));
      this.interrogationLength=this.SceneLength("CaptiveInterrogation");
    }
    this.VanguardFront(this.flags.vanguardAt);
    this.Pose(comrade,"CaptiveKneelMud");
    this.Hold(ijaA,m.ijaAHold,"CollarControl");
    this.Hold(ijaB,m.ijaB,null);
    this.InterpreterIn(m);
    if(this.SceneDone("CaptiveInterrogation")||age>this.interrogationLength+C.timeouts.interrogationExtraS)this.Stage("Slash");
  }
  // ---- 01 the throat cut, the taunt and the find (2026-09-27 rework, docs/Data_OpeningPinnedRescue20260927.md) --------
  /** The interpreter and ijaB keep to their SB03 marks after the cut (ijaB turned to the front once the far call came). */
  HoldRear(m=this.InterrogationMarks()){
    const ijaB=this.Ija("ijaB");
    this.Hold(this.cast.interpreter,m.interpreter,"InterpreterCrouchAsk");
    this.Hold(ijaB,this.flags.frontCallAt!=null?{...m.ijaB,yaw:C.ija.ijaBWatchYaw}:m.ijaB,null,{speed:C.speed.walk});
  }
  /** Collar grab, draw, cut (stages slashGrab/slashDraw/slashCut share the comrade's wall root). The taunt starts on the
   *  cut itself (「一割马上就嚣张的说了那些台词」). */
  PhaseSlash(phaseAge){
    const r=this.r,comrade=this.Comrade,ijaA=this.Ija("ijaA"),m=this.InterrogationMarks();
    const root=this.StageRoot("slashGrab","ijaA",m.wall);
    const grab=ClipLength("IjaHairGrabPull",1),draw=grab+ClipLength("IjaDrawBayonet",.8),cut=draw+ContactAt("IjaThroatSlash","cut",.24);
    this.VanguardFront(this.flags.vanguardAt);this.HoldRear(m);
    this.Put(comrade,m.wall);
    // 2026-09-27: the cut is done from the comrade's left shoulder (slashGrab, away from the pinned eye): he steps round
    // there from his collar hold first; the grab's clock starts when he stands on it.
    if(this.flags.slashAt==null){
      this.Pose(comrade,"CaptiveKneelMud");
      if(!ijaA||this.Hold(ijaA,root,null,{speed:C.speed.walk})||phaseAge>2){if(ijaA)this.Put(ijaA,root);this.flags.slashAt=r.time;this.flags.slashCutDue=r.time+cut;}
      else return;
    }
    const age=r.time-this.flags.slashAt;
    if(age<draw)this.Pose(comrade,"CaptiveHeadPulledBack",{seconds:age});
    else this.Pose(comrade,"CaptiveThroatCut",{seconds:age-draw});
    this.Put(ijaA,root);
    if(age<grab)this.Pose(ijaA,"IjaHairGrabPull",{seconds:age});
    else if(age<draw)this.Pose(ijaA,"IjaDrawBayonet",{seconds:age-grab});
    else this.Pose(ijaA,"IjaThroatSlash",{seconds:age-draw});
    if(age>=cut&&!this.flags.throatCut){
      this.flags.throatCut=r.time;
      const neck=comrade.actor.characterRig?.bones.neck||comrade.actor.characterRig?.bones.head;
      // The jet leaves the throat toward the eye's side of him (his right front): the pinned man sees it.
      const out=Rot(m.wall.yaw,.35,-1);
      if(neck)this.flags.spurt=r.vfx?.BloodSpurt?.(neck,null,new THREE.Vector3(out.x,.3,out.z),{seconds:3.2,arterial:true,pool:true,worldDirection:true})||null;
      // ...and a burst on the blade's exit, toward the pinned eye's side, so the cut itself reads.
      const at=neck?.getWorldPosition(new THREE.Vector3());
      if(at)r.vfx?.BloodBurst?.(at,new THREE.Vector3(out.x,.35,out.z).normalize(),1.6);
      const handle=this.Scene("CaptiveTaunt",r.voice?.PlayScene("CaptiveTaunt",{speakers:this.Speakers(),onLine:(lineId)=>{
        if(lineId==="CaptiveTaunt.04")this.flags.frontCallAt=r.time;
      }}));
      handle?.Signal?.("ThroatCut");r.voice?.Signal?.("ThroatCut");
      r.audio?.Play?.("meleeSlash",{position:this.HeadPoint(comrade)||r.Point(m.wall,1),volume:.9});
    }
    if(this.flags.throatCut!=null&&r.time-this.flags.throatCut>=.35)this.Stage("Taunt");
  }
  /**
   * 「然后边说边走」: he holds the dying man up by the hair for tauntHoldS on the first line, lets him drop (he slides dead
   * down the planks) and walks off west toward the mouth taunting over his shoulder, until the pinned Shunzi is at his
   * feet (ija.found): Found.
   */
  PhaseTaunt(age){
    const r=this.r,comrade=this.Comrade,ijaA=this.Ija("ijaA"),m=this.InterrogationMarks(),J=C.ija;
    this.VanguardFront(this.flags.vanguardAt);this.HoldRear(m);this.DepthIja();
    const since=r.time-this.flags.throatCut,hold=J.tauntHoldS;
    if(since<hold){
      // CaptiveClutchThroat starts 1.0 s into IjaThroatSlash (stage slashTaunt); CaptiveThroatCut plays out until then.
      const ct=ContactAt("IjaThroatSlash","cut",.24)+since;
      this.Put(comrade,m.wall);if(ct<1)this.Pose(comrade,"CaptiveThroatCut",{seconds:ct});else this.Pose(comrade,"CaptiveClutchThroat",{seconds:ct-1});
      this.Put(ijaA,this.StageRoot("slashGrab","ijaA",m.wall));this.Pose(ijaA,"IjaThroatSlash",{seconds:ContactAt("IjaThroatSlash","cut",.24)+since});
      return;
    }
    if(!this.flags.comradeDead){
      comrade.scriptEssential=false;this.PlayClip(comrade,"CaptiveWallSlideTwitch",{restart:true});this.Kill(comrade);
      this.flags.comradeDead=true;this.flags.depthIjaAt??=r.time;this.flags.walkOffAt=r.time;
      // The walk hands over from the slash root under the pelvis (the hold pose leans into the dying man).
      this.RerootUnderPelvis(ijaA,Face(ijaA.openingStoryboardLast||ijaA.position,J.found));
    }
    this.Corpse(comrade,"CaptiveWallSlideTwitch");
    if(r.time-this.flags.walkOffAt>=ClipLength("CaptiveWallSlideTwitch",3.2)&&!r.Has("captivesKilled"))r.Record("captivesKilled",{count:1});
    // Taunting over his shoulder as he goes, the bayonet still in his fist (IjaTauntWalk over the walk).
    const there=this.Follow(ijaA,"taunt",[...J.tauntWalk,J.found],J.tauntWalkMps,OpeningClipMeta("IjaTauntWalk")?"IjaTauntWalk":null,J.found.yaw,{upperBody:true});
    if(there||age>C.timeouts.tauntExtraS+4){this.flags.foundAt=r.time;this.Stage("Found");}
  }
  /** 「还藏着一个，支那混蛋。」: he stops over the pinned man, looks down at him, says it and squats at his head. */
  PhaseFound(age){
    const r=this.r,ijaA=this.Ija("ijaA"),J=C.ija;
    if(!this.phaseEntered){this.phaseEntered=true;r.Record("doorSearchStarted");this.flags.foundAt??=r.time;}
    this.VanguardFront(this.flags.vanguardAt);this.DepthIja();
    this.Corpse(this.Comrade,"CaptiveWallSlideTwitch");
    if(r.time-this.flags.walkOffAt>=ClipLength("CaptiveWallSlideTwitch",3.2)&&!r.Has("captivesKilled"))r.Record("captivesKilled",{count:1});
    this.HoldRear();
    // He sees the man under the timber and looks at him; his line waits for the taunt's last lines (ijaB's 「蠢货。」, the
    // far call) so they do not talk over each other.
    const taunted=this.SceneDone("CaptiveTaunt")||r.time-this.flags.throatCut>this.SceneLength("CaptiveTaunt")+C.timeouts.tauntExtraS;
    if(age>=J.foundLookS&&taunted&&!this.Started("ShunziFound"))this.Scene("ShunziFound",r.voice?.PlayScene("ShunziFound",{speakers:this.Speakers()}));
    const said=this.Started("ShunziFound")?r.time-this.flags["scene:ShunziFound"]:-1;
    if(said<.9){this.Hold(ijaA,J.found,OpeningClipMeta("IjaFoundLook")?"IjaFoundLook":null,{speed:C.speed.stroll,seconds:age});return;}
    if(age>C.timeouts.foundWalkS+C.timeouts.tauntExtraS){this.Put(ijaA,J.crouch);this.Stage("Hold");return;}
    // He steps up and squats at Shunzi's head (IjaCrouchHairHold's first frame is the squat).
    const clip=this.HoldClip();
    if(this.Hold(ijaA,J.crouch,null,{speed:C.speed.stroll})){
      this.flags.crouchAt??=r.time;
      this.Pose(ijaA,clip,{seconds:0});
      if(this.SceneDone("ShunziFound")||said>this.SceneLength("ShunziFound")+2)this.Stage("Hold");
    }else if(age>C.timeouts.foundWalkS){this.Put(ijaA,J.crouch);this.Stage("Hold");}
  }
  // ---- 02 questioning where he lies, slaps, the charge, the haul out ------------------------------------------------
  /** ijaA's clip over the pinned man: the crouched hair hold (IjaCrouchHairHold) or, before it is baked, the collar hold. */
  HoldClip(){return OpeningClipMeta("IjaCrouchHairHold")?"IjaCrouchHairHold":"IjaHoldCollarUp";}
  /** The interpreter trots over from his SB03 mark to squat at Shunzi's right front; true once there. */
  InterpreterToSquat(){
    const actor=this.cast.interpreter,R=C.rescue;if(!actor)return true;
    const walk=actor.openingWalk;
    if(walk?.key==="squat"&&walk.done)return this.Hold(actor,R.interpreter,"InterpreterCrouchAsk");
    if(this.Follow(actor,"squat",[...R.interpreterReturn,R.interpreter],C.speed.trot,null,R.interpreter.yaw,{cornerM:.1}))actor.openingWalk.done=true;
    return false;
  }
  /** The questioning's cast every frame: ijaA squatting at the head with the hair in his fist (and the slaps), the
   *  interpreter squatting at the right, ijaB watching east down the trench, the rescuers and the depth man waiting. */
  Questioning(){
    const r=this.r,ijaA=this.Ija("ijaA"),R=C.rescue,Q=R.slap;
    this.Corpse(this.Comrade,"CaptiveWallSlideTwitch");
    this.VanguardFront(this.flags.vanguardAt);this.DepthIja();
    this.Put(ijaA,C.ija.crouch);
    const t=r.time-(this.flags.holdAt??r.time),slap=this.SlapClip();
    if(slap)this.Pose(ijaA,slap.clip,{seconds:slap.seconds});
    else this.Pose(ijaA,this.HoldClip(),{seconds:t});
    this.InterpreterToSquat();
    this.GuardHold(this.Ija("ijaB"),R.ijaBGuard);
    this.WaitingRescuers();
    this.UpdateSlaps();
  }
  /** The slap clip playing now (null: the hold): IjaSlapForehand / IjaSlapBackhand from `raise` before the blow; the
   *  third raised hand (IjaSlapRaise) from raiseAt on. Stand-in before the bake: the hold clip. */
  SlapClip(){
    const r=this.r,Q=C.rescue.slap;
    const last=this.slaps?.filter(s=>r.time>=s.at-Q.raiseS).at(-1);
    if(this.flags.raiseAt!=null&&OpeningClipMeta("IjaSlapRaise"))return {clip:"IjaSlapRaise",seconds:r.time-this.flags.raiseAt};
    if(!last)return null;
    const clip=last.side>0?"IjaSlapForehand":"IjaSlapBackhand";
    const seconds=r.time-last.at+ContactAt(clip,"slap",Q.hitS);
    if(!OpeningClipMeta(clip)||seconds>ClipLength(clip,1.4))return null;
    return {clip,seconds};
  }
  /** Queue a slap `delayS` after now (the hit time); the blow lands in UpdateSlaps. */
  QueueSlap(blow){
    (this.slaps??=[]).push({at:this.r.time+blow.delayS+C.rescue.slap.hitS,side:blow.side,landed:false});
  }
  UpdateSlaps(){
    const r=this.r;
    for(const slap of this.slaps||[]){
      if(slap.landed||r.time<slap.at)continue;
      slap.landed=true;
      this.strikeAt=r.time;this.flags.slapAt=r.time;this.flags.slapSide=slap.side;this.flags.slapCount=(this.flags.slapCount||0)+1;
      const head=this.HeadPoint(this.Ija("ijaA"))||r.Point(C.shunzi.witnessEye,.5);
      r.audio?.Play?.(C.rescue.slap.sound,{position:r.Point(C.shunzi.witnessEye,.45),volume:1});
      r.audio?.Deafen?.(.35);
      if(!r.Has("playerSlapped"))r.Record("playerSlapped");
    }
  }
  /** The slap's snap of the head (0 -> 1 -> 0): fast out, eased back over recoverS. */
  SlapKick(){
    const at=this.flags.slapAt;if(at==null)return 0;
    const t=this.r.time-at,Q=C.rescue.slap;
    if(t<0||t>Q.recoverS+.2)return 0;
    return Smooth(t/.07)*(1-Smooth((t-.1)/Q.recoverS));
  }
  /** Luo, He, Liu and the extra men wait out of sight in the SSW leg behind the spoil until the charge. */
  WaitingRescuers(){
    const R=C.rescue;
    const luo=this.Squad("luo"),he=this.Squad("heyoutian"),liu=this.Squad("liuwencai");
    Equip(luo,"Dadao");Equip(he,"Dadao");
    for(const [actor,start] of [[luo,R.luoStart],[he,R.heStart],[liu,R.liuStart]])this.Pin(actor,{...start,yaw:Face(start,R.chargeRoute[0])});
    for(const spec of R.extras){const actor=this.ChargeMan(spec);if(actor)this.Pin(actor,{...spec.start,yaw:Face(spec.start,R.chargeRoute[0])});}
  }
  /** One of the company's men with a dadao (spawned once, on the first frame of the questioning). */
  ChargeMan(spec){
    if(this.cast[spec.id])return this.cast[spec.id];
    if(this.flags["gone:"+spec.id])return null;
    const actor=this.Spawn(spec.id,"nra",spec.start,{weapon:"Dadao",actorKind:"nra",modelVariant:spec.modelVariant});
    Equip(actor,"Dadao");this.Hide(actor);
    return actor;
  }
  PhaseHold(age){
    const r=this.r;
    if(!this.phaseEntered){
      this.phaseEntered=true;r.Record("rescueCallHeard");
      this.flags.holdAt=r.time;this.flags.holdGripAt=r.time+.25;
      const Q=C.rescue.slap;
      this.Scene("RescueInterrogation",r.voice?.PlayScene("RescueInterrogation",{speakers:this.Speakers(),
        onLine:(lineId)=>{
          if(lineId==="RescueInterrogation.02")this.flags.askAt??=r.time;
          for(const blow of Q.blows)if(lineId===blow.line)this.QueueSlap(blow);
          if(lineId===Q.raiseLine)this.flags.raiseAt=r.time+Q.raiseAfterS;
        }}));
      // No voice: the slaps and the raised hand at the lines' estimated starts.
      if(!this.scenes.RescueInterrogation){
        for(const blow of Q.blows)this.slaps=[...(this.slaps||[]),{at:r.time+this.LineStart("RescueInterrogation",blow.line)+blow.delayS+Q.hitS,side:blow.side,landed:false}];
        this.flags.raiseAt=r.time+this.LineStart("RescueInterrogation",Q.raiseLine)+Q.raiseAfterS;
      }
    }
    this.Questioning();
    if(this.flags.askAt!=null||age>C.timeouts.holdLineS)this.Stage("Ask");
  }
  PhaseAsk(age){
    const r=this.r,Q=C.rescue.slap;
    this.Questioning();
    const raised=this.flags.raiseAt!=null&&r.time>=this.flags.raiseAt+Q.chargeAfterRaiseS;
    if(raised||age>C.timeouts.askS)this.Stage("Charge");
  }
  /** Marks of the charge's two cuts round the Japanese where they are: He's parry-and-cut behind ijaA's left (chopParry,
   *  ijaA's crouch root), Luo's cut from ijaB's right rear (chopRear, ijaB watching east). */
  ChopMarks(){
    const a=this.ParryRoot(),b=C.rescue.ijaBGuard;
    return {he:this.StageRoot("chopParry","heyoutian",a),luo:this.StageRoot("chopRear","luo",b)};
  }
  /** ijaA's root for the parry-and-cut: his crouch root turned rescue.parryTurnDeg (toward the crater step). */
  ParryRoot(){const a=C.ija.crouch,m=C.rescue.parryMeet;return {x:m.x,z:m.z,yaw:a.yaw+C.rescue.parryTurnDeg*DEG};}
  /** A man running down the crater step to `mark`, `delay` s after the charge began; true once there. */
  ChargeRun(actor,key,mark,delay,{face=null,strike=false}={}){
    if(!actor)return true;
    const t=this.r.time-this.flags.chargeAt;
    if(t<delay){this.Hide(actor);return false;}
    this.Show(actor);
    if(actor.openingWalk?.key===key&&actor.openingWalk.done){this.Settle(actor,mark);return true;}
    const R=C.rescue;
    if(this.Follow(actor,key,[...R.chargeRoute,mark],R.runMps,null,face??mark.yaw,{cornerM:.35,pace:strike?R.strikePace:R.runPace})){actor.openingWalk.done=true;return true;}
    return false;
  }
  /** 「枪炮声四起，杀喊声四起」: the rifles, the shells and the Sichuan yells on the charge's clock. */
  ChargeNoise(){
    const r=this.r,N=C.rescue.noise,t=r.time-this.flags.chargeAt,done=this.noiseDone??={rifles:0,shells:0,yells:0,crowd:false};
    if(!done.crowd&&t>=N.crowd[0]){done.crowd=true;r.audio?.Play?.("chargeCrowd",{position:r.Point({x:N.crowd[1],z:N.crowd[2]},1.5),volume:1,priority:true});}
    while(done.rifles<N.rifles.length&&t>=N.rifles[done.rifles]){
      const from=N.riflesFrom[done.rifles%N.riflesFrom.length],at=r.Point(from,1.5);
      const to=r.Point({x:10+(done.rifles%3)*2.5,z:-124.2-(done.rifles%2)*.8},1.6);
      r.audio?.PlayGunshot?.("rifleNra",{position:at,volume:1});r.vfx?.Tracer?.(at,to,{kind:"nra"});
      done.rifles++;
    }
    while(done.shells<N.shells.length&&t>=N.shells[done.shells][0]){
      const [,x,z]=N.shells[done.shells];
      r.combat?.FireShell?.(r.Point({x:x+3,z:z-4},14),r.Point({x,z}),{flight:.3,damage:0,radius:4,incoming:false,feedbackOnly:true});
      done.shells++;
    }
    while(done.yells<N.yells.length&&t>=N.yells[done.yells][0]){
      const [,key,x,z]=N.yells[done.yells];
      r.audio?.Play?.("voice."+key,{position:r.Point({x,z},1.5),volume:1.15,priority:true});
      done.yells++;
    }
  }
  PhaseCharge(age){
    const r=this.r,R=C.rescue,ijaA=this.Ija("ijaA"),ijaB=this.Ija("ijaB"),interp=this.cast.interpreter;
    if(!this.phaseEntered){
      this.phaseEntered=true;this.flags.chargeAt=r.time;
      r.audio?.Play?.("bugleCharge",{position:r.Point({x:-6,z:-114},3),volume:.9});
      this.PlayClip(ijaA,"IjaStartleTurn",{restart:true});
      if(interp){this.Scene("RescueFlee",r.voice?.PlayScene("RescueFlee",{speakers:this.Speakers()}));this.PlayClip(interp,"InterpreterFlee",{restart:true});}
      for(const blow of this.slaps||[])blow.landed=true;
    }
    this.ChargeNoise();
    this.Corpse(this.Comrade,"CaptiveWallSlideTwitch");
    this.VanguardFront(this.flags.vanguardAt);this.DepthIja();
    // The interpreter bolts: InterpreterFlee from his squat, then the run east (UpdateFleeing).
    const fleeRoot={...R.interpreter,yaw:C.ija.interpreterFleeYawDeg*DEG};
    if(interp&&this.flags.fleeAt==null){
      const k=C.ija.interpreterFleeRate||1;
      if(age*k<ClipLength("InterpreterFlee",1.6)){this.Put(interp,fleeRoot);this.Pose(interp,"InterpreterFlee",{seconds:age*k});}
      else this.flags.fleeAt=r.time;
    }
    this.UpdateFleeing();
    this.Duels();
    this.ChargeExtras();
    this.LongShotTick();
    if(this.flags.heChopAt!=null&&this.flags.luoChopAt!=null)this.Stage("Melee");
    else if(age>C.timeouts.chargeS){
      const marks=this.ChopMarks();
      for(const [id,mark] of [["heyoutian",marks.he],["luo",marks.luo]]){const actor=this.Squad(id);if(actor){this.Show(actor);this.Put(actor,mark);}}
      this.flags.chargeForced=r.time;this.Stage("Melee");
    }
  }
  /**
   * The two cuts in front of him: He runs down the step to his chopParry mark behind ijaA (ijaA, startled, has let go of
   * the hair and turned: IjaStartleTurn, then IjaParriedChoppedFall from He's arrival), Luo to his chopRear mark at ijaB's
   * right rear (LuoDadaoChopRear / IjaChoppedFallWall). Kills at the authored contacts (contactKillS makes them lethal).
   */
  Duels(){
    const r=this.r,R=C.rescue,marks=this.ChopMarks(),ijaA=this.Ija("ijaA"),ijaB=this.Ija("ijaB"),he=this.Squad("heyoutian"),luo=this.Squad("luo");
    const age=r.time-this.flags.chargeAt;
    // ijaA: startled on his crouch root, then up and running to meet the charge (parryMeet); the parry-and-cut on the
    // turned parry root there.
    if(this.flags.heChopAt==null){
      const startle=ClipLength("IjaStartleTurn",.625),meet=this.ParryRoot();
      if(ijaA?.alive&&age<startle){this.Put(ijaA,C.ija.crouch);this.Pose(ijaA,"IjaStartleTurn",{seconds:age});}
      else if(ijaA?.alive){
        if(!this.flags.ijaAUpAt){this.flags.ijaAUpAt=r.time;this.RerootUnderPelvis(ijaA,ijaA.yaw);SetRelaxedGait(ijaA,null);}
        this.Hold(ijaA,meet,null,{speed:C.speed.run});
      }
      if(this.ChargeRun(he,"charge",marks.he,R.delayS.he,{strike:true})||this.flags.chargeForced!=null){this.flags.heChopAt=r.time;this.Put(ijaA,this.ParryRoot(),{keep:true});this.PlayClip(ijaA,"IjaParriedChoppedFall",{restart:true});this.PlayClip(he,"HeDadaoParryChop",{restart:true});}
    }else{
      this.Put(ijaA,this.ParryRoot());
      const t=r.time-this.flags.heChopAt;
      // (In Lift he leaves his mark for the timber: PhaseLift walks him.)
      if(!this.flags.heLiftGo){this.Settle(he,marks.he);this.Pose(he,"HeDadaoParryChop",{seconds:Math.min(t,ClipLength("HeDadaoParryChop",1.5))});}
      if(ijaA?.alive)this.Pose(ijaA,"IjaParriedChoppedFall",{seconds:t});else this.Corpse(ijaA,"IjaParriedChoppedFall");
      const cut=ContactAt("HeDadaoParryChop","cut",.792);
      if(t>=cut&&ijaA?.alive){this.BladeKill(ijaA,he);this.Blood(ijaA,"neck");}
      if(t>=cut+C.timeouts.contactKillS&&ijaA?.alive)this.Kill(ijaA);
    }
    // ijaB (watching east with the rifle; he half turns at the noise: the head layer)
    this.Put(ijaB,R.ijaBGuard);
    if(this.flags.luoChopAt==null){
      if(ijaB?.alive)this.GuardHold(ijaB,R.ijaBGuard);
      if(this.ChargeRun(luo,"charge",marks.luo,R.delayS.luo,{strike:true})||this.flags.chargeForced!=null){this.flags.luoChopAt=r.time;this.PlayClip(luo,"LuoDadaoChopRear",{restart:true});this.PlayClip(ijaB,"IjaChoppedFallWall",{restart:true});}
    }else{
      const t=r.time-this.flags.luoChopAt;
      if(!this.flags.luoLiftGo){this.Settle(luo,marks.luo);this.Pose(luo,"LuoDadaoChopRear",{seconds:Math.min(t,ClipLength("LuoDadaoChopRear",1.3))});}
      if(ijaB?.alive)this.Pose(ijaB,"IjaChoppedFallWall",{seconds:t});else this.Corpse(ijaB,"IjaChoppedFallWall");
      const cut=ContactAt("LuoDadaoChopRear","cut",.45);
      if(t>=cut&&ijaB?.alive){this.BladeKill(ijaB,luo);this.Blood(ijaB,"neck");}
      if(t>=cut+C.timeouts.contactKillS&&ijaB?.alive)this.Kill(ijaB);
    }
    if(ijaA&&!ijaA.alive&&ijaB&&!ijaB.alive&&!r.Has("vanguardMeleeResolved"))r.Record("vanguardMeleeResolved");
    // Liu down the step to the firing spot over the trench (LongShotTick fires once he is there).
    this.LiuWalk();
  }
  /** Liu runs down to the step and holds it facing J; LongShotTick fires once flags.liuAt is set. */
  LiuWalk(){
    const R=C.rescue,liu=this.Squad("liuwencai");
    if(!liu||this.flags.liuReleased||this.flags.chargeAt==null)return;
    if(this.flags.liuAt==null){if(this.ChargeRun(liu,"charge",R.liuShot,R.delayS.liu,{face:Face(R.liuShot,A.bunkerJunction)}))this.flags.liuAt=this.r.time;return;}
    // After his shot (and the junction man down) he goes down into the trench to aim east from the south wall (SB06).
    const shot=this.flags["shot:liu"];
    if(shot!=null&&this.r.time-shot>=.6&&this.r.Has("junctionShot")){
      if(this.flags.liuCoverAt==null&&this.Follow(liu,"liuCover",[{x:3.3,z:-123.4},R.liuCover],C.speed.run,null,R.liuCover.yaw))this.flags.liuCoverAt=this.r.time;
      if(this.flags.liuCoverAt!=null){this.Put(liu,R.liuCover);this.Pose(liu,null,{face:R.liuCover.yaw});}
      return;
    }
    this.Put(liu,R.liuShot);this.Pose(liu,null,{face:Face(R.liuShot,A.bunkerJunction)});
  }
  /** 「一大帮人」: the company's men run down the step and on east down the trench; ChargeA cuts down the depth man at
   *  his post (chopRear round him), the others hold their posts facing east; out of sight later they are removed. */
  ChargeExtras(){
    const r=this.r,R=C.rescue;
    if(this.flags.chargeAt==null)return;
    for(const spec of R.extras){
      const actor=this.cast[spec.id];if(!actor)continue;
      const key="cut:"+spec.id;
      if(spec.victim){
        const victim=this.cast[spec.victim],post=R.depthPost[spec.victim];
        if(!victim?.alive&&this.flags[key]==null){this.ExtraPost(actor,spec,{...post,yaw:-Math.PI/2});continue;}
        const mark=this.StageRoot("chopRear","luo",post);
        if(this.flags[key]==null){if(this.ChargeRun(actor,"charge:"+spec.id,mark,spec.delayS,{strike:true})){this.flags[key]=r.time;this.PlayClip(actor,"LuoDadaoChopRear",{restart:true});this.PlayClip(victim,"IjaChoppedFallWall",{restart:true});}continue;}
        const t=r.time-this.flags[key];
        this.Settle(actor,mark);this.Pose(actor,"LuoDadaoChopRear",{seconds:Math.min(t,ClipLength("LuoDadaoChopRear",1.3))});
        this.Put(victim,post);
        if(victim.alive)this.Pose(victim,"IjaChoppedFallWall",{seconds:t});else this.Corpse(victim,"IjaChoppedFallWall");
        if(t>=ContactAt("LuoDadaoChopRear","cut",.45)&&victim.alive){this.BladeKill(victim,actor);this.Blood(victim,"neck");}
        continue;
      }
      this.ExtraPost(actor,spec,spec.post);
    }
  }
  ExtraPost(actor,spec,post){
    const mark={...post,yaw:post.yaw??-Math.PI/2};
    if(this.ChargeRun(actor,"charge:"+spec.id,mark,spec.delayS)){
      this.Pose(actor,null,{face:mark.yaw});
      // Out of the picture once they have gone on (a hand-back later than extrasRetireS after the charge removes them anyway).
      const late=this.releaseAt!=null&&this.r.time-this.releaseAt>C.rescue.extrasRetireS;
      if(this.phase==="Released"&&(!InCameraView(this.r.player.camera,this.r.Point(actor.position,1),10)||late))this.RetireCharge(spec.id);
    }
  }
  RetireCharge(id){this.flags["gone:"+id]=true;this.RetireWalker(id);}
  PhaseMelee(age){
    const r=this.r;
    this.ChargeNoise();
    this.Corpse(this.Comrade,"CaptiveWallSlideTwitch");
    this.VanguardFront(this.flags.vanguardAt);this.DepthIja();
    this.UpdateFleeing();this.Duels();this.ChargeExtras();this.LongShotTick();
    const done=!this.Ija("ijaA")?.alive&&!this.Ija("ijaB")?.alive;
    const last=Math.max(this.flags.heChopAt+ClipLength("HeDadaoParryChop",1.5),this.flags.luoChopAt+ClipLength("LuoDadaoChopRear",1.3));
    if(done&&r.time>=last+C.rescue.meleeHoldS)this.Stage("Lift");
    else if(age>C.timeouts.meleeS){for(const role of ["ijaA","ijaB"])this.Kill(this.Ija(role));if(!r.Has("vanguardMeleeResolved"))r.Record("vanguardMeleeResolved",{forced:true});this.Stage("Lift");}
  }
  /**
   * 「班长一把揪住他的衣领，把他从木头底下拖出来」: He goes to the timber and lifts it off his hips (the Set's roof timber toward
   * its hang), Luo squats at his head, takes the collar (LuoDragToCover) and hauls him out backwards; he pushes himself up
   * to sit on shunzi.cover. He lets the timber drop behind them.
   */
  PhaseLift(age){
    const r=this.r,R=C.rescue,L=R.lift,luo=this.Squad("luo"),he=this.Squad("heyoutian");
    if(!this.phaseEntered){
      this.phaseEntered=true;
      // Their cuts carried them off their roots (root motion): the walks to the timber start from under their hips.
      for(const actor of [he,luo])if(actor)this.RerootUnderPelvis(actor,actor.yaw);
    }
    this.ChargeNoise();
    this.Corpse(this.Comrade,"CaptiveWallSlideTwitch");this.UpdateFleeing();this.ChargeExtras();this.LongShotTick();
    this.flags.heLiftGo=true;this.flags.luoLiftGo=true;
    this.Duels();
    const heThere=this.flags.liftAt!=null||this.Hold(he,L.heLift,null,{speed:C.speed.brisk});
    const grab=this.LuoGrabRoot();
    const luoThere=this.flags.haulAt!=null||this.Hold(luo,grab,null,{speed:C.speed.brisk});
    if(this.flags.liftAt==null&&(heThere&&luoThere||age>C.timeouts.luoArriveS)){
      if(!heThere&&he){this.Show(he);this.Put(he,L.heLift);}if(!luoThere&&luo){this.Show(luo);this.Put(luo,grab);}
      this.flags.liftAt=r.time;r.audio?.Play?.("debrisFall",{position:r.Point(C.shunzi.pinnedHips,.4),volume:.55});
    }
    if(this.flags.liftAt==null){this.RoofLift(0);return;}
    const t=r.time-this.flags.liftAt;
    // He heaves the timber up off him (a stand-in pose until HeLiftTimber is baked) and drops it after dropAfterS.
    const heClip=OpeningClipMeta("HeLiftTimber")?"HeLiftTimber":"PullComrade";
    const hauled=this.flags.haulAt!=null?r.time-this.flags.haulAt-C.rescue.lift.haulStopS:-1;
    if(hauled>=L.dropAfterS&&this.flags.dropAt==null){this.flags.dropAt=r.time;this.flags.dropClipS=t;}
    if(he){this.Put(he,L.heLift);this.Pose(he,heClip,{seconds:t,holdUntil:this.flags.dropClipS});}
    const drop=this.flags.dropAt!=null?Smooth((r.time-this.flags.dropAt)/.25):0;
    if(drop>0&&!this.flags.dropped&&drop>=.95){this.flags.dropped=true;r.audio?.Play?.("debrisFall",{position:r.Point(C.shunzi.pinnedHips,.3),volume:.7});}
    this.RoofLift(Smooth((t-L.gripS)/L.raiseS)*(1-drop)*L.raise);
    if(this.flags.haulAt==null){if(t>=L.haulAfterS){this.flags.haulAt=r.time;this.PlayClip(luo,"LuoDragToCover",{restart:true});}else{this.Put(luo,grab);this.Pose(luo,"LuoDragToCover",{seconds:0});}return;}
    const h=r.time-this.flags.haulAt;
    this.Put(luo,grab);this.Pose(luo,"LuoDragToCover",{seconds:Math.min(h,L.haulStopS)});
    if(h>=L.haulStopS+L.sitS||t>C.timeouts.liftS){
      this.RoofLift(0);
      // The haul carried Luo 1.4 m back (root motion): his root goes under his hips before Check walks him on.
      const pelvis=luo?.actor.characterRig?.bones?.pelvis?.getWorldPosition(new THREE.Vector3());
      if(pelvis)this.Put(luo,{x:pelvis.x,z:pelvis.z,yaw:luo.yaw},{keep:true});
      this.MudMarks(this.Densify([C.shunzi.pinnedHips,C.shunzi.cover]),{offsets:[-.12,.12],width:.09});
      if(!r.Has("luoRescueComplete")&&r.Has("vanguardMeleeResolved"))r.Record("luoRescueComplete");
      this.Stage("Check");
    }
  }
  /** The roof timber lifted off him by `k` (0 on him .. 1 up at its hang): the Set poses it. */
  RoofLift(k){this.roofLift=k;this.r.openingSet?.LiftRoofTimber?.(k);}
  /** Luo's root for the haul: facing the pinned man, LuoDragToCover's collar track at 0 s on his collar (behind the eye). */
  LuoGrabRoot(){
    const S=C.shunzi,L=C.rescue.lift,yaw=Math.PI/2;
    const collar={x:S.witnessEye.x-L.collarBackM,z:S.witnessEye.z};
    const p=OpeningPlayerPoint("TengxianNra05","LuoDragToCover","collar",0)||{x:0,z:-.61},o=Rot(yaw,p.x,p.z);
    return {x:collar.x-o.x,z:collar.z-o.z,yaw};
  }
  /** The eye while Luo hauls him out (Lift): on LuoDragToCover's collar track (collarBackM ahead of it) until haulStopS,
   *  then up and back onto the seat over sitS. `sit` 0..1. */
  HaulEye(){
    const L=C.rescue.lift,S=C.shunzi,f=this.flags,r=this.r;
    if(f.haulAt==null)return {x:S.witnessEye.x,z:S.witnessEye.z,h:S.lieEyeM,sit:0};
    const h=r.time-f.haulAt,root=this.LuoGrabRoot();
    const Collar=t=>{const p=OpeningPlayerPoint("TengxianNra05","LuoDragToCover","collar",t)||{x:0,y:.28,z:-.61+t},o=Rot(root.yaw,p.x,p.z);
      return {x:root.x+o.x+L.collarBackM,z:root.z+o.z,h:p.y+.06};};
    const c0=Collar(0),c=Collar(Math.min(h,L.haulStopS)),settle=1-Smooth(h/.4);
    // The track's first frame is on his collar; ease in from the lying eye so the grab does not jump the view.
    const eye={x:c.x+(S.witnessEye.x-c0.x)*settle,z:c.z+(S.witnessEye.z-c0.z)*settle,h:c.h+(S.lieEyeM-c0.h)*settle};
    const sit=Smooth((h-L.haulStopS)/L.sitS);
    return {x:eye.x+(S.cover.x-eye.x)*sit,z:eye.z+(S.cover.z-eye.z)*sit,h:eye.h+(C.rescue.checkShot.eyeM-eye.h)*sit,sit};
  }
  /** The charge's men and the dead on their clips from Check on; He goes to the right edge of SB06 with his rifle. */
  Aftercut(){
    const r=this.r,R=C.rescue,he=this.Squad("heyoutian");
    this.Corpse(this.Comrade,"CaptiveWallSlideTwitch");
    for(const [role,clip,root] of [["ijaA","IjaParriedChoppedFall",this.ParryRoot()],["ijaB","IjaChoppedFallWall",R.ijaBGuard]]){const a=this.Ija(role);if(a){this.Put(a,root);if(a.alive)this.Kill(a);this.Corpse(a,clip);}}
    const victim=this.cast.DepthIjaB;if(victim&&!victim.alive)this.Corpse(victim,"IjaChoppedFallWall");
    this.ChargeExtras();
    if(!r.Has("vanguardMeleeResolved")&&!this.Ija("ijaA")?.alive&&!this.Ija("ijaB")?.alive)r.Record("vanguardMeleeResolved");
    if(!this.flags.heSwapAt){
      if(this.Follow(he,"heCover",[R.heCover],C.speed.walk,null,R.heCover.yaw)||r.time-(this.flags.checkAt??r.time)>6)this.flags.heSwapAt=r.time;
      return;
    }
    const s=r.time-this.flags.heSwapAt;
    if(s<ClipLength("HeSwapDadaoRifle",1.6)){this.Pose(he,"HeSwapDadaoRifle",{seconds:s});return;}
    if(!this.flags.heArmed){this.flags.heArmed=true;this.flags.heArmedAt=r.time;DropOpeningWeapon(he,"HeSwapDadaoRifle");Equip(he,"HanYang");}
    else if(this.phase!=="Released"&&he?.alive)this.Pose(he,null,{face:R.heCover.yaw});
  }
  /** ijaB on a mark in the leg: walks there, then holds his rifle levelled at Shunzi (pendingWiring SB05: IjaGuardPort). */
  GuardHold(actor,mark,{face=null}={}){
    if(!actor)return false;
    const root=face?{...mark,yaw:Face(mark,face)}:mark,there=Distance(actor.openingStoryboardLast||actor.position,root)<.15;
    return this.Hold(actor,root,there?"IjaReadyRifle":null,there?{speed:C.speed.walk,seconds:ClipLength("IjaReadyRifle",1.1)}:{speed:C.speed.walk});
  }
  /** Kill with the blade at the authored contact; if the hit did not kill, make it lethal. */
  /** A scripted death: drop the narrative protection first, then a lethal hit. */
  Kill(victim,kind="melee"){
    if(!victim?.alive)return;
    victim.openingDoomed=true;victim.scriptEssential=false;victim.scriptedNoncombatant=false;
    this.FallNatively(victim);
    victim.TakeHit(1000,"torso",null,{kind});
  }
  /**
   * A man the director kills while it holds him on a standing pose (IjaBayonetGuard, a loop, ...) falls on the native
   * death: the pose layer keeps any director pose over a dead body (authored falls finish that way), so a standing pose
   * left on him kept the corpse upright (09-25 review: ijaD at J, pelvis 0.68 m, in the middle of SB06). Authored
   * terminal clips stay.
   */
  FallNatively(victim){
    if(victim&&!IsOpeningTerminalClip(victim.openingStoryboardPose?.clip)){victim.openingStoryboardPose=null;victim.openingStoryboardTravel=null;}
  }
  BladeKill(victim,attacker){
    if(!victim?.alive)return;
    victim.openingDoomed=true;victim.scriptEssential=false;victim.scriptedNoncombatant=false;
    const weapon=attacker?.weapon;if(attacker)attacker.weapon=WEAPONS.Dadao;
    try{this.r.meleeCombat?.Damage(victim,attacker,200,"heavy");}finally{if(attacker)attacker.weapon=weapon;}
    if(victim.alive)this.Kill(victim);
  }
  Blood(actor,part){
    const bone=actor?.actor?.characterRig?.bones?.[part==="neck"?"neck":"chest"]||actor?.actor?.characterRig?.bones?.head;
    const at=bone?.getWorldPosition(new THREE.Vector3());
    if(at)this.r.vfx?.BloodBurst?.(at,new THREE.Vector3(0,.3,1),1.4);
  }
  /** The interpreter runs down the front trench and into the depth sap; removed out of sight. */
  UpdateFleeing(){
    const r=this.r,interp=this.cast.interpreter;
    if(!interp||this.flags.fleeAt==null||this.flags.interpreterGone)return;
    // InterpreterFlee carries him ~1.3 m in root motion: hand the native run a root under the clip's
    // last pelvis, or the blend back to the old root drags him backwards (0.15 m/frame, 09-24 probe).
    if(!this.flags.fleeRooted){
      this.flags.fleeRooted=true;
      const rig=interp.actor.characterRig,end=OpeningClipRoot(rig?.clipModelId||rig?.modelId,"InterpreterFlee")?.end;
      this.RerootUnderPelvis(interp,interp.yaw+(end?end[2]*DEG:0));
    }
    const end=this.Follow(interp,"flee",C.ija.interpreterFlee,C.speed.flee,null);
    if(end||r.time-this.flags.fleeAt>12){this.flags.interpreterGone=true;interp.scriptEssential=false;this.Hide(interp);r.ai.Remove(interp);delete this.cast.interpreter;}
  }
  /** Liu Wencai's long shot at the junction man; fallbacks never leave the hand-back waiting. */
  LongShotTick(){
    const r=this.r,ijaD=this.Ija("ijaD"),ijaC=this.Ija("ijaC"),liu=this.Squad("liuwencai");
    this.LiuWalk();
    if(this.flags.longShotAt==null)this.flags.longShotAt=r.time;
    const t=r.time-this.flags.longShotAt;
    if(ijaC?.alive&&!ijaC.openingCombatReleased)this.ReleaseCombat(ijaC);
    if(!ijaD){if(!r.Has("junctionShot"))r.Record("junctionShot",{by:"absent"});return;}
    if(ijaD.alive&&!ijaD.openingCombatReleased){
      // 「一名日兵从岔口回身举枪」
      this.Pose(ijaD,t<1.1?"IjaReadyRifle":null,{seconds:t,face:Face(ijaD.position,C.rescue.liuShot)});
    }
    if(!ijaD.alive){if(!r.Has("junctionShot"))r.Record("junctionShot",{by:this.flags.junctionBy||"other"});return;}
    const Try=(shooter,id,at)=>{
      if(this.flags["shot:"+id]||t<at||!shooter)return;
      this.flags["shot:"+id]=r.time;
      const force=t>=C.timeouts.longShotForceS,clear=!r.BlocksSight(this.ShotOrigin(shooter),this.AimPoint(ijaD));
      const hit=this.ShootAt(shooter,ijaD,force);
      // A hit only the timeout made (no line to him: he hid) is credited to the timeout, not the shooter.
      if(hit)this.flags.junctionBy=clear||!force?id:"forced";
    };
    // Liu fires from his step (a late walker is covered by the two fallbacks below).
    if(this.flags.liuAt!=null)Try(liu,"liu",Math.max(1.2,this.flags.liuAt-this.flags.longShotAt+.6));
    // He fires once the rifle is actually in his hands (HeSwapDadaoRifle ends ~ +4.7 s).
    if(this.flags.heArmedAt!=null)Try(this.Squad("heyoutian"),"he",Math.max(C.timeouts.longShotRetryS,this.flags.heArmedAt-this.flags.longShotAt+.4));
    Try(this.Squad("luo"),"luo",C.timeouts.longShotForceS);
    if(t>=C.timeouts.longShotForceS+.5&&ijaD.alive){this.Kill(ijaD,"bullet");this.flags.junctionBy??="forced";}
  }
  /** A visible, audible aimed rifle shot from `shooter` at `target`; hits when the line is clear. */
  /** Where a squad rifleman's shot leaves from: his head, risen at least C.shotRiseM over his feet (a man
   *  crouched behind the spoil comes up to fire over it; 09-24: He's backup was traced from a crouched head). */
  ShotOrigin(shooter){
    const r=this.r,head=this.HeadPoint(shooter)||r.Point(shooter.position,C.culledHeadM),floor=r.Point(shooter.position,C.shotRiseM);
    if(head.y<floor.y)head.y=floor.y;
    return head;
  }
  /** Chest of the target when he is on screen (bones current), else his body at chest height. */
  AimPoint(target){
    const shown=!target.renderLod||target.renderLod==="detail";
    return shown&&(target.actor?.characterRig?.bones.chest||target.actor?.chest)?.getWorldPosition(new THREE.Vector3())||this.r.Point(target.position,1.2);
  }
  ShootAt(shooter,target,force=false){
    const r=this.r;
    const from=this.ShotOrigin(shooter),aim=this.AimPoint(target);
    const clear=!r.BlocksSight(from,aim);
    const dir=aim.clone().sub(from).normalize();
    r.vfx?.MuzzleFlash(from.clone().addScaledVector(dir,.8),dir,{kind:"boltRifle"});r.vfx?.Tracer(from,aim,{kind:"nra"});
    r.audio?.PlayGunshot?.("rifle",{position:from,volume:1});
    if(!(clear||force)){r.vfx?.Impact?.(aim,dir.clone().negate(),"dirt");return false;}
    target.openingDoomed=true;target.scriptEssential=false;target.scriptedNoncombatant=false;
    this.FallNatively(target);
    target.TakeHit(1000,"torso",dir,{kind:"bullet",weaponId:"HanYang",point:aim});
    r.vfx?.Blood?.(aim,dir,1);
    return true;
  }
  /**
   * SB06: Luo kneels at the left front of the seat facing Shunzi, 0.9 m off (his head in the upper left of the forward
   * view). LuoKneelCheck's grip lands 0.35 m short of the shoulder there: pendingWiring SB06 (LuoKneelReach reaches).
   */
  CheckRoot(){
    const S=C.shunzi.cover,L=C.rescue.luoCheck;
    return {x:L.x,z:L.z,yaw:Face(L,S)};
  }
  PhaseCheck(age){
    const r=this.r,luo=this.Squad("luo");
    this.Aftercut();this.UpdateFleeing();this.LongShotTick();
    const root=this.CheckRoot();
    if(this.flags.kneelAt==null){if(this.Hold(luo,root,null,{speed:C.speed.stroll})||age>1.5)this.flags.kneelAt=r.time;return;}
    const t=r.time-this.flags.kneelAt;
    if(t>=1&&!this.Started("RescueCheck"))this.Scene("RescueCheck",r.voice?.PlayScene("RescueCheck",{speakers:this.Speakers(),onEnd:()=>{this.flags.checkLineAt=r.time;}}));
    if(this.flags.checkLineAt==null&&t>1+(this.SceneLength("RescueCheck")+2))this.flags.checkLineAt=r.time;
    // Shunzi nods after the question; Luo lets go and rises (holdUntil).
    const nodDone=this.flags.checkLineAt!=null&&r.time-this.flags.checkLineAt>=.8;
    if(nodDone&&this.flags.releaseAt==null)this.flags.releaseAt=t;
    this.Put(luo,root);this.Pose(luo,"LuoKneelCheck",{seconds:t,holdUntil:this.flags.releaseAt??undefined});
    if(this.flags.releaseAt!=null&&t>=this.flags.releaseAt+.9||age>C.timeouts.checkS)this.Stage("KickRifle");
  }
  PhaseKickRifle(age){
    const r=this.r,luo=this.Squad("luo"),R=C.rescue;
    this.Aftercut();this.UpdateFleeing();this.LongShotTick();
    // Luo goes round behind Shunzi to the trench floor north of the rifle (it lies in the mud just outside the choked
    // mouth) and kicks it south; it glances off the mouth rubble and slides out past his right side (rescue.kickFrom/via).
    const from={...R.kickFrom,yaw:Face(R.kickFrom,R.rifleMouth)};
    if(this.flags.kickRifleAt==null){if(this.Hold(luo,from,null,{speed:C.speed.walk})||age>C.timeouts.kickRifleS)this.flags.kickRifleAt=r.time;return;}
    const t=r.time-this.flags.kickRifleAt;
    this.Put(luo,from);this.Pose(luo,"KickRifle",{seconds:t});
    const slide=Smooth((t-.48)/.5),a=R.rifleMouth,v=R.rifleKickVia,b=R.rifleKicked,l1=Distance(a,v),l2=Distance(v,b),s=slide*(l1+l2);
    const p=s<l1?{x:a.x+(v.x-a.x)*s/l1,z:a.z+(v.z-a.z)*s/l1}:{x:v.x+(b.x-v.x)*(s-l1)/l2,z:v.z+(b.z-v.z)*(s-l1)/l2};
    this.MoveRifle({...p,yaw:a.yaw+Wrap(b.yaw-a.yaw)*slide});
    // Never stall on the hand-back: a required vanguard man still standing here gets the lethal hit.
    if(t>=1.2&&!this.VanguardCleared())for(const id of C.vanguardIds)this.Kill(this.r.enemies.get(id),id==="BunkerFollowB"?"bullet":"melee");
    // A man missing from the enemy table (spawn failure, a debug removal) can never be seen dead:
    // after kickRifleS the hand-back goes ahead and the absentees are written into the fact.
    if(t>=1.2)this.Release({force:t>=1.2+C.timeouts.kickRifleS});
  }
  PhaseReleased(){
    this.Aftercut();this.UpdateFleeing();this.LongShotTick();
  }
  /** Background every frame of 01–02: dead stay dead, ijaC/ijaD keep their loops. */
  Background(){
    const phase=this.phase;
    if(RESCUE.has(phase)&&!["Charge","Melee","Lift","Check","KickRifle","Released"].includes(phase)){
      for(const role of ["ijaC","ijaD"]){const actor=this.Ija(role);if(actor?.alive&&!actor.openingCombatReleased){
        const spec=MISSION_ENCOUNTERS.bunkerAssault.find(s=>s.id===actor.missionId),post=spec?.enter?.at(-1)||actor.position;
        if(actor.openingStoryboardHidden)this.Put(actor,{...post,yaw:role==="ijaC"?-Math.PI/2:-1.1});
        this.Show(actor);
        this.Pose(actor,role==="ijaC"?"IjaCornerFire":"IjaJunctionPeek");if(role==="ijaC")this.CornerFire(actor);}}
    }
    // SB05: Yaowa stays out of the SSW leg's picture (hidden since Black; a debug start into 02 never hid him) until
    // the hand-back; the squad AI would otherwise walk him up behind the rear corner.
    if(RESCUE.has(phase)&&phase!=="Released")this.Pin(this.Squad("yaowa"),C.banter.hide.yaowa);
  }
  CollarContact(actor){
    const bones=actor.actor.characterRig?.bones;if(!bones)return;
    const target=this.r.Point(this.PlayerPoint(),.45);
    GraspArm(bones,"L",bones.upperArmL.getWorldPosition(new THREE.Vector3()),target);
    const twoHanded=actor.actor.weaponTwoHanded;actor.actor.weaponTwoHanded=false;
    actor.actor._UpdateRiggedWeaponMount();actor.actor.weaponTwoHanded=twoHanded;
  }
  BeforeRender(){
    for(const actor of [...Object.values(this.cast),...this.r.squad,...this.r.enemies.values()]){
      if(actor.openingStoryboardHidden)actor.actor.root.visible=false;
      else actor.actor?.characterRig?.openingRememberShown?.();
    }
  }
  /** An enemy rifle shot from the muzzle: flash, tracer, dirt where it meets the trench wall, report. */
  FireRifle(actor,target,wall=false){
    const r=this.r,from=actor.actor.MuzzleWorld(new THREE.Vector3()).clone(),dir=target.clone().sub(from).normalize();
    const hit=wall?r.battlefield.Raycast(from,dir,60,{terrain:true}):null,end=hit?from.clone().addScaledVector(dir,hit.t):target;
    r.vfx?.MuzzleFlash(from,dir,{kind:"boltRifle"});r.vfx?.Tracer(from,end,{kind:"ija"});
    if(hit)r.vfx?.Impact(end,dir.clone().negate(),"dirt");
    r.audio?.PlayGunshot("rifleIja",{position:from,volume:1});actor.actor.recoil=1;
  }
  Release({force=false}={}){
    const r=this.r;
    const missing=C.vanguardIds.filter(id=>!r.enemies.get(id));
    if(!this.VanguardCleared()&&!(force&&C.vanguardIds.every(id=>!r.enemies.get(id)?.alive)))return;
    if(missing.length)this.flags.releaseMissing=missing.join(",");
    this.ReleaseMeleeDormancy();
    this.releaseAt=r.time;this.releaseLevel=this.perception?.amount??C.perception.base.Released;
    this.Set("Released");
    r.Record("playerDraggedFromWreck",missing.length?{to:C.shunzi.cover,missing}:{to:C.shunzi.cover});
    if(!r.Has("luoRescueComplete"))r.Record("luoRescueComplete");
    const kind=r.controls?.kind;r.controls=null;r.Control?.(false,kind);r.player.stance="crouch";
    const direction=new THREE.Vector3(0,0,-1).applyQuaternion(this.presentedCamera?.quaternion||r.player.camera.quaternion);
    r.player.yaw=Math.atan2(-direction.x,-direction.z);r.player.pitch=Math.asin(Math.max(-1,Math.min(1,direction.y)));
    if(this.presentedCamera)r.player.camera.quaternion.copy(this.presentedCamera.quaternion);
    const luo=this.Squad("luo"),R=C.rescue;
    this.ReleaseSquad(luo,{...C.withdraw.luoCover,yaw:Face(C.withdraw.luoCover,A.bunkerFold)});
    // SB06: Liu at the trench edge and He at the right edge kneel (the AI's stance; pendingWiring SB06 for the show).
    const liu=this.Squad("liuwencai");
    this.ReleaseSquad(liu,this.flags.liuCoverAt!=null?R.liuCover:R.liuShot);if(liu)r.ai.SetStance?.(liu,1,6,true);
    if(this.flags.heArmed){const he=this.Squad("heyoutian");this.ReleaseSquad(he,R.heCover);if(he)r.ai.SetStance?.(he,1,6,true);}
    // 「还权后 3 s 内玩家不掉血」: the seat looks down the front trench, so every live Japanese near it holds his fire
    // for handbackHoldFireS (the AI's hesitation: no fire, no move) and the player has control first.
    for(const actor of r.enemies.values())if(actor?.alive&&Distance(actor.position,C.shunzi.cover)<R.handbackHoldFireM)
      actor.hesitateUntil=Math.max(actor.hesitateUntil??-99,r.ai.time+R.handbackHoldFireS);
    for(const actor of r.squad){actor.actor.root.visible=true;actor.openingStoryboardHidden=false;}
    this.playerBody.root.visible=false;
  }
  /** Hand a squad man back to the ordinary AI at a post (he fights from there). */
  ReleaseSquad(actor,post){
    if(!actor)return;
    actor.openingStoryboardPose=null;actor.openingStoryboardTravel=null;actor.openingStoryboardLast=null;actor.openingStoryboardContact=null;actor.openingPlay=null;
    actor.scriptedNoncombatant=false;actor.missionDormant=false;
    if(actor.weaponId&&actor.actor.weaponId!==actor.weaponId&&actor.actor.weaponId!=="HanYang")Equip(actor,actor.weaponId);
    if(!actor.actor.weaponId)Equip(actor,actor.weaponId||"HanYang");
    this.r.Defend(actor,post,.6,.6);
    if(post===C.rescue.liuShot||post===C.rescue.liuCover)this.flags.liuReleased=true;
  }
  VanguardCleared(){return C.vanguardIds.every(id=>this.r.enemies.get(id)?.alive===false);}
  ReleaseMeleeDormancy(){
    if(this.savedMeleeDormancy){this.r.player.meleeDormant=this.playerMeleeDormancy;this.savedMeleeDormancy=false;}
  }
  ReleaseCombat(actor){
    if(!actor?.alive||actor.openingCombatReleased)return;
    actor.openingCombatReleased=true;actor.scriptEssential=false;actor.scriptedNoncombatant=false;actor.missionDormant=false;
    actor.openingStoryboardPose=null;actor.openingStoryboardTravel=null;actor.openingStoryboardLast=null;actor.openingStoryboardContact=null;
    SetRelaxedGait(actor,null);   // a fighting man has his rifle in his hands
    actor.tacticalRadiusM=0;
    this.r.Defend(actor,actor.position,.4,.4);
  }
  RescueGatherReady(){return false;}
  // -- 02 withdrawal and the hand-over to 03 ---------------------------------------------------
  Enter(stage){
    const r=this.r;
    // The furrows belong to 01–06 (the drag marks at the collection stay until the column leaves at 06).
    if(!OPENING_MARK_STAGES.has(stage))this.ClearMudMarks();
    if(stage==="Support"){
      // 03 belongs to the front battle: the director lets go of the squad it walked to the collection.
      for(const actor of r.squad){
        if(actor.openingCombatReleased)continue;
        actor.openingStoryboardPose=null;actor.openingStoryboardTravel=null;actor.openingStoryboardLast=null;actor.openingWalk=null;
        actor.scriptedNoncombatant=false;actor.missionDormant=false;actor.missionCoverWaiting=false;
      }
    }
    if(stage==="MachineGun"&&this.cast.CollectionRearGuard){
      const guard=this.cast.CollectionRearGuard;
      guard.openingStoryboardPose=null;guard.openingStoryboardTravel=null;
      r.Defend(guard,P.collection.runner,0,0);
    }
    if(stage==="RearTrench"){
      for(const actor of [...r.squad,...r.enemies.values()]){
        if(actor.alive)actor.openingStoryboardPose=null;
        actor.openingStoryboardTravel=null;actor.actor.root.visible=true;actor.openingStoryboardHidden=false;
        if(actor.missionEncounter==="bunkerAssault"&&actor.alive){actor.scriptEssential=false;actor.scriptedNoncombatant=false;}
      }
      if(this.playerBody)this.playerBody.root.visible=false;
      this.Hide(this.cast.runner);
      this.SpawnPursuit();
      this.withdraw={step:0,at:r.time};
      this.Set("Withdraw");
      // The guard who reports at the collection waits out of sight in the support sap; he runs up it
      // when Yaowa catches Shunzi (「一名撤回的守军从支沟跑来」).
      if(!this.cast.CollectionRearGuard)this.Spawn("CollectionRearGuard","nra",C.collection.guardRun[0],SpeakingCastOptions("guard"));
      this.Hide(this.cast.CollectionRearGuard);
      // 「有人拖着伤员往后走，靴子在泥里划出两道长痕」
      if(!this.flags.dragFurrows){this.flags.dragFurrows=true;this.MudMarks(this.Densify(C.collection.dragFurrows),{offsets:[-.17,.17],width:.08});}
    }
  }
  /** bunkerPursuit (contract §5.8): one holds the fold, three follow down the link sap. */
  SpawnPursuit(){
    const r=this.r;
    if(this.pursuitSpawned)return;this.pursuitSpawned=true;
    this.pursuit=[];
    for(const spec of MISSION_ENCOUNTERS.bunkerPursuit){
      const actor=r.SpawnEncounterActor?.("bunkerPursuit",spec);
      if(actor)this.pursuit.push({spec,actor,at:r.time,index:0});
      else this.pursuitMissing=(this.pursuitMissing||0)+1;
    }
    r.spawned?.add?.("bunkerPursuit");
  }
  /** Pursuers advance down the link sap (never past the bend); leave via J into the depth sap on retire. */
  UpdatePursuit(){
    const r=this.r;
    if(this.pursuitMissing&&this.pursuit){
      for(const spec of MISSION_ENCOUNTERS.bunkerPursuit){
        const actor=r.enemies.get(spec.id);
        if(actor&&!this.pursuit.some(p=>p.actor===actor)){this.pursuit.push({spec,actor,at:r.time,index:0});this.pursuitMissing--;}
      }
    }
    const retire=r.Has("collectionPointSeen")||!["Trapped","RearTrench","BunkerRescue"].includes(r.flow.stage.id);
    const leaving=[];
    if(this.pursuit)for(const p of this.pursuit)leaving.push(p);
    const ijaC=this.Ija("ijaC");
    if(retire&&ijaC?.alive&&!ijaC.openingRetire)leaving.push({spec:{id:ijaC.missionId},actor:ijaC,at:r.time,retireOnly:true});
    for(const p of leaving){
      const actor=p.actor;if(!actor?.alive)continue;
      if(retire){
        if(!actor.openingRetire){actor.openingRetire={index:0,at:r.time};actor.scriptedNoncombatant=true;actor.target=null;r.enemies.delete(actor.missionId);}
        const route=[A.bunkerJunction,...FRONT_SPACE.pursuitFallback];
        const leg=actor.openingRetire;
        while(leg.index<route.length-1&&Distance(actor.position,route[leg.index])<.8)leg.index++;
        r.MoveActor(actor,route[leg.index],C.pursuit.retireMps);
        // Removed at the end of the sap out of the player's view (like the backdrop squads), or after retireMaxS.
        const done=leg.index===route.length-1&&Distance(actor.position,route.at(-1))<1.2,late=r.time-leg.at>C.pursuit.retireMaxS;
        const seen=InCameraView(r.player.camera,{x:actor.position.x,y:(actor.position.y||0)+1.2,z:actor.position.z});
        if(done&&!seen||late){r.ai.Remove(actor);actor.openingRemoved=true;}
        continue;
      }
      if(p.retireOnly)continue;
      if(p.spec.hold||!p.spec.route)continue;
      // Staggered men wait on their entry mark instead of seeking a distant combat
      // cover point before the checked route takes ownership.
      actor.tacticalRadiusM=0;
      if(r.time<p.at+(p.spec.delayS||0)*C.pursuit.delayScale){r.MoveActor(actor,p.spec,0);continue;}
      if(p.index<p.spec.route.length){
        const target=p.spec.route[p.index];
        if(Distance(actor.position,target)<.9)p.index++;
        else{
          // This checked trench route owns movement while ordinary combat still owns
          // aiming and damage. Random infantry detours can send the rear pursuer back
          // towards the front as combat leaves a different set of men alive.
          r.MoveActor(actor,target,C.pursuit.speedMps);
          actor.routeArrivalOwnsRadius=true;
        }
      }else if(!p.holding){
        // 「玩家回头时，能够看见敌人占据刚才自己停留的位置」: at the end of his route a pursuer holds that spot
        // (cover within Defend's slack) instead of roaming the infantry tactical radius out of the look-back.
        p.holding=true;actor.tacticalRadiusM=0;r.Defend(actor,p.spec.route.at(-1),.8,1);
      }
    }
    if(retire&&this.pursuit)this.pursuit=this.pursuit.filter(p=>!p.actor.openingRemoved);
  }
  /** 02 withdrawal: Luo covers from the first intact wall, He and Liu bound back past the player. */
  Aftermath(stage){
    const r=this.r;
    // The company's men who charged with Luo went on east down the trench: removed once out of the player's sight
    // (and all of them past the withdrawal), before the pursuit comes down the link sap.
    for(const spec of C.rescue.extras){
      const actor=this.cast[spec.id];if(!actor)continue;
      if(stage!=="RearTrench"||!InCameraView(r.player.camera,r.Point(actor.position,1),10))this.RetireCharge(spec.id);
      else if(actor.alive)this.Pose(actor,null,{face:-Math.PI/2});
    }
    if(stage==="RearTrench"){
      const w=this.withdraw||(this.withdraw={step:0,at:r.time});
      const luo=this.Squad("luo"),he=this.Squad("heyoutian"),liu=this.Squad("liuwencai"),W=C.withdraw,p=r.player.position;
      const Post=(actor,point,face)=>{if(actor?.alive){actor.missionCoverWaiting=true;r.Defend(actor,point,.5,.6);if(face)actor.watchYaw=Face(point,face);}};
      // He and Liu hold the trench edge east of the seat (SB06); their bounds back go over the crater step and down the
      // SSW leg on the lane (the mouth rubble and the spoil wall the bend off from the leg: local steering jams there).
      const R=C.rescue,liuPost=this.flags.liuCoverAt!=null?R.liuCover:R.liuShot;
      const Bound=(actor,key,route,goal,face)=>{
        if(!actor?.alive)return;
        if(w[key]){Post(actor,goal,face);return;}
        if(this.Follow(actor,key,[...route,goal],C.speed.run,null,Face(goal,face))){w[key]=true;
          actor.openingStoryboardPose=null;actor.openingStoryboardTravel=null;actor.openingStoryboardLast=null;actor.scriptedNoncombatant=false;}
      };
      const heBack=W.heBackRoute,liuBack=W.liuBackRoute;
      if(this.phase==="Collection"||this.phase==="SupportOrder")this.UpdateCollection();
      else if(w.step===0){
        // Luo goes first: from the kick spot round the north of the seat, past Shunzi's feet, over the crater step
        // to the first intact wall (the choked mouth and the spoil wall the bend off from the rear leg, so this leg is
        // walked on the lane, not left to local steering).
        if(luo?.alive&&!w.luoAtCover){
          const lane=W.lane.slice(0,W.lane.findIndex(p=>p.x===W.luoCover.x&&p.z===W.luoCover.z)+1);
          if(this.Follow(luo,"withdraw",lane.length>1?lane:[...W.lane.slice(0,7),W.luoCover],C.speed.run,null,Face(W.luoCover,A.bunkerFold))){
            w.luoAtCover=true;luo.openingStoryboardPose=null;luo.openingStoryboardTravel=null;luo.openingStoryboardLast=null;luo.scriptedNoncombatant=false;}
        }else Post(luo,W.luoCover,A.bunkerFold);Post(he,R.heCover,A.bunkerFold);Post(liu,liuPost,A.bunkerJunction);
        if(Distance(p,W.luoCover)<3.2||r.Has("cornerReached"))w.step=1,w.at=r.time;}
      else if(w.step===1){Post(luo,W.luoCorner,W.luoCover);Bound(he,"heBack",heBack,W.heBound[1],A.bunkerFold);Post(liu,liuPost,A.bunkerJunction);
        if(r.time-w.at>4||Distance(p,W.luoCorner)<6)w.step=2,w.at=r.time;}
      else if(w.step===2){Post(luo,W.luoCorner,W.luoCover);Bound(he,"heBack",heBack,W.heBound[1],A.bunkerFold);Bound(liu,"liuBack",liuBack,W.liuBound[1],A.bunkerJunction);
        if(r.Has("cornerReached"))w.step=3,w.at=r.time,this.Set("Corner");}
      else{
        // Past the corner: Luo runs on ahead down the rear trench (「罗班长先过后交通壕折角，在另一侧接应」),
        // He and Liu come back on the squad AI behind the player.
        for(const actor of [he,liu])if(actor)actor.missionCoverWaiting=false;
        this.LeadLuo();
      }
      if(r.Has("collectionPointSeen")&&this.phase!=="Collection"&&this.phase!=="SupportOrder"){this.meet=this.MeetMarks();this.Set("Collection");}
    }
    if(stage==="Support")this.GuardRest();
    if(stage==="RearTrench")this.UpdateFleeing();
    if(this.pointActor){const elapsed=r.time-this.pointAt,blocker=r.enemies.get("FrontGunner");this.pointActor.openingStoryboardPose=elapsed<3?{clip:"PointBlockade",seconds:elapsed,upperBody:true}:null;
      if(blocker&&elapsed<3&&(this.pointActor.moveSpeed||0)<.03){this.pointActor.watchYaw=Face(this.pointActor.position,blocker.position);this.pointActor.watchUntil=r.ai.time+.2;}
      if(elapsed>=3)this.pointActor=null;}
  }
  /** Walk `actor` along the rear-trench lane toward arc position `goal` (a carrot 1.2 m ahead on the lane,
   *  so the corners are walked, not cut); at the goal step onto `mark` (it may sit off the centre line). */
  LaneStep(actor,goal,speed,face,mark=null){
    if(!actor?.alive)return false;
    const last=actor.openingStoryboardLast,at=last&&this.r.time-(last.time??-Infinity)<=.25?last:actor.position;
    const s=MissionRouteProjection(REAR_LANE,at).progress,d=goal-s;
    const m=mark||MissionRoutePoint(REAR_LANE,goal);
    if(Math.abs(d)<.35||Distance(at,m)<.6){
      const yaw=face==null?actor.yaw:typeof face==="number"?face:Distance(m,face)>.05?Face(m,face):actor.yaw;
      return this.Hold(actor,{x:m.x,z:m.z,yaw},null,{speed:C.speed.walk});
    }
    this.Move(actor,MissionRoutePoint(REAR_LANE,s+Math.sign(d)*Math.min(1.2,Math.abs(d))),null,null,speed);
    return false;
  }
  /** After the corner Luo keeps a few metres ahead of the player on the way to the collection. */
  LeadLuo(){
    const r=this.r,K=C.collection,luo=this.Squad("luo");if(!luo?.alive)return;
    const s=MissionRouteProjection(REAR_LANE,r.player.position).progress;
    this.LaneStep(luo,Math.min(REAR_LANE_M-K.guardAheadM,s+K.luoLeadM),C.speed.run,r.player.position);
  }
  /** Marks round the player where the collection comes into view (arc offsets along the lane). */
  MeetMarks(){
    const K=C.collection;
    const s=Math.max(K.liuBackM+.5,MissionRouteProjection(REAR_LANE,this.r.player.position).progress);
    const At=(ds,side=0)=>{const q=MissionRoutePoint(REAR_LANE,Math.min(REAR_LANE_M,s+ds));return {x:q.x+Math.cos(q.yaw)*side,z:q.z-Math.sin(q.yaw)*side,s:Math.min(REAR_LANE_M,s+ds)};};
    // Luo and the guard stand ahead toward the collection; at the lane's end there is no room ahead,
    // so they stand back toward SJ (where the guard comes from) and He/Liu further back.
    if(s+K.guardAheadM<=REAR_LANE_M)return {s,luo:At(K.luoAheadM),guard:At(K.guardAheadM),yaowa:At(-K.yaowaBackM,K.yaowaSideM),
      yaowaAside:At(-K.yaowaBackM,K.yaowaAsideM),he:At(-K.heBackM),liu:At(-K.liuBackM)};
    return {s,luo:At(-K.luoAheadM),guard:At(-K.guardAheadM),yaowa:At(-.2,K.yaowaSideM+.35),yaowaAside:At(-.2,K.yaowaAsideM+.35),
      he:At(-K.heBackM-.6),liu:At(-K.liuBackM-.6)};
  }
  /** Collection -> SupportOrder: Yaowa catches up (CollectionMeet), the guard runs up the sap and reports. */
  UpdateCollection(){
    const r=this.r,K=C.collection,me=r.player.position,age=this.Age;
    // Until Yaowa's line starts the group gathers round wherever the player has walked to.
    if(!this.Started("CollectionMeet"))this.meet=this.MeetMarks();
    const m=this.meet;
    const luo=this.Squad("luo"),yaowa=this.Squad("yaowa"),he=this.Squad("heyoutian"),liu=this.Squad("liuwencai"),guard=this.cast.CollectionRearGuard;
    const guardIn=this.flags.guardInAt!=null;
    // Luo ahead on the lane, facing the player and then the guard; He and Liu hold the rear (「何有田守后头」).
    if(luo?.alive)this.LaneStep(luo,m.luo.s,C.speed.run,guardIn&&guard?guard.position:me,m.luo);
    for(const [actor,mark] of [[he,m.he],[liu,m.liu]])if(actor?.alive){actor.missionCoverWaiting=true;this.LaneStep(actor,mark.s,C.speed.brisk,A.rearCorner,mark);}
    // 「幺娃从侧后赶来」; at 「莫堵到！」 Luo moves him aside against the wall for the wounded.
    const aside=this.flags.pushAsideAt!=null;
    const hurry=age>C.timeouts.collectionMeetS*.5?1.25:1;
    const yaowaIn=yaowa?.alive?this.LaneStep(yaowa,m.yaowa.s,C.speed.run*hurry,aside?m.luo:me,aside?m.yaowaAside:m.yaowa):true;
    if(this.phase==="Collection"&&!this.Started("CollectionMeet")&&(yaowaIn||!yaowa?.alive||Distance(yaowa.position,me)<2.6||age>C.timeouts.collectionMeetS)){
      this.flags.meetAt=r.time;
      this.Scene("CollectionMeet",r.voice?.PlayScene("CollectionMeet",{speakers:this.Speakers(),onLine:(lineId)=>{
        if(lineId==="CollectionMeet.03")this.flags.pushAsideAt=r.time;
      }}));
    }
    if(guard)this.GuardRun(guard,m);
    if(this.phase==="Collection"&&this.Started("CollectionMeet")&&this.SceneDone("CollectionMeet")
      &&(guardIn&&r.time-this.flags.guardInAt>=K.reportAfterS||r.time-this.flags.meetAt>C.timeouts.guardArriveS))this.Set("SupportOrder");
    if(this.phase==="SupportOrder"&&!this.Started("SupportOrder"))
      this.Scene("SupportOrder",r.voice?.PlayScene("SupportOrder",{speakers:this.Speakers(),onLine:(lineId)=>{if(lineId==="SupportOrder.04")this.flags.sapPointAt=r.time;}}));
    // 「罗班长看向支沟，抬手指过去」
    if(luo?.alive&&this.flags.sapPointAt!=null&&r.time-this.flags.sapPointAt<3)
      this.Pose(luo,"PointBlockade",{upperBody:true,seconds:r.time-this.flags.sapPointAt,face:Face(luo.position,K.sapMouth)});
  }
  /** The reporting guard: out of sight in the sap until the meeting, then up the sap to SJ and along the lane. */
  GuardRun(guard,m){
    const r=this.r,K=C.collection;
    if(this.flags.meetAt==null){this.Hide(guard);return;}
    this.guardRoute??=[...K.guardRun,...MissionRouteBetween(REAR_LANE,A.supportJunction,m.guard)];
    if(this.flags.guardInAt==null){
      if(this.Follow(guard,"report",this.guardRoute,C.speed.run,null,Face(m.guard,m.luo)))this.flags.guardInAt=r.time;
      return;
    }
    // 「扶住沟壁喘气」
    const luo=this.Squad("luo");
    // Facing the point between Luo and the player: he reports to Luo with the player in front of him.
    const to=luo?.position?{x:(luo.position.x+r.player.position.x)/2,z:(luo.position.z+r.player.position.z)/2}:r.player.position;
    this.Hold(guard,{x:m.guard.x,z:m.guard.z,yaw:Face(m.guard,to)},"MessengerReport");
  }
  /** 03: the guard falls back along the lane to the collection and stays there. */
  GuardRest(){
    const guard=this.cast.CollectionRearGuard;if(!guard?.alive)return;
    const K=C.collection;
    if(this.flags.guardRested){this.Hold(guard,K.restPost,null);return;}
    this.Show(guard);
    this.restRoute??=[...MissionRouteBetween(REAR_LANE,guard.openingStoryboardLast||guard.position,REAR_LANE.at(-1)).slice(1),K.restPost];
    if(this.Follow(guard,"rest",this.restRoute,C.speed.walk,null,K.restPost.yaw))this.flags.guardRested=true;
  }
  // ---- player body and camera -----------------------------------------------------------------
  /** World point of a player-track part of `actor`'s current clip (null when not on such a clip). */
  TrackPoint(actor,part){
    const play=actor?.openingPlay,pose=actor?.openingStoryboardPose;
    if(!pose||!PLAYER_TRACK_CLIPS.has(pose.clip))return null;
    const model=actor.actor.characterRig?.clipModelId||actor.actor.characterRig?.modelId;
    const local=OpeningPlayerPoint(model,pose.clip,part,Math.min(pose.seconds,OpeningClipMeta(pose.clip)?.duration??pose.seconds));
    if(!local)return null;
    const root=actor.openingStoryboardLast||actor.position,o=Rot(actor.yaw,local.x,local.z);
    return {x:root.x+o.x,z:root.z+o.z,h:local.y};
  }
  PlayerPoint(){
    const p=this.phase,S=C.shunzi;
    if(p==="Banter")return S.seat;
    if(p==="Orders"||p==="Incoming")return this.FollowPoint();
    if(p==="Blast")return this.BlastPoint();
    // Hauled out from under the timber by Luo, then up onto the seat.
    if(p==="Lift"){const e=this.HaulEye();return {x:e.x,z:e.z};}
    if(["Check","KickRifle","Released"].includes(p))return S.cover;
    return S.trap;
  }
  PlacePlayer(){const r=this.r,point=this.lastPlayerPoint=this.PlayerPoint(),y=r.battlefield.GroundHeight(point.x,point.z);r.player.position.set(point.x,y,point.z);r.player.body?.Teleport(point.x,y,point.z);r.player.velocity.set(0,0,0);}
  /** Camera shot of the current phase: eye point + height and a look target (world). */
  Shot(){
    const r=this.r,p=this.phase,a=this.Age,S=C.shunzi,b=C.banter;
    const Head=actor=>this.HeadPoint(actor);
    const At=(point,h)=>r.Point(point,h);
    const ijaA=this.Ija("ijaA"),comrade=this.Comrade,luo=this.Squad("luo"),interp=this.cast.interpreter,L=C.firstPerson.look;
    let eye=S.witnessEye,height=S.lieEyeM,target=At({x:4,z:-125.4},.9),roll=0,pitch=0,yaw=0,fovScale=1;
    if(p==="Banter"||p==="Orders"&&this.flags.exitAt==null){
      // SB01: from the back of the dugout out through the mouth. The eye is the seated fill clip's (the body filling the
      // charger, Script_OpeningFirstPerson.PoseFill); where the player looks is his own (HeadLook / LookLimits): the view
      // is not turned to whoever speaks, nor pitched down to the collar (09-27 review 「给到自由视角即可」).
      ({eye,height}=this.SeatEye());
      // 「几块土掉进顺子衣领。他缩起脖子」: the shoulders hunch (the hand at the collar is the first person's own layer).
      if(p==="Banter"&&this.flags.dirtAt!=null){const t=r.time-this.flags.dirtAt;height-=.04*Smooth((t-.2)/.5)*(1-Smooth((t-1.7)/.6));}
      target=this.SeatAim(eye,height,b.seatShot.pitchDeg*DEG);
    }
    else if(p==="Orders"||p==="Incoming")({eye,height,target,pitch,roll}=this.FollowShot());   // 「弹装起！……跟紧！」
    else if(p==="Blast"){
      // SB02 mirrored (contract §2.2): standing where he had followed to, knocked down onto blastFall, the head rolled
      // to the left, the north post and the dugout's north wall on the left, the mouth and the blast on the right.
      const B=b.blastShot,from=this.blastFrom||S.followTo,f=Smooth((a-B.fallStartS)/(B.fallEndS-B.fallStartS));
      const yaw0=Face(from,b.comradeBlast),pitch0=Math.atan2(1.2-S.standEyeM,Distance(from,b.comradeBlast));
      eye=this.BlastPoint();height=S.standEyeM+(B.eyeM-S.standEyeM)*f;
      target=this.Aim(eye,height,yaw0+Wrap(B.yawDeg*DEG-yaw0)*f,pitch0+(B.pitchDeg*DEG-pitch0)*f);
      roll=B.rollDeg*DEG*f+(a>B.fallStartS?.06*Math.sin((a-B.fallStartS)*14)*Math.exp(-(a-B.fallStartS)*3):0);
    }
    else if(["Black","Wake"].includes(p)){
      target=At({x:4,z:-125.6},.8);roll=-.06;
      // 「他试着撑起身体。背包带一下绷紧……又落回地面」, then the eyes drop to the clawing fingers.
      if(p==="Wake"){height+=L.pushUpM*Smooth((a-1.2)/.5)*(1-Smooth((a-1.85)/.12));pitch=L.clawPitch*Smooth((a-2)/.4);}
    }
    else if(p==="FrontPass"){target=At(A.bunkerJunction,1.1);roll=-.05;}
    else if(["CaptiveDragged","CaptiveWall","Interrogation"].includes(p)){
      // 2026-09-27: first person from the pinned eye (no cut-away camera): the group 2.3-4.2 m off, heads over the eye.
      const W=C.interrogation.witnessShot;target=this.Aim(eye,height,W.yawDeg*DEG,W.pitchDeg*DEG);roll=W.rollDeg*DEG;
    }
    else if(p==="Slash"||p==="Taunt"&&this.flags.walkOffAt==null){
      // The throat: the look follows the comrade's head (at most followDeg off the witness line, the pitch clamped).
      const W=C.interrogation.witnessShot,Q=C.interrogation.slashShot,h=Head(comrade);
      let yaw=W.yawDeg*DEG,look=W.pitchDeg*DEG;
      if(h){const e=r.Point(eye,height);yaw+=Math.max(-Q.followDeg*DEG,Math.min(Q.followDeg*DEG,Wrap(Face(eye,h)-yaw)));
        look=Math.max(Q.pitchMinDeg*DEG,Math.min(Q.pitchMaxDeg*DEG,Math.atan2(h.y-e.y,Math.hypot(h.x-e.x,h.z-e.z))-4*DEG));}
      target=this.Aim(eye,height,yaw,look);roll=W.rollDeg*DEG;
      fovScale=this.FixateScale();
    }
    else if(p==="Taunt"||p==="Found"){
      fovScale=this.FixateScale();
      // He comes walking up the trench at the eye, taunting over his shoulder; over the pinned man he stops and looks down.
      // Found: 「他试着撑起身体」 against the timber once he sees the boots coming (a small push-up that falls back).
      target=this.LookAtBody(eye,height,ijaA,-5,40)||this.Aim(eye,height,-90*DEG,12*DEG);
      if(p==="Found")height+=L.pushUpM*.6*Smooth((a-.9)/.35)*(1-Smooth((a-1.5)/.2));
    }
    else if(p==="Hold"||p==="Ask"){
      // 「日兵甲揪住他的头发把头提起来」: the eye rises liftM and tips up at his face; the slaps fling the head aside.
      const H=C.rescue.holdShot,Q=C.rescue.slap,grip=this.flags.holdGripAt!=null?Smooth((r.time-this.flags.holdGripAt)/H.liftS):0;
      const back={x:Math.sin(S.trap.yaw)*H.backM*grip,z:Math.cos(S.trap.yaw)*H.backM*grip};
      eye={x:eye.x+back.x,z:eye.z+back.z};height+=H.liftM*grip;
      const head=Head(ijaA);
      if(head){const e=r.Point(eye,height),elev=Math.atan2(head.y-e.y,Math.hypot(head.x-e.x,head.z-e.z));
        target=this.Aim(eye,height,Face(eye,head),Math.min(H.maxPitchDeg*DEG,elev-H.headAboveDeg*DEG));}
      else target=this.Aim(eye,height,-90*DEG,20*DEG);
      const k=this.SlapKick(),side=this.flags.slapSide||1;
      yaw=-side*Q.yawDeg*DEG*k;pitch=Q.pitchDeg*DEG*k;roll=side*Q.rollDeg*DEG*k;height-=Q.dropM*k;
    }
    else if(p==="Charge"||p==="Melee"){
      // Let go, the head drops back into the mud; he turns to the noise and the men pouring down the crater step, then
      // watches the two cuts in front of him and the fight going on down the trench.
      const H=C.rescue.holdShot,drop=this.flags.chargeAt!=null?1-Smooth((r.time-this.flags.chargeAt-.12)/.3):1;
      height+=H.liftM*drop;
      const he=Head(this.Squad("heyoutian")),a1=Head(ijaA),luoH=Head(luo),ijaB=Head(this.Ija("ijaB"));
      const since=this.flags.heChopAt!=null?r.time-this.flags.heChopAt:-1,luoSince=this.flags.luoChopAt!=null?r.time-this.flags.luoChopAt:-1;
      let point;
      if(since>=0&&since<1.6&&he&&a1)point=he.clone().lerp(a1,.5);
      else if(luoSince>=0&&luoSince<2.2&&luoH&&ijaB)point=luoH.clone().lerp(ijaB,.5);
      else if(p==="Melee")point=At(A.bunkerJunction,1.3);
      else point=he&&this.Squad("heyoutian")?.openingStoryboardHidden!==true?he:a1||At({x:3.3,z:-122.8},1.2);
      const e=r.Point(eye,height),elev=Math.atan2(point.y-e.y,Math.hypot(point.x-e.x,point.z-e.z));
      target=this.Aim(eye,height,Face(eye,point),Math.max(-6*DEG,Math.min(34*DEG,elev)));
      roll=.03*Math.sin(r.time*3.1);
    }
    else if(p==="Lift"){
      // Luo backs away with his fist in the collar: up at him as he hauls, then up onto the seat facing down the trench.
      // Before the grab: up at Luo squatting to take the collar; hauled face down: the mud going by and Luo's boots backing
      // away ahead (looking up he filled the lens: he is stooped right over the face); then up onto the seat.
      const E=this.HaulEye(),K=C.rescue.checkShot;eye={x:E.x,z:E.z};height=E.h;
      const since=this.flags.haulAt!=null?r.time-this.flags.haulAt:-1,down=Smooth((since-.1)/.35);
      const up=this.LookAtBody(eye,height,luo,-8,26)||this.Aim(eye,height,-90*DEG,10*DEG);
      const lead=up.lerp(this.Aim(eye,height,-90*DEG,-38*DEG),down);
      target=lead.lerp(this.Aim(eye,height,K.yawDeg*DEG,K.pitchDeg*DEG),E.sit||0);
      roll=L.dragRollRad*Math.sin(r.time*4.5)*(this.flags.haulAt!=null?1-(E.sit||0):0);
    }
    else if(p==="Check"){
      // SB06 (contract §5): forward down the trench, Luo kneeling at the left front; the nod dips the head.
      const K=C.rescue.checkShot;eye=S.cover;height=K.eyeM;target=this.Aim(eye,height,K.yawDeg*DEG,K.pitchDeg*DEG);
      if(this.flags.checkLineAt!=null){const n=r.time-this.flags.checkLineAt;if(n<.8)pitch=-.2*Math.sin(Math.PI*n/.8);}}
    else if(p==="KickRifle"){
      // The rifle slides in past his right side: the eyes drop to it (kickPitchDeg) and stay there for the hand-back
      // (Released keeps this view: pitch in -15..+5, contract §2.9).
      const K=C.rescue.checkShot,t=this.flags.kickRifleAt!=null?r.time-this.flags.kickRifleAt:0,dip=Smooth((t-.3)/.5);
      eye=S.cover;height=K.eyeM;target=this.Aim(eye,height,K.yawDeg*DEG,(K.pitchDeg+(K.kickPitchDeg-K.pitchDeg)*dip)*DEG);
    }
    return {eye,height,target,roll,pitch,yaw,fovScale};
  }
  /** 「看不出来是割喉」: from the grab the pinned eye fixes on the throat (the view narrows to interrogation.fixate.scale,
   *  first person, no cut) and widens again once ijaA lets the dying man drop and walks off. */
  FixateScale(){
    const F=C.interrogation.fixate,f=this.flags,t=this.r.time;
    if(f.slashAt==null)return 1;
    const inw=Smooth((t-f.slashAt)/F.inS),out=f.walkOffAt!=null?Smooth((t-f.walkOffAt)/F.outS):0;
    return 1-(1-F.scale)*inw*(1-out);
  }
  /**
   * The phase-start ease (`mix` 0..1) from the view the phase began on to this frame's shot, along the way the shot has
   * turned since: its heading is unwrapped frame to frame. A slerp from the first view takes the shortest arc, which
   * changes side once the shot has turned past 180 deg from it (09-27, DragOut: ijaA vaulted out round the eye's right,
   * the shot went 180 deg right and the eye spun 220 deg left).
   */
  BlendFromPhaseStart(desired,mix){
    const from=this.cameraFrom,E=new THREE.Euler().setFromQuaternion(desired,"YXZ");
    const f=from.euler??=new THREE.Euler().setFromQuaternion(from.quaternion,"YXZ");
    from.heading=from.heading==null?f.y+Wrap(E.y-f.y):from.heading+Wrap(E.y-from.heading);
    return new THREE.Quaternion().setFromEuler(new THREE.Euler(f.x+(E.x-f.x)*mix,f.y+(from.heading-f.y)*mix,f.z+Wrap(E.z-f.z)*mix,"YXZ"));
  }
  ApplyCamera(){
    const r=this.r,p=this.phase,a=this.Age;
    if(!this.CameraActive){
      // The AI left this frame's cull to the director (it still owned the view at ai.Update); cull the player's own view.
      if(r.ai?.viewOwner===this&&r.ai.cullDeferred){r.ai.cullDeferred=false;r.ai.CullActors(r.player.camera);}
      return false;
    }
    const cam=r.player.camera,shot=this.Shot(),sense=this.Perceive(),head=this.HeadLook(),still=r.opening?.reducedMotion?.matches;
    const shotId=shot.id||"firstPerson",cut=this.presentedShotId!=null&&this.presentedShotId!==shotId;
    if(cut){this.cameraFrom=null;this.presentedCamera=null;this.previousViewPosition=null;this.previousViewQuaternion=null;this.cameraCutAt=r.time;this.cameraCutSerial=(this.cameraCutSerial||0)+1;r.NotifyCameraCut?.();}
    this.presentedShotId=shotId;
    // The view narrows while he fixes on something (FixateScale); the player's own fov comes back exactly after it.
    const narrowed=(shot.fovScale??1)<.999;
    if(shot.cinematic||narrowed||this.cinematicBaseFov!=null){
      this.cinematicBaseFov??=cam.fov;cam.fov=shot.fov??this.cinematicBaseFov*(shot.fovScale??1);cam.updateProjectionMatrix();
      if(!shot.cinematic&&!narrowed){cam.fov=this.cinematicBaseFov;cam.updateProjectionMatrix();this.cinematicBaseFov=null;}
    }
    cam.position.copy(r.Point(shot.eye,shot.height));cam.lookAt(shot.target);
    const yaw=shot.cinematic?0:head.yaw+(shot.yaw||0)+(still?0:sense.yaw);
    if(yaw)cam.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(UP,yaw));
    cam.rotateX((shot.pitch||0)+(shot.cinematic?0:head.pitch+(still?0:sense.pitch)));
    cam.rotateZ((shot.roll||0)+(shot.cinematic||still?0:sense.roll));
    // Behind shut eyes (the blast's black, the butt's knock-out) the view goes straight to the shot: ijaA's turn round to
    // the haul is to be unseen there (ija.knockOut), but at cameraTurnRps it was still 60 deg from done as they opened (09-27).
    // The closure is the one this director showed last frame (r.opening's own curve is written over it before this runs).
    const shut=(this.shownEyeClosure??0)>=C.cameraShutSnap;
    if(shut)this.cameraFrom=null;
    if(!shot.cinematic&&this.cameraFrom&&a<C.cameraBlendS){
      const mix=Smooth(a/C.cameraBlendS);
      cam.position.lerpVectors(this.cameraFrom.position,cam.position,mix);
      cam.quaternion.copy(this.BlendFromPhaseStart(cam.quaternion,mix));
    }
    if(this.presentedAt!==r.time){this.previousViewQuaternion=this.presentedCamera?.quaternion.clone();this.previousViewPosition=this.presentedCamera?.position.clone();this.presentedAt=r.time;}
    if(shut){this.previousViewPosition=null;this.previousViewQuaternion=null;}
    // A slap flings the head aside faster than the view's turn and travel limits (they keep the director's eases smooth).
    const slapped=this.flags.slapAt!=null&&r.time-this.flags.slapAt>=0&&r.time-this.flags.slapAt<.25;
    if(slapped){this.previousViewPosition=null;this.previousViewQuaternion=null;}
    if(this.previousViewPosition&&this.delta>0){
      const travel=cam.position.distanceTo(this.previousViewPosition),most=C.cameraMoveMps*this.delta;
      if(travel>most)cam.position.lerpVectors(this.previousViewPosition,cam.position,most/travel);
    }
    // The turn limit smooths the director's own cuts and swings; a free seated look is the player's mouse, 1:1.
    if(this.previousViewQuaternion&&!this.LookLimits()){
      const desiredQuaternion=cam.quaternion.clone();
      cam.quaternion.copy(this.previousViewQuaternion).rotateTowards(desiredQuaternion,(shot.turnRps??C.cameraTurnRps)*(this.delta||0));
    }
    cam.updateMatrixWorld(true);
    this.presentedCamera={position:cam.position.clone(),quaternion:cam.quaternion.clone()};
    // The AI culls actors earlier in the frame against the player's own view (Script_Main runs ai.Update
    // before the mission's ApplyCamera); while the director owns the view that frustum points elsewhere and
    // actors in the shot were taken out of the scene (09-24: Luo invisible at K2, renderLod "culled" while
    // centred in frame). Cull again against the shot actually shown. From the next frame the AI skips its own
    // cull while this one owns the view (09-27: the two frusta put actors at the shot's edge in and out of
    // the scene twice a frame through Incoming and the blast, each time rescanning the scene and re-posing them).
    if(r.ai?.CullActors){r.ai.CullActors(cam);r.ai.viewOwner=this;this.culledFrame=r.ai.updateFrame;r.ai.cullDeferred=false;}
    this.MarkNotShown();
    // The HUD's incoming-fire arcs point relative to the player's own yaw, not to the director's shot, and the
    // player cannot act on them here: near misses in 01–02 showed a white arc over the frame (09-24 review:
    // "天空里浮着一个白色弧形"). They are cleared while the director owns the view.
    if(r.player?.hitMarks?.length)r.player.hitMarks.length=0;
    const opening=r.opening;
    const fade=p==="Banter"?1-Smooth((r.time-(this.started??r.time))/C.fadeInS):0;
    // Each slap shuts the eyes for a moment.
    const slap=this.flags.slapAt!=null?r.time-this.flags.slapAt:null;
    const blink=slap==null||slap<0?0:.8*Smooth(slap/.04)*(1-Smooth((slap-.1)/.14));
    const recovery=C.blackoutRecovery;
    opening.eyeClosure=this.shownEyeClosure=p==="Blast"?Smooth((a-C.banter.blastShot.eyesCloseS)/recovery.closeS):p==="Black"?1:p==="Wake"?1-Smooth(a/recovery.eyelidS):Math.max(fade,blink);
    opening.blackout=p==="Black"?1:p==="Wake"?1-Smooth(a/recovery.fadeS):0;
    // Blur / ghosting / imbalance follow one continuous curve (Perceive), no per-phase steps.
    opening.concussion=shot.cinematic?null:sense.amount>1e-3?{amount:sense.amount,focus:sense.focus,pitch:0,roll:0}:null;
    if(this.playerBody)this.firstPerson.Update(this.delta||0);
    // The loading rifle leaves his hands at the blast (pendingWiring SB02 rifleSlide); the mission rifle (the same
    // gun, in the mouth afterwards) is shown only from the black on, not at the mouth while the eyes are open.
    if(p==="Blast"&&r.bunkerRifle?.view)r.bunkerRifle.view.visible=false;
    return true;
  }
  /**
   * Concussion now (item 2): the phase's standing level eased at riseRps/fallRps, the near-miss curve
   * (from the blast) and the same curve replayed for the butt strike laid over it, a short spike for
   * ijaB's kick, and a slow irregular sway (imbalance) scaled by the amount.
   */
  Perceive(){
    const r=this.r,P=C.perception,dt=this.delta||0,now=r.time;
    const goal=P.base[this.phase]??this.perceptionLevel??0;
    let level=this.perceptionLevel??goal;
    level+=Math.max(-P.fallRps*dt,Math.min(P.riseRps*dt,goal-level));
    this.perceptionLevel=level;
    const blastAt=r.opening?.blastAt,blast=blastAt!=null?SampleOpeningPerception(now-blastAt):null;
    const strike=this.strikeAt!=null?SampleOpeningPerception(now-this.strikeAt):null;
    const kick=this.flags.slapAt!=null&&now>=this.flags.slapAt?P.kick*Math.exp(-(now-this.flags.slapAt)/P.kickFadeS):0;
    const amount=Math.min(1,Math.max(level,blast?.amount||0,(strike?.amount||0)*P.strike)+kick);
    const focus=Math.min(1,Math.max(level*P.focusScale,blast?.focus||0,(strike?.focus||0)*P.strike));
    const W=P.wobble,TAU=Math.PI*2;
    const Sway=phase=>.5*Math.sin(now*TAU*W.hz[0]+phase)+.3*Math.sin(now*TAU*W.hz[1]+phase*1.7)+.2*Math.sin(now*TAU*W.hz[2]+phase*2.3);
    return this.perception={amount,focus,level,
      roll:(blast?.roll||0)+(strike?.roll||0)*P.strike+W.rollRad*amount*Sway(0),
      pitch:(blast?.pitch||0)+(strike?.pitch||0)*P.strike+W.pitchRad*amount*Sway(1.3),
      yaw:W.yawRad*amount*Sway(2.9)};
  }
  /** 「玩家只能小幅转头」: the player's own look, clamped, eased back to centre outside the free phases. Seated in the
   *  dugout the look is free within headLook.seated (LookLimits) and eases back over its returnS after the order. */
  HeadLook(){
    const r=this.r,H=C.firstPerson.headLook,ctl=r.controls,dt=this.delta||0,wide=this.LookLimits(),free=wide||H.free.includes(this.phase)?1:0;
    const was=this.headFree??0;this.headFree=wide?1:was+Math.max(-dt/H.returnS,Math.min(dt/H.returnS,free-was));
    if(!ctl||!Number.isFinite(ctl.yaw)||!Number.isFinite(ctl.pitch))return {yaw:0,pitch:0};
    const Cl=(v,range)=>Math.max(range?range[0]:-H.maxRad,Math.min(range?range[1]:H.maxRad,v));
    let yaw=Wrap(r.player.yaw-ctl.yaw),pitch=r.player.pitch-ctl.pitch;
    // Coming back from a wide seated look: keep what was shown and ease it home (no snap to ±maxRad first).
    const returning=!free&&Math.max(Math.abs(yaw),Math.abs(pitch))>H.maxRad;
    if(!returning){yaw=Cl(yaw,wide?.yaw);pitch=Cl(pitch,wide?.pitch);}
    if(!free){const k=Math.max(0,1-dt/(returning?H.seated.returnS:H.returnS));yaw*=k;pitch*=k;r.player.yaw=ctl.yaw+yaw;r.player.pitch=ctl.pitch+pitch;}
    this.headLook={yaw:yaw*this.headFree,pitch:pitch*this.headFree,free};
    return this.headLook;
  }
  /** After the hand-back (player in control) the concussion residue fades out; null once gone. */
  ReleasedPerception(){
    if(this.releaseAt==null)return null;
    const t=(this.r.time-this.releaseAt)/C.perception.releaseDecayS;if(t>=1||t<0)return null;
    const amount=(this.releaseLevel||0)*(1-Smooth(t));
    return {amount,focus:amount*C.perception.focusScale,pitch:0,roll:0};
  }
  /** The lens clocks (Script_OpeningLens): the near miss, the last slap and its side, the concussion. */
  LensEvents(){return {blastAt:this.r.opening?.blastAt,slapAt:this.flags.slapAt,slapSide:this.flags.slapSide,concussion:this.perception?.amount};}
  /** Hearing muffle (0..1) the opening asks for now (「翻译的声音忽远忽近」 while dazed; the residue after). */
  HearingAmount(){
    const P=C.perception;
    if(this.CameraActive)return (this.perception?.amount||0)*P.hearing*(1+.18*Math.sin(this.r.time*1.3));
    return (this.ReleasedPerception()?.amount||0)*P.hearing;
  }
  VoicePosition(cue,line){
    if(!["Trapped","BunkerRescue","RearTrench","Support"].includes(this.r.flow.stage.id))return null;
    return this.HeadPoint(this.SpeakerActor(line?.who));
  }
  SpeakerActor(role){
    if(!role)return null;
    const stage=this.r.flow.stage.id;
    if(["ijaA","ijaB","ijaC","ijaD"].includes(role))return this.Ija(role);
    if(role==="comrade"||role==="captiveHelper")return this.cast.comrade||null;
    if(role==="interpreter")return this.cast.interpreter||null;
    if(role==="shouter")return this.cast.shouter||null;
    if(role==="runner")return ["Trapped","BunkerRescue"].includes(stage)?this.cast.runner:this.r.opening.runner?.actor;
    if(role==="guard")return this.cast.CollectionRearGuard||this.r.opening.runner?.actor;
    if(role==="zhou")return this.r.opening.zhou;
    return this.Squad(role);
  }
  /** Who is talking now: the director's scenes, then any other per-line scene (the 03 front commands that
   *  Script_FirstLevelFrontScenes plays through voice.PlayScene while this director still acts the squad in
   *  Support), then the legacy whole-cue queue. Without the second the speaking body got the listener's acting
   *  and its own head layer was held off (09-24: Luo's FrontBlockade…FrontWithdraw lines, mouth only). */
  CurrentSpeaker(){
    const Playing=handle=>{
      if(!handle||handle.done||handle.paused)return null;
      const playing=handle.lines?.filter(line=>line.state==="playing");
      if(!playing?.length)return null;
      const line=playing.at(-1);return {who:line.line.who,cue:handle.id,line:line.line.index,seconds:line.t};
    };
    for(const handle of Object.values(this.scenes)){const current=Playing(handle);if(current)return current;}
    for(const handle of this.r.voice?.scenes?.values?.()||[]){const current=Playing(handle);if(current)return current;}
    const current=this.r.voice?.current;
    if(current?.phase==="playing"&&!this.r.voice?.paused){
      const index=current.plan.lines.findIndex(([start,end])=>current.sourceTime>=start&&current.sourceTime<end);
      if(index>=0)return {who:current.cue.lines[index].who,cue:current.cue.id,line:index,seconds:current.sourceTime-current.plan.lines[index][0]};
    }
    return null;
  }
  UpdatePerformances(){
    const stage=this.r.flow.stage.id;
    if(!["Trapped","BunkerRescue","RearTrench","Support"].includes(stage)){
      for(const actor of this.performanceActors||[])ClearOpeningActorPerformance(actor);
      this.performanceActors?.clear();return;
    }
    this.performanceActors??=new Set();
    const current=this.CurrentSpeaker(),speaker=current?.who||null;
    const speakerPoint=speaker==="shunzi"?this.r.player.camera.position:this.HeadPoint(this.SpeakerActor(speaker));
    const messengerRole=["Trapped","BunkerRescue"].includes(stage)?"runner":"guard";
    for(const role of ["luo","yaowa","heyoutian","liuwencai",messengerRole,"shouter","interpreter","comrade","ijaA","ijaB","ijaC","ijaD","zhou"]){
      const actor=this.SpeakerActor(role);if(!actor)continue;
      if(!actor.alive||actor.openingStoryboardHidden){UpdateOpeningStoryboardCorpse(actor);ClearOpeningActorPerformance(actor);continue;}
      let lookAt=speakerPoint;
      if(role===speaker)lookAt=role==="runner"?this.HeadPoint(this.SpeakerActor("luo")):role==="interpreter"&&this.phase==="Interrogation"?this.HeadPoint(this.Comrade)
        :["ijaA","ijaB"].includes(role)&&["Interrogation","Slash","Taunt"].includes(this.phase)?this.HeadPoint(this.Comrade):this.r.player.camera.position;
      // 2026-09-27: ijaA taunts back over his shoulder at the dying man as he walks off; from Found on his face is on
      // the pinned man (the camera); at the charge he snaps round to the men coming down the step.
      if(role==="ijaA"&&this.phase==="Taunt")lookAt=this.HeadPoint(this.Comrade)||lookAt;
      if(role==="ijaA"&&["Found","Hold","Ask"].includes(this.phase))lookAt=this.r.player.camera.position;
      if(["ijaA","ijaB"].includes(role)&&this.phase==="Charge")lookAt=this.HeadPoint(this.Squad(role==="ijaA"?"heyoutian":"luo"))||lookAt;
      InstallOpeningStoryboardAnimation(actor);
      const speech=this.r.voice?.Speech?.(role);
      SetOpeningActorPerformance(actor,{role,phase:["Trapped","BunkerRescue"].includes(stage)?this.phase:stage,
        cue:current?.cue||null,line:current?.line??-1,speaker,clock:this.r.time,lineSeconds:current?.seconds||0,
        speechLevel:speech?.level,lookAt});
      this.performanceActors.add(actor);
    }
  }
  Reset(){
    this.Dispose();
    for(const [id,actor] of Object.entries(this.cast))this.r.ai.Remove(actor);
    for(const p of this.pursuit||[])if(p.actor?.alive)this.r.ai.Remove(p.actor);
    this.cast={};this.captives=[];this.playerBody=null;this.setup=false;this.phase=null;this.at=this.r.time;this.started=this.r.time;
    this.scenes={};this.flags={};this.events=[];this.beats.clear();this.pursuit=null;this.pursuitSpawned=false;this.pursuitMissing=0;this.withdraw=null;
    this.firstPerson=null;this.firstPersonState=null;this.presentedAt=null;this.previousViewQuaternion=null;this.previousViewPosition=null;
    this.strikeAt=null;this.bloodMask=0;this.cameraFrom=null;this.shownEyeClosure=null;this.presentedCamera=null;this.pointActor=null;this.phaseEntered=null;
    this.slaps=null;this.noiseDone=null;this.roofLift=0;
    this.perception=null;this.perceptionLevel=null;this.headFree=0;this.headLook=null;this.releaseAt=null;this.releaseLevel=null;
    this.meet=null;this.guardRoute=null;this.restRoute=null;this.clawPath=null;this.blastFrom=null;this.seatEyeM=null;
    for(const actor of [...this.r.squad,...this.r.enemies.values()]){
      if(actor.openingCombatReleased)actor.missionFireHold=false;
      actor.openingCombatReleased=false;actor.openingStoryboardLast=null;actor.openingStoryboardPose=null;actor.openingStoryboardTravel=null;
      actor.openingStoryboardContact=null;actor.openingStoryboardAim=0;actor.openingPlay=null;actor.openingWalk=null;actor.openingAdopted=false;
    }
  }
  State(){
    const actors=Object.fromEntries(Object.entries(this.cast).map(([id,a])=>[id,{x:a.position.x,z:a.position.z,alive:a.alive,clip:a.openingStoryboardPose?.clip}]));
    for(const role of ["ijaA","ijaB","ijaC","ijaD"]){const a=this.Ija(role);if(a)actors[role]={x:a.position.x,z:a.position.z,alive:a.alive,clip:a.openingStoryboardPose?.clip,released:!!a.openingCombatReleased};}
    for(const id of ["luo","yaowa","heyoutian","liuwencai"]){const a=this.Squad(id);if(a)actors[id]={x:a.position.x,z:a.position.z,alive:a.alive,clip:a.openingStoryboardPose?.clip,hidden:!!a.openingStoryboardHidden};}
    return {phase:this.phase,phaseTime:this.Age,ready:this.ready,error:this.error,beats:[...this.beats],events:this.events.slice(-60),
      flags:Object.fromEntries(Object.entries(this.flags).filter(([,v])=>typeof v!=="object"||v===null)),
      captives:this.captives.map(a=>({id:a.missionId,alive:a.alive,x:a.position.x,z:a.position.z})),actors,
      pursuit:(this.pursuit||[]).map(p=>({id:p.spec.id,alive:p.actor.alive,x:p.actor.position.x,z:p.actor.position.z})),
      rifle:this.r.bunkerRifle?.position?{...this.r.bunkerRifle.position}:null,withdraw:this.withdraw?.step??null,
      perception:this.perception?{amount:this.perception.amount,focus:this.perception.focus,level:this.perception.level}:null,
      headLook:this.headLook||null,meet:this.meet?{s:this.meet.s}:null};
  }
  Dispose(){
    if(this.r.ai?.viewOwner===this)this.r.ai.viewOwner=null;
    if(this.cinematicBaseFov!=null){this.r.player.camera.fov=this.cinematicBaseFov;this.r.player.camera.updateProjectionMatrix();this.cinematicBaseFov=null;}
    this.presentedShotId=null;
    this.ReleaseMeleeDormancy();
    for(const actor of this.performanceActors||[])ClearOpeningActorPerformance(actor);this.performanceActors?.clear();
    this.r.hud.SetStoryBlood?.(0);this.supplyRoot?.removeFromParent();this.playerBody?.root.removeFromParent();this.playerBody?.Dispose?.();
    this.r.openingSet?.LiftRoofTimber?.(0);this.ClearMudMarks();this.mudMaterial=null;
    for(const prop of this.rifleProps)prop.removeFromParent();this.rifleProps=[];
    for(const material of this.owned)material.dispose();for(const geometry of this.ownedGeometry||[])geometry.dispose();this.owned=[];this.ownedGeometry=[];
  }
}
