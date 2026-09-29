import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { OPENING_STORYBOARDS as C } from "./Data_OpeningStoryboards.mjs";
import { OpeningHoldTime } from "./Script_OpeningProps.mjs";
const Read=file=>fs.readFileSync(new URL(file,import.meta.url));
const Hash=bytes=>crypto.createHash("sha256").update(bytes).digest("hex");
const manifest=JSON.parse(Read("Animation/OpeningStoryboards/Data_OpeningStoryboardsAnimation.json"));
const RIGS=["TengxianNra02","TengxianNra05","TengxianIja01","TengxianIja02","TengxianIja03"];
assert.equal(manifest.version,C.version);
assert.deepEqual(manifest.models.map(row=>row.id),RIGS);

// ---- contract §5.4: the frozen clip names -------------------------------------------------
const FROZEN_AUTHORED=["WoundedSitRifleIdle","BanterLaugh","BanterLookShoulder","BanterPatRifle","WoundedRiseWall",
  "BlastSlamBuried","IjaDragCollarFromDirt","IjaPullArm","CaptiveDraggedFromDirt","CaptiveKneelMud","CaptiveWallBrace",
  "IjaHairGrabPull","CaptiveHeadPulledBack","IjaDrawBayonet","IjaThroatSlash","CaptiveThroatCut","CaptiveClutchThroat",
  "CaptiveWallSlideTwitch","IjaWipeSheathBayonet","IjaReadyRifle","IjaCornerFire","IjaJunctionPeek","IjaSlingRifle",
  "IjaCollarDragSnag","IjaKickBeam","IjaButtStrike","IjaHoldCollarUp","InterpreterCrouchAsk","InterpreterGrabCollar",
  "InterpreterFlee","LuoDadaoChopRear","IjaChoppedFallWall","HeDadaoParryChop","IjaParriedChoppedFall","LuoDragToCover",
  "HeSwapDadaoRifle","LuoKneelCheck",
  // 2026-09-25 storyboard round (Data_FirstLevelStoryboard0103Contract.md §4.1)
  "IjaButtStrikeCollar","IjaDragByForearm","IjaLookBackLow","IjaStartleTurn","IjaGuardPort",
  "LuoKneelReach","RunnerLeanPostCall","InterpreterHurryReach","YaowaSitLoad","IjaChoppedFallBack"];
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
  // wallLeanFromM / wallLeanDeg: the wall behind leans back above that height (the planks behind R3, 2026-09-27).
  for(const [key,value] of Object.entries(spec.env||{}))assert.ok(/^wall(Behind|Left|Right|LeanFrom)M$/.test(key)&&value>0&&value<1.5
    ||key==="wallLeanDeg"&&value>0&&value<45&&spec.env.wallBehindM>0&&spec.env.wallLeanFromM>0,`${id}: env ${key}`);
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
  for(const rig of id.startsWith("Ija")?["TengxianIja01","TengxianIja02"]:["TengxianNra02"])assert.ok(captiveClips.get(rig)?.[id],`${rig}: reused ${id}`);
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
const comrade=assets.get("TengxianNra02"),ijaA=assets.get("TengxianIja02");
let chains=0;
for(const [asset,a,ia,b,ib] of [[comrade,"WoundedSitRifleIdle",0,"BanterPatRifle",0],[comrade,"BanterPatRifle",-1,"WoundedSitRifleIdle",0],
  [comrade,"WoundedSitRifleIdle",0,"WoundedRiseWall",0],[comrade,"WoundedRiseWall",-1,"BlastSlamBuried",0],[comrade,"BlastSlamBuried",-1,"CaptiveDraggedFromDirt",0],
  // Stunned in the heap between them (BlastDazedStir loops; the director lands the drag on a loop end).
  [comrade,"BlastSlamBuried",-1,"BlastDazedStir",0],[comrade,"BlastDazedStir",-1,"CaptiveDraggedFromDirt",0],
  [comrade,"CaptiveWallBrace",-1,"CaptiveKneelMud",0],[comrade,"CaptiveKneelMud",0,"CaptiveHeadPulledBack",0],[comrade,"CaptiveHeadPulledBack",-1,"CaptiveThroatCut",0],
  [comrade,"CaptiveThroatCut",-1,"CaptiveClutchThroat",0],[comrade,"CaptiveClutchThroat",0,"CaptiveWallSlideTwitch",0],
  // ijaA's hair-grab / draw / cut / wipe / ready run on one root, frame to frame: the hold loop's
  // end (IjaThroatSlash 4.0 s = 1.0 s) is IjaWipeSheathBayonet frame 0, whose last frame is
  // IjaReadyRifle frame 0.
  [ijaA,"IjaHairGrabPull",-1,"IjaDrawBayonet",0],[ijaA,"IjaDrawBayonet",-1,"IjaThroatSlash",0],
  // (2026-09-27: IjaWipeSheathBayonet is retired -- the director walks ijaA off from the taunt -- and keeps the frames it was
  // baked with against the old chain; only its hand-over to IjaReadyRifle still holds.)
  [ijaA,"IjaWipeSheathBayonet",-1,"IjaReadyRifle",0]]){
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
// ---- IK branch (2026-09-28, docs/Data_OpeningClipLibrary20260923.md §10): no limb bone turns about its own axis by
// more than 70 deg between two frames, in any clip on any rig. A two-bone IK that switches branch shows as exactly that
// (a forearm, a hand, a calf or a foot half a turn round in one frame and staying there: 140-178 deg in the 09-23..27
// bakes); after the 09-28 rebake the largest is 61 deg (the vaults' airborne thighs). World rotations, split into the
// swing of the bone's direction and the twist about it (a fast swing -- a chop, a flung arm -- is not a branch).
let twistWorst=0,twistAt="";
{
  const LIMBS=["Thigh","Calf","Foot","UpperArm","Forearm","Hand"].flatMap(b=>["L","R"].map(s=>`${s} ${b}`));
  const CHILD={"Thigh":"Calf","Calf":"Foot","Foot":"Toe0","UpperArm":"Forearm","Forearm":"Hand","Hand":"Finger2"};
  for(const [id,asset] of assets){
    const {json,parent,byName}=Glb(id),stride=asset.bones.length*7,prefix=asset.bones.find(n=>/ Pelvis$/.test(n)).split(" ")[0];
    const boneIndex=new Map(asset.bones.map((n,i)=>[byName.get(n),i]));
    const limbs=LIMBS.map(role=>{
      const [side,part]=role.split(" "),child=json.nodes[byName.get(`${prefix} ${side} ${CHILD[part]}`)].translation,n=Math.hypot(...child);
      return {role,node:byName.get(`${prefix} ${role}`),axis:child.map(v=>v/n)};
    });
    for(const [clip,c] of Object.entries(asset.clips)){
      const Frame=f=>{
        const memo=new Map();
        const W=node=>{
          if(memo.has(node))return memo.get(node);
          const i=boneIndex.get(node),r=i==null?json.nodes[node].rotation||[0,0,0,1]:c.values.slice(f*stride+i*7+3,f*stride+i*7+7);
          const q=parent[node]<0?r:QMul(W(parent[node]),r);memo.set(node,q);return q;
        };
        return limbs.map(l=>W(l.node));
      };
      let prev=Frame(0);
      for(let f=1;f<c.frameCount;f++){
        const cur=Frame(f);
        limbs.forEach((l,k)=>{
          const a=prev[k],b=cur[k],r=QMul([-a[0],-a[1],-a[2],a[3]],b);
          let twist=Math.abs(2*Math.atan2(r[0]*l.axis[0]+r[1]*l.axis[1]+r[2]*l.axis[2],r[3])*180/Math.PI);
          twist=Math.min(twist,360-twist);
          if(twist>twistWorst){twistWorst=twist;twistAt=`${id} ${clip} ${l.role} @${(f/manifest.fps).toFixed(2)}s`;}
        });
        prev=cur;
      }
    }
  }
  assert.ok(twistWorst<=70,`a limb turns ${twistWorst.toFixed(0)} deg about its own axis in one frame (${twistAt}): an IK branch switch`);
}
// ---- 2026-09-25 storyboard clips (Data_FirstLevelStoryboard0103Contract.md §4.1) -----------------------
const SB0925=["IjaButtStrikeCollar","IjaDragByForearm","IjaLookBackLow","IjaStartleTurn","IjaGuardPort"];
{
  const ijaB=assets.get("TengxianIja01"),reportOf=(rig,id)=>manifest.models.find(m=>m.id===rig).clips.find(c=>c.clip===id);
  for(const id of SB0925){
    const spec=manifest.clips[id];
    assert.equal(spec.rig,id==="IjaGuardPort"?"TengxianIja01":"TengxianIja02",`${id}: cast on the contract's rig`);
    // durations are whole baked frames (a contact or event key then lands on a frame)
    assert.ok(Math.abs(spec.duration*manifest.fps-Math.round(spec.duration*manifest.fps))<1e-6,`${id}: duration ${spec.duration} s is whole frames`);
  }
  // Every clip that aims ijaA's face at the camera (the player's eye) or ijaB's at the captive: the face
  // points at it (bake lookErrorDeg: face direction vs eye->target, while the aim is fully on) and the
  // head stays on the neck.
  for(const [rig,id,limit] of [["TengxianIja02","IjaButtStrikeCollar",3],["TengxianIja02","IjaDragByForearm",3],["TengxianIja02","IjaHoldCollarUp",3],
    ["TengxianIja02","IjaLookBackLow",3],["TengxianIja01","IjaGuardPort",3],
    // the startle snaps the head round in 0.3 s after a look point that swings as fast: the head trails it by up to ~7 deg
    ["TengxianIja02","IjaStartleTurn",10]]){
    const r=reportOf(rig,id);
    assert.ok(r.lookErrorDeg<=limit,`${rig}/${id}: the face misses its look point by ${r.lookErrorDeg} deg`);
    assert.ok(r.headTurnDeg<=70,`${rig}/${id}: head turned ${r.headTurnDeg} deg on the neck`);
  }
  // SB04: apex hold >= 0.4 s, the butt on the player's head at the declared strike (bake probe), event = contact.
  const butt=manifest.clips.IjaButtStrikeCollar,strike=butt.contacts.find(c=>c.action==="strike");
  assert.ok(butt.holdLoop[1]-butt.holdLoop[0]>=.4,"IjaButtStrikeCollar: the apex hold loop is at least 0.4 s");
  assert.equal(butt.events.find(e=>e.kind==="buttHit").t,strike.t,"IjaButtStrikeCollar: buttHit is the strike contact");
  const probe=reportOf("TengxianIja02","IjaButtStrikeCollar").probes?.buttOnHead;
  assert.ok(probe&&probe[0]<=.03&&Math.abs(probe[1]-strike.t)<1e-3,`IjaButtStrikeCollar: butt on the head at ${strike.t} s (${probe})`);
  // First-person partner parts: collar/head on every clip that holds him, forearmR on the drag.
  const parts=(id)=>Object.keys(ijaA.clips[id].player?.parts||{}).sort().join(",");
  assert.equal(parts("IjaButtStrikeCollar"),"collar,head");assert.equal(parts("IjaDragByForearm"),"collar,forearmR,head");
  assert.equal(parts("IjaStartleTurn"),"collar,head");assert.equal(parts("IjaHoldCollarUp"),"collar,head");
  // SB04A: 1.5-2.5 m of root motion backwards (actor +z), the forearm grab declared on the player's forearmR.
  const drag=reportOf("TengxianIja02","IjaDragByForearm").root,travel=Math.hypot(drag.end[0]-drag.start[0],drag.end[1]-drag.start[1]);
  assert.ok(travel>=1.5&&travel<=2.5&&drag.end[1]>drag.start[1],`IjaDragByForearm: hauls ${travel.toFixed(2)} m backwards`);
  assert.ok(manifest.clips.IjaDragByForearm.contacts.some(c=>c.action==="grab"&&c.part==="forearmR"&&c.partnerRole==="shunzi"),"IjaDragByForearm: grabs forearmR");
  // SB05: Shunzi's eye 0.65-0.85 m up in the IjaHoldCollarUp hold (the contract's 0.75 m).
  const eye=ijaA.clips.IjaHoldCollarUp.player.parts.head,holdAt=Math.round(1.0*12)*3;
  assert.ok(eye[holdAt+1]>=.65&&eye[holdAt+1]<=.85,`IjaHoldCollarUp: eye ${eye[holdAt+1]} m up in the hold`);
  // SB05A: IjaStartleTurn ends with the face turned to his left rear (where Luo and He come up: Shunzi's screen
  // right), about level -- the head's rest face direction (glTF +z, the actor's forward; +x = his left) carried
  // by the last frame -- and the flinch drops him (the head lower than in the hold it starts from).
  {
    const {json,parent,byName}=Glb("TengxianIja02"),head=ijaA.bones.findIndex(n=>/ Head$/.test(n));
    const RestQ=i=>{const q=json.nodes[i].rotation||[0,0,0,1];return parent[i]<0?q:QMul(RestQ(parent[i]),q);};
    const r=RestQ(byName.get(ijaA.bones[head])),faceLocal=QRot([-r[0],-r[1],-r[2],r[3]],[0,0,1]);
    const startle=manifest.clips.IjaStartleTurn,end=WorldPose("TengxianIja02",ijaA,"IjaStartleTurn",startle.duration)[head];
    const face=QRot(end.q,faceLocal),left=Math.atan2(face[0],face[2])*180/Math.PI,pitch=Math.asin(face[1]/Math.hypot(...face))*180/Math.PI;
    assert.ok(left>=60&&left<=130&&Math.abs(pitch)<=20,`IjaStartleTurn: the face ends ${left.toFixed(0)} deg to his left, pitch ${pitch.toFixed(0)} deg`);
    const start=WorldPose("TengxianIja02",ijaA,"IjaStartleTurn",0)[head];
    assert.ok(start.p[1]-end.p[1]>=.02,`IjaStartleTurn: the head drops ${((start.p[1]-end.p[1])*100).toFixed(1)} cm in the flinch`);
    assert.ok(startle.events.some(e=>e.kind==="releaseCollar")&&!manifest.clips.IjaParriedChoppedFall.events.some(e=>e.kind==="releaseCollar"),
      "releaseCollar is on IjaStartleTurn (IjaParriedChoppedFall frame 0 is already off the collar)");
  }
  // IjaGuardPort is a seamless loop on ijaB's rig.
  assert.ok(ijaB.clips.IjaGuardPort.loop,"IjaGuardPort loops");
  // Same-root hand-overs frame to frame (world pose, every bone <= 2 deg and 1 cm; props <= 2 cm):
  // strike -> drag, hold loop start -> startle, startle -> the parried fall.
  const World=(rig,asset,id,t)=>WorldPose(rig,asset,id,t);
  for(const [a,ta,b,tb] of [["IjaButtStrikeCollar",null,"IjaDragByForearm",0],["IjaHoldCollarUp",manifest.clips.IjaHoldCollarUp.holdLoop[0],"IjaStartleTurn",0],
    ["IjaStartleTurn",null,"IjaParriedChoppedFall",0]]){
    const x=World("TengxianIja02",ijaA,a,ta??manifest.clips[a].duration),y=World("TengxianIja02",ijaA,b,tb);
    let angle=0,offset=0,where="";
    x.forEach((p,i)=>{
      if(/Finger\d\d|Nub/.test(ijaA.bones[i]))return;
      const q=y[i],deg=2*Math.acos(Math.min(1,Math.abs(p.q[0]*q.q[0]+p.q[1]*q.q[1]+p.q[2]*q.q[2]+p.q[3]*q.q[3])))*180/Math.PI;
      if(deg>angle){angle=deg;where=ijaA.bones[i];}
      offset=Math.max(offset,Math.hypot(p.p[0]-q.p[0],p.p[1]-q.p[1],p.p[2]-q.p[2]));
    });
    assert.ok(angle<=2&&offset<=.01,`${a}@${ta??"end"} -> ${b}@${tb}: ${angle.toFixed(2)} deg at ${where}, ${(offset*100).toFixed(2)} cm`);
    if(ta==null)assert.ok(PropJump(ijaA,a,-1,b,0)<=.02,`${a} -> ${b}: the rifle continues`);
    chains++;
  }
}
// ---- 2026-09-27 vault / haul (IjaVaultTimberIn, IjaVaultTimberOut, IjaHaulForearmUnder): retired the same day by the
// pinned-rescue rework (docs/Data_OpeningPinnedRescue20260927.md: ijaA no longer drags him out); the clips stay in the
// library (their seams and contacts are still checked above), their staging against the removed marks is gone.
// ---- 2026-09-27 pinned rescue (user: 「那个割喉的日军动作还需要优化现在看不出来是割喉」, 「日军也不再拖出主角，直接在原地审问，
// 把从枪托改成扇巴掌」): the throat cut seen from the pinned eye, the jeering walk, the find, the hair hold and the slaps,
// He heaving the roof timber. Clip-level checks only (the director's own checks are elsewhere). --------------------
{
  const reportOf=(rig,id)=>manifest.models.find(m=>m.id===rig).clips.find(c=>c.clip===id);
  const WorldHandOver=(rig,asset,a,ta,b,tb)=>{
    const x=WorldPose(rig,asset,a,ta),y=WorldPose(rig,asset,b,tb);
    let angle=0,offset=0,where="";
    x.forEach((p,i)=>{
      if(/Finger\d\d|Nub/.test(asset.bones[i]))return;
      const q=y[i],deg=2*Math.acos(Math.min(1,Math.abs(p.q[0]*q.q[0]+p.q[1]*q.q[1]+p.q[2]*q.q[2]+p.q[3]*q.q[3])))*180/Math.PI;
      if(deg>angle){angle=deg;where=asset.bones[i];}
      offset=Math.max(offset,Math.hypot(p.p[0]-q.p[0],p.p[1]-q.p[1],p.p[2]-q.p[2]));
    });
    return {angle,offset,where};
  };
  // The slash stages: ijaA at the comrade's LEFT shoulder (the side away from the pinned eye, which is 2.21 m to his right
  // and 0.54 m ahead), on his own lower ground (yM), and never on the line from the eye to the comrade's throat.
  const eye={x:2.21,z:-.54};
  for(const name of ["slashGrab","slashDraw","slashCut","slashTaunt"]){
    const a=manifest.stages[name].actors.ijaA;
    assert.ok(a.x<=-.18&&a.x>=-.5&&a.z<=0&&a.z>=-.35,`${name}: ijaA at the comrade's left shoulder (${a.x}, ${a.z})`);
    assert.ok(a.yM<0&&a.yM>-.3,`${name}: ijaA's root ground under the kneel spot (${a.yM})`);
    const t=Math.max(0,Math.min(1,(a.x*eye.x+a.z*eye.z)/(eye.x*eye.x+eye.z*eye.z)));
    assert.ok(t===0,`${name}: ijaA is behind the comrade from the eye, not between them`);
  }
  // His feet are laid on the bank (the stage ground): the per-frame grounding lift stays within 3 cm (a foot authored
  // in the slope, or over it, would push or drop the whole body).
  for(const id of ["IjaHairGrabPull","IjaDrawBayonet","IjaThroatSlash"]){
    const r=reportOf("TengxianIja02",id);
    assert.ok(Math.abs(r.floorCorrectionMin)<=.03&&Math.abs(r.floorCorrectionMax)<=.03,`${id}: on the bank ground (lift ${r.floorCorrectionMin}..${r.floorCorrectionMax})`);
  }
  // The fist in the hair: the grab/hold contacts name the new patch on both sides, and the patch is baked on the NRA02 rig.
  assert.ok(comrade.contactPoints.hairNape&&comrade.contactPoints.throat,"TengxianNra02: hairNape and throat patches");
  for(const id of ["IjaHairGrabPull","IjaDrawBayonet","IjaThroatSlash"])
    assert.ok(manifest.clips[id].contacts.some(c=>c.limb==="handL"&&c.part==="hairNape"),`${id}: the left fist in the hair`);
  // The blade at the throat at the cut, cut at 0.24 s (bake probe on the baked frame next to it: the throat patch to the
  // blade's centre line, which runs a fist's half-width out from the skin; the blade mesh on the skin within 3 cm is
  // Script_OpeningClipsBrowserTest's cut contact).
  const cut=manifest.clips.IjaThroatSlash.contacts.find(c=>c.action==="cut");
  assert.ok(cut.part==="throat"&&Math.abs(cut.t-.24)<1e-9,"IjaThroatSlash: the cut on the throat at 0.24 s");
  const blade=reportOf("TengxianIja02","IjaThroatSlash").probes?.bladeOnThroat;
  assert.ok(blade&&blade[0]<=.07&&Math.abs(blade[1]-cut.t)<=.03,`IjaThroatSlash: the blade at the throat at the cut (${blade})`);
  // The blade sweeps across the neck: the bayonet track's origin moves >= 0.25 m between the cock (0.08 s) and the end of
  // the stroke (0.30 s) (glTF scene space, shipped node units -> runtime by the pelvis height ratio).
  {
    const clip=ijaA.clips.IjaThroatSlash,v=clip.props.bayonet.values,fps=(clip.frameCount-1)/clip.duration;
    const f=t=>Math.round(t*fps),o=i=>v.slice(i*10,i*10+3);
    const r=reportOf("TengxianIja02","IjaThroatSlash"),pelvis=ijaA.bones.findIndex(n=>n.endsWith(" Pelvis"));
    const k=r.root.start[3]/WorldPose("TengxianIja02",ijaA,"IjaThroatSlash",0)[pelvis].p[1];
    const travel=Math.hypot(...[0,1,2].map(i=>o(f(.30))[i]-o(f(.08))[i]))*k;
    assert.ok(travel>=.25,`IjaThroatSlash: the blade travels ${travel.toFixed(2)} m across the throat`);
  }
  // The chain hands over frame to frame on one root (comrade: HeadPulledBack -> ThroatCut -> ClutchThroat -> WallSlide is
  // checked above with the rest of the chains).
  for(const [a,ta,b,tb] of [["IjaHairGrabPull",1.0,"IjaDrawBayonet",0],["IjaDrawBayonet",.8,"IjaThroatSlash",0]]){
    const h=WorldHandOver("TengxianIja02",ijaA,a,ta,b,tb);
    assert.ok(h.angle<=2&&h.offset<=.01,`${a}@${ta} -> ${b}@${tb}: ${h.angle.toFixed(2)} deg at ${h.where}, ${(h.offset*100).toFixed(2)} cm`);
  }
  // IjaTauntWalk: an upper-body loop with the bayonet; IjaFoundLook: a hold loop, the bayonet sheathed by its end.
  for(const id of ["IjaTauntWalk","IjaFoundLook","IjaCrouchHairHold","IjaSlapForehand","IjaSlapBackhand","IjaSlapRaise","HeLiftTimber"]){
    const spec=manifest.clips[id];
    for(const v of [spec.duration,...(spec.holdLoop||[])])assert.ok(Math.abs(v*manifest.fps-Math.round(v*manifest.fps))<1e-6,`${id}: ${v} s is whole frames`);
  }
  const walk=manifest.clips.IjaTauntWalk;
  assert.ok(walk.upperBody===true&&walk.loop===true&&ijaA.clips.IjaTauntWalk.loop&&walk.props.includes("bayonet"),"IjaTauntWalk: an upper-body loop with the bayonet");
  const found=manifest.clips.IjaFoundLook;
  assert.ok(found.holdLoop&&found.holdLoop[1]===found.duration&&found.contacts.some(c=>c.action==="sheathe"),"IjaFoundLook: sheathes, then a hold loop");
  // IjaCrouchHairHold: the left fist on the crown from 0.25 s, the eye lifted 0.16 m by 0.70 s (player head track), a hold
  // loop to the end; the slaps start and end on its hold-loop start, slap contacts at 0.34 on the cheeks with the palm
  // (or the back of the hand) on the cheek at the hit (bake probes).
  const hold=manifest.clips.IjaCrouchHairHold,head=ijaA.clips.IjaCrouchHairHold.player.parts.head;
  assert.ok(hold.contacts.some(c=>c.action==="grab"&&c.part==="crown"&&Math.abs(c.t-.25)<1e-9),"IjaCrouchHairHold: grabs the crown at 0.25 s");
  const y=t=>head[Math.round(t*12)*3+1],rise=y(.75)-y(0);
  assert.ok(Math.abs(rise-.16)<=.02&&Math.abs(y(0)-.28)<=.02,`IjaCrouchHairHold: the eye rises ${rise.toFixed(3)} m from ${y(0)} m`);
  const h0=hold.holdLoop[0];
  assert.ok(h0>=.7&&h0<=.8&&hold.holdLoop[1]===hold.duration,`IjaCrouchHairHold: hold loop from ${h0} s`);
  for(const [id,part,probe] of [["IjaSlapForehand","cheekL","palmOnCheek"],["IjaSlapBackhand","cheekR","backOnCheek"]]){
    const slap=manifest.clips[id].contacts.find(c=>c.action==="slap");
    assert.ok(slap&&slap.t===.34&&slap.limb==="handR"&&slap.part===part&&slap.partnerRole==="shunzi",`${id}: slap contact on ${part} at 0.34 s`);
    const p=reportOf("TengxianIja02",id).probes?.[probe];
    assert.ok(p&&p[0]<=.03&&Math.abs(p[1]-slap.t)<=.021,`${id}: the hand on the cheek at the hit (${p})`);
  }
  for(const [a,ta,b,tb] of [["IjaCrouchHairHold",h0,"IjaSlapForehand",0],["IjaSlapForehand",manifest.clips.IjaSlapForehand.duration,"IjaCrouchHairHold",h0],
    ["IjaCrouchHairHold",h0,"IjaSlapBackhand",0],["IjaSlapBackhand",manifest.clips.IjaSlapBackhand.duration,"IjaCrouchHairHold",h0],
    ["IjaCrouchHairHold",h0,"IjaSlapRaise",0]]){
    const h=WorldHandOver("TengxianIja02",ijaA,a,ta,b,tb);
    assert.ok(h.angle<=2&&h.offset<=.01,`${a}@${ta} -> ${b}@${tb}: ${h.angle.toFixed(2)} deg at ${h.where}, ${(h.offset*100).toFixed(2)} cm`);
    chains++;
  }
  for(const id of ["IjaCrouchHairHold","IjaSlapForehand","IjaSlapBackhand","IjaSlapRaise"])
    assert.ok(ijaA.clips[id].player?.parts?.head,`${id}: player head track`);
  // HeLiftTimber: hands on the timber from gripS, a hold loop with an exit into the release.
  const lift=manifest.clips.HeLiftTimber;
  assert.ok(lift.rigs.includes("TengxianNra02")&&lift.holdLoop&&typeof lift.holdExit==="string"&&lift.contacts.some(c=>c.action==="grip"&&Math.abs(c.t-C.rescue.lift.gripS)<1e-9),
    "HeLiftTimber: grips at rescue.lift.gripS, a hold loop with an exit");
  assert.ok(reportOf("TengxianNra02","HeLiftTimber").contactErrorM<=.03,"HeLiftTimber: the hands ride the timber");
}
// ---- 2026-09-25 storyboard clips on the NRA rigs (§4.1: SB01 runner/Yaowa, SB04A interpreter, SB06 Luo) ----------
{
  const SB0925_NRA={LuoKneelReach:"TengxianNra05",RunnerLeanPostCall:"TengxianNra02",InterpreterHurryReach:"TengxianNra02",YaowaSitLoad:"TengxianNra02"};
  const reportOf=(rig,id)=>manifest.models.find(m=>m.id===rig).clips.find(c=>c.clip===id);
  for(const [id,rig] of Object.entries(SB0925_NRA)){
    const spec=manifest.clips[id],r=reportOf(rig,id);
    assert.equal(spec.rig,rig,`${id}: cast on the contract's rig`);
    assert.ok(Math.abs(spec.duration*manifest.fps-Math.round(spec.duration*manifest.fps))<1e-6,`${id}: duration ${spec.duration} s is whole frames`);
    // bake numbers: planted feet (and Luo's knee) hold, hands on their targets, the face on its look point
    assert.ok(r.footSlideM<=.02&&(r.kneeSlideM??0)<=.02,`${rig}/${id}: foot ${r.footSlideM} m, knee ${r.kneeSlideM} m`);
    assert.ok(r.contactErrorM<=.03,`${rig}/${id}: hand ${r.contactErrorM} m off its target`);
    assert.ok(r.lookErrorDeg<=3&&r.headTurnDeg<=70,`${rig}/${id}: face ${r.lookErrorDeg} deg off, head turned ${r.headTurnDeg} deg`);
  }
  const luo=assets.get("TengxianNra05"),nra02=assets.get("TengxianNra02");
  // SB06: the offered hand 0.3 m short of Shunzi's chest (player chest/head tracks), a hold loop with an exit, and
  // the clip starts and ends on LuoKneelCheck frame 0 (a drop-in for the Check beat, then KickRifle).
  const reach=manifest.clips.LuoKneelReach,offer=reach.contacts.find(c=>c.action==="reach");
  assert.ok(offer&&offer.limb==="handL"&&offer.part==="chest"&&offer.partnerRole==="shunzi"&&Math.abs(offer.gapM-.3)<1e-9,"LuoKneelReach: left hand offered 0.3 m short of the chest");
  assert.equal(Object.keys(luo.clips.LuoKneelReach.player?.parts||{}).sort().join(","),"chest,head","LuoKneelReach: player chest/head");
  assert.equal(reportOf("TengxianNra05","LuoKneelReach").kneePlants.length,1,"LuoKneelReach: the right knee is declared on the ground");
  for(const [a,ta,b,tb] of [["LuoKneelReach",reach.duration,"LuoKneelCheck",0],["LuoKneelReach",0,"LuoKneelCheck",0]]){
    const x=WorldPose("TengxianNra05",luo,a,ta),y=WorldPose("TengxianNra05",luo,b,tb);
    let angle=0,offset=0,where="";
    x.forEach((p,i)=>{
      if(/Finger\d\d|Nub/.test(luo.bones[i]))return;
      const q=y[i],deg=2*Math.acos(Math.min(1,Math.abs(p.q[0]*q.q[0]+p.q[1]*q.q[1]+p.q[2]*q.q[2]+p.q[3]*q.q[3])))*180/Math.PI;
      if(deg>angle){angle=deg;where=luo.bones[i];}
      offset=Math.max(offset,Math.hypot(p.p[0]-q.p[0],p.p[1]-q.p[1],p.p[2]-q.p[2]));
    });
    assert.ok(angle<=2&&offset<=.01,`${a}@${ta} -> ${b}@${tb}: ${angle.toFixed(2)} deg at ${where}, ${(offset*100).toFixed(2)} cm`);
    chains++;
  }
  // SB01 runner: the fist on the post (pointM) sits just outside the post (postAxisM, postRadiusM), shoulder high.
  // The RIGHT hand, the post at his front right (review 2026-09-25: with the storyboard's left hand the north door
  // post puts him in the dugout's north wall; mirrored per contract §1.3).
  const post=manifest.clips.RunnerLeanPostCall.contacts.find(c=>c.target==="post");
  const gap=Math.hypot(post.pointM[0]-post.postAxisM[0],post.pointM[2]-post.postAxisM[2]);
  assert.ok(post.limb==="handR"&&gap>=post.postRadiusM&&gap<=post.postRadiusM+.05&&post.pointM[1]>1.0&&post.pointM[1]<1.35,
    `RunnerLeanPostCall: fist ${gap.toFixed(3)} m from the post axis at ${post.pointM[1]} m`);
  assert.ok(post.postAxisM[0]>.3&&post.postAxisM[2]<0,`RunnerLeanPostCall: the post at his front right (${post.postAxisM})`);
  // Placed on the north door post (Data_FirstLevelMissionLayout BunkerMouthPostN) facing into the dugout (yaw 80 deg),
  // the root stands in the mouth south of that post, outside the north wall line, within the contract's 0.6 m of its mark.
  {
    const yaw=80*Math.PI/180,[px,,pz]=post.postAxisM,wx=px*Math.cos(yaw)+pz*Math.sin(yaw),wz=-px*Math.sin(yaw)+pz*Math.cos(yaw);
    const root={x:1.05-wx,z:-127.5-wz};
    assert.ok(root.z>-127.5+.3&&Math.hypot(root.x-.72,root.z+127.0)<=.6,`RunnerLeanPostCall: root (${root.x.toFixed(2)},${root.z.toFixed(2)}) on the north door post`);
  }
  assert.ok(manifest.clips.RunnerLeanPostCall.holdLoop[1]===manifest.clips.RunnerLeanPostCall.duration,"RunnerLeanPostCall: holds to the end");
  // SB04A interpreter: an upper-body clip (the runtime lays it on the native legs).
  assert.equal(manifest.clips.InterpreterHurryReach.upperBody,true,"InterpreterHurryReach: upper body");
  // SB01 Yaowa: a seamless loop, sitting on the ground against the wall.
  assert.ok(nra02.clips.YaowaSitLoad.loop&&manifest.clips.YaowaSitLoad.env.wallBehindM>0,"YaowaSitLoad: loops against the wall");
  const seam=HandOver(nra02,"YaowaSitLoad",0,"YaowaSitLoad",-1);
  assert.ok(seam.angle<=.5&&seam.offset<=.001,`YaowaSitLoad: loop seam ${seam.angle.toFixed(3)} deg`);
  assert.ok(reportOf("TengxianNra02","YaowaSitLoad").root.start[3]<.2,"YaowaSitLoad: the pelvis is on the ground (sitting)");
}
// ---- SB05A IjaChoppedFallBack (ijaB, optional §4.1): the alternative to IjaChoppedFallWall on the same stage --------
{
  const ijaB=assets.get("TengxianIja01"),spec=manifest.clips.IjaChoppedFallBack,wall=manifest.clips.IjaChoppedFallWall;
  const r=manifest.models.find(m=>m.id==="TengxianIja01").clips.find(c=>c.clip==="IjaChoppedFallBack");
  assert.ok(spec.rig==="TengxianIja01"&&spec.role==="ijaB"&&spec.stage===wall.stage&&spec.terminal===true,"IjaChoppedFallBack: ijaB, the chopRear stage, terminal");
  assert.ok(Math.abs(spec.duration*manifest.fps-Math.round(spec.duration*manifest.fps))<1e-6,`IjaChoppedFallBack: duration ${spec.duration} s is whole frames`);
  // the same cut as the wall fall (LuoDadaoChopRear aims at the wall fall's neck track)
  const cut=c=>c.by==="luo"&&c.part==="neckSideR"&&c.action==="cut";
  assert.equal(spec.contacts.find(cut)?.t,wall.contacts.find(cut)?.t,"IjaChoppedFallBack: the cut lands when it does on IjaChoppedFallWall");
  assert.ok(spec.events.some(e=>e.kind==="seatHit")&&spec.events.some(e=>e.kind==="dead"&&e.t===spec.duration),"IjaChoppedFallBack: seatHit and dead events");
  // up to the cut it IS the wall fall, so the director swaps the clip without moving Luo: world pose <= 1 deg, 5 mm
  for(const t of [0,.25,.45]){
    const x=WorldPose("TengxianIja01",ijaB,"IjaChoppedFallWall",t),y=WorldPose("TengxianIja01",ijaB,"IjaChoppedFallBack",t);
    let angle=0,offset=0,where="";
    x.forEach((p,i)=>{
      if(/Finger\d\d|Nub/.test(ijaB.bones[i]))return;
      const q=y[i],deg=2*Math.acos(Math.min(1,Math.abs(p.q[0]*q.q[0]+p.q[1]*q.q[1]+p.q[2]*q.q[2]+p.q[3]*q.q[3])))*180/Math.PI;
      if(deg>angle){angle=deg;where=ijaB.bones[i];}
      offset=Math.max(offset,Math.hypot(p.p[0]-q.p[0],p.p[1]-q.p[1],p.p[2]-q.p[2]));
    });
    assert.ok(angle<=1&&offset<=.005,`IjaChoppedFallBack@${t} vs IjaChoppedFallWall: ${angle.toFixed(2)} deg at ${where}, ${(offset*100).toFixed(2)} cm`);
  }
  // bake numbers: planted feet hold until the fall, nothing in the trench wall, and he ends on the ground behind his root
  assert.ok(r.footSlideM<=.02&&(r.wallPenetrationM??0)<=.01,`IjaChoppedFallBack: foot ${r.footSlideM} m, wall ${r.wallPenetrationM} m`);
  assert.ok(r.root.end[3]<.25&&r.root.end[1]>r.root.start[1]+.15,`IjaChoppedFallBack: ends on the ground behind his root (${r.root.end})`);
}
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
assert.ok(["origin","axis","up"].every(k=>ijaA.propMounts?.bayonet?.[k]?.length===3&&ijaA.propMounts.bayonet[k].every(Number.isFinite)),"TengxianIja02: bayonet scabbard mount");

// ---- director data (2026-09-27 rework, docs/Data_OpeningPinnedRescue20260927.md; space §2.1/§3) ---------------
assert.deepEqual([...C.phases.Trapped],["Banter","Orders","Incoming","Blast","Black","Wake","FrontPass","CaptiveDragged","CaptiveWall",
  "Interrogation","Slash","Taunt","Found"],"Trapped phases (2026-09-27 rework)");
assert.deepEqual([...C.phases.BunkerRescue],["Hold","Ask","Charge","Melee","Lift","Check","KickRifle","Released"],"BunkerRescue phases (2026-09-27 rework)");
assert.deepEqual([...C.phases.RearTrench],["Withdraw","Corner","Collection","SupportOrder"],"contract §5.3 RearTrench phases");
assert.ok(!("cinematic" in C.interrogation),"no cut-away camera (user: 「保持第一人称，不在切换视角」)");
{
  const {MISSION_PLACEMENT:Place,MISSION_LAYOUT:Layout}=await import("./Data_FirstLevelMissionLayout.mjs");
  const {MISSION_TUNING:Tune}=await import("./Data_Tuning_FirstLevel.mjs");
  const {PROPS:SetProps}=await import("./Data_OpeningSet0103.mjs");
  const D=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
  const blocks=Layout.scenario.states.find(state=>state.id==="BunkerCollapsed").blocks,Block=id=>blocks.find(b=>b.id===id);
  const postN=Block("BunkerMouthPostN"),postS=Block("BunkerMouthPostS");
  const S=C.shunzi,eye=S.witnessEye,seat=S.seat;
  // Pinned across the doorway (「主角变成压在房梁下，半个身子在外面」): the hips under the roof timber between the posts, the eye
  // outside them, closer to the comrade than the old in-mouth eye (3.8 m).
  assert.ok(S.pinnedHips.x>postN.x-.4&&S.pinnedHips.x<postN.x+.2&&S.pinnedHips.z>postS.z-1.5&&S.pinnedHips.z<postS.z-.5,"his hips lie in the doorway between the posts");
  assert.ok(eye.x>postN.x+.5&&D(eye,S.pinnedHips)>.8&&D(eye,S.pinnedHips)<1.05,"chest and head outside the posts (hips to eye ~0.9 m)");
  const timber=SetProps.find(p=>p.id==="roofTimberDown");
  assert.ok(Math.abs(timber.a.x-S.pinnedHips.x)<.1&&Math.abs(timber.b.x-S.pinnedHips.x)<.1&&timber.settle.phase==="Black","the roof timber lies on his hips from the black");
  const wall={x:4.0568,z:-125.7852};
  assert.ok(D(eye,wall)<2.5,`the comrade kneels ${D(eye,wall).toFixed(2)} m from the pinned eye (was 3.8 m)`);
  assert.ok(D(seat,Place.bunker.player)<1&&seat.x<S.trap.x-1.5,"SB01 seat at the back of the dugout, near the dugout anchor");
  // 2026-09-29 the gear-up (Data_OpeningFirstPersonGear): after the order he takes up the pack at the west wall and hurries to the mouth,
  // arriving as the wounded comrade squeezes out (Incoming) and well before the shell.
  {
    const {OPENING_GEAR_UP:GEAR}=await import("./Data_OpeningFirstPersonGear.mjs"),{GearArrivalS,GearCamera,GearPoint}=await import("./Script_OpeningFirstPersonGear.mjs");
    const ctx={seat,followTo:S.followTo,seatEyeM:.97},run=GEAR.cam.moves.find(m=>m.mps),arrive=GearArrivalS(ctx);
    assert.ok(S.followTo.x<postS.x-.3&&S.followTo.x>seat.x+1.5&&S.followTo.z>postN.z+.4&&S.followTo.z<postS.z-.4,`he stops inside the mouth, between the posts (${S.followTo.x},${S.followTo.z})`);
    assert.ok(run.mps>=1.4&&run.mps<=2,`he hurries: ${run.mps} m/s run (it was 0.24 m/s, 6+ s for the ${D(seat,S.followTo).toFixed(1)} m)`);
    // The comrade is out of the mouth at the rise (0.4 + 2.8 s) plus his walk to comradeBlast; Blast comes after Incoming has begun.
    const comradeOut=.4+2.8+D(C.banter.comradeSeat,C.banter.comradeBlast)/C.speed.walk;
    assert.ok(arrive<=comradeOut+.6&&arrive<GEAR.doneS&&GEAR.doneS<=C.timeouts.ordersExitS,`he is at the mouth (${arrive.toFixed(2)} s) as the comrade is out (${comradeOut.toFixed(2)} s), inside ordersExitS`);
    assert.ok(GEAR.pack.rest.x<seat.x-.3&&D(GEAR.pack.rest,seat)<1.2&&GEAR.cam.pad.x<seat.x&&D(GEAR.cam.pad,GEAR.pack.rest)<.6,"the pack lies at the west wall within a step of the seat; he steps to it");
    assert.ok(S.blastFall.x<S.followTo.x&&D(S.blastFall,S.followTo)<2,"the near miss throws him back from the mouth to blastFall");
    // Every track is in time order; the eye sits where the seat's shot left it at the order (no jump into the first key).
    for(const [name,keys] of [["yaw",GEAR.cam.yawDeg],["pitch",GEAR.cam.pitchDeg],["height",GEAR.cam.heightM],["roll",GEAR.cam.rollDeg],["rifle",GEAR.rifle.keys],["pack",GEAR.pack.keys],["left hand",GEAR.hands.l],["right hand",GEAR.hands.r],["cues",GEAR.cues]])
      assert.ok(keys.every((k,i)=>!i||k[0]>keys[i-1][0]||name==="cues"&&k[0]>=keys[i-1][0]),`gear-up ${name} keys are in time order`);
    assert.ok(Math.abs(GEAR.cam.yawDeg[0][1]-C.banter.seatShot.yawDeg)<1e-9&&Math.abs(GEAR.cam.pitchDeg[0][1]-C.banter.seatShot.pitchDeg)<3,"the gear-up starts on the seat's look");
    const at0=GearCamera(0,ctx);assert.ok(Math.hypot(at0.x-seat.x,at0.z-seat.z)<1e-9&&at0.speed<1e-6,"and on the seat, standing still");
    const p=GearPoint(GEAR.doneS,ctx);assert.ok(Math.hypot(p.x-S.followTo.x,p.z-S.followTo.z)<1e-9,"and ends on followTo");
  }
  // The walk from the kill to the find stays on the trench floor and ends over his head; the squat is at his head.
  const J=C.ija;
  assert.ok(D(J.found,eye)>.9&&D(J.found,eye)<1.4&&D(J.crouch,eye)>.5&&D(J.crouch,eye)<.7,"ijaA stops 1.1 m off, then squats 0.6 m in front of his face");
  assert.ok(J.tauntWalk.every((p,i,all)=>p.x<=(i?all[i-1].x:4.3))&&J.tauntWalk.at(-1).x>J.found.x,"he walks west toward the mouth");
  assert.ok(Math.abs(J.found.yaw-Math.PI/2)<1e-6&&Math.abs(J.crouch.yaw-Math.PI/2)<1e-6,"facing west onto the pinned man");
  // 02: the questioning's marks, the charge and the haul stand clear of the mouth's collapse blocks.
  const R=C.rescue;
  const solid=["BunkerMouthRubbleS","BunkerMouthSpoil","BunkerMouthPostS","BunkerMouthPostN"].map(Block);
  const Clear=(p,m)=>solid.every(b=>!(Math.abs(p.x-b.x)<b.w/2+m&&Math.abs(p.z-b.z)<b.d/2+m));
  const Rot=(y,x,z)=>({x:x*Math.cos(y)+z*Math.sin(y),z:-x*Math.sin(y)+z*Math.cos(y)});
  const Stage=(stage,role,anchor)=>{const a=manifest.stages[stage].actors[role],d=Rot(anchor.yaw,a.x,a.z);return {x:anchor.x+d.x,z:anchor.z+d.z};};
  const parry={...J.crouch,yaw:J.crouch.yaw+R.parryTurnDeg*Math.PI/180};
  const heParry=Stage("chopParry","heyoutian",parry),luoChop=Stage("chopRear","luo",R.ijaBGuard);
  for(const [name,p,m] of [["ijaA's crouch",J.crouch,.1],["the interpreter's squat",R.interpreter,.1],["ijaB's guard",R.ijaBGuard,.3],
    ["He's parry mark",heParry,.2],["Luo's chop mark",luoChop,.3],["Liu's firing spot",R.liuShot,.2],["Liu's trench post",R.liuCover,.3],
    ["He's timber spot",R.lift.heLift,.1],["Luo's check kneel",R.luoCheck,.3],["the hand-back seat",S.cover,.3],
    ["Luo's kick spot",R.kickFrom,.2],["He's trench-edge post",R.heCover,.3]])
    assert.ok(Clear(p,m),`02: ${name} (${p.x.toFixed(2)},${p.z.toFixed(2)}) stands clear of the mouth's collapse blocks`);
  assert.ok(D(R.interpreter,eye)>=1.2&&D(R.interpreter,J.crouch)>=.6,"the interpreter squats 1.2 m+ off the lens and clear of ijaA");
  // He's parry mark is off the line from the eye through ijaA (he shows beside him, not straight behind his back).
  const Bearing=(a,b)=>Math.atan2(b.x-a.x,-(b.z-a.z))*180/Math.PI;
  assert.ok(Math.abs(Bearing(eye,heParry)-Bearing(eye,J.crouch))>25,`He's parry shows beside ijaA from the eye (${(Bearing(eye,heParry)-Bearing(eye,J.crouch)).toFixed(0)} deg)`);
  // The charge comes over the crater step at the right of the pinned eye, from out of its sight.
  const {Sight,Eye}=await import("./Script_FirstLevelSpaceProbe.mjs");
  for(const [name,p] of [["Luo",R.luoStart],["He",R.heStart],["Liu",R.liuStart],...R.extras.map(e=>[e.id,e.start])])
    assert.ok([1.7,1.2].every(h=>Sight(Eye(eye,.44),Eye(p,h),{state:"BunkerCollapsed"})!=null)||Math.abs(Bearing(eye,p)-90)>60,`${name} waits out of the pinned man's view (bearing ${Bearing(eye,p).toFixed(0)})`);
  assert.equal(R.chargeRoute.at(-1).x,3.3,"the charge comes down the crater step into the front trench");
  // Slaps: one each way, landing on the questioning's lines; the raised hand for the third before the charge.
  assert.deepEqual(R.slap.blows.map(b=>b.side).sort(),[-1,1],"a forehand and a backhand");
  assert.ok(R.slap.recoverS<R.slap.dizzyS&&R.slap.yawDeg>=15&&R.slap.yawDeg<=35,"the head snaps aside and back; the struck side swims longer");
  // The haul: from the pinned eye out onto the seat.
  // LuoDragToCover's collar track at haulStopS: the eye comes out past the seat and he sits back onto it.
  {
    const track=JSON.parse(Read("./Animation/OpeningStoryboards/Animation_TengxianNra05OpeningStoryboards.json")).clips.LuoDragToCover.player;
    const k=Math.min(track.parts.collar.length/3-1,Math.round(R.lift.haulStopS*track.fps)),travel=track.parts.collar[k*3+2]-track.parts.collar[2];
    const out=eye.x+travel;
    assert.ok(out>S.cover.x&&out-S.cover.x<.6,`Luo hauls him out just past the seat (eye to x ${out.toFixed(2)}), he sits back onto it`);
    const corpse=R.parryMeet;
    assert.ok(D(corpse,S.cover)>.7&&Math.abs(corpse.z-eye.z)>.5,"ijaA dies down the trench, off the haul and the seat");
  }
  // The kicked rifle slides past his front to his right hand (clear of the collapse blocks).
  const slide=[R.rifleMouth,R.rifleKickVia,R.rifleKicked];
  for(let i=1;i<slide.length;i++)for(let k=0;k<=20;k++){
    const p={x:slide[i-1].x+(slide[i].x-slide[i-1].x)*k/20,z:slide[i-1].z+(slide[i].z-slide[i-1].z)*k/20};
    assert.ok(Clear(p,.05),`the kicked rifle's slide keeps clear of the collapse blocks at (${p.x.toFixed(2)},${p.z.toFixed(2)})`);
  }
  assert.ok(D(R.rifleKicked,S.cover)<Tune.interactionRangeM-1,"Luo's kick leaves the rifle within easy reach of the seat");
  assert.ok(D(R.rifleMouth,eye)>.8,"the rifle lies out of his reach while he is pinned");
  // SB02 (contract §2.2): the fall ends in the dugout, looking at the north post with the head rolled left.
  const B=C.banter.blastShot;
  assert.ok(B.fallStartS<B.fallEndS&&B.fallEndS<B.eyesCloseS&&B.eyesCloseS<B.phaseS,"blast: fall, then the eyes close, then Black");
  assert.ok(B.rollDeg>=12&&B.yawDeg<-50&&B.yawDeg>-80,"blast: mirrored (yaw -66, head rolled left)");
  const {OPENING_DEPTH_WALKERS:Walkers,OPENING_DEPTH_IJA:DepthIja}=await import("./Data_FirstLevelBackdropSquads.mjs");
  for(const m of Walkers.members)assert.ok(m.start.x>postN.x+5&&m.route.every((p,i,all)=>p.x>=(i?all[i-1].x:m.start.x)),`${m.id} walks away east from the mouth`);
  for(const m of DepthIja.members){
    if(m.flagKick){
      const {RouteClearance}=await import("./Script_FirstLevelSpaceProbe.mjs");
      const clearance=RouteClearance([m.start,m.flagKick.root,...m.route],{state:"BunkerCollapsed"});
      assert.deepEqual(clearance.hits,[],"flag kicker stays clear of scene solids");
      assert.deepEqual(clearance.slopes,[],"flag kicker does not climb the steep trench wall");
    }
    assert.ok(m.route.every((p,i,all)=>p.x>=(i?all[i-1].x:m.start.x)),`${m.id} walks away east`);
  }
  assert.ok(R.extras.every(e=>!e.victim||R.depthPost[e.victim]),"a charging man's victim holds a post");
  // Storyboard shots and wave-1 stand-ins (contract §4.6).
  assert.ok(C.storyboardShots.length>=2&&C.storyboardShots.every(s=>/^SB0[1-9]/.test(s.id)&&(s.when||s.phase&&Number.isFinite(s.age))&&s.judge),"storyboard shots are well formed");
  for(const e of C.pendingWiring){
    assert.ok(["shot","what","now","wave2"].every(k=>typeof e[k]==="string"&&e[k].length>3),"pendingWiring entry "+JSON.stringify(e));
    assert.ok(C.storyboardShots.some(s=>s.id===e.shot||s.id.startsWith(e.shot+"_")),`pendingWiring names a storyboard shot (${e.shot})`);
  }
  {
    const judged=C.storyboardShots.flatMap(s=>Object.entries(s.judge?.actors||{}).map(([role,w])=>({shot:s.id,role,w})));
    const allowances=judged.filter(({w})=>w.behindOk||w.coverOk||w.headOptional);
    assert.ok(C.wave===1||C.wave===2,`wave is 1 or 2 (${C.wave})`);
    if(C.wave===2){
      assert.deepEqual(C.pendingWiring,[],"wave 2: every stand-in is wired (pendingWiring empty)");
      assert.deepEqual(allowances.map(a=>a.shot+":"+a.role),[],"wave 2: no behindOk / coverOk / headOptional left in storyboardShots");
    }else for(const a of allowances){
      assert.ok(C.pendingWiring.some(e=>e.shot===a.shot.split("_")[0]),`wave 1: ${a.shot} ${a.role}'s allowance has a pendingWiring entry`);
    }
  }
  // The withdrawal routes back from the SB06 posts (Script_OpeningStoryboards Aftermath).
  {
    const W=C.withdraw,Same=(a,b)=>D(a,b)<1e-6;
    assert.ok(W.heBackRoute.every((p,i)=>Same(p,W.lane[3+i]))&&Same(W.heBackRoute.at(-1),W.luoCover),"He's way back follows the lane to the first intact wall");
    assert.ok(W.liuBackRoute.slice(1).every((p,i)=>Same(p,W.lane[3+i])),"Liu's way back follows the lane from the crater step to RC");
  }
  assert.ok(Math.abs(S.cover.yaw*180/Math.PI+94)<1&&R.checkShot.kickPitchDeg>=-15&&R.checkShot.kickPitchDeg<=5,"SB06: east down the trench; the hand-back view is not at the ground");
  for(const [name,route] of [["runner",C.banter.runnerRoute],["exit",C.banter.exitRoute],["walkIn",C.ija.walkIn],["taunt",C.ija.tauntWalk],
    ["charge",R.chargeRoute],["flee",C.ija.interpreterFlee],["withdraw",C.withdraw.lane]])
    assert.ok(route.length>=1&&route.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.z)),`${name} route is a finite polyline`);
  // Every director wait has a finite timeout (the show can never stall).
  assert.ok(Object.values(C.timeouts).every(v=>Number.isFinite(v)&&v>0),"all director timeouts are finite and positive");
  assert.deepEqual([...C.vanguardIds].sort(),["BunkerExecutionerA","BunkerExecutionerB","BunkerFollowB"],"hand-back waits for ijaA, ijaB and ijaD only");
}
// Two methods of one name in a class: the later silently replaces the earlier (09-24 review: the corner
// man's rifle shot had become the camera's Shot and his loop fired without sound, flash or tracer).
{
  const source=fs.readFileSync(new URL("./Script_OpeningStoryboards.mjs",import.meta.url),"utf8");
  const names=[...source.matchAll(/^  (?:static )?(?:async )?([A-Za-z_]\w*)\([^)]*\)\{/gm)].map(m=>m[1]);
  const twice=names.filter((name,i)=>names.indexOf(name)!==i);
  assert.deepEqual(twice,[],"the director class has no duplicate method names");
  assert.match(source,/CornerFire\([^)]*\)\{[\s\S]*?this\.FireRifle\(/,"the corner man's loop fires a real rifle shot");
  assert.ok(Object.values(C.pursuit).every(v=>Number.isFinite(v)&&v>0),"pursuit tuning is finite");
  const {RouteClearance}=await import("./Script_FirstLevelSpaceProbe.mjs");
  const {MISSION_ENCOUNTERS}=await import("./Data_FirstLevelMission.mjs");
  for(const spec of MISSION_ENCOUNTERS.bunkerPursuit)if(spec.route){
    const clearance=RouteClearance([spec,...spec.route],{state:"BunkerCollapsed"});
    assert.deepEqual(clearance.hits,[],`${spec.id}: the pursuit corridor clears real scene solids`);
    assert.deepEqual(clearance.slopes,[],`${spec.id}: the pursuit corridor stays within the climb limit`);
  }
}
// ---- reproducibility (optional): --rebake=<dir> holds rig files from `OPENING_PASS=verify` (the repository bake
// script, any subset of clips); every clip in them must be the committed clip -- every bone within 0.5 deg and
// 1 mm (source metres) in the rig's world on every frame (fingers excluded, as at the hand-overs).
const rebake=process.argv.find(arg=>arg.startsWith("--rebake="))?.slice(9);
if(rebake){
  // relative to the worktree root (where the bake's verify pass writes tmp/OpeningStoryboards/Verify), or absolute
  const dir=path.resolve(fileURLToPath(new URL("../",import.meta.url)),rebake),off=[];let compared=0;
  for(const rig of RIGS){
    const file=path.join(dir,`Animation_${rig}OpeningStoryboards.json`);
    if(!fs.existsSync(file))continue;
    const fresh=JSON.parse(fs.readFileSync(file)),asset=assets.get(rig);
    assert.deepEqual(fresh.bones,asset.bones,`${rig}: rebake bone order`);
    for(const id of Object.keys(fresh.clips)){
      const a=asset.clips[id],b=fresh.clips[id];
      assert.ok(a,`${rig}/${id}: rebaked clip is committed`);assert.equal(b.frameCount,a.frameCount,`${rig}/${id}: frame count`);
      let angle=0,offset=0,where="";
      for(let f=0;f<a.frameCount;f++){
        const t=f*a.duration/(a.frameCount-1),x=WorldPose(rig,asset,id,t),y=WorldPose(rig,fresh,id,t);
        x.forEach((p,i)=>{
          if(/Finger\d\d|Nub/.test(asset.bones[i]))return;
          const q=y[i],deg=2*Math.acos(Math.min(1,Math.abs(p.q[0]*q.q[0]+p.q[1]*q.q[1]+p.q[2]*q.q[2]+p.q[3]*q.q[3])))*180/Math.PI;
          if(deg>angle){angle=deg;where=`${asset.bones[i]} frame ${f}`;}
          offset=Math.max(offset,Math.hypot(p.p[0]-q.p[0],p.p[1]-q.p[1],p.p[2]-q.p[2]));
        });
      }
      if(angle>.5||offset>.001)off.push(`${rig}/${id}: ${angle.toFixed(2)} deg at ${where}, ${(offset*1000).toFixed(1)} mm`);
      compared++;
    }
  }
  assert.ok(compared>0,`--rebake=${rebake}: no rig files`);
  assert.deepEqual(off,[],"the repository bake script reproduces the committed clips");
  console.log(`ok rebake: ${compared} rig clips from ${rebake} equal the committed ones (<=0.5 deg, 1 mm)`);
}
console.log(`ok opening storyboards: five original rigs, ${clipCount} rig clips (${NEW.length} authored 2026-09-23/25, ${paired} paired contacts cross-checked, ${chains} same-root hand-overs, ${seams} hold-loop seams), ${frames} normalized frames, director phase table and marks; largest own-axis limb turn in a frame ${twistWorst.toFixed(0)} deg (${twistAt})`);

// Interpreter entry: swept bodies stop a crossing even when one frame would clear the far side.
{
  const {FirstLevelBunkerShow}=await import("./Script_OpeningStoryboards.mjs");
  const show=Object.create(FirstLevelBunkerShow.prototype);
  const actor={alive:true,position:{x:-1,y:0,z:0}},guard={alive:true,position:{x:0,y:0,z:0}};
  show.r={enemies:new Map([["guard",guard]])};show.cast={interpreter:actor};show.flags={};
  const to={x:1,z:0};show.AvoidInterpreterOverlap({x:-1,z:0},to,actor);
  assert.ok(to.x<=-C.interpreterClearanceM,"a fast frame cannot tunnel through the guard");
  const escaping={x:-1,z:0};show.AvoidInterpreterOverlap({x:-.5,z:0},escaping,actor);
  assert.equal(escaping.x,-1,"an existing overlap can separate naturally");
  guard.openingStoryboardHidden=true;
  const open={x:1,z:0};show.AvoidInterpreterOverlap({x:-1,z:0},open,actor);
  assert.equal(open.x,1,"offstage actors do not block the lane");
  const {RouteClearance}=await import("./Script_FirstLevelSpaceProbe.mjs");
  const path=[...C.ija.interpreterEnter,C.interrogation.interpreterAt];
  const clear=RouteClearance(path,{state:"BunkerCollapsed"});
  assert.deepEqual(clear.hits,[]);assert.deepEqual(clear.slopes,[]);
  for(const guard of [{x:18.26,z:-125.65},{x:14.08,z:-124.62},C.interrogation.ijaBAt]){
    for(let i=1;i<path.length;i++){
      const a=path[i-1],b=path[i],dx=b.x-a.x,dz=b.z-a.z;
      const t=Math.max(0,Math.min(1,((guard.x-a.x)*dx+(guard.z-a.z)*dz)/(dx*dx+dz*dz||1)));
      assert.ok(Math.hypot(a.x+t*dx-guard.x,a.z+t*dz-guard.z)>=C.interpreterClearanceM+.05,"authored passing route leaves a body margin");
    }
  }
  assert.ok(C.timeouts.wakeS>=C.blackoutRecovery.fadeS&&C.blackoutRecovery.fadeS>=5,"wake cannot cut off the slow full-screen fade");
  assert.ok(Math.hypot(C.interrogation.interpreterAt.x-C.interrogation.ijaBAt.x,C.interrogation.interpreterAt.z-C.interrogation.ijaBAt.z)>1.2,"interrogation roots do not overlap");
  // 02 questioning where he lies (2026-09-27 rework): the interpreter trots from his SB03 mark to his squat at the pinned
  // man's right front without crossing between ijaA's squat and the eye, and squats 1.2 m+ off the lens, 0.6 m+ off ijaA.
  const R=C.rescue,eye=C.shunzi.witnessEye,crouch=C.ija.crouch,squat=R.interpreter;
  const returnPath=[C.interrogation.interpreterAt,...R.interpreterReturn,squat];
  const returnClear=RouteClearance(returnPath,{state:"BunkerCollapsed",radius:0});
  assert.deepEqual(returnClear.hits,[]);assert.deepEqual(returnClear.slopes,[]);
  const Near=(p,a,b)=>{const dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz||1)));return Math.hypot(a.x+t*dx-p.x,a.z+t*dz-p.z);};
  for(let i=1;i<returnPath.length;i++){
    const a=returnPath[i-1],b=returnPath[i];
    assert.ok(Near(crouch,a,b)>R.interpreterClearanceM,"the interpreter's way to his squat passes ijaA with a margin");
    assert.ok(Near(eye,a,b)>=.9,`the interpreter's way keeps off the pinned eye (${a.x},${a.z})-(${b.x},${b.z})`);
  }
  assert.ok(Math.hypot(squat.x-eye.x,squat.z-eye.z)>=1.2&&Math.hypot(squat.x-crouch.x,squat.z-crouch.z)>=.6,"the squat: 1.2 m+ off the eye, 0.6 m+ off ijaA");
  // His flight runs east down the trench's north side, clear of the crater step the charge comes down.
  const step=R.chargeRoute.at(-1);
  assert.ok(C.ija.interpreterFlee.slice(0,3).every(p=>Math.hypot(p.x-step.x,p.z-step.z)>1.2),"the flight keeps off the foot of the crater step");
  console.log("ok interpreter swept clearance, passing route and sustained blackout recovery");
}
