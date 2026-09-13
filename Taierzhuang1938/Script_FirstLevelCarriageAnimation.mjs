// Blender-authored original-rig tracks. Never changes the Soldier/Actor world root.
import { Vector3, Quaternion, Matrix4 } from 'three';
const Clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const Normalize=name=>name.toLowerCase().replace(/[^a-z0-9]/g,'');
const savedPool=[];
const soleProbeCache=new WeakMap();
// Cache immutable bind-space shoe data across clones. UV/normal seams with
// identical ordered skin influences need only one support sample.
function PrepareSoleProbes(mesh,vertices){
  const geometry=mesh.geometry,cached=soleProbeCache.get(geometry);
  if(cached&&cached.bindMatrix.equals(mesh.bindMatrix))return cached;
  const indices=geometry.attributes.skinIndex,weights=geometry.attributes.skinWeight;
  const position=geometry.attributes.position,boneIndices=[],soles=[],points=[],seen=new Set(),v=new Vector3();
  let originalTransforms=0;
  for(const index of vertices){
    let influence=0;
    for(let k=0;k<4;k++)if(/Foot|Toe/.test(mesh.skeleton.bones[indices.getComponent(index,k)]?.name||''))influence+=weights.getComponent(index,k);
    if(influence<=.65)continue;
    soles.push(index);v.fromBufferAttribute(position,index).applyMatrix4(mesh.bindMatrix);
    const point=[v.x,v.y,v.z];
    for(let k=0;k<4;k++){
      const bone=indices.getComponent(index,k),weight=weights.getComponent(index,k);
      let slot=boneIndices.indexOf(bone);
      if(weight!==0){originalTransforms++;if(slot<0){slot=boneIndices.length;boneIndices.push(bone);}}
      point.push(slot,weight);
    }
    const key=point.join(',');if(seen.has(key))continue;seen.add(key);points.push(...point);
  }
  const result={vertices:soles,points:new Float64Array(points),boneIndices,originalTransforms,geometry,positionVersion:position.version,indexVersion:indices.version,weightVersion:weights.version,bindMatrix:mesh.bindMatrix.clone()};
  soleProbeCache.set(geometry,result);return result;
}
let pending,library;
export function LoadFirstLevelCarriageAnimation(base='./Animation/FirstLevelCarriage/'){
  return pending ||= (async()=>{
    const response=await fetch(base+'Data_FirstLevelCarriageAnimation.json?v=20260912OpeningV1');
    if(!response.ok)throw Error('Carriage animation manifest HTTP '+response.status);
    const config=await response.json();
    const records=await Promise.all(config.models.map(async record=>{
      const response=await fetch(base+record.file+'?v='+record.sha256);
      if(!response.ok)throw Error('Carriage animation HTTP '+response.status+' '+record.id);
      return [record.id,await response.json()];
    }));
    library={config,models:new Map(records)};return library;
  })();
}
export function PrepareFirstLevelCarriageAnimation(soldier,groundAt){
  const rig=soldier?.actor?.characterRig,record=library?.models.get(rig?.modelId);
  if(!record||rig.disposed)return null;
  const animation=rig.firstLevelCarriageAnimation ||= new FirstLevelCarriageAnimation(soldier,record,library.config);
  animation.groundAt=groundAt;return animation;
}
export class FirstLevelCarriageAnimation{
  constructor(soldier,record,config){
    this.soldier=soldier;this.rig=soldier.actor.characterRig;this.record=record;this.config=config;
    this.saved=new Map();this.value=new Vector3();this.value2=new Vector3();this.q=new Quaternion();this.q2=new Quaternion();
    const nodes=new Map();this.rig.root.traverse(node=>nodes.set(Normalize(node.name),node));
    this.bones=record.bones.map(name=>{const node=nodes.get(Normalize(name));if(!node?.isBone)throw Error('Carriage bone binding '+record.modelId+' '+name);return node});
    if(record.stride!==7||!this.bones.length)throw Error('Carriage animation schema');
    this.lastPose=new Float64Array(this.bones.length*7);this.transitionPose=new Float64Array(this.bones.length*7);
    this.soleProbes=(this.rig.infantryGroundProbes||[]).map(({mesh,vertices})=>{
      const data=PrepareSoleProbes(mesh,vertices);
      return {mesh,...data,matrices:data.boneIndices.map(()=>new Matrix4())};
    });
  }
  ClipDuration(clipId){const clip=this.record.clips[clipId];if(!clip)throw Error('Missing carriage clip '+this.record.modelId+' '+clipId);return clip.duration;}
  Save(node){if(this.saved.has(node))return;const record=savedPool.pop()||{p:new Vector3(),q:new Quaternion(),s:new Vector3()};record.p.copy(node.position);record.q.copy(node.quaternion);record.s.copy(node.scale);this.saved.set(node,record);}
  Restore(){for(const [node,pose] of this.saved){node.position.copy(pose.p);node.quaternion.copy(pose.q);node.scale.copy(pose.s);savedPool.push(pose)}this.saved.clear();}
  FootFloor(){
    // SkinnedMesh overrides updateMatrixWorld to refresh bindMatrixInverse.
    // Object3D.updateWorldMatrix bypasses that override and measures stale skin
    // coordinates after a root-floor correction, producing a sinking feedback.
    const rig=this.rig;rig.actor.root.updateMatrixWorld(true);let floor=Infinity;
    for(const probe of this.soleProbes){
      const {mesh,vertices,points,boneIndices,matrices}=probe;
      // Mutable/morphed vertices retain the original evaluation path.
      if(mesh.morphTargetInfluences?.some(weight=>weight!==0)
        ||mesh.geometry!==probe.geometry||!mesh.bindMatrix.equals(probe.bindMatrix)
        ||mesh.geometry.attributes.position.version!==probe.positionVersion
        ||mesh.geometry.attributes.skinIndex.version!==probe.indexVersion
        ||mesh.geometry.attributes.skinWeight.version!==probe.weightVersion){
        for(const index of vertices){mesh.getVertexPosition(index,this.value2).applyMatrix4(mesh.matrixWorld);floor=Math.min(floor,this.value2.y);}
        continue;
      }
      for(let i=0;i<boneIndices.length;i++){
        const bone=boneIndices[i];matrices[i].multiplyMatrices(mesh.skeleton.bones[bone].matrixWorld,mesh.skeleton.boneInverses[bone]);
      }
      // Match Three's applyBoneTransform operation order, without rebuilding
      // each bone matrix or re-reading attributes for every shoe vertex.
      for(let at=0;at<points.length;at+=11){
        const x=points[at],y=points[at+1],z=points[at+2];let sx=0,sy=0,sz=0;
        for(let k=at+3;k<at+11;k+=2){
          const weight=points[k+1];if(weight===0)continue;
          const e=matrices[points[k]].elements,w=1/(e[3]*x+e[7]*y+e[11]*z+e[15]);
          sx+=(e[0]*x+e[4]*y+e[8]*z+e[12])*w*weight;
          sy+=(e[1]*x+e[5]*y+e[9]*z+e[13])*w*weight;
          sz+=(e[2]*x+e[6]*y+e[10]*z+e[14])*w*weight;
        }
        this.value2.set(sx,sy,sz).applyMatrix4(mesh.bindMatrixInverse).applyMatrix4(mesh.matrixWorld);
        floor=Math.min(floor,this.value2.y);
      }
    }
    if(!Number.isFinite(floor))throw Error('Carriage original-skin floor probes missing');return floor;
  }
  Sample(clipId,seconds,{weight=1,loop=true,deckY=this.soldier.missionTrainLife?.deckY,transitionSeconds=this.config.transitionSeconds??.16}={}){
    const clip=this.record.clips[clipId];if(!clip)throw Error('Missing carriage clip '+this.record.modelId+' '+clipId);
    weight=Clamp(weight,0,1);if(weight<=0)return;
    const baseFloor=weight<.999999?this.FootFloor():null;
    seconds=loop&&clip.loop?((seconds%clip.duration)+clip.duration)%clip.duration:Clamp(seconds,0,clip.duration);
    if(this.lastClipId&&this.lastClipId!==clipId){this.transitionPose.set(this.lastPose);this.transitionElapsed=0;this.transitioning=transitionSeconds>0;}
    if(this.lastClipId===clipId&&this.transitioning){const delta=seconds-this.lastSeconds;this.transitionElapsed+=Math.abs(delta<-.5&&loop?delta+clip.duration:delta);}
    const transition=this.transitioning?Clamp(this.transitionElapsed/Math.max(.001,transitionSeconds),0,1):1;
    if(transition>=1)this.transitioning=false;
    const index=seconds/clip.duration*(clip.frameCount-1),a=Math.floor(index),b=Math.min(a+1,clip.frameCount-1),blend=index-a;
    const stride=this.bones.length*7,values=clip.values;
    for(let i=0;i<this.bones.length;i++){
      const node=this.bones[i],offsetA=a*stride+i*7,offsetB=b*stride+i*7;this.Save(node);
      this.value.fromArray(values,offsetA).lerp(this.value2.fromArray(values,offsetB),blend);
      if(transition<1)this.value.lerp(this.value2.fromArray(this.transitionPose,i*7),1-transition);
      node.position.lerp(this.value,weight);
      this.q.fromArray(values,offsetA+3).slerp(this.q2.fromArray(values,offsetB+3),blend);
      if(transition<1)this.q.slerp(this.q2.fromArray(this.transitionPose,i*7+3),1-transition);
      node.quaternion.slerp(this.q,weight);node.position.toArray(this.lastPose,i*7);node.quaternion.toArray(this.lastPose,i*7+3);
    }
    const rig=this.rig;this.Save(rig.root);
    rig.root.position.y-=(rig.infantryFloorOffset||0)*weight;
    // The authored sole is compared with the moving deck after all original-rig
    // tracks have been sampled. A scalar correction never alters pose or foot yaw.
    const floor=this.FootFloor(),ground=Number.isFinite(deckY)?deckY:this.groundAt?.(this.soldier.position.x,this.soldier.position.z);
    let correction=0;
    if(Number.isFinite(ground)){
      const support=ground+this.config.floorClearanceM;
      // Preserve the support through a crouch-to-walk blend. Blending local
      // rotations can lower a shoe beneath both endpoints; weighting only the
      // corrective lift would leave that intermediate skin inside the deck.
      const target=baseFloor==null?support:Math.max(support,support*weight+baseFloor*(1-weight));
      correction=target-floor;
      rig.root.position.y+=correction/(rig.actor.root.scale.y||1);
    }
    rig.actor.root.updateMatrixWorld(true);
    this.state={clipId,seconds,weight,loop:loop&&clip.loop,floor:floor+correction};
    this.lastClipId=clipId;this.lastSeconds=seconds;
  }
}
