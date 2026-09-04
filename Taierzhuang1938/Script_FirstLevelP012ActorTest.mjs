// Execute production AI spawn/combat entry points with lightweight host stubs.
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { CHAPTER } from "./Data_MissionCh1.mjs";
import { ApplyP012CastAppearance, InstallP012OpeningPose, P012_CAST_CLOTH_COLORS, P012_UNIFORM_MATERIAL_NAME } from "./Script_FirstLevelP012CastAppearance.mjs";
const threeSource = fs.readFileSync(new URL("./vendor/three/build/three.core.js", import.meta.url), "utf8");
const THREE = await import(`data:text/javascript;base64,${Buffer.from(threeSource).toString("base64")}`);

// Read the real GLB primitive/material separation, not invented clothing names.
assert.deepEqual(Object.keys(P012_CAST_CLOTH_COLORS).sort(), [...CHAPTER.roster].sort());
assert.equal(new Set(Object.values(P012_CAST_CLOTH_COLORS)).size, 5);
for (let variant = 1; variant <= 5; variant++) {
  const buffer = fs.readFileSync(new URL(`./Model/Character/Model_LugouNra0${variant}.glb`, import.meta.url));
  const gltf = JSON.parse(buffer.subarray(20, 20 + buffer.readUInt32LE(12)).toString());
  const uniformIndex = gltf.materials.findIndex((item) => item.name === P012_UNIFORM_MATERIAL_NAME);
  assert.ok(uniformIndex >= 0);
  const uniform = gltf.materials[uniformIndex];
  const texture = gltf.textures[uniform.pbrMetallicRoughness.baseColorTexture.index];
  const imageIndex = texture.source ?? texture.extensions.EXT_texture_webp.source;
  assert.match(gltf.images[imageIndex].name, /国名党男/);
  const shared = gltf.materials.map((item) => {
    const material = new THREE.MeshStandardMaterial({ color: 0x667788 });
    material.name = item.name; material.map = new THREE.Texture();
    // Production lighting uniforms can hold circular references; copying an
    // individual colour must not JSON-clone live shared lighting state.
    material.userData.liveUniform = {}; material.userData.liveUniform.self = material.userData.liveUniform;
    return material;
  });
  const MakeActor = () => {
    const root = new THREE.Group();
    for (const mesh of gltf.meshes) for (const primitive of mesh.primitives) {
      const object = new THREE.Mesh(new THREE.BufferGeometry(), shared[primitive.material]);
      object.userData.characterPbrSurface = true; root.add(object);
    }
    // An attached gun deliberately sharing the name must still be excluded.
    const weapon = new THREE.Mesh(new THREE.BufferGeometry(), shared[uniformIndex]); root.add(weapon);
    return { characterRig: { root }, disposed: false, Dispose() { this.disposed = true; } };
  };
  const ordinary = MakeActor();
  const originalColors = shared.map((material) => material.color.getHex());
  assert.equal(ApplyP012CastAppearance({ castId: "ordinary", actor: ordinary }), false);
  const allClones = new Set();
  for (const [castId, color] of Object.entries(P012_CAST_CLOTH_COLORS)) {
    const actor = MakeActor(), originals = actor.characterRig.root.children.map((item) => item.material);
    const configured = [];
    assert.equal(ApplyP012CastAppearance({ castId, actor }, { ConfigureExternalPbr(material) { configured.push(material); } }), true);
    assert.equal(ApplyP012CastAppearance({ castId, actor }), false, "idempotent application");
    assert.equal(configured.length, 1, "one private clone per source uniform");
    const clone = configured[0]; assert.ok(!allClones.has(clone)); allClones.add(clone);
    assert.equal(clone.color.getHex(), color); assert.equal(clone.map, null);
    actor.characterRig.root.children.forEach((object, index) => {
      const changed = object.userData.characterPbrSurface && originals[index] === shared[uniformIndex];
      assert.equal(object.material, changed ? clone : originals[index], "skin/head/badge/gun stay original");
    });
    let disposals = 0; clone.addEventListener("dispose", () => disposals++);
    actor.Dispose(); actor.Dispose(); assert.equal(disposals, 1); assert.equal(actor.disposed, true);
  }
  assert.deepEqual(shared.map((material) => material.color.getHex()), originalColors);
  assert.ok(shared.every((material) => material.map), "shared albedo maps retained");
  ordinary.characterRig.root.children.forEach((object) => assert.ok(shared.includes(object.material)));
}
console.log("PASS P012 five real roster colours, all five GLB uniform partitions, private material/disposal and unchanged skin/guns/defaults");
// Reconstruct the real GLB hierarchy and sample its actual animation accessors.
// No invented joint axes or T-pose is substituted for the rifle animations.
for(let variant=1;variant<=5;variant++){
 const bytes=fs.readFileSync(new URL(`./Model/Character/Model_LugouNra0${variant}.glb`,import.meta.url));
 const jsonLength=bytes.readUInt32LE(12),g=JSON.parse(bytes.subarray(20,20+jsonLength).toString()),binary=20+jsonLength+8;
 const nodes=g.nodes.map(spec=>{const node=new THREE.Bone();node.name=spec.name||"";
  if(spec.translation)node.position.fromArray(spec.translation);if(spec.rotation)node.quaternion.fromArray(spec.rotation);
  if(spec.scale)node.scale.fromArray(spec.scale);if(spec.matrix){node.matrix.fromArray(spec.matrix);node.matrix.decompose(node.position,node.quaternion,node.scale);}return node;});
 g.nodes.forEach((spec,i)=>(spec.children||[]).forEach(child=>nodes[i].add(nodes[child])));
 const root=new THREE.Group();g.scenes[g.scene||0].nodes.forEach(i=>root.add(nodes[i]));
 const bones={};for(const side of ["L","R"])for(const [role,label] of [["upperArm","UpperArm"],["forearm","Forearm"],["hand","Hand"]])bones[role+side]=nodes.find(n=>n.name===`Bip002 ${side} ${label}`);
 const Read=index=>{const a=g.accessors[index],v=g.bufferViews[a.bufferView],size={SCALAR:1,VEC3:3,VEC4:4}[a.type];assert.equal(a.componentType,5126);
  return Array.from({length:a.count*size},(_,i)=>bytes.readFloatLE(binary+(v.byteOffset||0)+(a.byteOffset||0)+Math.floor(i/size)*(v.byteStride||size*4)+(i%size)*4));};
 let tracks=[],sampleTime=0;
 const rig={root,bones,Update(){for(const {node,path,interpolant} of tracks)node[path].fromArray(interpolant.evaluate(sampleTime));root.updateWorldMatrix(true,true);}};
 const soldier={actor:{root,characterRig:rig},p012AwaitingWeapon:false};
 assert.equal(InstallP012OpeningPose(soldier),true);assert.equal(InstallP012OpeningPose(soldier),false);
 const changed=new Set([bones.upperArmL,bones.forearmL,bones.upperArmR,bones.forearmR]);
 for(const clipName of ["AdvanceFire","RifleRun"]){
  const clip=g.animations.find(a=>a.name===clipName);
  tracks=clip.channels.map(channel=>{const s=clip.samplers[channel.sampler],path={rotation:"quaternion",translation:"position",scale:"scale"}[channel.target.path];
   const track=new (path==="quaternion"?THREE.QuaternionKeyframeTrack:THREE.VectorKeyframeTrack)("fixture",Read(s.input),Read(s.output));
   return {node:nodes[channel.target.node],path,interpolant:track.createInterpolant()};});
  for(sampleTime of [0,.2,.5]){
   soldier.p012AwaitingWeapon=false;rig.Update(.016,{});
   const baseline=nodes.map(n=>({q:n.quaternion.toArray(),p:n.position.toArray(),s:n.scale.toArray(),world:n.matrixWorld.toArray()}));
   soldier.p012AwaitingWeapon=true;rig.Update(.016,{moveSpeed:3.05});
   nodes.forEach((n,i)=>{assert.deepEqual(n.position.toArray(),baseline[i].p);assert.deepEqual(n.scale.toArray(),baseline[i].s);
    if(!changed.has(n))assert.deepEqual(n.quaternion.toArray(),baseline[i].q,"only four arm joints are modified");
    if(/Pelvis|Thigh|Calf|Foot|Toe/.test(n.name))assert.deepEqual(n.matrixWorld.toArray(),baseline[i].world,"hips, legs and actual feet remain unchanged");});
   for(const side of ["L","R"])for(const [a,b] of [[bones[`upperArm${side}`],bones[`forearm${side}`]],[bones[`forearm${side}`],bones[`hand${side}`]]]){
    const direction=b.getWorldPosition(new THREE.Vector3()).sub(a.getWorldPosition(new THREE.Vector3())).normalize();
    assert.ok(direction.y<-.95,`${variant}/${clipName}: real empty arm points naturally downward`);
   }
   soldier.p012AwaitingWeapon=false;rig.Update(.016,{});
   nodes.forEach((n,i)=>assert.deepEqual(n.quaternion.toArray(),baseline[i].q,"issuing the rifle restores untouched animation without a pose residue"));
  }
 }
}
console.log("PASS P012 opening empty arms: five real GLBs/two actual clips, untouched pelvis/legs/feet and exact equipped pose restoration");
const mainAppearanceSource = fs.readFileSync(new URL("./Script_Main.mjs", import.meta.url), "utf8").replace(/\r/g, "");
assert.match(mainAppearanceSource, /if \(phase\.whitebox\?\.p012\) \{\n\s+for \(const actor of ai\.soldiers\)[\s\S]*?ApplyP012CastAppearance\(actor, library\);/);
assert.equal((mainAppearanceSource.match(/ApplyP012CastAppearance\(actor, library\)/g) || []).length, 1, "only the P012 setup opts in");
const source=fs.readFileSync(new URL("./Script_Ai.mjs",import.meta.url),"utf8").replace(/\r/g,"");
function Method(name){return source.match(new RegExp(`  ${name}\\([^\\n]*\\{[\\s\\S]*?\\n  }\\n`))[0];}
let serial=0;
class SoldierStub {constructor(side,options){this.id=serial++;this.side=side;this.alive=true;this.weaponId=options.weapon||"HanYang";this.weapon={};this.position={x:options.x,z:options.z,y:0};}}
const calls=[];
const hit=vm.runInNewContext(`({${Method("TakeHit")}})`,{Clamp01:(n)=>Math.min(1,Math.max(0,n))}).TakeHit;
for(const essential of [false,true]){
 const casualty={alive:true,health:20,suppression:0,scriptEssential:essential,Kill(){this.alive=false;return true;}};
 assert.equal(hit.call(casualty,100,"head",null),!essential);
 assert.equal(casualty.alive,essential);assert.equal(casualty.suppression,.45);
 if(essential){assert.equal(casualty.health,1);casualty.Kill();assert.equal(casualty.alive,false,"explicit scripted death remains possible");}
}
const context={Soldier:SoldierStub,WEAPONS:{},CAPSULE:[{radius:0.34,height:1.78}],SQUAD_SIZE:6,SQUAD_SLOTS:Array.from({length:6},()=>({role:"rifleman"}))};
context.COMBAT={suppressDecayPerS:0.1};context.STATE={VAULT:"vault",ADVANCE:"advance",RELOAD:"reload",FIRE:"fire",IDLE:"idle"};
const methods=vm.runInNewContext(`({${Method("Spawn")},${Method("TryFire")},${Method("TryBayonet")},${Method("Think")},${Method("ApplyScriptDefense")},${Method("ScriptFireFactors")}})`,context);
const host={aliveCount:0,maxAlive:32,insideWalls:null,spawnSerial:{nra:0,ija:0},soldiers:[],ctx:{battlefield:{GroundHeight:()=>0},scene:{add(){}},actorFactory:{Create(kind,options){calls.push({kind,...options});return {kind,variant:options.variant||null,root:{position:{copy(){}}}};}}}};
for(const variant of ["male","female"]){const actor=methods.Spawn.call(host,"nra",0,0,{actorKind:"civilian",actorVariant:variant,unarmed:true});assert.equal(actor.unarmed,true);assert.equal(actor.actorKind,"civilian");assert.equal(actor.actorVariant,variant);assert.ok(actor.weapon);assert.equal(calls.at(-1).weapon,null);}
const bearer=methods.Spawn.call(host,"nra",0,0,{unarmed:true,escortRole:"bearer"});assert.equal(bearer.actorKind,"nra");assert.equal(bearer.escortRole,"bearer");assert.equal(calls.at(-1).weapon,null);
const ordinary=methods.Spawn.call(host,"nra",0,0,{});assert.equal(ordinary.unarmed,false);assert.equal(calls.at(-1).weapon,"HanYang");assert.equal(ordinary.actorKind,"nra");
const unarmed=new Proxy({unarmed:true},{get(target,key){if(key!=="unarmed")throw new Error(`unarmed combat touched ${String(key)}`);return target[key];}});
methods.TryFire.call({},unarmed,1,null);methods.TryBayonet.call({},unarmed,1,null);
const soldier={unarmed:false,meleeTimer:2,bayonetFixed:false};methods.TryBayonet.call({},soldier,0.5,null);assert.equal(soldier.meleeTimer,1.5);
const evacuee={scriptedNoncombatant:true,state:"fire",suppression:1,target:{},cover:{},bayonetFixed:true,aimBlend:1};
methods.Think.call({},evacuee,0.1,null);assert.equal(evacuee.state,"advance");assert.equal(evacuee.target,null);assert.equal(evacuee.cover,null);assert.equal(evacuee.bayonetFixed,false);
const defender={state:"charge",order:"charge",cover:{x:100,z:0},bayonetFixed:true,ammo:5,target:{},weapon:{reloadTimeS:3.2}};
methods.ApplyScriptDefense(defender);assert.equal(defender.state,"fire");assert.equal(defender.order,"hold");assert.equal(defender.cover,null);assert.equal(defender.bayonetFixed,false);
defender.ammo=0;methods.ApplyScriptDefense(defender);assert.equal(defender.state,"reload");assert.equal(defender.reloadTimer,3.2);
assert.equal(methods.ScriptFireFactors({}).accuracy,1);assert.equal(methods.ScriptFireFactors({}).interval,1);
assert.equal(methods.ScriptFireFactors({scriptAccuracyScale:0.2}).accuracy,0.2);assert.equal(methods.ScriptFireFactors({scriptFireIntervalScale:3}).interval,3);
console.log("PASS P012 actual spawn identity forwarding, no visual gun, combat hard guards, unchanged armed defaults");

// Run the production spawn and stance-body seams: physics receives the same
// seeded Actor dimensions at free-space search, construction and every resize.
context.CAPSULE.push({ radius: .34, height: 1.21 }, { radius: .42, height: .58 });
const bodyMethods = vm.runInNewContext(`({${Method("StepBody")},${Method("Blocked")}})`,
  { ...context, TRAVERSAL: { stepMax: .55 } });
const eye = vm.runInNewContext(`({${Method("static StanceEye").replace("static ", "")}})`, context).StanceEye;
for (const variant of ["male", "female", "childBoy", "childGirl"]) {
  for (const height of [1.075, 1.165]) {
    const child = variant.startsWith("child"), observed = [];
    const childHost = { ...host, soldiers: [], spawnSerial: { nra: 0, ija: 0 }, ctx: { ...host.ctx,
      physics: {
        FindFreeSpot(x,z,r,h) { observed.push(["find",r,h]); return {x:x+1,z,y:2}; },
        MakeCharacter(spec) { observed.push(["make",spec.radius,spec.height]); return {
          ReconcileTo() {}, SetSize(r,h) { observed.push(["resize",r,h]); },
          Move() { return {x:1,y:2,z:0,grounded:true}; },
        }; },
      },
      actorFactory: { Create(kind, options) { return { kind, variant: options.variant,
        isChild: child, height, bodyRadius:.24, root:{position:{copy(){}}} }; } },
    } };
    const actor = methods.Spawn.call(childHost,"nra",0,0,{actorKind:"civilian",actorVariant:variant});
    assert.deepEqual(observed.slice(0,2), [["find",child?.24:.34,child?height:1.78],["make",child?.24:.34,child?height:1.78]]);
    assert.equal(actor.position.x,1,"resolved free-space point reaches the actor, not its original blocked point");
    actor.position = new THREE.Vector3(1,2,0); actor.grounded=true;
    for (const stance of [0,1,2]) {
      actor.stance=stance; bodyMethods.StepBody.call(childHost,actor,0,0,1/60);
      const cap=actor.childCapsules?.[stance] || context.CAPSULE[stance];
      assert.deepEqual(observed.at(-1),["resize",cap.radius,cap.height]);
      if(child) assert.ok(Math.abs(2*Math.max(.02,cap.height/2-cap.radius)+2*cap.radius-cap.height)<1e-9,"Rapier actual capsule height matches child stance");
      const expectedEye=([1.5,1,.5][stance])*(child?height/1.78:1);
      assert.equal(eye(stance,actor),expectedEye); assert.equal(eye(stance,{ref:actor}),expectedEye);
    }
  }
}
const overhead={ctx:{battlefield:{NearbyColliders:()=>[{min:[-.5,1.3,-.5],max:[.5,2,.5]}]}}};
assert.equal(bodyMethods.Blocked.call(overhead,0,0,0),true,"adult fallback still blocks under adult-height obstruction");
assert.equal(bodyMethods.Blocked.call(overhead,0,0,0,{radius:.24,height:1.1}),false,"child fallback uses the same shorter clearance");
console.log("PASS child seeded capsule search/create/three stances, true total height, LOS eyes and unchanged adult defaults");

// Execute the actual Act movement block, including blocked body feedback. A
// physical stop stays a stop; neither this fixture nor the policy teleports.
const movement=source.slice(source.indexOf("    // P012 route followers"),source.indexOf("    let targetYaw = null;"));
assert.ok(movement.includes("this.StepBody"));
const ActMovement=vm.runInNewContext(`(function(s,dt){let desired=s.goal,speed=2.6,stepped=false,wantedYaw=0;${movement}return {stepped,wantedYaw};})`,
 {Clamp01:value=>Math.max(0,Math.min(1,value))});
function FollowMovement(guided,configuredSpeed){
 let blocked=true,randomCalls=0,vaultCalls=0;
 const actor={p012Guided:guided,scriptMoveSpeedMps:configuredSpeed,position:new THREE.Vector3(),goal:new THREE.Vector3(0,0,-8),
  scriptArrivalRadius:.1,stance:0,detourTime:2,detourYaw:Math.PI/2,detourSign:1,stuckTime:0,rnd:()=>{randomCalls++;return .5;}};
 const moves=[],host={ctx:{nav:null},StepBody(s,dx,dz){moves.push({dx,dz,blocked});if(!blocked){s.position.x+=dx;s.position.z+=dz;}},TryVault(){vaultCalls++;return false;}};
 for(let i=0;i<20;i++)ActMovement.call(host,actor,.05);
 assert.equal(actor.position.length(),0,"blocked body never bypassed");
 blocked=false;for(let i=0;i<10;i++)ActMovement.call(host,actor,.05);
 return {actor,randomCalls,vaultCalls,moves};
}
const guided=FollowMovement(true,1);
assert.equal(guided.randomCalls,0);assert.equal(guided.vaultCalls,0);assert.equal(guided.actor.detourTime,0);
assert.ok(guided.moves.every(move=>Math.abs(move.dx)<1e-12&&move.dz<0));
assert.ok(guided.actor.position.z<-.49&&Math.abs(guided.actor.position.x)<1e-12,"resume toward same visible goal, never sideways detour");
for(const [flag,speed] of [[false,1],[true,undefined]]){
 const ordinary=FollowMovement(flag,speed);
 assert.ok(ordinary.randomCalls>0&&ordinary.vaultCalls>0,"ordinary or incompletely opted-in actor keeps random detour and vault attempts");
 assert.ok(ordinary.moves.some(move=>Math.abs(move.dx)>.001));
}
const waiting=FollowMovement(true,0);
assert.equal(waiting.actor.position.length(),0);assert.equal(waiting.actor.detourTime,0);
console.log("PASS actual AI Act: P012 swept follower stops/resumes without stale/random detour or vault; default actors retain both");
