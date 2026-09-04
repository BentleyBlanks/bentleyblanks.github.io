// Pure walking integration, not a browser/Rapier or campaign timing claim.
// Every actor starts once; subsequent positions integrate bounded Move orders.
import assert from "node:assert/strict";
import { FirstLevelP012March, P012SegmentClear, P012NextVisiblePoint, P012RoutePoint, P012RouteProjection } from "./Script_FirstLevelP012March.mjs";
import { FirstLevelP012Runtime } from "./Script_FirstLevelP012Runtime.mjs";
import { openingActivities } from "./Data_FirstLevelP012Opening.mjs";
import { FIRST_LEVEL_P012_LAYOUT } from "./Data_FirstLevelP012Layout.mjs";
import phase from "./Data_FirstLevelP012Whitebox.mjs";
const Distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
function Move(actor,point,speed,dt,blocks,radius=.46){
  const distance=Distance(actor,point),step=Math.min(distance,Math.max(0,speed)*dt);
  const next={x:actor.x+(point.x-actor.x)*step/(distance||1),z:actor.z+(point.z-actor.z)*step/(distance||1)};
  assert.ok(P012SegmentClear(blocks,actor,next,radius),`movement intersects wall ${JSON.stringify({from:{x:actor.x,z:actor.z},next,point:{x:point.x,z:point.z}})}`);
  assert.ok(Distance(actor,next)<=speed*dt+1e-8,"no teleport or speed override");
  Object.assign(actor,next);return step;
}
const clear=[];
assert.equal(P012NextVisiblePoint(clear,{x:0,z:0},[{x:0,z:8},{x:8,z:8},{x:8,z:0}]).index,2,"visible destination skips irrelevant route vertices");
const wall=[{id:"Corner",x:4,z:0,w:1,d:8,y:1,h:2}];
const route=[{x:0,z:0},{x:0,z:6},{x:8,z:6},{x:8,z:0}],walker={...route[0]};
assert.equal(P012SegmentClear(wall,walker,route.at(-1)),false);
for(let i=0;i<600&&Distance(walker,route.at(-1))>.2;i++){
 const cursor=P012RouteProjection(route,walker).index;
 const plan=P012NextVisiblePoint(wall,walker,route,cursor,.46);
 assert.equal(plan.blocked,undefined);Move(walker,plan.point,2,.05,wall);
}
assert.ok(Distance(walker,route.at(-1))<.2,"walker genuinely traverses the safe corner");
for(const halfWidth of [3,1.05]){
 const blocks=[-1,1].map(side=>({x:side*(halfWidth+.5),z:20,w:1,d:60,y:1,h:2}));
 const line=[{x:0,z:0},{x:0,z:40}],march=new FirstLevelP012March(blocks,line);
 const people=Array.from({length:6},(_,slot)=>({x:0,z:-slot*1.2,slot})),speeds=new Set();
 for(let frame=0;frame<900;frame++){
  const leader=P012RoutePoint(line,Math.min(40,frame*.05*2));
  for(const actor of people){const plan=march.Plan(actor.slot,actor,leader,actor.slot,frame*.05);
   speeds.add(plan.speed.toFixed(3));Move(actor,plan.point,plan.speed,.05,blocks);
   assert.ok(Math.abs(actor.x)+.46<=halfWidth+1e-8,"body fits wide/narrow passage");}
 }
 assert.ok(speeds.size>6);assert.ok(people.every(actor=>actor.z>29));
 for(let i=0;i<people.length;i++)for(let j=i+1;j<people.length;j++)
  assert.ok(Distance(people[i],people[j])>=.68,`adult capsules overlap in ${halfWidth*2}m passage: ${i}/${j} gap ${Distance(people[i],people[j])}`);
 const plans=people.map(actor=>march.Plan(actor.slot,actor,{x:0,z:40},actor.slot,0));
 assert.equal(new Set(plans.map(plan=>plan.lag)).size,6,"six staggered depths, not a shared point");
}
const blocks=FIRST_LEVEL_P012_LAYOUT.blocks;
{
 const activity=phase.whitebox.activities,route=activity.openingMarchRoute;
 assert.deepEqual(route.slice(-4),[{x:5,z:-82},{x:5,z:-92},{x:5,z:-99},{x:5,z:-104}],"production march includes the complete northern approach");
 for(let i=1;i<route.length;i++)assert.ok(P012SegmentClear(blocks,route[i-1],route[i],.46),`production route segment ${i} clears real geometry`);
 const guide={...route[0]},people=activity.trainColumn.originalMuster.map((point,slot)=>({...point,id:`fullMarch${slot}`,alive:true,travel:0})),released=[],defended=[];
 const run=new FirstLevelP012Runtime({GuideActor:()=>guide,Position:a=>a,Signalled:()=>false,
  Move:(a,p,speed)=>{a.travel+=Move(a,p,speed,.025,blocks);},ReleaseGuide:a=>released.push(a),Defend:(a,p)=>defended.push({a,p}),
 },phase.whitebox);
 assert.deepEqual(run.march.route,route,"Runtime uses openingMarchRoute rather than the village-only path");
 run.openingCast=people.map((actor,slot)=>({actor,slot,ammoIssued:true,issueComplete:true,parking:{...actor}}));
 const length=P012RouteProjection(route,route.at(-1)).length;
 let frame=0,guideCleared=false,pendingAtClear=0;
 for(;frame<16000;frame++){
  const progress=Math.min(length,frame*.025*2.4);Object.assign(guide,guideCleared?{x:0,z:-103}:P012RoutePoint(route,progress));
  run.beat=guide.z<-80?5:guide.z<0?4:3;run.time=frame*.025;run.StepMarch(.025);
  if(run.marchFrontlineReached&&!guideCleared){guideCleared=true;pendingAtClear=run.openingCast.filter(e=>!e.marchComplete).length;}
  if(run.openingCast.every(entry=>entry.marchComplete))break;
 }
 assert.ok(frame<16000,JSON.stringify(run.openingCast.map(e=>({at:e.actor,plan:e.marchPlan,complete:e.marchComplete}))));
 assert.equal(released.length,6);assert.equal(defended.length,6);
 assert.ok(guideCleared&&pendingAtClear>0,'guide physically reaches the end then clears the gunport before the tail has arrived');
 assert.ok(Distance(guide,route.at(-1))>3,'handover completes while Luo is no longer occupying the route endpoint');
 for(const [i,actor] of people.entries()){
  assert.ok(actor.travel>150,'each companion physically walked beyond the village');
  assert.ok(Distance(actor,activity.openingMarchDefensePositions[i])<.45,'actual individual defensive slot reached');
  assert.deepEqual(defended[i].p,activity.openingMarchDefensePositions[people.indexOf(defended[i].a)]);
 }
 console.log(`PASS production six-person station-to-frontline march ${(frame*.025).toFixed(2)}s, full physical geometry and handover`);
}
{
 const route=phase.whitebox.activities.villageRoute,march=new FirstLevelP012March(blocks,route);
 const length=P012RouteProjection(route,route.at(-1)).length;
 const people=Array.from({length:6},(_,slot)=>({...P012RoutePoint(route,10-slot*1.8),slot,travel:0}));
 for(let frame=0;frame<2400;frame++){
  const leader=P012RoutePoint(route,Math.min(length,12+frame*.05*2));
  for(const actor of people){const plan=march.Plan(actor.slot,actor,leader,actor.slot,frame*.05);
   actor.travel+=Move(actor,plan.point,plan.speed,.05,blocks);}
 }
 assert.ok(people.every(actor=>actor.travel>length-25&&Distance(actor,route.at(-1))<15),"six actual village-route walkers reach the hub without teleport or skipped walls");
}
const entries=openingActivities.traffic.filter(entry=>entry.role==="civilian");
assert.equal(entries.length,13);assert.equal(entries.filter(entry=>entry.child).length,2);
const runtime=new FirstLevelP012Runtime({Position:actor=>actor,
 Move:(actor,point,speed)=>{actor.order={point,speed};}}, {layout:{blocks},activities:openingActivities});
runtime.traffic=entries.map(entry=>({...entry,actor:{...entry.route[0]},parking:entry.route.at(-1),arrived:false,travel:0}));
let maxChildGap=0,minFamilyGap=Infinity;
for(let frame=0;frame<7000;frame++){
 runtime.time=frame*.05;
 for(const member of runtime.traffic)runtime.StepFamilyWalker(member,.05);
 for(const member of runtime.traffic){const order=member.actor.order;
  if(order)member.travel+=Move(member.actor,order.point,order.speed,.05,blocks,member.child?.26:.46);
  if(member.child){const guardian=runtime.traffic.find(other=>other.slot===member.guardianSlot);
   maxChildGap=Math.max(maxChildGap,Distance(member.actor,guardian.actor));}
 }
 for(let i=0;i<runtime.traffic.length;i++)for(let j=i+1;j<runtime.traffic.length;j++){
  const a=runtime.traffic[i],b=runtime.traffic[j];
  if(a.familyId===b.familyId&&!a.arrived&&!b.arrived)minFamilyGap=Math.min(minFamilyGap,Distance(a.actor,b.actor));
 }
}
assert.ok(runtime.traffic.every(member=>member.travel>30),"all thirteen physically move, including both children");
assert.ok(maxChildGap<=5.2,`guardian never leaves child behind: ${maxChildGap}`);
assert.ok(runtime.traffic.every(member=>member.arrived),"every family reaches its real endpoint");
console.log(`FirstLevelP012MarchTest PASS: direct/corner paths, six differentiated walkers, 13 family arrivals; max child gap ${maxChildGap.toFixed(3)}m; minimum moving family gap ${minFamilyGap.toFixed(3)}m (diagnostic, not Rapier separation proof)`);
