import assert from "node:assert/strict";
import {MissionReturn,NearestMissionRoutePoint} from "./Script_MissionReturn.mjs";
import {MISSION_RETURN as r} from "./Data_Tuning_FirstLevel.mjs";
import {MISSION_RETURN_ROUTES} from "./Data_FirstLevelMissionReturn.mjs";
import {MISSION_STAGES} from "./Data_FirstLevelMission.mjs";
const gate=new MissionReturn(r),base={stage:"test",position:{x:0,z:0},route:[{x:0,z:0},{x:0,z:-200}],target:{x:0,z:-200},yaw:0};
const At=(x,z,extra={})=>({...base,position:{x,z},...extra});
assert.equal(gate.Update(4,base),null,"a distant objective is reachable along its approach without false warning");
assert.equal(gate.Update(.5,At(40,0)),null,"brief combat sidestep has a dwell delay");
assert.equal(gate.Update(.8,At(40,0)).reason,"route");
assert.ok(gate.Update(.1,At(34,0)),"hysteresis keeps warning stable near threshold");
assert.equal(gate.Update(.1,At(28,0)),null,"return immediately clears state");
assert.equal(gate.Update(4,At(65,0)).urgent,true);
assert.equal(gate.Update(1,{...base,stage:"next"}),null,"phase changes reset warning and timers");
assert.equal(gate.Update(4,At(0,-100,{squad:{x:0,z:0}})).reason,"squad","on-route player can still outrun the escort");
assert.equal(gate.Update(4,At(0,-200,{squad:{x:0,z:0}})),null,"arriving at the task permits waiting for the squad");
assert.equal(gate.Update(4,At(0,-100,{person:{x:0,z:0}})).reason,"person","moving task character has an independent leash");
assert.equal(gate.Update(.1,At(0,-38,{person:{x:0,z:0}})),null);
const boundary=At(0,0,{bounds:{minX:-5,maxX:100,minZ:-300,maxZ:100}});
assert.equal(gate.Update(4,boundary).reason,"boundary");
assert.equal(gate.result.urgent,true);
assert.equal(gate.Update(.1,At(13,0,{bounds:boundary.bounds})),null,"authored exit route 18m inside bounds clears edge warning");
assert.equal(gate.Update(1,null),null,"death, scripted controls and inactive mission clear warning");
assert.equal(gate.Update(4,At(50,0)).angle,-90,"world west is screen left while facing north");
assert.equal(gate.Update(1,At(50,0,{yaw:Math.PI/2})).angle,0,"turning toward return aligns the bearing");
assert.deepEqual(NearestMissionRoutePoint({x:2,z:3},[{x:0,z:0},{x:0,z:0}]).point,{x:0,z:0});
for(const stage of MISSION_STAGES){
 const route=MISSION_RETURN_ROUTES[stage.id];
 assert.ok(route.length && route.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.z)),stage.id);
 for(const point of route){gate.Reset();assert.equal(gate.Update(5,{...base,stage:stage.id,position:point,route,target:stage.target}),null,stage.id+" route allowed");}
}
console.log("PASS mission return: detours, grace, hysteresis, squad, target arrival, bounds, lifecycle, bearings and all stage routes");
