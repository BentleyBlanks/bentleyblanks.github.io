// Author a count/search/response study over the verified production bench pose.
// No video generation, inference, mission facts or runtime installation occurs here.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {LoadGlb,SerializeGlb,PoseScene,BuildSkin,Multiply} from './Script_LugouGlbPose.mjs';
const args=process.argv.slice(2),root=args[args.indexOf('--root')+1];
assert.ok(root&&root!=='--root');
const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const revision=args.includes('--revision')?Number(args[args.indexOf('--revision')+1]):3;
assert.ok(Number.isInteger(revision)&&revision>=3,'Use the frozen Pipeline script to reproduce V2');
const group='FirstLevelAmmoAuthorV'+revision,out=path.join(root,'Models',group);
assert.ok(!fs.existsSync(path.join(out,'Data_VisualAssessment.json')),'Reviewed result requires a new version');
fs.mkdirSync(out,{recursive:true});
const Hash=f=>createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const {Matrix4,Vector3,Quaternion}=await import(`data:text/javascript;base64,${fs.readFileSync(path.join(project,'vendor/three/build/three.core.js')).toString('base64')}`);
const Smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t)};
const Window=(t,a,b,c,d)=>Smooth((t-a)/(b-a))*(1-Smooth((t-c)/(d-c)));
const Pos=m=>new Vector3().setFromMatrixPosition(m);
const Rotation=m=>{const p=new Vector3(),q=new Quaternion(),s=new Vector3();m.decompose(p,q,s);return q.normalize()};
const inputReport=JSON.parse(fs.readFileSync(path.join(root,'Models/FirstLevelTrainSupportV2/Data_EditableProjects.json')));
const report={group,status:'authored_candidate_not_integrated',sourcePoseSeconds:0,durationSeconds:10,sourcePoseGroup:'FirstLevelTrainSupportV2',
 authoredScope:'Static verified seat/legs retained. Pouch rests on measured thigh mesh; left fingers steady its rim while right index pushes five rounds. Arms, fingers, head and props authored; not recovered counting motion.',
 semantics:[{name:'bring_hands_to_pouch',range:[0,1]},{name:'count_five_visible_positions',range:[1,4]},{name:'pause_for_missing_round',range:[4,5]},{name:'search_pouch',range:[5,7]},{name:'look_up_response',range:[7,9]},{name:'return_to_support',range:[9,10]}],
 timingPolicy:'Study seconds are not dialogue triggers. Mission voice alignment and actor identity remain authoritative. No inventory writes.',results:[]};
const vertices=[-.5,-.5,-.5,.5,-.5,-.5,.5,.5,-.5,-.5,.5,-.5,-.5,-.5,.5,.5,-.5,.5,.5,.5,.5,-.5,.5,.5];
const triangles=[0,2,1,0,3,2,4,5,6,4,6,7,0,1,5,0,5,4,2,3,7,2,7,6,0,4,7,0,7,3,1,2,6,1,6,5];
for(const record of inputReport.results){
 const input=path.join(root,record.model);assert.equal(Hash(input),record.modelSha256);
 const original=LoadGlb(input),json=structuredClone(original.json),scene=new PoseScene(original);
 const baseClip=scene.AnimationIndex('FirstLevelTrainBench100');assert.ok(baseClip>=0);scene.Apply(baseClip,0);
 const base=scene.world.map(m=>new Matrix4().fromArray(m)),nodes=scene.nodes;
 const descendants=nodes.map((_,i)=>scene.order.filter(j=>{for(let p=j;p>=0;p=scene.parent[p])if(p===i)return true;return false}));
 const At=part=>{const i=nodes.findIndex(n=>(n.name||'').replaceAll('_',' ').endsWith(' '+part));assert.ok(i>=0,part);return i};
 const links=scene.order.filter(i=>/^Bip002/.test(nodes[i].name||''));
 const chunks=[original.bin];
 function Access(values,width,type='float'){
  const bytes=type==='float'?Buffer.from(Float32Array.from(values).buffer):Buffer.from(Uint16Array.from(values).buffer);
  const offset=chunks.reduce((n,b)=>n+b.length,0),pad=Buffer.alloc((-bytes.length)&3);
  json.bufferViews.push({buffer:0,byteOffset:offset,byteLength:bytes.length});chunks.push(bytes,pad);
  json.accessors.push({bufferView:json.bufferViews.length-1,componentType:type==='float'?5126:5123,count:values.length/width,type:width===1?'SCALAR':'VEC'+width});return json.accessors.length-1;
 }
 // A visible prop study, not ammunition inventory. Five brass markers leave an
 // empty sixth position to make the authored hesitation inspectable.
 const position=Access(vertices,3),indices=Access(triangles,1,'uint16');json.accessors[position].min=[-.5,-.5,-.5];json.accessors[position].max=[.5,.5,.5];
 function Box(name,center,size,color){
  const material=json.materials.length;json.materials.push({name:'Material_'+name,pbrMetallicRoughness:{baseColorFactor:[...color,1],metallicFactor:0,roughnessFactor:.8}});
  const mesh=json.meshes.length;json.meshes.push({name:'Mesh_'+name,primitives:[{attributes:{POSITION:position},indices,material}]});
  const index=json.nodes.length;json.nodes.push({name,translation:center,scale:size,mesh});json.scenes[json.scene||0].nodes.push(index);return index;
 }
 const pouchParts=[Box('Prop_AmmoPouch',[0,0,0],[.32,.04,.12],[.25,.19,.105])],roundNodes=[];
 for(let i=0;i<5;i++){const id=Box('Prop_VisibleCartridge'+i,[-.084+i*.035,.029,-.008],[.012,.012,.065],[.60,.39,.11]);pouchParts.push(id);roundNodes.push(id)}
 // Measure original clothed thighs in the actual fixed seat pose. This prop
 // support is not inferred from hip joint height or assumed equal across rigs.
 const lapPoints=[],indexSurfaces={L:[],R:[]};
 for(const part of BuildSkin(original)){
  const matrices=part.joints.map((id,i)=>{const m=new Float64Array(16);Multiply(m,scene.world[id],part.inverseBind.slice(i*16,i*16+16));return m});
  for(let v=0;v<part.count;v++){
   const p=part.position.slice(v*3,v*3+3),point=[0,0,0];let thigh=0;
   for(let k=0;k<4;k++){const weight=part.weight[v*4+k],j=part.jointIndex[v*4+k],m=matrices[j];if(/ [LR] Thigh$/.test(nodes[part.joints[j]].name||''))thigh+=weight;for(let c=0;c<3;c++)point[c]+=weight*(m[c]*p[0]+m[c+4]*p[1]+m[c+8]*p[2]+m[c+12]);}
   if(thigh>.6&&Math.abs(point[0])<.16&&point[2]>=.275&&point[2]<=.395)lapPoints.push(point);
   for(const side of ['L','R']){let weight=0;for(let k=0;k<4;k++)if(nodes[part.joints[part.jointIndex[v*4+k]]].name==='Bip002 '+side+' Finger12')weight+=part.weight[v*4+k];if(weight>.7)indexSurfaces[side].push(new Vector3(...point));}
  }
 }
 assert.ok(lapPoints.length>10,'Measured lap support');
 const lapY=Math.max(...lapPoints.map(p=>p[1])),pouchY=lapY+.021,pouchZ=.335,roundPositions=roundNodes.map(()=>[]),indexContacts={};
 for(const side of ['L','R']){
  const direction=Pos(base[At(side+' Finger12')]).sub(Pos(base[At(side+' Finger11')])).normalize();
  const points=indexSurfaces[side],furthest=Math.max(...points.map(p=>p.dot(direction))),cap=points.filter(p=>p.dot(direction)>furthest-.004);
  assert.ok(cap.length>=2,'Measured index fingertip cap');indexContacts[side]=cap.reduce((sum,p)=>sum.add(p),new Vector3()).divideScalar(cap.length);
 }
 const pouchAnchor=json.nodes.length;json.nodes.push({name:'Transform_AmmoPouch',children:pouchParts,translation:[0,.80,.285]});
 json.scenes[json.scene||0].nodes=json.scenes[json.scene||0].nodes.filter(i=>!pouchParts.includes(i));json.scenes[json.scene||0].nodes.push(pouchAnchor);
 const pouchPositions=[];
 const times=[],values=new Map(links.map(i=>[i,{translation:[],rotation:[],scale:[]}])) ,samples=[];
 let world;
 function Transform(i,m){const delta=m.clone().multiply(world[i].clone().invert());for(const j of descendants[i])world[j].premultiply(delta)}
 function Rotate(i,axis,angle){const origin=Pos(world[i]);Transform(i,new Matrix4().makeRotationAxis(axis,angle).multiply(world[i]).setPosition(origin))}
 function Aim(i,child,target){const origin=Pos(world[i]),q=new Quaternion().setFromUnitVectors(Pos(world[child]).sub(origin).normalize(),target.clone().sub(origin).normalize());Transform(i,new Matrix4().makeRotationFromQuaternion(q).multiply(world[i]).setPosition(origin))}
 function Arm(side,target,handRotation){
  const [a,b,c]=['UpperArm','Forearm','Hand'].map(p=>At(side+' '+p)),start=Pos(world[a]),elbow=Pos(world[b]),wrist=Pos(world[c]);
  const l1=start.distanceTo(elbow),l2=elbow.distanceTo(wrist),delta=target.clone().sub(start),distance=delta.length();
  assert.ok(distance<l1+l2-.001&&distance>Math.abs(l1-l2)+.001,`${record.id} unreachable ${side}: ${distance}/${l1+l2}; target ${target.toArray()}`);
  const direction=delta.normalize(),pole=elbow.sub(start);pole.addScaledVector(direction,-pole.dot(direction)).normalize();
  const along=(l1*l1-l2*l2+distance*distance)/(2*distance),bend=start.clone().addScaledVector(direction,along).addScaledVector(pole,Math.sqrt(Math.max(0,l1*l1-along*along)));
  Aim(a,b,bend);Aim(b,c,target);
  const scale=new Vector3();world[c].decompose(new Vector3(),new Quaternion(),scale);Transform(c,new Matrix4().compose(target,handRotation,scale));
 }
 for(let frame=0;frame<=600;frame++){
  const t=frame/60,active=Window(t,0,1,9,10),search=Window(t,4.7,5.2,6.7,7.1),reply=Window(t,7,7.7,8.7,9.5);
  world=base.map(m=>m.clone());times.push(t);
  Rotate(At('Spine1'),new Vector3(1,0,0),.48*active);
  Rotate(At('Spine1'),new Vector3(0,0,1),.08*active);
  Rotate(At('Spine2'),new Vector3(1,0,0),(.09*(1-reply))*active);
  Rotate(At('Head'),new Vector3(1,0,0),(.17*(1-reply)-.045*reply)*active);
  Rotate(At('Head'),new Vector3(0,1,0),.27*reply);
  const tapPhase=Math.max(0,Math.min(5,(t-1)/.6)),phase=tapPhase%1;
  const round=Math.min(4,Math.floor(tapPhase)+Smooth((phase-.72)/.28));
  const tap=Window(phase,0,.15,.6,.72)*(t>=1&&t<=4?1:0),tapX=-.084+round*.035;
  const push=Smooth((phase-.18)/.35);
  pouchPositions.push(0,pouchY,pouchZ);
  for(let i=0;i<5;i++){const progress=Smooth((t-1-i*.6-.108)/.21);roundPositions[i].push(-.084+i*.035,.029,-.008+.032*progress);}
  for(const side of ['L','R']){
   const c=At(side+' Hand'),basePosition=Pos(base[c]),baseRotation=Rotation(base[c]);
   const flat=new Quaternion().setFromAxisAngle(new Vector3(1,0,0),.18).multiply(baseRotation);
   const tipOffset=indexContacts[side].clone().sub(basePosition).applyQuaternion(flat.clone().multiply(baseRotation.clone().invert()));
   const fingerTarget=side==='L'?new Vector3(.153,pouchY+.024,pouchZ+.035):new Vector3(tapX+search*.026*Math.sin(t*6),pouchY+.037+.035*(1-tap)-.009*search,pouchZ-.042+.032*push+search*.015*Math.cos(t*5));
   const desired=fingerTarget.sub(tipOffset);
   const target=basePosition.clone().lerp(desired,active);target.y+=.065*Math.sin(Math.PI*active);
   const rotation=baseRotation.clone().slerp(flat,active);
   Arm(side,target,rotation);
   // Keep the index available for tapping; curl the other fingers by a small
   // authored angle around their measured across-palm hinge axis.
   const finger=At(side+' Finger1'),little=At(side+' Finger4');
   const hinge=Pos(world[little]).sub(Pos(world[finger])).normalize();
   for(const digit of [0,2,3,4]){
    const i=At(side+' Finger'+digit),child=At(side+' Finger'+digit+'1');
    const point=Pos(world[child]).sub(Pos(world[i]));
    const candidate=point.clone().applyAxisAngle(hinge,.25);const sign=candidate.y<point.y?1:-1;
    if(side==='L'){if(digit===0)Rotate(i,hinge,-sign*.25*active);continue;}
    Rotate(i,hinge,sign*(digit===0?.3:.75)*active);
    if(digit!==0){Rotate(child,hinge,sign*1.1*active);Rotate(At(side+' Finger'+digit+'2'),hinge,sign*.75*active);}
   }
  }
  const low=links.filter(i=>/ (Pelvis|[LR] (Thigh|Calf|Foot|Toe0))$/.test(nodes[i].name));
  const lowerDelta=Math.max(...low.flatMap(i=>world[i].elements.map((n,j)=>Math.abs(n-base[i].elements[j]))));
  assert.ok(lowerDelta<1e-9,'Authored upper body modified lower support');
  samples.push({seconds:t,lowerBodyMatrixDelta:lowerDelta,rightIndexTip:Pos(world[At('R Finger12')]).toArray(),leftIndexTip:Pos(world[At('L Finger12')]).toArray(),leftPalm:Pos(world[At('L Hand')]).toArray(),replyWeight:reply});
  for(const i of links){
   const local=scene.parent[i]<0?world[i]:world[scene.parent[i]].clone().invert().multiply(world[i]),p=new Vector3(),q=new Quaternion(),s=new Vector3();local.decompose(p,q,s);
   const v=values.get(i),prior=v.rotation.slice(-4);if(prior.length&&q.dot(new Quaternion(...prior))<0)q.set(-q.x,-q.y,-q.z,-q.w);
   v.translation.push(...p);v.rotation.push(...q);v.scale.push(...s);
  }
 }
 const clip='FirstLevelTrainAmmoCount',animation={name:clip,channels:[],samplers:[],extras:{loop:false,authored:true,sourcePoseSeconds:0}};
 const inputIndex=Access(times,1);json.accessors[inputIndex].min=[0];json.accessors[inputIndex].max=[10];
 for(const i of links)for(const property of ['translation','rotation','scale']){
  animation.channels.push({sampler:animation.samplers.length,target:{node:i,path:property}});
  animation.samplers.push({input:inputIndex,output:Access(values.get(i)[property],property==='rotation'?4:3),interpolation:'LINEAR'});
 }
 animation.channels.push({sampler:animation.samplers.length,target:{node:pouchAnchor,path:'translation'}});
 animation.samplers.push({input:inputIndex,output:Access(pouchPositions,3),interpolation:'LINEAR'});
 for(let i=0;i<5;i++){animation.channels.push({sampler:animation.samplers.length,target:{node:roundNodes[i],path:'translation'}});animation.samplers.push({input:inputIndex,output:Access(roundPositions[i],3),interpolation:'LINEAR'});}
 json.animations=[animation];const bin=Buffer.concat(chunks);json.buffers=[{byteLength:bin.length}];
 assert.deepEqual(json.nodes.slice(0,nodes.length),nodes);assert.deepEqual(json.skins,original.json.skins);
 const file=path.join(out,'Model_'+record.id+'AmmoCount.glb');fs.writeFileSync(file,SerializeGlb(json,bin));
 report.results.push({id:record.id,path:path.relative(root,file).replaceAll('\\','/'),sha256:Hash(file),clip,sourceModel:record.model,sourceSha256:record.modelSha256,originalBindAndHierarchyPreserved:true,lapSupport:{sampledVertices:lapPoints.length,highestY:lapY,pouchBottomY:pouchY-.02,pouchZ,roundDisplacementM:.032,indexContacts:Object.fromEntries(Object.entries(indexContacts).map(([side,p])=>[side,p.toArray()]))},samples});
 console.log(record.id,'601 frames; original support and bind preserved');
}
fs.writeFileSync(path.join(out,'Data_AuthoredBake.json'),JSON.stringify(report,null,2));
