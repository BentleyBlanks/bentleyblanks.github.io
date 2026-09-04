// Finite placement and actual geometry clearance; no renderer needed.
import assert from "node:assert/strict";
import {P012_RESTING_PEOPLE as people,P012_RESTING_BLOCKS as seats} from "./Data_FirstLevelP012Resting.mjs";
import {FirstLevelP012Resting} from "./Script_FirstLevelP012Resting.mjs";
import {FIRST_LEVEL_P012_LAYOUT as layout,P012_ROUTES as routes} from "./Data_FirstLevelP012Layout.mjs";
import {openingActivities} from "./Data_FirstLevelP012Opening.mjs";
function Hits(p,b,r){const c=Math.cos(b.ry||0),s=Math.sin(b.ry||0),dx=p.x-b.x,dz=p.z-b.z;return Math.hypot(Math.max(0,Math.abs(dx*c-dz*s)-b.w/2),Math.max(0,Math.abs(dx*s+dz*c)-b.d/2))<r;}
assert.equal(people.length,3);assert.equal(seats.length,3);
for(const person of people){
 assert.equal(person.weapon,null);assert.equal(person.lifePose.sit,1);
 // The seated body intentionally rests on its own support. Reject every other
 // collider, and separately require that exact support in the assembled world.
 assert.ok(!layout.blocks.some(b=>b.id!==person.seatId&&b.solid!==false&&b.y-b.h/2<1.8&&Hits(person,b,.6)),`${person.id} placement blocked`);
 const supports=layout.blocks.filter(b=>b.id===person.seatId);
 assert.equal(supports.length,1,"each real seat is assembled exactly once");
 assert.ok(supports[0].solid&&Hits(person,supports[0],.1),"own seat supports the seated body");
 const apron=layout.blocks.find(b=>b.id==="StationPlatformApron");assert.ok(!Hits(person,apron,.6));
 assert.equal(seats.find(b=>b.id===person.seatId).y+.25,.5);
}
for(const route of [routes.north,routes.south,routes.retreat,...openingActivities.traffic.map(person=>person.route)])for(let i=1;i<route.length;i++){
 const a=route[i-1],b=route[i],n=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/.2));
 for(let j=0;j<=n;j++){const t=j/n,p={x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t};
  assert.ok(!seats.some(seat=>Hits(p,seat,1.3)),"new resting seats leave main, stretcher and traffic paths clear");
 }
}
let spawned=0,removed=0;const poses=[];
const host={Spawn:spec=>({...spec,serial:spawned++}),Position:actor=>({x:actor.x,z:actor.z}),HoldPose:(actor,pose)=>poses.push({id:actor.id,pose}),Remove:()=>removed++};
const rest=new FirstLevelP012Resting(host);assert.equal(rest.Start(),true);assert.equal(rest.Start(),false);assert.equal(spawned,3);
const initial=rest.Snapshot();for(let i=0;i<60;i++)rest.Update(1/60);
assert.deepEqual(rest.Snapshot(),initial,"time alone cannot scatter or relocate resting people");
assert.equal(rest.OnImpact({event:"P012NorthApproachChat",position:people[0]}),0);
assert.equal(rest.OnImpact({event:"P012NorthNearMissImpact",position:{x:500,z:500}}),0);
assert.equal(rest.OnImpact({event:"P012NorthNearMissImpact",position:people[0]}),3);
for(let i=0;i<60;i++)rest.Update(1/60);
assert.ok(rest.Snapshot().every(entry=>entry.sit===1&&entry.brace===1&&entry.alert&&entry.lookPitch===-.45));
assert.deepEqual(rest.Snapshot().map(entry=>entry.position),initial.map(entry=>entry.position),"impact changes posture, never teleports/runs");
assert.ok(poses.at(-1).pose.crouch===0&&poses.at(-1).pose.lifePose.sit===1&&poses.at(-1).pose.moveSpeed===0,"near impact lowers head without standing into the bench");
rest.Dispose();rest.Dispose();rest.Start();assert.equal(removed,3);assert.equal(spawned,3);
console.log("PASS P012 finite resting civilians, seated posture contract and swept roadside geometry");
