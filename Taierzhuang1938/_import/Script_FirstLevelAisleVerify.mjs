// Independent GLB reload: original rig, support soles, bag contact and hold endpoints.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {LoadGlb,PoseScene,BuildSkin,Multiply} from './Script_LugouGlbPose.mjs';
const args=process.argv.slice(2),root=args[args.indexOf('--root')+1],revision=args.includes('--revision')?Number(args[args.indexOf('--revision')+1]):2;
assert.ok(root&&Number.isInteger(revision)&&revision>0);
const folder=path.join(root,'Models','FirstLevelAisleAuthorV'+revision),report=JSON.parse(fs.readFileSync(path.join(folder,'Data_AuthoredBake.json'))),results=[],errors=[];
assert.ok(!fs.existsSync(path.join(folder,'Data_VisualAssessment.json')),'Preserve frozen validation');
const Hash=f=>createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const Distance=(a,b)=>Math.hypot(...a.map((n,i)=>n-b[i]));
for(const record of report.results){
 const file=path.join(root,record.path),source=LoadGlb(path.join(root,record.sourceModel)),glb=LoadGlb(file),scene=new PoseScene(glb),parts=BuildSkin(glb),base=new PoseScene(source);
 assert.equal(Hash(file),record.sha256);assert.equal(Hash(path.join(root,record.sourceModel)),record.sourceSha256);
 assert.deepEqual(glb.json.nodes.slice(0,source.json.nodes.length),source.json.nodes);assert.deepEqual(glb.json.skins,source.json.skins);
 base.Apply(base.AnimationIndex(record.sourceClip),record.sourcePoseSeconds);
 const At=n=>scene.NodeIndex('Bip002 '+n),feet={L:At('L Foot'),R:At('R Foot')},bag=record.bag?scene.NodeIndex('Prop_BagStudy'):-1;
 const bonePairs=['L','R'].flatMap(s=>[['Thigh','Calf'],['Calf','Foot'],['UpperArm','Forearm'],['Forearm','Hand']].map(pair=>pair.map(n=>At(s+' '+n))));
 const expectedLengths=bonePairs.map(([a,b])=>Distance(base.world[a].slice(12,15),base.world[b].slice(12,15)));
 const supportAnchors={L:null,R:null};let minSoleY=Infinity,maxBoneLengthError=0,maxSupportMatrixDrift=0,maxAuthoredJointError=0,maxBagPenetration=0;
 let bagFirst,bagLast,impact=null,minKneeSeparationX=Infinity,minAnteriorKneeBend=Infinity;const surfaceSamples=[],lastHold=[];
 for(let frame=0;frame<=1200;frame++){
  const seconds=frame/240;scene.Apply(scene.AnimationIndex(record.clip),seconds);
  assert.ok(scene.world.every(m=>Array.from(m).every(Number.isFinite)),'Non-finite pose');
  minKneeSeparationX=Math.min(minKneeSeparationX,scene.world[At('L Calf')][12]-scene.world[At('R Calf')][12]);
  for(const side of ['L','R']){
   const hip=scene.world[At(side+' Thigh')].slice(12,15),knee=scene.world[At(side+' Calf')].slice(12,15),ankle=scene.world[feet[side]].slice(12,15);
   const span=ankle.map((n,i)=>n-hip[i]),bend=knee.map((n,i)=>n-hip[i]),along=bend.reduce((sum,n,i)=>sum+n*span[i],0)/span.reduce((sum,n)=>sum+n*n,0);
   minAnteriorKneeBend=Math.min(minAnteriorKneeBend,bend[2]-span[2]*along);
  }
  for(let j=0;j<bonePairs.length;j++){const [a,b]=bonePairs[j];maxBoneLengthError=Math.max(maxBoneLengthError,Math.abs(Distance(scene.world[a].slice(12,15),scene.world[b].slice(12,15))-expectedLengths[j]));}
  if(frame%2===0)for(const side of ['L','R'])maxAuthoredJointError=Math.max(maxAuthoredJointError,Distance(scene.world[feet[side]].slice(12,15),record.samples[frame/2].feet[side]));
  for(const side of ['L','R']){
   const supported=record.mode==='SideStep'?(side==='L'?(seconds<=.7||seconds>=1.9):(seconds<=2.1||seconds>=3.3)):(side==='L'||seconds<=.8||seconds>=2.6);
   if(!supported){supportAnchors[side]=null;continue;}
   const matrix=Array.from(scene.world[feet[side]]);if(!supportAnchors[side])supportAnchors[side]=matrix;
   maxSupportMatrixDrift=Math.max(maxSupportMatrixDrift,...matrix.map((n,i)=>Math.abs(n-supportAnchors[side][i])));
  }
  if(bag>=0){const center=Array.from(scene.world[bag].slice(12,15));if(frame===0)bagFirst=center;if(frame===1200)bagLast=center;}
  if(seconds>=4.5)lastHold.push(scene.world.flatMap(m=>Array.from(m)));
  if(frame%8!==0)continue;
  let minimum=Infinity,penetration=0,rightMinX=Infinity;const rightPoints=[];
  const bagCenter=bag>=0?scene.world[bag].slice(12,15):null;
  for(const part of parts){
   const matrices=part.joints.map((id,i)=>Multiply(new Float64Array(16),scene.world[id],part.inverseBind.slice(i*16,i*16+16)));
   for(let v=0;v<part.count;v++){
    const p=part.position.slice(v*3,v*3+3),point=[0,0,0];let foot=0,right=0;
    for(let k=0;k<4;k++){const w=part.weight[v*4+k],j=part.jointIndex[v*4+k],m=matrices[j],name=scene.nodes[part.joints[j]].name||'';
     if(/ [LR] (Foot|Toe0)$/.test(name))foot+=w;if(/ R (Foot|Toe0)$/.test(name))right+=w;
     for(let c=0;c<3;c++)point[c]+=w*(m[c]*p[0]+m[c+4]*p[1]+m[c+8]*p[2]+m[c+12]);}
    if(foot>.65)minimum=Math.min(minimum,point[1]);
    if(right>.95){rightMinX=Math.min(rightMinX,point[0]);rightPoints.push(point);}
    if(bagCenter){const distance=point.map((n,i)=>Math.abs(n-bagCenter[i])),half=record.bag.size.map(n=>n/2);if(distance.every((n,i)=>n<half[i]))penetration=Math.max(penetration,Math.min(...distance.map((n,i)=>half[i]-n)));}
   }
  }
  minSoleY=Math.min(minSoleY,minimum);maxBagPenetration=Math.max(maxBagPenetration,penetration);
  if(record.bag&&Math.abs(seconds-record.bag.impactSeconds)<1e-6){
   const edge=bagCenter[0]+record.bag.size[0]/2,close=rightPoints.filter(p=>Math.abs(p[0]-rightMinX)<.0005);
   impact={seconds,gapM:rightMinX-edge,contactPoints:close,insideFace:close.some(p=>Math.abs(p[1]-bagCenter[1])<=record.bag.size[1]/2&&Math.abs(p[2]-bagCenter[2])<=record.bag.size[2]/2)};
  }
  surfaceSamples.push({seconds,minSoleY:minimum,maxBagPenetration:penetration});
 }
 const holdDrift=lastHold.reduce((max,row)=>Math.max(max,...row.map((n,i)=>Math.abs(n-lastHold[0][i]))),0),displacement=bagLast?.map((n,i)=>n-bagFirst[i]);
 const item={id:record.id,mode:record.mode,path:record.path,sha256:record.sha256,samples:1201,surfaceSamples:surfaceSamples.length,minSoleY,maxBoneLengthError,maxSupportMatrixDrift,maxAuthoredJointError,maxBagPenetration,minKneeSeparationX,minAnteriorKneeBend,holdDrift,impact,bagDisplacement:displacement};results.push(item);
 if(minSoleY<-.001||maxBoneLengthError>.00005||maxSupportMatrixDrift>.00002||maxAuthoredJointError>.00002||holdDrift>.00002||maxBagPenetration>.001||minKneeSeparationX<.02||minAnteriorKneeBend<0)errors.push(item);
 if(impact&&(!impact.insideFace||Math.abs(impact.gapM)>.001||Distance(displacement,record.bag.displacement)>.00001))errors.push({id:record.id,impact,displacement});
 console.log(JSON.stringify(item));
}
fs.writeFileSync(path.join(folder,'Data_ExportValidation.json'),JSON.stringify({status:errors.length?'needs_correction':'original_rig_and_sampled_support_passed',acceptedForGame:false,sampleFps:240,surfaceSampleFps:30,scope:'Checks the exported original rig, material vertices near shoe support and local bag contact. Full triangle intersections, gameplay obstacle clearance, actor assignment and naturalness are separate.',results,errors},null,2));
assert.deepEqual(errors,[]);
