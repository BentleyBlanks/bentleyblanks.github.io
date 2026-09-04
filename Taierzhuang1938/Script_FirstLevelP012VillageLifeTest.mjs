// Behavioural lifecycle and swept WORLD-space geometry, no renderer/source regex.
import assert from "node:assert/strict";
import {FirstLevelP012VillageLife} from "./Script_FirstLevelP012VillageLife.mjs";
import {P012VillageWorkerTargets} from "./Script_FirstLevelP012VillagePose.mjs";
import {P012_VILLAGE_LIFE as config,P012_VILLAGE_LIFE_PEOPLE as people,P012_VILLAGE_LIFE_BLOCKS as props} from "./Data_FirstLevelP012VillageLife.mjs";
import {FIRST_LEVEL_P012_LAYOUT as layout,P012_ROUTES as routes} from "./Data_FirstLevelP012Layout.mjs";
function Hits(p,b,r){const c=Math.cos(b.ry||0),s=Math.sin(b.ry||0),dx=p.x-b.x,dz=p.z-b.z;return Math.hypot(Math.max(0,Math.abs(dx*c-dz*s)-b.w/2),Math.max(0,Math.abs(dx*s+dz*c)-b.d/2))<r;}
function Sweep(route,r,blocks){for(let i=1;i<route.length;i++){const a=route[i-1],b=route[i],n=Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/.1);for(let j=0;j<=n;j++){const p={x:a.x+(b.x-a.x)*j/n,z:a.z+(b.z-a.z)*j/n};assert.ok(!blocks.some(block=>Hits(p,block,r)),`blocked ${JSON.stringify(p)} r${r}: ${blocks.filter(block=>Hits(p,block,r)).map(b=>b.id)}`);}}}
const solids=layout.blocks.filter(b=>b.solid!==false&&b.y-b.h/2<1.8&&b.h>.2);
for(const person of people){
 assert.ok(!solids.some(block=>block.id!==person.seatId&&Hits(person,block,person.bodyRadius)),`${person.id} in wall`);
 if(person.seatId)assert.equal(solids.filter(block=>block.id===person.seatId&&Hits(person,block,.1)).length,1,"seated wounded has one real support, not a duplicate body inside a wall");
}
Sweep(config.telephoneRoute,.43,solids);Sweep(config.muleRoute,1.05,solids);
for(const route of [routes.north,routes.south,routes.retreat])Sweep(route,1.3,props.filter(b=>b.y-b.h/2<1.8));
let spawned=0,removed=0,visible=false,blocked=false;const poses=[],signals=[],family={id:"OriginalFamilyActor",x:-32,z:46};
const host={Spawn:spec=>({...spec,serial:spawned++}),Position:actor=>({x:actor.x,z:actor.z}),ExistingFamilyActor:(id,slot)=>id===config.familyId&&slot===config.familySlot?family:null,IsVisible:()=>visible,Signal:name=>signals.push(name),Remove:()=>removed++,Pose:(actor,state)=>poses.push({id:actor.id,...state}),WorkerWork:(spec,door)=>P012VillageWorkerTargets(spec,door,()=>0),Move:(actor,target,speed,dt)=>{if(blocked)return;const d=Math.hypot(target.x-actor.x,target.z-actor.z),t=Math.min(1,speed*dt/d);if(d){actor.x+=(target.x-actor.x)*t;actor.z+=(target.z-actor.z)*t;}},MoveProp:(from,to,radius,turn)=>blocked?{...from,yaw:turn.fromYaw}:{...to,yaw:turn.toYaw}};
const life=new FirstLevelP012VillageLife(host);assert.equal(life.Start(),true);assert.equal(life.Start(),false);assert.equal(spawned,5);
for(let i=0;i<100;i++)life.Update(.1);assert.equal(life.Snapshot().door.state,"waiting");assert.equal(life.Snapshot().mule.travel,0);
visible=true;for(let i=0;i<45;i++)life.Update(.1);let snap=life.Snapshot();assert.equal(snap.door.state,"lowering");assert.ok(snap.door.rotationX<0&&snap.door.rotationX>-Math.PI/2);assert.ok(poses.some(p=>p.doorWork?.state==="lowering"));
assert.ok(poses.filter(p=>p.id==="VillageTelephoneSoldier").every(p=>p.reach===0),"telephone locomotion must not be overridden by AttackCommand");
assert.ok(!props.some(p=>p.id.startsWith("VillageWoundedSeat")),"ground-sitting wounded must not intersect a bench");
blocked=true;const before=life.Snapshot();for(let i=0;i<10;i++)life.Update(.1);snap=life.Snapshot();assert.deepEqual(snap.mule.position,before.mule.position);assert.deepEqual(snap.telephone.position,before.telephone.position);blocked=false;
for(let i=0;i<1800;i++)life.Update(.1);snap=life.Snapshot();assert.equal(snap.door.state,"stretcherReady");assert.equal(snap.door.rotationX,-Math.PI/2);assert.equal(snap.mule.state,"arrived");assert.equal(snap.telephone.state,"arrived");assert.ok(snap.telephone.position.z<config.telephoneRoute[0].z);assert.ok(snap.mule.position.z<config.muleRoute[0].z);
for(let i=1;i<snap.telephone.wire.length;i++)assert.ok(Math.hypot(snap.telephone.wire[i].x-snap.telephone.wire[i-1].x,snap.telephone.wire[i].z-snap.telephone.wire[i-1].z)<.53,"wire leaves no gaps/jumps");
assert.deepEqual(snap.telephone.wire.at(-1),snap.telephone.position);family.z+=2;assert.equal(life.Snapshot().cart.position.z,family.z);assert.equal(life.Snapshot().cart.actorId,family.id);assert.equal(spawned,5);assert.equal(new Set(signals).size,5);assert.equal(signals.length,5);
life.Dispose();life.Dispose();assert.equal(removed,5);assert.equal(life.Start(),false);
console.log("PASS P012 village finite cast, door work/lowering/lashing, collision-gated northbound logistics, continuous wire, original-family cart and route clearance");

// Actual GLB bone axes + actual sampled clip tracks; no invented skeleton.
import fs from "node:fs";
import {InstallP012VillagePose} from "./Script_FirstLevelP012VillagePose.mjs";
const threeSource=fs.readFileSync(new URL("./vendor/three/build/three.core.js",import.meta.url),"utf8");
const THREE=await import(`data:text/javascript;base64,${Buffer.from(threeSource).toString("base64")}`);
for(let variant=1;variant<=5;variant++){
 const bytes=fs.readFileSync(new URL(`./Model/Character/Model_LugouNra0${variant}.glb`,import.meta.url));
 const jsonLength=bytes.readUInt32LE(12),g=JSON.parse(bytes.subarray(20,20+jsonLength).toString()),binary=20+jsonLength+8;
 const nodes=g.nodes.map(spec=>{const node=new THREE.Bone();node.name=spec.name||"";if(spec.translation)node.position.fromArray(spec.translation);if(spec.rotation)node.quaternion.fromArray(spec.rotation);if(spec.scale)node.scale.fromArray(spec.scale);if(spec.matrix){node.matrix.fromArray(spec.matrix);node.matrix.decompose(node.position,node.quaternion,node.scale);}return node;});
 g.nodes.forEach((spec,index)=>(spec.children||[]).forEach(child=>nodes[index].add(nodes[child])));
 const root=new THREE.Group(),rigRoot=new THREE.Group();root.add(rigRoot);rigRoot.rotation.y=Math.PI;
 g.scenes[g.scene||0].nodes.forEach(index=>rigRoot.add(nodes[index]));
 const bones={};for(const side of ["L","R"])for(const [role,label] of [["upperArm","UpperArm"],["forearm","Forearm"],["hand","Hand"]])bones[role+side]=nodes.find(node=>node.name===`Bip002 ${side} ${label}`);
 const Read=index=>{const a=g.accessors[index],view=g.bufferViews[a.bufferView],size={SCALAR:1,VEC3:3,VEC4:4}[a.type];assert.equal(a.componentType,5126);return Array.from({length:a.count*size},(_,i)=>bytes.readFloatLE(binary+(view.byteOffset||0)+(a.byteOffset||0)+Math.floor(i/size)*(view.byteStride||size*4)+(i%size)*4));};
 let tracks=[],sampleTime=0;
 const rig={root:rigRoot,bones,Update(){for(const {node,path,interpolant} of tracks)node[path].fromArray(interpolant.evaluate(sampleTime));root.updateWorldMatrix(true,true);}};
 const original=rig.Update,actor={root,characterRig:rig},adapter=InstallP012VillagePose(actor);assert.ok(adapter);assert.equal(InstallP012VillagePose(actor),adapter);
 const changed=new Set([bones.upperArmL,bones.forearmL,bones.upperArmR,bones.forearmR]);
 for(const clipName of ["AttackCommand","CrouchIdle","RifleRun"]){
  const clip=g.animations.find(a=>a.name===clipName);tracks=clip.channels.map(channel=>{const s=clip.samplers[channel.sampler],path={rotation:"quaternion",translation:"position",scale:"scale"}[channel.target.path],track=new(path==="quaternion"?THREE.QuaternionKeyframeTrack:THREE.VectorKeyframeTrack)("fixture",Read(s.input),Read(s.output));return{node:nodes[channel.target.node],path,interpolant:track.createInterpolant()};});
  for(const yaw of [0,Math.PI/2])for(sampleTime of [0,.2,.5]){
   root.rotation.y=yaw;adapter.SetTargets(null);rig.Update(.016,{});
   const baseline=nodes.map(node=>({q:node.quaternion.toArray(),p:node.position.toArray(),s:node.scale.toArray(),world:node.matrixWorld.toArray()}));
   const forward=new THREE.Vector3(0,0,-1).applyQuaternion(root.quaternion),targets={};
   for(const [side,label] of [["left","L"],["right","R"]]){const shoulder=bones[`upperArm${label}`].getWorldPosition(new THREE.Vector3()),target=shoulder.clone().addScaledVector(forward,.32);target.y-=clipName==="CrouchIdle"?.27:.15;targets[side]={x:target.x,y:target.y,z:target.z};}
   adapter.SetTargets(targets);rig.Update(.016,{});
   for(const hand of adapter.Snapshot().hands){assert.ok(hand.residual<.0001,`${variant}/${clipName}/${yaw} true palm reaches work target: ${hand.residual}`);assert.equal(hand.unreachable,false);}
   nodes.forEach((node,index)=>{assert.deepEqual(node.position.toArray(),baseline[index].p);assert.deepEqual(node.scale.toArray(),baseline[index].s);if(!changed.has(node))assert.deepEqual(node.quaternion.toArray(),baseline[index].q);if(/Pelvis|Thigh|Calf|Foot|Toe/.test(node.name))assert.deepEqual(node.matrixWorld.toArray(),baseline[index].world,"work never alters root/legs/run tracks");});
   adapter.SetTargets(null);rig.Update(.016,{});nodes.forEach((node,index)=>assert.deepEqual(node.quaternion.toArray(),baseline[index].q,"exact mixer pose restored"));
  }
 }
 for(const suffix of ["A","B"])for(let tick=0;tick<=100;tick++){
  const progress=tick/100,door={position:{x:-36.9,z:53.7+progress*.7},height:1.15-progress*.55,rotationX:-Math.PI/2*progress,progress};
  const work=P012VillageWorkerTargets({id:`Worker${suffix}`},door,()=>0),workClip=work.crouch?"CrouchIdle":"AttackCommand",clip=g.animations.find(a=>a.name===workClip);
  tracks=clip.channels.map(channel=>{const s=clip.samplers[channel.sampler],path={rotation:"quaternion",translation:"position",scale:"scale"}[channel.target.path],track=new(path==="quaternion"?THREE.QuaternionKeyframeTrack:THREE.VectorKeyframeTrack)("fixture",Read(s.input),Read(s.output));return{node:nodes[channel.target.node],path,interpolant:track.createInterpolant()};});
  root.position.set(work.position.x,0,work.position.z);root.rotation.y=work.yaw;sampleTime=progress;
  adapter.SetTargets(work.targets);rig.Update(.016,{});
  for(const hand of adapter.Snapshot().hands){assert.equal(hand.unreachable,false,`work ${variant}/${suffix}/${progress} ${hand.side} stays within real arm length`);assert.ok(hand.residual<.012,`work ${variant}/${suffix}/${progress} ${hand.side} residual ${hand.residual}`);}
  const dx=Math.abs(work.position.x-door.position.x);assert.ok(dx>.515+work.bodyRadius,"worker torso stays outside rotating board width");
  for(const postX of [-38.05,-35.75])assert.ok(Math.hypot(Math.max(0,Math.abs(work.position.x-postX)-.08),Math.max(0,Math.abs(work.position.z-53.5)-.11))>work.bodyRadius,"worker body stays outside door frame posts");
 }
 adapter.SetTargets({left:{x:100,y:1,z:100},right:{x:100,y:1,z:100}});rig.Update(.016,{});assert.ok(adapter.Snapshot().hands.every(hand=>hand.unreachable&&hand.residual>1));
 adapter.Dispose();adapter.Dispose();assert.equal(rig.Update,original);assert.equal(adapter.Snapshot().active,false);
}
console.log("PASS village work IK: five actual GLBs, three sampled clips, -Z/two world yaws, real palm target residuals, unchanged legs and exact restoration/disposal");
