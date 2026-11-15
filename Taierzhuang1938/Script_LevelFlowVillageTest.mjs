import assert from "node:assert/strict";
import fs from "node:fs";
import { FLOW_TIMELINE, BeatById, EvaluateFlow, DEFAULT_ENCOUNTER_DOCUMENT } from "./AdvancedTools/Script_LevelFlowModel.mjs";
import { FLOW_VILLAGE_STEALTH as PLAN } from "./AdvancedTools/Data_LevelFlow.mjs";
import { VillageStealthAt, VillageStealthRules } from "./AdvancedTools/Script_LevelFlowVillage.mjs";
import { BuildEncounterMap } from "./AdvancedTools/Script_LevelFlowMap.mjs";
import { BuildEncounterTerrain } from "./AdvancedTools/Script_LevelFlowTerrain.mjs";
import { UpgradeEncounterDocument, ValidateEncounterDocument } from "./AdvancedTools/Script_LevelFlowEncounter.mjs";

const scene = JSON.parse(fs.readFileSync(new URL("./Scenes/FirstLevelEncounter/Scene_FirstLevelEncounter.json",import.meta.url)));
const map = BuildEncounterMap(scene);
const ReadBytes = file => fs.readFileSync(new URL(`./Scenes/FirstLevelEncounter/${file}`,import.meta.url));
const terrain = BuildEncounterTerrain(scene,ReadBytes(scene.terrain.file),ReadBytes(scene.trenches.datum.file),map);
const walls = map.objects.filter(object=>object.pos && object.size && object.solid!==false && !object.hideOn && !object.showOn);
const wallBounds=walls.map(object=>({object,radius:Math.hypot(object.size[0],object.size[2])/2}));
function Inside(point, object, padding = 0) {
  const dx=point[0]-object.pos[0], dz=point[2]-object.pos[2], yaw=(object.yawDeg||0)*Math.PI/180;
  const x=dx*Math.cos(yaw)-dz*Math.sin(yaw), z=dx*Math.sin(yaw)+dz*Math.cos(yaw);
  const base=object.pos[1] ?? terrain.heightAt(object.pos[0],object.pos[2]);
  return Math.abs(x)<object.size[0]/2+padding && Math.abs(z)<object.size[2]/2+padding
    && point[1]>base && point[1]<base+object.size[1];
}
function Blocked(from,to) {
  const distance=Math.hypot(...to.map((value,axis)=>value-from[axis]));
  const candidates=wallBounds.filter(({object,radius})=>object.pos[0]+radius>=Math.min(from[0],to[0])
    && object.pos[0]-radius<=Math.max(from[0],to[0]) && object.pos[2]+radius>=Math.min(from[2],to[2])
    && object.pos[2]-radius<=Math.max(from[2],to[2])).map(entry=>entry.object);
  for(let i=1;i<distance/0.06;i++) {
    const p=from.map((value,axis)=>value+(to[axis]-value)*i*0.06/distance);
    if(terrain.heightAt(p[0],p[2])>p[1] || candidates.some(wall=>Inside(p,wall))) return true;
  }
  return false;
}
const Actor=(time,id)=>EvaluateFlow(time).actors.find(actor=>actor.id===id);
for(const beat of [BeatById("09a"),BeatById("09b")]) for(let time=beat.start;time<beat.end;time+=0.25) {
  const frame=EvaluateFlow(time);
  for(const actor of frame.actors.filter(actor=>["player","liu","nier"].includes(actor.id) || actor.groupId===PLAN.patrol.id)) {
    const p=[actor.p[0],terrain.heightAt(...actor.p)+0.55,actor.p[1]];
    const hits=walls.filter(wall=>Inside(p,wall,actor.id==="nier"?0.14:0.19));
    assert.deepEqual(hits.map(wall=>wall.id),[],`${actor.id} clears real walls/props at ${time}`);
  }
  assert.equal(frame.stealth.active,true);
}
const born=BeatById(PLAN.patrol.beat).start;
const snapshot=EvaluateFlow(born);
const player=snapshot.actors.find(actor=>actor.id==="player");
const eyes=[0.95,1.6].map(height=>[player.p[0],terrain.heightAt(...player.p)+height,player.p[1]]);
for(const enemy of snapshot.actors.filter(actor=>actor.groupId===PLAN.patrol.id)) {
  for(const eye of eyes)for(const dx of [-0.3,0,0.3])for(const h of [0.2,0.9,1.8]) {
    assert.ok(Blocked(eye,[enemy.p[0]+dx,terrain.heightAt(...enemy.p)+h,enemy.p[1]]),"patrol spawns fully concealed");
  }
}
for(const time of [BeatById("09b").start+15,BeatById("09b").start+20]) {
  for(const id of ["player","liu","nier"]) {
    const actor=Actor(time,id);
    assert.ok(Blocked([84.5,terrain.heightAt(84.5,429.5)+1.6,429.5],
      [actor.p[0],terrain.heightAt(...actor.p)+0.85,actor.p[1]]),`${id} is screened by the doorway return`);
  }
}
for(let time=BeatById("09b").start+1.8;time<BeatById("09b").start+PLAN.patrolClearSeconds;time+=0.25) {
  const frame=EvaluateFlow(time);
  for(const guard of frame.actors.filter(actor=>actor.groupId===PLAN.patrol.id)) {
    for(const id of ["player","liu","nier"]) {
      const actor=frame.actors.find(entry=>entry.id===id);
      assert.ok(Blocked([guard.p[0],terrain.heightAt(...guard.p)+PLAN.enemyEyeM,guard.p[1]],
        [actor.p[0],terrain.heightAt(...actor.p)+(id==="nier"?0.85:1.6),actor.p[1]]),
        `${id} remains concealed along the full patrol approach at ${time}`);
    }
  }
}
for(let time=BeatById("09b").start+PLAN.patrolClearSeconds;time<BeatById("09b").end;time+=0.25) {
  const frame=EvaluateFlow(time);
  for(const guard of frame.actors.filter(actor=>actor.groupId===PLAN.patrol.id)) {
    for(const id of ["player","liu","nier"]) {
      const actor=frame.actors.find(entry=>entry.id===id),dx=actor.p[0]-guard.p[0],dz=actor.p[1]-guard.p[1],distance=Math.hypot(dx,dz);
      if(distance>PLAN.detectionRangeM || -dz/distance<Math.cos(PLAN.detectionHalfAngleDeg*Math.PI/180))continue;
      assert.ok(Blocked([guard.p[0],terrain.heightAt(...guard.p)+PLAN.enemyEyeM,guard.p[1]],
        [actor.p[0],terrain.heightAt(...actor.p)+(id==="nier"?0.85:1.6),actor.p[1]]),`${id} exits behind the returned sentries at ${time}`);
    }
  }
}
for(const time of [BeatById("08c").start,BeatById("09b").start,BeatById("09i").end-1]) {
  const frame=EvaluateFlow(time),stretchers=frame.actors.filter(actor=>/^stretcher\d+$/.test(actor.id));
  assert.equal(stretchers.length,12,"all stretchers remain present while waiting");
  assert.equal(frame.actors.filter(actor=>actor.groupId==="VillageEvacuation").length,24,"carriers stay beside the wounded");
  for(const stretcher of stretchers) {
    assert.equal(stretcher.p[1],380);
    assert.ok(Blocked([100,terrain.heightAt(100,471.5)+1.4,471.5],
      [stretcher.p[0],terrain.heightAt(...stretcher.p)+0.35,380]),"wounded hidden from the main-street gun");
  }
  assert.ok(Actor(time,"donkey").tetherTo);
}
const release=BeatById("10a").start;
assert.ok(Actor(release+4.9,"donkey").tetherTo);
assert.ok(!Actor(release+5,"donkey").tetherTo,"rope is released before the cart departs");
assert.deepEqual(Actor(release,"cart").p,Actor(release+4.9,"cart").p,"cart waits for untying");
for(const time of [born,BeatById("09b").start+0.8,BeatById("09b").start+20,release+2]) {
  const frame=EvaluateFlow(time);
  EvaluateFlow(0);EvaluateFlow(BeatById("10j").end);
  assert.deepEqual(EvaluateFlow(time),frame,"seeking restores staging without stale rope, lock or patrol state");
}
assert.equal(VillageStealthAt(BeatById("09b").start+1.79,FLOW_TIMELINE).locked,true);
assert.equal(VillageStealthAt(BeatById("09b").start+1.8,FLOW_TIMELINE).locked,false);
assert.equal(VillageStealthAt(BeatById("09j").start,FLOW_TIMELINE).active,false);
const rules=new VillageStealthRules(FLOW_TIMELINE),time=BeatById("09b").start+8;
assert.equal(rules.Step({time,dt:0.5,detected:true}).alarm,false);
assert.equal(rules.Step({time,dt:0.5,detected:false}).suspicion,0,"ducking back cancels suspicion");
assert.equal(rules.Step({time,dt:0.1,fired:true}).alarm,true);
assert.equal(rules.Step({time,dt:2.4}).failed,true,"weapon event produces a readable alarm before failure");
assert.equal(rules.Step({time:BeatById("09j").start,dt:0.1}).failed,true,"crossing the attack signal cannot erase an existing alarm");
rules.Reset();
assert.equal(rules.Step({time,dt:0.1,grenade:true}).reason,"grenade");
rules.Reset();
assert.equal(rules.Step({time,dt:1.25,detected:true}).reason,"spotted");
rules.Reset();
assert.equal(rules.Step({time:BeatById("09j").start,dt:3,fired:true}).failed,false,"attack signal releases the no-fire rule");
const old=structuredClone(DEFAULT_ENCOUNTER_DOCUMENT);
old.revision="2026-11-15-street-defense-2";
old.groups=old.groups.filter(group=>group.id!==PLAN.patrol.id);
old.triggers=old.triggers.filter(trigger=>trigger.id!=="Trigger_TempleSearch");
old.groups.find(group=>group.id==="VillageGun").count=2;
const upgraded=UpgradeEncounterDocument(old,DEFAULT_ENCOUNTER_DOCUMENT);
assert.equal(upgraded.groups.find(group=>group.id==="VillageGun").count,2);
assert.ok(upgraded.groups.some(group=>group.id===PLAN.patrol.id));
const deleted=structuredClone(upgraded);
deleted.groups=deleted.groups.filter(group=>group.id!==PLAN.patrol.id);
assert.deepEqual(UpgradeEncounterDocument(deleted,DEFAULT_ENCOUNTER_DOCUMENT),deleted,"new drafts preserve deletion of the patrol");
ValidateEncounterDocument(upgraded,FLOW_TIMELINE);
const firstTemple=structuredClone(DEFAULT_ENCOUNTER_DOCUMENT);
firstTemple.revision="2026-11-15-temple-stealth-1";
firstTemple.triggers.find(trigger=>trigger.id==="Arrival_09b").area={shape:"circle",center:[80.3,424.8],size:[2.4,2.4]};
assert.deepEqual(UpgradeEncounterDocument(firstTemple,DEFAULT_ENCOUNTER_DOCUMENT).triggers.find(trigger=>trigger.id==="Arrival_09b").area,
  DEFAULT_ENCOUNTER_DOCUMENT.triggers.find(trigger=>trigger.id==="Arrival_09b").area,"earlier default drafts receive the protected cover position");
firstTemple.triggers.find(trigger=>trigger.id==="Arrival_09b").area.center=[80,425];
firstTemple.groups=firstTemple.groups.filter(group=>group.id!==PLAN.patrol.id);
const customTemple=UpgradeEncounterDocument(firstTemple,DEFAULT_ENCOUNTER_DOCUMENT);
assert.deepEqual(customTemple.triggers.find(trigger=>trigger.id==="Arrival_09b").area.center,[80,425]);
assert.ok(!customTemple.groups.some(group=>group.id===PLAN.patrol.id),"cover migration preserves custom areas and deleted groups");
console.log("ok Temple approach, walls, concealed patrol/shelters, cart handoff, stealth rules and draft migration");
