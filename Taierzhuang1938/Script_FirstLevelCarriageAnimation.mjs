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
// 这一帧画不画得到这个人。剔除层把整棵子树从场景里摘下来并清 visible
// （AiDirector._SetDetailedAttached），Actor.poseVisible 是同一条判据；纯逻辑
// 夹具里的 actor 是个普通对象，没有那个取值器，按同样的两项现算。
function PoseVisible(actor){
  if(!actor)return false;
  if(typeof actor.poseVisible==='boolean')return actor.poseVisible;
  const root=actor.root;return !!root&&root.visible&&root.parent!==null;
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
    this.floorChain=this.BuildFloorChain();
    // 上一次真的解出来的抬升量（rig.root 局部单位）。屏外那几帧沿用它，
    // 回到画面里由 actor.poseDirty 补一次真的求解。
    this.lastRootLift=0;
    this.floorStale=true;
  }
  /**
   * 脚底求解只读这几样的世界矩阵：鞋底探针真正指到的那些骨头（脚、趾，以及同一批
   * 鞋面顶点上权重不为零的小腿骨）、探针网格自己的父链。把 `actor.root` 到它们的
   * 路径取并集、自顶向下去重存成一条链，每帧只算这条链 —— 原来是整棵人物子树
   * （约 135 个节点）重算一遍，其中一百多个节点与鞋底毫无关系。
   * 找不到 `actor.root`（外部夹具换了树）时返回 null，退回整棵更新。
   */
  BuildFloorChain(){
    const top=this.rig.actor?.root;
    if(!top)return null;
    const chain=[],seen=new Set();
    const Add=node=>{
      const path=[];
      let at=node;
      while(at&&at!==top&&!seen.has(at)){path.push(at);at=at.parent;}
      if(!at)return false;                                   // 不在 actor.root 这棵树下
      if(at===top&&!seen.has(top)){seen.add(top);chain.push(top);}
      for(let i=path.length-1;i>=0;i--){seen.add(path[i]);chain.push(path[i]);}
      return true;
    };
    if(!Add(top))return null;
    for(const probe of this.soleProbes){
      for(const index of probe.boneIndices)if(!Add(probe.mesh.skeleton.bones[index]))return null;
      if(probe.mesh.parent&&!Add(probe.mesh.parent))return null;
    }
    return chain;
  }
  /** 这只探针的静态缓存还作不作数（有 morph、换了几何或改了顶点/蒙皮属性就不作数）。 */
  ProbeStale(probe){
    const mesh=probe.mesh;
    return !!(mesh.morphTargetInfluences?.some(weight=>weight!==0)
      ||mesh.geometry!==probe.geometry||!mesh.bindMatrix.equals(probe.bindMatrix)
      ||mesh.geometry.attributes.position.version!==probe.positionVersion
      ||mesh.geometry.attributes.skinIndex.version!==probe.indexVersion
      ||mesh.geometry.attributes.skinWeight.version!==probe.weightVersion);
  }
  /** 按 Three 的 updateMatrixWorld(force) 逐节点重算这条链，结果逐比特相同。 */
  UpdateFloorChain(){
    for(const node of this.floorChain){
      if(node.matrixAutoUpdate)node.updateMatrix();
      if(node.matrixWorldAutoUpdate!==false){
        if(node.parent===null)node.matrixWorld.copy(node.matrix);
        else node.matrixWorld.multiplyMatrices(node.parent.matrixWorld,node.matrix);
      }
      node.matrixWorldNeedsUpdate=false;
    }
    // 探针网格单独走一趟：只有 SkinnedMesh 的 updateMatrixWorld 重写会刷新
    // bindMatrixInverse，而下面按绑定空间算鞋底正要用它。
    for(const probe of this.soleProbes)probe.mesh.updateMatrixWorld(true);
  }
  ClipDuration(clipId){const clip=this.record.clips[clipId];if(!clip)throw Error('Missing carriage clip '+this.record.modelId+' '+clipId);return clip.duration;}
  Save(node){if(this.saved.has(node))return;const record=savedPool.pop()||{p:new Vector3(),q:new Quaternion(),s:new Vector3()};record.p.copy(node.position);record.q.copy(node.quaternion);record.s.copy(node.scale);this.saved.set(node,record);}
  Restore(){for(const [node,pose] of this.saved){node.position.copy(pose.p);node.quaternion.copy(pose.q);node.scale.copy(pose.s);savedPool.push(pose)}this.saved.clear();}
  FootFloor(){
    // SkinnedMesh overrides updateMatrixWorld to refresh bindMatrixInverse.
    // Object3D.updateWorldMatrix bypasses that override and measures stale skin
    // coordinates after a root-floor correction, producing a sinking feedback.
    const rig=this.rig;
    // 有探针失效时逐顶点那条路会读到腿链以外的骨头（那些顶点的四个槽里可能有
    // 骨盆、脊柱），所以整棵更新与腿链更新按「有没有失效的探针」二选一。
    let stale=false;
    for(const probe of this.soleProbes)if(this.ProbeStale(probe)){stale=true;break;}
    if(stale||!this.floorChain)rig.actor.root.updateMatrixWorld(true);
    else this.UpdateFloorChain();
    let floor=Infinity;
    for(const probe of this.soleProbes){
      const {mesh,vertices,points,boneIndices,matrices}=probe;
      // Mutable/morphed vertices retain the original evaluation path.
      if(this.ProbeStale(probe)){
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
  /**
   * @param {boolean} [options.updateWorld] 收尾要不要把整棵人物子树的世界矩阵发布出去。
   *   调用方自己紧接着就做一趟的（MissionTrainLifePose.Apply 的 `rig.root.updateWorldMatrix`）
   *   传 false —— 两趟之间没人动骨骼，算出来的矩阵一个字不差。
   */
  Sample(clipId,seconds,{weight=1,loop=true,deckY=this.soldier.missionTrainLife?.deckY,transitionSeconds=this.config.transitionSeconds??.16,updateWorld=true}={}){
    const clip=this.record.clips[clipId];if(!clip)throw Error('Missing carriage clip '+this.record.modelId+' '+clipId);
    weight=Clamp(weight,0,1);if(weight<=0)return;
    // 镜头外或已经交给远景层的人：骨骼照常采样（不能冻在上车姿势），但鞋底求解
    // 与世界矩阵这一帧没有任何人读。回到近景的那一帧 AiDirector 会置 poseDirty，
    // 下一次采样无条件补一次完整的。
    const actor=this.rig.actor,posed=PoseVisible(actor)||!!actor?.poseDirty;
    const baseFloor=posed&&weight<.999999?this.FootFloor():null;
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
    if(!posed){
      // 沿用上一次真的解出来的抬升量：屏外这几帧甲板与鞋底的相对高度几乎不动，
      // 一回到画面里 poseDirty 就让下一次采样重解。什么都不抬才会在回来的那一帧跳。
      rig.root.position.y+=this.lastRootLift;
      this.floorStale=true;
      this.lastClipId=clipId;this.lastSeconds=seconds;
      this.state={clipId,seconds,weight,loop:loop&&clip.loop,floor:this.state?.floor??null,stale:true};
      return;
    }
    // The authored sole is compared with the moving deck after all original-rig
    // tracks have been sampled. A scalar correction never alters pose or foot yaw.
    const floor=this.FootFloor(),ground=Number.isFinite(deckY)?deckY:this.groundAt?.(this.soldier.position.x,this.soldier.position.z);
    let correction=0,lift=0;
    if(Number.isFinite(ground)){
      const support=ground+this.config.floorClearanceM;
      // Preserve the support through a crouch-to-walk blend. Blending local
      // rotations can lower a shoe beneath both endpoints; weighting only the
      // corrective lift would leave that intermediate skin inside the deck.
      const target=baseFloor==null?support:Math.max(support,support*weight+baseFloor*(1-weight));
      correction=target-floor;
      lift=correction/(rig.actor.root.scale.y||1);
      rig.root.position.y+=lift;
    }
    this.lastRootLift=lift;this.floorStale=false;
    if(actor)actor.poseDirty=false;
    if(updateWorld)rig.actor.root.updateMatrixWorld(true);
    this.state={clipId,seconds,weight,loop:loop&&clip.loop,floor:floor+correction,stale:false};
    this.lastClipId=clipId;this.lastSeconds=seconds;
  }
}
