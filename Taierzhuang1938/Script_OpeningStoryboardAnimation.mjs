import { CutscenePerformer, LoadMachineGunCaptivesAnimation } from "./Script_CutscenePerformance.mjs";
import { OPENING_STORYBOARDS as C } from "./Data_OpeningStoryboards.mjs";
import { LoadMeleeAnimations } from "./Script_MeleeAnimationData.mjs";
import { Quaternion } from "three";
import { OpeningActorPerformance, ResolveOpeningActorPose, CorrectOpeningActorGrips, SettleOpeningCaptive } from "./Script_OpeningActorPerformance.mjs";
import { ApplyOpeningRescueReady } from "./Script_OpeningFirstPerson.mjs";
import { OpeningPropSet, ApplyOpeningWeaponTrack } from "./Script_OpeningProps.mjs";
export { SetOpeningActorPerformance, ClearOpeningActorPerformance } from "./Script_OpeningActorPerformance.mjs";
let library, pending;
// Reused straight from the machine-gun captives library (contract §5.4 reuse list plus the
// clips the 0922 director already borrowed). Only the rigs that were baked with them get them.
const CAPTIVES_REUSED = ["IjaBayonetGuard","CaptiveStandToKneel","CaptiveHandsUpWalk","CaptiveKneelPlead",
  "IjaKickPrisoner","IjaShoveForward","IjaTauntGesture","CaptiveKneelFlinch","CaptiveShovedStumble"];
const Quat = new Quaternion(), QuatRef = new Quaternion(), QuatAdd = new Quaternion();

/** Static metadata of one opening clip (manifest `clips[name]`): role, contacts, holdLoop, ... */
export function OpeningClipMeta(clip){return library?.config.clips?.[clip]||null;}
/** Paired staging (runtime metres, anchor frame) and prop definitions from the manifest. */
export function OpeningStage(name){return library?.config.stages?.[name]||null;}

/** A clip with a `holdLoop` window keeps sampling inside it once the playhead passes its end,
 * so a director can hold "fist in the hair" or "kneeling, hand on shoulder" for as long as
 * the dialogue runs without freezing the body. */
export function OpeningHoldSeconds(clip,seconds){
  const hold=OpeningClipMeta(clip)?.holdLoop;
  if(!hold||!(seconds>hold[1]))return seconds;
  const span=hold[1]-hold[0];
  return span>1e-6?hold[0]+((seconds-hold[0])%span):hold[1];
}
/** Terminal clips end on the corpse; the frozen-corpse logic lets them finish their frames. */
export function IsOpeningTerminalClip(clip){return clip==="ShotCollapse"||OpeningClipMeta(clip)?.terminal===true;}
export function LoadOpeningStoryboardAnimation(){
  return pending ||= (async()=>{
    const Read=async(file)=>{const response=await fetch(C.animationBase+file+"?v="+C.version);if(!response.ok)throw Error(`Opening animation ${file}: ${response.status}`);return response.json();};
    const config=await Read("Data_OpeningStoryboardsAnimation.json");
    const [captives]=await Promise.all([LoadMachineGunCaptivesAnimation(),LoadMeleeAnimations()]);
    const models=new Map(await Promise.all(config.models.map(async row=>[row.id,await Read(row.file)])));
    for(const [id,record] of models){
      const source=captives.models.get(id);
      if(source&&JSON.stringify(source.bones)!==JSON.stringify(record.bones))throw Error(`Opening animation rig order: ${id}`);
      for(const clip of CAPTIVES_REUSED)if(source?.clips[clip]&&!record.clips[clip])record.clips[clip]=source.clips[clip];
    }
    return library={config,models};
  })();
}
export function UpdateOpeningStoryboardCorpse(soldier){
  const actor=soldier?.actor,rig=actor?.characterRig,pose=soldier?.openingStoryboardPose;
  if(soldier?.alive||!rig||!IsOpeningTerminalClip(pose?.clip)||soldier.deadTime<=.9||soldier.corpse)return;
  const duration=library?.models.get(rig.modelId)?.clips[pose.clip]?.duration;
  if(!(duration>0))return;
  const shown=rig.openingStoryboardState;
  if(shown?.clipId===pose.clip&&shown.seconds>=duration&&shown.blend>=1)return;
  // AI freezes settled corpses after its normal 0.9-second fall. Authored terminal
  // collapses (ShotCollapse 1.6 s, CaptiveWallSlideTwitch 3.2 s ...) finish their frames.
  // Once the actual terminal pose is displayed, the normal frozen-corpse cost
  // stays zero; no second hit, root movement or death restart is introduced.
  actor.Update(Math.min(.1,Math.max(0,pose.seconds-(shown?.seconds||0))),{
    dead:true,dying:1,elapsed:pose.seconds,
  });
}
export function InstallOpeningStoryboardAnimation(soldier){
  const actor=soldier?.actor,rig=actor?.characterRig;
  if(!rig||rig.openingStoryboardInstalled)return;
  rig.openingStoryboardInstalled=true;
  const original=actor.Update;
  let performer,clock=0,blendFrom,blendAt=0,lastKey,travelClock=0,wasRescueReady=false,rescueHandoff=false;
  const bones=[];rig.root.traverse(node=>{if(node.isBone)bones.push(node);});
  const Allocate=()=>bones.map(bone=>({p:bone.position.clone(),q:bone.quaternion.clone()}));
  const shownBuffer=Allocate(),baseBuffer=Allocate(),blendBuffer=Allocate();
  const RescueHandoffBone=bone=>/Pelvis|Spine|Neck|Head|UpperArm|Forearm|Hand|Finger|Clavicle/.test(bone.name);
  const blendTarget=new Quaternion();
  const Snapshot=out=>{for(let i=0;i<bones.length;i++){out[i].p.copy(bones[i].position);out[i].q.copy(bones[i].quaternion);}return out;};
  let displayed;
  actor.Update=function(dt,state){
    const acting=rig.openingActorPerformance ||= new OpeningActorPerformance(soldier);
    acting.Restore();
    performer?.Restore();
    clock+=dt;
    const record=library?.models.get(rig.modelId);
    let pose=ResolveOpeningActorPose(soldier,soldier.openingStoryboardPose,clock,record);
    if(pose&&record&&!record.clips[pose.clip]&&pose.clip!=="DadaoAmbush")pose=null;
    if(pose&&OpeningClipMeta(pose.clip)?.holdLoop)pose={...pose,seconds:OpeningHoldSeconds(pose.clip,pose.seconds)};
    const nativeCombat=soldier.openingStoryboardTravel==null&&(state.firing||state.fire>0||state.aim>.6
      ||state.meleeCombat?.state==="attack"||state.meleeCombat?.state==="bind");
    // Front commands can occur while moving and firing. An explicit pointing
    // clip must not replace the weapon grip before head-only speech is applied.
    if(nativeCombat&&pose?.upperBody)pose=null;
    if(soldier.openingStoryboardTravel!=null)state={...state,moveSpeed:soldier.openingStoryboardTravel/4.2,
      crouch:0,prone:0,kneel:0,lifePose:null,idleLife:!pose,aim:soldier.openingStoryboardAim||(!pose&&actor.weaponId ? .18 : 0)};
    if(pose?.clip==="DadaoAmbush")state={...state,meleeCombat:{weapon:"Dadao",state:"attack",action:"Heavy",clip:"DadaoHeavy",
      normalized:Math.min(1,pose.seconds/C.ambushS),t:pose.seconds,weight:1}};
    if(pose?.meleeGuard)state={...state,aim:0,meleeCombat:{weapon:"Dadao",state:"idle",action:"Guard",clip:"DadaoGuard",
      normalized:clock%1,t:clock,weight:1}};
    const result=original.call(this,dt,state);
    if(IsOpeningTerminalClip(pose?.clip)&&state.dead){
      // This kneeling collapse already contains the grounded whole-body fall.
      // Native death may still advance for combat bookkeeping, but its separate
      // body support tilt/lift must not be applied on top of the authored corpse.
      const bodyY=rig.attachBodyY??actor.dims.hipY;
      actor.body.position.set(0,bodyY,0);actor.body.quaternion.identity();
      rig.root.position.y=-bodyY;rig.infantryFloorOffset=0;
    }
    if(rig.openingSlungRifle)rig.openingSlungRifle.visible=false;
    if(!pose&&soldier.openingStoryboardTravel==null&&!soldier.openingActorPerformance){
      if(lastKey==="InterrogateCrouch"&&actor.weaponGroup)actor.weaponGroup.visible=true;
      rig.openingProps?.HideAll();
      rig.openingStoryboardState=null;lastKey=null;displayed=null;blendFrom=null;return result;
    }
    // Native Kimodo death owns the guard from the instant the blade connects.
    // The kneeling captive retains his authored collapse and terminal pose.
    if(state.dead&&!pose){rig.openingStoryboardState=null;return result;}
    const key=pose?.clip||"Locomotion";
    const context=soldier.openingActorPerformance;
    const rescueReady=context?.role==="luo"&&!actor.weaponId&&((context.phase==="Pull"&&pose?.clip!=="PullComrade")||context.phase==="Kick");
    if(wasRescueReady&&!rescueReady)rescueHandoff=true;
    wasRescueReady=rescueReady;
    if(key!==lastKey){
      blendFrom=blendBuffer;
      if(displayed)for(let i=0;i<bones.length;i++){blendFrom[i].p.copy(displayed[i].p);blendFrom[i].q.copy(displayed[i].q);}
      else Snapshot(blendFrom);
      blendAt=clock;lastKey=key;travelClock=0;
    }
    const locomotion=Snapshot(baseBuffer);
    if(pose&&record&&pose.clip!=="DadaoAmbush"){
    performer ||= new CutscenePerformer(actor,record,library.config);
    // Sample the requested time directly. A new phase may reset its clock even
    // when it uses the same clip; blending must use the actor's monotonic clock.
    const reference=record.clips[pose.clip]?.referenceSpeedMps;
    if(reference)travelClock+=dt*(soldier.openingStoryboardTravel||0)/(reference*performer.SourceScale());
    performer.Apply({clipId:pose.clip,t0:0,phase:0,speed:0,previous:null},reference?travelClock:pose.seconds);
    if(soldier.openingStoryboardTravel>.05&&["CollarControl","CollarDrag","MessengerReport","CreepDadao","RifleDeflect","IjaBayonetGuard"].includes(pose.clip)){
      for(let i=0;i<bones.length;i++)if(/Thigh|Calf|Foot|Toe/.test(bones[i].name)){
        bones[i].position.copy(locomotion[i].p);bones[i].quaternion.copy(locomotion[i].q);
      }
    }
    if(pose.upperBody)for(let i=0;i<bones.length;i++)if(!/UpperArm|Forearm|Hand|Finger|Clavicle|Neck|Head/.test(bones[i].name)){
      bones[i].position.copy(locomotion[i].p);bones[i].quaternion.copy(locomotion[i].q);
    }
    if(pose.nativeArms)for(let i=0;i<bones.length;i++)if(/UpperArm|Forearm|Hand|Finger|Clavicle/.test(bones[i].name)){
      bones[i].position.copy(locomotion[i].p);bones[i].quaternion.copy(locomotion[i].q);
    }
    if(pose.additive)ApplyOpeningAdditive(performer,record,pose.additive);
    }else{rig.openingStoryboardState=null;}
    const blend=nativeCombat?1:Math.min(1,(clock-blendAt)/C.poseBlendS),mix=blend*blend*(3-2*blend);
    if(blendFrom&&blend<1)for(let i=0;i<bones.length;i++){
      if(rescueHandoff&&RescueHandoffBone(bones[i]))continue;
      bones[i].position.lerpVectors(blendFrom[i].p,bones[i].position,mix);
      blendTarget.copy(bones[i].quaternion);
      bones[i].quaternion.slerpQuaternions(blendFrom[i].q,blendTarget,mix);
    }
    SettleOpeningCaptive(soldier,pose);
    if(!rescueHandoff)displayed=Snapshot(shownBuffer);rig.root.updateMatrixWorld(true);
    acting.Apply(dt,state,pose);
    CorrectOpeningActorGrips(soldier,pose);
    let rescueHandoffApplied=false;
    if(rescueReady){
      // The kick owns the legs. Both empty hands have already released the
      // casualty, so return them to a relaxed ready pose while the foot acts.
      ApplyOpeningRescueReady(actor,clock);
      // The next native pose must blend from the upper body actually displayed,
      // not the discarded authored kick wrists that were never shown.
      displayed=Snapshot(shownBuffer);
    }
    if(rescueHandoff&&displayed){
      rescueHandoffApplied=true;
      // Draw back into the native weapon pose from the last displayed upper
      // body. Recurrent short turns cannot switch the fixed-start slerp arc as
      // the moving aim target crosses a quaternion hemisphere, and nativeCombat
      // cannot bypass an unfinished draw. The native hand bones still own the
      // weapon mount and finger grip; no independent weapon transform is added.
      let remaining=0;
      for(let i=0;i<bones.length;i++)if(RescueHandoffBone(bones[i])){
        const bone=bones[i],prior=displayed[i],angle=prior.q.angleTo(bone.quaternion);
        const maxTurn=(/Finger/.test(bone.name)?12:/Pelvis|Spine|Neck|Head/.test(bone.name)?1.2:3)*Math.PI/180*Math.min(3,Math.max(.1,dt*60)),positionMix=Math.min(1,dt*18);
        remaining=Math.max(remaining,Math.max(0,angle-maxTurn),prior.p.distanceTo(bone.position)*(1-positionMix));
        blendTarget.copy(bone.quaternion);
        bone.quaternion.copy(prior.q).rotateTowards(blendTarget,maxTurn);
        bone.position.lerpVectors(prior.p,bone.position,positionMix);
      }
      rig.root.updateWorldMatrix(true,true);displayed=Snapshot(shownBuffer);
      if(remaining<.004&&clock-blendAt>=C.poseBlendS)rescueHandoff=false;
      rig.openingRescueHandoff={active:rescueHandoff,remaining};
    }
    const clipRow=pose?record?.clips[pose.clip]:null;
    if(rescueHandoffApplied||pose?.nativeArms)actor._UpdateRiggedWeaponMount?.();
    else if(clipRow?.props?.weapon&&!pose.weaponHold)ApplyOpeningWeaponTrack(actor,clipRow,pose.seconds);
    else if(pose&&pose.clip!=="DadaoAmbush")performer?._AimWeapon(pose.weaponHold||clipRow?.weaponHold);
    else if(soldier.openingActorPerformance&&!rig.openingActorPerformanceState?.headOnly&&!rig.openingActorPerformanceState?.protected)
      actor._UpdateRiggedWeaponMount?.();
    if(clipRow?.props||rig.openingProps){
      rig.openingProps ||= new OpeningPropSet(actor,library?.config.props||{});
      rig.openingProps.Update(clipRow,pose?.seconds||0,rig.root);
    }
    soldier.openingStoryboardContact?.();
    if(actor.weaponGroup){
      const slung=pose?.clip==="InterrogateCrouch";
      // A clip with a `weapon` track decides visibility itself (a rifle thrown away, a
      // planted dadao); everything else keeps the 0922 slung-rifle rule.
      if(!clipRow?.props?.weapon)actor.weaponGroup.visible=!slung;
      if(slung&&!rig.openingSlungRifle){
        const prop=rig.openingSlungRifle=actor.weaponGroup.clone();
        actor.root.add(prop);
        prop.scale.setScalar(actor.weaponScale);
      }
      if(rig.openingSlungRifle){
        const prop=rig.openingSlungRifle;prop.visible=slung;
        if(slung){rig.bones.chest.getWorldPosition(prop.position);actor.root.worldToLocal(prop.position);prop.position.x-=.23;prop.position.z+=.18;prop.rotation.set(Math.PI/2,0,-.12,"YXZ");}
      }
    }
    rig.openingStoryboardState=pose?{...performer?.state,clipId:pose.clip,seconds:pose.seconds,blend:mix}:null;
    return result;
  };
}

/** Additive layer: q = q_base * inverse(q_reference) * q_additive(t) on the clip's masked bones.
 * pose.additive = { clip, seconds, weight } (weight 0..1). Reference: the additive clip's own
 * frame 0, or "Clip@0" from the manifest. Positions are left alone. */
function ApplyOpeningAdditive(performer,record,additive){
  const meta=OpeningClipMeta(additive?.clip),clip=record?.clips[additive?.clip];
  if(!performer||!meta?.additive||!clip)return;
  const weight=Math.max(0,Math.min(1,Number.isFinite(additive.weight)?additive.weight:1));
  if(weight<=0)return;
  const count=performer.bones.length;
  const sample=performer.additiveSample ||= new Float64Array(count*7);
  const reference=performer.additiveReference ||= new Float64Array(count*7);
  const refName=String(meta.additive.reference||"frame0");
  const refClip=refName==="frame0"?clip:record.clips[refName.split("@")[0]];
  if(!refClip)return;
  performer._SampleInto(clip,Number(additive.seconds)||0,sample);
  performer._SampleInto(refClip,0,reference);
  const masks=meta.additive.bones||[];
  performer.additiveMask ||= new Map();
  let mask=performer.additiveMask.get(additive.clip);
  if(!mask){
    mask=record.bones.map(name=>masks.some(role=>name.endsWith(" "+role)||name.includes(" "+role)));
    performer.additiveMask.set(additive.clip,mask);
  }
  for(let i=0;i<count;i++){
    if(!mask[i])continue;
    QuatRef.fromArray(reference,i*7+3).invert();
    QuatAdd.fromArray(sample,i*7+3);
    Quat.copy(QuatRef).multiply(QuatAdd);
    if(weight<1)Quat.slerp(QuatRef.identity(),1-weight);
    performer.bones[i].quaternion.multiply(Quat);
  }
}
