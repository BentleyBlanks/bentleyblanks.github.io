// Pure deterministic family composition and physical route audit; no GPU.
import assert from "node:assert/strict";
import {openingActivities,openingFamilies} from "./Data_FirstLevelP012Opening.mjs";
import {FIRST_LEVEL_P012_LAYOUT as layout} from "./Data_FirstLevelP012Layout.mjs";
const people=openingActivities.traffic.filter(person=>person.role==="civilian");
assert.equal(people.filter(person=>!person.child).length,11);
assert.equal(people.filter(person=>person.child).length,2);
assert.equal(new Set(people.map(person=>person.slot)).size,13);
assert.equal(new Set(people.map(person=>person.speedMps)).size,4);
assert.equal(openingFamilies.length,4);
const apron=layout.blocks.find(block=>block.id==="StationPlatformApron");
function Blocked(point,block,radius){
 const c=Math.cos(block.ry||0),s=Math.sin(block.ry||0),dx=point.x-block.x,dz=point.z-block.z;
 return Math.hypot(Math.max(0,Math.abs(dx*c-dz*s)-block.w/2),Math.max(0,Math.abs(dx*s+dz*c)-block.d/2))<radius;
}
for(const person of people){
 const sweepRadius=person.child?.3:.6;
 assert.ok(people.some(guardian=>guardian.slot===person.guardianSlot&&!guardian.child&&guardian.familyId===person.familyId));
 if(person.child)assert.ok(["childBoy","childGirl"].includes(person.variant)&&person.bodyRadius===.24);
 for(let index=1;index<person.route.length;index++){
  const a=person.route[index-1],b=person.route[index],n=Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/.15);
  for(let step=0;step<=n;step++){
   const t=step/n,point={x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t};
   assert.ok(!Blocked(point,apron,sweepRadius),"families never enter military platform");
   assert.ok(!layout.blocks.some(block=>block.solid!==false&&block.y+block.h/2>.1&&block.y-block.h/2<person.bodyHeight&&Blocked(point,block,sweepRadius)),`family ${person.slot} route collides at ${point.x},${point.z}`);
  }
 }
}
// Lateral values are candidates, never permission to cross a wall. Runtime must
// sweep and narrow before applying them; the certified fallback is each route.
assert.ok(people.every(person=>Math.abs(person.lateralM)<=.45&&person.spacingM>=1));
console.log("PASS P012 finite families, distinct speeds, child contracts and swept routes");

import {FirstLevelP012Runtime} from './Script_FirstLevelP012Runtime.mjs';
import {P012SegmentClear} from './Script_FirstLevelP012March.mjs';
{
 const config={activities:openingActivities,layout},walkers=people.map(p=>({...p,actor:{position:{...p.route[0]}},parking:p.route.at(-1)}));
 const runtime=new FirstLevelP012Runtime({Position:a=>a.position,Move:(actor,point,speed)=>{actor.target={...point};actor.speed=speed;}},config);runtime.traffic=walkers;
 runtime.civilianAlarm=true;runtime.CivilianImpact({x:-30,z:45});
 const reactions=new Set(),speeds=[],laterals=[];let maxChildGap=0;
 for(let frame=0;frame<600;frame++){
  runtime.time+=.05;if(frame===200)runtime.CivilianImpact({x:-30,z:75});
  for(const walker of walkers){
   runtime.StepFamilyWalker(walker,.05);const a=walker.actor,p=a.position,target=a.target;
   if(walker.panicState==='startled')reactions.add(walker.slot);
   if(walker.panicState==='fleeing'){speeds.push(a.speed);laterals.push(walker.panicLateral);}
   assert.ok(P012SegmentClear(layout.blocks,p,target,walker.child?.26:.46),'panic target cannot cross actual walls');
   const distance=Math.hypot(target.x-p.x,target.z-p.z),step=Math.min(distance,a.speed*.05);
   if(distance){p.x+=(target.x-p.x)*step/distance;p.z+=(target.z-p.z)*step/distance;}
   if(walker.child){const guardian=walkers.find(w=>w.slot===walker.guardianSlot);maxChildGap=Math.max(maxChildGap,Math.hypot(p.x-guardian.actor.position.x,p.z-guardian.actor.position.z));}
  }
 }
 assert.ok(reactions.size>=10,'individual civilians visibly flinch');
 assert.ok(new Set(walkers.map(w=>w.panic.at)).size>=8,'hearing and startle response are staggered');
 assert.ok(Math.max(...speeds)-Math.min(...speeds)>1,'escape has overtaking and slowing rather than one speed');
 assert.ok(Math.max(...laterals)-Math.min(...laterals)>2,'panic does not preserve two fixed marching lanes');
 assert.ok(maxChildGap<9,'guardians still wait for their children');
 assert.ok(walkers.every(w=>w.actor.position.z>w.route[0].z+25),'fear cannot strand a family indefinitely');
 console.log('PASS irregular panic, repeated nearby startle, wall clearance and child cohesion',maxChildGap);
}
