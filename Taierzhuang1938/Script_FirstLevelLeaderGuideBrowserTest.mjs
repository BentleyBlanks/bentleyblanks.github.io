// Targeted fixture exercises real AI/physics/rig/HUD; it is not campaign evidence.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {LaunchBrowser} from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import {ServeRoot} from "./Script_DevServer.mjs";
const here=path.dirname(fileURLToPath(import.meta.url)),out=path.join(here,"_shots/LeaderGuide");
await fs.mkdir(out,{recursive:true});
const server=process.env.LEADER_GUIDE_PREVIEW?null:await ServeRoot(path.resolve(here,".."),0);
const origin=process.env.LEADER_GUIDE_PREVIEW||"http://127.0.0.1:"+server.address().port;
const browser=await LaunchBrowser(),page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[],trace=[];
page.on("pageerror",e=>{errors.push(String(e));console.log("PAGEERROR",String(e));});
try{
 await page.goto(origin+"/Taierzhuang1938/?whitebox=p012&shot=1&manual=1&quality=high&scale=small",{waitUntil:"domcontentloaded",timeout:180000});
 await page.waitForFunction(()=>window.Tengxian?.state.ready,null,{timeout:240000});
 const planned=await page.evaluate(async()=>{
  // Use a travelling stage, not phase 07's newly authored black-screen transition.
  const g=window.Tengxian;await g.Debug.FirstLevelJump(11);
  const r=g.Debug.FirstLevelMissionRuntime(),{MISSION_ROUTES:R}=await import("./Data_FirstLevelMissionLayout.mjs");
  for(const s of [...g.ai.soldiers])if(!r.squad.includes(s))g.ai.Remove(s);
  r.enemies.clear();r.spawnQueue=[];r.voice.queue=[];r.voice.CancelGuidance();r.voice.Finish();
  // Isolate guide mechanics from stage progression and unrelated combat randomness.
  r.Update=function(dt){this.delta=dt;this.time+=dt;this.UpdateSquad();this.leaderGuide.Update();};
  // Actual failed campaign position: a trailing leader already inside the south
  // corridor must not loop back to an obsolete tank-supply stop at z=-124.
  const leader=r.leaderGuide.Leader;
  r.PlaceActor(leader,{x:-6.46,z:-87.34});
  r.squadRoutes.set(leader.id,[{x:6,z:-124},{x:-8,z:-112},{x:-8,z:-102}]);
  r.Guide(R.south);
  const joined=r.squadRoutes.get(leader.id);
  if(joined[0].z<-95)throw new Error("A clear nearby south-route join must replace the old front detour");
  if(joined.length>128)throw new Error("Guide checkpoints must respect the shared route budget");
  // Repeated later route changes must not accumulate old guide detours.
  for(let i=0;i<4;i++){r.Guide(R.village.slice(0,3));r.Guide(R.south);}
  if(r.squadRoutes.get(leader.id).length>128)throw new Error("Repeated guidance route inflation");
  // 队伍摆在第一个带路停点前面一小段。共用行进层有自己的牵引绳
  // （SQUAD_MARCH.waitDistanceM 22 m）：玩家落后超过那个数，班长走不到停点就被
  // 行进层按住了，带路层的「到停点等人」根本轮不上（march 显示 waiting、
  // missionGuideWaiting 始终 false）。这条夹具要量的是带路层，不是牵引绳。
  r.squad.forEach((s,i)=>{r.PlaceActor(s,{x:-12.4+(i%2?.6:-.6),z:-44.8-i*2});s.target=null;s.suppression=0;s.incomingFire=null;s.missionDangerUntil=0;});
  g.player.Spawn(-15,-50,Math.PI);
  r.Guide(R.south.slice(3),{fromStart:true});
  g.StepFrames(1,1/60,false);
  return r.leaderGuide.State();
 });
 console.log("planned",JSON.stringify(planned));
 assert.ok(planned.stops.length>=2,"actual road route supplies multiple clear waiting positions");
 const Sample=async(label,frames=120)=>{
  const sample=await page.evaluate(({label,frames})=>{
   const g=window.Tengxian,r=g.Debug.FirstLevelMissionRuntime();g.StepFrames(frames,1/60,false);
   const a=r.leaderGuide.Leader;
   return {label,time:r.time,p:{...a.position},yaw:a.yaw,waiting:a.missionGuideWaiting,route:r.squadRoutes.get(a.id)?.slice(0,3),
     actualGoal:{...a.goal},speed:a.moveSpeed,march:a.squadMarchCommand?.status,guide:r.leaderGuide.State()};
  },{label,frames});trace.push(sample);return sample;
 };
 let held;
 // 玩家在后头跟着走。班长被「离玩家太远」那条绳子（MISSION_GUIDE_TUNING.waitDistanceM 36 m）
 // 按住的时候，他离自己的第一个停点往往只差不到一米：玩家钉在原地不动，这条绳子就永远
 // 松不开，带路层自己的「走到停点、转身等人」根本轮不上（实测停在停点前 0.75–0.85 m，
 // march 报 waiting 而 missionGuideWaiting 一直是 false）。跟到还差十五米的位置就停——
 // 十五米比 rejoinM(7 m) 远，所以到了停点他还是得等人。
 for(let i=0;i<60;i++){
  held=await Sample("player-behind");
  if(held.waiting&&held.guide.waiting!=null)break;
  await page.evaluate(gap=>{
   const g=window.Tengxian,r=g.Debug.FirstLevelMissionRuntime(),a=r.leaderGuide.Leader;
   const p=g.player.position,d=Math.hypot(p.x-a.position.x,p.z-a.position.z);
   if(d<=gap)return;
   const along=(d-gap)/d;
   g.player.Spawn(p.x+(a.position.x-p.x)*along,p.z+(a.position.z-p.z)*along,g.player.yaw);
  },15);
 }
 console.log("held",JSON.stringify(held));
 assert.ok(held.waiting&&held.guide.waiting!=null,"leader physically reaches a checkpoint and waits");
 const stable=await Sample("hold",240);
 assert.ok(Math.hypot(stable.p.x-held.p.x,stable.p.z-held.p.z)<.35,"waiting leader holds his position");
 assert.equal(stable.guide.released.length,0);
 await page.evaluate(()=>{
  const g=window.Tengxian,r=g.Debug.FirstLevelMissionRuntime(),a=r.leaderGuide.Leader;
  g.player.yaw=Math.atan2(g.player.position.x-a.position.x,g.player.position.z-a.position.z);
  g.player.pitch=0;g.StepFrames(2,1/60,true);
 });
 const marker=await page.locator(".hudMissionGuide").evaluate(el=>({hidden:el.hidden,text:el.textContent,mode:el.dataset.mode,
  display:getComputedStyle(el).display,pointer:getComputedStyle(el).pointerEvents,rect:{x:el.getBoundingClientRect().x,y:el.getBoundingClientRect().y}}));
 assert.ok(!marker.hidden&&marker.display!=="none");assert.equal(marker.mode,"rally");assert.equal(marker.pointer,"none");
 await page.screenshot({path:path.join(out,"Scene_LeaderWait.png")});
 // Turn the actual player, and keep the marker on the correct screen edge.
 await page.evaluate(()=>{const g=window.Tengxian;g.player.yaw+=Math.PI;g.StepFrames(2,1/60,true);});
 assert.ok(await page.locator(".hudMissionGuide").evaluate(el=>el.classList.contains("offscreen")));
 await page.screenshot({path:path.join(out,"Scene_LeaderBehind.png")});
 const subtitleClearance=await page.evaluate(async()=>{
  const g=window.Tengxian,h=g.hud;
  const {MISSION_DIALOGUE,MISSION_VOICE_CAST}=await import('./Data_FirstLevelMissionDialogue.mjs');
  // ReceptionWithdrawal 随 2026.09.19 的台词表重写下线了。这一段量的是字幕占多高、
  // 世界标记会不会压在字幕上，随便哪条多行台词都行 —— 换成还在表里的一条。
  const cue=MISSION_DIALOGUE.find(c=>c.id==='BorrowLight'),lead=cue.lines.at(-1),aside=cue.lines[1];
  const original=h.missionGuide,angle=h.el.missionGuide.style.getPropertyValue('--guide-angle');
  const Measure=()=>{
    h.RenderMissionGuide();
    const subtitle=h.el.subtitle.getBoundingClientRect();
    const pieces=[...h.el.missionGuide.children].filter(e=>getComputedStyle(e).display!=='none'&&Number(getComputedStyle(e).opacity)>0)
      .map(e=>e.getBoundingClientRect());
    return {markerBottom:Math.max(...pieces.map(r=>r.bottom)),subtitleTop:subtitle.top,
      angle:h.el.missionGuide.style.getPropertyValue('--guide-angle')};
  };
  h.Say(MISSION_VOICE_CAST[lead.who][0],lead.text,30);const single=Measure();
  h.SayLines([aside,lead].map((line,i)=>({speaker:MISSION_VOICE_CAST[line.who][0],text:line.text,emphasis:i?'lead':'aside'})),30);
  const stacked=Measure();
  h.SetMissionGuide({...original.view,distance:1},original.context);const near=Measure();
  let reads=0;const bounds=h.el.subtitle.getBoundingClientRect;
  h.el.subtitle.getBoundingClientRect=function(){reads++;return bounds.call(this);};
  h.guideSubtitleBounds=null;for(let i=0;i<30;i++)h.RenderMissionGuide();
  h.el.subtitle.getBoundingClientRect=bounds;
  return {single,stacked,near,reads,angle};
 });
 for(const sample of [subtitleClearance.single,subtitleClearance.stacked,subtitleClearance.near]){
  assert.ok(sample.markerBottom+10<=sample.subtitleTop,'all marker text clears the real subtitle footprint');
  assert.equal(sample.angle,subtitleClearance.angle,'subtitle avoidance retains the true target bearing');
 }
 assert.equal(subtitleClearance.reads,1,'stationary subtitle bounds are not measured every frame');
 await page.waitForTimeout(350);
 await page.screenshot({path:path.join(out,"Scene_LeaderSubtitleClearance.png")});
 await page.evaluate(()=>window.Tengxian.hud.SayLines([],0));
 await fs.writeFile(path.join(out,'Data_SubtitleClearance.json'),JSON.stringify(subtitleClearance,null,2));
 await page.waitForTimeout(6800);
 assert.ok(await page.locator(".hudObjective").evaluate(el=>Number(getComputedStyle(el).opacity)<.01),"brief objective fades without removing the world marker");
 const rejoin=await page.evaluate(()=>{
  const g=window.Tengxian,r=g.Debug.FirstLevelMissionRuntime(),a=r.leaderGuide.Leader;
  // Test fixture relocation, then the release/movement remain ordinary runtime AI.
  g.player.Spawn(a.position.x,a.position.z-4,Math.PI);
  g.StepFrames(30,1/60,false);return r.leaderGuide.State();
 });
 assert.equal(rejoin.released.length,1,"catching up releases one checkpoint");
 // 带路的这一段走得很慢（共用行进层给班长的配速实测 0.35 m/s 上下），四秒挪不够一米。
 // 多给几段时间，量的还是「他真的又走起来了」，不是「四秒内走了多远」。
 let moved=await Sample("advance",240);
 for(let i=0;i<6&&Math.hypot(moved.p.x-held.p.x,moved.p.z-held.p.z)<=1;i++)moved=await Sample("advance",240);
 assert.ok(Math.hypot(moved.p.x-held.p.x,moved.p.z-held.p.z)>1,"leader resumes actual movement");
 assert.ok(moved.guide.events.some(e=>e.kind==="rejoin"));
 // Compare with the same base actor sample: free-arm gesture must not drag the
 // two-handed rifle, shift planted feet or displace the actor root.
 const gesture=await page.evaluate(async()=>{
  const {Vector3,Quaternion}=await import("three"),g=window.Tengxian,r=g.Debug.FirstLevelMissionRuntime(),s=r.leaderGuide.Leader,a=s.actor,b=a.characterRig.bones;
  s.target=null;s.targetVisible=false;s.suppression=0;s.missionGrenadeEvade=null;s.missionCarriageAction=null;
  a.characterRig.ForceClip(null);s.missionGuideGesture=0;
  const state={moveSpeed:0,elapsed:r.time,firing:false};
  a.Update(.1,state);a.root.updateWorldMatrix(true,true);
  const Observe=()=>({feet:[b.footL,b.footR].map(b=>b.getWorldPosition(new Vector3()).toArray()),
   hand:b.handL.getWorldPosition(new Vector3()).toArray(),right:b.handR.getWorldPosition(new Vector3()).toArray(),
   gun:a.weaponGroup.getWorldQuaternion(new Quaternion()).toArray(),root:a.root.position.toArray()});
  // Remove only our layer, without resampling idle as a different firing pose.
  s.missionGuideGesture=1;for(let i=0;i<24;i++)a.Update(1/60,state);
  const posed=Observe(),weight=a.npcGuideGesture.weight;
  a.npcGuideGesture.Restore();a.root.updateWorldMatrix(true,true);
  const released=Observe();
  s.missionGuideGesture=1;a.Update(.4,state);
  a.Update(0,{...state,firing:true});
  const d=(a,b)=>new Vector3().fromArray(a).distanceTo(new Vector3().fromArray(b));
  return {weight,handTravel:d(posed.hand,released.hand),rightTravel:d(posed.right,released.right),
   footDrift:Math.max(...posed.feet.map((p,i)=>d(p,released.feet[i]))),
   gunAngle:new Quaternion().fromArray(posed.gun).angleTo(new Quaternion().fromArray(released.gun)),
   rootDrift:d(posed.root,released.root),releasedWeight:a.npcGuideGesture.weight};
 });
 console.log("gesture",JSON.stringify(gesture));
 assert.ok(gesture.weight>.9&&gesture.handTravel>.1);
 assert.ok(gesture.footDrift<.001&&gesture.rootDrift<.001&&gesture.rightTravel<.001&&gesture.gunAngle<.001,"gesture preserves feet, weapon and supporting hand");
 assert.equal(gesture.releasedWeight,0,"fire immediately owns the pose");
 // Clear quiet close-up using the same real actor, without using it as route evidence.
 await page.evaluate(async()=>{
  const g=window.Tengxian,r=g.Debug.FirstLevelMissionRuntime(),s=r.leaderGuide.Leader;
  r.PlaceActor(s,{x:-24,z:0});g.player.Spawn(-24,-4,Math.PI);g.player.pitch=-.08;
  r.squadRoutes.set(s.id,[]);s.holdZone={x:-24,z:0};s.target=null;s.targetVisible=false;s.suppression=0;
  g.StepFrames(180,1/60,false);
  r.time=Math.ceil(r.time/7)*7+.4;g.StepFrames(30,1/60,false);g.StepFrames(1,1/60,true);
 });
 await page.screenshot({path:path.join(out,"Scene_LeaderGesture.png")});
 await page.evaluate(async()=>{
  const g=window.Tengxian,r=g.Debug.FirstLevelMissionRuntime();
  r.leaderGuide.Dispose();g.hud.Update(0);
 });
 assert.ok(await page.locator(".hudMissionGuide").evaluate(el=>el.hidden));
 await page.evaluate(()=>window.Tengxian.Debug.FirstLevelJump(1));
 assert.ok(await page.locator(".hudMissionGuide").evaluate(el=>el.hidden),"new opening has no stale marker");
 assert.deepEqual(errors,[]);
 await fs.writeFile(path.join(out,"Data_LeaderGuideEvidence.json"),JSON.stringify({planned,held,stable,marker,rejoin,moved,gesture,errors},null,2));
 console.log("ok real leader waits/rejoins, safe hand/weapon pose, 720p HUD projection and clean runtime disposal");
}finally{
 await fs.writeFile(path.join(out,"Data_LeaderGuideTrace.json"),JSON.stringify({trace,errors},null,2));
 await browser.close();if(server)await new Promise(resolve=>server.close(resolve));
}
