// Author FL20 over the verified standing endpoint. Source/raw and runtime stay unchanged.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {LoadGlb,SerializeGlb,PoseScene,BuildSkin,Multiply} from './Script_LugouGlbPose.mjs';
const args=process.argv.slice(2),root=args[args.indexOf('--root')+1];
const revision=args.includes('--revision')?Number(args[args.indexOf('--revision')+1]):2;
assert.ok(root&&Number.isInteger(revision)&&revision>0);
const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const group='FirstLevelAisleAuthorV'+revision,out=path.join(root,'Models',group);
assert.ok(!fs.existsSync(path.join(out,'Data_VisualAssessment.json')),'Frozen version requires a new revision');
fs.mkdirSync(out,{recursive:true});
const Hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const {Matrix4,Vector3,Quaternion}=await import(`data:text/javascript;base64,${fs.readFileSync(path.join(project,'vendor/three/build/three.core.js')).toString('base64')}`);
const Smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t)};
const Window=(t,a,b,c,d)=>Smooth((t-a)/(b-a))*(1-Smooth((t-c)/(d-c)));
const Pos=m=>new Vector3().setFromMatrixPosition(m);
const Rotation=m=>{const p=new Vector3(),q=new Quaternion(),s=new Vector3();m.decompose(p,q,s);return q.normalize()};
const source=JSON.parse(fs.readFileSync(path.join(root,'Models/FirstLevelTrainSupportV2/Data_EditableProjects.json')));
const report={group,status:'authored_candidate_not_integrated',acceptedForGame:false,sourcePoseSeconds:239/30,durationSeconds:5,sampleFps:120,
 authoredScope:'Verified stand endpoint reused. Side step, torso turn, foot targets and bag impulse authored; no new source or inference.',
 timingPolicy:'Study seconds do not trigger dialogue, mission facts, queue motion or inventory. Bag is a local prop study; actor route and collision binding remain pending.',results:[]};
for(const record of source.results)for(const mode of ['SideStep','BagKick']){
 const input=path.join(root,record.model);assert.equal(Hash(input),record.modelSha256);
 const original=LoadGlb(input),scene=new PoseScene(original),json=structuredClone(original.json),nodes=scene.nodes;
 scene.Apply(scene.AnimationIndex('FirstLevelTrainBench100'),239/30);
 const base=scene.world.map(m=>new Matrix4().fromArray(m));
 const At=n=>{const i=nodes.findIndex(node=>(node.name||'').replaceAll('_',' ')==='Bip002 '+n);assert.ok(i>=0,n);return i};
 const links=scene.order.filter(i=>/^Bip002/.test(nodes[i].name||'')),pelvis=At('Pelvis');
 const descendants=nodes.map((_,i)=>scene.order.filter(j=>{for(let p=j;p>=0;p=scene.parent[p])if(p===i)return true;return false}));
 // Exclude the original bench from this standing study without altering the rig.
 json.scenes[json.scene||0].nodes=json.scenes[json.scene||0].nodes.filter(i=>!/^Prop_TrainBench/.test(nodes[i].name||''));
 const footPoints={L:[],R:[]};
 for(const part of BuildSkin(original)){
  const matrices=part.joints.map((id,i)=>Multiply(new Float64Array(16),scene.world[id],part.inverseBind.slice(i*16,i*16+16)));
  for(let v=0;v<part.count;v++){
   const p=part.position.slice(v*3,v*3+3),point=[0,0,0],weights={L:0,R:0};
   for(let k=0;k<4;k++){const weight=part.weight[v*4+k],j=part.jointIndex[v*4+k],m=matrices[j],name=nodes[part.joints[j]].name||'';
    for(const side of ['L','R'])if(new RegExp(' '+side+' (Foot|Toe0)$').test(name))weights[side]+=weight;
    for(let c=0;c<3;c++)point[c]+=weight*(m[c]*p[0]+m[c+4]*p[1]+m[c+8]*p[2]+m[c+12]);}
   for(const side of ['L','R'])if(weights[side]>.95)footPoints[side].push(new Vector3(...point));
  }
 }
 assert.ok(footPoints.L.length>10&&footPoints.R.length>10);
 const contactPoint=footPoints.R.reduce((a,b)=>a.x<b.x?a:b).clone();
 const bagStart=new Vector3(contactPoint.x-.20-.12,.112,contactPoint.z),bagPositions=[];
 const chunks=[original.bin];
 function Access(values,width,type='float'){
  const bytes=type==='float'?Buffer.from(Float32Array.from(values).buffer):Buffer.from(Uint16Array.from(values).buffer);
  json.bufferViews.push({buffer:0,byteOffset:chunks.reduce((n,b)=>n+b.length,0),byteLength:bytes.length});chunks.push(bytes,Buffer.alloc((-bytes.length)&3));
  json.accessors.push({bufferView:json.bufferViews.length-1,componentType:type==='float'?5126:5123,count:values.length/width,type:width===1?'SCALAR':'VEC'+width});return json.accessors.length-1;
 }
 let bag=-1;
 if(mode==='BagKick'){
  const position=Access([-.5,-.5,-.5,.5,-.5,-.5,.5,.5,-.5,-.5,.5,-.5,-.5,-.5,.5,.5,-.5,.5,.5,.5,.5,-.5,.5,.5],3);
  json.accessors[position].min=[-.5,-.5,-.5];json.accessors[position].max=[.5,.5,.5];
  const indices=Access([0,2,1,0,3,2,4,5,6,4,6,7,0,1,5,0,5,4,2,3,7,2,7,6,0,4,7,0,7,3,1,2,6,1,6,5],1,'uint16');
  const material=json.materials.length;json.materials.push({name:'Material_BagStudy',pbrMetallicRoughness:{baseColorFactor:[.23,.19,.10,1],metallicFactor:0,roughnessFactor:.9}});
  const mesh=json.meshes.length;json.meshes.push({name:'Mesh_BagStudy',primitives:[{attributes:{POSITION:position},indices,material}]});
  bag=json.nodes.length;json.nodes.push({name:'Prop_BagStudy',mesh,translation:bagStart.toArray(),scale:[.24,.22,.28]});json.scenes[json.scene||0].nodes.push(bag);
 }
 let world;const times=[],values=new Map(links.map(i=>[i,{translation:[],rotation:[],scale:[]}])),samples=[];
 function Transform(i,m){const delta=m.clone().multiply(world[i].clone().invert());for(const j of descendants[i])world[j].premultiply(delta)}
 function Rotate(i,axis,angle){const origin=Pos(world[i]);Transform(i,new Matrix4().makeRotationAxis(axis,angle).multiply(world[i]).setPosition(origin))}
 function Aim(i,child,target){const origin=Pos(world[i]),q=new Quaternion().setFromUnitVectors(Pos(world[child]).sub(origin).normalize(),target.clone().sub(origin).normalize());Transform(i,new Matrix4().makeRotationFromQuaternion(q).multiply(world[i]).setPosition(origin))}
 function Leg(side,target,rotation){
  const [a,b,c]=['Thigh','Calf','Foot'].map(n=>At(side+' '+n)),hip=Pos(world[a]),knee=Pos(world[b]),ankle=Pos(world[c]);
  const l1=hip.distanceTo(knee),l2=knee.distanceTo(ankle),delta=target.clone().sub(hip),d=delta.length();
  assert.ok(d<l1+l2-.0001&&d>Math.abs(l1-l2)+.0001,`${record.id}/${mode}/${side}: unreachable ${d}/${l1+l2}`);
  // The near-straight source endpoint has an unstable bend plane. Use the
  // character's measured +Z anterior direction for this authored step.
  const direction=delta.normalize(),pole=new Vector3(0,0,1);pole.addScaledVector(direction,-pole.dot(direction)).normalize();
  const along=(l1*l1-l2*l2+d*d)/(2*d),bend=hip.clone().addScaledVector(direction,along).addScaledVector(pole,Math.sqrt(Math.max(0,l1*l1-along*along)));
  Aim(a,b,bend);Aim(b,c,target);const scale=new Vector3();world[c].decompose(new Vector3(),new Quaternion(),scale);Transform(c,new Matrix4().compose(target,rotation,scale));
 }
 for(let frame=0;frame<=600;frame++){
  const t=frame/120;times.push(t);world=base.map(m=>m.clone());
  const footTargets={L:Pos(base[At('L Foot')]),R:Pos(base[At('R Foot')])},footRotations={L:Rotation(base[At('L Foot')]),R:Rotation(base[At('R Foot')])},support={L:true,R:true};
  let shift=new Vector3();
  if(mode==='SideStep'){
   const left=Smooth((t-.7)/1.2),right=Smooth((t-2.1)/1.2),center=.20*(left+right);
   shift.set(center,-.085*Window(t,.1,.6,3.5,4),0);
   for(const [side,p,start] of [['L',left,.7],['R',right,2.1]]){
    footTargets[side].x+=.40*p;const swing=t>start&&t<start+1.2;
    if(swing){footTargets[side].y+=.08*Math.sin(Math.PI*(t-start)/1.2)**2;support[side]=false;}
   }
  }else{
   const active=Window(t,.2,.7,2.7,3.3),swing=Window(t,.8,1.6,1.6,2.6);
   shift.set(.06*active,-.080*active,-.025*active);
   footTargets.R.x-=.20*swing;footTargets.R.y+=.065*swing;
   support.R=!(t>.8&&t<2.6);
   bagPositions.push(bagStart.x-.42*Smooth((t-1.6)/.9),bagStart.y,bagStart.z);
  }
  for(const i of descendants[pelvis])world[i].elements[12]+=shift.x,world[i].elements[13]+=shift.y,world[i].elements[14]+=shift.z;
  // Turn the shoulder line while feet retain independent support. The side
  // step is a short clearance move, not a replacement for route locomotion.
  Rotate(At('Spine1'),new Vector3(0,1,0),(mode==='SideStep'?.55:-.09)*Window(t,.1,.65,3.7,4.5));
  Rotate(At('Head'),new Vector3(0,1,0),(mode==='SideStep'?.20:-.18)*Window(t,.1,.7,3.2,4.4));
  if(mode==='BagKick')Rotate(At('Spine2'),new Vector3(1,0,0),.10*Window(t,.3,.8,2.8,3.5));
  for(const side of ['L','R'])Leg(side,footTargets[side],footRotations[side]);
  samples.push({seconds:t,support,feet:Object.fromEntries(['L','R'].map(side=>[side,Pos(world[At(side+' Foot')]).toArray()])),pelvis:Pos(world[pelvis]).toArray()});
  for(const i of links){
   const local=scene.parent[i]<0?world[i]:world[scene.parent[i]].clone().invert().multiply(world[i]),p=new Vector3(),q=new Quaternion(),s=new Vector3();local.decompose(p,q,s);
   const value=values.get(i),prior=value.rotation.slice(-4);if(prior.length&&q.dot(new Quaternion(...prior))<0)q.set(-q.x,-q.y,-q.z,-q.w);
   value.translation.push(...p);value.rotation.push(...q);value.scale.push(...s);
  }
 }
 const clip='FirstLevelTrain'+mode,inputIndex=Access(times,1),animation={name:clip,samplers:[],channels:[]};
 json.accessors[inputIndex].min=[0];json.accessors[inputIndex].max=[5];
 for(const [i,tracks] of values)for(const [property,track] of Object.entries(tracks)){
  animation.channels.push({sampler:animation.samplers.length,target:{node:i,path:property}});
  animation.samplers.push({input:inputIndex,output:Access(track,property==='rotation'?4:3),interpolation:'LINEAR'});
 }
 if(bag>=0){animation.channels.push({sampler:animation.samplers.length,target:{node:bag,path:'translation'}});animation.samplers.push({input:inputIndex,output:Access(bagPositions,3),interpolation:'LINEAR'});}
 json.animations=[animation];const bin=Buffer.concat(chunks);json.buffers=[{byteLength:bin.length}];
 assert.deepEqual(json.nodes.slice(0,nodes.length),nodes);assert.deepEqual(json.skins,original.json.skins);
 const file=path.join(out,`Model_${record.id}${mode}.glb`);fs.writeFileSync(file,SerializeGlb(json,bin));
 report.results.push({id:record.id,mode,clip,path:path.relative(root,file).replaceAll('\\','/'),sha256:Hash(file),sourceModel:record.model,sourceSha256:record.modelSha256,
  sourceClip:'FirstLevelTrainBench100',sourcePoseSeconds:239/30,bag:bag<0?null:{initialCenter:bagStart.toArray(),size:[.24,.22,.28],impactSeconds:1.6,displacement:[-.42,0,0],sourceShoeContact:contactPoint.toArray()},samples});
 console.log(record.id,mode,'601 authored poses');
}
fs.writeFileSync(path.join(out,'Data_AuthoredBake.json'),JSON.stringify(report,null,2));
