import * as THREE from 'three';
import {FPS_SKELETAL_ANIMATION} from './Data_FpsSkeletalAnimation.mjs';

export async function LoadFpsSkeletalAnimations() {
  const entries=await Promise.all(FPS_SKELETAL_ANIMATION.weaponIds.map(async id=>{
    const response=await fetch(`./Animation/FirstPerson/Data_Fps${id}Animations.json?v=${FPS_SKELETAL_ANIMATION.version}`);
    if(!response.ok)throw new Error(`FPS animation ${id}: HTTP ${response.status}`);
    return [id,await response.json()];
  }));
  return Object.fromEntries(entries);
}

const Normalize=name=>name.toLowerCase().replace(/[^a-z0-9]/g,'');
const LoopTime=(time,duration)=>((time%duration)+duration)%duration;

/** Playback of bone transforms evaluated and exported by Blender. */
export class FpsSkeletalAnimation {
  constructor(viewmodel,assets) {
    this.vm=viewmodel;this.assets=assets;this.clock=0;
    this.preview=null;this.current=null;
    this.position=new THREE.Vector3();this.quaternion=new THREE.Quaternion();
    this.other=new THREE.Quaternion();this.matrix=new THREE.Matrix4();
    this.unit=new THREE.Vector3(1,1,1);
    this.boneMap=new Map();
    viewmodel.riggedArms?.root.traverse(o=>{if(o.isBone)this.boneMap.set(Normalize(o.name),o);});
  }

  Clips() {return Object.keys(this.assets?.[this.vm.weaponId]?.clips||{});}
  Clip(name) {return this.assets?.[this.vm.weaponId]?.clips?.[name]||null;}

  Sample(values,clip,time) {
    const phase=THREE.MathUtils.clamp(time/clip.duration,0,1)*(clip.count-1);
    const a=values.length===7?0:Math.floor(phase)*7;
    const b=values.length===7?0:Math.min(clip.count-1,Math.floor(phase)+1)*7;
    const mix=phase-Math.floor(phase);
    this.position.set(THREE.MathUtils.lerp(values[a],values[b],mix),THREE.MathUtils.lerp(values[a+1],values[b+1],mix),THREE.MathUtils.lerp(values[a+2],values[b+2],mix));
    this.quaternion.fromArray(values,a+3).slerp(this.other.fromArray(values,b+3),mix).normalize();
  }

  Controls() {
    const vm=this.vm;
    return {weaponMount:vm.weaponMount,reloadPivot:vm.reloadPivot,swingPivot:vm.swingPivot,
      actionPivot:vm.actionPivot,bobPivot:vm.bobPivot,recoilPivot:vm.recoilPivot,
      handRight:vm.handRight.group,handLeft:vm.handLeft.group,contactRight:vm.gripContactRight,contactLeft:vm.gripContactLeft,
      clipProp:vm.clipProp,clipRounds:vm.clipProp.userData.rounds,magazineProp:vm.magazineProp,offhandGrenade:vm.offhandGrenade,
      ...Object.fromEntries(Object.entries(vm.rig?.parts||{}).map(([key,obj])=>['part_'+key,obj]))};
  }

  Apply(name,time,{weight=1,controls=null,visible=false}={}) {
    const clip=this.Clip(name),asset=this.assets?.[this.vm.weaponId];
    if(!clip||!asset)return false;
    for(let i=0;i<asset.bones.length;i++){
      const bone=this.boneMap.get(Normalize(asset.bones[i]));if(!bone)continue;
      this.Sample(clip.bones[i],clip,time);
      if(weight===1){bone.position.copy(this.position);bone.quaternion.copy(this.quaternion);}
      else {bone.position.lerp(this.position,weight);bone.quaternion.slerp(this.quaternion,weight);}
    }
    const objects=this.Controls();
    for(const [key,values] of Object.entries(clip.controls)){
      if(controls&&!controls.includes(key))continue;
      const obj=objects[key];if(!obj)continue;
      this.Sample(values,clip,time);
      if(weight===1){obj.position.copy(this.position);obj.quaternion.copy(this.quaternion);}
      else {obj.position.lerp(this.position,weight);obj.quaternion.slerp(this.quaternion,weight);}
      if(visible&&clip.visible[key])obj.visible=clip.visible[key][Math.min(clip.count-1,Math.floor(time/clip.duration*(clip.count-1)))];
    }
    const index=Math.min(clip.count-1,Math.floor(THREE.MathUtils.clamp(time/clip.duration,0,1)*(clip.count-1)));
    const contact=clip.contact?.[index];
    if(contact){this.vm.riggedArms.contactWeight.r=contact[0];this.vm.riggedArms.contactWeight.l=contact[1];}
    this.current={name,time,duration:clip.duration,frame:Math.round(time/clip.duration*(clip.count-1)),frames:clip.count,source:'BlenderMCP'};
    return true;
  }

  SetPreview(name,{time=0,playing=false,loop=true,speed=1}={}) {
    const clip=this.Clip(name);if(!clip)return false;
    if(!Number.isFinite(time)||!Number.isFinite(speed))return false;
    this.preview={name,time:THREE.MathUtils.clamp(time,0,clip.duration),playing:!!playing,loop:!!loop,speed:THREE.MathUtils.clamp(speed,.1,2)};
    this.Update(0,{});return this.Snapshot();
  }

  Seek(time) {
    if(!this.preview||!Number.isFinite(time))return false;
    this.preview.time=THREE.MathUtils.clamp(time,0,this.Clip(this.preview.name).duration);
    this.preview.playing=false;this.Update(0,{});return this.Snapshot();
  }

  Snapshot() {return {available:this.Clips(),...this.current,...this.preview};}

  State() {
    const clip=this.preview&&this.Clip(this.preview.name);
    if(!clip?.state)return null;
    const phase=THREE.MathUtils.clamp(this.preview.time/clip.duration,0,1)*(clip.count-1),a=Math.floor(phase),b=Math.min(a+1,clip.count-1);
    return clip.state[a].map((value,i)=>THREE.MathUtils.lerp(value,clip.state[b][i],phase-a));
  }

  Update(dt,input={}) {
    const vm=this.vm,arms=vm.riggedArms;
    if(!arms||!this.Clip('Idle')||vm.skeletalAnimationDisabled||(!this.preview&&!FPS_SKELETAL_ANIMATION.runtimeEnabled))return false;
    vm.armAnchor.position.set(0,0,0);vm.armAnchor.quaternion.identity();vm.armAnchor.scale.set(1,1,1);
    if(this.preview){
      const preview=this.preview,clip=this.Clip(preview.name);
      if(preview.playing){
        preview.time+=dt*preview.speed;
        if(preview.time>clip.duration){
          if(preview.loop)preview.time=LoopTime(preview.time,clip.duration);
          else {preview.time=clip.duration;preview.playing=false;}
        }
      }
      vm.root.rotation.set(0,0,0);vm.swayPivot.position.set(0,0,0);vm.swayPivot.quaternion.identity();
      vm.statePivot.position.set(0,0,0);vm.statePivot.quaternion.identity();
      vm.flash.visible=false;vm.flashTime=99;
      this.Apply(preview.name,preview.time,{visible:true});
      for(const side of ['r','l'])arms.operationPose[side]=arms.contactWeight[side]<.999?{source:'BlenderMCP'}:null;
    }else{
      if(input.meleeCombat||(input.moveSpeed||0)>.05||vm.sprintSpring.value>.001||vm.adsSpring.value>.001||vm.action||vm.flashTime<.6)return false;
      this.clock=input.elapsed??this.clock+dt;
      this.Apply('Idle',LoopTime(this.clock,this.Clip('Idle').duration));
    }
    vm.root.updateWorldMatrix(true,true);
    arms.MeasureSkeletalPose();
    this.current.constrained=false;
    return true;
  }
}
