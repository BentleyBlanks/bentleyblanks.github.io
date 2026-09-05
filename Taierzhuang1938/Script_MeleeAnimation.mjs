// Blender-sampled melee clips. Retarget world-space rotation deltas onto each original bind skeleton.
import * as THREE from 'three';
import { MELEE_NRA_ANIMATIONS } from './Data_MeleeNraAnimations.mjs';
import { MELEE_IJA_ANIMATIONS } from './Data_MeleeIjaAnimations.mjs';
const q0=new THREE.Quaternion(),q1=new THREE.Quaternion(),qr=new THREE.Quaternion(),qp=new THREE.Quaternion(),qd=new THREE.Quaternion();
const v=new THREE.Vector3(),vp=new THREE.Vector3(),vs=new THREE.Vector3(),inv=new THREE.Matrix4();
function Samples(data,pose) {
  const clip=data.clips[pose.clip]; if(!clip)return null;
  const looping=clip.loop && !['charge','qte'].includes(pose.state);
  const time=pose.action==='Pressure' && pose.qteKind==='ground' ? 1-pose.progress : looping ? (pose.t%1+1)%1 : pose.state==='charge'?Math.min(1,pose.t/.38):pose.state==='qte'?(pose.qteResolve>0?pose.qteResolve:(pose.t%1+1)%1):pose.normalized;
  const frame=Math.max(0,Math.min(1,time||0))*data.frames;
  const index=Math.floor(frame),mix=frame-index;
  return {a:clip.frames[index],b:clip.frames[Math.min(index+1,data.frames)],mix};
}
export function SampleMeleeFirstPerson(pose) {
  if(!pose)return null;
  const pair=Samples(MELEE_NRA_ANIMATIONS,pose);if(!pair)return null;
  const start=MELEE_NRA_ANIMATIONS.parts.length*7;
  return Array.from({length:9},(_,i)=>THREE.MathUtils.lerp(pair.a[start+i],pair.b[start+i],pair.mix));
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
    // Apply 按深度顺序摆骨，父骨的 matrixWorld 在轮到子骨时已经是现成的；只有夹在
    // 两根采样骨之间、没被采样的中间节点会因上面的骨改了姿势而过期，提前记下来
    // （自上而下），摆骨前只刷新这几个。以前每根骨都 updateWorldMatrix(true) 爬到场景根，
    // 三名日军就要 0.8 ms/帧，占白刃战主线程两成。
    const posed=new Set(this.bones.map(r=>r.bone));
    for(const r of this.bones) {
      for(let p=r.bone.parent;p&&p!==root&&!posed.has(p);p=p.parent)r.links.unshift(p);
      if(r.links.length&&!posed.has(r.links[0].parent))r.links.length=0;   // 上面没有采样骨，初始那次整树刷新已经算准了
    }
    this.heightScale=(this.bones.find(b=>b.part==='Pelvis')?.position.y||1)/(this.data.faction==='Nra'?.942464:.876513);
    this.applied=false;this.lastClip=null;
  }
  Restore() {
    if(!this.applied)return;
    for(const r of this.bones){r.bone.position.copy(r.localPosition);r.bone.quaternion.copy(r.localRotation);r.bone.scale.copy(r.localScale);}
    this.applied=false;
  }
  Apply(pose) {
    if(!pose)return;
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
    this.root.updateWorldMatrix(true,true);this.applied=true;this.lastClip=pose.clip;
  }
}
