// Pure small-step physical queue contract, using production station supports/OBBs.
import assert from 'node:assert/strict';
import config from './Data_FirstLevelP012TrainColumn.mjs';
import {FirstLevelP012TrainColumn} from './Script_FirstLevelP012TrainColumn.mjs';
import {FIRST_LEVEL_P012_LAYOUT as layout} from './Data_FirstLevelP012Layout.mjs';
import {FIRST_LEVEL_P012_WHITEBOX_PHASE as phase} from './Data_FirstLevelP012Whitebox.mjs';
assert.deepEqual(config.cars[0].ammoPoint,{x:-55,z:94},'north car reuses the existing ammunition station');
assert.deepEqual(config.cars[0].onward,[{x:-51,z:94},{x:-49,z:92}],'north car proceeds onward without doubling back onto the platform');
function Ground(p){let y=0;for(const b of layout.walkableSurfaces||[]){const dx=p.x-b.x,dz=p.z-b.z,c=Math.cos(b.ry||0),s=Math.sin(b.ry||0);if(Math.abs(dx*c-dz*s)<=b.w/2&&Math.abs(dx*s+dz*c)<=b.d/2)y=Math.max(y,b.y+b.h/2);}return y;}
const solids=layout.blocks.filter(b=>b.solid!==false);
function Clear(p){const foot=Ground(p);for(const b of solids){const dx=p.x-b.x,dz=p.z-b.z;if(Math.abs(dx)>Math.hypot(b.w,b.d)/2+.42||Math.abs(dz)>Math.hypot(b.w,b.d)/2+.42||b.y-b.h/2>foot+1.8||b.y+b.h/2<foot+.1)continue;const c=Math.cos(b.ry||0),s=Math.sin(b.ry||0);assert.ok(Math.hypot(Math.max(0,Math.abs(dx*c-dz*s)-b.w/2),Math.max(0,Math.abs(dx*s+dz*c)-b.d/2))>=.42,`${b.id} at ${JSON.stringify(p)}`);}}
const actors=Array.from({length:6},(_,i)=>({id:`original${i}`,alive:true})),receipts=[],initialized=new Set(),released=[],heights=new Map();
let spawned=0,visible=true,open=false;
const dt=.025;
const run=new FirstLevelP012TrainColumn({ExistingRecruits:()=>actors.slice(0,6),
 SpawnRecruit:spec=>{spawned++;const actor={id:`extra${spawned}`,alive:true,scriptedNoncombatant:spec.scriptedNoncombatant};actors.push(actor);return actor;},
 Initialize:(a,p)=>{assert.ok(!initialized.has(a));initialized.add(a);Object.assign(a,p);},Position:a=>a,
 SetEquipment:(a,stage)=>{
  if(stage!=='empty'){const entry=run.entries.find(e=>e.actor===a),car=config.cars[entry.carIndex],point=stage==='weapon'?car.weaponPoint:car.ammoPoint;
   assert.ok(Math.hypot(a.x-point.x,a.z-point.z)<=config.arrivalRadiusM,'issue occurs only at the physical work point');}
  receipts.push({id:a.id,stage,at:{x:a.x,z:a.z}});
 },DoorOpen:()=>open,
 Move:(a,p,speed)=>{const d=Math.hypot(p.x-a.x,p.z-a.z);assert.ok(d<=8.001);if(d>.1){const f=Math.min(d-.1,speed*dt)/d;a.x+=(p.x-a.x)*f;a.z+=(p.z-a.z)*f;}},
 Release:a=>released.push(a),Visible:()=>visible,Retire:a=>{a.retired=true;return true;},
},config);
run.Update(dt,0);assert.equal(actors.length,40);assert.equal(spawned,34);
assert.deepEqual([0,1,2].map(car=>run.Entries().filter(e=>e.carIndex===car).length),[8,24,8]);
for(const a of actors){assert.equal(Ground(a),1.25);Clear(a);}
for(let i=0;i<actors.length;i++)for(let j=i+1;j<actors.length;j++)assert.ok(Math.hypot(actors[i].x-actors[j].x,actors[i].z-actors[j].z)>=.9);
for(const a of actors)for(const p of [phase.spawn,phase.whitebox.activities.arrivalGuideStart,phase.whitebox.activities.trainRoute[1]])assert.ok(Math.hypot(a.x-p.x,a.z-p.z)>.84,'player and Luo reserve real body space');
const start=actors.map(a=>({x:a.x,z:a.z}));for(let i=0;i<40;i++)run.Update(dt,0);assert.deepEqual(actors.map(a=>({x:a.x,z:a.z})),start);
open=true;let frames=0,unchanged=0,lastSignature='';const checked=new Map(),overlappingExitCars=new Set();
for(;frames<24000;frames++){
 run.Update(dt,frames*dt>20?3:0);
 for(const carIndex of [0,1,2])if(run.entries.filter(entry=>entry.carIndex===carIndex&&!entry.exitDone&&entry.requestedSpeed>0).length>1)overlappingExitCars.add(carIndex);
 for(const e of run.Entries()){
  assert.ok(Number.isFinite(e.requestedSpeed));assert.ok(Array.isArray(e.mergeOwners));
  if(e.requestedSpeed>0)assert.ok(e.requestedTarget&&Number.isFinite(e.requestedTarget.x));
  for(const owner of e.mergeOwners)assert.ok(actors.some(a=>a.id===owner.actorId),'merge ownership is an actual actor, not a virtual queue head');
 }
 for(const a of actors){const key=`${a.x},${a.z}`;if(checked.get(a)!==key){Clear(a);checked.set(a,key);}
  const y=Ground(a),previous=heights.get(a);if(previous!==undefined)assert.ok(Math.abs(y-previous)<=.251,'shared support descends real carriage/platform stairs');heights.set(a,y);}
 for(let i=0;i<actors.length;i++)for(let j=i+1;j<actors.length;j++)assert.ok(Math.hypot(actors[i].x-actors[j].x,actors[i].z-actors[j].z)>=.899,`body overlap ${actors[i].id}/${actors[j].id}`);
 if(run.Entries().every(e=>e.stage==='arrived'))break;
 const signature=JSON.stringify(run.Entries().map(e=>[e.index,e.position.x,e.position.z]));unchanged=signature===lastSignature?unchanged+1:0;lastSignature=signature;
 if(unchanged>400){frames=24000;break;}
}
assert.ok(frames<24000,JSON.stringify(run.Entries().filter(e=>e.stage!=='arrived').map(e=>({id:e.actorId,stage:e.stage,index:e.index,at:e.position,target:e.steps[e.index]}))));
assert.equal(released.length,6);assert.equal(run.Entries().filter(e=>e.retired).length,0,'visible arrivals do not disappear');
assert.deepEqual([...overlappingExitCars].sort(),[0,1,2],'all three doorways let followers start before predecessors finish the whole exit route');
assert.ok(released.every(a=>a.id.startsWith('original')),'background recruits never enter the fighting squad');
for(const e of run.Entries()){
 assert.ok(e.exitDone&&e.weaponIssued&&e.ammoIssued);assert.equal(e.weaponIssueCount,1);assert.equal(e.ammoIssueCount,1);
 assert.deepEqual(receipts.filter(r=>r.id===e.actorId).map(r=>r.stage),['empty','weapon','ammo']);
 if(e.extra)assert.equal(e.actor.scriptedNoncombatant,true);
}
visible=false;run.Update(dt,6);run.Update(dt,6);assert.equal(run.Entries().filter(e=>e.retired).length,34);assert.equal(spawned,34);assert.equal(initialized.size,40);
console.log(`PASS finite train column 40 bodies, physical exits/issue/arrival in ${(frames*dt).toFixed(2)}s, original6/extra34`);
{
 // Regression fixture initialization, not an in-game teleport: reproduce the
 // Rapier-displaced pair from StationFamiliesBriefingFixed at the north corner.
 const original=Array.from({length:6},(_,i)=>({id:`fixtureOriginal${i}`,alive:true}));let nextId=32;
 const equipment=[];
 const fixture=new FirstLevelP012TrainColumn({ExistingRecruits:()=>original,
  SpawnRecruit:()=>({id:nextId++,alive:true}),Initialize:(a,p)=>Object.assign(a,p),Position:a=>a,
  SetEquipment:(a,stage)=>equipment.push(stage),DoorOpen:()=>true,Visible:()=>true,
  Move:(a,p,speed)=>{const d=Math.hypot(p.x-a.x,p.z-a.z);if(d>.1){const f=Math.min(d-.1,speed*dt)/d;a.x+=(p.x-a.x)*f;a.z+=(p.z-a.z)*f;}},
 },config);
 fixture.Initialize();const pair=fixture.entries.filter(e=>e.carIndex===0).slice(0,2);
 for(const e of fixture.entries)e.retired=!pair.includes(e);
 for(const [i,e] of pair.entries()){
  Object.assign(e.actor,i?{x:-51.8635,z:94.0271}:{x:-51.0217,z:94.3541});
  Object.assign(e,{index:7,stage:'march',exitDone:true,weaponIssued:true,ammoIssued:true,weaponIssueCount:1,ammoIssueCount:1});
 }
 const corner=config.mergePoints.find(p=>p.x===-49&&p.z===92);fixture.merges.set(corner,pair[0]);
 equipment.length=0;fixture.Update(dt,3);assert.equal(pair[0].index,8,'real .355m near-corner arrival advances without reversing into the follower');
 for(let i=0;i<500;i++){
  fixture.Update(dt,3);for(const e of pair)Clear(e.actor);
  assert.ok(Math.hypot(pair[0].actor.x-pair[1].actor.x,pair[0].actor.z-pair[1].actor.z)>=.899);
 }
 assert.ok(pair.every(e=>e.index>8),'both real bodies clear the failed corner');assert.deepEqual(equipment,[],'route recovery cannot reissue either resource');
 assert.ok(pair.every(e=>e.weaponIssueCount===1&&e.ammoIssueCount===1));
 const strict=pair[0];strict.retired=false;strict.released=false;strict.index=6;strict.stage='ammo';strict.hold=0;
 const ammo=config.cars[0].ammoPoint;Object.assign(strict.actor,{x:ammo.x,z:ammo.z+.355});
 fixture.Update(dt,3);assert.equal(strict.index,6,'interaction arrival remains precise, unlike non-interactive route corners');assert.equal(strict.hold,0);
 console.log('PASS displaced .355m corner recovery, unchanged precise issue radius, no repeated issue');
}
