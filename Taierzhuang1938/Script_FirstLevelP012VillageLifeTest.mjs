// Behavioural lifecycle and swept WORLD-space geometry, no renderer/source regex.
import assert from "node:assert/strict";
import {FirstLevelP012VillageLife} from "./Script_FirstLevelP012VillageLife.mjs";
import {P012_VILLAGE_LIFE as config,P012_VILLAGE_LIFE_PEOPLE as people,P012_VILLAGE_LIFE_BLOCKS as props} from "./Data_FirstLevelP012VillageLife.mjs";
import {FIRST_LEVEL_P012_LAYOUT as layout,P012_ROUTES as routes} from "./Data_FirstLevelP012Layout.mjs";
function Hits(p,b,r){const c=Math.cos(b.ry||0),s=Math.sin(b.ry||0),dx=p.x-b.x,dz=p.z-b.z;return Math.hypot(Math.max(0,Math.abs(dx*c-dz*s)-b.w/2),Math.max(0,Math.abs(dx*s+dz*c)-b.d/2))<r;}
function Sweep(route,r,blocks){for(let i=1;i<route.length;i++){const a=route[i-1],b=route[i],n=Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/.1);for(let j=0;j<=n;j++){const p={x:a.x+(b.x-a.x)*j/n,z:a.z+(b.z-a.z)*j/n};assert.ok(!blocks.some(block=>Hits(p,block,r)),`blocked ${JSON.stringify(p)} r${r}: ${blocks.filter(block=>Hits(p,block,r)).map(b=>b.id)}`);}}}
const solids=layout.blocks.filter(b=>b.solid!==false&&b.y-b.h/2<1.8&&b.h>.2);
for(const person of people)assert.ok(!solids.some(block=>Hits(person,block,.43)),`${person.id} in wall`);
Sweep(config.telephoneRoute,.43,solids);Sweep(config.muleRoute,1.05,solids);
for(const route of [routes.north,routes.south,routes.retreat])Sweep(route,1.3,props.filter(b=>b.y-b.h/2<1.8));
let spawned=0,removed=0,visible=false,blocked=false;const poses=[],signals=[],family={id:"OriginalFamilyActor",x:-32,z:46};
const host={Spawn:spec=>({...spec,serial:spawned++}),Position:actor=>({x:actor.x,z:actor.z}),ExistingFamilyActor:(id,slot)=>id===config.familyId&&slot===config.familySlot?family:null,IsVisible:()=>visible,Signal:name=>signals.push(name),Remove:()=>removed++,Pose:(actor,state)=>poses.push({id:actor.id,...state}),Move:(actor,target,speed,dt)=>{if(blocked)return;const d=Math.hypot(target.x-actor.x,target.z-actor.z),t=Math.min(1,speed*dt/d);if(d){actor.x+=(target.x-actor.x)*t;actor.z+=(target.z-actor.z)*t;}},MoveProp:(from,to)=>blocked?from:to};
const life=new FirstLevelP012VillageLife(host);assert.equal(life.Start(),true);assert.equal(life.Start(),false);assert.equal(spawned,5);
for(let i=0;i<100;i++)life.Update(.1);assert.equal(life.Snapshot().door.state,"waiting");assert.equal(life.Snapshot().mule.travel,0);
visible=true;for(let i=0;i<45;i++)life.Update(.1);let snap=life.Snapshot();assert.equal(snap.door.state,"lowering");assert.ok(snap.door.rotationX<0&&snap.door.rotationX>-Math.PI/2);assert.ok(poses.some(p=>p.reach===1&&p.melee>0));
blocked=true;const before=life.Snapshot();for(let i=0;i<10;i++)life.Update(.1);snap=life.Snapshot();assert.deepEqual(snap.mule.position,before.mule.position);assert.deepEqual(snap.telephone.position,before.telephone.position);blocked=false;
for(let i=0;i<1800;i++)life.Update(.1);snap=life.Snapshot();assert.equal(snap.door.state,"stretcherReady");assert.equal(snap.door.rotationX,-Math.PI/2);assert.equal(snap.mule.state,"arrived");assert.equal(snap.telephone.state,"arrived");assert.ok(snap.telephone.position.z<config.telephoneRoute[0].z);assert.ok(snap.mule.position.z<config.muleRoute[0].z);
for(let i=1;i<snap.telephone.wire.length;i++)assert.ok(Math.hypot(snap.telephone.wire[i].x-snap.telephone.wire[i-1].x,snap.telephone.wire[i].z-snap.telephone.wire[i-1].z)<.53,"wire leaves no gaps/jumps");
assert.deepEqual(snap.telephone.wire.at(-1),snap.telephone.position);family.z+=2;assert.equal(life.Snapshot().cart.position.z,family.z);assert.equal(life.Snapshot().cart.actorId,family.id);assert.equal(spawned,5);assert.equal(new Set(signals).size,5);assert.equal(signals.length,5);
life.Dispose();life.Dispose();assert.equal(removed,5);assert.equal(life.Start(),false);
console.log("PASS P012 village finite cast, door work/lowering/lashing, collision-gated northbound logistics, continuous wire, original-family cart and route clearance");
