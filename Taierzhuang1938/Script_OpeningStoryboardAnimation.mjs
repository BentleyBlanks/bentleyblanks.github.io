import { CutscenePerformer, LoadMachineGunCaptivesAnimation } from "./Script_CutscenePerformance.mjs";
import { OPENING_STORYBOARDS as C } from "./Data_OpeningStoryboards.mjs";
import { LoadMeleeAnimations } from "./Script_MeleeAnimationData.mjs";
let library, pending;
export function LoadOpeningStoryboardAnimation(){
  return pending ||= (async()=>{
    const Read=async(file)=>{const response=await fetch(C.animationBase+file+"?v="+C.version);if(!response.ok)throw Error(`Opening animation ${file}: ${response.status}`);return response.json();};
    const config=await Read("Data_OpeningStoryboardsAnimation.json");
    const [captives]=await Promise.all([LoadMachineGunCaptivesAnimation(),LoadMeleeAnimations()]);
    const models=new Map(await Promise.all(config.models.map(async row=>[row.id,await Read(row.file)])));
    for(const [id,record] of models){
      const source=captives.models.get(id);
      if(source&&JSON.stringify(source.bones)!==JSON.stringify(record.bones))throw Error(`Opening animation rig order: ${id}`);
      for(const clip of ["IjaBayonetGuard","CaptiveStandToKneel","CaptiveHandsUpWalk"])if(source?.clips[clip])record.clips[clip]=source.clips[clip];
    }
    return library={config,models};
  })();
}
export function InstallOpeningStoryboardAnimation(soldier){
  const actor=soldier?.actor,rig=actor?.characterRig;
  if(!rig||rig.openingStoryboardInstalled)return;
  rig.openingStoryboardInstalled=true;
  const original=actor.Update;
  let performer,clock=0,blendFrom,blendAt=0,lastKey,travelClock=0;
  const bones=[];rig.root.traverse(node=>{if(node.isBone)bones.push(node);});
  const Allocate=()=>bones.map(bone=>({p:bone.position.clone(),q:bone.quaternion.clone()}));
  const shownBuffer=Allocate(),baseBuffer=Allocate(),blendBuffer=Allocate();
  const Snapshot=out=>{for(let i=0;i<bones.length;i++){out[i].p.copy(bones[i].position);out[i].q.copy(bones[i].quaternion);}return out;};
  let displayed;
  actor.Update=function(dt,state){
    performer?.Restore();
    clock+=dt;
    const pose=soldier.openingStoryboardPose,record=library?.models.get(rig.modelId);
    if(soldier.openingStoryboardTravel!=null)state={...state,moveSpeed:soldier.openingStoryboardTravel/4.2,
      crouch:0,prone:0,idleLife:false,aim:soldier.openingStoryboardAim||0};
    if(pose?.clip==="DadaoAmbush")state={...state,meleeCombat:{weapon:"Dadao",state:"attack",action:"Heavy",clip:"DadaoHeavy",
      normalized:Math.min(1,pose.seconds/C.ambushS),t:pose.seconds,weight:1}};
    const result=original.call(this,dt,state);
    if(rig.openingSlungRifle)rig.openingSlungRifle.visible=false;
    if(!pose&&soldier.openingStoryboardTravel==null){
      if(lastKey==="InterrogateCrouch"&&actor.weaponGroup)actor.weaponGroup.visible=true;
      rig.openingStoryboardState=null;lastKey=null;displayed=null;blendFrom=null;return result;
    }
    // Native Kimodo death owns the guard from the instant the blade connects.
    // The kneeling captive retains his authored collapse and terminal pose.
    if(state.dead&&!pose){rig.openingStoryboardState=null;return result;}
    const key=pose?.clip||"Locomotion";
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
    }else{rig.openingStoryboardState=null;}
    const blend=Math.min(1,(clock-blendAt)/C.poseBlendS),mix=blend*blend*(3-2*blend);
    if(blendFrom&&blend<1)for(let i=0;i<bones.length;i++){
      bones[i].position.lerpVectors(blendFrom[i].p,bones[i].position,mix);
      bones[i].quaternion.slerpQuaternions(blendFrom[i].q,bones[i].quaternion,mix);
    }
    displayed=Snapshot(shownBuffer);rig.root.updateMatrixWorld(true);
    if(pose&&pose.clip!=="DadaoAmbush")performer?._AimWeapon(record?.clips[pose.clip]?.weaponHold);
    soldier.openingStoryboardContact?.();
    if(actor.weaponGroup){
      const slung=pose?.clip==="InterrogateCrouch";
      actor.weaponGroup.visible=!slung;
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
