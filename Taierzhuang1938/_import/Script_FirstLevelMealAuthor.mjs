// Optional carriage meal clips, authored on the original frozen seated rig.
// No new video, recovery, inventory, dialogue event or runtime installation.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {LoadGlb,SerializeGlb,PoseScene,BuildSkin,Multiply} from './Script_LugouGlbPose.mjs';
const args=process.argv.slice(2),root=args[args.indexOf('--root')+1],revision=args.includes('--revision')?Number(args[args.indexOf('--revision')+1]):1;
assert.ok(root&&Number.isInteger(revision)&&revision>0);
const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),group='FirstLevelMealAuthorV'+revision,out=path.join(root,'Models',group);
assert.ok(!fs.existsSync(path.join(out,'Data_DeliveryStatus.json')),'Preserve delivered versions');fs.mkdirSync(out,{recursive:true});
const Hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const Read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const {Matrix4,Vector3,Quaternion}=await import(`data:text/javascript;base64,${fs.readFileSync(path.join(project,'vendor/three/build/three.core.js')).toString('base64')}`);
const Smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t)},Window=(t,a,b,c,d)=>Smooth((t-a)/(b-a))*(1-Smooth((t-c)/(d-c)));
const Pos=m=>new Vector3().setFromMatrixPosition(m),Rotation=m=>{const q=new Quaternion();m.decompose(new Vector3(),q,new Vector3());return q.normalize()};
function Curve(t,knots){if(t<=knots[0][0])return new Vector3(...knots[0][1]);for(let i=1;i<knots.length;i++)if(t<=knots[i][0])return new Vector3(...knots[i-1][1]).lerp(new Vector3(...knots[i][1]),Smooth((t-knots[i-1][0])/(knots[i][0]-knots[i-1][0])));return new Vector3(...knots.at(-1)[1]);}
const source=Read(path.join(root,'Models/FirstLevelTrainSupportV2/Data_EditableProjects.json'));
const catalog=Read(path.join(root,'Preview/Data_Catalog.json'));
const semanticReferences=['TrainMealCutOffer','TrainFoodReceiveEat'].map(id=>{const a=catalog.actions.find(a=>a.id===id),v=a.variants.find(v=>v.id===a.latestByFaction.Nra);return {id,video:v.review.sourceVideo,sha256:Hash(path.join(root,v.review.sourceVideo)),range:v.review.sourceRangeSeconds};});
const report={group,status:'authored_candidate_not_integrated',acceptedForGame:false,sourcePoseSeconds:0,sourcePoseGroup:'FirstLevelTrainSupportV2',durationSeconds:12,sampleFps:60,
 authoredScope:'Frozen seated support reused; unwrap, one cut, put knife down, offer, one shared handoff, receive and bite authored. Existing meal videos inform action order, not new recovery.',
 timingPolicy:'The 8.3-second handoff is a local authoring marker only. Runtime TrainFoodReceived and current voice alignment remain authoritative. No player movement, inventory or mission facts are changed.',
 partnerTransform:{rotationYRadians:Math.PI,translation:[0,0,1.14]},handoffSeconds:8.3,semanticReferences,
 semantics:[{id:'unwrap',range:[0,1.5]},{id:'one_cut',range:[2.3,3.9]},{id:'put_knife_down',range:[4.1,4.7]},{id:'pick_and_offer',range:[4.8,6.8]},{id:'handoff',range:[7.7,8.3]},{id:'receive_and_bite',range:[8.3,10.5]},{id:'return_hands',range:[10.5,12]}],results:[]};
for(const record of source.results)for(const role of ['Giver','Receiver']){
 const input=path.join(root,record.model);assert.equal(Hash(input),record.modelSha256);
 const original=LoadGlb(input),scene=new PoseScene(original),json=structuredClone(original.json),nodes=scene.nodes;
 scene.Apply(scene.AnimationIndex('FirstLevelTrainBench100'),0);const base=scene.world.map(m=>new Matrix4().fromArray(m));
 const At=part=>{const i=nodes.findIndex(n=>(n.name||'').replaceAll('_',' ') === 'Bip002 '+part);assert.ok(i>=0,part);return i};
 const links=scene.order.filter(i=>/^Bip002/.test(nodes[i].name||'')),descendants=nodes.map((_,i)=>scene.order.filter(j=>{for(let p=j;p>=0;p=scene.parent[p])if(p===i)return true;return false}));
 const lap=[];
 for(const part of BuildSkin(original)){const matrices=part.joints.map((id,i)=>Multiply(new Float64Array(16),scene.world[id],part.inverseBind.slice(i*16,i*16+16)));
  for(let v=0;v<part.count;v++){const p=part.position.slice(v*3,v*3+3),point=[0,0,0];let thigh=0;
   for(let k=0;k<4;k++){const w=part.weight[v*4+k],j=part.jointIndex[v*4+k],m=matrices[j];if(/ [LR] Thigh$/.test(nodes[part.joints[j]].name||''))thigh+=w;for(let c=0;c<3;c++)point[c]+=w*(m[c]*p[0]+m[c+4]*p[1]+m[c+8]*p[2]+m[c+12]);}
   if(thigh>.6&&Math.abs(point[0])<.16&&point[2]>=.275&&point[2]<=.395)lap.push(point[1]);
  }
 }
 assert.ok(lap.length>10);const lapY=Math.max(...lap),boardY=lapY+.012,mealY=boardY+.036,mealZ=.335,meet=[-.055,lapY+.29,.57];
 const chunks=[original.bin];
 function Access(values,width,type='float'){
  const bytes=type==='float'?Buffer.from(Float32Array.from(values).buffer):Buffer.from(Uint16Array.from(values).buffer);
  json.bufferViews.push({buffer:0,byteOffset:chunks.reduce((n,b)=>n+b.length,0),byteLength:bytes.length});chunks.push(bytes,Buffer.alloc((-bytes.length)&3));
  json.accessors.push({bufferView:json.bufferViews.length-1,componentType:type==='float'?5126:5123,count:values.length/width,type:width===1?'SCALAR':'VEC'+width});return json.accessors.length-1;
 }
 const cube=Access([-.5,-.5,-.5,.5,-.5,-.5,.5,.5,-.5,-.5,.5,-.5,-.5,-.5,.5,.5,-.5,.5,.5,.5,.5,-.5,.5,.5],3);json.accessors[cube].min=[-.5,-.5,-.5];json.accessors[cube].max=[.5,.5,.5];
 const indices=Access([0,2,1,0,3,2,4,5,6,4,6,7,0,1,5,0,5,4,2,3,7,2,7,6,0,4,7,0,7,3,1,2,6,1,6,5],1,'uint16');
 const propTracks=new Map();
 function Box(name,center,size,color){const material=json.materials.length;json.materials.push({name:'Material_'+name,pbrMetallicRoughness:{baseColorFactor:[...color,1],metallicFactor:name.includes('Blade')?.7:0,roughnessFactor:.75}});
  const mesh=json.meshes.length;json.meshes.push({name:'Mesh_'+name,primitives:[{attributes:{POSITION:cube},indices,material}]});
  const id=json.nodes.length;json.nodes.push({name,translation:center,scale:size,mesh});json.scenes[json.scene||0].nodes.push(id);return id;}
 function Group(name,children,position){const id=json.nodes.length;json.nodes.push({name,children,translation:position});json.scenes[json.scene||0].nodes=json.scenes[json.scene||0].nodes.filter(i=>!children.includes(i));json.scenes[json.scene||0].nodes.push(id);propTracks.set(id,{translation:[],rotation:[],scale:[]});return id;}
 let knife=-1,flaps=[];
 if(role==='Giver'){
  Box('Prop_MealCloth',[0,lapY+.003,mealZ],[.34,.004,.24],[.51,.46,.34]);Box('Prop_MealBoard',[0,boardY,mealZ],[.28,.014,.16],[.23,.13,.055]);
  Box('Prop_UncutPork',[.025,mealY,mealZ],[.13,.04,.1],[.29,.10,.065]);Box('Prop_PorkFat',[.025,mealY+.008,mealZ],[.132,.009,.102],[.70,.53,.36]);
  for(const side of [-1,1]){const child=Box('Prop_ClothFlap'+side,[-side*.075,0,0],[.15,.004,.22],[.51,.46,.34]);flaps.push({id:Group('Transform_ClothFlap'+side,[child],[side*.17,mealY+.025,mealZ]),side});}
  const handle=Box('Prop_KnifeHandle',[0,0,0],[.025,.02,.085],[.13,.075,.025]);
  const blade=Box('Prop_KnifeBlade',[0,-.014,.104],[.004,.053,.13],[.50,.51,.49]);
  knife=Group('Transform_MealKnife',[handle,blade],[-.13,boardY+.026,.285]);
 }
 const slice=Group('Transform_FoodSlice',[Box('Prop_FoodSliceMeat',[0,0,0],[.012,.04,.1],[.38,.15,.085]),Box('Prop_FoodSliceFat',[0,.008,0],[.013,.009,.101],[.75,.57,.4])],[-.046,mealY,mealZ]);
 const values=new Map(links.map(i=>[i,{translation:[],rotation:[],scale:[]}])) ,times=[],samples=[];let world;
 function Transform(i,m){const delta=m.clone().multiply(world[i].clone().invert());for(const j of descendants[i])world[j].premultiply(delta)}
 function Rotate(i,axis,angle){const origin=Pos(world[i]);Transform(i,new Matrix4().makeRotationAxis(axis,angle).multiply(world[i]).setPosition(origin))}
 function Aim(i,child,target){const p=Pos(world[i]),q=new Quaternion().setFromUnitVectors(Pos(world[child]).sub(p).normalize(),target.clone().sub(p).normalize());Transform(i,new Matrix4().makeRotationFromQuaternion(q).multiply(world[i]).setPosition(p))}
 function Grip(side,matrices){return Pos(matrices[At(side+' Finger11')]).add(Pos(matrices[At(side+' Finger01')])).multiplyScalar(.5)}
 const originalGrip={L:Grip('L',base),R:Grip('R',base)},originalHand={L:Rotation(base[At('L Hand')]),R:Rotation(base[At('R Hand')])};
 function FacingHand(side,forward){
  const along=Pos(base[At(side+' Finger2')]).sub(Pos(base[At(side+' Hand')])).normalize(),across=Pos(base[At(side+' Finger4')]).sub(Pos(base[At(side+' Finger1')])).normalize();
  const q=new Quaternion().setFromUnitVectors(along,forward),normal=along.clone().cross(across).normalize().applyQuaternion(q);if(normal.y>0)normal.negate();
  const down=new Vector3(0,-1,0),angle=Math.atan2(forward.dot(normal.clone().cross(down)),normal.dot(down));return new Quaternion().setFromAxisAngle(forward,angle).multiply(q).multiply(originalHand[side]);
 }
 function Hand(side,contact,rotation,curl){
  const hinge=Pos(world[At(side+' Finger4')]).sub(Pos(world[At(side+' Finger1')])).normalize();
  for(let digit=0;digit<5;digit++){
   const i=At(side+' Finger'+digit),j=At(side+' Finger'+digit+'1'),k=At(side+' Finger'+digit+'2');
   const v=Pos(world[j]).sub(Pos(world[i])),sign=v.clone().applyAxisAngle(hinge,.2).y<v.y?1:-1;
   Rotate(i,hinge,sign*curl*(digit===0?.28:.50));Rotate(j,hinge,sign*curl*(digit===0?.25:.75));Rotate(k,hinge,sign*curl*.45);
  }
  const [a,b,c]=['UpperArm','Forearm','Hand'].map(n=>At(side+' '+n)),start=Pos(world[a]),elbow=Pos(world[b]),wrist=Pos(world[c]);
  const offset=Grip(side,world).sub(wrist).applyQuaternion(rotation.clone().multiply(Rotation(world[c]).invert())),target=contact.clone().sub(offset);
  const l1=start.distanceTo(elbow),l2=elbow.distanceTo(wrist),delta=target.clone().sub(start),d=delta.length();assert.ok(d<l1+l2-.000001&&d>Math.abs(l1-l2)+.000001,`${record.id} ${role} ${side} at ${times.at(-1)} unreachable ${d}/${l1+l2}; shoulder ${start.toArray()}, wrist ${target.toArray()}, grip ${contact.toArray()}`);
  const direction=delta.normalize(),pole=elbow.sub(start);pole.addScaledVector(direction,-pole.dot(direction)).normalize();const along=(l1*l1-l2*l2+d*d)/(2*d);
  const bend=start.clone().addScaledVector(direction,along).addScaledVector(pole,Math.sqrt(Math.max(0,l1*l1-along*along)));Aim(a,b,bend);Aim(b,c,target);
  const scale=new Vector3();world[c].decompose(new Vector3(),new Quaternion(),scale);Transform(c,new Matrix4().compose(target,rotation,scale));
 }
 function Prop(id,position,rotation=new Quaternion(),scale=[1,1,1]){const tracks=propTracks.get(id);tracks.translation.push(...position);tracks.rotation.push(...rotation);tracks.scale.push(...scale);}
 for(let frame=0;frame<=720;frame++){
  const t=frame/60;times.push(t);world=base.map(m=>m.clone());const active=role==='Giver'?Window(t,0,.45,9.5,11.5):Window(t,6.1,7.5,11,12);
  const offer=Window(t,5.5,6.8,8.5,9.5),eat=Window(t,8.5,9.6,10.3,11);
  // The original arms are short relative to the seated torso: lean before
  // reaching the lap instead of extending bones to meet the knife handle.
  Rotate(At('Spine1'),new Vector3(1,0,0),active*(role==='Giver'?.72*(1-.38*offer):.54));Rotate(At('Spine2'),new Vector3(1,0,0),.08*active);
  Rotate(At('Head'),new Vector3(1,0,0),active*(role==='Giver'?.14*(1-offer):.08*eat));Rotate(At('Head'),new Vector3(0,1,0),role==='Giver'?.12*offer:-.08*active);
  let right,left=originalGrip.L.clone(),rightRotation=originalHand.R.clone(),leftRotation=originalHand.L.clone(),rightCurl=.45*active,leftCurl=.15*active;
  let food=new Vector3(-.046,mealY,mealZ),foodRotation=new Quaternion(),knifePosition;
  if(role==='Giver'){
   const cut=Window(t,2.3,3.0,3.5,3.9),knifeGrip=[-.046,boardY+.119-.054*cut,.206];
   knifePosition=Curve(t,[[0,[-.13,boardY+.026,.285]],[1.6,[-.13,boardY+.026,.285]],[2.2,[-.046,boardY+.119,.206]],[3.9,[-.046,boardY+.119,.206]],[4.7,[-.13,boardY+.026,.285]],[12,[-.13,boardY+.026,.285]]]);if(t>=2.2&&t<=3.9)knifePosition.set(...knifeGrip);
   const knifeTurn=Window(t,1.6,2.2,4,4.7),knifeRotation=new Quaternion().setFromAxisAngle(new Vector3(0,0,1),(1-knifeTurn)*Math.PI/2);Prop(knife,knifePosition,knifeRotation);
   for(const flap of flaps){const opening=Smooth((t-(flap.side<0?.0:.45))/.8);Prop(flap.id,new Vector3(flap.side*.17,(mealY+.025)*(1-opening)+(lapY+.003)*opening,mealZ),new Quaternion().setFromAxisAngle(new Vector3(0,0,1),flap.side*Math.PI*opening));}
   const contactOffer=[meet[0]-.016,meet[1],meet[2]];
   right=Curve(t,[[0,originalGrip.R.toArray()],[.5,[-.12,mealY+.06,mealZ]],[1.2,[-.22,boardY+.04,mealZ]],[1.6,[-.13,boardY+.026,.285]],[2.2,knifeGrip],[3.9,knifeGrip],[4.7,[-.13,boardY+.026,.285]],[5,[-.062,mealY,mealZ]],[6.8,contactOffer],[8.3,contactOffer],[9.3,[-.17,mealY+.1,.32]],[11.5,originalGrip.R.toArray()],[12,originalGrip.R.toArray()]]);
   if(t>=2.2&&t<=3.9)right.copy(knifePosition);
   left=Curve(t,[[0,originalGrip.L.toArray()],[.8,[.18,mealY+.06,mealZ]],[1.6,[.055,mealY+.039,mealZ]],[5.4,[.055,mealY+.039,mealZ]],[6.4,[.14,mealY+.21,.26]],[9.2,[.14,mealY+.21,.26]],[11.5,originalGrip.L.toArray()],[12,originalGrip.L.toArray()]]);
   const rightForward=new Vector3(0,0,1).lerp(new Vector3(1,0,0),knifeTurn).normalize();rightRotation.slerp(FacingHand('R',rightForward),active);leftRotation.slerp(FacingHand('L',new Vector3(0,0,1)),active);
   rightCurl=active*(.5+.5*knifeTurn);
   if(t>=5){food.copy(right).add(new Vector3(.016,0,0));foodRotation.setFromAxisAngle(new Vector3(0,0,1),-.4*Smooth((t-5)/1.8));}
   Prop(slice,food,foodRotation,t<=8.3?[1,1,1]:[0,0,0]);
  }else{
   const receive=[-meet[0]-.016,meet[1],1.14-meet[2]],mouth=Pos(world[At('Head')]).add(new Vector3(-.016,-.042,.103));
   right=Curve(t,[[0,originalGrip.R.toArray()],[6.1,originalGrip.R.toArray()],[7.7,receive],[8.3,receive],[9.7,mouth.toArray()],[10.3,mouth.toArray()],[11.7,originalGrip.R.toArray()],[12,originalGrip.R.toArray()]]);
   left=originalGrip.L.clone().lerp(new Vector3(.10,lapY+.20,.25),active*.55);rightRotation.slerp(FacingHand('R',new Vector3(0,0,1)),active);leftRotation.slerp(FacingHand('L',new Vector3(0,0,1)),active*.4);
   food.copy(right).add(new Vector3(.016,0,0));foodRotation.setFromAxisAngle(new Vector3(0,0,1),.4);
   Prop(slice,food,foodRotation,t<8.3?[0,0,0]:[1,1- .3*Smooth((t-10.1)/.25),1]);
  }
  Hand('L',left,leftRotation,leftCurl);Hand('R',right,rightRotation,rightCurl);
  const lower=links.filter(i=>/ (Pelvis|[LR] (Thigh|Calf|Foot|Toe0))$/.test(nodes[i].name));assert.ok(lower.every(i=>world[i].elements.every((n,j)=>Math.abs(n-base[i].elements[j])<1e-9)),'Keep seated support');
  samples.push({seconds:t,leftGrip:Grip('L',world).toArray(),rightGrip:Grip('R',world).toArray(),slicePosition:food.toArray(),sliceQuaternion:foodRotation.toArray(),sliceScale:t>=10.1?[1,1-.3*Smooth((t-10.1)/.25),1]:[1,1,1],knifePosition:knifePosition?.toArray()});
  for(const i of links){const local=scene.parent[i]<0?world[i]:world[scene.parent[i]].clone().invert().multiply(world[i]),p=new Vector3(),q=new Quaternion(),s=new Vector3();local.decompose(p,q,s);const v=values.get(i),prior=v.rotation.slice(-4);if(prior.length&&q.dot(new Quaternion(...prior))<0)q.set(-q.x,-q.y,-q.z,-q.w);v.translation.push(...p);v.rotation.push(...q);v.scale.push(...s);}
 }
 const clip='FirstLevelTrainMeal'+role,animation={name:clip,channels:[],samplers:[],extras:{loop:false,authored:true}},inputIndex=Access(times,1);json.accessors[inputIndex].min=[0];json.accessors[inputIndex].max=[12];
 for(const [i,tracks] of [...values,...propTracks])for(const [property,track] of Object.entries(tracks)){animation.channels.push({sampler:animation.samplers.length,target:{node:i,path:property}});animation.samplers.push({input:inputIndex,output:Access(track,property==='rotation'?4:3),interpolation:'LINEAR'});}
 json.animations=[animation];const bin=Buffer.concat(chunks);json.buffers=[{byteLength:bin.length}];assert.deepEqual(json.nodes.slice(0,nodes.length),nodes);assert.deepEqual(json.skins,original.json.skins);
 const file=path.join(out,`Model_${record.id}Meal${role}.glb`);fs.writeFileSync(file,SerializeGlb(json,bin));
 report.results.push({id:record.id,role,clip,path:path.relative(root,file).replaceAll('\\','/'),sha256:Hash(file),sourceModel:record.model,sourceSha256:record.modelSha256,sourcePoseSeconds:0,lapY,meetingPoint:meet,samples});console.log(record.id,role,'721 original-rig poses');
}
fs.writeFileSync(path.join(out,'Data_AuthoredBake.json'),JSON.stringify(report,null,2));
