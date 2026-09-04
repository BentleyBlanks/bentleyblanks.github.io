// Execute production AI spawn/combat entry points with lightweight host stubs.
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
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
