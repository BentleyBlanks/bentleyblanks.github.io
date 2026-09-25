import * as THREE from "three";
import { OPENING_STORYBOARDS as C } from "./Data_OpeningStoryboards.mjs";
import { MISSION_PLACEMENT as P, MISSION_ANCHORS as A } from "./Data_FirstLevelMissionLayout.mjs";
import { MISSION_ENCOUNTERS } from "./Data_FirstLevelMission.mjs";
import { FRONT_SPACE } from "./Data_FirstLevelFrontRoute.mjs";
import { LoadOpeningStoryboardAnimation, InstallOpeningStoryboardAnimation, SetOpeningActorPerformance, ClearOpeningActorPerformance,
  UpdateOpeningStoryboardCorpse, OpeningStage, OpeningClipMeta, OpeningClipRoot, OpeningPlayerPoint, OpeningPropConfig,
  OwnOpeningProp, DropOpeningWeapon } from "./Script_OpeningStoryboardAnimation.mjs";
import { OpeningPropSet } from "./Script_OpeningProps.mjs";
import { OpeningFirstPerson, TrimOpeningPlayerBody } from "./Script_OpeningFirstPerson.mjs";
import { WEAPONS } from "./Data_Weapons.mjs";
import { SpeakingCastOptions } from "./Data_FirstLevelSpeakingCast.mjs";
import { MISSION_STAGE_ROUTES } from "./Data_FirstLevelMissionTopology.mjs";
import { MissionRouteProjection, MissionRoutePoint, MissionRouteLength, MissionRouteBetween } from "./Script_FirstLevelMissionColumn.mjs";
import { SampleOpeningPerception } from "./Script_FirstLevelOpening.mjs";
import { BuildSink } from "./Script_World.mjs";
import { InCameraView } from "./Script_FirstLevelBackdropSquads.mjs";
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
const TRAPPED=new Set(C.phases.Trapped),RESCUE=new Set(C.phases.BunkerRescue);
const UP=new THREE.Vector3(0,1,0);
// 02 -> 03: the player's way out along the rear trench (return spot ... RC ... SJ ... collection).
const REAR_LANE=MISSION_STAGE_ROUTES.rearTrench,REAR_LANE_M=MissionRouteLength(REAR_LANE);
const OPENING_MARK_STAGES=new Set(["Trapped","BunkerRescue","RearTrench","Support","MachineGun","Tank","Orders"]);
// Player-track owners: the clips whose `player` track says where Shunzi's body is.
const PLAYER_TRACK_CLIPS=new Set(["IjaCollarDragSnag","IjaKickBeam","IjaButtStrike","IjaHoldCollarUp","LuoDragToCover","LuoKneelCheck","InterpreterCrouchAsk","InterpreterGrabCollar"]);

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
  }
  Begin(){this.at=this.r.time;this.started=this.r.time;}
  get Age(){return this.r.time-this.at;}
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
    if(this.setup)return;this.setup=true;
    const r=this.r,b=C.banter,stage=r.flow.stage.id;
    this.Spawn("comrade","nra",b.comradeSeat,{...SpeakingCastOptions("comrade")});
    this.captives=[this.cast.comrade];
    this.Spawn("runner","nra",b.runnerRoute[0],SpeakingCastOptions("runner"));
    this.Spawn("shouter","nra",b.shouter,SpeakingCastOptions("shouter"));
    // NRA06 wears the interpreter's own plain clothes (no uniform tint to override).
    this.Spawn("interpreter","ija",C.ija.interpreterEnter[0],{unarmed:true,actorKind:"nra",...SpeakingCastOptions("interpreter")});
    for(const actor of r.squad){InstallOpeningStoryboardAnimation(actor);if(["luo","heyoutian"].includes(actor.castId))PinOpeningScale(actor);}
    this.AdoptAssault();
    this.playerBody=r.actorFactory.Create("nra",{weapon:null,modelVariant:1,seed:101});
    this.playerBody.characterRig?.SetHeadVisible?.(false);
    // First-person body (Eye package): the arms as before, plus the legs and boots on their own hidden
    // SkinnedMesh (same skeleton), shown by OpeningFirstPerson while a leg pose is solved; torso and head cut.
    this.ownedGeometry=[...TrimOpeningPlayerBody(this.playerBody).geometries];
    this.playerProxy={actor:this.playerBody};InstallOpeningStoryboardAnimation(this.playerProxy);
    r.scene.add(this.playerBody.root);
    this.MakeSupplyProps();
    this.MakeBeam();
    this.firstPerson=new OpeningFirstPerson(this);
    if(stage==="Trapped"||stage==="BunkerRescue")this.MoveRifle(C.rescue.rifleMouth,true);
    if(stage==="Trapped"&&!r.Has("bunkerCollapsed")){
      const b=C.banter,trap=C.shunzi.trap;
      for(const [actor,mark,face] of [[this.Squad("yaowa"),b.yaowa,trap],[this.Squad("luo"),b.luo,{x:8,z:-125}],[this.Squad("heyoutian"),b.he,{x:9,z:-125.3}],
        [this.Squad("liuwencai"),b.liu,{x:10,z:-124.4}],[this.cast.shouter,b.shouter,{x:12,z:-122.9}],[this.cast.comrade,b.comradeSeat,null]])
        if(actor)this.Put(actor,{...mark,yaw:mark.yaw??Face(mark,face)});
      this.Stage("Banter");return;
    }
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
    this.flags.comradeDead=true;
    const shouter=this.cast.shouter;
    if(shouter?.alive){this.Put(shouter,{...C.banter.shouter,yaw:Face(C.banter.shouter,C.banter.shellAt)});this.Kill(shouter,"explosion");}
    this.Hide(this.cast.runner);
    if(fled&&this.cast.interpreter){const interp=this.cast.interpreter;interp.scriptEssential=false;this.Hide(interp);r.ai.Remove(interp);delete this.cast.interpreter;this.flags.interpreterGone=true;}
    this.beamState="kicked";this.PlaceBeam("kicked");
  }
  /** 02 start after a jump: comrade dead against the wall, beam kicked, the circle round Shunzi. */
  StageRescue(){
    const r=this.r;
    this.StageAftermath();
    // The circle is already round him: the interpreter and ijaB start on their marks, not at their spawns.
    const m=this.CircleMarks();
    if(this.cast.interpreter)this.Put(this.cast.interpreter,m.interpreter);
    for(const role of ["ijaA","ijaB","ijaC","ijaD"])this.Show(this.Ija(role));
    if(this.Ija("ijaB"))this.Put(this.Ija("ijaB"),m.ijaBGuard);
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
  /** The loose beam across Shunzi's pack (manifest props.beam, IjaKickBeam root frame). */
  MakeBeam(){
    const donor=this.Comrade?.actor;
    const set=new OpeningPropSet({materials:donor?.materials||{},root:null},OpeningPropConfig("beam")?{beam:OpeningPropConfig("beam")}:{});
    const item=set.Item("beam");if(!item)return;
    this.beam=item.object;this.beam.visible=false;this.r.scene.add(this.beam);
    this.ownedGeometry.push(this.beam.geometry);
  }
  /** The root ijaA stands on to snag, kick and drag Shunzi out: derived from the collar track. */
  SnagRoot(){
    const s=C.shunzi.trap,yaw=Math.PI/2;   // ijaA faces west into the pit
    const collar={x:s.x+Math.sin(s.yaw)*C.shunzi.lieCollarBackM,z:s.z+Math.cos(s.yaw)*C.shunzi.lieCollarBackM};
    const track=OpeningPlayerPoint("LugouIja02","IjaCollarDragSnag","collar",0)||{x:.02,z:-.57};
    const o=Rot(yaw,track.x,track.z);
    return {x:collar.x-o.x,z:collar.z-o.z,yaw};
  }
  PlaceBeam(state,mix=1,from="pinned"){
    const beam=this.beam,poses=OpeningPropConfig("beam")?.poses;if(!beam||!poses)return;
    const root=this.SnagRoot(),a=poses[from],b=poses[state]||a;
    const lerp=(u,v)=>u.map((x,i)=>x+(v[i]-x)*Smooth(mix));
    const centre=lerp(a.centre,b.centre),axis=lerp(a.axis,b.axis);
    const c=Rot(root.yaw,centre[0],centre[2]),d=Rot(root.yaw,axis[0],axis[2]);
    const x=root.x+c.x,z=root.z+c.z;
    beam.position.set(x,this.r.battlefield.GroundHeight(x,z)+centre[1],z);
    beam.quaternion.setFromUnitVectors(new THREE.Vector3(1,0,0),new THREE.Vector3(d.x,axis[1],d.z).normalize());
    beam.visible=true;beam.updateMatrixWorld(true);
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
  Put(actor,point,{noBlend=false}={}){
    if(!actor)return;
    // A re-root (under 1.5 m: a clip hand-over or a paired stage) keeps the displayed body; a longer
    // Put is a placement (a debug start, an actor brought on out of sight) and is instant.
    // Measured against the director's own last placement: between director frames the (dormant) AI
    // turns the actor toward its last-known position, and treating that as a re-root restarted the pose
    // blend every frame (09-24 review: ijaA frozen and sinking through the ground for all of 02).
    const root=actor.actor?.root,last=actor.openingStoryboardLast,fresh=last&&this.r.time-(last.time??-Infinity)<=.25;
    const from=fresh?last:root?.position,shift=from?Math.hypot(from.x-point.x,from.z-point.z):0;
    const shownYaw=fresh&&Number.isFinite(actor.openingStoryboardYaw)?actor.openingStoryboardYaw:actor.yaw;
    const moved=root&&root.visible&&!actor.openingStoryboardHidden&&shift<1.5
      &&(shift>.01||Number.isFinite(point.yaw)&&Math.abs(Wrap(point.yaw-shownYaw))>.01);
    const keep=moved?KeepSkeleton(actor):null;
    this.r.PlaceActor(actor,point);actor.openingStoryboardLast={x:point.x,z:point.z,time:this.r.time};
    if(Number.isFinite(point.yaw)){actor.yaw=point.yaw;actor.actor.root.rotation.y=point.yaw;}
    actor.openingStoryboardYaw=actor.yaw;
    actor.openingStoryboardTravel=0;
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
   * Move a root toward `point` at `speed` (no physics: a director walk cannot jam), turn at
   * turnRps toward `face` (a point, a yaw, or the direction of travel), and pose `clip`.
   * Returns true when within arriveM.
   */
  Move(actor,point,face,clip,speed=C.speed.walk,{seconds=null,upperBody=false,holdUntil=null,additive=null,aim=0}={}){
    if(!actor)return false;
    const dt=this.delta||0;
    actor.openingStoryboardHidden=false;actor.actor.root.visible=true;
    // A mark older than a few frames is stale (the squad AI has moved the actor since): walk from where he is.
    const stale=actor.openingStoryboardLast&&this.r.time-(actor.openingStoryboardLast.time??-Infinity)>.25;
    const last=stale?null:actor.openingStoryboardLast,from=last?{x:last.x,z:last.z}:{x:actor.position.x,z:actor.position.z};
    // The facing the director showed last frame (the AI may have turned him since): turn from there.
    if(last&&Number.isFinite(actor.openingStoryboardYaw))actor.yaw=actor.openingStoryboardYaw;
    const distance=Distance(from,point),step=Math.min(distance,speed*dt);
    const to=distance>1e-5?{x:from.x+(point.x-from.x)*step/distance,z:from.z+(point.z-from.z)*step/distance}:{x:point.x,z:point.z};
    const travel=dt>0?Distance(from,to)/dt:0;
    actor.openingStoryboardTravel=travel;
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
    actor.yaw+=Math.max(-C.turnRps*dt,Math.min(C.turnRps*dt,Wrap(desired-actor.yaw)));
    actor.watchYaw=actor.yaw;actor.watchUntil=this.r.ai.time+1;
    if(clip){
      const age=this.PlayClip(actor,clip,{holdUntil,additive});
      actor.openingStoryboardPose={clip,seconds:seconds??age,upperBody,holdUntil:actor.openingPlay.holdUntil,additive};
    }else actor.openingStoryboardPose=travel>.1||!actor.actor.weaponId||actor.actor.weaponId==="Dadao"?null:{clip:"IjaBayonetGuard",seconds:this.r.time};
    actor.openingStoryboardAim=aim;
    actor.actor.root.rotation.y=actor.yaw;actor.openingStoryboardYaw=actor.yaw;
    InstallOpeningStoryboardAnimation(actor);
    return Distance(to,point)<C.arriveM;
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
    while(walk.index<route.length-1&&Distance(at,route[walk.index])<.3)walk.index++;
    const last=walk.index===route.length-1;
    const arrived=this.Move(actor,route[walk.index],last&&Distance(at,route[walk.index])<.3?faceEnd:null,clip,speed,options);
    return last&&arrived;
  }
  /** Land on a stage root without a jump: an arrival gate leaves up to ~0.15 m, walked here at run speed. */
  Settle(actor,root){
    if(!actor)return;
    const at=actor.openingStoryboardLast||actor.position;
    if(Distance(at,root)<.01){this.Put(actor,root);return;}
    this.Move(actor,root,Number.isFinite(root.yaw)?root.yaw:null,null,C.speed.run);
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
  ComradeWallRoot(){return this.ChainRoot(C.banter.comradeBlast,"LugouNra02","CaptiveDraggedFromDirt","CaptiveWallBrace");}
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
    this.Stage("Blast");
    r.voice?.Signal?.("Blast");
    r.combat?.FireShell(r.Point(b.shellFrom,14),r.Point(b.shellAt),{flight:.22,damage:0,radius:4,incoming:false});
    r.audio?.Play?.("debrisFall",{position:r.Point(C.shunzi.trap,1),volume:.9});
    const shouter=this.cast.shouter;
    if(shouter?.alive)this.Kill(shouter,"explosion");
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
      if(!actor?.renderLod||actor.renderLod==="detail")continue;
      const posed=actor.alive&&!actor.openingStoryboardHidden&&(actor.openingStoryboardPose||actor.openingStoryboardTravel!=null);
      if(posed)actor.actor.root.visible=true;else actor.openingNotShown=true;
    }
  }
  // -- 01 -------------------------------------------------------------------------------------
  Tableau(){
    const r=this.r,b=C.banter,luo=this.Squad("luo"),yaowa=this.Squad("yaowa"),he=this.Squad("heyoutian"),liu=this.Squad("liuwencai");
    const comrade=this.Comrade,trap=C.shunzi.trap;
    for(const role of ["ijaA","ijaB","ijaC","ijaD"])this.Hide(this.Ija(role));
    this.Hide(this.cast.interpreter);this.Hide(this.cast.runner);
    Equip(yaowa,null);
    this.Hold(yaowa,{...b.yaowa,yaw:Face(b.yaowa,trap)},"ClipLoad",{additive:this.flags.laughAt!=null&&r.time-this.flags.laughAt<1.6?{clip:"BanterLaugh",seconds:r.time-this.flags.laughAt,weight:1}:null});
    this.Hold(luo,{...b.luo,yaw:Face(b.luo,{x:8,z:-125})},null);
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
    const runnerIn=this.flags.exitAt==null&&this.Follow(runner,"orders",b.runnerRoute,C.speed.run,null,luo?.position);
    if(this.flags.exitAt==null){
      if(runnerIn||Distance(runner.position,b.runnerRoute.at(-1))<.4)this.Hold(runner,{...b.runnerRoute.at(-1),yaw:Face(b.runnerRoute.at(-1),b.luo)},"MessengerReport");
      if(!this.Started("BunkerOrders")&&(runnerIn||age>C.timeouts.runnerArriveS)){
        this.Scene("BunkerOrders",r.voice?.PlayScene("BunkerOrders",{speakers:this.Speakers(),onLine:(lineId)=>{if(lineId==="BunkerOrders.02")this.flags.luoTurnAt=r.time;}}));
      }
      const lookFront=this.Started("BunkerOrders")&&this.flags.luoTurnAt==null;
      this.Hold(luo,{...b.luo,yaw:lookFront?-Math.PI/2:Face(b.luo,trap)},this.flags.luoTurnAt!=null?"PointBlockade":null,{upperBody:true});
      this.Tableau2(yaowa,he,liu,comrade);
      if(this.Started("BunkerOrders")&&this.SceneDone("BunkerOrders"))this.flags.exitAt=r.time;
      if(age>C.timeouts.runnerArriveS+8)this.flags.exitAt??=r.time;
      return;
    }
    // Everyone leaves by the mouth and the south-south-west leg; they disappear beyond RC.
    const since=r.time-this.flags.exitAt;
    for(const [id,actor,delay,speed] of [["luo",luo,0,C.speed.walk],["runner",runner,.2,C.speed.run],["yaowa",yaowa,.5,C.speed.walk],
      ["he",he,.9,C.speed.walk],["liu",liu,1.3,C.speed.walk]]){
      if(!actor)continue;
      if(since<delay){this.Pose(actor,null);continue;}
      if(this.Follow(actor,"exit",b.exitRoute,speed,null))this.Hide(actor);
    }
    Equip(yaowa,yaowa?.weaponId||"HanYang");
    // The wounded comrade braces on the wall, stands (rise clip), then squeezes out of the mouth.
    const rise=since-.4;
    if(rise<0)this.Hold(comrade,b.comradeSeat,"WoundedSitRifleIdle");
    else if(rise<2.8)this.Pose(comrade,"WoundedRiseWall");
    else{
      if(!this.flags.comradeStood){this.flags.comradeStood=true;this.RerootUnderPelvis(comrade,this.ChainRoot(b.comradeSeat,"LugouNra02","WoundedRiseWall","MessengerReport").yaw);}
      if(this.Hold(comrade,b.comradeBlast,null,{speed:C.speed.walk})||since>C.timeouts.ordersExitS)this.Stage("Incoming");
    }
  }
  Tableau2(yaowa,he,liu,comrade){
    const b=C.banter,trap=C.shunzi.trap;
    this.Hold(yaowa,{...b.yaowa,yaw:Face(b.yaowa,trap)},"ClipLoad");
    this.Hold(he,{...b.he,yaw:-Math.PI/2},null);this.Hold(liu,{...b.liu,yaw:-Math.PI/2},null);
    this.Hold(comrade,b.comradeSeat,"WoundedSitRifleIdle");
    this.Hold(this.cast.shouter,{...b.shouter,yaw:-Math.PI/2},null);
  }
  PhaseIncoming(age){
    const r=this.r,b=C.banter;
    if(!this.phaseEntered){
      this.phaseEntered=true;
      this.Scene("BunkerIncoming",r.voice?.PlayScene("BunkerIncoming",{speakers:this.Speakers()}));
    }
    this.Hold(this.Comrade,b.comradeBlast,null);
    this.Hold(this.cast.shouter,{...b.shouter,yaw:Face(b.shouter,b.shellFrom)},null);
    this.ExitSquad();
    // BunkerIncoming.01 is cut by the blast (its cutEvent BunkerBlast reaches FirstLevelOpening).
    if(age>C.timeouts.blastEventS){if(r.opening.blastAt!=null||r.opening.bunker?.blastAt!=null)this.Blast();else r.opening.BunkerBlast();}
  }
  ExitSquad(){
    const b=C.banter;
    for(const [id,actor,speed] of [["luo",this.Squad("luo"),C.speed.walk],["runner",this.cast.runner,C.speed.run],["yaowa",this.Squad("yaowa"),C.speed.walk],
      ["he",this.Squad("heyoutian"),C.speed.walk],["liu",this.Squad("liuwencai"),C.speed.walk]]){
      if(!actor||actor.openingStoryboardHidden)continue;
      if(this.Follow(actor,"exit",b.exitRoute,speed,null))this.Hide(actor);
    }
  }
  PhaseBlast(age){
    const comrade=this.Comrade;
    if(!this.phaseEntered){this.phaseEntered=true;this.PlayClip(comrade,"BlastSlamBuried",{restart:true});this.MoveRifle(C.rescue.rifleMouth,true);}
    this.Put(comrade,C.banter.comradeBlast);this.Pose(comrade,"BlastSlamBuried");
    this.beamState="pinned";this.PlaceBeam("pinned");
    this.ExitSquad();
    if(age>=.5)this.Stage("Black");
  }
  PhaseBlack(age){
    this.Pose(this.Comrade,"BlastSlamBuried");this.ExitSquad();
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
    this.Pose(this.Comrade,"BlastSlamBuried");
    this.VanguardFront(this.flags.vanguardAt);
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
  PhaseFrontPass(age){
    const r=this.r,marks=this.DragMarks();
    this.Pose(this.Comrade,"BlastSlamBuried");
    this.VanguardFront(this.flags.vanguardAt);
    let ready=0;
    for(const role of ["ijaA","ijaB"]){
      const actor=this.Ija(role);if(!actor)continue;
      if(r.time-this.flags.vanguardAt<C.ija.walkInDelayS[role]){this.Hide(actor);continue;}
      const mark=marks[role];
      if(this.Follow(actor,"walkIn",[...C.ija.walkIn,mark],age>C.timeouts.walkInS?C.speed.run:C.speed.brisk,null,mark.yaw)){
        if(this.Hold(actor,mark,null))ready++;
      }
    }
    if(ready===2)this.Stage("CaptiveDragged");
    else if(age>C.timeouts.frontPassS){
      // Late from the spawn queue (or held up): whoever is here stands on his mark, the drag goes on.
      for(const role of ["ijaA","ijaB"]){const actor=this.Ija(role);if(actor){this.Show(actor);this.Put(actor,marks[role]);}}
      this.flags.frontPassForced=r.time;this.Stage("CaptiveDragged");
    }
  }
  /** The interpreter squeezes in from the junction while the comrade is dragged and shoved. */
  InterpreterIn(m=this.InterrogationMarks()){
    const interp=this.cast.interpreter;if(!interp)return true;
    if(this.flags.interpIn){this.Hold(interp,m.interpreter,"InterpreterCrouchAsk");return true;}
    this.Show(interp);
    if(this.Follow(interp,"enter",[...C.ija.interpreterEnter,m.interpreter],C.speed.walk,null,m.interpreter.yaw)){this.flags.interpIn=true;}
    return !!this.flags.interpIn;
  }
  PhaseCaptiveDragged(age){
    const r=this.r,comrade=this.Comrade,ijaA=this.Ija("ijaA"),ijaB=this.Ija("ijaB"),marks=this.DragMarks();
    if(!this.phaseEntered){
      this.phaseEntered=true;
      this.Scene("CaptiveDragged",r.voice?.PlayScene("CaptiveDragged",{speakers:this.Speakers()}));
      // The jerk-up (clip 2.2 s) lands on 「立て！」 (CaptiveDragged.02).
      this.flags.dragStart=r.time+Math.max(0,this.LineStart("CaptiveDragged","CaptiveDragged.02")-EventAt("IjaDragCollarFromDirt","jerkUp",2.2));
    }
    this.VanguardFront(this.flags.vanguardAt);
    const t=r.time-this.flags.dragStart;
    this.InterpreterIn();
    if(t<0){this.Pose(comrade,"BlastSlamBuried");this.Hold(ijaA,marks.ijaA,null);this.Hold(ijaB,marks.ijaB,null);return;}
    this.Put(comrade,C.banter.comradeBlast);this.Pose(comrade,"CaptiveDraggedFromDirt",{seconds:t});
    this.Put(ijaA,marks.ijaA);this.Pose(ijaA,"IjaDragCollarFromDirt",{seconds:t});
    this.Put(ijaB,marks.ijaB);this.Pose(ijaB,"IjaPullArm",{seconds:t});
    if(t>=ClipLength("IjaDragCollarFromDirt",4.4))this.Stage("CaptiveWall");
  }
  /** Interrogation marks round the kneeling comrade (his wall root R3). */
  InterrogationMarks(){
    const wall=this.ComradeWallRoot(),I=C.interrogation;
    return {wall,ijaA:this.StageRoot("captiveWall","ijaA",wall),ijaAHold:Local(wall,...I.ijaAHold),
      interpreter:Local(wall,...I.interpreter),ijaB:Local(wall,...I.ijaB)};
  }
  PhaseCaptiveWall(age){
    const r=this.r,comrade=this.Comrade,ijaA=this.Ija("ijaA"),ijaB=this.Ija("ijaB"),interp=this.cast.interpreter,m=this.InterrogationMarks();
    if(!this.phaseEntered){this.phaseEntered=true;this.Put(comrade,m.wall);this.Put(ijaA,m.ijaA);this.PlayClip(comrade,"CaptiveWallBrace",{restart:true});this.PlayClip(ijaA,"IjaShoveToWall",{restart:true});}
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
  /** Hair grab, draw, cut (stages slashGrab/slashDraw/slashCut share the comrade's wall root). */
  PhaseSlash(age){
    const r=this.r,comrade=this.Comrade,ijaA=this.Ija("ijaA"),m=this.InterrogationMarks();
    const root=this.StageRoot("slashGrab","ijaA",m.wall);
    // Hair grab, then the draw, then the cut: the stage clips' own lengths and the cut's contact frame.
    const grab=ClipLength("IjaHairGrabPull",1),draw=grab+ClipLength("IjaDrawBayonet",.8),cut=draw+ContactAt("IjaThroatSlash","cut",.24);
    this.VanguardFront(this.flags.vanguardAt);
    this.Hold(this.Ija("ijaB"),m.ijaB,null);
    this.Hold(this.cast.interpreter,m.interpreter,"InterpreterCrouchAsk");
    this.Put(comrade,m.wall);
    if(age<draw)this.Pose(comrade,"CaptiveHeadPulledBack",{seconds:age});
    else this.Pose(comrade,"CaptiveThroatCut",{seconds:age-draw});
    if(ijaA&&Distance(ijaA.position,root)>.02&&age<.2)this.Hold(ijaA,root,"CollarControl",{speed:C.speed.walk});
    else{
      this.Put(ijaA,root);
      if(age<grab)this.Pose(ijaA,"IjaHairGrabPull",{seconds:age});
      else if(age<draw)this.Pose(ijaA,"IjaDrawBayonet",{seconds:age-grab});
      else this.Pose(ijaA,"IjaThroatSlash",{seconds:age-draw});
    }
    if(age>=cut&&!this.flags.throatCut){
      this.flags.throatCut=r.time;
      const neck=comrade.actor.characterRig?.bones.neck||comrade.actor.characterRig?.bones.head;
      const out=Rot(m.wall.yaw,0,-1);
      if(neck)this.flags.spurt=r.vfx?.BloodSpurt?.(neck,new THREE.Vector3(0,.02,.06),new THREE.Vector3(out.x,.25,out.z),{seconds:2.8,arterial:true,pool:true,worldDirection:true})||null;
      const handle=this.Scene("CaptiveTaunt",r.voice?.PlayScene("CaptiveTaunt",{speakers:this.Speakers(),onLine:(lineId)=>{
        if(lineId==="CaptiveTaunt.04")this.flags.frontCallAt=r.time;
      }}));
      handle?.Signal?.("ThroatCut");r.voice?.Signal?.("ThroatCut");
      r.audio?.Play?.("meleeSlash",{position:this.HeadPoint(comrade)||r.Point(m.wall,1),volume:.8});
    }
    if(age>=draw+1)this.Stage("Taunt");
  }
  PhaseTaunt(age){
    const r=this.r,comrade=this.Comrade,ijaA=this.Ija("ijaA"),m=this.InterrogationMarks();
    this.VanguardFront(this.flags.vanguardAt);
    this.Pose(comrade,"CaptiveClutchThroat",{seconds:age});
    this.Pose(ijaA,"IjaThroatSlash",{seconds:1+age});
    this.Hold(this.Ija("ijaB"),m.ijaB,null);
    this.Hold(this.cast.interpreter,m.interpreter,"InterpreterCrouchAsk");
    const done=this.scenes.CaptiveTaunt?this.scenes.CaptiveTaunt.lines?.[2]?.state==="done":age>4;
    if(done||age>this.SceneLength("CaptiveTaunt")+C.timeouts.tauntExtraS)this.Stage("Wipe");
  }
  PhaseWipe(age){
    const r=this.r,comrade=this.Comrade,ijaA=this.Ija("ijaA"),ijaB=this.Ija("ijaB"),m=this.InterrogationMarks();
    if(!this.phaseEntered){
      this.phaseEntered=true;
      comrade.scriptEssential=false;this.PlayClip(comrade,"CaptiveWallSlideTwitch",{restart:true});
      this.Kill(comrade);
      this.flags.comradeDead=true;
    }
    this.VanguardFront(this.flags.vanguardAt);
    this.Corpse(comrade,"CaptiveWallSlideTwitch");
    const wipe=ClipLength("IjaWipeSheathBayonet",5.6),ready=wipe+ClipLength("IjaReadyRifle",1.1);
    if(age>=ClipLength("CaptiveWallSlideTwitch",3.2)&&!r.Has("captivesKilled"))r.Record("captivesKilled",{count:1});
    if(age<wipe)this.Pose(ijaA,"IjaWipeSheathBayonet",{seconds:age});
    else if(age<ready)this.Pose(ijaA,"IjaReadyRifle",{seconds:age-wipe});
    else this.Pose(ijaA,null);
    // 「日兵乙转头看向前沟」: he turns to the front at the far call.
    if(this.flags.frontCallAt!=null)this.Hold(ijaB,{...C.ija.ijaBWatch,yaw:-Math.PI/2},null,{speed:C.speed.walk});else this.Hold(ijaB,m.ijaB,null);
    const interp=this.cast.interpreter;
    this.Hold(interp,{...Local(m.wall,1.4,-1.6),yaw:Face(Local(m.wall,1.4,-1.6),m.wall)},null,{speed:C.speed.stroll});
    if(age>=ready)this.Stage("Reach");
  }
  PhaseReach(age){
    const r=this.r;
    this.VanguardFront(this.flags.vanguardAt);
    this.Corpse(this.Comrade,"CaptiveWallSlideTwitch");
    this.Pose(this.Ija("ijaA"),null);
    this.Hold(this.Ija("ijaB"),{...C.ija.ijaBWatch,yaw:-Math.PI/2},null,{speed:C.speed.walk});
    // The pack strap snaps him back; the loose beam shifts (the noise that turns ijaA round).
    if(age>=2&&!this.flags.beamShift){this.flags.beamShift=r.time;r.audio?.Play?.("debrisFall",{position:r.Point(C.shunzi.trap,.4),volume:.4});}
    this.PlaceBeam("nudged",this.flags.beamShift?Smooth((r.time-this.flags.beamShift)/.3)*.25:0);
    if(age>=C.timeouts.reachS)this.Stage("Found");
  }
  PhaseFound(age){
    const r=this.r,ijaA=this.Ija("ijaA"),root=this.SnagRoot();
    if(!this.phaseEntered){this.phaseEntered=true;r.Record("doorSearchStarted");}
    this.VanguardFront(this.flags.vanguardAt);
    this.Corpse(this.Comrade,"CaptiveWallSlideTwitch");
    this.Hold(this.Ija("ijaB"),{...C.ija.ijaBWatch,yaw:-Math.PI/2},null,{speed:C.speed.walk});
    if(this.flags.clearAt==null){
      if(this.Follow(ijaA,"found",[...C.ija.foundRoute,root],age>C.timeouts.foundWalkS?C.speed.run:C.speed.walk,null,root.yaw)&&this.Hold(ijaA,root,null))this.flags.clearAt=r.time;
      this.PlaceBeam("nudged",.25);
      return;
    }
    const t=r.time-this.flags.clearAt;
    this.Put(ijaA,root);
    if(t<1.6){this.Pose(ijaA,"BayonetClearWood",{seconds:t});this.PlaceBeam("nudged",.25+.75*Smooth((t-.9)/.3));return;}
    this.PlaceBeam("nudged");
    if(!this.Started("ShunziFound"))this.Scene("ShunziFound",r.voice?.PlayScene("ShunziFound",{speakers:this.Speakers()}));
    this.Pose(ijaA,null);
    const line=this.SceneLength("ShunziFound");
    if(t>=1.6+Math.max(.5,line-.8)||this.SceneDone("ShunziFound"))this.Stage("Drag");
  }
  PhaseDrag(age){
    const ijaA=this.Ija("ijaA");
    this.Put(ijaA,this.SnagRoot());
    this.Corpse(this.Comrade,"CaptiveWallSlideTwitch");
    this.PlaceBeam("nudged");
    if(age<.8){this.Pose(ijaA,"IjaSlingRifle",{seconds:age});return;}
    const t=age-.8;
    this.Pose(ijaA,"IjaCollarDragSnag",{seconds:t});
    if(t>=EventAt("IjaCollarDragSnag","packSnagged",.95))this.Stage("Snag");
  }
  PhaseSnag(age){
    const ijaA=this.Ija("ijaA");
    this.Put(ijaA,this.SnagRoot());this.Corpse(this.Comrade,"CaptiveWallSlideTwitch");
    this.PlaceBeam("nudged");
    const t=EventAt("IjaCollarDragSnag","packSnagged",.95)+age;
    this.Pose(ijaA,"IjaCollarDragSnag",{seconds:t});
    if(t>=ClipLength("IjaCollarDragSnag",2.2))this.Stage("KickBeam");
  }
  PhaseKickBeam(age){
    const r=this.r,ijaA=this.Ija("ijaA");
    this.Put(ijaA,this.SnagRoot());this.Corpse(this.Comrade,"CaptiveWallSlideTwitch");
    this.Pose(ijaA,"IjaKickBeam",{seconds:age});
    if(this.beam)this.beam.visible=false;   // the clip's own beam track takes over from frame 0
    if(age>=ContactAt("IjaKickBeam","kick",.45)&&!this.flags.beamKicked){this.flags.beamKicked=r.time;r.audio?.Play?.("debrisFall",{position:r.Point(C.shunzi.trap,.3),volume:.7});}
    if(age>=ClipLength("IjaKickBeam",1.2)){
      const left=ijaA?.actor.characterRig?.openingProps?.Detach?.("beam");
      if(left){this.leftBeam=left;this.beamState="kicked";}else if(this.beam){this.beamState="kicked";this.PlaceBeam("kicked");}
      this.Stage("DragOut");
    }
  }
  PhaseDragOut(age){
    const r=this.r,ijaA=this.Ija("ijaA");
    this.Corpse(this.Comrade,"CaptiveWallSlideTwitch");
    if(ijaA)ijaA.openingStoryboardContact=()=>this.CollarContact(ijaA);
    const arrived=this.Follow(ijaA,"dragOut",C.ija.dragOutRoute,C.speed.drag,"CollarDrag");
    this.dragOutProgress=Clamp(age/Math.max(.1,RouteLength(C.ija.dragOutRoute)/C.speed.drag));
    if(arrived||age>C.timeouts.dragOutS){
      if(ijaA)ijaA.openingStoryboardContact=null;
      this.MudMarks(this.Densify([C.shunzi.trap,...C.ija.dragOutRoute].map((p,i,all)=>i===all.length-1?C.shunzi.dragged:p)));
      this.Stage("Butt");
    }
  }
  /** ijaA's butt-strike root: Shunzi's head is the clip's `head` track point. */
  ButtRoot(){
    const S=C.shunzi.dragged,ijaA=this.Ija("ijaA");
    const yaw=Face(ijaA?.position||{x:S.x+1,z:S.z-1},S);
    const head=OpeningPlayerPoint("LugouIja02","IjaButtStrike","head",0)||{x:0,z:-.58};
    const o=Rot(yaw,head.x,head.z);return {x:S.x-o.x,z:S.z-o.z,yaw};
  }
  PhaseButt(age){
    const r=this.r,ijaA=this.Ija("ijaA");
    if(!this.phaseEntered){this.phaseEntered=true;this.flags.buttRoot=this.ButtRoot();}
    this.Corpse(this.Comrade,"CaptiveWallSlideTwitch");
    const root=this.flags.buttRoot;
    if(this.flags.buttAt==null){if(this.Hold(ijaA,root,null,{speed:C.speed.walk})||age>1.5)this.flags.buttAt=r.time;return;}
    const t=r.time-this.flags.buttAt;
    this.Put(ijaA,root);this.Pose(ijaA,"IjaButtStrike",{seconds:t});
    if(t>=ContactAt("IjaButtStrike","strike",.42)&&!this.strikeAt){this.strikeAt=r.time;r.audio.Deafen?.(1.1);r.Record("playerButtStruck");}
    if(t>=ClipLength("IjaButtStrike",1))this.Stage("Boots");
  }
  /** The circle round the dragged Shunzi (02): interpreter in front, ijaA crouched at his side, ijaB aiming. */
  CircleMarks(){
    const R=C.rescue,S=C.shunzi.dragged;
    const yaw=Face(S,R.facing)+R.facingOffsetDeg*DEG,anchor={...S,yaw};
    const interpreter=Local(anchor,...R.interpreter);
    const bearing=R.ijaAHoldBearingDeg*DEG,headTrack=OpeningPlayerPoint("LugouIja02","IjaHoldCollarUp","head",0)||{x:-.04,z:-.6};
    const along={x:Math.sin(bearing),z:Math.cos(bearing)},dist=Math.hypot(headTrack.x,headTrack.z);
    const approx={x:S.x+along.x*dist,z:S.z+along.z*dist},ayaw=Face(approx,S),o=Rot(ayaw,headTrack.x,headTrack.z);
    const ijaA={x:S.x-o.x,z:S.z-o.z,yaw:ayaw};
    const guard=Local(anchor,...R.ijaBGuard);guard.yaw=Face(guard,S);
    return {anchor,interpreter,ijaA,ijaBGuard:guard,ijaBWatch:R.ijaBWatch};
  }
  PhaseBoots(age){
    const r=this.r,m=this.CircleMarks();
    this.Corpse(this.Comrade,"CaptiveWallSlideTwitch");
    const a=this.Hold(this.Ija("ijaA"),m.ijaA,null,{speed:C.speed.stroll});
    const b=this.Hold(this.Ija("ijaB"),m.ijaBGuard,null,{speed:C.speed.walk});
    // 「几双军靴围过来」: ijaA's and ijaB's boots first, the interpreter only steps in behind them.
    const interp=this.cast.interpreter;
    const i=age<C.rescue.bootsInterpreterS?(this.Pose(interp,null),false):this.Hold(interp,m.interpreter,null,{speed:C.speed.walk});
    if(age>=1.5&&(a&&b&&i||age>C.timeouts.bootsS))this.Stage("Hold");
  }
  // -- 02 -------------------------------------------------------------------------------------
  /** Luo, He and Liu creep from behind RC down the SSW leg (never out of the enemy's rear). */
  Rescuers(age,{luoFast=false,heFast=false}={}){
    const R=C.rescue,luo=this.Squad("luo"),he=this.Squad("heyoutian"),liu=this.Squad("liuwencai");
    Equip(luo,"Dadao");Equip(he,"Dadao");
    const m=this.CircleMarks(),chop=this.ChopMarks(m);
    if(!this.flags.rescuersPlaced){
      this.flags.rescuersPlaced=true;
      this.Put(luo,R.luoStart);this.Put(he,R.heStart);this.Put(liu,R.liuStart);
    }
    // They come round RC only once the questioning is under way: at the glimpse Luo is on the
    // south-south-west leg, over the interpreter's shoulder (K2), not already behind the circle.
    // Luo turns the rear corner the moment Shunzi looks up (K2); He and Liu come round behind him.
    const go=this.flags.glimpseAt!=null?this.r.time-this.flags.glimpseAt:-1;
    if(go<0&&!luoFast){for(const [actor,start] of [[luo,R.luoStart],[he,R.heStart],[liu,R.liuStart]])this.Pin(actor,start);return;}
    if(!this.flags.luoChopAt)this.Follow(luo,"rescue",[...R.luoRoute,chop.luo],luoFast?C.speed.run:C.speed.brisk,"CreepDadao",chop.luo.yaw);
    // He creeps behind Luo and closes up (brisk) when he falls more than heTrailM behind him, so he is
    // on his mark behind ijaA when Luo's cut lands (the draft's parry follows the first cut at once).
    const Left=(actor,mark)=>actor?Distance(actor.openingStoryboardLast||actor.position,mark):0;
    const hePace=heFast?C.speed.run:luo&&!luo.openingStoryboardHidden&&Left(he,chop.he)>Left(luo,chop.luo)+R.heTrailM?C.speed.brisk:C.speed.creep;
    if(!this.flags.heChopAt&&(go>.8||heFast))this.Follow(he,"rescue",[...R.heRoute,chop.he],hePace,"CreepDadao",chop.he.yaw);
    else if(!this.flags.heChopAt)this.Pin(he,R.heStart);
    if(!this.flags.liuReleased&&go>1.6)this.LiuWalk();
    else if(!this.flags.liuReleased)this.Pin(liu,R.liuStart);
  }
  /** Liu Wencai creeps round RC to his firing step (liuShot) and holds it facing J until released. */
  LiuWalk(){
    const R=C.rescue,liu=this.Squad("liuwencai");
    if(!liu||this.flags.liuReleased||this.flags.glimpseAt==null)return false;
    if(this.flags.liuAt==null){
      const speed=this.flags.luoChopAt!=null?C.speed.brisk:C.speed.creep;
      if(!this.Follow(liu,"rescue",[...R.liuRoute,R.liuShot],speed,null,R.liuShot.yaw))return false;
      this.flags.liuAt=this.r.time;
    }
    this.Pose(liu,null,{face:Face(R.liuShot,A.bunkerJunction)});
    return true;
  }
  ChopMarks(m=this.CircleMarks()){
    const luo=this.StageRoot("chopRear","luo",m.ijaBWatch),he=this.StageRoot("chopParry","heyoutian",m.ijaA);
    return {luo,he};
  }
  RescueCircle(age,{interpClip="InterpreterCrouchAsk"}={}){
    const m=this.CircleMarks();
    this.Corpse(this.Comrade,"CaptiveWallSlideTwitch");
    return m;
  }
  PhaseHold(age){
    const r=this.r,m=this.CircleMarks(),ijaA=this.Ija("ijaA");
    if(!this.phaseEntered){
      this.phaseEntered=true;r.Record("rescueCallHeard");
      this.Scene("RescueInterrogation",r.voice?.PlayScene("RescueInterrogation",{speakers:this.Speakers(),
        gate:(lineId)=>lineId!=="RescueInterrogation.06"||this.flags.sayGate===true,
        onLine:(lineId)=>{
          if(lineId==="RescueInterrogation.03")this.flags.askAt=r.time;
          if(lineId==="RescueInterrogation.05")this.flags.kickAt=r.time;
          if(lineId==="RescueInterrogation.06")this.flags.collarAt=r.time;
        }}));
      this.flags.holdAt=r.time;
    }
    this.RescueCircle(age);
    this.Put(ijaA,m.ijaA);this.Pose(ijaA,"IjaHoldCollarUp",{seconds:r.time-this.flags.holdAt});
    this.Hold(this.cast.interpreter,m.interpreter,"InterpreterCrouchAsk");
    this.Hold(this.Ija("ijaB"),m.ijaBGuard,null);
    this.Rescuers(r.time-this.flags.holdAt);
    if(this.flags.askAt!=null||age>C.timeouts.holdLineS)this.Stage("Ask");
  }
  PhaseAsk(age){
    const r=this.r,m=this.CircleMarks(),ijaA=this.Ija("ijaA");
    this.RescueCircle(age);
    this.Put(ijaA,m.ijaA);this.Pose(ijaA,"IjaHoldCollarUp",{seconds:r.time-this.flags.holdAt});
    this.Hold(this.cast.interpreter,m.interpreter,"InterpreterCrouchAsk");
    this.Hold(this.Ija("ijaB"),m.ijaBGuard,null);
    this.Rescuers(r.time-this.flags.holdAt);
    if(this.flags.kickAt!=null||age>C.timeouts.holdLineS)this.Stage("KickShunzi");
  }
  PhaseKickShunzi(age){
    const r=this.r,m=this.CircleMarks(),ijaA=this.Ija("ijaA"),ijaB=this.Ija("ijaB");
    this.RescueCircle(age);
    this.Put(ijaA,m.ijaA);this.Pose(ijaA,"IjaHoldCollarUp",{seconds:r.time-this.flags.holdAt});
    this.Hold(this.cast.interpreter,m.interpreter,"InterpreterCrouchAsk");
    this.Rescuers(r.time-this.flags.holdAt);
    const S=C.shunzi.dragged,guard=m.ijaBGuard,kick={x:S.x+(guard.x-S.x)*C.rescue.kickM/Distance(guard,S),z:S.z+(guard.z-S.z)*C.rescue.kickM/Distance(guard,S)};
    kick.yaw=Face(kick,S);
    if(this.flags.kickClipAt==null){if(this.Hold(ijaB,kick,null,{speed:C.speed.walk})||age>1)this.flags.kickClipAt=r.time;return;}
    const t=r.time-this.flags.kickClipAt;
    this.Pose(ijaB,"IjaKickPrisoner",{seconds:t});
    if(t>=.4&&!this.flags.kicked){this.flags.kicked=r.time;r.audio?.Play?.("meleeHit",{position:r.Point(S,.6),volume:.6});}
    if(t>=1.2)this.Stage("Glimpse");
  }
  PhaseGlimpse(age){
    const r=this.r,m=this.CircleMarks(),ijaA=this.Ija("ijaA"),ijaB=this.Ija("ijaB");
    this.flags.glimpseAt??=r.time;
    this.RescueCircle(age);
    this.Put(ijaA,m.ijaA);this.Pose(ijaA,"IjaHoldCollarUp",{seconds:r.time-this.flags.holdAt});
    this.Hold(this.cast.interpreter,m.interpreter,"InterpreterCrouchAsk");
    // ijaB steps back to the north wall and turns to the front; Luo comes in behind him.
    this.Hold(ijaB,m.ijaBWatch,null,{speed:C.speed.walk});
    this.Rescuers(r.time-this.flags.holdAt,{luoFast:age>C.timeouts.luoArriveS});
    const chop=this.ChopMarks(m),luo=this.Squad("luo");
    // 「说话！」 only once Shunzi has seen the squad leader and Luo is close behind ijaB.
    if(age>=1.5&&(Distance(luo.position,chop.luo)<3.6||age>C.timeouts.glimpseGateS+C.timeouts.luoArriveS)){this.flags.sayGate=true;this.flags.sayGateAt??=r.time;}
    if(this.flags.collarAt!=null||this.flags.sayGate&&age>C.timeouts.glimpseGateS+C.timeouts.luoArriveS+3)this.Stage("Collar");
  }
  PhaseCollar(age){
    const r=this.r,m=this.CircleMarks(),ijaA=this.Ija("ijaA"),ijaB=this.Ija("ijaB"),interp=this.cast.interpreter;
    this.RescueCircle(age);
    this.Put(ijaA,m.ijaA);this.Pose(ijaA,"IjaHoldCollarUp",{seconds:r.time-this.flags.holdAt});
    this.Put(interp,m.interpreter);this.Pose(interp,"InterpreterGrabCollar",{seconds:age});
    this.Hold(ijaB,m.ijaBWatch,null);
    this.Rescuers(r.time-this.flags.holdAt,{luoFast:age>1,heFast:age>1});
    const chop=this.ChopMarks(m),luo=this.Squad("luo");
    if(luo&&Distance(luo.position,chop.luo)<.15&&Math.abs(Wrap(luo.yaw-chop.luo.yaw))<.2)this.Stage("Chop");
    else if(age>C.timeouts.luoArriveS){if(luo){this.Show(luo);this.Settle(luo,chop.luo);}this.flags.chopForced=r.time;this.Stage("Chop");}
  }
  /** Kill with the blade at the authored contact; if the hit did not kill, make it lethal. */
  /** A scripted death: drop the narrative protection first, then a lethal hit. */
  Kill(victim,kind="melee"){
    if(!victim?.alive)return;
    victim.openingDoomed=true;victim.scriptEssential=false;victim.scriptedNoncombatant=false;
    victim.TakeHit(1000,"torso",null,{kind});
  }
  BladeKill(victim,attacker){
    if(!victim?.alive)return;
    victim.openingDoomed=true;victim.scriptEssential=false;victim.scriptedNoncombatant=false;
    const weapon=attacker?.weapon;if(attacker)attacker.weapon=WEAPONS.Dadao;
    try{this.r.meleeCombat?.Damage(victim,attacker,200,"heavy");}finally{if(attacker)attacker.weapon=weapon;}
    if(victim.alive)this.Kill(victim);
  }
  PhaseChop(age){
    const r=this.r,m=this.CircleMarks(),ijaA=this.Ija("ijaA"),ijaB=this.Ija("ijaB"),luo=this.Squad("luo"),interp=this.cast.interpreter;
    if(!this.phaseEntered){this.phaseEntered=true;this.flags.luoChopAt=r.time;this.PlayClip(luo,"LuoDadaoChopRear",{restart:true});this.PlayClip(ijaB,"IjaChoppedFallWall",{restart:true});}
    this.RescueCircle(age);
    this.Put(ijaA,m.ijaA);this.Pose(ijaA,"IjaHoldCollarUp",{seconds:r.time-this.flags.holdAt});
    this.Put(interp,m.interpreter);this.Pose(interp,"InterpreterGrabCollar",{seconds:r.time-this.at+2});
    const chop=this.ChopMarks(m);
    this.Settle(luo,chop.luo);this.Pose(luo,"LuoDadaoChopRear",{seconds:age});
    this.Put(ijaB,m.ijaBWatch);
    if(ijaB?.alive)this.Pose(ijaB,"IjaChoppedFallWall",{seconds:age});else this.Corpse(ijaB,"IjaChoppedFallWall");
    const cut=ContactAt("LuoDadaoChopRear","cut",.45);
    if(age>=cut&&ijaB?.alive){this.BladeKill(ijaB,luo);this.Blood(ijaB,"neck");}
    if(age>=cut+C.timeouts.contactKillS&&ijaB?.alive)this.Kill(ijaB);
    this.Rescuers(r.time-this.flags.holdAt,{heFast:true});
    if(age>=cut+.1)this.Stage("Parry");
  }
  PhaseParry(age){
    const r=this.r,m=this.CircleMarks(),ijaA=this.Ija("ijaA"),ijaB=this.Ija("ijaB"),luo=this.Squad("luo"),he=this.Squad("heyoutian"),interp=this.cast.interpreter;
    const chop=this.ChopMarks(m);
    if(this.flags.heChopAt==null){
      // He has to be on his mark behind ijaA; he is already running in.
      this.Follow(he,"rescue",[...C.rescue.heRoute,chop.he],C.speed.run,"CreepDadao",chop.he.yaw);
      if(Distance(he.position,chop.he)<.15||age>C.timeouts.heArriveS){this.flags.heChopAt=r.time;this.PlayClip(ijaA,"IjaParriedChoppedFall",{restart:true});}
      this.Put(ijaA,m.ijaA);this.Pose(ijaA,"IjaHoldCollarUp",{seconds:r.time-this.flags.holdAt});
    }else{
      const t=r.time-this.flags.heChopAt;
      this.Settle(he,chop.he);this.Pose(he,"HeDadaoParryChop",{seconds:t});
      this.Put(ijaA,m.ijaA);
      if(ijaA?.alive)this.Pose(ijaA,"IjaParriedChoppedFall",{seconds:t});else this.Corpse(ijaA,"IjaParriedChoppedFall");
      if(t>=.05)this.flags.collarReleasedAt??=r.time;
      const cut=ContactAt("HeDadaoParryChop","cut",.792);
      if(t>=cut&&ijaA?.alive){this.BladeKill(ijaA,he);this.Blood(ijaA,"neck");}
      if(t>=cut+C.timeouts.contactKillS&&ijaA?.alive)this.Kill(ijaA);
      if(!ijaA?.alive&&!ijaB?.alive&&!r.Has("vanguardMeleeResolved"))r.Record("vanguardMeleeResolved");
    }
    this.Corpse(this.Comrade,"CaptiveWallSlideTwitch");
    this.Put(ijaB,m.ijaBWatch);this.Corpse(ijaB,"IjaChoppedFallWall");
    this.Settle(luo,chop.luo);this.Pose(luo,"LuoDadaoChopRear",{seconds:r.time-this.flags.luoChopAt});
    this.Put(interp,m.interpreter);this.Pose(interp,"InterpreterGrabCollar",{seconds:2.9});
    this.LiuWalk();
    // The interpreter bolts once ijaA is turned on by He (heChopAt is forced by heArriveS).
    if(this.flags.heChopAt!=null&&r.time-this.flags.heChopAt>=.4)this.Stage("Flee");
  }
  Blood(actor,part){
    const bone=actor?.actor?.characterRig?.bones?.[part==="neck"?"neck":"chest"]||actor?.actor?.characterRig?.bones?.head;
    const at=bone?.getWorldPosition(new THREE.Vector3());
    if(at)this.r.vfx?.BloodBurst?.(at,new THREE.Vector3(0,.3,1),1.4);
  }
  /** Shared by Flee..Released: the dead stay on their clips, He finishes his cut and swaps to the rifle. */
  Aftercut(){
    const r=this.r,m=this.CircleMarks(),ijaA=this.Ija("ijaA"),ijaB=this.Ija("ijaB"),he=this.Squad("heyoutian"),luo=this.Squad("luo");
    this.Corpse(this.Comrade,"CaptiveWallSlideTwitch");
    const t=r.time-(this.flags.heChopAt??r.time);
    if(ijaB){this.Put(ijaB,m.ijaBWatch);if(ijaB.alive)this.Kill(ijaB);this.Corpse(ijaB,"IjaChoppedFallWall");}
    if(ijaA){
      // The parried man falls on his own clip; the cut lands at 0.792 s even if Parry was left early.
      this.Put(ijaA,m.ijaA);
      if(ijaA.alive&&t<ContactAt("HeDadaoParryChop","cut",.792))this.Pose(ijaA,"IjaParriedChoppedFall",{seconds:t});
      else{if(ijaA.alive){this.BladeKill(ijaA,he);this.Blood(ijaA,"neck");}this.Corpse(ijaA,"IjaParriedChoppedFall");}
    }
    if(!ijaA?.alive&&!ijaB?.alive&&!r.Has("vanguardMeleeResolved"))r.Record("vanguardMeleeResolved");
    // He: finish the cut, move to the spoil, plant the dadao and take up his rifle.
    if(!this.flags.heSwapAt){
      if(t<ClipLength("HeDadaoParryChop",1.5)){this.Pose(he,"HeDadaoParryChop",{seconds:t});return;}
      if(this.Hold(he,{...C.rescue.heCover,yaw:Face(C.rescue.heCover,A.bunkerFold)},null,{speed:C.speed.walk})||t>6)this.flags.heSwapAt=r.time;
      return;
    }
    const s=r.time-this.flags.heSwapAt;
    if(s<ClipLength("HeSwapDadaoRifle",1.6)){this.Pose(he,"HeSwapDadaoRifle",{seconds:s});return;}
    if(!this.flags.heArmed){this.flags.heArmed=true;this.flags.heArmedAt=r.time;DropOpeningWeapon(he,"HeSwapDadaoRifle");Equip(he,"HanYang");this.ReleaseSquad(he,C.rescue.heCover);}
  }
  PhaseFlee(age){
    const r=this.r,interp=this.cast.interpreter,luo=this.Squad("luo"),m=this.CircleMarks();
    if(!this.phaseEntered){this.phaseEntered=true;this.Scene("RescueFlee",r.voice?.PlayScene("RescueFlee",{speakers:this.Speakers()}));this.PlayClip(interp,"InterpreterFlee",{restart:true});}
    this.Aftercut();this.LiuWalk();
    this.Put(interp,m.interpreter);this.Pose(interp,"InterpreterFlee",{seconds:age});
    this.Put(luo,this.ChopMarks(m).luo);this.Pose(luo,"LuoDadaoChopRear",{seconds:r.time-this.flags.luoChopAt});
    if(age>=1.6||age>C.timeouts.fleeS){this.flags.fleeAt=r.time;this.Stage("DragCover");}
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
  PhaseDragCover(age){
    const r=this.r,luo=this.Squad("luo");
    this.Aftercut();this.UpdateFleeing();this.LongShotTick();
    Equip(luo,null);
    // 「罗班长抓住顺子衣领」: step in front of him facing the way out, take the collar, then walk.
    if(this.flags.dragGrabAt==null){
      if(this.Hold(luo,this.DragGrabRoot(),null,{speed:C.speed.brisk})||age>C.timeouts.luoArriveS*.5)this.flags.dragGrabAt=r.time;
      return;
    }
    const grab=r.time-this.flags.dragGrabAt;
    if(grab<.4){this.Pose(luo,"LuoDragToCover",{seconds:grab});return;}
    luo.openingStoryboardContact=()=>this.CollarContact(luo);
    const arrived=this.Follow(luo,"dragCover",[...C.rescue.dragCoverRoute,C.rescue.luoCheck],C.speed.drag,"CollarDrag");
    if(arrived||age>C.timeouts.dragOutS){
      luo.openingStoryboardContact=null;
      this.MudMarks(this.Densify([C.shunzi.dragged,...C.rescue.dragCoverRoute,C.shunzi.cover]),{offsets:[-.12,.12],width:.09});
      this.Stage("LongShot");
    }
  }
  /** Where Luo takes the collar: the player point (behind him, lieCollar) is exactly Shunzi's kneeling spot. */
  DragGrabRoot(){
    const S=C.shunzi.dragged,to=C.rescue.dragCoverRoute[0],d=Distance(S,to)||1,k=.55/d;
    const at={x:S.x+(to.x-S.x)*k,z:S.z+(to.z-S.z)*k};
    return {...at,yaw:Face(at,to)};
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
    target.TakeHit(1000,"torso",dir,{kind:"bullet",weaponId:"HanYang",point:aim});
    r.vfx?.Blood?.(aim,dir,1);
    return true;
  }
  PhaseLongShot(age){
    const r=this.r,luo=this.Squad("luo");
    this.Aftercut();this.UpdateFleeing();this.LongShotTick();
    this.Pose(luo,null,{face:C.shunzi.cover});
    // Last resort against a stall: the cut-down pair is made dead, the flow never waits on them.
    if(age>C.timeouts.longShotForceS+2&&!r.Has("vanguardMeleeResolved")){
      for(const role of ["ijaA","ijaB"])this.Kill(this.Ija(role));
      if(!this.Ija("ijaA")?.alive&&!this.Ija("ijaB")?.alive)r.Record("vanguardMeleeResolved",{forced:true});
    }
    const ready=!this.Ija("ijaD")?.alive&&r.Has("vanguardMeleeResolved");
    if(!r.Has("luoRescueComplete")&&r.Has("vanguardMeleeResolved"))r.Record("luoRescueComplete");
    if(ready&&age>=.6)this.Stage("Check");
  }
  /** Luo kneels facing Shunzi: the clip's head track is Shunzi's head at the cover. */
  CheckRoot(){
    const S=C.shunzi.cover,luo=this.Squad("luo");
    const yaw=Face(C.rescue.luoCheck,S);
    const head=OpeningPlayerPoint("LugouNra05","LuoKneelCheck","head",0)||{x:-.02,z:-.57};
    const o=Rot(yaw,head.x,head.z);return {x:S.x-o.x,z:S.z-o.z,yaw};
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
    const from={...R.kickFrom,yaw:Face(R.kickFrom,R.rifleKicked)};
    if(this.flags.kickRifleAt==null){if(this.Hold(luo,from,null,{speed:C.speed.walk})||age>C.timeouts.kickRifleS)this.flags.kickRifleAt=r.time;return;}
    const t=r.time-this.flags.kickRifleAt;
    this.Put(luo,from);this.Pose(luo,"KickRifle",{seconds:t});
    const slide=Smooth((t-.48)/.5);
    this.MoveRifle({x:R.rifleMouth.x+(R.rifleKicked.x-R.rifleMouth.x)*slide,z:R.rifleMouth.z+(R.rifleKicked.z-R.rifleMouth.z)*slide,
      yaw:R.rifleMouth.yaw+(R.rifleKicked.yaw-R.rifleMouth.yaw)*slide});
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
    if(RESCUE.has(phase)&&!["Flee","DragCover","LongShot","Check","KickRifle","Released"].includes(phase)){
      for(const role of ["ijaC","ijaD"]){const actor=this.Ija(role);if(actor?.alive&&!actor.openingCombatReleased){
        const spec=MISSION_ENCOUNTERS.bunkerAssault.find(s=>s.id===actor.missionId),post=spec?.enter?.at(-1)||actor.position;
        if(actor.openingStoryboardHidden)this.Put(actor,{...post,yaw:role==="ijaC"?-Math.PI/2:-1.1});
        this.Show(actor);
        this.Pose(actor,role==="ijaC"?"IjaCornerFire":"IjaJunctionPeek");if(role==="ijaC")this.CornerFire(actor);}}
    }
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
    const luo=this.Squad("luo");
    this.ReleaseSquad(luo,{...C.withdraw.luoCover,yaw:Face(C.withdraw.luoCover,A.bunkerFold)});
    this.ReleaseSquad(this.Squad("liuwencai"),C.rescue.liuShot);
    if(this.flags.heArmed)this.ReleaseSquad(this.Squad("heyoutian"),C.rescue.heCover);
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
    if(post===C.rescue.liuShot)this.flags.liuReleased=true;
  }
  VanguardCleared(){return C.vanguardIds.every(id=>this.r.enemies.get(id)?.alive===false);}
  ReleaseMeleeDormancy(){
    if(this.savedMeleeDormancy){this.r.player.meleeDormant=this.playerMeleeDormancy;this.savedMeleeDormancy=false;}
  }
  ReleaseCombat(actor){
    if(!actor?.alive||actor.openingCombatReleased)return;
    actor.openingCombatReleased=true;actor.scriptEssential=false;actor.scriptedNoncombatant=false;actor.missionDormant=false;
    actor.openingStoryboardPose=null;actor.openingStoryboardTravel=null;actor.openingStoryboardLast=null;actor.openingStoryboardContact=null;
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
      if(r.time<p.at+(p.spec.delayS||0)*C.pursuit.delayScale||p.spec.hold||!p.spec.route)continue;
      if(p.index<p.spec.route.length){
        const target=p.spec.route[p.index];
        if(Distance(actor.position,target)<.9)p.index++;
        else r.MoveActor(actor,target,C.pursuit.speedMps);
      }else if(!p.holding){p.holding=true;r.Defend(actor,p.spec.route.at(-1),.8,1);}
    }
    if(retire&&this.pursuit)this.pursuit=this.pursuit.filter(p=>!p.actor.openingRemoved);
  }
  /** 02 withdrawal: Luo covers from the first intact wall, He and Liu bound back past the player. */
  Aftermath(stage){
    const r=this.r;
    if(stage==="RearTrench"){
      const w=this.withdraw||(this.withdraw={step:0,at:r.time});
      const luo=this.Squad("luo"),he=this.Squad("heyoutian"),liu=this.Squad("liuwencai"),W=C.withdraw,p=r.player.position;
      const Post=(actor,point,face)=>{if(actor?.alive){actor.missionCoverWaiting=true;r.Defend(actor,point,.5,.6);if(face)actor.watchYaw=Face(point,face);}};
      if(this.phase==="Collection"||this.phase==="SupportOrder")this.UpdateCollection();
      else if(w.step===0){
        // Luo goes first: out of the mouth, over the crater step, to the first intact wall (the mouth is
        // walled off from the rear leg, so this leg is walked on the lane, not left to local steering).
        if(luo?.alive&&!w.luoAtCover){
          const lane=W.lane.slice(0,W.lane.findIndex(p=>p.x===W.luoCover.x&&p.z===W.luoCover.z)+1);
          if(this.Follow(luo,"withdraw",lane.length>1?lane:[...W.lane.slice(0,7),W.luoCover],C.speed.run,null,Face(W.luoCover,A.bunkerFold))){
            w.luoAtCover=true;luo.openingStoryboardPose=null;luo.openingStoryboardTravel=null;luo.openingStoryboardLast=null;luo.scriptedNoncombatant=false;}
        }else Post(luo,W.luoCover,A.bunkerFold);Post(he,C.rescue.heCover,A.bunkerFold);Post(liu,C.rescue.liuShot,A.bunkerJunction);
        if(Distance(p,W.luoCover)<3.2||r.Has("cornerReached"))w.step=1,w.at=r.time;}
      else if(w.step===1){Post(luo,W.luoCorner,W.luoCover);Post(he,W.heBound[1],A.bunkerFold);Post(liu,C.rescue.liuShot,A.bunkerJunction);
        if(r.time-w.at>4||Distance(p,W.luoCorner)<6)w.step=2,w.at=r.time;}
      else if(w.step===2){Post(luo,W.luoCorner,W.luoCover);Post(he,W.heBound[1],A.bunkerFold);Post(liu,W.liuBound[1],A.bunkerJunction);
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
    const p=this.phase,S=C.shunzi,ijaA=this.Ija("ijaA"),luo=this.Squad("luo");
    if(["Drag","Snag","KickBeam"].includes(p)){const c=this.TrackPoint(ijaA,"collar");if(c)return {x:c.x-Math.sin(S.trap.yaw)*S.lieCollarBackM,z:c.z-Math.cos(S.trap.yaw)*S.lieCollarBackM};}
    if(p==="DragOut"&&ijaA){const f={x:-Math.sin(ijaA.yaw),z:-Math.cos(ijaA.yaw)};return {x:ijaA.position.x-f.x*.62,z:ijaA.position.z-f.z*.62};}
    if(p==="DragCover"&&luo&&this.flags.dragGrabAt!=null&&this.r.time-this.flags.dragGrabAt>=.4){
      const f={x:-Math.sin(luo.yaw),z:-Math.cos(luo.yaw)},behind={x:luo.position.x-f.x*.55,z:luo.position.z-f.z*.55};
      const w=Smooth((this.r.time-this.flags.dragGrabAt-.4)/.5);
      return {x:S.dragged.x+(behind.x-S.dragged.x)*w,z:S.dragged.z+(behind.z-S.dragged.z)*w};
    }
    if(TRAPPED.has(p)&&!["Butt","Boots"].includes(p))return S.trap;
    if(["LongShot","Check","KickRifle","Released"].includes(p))return S.cover;
    if(p==="DragCover")return S.dragged;
    return S.dragged;
  }
  PlacePlayer(){const r=this.r,point=this.PlayerPoint(),y=r.battlefield.GroundHeight(point.x,point.z);r.player.position.set(point.x,y,point.z);r.player.body?.Teleport(point.x,y,point.z);r.player.velocity.set(0,0,0);}
  /** Camera shot of the current phase: eye point + height and a look target (world). */
  Shot(){
    const r=this.r,p=this.phase,a=this.Age,S=C.shunzi,b=C.banter;
    const Head=actor=>this.HeadPoint(actor);
    const At=(point,h)=>r.Point(point,h);
    const ijaA=this.Ija("ijaA"),comrade=this.Comrade,luo=this.Squad("luo"),interp=this.cast.interpreter,L=C.firstPerson.look;
    let eye=S.trap,height=S.lieEyeM,target=At({x:4,z:-125.4},.9),roll=0,pitch=0;
    if(p==="Banter"){
      height=S.seatEyeM;target=At({x:.1,z:-125.2},.72);
      // 「几块土掉进顺子衣领。他缩起脖子，伸手往外掏」: head down to the hand at the collar.
      if(this.flags.dirtAt!=null){const t=r.time-this.flags.dirtAt,w=Smooth((t-.2)/.5)*(1-Smooth((t-1.7)/.6));pitch=L.digPitch*w;height-=.04*w;}
    }
    else if(p==="Orders"){
      height=S.seatEyeM+(this.flags.exitAt!=null?Smooth((r.time-this.flags.exitAt)/1.2)*(S.standEyeM-S.seatEyeM):0);target=At(b.runnerRoute.at(-1),1.35);
      // 「顺子推上枪栓，提枪起身」
      if(this.flags.exitAt!=null){const t=r.time-this.flags.exitAt;pitch=L.boltPitch*Smooth(t/.25)*(1-Smooth((t-.7)/.4));}
    }
    else if(p==="Incoming"){height=S.standEyeM;target=At(b.comradeBlast,1.2);}
    else if(p==="Blast"){height=S.standEyeM+(S.lieEyeM-S.standEyeM)*Smooth(a/.45);target=At(b.comradeBlast,1.0-.8*Smooth(a/.45));roll=.25*Math.sin(a*12)*Math.exp(-a*2);}
    else if(["Black","Wake"].includes(p)){
      target=At({x:4,z:-125.6},.8);roll=-.06;
      // 「他试着撑起身体。背包带一下绷紧……又落回地面」, then the eyes drop to the clawing fingers.
      if(p==="Wake"){height+=L.pushUpM*Smooth((a-1.2)/.5)*(1-Smooth((a-1.85)/.12));pitch=L.clawPitch*Smooth((a-2)/.4);}
    }
    else if(p==="FrontPass"){target=At(A.bunkerJunction,1.1);roll=-.05;}
    else if(["CaptiveDragged","CaptiveWall","Interrogation","Slash","Taunt","Wipe"].includes(p)){target=Head(comrade)||At(this.InterrogationMarks().wall,.8);roll=-.04;}
    else if(p==="Reach"){
      target=At(C.rescue.rifleMouth,.15);roll=-.05;
      // The reaching hand and the rifle both in frame; 「再撑一下」 lifts the eye for a moment.
      pitch=L.reachPitch*Smooth((a-.3)/.6);height+=.06*Smooth((a-1.9)/.12)*(1-Smooth((a-2.05)/.1));
    }
    else if(p==="Found"){target=Head(ijaA)||At({x:1,z:-125.9},1.2);pitch=L.reachPitch*(1-Smooth(a/.9));}
    else if(["Drag","Snag","KickBeam"].includes(p)){
      const c=this.TrackPoint(ijaA,"collar"),f={x:-Math.sin(S.trap.yaw),z:-Math.cos(S.trap.yaw)};
      if(c){eye={x:c.x+f.x*.12,z:c.z+f.z*.12};height=c.h+.08;}
      target=Head(ijaA)||At({x:1.5,z:-125.9},1.3);
      if(p==="Snag")roll=.05*Math.sin(a*20)*Math.exp(-a*3);
    }
    else if(p==="DragOut"){
      const pt=this.PlayerPoint();eye=pt;height=.34+.04*Math.sin(r.time*9);
      // Face down the drag at ijaA's legs; passing the comrade, the eyes drift over him.
      const corpse=comrade?.position,near=corpse&&Distance(pt,corpse)<2.2;
      target=near?At(corpse,.45):ijaA?At(ijaA.position,.55):At(C.shunzi.dragged,.5);
      roll=L.dragRollRad*Math.sin(r.time*4.5);   // chest and knees over the mud
    }
    else if(p==="Butt"){eye=S.dragged;height=.5;target=Head(ijaA)||At(S.dragged,1.2);if(this.strikeAt)roll=.22*Smooth((r.time-this.strikeAt)/.12);}
    else if(p==="Boots"){
      // Low along the mud between the two pairs of boots closing in (ijaA from the east, ijaB from the front).
      eye=S.dragged;height=.3;roll=.18;
      const a1=this.Ija("ijaA")?.position,b1=this.Ija("ijaB")?.position;
      target=a1&&b1?At({x:(a1.x+b1.x)/2,z:(a1.z+b1.z)/2},.15):At(this.CircleMarks().ijaBGuard,.15);
    }
    else if(["Hold","Ask","KickShunzi","Glimpse","Collar","Chop","Parry"].includes(p)){
      const h=this.TrackPoint(ijaA,"head");eye=S.dragged;height=h?h.h:.66;
      // 「他缓慢抬起眼睛……视线越过他的肩膀」: the head comes up enough to clear the crater step (K2 is 0.9).
      const rise=["Glimpse","Collar"].includes(p)?Smooth((p==="Glimpse"?a:1.2)/1.2):0;
      if(rise>0)height=Math.max(height,.66+(L.glimpseEyeM-.66)*rise);
      if(h&&["Hold","Ask","KickShunzi"].includes(p))eye={x:h.x,z:h.z};
      const past=Head(luo)&&Head(interp)?Head(luo).clone().lerp(Head(interp),L.glimpseInterpreterPull):Head(luo);
      // Parry: from He's arrival through the cut both men are in frame (DuelShot); before he is there,
      // ijaA who still holds the collar.
      const duel=p==="Parry"?this.DuelShot(eye,height):null;
      target=["Glimpse","Collar"].includes(p)?(past||At(A.rearCorner,1.3)):p==="Chop"?At(this.CircleMarks().ijaBWatch,1.1):p==="Parry"?(duel?.target||Head(ijaA)||At(S.dragged,1)):(Head(interp)||At(S.dragged,1));
      if(duel){eye=duel.eye;height=duel.height;}
      if(this.flags.kicked&&r.time-this.flags.kicked<.5)roll=.12*(1-(r.time-this.flags.kicked)/.5);
      // Lean aside (to the left of the line to Luo) so the interpreter frames the right of K2.
      if(rise>0&&target){const dx=target.x-eye.x,dz=target.z-eye.z,d=Math.hypot(dx,dz)||1,k=L.glimpseAsideM*rise;eye={x:eye.x+dz/d*k,z:eye.z-dx/d*k};}
    }
    else if(p==="Flee"){
      // The cut lands 0.4 s into Flee: stay on the duel until it has, then follow the interpreter's bolt.
      const duel=this.DuelShot(S.dragged,.66);
      eye=duel?.eye||S.dragged;height=duel?.height??.34;
      target=duel?.hold&&duel.target?duel.target:Head(interp)||At(A.bunkerJunction,1.2);
    }
    else if(p==="DragCover"){const pt=this.PlayerPoint();eye=pt;height=.55;const back=Face(pt,C.shunzi.dragged);target=this.flags.dragGrabAt==null||r.time-this.flags.dragGrabAt<.4?(Head(luo)||At(S.dragged,1)):At(C.shunzi.dragged,.9);}
    else if(p==="LongShot"){
      // 「顺子从门柱边探出一点」: the post hides J from the cover seat; the eye leans out past its south
      // edge and up over the rubble for the shot, and sinks back behind it for Check.
      const lean=Smooth(a/.5);eye={x:S.cover.x+L.longShotLean[0]*lean,z:S.cover.z+L.longShotLean[1]*lean};height=.62+(L.longShotEyeM-.62)*lean;
      target=At(A.bunkerJunction,1.2);
    }
    else if(p==="Check"){const h=this.TrackPoint(luo,"head");eye=h?{x:h.x,z:h.z}:S.cover;height=Math.max(h?h.h:.73,L.checkEyeM);target=Head(luo)||At(C.rescue.luoCheck,1);
      // Sit back from his face (the kneeling squad leader otherwise fills the frame chin-first).
      if(luo){const d=Distance(eye,luo.position)||1;eye={x:eye.x+(eye.x-luo.position.x)/d*L.checkBackM,z:eye.z+(eye.z-luo.position.z)/d*L.checkBackM};}
      if(target?.clone){target=target.clone();target.y+=L.checkLookUpM;}
      if(this.flags.checkLineAt!=null){const n=r.time-this.flags.checkLineAt;target=target.clone?target.clone():target;if(n<.8)target.y-=.18*Math.sin(Math.PI*n/.8);}}
    else if(p==="KickRifle"){eye=S.cover;height=.72;const k=C.rescue.kickFrom,f=C.rescue.rifleKicked;target=At({x:(k.x+f.x)/2,z:(k.z+f.z)/2},.35);
      if(this.flags.kickRifleAt!=null){
        const lean=Smooth((r.time-this.flags.kickRifleAt-.5)/.5),d=Distance(S.cover,f);
        // Half-way to the rifle: a steeper look swings the hidden shoulders back out of reach of it.
        const rifle=this.r.bunkerRifle?.position;if(rifle)target.lerp(new THREE.Vector3(rifle.x,rifle.y+.05,rifle.z),L.grabLookRifle*Smooth((r.time-this.flags.kickRifleAt-.3)/.4));
        pitch=L.grabPitch*lean;height+=(L.grabEyeM-height)*lean;
        eye={x:S.cover.x+(f.x-S.cover.x)/d*L.grabLeanM*lean,z:S.cover.z+(f.z-S.cover.z)/d*L.grabLeanM*lean};
      }}
    return {eye,height,target,roll,pitch};
  }
  /**
   * He's parry and cut (heChopAt .. cut + duelHoldS): the point between the two heads, the eye stepped
   * aside (duelAsideM) to the side away from ijaA, who turns his back to Shunzi to face He and would
   * otherwise hide him (09-24 review: the parry never showed), and the eye drops into the mud after the
   * cut (he is let go at the collar and stays up on his elbows until the blade lands).
   */
  DuelShot(eye,height){
    const r=this.r,at=this.flags.heChopAt;if(at==null)return null;
    const L=C.firstPerson.look,hh=this.HeadPoint(this.Squad("heyoutian")),ha=this.HeadPoint(this.Ija("ijaA"));
    const cut=at+ContactAt("HeDadaoParryChop","cut",.792),t=r.time;
    const w=Smooth((t-at)/.3)*(1-Smooth((t-cut-L.duelHoldS)/.6));
    let e={x:eye.x,z:eye.z};
    if(hh&&ha&&this.flags.duelSide==null){
      const dx=hh.x-eye.x,dz=hh.z-eye.z,d=Math.hypot(dx,dz)||1,nx=-dz/d,nz=dx/d;
      this.flags.duelSide=(ha.x-eye.x)*nx+(ha.z-eye.z)*nz<0?1:-1;this.flags.duelNx=nx;this.flags.duelNz=nz;
    }
    if(this.flags.duelSide!=null){const k=this.flags.duelSide*L.duelAsideM*w;e={x:eye.x+this.flags.duelNx*k,z:eye.z+this.flags.duelNz*k};}
    const drop=t>cut?Smooth((t-cut)/.4):0;
    return {eye:e,height:Math.max(.34,height-(height-.34)*drop),target:hh&&ha?hh.lerp(ha,.5):ha,hold:t<cut+L.duelHoldS};
  }
  DragOutHalf(){return RouteLength(C.ija.dragOutRoute)/C.speed.drag*.6;}
  ApplyCamera(){
    const r=this.r,p=this.phase,a=this.Age;
    if(!this.CameraActive)return false;
    const cam=r.player.camera,shot=this.Shot(),sense=this.Perceive(),head=this.HeadLook(),still=r.opening?.reducedMotion?.matches;
    cam.position.copy(r.Point(shot.eye,shot.height));cam.lookAt(shot.target);
    const yaw=head.yaw+(still?0:sense.yaw);
    if(yaw)cam.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(UP,yaw));
    cam.rotateX((shot.pitch||0)+head.pitch+(still?0:sense.pitch));
    cam.rotateZ((shot.roll||0)+(still?0:sense.roll));
    if(this.cameraFrom&&a<C.cameraBlendS){
      const mix=Smooth(a/C.cameraBlendS),desiredQuaternion=cam.quaternion.clone();
      cam.position.lerpVectors(this.cameraFrom.position,cam.position,mix);
      cam.quaternion.slerpQuaternions(this.cameraFrom.quaternion,desiredQuaternion,mix);
    }
    if(this.presentedAt!==r.time){this.previousViewQuaternion=this.presentedCamera?.quaternion.clone();this.previousViewPosition=this.presentedCamera?.position.clone();this.presentedAt=r.time;}
    if(this.previousViewPosition&&this.delta>0){
      const travel=cam.position.distanceTo(this.previousViewPosition),most=C.cameraMoveMps*this.delta;
      if(travel>most)cam.position.lerpVectors(this.previousViewPosition,cam.position,most/travel);
    }
    if(this.previousViewQuaternion){
      const desiredQuaternion=cam.quaternion.clone();
      cam.quaternion.copy(this.previousViewQuaternion).rotateTowards(desiredQuaternion,C.cameraTurnRps*(this.delta||0));
    }
    cam.updateMatrixWorld(true);
    this.presentedCamera={position:cam.position.clone(),quaternion:cam.quaternion.clone()};
    // The AI culls actors earlier in the frame against the player's own view (Script_Main runs ai.Update
    // before the mission's ApplyCamera); while the director owns the view that frustum points elsewhere and
    // actors in the shot were taken out of the scene (09-24: Luo invisible at K2, renderLod "culled" while
    // centred in frame). Cull again against the shot actually shown.
    r.ai?.CullActors?.(cam);
    this.MarkNotShown();
    // The HUD's incoming-fire arcs point relative to the player's own yaw, not to the director's shot, and the
    // player cannot act on them here: near misses in 01–02 showed a white arc over the frame (09-24 review:
    // "天空里浮着一个白色弧形"). They are cleared while the director owns the view.
    if(r.player?.hitMarks?.length)r.player.hitMarks.length=0;
    const opening=r.opening;
    const fade=p==="Banter"?1-Smooth((r.time-(this.started??r.time))/C.fadeInS):0;
    // 「泥土落下来。顺子闭了一下眼，再睁开时……」
    const found=p==="Found"&&this.flags.clearAt!=null?r.time-this.flags.clearAt:null;
    const blink=found==null?0:Smooth((found-.95)/.08)*(1-Smooth((found-1.25)/.15));
    opening.eyeClosure=p==="Blast"?(a<.25?0:1):p==="Black"?1:p==="Wake"?1-Smooth(a/2.2)*(.7+.3*Smooth((a-1.4)/.8)):Math.max(fade,blink);
    opening.blackout=opening.eyeClosure;
    // Blur / ghosting / imbalance follow one continuous curve (Perceive), no per-phase steps.
    if(sense.amount>1e-3)opening.concussion={amount:sense.amount,focus:sense.focus,pitch:0,roll:0};
    if(this.playerBody)this.firstPerson.Update(this.delta||0);
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
    const kick=this.flags.kicked!=null?P.kick*Math.exp(-Math.max(0,now-this.flags.kicked)/P.kickFadeS):0;
    const amount=Math.min(1,Math.max(level,blast?.amount||0,(strike?.amount||0)*P.strike)+kick);
    const focus=Math.min(1,Math.max(level*P.focusScale,blast?.focus||0,(strike?.focus||0)*P.strike));
    const W=P.wobble,TAU=Math.PI*2;
    const Sway=phase=>.5*Math.sin(now*TAU*W.hz[0]+phase)+.3*Math.sin(now*TAU*W.hz[1]+phase*1.7)+.2*Math.sin(now*TAU*W.hz[2]+phase*2.3);
    return this.perception={amount,focus,level,
      roll:(blast?.roll||0)+(strike?.roll||0)*P.strike+W.rollRad*amount*Sway(0),
      pitch:(blast?.pitch||0)+(strike?.pitch||0)*P.strike+W.pitchRad*amount*Sway(1.3),
      yaw:W.yawRad*amount*Sway(2.9)};
  }
  /** 「玩家只能小幅转头」: the player's own look, clamped, eased back to centre outside the free phases. */
  HeadLook(){
    const r=this.r,H=C.firstPerson.headLook,ctl=r.controls,dt=this.delta||0,free=H.free.includes(this.phase)?1:0;
    const was=this.headFree??0;this.headFree=was+Math.max(-dt/H.returnS,Math.min(dt/H.returnS,free-was));
    if(!ctl||!Number.isFinite(ctl.yaw)||!Number.isFinite(ctl.pitch))return {yaw:0,pitch:0};
    const Cl=v=>Math.max(-H.maxRad,Math.min(H.maxRad,v));
    let yaw=Cl(Wrap(r.player.yaw-ctl.yaw)),pitch=Cl(r.player.pitch-ctl.pitch);
    if(!free){const k=Math.max(0,1-dt/H.returnS);yaw*=k;pitch*=k;r.player.yaw=ctl.yaw+yaw;r.player.pitch=ctl.pitch+pitch;}
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
    this.strikeAt=null;this.bloodMask=0;this.cameraFrom=null;this.presentedCamera=null;this.pointActor=null;this.phaseEntered=null;
    this.beam=null;this.leftBeam=null;this.beamState=null;
    this.perception=null;this.perceptionLevel=null;this.headFree=0;this.headLook=null;this.releaseAt=null;this.releaseLevel=null;
    this.meet=null;this.guardRoute=null;this.restRoute=null;this.clawPath=null;
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
    this.ReleaseMeleeDormancy();
    for(const actor of this.performanceActors||[])ClearOpeningActorPerformance(actor);this.performanceActors?.clear();
    this.r.hud.SetStoryBlood?.(0);this.supplyRoot?.removeFromParent();this.playerBody?.root.removeFromParent();this.playerBody?.Dispose?.();
    this.beam?.removeFromParent();this.leftBeam?.removeFromParent();this.ClearMudMarks();this.mudMaterial=null;
    for(const prop of this.rifleProps)prop.removeFromParent();this.rifleProps=[];
    for(const material of this.owned)material.dispose();for(const geometry of this.ownedGeometry||[])geometry.dispose();this.owned=[];this.ownedGeometry=[];
  }
}
