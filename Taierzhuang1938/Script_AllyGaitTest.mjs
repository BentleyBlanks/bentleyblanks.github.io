import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {Object3D, Quaternion, Vector3} from 'three';
import { ALLY_GAIT } from './Data_Tuning_AllyGait.mjs';
import { SelectAllyGait, AllyGaitThreat, CrouchWalkBySpeed } from './Script_AllyGaitPolicy.mjs';
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
  globalThis.fetch=async()=>({ok:true,json:async()=>data});
  const rig={modelId:'TengxianNra02',root:new Object3D(),clipById:new Map(),locomotion:{profiles:{}},
    _ActionForState:()=> 'AdvanceFire',Update(){},CanPlayInfantry:()=>true,
    speakerGesture:{AfterActorAim(){gestureCalls++;}}};
  const actor={characterRig:rig,_UpdateInfantryProps(){},_ApplyRiggedAim(){aimCalls++;}};
  await InstallAllyGait({actor});
  rig.currentId='AllyCarryStand';actor._ApplyRiggedAim({aim:1});
  assert.equal(gestureCalls,1,'dialogue still clears the placed rifle');
  assert.equal(aimCalls,0,'remembered aim does not raise the carrying arm');
  actor._ApplyRiggedAim({aim:1,firing:true});
  assert.equal(aimCalls,1,'real fire retains the original aim solver');
}finally{globalThis.fetch=savedFetch;}
