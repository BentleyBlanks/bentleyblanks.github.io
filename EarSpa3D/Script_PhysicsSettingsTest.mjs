import assert from 'node:assert/strict';
import {WaxPhysicsSettings,SetWaxPhysicsSettings,WaxPhysicsMaterial,NormalizeWaxPhysicsSettings,WAX_PHYSICS_MATERIALS} from './Data_WaxPhysicsSettings.mjs?v=ear028-physics-settings-20260912';
import {CreatePeelBody,BindPeelSurface,GripPeelBody,StepPeelBody,UngripPeelBody} from './Script_PeelPhysics.mjs';
import {SlimeCage,BindSlimeVolume,GripSlimeVolume,StepSlimeVolume,UngripSlimeVolume} from './Script_SlimePhysics.mjs?v=ear028-physics-settings-20260912';
let checks=0;const Check=(ok,label)=>{assert.ok(ok,label);checks++;};
const defaults=WaxPhysicsSettings();
Check(defaults.dry.stretch<1&&defaults.wet.bend<1&&defaults.dry.damping>12&&defaults.oily.damping>8&&defaults.oily.recovery<.15,'defaults reduce elastic restoration and increase dissipation');
for(const invalid of [null,[],false,12,'bad',{dry:{stretch:'1',damping:NaN},oily:{recovery:Infinity}}])Check(JSON.stringify(NormalizeWaxPhysicsSettings(invalid))===JSON.stringify(defaults),'invalid values fall back to usable defaults');
const bounded=NormalizeWaxPhysicsSettings({dry:{stretch:-100,damping:500,bend:.873,unknown:8},oily:{recovery:0}});
Check(bounded.dry.stretch===.35&&bounded.dry.damping===30&&bounded.dry.bend===.85&&bounded.oily.recovery===.04&&!('unknown' in bounded.dry),'out-of-range and unrecognized fields cannot enter the solver');
const external=SetWaxPhysicsSettings(bounded);external.dry.damping=0;Check(WaxPhysicsMaterial('dry').damping===30&&Object.isFrozen(WaxPhysicsMaterial('dry')),'snapshots cannot mutate runtime materials');
function Configure(type,patch){const next=structuredClone(defaults);Object.assign(next[type],patch);SetWaxPhysicsSettings(next);}
const positions=[-1,-1,0,1,-1,0,1,1,0,-1,1,0,-1,-1,.06,1,-1,.06,1,1,.06,-1,1,.06],indices=[0,2,1,0,3,2,4,5,6,4,6,7,0,1,5,0,5,4,1,2,6,1,6,5,2,3,7,2,7,6,3,0,4,3,4,7];
function Shell(type='wet'){return BindPeelSurface(CreatePeelBody({position:[0,0,0],rotation:[0,0,0,1],normal:[0,0,1],size:1,type,footprint:[1,1],anchorCount:9}),positions,indices);}
function Gel(){const b=CreatePeelBody({position:[0,0,0],rotation:[0,0,0,1],normal:[0,0,1],size:.8,type:'oily',footprint:[1.08,1.26],anchorCount:13}),c=SlimeCage(.8,1);BindSlimeVolume(b,c.positions,c.indices);return b;}
function Step(body,options,n=60){for(let i=0;i<n;i++)(body.gel?StepSlimeVolume:StepPeelBody)(body,options,1/60);return body;}
const loaded=Shell();SetWaxPhysicsSettings(defaults);GripPeelBody(loaded,[0,-.8,.06]);Step(loaded,{target:[0,-.8,.5],minAnchors:9});UngripPeelBody(loaded);
const recoil=[];
for(const legacy of [true,false]){
  Configure('wet',legacy?{stretch:1,bend:1,damping:12}:{});
  const body=structuredClone(loaded);let energy=0;
  for(let i=0;i<30;i++){Step(body,{},1);energy+=body.surface.velocities.reduce((s,v)=>s+v.reduce((s,k)=>s+k*k,0),0);}
  recoil.push({energy,bend:body.bend});
}
Check(recoil[1].energy<recoil[0].energy*.95,'same loaded shell releases with less motion energy under the new defaults');
const flexible=[];
for(const bend of [.4,1.8]){Configure('wet',{bend});const b=Shell();GripPeelBody(b,[0,-.8,.06]);Step(b,{target:[0,-.8,.45],minAnchors:9});flexible.push(b.bend);}
Check(flexible[0]>flexible[1]*1.1,'bend slider changes actual folded geometry');
const stretch=[];
for(const value of [.35,1.6]){Configure('wet',{stretch:value});const b=Shell();GripPeelBody(b,[0,-.8,.06]);Step(b,{target:[0,-1.5,.2],minAnchors:9});stretch.push(b.surface.maxStretch);}
Check(stretch[0]>stretch[1]*1.1,'stretch slider changes physical edge extension');
const adhesion=[];
for(const value of [.4,1.8]){Configure('wet',{adhesion:value});const b=Shell();GripPeelBody(b,[0,-.8,.06]);Step(b,{target:[0,-.8,.5],minAnchors:9});adhesion.push(b.strain);}
Check(adhesion[0]>adhesion[1]*2,'adhesion slider changes the real anchor failure load');
const cohesion=[];
for(const value of [.4,1.8]){Configure('dry',{cohesion:value});const b=Shell('dry');GripPeelBody(b,[0,-.8,.06]);Step(b,{target:[0,-.8,.1],adhesion:12,minAnchors:9,fracture:true},10);cohesion.push(b.surface.cohesion.ratio);}
Check(cohesion[0]>cohesion[1]*2,'cohesion slider changes the real fracture criterion');
for(const type of ['wet','oily']){
  const motion=[];
  for(const damping of [6,30]){Configure(type,{damping});const b=type==='oily'?Gel():Shell(),s=b.gel||b.surface;b.anchors.forEach(a=>a.alive=false);b.detached=true;s.velocities.forEach(v=>v[0]=1);Step(b,{gravity:[0,0,0]},6);motion.push(b.position[0]);}
  Check(motion[0]>motion[1]*1.5,type+' damping slider dissipates momentum');
}
const gelLoaded=Gel();SetWaxPhysicsSettings(defaults);GripSlimeVolume(gelLoaded,[0,-.5,.55]);Step(gelLoaded,{target:[0,-.5,1.5],minAnchors:13},30);UngripSlimeVolume(gelLoaded);
for(const key of ['stretch','viscosity','relaxation','recovery','adhesion']){
  const field=WAX_PHYSICS_MATERIALS.oily.fields.find(f=>f.id===key),results=[];
  for(const value of [field.min,field.max]){
    Configure('oily',{[key]:value});const b=structuredClone(gelLoaded);Step(b,{},12);
    Check(b.gel.minJacobian>0&&Math.abs(b.gel.volumeRatio-1)<.04&&b.gel.points.flat().every(Number.isFinite),'oil '+key+' remains finite and conserves volume at '+value);
    results.push(key==='adhesion'?b.strain:key==='relaxation'||key==='recovery'?b.gel.edges.map(e=>e.memory):b.gel.points.flat());
  }
  Check(JSON.stringify(results[0])!==JSON.stringify(results[1]),'oil '+key+' affects actual material evolution');
}
const existing=Shell(),points=existing.surface.points,anchors=existing.anchors,geometry=JSON.stringify(points);Configure('wet',{damping:22});Check(existing.surface.points===points&&existing.anchors===anchors&&JSON.stringify(points)===geometry,'parameter changes preserve existing geometry and attachment state');
SetWaxPhysicsSettings();Check(JSON.stringify(WaxPhysicsSettings())===JSON.stringify(defaults),'reset restores all four materials');
console.log('PASS',checks,'physics settings checks',JSON.stringify({recoil,flexible,stretch,adhesion,cohesion}));
