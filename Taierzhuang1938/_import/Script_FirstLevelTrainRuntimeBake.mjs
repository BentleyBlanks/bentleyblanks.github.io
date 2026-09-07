// Bind-space transfer of the reviewed bench sequence to production NRA models.
// Outputs private candidates and measurements; production is enabled separately.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {LoadGlb,SerializeGlb,PoseScene,BuildSkin,ReadAccessor,Multiply} from './Script_LugouGlbPose.mjs';
const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2),root=args[args.indexOf('--root')+1];
if(!root)throw Error('--root required');
const output=path.join(root,'Models/FirstLevelBenchV3/GameIntegration');fs.mkdirSync(output,{recursive:true});
const core=fs.readFileSync(path.join(project,'vendor/three/build/three.core.js'));
const {Matrix4,Vector3,Quaternion}=await import(`data:text/javascript;base64,${core.toString('base64')}`);
const Pos=m=>new Vector3().setFromMatrixPosition(m),Normalize=n=>n.replaceAll('_',' ');
const manifest=JSON.parse(fs.readFileSync(path.join(project,'Model/Character/Data_LugouCharacterManifest.json')));
function BindRest(glb,scene){
 const rest=[];
 for(const i of scene.order){const m=new Matrix4().compose(new Vector3(...scene.baseT[i]),new Quaternion(...scene.baseR[i]),new Vector3(...scene.baseS[i]));rest[i]=scene.parent[i]<0?m:rest[scene.parent[i]].clone().multiply(m)}
 for(const skin of glb.json.skins){const inverse=ReadAccessor(glb,skin.inverseBindMatrices).data;skin.joints.forEach((node,j)=>rest[node]=new Matrix4().fromArray(inverse,j*16).invert())}
 return rest;
}
function Accessor(json,chunks,values,type){
 const data=Float32Array.from(values),bytes=Buffer.from(data.buffer);
 json.bufferViews.push({buffer:0,byteOffset:chunks.reduce((n,b)=>n+b.length,0),byteLength:bytes.length});chunks.push(bytes);
 json.accessors.push({bufferView:json.bufferViews.length-1,componentType:5126,count:data.length/({SCALAR:1,VEC3:3,VEC4:4}[type]),type,...(type==='SCALAR'?{min:[data[0]],max:[data.at(-1)]}:{})});return json.accessors.length-1;
}
function Points(scene,parts){
 const output=[];
 for(const part of parts){
  const matrices=part.joints.map((node,j)=>Multiply(new Float64Array(16),scene.world[node],part.inverseBind.slice(j*16,j*16+16)));
  for(let i=0;i<part.count;i++){
   const p=new Vector3().fromArray(part.position,i*3),point=new Vector3();let total=0;
   for(let j=0;j<4;j++){const w=part.weight[i*4+j];if(!w)continue;point.addScaledVector(p.clone().applyMatrix4(new Matrix4().fromArray(matrices[part.jointIndex[i*4+j]])),w);total+=w}
   output.push(point.multiplyScalar(1/total));
  }
 }
 return output;
}
const sourcePath=path.join(root,'Models/FirstLevelBenchV3/Animation_Nra_TrainBenchRise_V3.glb');
const source=LoadGlb(sourcePath),src=new PoseScene(source),srcRest=BindRest(source,src),results=[];
const count=479;
for(let variant=1;variant<=4;variant++){
 const id=`LugouNra0${variant}`,target=LoadGlb(path.join(project,`Model/Character/Model_${id}.glb`));
 const scene=new PoseScene(target),rest=BindRest(target,scene),skin=BuildSkin(target);
 const json={asset:{version:'2.0',generator:'FirstLevelTrainRuntimeBake'},scene:target.json.scene,
  scenes:structuredClone(target.json.scenes),nodes:target.json.nodes.map(n=>{const o=structuredClone(n);for(const k of ['mesh','skin','camera','extensions'])delete o[k];return o;}),animations:[],accessors:[],bufferViews:[],buffers:[]};
 const chunks=[],pelvis=scene.NodeIndex('Bip002 Pelvis'),sourcePelvis=src.NodeIndex('Bip002 Pelvis');
 const offset=Pos(rest[pelvis]).sub(Pos(srcRest[sourcePelvis]));
 const links=scene.order.filter(i=>Normalize(scene.nodes[i].name||'').startsWith('Bip002'));
 const mapping=new Map(links.map(i=>[i,src.NodeIndex(Normalize(scene.nodes[i].name))]));
 const correction=new Map(links.filter(i=>mapping.get(i)>=0).map(i=>[i,srcRest[mapping.get(i)].clone().invert().multiply(rest[i].clone().setPosition(Pos(rest[i]).sub(offset)))]));
 const values=new Map(links.map(i=>[i,{translation:[],rotation:[],scale:[]}])),times=[],samples=[];
 const nominalScale=1.66/manifest.models.find(m=>m.id===id).bounds.size[2];
 let maxLengthError=0;
 for(let frame=0;frame<count;frame++){
  const seconds=frame/60;times.push(seconds);src.Apply(0,seconds);const world=rest.map(m=>m.clone());
  for(const i of scene.order){
   if(correction.has(i))world[i]=new Matrix4().fromArray(src.world[mapping.get(i)]).multiply(correction.get(i));
   else if(scene.parent[i]>=0)world[i]=world[scene.parent[i]].clone().multiply(rest[scene.parent[i]].clone().invert().multiply(rest[i]));
  }
  world.forEach((m,i)=>scene.world[i].set(m.elements));
  if(frame%30===0||frame===count-1){
   const points=Points(scene,skin);
   const profiles=[.96,1,1.04].map(sizeScale=>{
    const scale=sizeScale*nominalScale,scaled=points.map(p=>p.clone().multiplyScalar(scale));
    const penetration=scaled.filter(p=>Math.abs(p.x)<.6&&Math.abs(p.z)<.34&&p.y>.34&&p.y<.48);
    return {sizeScale,scale,minSkinY:Math.min(...scaled.map(p=>p.y)),benchPenetratingVertices:penetration.length,pelvis:Pos(world[pelvis]).multiplyScalar(scale).toArray()};
   });
   samples.push({sourceSeconds:seconds,profiles});
  }
  for(const i of links){
   const parent=scene.parent[i],local=parent<0?world[i]:world[parent].clone().invert().multiply(world[i]);
   const t=new Vector3(),q=new Quaternion(),s=new Vector3();local.decompose(t,q,s);
   const v=values.get(i),prior=v.rotation.slice(-4);if(prior.length&&q.dot(new Quaternion(...prior))<0)q.set(-q.x,-q.y,-q.z,-q.w);
   v.translation.push(...t);v.rotation.push(...q);v.scale.push(...s);
   const anatomicalParent=/ Thigh$/.test(scene.nodes[i].name)?pelvis:/ Clavicle$/.test(scene.nodes[i].name)?scene.NodeIndex('Bip002 Spine2'):parent;
   if(anatomicalParent>=0&&links.includes(anatomicalParent)&&i!==pelvis&&!/Footsteps/.test(scene.nodes[i].name))maxLengthError=Math.max(maxLengthError,Math.abs(Pos(world[i]).distanceTo(Pos(world[anatomicalParent]))-Pos(rest[i]).distanceTo(Pos(rest[anatomicalParent]))));
  }
 }
 if(maxLengthError>.0005)throw Error(`${id} original bone length error ${maxLengthError}`);
 const animation={name:'FirstLevelTrainBenchSequence',channels:[],samplers:[],extras:{loop:false,sourceRangeSeconds:[0,478/60],status:'requires_game_support_fit'}};
 const input=Accessor(json,chunks,times,'SCALAR');
 for(const i of links)for(const property of ['translation','rotation','scale']){
  const data=values.get(i)[property],width=property==='rotation'?4:3,constant=data.every((v,k)=>Math.abs(v-data[k%width])<1e-7);
  const output=Accessor(json,chunks,constant?[...data.slice(0,width),...data.slice(0,width)]:data,property==='rotation'?'VEC4':'VEC3');
  animation.channels.push({sampler:animation.samplers.length,target:{node:i,path:property}});
  animation.samplers.push({input:constant?Accessor(json,chunks,[0,478/60],'SCALAR'):input,output,interpolation:'LINEAR'});
 }
 json.animations.push(animation);const bin=Buffer.concat(chunks);json.buffers=[{byteLength:bin.length}];
 const filename=`Animation_${id}FirstLevelTrain.glb`;fs.writeFileSync(path.join(output,filename),SerializeGlb(json,bin));
 results.push({id,path:filename,nominalScale,matchedOriginalBones:correction.size,targetBones:links.length,maxLengthError,samples});
}
const report={status:'production_mesh_transfer_requires_support_fit',source:sourcePath,sourceFps:60,frames:count,seatTopM:.48,seatDepthM:.68,seatThicknessM:.14,results};
fs.writeFileSync(path.join(output,'Data_RuntimeTransferValidation.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(results.map(r=>({id:r.id,nominalScale:r.nominalScale,maxLengthError:r.maxLengthError,first:r.samples[0],last:r.samples.at(-1)}))));
