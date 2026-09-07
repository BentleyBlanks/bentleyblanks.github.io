// Local integration candidate: mesh-free curves for the four original NRA rigs.
// Does not replace a production library or change a mission state.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {LoadGlb,SerializeGlb,PoseScene,BuildSkin,MinSkinnedY,ReadAccessor} from './Script_LugouGlbPose.mjs';
const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2),root=args[args.indexOf('--root')+1];
if(!root)throw Error('--root required');
const output=path.join(root,'Models/FirstLevelCarryV9/GameIntegration');fs.mkdirSync(output,{recursive:true});
const core=fs.readFileSync(path.join(project,'vendor/three/build/three.core.js'));
const {Matrix4,Vector3,Quaternion}=await import(`data:text/javascript;base64,${core.toString('base64')}`);
const Pos=m=>new Vector3().setFromMatrixPosition(m);
function Rest(scene){const world=[];for(const i of scene.order){const m=new Matrix4().compose(new Vector3(...scene.baseT[i]),new Quaternion(...scene.baseR[i]),new Vector3(...scene.baseS[i]));world[i]=scene.parent[i]<0?m:world[scene.parent[i]].clone().multiply(m);}return world;}
function BindRest(glb,scene){const rest=Rest(scene);for(const [skinIndex,skin] of glb.json.skins.entries()){
 const inverse=ReadAccessor(glb,skin.inverseBindMatrices).data;
 skin.joints.forEach((node,j)=>rest[node]=new Matrix4().fromArray(inverse,j*16).invert());
}return rest;}
function Accessor(json,chunks,values,type){
 const data=Float32Array.from(values),bytes=Buffer.from(data.buffer);
 json.bufferViews.push({buffer:0,byteOffset:chunks.reduce((n,b)=>n+b.length,0),byteLength:bytes.length});chunks.push(bytes);
 json.accessors.push({bufferView:json.bufferViews.length-1,componentType:5126,count:data.length/({SCALAR:1,VEC3:3,VEC4:4}[type]),type,...(type==='SCALAR'?{min:[data[0]],max:[data.at(-1)]}:{})});return json.accessors.length-1;
}
const results=[];
for(let variant=1;variant<=4;variant++){
 const id=`LugouNra0${variant}`,target=LoadGlb(path.join(project,`Model/Character/Model_${id}.glb`));
 const scene=new PoseScene(target),rest=BindRest(target,scene),skin=BuildSkin(target);
 const json={asset:{version:'2.0',generator:'FirstLevelCarryRuntimeBake'},scene:target.json.scene,
  scenes:structuredClone(target.json.scenes),nodes:target.json.nodes.map(n=>{const o=structuredClone(n);for(const k of ['mesh','skin','camera','extensions'])delete o[k];return o;}),
  animations:[],accessors:[],bufferViews:[],buffers:[]};
 const chunks=[];
 for(const role of ['Front','Rear']){
  const name='CarryStretcher'+role,source=LoadGlb(path.join(root,`Models/FirstLevelCarryV9/Animation_Nra_${name}_V9.glb`));
  const src=new PoseScene(source),srcRest=BindRest(source,src);
  const pelvis=scene.NodeIndex('Bip002 Pelvis'),sourcePelvis=src.NodeIndex('Bip002 Pelvis');
  const offset=Pos(rest[pelvis]).sub(Pos(srcRest[sourcePelvis]));
  const links=scene.order.filter(i=>scene.nodes[i].name?.startsWith('Bip002'));
  const mapping=new Map(links.map(i=>[i,src.NodeIndex(scene.nodes[i].name)]));
  const correction=new Map(links.filter(i=>mapping.get(i)>=0).map(i=>[i,srcRest[mapping.get(i)].clone().invert().multiply(rest[i].clone().setPosition(Pos(rest[i]).sub(offset)))]));
  const values=new Map(links.map(i=>[i,{translation:[],rotation:[],scale:[]}])),times=[];
  let maxLengthError=0,minSkinY=Infinity,lengthBone='';
  for(let frame=0;frame<=120;frame++){
   const time=frame/60;times.push(time);src.Apply(0,time);const world=rest.map(m=>m.clone());
   for(const i of scene.order){
    if(correction.has(i))world[i]=new Matrix4().fromArray(src.world[mapping.get(i)]).multiply(correction.get(i));
    else if(scene.parent[i]>=0)world[i]=world[scene.parent[i]].clone().multiply(rest[scene.parent[i]].clone().invert().multiply(rest[i]));
   }
   world.forEach((m,i)=>scene.world[i].set(m.elements));minSkinY=Math.min(minSkinY,MinSkinnedY(scene,skin));
   for(const i of links){
    const parent=scene.parent[i],local=parent<0?world[i]:world[parent].clone().invert().multiply(world[i]);
    const t=new Vector3(),q=new Quaternion(),s=new Vector3();local.decompose(t,q,s);
    const v=values.get(i),prior=v.rotation.slice(-4);if(prior.length&&q.dot(new Quaternion(...prior))<0)q.set(-q.x,-q.y,-q.z,-q.w);
    v.translation.push(...t);v.rotation.push(...q);v.scale.push(...s);
    // BIP parents thighs to Spine and clavicles to Neck. V7 explicitly preserves
    // anatomical segments, not those cross-torso hierarchy links.
    const anatomicalParent=/ Thigh$/.test(scene.nodes[i].name)?pelvis:/ Clavicle$/.test(scene.nodes[i].name)?scene.NodeIndex('Bip002 Spine2'):parent;
    if(anatomicalParent>=0&&links.includes(anatomicalParent)&&i!==pelvis&&!/Footsteps/.test(scene.nodes[i].name)){
     const error=Math.abs(Pos(world[i]).distanceTo(Pos(world[anatomicalParent]))-Pos(rest[i]).distanceTo(Pos(rest[anatomicalParent])));
     if(error>maxLengthError){maxLengthError=error;lengthBone=scene.nodes[i].name;}
    }
   }
  }
  if(maxLengthError>.0005)throw Error(`${id}/${name} original length error ${maxLengthError} ${lengthBone}`);
  const animation={name:'FirstLevel'+name,channels:[],samplers:[],extras:{loop:true,status:'candidate_requires_visual_acceptance',sourceRangeSeconds:[137/30,197/30],rootMotionMode:'assembly_relative_in_place'}};
  const input=Accessor(json,chunks,times,'SCALAR');
  for(const i of links)for(const property of ['translation','rotation','scale']){
   const data=values.get(i)[property],width=property==='rotation'?4:3,constant=data.every((v,k)=>Math.abs(v-data[k%width])<1e-7);
   const output=Accessor(json,chunks,constant?[...data.slice(0,width),...data.slice(0,width)]:data,property==='rotation'?'VEC4':'VEC3');
   animation.channels.push({sampler:animation.samplers.length,target:{node:i,path:property}});
   animation.samplers.push({input:constant?Accessor(json,chunks,[0,2],'SCALAR'):input,output,interpolation:'LINEAR'});
  }
  json.animations.push(animation);results.push({id,clip:animation.name,matchedOriginalBones:correction.size,targetBones:links.length,maxLengthError,minSkinY,sourceOffset:offset.toArray()});
 }
 const bin=Buffer.concat(chunks);json.buffers=[{byteLength:bin.length}];
 fs.writeFileSync(path.join(output,`Animation_${id}FirstLevelCarry.glb`),SerializeGlb(json,bin));
}
fs.writeFileSync(path.join(output,'Data_RuntimeCandidateValidation.json'),JSON.stringify({status:'candidate_not_runtime_enabled',results},null,2));
console.log(JSON.stringify({status:'candidate_not_runtime_enabled',results}));
