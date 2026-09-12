import assert from 'node:assert/strict';
import {BuildOilyCoating} from './Script_OilyCoating.mjs';
import {CreatePeelBody} from './Script_PeelPhysics.mjs';
import {BindSlimeVolume,GripSlimeVolume,UngripSlimeVolume,StepSlimeVolume} from './Script_SlimePhysics.mjs';
const reports=[];
for(const seed of [20260912,83,519])for(let region=0;region<3;region++){
 const lattice=BuildOilyCoating(region,seed,(depth,angle)=>({point:[3*Math.cos(angle),3*Math.sin(angle),depth],normal:[-Math.cos(angle),-Math.sin(angle),0]}));
 const heights=Array.from(lattice.thickness.slice(0,lattice.layer)).sort((a,b)=>a-b);
 assert.ok(heights.filter(h=>h<.17).length/heights.length>.40,'at least 40 percent remains thin wall coating');
 assert.ok(heights.filter(h=>h>.65).length/heights.length>.20&&heights.at(-1)>1.4,'substantial connected deposits occupy over 20 percent with raised 1.4 mm lobes');
 const adjacency=Array.from({length:lattice.positions.length/3},()=>new Set()),edges=new Map();
 for(let i=0;i<lattice.indices.length;i+=3){const ids=Array.from(lattice.indices.slice(i,i+3));for(let j=0;j<3;j++){const a=ids[j],b=ids[(j+1)%3];adjacency[a].add(b);adjacency[b].add(a);const key=[a,b].sort((a,b)=>a-b).join(':');edges.set(key,(edges.get(key)||0)+1);}}
 assert.ok([...edges.values()].every(n=>n===2),'surface is a closed manifold without separate decorations');
 const seen=new Set([0]),pending=[0];while(pending.length)for(const n of adjacency[pending.pop()])if(!seen.has(n)){seen.add(n);pending.push(n);}
 assert.equal(seen.size,adjacency.length,'every thin and thick surface vertex belongs to one connected component');
 const body=CreatePeelBody({position:[0,0,0],rotation:[0,0,0,1],normal:[-1,0,0],size:.8,type:'oily'});body.volumeMesh=lattice;
 BindSlimeVolume(body,lattice.positions,lattice.indices);
 body.gel.collider=p=>{const radius=Math.hypot(p[0],p[1]);return{normal:[-p[0]/radius,-p[1]/radius,0],clearance:3-radius};};
 const initial=body.gel.points.map(p=>p.slice());
 for(let i=0;i<45;i++)StepSlimeVolume(body);
 assert.equal(body.anchors.filter(a=>a.alive).length,lattice.anchors.length,'gravity alone cannot detach the coating');
 const point=body.gel.points[lattice.gripNode].slice(),radius=Math.hypot(point[0],point[1]),direction=[-point[0]/radius,-point[1]/radius,0];GripSlimeVolume(body,point);
 let maximumError=0,minimumJacobian=1,thinMotion=0,progressive=false;
 for(let i=0;i<220;i++){
  const t=Math.min(1,i/100),distance=3.8*t*t*(3-2*t),target=point.map((v,k)=>v+direction[k]*distance);
  StepSlimeVolume(body,{target});maximumError=Math.max(maximumError,Math.abs(body.gel.volumeRatio-1));minimumJacobian=Math.min(minimumJacobian,body.gel.minJacobian);
  const remaining=body.anchors.filter(a=>a.alive).length;if(remaining>0&&remaining<lattice.anchors.length){progressive=true;for(let j=0;j<lattice.layer;j++)if(lattice.thickness[j]<.12)thinMotion=Math.max(thinMotion,Math.hypot(...body.gel.points[j].map((v,k)=>v-initial[j][k])));}
 }
 assert.ok(progressive&&thinMotion>.15,'pulling the thick deposit transmits deformation into its attached thin film');
 assert.ok(body.detached,'every seeded coating can be fully peeled with a sustained valid grip '+JSON.stringify({seed,region,maximumError,minimumJacobian,backtracks:body.gel.backtracks,anchors:body.anchors.filter(a=>a.alive).map(a=>({node:a.node,strain:a.strain,damage:a.damage}))}));
 assert.ok(maximumError<.06&&minimumJacobian>0,'film cells retain positive volume while folding and peeling '+JSON.stringify({seed,region,maximumError,minimumJacobian}));
 const beforeRelease=body.gel.maxStretch;UngripSlimeVolume(body);for(let i=0;i<100;i++)StepSlimeVolume(body,{gravity:[0,0,0]});
 assert.ok(body.gel.points.every(p=>p.every(Number.isFinite)),'released film settles without invalid positions');
 reports.push({seed,region,nodes:body.gel.points.length,tetrahedra:body.gel.tetrahedra.length,maximumError,minimumJacobian,thinMotion,detached:body.detached,stretch:beforeRelease});
}
console.log('PASS continuous oily coating',JSON.stringify(reports));
