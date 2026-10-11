import * as THREE from "three";
import { OPENING_STORYBOARDS as C } from "./Data_OpeningStoryboards.mjs";
import { MISSION_PLACEMENT as P, MISSION_ANCHORS as A } from "./Data_FirstLevelMissionLayout.mjs";
import { MISSION_ENCOUNTERS } from "./Data_FirstLevelMission.mjs";
import { FRONT_SPACE } from "./Data_FirstLevelFrontRoute.mjs";
import { LoadOpeningStoryboardAnimation, InstallOpeningStoryboardAnimation, SetOpeningActorPerformance, ClearOpeningActorPerformance,
  UpdateOpeningStoryboardCorpse, OpeningStage, OpeningClipMeta, OpeningClipRoot, OpeningPlayerPoint, OpeningPropConfig,
  OwnOpeningProp, DropOpeningWeapon, IsOpeningTerminalClip, OpeningClipLibrary } from "./Script_OpeningStoryboardAnimation.mjs";
import { OpeningPropSet, OpeningHoldTime, SampleOpeningPropTrack, PlaceOnOpeningTrack } from "./Script_OpeningProps.mjs";
import { SET_MARKS } from "./Data_OpeningSet0103.mjs";
import { OpeningFirstPerson, TrimOpeningPlayerBody, BuildOpeningFirstPersonWarmProps } from "./Script_OpeningFirstPerson.mjs";
import { GearCamera, GearPoint, GearData, GearArrivalS } from "./Script_OpeningFirstPersonGear.mjs";
import { WEAPONS } from "./Data_Weapons.mjs";
import { SpeakingCastOptions } from "./Data_FirstLevelSpeakingCast.mjs";
import { CharacterFacial } from "./Script_CharacterFacialAnimation.mjs";
import { PrepareFaceBloodVariants } from "./Script_CharacterFaceBlood.mjs";
import { CharacterWounds } from "./Script_CharacterWounds.mjs";
import { MISSION_STAGE_ROUTES } from "./Data_FirstLevelMissionTopology.mjs";
import { MissionRouteProjection, MissionRoutePoint, MissionRouteLength, MissionRouteBetween } from "./Script_FirstLevelMissionColumn.mjs";
import { SampleOpeningPerception } from "./Script_FirstLevelOpening.mjs";
import { BuildSink } from "./Script_World.mjs";
import { InCameraView } from "./Script_FirstLevelBackdropSquads.mjs";
import { OPENING_DEPTH_WALKERS, OPENING_DEPTH_IJA } from "./Data_FirstLevelBackdropSquads.mjs";
import { LoadRelaxedGait, SetRelaxedGait } from "./Script_RelaxedGait.mjs";
import { STANCE } from "./Data_Tuning_Player.mjs";
import { MISSION_DIALOGUE } from "./Data_FirstLevelMissionDialogue.mjs";
import { LENS_CHEEK_RESIDUE } from "./Data_OpeningLens.mjs";
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
/** A seeded uniform generator in [0, 1) (mulberry32): the machine gun's burst gaps are the same every run. */
function SeededRandom(seed){let a=seed>>>0;return()=>{a=(a+0x6D2B79F5)>>>0;let t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;return ((t^(t>>>14))>>>0)/4294967296;};}
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
// 2026-09-30 (docs/Data_OpeningSelfRescue20260930.md): Shunzi's body while he heaves himself out from under the timber and
// gets up is keyed on the director's clock in the HeaveRoot frame (rescue.heave.body, rescue.hand.rise). The parts (gaze /
// crown: points 1 m along the way the head faces / 0.2 m toward the crown).
const LUO_MODEL="TengxianNra05";
const SELF_TRACKS={ShunziHeave:()=>C.rescue.heave.body,ShunziRise:()=>C.rescue.hand.rise};
const RESCUE_PARTS=["eye","gaze","crown","chest","chestUp","pelvis","kneeL","kneeR","heelL","heelR","rifle","rifleMuzzle","rifleUp"];
/** A part of Shunzi's body from a rescue clip's stand-in keys (clip root frame, runtime metres) while it is not baked. */
function StandInPoint(clip,part,t){
  const keys=SELF_TRACKS[clip]?.()?.[part];
  if(!keys)return null;
  let a=keys[0],b=keys[0],k=0;
  if(t>keys[0][0])for(let i=1;i<keys.length;i++){if(t<keys[i][0]){a=keys[i-1];b=keys[i];k=Smooth((t-a[0])/(b[0]-a[0]));break;}a=b=keys[i];}
  const v=[0,1,2].map(i=>a[1][i]+(b[1][i]-a[1][i])*k);
  // gaze / crown are keyed as directions from the eye.
  if(part==="gaze"||part==="crown"){
    const e=StandInPoint(clip,"eye",t),l=Math.hypot(...v)||1,m=(part==="gaze"?1:.2)/l;
    return {x:e.x+v[0]*m,y:e.y+v[1]*m,z:e.z+v[2]*m};
  }
  return {x:v[0],y:v[1],z:v[2]};
}
/** Camera rotation looking from `eye` at `gaze` with its up toward `crown` (world points). */
function EyeQuaternion(eye,gaze,crown){
  const forward=gaze.clone().sub(eye).normalize(),up=crown?crown.clone().sub(eye):new THREE.Vector3(0,1,0);
  up.addScaledVector(forward,-up.dot(forward));
  if(up.lengthSq()<1e-8)up.set(0,1,0).addScaledVector(forward,-forward.y);
  up.normalize();
  const back=forward.clone().negate(),right=new THREE.Vector3().crossVectors(up,back).normalize();
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(right,up,back));
}

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

/**
 * The director's supply props: two procedural chargers (the first-person fill clip and its rounds are clones of the first)
 * and the loading rifle; made materials and geometries go to `owned` / `ownedGeometry` (the rifle's are the factory's).
 */
function BuildSupplyProps(r,owned,ownedGeometry){
  const supplyRoot=new THREE.Group();
  const brass=new THREE.MeshStandardMaterial({color:0x887039,metalness:.65,roughness:.58}),steel=new THREE.MeshStandardMaterial({color:0x343533,metalness:.7,roughness:.5});
  owned.push(brass,steel);
  const Clip=()=>{
    const clip=new THREE.Group();supplyRoot.add(clip);
    const frame=new THREE.Mesh(new THREE.BoxGeometry(.061,.005,.009),steel);clip.add(frame);frame.position.y=-.025;ownedGeometry.push(frame.geometry);
    for(let i=0;i<5;i++){const round=new THREE.Mesh(new THREE.CylinderGeometry(.003,.004,.053,8),brass);round.position.x=(i-2)*.011;clip.add(round);ownedGeometry.push(round.geometry);}
    return clip;
  };
  const clips=[Clip(),Clip()];
  const loadingRifle=new THREE.Group(),built=r.actorFactory.WeaponGeometry("HanYang",0,{includeBayonet:false});
  const materials=r.actorFactory.ActorMaterials("nra",()=>.5);
  for(const [key,geometry] of built.geometries)loadingRifle.add(new THREE.Mesh(geometry,materials[key]||materials.steel));
  supplyRoot.add(loadingRifle);
  return {supplyRoot,clips,loadingRifle,loadingRifleGrip:built.gripFront.clone(),loadingRifleMuzzle:built.muzzle?.clone()||new THREE.Vector3(0,0,-1)};
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
    for(const role of ["ijaA","ijaB","ijaC","ijaD","gunner","loader"]){
      const actor=this.Ija(role);if(!actor||actor.openingAdopted)continue;
      actor.openingAdopted=true;actor.grenades=0;PinOpeningScale(actor);InstallOpeningStoryboardAnimation(actor);
      if(role==="ijaA")OwnOpeningProp(actor,"bayonet");
      // Before the blast the vanguard is still on the far side of the line (2026-10-11: the three who drop in off the north
      // rim wait behind it, ijaB up the link sap, the machine-gun pair up there too).
      if(!this.r.Has("bunkerCollapsed")){
        this.Hide(actor);
        const at=["ijaA","ijaC","ijaD"].includes(role)?this.DropMarks(role).rim:role==="ijaB"?C.dropIn.bRoute[0]:C.wall.crewFrom;
        this.Put(actor,{x:at.x,z:at.z,yaw:Math.PI});
      }
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
    // The engine's cue names (contract §6 cues the Sfx package adds fall back to C.sfxStandIns until they are there).
    import("./Script_Audio.mjs").then(m=>{this.soundNames=new Set(m.SOUND_NAMES);}).catch(()=>{});
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
      // 2026-10-11 (contract §5.1): the six in the dugout on banter.* (every mark carries its facing).
      const b=C.banter;
      for(const [actor,mark] of [[this.Squad("yaowa"),b.yaowa],[this.Squad("luo"),b.luo],[this.Squad("heyoutian"),b.he],
        [this.Squad("liuwencai"),b.liu],[this.cast.shouter,{...b.shouter,yaw:-Math.PI/2}],[this.cast.comrade,b.comradeSeat]])
        if(actor)this.Put(actor,mark);
      // SB01 「纵深有人远去」: three men going up to the front line, backs to the camera (contract §2.3).
      for(const m of OPENING_DEPTH_WALKERS.members)this.Put(this.Spawn(m.id,"nra",m.start),{...m.start,yaw:-Math.PI/2});
      // 2026-10-11: the opening starts in the black on the count (contract §1.3).
      this.Stage("Count");return;
    }
    // Every start past Orders (a checkpoint after the near miss, a jump into 02 or later) has had the runner's call: 09-29's
    // fact runnerCallHeard and the RunnerCall beat are made true here too, so what waits for them is the same on every path.
    this.NoteRunnerCall({skipped:stage});
    if(stage==="Trapped"){this.StandInBodies();this.SpawnVictim();this.Stage("Wake");return;}
    // A checkpoint / stage jump into 02: the 01 aftermath is already true.
    if(stage==="BunkerRescue"){this.StageRescue();return;}
    // A debug start or checkpoint in the withdrawal: the 01–02 cast is already dead, fled or gone.
    this.StageAftermath({fled:true});
    this.phase??="Released";
  }
  /** The dead comrade on the clip he died on (2026-10-11: CaptiveThroatCutForward's last frame, terminal, on R3). */
  ComradeCorpse(){this.Corpse(this.Comrade,"CaptiveThroatCutForward");}
  /** The 01 aftermath on a start that skipped it: comrade dead at the wall, shouter killed by the
   *  near miss, runner gone with the squad; with fled, the interpreter has run off too. */
  StageAftermath({fled=false}={}){
    const r=this.r,comrade=this.Comrade;
    if(comrade?.alive){
      this.Put(comrade,this.ComradeWallRoot());comrade.scriptEssential=false;
      this.PlayClip(comrade,"CaptiveThroatCutForward",{at:r.time-10});this.Kill(comrade);this.ComradeCorpse();
    }
    this.flags.comradeDead=true;this.flags.flagFallProgress=1;this.r.openingSet?.PoseFlag("flagTrench",1);
    this.LayComradeRifle();
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
    this.flags.walkOffAt=this.flags.releasedAt=r.time-10;this.flags.depthIjaAt=r.time-10;
    if(this.cast.interpreter){this.Put(this.cast.interpreter,R.interpreter);this.cast.interpreter.openingWalk={key:"squat",index:0,done:true};}
    for(const role of ["ijaA","ijaB","ijaC","ijaD"])this.Show(this.Ija(role));
    if(this.Ija("ijaA"))this.Put(this.Ija("ijaA"),C.ija.crouch);
    // 2026-10-11 redraft (Dir02 brief 「起点状态」): where Dir01's Found leaves them -- ijaB guarding the junction J, ijaC at the
    // fold F, the recruit ijaD waiting with his bloody bayonet at the ready; the machine-gun crew on the south lip.
    for(const role of ["ijaB","ijaC","ijaD"])if(this.Ija(role))this.Put(this.Ija(role),R.vanguardPosts[role]);
    this.EnsureMgCrew();
    this.Stage("Hold");
  }
  /**
   * The machine-gun crew (BunkerGunner prone, BunkerLoader kneeling on the south lip, rescue.mgCrew): Dir01 brings them into
   * the roster; while they are not there the director makes stand-ins under the roster ids (entered in r.enemies, encounter
   * bunkerAssault) so the volley has them to shoot and the hand-back waits for them (pendingWiring N22). Idempotent.
   */
  EnsureMgCrew(){
    const r=this.r;
    for(const [role,spec] of Object.entries(C.rescue.mgCrew)){
      if(r.enemies.get(spec.id))continue;
      const actor=this.Spawn(role,"ija",spec.at,{weapon:spec.weapon,castId:role});
      actor.missionId=spec.id;actor.missionEncounter="bunkerAssault";actor.grenades=0;actor.openingMgStandIn=true;
      r.enemies.set(spec.id,actor);
      this.Put(actor,spec.at);
      r.ai.SetStance?.(actor,spec.stance,999,true);
      this.flags.mgStandIn=(this.flags.mgStandIn||0)+1;
    }
  }
  Stage(phase){this.Set(phase);this.phaseEntered=null;}
  // ---- props ------------------------------------------------------------------------------
  MakeSupplyProps(){
    const supply=BuildSupplyProps(this.r,this.owned,this.ownedGeometry);
    this.supplyRoot=supply.supplyRoot;this.r.scene.add(this.supplyRoot);
    this.clips=supply.clips;this.loadingRifle=supply.loadingRifle;this.loadingRifleGrip=supply.loadingRifleGrip;this.loadingRifleMuzzle=supply.loadingRifleMuzzle;
  }
  // ---- loading-screen warm-up ---------------------------------------------------------------
  /**
   * Stand-ins for what Setup makes only once the player is in, for Script_Main.WarmLevel's proxy pass (submitted through
   * CompileAsRendered, then drawn; docs/Data_TechRenderPipeline.md §18.7): every first-person prop (FP_PROPS) made by the same
   * code on a supply set of its own, under a character root as on the player body (the whitebox profile keeps their own
   * materials), and the comrade's facial skin with the face-blood variant swapped in. Before this the fill charger and the
   * face blood linked their programs in the opening's first second (frames 16 and 22 after 进城, Script_WhiteboxShaderWarmTest),
   * the gear-up's canvas straps when they first showed. Their materials are never disposed:
   * the programs Setup's own copies need stay cached through them. Undo with DisposeWarmProxy.
   */
  WarmProxy(){
    const r=this.r,group=new THREE.Group();group.name="ShaderWarm_Opening";
    const props=new THREE.Group();props.name="ShaderWarm_OpeningFirstPerson";props.userData.whiteboxCharacter=true;group.add(props);
    const show={r,owned:[],ownedGeometry:[]};
    BuildOpeningFirstPersonWarmProps(Object.assign(show,BuildSupplyProps(r,show.owned,show.ownedGeometry)),props);
    const warm={geometries:show.ownedGeometry,comrade:null,restoreBlood:null};
    // ComradeBleeds' SetFaceBlood, on the comrade's own skin (the spawn options of Setup's Spawn("comrade")).
    try{
      warm.comrade=r.actorFactory.Create("nra",{seed:90917,...SpeakingCastOptions("comrade"),weapon:null,noPool:true});
      warm.restoreBlood=PrepareFaceBloodVariants(warm.comrade?.characterRig?.root);
      if(warm.comrade)group.add(warm.comrade.root);
    }catch(error){console.warn("[OpeningStoryboards] warm-up comrade unavailable (his face blood links when it first shows)",error);}
    group.userData.openingWarm=warm;
    return group;
  }
  DisposeWarmProxy(group){
    const warm=group?.userData.openingWarm;if(!warm)return;
    group.removeFromParent();warm.restoreBlood?.();warm.comrade?.Dispose();
    for(const geometry of warm.geometries)geometry.dispose();
    group.clear();delete group.userData.openingWarm;
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
    if(actor===this.cast.interpreter&&step>0&&this.flags["fled:interpreter"]==null)this.AvoidInterpreterOverlap(from,to,actor);
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
    if(!this.ready)return;
    if(["Trapped","BunkerRescue","RearTrench"].includes(stage)||this.setup)this.Setup();
    if(!this.setup)return;
    this.AdoptAssault();
    if(stage==="Trapped"||stage==="BunkerRescue"){
      if(this.phase==null)this.Stage("Count");
      // Phase dispatch: the handler of the current phase (contract §2 table; Data_OpeningStoryboards.phases). 01 (Dir01): Count,
      // Banter, Orders, Incoming, Blast, Black, Wake, DropIn, Sweep, CaptiveDragged, CaptiveWall, Interrogation, Practice, Slash,
      // Finish, Found. 02 (Dir02): Hold, Ask, Blade (PhaseBlade, Dir02's), Charge, Melee, Lift, Check, Released.
      this.TickTalks();
      const handler=this["Phase"+this.phase];
      if(handler)handler.call(this,this.Age);
      this.TickTalks();
      this.MachineGunBursts();
      this.UpdateFlyers();
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
  // -- 01 (2026-10-11 Notion redraft: docs/Data_OpeningRedraft20261011Contract.md; phases Count ... Found) -------------------
  // ---- director events, timed talk, stand-in props and sounds ------------------------------------------------------------
  /**
   * A frozen director event (contract §3; the voice direction's `after:"event:<name>"`, Brief Voice item 4): sent to the voice
   * layer (voice.Signal), kept once in flags["ev:<name>"] and in the `emitted` log (State) for the report and the probes.
   */
  Emit(name,detail=null){
    const r=this.r;if(this.flags["ev:"+name]!=null)return false;
    this.flags["ev:"+name]=r.time;
    (this.emitted??=[]).push({event:name,time:+r.time.toFixed(3),phase:this.phase,...(detail?{detail}:{})});
    r.voice?.Signal?.(name);
    return true;
  }
  Fired(name){return this.flags["ev:"+name]!=null;}
  /** Seconds since event `name` (-Infinity before it). */
  Since(name){const t=this.flags["ev:"+name];return t==null?-Infinity:this.r.time-t;}
  /** Is the voice layer's take of `sceneId` this round's (C.lines: as many lines, the same speakers)? A scene with no row in
   *  C.lines (unchanged by the redraft) always is. */
  RecordedTake(sceneId){
    const table=C.lines[sceneId];if(!table)return true;
    const cue=MISSION_DIALOGUE.find(c=>c.id===sceneId);
    return !!cue?.perLine&&cue.lines.length===table.length&&cue.lines.every((line,i)=>line.who===table[i][0]);
  }
  /**
   * Start a dialogue scene once and keep its timeline (this.talks[id]): the voice layer's handle when its take is this
   * round's (RecordedTake; line starts from onLine, ends from the handle's line states), else the estimated take of C.lines
   * (each line opens when the event its direction waits on has fired + afterS, or gapS after the line before, and lasts
   * its estimated seconds; no audio -- a wordless scene plays C.voiceStandIns' cue from the speaker's head instead). Either
   * way LineAt / LineEndAt / TalkDone read the same timeline, so the beats keyed on lines run the same with and without the
   * recordings.
   */
  Talk(sceneId,{onLine=null,gate=null}={}){
    const r=this.r;
    if(this.talks?.[sceneId])return this.talks[sceneId];
    const t=(this.talks??={})[sceneId]={id:sceneId,started:r.time,starts:{},ends:{},mode:"estimate",onLine,gate,next:0,done:false,doneAt:null};
    if(this.RecordedTake(sceneId)){
      const handle=r.voice?.PlayScene(sceneId,{speakers:this.Speakers(),gate,onLine:(lineId)=>{t.starts[lineId]??=r.time;onLine?.(lineId);}});
      if(handle){t.mode="voice";t.handle=handle;this.Scene(sceneId,handle);}
    }
    if(t.mode!=="voice"){this.flags["scene:"+sceneId]=r.time;t.rows=C.lines[sceneId]||[];}
    this.flags["voice:"+sceneId]=t.mode;
    return t;
  }
  /** Every frame: advance the estimated takes, note the recorded lines' ends. */
  TickTalks(){
    const r=this.r;
    for(const t of Object.values(this.talks||{})){
      if(t.done)continue;
      if(t.mode==="voice"){
        for(const line of t.handle.lines||[]){
          const id=line.line?.id;if(!id)continue;
          if(line.state==="playing")t.starts[id]??=r.time;
          if(line.state==="done"||line.state==="skipped"){t.starts[id]??=r.time;t.ends[id]??=r.time;}
        }
        if(t.handle.done||t.handle.stopped){t.done=true;t.doneAt=r.time;for(const id of Object.keys(t.starts))t.ends[id]??=r.time;}
        continue;
      }
      for(let guard=0;guard<4&&t.next<t.rows.length;guard++){
        const [who,seconds,o={}]=t.rows[t.next],id=`${t.id}.${String(t.next+1).padStart(2,"0")}`;
        const prevEnd=t.next?t.ends[`${t.id}.${String(t.next).padStart(2,"0")}`]:t.started;
        if(prevEnd==null||r.time<prevEnd)break;
        let at=prevEnd+(t.next?o.gapS??.35:o.gapS??0);
        if(o.wait){const ev=this.flags["ev:"+o.wait]??this.flags[o.wait];if(ev==null)break;at=Math.max(prevEnd,ev+(o.afterS||0));}
        if(r.time<at||t.gate&&!t.gate(id))break;
        t.starts[id]=at;t.ends[id]=at+seconds;t.next++;
        const cue=C.voiceStandIns[t.id];
        if(cue)r.audio?.Play?.(cue,{position:this.HeadPoint(this.SpeakerActor(who))||r.player.camera.position.clone(),volume:.85});
        t.onLine?.(id);
      }
      const last=`${t.id}.${String(t.rows.length).padStart(2,"0")}`;
      if(t.next>=t.rows.length&&(t.ends[last]==null||r.time>=t.ends[last])){t.done=true;t.doneAt=t.ends[last]??r.time;}
    }
  }
  LineAt(lineId){const t=this.talks?.[lineId.split(".")[0]];const at=t?.starts[lineId];return at!=null&&at<=this.r.time?at:null;}
  LineEndAt(lineId){const t=this.talks?.[lineId.split(".")[0]];const at=t?.ends[lineId];return at!=null&&at<=this.r.time?at:null;}
  TalkDone(sceneId){return !!this.talks?.[sceneId]?.done;}
  /** Estimated length of a scene (the lines table; a recorded scene: the manifest), for the timeouts. */
  TalkLength(sceneId){
    const rows=C.lines[sceneId];if(!rows||this.RecordedTake(sceneId)&&this.talks?.[sceneId]?.mode==="voice")return this.SceneLength(sceneId);
    return rows.reduce((sum,[,s,o={}],i)=>sum+s+(i?o.gapS??.35:0)+(o.afterS||0),0);
  }
  // ---- 2026-10-11 integration: clip clocks, the Set's props and marks -----------------------------------------------------
  /**
   * A clip on its own clock (this.clipClocks[key] = {clip, base, release, actor}): `seconds` = r.time - base and, with a hold
   * loop, the loop is held until `release` (r.time; null = held on) and then played on from where the loop was
   * (OpeningHoldTime, the animation layer's own rule). ClockTime is the clip time the animation layer shows (events).
   */
  StartClock(key,clip,base=this.r.time,release=null){return (this.clipClocks??={})[key]={clip,base,release};}
  Clock(key){return this.clipClocks?.[key]||null;}
  ClockTime(key){
    const k=this.Clock(key);if(!k)return -1;
    const m=OpeningClipMeta(k.clip),s=this.r.time-k.base;
    return OpeningHoldTime(m?.holdLoop,m?.duration??Infinity,s,k.release==null?Infinity:k.release-k.base);
  }
  /** Pose `actor` on `root` with clip clock `key` (Hold: a mark more than 0.6 m off is walked to first). Returns the clip time. */
  ClockPose(key,actor,root,options={}){
    const k=this.Clock(key);if(!k||!actor)return -1;
    const holdUntil=k.release==null?Infinity:k.release-k.base;
    if(root)this.Hold(actor,root,k.clip,{...options,seconds:this.r.time-k.base,holdUntil});
    else this.Pose(actor,k.clip,{...options,seconds:this.r.time-k.base,holdUntil});
    return this.ClockTime(key);
  }
  /** The time at which clock `key`'s loop phase reaches `phase` next (no earlier than `from`). */
  ClockPhaseAt(key,phase,from=this.r.time){
    const k=this.Clock(key),m=OpeningClipMeta(k?.clip),loop=m?.holdLoop;if(!k||!loop)return from;
    const span=loop[1]-loop[0];if(!(span>0))return from;
    const s=from-k.base,at=s<loop[0]?loop[0]:s,cycle=Math.floor((at-loop[0])/span);
    let t=loop[0]+cycle*span+(phase-loop[0]);if(t<s)t+=span;
    return k.base+t;
  }
  /** The Set's world props (Script_OpeningSet r.openingSet.props; null outside 01–02 or before the set is built). */
  get Props(){return this.r.openingSet?.props||null;}
  /** A world prop's pose from `clip`'s prop track at `seconds` as `actor` would show it standing on `root` ({x,z,yaw}):
   *  {position, quaternion} (THREE), or null without the library / the track. */
  ClipPropWorld(actor,clip,prop,seconds,root){
    const rig=actor?.actor?.characterRig,lib=OpeningClipLibrary(),row=lib?.models.get(rig?.clipModelId||rig?.modelId)?.clips?.[clip];
    const track=row?.props?.[prop];if(!track||!rig?.root||!actor.actor.root)return null;
    const sample=SampleOpeningPropTrack(track,row,seconds);if(!sample)return null;
    // The rig root as it would stand on `root`: the actor root's world matrix there, times the rig root's offset from it.
    const actorRoot=actor.actor.root;actorRoot.updateWorldMatrix(true,true);
    const rel=actorRoot.matrixWorld.clone().invert().multiply(rig.root.matrixWorld);
    const at=new THREE.Matrix4().compose(new THREE.Vector3(root.x,this.r.battlefield.GroundHeight(root.x,root.z),root.z),
      new THREE.Quaternion().setFromAxisAngle(UP,root.yaw??0),new THREE.Vector3(1,1,1)).multiply(rel);
    // A parentless stand-in for the rig root (matrix fixed) and an identity parent for the probe object: world = local.
    const probe=this.clipPropProbe??=(()=>{const rigRoot=new THREE.Object3D(),parent=new THREE.Object3D(),object=new THREE.Object3D();
      rigRoot.matrixAutoUpdate=false;parent.add(object);return {rigRoot,parent,object};})();
    probe.rigRoot.matrix.copy(at);probe.rigRoot.matrixWorld.copy(at);
    PlaceOnOpeningTrack(probe.object,sample,probe.rigRoot,new THREE.Vector3(0,0,-1),new THREE.Vector3(0,1,0),false);
    return {position:probe.object.position.clone(),quaternion:probe.object.quaternion.clone(),visible:sample[9]>.5};
  }
  /** Hide `prop` drawn by `actor`'s clip until r.time `until` (a flight the director draws itself up to then); BeforeRender. */
  HideClipProp(actor,prop,until){(this.clipPropHidden??=[]).push({actor,prop,until});}
  ApplyClipPropHidden(){
    if(!this.clipPropHidden?.length)return;
    this.clipPropHidden=this.clipPropHidden.filter(h=>this.r.time<h.until);
    for(const h of this.clipPropHidden){const item=h.actor?.actor?.characterRig?.openingProps?.items?.get?.(h.prop);if(item)item.object.visible=false;}
  }
  /** A contract §6 cue by name; while the engine has no such cue yet (the Sfx package's), its stand-in (C.sfxStandIns). */
  Sfx(cue,options={}){
    const name=this.soundNames&&!this.soundNames.has(cue)?C.sfxStandIns[cue]||cue:cue;
    return this.r.audio?.Play?.(name,options)||null;
  }
  /** World point of an actor's hand bone (side "L" / "R"), or his chest height over his root. */
  HandPoint(actor,side="R"){
    const bone=actor?.actor?.characterRig?.bones?.["hand"+side];
    if(bone&&(!actor.renderLod||actor.renderLod==="detail"))return bone.getWorldPosition(new THREE.Vector3());
    return actor?this.r.Point(actor.openingStoryboardLast||actor.position,1.05):null;
  }
  /** Shunzi's left thigh (the first-person body seated on the fill clip): where Liu's clip lands. */
  LapPoint(){
    const bones=this.playerBody?.characterRig?.bones;
    if(bones?.thighL&&bones.calfL)return bones.thighL.getWorldPosition(new THREE.Vector3()).lerp(bones.calfL.getWorldPosition(new THREE.Vector3()),.55).add(new THREE.Vector3(0,.07,0));
    return this.r.Point(C.shunzi.seat,.45);
  }
  /** One of the first-person palms (side "l" / "r") as last posed. */
  PalmPoint(side){const palm=this.firstPersonState?.hands?.[side]?.palm;return palm?new THREE.Vector3(...palm):this.r.player.camera.position.clone();}
  /**
   * Stand-in props in flight (pendingWiring: Set's clipA / clipB / bread / breadPiece / rifleBolt / grenade). `from` / `to`
   * are world points or functions returning them; before `start` the prop rides `from` (held in a hand), then it flies on an
   * arc `arcM` high over `seconds`, spinning, and rests at `to` (or is hidden: then "hide") until Hidden by key.
   */
  Fly(key,kind,from,to,{start=this.r.time,seconds=.6,arcM=.25,spin=9,then="rest"}={}){
    const object=this.FlyerMesh(kind);
    (this.flyers??={})[key]?.object.removeFromParent();
    this.flyers[key]={key,object,from,to,start,seconds,arcM,spin,then,landed:false};
    this.r.scene.add(object);object.visible=true;
    return this.flyers[key];
  }
  HideFlyer(key){const f=this.flyers?.[key];if(f){f.object.visible=false;f.hidden=true;}}
  UpdateFlyers(){
    const r=this.r,At=p=>typeof p==="function"?p():p;
    for(const f of Object.values(this.flyers||{})){
      if(f.hidden)continue;
      const t=(r.time-f.start)/f.seconds,a=At(f.from);
      if(t<0){if(a)f.object.position.copy(a);continue;}
      if(t>=1){
        if(!f.landed){f.landed=true;f.landedAt=r.time;const b=At(f.to);if(b)f.object.position.copy(b);f.object.rotation.set(Math.PI/2,f.object.rotation.y,0);
          if(f.then==="hide")this.HideFlyer(f.key);}
        continue;
      }
      const b=At(f.to);if(!a||!b)continue;
      f.object.position.lerpVectors(f.fromAt??=a.clone(),b,t);f.object.position.y+=f.arcM*4*t*(1-t);
      f.object.rotation.set(f.spin*t,f.spin*.37*t,f.spin*.6*t);
    }
  }
  /** The procedural stand-in meshes (one material each, made once; geometry per flyer). */
  FlyerMesh(kind){
    const M=this.flyerMaterials??={};
    const Mat=(name,color,metalness=0,roughness=.85)=>M[name]??=(()=>{const m=new THREE.MeshStandardMaterial({color,metalness,roughness});this.owned.push(m);return m;})();
    const Mesh=(geometry,material)=>{this.ownedGeometry.push(geometry);return new THREE.Mesh(geometry,material);};
    const group=new THREE.Group();group.name="OpeningStandIn_"+kind;
    if(kind==="clip"){
      const frame=Mesh(new THREE.BoxGeometry(.061,.005,.009),Mat("steel",0x343533,.7,.5));frame.position.y=-.025;group.add(frame);
      for(let i=0;i<5;i++){const round=Mesh(new THREE.CylinderGeometry(.003,.004,.053,8),Mat("brass",0x887039,.65,.58));round.position.x=(i-2)*.011;group.add(round);}
    }else if(kind==="bread")group.add(Mesh(new THREE.BoxGeometry(.07,.016,.05),Mat("bread",0xb08a52)));
    else if(kind==="bolt")group.add(Mesh(new THREE.CylinderGeometry(.007,.007,.13,8),Mat("steel",0x343533,.7,.5)));
    else if(kind==="grenade"){
      // Type 91: a segmented cylinder, 5 cm across, 9.5 cm long, with the fuse cap (contract §5.2).
      group.add(Mesh(new THREE.CylinderGeometry(.025,.025,.07,10),Mat("grenade",0x3b3f35,.3,.7)));
      const cap=Mesh(new THREE.CylinderGeometry(.011,.013,.025,8),Mat("steel",0x343533,.7,.5));cap.position.y=.047;group.add(cap);
    }
    return group;
  }
  /** Stand-ins for Set's static corpses (standIns.bodies): dead NRA actors on ShotCollapse's last frame at the §5.3 marks. */
  StandInBodies(){
    if(!C.standIns.bodies||this.flags.bodiesPlaced)return;
    this.flags.bodiesPlaced=true;
    const M=C.marks,marks=[["SweepBody0",M.sweepBodies[0]],["SweepBody1",M.sweepBodies[1]],...M.finishBodies.map((p,i)=>["FinishBody"+i,p]),
      ["MgCorpseLower",M.mgCorpseLower],["MgCorpseUpper",M.mgCorpseUpper]];
    for(const [id,mark] of marks){
      const actor=this.Spawn(id,"nra",mark,{unarmed:true,weapon:null,actorKind:"nra",modelVariant:1});
      this.Put(actor,mark);this.PlayClip(actor,"ShotCollapse",{at:this.r.time-5,restart:true});this.Corpse(actor,"ShotCollapse");
      actor.scriptEssential=false;this.Kill(actor,"bullet");this.Corpse(actor,"ShotCollapse");
    }
  }
  /** The man who shams dead in the front trench (sweep.bodies[2]): the director's NRA spawn, lying on ShotCollapse's end. */
  SpawnVictim(){
    if(this.cast.SweepVictim||this.flags.victimDead)return this.cast.SweepVictim||null;
    const mark=C.marks.sweepBodies[2],actor=this.Spawn("SweepVictim","nra",mark,{unarmed:true,weapon:null,actorKind:"nra",modelVariant:1});
    this.Put(actor,mark);this.PlayClip(actor,"ShotCollapse",{at:this.r.time-5,restart:true});
    return actor;
  }
  /** Bodies stay dead on their last frame; the live victim lies still (his claw is SweepB's). */
  HoldBodies(){
    for(const id of ["SweepBody0","SweepBody1",...C.marks.finishBodies.map((p,i)=>"FinishBody"+i),"MgCorpseLower","MgCorpseUpper"]){const a=this.cast[id];if(a)this.Corpse(a,"ShotCollapse");}
    const v=this.cast.SweepVictim;
    if(v&&!v.alive)this.Corpse(v,"ShotCollapse");
    else if(v&&this.flags.victimClawAt==null){this.Put(v,C.marks.sweepBodies[2]);this.Pose(v,"ShotCollapse",{seconds:5});}
  }
  /** The dugout's six (contract §5.1, banter.*) on their marks: each until his own beat moves him. */
  Tableau(){
    const r=this.r,b=C.banter,yaowa=this.Squad("yaowa");
    for(const role of ["ijaA","ijaB","ijaC","ijaD","gunner","loader"])this.Hide(this.Ija(role));
    this.Hide(this.cast.interpreter);this.Hide(this.cast.runner);
    Equip(yaowa,"HanYang");
    this.YaowaBread();
    this.LuoAtMouth();this.HeAsleep();
    this.LiuAmmo();
    this.Hold(this.cast.shouter,{...b.shouter,yaw:-Math.PI/2},null);
    this.ComradeSeated();
    this.DepthWalkers();
  }
  /** Luo standing in the mouth looking down the front trench, his back to the room; GuardTurn when something makes him look
   *  round (the near shell, the far call; flags.luoTurnAt). */
  LuoAtMouth(){
    const luo=this.Squad("luo"),b=C.banter,t=this.flags.luoTurnAt!=null?this.r.time-this.flags.luoTurnAt:-1;
    this.Hold(luo,b.luo,t>=0&&t<ClipLength("GuardTurn",1.2)?"GuardTurn":null,t>=0?{seconds:t}:{});
  }
  // ---- 2026-10-11 integration: the dugout on AnimA's clips (contract §4.2 A, N01–N04) --------------------------------------
  /** Yaowa's mark: the breadToss stage round the comrade's seat (he catches the corner the comrade's clip throws), else banter.yaowa. */
  YaowaMark(){return OpeningStage("breadToss")?this.StageRoot("breadToss","yaowa",C.banter.comradeSeat):C.banter.yaowa;}
  /**
   * Yaowa crouched hugging his rifle, eyes on the bread (YaowaCrouchCatchEat's hold loop), catching the corner and eating it: his
   * clock runs 0.5 s ahead of the comrade's (breadToss offsetS 2.5 on a 3 s / 1.5 s pair of loops), both let go of their loops at the
   * same instant (comrade loop phase 2.5 = Yaowa's 0), so the corner the comrade's clip throws lands in his hand at `catch`.
   */
  YaowaBread(){
    const yaowa=this.Squad("yaowa"),clip="YaowaCrouchCatchEat";if(!yaowa)return;
    if(!OpeningClipMeta(clip)){this.Hold(yaowa,C.banter.yaowa,"YaowaSitLoad");return;}
    const k=this.Clock("yaowa")||this.StartClock("yaowa",clip,(this.Clock("comrade")?.base??this.r.time)-.5);
    const t=this.ClockPose("yaowa",yaowa,this.YaowaMark());
    if(k.release!=null&&t>=EventAt(clip,"catch",1.917))this.flags.breadCaughtAt??=this.r.time;
    if(k.release!=null&&t>=ClipLength(clip,4.25)-1e-3)this.StartClock("yaowa",clip);
  }
  /**
   * The comrade against the south wall: ComradeEatBreadToss (nibbling, its hold loop; let go once BunkerBanter.04 is said -> `toss` =
   * breadToss -> back to nibbling), then from `pour` ComradePourRoundsLaugh (the rounds poured at Shunzi's feet = pour, held settled
   * until the laugh = comradeLaugh, leaning back with the eyes shut on its hold loop) until the order.
   */
  ComradeSeated(){
    const r=this.r,f=this.flags,c=this.Comrade,seat=C.banter.comradeSeat,eat="ComradeEatBreadToss",pour="ComradePourRoundsLaugh";
    if(!OpeningClipMeta(eat)){this.Hold(c,seat,"WoundedSitRifleIdle");return;}
    const k=this.Clock("comrade")||this.StartClock("comrade",eat);
    if(k.clip===eat&&k.release==null&&f.pourGo!=null&&r.time>=f.pourGo)this.StartClock("comrade",pour,f.pourGo);
    const now=this.Clock("comrade");
    if(now.clip===eat){
      const t=this.ClockPose("comrade",c,seat);
      if(now.release!=null&&t>=EventAt(eat,"toss",3.958))this.Emit("breadToss");
      if(now.release!=null&&t>=ClipLength(eat,5)-1e-3)this.StartClock("comrade",eat);
      return;
    }
    // ComradePourRoundsLaugh: settled at `settled` until the laugh is due (f.laughGo), its own hold loop after.
    const settled=EventAt(pour,"settled",2.417),s=r.time-now.base;
    const seconds=f.laughGo==null||r.time<f.laughGo?Math.min(s,settled):settled+(r.time-f.laughGo);
    this.Hold(c,seat,pour,{seconds,holdUntil:Infinity});
    if(seconds>=EventAt(pour,"pour",1.25))this.Emit("pour");
    if(seconds>=EventAt(pour,"laugh",2.667))this.Emit("comradeLaugh");
  }
  /** Liu crouched at the ammo box counting clips (LiuDivideAmmoToss's hold loop), tossing one onto Shunzi's leg (liuToss at its
   *  `toss`; the clip on the thigh from its `lands` -- a stand-in charger where the clip's track leaves it), and at the order slamming
   *  the box shut and shouldering it (LiuBoxUpGo from his loop's start). The Set's ammoBox is held by his clips' track. */
  LiuAmmo(){
    const r=this.r,f=this.flags,liu=this.Squad("liuwencai"),b=C.banter,count="LiuDivideAmmoToss",box="LiuBoxUpGo";
    if(!liu)return;
    if(!OpeningClipMeta(count)){this.Hold(liu,b.liu,"ClipLoad");return;}
    const props=this.Props;
    if(props&&f.liuBoxHeld==null){f.liuBoxHeld=r.time;props.Hold("ammoBox",liu);}
    const k=this.Clock("liu")||this.StartClock("liu",count);
    if(k.clip===count&&f.liuBoxGo!=null&&r.time>=f.liuBoxGo)this.StartClock("liu",box,f.liuBoxGo);
    const now=this.Clock("liu");
    if(now.clip===count){
      const t=this.ClockPose("liu",liu,b.liu);
      if(now.release!=null){
        if(t>=EventAt(count,"toss",3.0))this.Emit("liuToss");
        if(t>=ClipLength(count,4)-.05&&!f.liuClipOnLeg){
          f.liuClipOnLeg=r.time;const at=this.ClipPropWorld(liu,count,"clipA",ClipLength(count,4),b.liu);
          if(at){const fl=this.Fly("liuClip","clip",at.position,at.position,{start:r.time,seconds:.01});fl.object.quaternion.copy(at.quaternion);}
        }
        if(t>=ClipLength(count,4)-1e-3)this.StartClock("liu",count);
      }
      return;
    }
    // LiuBoxUpGo: slam, lift, shouldered; then (ExitSquad) off with the box on his shoulder.
    const t=r.time-now.base,length=ClipLength(box,2.5);
    if(t<length){this.Hold(liu,b.liu,box,{seconds:t});if(t>=EventAt(box,"slam",.417)&&f.liuSlamAt==null){f.liuSlamAt=r.time;r.audio?.Play?.("impactWood",{position:r.Point(b.liu,.4),volume:.7});}return;}
    if(f.liuBoxDoneAt==null){
      f.liuBoxDoneAt=r.time;
      // The box stays on his shoulder for the walk out: the world box held on his chest bone where the clip left it.
      const item=liu.actor?.characterRig?.openingProps?.items?.get?.("ammoBox")?.object,bone=liu.actor?.characterRig?.bones?.chest;
      if(props&&item&&bone){
        item.updateWorldMatrix(true,false);bone.updateWorldMatrix(true,false);
        const local=bone.matrixWorld.clone().invert().multiply(item.matrixWorld),p=new THREE.Vector3(),q=new THREE.Quaternion(),sc=new THREE.Vector3();
        local.decompose(p,q,sc);const e=new THREE.Euler().setFromQuaternion(q,"XYZ");
        props.Hold("ammoBox",liu,{bone:"chest",offset:[p.x,p.y,p.z],rotDeg:[e.x/DEG,e.y/DEG,e.z/DEG]});
      }
      this.RerootUnderPelvis(liu,liu.yaw);
    }
  }
  /**
   * He asleep in the far corner, curled on his side (HeHelmetSleepSitUp's first frame), rolling over at heRoll (its `roll`) onto its
   * hold loop, sitting up at the far call (sitUp: the loop let go -> its `sitUp`, `sat`), sitting there until the order (ExitSquad
   * re-roots him under his pelvis: the clip turns and moves him). The helmet track has no mesh (no `helmet` prop): his own stays on.
   */
  HeAsleep(){
    const r=this.r,he=this.Squad("heyoutian"),b=C.banter,f=this.flags,clip="HeHelmetSleepSitUp";if(!he)return;
    if(!OpeningClipMeta(clip)){
      if(this.Fired("sitUp")){this.Hold(he,b.he,"WoundedSitRifleIdle");return;}
      const roll=this.Since("heRoll");this.Hold(he,b.he,"ShotCollapse",{seconds:roll>0&&roll<.6?1+roll:5});return;
    }
    const sit=this.flags["ev:sitUp"],roll=this.flags["ev:heRoll"]??(sit!=null?sit-.7:null);
    const seconds=roll==null?0:r.time-roll,holdUntil=sit==null?Infinity:Math.max(0,sit-roll);
    this.Hold(he,b.he,clip,{seconds,holdUntil});
  }
  ComradeGesture(clip,length){this.flags.comradeAdditive={clip,at:this.r.time,length};}
  /** 「黑场里先是声音：远处一声炮响，隔几秒又一声。近处有人在小声数数」: two far guns, BunkerCount, a near one shedding dirt
   *  between its first two lines; the picture comes up once Luo's line is over (Banter's fade-in). */
  PhaseCount(age){
    const r=this.r,K=C.count;
    if(!this.phaseEntered){this.phaseEntered=true;this.started=r.time;}
    this.Tableau();
    K.farGunsS.forEach((t,i)=>{
      if(age<t||this.flags["farGun:"+i]!=null)return;
      this.flags["farGun:"+i]=r.time;r.audio?.Play?.("explosionFar",{position:r.Point(K.farGunAt[i%K.farGunAt.length],2),volume:.9});
    });
    if(age>=K.sceneS)this.Talk("BunkerCount");
    const line1=this.LineEndAt("BunkerCount.01");
    if(line1!=null&&this.flags.countDirtAt==null&&r.time>=line1+K.dirtAfterLine1S){
      this.flags.countDirtAt=r.time;
      this.Sfx("shellDirt",{position:r.Point(C.shunzi.seat,1.6),volume:.65});
      r.vfx?.Impact?.(r.Point(C.shunzi.seat,1.65),new THREE.Vector3(0,-1,0),"dirt");
    }
    const talk=this.talks?.BunkerCount;
    if(talk?.done&&r.time>=talk.doneAt+K.fadeAfterS||age>K.sceneS+this.TalkLength("BunkerCount")+C.timeouts.countExtraS)this.Stage("Banter");
  }
  /** The near shell after BunkerBanter.06: the dugout jumps, dirt pours into his collar (flags.dirtAt: the first person's
   *  dig-out), Luo looks round. */
  NearShell(){
    const r=this.r,S=C.shunzi,B=C.banter.beats;
    this.flags.dirtAt=r.time+B.nearShellDirtS;this.flags.joltAt=r.time;this.flags.luoTurnAt=r.time+.3;
    r.audio?.Play?.("explosionMid",{position:r.Point({x:2.9,z:-122.6},.4),volume:.95});
    this.Sfx("shellDirt",{position:r.Point(S.seat,1.5),volume:.8,delay:.1});
    r.vfx?.Impact?.(r.Point(S.seat,1.6),new THREE.Vector3(0,-1,0),"dirt");
    r.vfx?.Impact?.(r.Point({x:.6,z:-125.6},1.7),new THREE.Vector3(0,-1,0),"dirt");
  }
  /** Banter (contract §3 BunkerBanter + BunkerLedger): Liu's clip, the bread, the near shell, He rolling over, the rounds
   *  poured at Shunzi's feet, the comrade's laugh -- each a frozen event the voice direction waits on. */
  PhaseBanter(age){
    const r=this.r,B=C.banter.beats;
    if(!this.phaseEntered){this.phaseEntered=true;this.started=r.time;}
    this.Tableau();
    const liu=this.Squad("liuwencai"),comrade=this.Comrade,yaowa=this.Squad("yaowa");
    // 「刘文财数出一夹，隔着两个人丢过来，落在顺子腿上」 (LiuDivideAmmoToss let go of its loop liuReleaseS before liuTossS: liuToss at
    // its `toss`; without the clip, the old stand-in charger flown from his hand).
    if(OpeningClipMeta("LiuDivideAmmoToss")){const k=this.Clock("liu");if(k&&k.release==null&&k.clip==="LiuDivideAmmoToss"&&age>=B.liuTossS-B.liuReleaseS)k.release=r.time;}
    else if(age>=B.liuTossS&&this.Emit("liuToss"))
      this.Fly("liuClip","clip",this.HandPoint(liu,"R"),()=>this.LapPoint(),{seconds:B.flightS,arcM:.35});
    if(this.Since("liuToss")>=B.liuLineAfterS)this.Talk("BunkerBanter");
    // 「他掰下一角丢过去。幺娃接住就塞进嘴里」 (after .04)
    if(this.LineEndAt("BunkerBanter.04")!=null&&this.flags.breadReleaseAt==null){
      // ComradeEatBreadToss and YaowaCrouchCatchEat let go together where the comrade's loop is at 2.5 s (breadToss at its `toss`).
      const at=this.flags.breadReleaseAt=OpeningClipMeta("ComradeEatBreadToss")?this.ClockPhaseAt("comrade",2.5):r.time,kc=this.Clock("comrade"),ky=this.Clock("yaowa");
      if(kc)kc.release=at;if(ky)ky.release=at;
      if(!OpeningClipMeta("ComradeEatBreadToss")&&this.Emit("breadToss"))
        this.Fly("bread","bread",this.HandPoint(comrade,"R"),()=>this.HandPoint(yaowa,"R"),{seconds:B.breadFlightS,arcM:.3,then:"hide"});
    }
    // 「近处落了一发。整个洞一跳，土从洞顶泼下来，掉进顺子衣领」 (nearShellAfterS after .06; .07 waits for it)
    const line6=this.LineEndAt("BunkerBanter.06");
    if(line6!=null&&r.time>=line6+B.nearShellAfterS&&this.Emit("nearShell"))this.NearShell();
    // The dirt shaken out of the collar (the first person's dig keys) falls in front of him.
    const hand=this.firstPersonState?.hands?.r;
    if(this.flags.dirtAt!=null&&!this.flags.dirtOut&&r.time>=this.flags.dirtAt+1.6&&hand?.palm){
      this.flags.dirtOut=true;r.vfx?.Impact?.(new THREE.Vector3(...hand.palm),new THREE.Vector3(.3,-1,0).normalize(),"dirt");
    }
    // 「他翻了个身，接着睡」 after .12; then the rounds poured (BunkerLedger .01 waits for `pour`).
    const line12=this.LineEndAt("BunkerBanter.12");
    if(line12!=null&&r.time>=line12+B.heRollAfterS)this.Emit("heRoll");
    if(this.Fired("heRoll")){
      this.Talk("BunkerLedger");
      // ComradePourRoundsLaugh from his nibbling loop's next start no earlier than heRollToPourS - its `pour` after it (pour at `pour`).
      if(OpeningClipMeta("ComradePourRoundsLaugh"))this.flags.pourGo??=this.ClockPhaseAt("comrade",0,r.time+Math.max(0,B.heRollToPourS-EventAt("ComradePourRoundsLaugh","pour",1.25)));
      else if(this.Since("heRoll")>=B.heRollToPourS&&this.Emit("pour"))this.ComradeGesture("BanterPatRifle",2);
    }
    // 「冬瓜笑出声，扯到了肩膀」 after Ledger .06 (.07 is his 「嘶——」): the clip's `laugh` laughAfterS after it.
    const ledger6=this.LineEndAt("BunkerLedger.06");
    if(ledger6!=null&&OpeningClipMeta("ComradePourRoundsLaugh"))this.flags.laughGo??=ledger6+B.laughAfterS-(EventAt("ComradePourRoundsLaugh","laugh",2.667)-EventAt("ComradePourRoundsLaugh","settled",2.417));
    else if(ledger6!=null&&r.time>=ledger6+B.laughAfterS&&this.Emit("comradeLaugh"))this.ComradeGesture("BanterLaugh",1.6);
    const ledger=this.talks?.BunkerLedger;
    if(ledger?.done&&r.time>=ledger.doneAt+B.banterEndAfterS
      ||age>B.liuTossS+this.TalkLength("BunkerBanter")+this.TalkLength("BunkerLedger")+B.heRollToPourS+C.timeouts.banterExtraS+6)this.Stage("Orders");
  }
  /** The men going out after the order: [via..., exit route] per banter.exitOrder. */
  ExitRoute(id){
    const b=C.banter,spec=b.exitOrder.find(e=>e.id===id);
    return [...(spec?.via||[]),...(id==="runner"?b.runnerExitRoute:b.exitRoute)];
  }
  /** Everyone but the comrade goes out of the mouth after the order (exitOrder delays); returns nothing. */
  ExitSquad(since=Infinity){
    const b=C.banter;
    for(const spec of b.exitOrder){
      const actor=spec.id==="runner"?this.cast.runner:this.Squad({he:"heyoutian",liu:"liuwencai"}[spec.id]||spec.id);
      if(!actor||actor.openingStoryboardHidden)continue;
      if(since<spec.delayS)continue;
      if(spec.id==="liu"&&this.LiuStaying())continue;
      // He sat up on a root-motion clip (HeHelmetSleepSitUp): re-rooted under his pelvis before he runs.
      if(spec.id==="he"&&!this.flags.heRerooted&&OpeningClipMeta("HeHelmetSleepSitUp")){this.flags.heRerooted=true;this.RerootUnderPelvis(actor,Face(actor.openingStoryboardLast||actor.position,this.ExitRoute("he")[0]));}
      if(this.Follow(actor,"exit",this.ExitRoute(spec.id),C.speed[spec.speed],null))this.Hide(actor);
    }
  }
  /** Orders until Luo's order (the runner's far call, his report; 09-29, unchanged), then (contract §1 / source): the squad
   *  goes out, the comrade gets up and reaches out (exitReach), Shunzi throws him the two clips (firstPerson.toss,
   *  clipsThrown), then gears up (flags.exitAt: Data_OpeningFirstPersonGear) while the comrade squeezes out to the mouth. */
  PhaseOrders(age){
    const r=this.r,b=C.banter,E=C.exit,luo=this.Squad("luo"),yaowa=this.Squad("yaowa"),he=this.Squad("heyoutian"),liu=this.Squad("liuwencai");
    const comrade=this.Comrade,runner=this.cast.runner;
    if(!this.phaseEntered){this.phaseEntered=true;this.flags.exitAt=null;this.flags.orderAt=null;this.Show(runner);}
    for(const role of ["ijaA","ijaB","ijaC","ijaD","gunner","loader"])this.Hide(this.Ija(role));
    this.DepthWalkers();
    const post=b.runnerRoute.at(-1),seat=C.shunzi.seat,call=b.runnerCall;
    // 2026-09-29: the runner calls from afar on the run (BunkerRunnerCall); 2026-10-11: at his first call the comrade opens his
    // eyes and He throws off his helmet and sits up (sitUp), Luo looks round.
    if(this.flags.orderAt==null&&!this.Started("BunkerRunnerCall")&&age>=call.afterS){
      const handle=r.voice?.PlayScene("BunkerRunnerCall",{speakers:this.Speakers(),gate:(lineId)=>lineId!=="BunkerRunnerCall.02"||this.RunnerWithin(call.secondWithinM),
        onLine:(lineId)=>{if(lineId==="BunkerRunnerCall.01"){this.NoteRunnerCall({line:lineId});this.RunnerHeard();}else this.flags.walkersAt??=r.time;}});
      this.Scene("BunkerRunnerCall",handle);
      if(!handle){this.NoteRunnerCall({line:null});this.RunnerHeard();}
    }
    const runnerIn=this.flags.orderAt==null&&this.Follow(runner,"orders",b.runnerRoute,C.speed.run,null,b.luo);
    if(this.flags.orderAt==null){
      if(runnerIn||Distance(runner.position,post)<.4)this.Hold(runner,{...post,yaw:Face(post,b.luo)},"MessengerReport");
      if(runnerIn){this.flags.runnerInAt??=r.time;this.flags.walkersAt??=r.time;}
      const callDone=this.Started("BunkerRunnerCall")&&this.SceneDone("BunkerRunnerCall");
      const arrived=runnerIn&&(callDone||r.time-this.flags.runnerInAt>=call.holdMaxS);
      if(!this.Started("BunkerOrders")&&(arrived||age>C.timeouts.runnerArriveS)){
        this.flags.runnerInAt??=r.time;this.flags.walkersAt??=r.time;
        this.scenes.BunkerRunnerCall?.Stop();
        this.Scene("BunkerOrders",r.voice?.PlayScene("BunkerOrders",{speakers:this.Speakers(),onLine:(lineId)=>{if(lineId==="BunkerOrders.05")this.flags.luoOrderAt=r.time;}}));
      }
      // Standing in the mouth looking out while he thinks it over; round to the room and pointing with the order.
      if(this.flags.luoOrderAt==null)this.LuoAtMouth();
      else this.Hold(luo,{...b.luo,yaw:Face(b.luo,seat)},"PointBlockade",{upperBody:true});
      Equip(yaowa,"HanYang");this.YaowaBread();
      this.HeAsleep();this.LiuAmmo();this.ComradeSeated();
      this.Hold(this.cast.shouter,{...b.shouter,yaw:-Math.PI/2},null);
      if(this.Started("BunkerOrders")&&this.SceneDone("BunkerOrders"))this.flags.orderAt=r.time;
      if(age>C.timeouts.runnerArriveS+this.SceneLength("BunkerOrders")+C.timeouts.ordersSlackS)this.flags.orderAt??=r.time;
      if(this.flags.orderAt!=null)this.Talk("BunkerExit");
      return;
    }
    const since=r.time-this.flags.orderAt;
    // 「刘文财啪地扣上弹药箱，扛起来就走」: LiuBoxUpGo from his counting loop's next start after the order.
    if(OpeningClipMeta("LiuBoxUpGo"))this.flags.liuBoxGo??=this.ClockPhaseAt("liu",0,r.time);
    this.GearCues();
    // 「刘文财啪地扣上弹药箱，扛起来就走；何有田抓起钢盔扣在头上，第一个钻出洞口；班长、传令兵、幺娃跟着撤出」
    this.ExitSquad(since);
    for(const spec of b.exitOrder){
      const actor=spec.id==="runner"?runner:this.Squad({he:"heyoutian",liu:"liuwencai"}[spec.id]||spec.id);
      if(spec.id==="liu"&&actor&&this.LiuStaying())this.LiuAmmo();
      else if(actor&&since<spec.delayS){
        if(spec.id==="liu")this.LiuAmmo();
        else if(spec.id==="yaowa")this.YaowaBread();
        else if(spec.id==="runner")this.Hold(runner,{...post,yaw:Face(post,b.luo)},"MessengerReport");
        else this.Pose(actor,null);
      }
    }
    Equip(yaowa,yaowa?.weaponId||"HanYang");
    // The comrade: up against the wall (WoundedRiseWall), reaching (exitReach), the clips (toss) -- 2026-10-11 integration: caught
    // and dropped and picked up by ComradeCatchDropPick (AnimA; its frame 0 = WoundedRiseWall's last, the same root), its `thrown` on
    // the first person's release -- then out of the mouth.
    const rise=since-E.riseAfterS,riseS=ClipLength("WoundedRiseWall",2.8),catchClip=OpeningClipMeta("ComradeCatchDropPick")?"ComradeCatchDropPick":null;
    if(rise<0)this.ComradeSeated();
    else if(this.flags.comradeWalkAt==null&&catchClip&&this.flags.catchFrom!=null&&r.time>=this.flags.catchFrom)
      this.Hold(comrade,b.comradeSeat,catchClip,{seconds:Math.min(r.time-this.flags.catchFrom,ClipLength(catchClip,4))});
    else if(this.flags.comradeWalkAt==null)this.Pose(comrade,"WoundedRiseWall",{seconds:Math.min(rise,riseS)});
    if(rise>=riseS)this.Emit("exitReach");
    // The toss: tossAfterLineS after 「我那两夹！」 (or forced exitTossS after the order).
    const line1=this.LineEndAt("BunkerExit.01");
    if(this.flags.tossAt==null&&(line1!=null&&r.time>=line1+E.tossAfterLineS||since>C.timeouts.exitTossS)){this.Emit("exitReach");this.StartToss();}
    if(this.flags.tossAt!=null&&this.flags.clipsThrownAt==null&&r.time>=this.flags.tossAt+C.firstPerson.toss.releaseS)this.ThrowClips();
    if(this.flags.clipsThrownAt!=null&&this.flags.exitAt==null&&r.time>=this.flags.clipsThrownAt+E.gearAfterThrowS){this.flags.exitAt=r.time;this.HideFlyer("liuClip");}
    // Out of the mouth timed to be outside as Shunzi gets there (GearArrivalS of the gear-up).
    if(this.flags.exitAt!=null&&this.flags.comradeWalkAt==null){
      const walkS=Distance(b.comradeSeat,b.comradeBlast)/E.walkMps,line3=this.LineAt("BunkerExit.03");
      const due=Math.max(this.flags.clipsThrownAt+E.pickS,this.flags.exitAt+GearArrivalS(this.GearContext())-walkS,
        this.flags.catchFrom!=null?this.flags.catchFrom+ClipLength("ComradeCatchDropPick",4):-Infinity);
      if(r.time>=due&&(line3!=null||r.time>=due+1.5)){
        this.flags.comradeWalkAt=r.time;this.HideFlyer("clipB");this.HideFlyer("clipA");
        this.RerootUnderPelvis(comrade,this.flags.catchFrom!=null?Face(comrade.openingStoryboardLast||comrade.position,b.comradeBlast)
          :this.ChainRoot(b.comradeSeat,"TengxianNra02","WoundedRiseWall","MessengerReport").yaw);
      }
    }
    if(this.flags.comradeWalkAt!=null&&(this.Hold(comrade,b.comradeBlast,null,{speed:E.walkMps})||r.time-this.flags.exitAt>C.timeouts.ordersExitS))this.Stage("Incoming");
  }
  /** The far call is heard: the comrade opens his eyes, He sits up (sitUp), Luo looks round. */
  RunnerHeard(){this.Emit("sitUp");this.flags.luoTurnAt??=this.r.time+.2;}
  /** Liu is still at the box (LiuBoxUpGo not played out yet; with the clip baked). */
  LiuStaying(){return !!OpeningClipMeta("LiuBoxUpGo")&&this.flags.liuBoxDoneAt==null&&this.Squad("liuwencai")?.alive!==false;}
  /** Both hands come up off the charger with a clip each (firstPerson.toss on flags.tossAt). */
  StartToss(){
    const r=this.r;this.flags.tossAt=r.time;
    const T=C.firstPerson.toss;
    for(const [key,side] of [["clipA","l"],["clipB","r"]])
      this.Fly(key,"clip",()=>this.PalmPoint(side),()=>this.PalmPoint(side),{start:r.time+60,seconds:.4});
    this.flags.tossEndAt=r.time+T.endS;
    // ComradeCatchDropPick's `thrown` lands on the release (firstPerson.toss.releaseS).
    if(OpeningClipMeta("ComradeCatchDropPick"))this.flags.catchFrom=r.time+T.releaseS-EventAt("ComradeCatchDropPick","thrown",.583);
  }
  /** 「冬瓜单手接住一夹，另一夹掉在地上」: one clip to his right hand, the other short of it, at his feet. */
  ThrowClips(){
    const r=this.r,E=C.exit,comrade=this.Comrade;
    this.flags.clipsThrownAt=r.time;this.Emit("clipsThrown");
    r.audio?.Play?.("clothMove",{position:r.player.camera.position.clone(),volume:.5});
    const clip=OpeningClipMeta("ComradeCatchDropPick")?"ComradeCatchDropPick":null;
    if(clip){
      // From the palms to where the comrade's clip has them at its catch / at the clip landing on the floor; his clip's own
      // clipA / clipB (thrown from 1.6 m in front of him) are hidden until then.
      const thrown=EventAt(clip,"thrown",.583),seat=C.banter.comradeSeat;
      const toA=this.ClipPropWorld(comrade,clip,"clipA",EventAt(clip,"catch",1.083),seat),toB=this.ClipPropWorld(comrade,clip,"clipB",EventAt(clip,"clipLands",1.292),seat);
      const sA=EventAt(clip,"catch",1.083)-thrown,sB=EventAt(clip,"clipLands",1.292)-thrown;
      const a=this.Fly("clipA","clip",this.PalmPoint("l"),toA?.position||this.HandPoint(comrade,"R"),{seconds:sA,arcM:.3,then:"hide"});a.fromAt=this.PalmPoint("l");
      const b=this.Fly("clipB","clip",this.PalmPoint("r"),toB?.position||r.Point(seat,.02),{seconds:sB,arcM:.35,then:"hide"});b.fromAt=this.PalmPoint("r");
      this.HideClipProp(comrade,"clipA",r.time+sA);this.HideClipProp(comrade,"clipB",r.time+sB);
      return;
    }
    const catchAt=()=>this.HandPoint(comrade,"R"),floorAt=(()=>{const c=comrade.openingStoryboardLast||comrade.position,o=Rot(Face(c,C.shunzi.seat),...E.dropAt);return r.Point({x:c.x+o.x,z:c.z+o.z},.02);})();
    const a=this.Fly("clipA","clip",this.PalmPoint("l"),catchAt,{seconds:E.catchS,arcM:.3});a.fromAt=this.PalmPoint("l");
    const b=this.Fly("clipB","clip",this.PalmPoint("r"),floorAt,{seconds:E.catchS+.1,arcM:.35});b.fromAt=this.PalmPoint("r");
  }
  /** Seconds into the toss (null outside it), for the first person's overlay (Script_OpeningFirstPerson.UpdateFill). */
  TossAge(){const at=this.flags.tossAt;return at==null||this.phase!=="Orders"||this.r.time-at>C.firstPerson.toss.endS?null:this.r.time-at;}
  PhaseIncoming(age){
    const r=this.r,b=C.banter;
    if(!this.phaseEntered){
      this.phaseEntered=true;
      // Straight into Incoming (a stage jump): the gear-up is done, he is at the mouth with the pack on and the rifle at the ready;
      // the runner has come and gone.
      this.flags.exitAt??=r.time-GearData().doneS;this.flags.orderAt??=this.flags.exitAt;
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
  /** SB01's men going up to the front (Data_FirstLevelBackdropSquads.OPENING_DEPTH_WALKERS): standing in the
   *  trench facing east during the talk, walking off east from Orders + delayS, retired at the end of the route
   *  once out of the shot (at the latest in the black after the blast). */
  DepthWalkers(){
    // 2026-09-29: Orders now opens with the runner still 23 m out (banter.runnerCall), so they are clocked on his second call
    // (flags.walkersAt: line 2 opening, or his arrival if that comes first), not on Orders' start: they set off delayS after it
    // and are 3 s under way when he reports, as before (the old runner took 4.4 s to arrive, they left 1.4 s in).
    const D=OPENING_DEPTH_WALKERS,setOff=this.flags.walkersAt,
      go=["Count","Banter"].includes(this.phase)?-1:this.phase==="Orders"?(setOff==null?-1:this.r.time-setOff-D.delayS):Infinity;
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
  /** Seconds since the gear-up began (flags.exitAt: the clips thrown), the clock of Data_OpeningFirstPersonGear; null before it. */
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
  /** 「弹装起！往后沟撤！跟紧！」: from the gear-up on he hurries to the mouth (seat -> pack -> followTo). */
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
  /** Sitting in the dugout (Count, Banter, Orders until the gear-up): the player looks round freely. */
  Seated(){return this.phase==="Count"||this.phase==="Banter"||this.phase==="Orders"&&this.flags.exitAt==null;}
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
    // Unseen in the black: the bodies in the front trench and on the south rim, the man who shams dead among them; the comrade's
    // rifle on the spoil (the Set's, where ijaB's clip picks it up).
    this.StandInBodies();this.SpawnVictim();this.HoldBodies();this.LayComradeRifle();
    for(const key of ["liuClip","clipA","clipB","bread"])this.HideFlyer(key);
    if(age>=C.timeouts.blackS)this.Stage("Wake");
  }
  PhaseWake(age){
    const r=this.r,D=C.dropIn;
    if(!this.phaseEntered){this.phaseEntered=true;this.StandInBodies();this.SpawnVictim();}
    this.LayComradeRifle();
    this.ComradeDazed();this.HoldBodies();
    // 「炮声在往后走：落点一排一排越过头顶，跳到后沟那边去了」: one goes over toward the rear trench just before the whistle.
    if(age>=C.timeouts.wakeS-D.overShell.beforeEndS&&this.flags.overShellAt==null){
      this.flags.overShellAt=r.time;const O=D.overShell;
      r.combat?.FireShell(r.Point(O.from,30),r.Point(O.to),{flight:O.flightS,damage:0,radius:4,incoming:true,feedbackOnly:true});
    }
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
    if(age>=C.timeouts.wakeS)this.Stage("DropIn");
  }
  /** Where each of the three drops from and lands (dropIn, marks.dropInLip in the order ijaC, ijaD, ijaA). */
  DropMarks(role){
    const i={ijaC:0,ijaD:1,ijaA:2}[role],lip=C.marks.dropInLip[i],to=C.marks.dropInLand[i];
    const rim={x:lip.x,z:lip.z},land={x:to.x,z:to.z};
    return {rim:{...rim,yaw:Face(rim,land)},land:{...land,yaw:Face(rim,land)}};
  }
  /**
   * One of the three dropping in (2026-10-11 integration: AnimA's IjaDropInKneel / IjaDropInStand / IjaDropInPoint, rooted on the
   * floor where he lands and facing the way he jumps: frame 0 has him standing on the rim behind it; held there from rimS with the
   * bayonet up, played from jumpS[role]), then his beat: ijaC runs to the fold, knocks the grenade, throws it round the corner,
   * looks after the blast and reports (grenadeBlast); ijaD to the junction; ijaA points at F, then at J (the clip's point1 /
   * point2), and takes his mark between them.
   */
  DropMan(role,age){
    const r=this.r,D=C.dropIn,actor=this.Ija(role);if(!actor?.alive)return;
    const {land}=this.DropMarks(role),jump=D.jumpS[role],clip=D.clips[role];
    if(age<D.rimS){this.Hide(actor);return;}
    if(actor.openingStoryboardHidden){this.Show(actor);this.Put(actor,land);}
    const t=Math.max(0,age-jump),length=ClipLength(clip,2.5);
    if(this.flags["landed:"+role]==null){
      this.Put(actor,land);this.Pose(actor,clip,{seconds:t,face:land.yaw});
      if(t>=EventAt(clip,"land",.917)){this.flags["landed:"+role]=r.time;this.Sfx("stompMud",{position:r.Point(land,.2),volume:.75});}
      return;
    }
    if(t<length){this.Put(actor,land);this.Pose(actor,clip,{seconds:t,face:land.yaw});return;}
    if(!this.flags["off:"+role]){this.flags["off:"+role]=r.time;this.RerootUnderPelvis(actor,actor.yaw);}
    const since=r.time-this.flags["off:"+role];
    if(role==="ijaC")this.FoldMan(actor,since);
    else if(role==="ijaD"){
      const post=D.junctionPost,there=actor.openingWalk?.key==="toJ"&&actor.openingWalk.done;
      if(!there){if(this.Follow(actor,"toJ",[post],C.speed.run,null,post.yaw))actor.openingWalk.done=true;return;}
      this.Hold(actor,post,"IjaBayonetGuard",{seconds:r.time});
    }else this.Hold(actor,D.ijaAPost,null,{speed:C.speed.walk});
  }
  /** ijaC at the fold: IjaGrenadeKnockThrow (AnimA; the Set's grenade on its track) -- the knock on the helmet, held a beat, thrown
   *  round the corner; the blast beyond it (the Set's FoldBlast at dropIn.foldBlast), the look after it and 「折角，清了！」 (grenadeBlast). */
  FoldMan(actor,since){
    const r=this.r,D=C.dropIn,F=D.foldPost,f=this.flags,clip="IjaGrenadeKnockThrow";
    if(f.cAtFoldAt==null){if(this.Follow(actor,"toFold",[F],C.speed.run,null,F.yaw))f.cAtFoldAt=r.time;return;}
    const t=r.time-f.cAtFoldAt-D.knockAfterArriveS,length=ClipLength(clip,3);
    if(t<0){this.Hold(actor,F,"IjaReadyRifle",{seconds:ClipLength("IjaReadyRifle",1.1)});return;}
    if(t>=EventAt(clip,"knock",1.0)&&f.knockAt==null){f.knockAt=r.time;this.Sfx("grenadeKnock",{position:this.HeadPoint(actor)||r.Point(F,1.6),volume:.9});}
    if(t>=EventAt(clip,"throw",2.083)&&f.throwAt==null){f.throwAt=r.time;r.audio?.Play?.("grenadeThrow",{position:r.Point(F,1.5),volume:.8});}
    if(f.throwAt!=null&&f.foldBlastAt==null&&r.time-f.throwAt>=D.blastAfterThrowS){
      f.foldBlastAt=r.time;
      const at=r.openingSet?.FoldBlast?.()||r.Point(C.marks.foldBlast,.3);
      if(!r.openingSet?.FoldBlast)r.vfx?.Explosion?.(new THREE.Vector3(at.x,at.y,at.z),{radius:3.5,kind:"grenade"});
      r.audio?.Play?.("explosionMid",{position:new THREE.Vector3(at.x,at.y,at.z),volume:1});
    }
    if(t<length){this.Hold(actor,F,clip,{seconds:t});return;}
    const peek=f.foldBlastAt!=null?r.time-f.foldBlastAt-.2:-1;
    if(peek>=0&&peek<D.peekS){this.Hold(actor,F,"IjaJunctionPeek",{seconds:peek});return;}
    if(peek>=D.peekS)this.Emit("grenadeBlast");
    this.Hold(actor,F,"IjaReadyRifle",{seconds:ClipLength("IjaReadyRifle",1.1)});
  }
  /** After the drop-in the three hold their posts: ijaC at the fold, ijaD at the junction, ijaA at his mark (unless `skip`). */
  HoldVanguard(skip=[]){
    const D=C.dropIn,r=this.r;
    const c=this.Ija("ijaC");if(c?.alive&&!skip.includes("ijaC")){if(c.openingStoryboardHidden){this.Show(c);this.Put(c,D.foldPost);}this.Hold(c,D.foldPost,"IjaReadyRifle",{seconds:1.1});}
    const d=this.Ija("ijaD");if(d?.alive&&!skip.includes("ijaD")){if(d.openingStoryboardHidden){this.Show(d);this.Put(d,D.junctionPost);}this.Hold(d,D.junctionPost,"IjaBayonetGuard",{seconds:r.time});}
    const a=this.Ija("ijaA");if(a?.alive&&!skip.includes("ijaA")){if(a.openingStoryboardHidden){this.Show(a);this.Put(a,D.ijaAPost);}this.Hold(a,D.ijaAPost,null);}
  }
  /** 02's Questioning (and Background) call this: in the redraft the corner man and the junction man hold the posts the drop-in
   *  gave them (no walk-in down the link sap any more). Kept under the 09-23 name for the 02 code. */
  VanguardFront(){}
  /** IjaCornerFire's authored shot (event t 0.1 each loop): a real report and tracer at an authorised point. */
  CornerFire(actor){
    const age=this.ClipAge(actor,"IjaCornerFire");if(age<0)return;
    const loop=Math.floor((age-.1)/2.6);
    if(loop<0||actor.openingShotLoop===loop)return;
    actor.openingShotLoop=loop;
    const targets=[A.rearCorner,{x:-26.5,z:-124.2}];
    this.FireRifle(actor,this.r.Point(targets[loop%targets.length],.6),true);
  }
  /** 「炮声刚越过去，前沟沟沿上响了一声短哨」: the whistle, the three off the north rim, the grenade round the fold; ijaB down
   *  the link sap to J; BunkerSweep (its .01 waits for grenadeBlast). */
  PhaseDropIn(age){
    const r=this.r,D=C.dropIn;
    if(!this.phaseEntered){
      this.phaseEntered=true;this.flags.dropInAt=r.time;this.flags.vanguardAt??=r.time;
      for(const role of ["ijaC","ijaD"]){const a=this.Ija(role);if(a)SetRelaxedGait(a,null);}
      // ijaA's hands are free to point (rifle slung); ijaB comes in at the alert trot, rifle at the ready.
      SetRelaxedGait(this.Ija("ijaA"),"slung");SetRelaxedGait(this.Ija("ijaB"),"alert");
      this.Talk("BunkerSweep");
    }
    this.ComradeDazed();this.HoldBodies();
    if(age>=D.whistleS&&this.flags.whistleAt==null){this.flags.whistleAt=r.time;this.Sfx("whistleShort",{position:r.Point(C.marks.dropInLip[2],2.2),volume:1});}
    for(const role of ["ijaC","ijaD","ijaA"])this.DropMan(role,age);
    const ijaB=this.Ija("ijaB");
    if(age<D.bS)this.Hide(ijaB);
    else{if(ijaB?.openingStoryboardHidden){this.Show(ijaB);this.Put(ijaB,{...D.bRoute[0],yaw:Face(D.bRoute[0],D.bRoute[1])});}
      this.Follow(ijaB,"bIn",D.bRoute,C.speed.trot,null,-Math.PI/2);}
    if(this.Fired("grenadeBlast")&&(this.LineAt("BunkerSweep.01")!=null||this.Since("grenadeBlast")>2)||age>C.timeouts.dropInS){
      this.Emit("grenadeBlast");this.Stage("Sweep");
    }
  }
  /**
   * A man walking a line of bodies stabbing each (ijaB's sweep, ijaA's finish): toward the stab spot standOffM short of the body,
   * the downward thrust (IjaBayonetDownThrust over the native walk, upper body) started so its contact lands there, the walk going
   * on at stabMps through it. `walker` keeps {i, stabAt}; `onStab(i)` at each contact. Returns true when every body is done and he
   * stands on `end`.
   */
  StabWalk(actor,walker,bodies,end,S,onStab,{last=null}={}){
    const r=this.r;if(!actor?.alive)return true;
    const contact=S.stabContactS??C.sweep.stabContactS,thrust=S.thrustS??C.sweep.thrustS;
    if(walker.i>=bodies.length){return this.Hold(actor,end,null,{speed:S.walkMps});}
    const body=bodies[walker.i],from=actor.openingStoryboardLast||actor.position;
    const dir={x:from.x-body.x,z:from.z-body.z},len=Math.hypot(dir.x,dir.z)||1;
    const spot=walker.spot??=({x:body.x+dir.x/len*S.standOffM,z:body.z+dir.z/len*S.standOffM});
    const stopHere=last!=null&&walker.i===last;
    if(walker.stabAt==null){
      const d=Distance(from,spot);
      if(d<=S.walkMps*contact||d<.05){walker.stabAt=r.time;walker.contactDone=false;if(walker.due?.[walker.i])this.flags[walker.due[walker.i]]=r.time+contact;}
      else{this.Move(actor,spot,Face(from,body),null,S.walkMps);return false;}
    }
    const t=r.time-walker.stabAt;
    this.Move(actor,stopHere?spot:{x:body.x,z:body.z},Face(from,body),"IjaBayonetDownThrust",stopHere||Distance(from,body)<.25?0:S.stabMps,{seconds:t,upperBody:true});
    if(!walker.contactDone&&t>=contact){walker.contactDone=true;onStab(walker.i);}
    if(t>=thrust&&!stopHere){walker.i++;walker.stabAt=null;walker.spot=null;}
    return false;
  }
  /** The backs ijaB's bayonet goes into: the Set's two static bodies (sweep.bodies[0..1], their highest point) and the man shamming
   *  dead (his chest bone; the mark before he is posed). */
  SweepTargets(){
    const set=this.r.openingSet,M=C.marks.sweepBodies,victim=this.cast.SweepVictim;
    const back=i=>{const top=set?.CorpseInfo?.(`sweep.bodies[${i}]`)?.top;return top?{x:top.x,z:top.z}:{x:M[i].x,z:M[i].z};};
    const chest=victim?.actor?.characterRig?.bones?.chest?.getWorldPosition(new THREE.Vector3());
    return [back(0),back(1),chest&&victim.openingStoryboardPose?{x:chest.x,z:chest.z}:{x:M[2].x,z:M[2].z}];
  }
  /** IjaWalkStabProne's root for one body: the clip's stab lands sweep.stabAtM (from the root, runtime m) ahead, walking west. */
  SweepStabRoot(target){
    const S=C.sweep,yaw=S.yawDeg*DEG,o=Rot(yaw,...S.stabAtM);
    return {x:target.x-o.x,z:target.z-o.z,yaw};
  }
  /**
   * 「日兵乙端着上了刺刀的枪，沿沟底往洞口这边走。每经过一具趴着的国军，就往背上扎一刀」: stab7, stab8 on the two dead, then the third
   * (SweepVictim) cries out and claws, is stamped on, stabbed again and twisted (stab9); ijaB stops 5 m off.
   * 2026-10-11 integration (AnimA): each stab is one IjaWalkStabProne cycle on a root put so its point lands in the back (the walk
   * to the next one native); the third one's starts CorpseStabbedClaw (its first stab at 0.083 s), and 0.667 s into the claw ijaB
   * steps onto the sweepStomp stage at the man's right thigh for IjaStompStabTwist (stomp, the second stab, the twist: stab9). The
   * man dies at the clip's `still` and lies on its last frame.
   */
  PhaseSweep(age){
    const r=this.r,S=C.sweep,ijaB=this.Ija("ijaB"),victim=this.cast.SweepVictim,f=this.flags,walk="IjaWalkStabProne",stomp="IjaStompStabTwist",claw="CorpseStabbedClaw";
    if(!this.phaseEntered){this.phaseEntered=true;this.sweepWalker={i:0,from:null};f.sweepAt=r.time;SetRelaxedGait(ijaB,"alert");}
    this.ComradeDazed();this.HoldBodies();this.HoldVanguard();
    const w=this.sweepWalker,targets=this.SweepTargets(),victimRoot=C.marks.sweepBodies[2];
    // The victim: lying still on the claw's first frame until the walking stab, then the claw clip (dead at `still`).
    if(victim){
      const vt=f.victimClawFrom!=null?r.time-f.victimClawFrom:0;
      if(victim.alive){this.Put(victim,victimRoot);this.Pose(victim,claw,{seconds:Math.max(0,vt),face:victimRoot.yaw});}
      if(f.victimClawFrom!=null&&vt>=EventAt(claw,"cry",.167)&&f.victimCryAt==null){f.victimCryAt=r.time;r.audio?.Play?.("painMoan",{position:r.Point(victimRoot,.4),volume:1});}
      if(f.victimClawFrom!=null&&vt>=EventAt(claw,"still",3.25)&&victim.alive){victim.scriptEssential=false;this.Kill(victim,"melee");f.victimDead=true;}
      if(!victim.alive)this.Corpse(victim,claw);
    }
    if(w.i<3&&!(w.i===2&&f.stompFrom!=null)){
      const root=this.SweepStabRoot(targets[w.i]);
      if(w.from==null){
        // Walking to the next cycle's start (a little short of the root: the cycle's first frame is a stride already under way).
        if(this.Hold(ijaB,root,null,{speed:S.walkMps})||r.time-(w.walkAt??=r.time)>S.walkMaxS){w.from=r.time;w.walkAt=null;this.Put(ijaB,root,{keep:true});this.PlayClip(ijaB,walk,{restart:true});}
      }else{
        const t=r.time-w.from,cycle=ClipLength(walk,1.667),stab=EventAt(walk,"stab",.708);
        this.Put(ijaB,root);this.Pose(ijaB,walk,{seconds:Math.min(t,cycle)});
        if(t>=stab&&w.stabbed!==w.i){
          w.stabbed=w.i;this.Sfx("bayonetStabBody",{position:r.Point(targets[w.i],.3),volume:.9});
          if(w.i<2)this.Emit("stab"+(7+w.i));
          else f.victimClawFrom=r.time-EventAt(claw,"stab",.083);
        }
        if(w.i===2&&f.victimClawFrom!=null&&r.time-f.victimClawFrom>=S.stompOffsetS){f.stompFrom=r.time;this.Put(ijaB,this.StageRoot("sweepStomp","ijaB",victimRoot),{keep:true});this.PlayClip(ijaB,stomp,{restart:true});}
        else if(t>=cycle&&w.i<2){w.i++;w.from=null;this.RerootUnderPelvis(ijaB,ijaB.yaw);}
      }
    }else if(f.stompFrom!=null&&f.stompDone==null){
      const t=r.time-f.stompFrom,length=ClipLength(stomp,2.583);
      this.Put(ijaB,this.StageRoot("sweepStomp","ijaB",victimRoot));this.Pose(ijaB,stomp,{seconds:Math.min(t,length)});
      if(t>=EventAt(stomp,"stomp",.833)&&f.stompAt==null){f.stompAt=r.time;this.Sfx("stompMud",{position:r.Point(victimRoot,.2),volume:.9});}
      if(t>=ContactAt(stomp,"stab",1.167)&&f.secondStabAt==null){f.secondStabAt=r.time;this.Sfx("bayonetStabBody",{position:r.Point(victimRoot,.35),volume:1});}
      if(t>=EventAt(stomp,"twist",1.417)&&!this.Fired("stab9")){this.Sfx("bayonetTwist",{position:r.Point(victimRoot,.35),volume:.9});this.Emit("stab9");}
      if(t>=length){f.stompDone=r.time;this.RerootUnderPelvis(ijaB,ijaB.yaw);}
    }else{
      // On past the dead man along the north side to his stop, 5 m from the eye.
      const stop={x:S.stopX,z:-124.95,yaw:Math.PI/2};
      if(f.sweepStopAt!=null||this.Follow(ijaB,"stop",[{x:victimRoot.x,z:victimRoot.z-.6},stop],S.walkMps,null,stop.yaw)){f.sweepStopAt??=r.time;this.Hold(ijaB,stop,null);}
    }
    const said=this.LineEndAt("BunkerSweep.07")!=null;
    if(f.sweepStopAt!=null&&said||age>C.timeouts.sweepS){
      if(victim?.alive){victim.scriptEssential=false;this.Kill(victim,"melee");f.victimDead=true;}
      this.Emit("stab7");this.Emit("stab8");this.Emit("stab9");this.Stage("CaptiveDragged");
    }
  }
  /** Where ijaA / ijaB stand when the drag starts (manifest stage captiveDrag, comrade anchor). */
  DragMarks(){
    const root=C.banter.comradeBlast;
    return {ijaA:this.StageRoot("captiveDrag","ijaA",root),ijaB:this.StageRoot("captiveDrag","ijaB",root)};
  }
  /** 「翻译！翻译呢！快给我滚过来！」 (InterpreterCall, unchanged): started once; the interpreter sets off on his answer
   *  (.02, or when it would have started). True once the call has ended (or timed out, or there is no one to call). */
  InterpreterCall(){
    const r=this.r;
    if(!this.Started("InterpreterCall")){
      if(!this.cast.interpreter)return true;
      this.flags.callAt=r.time;
      this.Scene("InterpreterCall",r.voice?.PlayScene("InterpreterCall",{speakers:this.Speakers(),
        onLine:(lineId)=>{if(lineId==="InterpreterCall.02")this.flags.interpGo??=r.time;}}));
    }
    if(this.flags.interpGo==null&&r.time-this.flags.callAt>=this.LineStart("InterpreterCall","InterpreterCall.02"))this.flags.interpGo=r.time;
    if(this.flags.interpGo!=null)this.InterpreterIn();
    return this.SceneDone("InterpreterCall")||r.time-this.flags.callAt>C.timeouts.interpreterCallS;
  }
  /** The interpreter trots in from the link sap to his questioning mark. */
  InterpreterIn(m=this.InterrogationMarks()){
    const interp=this.cast.interpreter;if(!interp)return true;
    if(this.flags.interpIn){this.Hold(interp,m.interpreter,"InterpreterCrouchAsk");return true;}
    this.Show(interp);
    // Called over (InterpreterCall), he comes at a trot, arms free (relaxed gait, no rifle).
    if(this.Follow(interp,"enter",[...C.ija.interpreterEnter,m.interpreter],C.speed.trot,null,m.interpreter.yaw)){this.flags.interpIn=true;}
    return !!this.flags.interpIn;
  }
  /**
   * 「塌土里，冬瓜在咳。乙正要扎，甲抬手拦住」: ijaB from his stop to the heap, the rifle up to stab, ijaA's raised hand (haltB),
   * 「这个是活的。拖出来。」, the interpreter called, the drag out of the heap (the three 09-23 clips), the shove to the wall,
   * 「跪好。」 (kneeled), and his look straight at the eye (gazeAt, gazeS) before he looks away.
   */
  PhaseCaptiveDragged(age){
    const r=this.r,G=C.dragged,comrade=this.Comrade,ijaA=this.Ija("ijaA"),ijaB=this.Ija("ijaB"),marks=this.DragMarks(),f=this.flags,m=this.InterrogationMarks();
    if(!this.phaseEntered){this.phaseEntered=true;this.Talk("CaptiveDragged");f.draggedAt=r.time;SetRelaxedGait(ijaB,"alert");}
    this.HoldBodies();this.HoldVanguard(["ijaA"]);
    if(f.dragStart==null){
      this.ComradeDazed();
      const bThere=this.Hold(ijaB,marks.ijaB,f.bRaiseAt!=null?"IjaBayonetDownThrust":null,f.bRaiseAt!=null?{speed:G.approachMps,seconds:Math.min(.38,r.time-f.bRaiseAt)}:{speed:G.approachMps});
      if(bThere&&f.bRaiseAt==null)f.bRaiseAt=r.time;
      const aThere=this.Hold(ijaA,marks.ijaA,f.haltAt!=null?"PointBlockade":null,f.haltAt!=null?{speed:C.speed.walk,seconds:Math.min(.8,r.time-f.haltAt),upperBody:true}:{speed:C.speed.walk});
      if(f.bRaiseAt!=null&&f.haltAt==null&&(aThere||age>8)&&r.time-f.bRaiseAt>=G.raiseS*.4){f.haltAt=r.time+G.haltAfterS;}
      if(f.haltAt!=null&&r.time>=f.haltAt)this.Emit("haltB");
      if(this.LineEndAt("CaptiveDragged.01")!=null||this.Since("haltB")>3)this.InterpreterCall();
      if(f.callAt!=null&&r.time>=f.callAt+G.dragAfterCallS||age>C.timeouts.draggedS*.6){
        this.Emit("haltB");this.InterpreterCall();
        f.dragStart=r.time;SetRelaxedGait(ijaA,"slung");SetRelaxedGait(ijaB,"slung");
      }
      return;
    }
    this.InterpreterCall();
    const t=r.time-f.dragStart,dragS=ClipLength("IjaDragCollarFromDirt",4.4);
    if(t<dragS){
      this.Put(comrade,C.banter.comradeBlast);this.Pose(comrade,"CaptiveDraggedFromDirt",{seconds:t});
      this.Put(ijaA,marks.ijaA);this.Pose(ijaA,"IjaDragCollarFromDirt",{seconds:t});
      this.Put(ijaB,marks.ijaB);this.Pose(ijaB,"IjaPullArm",{seconds:t});
      if(t>=ContactAt("CaptiveDraggedFromDirt","land",2.75))this.Emit("dragLanded");
      return;
    }
    // At the wall: shoved back against it (CaptiveWallBrace / IjaShoveToWall), knelt (CaptiveKneelMud) -- 「跪好。」
    if(f.wallAt==null){f.wallAt=r.time;this.Emit("dragLanded");this.Put(comrade,m.wall);this.Put(ijaA,m.ijaA);
      this.PlayClip(comrade,"CaptiveWallBrace",{restart:true});this.PlayClip(ijaA,"IjaShoveToWall",{restart:true});SetRelaxedGait(ijaB,null);}
    const w=r.time-f.wallAt;
    if(w<G.kneelAfterWallS)this.Pose(comrade,"CaptiveWallBrace");else{this.Pose(comrade,"CaptiveKneelMud");this.Emit("kneeled");}
    if(w<1)this.Pose(ijaA,"IjaShoveToWall");else this.Hold(ijaA,m.ijaAHold,this.QuestionClip());
    this.Hold(ijaB,m.ijaB,w<1.1?"IjaReadyRifle":null,{speed:C.speed.walk,seconds:w<1.1?w:undefined});
    // 「冬瓜抬头时，正好和顺子对上一眼。他没出声，把眼睛挪开了。」
    if(this.Fired("kneeled")&&this.Since("kneeled")>=G.gazeAfterKneelS)f.gazeAt??=r.time;
    const said=this.LineEndAt("CaptiveDragged.04")!=null;
    if(said&&f.gazeAt!=null&&r.time-f.gazeAt>=G.gazeS||age>C.timeouts.draggedS)this.Stage("CaptiveWall");
  }
  /** Interrogation marks round the kneeling comrade (his wall root R3). */
  InterrogationMarks(){
    const wall=this.ComradeWallRoot(),I=C.interrogation;
    // SB03: the interpreter side-on to the comrade east of the group, ijaB behind him (world marks, contract §5).
    return {wall,ijaA:this.StageRoot("captiveWall","ijaA",wall),ijaAHold:Local(wall,...I.ijaAHold),
      interpreter:{...I.interpreterAt},ijaB:{...I.ijaBAt}};
  }
  /** The comrade's rifle where the blast left it (his dropped weapon object; contract §5.2 comradeRifle). */
  ComradeRifleObject(){return this.Comrade?.actor?.characterRig?.openingProps?.droppedObject||null;}
  /**
   * 2026-10-11 integration: the comrade's Hanyang in the mud is the Set's comradeRifle, laid where IjaInspectRifleBoltToss (AnimA)
   * picks it up -- its track's first frame with ijaB on wall.rifleRoot (the rifle on the spoil, the butt 0.28 m up) -- from the
   * black on; his own weapon thrown there by the blast is hidden then (BeforeRender). Once.
   */
  LayComradeRifle(){
    const props=this.Props,ijaB=this.Ija("ijaB");
    if(this.flags.comradeRifleLaid||!props||!ijaB||!OpeningClipMeta("IjaInspectRifleBoltToss"))return;
    const at=this.ClipPropWorld(ijaB,"IjaInspectRifleBoltToss","comradeRifle",0,C.wall.rifleRoot);if(!at)return;
    const h=props.Show("comradeRifle");h.holder=null;h.toss=null;h.attach=null;h.state="world";
    h.object.position.copy(at.position);h.object.quaternion.copy(at.quaternion);h.object.updateMatrixWorld(true);
    this.flags.comradeRifleLaid=this.r.time;
  }
  /**
   * 「乙从泥里捡起冬瓜那支汉阳造，拉开枪机看了一眼，笑了……他把枪栓抽出来甩出沟沿，枪扔回泥里。甲一把撕下冬瓜胸前的胸章」,
   * and 「甲身后又下来一个机枪组」: the machine-gun pair from J to the south rim, down behind the gun, the first burst.
   * 2026-10-11 integration: ijaB walks onto wall.rifleRoot and plays IjaInspectRifleBoltToss (AnimA: the Set's comradeRifle and
   * rifleBolt on its tracks -- boltOpen, the bolt flung out over the north rim, the rifle dropped back into the mud and left there);
   * ijaA tears the badge with IjaTearBadge (tearBadge = collarQuestion's stage; chestBadge on its track) and goes back to the hold.
   */
  PhaseCaptiveWall(age){
    const r=this.r,W=C.wall,comrade=this.Comrade,ijaA=this.Ija("ijaA"),ijaB=this.Ija("ijaB"),m=this.InterrogationMarks(),f=this.flags;
    if(!this.phaseEntered){this.phaseEntered=true;f.wallPhaseAt=r.time;this.LayComradeRifle();}
    this.HoldBodies();this.HoldVanguard(["ijaA"]);this.InterpreterIn(m);
    this.Pose(comrade,"CaptiveKneelMud");
    // ijaA at the comrade's chest; the badge torn (IjaTearBadge from tearS: tear at its `tear`).
    if(age>=W.tearS&&f.tearFrom==null)f.tearFrom=r.time;
    const tear=f.tearFrom!=null?r.time-f.tearFrom:-1,tearClip=OpeningClipMeta("IjaTearBadge")?"IjaTearBadge":null;
    if(tearClip&&tear>=0&&tear<ClipLength(tearClip,2.75))this.Hold(ijaA,m.ijaAHold,tearClip,{seconds:tear});
    else this.Hold(ijaA,m.ijaAHold,this.QuestionClip());
    if(tear>=(tearClip?EventAt(tearClip,"tear",.625):0)&&f.tearAt==null){f.tearAt=r.time;this.Sfx("clothRip",{position:this.HeadPoint(comrade)||r.Point(m.wall,1),volume:.8});}
    // ijaB and the comrade's rifle.
    const root=W.rifleRoot,clip="IjaInspectRifleBoltToss",props=this.Props;
    if(f.pickAt==null){if(this.Hold(ijaB,root,null,{speed:C.speed.walk})||age>W.pickWalkS){f.pickAt=r.time;this.Put(ijaB,root,{keep:true});
      this.LayComradeRifle();if(props&&f.comradeRifleLaid)props.Hold("comradeRifle",ijaB);}}
    else{
      const t=r.time-f.pickAt,length=ClipLength(clip,4.5);
      if(t<length){this.Put(ijaB,root);this.Pose(ijaB,clip,{seconds:t});}
      if(t>=EventAt(clip,"boltOpen",1.833)&&this.Emit("boltOpen"))this.Sfx("boltRattle",{position:this.HandPoint(ijaB,"R")||r.Point(root,1.2),volume:.9});
      if(t>=EventAt(clip,"drop",3.583)&&f.rifleDropAt==null){f.rifleDropAt=r.time;this.Sfx("rifleTossMud",{position:this.ClipPropWorld(ijaB,clip,"comradeRifle",length,root)?.position||r.Point(root,.1),volume:.8});}
      if(t>=EventAt(clip,"boltLands",4.083)&&f.boltLandAt==null){f.boltLandAt=r.time;
        this.Sfx("boltToss",{position:this.ClipPropWorld(ijaB,clip,"rifleBolt",EventAt(clip,"boltLands",4.083),root)?.position||r.Point(root,1),volume:.6});}
      if(t>=length){
        // Let go of the rifle where the clip dropped it, then back to his questioning mark.
        if(f.rifleLeftAt==null){f.rifleLeftAt=r.time;if(props?.Where("comradeRifle")?.state==="held")props.Release("comradeRifle");this.RerootUnderPelvis(ijaB,ijaB.yaw);}
        this.Hold(ijaB,m.ijaB,null,{speed:C.speed.walk});
      }
    }
    // The machine-gun pair.
    this.MachineGunCrew(age);
    const done=this.LineEndAt("CaptiveDragged.05")!=null&&f.rifleLeftAt!=null&&f.firstBurstAt!=null&&r.time-f.firstBurstAt>=W.endAfterBurstS;
    if(done||age>C.timeouts.wallS)this.Stage("Interrogation");
  }
  /** The machine-gun pair's marks on the south lip (the Set's mg.gunner / mg.loader), both facing the rear trench (mg.aimAt). */
  MgMarks(){
    const M=SET_MARKS.mg,aim=M.aimAt,at=p=>({x:p.x,z:p.z,yaw:Face(p,aim)});
    return {gunner:at(M.gunner),loader:at(M.loader)};
  }
  /** The gunner's clip clock: IjaProneLmgOnCorpse held on its first frame between bursts, played from the top for each (its
   *  `burst` at 0.417 s is the two rounds). */
  GunnerSeconds(){
    const f=this.flags,from=f.lastBurstAt!=null?f.lastBurstAt-EventAt("IjaProneLmgOnCorpse","burst",.417):null;
    const t=from==null?0:this.r.time-from;
    return t<ClipLength("IjaProneLmgOnCorpse",2)?t:0;
  }
  /**
   * The machine-gun pair (cast gunner / loader, bunkerAssault BunkerGunner / BunkerLoader): down from J at W.enterS, along the floor
   * to the south rim (the Set's mg marks), down behind the gun -- 2026-10-11 integration: the gunner prone on the corpse rest
   * (IjaProneLmgOnCorpse, AnimA: its own type11 track draws the gun), the loader kneeling at his right loading (IjaKneelLoadLmg) --
   * the first burst setupS after both are there. The two bodies they rest the gun on are the Set's (mg.corpseLower / Upper, stacked
   * on the lip by the Set from CaptiveWall on; the drag and the heave -- IjaDragByForearm / IjaHeaveCorpseLip -- are not baked).
   */
  MachineGunCrew(age){
    const r=this.r,W=C.wall,f=this.flags,marks=this.MgMarks();
    for(const [role,clip,delay] of [["gunner","IjaProneLmgOnCorpse",0],["loader","IjaKneelLoadLmg",.7]]){
      const actor=this.Ija(role),mark=marks[role];if(!actor?.alive)continue;
      if(f.mgPlacedAt==null&&age<W.enterS+delay){this.Hide(actor);continue;}
      if(actor.openingStoryboardHidden){this.Show(actor);this.Put(actor,{...W.crewFrom,yaw:Math.PI/2});SetRelaxedGait(actor,null);}
      const there=actor.openingWalk?.key==="mg"&&actor.openingWalk.done;
      if(!there){if(this.Follow(actor,"mg",[...W.crewVia,mark],C.speed.brisk,null,mark.yaw))actor.openingWalk.done=true;continue;}
      f["mgThere:"+role]??=r.time;
      if(this.flags["hit:"+role]!=null)continue;
      this.Put(actor,mark);
      this.Pose(actor,clip,{seconds:role==="gunner"?this.GunnerSeconds():r.time-f["mgThere:"+role],face:mark.yaw});
      // The clip draws the gun (type11 track) / the loader's hands are on the clips: their own weapons are not shown. The Set's world
      // type11 rides the gunner's clip (hidden while the clip shows it) and is let go where it lies when he is shot (WoundShot).
      (this.hiddenWeapons??=new Set()).add(actor);
      if(role==="gunner"){const h=this.Props?.Get("type11");if(h&&h.state!=="held"&&h.state!=="world")this.Props.Hold("type11",actor);}
    }
    if(f.mgPlacedAt==null&&f["mgThere:gunner"]!=null&&f["mgThere:loader"]!=null)f.mgPlacedAt=r.time;
    if(f.mgPlacedAt!=null&&f.firstBurstAt==null&&r.time-f.mgPlacedAt>=W.setupS){f.firstBurstAt=r.time;this.MachineGunBurst();}
  }
  /** The gun keeps on: a burst every W.burstS [min, max] s (seeded) from the first until 02's volley (or the gunner's death). */
  MachineGunBursts(){
    const r=this.r,W=C.wall,f=this.flags,gunner=this.Ija("gunner");
    if(f.firstBurstAt==null||!gunner?.alive)return;
    if(["Charge","Melee","Lift","Check","Released"].includes(this.phase)){
      // Until Dir02's volley takes the pair (its vanguardIds), the old 02 here: the volley's first shots stand in for theirs.
      if(this.phase==="Charge"&&!C.vanguardIds.includes(C.cast.gunner))for(const role of ["gunner","loader"]){const a=this.Ija(role);if(a?.alive)this.Kill(a,"bullet");}
      return;
    }
    this.mgRandom??=SeededRandom(W.seed);
    f.nextBurstAt??=f.firstBurstAt+W.burstS[0]+(W.burstS[1]-W.burstS[0])*this.mgRandom();
    if(r.time>=f.nextBurstAt){this.MachineGunBurst();f.nextBurstAt=r.time+W.burstS[0]+(W.burstS[1]-W.burstS[0])*this.mgRandom();}
  }
  /** One burst: two rounds at the rear trench, the flash at the muzzle, the tracers. */
  MachineGunBurst(){
    const r=this.r,W=C.wall,gunner=this.Ija("gunner");if(!gunner?.alive)return;
    const f=this.flags;f.lastBurstAt=r.time;f.bursts=(f.bursts||0)+1;
    const target=r.Point(W.burstAt[f.bursts%W.burstAt.length],1.1);
    // The gun is the clip's (type11 track): its muzzle is the prop's front, else over the gunner's mark.
    const gun=gunner.actor.characterRig?.openingProps?.items?.get?.("type11")?.object;
    const from=gun?.visible?gun.localToWorld(new THREE.Vector3(0,.05,-.62)):r.Point(SET_MARKS.mg.gunner,.9),dir=target.clone().sub(from).normalize();
    r.audio?.PlayGunshot?.("type11",{position:from,volume:1,burst:W.burstRounds});
    // The top body jolts under the bipod (the Set's corpse, 2 cm for 0.18 s).
    r.openingSet?.JoltCorpse?.("mg.corpseUpper");
    r.vfx?.MuzzleFlash?.(from,dir,{kind:"lmg"});r.vfx?.Tracer?.(from,target,{kind:"ija"});
    gunner.actor.recoil=1;
  }
  /**
   * 「翻译空着手小跑过来，蹲下逼问」: CaptiveInterrogation; ijaB's thumb in the shoulder wound (woundPress) after .03, the comrade
   * arched; ijaA glances back at the rear trench now and then; the gun keeps firing behind them.
   */
  PhaseInterrogation(age){
    const r=this.r,I=C.interrogate,comrade=this.Comrade,ijaA=this.Ija("ijaA"),ijaB=this.Ija("ijaB"),m=this.InterrogationMarks(),f=this.flags;
    if(!this.phaseEntered){this.phaseEntered=true;this.Talk("CaptiveInterrogation");this.Talk("CaptiveWoundTwist");}
    this.HoldBodies();this.HoldVanguard(["ijaA"]);this.MachineGunCrew(99);this.InterpreterIn(m);
    // 2026-10-11 integration: the thumb in the wound is IjaThumbWoundTwist + CaptiveArchCaught (AnimA, stage thumbWound round R3), both
    // from their first frames; woundPress at the clip's `press` (CaptiveWoundTwist's cry waits on it).
    const line3=this.LineEndAt("CaptiveInterrogation.03"),press=this.StageRoot("thumbWound","ijaB",m.wall),thumb="IjaThumbWoundTwist";
    if(line3!=null&&r.time>=line3+I.pressAfterLine3S&&f.thumbFrom==null){
      if(this.Hold(ijaB,press,null,{speed:C.speed.walk})||r.time-line3>4){f.thumbFrom=r.time;this.Put(ijaB,press,{keep:true});}
    }else if(f.thumbFrom==null)this.Hold(ijaB,m.ijaB,null,{speed:C.speed.walk});
    const th=f.thumbFrom!=null?r.time-f.thumbFrom:-1,thumbS=ClipLength(thumb,2.5);
    if(th>=EventAt(thumb,"press",.583))this.Emit("woundPress");
    if(th>=0&&th<thumbS){this.Put(ijaB,press);this.Pose(ijaB,thumb,{seconds:th});this.Pose(comrade,"CaptiveArchCaught",{seconds:th});}
    else{
      if(th>=thumbS&&f.thumbDoneAt==null){f.thumbDoneAt=r.time;this.RerootUnderPelvis(ijaB,ijaB.yaw);}
      if(th>=0)this.Hold(ijaB,m.ijaB,null,{speed:C.speed.walk});
      this.Pose(comrade,"CaptiveKneelMud");
    }
    // ijaA steps back from the chest (the badge torn) and stands watching at the right (round the interpreter's squat).
    const stand={...I.ijaAStand,yaw:Face(I.ijaAStand,m.wall)};
    if(ijaA?.openingWalk?.key=="stand"&&ijaA.openingWalk.done)this.Hold(ijaA,stand,null);
    else if(this.Follow(ijaA,"stand",[...I.standVia,stand],C.speed.walk,null,stand.yaw))ijaA.openingWalk.done=true;
    if(Math.floor(age/I.lookBackEveryS)>Math.floor((age-(this.delta||0))/I.lookBackEveryS))f.ijaALookBackUntil=r.time+I.lookBackS;
    if(this.TalkDone("CaptiveInterrogation")||age>this.TalkLength("CaptiveInterrogation")+C.timeouts.interrogationExtraS)this.Stage("Practice");
  }
  /**
   * The practice's marks (world). 2026-10-11 integration (AnimB's paired stages): the comrade's wall root R3 anchors recruitThrust,
   * whose ijaD root is where the recruit stands for the slap and the charge (IjaRecruitChargeThrust's frame 0 is IjaRecruitSlapped's
   * last, on the same root); recruitSlap puts ijaA round that root. hairLift / kneeCut / bandageWipe put ijaA behind the comrade.
   */
  PracticeMarks(){
    const P=C.practice,m=this.InterrogationMarks();
    const front=this.StageRoot("recruitThrust","ijaD",m.wall),aside=this.StageRoot("recruitSlap","ijaA",front);
    return {...m,front,aside,hair:this.StageRoot("hairLift","ijaA",m.wall),
      back:{...P.recruitBack,yaw:Face(P.recruitBack,m.wall)},wait:P.recruitWait};
  }
  /**
   * 「没时间了。处理掉。」 -> ijaB relieves ijaD at the junction, 「丁。过来。上刺刀。」 -> the recruit trots in, stands with his rifle
   * and does not move, the backhand (IjaSlapRecruit + IjaRecruitSlapped, recruitSlapped at `hit`), 「扎。」, three steps back and the
   * charge, two thrusts (IjaRecruitChargeThrust + CaptiveStabbedCurl: stab1 shoulder, stab2 belly), the comrade curled howling
   * (CaptiveHowl looped), the recruit panting (recruitPant), 「……叫成这样，后沟都听见了。」
   */
  PhasePractice(age){
    const r=this.r,P=C.practice,comrade=this.Comrade,ijaA=this.Ija("ijaA"),ijaB=this.Ija("ijaB"),ijaD=this.Ija("ijaD"),k=this.PracticeMarks(),f=this.flags;
    if(!this.phaseEntered){this.phaseEntered=true;f.practiceAt=r.time;f.ijaALookBackUntil=r.time+P.lookBackS;this.Talk("BayonetPractice");}
    this.HoldBodies();this.HoldVanguard(["ijaA","ijaD"]);this.MachineGunCrew(99);this.InterpreterIn(k);
    // ijaB off to the junction after .01; ijaD from the junction to the comrade at .02.
    const line1=this.LineEndAt("BayonetPractice.01"),line2=this.LineAt("BayonetPractice.02");
    if(line1!=null){SetRelaxedGait(ijaB,"alert");if(this.Follow(ijaB,"toJ",[{x:8,z:-124.9},C.dropIn.junctionPost],C.speed.walk,null,-Math.PI/2))this.Hold(ijaB,C.dropIn.junctionPost,"IjaBayonetGuard",{seconds:r.time});}
    else this.Hold(ijaB,k.ijaB,null);
    if(line2==null&&age<P.lookBackS+6)this.Hold(ijaD,C.dropIn.junctionPost,"IjaBayonetGuard",{seconds:r.time});
    else if(f.recruitInAt==null){SetRelaxedGait(ijaD,"alert");if(this.Follow(ijaD,"toComrade",[{x:9,z:-125.3},{x:k.front.x+.6,z:k.front.z+.1},k.front],C.speed.trot,null,k.front.yaw))f.recruitInAt=r.time;}
    // ijaA steps round to the slap's mark (recruitSlap: at the recruit's right front) once he has called him.
    const stand=C.interrogate.ijaAStand;
    if(line2!=null&&f.slapAt2==null){if(ijaA?.openingWalk?.key==="aside"&&ijaA.openingWalk.done)this.Hold(ijaA,k.aside,null);
      else if(this.Follow(ijaA,"aside",[...C.interrogate.asideVia,k.aside],C.speed.walk,null,k.aside.yaw))ijaA.openingWalk.done=true;}
    else if(f.slapAt2==null)this.Hold(ijaA,{...stand,yaw:Face(stand,k.wall)},null,{speed:C.speed.walk});
    // The hesitation, then the backhand: both clips from their first frame together (recruitSlap).
    const aThere=ijaA?.openingWalk?.key==="aside"&&ijaA.openingWalk.done;
    if(f.recruitInAt!=null&&f.slapAt2==null){
      this.Hold(ijaD,k.front,"IjaReadyRifle",{seconds:ClipLength("IjaReadyRifle",1.1)});
      if(r.time-f.recruitInAt>=P.hesitateS&&(aThere||r.time-f.recruitInAt>P.hesitateS+3)){f.slapAt2=r.time;this.Put(ijaA,k.aside);this.Put(ijaD,k.front);}
    }
    if(f.slapAt2!=null){
      const s=r.time-f.slapAt2;
      this.Put(ijaA,k.aside);this.Pose(ijaA,"IjaSlapRecruit",{seconds:s});
      if(f.chargeAt==null){this.Put(ijaD,k.front);this.Pose(ijaD,"IjaRecruitSlapped",{seconds:s});}
      if(s>=EventAt("IjaRecruitSlapped","hit",.417)&&this.Emit("recruitSlapped"))r.audio?.Play?.("slap",{position:this.HeadPoint(ijaD)||r.Point(k.front,1.5),volume:1});
    }
    // 「丁退开三步，喊着冲上去」 after 「扎。」: IjaRecruitChargeThrust + CaptiveStabbedCurl from their first frames together.
    const line3=this.LineEndAt("BayonetPractice.03");
    if(this.Fired("recruitSlapped")&&f.chargeAt==null&&(line3!=null&&r.time>=line3+P.chargeAfterLine3S||this.Since("recruitSlapped")>6)){
      f.chargeAt=r.time;this.PlayClip(ijaD,"IjaRecruitChargeThrust",{restart:true});this.PlayClip(comrade,"CaptiveStabbedCurl",{restart:true});
    }
    if(f.chargeAt!=null){
      const t=r.time-f.chargeAt;
      this.Put(ijaD,k.front);this.Pose(ijaD,"IjaRecruitChargeThrust",{seconds:t});
      if(t>=EventAt("IjaRecruitChargeThrust","shout",1.3)&&f.recruitShoutAt==null){f.recruitShoutAt=r.time;this.Talk("RecruitCharge");}
      if(t>=EventAt("IjaRecruitChargeThrust","stab1",2.208)&&this.Emit("stab1"))this.Sfx("bayonetStabBody",{position:this.HeadPoint(comrade)||r.Point(k.wall,1),volume:1});
      if(t>=EventAt("IjaRecruitChargeThrust","stab2",2.75)&&this.Emit("stab2"))this.Sfx("bayonetStabBody",{position:r.Point(k.wall,.6),volume:1});
      if(t>=EventAt("CaptiveStabbedCurl","howl",3.5))f.howlFrom??=r.time;
      if(t>=EventAt("IjaRecruitChargeThrust","recruitPant",3.25))this.Emit("recruitPant");
    }
    // The comrade: kneeling, then (the charge) the shoulder, the belly, curled in the mud howling until the cut.
    this.Put(comrade,k.wall);
    if(f.chargeAt!=null)this.Pose(comrade,"CaptiveStabbedCurl",{seconds:r.time-f.chargeAt});
    else this.Pose(comrade,"CaptiveKneelMud");
    this.Howl();
    if(this.LineEndAt("BayonetPractice.04")!=null||age>C.timeouts.practiceS)this.Stage("Slash");
  }
  /** 「嗓子里一声接一声地嚎」: CaptiveHowl over and over (its stand-in cue while it is not recorded) until the cut. */
  Howl(){
    const r=this.r,f=this.flags;
    if(f.howlFrom==null||f.throatCut!=null)return;
    const t=this.talks?.CaptiveHowl;
    if(!t||t.done&&(t.mode==="voice"||r.time-t.doneAt>=0)&&r.time-(f.howlAt??-9)>=C.practice.howlEveryS){
      if(t)delete this.talks.CaptiveHowl;f.howlAt=r.time;this.Talk("CaptiveHowl");
    }
  }
  /** His collar hold through the questioning: the authored one (2026-09-30), the legacy CollarControl while it is not baked. */
  QuestionClip(){return OpeningClipMeta("IjaCollarQuestion")?"IjaCollarQuestion":"CollarControl";}
  /**
   * SB03A's Japanese going away down the front trench (Data_FirstLevelBackdropSquads.OPENING_DEPTH_IJA): spawned at the
   * cut (out of the picture), walking from afterWipeS (+ staggerS each), retired at the route's end
   * once out of the shot, and at the latest when 02 begins (RetireDepthIja).
   */
  DepthIja(){
    const D=OPENING_DEPTH_IJA,at=this.flags.depthIjaAt;if(at==null)return;
    D.members.forEach((m,i)=>{
      if(this.flags["retired:"+m.id])return;
      const start={...m.start,yaw:Face(m.start,m.route[0])};
      let actor=this.cast[m.id];
      // 2026-09-27: one of them stops at a post down the trench and watches east until the charge's volley shoots him dead
      // there (rescue.depthPost, rescue.wound; 2026-09-30, he used to be cut down). He wears IJA01.
      const post=C.rescue.depthPost[m.id];
      // Going off after the killing, rifles slung (relaxed gait), not at the ready.
      if(!actor){actor=this.Spawn(m.id,"ija",m.start,{weapon:"Type38",...(post?{actorKind:"ija",modelVariant:0}:{})});this.Put(actor,start);SetRelaxedGait(actor,"slung");}
      if(post){
        if(this.flags["hit:"+m.id]!=null||!actor.alive)return;
        if(this.r.time<at+D.afterWipeS+i*D.staggerS){this.Hold(actor,start,null);return;}
        const there=actor.openingWalk?.key==="post"&&actor.openingWalk.done;
        if(!there){if(this.Follow(actor,"post",[m.route[0],{x:post.x-1.2,z:post.z},post],D.speedMps,null,post.yaw))actor.openingWalk.done=true;return;}
        SetRelaxedGait(actor,null);this.Hold(actor,post,"IjaGuardPort",{seconds:this.r.time});
        return;
      }
      if(m.flagKick&&!this.KickBackdropFlag(actor,m.flagKick))return;
      if(!m.flagKick&&this.r.time<at+D.afterWipeS+i*D.staggerS){this.Hold(actor,start,null);return;}
      if(!actor.depthIjaRouteDone){if(!this.Follow(actor,"depth",m.route,D.speedMps,null))return;actor.depthIjaRouteDone=true;}
      if(!InCameraView(this.r.player.camera,this.r.Point(actor.position,1),10)){this.RetireDepthIja(m.id);return;}
      // 2026-09-30「开局中间有个敌军不会动」: the bank route ends in the open field the pinned player looks across, so he
      // stood there through the questioning and after the hand-back. Still in shot, he walks on away from the player
      // (offRoute) and is retired once out of shot or past D.retireFarM.
      if(!m.offRoute){this.Pose(actor,null);return;}
      const done=this.Follow(actor,"off",m.offRoute,D.speedMps,null);
      if(done||Distance(actor.position,this.r.player.position)>D.retireFarM)this.RetireDepthIja(m.id);
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
  /**
   * 「甲把丁拨开，从腰上抽出刺刀，揪住冬瓜的头发把人提起来，膝盖顶住后腰，往后一扳」 -> 「看着。」 (hairLifted) ->
   * 「支那猪，叫得倒响。」 (cutStart at the blade laid on the throat) -> the cut (throatCut, captivesKilled; the howl stops; the blood
   * jet onto the north wall; the view narrows) -> the knee (shove) -> the blade wiped twice on the bandage (wipe1 / wipe2) and
   * clicked onto the rifle (fix -> bayonetFixed) -> 「一刀，没声音。下一个你来。」 -> the recruit's nod (recruitNod) ->
   * 「裤子尿湿没有？」 -> 「检查。往前。」
   * 2026-10-11 integration: AnimB's chain on R3 -- IjaHairLiftKneeBack + CaptiveCurledPulledUp (hairLift; the draw is inside it,
   * no IjaDrawBayonet), held on their loops until 「支那猪」 has been said, then IjaThroatCutKneeShove + CaptiveThroatCutForward
   * (kneeCut) and IjaWipeBandageFixBayonet (bandageWipe), all on one root. The shove of the recruit stays IjaShoveForward (§4.1).
   */
  PhaseSlash(phaseAge){
    const r=this.r,Q=C.slash,comrade=this.Comrade,ijaA=this.Ija("ijaA"),ijaD=this.Ija("ijaD"),k=this.PracticeMarks(),f=this.flags;
    const hair=k.hair,hairStart=Local(hair,...(OpeningClipRoot("TengxianIja02","IjaHairLiftKneeBack")?.start?.slice(0,2)||[.66,-.4]));
    if(!this.phaseEntered){this.phaseEntered=true;f.slashPhaseAt=r.time;}
    this.HoldBodies();this.HoldVanguard(["ijaA","ijaD"]);this.MachineGunCrew(99);this.InterpreterIn(k);this.DepthIja();
    const ijaB=this.Ija("ijaB");this.Hold(ijaB,C.dropIn.junctionPost,"IjaBayonetGuard",{seconds:r.time});
    this.Put(comrade,k.wall);
    // The shove: the recruit is pushed aside (IjaShoveForward) and goes off to stand at practice.recruitWait, rifle at the ready.
    if(phaseAge<Q.shoveS){
      this.Put(ijaA,k.aside);this.Pose(ijaA,"IjaShoveForward",{seconds:phaseAge,face:Face(k.aside,k.front)});
      this.Put(ijaD,k.front);this.Pose(ijaD,"IjaRecruitChargeThrust",{seconds:99});
      this.Pose(comrade,"CaptiveStabbedCurl",{seconds:99});this.Howl();return;
    }
    if(!f.recruitOffAt){f.recruitOffAt=r.time;this.RerootUnderPelvis(ijaD,Face(ijaD.openingStoryboardLast||ijaD.position,k.wait));this.RerootUnderPelvis(ijaA,ijaA.yaw);}
    if(f.recruitWaitAt==null){if(this.Follow(ijaD,"wait",[k.wait],C.speed.walk,null,k.wait.yaw))f.recruitWaitAt=r.time;}
    else this.Hold(ijaD,k.wait,"IjaReadyRifle",{seconds:ClipLength("IjaReadyRifle",1.1)});
    // He walks round to the comrade's back, onto the hair lift's first frame (its pelvis 0.66 m right, 0.4 m ahead of its root).
    if(f.slashAt==null){
      this.Pose(comrade,"CaptiveStabbedCurl",{seconds:99});this.Howl();
      const at={...hairStart,yaw:hair.yaw};
      if(!ijaA||this.Hold(ijaA,at,null,{speed:C.speed.walk})||phaseAge>Q.shoveS+3){f.slashAt=r.time;this.Put(ijaA,hair,{keep:true});
        this.PlayClip(ijaA,"IjaHairLiftKneeBack",{restart:true});this.PlayClip(comrade,"CaptiveCurledPulledUp",{restart:true});}
      else return;
    }
    const lift=r.time-f.slashAt;
    if(lift>=EventAt("IjaHairLiftKneeBack","lift",1.3))this.Emit("hairLifted");
    if(lift>=EventAt("IjaHairLiftKneeBack","bladeOnThroat",1.92))this.Emit("cutStart");
    // The cut goes after 「支那猪，叫得倒响。」 (.06; or slash.cutLateS after the blade is on the throat without it).
    const line6=this.LineEndAt("BayonetPractice.06");
    if(f.cutAt==null&&this.Fired("cutStart")&&(line6!=null&&r.time>=line6+Q.cutAfterLine6S||this.Since("cutStart")>Q.cutLateS)){
      f.cutAt=r.time;this.PlayClip(ijaA,"IjaThroatCutKneeShove",{restart:true});this.PlayClip(comrade,"CaptiveThroatCutForward",{restart:true});
    }
    this.Put(ijaA,hair);
    if(f.cutAt==null){
      this.Howl();
      this.Pose(ijaA,"IjaHairLiftKneeBack",{seconds:lift});this.Pose(comrade,"CaptiveCurledPulledUp",{seconds:lift});
      return;
    }
    const cut=r.time-f.cutAt,cutS=ClipLength("IjaThroatCutKneeShove",1.667);
    this.Pose(comrade,"CaptiveThroatCutForward",{seconds:cut});
    if(cut>=EventAt("IjaThroatCutKneeShove","cut",.25)&&f.throatCut==null){
      f.throatCut=r.time;
      // The howl stops dead.
      this.talks?.CaptiveHowl?.handle?.Stop?.();
      const neck=comrade.actor.characterRig?.bones.neck||comrade.actor.characterRig?.bones.head;
      // 「血全喷在沟壁上，自己身上一滴没沾」: the jet from his right side of the throat, his right front -- north-west, onto the
      // north wall (the clip's `spray`), away from ijaA behind him.
      const out={x:Q.sprayDir[0],z:Q.sprayDir[1]};
      if(neck)f.spurt=r.vfx?.BloodSpurt?.(neck,null,new THREE.Vector3(out.x,.25,out.z),{seconds:3.2,arterial:true,pool:true,worldDirection:true})||null;
      const at=neck?.getWorldPosition(new THREE.Vector3());
      if(at)r.vfx?.BloodBurst?.(at,new THREE.Vector3(out.x,.3,out.z).normalize(),1.6);
      r.voice?.Signal?.("ThroatCut");r.voice?.Signal?.("throatCut");
      this.Sfx("throatCut",{position:this.HeadPoint(comrade)||r.Point(k.wall,1),volume:.9});
      if(!r.Has("captivesKilled"))r.Record("captivesKilled",{count:1});
      f.depthIjaAt??=r.time;
    }
    if(cut>=EventAt("CaptiveThroatCutForward","down",1.25)&&f.comradeDownAt==null){f.comradeDownAt=r.time;r.audio?.Play?.("bodyFall",{position:r.Point(k.wall,.3),volume:.7});}
    if(cut>=EventAt("CaptiveThroatCutForward","dead",3.2)&&!f.comradeDead){
      comrade.scriptEssential=false;this.Kill(comrade);f.comradeDead=true;f.releasedAt=r.time;f.walkOffAt=r.time+.6;
    }
    if(f.comradeDead)this.ComradeCorpse();
    if(cut<cutS){this.Pose(ijaA,"IjaThroatCutKneeShove",{seconds:cut});return;}
    // The wipe on the bandage and the click (bandageWipe: the comrade's clip runs on under him, offsetS -1.667).
    f.wipeAt??=r.time;
    const wipe=r.time-f.wipeAt;
    this.Pose(ijaA,"IjaWipeBandageFixBayonet",{seconds:wipe});
    if(wipe>=EventAt("IjaWipeBandageFixBayonet","wipe1",.792))this.Emit("wipe1");
    if(wipe>=EventAt("IjaWipeBandageFixBayonet","wipe2",1.333))this.Emit("wipe2");
    if(wipe>=EventAt("IjaWipeBandageFixBayonet","fix",3.0)-.24&&this.Emit("fix")){
      // bayonetFixClick: the 「咔」 sits 0.24 s into the take (Report_sfx), its start that much before the clip's fix.
      this.Sfx("bayonetFixClick",{position:this.HandPoint(ijaA,"L")||r.Point(hair,1.1),volume:.9});
    }
    if(wipe>=EventAt("IjaWipeBandageFixBayonet","fix",3.0))this.Emit("bayonetFixed");
    // 「丁点头，脸是白的」 after .07; then ijaB laughs at the junction (.08) and 「检查。往前。」 (.09).
    const line7=this.LineEndAt("BayonetPractice.07");
    if(line7!=null&&r.time>=line7+Q.nodAfterLine7S&&this.Emit("recruitNod"))f.nodAt=r.time;
    if(this.TalkDone("BayonetPractice")&&wipe>=ClipLength("IjaWipeBandageFixBayonet",4)||phaseAge>C.timeouts.slashS)this.Stage("Finish");
  }
  /**
   * 「甲端起枪，刺刀尖朝下，沿沟底一具一具补，补到洞口。顺子闭眼装死，只留一条眼缝」. 2026-10-11 integration: IjaFinishWalkStab
   * (AnimB, root motion 1.4 m a step cycle, the bayonet into the body at `stab`) on a root put so its point lands on the Set's
   * finish body (finish.stabAt: the point's offset from the root at `stab`), walked to from the wipe; then on to IjaBootOnHand's
   * first frame (its pelvis behind ija.crouch). The interpreter goes to his squat for 02; the eyes shut from the moment he sets off.
   */
  PhaseFinish(age){
    const r=this.r,F=C.finish,ijaA=this.Ija("ijaA"),f=this.flags;
    if(!this.phaseEntered){this.phaseEntered=true;f.finishAt=r.time;f.playDeadAt??=r.time;
      this.RerootUnderPelvis(ijaA,Face(ijaA.openingStoryboardLast||ijaA.position,this.FinishStabRoot()));SetRelaxedGait(ijaA,"alert");}
    this.HoldBodies();this.HoldVanguard(["ijaA","ijaD"]);this.MachineGunCrew(99);this.DepthIja();
    this.ComradeCorpse();
    this.Hold(this.Ija("ijaD"),C.practice.recruitWait,"IjaReadyRifle",{seconds:1.1});
    this.Hold(this.Ija("ijaB"),C.dropIn.junctionPost,"IjaBayonetGuard",{seconds:r.time});
    this.FinishInterpreter();
    const root=this.FinishStabRoot(),boot=this.BootStart();
    if(f.finishStabFrom==null){
      if(this.Hold(ijaA,root,null,{speed:F.walkMps})||age>F.walkMaxS){f.finishStabFrom=r.time;this.Put(ijaA,root,{keep:true});this.PlayClip(ijaA,"IjaFinishWalkStab",{restart:true});}
      return;
    }
    const t=r.time-f.finishStabFrom,cycle=ClipLength("IjaFinishWalkStab",1.75);
    if(t<cycle){
      this.Put(ijaA,root);this.Pose(ijaA,"IjaFinishWalkStab",{seconds:t});
      if(t>=EventAt("IjaFinishWalkStab","stab",.875)&&this.Emit("finishStab1"))this.Sfx("bayonetStabBody",{position:r.Point(C.marks.finishBodies[0],.35),volume:1});
      return;
    }
    if(f.finishWalkAt==null){f.finishWalkAt=r.time;this.RerootUnderPelvis(ijaA,Face(ijaA.openingStoryboardLast||ijaA.position,boot));}
    if(this.Hold(ijaA,{...boot,yaw:C.ija.crouch.yaw},null,{speed:F.walkMps})||r.time-f.finishWalkAt>F.walkMaxS){this.Put(ijaA,C.ija.crouch,{keep:true});this.Stage("Found");}
  }
  /** Where IjaFinishWalkStab's root goes so the bayonet's point lands on the finish body's back at `stab` (facing finish.yawDeg). */
  FinishStabRoot(){
    const F=C.finish,body=this.r.openingSet?.CorpseInfo?.("finish.bodies[0]")?.top||C.marks.finishBodies[0];
    const yaw=F.yawDeg*DEG,o=Rot(yaw,...F.stabAtM);
    return {x:body.x-o.x,z:body.z-o.z,yaw};
  }
  /** IjaBootOnHand's first frame: its pelvis (behind its root ija.crouch), where the walk from the stab ends. */
  BootStart(){
    const s=OpeningClipRoot("TengxianIja02","IjaBootOnHand")?.start||[.065,.336];
    return Local(C.ija.crouch,s[0],s[1]);
  }
  /** The interpreter from his questioning mark to the squat 02's Hold starts from (rescue.interpreter), round the recruit
   *  (finish.interpreterVia); the walk key is InterpreterToSquat's ("squat"), so 02 takes him on from there. */
  FinishInterpreter(){
    const a=this.cast.interpreter,R=C.rescue;if(!a)return;
    const w=a.openingWalk;if(w?.key==="squat"&&w.done){this.Hold(a,R.interpreter,"InterpreterCrouchAsk");return;}
    if(this.Follow(a,"squat",[...C.finish.interpreterVia,R.interpreter],C.speed.walk,null,R.interpreter.yaw,{cornerM:.1}))a.openingWalk.done=true;
  }
  /**
   * 「刺刀尖停在顺子背上一拃高的地方……军靴落下来，踩住顺子伸在泥里的那只手，鞋跟往下一碾。顺子没出声，可手指自己抽了一下」 ->
   * 「……这个是活的。留着，问。」 (waits bootGrind) -> he squats at the head and takes the hair (02's Hold); doorSearchStarted.
   * 2026-10-11 integration: IjaBootOnHand (AnimB) on ija.crouch -- hover, the step on the right hand (bootStepAt), the grind
   * (bootGrind), held before its crouch until the line is said, then the crouch onto IjaCrouchHairHold's first frame.
   */
  PhaseFound(age){
    const r=this.r,ijaA=this.Ija("ijaA"),J=C.ija,Fd=C.found,f=this.flags;
    if(!this.phaseEntered){
      this.phaseEntered=true;f.foundAt??=r.time;f.playDeadAt??=r.time;f.bootFrom=r.time;
      this.Talk("ShunziFound");this.PlayClip(ijaA,"IjaBootOnHand",{restart:true});
    }
    this.HoldBodies();this.HoldVanguard(["ijaA","ijaD"]);this.MachineGunCrew(99);this.DepthIja();
    this.ComradeCorpse();
    this.Hold(this.Ija("ijaD"),C.practice.recruitWait,"IjaReadyRifle",{seconds:1.1});
    this.Hold(this.Ija("ijaB"),C.dropIn.junctionPost,"IjaBayonetGuard",{seconds:r.time});
    this.FinishInterpreter();
    const step=EventAt("IjaBootOnHand","grind",1.458),grindEnd=OpeningClipMeta("IjaBootOnHand")?.events?.find(e=>e.kind==="grind")?.untilT??step+Fd.grindS;
    const crouch=EventAt("IjaBootOnHand","crouch",3.15),length=ClipLength("IjaBootOnHand",3.75);
    // The clip's own clock, held at holdAtS (before the crouch) until the find line has been said.
    const line=this.LineEndAt("ShunziFound.01");
    if(f.crouchFrom==null&&(line!=null&&r.time>=line+Fd.crouchAfterLineS||age>grindEnd+C.timeouts.foundS))f.crouchFrom=r.time;
    const run=r.time-f.bootFrom,t=f.crouchFrom==null?Math.min(run,Fd.holdAtS):Fd.holdAtS+(r.time-Math.max(f.crouchFrom,f.bootFrom+Fd.holdAtS));
    this.Put(ijaA,J.crouch);this.Pose(ijaA,"IjaBootOnHand",{seconds:Math.min(t,length)});
    if(t>=step&&f.bootDownAt==null){f.bootDownAt=f.bootStepAt=r.time;this.Sfx("stompMud",{position:r.Point(C.shunzi.witnessEye,.1),volume:.8});this.Sfx("bootGrind",{position:r.Point(C.shunzi.witnessEye,.1),volume:.9});}
    if(t>=grindEnd)this.Emit("bootGrind");
    if(t<length)return;
    // IjaBootOnHand's last frame is IjaCrouchHairHold's first: the hair hold (02's Hold). From here his rifle shows its bayonet
    // itself (IjaCrouchHairHold has no bayonet track) and the sheathed one is not his any more.
    this.FixedBayonet(ijaA);
    f.crouchAt??=r.time;
    this.Pose(ijaA,this.HoldClip(),{seconds:0});
    if(!r.Has("doorSearchStarted"))r.Record("doorSearchStarted");
    this.Stage("Hold");
  }
  /** ijaA's bayonet fixed on his own rifle from the click on (the clips with a bayonet track draw it themselves until 02). */
  FixedBayonet(actor){
    const a=actor?.actor;if(!a||a.bayonetFixed)return;
    a.bayonetFixed=true;if(a.weaponId)a.SetWeapon(a.weaponId);
    a.characterRig?.openingProps?.owned?.delete?.("bayonet");
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
  Questioning({skip=null}={}){
    const r=this.r,ijaA=this.Ija("ijaA"),R=C.rescue,Q=R.slap;
    this.ComradeCorpse();
    this.DepthIja();
    this.PoseHolder(ijaA);
    this.InterpreterToSquat();
    this.RescueVanguard({skip});
    this.WaitingRescuers();
    this.UpdateSlaps();
  }
  /**
   * 2026-10-11 redraft: the rest of the vanguard through the questioning, each on his post (rescue.vanguardPosts; walked there
   * if he is not on it): ijaB guarding the junction J facing east (IjaBayonetGuard, the stationary default), ijaC at the fold F
   * facing east with his rifle at the ready, the recruit ijaD waiting at the ready facing the pinned man -- until Blade takes
   * him (`skip`). A man the charge has already shot or the long shot / fold fight owns is left to them.
   */
  RescueVanguard({skip=null}={}){
    const R=C.rescue,P=R.vanguardPosts;
    for(const role of ["ijaB","ijaC","ijaD"]){
      const actor=this.Ija(role);
      if(!actor?.alive||actor.openingCombatReleased||role===skip||this.flags["hit:"+role]!=null)continue;
      const post=P[role],there=Distance(actor.openingStoryboardLast||actor.position,post)<.15;
      this.Show(actor);
      if(role==="ijaB")this.Hold(actor,post,null,{speed:C.speed.walk});
      else this.Hold(actor,post,there?"IjaReadyRifle":null,there?{speed:C.speed.walk,seconds:ClipLength("IjaReadyRifle",1.1)}:{speed:C.speed.walk});
    }
    // The recruit's rifle at the ready is aimed at the pinned man (RecruitRifle eases back to his hands' own pose otherwise).
    this.RecruitRifle();
    this.HoldMgCrew();
  }
  /** The machine-gun crew stand-ins (EnsureMgCrew) stay on their marks on the south lip until the volley takes them: the AI would
   *  walk them down off it into the trench (2026-10-11 probe: both at (8.2,-123.4)). Only the director's own stand-ins. */
  HoldMgCrew(){
    const marks=this.MgMarks();
    for(const [role,spec] of Object.entries(C.rescue.mgCrew)){
      const actor=this.r.enemies.get(spec.id);
      if(!actor?.alive||this.flags["hit:"+role]!=null)continue;
      if(actor.openingMgStandIn){this.r.PlaceActor(actor,spec.at);actor.yaw=spec.at.yaw;actor.actor.root.rotation.y=spec.at.yaw;continue;}
      // 2026-10-11 integration: Dir01's roster men (bunkerAssault BunkerGunner / BunkerLoader) stay on their clips on the lip through
      // 02 until the volley; a start straight into 02 puts them there (no walk up from the sap).
      if(!(actor.openingWalk?.key==="mg"&&actor.openingWalk.done)){this.Show(actor);this.Put(actor,marks[role]);actor.openingWalk={key:"mg",index:0,done:true};this.flags.mgPlacedAt??=this.r.time;this.flags.firstBurstAt??=this.r.time;}
    }
    if(Object.values(C.rescue.mgCrew).some(spec=>!this.r.enemies.get(spec.id)?.openingMgStandIn))this.MachineGunCrew(99);
  }
  /** ijaA squatting at the head with the hair in his fist: the hold clip, or the slap clip playing now. */
  PoseHolder(ijaA){
    const r=this.r;if(!ijaA)return;
    this.Put(ijaA,C.ija.crouch);
    const slap=this.SlapClip(),after=this.SlapEnd();
    // After a slap the hold picks up at its loop start (the slap clips end on that pose).
    const t=after!=null?(OpeningClipMeta(this.HoldClip())?.holdLoop?.[0]??0)+r.time-after:r.time-(this.flags.holdAt??r.time);
    if(slap)this.Pose(ijaA,slap.clip,{seconds:slap.seconds});
    else this.Pose(ijaA,this.HoldClip(),{seconds:t});
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
  /** When the last slap clip that has played out ended (null: none yet). */
  SlapEnd(){
    const r=this.r,Q=C.rescue.slap;let end=null;
    for(const s of this.slaps||[]){
      const clip=s.side>0?"IjaSlapForehand":"IjaSlapBackhand";
      const e=s.at-ContactAt(clip,"slap",Q.hitS)+ClipLength(clip,1.4);
      if(OpeningClipMeta(clip)&&r.time>e)end=e;
    }
    return end;
  }
  /** Seconds from now to a `grab` blow's hit: delayS into the hold (the head up) and no earlier than afterLineS from the
   *  end of `afterLine` (a scene playing now, by its manifest length). */
  GrabBlowIn(blow){
    const r=this.r,Q=C.rescue.slap;let hit=blow.delayS+Q.hitS;
    if(blow.afterLine&&this.Started(blow.afterLine)&&!this.SceneDone(blow.afterLine))
      hit=Math.max(hit,this.flags["scene:"+blow.afterLine]+this.SceneLength(blow.afterLine)+blow.afterLineS-r.time);
    return hit;
  }
  /** Queue blow `index` of rescue.slap.blows: it lands `hitInS` from now (UpdateSlaps). */
  QueueSlap(index,hitInS){
    const blow=C.rescue.slap.blows[index];
    (this.slaps??=[]).push({at:this.r.time+hitInS,side:blow.side,blow:index,landed:false});
  }
  /** A questioning line kept back until its slap has landed (rescue.slap.blows `then`); the dialogue player's hold. */
  HeldBySlap(lineId){
    const Q=C.rescue.slap,index=Q.blows.findIndex(b=>b.then===lineId);
    if(index<0)return false;
    const slap=this.slaps?.find(s=>s.blow===index);
    return !slap?.landed||this.r.time<slap.at+Q.blows[index].thenAfterS;
  }
  UpdateSlaps(){
    const r=this.r;
    for(const slap of this.slaps||[]){
      if(slap.landed||r.time<slap.at)continue;
      slap.landed=true;
      this.strikeAt=r.time;this.flags.slapAt=r.time;this.flags.slapSide=slap.side;this.flags.slapCount=(this.flags.slapCount||0)+1;
      // The first one ends his shamming (rescue.playDead): the eyes snap open, the hands go to the mud.
      this.flags.wokenAt??=r.time;
      // The view keeps aiming where his face was at the blow while the head is flung (Shot: Hold / Ask).
      this.slapAim=this.HeadPoint(this.Ija("ijaA"))?.clone()||null;
      r.audio?.Play?.(C.rescue.slap.sound,{position:r.Point(C.shunzi.witnessEye,.45),volume:1});
      r.audio?.Deafen?.(.35);
      if(!r.Has("playerSlapped"))r.Record("playerSlapped");
    }
  }
  /** The slap's snap of the head (0 -> 1 -> 0): flung out in 0.06 s, hanging there hangS, eased back over recoverS. */
  SlapKick(){
    const at=this.flags.slapAt;if(at==null)return 0;
    const t=this.r.time-at,Q=C.rescue.slap;
    if(t<0||t>Q.hangS+Q.recoverS)return 0;
    return Smooth(t/.06)*(1-Smooth((t-Q.hangS)/Q.recoverS));
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
    const weapon=spec.weapon||"Dadao";
    const actor=this.Spawn(spec.id,"nra",spec.start,{weapon,actorKind:"nra",modelVariant:spec.modelVariant});
    Equip(actor,weapon);this.Hide(actor);
    return actor;
  }
  PhaseHold(age){
    const r=this.r;
    if(!this.phaseEntered){
      this.phaseEntered=true;r.Record("rescueCallHeard");
      this.flags.holdAt=r.time;this.flags.holdGripAt=r.time+.25;
      this.EnsureMgCrew();
      const Q=C.rescue.slap,B=C.rescue.blade,seconds=id=>r.voice?.manifest?.lines?.[id]?.seconds??1.5;
      // The first blow the moment the head is up in his fist -- and his find line said; the lines wait for their blows
      // (HeldBySlap) and 「说话！」 for the recruit's cut (HeldByBlade).
      Q.blows.forEach((blow,i)=>{if(blow.at==="grab")this.QueueSlap(i,this.GrabBlowIn(blow));});
      this.Scene("RescueInterrogation",r.voice?.PlayScene("RescueInterrogation",{speakers:this.Speakers(),
        hold:(line)=>this.HeldBySlap(line.id)||this.HeldByBlade(line.id),
        onLine:(lineId)=>{
          if(lineId==="RescueInterrogation.02")this.flags.askAt??=r.time;
          Q.blows.forEach((blow,i)=>{if(lineId===blow.line)this.QueueSlap(i,seconds(lineId)+blow.afterEndS);});
          // 「快点！」: the recruit sets off as it ends (Blade).
          if(lineId===B.startLine)this.flags.bladeDueAt??=r.time+seconds(lineId)+B.afterLineS;
          if(lineId===B.thenLine)this.flags.speakAt??=r.time;
        }}));
      // No voice: the slaps and the recruit at the lines' estimated starts (each held line pushes the rest on).
      if(!this.scenes.RescueInterrogation){
        const L=id=>this.LineStart("RescueInterrogation",id);let shift=0;
        Q.blows.forEach((blow,i)=>{
          const hit=blow.at==="grab"?this.GrabBlowIn(blow):shift+L(blow.line)+seconds(blow.line)+blow.afterEndS;
          this.QueueSlap(i,hit);
          if(blow.then)shift=Math.max(shift,hit+blow.thenAfterS-L(blow.then));
        });
        this.flags.bladeDueAt=r.time+shift+L(B.startLine)+seconds(B.startLine)+B.afterLineS;
      }
    }
    this.Questioning();
    if(this.flags.askAt!=null||age>C.timeouts.holdLineS)this.Stage("Ask");
  }
  PhaseAsk(age){
    const r=this.r;
    this.Questioning();
    if(this.flags.bladeDueAt!=null&&r.time>=this.flags.bladeDueAt||age>C.timeouts.askS)this.Stage("Blade");
  }
  /** 「说话！」 waits until thenAfterS after the recruit's cut (rescue.blade); the dialogue player's hold. */
  HeldByBlade(lineId){
    const B=C.rescue.blade;if(lineId!==B.thenLine)return false;
    const cut=this.flags["cut:cheek"];
    // null: no recruit to cut him (missing / dead) -- the line goes on.
    if(cut===null)return false;
    return cut===undefined||this.r.time<cut+B.thenAfterS;
  }
  /**
   * 2026-10-11 redraft (contract §1.10, 「丁端着刺刀走过来，刀尖上还挂着冬瓜的血。他把刀尖抵在顺子脸颊上，往下一压，划开一道口子。
   * 手还有点抖，这回甲没催他。」「说话！」「丁退开三步，端平了枪。」): after ijaB's 「快点！」 the recruit walks from his wait to the pinned
   * man's right front (rescue.blade.recruitAt), leans over and lays his bayonet's point on the left cheek (`touch`), presses it
   * down and cuts (`cut`: the cheekCut sound, the lens's cheek look, the head flinching away); ijaA keeps his fist in the hair
   * and says nothing. 「说话！」 follows the cut; the recruit backs off three steps to levelAt and levels his rifle at the eye;
   * the charge breaks in once it is level. Stand-ins until IjaRecruitCheekCut / IjaRecruitLevelRifle are baked: RecruitRifle.
   */
  PhaseBlade(age){
    const r=this.r,R=C.rescue,B=R.blade,f=this.flags,ijaD=this.Ija("ijaD"),eye=C.shunzi.witnessEye;
    if(!this.phaseEntered){this.phaseEntered=true;f.bladeStartAt=r.time;this.bladeLook=null;}
    this.Questioning({skip:"ijaD"});
    const recruit=ijaD?.alive&&!ijaD.openingCombatReleased?ijaD:null;
    if(recruit)this.RecruitBlood(recruit);
    const toEye=p=>Face(p,eye);
    // He walks to the pinned man (a late walker is put there).
    if(f.bladeAt==null){
      const at=this.BladeRoot();
      if(!recruit){f.bladeAt=r.time;f["touch:cheek"]=f["cut:cheek"]=null;}
      else if(this.Move(recruit,at,Distance(recruit.openingStoryboardLast||recruit.position,at)<.6?at.yaw:null,null,C.speed.walk)||age>C.timeouts.bladeWalkS){this.Put(recruit,at);f.bladeAt=r.time;}
      else{this.RecruitRifle();return this.BladeTimeout(age);}
    }
    const t=r.time-f.bladeAt,clip=OpeningClipMeta(B.clip)?B.clip:null;
    const touch=clip?EventAt(clip,"touch",B.touchS):B.touchS,cut=clip?EventAt(clip,"cut",B.cutS):B.cutS;
    if(recruit&&f.backAt==null){
      const at=this.BladeRoot();
      if(clip){this.Put(recruit,at);this.Pose(recruit,clip,{seconds:t,face:at.yaw});}
      else this.Pose(recruit,B.standInClip,{seconds:ClipLength(B.standInClip,1.1),face:at.yaw});
    }
    if(t>=touch&&f["touch:cheek"]===undefined)f["touch:cheek"]=r.time;
    if(t>=cut&&f["cut:cheek"]===undefined)this.CheekCut();
    // 「说话！」 has been said (or, without the voice, thenAfterS after the cut): he backs off three steps and levels the rifle.
    const said=f.speakAt!=null?f.speakAt+(r.voice?.manifest?.lines?.[B.thenLine]?.seconds??.8)+B.backAfterLineS:null;
    const backDue=f["cut:cheek"]!=null&&(said!=null?r.time>=said:!this.scenes.RescueInterrogation||this.SceneDone("RescueInterrogation")
      ?r.time>=f["cut:cheek"]+B.thenAfterS+.8:false);
    if(f.backAt==null&&(backDue||t>=B.releaseS+3)&&t>=B.releaseS+B.liftS)f.backAt=r.time;
    if(f.backAt!=null&&recruit){
      const level={...B.levelAt,yaw:toEye(B.levelAt)},levelClip=OpeningClipMeta(B.levelClip)?B.levelClip:null;
      if(levelClip){const at=this.BladeRoot();this.Put(recruit,at);this.Pose(recruit,levelClip,{seconds:r.time-f.backAt,face:at.yaw});
        if(r.time-f.backAt>=(OpeningClipMeta(levelClip).holdLoop?.[0]??B.backS))f.levelAt??=r.time;}
      else{
        if(f.levelAt==null){
          if(this.Move(recruit,level,eye,B.levelStandIn,B.backS>0?Distance(B.recruitAt,B.levelAt)/B.backS:C.speed.walk,{seconds:ClipLength(B.levelStandIn,1.1),ease:false}))f.levelAt=r.time;
        }else this.Hold(recruit,level,B.levelStandIn,{speed:C.speed.walk,seconds:ClipLength(B.levelStandIn,1.1)});
        if(r.time-f.backAt>B.backS+1.5&&f.levelAt==null){this.Put(recruit,level);f.levelAt=r.time;}
      }
    }
    if(f.backAt!=null&&!recruit)f.levelAt??=r.time;
    this.RecruitRifle();
    if(f.levelAt!=null&&r.time>=f.levelAt+B.levelS+B.chargeAfterLevelS){this.Stage("Charge");return;}
    this.BladeTimeout(age);
  }
  /** An actor's clip library id (CharacterRig.clipModelId: IJA06 plays IJA02's clips). */
  ClipModel(actor){const rig=actor?.actor?.characterRig;return rig?.clipModelId||rig?.modelId||null;}
  /**
   * IjaRecruitCheekCut's root (2026-10-11 integration, AnimB; once per Blade): the clip's player track `cheekL` at its `touch` on
   * the eye's left cheek (the presented camera: 6 cm left, 5 cm down, 4 cm ahead), the recruit standing blade.bearingDeg to the left
   * of the look (Report_animB: 25 deg left of the eye's front, ~1.45 m off). Before the library or without the track, recruitAt.
   */
  BladeRoot(){
    if(this.bladeRootMark)return this.bladeRootMark;
    const r=this.r,B=C.rescue.blade,ijaD=this.Ija("ijaD"),model=this.ClipModel(ijaD);
    const cheek=model&&OpeningClipMeta(B.clip)?OpeningPlayerPoint(model,B.clip,"cheekL",EventAt(B.clip,"touch",.708)):null;
    const cam=this.presentedCamera||r.player.camera;
    if(!cheek||!cam)return {...B.recruitAt,yaw:Face(B.recruitAt,C.shunzi.witnessEye)};
    const target=cam.position.clone().add(new THREE.Vector3(-.06,-.05,-.04).applyQuaternion(cam.quaternion));
    const fwd=new THREE.Vector3(0,0,-1).applyQuaternion(cam.quaternion),look=Math.atan2(-fwd.x,-fwd.z);
    // The root sits at T - Rot(yaw, cheek): pick the yaw whose root lies at the wanted bearing from the eye.
    const want=look+B.bearingDeg*DEG;let best=null;
    for(let i=0;i<720;i++){
      const yaw=i*Math.PI/360,o=Rot(yaw,cheek.x,cheek.z),root={x:target.x-o.x,z:target.z-o.z,yaw};
      const bearing=Math.atan2(-(root.x-cam.position.x),-(root.z-cam.position.z)),err=Math.abs(Wrap(bearing-want));
      if(!best||err<best.err)best={...root,err};
    }
    const {err,...root}=best;
    this.flags.bladeRootAt=`${root.x.toFixed(2)},${root.z.toFixed(2)},${(root.yaw/DEG).toFixed(0)}`;
    return this.bladeRootMark=root;
  }
  BladeTimeout(age){
    if(age<=C.timeouts.bladeS)return;
    if(this.flags["cut:cheek"]===undefined)this.CheekCut();
    this.Stage("Charge");
  }
  /** The cut on the cheek (once): flag cut:cheek, the sound at the face, the lens's cheek look, the flinch (Shot). */
  CheekCut(){
    const r=this.r,K=C.rescue.cheek;
    this.flags["touch:cheek"]??=r.time;
    this.flags["cut:cheek"]=r.time;
    // The Sfx package's cheekCut (sample only; its loudest at +0.35 s, the white flash on it): in the head, at the face.
    this.Sfx(K.cue,{position:r.Point(C.shunzi.witnessEye,.45),volume:K.volume,firstPerson:true});
    r.audio?.Deafen?.(.2);
  }
  /** The flinch from the blade (0 -> 1 -> 0): away in flinchS, back over recoverS. */
  CheekFlinch(){
    const at=this.flags["cut:cheek"];if(at==null)return 0;
    const t=this.r.time-at,K=C.rescue.cheek;
    if(t<0||t>K.flinchS+K.recoverS)return 0;
    return Smooth(t/K.flinchS)*(1-Smooth((t-K.flinchS)/K.recoverS));
  }
  /**
   * The recruit's rifle while he has no clip of his own for it (pendingWiring N21), laid over his pose after it is animated
   * (the director runs after the AI's animation pass): turned about his right hand so the barrel points at the target, and
   * for the cheek slid along the barrel so the bayonet's point lies on the eye's left cheek (pressed down it and trembling
   * after the cut). Modes by the director's clock: easing in over the touch, held, eased off after releaseS; from the step back
   * the muzzle aims at the eye (levelS) until the volley takes him. Nothing outside Blade / Charge or once he is hit.
   */
  RecruitRifle(){
    const r=this.r,B=C.rescue.blade,f=this.flags,ijaD=this.Ija("ijaD");
    if(!ijaD?.alive||f["hit:ijaD"]!=null||!["Blade","Charge"].includes(this.phase)||OpeningClipMeta(B.clip))return;
    const group=ijaD.actor?.weaponGroup,hand=ijaD.actor?.characterRig?.bones?.handR;
    if(!group?.parent||!hand)return;
    let k=0,target=null,slide=false;
    const cam=this.presentedCamera?.position||r.player.camera.position;
    if(f.backAt!=null){
      k=Smooth((r.time-f.backAt)/B.levelS);target=cam.clone();
    }else if(f.bladeAt!=null){
      const t=r.time-f.bladeAt;
      k=Smooth(t/B.touchS)*(1-Smooth((t-B.releaseS)/B.liftS));
      // The left cheek: beside and under the eye (camera frame: 6 cm left, 5 cm down, 4 cm ahead).
      const q=this.presentedCamera?.quaternion||r.player.camera.quaternion;
      target=cam.clone().add(new THREE.Vector3(-.06,-.05,-.04).applyQuaternion(q));
      const c=f["cut:cheek"];
      if(c!=null){const s=r.time-c;target.y-=B.pressM*Smooth(s/B.pressS);
        target.x+=B.shakeM*Math.sin(s*B.shakeHz*Math.PI*2);target.z+=B.shakeM*Math.cos(s*B.shakeHz*Math.PI*1.7);}
      slide=true;
    }
    if(!target||k<=1e-3)return;
    ijaD.actor.characterRig.root.updateMatrixWorld(true);
    group.updateWorldMatrix(true,false);
    const pos=new THREE.Vector3(),quat=new THREE.Quaternion(),scale=new THREE.Vector3();group.matrixWorld.decompose(pos,quat,scale);
    const pivot=hand.getWorldPosition(new THREE.Vector3());
    const tipLocal=ijaD.actor.weaponMuzzle.clone().add(new THREE.Vector3(0,-.006,-(WEAPONS[ijaD.actor.weaponId]?.bayonetLengthM||.395)));
    const tip=tipLocal.clone().applyMatrix4(group.matrixWorld);
    const from=tip.clone().sub(pivot).normalize(),to=target.clone().sub(pivot).normalize();
    const turn=new THREE.Quaternion().setFromUnitVectors(from,to);
    const partial=new THREE.Quaternion().slerp(turn,k);
    const newPos=pos.clone().sub(pivot).applyQuaternion(partial).add(pivot);
    const newQuat=partial.clone().multiply(quat);
    if(slide){
      const tipNow=tip.clone().sub(pivot).applyQuaternion(partial).add(pivot);
      const along=Math.max(-.6,Math.min(.6,target.clone().sub(pivot).length()-tipNow.clone().sub(pivot).length()));
      newPos.addScaledVector(to,along*k);
    }
    const world=new THREE.Matrix4().compose(newPos,newQuat,scale);
    const local=group.parent.matrixWorld.clone().invert().multiply(world);
    local.decompose(group.position,group.quaternion,group.scale);
    group.updateMatrixWorld(true);
  }
  /** Blood on the recruit's bayonet point from the practice (Dir01; pendingWiring N21): a small dark smear, made once. */
  RecruitBlood(actor){
    const group=actor?.actor?.weaponGroup;if(!group||this.recruitBlood?.parent===group)return;
    if(!this.recruitBloodMaterial){this.recruitBloodMaterial=new THREE.MeshStandardMaterial({color:0x3a0504,roughness:.32,metalness:.05});this.owned.push(this.recruitBloodMaterial);}
    const length=WEAPONS[actor.actor.weaponId]?.bayonetLengthM||.395,geometry=new THREE.BoxGeometry(.0175,.0255,length*.3);
    (this.ownedGeometry??=[]).push(geometry);
    this.recruitBlood?.removeFromParent();
    const mesh=this.recruitBlood=new THREE.Mesh(geometry,this.recruitBloodMaterial);mesh.name="OpeningRecruitBayonetBlood";
    mesh.position.copy(actor.actor.weaponMuzzle).add(new THREE.Vector3(0,-.006,-length*.83));
    group.add(mesh);
  }
  // ---- 02 the charge (2026-09-30, docs/Data_OpeningSelfRescue20260930.md) --------------------------------------------
  // User: 「应该是队友们先开枪击伤日军，日军手已经抬不起来拿枪了，再是班长和队友冲上来一刀砍死了这几个审问的日军和翻译，才接下面班长
  // 和主角的对话」. A volley from the crater step wounds the three over him (rescue.wound): each plays his wounded clip from the
  // hit and stands on its hold loop with the arm hanging dead; Luo and two of the company run down and cut them down from
  // behind (rescue.cuts, LuoDadaoChopRear round the wounded man's body); each falls the way the blade drives him.
  /** A man of the volley or the cuts by role ("ijaA".."ijaD", "interpreter", "DepthIjaB", the machine-gun crew "gunner" /
   *  "loader" by their roster ids). */
  Victim(role){
    if(role==="interpreter")return this.cast.interpreter||null;
    if(role==="DepthIjaB")return this.cast.DepthIjaB||null;
    const mg=C.rescue.mgCrew[role];if(mg)return this.r.enemies.get(mg.id)||null;
    return this.Ija(role);
  }
  /** A cutter by id: one of the charge's extras (rescue.extras) or a squad man. */
  Cutter(id){return C.rescue.extras.some(e=>e.id===id)?this.cast[id]:this.Squad(id);}
  /** Where a man stood when the volley's shot took him (his questioning mark; the recruit levelled at levelAt). */
  WoundStart(role){
    const R=C.rescue;
    if(role==="ijaA")return C.ija.crouch;
    if(role==="interpreter")return R.interpreter;
    if(role==="ijaD"){const at=this.bladeRootMark,end=at&&OpeningClipRoot(this.ClipModel(this.Ija("ijaD")),R.blade.levelClip)?.end;
      return end?Local(at,end[0],end[1],end[2]):{...R.blade.levelAt,yaw:Face(R.blade.levelAt,C.shunzi.witnessEye)};}
    if(R.mgCrew[role])return R.mgCrew[role].at;
    return R.vanguardPosts[role]||R.depthPost[role]||null;
  }
  /**
   * Where the shot has left him standing -- his body, round which his cut is staged: the start moved by his clip's root motion
   * (the pelvis at its last frame; rescue.wound standIn [right, back, turn deg] before the bake). His root stays on WoundStart
   * while the clip and its hold loop play; he is re-rooted under the pelvis when the blade takes him (CutDown).
   */
  WoundBody(role){
    const spec=C.rescue.wound.shots.find(s=>s.role===role),start=this.WoundStart(role);
    if(!start)return null;
    if(!spec?.clip)return {...start};
    const rig=this.Victim(role)?.actor?.characterRig,end=OpeningClipMeta(spec.clip)?OpeningClipRoot(rig?.clipModelId||rig?.modelId,spec.clip)?.end:null;
    return end?Local(start,end[0],end[1],end[2]):Local(start,...spec.standIn);
  }
  /** The wounded clip's hold loop starts this long after his hit (the cut lands no earlier). */
  WoundHoldS(role){const spec=C.rescue.wound.shots.find(s=>s.role===role),meta=spec?.clip&&OpeningClipMeta(spec.clip);return meta?.holdLoop?.[0]??1.9;}
  /**
   * 「队友们先开枪击伤日军」: the volley's aimed shots on the charge's clock (rescue.wound.shots). A hit man plays his clip from the
   * hit on his start root and stands on its hold loop (the arm hanging dead, the other hand on the wound) until the blade kills him
   * (posed every frame to the last: left alone for the cut's first 0.45 s the AI turned him 70 deg toward the shooters); before
   * the bake he limps to his wounded mark in the native gait.
   */
  Volley(){
    const r=this.r,W=C.rescue.wound,t=r.time-this.flags.chargeAt;
    for(const spec of W.shots){
      const actor=this.Victim(spec.role),key="hit:"+spec.role;
      if(this.flags[key]==null&&t>=spec.at&&actor?.alive&&!actor.openingStoryboardHidden){this.flags[key]=r.time;this.WoundShot(actor,spec);}
      if(!spec.clip||!actor?.alive||this.flags[key]==null)continue;
      if(this.Flee(spec.role))continue;
      if(spec.role==="ijaA"&&this.GrenadeBite(actor))continue;
      if(OpeningClipMeta(spec.clip)){const start=this.WoundStart(spec.role);this.Put(actor,start);this.Pose(actor,spec.clip,{seconds:r.time-this.flags[key],face:start.yaw});}
      else this.Hold(actor,this.WoundBody(spec.role),null,{speed:C.speed.creep});
    }
  }
  /** One of the volley's shots: flash and report up on the crater step, the tracer into the arm, the wound; not lethal (the
   *  narrative protection holds him for the cut) unless the spec says so. */
  WoundShot(actor,spec){
    const r=this.r,from=r.Point(spec.from,1.5),bone=actor.actor?.characterRig?.bones?.[spec.bone];
    // The gunner's gun stays on the corpse rest where his clip had it (the Set's world type11, let go there).
    if(spec.role==="gunner"&&this.Props?.Where("type11")?.state==="held")this.Props.Release("type11");
    const shown=!actor.renderLod||actor.renderLod==="detail";
    const aim=shown&&bone?bone.getWorldPosition(new THREE.Vector3()):this.AimPoint(actor),dir=aim.clone().sub(from).normalize();
    r.vfx?.MuzzleFlash?.(from.clone().addScaledVector(dir,.8),dir,{kind:"boltRifle"});r.vfx?.Tracer?.(from,aim,{kind:"nra"});
    r.audio?.PlayGunshot?.("rifleNra",{position:from,volume:1});
    r.vfx?.Blood?.(aim,dir,1);
    actor.openingDoomed=false;
    if(spec.lethal){actor.scriptEssential=false;actor.scriptedNoncombatant=false;this.FallNatively(actor,true);actor.TakeHit(1000,spec.part,dir,{kind:"bullet",weaponId:"HanYang",point:aim});if(actor.alive)this.Kill(actor,"bullet");return;}
    // Still the director's (scriptedNoncombatant): woken by the hit the AI turned him to face the shooters (09-30 run: his root
    // swung from 90 to 161 deg and the clip's walk away east went south into the wall, the body falling on the pinned man).
    actor.scriptEssential=true;actor.scriptedNoncombatant=true;
    actor.TakeHit(C.rescue.wound.damage,spec.part,dir,{kind:"bullet",weaponId:"HanYang",point:aim});
    actor.scriptedNoncombatant=true;actor.watchYaw=actor.yaw;actor.watchUntil=this.r.ai.time+30;
  }
  /**
   * 「班长和队友冲上来一刀砍死」: each cutter (rescue.cuts) runs down the crater step to the chopRear mark behind his wounded man
   * and cuts him down (LuoDadaoChopRear; its cut lands no earlier than the man's hold loop, so he has turned away with the arm
   * hanging); the blade kills at the cut contact and he falls the way the blow drives him (CutDown).
   */
  Cuts(){
    const r=this.r,R=C.rescue,contact=ContactAt("LuoDadaoChopRear","cut",.45),length=ClipLength("LuoDadaoChopRear",1.3);
    for(const cut of R.cuts){
      const actor=this.Cutter(cut.by),victim=this.Victim(cut.victim),key="cut:"+cut.victim;
      if(!actor)continue;
      const delay=cut.by==="luo"?R.delayS.luo:R.extras.find(e=>e.id===cut.by)?.delayS??1;
      const body=this.CutBody(cut.victim),mark=body&&this.StageRoot("chopRear","luo",body);
      // A fleeing man (cut.fleeM): the cutter waits behind him where he stands wounded (chopRear round his unfled body) and
      // follows him the two steps to the chop mark (flag chop:<victim>), the chop starting as he gets there.
      const fleeing=!!cut.fleeM&&!!mark,wait=fleeing?this.StageRoot("chopRear","luo",this.WoundBody(cut.victim)):mark;
      if(this.flags[key]==null){
        if(!mark)continue;
        const arrived=this.ChargeRun(actor,"charge:"+cut.by,wait,delay,{strike:true}),forced=this.flags.chargeForced!=null;
        const shot=this.flags["hit:"+cut.victim];
        // After the named cut has landed (gapS): 「罗班长……一刀劈在他后颈」 first, then 「一名冲锋弟兄砍倒想跑的翻译」.
        const before=cut.after?this.flags["cut:"+cut.after]:null,afterOk=!cut.after||!this.Victim(cut.after)?.alive&&(before==null||r.time>=before+contact+cut.gapS);
        const ready=!victim?.alive||shot!=null&&r.time-shot+contact>=this.CutReadyS(cut.victim)&&afterOk;
        if(!(arrived||forced))continue;
        if(!ready&&!forced){this.Settle(actor,wait);this.Pose(actor,null,{face:wait.yaw});continue;}
        if(!arrived){this.Show(actor);this.Put(actor,wait);}
        this.flags[key]=r.time;if(!fleeing)this.PlayClip(actor,"LuoDadaoChopRear",{restart:true});
        continue;
      }
      let start=this.flags[key];
      if(fleeing){
        if(this.flags["chop:"+cut.victim]==null){
          const there=this.Move(actor,mark,mark.yaw,null,cut.fleeMps*1.1,{ease:false});
          if(!there&&r.time-start<1.2)continue;
          this.flags["chop:"+cut.victim]=r.time;this.PlayClip(actor,"LuoDadaoChopRear",{restart:true});
        }
        start=this.flags["chop:"+cut.victim];
      }
      const t=r.time-start;
      if(t<length){this.Settle(actor,mark);this.Pose(actor,"LuoDadaoChopRear",{seconds:t});}
      else this.AfterCut(cut.by,actor);
      if(t>=contact&&victim?.alive)this.CutDown(victim,actor,cut.victim);
      if(t>=contact+C.timeouts.contactKillS&&victim?.alive)this.Kill(victim);
    }
    this.NoteMeleeResolved();
  }
  /** vanguardMeleeResolved (name and threshold kept, contract §1.17): ijaA and ijaB down (ijaB missing from the table counts). */
  NoteMeleeResolved(){
    const r=this.r,a=this.Ija("ijaA"),b=this.Ija("ijaB");
    if(a&&!a.alive&&(!b||!b.alive)&&!r.Has("vanguardMeleeResolved"))r.Record("vanguardMeleeResolved",b?{}:{absent:"ijaB"});
  }
  /** His cut lands no earlier than this long after his hit: the wounded clip's hold loop; ijaA's grenade beat first (rescue.grenade). */
  CutReadyS(role){return role==="ijaA"?Math.max(this.WoundHoldS(role),C.rescue.grenade.readyS):this.WoundHoldS(role);}
  /** Where the blade takes him: his wounded body, carried on by his flight for a cut with fleeM (the interpreter's two steps east). */
  CutBody(role){
    const body=this.WoundBody(role),cut=C.rescue.cuts.find(c=>c.victim===role);
    if(!body||!cut?.fleeM)return body;
    return Local(body,0,-cut.fleeM);
  }
  /** The interpreter's two steps of flight as his cut starts (cut.fleeM at fleeMps from where his wounded clip left him), posed
   *  every frame until the blade takes him (CutDown). */
  Flee(role){
    const r=this.r,cut=C.rescue.cuts.find(c=>c.victim===role),victim=this.Victim(role),key="cut:"+role;
    if(!cut?.fleeM||!victim?.alive||this.flags[key]==null)return false;
    if(!this.flags["fled:"+role]){this.flags["fled:"+role]=r.time;this.RerootUnderPelvis(victim,this.WoundBody(role).yaw);if(victim===this.cast.interpreter)SetRelaxedGait(victim,"unarmed");}
    const to=this.CutBody(role);
    this.Move(victim,to,to.yaw,null,cut.fleeMps,{ease:false});
    return true;
  }
  /** The blade takes him: re-rooted under his pelvis (his wounded clip carried him off his root), off the director's pose and
   *  down on the native directional death (the blade's hit picks the fall, docs/Data_HitReaction.md). */
  CutDown(victim,attacker,role){
    const pelvis=victim.actor?.characterRig?.bones?.pelvis?.getWorldPosition(new THREE.Vector3()),body=this.WoundBody(role);
    if(pelvis)this.Put(victim,{x:pelvis.x,z:pelvis.z,yaw:body?.yaw??victim.yaw},{noBlend:true,keep:true});
    this.BladeKill(victim,attacker,{natural:true});this.Blood(victim,"neck");
  }
  /** A cutter once his cut has played out: Luo is the hand-over's (LuoToHand); an extra goes on to his post east down the
   *  trench (rescue.extras post). */
  AfterCut(id,actor){
    if(id==="luo")return;
    const spec=C.rescue.extras.find(e=>e.id===id);if(!spec)return;
    if(!this.flags["rerooted:"+id]){this.flags["rerooted:"+id]=true;this.RerootUnderPelvis(actor,actor.yaw);}
    const post=spec.post?{...spec.post,yaw:spec.post.yaw??-Math.PI/2}:null;
    if(!post){this.Pose(actor,null);return;}
    if(actor.openingWalk?.key!=="post"||!actor.openingWalk.done){if(this.Follow(actor,"post",[post],C.speed.run,null,post.yaw))actor.openingWalk.done=true;return;}
    this.Pose(actor,null,{face:post.yaw});
    const late=this.releaseAt!=null&&this.r.time-this.releaseAt>C.rescue.extrasRetireS;
    if(this.phase==="Released"&&(!InCameraView(this.r.player.camera,this.r.Point(actor.position,1),10)||late))this.RetireCharge(id);
  }
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
  /** He runs down with the charge and on to the roof timber (lift.heLift), where he waits with his hands under it (HeLiftTimber's
   *  first frame) until the lift (HeTimber owns him from then). */
  HeToTimber(){
    const he=this.Squad("heyoutian"),L=C.rescue.lift,f=this.flags;
    if(!he||f.liftAt!=null)return f.heAtTimber!=null;
    if(f.heAtTimber==null){if(this.ChargeRun(he,"charge",L.heLift,C.rescue.delayS.he))f.heAtTimber=this.r.time;return f.heAtTimber!=null;}
    this.Put(he,L.heLift);this.Pose(he,OpeningClipMeta("HeLiftTimber")?"HeLiftTimber":null,{seconds:0,face:L.heLift.yaw});
    return true;
  }
  PhaseCharge(age){
    const r=this.r,R=C.rescue,ijaA=this.Ija("ijaA"),interp=this.cast.interpreter;
    if(!this.phaseEntered){
      // 2026-10-11 (「没有号声。台阶上先响了一排枪。」): no bugle; 「有敌人！」 goes with the first shot (rescue.wound at 0).
      this.phaseEntered=true;this.flags.chargeAt=r.time;this.chargeLook=null;
      if(interp)this.Scene("RescueFlee",r.voice?.PlayScene("RescueFlee",{speakers:this.Speakers()}));
      for(const blow of this.slaps||[])blow.landed=true;
    }
    this.ChargeNoise();
    this.ComradeCorpse();
    this.DepthIja();
    // Until his shot each man keeps the questioning's pose: ijaA's hold, the interpreter's squat, the recruit levelled at the
    // eye, ijaB on the junction (until the long shot turns him), ijaC at the fold (until FoldFight turns him).
    if(ijaA?.alive&&this.flags["hit:ijaA"]==null)this.PoseHolder(ijaA);
    if(interp?.alive&&this.flags["hit:interpreter"]==null)this.InterpreterToSquat();
    this.RecruitLevelled();this.HoldMgCrew();
    this.Volley();this.Cuts();this.Grenade();this.HeToTimber();this.LuoToHand();
    this.ChargeExtras();
    this.LongShotTick();this.FoldFight();
    this.RecruitRifle();
    if(R.cuts.every(c=>this.flags["cut:"+c.victim]!=null||!this.Victim(c.victim)))this.Stage("Melee");
    else if(age>C.timeouts.chargeS){this.flags.chargeForced=r.time;}
  }
  /** The recruit levelled at the eye on levelAt until the volley's shot takes him (Blade's last pose). */
  RecruitLevelled(){
    const B=C.rescue.blade,ijaD=this.Ija("ijaD");
    if(!ijaD?.alive||this.flags["hit:ijaD"]!=null)return;
    const level={...B.levelAt,yaw:Face(B.levelAt,C.shunzi.witnessEye)},clip=OpeningClipMeta(B.levelClip)?B.levelClip:null;
    if(clip){const at=this.BladeRoot();this.Put(ijaD,at);this.Pose(ijaD,clip,{seconds:this.r.time-(this.flags.backAt??this.r.time),face:at.yaw});}
    else this.Hold(ijaD,level,B.levelStandIn,{speed:C.speed.walk,seconds:ClipLength(B.levelStandIn,1.1)});
  }
  /** IjaGrenadeBitePin chained from IjaShotStaggerAway's end once its hold loop is reached (when baked; true while it poses him). */
  GrenadeBite(actor){
    const clip="IjaGrenadeBitePin";if(!OpeningClipMeta(clip))return false;
    const hit=this.flags["hit:ijaA"],hold=this.WoundHoldS("ijaA");if(hit==null||this.r.time-hit<hold)return false;
    const rig=actor.actor.characterRig,root=this.ChainRoot(this.WoundStart("ijaA"),rig?.clipModelId||rig?.modelId,"IjaShotStaggerAway",clip);
    this.Put(actor,root);this.Pose(actor,clip,{seconds:this.r.time-hit-hold,face:root.yaw});
    return true;
  }
  /**
   * 2026-10-11 (「甲用右手摸出手榴弹，牙咬掉保险销……罗班长……一刀劈在他后颈。那颗没磕响的手榴弹滚到顺子脸前停住。」, rescue.grenade):
   * the grenade in ijaA's right hand from drawS after his hit, the pin pulled at biteS (grenadePin); the blade drops it -- it
   * falls from the hand, bounces twice (grenadeBounce), rolls rollS and lies at rescue.grenade.stop (flags.grenadeStopAt) until
   * 01–02 is left. It never goes off. 2026-10-11 integration: the prop is the Set's `grenade` (Type 91): drawn by
   * IjaGrenadeBitePin's own track in his fist (OpeningWorldProps.Hold keeps the world one hidden while it is), thrown down from
   * the hand by OpeningWorldProps.Toss to finish.grenadeStop (grenadeBounce on the bounces); GrenadeStandIn without the Set.
   */
  Grenade(){
    const r=this.r,G=C.rescue.grenade,f=this.flags,ijaA=this.Ija("ijaA"),hit=f["hit:ijaA"],props=this.Props;
    if(hit==null&&f.grenadeDropAt==null)return;
    if(!props)return this.GrenadeStandIn();
    const h=props.Get("grenade");this.grenadeProp=h.object;
    if(f.grenadeDropAt!=null)return;
    const clip=OpeningClipMeta("IjaGrenadeBitePin")?"IjaGrenadeBitePin":null;
    const draw=hit+(clip?this.WoundHoldS("ijaA"):G.drawS),bite=clip?hit+this.WoundHoldS("ijaA")+EventAt(clip,"bite",.6):hit+G.biteS;
    if(r.time<draw||!ijaA){if(h.state!=="held")props.Hide("grenade");return;}
    if(ijaA.alive){
      if(h.state!=="held"||h.holder?.actor!==ijaA.actor)props.Hold("grenade",ijaA);
      if(r.time>=bite&&f.grenadeBiteAt==null){f.grenadeBiteAt=r.time;r.audio?.Play?.(G.pin,{position:h.object.getWorldPosition(new THREE.Vector3()),volume:.85});}
      return;
    }
    // He is down (the blade, or anything else): it falls from his hand, bounces twice and rolls to his face.
    f.grenadeDropAt=r.time;
    const stop=SET_MARKS.finish.grenadeStop;
    props.Toss("grenade",{from:"holder",to:{x:stop.x,z:stop.z},seconds:G.tossS,arcM:G.tossArcM,bounces:2,bounceM:G.bounceH,rollM:G.rollM,rollS:G.rollS,
      onBounce:(i)=>{const key=i===0?"grenadeBounce1":i===1?"grenadeBounce2":null;
        if(key&&f[key]==null){f[key]=r.time;r.audio?.Play?.(G.bounce,{position:h.object.getWorldPosition(new THREE.Vector3()),volume:i?.6:.9});}},
      onRest:()=>{f.grenadeStopAt=r.time;const p=h.object.getWorldPosition(new THREE.Vector3());f.grenadeStopX=+p.x.toFixed(3);f.grenadeStopZ=+p.z.toFixed(3);}});
  }
  /** The director's own grenade (no Set: a debug page or a node probe): drawn into his hand, dropped and rolled by hand. */
  GrenadeStandIn(){
    const r=this.r,G=C.rescue.grenade,f=this.flags,ijaA=this.Ija("ijaA"),hit=f["hit:ijaA"];
    const prop=this.GrenadeProp();
    if(f.grenadeDropAt==null){
      const clip=OpeningClipMeta("IjaGrenadeBitePin")?"IjaGrenadeBitePin":null;
      const draw=hit+(clip?this.WoundHoldS("ijaA"):G.drawS),bite=clip?hit+this.WoundHoldS("ijaA")+EventAt(clip,"bite",.6):hit+G.biteS;
      const hand=ijaA?.actor?.characterRig?.bones?.handR;
      if(r.time<draw||!hand){prop.visible=false;return;}
      if(ijaA?.alive){
        prop.visible=true;
        hand.getWorldPosition(prop.position);prop.position.y+=.02;
        prop.quaternion.copy(hand.getWorldQuaternion(new THREE.Quaternion()));
        if(r.time>=bite&&f.grenadeBiteAt==null){f.grenadeBiteAt=r.time;r.audio?.Play?.(G.pin,{position:prop.position.clone(),volume:.85});}
        return;
      }
      // He is down (the blade, or anything else): it falls from where it was.
      f.grenadeDropAt=r.time;this.grenadeFrom=prop.position.clone();this.grenadeFromQ=prop.quaternion.clone();
    }
    // The fall, two bounces, the roll (world, on the ground under it).
    const from=this.grenadeFrom,stop=G.stop,ground=p=>r.battlefield.GroundHeight(p.x,p.z)+G.radiusM;
    const g=9.8,fallS=Math.sqrt(Math.max(.02,2*Math.max(0,from.y-ground(from))/g));
    const land1={x:from.x+(stop.x-from.x)*.25,z:from.z+(stop.z-from.z)*.25},land2={x:from.x+(stop.x-from.x)*.45,z:from.z+(stop.z-from.z)*.45};
    const t=r.time-f.grenadeDropAt;let x,z,y,spin=0;
    if(t<fallS){const k=t/fallS;x=from.x+(land1.x-from.x)*k;z=from.z+(land1.z-from.z)*k;y=from.y-.5*g*t*t;y=Math.max(y,ground({x,z}));}
    else if(t<fallS+G.bounceS){const k=(t-fallS)/G.bounceS;x=land1.x+(land2.x-land1.x)*k;z=land1.z+(land2.z-land1.z)*k;y=ground({x,z})+G.bounceH*4*k*(1-k);}
    else{const k=Math.min(1,(t-fallS-G.bounceS)/G.rollS),e=1-(1-k)*(1-k);x=land2.x+(stop.x-land2.x)*e;z=land2.z+(stop.z-land2.z)*e;y=ground({x,z});spin=e;}
    if(t>=fallS&&!f.grenadeBounce1){f.grenadeBounce1=r.time;r.audio?.Play?.(G.bounce,{position:r.Point(land1,.05),volume:.9});}
    if(t>=fallS+G.bounceS&&!f.grenadeBounce2){f.grenadeBounce2=r.time;r.audio?.Play?.(G.bounce,{position:r.Point(land2,.05),volume:.6});}
    if(t>=fallS+G.bounceS+G.rollS&&f.grenadeStopAt==null){f.grenadeStopAt=r.time;f.grenadeStopX=+x.toFixed(3);f.grenadeStopZ=+z.toFixed(3);}
    prop.visible=true;prop.position.set(x,y,z);
    // Lying on its side, rolled along the way it goes.
    const heading=Math.atan2(stop.x-from.x,stop.z-from.z);
    const lying=new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI/2,heading+Math.PI/2,0,"YXZ"));
    const rolled=lying.clone().multiply(new THREE.Quaternion().setFromAxisAngle(UP,spin*Distance(land2,stop)/G.radiusM));
    prop.quaternion.copy(t<fallS?this.grenadeFromQ.clone().slerp(lying,t/fallS):rolled);
  }
  /** The director's stand-in Type 91 grenade (segmented olive cylinder with a fuse cap), made once, removed with 01–02. */
  GrenadeProp(){
    if(this.grenadeProp?.name==="OpeningRescueGrenade")return this.grenadeProp;
    const G=C.rescue.grenade,group=new THREE.Group();group.name="OpeningRescueGrenade";
    const body=new THREE.MeshStandardMaterial({color:0x3d4128,roughness:.62,metalness:.35}),cap=new THREE.MeshStandardMaterial({color:0x6f6a55,roughness:.45,metalness:.6});
    this.owned.push(body,cap);
    for(let i=0;i<3;i++){const geometry=new THREE.CylinderGeometry(G.radiusM,G.radiusM,G.lengthM*.26,12);(this.ownedGeometry??=[]).push(geometry);
      const m=new THREE.Mesh(geometry,body);m.position.y=(i-1)*G.lengthM*.3;group.add(m);}
    const fuse=new THREE.CylinderGeometry(G.radiusM*.45,G.radiusM*.55,G.lengthM*.22,10);this.ownedGeometry.push(fuse);
    const top=new THREE.Mesh(fuse,cap);top.position.y=G.lengthM*.5;group.add(top);
    group.visible=false;this.r.scene.add(group);
    return this.grenadeProp=group;
  }
  RemoveGrenadeProp(){if(this.grenadeProp?.name==="OpeningRescueGrenade")this.grenadeProp.removeFromParent();this.grenadeProp=null;}
  /**
   * The fold man (rescue.fold, 「丙在折角原地转身，跪着朝台阶开枪，冲在最前面的一名川军弟兄身子一歪，滚下台阶」 / 「丙随后被台阶上的枪
   * 打倒」): from turnAtS he turns round on F toward the step; when the first man down (extras foldTarget) is within fireWithinM of
   * his post (at the latest fireForceS) he kneels into IjaCornerFire facing him and its shot drops him. The rifles on the step
   * (extras shootsFold) fire at him from returnFireS; past longShotForceS + .5 he is killed (flags.foldBy says by whom).
   */
  FoldFight(){
    const r=this.r,R=C.rescue,F=R.fold,f=this.flags,ijaC=this.Ija("ijaC");
    if(f.chargeAt==null)return;
    const t=r.time-f.chargeAt,spec=R.extras.find(e=>e.foldTarget),target=spec&&this.cast[spec.id];
    if(ijaC?.alive&&!ijaC.openingCombatReleased){
      const at=ijaC.openingStoryboardLast||ijaC.position;
      const aimAt=target?.alive&&!target.openingStoryboardHidden?(target.openingStoryboardLast||target.position):R.liuShot;
      const face=Face(at,aimAt);
      if(t<F.turnAtS)this.Pose(ijaC,"IjaReadyRifle",{seconds:ClipLength("IjaReadyRifle",1.1),face:R.vanguardPosts.ijaC.yaw});
      else if(f.foldFireAt==null){
        this.Pose(ijaC,null,{face});
        const near=target?.alive&&spec.post&&Distance(target.openingStoryboardLast||target.position,spec.post)<=F.fireWithinM;
        const turned=Math.abs(Wrap(ijaC.yaw-face))<.25;
        if(turned&&(near||t>=F.fireForceS)){f.foldFireAt=r.time;this.PlayClip(ijaC,"IjaCornerFire",{restart:true});}
      }else{
        // IjaCornerFire is authored turned ~26 deg to the right of its root: face the root that far left of the target.
        const s=r.time-f.foldFireAt;this.Pose(ijaC,"IjaCornerFire",{seconds:s,face:face+(OpeningClipRoot("TengxianIja01","IjaCornerFire")?.start?.[2]??-25.78)*-DEG});
        if(s>=EventAt("IjaCornerFire","fire",F.fireS)&&!f.foldFired){
          f.foldFired=r.time;
          if(target?.alive){this.FoldShot(ijaC,target);f.chargeBDownAt=r.time;}
          else this.FireRifle(ijaC,r.Point(R.liuShot,1.2),true);
        }
      }
    }
    // The rifles on the step answer him.
    if(ijaC?.alive)for(const shooter of R.extras.filter(e=>e.shootsFold)){
      const actor=this.cast[shooter.id],key="foldShot:"+shooter.id,there=f["post:"+shooter.id];
      if(!actor?.alive||f[key]!=null||there==null)continue;
      const order=R.extras.filter(e=>e.shootsFold).indexOf(shooter);
      if(t<F.returnFireS+order*F.returnFireGapS||r.time-there<.6)continue;
      f[key]=r.time;
      if(this.ShootAt(actor,ijaC,false))f.foldBy??=shooter.id;
    }
    if(ijaC?.alive&&t>=C.timeouts.longShotForceS+.5){this.Kill(ijaC,"bullet");f.foldBy??="forced";}
    if(ijaC&&!ijaC.alive)f.foldDownAt??=r.time;
  }
  /** The fold man's shot into the first man down the step: report, flash, tracer, and he falls the way it drives him (his
   *  authored tumble NraShotTumbleSteps when it is baked, pendingWiring N22). */
  FoldShot(shooter,target){
    const r=this.r,aim=this.AimPoint(target),from=shooter.actor.MuzzleWorld(new THREE.Vector3()),dir=aim.clone().sub(from).normalize();
    this.FireRifle(shooter,aim,false);
    r.vfx?.Blood?.(aim,dir,1);
    target.scriptEssential=false;target.scriptedNoncombatant=false;
    const clip=OpeningClipMeta("NraShotTumbleSteps")?"NraShotTumbleSteps":null;
    if(clip){target.openingDoomed=true;this.PlayClip(target,clip,{restart:true});target.openingStoryboardPose={clip,seconds:0};}
    else{target.openingDoomed=false;this.FallNatively(target,true);}
    target.TakeHit(1000,"torso",dir,{kind:"bullet",weaponId:"Type38",point:aim});
    if(target.alive)this.Kill(target,"bullet");
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
  /** 「一大帮人」: the company's men without a cut run down the step and on east to their posts facing east; out of sight
   *  later they are removed (the cutters are Cuts'). */
  ChargeExtras(){
    const R=C.rescue;
    if(this.flags.chargeAt==null)return;
    for(const spec of R.extras){
      const actor=this.cast[spec.id];if(!actor||R.cuts.some(c=>c.by===spec.id))continue;
      // The first man down (foldTarget) lies where the fold man's shot dropped him.
      if(!actor.alive)continue;
      this.ExtraPost(actor,spec,spec.post);
    }
  }
  ExtraPost(actor,spec,post){
    if(!actor.alive)return;
    const mark={...post,yaw:post.yaw??-Math.PI/2};
    if(this.ChargeRun(actor,"charge:"+spec.id,mark,spec.delayS)){
      this.flags["post:"+spec.id]??=this.r.time;
      // The rifles on the step aim at the fold man (FoldFight fires them).
      const fold=spec.shootsFold&&this.Ija("ijaC")?.alive?Face(mark,C.rescue.vanguardPosts.ijaC):mark.yaw;
      this.Pose(actor,null,{face:fold,aim:spec.shootsFold?.6:0});
      // Out of the picture once they have gone on (a hand-back later than extrasRetireS after the charge removes them anyway).
      const late=this.releaseAt!=null&&this.r.time-this.releaseAt>C.rescue.extrasRetireS;
      if(this.phase==="Released"&&(!InCameraView(this.r.player.camera,this.r.Point(actor.position,1),10)||late))this.RetireCharge(spec.id);
    }
  }
  RetireCharge(id){this.flags["gone:"+id]=true;this.RetireWalker(id);}
  PhaseMelee(age){
    const r=this.r,R=C.rescue,f=this.flags;
    this.ChargeNoise();
    this.ComradeCorpse();
    this.DepthIja();
    this.RecruitLevelled();
    this.Volley();this.Cuts();this.Grenade();this.HeToTimber();this.LuoToHand();this.ChargeExtras();this.LongShotTick();this.FoldFight();
    // 2026-10-11 (「还权前确认甲、丁、翻译、岔口的乙、折角的丙和机枪组两人均已死亡」): the heave waits for all of them down (a man
    // missing from the enemy table is let pass) and for the grenade to have come to rest and been looked at.
    const done=R.cuts.every(c=>!this.Victim(c.victim)?.alive)&&this.VanguardDown();
    const last=Math.max(...R.cuts.map(c=>(f["cut:"+c.victim]??r.time)+ContactAt("LuoDadaoChopRear","cut",.45)));
    const grenade=f.grenadeDropAt==null&&f["hit:ijaA"]==null||f.grenadeStopAt!=null&&r.time>=f.grenadeStopAt+R.grenadeLookS;
    if(done&&grenade&&r.time>=last+R.meleeHoldS){f.meleeDoneAt=r.time;this.NoteFalls();this.Stage("Lift");}
    else if(age>C.timeouts.meleeS){
      for(const c of R.cuts)this.Kill(this.Victim(c.victim));
      for(const id of C.vanguardIds)this.Kill(r.enemies.get(id),id==="BunkerExecutionerA"?"melee":"bullet");
      if(!r.Has("vanguardMeleeResolved"))r.Record("vanguardMeleeResolved",{forced:true});
      f.meleeForced=r.time;this.Stage("Lift");
    }
  }
  /** Where the volley's and the blades' dead lie (pelvis, flags fall:<role> = "x,z"): the heave must keep off them. */
  NoteFalls(){
    for(const role of ["ijaA","ijaB","ijaC","ijaD","interpreter","gunner","loader","ChargeB"]){
      const actor=role==="ChargeB"?this.cast.ChargeB:this.Victim(role),p=actor?.actor?.characterRig?.bones?.pelvis?.getWorldPosition(new THREE.Vector3());
      if(p&&!actor.alive)this.flags["fall:"+role]=`${p.x.toFixed(2)},${p.z.toFixed(2)}`;
    }
  }
  /** Every man of vanguardIds is dead or missing from the enemy table. */
  VanguardDown(){return C.vanguardIds.every(id=>!this.r.enemies.get(id)?.alive);}
  /**
   * 2026-09-30 (user: 「不要班长把玩家拖出来了，直接玩家自己往前用力一声腾挪就出来就行」): He heaves the roof timber off his hips
   * (HeTimber); once it is up Shunzi braces on both hands and, with a grunt, heaves himself forward out from under it and up onto
   * his knees (rescue.heave: his eye rides those keys, RescueBody). He lets the timber drop once the boots are out. Luo comes from
   * his cut to stand in front of him (LuoToHand).
   */
  PhaseLift(age){
    const r=this.r,H=C.rescue.heave,L=C.rescue.lift,f=this.flags,he=this.Squad("heyoutian");
    if(!this.phaseEntered)this.phaseEntered=true;
    this.ChargeNoise();
    this.ComradeCorpse();this.Volley();this.Cuts();this.Grenade();this.ChargeExtras();this.LongShotTick();this.FoldFight();this.DepthIja();
    const heThere=this.HeToTimber();
    if(f.liftAt==null&&(heThere||age>C.timeouts.heArriveS)){
      if(!heThere&&he){this.Show(he);this.Put(he,L.heLift);}
      f.liftAt=r.time;r.audio?.Play?.("debrisFall",{position:r.Point(C.shunzi.pinnedHips,.4),volume:.55});
    }
    this.HeTimber();
    const stepIn=f.heaveAt!=null&&r.time-f.heaveAt>=C.rescue.hand.stepInS;
    this.LuoToHand(stepIn);
    // 「还能打不？」 goes as he steps in: the take opens on his panting from the charge (1.4 s), the words land as he leans in.
    if(stepIn)this.AskCheck();
    // 「用力一声」: the grunt of the heave, his own (first person), timed off the heave (gruntS may lead it).
    if(f.liftAt!=null&&!f.grunted&&r.time-f.liftAt>=L.gripS+L.raiseS+H.gruntS){f.grunted=true;
      this.Scene("RescueHeave",r.voice?.PlayScene("RescueHeave",{speakers:this.Speakers()}));
      if(!this.scenes.RescueHeave)r.audio?.Play?.("hitGrunt",{position:r.Point(C.shunzi.witnessEye,.4),volume:.9});}
    if(f.liftAt!=null&&f.heaveAt==null&&r.time-f.liftAt>=L.gripS+L.raiseS)f.heaveAt=r.time;
    if(f.heaveAt==null)return;
    const h=r.time-f.heaveAt;
    const body=this.RescueBody();
    if(body?.heelL&&body.heelR){
      const out=Math.min(body.heelL.x,body.heelR.x);
      f.heelFromX??=out;
      if(f.dropAt==null&&out>=H.timberEastX+H.dropPastM){f.dropAt=r.time;f.dropClipS=r.time-(f.liftAt??r.time);}
    }
    if(h>=H.durationS||age>C.timeouts.liftS){
      if(f.dropAt==null){f.dropAt=r.time;f.dropClipS=r.time-(f.liftAt??r.time);}
      // The knees ploughed two furrows out of the doorway.
      const z=C.shunzi.witnessEye.z,to=body?.heelL?Math.min(body.heelL.x,body.heelR.x):C.shunzi.pinnedHips.x+.9;
      this.MudMarks(this.Densify([{x:f.heelFromX??C.shunzi.pinnedHips.x-.9,z},{x:to,z}]),{offsets:[-.12,.12],width:.07});
      if(!r.Has("luoRescueComplete")&&r.Has("vanguardMeleeResolved"))r.Record("luoRescueComplete");
      this.Stage("Check");
    }
  }
  /** He on the timber from the heave until he has let it drop (Lift and the start of Check): HeLiftTimber held until
   *  dropClipS, then its release; the Set's timber rides up and falls back. */
  HeTimber(){
    const r=this.r,L=C.rescue.lift,f=this.flags,he=this.Squad("heyoutian");
    if(f.liftAt==null){this.RoofLift(0);return;}
    if(f.heTimberDone)return;
    const t=r.time-f.liftAt,heClip=OpeningClipMeta("HeLiftTimber")?"HeLiftTimber":"PullComrade";
    if(he){this.Put(he,L.heLift);this.Pose(he,heClip,{seconds:t,holdUntil:f.dropClipS});}
    const drop=f.dropAt!=null?Smooth((r.time-f.dropAt)/.25):0;
    if(drop>=.95&&!f.dropped){f.dropped=true;r.audio?.Play?.("debrisFall",{position:r.Point(C.shunzi.pinnedHips,.3),volume:.7});}
    this.RoofLift(Smooth((t-L.gripS)/L.raiseS)*(1-drop)*L.raise);
    if(f.dropAt!=null&&r.time-f.dropAt>=L.letGoS){f.heTimberDone=true;this.RoofLift(0);}
  }
  /** The roof timber lifted off him by `k` (0 on him .. 1 up at its hang): the Set poses it. */
  RoofLift(k){this.roofLift=k;this.r.openingSet?.LiftRoofTimber?.(k);}
  /** The heave's frame: the pinned eye, facing east down the trench (rescue.heave.body, rescue.hand.rise). */
  HeaveRoot(){const S=C.shunzi.witnessEye;return {x:S.x,z:S.z,yaw:-Math.PI/2};}
  /** Luo's root for the hand-over: rescue.hand.frontM in front of the kneeling man's eye (the heave's last key), facing him. */
  HandRoot(){
    const root=this.HeaveRoot(),end=C.rescue.heave.body.eye.at(-1)[1],eye=Local(root,end[0],end[2]);
    return Local({x:eye.x,z:eye.z,yaw:root.yaw},0,-C.rescue.hand.frontM,180);
  }
  /** Luo from his cut to HandRoot, where he stands on LuoGrabRifleShove's first frame (the dadao still in his hand); true once
   *  there. Until stepIn (the heave has brought the knees under him) he waits aside (hand.waitSide), facing him. */
  LuoToHand(stepIn=false){
    const luo=this.Squad("luo"),f=this.flags,H=C.rescue.hand,root=this.HandRoot();
    if(!luo)return true;
    const cut=f["cut:ijaA"];
    if(cut==null||this.r.time-cut<ClipLength("LuoDadaoChopRear",1.3))return false;
    if(!f.luoRerooted){f.luoRerooted=true;this.RerootUnderPelvis(luo,luo.yaw);}
    const clip=OpeningClipMeta("LuoGrabRifleShove")?"LuoGrabRifleShove":null;
    if(f.luoAtHand==null){
      if(!stepIn){const wait=Local(root,-H.waitSide[0],H.waitSide[1]);this.Hold(luo,{...wait,yaw:Face(wait,Local(root,0,-H.frontM))},null,{speed:C.speed.walk});return false;}
      if(this.Hold(luo,root,null,{speed:C.speed.walk}))f.luoAtHand=this.r.time;
      else return false;
    }
    if(f.handAt==null){this.Put(luo,root);this.Pose(luo,clip,{seconds:0,face:root.yaw});}
    // The rifle he will snatch up is his clip's prop from here (its first frame lies where the mission rifle lies).
    if(clip&&this.r.bunkerRifle?.view)this.r.bunkerRifle.view.visible=false;
    return true;
  }
  /** Luo's 「还能打不？」 (once); its end is the nod's cue (flags.checkLineAt). */
  AskCheck(){
    const r=this.r,f=this.flags,luo=this.Squad("luo");
    // His eyes on Shunzi's from here (the speaker binder would put them on whoever else is talking -- the yells up and down
    // the trench: 「眼珠子也不知道在动什么」).
    if(luo)luo.voiceGaze??=()=>r.player.camera.getWorldPosition(new THREE.Vector3());
    if(!this.Started("RescueCheck"))this.Scene("RescueCheck",r.voice?.PlayScene("RescueCheck",{speakers:this.Speakers(),onEnd:()=>{f.checkLineAt=r.time;}}));
  }
  /** LuoGrabRifleShove's clip time for `t` s on the director's clock (its hold loop until the nod lets it go). */
  HandSeconds(t){
    const meta=OpeningClipMeta("LuoGrabRifleShove"),S=C.rescue.hand.standIn;
    return OpeningHoldTime(meta?.holdLoop??S.holdLoop,meta?.duration??S.durationS,t,this.flags.handHoldUntil);
  }
  /** The self-rescue track whose keys hold Shunzi's body now: {clip, seconds, root} (Lift: the heave; Check: getting up). */
  RescueClip(){
    const f=this.flags,t=this.r.time,root=this.HeaveRoot();
    if(this.phase==="Check")return {clip:"ShunziRise",seconds:f.handedAt!=null?Math.min(t-f.handedAt,C.rescue.hand.rise.durationS):0,root};
    if(this.phase==="Lift")return {clip:"ShunziHeave",seconds:f.heaveAt!=null?Math.min(t-f.heaveAt,C.rescue.heave.durationS):0,root};
    return null;
  }
  /**
   * Shunzi's body on the self-rescue track, world: each keyed part (eye, gaze, crown, chest, pelvis, knees, heels) at the track
   * time, from HeaveRoot (rescue.heave.body / rescue.hand.rise; a part a track does not key is absent).
   */
  RescueBody(){
    const rc=this.RescueClip();if(!rc)return null;
    const out={clip:rc.clip,seconds:rc.seconds,root:rc.root};
    for(const part of RESCUE_PARTS){const p=this.RescuePoint(rc,part,rc.seconds);if(p)out[part]=p;}
    return out;
  }
  /** One part of the self-rescue track at track time `seconds`, world (null when the track has no such part). */
  RescuePoint(rc,part,seconds){
    const p=StandInPoint(rc.clip,part,seconds);
    if(!p)return null;
    const o=Rot(rc.root.yaw,p.x,p.z);
    return new THREE.Vector3(rc.root.x+o.x,this.r.battlefield.GroundHeight(rc.root.x,rc.root.z)+p.y,rc.root.z+o.z);
  }
  /**
   * The eye's view on the self-rescue track (world eye / gaze / crown). The heave's own look (down at the hands, ahead as he
   * lunges); up on his knees it lifts to Luo coming to stand over him. Check: on Luo's face while he asks (the speaker's gaze
   * is on the eye, VoiceGaze), down at the rifle as he snatches it up and shoves it over, level ahead as he gets up.
   */
  RescueView(body){
    const V=C.rescue.view,H=C.rescue.hand,eye=body.eye.clone(),ahead=Local(body.root,0,-1);
    let gaze=body.gaze?.clone()||eye.clone().add(new THREE.Vector3(ahead.x-body.root.x,0,ahead.z-body.root.z));
    const crown=body.crown?.clone()||eye.clone().add(new THREE.Vector3(0,.2,0));
    const toward=(point,weight,maxDeg,minDeg=-70)=>{
      if(!point||weight<=0)return;
      const d=point.clone().sub(eye),level=Math.hypot(d.x,d.z);if(level<1e-4)return;
      const pitch=Math.max(minDeg*DEG,Math.min(maxDeg*DEG,Math.atan2(d.y,level)));
      const aim=new THREE.Vector3(d.x/level*Math.cos(pitch),Math.sin(pitch),d.z/level*Math.cos(pitch));
      const now=gaze.clone().sub(eye).normalize();gaze=eye.clone().add(now.lerp(aim,weight).normalize());
    };
    const head=this.HeadPoint(this.Squad("luo")),face=head?.clone().addScaledVector(UP,-V.luoFaceDropM);
    if(body.clip==="ShunziHeave")toward(face,V.atLuo*Smooth((body.seconds-1.8)/.6),V.atLuoMaxDeg);
    else if(body.clip==="ShunziRise"){
      const f=this.flags,clip="LuoGrabRifleShove",s=f.handAt!=null?this.HandSeconds(this.r.time-f.handAt):0;
      const offered=EventAt(clip,"offered",H.standIn.offerS),handed=EventAt(clip,"handed",H.standIn.handedS);
      const stoop=(OpeningClipMeta(clip)?.holdLoop??H.standIn.holdLoop)[1];
      const since=f.handedAt!=null?this.r.time-f.handedAt:-1,level=since<0?1:1-Smooth((since-.2)/.5);
      // His face while he asks; his hands from the stoop (the grab, the swing up); the rifle as it comes into his own hands.
      toward(face,V.atLuo*level*(1-Smooth((s-stoop)/.25)),V.atLuoMaxDeg);
      const bones=this.Squad("luo")?.actor?.characterRig?.bones,hands=bones?.handL&&bones?.handR?bones.handL.getWorldPosition(new THREE.Vector3()).add(bones.handR.getWorldPosition(new THREE.Vector3())).multiplyScalar(.5):null;
      toward(hands,V.atHands*Window(s,stoop-.05,stoop+.2,offered-.25,offered-.05),V.atLuoMaxDeg,V.handsMinDeg);
      toward(this.LuoRiflePose()?.origin,V.atRifle*Window(s,offered-.25,offered-.05,handed+.15,handed+.55),60,V.rifleMinDeg);
      // The look follows his hands with a lag (lookS): from the rifle on the ground to it held out, it swung 48 deg in 0.4 s.
      const want=gaze.clone().sub(eye).normalize(),k=this.checkLook&&this.delta>0?1-Math.exp(-this.delta/V.lookS):1;
      this.checkLook=this.checkLook?this.checkLook.lerp(want,k).normalize():want;
      gaze=eye.clone().add(this.checkLook);
    }
    return {eye,gaze,crown};
  }
  /** The charge's men and the dead from Check on; He goes to the right edge of SB06 with his rifle. */
  Aftercut(){
    const r=this.r,R=C.rescue,he=this.Squad("heyoutian");
    this.ComradeCorpse();
    // The cut men lie where they fell (native deaths); one still standing here gets the lethal hit.
    for(const c of R.cuts){const a=this.Victim(c.victim);if(a?.alive)this.Kill(a);}
    this.Cuts();this.ChargeExtras();
    this.NoteMeleeResolved();
    // He is still on the timber (HeTimber) until he has let it drop.
    if(this.flags.liftAt!=null&&!this.flags.heTimberDone)return;
    if(!this.flags.heSwapAt){
      this.flags.heWalkAt??=r.time;
      if(this.Follow(he,"heCover",[...R.heCoverVia,R.heCover],C.speed.walk,null,R.heCover.yaw)||r.time-this.flags.heWalkAt>6)this.flags.heSwapAt=r.time;
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
   * terminal clips stay (unless `always`: the blade's directional death takes over from the wounded clip).
   */
  FallNatively(victim,always=false){
    if(victim&&(always||!IsOpeningTerminalClip(victim.openingStoryboardPose?.clip))){victim.openingStoryboardPose=null;victim.openingStoryboardTravel=null;}
  }
  /** Kill with the blade at the authored contact; if the hit did not kill, make it lethal. `natural`: the hit carries its
   *  direction into the death (the directional fall, the neck death) instead of the scripted collapse. */
  BladeKill(victim,attacker,{natural=false}={}){
    if(!victim?.alive)return;
    victim.scriptEssential=false;victim.scriptedNoncombatant=false;
    if(natural){victim.openingDoomed=false;this.FallNatively(victim,true);}else victim.openingDoomed=true;
    const weapon=attacker?.weapon;if(attacker)attacker.weapon=WEAPONS.Dadao;
    try{this.r.meleeCombat?.Damage(victim,attacker,200,"heavy");}finally{if(attacker)attacker.weapon=weapon;}
    if(victim.alive)this.Kill(victim);
  }
  Blood(actor,part){
    const bone=actor?.actor?.characterRig?.bones?.[part==="neck"?"neck":"chest"]||actor?.actor?.characterRig?.bones?.head;
    const at=bone?.getWorldPosition(new THREE.Vector3());
    if(at)this.r.vfx?.BloodBurst?.(at,new THREE.Vector3(0,.3,1),1.4);
  }
  /** Liu Wencai's long shot at the junction man; fallbacks never leave the hand-back waiting. */
  /** Liu Wencai's long shot at the junction man -- 2026-10-11 ijaB (「刘文财在台阶处举枪，击倒岔口回身举枪的乙」; until then ijaD);
   *  fallbacks never leave the hand-back waiting. The fold man is FoldFight's. */
  LongShotTick(){
    const r=this.r,ijaB=this.Ija("ijaB"),liu=this.Squad("liuwencai");
    this.LiuWalk();
    if(this.flags.longShotAt==null)this.flags.longShotAt=r.time;
    const t=r.time-this.flags.longShotAt;
    if(!ijaB){if(!r.Has("junctionShot"))r.Record("junctionShot",{by:"absent"});return;}
    if(ijaB.alive&&!ijaB.openingCombatReleased){
      // 「岔口回身举枪」: he turns round from the junction toward the step and raises his rifle.
      this.Pose(ijaB,t<1.1?"IjaReadyRifle":null,{seconds:t,face:Face(ijaB.openingStoryboardLast||ijaB.position,C.rescue.liuShot)});
    }
    if(!ijaB.alive){if(!r.Has("junctionShot"))r.Record("junctionShot",{by:this.flags.junctionBy||"other"});return;}
    const Try=(shooter,id,at)=>{
      if(this.flags["shot:"+id]||t<at||!shooter)return;
      this.flags["shot:"+id]=r.time;
      const force=t>=C.timeouts.longShotForceS,clear=!r.BlocksSight(this.ShotOrigin(shooter),this.AimPoint(ijaB));
      const hit=this.ShootAt(shooter,ijaB,force);
      // A hit only the timeout made (no line to him: he hid) is credited to the timeout, not the shooter.
      if(hit)this.flags.junctionBy=clear||!force?id:"forced";
    };
    // Liu fires from his step, after the cuts (rescue.liuEarliestS; a late walker is covered by the two fallbacks below).
    if(this.flags.liuAt!=null)Try(liu,"liu",Math.max(C.rescue.liuEarliestS,this.flags.liuAt-this.flags.longShotAt+.6));
    // He fires once the rifle is actually in his hands (HeSwapDadaoRifle ends ~ +4.7 s).
    if(this.flags.heArmedAt!=null)Try(this.Squad("heyoutian"),"he",Math.max(C.timeouts.longShotRetryS,this.flags.heArmedAt-this.flags.longShotAt+.4));
    Try(this.Squad("luo"),"luo",C.timeouts.longShotForceS);
    if(t>=C.timeouts.longShotForceS+.5&&ijaB.alive){this.Kill(ijaB,"bullet");this.flags.junctionBy??="forced";}
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
   * 2026-09-30 (user: 「班长太磨叽了，眼珠子也不知道在动什么，就直接询问，得到肯定的点头以后，班长就地捡起一把枪，就塞给玩家」):
   * up on his knees, Luo standing over him (HandRoot) plays LuoGrabRifleShove: the dadao into his belt, then its short hold loop
   * leaning in with his eyes on Shunzi's (VoiceGaze) for 「还能打不？」; the nod lets it go -- he snatches up the rifle lying at
   * his right front and shoves it into Shunzi's hands (`handed`: the first person takes it over, HeldRifle). Shunzi gets up
   * (rescue.hand.rise) and the hand-back follows once he stands and Luo's clip has played out.
   */
  PhaseCheck(age){
    const r=this.r,f=this.flags,H=C.rescue.hand,luo=this.Squad("luo");
    this.HeTimber();this.Aftercut();this.LongShotTick();this.FoldFight();this.DepthIja();
    if(!this.phaseEntered){this.phaseEntered=true;f.checkAt=r.time;this.checkLook=null;}
    const clip=OpeningClipMeta("LuoGrabRifleShove")?"LuoGrabRifleShove":null,root=this.HandRoot();
    // He is up on his knees; Luo comes to stand over him if he is not there yet.
    if(f.handAt==null){
      if(this.LuoToHand(true)&&f.luoAtHand!=null||age>C.timeouts.luoArriveS){if(luo&&f.luoAtHand==null){this.Show(luo);this.Put(luo,root);}f.handAt=r.time;}
      else return;
    }
    const t=r.time-f.handAt,s=this.HandSeconds(t);
    // The pose layer maps the hold loop itself (raw clock + holdUntil; HandSeconds is the same mapping for the director's own reads).
    this.Put(luo,root);this.Pose(luo,clip,{seconds:t,holdUntil:f.handHoldUntil??undefined,face:root.yaw});
    const loop=OpeningClipMeta(clip)?.holdLoop??H.standIn.holdLoop;
    // 「还能打不？」 (started as he stepped in, AskCheck; at the latest as he leans in); the nod after it lets the loop go.
    if(s>=loop[0]+H.lineDelayS)this.AskCheck();
    if(f.checkLineAt==null&&this.Started("RescueCheck")&&r.time-this.flags["scene:RescueCheck"]>this.SceneLength("RescueCheck")+1)f.checkLineAt=r.time;
    if(f.checkLineAt==null&&age>C.timeouts.checkS)f.checkLineAt=r.time;
    if(f.checkLineAt!=null&&f.handHoldUntil==null&&r.time-f.checkLineAt>=H.nodS)f.handHoldUntil=t;
    const handed=EventAt("LuoGrabRifleShove","handed",H.standIn.handedS);
    if(f.handedAt==null&&s>=handed)f.handedAt=r.time;
    // Never stall on the hand-back: a required vanguard man still standing here gets the lethal hit.
    if(f.handedAt!=null&&!this.VanguardCleared())for(const id of C.vanguardIds)this.Kill(this.r.enemies.get(id),id==="BunkerExecutionerA"?"melee":"bullet");
    // A man missing from the enemy table (spawn failure, a debug removal) can never be seen dead: past the clip's end by
    // releaseGraceS the hand-back goes ahead and the absentees are written into the fact.
    const end=ClipLength("LuoGrabRifleShove",H.standIn.durationS),stood=f.handedAt!=null&&r.time-f.handedAt>=H.rise.durationS;
    if(s>=end-1e-3&&stood){f.handEndAt??=r.time;this.Release({force:r.time-f.handEndAt>=H.releaseGraceS});}
  }
  /**
   * The rifle Luo shoves over, for the first person (null outside the hand-over): before `handed` (from reachS ahead of it)
   * the one in Luo's hands, which the palms reach for (`reach`); from `handed` it is Shunzi's (`held`, seconds since): the
   * first person shows its own copy from the pose it was taken at and carries it up with him as he gets to his feet.
   * `q` / `origin` are the world pose of the rifle model (the same HanYang geometry as the loading rifle).
   */
  HeldRifle(){
    const r=this.r,f=this.flags,H=C.rescue.hand;
    if(this.phase!=="Check"||f.handAt==null)return null;
    const s=this.HandSeconds(r.time-f.handAt),handed=EventAt("LuoGrabRifleShove","handed",H.standIn.handedS);
    if(f.handedAt==null&&s<handed-H.reachS)return null;
    const pose=this.LuoRiflePose();
    return {mode:f.handedAt!=null?"held":"reach",since:f.handedAt!=null?r.time-f.handedAt:null,q:pose?.q||null,origin:pose?.origin||null};
  }
  /** World pose of the rifle in Luo's hands (his prop, while it shows). */
  LuoRiflePose(){
    const prop=this.Squad("luo")?.actor?.characterRig?.openingProps?.items?.get?.("rifle")?.object;
    if(!prop?.visible||!prop.parent)return null;
    prop.updateWorldMatrix(true,false);
    return {q:prop.getWorldQuaternion(new THREE.Quaternion()),origin:prop.getWorldPosition(new THREE.Vector3())};
  }
  PhaseReleased(){
    this.Aftercut();this.LongShotTick();this.FoldFight();
  }
  /** Background every frame of 01–02: dead stay dead, ijaC/ijaD keep their loops. */
  Background(){
    const phase=this.phase;
    // (2026-10-11: through Hold / Ask / Blade ijaB, ijaC and ijaD are RescueVanguard's, on their redraft posts.)
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
    this.ApplyClipPropHidden();
    for(const actor of this.hiddenWeapons||[])if(actor.actor?.weaponGroup)actor.actor.weaponGroup.visible=false;
    // The comrade's own rifle the blast threw off is the Set's comradeRifle from the black on (LayComradeRifle).
    if(this.flags.comradeRifleLaid!=null){const own=this.ComradeRifleObject();if(own)own.visible=false;}
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
    // Where he stands: where he got up (the last placement of the rescue).
    const at=this.lastPlayerPoint||C.shunzi.cover;this.releasePoint={x:at.x,z:at.z};
    this.Set("Released");
    r.Record("playerDraggedFromWreck",missing.length?{to:this.releasePoint,missing}:{to:this.releasePoint});
    if(!r.Has("luoRescueComplete"))r.Record("luoRescueComplete");
    // Standing (2026-09-29; since 09-30 he gets up by himself), the rifle Luo shoved into his hands -- no pickup, no crouch.
    const kind=r.controls?.kind;r.controls=null;r.Control?.(false,kind);r.player.stance="stand";r.player.eyeHeight=STANCE.stand.eye;
    const direction=new THREE.Vector3(0,0,-1).applyQuaternion(this.presentedCamera?.quaternion||r.player.camera.quaternion);
    r.player.yaw=Math.atan2(-direction.x,-direction.z);r.player.pitch=Math.asin(Math.max(-1,Math.min(1,direction.y)));
    if(this.presentedCamera)r.player.camera.quaternion.copy(this.presentedCamera.quaternion);
    const luo=this.Squad("luo"),R=C.rescue;
    // The hand-over's root motion (the step for the rifle, the turn to the crater step) leaves Luo's pelvis off his root: re-root
    // him under it, facing the way the clip leaves him, before the AI takes him (its pose blend dragged the pelvis back to the
    // root at 0.16-0.19 m a frame, 2026-09-30).
    const pelvis=luo?.actor?.characterRig?.bones?.pelvis?.getWorldPosition(new THREE.Vector3()),end=OpeningClipRoot(LUO_MODEL,"LuoGrabRifleShove")?.end;
    if(pelvis&&end)this.Put(luo,{x:pelvis.x,z:pelvis.z,yaw:this.HandRoot().yaw+end[2]*DEG},{noBlend:true,keep:true});
    if(luo)luo.voiceGaze=null;
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
    this.playerBody.root.visible=false;if(this.supplyRoot)this.supplyRoot.visible=false;
    // He may still be walking to his post or swapping the dadao for the rifle: he goes on with the rifle from there.
    const he=this.Squad("heyoutian");
    if(he&&!this.flags.heArmed){this.flags.heArmed=true;this.flags.heArmedAt=r.time;Equip(he,"HanYang");this.ReleaseSquad(he,R.heCover);r.ai.SetStance?.(he,1,6,true);}
    // The rifle is his again: the world copy goes and the hands hold it (the flow goes on to the withdrawal).
    if(!r.Has("rifleRecovered")){r.Record("rifleRecovered");r.RemoveBunkerRifle?.();r.RestoreRifle?.({instant:true});r.SaveCheckpoint?.();}
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
    // The grenade that rolled to his face lies there until 01–02 is left (rescue.grenade).
    if(!["Trapped","BunkerRescue","RearTrench"].includes(stage))this.RemoveGrenadeProp();
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
      // 2026-09-29: they come on the hand-back's own rifleRecovered -- the same hesitation as everyone already there
      // (rescue.handbackHoldFireS from the hand-back), or the fold man opens up on a standing player at once.
      const R=C.rescue,held=this.releaseAt!=null?R.handbackHoldFireS-(r.time-this.releaseAt):0;
      if(actor&&held>0&&Distance(actor.position,this.releasePoint||C.shunzi.cover)<R.handbackHoldFireM)actor.hesitateUntil=Math.max(actor.hesitateUntil??-99,r.ai.time+held);
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
    // DepthIja walks on through the withdrawal (a man still in shot at the hand-back goes on off the field); any later stage
    // retires him outright ("at the latest when 02 begins" — the alive check keeps DepthIjaB's corpse).
    if(stage==="RearTrench")this.DepthIja();
    else for(const m of OPENING_DEPTH_IJA.members)if(this.cast[m.id]?.alive)this.RetireDepthIja(m.id);
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
    if(p==="Count"||p==="Banter")return S.seat;
    if(p==="Orders"||p==="Incoming")return this.FollowPoint();
    if(p==="Blast")return this.BlastPoint();
    // Hauled out from under the timber by Luo, up onto his knees and his feet: under the eye of the clip's player track.
    if(p==="Lift"||p==="Check"){const e=this.RescueBody()?.eye;return e?{x:e.x,z:e.z}:p==="Check"&&this.lastPlayerPoint||S.trap;}
    if(p==="Released")return this.releasePoint||S.cover;
    return S.trap;
  }
  PlacePlayer(){const r=this.r,point=this.lastPlayerPoint=this.PlayerPoint(),y=r.battlefield.GroundHeight(point.x,point.z);r.player.position.set(point.x,y,point.z);r.player.body?.Teleport(point.x,y,point.z);r.player.velocity.set(0,0,0);}
  /** Camera shot of the current phase: eye point + height and a look target (world). */
  Shot(){
    const r=this.r,p=this.phase,a=this.Age,S=C.shunzi,b=C.banter;
    const Head=actor=>this.HeadPoint(actor);
    const At=(point,h)=>r.Point(point,h);
    const ijaA=this.Ija("ijaA"),comrade=this.Comrade,luo=this.Squad("luo"),interp=this.cast.interpreter,L=C.firstPerson.look;
    let eye=S.witnessEye,height=S.lieEyeM,target=At({x:4,z:-125.4},.9),roll=0,pitch=0,yaw=0,fovScale=1,quaternion=null,track=false;
    if(p==="Count"||p==="Banter"||p==="Orders"&&this.flags.exitAt==null){
      // SB01 / N01: from the back of the dugout out through the mouth. The eye is the seated fill clip's (the body filling the
      // charger, Script_OpeningFirstPerson.PoseFill); where the player looks is his own (HeadLook / LookLimits): the view
      // is not turned to whoever speaks, nor pitched down to the collar (09-27 review 「给到自由视角即可」).
      ({eye,height}=this.SeatEye());
      // 「几块土掉进顺子衣领。他缩起脖子」: the shoulders hunch (the hand at the collar is the first person's own layer).
      if(p==="Banter"&&this.flags.dirtAt!=null){const t=r.time-this.flags.dirtAt;height-=.04*Smooth((t-.2)/.5)*(1-Smooth((t-1.7)/.6));}
      target=this.SeatAim(eye,height,b.seatShot.pitchDeg*DEG);
      // 2026-10-11 「近处落了一发。整个洞一跳」: the near shell jolts the seat (banter.beats.jolt).
      if(this.flags.joltAt!=null){const J=b.beats.jolt,t=r.time-this.flags.joltAt,k=t>=0?Math.exp(-t/J.decayS)*Smooth(t/.03):0;
        height-=J.dropM*k;roll+=J.rollRad*k*Math.sin(t*J.hz*Math.PI*2);}
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
      // 2026-10-11 (N06): the rifle in the mud right of the middle (rescue.rifleMouth lies north-east of the eye): the look turned
      // ~30 deg north of the trench line.
      target=At({x:4,z:-126.5},.8);roll=-.06;
      // 「他试着撑起身体。背包带一下绷紧……又落回地面」, then the eyes drop to the clawing fingers.
      if(p==="Wake"){height+=L.pushUpM*Smooth((a-1.2)/.5)*(1-Smooth((a-1.85)/.12));pitch=L.clawPitch*Smooth((a-2)/.4);}
    }
    else if(p==="DropIn"){
      // N07 / N08: down the front trench at the north rim they come off (pitched up to the rim), then at the fold.
      const D=C.dropIn.shot;target=this.Aim(eye,height,D.yawDeg*DEG,D.pitchDeg*DEG);roll=-.04;
    }
    else if(p==="Sweep"){
      // N09: ijaB coming down the trench at the eye, the look held near the trench's line (followDeg) and over the floor.
      const S=C.sweep.shot,h=Head(this.Ija("ijaB"));let yaw=S.yawDeg*DEG,look=S.pitchDeg*DEG;
      if(h){const e=r.Point(eye,height);yaw+=Math.max(-S.followDeg*DEG,Math.min(S.followDeg*DEG,Wrap(Face(eye,h)-yaw)));
        look=Math.max(S.pitchMinDeg*DEG,Math.min(S.pitchMaxDeg*DEG,Math.atan2(h.y-e.y,Math.hypot(h.x-e.x,h.z-e.z))-6*DEG));}
      target=this.Aim(eye,height,yaw,look);roll=-.03;
    }
    else if(["CaptiveDragged","CaptiveWall","Interrogation","Practice"].includes(p)){
      // 2026-09-27: first person from the pinned eye (no cut-away camera): the group 2.3-4.2 m off, heads over the eye.
      const W=C.interrogation.witnessShot;target=this.Aim(eye,height,W.yawDeg*DEG,W.pitchDeg*DEG);roll=W.rollDeg*DEG;
    }
    else if(p==="Slash"){
      // The throat: the look follows the comrade's head (at most followDeg off the witness line, the pitch clamped).
      const W=C.interrogation.witnessShot,Q=C.interrogation.slashShot,h=Head(comrade);
      let yaw=W.yawDeg*DEG,look=W.pitchDeg*DEG;
      if(h){const e=r.Point(eye,height);yaw+=Math.max(-Q.followDeg*DEG,Math.min(Q.followDeg*DEG,Wrap(Face(eye,h)-yaw)));
        look=Math.max(Q.pitchMinDeg*DEG,Math.min(Q.pitchMaxDeg*DEG,Math.atan2(h.y-e.y,Math.hypot(h.x-e.x,h.z-e.z))-4*DEG));}
      target=this.Aim(eye,height,yaw,look);roll=W.rollDeg*DEG;
      fovScale=this.FixateScale();
    }
    else if(p==="Finish"||p==="Found"){
      fovScale=this.FixateScale();
      // 2026-10-11 (N18 / N19): he comes up the trench at the eye bayoneting the dead, shammed at through the slit; over the
      // pinned man the eyes drop to the hand his boot comes down on (found.look) until he squats at the head.
      const L=C.found.look;
      // Finish (N18): kept low on his boots and the bodies he stabs as he comes (pitch at most finishMaxPitchDeg), not up at his face.
      if(p==="Found"&&this.flags.crouchFrom==null)target=this.Aim(eye,height,L.yawDeg*DEG,L.pitchDeg*DEG);
      else if(p==="Finish")target=this.LookAtBody(eye,height,ijaA,-8,C.finish.maxPitchDeg)||this.Aim(eye,height,-90*DEG,4*DEG);
      else target=this.LookAtBody(eye,height,ijaA,-5,40)||this.Aim(eye,height,-90*DEG,12*DEG);
    }
    else if(p==="Hold"||p==="Ask"||p==="Blade"){
      // 「日兵甲揪住他的头发把头提起来」: the eye rises liftM and tips up at his face; the slaps fling the head aside.
      const H=C.rescue.holdShot,Q=C.rescue.slap,grip=this.flags.holdGripAt!=null?Smooth((r.time-this.flags.holdGripAt)/H.liftS):0;
      const back={x:Math.sin(S.trap.yaw)*H.backM*grip,z:Math.cos(S.trap.yaw)*H.backM*grip};
      eye={x:eye.x+back.x,z:eye.z+back.z};height+=H.liftM*grip;
      // A slap flings the head: the aim holds on where his face was at the blow, so the whole turn is the head's (his
      // trunk swinging through the follow-through would add to it or take it back).
      const k=this.SlapKick(),side=this.flags.slapSide||1,live=Head(ijaA);
      let head=live&&this.slapAim&&k>0?live.clone().lerp(this.slapAim,Math.min(1,k*1.5)):live;
      // 2026-10-11 Blade (N21): the look goes over toward the recruit as he comes and leans in (eased: bladeView.lookS), back
      // to the hair-holder as he backs off.
      if(p==="Blade"){
        const V=C.rescue.bladeView,f=this.flags,d=Head(this.Ija("ijaD"));
        const w=f.backAt!=null?V.atRecruit*(1-Smooth((r.time-f.backAt)/.8)):V.atRecruit*Smooth((r.time-(f.bladeStartAt??r.time))/.8);
        let want=head&&d?head.clone().lerp(d.clone().addScaledVector(UP,-V.recruitDropM),w):head;
        if(want){const e=this.bladeLook&&this.delta>0?1-Math.exp(-this.delta/V.lookS):1;want=this.bladeLook=this.bladeLook?this.bladeLook.lerp(want,e):want.clone();}
        head=want;
      }
      // ...and the head goes over with the blow: the eye moves toward the side it is flung to.
      const across=(head?Face(eye,head):-90*DEG)-side*Math.PI/2;
      eye={x:eye.x-Math.sin(across)*Q.shiftM*k,z:eye.z-Math.cos(across)*Q.shiftM*k};
      if(head){const e=r.Point(eye,height),elev=Math.atan2(head.y-e.y,Math.hypot(head.x-e.x,head.z-e.z));
        target=this.Aim(eye,height,Face(eye,head),Math.min(H.maxPitchDeg*DEG,elev-H.headAboveDeg*DEG));}
      else target=this.Aim(eye,height,-90*DEG,20*DEG);
      yaw=-side*Q.yawDeg*DEG*k;pitch=Q.pitchDeg*DEG*k;roll=side*Q.rollDeg*DEG*k;height-=Q.dropM*k;
      // The cut on the left cheek: the head jerks away from it (to the right) and comes back (rescue.cheek).
      const flinch=this.CheekFlinch();
      if(flinch>0){yaw-=C.rescue.cheek.flinchDeg*DEG*flinch;roll+=.5*C.rescue.cheek.flinchDeg*DEG*flinch;}
    }
    else if(p==="Charge"||p==="Melee"){
      // 2026-09-30 (user: 「班长等人出现的太突兀了……完全可以镜头不动，但是前面的翻译或者日军被砍死倒下吧」; the same day: 「应该是队友们
      // 先开枪击伤日军……再是班长和队友冲上来一刀砍死」): the eye stays on the man in front of him -- ijaA, shot, letting go (the head
      // drops back into the mud), staggering up and away down the trench with the arm hanging -- and the rescuers run into that
      // picture from its right edge; each cut is looked at for cutHoldS (between the cutter and the man he cuts down), then the
      // fight going on down the trench. The look point eases (chargeView.lookS), so no change of subject whips the head round.
      const H=C.rescue.holdShot,Q=C.rescue.chargeView,shotA=this.flags["hit:ijaA"];
      height+=H.liftM*(shotA!=null?1-Smooth((r.time-shotA-.05)/.3):1);
      const a1=Head(ijaA);
      let point=null,latest=-Infinity;
      for(const c of C.rescue.cuts){
        const at=this.flags["cut:"+c.victim];if(at==null||r.time-at>=Q.cutHoldS||at<latest)continue;
        const x=Head(this.Cutter(c.by)),y=Head(this.Victim(c.victim));if(x&&y){point=x.clone().lerp(y,.5);latest=at;}
      }
      // 2026-10-11 (「那颗没磕响的手榴弹滚到顺子脸前停住」): the look follows the grenade down from its first bounce as it rolls
      // to his face and stays on it rescue.grenadeLookS after it has come to rest -- over any cut.
      const G=this.grenadeProp,stop=this.flags.grenadeStopAt,bounce=this.flags.grenadeBounce1;
      const grenadeLook=!!G?.visible&&bounce!=null&&(stop==null||r.time<stop+C.rescue.grenadeLookS);
      if(grenadeLook)point=G.position.clone();
      if(!point&&p==="Melee")point=At(A.bunkerJunction,1.3);
      // ijaA's upper body (his head over the low eye is 40-50 deg up once he stands), else where the shot leaves him.
      if(!point)point=a1&&ijaA?.alive?a1.clone().addScaledVector(UP,-Q.ijaChestDropM):At(this.WoundBody("ijaA")||C.ija.crouch,1.1);
      const k=this.chargeLook&&this.delta>0?1-Math.exp(-this.delta/(grenadeLook?Q.grenadeLookS:Q.lookS)):1;
      point=this.chargeLook=this.chargeLook?this.chargeLook.lerp(point,k):point.clone();
      const e=r.Point(eye,height),elev=Math.atan2(point.y-e.y,Math.hypot(point.x-e.x,point.z-e.z));
      const low=(grenadeLook||this.grenadeLooking)?Q.grenadeMinPitchDeg:-6;
      // Back up from the grenade at the eased look's own pace (no clamp snapping the pitch back to -6 deg).
      this.grenadeLooking=grenadeLook||(this.grenadeLooking&&elev<-6*DEG);
      target=this.Aim(eye,height,Face(eye,point),Math.max(low*DEG,Math.min(Q.maxPitchDeg*DEG,elev)));
      roll=.03*Math.sin(r.time*3.1);
    }
    else if(p==="Lift"||p==="Check"){
      // 2026-09-30 (user: 「直接玩家自己往前用力一声腾挪就出来就行」): his own heave out from under the timber and up onto his knees
      // (rescue.heave), then getting to his feet with the rifle (rescue.hand.rise); the look is RescueView's.
      const body=this.RescueBody();
      if(body?.eye){
        const view=this.RescueView(body);
        eye={x:view.eye.x,z:view.eye.z};height=view.eye.y-r.battlefield.GroundHeight(view.eye.x,view.eye.z);
        target=view.gaze.clone();quaternion=EyeQuaternion(view.eye,view.gaze,view.crown);track=true;
        // The nod after 「还能打不？」.
        if(p==="Check"&&this.flags.checkLineAt!=null){const n=r.time-this.flags.checkLineAt;if(n<.8)pitch=-.2*Math.sin(Math.PI*n/.8);}
      }
    }
    // Shamming dead (Found / Hold until the first slap): the look goes onto ijaA's face and tips up slitAboveDeg, so the face
    // is in the slit between the lids (it lies below the middle of the picture).
    const sham=this.Shamming(),face=sham>0&&(p==="Found"&&this.flags.crouchFrom!=null||p==="Hold")&&Head(ijaA);
    if(face){
      const e=r.Point(eye,height),to=face.clone().sub(e).normalize(),from=target.clone().sub(e).normalize();
      target=e.clone().add(from.lerp(to,sham).normalize());pitch+=C.rescue.playDead.slitAboveDeg*DEG*sham;
    }
    return {eye,height,target,roll,pitch,yaw,fovScale,quaternion,track};
  }
  /** 0..1: how far into shamming dead he is (rescue.playDead): up over closeS once ijaA has seen him, down over openS
   *  on the first slap. */
  Shamming(){
    const D=C.rescue.playDead,f=this.flags,t=this.r.time;
    if(f.playDeadAt==null)return 0;
    return Smooth((t-f.playDeadAt)/D.closeS)*(f.wokenAt!=null?1-Smooth((t-f.wokenAt)/D.openS):1);
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
    cam.position.copy(r.Point(shot.eye,shot.height));
    // A shot on a player track carries its own rotation (an eye rolled over upside down has no world up to look along).
    if(shot.quaternion)cam.quaternion.copy(shot.quaternion);else cam.lookAt(shot.target);
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
      cam.quaternion.copy(this.previousViewQuaternion).rotateTowards(desiredQuaternion,(shot.turnRps??(shot.track?C.trackTurnRps:C.cameraTurnRps))*(this.delta||0));
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
    // 2026-10-11: the count is in the black (contract §1.3); the picture comes up over fadeInS from Banter's start.
    const fade=p==="Count"?1:p==="Banter"?1-Smooth((r.time-(this.started??r.time))/C.fadeInS):0;
    // Each slap: a flinch that does not shut the eyes (the head being flung must be seen), then a slow dazed blink. The
    // first one snaps his shammed-dead slit open instead (rescue.playDead): no flinch on that one.
    const slap=this.flags.slapAt!=null?r.time-this.flags.slapAt:null,waking=this.flags.slapCount===1;
    const blink=slap==null||slap<0?0:Math.max(waking?0:.45*Smooth(slap/.03)*(1-Smooth((slap-.06)/.1)),
      .7*Smooth((slap-.5)/.12)*(1-Smooth((slap-.68)/.2)));
    const D=C.rescue.playDead,sham=this.Shamming();
    const squint=sham>0?sham*(D.squint+D.tremor*Math.sin(r.time*Math.PI*2*D.tremorHz)*Math.sin(r.time*Math.PI*2*D.tremorHz*.37)):0;
    const recovery=C.blackoutRecovery;
    opening.eyeClosure=this.shownEyeClosure=p==="Blast"?Smooth((a-C.banter.blastShot.eyesCloseS)/recovery.closeS):p==="Black"?1:p==="Wake"?1-Smooth(a/recovery.eyelidS):Math.max(fade,blink,squint);
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
    // 2026-10-11: the boot grinding his hand (Found, found.grindShake of a slap's spike) and the near shell in the dugout.
    const grind=this.flags.bootStepAt!=null&&now>=this.flags.bootStepAt?C.found.grindShake*P.kick*Math.exp(-(now-this.flags.bootStepAt)/P.kickFadeS):0;
    const kick=(this.flags.slapAt!=null&&now>=this.flags.slapAt?P.kick*Math.exp(-(now-this.flags.slapAt)/P.kickFadeS):0)+grind;
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
    // 2026-10-11: the cheek cut's streak stays and fades with the residue (Script_PostComposite reads concussion.cheek once the
    // lens is off; Data_OpeningLens LENS_CHEEK_RESIDUE is its strength at the hand-back).
    const cheek=this.flags["cut:cheek"]!=null?{flash:0,blood:1,opacity:LENS_CHEEK_RESIDUE*(1-Smooth(t))}:null;
    return {amount,focus:amount*C.perception.focusScale,pitch:0,roll:0,...(cheek?{cheek}:{})};
  }
  /** The lens clocks (Script_OpeningLens): the near miss, the last slap and its side, the concussion. */
  LensEvents(){return {blastAt:this.r.opening?.blastAt,slapAt:this.flags.slapAt,slapSide:this.flags.slapSide,cheekAt:this.flags["cut:cheek"]??null,concussion:this.perception?.amount};}
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
    if(["ijaA","ijaB","ijaC","ijaD","gunner","loader"].includes(role))return this.Ija(role);
    if(role==="victim")return this.cast.SweepVictim||null;
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
        :["ijaA","ijaB"].includes(role)&&["Interrogation","Practice","Slash"].includes(this.phase)?this.HeadPoint(this.Comrade):this.r.player.camera.position;
      // From Finish on ijaA's face is on the pinned man (the camera); at the charge he snaps round to the men coming down the step.
      if(role==="ijaA"&&["Finish","Found","Hold","Ask","Blade"].includes(this.phase))lookAt=this.r.player.camera.position;
      // 2026-10-11: ijaA glances back at the rear trench (Interrogation, Practice); the recruit's head flung by the slap; the
      // comrade's one look straight at the pinned eye after 「跪好。」 (dragged.gazeS), and his eyes on the ground after it.
      const now=this.r.time,f=this.flags;
      if(role==="ijaA"&&f.ijaALookBackUntil!=null&&now<f.ijaALookBackUntil)lookAt=this.r.Point({x:-4,z:-113},1.5);
      if(role==="ijaD"&&this.Fired("recruitSlapped")&&this.Since("recruitSlapped")<.8){const a=this.Ija("ijaD"),p=a?.openingStoryboardLast||a?.position;if(p)lookAt=this.r.Point({x:p.x+.2,z:p.z-1.2},1.2);}
      if(role==="ijaD"&&this.Fired("recruitNod")&&this.Since("recruitNod")<.7){const a=this.Ija("ijaD"),p=a?.openingStoryboardLast||a?.position;if(p)lookAt=this.r.Point({x:p.x-.8,z:p.z},.6);}
      if(role==="comrade"&&f.gazeAt!=null&&now-f.gazeAt<C.dragged.gazeS)lookAt=this.r.player.camera.position;
      else if(role==="comrade"&&f.gazeAt!=null&&now-f.gazeAt<C.dragged.gazeS+2&&role!==speaker){const c=this.Comrade?.openingStoryboardLast;if(c)lookAt=this.r.Point({x:c.x+.4,z:c.z+.9},0);}
      // The recruit's eyes on the cheek he cuts and the man he aims at (Dir02).
      if(role==="ijaD"&&this.phase==="Blade")lookAt=this.r.player.camera.position;
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
    // The machine-gun crew stand-ins (EnsureMgCrew) leave the enemy table with the cast.
    for(const [id,actor] of Object.entries(this.cast)){if(actor?.openingMgStandIn&&this.r.enemies.get(actor.missionId)===actor)this.r.enemies.delete(actor.missionId);this.r.ai.Remove(actor);}
    for(const p of this.pursuit||[])if(p.actor?.alive)this.r.ai.Remove(p.actor);
    this.cast={};this.captives=[];this.playerBody=null;this.setup=false;this.phase=null;this.at=this.r.time;this.started=this.r.time;
    this.scenes={};this.flags={};this.events=[];this.beats.clear();this.pursuit=null;this.pursuitSpawned=false;this.pursuitMissing=0;this.withdraw=null;
    this.firstPerson=null;this.firstPersonState=null;this.presentedAt=null;this.previousViewQuaternion=null;this.previousViewPosition=null;
    this.strikeAt=null;this.cameraFrom=null;this.shownEyeClosure=null;this.presentedCamera=null;this.pointActor=null;this.phaseEntered=null;
    this.slaps=null;this.noiseDone=null;this.roofLift=0;this.checkLook=null;this.bladeLook=null;this.grenadeLooking=false;this.grenadeFrom=null;this.grenadeFromQ=null;
    this.RemoveGrenadeProp();this.recruitBlood?.removeFromParent();this.recruitBlood=null;this.recruitBloodMaterial=null;
    this.perception=null;this.perceptionLevel=null;this.headFree=0;this.headLook=null;this.releaseAt=null;this.releaseLevel=null;this.releasePoint=null;
    this.meet=null;this.guardRoute=null;this.restRoute=null;this.clawPath=null;this.blastFrom=null;this.seatEyeM=null;
    this.talks=null;this.emitted=null;this.flyers=null;this.sweepWalker=null;this.finishWalker=null;this.mgRandom=null;
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
      headLook:this.headLook||null,meet:this.meet?{s:this.meet.s}:null,
      // 2026-10-11: the director events sent (contract §3) and each scene's timeline (voice / estimate).
      emitted:(this.emitted||[]).slice(),talks:Object.fromEntries(Object.entries(this.talks||{}).map(([id,t])=>[id,{mode:t.mode,started:t.started,doneAt:t.doneAt,starts:t.starts}]))};
  }
  Dispose(){
    if(this.r.ai?.viewOwner===this)this.r.ai.viewOwner=null;
    if(this.cinematicBaseFov!=null){this.r.player.camera.fov=this.cinematicBaseFov;this.r.player.camera.updateProjectionMatrix();this.cinematicBaseFov=null;}
    this.presentedShotId=null;
    this.ReleaseMeleeDormancy();
    for(const actor of this.performanceActors||[])ClearOpeningActorPerformance(actor);this.performanceActors?.clear();
    this.r.hud.SetStoryBlood?.(0);this.supplyRoot?.removeFromParent();this.playerBody?.root.removeFromParent();this.playerBody?.Dispose?.();
    this.r.openingSet?.LiftRoofTimber?.(0);this.ClearMudMarks();this.mudMaterial=null;this.RemoveGrenadeProp();this.recruitBlood?.removeFromParent();this.recruitBlood=null;this.recruitBloodMaterial=null;
    for(const prop of this.rifleProps)prop.removeFromParent();this.rifleProps=[];
    for(const f of Object.values(this.flyers||{}))f.object.removeFromParent();this.flyers=null;this.flyerMaterials=null;
    for(const material of this.owned)material.dispose();for(const geometry of this.ownedGeometry||[])geometry.dispose();this.owned=[];this.ownedGeometry=[];
  }
}
