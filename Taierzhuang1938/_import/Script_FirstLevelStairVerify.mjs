// Independent reload, actual tread volumes and shared terrain; private evidence only.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {LoadGlb,PoseScene,BuildSkin,Multiply} from './Script_LugouGlbPose.mjs';
import {MISSION_LAYOUT} from '../Data_FirstLevelMissionLayout.mjs';
import {SampleMissionTerrain} from '../Data_FirstLevelMissionTerrain.mjs';
const args=process.argv.slice(2),root=args[args.indexOf('--root')+1],revision=args.includes('--revision')?Number(args[args.indexOf('--revision')+1]):1;
assert.ok(root&&Number.isInteger(revision)&&revision>0);
const folder=path.join(root,'Models','FirstLevelStairAuthorV'+revision),bake=JSON.parse(fs.readFileSync(path.join(folder,'Data_AuthoredBake.json'))),results=[],errors=[];
assert.ok(!fs.existsSync(path.join(folder,'Data_VisualAssessment.json'))&&!fs.existsSync(path.join(folder,'Data_DeliveryStatus.json')),'Preserve delivered validation');
const Hash=f=>createHash('sha256').update(fs.readFileSync(f)).digest('hex'),Distance=(a,b)=>Math.hypot(...a.map((n,i)=>n-b[i]));
const boxes=MISSION_LAYOUT.blocks.filter(b=>b.id==='StationCar0Floor'||b.id.startsWith('StationExitStep0_'));
for(const record of bake.results){
 const file=path.join(root,record.path),source=LoadGlb(path.join(root,record.sourceModel)),glb=LoadGlb(file),scene=new PoseScene(glb),parts=BuildSkin(glb),base=new PoseScene(source);
 assert.equal(Hash(file),record.sha256);assert.equal(Hash(path.join(root,record.sourceModel)),record.sourceSha256);
 assert.deepEqual(glb.json.nodes.slice(0,source.json.nodes.length),source.json.nodes);assert.deepEqual(glb.json.skins,source.json.skins);
 base.Apply(base.AnimationIndex(record.sourceClip),record.sourcePoseSeconds);const At=n=>scene.NodeIndex('Bip002 '+n);
 const pairs=['L','R'].flatMap(s=>[['Thigh','Calf'],['Calf','Foot'],['UpperArm','Forearm'],['Forearm','Hand']].map(p=>p.map(n=>At(s+' '+n))));
 const lengths=pairs.map(([a,b])=>Distance(base.world[a].slice(12,15),base.world[b].slice(12,15)));
 const anchors={L:null,R:null};let maxBoneLengthError=0,maxSupportMatrixDrift=0,maxAuthoredJointError=0,maxGeometryPenetration=0,minSoleGap=Infinity,minKneeSeparationX=Infinity;
 const contacts=[],surfaceSamples=[];
 for(let frame=0;frame<=bake.durationSeconds*240;frame++){
  const t=frame/240;scene.Apply(scene.AnimationIndex(record.clip),t);assert.ok(scene.world.every(m=>Array.from(m).every(Number.isFinite)));
  minKneeSeparationX=Math.min(minKneeSeparationX,scene.world[At('L Calf')][12]-scene.world[At('R Calf')][12]);
  pairs.forEach(([a,b],i)=>{maxBoneLengthError=Math.max(maxBoneLengthError,Math.abs(Distance(scene.world[a].slice(12,15),scene.world[b].slice(12,15))-lengths[i]));});
  for(const side of ['L','R']){
   const matrix=Array.from(scene.world[At(side+' Foot')]),supported=!record.schedule.some(s=>s.side===side&&t>s.start&&t<s.finish);
   if(!supported)anchors[side]=null;
   else{if(!anchors[side])anchors[side]=matrix;maxSupportMatrixDrift=Math.max(maxSupportMatrixDrift,...matrix.map((n,i)=>Math.abs(n-anchors[side][i])));}
   if(frame%2===0)maxAuthoredJointError=Math.max(maxAuthoredJointError,Distance(matrix.slice(12,15),record.samples[frame/2].feet[side]));
  }
  if(frame%8!==0)continue;
  let penetration=0,soleGap=Infinity;const soles={L:{min:Infinity,max:-Infinity},R:{min:Infinity,max:-Infinity}};
  for(const part of parts){const matrices=part.joints.map((id,i)=>Multiply(new Float64Array(16),scene.world[id],part.inverseBind.slice(i*16,i*16+16)));
   for(let v=0;v<part.count;v++){
    const p=part.position.slice(v*3,v*3+3),point=[0,0,0],foot={L:0,R:0};
    for(let k=0;k<4;k++){const w=part.weight[v*4+k],j=part.jointIndex[v*4+k],m=matrices[j],name=scene.nodes[part.joints[j]].name||'';
     for(const side of ['L','R'])if(new RegExp(' '+side+' (Foot|Toe0)$').test(name))foot[side]+=w;
     for(let c=0;c<3;c++)point[c]+=w*(m[c]*p[0]+m[c+4]*p[1]+m[c+8]*p[2]+m[c+12]);}
    const x=bake.coordinates.originX+point[2],y=point[1],z=bake.coordinates.carZ-point[0];let support=SampleMissionTerrain(x,z);
    for(const b of boxes){const distances=[Math.abs(x-b.x),Math.abs(y-b.y),Math.abs(z-b.z)],half=[b.w/2,b.h/2,b.d/2];
     if(distances[0]<=half[0]&&distances[2]<=half[2])support=Math.max(support,b.y+b.h/2);
     if(distances.every((d,i)=>d<half[i]))penetration=Math.max(penetration,Math.min(...distances.map((d,i)=>half[i]-d)));}
    for(const side of ['L','R'])if(foot[side]>.95){soleGap=Math.min(soleGap,y-support);soles[side].min=Math.min(soles[side].min,y);soles[side].max=Math.max(soles[side].max,y);}
   }
  }
  minSoleGap=Math.min(minSoleGap,soleGap);maxGeometryPenetration=Math.max(maxGeometryPenetration,penetration);surfaceSamples.push({seconds:t,soleGap,penetration,soles});
 }
 for(const step of record.schedule){const t=Math.min(bake.durationSeconds,step.finish+.03);scene.Apply(scene.AnimationIndex(record.clip),t);const ankle=Array.from(scene.world[At(step.side+' Foot')].slice(12,15));contacts.push({side:step.side,surface:step.surface,seconds:t,ankle});}
 const item={id:record.id,mode:record.mode,path:record.path,sha256:record.sha256,samples:bake.durationSeconds*240+1,surfaceSamples:surfaceSamples.length,maxBoneLengthError,maxSupportMatrixDrift,maxAuthoredJointError,maxGeometryPenetration,minSoleGap,minKneeSeparationX,contacts};results.push(item);
 if(maxBoneLengthError>.00005||maxSupportMatrixDrift>.00003||maxAuthoredJointError>.00003||maxGeometryPenetration>.001||minSoleGap<-.001||minKneeSeparationX<.02)errors.push(item);
 console.log(JSON.stringify(item));
}
fs.writeFileSync(path.join(folder,'Data_ExportValidation.json'),JSON.stringify({status:errors.length?'needs_correction':'original_rig_and_sampled_treads_passed',acceptedForGame:false,sampleFps:240,surfaceSampleFps:30,scope:'Actual four-tread boxes and car 0 terrain sampled against skinned vertices. Other car landings, triangle intersections, naturalness and physical NPC queue integration remain separate.',results,errors},null,2));
assert.deepEqual(errors,[]);
