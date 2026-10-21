import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {Object3D, Quaternion, Vector3} from 'three';
import { ALLY_GAIT } from './Data_Tuning_AllyGait.mjs';
import { SelectAllyGait, AllyGaitThreat, CrouchWalkBySpeed, HoldRunBySpeed, MarchBySpeed, RearGapM, ShoulderMarchAllowed } from './Script_AllyGaitPolicy.mjs';
import { LoadGlb, PoseScene, BuildSkin, MinSkinnedY } from './_import/Script_LugouGlbPose.mjs';
const file=path.join(import.meta.dirname,'Animation/AllyGait/Animation_TengxianAllyGait.json');
const data=JSON.parse(fs.readFileSync(file));
assert.equal(data.revision,ALLY_GAIT.version,'asset cache version matches the shipped action library');
assert.equal(data.clips.length,5);
assert.equal(new Set(data.clips.map(c=>c.uuid)).size,5,'mixer actions have distinct clip identities');
const calm={targetVisible:false,suppression:0};
assert.equal(SelectAllyGait(calm,{crouch:1,moveSpeedMps:.8},'RifleCrouchAdvance'),'AllyCrouchCarry');
assert.equal(SelectAllyGait({...calm,targetVisible:true},{crouch:1,moveSpeedMps:.8},'RifleCrouchAdvance'),'AllyCrouchReady');
assert.equal(SelectAllyGait(calm,{crouch:1,moveSpeedMps:.8},'RifleCrouchAdvance',.1),'AllyCrouchReady');
assert.equal(SelectAllyGait({...calm,targetVisible:true,missionFireHold:true},{},'AdvanceFire'),'AllyCarryStand');
assert.equal(SelectAllyGait({...calm,targetVisible:true,targetFromMemory:true},{moveSpeedMps:1},'RifleRun'),'AllyCarryWalk');
assert.equal(SelectAllyGait(calm,{moveSpeedMps:3},'BackRifleRun'),'BackRifleRun');
for(const [field,value] of Object.entries({dead:1,carryRole:'front',meleeCombat:{},prone:1,kneel:1,woundedWalk:1,throwing:1,reach:1,melee:1,binoculars:1,grounded:false})){
  assert.equal(SelectAllyGait(calm,{moveSpeedMps:1,[field]:value},'RifleRun'),'RifleRun',field+' retains priority');
}
for(const field of ['openingActorPerformance','openingStoryboardPose','missionRescueTarget','p012AwaitingWeapon','relaxedGait']){
  assert.equal(SelectAllyGait({...calm,[field]:true},{},'AdvanceFire'),'AdvanceFire',field+' retains priority');
}
assert.ok(AllyGaitThreat(calm,{firing:true}));
// A live enemy tank (FirstLevelFrontBattle.SetCombatAlert) keeps the rifle ready with no rifleman in sight.
assert.equal(SelectAllyGait({...calm,missionCombatAlert:true},{crouch:1,moveSpeedMps:0},'KneelHold'),'KneelHold');
assert.equal(SelectAllyGait({...calm,missionCombatAlert:true},{crouch:1,moveSpeedMps:.8},'RifleCrouchAdvance'),'AllyCrouchReady');
assert.equal(SelectAllyGait({...calm,missionCombatAlert:true},{},'AdvanceFire'),'AdvanceFire');
// RifleHoldRun: the calm fast run of an NRA rifleman (RifleRun above holdRunAboveMps, with hysteresis and a hold).
{
  const memory={running:false,frames:0},run=speed=>SelectAllyGait(calm,{moveSpeedMps:speed},'RifleRun',0,memory);
  const hold=ALLY_GAIT.holdRunSwitchFrames;
  assert.equal(SelectAllyGait(calm,{moveSpeedMps:3.2},'RifleRun'),'RifleRun','no memory from the caller: the feature is off');
  for(let f=0;f<hold-1;f++)assert.equal(run(3.2),'RifleRun','a pace has to hold before the switch');
  assert.equal(run(3.2),'RifleHoldRun','held fast pace becomes the hold run');
  assert.equal(run(2.45),'RifleHoldRun','no switch down inside the hysteresis band');
  for(let f=0;f<hold-1;f++)assert.equal(run(2.0+f*.02),'RifleHoldRun','one slow update does not flicker');
  assert.equal(run(2.0),'RifleRun','held slow pace returns to the production run');
  assert.equal(run(2.45),'RifleRun','no switch up inside the hysteresis band');
  assert.ok(ALLY_GAIT.holdRunBelowMps<ALLY_GAIT.holdRunAboveMps&&ALLY_GAIT.holdRunBelowMps>ALLY_GAIT.walkMaximumMps);
  const fast=()=>({running:true,frames:0});
  assert.equal(SelectAllyGait({...calm,targetVisible:true},{moveSpeedMps:3.2},'RifleRun',0,fast()),'RifleRun','threat keeps the ready run');
  assert.equal(SelectAllyGait(calm,{moveSpeedMps:3.2},'RifleRun',.4,fast()),'RifleRun','the ready hold after a threat keeps the ready run');
  assert.equal(SelectAllyGait(calm,{moveSpeedMps:3.2,crouch:1},'RifleRun',0,fast()),'RifleRun','crouching is never the hold run');
  assert.equal(SelectAllyGait(calm,{moveSpeedMps:3.2},'BackRifleRun',0,fast()),'BackRifleRun','the slung P012 march keeps its own run');
  for(const field of ['dead','carryRole','meleeCombat','prone','kneel','woundedWalk','throwing','reach','melee','binoculars'])
    assert.equal(SelectAllyGait(calm,{moveSpeedMps:3.2,[field]:1},'RifleRun',0,fast()),'RifleRun',field+' retains priority');
  for(const field of ['p012AwaitingWeapon','relaxedGait','openingActorPerformance','openingStoryboardPose','missionRescueTarget'])
    assert.equal(SelectAllyGait({...calm,[field]:true},{moveSpeedMps:3.2},'RifleRun',0,fast()),'RifleRun',field+' retains priority');
  assert.equal(SelectAllyGait({...calm,missionCombatAlert:true},{moveSpeedMps:3.2},'RifleRun',0,fast()),'RifleRun','a live mission alert keeps the ready run');
  assert.ok(HoldRunBySpeed(3.2,{running:true,frames:0}));
}
// RifleShoulderMarch: the rifle on the shoulder, only for a man the shared march layer is walking along a route (status
// 'running'), not talking, nobody in the lane behind him, at a walking pace held for marchSwitchFrames updates.
{
  const A=ALLY_GAIT,clear={...calm,missionRearGapM:99};
  const memory=(extra={})=>({running:false,frames:0,status:'running',talking:false,...extra});
  const pick=(m,speed,extra={},soldier=clear,id='RifleRun',ready=0)=>SelectAllyGait(soldier,{moveSpeedMps:speed,...extra},id,ready,null,m);
  const hold=A.marchSwitchFrames;
  assert.ok(A.marchBelowMps<A.marchAboveMps&&A.marchAboveMps<A.walkMaximumMps&&A.walkMaximumMps<A.marchHardMaxMps&&A.marchRearClearM>A.marchRearLaneM);
  assert.equal(SelectAllyGait(clear,{moveSpeedMps:1.4},'RifleRun'),'AllyCarryWalk','no memory from the caller: the march is off');
  {
    const m=memory();
    for(let f=0;f<hold-1;f++)assert.equal(pick(m,1.4),'AllyCarryWalk','a pace has to hold before the switch');
    assert.equal(pick(m,1.4),'RifleShoulderMarch','a held walking pace on the march is the shoulder march');
    assert.equal(pick(m,.95),'RifleShoulderMarch','no switch down inside the hysteresis band');
    for(let f=0;f<hold-1;f++)assert.equal(pick(m,.7+f*.001),'RifleShoulderMarch','one slow update does not flicker');
    assert.equal(pick(m,.7),'AllyCarryWalk','a held slow pace goes back to the carry walk');
    assert.equal(pick(m,.95),'AllyCarryWalk','no switch up inside the hysteresis band');
    assert.ok(MarchBySpeed(1.4,{running:true,frames:0})&&!MarchBySpeed(A.marchHardMaxMps+.1,{running:true,frames:0}),'a real run leaves the march at once');
    const m2=memory({running:true});
    assert.equal(pick(m2,3.2),'RifleRun','at a run the man runs');
    assert.equal(m2.running,false);
    assert.equal(pick(memory(),2.0),'RifleRun','above the walking band the production run stays');
  }
  const march=()=>memory({running:true});
  // what the march layer says: only 'running' is a march
  for(const status of ['waiting','starting','braking','pausing','resting','yielding','catchup','easing','arrived',null,undefined]){
    const m=march();
    m.status=status;
    assert.equal(pick(m,1.4),'AllyCarryWalk','status '+status+' is not a march');
    assert.equal(m.running,false,'the memory is let go');
  }
  assert.equal(pick(march(),1.4),'RifleShoulderMarch');
  assert.equal(pick(memory({running:true,talking:true}),1.4),'AllyCarryWalk','talking keeps the muzzle-up carry');
  // the lane behind him
  assert.equal(pick(march(),1.4,{},{...calm,missionRearGapM:A.marchRearClearM-.1}),'AllyCarryWalk','someone close behind keeps the carry');
  assert.equal(pick(march(),1.4,{},{...calm,missionRearGapM:A.marchRearClearM}),'RifleShoulderMarch');
  assert.equal(pick(march(),1.4,{},calm),'AllyCarryWalk','no rear-gap information: the conservative carry');
  assert.ok(!ShoulderMarchAllowed(calm,{status:'running',talking:false}));
  // threat, the ready hold, crouching, other base actions, every priority pose
  assert.equal(pick(march(),1.4,{},{...clear,targetVisible:true}),'RifleRun','threat keeps the ready run');
  assert.equal(pick(march(),1.4,{},clear,'RifleRun',.4),'RifleRun','the ready hold after a threat keeps the ready run');
  assert.equal(pick(march(),1.4,{},{...clear,missionCombatAlert:true}),'RifleRun','a live mission alert keeps the ready run');
  assert.equal(pick(march(),1.4,{firing:true}),'RifleRun','fire keeps the ready run');
  assert.equal(pick(march(),1.4,{crouch:1},clear,'RifleCrouchAdvance'),'AllyCrouchCarry','crouching is never the march');
  assert.equal(pick(march(),1.4,{},clear,'BackRifleRun'),'AllyCarryWalk','the slung P012 march keeps its own rule');
  assert.equal(pick(march(),0,{},clear,'AdvanceFire'),'AllyCarryStand','standing still is the carry stand');
  for(const field of ['dead','carryRole','meleeCombat','prone','kneel','woundedWalk','throwing','reach','melee','binoculars'])
    assert.equal(pick(march(),1.4,{[field]:1}),'RifleRun',field+' retains priority');
  for(const field of ['p012AwaitingWeapon','relaxedGait','openingActorPerformance','openingStoryboardPose','missionRescueTarget'])
    assert.equal(pick(march(),1.4,{},{...clear,[field]:true}),'RifleRun',field+' retains priority');
  // the lane behind a man: facing is (-sin yaw, -cos yaw), the rear is (sin yaw, cos yaw)
  assert.equal(RearGapM({x:0,z:0},0,[{x:0,z:3}]),3,'directly behind');
  assert.equal(RearGapM({x:0,z:0},0,[{x:0,z:-3}]),99,'ahead of him is not behind');
  assert.equal(RearGapM({x:0,z:0},0,[{x:A.marchRearLaneM+.1,z:3}]),99,'out of the lane');
  assert.ok(Math.abs(RearGapM({x:0,z:0},0,[{position:{x:1,z:3}}])-Math.hypot(1,3))<1e-9,'actors carry their position');
  assert.ok(Math.abs(RearGapM({x:0,z:0},Math.PI/2,[{x:3,z:0}])-3)<1e-9,'heading -x: the rear is +x');
  assert.equal(RearGapM({x:0,z:0},0,[{x:0,z:2,alive:false},{x:0,z:5}]),5,'the dead do not count');
  assert.equal(RearGapM({x:0,z:0},0,[]),99);
}
// IJA crouch gait selection by speed, with hysteresis between the creep and the crouch walk.
assert.equal(CrouchWalkBySpeed(.2,false),false);assert.equal(CrouchWalkBySpeed(1.4,false),true);
assert.equal(CrouchWalkBySpeed(.4,false),false,'no switch up inside the hysteresis band');
assert.equal(CrouchWalkBySpeed(.4,true),true,'no switch down inside the hysteresis band');
assert.ok(ALLY_GAIT.crouchSlowBelowMps<ALLY_GAIT.crouchFastAboveMps);
const glb=LoadGlb(path.join(import.meta.dirname,'Model/Character/Model_TengxianNra02.glb'));
const scene=new PoseScene(glb),skin=BuildSkin(glb);
const index=new Map(scene.nodes.map((n,i)=>[n.name.replace(/\s/g,'_'),i]));
let minFloor=Infinity,maxFloor=-Infinity,maxSeam=0;
for(const clip of data.clips){
  const channels=[];
  for(const track of clip.tracks){
    const [name,property]=track.name.split('.'),width=property==='quaternion'?4:3;
    assert.equal(track.times.at(-1),clip.duration);
    const start=track.values.slice(0,width),end=track.values.slice(-width);
    const seam=width===4?1-Math.abs(start.reduce((s,v,i)=>s+v*end[i],0)):Math.max(...start.map((v,i)=>Math.abs(v-end[i])));
    maxSeam=Math.max(maxSeam,seam);assert.ok(seam<.0001,clip.name+' loop seam '+track.name);
    if(name==='AllyRifle'){
      if(property==='quaternion')for(let i=0;i<track.values.length;i+=4){
        const muzzle=new Vector3(0,0,-1).applyQuaternion(new Quaternion().fromArray(track.values,i));
        assert.ok(muzzle.y>Math.cos(10*Math.PI/180),clip.name+' carry muzzle stays within 10 degrees of up');
      }
      continue;
    }
    assert.ok(index.has(name),'bone '+name);
    channels.push({node:index.get(name),path:property==='quaternion'?'rotation':'translation',width,input:track.times,output:track.values,interpolation:'LINEAR'});
  }
  scene.animations.push({name:clip.name,duration:clip.duration,channels});
  const leans=[];
  for(let f=0;f<25;f++){
    scene.Apply(scene.animations.length-1,clip.duration*f/25);
    const floor=MinSkinnedY(scene,skin);minFloor=Math.min(minFloor,floor);maxFloor=Math.max(maxFloor,floor);
    assert.ok(floor>-.01&&floor<.018,clip.name+' actual skinned floor '+floor);
    const hip=scene.world[index.get('Bip001_Pelvis')],neck=scene.world[index.get('Bip001_Neck')];
    leans.push(Math.atan2(neck[14]-hip[14],neck[13]-hip[13])*180/Math.PI);
    // Every bone segment remains its bind length; translations must not squash the model.
    for(const part of ['L_Thigh','R_Thigh','L_Calf','R_Calf','L_Forearm','R_Forearm']){
      const ni=index.get('Bip001_'+part),p=scene.t[ni],base=scene.baseT[ni];
      assert.ok(Math.abs(Math.hypot(...p)-Math.hypot(...base))<.003,clip.name+' segment '+part);
    }
  }
  if(clip.name.includes('Crouch')){
    assert.ok(Math.min(...leans)>12,'visible forward bend');
    assert.ok(Math.max(...leans)-Math.min(...leans)<1,'steady upper body');
  }
}
console.log(JSON.stringify({pass:true,clips:data.clips.length,minFloor,maxFloor,maxSeam}));

// A carry keeps speech's collision clearance even though it bypasses aiming.
const {InstallAllyGait}=await import('./Script_AllyGait.mjs');
const savedFetch=globalThis.fetch;
let aimCalls=0,gestureCalls=0;
try{
  const holdRunData=JSON.parse(fs.readFileSync(path.join(import.meta.dirname,'Animation/RifleHoldRun/Animation_TengxianRifleHoldRun.json')));
  assert.equal(holdRunData.revision,ALLY_GAIT.holdRunVersion,'RifleHoldRun asset cache version matches the shipped clip');
  const marchData=JSON.parse(fs.readFileSync(path.join(import.meta.dirname,'Animation/RifleShoulderMarch/Animation_TengxianRifleShoulderMarch.json')));
  assert.equal(marchData.revision,ALLY_GAIT.marchVersion,'RifleShoulderMarch asset cache version matches the shipped clip');
  globalThis.fetch=async url=>({ok:true,json:async()=>String(url).includes('RifleHoldRun')?holdRunData:String(url).includes('RifleShoulderMarch')?marchData:data});
  let baseId='AdvanceFire';
  const rig={modelId:'TengxianNra02',root:new Object3D(),clipById:new Map(),locomotion:{profiles:{}},
    _ActionForState:()=>baseId,Update(){},CanPlayInfantry:()=>true,
    speakerGesture:{active:null,pending:null,AfterActorAim(){gestureCalls++;}}};
  const actor={characterRig:rig,_UpdateInfantryProps(){},_ApplyRiggedAim(){aimCalls++;}};
  const soldier={actor};
  await InstallAllyGait(soldier);
  // The fast calm run: clip, its measured profile (model units), no weapon track left to bind, selection by speed.
  const holdClip=rig.clipById.get('RifleHoldRun');
  assert.ok(holdClip&&holdClip.tracks.length>50&&!holdClip.tracks.some(t=>t.name.startsWith('HoldRifle.')),'RifleHoldRun installed without its weapon track');
  assert.equal(rig.locomotion.profiles.RifleHoldRun.referenceMps,holdRunData.profiles.RifleHoldRun.referenceMps);
  assert.ok(rig.locomotion.profiles.RifleHoldRun.contacts.L.length&&rig.locomotion.profiles.RifleHoldRun.contacts.R.length);
  baseId='RifleRun';
  const ids=[];
  for(let f=0;f<ALLY_GAIT.holdRunSwitchFrames+2;f++)ids.push(rig._ActionForState({moveSpeedMps:3.2}));
  assert.ok(ids.includes('RifleHoldRun'));
  assert.equal(rig._ActionForState({moveSpeedMps:3.2,crouch:1}),'RifleRun');
  // The shoulder march: clip, measured profile (model units), the AllyRifle track taken off the clip for the helper, selection
  // through the real hooks (fresh march command, talking, stale command, rear gap).
  const marchClip=rig.clipById.get('RifleShoulderMarch');
  assert.ok(marchClip&&marchClip.tracks.length>100&&!marchClip.tracks.some(t=>t.name.startsWith('AllyRifle.')),'RifleShoulderMarch installed without its weapon track');
  assert.equal(rig.locomotion.profiles.RifleShoulderMarch.referenceMps,marchData.profiles.RifleShoulderMarch.referenceMps);
  assert.ok(rig.locomotion.profiles.RifleShoulderMarch.contacts.L.length&&rig.locomotion.profiles.RifleShoulderMarch.contacts.R.length);
  baseId='RifleRun';
  const marching=()=>{soldier.squadMarchCommand={controlled:true,status:'running'};soldier.missionRearGapM=99;rig.Update(1/60,{});};
  const pace=(speed,frames=ALLY_GAIT.marchSwitchFrames+2)=>{let id;for(let f=0;f<frames;f++){marching();id=rig._ActionForState({moveSpeedMps:speed});}return id;};
  assert.equal(pace(1.4),'RifleShoulderMarch','a held walking pace on the march layer');
  rig.speakerGesture.active={};
  assert.equal(pace(1.4,1),'AllyCarryWalk','a speaker gesture keeps the carry');
  rig.speakerGesture.active=null;
  assert.equal(pace(1.4,1),'AllyCarryWalk','the hold starts over after the interruption');
  assert.equal(pace(1.4),'RifleShoulderMarch');
  // a command that stops being replaced is a stale leftover (the march layer paused, or another system took the man)
  for(let f=0;f<Math.ceil(ALLY_GAIT.marchCommandFreshS*60)+3;f++)rig.Update(1/60,{});
  assert.equal(rig._ActionForState({moveSpeedMps:1.4}),'AllyCarryWalk','a stale march command is no march');
  delete soldier.squadMarchCommand;
  rig.Update(1/60,{});
  assert.equal(rig._ActionForState({moveSpeedMps:1.4}),'AllyCarryWalk','no command, no march');
  baseId='AdvanceFire';
  rig.currentId='AllyCarryStand';actor._ApplyRiggedAim({aim:1});
  assert.equal(gestureCalls,1,'dialogue still clears the placed rifle');
  assert.equal(aimCalls,0,'remembered aim does not raise the carrying arm');
  actor._ApplyRiggedAim({aim:1,firing:true});
  assert.equal(aimCalls,1,'real fire retains the original aim solver');
  // The fast calm run holds the rifle the same way: remembered aim leaves the arms alone, fire hands them to the aim layer.
  rig.currentId='RifleHoldRun';gestureCalls=0;
  actor._ApplyRiggedAim({aim:1});
  assert.equal(aimCalls,1,'remembered aim does not lift the rifle out of the hold run');
  assert.equal(gestureCalls,1,'dialogue still clears the held rifle');
  actor._ApplyRiggedAim({aim:1,firing:true});
  assert.equal(aimCalls,2,'real fire in a hold run retains the original aim solver');
  rig.currentId='RifleShoulderMarch';gestureCalls=0;
  actor._ApplyRiggedAim({aim:1});
  assert.equal(aimCalls,2,'remembered aim does not lift the rifle off the shoulder');
  assert.equal(gestureCalls,1,'dialogue still clears the carried rifle');
  actor._ApplyRiggedAim({aim:1,firing:true});
  assert.equal(aimCalls,3,'real fire on the march retains the original aim solver');
  rig.currentId='RifleRun';actor._ApplyRiggedAim({aim:1});
  assert.equal(aimCalls,4,'the production run keeps its aim layer');
}finally{globalThis.fetch=savedFetch;}
