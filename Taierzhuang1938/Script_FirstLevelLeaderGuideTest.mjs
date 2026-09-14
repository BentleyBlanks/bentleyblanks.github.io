import assert from "node:assert/strict";
import { NpcMissionGuide,GuideProjection,CompactGuideRoute } from "./Script_NpcMissionGuide.mjs";
import { MISSION_ROUTES } from "./Data_FirstLevelMissionLayout.mjs";
import { MISSION_SUPPLIES } from "./Data_FirstLevelMissionLayout.mjs";
import { MissionSquadRoute } from "./Script_FirstLevelMissionColumn.mjs";
import { MISSION_GUIDE_TUNING as G } from "./Data_Tuning_MissionGuide.mjs";
import { MISSION_LEADER_STAGES,MISSION_GUIDE_TRANSFERS } from "./Data_FirstLevelLeaderGuide.mjs";
import { MISSION_GUIDE_DIALOGUE } from "./Data_FirstLevelGuideDialogue.mjs";
import { FirstLevelMissionVoice } from "./Script_FirstLevelMissionVoice.mjs";
import { FirstLevelLeaderGuide } from "./Script_FirstLevelLeaderGuide.mjs";
import { GrenadeWarningScreenPoint } from "./Script_Hud.mjs";
import { T } from "./Script_Text.mjs";
const route=[{x:0,z:0},{x:0,z:-16,guideCheckpoint:0},{x:20,z:-16},{x:20,z:4,guideCheckpoint:1}];
assert.equal(CompactGuideRoute(Array.from({length:300},(_,x)=>({x,z:0})),G.collinearEpsilonM).length,2);
assert.deepEqual(CompactGuideRoute(route,G.collinearEpsilonM),route,"metadata checkpoints and bends survive compaction");
assert.equal(CompactGuideRoute([{x:0,z:0},{x:10,z:0},{x:0,z:0}],G.collinearEpsilonM).length,3,"a reversal is not a straight segment");
const dense=MissionSquadRoute(MISSION_ROUTES.south,0),compact=CompactGuideRoute(dense,G.collinearEpsilonM);
assert.ok(compact.length<100&&compact.length<dense.length);
assert.deepEqual(compact.at(-1),dense.at(-1));
for(const p of dense)assert.ok(GuideProjection(compact,p).distance<.00001,"every original point stays on the compact physical path");
for(const activeCover of [false,true]){
 const route=[{x:0,z:-20},{x:0,z:-40,coverBound:1},{x:0,z:-60}];
 const authored=structuredClone(route),actor={position:{x:0,y:0,z:0}};
 const host={squad:[actor],squadCoverBounds:activeCover?{}:null,flow:{stage:{id:"Support"}},
  battlefield:{GroundHeight:()=>0},BlocksSight:()=>false,Point:p=>p,
  physics:{Overlaps:()=>false},ai:{ctx:{nav:{Walkable:()=>true}}}};
 const guide=new FirstLevelLeaderGuide(host);guide.Plan(route);
 if(activeCover){assert.deepEqual(route,authored);assert.equal(guide.rule.Snapshot().stops.length,0);}
 else assert.ok(guide.rule.Snapshot().stops.length>0,"ordinary routes retain leader checkpoints");
}
for(const blocked of [false,true]){
 const route=[{x:6,z:-124},{x:-8,z:-112},{x:-8,z:-102},{x:-8,z:-78},{x:-24,z:-60}];
 const actor={position:{x:-6.46,y:0,z:-87.34},body:{ProbeMove:(x,y,z)=>blocked?{x:0,z:0}:{x,z}}};
 const host={squad:[actor],flow:{stage:{id:"South"}},battlefield:{GroundHeight:()=>0},BlocksSight:()=>false,
  Point:p=>p,physics:{Overlaps:()=>false},ai:{ctx:{nav:{Walkable:()=>false}}}};
 new FirstLevelLeaderGuide(host).Plan(route);
 assert.equal(route[0].z<-100,blocked,"nearby joins require actual capsule sweep clearance");
}
const rule=new NpcMissionGuide(G);rule.Reset(route);
assert.equal(rule.CanLeave(route[1],{x:0,z:0},true),false);
assert.equal(rule.CanLeave(route[1],{x:0,z:-12},false),false,"near through a wall is not a rejoin");
assert.equal(rule.CanLeave(route[1],{x:0,z:-12},true),true);
assert.equal(rule.CanLeave(route[1],{x:0,z:0},false),true,"released stops never pull the leader backward");
assert.equal(rule.CanLeave(route[3],{x:20,z:-14},true),false);
assert.equal(rule.CanLeave(route[3],{x:20,z:1},true),true);
rule.Reset(route);
assert.equal(rule.CanLeave(route[1],{x:15,z:-16},false),true,"a player already past the corner can keep going");
assert.equal(rule.CanLeave(route[3],{x:80,z:4},true),false,"far off the route is not progress");
assert.equal(GuideProjection(route,{x:20,z:3}).progress,55);
assert.deepEqual(rule.Snapshot().released,[0]);
assert.equal(new Set(MISSION_GUIDE_DIALOGUE.map(c=>c.id)).size,27);
for(const spec of [...Object.values(MISSION_LEADER_STAGES),...Object.values(MISSION_GUIDE_TRANSFERS)]){
 assert.ok(MISSION_GUIDE_DIALOGUE.some(c=>c.id===spec.cue));
 if(spec.mode)assert.notEqual(T("firstLevel.leader."+spec.mode),"firstLevel.leader."+spec.mode);
}
assert.ok(MISSION_GUIDE_DIALOGUE.every(c=>c.lines.length===1&&c.lines[0].who==="luo"&&c.guidance));
let stopped=0;const done=[];
const voice=new FirstLevelMissionVoice({audio:{StopStoryVoice(){stopped++;}},hud:{Say(){}},Done:id=>done.push(id)});
assert.ok(voice.Guidance("GuideFollow"));assert.equal(voice.Guidance("GuideWait"),false);
voice.Enqueue("SouthOrders");assert.deepEqual(voice.queue,["SouthOrders"]);
voice.queue=[];voice.current={cue:MISSION_GUIDE_DIALOGUE[0]};
assert.equal(voice.Guidance("GuideWait"),false);
voice.CancelGuidance();assert.equal(voice.current,null);assert.equal(stopped,1);assert.deepEqual(done,[]);
assert.ok(voice.Guidance("GuideFollow"));voice.queue=[];voice.current={cue:MISSION_GUIDE_DIALOGUE[0]};
voice.Finish();assert.ok(voice.Guidance("GuideFollow"),"completed reminders may repeat");
voice.CancelGuidance();voice.Pause();assert.equal(voice.Guidance("GuideFollow"),false);
voice.Resume();assert.ok(voice.Guidance("GuideFollow"));
const actor={position:{x:0,y:0,z:0},alive:true};
const r={squad:[actor],time:0,flow:{stage:{id:"South",objective:"route"}},voice:new FirstLevelMissionVoice({audio:{StopStoryVoice(){}},hud:{Say(){}}}),
 hud:{SetMissionGuide(){}},player:{alive:true,position:{x:0,y:0,z:1}},battlefield:{GroundHeight(){return 0;}},Has(){return false;}};
const guide=new FirstLevelLeaderGuide(r);guide.Enter(r.flow.stage);r.time=19;guide.Update();
assert.deepEqual(r.voice.queue,["GuideSouth"]);
r.voice.queue=[];guide.Update();assert.equal(r.voice.queue.length,0,"no repeat every frame");
r.time=57;guide.Update();assert.deepEqual(r.voice.queue,["GuideSouth"]);
r.voice.queue=["SouthOrders"];r.time=200;guide.Update();assert.deepEqual(r.voice.queue,["SouthOrders"]);
r.voice.queue=[];r.time=201;guide.Update();assert.equal(r.voice.queue.length,0,"quiet gap after story");
r.flow.stage={id:"MachineGun",objective:"gun"};
const gun={rounds:12,belts:0};r.emplacement={Mounted:true,Emplacement:()=>gun};
assert.equal(guide.View().cue,null,"the loaded final magazine is still usable ammunition");
gun.rounds=0;
let supplyView=guide.View();
assert.equal(supplyView.cue,"GuideGunSupply");assert.equal(supplyView.label,"collect");
const supply=MISSION_SUPPLIES.find(point=>point.id==="Front");
assert.equal(supplyView.target.x,supply.x);assert.equal(supplyView.target.z,supply.z);
r.emplacement.Mounted=false;supplyView=guide.View();
assert.equal(supplyView.cue,"GuideGunSupply","dismounting keeps the actual ammunition crate as the destination");
gun.belts=3;assert.equal(guide.View().cue,"GuideGun","resupply returns guidance to the gun");
r.flow.stage={id:"Death",objective:""};guide.Enter(r.flow.stage);assert.equal(guide.View(),null);
const player={position:{x:0,z:0},yaw:0};
const rear=GrenadeWarningScreenPoint({behind:true,visible:false,x:640,y:360},{position:{x:0,z:10}},player,1280,720,{liftPx:0});
assert.ok(rear.offscreen&&rear.y>360,"rear target points down rather than mirroring to the front");
const front=GrenadeWarningScreenPoint({behind:false,visible:true,x:600,y:300},{position:{x:0,z:-10}},player,1280,720,{liftPx:0});
assert.deepEqual(front,{x:600,y:300,offscreen:false});
console.log("ok leader rendezvous/LOS/corners, monotonic release, 27 cue contracts, story priority, cooldown, pause and marker bearings");
