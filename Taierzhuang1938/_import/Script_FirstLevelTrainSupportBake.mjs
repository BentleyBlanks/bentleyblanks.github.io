// Fit the original production mesh at five actual character-height profiles.
// Seat geometry stays at game dimensions. Root/leg and palm support are authored.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {LoadGlb,SerializeGlb,PoseScene,BuildSkin,Multiply,ReadAccessorInt} from './Script_LugouGlbPose.mjs';
const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),args=process.argv.slice(2),root=args[args.indexOf('--root')+1];
if(!root)throw Error('--root required');
const inputFolder=path.join(root,'Models/FirstLevelBenchV3/GameIntegration');
const group=args.includes('--group')?args[args.indexOf('--group')+1]:'FirstLevelTrainSupportV1';
if(!/^FirstLevelTrainSupportV[1-9]\d*$/.test(group))throw Error('Invalid support group');
const out=path.join(root,'Models',group);fs.mkdirSync(out,{recursive:true});
if(fs.existsSync(path.join(out,'Data_VisualAssessment.json')))throw Error('Reviewed support version is immutable; create another version');
const Hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const {Matrix4,Vector3,Quaternion}=await import(`data:text/javascript;base64,${fs.readFileSync(path.join(project,'vendor/three/build/three.core.js')).toString('base64')}`);
const manifest=JSON.parse(fs.readFileSync(path.join(project,'Model/Character/Data_LugouCharacterManifest.json')));
const Pos=m=>new Vector3().setFromMatrixPosition(m),N=n=>(n||'').replaceAll('_',' ');
const Rotation=m=>{const p=new Vector3(),q=new Quaternion(),s=new Vector3();m.decompose(p,q,s);return q.normalize()};
const Smooth=v=>{v=Math.max(0,Math.min(1,v));return v*v*(3-2*v)};
function Accessor(json,chunks,values,type){
 const data=Float32Array.from(values),bytes=Buffer.from(data.buffer);
 json.bufferViews.push({buffer:0,byteOffset:chunks.reduce((n,b)=>n+b.length,0),byteLength:bytes.length});chunks.push(bytes);
 json.accessors.push({bufferView:json.bufferViews.length-1,componentType:5126,count:data.length/({SCALAR:1,VEC3:3,VEC4:4}[type]),type,...(type==='SCALAR'?{min:[data[0]],max:[data.at(-1)]}:{})});return json.accessors.length-1;
}
const results=[];
for(let variant=1;variant<=4;variant++){
 const id=`LugouNra0${variant}`,target=LoadGlb(path.join(project,`Model/Character/Model_${id}.glb`)),input=LoadGlb(path.join(inputFolder,`Animation_${id}FirstLevelTrain.glb`));
 const scene=new PoseScene(input),parts=BuildSkin(target),nodes=scene.nodes,at=p=>scene.NodeIndex('Bip002 '+p),pelvis=at('Pelvis');
 const descendants=nodes.map((_,i)=>scene.order.filter(j=>{for(let p=j;p>=0;p=scene.parent[p])if(p===i)return true;return false}));
 const links=scene.order.filter(i=>N(nodes[i].name).startsWith('Bip002'));
 const nominalScale=1.66/manifest.models.find(m=>m.id===id).bounds.size[2];
 // World-space skinned material points, with semantic subsets from original weights.
 const flags=[];
 for(const part of parts)for(let i=0;i<part.count;i++){
  let support=0;const foot={L:0,R:0},hand={L:0,R:0},thigh={L:0,R:0};
  for(let j=0;j<4;j++){
   const name=N(nodes[part.joints[part.jointIndex[i*4+j]]].name),w=part.weight[i*4+j];
   if(/ (Pelvis|Spine|[LR] Thigh)$/.test(name))support+=w;
   for(const s of ['L','R']){
    if(new RegExp(' '+s+' (Foot|Toe0)$').test(name))foot[s]+=w;
    if(new RegExp(' '+s+' (Hand|Finger)').test(name))hand[s]+=w;
    if(name.endsWith(' '+s+' Thigh'))thigh[s]+=w;
   }
  }
  flags.push({support:support>.5,foot:Object.keys(foot).find(s=>foot[s]>.65),hand:Object.keys(hand).find(s=>hand[s]>.8),thigh:Object.keys(thigh).find(s=>thigh[s]>.65)});
 }
 const triangles={L:[],R:[]};let pointOffset=0;
 for(const node of target.json.nodes){
  if(node.skin===undefined||node.mesh===undefined)continue;
  for(const primitive of target.json.meshes[node.mesh].primitives){
   const count=target.json.accessors[primitive.attributes.POSITION].count;
   const indices=primitive.indices===undefined?Array.from({length:count},(_,i)=>i):ReadAccessorInt(target,primitive.indices).data;
   for(let i=0;i<indices.length;i+=3){const t=Array.from(indices.slice(i,i+3),v=>v+pointOffset);for(const s of ['L','R'])if(t.every(j=>flags[j].thigh===s))triangles[s].push(t)}
   pointOffset+=count;
  }
 }
 if(pointOffset!==flags.length)throw Error('Original skin primitive order');
 // Project along the thigh support direction. Flipping arbitrary nearest-face
 // normals upward gives discontinuous signs at trouser seams and triangle edges.
 // The uppermost actual surface under each hand vertex defines support instead.
 function PalmGap(points,side,axis){
  const u=new Vector3(1,0,0).addScaledVector(axis,-axis.x).normalize(),v=new Vector3().crossVectors(axis,u);
  const Project=p=>[p.dot(u),p.dot(v),p.dot(axis)];
  const surfaces=triangles[side].map(t=>t.map(i=>Project(points[i])));let minimum=Infinity;
  for(let i=0;i<points.length;i++)if(flags[i].hand===side){const p=Project(points[i]);let top=-Infinity;
   for(const [a,b,c] of surfaces){
    if(p[0]<Math.min(a[0],b[0],c[0])||p[0]>Math.max(a[0],b[0],c[0])||p[1]<Math.min(a[1],b[1],c[1])||p[1]>Math.max(a[1],b[1],c[1]))continue;
    const determinant=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);if(Math.abs(determinant)<1e-10)continue;
    const wa=((b[1]-c[1])*(p[0]-c[0])+(c[0]-b[0])*(p[1]-c[1]))/determinant;
    const wb=((c[1]-a[1])*(p[0]-c[0])+(a[0]-c[0])*(p[1]-c[1]))/determinant,wc=1-wa-wb;
    if(Math.min(wa,wb,wc)>=-1e-7)top=Math.max(top,wa*a[2]+wb*b[2]+wc*c[2]);
   }
   if(Number.isFinite(top))minimum=Math.min(minimum,p[2]-top);
  }
  if(!Number.isFinite(minimum))throw Error(`${id}/${side} hand has no thigh support`);
  return minimum;
 }
 function Points(world){
  const points=[];
  for(const part of parts){
   const matrices=part.joints.map((node,j)=>Multiply(new Float64Array(16),world[node].elements,part.inverseBind.subarray(j*16,j*16+16)));
   for(let i=0;i<part.count;i++){
    const x=part.position[i*3],y=part.position[i*3+1],z=part.position[i*3+2];let xx=0,yy=0,zz=0,total=0;
    for(let j=0;j<4;j++){
     const w=part.weight[i*4+j];if(!w)continue;const m=matrices[part.jointIndex[i*4+j]];
     xx+=w*(m[0]*x+m[4]*y+m[8]*z+m[12]);yy+=w*(m[1]*x+m[5]*y+m[9]*z+m[13]);zz+=w*(m[2]*x+m[6]*y+m[10]*z+m[14]);total+=w;
    }
    points.push(new Vector3(xx/total,yy/total,zz/total));
   }
  }
  return points;
 }
 const json={asset:{version:'2.0',generator:'FirstLevelTrainSupportBake'},scene:input.json.scene,scenes:structuredClone(input.json.scenes),nodes:structuredClone(nodes),animations:[],accessors:[],bufferViews:[],buffers:[]},chunks=[];
 const seatForwardOffsetM=.24,modelReport={id,nominalScale,seatForwardOffsetM,
  originalModelSha256:Hash(path.join(project,`Model/Character/Model_${id}.glb`)),
  sourceAnimationSha256:Hash(path.join(inputFolder,`Animation_${id}FirstLevelTrain.glb`)),profiles:[]};
 for(const sizeScale of [.96,.98,1,1.02,1.04]){
  const scale=nominalScale*sizeScale,seatTop=.48/scale,bounds=[[-.6/scale,.34/scale,(-.34-seatForwardOffsetM)/scale],[.6/scale,seatTop,(.34-seatForwardOffsetM)/scale]];
  scene.Apply(0,0);let world=scene.world.map(m=>new Matrix4().fromArray(m));const initial=Points(world);
  const targets={},feet={},palmOffsets={L:0,R:0},palmAxes={};for(const side of ['L','R']){
   feet[side]=world[at(side+' Foot')].clone();targets[side]=Pos(feet[side]);
   const min=Math.min(...initial.filter((_,i)=>flags[i].foot===side).map(p=>p.y));targets[side].y+=.002/scale-min;
   palmAxes[side]=new Vector3(0,1,0).applyQuaternion(Rotation(world[at(side+' Thigh')]).invert());
  }
  const values=new Map(links.map(i=>[i,{translation:[],rotation:[],scale:[]}])),times=[],samples=[];
  function TranslatePelvis(dy){for(const i of descendants[pelvis])world[i].elements[13]+=dy}
  function TransformBone(i,matrix){const delta=matrix.clone().multiply(world[i].clone().invert());for(const j of descendants[i])world[j].premultiply(delta)}
  function Aim(i,child,target){
   const origin=Pos(world[i]),q=new Quaternion().setFromUnitVectors(Pos(world[child]).sub(origin).normalize(),target.clone().sub(origin).normalize());
   const m=new Matrix4().makeRotationFromQuaternion(q).multiply(world[i]).setPosition(origin);TransformBone(i,m);
  }
  function Leg(side){
   const [a,b,c]=['Thigh','Calf','Foot'].map(p=>at(side+' '+p)),hip=Pos(world[a]),knee=Pos(world[b]),ankle=Pos(world[c]),target=targets[side];
   const l1=hip.distanceTo(knee),l2=knee.distanceTo(ankle),delta=target.clone().sub(hip),distance=delta.length();
   if(distance>=(l1+l2)*.9999||distance<=Math.abs(l1-l2))throw Error(`${id}/${sizeScale}/${side} unreachable leg ${distance}/${l1+l2}`);
   const forward=delta.normalize(),pole=knee.clone().sub(hip);pole.addScaledVector(forward,-pole.dot(forward)).normalize();
   const along=(l1*l1-l2*l2+distance*distance)/(2*distance),desired=hip.clone().addScaledVector(forward,along).addScaledVector(pole,Math.sqrt(Math.max(0,l1*l1-along*along)));
   Aim(a,b,desired);Aim(b,c,target);TransformBone(c,feet[side].clone().setPosition(target));
  }
  function Arm(side,matrix){
   const [a,b,c]=['UpperArm','Forearm','Hand'].map(p=>at(side+' '+p)),shoulder=Pos(world[a]),elbow=Pos(world[b]),wrist=Pos(world[c]),target=Pos(matrix);
   const l1=shoulder.distanceTo(elbow),l2=elbow.distanceTo(wrist),delta=target.clone().sub(shoulder),distance=delta.length();
   if(distance>=l1+l2||distance<=Math.abs(l1-l2))throw Error(`${id}/${sizeScale}/${side} unreachable palm ${distance}/${l1+l2}`);
   const forward=delta.normalize(),pole=elbow.clone().sub(shoulder);pole.addScaledVector(forward,-pole.dot(forward)).normalize();
   const along=(l1*l1-l2*l2+distance*distance)/(2*distance),desired=shoulder.clone().addScaledVector(forward,along).addScaledVector(pole,Math.sqrt(Math.max(0,l1*l1-along*along)));
   Aim(a,b,desired);Aim(b,c,target);TransformBone(c,matrix);
  }
  function SeatMinimum(points){let min=Infinity;for(let i=0;i<points.length;i++){
   const p=points[i];if(!flags[i].support)continue;
   // Continuous clearance beyond each edge prevents the supporting vertex
   // from suddenly disappearing between frames or adjacent height profiles.
   const outside=Math.max(0,bounds[0][0]-p.x,p.x-bounds[1][0],bounds[0][2]-p.z,p.z-bounds[1][2]);
   min=Math.min(min,p.y+((outside*scale/.01)**2)*.12/scale);
  }return min}
  for(let sourceFrame=0;sourceFrame<=478;sourceFrame++){
   const seconds=sourceFrame/60;times.push(seconds);scene.Apply(0,seconds);world=scene.world.map(m=>new Matrix4().fromArray(m));
   const originalPelvis=Pos(world[pelvis]),seated=1-Smooth((seconds-4.5)/1.3);
   const palmRelative={},originalHands={};for(const side of ['L','R']){
    originalHands[side]=world[at(side+' Hand')].clone();palmRelative[side]=world[at(side+' Thigh')].clone().invert().multiply(originalHands[side]);
   }
   const baseline=world.map(m=>m.clone());let maxDy=Infinity;
   for(const side of ['L','R']){
    const [hip,knee,ankle]=['Thigh','Calf','Foot'].map(p=>Pos(world[at(side+' '+p)]));const reach=(hip.distanceTo(knee)+knee.distanceTo(ankle))*.998;
    const d=hip.clone().sub(targets[side]),h=d.x*d.x+d.z*d.z;if(h>=reach*reach)throw Error('Horizontal foot reach');maxDy=Math.min(maxDy,Math.sqrt(reach*reach-h)-d.y);
   }
   function SolveSupport(dy){
    // Every evaluation starts from the same authored pose, so repeated IK
    // cannot rotate the knee plane or accumulate a different solution.
    world=baseline.map(m=>m.clone());TranslatePelvis(dy);for(const side of ['L','R'])Leg(side);
    return SeatMinimum(Points(world))-seatTop-.002/scale;
   }
   if(seated>0){
    let lo=Math.min(-.18,maxDy-.01),hi=maxDy;
    // Garment clearance need not be monotonic all the way to a straight knee.
    // Find the first feasible local bracket, then solve that contact boundary.
    const lower=lo,upper=hi;let found=SolveSupport(lo)>=0;
    if(found)hi=lo;
    for(let step=1;!found&&step<=64;step++){
     hi=lower+(upper-lower)*step/64;
     if(SolveSupport(hi)>=0){found=true;break}
     lo=hi;
    }
    if(!found)throw Error(`${id}/${sizeScale}/${seconds} no reachable bench support`);
    for(let iteration=0;iteration<18;iteration++){const middle=(lo+hi)/2;if(SolveSupport(middle)<0)lo=middle;else hi=middle}
    const supported=hi;let desired=Math.min(maxDy,Math.max(hi,hi*seated));
    if(SolveSupport(desired)<0){
     // Blending back toward the standing source can leave a feasible pocket
     // at the bench lip. Stop at its boundary instead of passing through wood.
     lo=supported;hi=desired;
     for(let iteration=0;iteration<18;iteration++){const middle=(lo+hi)/2;if(SolveSupport(middle)>=0)lo=middle;else hi=middle}
     desired=lo;
    }
    SolveSupport(desired);
   }else{
    SolveSupport(Math.min(0,maxDy));
   }
   const contact=1-Smooth((seconds-5.2)/.5);
   if(contact>0)for(const side of ['L','R']){
    const thigh=world[at(side+' Thigh')],base=thigh.clone().multiply(palmRelative[side]),axis=palmAxes[side].clone().applyQuaternion(Rotation(thigh));
    const original=originalHands[side].clone();original.elements[13]+=Pos(world[pelvis]).y-originalPelvis.y;
    const FitPalm=()=>{
     const desired=base.clone().setPosition(Pos(base).addScaledVector(axis,palmOffsets[side]));
     if(contact<1){const a=new Vector3(),b=new Quaternion(),c=new Vector3(),d=new Vector3(),e=new Quaternion(),f=new Vector3();original.decompose(a,b,c);desired.decompose(d,e,f);desired.compose(a.lerp(d,contact),b.slerp(e,contact),c.lerp(f,contact))}
     Arm(side,desired);
    };
    FitPalm();
    if(contact===1)for(let iteration=0;iteration<6;iteration++){
     const gap=PalmGap(Points(world),side,axis),error=.001/scale-gap;if(Math.abs(error)<.00008)break;
     palmOffsets[side]+=error;FitPalm();
    }
   }
   const points=Points(world),soles={};for(const side of ['L','R'])soles[side]=Math.min(...points.filter((_,i)=>flags[i].foot===side).map(p=>p.y))*scale;
   const penetrating=points.filter(p=>p.x>bounds[0][0]&&p.x<bounds[1][0]&&p.y>bounds[0][1]&&p.y<bounds[1][1]&&p.z>bounds[0][2]&&p.z<bounds[1][2]);
   const footError=Math.max(...['L','R'].map(s=>Pos(world[at(s+' Foot')]).distanceTo(targets[s])));
   samples.push({sourceSeconds:seconds,soles,seatPenetratingVertices:penetrating.length,footError,rootCorrectionM:Pos(world[pelvis]).sub(originalPelvis).multiplyScalar(scale).toArray()});
   for(const i of links){
    const local=scene.parent[i]<0?world[i]:world[scene.parent[i]].clone().invert().multiply(world[i]),t=new Vector3(),q=new Quaternion(),s=new Vector3();local.decompose(t,q,s);
    const v=values.get(i),prior=v.rotation.slice(-4);if(prior.length&&q.dot(new Quaternion(...prior))<0)q.set(-q.x,-q.y,-q.z,-q.w);
    v.translation.push(...t);v.rotation.push(...q);v.scale.push(...s);
   }
  }
  const clipName='FirstLevelTrainBench'+Math.round(sizeScale*100),animation={name:clipName,channels:[],samplers:[],extras:{loop:false,sizeScale,scale,seatForwardOffsetM,sourceRangeSeconds:[0,478/60]}};
  const inputIndex=Accessor(json,chunks,times,'SCALAR');
  for(const i of links)for(const property of ['translation','rotation','scale']){
   const data=values.get(i)[property],width=property==='rotation'?4:3,constant=data.every((v,k)=>Math.abs(v-data[k%width])<1e-7);
   const outputIndex=Accessor(json,chunks,constant?[...data.slice(0,width),...data.slice(0,width)]:data,property==='rotation'?'VEC4':'VEC3');
   animation.channels.push({sampler:animation.samplers.length,target:{node:i,path:property}});
   animation.samplers.push({input:constant?Accessor(json,chunks,[0,478/60],'SCALAR'):inputIndex,output:outputIndex,interpolation:'LINEAR'});
  }
  json.animations.push(animation);
  const summary={sizeScale,scale,clipName,palmOffsets,frames:samples.length,minSole:Math.min(...samples.flatMap(s=>Object.values(s.soles))),maxSole:Math.max(...samples.flatMap(s=>Object.values(s.soles))),maxSeatVertices:Math.max(...samples.map(s=>s.seatPenetratingVertices)),maxFootError:Math.max(...samples.map(s=>s.footError)),samples};
  modelReport.profiles.push(summary);console.log(JSON.stringify({...summary,samples:undefined}));
 }
 const bin=Buffer.concat(chunks);json.buffers=[{byteLength:bin.length}];const outputFile=path.join(out,`Animation_${id}FirstLevelTrainSupport.glb`);fs.writeFileSync(outputFile,SerializeGlb(json,bin));modelReport.animationSha256=Hash(outputFile);results.push(modelReport);
}
fs.writeFileSync(path.join(out,'Data_SupportBakeValidation.json'),JSON.stringify({status:'support_fit_requires_independent_export_review',results},null,2));
