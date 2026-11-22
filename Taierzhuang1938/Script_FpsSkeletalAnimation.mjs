import * as THREE from 'three';
import {FPS_SKELETAL_ANIMATION,FPS_SKELETAL_RELOADS} from './Data_FpsSkeletalAnimation.mjs';

export async function LoadFpsSkeletalAnimations() {
  const entries=await Promise.all(FPS_SKELETAL_ANIMATION.weaponIds.map(async id=>{
    const response=await fetch(`./Animation/FirstPerson/Data_Fps${id}Animations.json?v=${FPS_SKELETAL_ANIMATION.version}`);
    if(!response.ok)throw new Error(`FPS animation ${id}: HTTP ${response.status}`);
    return [id,await response.json()];
  }));
  return Object.fromEntries(entries);
}

const Normalize=name=>name.toLowerCase().replace(/[^a-z0-9]/g,'');
const IsLeftArmChain=name=>/l(clavicle|upperarm|forearm|hand)$/.test(Normalize(name));
const LoopTime=(time,duration)=>((time%duration)+duration)%duration;
const Smooth01=x=>{const t=THREE.MathUtils.clamp(x,0,1);return t*t*(3-2*t);};
const ViewWeightAt=(view,time)=>{
  const keys=view?.weight;if(!keys?.length)return 0;
  for(let i=1;i<keys.length;i++)if(time<=keys[i][0]){
    const [t0,w0]=keys[i-1],[t1,w1]=keys[i],u=THREE.MathUtils.clamp((time-t0)/Math.max(1e-6,t1-t0),0,1);
    return w0+(w1-w0)*u*u*(3-2*u);
  }
  return keys[keys.length-1][1];
};

/** Playback of bone transforms evaluated and exported by Blender. */
export class FpsSkeletalAnimation {
  constructor(viewmodel,assets) {
    this.vm=viewmodel;this.assets=assets;this.clock=0;
    this.preview=null;this.current=null;this.idleWeight=1;
    this.position=new THREE.Vector3();this.quaternion=new THREE.Quaternion();
    this.other=new THREE.Quaternion();this.matrix=new THREE.Matrix4();
    this.unit=new THREE.Vector3(1,1,1);
    this.boneMap=new Map();
    this.bindings=null;
    this.cameraScaleRig=null;
    if(viewmodel.fovRig?.parent===viewmodel.root){
      this.cameraScaleRig=new THREE.Group();this.cameraScaleRig.name='FpsReloadCameraScale';
      viewmodel.root.add(this.cameraScaleRig);this.cameraScaleRig.add(viewmodel.fovRig);
    }
    viewmodel.riggedArms?.root.traverse(o=>{if(o.isBone)this.boneMap.set(Normalize(o.name),o);});
  }

  // Uniform camera-space scale changes depth while preserving x/z and y/z.
  // Keep the public root directly under its camera (FOV/mount/disposal use it).
  SetCameraScale(scale=1) {
    const root=this.vm.root;
    const enabled=root?.parent?.isPerspectiveCamera&&root.position.lengthSq()<1e-12;
    const value=enabled&&Number.isFinite(scale)?THREE.MathUtils.clamp(scale,1,4):1;
    if(this.cameraScaleRig&&this.cameraScaleRig.scale.x!==value){
      this.cameraScaleRig.scale.setScalar(value);this.UpdateMatrices();
    }
  }

  UpdateMatrices() {
    // Object3D.updateWorldMatrix does not run SkinnedMesh.updateMatrixWorld's
    // attached-bind refresh. CPU probes and borrowed foreground scenes need the
    // same bind matrices as the real renderer, including on entry/exit frames.
    this.vm.root.updateWorldMatrix(true,false);
    this.vm.root.updateMatrixWorld(true);
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
      packetProp:vm.packetProp,packetRounds:vm.packetProp?.userData.rounds,usedPacketProp:vm.usedPacketProp,usedPacketRounds:vm.usedPacketProp?.userData.rounds,
      ...Object.fromEntries(Object.entries(vm.rig?.parts||{}).map(([key,obj])=>['part_'+key,obj]))};
  }

  Bindings(asset) {
    const vm=this.vm;
    if(this.bindings?.asset!==asset||this.bindings.rig!==vm.rig||this.bindings.arms!==vm.riggedArms){
      this.bindings={asset,rig:vm.rig,arms:vm.riggedArms,bones:asset.bones.map(name=>this.boneMap.get(Normalize(name))),objects:this.Controls()};
    }
    return this.bindings;
  }

  Apply(name,time,{weight=1,controls=null,visible=false,preserveParts=false}={}) {
    const clip=this.Clip(name),asset=this.assets?.[this.vm.weaponId];
    if(!clip||!asset)return false;
    const {bones,objects}=this.Bindings(asset);
    for(let i=0;i<bones.length;i++){
      const bone=bones[i];if(!bone)continue;
      this.Sample(clip.bones[i],clip,time);
      if(weight===1){bone.position.copy(this.position);bone.quaternion.copy(this.quaternion);}
      else {bone.position.lerp(this.position,weight);bone.quaternion.slerp(this.quaternion,weight);}
    }
    for(const key in clip.controls){
      const values=clip.controls[key];
      if(controls&&!controls.includes(key))continue;
      if(preserveParts&&key.startsWith('part_'))continue;
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

  /** Reload variant of this weapon that plays a Blender clip, if its clip shipped. */
  ReloadSpec() {
    const spec=FPS_SKELETAL_RELOADS[this.vm.weaponId];
    return spec&&this.Clip(spec.clip)?spec:null;
  }

  /** How far a playing reload clip has taken the first-person view to its `view` (0..1). */
  ReloadViewWeight() {
    const a=this.vm.action,s=a?.kind==='reload'?a.skeletal:null,keys=s?.view?.weight;
    if(!keys||!this.Clip(s.clip))return 0;
    const elapsed=a.t*a.duration,clipS=s.startS+elapsed;
    const w=ViewWeightAt(s.view,clipS);
    const blend=s.blendInS>0?Math.min(1,elapsed/s.blendInS):1;
    return w*blend*blend*(3-2*blend);
  }

  CanUseIdle(input={}) {
    const vm=this.vm;
    return !(input.meleeCombat||(input.moveSpeed||0)>.05||vm.sprintSpring.value>.001||vm.adsSpring.value>.001||(vm.wallLower||0)>.001||vm.action||vm.flashTime<.6||(vm.rig?.assetVersion&&vm.boltOpen));
  }

  // The clip owns the arms, the rifle and its moving parts for the whole reload;
  // the procedural reload is skipped (see Viewmodel._AnimReload). A reload that
  // starts part-way in eases in from the pose the previous frame left, and eases
  // out over `blendOutS` into the live post-reload pose so neither the baked
  // end-of-clip left-elbow return nor an ADS/moving exit snaps.
  UpdateReload(dt=0,input={}) {
    const vm=this.vm,a=vm.action,s=a?.kind==='reload'?a.skeletal:null;
    const clip=s?this.Clip(s.clip):null;
    if(!s||!clip)return false;
    const elapsed=a.t*a.duration,clipS=s.startS+elapsed;
    const remaining=Math.max(0,a.duration-elapsed);
    const blendOutS=s.blendOutS||0;
    const outLinear=blendOutS>0?THREE.MathUtils.clamp(remaining/blendOutS,0,1):1;
    const outW=Smooth01(outLinear);
    const weight=s.blendInS>0?Math.min(1,elapsed/s.blendInS):1;
    const asset=this.assets[vm.weaponId];
    const {bones,objects}=this.Bindings(asset);

    let toTarget=null;
    if(outLinear<1){
      // Evaluate the live post-reload target pose (Idle if hip-still, else live IK).
      const wantIdle=!(input.meleeCombat||(input.moveSpeed||0)>.05||vm.sprintSpring.value>.001||vm.adsSpring.value>.001||(vm.wallLower||0)>.001||(vm.rig?.assetVersion&&vm.boltOpen))&&!!this.Clip('Idle');
      this.SetCameraScale(1);
      if(wantIdle){
        this.Apply('Idle',LoopTime(this.clock,this.Clip('Idle').duration),{preserveParts:true});
        this.idleWeight=1;
      }else{
        const prevContactR=vm.riggedArms.contactWeight.r,prevContactL=vm.riggedArms.contactWeight.l;
        vm.riggedArms.operationPose.r=null;vm.riggedArms.operationPose.l=null;
        if(vm.riggedArms.elbowDirections){vm.riggedArms.elbowDirections.r=null;vm.riggedArms.elbowDirections.l=null;}
        vm.riggedArms.contactWeight.r=1;vm.riggedArms.contactWeight.l=1;
        vm.riggedArms.Update(Math.max(dt,1/60));
        vm.riggedArms.contactWeight.r=prevContactR;vm.riggedArms.contactWeight.l=prevContactL;
        this.idleWeight=0;
      }
      const targetNodes=[...bones,...s.controls.map(key=>objects[key])].filter(Boolean);
      toTarget=targetNodes.map(o=>({o,p:o.position.clone(),q:o.quaternion.clone()}));
    }

    this.SetCameraScale(THREE.MathUtils.lerp(1,s.view?.cameraScale??1,outW));
    // Cross-fade from the pose the reload started in (held aim, open-bolt idle) to the clip.
    if(weight<1&&!s.from){
      s.from=[...bones,...s.controls.map(key=>objects[key])].filter(Boolean).map(o=>({o,p:o.position.clone(),q:o.quaternion.clone()}));
    }
    this.Apply(s.clip,clipS,{controls:s.controls,visible:true});
    // Clamp the baked left-arm chain before its final 5-frame return snap so `outW`
    // carries the support elbow smoothly over the whole `blendOutS` window instead.
    if(outLinear<1&&blendOutS>0){
      const leftCapS=Math.max(s.startS,clip.duration-blendOutS*0.36);
      if(clipS>leftCapS){
        for(let i=0;i<bones.length;i++){
          const bone=bones[i];
          if(!bone||!IsLeftArmChain(asset.bones[i]))continue;
          this.Sample(clip.bones[i],clip,leftCapS);
          bone.position.copy(this.position);bone.quaternion.copy(this.quaternion);
        }
      }
    }
    if(weight<1){
      const w=Smooth01(weight);
      for(const {o,p,q} of s.from){o.position.lerpVectors(p,o.position,w);o.quaternion.slerpQuaternions(q,this.other.copy(o.quaternion),w);}
    }else s.from=null;
    if(toTarget){
      const blendToLive=1-outW;
      for(const {o,p,q} of toTarget){o.position.lerp(p,blendToLive);o.quaternion.slerp(q,blendToLive);}
    }
    if(!(a.packetRounds>0))for(const key of s.usedPacket)vm[key].visible=false;
    for(const side of ['r','l'])vm.riggedArms.operationPose[side]=vm.riggedArms.contactWeight[side]<.999?{source:'BlenderMCP'}:null;
    this.UpdateMatrices();
    vm._EjectReloadChamber();
    vm.riggedArms.MeasureSkeletalPose();
    this.current.constrained=false;
    return true;
  }

  Update(dt,input={}) {
    const vm=this.vm,arms=vm.riggedArms;
    const spec=FPS_SKELETAL_RELOADS[vm.weaponId];
    const nativePresentation=this.preview?this.preview.name===spec?.clip:vm.action?.kind==='reload'&&vm.action.skeletal&&this.Clip(vm.action.skeletal.clip);
    if(!nativePresentation)this.SetCameraScale(1);
    if(!arms||!this.Clip('Idle')||vm.skeletalAnimationDisabled||(!this.preview&&!FPS_SKELETAL_ANIMATION.runtimeEnabled)){this.SetCameraScale(1);return false;}
    vm.armAnchor.position.set(0,0,0);vm.armAnchor.quaternion.identity();vm.armAnchor.scale.set(1,1,1);
    if(!this.preview&&this.UpdateReload(dt,input))return true;
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
      const spec=FPS_SKELETAL_RELOADS[vm.weaponId],view=preview.name===spec?.clip?spec.view:null;
      if(view&&vm.root.parent?.isPerspectiveCamera){
        this.SetCameraScale(view.cameraScale??1);
        if(vm.fovRig&&vm.compensation)vm.fovRig.scale.set(vm.compensation.x,vm.compensation.y,
          vm.compensation.z*THREE.MathUtils.lerp(1,view.depthScale??1,ViewWeightAt(view,preview.time)));
      }
      this.Apply(preview.name,preview.time,{visible:true});
      for(const side of ['r','l'])arms.operationPose[side]=arms.contactWeight[side]<.999?{source:'BlenderMCP'}:null;
    }else{
      // The bake knows nothing of the wall carry pivot: lowered against a wall
      // the hands must follow the gun through IK, not hold the empty air.
      if(vm.action||vm.flashTime<.6||input.meleeCombat||(vm.wallLower||0)>.001||(vm.rig?.assetVersion&&vm.boltOpen)){
        this.idleWeight=0;
        return false;
      }
      const wantIdle=this.CanUseIdle(input);
      const fadeRate=dt>0?dt/(wantIdle?0.18:0.12):1;
      this.idleWeight=THREE.MathUtils.clamp((this.idleWeight??1)+(wantIdle?fadeRate:-fadeRate),0,1);
      if(this.idleWeight<=0.001)return false;
      this.clock=input.elapsed??this.clock+dt;
      if(this.idleWeight<0.999){
        arms.Update(dt);
        this.Apply('Idle',LoopTime(this.clock,this.Clip('Idle').duration),{weight:Smooth01(this.idleWeight),preserveParts:true});
      }else{
        // Holding motion owns the body pose, while the firearm state owns its
        // mechanism. An Idle bake from a closed rifle must not close a held bolt.
        this.Apply('Idle',LoopTime(this.clock,this.Clip('Idle').duration),{preserveParts:true});
      }
    }
    this.UpdateMatrices();
    arms.MeasureSkeletalPose();
    this.current.constrained=false;
    return true;
  }
}
