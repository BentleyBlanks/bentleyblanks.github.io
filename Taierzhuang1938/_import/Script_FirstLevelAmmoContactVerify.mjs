import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {LoadGlb,PoseScene,BuildSkin,Multiply} from './Script_LugouGlbPose.mjs';
const args=process.argv.slice(2),root=args[args.indexOf('--root')+1],revision=args.includes('--revision')?Number(args[args.indexOf('--revision')+1]):3;
assert.ok(root&&Number.isInteger(revision)&&revision>=3);
const group='FirstLevelAmmoAuthorV'+revision,out=path.join(root,'Models',group),results=[];
assert.ok(!fs.existsSync(path.join(out,'Data_VisualAssessment.json')),'Preserve frozen measurements; use a new revision');
for(const record of JSON.parse(fs.readFileSync(path.join(out,'Data_AuthoredBake.json'))).results){
 const scene=new PoseScene(LoadGlb(path.join(root,record.path))),parts=BuildSkin(scene.glb),pouch=scene.NodeIndex('Transform_AmmoPouch');
 const rounds=Array.from({length:5},(_,i)=>scene.NodeIndex('Prop_VisibleCartridge'+i)),tip=scene.NodeIndex('Bip002 L Finger12');
 let maxLeftRimError=0,maxPouchDrift=0;const start=[],finish=[],support=[];
 for(let frame=0;frame<=1200;frame++){
  scene.Apply(0,frame/120);const center=scene.world[pouch].slice(12,15);
  if(frame===0){start.push(...rounds.map(i=>Array.from(scene.world[i].slice(12,15))));}
  if(frame===1200)finish.push(...rounds.map(i=>Array.from(scene.world[i].slice(12,15))));
  maxPouchDrift=Math.max(maxPouchDrift,Math.abs(center[1]-(record.lapSupport.pouchBottomY+.02)));
  if(frame%2===0){const expected=record.samples[frame/2].leftIndexTip;maxLeftRimError=Math.max(maxLeftRimError,Math.hypot(...expected.map((x,k)=>x-scene.world[tip][12+k])));}
  if(frame%4)continue;
  let maxLapY=-Infinity,maxHandPenetration=0;const leftSurface=[];
  for(const part of parts){
   const matrices=part.joints.map((id,i)=>{const m=new Float64Array(16);Multiply(m,scene.world[id],part.inverseBind.slice(i*16,i*16+16));return m});
   for(let v=0;v<part.count;v++){
    const p=part.position.slice(v*3,v*3+3),point=[0,0,0];let thigh=0,hand=0,left=0;
    for(let k=0;k<4;k++){const w=part.weight[v*4+k],j=part.jointIndex[v*4+k],m=matrices[j],name=scene.nodes[part.joints[j]].name||'';if(/ [LR] Thigh$/.test(name))thigh+=w;if(/ [LR] (Hand|Finger)/.test(name))hand+=w;if(/ L (Hand|Finger)/.test(name))left+=w;for(let c=0;c<3;c++)point[c]+=w*(m[c]*p[0]+m[c+4]*p[1]+m[c+8]*p[2]+m[c+12]);}
    if(thigh>.6&&Math.abs(point[0])<.16&&point[2]>=.275&&point[2]<=.395)maxLapY=Math.max(maxLapY,point[1]);
    const distance=point.map((x,k)=>Math.abs(x-center[k]));
    if(hand>.6&&distance[0]<.16&&distance[1]<.02&&distance[2]<.06)maxHandPenetration=Math.max(maxHandPenetration,Math.min(.16-distance[0],.02-distance[1],.06-distance[2]));
    if(left>.6&&Math.abs(point[0]-.153)<.02&&Math.abs(point[2]-(center[2]+.035))<.02)leftSurface.push(point[1]-(center[1]+.02));
   }
  }
  support.push({seconds:frame/120,pouchBottomGap:center[1]-.02-maxLapY,maxHandPenetration,leftSurfaceMinGap:leftSurface.length?Math.min(...leftSurface):null});
 }
 const travel=finish.map((p,i)=>p.map((x,k)=>x-start[i][k]));
 assert.ok(travel.every(p=>Math.abs(p[2]-.032)<1e-6&&Math.abs(p[0])+Math.abs(p[1])<1e-6));
 assert.ok(maxLeftRimError<1e-5&&maxPouchDrift<1e-6);
 results.push({id:record.id,model:record.path,sha256:record.sha256,samples:1201,maxLeftRimError,maxPouchDrift,roundDisplacements:travel,support});
}
const report={status:'measured_for_visual_review',boneSampleFps:120,surfaceSampleFps:30,scope:'Exported skinned thigh support and hand vertices inside the pouch volume at 30 fps; left index trajectory and five independent round displacements at 120 fps. Triangle intersections, round contact, grip naturalness and runtime timing remain separate review items.',results};
fs.writeFileSync(path.join(out,'Data_ContactMeasurement.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(results.map(r=>({id:r.id,leftIndexTrajectoryErrorMm:r.maxLeftRimError*1000,surfaceSamples:r.support.length,lapGapMm:[Math.min(...r.support.map(s=>s.pouchBottomGap))*1000,Math.max(...r.support.map(s=>s.pouchBottomGap))*1000],handPenetrationMm:Math.max(...r.support.map(s=>s.maxHandPenetration))*1000}))));
