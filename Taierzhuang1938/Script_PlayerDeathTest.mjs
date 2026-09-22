// Camera fixtures: stance, slope, structural floor, walls and frame-rate independence.
import assert from "node:assert/strict";
import * as THREE from "three";
import { CapturePlayerDeath, SyncPlayerDeathCamera, DeathReveal } from "./Script_PlayerDeath.mjs";

const results=[];
for(const eye of [1.62,1.05,.42]) for(const pitch of [-1.2,0,1.2])
for(const side of [-1,1]) for(const surface of ["flat","slope","platform","wall"]) {
  const GroundHeight=(x,z)=>surface==="slope"?.3*x+.2*z:0;
  const support=(x,z)=>surface==="platform"?2.5:GroundHeight(x,z);
  const camera=new THREE.PerspectiveCamera(65,16/9,.04,1000);
  camera.position.set(0,support(0,0)+eye,0);camera.rotation.set(pitch,.7,.08,"YXZ");
  const player={camera,position:new THREE.Vector3(0,support(0,0),0),deadTime:0,
    deathCameraStart:new THREE.Vector3(),rnd:()=>side<0?0:1,world:{GroundHeight},
    physics:{GroundProbe:(x,z)=>({y:support(x,z)}),Raycast:(_o,_d,length)=>surface==="wall"&&length>.10?{t:.10}:null}};
  const start=camera.position.clone(),startQ=camera.quaternion.clone();
  CapturePlayerDeath(player);SyncPlayerDeathCamera(player);
  assert.ok(camera.position.distanceTo(start)<1e-9 && camera.quaternion.angleTo(startQ)<1e-7,"death preserves the exact lethal frame");
  assert.equal(DeathReveal(player),0);
  let previous=start.clone();
  for(let frame=1;frame<=180;frame++){
    player.deadTime=frame/60;SyncPlayerDeathCamera(player);
    assert.ok(camera.position.y>=support(camera.position.x,camera.position.z)+.119,"eye stays above its actual support");
    assert.ok(camera.position.distanceTo(previous)<.16,"no camera teleport");
    previous.copy(camera.position);
  }
  const end=camera.position.clone(),endQ=camera.quaternion.clone();
  assert.ok(Math.abs(end.y-support(end.x,end.z)-.19)<1e-6,"head settles on the floor, including beside a wall");
  assert.ok(Math.abs(camera.rotation.z)>1,"held side-lying endpoint");
  assert.equal(DeathReveal(player),1);
  player.deadTime=20;SyncPlayerDeathCamera(player);
  assert.ok(camera.position.distanceTo(end)<1e-9 && camera.quaternion.angleTo(endQ)<1e-7,"no corpse drift or repeated bounce");
  for(const time of [.15,.4,.7,1,1.5]){
    player.deadTime=time;SyncPlayerDeathCamera(player);const expected=camera.position.clone();
    player.deadTime=0;SyncPlayerDeathCamera(player);
    for(let frame=1;frame<=Math.round(time*120);frame++){player.deadTime=frame/120;SyncPlayerDeathCamera(player);}
    assert.ok(camera.position.distanceTo(expected)<1e-9,"sampling is independent of frame rate");
  }
  results.push({eye,pitch,side,surface});
}
console.log(`PlayerDeathTest PASS: ${results.length} stance/aim/side/surface cases, continuous grounded fall, stable endpoint and 120 Hz agreement`);
