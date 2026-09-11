// Blender-sampled melee clips. Retarget world-space rotation deltas onto each original bind skeleton.
import * as THREE from 'three';
// 全身库表头在 Data_MeleeAnimationSets，帧数据由 Script_MeleeAnimationData 异步灌入（见该文件抬头）。
import { MELEE_NRA_ANIMATIONS, MELEE_IJA_ANIMATIONS } from './Data_MeleeAnimationSets.mjs';
import { LoadMeleeAnimations } from './Script_MeleeAnimationData.mjs';
import { MELEE_VIDEO_ANIMATIONS } from './Data_MeleeVideoAnimations.mjs';
import { FPS_DADAO_SWING } from './Data_FpsDadaoSwing.mjs';
import { MELEE_WEAPONS, MELEE_RULES } from './Data_MeleeCombat.mjs';
const q0=new THREE.Quaternion(),q1=new THREE.Quaternion(),qr=new THREE.Quaternion(),qp=new THREE.Quaternion(),qd=new THREE.Quaternion();
const v=new THREE.Vector3(),vp=new THREE.Vector3(),vs=new THREE.Vector3(),inv=new THREE.Matrix4();
function Samples(data,pose) {
  if(!data.loaded){LoadMeleeAnimations([data]);return null;}   // 数据未到：顺手开拉，本帧不摆
  const clip=data.clips[pose.clip]; if(!clip)return null;
  const looping=clip.loop && !['charge','qte'].includes(pose.state);
  const pressurePose=pose.state==='qte' && (pose.action==='Bind' || pose.action==='Pressure');
  const time=pressurePose ? 1-pose.progress : looping ? (pose.t%1+1)%1 : pose.state==='charge'?Math.min(1,pose.t/.38):pose.state==='qte'?(pose.qteResolve>0?pose.qteResolve:(pose.t%1+1)%1):(pose.animationNormalized??pose.normalized);
  const frame=Math.max(0,Math.min(1,time||0))*data.frames;
  const index=Math.floor(frame),mix=frame-index;
  const result={a:clip.frames[index],b:clip.frames[Math.min(index+1,data.frames)],mix};
  if(pose.transition && pose.transition.mix<1) {
    const previous=Samples(data,pose.transition.from);
    if(previous) {
      const values=result.a.map((v,i)=>THREE.MathUtils.lerp(THREE.MathUtils.lerp(previous.a[i],previous.b[i],previous.mix),THREE.MathUtils.lerp(v,result.b[i],mix),pose.transition.mix));
      return {a:values,b:values,mix:0};
    }
  }
  return result;
}
export function SampleMeleeFirstPerson(pose) {
  if(!pose)return null;
  const pair=Samples(MELEE_NRA_ANIMATIONS,pose);if(!pair)return null;
  const start=MELEE_NRA_ANIMATIONS.parts.length*7;
  return Array.from({length:9},(_,i)=>THREE.MathUtils.lerp(pair.a[start+i],pair.b[start+i],pair.mix));
}
/** Actual recovered wrist/shoulder/elbow tracks, sampled at gameplay phase time. */
export function SampleMeleeVideo(pose, transition = true) {
  if (!pose) return null;
  const authored = /^Dadao(Light|LightAlt|Heavy|Compact|CompactAlt|Charge)$/.test(pose.clip);
  const clip = authored ? FPS_DADAO_SWING : MELEE_VIDEO_ANIMATIONS.clips[pose.clip];
  let result = null;
  if (clip) {
    let time = THREE.MathUtils.clamp(pose.animationNormalized ?? pose.normalized ?? 0,0,1);
    if (authored) {
      const attack = MELEE_WEAPONS.Dadao[pose.action === 'Heavy' ? 'heavy' : 'light'];
      const duration = attack.windup+attack.active+attack.recovery;
      const start=attack.windup/duration,end=(attack.windup+attack.active)/duration;
      time=pose.action==='Charge' ? Math.min(1,(pose.t||0)/MELEE_RULES.chargeMinS)*clip.cutStart
        : time<start ? time/start*clip.cutStart : time<end
          ? clip.cutStart+(time-start)/(end-start)*(clip.cutEnd-clip.cutStart)
          : clip.cutEnd+(time-end)/(1-end)*(1-clip.cutEnd);
    }
    const last=clip.frames.length-1,frame=time*last;
    const i = Math.floor(frame), mix = frame-i, a = clip.frames[i], b = clip.frames[Math.min(last,i+1)];
    const values = a.map((value,index)=>THREE.MathUtils.lerp(value,b[index],mix));
    const rotation = new THREE.Quaternion().fromArray(a,3).slerp(new THREE.Quaternion().fromArray(b,3),mix).normalize();
    rotation.toArray(values,3);
    if(authored && /Compact/.test(pose.action)) {
      for(let j=0;j<3;j++)values[j]*=.8;
      new THREE.Quaternion().slerp(rotation,.85).toArray(values,3);
    }
    // Blend evaluated motion in one space. Applying the destination clip's
    // amplitude after a transition would also rescale its outgoing pose.
    if(!authored) {
      for(let j=0;j<3;j++)values[j]*=.45;
      new THREE.Quaternion().slerp(rotation,.65).toArray(values,3);
      for(let j=7;j<13;j++)values[j]*=.5;
      if(clip.source==='StaffThrustsV1') {values[1]*=.12/.45;values[2]*=.30/.45;}
    }
    result = {values, sourceArmLength:clip.sourceArmLength, weight:1, source:clip.source};
  }
  if (transition && pose.transition?.mix < 1) {
    const previous = SampleMeleeVideo(pose.transition.from,false), mix = pose.transition.mix;
    if (previous && result) {
      const rotation = new THREE.Quaternion().fromArray(previous.values,3)
        .slerp(new THREE.Quaternion().fromArray(result.values,3),mix);
      result.values = result.values.map((value,i)=>THREE.MathUtils.lerp(previous.values[i],value,mix));
      rotation.toArray(result.values,3);
      result.sourceArmLength=THREE.MathUtils.lerp(previous.sourceArmLength,result.sourceArmLength,mix);
    } else if (result) result.weight = mix;
    else if (previous) result = {...previous,weight:1-mix};
  }
  return result;
}
const recoveredCache=new WeakMap();
function RecoveredSample(data,pose) {
  let clip=data.clips[pose?.clip];if(clip?.aliasOf)clip=data.clips[clip.aliasOf];
  const meta=clip?.recoveredPose;if(!meta)return null;
  let cache=recoveredCache.get(meta);
  if(!cache){
    const text=atob(meta.frames),bytes=Uint8Array.from(text,c=>c.charCodeAt(0)),view=new DataView(bytes.buffer);
    const values=Float32Array.from({length:bytes.length/4},(_,i)=>view.getFloat32(i*4,true));
    cache={values,indices:new Map(meta.parts.map((part,i)=>[part,i]))};recoveredCache.set(meta,cache);
  }
  const phase=THREE.MathUtils.clamp(pose.animationNormalized??pose.normalized??0,0,1),knots=meta.runtimeTimeKnots;
  let i=1;while(i<knots.length-1&&phase>knots[i])i++;
  const source=THREE.MathUtils.lerp(meta.sourceFrameKnots[i-1],meta.sourceFrameKnots[i],(phase-knots[i-1])/(knots[i]-knots[i-1]));
  const frame=THREE.MathUtils.clamp((source-meta.sourceStartFrame)*meta.sampleFps/meta.sourceFrameRate,0,meta.frameCount-1);
  const a=Math.floor(frame)*meta.stride,b=Math.min(Math.floor(frame)+1,meta.frameCount-1)*meta.stride,mix=frame%1;
  if(meta.space!=='parent-relative')return{...cache,meta,a,b,mix};
  // glTF interpolates each local bone track before composing its hierarchy.
  // Interpolating world positions instead cuts across fast wrist arcs.
  const values=new Float32Array(meta.stride),position=new THREE.Vector3(),parentPosition=new THREE.Vector3();
  const rotation=new THREE.Quaternion(),other=new THREE.Quaternion(),parentRotation=new THREE.Quaternion();
  for(let i=0;i<=meta.parts.length;i++){
    const offset=i*7;
    position.set(THREE.MathUtils.lerp(cache.values[a+offset],cache.values[b+offset],mix),THREE.MathUtils.lerp(cache.values[a+offset+1],cache.values[b+offset+1],mix),THREE.MathUtils.lerp(cache.values[a+offset+2],cache.values[b+offset+2],mix));
    rotation.fromArray(cache.values,a+offset+3);other.fromArray(cache.values,b+offset+3);rotation.slerp(other,mix).normalize();
    const parent=meta.parents[i]??-1;
    if(parent>=0){parentPosition.fromArray(values,parent*7);parentRotation.fromArray(values,parent*7+3);position.applyQuaternion(parentRotation).add(parentPosition);rotation.premultiply(parentRotation);}
    position.toArray(values,offset);rotation.toArray(values,offset+3);
  }
  return{indices:cache.indices,values,meta,a:0,b:0,mix:0};
}
function ReadRecovered(sample,part,position,rotation) {
  const index=part===null?sample.meta.parts.length:sample.indices.get(part),a=sample.a+index*7,b=sample.b+index*7;
  position.fromArray(sample.values,a);v.fromArray(sample.values,b);position.lerp(v,sample.mix);
  rotation.fromArray(sample.values,a+3);q1.fromArray(sample.values,b+3);rotation.slerp(q1,sample.mix).normalize();
}
export class MeleeAnimationPlayer {
  constructor(root,kind) {
    this.root=root;this.data=String(kind).startsWith('ija')?MELEE_IJA_ANIMATIONS:MELEE_NRA_ANIMATIONS;
    root.updateWorldMatrix(true,true);inv.copy(root.matrixWorld).invert();root.getWorldQuaternion(qr).invert();
    this.bones=[];
    for(let index=0;index<this.data.parts.length;index++) {
      const part=this.data.parts[index];let bone=null;
      root.traverse(o=>{if(o.isBone&&o.name.replace(/_/g,' ').endsWith(' '+part))bone=o;});
      if(!bone)continue;
      let depth=0;for(let p=bone.parent;p;p=p.parent)depth++;
      const position=bone.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv);
      const rotation=bone.getWorldQuaternion(new THREE.Quaternion()).premultiply(qr);
      this.bones.push({bone,index,part,depth,position,rotation,localPosition:bone.position.clone(),localRotation:bone.quaternion.clone(),localScale:bone.scale.clone(),links:[]});
    }
    this.bones.sort((a,b)=>a.depth-b.depth);
    this.allBones=[...this.bones];
    for(const part of ['L Toe0','R Toe0']){
      let bone;root.traverse(b=>{if(b.isBone&&b.name.replaceAll('_',' ').endsWith(' '+part))bone=b});
      if(!bone)continue;let depth=0;for(let p=bone.parent;p;p=p.parent)depth++;
      this.allBones.push({bone,part,index:-1,depth,position:bone.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv),rotation:bone.getWorldQuaternion(new THREE.Quaternion()).premultiply(qr),localPosition:bone.position.clone(),localRotation:bone.quaternion.clone(),localScale:bone.scale.clone(),links:[]});
    }
    this.allBones.sort((a,b)=>a.depth-b.depth);
    // Apply 按深度顺序摆骨，父骨的 matrixWorld 在轮到子骨时已经是现成的；只有夹在
    // 两根采样骨之间、没被采样的中间节点会因上面的骨改了姿势而过期，提前记下来
    // （自上而下），摆骨前只刷新这几个。以前每根骨都 updateWorldMatrix(true) 爬到场景根，
    // 三名日军就要 0.8 ms/帧，占白刃战主线程两成。
    const posed=new Set(this.allBones.map(r=>r.bone));
    for(const r of this.allBones) {
      for(let p=r.bone.parent;p&&p!==root&&!posed.has(p);p=p.parent)r.links.unshift(p);
      if(r.links.length&&!posed.has(r.links[0].parent))r.links.length=0;   // 上面没有采样骨，初始那次整树刷新已经算准了
    }
    this.heightScale=(this.bones.find(b=>b.part==='Pelvis')?.position.y||1)/(this.data.faction==='Nra'?.942464:.876513);
    this.applied=false;this.lastClip=null;
    this.prop=new THREE.Group();this.prop.name='MeleeRecoveredProp';root.add(this.prop);this.propWeight=0;
  }
  Restore() {
    this.propWeight=0;
    if(!this.applied)return;
    for(const r of this.allBones){r.bone.position.copy(r.localPosition);r.bone.quaternion.copy(r.localRotation);r.bone.scale.copy(r.localScale);}
    this.applied=false;
  }
  Apply(pose) {
    if(!pose)return;
    const recovered=RecoveredSample(this.data,pose),from=pose.transition?.mix<1?RecoveredSample(this.data,pose.transition.from):null;
    if(recovered||from){this._ApplyRecovered(pose,recovered,from);return;}
    const pair=Samples(this.data,pose);if(!pair)return;
    const {a,b,mix}=pair;
    this.root.updateWorldMatrix(true,true);this.root.getWorldQuaternion(qr);
    for(const r of this.bones) {
      const {bone,index}=r,parent=bone.parent;
      bone.position.copy(r.localPosition);bone.scale.copy(r.localScale);
      for(const link of r.links)link.updateWorldMatrix(false,false);
      {
        v.set(THREE.MathUtils.lerp(a[index*7],b[index*7],mix),THREE.MathUtils.lerp(a[index*7+1],b[index*7+1],mix),THREE.MathUtils.lerp(a[index*7+2],b[index*7+2],mix));
        // Source skeletons share each faction's proportions; preserve each variant's native bind height.
        v.multiplyScalar(this.heightScale).add(r.position);
        this.root.localToWorld(v);parent.worldToLocal(v);bone.position.copy(v);
      }
      q0.fromArray(a,index*7+3).normalize();q1.fromArray(b,index*7+3).normalize();q0.slerp(q1,mix);
      qd.copy(qr).multiply(q0).multiply(r.rotation);
      parent.matrixWorld.decompose(vp,qp,vs);qp.invert();bone.quaternion.copy(qp.multiply(qd));
      bone.updateMatrix();bone.updateWorldMatrix(false,false);
    }
    this.propWeight=0;
    this.root.updateWorldMatrix(true,true);this.applied=true;this.lastClip=pose.clip;
  }
  _ApplyRecovered(pose,recovered,from) {
    const mix=pose.transition?.mix??1,previous=pose.transition?.from;
    const pelvis=this.bones.find(r=>r.part==='Pelvis').position.y;
    const currentLegacy=recovered?null:Samples(this.data,{...pose,transition:null});
    const previousLegacy=previous&&!from?Samples(this.data,{...previous,transition:null}):null;
    const Read=(r,sample,legacy,position,rotation)=>{
      if(sample){ReadRecovered(sample,r.part,position,rotation);position.multiplyScalar(pelvis/sample.meta.bindPelvisHeight);return;}
      if(r.index<0||!legacy){position.copy(r.position);rotation.copy(r.rotation);return;}
      const offset=r.index*7,{a,b,mix}=legacy;
      position.set(THREE.MathUtils.lerp(a[offset],b[offset],mix),THREE.MathUtils.lerp(a[offset+1],b[offset+1],mix),THREE.MathUtils.lerp(a[offset+2],b[offset+2],mix)).multiplyScalar(this.heightScale).add(r.position);
      rotation.fromArray(a,offset+3);q1.fromArray(b,offset+3);rotation.slerp(q1,mix).normalize().multiply(r.rotation);
    };
    this.root.updateWorldMatrix(true,true);this.root.getWorldQuaternion(qr);
    for(const r of this.allBones){
      const {bone}=r,parent=bone.parent;bone.scale.copy(r.localScale);
      for(const link of r.links)link.updateWorldMatrix(false,false);
      Read(r,recovered,currentLegacy,vp,qd);
      if(previous&&mix<1){Read(r,from,previousLegacy,vs,qp);vp.lerpVectors(vs,vp,mix);q0.copy(qd);qd.copy(qp).slerp(q0,mix);}
      this.root.localToWorld(vp);parent.worldToLocal(vp);bone.position.copy(vp);
      qd.premultiply(qr);parent.getWorldQuaternion(qp).invert();bone.quaternion.copy(qp.multiply(qd));
      bone.updateMatrix();bone.updateWorldMatrix(false,false);
    }
    const source=recovered||from;ReadRecovered(source,null,this.prop.position,this.prop.quaternion);
    this.prop.position.multiplyScalar(pelvis/source.meta.bindPelvisHeight);
    if(recovered&&from&&mix<1){ReadRecovered(from,null,vs,qp);vs.multiplyScalar(pelvis/from.meta.bindPelvisHeight);this.prop.position.lerpVectors(vs,this.prop.position,mix);q0.copy(this.prop.quaternion);this.prop.quaternion.copy(qp).slerp(q0,mix);}
    this.propWeight=recovered?(previous&&!from?mix:1):1-mix;
    if(pose.weapon==='Dadao')this.prop.rotateX(-Math.PI/2);
    this.root.updateWorldMatrix(true,true);this.applied=true;this.lastClip=pose.clip;
  }
}
