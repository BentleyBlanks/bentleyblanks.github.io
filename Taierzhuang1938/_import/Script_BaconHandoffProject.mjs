// Bake the evaluated paired performance back onto the original GLB skeletons
// for the local editable Blender project. Source models stay outside the repo.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {LaunchBrowser} from '../../PrairieFire1937/Script_BrowserTestKit.mjs';
import {ServeRoot} from '../Script_DevServer.mjs';
import {LoadGlb,SerializeGlb} from './Script_LugouGlbPose.mjs';
const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source='C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/BaconHandoff';
const server=await ServeRoot(path.dirname(project),0),browser=await LaunchBrowser();
let capture;
try{
 const page=await browser.newPage({viewport:{width:1280,height:800}});
 await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/?whitebox=p012&shot=1&manual=1&quality=low&scale=small`,{waitUntil:'domcontentloaded',timeout:180000});
 await page.waitForFunction(()=>window.Tengxian?.state?.ready,null,{timeout:180000});
 capture=await page.evaluate(async()=>{
   const {Vector3,Quaternion,Matrix4}=await import('three'),g=window.Tengxian,r=g.Debug.FirstLevelMissionRuntime();
   while(!r.voice.current||r.voice.current.phase!=='playing')g.StepFrames(1,1/60,false);
   const records=[];
   for(let frame=0;frame<=112;frame++){
     const seconds=frame/20;
     while(r.voice.current.sourceTime+1e-7<seconds)g.StepFrames(1,1/60,false);
     const giver=r.companion.Handle('yaowa');
     const anchor=new Matrix4().makeTranslation(-giver.position.x,-giver.position.y,-giver.position.z);
     const Pose=root=>{
       root.updateWorldMatrix(true,true);
       const p=new Vector3(),q=new Quaternion(),s=new Vector3();
       anchor.clone().multiply(root.matrixWorld).decompose(p,q,s);
       const nodes={};
       root.traverse(node=>{if(node!==root){
         const value={translation:node.position.toArray(),rotation:node.quaternion.toArray(),scale:node.scale.toArray()};
         if(Object.values(value).flat().some(v=>!Number.isFinite(v)))throw Error('Non-finite original pose '+node.name);
         nodes[node.name]=value;
       }});
       return {nodes,wrapper:{translation:p.toArray(),rotation:q.toArray(),scale:s.toArray()}};
     };
     const Prop=obj=>({position:obj.position.clone().sub(giver.position).toArray(),rotation:obj.quaternion.toArray(),visible:obj.visible});
     records.push({seconds,giver:Pose(giver.actor.characterRig.root),receiver:Pose(g.viewmodel.riggedArms.root),whole:Prop(r.meal.whole),slice:Prop(r.meal.slice)});
   }
   return records;
 });
}finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
fs.writeFileSync(path.join(source,'Data_OriginalRigPerformance.json'),JSON.stringify(capture));
const Normalize=name=>(name||'').replace(/[^a-z0-9]/gi,'').toLowerCase();
for(const [role,file] of [['giver','Model/Character/Model_LugouNra02.glb'],['receiver','Model/Model_FpsArmsNraSkeletal01.glb']]){
 const original=LoadGlb(path.join(project,file)),json=structuredClone(original.json),chunks=[original.bin];
 function Access(values,width){
   const bytes=Buffer.from(Float32Array.from(values).buffer),offset=chunks.reduce((sum,b)=>sum+b.length,0);
   const view=json.bufferViews.push({buffer:0,byteOffset:offset,byteLength:bytes.length})-1;
   chunks.push(bytes,Buffer.alloc((-bytes.length)&3));
   return json.accessors.push({bufferView:view,componentType:5126,count:values.length/width,type:width===1?'SCALAR':width===4?'VEC4':'VEC3'})-1;
 }
 const input=Access(capture.map(row=>row.seconds),1);json.accessors[input].min=[0];json.accessors[input].max=[5.6];
 const animation={name:role==='giver'?'Animation_GiveCuredPork':'Animation_ReceiveCuredPork',channels:[],samplers:[]};
 const names=new Map(Object.keys(capture[0][role].nodes).map(name=>[Normalize(name),name]));
 const wrapper=json.nodes.push({name:'Transform_'+role,children:json.scenes[json.scene||0].nodes})-1;
 json.scenes[json.scene||0].nodes=[wrapper];
 for(const [index,node] of json.nodes.entries()){
   const key=names.get(Normalize(node.name));
   if(index!==wrapper&&!key)continue;
   for(const property of ['translation','rotation','scale']){
     const values=capture.flatMap(row=>(index===wrapper?row[role].wrapper:row[role].nodes[key])[property]);
     node[property]=values.slice(0,property==='rotation'?4:3);delete node.matrix;
     const output=Access(values,property==='rotation'?4:3);
     animation.channels.push({sampler:animation.samplers.length,target:{node:index,path:property}});
     animation.samplers.push({input,output,interpolation:'LINEAR'});
   }
 }
 json.animations=[animation];const bin=Buffer.concat(chunks);json.buffers=[{byteLength:bin.length}];
 const target=path.join(source,role==='giver'?'Animation_BaconGiverOriginalRig.glb':'Animation_BaconReceiverOriginalRig.glb');
 fs.writeFileSync(target,SerializeGlb(json,bin));console.log('Original rig performance',target,animation.channels.length);
}
