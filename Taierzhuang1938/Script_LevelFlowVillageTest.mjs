import assert from "node:assert/strict";
import fs from "node:fs";
import { FLOW_TIMELINE, BeatById, EvaluateFlow, DEFAULT_ENCOUNTER_DOCUMENT } from "./AdvancedTools/Script_LevelFlowModel.mjs";
import { FLOW_VILLAGE_STEALTH as PLAN } from "./AdvancedTools/Data_LevelFlow.mjs";
import { VillageStealthAt, VillageStealthRules } from "./AdvancedTools/Script_LevelFlowVillage.mjs";
import { BuildEncounterMap } from "./AdvancedTools/Script_LevelFlowMap.mjs";
import { BuildEncounterTerrain } from "./AdvancedTools/Script_LevelFlowTerrain.mjs";
import { EncounterSignals, VisibleEncounterObject } from "./AdvancedTools/Script_LevelFlowView.mjs";
import { STANCE } from "./Data_Tuning_Player.mjs";
import { UpgradeEncounterDocument, ValidateEncounterDocument } from "./AdvancedTools/Script_LevelFlowEncounter.mjs";
import { FLOW_RENDERING, FLOW_DUSK } from "./Data_Tuning_LevelFlow.mjs";
import { ApplyEncounterSky, EncounterDuskBlend } from "./AdvancedTools/Script_LevelFlowSkyBlend.mjs";
import { SCENE_EVENTS } from "./Data_SceneEvents.mjs";
import { BlockoutDocFromScene, DecodeSceneHeights } from "./Script_SceneDoc.mjs";
import { LayoutFromSceneDoc } from "./Script_EditorBlockoutLevels.mjs";

const scene = JSON.parse(fs.readFileSync(new URL("./Scenes/FirstLevelEncounter/Scene_FirstLevelEncounter.json",import.meta.url)));
const map = BuildEncounterMap(scene);
const ReadBytes = file => fs.readFileSync(new URL(`./Scenes/FirstLevelEncounter/${file}`,import.meta.url));
const terrain = BuildEncounterTerrain(scene,ReadBytes(scene.terrain.file),ReadBytes(scene.trenches.datum.file),map);
const walls = map.objects.filter(object=>object.pos && object.size && object.solid!==false && !object.hideOn && !object.showOn);
const wallBounds=walls.map(object=>({object,radius:Math.hypot(object.size[0],object.size[2])/2}));
function Inside(point, object, padding = 0, height = 0) {
  const dx=point[0]-object.pos[0], dz=point[2]-object.pos[2], yaw=(object.yawDeg||0)*Math.PI/180;
  const x=dx*Math.cos(yaw)-dz*Math.sin(yaw), z=dx*Math.sin(yaw)+dz*Math.cos(yaw);
  const base=object.pos[1] ?? terrain.heightAt(object.pos[0],object.pos[2]);
  return Math.abs(x)<object.size[0]/2+padding && Math.abs(z)<object.size[2]/2+padding
    && point[1]+height>base && point[1]<base+object.size[1];
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

const streetBeats=FLOW_TIMELINE.filter(beat=>beat.stage==="10");
const streetSolids=wallBounds.filter(({object,radius})=>object.pos[0]+radius>=96 && object.pos[0]-radius<=120
  && object.pos[2]+radius>=462 && object.pos[2]-radius<=553).map(({object})=>object);
streetSolids.push(...map.objects.filter(object=>object.solid!==false && object.pos && object.size
  && (object.hideOn || object.showOn)));
const standingHeight=STANCE.stand.eye+0.16;
let climbedWall=false, exitedSideGate=false;
for(const beat of streetBeats) {
  const index=FLOW_TIMELINE.indexOf(beat);
  assert.deepEqual(FLOW_TIMELINE[index-1].p.at(-1),beat.p[0],`${beat.id} joins incoming player route`);
  assert.deepEqual(beat.p.at(-1),FLOW_TIMELINE[index+1].p[0],`${beat.id} joins outgoing player route`);
  const steps=Math.ceil(beat.duration/0.08);
  for(let step=0;step<=steps;step++) {
    const time=beat.start+Math.min(beat.duration*step/steps,beat.duration-1e-6);
    const frame=EvaluateFlow(time);
    const player=frame.actors.find(actor=>actor.id==="player");
    const [x,z]=player.p, ground=terrain.heightAt(x,z), feet=ground+(player.elevation??0);
    const signals=EncounterSignals(frame);
    const hits=streetSolids.filter(object=>VisibleEncounterObject(object,signals)
      && Inside([x,feet+0.02,z],object,STANCE.stand.radius,standingHeight-0.02));
    assert.deepEqual(hits.map(object=>object.id),[],`${beat.id} player clears scene solids at (${x.toFixed(2)}, ${z.toFixed(2)})`);
    if(beat.id==="10i"&&Math.abs(x-114.5)<0.05) {
      if(Math.abs(z-501.3)<0.05 && feet>ground+2.2) climbedWall=true;
      if(Math.abs(z-518)<0.05 && feet===ground) exitedSideGate=true;
    }
  }
}
assert.ok(climbedWall,"10I goes up and over the east wall on the firewood route");
assert.ok(exitedSideGate,"10I returns through the side gate on the ground");
const shortcutDebris=walls.filter(wall=>wall.id.startsWith("TempleShortcutRubble"));
assert.ok(shortcutDebris.length>=3,"the annotated right-hand shortcut has visible physical collapse debris");
for(let z=421.75;z<=424.25;z+=0.1) for(const height of [0.55,1.6,2.2]) {
  const point=[67,terrain.heightAt(67,z)+height,z];
  assert.ok(shortcutDebris.some(wall=>Inside(point,wall,0.19)),"collapse seals the full alley width, including standing/jumping clearance");
}
assert.ok(shortcutDebris.every(wall=>wall.noClimb && !wall.hideOn && !wall.showOn),"the shortcut is blocked by persistent non-climbable scene geometry, not an invisible or timed wall");
assert.ok(scene.markers.some(mark=>mark.id==="LmTempleShortcutCollapse"),"the editor explains why the temple detour is necessary");
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
      const heading=guard.heading||0;
      if(distance>PLAN.detectionRangeM || (Math.sin(heading)*dx-Math.cos(heading)*dz)/distance<Math.cos(PLAN.detectionHalfAngleDeg*Math.PI/180))continue;
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
// --- Beishahe moved 360 m south: long official road, village layout, road ditch, dusk sky ---------------------------------
{
  const marker=id=>scene.markers.find(item=>item.id===id);
  const object=id=>scene.objects.find(item=>item.id===id);
  const solidsIn=(minX,maxX,minZ,maxZ)=>walls.filter(wall=>{
    const turned=Math.abs(Math.sin((wall.yawDeg||0)*Math.PI/180))>1e-3;
    const reachX=turned?Math.hypot(wall.size[0],wall.size[2])/2:wall.size[0]/2,reachZ=turned?reachX:wall.size[2]/2;
    return (wall.pos[1]===null||wall.pos[1]>=-0.5)&&Math.max(wall.size[0],wall.size[2])>=0.6&&wall.size[1]>=0.5
      &&wall.pos[0]+reachX>minX&&wall.pos[0]-reachX<maxX&&wall.pos[2]+reachZ>minZ&&wall.pos[2]-reachZ<maxZ;
  });
  assert.equal(scene.bounds.maxZ,1440,"scene runs to z1440");
  assert.equal(scene.terrain.rows,(1440+480)/0.5,"height map rows follow the new south edge");
  assert.equal(scene.trenches.datum.patches[1].minZ,1001,"village-mouth trench datum moved with the ditch");
  assert.ok(marker("LmPlank").z===1001&&marker("LmAtDitch").z>1000&&marker("LmVillage").z>1100,"village landmarks moved south by 360 m");
  assert.equal(marker("LmHechaTail").z,579,"Gengjiazhuang's ditch tail stays where the river-fork taper left it");
  const dist=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
  const line=(first,last)=>scene.ways.roads.find(road=>Math.hypot(road[0].x-first[0],road[0].z-first[1])<0.01&&Math.hypot(road.at(-1).x-last[0],road.at(-1).z-last[1])<0.01);
  const dirt=line([117,545],[92,700]),post=line([-160,610],[92,700]),official=line([92,700],[99,997]);
  assert.ok(dirt&&post&&official,"dirt road and north-west road meet at junction J(92,700); the official road runs on to the plank bridge");
  for(const road of [dirt,post,official]) for(let i=1;i<road.length;i++) assert.ok(dist(road[i-1],road[i])<=75&&road[i].z>=road[i-1].z-0.01,"roads run south with gentle bends");
  assert.ok(official.at(-1).z-official[0].z>=290,"the official road is about 300 m long");
  assert.ok(marker("LmJunction").x===92&&marker("LmJunction").z===700&&marker("LmPostRoad_1218").z===672,"junction and north-west road labels moved");
  assert.ok(["LmLoneGrave","LmRoadBarrow","LmRoadShrine","LmNorthGrave"].every(id=>marker(id)),"roadside grave, barrow, shrine and the 13 grave are labelled");
  assert.ok(scene.objects.filter(item=>/^LoneCypress_/.test(item.id)).length>=4&&scene.objects.filter(item=>/^RoadTree_/.test(item.id)).length>=6,"cypress grove and a few scattered bare trees");
  for(const seam of [590,950]) for(let x=-150;x<=300;x+=5) {
    if(x>-105&&x<-55) continue;
    for(let z=seam-3;z<seam+3;z+=0.5) assert.ok(Math.abs(terrain.heightAt(x,z+0.5)-terrain.heightAt(x,z))<0.12,`no step or cliff at the z${seam} seam (x${x}, z${z})`);
  }
  assert.ok(terrain.heightAt(-80,700)>2.4&&terrain.heightAt(-80,940)>2.4,"railway embankment runs through the new fields");
  assert.ok(terrain.heightAt(-80,640)<1,"the north-west road crosses the railway at a level crossing");
  const poles=scene.objects.filter(item=>item.meta?.pole&&item.meta?.telegraph).map(item=>item.pos[2]).sort((a,b)=>a-b);
  assert.equal(poles[0],580,"telegraph poles start at z580");
  const gaps=poles.slice(1).map((z,index)=>z-poles[index]);
  assert.ok(gaps.every(gap=>gap===35||gap===105)&&gaps.filter(gap=>gap===105).length===1,"telegraph poles stay 35 m apart; the only longer gap is the river span at the rail bridge");
  assert.ok(scene.paint.some(item=>item.id==="RailNorth"&&item.line.at(-1).z===1278),"bare railway bed paint runs up to the north");
  const church=marker("LmChurch"),gate=marker("LmChurchGate");
  assert.ok(church.x>marker("LmRoadWall").x&&church.x<marker("LmLoneYard").x-7.5&&church.z<marker("LmRoadWall").z&&church.z>marker("LmLoneYard").z-10,"church sits between the road wall and the lone yard, north of the road");
  assert.ok(gate.z>church.z+9&&Math.abs(gate.x-church.x)<0.01,"church gate opens in the south wall facing the road");
  assert.ok(church.w>=22&&church.d>=20&&object("Church_Hall")&&object("Church_Tower")&&scene.objects.filter(item=>/^Church_Wall/.test(item.id)).length>=5,"church keeps the original body inside a 22 m yard");
  assert.ok(scene.objects.every(item=>!/^Church_/.test(item.id)||Math.abs(item.pos[0]-church.x)<14&&Math.abs(item.pos[2]-church.z)<14),"no church parts remain at the old village centre");
  assert.ok(marker("LmThreshing")&&scene.objects.filter(item=>/^ThreshStack_\d$/.test(item.id)).length===2&&object("ThreshRoller")&&marker("LmWell_1"),"the old church site is a threshing floor with straw stacks and the well kept");
  const clear=(minX,maxX,minZ,maxZ)=>solidsIn(minX,maxX,minZ,maxZ).map(item=>item.id);
  assert.deepEqual(clear(92,106,1156,1174),[],"aid yard has an 18 x 14 m clear floor for straw beds");
  assert.deepEqual(clear(116.4,126.4,1158,1166),[],"the gate yard has a 10 x 8 m clear space for the donkey cart");
  assert.ok(scene.objects.filter(item=>/^AidStraw_/.test(item.id)).length>=16,"straw beds for about thirty wounded");
  assert.ok(object("AidPot")&&Math.abs(object("AidPot").pos[0]-116)<4,"a cauldron stands by the east wall");
  assert.ok(object("AidXiangThreshold")?.meta?.threshold,"the side room door has a threshold");
  const gateGap=object("AidWallE_2").pos[2]-object("AidWallE_2").size[2]/2-(object("AidWallE_1").pos[2]+object("AidWallE_1").size[2]/2);
  assert.ok(gateGap>=3&&marker("LmAidGate").x===116,"the east gate is wide enough for people carrying stretchers");
  assert.ok(marker("LmAidHoleA")&&marker("LmAidHoleB"),"two holes in the aid yard");
  const tianHole=marker("LmTianHole");
  for(const from of [{x:99,z:1166},marker("LmAidGate")]) { const range=dist(from,tianHole); assert.ok(range>=15&&range<=25,`aid yard to Tian's hole is 15–25 m (${range.toFixed(1)})`); }
  const coverBetween=scene.objects.filter(item=>item.cover&&item.pos[2]>1180&&item.pos[2]<1195&&item.pos[0]>90&&item.pos[0]<110);
  assert.ok(coverBetween.length>=4&&object("TianRoller")&&object("TianDoorStack"),"wall roots, roller and door boards give cover on the way to Tian's yard");
  assert.ok(object("AidWallS_Collapsed").size[1]<=0.7,"half of the aid yard's south wall is down");
  assert.ok(!scene.objects.some(item=>/Girl/.test(item.id+item.group))&&!scene.markers.some(item=>/Girl/.test(item.id)),"nothing is still named for the girl's house");
  assert.ok(marker("LmTianYard")&&object("TianHole_Roof")&&object("TianHouse1"),"Tian Sao's house and hole exist under the new name");
  const matHole=marker("LmMatHole"),wallStub=object("MatHomeWallE_Stub");
  assert.ok(marker("LmMatHome")&&matHole.z>marker("LmTianYard").z+15&&Math.abs(matHole.x-marker("LmTianYard").x)<20,"the mat-hole house lies directly south of Tian's yard");
  assert.ok(wallStub.size[1]<=0.7&&wallStub.pos[0]>matHole.x+5,"its east wall facing the exit path has collapsed");
  const matRoll=object("MatHole_MatRoll");
  const eye=[121,terrain.heightAt(121,matHole.z)+1.6,matHole.z],target=[matRoll.pos[0],matRoll.pos[1]+.08,matRoll.pos[2]];
  assert.ok(!Blocked(eye,target),"the mat over the hole is visible from the exit path across the collapsed wall");
  assert.ok(terrain.heightAt(matHole.x,matHole.z)<-1.5&&terrain.heightAt(tianHole.x,tianHole.z)<-1.5&&terrain.heightAt(97,1192.9)>0,"holes are dug at the new places and the old one is filled");
  for(const id of ["OverturnedCart","OverturnedCartWheel"]) assert.equal(object(id).showOn,"AidCartBurned",`${id} appears only after the aid-station cart burns`);
  assert.ok(SCENE_EVENTS.AidCartBurned.label==="救护所的车烧了"&&SCENE_EVENTS.GuandaoBridgeBlown.label==="官道桥炸了");
  assert.ok(scene.objects.filter(item=>item.hideOn==="GuandaoBridgeBlown").length>=3&&scene.objects.filter(item=>item.showOn==="GuandaoBridgeBlown").length>=3,"the Guandao bridge has whole and broken states");
  assert.equal(scene.objects.filter(item=>/^VillageLight_(AidGateN|AidGateS|AidYard|ChurchGateW|ChurchGateE|TianGate|MatHome)$/.test(item.id)).length,7,"lanterns at the aid station, church gate and village doors");
  const ditch=scene.trenches.segments.find(item=>item.id==="RoadDitchNorthBank");
  assert.ok(ditch&&ditch.look==="scrape"&&ditch.collapses.length>=2&&ditch.depthAlong.every(([,depth])=>Math.abs(depth-0.7)<0.01),"0.7 m scrape ditch with two entrances");
  assert.ok(Math.abs(ditch.points[0][0]-116)<3&&ditch.points[0][1]>1210&&ditch.points.at(-1)[0]<-55,"the ditch runs from the exit path to the bridge bank");
  let ditched=0;
  for(let i=1;i<ditch.points.length-1;i++) {
    const [x,z]=ditch.points[i];
    if(Math.max(terrain.heightAt(x,z-3.4),terrain.heightAt(x,z+3.4))-terrain.heightAt(x,z)>0.45) ditched++;
  }
  assert.ok(ditched>=ditch.points.length-3,"the dug ditch is about 0.7 m deep along the road");
  const daySun=[...FLOW_RENDERING.sky.sunDirection],dayAmbient=FLOW_RENDERING.lighting.ambient;
  assert.equal(EncounterDuskBlend(800),0);assert.equal(EncounterDuskBlend(960),1);assert.equal(EncounterDuskBlend(NaN),0);
  const middle=EncounterDuskBlend((FLOW_DUSK.fromZ+FLOW_DUSK.toZ)/2);assert.ok(middle>0.3&&middle<0.7,"mid-band focus is half way between day and dusk");
  ApplyEncounterSky(1100);
  assert.ok(FLOW_RENDERING.sky.sunDirection[0]<-0.9&&FLOW_RENDERING.sky.sunDirection[1]>0.1&&FLOW_RENDERING.sky.sunDirection[2]>0&&FLOW_RENDERING.sky.horizon===FLOW_DUSK.sky.horizon&&FLOW_RENDERING.lighting.direct===FLOW_DUSK.lighting.direct,"far south: dusk sky, the sun low in the west, dusk light balance");
  ApplyEncounterSky(890);
  assert.ok(FLOW_RENDERING.skyBlend>0&&FLOW_RENDERING.skyBlend<1&&FLOW_RENDERING.sky.horizon!==FLOW_DUSK.sky.horizon,"the transition band blends the sky");
  ApplyEncounterSky(300);
  assert.deepEqual(FLOW_RENDERING.sky.sunDirection,daySun);assert.equal(FLOW_RENDERING.lighting.ambient,dayAmbient);assert.equal(FLOW_RENDERING.skyBlend,0,"north of the band the day sky is restored exactly");
}
// Beishahe detail acceptance: test the empty space a person actually uses, not
// merely whether a named box exists in the document.
{
  const rooms=scene.objects.filter(object=>object.meta?.room?.center);
  assert.equal(rooms.length,70,"all village, aid-station, church and roadside house masses have interiors");
  for(const room of rooms) {
    const {center,floorY,size}=room.meta.room;
    const ownWalls=scene.objects.filter(object=>object.meta?.roomId===room.id);
    for(const height of [.4,1.5])assert.ok(!ownWalls.some(wall=>Inside([center[0],floorY+height,center[1]],wall)),`${room.id} has clear interior volume`);
    assert.ok(size[1]>=2.7);
    const roof=scene.objects.find(object=>object.id===room.meta.room.roofId);
    assert.ok(roof&&Math.abs(roof.pos[1]-(floorY+size[1]))<.03,`${room.id} roof meets the walls without a floating daylight gap`);
    const apertures=room.meta.openings;
    assert.ok(apertures.some(opening=>opening.kind==="door"),`${room.id} has an actual entrance`);
    for(const opening of apertures) {
      const yaw=opening.yawDeg*Math.PI/180;
      for(const offset of [-.25,0,.25]) {
        const point=[opening.p[0]+Math.sin(yaw)*offset,opening.y+opening.h/2,opening.p[1]+Math.cos(yaw)*offset];
        assert.ok(!ownWalls.some(wall=>Inside(point,wall)),`${opening.id} remains open through the wall thickness`);
      }
    }
  }
  const shelters=scene.objects.filter(object=>object.meta?.shelter);
  assert.deepEqual(shelters.map(object=>object.meta.holeRoof).sort(),["AidHoleA","AidHoleB","BombedHole","MatHole","TianHole"],
    "only the five individually authored story shelters remain");
  assert.ok(!scene.objects.some(object=>object.id.startsWith("VillageShelter_")));
  assert.ok(!scene.markers.some(marker=>marker.id.startsWith("LmVillageShelter_")));
  for(const [x,z] of [[67.9,1036.5],[138,1040],[188,1151]]) {
    assert.ok(terrain.heightAt(x,z)>-.35,"ordinary courtyards have a connected, restored ground surface");
  }
  for(const roof of shelters) {
    const {x,z,w,d,yaw,floorY,run}=roof.meta.shelter,a=yaw*Math.PI/180;
    assert.ok(Math.abs(terrain.heightAt(x,z)-floorY)<.08,`${roof.id} has a genuinely excavated floor`);
    assert.ok(roof.pos[1]-floorY>=2,`${roof.id} has usable headroom`);
    const ownWalls=walls.filter(object=>object.id.startsWith(roof.meta.holeRoof+'_'));
    let previous=null;
    for(let distance=0;distance<=d/2+run;distance+=.15) {
      const point=[x+Math.sin(a)*distance,z+Math.cos(a)*distance],ground=terrain.heightAt(...point);
      if(previous!==null)assert.ok(Math.abs(ground-previous)<.4,`${roof.id} entrance slope has no impassable step`);
      previous=ground;
      assert.ok(!ownWalls.some(wall=>Inside([point[0],ground+1.6,point[1]],wall)),`${roof.id} entrance has head clearance`);
    }
    assert.ok(w>=2.2);
  }
  // The rescue, return and departure all pass through the east mouth. Cutting a
  // room must not leave the old straight-line actor path crossing its sidewall.
  for(const beatId of ['14c','14d','14e','16c']) {
    const beat=BeatById(beatId);
    for(let time=beat.start;time<beat.end;time+=.2) {
      const player=Actor(time,'player'),[x,z]=player.p;
      if(Math.hypot(x-100,z-1189.6)>8)continue;
      assert.ok(!walls.filter(wall=>wall.id.startsWith('TianHole_')).some(wall=>Inside([x,terrain.heightAt(x,z)+1.3,z],wall)),`${beatId} uses the real shelter entrance at ${time}`);
    }
  }
  assert.equal(scene.markers.find(marker=>marker.id==='LmTianHole').name,'田嫂家的避机洞');
  assert.ok(scene.markers.filter(marker=>marker.kind==='hole'&&marker.z>1000).length>=5,'each main shelter has an entrance annotation');
  assert.equal(scene.objects.find(object=>object.id==='Encounter_MatHomeSheet').showOn,'MatHomeCovered');
  assert.ok(EvaluateFlow(BeatById('16c').end-.1).signals.includes('MatHomeCovered'),'the fifth-draft event really closes the mat');
  assert.ok(!EvaluateFlow(BeatById('16c').start).signals.includes('MatHomeCovered'),'seeking before the action reopens the entrance');
  assert.equal(map.labels.filter(label=>label.detail).length>300,true,'close-view aperture labels use the authored openings');
}
{
  const water=scene.objects.find(object=>object.id==="SandRiverSurface");
  const rows=water.meta.waterRibbon;
  const widths=rows.map(([,north,south])=>south-north);
  const surfaceY=water.pos[1]+water.size[1];
  assert.ok(Math.min(...widths)<2 && Math.max(...widths)>4 && Math.max(...widths)<6,"low water changes width along exposed sand");
  assert.ok(!scene.objects.some(object=>object.id.startsWith("SandRiverWater_")),"the shallow strip replaces overlapping water boxes");
  const checkRows=rows.filter(([x])=>x>-152&&x<312);
  for(const [x,north,south] of checkRows) {
    const mid=(north+south)/2;
    const depth=surfaceY-terrain.heightAt(x,mid);
    assert.ok(depth>.045&&depth<.5,`sand river center is wet and shallow at x=${x}, depth=${depth}`);
    assert.ok(terrain.heightAt(x,north-4)>surfaceY&&terrain.heightAt(x,south+4)>surfaceY,`sand banks are exposed at x=${x}`);
  }
  const doc=BlockoutDocFromScene(scene,DecodeSceneHeights(ReadBytes(scene.terrain.file),scene.terrain),{
    level:"FirstLevel",region:{minX:-100,maxX:260,minZ:1180,maxZ:1360},
  });
  const layout=LayoutFromSceneDoc(doc);
  const inPlay=layout.blocks.find(object=>object.id===water.id);
  assert.deepEqual(inPlay.waterRibbon,rows,"Play receives the same connected cross-sections as the editor");
  assert.ok(inPlay.solid===false&&inPlay.semantic==="water");
}
console.log("ok Temple approach, walls, concealed patrol/shelters, cart handoff, stealth rules and draft migration");
