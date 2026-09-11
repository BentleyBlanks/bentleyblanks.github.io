import assert from 'node:assert/strict';
import {CreatePeelBody,BindPeelSurface,GripPeelBody,StepPeelBody} from './Script_PeelPhysics.mjs';

const positions=[-1,-1,0,1,-1,0,1,1,0,-1,1,0,-1,-1,.035,1,-1,.035,1,1,.035,-1,1,.035];
const indices=[0,2,1,0,3,2,4,5,6,4,6,7,0,1,5,0,5,4,1,2,6,1,6,5,2,3,7,2,7,6,3,0,4,3,4,7];
function Body(){return BindPeelSurface(CreatePeelBody({position:[0,0,0],rotation:[0,0,0,1],normal:[0,0,1],size:1,type:'dry',footprint:[1,1],anchorCount:9}),positions,indices);}
function Pull(adhesion,sign=1){const b=Body();GripPeelBody(b,[0,-sign*.8,.035]);for(let i=1;i<=240;i++){const r=StepPeelBody(b,{target:[0,-sign*.8,.035+i/120],adhesion,fracture:true},1/120);if(r.fracture||r.detached)break;}return b;}
const weak=Pull(.1),strong=Pull(12),opposite=Pull(12,-1);
assert.ok(weak.detached&&!weak.surface.fracture,'weak adhesion peels off the intact material');
assert.ok(!strong.detached&&strong.surface.fracture&&strong.anchors.some(a=>a.alive),'strong adhesion fractures the loaded section while wall bonds survive');
assert.ok(strong.surface.fracture.point[1]<0&&opposite.surface.fracture.point[1]>0,'changing the grip moves the failing section to the new load path');
assert.ok(strong.surface.fracture.width>0&&strong.surface.fracture.thickness>=.035,'section uses a finite area and bending thickness');
const rest=Body();GripPeelBody(rest,[0,0,.035]);
for(let i=0;i<600;i++)StepPeelBody(rest,{target:[Math.sin(i*.3)*.003,0,.035],adhesion:12,fracture:true},1/120);
assert.ok(!rest.surface.fracture&&rest.anchors.every(a=>a.alive),'micro gestures do not accumulate timed damage');
const rates=[30,60,120].map(fps=>{const b=Body();GripPeelBody(b,[0,-.8,.035]);for(let i=0;i<fps*2;i++)StepPeelBody(b,{target:[0,-.8,.075],adhesion:12,fracture:true},1/fps);return b;});
for(const b of rates){assert.ok(!b.surface.fracture);assert.ok(b.surface.points.every((p,i)=>Math.hypot(...p.map((v,j)=>v-rates[0].surface.points[i][j]))<1e-6),'cohesive solve is independent of 30/60/120 Hz render frames');}
const held=rates[0],peak=held.surface.cohesion.ratio;
for(let i=0;i<360;i++)StepPeelBody(held,{target:[0,-.8,.075],adhesion:12,fracture:true},1/120);
assert.ok(!held.surface.fracture&&Math.abs(held.surface.cohesion.ratio-peak)<1e-4,'holding a subcritical load does not turn into a timer fracture');
console.log('PASS cohesive adhesion competition, section location, rest stability and frame-rate invariance');
