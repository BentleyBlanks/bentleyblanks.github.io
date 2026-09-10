// Normal opening input route. Never jumps stages, writes mission facts, player
// coordinates, health, enemy health, ammunition, or invincibility settings.
// Debug.Look is the project's pointer-lock-free mouse delta input adapter.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {LaunchBrowser} from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import {ServeRoot} from "./Script_DevServer.mjs";
import {OPENING} from "./Data_FirstLevelOpening.mjs";
const here=path.dirname(fileURLToPath(import.meta.url));
export async function PlayFirstLevelOpening(page,{out=path.join(here,"_shots/FirstLevelOpening/InputRun"),realtime=false,audioClock=false,from="Train",through="Handover",mount=true}={}){
await fs.mkdir(out,{recursive:true});
const errors=[],trace=[];let whisperCaptured=false;
page.on("pageerror",error=>{errors.push(String(error));console.log("PAGEERROR",String(error));});
async function Capture(name){
  if(!realtime)await page.evaluate(()=>window.Tengxian.StepFrames(1,1/60,true));
  await page.screenshot({path:path.join(out,`Scene_${name}.png`)});
  const state=await page.evaluate(()=>({mission:window.Tengxian.Debug.FirstLevelMission(),position:window.Tengxian.player.position.toArray(),health:window.Tengxian.player.health}));
  await fs.writeFile(path.join(out,`Data_${name}.json`),JSON.stringify(state,null,2));
  if(name==="TrainExit"||name==="Failure"){
    const physics=await page.evaluate(()=>{
      const g=window.Tengxian,p=g.player.position,f=g.battlefield,ph=f.physics;
      ph.controller.computeColliderMovement(g.player.body.collider,{x:.05,y:-.005,z:0});
      const hits=[];for(let i=0;i<ph.controller.numComputedCollisions();i++){const hit=ph.controller.computedCollision(i);hits.push({normal:hit.normal1,point:hit.witness1,record:ph.recordByHandle.get(hit.collider.handle),position:hit.collider.translation(),groups:hit.collider.collisionGroups(),handle:hit.collider.handle});}
      return {hits,movement:ph.controller.computedMovement(),stance:g.player.stance,bodyPosition:g.player.body.body.translation(),nearby:f.colliders.filter(b=>b.min[0]<p.x+2&&b.max[0]>p.x-2&&b.min[2]<p.z+2&&b.max[2]>p.z-2).map(b=>({c:b.c,h:b.h,tag:b.tag,handle:b._physicsHandle,actual:ph.world.getCollider(b._physicsHandle)?.translation()})),
        gates:[...f.gates].map(([id,v])=>({id,open:v.open,c:v.collider.c,handle:v.collider._physicsHandle})),
        derail:f.derailMeshes.map(m=>{m.geometry.computeBoundingBox();m.updateMatrixWorld(true);return {min:m.geometry.boundingBox.clone().applyMatrix4(m.matrixWorld).min,max:m.geometry.boundingBox.clone().applyMatrix4(m.matrixWorld).max}})};
    });
    await fs.writeFile(path.join(out,`Data_Physics${name}.json`),JSON.stringify(physics,null,2));
  }
}
async function Drive(label,points,{fight=false,until=null,seconds=120}={}){
  await page.evaluate(points=>{window.OpeningInput.points=points;window.OpeningInput.index=0},points);
  let result;
  for(let secondsDone=0;secondsDone<seconds;secondsDone+=realtime?.25:2){
    if(realtime){await page.evaluate(fight=>{window.OpeningInput.fight=fight},fight);await page.waitForTimeout(250);}
    result=await page.evaluate(({fight,until,realtime})=>{
      const g=window.Tengxian,b=window.OpeningInput;
      for(let i=0;!realtime&&i<120&&g.player.alive&&!g.Debug.FirstLevelMissionRuntime().failed;i++){
        b.Step(fight);
        g.StepFrames(1,1/60,false);
        if(until&&g.Debug.FirstLevelMissionRuntime().Has(until))break;
      }
      if(!realtime)g.StepFrames(1,1/60,true);
      const r=g.Debug.FirstLevelMissionRuntime();
      return {t:r.time,stage:r.flow.stage.id,index:b.index,points:b.points.length,position:g.player.position.toArray(),health:g.player.health,alive:g.player.alive&&!r.failed,
        ready:until?r.Has(until):b.index===b.points.length,shots:g.state.playerShots,ammo:g.state.ammo,remaining:r.flow.State().remaining,foe:b.foe,
        npc:r.squad.map(a=>({id:a.castId,health:a.health,essential:!!a.scriptEssential,p:a.position.toArray(),goal:a.goal.toArray()})),voicePlaying:!!r.voice.current,voiceCue:r.voice.current?.cue?.id,opening:r.opening.State()};
    },{fight,until,realtime});
    trace.push({label,...result});
    if(!whisperCaptured&&result.voiceCue==="EscapeWhisper"){
      whisperCaptured=true;
      for(let i=0;i<120;i++){
        await page.evaluate(realtime=>{
          const g=window.Tengxian,a=g.Debug.FirstLevelMissionRuntime().companion.Handle("yaowa");
          if(a){
            const aligned=window.OpeningInput.Look(a.position,1.3);
            g.Debug.Key("KeyS",aligned&&a.position.distanceTo(g.player.position)<2.2);
          }
          if(!realtime)g.StepFrames(1,1/60,true);
        },realtime);
        if(realtime)await page.waitForTimeout(17);
      }
      await page.evaluate(()=>window.Tengxian.Debug.Key("KeyS",false));
      await Capture("EscapeWhisperPlaying");
    }
    if(secondsDone%10===0||result.ready||!result.alive)console.log(label,JSON.stringify(result));
    if(result.ready||!result.alive)break;
    if(audioClock&&result.voicePlaying)await page.waitForTimeout(2000);
  }
  await page.evaluate(()=>{window.OpeningInput.points=[];window.OpeningInput.fight=false;const g=window.Tengxian;g.Debug.Key("KeyW",false);g.Debug.Mouse(0,false);g.Debug.Mouse(2,false)});
  await Capture(label);
  assert.ok(result?.alive,`${label}: player died, actual combat outcome`);
  assert.ok(result.ready,`${label}: failed to progress: ${JSON.stringify(result)}`);
  return result;
}
try{
  await page.evaluate(()=>{
    const g=window.Tengxian,Wrap=a=>Math.atan2(Math.sin(a),Math.cos(a)),Clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
    window.OpeningInput={points:[],index:0,foe:null,
      Look(point,height=0){
        const p=g.player,e=p.EyePosition,y=height?g.battlefield.GroundHeight(point.x,point.z)+height:e.y;
        const yaw=Math.atan2(p.position.x-point.x,p.position.z-point.z),pitch=Math.atan2(y-e.y,Math.hypot(point.x-e.x,point.z-e.z));
        const dyaw=Wrap(yaw-p.yaw-p.aimYaw),dpitch=pitch-p.pitch-p.aimPitch;
        g.Debug.Look(Clamp(-dyaw/.0022,-24,24),Clamp(-dpitch/.0022,-12,12));
        return Math.abs(dyaw)<(height?.01:.12)&&(!height||Math.abs(dpitch)<.01);
      },
      Target(){
        const eye=g.player.EyePosition;
        const stage=g.Debug.FirstLevelMissionRuntime().flow.stage.id;
        const limit=stage==="TrenchEntry"?28:stage==="Support"&&!g.Debug.FirstLevelMissionRuntime().Has("frontReached")?35:85;
        return g.ai.soldiers.filter(a=>a.side==="ija"&&a.alive&&!a.scriptedNoncombatant&&a.position.distanceTo(eye)<limit&&
          (stage!=="TrenchEntry"||a.missionEncounter==="intrusion"))
          .sort((a,b)=>a.position.distanceToSquared(eye)-b.position.distanceToSquared(eye)).find(a=>{
            const to=a.position.clone();to.y+=a.stance===2?.3:a.stance===1?.85:1.2;
            const direction=to.sub(eye),length=direction.length(),hit=g.battlefield.Raycast(eye,direction.normalize(),length,{terrain:true});
            return !hit||hit.t>=length-.25;
          });
      },
      Step(fight){
        const p=g.player;
        while(this.index<this.points.length&&Math.hypot(p.position.x-this.points[this.index].x,p.position.z-this.points[this.index].z)<.85)this.index++;
        const foe=fight?this.Target():null;this.foe=foe?.missionId||null;
        g.Debug.Mouse(0,false);
        if(foe){
          g.Debug.Key("KeyW",false);g.Debug.Mouse(2,true);
          const aligned=this.Look(foe.position,foe.stance===2?.3:foe.stance===1?.85:1.2);
          if(g.state.ammo===0)g.Debug.Key("KeyR");
          else if(aligned)g.Debug.Mouse(0,true);
        }else{
          g.Debug.Mouse(2,false);
          const target=this.points[this.index];
          const aligned=target?this.Look(target):false;
          g.Debug.Key("KeyW",!!target&&aligned);
        }
        if(p.bleeding&&p.health<75)g.Debug.Key("KeyB");
      },
    };
  });
  if(realtime)await page.evaluate(()=>{
    window.OpeningInput.auto=true;
    const Tick=()=>{const b=window.OpeningInput;if(!b.auto)return;b.Step(b.fight);requestAnimationFrame(Tick)};
    requestAnimationFrame(Tick);
  });
  if(["Train","Unloading"].includes(from)){
  await Capture("TrainStart");
  await Drive("Derail",[],{until:"trainDerailed",seconds:55});
  if(through==="Unloading")return;
  await Drive("LuoRescue",[],{until:"luoRescueComplete",seconds:30});
  await Drive("TrainExit",[{x:-74,z:88},{x:-71,z:88},{x:-69,z:78},{x:-68,z:70},{x:-66,z:66}],{seconds:80});
  if(through==="Handover"){
    await page.evaluate(async realtime=>{
      for(let i=0;i<60;i++){
        window.OpeningInput.Look({x:-76,z:74},2.5);
        if(realtime)await new Promise(resolve=>requestAnimationFrame(resolve));
        else window.Tengxian.StepFrames(1,1/60,i===59);
      }
    },realtime);
    await Capture("CarriageWreck");
  }
  if(through==="Exposure"){
    await Drive("ExposedApron",[{x:-55,z:72}],{seconds:35});
    const before=await page.evaluate(()=>window.Tengxian.player.health);
    const evidence=await page.evaluate(()=>{
      const g=window.Tengxian,r=g.Debug.FirstLevelMissionRuntime();
      for(let i=0;i<35*60&&g.player.alive;i++){
        window.OpeningInput.Look({x:-35,z:58},1.3);
        g.StepFrames(1,1/60,i%6===0);
      }
      return {health:g.player.health,alive:g.player.alive,invincible:g.player.debug.invincible,grace:g.player.spawnGrace,
        shooters:[...r.enemies.values()].filter(a=>a.missionEncounter==="surface").map(a=>({id:a.missionId,p:a.position.toArray(),alive:a.alive,stance:a.stance,target:a.target?.isPlayer?"player":a.target?.ref?.missionId||a.target?.id,visible:a.targetVisible,los:!r.BlocksSight(r.Point(a.position,1.3),g.player.EyePosition),aim:a.aimTime,fireTimer:a.fireTimer,ammo:a.ammo,lastFire:a.lastFire,hold:a.missionFireHold,rest:a.missionSurfaceRest})),
        probes:[{x:-55,z:72},{x:-54,z:65},{x:-60,z:78},{x:-60,z:70}].map(p=>({p,y:g.battlefield.GroundHeight(p.x,p.z),los:[...r.enemies.values()].filter(a=>a.missionEncounter==="surface"&&!r.BlocksSight(r.Point(a.position,1.3),r.Point(p,1.65))).map(a=>a.missionId)})),
        fire:r.opening.fireEvents.filter(e=>e.player&&e.encounter==="surface"),position:g.player.position.toArray()};
    });
    await Capture("ExposureOutcome");
    await fs.writeFile(path.join(out,"Data_ExposureOutcome.json"),JSON.stringify({before,...evidence},null,2));
    assert.ok(!evidence.invincible&&evidence.grace<=0&&evidence.fire.length>0&&evidence.health<before,"surface fire really harms an exposed player");
    return evidence;
  }
  if(through==="TrenchEntry"){
    await Drive("ExitOrders",[],{until:"unloadOrdersHeard",seconds:40});
    return;
  }
  }
  await Drive("TrenchContact",OPENING.approachRoute,{fight:true,until:"shelterReached",seconds:180});
  await Drive("ShelterWhisper",[],{until:"supportOrdersHeard",seconds:100});
  await Drive("FrontRifle",[...OPENING.supportRoute,{x:0,z:-124},{x:0,z:-126.5}],{fight:true,until:"zhouGunWounded",seconds:210});
  await Drive("RifleWithdrawal",[],{fight:true,until:"zhouGunWounded",seconds:150});
  await Drive("MachineGunApproach",[{x:0,z:-124},{x:0,z:-127.4}],{seconds:40});
  if(mount){
  // A live nearby grenade can legitimately take F priority for a moment.
  // Release and press again after the current interaction resolves.
  for(let attempt=0;attempt<4;attempt++){
    await page.keyboard.down("f");
    if(realtime)await page.waitForTimeout(750);else await page.evaluate(()=>window.Tengxian.StepFrames(45,1/60,true));
    await page.keyboard.up("f");
    if(await page.evaluate(()=>window.Tengxian.Debug.FirstLevelMissionRuntime().Has("gunOccupied")))break;
    if(realtime)await page.waitForTimeout(300);else await page.evaluate(()=>window.Tengxian.StepFrames(18,1/60,true));
  }
  }
  await Capture("MachineGunHandover");
  const final=await page.evaluate(()=>window.Tengxian.Debug.FirstLevelMission());
  if(mount)assert.ok(final.facts.includes("gunOccupied"),"normal F interaction completes the handover");
  assert.ok(final.facts.includes("rifleWithdrawalResolved")&&final.facts.includes("escapeWhisperHeard"));
  if(from==="Train"){
    assert.ok(!final.log.some(e=>e.kind==="debugJump"));
    assert.ok(final.train.entries.filter(e=>e.alive).every(e=>e.exited&&e.arrived),
      "all surviving original passengers leave the wreck and clear their exit lanes");
    if(realtime||audioClock){
      const cheers=await page.evaluate(()=>window.Tengxian.audio.RequestedCount("amb.carriageRearCheer"));
      assert.equal(cheers,2,"both retained rear-group reactions follow the shortened conversation");
    }
  }
  assert.deepEqual(errors,[]);
  console.log("PASS normal opening input, clear trench, private exchange, rifle retreat and machine gun handover");
  return {final,trace};
}catch(error){await Capture("Failure").catch(()=>{});throw error;}
finally{
  await page.evaluate(()=>{if(window.OpeningInput)window.OpeningInput.auto=false;});
  await fs.writeFile(path.join(out,"Data_Trace.json"),JSON.stringify({trace,errors,realtime},null,2));
}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const realtime=process.argv.includes("--realtime"),server=await ServeRoot(path.resolve(here,".."),0),browser=await LaunchBrowser();
  const exposure=process.argv.includes("--exposure");
  const out=path.join(here,"_shots/FirstLevelOpening",exposure?"ExposureRun":realtime?"RealtimeRun":"InputRun");
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  try{
    await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/?whitebox=p012&${realtime?"menu=0":"shot=1&manual=1"}&quality=low&scale=small`,{timeout:180000});
    await page.waitForFunction(()=>window.Tengxian?.state?.ready,null,{timeout:240000});
    if(realtime){
      await page.locator("#bootStart").click();
      await page.evaluate(()=>{
        const g=window.Tengxian,stream=g.renderer.domElement.captureStream(30);
        const audioTap=g.audio.ctx.createMediaStreamDestination();
        g.audio.softClip.connect(audioTap);
        for(const track of audioTap.stream.getAudioTracks())stream.addTrack(track);
        window.OpeningVideo={chunks:[],audioTap,recorder:new MediaRecorder(stream,{mimeType:"video/webm;codecs=vp9,opus",videoBitsPerSecond:2500000})};
        window.OpeningVideo.recorder.ondataavailable=e=>window.OpeningVideo.chunks.push(e.data);
        window.OpeningVideo.recorder.start(1000);
      });
    }
    await PlayFirstLevelOpening(page,{out,realtime,through:exposure?"Exposure":"Handover"});
  }finally{
    if(realtime){
      const encoded=await page.evaluate(async()=>{
        const v=window.OpeningVideo;if(!v)return null;
        await new Promise(resolve=>{v.recorder.onstop=resolve;v.recorder.stop()});
        window.Tengxian.audio.softClip.disconnect(v.audioTap);
        return await new Promise(resolve=>{const r=new FileReader();r.onload=()=>resolve(r.result.split(",")[1]);r.readAsDataURL(new Blob(v.chunks,{type:"video/webm"}))});
      });
      if(encoded){await fs.mkdir(out,{recursive:true});await fs.writeFile(path.join(out,"Video_NormalOpening.webm"),Buffer.from(encoded,"base64"));}
    }
    await browser.close();await new Promise(resolve=>server.close(resolve));
  }
}
