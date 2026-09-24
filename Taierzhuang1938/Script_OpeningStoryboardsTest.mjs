import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import { OPENING_STORYBOARDS as C } from "./Data_OpeningStoryboards.mjs";
import { OpeningHoldTime } from "./Script_OpeningProps.mjs";
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
  // A hold window that ends before the clip does (LuoKneelCheck's release and rise) needs a way out
  // of the loop: the manifest says how (holdExit) and the runtime plays on after pose.holdUntil.
  if(spec.holdLoop&&spec.holdLoop[1]<spec.duration-1e-6){
    assert.equal(typeof spec.holdExit,"string",`${id}: the part after the hold window (${spec.holdLoop[1]}-${spec.duration} s) has an exit`);
    const [h0,h1]=spec.holdLoop,span=h1-h0;
    assert.ok(Math.abs(OpeningHoldTime(spec.holdLoop,spec.duration,h1+.3)-(h0+.3))<1e-9,`${id}: loops without holdUntil`);
    const release=h1+span*1.5,looped=OpeningHoldTime(spec.holdLoop,spec.duration,release);
    assert.ok(Math.abs(OpeningHoldTime(spec.holdLoop,spec.duration,release+.2,release)-(looped+.2))<1e-9,`${id}: holdUntil plays on from the loop`);
    assert.equal(OpeningHoldTime(spec.holdLoop,spec.duration,release+span+spec.duration,release),spec.duration,`${id}: reaches the end after holdUntil`);
  }
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
      // Knees planted on the ground hold (kneeling clips declare the windows).
      assert.ok(!(report.kneeSlideM>.02),`${row.id}/${id}: planted knee slides ${report.kneeSlideM} m`);
      // Declared wall contacts (a back against the trench wall, a shoulder slammed into it): the
      // named skin region stays on the wall for the whole window -- at most 3 cm off it, at most
      // 3 cm into it.
      const walls=(spec.contacts||[]).filter(c=>c.target==="wall"&&c.action!=="release");
      if(walls.length){
        assert.equal(report.wallContacts?.length,walls.length,`${row.id}/${id}: every wall contact is measured`);
        for(const [limb,t0,t1,gap,low] of report.wallContacts){
          assert.ok(gap<=.03,`${row.id}/${id}: ${limb} ${t0}-${t1} s stands ${gap} m off the wall`);
          assert.ok(low>=-.03,`${row.id}/${id}: ${limb} ${t0}-${t1} s is ${-low} m inside the wall`);
        }
      }
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
// Prop tracks at the hand-over (glTF scene space, source metres): the weapon and the bayonet
// continue where they were (a jump here is a blade teleporting in the fist).
const PropJump=(asset,a,ia,b,ib)=>{
  let worst=0;
  for(const name of ["weapon","bayonet","beam","rifle"]){
    const A=asset.clips[a].props?.[name],B=asset.clips[b].props?.[name];
    if(!A||!B)continue;
    const fa=ia<0?asset.clips[a].frameCount+ia:ia,fb=ib<0?asset.clips[b].frameCount+ib:ib;
    const x=A.values.slice(fa*10,fa*10+10),y=B.values.slice(fb*10,fb*10+10);
    if(!x[9]&&!y[9])continue;
    worst=Math.max(worst,Math.hypot(x[0]-y[0],x[1]-y[1],x[2]-y[2]));
    assert.equal(x[9],y[9],`${a}->${b}: ${name} visibility continues`);
  }
  return worst;
};
const comrade=assets.get("LugouNra02"),ijaA=assets.get("LugouIja02");
let chains=0;
for(const [asset,a,ia,b,ib] of [[comrade,"WoundedSitRifleIdle",0,"BanterPatRifle",0],[comrade,"BanterPatRifle",-1,"WoundedSitRifleIdle",0],
  [comrade,"WoundedSitRifleIdle",0,"WoundedRiseWall",0],[comrade,"WoundedRiseWall",-1,"BlastSlamBuried",0],[comrade,"BlastSlamBuried",-1,"CaptiveDraggedFromDirt",0],
  [comrade,"CaptiveWallBrace",-1,"CaptiveKneelMud",0],[comrade,"CaptiveKneelMud",0,"CaptiveHeadPulledBack",0],[comrade,"CaptiveHeadPulledBack",-1,"CaptiveThroatCut",0],
  [comrade,"CaptiveThroatCut",-1,"CaptiveClutchThroat",0],[comrade,"CaptiveClutchThroat",0,"CaptiveWallSlideTwitch",0],
  // ijaA's hair-grab / draw / cut / wipe / ready run on one root, frame to frame: the hold loop's
  // end (IjaThroatSlash 4.0 s = 1.0 s) is IjaWipeSheathBayonet frame 0, whose last frame is
  // IjaReadyRifle frame 0.
  [ijaA,"IjaHairGrabPull",-1,"IjaDrawBayonet",0],[ijaA,"IjaDrawBayonet",-1,"IjaThroatSlash",0],
  [ijaA,"IjaThroatSlash",-1,"IjaWipeSheathBayonet",0],[ijaA,"IjaWipeSheathBayonet",-1,"IjaReadyRifle",0]]){
  const {angle,offset}=HandOver(asset,a,ia,b,ib),jump=PropJump(asset,a,ia,b,ib);
  assert.ok(angle<2&&offset<.01,`${a}@${ia} hands over to ${b}@${ib} (${angle.toFixed(2)} deg, ${offset.toFixed(4)} source units)`);
  assert.ok(jump<=.02,`${a}@${ia} -> ${b}@${ib}: a prop jumps ${jump.toFixed(3)} m`);
  chains++;
}
// holdLoop seams: the frame the loop wraps from (h1) and the one it wraps to (h0) are the same pose
// (every bone within 2 deg, every bone origin within 1 cm, in the rig's world -- a local value can
// hide a root that moves the other way).
const glb=new Map();
const Glb=id=>{
  if(glb.has(id))return glb.get(id);
  const bytes=Read(`Model/Character/Model_${id}.glb`),json=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
  const parent=new Array(json.nodes.length).fill(-1);json.nodes.forEach((n,i)=>(n.children||[]).forEach(c=>parent[c]=i));
  const out={json,parent,byName:new Map(json.nodes.map((n,i)=>[n.name,i]))};glb.set(id,out);return out;
};
const QMul=(a,b)=>[a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1],a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0],a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3],a[3]*b[3]-a[0]*b[0]-a[1]*b[1]-a[2]*b[2]];
const QRot=(q,v)=>{const x=QMul(QMul(q,[v[0],v[1],v[2],0]),[-q[0],-q[1],-q[2],q[3]]);return [x[0],x[1],x[2]];};
const WorldPose=(id,asset,clip,t)=>{
  const {json,parent,byName}=Glb(id),c=asset.clips[clip],stride=asset.bones.length*7;
  const u=Math.max(0,Math.min(1,t/c.duration))*(c.frameCount-1),f=Math.min(Math.floor(u),c.frameCount-1),g=Math.min(f+1,c.frameCount-1),w=u-f;
  const local=json.nodes.map(n=>({t:n.translation||[0,0,0],r:n.rotation||[0,0,0,1],s:n.scale||[1,1,1]}));
  asset.bones.forEach((name,i)=>{
    const A=c.values.slice(f*stride+i*7,f*stride+i*7+7),B=c.values.slice(g*stride+i*7,g*stride+i*7+7),sign=A[3]*B[3]+A[4]*B[4]+A[5]*B[5]+A[6]*B[6]<0?-1:1;
    const q=[0,1,2,3].map(k=>A[3+k]+(sign*B[3+k]-A[3+k])*w),n=Math.hypot(...q);
    local[byName.get(name)]={t:[0,1,2].map(k=>A[k]+(B[k]-A[k])*w),r:q.map(v=>v/n),s:local[byName.get(name)].s};
  });
  const world=[];
  const W=i=>{
    if(world[i])return world[i];
    const L=local[i];if(parent[i]<0)return world[i]={p:L.t,q:L.r,s:L.s};
    const P=W(parent[i]),p=QRot(P.q,[L.t[0]*P.s[0],L.t[1]*P.s[1],L.t[2]*P.s[2]]);
    return world[i]={p:[P.p[0]+p[0],P.p[1]+p[1],P.p[2]+p[2]],q:QMul(P.q,L.r),s:[P.s[0]*L.s[0],P.s[1]*L.s[1],P.s[2]*L.s[2]]};
  };
  return asset.bones.map(name=>W(byName.get(name)));
};
let seams=0;
for(const [id,spec] of Object.entries(manifest.clips)){
  if(!spec.holdLoop||spec.legacy)continue;
  for(const rig of spec.rigs){
    const asset=assets.get(rig);   // glTF scene space: source metres
    const a=WorldPose(rig,asset,id,spec.holdLoop[1]),b=WorldPose(rig,asset,id,spec.holdLoop[0]);
    let angle=0,offset=0,where="";
    a.forEach((x,i)=>{
      if(/Finger\d\d|Nub/.test(asset.bones[i]))return;
      const y=b[i],dot=Math.abs(x.q[0]*y.q[0]+x.q[1]*y.q[1]+x.q[2]*y.q[2]+x.q[3]*y.q[3]),deg=2*Math.acos(Math.min(1,dot))*180/Math.PI;
      if(deg>angle){angle=deg;where=asset.bones[i];}
      offset=Math.max(offset,Math.hypot(x.p[0]-y.p[0],x.p[1]-y.p[1],x.p[2]-y.p[2]));
    });
    assert.ok(angle<=2&&offset<=.01,`${rig}/${id}: holdLoop seam ${spec.holdLoop.join("-")} s (${angle.toFixed(2)} deg at ${where}, ${(offset*100).toFixed(2)} cm)`);
    seams++;
  }
}
// The dropped rifle: every comrade clip after the blast says so, and names the clip whose
// weapon track leaves it where it lies (the runtime drops a copy there and hides the hand weapon).
for(const id of ["CaptiveDraggedFromDirt","CaptiveWallBrace","CaptiveKneelMud","CaptiveHeadPulledBack","CaptiveThroatCut","CaptiveClutchThroat","CaptiveWallSlideTwitch"]){
  assert.equal(manifest.clips[id].weaponState,"dropped",`${id}: the comrade's rifle is on the ground`);
  assert.ok(manifest.clips[manifest.clips[id].weaponDropFrom]?.props?.includes("weapon"),`${id}: weaponDropFrom has a weapon track`);
}
// The sheathed bayonet rides ijaA's pelvis between clips (rig asset propMounts).
assert.ok(["origin","axis","up"].every(k=>ijaA.propMounts?.bayonet?.[k]?.length===3&&ijaA.propMounts.bayonet[k].every(Number.isFinite)),"LugouIja02: bayonet scabbard mount");

// ---- 2026-09-23 director data (contract §5.3, space §2.1/§3) --------------------------------
assert.deepEqual([...C.phases.Trapped],["Banter","Orders","Incoming","Blast","Black","Wake","FrontPass","CaptiveDragged","CaptiveWall",
  "Interrogation","Slash","Taunt","Wipe","Reach","Found","Drag","Snag","KickBeam","DragOut","Butt","Boots"],"contract §5.3 Trapped phases");
assert.deepEqual([...C.phases.BunkerRescue],["Hold","Ask","KickShunzi","Glimpse","Collar","Chop","Parry","Flee","DragCover","LongShot",
  "Check","KickRifle","Released"],"contract §5.3 BunkerRescue phases");
assert.deepEqual([...C.phases.RearTrench],["Withdraw","Corner","Collection","SupportOrder"],"contract §5.3 RearTrench phases");
{
  const {MISSION_PLACEMENT:Place,MISSION_ANCHORS:Anchor}=await import("./Data_FirstLevelMissionLayout.mjs");
  const {MISSION_TUNING:Tune}=await import("./Data_Tuning_FirstLevel.mjs");
  const D=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
  assert.ok(D(C.shunzi.trap,Place.bunker.player)<.01,"Shunzi is pinned where the space puts him (bunker.player)");
  assert.ok(D(C.shunzi.dragged,Anchor.shunziDragged)<.01,"ijaA drags him to the K2 eye (shunziDragged)");
  assert.ok(D(C.rescue.rifleMouth,Place.bunker.rifleMouth)<.01,"the rifle is half-buried at the space's mouth mark");
  assert.ok(D(C.rescue.rifleKicked,C.shunzi.cover)<Tune.interactionRangeM-1,"Luo's kick leaves the rifle within easy reach of the cover");
  assert.ok(D(C.rescue.liuShot,Place.bunker.liuwencaiShot)<.01,"Liu Wencai shoots from the space's mark");
  for(const [name,route] of [["runner",C.banter.runnerRoute],["exit",C.banter.exitRoute],["walkIn",C.ija.walkIn],["found",C.ija.foundRoute],
    ["dragOut",C.ija.dragOutRoute],["luo",C.rescue.luoRoute],["he",C.rescue.heRoute],["dragCover",C.rescue.dragCoverRoute],["withdraw",C.withdraw.lane]])
    assert.ok(route.length>=2&&route.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.z)),`${name} route is a finite polyline`);
  // Every director wait has a finite timeout (the show can never stall).
  assert.ok(Object.values(C.timeouts).every(v=>Number.isFinite(v)&&v>0),"all director timeouts are finite and positive");
  assert.deepEqual([...C.vanguardIds].sort(),["BunkerExecutionerA","BunkerExecutionerB","BunkerFollowB"],"hand-back waits for ijaA, ijaB and ijaD only");
}
console.log(`ok opening storyboards: five original rigs, ${clipCount} rig clips (${NEW.length} authored 2026-09-23, ${paired} paired contacts cross-checked, ${chains} same-root hand-overs, ${seams} hold-loop seams), ${frames} normalized frames, director phase table and marks`);
