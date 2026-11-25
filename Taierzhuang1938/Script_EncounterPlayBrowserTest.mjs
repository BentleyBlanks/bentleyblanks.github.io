import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {LaunchBrowser} from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import {ServeRoot} from "./Script_DevServer.mjs";
import {BeatById} from "./Scenes/FirstLevelEncounter/Script_LevelFlowModel.mjs";
import {EncounterPlayPlan} from "./Script_EncounterPlayPlan.mjs";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const out=path.join(root,"tmp/EncounterPlay");await fs.mkdir(out,{recursive:true});
const server=process.env.ENCOUNTER_TEST_BASE?null:await ServeRoot(root,0),browser=await LaunchBrowser();
const base=process.env.ENCOUNTER_TEST_BASE||"http://127.0.0.1:"+server.address().port;
const context=await browser.newContext({viewport:{width:1280,height:720},deviceScaleFactor:1});
const page=await context.newPage();
const errors=[];page.on("pageerror",e=>errors.push(e.message));
page.on("console",message=>{if(message.type()==="error"&&/THREE\.WebGL|Shader Error|INVALID_OPERATION/.test(message.text()))errors.push(message.text());});
await context.addInitScript(()=>{
 localStorage.setItem("tengxian1938_audio_v1",JSON.stringify({master:0}));
 localStorage.setItem("tengxian1938_tools_volume_v1",JSON.stringify({volume:0,muted:true}));
});
const State=()=>page.evaluate(()=>document.querySelector(".lfPlayHost iframe")?.contentWindow.Tengxian?.Debug.EncounterPlay?.State());
const debugKeys=["noCollision","fastMove","invincible","infiniteAmmo","infiniteGrenades"];
async function SavedDebugOptions(enabled) {
 const settings=await page.context().newPage();
 try {
  await settings.goto(base+"/Taierzhuang1938/index.html");
  await settings.locator('.mnItem[data-act="settings"]').click();
  await settings.locator('.mnSettingsItem[data-setting="debug"]').click();
  for(const key of debugKeys)await settings.locator(`.mnDebugRow[data-option="${key}"] input`).setChecked(enabled);
 } finally {await settings.close();}
}
async function CheckDebugOptions(frame,enabled) {
 const result=await frame.evaluate(()=>{
  const g=Tengxian;
  const options=g.Debug.DebugOptions(),player={...g.player.debug};
  g.state.ammo=0;g.StepFrames(1,1/60,false);
  const refilled=g.state.ammo;
  g.player.spawnGrace=0;
  const health=g.player.health;g.player.TakeHit(1,"torso",null,{bullet:true});
  return {options,player,refilled,healthBefore:health,healthAfter:g.player.health};
 });
 assert.deepEqual(result.options,Object.fromEntries(debugKeys.map(key=>[key,enabled])));
 assert.deepEqual(result.player,{noCollision:enabled,fastMove:enabled,invincible:enabled});
 assert.equal(result.refilled>0,enabled,"Play uses the saved infinite-ammo preference");
 if(enabled)assert.equal(result.healthAfter,result.healthBefore,"Saved invincibility blocks real player damage");
 else assert.ok(result.healthAfter<result.healthBefore,"Disabling invincibility restores real player damage");
 if(enabled) {
  const supply=await frame.evaluate(()=>{
   const g=Tengxian,before={ammo:g.state.ammo,shots:g.state.playerShots,grenades:g.state.grenades,projectiles:g.combat.projectiles.length};
   g.Debug.Fire();g.StepFrames(180,1/60,false);
   g.Debug.Throw("Grenade",.2);g.StepFrames(30,1/60,false);
   const after={ammo:g.state.ammo,shots:g.state.playerShots,grenades:g.state.grenades,projectiles:g.combat.projectiles.length};
   g.combat.ClearProjectiles();g.StepFrames(180,1/60,false);
   return {before,after};
  });
  assert.ok(supply.after.shots>supply.before.shots,"Infinite ammo still fires a real shot");
  assert.equal(supply.after.ammo,supply.before.ammo,"Infinite ammo does not consume a round");
  assert.ok(supply.after.projectiles>supply.before.projectiles,"Infinite grenades still launches a real grenade");
  assert.equal(supply.after.grenades,supply.before.grenades,"Infinite grenades does not consume inventory");
 }
}
async function FirstUse(frame,kill=false){
 return frame.evaluate(async kill=>{
  const {WEAPONS}=await import('./Data_Weapons.mjs');
  const g=Tengxian,known=new Set(g.renderer.info.programs.map(p=>p.cacheKey));
  const frames=[];
  const gl=g.renderer.getContext(),bufferData=gl.bufferData,largeUploads=[];
  gl.bufferData=function(...args){
    const bytes=typeof args[1]==="number"?args[1]:(args[1]?.byteLength||0);
    if(bytes>=16*1024*1024)largeUploads.push(bytes);
    return bufferData.apply(this,args);
  };
  const warming=g.state.warming;
  let target=null,actionMs=0;
  g.state.warming=true;
  try{
   if(kill){
    const actor=g.Debug.EncounterPlay.State().actors.find(a=>a.group==="Fork"&&a.alive);
    target=g.ai.soldiers.find(s=>s.id===actor.soldierId);
    const direction=g.camera.getWorldDirection(g.player.position.clone()),weaponId=g.viewmodel.weaponId;
    const shape=target.actor.GetBoneHitboxes().find(hit=>hit.id==="upperTorso");
    const point=shape.start.clone().lerp(shape.end,.5);
    target.health=1;
    const at=performance.now();
    target.TakeHit(WEAPONS[weaponId].damage,"torso",direction,{kind:"bullet",weaponId,shapeId:shape.id,point});
    g.vfx.Blood(point,direction,1);
    actionMs=performance.now()-at;
   }else g.Debug.Mouse(2,true);
   // One complete gameplay frame per display tick avoids an artificial GPU
   // command backlog from submitting ninety frames in one JavaScript task.
   for(let i=0;i<(kill?90:24);i++){
    await new Promise(resolve=>requestAnimationFrame(resolve));
    const at=performance.now();g.StepFrames(1,1/60,true);frames.push(performance.now()-at);
   }
  }finally{
   gl.bufferData=bufferData;
   g.state.warming=warming;
   if(!kill)g.Debug.Mouse(2,false);
  }
  const ads=g.player.ads;
  return {actionMs,firstFrameMs:frames[0],maxMs:Math.max(...frames),ads,dead:target?!target.alive:null,wounds:target?.actor.woundBlood?.count,largeUploads,
   prepassBatchPrimed:g.state.actorShaderWarm.prepassBatchPrimed,
   prepassBatchMembers:g.prepassStaticBatch.stats.members,
   prewarmedBloodDrops:g.state.actorShaderWarm.bloodDrops,
   late:g.renderer.info.programs.filter(p=>!known.has(p.cacheKey)).map(p=>p.name||p.cacheKey),
   renderSize:[g.post.width,g.post.height,g.post.outputWidth,g.post.outputHeight],quality:g.graphics.profile};
 },kill);
}
async function Ready(){
 await page.waitForFunction(()=>{const g=document.querySelector(".lfPlayHost iframe")?.contentWindow.Tengxian;return g?.state.running&&g.Debug.EncounterPlay?.State().ready;},null,{timeout:180000});
 await page.locator(".lfPlayLoading").waitFor({state:"hidden",timeout:30000});
 return page.frames().find(f=>f.url().includes("encounterPlay=1"));
}
async function CheckSpeech(frame){
 const result=await frame.evaluate(()=>{
  const g=Tengxian,api=g.Debug.EncounterPlay,player=g.player;
  const saved={position:player.position.toArray(),yaw:player.yaw,pitch:player.pitch,warming:g.state.warming};
  window.speechTestSaved=saved;g.state.warming=true;
  const info=api.State().actors.find(actor=>actor.id==="luo"),soldier=g.ai.soldiers.find(s=>s.id===info.soldierId);
  let found=null;
  for(const [dx,dz] of [[-4,0],[4,0],[0,4],[0,-4]]){
   const p=soldier.position;
   player.position.set(p.x+dx,g.battlefield.GroundHeight(p.x+dx,p.z+dz),p.z+dz);
   player.body.Teleport(...player.position.toArray());player.velocity.set(0,0,0);
   player.yaw=Math.atan2(dx,dz);player.pitch=0;player.aimYaw=0;player.aimPitch=0;
   g.StepFrames(1,0,true);
   found=api.State().dialogue.bubbles[0]?.find(line=>line.actorId==="luo");
   if(found)break;
  }
  return {found,state:api.State().dialogue,size:[innerWidth,innerHeight]};
 });
 assert.ok(result.found,"An unobstructed live leader renders a head-anchored Play bubble: "+JSON.stringify(result));
 for(const value of result.found.anchor)assert.ok(Number.isFinite(value));
 assert.ok(result.found.box[0]>=0&&result.found.box[0]+result.found.box[2]<=result.size[0]);
 await page.screenshot({path:path.join(out,"PlayDialogueBillboard.png"),timeout:120000});
 try{
  await frame.evaluate(()=>{Tengxian.player.yaw+=Math.PI;Tengxian.StepFrames(1,0,true);});
  assert.ok(await frame.locator(".encounterDialogue").isVisible(),"Off-screen leaders fall back to a readable subtitle");
  assert.match(await frame.locator(".encounterDialogue").textContent(),/北侧门口/);
  assert.ok(!(await State()).dialogue.bubbles[0]?.some(line=>line.actorId==="luo"),"A speaker behind the camera has no false billboard");
  await page.screenshot({path:path.join(out,"PlayDialogueFallback.png"),timeout:120000});
 }finally{
  await frame.evaluate(()=>{
   const g=Tengxian,saved=window.speechTestSaved;
   g.player.position.fromArray(saved.position);g.player.body.Teleport(...saved.position);
   g.player.yaw=saved.yaw;g.player.pitch=saved.pitch;g.StepFrames(1,0,true);g.state.warming=saved.warming;
   delete window.speechTestSaved;
  });
 }
}
try{
 await SavedDebugOptions(true);
 await page.goto(base+"/Taierzhuang1938/AdvancedTools/Tool_LevelFlow.html?t=0");
 await page.waitForFunction(()=>window.LevelFlow,null,{timeout:180000});
 const profilerButton=page.getByRole("button",{name:"Profiler",exact:true});
 const frameDebuggerButton=page.getByRole("button",{name:"Frame Debugger",exact:true});
 assert.ok(await profilerButton.isEnabled()&&await frameDebuggerButton.isEnabled(),"Debug tools can target the editor before Play");
 const [previewDebuggerWindow]=await Promise.all([context.waitForEvent("page",{timeout:15000}),frameDebuggerButton.click()]);
 await previewDebuggerWindow.getByRole("heading",{name:"Frame Debugger"}).waitFor();
 assert.ok(await page.locator("#playGame").isDisabled(),"Opening movie cannot be played");
 assert.equal(await page.evaluate(()=>LevelFlow.Play.Start("current")),false);
 await page.evaluate(()=>{LevelFlow.Seek(222);LevelFlow.SetLayout(3);});
 const before=await page.evaluate(()=>({time:LevelFlow.Inspect().time,document:JSON.stringify(LevelFlow.Inspect().document),viewports:LevelFlow.Inspect().viewports}));
 const coldAt=performance.now();
 await Promise.all([previewDebuggerWindow.waitForEvent("close",{timeout:15000}),page.locator("#playGame").click()]);
 let frame=await Ready();const coldMs=performance.now()-coldAt;
 let state=await State();const hostId=state.hostId;
 assert.equal(state.startBeat,"03b");assert.equal(state.layout,1);
 await frame.evaluate(async()=>{
  const {BlockoutPuppets}=await import('./Script_EditorBlockoutPuppets.mjs');
  const previous=BlockoutPuppets.prototype._Pose;
  BlockoutPuppets.prototype._Pose=function(puppet,...args){if(puppet.unit.id==='player')window.observerProxy=puppet;return previous.call(this,puppet,...args);};
  try{Tengxian.StepFrames(1,1/60,false);}finally{BlockoutPuppets.prototype._Pose=previous;}
 });
 const singleProxy=await frame.evaluate(()=>{
  const actor=observerProxy.humans[0].actor,previous=actor.Update;let calls=0;
  actor.Update=function(...args){calls++;return previous.apply(this,args);};
  try{Tengxian.StepFrames(8,1/60,false);return {calls,attached:!!actor.root.parent};}finally{actor.Update=previous;}
 });
 assert.deepEqual(singleProxy,{calls:0,attached:false},'Single view retains its prewarmed observer proxy without animation or scene traversal');
 const firstAim=await FirstUse(frame);
 assert.ok(firstAim.ads>.9,"The first ADS uses real held mouse input");
 assert.ok(firstAim.prewarmedBloodDrops>0,"Blood warmup must emit actual particles from the active player camera");
 assert.deepEqual(firstAim.late,[],"First ADS must reuse linked programs");
 assert.ok(firstAim.prepassBatchMembers>0,"Static terrain batches are populated before controls are released");
 assert.deepEqual(firstAim.largeUploads,[],"First ADS must not allocate large terrain vertex/index buffers");
 assert.ok(firstAim.renderSize[1]>144&&firstAim.renderSize[3]>144,"Full render dimensions are restored before Play");
 await CheckDebugOptions(frame,true);
 await frame.evaluate(keys=>{
  for(const key of keys)Tengxian.Debug.SetDebugOption(key,false);
  Tengxian.Debug.SetDebugOption("invincible",true);
 },debugKeys);
 assert.ok(state.actors.some(a=>a.model==="luo"));
 assert.ok(await page.locator("#playGuidePane").isVisible(),"Play mode defaults right sidebar to the 2D tactical guide");
 assert.ok(await page.locator("#playStatus").isVisible());
 assert.ok(await page.locator("#playGuideMap").isVisible(),"Play mode renders the editor-side 2D minimap");
 assert.ok(await page.locator("#playDialogueLog").isVisible(),"Play mode shows the live dialogue history dock");
 const playGuide=await page.evaluate(()=>LevelFlow.Play.Guide());
 assert.ok(playGuide?.active&&playGuide.mapDraw?.hasPlayerCone&&playGuide.mapDraw?.hasTargetMarker,"2D minimap draws live player facing cone and mission objective marker");
 assert.ok(playGuide.entities.some(e=>e.side==="friend")&&playGuide.entities.some(e=>e.side==="player"),"2D minimap tracks player and allies with live positions and headings");
 assert.ok(playGuide.dialogue.totalLines>0,"Play dialogue history captures active in-game instructions and dialogue");
 await page.click('[data-play-tab="dialogue"]');
 assert.ok(await page.locator("#playDialoguePane").isVisible(),"Dialogue history tab opens full scrollable log");
 await page.click('[data-play-tab="script"]');
 assert.ok(await page.locator("#scriptPane").isVisible(),"Original script tab remains accessible during Play");
 await page.click('[data-play-tab="guide"]');
 assert.ok(await page.locator("#playGuidePane").isVisible());
 assert.equal(await frame.locator(".encounterPlayHud").count(),0);
 assert.equal(await frame.locator(".encounterHint").count(),0);
 assert.equal(await frame.locator(".hudObjective").isVisible(),false);
 assert.equal(await frame.locator(".hudHint").isVisible(),false);
 assert.ok(state.dialogue.lines.some(line=>line.order&&/北侧门口/.test(line.text)),"The current gate has a persistent text direction without voice audio");
 await CheckSpeech(frame);
 await frame.waitForFunction(()=>Tengxian.audio.musicBuffers.has(Tengxian.audio.musicCue),null,{timeout:60000});
 const ammo=await frame.evaluate(()=>{const g=Tengxian,before=g.state.ammo;g.Debug.Fire();return {before,after:g.state.ammo};});
 assert.ok(ammo.after<ammo.before);
 const firstKill=await FirstUse(frame,true);
 assert.ok(firstKill.dead&&firstKill.wounds>0,"First lethal bullet retains wounds and the real death chain");
 assert.deepEqual(firstKill.late,[],"First lethal hit, blood and corpse frames must reuse linked programs");
 assert.deepEqual(firstKill.largeUploads,[],"The settling frames after the first kill must not upload cold terrain buffers");
 await fs.writeFile(path.join(out,"Data_FirstUse.json"),JSON.stringify({coldMs,firstAim,firstKill},null,2));
 await page.locator("#toggleTimeline").click();
 assert.equal(await page.locator("#flowTimeline").isVisible(),false,"Timeline can be hidden during Play");
 await page.locator("#toggleTimeline").click();
 assert.equal(await page.locator("#flowTimeline").isVisible(),true,"The timeline window can restore its inert Play content");
 await page.locator("#toggleTimeline").click();
 // Returning from the timeline window uses the normal game click to reacquire its fake lock.
 await frame.locator("canvas").first().click();
 const resizedAim=await FirstUse(frame);
 assert.ok(resizedAim.ads>.9,"Aiming still works after resizing the running Play viewport");
 await frame.evaluate(()=>Tengxian.Debug.Throw("Grenade",.2));
 await page.locator("#pauseGame").click();
 await frame.waitForFunction(()=>Tengxian.audio.ctx.state==="suspended");
 const frozen=await frame.evaluate(()=>({elapsed:Tengxian.Debug.EncounterPlay.State().elapsed,positions:Tengxian.ai.soldiers.map(s=>s.position.toArray()),fuses:Tengxian.combat.projectiles.map(p=>p.fuse)}));
 await page.waitForTimeout(600);
 assert.deepEqual(await frame.evaluate(()=>({elapsed:Tengxian.Debug.EncounterPlay.State().elapsed,positions:Tengxian.ai.soldiers.map(s=>s.position.toArray()),fuses:Tengxian.combat.projectiles.map(p=>p.fuse)})),frozen);
 assert.equal(await page.locator("#pauseGame").getAttribute("aria-pressed"),"true");
 await page.locator("#playGame").click();
 await frame.waitForFunction(previous=>Tengxian.Debug.EncounterPlay.State().elapsed>previous,frozen.elapsed);
 assert.equal((await State()).hostId,hostId);
 await frame.waitForFunction(()=>Tengxian.Debug.EncounterPlay.State().actors.filter(a=>a.group==="Fork").length===5);
 await frame.evaluate(()=>{
  const actors=Tengxian.Debug.EncounterPlay.State().actors.filter(a=>a.group==="Fork");
  for(const a of actors){const s=Tengxian.ai.soldiers.find(s=>s.id===a.soldierId);s.health=1e9;}
  for(const a of actors.slice(0,4))Tengxian.ai.soldiers.find(s=>s.id===a.soldierId).Kill();
  Tengxian.StepFrames(3,1/60,false);
 });
 assert.equal((await State()).beat,"03b","Four deaths cannot clear a five-person encounter");
 assert.equal(await page.locator("#flowSeek").inputValue(),String(BeatById("03b").start));
 await frame.evaluate(()=>{
  const a=Tengxian.Debug.EncounterPlay.State().actors.find(a=>a.group==="Fork"&&a.alive);
  Tengxian.ai.soldiers.find(s=>s.id===a.soldierId).Kill();Tengxian.StepFrames(3,1/60,false);
 });
 await page.waitForFunction(t=>Number(document.getElementById("flowSeek").value)===t,BeatById("03c").start);
 assert.equal((await State()).beat,"03c");
 await page.selectOption("#viewportLayout","2");await frame.waitForFunction(()=>Tengxian.Debug.EncounterPlay.State().layout===2);
 const dualProxy=await frame.evaluate(()=>{
  const actor=observerProxy.humans[0].actor,previous=actor.Update;let calls=0;
  actor.Update=function(...args){calls++;return previous.apply(this,args);};
  try{Tengxian.StepFrames(8,1/60,false);return {calls,attached:!!actor.root.parent,position:actor.root.position.distanceTo(Tengxian.player.position)};}finally{actor.Update=previous;}
 });
 assert.ok(dualProxy.calls>0&&dualProxy.attached&&dualProxy.position<.1,'Dual view restores and updates the same player proxy at the current position');
 await page.screenshot({path:path.join(out,"PlayDual.png"),timeout:120000});
 await frame.evaluate(()=>Tengxian.Debug.Key("KeyO"));
 const eyeBefore=(await State()).view.camera;
 await frame.locator(".encounterObserver canvas").focus();await page.keyboard.down("w");await frame.evaluate(()=>Tengxian.StepFrames(12,1/60,false));await page.keyboard.up("w");
 assert.ok((await State()).view.camera.some((n,i)=>Math.abs(n-eyeBefore[i])>.2));
 await frame.evaluate(()=>{Tengxian.Debug.Key("KeyO");const g=Tengxian;g.player.position.set(30,g.battlefield.GroundHeight(30,66.8),66.8);g.player.body.Teleport(...g.player.position.toArray());g.StepFrames(3,1/60,false);});
 assert.equal((await State()).beat,"03d","Entering the area advances the stage");
 assert.ok((await State()).dialogue.lines.some(line=>line.order&&/脚边有雷/.test(line.text)));
 await frame.evaluate(()=>Tengxian.Debug.Key("KeyF"));
 assert.equal((await State()).beat,"03d","The throw must actually finish");
 await frame.evaluate(()=>Tengxian.StepFrames(1,1/60,true));
 assert.ok((await State()).dialogue.lines.some(line=>line.order&&/等它炸/.test(line.text)),"The real throw updates the instruction while waiting for its explosion");
 for(let i=0;i<20&&!(await State()).completedBeats.includes("03d");i++)await frame.evaluate(()=>Tengxian.StepFrames(30,1/60,false));
 assert.ok((await State()).completedBeats.includes("03d"),"Real grenade detonation satisfies the event gate");
 await page.locator("#pauseGame").click();
 const [profilerWindow]=await Promise.all([context.waitForEvent("page",{timeout:15000}),profilerButton.click()]);
 await profilerWindow.locator("body.uiProfiler").waitFor();
 const [frameDebuggerWindow]=await Promise.all([context.waitForEvent("page",{timeout:15000}),frameDebuggerButton.click()]);
 await frameDebuggerWindow.getByRole("heading",{name:"Frame Debugger"}).waitFor();
 assert.ok(await frame.evaluate(()=>Tengxian.editor.overlays.get("frameDebugger")?.debugger===Tengxian.FrameDebugger),"Frame Debugger targets this Play renderer");
 await frameDebuggerWindow.locator("#capture").click();
 await frameDebuggerWindow.waitForFunction(()=>Array.from(document.querySelectorAll("#events > .node > .row .label")).filter(node=>node.textContent.startsWith("视口 ")).length===2,null,{timeout:60000});
 assert.deepEqual(await frame.evaluate(()=>Tengxian.FrameDebugger.capture.passes.filter(pass=>pass.viewport).map(pass=>pass.name)),["视口 1 · 玩家视角","视口 2 · 观察视角"]);
 await frameDebuggerWindow.locator("#resume").click();
 assert.deepEqual(await frame.evaluate(()=>Tengxian.Debug.DebugTools().filter(tool=>tool.on&&["profiler","frameDebugger"].includes(tool.id)).map(tool=>tool.id).sort()),["frameDebugger","profiler"]);
 const openPageCount=context.pages().length;
 await profilerButton.click();
 assert.equal(context.pages().length,openPageCount,"Repeated click focuses the existing tool window");
 assert.ok(!profilerWindow.isClosed(),"Repeated click keeps the existing Profiler window open");
 await page.screenshot({path:path.join(out,"PlayDebugToolbar.png"),timeout:120000});
 await Promise.all([profilerWindow.waitForEvent("close",{timeout:15000}),frameDebuggerWindow.waitForEvent("close",{timeout:15000}),page.locator("#stopGame").click()]);
 assert.ok(await profilerButton.isEnabled()&&await frameDebuggerButton.isEnabled(),"Stop closes Play debug windows and restores the editor launchers");
 assert.equal(await page.locator("#flowTimeline").isVisible(),false,"Stopping Play keeps the chosen timeline visibility");
 await page.locator("#toggleTimeline").click();
 assert.equal(await page.locator(".lfPlayHost").count(),0);
 const dormant=await page.evaluate(()=>{const g=document.querySelector(".lfPlayCache iframe").contentWindow.Tengxian;return {running:g.state.running,soldiers:g.ai.soldiers.length,projectiles:g.combat.projectiles.length,elapsed:g.state.elapsed,frames:g.renderer.info.render.frame};});
 assert.deepEqual(await page.evaluate(()=>document.querySelector(".lfPlayCache iframe").contentWindow.Tengxian.Debug.EncounterPlay.State().dialogue.lines),[],"Stop clears the previous dialogue before caching the host");
 await page.waitForTimeout(400);
 const dormantAgain=await page.evaluate(()=>{const g=document.querySelector(".lfPlayCache iframe").contentWindow.Tengxian;return {running:g.state.running,soldiers:g.ai.soldiers.length,projectiles:g.combat.projectiles.length,elapsed:g.state.elapsed,frames:g.renderer.info.render.frame};});
 assert.deepEqual(dormantAgain,dormant);assert.equal(dormant.soldiers,0);assert.equal(dormant.projectiles,0);assert.equal(dormant.running,false);
 const restored=await page.evaluate(()=>({time:LevelFlow.Inspect().time,document:JSON.stringify(LevelFlow.Inspect().document),count:LevelFlow.Inspect().viewports.count}));
 assert.equal(restored.time,before.time);assert.equal(restored.document,before.document);assert.equal(restored.count,3);
 await SavedDebugOptions(true);
 const warmAt=performance.now();await page.locator("#playGame").click();frame=await Ready();const warmMs=performance.now()-warmAt;
 state=await State();assert.equal(state.hostId,hostId);assert.equal(state.startBeat,"03b");assert.ok(!state.dead.some(id=>id.startsWith("Fork_")));
 assert.equal(await frame.evaluate(()=>Tengxian.state.ammo),ammo.before);
 assert.deepEqual(await frame.evaluate(()=>({health:Tengxian.player.health,grenades:Tengxian.state.grenades,bundles:Tengxian.state.bundles})),{health:100,grenades:3,bundles:2});
 await CheckDebugOptions(frame,true);
 console.log(JSON.stringify({coldMs,warmMs,warm:await frame.evaluate(()=>Tengxian.state.actorShaderWarm)}));
 assert.ok(warmMs<coldMs*.6&&warmMs<12000,"Repeated Play reuses its warmed host");
 await page.locator("#stopGame").click();
 await SavedDebugOptions(false);
 await page.evaluate(time=>LevelFlow.Seek(time),BeatById("05b").start);
 await page.locator("#playGame").click();frame=await Ready();
 await CheckDebugOptions(frame,false);
 await frame.evaluate(()=>{Tengxian.state.ammo=5;Tengxian.player.health=100;Tengxian.player.bleeding=0;Tengxian.player.wounds.length=0;});
 const distantWarm=await frame.evaluate(()=>({distance:Math.hypot(Tengxian.player.position.x,Tengxian.player.position.z),warm:Tengxian.state.actorShaderWarm}));
 assert.ok(distantWarm.distance>100&&distantWarm.warm.bloodDrops>0,"A distant checkpoint warms blood from its own camera position");
 await page.screenshot({path:path.join(out,"PlayMarchStart.png"),timeout:120000});
 const checkpoint=await frame.evaluate(()=>({ammo:Tengxian.state.ammo,clips:Tengxian.state.clips,grenades:Tengxian.state.grenades,
   health:Tengxian.player.health,actors:Tengxian.Debug.EncounterPlay.State().actors.map(actor=>actor.id).sort()}));
 const KillPlayer=()=>frame.evaluate(()=>{
   const g=Tengxian;
   g.Debug.Throw("Grenade",30);
   g.state.ammo=0;g.player.health=1;g.player.spawnGrace=0;g.player.SetDebugOptions({invincible:false});
   g.player.TakeHit(1000,"head",null,{bullet:true});g.StepFrames(2,1/60,false);
   return {alive:g.player.Alive,state:g.Debug.EncounterPlay.State()};
 });
 const death=await KillPlayer();assert.equal(death.alive,false);assert.ok(death.state.failed);
 assert.deepEqual(death.state.dialogue.lines,[],"Death clears the live instruction");
 await page.waitForFunction(()=>LevelFlow.Play.State().state.failed);
 assert.ok(await page.locator("#playGame").isEnabled(),"Death exposes a toolbar retry");
 assert.match(await page.locator("#playStatus").textContent(),/R.*重来/);
 assert.equal(await frame.locator(".encounterFailure").isVisible(),false,"The failure card waits for the death collapse");
 const collapse=await frame.evaluate(()=>{
   const g=Tengxian,Eye=()=>g.camera.getWorldPosition(g.camera.position.clone()).y,start=Eye();
   g.StepFrames(150,1/60,false);
   const card=document.querySelector(".encounterFailure"),settled=g.player.deadTime;
   g.StepFrames(30,1/60,false);
   return {dropM:start-Eye(),settled,frozen:g.player.deadTime===settled,shown:!card.hidden,text:card.textContent};
 });
 assert.ok(collapse.dropM>.5,"Death plays the first-person collapse before Play freezes");
 assert.ok(collapse.frozen,"Play freezes once the collapse settles");
 assert.ok(collapse.shown&&/阵亡/.test(collapse.text)&&/R.*重来/.test(collapse.text),"The play viewport itself states the death and the retry key");
 await page.screenshot({path:path.join(out,"PlayDeathRetry.png"),timeout:120000});
 await SavedDebugOptions(true);
 await frame.locator("body").focus();await page.keyboard.press("r");
 await frame.waitForFunction(()=>Tengxian.player.Alive&&!Tengxian.Debug.EncounterPlay.State().failed);
 const RetryState=()=>frame.evaluate(()=>({ammo:Tengxian.state.ammo,clips:Tengxian.state.clips,grenades:Tengxian.state.grenades,
   health:Tengxian.player.health,actors:Tengxian.Debug.EncounterPlay.State().actors.map(actor=>actor.id).sort()}));
 assert.deepEqual(await RetryState(),checkpoint,"Keyboard retry restores the current checkpoint and supplies");
 assert.equal(await frame.locator(".encounterFailure").isVisible(),false,"Retry clears the failure card");
 await CheckDebugOptions(frame,true);
 await frame.evaluate(keys=>{for(const key of keys)Tengxian.Debug.SetDebugOption(key,false);},debugKeys);
 assert.equal((await State()).hostId,hostId);assert.equal((await State()).startBeat,"05b");
 assert.equal(await frame.evaluate(()=>Tengxian.combat.projectiles.length),0);
 assert.equal(await frame.evaluate(()=>Tengxian.viewmodel.deathHands),null);
 const MoveAfterRetry=async()=>{
   const before=await frame.evaluate(()=>Tengxian.player.position.toArray());
   await frame.locator("body").focus();await page.keyboard.down("w");
   await frame.evaluate(()=>Tengxian.StepFrames(24,1/60,false));await page.keyboard.up("w");
   const after=await frame.evaluate(()=>Tengxian.player.position.toArray());
   assert.ok(Math.hypot(after[0]-before[0],after[2]-before[2])>.2,"Movement resumes after death retry");
 };
 await MoveAfterRetry();
 await KillPlayer();await page.waitForFunction(()=>LevelFlow.Play.State().state.failed);
 await page.locator("#playGame").click();
 await frame.waitForFunction(()=>Tengxian.player.Alive&&!Tengxian.Debug.EncounterPlay.State().failed);
 assert.deepEqual(await RetryState(),checkpoint,"Toolbar retry restores the same checkpoint");
 await MoveAfterRetry();
 await KillPlayer();await page.waitForFunction(()=>LevelFlow.Play.State().state.failed);
 await page.locator("#playGame").focus();await page.keyboard.press("r");
 await frame.waitForFunction(()=>Tengxian.player.Alive&&!Tengxian.Debug.EncounterPlay.State().failed);
 assert.deepEqual(await RetryState(),checkpoint,"R also retries when the outer toolbar owns focus");
 await page.screenshot({path:path.join(out,"PlayDeathRecovered.png"),timeout:120000});
 const nextArea=new EncounterPlayPlan(JSON.parse(before.document),BeatById("05b").start).Area().center;
 await frame.evaluate(point=>{
   const g=Tengxian;g.state.ammo=3;g.Debug.Key(g.Debug.SlotKey("melee"));
   g.player.position.set(point[0],g.battlefield.GroundHeight(...point),point[1]);
   g.player.body.Teleport(...g.player.position.toArray());g.StepFrames(3,1/60,false);
 },nextArea);
 assert.equal((await State()).beat,"05c","Actual arrival advances to the next checkpoint");
 assert.equal(await frame.evaluate(()=>Tengxian.state.activeSlot),"melee");
 await KillPlayer();await page.waitForFunction(()=>LevelFlow.Play.State().state.failed);
 await page.locator("#playGame").click();
 await frame.waitForFunction(()=>Tengxian.player.Alive&&!Tengxian.Debug.EncounterPlay.State().failed);
 assert.equal((await State()).startBeat,"05c","Retry uses the current beat after continuous progression");
 const restoredSlots=await frame.evaluate(()=>Tengxian.Debug.Slots());
 assert.equal(restoredSlots.active,"melee");assert.equal(restoredSlots.weapon,"Dadao");
 assert.equal(restoredSlots.viewmodel,"Dadao");assert.equal(restoredSlots.mags.primary.ammo,3);
 await page.locator("#stopGame").click();
 assert.equal(await page.evaluate(()=>LevelFlow.Inspect().time),BeatById("05b").start);
 await page.evaluate(time=>LevelFlow.Seek(time),BeatById("08g").start);
 await page.locator("#playGame").click();frame=await Ready();
 await KillPlayer();await page.waitForFunction(()=>LevelFlow.Play.State().state.failed);
 await frame.locator("body").focus();await page.keyboard.press("r");
 await frame.waitForFunction(()=>Tengxian.player.Alive&&!Tengxian.Debug.EncounterPlay.State().failed);
 assert.equal((await State()).startBeat,"08g","Retry skips the nonplayable 08F cinematic checkpoint");
 await page.locator("#stopGame").click();
 await page.evaluate(()=>LevelFlow.Seek(0));assert.ok(await page.locator("#playGame").isDisabled());
 await page.selectOption("#playGameStart","beginning");await page.locator("#playGame").click();frame=await Ready();
 state=await State();assert.equal(state.startBeat,"02g");assert.ok(!state.dead.includes("opening4"));
 assert.ok(state.actors.some(a=>a.id==="opening4"&&a.alive));
 await page.screenshot({path:path.join(out,"PlayBattleStart.png"),timeout:120000});
 await page.locator("#stopGame").click();
 await page.selectOption("#playGameStart","current");await page.evaluate(time=>LevelFlow.Seek(time),BeatById("08f").start);
 assert.ok(await page.locator("#playGame").isDisabled());assert.equal(await page.evaluate(()=>LevelFlow.Play.Start("current")),false);
 const southernStarts=[];
 for(const beat of ["11f","12b","13d","18f"]) {
   await page.evaluate(beat=>LevelFlow.JumpBeat(beat),beat);
   assert.ok(await page.locator("#playGame").isEnabled(),beat+" has a playable keyframe");
   await page.locator("#playGame").click();frame=await Ready();
   const start=await State();assert.equal(start.startBeat,beat);
   const position=await frame.evaluate(()=>Tengxian.player.position.toArray());
   assert.ok(position[2]>1000,"the full southern scene loads beyond the former z560 boundary");
   const lighting=await frame.evaluate(()=>({state:Tengxian.Debug.Lighting.State(),output:Tengxian.Debug.Lighting.Output()}));
   if(beat!=="18f") {
     assert.equal(lighting.state.clock.hour,17.5,"southern keyframes start at dusk");
     assert.ok(Math.abs(lighting.output.sunElevation-8)<0.01&&lighting.state.components.Sun.transition===1,"the local dusk is settled before Play becomes ready");
   } else assert.ok(lighting.state.clock.hour>21&&lighting.output.profile==="firstLevelNight","bridge demolition has reached night lighting");
   assert.ok(start.actors.some(actor=>actor.id==="luo"),"southern scene uses the real cast");
   if(beat==="18f") {
     const river=await frame.evaluate(()=>{
       const mesh=Tengxian.scene.getObjectByName("SandRiverSurface");
       const position=mesh?.geometry.getAttribute("position");
       return {visible:mesh?.visible,vertices:position?.count,triangles:mesh?.geometry.index?.count/3};
     });
     assert.ok(river.visible && river.vertices>1000 && river.triangles>1000,
       "the railway bridge view in Play has one connected shallow-water mesh");
   }
   if(beat==="12b") {
     const cast=await frame.evaluate(()=>Tengxian.Debug.EncounterPlay.Presentation());
     assert.ok(cast.find(actor=>actor.id==="erya").humans.includes("erya"),"Er Ya uses her approved model");
     assert.ok(cast.find(actor=>actor.id==="tian").humans.includes("tianSao"),"Tian Sao uses her approved model");
   }
   southernStarts.push({beat,position,ready:start.ready});
   if(beat==="13d"||beat==="18f") {
     await frame.evaluate(()=>{Tengxian.player.SetDebugOptions({invincible:true});Tengxian.Debug.Key("KeyF");Tengxian.StepFrames(3,1/60,false);});
     const after=await State();
     assert.ok(after.signals.includes(beat==="13d"?"PlankBridgeRemoved":"BridgeBlown"),beat+" interaction changes the actual scene event");
     if(beat==="18f") assert.equal(after.completed,true);
   }
   await page.screenshot({path:path.join(out,"PlayBeishahe"+beat.toUpperCase()+".png"),timeout:120000});
   await page.locator("#stopGame").click();
   assert.equal(await page.evaluate(()=>LevelFlow.Inspect().beat),beat,"Stop restores the southern editing keyframe");
 }
 assert.deepEqual(errors,[]);
 await fs.writeFile(path.join(out,"Data_PlayAcceptance.json"),JSON.stringify({coldMs,warmMs,firstAim,firstKill,distantWarm,hostId,errors,checkpoint,restoredSlots,southernStarts,
   checks:"saved debug options on first Play, cached restart and death retry; camera sections disabled; live event gates; stepped timeline; sidebar hints; pause/resume; clean cached stop; death retry by keyboard and toolbar; outer R; continued movement; current-beat checkpoint; melee and stored ammo restoration; cinematic checkpoint skipped; first ADS and lethal hit reuse linked programs at full resolution"},null,2));
 console.log("ok  Saved debug options, Play controls, death retry, current checkpoint inventory, event-driven timeline, skipped cinematics and state reset; first "+(coldMs/1000).toFixed(2)+" s, repeat "+(warmMs/1000).toFixed(2)+" s");
}catch(error){
 console.log(JSON.stringify(await page.evaluate(()=>({status:document.getElementById("playStatus")?.textContent,loading:document.querySelector(".lfPlayLoading")?.textContent,state:window.LevelFlow?.Play.State()})).catch(()=>null)));
 throw error;
}finally{await browser.close();if(server)await new Promise(r=>server.close(r));}
