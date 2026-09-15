import * as THREE from "three";
import { ACTOR_DETAIL } from "./Data_Tuning_Ai.mjs";
import { BakeMissionBody } from "./Script_FirstLevelMissionAftermath.mjs";
import { CloneShadedMaterial } from "./Script_Materials.mjs";
import { AttachShadowDepth } from "./Script_ShadowDepth.mjs";
import { MergeBodyParts } from "./Script_PartAtlasMerge.mjs";
import { MissionTrainLifePose } from "./Script_FirstLevelMissionTrainLife.mjs";
import { MISSION_PEOPLE_TUNING as C } from "./Data_Tuning_FirstLevel.mjs";

// Visible people share the production character rig; two-bone IK corrects hands onto the actual rails.
export class MissionPeople {
  constructor({root,actorFactory,battlefield}){Object.assign(this,{root,actorFactory,battlefield});this.people=new Map();this.time=0;this.patients=new Map();this.patientMerge=new Map();this.patientOwned={materials:[],geometries:[],textures:[]};this.patientMatrix=new THREE.Matrix4();this.patientRotation=new THREE.Quaternion();}
  Begin(time,focus=null){this.focus=focus;this.dt=Math.max(0,Math.min(.05,time-this.time));this.time=time;for(const entry of this.people.values())entry.used=false;for(const parts of this.patients.values())for(const mesh of parts)mesh.count=0;}
  /**
   * 给某个人挂一段伏击动作（Script_FirstLevelAmbushAnimation 的 clip）。
   * `id` 是 Person / Patient 在这一层的 id；`next` 是放完之后接上的循环段（可为 null）。
   * 动作库还没交付时 PrepareAmbush 返回 null，这一层什么都不做，退回既有姿态。
   */
  SetAmbushClip(id,clipId,next=null){
    if(!id||!clipId)return false;
    (this.ambushClips ||= new Map()).set(id,{clipId,next,startedAt:this.time});
    return true;
  }
  AmbushClip(id){return this.ambushClips?.get(id)||null;}
  /** 采样某个 Person 身上挂着的伏击动作；没有库或没有这段就返回 false。 */
  PlayAmbushClip(entry,id,deckY=null){
    const performance=this.AmbushClip(id);
    if(!performance||!this.PrepareAmbush)return false;
    // 库可能还在下载：拿不到就每帧再试一次，别把 null 缓存成「这个人永远没有动作」。
    const animation=entry.ambushAnimation||(entry.ambushAnimation=this.PrepareAmbush(entry.actor)||null);
    if(!animation)return false;
    let clipId=performance.clipId,seconds=this.time-performance.startedAt;
    const duration=animation.ClipDuration(clipId);
    if(seconds>=duration&&performance.next){clipId=performance.next;seconds-=duration;}
    animation.Sample(clipId,seconds,{loop:clipId===performance.next,
      ...(Number.isFinite(deckY)?{deckY}:{})});
    return true;
  }
  Person(id,x,z,yaw,{alive=true,moving=false,crouch=false,kind="bearer",carryTarget=null,role=null}={}){
    let entry=this.people.get(id);
    if(!entry){
      const variant=[...id].reduce((n,c)=>n+c.charCodeAt(0),0);
      const actor=this.actorFactory.Create(kind==="civilian"?"civilian":"nra",{weapon:null,modelVariant:variant%5,seed:variant});
      const pose=actor.characterRig?new MissionTrainLifePose({actor}):null;if(pose)pose.basis=actor.root;
      actor.Update(.1,{moveSpeed:0});actor.root.updateWorldMatrix(true,false);
      const planted=actor.characterRig?Object.fromEntries(["L","R"].map(s=>[s,actor.characterRig.bones["foot"+s].getWorldQuaternion(new THREE.Quaternion())])):null;
      entry={actor,pose,planted,phase:variant*.17,used:true,last:{x,z},speed:0};
      this.people.set(id,entry);this.root.add(actor.root);
    }
    entry.used=true;
    const {actor,pose}=entry;actor.root.visible=true;
    const distance=Math.hypot(x-entry.last.x,z-entry.last.z);
    const speed=this.dt>0&&distance<1?distance/this.dt:0;
    entry.last={x,z};entry.speed+=(speed-entry.speed)*Math.min(1,this.dt*10);
    actor.root.position.set(x,this.battlefield.GroundHeight(x,z),z);actor.root.rotation.set(0,yaw,0);
    const away=this.focus?Math.hypot(x-this.focus.x,z-this.focus.z):0;
    actor.SetShadowEnabled(away<=ACTOR_DETAIL.shadowM);
    const interval=away>C.farAnimationM?C.farAnimationS:away>C.nearAnimationM?C.midAnimationS:
      away>C.closeAnimationM?(entry.speed<C.walkThresholdMps?C.idleAnimationS:C.nearAnimationS):0;
    if(alive&&entry.nextPoseAt!=null&&this.time<entry.nextPoseAt)return actor;
    entry.nextPoseAt=interval?(Math.floor((this.time+entry.phase)/interval)+1)*interval-entry.phase:this.time;
    const poseDt=Math.min(.2,this.time-(entry.lastPoseAt??this.time-this.dt));entry.lastPoseAt=this.time;pose?.Restore();
    entry.ambushAnimation?.Restore?.();
    // 伏击里挨刀的抬担架员：走烘焙好的倒地段，而不是通用布娃娃。库缺席时退回下面两条。
    if(this.AmbushClip(id)&&actor.characterRig){
      actor.characterRig.Update(poseDt,{moveSpeed:0,elapsed:this.time});
      if(this.PlayAmbushClip(entry,id)){actor.root.updateMatrixWorld(true);return actor;}
    }
    if(!alive){
      actor.Ragdoll(new THREE.Vector3(Math.sin(entry.phase),0,Math.cos(entry.phase)));
      actor.Update(poseDt,{dead:true,dying:1,elapsed:this.time});
      return actor;
    }
    const gait=entry.speed>C.walkThresholdMps?Math.min(1,entry.speed/C.gaitSpeedMps):0;
    const rig=actor.characterRig;
    if(carryTarget && rig){
      // A halted bearer keeps a loaded stance, with planted feet instead of jogging in place.
      rig.Play(role==="front"?"CarryStretcherFront":"CarryStretcherRear");
      rig.currentAction.setEffectiveTimeScale(gait?entry.speed/C.carrySourceMps:0);
      rig.Update(poseDt,{carryRole:role||"rear",moveSpeed:gait,elapsed:this.time});
      const b=rig.bones;pose.basis=actor.root;actor.root.updateWorldMatrix(true,false);
      const pelvis=actor.root.worldToLocal(pose.World(b.pelvis));
      pose.Save(rig.root);
      const centered=pose.World(rig.root).add(pose.Local(-pelvis.x,0,(role==="front"?.06:-.06)-pelvis.z).sub(pose.Local(0,0,0)));
      rig.root.position.copy(rig.root.parent.worldToLocal(centered));
      actor.root.updateWorldMatrix(true,false);
      const feet=["L","R"].map(s=>({s,p:pose.World(b["foot"+s]),q:b["foot"+s].getWorldQuaternion(new THREE.Quaternion())}));
      const halt=1-Math.min(1,entry.speed/.3);
      for(const f of feet){f.p.lerp(pose.Local(f.s==="L"?-.16:.16,.105,f.s==="L"?-.08:.04),halt);
        f.q.slerp(actor.root.getWorldQuaternion(new THREE.Quaternion()).multiply(entry.planted[f.s]),halt);}
      pose.Save(rig.root);
      rig.root.position.y-=C.loadSinkM/rig.root.parent.getWorldScale(new THREE.Vector3()).y;
      actor.root.updateWorldMatrix(true,false);
      for(const f of feet){pose.Chain(b["thigh"+f.s],b["calf"+f.s],b["foot"+f.s],f.p,pose.Local(f.s==="L"?-.24:.24,.5,-1));
        pose.Save(b["foot"+f.s]);b["foot"+f.s].quaternion.copy(b["foot"+f.s].parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(f.q));}
      pose.Tilt(b.chest,-C.loadLeanRad,0,Math.sin(this.time*C.breathRate+entry.phase)*.012);
      entry.gripErrors=[];
      for(const side of ["L","R"]){
        const shoulder=actor.root.worldToLocal(pose.World(b["upperArm"+side]));
        const other=actor.root.worldToLocal(pose.World(b["upperArm"+(side==="L"?"R":"L")]));
        const handSide=shoulder.x<other.x?-1:1;
        const target=carryTarget[handSide<0?"left":"right"];
        const grip=rig.Grip("weapon"+side), hand=b["hand"+side];
        // Palm contact rather than wrist origin; iterate to absorb the rotated hand offset.
        for(let i=0;i<4;i++){
          actor.root.updateWorldMatrix(true,false);
          const offset=pose.World(grip).sub(pose.World(hand));
          pose.Chain(b["upperArm"+side],b["forearm"+side],hand,target.clone().sub(offset),
            pose.Local(handSide*.8,.8,role==="front"?.3:-.3));
        }
        entry.gripErrors.push(pose.World(grip).distanceTo(target));
      }
      pose.Tilt(b.head,-.025,Math.sin(this.time*.43+entry.phase)*.045,0);
    }else{
      const state={moveSpeed:gait,moveSpeedMps:entry.speed,woundedWalk:kind==="wounded"?1:0,crouch:crouch?1:0,elapsed:this.time};
      if(rig)rig.Update(poseDt,state);else actor.Update(poseDt,state);
      if(rig){
        pose.basis=actor.root;
        const b=rig.bones,chest=actor.root.worldToLocal(pose.World(b.chest)).y;
        for(const side of ["L","R"]){
          const sign=side==="L"?-1:1,swing=Math.sin(this.time*5+entry.phase)*gait;
          const injured=kind==="wounded"&&side==="L";
          pose.Chain(b["upperArm"+side],b["forearm"+side],b["hand"+side],
            pose.Local(injured?-.10:sign*.25,chest-(injured?.25:.48),injured?-.22:swing*sign*.22),pose.Local(sign*.8,.8,.1));
          if(gait===0&&!crouch){
            pose.Chain(b["thigh"+side],b["calf"+side],b["foot"+side],pose.Local(sign*.15,.105,sign*.07),pose.Local(sign*.24,.5,-1));
            pose.Save(b["foot"+side]);b["foot"+side].quaternion.copy(b["foot"+side].parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(actor.root.getWorldQuaternion(new THREE.Quaternion())).multiply(entry.planted[side]));
          }
        }
        pose.Tilt(rig.bones.head,Math.sin(this.time*.6+entry.phase)*.025,Math.sin(this.time*.31+entry.phase)*C.watchYawRad,0);
        pose.Tilt(rig.bones.chest,-(kind==="wounded"?.07:0),Math.sin(this.time*.31+entry.phase)*.035,Math.sin(this.time*.8+entry.phase)*.012);
      }
    }
    actor.root.updateMatrixWorld(true);return actor;
  }
  /**
   * 躺在担架上的伤员，走**带骨架的 Person** 而不是实例化的烘焙姿势 ——
   * PatientStabbed / PatientWoundedIdle 只有骨架才播得了（老周挨那一刀之后换到这条路）。
   * `deckY` 是担架床面高度：C 的两段伤员动作就是按这个面烘的（canvas deckY+0.003、
   * 骨盆 +0.18、肚子 +0.29）。库不在、模型没内容或采样失败时返回 false，
   * 调用方退回 Patient() 那条实例化路。
   */
  RiggedPatient(id,x,y,z,yaw,deckY){
    if(!this.AmbushClip(id)||!this.PrepareAmbush)return false;
    let entry=this.people.get(id);
    if(!entry){
      // 认可的 NRA 外观只有 LugouNra02(1) 与 LugouNra05(4)，两个都烘了伤员段。
      const actor=this.actorFactory.Create("nra",{weapon:null,modelVariant:1,seed:id.length});
      if(!actor?.characterRig){actor?.Dispose?.();return false;}
      entry={actor,pose:null,planted:null,phase:0,used:true,last:{x,z},speed:0,patient:true};
      this.people.set(id,entry);this.root.add(actor.root);
    }
    entry.used=true;
    const actor=entry.actor;
    actor.root.position.set(x,y,z);actor.root.rotation.set(0,yaw,0);
    const poseDt=Math.min(.2,this.time-(entry.lastPoseAt??this.time-this.dt));entry.lastPoseAt=this.time;
    entry.ambushAnimation?.Restore?.();
    actor.root.visible=true;
    actor.characterRig.Update(poseDt,{moveSpeed:0,elapsed:this.time});
    if(!this.PlayAmbushClip(entry,id,deckY)){actor.root.visible=false;return false;}
    actor.root.updateMatrixWorld(true);
    return true;
  }
  Patient(id,x,y,z,yaw,time){
    const variant=id.length%2;let parts=this.patients.get(variant);
    if(!parts){
      const materials=new Map(),baked=BakeMissionBody(this.actorFactory,{side:"nra",pose:variant,patient:true},materials);
      // Own material per instanced table: sharing the skinned actors' material makes three re-derive the program every draw.
      // 分件按着色签名合成图集网格（与尸体层同一路），七只网格降到四五只。
      const merged=MergeBodyParts(baked.map(part=>({key:part.key,source:materials.get(part.key),tiers:[part.geometry]})),
        {clone:CloneShadedMaterial,cache:this.patientMerge,owned:this.patientOwned});
      parts=merged.map(entry=>{const mesh=new THREE.InstancedMesh(entry.tiers[0],entry.material,64);
        mesh.name="MissionLitterPatient";mesh.castShadow=true;mesh.receiveShadow=true;AttachShadowDepth(mesh);mesh.frustumCulled=false;mesh.count=0;
        this.root.add(mesh);return mesh;});this.patients.set(variant,parts);
    }
    this.patientRotation.setFromEuler(new THREE.Euler(0,yaw,0));
    this.patientMatrix.compose(new THREE.Vector3(x,y+.01+Math.sin(time*1.7+id.length)*.003,z),this.patientRotation,new THREE.Vector3(.94,.94,.94));
    for(const mesh of parts){mesh.setMatrixAt(mesh.count++,this.patientMatrix);mesh.instanceMatrix.needsUpdate=true;}
  }
  End(){for(const entry of this.people.values())if(!entry.used)entry.actor.root.visible=false;
    // 空桶照样走一整趟 setProgram（three 的 primcount 早退在那后面），摘出渲染列表。
    for(const parts of this.patients.values())for(const mesh of parts)mesh.visible=mesh.count>0;}
  State(){return {count:this.people.size,visible:[...this.people.values()].filter(e=>e.used).length,
    maxGripError:Math.max(0,...[...this.people.values()].filter(e=>e.used).flatMap(e=>e.gripErrors||[]))};}
  Dispose(){for(const entry of this.people.values())entry.actor.Dispose();this.people.clear();
    for(const parts of this.patients.values())for(const mesh of parts){mesh.removeFromParent();mesh.geometry.dispose();mesh.material.dispose();}this.patients.clear();
    for(const texture of this.patientOwned.textures)texture.dispose();this.patientOwned.textures.length=0;this.patientMerge.clear();}
}

/**
 * 屋内伏击的演出层：`soldier.missionAmbushClip` 挂着的那一段盖在 mixer 之上。
 * 与车厢那一层同一条纪律 —— 采样之前先 Restore，只写骨骼局部，从不碰世界根。
 * 动作库（Package C 的 Animation/FirstLevelAmbush）没交付时 Prepare 返回 null，
 * 这一层整条静默让路，人物退回既有的站姿/受击/倒地姿态。
 *
 * @param {object} soldier 目标士兵
 * @param {(soldier:object)=>object|null} Prepare 采样器工厂（运行时注入）
 */
export function InstallAmbushPerformance(soldier,Prepare){
  const rig=soldier?.actor?.characterRig;
  if(!rig||typeof rig.Update!=="function"||rig.missionAmbushPose)return false;
  rig.missionAmbushPose=true;
  const original=rig.Update;
  rig.Update=function UpdateMissionAmbush(dt,state={}){
    rig.missionAmbushAnimation?.Restore?.();
    const result=original.call(this,dt,state);
    const performance=soldier.missionAmbushClip;
    if(!performance||soldier.alive===false||state.dead)return result;
    // 库可能还在下载：拿不到就下一帧再试，别缓存成「这个人永远没有动作」。
    const animation=rig.missionAmbushAnimation||(rig.missionAmbushAnimation=Prepare?.(soldier)||null);
    if(!animation){soldier.missionAmbushPending=true;return result;}
    soldier.missionAmbushPending=false;
    animation.Sample(performance.clipId,performance.seconds,{loop:!!performance.loop});
    return result;
  };
  return true;
}

// Idle observation layers onto existing animation; it releases immediately on fire,
// movement, melee, carrying or a train activity and never rotates an active shot.
export function InstallMissionSentry(soldier){
  const actor=soldier?.actor,rig=actor?.characterRig;
  if(!rig||rig.missionSentryPose)return;
  rig.missionSentryPose=true;
  const original=rig.Update,pose=new MissionTrainLifePose(soldier),phase=(soldier.id||1)*1.37;
  let time=0;
  rig.Update=function UpdateMissionSentry(dt,state={}){
    pose.Restore();const result=original.call(this,dt,state);time+=Math.max(0,dt);
    if(soldier.missionCarriageAction)return result;
    if(soldier.missionRescueTarget && soldier.alive){
      pose.basis=actor.root;const b=rig.bones;actor.root.updateWorldMatrix(true,false);
      pose.Tilt(b.chest,.24,0,0);rig.root.updateWorldMatrix(true,true);
      pose.Chain(b.upperArmL,b.forearmL,b.handL,soldier.missionRescueTarget,pose.Local(-.5,.8,-.5));
      pose.Chain(b.upperArmR,b.forearmR,b.handR,soldier.missionRescueTarget.clone().addScaledVector(pose.Local(.22,0,0).sub(pose.Local(0,0,0)),1),pose.Local(.5,.8,-.5));
      rig.root.updateWorldMatrix(true,true);return result;
    }
    if(!soldier.alive || soldier.squadMarchCommand?.breath || state.dead || state.firing || state.moveSpeed>.08 || state.carryRole || state.meleeCombat ||
      soldier.target || soldier.missionTrainLife?.weight>.01)return result;
    pose.basis=actor.root;
    const b=rig.bones,scan=Math.sin(time*.23+phase);
    pose.Tilt(b.head,Math.sin(time*.49+phase)*.045,scan*.32,Math.sin(time*.31+phase)*.025);
    pose.Tilt(b.chest,Math.sin(time*.65+phase)*.014,scan*.08,Math.sin(time*.42+phase)*.018);
    rig.root.updateWorldMatrix(true,true);
    return result;
  };
}
