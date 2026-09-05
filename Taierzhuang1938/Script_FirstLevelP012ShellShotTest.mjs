import assert from 'node:assert/strict';
import * as THREE from 'three';
import {FirstLevelP012ShellShot} from './Script_FirstLevelP012ShellShot.mjs';
const camera=new THREE.PerspectiveCamera(60,1.6,.1,600);camera.position.set(-49,1.62,92);camera.rotation.set(.1,.4,0);
const saved={position:camera.position.clone(),quaternion:camera.quaternion.clone(),fov:camera.fov};
let captures=0,releases=0,serial=0;const sources=new Set(),shells=[];
const host={camera,runtime:{beat:2},battlefield:{GroundHeight:()=>0},Capture:()=>captures++,Release:()=>releases++,
 vfx:{SmokeSource:()=>{sources.add(++serial);return serial;},RemoveSmokeSource:id=>sources.delete(id)},
 FireShell:(from,at,options)=>shells.push({from,at,...options,left:options.flight})};
const shot=new FirstLevelP012ShellShot(host);assert.equal(shot.Start({x:-76,z:-144}),true);
let simultaneous=0;const Tick=()=>{shot.Update(1/30);for(const shell of shells)if(shell.left>0){shell.left-=1/30;if(shell.left<=0)shell.OnImpact(shell.at);}simultaneous=Math.max(simultaneous,shells.filter(shell=>shell.left>0).length);};
for(let i=0;i<268;i++){Tick();assert.ok(camera.position.distanceTo(saved.position)<1e-9);assert.ok(camera.fov<=38);assert.ok(sources.size<=8);}
assert.ok(shot.impacts>=10&&simultaneous>=3,'many real-flight callbacks can overlap in the shot');
for(let i=0;i<4;i++)Tick();assert.equal(shot.active,false);assert.equal(releases,1);assert.ok(camera.quaternion.angleTo(saved.quaternion)<1e-7);assert.equal(camera.fov,saved.fov);
const atExit=shot.serial;for(let i=0;i<900;i++)Tick();assert.ok(shot.serial>atExit+15,'same battery continues after release while approaching');
assert.ok(sources.size>0&&sources.size<=8);host.runtime.beat=6;const atFront=shot.serial;for(let i=0;i<1500;i++)Tick();assert.equal(shot.serial,atFront);assert.equal(sources.size,0,'finite plume lifetime after reaching the front');
assert.equal(shot.Start({x:0,z:0}),false);shot.Dispose();shells[0].OnImpact(shells[0].at);assert.equal(sources.size,0);assert.equal(captures,1);assert.equal(releases,1);
console.log('PASS anchored lens, camera restore, concurrent salvos, continued approach pressure, bounded smoke, stop and disposal');
