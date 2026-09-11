import assert from 'node:assert/strict';
import {CreatePeelBody,BindPeelSurface,GripPeelBody,StepPeelBody,UngripPeelBody,WritePeelSurface,GetGripPoint,MovePeelBody} from './Script_PeelPhysics.mjs';

// 同一有厚度薄片用于对比材料、时间步与受力；断言观察节点和实际输出表面。
const vertices=[],indices=[],nx=8,ny=12,stride=nx+1,layer=stride*(ny+1);
for(let side=0;side<2;side++)for(let y=0;y<=ny;y++)for(let x=0;x<=nx;x++)vertices.push(x/nx*2-1,y/ny*3.2-1.6,side*.1);
for(let side=0;side<2;side++)for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){
  const a=side*layer+y*stride+x,b=a+1,c=b+stride,d=a+stride;
  indices.push(...(side?[a,b,c,a,c,d]:[a,c,b,a,d,c]));
}
const border=[];for(let x=0;x<nx;x++)border.push(x);for(let y=0;y<ny;y++)border.push(y*stride+nx);for(let x=nx;x>0;x--)border.push(ny*stride+x);for(let y=ny;y>0;y--)border.push(y*stride);
for(let i=0;i<border.length;i++){const a=border[i],b=border[(i+1)%border.length];indices.push(a,b,b+layer,a,b+layer,a+layer);}
const positions=new Float32Array(vertices),grip=[0,-1.2,.08];
function Body(type='dry'){return BindPeelSurface(CreatePeelBody({position:[0,0,0],rotation:[0,0,0,1],normal:[0,0,1],size:.8,footprint:[1,1.6],type,anchorCount:9}),positions,indices);}
function Run(body,options,n=120,dt=1/120){for(let i=0;i<n;i++)StepPeelBody(body,typeof options==='function'?options(i):options,dt);return body;}
const Distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
let checks=0;const Check=(ok,label)=>{assert.ok(ok,label);checks++;};

const rest=Body(),output=new Float32Array(positions.length);WritePeelSurface(rest,output);
Check(output.every((v,i)=>Math.abs(v-positions[i])<1e-6),'embedding preserves the original closed surface and thickness');
Run(rest,{},360);WritePeelSurface(rest,output);
Check(output.every((v,i)=>Math.abs(v-positions[i])<1e-5)&&rest.bend<1e-5,'an untouched shell has no drift or invented bending');
const micro=Body();GripPeelBody(micro,grip);Run(micro,i=>({target:[Math.sin(i*.3)*.012,grip[1],grip[2]]}),600);
Check(micro.anchors.every(a=>a.alive),'repeated tiny gestures cannot farm detachment');
const pressed=Body();GripPeelBody(pressed,grip);Run(pressed,{target:[0,-1.2,-2]},180);
Check(pressed.anchors.every(a=>a.alive)&&pressed.surface.points.every((p,i)=>p[2]>=pressed.surface.support[i][2]-1e-5),'pressing inward preserves adhesion and each node respects wall support');

const peel=Body('wet'),counts=new Set(),snapshots=[];GripPeelBody(peel,grip);
for(let i=0;i<120;i++){
  const t=Math.min(1,i/50),state=StepPeelBody(peel,{target:[0,-1.2-.5*t,.08+2*t]},1/60);counts.add(state.remaining);
  if(state.remaining>2&&state.remaining<9)snapshots.push({bend:peel.bend,freeLift:Math.max(...peel.surface.points.map(p=>p[2]-.05)),fixedError:Math.max(...peel.anchors.filter(a=>a.alive).map(a=>Distance(peel.surface.points[a.node],a.rest)))});
}
Check(counts.size>=5&&peel.detached,'local bonds release in multiple stages and eventually detach');
Check(snapshots.some(s=>s.bend>.2&&s.freeLift>.15&&s.fixedError<.04),'lifted nodes bend while the remaining attached nodes stay on the wall');
Check(peel.surface.maxStretch<.02&&peel.bend<.02,'a stationary detached shell settles without runaway stretching or oscillation');
const materials=['dry','wet','impacted'].map(type=>{const b=Body(type);GripPeelBody(b,[0,-1.55,.08]);return Run(b,{target:[0,-1.55,.5],minAnchors:9});});
Check(materials[1].bend>materials[0].bend*1.3&&materials[0].bend>materials[2].bend*1.3,'wet film bends more than dry keratin and hard wax under the same load');
const hard=Body('impacted'),soft=Body('impacted');for(const b of [hard,soft])GripPeelBody(b,grip);
Run(hard,{target:[0,-1.7,2.08],adhesion:19},180);Run(soft,{target:[0,-1.7,2.08],adhesion:1,softness:1},180);
Check(!hard.detached&&soft.detached,'softening releases a hard deposit that resists the same unsoftened pull');
const fragment=BindPeelSurface(CreatePeelBody({position:[0,0,0],rotation:[0,0,0,1],normal:[0,0,1],size:.28,footprint:[.35,.56],type:'impacted'}),positions.map(v=>v*.35),indices);
GripPeelBody(fragment,[0,-.42,.028]);Run(fragment,{target:[0,-.45,1.2],adhesion:.32},180);
Check(fragment.detached,'a small hard fragment releases with the existing fragment adhesion instead of inheriting the intact plug resistance');

const returning=Body('wet');GripPeelBody(returning,grip);Run(returning,{target:[0,-1.2,.45],minAnchors:9},90);const loadedBend=returning.bend;UngripPeelBody(returning);Run(returning,{},480);
Check(returning.bend<loadedBend*.1&&returning.motion<.02,'release lets elasticity and damping return the same body to its wall');
const supported=Body();GripPeelBody(supported,grip);Run(supported,{target:[0,-1.7,2.08]},180);
const supportRotation=[0,0,Math.SQRT1_2,Math.SQRT1_2];Run(supported,{target:[0,-1.7,2.08],supportRotation},360);
Check(Math.abs(supported.rotation.reduce((sum,v,i)=>sum+v*supportRotation[i],0))>.99,'tool support turns the detached shell without replacing it with a rigid proxy');
const before=GetGripPoint(supported);MovePeelBody(supported,supported.position.map((v,i)=>v+[.2,.1,.3][i]));
Check(Distance(GetGripPoint(supported),before.map((v,i)=>v+[.2,.1,.3][i]))<1e-6,'canal correction moves the tool contact and the simulated body together');
WritePeelSurface(supported,output);const held=output.slice(),worldGrip=GetGripPoint(supported);UngripPeelBody(supported);GripPeelBody(supported,worldGrip);WritePeelSurface(supported,output);
Check(output.every((v,i)=>Math.abs(v-held[i])<1e-6),'regripping preserves the deformed surface');
const rates=[30,60,120].map(fps=>{const b=Body('wet');GripPeelBody(b,grip);return Run(b,{target:[0,-1.2,.22],minAnchors:9},fps,1/fps);});
Check(rates.every(b=>b.surface.points.every((p,i)=>Distance(p,rates[0].surface.points[i])<1e-5)),'30, 60 and 120 Hz frames share the same 240 Hz physical result');
console.log('PASS '+checks+' soft wax physics checks; 65 nodes, '+peel.surface.edges.length+' stretch/shear edges, '+peel.surface.bends.length+' bending hinges');
