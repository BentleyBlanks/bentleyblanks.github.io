// Runtime adapter regression: real actor handles, finite budgets, warning-before-impact.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { FirstLevelP012Runtime, P012GuideApproach, P012CanResumeMarch } from "./Script_FirstLevelP012Runtime.mjs";
import {P012SegmentClear} from "./Script_FirstLevelP012March.mjs";
import { SETPIECES, EscortColumn, LastLitterArrived, StepP012PlayerLitter, StepP012AirCivilian } from "./Script_MissionSetpieces.mjs";
import P012Phase from "./Data_FirstLevelP012Whitebox.mjs";
import {FirstLevelP012Director} from "./Script_FirstLevelP012Flow.mjs";
import {InteractSystem} from "./Script_Interact.mjs";
import {FIRST_LEVEL_P012_LAYOUT as openingLayout} from "./Data_FirstLevelP012Layout.mjs";
import {P012SouthPoint,P012StationPoint} from "./Data_FirstLevelP012Space.mjs";
import {openingActivities,openingStoryBeats} from "./Data_FirstLevelP012Opening.mjs";
function FootY(layout,p) {
 let y=0;
 for(const b of layout.walkableSurfaces||[]){
  const dx=p.x-b.x,dz=p.z-b.z,c=Math.cos(b.ry||0),s=Math.sin(b.ry||0);
  if(Math.abs(dx*c-dz*s)<=b.w/2&&Math.abs(dx*s+dz*c)<=b.d/2)y=Math.max(y,b.y+b.h/2);
 }
 return y;
}
assert.ok(openingStoryBeats.length>0);
{
 const source=readFileSync(new URL('./Script_Ai.mjs',import.meta.url),'utf8');
 const method=source.match(/  StepCarriedCasualty\(s, dt, player\) \{[\s\S]*?\n  \}/)[0];
 const Step=vm.runInNewContext(`({${method}}).StepCarriedCasualty`,{Math});
 const Position=(x,y,z)=>({x,y,z,copy(p){this.x=p.x;this.y=p.y;this.z=p.z;return this;}});
 const bodyPositions=[],poses=[],actor={id:7,alive:true,health:65,position:Position(108,0,70),
  body:{SetSize(){},Teleport:(x,y,z)=>bodyPositions.push({x,y,z})},
  actor:{root:{position:Position(108,0,70),rotation:{}},Update:(dt,pose)=>poses.push(pose)}};
 const member={role:'civilian',handle:actor,p012Injured:true};
 const s={mem:{p012AirCivilian:{member,injured:true}},carry:{KindId:'wounded',load:{payload:{who:'anotherCasualty'}}},
  d:{host:{PositionOf:handle=>({...handle.position}),SetGoal(){}}}};
 StepP012AirCivilian(s);assert.equal(actor.p012CarriedCasualty,false,'a different wounded load cannot move this person');
 s.carry.load.payload.who='p012AirCivilian';StepP012AirCivilian(s);
 const player={position:Position(108,0,70),yaw:0};
 for(let frame=0;frame<80;frame++){
  player.position.z-=.04;player.yaw=frame*.01;Step.call({time:frame/30},actor,1/30,player);StepP012AirCivilian(s);
  assert.ok(Math.hypot(actor.position.x-player.position.x,actor.position.z-player.position.z)<.36);
  assert.deepEqual(bodyPositions.at(-1),{x:actor.position.x,y:actor.position.y,z:actor.position.z});
 }
 assert.ok(poses.every(pose=>pose.prone===1&&pose.moveSpeed===0),'same model has the carried casualty pose');
 const drop={...actor.position};s.carry.KindId=null;s.carry.load=null;StepP012AirCivilian(s);
 assert.equal(actor.p012CarriedCasualty,false);assert.deepEqual(actor.position,drop,'dropping preserves the current location, not the old pickup anchor');
 assert.equal(actor.health,65);assert.equal(s.mem.p012AirCivilian.member.handle,actor);
 s.phase={whitebox:P012Phase.whitebox};s.mem.p012AirCivilian.carried=true;
 actor.position=Position(104.4300129913684,1.05,62.92767034613633);actor.yaw=Math.PI/2;
 StepP012AirCivilian(s);
 assert.equal(actor.yaw,0,'recorded narrow rescue bay lays the body along the bank instead of across its wall');
 assert.equal(actor.position.x,104.4300129913684);assert.equal(actor.position.z,62.92767034613633);
 console.log('PASS same living civilian attachment, physical body/model agreement, and drop identity');
}
{
 const config=P012Phase.whitebox,activity=config.activities,blocks=config.layout.blocks;
 // Actual positions from the screen-wall regression. The second defender
 // started on the wrong side; a direct defend goal left him there indefinitely.
 const actors=[{id:1,x:85.65912309457913,z:15.04185442164237,alive:true},
  {id:2,x:86.23992165377418,z:21.216750909685757,alive:true}];
 const defended=[],released=[];let held=true,commands=0;
 const runtime=new FirstLevelP012Runtime({Position:actor=>actor,BodyRadius:()=>.34,
  Signalled:()=>held,ReleaseDefense:actor=>{actor.scriptDefensive=false;},
  ReleaseGuide:actor=>released.push(actor.id),Defend:(actor,point)=>{defended.push(actor.id);actor.scriptDefensive=true;},
  Move:(actor,target,speed)=>{
    assert.ok(P012SegmentClear(blocks,actor,target,.34),'road defenders use the standing AI capsule through the real courtyard opening on every command');
    const distance=Math.hypot(target.x-actor.x,target.z-actor.z);
    if(distance<=(actor.scriptArrivalRadius||.15))return;
    const step=Math.min(distance,speed*.05);
    actor.x+=(target.x-actor.x)*step/(distance||1);actor.z+=(target.z-actor.z)*step/(distance||1);commands++;
  },
 },config);
 runtime.beat=13;runtime.defenders=actors;
 for(let i=0;i<800&&!actors.every(actor=>actor.scriptDefensive);i++)runtime.StepRoadCover();
 assert.ok(commands>0);
 assert.deepEqual(defended.toSorted(),[1,2]);
 assert.ok(actors.every((actor,index)=>Math.hypot(actor.x-activity.roadContactFriendlyCovers[index].x,
  actor.z-activity.roadContactFriendlyCovers[index].z)<.6),'both original living defenders really reach separate covers');
 const settled=actors.map(actor=>({...actor}));for(let i=0;i<20;i++)runtime.StepRoadCover();
 assert.deepEqual(actors,settled,'arrived defenders hold without restarting movement');
 runtime.beat=14;runtime.StepRoadCover();assert.equal(runtime.roadCoverMoves,null);
}
{
 const guard={id:'escortGuard',x:0,z:0},fighter={id:'companion',x:0,z:0},orders=[];let held=false;
 const runtime=new FirstLevelP012Runtime({GuideActor:()=>null,Position:actor=>actor,
  FriendlyActors:()=>[guard,fighter],IsEscortMember:actor=>actor===guard,
  Signalled:name=>name==='P012RoadContactHold'&&held,Defend:(actor,point)=>orders.push({actor,point}),
 },{activities:{roadContactFriendlyCovers:[{x:5,z:5}]}});
 runtime.beat=13;runtime.Update(.05);
 assert.equal(orders.length,0,'walking south cannot pin the following squad in its northern positions');
 held=true;runtime.Update(.05);
 assert.ok(orders.length>0&&orders.every(order=>order.actor===fighter),'road cover orders leave all column-owned guards with their stretchers');
}
{
 const config=P012Phase.whitebox,activity=config.activities,blocks=config.layout.blocks;
 const Make=(beat,start,radius=.42)=>{
  const actor={...start},player={...start},events=[],signals=new Set();let releases=0;
  const runtime=new FirstLevelP012Runtime({GuideActor:()=>actor,Position:a=>a,PlayerPosition:()=>player,
   Signalled:event=>signals.has(event),Signal:event=>{events.push(event);signals.add(event);},ReleaseGuide:()=>{releases++;},BodyRadius:()=>radius,
   Move:(a,target,speed)=>{assert.ok(P012SegmentClear(blocks,a,target,radius),'every guide command has body clearance');
    const distance=Math.hypot(target.x-a.x,target.z-a.z);
    if(distance<=(a.scriptArrivalRadius||.3))return;
    const step=Math.min(distance,speed*.05);
    a.x+=(target.x-a.x)*step/(distance||1);a.z+=(target.z-a.z)*step/(distance||1);},
  },config);
  const flow=new FirstLevelP012Director({Guide:spec=>runtime.Guide(spec)},config);flow.beat=beat;
  flow.lastSample={position:player,guidePosition:actor};flow.StartGuide();
  const Step=(count=1,follow=true)=>{for(let i=0;i<count;i++){if(follow)Object.assign(player,actor);runtime.StepSafeGuide(runtime.guide,actor,.05);}};
  return {actor,player,flow,runtime,events,Step,Released:()=>releases};
 };
 const wounded=Make(11,activity.woundedGuideRoute[0]);
 assert.deepEqual(wounded.events,[],'stage entry is not an arrival');
 wounded.Step(500);
 const injuryGap=Math.hypot(wounded.actor.x-activity.woundedDragFrom.x,wounded.actor.z-activity.woundedDragFrom.z);
 assert.ok(injuryGap>.8&&injuryGap<2.1,'guide stands beside the casualty, not on the body/interaction');
 assert.deepEqual(wounded.events,['P012GuideAtWounded']);
 const waiting={...wounded.actor};wounded.flow.facts.add('wounded');wounded.Step(100);
 assert.deepEqual(wounded.actor,waiting,'checking alone cannot release the guide before actual dragging');
 wounded.flow.lastSample.carryKind='wounded';wounded.Step(50);
 assert.ok(Math.hypot(wounded.actor.x-waiting.x,wounded.actor.z-waiting.z)>2);
 wounded.flow.lastSample.carryKind=null;const dropped={...wounded.actor};wounded.Step(30);
 assert.deepEqual(wounded.actor,dropped,'guide waits if the casualty is set down');
 wounded.flow.lastSample.carryKind='wounded';Object.assign(wounded.player,waiting);wounded.player.z-=20;wounded.Step(20,false);
 assert.deepEqual(wounded.actor,dropped,'guide waits for lagging casualty carrier');
 wounded.Step(500);
 assert.ok(Math.hypot(wounded.actor.x-activity.woundedDragTo.x,wounded.actor.z-activity.woundedDragTo.z)<.6);
 const westWounded=Make(11,{x:-16.645382287623885,z:-100.03317381459081},.34);
 Object.assign(westWounded.player,activity.woundedDragFrom);
 westWounded.Step(600,false);
 assert.ok(westWounded.events.includes('P012GuideAtWounded'),'guide rounds the west wall to the player already ahead beside the casualty');
 westWounded.flow.lastSample.woundedDragDelivered=true;
 Object.assign(westWounded.player,{x:-6.3258401273,z:-91.889215854});
 westWounded.flow.beat=12;westWounded.flow.StartGuide();westWounded.Step(600,false);
 assert.ok(Math.hypot(westWounded.actor.x-activity.woundedDragTo.x,westWounded.actor.z-activity.woundedDragTo.z)<.6,
  'recorded west-side start reaches the delivered casualty and volunteer rendezvous without asking the player to walk back');
 const flank=Make(14,config.routes.flank[0]);flank.Step(200);const cover={...flank.actor};flank.Step(200);
 assert.deepEqual(flank.actor,cover,'guide remains at safe entry, never follows the combat flank');
 assert.ok(Math.hypot(cover.x-activity.ambushEntryRoute[0].x,cover.z-activity.ambushEntryRoute[0].z)<.6);
 assert.deepEqual(flank.events,['P012GuideAtFlankEntry']);
 assert.equal(flank.actor.stance,1,'safe low cover uses crouched posture without immunity');
 assert.equal(flank.flow.facts.size,0,'guidance does not complete combat facts');
 flank.runtime.Guide({beat:15,route:[]});assert.equal(flank.actor.stance,0,'leaving flank restores the prior posture');
 const litterGuide=Make(18,activity.airRejoinRoute.at(-1),.46);litterGuide.Step(700,false);
 const litterPost=activity.stretcherGuideRoute.at(-1);
 assert.ok(Math.hypot(litterGuide.actor.x-litterPost.x,litterGuide.actor.z-litterPost.z)<.6,
  'Luo physically reaches the authored ditch defence slot on body-clear commands');
 assert.ok(Math.hypot(litterPost.x-activity.stretcherCarryTo.x,litterPost.z-activity.stretcherCarryTo.z)>6,
  'the tactical post stays clear of the player and the original litter rear handle');
 const heldPost={...litterGuide.actor};litterGuide.flow.beat=19;litterGuide.flow.StartGuide();litterGuide.Step(100,false);
 assert.ok(Math.hypot(litterGuide.actor.x-heldPost.x,litterGuide.actor.z-heldPost.z)<.05,
  'B19 holds Luo at the reached post while the player dives');
 litterGuide.flow.beat=20;litterGuide.flow.StartGuide();
 assert.equal(litterGuide.Released(),1,'B20 releases guide ownership for the existing defence assignment');
 const smoke=Make(23,activity.southAssemblyRoute[0]);smoke.player.z+=25;const smokeStart={...smoke.actor};smoke.Step(20,false);
 assert.equal(smoke.actor.x,smokeStart.x);assert.equal(smoke.actor.z,smokeStart.z,'approach also waits for a lagging player');
 smoke.Step(1000);
 assert.ok(Math.hypot(smoke.actor.x-activity.retreatSmokeUse.x,smoke.actor.z-activity.retreatSmokeUse.z)<.6);
 assert.deepEqual(smoke.events,['P012GuideAtSmoke']);
 assert.equal(smoke.Released(),0);smoke.flow.facts.add('retreatSmokeDeployed');smoke.runtime.Update(.05);smoke.runtime.Update(.05);
 assert.equal(smoke.Released(),1);assert.deepEqual(smoke.events,['P012GuideAtSmoke','P012GuideSmokeHandoff']);
 assert.equal(P012GuideApproach([{x:0,z:0,w:2,d:20,h:3,y:1.5,ry:0}],{x:-3,z:0},{x:3,z:0}),null,'no safe known path returns failure, not a through-wall command');
 const road=Make(13,{x:-6.430167242887489,z:-91.96949797252844});
 assert.equal(road.runtime.guide.safeRoute,true,'B13 owns a collision-checked guide route');
 road.Step(20);const roadWaiting={...road.actor};road.player.z+=25;road.Step(20,false);
 assert.deepEqual(road.actor,roadWaiting,'southbound guide waits for a player who fell behind');
 road.Step(4000);
 assert.ok(Math.hypot(road.actor.x-activity.roadContactBreach.x,road.actor.z-activity.roadContactBreach.z)<.6,
  'recorded B13 stall reaches the actual breach via the complete world-space road');
 assert.equal(road.flow.facts.size,0,'walking the guide cannot invent contact or kills');
 const escort=Make(13,{x:-6.430167242887489,z:-91.96949797252844});
 const roadEnd=config.escortWaypoints.findIndex(point=>point.x===90&&point.z===10);
 const column=new EscortColumn({PlayerPos:()=>escort.player}, {waypoints:config.escortWaypoints.slice(0,roadEnd+1),members:[]});
 column.Start();let maxGap=0,waited=false;
 for(let frame=0;frame<5000&&!column.arrived;frame++){
  column.Update(.05);escort.flow.lastSample.columnPosition=column.HeadPosition();
  escort.flow.lastSample.guideRouteIndex=escort.runtime.guide.index;
  const objective=escort.flow.CurrentObjective(),target=objective.target;
  const distance=Math.hypot(target.x-escort.player.x,target.z-escort.player.z);
  if(distance>objective.arrivalRadiusM-.05){
   const step=Math.min(5*.05,distance),next={x:escort.player.x+(target.x-escort.player.x)*step/distance,
    z:escort.player.z+(target.z-escort.player.z)*step/distance};
   assert.ok(P012SegmentClear(blocks,escort.player,next,.42),'ordinary public follow input clears each corner');
   Object.assign(escort.player,next);
  }
  const before={...escort.actor};escort.Step(1,false);
  maxGap=Math.max(maxGap,Math.hypot(escort.player.x-column.HeadPosition().x,escort.player.z-column.HeadPosition().z));
  if(frame>20&&before.x===escort.actor.x&&before.z===escort.actor.z)waited=true;
 }
 assert.ok(waited,'Luo turns back and waits for the slower stretcher head');
 assert.ok(column.arrived,`following Luo keeps the actual column controller inside its resume range: ${JSON.stringify({player:escort.player,guide:escort.actor,index:escort.runtime.guide.index,column:column.HeadPosition(),objective:escort.flow.CurrentObjective()})}`);
 assert.ok(maxGap<column.tuning.columnWaitM,'two independent wait controllers cannot strand the column in the north');
 escort.flow.lastSample.guidePosition=config.escortWaypoints[7];
 escort.flow.lastSample.columnPosition=config.escortWaypoints[9];
 assert.equal(escort.flow.RoadColumnBehind(),false,'a column already ahead cannot stop the guide from catching up');
 const air=Make(15,{x:95.78584399952966,z:15.377326136763912},.34);
 assert.ok(air.runtime.guide.approach?.length,'recorded standing capsule beside the side wall has a real route to the observation wall');
 air.Step(1000);
 assert.ok(Math.hypot(air.actor.x-activity.airRegroupRoute[0].x,air.actor.z-activity.airRegroupRoute[0].z)<.6,
  'Luo reaches the actual litter inspection rendezvous before waiting');
 assert.equal(air.events.includes('P012GuideAtAirObservation'),false,'the rendezvous is not the observation wall');
 const inspection={...air.actor};air.Step(60);assert.deepEqual(air.actor,inspection,'waits for the actual inspection');
 air.flow.facts.add('roadWounded');air.Step(500);
 assert.ok(Math.hypot(air.actor.x-activity.airObservationPosition.x,air.actor.z-activity.airObservationPosition.z)<.6,
  'inspection releases all bends to the observation wall, not just its first waypoint');
 assert.ok(air.events.includes('P012GuideAtAirObservation'));
 console.log('PASS physical casualty/flank/smoke/road guides: swept clearance, actual arrival cues, waits and handoff');
}
{
 const guide={x:0,z:0},player={x:0,z:0},actors=Array.from({length:6},(_,i)=>({id:`march${i}`,x:0,z:6+i,alive:true,stance:i===5?1:0}));
 const signals=new Set(),stances=[],releases=[],defenses=[],orders=[];
 const route=[{x:0,z:20},{x:0,z:0},{x:0,z:-20},{x:0,z:-40}];
 const positions=actors.map((_,i)=>({x:4+i*2,z:-39}));
 const runtime=new FirstLevelP012Runtime({GuideActor:()=>guide,Position:a=>a,PlayerPosition:()=>player,Signalled:s=>signals.has(s),
  Signal:s=>signals.add(s),
  SetOpeningShelter:(a,duration)=>{stances.push({a,duration});a.stance=2;a.stanceUntil=runtime.time+duration;},
  SetGuideStance:(a,stance)=>{a.stance=stance;},ReleaseGuide:a=>releases.push(a),Defend:(a,p)=>defenses.push({a,p}),
  Move:(a,p,speed)=>{orders.push({a,speed});const d=Math.hypot(p.x-a.x,p.z-a.z);if(d>.3){const f=Math.min(d-.3,speed*.05*(a.stance===2?.3:a.stance===1?.6:1))/d;a.x+=(p.x-a.x)*f;a.z+=(p.z-a.z)*f;}},
 },{layout:{blocks:[]},activities:{openingMarch:true,villageRoute:route.slice(0,2),shellCoverRoute:route,openingMarchRoute:route,openingMarchDefensePositions:positions}});
 runtime.openingCast=actors.map((actor,slot)=>({actor,slot,ammoIssued:true,issueComplete:true,parking:{...actor}}));
 for(const beat of [2,3,4]){runtime.beat=beat;guide.z=beat===4?-20:0;for(let i=0;i<180;i++){runtime.time+=.05;runtime.StepMarch(.05);}}
 assert.equal(releases.length,0,'B03 village arrival does not discard the six companions');assert.equal(stances.length,0,'no low posture before actual impact');
 assert.ok(actors.every(a=>a.z<-8),'B04 continues real northward walking beyond the village');
 signals.add('P012NorthNearMissImpact');runtime.guideReactionUntil=runtime.time+2.4;const before=actors.map(a=>({x:a.x,z:a.z}));
 for(let i=0;i<47;i++){runtime.StepMarch(.05);runtime.time+=.05;}
 assert.equal(stances.length,6);assert.deepEqual(actors.map(a=>({x:a.x,z:a.z})),before,'actual impact stops all six without changing positions');
 assert.ok(actors.every(a=>a.stance===2),'actual shell reaction leaves all six prone during the commitment');
 actors[0].suppression=.8;actors[1].state='suppressed';actors[2].stanceUntil=runtime.time+1;
 actors[3].meleeCombat={};actors[4].stance=1;
 runtime.time+=.1;runtime.StepMarch(.05);
 assert.deepEqual(actors.map(a=>a.stance),[2,2,2,2,1,1],
   'new pressure, suppression state, extended posture and another pose owner prevent forced standing; original crouch is restored');
 assert.equal(runtime.openingCast[4].shellStanceRestoredAt,undefined,'external crouch is not overwritten or recorded as our pose restoration');
 actors[0].suppression=0;actors[1].state='advance';actors[2].stanceUntil=-99;actors[3].meleeCombat=null;
 runtime.time+=.1;runtime.StepMarch(.05);
 assert.deepEqual(actors.map(a=>a.stance),[0,0,0,0,1,1],'safe march restores each earlier stance rather than retaining prone speed');
 assert.ok(runtime.openingCast.every(entry=>entry.shellStanceRestored));
 assert.equal(P012CanResumeMarch({...actors[0],alive:false},runtime.time),false);
 assert.equal(P012CanResumeMarch({...actors[0],suppression:.321},runtime.time),false);
 signals.add('P012NorthDitchEntered');guide.z=-40;
 player.z=0;for(let i=0;i<400;i++){runtime.time+=.05;runtime.StepMarch(.05);}
 assert.equal(signals.has('P012NorthSquadRegrouped'),false,'the squad cannot report to an absent player through a wall');
 player.z=-35;
 for(let i=0;i<400&&!signals.has('P012NorthSquadRegrouped');i++){runtime.time+=.05;runtime.StepMarch(.05);}
 assert.ok(signals.has('P012NorthSquadRegrouped'),'all six physically finish reaction and close on Luo before the count begins');
 assert.ok(runtime.openingCast.every(entry=>entry.shellReacted&&runtime.time>=entry.shellReactionUntil));
 runtime.openingCast[0].shellStanceRestored=false;actors[0].stance=2;
 runtime.time+=.1;runtime.beat=5;
 runtime.StepMarch(.05);assert.equal(actors[0].stance,2,'frontline entry does not force a delayed opening recovery');
 for(let i=0;i<600;i++){runtime.time+=.05;runtime.StepMarch(.05);}
 assert.equal(releases.length,6);assert.equal(defenses.length,6);assert.ok(runtime.openingCast.every(e=>e.marchComplete&&e.stage==='frontline'));
 for(const [i,a] of actors.entries())assert.ok(Math.hypot(a.x-positions[i].x,a.z-positions[i].z)<.45,'defense handover follows actual individual arrival');
 console.log('PASS six companions retain B03-B05 march and react only after actual shell impact');
}
{
 const route=P012Phase.whitebox.activities.ammoRoute,actor={...route.at(-2)},orders=[];
 const runtime=new FirstLevelP012Runtime({GuideActor:()=>actor,Position:a=>a,Signalled:()=>false,
  Move:(a,point,speed)=>orders.push({point,speed})},{activities:{},layout:{blocks:[]}});
 runtime.Guide({beat:5,route,startIndex:route.length-2,speed:3.05});runtime.Update(.05);
 assert.equal(runtime.guide.index,route.length-1);
 assert.ok(!runtime.guide.clearGunport,'advancing past the penultimate point must not clear the gunport early');
 assert.deepEqual(orders.at(-1).point,route.at(-1),'leader must physically reach the actual gunport before stepping aside');
 Object.assign(actor,route.at(-1));runtime.Update(.05);
 assert.equal(runtime.guide.clearGunport,true);
 assert.deepEqual(orders.at(-1).point,{x:route.at(-1).x-5,z:route.at(-1).z+2});
 console.log('PASS B05 waypoint advance cannot skip physical frontline arrival');
}
assert.ok(openingStoryBeats.every(cue=>cue.p012SubtitleOnly===true&&cue.voice.startsWith("p012_text_")),"all new opening cues are subtitle-only");
assert.ok(openingStoryBeats.every(cue=>!/hubSupply/i.test(JSON.stringify(cue))),"removed hub supply is not reintroduced by opening dialogue");
{
 assert.equal(openingActivities.traffic.filter(e=>e.role==="civilian"&&!e.child).length,11);
 assert.equal(openingActivities.traffic.filter(e=>e.child).length,2);
 const openingUnarmed=openingActivities.traffic.filter(e=>e.side===1).length;
 assert.equal(openingUnarmed+2,17,"13 civilians, two walking wounded and two rescuers; explicit added children, not hidden budget");
 assert.equal(openingUnarmed+2-11+8,14,"eleven physical family retirements free room for eight escort actors");
 assert.equal(openingActivities.traffic.filter(e=>e.role==="walking").length,2);
 assert.equal(openingActivities.traffic.filter(e=>e.retireWhenHidden).length,11);
 assert.equal(openingActivities.traffic.filter(e=>e.side===0).length,3);
 assert.equal(new Set(openingActivities.traffic.map(e=>JSON.stringify(e.route[0]))).size,18);
 const actor={x:0,z:0},orders=[];let player={x:0,z:2};
 const runtime=new FirstLevelP012Runtime({GuideActor:()=>actor,Position:a=>a,PlayerPosition:()=>player,
   Signalled:()=>false,Move:(a,p,speed)=>orders.push(speed)}, {activities:openingActivities});
 runtime.Guide({beat:2,route:[{x:0,z:20}],speed:.685});runtime.Update(.1);
 assert.equal(orders.at(-1),3.05);player={x:0,z:6};runtime.Update(.1);assert.equal(orders.at(-1),5.246);
 player={x:0,z:-11};runtime.Update(.1);assert.equal(orders.at(-1),0);
 runtime.guide.WaitAt=()=>true;actor.z=20;player={x:0,z:26};runtime.Update(.1);assert.equal(orders.at(-1),0);
 const reactionOrders=[];
 const reaction=new FirstLevelP012Runtime({GuideActor:()=>actor,Position:a=>a,Signalled:()=>false,
   Move:(a,p,speed)=>reactionOrders.push({point:{...p},speed})},{activities:{}});
 reaction.Guide({beat:4,route:[{x:0,z:20},{x:0,z:30}],startIndex:0,speed:1.5});
 reaction.guideReactionUntil=reaction.time+2.4;
 for(let i=0;i<23;i++){
   reaction.Update(.1);assert.equal(reaction.guide.index,0,"blast reaction cannot consume the nearby waypoint");
   assert.equal(reactionOrders.at(-1).speed,0);assert.deepEqual(reactionOrders.at(-1).point,actor);
 }
 reaction.Update(.11);assert.equal(reaction.guide.index,1);assert.equal(reactionOrders.at(-1).speed,1.5);
 assert.deepEqual(reactionOrders.at(-1).point,{x:0,z:30},"after reaction the same route resumes");
 let visible=true,retired=0;const pedestrian={x:0,z:0};
 const retiring=new FirstLevelP012Runtime({GuideActor:()=>null,Position:a=>a,Signalled:()=>false,
   Move:()=>{},TrafficVisible:()=>visible,RetireTraffic:()=>{retired++;return true;}},{activities:{}});
 retiring.traffic=[{actor:pedestrian,path:[pedestrian],parking:pedestrian,index:0,side:1,slot:0,arrived:true,retireWhenHidden:true}];
 retiring.Update(.1);assert.equal(retired,0,"visible arrivals never pop out");
 visible=false;retiring.Update(.1);retiring.Update(.1);assert.equal(retired,1,"hidden physical arrival retires exactly once");
 for(const entry of openingActivities.traffic)for(let i=1;i<entry.route.length;i++)for(let j=0;j<=200;j++){
   const t=j/200,a=entry.route[i-1],b=entry.route[i],px=a.x+(b.x-a.x)*t,pz=a.z+(b.z-a.z)*t;
   for(const block of openingLayout.blocks){
     const foot=FootY(openingLayout,{x:px,z:pz});
     if(block.solid===false||block.y-block.h/2>foot+1.8||block.y+block.h/2<foot+.1)continue;
     const dx=px-block.x,dz=pz-block.z,c=Math.cos(block.ry),s=Math.sin(block.ry);
     const gap=Math.hypot(Math.max(0,Math.abs(dx*c-dz*s)-block.w/2),Math.max(0,Math.abs(dx*s+dz*c)-block.d/2));
   assert.ok(gap>=.6,`opening crowd ${entry.role}/${entry.slot} intersects ${block.id} at ${px},${pz}, gap ${gap}`);
   }
 }
}
{
 const config=P012Phase.whitebox,a=config.activities,actor={...config.anchors.trainDoor,yaw:0},orders=[],faces=[],points=new Map();
 const runtime=new FirstLevelP012Runtime({GuideActor:()=>actor,Position:value=>value,Signalled:()=>false,
  Move:(who,point,speed)=>orders.push({point:{...point},speed}),GuideYaw:who=>who.yaw,
  FaceGuide:(who,yaw)=>{const delta=Math.atan2(Math.sin(yaw-who.yaw),Math.cos(yaw-who.yaw));assert.ok(Math.abs(delta)<=.34000001,"wait facing turns smoothly at 3.4 radians per second");who.yaw=yaw;faces.push(yaw);}},config);
 const director=new FirstLevelP012Director({Guide:spec=>runtime.Guide(spec),Register:spec=>points.set(spec.id,spec),Signalled:name=>name==="P012TrainDoor"},config);
 director.lastSample={position:config.anchors.trainSpawn};director.StartGuide();runtime.guide.index=2;
 for(let i=0;i<120;i++)runtime.Update(.1);
 assert.equal(runtime.guide.index,2,"door guide waits for the player, not a timer");
 assert.equal(orders.at(-1).speed,0);
 const doorFacing=Math.atan2(-(config.anchors.trainSpawn.x-actor.x),-(config.anchors.trainSpawn.z-actor.z));
 assert.ok(Math.abs(faces.at(-1)-doorFacing)<1e-9,"door guide eventually faces back towards the player");
 director.lastSample.position=config.anchors.trainDoor;runtime.Update(.1);
 assert.equal(runtime.guide.index,3,"approaching the real door releases the guide");
 director.beat=1;director.StartGuide();
 for(let index=0;index<a.weaponGuideRoute.length;index++){
  Object.assign(actor,a.weaponGuideRoute[index]);
  for(let i=0;i<120;i++)runtime.Update(.1);
  assert.equal(runtime.guide.index,index,"B01 does not leave an unfinished physical operation");
  assert.equal(orders.at(-1).speed,0);
  const facing=a.weaponGuideFacing[index],wanted=Math.atan2(-(facing.x-actor.x),-(facing.z-actor.z));
  assert.ok(Math.abs(Math.atan2(Math.sin(faces.at(-1)-wanted),Math.cos(faces.at(-1)-wanted)))<1e-9,"waiting guide faces the real table");
  if(index<a.weaponGuideRoute.length-1){points.get(index===0?"p012_weaponCheck":"p012_ammoIssue").OnComplete();runtime.Update(.1);assert.equal(runtime.guide.index,index+1);}
 }
 const interaction=new InteractSystem({});
 for(const [id,stand,boxId] of [["p012_weaponCheck",a.weaponReceivePosition,"WeaponCheckTable"],["p012_ammoIssue",a.weaponIssuePosition,"WeaponIssueCrate"]]){
  interaction.Register(points.get(id));const point=interaction.points.get(id),box=openingLayout.blocks.find(b=>b.id===boxId);
  assert.equal(point.position.x,box.x);assert.ok(Math.abs(point.position.z-(box.z+box.d/2))<1e-9,"F anchor is on the box front surface");
  assert.notEqual(interaction.Reach(point,{position:stand,yaw:0}),null,"looking at the actual box from its front gives a reachable F interaction");
  assert.equal(interaction.Reach(point,{position:{x:stand.x,z:stand.z+4},yaw:0}),null,"no remote interaction extension");
 }
 const route=[P012StationPoint(-55,44),...a.weaponGuideRoute],stands=[a.weaponReceivePosition,a.weaponIssuePosition,a.weaponInspectPosition];
 function Hits(point,box){
  const foot=FootY(openingLayout,point);
  if(box.solid===false||box.y-box.h/2>foot+1.8||box.y+box.h/2<=foot+.05)return false;
  const dx=point.x-box.x,dz=point.z-box.z,c=Math.cos(box.ry),s=Math.sin(box.ry);
  return Math.hypot(Math.max(0,Math.abs(dx*c-dz*s)-box.w/2),Math.max(0,Math.abs(dx*s+dz*c)-box.d/2))<.42;
 }
 for(const point of stands)assert.ok(!openingLayout.blocks.some(box=>Hits(point,box)),"player work position is outside solid furniture");
 for(let leg=1;leg<route.length;leg++)for(let i=0;i<=100;i++){
  const point={x:route[leg-1].x+(route[leg].x-route[leg-1].x)*i/100,z:route[leg-1].z+(route[leg].z-route[leg-1].z)*i/100};
  const collision=openingLayout.blocks.find(box=>Hits(point,box));
  assert.ok(!collision,`guide physically walks between tables without entering a collider: ${JSON.stringify({point,block:collision?.id})}`);
 }
 console.log("PASS opening door/operation-driven guide waits, facing requests, real furniture reach and capsule paths");
 for(const parking of a.openingCastParking){
  const path=[parking,...a.openingCastRoute];
  for(let leg=1;leg<path.length;leg++)for(let i=0;i<=100;i++){
   const point={x:path[leg-1].x+(path[leg].x-path[leg-1].x)*i/100,z:path[leg-1].z+(path[leg].z-path[leg-1].z)*i/100};
   assert.ok(!openingLayout.blocks.some(box=>Hits(point,box)),"opening formation parking and follow route clear real furniture");
  }
 }
}
{
 const {Vector3}=await import(`data:text/javascript;base64,${Buffer.from(readFileSync(new URL("./vendor/three/build/three.core.js",import.meta.url),"utf8")).toString("base64")}`);
 const source=readFileSync(new URL("./Script_Player.mjs",import.meta.url),"utf8");
 const movement=source.slice(source.indexOf("    let speed = target.speed;"),source.indexOf("    this.MoveWithCollision(dt);")+"    this.MoveWithCollision(dt);".length);
 const Step=vm.runInNewContext(`(function(dt,input,target){${movement}})`,{UP:new Vector3(0,1,0),GRAVITY_MPS2:19.6,Clamp:(n,a,b)=>Math.max(a,Math.min(b,n)),Clamp01:n=>Math.max(0,Math.min(1,n))});
 function Travel(diveSpeedMps,forward,wall=false){
  const p={stance:"prone",health:20.267,suppression:1,ads:1,sprint:0,carrySpeedScale:1,debug:{},yaw:0,grounded:true,velocity:new Vector3(),position:new Vector3(),_forward:new Vector3(),_right:new Vector3(),_tmp:new Vector3(),LegPenalty:()=>.72*.72,MoveWithCollision(dt){if(!wall)this.position.addScaledVector(this.velocity,dt);this.position.y=0;this.velocity.y=0;}};
  for(let i=0;i<132;i++)Step.call(p,1/60,{forward,diveSpeedMps},{speed:.72});
  return Math.hypot(p.position.x,p.position.z);
 }
 assert.ok(Travel(undefined,1)<.8,"low health, injured suppressed crawl cannot clear original distance gate");
 assert.ok(Travel(1.2,1)>.8,"production movement integration permits real low-health dive inside 2.2s");
 assert.equal(Travel(1.2,0),0,"no directional input never moves");
 assert.equal(Travel(1.2,1,true),0,"collision remains authoritative, blocked dive cannot succeed");
 const r=new FirstLevelP012Runtime({},{});r.beat=19;
 assert.equal(r.DiveSpeed({player:{open:true}}),undefined,"no intent no impulse");
 r.RecordDodgeIntent({x:0,z:0});assert.equal(r.DiveSpeed({player:{open:true}}),1.2);
 assert.equal(r.DiveSpeed({player:{open:false}}),undefined,"closed window immediately removes impulse");
 r.beat=18;assert.equal(r.DiveSpeed({player:{open:true}}),undefined,"other phases retain normal speed");
}
const guide = { x: 0, z: 0 }, actors = [], moves = [], impacts = [], signals = new Set();
{
 const column=new EscortColumn({}, {followRouteBodies:true,members:[]});
 assert.deepEqual(column._Slot(8,{role:"civilian",routeSlot:{back:.95,lateral:.8}}),{back:.95,lateral:.8});
 assert.deepEqual(column._Slot(8,{role:"civilian"}),{back:17.6,lateral:-.35},"existing formations retain original slots unless explicitly configured");
}
{
 const living={x:0,z:0,alive:true,lastFire:0},dead={x:0,z:0,alive:false},untouched={alive:true},orders=[],events=[];
 let visible=false;
 const r=new FirstLevelP012Runtime({Alive:a=>a.alive,Position:a=>a,CombatTime:()=>10,PursuitGoal:(a,p)=>orders.push({a,p}),Firing:()=>true,ThreatensEscort:()=>visible,Visible:()=>false,Signal:n=>events.push(n)},
 {activities:{retreatPursuitRoutes:[[{x:0,z:0},{x:1,z:0},{x:2,z:0}],[{x:0,z:0},{x:1,z:0}]]}});
 r.far=[living,dead,untouched,untouched];r.beat=23;r.StepRetreatPursuit();assert.equal(orders.length,0,"no real smoke no pursuit");
 r.smoke={};r.StepRetreatPursuit();assert.equal(orders.length,1);assert.equal(r.pursuit[0].index,1);assert.equal(r.pursuit[1].index,0,"dead actor never moves or respawns");
 r.StepRetreatPursuit();assert.equal(r.pursuit[0].index,1,"cannot skip an unreached corner");
 living.x=1;living.lastFire=11;r.StepRetreatPursuit();assert.equal(events.length,0,"unseen fire does not claim visible right threat");
 visible=true;r.StepRetreatPursuit();r.StepRetreatPursuit();assert.deepEqual(events,["P012RetreatRightThreat"]);
 assert.ok(orders.every(order=>order.a===living));assert.equal(r.far.length,4,"same finite budget");
 living.x=2;r.StepRetreatPursuit();assert.equal(r.pursuit[0].index,2,"finite endpoint does not pursue beyond route");
}
{
 let restored=null;const load={serial:17,x:44,z:60};
 const opening=new FirstLevelP012Runtime({RestorePlayer:p=>{restored=p;return true;}},{anchors:{trainSpawn:{x:-66,z:65}}});
 opening.failed=true;assert.equal(opening.RetryPlayer(),true);assert.equal(restored.id,"Start");assert.deepEqual([restored.x,restored.z],[-66,65]);
 const r=new FirstLevelP012Runtime({RestorePlayer:p=>{restored=p;return true;}},{});
 r.SaveSafePoint("CP03",{x:99,z:99});assert.equal(r.RetryPlayer(),false);
 r.failed=true;assert.equal(r.RetryPlayer(),true);assert.deepEqual([restored.x,restored.z],[90,10]);
 r.SaveSafePoint("CP05",{x:99,z:99});assert.equal(r.safePoint.stance,"prone");
 r.failed=true;r.retryAtLoad={x:load.x,z:load.z,stance:"prone"};const before=JSON.stringify(load);
 r.RetryPlayer();assert.deepEqual([restored.x,restored.z],[44,60]);assert.equal(JSON.stringify(load),before,"retry does not move or duplicate the active payload");
 assert.equal(r.completed,undefined,"failure retry is not completion");
}
{
 let visible=true;const events=new Set();
 const r=new FirstLevelP012Runtime({Signalled:n=>events.has(n),Signal:n=>events.add(n),VisibleAircraft:()=>visible},{});
 const eye={x:0,y:1,z:0},aim={x:0,y:0,z:-1},view={active:true,aircraft:{x:0,y:1,z:-100}};
 r.beat=15;assert.equal(r.RecordAircraftShot(eye,aim,view),false);
 r.beat=16;assert.equal(r.RecordAircraftShot(eye,{x:1,y:0,z:0},view),false);
 visible=false;assert.equal(r.RecordAircraftShot(eye,aim,view),false,"occluded airplane cannot trigger reaction");
 visible=true;assert.equal(r.RecordAircraftShot(eye,aim,null),false);
 assert.equal(r.RecordAircraftShot(eye,aim,view),true);assert.ok(events.has("P012AircraftPlayerFire"));
 assert.equal(r.RecordAircraftShot(eye,aim,view),false,"one reaction per actual aircraft encounter");
}
{
 const guard={x:45,z:24,alive:true};const orders=[];let released=false;
 const r=new FirstLevelP012Runtime({GuideActor:()=>null,Position:a=>a,Signalled:()=>false,FriendlyActors:()=>[guard],Defend:(actor,point,doctrine)=>orders.push({point:{...point},doctrine}),ReleaseDefense:()=>released=true},{activities:{frontlineDoctrine:{accuracyScale:.22,fireIntervalScale:2.5}}});
 r.Guide({beat:14,route:[]});r.Update(.1);
 assert.deepEqual(orders[0].point,guard,"ambush guards hold their real escort positions, not a room assault goal");
 assert.deepEqual(orders[0].doctrine,{accuracyScale:.22,fireIntervalScale:2.5,holdRadiusM:2},"escort uses the same configured covering-fire discipline as frontline");
 r.Update(.1);assert.equal(orders.length,1,"defense anchor must not drift as actor moves");
 r.Guide({beat:15,route:[]});r.Update(.1);assert.ok(released,"cleared ambush releases escort guard to continue route");
 for(const beat of [20,21]){r.Guide({beat,route:[]});r.Update(.1);assert.equal(r.defenders.length,1);}
 let point={x:0,z:1};const discipline=[];
 r.config.returnWaypoints=[{x:0,z:0},{x:0,z:100}];r.host.RetreatPosition=()=>point;r.host.FireDiscipline=(actor,d)=>discipline.push(d);
 r.Guide({beat:23,route:[]});r.Update(.1);assert.equal(r.defenders,null,"retreat does not retain stationary defense");assert.equal(discipline.at(-1).accuracyScale,.22);
 point={x:0,z:51};r.Update(.1);assert.equal(discipline.at(-1),null,"actual route midpoint releases covering-fire limits");
}
{
 const guide={id:"guide"},bearer={id:"bearer"},rifle={id:"rifle"},orders=[];
 const activities={southDefenseSlots:[{x:96,z:58}],frontlineDoctrine:{accuracyScale:.22}};
 const runtime=new FirstLevelP012Runtime({GuideActor:()=>guide,Position:a=>a,FriendlyActors:()=>[bearer,rifle],IsStretcherBearer:a=>a===bearer,
  Defend:(actor,point)=>orders.push({actor,point}),Signalled:()=>false},{activities});
 runtime.Guide({beat:20,route:[]});runtime.Update(.1);
 assert.deepEqual(orders,[{actor:rifle,point:activities.southDefenseSlots[0]}],"B20 walks armed escorts to authored ground slots and never requisitions stretcher bearers");
}
{
 const actor={x:0,z:0,alive:true,health:1,order:"advance"};let released=0;
 const r=new FirstLevelP012Runtime({GuideActor:()=>actor,Position:a=>a,Alive:a=>a.alive,Move(){},Signalled:()=>false,ReleaseDefense:()=>released++},{});
 r.defenders=[actor];r.Guide({beat:11,startIndex:0,route:[{x:0,z:0},{x:0,z:8},{x:8,z:8}],speed:1});r.Update(.1);
 assert.equal(released,1,"casualty retrieval releases frontline defense");
 const index=r.guide.index;r.Guide({beat:12,route:[{x:8,z:8}],WaitAt:()=>true});
 assert.equal(r.guide.route.length,3);assert.equal(r.guide.index,index,"B12 retains unfinished physical safe route");
 assert.equal(r.guide.WaitAt(1),false);assert.equal(r.guide.WaitAt(2),true);
 assert.equal(r.Sample().guideAlive,true);assert.equal(r.Sample().guideHealth,1);
 actor.alive=false;assert.equal(r.Sample().guideAlive,false);
}
const runtime = new FirstLevelP012Runtime({
  GuideActor: () => guide, Position: (actor) => actor, Alive: (actor) => actor.alive,
  Firing: (actor) => actor.firing, Signalled: (name) => signals.has(name),
  Visible: (actor) => !!actor.visible,
  Move: (actor, point, speed) => moves.push({ point, speed }),
  TrafficActor: (side, slot, point) => ({ ...point, alive: true, side, slot }),
  SpawnEnemy: (spec) => { const actor = { ...spec, alive: true }; actors.push(actor); return actor; },
  WarnShell: (point) => ({ ...point }), ImpactShell: (point) => impacts.push(point),
}, {});
runtime.Guide({ route: [{ x: 0, z: 0 }, { x: 0, z: 8 }], speed: 0.9 });
runtime.Update(0.1); assert.equal(moves[0].speed, 0.9); assert.equal(actors.length, 0);
const near = runtime.SpawnEnemy({ p012Near: true }); near.alive = false;
assert.equal(runtime.Sample().nearEnemyDeaths, 1);
signals.add("P012SouthVerified"); for (let i = 0; i < 20; i++) runtime.Update(0.1);
assert.equal(runtime.far.length, 4); runtime.far[0].alive = false;
assert.equal(runtime.Sample().blockadeVisible, false, "alive outside LOS is not seen");
runtime.far[1].visible = true; assert.equal(runtime.Sample().blockadeVisible, true);
for (let i = 0; i < 20; i++) runtime.Update(0.1);
assert.equal(runtime.far.length, 4); assert.equal(runtime.Sample().nearEnemyDeaths, 1);
runtime.Shelling({ x: 3, z: 4 }); runtime.Update(1.5); assert.equal(impacts.length, 0);
runtime.Update(0.11); assert.equal(impacts.length, 1); assert.equal(runtime.Sample().mortarImpactCount, 1);
runtime.Update(10); assert.equal(impacts.length, 1);
runtime.Guide({ beat: 2, route: [{ x: 0, z: 0 }, { x: 0, z: 8 }, { x: 0, z: 16 }], speed: 1 });
assert.equal(runtime.traffic.length, 6); runtime.Update(0.1);
assert.equal(runtime.Sample().trafficReady, true);
assert.equal(runtime.traffic.filter((walker) => walker.side === 0).length, 3);
assert.equal(new Set(runtime.traffic.map(w=>`${w.parking.x},${w.parking.z}`)).size,6,"every walker has a separate terminal parking slot");
runtime.Guide({ beat: 2, route: [{ x: 0, z: 0 }], speed: 1 });
assert.equal(runtime.traffic.length, 6, "repeated Guide does not duplicate traffic");
{
 const walkers=[];
 const trafficRun=new FirstLevelP012Runtime({GuideActor:()=>null,Position:actor=>actor,Signalled:()=>false,
  TrafficActor:(side,slot,p)=>{const actor={...p,side,slot};walkers.push(actor);return actor;},
  ReleaseGuide:actor=>{if(actor)actor.released=true;},
  Move:(actor,p,speed)=>{const d=Math.hypot(p.x-actor.x,p.z-actor.z);if(d<=1.2)return;const k=Math.min(1,speed*0.1/d);actor.x+=(p.x-actor.x)*k;actor.z+=(p.z-actor.z)*k;}
 },{});
 trafficRun.Guide({beat:2,route:[{x:0,z:0},{x:0,z:15},{x:12,z:25}],speed:1});
 for(let frame=0;frame<1000;frame++){
  trafficRun.Update(0.1);
  for(let i=0;i<walkers.length;i++)for(let j=i+1;j<walkers.length;j++)assert.ok(Math.hypot(walkers[i].x-walkers[j].x,walkers[i].z-walkers[j].z)>1.2,"traffic bodies must never collapse onto one goal");
 }
 assert.ok(trafficRun.traffic.every(w=>w.arrived),"six walkers reach six separate parking places");
 trafficRun.Guide({beat:3,route:[],speed:1});trafficRun.Update(.1);
 assert.ok(trafficRun.traffic.filter(w=>w.side===0).every(w=>!w.retired),"northbound subjects remain present throughout binocular observation");
 trafficRun.Guide({beat:4,route:[],speed:1});trafficRun.Update(.1);
 assert.ok(trafficRun.traffic.filter(w=>w.side===0).every(w=>!w.retired&&!w.actor.released),"without a configured safe northern connection soldiers hold, never return to stale squad orders");
 assert.ok(trafficRun.traffic.filter(w=>w.side===1).every(w=>!w.retired&&w.actor.scriptedNoncombatant),"southbound civilians remain noncombatants");
}
const ai = readFileSync(new URL("./Script_Ai.mjs", import.meta.url), "utf8");
{
 // Execute the production Ai.Act defence override, not a reimplementation of
 // its condition. DOM, perception and Rapier are outside this pure regression.
 const start=ai.indexOf('    // Scripted defence can fire in place');
 const end=ai.indexOf('    // 移动：',start);
 assert.ok(start>=0&&end>start);
 const Override=vm.runInNewContext(`(function(s,desired,speed){${ai.slice(start,end)};return {desired,speed};})`);
 const guide={x:79.42825739632826,z:4.633856495656801,alive:true,scriptDefensive:true};guide.position=guide;
 const ally={x:74,z:6,alive:true};ally.position=ally;
 const released=[],signals=new Set(),orders=[];
 const context={tmpD:{set:(x,y,z)=>({x,y,z})}};
 const blocked=Override.call(context,guide,{x:102.5,z:24},3.05);
 assert.equal(blocked.desired,null,'actual AI override reproduces guide freeze when defence remains set');
 const runtime=new FirstLevelP012Runtime({GuideActor:()=>guide,Position:a=>({x:a.x,z:a.z}),FriendlyActors:()=>[guide,ally],
  PlayerPosition:()=>({x:guide.x,z:guide.z}),Signalled:s=>signals.has(s),Signal:s=>signals.add(s),
  Defend:(actor,point)=>{actor.scriptDefensive=true;actor.holdZone={...point};},
  ReleaseDefense:actor=>{released.push(actor);actor.scriptDefensive=false;actor.holdZone=null;},
  ReleaseGuide:actor=>{actor.p012Guided=false;},
  Move:(actor,point,speed)=>{actor.p012Guided=true;actor.holdZone=null;
   const resolved=Override.call(context,actor,point,speed);orders.push(resolved);
   if(!resolved.desired||resolved.speed<=0)return;
   const distance=Math.hypot(point.x-actor.x,point.z-actor.z),step=Math.min(distance,resolved.speed*.05);
   assert.ok(P012SegmentClear(P012Phase.whitebox.layout.blocks,actor,point,.42));
   actor.x+=(point.x-actor.x)*step/(distance||1);actor.z+=(point.z-actor.z)*step/(distance||1);},
 },{...P012Phase.whitebox,activities:{frontlineDoctrine:{}}});
 const director=new FirstLevelP012Director({Guide:spec=>runtime.Guide(spec)},P012Phase.whitebox);
 director.beat=14;director.StartGuide();
 for(let i=0;i<300;i++)runtime.Update(.05);
 assert.deepEqual(released,[guide],'only the controlled guide relinquishes old defence');
 assert.equal(ally.scriptDefensive,true,'other friendly actors keep their combat defence');
 assert.ok(!runtime.defenders.includes(guide)&&runtime.defenders.includes(ally));
 assert.ok(signals.has('P012GuideAtFlankEntry'),'actual AI defence override no longer prevents arrival');
 assert.ok(Math.hypot(guide.x-102.5,guide.z-24)<.6);
 runtime.Guide({beat:15,route:[]});runtime.Update(.05);
 assert.equal(guide.p012Guided,false,'next stage returns guide movement to the normal host');
 runtime.Guide({beat:20,route:[]});runtime.Update(.05);
 assert.equal(guide.scriptDefensive,true,'later ordinary defensive stage can recruit the guide again');
  console.log('PASS guide-only defence handoff against production Ai.Act movement override');
}
{
 // Reproduce the B13 combat-cover diversion with the actual state switch and
 // movement arbitration. Ordinary combat and defensive actors keep ownership.
 const start=ai.indexOf('    switch (s.state) {',ai.indexOf('  Act(s, dt, player) {'));
 const end=ai.indexOf('    if (desired && speed > 0) {',start);
 assert.ok(start>=0&&end>start);
 const Resolve=vm.runInNewContext(`(function(s,dt){let desired=null,speed=0;const strayed=false,player={};
  const STATE={SUPPRESSED:'suppressed',RELOAD:'reload',FIRE:'fire',CHARGE:'charge',ADVANCE:'advance',IDLE:'idle'};
  ${ai.slice(start,end)};return {desired:desired?{x:desired.x,z:desired.z}:null,speed};})`);
 const context={time:0,shots:0,tmpD:{set(x,y,z){Object.assign(this,{x,y,z});return this;},copy(p){return this.set(p.x,p.y||0,p.z);}},
  TryFire(){this.shots++;},TryBayonet(){}};
 const actor={position:{x:90,z:10},goal:{x:92,z:12},cover:{x:91.78160882438247,z:19.055415581231244},
  state:'fire',order:'advance',p012Guided:false,scriptMoveSpeedMps:3.05,detourTime:2,stuckTime:1};
 const ordinary=Resolve.call(context,actor,.1);
 assert.equal(ordinary.desired.z,actor.cover.z,'ordinary FIRE actor still seeks its cover');
 actor.p012Guided=true;
 const guided=Resolve.call(context,actor,.1);
 assert.equal(guided.desired.x,actor.goal.x);assert.equal(guided.desired.z,actor.goal.z);
 assert.equal(guided.speed,3.05);assert.equal(actor.detourTime,0);assert.equal(actor.stuckTime,0);
 assert.equal(context.shots,2,'guided FIRE still executes the same shooting update');
 actor.scriptMoveSpeedMps=0;
 assert.equal(Resolve.call(context,actor,.1).speed,0,'leader queue wait still stops movement');
 actor.scriptMoveSpeedMps=3.05;actor.state='reload';actor.reloadTimer=2;actor.weapon={magazine:5};
 const reload=Resolve.call(context,actor,.1);
 assert.equal(reload.desired.z,actor.goal.z);assert.equal(reload.speed,3.05);assert.equal(actor.reloadTimer,1.9);
 actor.scriptDefensive=true;actor.holdZone={...actor.position};
 assert.equal(Resolve.call(context,actor,.1).desired,null,'defensive actor still holds its anchor');
 console.log('PASS production combat state preserves P012 guide route, firing, reload and waits');
}
{
 const issue=P012Phase.whitebox.activities.openingIssue,actors=issue.spawns.map(p=>({...p})),receipts=[];
 // Legacy six-person adapter fixture, not the current player entry. The new
 // 40-person TrainColumnTest owns the complete production recruitment layout.
 // Keep the old fallback's real movement/issue receipts against its own geometry.
 const legacyBlocks=openingLayout.blocks.filter(block=>!block.id?.startsWith("StationRecruit"));
 const runtime=new FirstLevelP012Runtime({GuideActor:()=>null,FriendlyActors:()=>actors,Position:a=>a,
  InitializeOpeningActor:(a,p)=>Object.assign(a,p),SetOpeningEquipment:(a,kind)=>receipts.push({slot:actors.indexOf(a),kind}),
  PlayerPosition:()=>P012Phase.whitebox.anchors.trainSpawn,
  Move:(a,p,speed)=>{const d=Math.hypot(p.x-a.x,p.z-a.z);if(d<=.3)return;
   const step=Math.min(speed*.025,d);a.x+=(p.x-a.x)/d*step;a.z+=(p.z-a.z)/d*step;}
 },{...P012Phase.whitebox,activities:{...P012Phase.whitebox.activities,trainColumn:null}});
 runtime.beat=0;
 for(let frame=0;frame<14400&&!runtime.openingCast?.every(e=>e.issueComplete);frame++){
  runtime.StepOpeningCast(.025);
  for(const actor of actors){
   const foot=FootY(openingLayout,actor);
   for(const b of legacyBlocks){
    if(b.solid===false||b.y+b.h/2<=foot+.05||b.y-b.h/2>=foot+1.8)continue;
    const dx=actor.x-b.x,dz=actor.z-b.z,c=Math.cos(b.ry||0),s=Math.sin(b.ry||0);
    assert.ok(Math.hypot(Math.max(0,Math.abs(dx*c-dz*s)-b.w/2),Math.max(0,Math.abs(dx*s+dz*c)-b.d/2))>=.42,`actual issue body ${actors.indexOf(actor)} hits ${b.id} at ${actor.x},${actor.z}`);
   }
  }
  for(let a=0;a<6;a++)for(let b=a+1;b<6;b++)assert.ok(Math.hypot(actors[a].x-actors[b].x,actors[a].z-actors[b].z)>=1.5-1e-6,"production six-man queue body spacing");
 }
 assert.ok(runtime.openingCast.every(e=>e.issueComplete),`production issue queue must finish: ${JSON.stringify(runtime.openingCast.map(e=>({stage:e.stage,index:e.issueIndex,at:e.actor})))}`);
 assert.equal(receipts.length,18,"six existing actors each receive empty/weapon/ammo once");
}
{
 const actors=Array.from({length:6},(_,i)=>({x:0,z:-i*1.8})),equipment=[],moves=[];
 const spawns=actors.map(a=>({...a})),parking=actors.map((_,i)=>({x:12+i*1.8,z:14}));
 const issue={spawns,exitRoute:[{x:0,z:-12},{x:0,z:2},{x:4,z:2},{x:4,z:8}],
  weaponPoint:{x:4,z:10},ammoPoint:{x:4,z:14},musterPoints:parking,weaponSeconds:1,ammoSeconds:.8};
 const runtime=new FirstLevelP012Runtime({GuideActor:()=>null,FriendlyActors:()=>actors,Position:a=>a,
  InitializeOpeningActor:(a,p)=>Object.assign(a,p),SetOpeningEquipment:(a,kind)=>equipment.push({a,kind,at:{...a}}),
  PlayerPosition:()=>({x:35,z:14}),ReleaseGuide:a=>{a.released=true;},
  Move:(a,p,speed)=>{const d=Math.hypot(p.x-a.x,p.z-a.z);moves.push(d);if(d<=.3)return;
   const step=Math.min(speed*.05,d);a.x+=(p.x-a.x)/d*step;a.z+=(p.z-a.z)/d*step;}
 },{activities:{openingIssue:issue,openingCastParking:parking,openingCastRoute:[{x:25,z:14},{x:35,z:14}]}});
 runtime.beat=3;
 for(let i=0;i<4000&&!runtime.openingCast?.every(e=>e.issueComplete);i++){
  runtime.StepOpeningCast(.05);
  for(let a=0;a<6;a++)for(let b=a+1;b<6;b++)assert.ok(Math.hypot(actors[a].x-actors[b].x,actors[a].z-actors[b].z)>=1.5-1e-6,`physical issue queue keeps body spacing ${i} ${a}/${b}: ${JSON.stringify(actors)}`);
 }
 assert.ok(runtime.openingCast.every(e=>e.issueComplete&&e.weaponIssued&&e.ammoIssued),"early B03 never skips six actual handovers");
 for(const a of actors){
  assert.deepEqual(equipment.filter(e=>e.a===a).map(e=>e.kind),["empty","weapon","ammo"]);
  for(const e of equipment.filter(e=>e.a===a&&e.kind!=="empty"))assert.ok(Math.hypot(e.at.x-issue[`${e.kind}Point`].x,e.at.z-issue[`${e.kind}Point`].z)<.4);
 }
 assert.ok(moves.every(distance=>distance<=8+1e-6),"issue movement uses short actual goals");
}
{
 const guide={castId:"luo",...P012StationPoint(-55,53)},cast=[guide,...[0,1,2,3,4,5].map(i=>({castId:i<4?`cast${i}`:null,...P012StationPoint(-76+i*2,60)}))];
 const traffic=[50,47,44].map(z=>P012StationPoint(-54,z));cast.push(...traffic);let initialized=0;
 const player=P012StationPoint(-56,55);
 const r=new FirstLevelP012Runtime({GuideActor:()=>guide,FriendlyActors:()=>cast,Position:a=>a,PlayerPosition:()=>player,
  InitializeOpeningActor:(a,p)=>{Object.assign(a,p);initialized++;},
  Move:(a,p,speed)=>{const d=Math.hypot(p.x-a.x,p.z-a.z);if(d<=1.2)return;const k=Math.min(1,speed*.1/d);a.x+=(p.x-a.x)*k;a.z+=(p.z-a.z)*k;},ReleaseGuide:a=>{a.released=true;}
 },{...P012Phase.whitebox,activities:{...P012Phase.whitebox.activities,openingIssue:undefined}});
 r.traffic=traffic.map(actor=>({actor}));r.beat=0;for(let i=0;i<300;i++)r.StepOpeningCast();
 assert.equal(r.openingCast.length,6);assert.equal(initialized,6,"safe initial assembly happens once, never a teleport loop");assert.deepEqual(traffic[0],P012StationPoint(-54,50),"traffic pool is excluded");assert.deepEqual(guide,{castId:"luo",...P012StationPoint(-55,53)},"opening spacing never changes Luo pacing");
 assert.ok(r.openingCast.every(e=>Math.hypot(e.actor.x-e.parking.x,e.actor.z-e.parking.z)<1.3),"without issue configuration, cast retain the configured initial parking contract");
 r.beat=3;r.StepOpeningCast();assert.ok(r.openingCast.every(e=>e.released&&e.actor.released&&!e.actor.scriptedNoncombatant),"only opening beats own this formation");
}
{
 const walkers=[],signals=[];let door=false,visible=false;const player={...P012Phase.whitebox.anchors.trainDoor};
 const run=new FirstLevelP012Runtime({GuideActor:()=>null,Position:a=>a,PlayerPosition:()=>player,Signalled:name=>name==="P012TrainDoor"&&door,
  Signal:name=>signals.push(name),
  TrafficVisible:()=>visible,RetireTraffic:a=>{a.retired=true;return true;},
  TrafficActor:(side,slot,p,entry)=>{const actor={...p,alive:true,side,slot,role:entry.role,child:!!entry.child};walkers.push(actor);return actor;},
  Move:(a,p,speed)=>{const d=Math.hypot(p.x-a.x,p.z-a.z);if(d<=(a.scriptArrivalRadius??1.2))return;const k=Math.min(1,speed*.1/d);a.x+=(p.x-a.x)*k;a.z+=(p.z-a.z)*k;},ReleaseGuide:()=>{}
 },P012Phase.whitebox);
 run.Update(.1);assert.equal(walkers.length,18,"three soldiers plus thirteen civilians and two walking wounded; two rescuers remain separately counted");
 assert.equal(walkers.filter(w=>w.side===0).length,3);
 assert.equal(walkers.filter(w=>w.role==="civilian").length,13);
 assert.equal(walkers.filter(w=>w.role==="walking").length,2);
 visible=true;run.Update(.1);assert.equal(signals.includes("P012VillageTrafficSeen"),false,"civilians glimpsed from the braking train cannot trigger later village dialogue");visible=false;
 for(let i=0;i<600;i++)run.Update(.1);
 assert.ok(run.traffic.filter(w=>w.pauseIndex!==undefined).every(w=>w.index<=w.pauseIndex));
 assert.ok(run.traffic.filter(w=>w.role==="walking").every(w=>w.travelM===0));
 door=true;run.beat=2;visible=true;run.Update(.1);assert.equal(signals.includes("P012VillageTrafficSeen"),true,"the same visible civilian flow cues dialogue only while walking through the village");visible=false;
 for(let i=0;i<1400;i++){
  run.Update(.1);
  const active=walkers.filter(w=>!w.retired);
  for(let a=0;a<active.length;a++)for(let b=a+1;b<active.length;b++)assert.ok(Math.hypot(active[a].x-active[b].x,active[a].z-active[b].z)>(active[a].child?.24:.34)+(active[b].child?.24:.34),"finite crossing routes preserve actual child/adult standing capsule radii");
 }
 const reserved=run.traffic.filter(w=>w.role==="walking");
 assert.ok(reserved.every(w=>!w.proximityReleased),"B02 cannot release the binocular subjects");
 player.x=2;player.z=0;run.beat=3;
 for(let i=0;i<20;i++)run.Update(.1);
 assert.ok(reserved.every(w=>!w.proximityReleased),"proximity without visibility cannot release subjects");
 visible=true;for(let i=0;i<1000;i++)run.Update(.1);
 assert.ok(reserved.every(w=>w.proximityReleased&&w.arrived));
 visible=false;for(let i=0;i<1000;i++)run.Update(.1);
 assert.equal(run.traffic.filter(w=>w.retireWhenHidden&&w.retired).length,11,JSON.stringify(run.traffic.filter(w=>w.retireWhenHidden).map(w=>({slot:w.slot,index:w.index,at:w.actor,arrived:w.arrived}))));
 assert.ok(run.traffic.filter(w=>w.retired).every(w=>w.arrived),"retirement never replaces physical arrival");
 assert.equal(walkers.length,18,"no replacement spawn loop");
}
assert.match(ai,/s\.scriptArrivalRadius\) : 1\.2/ ,"ordinary traffic retains production AI stopping radius");
{
 const actors=[0,1,2].map(slot=>({x:0,z:-15-slot*3,alive:true})),defended=[];
 const runtime=new FirstLevelP012Runtime({GuideActor:()=>null,Position:a=>a,Signalled:()=>false,
  FriendlyActors:()=>actors,ReleaseGuide:a=>{a.released=true;delete a.scriptArrivalRadius;},Defend:(a,p,doctrine)=>defended.push({a,p,doctrine}),
  Move:(a,p,speed)=>{const d=Math.hypot(p.x-a.x,p.z-a.z),stop=a.scriptArrivalRadius??1.2;if(d>stop){const f=Math.min(d-stop,speed*.1)/d;a.x+=(p.x-a.x)*f;a.z+=(p.z-a.z)*f;}}
 },{...P012Phase.whitebox,activities:{...P012Phase.whitebox.activities,traffic:undefined}});
 runtime.traffic=actors.map((actor,slot)=>({actor,side:0,slot,path:[{...actor}],index:0,parking:{...actor},arrived:true,speedMps:3.05}));
 runtime.beat=4;runtime.Update(.1);
 assert.ok(actors.every(a=>!a.released),"B04 starts physical transfer instead of releasing stale squad goals");
 runtime.beat=5;
 for(let i=0;i<1200;i++){
  if(i===600)runtime.beat=6;
  runtime.Update(.1);
  for(const actor of actors)for(const block of openingLayout.blocks){
   if(block.solid===false||block.y-block.h/2>1.8||block.y+block.h/2<.1)continue;
   const dx=actor.x-block.x,dz=actor.z-block.z,c=Math.cos(block.ry||0),s=Math.sin(block.ry||0);
   const gap=Math.hypot(Math.max(0,Math.abs(dx*c-dz*s)-block.w/2),Math.max(0,Math.abs(dx*s+dz*c)-block.d/2));
   assert.ok(gap>=.42,`north supply path intersects ${block.id} at ${JSON.stringify(actor)}`);
  }
  for(let a=0;a<3;a++)for(let b=a+1;b<3;b++)assert.ok(Math.hypot(actors[a].x-actors[b].x,actors[a].z-actors[b].z)>=1.5,`supply soldiers keep separate physical bodies ${i}: ${JSON.stringify(actors)}`);
 }
 assert.ok(runtime.traffic.every(w=>w.retired&&w.frontlineTransfer&&w.arrived));
 assert.ok(defended.length>=3,"same three actors join defence only after physical arrival");
 const supply=P012Phase.whitebox.activities.frontlineSupply;
 assert.deepEqual(supply.positions,[{x:11,z:-102},{x:15,z:-103},{x:19,z:-104}],"supply coordinates undergo the north transform exactly once");
 for(const center of supply.positions)for(let n=0;n<72;n++){
  const point={x:center.x+Math.cos(n*Math.PI/36)*supply.holdRadiusM,z:center.z+Math.sin(n*Math.PI/36)*supply.holdRadiusM};
  for(const block of openingLayout.blocks){
   if(block.solid===false||block.y-block.h/2>1.8||block.y+block.h/2<.1)continue;
   const dx=point.x-block.x,dz=point.z-block.z,c=Math.cos(block.ry||0),s=Math.sin(block.ry||0);
   assert.ok(Math.hypot(Math.max(0,Math.abs(dx*c-dz*s)-block.w/2),Math.max(0,Math.abs(dx*s+dz*c)-block.d/2))>=.42,`entire supply hold circle clears ${block.id}`);
  }
  const route=P012Phase.whitebox.activities.ammoRoute;
  for(let j=1;j<route.length;j++){
   const a=route[j-1],b=route[j],dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((point.x-a.x)*dx+(point.z-a.z)*dz)/(dx*dx+dz*dz)));
   assert.ok(Math.hypot(point.x-a.x-t*dx,point.z-a.z-t*dz)>3,"full hold circle stays outside all ammo route segments");
  }
 }
 for(const order of defended){
  assert.deepEqual(order.p,supply.positions[actors.indexOf(order.a)]);
  assert.equal(order.doctrine.holdRadiusM,supply.holdRadiusM);
 }
 for(const [index,actor] of actors.entries()){
  assert.ok(Math.hypot(actor.x-supply.positions[index].x,actor.z-supply.positions[index].z)<.4);
  for(const port of P012Phase.whitebox.anchors.gunports)assert.ok(Math.hypot(actor.x-port.x,actor.z-port.z)-supply.holdRadiusM>3,"entire defensive slot stays outside player gunport space");
  for(const point of P012Phase.whitebox.activities.ammoRoute)assert.ok(Math.hypot(actor.x-point.x,actor.z-point.z)-supply.holdRadiusM>3,"no terminal supply body in delivery route");
 }
 assert.ok(actors.every(a=>a.z<-99),"all three actually reached the northern position");
}
assert.match(ai, /if \(Number\.isFinite\(s\.scriptMoveSpeedMps\)\) speed = s\.p012Guided && desired/);
assert.match(ai, /\? Math\.max\(0, s\.scriptMoveSpeedMps\) : Math\.min\(speed, Math\.max\(0, s\.scriptMoveSpeedMps\)\)/,"only explicitly guided P012 actors bypass the ordinary speed cap");
const main = readFileSync(new URL("./Script_Main.mjs", import.meta.url), "utf8");
assert.match(main,/actor\.p012MachineGun = true; actor\.scriptDefensive = true/,
  "the spawned finite MG keeps an explicit identity marker");
assert.match(main,/actor\.alive\s*&&\s*actor\.p012MachineGun === true[\s\S]*?actor\.state === AI_STATE\.SUPPRESSED/,
  "friendly MG recovery starts only from the living P012 MG's production SUPPRESSED state");
{
 const body=main.match(/EnemyStaging: \(soldier, staging\) => \{([\s\S]*?)\n    \},/)[1];
 const Stage=vm.runInNewContext(`(soldier,staging)=>{${body}}`),soldier={alive:true,health:38,ammo:2,target:{},targetVisible:true,cover:{},state:"fire"};
 Stage(soldier,true);assert.equal(soldier.scriptedNoncombatant,true);assert.equal(soldier.target,null);assert.equal(soldier.state,"advance");
 Stage(soldier,false);assert.equal(soldier.scriptedNoncombatant,false);assert.equal(soldier.health,38);assert.equal(soldier.ammo,2);
 soldier.alive=false;Stage(soldier,true);assert.equal(soldier.alive,false,"staging never resurrects an actor");
}
{
 const source=main.match(/function AirColumnEnteredRoad\(column, position, activities = null\) \{[\s\S]*?\n\}/)[0];
 const Check=vm.runInNewContext(`(${source})`,{P012SouthPoint}),members=Array.from({length:4},()=>({handle:{alive:true,position:P012SouthPoint(50,60)}}));
 const column={litters:[{front:members[0],rear:members[1]},{front:members[2],rear:members[3]}],HeadPosition:()=>P012SouthPoint(50,66)};
 assert.equal(Check(column,P012SouthPoint(54,57)),true);members[3].handle.position.z=P012SouthPoint(50,59.99).z;assert.equal(Check(column,P012SouthPoint(54,57)),false);
 members[3].handle.position.z=P012SouthPoint(50,60).z;members[3].handle.alive=false;assert.equal(Check(column,P012SouthPoint(54,57)),false);
 members[3].handle.alive=true;assert.equal(Check(column,P012SouthPoint(70,57)),false);
}
{
 const body=main.match(/ThreatensEscort: \(actor\) => \{([\s\S]*?)\n    \},/)[1];
 const Check=vm.runInNewContext(`actor=>{${body}}`,{player:{position:{x:0,z:0}},setpieces:null});
 assert.equal(Check({targetVisible:true,target:{isPlayer:true,position:{x:0,z:0}}}),true,"real visible target does not depend on player camera facing");
 assert.equal(Check({targetVisible:true,target:{ref:{side:"nra"},position:{x:40,z:0}}}),false,"unrelated distant firefight is not escort threat");
 assert.equal(Check({targetVisible:false,target:{isPlayer:true,position:{x:0,z:0}}}),false,"blocked LOS cannot trigger warning");
}
{
  const body = main.match(/GiveBandages: \(request\) => \{([\s\S]*?)\n    \},/)[1];
  const patient = { bandages: 0, health: 27, bleeding: 2.8 }, hints = [];
  const Give = vm.runInNewContext(`(request)=>{${body}}`, {player:patient,hud:{Hint:(text)=>hints.push(text)}});
  assert.equal(Give(1),1); assert.equal(patient.bandages,1);
  assert.equal(patient.health,27); assert.equal(patient.bleeding,2.8);
  assert.equal(Give(-1),0); assert.equal(Give(NaN),0); assert.equal(patient.bandages,1);
  assert.equal(hints.length,1); assert.match(hints[0],/按 B/);
}
assert.match(main,/if \(\(MENU_ON \|\| FIRST_LEVEL_P012_WHITEBOX\) && menuRoot\)/,"P012 shot mode still constructs the completion/retry menu");
assert.match(main,/state\.playerShots \+= 1;\s*p012Runtime\?\.RecordAircraftShot/ ,"aircraft reaction occurs only after successful ammunition consumption");
assert.doesNotMatch(main,/story\.fired\s*=\s*\[\.\.\.sample\.p012Story\.fired\]/,"P012 rewind must not shorten the live setpiece event ledger");
assert.match(main,/story\.P012Restore\?\.\(sample\.p012Story\.immediate\)/,"P012 immediate cue ledger is restored separately");
{
 const source=main.match(/case "interact":([\s\S]*?)case "bipod":/)[1],calls=[];
 let point=null;
 const context={detail:{down:true},player:{},p012Flow:{},interact:{Query:()=>({point}),Release:()=>calls.push('release')},
   meleeQte:{TryBeginExecution:()=>false},emplacement:null,carry:{Active:true,Drop:()=>calls.push('drop')},DoInteract:()=>calls.push('deliver')};
 const Input=vm.runInNewContext(`()=>{${source}}`,context);
 for(const id of ['p012_ammoDrop','p012_airRescueCover']){point={id};calls.length=0;Input();assert.deepEqual(calls,['deliver'],'production F routing preserves a registered carried delivery hold');}
 point={id:'p012_airCartClear'};calls.length=0;Input();assert.deepEqual(calls,['drop'],'unrelated interactions do not replace voluntary release');
 context.detail.down=false;calls.length=0;Input();assert.deepEqual(calls,['release'],'F up still releases the real hold gesture');
}
{
 const signals=new Set(['P012AirObserveOpen']),once=new Set(),runs=[],props=[];
 const column={Update(){},scriptPaused:false,Bearers:[],Civilians:[],Alive:[],HeadPosition:()=>({x:110,z:53})};
 const context={phase:{whitebox:P012Phase.whitebox},mem:{column},d:{host:{Story:()=>({Signalled:name=>signals.has(name)})}},
  strafe:{Active:false,StrafeRun:spec=>runs.push(spec)},Once(name,fn){if(!once.has(name)){once.add(name);fn(this);}},
  Signal:name=>signals.add(name),Prop:spec=>{props.push(spec);return spec.id;},Time:()=>100,PlayerPos:()=>({x:105,z:53}),Spoken:()=>false};
 SETPIECES.CH1_NanLu.Update(context,.1);
 assert.equal(runs.length,1);assert.equal(runs[0].preset,'railPass');assert.equal(column.scriptPaused,true);
 runs[0].OnPhase('exit');
 SETPIECES.CH1_NanLu.Update(context,.1);
 assert.equal(runs.length,1,'rail exit alone cannot launch the crowd attack while player is still choosing');
 signals.add('P012AirRouteChosen');SETPIECES.CH1_NanLu.Update(context,.1);
 assert.equal(column.scriptPaused,false,'actual route choice releases waiting litters');
 assert.equal(runs.length,1,'choice alone is not actual arrival in the exposed road');
 signals.add('P012CrowdReady');SETPIECES.CH1_NanLu.Update(context,.1);
 assert.equal(runs.length,2);assert.equal(runs[1].preset,'crowdTurn');
 runs[1].OnPhase('fire');SETPIECES.CH1_NanLu.Update(context,.1);
 assert.equal(column.scriptPaused,true,'earlier choice release cannot clear the later strafe pause');
 assert.ok(props.length===1&&props.every(prop=>Array.isArray(prop.size)&&prop.size.length===3&&prop.size.every(Number.isFinite)),
  'only the cart is a box prop; the wounded civilian is an existing actor');
 console.log('PASS real rail pass, physical route choice and road arrival own finite aircraft/column handoffs');
}
{
  const runs = [], emitted = [], moved = []; let rewinds = 0, aborted = 0, ready = false;
  const context = {
    phase: { whitebox: { p012: true } }, mem: { crowdTurnDone: 1, carryStartedAt: 1 },
    d: { host: { Story: () => ({ Signalled: (name) => name === "P012CarryReady" && ready }), MoveProp: (id, at) => moved.push({ id, ...at }) } },
    strafe: { StrafeRun: (spec) => runs.push(spec), Abort: () => aborted++ },
    carry: { KindId:"stretcher", ForceRelease() { this.KindId=null; } }, checkpoint: { Rewind: () => rewinds++ },
    Time: () => 30, PlayerPos: () => ({ x: 0, z: 0 }), Spoken: () => false,
    Signal: (name) => emitted.push(name), Hint() {},
  };
  SETPIECES.CH1_NanLu.Update(context, 0.1); assert.equal(runs.length, 0, "standing twenty seconds does not arm dive");
  ready = true; SETPIECES.CH1_NanLu.Update(context, 0.1); assert.equal(runs.length, 1);
  runs[0].OnPlayerHit(); assert.equal(rewinds, 1); assert.ok(!emitted.includes("P012Dived"));
  SETPIECES.CH1_NanLu.Update(context, 0.1); assert.equal(aborted, 1); assert.equal(runs.length, 2);
  context.mem.p012CarriedLitter = { propLitter: "litter", propBody: "body" };
  // The input releases the load before TryDitchDodge reaches OnDodge.
  context.carry.KindId=null;context.mem.p012ReleaseAt={x:0,z:0};context.PlayerPos=()=>({x:0,z:-.8});
  for(let frame=0;frame<24;frame++)SETPIECES.CH1_NanLu.Update(context,1/30);
  assert.ok(context.mem.p012ReleaseAt?.placed,'physical crawl frames retain the already rendered input-release receipt');
  runs[1].OnDodge(); assert.ok(emitted.includes("P012Dived"));
  assert.ok(moved.some((entry) => entry.id === "litter" && entry.rotationZ > 1));
  assert.equal(moved.find(entry=>entry.id==='litter'&&entry.rotationZ>1).z,0,'litter falls at release position, not at the end of the dive');
  assert.equal(context.mem.p012ReleaseAt,null,'the release receipt is consumed by this physical overturn');
  const front = { role: "bearer", slot: { back: 0 }, handle: { alive: true, position: { x: 1.2, z: -0.9 } } };
  const rear = { role: "bearer", slot: { back: 2.2 }, handle: { alive: false } };
  const guard = { role: "guard", handle: { alive: true, position: { x: 20, z: 20 }, actor: { SetWeapon: (value) => { guard.hiddenWeapon = value === null; } } } };
  Object.assign(context.mem.p012CarriedLitter, { front, rear, dropped: true });
  context.mem.column = { Update() {}, Alive: [front, guard] };
  context.d.host.PositionOf = (actor) => actor.position;
  context.d.host.SetGoal = () => {};
  SETPIECES.CH1_NanLu.Update(context, 0.1);
  assert.equal(guard.handle.scriptedNoncombatant, true); assert.equal(guard.handle.unarmed, true);
  assert.equal(guard.handle.scriptEssential,true,"same surviving replacement is protected from incidental lethal fire");
  assert.equal(guard.hiddenWeapon, true); assert.ok(!context.mem.p012LitterRecovered, "remote guard cannot instantly recover litter");
  guard.handle.position = { x: 1.2, z: 0.9 };
  SETPIECES.CH1_NanLu.Update(context, 0.1); assert.equal(context.mem.p012LitterRecovered, true);
  context.d.host.Story=()=>({Signalled:name=>name==="P012RoadContactRelease"});
  context.mem.column.scriptPaused=true;SETPIECES.CH1_NanLu.Update(context,.1);
  assert.equal(context.mem.column.scriptPaused,false,'road release resumes the column once');
  context.mem.column.scriptPaused=true;SETPIECES.CH1_NanLu.Update(context,.1);
  assert.equal(context.mem.column.scriptPaused,true,'historic road release cannot override a later aircraft or ambush halt');
}
console.log("PASS P012 runtime finite actors, guide speed, shell warning, delivery input routing");
{
 const front={role:'bearer',handle:{alive:true,body:{radius:.34},position:{x:104,z:59.8}}};
 const rear={role:'bearer',slot:{back:P012Phase.whitebox.activities.stretcherCarryPose.bearerSpanM},handle:{alive:false}};
 const replacement={role:'guard',handle:{alive:true,body:{radius:.34},position:{...P012Phase.whitebox.activities.airCrowdCoverSlots[0]}}};
 const litter={front,rear,dropped:true},goals=new Map();
 const context={phase:{whitebox:P012Phase.whitebox},mem:{p012CarriedLitter:litter,p012LitterOverturned:true,p012FallenAt:{x:105.2,z:61.6},column:{Update(){},Alive:[front,replacement],keepArrivalSlots:true}},
  Spoken:()=>false,Signal(){},PlayerPos:()=>({x:104,z:60}),d:{host:{Story:()=>({Signalled:()=>false}),PositionOf:actor=>actor.position,
  SetGoal:(actor,x,z)=>{const point={x,z};assert.ok(P012SegmentClear(P012Phase.whitebox.layout.blocks,actor.position,point,.34),'replacement never receives a goal through a ditch bank');goals.set(actor,point);}}}};
 let seconds=0;
 while(!context.mem.p012LitterRecovered&&seconds<40){
  SETPIECES.CH1_NanLu.Update(context,1/30);
  for(const [actor,point] of goals){const dx=point.x-actor.position.x,dz=point.z-actor.position.z,distance=Math.hypot(dx,dz),step=Math.min(distance,1.35/30);
   if(distance){actor.position.x+=dx/distance*step;actor.position.z+=dz/distance*step;}}
  seconds+=1/30;
 }
 assert.ok(context.mem.p012LitterRecovered,'the same living guard physically returns from the separate crowd shelter');
  assert.equal(litter.rear,replacement);assert.equal(rear.handle.alive,false);
  assert.equal(replacement.handle.scriptArrivalRadius,.3,'a living replacement inherits the precise P012 terminal slot arrival radius');
 console.log(`PASS physical replacement reaches the original overturned litter through bank openings in ${seconds.toFixed(1)}s`);
}
{
 const path=P012Phase.whitebox.activities.stretcherCarryRoute,front={alive:true,body:{radius:.34},position:{x:path[0].x,z:path[0].z}},moves=[];
 const pose=P012Phase.whitebox.activities.stretcherCarryPose;
 let player={x:path[0].x,z:path[0].z+pose.bearerSpanM},goal=null;
 const litter={front:{handle:front},propLitter:'OriginalLitter',propBody:'OriginalPatient'};
 const context={phase:{whitebox:P012Phase.whitebox},mem:{p012CarriedLitter:litter},carry:{KindId:'stretcher',load:{serial:1}},PlayerPos:()=>player,
   d:{host:{PositionOf:actor=>actor.position,Story:()=>({Signalled:()=>false}),SetGoal:(actor,x,z)=>{assert.equal(actor,front);goal={x,z};},MoveProp:(id,at)=>moves.push({id,...at})}}};
 const initial={...front.position};
 for(const target of path){
   for(let frame=0;frame<1800;frame++){
     StepP012PlayerLitter(context);
     assert.ok(P012SegmentClear(P012Phase.whitebox.layout.blocks,front.position,goal,.34),'real front holder receives only body-clear commands');
     const d=Math.hypot(goal.x-front.position.x,goal.z-front.position.z),step=Math.min(d,3.05/30);
     if(d){front.position.x+=(goal.x-front.position.x)*step/d;front.position.z+=(goal.z-front.position.z)*step/d;}
     const distance=Math.hypot(target.x-player.x,target.z-player.z);if(distance<.05)break;
     const move=Math.min(distance,1.281/30);player={x:player.x+(target.x-player.x)*move/distance,z:player.z+(target.z-player.z)*move/distance};
   }
 }
 StepP012PlayerLitter(context);
 assert.ok(Math.hypot(front.position.x-initial.x,front.position.z-initial.z)>10,'the same surviving actor physically follows the whole carried route');
 assert.equal(context.carry.load.partner,front);
 const prop=moves.at(-2);assert.equal(prop.id,'OriginalLitter');
 assert.ok(Math.abs(prop.x-(front.position.x+player.x)/2)<1e-8&&Math.abs(prop.z-(front.position.z+player.z)/2)<1e-8,'existing litter is drawn between actual player and front holder');
 assert.ok(Math.abs(context.mem.p012CarryPartner.spanM-pose.bearerSpanM)<.08,'front holder keeps the authored P012 two-person carry span at the bay');
 assert.equal(prop.y,pose.litterLiftM,'the carried original litter uses the verified P012 lift height');
 assert.equal(moves.at(-1).y,pose.bodyLiftM,'the original patient stays at the matching lift height');
 context.carry.KindId=null;context.Spoken=()=>false;
 SETPIECES.CH1_NanLu.Update(context,1/30);
 for(const key of ['p012Guided','scriptArrivalRadius','carryRole','scriptMoveSpeedMps'])assert.equal(front[key],undefined,'release restores the surviving actor before ordinary column movement resumes');
 console.log('PASS original carried litter follows the living front holder and player through physical corners');
}
{
  let impact;
  const runtime = new FirstLevelP012Runtime({ GuideActor: () => null, Position: () => null, Signalled: () => false,
    WarnShell: (point, damaging, callback) => { impact = callback; return { x: point.x + 1, z: point.z }; } }, {});
  runtime.Shelling({ x: 5, z: 6 }, true);
  assert.deepEqual(runtime.Sample().mortarWarningPosition, { x: 6, z: 6 });
  runtime.time = 20;
  assert.equal(runtime.Sample().mortarImpactCount, 0, "elapsed time alone cannot report a damaging impact");
  impact({ x: 6, z: 6 }); impact({ x: 6, z: 6 });
  assert.equal(runtime.Sample().mortarImpactCount, 1);
  assert.equal(runtime.Sample().mortarWarningActive, false);
  const combat = readFileSync(new URL("./Script_Combat.mjs", import.meta.url), "utf8");
  assert.match(combat, /this\.Blast\(shell\.at,[\s\S]*?shell\.OnImpact\?\.\(shell\.at\)/);
}
{
  const runtime=new FirstLevelP012Runtime({GuideActor:()=>null,Position:()=>null,Signalled:()=>false,
    EnemyMgSuppressed:()=>true,CombatTime:()=>12,FriendlyMgFired:since=>since===12,FriendlyActors:()=>[]},{});
  runtime.Guide({beat:7,route:[]});runtime.Update(.1);
  assert.equal(runtime.Sample().friendlyMgFiredAfterSuppression,true,
    "real MG suppression and friendly return fire are recorded while B07 is still active");
  runtime.Guide({beat:8,route:[]});runtime.Update(.1);
  assert.equal(runtime.Sample().friendlyMgFiredAfterSuppression,true,
    "entering B08 preserves the earlier production combat receipt");
}
{
  const front = { handle: { alive: true, position: { x: 0, z: 0 } } };
  const rear = { handle: { alive: true, position: { x: 0, z: 10 } } };
  const column = { arrived: true, waypoints: [{ x: 0, z: 0 }], litters: [{ front, rear }] };
  assert.equal(LastLitterArrived(column), false, "front bearer alone cannot finish retreat");
  rear.handle.position.z = 1.5; assert.equal(LastLitterArrived(column), true);
  const runtime = new FirstLevelP012Runtime({ DeploySmoke: () => 1 }, {});
  assert.equal(runtime.DeployRetreatSmoke({ x: 0, z: 0 }), true);
  assert.equal(runtime.BlocksSight({ x: -10, y: 1, z: 0 }, { x: 10, y: 1, z: 0 }), true);
  assert.equal(runtime.BlocksSight({ x: -10, y: 1, z: 15 }, { x: 10, y: 1, z: 15 }), false);
  runtime.time = 126; assert.equal(runtime.BlocksSight({ x: -10, y: 1, z: 0 }, { x: 10, y: 1, z: 0 }), false);
}
{
 const config=P012Phase.whitebox,pose=config.activities.stretcherCarryPose,goals=new Map(),props=[];
 let time=0,column=null,nextId=1;
 const host={Time:()=>time,PlayerPos:()=>column?.HeadPosition(),Alive:actor=>actor.alive,
  PositionOf:actor=>actor.position,SpawnActor:spec=>({id:nextId++,alive:true,position:{x:spec.x,y:0,z:spec.z},body:{radius:.34}}),
  Prop:spec=>{props.push(spec.id);return spec.id;},MoveProp(){},
  SetGoal:(actor,x,z)=>{const point={x,z};assert.ok(P012SegmentClear(config.layout.blocks,actor.position,point,.34),
    `P012 arrival slot command keeps real body clearance: ${JSON.stringify({id:actor.id,from:actor.position,to:point})}`);goals.set(actor,point);}};
 column=new EscortColumn(host,{waypoints:config.escortWaypoints.slice(-2),followRouteBodies:true,keepArrivalSlots:true,...pose,
  members:Array.from({length:4},()=>({role:'bearer',label:'担架员'}))});
 column.Start();const ids=column.members.map(member=>member.handle.id),dt=1/30;
 const MoveActors=()=>{for(const [actor,target] of goals){const dx=target.x-actor.position.x,dz=target.z-actor.position.z,distance=Math.hypot(dx,dz),step=Math.min(distance,1.35*dt);
  if(distance){actor.position.x+=dx/distance*step;actor.position.z+=dz/distance*step;}}};
 for(let frame=0;frame<30000&&!LastLitterArrived(column);frame++){time+=dt;column.Update(dt);MoveActors();}
 assert.ok(column.arrived&&LastLitterArrived(column),'actual P012 escort reaches distinct terminal slots');
 const bearers=column.litters.flatMap(litter=>[litter.front.handle,litter.rear.handle]);
 const PairGap=litter=>Math.hypot(litter.front.handle.position.x-litter.rear.handle.position.x,litter.front.handle.position.z-litter.rear.handle.position.z);
 assert.ok(column.litters.every(litter=>Math.abs(PairGap(litter)-pose.bearerSpanM)<.12),'each P012 litter retains its 2.4m bearer span');
 const Mid=litter=>({x:(litter.front.handle.position.x+litter.rear.handle.position.x)/2,z:(litter.front.handle.position.z+litter.rear.handle.position.z)/2});
 assert.ok(Math.hypot(Mid(column.litters[0]).x-Mid(column.litters[1]).x,Mid(column.litters[0]).z-Mid(column.litters[1]).z)>3.5,
  'the two original litters remain separate at the route end');
 const end=column.waypoints.at(-1);
 assert.ok(bearers.filter(actor=>Math.hypot(actor.position.x-end.x,actor.position.z-end.z)<.7).length<4,
  'arrival does not require all four bearers to overlap the endpoint');
 const separated=bearers.map(actor=>({...actor.position}));for(const actor of bearers)actor.position={...end,y:0};
 assert.equal(LastLitterArrived(column),false,'four bearers collapsed onto one endpoint cannot impersonate slotted P012 arrival');
 bearers.forEach((actor,index)=>{actor.position=separated[index];});
 for(let frame=0;frame<10*30;frame++){time+=dt;column.Update(dt);MoveActors();}
 const settled=bearers.map(actor=>({...actor.position}));
 for(let frame=0;frame<180*30;frame++){time+=dt;column.Update(dt);MoveActors();}
 assert.ok(bearers.every((actor,index)=>Math.hypot(actor.position.x-settled[index].x,actor.position.z-settled[index].z)<.001),
  'P012 terminal slots remain stable for 180 seconds');
 assert.deepEqual(column.members.map(member=>member.handle.id),ids);assert.deepEqual(props,['escortLitter0','escortCasualty0','escortLitter1','escortCasualty1']);
}
{
  let dodges = 0, released = 0;
  const runtime = new FirstLevelP012Runtime({ Dodge: () => { dodges++; return true; }, ReleaseForDodge: () => released++ }, { anchors: { strafeSlots: [{ x: 2, z: 0 }] } });
  runtime.RecordDodgeIntent({ x: 0, z: 0 }, { player: { open: false } }, "stretcher"); assert.equal(released, 0);
  runtime.RecordDodgeIntent({ x: 0, z: 0 }, { player: { open: true } }, "stretcher"); assert.equal(released, 1); assert.equal(dodges, 0);
  assert.equal(runtime.TryDitchDodge({ x: 2, z: 0 }, "prone", { player: { open: false } }), false);
  assert.equal(runtime.TryDitchDodge({ x: 0, z: 0 }, "prone", { player: { open: true } }), false);
  assert.equal(runtime.TryDitchDodge({ x: 20, z: 0 }, "prone", { player: { open: true } }), false);
  assert.equal(runtime.TryDitchDodge({ x: 2, z: 0 }, "prone", { player: { open: true } }), true);
  assert.equal(dodges, 1);
}
{
  let time = 0, column; const actors = [];
  const host = { Time: () => time, PlayerPos: () => column.HeadPosition(),
    SpawnActor: ({ x, z }) => { const actor = { alive: true, position: { x, z }, goal: { x, z } }; actors.push(actor); return actor; },
    PositionOf: (actor) => actor.position, Alive: (actor) => actor.alive,
    SetGoal: (actor, x, z) => { actor.goal = { x, z }; },
  };
  column = new EscortColumn(host, { waypoints: P012Phase.whitebox.routes.retreat, followRouteBodies: true,
    tuning: { columnSpeedMS: P012Phase.whitebox.activities.retreatColumnSpeedMps }, members: [{ role: "bearer" }, { role: "bearer" }] });
  column.Start(); const finish = column.waypoints.at(-1);
  const routeLength=column.waypoints.slice(1).reduce((sum,point,index)=>sum+Math.hypot(point.x-column.waypoints[index].x,point.z-column.waypoints[index].z),0);
  const idealSeconds=routeLength/P012Phase.whitebox.activities.retreatColumnSpeedMps;
  for (; time < Math.max(140,idealSeconds*1.3); time += 0.1) {
    column.Update(0.1);
    for (const actor of actors) { const dx = actor.goal.x - actor.position.x, dz = actor.goal.z - actor.position.z, distance = Math.hypot(dx, dz);
      if (distance > 1.2) { const step = Math.min(distance - 1.2, actor.scriptMoveSpeedMps * 0.1); actor.position.x += dx / distance * step; actor.position.z += dz / distance * step; } }
    if (column.arrived && Math.hypot(actors[0].position.x - finish.x, actors[0].position.z - finish.z) < 8) break;
  }
  assert.ok(column.arrived,"actual column must finish before the watchdog, not merely run out the test clock");
  assert.ok(time >= 90 && time <= 120, `physical column retreat ${time.toFixed(1)}s; expanded route ideal ${idealSeconds.toFixed(1)}s; original P2 timing remains unmet`);
  assert.ok(Math.abs(column.members[0].slot.lateral) < 0.5);
  console.log(`PASS P012 physical body retreat ${time.toFixed(1)}s without teleport`);
}

assert.equal(P012Phase.whitebox.activities.guideSpeedMps,3.05,"ordinary guide movement speed remains unchanged");
assert.equal(P012Phase.whitebox.activities.guideSpeedByBeat[13],undefined,"B13 has no slow-speed override");
