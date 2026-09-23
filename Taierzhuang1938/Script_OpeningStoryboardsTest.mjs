import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import { OPENING_STORYBOARDS as C } from "./Data_OpeningStoryboards.mjs";
const Read=file=>fs.readFileSync(new URL(file,import.meta.url));
const Hash=bytes=>crypto.createHash("sha256").update(bytes).digest("hex");
const manifest=JSON.parse(Read("Animation/OpeningStoryboards/Data_OpeningStoryboardsAnimation.json"));
const RIGS=["LugouNra02","LugouNra05","LugouIja01","LugouIja02","LugouIja03"];
assert.equal(manifest.version,C.version);
assert.deepEqual(manifest.models.map(row=>row.id),RIGS);

// ---- contract §5.4: the frozen clip names -------------------------------------------------
const FROZEN_AUTHORED=["WoundedSitRifleIdle","BanterLaugh","BanterLookShoulder","BanterPatRifle","WoundedRiseWall",
  "BlastSlamBuried","IjaDragCollarFromDirt","IjaPullArm","CaptiveDraggedFromDirt","CaptiveKneelMud","CaptiveWallBrace",
  "IjaHairGrabPull","CaptiveHeadPulledBack","IjaDrawBayonet","IjaThroatSlash","CaptiveThroatCut","CaptiveClutchThroat",
  "CaptiveWallSlideTwitch","IjaWipeSheathBayonet","IjaReadyRifle","IjaCornerFire","IjaJunctionPeek","IjaSlingRifle",
  "IjaCollarDragSnag","IjaKickBeam","IjaButtStrike","IjaHoldCollarUp","InterpreterCrouchAsk","InterpreterGrabCollar",
  "InterpreterFlee","LuoDadaoChopRear","IjaChoppedFallWall","HeDadaoParryChop","IjaParriedChoppedFall","LuoDragToCover",
  "HeSwapDadaoRifle","LuoKneelCheck"];
const FROZEN_REUSED=["ClipLoad","MessengerReport","CollarControl","CollarDrag","BayonetClearWood","ButtThreat","CreepDadao",
  "DadaoHeavy","RifleDeflect","DadaoParry","KickRifle","GuardTurn","PointBlockade","InterrogateCrouch","InterpreterPoint",
  "DeathCollapseA","DeathCollapseB","DeathCollapseC","DeathCollapseD",
  "IjaKickPrisoner","IjaShoveForward","IjaTauntGesture","CaptiveKneelFlinch","CaptiveShovedStumble"];
const CAPTIVES_REUSED=["IjaBayonetGuard","CaptiveStandToKneel","CaptiveHandsUpWalk","CaptiveKneelPlead"];
assert.deepEqual([...C.clips.authored].sort(),[...FROZEN_AUTHORED].sort(),"Data_OpeningStoryboards lists the §5.4 clips");
assert.deepEqual([...C.clips.reused].sort(),[...FROZEN_REUSED].sort(),"Data_OpeningStoryboards lists the §5.4 reuse");
const NEW=[...C.clips.authored,...C.clips.added];
for(const id of NEW){
  const spec=manifest.clips[id];
  assert.ok(spec&&!spec.legacy,`${id}: authored row in the manifest`);
  assert.ok(Array.isArray(spec.rigs)&&spec.rigs.length&&spec.rigs.every(rig=>RIGS.includes(rig)),`${id}: rigs`);
  assert.ok(spec.rigs.includes(spec.rig),`${id}: canonical rig ${spec.rig} is baked`);
  assert.equal(typeof spec.role,"string",`${id}: role`);
  assert.equal(typeof spec.notes,"string",`${id}: notes`);
  assert.equal(typeof spec.rootMotion,"boolean",`${id}: rootMotion flag`);
  for(const list of ["next","prev"])for(const other of spec[list]||[])
    assert.ok(manifest.clips[other]||FROZEN_REUSED.includes(other)||CAPTIVES_REUSED.includes(other),`${id}.${list}: ${other}`);
  for(const contact of spec.contacts||[]){
    assert.ok(Number.isFinite(contact.t)&&contact.t>=0&&contact.t<=spec.duration+1e-6,`${id}: contact time ${contact.t}`);
    assert.ok(typeof contact.limb==="string"||typeof contact.by==="string",`${id}: contact names a limb or the partner`);
    assert.equal(typeof contact.action,"string",`${id}: contact action`);
  }
  for(const event of spec.events||[])assert.ok(Number.isFinite(event.t)&&event.t<=spec.duration+1e-6&&typeof event.kind==="string",`${id}: event`);
  if(spec.holdLoop)assert.ok(spec.holdLoop[0]>=0&&spec.holdLoop[1]<=spec.duration+1e-6&&spec.holdLoop[1]>spec.holdLoop[0],`${id}: holdLoop`);
  if(spec.additive)assert.ok(spec.additive.bones.length>0&&typeof spec.additive.reference==="string",`${id}: additive mask`);
  for(const [key,metres] of Object.entries(spec.env||{}))assert.ok(/^wall(Behind|Left|Right)M$/.test(key)&&metres>0&&metres<1.5,`${id}: env ${key}`);
}

// ---- paired staging: every actor of a stage plays a clip on the rig the stage names, and a
// grab/cut/shove written on one side is written on the other at the same stage time ---------
for(const [name,stage] of Object.entries(manifest.stages)){
  assert.ok(stage.actors[stage.anchor],`${name}: anchor is one of the actors`);
  for(const [role,actor] of Object.entries(stage.actors)){
    assert.ok([actor.x,actor.z,actor.yawDeg].every(Number.isFinite),`${name}.${role}: placement`);
    if(role==="shunzi"&&actor.rig==null&&actor.clip==null)continue;   // the first-person player: placement only
    assert.ok(RIGS.includes(actor.rig),`${name}.${role}: rig`);
    const spec=manifest.clips[actor.clip];
    assert.ok(spec,`${name}.${role}: ${actor.clip} is in the manifest`);
    assert.ok((spec.rigs||RIGS).includes(actor.rig),`${name}.${role}: ${actor.clip} is baked on ${actor.rig}`);
  }
}
const ONSETS=new Set(["grab","cut","shove","parry"]);   // (the wipe lands on a corpse that has stopped moving)
let paired=0;const missing=[];
for(const id of NEW){
  const spec=manifest.clips[id],stage=manifest.stages[spec.stage];
  for(const contact of spec.contacts||[]){
    // Onsets only (a grab, a cut, a shove, a parry); holds and releases are the same contact continuing.
    if(!ONSETS.has(contact.action)||!contact.partnerRole||!contact.part||!stage?.actors[contact.partnerRole]||!stage.actors[spec.role])continue;
    const me=stage.actors[spec.role],other=stage.actors[contact.partnerRole],partner=manifest.clips[other.clip];
    const at=contact.t+(me.offsetS||0)-(other.offsetS||0);
    const match=(partner.contacts||[]).find(row=>row.by===spec.role&&row.part===contact.part&&Math.abs(row.t-at)<=1/24+1e-6);
    if(!match)missing.push(`${id} ${contact.action} ${contact.part} at ${contact.t}s is not mirrored on ${other.clip}`);
    paired++;
  }
}
assert.deepEqual(missing,[],"paired contacts share their onset time");
assert.ok(paired>=8,`paired contacts cross-checked: ${paired}`);

// ---- baked rigs --------------------------------------------------------------------------
let frames=0,clipCount=0;
const assets=new Map();
for(const row of manifest.models){
  const bytes=Read("Animation/OpeningStoryboards/"+row.file),asset=JSON.parse(bytes);
  assets.set(row.id,asset);
  assert.equal(Hash(bytes),row.sha256,`${row.id}: manifest matches baked bytes`);
  assert.equal(Hash(Read(`Model/Character/Model_${row.id}.glb`)),asset.originalModelSha256,`${row.id}: original rig unchanged`);
  assert.equal(asset.modelId,row.id);assert.equal(asset.stride,7);assert.equal(asset.fps,manifest.fps);
  const stride=asset.bones.length*7,reports=new Map((row.clips||[]).map(report=>[report.clip,report]));
  for(const [id,spec] of Object.entries(manifest.clips)){
    const clip=asset.clips[id];
    if(!(spec.rigs||RIGS).includes(row.id)){assert.ok(!clip,`${row.id}: ${id} is only baked on the rigs it is cast on`);continue;}
    assert.ok(clip,`${row.id}: ${id}`);assert.equal(clip.duration,spec.duration);
    assert.equal(clip.frameCount,Math.ceil(spec.duration*asset.fps-1e-9)+1,`${row.id}/${id}: frame count`);
    assert.equal(clip.values.length,clip.frameCount*stride);
    assert.ok(clip.values.every(Number.isFinite),`${row.id}/${id}: finite transforms`);
    for(let i=0;i<clip.values.length;i+=7){
      const q=clip.values.slice(i+3,i+7);assert.ok(Math.abs(Math.hypot(...q)-1)<.003,`${row.id}/${id}: unit quaternion`);
    }
    if(clip.loop)assert.deepEqual(clip.values.slice(0,stride),clip.values.slice(-stride),`${id}: seamless loop`);
    for(const name of spec.props||[]){
      const track=clip.props?.[name];
      assert.ok(track&&track.stride===10&&track.values.length===clip.frameCount*10&&track.values.every(Number.isFinite),`${row.id}/${id}: ${name} track`);
    }
    if(spec.player){
      assert.equal(clip.player?.fps,12,`${row.id}/${id}: first-person partner track`);
      for(const values of Object.values(clip.player.parts))assert.equal(values.length,(Math.round(spec.duration*12)+1)*3);
    }
    if(!spec.legacy){
      // Bake validation (runtime metres): planted feet hold, hands meet what they touch, the
      // body stays out of the walls it is authored against, the hips never pop, no NaN.
      const report=reports.get(id);
      assert.ok(report,`${row.id}/${id}: validation report`);
      assert.equal(report.finite,true,`${row.id}/${id}: finite`);
      assert.ok(report.footSlideM<=.02,`${row.id}/${id}: planted foot slides ${report.footSlideM} m`);
      assert.ok(report.contactErrorM<=.03,`${row.id}/${id}: contact error ${report.contactErrorM} m`);
      assert.ok(!(report.wallPenetrationM>.03),`${row.id}/${id}: wall penetration ${report.wallPenetrationM} m`);
      assert.ok(report.pelvisMaxStepM<=.2,`${row.id}/${id}: pelvis moves ${report.pelvisMaxStepM} m in one frame`);
      assert.ok(report.root?.start.length===4&&report.root.end.length===4,`${row.id}/${id}: root start/end`);
      if(!spec.rootMotion)assert.ok(Math.hypot(report.root.end[0]-report.root.start[0],report.root.end[1]-report.root.start[1])<.25,
        `${row.id}/${id}: an in-place clip keeps its hips over the root`);
    }
    frames+=clip.frameCount;clipCount++;
  }
}
// Reused from other libraries.
const captives=JSON.parse(Read("Animation/MachineGunCaptives/Data_MachineGunCaptivesAnimation.json"));
const captiveClips=new Map(captives.models.map(row=>[row.id,JSON.parse(Read("Animation/MachineGunCaptives/"+row.file)).clips]));
for(const id of ["IjaKickPrisoner","IjaShoveForward","IjaTauntGesture","CaptiveKneelFlinch","CaptiveShovedStumble"])
  for(const rig of id.startsWith("Ija")?["LugouIja01","LugouIja02"]:["LugouNra02"])assert.ok(captiveClips.get(rig)?.[id],`${rig}: reused ${id}`);
const melee=String(Read("Animation/Melee/Data_MeleeNraAnimations.json"));
for(const id of ["DadaoHeavy","DadaoParry"])assert.ok(melee.includes(`"${id}"`),`melee library: ${id}`);
assert.ok(String(Read("Script_CharacterModel.mjs")).includes("DeathCollapseA"),"Kimodo death collapses");

// ---- chains authored to hand over on the same root without a blend -------------------------
const HandOver=(asset,a,ia,b,ib)=>{
  const stride=asset.bones.length*7,A=asset.clips[a],B=asset.clips[b];
  const x=A.values.slice((ia<0?A.frameCount+ia:ia)*stride),y=B.values.slice((ib<0?B.frameCount+ib:ib)*stride);
  let angle=0,offset=0;
  for(let i=0;i<stride;i+=7){
    const dot=Math.abs(x[i+3]*y[i+3]+x[i+4]*y[i+4]+x[i+5]*y[i+5]+x[i+6]*y[i+6]);
    angle=Math.max(angle,2*Math.acos(Math.min(1,dot))*180/Math.PI);
    offset=Math.max(offset,Math.hypot(x[i]-y[i],x[i+1]-y[i+1],x[i+2]-y[i+2]));
  }
  return {angle,offset};
};
const comrade=assets.get("LugouNra02");
for(const [a,ia,b,ib] of [["WoundedSitRifleIdle",0,"BanterPatRifle",0],["BanterPatRifle",-1,"WoundedSitRifleIdle",0],
  ["WoundedSitRifleIdle",0,"WoundedRiseWall",0],["WoundedRiseWall",-1,"BlastSlamBuried",0],["BlastSlamBuried",-1,"CaptiveDraggedFromDirt",0],
  ["CaptiveWallBrace",-1,"CaptiveKneelMud",0],["CaptiveKneelMud",0,"CaptiveHeadPulledBack",0],["CaptiveHeadPulledBack",-1,"CaptiveThroatCut",0],
  ["CaptiveThroatCut",-1,"CaptiveClutchThroat",0],["CaptiveClutchThroat",0,"CaptiveWallSlideTwitch",0]]){
  const {angle,offset}=HandOver(comrade,a,ia,b,ib);
  assert.ok(angle<2&&offset<.01,`${a}@${ia} hands over to ${b}@${ib} (${angle.toFixed(2)} deg, ${offset.toFixed(4)} source units)`);
}

const p=C.positions;
assert.ok(p.interrogator.x<p.interrogated.x&&p.interpreterNear.x>p.interrogated.x,"V3: interrogator left, interpreter right");
assert.ok(p.march.every(point=>Number.isFinite(point.x)&&Number.isFinite(point.z)));
assert.ok(p.march[2].z>p.march[0].z,"follow-up enemies advance south toward the dugout");
assert.ok(Math.hypot(p.guardNear.x-p.luoAmbush.x,p.guardNear.z-p.luoAmbush.z)<1,"dadao ambush within physical reach");
assert.ok(Math.hypot(p.rifleEnd.x-p.rescued.x,p.rifleEnd.z-p.rescued.z)<1.5,"kicked rifle within pickup reach");
const returnRoute=[p.pullEnd,...C.pullReturnWaypoints,p.luoPull];
let progress=0,minimum=Infinity;
for(let i=1;i<returnRoute.length;i++){
  const a=returnRoute[i-1],b=returnRoute[i],length=Math.hypot(b.x-a.x,b.z-a.z);
  for(let d=0;d<=length;d+=.02){
    const t=d/length,distance=Math.hypot(a.x+(b.x-a.x)*t-p.rescued.x,a.z+(b.z-a.z)*t-p.rescued.z);
    assert.ok(distance>=Math.hypot(p.pullEnd.x-p.rescued.x,p.pullEnd.z-p.rescued.z)-.001,"release never moves the leader closer through the player");
    if(progress+d>=C.walkMps*.2)minimum=Math.min(minimum,distance);
  }
  progress+=length;
}
assert.ok(minimum>.7,"after the first 0.2s of release, the return path keeps the two body capsules separate");
console.log(`ok opening storyboards: five original rigs, ${clipCount} rig clips (${NEW.length} authored 2026-09-23, ${paired} paired contacts cross-checked), ${frames} normalized frames, V3 cast and pickup placement`);
