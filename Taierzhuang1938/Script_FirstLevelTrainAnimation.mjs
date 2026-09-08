// Original-rig local tracks; animation never writes a Soldier/Actor world root.
import {Vector3,Quaternion} from 'three';
const SAVE_POOL=[];
import {GLTFLoader} from './vendor/three/examples/jsm/loaders/GLTFLoader.js';
const Clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const Smooth=x=>{x=Clamp(x,0,1);return x*x*(3-2*x)};
let libraryPromise,library;
export function LoadFirstLevelTrainAnimation(base='./Animation/FirstLevelTrain/') {
 return libraryPromise ||= (async()=>{
  const response=await fetch(base+'Data_FirstLevelTrainAnimation.json?v=20260908TrainGameV2');
  if(!response.ok)throw Error('First-level train animation manifest HTTP '+response.status);
  const config=await response.json(),loader=new GLTFLoader();
  const models=await Promise.all(config.models.map(async record=>({record,gltf:await loader.loadAsync(base+record.file+'?v='+record.sourceAnimationSha256)})));
  library={config,models:new Map(models.map(m=>[m.record.id,m]))};return library;
 })();
}
export function PrepareFirstLevelTrainAnimation(soldier,groundAt) {
 const rig=soldier?.actor?.characterRig,entry=library?.models.get(rig?.modelId);
 if(!entry||rig.disposed)return null;
 const animation=rig.firstLevelTrainAnimation ||= new FirstLevelTrainAnimation(rig,entry.gltf,entry.record,library.config);
 animation.groundAt=groundAt;return animation;
}
export class FirstLevelTrainAnimation {
 constructor(rig,gltf,record,config){
  this.rig=rig;this.record=record;this.config=config;this.saved=new Map();
  this.sizeScale=rig.modelScale*(rig.actor?.root.scale.y||1)/record.nominalScale;
  if(this.sizeScale<config.profiles[0]-1e-6||this.sizeScale>config.profiles.at(-1)+1e-6)throw Error('Unsupported train character height '+this.sizeScale);
  const hi=config.profiles.findIndex(k=>k>this.sizeScale),index=hi<0?config.profiles.length-1:Math.max(1,hi);
  const lo=config.profiles[index-1],up=config.profiles[index];this.profileWeight=Clamp((this.sizeScale-lo)/(up-lo),0,1);
  const clips=[lo,up].map(k=>gltf.animations.find(c=>c.name===config.clipPrefix+Math.round(k*100)));
  if(clips.some(c=>!c))throw Error('Missing train height profile');
  const upper=new Map(clips[1].tracks.map(t=>[t.name,t]));
  this.tracks=clips[0].tracks.map(track=>{
   const dot=track.name.lastIndexOf('.'),name=track.name.slice(0,dot),property=track.name.slice(dot+1);
   const node=rig.root.getObjectByName(name),other=upper.get(track.name);
   if(!node||!other||!['position','quaternion','scale'].includes(property))throw Error('Train track binding '+track.name);
   return {node,property,a:track.createInterpolant(),b:other.createInterpolant()};
  });
  this.anchor=new Vector3(...record.sourceAnchor);this.value=new Vector3();this.value2=new Vector3();this.q=new Quaternion();this.q2=new Quaternion();
  this.duration=config.approachSeconds+config.sourceEndSeconds-config.riseSourceStartSeconds+config.releaseSeconds;
 }
 // Saved transforms are pooled records: 41 riders x ~60 tracks of clone() was 300 KB of garbage per frame.
 Save(node){if(this.saved.has(node))return;const r=SAVE_POOL.pop()||{p:new Vector3(),q:new Quaternion(),s:new Vector3()};r.p.copy(node.position);r.q.copy(node.quaternion);r.s.copy(node.scale);this.saved.set(node,r)}
 Restore(){for(const [node,p] of this.saved){node.position.copy(p.p);node.quaternion.copy(p.q);node.scale.copy(p.s);SAVE_POOL.push(p)}this.saved.clear()}
 SeatOffset(){
  // Actor-space metres, before yaw but after actor size. The original seat is fixed.
  const scale=this.record.nominalScale*this.sizeScale;
  return {x:-this.anchor.x*scale,z:-this.anchor.z*scale-this.record.seatForwardOffsetM};
 }
 FootFloor(){
  this.rig.actor.root.updateMatrixWorld(true);let minimum=Infinity;
  for(const {mesh,vertices} of this.rig.infantryGroundProbes)for(const index of vertices){
   mesh.getVertexPosition(index,this.value2).applyMatrix4(mesh.matrixWorld);minimum=Math.min(minimum,this.value2.y);
  }
  if(!Number.isFinite(minimum))throw Error('Missing original-skin ground probes');
  return minimum;
 }
 Sample(seconds,weight=1){
  weight=Clamp(weight,0,1);if(weight<=0)return;
  seconds=Clamp(seconds,0,this.config.sourceEndSeconds);
  for(const track of this.tracks){
   const {node,property}=track;this.Save(node);
   const a=track.a.evaluate(seconds),b=track.b.evaluate(seconds);
   if(property==='quaternion'){
    this.q.fromArray(a).slerp(this.q2.fromArray(b),this.profileWeight);
    node.quaternion.slerp(this.q,weight);
   }else{
    this.value.fromArray(a).lerp(this.value2.fromArray(b),this.profileWeight);
    node[property].lerp(this.value,weight);
   }
  }
  const rig=this.rig;this.Save(rig.root);
  // Cancel only the current base clip's ground correction; Restore returns it
  // before CharacterModel subtracts it on the next frame.
  rig.root.position.y-=(rig.infantryFloorOffset||0)*weight;
  this.value.copy(this.anchor).multiply(rig.root.scale).applyQuaternion(rig.root.quaternion);
  rig.root.position.addScaledVector(this.value,-weight);
  // 【2026-09-08 帧成本】这里原来收尾一句 `rig.root.updateWorldMatrix(true,true)`，
  // 而两个调用方（MissionTrainLifePose.Apply、_import 的 TrainGameVerify）在返回后
  // **立刻**又各自做一次全量更新 —— 车厢内 22 个乘客每人每帧就是两趟 137 个节点的
  // 递归。矩阵一个字不变，只是少走一趟；调用方负责在读世界矩阵前自己更新。
 }
 State(riseSeconds=0){
  const c=this.config,r=Clamp(riseSeconds,0,this.duration);
  return {seconds:r<=c.approachSeconds?c.riseSourceStartSeconds:Math.min(c.sourceEndSeconds,c.riseSourceStartSeconds+r-c.approachSeconds),
   weight:1-Smooth((r-(this.duration-c.releaseSeconds))/c.releaseSeconds),
   gestureWeight:1-Smooth(r/c.approachSeconds),duration:this.duration};
 }
}
