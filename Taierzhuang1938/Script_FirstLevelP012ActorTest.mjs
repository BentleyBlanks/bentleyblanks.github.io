// Execute production AI spawn/combat entry points with lightweight host stubs.
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { CHAPTER } from "./Data_MissionCh1.mjs";
import { ApplyP012CastAppearance, P012_CAST_CLOTH_COLORS, P012_UNIFORM_MATERIAL_NAME } from "./Script_FirstLevelP012CastAppearance.mjs";
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
