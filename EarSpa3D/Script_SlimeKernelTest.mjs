import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {CreatePeelBody} from './Script_PeelPhysics.mjs';
import {BuildOilyCoating} from './Script_OilyCoating.mjs';
import {SlimeCage,BindSlimeVolume,GripSlimeVolume,StepSlimeVolume,WriteSlimeSurface} from './Script_SlimePhysics.mjs';
import {InitializeSlimeKernel,SlimeKernelProbe} from './Script_SlimeKernel.mjs?v=ear043-runtime-performance-20261003';

function Make(coating){
 const body=CreatePeelBody({position:[0,0,0],rotation:[0,0,0,1],normal:coating?[-1,0,0]:[0,0,1],size:.8,type:'oily',anchorCount:13});
 const mesh=coating?BuildOilyCoating(0,83,(depth,angle)=>({point:[3*Math.cos(angle),3*Math.sin(angle),depth],normal:[-Math.cos(angle),-Math.sin(angle),0]})):SlimeCage(.8,1);
 if(coating){body.volumeMesh=mesh;body.cleanMass=3;}
 BindSlimeVolume(body,mesh.positions,mesh.indices);
 if(coating)body.gel.collider=p=>{const r=Math.hypot(p[0],p[1]);return{normal:[-p[0]/r,-p[1]/r,0],clearance:3-r};};
 const point=coating?body.gel.points[mesh.gripNode].slice():[0,-.5,.55];GripSlimeVolume(body,point);
 return {body,point};
}
function Run(coating,dt){
 const {body,point}=Make(coating),states=[];
 for(let i=0;i<36;i++){
  const target=point.slice();target[coating?0:2]+=(coating?-1:1)*i*.018;
  StepSlimeVolume(body,{target,floor:coating?null:-1.2},dt);WriteSlimeSurface(body,body.gel.render.positions);
  const s=body.gel;
  states.push(structuredClone({points:s.points,velocities:s.velocities,edges:s.edges,tets:s.tetrahedra,anchors:body.anchors,grip:s.grip,force:body.force,contact:body.contact,steps:body.steps,position:body.position,vertices:s.render.positions,thickness:s.render.thickness}));
 }
 return states;
}
assert.equal(SlimeKernelProbe().backend,'javascript-f64');
const cases=[false,true].flatMap(coating=>[1/144,1/60,.05].map(dt=>({coating,dt})));
const reference=cases.map(({coating,dt})=>Run(coating,dt));
assert(await InitializeSlimeKernel(await fs.readFile(new URL('./Script_SlimeKernel.wasm',import.meta.url))));
for(let i=0;i<cases.length;i++)assert.deepEqual(Run(cases[i].coating,cases[i].dt),reference[i],'JS/WASM states are identical '+JSON.stringify(cases[i]));
assert(SlimeKernelProbe().scratchBytes<=4194304);
console.log('PASS 216 JS/WASM frame comparisons: full nodes, velocities, forces, anchors, 240 Hz steps and render surfaces');
// Reuse the established volume, fracture, mass and landing assertions with WASM.
if(process.argv.includes('--physics')){
 await import('./Script_SlimePhysicsTest.mjs');
 await import('./Script_OilyCoatingTest.mjs');
}
