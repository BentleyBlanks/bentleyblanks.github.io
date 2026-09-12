import assert from 'node:assert/strict';
import fs from 'node:fs';
import {BuildOilyCoating} from './Script_OilyCoating.mjs';
import {CreatePeelBody} from './Script_PeelPhysics.mjs';
import {BindSlimeVolume,GripSlimeVolume,UngripSlimeVolume,StepSlimeVolume,SplitSlimeBite} from './Script_SlimePhysics.mjs';
import {OILY_BITE_MASS} from './Script_SlimeBite.mjs';
const reports=[];
function Area(s){return s.faces.reduce((area,ids)=>{const [a,b,c]=ids.map(id=>s.points[id]),u=b.map((x,k)=>x-a[k]),v=c.map((x,k)=>x-a[k]);return area+Math.hypot(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0])*.5;},0);}

function Manifold(s){
 const edges=new Map();for(const face of s.faces)for(let j=0;j<3;j++){const key=[face[j],face[(j+1)%3]].sort((a,b)=>a-b).join(':');edges.set(key,(edges.get(key)||0)+1);}
 assert.ok([...edges.values()].every(n=>n===2),'each cut surface remains a closed two-manifold');
 assert.ok(s.render.positions.every(Number.isFinite),'subdivision has no invalid positions at the cut');
 assert.ok(s.tetrahedra.every(t=>t.rest>0),'every material cell retains positive rest volume');
}
for(const seed of [20260912,83,519])for(let region=0;region<3;region++){
 const lattice=BuildOilyCoating(region,seed,(depth,angle)=>({point:[3*Math.cos(angle),3*Math.sin(angle),depth],normal:[-Math.cos(angle),-Math.sin(angle),0]}));
 const heights=Array.from(lattice.thickness.slice(0,lattice.layer));
 assert.ok(heights.filter(h=>h<.17).length/heights.length>.40,'at least 40 percent remains thin wall coating');
 assert.ok(heights.filter(h=>h>.65).length/heights.length>.20&&Math.max(...heights)>1.4,'substantial connected thick deposits');
 const deep=heights.filter((h,i)=>lattice.positions[i*3+2]>20);
 assert.ok(deep.length>=24&&deep.some(h=>h>.65)&&deep.some(h=>h<.17),'thin film and raised deposits extend beyond 20 mm');
 let body=CreatePeelBody({position:[0,0,0],rotation:[0,0,0,1],normal:[-1,0,0],size:.8,type:'oily'});body.cleanMass=3;body.volumeMesh=lattice;BindSlimeVolume(body,lattice.positions,lattice.indices);
 body.gel.collider=p=>{const radius=Math.hypot(p[0],p[1]);return{normal:[-p[0]/radius,-p[1]/radius,0],clearance:3-radius};};
 Manifold(body.gel);for(let i=0;i<20;i++)StepSlimeVolume(body);
 if(seed===83&&region===0){
  const point=body.gel.points[lattice.gripNode].slice();GripSlimeVolume(body,point);
  for(let i=0;i<65;i++)StepSlimeVolume(body,{target:[point[0]-.5,point[1],point[2]],minAnchors:body.anchors.length});
  assert.ok(!body.gel.bite.ready&&!body.detached,'an unsupported tool cannot rupture oil through slow repeated force');
  UngripSlimeVolume(body);for(let i=0;i<60;i++)StepSlimeVolume(body);
 }
 assert.equal(body.anchors.filter(a=>a.alive).length,lattice.anchors.length,'gravity alone cannot detach coating');
 let maximumError=0,minimumJacobian=1,total=0,count=0,maximumBite=0,rounding=null;
 // Nine load cases include thick, thin and deep areas. The first seed drains every
 // cell via fresh physical grip/load cycles, including the tiny final remnants.
 const drain=seed===20260912;
 while(body&&(drain||count<3)){
  const s=body.gel,cell=s.cells[(count*43)%s.cells.length],ids=cell.ids.slice(4),point=ids.reduce((v,id)=>v.map((x,k)=>x+s.points[id][k]/ids.length),[0,0,0]),radius=Math.hypot(point[0],point[1]),direction=[-point[0]/radius,-point[1]/radius,0];
  GripSlimeVolume(body,point);
  if(count===0){for(let i=0;i<35;i++)StepSlimeVolume(body,{target:point,gravity:[0,0,0]});assert.ok(!s.bite.ready,'stationary contact cannot tear for free');}
  let ready=false,peakStretch=1;
  for(let i=0;i<150;i++){
   const distance=Math.min(2.4,i*.025),r=StepSlimeVolume(body,{target:point.map((v,k)=>v+direction[k]*distance)});
   peakStretch=Math.max(peakStretch,s.maxStretch);maximumError=Math.max(maximumError,Math.abs(s.volumeRatio-1));minimumJacobian=Math.min(minimumJacobian,s.minJacobian);
   if(r.biteReady){ready=true;break;}
  }
  assert.ok(ready,'fresh local loading can remove material '+JSON.stringify({seed,region,count,cells:s.cells.length,work:s.bite.work,extension:s.bite.extension,force:body.force}));
  assert.ok(s.bite.extension>s.bite.requiredExtension&&peakStretch>1.05,'visible soft deformation precedes separation '+JSON.stringify({seed,region,count,peakStretch,work:s.bite.work,extension:s.bite.extension}));
  const alive=body.anchors.filter(a=>a.alive&&!s.bite.mask[a.node]);
  if(body.cleanMass>OILY_BITE_MASS)assert.ok(alive.length>0&&!body.detached,'distant material remains glued to the wall');
  const sourceMass=body.cleanMass,sourceVolume=s.volume,split=SplitSlimeBite(body),bite=split.bite;body=split.remainder;
  for(const part of [bite,body].filter(Boolean))for(let id=0;id<part.gel.points.length;id++){
   const key=part.gel.materialRest[id],old=(s.materialRest||s.rest).findIndex((p,old)=>p.every((x,k)=>x===key[k]&&s.points[old][k]===part.gel.points[id][k]&&s.velocities[old][k]===part.gel.velocities[id][k]));assert.ok(old>=0,'cut retains exact material coordinates');
   assert.deepEqual(part.gel.points[id],s.points[old],'cut inherits deformed material positions');assert.deepEqual(part.gel.velocities[id],s.velocities[old],'cut inherits the velocity field');
  }
  assert.ok(bite.cleanMass<=OILY_BITE_MASS+1e-8,'one contact can only remove a small bite');
  assert.ok(Math.abs(bite.cleanMass+(body?.cleanMass||0)-sourceMass)<1e-9,'cut conserves all cleaning mass');
  assert.ok(Math.abs(bite.gel.volume+(body?.gel.volume||0)-sourceVolume)<1e-8,'cut conserves rest volume');
  Manifold(bite.gel);if(body)Manifold(body.gel);
  total+=bite.cleanMass;count++;maximumBite=Math.max(maximumBite,bite.cleanMass);
  const surfaceArea=Area(bite.gel);UngripSlimeVolume(bite);if(count===1)bite.gel.collider=null;for(let i=0;i<(count===1?90:8);i++){StepSlimeVolume(bite,{gravity:[0,0,0]});if(body)StepSlimeVolume(body);}
  if(count===1){rounding={before:surfaceArea,after:Area(bite.gel),volumeRatio:bite.gel.volumeRatio};assert.ok(rounding.after<rounding.before&&Math.abs(rounding.volumeRatio-1)<.06,'detached gel reduces surface area without losing volume');}
  assert.ok(bite.gel.minJacobian>0&&(!body||body.gel.minJacobian>0),'both sides settle with positive volume');
  if(body)assert.ok(body.anchors.some(a=>a.alive),'remaining film retains inherited wall attachments');
  assert.ok(count<257,'every bite removes at least one cell');
 }
 assert.ok(maximumError<.06&&minimumJacobian>0,'loaded material retains volume and never inverts '+JSON.stringify({seed,region,maximumError,minimumJacobian}));
 assert.ok(Math.abs(total+(body?.cleanMass||0)-3)<1e-8,'repeated partial removal accounts for every original cell');
 if(drain)assert.ok(count>10&&Math.abs(total-3)<1e-8,'complete cleaning requires many separate scoops');
 reports.push({seed,region,count,maximumBite,maximumError,minimumJacobian,total,rounding});console.log('PASS oily region',JSON.stringify(reports.at(-1)));
}
console.log('PASS continuous oily coating and local bites',reports.length,'cases');
fs.mkdirSync(new URL('./_dev/',import.meta.url),{recursive:true});fs.writeFileSync(new URL('./_dev/Data_OilyCoatingReport.json',import.meta.url),JSON.stringify(reports,null,2));
