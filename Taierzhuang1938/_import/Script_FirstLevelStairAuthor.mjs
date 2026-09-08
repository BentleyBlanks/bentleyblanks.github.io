// Private four-tread study. Reuses the frozen stand pose; never changes NPC motion authority.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {LoadGlb,SerializeGlb,PoseScene,BuildSkin,Multiply} from './Script_LugouGlbPose.mjs';
import {MISSION_LAYOUT} from '../Data_FirstLevelMissionLayout.mjs';
import {SampleMissionTerrain} from '../Data_FirstLevelMissionTerrain.mjs';
const args=process.argv.slice(2),root=args[args.indexOf('--root')+1];
const revision=args.includes('--revision')?Number(args[args.indexOf('--revision')+1]):1;
assert.ok(root&&Number.isInteger(revision)&&revision>0);
const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),group='FirstLevelStairAuthorV'+revision,out=path.join(root,'Models',group);
assert.ok(!fs.existsSync(path.join(out,'Data_VisualAssessment.json'))&&!fs.existsSync(path.join(out,'Data_DeliveryStatus.json')),'Delivered version requires a new revision');fs.mkdirSync(out,{recursive:true});
const Hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const {Matrix4,Vector3,Quaternion}=await import(`data:text/javascript;base64,${fs.readFileSync(path.join(project,'vendor/three/build/three.core.js')).toString('base64')}`);
const Smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t)};
const Pos=m=>new Vector3().setFromMatrixPosition(m),Rotation=m=>{const q=new Quaternion();m.decompose(new Vector3(),q,new Vector3());return q.normalize()};
const source=JSON.parse(fs.readFileSync(path.join(root,'Models/FirstLevelTrainSupportV2/Data_EditableProjects.json')));
const originX=-74.95,carZ=74,deck=MISSION_LAYOUT.blocks.find(b=>b.id==='StationCar0Floor');
const treads=MISSION_LAYOUT.blocks.filter(b=>b.id.startsWith('StationExitStep0_')).sort((a,b)=>a.x-b.x);
assert.equal(treads.length,4);
for(let car=1;car<3;car++)for(let i=0;i<4;i++){
 const other=MISSION_LAYOUT.blocks.find(b=>b.id===`StationExitStep${car}_${i}`);
 for(const key of ['x','y','w','h','d'])assert.equal(other[key],treads[i][key]);
}
const deckY=deck.y+deck.h/2,groundX=treads.at(-1).x+treads.at(-1).w/2+.34;
const terrainSamples=[0,1,2].map(car=>({carIndex:car,x:groundX,z:74+14*car,height:SampleMissionTerrain(groundX,74+14*car)}));
// Use actual exposed tread centers; overlapping lower boxes are not support surfaces.
const destinations=treads.map((b,i)=>({id:b.id,z:((Math.max(b.x-b.w/2,i?treads[i-1].x+treads[i-1].w/2:deck.x+deck.w/2)+b.x+b.w/2)/2)-originX,y:b.y+b.h/2}));
destinations.push({id:'StationGround0',z:groundX-originX,y:terrainSamples[0].height});
const duration=12,fps=120;
const report={group,status:'authored_candidate_not_integrated',acceptedForGame:false,sourcePoseSeconds:239/30,durationSeconds:duration,sampleFps:fps,
 authoredScope:'Frozen stand endpoint reused. Ten cautious step-to foot placements and pelvis descent are authored against four actual tread boxes; source/raw remain fixed.',
 timingPolicy:'Study timing is not NPC queue timing. No dialogue, actor count, mission fact or physical route was changed. Car 0 landing uses the shared mission terrain sampler; other landing heights remain explicit.',
 layoutSha256:Hash(path.join(project,'Data_FirstLevelMissionLayout.mjs')),terrainSha256:Hash(path.join(project,'Data_FirstLevelMissionTerrain.mjs')),
 coordinates:{forward:'+Z in model study maps to game +X',originX,carZ,deckY},terrainSamples,destinations,results:[]};
for(const record of source.results){
 const input=path.join(root,record.model);assert.equal(Hash(input),record.modelSha256);
 const original=LoadGlb(input),scene=new PoseScene(original),json=structuredClone(original.json),nodes=scene.nodes;
 scene.Apply(scene.AnimationIndex('FirstLevelTrainBench100'),239/30);const base=scene.world.map(m=>new Matrix4().fromArray(m));
 const At=n=>{const i=nodes.findIndex(v=>(v.name||'').replaceAll('_',' ')==='Bip002 '+n);assert.ok(i>=0,n);return i};
 const links=scene.order.filter(i=>/^Bip002/.test(nodes[i].name||'')),pelvis=At('Pelvis');
 const descendants=nodes.map((_,i)=>scene.order.filter(j=>{for(let p=j;p>=0;p=scene.parent[p])if(p===i)return true;return false}));
 json.scenes[json.scene||0].nodes=json.scenes[json.scene||0].nodes.filter(i=>!/^Prop_TrainBench/.test(nodes[i].name||''));
 const sole={L:{minY:Infinity,minZ:Infinity,maxZ:-Infinity},R:{minY:Infinity,minZ:Infinity,maxZ:-Infinity}};
 for(const part of BuildSkin(original)){
  const matrices=part.joints.map((id,i)=>Multiply(new Float64Array(16),scene.world[id],part.inverseBind.slice(i*16,i*16+16)));
  for(let v=0;v<part.count;v++){
   const p=part.position.slice(v*3,v*3+3),point=[0,0,0],weights={L:0,R:0};
   for(let k=0;k<4;k++){const w=part.weight[v*4+k],j=part.jointIndex[v*4+k],m=matrices[j],name=nodes[part.joints[j]].name||'';
    for(const side of ['L','R'])if(new RegExp(' '+side+' (Foot|Toe0)$').test(name))weights[side]+=w;
    for(let c=0;c<3;c++)point[c]+=w*(m[c]*p[0]+m[c+4]*p[1]+m[c+8]*p[2]+m[c+12]);}
   for(const side of ['L','R'])if(weights[side]>.95){sole[side].minY=Math.min(sole[side].minY,point[1]);sole[side].minZ=Math.min(sole[side].minZ,point[2]);sole[side].maxZ=Math.max(sole[side].maxZ,point[2]);}
  }
 }
 const chunks=[original.bin];
 function Access(values,width,type='float'){
  const bytes=type==='float'?Buffer.from(Float32Array.from(values).buffer):Buffer.from(Uint16Array.from(values).buffer);
  json.bufferViews.push({buffer:0,byteOffset:chunks.reduce((n,b)=>n+b.length,0),byteLength:bytes.length});chunks.push(bytes,Buffer.alloc((-bytes.length)&3));
  json.accessors.push({bufferView:json.bufferViews.length-1,componentType:type==='float'?5126:5123,count:values.length/width,type:width===1?'SCALAR':'VEC'+width});return json.accessors.length-1;
 }
 const position=Access([-.5,-.5,-.5,.5,-.5,-.5,.5,.5,-.5,-.5,.5,-.5,-.5,-.5,.5,.5,-.5,.5,.5,.5,.5,-.5,.5,.5],3);json.accessors[position].min=[-.5,-.5,-.5];json.accessors[position].max=[.5,.5,.5];
 const indices=Access([0,2,1,0,3,2,4,5,6,4,6,7,0,1,5,0,5,4,2,3,7,2,7,6,0,4,7,0,7,3,1,2,6,1,6,5],1,'uint16');
 const material=json.materials.length;json.materials.push({name:'Material_ActualStairStudy',pbrMetallicRoughness:{baseColorFactor:[.23,.22,.19,1],metallicFactor:0,roughnessFactor:.95}});
 const mesh=json.meshes.length;json.meshes.push({name:'Mesh_ActualStairStudy',primitives:[{attributes:{POSITION:position},indices,material}]});
 const boxes=[{id:'DeckSlice',x:(originX+deck.x+deck.w/2)/2-.4,y:deck.y,w:deck.x+deck.w/2-originX+.8,h:deck.h,d:1.2},...treads,
  {id:'LandingSlice',x:groundX+.4,y:terrainSamples[0].height-.06,w:1.4,h:.12,d:1.2}];
 for(const b of boxes){const i=json.nodes.length;json.nodes.push({name:'Prop_'+b.id,mesh,translation:[0,b.y,b.x-originX],scale:[b.d,b.h,b.w]});json.scenes[json.scene||0].nodes.push(i);}
 let world;const times=[],values=new Map(links.map(i=>[i,{translation:[],rotation:[],scale:[]}])),samples=[];
 function Transform(i,m){const delta=m.clone().multiply(world[i].clone().invert());for(const j of descendants[i])world[j].premultiply(delta)}
 function Aim(i,child,target){const origin=Pos(world[i]),q=new Quaternion().setFromUnitVectors(Pos(world[child]).sub(origin).normalize(),target.clone().sub(origin).normalize());Transform(i,new Matrix4().makeRotationFromQuaternion(q).multiply(world[i]).setPosition(origin))}
 const footBase=Object.fromEntries(['L','R'].map(side=>[side,Pos(base[At(side+' Foot')])]));
 const lengths=Object.fromEntries(['L','R'].map(side=>{const [a,b,c]=['Thigh','Calf','Foot'].map(n=>Pos(base[At(side+' '+n)]));return[side,[a.distanceTo(b),b.distanceTo(c)]]}));
 const schedule=destinations.flatMap((d,i)=>['L','R'].map((side,j)=>({side,start:.7+i*2.05+j,finish:.7+i*2.05+j+.85,surface:d.id,
   from:i?destinations[i-1]:{z:0,y:deckY},to:d})));
 function Foot(side,t){
  let surface=deckY,z=0,supported=true;
  for(const step of schedule.filter(s=>s.side===side)){
   if(t<=step.start)break;
   if(t>=step.finish){surface=step.to.y;z=step.to.z;continue;}
   supported=false;const p=(t-step.start)/(step.finish-step.start);
   z=step.from.z+(step.to.z-step.from.z)*Smooth((p-.18)/.50);
   surface=p<.18?step.from.y+.085*Smooth(p/.18):p<.68?step.from.y+.085:step.from.y+.085+(step.to.y-step.from.y-.085)*Smooth((p-.68)/.32);break;
  }
  return {target:new Vector3(footBase[side].x,footBase[side].y+surface-sole[side].minY+.002,z+footBase[side].z-(sole[side].minZ+sole[side].maxZ)/2),supported,surface};
 }
 for(let frame=0;frame<=duration*fps;frame++){
  const t=frame/fps;times.push(t);world=base.map(m=>m.clone());const feet={L:Foot('L',t),R:Foot('R',t)};
  const shift=new Vector3(0,(feet.L.surface+feet.R.surface)/2-.045,(feet.L.target.z-footBase.L.z+feet.R.target.z-footBase.R.z)/2);
  let ceiling=Infinity;
  for(const side of ['L','R']){const hip=Pos(base[At(side+' Thigh')]).add(shift),target=feet[side].target,[a,b]=lengths[side],horizontal=(hip.x-target.x)**2+(hip.z-target.z)**2;
   assert.ok(horizontal<(a+b-.045)**2);ceiling=Math.min(ceiling,target.y+Math.sqrt((a+b-.045)**2-horizontal)-hip.y);}
  if(ceiling<0)shift.y+=ceiling;
  for(const i of descendants[pelvis])world[i].elements[12]+=shift.x,world[i].elements[13]+=shift.y,world[i].elements[14]+=shift.z;
  for(const side of ['L','R']){
   const [a,b,c]=['Thigh','Calf','Foot'].map(n=>At(side+' '+n)),hip=Pos(world[a]),target=feet[side].target,[l1,l2]=lengths[side],delta=target.clone().sub(hip),d=delta.length();
   assert.ok(d<l1+l2&&d>Math.abs(l1-l2));const direction=delta.normalize(),pole=new Vector3(0,0,1);pole.addScaledVector(direction,-pole.dot(direction)).normalize();
   const along=(l1*l1-l2*l2+d*d)/(2*d),bend=hip.clone().addScaledVector(direction,along).addScaledVector(pole,Math.sqrt(Math.max(0,l1*l1-along*along)));
   Aim(a,b,bend);Aim(b,c,target);const scale=new Vector3();world[c].decompose(new Vector3(),new Quaternion(),scale);Transform(c,new Matrix4().compose(target,Rotation(base[c]),scale));
  }
  samples.push({seconds:t,support:{L:feet.L.supported,R:feet.R.supported},feet:{L:Pos(world[At('L Foot')]).toArray(),R:Pos(world[At('R Foot')]).toArray()},pelvis:Pos(world[pelvis]).toArray()});
  for(const i of links){const local=scene.parent[i]<0?world[i]:world[scene.parent[i]].clone().invert().multiply(world[i]),p=new Vector3(),q=new Quaternion(),s=new Vector3();local.decompose(p,q,s);
   const v=values.get(i),prior=v.rotation.slice(-4);if(prior.length&&q.dot(new Quaternion(...prior))<0)q.set(-q.x,-q.y,-q.z,-q.w);v.translation.push(...p);v.rotation.push(...q);v.scale.push(...s);}
 }
 const clip='FirstLevelTrainStairDescent',inputIndex=Access(times,1),animation={name:clip,samplers:[],channels:[]};json.accessors[inputIndex].min=[0];json.accessors[inputIndex].max=[duration];
 for(const [i,tracks] of values)for(const [property,track] of Object.entries(tracks)){animation.channels.push({sampler:animation.samplers.length,target:{node:i,path:property}});animation.samplers.push({input:inputIndex,output:Access(track,property==='rotation'?4:3),interpolation:'LINEAR'});}
 json.animations=[animation];const bin=Buffer.concat(chunks);json.buffers=[{byteLength:bin.length}];assert.deepEqual(json.nodes.slice(0,nodes.length),nodes);assert.deepEqual(json.skins,original.json.skins);
 const file=path.join(out,`Model_${record.id}StairDescent.glb`);fs.writeFileSync(file,SerializeGlb(json,bin));
 report.results.push({id:record.id,mode:'StairDescent',clip,path:path.relative(root,file).replaceAll('\\','/'),sha256:Hash(file),sourceModel:record.model,sourceSha256:record.modelSha256,sourceClip:'FirstLevelTrainBench100',sourcePoseSeconds:239/30,schedule,sole,boxes,samples});
 console.log(record.id,samples.length,'authored stair poses');
}
fs.writeFileSync(path.join(out,'Data_AuthoredBake.json'),JSON.stringify(report,null,2));
