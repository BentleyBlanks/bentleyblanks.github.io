import assert from "node:assert/strict";
import * as THREE from "three";
import { VillageStealthPlay } from "./Script_VillageStealthPlay.mjs";
import { VillageStealthRules } from "./Scenes/FirstLevelEncounter/Script_LevelFlowVillage.mjs";
import { FLOW_TIMELINE, EvaluateFlow, BeatById } from "./Scenes/FirstLevelEncounter/Script_LevelFlowModel.mjs";

const host={state:{playerShots:0,grenades:3,bundles:2},player:{
  position:new THREE.Vector3(80,0,426),velocity:new THREE.Vector3(1,0,1),eyeHeight:1.6,radius:.28,yaw:0,pitch:0,health:45,
  SetStance(value){this.stance=value;},ResetLean(){}
},battlefield:{GroundHeight:()=>0,Raycast:()=>({t:1})}};
const runtime=new VillageStealthPlay(host,new VillageStealthRules(FLOW_TIMELINE));
const start=BeatById("09b").start,entries=new Map();
let state=runtime.Update(EvaluateFlow(start+.9),.1,entries);
assert.ok(state.locked&&runtime.CapturesInput());
assert.equal(host.player.stance,"crouch");
assert.equal(host.player.velocity.length(),0);
assert.equal(host.player.health,45,"short control never respawns or heals the player");
assert.ok(Math.abs(host.player.position.z-426.28)<.01);
const controlledYaw=host.player.yaw;
host.player.yaw=2;
runtime.Update(EvaluateFlow(start+1),.1,entries);
assert.equal(host.player.yaw,controlledYaw,"mouse look cannot displace the short controlled camera");
state=runtime.Update(EvaluateFlow(start+2),.1,entries);
assert.ok(!state.locked&&!runtime.CapturesInput());
const enemy={soldier:{position:new THREE.Vector3(84.5,0,429.5),alive:true,actor:{root:{rotation:{y:0}}}},spec:{side:"ija"}};
entries.set("guard",enemy);
assert.equal(runtime.Detected(entries),false,"actual t-distance wall hit blocks sight");
host.battlefield.Raycast=()=>null;
assert.equal(runtime.Detected(entries),true,"clear enemy sight reaches the player");
state=runtime.Update(EvaluateFlow(start+3),.5,entries);
assert.equal(state.alarm,false);
host.battlefield.Raycast=()=>({t:1});
state=runtime.Update(EvaluateFlow(start+3.5),.1,entries);
assert.equal(state.suspicion,0,"returning behind real cover clears a brief glimpse");
host.state.playerShots++;
state=runtime.Update(EvaluateFlow(start+4),.1,entries);
assert.equal(state.reason,"shot");
state=runtime.Update(EvaluateFlow(start+6.5),2.4,entries);
assert.ok(state.failed);
runtime.Reset();
host.state.grenades--;
assert.equal(runtime.Update(EvaluateFlow(start+8),.1,entries).reason,"grenade");
runtime.Reset();
assert.ok(!runtime.CapturesInput());
assert.ok(!runtime.Update(EvaluateFlow(BeatById("09j").start),.1,entries).alarm);
console.log("ok real input counters, crouch pull, sight occlusion, release and alarm reset");
